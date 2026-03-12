import React from "react";
import { Train } from "lucide-react";
import { useConnection } from "../../contexts/ConnectionContext";
import { apiStart, apiStop } from "../../utils/api";

export const Header: React.FC = () => {
  const { backendConnected, sensorsRunning, dataSource, uiDataActive, setUiDataActive, clearHistory, setSessionStartTime } = useConnection();

  // Status Logic — only reflects backend reachability ("ready to receive data")
  let statusLabel = "SYSTEM OFFLINE";
  let statusColor = "text-rose-600";
  let dotColor = "bg-rose-500";

  if (backendConnected) {
    statusLabel = "SYSTEM ONLINE";
    statusColor = "text-emerald-600";
    dotColor = "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse";
  }

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

          {/* Master Gate Control — opens/closes data pipeline + starts chainage & timer */}
          <button
            onClick={() => {
              if (uiDataActive) {
                // Immediately update UI — don't wait for backend
                setUiDataActive(false);

                // Fire-and-forget: stop all recordings and cameras in background
                const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
                fetch(`${API}/recording/stop`, { method: "POST" }).catch(() => {});
                fetch(`${API}/recording/geometry/stop`, { method: "POST" }).catch(() => {});
                fetch(`${API}/recording/condition/stop`, { method: "POST" }).catch(() => {});
                for (let i = 0; i < 4; i++) {
                  fetch(`${API}/camera/stop`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ index: i }),
                  }).catch(() => {});
                }
              } else {
                clearHistory();
                setSessionStartTime(Date.now());
                const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
                fetch(`${API}/reset`, { method: "POST" }).catch(() => {});
                setUiDataActive(true);
              }
            }}
            className={`px-6 py-2 rounded-md font-bold text-sm uppercase transition-all shadow-lg active:scale-95 flex items-center gap-2 ${uiDataActive
              ? "bg-rose-600 text-white ring-2 ring-rose-100 hover:bg-rose-700"
              : "bg-emerald-600 text-white ring-2 ring-emerald-100 hover:bg-emerald-700"
              }`}
          >
            {uiDataActive ? "STOP SYSTEM" : "START SYSTEM"}
          </button>

          {/* Hardware Sensor Control (connect/disconnect) */}
          <button
            onClick={async () => {
              try {
                if (sensorsRunning) {
                  await apiStop();
                } else {
                  await apiStart();
                }
              } catch (e) {
                console.error("Sensor control failed", e);
              }
            }}
            className={`px-6 py-2 rounded-md font-bold text-sm uppercase transition-all shadow-lg active:scale-95 flex items-center gap-2 ${sensorsRunning
              ? "bg-blue-600 text-white ring-2 ring-blue-100"
              : "bg-white text-blue-600 border border-blue-100"
              }`}
          >
            {sensorsRunning ? "STOP SENSORS" : "START SENSORS"}
          </button>

        </div>
      </div>
    </header>
  );
};
