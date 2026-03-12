import React, { createContext, useContext, useState, useEffect } from 'react';
import { useConnection } from './ConnectionContext';

interface GeometryData {
  chainage: number[];
  gauge: number[];
  alignment: number[];
  unevenness: number[];
  twist: number[];
  crossLevel: number[];
  timestamps: Date[];
}

interface DataContextType {
  geometryData: GeometryData;
  isConnected: boolean;
  currentChainage: number;
  updateData: (newData: Partial<GeometryData>) => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connected, uiDataActive } = useConnection();

  const [geometryData, setGeometryData] = useState<GeometryData>({
    chainage: [],
    gauge: [],
    alignment: [],
    unevenness: [],
    twist: [],
    crossLevel: [],
    timestamps: []
  });

  const [currentChainage, setCurrentChainage] = useState(183.75);

  // Simulate real-time data updates ONLY IF CONNECTED & UI ACTIVE
  useEffect(() => {
    if (!connected || !uiDataActive) return;

    const interval = setInterval(() => {
      const newChainage = currentChainage + 0.25; // 25cm intervals
      setCurrentChainage(newChainage);

      // Generate realistic track geometry data
      const newDataPoint = {
        chainage: newChainage,
        gauge: 1435 + (Math.random() - 0.5) * 6, // ±3mm variation
        alignment: (Math.random() - 0.5) * 20, // ±10mm variation
        unevenness: Math.abs(Math.random() * 15), // 0-15mm
        twist: (Math.random() - 0.5) * 12, // ±6mm variation
        crossLevel: (Math.random() - 0.5) * 16, // ±8mm variation
        timestamp: new Date()
      };

      setGeometryData(prev => ({
        chainage: [...prev.chainage.slice(-999), newDataPoint.chainage],
        gauge: [...prev.gauge.slice(-999), newDataPoint.gauge],
        alignment: [...prev.alignment.slice(-999), newDataPoint.alignment],
        unevenness: [...prev.unevenness.slice(-999), newDataPoint.unevenness],
        twist: [...prev.twist.slice(-999), newDataPoint.twist],
        crossLevel: [...prev.crossLevel.slice(-999), newDataPoint.crossLevel],
        timestamps: [...prev.timestamps.slice(-999), newDataPoint.timestamp]
      }));
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [currentChainage, connected, uiDataActive]);

  const updateData = (newData: Partial<GeometryData>) => {
    setGeometryData(prev => ({ ...prev, ...newData }));
  };

  return (
    <DataContext.Provider value={{
      geometryData,
      isConnected: connected,
      currentChainage,
      updateData
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
