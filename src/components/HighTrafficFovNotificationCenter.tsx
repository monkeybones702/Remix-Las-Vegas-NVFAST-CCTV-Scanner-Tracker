import React, { useState } from 'react';
import {
  Bell,
  BellRing,
  CheckCircle2,
  Eye,
  Navigation,
  Volume2,
  VolumeX,
  X,
  Crosshair,
  Play,
  Sliders
} from 'lucide-react';
import type { Camera, HighTrafficFovAlert, TrackedSubject } from '../types';

export interface HighTrafficCameraNodeInfo {
  cameraId: number;
  cameraName: string;
  corridor: string;
  lat: number;
  lng: number;
  trafficVolumeAadt: number;
  fovHeadingDeg: number;
  fovAngleDeg: number;
  tier: string;
}

interface HighTrafficFovNotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: HighTrafficFovAlert[];
  highTrafficCameras: HighTrafficCameraNodeInfo[];
  monitoredCameraIds: number[];
  onToggleMonitoredCamera: (cameraId: number) => void;
  trackedSubjects: TrackedSubject[];
  onTriggerFovAlert: (subjectId: string, cameraId: number) => Promise<void>;
  onAcknowledgeAlert: (alertId: string) => Promise<void>;
  onAcknowledgeAll: () => Promise<void>;
  onOpenCamera: (cameraId: number) => void;
  onJumpToTrajectory: (subjectId: string) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  latestPopupAlert: HighTrafficFovAlert | null;
  onDismissPopupAlert: () => void;
  liveTimestamp: number;
}

export const HighTrafficFovNotificationCenter: React.FC<
  HighTrafficFovNotificationCenterProps
