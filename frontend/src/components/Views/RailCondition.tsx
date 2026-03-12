import React, { useEffect, useState } from "react";
import { useConnection } from "../../contexts/ConnectionContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export default function RailCondition() {
  const { data, connected } = useConnection();
  const [cameraOn, setCameraOn] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [localChainage, setLocalChainage] = useState(data?.y ?? 0);

  useEffect(() => {
    if (data?.y !== undefined) {
      setLocalChainage(data.y);
    }
  }, [data?.y]);

  // AI / Laser Mode State
  const [analysisMode, setAnalysisMode] = useState<"laser" | "yolo">("laser");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [threshold, setThreshold] = useState(220); // Default threshold

  // Camera State
  const [selectedCamIndex, setSelectedCamIndex] = useState(2);
  const [availableCameras, setAvailableCameras] = useState<number[]>([]);

  useEffect(() => {
    // Fetch available cameras
    fetch(`${API_BASE}/camera/list`)
      .then(res => res.json())
      .then(data => {
        if (data.cameras && Array.isArray(data.cameras)) {
          const indices = data.cameras.map((c: any) => c.index).filter((i: any) => typeof i === 'number');
          setAvailableCameras(indices);
        }
      })
      .catch(e => console.error("Failed to list cameras", e));
  }, []);

  // Timer state
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Fetch models on mount
  useEffect(() => {
    fetch(`${API_BASE}/models_rail/list`)
      .then((res) => res.json())
      .then((data) => {
        if (data.models) {
          setModels(data.models);
          if (data.models.length > 0) handleModelSelect(data.models[0]);
        }
      })
      .catch((err) => console.error("Failed to list models", err));
  }, []);

  // Handle Mode Switch
  const handleModeChange = async (mode: "laser" | "yolo") => {
    setAnalysisMode(mode);
    try {
      await fetch(`${API_BASE}/condition/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
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

  useEffect(() => {
    if (cameraOn) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [cameraOn]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const toggleRecording = async () => {
    try {
      if (cameraOn) {
        // Stop
        await fetch(`${API_BASE}/recording/condition/stop`, { method: "POST" });
        setCameraOn(false);
      } else {
        // Start
        // 1. Ensure Sensors Connected
        try { await fetch(`${API_BASE}/connect`, { method: "POST" }); } catch (e) { console.warn("Connect failed or already connected"); }

        // 2. Start Video Recording
        const res = await fetch(`${API_BASE}/recording/condition/start`, { method: "POST" });
        if (!res.ok) throw new Error("Server returned " + res.status);

        setElapsedTime(0);
        setCameraOn(true);
        setReloadKey((p) => p + 1);
      }
    } catch (e: any) {
      console.error(e);
      alert("Error: " + (e.message || "Failed to toggle recording"));
    }
  };

  // Handle Threshold Change
  const handleThresholdChange = async () => {
    try {
      await fetch(`${API_BASE}/condition/threshold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold: Number(threshold) })
      });
    } catch (e) { console.error("Failed to set threshold", e); }
  };

  return (
    <div className="p-6 space-y-6">
      {/* HEADER: Chainage & Timestamp */}
      <div className="bg-white border rounded shadow-sm p-4 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Rail Condition</h2>
          <div className="text-sm text-gray-500">
            Status: <span className={connected ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
              {connected ? "LIVE" : "DISCONNECTED"}
            </span>
          </div>
        </div>

        {/* MODE SELECTION */}
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => handleModeChange("laser")}
            className={`px-4 py-2 rounded-md text-sm font-bold transition ${analysisMode === "laser" ? "bg-white shadow text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            Laser Profile
          </button>
          <button
            onClick={() => handleModeChange("yolo")}
            className={`px-4 py-2 rounded-md text-sm font-bold transition ${analysisMode === "yolo" ? "bg-white shadow text-purple-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            Component AI
          </button>
        </div>

        <div className="flex gap-8 text-right">
          <div>
            <div className="text-xs text-gray-400 uppercase font-semibold">Chainage</div>
            <div className="text-3xl font-mono font-bold text-gray-900">
              {localChainage.toFixed(3)} m
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase font-semibold">Duration</div>
            <div className="text-3xl font-mono font-bold text-blue-600">
              {formatTime(elapsedTime)}
            </div>
            <div className="text-xs text-gray-400 mt-1">{new Date().toLocaleTimeString()}</div>
          </div>
        </div>
      </div>

      {/* CONTROLS BAR: Camera & AI & Threshold */}
      <div className="flex flex-col md:flex-row gap-4">

        {/* CAMERA SELECTION */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3 flex items-center gap-4 flex-1">
          <span className="text-sm font-bold text-gray-700">Camera Source:</span>
          <select
            value={selectedCamIndex}
            onChange={(e) => setSelectedCamIndex(Number(e.target.value))}
            className="flex-1 p-2 border rounded text-sm"
          >
            <option value={2}>Default (Index 2)</option>
            {availableCameras.map(i => (
              <option key={i} value={i}>Camera Index {i}</option>
            ))}
          </select>
        </div>

        {/* MODE SPECIFIC CONTROLS */}
        {analysisMode === "laser" && (
          <div className="bg-blue-50 border border-blue-100 rounded p-3 flex items-center gap-4 flex-1">
            <span className="text-sm font-bold text-blue-700">Laser Threshold:</span>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-20 p-2 border rounded text-sm"
            />
            <button
              onClick={handleThresholdChange}
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-blue-700"
            >
              Set
            </button>
          </div>
        )}

        {/* AI OPTIONS BAR */}
        {analysisMode === "yolo" && (
          <div className="bg-purple-50 border border-purple-100 rounded p-3 flex items-center gap-4 flex-1">
            <span className="text-sm font-bold text-purple-700">AI Model:</span>
            <select
              value={selectedModel}
              onChange={(e) => handleModelSelect(e.target.value)}
              className="flex-1 p-2 border rounded text-sm"
            >
              {models.length === 0 && <option value="">No models found in backend/models_rail</option>}
              {models.map(m => (
                <option key={m} value={m}>{m.split('/').pop()}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* VIDEO FEEDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Left: Raw Footage */}
        <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-700 relative aspect-video">
          <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded flex items-center gap-2">
            <span>Raw Footage (Cam {selectedCamIndex})</span>
          </div>
          {cameraOn ? (
            <img
              src={`${API_BASE}/video_feed?index=${selectedCamIndex}&t=${reloadKey}`}
              className="w-full h-full object-cover"
              alt="Raw Feed"
            />
          ) : (
            <div className="aspect-video flex items-center justify-center text-gray-500">
              Feed Inactive
            </div>
          )}
        </div>

        {/* Right: Processed Feed (Dynamic) */}
        <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-700 relative aspect-video">
          <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded flex items-center gap-2">
            <span>{analysisMode === "yolo" ? "AI Detection" : "Laser Mask"}</span>
          </div>
          {cameraOn ? (
            <img
              src={analysisMode === "yolo"
                ? `${API_BASE}/video_feed_rail_ai?index=${selectedCamIndex}&t=${reloadKey}`
                : `${API_BASE}/video_feed_condition_overlay?index=${selectedCamIndex}&t=${reloadKey}`
              }
              className="w-full h-full object-cover"
              alt="Processed Feed"
            />
          ) : (
            <div className="aspect-video flex items-center justify-center text-gray-500">
              Feed Inactive
            </div>
          )}
        </div>
      </div>

      {/* CONTROLS */}
      <div className="flex justify-center">
        <button
          onClick={toggleRecording}
          className={`px-8 py-3 rounded font-bold text-white transition shadow-lg ${cameraOn ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
            }`}
        >
          {cameraOn ? "STOP RECORDING" : "START RECORDING"}
        </button>
      </div>
    </div>
  );
}
