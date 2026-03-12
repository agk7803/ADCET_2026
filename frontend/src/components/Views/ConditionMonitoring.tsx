import React, { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const ConditionMonitoring: React.FC = () => {
  const [reloadKey, setReloadKey] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Timer State
  const [timer, setTimer] = useState("00:00:00");
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  // Backend index (default blank -> server uses PROFILE_CAMERA_INDEX or default)
  const [selectedBackendIndex, setSelectedBackendIndex] = useState<number | "">("");

  // AI / Laser Mode State
  const [analysisMode, setAnalysisMode] = useState<"laser" | "ai">("laser");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  // For display of backend camera list (optional)
  const [backendDevices, setBackendDevices] = useState<number[]>([]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // Timer effect
  useEffect(() => {
    if (cameraOn && !startTimeRef.current) {
      startTimeRef.current = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          setTimer(formatTime(Date.now() - startTimeRef.current));
        }
      }, 1000);
    } else if (!cameraOn) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      startTimeRef.current = null;
      // Removed setTimer("00:00:00")
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [cameraOn]);

  useEffect(() => {
    // Try to fetch backend camera list (non-fatal)
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/camera/list`);
        if (r.ok) {
          const j = await r.json();
          // try to map to indices if backend returns objects
          if (Array.isArray(j.cameras)) {
            const indices = j.cameras.map((c: any) => c.index).filter((x: any) => typeof x === "number");
            setBackendDevices(indices);
            if (indices.length > 0 && selectedBackendIndex === "") setSelectedBackendIndex(indices[0]);
          }
        }
      } catch (e) {
        // ignore
      }
    })();
  }, []);

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

  // Handle Mode Switch (Backend Logic)
  const handleModeChange = async (mode: "laser" | "ai") => {
    setAnalysisMode(mode);
    const backendMode = mode === "ai" ? "yolo" : "laser";
    try {
      await fetch(`${API_BASE}/condition/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: backendMode })
      });
    } catch (e) { console.error("Failed to set mode", e); }
  };

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

  const startCamera = async () => {
    setError(null);
    setBusy(true);
    try {
      // 1. Start Sensor Recording
      await fetch(`${API_BASE}/recording/start`, { method: "POST" });

      // 2. Start Condition Recording (Video) -> Handles Yolo/Laser based on mode
      await fetch(`${API_BASE}/recording/condition/start`, { method: "POST" });

      // 3. Ensure Sensors Connected (for Chainage)
      try { await fetch(`${API_BASE}/connect`, { method: "POST" }); } catch (e) { }

      // 4. Start Camera Hardware
      const body = { index: selectedBackendIndex === "" ? 2 : Number(selectedBackendIndex) };
      await fetch(`${API_BASE}/camera/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // 5. Reload MJPEG src and mark on
      setTimer("00:00:00"); // Reset timer on NEW recording
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
    try {
      // 1. Stop Sensor Recording
      await fetch(`${API_BASE}/recording/stop`, { method: "POST" });

      // 2. Stop Condition Recording
      await fetch(`${API_BASE}/recording/condition/stop`, { method: "POST" });

      // 3. Stop Camera Hardware
      const body = { index: selectedBackendIndex === "" ? 2 : Number(selectedBackendIndex) };
      await fetch(`${API_BASE}/camera/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // force reload to clear image
      setReloadKey((k) => k + 1);
      setCameraOn(false);
    } catch (e: any) {
      console.error("stopCamera error", e);
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const reloadStream = () => setReloadKey((k) => k + 1);

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
        <select value={selectedBackendIndex} onChange={(e) => setSelectedBackendIndex(e.target.value === "" ? "" : Number(e.target.value))}>
          <option value="">Camera Index (Default: 2)</option>
          {backendDevices.map((i) => <option key={i} value={i}>{`Cam ${i}`}</option>)}
        </select>

        {/* Mode Toggles */}
        <div style={{ display: "flex", background: "#f3f4f6", padding: 4, borderRadius: 6 }}>
          <button
            onClick={() => handleModeChange("laser")}
            style={{
              padding: "6px 12px", borderRadius: 4, border: "none", cursor: "pointer",
              background: analysisMode === "laser" ? "#fff" : "transparent",
              color: analysisMode === "laser" ? "#2563eb" : "#666",
              boxShadow: analysisMode === "laser" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
              fontWeight: "bold"
            }}
          >
            Laser Profile
          </button>
          <button
            onClick={() => handleModeChange("ai")}
            style={{
              padding: "6px 12px", borderRadius: 4, border: "none", cursor: "pointer",
              background: analysisMode === "ai" ? "#fff" : "transparent",
              color: analysisMode === "ai" ? "#9333ea" : "#666",
              boxShadow: analysisMode === "ai" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
              fontWeight: "bold"
            }}
          >
            AI Model
          </button>
        </div>

        <button onClick={startCamera} disabled={busy || cameraOn} style={{ background: "#16a34a", color: "#fff", padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer" }}>
          Start Recording
        </button>
        <button onClick={stopCamera} disabled={busy || !cameraOn} style={{ background: "#dc2626", color: "#fff", padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer" }}>
          Stop Recording
        </button>
        <button onClick={reloadStream} style={{ background: "#6b7280", color: "#fff", padding: "8px 16px", borderRadius: 6, border: "none", cursor: "pointer" }}>
          Reload
        </button>
      </div>

      {/* AI Controls */}
      {analysisMode === "ai" && (
        <div style={{ marginBottom: 12, padding: 12, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 6, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#7e22ce", fontWeight: "bold" }}>AI Model:</span>
          <select
            value={selectedModel}
            onChange={(e) => handleModelSelect(e.target.value)}
            style={{ padding: 6, borderRadius: 4, border: "1px solid #d8b4fe" }}
          >
            {models.length === 0 && <option value="">No models found in backend/models</option>}
            {models.map(m => <option key={m} value={m}>{m.split('/').pop()}</option>)}
          </select>
        </div>
      )}

      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left: Raw */}
        <div style={{ background: "#000", borderRadius: 8, overflow: "hidden", border: "2px solid #333", position: "relative", minHeight: 360 }}>
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>Raw Feed</div>
          {cameraOn ? (
            <img
              key={`raw-${reloadKey}`}
              src={`${API_BASE}/video_feed?index=${selectedBackendIndex === "" ? 2 : selectedBackendIndex}&cache=${reloadKey}`}
              alt="Raw Feed"
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          ) : (
            <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Waiting...</div>
          )}
        </div>

        {/* Right: Processed */}
        <div style={{ background: "#000", borderRadius: 8, overflow: "hidden", border: "2px solid #333", position: "relative", minHeight: 360 }}>
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
            {analysisMode === "ai" ? "AI Detection" : "Laser Mask"}
          </div>
          {cameraOn ? (
            <img
              key={`proc-${reloadKey}`}
              src={analysisMode === "ai"
                ? `${API_BASE}/video_feed_yolo?index=${selectedBackendIndex === "" ? 2 : selectedBackendIndex}&cache=${reloadKey}`
                : `${API_BASE}/video_feed_condition_overlay?index=${selectedBackendIndex === "" ? 2 : selectedBackendIndex}&cache=${reloadKey}`
              }
              alt="Processed Feed"
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          ) : (
            <div style={{ height: 360, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>Waiting...</div>
          )}
        </div>
      </div>


    </div>
  );
};

export default ConditionMonitoring;
