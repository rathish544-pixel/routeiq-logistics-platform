from datetime import datetime, timedelta

from ortools.constraint_solver import (
    pywrapcp,
    routing_enums_pb2,
)

from app.services.osrm import get_route_matrix


def optimize_multi_driver(drivers, orders):

    if not drivers or not orders:
        return None

    SERVICE_TIME_MINUTES = 10

    planning_start = datetime(
        2026, 9, 7, 8, 0
    )

    locations = []

    for driver in drivers:
        locations.append(
            (
                driver.latitude,
                driver.longitude,
            )
        )

    for order in orders:
        locations.append(
            (
                order.pickup_latitude,
                order.pickup_longitude,
            )
        )

        locations.append(
            (
                order.delivery_latitude,
                order.delivery_longitude,
            )
        )

    num_vehicles = len(drivers)

    starts = list(range(num_vehicles))
    ends = list(range(num_vehicles))

    pickup_nodes = {}
    delivery_nodes = {}

    current_node = num_vehicles

    for order_index, order in enumerate(orders):

        pickup_nodes[order_index] = current_node
        delivery_nodes[order_index] = current_node + 1

        current_node += 2

    road_matrix = get_route_matrix(
        locations
    )

    if not road_matrix:
        return None

    distances = road_matrix["distances"]
    durations = road_matrix["durations"]

    manager = pywrapcp.RoutingIndexManager(
        len(locations),
        num_vehicles,
        starts,
        ends,
    )

    routing = pywrapcp.RoutingModel(
        manager
    )

    def distance_callback(
        from_index,
        to_index,
    ):

        from_node = manager.IndexToNode(
            from_index
        )

        to_node = manager.IndexToNode(
            to_index
        )

        distance = distances[
            from_node
        ][
            to_node
        ]

        if distance is None:
            return 10_000_000

        return int(distance)

    distance_callback_index = (
        routing.RegisterTransitCallback(
            distance_callback
        )
    )

    routing.SetArcCostEvaluatorOfAllVehicles(
        distance_callback_index
    )

    def demand_callback(
        from_index,
    ):

        node = manager.IndexToNode(
            from_index
        )

        if node < num_vehicles:
            return 0

        for order_index, order in enumerate(orders):

            if node == pickup_nodes[order_index]:
                return int(order.weight)

            if node == delivery_nodes[order_index]:
                return -int(order.weight)

        return 0

    demand_callback_index = (
        routing.RegisterUnaryTransitCallback(
            demand_callback
        )
    )

    capacities = [
        int(driver.vehicle_capacity)
        for driver in drivers
    ]

    routing.AddDimensionWithVehicleCapacity(
        demand_callback_index,
        0,
        capacities,
        True,
        "Capacity",
    )

    def time_callback(
        from_index,
        to_index,
    ):

        from_node = manager.IndexToNode(
            from_index
        )

        to_node = manager.IndexToNode(
            to_index
        )

        travel_seconds = durations[
            from_node
        ][
            to_node
        ]

        if travel_seconds is None:
            return 10_000

        travel_minutes = (
            travel_seconds / 60
        )

        if to_node >= num_vehicles:
            travel_minutes += (
                SERVICE_TIME_MINUTES
            )

        return int(
            travel_minutes
        )

    time_callback_index = (
        routing.RegisterTransitCallback(
            time_callback
        )
    )

    routing.AddDimension(
        time_callback_index,
        120,
        24 * 60,
        False,
        "Time",
    )

    time_dimension = (
        routing.GetDimensionOrDie(
            "Time"
        )
    )

    for order_index in range(
        len(orders)
    ):

        pickup_node = pickup_nodes[
            order_index
        ]

        delivery_node = delivery_nodes[
            order_index
        ]

        pickup_index = (
            manager.NodeToIndex(
                pickup_node
            )
        )

        delivery_index = (
            manager.NodeToIndex(
                delivery_node
            )
        )

        routing.AddPickupAndDelivery(
            pickup_index,
            delivery_index,
        )

        routing.solver().Add(
            routing.VehicleVar(
                pickup_index
            )
            ==
            routing.VehicleVar(
                delivery_index
            )
        )

        routing.solver().Add(
            time_dimension.CumulVar(
                pickup_index
            )
            <=
            time_dimension.CumulVar(
                delivery_index
            )
        )

    for order_index, order in enumerate(
        orders
    ):

        delivery_node = delivery_nodes[
            order_index
        ]

        delivery_index = (
            manager.NodeToIndex(
                delivery_node
            )
        )

        if order.delivery_deadline:

            deadline = order.delivery_deadline

            minutes_from_start = int(
                (
                    deadline
                    - planning_start
                ).total_seconds()
                / 60
            )

            minutes_from_start = max(
                0,
                minutes_from_start,
            )

            time_dimension.CumulVar(
                delivery_index
            ).SetRange(
                0,
                minutes_from_start,
            )

            priority = max(
                1,
                int(order.priority),
            )

            penalty = (
                priority * 100000
            )

            time_dimension.SetCumulVarSoftUpperBound(
                delivery_index,
                minutes_from_start,
                penalty,
            )

    search_parameters = (
        pywrapcp.DefaultRoutingSearchParameters()
    )

    search_parameters.first_solution_strategy = (
        routing_enums_pb2.FirstSolutionStrategy
        .PATH_CHEAPEST_ARC
    )

    search_parameters.local_search_metaheuristic = (
        routing_enums_pb2.LocalSearchMetaheuristic
        .GUIDED_LOCAL_SEARCH
    )

    search_parameters.time_limit.seconds = 5

    solution = routing.SolveWithParameters(
        search_parameters
    )

    if not solution:
        return None

    routes = []

    for vehicle_id in range(
        num_vehicles
    ):

        index = routing.Start(
            vehicle_id
        )

        route_orders = []

        total_distance = 0
        total_weight = 0
        current_load = 0
        stop_sequence = 0

        while not routing.IsEnd(
            index
        ):

            node = manager.IndexToNode(
                index
            )

            next_index = solution.Value(
                routing.NextVar(index)
            )

            next_node = manager.IndexToNode(
                next_index
            )

            segment_distance = (
                distances[node][next_node]
            )

            if segment_distance is not None:
                total_distance += (
                    segment_distance / 1000
                )

            # -------------------------------------------------
            # PICKUP
            # -------------------------------------------------

            pickup_order_index = None

            for order_index in range(
                len(orders)
            ):

                if (
                    node
                    ==
                    pickup_nodes[
                        order_index
                    ]
                ):
                    pickup_order_index = (
                        order_index
                    )
                    break

            if pickup_order_index is not None:

                order = orders[
                    pickup_order_index
                ]

                current_load += order.weight

                stop_sequence += 1

                arrival_minutes = (
                    solution.Value(
                        time_dimension.CumulVar(
                            index
                        )
                    )
                )

                arrival_time = (
                    planning_start
                    +
                    timedelta(
                        minutes=arrival_minutes
                    )
                )

                route_orders.append(
                    {
                        "stop_sequence":
                            stop_sequence,

                        "order_id":
                            order.id,

                        "stop_type":
                            "pickup",

                        "latitude":
                            order.pickup_latitude,

                        "longitude":
                            order.pickup_longitude,

                        "weight":
                            order.weight,

                        "priority":
                            order.priority,

                        "vehicle_load":
                            current_load,

                        "estimated_arrival":
                            arrival_time.isoformat(),
                    }
                )

            # -------------------------------------------------
            # DELIVERY
            # -------------------------------------------------

            delivery_order_index = None

            for order_index in range(
                len(orders)
            ):

                if (
                    node
                    ==
                    delivery_nodes[
                        order_index
                    ]
                ):
                    delivery_order_index = (
                        order_index
                    )
                    break

            if delivery_order_index is not None:

                order = orders[
                    delivery_order_index
                ]

                current_load -= order.weight

                stop_sequence += 1

                arrival_minutes = (
                    solution.Value(
                        time_dimension.CumulVar(
                            index
                        )
                    )
                )

                arrival_time = (
                    planning_start
                    +
                    timedelta(
                        minutes=arrival_minutes
                    )
                )

                deadline = (
                    order.delivery_deadline
                )

                if deadline:

                    delivery_status = (
                        "on_time"
                        if arrival_time <= deadline
                        else "late"
                    )

                else:

                    delivery_status = (
                        "no_deadline"
                    )

                # -------------------------------------------------
                # SAVE REAL ETA + DELIVERY STATUS
                # -------------------------------------------------

                order.estimated_arrival = (
                    arrival_time
                )

                order.delivery_status = (
                    delivery_status
                )

                route_orders.append(
                    {
                        "stop_sequence":
                            stop_sequence,

                        "order_id":
                            order.id,

                        "stop_type":
                            "delivery",

                        "latitude":
                            order.delivery_latitude,

                        "longitude":
                            order.delivery_longitude,

                        "weight":
                            order.weight,

                        "priority":
                            order.priority,

                        "vehicle_load":
                            current_load,

                        "estimated_arrival":
                            arrival_time.isoformat(),

                        "deadline":
                            (
                                deadline.isoformat()
                                if deadline
                                else None
                            ),

                        "delivery_status":
                            delivery_status,
                    }
                )

                total_weight += order.weight

            index = next_index

        # =====================================================
        # ROUTE DURATION
        # =====================================================

        if route_orders:

            final_time = solution.Value(
                time_dimension.CumulVar(
                    index
                )
            )

        else:

            final_time = 0

        routes.append(
            {
                "driver_id":
                    drivers[
                        vehicle_id
                    ].id,

                "driver_name":
                    drivers[
                        vehicle_id
                    ].name,

                "vehicle_capacity":
                    drivers[
                        vehicle_id
                    ].vehicle_capacity,

                "total_weight":
                    total_weight,

                "total_distance_km":
                    round(
                        total_distance,
                        2,
                    ),

                "estimated_duration_minutes":
                    final_time,

                "orders":
                    route_orders,
            }
        )

    return routes