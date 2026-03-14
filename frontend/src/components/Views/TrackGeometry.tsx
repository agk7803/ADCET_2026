import { useEffect, useState, useRef, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useConnection } from "../../contexts/ConnectionContext";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export default function TrackGeometry() {
  const { 
    data, 
    connected, 
    systemLive, 
    history, 
    latestGaugePx, 
    clearView, 
    viewFilters,
    camerasRunning,
    recordingRunning 
  } = useConnection();

  // Calibration State
  const [calibrationPx, setCalibrationPx] = useState<number | "">(100); // Pixels for 1676mm

  // Derived plot data from global history with per-tab filtering
  const plotData = useMemo(() => {
    const filterTimestamp = viewFilters['geometry'] || 0;
    const filtered = history.filter(pt => pt.timestamp > filterTimestamp);
    return filtered
      .slice(-250) // Sliding window for clear visualization
      .map(pt => {
        const calibVal = Number(calibrationPx) || 1;
        const actualGaugeMm = pt.gaugePx > 0 ? (pt.gaugePx * (1676 / calibVal)) : 1676;
        const gaugeMm = actualGaugeMm.toFixed(2);
        const deviation = (actualGaugeMm - 1676).toFixed(2);

        return {
          time: pt.localTime,
          chainage: Number(pt.y.toFixed(3)),
          gx: Number(pt.gyro?.x.toFixed(4) || 0),
          gy: Number(pt.gyro?.y.toFixed(4) || 0),
          gz: Number(pt.gyro?.z.toFixed(4) || 0),
          gaugePx: pt.gaugePx.toFixed(1),
          gaugeMm: gaugeMm,
          deviation: deviation
        };
      });
  }, [history, calibrationPx, viewFilters]);

  const [reloadKey, setReloadKey] = useState(0);

  // Timer State
  const [timer, setTimer] = useState("00:00:00");
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, "0");
    const s = (totalSeconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // Timer effect
  useEffect(() => {
    if (recordingRunning && !startTimeRef.current) {
      startTimeRef.current = Date.now();
      timerIntervalRef.current = window.setInterval(() => {
        if (startTimeRef.current) {
          setTimer(formatTime(Date.now() - startTimeRef.current));
        }
      }, 1000);
    } else if (!recordingRunning) {
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
  }, [recordingRunning]);

  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCamIndex, setSelectedCamIndex] = useState(0);

  useEffect(() => {
    // Fetch available cameras
    fetch(`${API_BASE}/camera/list`)
      .then(res => res.json())
      .then(data => {
        let fetchedCameras = data.cameras || [];
        const forcedIndices = [0, 1, 2];
        forcedIndices.forEach(idx => {
          if (!fetchedCameras.find((c: any) => c.index === idx)) {
            fetchedCameras.push({ index: idx, name: `Camera ${idx}` });
          }
        });
        fetchedCameras.sort((a: any, b: any) => a.index - b.index);
        setCameras(fetchedCameras);
        if (fetchedCameras.length > 0) {
          setSelectedCamIndex(prev => fetchedCameras.find((c: any) => c.index === prev) ? prev : fetchedCameras[0].index);
        }
      })
      .catch(err => console.error("Failed to list cameras", err));
  }, []);

  const localChainage = data?.y ?? 0;

  useEffect(() => {
    const handleReload = () => {
      setReloadKey(k => k + 1);
    };
    window.addEventListener("reload-streams", handleReload);
    return () => {
      window.removeEventListener("reload-streams", handleReload);
    };
  }, []);

  const exportCSV = () => {
    if (plotData.length === 0) {
      alert("No data to export");
      return;
    }
    const headers = ["Timestamp", "Chainage", "Gyro X", "Gyro Y", "Gyro Z", "Gauge (px)", "Gauge (mm)", "Deviation (mm)"];
    const rows = plotData.map(pt =>
      [pt.time, pt.chainage, pt.gx, pt.gy, pt.gz, pt.gaugePx, pt.gaugeMm, pt.deviation].join(",")
    );
    const csvContent = "data:text/csv;charset=utf-8,"
      + headers.join(",") + "\n"
      + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "track_geometry_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = useMemo(() => {
    if (plotData.length === 0) return { avg: "0.0", min: "0.0", max: "0.0", devMax: "0.0" };
    const values = plotData.map(p => parseFloat(p.gaugeMm));
    const devs = plotData.map(p => Math.abs(parseFloat(p.deviation)));
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      avg: avg.toFixed(1),
      min: Math.min(...values).toFixed(1),
      max: Math.max(...values).toFixed(1),
      devMax: Math.max(...devs).toFixed(1)
    };
  }, [plotData]);

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Track Geometry</h2>
            <div className="text-sm text-gray-400 mt-1 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
              {connected ? "System Online" : "System Offline"}
              {systemLive && (
                <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-amber-200">
                  Simulation Active
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 font-semibold uppercase">Base Chainage</span>
              <span className="text-xl font-mono font-bold text-gray-700">{localChainage.toFixed(3)} m</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Trip Duration</span>
              <div className="bg-white border-2 border-gray-200 px-4 py-1 rounded-md font-mono font-bold text-lg text-blue-600 tracking-tighter shadow-sm">
                {timer}
              </div>
            </div>
            <div className="flex flex-col border-l pl-4 ml-2">
              <span className="text-[10px] text-gray-400 font-semibold uppercase mb-1">Camera Source</span>
              <div className="relative group">
                <select
                  value={selectedCamIndex}
                  onChange={(e) => setSelectedCamIndex(Number(e.target.value))}
                  disabled={camerasRunning}
                  className="bg-gray-50 text-gray-800 font-bold text-sm border border-gray-200 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed w-28 appearance-none"
                  style={{ backgroundImage: 'url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 20 20\'%3E%3Cpath stroke=\'%236b7280\' stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'1.5\' d=\'m6 8 4 4 4-4\'/%3E%3C/svg%3E")', backgroundPosition: 'right .5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                >
                  {cameras.length === 0 ? (
                    <option value="" disabled>No cameras found</option>
                  ) : (
                    cameras.map(c => (
                      <option key={c.index} value={c.index}>CAM {c.index}</option>
                    ))
                  )}
                </select>
                {camerasRunning && (
                  <div className="absolute top-full left-0 mt-1 w-full text-[9px] text-rose-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    Stop Camera to Change
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Gauge Calibration</span>
            <div className="bg-blue-50 px-2 py-1 rounded text-[10px] font-bold text-blue-600 border border-blue-100">STD: 1676mm</div>
          </div>
          <div className="flex items-center gap-4 mt-2">
            <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
              <label className="text-[10px] text-gray-400 font-bold block mb-1">Calib. Pixels</label>
              <input
                type="number"
                value={calibrationPx}
                onChange={(e) => setCalibrationPx(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-20 bg-transparent border-none focus:ring-0 text-lg font-mono font-bold text-gray-700 p-0"
              />
            </div>
            <div className="flex-grow text-right">
              <span className="text-[10px] text-gray-400 font-bold block">Live Calculated Gauge</span>
              <span className="text-3xl font-mono font-bold text-gray-900 tracking-tighter">
                {(latestGaugePx * (1676 / (Number(calibrationPx) || 1))).toFixed(1)}
                <small className="text-sm font-semibold text-gray-400 ml-1 uppercase">mm</small>
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 grid grid-cols-2 gap-4">
          <div className="flex flex-col justify-center border-r border-gray-50 pr-4">
            <span className="text-[10px] text-gray-400 font-semibold uppercase">Avg. Gauge</span>
            <div className="text-2xl font-bold text-emerald-600">{stats.avg} <small className="text-xs">mm</small></div>
            <div className="text-[10px] text-gray-400 mt-1">Min: {stats.min} | Max: {stats.max}</div>
          </div>
          <div className="flex flex-col justify-center pl-2">
            <span className="text-[10px] text-rose-500 font-semibold uppercase">Max Deviation</span>
            <div className="text-2xl font-bold text-rose-600">{stats.devMax} <small className="text-xs">mm</small></div>
            <div className="text-[10px] text-gray-400 mt-1">Allowed: ±6.0 mm</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div className="group bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl relative transition-all hover:ring-2 hover:ring-blue-500/50">
          <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
              <span>GEOMETRY RAW</span>
            </div>
          </div>
          {camerasRunning ? (
            <img
              src={`${API_BASE}/video_feed_geometry?index=${selectedCamIndex}&t=${reloadKey}`}
              className="w-full aspect-video object-cover"
              alt="Geometry Feed"
            />
          ) : (
            <div className="aspect-video flex flex-col items-center justify-center text-gray-600 bg-gray-900/50">
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3">
                <span className="block w-4 h-4 rounded-full bg-gray-700"></span>
              </div>
              <span className="text-xs font-bold tracking-widest uppercase opacity-50">Camera Standby</span>
            </div>
          )}
        </div>

        <div className="group bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl relative transition-all hover:ring-2 hover:ring-emerald-500/50">
          <div className="absolute top-4 left-4 z-10 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span>TRACK ANALYSIS</span>
            </div>
          </div>
          {camerasRunning ? (
            <img
              src={`${API_BASE}/video_feed_geometry_processed?index=${selectedCamIndex}&t=${reloadKey}`}
              className="w-full aspect-video object-cover"
              alt="Processed Feed"
            />
          ) : (
            <div className="aspect-video flex flex-col items-center justify-center text-gray-600 bg-gray-900/50">
              <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3">
                <span className="block w-4 h-4 rounded-full bg-gray-700"></span>
              </div>
              <span className="text-xs font-bold tracking-widest uppercase opacity-50">CV Analysis Off</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 mt-8 bg-gray-900/50 p-6 rounded-2xl border border-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-6 py-2 rounded-lg font-bold text-xs tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-lg active:scale-95 uppercase ring-2 ring-emerald-100"
          >
            Export CSV
          </button>

          <button
            onClick={() => clearView('geometry')}
            className="px-6 py-2 rounded-lg font-bold text-xs tracking-widest bg-white text-rose-600 hover:bg-rose-50 border border-rose-100 transition-all shadow-lg active:scale-95 uppercase ring-2 ring-rose-50"
          >
            Clear Data
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 mt-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest">Gyroscope Analysis</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Rotational Velocity (Rad/s) vs Chainage</p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1.5 bg-blue-50 px-2 py-1 rounded-md">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                <span className="text-[9px] font-black text-blue-700 uppercase">Gx</span>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-md">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                <span className="text-[9px] font-black text-emerald-700 uppercase">Gy</span>
              </div>
              <div className="flex items-center gap-1.5 bg-rose-50 px-2 py-1 rounded-md">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                <span className="text-[9px] font-black text-rose-600 uppercase">Gz</span>
              </div>
            </div>
          </div>

          <div className="h-[300px] -ml-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={plotData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis
                  dataKey="chainage"
                  type="number"
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#94A3B8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFF', borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '12px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                  labelStyle={{ fontSize: '10px', color: '#94A3B8', marginBottom: '4px', textTransform: 'uppercase' }}
                />
                <Line type="monotone" dataKey="gx" stroke="#3B82F6" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="gy" stroke="#10B981" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="gz" stroke="#FB7185" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
