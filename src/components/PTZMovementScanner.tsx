import React, { useState, useEffect } from 'react';
import {
  Compass,
  Sliders,
  RotateCw,
  Eye,
  ShieldAlert,
  Clock,
  Volume2,
  VolumeX,
  Sparkles,
  ArrowRight,
  Activity,
  MessageSquarePlus,
  Cpu,
  CheckCircle2,
  Play,
  RefreshCw,
  ExternalLink,
  Navigation,
  Crosshair
} from 'lucide-react';
import type {
  Camera,
  PTZMovementState,
  PTZAlert,
  PTZScannerMode,
  PTZPatrolOptimizationSuggestion
} from '../types';

interface PTZMovementScannerProps {
  cameras: Camera[];
  onSelectCamera: (camera: Camera) => void;
  onOpenCommunityPostModal?: (camera?: Camera) => void;
  liveTimestamp: number;
}

const CORRIDOR_OPTIONS = [
  'Las Vegas Strip',
  'I-15 Interstate',
  'Downtown / Fremont',
  'US-95 / I-515',
  'All Corridors'
];

const OPTIMIZATION_OBJECTIVES = [
  'Incident Hotspot & Tracked Vehicle Intercept',
  'Blind-Spot Elimination & Crosswalk Coverage',
  'High-Occupancy Arterial Queue Sweeping',
  'Emergency Responder Corridor Pre-Clearance'
];

