import React from 'react';
import { Wrench, Activity, AlertTriangle } from 'lucide-react';

export const RailConditionPanel: React.FC = () => {
  const railComponents = [
    { name: 'Rail Surface', condition: 85, status: 'good', wear: '2.3mm' },
    { name: 'Fastenings', condition: 92, status: 'good', issues: 0 },
    { name: 'Ballast', condition: 78, status: 'warning', settlement: '5.2mm' },
    { name: 'Sleepers', condition: 95, status: 'good', cracked: 2 },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <Wrench className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Rail Condition</h3>
            <p className="text-sm text-slate-600">Component health monitoring</p>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Rail Profile Analysis</span>
            <span className="text-xs text-slate-500">Chainage 142.75 km</span>
          </div>
          <div className="h-32 bg-slate-900 rounded-lg relative overflow-hidden">
            {/* Simulated rail profile visualization */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="200" height="80" viewBox="0 0 200 80" className="text-amber-400">
                <path
                  d="M20 60 Q50 20 100 40 T180 50"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                />
                <path
                  d="M20 65 Q50 25 100 45 T180 55"
                  stroke="#94A3B8"
                  strokeWidth="2"
                  fill="none"
                />
              </svg>
            </div>
            <div className="absolute top-2 left-3 text-xs text-slate-400">
              Left Rail
            </div>
            <div className="absolute bottom-2 left-3 text-xs text-slate-400">
              Right Rail
            </div>
            <div className="absolute top-2 right-3 text-xs text-amber-400 font-semibold">
              Wear: 2.3mm
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {railComponents.map((component, index) => (
            <div key={index} className="border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    component.status === 'good' ? 'bg-green-400' :
                    component.status === 'warning' ? 'bg-amber-400' : 'bg-red-400'
                  }`} />
                  <span className="font-medium text-slate-700">{component.name}</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{component.condition}%</span>
              </div>
              
              <div className="w-full bg-slate-200 rounded-full h-2 mb-3">
                <div
                  className={`h-2 rounded-full ${
                    component.condition >= 90 ? 'bg-green-400' :
                    component.condition >= 70 ? 'bg-amber-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${component.condition}%` }}
                />
              </div>
              
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>
                  {component.wear && `Wear: ${component.wear}`}
                  {component.settlement && `Settlement: ${component.settlement}`}
                  {component.issues !== undefined && `Issues: ${component.issues}`}
                  {component.cracked !== undefined && `Cracked: ${component.cracked}`}
                </span>
                {component.status === 'warning' && (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};