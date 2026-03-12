"""
ITMS Sensor Simulator Module
=============================
Standalone simulator that replaces the ESP32 hardware when no sensors are available.
Feeds synthetic data directly into the existing sensor pipeline via _process_data().

Pipeline:
    simulator._simulation_loop()
        → sensors._process_data(packet)
            → _history_buffer
            → _broadcast_callback
            → WebSocket
            → React UI

Usage:
    from backend.simulator import start_simulator, stop_simulator
    start_simulator(rate_hz=20)   # Begin simulation at 20 Hz
    stop_simulator()              # Stop cleanly
"""

import time
import random
import math
import threading
import logging

from backend import sensors

logger = logging.getLogger("itms.simulator")

# ------------------------------------------------------------------------------
# MODULE STATE
# ------------------------------------------------------------------------------

_sim_thread: threading.Thread | None = None
_sim_running: bool = False
_sim_lock = threading.Lock()

# ------------------------------------------------------------------------------
# PUBLIC API
# ------------------------------------------------------------------------------

def start_simulator(rate_hz: int = 20) -> None:
    """
    Start the sensor simulation in a background daemon thread.

    Args:
        rate_hz: Number of synthetic packets per second (default 20).
                 Supports 20, 50, and 100 Hz for testing.
    """
    global _sim_thread, _sim_running

    with _sim_lock:
        if _sim_running:
            logger.warning("Simulator is already running.")
            return

        # Set the sensors._running flag so that:
        #   1. /health reports sensors_running=true
        #   2. Frontend calculates systemLive=true
        #   3. Dashboard components accept WebSocket data instead of discarding it
        sensors._running = True

        # Sync encoder state to avoid a chainage jump on first simulated packet
        sensors._reset_next_sample = True

        _sim_running = True
        _sim_thread = threading.Thread(
            target=_simulation_loop,
            args=(rate_hz,),
            daemon=True,
            name="ITMS-Simulator"
        )
        _sim_thread.start()
        logger.info(f"Simulator started at {rate_hz} Hz")


def stop_simulator() -> None:
    """Stop the simulation thread safely."""
    global _sim_running, _sim_thread

    with _sim_lock:
        if not _sim_running:
            logger.warning("Simulator is not running.")
            return

        _sim_running = False

    # Wait for the thread to finish (outside the lock to avoid deadlock)
    if _sim_thread is not None:
        _sim_thread.join(timeout=2.0)
        _sim_thread = None

    # Restore the sensors._running flag so health check reflects reality
    sensors._running = False

    logger.info("Simulator stopped.")


def is_running() -> bool:
    """Check if the simulator is currently active."""
    return _sim_running


# ------------------------------------------------------------------------------
# SIMULATION LOOP
# ------------------------------------------------------------------------------

def _simulation_loop(rate_hz: int) -> None:
    """
    Core simulation loop. Generates realistic sensor packets and feeds them
    into the existing pipeline via sensors._process_data().

    This function runs in a daemon thread and respects the _sim_running flag
    for clean shutdown.

    Args:
        rate_hz: Target frequency for packet generation.
    """
    global _sim_running

    interval = 1.0 / rate_hz
    encoder_steps = 0
    cycle = 0

    # Base GPS coordinates (Mumbai area)
    base_lat = 19.076
    base_lon = 72.877

    logger.info(f"Simulation loop running at {rate_hz} Hz (interval={interval:.4f}s)")

    while _sim_running:
        start_time = time.monotonic()

        # Increment encoder to simulate forward motion (~10 steps per cycle)
        encoder_steps += random.randint(8, 12)
        cycle += 1

        # Build the synthetic packet
        packet = _generate_packet(encoder_steps, cycle, base_lat, base_lon)

        # Feed directly into the existing pipeline
        # This triggers: geometry calc → threshold check → history buffer → WebSocket broadcast
        try:
            sensors._process_data(packet)
        except Exception as e:
            logger.error(f"Simulator: _process_data error: {e}")

        # Maintain target frequency
        elapsed = time.monotonic() - start_time
        sleep_time = max(0, interval - elapsed)
        time.sleep(sleep_time)

    logger.info("Simulation loop exited.")


# ------------------------------------------------------------------------------
# PACKET GENERATION
# ------------------------------------------------------------------------------

def _generate_packet(
    encoder_steps: int,
    cycle: int,
    base_lat: float,
    base_lon: float,
) -> dict:
    """
    Generate a single realistic sensor packet that matches the format
    expected by sensors._process_data().

    The packet mimics real ESP32 output with:
    - Normal vibration patterns on accelerometer
    - Occasional acceleration spikes (rail joints, ~5% chance)
    - Small gyroscope rotation noise
    - Gradual encoder advancement
    - GPS drift around a base coordinate
    - LiDAR distance readings with occasional obstacle events

    Args:
        encoder_steps: Current cumulative encoder step count.
        cycle: Loop iteration number (used for time-varying patterns).
        base_lat: Base GPS latitude.
        base_lon: Base GPS longitude.

    Returns:
        dict matching the expected sensor packet schema.
    """

    # --- Accelerometer ---
    # Normal vibration: small random noise
    ax = random.uniform(-0.5, 0.5)
    ay = random.uniform(-0.5, 0.5)
    az = 9.8 + random.uniform(-0.2, 0.2)

    # 5% chance of a rail joint spike on X or Y
    if random.random() < 0.05:
        ax = random.uniform(3.0, 5.0) * random.choice([-1, 1])
    if random.random() < 0.05:
        ay = random.uniform(3.0, 5.0) * random.choice([-1, 1])

    # --- Gyroscope ---
    # Small rotation noise with subtle sinusoidal drift
    gx = random.uniform(-0.4, 0.4) + 0.3 * math.sin(cycle * 0.05)
    gy = random.uniform(-0.4, 0.4) + 0.2 * math.cos(cycle * 0.07)
    gz = random.uniform(-0.4, 0.4)

    # --- GPS ---
    # Small random walk around base coordinates
    lat = base_lat + random.uniform(-0.0001, 0.0001)
    lon = base_lon + random.uniform(-0.0001, 0.0001)

    # --- LiDAR ---
    # Normal range readings in millimeters
    lidar1 = random.randint(900, 1500)
    lidar2 = random.randint(900, 1500)
    lidar3 = random.randint(2000, 2600)

    # 5% chance of an obstacle event on lidar1 (close object)
    if random.random() < 0.05:
        lidar1 = random.randint(300, 600)

    # --- Assemble Packet ---
    packet = {
        "accel": {"x": round(ax, 4), "y": round(ay, 4), "z": round(az, 4)},
        "gyro":  {"x": round(gx, 4), "y": round(gy, 4), "z": round(gz, 4)},
        "gps":   {"lat": round(lat, 6), "lon": round(lon, 6)},
        "encoder_steps": encoder_steps,
        "lidar1_mm": lidar1,
        "lidar2_mm": lidar2,
        "lidar3_mm": lidar3,
    }

    return packet
