import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react';

export const AlertsPanel: React.FC = () => {
  const alerts = [
    {
      id: 1,
      type: 'critical',
      title: 'Gauge Deviation Detected',
      location: 'Chainage 142.85 km',
      value: '+12.3mm',
      time: '2 min ago',
      status: 'active'
    },
    {
      id: 2,
      type: 'warning',
      title: 'Ballast Settlement',
      location: 'Chainage 142.45 km',
      value: '8.7mm',
      time: '5 min ago',
      status: 'acknowledged'
    },
    {
      id: 3,
      type: 'info',
      title: 'Speed Limit Change',
      location: 'Chainage 143.00 km',
      value: '120 → 80 km/h',
      time: '12 min ago',
      status: 'resolved'
    }
  ];

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'critical':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default:
        return <CheckCircle className="w-5 h-5 text-blue-500" />;
    }
  };

  const getAlertBorder = (type: string) => {
    switch (type) {
      case 'critical':
        return 'border-l-red-500';
      case 'warning':
        return 'border-l-amber-500';
      default:
        return 'border-l-blue-500';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Safety Alerts</h3>
              <p className="text-sm text-slate-600">Active monitoring status</p>
            </div>
          </div>
          <div className="flex space-x-2">
            <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-medium">
              1 Critical
            </span>
            <span className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-medium">
              1 Warning
            </span>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`border-l-4 ${getAlertBorder(alert.type)} bg-slate-50 rounded-r-lg p-4`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-3">
                  {getAlertIcon(alert.type)}
                  <div>
                    <h4 className="font-semibold text-slate-900">{alert.title}</h4>
                    <p className="text-sm text-slate-600">{alert.location}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-900">{alert.value}</div>
                  <div className="flex items-center text-xs text-slate-500">
                    <Clock className="w-3 h-3 mr-1" />
                    {alert.time}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  alert.status === 'active' ? 'bg-red-100 text-red-800' :
                  alert.status === 'acknowledged' ? 'bg-amber-100 text-amber-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {alert.status.toUpperCase()}
                </span>
                
                {alert.status === 'active' && (
                  <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="font-medium text-green-800">System Health</span>
              </div>
              <div className="text-green-700 font-semibold">98.7% Uptime</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="font-medium text-blue-800">Last Inspection</span>
              </div>
              <div className="text-blue-700 font-semibold">2 hours ago</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};