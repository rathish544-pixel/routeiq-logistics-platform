import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.security import require_user, UserIdentity
from app.models.driver import Driver
from app.models.driver_location import DriverLocation
from app.schemas.driver_location import DriverLocationUpdate
from app.services.redis_client import set_cache, get_cache, get_json
from app.services.websocket_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tracking", tags=["Tracking"])


@router.post("/driver/{driver_id}/location")
def update_driver_location(
    driver_id: int,
    location: DriverLocationUpdate,
    db: Session = Depends(get_db),
    _: UserIdentity = Depends(require_user),
):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    driver.latitude = location.latitude
    driver.longitude = location.longitude

    location_record = DriverLocation(
        driver_id=driver_id,
        latitude=location.latitude,
        longitude=location.longitude,
    )

    db.add(location_record)
    db.commit()
    db.refresh(location_record)

    payload = {
        "driver_id": driver_id,
        "driver_code": driver.driver_code,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "speed_kmh": location.speed_kmh,
        "heading": location.heading,
        "recorded_at": location_record.recorded_at.isoformat() if location_record.recorded_at else None,
    }

    set_cache(f"driver:{driver_id}:location", json.dumps(payload))

    # Fire-and-forget broadcast (endpoint stays fast for telemetry ingestion)
    asyncio.create_task(ws_manager.broadcast("driver_location_updated", payload))

    return {"message": "Driver location updated", **payload}


@router.get("/driver/{driver_id}/location")
def get_driver_location(
    driver_id: int,
    db: Session = Depends(get_db),
    _: UserIdentity = Depends(require_user),
):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    latest_location = (
        db.query(DriverLocation)
        .filter(DriverLocation.driver_id == driver_id)
        .order_by(DriverLocation.recorded_at.desc())
        .first()
    )

    if not latest_location:
        raise HTTPException(status_code=404, detail="No location history found")

    return {
        "driver_id": driver.id,
        "driver_code": driver.driver_code,
        "driver_name": driver.name,
        "latitude": latest_location.latitude,
        "longitude": latest_location.longitude,
        "recorded_at": latest_location.recorded_at,
    }


@router.get("/driver/{driver_id}/history")
def get_driver_location_history(
    driver_id: int,
    db: Session = Depends(get_db),
    _: UserIdentity = Depends(require_user),
):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    locations = (
        db.query(DriverLocation)
        .filter(DriverLocation.driver_id == driver_id)
        .order_by(DriverLocation.recorded_at.asc())
        .limit(2000)
        .all()
    )

    return {
        "driver_id": driver.id,
        "driver_name": driver.name,
        "total_points": len(locations),
        "locations": [
            {
                "latitude": location.latitude,
                "longitude": location.longitude,
                "recorded_at": location.recorded_at,
            }
            for location in locations
        ],
    }


@router.get("/driver/{driver_id}/live")
def get_live_driver_location(driver_id: int):
    location = get_json(f"driver:{driver_id}:location")

    if not location:
        raise HTTPException(status_code=404, detail="Live location not found")

    return location


# =============================================================
# GLOBAL REAL-TIME EVENT HUB
# All fleet telemetry events stream here:
#   driver_location_updated, driver_status_changed,
#   order_status_changed, order_created, order_assigned,
#   route_updated, order_delay_detected, alert_created,
#   optimization_completed
# =============================================================

@router.websocket("/ws/events")
async def events_websocket(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive; broadcasts push events to clients.
            # Client pings ("ping") are answered to detect dead sockets.
            message = await websocket.receive_text()
            if message.strip().lower() in {"ping", "heartbeat"}:
                await websocket.send_text(json.dumps({"event": "pong", "timestamp": None, "data": {}}))
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning("Events websocket closed: %s", e)
        ws_manager.disconnect(websocket)


@router.websocket("/ws/driver/{driver_id}")
async def driver_tracking_websocket(websocket: WebSocket, driver_id: int):
    await websocket.accept()

    try:
        while True:
            location = get_cache(f"driver:{driver_id}:location")

            if location:
                await websocket.send_text(location)

            await asyncio.sleep(2)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass