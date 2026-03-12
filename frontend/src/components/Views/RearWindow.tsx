import React, { useEffect, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const RearWindow: React.FC = () => {
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
      setTimer("00:00:00");
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

  const startCamera = async () => {
    setError(null);
    setBusy(true);
    try {
      // 1) Start recording on backend first
      // Backend start_recording takes no body in your server; it returns filename in JSON.
      const recRes = await fetch(`${API_BASE}/recording/start`, { method: "POST" });
      if (!recRes.ok) {
        const txt = await recRes.text();
        throw new Error(`recording/start failed: ${recRes.status} ${txt}`);
      }
      // optional: read filename
      await recRes.json().catch(() => null);

      // 2) Tell backend to start camera (send index or default)
      const body = { index: selectedBackendIndex === "" ? 0 : Number(selectedBackendIndex) };
      const camRes = await fetch(`${API_BASE}/camera/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!camRes.ok) {
        const txt = await camRes.text();
        throw new Error(`camera/start failed: ${camRes.status} ${txt}`);
      }

      // 3) Reload MJPEG src and mark on
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
      // 1) Stop recording on backend
      const recStop = await fetch(`${API_BASE}/recording/stop`, { method: "POST" });
      if (!recStop.ok) {
        const txt = await recStop.text();
        throw new Error(`recording/stop failed: ${recStop.status} ${txt}`);
      }

      // 2) Stop camera index on backend
      const body = { index: selectedBackendIndex === "" ? 0 : Number(selectedBackendIndex) };
      const camRes = await fetch(`${API_BASE}/camera/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!camRes.ok) {
        const txt = await camRes.text();
        throw new Error(`camera/stop failed: ${camRes.status} ${txt}`);
      }

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>Rear Window (Backend stream)</h2>
          <p style={{ margin: "4px 0 0 0" }}>Backend MJPEG/OpenCV stream (server index). No browser source.</p>
        </div>

        <div style={{ background: "#fff", color: "#000", fontFamily: "monospace", fontSize: 24, padding: "8px 16px", borderRadius: 6, border: "2px solid #ccc", fontWeight: "bold" }}>
          {/* timer */}
          {timer}
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontWeight: 600 }}>Server camera index (optional)</label>
        <select value={selectedBackendIndex} onChange={(e) => setSelectedBackendIndex(e.target.value === "" ? "" : Number(e.target.value))}>
          <option value="">(server default)</option>
          {backendDevices.map((i) => <option key={i} value={i}>{`index ${i}`}</option>)}
        </select>

        <button onClick={startCamera} disabled={busy || cameraOn} style={{ background: "#16a34a", color: "#fff", padding: "8px 16px", borderRadius: 6 }}>
          Start Camera (Record)
        </button>
        <button onClick={stopCamera} disabled={busy || !cameraOn} style={{ background: "#dc2626", color: "#fff", padding: "8px 16px", borderRadius: 6 }}>
          Stop Camera (Save)
        </button>
        <button onClick={reloadStream} style={{ background: "#6b7280", color: "#fff", padding: "8px 16px", borderRadius: 6 }}>
          Reload Stream
        </button>
        {busy && <div style={{ marginLeft: 8 }}>Working…</div>}
      </div>

      {error && <div style={{ color: "red", marginBottom: 12 }}>{error}</div>}

      <div style={{ maxWidth: 900, background: "#000", borderRadius: 8, overflow: "hidden", border: "4px solid black", minHeight: 480, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {cameraOn ? (
          <img
            key={reloadKey}
            src={`${API_BASE}/video_feed?index=${selectedBackendIndex === "" ? 3 : selectedBackendIndex}&cache=${reloadKey}`}
            alt="Backend MJPEG"
            style={{ width: "100%", height: "auto", display: "block" }}
            onError={() => console.log("MJPEG error")}
          />
        ) : (
          <div style={{ color: "#666", textAlign: "center" }}>
            <h3>Camera Offline</h3>
            <p>Click Start to view feed and record.</p>
          </div>
        )}
      </div>

      <p style={{ marginTop: 10, color: "#666" }}>
        If blank, open raw MJPEG:{" "}
        <a href={`${API_BASE}/video_feed_face`} target="_blank" rel="noreferrer">
          click here
        </a>
      </p>
    </div>
  );
};

export default RearWindow;
