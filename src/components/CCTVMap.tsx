import React, { useState, useEffect, useMemo } from 'react';
import {
  Eye,
  Layers,
  Flame,
  Activity,
  Cloud,
  LogIn,
  PlusCircle,
  CheckCircle2,
  Trash2,
  GitBranch
} from 'lucide-react';
import type {
  Camera as CameraType,
  TrackedSubject,
  Detection,
  CrossCorrelationEvent,
  NewsChannelItem,
  ScannerTranscript,
  FixItReport,
  SocialPost
} from '../types';
import type { User, UserIncidentLogDoc } from '../firebase';

interface CCTVMapProps {
  cameras: CameraType[];
  detections?: Detection[];
  onSelectCamera: (camera: CameraType) => void;
  activeTrackedSubject?: TrackedSubject | null;
  liveTimestamp: number;
  currentUser?: User | null;
  onSignIn?: () => void;
  userIncidentLogs?: UserIncidentLogDoc[];
  onCreateIncidentLog?: (params: {
    cameraId: number;
    cameraName: string;
    corridor: string;
    lat: number;
    lng: number;
    incidentType: 'collision' | 'congestion' | 'hazard' | 'police_activity' | 'pedestrian_density';
    severity: 'low' | 'moderate' | 'high' | 'critical';
    description: string;
  }) => Promise<void>;
  onResolveIncidentLog?: (docId: string) => Promise<void>;
  onDeleteIncidentLog?: (docId: string) => Promise<void>;
}

interface HeatmapCluster {
  id: string;
  name: string;
  corridor: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
  primaryCamera: CameraType;
  incidentCount: number;
  detectionCount: number;
  cameraNodeCount: number;
  incidentScore: number;
  detectionScore: number;
  combinedIntensity: number; // 0..100
  activeIntensity: number; // 0..100 based on selected heatmapMode
}

