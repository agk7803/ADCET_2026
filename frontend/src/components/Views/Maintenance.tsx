import React from 'react';
import { Calendar, AlertTriangle, CheckCircle, Clock, FileText } from 'lucide-react';

export const Maintenance: React.FC = () => {
  const [generating, setGenerating] = React.useState<string | null>(null);
  const [folders, setFolders] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);

  const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";

  const fetchFolders = React.useCallback(async () => {
    try {
      const res = await fetch(`${API}/reports/folders`);
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (e) {
      console.error("Failed to fetch folders", e);
    } finally {
      setLoading(false);
    }
  }, [API]);

  React.useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const generateReport = async (folderId: string = 'latest') => {
    setGenerating(folderId);
    try {
      const url = folderId === 'latest' 
        ? `${API}/reports/latest` 
        : `${API}/sessions/${folderId}/report`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.status === 'success') {
        alert(`Success: ${data.message}\nFolder opened in Finder: ${data.session_dir}`);
      } else {
        alert(`Error: ${data.detail || 'Failed to generate report'}`);
      }
      
      setGenerating(null);
    } catch (e) {
      console.error("Report generation failed", e);
      alert("System Error: Could not connect to backend for report generation.");
      setGenerating(null);
    }
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
            onClick={() => generateReport('latest')}
            disabled={generating !== null}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors font-semibold shadow-sm ${generating === 'latest' ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
          >
            {generating === 'latest' ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating Latest...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                Generate Latest AI Report
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-medium text-red-900">Urgent Anomalies</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{folders.length > 0 ? "Check Report" : "0"}</div>
            <div className="text-sm text-red-700">Items requiring immediate attention</div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Clock className="w-5 h-5 text-yellow-600" />
              <span className="font-medium text-yellow-900">Scheduled Inspections</span>
            </div>
            <div className="text-2xl font-bold text-yellow-600">{folders.length}</div>
            <div className="text-sm text-yellow-700">Total session folders found</div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="font-medium text-green-900">Reports Ready</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{folders.length}</div>
            <div className="text-sm text-green-700">Sessions available for AI analysis</div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Extracted Session History</h3>

        {loading ? (
          <div className="flex flex-col items-center py-12">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-500">Scanning ~/Desktop/report...</p>
          </div>
        ) : folders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Session ID</th>
                  <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {folders.map(folder => (
                  <tr key={folder} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="font-mono text-sm text-gray-700">{folder}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Extracted
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => generateReport(folder)}
                        disabled={generating !== null}
                        className={`text-sm font-semibold px-3 py-1 rounded transition-colors ${generating === folder ? "text-gray-400" : "text-blue-600 hover:text-blue-800 hover:bg-blue-50"}`}
                      >
                        {generating === folder ? "Generating..." : "Generate AI Report"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
            <FileText className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm italic">No extracted session folders found on Desktop.</p>
            <p className="text-[10px] uppercase tracking-widest mt-1 opacity-60">Use "Export Data" in Header to create session folders</p>
          </div>
        )}
      </div>
    </div>
  );
};