from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.driver import Driver
from app.models.order import Order
from app.models.route import Route
from app.models.route_order import RouteOrder

from app.services.dynamic_routing import calculate_dynamic_route
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/routing", tags=["Dynamic Routing"])

DEFAULT_SERVICE_MINUTES = 10
DELIVERY_STATUS_BY_DELTA = {
    "delivered": "delivered",
    "cancelled": "cancelled",
}


def _mark_order_delivery_status(order: Order) -> None:
    """Re-derive SLA status from ETA vs deadline after a reroute."""
    if order.status in {"delivered", "cancelled"}:
        return
    if not order.delivery_deadline or not order.estimated_arrival:
        order.delivery_status = "pending"
        return

    remaining = (order.delivery_deadline - order.estimated_arrival).total_seconds() / 60
    warning = 30 if order.priority >= 3 else 20 if order.priority == 2 else 15

    if remaining < 0:
        order.delivery_status = "delayed"
    elif remaining <= warning:
        order.delivery_status = "at_risk"
    else:
        order.delivery_status = "on_time"


@router.post("/driver/{driver_id}/recalculate")
async def recalculate_driver_route(driver_id: int, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    route = (
        db.query(Route)
        .filter(Route.driver_id == driver_id, Route.status.in_(["planned", "active"]))
        .order_by(Route.id.desc())
        .first()
    )

    empty_result = {
        "driver_id": driver.id,
        "driver_name": driver.name,
        "driver_code": driver.driver_code,
        "vehicle_capacity": driver.vehicle_capacity,
        "message": "No active route found for this driver",
        "route": {"stops": [], "total_distance_km": 0, "estimated_duration_minutes": 0},
    }

    if not route:
        return empty_result

    route_order_rows = (
        db.query(RouteOrder)
        .filter(RouteOrder.route_id == route.id)
        .order_by(RouteOrder.stop_sequence)
        .all()
    )

    if not route_order_rows:
        return {**empty_result, "route_id": route.id, "message": "No orders found in driver's route"}

    # Preserve finished stops (delivered orders) by dropping their remaining rows;
    # everything still active gets resequenced from the driver's current position.
    order_ids_in_route = list(dict.fromkeys(row.order_id for row in route_order_rows))

    active_orders = (
        db.query(Order)
        .filter(Order.id.in_(order_ids_in_route), Order.status.in_(["planned", "assigned", "pickup_pending", "picked_up", "out_for_delivery"]))
        .all()
    )

    if not active_orders:
        return {
            **empty_result,
            "route_id": route.id,
            "message": "No active orders remaining for this driver",
        }

    # Snapshot current plan for comparison (before we rewrite it)
    previous_distance = route.total_distance
    previous_duration = route.estimated_duration
    previous_etas = {o.id: o.estimated_arrival for o in active_orders}

    remaining_stops = []
    for order in active_orders:
        # If cargo already picked up, only the delivery stop remains
        if order.status not in {"pickup_pending", "picked_up", "out_for_delivery"}:
            remaining_stops.append({
                "order_id": order.id,
                "stop_type": "pickup",
                "latitude": order.pickup_latitude,
                "longitude": order.pickup_longitude,
                "weight": order.weight,
                "priority": order.priority,
            })
        remaining_stops.append({
            "order_id": order.id,
            "stop_type": "delivery",
            "latitude": order.delivery_latitude,
            "longitude": order.delivery_longitude,
            "weight": order.weight,
            "priority": order.priority,
        })

    try:
        dynamic_route = calculate_dynamic_route(
            driver_location=(driver.latitude, driver.longitude),
            remaining_stops=remaining_stops,
            vehicle_capacity=driver.vehicle_capacity,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dynamic rerouting failed: {str(e)}")

    if not dynamic_route["stops"]:
        raise HTTPException(status_code=500, detail="Rerouting failed to produce a valid sequence")

    # ---- Rebuild the persisted itinerary ----
    db.query(RouteOrder).filter(RouteOrder.route_id == route.id).delete(synchronize_session=False)

    base_time = datetime.now(timezone.utc).replace(tzinfo=None)
    accumulated_seconds = 0.0
    new_etas_by_order: dict[int, datetime] = {}
    enriched_stops = []

    for index, stop in enumerate(dynamic_route["stops"], start=1):
        accumulated_seconds += stop.get("travel_time_seconds", 0)
        eta = base_time + timedelta(seconds=accumulated_seconds)
        accumulated_seconds += DEFAULT_SERVICE_MINUTES * 60

        db.add(RouteOrder(
            route_id=route.id,
            order_id=stop["order_id"],
            stop_sequence=index,
            stop_type=stop["stop_type"],
            estimated_arrival=eta,
            completed=False,
        ))

        order = next((o for o in active_orders if o.id == stop["order_id"]), None)
        if order and stop["stop_type"] == "delivery":
            order.estimated_arrival = eta
            new_etas_by_order[order.id] = eta
            order.delivery_status = "pending"
            _mark_order_delivery_status(order)
            if order.delivery_deadline:
                stop["deadline"] = order.delivery_deadline.isoformat()
            stop["estimated_arrival"] = eta.isoformat()
            stop["delivery_status"] = order.delivery_status
        elif order:
            order.status = "planned" if order.status == "assigned" else order.status

        stop["stop_sequence"] = index
        enriched_stops.append(stop)

    route.total_distance = dynamic_route["total_distance_km"]
    route.estimated_duration = int(dynamic_route["estimated_duration_minutes"])
    route.status = "active"
    driver.status = "in_transit"
    driver.available = False

    db.commit()

    # ---- Build change/impact summary ----
    affected: list[dict] = []
    for order in active_orders:
        previous_eta = previous_etas.get(order.id)
        new_eta = new_etas_by_order.get(order.id)
        if not new_eta:
            continue

        delta_minutes = None
        if previous_eta:
            delta_minutes = round((new_eta - previous_eta).total_seconds() / 60, 1)

        affected.append({
            "order_id": order.id,
            "order_number": order.order_number,
            "priority": order.priority,
            "previous_eta": previous_eta.isoformat() if previous_eta else None,
            "new_eta": new_eta.isoformat(),
            "eta_delta_minutes": delta_minutes,
            "delivery_status": order.delivery_status,
            "delivery_deadline": order.delivery_deadline,
        })

    changes = {
        "distance_delta_km": round(dynamic_route["total_distance_km"] - previous_distance, 2),
        "duration_delta_minutes": round(dynamic_route["estimated_duration_minutes"] - previous_duration, 1),
        "affected_order_ids": [a["order_id"] for a in affected],
        "affected_orders_count": len(affected),
        "eta_changes": affected,
        "at_risk_order_ids": [a["order_id"] for a in affected if a["delivery_status"] == "at_risk"],
        "delayed_order_ids": [a["order_id"] for a in affected if a["delivery_status"] == "delayed"],
    }

    await ws_manager.broadcast(
        "route_updated",
        {
            "driver_id": driver.id,
            "route_id": route.id,
            "total_distance_km": dynamic_route["total_distance_km"],
            "affected_orders_count": len(affected),
        },
    )

    return {
        "driver_id": driver.id,
        "driver_name": driver.name,
        "driver_code": driver.driver_code,
        "vehicle_capacity": driver.vehicle_capacity,
        "route_id": route.id,
        "current_location": {"latitude": driver.latitude, "longitude": driver.longitude},
        "orders_in_route": len(active_orders),
        "previous_route": {
            "total_distance_km": previous_distance,
            "estimated_duration_minutes": previous_duration,
        },
        "changes": changes,
        "route": {
            **dynamic_route,
            "stops": enriched_stops,
        },
    }