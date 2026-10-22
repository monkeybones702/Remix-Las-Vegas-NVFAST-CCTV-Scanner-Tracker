export interface PTZMovementState {
  status: 'stationary' | 'programmed_tour' | 'operator_manual';
  panSpeedDegPerSec: number;
  tiltSpeedDegPerSec: number;
  zoomLevel: number; // e.g. 1.0x to 15.0x
  zoomDelta: number;
  operatorConfidence: number; // 0.00 to 1.00
  tourMatchScore: number; // 0.00 to 1.00
  movementDurationSec: number;
  headingDeg: number; // 0 to 360
  lastMovementTime: string;
  classificationReason: string;
  isMovingLive: boolean;
}

export interface PTZAlert {
  id: string;
  cameraId: number;
  cameraName: string;
  corridor: string;
  type: 'operator_manual' | 'programmed_tour';
  timestamp: string;
  details: string;
  snapshotUrl: string;
  telemetry: {
    panSpeed: number;
    tiltSpeed: number;
    zoomLevel: number;
    durationSec: number;
    operatorConfidence: number;
  };
  isActive: boolean;
}

export interface CommunityResponse {
  id: string;
  postId: string;
  author: string;
  authorBadge?: string;
  content: string;
  timestamp: string;
  statusUpdate?: 'active' | 'updating' | 'cleared';
  upvotes?: number;
}

export interface CommunityPost {
  id: string;
  author: string;
  authorRole: 'spotter' | 'driver' | 'resident' | 'verified_responder';
  category: 'incident' | 'hazard' | 'operator_activity' | 'congestion' | 'general';
  title: string;
  content: string;
  cameraId?: number;
  cameraName?: string;
  corridor?: string;
  snapshotUrl?: string;
  timestamp: string;
  upvotes: number;
  hasUpvoted?: boolean;
  status: 'active' | 'updating' | 'cleared';
  responses: CommunityResponse[];
  tags: string[];
}

export interface CADIncident {
  id: string;
  agency: 'LVMPD_TRAFFIC' | 'CCFD' | 'NHP_SOUTHERN' | 'NDOT_TIM';
  agencyLabel: string;
  callType: string;
  location: string;
  nearestCameraId?: number;
  nearestCameraName?: string;
  timestamp: string;
  unitsDispatched: string[];
  status: 'dispatched' | 'en_route' | 'on_scene' | 'cleared';
  details: string;
}

export interface Camera {
  id: number;
  name: string;
  lat: number;
  lng: number;
  corridor: string;
  streamUrl?: string | null;
  snapshotUrl: string;
  lastUpdated?: string;
  status?: 'active' | 'offline' | 'warning';
  ptzState?: PTZMovementState;
}

export type TargetCategory = 'vehicle' | 'person' | 'cyclist' | 'all';

export type VehicleSubtype =
  | 'any'
  | 'sedan'
  | 'suv'
  | 'pickup'
  | 'semi_truck'
  | 'box_truck'
  | 'van'
  | 'bus'
  | 'motorcycle'
  | 'emergency_vehicle'
  | 'taxi';

export type TargetColor =
  | 'any'
  | 'white'
  | 'black'
  | 'silver_gray'
  | 'red'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'brown'
  | 'gold'
  | 'orange'
  | 'dark'
  | 'light';

export type TargetHeight =
  | 'any'
  | 'low' // < 1.5m (compact car, sports car, low bike)
  | 'standard' // 1.5m - 2.0m (sedan, standard SUV, adult person)
  | 'tall' // 2.0m - 3.5m (van, lifted pickup, box truck)
  | 'very_tall'; // > 3.5m (semi truck, commercial hauler, double-decker bus)

export type TargetSize =
  | 'any'
  | 'pedestrian' // single human or small object
  | 'compact' // small car, motorcycle, bike
  | 'standard' // sedan, crossover, average vehicle
  | 'large' // full-size SUV, large truck, group
  | 'oversized'; // commercial semi, flatbed, bus

export type CyclistType =
  | 'any'
  | 'bicycle'
  | 'motorcycle'
  | 'e_bike_scooter';

export interface BoundingBox {
  ymin: number; // 0 - 1000
  xmin: number; // 0 - 1000
  ymax: number; // 0 - 1000
  xmax: number; // 0 - 1000
}

