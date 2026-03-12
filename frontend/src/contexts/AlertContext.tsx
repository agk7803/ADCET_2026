import React, { createContext, useContext, useState, useEffect } from 'react';

interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  location: string;
  timestamp: Date;
  acknowledged: boolean;
}

interface AlertContextType {
  alerts: Alert[];
  acknowledgeAlert: (id: string) => void;
  addAlert: (alert: Omit<Alert, 'id' | 'timestamp'>) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: '1',
      type: 'critical',
      title: 'Gauge Deviation Detected',
      message: 'Track gauge exceeds tolerance limits',
      location: 'Chainage 142.85 km',
      timestamp: new Date(Date.now() - 2 * 60 * 1000),
      acknowledged: false
    },
    {
      id: '2',
      type: 'warning',
      title: 'Ballast Settlement',
      message: 'Moderate ballast settlement detected',
      location: 'Chainage 142.45 km',
      timestamp: new Date(Date.now() - 5 * 60 * 1000),
      acknowledged: true
    }
  ]);

  const acknowledgeAlert = (id: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === id ? { ...alert, acknowledged: true } : alert
    ));
  };

  const addAlert = (alertData: Omit<Alert, 'id' | 'timestamp'>) => {
    const newAlert: Alert = {
      ...alertData,
      id: Date.now().toString(),
      timestamp: new Date()
    };
    
    setAlerts(prev => [newAlert, ...prev]);
  };

  return (
    <AlertContext.Provider value={{ alerts, acknowledgeAlert, addAlert }}>
      {children}
    </AlertContext.Provider>
  );
};

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};