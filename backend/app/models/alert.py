from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class SystemAlert(Base):
    __tablename__ = "system_alerts"

    id = Column(Integer, primary_key=True, index=True)
    severity = Column(String(20), default="info", nullable=False)  # info, warning, critical
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=True)
    driver_id = Column(Integer, ForeignKey("drivers.id", ondelete="CASCADE"), nullable=True)
    route_id = Column(Integer, ForeignKey("routes.id", ondelete="CASCADE"), nullable=True)
    acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now(), nullable=True)