export interface Detection {
  id: string;
  cameraId: number;
  cameraName: string;
  corridor: string;
  lat: number;
  lng: number;
  timestamp: string;
  category: 'vehicle' | 'person' | 'cyclist';
  subtype: string;
  color: string;
  height: 'low' | 'standard' | 'tall' | 'very_tall';
  size: 'pedestrian' | 'compact' | 'standard' | 'large' | 'oversized';
  isCyclist: boolean;
  cyclistType?: CyclistType;
  confidence: number;
  tags: string[];
  description: string;
  box: BoundingBox;
  snapshotUrl: string;
  thumbnailUrl?: string;
  trackingId?: string;
  direction?: 'NB' | 'SB' | 'EB' | 'WB' | 'stationary';
  speedEstimateMph?: number;
}

export interface SnapshotHistoryItem {
  id: string;
  cameraId: number;
  timestamp: string;
  url: string;
  detectionCount: number;
  note?: string;
}

export interface SearchFilterState {
  keyword: string;
  category: TargetCategory;
  vehicleType: VehicleSubtype;
  color: TargetColor;
  height: TargetHeight;
  size: TargetSize;
  cyclistOnly: boolean;
  selectedTags: string[];
  corridor: string;
  minConfidence: number;
}

export interface TrackedSubject {
  id: string;
  label: string;
  category: 'vehicle' | 'person' | 'cyclist';
  description: string;
  color: string;
  height: string;
  size: string;
  firstSeen: string;
  lastSeen: string;
  lastCameraId: number;
  lastCameraName: string;
  sightings: Detection[];
  predictedNextCameraIds: number[];
  isFollowingLive: boolean;
}

// ----------------------------------------------------
// Broadcastify & Police / Fire Scanning Transcripts
// ----------------------------------------------------
export interface ScannerFeed {
  id: string;
  name: string;
  agency: 'LVMPD' | 'CCFD' | 'NHP' | 'HENDERSON_PD';
  talkgroup: string;
  frequencyMhz: number;
  listenersCount: number;
  isLive: boolean;
  feedUrl?: string;
  description: string;
}

export interface ScannerTranscript {
  id: string;
  feedId: string;
  agency: string;
  talkgroup: string;
  timestamp: string;
  rawAudioDurationSec: number;
  callSign: string;
  unit: string;
  tenCode?: string;
  tenCodeMeaning?: string;
  transcript: string;
  priority: 'critical' | 'high' | 'medium' | 'routine';
  correlatedCameraId?: number;
  correlatedCameraName?: string;
  locationKeyword: string;
  lat?: number;
  lng?: number;
  distanceMeters?: number;
  isTranscribingLive?: boolean;
}

// ----------------------------------------------------
// Fix It Clark County Municipal Public Works Database
// ----------------------------------------------------
export type FixItCategory =
  | 'traffic_signal_failure'
  | 'street_light_out'
  | 'roadway_hazard_debris'
  | 'pothole_asphalt'
  | 'sidewalk_obstruction'
  | 'illegal_dumping'
  | 'flooding_drainage'
  | 'damaged_guardrail';

export interface FixItReport {
  ticketId: string;
  source: 'FixIt Clark County 311' | 'SeeClickFix' | 'Citizen Report';
  category: FixItCategory;
  title: string;
  description: string;
  address: string;
  corridor: string;
  lat: number;
  lng: number;
  nearestCameraId: number;
  nearestCameraName: string;
  status: 'received' | 'in_progress' | 'scheduled' | 'resolved';
  priority: 'urgent' | 'high' | 'normal';
  submittedAt: string;
  updatedAt: string;
  assignedDepartment: string;
  upvotes: number;
  photoUrl?: string;
}

// ----------------------------------------------------
// Multi-Platform Social Media Geofenced Feeds
// ----------------------------------------------------
export type SocialPlatform =
  | 'x'
  | 'snapchat'
  | 'tiktok'
  | 'facebook'
  | 'instagram'
  | 'nextdoor'
  | 'reddit';

export interface SocialPost {
  id: string;
  platform: SocialPlatform;
  authorHandle: string;
  authorName: string;
  authorAvatar: string;
  timestamp: string;
  content: string;
  mediaType: 'image' | 'video' | 'text';
  mediaUrl?: string;
  videoDurationSec?: number;
  hashtags: string[];
  lat: number;
  lng: number;
  locationName: string;
  corridor: string;
  nearestCameraId: number;
  nearestCameraName: string;
  distanceMeters?: number;
  engagement: {
    likes: number;
    shares: number;
    views?: number;
    comments: number;
  };
  sentiment: 'urgent' | 'caution' | 'informative' | 'neutral';
  verifiedUser?: boolean;
  correlatedCctvSnapshotUrl?: string;
}

