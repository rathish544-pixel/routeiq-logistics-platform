from app.services.osrm import get_route_matrix


locations = [
    (11.0168, 76.9558),
    (11.0250, 76.9700),
    (11.0300, 76.9800),
]


result = get_route_matrix(locations)

print("DISTANCES (meters):")
print(result["distances"])

print("\nDURATIONS (seconds):")
print(result["durations"])