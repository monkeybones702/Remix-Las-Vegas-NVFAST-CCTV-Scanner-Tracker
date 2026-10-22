/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header, NavTabType } from './components/Header';
import { LiveMonitor } from './components/LiveMonitor';
import { PTZMovementScanner } from './components/PTZMovementScanner';
import { CrimeRadarIntelligence } from './components/CrimeRadarIntelligence';
import { CommunityResponseSystem } from './components/CommunityResponseSystem';
import { AIScannerSearch } from './components/AIScannerSearch';
import { TrajectoryTracker } from './components/TrajectoryTracker';
import { CCTVMap } from './components/CCTVMap';
import { CameraDetailModal } from './components/CameraDetailModal';
import { SourceCodeModal } from './components/SourceCodeModal';
import {
  HighTrafficFovNotificationCenter,
  type HighTrafficCameraNodeInfo
} from './components/HighTrafficFovNotificationCenter';
import type { Camera, Detection, TrackedSubject, HighTrafficFovAlert } from './types';
import {
  auth,
  onAuthStateChanged,
  signInWithGooglePopup,
  signOutUser,
  subscribeUserWatchlists,
  saveTrajectoryWatchlistItem,
  archiveTrajectoryWatchlistItem,
  deleteTrajectoryWatchlistItem,
  subscribeUserIncidentLogs,
  createCorridorIncidentLog,
  resolveCorridorIncidentLog,
  deleteCorridorIncidentLog,
  type User,
  type UserWatchlistDoc,
  type UserIncidentLogDoc
} from './firebase';
import { Sparkles, Code, ExternalLink, RefreshCw, Clock, Flame, Newspaper, ShieldCheck } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabType>('monitor');
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [trackedSubjects, setTrackedSubjects] = useState<TrackedSubject[]>([]);
  const [activeTrackingId, setActiveTrackingId] = useState<string | null>('TRK-RED-SUV-01');
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [preselectedPostCamera, setPreselectedPostCamera] = useState<Camera | null>(null);
  const [movingCamerasCount, setMovingCamerasCount] = useState<number>(5);
  const [postsCount, setPostsCount] = useState<number>(3);
  const [correlationCount, setCorrelationCount] = useState<number>(4);
  const [newsCount, setNewsCount] = useState<number>(6);
  const [refreshRate, setRefreshRate] = useState<number>(2500);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [liveTimestamp, setLiveTimestamp] = useState<number>(Date.now());
  const [isScanningCorridor, setIsScanningCorridor] = useState<boolean>(false);
  const [isRefreshingIncidents, setIsRefreshingIncidents] = useState<boolean>(false);
  const [showSourceCodeModal, setShowSourceCodeModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [loadingStage, setLoadingStage] = useState<string>('Initializing incident intelligence...');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [watchlists, setWatchlists] = useState<UserWatchlistDoc[]>([]);
  const [userIncidentLogs, setUserIncidentLogs] = useState<UserIncidentLogDoc[]>([]);

  // High-Traffic Camera FOV Notification System State
  const [fovAlerts, setFovAlerts] = useState<HighTrafficFovAlert[]>([]);
  const [highTrafficCameras, setHighTrafficCameras] = useState<HighTrafficCameraNodeInfo[]>([]);
  const [monitoredCameraIds, setMonitoredCameraIds] = useState<number[]>([
    21603, 100, 24821, 30561, 22611, 104
  ]);
  const [showFovAlertCenter, setShowFovAlertCenter] = useState<boolean>(false);
  const [latestPopupAlert, setLatestPopupAlert] = useState<HighTrafficFovAlert | null>(null);
  const [fovSoundEnabled, setFovSoundEnabled] = useState<boolean>(true);

  const playFovAlertChime = useCallback(() => {
    if (!fovSoundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.11);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Ignore audio context restriction if no user gesture yet
    }
  }, [fovSoundEnabled]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Subscribe to Firebase Authentication state & Firestore collections
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setWatchlists([]);
      setUserIncidentLogs([]);
      return;
    }

    const unsubWatchlists = subscribeUserWatchlists(currentUser.uid, (items) => {
      setWatchlists(items);
    });

    const unsubIncidentLogs = subscribeUserIncidentLogs(currentUser.uid, (items) => {
      setUserIncidentLogs(items);
    });

    return () => {
      unsubWatchlists();
      unsubIncidentLogs();
    };
  }, [currentUser]);

  const handleSignIn = async () => {
    try {
      const user = await signInWithGooglePopup();
      if (user) {
        showToast(`Signed in as ${user.displayName || user.email}`);
      }
    } catch (err) {
      console.error('Google Sign-In failed:', err);
      showToast('Google Sign-In cancelled or failed');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      showToast('Signed out of Firebase Cloud Sync');
    } catch (err) {
      console.error('Sign-Out failed:', err);
    }
  };

  // 1. Update all incidents first before page loads & scan all major news channels
  useEffect(() => {
    async function initializeSystem() {
      setIsLoadingInitial(true);
      setLoadingStage('Updating all incidents & scanning 6 major news channels...');

      try {
        // Parallel execution: update all incidents, scan news, and load cameras
        const [incidentsRes, newsScanRes, camerasRes, detectionsRes, trackedRes] = await Promise.all([
          fetch('/api/incidents/refresh', { method: 'POST' }).then((r) => r.json()).catch(() => null),
          fetch('/api/news/scan', { method: 'POST' }).then((r) => r.json()).catch(() => null),
          fetch('/api/cameras').then((r) => r.json()).catch(() => null),
          fetch('/api/detections').then((r) => r.json()).catch(() => null),
          fetch('/api/track/list').then((r) => r.json()).catch(() => null)
        ]);

        if (camerasRes && camerasRes.cameras) {
          setCameras(camerasRes.cameras);
        }

        if (detectionsRes && detectionsRes.detections) {
          setDetections(detectionsRes.detections);
        }

        if (trackedRes && trackedRes.tracked) {
          setTrackedSubjects(trackedRes.tracked);
          if (trackedRes.tracked.length > 0 && !activeTrackingId) {
            setActiveTrackingId(trackedRes.tracked[0].id);
          }
        }

        if (incidentsRes && incidentsRes.summary) {
          setCorrelationCount(incidentsRes.summary.correlationCount || 4);
          setNewsCount(incidentsRes.summary.newsCount || 6);
          setPostsCount(incidentsRes.summary.socialCount || 3);
        } else if (newsScanRes && newsScanRes.totalScanned) {
          setNewsCount(newsScanRes.totalScanned);
        }
      } catch (err) {
        console.error('Initial pre-load error:', err);
      } finally {
        setIsLoadingInitial(false);
      }
    }

    initializeSystem();
  }, []);

  // Check PTZ and community post counts for header badges periodically
  useEffect(() => {
    const fetchCounters = () => {
      fetch('/api/ptz/status')
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data.totalActiveMoving === 'number') {
            setMovingCamerasCount(data.totalActiveMoving);
          }
        })
        .catch(() => {});

      fetch('/api/posts')
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data.total === 'number') {
            setPostsCount(data.total);
          }
        })
        .catch(() => {});

      fetch('/api/correlation/events')
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data.total === 'number') {
            setCorrelationCount(data.total);
          }
        })
        .catch(() => {});

      fetch('/api/news/scan')
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data.total === 'number') {
            setNewsCount(data.total);
          }
        })
        .catch(() => {});
    };

    const interval = setInterval(fetchCounters, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handler: Manual trigger to update all incidents & scan news
  const handleRefreshAllIncidents = async () => {
    setIsRefreshingIncidents(true);
    try {
      const [incRes, newsRes] = await Promise.all([
        fetch('/api/incidents/refresh', { method: 'POST' }).then((r) => r.json()),
        fetch('/api/news/scan', { method: 'POST' }).then((r) => r.json())
      ]);

      if (incRes && incRes.summary) {
        setCorrelationCount(incRes.summary.correlationCount);
        setNewsCount(incRes.summary.newsCount);
        setPostsCount(incRes.summary.socialCount);
      } else if (newsRes && newsRes.totalScanned) {
        setNewsCount(newsRes.totalScanned);
      }

      showToast('All incidents refreshed across 6 major news channels & scanners. Default sorted by timestamp.');
    } catch (err) {
      console.error('Failed to update incidents:', err);
      showToast('Failed to refresh incident streams');
    } finally {
      setIsRefreshingIncidents(false);
    }
  };

  // 2. Load detections
  const loadDetections = useCallback(() => {
    fetch('/api/detections')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.detections) {
          setDetections(data.detections);
        }
      })
      .catch((err) => console.error('Failed to load detections:', err));
  }, []);

  useEffect(() => {
    loadDetections();
  }, [loadDetections]);

  // 3. Load tracked subjects
  const loadTrackedSubjects = useCallback(() => {
    fetch('/api/track/list')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.tracked) {
          setTrackedSubjects(data.tracked);
          if (data.tracked.length > 0 && !activeTrackingId) {
            setActiveTrackingId(data.tracked[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to load tracked subjects:', err));
  }, [activeTrackingId]);

  useEffect(() => {
    loadTrackedSubjects();
    fetch('/api/fov-alerts')
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          if (Array.isArray(data.highTrafficCameras)) {
            setHighTrafficCameras(data.highTrafficCameras);
          }
          if (Array.isArray(data.alerts)) {
            setFovAlerts(data.alerts);
          }
        }
      })
      .catch(() => {});
  }, [loadTrackedSubjects]);

  const handleTriggerFovAlert = useCallback(
    async (subjectId: string, cameraId: number) => {
      try {
        const res = await fetch('/api/fov-alerts/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subjectId, cameraId })
        });
        const data = await res.json();
        if (data && data.alert) {
          setFovAlerts(data.alerts || [data.alert, ...fovAlerts]);
          if (monitoredCameraIds.includes(data.alert.cameraId)) {
            setLatestPopupAlert(data.alert);
            playFovAlertChime();
          }
          loadTrackedSubjects();
        }
      } catch (err) {
        console.error('FOV alert trigger error:', err);
      }
    },
    [fovAlerts, monitoredCameraIds, playFovAlertChime, loadTrackedSubjects]
  );

  const handleAcknowledgeFovAlert = async (alertId: string) => {
    try {
      const res = await fetch('/api/fov-alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId })
      });
      const data = await res.json();
      if (data && data.alerts) {
        setFovAlerts(data.alerts);
      }
    } catch {
      setFovAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
      );
    }
  };

  const handleAcknowledgeAllFovAlerts = async () => {
    try {
      const res = await fetch('/api/fov-alerts/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgeAll: true })
      });
      const data = await res.json();
      if (data && data.alerts) {
        setFovAlerts(data.alerts);
      }
    } catch {
      setFovAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
    }
  };

  const handleToggleMonitoredCamera = (cameraId: number) => {
    setMonitoredCameraIds((prev) =>
      prev.includes(cameraId) ? prev.filter((id) => id !== cameraId) : [...prev, cameraId]
    );
  };

  // 4. Live frame refresh timer
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setLiveTimestamp(Date.now());
    }, refreshRate);
    return () => clearInterval(interval);
  }, [isPaused, refreshRate]);

  // Handler: Run scan on a specific camera
  const handleRunScan = async (cameraId: number): Promise<Detection[]> => {
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId })
      });
      const data = await res.json();
      if (data && data.detections) {
        setDetections((prev) => [...data.detections, ...prev]);
        showToast(`AI Scan detected ${data.detections.length} objects at CCTV #${cameraId}`);
        return data.detections;
      }
      return [];
    } catch (err: any) {
      console.error('Scan error:', err);
      showToast('Vision scan failed to reach node');
      return [];
    }
  };

  // Handler: Corridor multi-camera scan trigger
  const handleQuickScanCorridor = async () => {
    setIsScanningCorridor(true);
    showToast('Initiating AI Vision Scan across key Las Vegas Strip & Interstate cameras...');
    try {
      // Pick 3 prominent cameras across Strip & I-15
      const targetIds = [21603, 100, 30561];
      for (const id of targetIds) {
        await handleRunScan(id);
      }
      showToast('Corridor visual analysis complete. New detections indexed.');
    } finally {
      setIsScanningCorridor(false);
    }
  };

  // Handler: Track subject
  const handleTrackSubject = async (detection: Detection) => {
    try {
      const res = await fetch('/api/track/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          detectionId: detection.id,
          customLabel: `${detection.color.toUpperCase()} ${detection.subtype.toUpperCase()} (${detection.direction || 'SB'})`
        })
      });
      const data = await res.json();
      if (data && data.trackedSubject) {
        setTrackedSubjects((prev) => [data.trackedSubject, ...prev]);
        setActiveTrackingId(data.trackedSubject.id);
        setActiveTab('tracker');
        showToast(`Now tracking ${data.trackedSubject.label} live across corridor`);
      }
    } catch (err) {
      console.error('Track error:', err);
      showToast('Failed to initialize tracking sequence');
    }
  };

  // Handler: Sighting confirmation at downstream camera
  const handleConfirmSighting = async (trackingId: string, cameraId: number) => {
    const cam = cameras.find((c) => c.id === cameraId);
    if (!cam) return;

    // Scan or log sighting
    const newDet: Detection = {
      id: `det-${cameraId}-${Date.now()}`,
      cameraId: cam.id,
      cameraName: cam.name,
      corridor: cam.corridor,
      lat: cam.lat,
      lng: cam.lng,
      timestamp: new Date().toISOString(),
      category: 'vehicle',
      subtype: 'target',
      color: 'tracked',
      height: 'standard',
      size: 'standard',
      isCyclist: false,
      confidence: 0.95,
      tags: ['trajectory_confirmed', cam.corridor.toLowerCase().replace(/[^a-z0-9]/g, '_')],
      description: `Target sighted downstream passing ${cam.name}`,
      box: { ymin: 420, xmin: 350, ymax: 580, xmax: 480 },
      snapshotUrl: `/api/camera-snapshot/${cam.id}?t=${Date.now()}`
    };

    setTrackedSubjects((prev) =>
      prev.map((subj) => {
        if (subj.id === trackingId) {
          return {
            ...subj,
            lastSeen: newDet.timestamp,
            lastCameraId: cam.id,
            lastCameraName: cam.name,
            sightings: [newDet, ...subj.sightings]
          };
        }
        return subj;
      })
    );

    // If this camera is a monitored High-Traffic Camera, trigger an FOV Entry Alert notification
    if (monitoredCameraIds.includes(cam.id) || highTrafficCameras.some((h) => h.cameraId === cam.id)) {
      await handleTriggerFovAlert(trackingId, cam.id);
    } else {
      showToast(`Target sighted downstream at CCTV #${cam.id} (${cam.name})!`);
    }
  };

  const handleOpenSelectedCameraById = (cameraId: number) => {
    const cam = cameras.find((c) => c.id === cameraId);
    if (cam) {
      setSelectedCamera(cam);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        refreshRate={refreshRate}
        setRefreshRate={setRefreshRate}
        isPaused={isPaused}
        setIsPaused={setIsPaused}
        lastRefreshTime={new Date(liveTimestamp)}
        trackedCount={trackedSubjects.length}
        movingCount={movingCamerasCount}
        postsCount={postsCount}
        correlationCount={correlationCount}
        newsCount={newsCount}
        onQuickScanCorridor={handleQuickScanCorridor}
        isScanningCorridor={isScanningCorridor}
        onRefreshAllIncidents={handleRefreshAllIncidents}
        isRefreshingIncidents={isRefreshingIncidents}
        onOpenSourceCode={() => setShowSourceCodeModal(true)}
        onOpenFovAlerts={() => setShowFovAlertCenter(true)}
        unacknowledgedFovAlertCount={fovAlerts.filter((a) => !a.acknowledged).length}
        currentUser={currentUser}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        cloudSavedCount={watchlists.length + userIncidentLogs.length}
      />

      {/* Main Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {isLoadingInitial ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-lg w-full shadow-2xl space-y-6">
              <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
                <Flame className="w-7 h-7 text-amber-400 animate-pulse" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Nevada FAST Intelligence Matrix
                </h2>
                <p className="text-xs text-amber-400 font-medium mt-1">
                  {loadingStage}
                </p>
              </div>

              {/* Progress checklist steps */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left space-y-2.5 text-xs">
                <div className="flex items-center gap-2.5 text-emerald-400 font-medium">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                  <span>1. Synchronizing &amp; updating all incidents prior to page load</span>
                </div>
                <div className="flex items-center gap-2.5 text-amber-300 font-medium">
                  <Newspaper className="w-4 h-4 flex-shrink-0" />
                  <span>2. Scanning 6 major news channels (8 News Now, FOX5, News 3, 13 Action News, RJ, Sun)</span>
                </div>
                <div className="flex items-center gap-2.5 text-cyan-300 font-medium">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>3. Applying default sorting by timestamp (newest incidents first)</span>
                </div>
                <div className="flex items-center gap-2.5 text-slate-300 font-medium">
                  <RefreshCw className="w-4 h-4 flex-shrink-0 animate-spin-slow" />
                  <span>4. Ingesting 1,238 NV FAST traffic cameras (bugatti.nvfast.org)</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
                <span>NV FAST TMC Command</span>
                <span>•</span>
                <span>Clark County RTC</span>
                <span>•</span>
                <span>Nevada DOT</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'monitor' && (
              <LiveMonitor
                cameras={cameras}
                onSelectCamera={(cam) => setSelectedCamera(cam)}
                onRunScan={handleRunScan}
                onTrackSubject={handleTrackSubject}
                detections={detections}
                liveTimestamp={liveTimestamp}
              />
            )}

            {activeTab === 'ptz' && (
              <PTZMovementScanner
                cameras={cameras}
                onSelectCamera={(cam) => setSelectedCamera(cam)}
                onOpenCommunityPostModal={(cam) => {
                  setPreselectedPostCamera(cam || null);
                  setActiveTab('community');
                }}
                liveTimestamp={liveTimestamp}
              />
            )}

            {activeTab === 'radar' && (
              <CrimeRadarIntelligence
                cameras={cameras}
                onSelectCamera={(cam) => setSelectedCamera(cam)}
                liveTimestamp={liveTimestamp}
              />
            )}

            {activeTab === 'community' && (
              <CommunityResponseSystem
                cameras={cameras}
                onSelectCamera={(cam) => setSelectedCamera(cam)}
                preselectedCamera={preselectedPostCamera}
                onClosePreselected={() => setPreselectedPostCamera(null)}
              />
            )}

            {activeTab === 'search' && (
              <AIScannerSearch
                detections={detections}
                onTrackSubject={handleTrackSubject}
                onOpenCamera={handleOpenSelectedCameraById}
                onTriggerCorridorScan={handleQuickScanCorridor}
                isScanning={isScanningCorridor}
              />
            )}

            {activeTab === 'tracker' && (
              <TrajectoryTracker
                trackedSubjects={trackedSubjects}
                activeTrackingId={activeTrackingId}
                onSelectTrackedSubject={(id) => setActiveTrackingId(id)}
                cameras={cameras}
                onOpenCamera={handleOpenSelectedCameraById}
                onConfirmSightingAtCamera={handleConfirmSighting}
                liveTimestamp={liveTimestamp}
                currentUser={currentUser}
                onSignIn={handleSignIn}
                watchlists={watchlists}
                onSaveWatchlist={async (params) => {
                  await saveTrajectoryWatchlistItem(params);
                  showToast(`Saved ${params.subjectLabel} trajectory prediction to Firestore`);
                }}
                onArchiveWatchlist={async (docId) => {
                  await archiveTrajectoryWatchlistItem(docId);
                  showToast('Archived watchlist item in Firestore');
                }}
                onDeleteWatchlist={async (docId) => {
                  await deleteTrajectoryWatchlistItem(docId);
                  showToast('Deleted watchlist item from Firestore');
                }}
                onOpenFovAlerts={() => setShowFovAlertCenter(true)}
                onTriggerFovAlertForSubject={(subjectId, cameraId) => {
                  handleTriggerFovAlert(subjectId, cameraId);
                }}
              />
            )}

            {activeTab === 'map' && (
              <CCTVMap
                cameras={cameras}
                detections={detections}
                onSelectCamera={(cam) => setSelectedCamera(cam)}
                activeTrackedSubject={trackedSubjects.find((s) => s.id === activeTrackingId)}
                liveTimestamp={liveTimestamp}
                currentUser={currentUser}
                onSignIn={handleSignIn}
                userIncidentLogs={userIncidentLogs}
                onCreateIncidentLog={async (params) => {
                  await createCorridorIncidentLog(params);
                  showToast(`Logged ${params.incidentType} incident at CCTV #${params.cameraId} to Heatmap & Firestore`);
                }}
                onResolveIncidentLog={async (docId) => {
                  await resolveCorridorIncidentLog(docId);
                  showToast('Marked corridor incident as resolved in Firestore');
                }}
                onDeleteIncidentLog={async (docId) => {
                  await deleteCorridorIncidentLog(docId);
                  showToast('Deleted incident log from Firestore');
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Global Persistent Footer with Source Code & External Intel Links */}
      <footer className="bg-slate-900/90 border-t border-slate-800 text-xs text-slate-400 py-4 px-4 sm:px-6 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center flex-wrap gap-2 text-[11px]">
            <span className="font-semibold text-slate-300">Las Vegas NV FAST CCTV System</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-amber-300">
              <Clock className="w-3 h-3" />
              Incidents Default: Timestamp (Newest First)
            </span>
            <span>•</span>
            <a
              href="https://bugatti.nvfast.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-amber-400 underline underline-offset-2 flex items-center gap-1"
            >
              <span>NV FAST Snapshots (bugatti.nvfast.org)</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSourceCodeModal(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-700 rounded text-xs font-medium transition-colors"
            >
              <Code className="w-3.5 h-3.5" />
              <span>Source Code &amp; Outside Source Links</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Source Code & Attribution Verification Modal */}
      <SourceCodeModal
        isOpen={showSourceCodeModal}
        onClose={() => setShowSourceCodeModal(false)}
      />

      {/* Camera Full View & Snapshot History Modal */}
      {selectedCamera && (
        <CameraDetailModal
          camera={selectedCamera}
          onClose={() => setSelectedCamera(null)}
          onTrackSubject={handleTrackSubject}
          onRunScan={handleRunScan}
          onOpenCommunityPostModal={(cam) => {
            setPreselectedPostCamera(cam);
            setSelectedCamera(null);
            setActiveTab('community');
          }}
          initialDetections={detections.filter((d) => d.cameraId === selectedCamera.id)}
          historyTimestamp={liveTimestamp}
        />
      )}

      {/* High-Traffic Camera FOV Notification System */}
      <HighTrafficFovNotificationCenter
        isOpen={showFovAlertCenter}
        onClose={() => setShowFovAlertCenter(false)}
        alerts={fovAlerts}
        highTrafficCameras={highTrafficCameras}
        monitoredCameraIds={monitoredCameraIds}
        onToggleMonitoredCamera={handleToggleMonitoredCamera}
        trackedSubjects={trackedSubjects}
        onTriggerFovAlert={handleTriggerFovAlert}
        onAcknowledgeAlert={handleAcknowledgeFovAlert}
        onAcknowledgeAll={handleAcknowledgeAllFovAlerts}
        onOpenCamera={handleOpenSelectedCameraById}
        onJumpToTrajectory={(subjectId) => {
          setActiveTrackingId(subjectId);
          setActiveTab('tracker');
        }}
        soundEnabled={fovSoundEnabled}
        onToggleSound={() => setFovSoundEnabled((v) => !v)}
        latestPopupAlert={latestPopupAlert}
        onDismissPopupAlert={() => setLatestPopupAlert(null)}
        liveTimestamp={liveTimestamp}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 border border-amber-500/80 text-amber-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-medium animate-in slide-in-from-bottom-3 duration-200">
          <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
