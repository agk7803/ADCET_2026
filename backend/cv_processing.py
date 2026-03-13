import cv2
import numpy as np
import os
import time
import logging
from scipy.special import comb
from ultralytics import YOLO
import threading
import json
from typing import Optional, List, Dict, Any, Tuple, IO
from datetime import datetime

from backend.core import config
from backend import sensors
from backend.services import report_session
import csv

logger = logging.getLogger("cv_processing")

def init_writer(path, fps=20.0, resolution=(640, 480)):
    try:
        fourcc = cv2.VideoWriter_fourcc(*'MJPG')
        writer = cv2.VideoWriter(path, fourcc, fps, resolution)
        if not writer.isOpened():
            logger.error(f"Failed to open VideoWriter at {path}")
            return None
        return writer
    except Exception as e:
        logger.error(f"Error initializing VideoWriter: {e}")
        return None

def ensure_dirs(subfolder):
    """Ensure <session_dir>/video_recording/<subfolder> exists.

    When a recording session is active, sensors.get_session_dir() will return
    the session folder (timestamped). Otherwise it falls back to config.STORAGE_DIR.
    """
    root = sensors.get_session_dir()
    path = os.path.join(root, "video_recording", subfolder)
    os.makedirs(path, exist_ok=True)
    return path

# ------------------------------------------------------------------------------
# BEZIER CURVE HELPER
# ------------------------------------------------------------------------------
def bezier_curve(points, ntimes=50):
    nPoints = len(points)
    if nPoints == 0:
        return [], []
    xPoints = np.array([p[0] for p in points])
    yPoints = np.array([p[1] for p in points])
    t = np.linspace(0.0, 1.0, ntimes)
    
    # Precompute polynomial array if fast enough, or just loop
    # For small nPoints (50 max), this loop is fine
    polynomial_array = np.array([
        comb(nPoints - 1, i) * (t ** i) * ((1 - t) ** (nPoints - 1 - i))
        for i in range(nPoints)
    ])
    xvals = np.dot(xPoints, polynomial_array)
    yvals = np.dot(yPoints, polynomial_array)
    return xvals.astype('int32'), yvals.astype('int32')

