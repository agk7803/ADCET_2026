import React, { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const RearWindow: React.FC = () => {

  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // camera selection
  const [cameraIndex, setCameraIndex] = useState<number>(0);
  const [cameraList, setCameraList] = useState<number[]>([]);

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

    if (cameraOn && !startTimeRef.current) {
      startTimeRef.current = Date.now();

      intervalRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          setTimer(formatTime(Date.now() - startTimeRef.current));
        }
      }, 1000);
    }

    if (!cameraOn) {
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

  }, [cameraOn]);



  // try loading camera list from backend
  useEffect(() => {

    (async () => {

      try {

        const r = await fetch(`${API_BASE}/camera/list`);

        if (r.ok) {
          const j = await r.json();

          if (Array.isArray(j.cameras)) {

            const indices = j.cameras
              .map((c: any) => c.index)
              .filter((x: any) => typeof x === "number");

            if (indices.length) {
              setCameraList(indices);
              setCameraIndex(indices[0]);
            }

          }

        }

      } catch (e) {
        console.log("camera list unavailable");
      }

    })();

  }, []);



  const startCamera = async () => {

    setBusy(true);
    setError(null);

    try {

      const recStart = await fetch(`${API_BASE}/recording/start`, {
        method: "POST"
      });

      if (!recStart.ok) {
        throw new Error("recording/start failed");
      }

      const camStart = await fetch(`${API_BASE}/camera/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: cameraIndex })
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
    setError(null);

    try {

      const recStop = await fetch(`${API_BASE}/recording/stop`, {
        method: "POST"
      });

      if (!recStop.ok) {
        throw new Error("recording/stop failed");
      }

      const camStop = await fetch(`${API_BASE}/camera/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: cameraIndex })
      });

      if (!camStop.ok) {
        throw new Error("camera/stop failed");
      }

      setReloadKey(k => k + 1);
      setCameraOn(false);

    } catch (e: any) {

      console.error(e);
      setError(String(e));

    } finally {

      setBusy(false);

    }

  };


  const reloadStream = () => setReloadKey(k => k + 1);


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



      <div style={{ display: "flex", gap: 12, marginBottom: 15 }}>

        <select
          value={cameraIndex}
          onChange={(e) => setCameraIndex(Number(e.target.value))}
        >
          {cameraList.map(i => (
            <option key={i} value={i}>
              Camera {i}
            </option>
          ))}
        </select>


        <button
          onClick={startCamera}
          disabled={busy || cameraOn}
          style={{ background: "#16a34a", color: "#fff", padding: "8px 16px", borderRadius: 6 }}
        >
          Start Camera
        </button>


        <button
          onClick={stopCamera}
          disabled={busy || !cameraOn}
          style={{ background: "#dc2626", color: "#fff", padding: "8px 16px", borderRadius: 6 }}
        >
          Stop Camera
        </button>


        <button
          onClick={reloadStream}
          style={{ background: "#6b7280", color: "#fff", padding: "8px 16px", borderRadius: 6 }}
        >
          Reload
        </button>

        {busy && <div>Working...</div>}

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
            src={`${API_BASE}/video_feed?index=${cameraIndex}&cache=${reloadKey}`}
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