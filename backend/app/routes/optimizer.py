import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.driver import Driver
from app.models.order import Order
from app.models.route import Route
from app.models.route_order import RouteOrder
from app.models.optimization_run import OptimizationRun

from app.services.optimizer import optimize_multi_driver
from app.services.osrm import get_route_geometry
from app.services.route_serializer import serialize_route
from app.services.websocket_manager import ws_manager


router = APIRouter(prefix="/optimization", tags=["Optimization"])


# =========================================================
# MULTI-DRIVER ROUTE OPTIMIZATION
# =========================================================

@router.post("/multi-driver")
async def optimize_multi_driver_routes(db: Session = Depends(get_db)):
    drivers = db.query(Driver).filter(Driver.available == True).all()
    orders = db.query(Order).filter(Order.status == "pending").all()

    if not drivers:
        raise HTTPException(status_code=400, detail="No available drivers")

    if not orders:
        raise HTTPException(status_code=400, detail="No pending orders")

    started = time.time()

    try:
        optimized_routes = optimize_multi_driver(drivers, orders)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Route optimization failed: {str(e)}")

    if not optimized_routes:
        raise HTTPException(status_code=500, detail="Route optimization failed to find a solution")

    execution_seconds = round(time.time() - started, 3)

    saved_route_ids: list[int] = []
    metrics_late = 0
    metrics_total_distance = 0.0
    total_weight_planned = 0.0
    total_capacity = 0.0
    total_stops = 0

    for route_data in optimized_routes:
        if not route_data["orders"]:
            continue

        driver = next((d for d in drivers if d.id == route_data["driver_id"]), None)
        if driver is None:
            continue

        new_route = Route(
            driver_id=driver.id,
            route_code=f"RT-{880 + driver.id}",
            total_distance=route_data["total_distance_km"],
            estimated_duration=route_data["estimated_duration_minutes"],
            status="planned",
        )

        db.add(new_route)
        db.flush()

        metrics_total_distance += route_data["total_distance_km"]
        total_capacity += driver.vehicle_capacity
        total_stops += len(route_data["orders"])

        for stop in route_data["orders"]:
            db.add(
                RouteOrder(
                    route_id=new_route.id,
                    order_id=stop["order_id"],
                    stop_sequence=stop["stop_sequence"],
                    stop_type=stop["stop_type"],
                    estimated_arrival=(
                        datetime.fromisoformat(stop["estimated_arrival"])
                        if stop.get("estimated_arrival")
                        else None
                    ),
                    completed=False,
                )
            )

            order = db.query(Order).filter(Order.id == stop["order_id"]).first()
            if not order:
                continue

            if order.route_id and order.route_id != new_route.id:
                # Order previously planned on another route — detach it
                db.query(RouteOrder).filter(
                    RouteOrder.route_id == order.route_id,
                    RouteOrder.order_id == order.id,
                ).delete(synchronize_session=False)

            order.status = "planned"
            order.route_id = new_route.id
            order.assigned_driver_id = driver.id

            if stop["stop_type"] == "delivery":
                order.estimated_arrival = (
                    datetime.fromisoformat(stop["estimated_arrival"])
                    if stop.get("estimated_arrival")
                    else None
                )
                order.delivery_status = stop.get("delivery_status", "pending")
                if stop.get("delivery_status") == "late":
                    metrics_late += 1

            if stop["stop_type"] == "pickup":
                total_weight_planned += stop.get("weight", 0)

        # Driver is now committed to this plan
        driver.available = False
        driver.status = "assigned"

        saved_route_ids.append(new_route.id)

    db.commit()

    # ---- Persist run record ----
    avg_capacity_util = (
        round((total_weight_planned / total_capacity) * 100, 1) if total_capacity > 0 else 0
    )
    run = OptimizationRun(
        total_orders=len(orders),
        total_drivers=len(saved_route_ids),
        routes_count=len(saved_route_ids),
        total_distance_km=round(metrics_total_distance, 2),
        execution_time_seconds=execution_seconds,
        status="completed",
        summary={
            "late_orders_count": metrics_late,
            "avg_capacity_utilization_pct": avg_capacity_util,
            "total_weight_planned": round(total_weight_planned, 2),
        },
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    saved_routes = [
        serialize_route(db, db.query(Route).filter(Route.id == rid).first())
        for rid in saved_route_ids
    ]

    total_orders_planned = sum(len(r["orders"]) // 2 for r in saved_routes)
    on_time_count = max(len(orders) - metrics_late, 0)

    response = {
        "run_id": run.id,
        "execution_time_seconds": execution_seconds,
        "total_drivers": len(saved_routes),
        "total_orders": len(orders),
        "orders_planned": total_orders_planned,
        "routes_saved": len(saved_routes),
        "routes": saved_routes,
        "metrics": {
            "avg_capacity_utilization_pct": avg_capacity_util,
            "on_time_compliance_pct": round(
                (on_time_count / len(orders)) * 100, 1
            ) if orders else 100.0,
            "total_fleet_distance_km": round(metrics_total_distance, 2),
            "late_orders_count": metrics_late,
        },
    }

    await ws_manager.broadcast(
        "optimization_completed",
        {
            "run_id": run.id,
            "routes_saved": len(saved_routes),
            "total_orders": len(orders),
        },
    )

    return response


# =========================================================
# OPTIMIZATION RUN HISTORY
# =========================================================

@router.get("/runs")
def get_optimization_runs(db: Session = Depends(get_db)):
    runs = db.query(OptimizationRun).order_by(OptimizationRun.id.desc()).limit(20).all()
    return {
        "total_runs": len(runs),
        "runs": [
            {
                "run_id": r.id,
                "total_orders": r.total_orders,
                "total_drivers": r.total_drivers,
                "routes_count": r.routes_count,
                "total_distance_km": r.total_distance_km,
                "execution_time_seconds": r.execution_time_seconds,
                "status": r.status,
                "summary": r.summary,
                "created_at": r.created_at,
            }
            for r in runs
        ],
    }


# =========================================================
# GET SAVED ROUTES (full driver + stop context)
# =========================================================

@router.get("/routes")
def get_routes(db: Session = Depends(get_db)):
    routes = db.query(Route).order_by(Route.id.desc()).limit(100).all()
    return {
        "total_routes": len(routes),
        "routes": [serialize_route(db, route) for route in routes],
    }


# =========================================================
# GET SINGLE ROUTE (route details view)
# =========================================================

@router.get("/routes/{route_id}")
def get_route(route_id: int, db: Session = Depends(get_db)):
    route = db.query(Route).filter(Route.id == route_id).first()

    if not route:
        raise HTTPException(status_code=404, detail="Route not found")

    return serialize_route(db, route)


# =========================================================
# ACTUAL ROAD ROUTE GEOMETRY
# =========================================================

@router.post("/route-geometry")
def route_geometry(locations: list[list[float]]):
    """Road-following geometry. Input [[lat, lon], ...] → output [lon, lat] pairs."""
    if len(locations) < 2:
        raise HTTPException(status_code=400, detail="At least 2 locations are required")

    for location in locations:
        if len(location) != 2:
            raise HTTPException(status_code=400, detail="Each location must contain latitude and longitude")

    try:
        geometry = get_route_geometry([(loc[0], loc[1]) for loc in locations])
        return {"coordinates": geometry}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unable to get road geometry: {str(e)}")