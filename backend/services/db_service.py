import sqlite3
import os
import time
import logging
import threading
import queue
from typing import List, Dict, Any, Optional
from backend.core import config

logger = logging.getLogger("itms.db_service")

class SessionDatabase:
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            # Ensure storage directory exists
            os.makedirs(config.STORAGE_DIR, exist_ok=True)
            self.db_path = os.path.join(config.STORAGE_DIR, "itms_sessions.db")
        else:
            self.db_path = db_path
        
        self._init_db()
        
        # Performance: Background worker for non-blocking writes
        self.write_queue = queue.Queue()
        self.stop_event = threading.Event()
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        """Initialize the database schema with sessions and telemetry tables."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Sessions table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    start_time REAL NOT NULL,
                    end_time REAL,
                    data_source TEXT,
                    total_distance REAL DEFAULT 0.0,
                    notes TEXT
                )
            ''')
            
            # Telemetry table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS telemetry (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id INTEGER NOT NULL,
                    timestamp REAL NOT NULL,
                    gps_lat REAL,
                    gps_lon REAL,
                    dr_lat REAL,
                    dr_lon REAL,
                    encoder_steps INTEGER,
                    robot_y REAL,
                    lidar1 REAL,
                    lidar2 REAL,
                    lidar3 REAL,
                    ax REAL, ay REAL, az REAL,
                    gx REAL, gy REAL, gz REAL,
                    gauge REAL, twist REAL, crosslevel REAL,
                    FOREIGN KEY (session_id) REFERENCES sessions (id)
                )
            ''')
            
            # Add indexes for performance
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_telemetry_session_id ON telemetry(session_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry(timestamp)')
            
            # Handle potential schema migrations (column additions)
            cursor.execute("PRAGMA table_info(telemetry)")
            columns = [col[1] for col in cursor.fetchall()]
            if 'ax' not in columns:
                cursor.execute("ALTER TABLE telemetry ADD COLUMN ax REAL")
                cursor.execute("ALTER TABLE telemetry ADD COLUMN ay REAL")
                cursor.execute("ALTER TABLE telemetry ADD COLUMN az REAL")
                cursor.execute("ALTER TABLE telemetry ADD COLUMN gx REAL")
                cursor.execute("ALTER TABLE telemetry ADD COLUMN gy REAL")
                cursor.execute("ALTER TABLE telemetry ADD COLUMN gz REAL")
                cursor.execute("ALTER TABLE telemetry ADD COLUMN gauge REAL")
                cursor.execute("ALTER TABLE telemetry ADD COLUMN twist REAL")
                cursor.execute("ALTER TABLE telemetry ADD COLUMN crosslevel REAL")
            
            conn.commit()
        logger.info(f"Database initialized at {self.db_path}")

    def _worker_loop(self):
        """Background thread that processes database write tasks from the queue."""
        logger.info("Database background worker started")
        # Use a single connection for the thread to reduce overhead
        conn = self._get_connection()
        try:
            while not (self.stop_event.is_set() and self.write_queue.empty()):
                try:
                    # Wait for a task, timeout to check stop_event
                    task = self.write_queue.get(timeout=1.0)
                    task_type, payload = task
                    
                    if task_type == 'TELEMETRY':
                        self._exec_log_telemetry(conn, payload['session_id'], payload['data'])
                    elif task_type == 'START_SESSION':
                        self._exec_start_session(conn, payload)
                    elif task_type == 'END_SESSION':
                        self._exec_end_session(conn, payload['session_id'], payload['total_distance'])
                    
                    self.write_queue.task_done()
                except queue.Empty:
                    continue
                except Exception as e:
                    logger.error(f"Error in DB worker task execution: {e}")
        finally:
            conn.close()
            logger.info("Database background worker stopped")

    def start_session(self, data_source: str) -> int:
        """Synchronously create a session to get the ID, then return it."""
        # Note: Session start is sync to ensure we have an ID for subsequent telemetry
        start_time = time.time()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO sessions (start_time, data_source) VALUES (?, ?)",
                (start_time, data_source)
            )
            session_id = cursor.lastrowid
            conn.commit()
        logger.info(f"Started new session {session_id} (Source: {data_source})")
        return session_id

    def end_session(self, session_id: int, total_distance: float = 0.0):
        """Queue a session end task."""
        self.write_queue.put(('END_SESSION', {'session_id': session_id, 'total_distance': total_distance}))

    def log_telemetry(self, session_id: int, data: Dict[str, Any]):
        """Queue a telemetry log task (Non-blocking)."""
        self.write_queue.put(('TELEMETRY', {'session_id': session_id, 'data': data}))

    def _exec_log_telemetry(self, conn, session_id: int, data: Dict[str, Any]):
        gps = data.get("gps", {})
        dr_gps = data.get("dr_gps", {})
        lidar = data.get("lidar", {})
        accel = data.get("accel", {})
        gyro = data.get("gyro", {})
        geom = data.get("geometry", {})
        
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO telemetry (
                session_id, timestamp, gps_lat, gps_lon, dr_lat, dr_lon, 
                encoder_steps, robot_y, lidar1, lidar2, lidar3,
                ax, ay, az, gx, gy, gz,
                gauge, twist, crosslevel
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            session_id,
            data.get("timestamp", time.time()),
            gps.get("lat"),
            gps.get("lon"),
            dr_gps.get("lat"),
            dr_gps.get("lon"),
            data.get("encoder_steps", 0),
            data.get("y", 0.0),
            lidar.get("l1"),
            lidar.get("l2"),
            lidar.get("l3"),
            accel.get("x"), accel.get("y"), accel.get("z"),
            gyro.get("x"), gyro.get("y"), gyro.get("z"),
            geom.get("gauge"), geom.get("twist"), geom.get("crosslevel")
        ))
        conn.commit()

    def _exec_end_session(self, conn, session_id: int, total_distance: float):
        end_time = time.time()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE sessions SET end_time = ?, total_distance = ? WHERE id = ?",
            (end_time, total_distance, session_id)
        )
        conn.commit()
        logger.info(f"Ended session {session_id}. Total distance: {total_distance:.3f}m")

    def get_sessions(self) -> List[Dict[str, Any]]:
        """Return a list of all historical sessions."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions ORDER BY start_time DESC")
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    def get_session_summary(self, session_id: int) -> Optional[Dict[str, Any]]:
        """Get summary info for a specific session."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_session_telemetry(self, session_id: int) -> List[Dict[str, Any]]:
        """Retrieve all telemetry points for a specific session."""
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM telemetry WHERE session_id = ? ORDER BY timestamp ASC", (session_id,))
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

# Global singleton instance
db = SessionDatabase()
