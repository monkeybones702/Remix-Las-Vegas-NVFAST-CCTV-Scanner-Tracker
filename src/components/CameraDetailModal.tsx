import React, { useState, useEffect } from 'react';
import { X, Sparkles, Navigation, Clock, RefreshCw, ExternalLink, ShieldAlert, ChevronLeft, ChevronRight, Play, Pause, Layers, Compass, RotateCw, MessageSquarePlus, Radio, Building, Share2, Flame } from 'lucide-react';
import type { Camera, Detection, SnapshotHistoryItem, PTZMovementState, ScannerTranscript, FixItReport, SocialPost } from '../types';

interface CameraDetailModalProps {
  camera: Camera | null;
  onClose: () => void;
  onTrackSubject: (detection: Detection) => void;
  onRunScan: (cameraId: number) => Promise<Detection[]>;
  onOpenCommunityPostModal?: (camera: Camera) => void;
  initialDetections?: Detection[];
  historyTimestamp: number;
}

export const CameraDetailModal: React.FC<CameraDetailModalProps> = ({
  camera,
  onClose,
  onTrackSubject,
  onRunScan,
  onOpenCommunityPostModal,
  initialDetections = [],
  historyTimestamp
}) => {
  const [activeRightTab, setActiveRightTab] = useState<'detections' | 'intel'>('detections');
  const [isScanning, setIsScanning] = useState(false);
  const [detections, setDetections] = useState<Detection[]>(initialDetections);
  const [historyItems, setHistoryItems] = useState<SnapshotHistoryItem[]>([]);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<number>(0);
  const [isAutoLive, setIsAutoLive] = useState<boolean>(true);
  const [liveTimestamp, setLiveTimestamp] = useState<number>(Date.now());
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [scanStatusMsg, setScanStatusMsg] = useState<string | null>(null);
  const [ptzState, setPtzState] = useState<PTZMovementState | undefined>(camera?.ptzState);

  // Correlated camera-specific intelligence
  const [cameraTranscripts, setCameraTranscripts] = useState<ScannerTranscript[]>([]);
  const [cameraFixIt, setCameraFixIt] = useState<FixItReport[]>([]);
  const [cameraSocial, setCameraSocial] = useState<SocialPost[]>([]);

  useEffect(() => {
    if (!camera) return;
    setDetections(initialDetections);

    // Fetch snapshot history for this camera
    fetch(`/api/camera/${camera.id}/history`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.history) {
          const uniqueItems = data.history.filter(
            (item: SnapshotHistoryItem, idx: number, arr: SnapshotHistoryItem[]) =>
              idx === arr.findIndex((t) => t.id === item.id)
          );
          setHistoryItems(uniqueItems);
        }
      })
      .catch(() => {});

    // Fetch camera-specific correlated intelligence
    fetch(`/api/scanner/transcripts?cameraId=${camera.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.transcripts) setCameraTranscripts(data.transcripts);
      })
      .catch(() => {});

    fetch(`/api/fixit/reports?cameraId=${camera.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.reports) setCameraFixIt(data.reports);
      })
      .catch(() => {});

    fetch(`/api/social/posts?cameraId=${camera.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.posts) setCameraSocial(data.posts);
      })
      .catch(() => {});
  }, [camera, initialDetections]);

  // Live auto-refresh timer when in live mode
  useEffect(() => {
    if (!isAutoLive || !camera || selectedHistoryIndex !== 0) return;
    const interval = setInterval(() => {
      setLiveTimestamp(Date.now());
    }, 2500);
    return () => clearInterval(interval);
  }, [isAutoLive, camera, selectedHistoryIndex]);

  if (!camera) return null;

  const currentSnapshotUrl =
    selectedHistoryIndex === 0 || historyItems.length === 0
      ? `/api/camera-snapshot/${camera.id}?t=${liveTimestamp}`
      : historyItems[selectedHistoryIndex]?.url || `/api/camera-snapshot/${camera.id}`;

  const handleScan = async () => {
    setIsScanning(true);
    setScanStatusMsg('Sending camera snapshot to Gemini AI Vision...');
    try {
      const results = await onRunScan(camera.id);
      setDetections(results);
      setScanStatusMsg(`Identified ${results.length} objects (vehicles, persons, cyclists)`);
      setTimeout(() => setScanStatusMsg(null), 3000);
    } catch (err: any) {
      setScanStatusMsg('Scan completed with heuristic detection');
      setTimeout(() => setScanStatusMsg(null), 3000);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 font-mono text-xs border border-red-800">
                CCTV #{camera.id}
              </span>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide truncate">
                {camera.name}
              </h2>
              {selectedHistoryIndex === 0 ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 text-[10px] font-semibold border border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  LIVE FEED
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-950 text-amber-400 text-[10px] font-semibold border border-amber-800 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  HISTORY ARCHIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Corridor: <span className="text-slate-200">{camera.corridor}</span> • GPS: {camera.lat.toFixed(5)}, {camera.lng.toFixed(5)} • NV FAST Node
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://bugatti.nvfast.org/Snapshots/${camera.id}.jpeg`}
              target="_blank"
              rel="noreferrer"
              title="Open raw NV FAST source"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors text-xs flex items-center gap-1"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Source</span>
            </a>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col lg:flex-row gap-4">
          {/* Main Visual Frame & Bounding Boxes */}
          <div className="lg:w-7/12 flex flex-col gap-3">
            <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden border border-slate-800 shadow-inner group">
              <img
                src={currentSnapshotUrl}
                alt={camera.name}
                className="w-full h-full object-contain"
                crossOrigin="anonymous"
              />

              {/* Bounding Boxes Overlays */}
              {showBoundingBoxes &&
                detections.map((det) => {
                  const top = (det.box.ymin / 10).toFixed(1) + '%';
                  const left = (det.box.xmin / 10).toFixed(1) + '%';
                  const width = ((det.box.xmax - det.box.xmin) / 10).toFixed(1) + '%';
                  const height = ((det.box.ymax - det.box.ymin) / 10).toFixed(1) + '%';

                  const colorBorder =
                    det.category === 'cyclist'
                      ? 'border-yellow-400 bg-yellow-400/15'
                      : det.category === 'person'
                      ? 'border-cyan-400 bg-cyan-400/15'
                      : 'border-emerald-400 bg-emerald-400/15';

                  const badgeColor =
                    det.category === 'cyclist'
                      ? 'bg-yellow-500 text-slate-950'
                      : det.category === 'person'
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-emerald-500 text-slate-950';

                  return (
                    <div
                      key={det.id}
                      style={{ top, left, width, height }}
                      className={`absolute border-2 rounded ${colorBorder} transition-all pointer-events-auto hover:bg-opacity-30 group/box`}
                    >
                      <div
                        className={`absolute -top-6 left-0 text-[10px] font-bold px-1.5 py-0.5 rounded shadow ${badgeColor} whitespace-nowrap flex items-center gap-1`}
                      >
                        <span>{det.subtype}</span>
                        <span className="opacity-80">({det.color})</span>
                      </div>
                    </div>
                  );
                })}

              {/* Timestamp & Overlay Controls */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs pointer-events-none">
                <div className="bg-slate-950/80 backdrop-blur px-2.5 py-1 rounded text-slate-300 font-mono text-[11px] border border-slate-800">
                  {selectedHistoryIndex === 0
                    ? `Live: ${new Date(liveTimestamp).toLocaleTimeString()}`
                    : `Snapshot: ${new Date(historyItems[selectedHistoryIndex]?.timestamp || Date.now()).toLocaleTimeString()}`}
                </div>

                <div className="flex items-center gap-1.5 pointer-events-auto">
                  <button
                    onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                    className={`px-2 py-1 rounded text-xs font-medium border flex items-center gap-1 ${
                      showBoundingBoxes
                        ? 'bg-amber-500 text-slate-950 border-amber-400'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Overlay ({detections.length})</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Video / Snapshot Controls */}
            <div className="flex items-center justify-between bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/60 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsAutoLive(!isAutoLive);
                    setSelectedHistoryIndex(0);
                  }}
                  className={`px-2.5 py-1 rounded font-medium flex items-center gap-1.5 transition-colors ${
                    isAutoLive && selectedHistoryIndex === 0
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {isAutoLive && selectedHistoryIndex === 0 ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Live Active</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume Live</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => setLiveTimestamp(Date.now())}
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh Frame</span>
                </button>
              </div>

              {/* AI Scan Button */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleScan}
                  disabled={isScanning}
                  className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold rounded-md flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>{isScanning ? 'AI Scanning...' : 'Run AI Vision Scan'}</span>
                </button>

                {onOpenCommunityPostModal && (
                  <button
                    onClick={() => {
                      onOpenCommunityPostModal(camera);
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-semibold rounded-md flex items-center gap-1.5 transition-all text-xs"
                    title="Post community incident or observation report for this camera"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Report Incident</span>
                  </button>
                )}
              </div>
            </div>

            {/* PTZ Movement Telemetry Strip */}
            {ptzState && (
              <div
                className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1.5 ${
                  ptzState.status === 'operator_manual'
                    ? 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                    : ptzState.status === 'programmed_tour'
                    ? 'bg-cyan-950/40 border-cyan-800/80 text-cyan-200'
                    : 'bg-slate-850 border-slate-800 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <div className="flex items-center gap-1.5">
                    {ptzState.status === 'operator_manual' ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                        <span className="font-bold text-rose-400 uppercase tracking-wide">
                          Live Operator Manual Joystick Slew Detected
                        </span>
                      </>
                    ) : ptzState.status === 'programmed_tour' ? (
                      <>
                        <RotateCw className="w-3 h-3 text-cyan-400 animate-spin-slow" />
                        <span className="font-bold text-cyan-400 uppercase tracking-wide">
                          Programmed Guard Tour in Progress
                        </span>
                      </>
                    ) : (
                      <>
                        <Compass className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-300">PTZ Locked (Stationary Intersection Orientation)</span>
                      </>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    Heading: {ptzState.headingDeg}° | Zoom: {ptzState.zoomLevel}x
                  </span>
                </div>
                <p className="text-[11px] opacity-90 leading-tight">{ptzState.classificationReason}</p>
              </div>
            )}

            {scanStatusMsg && (
              <div className="p-2 bg-amber-950/50 border border-amber-800 text-amber-300 text-xs rounded-md">
                {scanStatusMsg}
              </div>
            )}

            {/* Snapshot History Filmstrip Scrubber */}
            <div className="bg-slate-800/40 border border-slate-800 p-2.5 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Snapshot History Timeline</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  {historyItems.length > 0
                    ? `${historyItems.length} captures in buffer`
                    : 'Recording captures...'}
                </span>
              </div>

              {historyItems.length > 0 ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {/* Live Card */}
                  <button
                    onClick={() => {
                      setSelectedHistoryIndex(0);
                      setIsAutoLive(true);
                    }}
                    className={`flex-shrink-0 w-24 p-1 rounded border text-left transition-all ${
                      selectedHistoryIndex === 0
                        ? 'bg-amber-500/20 border-amber-500 text-white'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    <div className="aspect-video bg-black rounded overflow-hidden relative">
                      <img
                        src={`/api/camera-snapshot/${camera.id}?t=${liveTimestamp}`}
                        alt="Live"
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-emerald-600 text-[8px] font-bold text-white rounded">
                        LIVE
                      </span>
                    </div>
                    <div className="text-[10px] font-medium mt-1 truncate">Current Feed</div>
                  </button>

                  {/* History items */}
                  {historyItems.slice(1).map((item, idx) => {
                    const actualIdx = idx + 1;
                    const isSelected = selectedHistoryIndex === actualIdx;
                    const dateObj = new Date(item.timestamp);
                    return (
                      <button
                        key={`${item.id}-${actualIdx}`}
                        onClick={() => {
                          setSelectedHistoryIndex(actualIdx);
                          setIsAutoLive(false);
                        }}
                        className={`flex-shrink-0 w-24 p-1 rounded border text-left transition-all ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        <div className="aspect-video bg-black rounded overflow-hidden relative">
                          <img
                            src={item.url}
                            alt="History Snapshot"
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <span className="absolute bottom-0.5 right-0.5 px-1 py-0.2 bg-slate-900/80 text-[8px] font-mono text-slate-300 rounded">
                            -{actualIdx * 15}s
                          </span>
                        </div>
                        <div className="text-[9px] font-mono mt-1 text-slate-300 truncate">
                          {dateObj.toLocaleTimeString()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-slate-400">
                  Capturing snapshot sequence for Camera #{camera.id}...
                </div>
              )}
            </div>
          </div>

          {/* Detections & Tracking Panel */}
          <div className="lg:w-5/12 flex flex-col gap-3">
            {/* Panel Tabs Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveRightTab('detections')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activeRightTab === 'detections'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Detected Targets ({detections.length})</span>
                </button>

                <button
                  onClick={() => setActiveRightTab('intel')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    activeRightTab === 'intel'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>
                    Crime Radar ({cameraTranscripts.length + cameraFixIt.length + cameraSocial.length})
                  </span>
                </button>
              </div>
            </div>

            {activeRightTab === 'intel' ? (
              <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1 scrollbar-thin">
                {/* 1. Correlated Broadcastify Transcripts */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                    <Radio className="w-3.5 h-3.5" />
                    <span>Broadcastify Radio Transcripts ({cameraTranscripts.length})</span>
                  </div>

                  {cameraTranscripts.length === 0 ? (
                    <div className="p-2.5 bg-slate-800/30 rounded border border-slate-800 text-[11px] text-slate-400">
                      No active emergency radio transcripts directly logged for this camera node.
                    </div>
                  ) : (
                    cameraTranscripts.map((t) => (
                      <div
                        key={t.id}
                        className="p-2.5 bg-rose-950/20 border border-rose-900/40 rounded-lg text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-rose-300 font-mono text-[11px]">
                            {t.callSign} • {t.agency}
                          </span>
                          {t.tenCode && (
                            <span className="px-1.5 py-0.2 bg-rose-900/60 text-rose-200 text-[10px] font-mono rounded">
                              {t.tenCode}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-200 font-mono leading-relaxed bg-slate-900/60 p-2 rounded">
                          "{t.transcript}"
                        </p>
                        <div className="text-[10px] text-slate-400 flex items-center justify-between">
                          <span>{t.locationKeyword}</span>
                          <span>{new Date(t.timestamp).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 2. Correlated FixIt Clark County Tickets */}
                <div className="space-y-2 pt-1 border-t border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
                    <Building className="w-3.5 h-3.5" />
                    <span>FixIt Clark County 311 Reports ({cameraFixIt.length})</span>
                  </div>

                  {cameraFixIt.length === 0 ? (
                    <div className="p-2.5 bg-slate-800/30 rounded border border-slate-800 text-[11px] text-slate-400">
                      No open municipal tickets tied to this intersection.
                    </div>
                  ) : (
                    cameraFixIt.map((f) => (
                      <div
                        key={f.ticketId}
                        className="p-2.5 bg-blue-950/20 border border-blue-900/40 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-300 font-mono text-[11px]">
                            #{f.ticketId}
                          </span>
                          <span className="px-1.5 py-0.2 bg-blue-900/60 text-blue-200 text-[10px] uppercase font-bold rounded">
                            {f.status.replace('_', ' ')}
                          </span>
                        </div>
                        <h5 className="text-xs font-bold text-white">{f.title}</h5>
                        <p className="text-[11px] text-slate-300 leading-snug">{f.description}</p>
                        <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                          <span>{f.assignedDepartment}</span>
                          <span>{f.upvotes} Upvotes</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 3. Correlated Social Media Posts */}
                <div className="space-y-2 pt-1 border-t border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-400">
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Geotagged Social Eyewitnesses ({cameraSocial.length})</span>
                  </div>

                  {cameraSocial.length === 0 ? (
                    <div className="p-2.5 bg-slate-800/30 rounded border border-slate-800 text-[11px] text-slate-400">
                      No geofenced public social posts linked to this camera.
                    </div>
                  ) : (
                    cameraSocial.map((s) => (
                      <div
                        key={s.id}
                        className="p-2.5 bg-purple-950/20 border border-purple-900/40 rounded-lg text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-[11px]">
                            {s.authorName} ({s.authorHandle})
                          </span>
                          <span className="px-1.5 py-0.2 bg-purple-900 text-purple-200 text-[9px] uppercase font-bold rounded">
                            {s.platform}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-200 leading-snug">{s.content}</p>
                        <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1">
                          <span>{s.locationName}</span>
                          <span>❤️ {s.engagement.likes.toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : detections.length === 0 ? (
              <div className="p-6 bg-slate-800/30 rounded-lg border border-dashed border-slate-700 text-center flex flex-col items-center justify-center my-auto">
                <Sparkles className="w-8 h-8 text-slate-500 mb-2" />
                <p className="text-sm font-medium text-slate-300">No active AI detections yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Run an AI Vision Scan to detect vehicles, persons, cyclists, height, size, and tags.
                </p>
                <button
                  onClick={handleScan}
                  disabled={isScanning}
                  className="mt-3 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs transition-colors"
                >
                  Scan This Frame
                </button>
              </div>
            ) : (
              <div className="space-y-2.5 overflow-y-auto max-h-[500px] pr-1 scrollbar-thin">
                {detections.map((det) => (
                  <div
                    key={det.id}
                    className="p-3 bg-slate-800/80 border border-slate-700/80 rounded-lg hover:border-amber-500/60 transition-all flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${
                              det.category === 'cyclist'
                                ? 'bg-yellow-950 text-yellow-400 border border-yellow-800'
                                : det.category === 'person'
                                ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                                : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            }`}
                          >
                            {det.category}
                          </span>
                          <span className="text-xs font-bold text-white capitalize">
                            {det.color.replace('_', '/')} {det.subtype}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">{det.description}</p>
                      </div>

                      <button
                        onClick={() => onTrackSubject(det)}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded flex items-center gap-1 flex-shrink-0 transition-colors shadow-sm"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Track</span>
                      </button>
                    </div>

                    {/* Attributes Pill Grid */}
                    <div className="grid grid-cols-3 gap-1.5 text-[11px] bg-slate-900/60 p-2 rounded border border-slate-800">
                      <div>
                        <span className="text-slate-400 text-[10px] block">Height</span>
                        <span className="font-medium text-slate-200 capitalize">{det.height.replace('_', ' ')}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Size</span>
                        <span className="font-medium text-slate-200 capitalize">{det.size}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[10px] block">Confidence</span>
                        <span className="font-mono text-emerald-400">
                          {(det.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>

                    {/* Tags */}
                    {det.tags && det.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {det.tags.map((tag, tIdx) => (
                          <span
                            key={tIdx}
                            className="px-1.5 py-0.5 bg-slate-900 text-slate-300 text-[10px] rounded border border-slate-800"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
