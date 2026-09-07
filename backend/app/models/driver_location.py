from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class DriverLocation(Base):
    __tablename__ = "driver_locations"

    id = Column(
        Integer,
        primary_key=True,
        index=True
    )

    driver_id = Column(
        Integer,
        ForeignKey(
            "drivers.id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    latitude = Column(
        Float,
        nullable=False
    )

    longitude = Column(
        Float,
        nullable=False
    )

    recorded_at = Column(
        DateTime,
        server_default=func.now()
    )