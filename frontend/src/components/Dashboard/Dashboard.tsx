import React from 'react';
import { GeometryPanel } from './GeometryPanel';
import { RailConditionPanel } from './RailConditionPanel';
import { VideoPanel } from './VideoPanel';
import { AlertsPanel } from './AlertsPanel';
import { DynamicParametersPanel } from './DynamicParametersPanel';
import { TrackMapPanel } from './TrackMapPanel';

export const Dashboard: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Top Row - Key Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GeometryPanel />
        <DynamicParametersPanel />
        <AlertsPanel />
      </div>

      {/* Middle Row - Video and Rail Condition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VideoPanel />
        <RailConditionPanel />
      </div>

      {/* Bottom Row - Track Mapping */}
      <div className="grid grid-cols-1 gap-6">
        <TrackMapPanel />
      </div>
    </div>
  );
};