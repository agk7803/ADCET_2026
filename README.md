# 🚂 RailSuraksha ITMS — Integrated Track Management System

## Getting Started

### Prerequisites

- **Node.js** ≥ 18 and **npm**
- **Python** ≥ 3.9
- **Git**

---

### 1. Clone the Repository

```bash
git clone https://github.com/agk7803/ADCET_2026
cd Source_code
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

### 3. Install Root-Level Dependencies (Electron + Concurrently)

```bash
npm install
```

### 4. Set Up the Python Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows

pip install -r requirements.txt
cd ..
```

### 5. Configure Environment Variables

Create `backend/.env`:

```env
DATA_SOURCE=SIMULATOR       # Options: SIMULATOR, SERIAL, WIFI
PORT=8000
LOG_LEVEL=INFO
```

### 6. Run the Application

**Option A — Full Electron app (frontend + Electron shell):**

> Make sure the backend is running first (see Option C), then:

```bash
npm run dev
```

**Option B — Frontend only (Vite dev server):**

```bash
npm run dev:frontend
```

**Option C — Backend only:**

```bash
npm run dev:backend
```

> The backend starts on `http://localhost:8000` and the frontend dev server on `http://localhost:5173`.

### 7. Build for Production

```bash
npm run build:electron
```

This builds the frontend and packages the Electron app into the `release/` directory.

### 8. Simulator Controls

```bash
npm run sim:start   # Start the sensor data simulator at 20 Hz
npm run sim:stop    # Stop the simulator
```

---

## Project Summary

**Railway ITMS** is a desktop application built for **real-time railway track inspection and monitoring**. It is developed as an Electron app with a React frontend and a FastAPI Python backend, targeting the **Smart India Hackathon (SIH)**.

### What It Does

The system collects sensor data (accelerometer, GPS, gyroscope) from onboard hardware — or a built-in simulator — and processes it alongside live video feeds to detect track defects, gauge irregularities, and infrastructure infringements in real time.

### Architecture

| Layer       | Technology                      | Location      |
| ----------- | ------------------------------- | ------------- |
| Desktop App | Electron                        | `electron/`   |
| Frontend    | React 18 + TypeScript + Vite    | `frontend/`   |
| Backend API | FastAPI + Uvicorn               | `backend/`    |
| CV / ML     | OpenCV, YOLOv8 (Ultralytics), PyTorch | `backend/`    |
| Charting    | Recharts, Plotly, Chart.js      | `frontend/`   |
| Mapping     | Leaflet + React-Leaflet         | `frontend/`   |
| Database    | Supabase                        | Cloud         |

### Key Features

- **Dashboard** — Live overview with dynamic parameter panels, alerts, video feeds, and a GPS track map.
- **Track Geometry Analysis** — Real-time gauge, cross-level, twist, and alignment monitoring with threshold-based alerts.
- **Acceleration Monitoring** — Vibration analysis with CBML / PML / UML classification and color-coded Excel exports.
- **Rail Condition Detection** — AI-powered defect identification using YOLOv8 object detection on camera feeds.
- **Infringement Measurements** — Clearance and profile monitoring along the track corridor.
- **Condition Monitoring** — Continuous health scoring and trend analysis.
- **Report Generation** — PDF inspection reports generated on demand.
- **Sensor Simulator** — Built-in data simulator for development and demo without physical hardware.
- **Maintenance Logging** — Track maintenance history and scheduling.

### Project Structure

```
Source_code/
├── backend/              # FastAPI Python backend
│   ├── api/              #   REST API routes
│   ├── core/             #   Configuration and settings
│   ├── models/           #   ML models
│   ├── services/         #   Business logic (CV, DB, reports, sensors)
│   ├── sensors.py        #   Hardware sensor interface
│   ├── simulator.py      #   Sensor data simulator
│   ├── server.py         #   Uvicorn entry point
│   └── requirements.txt  #   Python dependencies
├── electron/             # Electron main + preload scripts
├── frontend/             # React + Vite frontend
│   └── src/
│       ├── components/   #   UI components (Dashboard, Views, Streams)
│       ├── contexts/     #   React context providers
│       ├── hooks/        #   Custom React hooks
│       └── utils/        #   Utility functions
├── public/               # Static assets
└── package.json          # Root scripts and Electron config
```
