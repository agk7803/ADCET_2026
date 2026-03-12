import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

// Using 127.0.0.1 instead of localhost avoids DNS/IPv6 resolution issues on Windows
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";
console.log("[ConnectionContext] API_BASE:", API_BASE);
console.log("[ConnectionContext] WS_URL:", WS_URL);

export interface SensorData {
    accel: { x: number; y: number; z: number };
    gyro: { x: number; y: number; z: number };
    gps: { lat: number; lon: number };
    dr_gps?: { lat: number; lon: number };
    y: number;
    lidar_m: number;
    lidar?: { l1: number; l2: number; l3: number };
    classification?: { l1: string; l2: string; l3: string };
    geometry?: { gauge?: number; twist?: number; crosslevel?: number };
    timestamp: number;
}

export interface Alert {
    time: string;
    y: number;
    category: string;
    message: string;
}

export interface TelemetryPoint extends SensorData {
    timestamp: number;
    localTime: string;
    gaugePx: number;
}

interface ConnectionContextType {
    connected: boolean; // Sensor/WebSocket connected
    backendConnected: boolean; // API /health check ok
    sensorsRunning: boolean;// Backend reports sensors are running
    dataSource: string | null; // SIMULATOR, SERIAL, or WIFI
    systemOnline: boolean;
    systemLive: boolean;
    data: SensorData | null;
    history: TelemetryPoint[];
    latestGaugePx: number;
    alerts: Alert[];
    currentTime: string;
    sessionStartTime: number | null;
    setSessionStartTime: (val: number | null) => void;
    uiDataActive: boolean;
    viewFilters: Record<string, number>;
    setUiDataActive: (val: boolean) => void;
    clearHistory: () => void;
    clearView: (viewId: string) => void;
    sendCommand: (cmd: string, payload?: any) => void;

    // Replay System
    isReplaying: boolean;
    replaySession: number | null;
    replaySpeed: number;
    startReplay: (sessionId: number) => Promise<void>;
    stopReplay: () => void;
    toggleReplayPause: () => void;
    setReplaySpeed: (speed: number) => void;
    replayProgress: number; // 0 to 100
}

