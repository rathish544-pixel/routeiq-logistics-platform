import json
import logging
from datetime import datetime
from typing import Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total active: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total active: {len(self.active_connections)}")

    async def broadcast(self, event_type: str, data: dict):
        """
        Broadcasts typed real-time events to all connected clients.
        Events include:
        - driver_location_updated
        - driver_status_changed
        - order_status_changed
        - route_updated
        - order_delay_detected
        - optimization_completed
        - alert_created
        """
        if not self.active_connections:
            return

        payload = json.dumps({
            "event": event_type,
            "timestamp": datetime.now().isoformat(),
            "data": data
        })

        dead_connections = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(payload)
            except Exception as e:
                logger.warning(f"Failed to send to websocket: {e}")
                dead_connections.append(connection)

        for dead in dead_connections:
            self.active_connections.discard(dead)


ws_manager = WebSocketManager()
