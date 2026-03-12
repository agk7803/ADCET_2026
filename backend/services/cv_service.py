import cv2
import numpy as np
import threading
import time
import logging
from typing import Dict, Any

from backend.core import config
from backend import sensors
from backend import cv_processing

logger = logging.getLogger("itms.cv_service")

import sys

def get_available_cameras(max_tested=4):
    """Quickly probe the first few indices to see which hardware cameras are connected."""
    available = []
    failed_attempts = 0
    for i in range(max_tested):
        # Mute ffmpeg warnings during probe
        cv2.setLogLevel(0) 
        cap = cv2.VideoCapture(i, cv2.CAP_DSHOW) if sys.platform.startswith('win') else cv2.VideoCapture(i)
        if cap.isOpened():
            ret, _ = cap.read()
            if ret:
                available.append({"index": i, "name": f"Camera {i}"})
            cap.release()
        else:
            failed_attempts += 1
            if failed_attempts >= 2:
                # If we fail 2 in a row, assume no more cameras to save time
                break
    return available

class VideoCamera:
    def __init__(self, index):
        self.index = index
        self.video = cv2.VideoCapture(index, cv2.CAP_DSHOW)
        if not self.video.isOpened():
             self.video = cv2.VideoCapture(index)
        
        # Set FPS to 30
        self.video.set(cv2.CAP_PROP_FPS, 30)
        
        self.lock = threading.Lock()
        self.last_frame = None
        self.last_frame_raw = None
        self.running = True
        self.clients = 0
        self.thread = threading.Thread(target=self._update, daemon=True)
        self.thread.start()
        
        # Create a blank placeholder immediately
        blank = np.zeros((480, 640, 3), np.uint8)
        cv2.putText(blank, f"Cam {index} Init", (200, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        _, jpeg = cv2.imencode('.jpg', blank)
        self.last_frame = jpeg.tobytes()
        self.last_frame_raw = blank

    def stop(self):
        self.running = False
        if self.video.isOpened():
            self.video.release()

    def _update(self):
        while self.running:
            if self.video.isOpened():
                ret, frame = self.video.read()
                if ret:
                    try:
                        sensors.record_frame(self.index, frame)
                    except:
                        pass
                    
                    with self.lock:
                        self.last_frame_raw = frame.copy()
                        ret_e, jpeg = cv2.imencode('.jpg', frame)
                        if ret_e:
                            self.last_frame = jpeg.tobytes()
                else:
                    time.sleep(0.1)
            else:
                 time.sleep(1)
            time.sleep(0.01)

    def get_frame(self):
        with self.lock:
            return self.last_frame
            
    def get_raw_frame(self):
        with self.lock:
            return self.last_frame_raw

class CameraManager:
    def __init__(self):
        self.cameras = {}
        self.lock = threading.Lock()

    def get_stream(self, index):
        with self.lock:
            if index not in self.cameras:
                self.cameras[index] = VideoCamera(index)
            self.cameras[index].clients += 1
            camera = self.cameras[index]

        try:
            while True:
                if not camera.running:
                    break
                frame = camera.get_frame()
                if frame:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                time.sleep(0.033)
        finally:
            with self.lock:
                if index in self.cameras:
                    camera = self.cameras[index]
                    camera.clients -= 1
                    if camera.clients <= 0:
                        camera.stop()
                        del self.cameras[index]

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
            frame = cam.get_raw_frame()
            if frame is not None:
                y_val = sensors.get_latest_state().get('y', 0.0)
                processed = geo_processor.process(frame, chainage=y_val)
                if processed is None: processed = frame
                ret, jpeg = cv2.imencode('.jpg', processed)
                if ret:
                    yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1
                if camera_manager.cameras[index_source].clients <= 0:
                    camera_manager.cameras[index_source].stop()
                    del camera_manager.cameras[index_source]

def generate_mask_feed(index_source=1):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.get_raw_frame()
            if frame is not None:
                processed = rail_processor.process(frame)
                if processed is None: processed = frame
                rail_processor.record_frame_check(processed)
                ret, jpeg = cv2.imencode('.jpg', processed)
                if ret:
                    yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1
                if camera_manager.cameras[index_source].clients <= 0:
                    camera_manager.cameras[index_source].stop()
                    del camera_manager.cameras[index_source]

def generate_yolo_feed(index_source=2):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.get_raw_frame()
            if frame is not None:
                processed = yolo_processor.process(frame)
                if processed is None: processed = frame
                ret, jpeg = cv2.imencode('.jpg', processed)
                if ret:
                    yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1
                if camera_manager.cameras[index_source].clients <= 0:
                    camera_manager.cameras[index_source].stop()
                    del camera_manager.cameras[index_source]

def generate_rail_ai_feed(index_source=2):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.get_raw_frame()
            if frame is not None:
                cond_results = cond_processor.process(frame)
                if cond_results and 'mask' in cond_results:
                    mask_frame = cond_results['mask']
                    final_processed = yolo_processor.process(mask_frame)
                    if final_processed is None: final_processed = mask_frame
                    ret, jpeg = cv2.imencode('.jpg', final_processed)
                    if ret:
                        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1
                if camera_manager.cameras[index_source].clients <= 0:
                    camera_manager.cameras[index_source].stop()
                    del camera_manager.cameras[index_source]

def generate_condition_feed_overlay(index_source=1):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.get_raw_frame()
            if frame is not None:
                results = cond_processor.process(frame)
                if results and 'overlay' in results:
                    processed = results['overlay']
                    cond_processor.record_frame_check(processed)
                    ret, jpeg = cv2.imencode('.jpg', processed)
                    if ret:
                        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1
                if camera_manager.cameras[index_source].clients <= 0:
                    camera_manager.cameras[index_source].stop()
                    del camera_manager.cameras[index_source]

def generate_condition_feed_mask(index_source=1):
    with camera_manager.lock:
        if index_source not in camera_manager.cameras:
            camera_manager.cameras[index_source] = VideoCamera(index_source)
        camera_manager.cameras[index_source].clients += 1
    cam = camera_manager.cameras[index_source]
    try:
        while True:
            if not cam.running: break
            frame = cam.get_raw_frame()
            if frame is not None:
                results = cond_processor.process(frame)
                if results and 'mask' in results:
                    processed = results['mask']
                    ret, jpeg = cv2.imencode('.jpg', processed)
                    if ret:
                        yield (b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
            time.sleep(0.033)
    finally:
        with camera_manager.lock:
            if index_source in camera_manager.cameras:
                camera_manager.cameras[index_source].clients -= 1
                if camera_manager.cameras[index_source].clients <= 0:
                    camera_manager.cameras[index_source].stop()
                    del camera_manager.cameras[index_source]
