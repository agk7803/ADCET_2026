// src/components/Streams/WSCanvasStreamFace.tsx
import React, { useEffect, useRef, useState } from "react";

type Box = { x: number; y: number; w: number; h: number };
type Payload = { image: string; boxes?: Box[] };

interface Props {
  wsUrl?: string;             // e.g. ws://127.0.0.1:8000/ws_face
  mjpegFallbackUrl?: string;  // e.g. http://127.0.0.1:8000/video_feed_face
  width?: number;
  height?: number;
  showFallback?: boolean;     // show MJPEG fallback link if WS fails
  className?: string;
  style?: React.CSSProperties;
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const DEFAULT_WS_URL = API_BASE.replace(/^http/, "ws") + "/ws_face";
const DEFAULT_MJPEG_URL = API_BASE + "/video_feed_face";

const WSCanvasStreamFace: React.FC<Props> = ({
  wsUrl = DEFAULT_WS_URL,
  mjpegFallbackUrl = DEFAULT_MJPEG_URL,
  width = 640,
  height = 480,
  showFallback = true,
  className,
  style,
}) => {
  const [cameraOn, setCameraOn] = useState(false);

  const startCamera = async () => {
    try {
      await fetch(`${API_BASE}/camera/start`, { method: "POST" });
      setCameraOn(true);
      console.log("Camera start requested");
    } catch (e) {
      console.error("Failed to start camera", e);
    }
  };

  const stopCamera = async () => {
    try {
      await fetch(`${API_BASE}/camera/stop`, { method: "POST" });
      setCameraOn(false);
      console.log("Camera stop requested");
    } catch (e) {
      console.error("Failed to stop camera", e);
    }
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<number | null>(null);
  const lastPayloadRef = useRef<Payload | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    imgRef.current = img;
    let mounted = true;

    function draw(payload: Payload) {
      if (!mounted) return;
      const { image, boxes = [] } = payload;

      img.onload = () => {
        // match canvas size to image size
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        // draw detection boxes
        ctx.lineWidth = 3;
        ctx.strokeStyle = "lime";
        ctx.font = "18px Arial";
        ctx.fillStyle = "lime";

        boxes.forEach((b, i) => {
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.fillText(`face ${i + 1}`, Math.max(4, b.x), Math.max(18, b.y - 6));
        });
      };

      img.src = "data:image/jpeg;base64," + image;
    }

    // open websocket
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        // keep server loop alive
        pingRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 2000);
      };

      ws.onmessage = (ev) => {
        try {
          const payload: Payload = JSON.parse(ev.data);
          lastPayloadRef.current = payload;
          draw(payload);
        } catch (err) {
          console.error("WS parse error", err);
        }
      };

      ws.onerror = (e) => {
        console.warn("WS error", e);
      };

      ws.onclose = () => {
        console.info("WS closed");
      };
    } catch (err) {
      console.error("WS open failed", err);
    }

    // replay last frame if WS dies
    const replay = window.setInterval(() => {
      if (lastPayloadRef.current) draw(lastPayloadRef.current);
    }, 100); // 10 fps

    return () => {
      mounted = false;
      if (pingRef.current) window.clearInterval(pingRef.current);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
      window.clearInterval(replay);
    };
  }, [wsUrl]);

  return (
    <div className={className} style={{ maxWidth: "100%", ...style }}>
      {/* Camera controls */}
      <div style={{ marginBottom: 8, display: "flex", gap: 8 }}>
        <button
          onClick={startCamera}
          style={{
            padding: "6px 12px",
            backgroundColor: cameraOn ? "#16a34a" : "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Start Camera
        </button>
        <button
          onClick={stopCamera}
          style={{
            padding: "6px 12px",
            backgroundColor: "#dc2626",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Stop Camera
        </button>
      </div>

      {/* Canvas where frames are drawn */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: "100%", maxWidth: 900, borderRadius: 6, border: "1px solid #ddd" }}
      />

      {/* Fallback MJPEG link */}
      {showFallback && (
        <div style={{ marginTop: 8 }}>
          <small className="text-gray-500">If blank,gjhg open raw MJPEG:</small>{" "}
          <a href={mjpegFallbackUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            open raw stream
          </a>
        </div>
      )}
    </div>
  );
};

export default WSCanvasStreamFace;