# ------------------------------------------------------------------------------
# TRACK GEOMETRY (LEFT FRAME) PROCESSOR
# ------------------------------------------------------------------------------
class TrackGeometryProcessor:
    def __init__(self, left_point=450, right_point=840, top_point=330):
        self.left_point = left_point
        self.right_point = right_point
        self.top_point = top_point
        self.kernel = np.array([
            [-1, 1, 0, 1, -1],
            [-1, 1, 0, 1, -1],
            [-1, 1, 0, 1, -1],
            [-1, 1, 0, 1, -1],
            [-1, 1, 0, 1, -1]
        ])
        
        self.old_valid_frame = None
        self.first = True
        
        self.recording = False
        self.writer: Optional[cv2.VideoWriter] = None
        
        self.latest_gauge = 0.0 # Store latest for API
        self.recording = False

    def process(self, frame, chainage=0.0):
        """
        Apply Bezier curve logic, calc Gauge, and return Processed frame (Full Frame with Overlay).
        """
        if frame is None:
            return None

        # 1. ROI extraction
        h, w = frame.shape[:2]
        if self.top_point >= h or self.right_point > w:
            return frame 
            
        valid_frame = frame[self.top_point:, self.left_point:self.right_point].copy()
        
        # 2. Image Processing
        gray_frame = cv2.cvtColor(valid_frame, cv2.COLOR_BGR2GRAY)
        histeqaul_frame = cv2.equalizeHist(gray_frame)
        blur_frame = cv2.GaussianBlur(histeqaul_frame, (5, 5), 5)

        if self.first or (self.old_valid_frame is not None and self.old_valid_frame.shape != blur_frame.shape):
            merge_frame = blur_frame
            self.first = False
            self.old_valid_frame = merge_frame.copy()
        else:
            merge_frame = cv2.addWeighted(blur_frame, 0.2, self.old_valid_frame, 0.8, 0)
            self.old_valid_frame = merge_frame.copy()

        conv_frame = cv2.filter2D(merge_frame, -1, self.kernel)

        # 3. Sliding Window
        sliding_window = [20, 190, 200, 370]
        slide_interval = 15
        slide_height = 15
        slide_width = 60
        
        left_points = []
        right_points = []
        
        roi_h, roi_w = conv_frame.shape
        
        count = 0
        for i in range(340, 40, -int(slide_interval)):
            if i + slide_height > roi_h: continue

            sw0 = max(0, min(sliding_window[0], roi_w))
            sw1 = max(0, min(sliding_window[1], roi_w))
            sw2 = max(0, min(sliding_window[2], roi_w))
            sw3 = max(0, min(sliding_window[3], roi_w))
            
            if sw0 >= sw1 or sw2 >= sw3: continue

            left_edge = conv_frame[i:i + slide_height, sw0:sw1].sum(axis=0)
            right_edge = conv_frame[i:i + slide_height, sw2:sw3].sum(axis=0)

            # Left Line
            if left_edge.size > 0 and left_edge.argmax() > 0:
                l_idx = sliding_window[0] + left_edge.argmax()
                left_points.append([l_idx, i + int(slide_height / 2)])
                # Update window
                sw_diff = int(slide_width / 4 + (slide_width + 10) / int(count + 1))
                sliding_window[0] = max(0, l_idx - sw_diff)
                sliding_window[1] = min(roi_w, l_idx + sw_diff)

            # Right Line
            if right_edge.size > 0 and right_edge.argmax() > 0:
                r_idx = sliding_window[2] + right_edge.argmax()
                right_points.append([r_idx, i + int(slide_height / 2)])
                # Update window
                sw_diff = int(slide_width / 4 + (slide_width + 10) / (count + 1))
                sliding_window[2] = max(0, r_idx - sw_diff)
                sliding_window[3] = min(roi_w, r_idx + sw_diff)
            
            count += 1

        # 4. Bezier & Draw (ON FULL FRAME)
        # Offset points by ROI position
        l_pts_full = [[p[0] + self.left_point, p[1] + self.top_point] for p in left_points]
        r_pts_full = [[p[0] + self.left_point, p[1] + self.top_point] for p in right_points]
        
        bez_l_x, bez_l_y = bezier_curve(left_points, 50) 
        bez_r_x, bez_r_y = bezier_curve(right_points, 50)
        
        # Calculate Gauge
        gauge_val = 0
        if len(bez_l_x) == 50 and len(bez_r_x) == 50:
            # Convert to numpy arrays for element-wise subtraction
            lx = np.array(bez_l_x)
            rx = np.array(bez_r_x)
            dists = np.abs(rx - lx)
            gauge_val = np.mean(dists)
            self.latest_gauge = float(gauge_val)

        # Prepare Output Frame (Copy of original full frame)
        output_frame = frame.copy()

        # Draw Points
        for pt in l_pts_full:
            cv2.circle(output_frame, (pt[0], pt[1]), 3, (255, 255, 255), -1)
        for pt in r_pts_full:
            cv2.circle(output_frame, (pt[0], pt[1]), 3, (255, 255, 255), -1)

        # Draw Curves
        if len(bez_l_x) > 0:
            bez_l_x_full = bez_l_x + self.left_point
            bez_l_y_full = bez_l_y + self.top_point
            pts_l = np.array(list(zip(bez_l_x_full, bez_l_y_full)), np.int32)
            pts_l = pts_l.reshape((-1, 1, 2))
            cv2.polylines(output_frame, [pts_l], False, (0, 255, 0), 2) # Green
            
        if len(bez_r_x) > 0:
            bez_r_x_full = bez_r_x + self.left_point
            bez_r_y_full = bez_r_y + self.top_point
            pts_r = np.array(list(zip(bez_r_x_full, bez_r_y_full)), np.int32)
            pts_r = pts_r.reshape((-1, 1, 2))
            cv2.polylines(output_frame, [pts_r], False, (0, 255, 255), 2) # Yellow

        # Draw Gauge value
        if gauge_val > 0:
            cv2.putText(output_frame, f"Gauge: {gauge_val:.1f}px", (10, 30), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

        # 6. Recording
        if self.recording and self.writer is not None:
            self.writer.write(output_frame)
            
        return output_frame

    def start_recording(self):
        self.recording = True
        
    def stop_recording(self):
        self.recording = False

    def record_frame_check(self, frame):
        pass

# ------------------------------------------------------------------------------
# RAIL PROFILE (RIGHT FRAME) PROCESSOR
# ------------------------------------------------------------------------------
class RailProfileProcessor:
    def __init__(self, threshold=200):
        self.threshold = threshold
        self.writer: Optional[cv2.VideoWriter] = None
        self.recording = False
        self.filename = ""

    def process(self, frame):
        """
        Apply Laser Mask logic and return the ColorMapped mask overlay.
        """
        if frame is None:
            return None

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        _, laser_mask = cv2.threshold(gray, self.threshold, 255, cv2.THRESH_BINARY)
        laser_mask = cv2.medianBlur(laser_mask, 5)
        
        # Color Map
        height_map = cv2.applyColorMap(laser_mask, cv2.COLORMAP_JET)
        
        # Overlay: Show original frame with mask on top so it's not black
        if len(frame.shape) == 2:
             original_color = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        else:
             original_color = frame
             
        # Blend: 1.0 * Original + 0.6 * Mask
        combined = cv2.addWeighted(original_color, 1.0, height_map, 0.6, 0)

        if self.recording and self.writer:
            self.writer.write(combined)
            
        return combined

    def start_recording(self):
        # Save video into the shared Desktop report folder
        root = report_session.get_report_dir()
        self.filename = os.path.join(root, "rail_profile.avi")
        self.recording = True
        self.writer = None 

    def record_frame_check(self, frame):
        if self.recording:
            if self.writer is None:
                h, w = frame.shape[:2]
                self.writer = init_writer(self.filename, resolution=(w, h))
                if not self.writer:
                     print("Failed to init writer for mask")
            if self.writer is not None:
                self.writer.write(frame)

    def stop_recording(self):
        self.recording = False
        if self.writer is not None:
            try:
                self.writer.release()
            except Exception as e:
                logger.error(f"Error releasing profile writer: {e}")
            finally:
                self.writer = None
# ------------------------------------------------------------------------------
# RAIL CONDITION MONITORING PROCESSOR
# ------------------------------------------------------------------------------
class RailConditionProcessor:
    def __init__(self, threshold=200, blur_size=5):
        self.threshold = threshold
        self.blur_size = blur_size
        self.recording = False
        self.writer_overlay: Optional[cv2.VideoWriter] = None
        self.writer_mask: Optional[cv2.VideoWriter] = None
        self.filename_overlay = ""
        self.filename_mask = ""
        self.lock = threading.Lock()

    def process(self, frame):
        """
        Returns a dict: {'overlay': ..., 'mask': ...}
        """
        if frame is None:
            return None

        # 1. Image Processing
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Threshold
        # Threshold
        # User requested explicit control over "darkness threshold"
        # darkness_threshold = 60 
        _, laser_mask = cv2.threshold(gray, self.threshold, 255, cv2.THRESH_BINARY)
        
        # Median Blur
        k = self.blur_size if self.blur_size % 2 == 1 else self.blur_size + 1
        if k > 1:
            laser_mask = cv2.medianBlur(laser_mask, k)
            
        # Convert to BGR (White laser on Black background)
        height_map = cv2.cvtColor(laser_mask, cv2.COLOR_GRAY2BGR)
        
        # Overlay: User requested "full background black except only the laser to be white"
        # So we do NOT blend with original frame anymore.
        overlay = height_map
        
        # Add visual indicator
        cv2.putText(overlay, f"Laser Mask Thresh: {self.threshold}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # 2. Recording
        if self.recording:
            # Lazy Init Overlay Writer
            if self.writer_overlay is None:
                h, w = frame.shape[:2]
                self.writer_overlay = init_writer(self.filename_overlay, resolution=(w, h))
            if self.writer_overlay:
                self.writer_overlay.write(overlay)
                
            # Lazy Init Mask Writer
            if self.writer_mask is None:
                h, w = frame.shape[:2]
                self.writer_mask = init_writer(self.filename_mask, resolution=(w, h))
            if self.writer_mask:
                self.writer_mask.write(height_map) # Save colored mask
                
        return {'overlay': overlay, 'mask': height_map}

    def record_frame_check(self, frame):
        # Server calls this, but we handle recording in process() because we need to save both overlay and mask.
        # So this is a stub to prevent AttributeError.
        pass

    def start_recording(self):
        # Save videos into the shared Desktop report folder
        root = report_session.get_report_dir()
        self.filename_overlay = os.path.join(root, "condition_overlay.avi")
        self.filename_mask = os.path.join(root, "condition_mask.avi")
        
        self.recording = True
        self.writer_overlay = None
        self.writer_mask = None

    def stop_recording(self):
        self.recording = False
        with self.lock: # If lock exists
            if self.writer_overlay is not None:
                try:
                    self.writer_overlay.release()
                except Exception as e:
                    logger.error(f"Error releasing overlay writer: {e}")
                finally:
                    self.writer_overlay = None
            if self.writer_mask is not None:
                try:
                    self.writer_mask.release()
                except Exception as e:
                    logger.error(f"Error releasing mask writer: {e}")
                finally:
                    self.writer_mask = None

# ------------------------------------------------------------------------------
# YOLO PROCESSOR
# ------------------------------------------------------------------------------
class YoloProcessor:
    def __init__(self, model_path=None, get_chainage_callback=None):
        self.model: Optional[Any] = None
        self.model_path: Optional[str] = None
        self.names: Dict[int, str] = {}
        self.get_chainage_callback = get_chainage_callback
        
        self.recording = False
        self.writer: Optional[cv2.VideoWriter] = None
        self.output_dir = ensure_dirs("ConditionMonitoring")
        self.filename = ""
        
        self.lock = threading.Lock()
        
        # CSV Logging for Defects - moved to start_recording for per-run
        self.log_file: Optional[IO[str]] = None
        self.csv_writer: Optional[Any] = None
        
        # Snapshot cooldown: one image per defect class every N seconds
        self._last_snap_time: Dict[str, float] = {}
        self._snap_cooldown = 5.0  # seconds
        
        if model_path:
            self.load_model(model_path)

    def load_model(self, path):
        with self.lock:
            try:
                self.model = YOLO(path)
                self.model_path = path
                self.names = self.model.names
                logger.info(f"YOLO model loaded: {path}")
                return True
            except Exception as e:
                logger.error(f"Failed to load YOLO model: {e}")
                return False

    def process(self, frame):
        """
        Process frame with YOLO, overlay boxes and chainage.
        Returns: processed_frame (BGR)
        """
        if frame is None:
            return None
            
        processed = frame.copy()
        
        # 1. Inference
        results = []
        if self.model:
            try:
                # Run inference
                # stream=True is efficient but we need results now
                results = self.model.predict(frame, conf=0.25, verbose=False)
            except Exception as e:
                logger.error(f"Inference error: {e}")

        # 2. Draw Results
        # Custom drawing to match user request (Red for defect, Green for ideal)
        # Assuming class 0 = Defect if single class, or handled via map.
        # User provided code: {0: "defective"} if len==1 else {0:"ideal", 1:"defective"}
        # We'll use simple logic: 'Defect', 'damage', 'broken' in name -> Red. Else Green.
        
        if results:
            for r in results:
                # r.boxes
                boxes = r.boxes
                for box in boxes:
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    
                    label = self.names.get(cls_id, str(cls_id))
                    
                    # Color Logic
                    is_defect = False
                    start_label = label.lower()

                    # Explicit known defect class names (user provided)
                    defect_names = {"broken_sleeper", "missing_clips", "cracked_rail"}
                    if start_label in defect_names:
                        is_defect = True
                    # Also consider any obvious defect keywords as fallback
                    elif any(x in start_label for x in ['defect', 'damage', 'broken', 'fault', 'crack']):
                        is_defect = True

                    # If model has only a single class, treat it as defect by default
                    if len(self.names) == 1:
                        is_defect = True

                    color = (0, 0, 255) if is_defect else (0, 255, 0) # Red (BGR) or Green
                    
                    # Draw Box
                    cv2.rectangle(processed, (x1, y1), (x2, y2), color, 2)
                    
                    # Draw Label
                    text = f"{label} {conf:.2f}"
                    t_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0]
                    cv2.rectangle(processed, (x1, y1 - 20), (x1 + t_size[0], y1), color, -1)
                    cv2.putText(processed, text, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)

                    # Log to CSV if it's a defect
                    if is_defect and self.csv_writer:
                        try:
                            chainage = 0.0
                            if self.get_chainage_callback:
                                chainage = self.get_chainage_callback()
                            ts = time.strftime("%H:%M:%S")
                            self.csv_writer.writerow([ts, f"{chainage:.3f}", label, f"{conf:.2f}", x1, y1, x2, y2])
                            self.log_file.flush()
                        except Exception as e:
                            logger.error(f"Error logging defect to CSV: {e}")

                        # Save defect snapshot image to report folder (throttled)
                        try:
                            now = time.time()
                            last_t = self._last_snap_time.get(label, 0)
                            if now - last_t >= self._snap_cooldown:
                                self._last_snap_time[label] = now
                                snap_dir = report_session.get_report_dir()
                                defects_dir = os.path.join(snap_dir, "defect_snapshots")
                                os.makedirs(defects_dir, exist_ok=True)
                                snap_ts = time.strftime("%H%M%S")
                                snap_name = f"defect_{label}_{snap_ts}.jpg"
                                snap_path = os.path.join(defects_dir, snap_name)
                                cv2.imwrite(snap_path, processed)
                        except Exception as e:
                            logger.error(f"Error saving defect snapshot: {e}")

        # 3. Chainage Overlay
        if self.get_chainage_callback:
            try:
                y_val = self.get_chainage_callback()
                chainage_text = f"Chainage: {y_val:.3f} m"
                
                # Bottom Left Overlay
                cv2.putText(processed, chainage_text, (20, processed.shape[0] - 30), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2) # Cyan
                            
            except Exception:
                pass

        # 4. Recording
        self.record_frame_check(processed)
        
        return processed

    def start_recording(self):
        with self.lock:
            # Use shared report session folder on Desktop
            run_dir = report_session.get_report_dir()
            
            # Video file
            self.filename = os.path.join(run_dir, "condition_monitoring.avi")
            
            # CSV file
            try:
                csv_path = os.path.join(run_dir, "yolo_defects.csv")
                self.log_file = open(csv_path, 'w', newline='')
                self.csv_writer = csv.writer(self.log_file)
                self.csv_writer.writerow(["Timestamp", "Chainage", "Defect_Class", "Confidence", "X1", "Y1", "X2", "Y2"])
                logger.info(f"YOLO defects log created: {csv_path}")
            except Exception as e:
                logger.error(f"Failed to create YOLO CSV: {e}")
                self.log_file = None
                self.csv_writer = None
            
            self.recording = True
            self.writer = None # Lazy init

    def stop_recording(self):
        with self.lock:
            self.recording = False
            if self.writer:
                try:
                    self.writer.release()
                except Exception as e:
                    logger.error(f"Error releasing YOLO writer: {e}")
                finally:
                    self.writer = None
            # Close CSV log
            if self.log_file:
                try:
                    self.log_file.close()
                except Exception as e:
                    logger.error(f"Error closing YOLO CSV: {e}")
                finally:
                    self.log_file = None
                    self.csv_writer = None

    def record_frame_check(self, frame):
        if self.recording:
            if self.writer is None:
                h, w = frame.shape[:2]
                self.writer = init_writer(self.filename, resolution=(w, h))
            if self.writer:
                self.writer.write(frame)

# ------------------------------------------------------------------------------
# REAR WINDOW RECORDER
# ------------------------------------------------------------------------------
class RearWindowRecorder:
    """Simple recorder that saves raw camera frames to the report folder."""
    def __init__(self):
        self.recording = False
        self.writer: Optional[cv2.VideoWriter] = None
        self.filename = ""

    def start_recording(self):
        root = report_session.get_report_dir()
        self.filename = os.path.join(root, "rear_window.avi")
        self.recording = True
        self.writer = None  # Lazy init

    def stop_recording(self):
        self.recording = False
        if self.writer is not None:
            try:
                self.writer.release()
            except Exception as e:
                logger.error(f"Error releasing rear window writer: {e}")
            finally:
                self.writer = None

    def record_frame(self, frame):
        if not self.recording or frame is None:
            return
        if self.writer is None:
            h, w = frame.shape[:2]
            self.writer = init_writer(self.filename, resolution=(w, h))
        if self.writer:
            self.writer.write(frame)
