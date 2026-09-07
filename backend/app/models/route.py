from sqlalchemy import Column, Integer, Float, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, index=True)
    route_code = Column(String(50), unique=True, index=True, nullable=True)

    driver_id = Column(
        Integer,
        ForeignKey("drivers.id")
    )

    total_distance = Column(
        Float,
        default=0
    )

    estimated_duration = Column(
        Integer,
        default=0
    )

    status = Column(
        String(30),
        default="planned"
    )

    created_at = Column(
        DateTime,
        server_default=func.now(),
        nullable=True
    )

    updated_at = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now(),
        nullable=True
    )