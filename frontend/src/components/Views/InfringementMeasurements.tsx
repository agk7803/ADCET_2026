import React, { useState, useMemo, useEffect } from "react";
import Plot from "react-plotly.js";
import { useConnection } from "../../contexts/ConnectionContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const DEFAULT_UML = 0.15;
const DEFAULT_PML = 0.4;

interface Toast {
  message: string;
  type: "success" | "error";
  id: number;
}

const InfringementMeasurements: React.FC = () => {
  const { data, connected, systemLive, history, viewFilters, clearView } = useConnection();

  // Thresholds state
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

  // Sync with backend on mount
  useEffect(() => {
    const fetchThresholds = async () => {
      try {
        const res = await fetch(`${API_BASE}/config/thresholds`);
        const json = await res.json();
        if (json.thresholds) {
          if (json.thresholds.uml) setUml(json.thresholds.uml);
          if (json.thresholds.pml) setPml(json.thresholds.pml);
        }
      } catch (e) { console.error("Failed to sync thresholds:", e); }
    };
    fetchThresholds();
  }, []);

  // Derive 3D Plot Data from global history (Raw Chainage & Reactive Coloring)
  const plotData = useMemo(() => {
    const filterTimestamp = viewFilters['infringement'] || 0;
    const result = {
      l1: { x: [] as number[], y: [] as number[], z: [] as number[], c: [] as string[] },
      l2: { x: [] as number[], y: [] as number[], z: [] as number[], c: [] as string[] },
      l3: { x: [] as number[], y: [] as number[], z: [] as number[], c: [] as string[] }
    };

    const getPointColor = (val: number) => {
      if (val <= uml) return "red";    // UML (Urgent)
      if (val <= pml) return "orange"; // PML (Caution)
      return "green";                 // CBML (Safe)
    };

    const relevantHistory = history
      .filter(pt => pt.timestamp > filterTimestamp)
      .slice(-400); // Sliding window: last 400 points for clear visualization

    for (const pt of relevantHistory) {
      if (pt.lidar) {
        const { l1, l2, l3 } = pt.lidar;
        const y = pt.y;

        if (l1 > 0 && l1 < 4.0) { result.l1.x.push(-l1); result.l1.y.push(y); result.l1.z.push(0); result.l1.c.push(getPointColor(l1)); }
        if (l2 > 0 && l2 < 4.0) { result.l2.x.push(l2); result.l2.y.push(y); result.l2.z.push(0); result.l2.c.push(getPointColor(l2)); }
        if (l3 > 0 && l3 < 4.0) { result.l3.x.push(0); result.l3.y.push(y); result.l3.z.push(l3); result.l3.c.push(getPointColor(l3)); }
      }
    }
    return result;
  }, [history, viewFilters, uml, pml]);

  // Derived values for UI
  const resultCount = useMemo(() => plotData.l1.x.length + plotData.l2.x.length + plotData.l3.x.length, [plotData]);

  // Persistence logic for Current Distance
  const [persistedY, setPersistedY] = useState(0);
  useEffect(() => {
    if (data?.y !== undefined && data.y !== 0) {
      setPersistedY(data.y);
    }
  }, [data?.y]);

  const currentY = data?.y || persistedY;

  const applyThresholds = async () => {
    try {
      await fetch(`${API_BASE}/config/thresholds`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uml, pml })
      });
      addToast("Thresholds updated successfully!", "success");
    } catch (e) { addToast("Failed to update thresholds", "error"); }
  };

  const exportInfringements = async () => {
    try {
      const res = await fetch(`${API_BASE}/export/infringements`, { method: "POST" });
      const json = await res.json();
      if (json.file) {
        addToast(`Exported: ${json.file.split(/[\\/]/).pop()}`, "success");
      } else {
        throw new Error("No file path returned");
      }
    } catch (e) {
      addToast("Export failed", "error");
    }
  };

  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!connected) return;
    const timeout = setTimeout(() => {
      setRevision(prev => prev + 1);
    }, 150);
    return () => clearTimeout(timeout);
  }, [plotData, currentY]);

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen flex flex-col relative">
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

      {/* PREMIUM HEADER SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Infringement Measurements</h2>
            <div className="text-sm text-gray-400 mt-1 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
              {connected ? "Receiving LIDAR Data" : "Sensor Disconnected"}
              {systemLive && <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border border-purple-200 ml-2">SIMULATOR ACTIVE</span>}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Current Distance (Y)</span>
              <span className="text-xl font-mono font-bold text-gray-700">{currentY.toFixed(3)} m</span>
            </div>
            <div className="text-right flex flex-col">
              <span className="text-[10px] text-gray-400 font-bold uppercase">Points Active</span>
              <span className="text-xs font-bold text-blue-600">{resultCount}</span>
            </div>
          </div>
        </div>

        {/* THRESHOLD CONFIG CARD */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest block mb-3">Collision Thresholds</span>
          <div className="flex items-end gap-3">
            <div className="flex-grow bg-gray-50 p-3 rounded-lg border border-gray-100 flex gap-4">
              <div className="flex-1">
                <label className="text-[10px] text-rose-500 font-bold block mb-1 uppercase">UML (m)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={umlInput}
                  onChange={e => {
                    setUmlInput(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) setUml(val);
                  }}
                  className="w-full bg-transparent border-none focus:ring-0 text-lg font-mono font-bold text-gray-700 p-0"
                />
              </div>
              <div className="flex-1 border-l border-gray-200 pl-4">
                <label className="text-[10px] text-amber-500 font-bold block mb-1 uppercase">PML (m)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={pmlInput}
                  onChange={e => {
                    setPmlInput(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) setPml(val);
                  }}
                  className="w-full bg-transparent border-none focus:ring-0 text-lg font-mono font-bold text-gray-700 p-0"
                />
              </div>
            </div>
            <button onClick={applyThresholds} className="px-4 py-3 bg-gray-900 text-white rounded-lg font-bold text-xs uppercase hover:bg-gray-800 transition-all shadow-lg active:scale-95">Apply</button>
          </div>
        </div>

        {/* STATUS LEGEND CARD */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center gap-3">
          {[{ c: 'bg-red-500', t: 'UML (Urgent)', v: `X < ${uml}m` }, { c: 'bg-orange-500', t: 'PML (Caution)', v: `X < ${pml}m` }, { c: 'bg-green-500', t: 'CBML (Safe)', v: `X > ${pml}m` }].map((l, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold text-gray-600"><div className={`w-2 h-2 rounded-full ${l.c}`}></div> {l.t}</span>
              <span className="text-[10px] text-gray-400 font-mono font-bold uppercase">{l.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* PLOT AREA */}
      <div className="flex-grow bg-white rounded-2xl shadow-inner border border-gray-200 relative overflow-hidden flex flex-col min-h-[500px]">
        {/* Floating Controls on Right */}
        <div className="absolute top-6 right-6 z-10 flex gap-3">
          <button onClick={() => {
            clearView('infringement');
            setRevision(p => p + 1);
            addToast("Plot cleared successfully", "success");
          }} className="px-6 py-2 bg-white text-rose-600 border border-rose-100 rounded-md font-bold text-xs shadow-lg hover:bg-rose-50 transition-all uppercase ring-2 ring-rose-50">Clear Plot</button>
          <button onClick={exportInfringements} className="px-6 py-2 bg-emerald-600 text-white rounded-md font-bold text-xs shadow-lg hover:bg-emerald-700 transition-all uppercase ring-2 ring-emerald-100">Export CSV</button>
        </div>

        <div className="flex-grow">
          <Plot
            data={[
              { type: 'scatter3d', mode: 'lines+markers', x: plotData.l1.x, y: plotData.l1.y, z: plotData.l1.z, marker: { color: plotData.l1.c, size: 3 }, line: { color: 'orange', width: 2 }, name: "Left (-X)" },
              { type: 'scatter3d', mode: 'lines+markers', x: plotData.l2.x, y: plotData.l2.y, z: plotData.l2.z, marker: { color: plotData.l2.c, size: 3 }, line: { color: 'blue', width: 2 }, name: "Right (+X)" },
              { type: 'scatter3d', mode: 'lines+markers', x: plotData.l3.x, y: plotData.l3.y, z: plotData.l3.z, marker: { color: plotData.l3.c, size: 3 }, line: { color: 'red', width: 2 }, name: "Top (Z)" }
            ]}
            layout={{
              autosize: true, margin: { l: 0, r: 0, b: 0, t: 0 },
              paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
              uirevision: revision, dragmode: 'orbit',
              legend: { x: 0, y: 1 },
              transition: { duration: 0, easing: 'linear' },
              scene: {
                xaxis: { title: { text: 'X (Lateral) [m]' }, showgrid: true, zeroline: true },
                yaxis: { title: { text: 'Y (Chainage) [m]' }, showgrid: true, zeroline: true },
                zaxis: { title: { text: 'Z (Height) [m]' }, showgrid: true, zeroline: true },
                aspectmode: 'auto'
              }
            }}
            config={{
              responsive: true,
              scrollZoom: true,
              displaylogo: false
            }}
            useResizeHandler={true}
            style={{ width: "100%", height: "100%", minHeight: "500px" }}
            revision={revision}
          />
        </div>
      </div>
    </div>
  );
};

export default InfringementMeasurements;