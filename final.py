import sys, json, cv2
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *
from PyQt5.QtGui import *
import pyqtgraph as pg
import serial


# ---------------------------------------------------
# SERIAL READER THREAD
# ---------------------------------------------------
class SerialReader(QThread):
    data_signal = pyqtSignal(dict)
    raw_line_signal = pyqtSignal(str)
    status_signal = pyqtSignal(str)

    def __init__(self, port, baud=115200):
        super().__init__()
        self.port = port
        self.baud = baud
        self.running = True

    def run(self):
        try:
            self.ser = serial.Serial(self.port, self.baud, timeout=1)
            self.status_signal.emit(f"Connected: {self.port}")
        except Exception as e:
            self.status_signal.emit(f"Failed: {e}")
            return

        while self.running:
            try:
                line = self.ser.readline().decode("utf-8", errors="ignore").strip()

                if line:
                    self.raw_line_signal.emit(line)

                if line.startswith("{") and line.endswith("}"):
                    try:
                        self.data_signal.emit(json.loads(line))
                    except:
                        pass
            except:
                pass

        self.ser.close()

    def send_reset(self):
        try: self.ser.write(b"R")
        except: pass

    def stop(self):
        self.running = False
        self.wait()


# ---------------------------------------------------
# WEBCAM PREVIEW WINDOW (SMALL)
# ---------------------------------------------------
class WebcamWindow(QWidget):
    def __init__(self, camera_index=0, title="Webcam"):
        super().__init__()
        self.camera_index = camera_index

        # Small, diminished floating window
        self.setWindowTitle(title)
        self.resize(400, 300)
        self.setMinimumSize(400, 300)
        self.setMaximumSize(400, 300)
        
        # Always on top + tool window (small titlebar)
        self.setWindowFlags(Qt.Tool | Qt.WindowStaysOnTopHint)

        layout = QVBoxLayout()
        self.setLayout(layout)

        self.video_label = QLabel("Waiting…")
        self.video_label.setAlignment(Qt.AlignCenter)

        # Force video preview to small size too
        self.video_label.setFixedSize(400, 300)

        layout.addWidget(self.video_label)

        self.cap = None
        self.timer = QTimer()
        self.timer.timeout.connect(self.update_frame)

        self.parent_gui = None
        self.frame_width = 640
        self.frame_height = 480

    def start_camera(self):
        self.cap = cv2.VideoCapture(self.camera_index)

        # Detect resolution safely
        ret, frame = self.cap.read()
        if ret:
            self.frame_height, self.frame_width = frame.shape[:2]

        self.timer.start(30)

    def stop_camera(self):
        self.timer.stop()
        if self.cap:
            self.cap.release()

    def update_frame(self):
        if not self.cap:
            return

        ret, frame = self.cap.read()
        if not ret:
            return

        # Recording hook
        if self.parent_gui and self.parent_gui.recording:
            if self.camera_index == 0:
                if self.parent_gui.video_writer1:
                    self.parent_gui.video_writer1.write(frame)

            if self.camera_index == 1:
                if self.parent_gui.video_writer2:
                    self.parent_gui.video_writer2.write(frame)

        # Convert to Qt preview
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = QImage(rgb.data, rgb.shape[1], rgb.shape[0], 3*rgb.shape[1], QImage.Format_RGB888)

        # Scale video to fit tiny preview
        pix = QPixmap.fromImage(img).scaled(200, 150, Qt.KeepAspectRatio)
        self.video_label.setPixmap(pix)


