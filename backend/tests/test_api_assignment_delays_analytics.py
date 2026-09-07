
def test_single_assignment_scored(client, db_session):
    from conftest import make_driver, make_order

    make_driver(db_session, name="Nearby", capacity=200, lat=11.0170, lon=76.9565)
    order = make_order(db_session, weight=30, priority=2)

    response = client.post(f"/assignments/order/{order.id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "assigned"
    assert payload["score"] > 0
    assert payload["reasoning"]
    assert payload["capacity_utilization_pct"] == 15.0
    assert payload["distance_to_pickup_km"] >= 0
    assert payload["score_breakdown"]

    # Order is now assigned to the driver
    updated = client.get(f"/orders/{order.id}").json()
    assert updated["status"] == "assigned"
    assert updated["assigned_driver_id"] == payload["driver_id"]


def test_assign_unavailable_order_rejected(client, db_session):
    from conftest import make_driver, make_order

    make_driver(db_session, name="AnyDriver", capacity=200)
    order = make_order(db_session, weight=30)
    client.patch(f"/orders/{order.id}/status?status=cancelled")
    response = client.post(f"/assignments/order/{order.id}")
    assert response.status_code == 400


def test_no_available_driver_returns_404_or_400(client, db_session):
    from conftest import make_order

    order = make_order(db_session, weight=10)
    response = client.post(f"/assignments/order/{order.id}")
    # no drivers exist -> 404 "No available drivers"
    assert response.status_code == 404


def test_auto_assign_all(client, db_session):
    from conftest import make_driver, make_order

    make_driver(db_session, name="FleetA", capacity=150)
    make_driver(db_session, name="FleetB", capacity=150)
    make_order(db_session, weight=20)
    make_order(db_session, weight=25)

    response = client.post("/assignments/auto-assign-all")
    assert response.status_code == 200
    body = response.json()
    assert body["total_processed"] == 2
    assert body["total_assigned"] == 2
    assert body["unassigned_order_ids"] == []


def test_delays_summary_scan_alerts_ack(client, db_session):
    from datetime import datetime, timedelta
    from conftest import make_driver, make_order

    make_driver(db_session, name="DelayDriver", capacity=200)
    future = datetime.now() + timedelta(hours=6)
    late = make_order(
        db_session,
        weight=10,
        priority=1,
        deadline=future,
        eta=future + timedelta(minutes=45),  # provably late
    )

    summary = client.get("/delays/summary").json()
    assert summary["total_checked"] >= 1
    assert any(o["order_id"] == late.id and o["delay_status"] == "delayed" for o in summary["orders"])

    alerts = client.get("/delays/alerts").json()
    matching = [a for a in alerts if a["order_id"] == late.id and a["severity"] == "critical"]
    assert matching, "expected a critical alert for the late order"

    ack = client.patch(f"/delays/alerts/{matching[0]['id']}/ack")
    assert ack.status_code == 200

    remaining = client.get("/delays/alerts").json()
    assert not any(a["id"] == matching[0]["id"] for a in remaining)


def test_delay_scan_endpoint(client, db_session):
    response = client.post("/delays/scan")
    assert response.status_code == 200
    assert "orders" in response.json()


def test_analytics_endpoints(client, db_session):
    from conftest import make_driver, make_order

    driver = make_driver(db_session, name="MetricDriver", capacity=300)
    make_order(db_session, weight=40, priority=1, status="delivered", delivery_status="delivered", assigned_driver_id=driver.id)
    make_order(db_session, weight=60, priority=2, assigned_driver_id=driver.id)

    dashboard = client.get("/analytics/dashboard").json()
    assert dashboard["orders"]["total"] == 2
    assert dashboard["orders"]["delivered"] == 1
    assert dashboard["drivers"]["total"] == 1
    assert "on_time_sla_rate_pct" in dashboard

    performance = client.get("/analytics/performance").json()
    assert performance["driver_performance"][0]["total_orders"] >= 1

    comparison = client.get("/analytics/comparison").json()
    assert "distance_reduction_pct" in comparison
    assert "post_optimization_distance_km" in comparison


def test_settings_roundtrip(client):
    defaults = client.get("/settings/").json()
    assert defaults["solver_timeout_seconds"] == 5

    updated = client.put(
        "/settings/",
        json={
            "delay_warning_threshold_p1": 5,
            "delay_warning_threshold_p2": 10,
            "delay_warning_threshold_p3": 20,
            "solver_timeout_seconds": 8,
            "auto_reroute_on_delay": True,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["solver_timeout_seconds"] == 8
    assert updated.json()["delay_warning_threshold_p3"] == 20

    # Monotonic ordering enforced
    bad = client.put("/settings/", json={"delay_warning_threshold_p1": 40, "delay_warning_threshold_p2": 10})
    assert bad.status_code == 400