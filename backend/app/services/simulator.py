import asyncio
import json
import logging
import random
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.driver import Driver
from app.services.redis_client import set_cache
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

TICK_SECONDS = 2.0

# Rough per-status movement behaviour (degrees per tick at ~Coimbatore latitude)
_MOVING_STATUSES = {"in_transit", "delivering"}
_DRIFT_MOVING = 0.0006
_DRIFT_IDLE = 0.00008


async def simulate_driver_movement():
    """Simulate GPS pings for active drivers: jitter when idle, drift when moving."""
    logger.info("Driver movement simulator tick started (interval %ss)", TICK_SECONDS)

    while True:
        db: Session = SessionLocal()
        try:
            drivers = (
                db.query(Driver)
                .filter(Driver.available == True, Driver.status != "offline")
                .all()
            )

            for driver in drivers:
                is_moving = driver.status in _MOVING_STATUSES
                drift = _DRIFT_MOVING if is_moving else _DRIFT_IDLE

                # Keep movement bounded near the driver's base so the demo stays coherent
                driver.latitude += random.uniform(-drift, drift)
                driver.longitude += random.uniform(-drift, drift)

                speed_kmh = round(random.uniform(18, 46), 1) if is_moving else 0.0
                heading = random.randint(0, 359) if is_moving else None

                recorded_at = datetime.now(timezone.utc).isoformat()

                payload = {
                    "driver_id": driver.id,
                    "driver_code": driver.driver_code,
                    "latitude": round(driver.latitude, 6),
                    "longitude": round(driver.longitude, 6),
                    "speed_kmh": speed_kmh,
                    "heading": heading,
                    "recorded_at": recorded_at,
                }

                set_cache(f"driver:{driver.id}:location", json.dumps(payload))
                await ws_manager.broadcast("driver_location_updated", payload)

            db.commit()

        except Exception as e:
            logger.exception("Simulator tick failed: %s", e)
            db.rollback()
        finally:
            db.close()

        await asyncio.sleep(TICK_SECONDS)