from sqlalchemy.orm import Session

from app.models.driver import Driver
from app.models.order import Order
from app.models.route import Route
from app.models.route_order import RouteOrder


def serialize_route(db: Session, route: Route, driver: Driver | None = None) -> dict:
    """Serialize a route with its full stop itinerary joined against orders."""
    if driver is None:
        driver = db.query(Driver).filter(Driver.id == route.driver_id).first()

    stop_rows = (
        db.query(RouteOrder)
        .filter(RouteOrder.route_id == route.id)
        .order_by(RouteOrder.stop_sequence)
        .all()
    )

    orders_by_id: dict[int, Order] = {}
    if stop_rows:
        order_ids = [row.order_id for row in stop_rows]
        for order in db.query(Order).filter(Order.id.in_(order_ids)).all():
            orders_by_id[order.id] = order

    total_weight = 0.0
    weight_counted_order_ids: set[int] = set()
    stops = []

    for row in stop_rows:
        order = orders_by_id.get(row.order_id)
        if order is None:
            continue

        is_pickup = (row.stop_type or "").lower() == "pickup"
        weight = order.weight

        if not is_pickup and row.order_id not in weight_counted_order_ids:
            total_weight += order.weight
            weight_counted_order_ids.add(row.order_id)

        stops.append({
            "stop_sequence": row.stop_sequence,
            "order_id": order.id,
            "order_number": order.order_number,
            "customer_name": order.customer_name,
            "stop_type": row.stop_type or ("pickup" if is_pickup else "delivery"),
            "latitude": order.pickup_latitude if is_pickup else order.delivery_latitude,
            "longitude": order.pickup_longitude if is_pickup else order.delivery_longitude,
            "address": order.pickup_address if is_pickup else order.delivery_address,
            "weight": weight,
            "priority": order.priority,
            "delivery_deadline": order.delivery_deadline,
            "estimated_arrival": order.estimated_arrival,
            "delivery_status": order.delivery_status,
            "completed": row.completed,
            "order_status": order.status,
        })

    return {
        "route_id": route.id,
        "route_code": route.route_code,
        "driver_id": route.driver_id,
        "driver_name": driver.name if driver else None,
        "driver_code": driver.driver_code if driver else None,
        "vehicle_capacity": driver.vehicle_capacity if driver else None,
        "total_weight": round(total_weight, 2),
        "total_distance_km": route.total_distance,
        "estimated_duration_minutes": route.estimated_duration,
        "status": route.status,
        "created_at": route.created_at,
        "orders": stops,
    }


def delete_route(db: Session, route: Route) -> None:
    """Delete a route and detach its orders back to 'assigned' state."""
    stop_rows = (
        db.query(RouteOrder)
        .filter(RouteOrder.route_id == route.id)
        .all()
    )
    order_ids = [row.order_id for row in stop_rows]

    db.query(RouteOrder).filter(RouteOrder.route_id == route.id).delete(synchronize_session=False)
    db.delete(route)

    if order_ids:
        orders = db.query(Order).filter(Order.id.in_(order_ids), Order.route_id == route.id).all()
        for order in orders:
            order.status = "assigned"
            order.route_id = None
            order.estimated_arrival = None

    db.commit()