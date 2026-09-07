from app.services.osrm import get_route_matrix


def calculate_dynamic_route(
    driver_location,
    remaining_stops,
    vehicle_capacity=999999,
):
    """
    Dynamic rerouting with:

    1. Pickup before delivery
    2. Vehicle capacity constraint
    3. Priority-aware stop selection
    4. Current driver location as route starting point
    """

    if not remaining_stops:
        return {
            "stops": [],
            "total_distance_km": 0,
            "estimated_duration_minutes": 0,
        }

    # Group stops by order
    orders = {}

    for stop in remaining_stops:
        order_id = stop["order_id"]

        if order_id not in orders:
            orders[order_id] = {
                "pickup": None,
                "delivery": None,
                "weight": stop.get("weight", 0),
                "priority": stop.get("priority", 1),
            }

        if stop["stop_type"] == "pickup":
            orders[order_id]["pickup"] = stop

        elif stop["stop_type"] == "delivery":
            orders[order_id]["delivery"] = stop

    # Build all possible locations for OSRM
    locations = [driver_location]

    stop_lookup = []

    for order_id, data in orders.items():

        if data["pickup"] is not None:
            locations.append(
                (
                    data["pickup"]["latitude"],
                    data["pickup"]["longitude"],
                )
            )

            stop_lookup.append(
                {
                    "order_id": order_id,
                    "stop_type": "pickup",
                    "latitude": data["pickup"]["latitude"],
                    "longitude": data["pickup"]["longitude"],
                    "weight": data["weight"],
                    "priority": data["priority"],
                }
            )

        if data["delivery"] is not None:
            locations.append(
                (
                    data["delivery"]["latitude"],
                    data["delivery"]["longitude"],
                )
            )

            stop_lookup.append(
                {
                    "order_id": order_id,
                    "stop_type": "delivery",
                    "latitude": data["delivery"]["latitude"],
                    "longitude": data["delivery"]["longitude"],
                    "weight": data["weight"],
                    "priority": data["priority"],
                }
            )

    matrix = get_route_matrix(locations)

    durations = matrix["durations"]
    distances = matrix["distances"]

    remaining = list(range(1, len(locations)))

    picked_up = set()
    delivered = set()

    current_index = 0
    current_load = 0

    total_distance = 0
    total_duration = 0

    route = []

    while remaining:

        candidates = []

        for index in remaining:

            stop = stop_lookup[index - 1]
            order_id = stop["order_id"]
            stop_type = stop["stop_type"]

            # ------------------------------------------------
            # PICKUP RULE
            # ------------------------------------------------

            if stop_type == "pickup":

                # Already picked up
                if order_id in picked_up:
                    continue

                # Capacity check
                weight = stop["weight"]

                if current_load + weight > vehicle_capacity:
                    continue

                candidates.append(
                    (
                        index,
                        stop,
                        False,
                    )
                )

            # ------------------------------------------------
            # DELIVERY RULE
            # ------------------------------------------------

            elif stop_type == "delivery":

                # Cannot deliver before pickup
                if order_id not in picked_up:
                    continue

                # Already delivered
                if order_id in delivered:
                    continue

                candidates.append(
                    (
                        index,
                        stop,
                        True,
                    )
                )

        if not candidates:
            break

        # ------------------------------------------------
        # SELECT BEST NEXT STOP
        # ------------------------------------------------

        def score(candidate):

            index, stop, is_delivery = candidate

            duration = durations[current_index][index]

            if duration is None:
                duration = float("inf")

            # Higher priority = stronger preference
            priority_bonus = stop["priority"] * 300

            # Deliveries get additional preference
            delivery_bonus = 500 if is_delivery else 0

            return duration - priority_bonus - delivery_bonus

        selected = min(
            candidates,
            key=score,
        )

        next_index, stop, is_delivery = selected

        duration = durations[current_index][next_index]
        distance = distances[current_index][next_index]

        if duration is None or distance is None:
            remaining.remove(next_index)
            continue

        total_duration += duration
        total_distance += distance

        # ------------------------------------------------
        # UPDATE LOAD / ORDER STATE
        # ------------------------------------------------

        if stop["stop_type"] == "pickup":

            picked_up.add(
                stop["order_id"]
            )

            current_load += stop["weight"]

        else:

            delivered.add(
                stop["order_id"]
            )

            current_load -= stop["weight"]

        route.append(
            {
                "order_id": stop["order_id"],
                "stop_type": stop["stop_type"],
                "latitude": stop["latitude"],
                "longitude": stop["longitude"],
                "weight": stop["weight"],
                "priority": stop["priority"],
                "vehicle_load": current_load,
                "travel_time_seconds": round(
                    duration,
                    2,
                ),
                "distance_meters": round(
                    distance,
                    2,
                ),
            }
        )

        current_index = next_index
        remaining.remove(next_index)

    return {
        "stops": route,
        "total_distance_km": round(
            total_distance / 1000,
            2,
        ),
        "estimated_duration_minutes": round(
            total_duration / 60,
            2,
        ),
    }