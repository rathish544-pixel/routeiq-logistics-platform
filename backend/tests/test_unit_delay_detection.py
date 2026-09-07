from datetime import datetime, timedelta

from app.services.delay_detection import detect_order_delay

NOW = datetime(2026, 9, 7, 12, 0, 0)


def test_no_deadline_is_unknown():
    result = detect_order_delay(deadline=None, estimated_arrival=NOW + timedelta(hours=1), priority=1)
    assert result["status"] == "unknown"


def test_no_eta_is_unknown():
    result = detect_order_delay(deadline=NOW + timedelta(hours=2), estimated_arrival=None, priority=1)
    assert result["status"] == "unknown"


def test_late_eta_is_delayed():
    result = detect_order_delay(
        deadline=NOW + timedelta(hours=1),
        estimated_arrival=NOW + timedelta(hours=1, minutes=25),
        priority=1,
    )
    assert result["status"] == "delayed"
    assert result["delay_minutes"] == 25.0


def test_tight_window_is_at_risk_for_critical():
    # P3 warns 30 min out
    result = detect_order_delay(
        deadline=NOW + timedelta(minutes=15),
        estimated_arrival=NOW,
        priority=3,
    )
    assert result["status"] == "at_risk"


def test_comfortable_eta_is_on_time():
    result = detect_order_delay(
        deadline=NOW + timedelta(hours=3),
        estimated_arrival=NOW + timedelta(hours=1),
        priority=1,
    )
    assert result["status"] == "on_time"
    assert result["delay_minutes"] == 0


def test_priority_awareness():
    # P1 warning window is 15 min: ETA exactly 20 min early is fine
    p1 = detect_order_delay(deadline=NOW + timedelta(minutes=20), estimated_arrival=NOW, priority=1)
    assert p1["status"] == "on_time"

    # P3 warning window is 30 min: ETA exactly 20 min early is at-risk
    p3 = detect_order_delay(deadline=NOW + timedelta(minutes=20), estimated_arrival=NOW, priority=3)
    assert p3["status"] == "at_risk"