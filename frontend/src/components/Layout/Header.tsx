import React from "react";
import { Train } from "lucide-react";
import { useConnection } from "../../contexts/ConnectionContext";

export const Header: React.FC = () => {
  const { backendConnected, dataSource, setUiDataActive, setSessionStartTime, camerasRunning, setCamerasRunning, recordingRunning, setRecordingRunning } = useConnection();
  const [busy, setBusy] = React.useState(false);

  // Status Logic — only reflects backend reachability ("ready to receive data")
  let statusLabel = "SYSTEM OFFLINE";
  let statusColor = "text-rose-600";
  let dotColor = "bg-rose-500";

  if (backendConnected) {
    statusLabel = "SYSTEM ONLINE";
    statusColor = "text-emerald-600";
    dotColor = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse";
  }

  const toggleCameras = async () => {
    setBusy(true);
    const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
    try {
      if (!camerasRunning) {
        await Promise.all([
          fetch(`${API}/camera/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: 0 }) }),
          fetch(`${API}/camera/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: 1 }) }),
          fetch(`${API}/camera/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: 2 }) })
        ]);
        setCamerasRunning(true);
        window.dispatchEvent(new CustomEvent("system-start")); // Sync UI
      } else {
        await Promise.all([
          fetch(`${API}/camera/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: 0 }) }),
          fetch(`${API}/camera/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: 1 }) }),
          fetch(`${API}/camera/stop`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index: 2 }) })
        ]);
        setCamerasRunning(false);
        setRecordingRunning(false); // Can't record without cameras
        window.dispatchEvent(new CustomEvent("system-stop")); // Sync UI
      }
    } catch (e) {
      console.error("Camera toggle failed", e);
    } finally {
      setBusy(false);
    }
  };

  const toggleRecording = async () => {
    setBusy(true);
    const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
    try {
      if (!recordingRunning) {
        if (!camerasRunning) await toggleCameras();
        setSessionStartTime(Date.now());
        await fetch(`${API}/connect`, { method: "POST" }).catch(() => { });
        await Promise.all([
          fetch(`${API}/recording/start`, { method: "POST" }),
          fetch(`${API}/recording/condition/start`, { method: "POST" }),
          fetch(`${API}/recording/rearwindow/start`, { method: "POST" })
        ]);
        setRecordingRunning(true);
        setUiDataActive(true);
      } else {
        await Promise.all([
          fetch(`${API}/recording/stop`, { method: "POST" }),
          fetch(`${API}/recording/condition/stop`, { method: "POST" }),
          fetch(`${API}/recording/rearwindow/stop`, { method: "POST" })
        ]);
        setRecordingRunning(false);
        setUiDataActive(false);
      }
    } catch (e) {
      console.error("Recording toggle failed", e);
    } finally {
      setBusy(false);
    }
  };

  const reloadStreams = () => {
    window.dispatchEvent(new CustomEvent("reload-streams"));
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">

        {/* Left Title */}
        <div className="flex items-center space-x-4">
          <Train className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Rail-Suraksha
            </h1>
            <p className="text-sm text-gray-600">Integrated Track Monitoring System</p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center space-x-4">

          {/* System Status */}
          <div className="text-sm font-semibold flex items-center gap-3 border-r border-gray-200 pr-4 h-10">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${dotColor}`} />
              <span className={statusColor}>
                {statusLabel}
              </span>
            </div>
            {dataSource && (
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-sm font-bold border border-slate-200 uppercase tracking-wider">
                {dataSource} MODE
              </span>
            )}
          </div>

          {/* Reload Button */}
          <button
            onClick={reloadStreams}
            className="p-2 rounded-md transition-all hover:bg-gray-100 text-gray-600 border border-gray-200 shadow-sm"
            title="Reload all streams"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
          </button>

          {/* Camera Control */}
          <button
            onClick={toggleCameras}
            disabled={busy}
            className={`px-4 py-2 rounded-md font-bold text-xs uppercase transition-all shadow active:scale-95 flex items-center gap-2 border ${camerasRunning ? "bg-blue-600 text-white border-blue-200" : "bg-white text-blue-600 border-blue-200 hover:bg-blue-50"}`}
          >
            {camerasRunning ? "Stop Cameras" : "Start Cameras"}
          </button>

          {/* Recording Control */}
          <button
            onClick={toggleRecording}
            disabled={busy}
            className={`px-4 py-2 rounded-md font-bold text-xs uppercase transition-all shadow active:scale-95 flex items-center gap-2 border ${recordingRunning ? "bg-rose-600 text-white border-rose-200 animate-pulse" : "bg-white text-rose-600 border-rose-200 hover:bg-rose-50"}`}
          >
            {recordingRunning ? "Stop Recording" : "Start Recording"}
          </button>

          {/* Export Data */}
          <button
            onClick={() => {
              const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
              window.open(`${API}/export-report`, "_blank");
              setTimeout(() => { alert("Data Extracted successfully!"); }, 500);
            }}
            className="px-4 py-2 rounded-md font-bold text-xs uppercase transition-all shadow active:scale-95 flex items-center gap-2 bg-slate-800 text-white hover:bg-slate-900 ml-2"
          >
            EXPORT DATA
          </button>

        </div>
      </div>
    </header>
  );
};
