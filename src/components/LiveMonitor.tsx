import React, { useState, useMemo } from 'react';
import { Search, Filter, Camera, Eye, Sparkles, Navigation, Layers, ChevronRight, Video, Compass, RotateCw } from 'lucide-react';
import type { Camera as CameraType, Detection } from '../types';

interface LiveMonitorProps {
  cameras: CameraType[];
  onSelectCamera: (camera: CameraType) => void;
  onRunScan: (cameraId: number) => Promise<Detection[]>;
  onTrackSubject: (detection: Detection) => void;
  detections: Detection[];
  liveTimestamp: number;
}

const CORRIDORS = [
  'All Corridors',
  'Las Vegas Blvd (The Strip)',
  'I-15 Interstate',
  'Downtown / Fremont',
  'CC-215 / I-215 Beltway',
  'US-95 / I-515',
  'Airport / McCarran (Harry Reid)',
  'Flamingo Rd',
  'Sahara Ave',
  'Charleston Blvd',
  'Tropicana Ave'
];

export const LiveMonitor: React.FC<LiveMonitorProps> = ({
  cameras,
  onSelectCamera,
  onRunScan,
  onTrackSubject,
  detections,
  liveTimestamp
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCorridor, setSelectedCorridor] = useState('All Corridors');
  const [onlyMovingFilter, setOnlyMovingFilter] = useState<'all' | 'operator' | 'moving'>('all');
  const [scanningCamId, setScanningCamId] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(16);

  const filteredCameras = useMemo(() => {
    return cameras.filter((c) => {
      const matchCorridor =
        selectedCorridor === 'All Corridors' ||
        c.corridor.toLowerCase() === selectedCorridor.toLowerCase();

      const matchSearch =
        searchQuery === '' ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.corridor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toString().includes(searchQuery);

      const matchMoving =
        onlyMovingFilter === 'all' ||
        (onlyMovingFilter === 'operator' && c.ptzState?.status === 'operator_manual') ||
        (onlyMovingFilter === 'moving' && c.ptzState?.isMovingLive);

      return matchCorridor && matchSearch && matchMoving;
    });
  }, [cameras, selectedCorridor, searchQuery, onlyMovingFilter]);

  // Group detections by camera ID
  const detectionsByCamera = useMemo(() => {
    const map = new Map<number, Detection[]>();
    detections.forEach((d) => {
      const arr = map.get(d.cameraId) || [];
      arr.push(d);
      map.set(d.cameraId, arr);
    });
    return map;
  }, [detections]);

  const handleQuickScan = async (camId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setScanningCamId(camId);
    try {
      await onRunScan(camId);
    } finally {
      setScanningCamId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search 1,238 CCTV cameras by street, intersection, or ID (e.g. 'Bellagio', '101', 'Fremont')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 justify-between sm:justify-end">
            <span>
              Showing <strong className="text-white">{Math.min(visibleCount, filteredCameras.length)}</strong> of{' '}
              <strong className="text-white">{filteredCameras.length}</strong> cameras
            </span>
          </div>
        </div>

        {/* Corridor Pill Navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-thin">
          <span className="text-slate-400 font-medium mr-1 flex items-center gap-1 flex-shrink-0">
            <Filter className="w-3.5 h-3.5" />
            Corridor:
          </span>

          {/* Quick PTZ filter chip */}
          <button
            onClick={() => {
              setOnlyMovingFilter(onlyMovingFilter === 'operator' ? 'all' : 'operator');
              setVisibleCount(16);
            }}
            className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-colors flex items-center gap-1 flex-shrink-0 ${
              onlyMovingFilter === 'operator'
                ? 'bg-rose-600 text-white font-bold'
                : 'bg-rose-950/60 text-rose-300 hover:bg-rose-900/60 border border-rose-800/80'
            }`}
          >
            <Compass className="w-3 h-3 text-rose-400 animate-spin-slow" />
            <span>Operator Active Only</span>
          </button>

          {CORRIDORS.map((corridor) => (
            <button
              key={corridor}
              onClick={() => {
                setSelectedCorridor(corridor);
                setVisibleCount(16);
              }}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition-colors ${
                selectedCorridor === corridor
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
              }`}
            >
              {corridor}
            </button>
          ))}
        </div>
      </div>

      {/* Cameras Grid */}
      {filteredCameras.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
          <Camera className="w-12 h-12 mx-auto text-slate-600 mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No cameras match your search</h3>
          <p className="text-xs text-slate-400 mt-1">Try searching a different corridor or clearing filters</p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCorridor('All Corridors');
            }}
            className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredCameras.slice(0, visibleCount).map((cam) => {
            const camDets = detectionsByCamera.get(cam.id) || [];
            const isScanningThis = scanningCamId === cam.id;

            return (
              <div
                key={cam.id}
                onClick={() => onSelectCamera(cam)}
                className="bg-slate-900 border border-slate-800 hover:border-amber-500/70 rounded-xl overflow-hidden shadow-sm transition-all group flex flex-col cursor-pointer"
              >
                {/* Snapshot Thumbnail Container */}
                <div className="relative aspect-[4/3] bg-slate-950 overflow-hidden">
                  <img
                    src={`/api/camera-snapshot/${cam.id}?t=${liveTimestamp}`}
                    alt={cam.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />

                  {/* Gradient shade */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/30 pointer-events-none" />

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-[11px] pointer-events-none">
                    <span className="px-1.5 py-0.5 rounded bg-slate-950/90 text-red-400 font-mono text-[10px] border border-red-900/60 font-semibold">
                      #{cam.id}
                    </span>

                    <div className="flex items-center gap-1">
                      {cam.ptzState?.status === 'operator_manual' && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-950/95 text-rose-300 border border-rose-800 text-[10px] font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                          PTZ Slew
                        </span>
                      )}
                      {cam.ptzState?.status === 'programmed_tour' && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-800 text-[10px] flex items-center gap-0.5">
                          <RotateCw className="w-2.5 h-2.5 animate-spin-slow" />
                          Tour
                        </span>
                      )}
                      {cam.streamUrl && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800 text-[10px] flex items-center gap-0.5">
                          <Video className="w-2.5 h-2.5" />
                          HLS
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-400 border border-emerald-800/80 text-[10px] font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        LIVE
                      </span>
                    </div>
                  </div>

                  {/* Bottom overlay: Detections count or quick tag */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                    {camDets.length > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center gap-1 shadow">
                        <Sparkles className="w-3 h-3" />
                        {camDets.length} Detected
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono">
                        NV FAST CCTV
                      </span>
                    )}

                    <span className="text-[10px] text-slate-300 font-mono bg-black/60 px-1.5 py-0.5 rounded">
                      {new Date(liveTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Card Info Footer */}
                <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100 line-clamp-1 group-hover:text-amber-400 transition-colors">
                      {cam.name}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">
                      {cam.corridor}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/70 text-xs">
                    <button
                      onClick={(e) => handleQuickScan(cam.id, e)}
                      disabled={isScanningThis}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <Sparkles className={`w-3 h-3 text-amber-400 ${isScanningThis ? 'animate-spin' : ''}`} />
                      <span>{isScanningThis ? 'Scanning...' : 'AI Scan'}</span>
                    </button>

                    <span className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-0.5 text-xs">
                      <span>View</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load More Button */}
      {filteredCameras.length > visibleCount && (
        <div className="text-center pt-4">
          <button
            onClick={() => setVisibleCount((prev) => prev + 16)}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
          >
            Load More Cameras ({filteredCameras.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
};
