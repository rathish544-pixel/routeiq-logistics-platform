from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OrderCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    order_number: str | None = None
    customer_name: str | None = None
    pickup_address: str | None = None
    pickup_latitude: float = Field(ge=-90, le=90)
    pickup_longitude: float = Field(ge=-180, le=180)
    delivery_address: str | None = None
    delivery_latitude: float = Field(ge=-90, le=90)
    delivery_longitude: float = Field(ge=-180, le=180)
    weight: float = Field(gt=0)
    priority: int = Field(default=1, ge=1, le=3)
    delivery_deadline: datetime | None = None


class OrderUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    order_number: str | None = None
    customer_name: str | None = None
    pickup_address: str | None = None
    pickup_latitude: float | None = Field(default=None, ge=-90, le=90)
    pickup_longitude: float | None = Field(default=None, ge=-180, le=180)
    delivery_address: str | None = None
    delivery_latitude: float | None = Field(default=None, ge=-90, le=90)
    delivery_longitude: float | None = Field(default=None, ge=-180, le=180)
    weight: float | None = Field(default=None, gt=0)
    priority: int | None = Field(default=None, ge=1, le=3)
    delivery_deadline: datetime | None = None


def generate_order_number(order_id: int) -> str:
    return f"ORD-{9000 + order_id:04d}"