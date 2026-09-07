from pydantic import BaseModel, ConfigDict, Field

VALID_DRIVER_STATUSES = {"idle", "assigned", "in_transit", "delivering", "offline"}


class DriverCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    driver_code: str | None = None
    name: str
    phone: str | None = None
    vehicle_type: str | None = "Cargo Van"
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    vehicle_capacity: float = Field(gt=0)


class DriverUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    driver_code: str | None = None
    name: str | None = None
    phone: str | None = None
    vehicle_type: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    vehicle_capacity: float | None = Field(default=None, gt=0)


class DriverStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str
    available: bool | None = None


def generate_driver_code(driver_id: int) -> str:
    return f"DRV-{400 + driver_id:03d}"