export const CCTVMap: React.FC<CCTVMapProps> = ({
  cameras,
  detections = [],
  onSelectCamera,
  activeTrackedSubject,
  liveTimestamp,
  currentUser,
  onSignIn,
  userIncidentLogs = [],
  onCreateIncidentLog,
  onResolveIncidentLog,
  onDeleteIncidentLog
}) => {
  const [selectedCorridor, setSelectedCorridor] = useState('All');
  const [hoveredCamera, setHoveredCamera] = useState<CameraType | null>(null);
  const [selectedPinCamera, setSelectedPinCamera] = useState<CameraType | null>(null);
  const [selectedHotspot, setSelectedHotspot] = useState<HeatmapCluster | null>(null);

  // Heatmap overlay controls
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [heatmapMode, setHeatmapMode] = useState<'combined' | 'incidents' | 'detections'>('combined');
  const [heatmapRadius, setHeatmapRadius] = useState<50 | 75 | 105>(75);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.85);
  const [showHotspotLabels, setShowHotspotLabels] = useState<boolean>(true);

  // Live incident data fetched from backend endpoints for heatmap aggregation
  const [correlationEvents, setCorrelationEvents] = useState<CrossCorrelationEvent[]>([]);
  const [newsAlerts, setNewsAlerts] = useState<NewsChannelItem[]>([]);
  const [scannerTranscripts, setScannerTranscripts] = useState<ScannerTranscript[]>([]);
  const [fixItReports, setFixItReports] = useState<FixItReport[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialPost[]>([]);

  // Cloud Incident Logger Form State
  const [logCameraId, setLogCameraId] = useState<number>(21603);
  const [logIncidentType, setLogIncidentType] = useState<
    'collision' | 'congestion' | 'hazard' | 'police_activity' | 'pedestrian_density'
  >('congestion');
  const [logSeverity, setLogSeverity] = useState<'low' | 'moderate' | 'high' | 'critical'>('high');
  const [logDescription, setLogDescription] = useState<string>('');
  const [isSubmittingLog, setIsSubmittingLog] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    const fetchIncidentStreams = () => {
      Promise.all([
        fetch('/api/correlation/events').then((r) => r.json()).catch(() => null),
        fetch('/api/news/scan').then((r) => r.json()).catch(() => null),
        fetch('/api/scanner/transcripts').then((r) => r.json()).catch(() => null),
        fetch('/api/fixit/reports').then((r) => r.json()).catch(() => null),
        fetch('/api/social/posts').then((r) => r.json()).catch(() => null)
      ]).then(([corr, news, scan, fixit, social]) => {
        if (!mounted) return;
        if (corr?.events) setCorrelationEvents(corr.events);
        if (news?.news) setNewsAlerts(news.news);
        if (scan?.transcripts) setScannerTranscripts(scan.transcripts);
        if (fixit?.reports) setFixItReports(fixit.reports);
        if (social?.posts) setSocialPosts(social.posts);
      });
    };

    fetchIncidentStreams();
    const interval = setInterval(fetchIncidentStreams, 12000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Compute bounding box for Las Vegas coordinates
  const bounds = useMemo(() => {
    return {
      minLat: 35.98,
      maxLat: 36.26,
      minLng: -115.32,
      maxLng: -115.06
    };
  }, []);

  const projectCoord = (lat: number, lng: number) => {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 1000;
    const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 700;
    return { x: Math.max(24, Math.min(976, x)), y: Math.max(24, Math.min(676, y)) };
  };

  const filteredCameras = useMemo(() => {
    if (selectedCorridor === 'All') return cameras;
    return cameras.filter((c) => c.corridor.toLowerCase().includes(selectedCorridor.toLowerCase()));
  }, [cameras, selectedCorridor]);

  // Aggregate Incident Frequency & Detection Density into Spatial Heatmap Clusters
  const heatmapClusters = useMemo<HeatmapCluster[]>(() => {
    if (cameras.length === 0) return [];

    // Define major Las Vegas corridor anchor zones + dynamic camera clustering
    const anchorZones = [
      {
        id: 'zone-bellagio-strip',
        name: 'Las Vegas Blvd & Bellagio / Flamingo Core',
        corridor: 'Las Vegas Blvd (The Strip)',
        lat: 36.1126,
        lng: -115.1767,
        defaultCamId: 21603,
        baseDetections: 14,
        baseIncidents: 3
      },
      {
        id: 'zone-tropicana-strip',
        name: 'Las Vegas Blvd & Tropicana / MGM Resort Zone',
        corridor: 'Las Vegas Blvd (The Strip)',
        lat: 36.1008,
        lng: -115.1722,
        defaultCamId: 24821,
        baseDetections: 11,
        baseIncidents: 2
      },
      {
        id: 'zone-i15-spaghetti',
        name: 'I-15 / US-95 / I-515 Interchange (Spaghetti Bowl)',
        corridor: 'I-15 Interstate',
        lat: 36.175,
        lng: -115.148,
        defaultCamId: 100,
        baseDetections: 13,
        baseIncidents: 3
      },
      {
        id: 'zone-i15-sahara',
        name: 'I-15 Northbound & Sahara Ave Arterial',
        corridor: 'I-15 Interstate',
        lat: 36.1442,
        lng: -115.1618,
        defaultCamId: 104,
        baseDetections: 10,
        baseIncidents: 2
      },
      {
        id: 'zone-fremont-downtown',
        name: 'Downtown / Fremont & Casino Center Hub',
        corridor: 'Downtown / Fremont',
        lat: 36.1699,
        lng: -115.1422,
        defaultCamId: 30561,
        baseDetections: 9,
        baseIncidents: 2
      },
      {
        id: 'zone-beltway-windmill',
        name: 'CC-215 South Beltway & Windmill / Eastern',
        corridor: 'CC-215 / I-215 Beltway',
        lat: 36.0415,
        lng: -115.1188,
        defaultCamId: 23051,
        baseDetections: 8,
        baseIncidents: 1
      },
      {
        id: 'zone-airport-connector',
        name: 'Harry Reid Airport Connector & Paradise Rd',
        corridor: 'Airport / Paradise',
        lat: 36.084,
        lng: -115.1537,
        defaultCamId: 24821,
        baseDetections: 9,
        baseIncidents: 1
      },
      {
        id: 'zone-summerlin-west',
        name: 'CC-215 West Beltway / Summerlin Parkway',
        corridor: 'CC-215 / I-215 Beltway',
        lat: 36.162,
        lng: -115.288,
        defaultCamId: 100,
        baseDetections: 7,
        baseIncidents: 1
      }
    ];

    const rawClusters = anchorZones.map((zone) => {
      // Find cameras within ~0.045 deg radius of zone center
      const nearbyCams = cameras.filter(
        (c) => Math.hypot(c.lat - zone.lat, c.lng - zone.lng) <= 0.048
      );
      const primaryCam =
        cameras.find((c) => c.id === zone.defaultCamId) ||
        nearbyCams[0] ||
        cameras[0];

      const camIds = new Set<number>(nearbyCams.map((c) => c.id));
      camIds.add(zone.defaultCamId);

      // Count live incidents mapped to this zone
      const corrHits = correlationEvents.filter(
        (e) =>
          camIds.has(e.nearestCameraId) ||
          Math.hypot(zone.lat - primaryCam.lat, zone.lng - primaryCam.lng) < 0.02
      ).length;

      const newsHits = newsAlerts.filter(
        (n) => (n.nearestCameraId && camIds.has(n.nearestCameraId))
      ).length;

      const scannerHits = scannerTranscripts.filter(
        (t) =>
          (typeof t.correlatedCameraId === 'number' && camIds.has(t.correlatedCameraId)) ||
          (typeof t.lat === 'number' &&
            typeof t.lng === 'number' &&
            Math.hypot(t.lat - zone.lat, t.lng - zone.lng) <= 0.045)
      ).length;

      const fixItHits = fixItReports.filter(
        (f) =>
          camIds.has(f.nearestCameraId) ||
          Math.hypot(f.lat - zone.lat, f.lng - zone.lng) <= 0.045
      ).length;

      const socialHits = socialPosts.filter(
        (s) =>
          camIds.has(s.nearestCameraId) ||
          Math.hypot(s.lat - zone.lat, s.lng - zone.lng) <= 0.045
      ).length;

      const cloudLogHits = userIncidentLogs.filter(
        (l) =>
          l.status === 'active' &&
          (camIds.has(l.cameraId) || Math.hypot(l.lat - zone.lat, l.lng - zone.lng) <= 0.05)
      ).length;

      const liveDetectionHits = detections.filter(
        (d) =>
          camIds.has(d.cameraId) ||
          Math.hypot(d.lat - zone.lat, d.lng - zone.lng) <= 0.045
      ).length;

      const incidentCount =
        zone.baseIncidents +
        corrHits +
        newsHits +
        scannerHits +
        fixItHits +
        socialHits +
        cloudLogHits * 2;

      const detectionCount =
        zone.baseDetections +
        liveDetectionHits * 2 +
        Math.round(nearbyCams.length * 0.12);

      const incidentScore = Math.min(100, Math.round(incidentCount * 7.5));
      const detectionScore = Math.min(100, Math.round(detectionCount * 3.2));
      const combinedIntensity = Math.min(
        100,
        Math.round(incidentScore * 0.55 + detectionScore * 0.45)
      );

      const activeIntensity =
        heatmapMode === 'incidents'
          ? incidentScore
          : heatmapMode === 'detections'
          ? detectionScore
          : combinedIntensity;

      const pt = projectCoord(zone.lat, zone.lng);

      return {
        id: zone.id,
        name: zone.name,
        corridor: zone.corridor,
        lat: zone.lat,
        lng: zone.lng,
        x: pt.x,
        y: pt.y,
        primaryCamera: primaryCam,
        incidentCount,
        detectionCount,
        cameraNodeCount: Math.max(12, nearbyCams.length),
        incidentScore,
        detectionScore,
        combinedIntensity,
        activeIntensity
      };
    });

    return rawClusters
      .filter((cluster) => {
        if (selectedCorridor === 'All') return true;
        return cluster.corridor.toLowerCase().includes(selectedCorridor.toLowerCase());
      })
      .sort((a, b) => b.activeIntensity - a.activeIntensity);
  }, [
    cameras,
    detections,
    correlationEvents,
    newsAlerts,
    scannerTranscripts,
    fixItReports,
    socialPosts,
    userIncidentLogs,
    heatmapMode,
    selectedCorridor
  ]);

  // Trajectory points & visual prediction line for activeTrackedSubject on main map
  const trajectoryData = useMemo(() => {
    if (!activeTrackedSubject || !activeTrackedSubject.sightings || activeTrackedSubject.sightings.length === 0) {
      return null;
    }

    const chronological = [...activeTrackedSubject.sightings]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map((s) => {
        const pt = projectCoord(s.lat, s.lng);
        return {
          ...pt,
          cameraId: s.cameraId,
          cameraName: s.cameraName,
          timestamp: s.timestamp
        };
      });

    const latest = chronological[chronological.length - 1];
    const prev = chronological.length > 1 ? chronological[chronological.length - 2] : null;
    const dx = prev ? latest.x - prev.x : -15;
    const dy = prev ? latest.y - prev.y : 45;
    const mag = Math.hypot(dx, dy) || 1;
    const ux = dx / mag;
    const uy = dy / mag;

    const predictedCamPoints = (activeTrackedSubject.predictedNextCameraIds || [])
      .map((id) => cameras.find((c) => c.id === id))
      .filter((c): c is CameraType => Boolean(c))
      .slice(0, 2)
      .map((c) => {
        const pt = projectCoord(c.lat, c.lng);
        return { ...pt, id: c.id, name: c.name };
      });

    const predictionChain = [
      { x: latest.x, y: latest.y },
      ...predictedCamPoints.map((p) => ({ x: p.x, y: p.y })),
      {
        x: Math.max(30, Math.min(970, latest.x + ux * 110)),
        y: Math.max(30, Math.min(670, latest.y + uy * 110))
      }
    ];

    return {
      chronological,
      predictedCamPoints,
      predictionChain
    };
  }, [activeTrackedSubject, cameras]);

  const handleCreateCloudIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateIncidentLog || !logDescription.trim()) return;
    const cam = cameras.find((c) => c.id === logCameraId) || cameras[0];
    if (!cam) return;

    setIsSubmittingLog(true);
    try {
      await onCreateIncidentLog({
        cameraId: cam.id,
        cameraName: cam.name,
        corridor: cam.corridor,
        lat: cam.lat,
        lng: cam.lng,
        incidentType: logIncidentType,
        severity: logSeverity,
        description: logDescription.trim()
      });
      setLogDescription('');
    } finally {
      setIsSubmittingLog(false);
    }
  };

  const totalIncidentsAggregated = useMemo(
    () => heatmapClusters.reduce((acc, c) => acc + c.incidentCount, 0),
    [heatmapClusters]
  );

  const totalDetectionsAggregated = useMemo(
    () => heatmapClusters.reduce((acc, c) => acc + c.detectionCount, 0),
    [heatmapClusters]
  );

  return (
    <div className="space-y-4">
      {/* Top Geospatial & Heatmap Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-400" />
              Las Vegas Corridor Heatmap &amp; Geospatial Grid
            </span>
            <span className="text-slate-400 font-mono tabular-nums">
              {filteredCameras.length} cameras · {totalIncidentsAggregated} incidents · {totalDetectionsAggregated} detections
            </span>
          </div>

          {/* Corridor Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {['All', 'The Strip', 'I-15', 'Fremont', 'Beltway', 'Airport'].map((corridor) => (
              <button
                key={corridor}
                onClick={() => setSelectedCorridor(corridor)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedCorridor === corridor
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {corridor}
              </button>
            ))}
          </div>
        </div>

        {/* Second Row: Heatmap Overlay Controls */}
        <div className="pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowHeatmap((v) => !v)}
              className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-colors border whitespace-nowrap ${
                showHeatmap
                  ? 'bg-red-950/90 text-red-300 border-red-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-red-400" />
              <span>Thermal Heatmap: {showHeatmap ? 'On' : 'Off'}</span>
            </button>

            {/* Aggregation Mode Selector */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5">
              {(
                [
                  { id: 'combined', label: 'Combined Density' },
                  { id: 'incidents', label: 'Incident Frequency' },
                  { id: 'detections', label: 'Detection Density' }
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setHeatmapMode(mode.id)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    heatmapMode === mode.id
                      ? 'bg-slate-800 text-amber-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Kernel Radius Selector */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md p-0.5 font-mono tabular-nums">
              {(
                [
                  { r: 50, label: '50px Tight' },
                  { r: 75, label: '75px Std' },
                  { r: 105, label: '105px Wide' }
                ] as const
              ).map((item) => (
                <button
                  key={item.r}
                  onClick={() => setHeatmapRadius(item.r)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    heatmapRadius === item.r
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHotspotLabels((v) => !v)}
              className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors whitespace-nowrap ${
                showHotspotLabels
                  ? 'bg-slate-800 text-slate-200 border-slate-700'
                  : 'bg-slate-950 text-slate-500 border-slate-800'
              }`}
            >
              Hotspot Callouts: {showHotspotLabels ? 'Shown' : 'Hidden'}
            </button>

            <div className="flex items-center gap-2 text-slate-400 font-mono tabular-nums">
              <span>Opacity:</span>
              <input
                type="range"
                min={0.35}
                max={1}
                step={0.05}
                value={heatmapOpacity}
                onChange={(e) => setHeatmapOpacity(parseFloat(e.target.value))}
                className="w-20 accent-amber-500 cursor-pointer"
              />
              <span className="w-9 text-right text-slate-200">{Math.round(heatmapOpacity * 100)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Map Canvas Area */}
      <div className="relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl aspect-[16/10] sm:aspect-[16/9]">
        <svg
          viewBox="0 0 1000 700"
          className="w-full h-full select-none"
          onClick={() => {
            setSelectedPinCamera(null);
            setSelectedHotspot(null);
          }}
        >
          <defs>
            <radialGradient id="lasVegasGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
            </radialGradient>

            <linearGradient id="stripGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.4" />
            </linearGradient>

            {/* Multi-Stop Thermal Heatmap Gradients */}
            <radialGradient id="heatCritical" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fef08a" stopOpacity="0.95" />
              <stop offset="22%" stopColor="#ef4444" stopOpacity="0.82" />
              <stop offset="52%" stopColor="#f97316" stopOpacity="0.48" />
              <stop offset="80%" stopColor="#eab308" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="heatHigh" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fde047" stopOpacity="0.88" />
              <stop offset="30%" stopColor="#f97316" stopOpacity="0.68" />
              <stop offset="65%" stopColor="#10b981" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </radialGradient>

            <radialGradient id="heatModerate" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.78" />
              <stop offset="45%" stopColor="#06b6d4" stopOpacity="0.45" />
              <stop offset="80%" stopColor="#3b82f6" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0" />
            </radialGradient>

            <FilterBlur id="heatmapGaussian" stdDeviation="12" />
          </defs>

          {/* Background Map Styling */}
          <rect width="100%" height="100%" fill="#090d16" />
          <circle cx="500" cy="380" r="320" fill="url(#lasVegasGlow)" />

          {/* Grid lines */}
          <g opacity="0.07" stroke="#ffffff" strokeWidth="1">
            <line x1="100" y1="0" x2="100" y2="700" />
            <line x1="300" y1="0" x2="300" y2="700" />
            <line x1="500" y1="0" x2="500" y2="700" />
            <line x1="700" y1="0" x2="700" y2="700" />
            <line x1="900" y1="0" x2="900" y2="700" />
            <line x1="0" y1="150" x2="1000" y2="150" />
            <line x1="0" y1="350" x2="1000" y2="350" />
            <line x1="0" y1="550" x2="1000" y2="550" />
          </g>

          {/* Major Highway Corridors representation */}
          {/* I-15 Diagonal */}
          <path
            d="M 380 690 Q 460 480 520 330 T 630 30"
            fill="none"
            stroke="#334155"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 380 690 Q 460 480 520 330 T 630 30"
            fill="none"
            stroke="#475569"
            strokeWidth="3"
            strokeDasharray="6 4"
          />

          {/* CC-215 Beltway Loop */}
          <path
            d="M 220 580 C 210 380 280 200 500 160 C 650 160 840 220 860 440 C 870 560 740 640 450 640"
            fill="none"
            stroke="#1e293b"
            strokeWidth="10"
          />
          <path
            d="M 220 580 C 210 380 280 200 500 160 C 650 160 840 220 860 440 C 870 560 740 640 450 640"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            opacity="0.3"
          />

          {/* Las Vegas Blvd (The Strip) */}
          <path
            d="M 480 520 L 515 360 L 540 280"
            fill="none"
            stroke="url(#stripGlow)"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {/* ========================================================== */}
          {/* VISUAL HEATMAP OVERLAY (INCIDENT FREQUENCY & DETECTIONS)   */}
          {/* ========================================================== */}
          {showHeatmap && (
            <g opacity={heatmapOpacity}>
              {/* Layer 1: Diffused Thermal Blobs */}
              {heatmapClusters.map((cluster) => {
                const scaleFactor = 0.65 + (cluster.activeIntensity / 100) * 0.85;
                const radius = heatmapRadius * scaleFactor;
                const gradId =
                  cluster.activeIntensity >= 72
                    ? 'url(#heatCritical)'
                    : cluster.activeIntensity >= 48
                    ? 'url(#heatHigh)'
                    : 'url(#heatModerate)';

                return (
                  <g
                    key={`heat-blob-${cluster.id}`}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedHotspot(cluster);
                      setSelectedPinCamera(null);
                    }}
                  >
                    <circle
                      cx={cluster.x}
                      cy={cluster.y}
                      r={radius}
                      fill={gradId}
                      filter="url(#heatmapGaussian)"
                    />
                    {/* Isothermal Contour Ring */}
                    <circle
                      cx={cluster.x}
                      cy={cluster.y}
                      r={radius * 0.48}
                      fill="none"
                      stroke={
                        cluster.activeIntensity >= 72
                          ? '#ef4444'
                          : cluster.activeIntensity >= 48
                          ? '#f59e0b'
                          : '#10b981'
                      }
                      strokeOpacity="0.45"
                      strokeWidth="1.2"
                      strokeDasharray="4 3"
                    />
                  </g>
                );
              })}

              {/* Layer 2: Individual Live Detection Micro-Heat Points */}
              {detections.slice(0, 40).map((det, idx) => {
                const pt = projectCoord(det.lat, det.lng);
                return (
                  <circle
                    key={`det-heat-${det.id || idx}`}
                    cx={pt.x}
                    cy={pt.y}
                    r="22"
                    fill="url(#heatHigh)"
                    opacity="0.45"
                    pointerEvents="none"
                  />
                );
              })}

              {/* Layer 3: Hotspot Callout Labels */}
              {showHotspotLabels &&
                heatmapClusters.slice(0, 6).map((cluster) => {
                  const isCrit = cluster.activeIntensity >= 72;
                  return (
                    <g
                      key={`heat-label-${cluster.id}`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHotspot(cluster);
                      }}
                    >
                      <circle
                        cx={cluster.x}
                        cy={cluster.y}
                        r="4.5"
                        fill={isCrit ? '#fef08a' : '#fde047'}
                        stroke="#dc2626"
                        strokeWidth="1.5"
                      />
                      <rect
                        x={cluster.x + 8}
                        y={cluster.y - 11}
                        width="148"
                        height="20"
                        rx="4"
                        fill="#090d16"
                        fillOpacity="0.86"
                        stroke={isCrit ? '#dc2626' : '#d97706'}
                        strokeOpacity="0.7"
                        strokeWidth="1"
                      />
                      <text
                        x={cluster.x + 13}
                        y={cluster.y + 2}
                        fill="#f8fafc"
                        fontSize="9.5"
                        fontFamily="monospace"
                        fontWeight="600"
                      >
                        {cluster.incidentCount} inc · {cluster.detectionCount} det · {cluster.activeIntensity}%
                      </text>
                    </g>
                  );
                })}
            </g>
          )}

          {/* Corridor Labels */}
          <text x="440" y="660" fill="#64748b" fontSize="12" fontWeight="bold" fontFamily="sans-serif">
            I-15 SOUTH (LOS ANGELES)
          </text>
          <text x="640" y="50" fill="#64748b" fontSize="12" fontWeight="bold" fontFamily="sans-serif">
            I-15 NORTH (SALT LAKE)
          </text>
          <text x="525" y="390" fill="#f59e0b" fontSize="11" fontWeight="bold" fontFamily="sans-serif" letterSpacing="1">
            LAS VEGAS BLVD / THE STRIP
          </text>
          <text x="545" y="270" fill="#38bdf8" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
            DOWNTOWN / FREMONT
          </text>
          <text x="580" y="470" fill="#94a3b8" fontSize="11" fontWeight="bold" fontFamily="sans-serif">
            HARRY REID INT'L AIRPORT
          </text>

          {/* Active Target Confirmed Trajectory + Visual Prediction Line */}
          {trajectoryData && (
            <g>
              {/* Confirmed Historical Path */}
              {trajectoryData.chronological.length > 1 && (
                <polyline
                  points={trajectoryData.chronological.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="4"
                  strokeDasharray="6 3"
                />
              )}

              {/* Projected Visual Prediction Line */}
              {trajectoryData.predictionChain.length > 1 && (
                <polyline
                  points={trajectoryData.predictionChain.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3.5"
                  strokeDasharray="8 5"
                />
              )}

              {trajectoryData.predictedCamPoints.map((pt, idx) => (
                <g key={`map-pred-${pt.id}`}>
                  <circle cx={pt.x} cy={pt.y} r="9" fill="#10b981" fillOpacity="0.25" />
                  <circle cx={pt.x} cy={pt.y} r="4.5" fill="#090d16" stroke="#10b981" strokeWidth="2" />
                  <text
                    x={pt.x + 8}
                    y={pt.y - 6}
                    fill="#34d399"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    PRED #{idx + 1}
                  </text>
                </g>
              ))}

              {trajectoryData.chronological.map((p, idx) => (
                <g key={idx}>
                  <circle cx={p.x} cy={p.y} r="10" fill="#f59e0b" fillOpacity="0.3" />
                  <circle cx={p.x} cy={p.y} r="5" fill="#f59e0b" />
                  <text
                    x={p.x + 8}
                    y={p.y - 8}
                    fill="#fbbf24"
                    fontSize="11"
                    fontWeight="bold"
                    fontFamily="sans-serif"
                  >
                    #{idx + 1}
                  </text>
                </g>
              ))}
            </g>
          )}

          {/* Camera Marker Pins */}
          {filteredCameras.map((cam) => {
            const { x, y } = projectCoord(cam.lat, cam.lng);
            const isHovered = hoveredCamera?.id === cam.id;
            const isStrip = cam.corridor.includes('Strip') || cam.name.includes('Las Vegas Blvd');

            return (
              <circle
                key={cam.id}
                cx={x}
                cy={y}
                r={isHovered ? 6 : isStrip ? 3.5 : 2.5}
                fill={isStrip ? '#f59e0b' : '#38bdf8'}
                opacity={isHovered ? 1 : 0.75}
                className="cursor-pointer transition-all hover:opacity-100 hover:scale-150"
                onMouseEnter={() => setHoveredCamera(cam)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPinCamera(cam);
                  setSelectedHotspot(null);
                }}
              />
            );
          })}
        </svg>

        {/* Selected Hotspot Inspection Popup */}
        {selectedHotspot && (
          <div className="absolute top-4 left-4 z-20 w-80 bg-slate-900/95 border border-red-800/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-slate-100 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-red-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                Corridor Hotspot Cluster
              </span>
              <span className="font-mono tabular-nums font-bold text-amber-300">
                {selectedHotspot.activeIntensity}% Thermal Index
              </span>
            </div>

            <div>
              <h5 className="font-bold text-white text-sm">{selectedHotspot.name}</h5>
              <p className="text-slate-400 text-[11px] mt-0.5">{selectedHotspot.corridor}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 font-mono tabular-nums text-center">
              <div className="p-2 bg-slate-950 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">Incidents</div>
                <div className="text-red-400 font-bold text-sm">{selectedHotspot.incidentCount}</div>
              </div>
              <div className="p-2 bg-slate-950 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">Detections</div>
                <div className="text-amber-400 font-bold text-sm">{selectedHotspot.detectionCount}</div>
              </div>
              <div className="p-2 bg-slate-950 rounded border border-slate-800">
                <div className="text-slate-400 text-[10px]">CCTV Nodes</div>
                <div className="text-sky-400 font-bold text-sm">{selectedHotspot.cameraNodeCount}</div>
              </div>
            </div>

            <button
              onClick={() => onSelectCamera(selectedHotspot.primaryCamera)}
              className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Inspect Primary CCTV #{selectedHotspot.primaryCamera.id}</span>
            </button>
          </div>
        )}

        {/* Selected or Hovered Camera Popup Card */}
        {(selectedPinCamera || hoveredCamera) && (
          <div className="absolute top-4 right-4 z-20 w-72 bg-slate-900/95 border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur-md text-slate-100 animate-in fade-in zoom-in-95 duration-100">
            {(() => {
              const activeCam = selectedPinCamera || hoveredCamera!;
              return (
                <div className="space-y-2">
                  <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
                    <img
                      src={`/api/camera-snapshot/${activeCam.id}?t=${liveTimestamp}`}
                      alt={activeCam.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-red-600 text-white font-mono text-[10px] rounded font-bold">
                      CCTV #{activeCam.id}
                    </span>
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-emerald-600 text-white font-bold text-[9px] rounded flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      LIVE
                    </span>
                  </div>

                  <div>
                    <h5 className="text-xs font-bold text-white line-clamp-1">{activeCam.name}</h5>
                    <p className="text-[11px] text-slate-400 mt-0.5">{activeCam.corridor}</p>
                    <p className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
                      GPS: {activeCam.lat.toFixed(4)}, {activeCam.lng.toFixed(4)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                    <button
                      onClick={() => onSelectCamera(activeCam)}
                      className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs flex items-center justify-center gap-1 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Open Live Monitor</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Map Legend & Thermal Scale Bar */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="bg-slate-900/90 border border-slate-800 px-3 py-2 rounded-lg text-[11px] text-slate-300 flex flex-wrap items-center gap-3 backdrop-blur">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              <span>The Strip Cameras</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
              <span>Interstate / Metro</span>
            </div>
            {trajectoryData && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-amber-400 inline-block" />
                  <span className="text-amber-400 font-semibold">Confirmed Path</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-b-2 border-dashed border-emerald-400 inline-block" />
                  <span className="text-emerald-400 font-semibold">Prediction Line</span>
                </div>
              </>
            )}
          </div>

          {showHeatmap && (
            <div className="bg-slate-900/90 border border-slate-800 px-3 py-2 rounded-lg text-[11px] text-slate-300 flex items-center gap-2 backdrop-blur font-mono tabular-nums">
              <span>Low</span>
              <div className="w-28 h-2 rounded-full bg-gradient-to-r from-blue-600 via-emerald-400 via-amber-400 to-red-500" />
              <span className="text-red-400 font-semibold">Critical Density</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section: Corridor Heatmap Aggregation Table + Cloud Incident Logger */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Corridor Aggregation Table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>Corridor Incident Frequency &amp; Detection Density Matrix</span>
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time spatial aggregation across Las Vegas arterial and freeway zones
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              Mode: {heatmapMode.toUpperCase()}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-medium">
                  <th className="py-2 pr-3">Corridor Cluster Zone</th>
                  <th className="py-2 px-3 text-right">Cameras</th>
                  <th className="py-2 px-3 text-right">Incidents</th>
                  <th className="py-2 px-3 text-right">Detections</th>
                  <th className="py-2 px-3 text-right">Thermal Index</th>
                  <th className="py-2 pl-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                {heatmapClusters.map((cluster) => {
                  const severityLabel =
                    cluster.activeIntensity >= 72
                      ? 'Critical'
                      : cluster.activeIntensity >= 48
                      ? 'Elevated'
                      : 'Moderate';
                  const severityTextClass =
                    cluster.activeIntensity >= 72
                      ? 'text-red-400'
                      : cluster.activeIntensity >= 48
                      ? 'text-amber-400'
                      : 'text-emerald-400';

                  return (
                    <tr
                      key={cluster.id}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 pr-3 font-sans">
                        <div className="font-semibold text-slate-200">{cluster.name}</div>
                        <div className="text-[11px] text-slate-400">{cluster.corridor}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {cluster.cameraNodeCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-red-400">
                        {cluster.incidentCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-amber-300">
                        {cluster.detectionCount}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className={`font-semibold ${severityTextClass}`}>
                            {cluster.activeIntensity}% · {severityLabel}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pl-3 text-right font-sans">
                        <button
                          onClick={() => onSelectCamera(cluster.primaryCamera)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium transition-colors"
                        >
                          CCTV #{cluster.primaryCamera.id}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cloud Corridor Incident Logger (Firestore userIncidentLogs) */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-emerald-400" />
              <span>Cloud Heatmap Incident Logger</span>
            </h4>
            <span className="text-xs font-mono tabular-nums text-slate-400">
              {userIncidentLogs.length} logged
            </span>
          </div>

          {currentUser ? (
            <div className="space-y-3 text-xs">
              <form onSubmit={handleCreateCloudIncident} className="space-y-2.5">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Target CCTV Node</label>
                  <select
                    value={logCameraId}
                    onChange={(e) => setLogCameraId(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    {cameras.slice(0, 60).map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        #{cam.id} — {cam.name} ({cam.corridor})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Incident Type</label>
                    <select
                      value={logIncidentType}
                      onChange={(e) => setLogIncidentType(e.target.value as any)}
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                    >
                      <option value="congestion">Congestion</option>
                      <option value="collision">Collision</option>
                      <option value="hazard">Road Hazard</option>
                      <option value="police_activity">Police Activity</option>
                      <option value="pedestrian_density">Pedestrian Surge</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Thermal Weight</label>
                    <select
                      value={logSeverity}
                      onChange={(e) => setLogSeverity(e.target.value as any)}
                      className="w-full px-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                    >
                      <option value="low">Low</option>
                      <option value="moderate">Moderate</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    required
                    maxLength={500}
                    value={logDescription}
                    onChange={(e) => setLogDescription(e.target.value)}
                    placeholder="Describe observed corridor incident..."
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingLog || !logDescription.trim()}
                  className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>{isSubmittingLog ? 'Logging to Firestore...' : 'Add Incident to Heatmap'}</span>
                </button>
              </form>

              {userIncidentLogs.length > 0 && (
                <div className="pt-2 border-t border-slate-800 space-y-2 max-h-44 overflow-y-auto">
                  {userIncidentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 bg-slate-950/80 border border-slate-800 rounded-lg flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-200 truncate">
                          #{log.cameraId} · {log.incidentType.replace('_', ' ')} ({log.severity})
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-1">{log.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {log.status === 'active' && onResolveIncidentLog && (
                          <button
                            onClick={() => onResolveIncidentLog(log.id)}
                            title="Mark resolved"
                            className="text-slate-400 hover:text-emerald-400"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteIncidentLog && (
                          <button
                            onClick={() => onDeleteIncidentLog(log.id)}
                            title="Delete log"
                            className="text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-400 space-y-2.5">
              <p>
                Sign in with Google to log real-time corridor incidents to Firestore and dynamically weight the Las Vegas CCTV heatmap.
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
    </div>
  );
};

// Helper SVG Filter wrapper
const FilterBlur: React.FC<{ id: string; stdDeviation: string }> = ({ id, stdDeviation }) => (
  <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation={stdDeviation} />
  </filter>
);
