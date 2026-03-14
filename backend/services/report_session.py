"""
Shared report session manager.

All tab processors call get_report_dir() to get the current session's
~/Desktop/report/<timestamp>/ folder.  The first call in a session creates
the folder; subsequent calls reuse it.
"""
import os
import time
import logging
import threading

logger = logging.getLogger("itms.report_session")

_lock = threading.Lock()
_active_dir: str | None = None


def start_report_session() -> str:
    """Create a new timestamped report folder, or reuse the existing one."""
    global _active_dir
    with _lock:
        if _active_dir is not None and os.path.isdir(_active_dir):
            return _active_dir
        desktop_path = os.path.expanduser("~/Desktop")
        report_root = os.path.join(desktop_path, "report")
        ts = time.strftime("%Y%m%d_%H%M%S")
        _active_dir = os.path.join(report_root, ts)
        os.makedirs(_active_dir, exist_ok=True)
        logger.info(f"Report session started: {_active_dir}")
        return _active_dir


def get_report_dir() -> str:
    """Return the active report folder, creating one if needed."""
    global _active_dir
    with _lock:
        if _active_dir is None:
            desktop_path = os.path.expanduser("~/Desktop")
            report_root = os.path.join(desktop_path, "report")
            ts = time.strftime("%Y%m%d_%H%M%S")
            _active_dir = os.path.join(report_root, ts)
            os.makedirs(_active_dir, exist_ok=True)
            logger.info(f"Report session auto-created: {_active_dir}")
        return _active_dir


def stop_report_session() -> None:
    """Clear the active session so the next recording creates a fresh folder."""
    global _active_dir
    with _lock:
        if _active_dir:
            logger.info(f"Report session ended: {_active_dir}")
        _active_dir = None
