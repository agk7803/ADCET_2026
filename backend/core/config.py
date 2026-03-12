import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Find backend root (where .env is)
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Server Config
PORT = int(os.getenv("PORT", 8000))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# Sensor Data Source Mode
# Options: "SIMULATOR", "SERIAL", "WIFI"
DATA_SOURCE = os.getenv("DATA_SOURCE", "WIFI")

# Serial Configuration (only used if DATA_SOURCE == "SERIAL")
# Default to "AUTO" for cross-platform auto-detection.
# Override in .env with e.g. SERIAL_PORT=COM21 or SERIAL_PORT=/dev/ttyUSB0
SERIAL_PORT = os.getenv("SERIAL_PORT", "/dev/cu.usbserial-0001")
SERIAL_BAUD = int(os.getenv("SERIAL_BAUD", 115200))

# Storage Config
# Default to ../storage relative to backend/
raw_storage_dir = os.getenv("STORAGE_DIR", "../storage")
if os.path.isabs(raw_storage_dir):
    STORAGE_DIR = raw_storage_dir
else:
    # Resolve relative to project root (one level up from backend)
    PROJECT_ROOT = BASE_DIR.parent
    STORAGE_DIR = str((PROJECT_ROOT / raw_storage_dir).resolve())

# Create storage dir if it doesn't exist
os.makedirs(STORAGE_DIR, exist_ok=True)

print(f"[config] BASE_DIR: {BASE_DIR}")
print(f"[config] STORAGE_DIR: {STORAGE_DIR}")
