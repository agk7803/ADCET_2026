import React, { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TelemetryPoint } from '../../contexts/ConnectionContext';

// ── Fix default Leaflet marker icons (webpack/vite strips the URLs) ──
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// ── Helper: smoothly pan the map to follow the train ──
function MapFollower({ position }: { position: L.LatLngExpression }) {
    const map = useMap();
    useEffect(() => {
        if (position) {
            map.panTo(position, { animate: true, duration: 0.5 });
        }
    }, [position, map]);
    return null;
}

// ── Inner map content (rendered INSIDE MapContainer) ──
// This component receives new data and updates Polyline/Marker without
// ever unmounting the parent MapContainer.
function MapContent({ validPoints }: { validPoints: [number, number][] }) {
    if (validPoints.length === 0) return null;

    const latest = validPoints[validPoints.length - 1];

    return (
        <>
            <MapFollower position={latest} />
            <Polyline positions={validPoints} pathOptions={{ color: '#ef4444', weight: 4, opacity: 0.85 }} />
            <Marker position={latest} />
        </>
    );
}

// ── Public component ──
interface TrainMapProps {
    history: TelemetryPoint[];
}

function TrainMapInner({ history }: TrainMapProps) {
    // Extract valid coordinates — prefer dead-reckoned (dr_gps) over raw GPS
    const validPoints = useMemo<[number, number][]>(() => {
        return history
            .filter((pt) => {
                const g = (pt as any).dr_gps || pt?.gps;
                return g && typeof g.lat === 'number' && typeof g.lon === 'number' && g.lat !== 0 && g.lon !== 0;
            })
            .map((pt) => {
                const g = (pt as any).dr_gps || pt.gps;
                return [g.lat, g.lon] as [number, number];
            });
    }, [history]);

    // Track whether the MapContainer has been mounted once
    const mapReady = useRef(false);

    // Default center (Mumbai area) as fallback
    const initialCenter = useRef<[number, number]>(
        validPoints.length > 0 ? validPoints[validPoints.length - 1] : [19.076, 72.877]
    );

    // Update initial center the FIRST time we get valid data
    useEffect(() => {
        if (!mapReady.current && validPoints.length > 0) {
            initialCenter.current = validPoints[validPoints.length - 1];
            mapReady.current = true;
        }
    }, [validPoints]);

    // Show placeholder if no GPS data at all
    if (validPoints.length === 0) {
        return (
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#9ca3af',
                    backgroundColor: '#f9fafb',
                }}
            >
                <svg
                    style={{ width: 32, height: 32, marginBottom: 8, opacity: 0.5 }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                </svg>
                <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Waiting for GPS Fix...
                </p>
            </div>
        );
    }

    return (
        <MapContainer
            center={initialCenter.current}
            zoom={16}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapContent validPoints={validPoints} />
        </MapContainer>
    );
}

// Wrap with React.memo — only re-render when history length changes
export const TrainMap = React.memo(TrainMapInner, (prev, next) => {
    return prev.history.length === next.history.length;
});
