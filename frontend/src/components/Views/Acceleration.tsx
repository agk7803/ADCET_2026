import { useState, useEffect, useRef, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Download } from "lucide-react";
import { useConnection } from "../../contexts/ConnectionContext";
import { apiStart, apiStop } from "../../utils/api";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const CHART_WINDOW = 100;

// -----------------------------------------------------------------------------
// USER CONFIGURABLE THRESHOLDS (DEFAULT VALUES)
// -----------------------------------------------------------------------------
const DEFAULT_UML = 1.2;
const DEFAULT_PML = 1.0;
// -----------------------------------------------------------------------------

interface Toast {
  message: string;
  type: "success" | "error";
  id: number;
}

interface AxPoint {
  time: string;
  rawTime: number; // for export
  ax: number;
  ay: number;
  az: number;
  chainage: number;
  status: string;
}

const Acceleration = () => {
  const { data, connected, history, clearView, viewFilters } = useConnection();
  const [running, setRunning] = useState(false);

  // Dynamic Thresholds State (Numeric for logic)
  const [uml, setUml] = useState(DEFAULT_UML);
  const [pml, setPml] = useState(DEFAULT_PML);

  // Input Buffer States (String for UI to prevent "01" issues)
  const [umlInput, setUmlInput] = useState(DEFAULT_UML.toString());
  const [pmlInput, setPmlInput] = useState(DEFAULT_PML.toString());

  // Sync buffers when thresholds change (e.g. from sync or reset)
  useEffect(() => {
    setUmlInput(uml.toString());
    setPmlInput(pml.toString());
  }, [uml, pml]);

  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (message: string, type: "success" | "error") => {
    const id = Date.now();
    setToasts(prev => [...prev, { message, type, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Derive Acceleration data from global history with per-tab filtering
  const accelData = useMemo(() => {
    const filterTimestamp = viewFilters['acceleration'] || 0;
    return history
      .filter(pt => pt.timestamp > filterTimestamp)
      .map(pt => {
        const ax = pt.accel?.x ?? 0;
        const ay = pt.accel?.y ?? 0;
        const az = pt.accel?.z ?? 0;
        const maxVal = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(az));

        let status = "CBML";
        if (maxVal >= uml) status = "UML";
        else if (maxVal >= pml) status = "PML";

        return {
          time: pt.localTime,
          rawTime: pt.timestamp,
          ax,
          ay,
          az,
          chainage: pt.y,
          status,
        } as AxPoint;
      });
  }, [history, viewFilters, uml, pml]);

  const [chainageValue, setChainageValue] = useState(data?.y ?? 0);

  useEffect(() => {
    if (data?.y !== undefined) {
      setChainageValue(data.y);
    }
  }, [data?.y]);

  // Timer State
  const [timer, setTimer] = useState("00:00:00");
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Full History for Export (use global history instead)
  const fullHistoryRef = useRef<AxPoint[]>([]);
  useEffect(() => {
    fullHistoryRef.current = accelData;
  }, [accelData]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  useEffect(() => {
    if (running && !startTimeRef.current) {
      startTimeRef.current = Date.now();
      timerIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Date.now() - startTimeRef.current;
          setTimer(formatTime(elapsed));
        }
      }, 1000);
    } else if (!running) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      startTimeRef.current = null;
      // Removed setTimer("00:00:00") to persist last duration
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [running]);

  // Removed redundant update effect that maintained local accelData state


  const startStream = async () => {
    try {
      await apiStart();
      setRunning(true);
      // Reset timer only upon starting a new session
      setTimer("00:00:00");
    } catch (err) {
      console.error("startStream error", err);
    }
  };

  const stopStream = async () => {
    try {
      await apiStop();
    } catch (err) {
      console.warn("apiStop failed", err);
    }
    setRunning(false);
  };

  /* 
   * Shifted to Backend Export 
   * Sends full history to server to be saved as CSV in data/TrackGeometry 
   */
  const exportData = async () => {
    if (fullHistoryRef.current.length === 0) {
      addToast("No data to export", "error");
      return;
    }

    // Format matches 'AccelPoint' Pydantic model on backend
    const payload = {
      data: fullHistoryRef.current
    };

    try {
      const res = await fetch(`${API_BASE}/export/acceleration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const j = await res.json();
        addToast(`Export Successful: ${j.file.split(/[\\/]/).pop()}`, "success");
      } else {
        const txt = await res.text();
        addToast(`Export Failed: ${txt}`, "error");
      }
    } catch (e: any) {
      console.error("Export error", e);
      addToast("Export Network Error", "error");
    }
  };

  const accelWindow = accelData.slice(-CHART_WINDOW);

  return (
    <div style={{ padding: 16 }} className="relative">
      {/* Dynamic Toast Notifications */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-6 py-3 rounded-full shadow-2xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto ${t.type === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white'
            }`}>
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-sm font-bold tracking-tight">{t.message}</span>
          </div>
        ))}
      </div>

      {/* Header / Controls */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Acceleration Monitoring</h3>
          <div className="text-[10px] text-gray-400 font-semibold uppercase mt-1 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
            Real-time monitoring | Actual Y: {data?.y?.toFixed(3) || "0.000"}m
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Timer Display */}
          <div className="bg-white border-2 border-gray-200 px-4 py-1.5 rounded-md font-mono font-bold text-lg text-blue-600 tracking-tighter shadow-sm">
            {timer}
          </div>

          <button
            onClick={() => clearView('acceleration')}
            className="px-6 py-2 bg-white text-rose-600 border border-rose-100 rounded-md font-bold text-sm shadow-md hover:bg-rose-50 transition-all uppercase ring-2 ring-rose-50"
          >
            CLEAR CHART
          </button>

          <button
            onClick={running ? stopStream : startStream}
            className={`px-8 py-2 rounded-md font-bold text-sm transition-all shadow-lg active:scale-95 uppercase ${running
              ? "bg-rose-600 text-white ring-2 ring-rose-100"
              : "bg-emerald-600 text-white ring-2 ring-emerald-100"
              }`}
          >
            {running ? "STOP SYSTEM" : "START SYSTEM"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* LEFT: Accel Graph */}
        <div className="flex-1 p-5 rounded-xl bg-white border border-gray-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Accelerometer (m/s²)</h4>
            <button
              onClick={exportData}
              className="px-6 py-2 bg-blue-600 text-white rounded-md font-bold text-sm shadow-lg hover:bg-blue-700 transition-all uppercase flex items-center gap-2 ring-2 ring-blue-100"
            >
              <Download size={16} /> EXPORT DATA
            </button>
          </div>

          <div style={{ height: 600 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={accelWindow} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                {/* Denser Axis Ticks */}
                <XAxis dataKey="time" minTickGap={10} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} tickCount={12} />
                <Tooltip />
                <Legend verticalAlign="top" />

                {/* Static Threshold Lines */}
                <ReferenceLine y={uml} label={{ value: "UML", fill: "red", fontSize: 12 }} stroke="red" strokeDasharray="3 3" strokeWidth={2} />
                <ReferenceLine y={-uml} stroke="red" strokeDasharray="3 3" strokeWidth={2} />
                <ReferenceLine y={pml} label={{ value: "PML", fill: "orange", fontSize: 12 }} stroke="orange" strokeDasharray="3 3" strokeWidth={2} />
                <ReferenceLine y={-pml} stroke="orange" strokeDasharray="3 3" strokeWidth={2} />

                <Line dataKey="ax" stroke="#d9534f" dot={false} isAnimationActive={false} name="Acc X" strokeWidth={2} />
                <Line dataKey="ay" stroke="#2b7bff" dot={false} isAnimationActive={false} name="Acc Y" strokeWidth={2} />
                <Line dataKey="az" stroke="#2ecc71" dot={false} isAnimationActive={false} name="Acc Z" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RIGHT: Chainage & Config (Static) */}
        <div className="w-80 flex flex-col gap-4">
          {/* Chainage Box */}
          <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm text-center">
            <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest">Chainage (m)</div>
            <div className="text-5xl font-mono font-bold text-blue-600 mt-2 tracking-tighter">
              {chainageValue.toFixed(3)}
            </div>
          </div>

          {/* Config Box (Dynamic Thresholds) */}
          <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-4 pb-2 border-b border-gray-200">
              Threshold Configuration
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 flex flex-col gap-4">
                <div className="flex-1">
                  <label className="text-[10px] text-rose-500 font-bold block mb-1 uppercase tracking-wider">UML (Urgent) m/s²</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={umlInput}
                    onChange={e => {
                      setUmlInput(e.target.value);
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setUml(val);
                    }}
                    className="w-full bg-transparent border-none focus:ring-0 text-2xl font-mono font-bold text-gray-800 p-0"
                  />
                </div>

                <div className="flex-1 pt-4 border-t border-gray-200">
                  <label className="text-[10px] text-amber-500 font-bold block mb-1 uppercase tracking-wider">PML (Planned) m/s²</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pmlInput}
                    onChange={e => {
                      setPmlInput(e.target.value);
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setPml(val);
                    }}
                    className="w-full bg-transparent border-none focus:ring-0 text-2xl font-mono font-bold text-gray-800 p-0"
                  />
                </div>
              </div>

              <button
                onClick={() => addToast("Thresholds synchronized with graph", "success")}
                className="w-full py-3.5 bg-gray-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl active:scale-95"
              >
                Apply Thresholds
              </button>
            </div>

            <div className={`mt-6 pt-4 border-t border-gray-100 flex items-center justify-between opacity-50`}>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`}></div>
                {connected ? "Live System" : "Disconnected"}
              </div>
              <span className="text-[10px] font-mono font-bold text-gray-300">v2.4.1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Acceleration;
