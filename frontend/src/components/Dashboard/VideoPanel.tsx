import React, { useState } from 'react';
import { Play, Pause, SkipForward, SkipBack, Camera, Maximize2 } from 'lucide-react';

export const VideoPanel: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(142.75);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Camera className="w-6 h-6 text-purple-600" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Video Playback</h3>
              <p className="text-sm text-slate-600">Synchronized rear-view recording</p>
            </div>
          </div>
          <button className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <Maximize2 className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>
      
      <div className="p-6">
        {/* Video Display Area */}
        <div className="bg-slate-900 rounded-lg aspect-video mb-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900">
            {/* Simulated track view */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full h-full relative">
                {/* Rails */}
                <div className="absolute bottom-1/3 left-1/4 w-1/2 h-2 bg-gray-600 rounded-full"></div>
                <div className="absolute bottom-1/3 left-1/4 w-1/2 h-0.5 bg-gray-400 rounded-full transform -translate-y-8"></div>
                
                {/* Sleepers */}
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute bottom-1/3 bg-amber-800 h-1 w-16 rounded"
                    style={{
                      left: `${30 + i * 8}%`,
                      transform: 'translateY(-4px)'
                    }}
                  />
                ))}
                
                {/* Ballast texture */}
                <div className="absolute bottom-0 left-0 w-full h-1/2 opacity-30">
                  {Array.from({ length: 50 }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-1 h-1 bg-gray-500 rounded-full"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* Video Controls Overlay */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-black bg-opacity-50 rounded-lg p-3">
              <div className="flex items-center justify-between text-white text-sm mb-2">
                <span>Chainage: {currentTime.toFixed(2)} km</span>
                <span>Speed: 85 km/h</span>
                <span>12:34:56</span>
              </div>
              
              <div className="flex items-center space-x-4">
                <button className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors">
                  <SkipBack className="w-4 h-4" />
                </button>
                
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-3 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full transition-colors"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                
                <button className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors">
                  <SkipForward className="w-4 h-4" />
                </button>
                
                <div className="flex-1 mx-4">
                  <input
                    type="range"
                    min="140"
                    max="145"
                    step="0.01"
                    value={currentTime}
                    onChange={(e) => setCurrentTime(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white bg-opacity-20 rounded-lg appearance-none slider"
                  />
                </div>
                
                <span className="text-xs">142.75 / 145.00 km</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sync Information */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="font-semibold text-slate-900">GPS Sync</div>
            <div className="text-green-600">✓ Locked</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="font-semibold text-slate-900">Data Correlation</div>
            <div className="text-green-600">✓ Active</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="font-semibold text-slate-900">Recording</div>
            <div className="text-red-600">● Live</div>
          </div>
        </div>
      </div>
    </div>
  );
};