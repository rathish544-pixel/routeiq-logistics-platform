from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.driver import Driver
from app.models.route import Route
from app.models.route_order import RouteOrder
from app.models.order import Order
from app.schemas.driver import (
    DriverCreate,
    DriverUpdate,
    DriverStatusUpdate,
    generate_driver_code,
    VALID_DRIVER_STATUSES,
)
from app.services.redis_client import set_json
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/drivers", tags=["Drivers"])

# Driver status -> availability synchronisation rules
# (turning a driver offline or idle never happens mid-route by default)
AUTO_AVAILABLE = {"idle"}
AUTO_UNAVAILABLE = {"assigned", "in_transit", "delivering"}


def _serialize(driver: Driver) -> dict:
    return {
        "id": driver.id,
        "driver_code": driver.driver_code,
        "name": driver.name,
        "phone": driver.phone,
        "vehicle_type": driver.vehicle_type,
        "latitude": driver.latitude,
        "longitude": driver.longitude,
        "vehicle_capacity": driver.vehicle_capacity,
        "available": driver.available,
        "status": driver.status,
        "created_at": driver.created_at,
        "updated_at": driver.updated_at,
    }


def _sync_live_location(driver: Driver) -> None:
    # Resilient cache write; safe even when Redis is unavailable.
    set_json(f"driver:{driver.id}:location", {
        "driver_id": driver.id,
        "latitude": driver.latitude,
        "longitude": driver.longitude,
        "recorded_at": "sync",
    })


@router.post("/")
async def create_driver(driver: DriverCreate, db: Session = Depends(get_db)):
    new_driver = Driver(
        driver_code=driver.driver_code,
        name=driver.name,
        phone=driver.phone,
        vehicle_type=driver.vehicle_type,
        latitude=driver.latitude,
        longitude=driver.longitude,
        vehicle_capacity=driver.vehicle_capacity,
        available=True,
        status="idle",
    )

    db.add(new_driver)
    db.commit()
    db.refresh(new_driver)

    if not new_driver.driver_code:
        new_driver.driver_code = generate_driver_code(new_driver.id)
        db.commit()
        db.refresh(new_driver)

    _sync_live_location(new_driver)

    await ws_manager.broadcast(
        "driver_status_changed",
        {"driver_id": new_driver.id, "driver_code": new_driver.driver_code, "status": new_driver.status, "available": True},
    )

    return _serialize(new_driver)


@router.get("/")
def get_drivers(db: Session = Depends(get_db)):
    return db.query(Driver).order_by(Driver.id).all()


@router.get("/{driver_id}")
def get_driver(driver_id: int, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    return _serialize(driver)


@router.patch("/{driver_id}")
async def update_driver(driver_id: int, payload: DriverUpdate, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(driver, field, value)

    db.commit()
    db.refresh(driver)

    _sync_live_location(driver)

    await ws_manager.broadcast("driver_updated", {"driver_id": driver.id, "driver_code": driver.driver_code})

    return _serialize(driver)


@router.patch("/{driver_id}/status")
async def update_driver_status(
    driver_id: int,
    payload: DriverStatusUpdate,
    db: Session = Depends(get_db),
):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    status = payload.status.strip().lower()

    if status not in VALID_DRIVER_STATUSES:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid driver status",
                "requested_status": status,
                "allowed_statuses": sorted(VALID_DRIVER_STATUSES),
            },
        )

    previous = driver.status
    driver.status = status

    # Respect explicit availability where given; otherwise derive it
    if payload.available is not None:
        driver.available = payload.available
    elif status in AUTO_AVAILABLE:
        driver.available = True
    elif status in AUTO_UNAVAILABLE:
        driver.available = False

    db.commit()
    db.refresh(driver)

    _sync_live_location(driver)

    await ws_manager.broadcast(
        "driver_status_changed",
        {
            "driver_id": driver.id,
            "driver_code": driver.driver_code,
            "previous_status": previous,
            "status": driver.status,
            "available": driver.available,
        },
    )

    return _serialize(driver)


# --------------------------------------------------
# Driver mission context (orders + current route)
# Used by the Driver Details screen.
# --------------------------------------------------

@router.get("/{driver_id}/mission")
def get_driver_mission(driver_id: int, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    route = (
        db.query(Route)
        .filter(Route.driver_id == driver_id, Route.status.in_(["planned", "active"]))
        .order_by(Route.id.desc())
        .first()
    )

    orders: list[dict] = []
    if route:
        rows = (
            db.query(RouteOrder)
            .filter(RouteOrder.route_id == route.id)
            .order_by(RouteOrder.stop_sequence)
            .all()
        )
        for row in rows:
            order = db.query(Order).filter(Order.id == row.order_id).first()
            if not order:
                continue
            orders.append({
                "order_id": order.id,
                "order_number": order.order_number,
                "stop_sequence": row.stop_sequence,
                "stop_type": row.stop_type or "delivery",
                "status": order.status,
                "delivery_status": order.delivery_status,
                "weight": order.weight,
                "priority": order.priority,
                "delivery_deadline": order.delivery_deadline,
                "estimated_arrival": order.estimated_arrival,
                "delivery_address": order.delivery_address,
                "delivery_latitude": order.delivery_latitude,
                "delivery_longitude": order.delivery_longitude,
                "pickup_address": order.pickup_address,
                "pickup_latitude": order.pickup_latitude,
                "pickup_longitude": order.pickup_longitude,
            })

    return {
        "driver": _serialize(driver),
        "current_route": {
            "route_id": route.id if route else None,
            "total_distance_km": route.total_distance if route else 0,
            "estimated_duration_minutes": route.estimated_duration if route else 0,
            "status": route.status if route else None,
            "orders": orders,
        } if route else None,
    }