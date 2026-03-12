import React from 'react';
import { Filter, ChevronLeft, ChevronRight, Calendar, MapPin } from 'lucide-react';
import { useFilter } from '../../contexts/FilterContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const { filters, updateFilter, applyFilters } = useFilter();

  if (collapsed) {
    return (
      <div className="fixed left-0 top-32 z-30">
        <button
          onClick={onToggle}
          className="bg-white border border-gray-200 rounded-r-lg p-2 shadow-lg hover:bg-gray-50"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    );
  }

  return (
    <aside className="fixed left-0 top-32 h-full w-80 bg-white border-r border-gray-200 z-30 overflow-y-auto">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
          </div>
          <button
            onClick={onToggle}
            className="p-1 rounded hover:bg-gray-100"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Chainage Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Chainage Range (m)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                placeholder="100"
                value={filters.chainageStart}
                onChange={(e) => updateFilter('chainageStart', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="number"
                placeholder="1000"
                value={filters.chainageEnd}
                onChange={(e) => updateFilter('chainageEnd', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={applyFilters}
              className="w-full mt-3 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Apply Filter
            </button>
          </div>

          {/* Quick Presets */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Quick Presets
            </label>
            <div className="space-y-2">
              {['Last 1km', 'Last 5km', 'Last 10km', 'Full Track'].map((preset) => (
                <button
                  key={preset}
                  onClick={() => updateFilter('preset', preset)}
                  className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <Calendar className="w-4 h-4 inline mr-2" />
              Date Range
            </label>
            <div className="space-y-3">
              <input
                type="date"
                value={filters.dateStart}
                onChange={(e) => updateFilter('dateStart', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="date"
                value={filters.dateEnd}
                onChange={(e) => updateFilter('dateEnd', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              <MapPin className="w-4 h-4 inline mr-2" />
              Location
            </label>
            <select
              value={filters.location}
              onChange={(e) => updateFilter('location', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Locations</option>
              <option value="section-a">Section A</option>
              <option value="section-b">Section B</option>
              <option value="section-c">Section C</option>
            </select>
          </div>

          {/* Parameter Thresholds */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Parameter Thresholds
            </label>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Gauge Tolerance (mm)</label>
                <input
                  type="number"
                  placeholder="±3"
                  value={filters.gaugeTolerance}
                  onChange={(e) => updateFilter('gaugeTolerance', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Alignment Tolerance (mm)</label>
                <input
                  type="number"
                  placeholder="±10"
                  value={filters.alignmentTolerance}
                  onChange={(e) => updateFilter('alignmentTolerance', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};