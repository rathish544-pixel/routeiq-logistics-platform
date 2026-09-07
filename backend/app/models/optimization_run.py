from sqlalchemy import Column, Integer, Float, String, DateTime, JSON
from sqlalchemy.sql import func
from app.database import Base


class OptimizationRun(Base):
    __tablename__ = "optimization_runs"

    id = Column(Integer, primary_key=True, index=True)
    total_orders = Column(Integer, default=0)
    total_drivers = Column(Integer, default=0)
    routes_count = Column(Integer, default=0)
    total_distance_km = Column(Float, default=0.0)
    execution_time_seconds = Column(Float, default=0.0)
    status = Column(String(30), default="completed")
    summary = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now(), nullable=True)
