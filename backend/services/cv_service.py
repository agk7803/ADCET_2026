import cv2
import numpy as np
import threading
import time
import logging
from typing import Dict, Any, Optional

from backend.core import config
from backend import sensors
from backend import cv_processing

logger = logging.getLogger("itms.cv_service")

import sys

_cached_cameras = []
_probing_cameras = False

def _probe_cameras_background(max_tested=10):
    global _cached_cameras, _probing_cameras
    available = []
    # Probe higher indices (like GoPros or virtual cameras) without stopping early
    for i in range(max_tested):
        if sys.platform.startswith('win'):
            cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
        elif sys.platform == 'darwin':
            cap = cv2.VideoCapture(i, cv2.CAP_AVFOUNDATION)
        else:
            cap = cv2.VideoCapture(i)
        
        
        if cap.isOpened():
            ret, _ = cap.read()
            if ret:
                available.append({"index": i, "name": f"Camera {i}"})
            cap.release()
    _cached_cameras = available
    _probing_cameras = False

def get_available_cameras(max_tested=10):
    """Return cached cameras instantly, trigger background probe if empty."""
    global _probing_cameras, _cached_cameras
    
    # If we have no cameras and aren't already looking, start looking in background
    if len(_cached_cameras) == 0 and not _probing_cameras:
        _probing_cameras = True
        threading.Thread(target=_probe_cameras_background, args=(max_tested,), daemon=True).start()
        
    # Return whatever we know so far so we don't block the API!
    return _cached_cameras

class VideoCamera:
    def __init__(self, index):
        self.index = index
        self.video: Optional[cv2.VideoCapture] = None
        self.lock = threading.Lock()
        self.last_frame = None
        self.last_frame_raw = None
        self.running = True
        self.clients = 0
        
        # Processed frames
        self.last_condition_overlay = None
        self.last_condition_mask = None
        self.last_rail_ai = None
        self.last_geometry = None
        self.last_rail_profile = None
        self.last_yolo = None
        
        # Create a blank placeholder immediately
        blank = np.zeros((480, 640, 3), np.uint8)
        cv2.putText(blank, f"Cam {index} Init...", (180, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        _, jpeg = cv2.imencode('.jpg', blank)
        self.last_frame = jpeg.tobytes()
        self.last_frame_raw = blank

        # Set processed to blank initially
        self.last_condition_overlay = blank.copy()
        self.last_condition_mask = blank.copy()
        self.last_rail_ai = blank.copy()
        self.last_geometry = blank.copy()
        self.last_rail_profile = blank.copy()
        self.last_yolo = blank.copy()

        # Start thread immediately; it will open the camera in the background
        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=3.0)

    def _update(self):
        # Open camera in the background thread!
        try:
            if sys.platform.startswith('win'):
                self.video = cv2.VideoCapture(self.index, cv2.CAP_DSHOW)
            elif sys.platform == 'darwin':
                self.video = cv2.VideoCapture(self.index, cv2.CAP_AVFOUNDATION)
            else:
                self.video = cv2.VideoCapture(self.index)
                
            if not self.video.isOpened():  # pyre-ignore[16]
                 self.video = cv2.VideoCapture(self.index)
            
            if self.video.isOpened():  # pyre-ignore[16]
                self.video.set(cv2.CAP_PROP_FPS, 30)  # pyre-ignore[16]
        except Exception as e:
            logger.error(f"Failed to open camera {self.index}: {e}")
            self.running = False
            return

        while self.running:
            if self.video and self.video.isOpened():  # pyre-ignore[16]
                ret, frame = self.video.read()  # pyre-ignore[16]
                if ret:
                    try:
                        sensors.record_frame(self.index, frame)
                    except Exception as e:
                        logger.warning(f"record_frame error: {e}")
                    
                    with self.lock:
                        self.last_frame_raw = frame.copy()
                        ret_e, jpeg = cv2.imencode('.jpg', frame)
                        if ret_e:
                            self.last_frame = jpeg.tobytes()
                    
                    # Process frame for all outputs
                    cond_results = cond_processor.process(frame)
                    if cond_results:
                        if 'overlay' in cond_results:
                            self.last_condition_overlay = cond_results['overlay']
                        if 'mask' in cond_results:
                            mask = cond_results['mask']
                            self.last_condition_mask = mask

                    # Run YOLO on the raw camera frame (not the laser mask)
                    yolo_frame_result = yolo_processor.process(frame)
                    self.last_rail_ai = yolo_frame_result if yolo_frame_result is not None else frame
                    
                    # Geometry
                    y_val = sensors.get_latest_state().get('y', 0.0)
                    geo_result = geo_processor.process(frame, chainage=y_val)
                    self.last_geometry = geo_result if geo_result is not None else frame
                    if geo_result is not None:
                        geo_processor.record_frame_check(geo_result)
                    
                    # Rail profile
                    rail_result = rail_processor.process(frame)
                    self.last_rail_profile = rail_result if rail_result is not None else frame
                    if rail_result is not None:
                        rail_processor.record_frame_check(rail_result)
                    
                    # Yolo on frame
                    yolo_frame_result = yolo_processor.process(frame)
                    self.last_yolo = yolo_frame_result if yolo_frame_result is not None else frame
                else:
                    time.sleep(0.1)
            else:
                 time.sleep(1)
            time.sleep(0.01)
            print("CAMERA LOOP ACTIVE", self.index)

        # Cleanup: Release the camera cleanly OUTSIDE the loop, in the correct thread
        if self.video and self.video.isOpened():  # pyre-ignore[16]
            self.video.release()  # pyre-ignore[16]
            self.video = None

    def get_frame(self):
        with self.lock:
            return self.last_frame
            
    def get_raw_frame(self):
        with self.lock:
            return self.last_frame_raw

class CameraManager:
    def __init__(self):
        self.cameras: Dict[int, VideoCamera] = {}
        self.lock = threading.Lock()

    def get_stream(self, index):
        with self.lock:
            if index not in self.cameras:
                self.cameras[index] = VideoCamera(index)
            self.cameras[index].clients += 1
            camera = self.cameras[index]

        try:
            while camera.running:
                frame = camera.get_frame()
                if frame:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                time.sleep(0.033)
        finally:
            with self.lock:
                if index in self.cameras:
                    cam = self.cameras[index]
                    cam.clients -= 1

    def force_stop(self, index):
        with self.lock:
            if index in self.cameras:
                self.cameras[index].stop()
                del self.cameras[index]  # pyre-ignore[55]

camera_manager = CameraManager()

# Global Processors
geo_processor = cv_processing.TrackGeometryProcessor()
rail_processor = cv_processing.RailProfileProcessor()
cond_processor = cv_processing.RailConditionProcessor()
yolo_processor = cv_processing.YoloProcessor(get_chainage_callback=lambda: sensors.get_latest_state().get('y', 0.0))

# Generators for processed feeds
def generate_track_geometry_feed(index_source=1):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.last_geometry
            if frame is not None:
                ret, jpeg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1

def generate_mask_feed(index_source=1):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.last_rail_profile
            if frame is not None:
                ret, jpeg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1

def generate_yolo_feed(index_source=2):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.last_yolo
            if frame is not None:
                ret, jpeg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1

def generate_rail_ai_feed(index_source=2):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.last_rail_ai
            if frame is not None:
                ret, jpeg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1

def generate_condition_feed_overlay(index_source=1):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.last_condition_overlay
            if frame is not None:
                ret, jpeg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1

def generate_condition_feed_mask(index_source=1):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.last_condition_mask
            if frame is not None:
                ret, jpeg = cv2.imencode('.jpg', frame)
                if ret:
                    yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1
