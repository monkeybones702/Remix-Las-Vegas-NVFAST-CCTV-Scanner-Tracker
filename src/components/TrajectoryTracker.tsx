import React, { useState, useMemo } from 'react';
import {
  Navigation,
  Clock,
  Camera,
  Eye,
  CheckCircle2,
  Compass,
  Cloud,
  Trash2,
  Archive,
  LogIn,
  Crosshair,
  GitBranch,
  Layers,
  BellRing
} from 'lucide-react';
import type { TrackedSubject, Camera as CameraType } from '../types';
import type { User, UserWatchlistDoc } from '../firebase';

interface TrajectoryTrackerProps {
  trackedSubjects: TrackedSubject[];
  activeTrackingId: string | null;
  onSelectTrackedSubject: (id: string) => void;
  cameras: CameraType[];
  onOpenCamera: (cameraId: number) => void;
  onConfirmSightingAtCamera: (trackingId: string, cameraId: number) => void;
  liveTimestamp: number;
  currentUser?: User | null;
  onSignIn?: () => void;
  watchlists?: UserWatchlistDoc[];
  onSaveWatchlist?: (params: {
    subjectId: string;
    subjectLabel: string;
    lastCameraId: number;
    lastCameraName: string;
    predictedCameraId: number;
    predictedCameraName: string;
    predictedBearingDeg: number;
    predictedSpeedMph: number;
    confidence: number;
    notes: string;
  }) => Promise<void>;
  onArchiveWatchlist?: (docId: string) => Promise<void>;
  onDeleteWatchlist?: (docId: string) => Promise<void>;
  onOpenFovAlerts?: () => void;
  onTriggerFovAlertForSubject?: (subjectId: string, cameraId: number) => void;
}

interface ProjectedNode {
  camera: CameraType;
  x: number;
  y: number;
  probability: number;
  etaSeconds: number;
  distanceMiles: number;
  isPrimaryBranch: boolean;
  rank: number;
}

