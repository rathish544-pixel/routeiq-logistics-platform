from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.order import Order
from app.models.route_order import RouteOrder
from app.models.alert import SystemAlert
from app.schemas.order import OrderCreate, OrderUpdate, generate_order_number
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/orders", tags=["Orders"])


# --------------------------------------------------
# VALID ORDER STATUS TRANSITIONS
# --------------------------------------------------

VALID_TRANSITIONS = {
    "pending": {"assigned", "cancelled"},
    "assigned": {"planned", "pickup_pending", "cancelled"},
    "planned": {"pickup_pending", "cancelled"},
    "pickup_pending": {"picked_up", "cancelled"},
    "picked_up": {"out_for_delivery", "cancelled"},
    "out_for_delivery": {"delivered", "cancelled"},
    "delivered": set(),
    "cancelled": set(),
}

# Order status -> delivery performance status synchronisation
STATUS_TO_DELIVERY = {
    "delivered": "delivered",
    "picked_up": "picked_up",
    "out_for_delivery": "out_for_delivery",
    "cancelled": "cancelled",
    "pending": "pending",
    "assigned": "pending",
    "planned": "pending",
    "pickup_pending": "pending",
}


def _apply_delivery_status(order: Order) -> None:
    order.delivery_status = STATUS_TO_DELIVERY.get(order.status, order.delivery_status)


def _order_to_dict(order: Order) -> dict:
    return {
        "id": order.id,
        "order_number": order.order_number,
        "customer_name": order.customer_name,
        "pickup_address": order.pickup_address,
        "pickup_latitude": order.pickup_latitude,
        "pickup_longitude": order.pickup_longitude,
        "delivery_address": order.delivery_address,
        "delivery_latitude": order.delivery_latitude,
        "delivery_longitude": order.delivery_longitude,
        "weight": order.weight,
        "priority": order.priority,
        "delivery_deadline": order.delivery_deadline,
        "status": order.status,
        "delivery_status": order.delivery_status,
        "assigned_driver_id": order.assigned_driver_id,
        "route_id": order.route_id,
        "estimated_arrival": order.estimated_arrival,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
    }


# --------------------------------------------------
# CREATE ORDER
# --------------------------------------------------

@router.post("/")
async def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    new_order = Order(
        order_number=order.order_number,
        customer_name=order.customer_name,
        pickup_address=order.pickup_address,
        pickup_latitude=order.pickup_latitude,
        pickup_longitude=order.pickup_longitude,
        delivery_address=order.delivery_address,
        delivery_latitude=order.delivery_latitude,
        delivery_longitude=order.delivery_longitude,
        weight=order.weight,
        priority=order.priority,
        delivery_deadline=order.delivery_deadline,
        status="pending",
        delivery_status="pending",
    )

    db.add(new_order)
    db.commit()
    db.refresh(new_order)

    if not new_order.order_number:
        new_order.order_number = generate_order_number(new_order.id)
        db.commit()
        db.refresh(new_order)

    await ws_manager.broadcast("order_created", {"order_id": new_order.id, "order_number": new_order.order_number})

    return _order_to_dict(new_order)


# --------------------------------------------------
# GET ALL ORDERS (with optional status + search filter)
# --------------------------------------------------

@router.get("/")
def get_orders(
    status: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
):
    query = db.query(Order)

    if status and status.lower() != "all":
        query = query.filter(Order.status == status.lower())

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            (Order.order_number.ilike(term))
            | (Order.customer_name.ilike(term))
            | (Order.delivery_address.ilike(term))
            | (Order.pickup_address.ilike(term))
        )

    return (
        query.order_by(Order.id.desc())
        .offset(max(skip, 0))
        .limit(min(max(limit, 1), 1000))
        .all()
    )


# --------------------------------------------------
# GET SINGLE ORDER
# --------------------------------------------------

@router.get("/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    return order


# --------------------------------------------------
# UPDATE ORDER (editable fields, status untouched here)
# --------------------------------------------------

@router.patch("/{order_id}")
def update_order(order_id: int, payload: OrderUpdate, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    fields = payload.model_dump(exclude_unset=True)
    for field, value in fields.items():
        setattr(order, field, value)

    db.commit()
    db.refresh(order)

    return _order_to_dict(order)


# --------------------------------------------------
# UPDATE ORDER STATUS (guarded lifecycle transitions)
# --------------------------------------------------

@router.patch("/{order_id}/status")
async def update_order_status(order_id: int, status: str, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    status = status.strip().lower()
    current_status = order.status

    if current_status not in VALID_TRANSITIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown current order status: {current_status}",
        )

    allowed_next_statuses = VALID_TRANSITIONS[current_status]

    if status not in allowed_next_statuses:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Invalid order status transition",
                "current_status": current_status,
                "requested_status": status,
                "allowed_next_statuses": sorted(allowed_next_statuses),
            },
        )

    order.status = status
    _apply_delivery_status(order)

    db.commit()
    db.refresh(order)

    await ws_manager.broadcast(
        "order_status_changed",
        {
            "order_id": order.id,
            "order_number": order.order_number,
            "previous_status": current_status,
            "status": order.status,
            "delivery_status": order.delivery_status,
        },
    )

    return {
        "message": "Order status updated",
        "order_id": order.id,
        "order_number": order.order_number,
        "previous_status": current_status,
        "status": order.status,
        "delivery_status": order.delivery_status,
        "allowed_next_statuses": sorted(VALID_TRANSITIONS[status]),
    }


# --------------------------------------------------
# DELETE ORDER (detach from routes, clear alerts)
# --------------------------------------------------

@router.delete("/{order_id}")
async def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Detach from any route itinerary first
    db.query(RouteOrder).filter(RouteOrder.order_id == order_id).delete(synchronize_session=False)
    db.query(SystemAlert).filter(SystemAlert.order_id == order_id).delete(synchronize_session=False)

    db.delete(order)
    db.commit()

    await ws_manager.broadcast(
        "order_deleted",
        {"order_id": order_id, "order_number": order.order_number or f"#ORD-{order_id}"},
    )

    return {"message": "Order deleted", "order_id": order_id}