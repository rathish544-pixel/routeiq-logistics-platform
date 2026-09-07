from app.services.distance import calculate_distance

AVG_DELIVERY_SPEED_KMH = 32.0  # urban city delivery average


def _estimate_travel_time_minutes(distance_km: float) -> float:
    if distance_km <= 0:
        return 0.0
    return round((distance_km / AVG_DELIVERY_SPEED_KMH) * 60, 1)


def _capacity_fit_score(order_weight: float, capacity: float) -> tuple[float, str]:
    """Prefer drivers whose remaining capacity comfortably fits the order."""
    if capacity <= 0:
        return 0.0, "No capacity"
    utilization = order_weight / capacity
    if utilization > 1.0:
        return 0.0, "Exceeds capacity"
    # Ideal band 20%-85% utilization; score peaks mid-band
    if utilization <= 0.20:
        score = 40 + (utilization / 0.20) * 60
    elif utilization <= 0.85:
        score = 100
    else:
        score = 100 - ((utilization - 0.85) / 0.15) * 55
    return round(max(0, min(100, score)), 1), f"Utilization {utilization * 100:.0f}%"


def _status_score(driver_status: str) -> tuple[float, str]:
    mapping = {
        "idle": (100.0, "Idle & ready"),
        "assigned": (55.0, "Has active backlog"),
        "in_transit": (0.0, "In transit"),
        "delivering": (0.0, "Actively delivering"),
        "offline": (0.0, "Offline"),
    }
    score, reason = mapping.get(driver_status, (0.0, driver_status))
    return score, reason


def score_driver_for_order(order, driver, drivers_for_distance: list | None = None) -> dict | None:
    """Score one driver against an order. Returns None when ineligible."""
    if not driver.available:
        return None
    if driver.status not in {"idle", "assigned"}:
        return None
    if driver.vehicle_capacity < order.weight:
        return None

    distance_km = calculate_distance(
        driver.latitude, driver.longitude,
        order.pickup_latitude, order.pickup_longitude,
    )

    capacity_score, capacity_reason = _capacity_fit_score(order.weight, driver.vehicle_capacity)
    status_score, status_reason = _status_score(driver.status)

    # Distance: score relative to the eligible pool (nearest = 100)
    if drivers_for_distance:
        max_dist = max(
            (
                calculate_distance(
                    d.latitude, d.longitude,
                    order.pickup_latitude, order.pickup_longitude,
                )
                for d in drivers_for_distance
            ),
            default=1.0,
        )
        distance_score = 100.0 * (1.0 - (distance_km / max_dist if max_dist > 0 else 0))
    else:
        # Absolute heuristic: within 3 km ideal, beyond 15 km poor
        distance_score = max(0.0, 100.0 - (distance_km / 15.0) * 100.0)

    # Weighted composite: distance 40 / capacity 25 / status 20 / headline margin 15
    total = (
        0.40 * distance_score
        + 0.25 * capacity_score
        + 0.20 * status_score
        + 0.15 * (100.0 if distance_km < 10 else max(0.0, 100.0 - (distance_km - 10) * 5))
    )
    total = round(max(0.0, min(100.0, total)), 1)

    reasoning = (
        f"{status_reason}; {capacity_reason}; "
        f"{distance_km:.1f} km to pickup (~{_estimate_travel_time_minutes(distance_km):.0f} min travel)."
    )

    return {
        "driver": driver,
        "distance_km": round(distance_km, 2),
        "score": total,
        "score_breakdown": {
            "distance": round(distance_score, 1),
            "capacity": capacity_score,
            "driver_status": status_score,
            "proximity_margin": round(min(100.0, distance_km < 10 and 100.0 or max(0.0, 100.0 - (distance_km - 10) * 5)), 1),
        },
        "reasoning": reasoning,
    }


def find_best_driver(order, drivers):
    """Score every eligible driver and return the best candidate + its distance."""
    candidates = []
    for driver in drivers:
        scored = score_driver_for_order(order, driver, drivers_for_distance=drivers)
        if scored:
            candidates.append(scored)

    if not candidates:
        return None, float("inf")

    best = max(candidates, key=lambda c: c["score"])
    return best["driver"], best["distance_km"]


def pick_specific_driver(order, driver, drivers_for_distance=None) -> dict | None:
    """Score an explicitly requested driver (or None if ineligible)."""
    if driver is None:
        return None
    return score_driver_for_order(order, driver, drivers_for_distance) if driver.available else None


def build_assignment_payload(order, driver, scored: dict | None) -> dict:
    distance_km = scored["distance_km"] if scored else calculate_distance(
        driver.latitude, driver.longitude, order.pickup_latitude, order.pickup_longitude
    )
    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "driver_id": driver.id,
        "driver_name": driver.name,
        "driver_code": driver.driver_code,
        "status": "assigned",
        "distance_to_pickup_km": round(distance_km, 2),
        "estimated_travel_time_minutes": _estimate_travel_time_minutes(distance_km),
        "vehicle_capacity_kg": driver.vehicle_capacity,
        "order_weight_kg": order.weight,
        "capacity_utilization_pct": round(
            (order.weight / driver.vehicle_capacity) * 100 if driver.vehicle_capacity else 0, 1
        ),
        "score": scored["score"] if scored else 50.0,
        "score_breakdown": scored["score_breakdown"] if scored else None,
        "reasoning": scored["reasoning"] if scored else "Driver selected by operator override.",
    }