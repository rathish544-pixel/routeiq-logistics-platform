from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.order import Order
from app.models.driver import Driver
from app.models.route import Route
from app.models.route_order import RouteOrder

from app.services.assignment import (
    find_best_driver,
    pick_specific_driver,
    score_driver_for_order,
    build_assignment_payload,
)
from app.services.websocket_manager import ws_manager


router = APIRouter(prefix="/assignments", tags=["Assignments"])


def _assign_order_to_driver(db: Session, order: Order, driver: Driver, scored: dict | None) -> dict:
    """
    Bind an order to a driver, reusing an existing planned route when present
    or creating a fresh route otherwise. Returns the API payload.
    """
    # 1. Find or create the driver's current planned route
    route = (
        db.query(Route)
        .filter(Route.driver_id == driver.id, Route.status.in_(["planned", "active"]))
        .order_by(Route.id.desc())
        .first()
    )

    new_route = route is None
    if new_route:
        route = Route(driver_id=driver.id, total_distance=0, estimated_duration=0, status="planned")
        db.add(route)
        db.flush()

    # 2. Append the delivery stop at the next sequence
    last_seq = (
        db.query(RouteOrder.stop_sequence)
        .filter(RouteOrder.route_id == route.id)
        .order_by(RouteOrder.stop_sequence.desc())
        .first()
    )
    next_seq = (last_seq[0] + 1) if last_seq else 1

    db.add(RouteOrder(route_id=route.id, order_id=order.id, stop_sequence=next_seq, stop_type="delivery"))

    # 3. Update order + driver state
    order.status = "assigned"
    order.delivery_status = "pending"
    order.assigned_driver_id = driver.id
    order.route_id = route.id

    driver.available = False
    driver.status = "assigned"

    db.commit()

    payload = build_assignment_payload(order, driver, scored)
    payload["route_id"] = route.id
    payload["route_created"] = new_route

    return payload


@router.post("/order/{order_id}")
async def assign_order(
    order_id: int,
    driver_id: int | None = None,
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.status not in {"pending", "assigned"}:
        raise HTTPException(
            status_code=400,
            detail={"message": "Order cannot be assigned", "current_status": order.status},
        )

    drivers = (
        db.query(Driver)
        .filter(Driver.available == True, Driver.status.in_(["idle", "assigned"]))
        .order_by(Driver.id)
        .all()
    )

    if not drivers:
        raise HTTPException(status_code=404, detail="No available drivers")

    # ---- Operator override: assign a specific driver ----
    if driver_id is not None:
        driver = db.query(Driver).filter(Driver.id == driver_id).first()
        if not driver:
            raise HTTPException(status_code=404, detail="Requested driver not found")

        scored = pick_specific_driver(order, driver, drivers_for_distance=drivers)
        if not scored:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Requested driver is not eligible for this order",
                    "reason": "Driver must be available and have enough vehicle capacity",
                },
            )
        payload = _assign_order_to_driver(db, order, driver, scored)

        await ws_manager.broadcast(
            "order_assigned",
            {
                "order_id": order.id,
                "order_number": order.order_number,
                "driver_id": driver.id,
                "driver_name": driver.name,
            },
        )
        return payload

    # ---- Automatic intelligent selection ----
    best_driver, _ = find_best_driver(order, drivers)

    if not best_driver:
        raise HTTPException(status_code=400, detail="No suitable driver found")

    scored = score_driver_for_order(order, best_driver, drivers_for_distance=drivers)
    payload = _assign_order_to_driver(db, order, best_driver, scored)

    await ws_manager.broadcast(
        "order_assigned",
        {
            "order_id": order.id,
            "order_number": order.order_number,
            "driver_id": best_driver.id,
            "driver_name": best_driver.name,
        },
    )

    return payload


@router.post("/auto-assign-all")
async def auto_assign_all(db: Session = Depends(get_db)):
    """Assign every pending order to its optimal driver in one pass."""
    pending_orders = db.query(Order).filter(Order.status == "pending").order_by(Order.priority.desc(), Order.id).all()

    drivers = (
        db.query(Driver)
        .filter(Driver.available == True, Driver.status.in_(["idle", "assigned"]))
        .order_by(Driver.id)
        .all()
    )

    if not pending_orders:
        return {
            "message": "No pending orders to assign",
            "total_processed": 0,
            "total_assigned": 0,
            "assignments": [],
            "unassigned_order_ids": [],
        }

    if not drivers:
        raise HTTPException(status_code=404, detail="No available drivers")

    assignments = []
    unassigned = []

    # Refresh available pool after each assignment (driver becomes busy)
    for order in pending_orders:
        pool = (
            db.query(Driver)
            .filter(Driver.available == True, Driver.status.in_(["idle", "assigned"]))
            .order_by(Driver.id)
            .all()
        )

        candidates = [
            scored
            for scored in (
                score_driver_for_order(order, driver, drivers_for_distance=pool)
                for driver in pool
            )
            if scored
        ]

        if not candidates:
            unassigned.append(order.id)
            continue

        best = max(candidates, key=lambda c: c["score"])
        payload = _assign_order_to_driver(db, order, best["driver"], best)
        assignments.append(payload)

    return {
        "message": f"Auto-assigned {len(assignments)} of {len(pending_orders)} pending orders",
        "total_processed": len(pending_orders),
        "total_assigned": len(assignments),
        "assignments": assignments,
        "unassigned_order_ids": unassigned,
    }