// ----------------------------------------------------
// Major News Channels Scanner Intelligence
// ----------------------------------------------------
export type NewsChannelSlug =
  | 'klas_8'
  | 'fox5_vegas'
  | 'ksnv_3'
  | 'ktnv_13'
  | 'review_journal'
  | 'las_vegas_sun';

export interface NewsChannelItem {
  id: string;
  channel:
    | '8 News Now (KLAS CBS)'
    | 'FOX5 Vegas (KVVU)'
    | 'News 3 Las Vegas (KSNV NBC)'
    | '13 Action News (KTNV ABC)'
    | 'Las Vegas Review-Journal'
    | 'Las Vegas Sun';
  channelSlug: NewsChannelSlug;
  headline: string;
  summary: string;
  timestamp: string; // ISO-8601 string, default sorted
  category: 'breaking' | 'traffic_alert' | 'police_activity' | 'weather_hazard' | 'investigation';
  sourceUrl: string; // Direct link to external news source article/stream
  sourceDomain: string; // e.g. "8newsnow.com"
  nearestCameraId?: number;
  nearestCameraName?: string;
  corridor: string;
  badge: string; // e.g. "BREAKING LIVE", "TRAFFIC ALERT"
  isBreaking: boolean;
  impactLevel: 'severe' | 'moderate' | 'advisory';
  videoFeedUrl?: string;
}

// ----------------------------------------------------
// Unified Cross-Correlation Intelligence
// ----------------------------------------------------
export interface CrossCorrelationEvent {
  id: string;
  title: string;
  incidentType: string;
  primaryLocation: string;
  corridor: string;
  timestamp: string;
  confidenceScore: number; // 0 - 100%
  nearestCameraId: number;
  nearestCameraName: string;
  cameraSnapshotUrl: string;
  summary: string;
  sources: {
    hasScanner: boolean;
    scannerTranscriptId?: string;
    scannerSnippet?: string;
    hasFixIt: boolean;
    fixItTicketId?: string;
    fixItCategory?: string;
    hasSocial: boolean;
    socialPlatforms: SocialPlatform[];
    socialPostIds: string[];
    socialSnippet?: string;
    hasCAD: boolean;
    cadIncidentId?: string;
    hasNews?: boolean;
    newsChannelId?: string;
    newsSnippet?: string;
    newsSourceUrl?: string;
  };
  status: 'active' | 'investigating' | 'resolved';
}

export interface IncidentRefreshSummary {
  lastUpdated: string;
  totalIncidents: number;
  correlationCount: number;
  newsCount: number;
  scannerCount: number;
  fixItCount: number;
  socialCount: number;
  cadCount: number;
  status: 'synchronized';
}

// ----------------------------------------------------
// PTZ Autonomous Patrol & AI Optimization Types
// ----------------------------------------------------
export type PTZScannerMode = 'manual_oversight' | 'autonomous_patrol';

export interface PTZPatrolWaypoint {
  cameraId: number;
  cameraName: string;
  corridor: string;
  recommendedHeadingDeg: number;
  recommendedZoom: number;
  dwellSeconds: number;
  sweepArcDeg: number;
  priorityReason: string;
}

export interface PTZPatrolOptimizationSuggestion {
  id: string;
  corridor: string;
  title: string;
  mode: PTZScannerMode;
  waypoints: PTZPatrolWaypoint[];
  estimatedCoverageGainPct: number;
  responseLatencyReductionSec: number;
  rationale: string;
  groundingSources: Array<{
    title: string;
    uri: string;
  }>;
  modelUsed: string;
  generatedAt: string;
  isApplied?: boolean;
}

// ----------------------------------------------------
// High-Traffic Camera FOV Entry Alert Types
// ----------------------------------------------------
export interface HighTrafficFovAlert {
  id: string;
  subjectId: string;
  subjectLabel: string;
  subjectColor: string;
  subjectCategory: string;
  cameraId: number;
  cameraName: string;
  corridor: string;
  trafficVolumeAadt: number;
  fovHeadingDeg: number;
  fovAngleDeg: number;
  estimatedSpeedMph: number;
  snapshotUrl: string;
  timestamp: string;
  acknowledged: boolean;
  firestoreDocId?: string;
}


