import React, { useState } from 'react';
import { Map, ZoomIn, ZoomOut, Filter, Download } from 'lucide-react';

export const TrackMapPanel: React.FC = () => {
  const [selectedParameter, setSelectedParameter] = useState('gauge');
  const [zoomLevel, setZoomLevel] = useState(1);

  const parameters = [
    { id: 'gauge', name: 'Gauge', color: '#3B82F6' },
    { id: 'alignment', name: 'Alignment', color: '#10B981' },
    { id: 'crosslevel', name: 'Cross Level', color: '#F59E0B' },
    { id: 'twist', name: 'Twist', color: '#8B5CF6' },
    { id: 'unevenness', name: 'Unevenness', color: '#EF4444' }
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Map className="w-6 h-6 text-indigo-600" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Track Mapping</h3>
              <p className="text-sm text-slate-600">Interactive geometry visualization by chainage</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-slate-600">Parameter:</label>
              <select
                value={selectedParameter}
                onChange={(e) => setSelectedParameter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {parameters.map(param => (
                  <option key={param.id} value={param.id}>{param.name}</option>
                ))}
              </select>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.25))}
                className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
            </div>
            
            <button className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        {/* Map Visualization */}
        <div className="h-96 bg-slate-900 rounded-lg relative overflow-hidden mb-6">
          <div className="absolute inset-0 p-4">
            {/* Chainage ruler */}
            <div className="absolute top-4 left-4 right-4 h-8 bg-slate-800 rounded flex items-center justify-between px-4 text-white text-sm">
              <span>140.00 km</span>
              <span>141.00 km</span>
              <span>142.00 km</span>
              <span>143.00 km</span>
              <span>144.00 km</span>
              <span>145.00 km</span>
            </div>
            
            {/* Track visualization */}
            <div className="mt-16 h-64 relative">
              {/* Main track line */}
              <div className="absolute top-1/2 left-0 right-0 h-2 bg-slate-600 rounded-full transform -translate-y-1/2" />
              
              {/* Parameter visualization overlay */}
              <svg className="absolute inset-0 w-full h-full">
                {/* Simulated parameter data visualization */}
                <defs>
                  <linearGradient id="parameterGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="30%" stopColor="#F59E0B" />
                    <stop offset="60%" stopColor="#EF4444" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                </defs>
                
                <rect x="0" y="45%" width="100%" height="10%" fill="url(#parameterGradient)" opacity="0.7" />
                
                {/* Data points */}
                {Array.from({ length: 20 }).map((_, i) => (
                  <circle
                    key={i}
                    cx={`${5 + i * 4.5}%`}
                    cy={`${45 + Math.sin(i * 0.5) * 5}%`}
                    r="3"
                    fill={parameters.find(p => p.id === selectedParameter)?.color || '#3B82F6'}
                    opacity="0.8"
                  />
                ))}
              </svg>
              
              {/* Current position indicator */}
              <div className="absolute top-0 bottom-0 w-1 bg-amber-400 shadow-lg" style={{ left: '57%' }}>
                <div className="absolute -top-8 -left-16 bg-amber-400 text-slate-900 px-2 py-1 rounded text-xs font-semibold">
                  142.75 km
                </div>
              </div>
            </div>
            
            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-slate-800 rounded-lg p-3">
              <div className="text-white text-sm font-medium mb-2">Legend</div>
              <div className="flex items-center space-x-4 text-xs text-slate-300">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-400 rounded-full" />
                  <span>Normal</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-amber-400 rounded-full" />
                  <span>Warning</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-400 rounded-full" />
                  <span>Critical</span>
                </div>
              </div>
            </div>
            
            {/* Zoom indicator */}
            <div className="absolute bottom-4 right-4 bg-slate-800 rounded-lg p-2 text-white text-xs">
              Zoom: {Math.round(zoomLevel * 100)}%
            </div>
          </div>
        </div>

        {/* Statistics Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h4 className="text-lg font-semibold text-slate-900 mb-4">Current Section Summary</h4>
            <div className="space-y-3">
              {parameters.map((param) => (
                <div key={param.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: param.color }} />
                    <span className="font-medium text-slate-700">{param.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-slate-900">
                      {param.id === 'gauge' && '1435.2 mm'}
                      {param.id === 'alignment' && '2.1 mm'}
                      {param.id === 'crosslevel' && '1.8 mm'}
                      {param.id === 'twist' && '3.4 mm'}
                      {param.id === 'unevenness' && '4.2 mm'}
                    </div>
                    <div className="text-xs text-slate-500">Average</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="text-lg font-semibold text-slate-900 mb-4">Quality Indices</h4>
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-700">Track Quality Index</span>
                  <span className="text-green-600 font-semibold">85.2</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div className="bg-green-400 h-2 rounded-full" style={{ width: '85.2%' }} />
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-700">Comfort Rating</span>
                  <span className="text-green-600 font-semibold">Good</span>
                </div>
                <div className="text-sm text-slate-600">Based on dynamic parameters</div>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-700">Maintenance Priority</span>
                  <span className="text-amber-600 font-semibold">Medium</span>
                </div>
                <div className="text-sm text-slate-600">Next inspection: 30 days</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};