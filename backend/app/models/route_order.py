from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Boolean
from app.database import Base


class RouteOrder(Base):
    __tablename__ = "route_orders"

    route_id = Column(
        Integer,
        ForeignKey("routes.id", ondelete="CASCADE"),
        primary_key=True
    )

    stop_sequence = Column(
        Integer,
        primary_key=True
    )

    order_id = Column(
        Integer,
        ForeignKey("orders.id", ondelete="CASCADE"),
        nullable=False
    )

    stop_type = Column(
        String(20),
        default="delivery",
        nullable=False
    )

    estimated_arrival = Column(
        DateTime,
        nullable=True
    )

    completed = Column(
        Boolean,
        default=False
    )