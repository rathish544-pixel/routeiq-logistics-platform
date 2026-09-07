import types

from app.services.assignment import (
    score_driver_for_order,
    build_assignment_payload,
    _capacity_fit_score,
    _status_score,
)


def _order(weight=20.0, priority=1):
    return types.SimpleNamespace(
        id=7,
        order_number="ORD-9007",
        weight=weight,
        priority=priority,
        pickup_latitude=11.0168,
        pickup_longitude=76.9558,
    )


def _driver(capacity=100.0, available=True, status="idle", lat=11.0200, lon=76.9600, code="DRV-401"):
    return types.SimpleNamespace(
        id=1,
        name="Arun",
        driver_code=code,
        vehicle_capacity=capacity,
        available=available,
        status=status,
        latitude=lat,
        longitude=lon,
    )


def test_unavailable_driver_rejected():
    driver = _driver(available=False)
    assert score_driver_for_order(_order(), driver) is None


def test_busy_driver_rejected():
    driver = _driver(status="in_transit")
    assert score_driver_for_order(_order(), driver) is None


def test_capacity_exceeded_rejected():
    driver = _driver(capacity=10.0)
    assert score_driver_for_order(_order(weight=20.0), driver) is None


def test_eligible_driver_scored():
    scored = score_driver_for_order(_order(), _driver())
    assert scored is not None
    assert scored["score"] > 0
    assert scored["score"] <= 100
    assert "driver_status" in scored["score_breakdown"]
    assert scored["distance_km"] > 0


def test_closer_driver_scores_higher():
    far = _driver(lat=11.6000, lon=77.5000)
    near = _driver(lat=11.0170, lon=76.9560)
    scored_far = score_driver_for_order(_order(), far, drivers_for_distance=[far, near])
    scored_near = score_driver_for_order(_order(), near, drivers_for_distance=[far, near])
    assert scored_near["score"] > scored_far["score"]


def test_capacity_fit_prefers_comfortable_band():
    # 40% and 80% utilization both sit in the ideal band; 2% (wasted capacity)
    # and 95% (overloaded) score lower.
    pct40 = _capacity_fit_score(20.0, 50.0)
    pct80 = _capacity_fit_score(20.0, 25.0)
    pct2 = _capacity_fit_score(20.0, 1000.0)
    pct95 = _capacity_fit_score(20.0, 21.05)
    assert pct40[0] == 100.0
    assert pct80[0] == 100.0
    assert pct2[0] < 60
    assert pct95[0] < 100
    assert pct40[0] > pct95[0] > pct2[0]


def test_capacity_exceeded_scores_zero():
    score, reason = _capacity_fit_score(20.0, 10.0)
    assert score == 0.0
    assert "Exceeds" in reason


def test_status_scores():
    assert _status_score("idle")[0] == 100.0
    assert _status_score("offline")[0] == 0.0


def test_payload_shape():
    driver = _driver()
    order = _order()
    scored = score_driver_for_order(order, driver)
    payload = build_assignment_payload(order, driver, scored)
    assert payload["order_id"] == 7
    assert payload["driver_name"] == "Arun"
    assert payload["vehicle_capacity_kg"] == 100.0
    assert payload["order_weight_kg"] == 20.0
    assert payload["capacity_utilization_pct"] == 20.0
    assert payload["status"] == "assigned"
    assert payload["reasoning"]
    assert payload["score"] > 0