> = ({
  isOpen,
  onClose,
  alerts,
  highTrafficCameras,
  monitoredCameraIds,
  onToggleMonitoredCamera,
  trackedSubjects,
  onTriggerFovAlert,
  onAcknowledgeAlert,
  onAcknowledgeAll,
  onOpenCamera,
  onJumpToTrajectory,
  soundEnabled,
  onToggleSound,
  latestPopupAlert,
  onDismissPopupAlert,
  liveTimestamp
}) => {
  const [selectedSimSubjectId, setSelectedSimSubjectId] = useState<string>(
    trackedSubjects[0]?.id || 'TRK-RED-SUV-01'
  );
  const [selectedSimCameraId, setSelectedSimCameraId] = useState<number>(
    highTrafficCameras[0]?.cameraId || 21603
  );
  const [isTriggering, setIsTriggering] = useState<boolean>(false);

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  const handleSimulateTrigger = async () => {
    setIsTriggering(true);
    try {
      await onTriggerFovAlert(selectedSimSubjectId, selectedSimCameraId);
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <>
      {/* =====================================================================
          LIVE FLOATING HUD NOTIFICATION BANNER (WHEN TRACKED VEHICLE ENTERS FOV)
         ===================================================================== */}
      {latestPopupAlert && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-20 right-4 z-50 w-full max-w-md bg-slate-900 border-2 border-amber-500 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-200"
        >
          <div className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
              <BellRing className="w-4 h-4 text-amber-400 animate-bounce shrink-0" />
              <span>High-Traffic Camera FOV Entry Alert</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono tabular-nums text-[11px] text-amber-200">
                {new Date(latestPopupAlert.timestamp).toLocaleTimeString()}
              </span>
              <button
                type="button"
                onClick={onDismissPopupAlert}
                className="text-slate-400 hover:text-white p-0.5 rounded"
                title="Dismiss popup notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex gap-3">
              {/* Live Camera Snapshot Thumbnail with Reticle */}
              <div
                onClick={() => onOpenCamera(latestPopupAlert.cameraId)}
                className="relative w-28 h-20 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shrink-0 cursor-pointer group"
              >
                <img
                  src={`/api/camera-snapshot/${latestPopupAlert.cameraId}?t=${liveTimestamp}`}
                  alt={latestPopupAlert.cameraName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 border-2 border-amber-400/70 rounded-lg pointer-events-none" />
                <div className="absolute bottom-1 left-1 right-1 bg-slate-950/85 px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums text-amber-300 truncate">
                  CCTV #{latestPopupAlert.cameraId}
                </div>
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-xs font-semibold text-white truncate">
                  {latestPopupAlert.subjectLabel}
                </div>
                <div className="text-xs text-amber-300 font-medium truncate">
                  Entered FOV: {latestPopupAlert.cameraName}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums">
                  <span>{latestPopupAlert.trafficVolumeAadt.toLocaleString()} AADT</span>
                  <span aria-hidden="true">·</span>
                  <span>Azimuth {latestPopupAlert.fovHeadingDeg}°</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400">
                    {latestPopupAlert.estimatedSpeedMph} MPH
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onOpenCamera(latestPopupAlert.cameraId);
                    onDismissPopupAlert();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Open Live Feed</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onJumpToTrajectory(latestPopupAlert.subjectId);
                    onDismissPopupAlert();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
                >
                  <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Trajectory</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  onAcknowledgeAlert(latestPopupAlert.id);
                  onDismissPopupAlert();
                }}
                className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 whitespace-nowrap"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL / DRAWER: HIGH-TRAFFIC CAMERA FOV NOTIFICATION CENTER
         ===================================================================== */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-amber-400" />
                  <h2 className="text-base sm:text-lg font-semibold text-white">
                    High-Traffic Camera Field-of-View (FOV) Alert Center
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time geofenced optical alerts when a tracked vehicle enters the field of view
                  of a monitored high-volume Las Vegas corridor camera.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleSound}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    soundEnabled
                      ? 'bg-slate-800 border-slate-700 text-slate-200'
                      : 'bg-slate-950 border-slate-800 text-slate-500'
                  }`}
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Alert Chime On</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>Muted</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                  aria-label="Close FOV Alert Center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
              {/* Interactive FOV Entry Simulator / Trigger Bar */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>Test / Trigger High-Traffic Camera FOV Intercept</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Select a tracked vehicle and a specific high-traffic camera node to verify
                      instant FOV entry detection and alert dispatch.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Tracked Vehicle Target
                    </label>
                    <select
                      value={selectedSimSubjectId}
                      onChange={(e) => setSelectedSimSubjectId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      {trackedSubjects.map((subj) => (
                        <option key={subj.id} value={subj.id}>
                          {subj.label} ({subj.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-5">
                    <label className="block text-[11px] text-slate-400 mb-1">
                      High-Traffic Camera Node (FOV Watch)
                    </label>
                    <select
                      value={selectedSimCameraId}
                      onChange={(e) => setSelectedSimCameraId(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      {highTrafficCameras.map((cam) => (
                        <option key={cam.cameraId} value={cam.cameraId}>
                          CCTV #{cam.cameraId} · {cam.cameraName} (
                          {cam.trafficVolumeAadt.toLocaleString()} AADT)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2 pt-4 sm:pt-5">
                    <button
                      type="button"
                      onClick={handleSimulateTrigger}
                      disabled={isTriggering}
                      className="w-full px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isTriggering ? 'Firing...' : 'Trigger Alert'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Monitored High-Traffic Cameras Configuration Grid */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      Armed High-Traffic Corridor Cameras ({monitoredCameraIds.length} of{' '}
                      {highTrafficCameras.length} Monitored)
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                    NDOT AADT Traffic Volume &amp; FOV Cone Geometry
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {highTrafficCameras.map((node) => {
                    const isArmed = monitoredCameraIds.includes(node.cameraId);
                    return (
                      <div
                        key={node.cameraId}
                        onClick={() => onToggleMonitoredCamera(node.cameraId)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isArmed
                            ? 'bg-slate-950 border-amber-500/60'
                            : 'bg-slate-950/40 border-slate-800 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono tabular-nums text-xs font-semibold text-white">
                            CCTV #{node.cameraId}
                          </span>
                          <span
                            className={`text-[11px] font-medium ${
                              isArmed ? 'text-amber-400' : 'text-slate-500'
                            }`}
                          >
                            {isArmed ? 'FOV Armed' : 'Paused'}
                          </span>
                        </div>
                        <div className="text-xs font-medium text-slate-200 truncate mt-0.5">
                          {node.cameraName}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums">
                          <span className="text-amber-300">
                            {node.trafficVolumeAadt.toLocaleString()} AADT
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{node.fovHeadingDeg}° Azimuth</span>
                          <span aria-hidden="true">·</span>
                          <span>{node.fovAngleDeg}° Cone</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chronological FOV Entry Alert Feed */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-slate-200">
                    FOV Entry Alert Log ({alerts.length} Total · {unacknowledgedCount} Unacknowledged)
                  </h3>
                  {unacknowledgedCount > 0 && (
                    <button
                      type="button"
                      onClick={onAcknowledgeAll}
                      className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Acknowledge All ({unacknowledgedCount})</span>
                    </button>
                  )}
                </div>

                {alerts.length === 0 ? (
                  <div className="p-8 rounded-lg bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                    No FOV entry alerts recorded yet. Use the trigger bar above or confirm a
                    sighting on a high-traffic camera.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          alert.acknowledged
                            ? 'bg-slate-950/50 border-slate-800/80 text-slate-400'
                            : 'bg-slate-950 border-amber-500/50 text-slate-100'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {!alert.acknowledged && (
                              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                            )}
                            <span className="font-semibold text-white">{alert.subjectLabel}</span>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span className="text-amber-300 font-medium">
                              Entered FOV of CCTV #{alert.cameraId} ({alert.cameraName})
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
                            <span>{alert.corridor}</span>
                            <span aria-hidden="true">·</span>
                            <span>{alert.trafficVolumeAadt.toLocaleString()} AADT</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              FOV {alert.fovHeadingDeg}° ({alert.fovAngleDeg}° Cone)
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400">
                              Est. {alert.estimatedSpeedMph} MPH
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              onOpenCamera(alert.cameraId);
                              onClose();
                            }}
                            className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium flex items-center gap-1 whitespace-nowrap"
                          >
                            <Eye className="w-3 h-3 text-amber-400" />
                            <span>Live Feed</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onJumpToTrajectory(alert.subjectId);
                              onClose();
                            }}
                            className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium flex items-center gap-1 whitespace-nowrap"
                          >
                            <Navigation className="w-3 h-3 text-emerald-400" />
                            <span>Track</span>
                          </button>

                          {!alert.acknowledged && (
                            <button
                              type="button"
                              onClick={() => onAcknowledgeAlert(alert.id)}
                              className="px-2.5 py-1.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs text-amber-300 font-medium whitespace-nowrap"
                            >
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
