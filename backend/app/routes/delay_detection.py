from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.alert import SystemAlert
from app.models.order import Order
from app.models.route import Route
from app.models.route_order import RouteOrder
from app.services.delay_detection import detect_order_delay
from app.services.websocket_manager import ws_manager
from app.core.config import settings

router = APIRouter(prefix="/delays", tags=["Delay Detection"])

SEVERITY_BY_STATUS = {
    "delayed": "critical",
    "at_risk": "warning",
    "on_time": "info",
}


def _priority_warning_minutes(priority: int) -> int:
    if priority >= 3:
        return settings.DELAY_WARNING_P3_MINUTES
    if priority == 2:
        return settings.DELAY_WARNING_P2_MINUTES
    return settings.DELAY_WARNING_P1_MINUTES


def _warning_window_minutes(priority: int) -> int:
    return _priority_warning_minutes(priority)


def analyze_order(order: Order) -> dict:
    """Single-order SLA analysis.

    Rules:
    - No deadline or finished order  -> pending (not actionable)
    - ETA known                       -> delayed / at_risk / on_time from ETA vs deadline
    - No ETA but deadline passed      -> delayed (deadline breached without a plan)
    - No ETA, deadline within window  -> at_risk
    - No ETA, deadline comfortably far-> pending (monitor later)
    """
    if order.delivery_deadline is None or order.status in {"delivered", "cancelled"}:
        return {
            "order_id": order.id,
            "order_number": order.order_number,
            "priority": order.priority,
            "status": "pending",
            "delay_minutes": 0,
            "message": "Not actively monitored (no deadline or run complete)",
            "deadline": order.delivery_deadline,
            "estimated_arrival": order.estimated_arrival,
            "delivery_status": order.delivery_status,
        }

    if order.estimated_arrival is not None:
        analysis = detect_order_delay(
            deadline=order.delivery_deadline,
            estimated_arrival=order.estimated_arrival,
            priority=order.priority,
        )
    else:
        now = datetime.now()
        remaining_minutes = (order.delivery_deadline - now).total_seconds() / 60
        warning = _warning_window_minutes(order.priority)

        if remaining_minutes < 0:
            analysis = {
                "status": "delayed",
                "delay_minutes": round(-remaining_minutes, 1),
                "message": "Delivery deadline has passed with no ETA recorded",
            }
        elif remaining_minutes <= warning:
            analysis = {
                "status": "at_risk",
                "delay_minutes": 0,
                "message": f"Delivery deadline is within {warning} min but no ETA is recorded",
            }
        else:
            analysis = {
                "status": "pending",
                "delay_minutes": 0,
                "message": "ETA not yet planned; deadline comfortably ahead",
            }

    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "priority": order.priority,
        "status": analysis["status"],
        "delay_minutes": analysis["delay_minutes"],
        "message": analysis["message"],
        "deadline": order.delivery_deadline,
        "estimated_arrival": order.estimated_arrival,
        "delivery_status": order.delivery_status,
    }


def scan_orders(db: Session) -> list[dict]:
    """Evaluate every active order and persist alerts for at-risk/delayed states."""
    orders = (
        db.query(Order)
        .filter(
            Order.status.notin_(["delivered", "cancelled"]),
            Order.delivery_deadline.isnot(None),
        )
        .all()
    )

    results = []
    for order in orders:
        result = analyze_order(order)

        # Persist order-level SLA status only when a firm state can be derived
        if result["status"] in {"at_risk", "delayed", "on_time"}:
            order.delivery_status = result["status"]
            results.append(result)
        elif result["status"] == "pending":
            # Keep pending orders in the monitored list but never flip their SLA flag
            results.append(result)

        # Create / refresh an alert only for actionable states
        if result["status"] not in {"at_risk", "delayed"}:
            continue

        existing = (
            db.query(SystemAlert)
            .filter(
                SystemAlert.order_id == order.id,
                SystemAlert.acknowledged == False,
                SystemAlert.severity.in_(["warning", "critical"]),
            )
            .first()
        )

        title = "SLA BREACH — ORDER DELAYED" if result["status"] == "delayed" else "DEADLINE APPROACHING — AT RISK"
        message = (
            f"{result['message']} Priority {order.priority} delivery expects to run "
            f"{result['delay_minutes']:.0f} min late." if result["status"] == "delayed"
            else f"{result['message']} Priority {order.priority} window closes soon."
        )

        if existing:
            existing.title = title
            existing.message = message
            existing.severity = SEVERITY_BY_STATUS[result["status"]]
            existing.driver_id = order.assigned_driver_id
            existing.route_id = order.route_id
        else:
            db.add(SystemAlert(
                severity=SEVERITY_BY_STATUS[result["status"]],
                title=title,
                message=message,
                order_id=order.id,
                driver_id=order.assigned_driver_id,
                route_id=order.route_id,
            ))

    db.commit()
    return results


