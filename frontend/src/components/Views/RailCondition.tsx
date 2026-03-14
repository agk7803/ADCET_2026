import React, { useEffect, useState } from "react";
import { useConnection } from "../../contexts/ConnectionContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export default function RailCondition() {
  const { data, connected, camerasRunning, recordingRunning } = useConnection();
  const [reloadKey, setReloadKey] = useState(0);

  const [localChainage, setLocalChainage] = useState(data?.y ?? 0);

  useEffect(() => {
    if (data?.y !== undefined) {
      setLocalChainage(data.y);
    }
  }, [data?.y]);

  // AI Models
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  // Camera State
  const [selectedCamIndex, setSelectedCamIndex] = useState(0);
  const [availableCameras, setAvailableCameras] = useState<number[]>([]);

  useEffect(() => {
    // Fetch available cameras
    fetch(`${API_BASE}/camera/list`)
      .then(res => res.json())
      .then(data => {
        if (data.cameras && Array.isArray(data.cameras)) {
          let indices = data.cameras.map((c: any) => c.index).filter((i: any) => typeof i === 'number');
          
          // Guarantee that 0, 1, 2 are always available
          const forcedIndices = [0, 1, 2];
          forcedIndices.forEach(idx => {
            if (!indices.includes(idx)) {
              indices.push(idx);
            }
          });
          
          // Sort to look nice
          indices.sort((a: number, b: number) => a - b);
          
          setAvailableCameras(indices);
          if (indices.length > 0) {
              // preserve current selected index if valid, else default to first
              setSelectedCamIndex(prev => indices.includes(prev) ? prev : indices[0]);
          }
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
    if (recordingRunning) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recordingRunning]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

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
            {availableCameras.map(i => (
              <option key={i} value={i}>Camera Index {i}</option>
            ))}
          </select>
        </div>

        {/* AI OPTIONS BAR (always shown) */}
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

        {/* Unified controls moved to header */}
      </div>

      {/* VIDEO FEEDS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Left: Raw Footage */}
        <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-700 relative aspect-video">
          <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded flex items-center gap-2">
            <span>Raw Footage (Cam {selectedCamIndex})</span>
          </div>
          <img
            src={`${API_BASE}/video_feed?index=${selectedCamIndex}&t=${reloadKey}`}
            className="w-full h-full object-cover"
            alt="Raw Feed"
            style={{ display: camerasRunning ? 'block' : 'none' }}
          />
          <div className="aspect-video flex items-center justify-center text-gray-500" style={{ display: camerasRunning ? 'none' : 'flex' }}>
            Feed Inactive
          </div>
        </div>

        {/* Right: Processed Feed (AI Detection) */}
        <div className="bg-black rounded-lg overflow-hidden border-2 border-gray-700 relative aspect-video">
          <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded flex items-center gap-2">
            <span>AI Detection</span>
          </div>
          <img
            src={`${API_BASE}/video_feed_rail_ai?index=${selectedCamIndex}&t=${reloadKey}`}
            className="w-full h-full object-cover"
            alt="Processed Feed"
            style={{ display: camerasRunning ? 'block' : 'none' }}
          />
          <div className="aspect-video flex items-center justify-center text-gray-500" style={{ display: camerasRunning ? 'none' : 'flex' }}>
            Feed Inactive
          </div>
        </div>
      </div>

    </div>
  );
}
