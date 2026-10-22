import React, { useState, useMemo } from 'react';
import { Search, Filter, Sparkles, Navigation, Clock, Tag, Car, User, Bike, SlidersHorizontal, Check, RefreshCw } from 'lucide-react';
import type { Detection, TargetCategory, VehicleSubtype, TargetColor, TargetHeight, TargetSize } from '../types';

interface AIScannerSearchProps {
  detections: Detection[];
  onTrackSubject: (detection: Detection) => void;
  onOpenCamera: (cameraId: number) => void;
  onTriggerCorridorScan: () => void;
  isScanning: boolean;
}

const COMMON_TAGS = [
  'moving_southbound',
  'moving_northbound',
  'strip_view',
  'crosswalk',
  'headlights_on',
  'commercial_freight',
  'heavy_traffic',
  'lane_splitting',
  'taxi_cab',
  'fremont_crowd',
  'high_vis_vest',
  'stopped'
];

export const AIScannerSearch: React.FC<AIScannerSearchProps> = ({
  detections,
  onTrackSubject,
  onOpenCamera,
  onTriggerCorridorScan,
  isScanning
}) => {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<TargetCategory>('all');
  const [vehicleType, setVehicleType] = useState<VehicleSubtype>('any');
  const [color, setColor] = useState<TargetColor>('any');
  const [height, setHeight] = useState<TargetHeight>('any');
  const [size, setSize] = useState<TargetSize>('any');
  const [cyclistOnly, setCyclistOnly] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCorridor, setSelectedCorridor] = useState('All');

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const filteredDetections = useMemo(() => {
    return detections.filter((d) => {
      // Keyword
      if (keyword) {
        const kw = keyword.toLowerCase();
        const matchKw =
          d.description.toLowerCase().includes(kw) ||
          d.cameraName.toLowerCase().includes(kw) ||
          d.subtype.toLowerCase().includes(kw) ||
          d.tags.some((t) => t.toLowerCase().includes(kw));
        if (!matchKw) return false;
      }

      // Category
      if (category !== 'all' && d.category !== category) return false;

      // Vehicle Subtype
      if (vehicleType !== 'any' && d.subtype.toLowerCase() !== vehicleType.toLowerCase()) return false;

      // Color
      if (color !== 'any') {
        const dColor = d.color.toLowerCase();
        if (color === 'silver_gray' && !dColor.includes('silver') && !dColor.includes('gray')) return false;
        else if (color !== 'silver_gray' && !dColor.includes(color)) return false;
      }

      // Height
      if (height !== 'any' && d.height !== height) return false;

      // Size
      if (size !== 'any' && d.size !== size) return false;

      // Cyclist
      if (cyclistOnly && !d.isCyclist) return false;

      // Corridor
      if (selectedCorridor !== 'All' && !d.corridor.toLowerCase().includes(selectedCorridor.toLowerCase())) return false;

      // Tags
      if (selectedTags.length > 0) {
        const hasAllTags = selectedTags.every((t) =>
          d.tags.some((dt) => dt.toLowerCase().includes(t.toLowerCase()))
        );
        if (!hasAllTags) return false;
      }

      return true;
    });
  }, [detections, keyword, category, vehicleType, color, height, size, cyclistOnly, selectedCorridor, selectedTags]);

  const resetFilters = () => {
    setKeyword('');
    setCategory('all');
    setVehicleType('any');
    setColor('any');
    setHeight('any');
    setSize('any');
    setCyclistOnly(false);
    setSelectedTags([]);
    setSelectedCorridor('All');
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter Header Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by keywords, tags, color, or description (e.g. 'red suv', 'cyclist yellow', 'freight semi')..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onTriggerCorridorScan}
              disabled={isScanning}
              className="px-3.5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-lg text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 flex-shrink-0"
            >
              <Sparkles className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning Las Vegas CCTV...' : 'Scan New Frames Now'}</span>
            </button>

            <button
              onClick={resetFilters}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Primary Classification Tabs: Vehicle / Person / Cyclist */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            onClick={() => {
              setCategory('all');
              setCyclistOnly(false);
            }}
            className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
              category === 'all' && !cyclistOnly
                ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-semibold'
                : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <div className="text-xs">
              <div className="font-bold">All Targets</div>
              <div className="text-[10px] text-slate-400">Everything detected</div>
            </div>
          </button>

          <button
            onClick={() => {
              setCategory('vehicle');
              setCyclistOnly(false);
            }}
            className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
              category === 'vehicle' && !cyclistOnly
                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-semibold'
                : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Car className="w-4 h-4 text-emerald-400" />
            <div className="text-xs">
              <div className="font-bold">Vehicle Search</div>
              <div className="text-[10px] text-slate-400">Cars, SUVs, Trucks, Buses</div>
            </div>
          </button>

          <button
            onClick={() => {
              setCategory('person');
              setCyclistOnly(false);
            }}
            className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
              category === 'person' && !cyclistOnly
                ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300 font-semibold'
                : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <User className="w-4 h-4 text-cyan-400" />
            <div className="text-xs">
              <div className="font-bold">Person / Pedestrian</div>
              <div className="text-[10px] text-slate-400">Individuals, Groups, Sidewalks</div>
            </div>
          </button>

          <button
            onClick={() => {
              setCategory('cyclist');
              setCyclistOnly(true);
            }}
            className={`p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-all ${
              category === 'cyclist' || cyclistOnly
                ? 'bg-yellow-500/15 border-yellow-500 text-yellow-300 font-semibold'
                : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Bike className="w-4 h-4 text-yellow-400" />
            <div className="text-xs">
              <div className="font-bold">Cyclist Search</div>
              <div className="text-[10px] text-slate-400">Bicycles, Motorcycles, Scooters</div>
            </div>
          </button>
        </div>

        {/* Detailed Attribute Dropdowns: Color, Height, Size, Vehicle Subtype */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800 text-xs">
          {/* Color filter */}
          <div>
            <label className="text-slate-400 font-medium block mb-1">Target Color</label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value as TargetColor)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 px-2 text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="any">Any Color</option>
              <option value="white">White</option>
              <option value="black">Black</option>
              <option value="silver_gray">Silver / Gray</option>
              <option value="red">Red</option>
              <option value="blue">Blue</option>
              <option value="yellow">Yellow</option>
              <option value="green">Green</option>
              <option value="orange">Orange</option>
              <option value="gold">Gold</option>
            </select>
          </div>

          {/* Height filter */}
          <div>
            <label className="text-slate-400 font-medium block mb-1">Height Profile</label>
            <select
              value={height}
              onChange={(e) => setHeight(e.target.value as TargetHeight)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 px-2 text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="any">Any Height</option>
              <option value="low">Low Profile (&lt; 1.5m)</option>
              <option value="standard">Standard (1.5m - 2.0m)</option>
              <option value="tall">Tall (2.0m - 3.5m)</option>
              <option value="very_tall">Very Tall (&gt; 3.5m Semi/Bus)</option>
            </select>
          </div>

          {/* Size filter */}
          <div>
            <label className="text-slate-400 font-medium block mb-1">Size Classification</label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value as TargetSize)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 px-2 text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="any">Any Size</option>
              <option value="pedestrian">Pedestrian / Human</option>
              <option value="compact">Compact (Bike / Mini)</option>
              <option value="standard">Standard (Sedan / SUV)</option>
              <option value="large">Large (Pickup / Van)</option>
              <option value="oversized">Oversized (Semi / Heavy)</option>
            </select>
          </div>

          {/* Vehicle Subtype */}
          <div>
            <label className="text-slate-400 font-medium block mb-1">Vehicle / Body Subtype</label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleSubtype)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md py-1.5 px-2 text-slate-200 focus:outline-none focus:border-amber-500"
            >
              <option value="any">Any Subtype</option>
              <option value="sedan">Sedan</option>
              <option value="suv">SUV</option>
              <option value="pickup">Pickup Truck</option>
              <option value="semi_truck">Semi Truck / Hauler</option>
              <option value="box_truck">Box Truck</option>
              <option value="bus">Transit / Charter Bus</option>
              <option value="van">Van</option>
              <option value="taxi">Taxi Cab</option>
              <option value="motorcycle">Motorcycle</option>
              <option value="emergency_vehicle">Emergency Vehicle</option>
            </select>
          </div>
        </div>

        {/* Tags Selector */}
        <div className="pt-2 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
            <Tag className="w-3 h-3 text-amber-400" />
            <span>Attribute Tags Filter:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_TAGS.map((t) => {
              const isSelected = selectedTags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/80'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                  <span>#{t}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Found <strong className="text-white">{filteredDetections.length}</strong> matching targets across Las Vegas CCTV network
        </span>
        <span className="text-[11px]">Sorted by most recent detection</span>
      </div>

      {/* Search Results Grid */}
      {filteredDetections.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
          <Search className="w-12 h-12 mx-auto text-slate-600 mb-3" />
          <h3 className="text-base font-semibold text-slate-200">No targets found matching criteria</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Try loosening your color, height, or category filters, or click "Scan New Frames Now" to trigger a fresh AI scan across Las Vegas cameras.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={resetFilters}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
            >
              Reset Filters
            </button>
            <button
              onClick={onTriggerCorridorScan}
              disabled={isScanning}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs transition-colors"
            >
              Scan CCTV Corridors
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDetections.map((det) => (
            <div
              key={det.id}
              className="bg-slate-900 border border-slate-800 hover:border-amber-500/60 rounded-xl overflow-hidden shadow-sm transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Snapshot Thumbnail with Detection Overlay */}
                <div
                  onClick={() => onOpenCamera(det.cameraId)}
                  className="relative aspect-video bg-black overflow-hidden cursor-pointer group-hover:opacity-95 transition-opacity"
                >
                  <img
                    src={det.snapshotUrl}
                    alt={det.description}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />

                  {/* Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-black/40" />

                  {/* Bounding box marker indicator */}
                  <div
                    style={{
                      top: (det.box.ymin / 10).toFixed(1) + '%',
                      left: (det.box.xmin / 10).toFixed(1) + '%',
                      width: ((det.box.xmax - det.box.xmin) / 10).toFixed(1) + '%',
                      height: ((det.box.ymax - det.box.ymin) / 10).toFixed(1) + '%'
                    }}
                    className="absolute border-2 border-amber-400 bg-amber-400/20 rounded shadow"
                  />

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-[11px] pointer-events-none">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase shadow ${
                        det.category === 'cyclist'
                          ? 'bg-yellow-500 text-slate-950'
                          : det.category === 'person'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-emerald-500 text-slate-950'
                      }`}
                    >
                      {det.category}
                    </span>

                    <span className="px-1.5 py-0.5 rounded bg-black/70 text-slate-200 font-mono text-[10px] border border-slate-700">
                      CCTV #{det.cameraId}
                    </span>
                  </div>

                  {/* Bottom details */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs pointer-events-none">
                    <span className="text-white font-medium text-xs drop-shadow truncate pr-2">
                      {det.cameraName}
                    </span>
                    <span className="text-slate-300 font-mono text-[10px] bg-black/60 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-amber-400" />
                      {new Date(det.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Content body */}
                <div className="p-3.5 space-y-2.5">
                  <div>
                    <h4 className="text-sm font-bold text-white capitalize flex items-center gap-2">
                      <span>{det.color.replace('_', '/')} {det.subtype}</span>
                      {det.isCyclist && (
                        <span className="text-[10px] bg-yellow-950 text-yellow-400 border border-yellow-800 px-1.5 py-0.2 rounded font-semibold">
                          Cyclist
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-300 mt-1">{det.description}</p>
                  </div>

                  {/* Attribute Specs Grid */}
                  <div className="grid grid-cols-3 gap-1.5 text-[11px] bg-slate-800/60 p-2 rounded-lg border border-slate-700/60">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Height</span>
                      <span className="font-medium text-slate-200 capitalize">{det.height.replace('_', ' ')}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Size</span>
                      <span className="font-medium text-slate-200 capitalize">{det.size}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Direction</span>
                      <span className="font-mono text-amber-400 font-bold">
                        {det.direction || 'SB'} {det.speedEstimateMph ? `~${det.speedEstimateMph}mph` : ''}
                      </span>
                    </div>
                  </div>

                  {/* Tags */}
                  {det.tags && det.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {det.tags.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[10px] border border-slate-700"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Bar */}
              <div className="px-3.5 py-2.5 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => onOpenCamera(det.cameraId)}
                  className="text-xs text-slate-400 hover:text-white transition-colors flex items-center gap-1 font-medium"
                >
                  <span>Open Feed</span>
                </button>

                <button
                  onClick={() => onTrackSubject(det)}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Follow Live &amp; Track</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
