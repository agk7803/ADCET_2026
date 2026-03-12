import React from 'react';
import SystemStatusBar from "../SystemStatusBar";
import OfflineBanner from "../OfflineBanner";


interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'track-geometry', label: 'Track Geometry' },
    { id: 'rail-condition', label: 'Rail Profile and Wear' },
    { id: 'condition-monitoring', label: 'Condition Monitoring' },
    { id: 'acceleration', label: 'Acceleration' },
    { id: 'infringement-measurements', label: 'Infringement Measurements' },
    // NEW: Rear window video tab
    { id: 'rear-window', label: 'Rear Window' },
    { id: 'maintenance', label: 'Maintenance' }

  ];

  return (
    <>
      <OfflineBanner />
      <SystemStatusBar />

      <nav className="bg-white border-b border-gray-200">
        <div className="px-6">
          <div className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>
    </>
  );
};