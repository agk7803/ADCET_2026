import React, { useState, useEffect, useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle, TrendingUp, Wifi, WifiOff, MapPin, Play, FileText, Pause, Square, Download, Trash2 } from 'lucide-react';
import { useConnection } from '../../contexts/ConnectionContext';
import { TrainMap } from './TrainMap';


export const Overview: React.FC = () => {
  const {
    backendConnected,
    uiDataActive,
    systemLive,
    data,
    history,
    alerts,
    sessionStartTime,
    isReplaying,
    replaySession,
    replaySpeed,
    startReplay,
    stopReplay,
    toggleReplayPause,
    setReplaySpeed,
    replayProgress,
  } = useConnection();

  // ─── Live Session Duration ───
  const [sessionDuration, setSessionDuration] = useState("00:00:00");
  useEffect(() => {
    if (!sessionStartTime || !uiDataActive) return;
    const interval = setInterval(() => {
      const ms = Date.now() - sessionStartTime;
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
      const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
      const s = (totalSec % 60).toString().padStart(2, '0');
      setSessionDuration(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime, uiDataActive]);

  // ─── Derived Metrics ───
  const chainage = data?.y ?? 0;
  const distanceKm = Math.abs(chainage / 1000);

  const avgSpeed = useMemo(() => {
    if (!sessionStartTime || !uiDataActive) return 0;
    const elapsedHours = (Date.now() - sessionStartTime) / 3600000;
    if (elapsedHours < 0.0001) return 0;
    return distanceKm / elapsedHours;
  }, [sessionStartTime, uiDataActive, distanceKm]);

  // ─── Time Started ───
  const timeStartedStr = sessionStartTime
    ? new Date(sessionStartTime).toLocaleTimeString()
    : '--';

  // ─── System Status ───
  const systemStatus = !backendConnected
    ? { label: "Offline", color: "text-rose-600", bg: "bg-rose-50", icon: <WifiOff className="text-rose-500" /> }
    : uiDataActive
      ? { label: "Running", color: "text-emerald-600", bg: "bg-emerald-50", icon: <CheckCircle className="text-emerald-500" /> }
      : { label: "Ready", color: "text-amber-600", bg: "bg-amber-50", icon: <Wifi className="text-amber-500" /> };

  // ─── Data Points / Rate ───
  const dataPoints = history.length;
  const alertCount = alerts.length;

  const handleDownloadReport = (sessionId: number) => {
    window.open(`${import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000"}/sessions/${sessionId}/report`, '_blank');
  };

  // ─── Session History ───
  const [sessions, setSessions] = useState<any[]>([]);
  const fetchSessions = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000"}/sessions`);
      const data = await resp.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    if (!window.confirm(`Are you sure you want to delete session #${sessionId}? This action cannot be undone.`)) return;
    
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000"}/sessions/${sessionId}`, {
        method: 'DELETE'
      });
      if (resp.ok) {
        fetchSessions(); // Refresh list
      } else {
        alert("Failed to delete session.");
      }
    } catch (err) {
      console.error("Error deleting session:", err);
      alert("Error deleting session.");
    }
  };

  useEffect(() => {
    fetchSessions();
    // Refresh history when system stops or every 30s
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, [uiDataActive]);

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">System Overview</h2>
          <p className="text-gray-600">Real-time health and performance metrics</p>
        </div>
        {isReplaying && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest leading-none mb-1">Active Replay</span>
              <span className="text-sm font-bold text-gray-900">Session #{replaySession}</span>
            </div>
            <button
              onClick={stopReplay}
              className="flex items-center gap-2 text-xs font-black bg-rose-600 text-white px-4 py-2 rounded-lg hover:bg-rose-700 transition-all hover:scale-105 active:scale-95 shadow-md shadow-rose-200"
            >
              <Square className="w-3.5 h-3.5 fill-current" /> EXIT REPLAY
            </button>
          </div>
        )}
      </header>

      {/* ─── STATUS CARDS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard
          title="System Status"
          value={systemStatus.label}
          icon={systemStatus.icon}
          trend={backendConnected ? "Backend reachable" : "Backend unreachable"}
          trendColor={backendConnected ? "text-emerald-600" : "text-rose-600"}
        />
        <StatusCard
          title="Live Data"
          value={isReplaying ? "REPLAY" : (systemLive ? "Streaming" : "No Stream")}
          icon={<Activity className={isReplaying ? "text-amber-500" : (systemLive ? "text-blue-500" : "text-gray-400")} />}
          trend={isReplaying ? `Replaying Session #${replaySession}` : `${dataPoints.toLocaleString()} data points collected`}
          trendColor={isReplaying ? "text-amber-600" : "text-blue-600"}
        />
        <StatusCard
          title="Chainage"
          value={`${chainage.toFixed(3)} m`}
          icon={<TrendingUp className="text-purple-500" />}
          trend={`${distanceKm.toFixed(3)} km traveled`}
          trendColor="text-purple-600"
        />
        <StatusCard
          title="Pending Alerts"
          value={String(alertCount)}
          icon={<AlertTriangle className={alertCount > 0 ? "text-rose-500" : "text-amber-500"} />}
          trend={alertCount === 0 ? "No critical issues" : `${alertCount} alert${alertCount > 1 ? 's' : ''} logged`}
          trendColor={alertCount === 0 ? "text-gray-500" : "text-rose-600"}
        />
      </div>

      {/* ─── OPERATION + PROGRESS ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[420px]">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-gray-900 border-l-4 border-blue-600 pl-3">Operation Summary</h3>
            {uiDataActive && (
              <span className="flex items-center gap-1.5 text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full animate-pulse uppercase">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Recording Live
              </span>
            )}
          </div>

          <div className="space-y-4 flex-grow">
            <SummaryItem label="Session Duration" value={uiDataActive ? sessionDuration : (sessionStartTime ? sessionDuration : "--")} />
            <SummaryItem label="Distance Traveled" value={`${distanceKm.toFixed(3)} km`} />
            <SummaryItem label="Average Speed" value={`${avgSpeed.toFixed(1)} km/h`} />
            <SummaryItem label="Time Started" value={timeStartedStr} />
            <SummaryItem label="Data Points" value={dataPoints.toLocaleString()} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[420px] relative">
          <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Live Tracker</h3>
            </div>
            {data && (
              <div className="bg-black/80 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/20 shadow-xl transition-all">
                <div className="flex items-center gap-4 text-[11px] font-mono">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400 font-bold uppercase tracking-tighter">LAT</span>
                    <span className="text-white">{(data as any).dr_gps?.lat?.toFixed(6) || data.gps.lat.toFixed(6)}</span>
                  </div>
                  <div className="w-[1px] h-3 bg-white/20"></div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-bold uppercase tracking-tighter">LON</span>
                    <span className="text-white">{(data as any).dr_gps?.lon?.toFixed(6) || data.gps.lon.toFixed(6)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-grow rounded-lg overflow-hidden border border-gray-200 relative bg-gray-50">
            <TrainMap key={uiDataActive || isReplaying ? "active" : "inactive"} history={history} />
          </div>

          {isReplaying && (
            <div className="mt-4 p-4 bg-gray-900 rounded-xl shadow-2xl border border-white/10">
              <div className="flex items-center justify-between mb-3 text-white">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Replaying Session #{replaySession}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {[1, 2, 4].map(s => (
                      <button
                        key={s}
                        onClick={() => setReplaySpeed(s)}
                        className={`text-[10px] font-black px-2 py-0.5 rounded transition-all ${replaySpeed === s ? 'bg-amber-400 text-black scale-110' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                      >
                        {s}X
                      </button>
                    ))}
                  </div>
                  <button onClick={stopReplay} className="text-gray-400 hover:text-rose-500 transition-colors">
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={toggleReplayPause}
                  className="w-10 h-10 flex items-center justify-center bg-white text-black rounded-full hover:bg-amber-400 transition-all hover:scale-105"
                >
                  {isReplaying && !replayProgress ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </button>

                <div className="flex-grow">
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 shadow-[0_0_10px_#fbbf24] transition-all duration-300 ease-linear"
                      style={{ width: `${replayProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Progress</span>
                    <span className="text-[10px] font-bold text-amber-400">{replayProgress.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* ─── RECORDED SESSIONS (SIMPLE LIST) ─── */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Recorded Sessions</h3>
          <button
            onClick={fetchSessions}
            className="text-xs font-bold text-gray-600 hover:text-blue-600 transition-colors"
          >
            Refresh History
          </button>
        </div>

        <div className="space-y-3">
          {sessions.length === 0 ? (
            <div className="text-center py-6 text-gray-400 italic text-sm border-2 border-dashed border-gray-100 rounded-lg">
              No recorded sessions found
            </div>
          ) : (
            sessions.slice(0, 10).map((s) => (
              <div
                key={s.id}
                className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-between hover:bg-white hover:border-blue-200 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600 text-white w-10 h-10 rounded-lg flex items-center justify-center font-bold">
                    #{s.id}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {new Date(s.start_time * 1000).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                      {s.data_source} • {s.total_distance?.toFixed(2) || 0}m Traveled
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startReplay(s.id)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-md hover:bg-blue-100 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" /> REPLAY
                  </button>
                  <button
                    onClick={() => handleDownloadReport(s.id)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" /> PDF
                  </button>
                  <button
                    onClick={() => window.open(`${import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000"}/sessions/${s.id}/export/csv`, '_blank')}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-md hover:bg-emerald-100 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> CSV
                  </button>
                  <button
                    onClick={() => handleDeleteSession(s.id)}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-md hover:bg-rose-100 transition-colors ml-2"
                    title="Delete Session"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> DELETE
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const StatusCard = ({ title, value, icon, trend, trendColor }: any) => (
  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
    <div className="flex justify-between items-start mb-4">
      <div className="bg-gray-50 p-2 rounded-lg">{icon}</div>
    </div>
    <h4 className="text-sm font-medium text-gray-600 uppercase tracking-wider">{title}</h4>
    <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    <p className={`text-xs mt-2 font-medium ${trendColor}`}>{trend}</p>
  </div>
);

const SummaryItem = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
    <span className="text-gray-600">{label}</span>
    <span className="font-bold text-gray-900">{value}</span>
  </div>
);
