from pydantic import BaseModel


class DriverLocationUpdate(BaseModel):
    latitude: float
    longitude: float