# ---------------------------------------------------
# MAIN GUI WINDOW
# ---------------------------------------------------
class ScannerGUI(QWidget):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Rail Scanner — SLAM + IMU + Dual Webcam Recording")
        self.resize(1900, 900)

        layout = QGridLayout()
        self.setLayout(layout)

        # ---------------- TOP BAR ----------------
        self.port_input = QLineEdit("/dev/cu.usbserial-0001")
        self.baud_input = QLineEdit("115200")
        self.dist_input = QLineEdit("0.004")

        self.connect_btn = QPushButton("Connect")
        self.reset_btn = QPushButton("Reset Encoder")
        self.cam1_btn = QPushButton("Show Cam1")
        self.cam2_btn = QPushButton("Show Cam2")
        self.record_btn = QPushButton("Start Recording")
        self.record_btn.setCheckable(True)

        self.status_label = QLabel("Not connected")

        top = QHBoxLayout()
        for w in [
            self.port_input, self.baud_input,
            QLabel("Meters/Step:"), self.dist_input,
            self.connect_btn, self.reset_btn,
            self.cam1_btn, self.cam2_btn,
            self.record_btn,
            self.status_label
        ]:
            top.addWidget(w)

        layout.addLayout(top, 0, 0, 1, 3)

        self.connect_btn.clicked.connect(self.toggle_connect)
        self.reset_btn.clicked.connect(self.reset_encoder)
        self.cam1_btn.clicked.connect(self.open_cam1)
        self.cam2_btn.clicked.connect(self.open_cam2)
        self.record_btn.clicked.connect(self.toggle_recording)

        # ---------------- GRAPHS ----------------
        self.acc_plot = pg.PlotWidget(title="Accelerometer")
        self.gyro_plot = pg.PlotWidget(title="Gyroscope")
        self.slam_plot = pg.PlotWidget(title="SLAM Map")
        self.slam_plot.setAspectLocked(True)
        self.slam_plot.showGrid(x=True, y=True)

        self.acc_text = QLabel()
        self.gyro_text = QLabel()
        self.slam_text = QLabel()

        acc_box = QVBoxLayout()
        acc_box.addWidget(self.acc_plot)
        acc_box.addWidget(self.acc_text)

        gyro_box = QVBoxLayout()
        gyro_box.addWidget(self.gyro_plot)
        gyro_box.addWidget(self.gyro_text)

        slam_box = QVBoxLayout()
        slam_box.addWidget(self.slam_plot)
        slam_box.addWidget(self.slam_text)

        layout.addLayout(acc_box, 1, 0)
        layout.addLayout(gyro_box, 1, 1)
        layout.addLayout(slam_box, 1, 2)

        # ---------------- INFO BOX ----------------
        info = QVBoxLayout()
        self.steps_label = QLabel("Steps: 0")
        self.dist_label = QLabel("Distance: 0.000 m")
        self.gps_label = QLabel("GPS: --")
        info.addWidget(self.steps_label)
        info.addWidget(self.dist_label)
        info.addWidget(self.gps_label)
        layout.addLayout(info, 2, 0)

        # ---------------- BUFFERS ----------------
        self.buf = 300
        t = list(range(self.buf))
        self.ax = [0]*self.buf
        self.ay = [0]*self.buf
        self.az = [0]*self.buf
        self.gx = [0]*self.buf
        self.gy_list = [0]*self.buf
        self.gz = [0]*self.buf

        self.acc_x = self.acc_plot.plot(t, self.ax, pen='r')
        self.acc_y = self.acc_plot.plot(t, self.ay, pen='g')
        self.acc_z = self.acc_plot.plot(t, self.az, pen='b')

        self.gyro_x = self.gyro_plot.plot(t, self.gx, pen='r')
        self.gyro_y = self.gyro_plot.plot(t, self.gy_list, pen='g')
        self.gyro_z = self.gyro_plot.plot(t, self.gz, pen='b')

        # ---------------- SLAM ----------------
        self.sy = 0
        self.last_steps = 0
        self.map_x = []
        self.map_y = []

        self.robot_dot = self.slam_plot.plot([0], [0], symbol='o', symbolSize=10)
        self.slam_points = self.slam_plot.plot([], [], symbol='o', symbolSize=4)

        # ---------------- CAMERAS ----------------
        self.webcam1 = WebcamWindow(0, "Camera 1")
        self.webcam2 = WebcamWindow(1, "Camera 2")
        self.webcam1.parent_gui = self
        self.webcam2.parent_gui = self

        # ---------------- RECORDING SYSTEM ----------------
        self.recording = False
        self.log_file = None
        self.video_writer1 = None
        self.video_writer2 = None
        self.record_start_time = None

        self.reader = None

    # ---------------- CAMERA OPEN ----------------
    def open_cam1(self):
        self.webcam1.show()
        self.webcam1.start_camera()

    def open_cam2(self):
        self.webcam2.show()
        self.webcam2.start_camera()

    # ---------------- SERIAL ----------------
    def toggle_connect(self):
        if self.reader and self.reader.isRunning():
            self.reader.stop()
            self.reader = None
            self.connect_btn.setText("Connect")
            return

        port = self.port_input.text().strip()
        baud = int(self.baud_input.text())

        self.reader = SerialReader(port, baud)
        self.reader.data_signal.connect(self.handle_data)
        self.reader.raw_line_signal.connect(self.log_serial)
        self.reader.status_signal.connect(self.status_label.setText)
        self.reader.start()

        self.connect_btn.setText("Disconnect")

    # ---------------- CAMERA RECORDING ----------------
    def toggle_recording(self):
        if not self.recording: self.start_recording()
        else: self.stop_recording()

    def start_recording(self):
        timestamp = QDateTime.currentDateTime().toString("yyyyMMdd_hhmmss")

        self.log_file = open(f"serial_{timestamp}.txt", "w")
        self.record_start_time = QDateTime.currentMSecsSinceEpoch()

        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self.video_writer1 = cv2.VideoWriter(
            f"cam0_{timestamp}.mp4", fourcc, 30,
            (self.webcam1.frame_width, self.webcam1.frame_height)
        )
        self.video_writer2 = cv2.VideoWriter(
            f"cam1_{timestamp}.mp4", fourcc, 30,
            (self.webcam2.frame_width, self.webcam2.frame_height)
        )

        self.recording = True
        self.record_btn.setText("Stop Recording")

    def stop_recording(self):
        if self.video_writer1:
            self.video_writer1.release()
        if self.video_writer2:
            self.video_writer2.release()
        if self.log_file:
            self.log_file.close()

        self.recording = False
        self.record_btn.setText("Start Recording")

    # ---------------- SERIAL LOGGING ----------------
    def log_serial(self, text):
        if self.recording and self.log_file:
            t = (QDateTime.currentMSecsSinceEpoch() - self.record_start_time) / 1000
            self.log_file.write(f"[{t:.3f}] {text}\n")

    # ---------------- RESET ----------------
    def reset_encoder(self):
        if self.reader:
            self.reader.send_reset()
        self.sy = 0
        self.last_steps = 0
        self.map_x.clear()
        self.map_y.clear()
        self.slam_points.setData([], [])

    # ---------------- HANDLE DATA ----------------
    def handle_data(self, obj):
        # ACCEL
        ax, ay, az = obj["accel"].values()
        t = list(range(self.buf))
        self.ax = self.ax[1:] + [ax]
        self.ay = self.ay[1:] + [ay]
        self.az = self.az[1:] + [az]
        self.acc_x.setData(t, self.ax)
        self.acc_y.setData(t, self.ay)
        self.acc_z.setData(t, self.az)
        self.acc_text.setText(f"AX={ax:.2f} AY={ay:.2f} AZ={az:.2f}")

        # GYRO
        gx, gy, gz = obj["gyro"].values()
        self.gx = self.gx[1:] + [gx]
        self.gy_list = self.gy_list[1:] + [gy]
        self.gz = self.gz[1:] + [gz]
        self.gyro_x.setData(t, self.gx)
        self.gyro_y.setData(t, self.gy_list)
        self.gyro_z.setData(t, self.gz)
        self.gyro_text.setText(f"GX={gx:.2f} GY={gy:.2f} GZ={gz:.2f}")

        # ENCODER
        steps = obj["encoder_steps"]
        delta = steps - self.last_steps
        self.last_steps = steps
        forward = delta * float(self.dist_input.text())
        self.sy += forward

        self.steps_label.setText(f"Steps: {steps}")
        self.dist_label.setText(f"Distance: {self.sy:.3f} m")
        self.robot_dot.setData([0], [self.sy])

        # GPS
        gps_lat = obj["gps"]["lat"]
        gps_lon = obj["gps"]["lon"]
        self.gps_label.setText(f"GPS: {gps_lat}, {gps_lon}")

        # LIDAR
        lidar = obj.get("lidar_mm", -1)
        if 50 < lidar < 4000:
            self.map_x.append(lidar / 1000)
            self.map_y.append(self.sy)
            self.slam_points.setData(self.map_x, self.map_y)

        self.slam_text.setText(f"Y={self.sy:.3f} m   LIDAR={lidar} mm")


# ---------------------------------------------------
# MAIN
# ---------------------------------------------------
if __name__ == "__main__":
    app = QApplication(sys.argv)
    gui = ScannerGUI()
    gui.show()
    sys.exit(app.exec_())