function toCompassCardinal(deg: number): string {
  const dirs = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW'
  ];
  const normalized = ((deg % 360) + 360) % 360;
  return dirs[Math.round(normalized / 22.5) % 16];
}

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const TrajectoryTracker: React.FC<TrajectoryTrackerProps> = ({
  trackedSubjects,
  activeTrackingId,
  onSelectTrackedSubject,
  cameras,
  onOpenCamera,
  onConfirmSightingAtCamera,
  liveTimestamp,
  currentUser,
  onSignIn,
  watchlists = [],
  onSaveWatchlist,
  onArchiveWatchlist,
  onDeleteWatchlist,
  onOpenFovAlerts,
  onTriggerFovAlertForSubject
}) => {
  const [showPredictionLine, setShowPredictionLine] = useState<boolean>(true);
  const [showProbabilityCone, setShowProbabilityCone] = useState<boolean>(true);
  const [predictionHorizonMin, setPredictionHorizonMin] = useState<2 | 5 | 10>(5);
  const [projectionMode, setProjectionMode] = useState<'hybrid' | 'kinematic' | 'corridor'>('hybrid');
  const [selectedPredictedNode, setSelectedPredictedNode] = useState<ProjectedNode | null>(null);
  const [watchlistNotes, setWatchlistNotes] = useState<string>('');
  const [isSavingCloud, setIsSavingCloud] = useState<boolean>(false);

  const currentSubject =
    trackedSubjects.find((s) => s.id === activeTrackingId) || trackedSubjects[0];

  const cameraMap = useMemo(() => {
    const map = new Map<number, CameraType>();
    cameras.forEach((c) => map.set(c.id, c));
    return map;
  }, [cameras]);

  // Dynamic map bounds focused around the Las Vegas Metro / Resort Corridor
  const bounds = useMemo(() => {
    return {
      minLat: 36.04,
      maxLat: 36.22,
      minLng: -115.24,
      maxLng: -115.08
    };
  }, []);

  const projectCoord = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 1000;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 620;
    return {
      x: Math.max(28, Math.min(972, x)),
      y: Math.max(28, Math.min(592, y))
    };
  };

  // Compute historical trajectory and predictive vector projection
  const trajectoryAnalysis = useMemo(() => {
    if (!currentSubject || !currentSubject.sightings || currentSubject.sightings.length === 0) {
      return null;
    }

    // Order sightings oldest (#1) -> newest (#N)
    const chronological = [...currentSubject.sightings]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((s, idx) => {
        const pt = projectCoord(s.lat, s.lng);
        return {
          ...s,
          stepIndex: idx + 1,
          x: pt.x,
          y: pt.y
        };
      });

    const latest = chronological[chronological.length - 1];
    const previous = chronological.length > 1 ? chronological[chronological.length - 2] : null;
    const oldest = chronological[0];

    // Calculate weighted velocity vector in (dLat, dLng) and SVG space (dx, dy)
    let dLat = -0.012; // Default southbound along Strip if only 1 sighting
    let dLng = -0.003;
    let dx = -18;
    let dy = 52;

    if (previous) {
      const recentDLat = latest.lat - previous.lat;
      const recentDLng = latest.lng - previous.lng;
      const overallDLat = (latest.lat - oldest.lat) / Math.max(1, chronological.length - 1);
      const overallDLng = (latest.lng - oldest.lng) / Math.max(1, chronological.length - 1);

      // Blend 65% recent segment momentum with 35% historical trend
      dLat = recentDLat * 0.65 + overallDLat * 0.35;
      dLng = recentDLng * 0.65 + overallDLng * 0.35;

      const recentDx = latest.x - previous.x;
      const recentDy = latest.y - previous.y;
      const overallDx = (latest.x - oldest.x) / Math.max(1, chronological.length - 1);
      const overallDy = (latest.y - oldest.y) / Math.max(1, chronological.length - 1);

      dx = recentDx * 0.65 + overallDx * 0.35;
      dy = recentDy * 0.65 + overallDy * 0.35;
    }

    // Ensure non-zero vector magnitude
    const svgMag = Math.hypot(dx, dy) || 1;
    const unitX = dx / svgMag;
    const unitY = dy / svgMag;

    // Compass bearing in degrees (0 = North, 90 = East, 180 = South, 270 = West)
    const mathAngleRad = Math.atan2(unitX, -unitY);
    const bearingDeg = Math.round(((mathAngleRad * 180) / Math.PI + 360) % 360);
    const cardinal = toCompassCardinal(bearingDeg);

    // Compute historical angular variance for the probability dispersion cone
    let spreadAngleDeg = 18;
    if (chronological.length >= 3) {
      const segAngles: number[] = [];
      for (let i = 1; i < chronological.length; i++) {
        const sdx = chronological[i].x - chronological[i - 1].x;
        const sdy = chronological[i].y - chronological[i - 1].y;
        segAngles.push((Math.atan2(sdx, -sdy) * 180) / Math.PI);
      }
      const diffs = segAngles.slice(1).map((a, idx) => Math.abs(a - segAngles[idx]));
      const avgTurn = diffs.reduce((acc, v) => acc + v, 0) / Math.max(1, diffs.length);
      spreadAngleDeg = Math.max(12, Math.min(34, Math.round(avgTurn * 0.6 + 12)));
    }

    // Average speed in MPH
    const speedSamples = chronological
      .map((s) => s.speedEstimateMph)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const avgSpeedMph =
      speedSamples.length > 0
        ? Math.round(speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length)
        : 34;

    // Build candidate downstream cameras from predictedNextCameraIds + spatial forward cone
    const visitedIds = new Set(chronological.map((s) => s.cameraId));
    const explicitPredicted = (currentSubject.predictedNextCameraIds || [])
      .map((id) => cameraMap.get(id))
      .filter((c): c is CameraType => Boolean(c) && !visitedIds.has(c!.id));

    // Also find cameras in the forward direction of the velocity vector
    const spatialCandidates = cameras
      .filter((c) => !visitedIds.has(c.id) && !explicitPredicted.some((ep) => ep.id === c.id))
      .map((cam) => {
        const pt = projectCoord(cam.lat, cam.lng);
        const vx = pt.x - latest.x;
        const vy = pt.y - latest.y;
        const distSvg = Math.hypot(vx, vy);
        const dot = distSvg > 0 ? (vx * unitX + vy * unitY) / distSvg : -1;
        const distMiles = haversineMiles(latest.lat, latest.lng, cam.lat, cam.lng);
        return { cam, pt, distSvg, dot, distMiles };
      })
      .filter((item) => item.dot > 0.45 && item.distMiles >= 0.25 && item.distMiles <= 4.5)
      .sort((a, b) => b.dot * 2 - a.distMiles * 0.4 - (a.dot * 2 - b.distMiles * 0.4));

    const combinedCandidates: CameraType[] = [
      ...explicitPredicted,
      ...spatialCandidates.slice(0, 4).map((s) => s.cam)
    ].slice(0, 4);

    const projectedNodes: ProjectedNode[] = combinedCandidates.map((cam, index) => {
      const pt = projectCoord(cam.lat, cam.lng);
      const distMiles = Math.max(
        0.3,
        Number(haversineMiles(latest.lat, latest.lng, cam.lat, cam.lng).toFixed(2))
      );
      const etaSeconds = Math.max(
        35,
        Math.round((distMiles / Math.max(15, avgSpeedMph)) * 3600)
      );
      const baseProb = index === 0 ? 86 : index === 1 ? 71 : index === 2 ? 49 : 28;
      const probability = Math.max(18, Math.min(96, baseProb - Math.round(distMiles * 2)));
      return {
        camera: cam,
        x: pt.x,
        y: pt.y,
        probability,
        etaSeconds,
        distanceMiles: distMiles,
        isPrimaryBranch: index < 2,
        rank: index + 1
      };
    });

    // Kinematic horizon endpoint based on predictionHorizonMin (2m, 5m, 10m)
    const horizonPixelScale = predictionHorizonMin === 2 ? 75 : predictionHorizonMin === 5 ? 145 : 220;
    const kinematicEnd = {
      x: Math.max(35, Math.min(965, latest.x + unitX * horizonPixelScale)),
      y: Math.max(35, Math.min(585, latest.y + unitY * horizonPixelScale)),
      lat: latest.lat + dLat * (predictionHorizonMin / 2.5),
      lng: latest.lng + dLng * (predictionHorizonMin / 2.5)
    };

    // Primary visual prediction polyline points
    const primaryChainPoints: Array<{ x: number; y: number; label?: string }> = [
      { x: latest.x, y: latest.y }
    ];

    if (projectionMode === 'kinematic') {
      primaryChainPoints.push({
        x: kinematicEnd.x,
        y: kinematicEnd.y,
        label: `+${predictionHorizonMin}m Vector`
      });
    } else if (projectionMode === 'corridor') {
      projectedNodes
        .filter((n) => n.isPrimaryBranch)
        .forEach((n) => primaryChainPoints.push({ x: n.x, y: n.y, label: `#${n.camera.id}` }));
    } else {
      // Hybrid: pass through primary predicted nodes then extend along kinematic vector
      projectedNodes
        .filter((n) => n.isPrimaryBranch)
        .forEach((n) => primaryChainPoints.push({ x: n.x, y: n.y, label: `#${n.camera.id}` }));
      const lastPt = primaryChainPoints[primaryChainPoints.length - 1];
      primaryChainPoints.push({
        x: Math.max(35, Math.min(965, lastPt.x + unitX * (horizonPixelScale * 0.55))),
        y: Math.max(35, Math.min(585, lastPt.y + unitY * (horizonPixelScale * 0.55))),
        label: `+${predictionHorizonMin}m Horizon`
      });
    }

    // Secondary alternate branch points
    const alternateNodes = projectedNodes.filter((n) => !n.isPrimaryBranch);

    // Probability Dispersion Cone Polygon around the primary prediction direction
    const coneLength = horizonPixelScale * 1.15;
    const baseAngle = Math.atan2(unitY, unitX);
    const halfSpreadRad = (spreadAngleDeg * Math.PI) / 180;
    const leftWing = {
      x: Math.max(25, Math.min(975, latest.x + Math.cos(baseAngle - halfSpreadRad) * coneLength)),
      y: Math.max(25, Math.min(595, latest.y + Math.sin(baseAngle - halfSpreadRad) * coneLength))
    };
    const rightWing = {
      x: Math.max(25, Math.min(975, latest.x + Math.cos(baseAngle + halfSpreadRad) * coneLength)),
      y: Math.max(25, Math.min(595, latest.y + Math.sin(baseAngle + halfSpreadRad) * coneLength))
    };

    return {
      chronological,
      latest,
      bearingDeg,
      cardinal,
      avgSpeedMph,
      spreadAngleDeg,
      projectedNodes,
      primaryChainPoints,
      alternateNodes,
      kinematicEnd,
      conePolygon: `${latest.x},${latest.y} ${leftWing.x},${leftWing.y} ${rightWing.x},${rightWing.y}`
    };
  }, [currentSubject, cameras, cameraMap, predictionHorizonMin, projectionMode]);

  const handleSaveToCloud = async () => {
    if (!currentSubject || !trajectoryAnalysis || !onSaveWatchlist) return;
    const topPredicted = trajectoryAnalysis.projectedNodes[0];
    setIsSavingCloud(true);
    try {
      await onSaveWatchlist({
        subjectId: currentSubject.id,
        subjectLabel: currentSubject.label,
        lastCameraId: currentSubject.lastCameraId,
        lastCameraName: currentSubject.lastCameraName,
        predictedCameraId: topPredicted ? topPredicted.camera.id : currentSubject.lastCameraId,
        predictedCameraName: topPredicted ? topPredicted.camera.name : currentSubject.lastCameraName,
        predictedBearingDeg: trajectoryAnalysis.bearingDeg,
        predictedSpeedMph: trajectoryAnalysis.avgSpeedMph,
        confidence: topPredicted ? topPredicted.probability : 85,
        notes:
          watchlistNotes.trim() ||
          `Projected ${trajectoryAnalysis.bearingDeg}° ${trajectoryAnalysis.cardinal} at ~${trajectoryAnalysis.avgSpeedMph} mph (+${predictionHorizonMin}m horizon)`
      });
      setWatchlistNotes('');
    } finally {
      setIsSavingCloud(false);
    }
  };

  if (trackedSubjects.length === 0) {
    return (
      <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-400 max-w-xl mx-auto my-6">
        <Navigation className="w-12 h-12 mx-auto text-amber-500 mb-3 animate-pulse" />
        <h3 className="text-base font-semibold text-slate-100">No Target Active in Live Tracker</h3>
        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
          Select any vehicle, person, or cyclist from the <strong>Attribute Scanner &amp; Search</strong> or click <strong>Track</strong> on a live camera feed to follow them live across Las Vegas CCTV corridors.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Target Selector Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 flex-shrink-0 mr-1">
            <Navigation className="w-3.5 h-3.5 text-amber-400" />
            Tracked Targets:
          </span>
          {trackedSubjects.map((subject) => {
            const isSelected = subject.id === currentSubject?.id;
            return (
              <button
                key={subject.id}
                onClick={() => {
                  onSelectTrackedSubject(subject.id);
                  setSelectedPredictedNode(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 flex-shrink-0 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    subject.isFollowingLive ? 'bg-emerald-400 animate-ping' : 'bg-slate-400'
                  }`}
                />
                <span>{subject.label}</span>
                <span className="text-[11px] opacity-80 font-mono tabular-nums">
                  · {subject.sightings.length} sightings
                </span>
              </button>
            );
          })}
        </div>

        {trajectoryAnalysis && (
          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
            <span>
              Vector: <strong className="text-emerald-400">{trajectoryAnalysis.bearingDeg}° {trajectoryAnalysis.cardinal}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Est. Speed: <strong className="text-slate-200">{trajectoryAnalysis.avgSpeedMph} mph</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Cone Spread: <strong className="text-cyan-400">±{trajectoryAnalysis.spreadAngleDeg}°</strong>
            </span>
          </div>
        )}
      </div>

      {/* Interactive Geospatial Trajectory & Visual Prediction Line Canvas */}
      {currentSubject && trajectoryAnalysis && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          {/* Map Header & Prediction Controls */}
          <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400" />
                <span>Predictive Trajectory Vector Map — {currentSubject.label}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Historical sighting chain (#1 → #{trajectoryAnalysis.chronological.length}) with real-time kinematic &amp; corridor-snapped visual prediction line
              </p>
            </div>

            {/* Prediction Controls */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Toggle Visual Prediction Line */}
              <button
                onClick={() => setShowPredictionLine((v) => !v)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border ${
                  showPredictionLine
                    ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Prediction Line: {showPredictionLine ? 'Active' : 'Hidden'}</span>
              </button>

              {/* Toggle Probability Cone */}
              <button
                onClick={() => setShowProbabilityCone((v) => !v)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap border ${
                  showProbabilityCone
                    ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>Dispersion Cone</span>
              </button>

              {/* Projection Mode Selector */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5">
                {(
                  [
                    { id: 'hybrid', label: 'Hybrid Vector' },
                    { id: 'corridor', label: 'Node Chain' },
                    { id: 'kinematic', label: 'Linear Kinematic' }
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setProjectionMode(mode.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                      projectionMode === mode.id
                        ? 'bg-slate-800 text-amber-400 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* Horizon Selector */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5 font-mono tabular-nums">
                {([2, 5, 10] as const).map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setPredictionHorizonMin(mins)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                      predictionHorizonMin === mins
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    +{mins}m
                  </button>
                ))}
              </div>

              {/* High-Traffic Camera FOV Alert Quick Trigger */}
              {onTriggerFovAlertForSubject && (
                <button
                  type="button"
                  onClick={() =>
                    onTriggerFovAlertForSubject(
                      currentSubject.id,
                      trajectoryAnalysis.projectedNodes[0]?.camera.id || currentSubject.lastCameraId
                    )
                  }
                  className="px-3 py-1.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  title="Simulate tracked vehicle entering high-traffic camera field of view"
                >
                  <BellRing className="w-3.5 h-3.5 text-amber-400" />
                  <span>Test FOV Entry Alert</span>
                </button>
              )}

              {onOpenFovAlerts && (
                <button
                  type="button"
                  onClick={onOpenFovAlerts}
                  className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition-colors whitespace-nowrap"
                >
                  FOV Watchlist
                </button>
              )}
            </div>
          </div>

          {/* SVG Trajectory & Prediction Canvas */}
          <div className="relative bg-slate-950 aspect-[16/9] max-h-[480px] w-full overflow-hidden">
            <svg
              viewBox="0 0 1000 620"
              className="w-full h-full select-none"
              onClick={() => setSelectedPredictedNode(null)}
            >
              <defs>
                <radialGradient id="trackerVegasGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.07" />
                  <stop offset="100%" stopColor="#090d16" stopOpacity="0" />
                </radialGradient>

                <linearGradient id="predictionConeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.26" />
                  <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.11" />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
                </linearGradient>

                <marker
                  id="confirmedArrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
                </marker>

                <marker
                  id="predictedArrowPrimary"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                </marker>

                <marker
                  id="predictedArrowAlt"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                </marker>
              </defs>

              {/* Base Background */}
              <rect width="1000" height="620" fill="#090d16" />
              <circle cx="500" cy="310" r="300" fill="url(#trackerVegasGlow)" />

              {/* Coordinate Reference Grid */}
              <g opacity="0.07" stroke="#94a3b8" strokeWidth="1">
                <line x1="150" y1="0" x2="150" y2="620" />
                <line x1="350" y1="0" x2="350" y2="620" />
                <line x1="550" y1="0" x2="550" y2="620" />
                <line x1="750" y1="0" x2="750" y2="620" />
                <line x1="900" y1="0" x2="900" y2="620" />
                <line x1="0" y1="140" x2="1000" y2="140" />
                <line x1="0" y1="310" x2="1000" y2="310" />
                <line x1="0" y1="480" x2="1000" y2="480" />
              </g>

              {/* Major Las Vegas Arterial & Freeway Corridors */}
              {/* I-15 Corridor */}
              <path
                d="M 350 605 Q 445 420 510 285 T 640 25"
                fill="none"
                stroke="#1e293b"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M 350 605 Q 445 420 510 285 T 640 25"
                fill="none"
                stroke="#334155"
                strokeWidth="2"
                strokeDasharray="6 4"
              />

              {/* Las Vegas Blvd (The Strip) */}
              <path
                d="M 465 550 L 515 330 L 548 180"
                fill="none"
                stroke="#451a03"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <path
                d="M 465 550 L 515 330 L 548 180"
                fill="none"
                stroke="#f59e0b"
                strokeOpacity="0.3"
                strokeWidth="3"
              />

              {/* CC-215 Beltway */}
              <path
                d="M 190 520 C 190 340 270 160 500 120 C 670 120 830 200 850 400 C 860 510 710 580 430 580"
                fill="none"
                stroke="#1e293b"
                strokeWidth="7"
              />

              {/* Background CCTV Camera Nodes */}
              {cameras.slice(0, 220).map((cam) => {
                const pt = projectCoord(cam.lat, cam.lng);
                return (
                  <circle
                    key={cam.id}
                    cx={pt.x}
                    cy={pt.y}
                    r="2.2"
                    fill="#475569"
                    opacity="0.55"
                    className="cursor-pointer hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCamera(cam.id);
                    }}
                  />
                );
              })}

              {/* Corridor Text Labels */}
              <text x="648" y="42" fill="#64748b" fontSize="11" fontWeight="600" fontFamily="sans-serif">
                I-15 North Corridor
              </text>
              <text x="370" y="595" fill="#64748b" fontSize="11" fontWeight="600" fontFamily="sans-serif">
                I-15 South Corridor
              </text>
              <text x="530" y="345" fill="#d97706" fontSize="11" fontWeight="600" fontFamily="sans-serif">
                Las Vegas Blvd (The Strip)
              </text>
              <text x="560" y="175" fill="#38bdf8" fontSize="11" fontWeight="600" fontFamily="sans-serif">
                Downtown / Fremont
              </text>

              {/* 1. Forward Probability Dispersion Cone */}
              {showPredictionLine && showProbabilityCone && (
                <polygon
                  points={trajectoryAnalysis.conePolygon}
                  fill="url(#predictionConeGrad)"
                  stroke="#10b981"
                  strokeOpacity="0.3"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
              )}

              {/* 2. Secondary / Alternate Predicted Branch Paths */}
              {showPredictionLine &&
                projectionMode !== 'kinematic' &&
                trajectoryAnalysis.alternateNodes.map((altNode) => (
                  <g key={`alt-branch-${altNode.camera.id}`}>
                    <line
                      x1={trajectoryAnalysis.latest.x}
                      y1={trajectoryAnalysis.latest.y}
                      x2={altNode.x}
                      y2={altNode.y}
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      strokeDasharray="5 5"
                      markerEnd="url(#predictedArrowAlt)"
                      opacity="0.85"
                    />
                    <text
                      x={(trajectoryAnalysis.latest.x + altNode.x) / 2 + 8}
                      y={(trajectoryAnalysis.latest.y + altNode.y) / 2 - 6}
                      fill="#38bdf8"
                      fontSize="10"
                      fontFamily="monospace"
                    >
                      Alt {altNode.probability}%
                    </text>
                  </g>
                ))}

              {/* 3. Primary Visual Prediction Line (Historical Sighting Pattern Projection) */}
              {showPredictionLine && trajectoryAnalysis.primaryChainPoints.length > 1 && (
                <g>
                  {/* Outer subtle glow path */}
                  <polyline
                    points={trajectoryAnalysis.primaryChainPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="9"
                    strokeOpacity="0.18"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Primary animated dashed vector line */}
                  <polyline
                    points={trajectoryAnalysis.primaryChainPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="3.5"
                    strokeDasharray="9 5"
                    markerEnd="url(#predictedArrowPrimary)"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Kinematic Horizon Endpoint Marker */}
                  {(() => {
                    const endPt =
                      trajectoryAnalysis.primaryChainPoints[
                        trajectoryAnalysis.primaryChainPoints.length - 1
                      ];
                    return (
                      <g>
                        <circle
                          cx={endPt.x}
                          cy={endPt.y}
                          r="7"
                          fill="#064e3b"
                          stroke="#10b981"
                          strokeWidth="2"
                        />
                        <text
                          x={endPt.x + 11}
                          y={endPt.y + 4}
                          fill="#6ee7b7"
                          fontSize="10"
                          fontWeight="600"
                          fontFamily="monospace"
                        >
                          +{predictionHorizonMin}m Projected ({trajectoryAnalysis.bearingDeg}° {trajectoryAnalysis.cardinal})
                        </text>
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* 4. Predicted Next Camera Waypoint Nodes */}
              {showPredictionLine &&
                projectionMode !== 'kinematic' &&
                trajectoryAnalysis.projectedNodes.map((node) => {
                  const isSelected = selectedPredictedNode?.camera.id === node.camera.id;
                  const strokeColor = node.isPrimaryBranch ? '#10b981' : '#38bdf8';
                  return (
                    <g
                      key={`pred-node-${node.camera.id}`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPredictedNode(node);
                      }}
                    >
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isSelected ? 15 : 11}
                        fill={strokeColor}
                        fillOpacity="0.22"
                      />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r="6"
                        fill="#090d16"
                        stroke={strokeColor}
                        strokeWidth="2.5"
                      />
                      <text
                        x={node.x - 10}
                        y={node.y - 12}
                        fill={node.isPrimaryBranch ? '#34d399' : '#7dd3fc'}
                        fontSize="10"
                        fontWeight="600"
                        fontFamily="monospace"
                      >
                        NEXT #{node.rank} · {node.probability}% · +{Math.round(node.etaSeconds / 60)}m
                      </text>
                    </g>
                  );
                })}

              {/* 5. Confirmed Historical Trajectory Chain (#1 -> #Latest) */}
              {trajectoryAnalysis.chronological.length > 1 && (
                <polyline
                  points={trajectoryAnalysis.chronological.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="4"
                  markerEnd="url(#confirmedArrow)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* 6. Historical Sighting Nodes */}
              {trajectoryAnalysis.chronological.map((pt, idx) => {
                const isLatest = idx === trajectoryAnalysis.chronological.length - 1;
                return (
                  <g
                    key={pt.id || idx}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenCamera(pt.cameraId);
                    }}
                  >
                    {isLatest && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="16"
                        fill="#f59e0b"
                        fillOpacity="0.28"
                        className="animate-ping"
                      />
                    )}
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={isLatest ? 7.5 : 5.5}
                      fill={isLatest ? '#f59e0b' : '#fbbf24'}
                      stroke="#090d16"
                      strokeWidth="2"
                    />
                    <text
                      x={pt.x + 10}
                      y={pt.y + 4}
                      fill={isLatest ? '#fde68a' : '#cbd5e1'}
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="monospace"
                    >
                      #{pt.stepIndex} {isLatest ? 'LATEST' : ''}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Selected Predicted Node Quick-Action Card */}
            {selectedPredictedNode && (
              <div className="absolute top-3 right-3 z-20 w-72 bg-slate-900/95 border border-emerald-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs space-y-2.5">
                <div className="flex items-center justify-between text-emerald-400 font-mono tabular-nums">
                  <span>Predicted Node #{selectedPredictedNode.rank}</span>
                  <span>{selectedPredictedNode.probability}% likelihood</span>
                </div>
                <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                  <img
                    src={`/api/camera-snapshot/${selectedPredictedNode.camera.id}?t=${liveTimestamp}`}
                    alt={selectedPredictedNode.camera.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/80 text-white font-mono text-[10px] rounded">
                    CCTV #{selectedPredictedNode.camera.id}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-white truncate">
                    {selectedPredictedNode.camera.name}
                  </div>
                  <div className="text-slate-400 text-[11px] font-mono tabular-nums mt-0.5">
                    {selectedPredictedNode.distanceMiles} mi ahead · ETA ~{selectedPredictedNode.etaSeconds}s
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onOpenCamera(selectedPredictedNode.camera.id)}
                    className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium transition-colors"
                  >
                    Inspect Feed
                  </button>
                  <button
                    onClick={() => {
                      onConfirmSightingAtCamera(currentSubject.id, selectedPredictedNode.camera.id);
                      setSelectedPredictedNode(null);
                    }}
                    className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded transition-colors flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm Sighting</span>
                  </button>
                </div>
              </div>
            )}

            {/* Map Legend Overlay */}
            <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-800 px-3 py-2 rounded-lg text-[11px] text-slate-300 flex flex-wrap items-center gap-4 backdrop-blur pointer-events-none">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-1 bg-amber-500 inline-block rounded" />
                <span>Confirmed Trajectory (#1 → #{trajectoryAnalysis.chronological.length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-b-2 border-dashed border-emerald-400 inline-block" />
                <span className="text-emerald-300 font-medium">Primary Prediction Line</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-b-2 border-dashed border-sky-400 inline-block" />
                <span className="text-sky-300">Alternate Corridor Branch</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentSubject && trajectoryAnalysis && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column: Target Profile & Cloud Persistence */}
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Active Surveillance Target</span>
                  <span className="font-mono text-emerald-400">Live Tracking</span>
                </div>

                <h3 className="text-base font-bold text-white mt-1.5">
                  {currentSubject.label}
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  {currentSubject.description}
                </p>

                {/* Target Attributes Summary */}
                <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                  <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Category · Profile</span>
                    <span className="font-semibold text-slate-200 capitalize">
                      {currentSubject.category} · {currentSubject.sightings[0]?.subtype || currentSubject.height}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Color · Size</span>
                    <span className="font-semibold text-slate-200 capitalize">
                      {currentSubject.color} · {currentSubject.size}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Projected Heading</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-400">
                      {trajectoryAnalysis.bearingDeg}° {trajectoryAnalysis.cardinal}
                    </span>
                  </div>
                  <div className="p-2.5 bg-slate-950/60 rounded border border-slate-800">
                    <span className="text-slate-400 text-[11px] block">Estimated Velocity</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-200">
                      ~{trajectoryAnalysis.avgSpeedMph} mph
                    </span>
                  </div>
                </div>

                {/* Last Sighting Info */}
                <div className="mt-4 p-3 bg-slate-950/70 rounded-lg border border-slate-800 space-y-1">
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Last Confirmed Sighting:</span>
                    <span className="font-mono tabular-nums text-white">
                      {new Date(currentSubject.lastSeen).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 truncate">
                    <Camera className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>CCTV #{currentSubject.lastCameraId} — {currentSubject.lastCameraName}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onOpenCamera(currentSubject.lastCameraId)}
                className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <Eye className="w-4 h-4" />
                <span>Watch Live Feed at Last Sighting</span>
              </button>
            </div>

            {/* Cloud Persistence Panel (Firestore UserWatchlists) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Cloud className="w-4 h-4 text-emerald-400" />
                  <span>Cloud Trajectory Watchlist (Firestore)</span>
                </h4>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {watchlists.length} saved
                </span>
              </div>

              {currentUser ? (
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={watchlistNotes}
                    onChange={(e) => setWatchlistNotes(e.target.value)}
                    maxLength={500}
                    placeholder="Add trajectory prediction note (optional)..."
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleSaveToCloud}
                    disabled={isSavingCloud}
                    className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>
                      {isSavingCloud ? 'Saving to Firestore...' : 'Save Prediction to Cloud Watchlist'}
                    </span>
                  </button>

                  {watchlists.length > 0 && (
                    <div className="pt-2 border-t border-slate-800 space-y-2 max-h-56 overflow-y-auto">
                      {watchlists.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-200 truncate">
                              {item.subjectLabel}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-emerald-400">
                              {item.confidence}% · {item.predictedBearingDeg}°
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            Next: #{item.predictedCameraId} {item.predictedCameraName}
                          </div>
                          {item.notes && (
                            <p className="text-[11px] text-slate-500 line-clamp-1">{item.notes}</p>
                          )}
                          <div className="flex items-center justify-between pt-1 text-[11px]">
                            <button
                              onClick={() => onOpenCamera(item.predictedCameraId)}
                              className="text-amber-400 hover:underline"
                            >
                              Open Predicted CCTV
                            </button>
                            <div className="flex items-center gap-2">
                              {item.status === 'active' && onArchiveWatchlist && (
                                <button
                                  onClick={() => onArchiveWatchlist(item.id)}
                                  title="Archive watchlist item"
                                  className="text-slate-400 hover:text-slate-200"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {onDeleteWatchlist && (
                                <button
                                  onClick={() => onDeleteWatchlist(item.id)}
                                  title="Delete watchlist item"
                                  className="text-slate-400 hover:text-rose-400"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-400 space-y-2">
                  <p>
                    Sign in with Google to persist predicted trajectories and target watchlists to Firestore across sessions.
                  </p>
                  {onSignIn && (
                    <button
                      onClick={onSignIn}
                      className="w-full py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Sign in with Google</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right 2 Columns: Sighting Timeline & Predicted Downstream Cameras */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-5">
            {/* Predicted Next Cameras Section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <h4 className="text-sm font-bold text-white">
                    Predicted Next Sighting Nodes (Projected by Historical Pattern)
                  </h4>
                </div>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {trajectoryAnalysis.projectedNodes.length} candidate nodes
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {trajectoryAnalysis.projectedNodes.map((node) => (
                  <div
                    key={node.camera.id}
                    className={`bg-slate-950 border rounded-lg p-2.5 flex flex-col justify-between gap-2 transition-colors ${
                      node.isPrimaryBranch
                        ? 'border-emerald-800/70 hover:border-emerald-500'
                        : 'border-slate-800 hover:border-sky-500/60'
                    }`}
                  >
                    <div className="relative aspect-video bg-black rounded overflow-hidden">
                      <img
                        src={`/api/camera-snapshot/${node.camera.id}?t=${liveTimestamp}`}
                        alt={node.camera.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-1.5 flex items-center justify-between text-[10px] font-mono tabular-nums">
                        <span className="text-white">#{node.camera.id}</span>
                        <span className={node.isPrimaryBranch ? 'text-emerald-300 font-bold' : 'text-sky-300'}>
                          {node.probability}% prob
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-200 line-clamp-1">
                        {node.camera.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5">
                        {node.distanceMiles} mi · ETA +{Math.round(node.etaSeconds / 60)}m {node.etaSeconds % 60}s
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        onClick={() => onOpenCamera(node.camera.id)}
                        className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium text-center transition-colors"
                      >
                        Watch
                      </button>
                      <button
                        onClick={() => onConfirmSightingAtCamera(currentSubject.id, node.camera.id)}
                        title="Confirm target reached this camera"
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded text-[11px] flex items-center gap-1 transition-colors"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Sighted</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical Sighting Timeline */}
            <div className="pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Confirmed Historical Sighting Chain</span>
                </h4>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {currentSubject.sightings.length} sequential sightings
                </span>
              </div>

              <div className="space-y-3 relative before:absolute before:left-6 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-800">
                {currentSubject.sightings.map((sighting, idx) => {
                  const isLatest = idx === 0;
                  return (
                    <div key={sighting.id || idx} className="relative flex items-start gap-4">
                      <div
                        className={`w-12 h-12 rounded-lg flex items-center justify-center font-mono tabular-nums font-bold text-xs flex-shrink-0 z-10 border ${
                          isLatest
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        #{currentSubject.sightings.length - idx}
                      </div>

                      <div className="flex-1 bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <div
                          onClick={() => onOpenCamera(sighting.cameraId)}
                          className="w-full sm:w-28 aspect-video bg-black rounded-lg overflow-hidden relative flex-shrink-0 cursor-pointer group"
                        >
                          <img
                            src={sighting.snapshotUrl}
                            alt={sighting.cameraName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          <span className="absolute bottom-1 right-1 px-1 py-0.2 bg-black/75 text-[9px] font-mono text-white rounded">
                            CCTV #{sighting.cameraId}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h5 className="text-xs sm:text-sm font-bold text-white truncate">
                              {sighting.cameraName}
                            </h5>
                            <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
                              {new Date(sighting.timestamp).toLocaleTimeString()}
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 mt-1 line-clamp-1">
                            {sighting.description}
                          </p>

                          <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400 font-mono tabular-nums">
                            <span>{sighting.corridor}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              Heading: <strong className="text-amber-400">{sighting.direction || trajectoryAnalysis.cardinal}</strong>
                            </span>
                            {sighting.speedEstimateMph && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>
                                  Speed: <strong className="text-slate-200">~{sighting.speedEstimateMph} mph</strong>
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => onOpenCamera(sighting.cameraId)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 text-xs font-semibold flex items-center justify-center gap-1 transition-colors flex-shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
