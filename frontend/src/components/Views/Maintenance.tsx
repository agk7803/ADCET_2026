import React from 'react';
import { Calendar, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

export const Maintenance: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Maintenance Schedule</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-medium text-red-900">Urgent</span>
            </div>
            <div className="text-2xl font-bold text-red-600">2</div>
            <div className="text-sm text-red-700">Items requiring immediate attention</div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <span className="font-medium text-yellow-900">Scheduled</span>
            </div>
            <div className="text-2xl font-bold text-yellow-600">5</div>
            <div className="text-sm text-yellow-700">Upcoming maintenance tasks</div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-900">Completed</span>
            </div>
            <div className="text-2xl font-bold text-green-600">12</div>
            <div className="text-sm text-green-700">Tasks completed this month</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Maintenance Tasks</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
            <div>
              <h4 className="font-medium text-red-900">Track Alignment Correction</h4>
              <p className="text-sm text-red-700">Chainage: 183.75m - Deviation: 12.3mm</p>
            </div>
            <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full">
              Urgent
            </span>
          </div>

          <div className="flex items-center justify-between p-4 border border-yellow-200 rounded-lg bg-yellow-50">
            <div>
              <h4 className="font-medium text-yellow-900">Ballast Tamping</h4>
              <p className="text-sm text-yellow-700">Section: 150m - 200m</p>
            </div>
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
              Scheduled
            </span>
          </div>

          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div>
              <h4 className="font-medium text-gray-900">Fastening Replacement</h4>
              <p className="text-sm text-gray-600">Curve sections: 300m - 450m</p>
            </div>
            <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm font-medium rounded-full">
              Planned
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};