export const PTZMovementScanner: React.FC<PTZMovementScannerProps> = ({
  cameras,
  onSelectCamera,
  onOpenCommunityPostModal,
  liveTimestamp
}) => {
  const [scannerMode, setScannerMode] = useState<PTZScannerMode>('manual_oversight');
  const [optimizations, setOptimizations] = useState<PTZPatrolOptimizationSuggestion[]>([]);
  const [selectedCorridor, setSelectedCorridor] = useState<string>('Las Vegas Strip');
  const [selectedObjective, setSelectedObjective] = useState<string>(OPTIMIZATION_OBJECTIVES[0]);
  const [isGeneratingOptimization, setIsGeneratingOptimization] = useState<boolean>(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [activeOptimizationId, setActiveOptimizationId] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<'all' | 'operator' | 'tour'>('all');
  const [alerts, setAlerts] = useState<PTZAlert[]>([]);
  const [activeMovingList, setActiveMovingList] = useState<
    Array<{ camera: Camera; ptzState: PTZMovementState }>
  >([]);
  const [operatorCount, setOperatorCount] = useState<number>(0);
  const [tourCount, setTourCount] = useState<number>(0);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(true);
  const [selectedScanCam, setSelectedScanCam] = useState<Camera | null>(null);
  const [isScanningCam, setIsScanningCam] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Fetch live PTZ status from backend
  const fetchPTZStatus = () => {
    fetch('/api/ptz/status')
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setActiveMovingList(data.activeMoving || []);
          setAlerts(data.recentAlerts || []);
          setOperatorCount(data.operatorManualCount || 0);
          setTourCount(data.programmedTourCount || 0);
        }
      })
      .catch((err) => console.error('Failed to load PTZ status:', err));
  };

  // Fetch Patrol Mode & AI Patrol Path Optimizations
  const fetchPatrolModeAndOptimizations = () => {
    fetch('/api/ptz/patrol-mode')
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          if (data.mode) setScannerMode(data.mode);
          if (Array.isArray(data.optimizations)) {
            setOptimizations(data.optimizations);
            if (!activeOptimizationId && data.optimizations.length > 0) {
              setActiveOptimizationId(data.optimizations[0].id);
            }
          }
        }
      })
      .catch((err) => console.error('Failed to load patrol optimizations:', err));
  };

  useEffect(() => {
    fetchPTZStatus();
    fetchPatrolModeAndOptimizations();
    const interval = setInterval(fetchPTZStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  // Toggle between 'Manual Oversight' and 'Autonomous Patrol' modes
  const handleToggleScannerMode = async (nextMode: PTZScannerMode) => {
    setScannerMode(nextMode);
    if (nextMode === 'autonomous_patrol') {
      setFilterType('tour');
      setActionFeedback(
        'Switched to Autonomous Patrol Mode — AI Patrol Path Optimization Engine active across corridor presets.'
      );
    } else {
      setFilterType('all');
      setActionFeedback(
        'Switched to Manual Oversight Mode — Prioritizing live human operator joystick slewing & manual overrides.'
      );
    }

    try {
      const res = await fetch('/api/ptz/patrol-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: nextMode })
      });
      const data = await res.json();
      if (data && data.optimizations) {
        setOptimizations(data.optimizations);
      }
      fetchPTZStatus();
    } catch {
      // Ignore network hiccup
    } finally {
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  // Generate a new AI Patrol Path Optimization via Gemini
  const handleGeneratePatrolOptimization = async () => {
    setIsGeneratingOptimization(true);
    setActionFeedback(
      `Synthesizing AI Patrol Path Optimization for ${selectedCorridor} (${selectedObjective})...`
    );
    try {
      const res = await fetch('/api/ptz/optimize-patrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          corridor: selectedCorridor,
          focusObjective: selectedObjective
        })
      });
      const data = await res.json();
      if (data && data.suggestion) {
        setOptimizations(data.optimizations || [data.suggestion, ...optimizations]);
        setActiveOptimizationId(data.suggestion.id);
        setActionFeedback(
          `AI Patrol Suggestion Generated: "${data.suggestion.title}" (+${data.suggestion.estimatedCoverageGainPct}% FOV coverage gain)`
        );
      }
    } catch {
      setActionFeedback('Failed to generate AI patrol optimization.');
    } finally {
      setIsGeneratingOptimization(false);
      setTimeout(() => setActionFeedback(null), 6000);
    }
  };

  // Apply an AI Patrol Path Optimization to the live PTZ cameras
  const handleApplyPatrolOptimization = async (opt: PTZPatrolOptimizationSuggestion) => {
    setApplyingId(opt.id);
    setActionFeedback(
      `Applying "${opt.title}" waypoints to ${opt.waypoints.length} corridor PTZ cameras...`
    );
    try {
      const res = await fetch('/api/ptz/apply-patrol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optimizationId: opt.id })
      });
      const data = await res.json();
      if (data && data.success) {
        setScannerMode('autonomous_patrol');
        setFilterType('tour');
        if (data.optimizations) {
          setOptimizations(data.optimizations);
        }
        fetchPTZStatus();
        setActionFeedback(
          `Autonomous Patrol Applied: ${opt.waypoints
            .map((w) => `CCTV #${w.cameraId} (${w.recommendedHeadingDeg}°)`)
            .join(' → ')} now executing synchronized sweep.`
        );
      }
    } catch {
      setActionFeedback('Failed to apply patrol optimization.');
    } finally {
      setApplyingId(null);
      setTimeout(() => setActionFeedback(null), 6000);
    }
  };

  // Filtered cameras in motion
  const displayedItems = activeMovingList.filter((item) => {
    if (filterType === 'operator') return item.ptzState.status === 'operator_manual';
    if (filterType === 'tour') return item.ptzState.status === 'programmed_tour';
    return true;
  });

  // Trigger optical PTZ scan on a camera
  const handleAnalyzeCamera = async (cam: Camera) => {
    setSelectedScanCam(cam);
    setIsScanningCam(true);
    setActionFeedback(`Scanning optical flow vectors across successive frames for ${cam.name}...`);
    try {
      const res = await fetch(`/api/ptz/scan-camera/${cam.id}`, { method: 'POST' });
      const data = await res.json();
      if (data && data.ptzState) {
        setActionFeedback(
          `Analysis complete: Camera is ${data.ptzState.status.replace('_', ' ').toUpperCase()} (${data.ptzState.classificationReason.slice(0, 75)}...)`
        );
        fetchPTZStatus();
      }
    } catch {
      setActionFeedback('Failed to query camera telemetry.');
    } finally {
      setIsScanningCam(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  };

  // Toggle or simulate operator override
  const handleToggleOperatorOverride = async (camId: number) => {
    try {
      const res = await fetch('/api/ptz/toggle-operator-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId: camId, action: 'toggle' })
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback(
          data.ptzState.status === 'operator_manual'
            ? `Simulated manual operator joystick override on CCTV #${camId}!`
            : `CCTV #${camId} reset to stationary position.`
        );
        fetchPTZStatus();
        setTimeout(() => setActionFeedback(null), 4000);
      }
    } catch {
      setActionFeedback('Action failed.');
    }
  };

  const selectedOptimization =
    optimizations.find((o) => o.id === activeOptimizationId) || optimizations[0] || null;

  return (
    <div className="space-y-5">
      {/* Top Banner & Operating Mode Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Compass className="w-5 h-5 text-amber-400 shrink-0" />
              <h2 className="text-lg font-semibold text-white tracking-tight">
                CCTV PTZ Motion Scanner &amp; Patrol Controller
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Toggle between <strong>Manual Oversight</strong> (detecting human TMC joystick
              overrides and manual lane zooms) and <strong>Autonomous Patrol</strong> (AI-driven
              multi-camera patrol path optimization eliminating corridor blind spots).
            </p>
          </div>

          {/* Primary Mode Toggle: Manual Oversight vs Autonomous Patrol */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="PTZ Scanner Operating Mode"
              className="inline-flex items-center p-1 rounded-lg bg-slate-950 border border-slate-800"
            >
              <button
                type="button"
                onClick={() => handleToggleScannerMode('manual_oversight')}
                className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                  scannerMode === 'manual_oversight'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Manual Oversight</span>
                <span className="font-mono tabular-nums text-[11px] opacity-90">
                  ({operatorCount})
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleScannerMode('autonomous_patrol')}
                className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                  scannerMode === 'autonomous_patrol'
                    ? 'bg-emerald-600 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Autonomous Patrol</span>
                <span className="font-mono tabular-nums text-[11px] opacity-90">
                  ({optimizations.length} AI Paths)
                </span>
              </button>
            </div>

            {/* Sound Alerts Toggle */}
            <button
              type="button"
              onClick={() => setSoundAlertsEnabled(!soundAlertsEnabled)}
              title={soundAlertsEnabled ? 'Operator alert chimes active' : 'Alert chimes muted'}
              className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                soundAlertsEnabled
                  ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-slate-950 border-slate-800 text-slate-500'
              }`}
            >
              {soundAlertsEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Chime On</span>
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                  <span>Muted</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Clean Unboxed Telemetry Summary Strip */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-200 font-medium">
              Active Mode:{' '}
              <strong
                className={
                  scannerMode === 'autonomous_patrol' ? 'text-emerald-400' : 'text-rose-400'
                }
              >
                {scannerMode === 'autonomous_patrol'
                  ? 'Autonomous Patrol (AI Path Optimization)'
                  : 'Manual Oversight (Human Joystick Detection)'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-rose-300">
              {operatorCount} Manual Overrides
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-cyan-300">
              {tourCount} Active Patrol Sweeps
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-emerald-300">
              {optimizations.length} AI Patrol Suggestions Ready
            </span>
          </div>

          {scannerMode === 'manual_oversight' && (
            <button
              type="button"
              onClick={() => handleToggleScannerMode('autonomous_patrol')}
              className="text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1 underline underline-offset-4 whitespace-nowrap"
            >
              <span>Open AI Patrol Path Optimizer</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Action feedback toast inside panel */}
        {actionFeedback && (
          <div className="mt-3 p-2.5 rounded-lg bg-slate-950 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{actionFeedback}</span>
          </div>
        )}
      </div>

      {/* =====================================================================
          AUTONOMOUS PATROL MODE: AI PATROL PATH OPTIMIZATION CONSOLE
         ===================================================================== */}
      {scannerMode === 'autonomous_patrol' && (
        <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 sm:p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium mb-1">
                <Cpu className="w-4 h-4" />
                <span>AI Autonomous Patrol Path Optimization Engine</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">Phase-Locked Multi-Camera Sweeps</span>
              </div>
              <h3 className="text-base font-semibold text-white">
                Suggested Corridor Patrol Path Optimizations
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Synthesizes live incident locations, tracked vehicle trajectories, and camera azimuth
                geometry to recommend synchronized PTZ sweep paths.
              </p>
            </div>

            {/* AI Patrol Generator Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedCorridor}
                onChange={(e) => setSelectedCorridor(e.target.value)}
                aria-label="Select Corridor for Patrol Optimization"
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {CORRIDOR_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={selectedObjective}
                onChange={(e) => setSelectedObjective(e.target.value)}
                aria-label="Select Optimization Objective"
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 max-w-[240px] truncate"
              >
                {OPTIMIZATION_OBJECTIVES.map((obj) => (
                  <option key={obj} value={obj}>
                    {obj}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleGeneratePatrolOptimization}
                disabled={isGeneratingOptimization}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                {isGeneratingOptimization ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Optimizing Path...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Suggest New Patrol Path</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Optimization Suggestions Selector Tabs + Detailed View */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: List of AI Patrol Suggestions */}
            <div className="lg:col-span-5 space-y-2.5">
              <div className="text-xs font-medium text-slate-400 mb-1">
                Available AI Patrol Plans ({optimizations.length})
              </div>
              {optimizations.map((opt, index) => {
                const isSelected = selectedOptimization?.id === opt.id;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setActiveOptimizationId(opt.id)}
                    className={`p-3.5 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-slate-950 border-emerald-500/70'
                        : 'bg-slate-950/50 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-white leading-snug">
                        0{index + 1}. {opt.title}
                      </div>
                      {opt.isApplied && (
                        <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Active
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
                      <span className="text-emerald-400 font-semibold">
                        +{opt.estimatedCoverageGainPct}% Coverage
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="text-cyan-300">
                        -{opt.responseLatencyReductionSec}s Lock Latency
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{opt.waypoints.length} Waypoints</span>
                    </div>

                    <p className="mt-2 text-xs text-slate-400 line-clamp-2 leading-relaxed">
                      {opt.rationale}
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500">
                        {opt.corridor} · {opt.modelUsed}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyPatrolOptimization(opt);
                        }}
                        disabled={applyingId === opt.id}
                        className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap ${
                          opt.isApplied
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        }`}
                      >
                        <Play className="w-3 h-3" />
                        <span>
                          {applyingId === opt.id
                            ? 'Applying...'
                            : opt.isApplied
                            ? 'Re-Sync Patrol'
                            : 'Apply Patrol Path'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Active Patrol Path Waypoints & Vector Topology */}
            {selectedOptimization && (
              <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-800">
                    <div>
                      <div className="text-xs text-emerald-400 font-medium">
                        {selectedOptimization.corridor} · Autonomous Sweep Topology
                      </div>
                      <h4 className="text-sm font-semibold text-white mt-0.5">
                        {selectedOptimization.title}
                      </h4>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyPatrolOptimization(selectedOptimization)}
                      disabled={applyingId === selectedOptimization.id}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap self-start sm:self-auto"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>
                        {selectedOptimization.isApplied
                          ? 'Patrol Path Active on Network'
                          : 'Execute Autonomous Patrol'}
                      </span>
                    </button>
                  </div>

                  {/* SVG Corridor Patrol Loop Diagram */}
                  <div className="my-3 bg-slate-900/90 border border-slate-800/90 rounded-lg p-3">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                      <span>Synchronized Azimuth &amp; FOV Handoff Sequence</span>
                      <span className="font-mono tabular-nums text-emerald-400">
                        Coverage Gain: +{selectedOptimization.estimatedCoverageGainPct}% · Latency: -
                        {selectedOptimization.responseLatencyReductionSec}s
                      </span>
                    </div>
                    <svg
                      viewBox="0 0 600 110"
                      className="w-full h-24 overflow-visible"
                      role="img"
                      aria-label="Autonomous patrol path vector sequence"
                    >
                      <defs>
                        <linearGradient id="patrolLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                          <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.9" />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.9" />
                        </linearGradient>
                      </defs>

                      {/* Corridor Baseline */}
                      <line
                        x1="60"
                        y1="60"
                        x2="540"
                        y2="60"
                        stroke="#1e293b"
                        strokeWidth="6"
                        strokeLinecap="round"
                      />
                      {/* Animated Autonomous Handoff Vector Line */}
                      <line
                        x1="60"
                        y1="60"
                        x2="540"
                        y2="60"
                        stroke="url(#patrolLineGrad)"
                        strokeWidth="2.5"
                        strokeDasharray="8 5"
                      />

                      {selectedOptimization.waypoints.map((wp, idx) => {
                        const total = Math.max(1, selectedOptimization.waypoints.length - 1);
                        const cx = 75 + (idx / total) * 450;
                        const cy = 60;
                        const rad = ((wp.recommendedHeadingDeg - 90) * Math.PI) / 180;
                        const halfArc = ((wp.sweepArcDeg / 2) * Math.PI) / 180;
                        const r = 34;
                        const x1 = cx + r * Math.cos(rad - halfArc);
                        const y1 = cy + r * Math.sin(rad - halfArc);
                        const x2 = cx + r * Math.cos(rad + halfArc);
                        const y2 = cy + r * Math.sin(rad + halfArc);

                        return (
                          <g key={wp.cameraId}>
                            {/* FOV Sweep Wedge */}
                            <path
                              d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                              fill="rgba(16, 185, 129, 0.18)"
                              stroke="#10b981"
                              strokeWidth="1"
                            />
                            {/* Node Circle */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r="11"
                              fill="#0f172a"
                              stroke="#10b981"
                              strokeWidth="2"
                            />
                            <text
                              x={cx}
                              y={cy + 3.5}
                              textAnchor="middle"
                              className="fill-emerald-300 font-mono text-[9px] font-semibold"
                            >
                              0{idx + 1}
                            </text>
                            <text
                              x={cx}
                              y={cy - 18}
                              textAnchor="middle"
                              className="fill-slate-200 font-mono text-[10px] font-medium"
                            >
                              CCTV #{wp.cameraId}
                            </text>
                            <text
                              x={cx}
                              y={cy + 27}
                              textAnchor="middle"
                              className="fill-slate-400 font-mono text-[9px]"
                            >
                              {wp.recommendedHeadingDeg}° · {wp.recommendedZoom}x · {wp.dwellSeconds}s
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Ordered Waypoint Table */}
                  <div className="space-y-2">
                    {selectedOptimization.waypoints.map((wp, idx) => (
                      <div
                        key={`${selectedOptimization.id}-${wp.cameraId}-${idx}`}
                        className="p-2.5 rounded-lg bg-slate-900/70 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono tabular-nums text-emerald-400 font-semibold">
                              0{idx + 1}. CCTV #{wp.cameraId}
                            </span>
                            <span className="font-semibold text-white">{wp.cameraName}</span>
                          </div>
                          <p className="text-[11px] text-slate-400">{wp.priorityReason}</p>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-slate-300 shrink-0">
                          <span>Azimuth {wp.recommendedHeadingDeg}°</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-300">{wp.recommendedZoom}x Zoom</span>
                          <span aria-hidden="true">·</span>
                          <span className="text-cyan-300">{wp.sweepArcDeg}° Arc</span>
                          <span aria-hidden="true">·</span>
                          <span>{wp.dwellSeconds}s Dwell</span>
                          <button
                            type="button"
                            onClick={() => {
                              const cam = cameras.find((c) => c.id === wp.cameraId);
                              if (cam) onSelectCamera(cam);
                            }}
                            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 ml-1"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rationale & Grounding Attribution Footer */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-400">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-300 font-medium">Grounding References:</span>
                    {selectedOptimization.groundingSources.map((src, i) => (
                      <React.Fragment key={src.uri + i}>
                        {i > 0 && <span aria-hidden="true">·</span>}
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 inline-flex items-center gap-1"
                        >
                          <span>{src.title}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </React.Fragment>
                    ))}
                  </div>
                  <span className="font-mono tabular-nums text-slate-500">
                    Updated {new Date(selectedOptimization.generatedAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Real-time Operator & Patrol Movement Alert Feed */}
      {alerts.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-semibold text-slate-200">
                Live PTZ Slew &amp; Autonomous Patrol Telemetry Feed
              </span>
            </div>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              Showing {alerts.slice(0, 4).length} latest camera slews
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {alerts.slice(0, 4).map((alt) => (
              <div
                key={alt.id}
                onClick={() => {
                  const cam = cameras.find((c) => c.id === alt.cameraId);
                  if (cam) onSelectCamera(cam);
                }}
                className={`p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                  alt.type === 'operator_manual'
                    ? 'bg-slate-950 border-rose-800/60 hover:border-rose-500'
                    : 'bg-slate-950 border-cyan-800/50 hover:border-cyan-500'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 font-mono tabular-nums">
                  <span className="text-slate-300">CCTV #{alt.cameraId}</span>
                  <span>
                    {new Date(alt.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white truncate">{alt.cameraName}</div>
                <div className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-snug">
                  {alt.details}
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span
                    className={
                      alt.type === 'operator_manual'
                        ? 'text-rose-400 font-medium'
                        : 'text-cyan-400 font-medium'
                    }
                  >
                    {alt.type === 'operator_manual' ? 'Operator Override' : 'Autonomous Patrol'}
                  </span>
                  <span className="text-amber-400 flex items-center gap-0.5 font-medium">
                    Inspect <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movement Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-slate-800 text-amber-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Moving ({activeMovingList.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType('operator')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'operator'
                ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Manual Oversight Only ({operatorCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setFilterType('tour')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'tour'
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Autonomous / Patrol Tours ({tourCount})</span>
          </button>
        </div>

        <div className="text-xs text-slate-400 font-mono tabular-nums">
          Comparing frame vectors against FAST 45s/60s tour timetables
        </div>
      </div>

      {/* Main Grid of Moving CCTV Cameras */}
      {displayedItems.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          <Compass className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-200">
            No cameras match current movement filter
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Switch filter to &quot;All Moving&quot; or apply an AI Patrol Path above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedItems.map(({ camera, ptzState }) => {
            const isOperator = ptzState.status === 'operator_manual';
            return (
              <div
                key={camera.id}
                className={`bg-slate-900 border rounded-xl overflow-hidden flex flex-col transition-colors ${
                  isOperator ? 'border-rose-800/80' : 'border-cyan-800/80'
                }`}
              >
                {/* Card Header */}
                <div className="p-3 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono tabular-nums text-xs text-slate-300">
                      CCTV #{camera.id}
                    </span>
                    <span aria-hidden="true" className="text-slate-600">
                      ·
                    </span>
                    <span className="text-xs font-semibold text-white truncate" title={camera.name}>
                      {camera.name}
                    </span>
                  </div>

                  <span
                    className={`text-[11px] font-medium shrink-0 ${
                      isOperator ? 'text-rose-400' : 'text-cyan-400'
                    }`}
                  >
                    {isOperator ? 'Manual Override' : 'Autonomous Patrol'}
                  </span>
                </div>

                {/* Camera Snapshot with Live Movement HUD Overlay */}
                <div
                  onClick={() => onSelectCamera(camera)}
                  className="relative aspect-video bg-slate-950 overflow-hidden cursor-pointer group"
                >
                  <img
                    src={`/api/camera-snapshot/${camera.id}?t=${liveTimestamp}`}
                    alt={camera.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                    loading="lazy"
                  />

                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-slate-950/50 pointer-events-none" />

                  <div className="absolute top-2 left-2 px-2 py-1 rounded bg-slate-950/85 border border-slate-800 text-[11px] font-mono tabular-nums text-slate-200 flex items-center gap-2">
                    <span>Azimuth {ptzState.headingDeg}°</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-300">{ptzState.zoomLevel}x Zoom</span>
                  </div>

                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-950/85 text-[11px] font-mono tabular-nums text-slate-300">
                    Δ {ptzState.movementDurationSec}s
                  </div>

                  <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] text-white font-mono tabular-nums">
                    <div className="flex items-center gap-2">
                      <span>Pan {ptzState.panSpeedDegPerSec}°/s</span>
                      <span aria-hidden="true">·</span>
                      <span>Tilt {ptzState.tiltSpeedDegPerSec}°/s</span>
                    </div>

                    <span className="text-amber-400 group-hover:underline flex items-center gap-1 font-sans font-semibold">
                      Enlarge <Eye className="w-3 h-3" />
                    </span>
                  </div>
                </div>

                {/* Telemetry Breakdown & Classification Details */}
                <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Manual Oversight Confidence</span>
                      <strong className="text-rose-400 font-mono tabular-nums">
                        {Math.round(ptzState.operatorConfidence * 100)}%
                      </strong>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full"
                        style={{ width: `${Math.round(ptzState.operatorConfidence * 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="text-slate-400">Autonomous Patrol Match</span>
                      <strong className="text-cyan-400 font-mono tabular-nums">
                        {Math.round(ptzState.tourMatchScore * 100)}%
                      </strong>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-cyan-500 h-full rounded-full"
                        style={{ width: `${Math.round(ptzState.tourMatchScore * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-300 leading-relaxed">
                    <p className="line-clamp-3">{ptzState.classificationReason}</p>
                  </div>

                  {/* Card Actions */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAnalyzeCamera(camera)}
                        disabled={isScanningCam && selectedScanCam?.id === camera.id}
                        className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors flex items-center gap-1 whitespace-nowrap"
                        title="Re-scan optical flow vectors"
                      >
                        <Compass className="w-3 h-3 text-amber-400" />
                        <span>Vectors</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleOperatorOverride(camera.id)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${
                          isOperator
                            ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            : 'bg-rose-900/60 hover:bg-rose-900 text-rose-200 border border-rose-800'
                        }`}
                        title="Simulate or reset manual operator joystick slewing"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>{isOperator ? 'Reset' : 'Override'}</span>
                      </button>
                    </div>

                    {onOpenCommunityPostModal && (
                      <button
                        type="button"
                        onClick={() => onOpenCommunityPostModal(camera)}
                        className="px-2.5 py-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition-colors whitespace-nowrap"
                        title="Post incident note or report for this camera"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5 text-amber-400" />
                        <span>Post Note</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
