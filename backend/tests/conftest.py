import os
import sys
from pathlib import Path

# Test environment before any app module import (disables the movement simulator)
os.environ.setdefault("ENVIRONMENT", "test")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure the backend package is importable from the tests directory
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.core.security import require_user, UserIdentity  # noqa: E402


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = testing_session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    """TestClient wired to the isolated DB with an authenticated ops identity."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    def override_require_user():
        return UserIdentity(
            sub="test-controller",
            email="qa@routeiq.test",
            name="QA Controller",
            role="Logistics Mission Controller",
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[require_user] = override_require_user

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture()
def auth_headers():
    return {"Authorization": "Bearer test-token"}


def make_order(
    db,
    *,
    pickup=(11.0168, 76.9558),
    delivery=(11.0350, 76.9720),
    weight=15.0,
    priority=1,
    status="pending",
    delivery_status="pending",
    deadline=None,
    eta=None,
    assigned_driver_id=None,
):
    from app.models.order import Order

    order = Order(
        pickup_latitude=pickup[0],
        pickup_longitude=pickup[1],
        delivery_latitude=delivery[0],
        delivery_longitude=delivery[1],
        weight=weight,
        priority=priority,
        delivery_deadline=deadline,
        status=status,
        delivery_status=delivery_status,
        estimated_arrival=eta,
        assigned_driver_id=assigned_driver_id,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def make_driver(db, *, name="Test Driver", capacity=100.0, status="idle", available=True, lat=11.02, lon=76.96):
    from app.models.driver import Driver

    driver = Driver(
        name=name,
        latitude=lat,
        longitude=lon,
        vehicle_capacity=capacity,
        status=status,
        available=available,
    )
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver