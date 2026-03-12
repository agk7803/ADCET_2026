# lidar_ws_server.py
import json
import serial
import threading
import time
import asyncio
from typing import Set, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI()

# allow cross-origin (HTTP). Note: WebSocket origin checks are performed
# by the server during handshake — 'await websocket.accept()' below allows connections.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# GLOBAL STREAM CONTROLS
# -------------------------
running = False            # Stream ON/OFF (set by /start /stop)
PORT = "COM21"             # ESP32 port - change if needed
BAUD = 115200

# Serial object (created on /start)
ser: Optional[serial.Serial] = None

# WebSocket clients set (kept and mutated from event-loop)
ws_clients: Set[WebSocket] = set()

# The event loop used to schedule broadcasts from the serial thread.
event_loop: Optional[asyncio.AbstractEventLoop] = None

# -------------------------
# Helper: broadcast coroutine (runs on event loop)
# -------------------------
async def broadcast_to_clients(data: dict):
    """
    Send `data` (JSON-serializable) to all connected websockets.
    Runs on the event loop.
    """
    dead = []
    for ws in list(ws_clients):
        try:
            await ws.send_json(data)
        except Exception:
            # Mark dead socket for removal
            dead.append(ws)

    for d in dead:
        try:
            ws_clients.remove(d)
        except KeyError:
            pass

# -------------------------
# SERIAL READER THREAD
# -------------------------
def serial_loop():
    """
    Background thread that reads serial lines and schedules broadcast
    on the FastAPI asyncio event loop.
    """
    global running, ser, event_loop

    # keep a short sleep when not running
    while True:
        if not running:
            time.sleep(0.1)
            continue

        if ser is None:
            # serial not opened yet
            time.sleep(0.1)
            continue

        try:
            raw = ser.readline().decode("utf-8", errors="ignore").strip()
        except Exception as e:
            print("Serial readline error:", e)
            time.sleep(0.1)
            continue

        if not raw:
            continue

        # Expect JSON object lines like {"lidar_mm": 420, "encoder_steps": 12345}
        if not (raw.startswith("{") and raw.endswith("}")):
            continue

        try:
            obj = json.loads(raw)
        except Exception as e:
            print("Serial JSON parse error:", e, "raw:", raw)
            continue

        lidar_mm = obj.get("lidar_mm")
        steps = obj.get("encoder_steps")

        if lidar_mm is None or steps is None:
            # ignore incomplete messages
            continue

        data = {
            "x": lidar_mm / 1000.0,   # meters
            "y": steps * 0.001        # encoder → meters (match your scaling)
        }

        # schedule broadcast on the main event loop
        if event_loop is not None:
            try:
                # returns a concurrent.futures.Future; we don't need the result
                asyncio.run_coroutine_threadsafe(broadcast_to_clients(data), event_loop)
            except Exception as e:
                print("Failed to schedule broadcast:", e)
        else:
            # event loop not set yet (server not started) — ignore or log
            print("Event loop not initialized; dropping data:", data)

# -------------------------
# REST API
# -------------------------
@app.post("/start")
def start():
    """
    Open serial port (if not already open) and start streaming.
    """
    global running, ser, PORT, BAUD
    try:
        if ser is None:
            ser = serial.Serial(PORT, BAUD, timeout=1)
        running = True
        return {"status": "started"}
    except Exception as e:
        return {"error": str(e)}

@app.post("/stop")
def stop():
    """
    Stop streaming (keeps serial open). If you want to close serial, add ser.close().
    """
    global running
    running = False
    return {"status": "stopped"}

# -------------------------
# WEBSOCKET ENDPOINT
# -------------------------
@app.websocket("/ws/lidar")
async def lidar_ws(websocket: WebSocket):
    """
    Accept websocket clients and keep connection open.
    We do not require the client to send messages; server pushes serial data.
    """
    # Accept connection (allowing all origins)
    await websocket.accept()
    # add to clients (this runs on the event loop)
    ws_clients.add(websocket)
    print("Client connected, total clients:", len(ws_clients))

    try:
        # Keep the connection alive; if the client sends anything remove or handle it.
        # We'll just wait for receive; when client disconnects this will raise.
        while True:
            # Optionally, you can wait for a ping/keepalive from the client:
            # text = await websocket.receive_text()
            # But if clients don't send, we just sleep to detect disconnects via send errors instead.
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        print("WebSocketDisconnect: client disconnected")
    except Exception as e:
        print("Websocket error:", e)
    finally:
        # Remove client if present
        try:
            ws_clients.remove(websocket)
        except KeyError:
            pass
        print("Client removed, total clients:", len(ws_clients))

# -------------------------
# Startup handler: capture event loop and start serial thread
# -------------------------
@app.on_event("startup")
def on_startup():
    global event_loop
    # get_running_loop cannot be called here (sync context), but asyncio.get_event_loop()
    # in uvicorn main thread will return the server's loop in startup handler.
    event_loop = asyncio.get_event_loop()
    # start the serial reader thread (daemon so it dies with process)
    t = threading.Thread(target=serial_loop, daemon=True)
    t.start()
    print("Serial thread started; event loop captured.")

# -------------------------
# Shutdown handler: cleanup serial
# -------------------------
@app.on_event("shutdown")
def on_shutdown():
    global ser, running
    running = False
    try:
        if ser is not None:
            ser.close()
            ser = None
    except Exception:
        pass
    print("Shutdown: serial closed.")

# -------------------------
# Run server
# -------------------------
if __name__ == "__main__":
    uvicorn.run("lidar_ws_server:app", host="0.0.0.0", port=8000, reload=False)
