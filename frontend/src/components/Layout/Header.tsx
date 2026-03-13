import React from "react";
import { Train } from "lucide-react";
import { useConnection } from "../../contexts/ConnectionContext";

export const Header: React.FC = () => {
  const { backendConnected, dataSource, setUiDataActive, clearHistory, setSessionStartTime } = useConnection();
  const [systemRunning, setSystemRunning] = React.useState(false);
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

  const toggleSystem = async () => {
    setBusy(true);
    const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
    
    try {
      if (!systemRunning) {
        // Start System
        clearHistory();
        setSessionStartTime(Date.now());
        
        // Connect sensors
        await fetch(`${API}/connect`, { method: "POST" }).catch(() => {});
        
        // Start camera (using camera index 2 for condition monitoring)
        await fetch(`${API}/camera/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index: 2 }),
        });
        
        // Start recordings
        await fetch(`${API}/recording/start`, { method: "POST" });
        await fetch(`${API}/recording/condition/start`, { method: "POST" });
        
        setUiDataActive(true);
        setSystemRunning(true);
      } else {
        // Stop System
        setUiDataActive(false);
        
        // Stop recordings
        await fetch(`${API}/recording/stop`, { method: "POST" });
        await fetch(`${API}/recording/condition/stop`, { method: "POST" });
        
        // Stop camera
        await fetch(`${API}/camera/stop`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ index: 2 }),
        });
        
        setSystemRunning(false);
        // Notify other UI components to stop their local camera/recording state
        window.dispatchEvent(new CustomEvent("system-stop"));
      }
    } catch (e) {
      console.error("System toggle failed", e);
    } finally {
      setBusy(false);
    }
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
        <div className="flex items-center space-x-6">

          {/* System Status — "ready to receive" indicator */}
          <div className="text-sm font-semibold flex items-center gap-3 border-r border-gray-200 pr-4">
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

          {/* System Control Button */}
          <button
            onClick={toggleSystem}
            disabled={busy}
            className={`px-6 py-2 rounded-md font-bold text-sm uppercase transition-all shadow-lg active:scale-95 flex items-center gap-2 ${busy ? "bg-gray-400 text-gray-200" : systemRunning
              ? "bg-rose-600 text-white ring-2 ring-rose-100 hover:bg-rose-700"
              : "bg-emerald-600 text-white ring-2 ring-emerald-100 hover:bg-emerald-700"
              }`}
          >
            {systemRunning ? "STOP SYSTEM" : "START SYSTEM"}
          </button>

        </div>
      </div>
    </header>
  );
};
