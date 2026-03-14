import React from 'react';
import { Calendar, AlertTriangle, CheckCircle, Clock, FileText } from 'lucide-react';

export const Maintenance: React.FC = () => {
  const generateReport = () => {
    const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";
    window.open(`${API}/reports/latest`, "_blank");
  };

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Calendar className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Maintenance Schedule</h2>
          </div>
          <button
            onClick={generateReport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-semibold shadow-sm"
          >
            <FileText className="w-4 h-4" />
            Generate Report
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-medium text-red-900">Urgent</span>
            </div>
            <div className="text-2xl font-bold text-red-600">0</div>
            <div className="text-sm text-red-700">Items requiring immediate attention</div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <span className="font-medium text-yellow-900">Scheduled</span>
            </div>
            <div className="text-2xl font-bold text-yellow-600">0</div>
            <div className="text-sm text-yellow-700">Upcoming maintenance tasks</div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-900">Completed</span>
            </div>
            <div className="text-2xl font-bold text-green-600">0</div>
            <div className="text-sm text-green-700">Tasks completed recently</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Maintenance Logs</h3>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
           <FileText className="w-12 h-12 mb-2 opacity-20" />
           <p className="text-sm italic">No recent maintenance tasks logged.</p>
           <p className="text-[10px] uppercase tracking-widest mt-1 opacity-60">Generate a session report to view detected anomalies</p>
        </div>
      </div>
    </div>
  );
};