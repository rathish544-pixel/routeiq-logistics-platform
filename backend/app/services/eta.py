from datetime import datetime, timedelta


def calculate_eta(
    duration_seconds: float,
    start_time: datetime | None = None,
) -> datetime:
    """
    Calculate ETA using actual road travel duration
    returned by the routing engine.
    """

    if start_time is None:
        start_time = datetime.now()

    return start_time + timedelta(
        seconds=duration_seconds
    )


def format_eta(eta: datetime) -> str:
    """
    Return ETA in ISO format for API/frontend use.
    """

    return eta.isoformat()