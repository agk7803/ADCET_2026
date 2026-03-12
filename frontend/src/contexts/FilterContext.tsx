import React, { createContext, useContext, useState } from 'react';

interface FilterState {
  chainageStart: string;
  chainageEnd: string;
  dateStart: string;
  dateEnd: string;
  location: string;
  preset: string;
  gaugeTolerance: string;
  alignmentTolerance: string;
}

interface FilterContextType {
  filters: FilterState;
  updateFilter: (key: keyof FilterState, value: string) => void;
  applyFilters: () => void;
  resetFilters: () => void;
}

const defaultFilters: FilterState = {
  chainageStart: '100',
  chainageEnd: '1000',
  dateStart: '',
  dateEnd: '',
  location: '',
  preset: '',
  gaugeTolerance: '3',
  alignmentTolerance: '10'
};

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const updateFilter = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    // Apply filter logic here
    console.log('Applying filters:', filters);
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
  };

  return (
    <FilterContext.Provider value={{
      filters,
      updateFilter,
      applyFilters,
      resetFilters
    }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilter = () => {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error('useFilter must be used within a FilterProvider');
  }
  return context;
};