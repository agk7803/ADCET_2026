import React, { useEffect, useRef, useState } from "react";
import { useConnection } from "../../contexts/ConnectionContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const RearWindow: React.FC = () => {
  const { camerasRunning, recordingRunning } = useConnection();
  const [reloadKey, setReloadKey] = useState(0);

  // timer
  const [timer, setTimer] = useState("00:00:00");
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const formatTime = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const s = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // timer logic
  useEffect(() => {
    if (recordingRunning && !startTimeRef.current) {
      startTimeRef.current = Date.now();
      intervalRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          setTimer(formatTime(Date.now() - startTimeRef.current));
        }
      }, 1000);
    }

    if (!recordingRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
      setTimer("00:00:00");
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [recordingRunning]);

  useEffect(() => {
    const handleReload = () => {
      setReloadKey(k => k + 1);
    };
    window.addEventListener("reload-streams", handleReload);
    return () => {
      window.removeEventListener("reload-streams", handleReload);
    };
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20
      }}>
        <div>
          <h2 style={{ margin: 0 }}>Rear Window</h2>
          <p style={{ margin: "4px 0", color: "#666" }}>
            Backend OpenCV camera stream
          </p>
        </div>

        <div style={{
          background: "#fff",
          color: "#000",
          fontFamily: "monospace",
          fontSize: 24,
          padding: "8px 16px",
          borderRadius: 6,
          border: "2px solid #ccc",
          fontWeight: "bold"
        }}>
          {timer}
        </div>
      </div>

      <div style={{
        maxWidth: 900,
        background: "#000",
        borderRadius: 8,
        overflow: "hidden",
        border: "4px solid black",
        minHeight: 480,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        {camerasRunning ? (
          <img
            key={reloadKey}
            src={`${API_BASE}/video_feed?index=0&cache=${reloadKey}`}
            alt="camera stream"
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        ) : (
          <div style={{ color: "#777", textAlign: "center" }}>
            <h3>Camera Offline</h3>
            <p>Press Start to begin stream</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RearWindow;