import { useState } from 'react';
import { Header } from './components/Layout/Header';
import { TabNavigation } from './components/Layout/TabNavigation';
import { Overview } from './components/Views/Overview';
import TrackGeometry from './components/Views/TrackGeometry';
import RailCondition from './components/Views/RailCondition';
import { Maintenance } from './components/Views/Maintenance';
import Acceleration from './components/Views/Acceleration';
import { DataProvider } from './contexts/DataContext';
import InfringementMeasurements from './components/Views/InfringementMeasurements';
import ConditionMonitoring from './components/Views/ConditionMonitoring';
import RearWindow from './components/Views/RearWindow';

function App() {
  const [activeTab, setActiveTab] = useState('overview');

  const renderActiveView = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview />;
      case 'track-geometry':
        return <TrackGeometry />;
      case 'rail-condition':
        return <RailCondition />;
      case 'maintenance':
        return <Maintenance />;
      case 'condition-monitoring':
        return <ConditionMonitoring />;
      case 'acceleration':
        return <Acceleration />;
      case 'infringement-measurements':
        return <InfringementMeasurements />;
      case 'rear-window':
        return <RearWindow />;
      default:
        return <Overview />;
    }
  };

  return (
    <DataProvider>
      <div className="min-h-screen bg-gray-50">
        <Header />
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="flex-1 transition-all duration-300 max-w-7xl mx-auto px-6 py-8">
          {renderActiveView()}
        </main>
      </div>
    </DataProvider>
  );
}

export default App;
