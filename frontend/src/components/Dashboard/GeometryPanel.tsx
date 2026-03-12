import React, { useEffect, useRef } from 'react';
import { Ruler, TrendingUp, AlertCircle } from 'lucide-react';
import { useData } from '../../contexts/DataContext';

export const GeometryPanel: React.FC = () => {
  const { geometryData } = useData();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw gauge variation graph
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const dataPoints = geometryData.gauge;
    const stepX = canvas.width / (dataPoints.length - 1);
    const midY = canvas.height / 2;
    
    dataPoints.forEach((value, index) => {
      const x = index * stepX;
      const y = midY + (value - 1435) * 10; // Normalize around standard gauge
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();

    // Draw reference line
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(canvas.width, midY);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [geometryData]);

  const parameters = [
    { name: 'Gauge', value: '1435.2 mm', status: 'good', tolerance: '±3mm' },
    { name: 'Alignment', value: '2.1 mm', status: 'warning', tolerance: '±10mm' },
    { name: 'Cross Level', value: '1.8 mm', status: 'good', tolerance: '±8mm' },
    { name: 'Twist', value: '3.4 mm', status: 'good', tolerance: '±6mm' },
    { name: 'Unevenness', value: '4.2 mm', status: 'warning', tolerance: '±12mm' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <Ruler className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Track Geometry</h3>
            <p className="text-sm text-slate-600">Real-time parameter monitoring</p>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Gauge Variation (25cm intervals)</span>
            <span className="text-xs text-slate-500">Last 100 readings</span>
          </div>
          <div className="h-24 bg-slate-50 rounded-lg relative">
            <canvas
              ref={canvasRef}
              className="w-full h-full rounded-lg"
            />
          </div>
        </div>

        <div className="space-y-3">
          {parameters.map((param, index) => (
            <div key={index} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${
                  param.status === 'good' ? 'bg-green-400' :
                  param.status === 'warning' ? 'bg-amber-400' : 'bg-red-400'
                }`} />
                <span className="font-medium text-slate-700">{param.name}</span>
              </div>
              <div className="text-right">
                <div className="font-semibold text-slate-900">{param.value}</div>
                <div className="text-xs text-slate-500">{param.tolerance}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};