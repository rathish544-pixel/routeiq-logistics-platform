from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    driver_code = Column(String(50), unique=True, index=True, nullable=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(50), nullable=True)
    vehicle_type = Column(String(50), default="Van", nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    vehicle_capacity = Column(Float, nullable=False)
    available = Column(Boolean, default=True)
    status = Column(String(30), default="idle")
    created_at = Column(DateTime, server_default=func.now(), nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=True)