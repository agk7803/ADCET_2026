import React, { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const ConditionMonitoring: React.FC = () => {
  const [reloadKey, setReloadKey] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timer State
  const [timer, setTimer] = useState("00:00:00");
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  const CAMERA_INDEX = 1; // fixed camera index for down-facing camera

  // AI Models
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // Timer effect
  useEffect(() => {
    if (recording && !startTimeRef.current) {
      startTimeRef.current = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          setTimer(formatTime(Date.now() - startTimeRef.current));
        }
      }, 1000);
    } else if (!recording) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      startTimeRef.current = null;
      setTimer("00:00:00");
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [recording]);

  // No camera list needed: we always use hardcoded camera index (2) for the rear-facing camera.
  // Fetch models on mount
  useEffect(() => {
    fetch(`${API_BASE}/models/list`)
      .then((res) => res.json())
      .then((data) => {
        if (data.models) {
          setModels(data.models);
          if (data.models.length > 0) handleModelSelect(data.models[0]);
        }
      })
      .catch((err) => console.error("Failed to list models", err));
  }, []);

  // Handle Model Selection
  const handleModelSelect = async (path: string) => {
    setSelectedModel(path);
    try {
      await fetch(`${API_BASE}/models/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
      });
    } catch (e) { console.error("Failed to select model", e); }
  };

  const startRecording = async () => {
    setError(null);
    setBusy(true);
    try {
      // 1. Start Sensor Recording
      await fetch(`${API_BASE}/recording/start`, { method: "POST" });
      // 2. Start Condition Recording (Video) -> Handles Yolo/Laser based on mode
      await fetch(`${API_BASE}/recording/condition/start`, { method: "POST" });
      setRecording(true);
    } catch (e: any) {
      console.error("startRecording error", e);
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const stopRecording = async () => {
    setError(null);
    setBusy(true);
    try {
      // 1. Stop Sensor Recording
      await fetch(`${API_BASE}/recording/stop`, { method: "POST" });
      // 2. Stop Condition Recording
      await fetch(`${API_BASE}/recording/condition/stop`, { method: "POST" });
      setRecording(false);
    } catch (e: any) {
      console.error("stopRecording error", e);
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setError(null);
    setBusy(true);
    try {
      // 3. Ensure Sensors Connected (for Chainage)
      try { await fetch(`${API_BASE}/connect`, { method: "POST" }); } catch (e) { }

      // 4. Start Camera Hardware
      await fetch(`${API_BASE}/camera/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: CAMERA_INDEX }),
      });

      // 5. Reload MJPEG src and mark on
      setReloadKey((k) => k + 1);
      setCameraOn(true);
    } catch (e: any) {
      console.error("startCamera error", e);
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const stopCamera = async () => {
    setError(null);
    setBusy(true);
    setCameraOn(false); // optimistic update

    // Fire and forget
    if (recording) {
        setRecording(false);
        fetch(`${API_BASE}/recording/stop`, { method: "POST" }).catch(() => {});
        fetch(`${API_BASE}/recording/condition/stop`, { method: "POST" }).catch(() => {});
    }

    try {
      await fetch(`${API_BASE}/camera/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: CAMERA_INDEX }),
      });
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      console.error("stopCamera error", e);
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const reloadStream = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    const handleSystemStop = () => {
      if (recording) stopRecording();
      if (cameraOn) stopCamera();
    };

    window.addEventListener("system-stop", handleSystemStop);
    return () => window.removeEventListener("system-stop", handleSystemStop);
  }, [cameraOn, recording]);

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Condition Monitoring</h2>
          <p style={{ margin: "4px 0 0 0" }}>View and analyze the components condition of the rail tracks in real-time.</p>
        </div>

        <div style={{ background: "#fff", color: "#000", fontFamily: "monospace", fontSize: 24, padding: "8px 16px", borderRadius: 6, border: "2px solid #ccc", fontWeight: "bold" }}>
          {/* timer */}
          {timer}
        </div>
      </div>

      {/* Control Bar */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        {/* AI Controls (always shown) */}
        <div style={{ marginBottom: 12, padding: 12, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 6, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#7e22ce", fontWeight: "bold" }}>AI Model:</span>
          <select
            value={selectedModel}
            onChange={(e) => handleModelSelect(e.target.value)}
            style={{ padding: 6, borderRadius: 4, border: "1px solid #d8b4fe" }}
          >
            {models.length === 0 && <option value="">No models found in backend/models</option>}
            {models.map((m) => (
              <option key={m} value={m.split('/').pop()}>
                {m.split('/').pop()}
              </option>
            ))}
          </select>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded p-3 flex items-center gap-4">
          <span className="text-sm font-bold text-gray-700">Camera Source:</span>
          <span className="text-sm">Line scan camera</span>
        </div>

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
        <button onClick={reloadStream} style={{ background: "#6b7280", color: "#fff", padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer" }}>
          Reload
        </button>
      </div>

      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left: Raw */}
        <div style={{ background: "#000", borderRadius: 8, overflow: "hidden", border: "2px solid #333", position: "relative", aspectRatio: "16/9" }}>
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 12, zIndex: 2 }}>Raw Feed</div>
          {cameraOn ? (
            <img
              key={`raw-${reloadKey}`}
              src={`${API_BASE}/video_feed?index=${CAMERA_INDEX}&cache=${reloadKey}`}
              alt="Raw Feed"
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Waiting...</div>
          )}
        </div>

        {/* Right: Processed */}
        <div style={{ background: "#000", borderRadius: 8, overflow: "hidden", border: "2px solid #333", position: "relative", aspectRatio: "16/9" }}>
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 12, zIndex: 2 }}>
            Processed (YOLO Overlay)
          </div>
          {cameraOn ? (
            <img
              key={`proc-${reloadKey}`}
              src={`${API_BASE}/video_feed_yolo?index=${CAMERA_INDEX}&cache=${reloadKey}`}
              alt="Processed Feed"
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Waiting...</div>
          )}
        </div>
      </div>


    </div>
  );
};

export default ConditionMonitoring;
