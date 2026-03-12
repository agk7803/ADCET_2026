import React, { useEffect, useRef } from 'react';
import { Activity, TrendingUp, Zap } from 'lucide-react';

export const DynamicParametersPanel: React.FC = () => {
  const verticalCanvasRef = useRef<HTMLCanvasElement>(null);
  const lateralCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const drawAcceleration = (canvas: HTMLCanvasElement | null, data: number[], color: string) => {
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const stepX = canvas.width / (data.length - 1);
      const midY = canvas.height / 2;
      
      data.forEach((value, index) => {
        const x = index * stepX;
        const y = midY - (value * 20); // Scale the acceleration values
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();

      // Draw zero line
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(canvas.width, midY);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // Simulated acceleration data
    const verticalData = Array.from({ length: 50 }, () => Math.sin(Date.now() / 1000 + Math.random()) * 2);
    const lateralData = Array.from({ length: 50 }, () => Math.cos(Date.now() / 800 + Math.random()) * 1.5);

    drawAcceleration(verticalCanvasRef.current, verticalData, '#10B981');
    drawAcceleration(lateralCanvasRef.current, lateralData, '#F59E0B');
  }, []);

  const parameters = [
    {
      name: 'Vertical Acceleration',
      value: '0.85 m/s²',
      peak: '2.1 m/s²',
      status: 'normal',
      limit: '±3.0 m/s²'
    },
    {
      name: 'Lateral Acceleration',
      value: '1.2 m/s²',
      peak: '1.8 m/s²',
      status: 'normal',
      limit: '±2.5 m/s²'
    },
    {
      name: 'Vehicle Speed',
      value: '85 km/h',
      peak: '92 km/h',
      status: 'normal',
      limit: '120 km/h'
    }
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <Activity className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Dynamic Parameters</h3>
            <p className="text-sm text-slate-600">Real-time acceleration monitoring</p>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className="space-y-6">
          {/* Vertical Acceleration */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">Vertical Acceleration</span>
              <span className="text-sm text-green-600 font-semibold">0.85 m/s²</span>
            </div>
            <div className="h-16 bg-slate-50 rounded-lg">
              <canvas ref={verticalCanvasRef} className="w-full h-full rounded-lg" />
            </div>
          </div>

          {/* Lateral Acceleration */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-slate-700">Lateral Acceleration</span>
              <span className="text-sm text-amber-600 font-semibold">1.2 m/s²</span>
            </div>
            <div className="h-16 bg-slate-50 rounded-lg">
              <canvas ref={lateralCanvasRef} className="w-full h-full rounded-lg" />
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="space-y-3">
            {parameters.map((param, index) => (
              <div key={index} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    param.status === 'normal' ? 'bg-green-400' :
                    param.status === 'warning' ? 'bg-amber-400' : 'bg-red-400'
                  }`} />
                  <span className="font-medium text-slate-700">{param.name}</span>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-900">{param.value}</div>
                  <div className="text-xs text-slate-500">Peak: {param.peak}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="text-center">
              <div className="text-slate-500">RMS Vertical</div>
              <div className="font-semibold text-slate-900">0.52 m/s²</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500">RMS Lateral</div>
              <div className="font-semibold text-slate-900">0.78 m/s²</div>
            </div>
            <div className="text-center">
              <div className="text-slate-500">Comfort Index</div>
              <div className="font-semibold text-green-600">Good</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};