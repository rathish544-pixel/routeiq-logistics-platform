import logging
import requests
from app.core.config import settings
from app.services.distance import calculate_distance

logger = logging.getLogger(__name__)


def _fallback_route_matrix(locations):
    """Calculates distance (m) and duration (s) using haversine road approximation."""
    n = len(locations)
    distances = [[0.0] * n for _ in range(n)]
    durations = [[0.0] * n for _ in range(n)]

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            # Approximate road distance: ~1.28x direct haversine
            dist_km = calculate_distance(
                locations[i][0], locations[i][1],
                locations[j][0], locations[j][1]
            ) * 1.28
            dist_meters = dist_km * 1000.0
            # Average city delivery speed: ~35 km/h = 9.72 m/s
            duration_sec = dist_meters / 9.72
            distances[i][j] = round(dist_meters, 1)
            durations[i][j] = round(duration_sec, 1)

    return {"distances": distances, "durations": durations}


def get_route_matrix(locations):
    if not locations:
        return None

    try:
        coordinates = ";".join(
            f"{longitude},{latitude}"
            for latitude, longitude in locations
        )

        url = f"{settings.OSRM_URL}/table/v1/driving/{coordinates}"
        params = {"annotations": "duration,distance"}

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get("code") == "Ok" and "durations" in data and "distances" in data:
            return {
                "durations": data["durations"],
                "distances": data["distances"]
            }
    except Exception as e:
        logger.warning(f"OSRM table request failed, using haversine fallback: {e}")

    return _fallback_route_matrix(locations)



# =========================================================
# ACTUAL ROAD ROUTE GEOMETRY
# =========================================================

def get_route_geometry(locations):
    """
    Get actual road-following route from OSRM.

    locations:
        [
            (latitude, longitude),
            (latitude, longitude),
            ...
        ]

    Returns GeoJSON coordinates:
        [
            [longitude, latitude],
            [longitude, latitude],
            ...
        ]
    """
    if len(locations) < 2:
        return []

    try:
        coordinates = ";".join(
            f"{longitude},{latitude}"
            for latitude, longitude in locations
        )

        url = f"{settings.OSRM_URL}/route/v1/driving/{coordinates}"
        params = {
            "overview": "full",
            "geometries": "geojson",
            "steps": "false"
        }

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get("code") == "Ok" and data.get("routes"):
            return data["routes"][0]["geometry"]["coordinates"]
    except Exception as e:
        logger.warning(f"OSRM geometry request failed, using direct coordinates: {e}")

    # Fallback: direct line coordinates [longitude, latitude]
    return [[lon, lat] for lat, lon in locations]