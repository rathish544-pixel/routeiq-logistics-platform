from datetime import datetime


def detect_order_delay(
    deadline: datetime | None,
    estimated_arrival: datetime | None,
    priority: int = 1,
):
    """
    Detect whether an order is:
    - on time
    - at risk
    - delayed
    """

    if deadline is None:
        return {
            "status": "unknown",
            "message": "No delivery deadline configured",
            "delay_minutes": 0,
        }

    if estimated_arrival is None:
        return {
            "status": "unknown",
            "message": "ETA is not available",
            "delay_minutes": 0,
        }

    delay_seconds = (
        estimated_arrival - deadline
    ).total_seconds()

    delay_minutes = round(
        max(delay_seconds, 0) / 60,
        2
    )

    if delay_seconds > 0:
        return {
            "status": "delayed",
            "message": "Order is expected to miss its deadline",
            "delay_minutes": delay_minutes,
        }

    remaining_seconds = (
        deadline - estimated_arrival
    ).total_seconds()

    warning_minutes = 15

    if priority >= 3:
        warning_minutes = 30
    elif priority == 2:
        warning_minutes = 20

    if remaining_seconds <= warning_minutes * 60:
        return {
            "status": "at_risk",
            "message": "Order is approaching its delivery deadline",
            "delay_minutes": 0,
        }

    return {
        "status": "on_time",
        "message": "Order is expected to arrive before its deadline",
        "delay_minutes": 0,
    }