@router.get("/summary")
def get_delay_summary(db: Session = Depends(get_db)):
    """Aggregate SLA posture across the active order book."""
    results = scan_orders(db)

    summary = {
        "total_checked": len(results),
        "on_time_count": 0,
        "at_risk_count": 0,
        "delayed_count": 0,
        "pending_count": 0,
        "orders": [],
    }

    for result in results:
        summary["orders"].append({
            "order_id": result["order_id"],
            "order_number": result["order_number"],
            "priority": result["priority"],
            "delay_status": result["status"],
            "delay_minutes": result["delay_minutes"],
            "message": result["message"],
            "deadline": result["deadline"].isoformat() if result["deadline"] else None,
            "estimated_arrival": result["estimated_arrival"].isoformat() if result["estimated_arrival"] else None,
        })
        if result["status"] == "delayed":
            summary["delayed_count"] += 1
        elif result["status"] == "at_risk":
            summary["at_risk_count"] += 1
        elif result["status"] == "on_time":
            summary["on_time_count"] += 1
        else:
            summary["pending_count"] += 1

    return summary


@router.get("/order/{order_id}")
def check_order_delay(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    route_order = (
        db.query(RouteOrder)
        .join(Route, Route.id == RouteOrder.route_id)
        .filter(RouteOrder.order_id == order_id)
        .order_by(Route.id.desc())
        .first()
    )

    if not route_order:
        return {
            "order_id": order.id,
            "priority": order.priority,
            "delivery_deadline": order.delivery_deadline,
            "estimated_arrival": order.estimated_arrival,
            "delay_analysis": {
                "status": "unknown",
                "message": "Order is not assigned to an optimized route",
                "delay_minutes": 0,
            },
        }

    delay_analysis = detect_order_delay(
        deadline=order.delivery_deadline,
        estimated_arrival=order.estimated_arrival,
        priority=order.priority,
    )

    return {
        "order_id": order.id,
        "priority": order.priority,
        "route_id": route_order.route_id,
        "delivery_deadline": order.delivery_deadline,
        "estimated_arrival": order.estimated_arrival,
        "delay_analysis": delay_analysis,
    }


@router.post("/scan")
async def trigger_sla_scan(db: Session = Depends(get_db)):
    """Manual full-fleet SLA scan; returns the fresh summary."""
    await ws_manager.broadcast(
        "sla_scan_started",
        {"message": "Full fleet SLA scan triggered", "started_at": datetime.now().isoformat()},
    )
    summary = get_delay_summary(db)

    for order in summary["orders"]:
        if order["delay_status"] in {"at_risk", "delayed"}:
            await ws_manager.broadcast(
                "order_delay_detected",
                {
                    "order_id": order["order_id"],
                    "order_number": order["order_number"],
                    "delay_status": order["delay_status"],
                    "delay_minutes": order["delay_minutes"],
                },
            )

    return summary


@router.get("/alerts")
def get_alerts(db: Session = Depends(get_db)):
    alerts = (
        db.query(SystemAlert)
        .filter(SystemAlert.acknowledged == False)
        .order_by(SystemAlert.severity.desc(), SystemAlert.created_at.desc())
        .all()
    )

    return [
        {
            "id": alert.id,
            "severity": alert.severity,
            "title": alert.title,
            "message": alert.message,
            "order_id": alert.order_id,
            "driver_id": alert.driver_id,
            "route_id": alert.route_id,
            "acknowledged": alert.acknowledged,
            "created_at": alert.created_at,
        }
        for alert in alerts
    ]


@router.patch("/alerts/{alert_id}/ack")
async def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(SystemAlert).filter(SystemAlert.id == alert_id).first()

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.acknowledged = True
    db.commit()

    await ws_manager.broadcast("alert_acknowledged", {"alert_id": alert.id, "order_id": alert.order_id})

    return {"message": "Alert acknowledged", "alert_id": alert.id}