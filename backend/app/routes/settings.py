from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.setting import AppSetting
from app.core.config import settings as env_settings
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/settings", tags=["Settings"])

SETTINGS_KEY = "operational"

DEFAULTS: dict = {
    "delay_warning_threshold_p1": env_settings.DELAY_WARNING_P1_MINUTES,
    "delay_warning_threshold_p2": env_settings.DELAY_WARNING_P2_MINUTES,
    "delay_warning_threshold_p3": env_settings.DELAY_WARNING_P3_MINUTES,
    "solver_timeout_seconds": env_settings.OPTIMIZER_TIMEOUT_SECONDS,
    "default_service_time_minutes": env_settings.DEFAULT_SERVICE_TIME_MINUTES,
    "auto_reroute_on_delay": True,
    "map_center_latitude": 11.0168,
    "map_center_longitude": 76.9558,
    "map_zoom_level": 13,
}


class OperationSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    delay_warning_threshold_p1: int | None = Field(default=None, ge=0, le=180)
    delay_warning_threshold_p2: int | None = Field(default=None, ge=0, le=180)
    delay_warning_threshold_p3: int | None = Field(default=None, ge=0, le=180)
    solver_timeout_seconds: int | None = Field(default=None, ge=1, le=120)
    default_service_time_minutes: int | None = Field(default=None, ge=0, le=120)
    auto_reroute_on_delay: bool | None = None
    map_center_latitude: float | None = Field(default=None, ge=-90, le=90)
    map_center_longitude: float | None = Field(default=None, ge=-180, le=180)
    map_zoom_level: int | None = Field(default=None, ge=1, le=19)


def _read_settings(db: Session) -> dict:
    row = db.query(AppSetting).filter(AppSetting.key == SETTINGS_KEY).first()
    if row is None:
        return dict(DEFAULTS)
    stored = row.value or {}
    merged = dict(DEFAULTS)
    merged.update({k: v for k, v in stored.items() if k in DEFAULTS})
    return merged


@router.get("/")
def get_settings(db: Session = Depends(get_db)):
    return _read_settings(db)


@router.put("/")
async def update_settings(payload: OperationSettingsUpdate, db: Session = Depends(get_db)):
    current = _read_settings(db)
    changes = payload.model_dump(exclude_unset=True)
    current.update(changes)

    # Ordering sanity: P1 <= P2 <= P3 warning windows
    if not (current["delay_warning_threshold_p1"] <= current["delay_warning_threshold_p2"] <= current["delay_warning_threshold_p3"]):
        raise HTTPException(
            status_code=400,
            detail="Delay warning windows must be ordered P1 ≤ P2 ≤ P3 (urgency grows with priority).",
        )

    row = db.query(AppSetting).filter(AppSetting.key == SETTINGS_KEY).first()
    if row is None:
        row = AppSetting(key=SETTINGS_KEY, value=current)
        db.add(row)
    else:
        row.value = current

    db.commit()

    await ws_manager.broadcast("settings_updated", {"key": SETTINGS_KEY, "updated": sorted(changes.keys())})

    return _read_settings(db)