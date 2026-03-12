import React from "react";

interface MJPEGProps {
  src: string;       // e.g. http://127.0.0.1:8000/video_feed_face
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
}

const MJPEGStream: React.FC<MJPEGProps> = ({
  src,
  width = 640,
  height = 480,
  className,
  style,
}) => {
  return (
    <div className={className} style={{ ...style }}>
      <img
        src={src}
        alt="MJPEG Stream"
        width={width}
        height={height}
        style={{
          width: "100%",
          maxWidth: "900px",
          borderRadius: "6px",
          border: "1px solid #ddd",
        }}
      />
      <div style={{ marginTop: 8 }}>
        <small className="text-gray-500">Raw camera MJPEG stream:</small>{" "}
        <a href={src} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
          open in browser
        </a>
      </div>
    </div>
  );
};

export default MJPEGStream;
