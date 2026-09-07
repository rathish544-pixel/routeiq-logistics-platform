import math

from app.services.distance import calculate_distance


def test_zero_distance_at_same_point():
    assert calculate_distance(11.0168, 76.9558, 11.0168, 76.9558) == 0.0


def test_known_city_gap():
    # Coimbatore city center -> airport road junction (~ 9.5 km)
    distance = calculate_distance(11.0168, 76.9558, 11.0299, 77.0420)
    assert 8 < distance < 13


def test_symmetry():
    a = calculate_distance(10.5, 76.2, 11.2, 77.1)
    b = calculate_distance(11.2, 77.1, 10.5, 76.2)
    assert math.isclose(a, b, rel_tol=1e-9)


def test_far_points():
    # New York <-> London ~ 5,570 km
    distance = calculate_distance(40.7128, -74.0060, 51.5074, -0.1278)
    assert 5200 < distance < 6000