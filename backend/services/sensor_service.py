import asyncio
import logging
import json
from typing import List
from fastapi import WebSocket, WebSocketDisconnect

from backend import sensors

logger = logging.getLogger("itms.sensor_service")

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        to_remove = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                to_remove.append(connection)
        
        for conn in to_remove:
            self.disconnect(conn)

manager = ConnectionManager()

# Global loop for background tasks
_app_loop = None

def setup_sensor_callbacks(loop):
    global _app_loop
    _app_loop = loop
    
    def bridge_callback(data):
        if _app_loop and _app_loop.is_running():
            asyncio.run_coroutine_threadsafe(manager.broadcast(data), _app_loop)
    
    sensors.set_broadcast_callback(bridge_callback)