const ConnectionContext = createContext<ConnectionContextType | undefined>(undefined);

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [data, setData] = useState<SensorData | null>(null);
    const [history, setHistory] = useState<TelemetryPoint[]>([]);
    const [viewFilters, setViewFilters] = useState<Record<string, number>>({});

    // --- Replay State ---
    const [isReplaying, setIsReplaying] = useState(false);
    const [replayPaused, setReplayPaused] = useState(false);
    const [replaySession, setReplaySession] = useState<number | null>(null);
    const [replaySpeed, setReplaySpeedValue] = useState(1);
    const [replayBuffer, setReplayBuffer] = useState<TelemetryPoint[]>([]);
    const [replayIndex, setReplayIndex] = useState(0);
    const replayIndexRef = useRef(0);
    const replayTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [latestGaugePx, setLatestGaugePx] = useState(0);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [connected, setConnected] = useState(false);

    const [backendConnected, setBackendConnected] = useState(false);
    const [sensorsRunning, setSensorsRunning] = useState(false);
    const [dataSource, setDataSource] = useState<string | null>(null);
    const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
    const [uiDataActive, setUiDataActive] = useState(false);
    const uiDataActiveRef = useRef(uiDataActive);

    useEffect(() => {
        uiDataActiveRef.current = uiDataActive;
    }, [uiDataActive]);

    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

    const systemOnline = backendConnected;
    const systemLive = backendConnected && connected && sensorsRunning;

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ✅ WebSocket connect
    const connect = useCallback(() => {
        if (
            wsRef.current &&
            (wsRef.current.readyState === WebSocket.OPEN ||
                wsRef.current.readyState === WebSocket.CONNECTING)
        ) {
            return;
        }

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("[WS] Connected to", WS_URL);
            setConnected(true);
        };

        ws.onclose = (e) => {
            console.log("[WS] Disconnected. Code:", e.code, "Reason:", e.reason);
            setConnected(false);
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(connect, 3000);
        };

        ws.onerror = (e) => {
            console.error("WebSocket Error:", e);
            ws.close();
        };

        const lastUpdateRef = { current: 0 };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);

                // 🔥 GATE: Only process updates if UI is in "START" mode
                if (!uiDataActiveRef.current) return;

                if (msg.type === "update") {
                    const now = Date.now();
                    const localTimeStr = new Date().toLocaleTimeString();

                    // Throttle to 10Hz (100ms) for smoothness
                    if (now - lastUpdateRef.current > 100) {
                        const sensorData = msg.data;
                        setData(sensorData);
                        lastUpdateRef.current = now;

                        // APPEND TO GLOBAL HISTORY
                        const newPoint: TelemetryPoint = {
                            ...sensorData,
                            timestamp: now,
                            localTime: localTimeStr,
                            gaugePx: latestGaugePxRef.current // Use the latest polled gauge
                        };

                        setHistory(prev => {
                            const next = [...prev, newPoint];
                            return next.length > 50000 ? next.slice(-50000) : next;
                        });

                        // Optional: Console log periodically for debugging
                        if (Math.random() < 0.05) console.log("[WS] Received telemetry update:", msg.data);
                    }
                }

                if (msg.type === "alert") {
                    setAlerts((prev) => [...prev, msg.data].slice(-50));
                }

            } catch {
                // ignore bad JSON
            }
        };
    }, []);

    // ✅ Health check
    const checkHealth = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/health`);
            const healthData = await res.json();

            setBackendConnected(true);
            setSensorsRunning(healthData.sensors_running);
            setDataSource(healthData.data_source);

        } catch {
            setBackendConnected(false);
            setSensorsRunning(false);
            setDataSource(null);
            setData(null); // 🔥 clear stale data immediately
        }
    }, []);

    const latestGaugePxRef = useRef(0);
    useEffect(() => {
        if (!uiDataActive || !backendConnected) return;

        const interval = setInterval(async () => {
            try {
                const r = await fetch(`${API_BASE}/geometry/data`);
                const g = await r.json();
                const val = g.gauge_pixels || 0;
                setLatestGaugePx(val);
                latestGaugePxRef.current = val;
            } catch (e) {
                console.warn("[ConnectionContext] Gauge poll failed");
            }
        }, 200); // 5Hz polling for gauge is usually enough

        return () => clearInterval(interval);
    }, [uiDataActive, backendConnected]);

    const clearHistory = useCallback(() => {
        setHistory([]);
        setViewFilters({}); // Reset all view filters too
    }, []);

    const clearView = useCallback((viewId: string) => {
        setViewFilters(prev => ({
            ...prev,
            [viewId]: Date.now()
        }));
    }, []);

    useEffect(() => {
        connect();
        checkHealth();

        const healthInterval = setInterval(checkHealth, 3000);
        const clockInterval = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString());
        }, 1000);

        return () => {
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            wsRef.current?.close();
            clearInterval(healthInterval);
            clearInterval(clockInterval);
        };
    }, [connect, checkHealth]);

    // Diagnostic effect to track global connection state changes 
    // and verify safety gating conditions in the console.
    useEffect(() => {
        console.log("=== CONNECTION DEBUG SNAPSHOT ===");
        console.log("1. backendConnected (API reachable):", backendConnected);
        console.log("2. wsConnected (WS socket open):", connected);
        console.log("3. sensorsRunning (Backend process live):", sensorsRunning);
        console.log("---");
        console.log("4. systemLive (Calculated Green Light):", systemLive);
        console.log("5. dataExistence (Received data points):", !!data);
        console.log("==================================");
    }, [backendConnected, connected, sensorsRunning, systemLive, data]);

    const sendCommand = useCallback((cmd: string, payload?: any) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ cmd, ...payload }));
        }
    }, []);

    // --- Replay Logic ---
    const startReplay = useCallback(async (sessionId: number) => {
        setIsReplaying(true);
        setReplayPaused(false);
        setReplaySession(sessionId);
        setReplayIndex(0);
        replayIndexRef.current = 0;
        setUiDataActive(false); // Stop live UI updates
        clearHistory();

        try {
            const resp = await fetch(`${API_BASE}/sessions/${sessionId}/telemetry`);
            const json = await resp.json();
            const telemetry: any[] = json.telemetry || [];

            const formatted: TelemetryPoint[] = telemetry.map(t => ({
                accel: { x: t.ax || 0, y: t.ay || 0, z: t.az || 0 },
                gyro: { x: t.gx || 0, y: t.gy || 0, z: t.gz || 0 },
                gps: { lat: t.gps_lat, lon: t.gps_lon },
                dr_gps: { lat: t.dr_lat, lon: t.dr_lon },
                y: t.robot_y,
                lidar_m: t.lidar3, // Default to top
                lidar: { l1: t.lidar1, l2: t.lidar2, l3: t.lidar3 },
                geometry: {
                    gauge: t.gauge || 1676,
                    twist: t.twist || 0,
                    crosslevel: t.crosslevel || 0
                },
                timestamp: t.timestamp * 1000,
                localTime: new Date(t.timestamp * 1000).toLocaleTimeString(),
                gaugePx: latestGaugePxRef.current
            }));

            // Downsample to max 400 points for smooth graph rendering
            const MAX_REPLAY_POINTS = 400;
            if (formatted.length > MAX_REPLAY_POINTS) {
                const step = formatted.length / MAX_REPLAY_POINTS;
                const downsampled: TelemetryPoint[] = [];
                for (let i = 0; i < MAX_REPLAY_POINTS; i++) {
                    downsampled.push(formatted[Math.floor(i * step)]);
                }
                // Always include the very last point
                downsampled[downsampled.length - 1] = formatted[formatted.length - 1];
                setReplayBuffer(downsampled);
            } else {
                setReplayBuffer(formatted);
            }
        } catch (err) {
            console.error("Replay fetch failed:", err);
            setIsReplaying(false);
        }
    }, [clearHistory]);

    const stopReplay = useCallback(() => {
        setIsReplaying(false);
        setReplayPaused(false);
        setReplaySession(null);
        setReplayBuffer([]);
        setReplayIndex(0);
        replayIndexRef.current = 0;
        setData(null);
        setHistory([]);
    }, []);

    const toggleReplayPause = useCallback(() => {
        setReplayPaused(prev => !prev);
    }, []);

    const setReplaySpeed = useCallback((speed: number) => {
        setReplaySpeedValue(speed);
    }, []);

    // Replay Loop Effect
    useEffect(() => {
        if (!isReplaying || replayPaused || replayBuffer.length === 0) {
            if (replayTimerRef.current) clearInterval(replayTimerRef.current);
            return;
        }

        const intervalMs = 100 / replaySpeed; // Base 10Hz playback

        const tick = () => {
            if (replayIndexRef.current >= replayBuffer.length) {
                if (replayTimerRef.current) clearInterval(replayTimerRef.current);
                // Wait 1s and then exit fully
                setTimeout(stopReplay, 1000);
                return;
            }

            const point = replayBuffer[replayIndexRef.current];
            setData(point);
            setHistory(prev => {
                const next = [...prev, point];
                return next.length > 50000 ? next.slice(-50000) : next;
            });

            replayIndexRef.current += 1;
            setReplayIndex(replayIndexRef.current);
        };

        const timer = setInterval(tick, intervalMs);
        replayTimerRef.current = timer;

        return () => clearInterval(timer);
    }, [isReplaying, replayPaused, replayBuffer, replaySpeed]);

    const replayProgress = replayBuffer.length > 0
        ? (replayIndex / replayBuffer.length) * 100
        : 0;

    return (
        <ConnectionContext.Provider
            value={{
                connected,
                backendConnected,
                sensorsRunning,
                dataSource,
                systemOnline,
                systemLive,
                data,
                history,
                latestGaugePx,
                alerts,
                currentTime,
                sessionStartTime,
                setSessionStartTime,
                uiDataActive,
                viewFilters,
                setUiDataActive,
                clearHistory,
                clearView,
                sendCommand,
                isReplaying,
                replaySession,
                replaySpeed,
                startReplay,
                stopReplay,
                toggleReplayPause,
                setReplaySpeed,
                replayProgress
            }}
        >
            {children}
        </ConnectionContext.Provider>
    );
};

export const useConnection = () => {
    const context = useContext(ConnectionContext);
    if (context === undefined) {
        throw new Error('useConnection must be used within a ConnectionProvider');
    }
    return context;
};
