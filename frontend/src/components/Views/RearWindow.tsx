import React, { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const RearWindow: React.FC = () => {

  const [cameraOn, setCameraOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    if (recording && !startTimeRef.current) {
      startTimeRef.current = Date.now();

      intervalRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          setTimer(formatTime(Date.now() - startTimeRef.current));
        }
      }, 1000);
    }

    if (!recording) {
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
    }

  }, [recording]);



  const startRecording = async () => {
    setBusy(true);
    setError(null);
    try {
      const recStart = await fetch(`${API_BASE}/recording/start`, { method: "POST" });
      if (!recStart.ok) throw new Error("recording/start failed");
      setRecording(true);
    } catch (e: any) {
      console.error(e);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const stopRecording = async () => {
    setBusy(true);
    setRecording(false);
    setError(null);
    try {
      await fetch(`${API_BASE}/recording/stop`, { method: "POST" });
    } catch (e: any) {
      console.error(e);
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const startCamera = async () => {

    setBusy(true);
    setError(null);

    try {

      const camStart = await fetch(`${API_BASE}/camera/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: 0 })
      });

      if (!camStart.ok) {
        throw new Error("camera/start failed");
      }

      setReloadKey(k => k + 1);
      setCameraOn(true);

    } catch (e: any) {

      console.error(e);
      setError(String(e));

    } finally {

      setBusy(false);

    }

  };



  const stopCamera = async () => {

    setBusy(true);
    setCameraOn(false);
    if (recording) stopRecording().catch(() => {});
    setError(null);

    try {
      await fetch(`${API_BASE}/camera/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: 0 })
      });
      setReloadKey(k => k + 1);
    } catch (e: any) {
      console.error(e);
      setError(String(e));
    } finally {
      setBusy(false);
    }

  };



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



      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex gap-2">
          <button
            onClick={cameraOn ? stopCamera : startCamera}
            disabled={busy}
            className={`px-4 py-2 rounded font-bold transition shadow text-sm whitespace-nowrap ${busy ? "bg-gray-400 text-gray-200" : cameraOn ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}`}
          >
            {cameraOn ? "Stop Camera" : "Start Camera"}
          </button>

          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={busy || !cameraOn}
            className={`px-4 py-2 rounded font-bold transition shadow text-sm whitespace-nowrap ${busy || !cameraOn ? "bg-gray-400 text-gray-200 cursor-not-allowed opacity-50" : recording ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-yellow-500 hover:bg-yellow-600 text-white"}`}
          >
            {recording ? "Stop Recording" : "Start Recording"}
          </button>
        </div>

        {busy && <span className="text-sm text-gray-500">Working...</span>}
      </div>




      {error && (
        <div style={{ color: "red", marginBottom: 10 }}>
          {error}
        </div>
      )}



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

        {cameraOn ? (

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