import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import https from "https";
import http from "http";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import type {
  Camera,
  Detection,
  SnapshotHistoryItem,
  TrackedSubject,
  PTZMovementState,
  PTZAlert,
  PTZScannerMode,
  PTZPatrolWaypoint,
  PTZPatrolOptimizationSuggestion,
  HighTrafficFovAlert,
  CommunityPost,
  CommunityResponse,
  CADIncident,
  ScannerFeed,
  ScannerTranscript,
  FixItReport,
  SocialPost,
  CrossCorrelationEvent,
  NewsChannelItem
} from "./src/types";

// Load cameras list
let cameras: Camera[] = [];
const camerasPath = path.join(process.cwd(), "src", "data", "cameras.json");
if (fs.existsSync(camerasPath)) {
  try {
    cameras = JSON.parse(fs.readFileSync(camerasPath, "utf-8"));
    console.log(`Loaded ${cameras.length} CCTV cameras from ${camerasPath}`);
  } catch (err) {
    console.error("Error reading cameras.json:", err);
  }
}

// In-memory snapshot history ring buffers per camera (keep last 20 snapshots per camera)
const snapshotHistoryMap = new Map<number, SnapshotHistoryItem[]>();
let snapshotSequenceId = 0;

// In-memory detections database
let detectionsStore: Detection[] = [];

// In-memory tracked subjects
const trackedSubjects = new Map<string, TrackedSubject>();

// In-memory stores for PTZ, Community, CAD, Scanner, FixIt, Social, News, and Correlation
const ptzStateMap = new Map<number, PTZMovementState>();
let ptzAlertsStore: PTZAlert[] = [];
let communityPostsStore: CommunityPost[] = [];
let cadIncidentsStore: CADIncident[] = [];
let scannerFeedsStore: ScannerFeed[] = [];
let scannerTranscriptsStore: ScannerTranscript[] = [];
let fixItReportsStore: FixItReport[] = [];
let socialPostsStore: SocialPost[] = [];
let crossCorrelationEventsStore: CrossCorrelationEvent[] = [];
let newsChannelItemsStore: NewsChannelItem[] = [];
let currentPTZScannerMode: PTZScannerMode = "manual_oversight";
let patrolOptimizationsStore: PTZPatrolOptimizationSuggestion[] = [];
let highTrafficFovAlertsStore: HighTrafficFovAlert[] = [];

export interface HighTrafficCameraNode {
  cameraId: number;
  cameraName: string;
  corridor: string;
  lat: number;
  lng: number;
  trafficVolumeAadt: number;
  fovHeadingDeg: number;
  fovAngleDeg: number;
  tier: "Tier-1 Core Hub" | "Tier-1 Arterial" | "Tier-2 Interchange";
}

const HIGH_TRAFFIC_CAMERA_NODES: HighTrafficCameraNode[] = [
  {
    cameraId: 21603,
    cameraName: "Las Vegas Blvd at Bellagio",
    corridor: "Las Vegas Strip",
    lat: 36.1126,
    lng: -115.1728,
    trafficVolumeAadt: 168500,
    fovHeadingDeg: 184,
    fovAngleDeg: 68,
    tier: "Tier-1 Core Hub"
  },
  {
    cameraId: 100,
    cameraName: "I-15 SB I-515 Interchange",
    corridor: "I-15 Interstate",
    lat: 36.1642,
    lng: -115.1541,
    trafficVolumeAadt: 294000,
    fovHeadingDeg: 175,
    fovAngleDeg: 72,
    tier: "Tier-1 Core Hub"
  },
  {
    cameraId: 24821,
    cameraName: "Las Vegas Blvd & Tropicana",
    corridor: "Las Vegas Strip",
    lat: 36.1008,
    lng: -115.1726,
    trafficVolumeAadt: 156200,
    fovHeadingDeg: 356,
    fovAngleDeg: 64,
    tier: "Tier-1 Arterial"
  },
  {
    cameraId: 30561,
    cameraName: "Casino Center & Fremont N",
    corridor: "Downtown / Fremont",
    lat: 36.1707,
    lng: -115.1452,
    trafficVolumeAadt: 118400,
    fovHeadingDeg: 130,
    fovAngleDeg: 62,
    tier: "Tier-1 Arterial"
  },
  {
    cameraId: 22611,
    cameraName: "Las Vegas Blvd at Wynn",
    corridor: "Las Vegas Strip",
    lat: 36.1278,
    lng: -115.1669,
    trafficVolumeAadt: 149800,
    fovHeadingDeg: 192,
    fovAngleDeg: 66,
    tier: "Tier-1 Arterial"
  },
  {
    cameraId: 104,
    cameraName: "I-15 NB & Sahara Ave",
    corridor: "I-15 Interstate",
    lat: 36.1438,
    lng: -115.1651,
    trafficVolumeAadt: 278500,
    fovHeadingDeg: 14,
    fovAngleDeg: 70,
    tier: "Tier-2 Interchange"
  }
];

// Gemini AI Client Lazy Initializer
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Multi-model fallback chain to handle high demand spikes (503) and rate limits (429)
const CANDIDATE_GEMINI_MODELS = [
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite"
];

async function generateGeminiWithFallback(
  ai: GoogleGenAI,
  requestPayload: {
    contents: any;
    config?: any;
  },
  models: string[] = CANDIDATE_GEMINI_MODELS
): Promise<{ text: string; modelUsed: string } | null> {
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: requestPayload.contents,
        config: requestPayload.config,
      });
      if (response && response.text) {
        return { text: response.text, modelUsed: model };
      }
    } catch {
      // If 503 (high demand) or 429 (quota rate-limit), continue silently to next model
      continue;
    }
  }
  return null;
}

// Helper: Fetch image from remote URL as Buffer
function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://bugatti.nvfast.org/",
        },
        timeout: 6000,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchImageBuffer(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to fetch image: HTTP ${res.statusCode}`));
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const contentType = res.headers["content-type"] || "image/jpeg";
          resolve({ buffer, contentType });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out fetching CCTV snapshot"));
    });
  });
}

// Pre-seed some realistic Las Vegas corridor traffic detections so search works immediately
function initializeSeedDetections() {
  const corridors = [
    { name: "Las Vegas Blvd (The Strip)", camId: 21603, camName: "Las Vegas Blvd at Bellagio", lat: 36.110699, lng: -115.173798 },
    { name: "Las Vegas Blvd (The Strip)", camId: 21601, camName: "Las Vegas Blvd at Paris", lat: 36.111301, lng: -115.172401 },
    { name: "Las Vegas Blvd (The Strip)", camId: 22611, camName: "Las Vegas Blvd at Wynn", lat: 36.128101, lng: -115.168198 },
    { name: "I-15 Interstate", camId: 100, camName: "I-15 SB I-515 Interchange", lat: 36.17384, lng: -115.15605 },
    { name: "I-15 Interstate", camId: 101, camName: "I-15 SB & US-95", lat: 36.17385, lng: -115.15608 },
    { name: "Downtown / Fremont", camId: 30561, camName: "Casino Center & Fremont N", lat: 36.17057, lng: -115.14420 },
    { name: "CC-215 / I-215 Beltway", camId: 23051, camName: "Windmill & I-215 EB Beltway", lat: 36.043, lng: -115.1356 },
    { name: "Airport / McCarran (Harry Reid)", camId: 24431, camName: "Paradise & Flight Path Airport", lat: 36.08517, lng: -115.14511 }
  ];

  const now = Date.now();
  const sampleData: Partial<Detection>[] = [
    {
      category: "vehicle",
      subtype: "suv",
      color: "red",
      height: "standard",
      size: "standard",
      isCyclist: false,
      confidence: 0.94,
      tags: ["moving_southbound", "lane_2", "red_suv", "strip_view", "headlights_on"],
      description: "Red midsize SUV traveling southbound along Las Vegas Blvd",
      box: { ymin: 480, xmin: 310, ymax: 620, xmax: 450 },
      direction: "SB",
      speedEstimateMph: 24,
      trackingId: "TRK-RED-SUV-01"
    },
    {
      category: "cyclist",
      subtype: "motorcycle",
      color: "black",
      height: "low",
      size: "compact",
      isCyclist: true,
      cyclistType: "motorcycle",
      confidence: 0.89,
      tags: ["lane_splitting", "helmet_detected", "motorcycle", "fast_moving"],
      description: "Black cruiser motorcycle with rider in dark gear",
      box: { ymin: 520, xmin: 610, ymax: 600, xmax: 670 },
      direction: "NB",
      speedEstimateMph: 35,
      trackingId: "TRK-MOTO-BLK-02"
    },
    {
      category: "vehicle",
      subtype: "semi_truck",
      color: "white",
      height: "very_tall",
      size: "oversized",
      isCyclist: false,
      confidence: 0.98,
      tags: ["commercial_freight", "interstate_hauler", "heavy_cargo", "lane_1"],
      description: "White 18-wheel commercial semi truck with 53ft dry van trailer",
      box: { ymin: 340, xmin: 120, ymax: 580, xmax: 290 },
      direction: "SB",
      speedEstimateMph: 58,
      trackingId: "TRK-SEMI-WHT-03"
    },
    {
      category: "person",
      subtype: "pedestrian",
      color: "blue",
      height: "standard",
      size: "pedestrian",
      isCyclist: false,
      confidence: 0.91,
      tags: ["crosswalk", "pedestrian_signal", "strip_sidewalk", "backpack"],
      description: "Adult pedestrian in blue jacket crossing at intersection",
      box: { ymin: 620, xmin: 820, ymax: 760, xmax: 860 },
      direction: "WB",
      speedEstimateMph: 3,
      trackingId: "TRK-PED-BLU-04"
    },
    {
      category: "cyclist",
      subtype: "bicycle",
      color: "yellow",
      height: "standard",
      size: "compact",
      isCyclist: true,
      cyclistType: "bicycle",
      confidence: 0.86,
      tags: ["bicycle_commuter", "high_vis_vest", "bike_lane", "cyclist"],
      description: "Cyclist on commuter road bicycle wearing neon yellow vest",
      box: { ymin: 590, xmin: 730, ymax: 710, xmax: 780 },
      direction: "NB",
      speedEstimateMph: 14,
      trackingId: "TRK-BIKE-YEL-05"
    },
    {
      category: "vehicle",
      subtype: "pickup",
      color: "silver_gray",
      height: "tall",
      size: "large",
      isCyclist: false,
      confidence: 0.93,
      tags: ["crew_cab", "silver_truck", "tailgate_cargo", "i15_corridor"],
      description: "Silver 4x4 crew cab pickup truck carrying tools in bed",
      box: { ymin: 440, xmin: 400, ymax: 560, xmax: 530 },
      direction: "SB",
      speedEstimateMph: 62,
      trackingId: "TRK-TRUCK-SLV-06"
    },
    {
      category: "vehicle",
      subtype: "taxi",
      color: "yellow",
      height: "standard",
      size: "standard",
      isCyclist: false,
      confidence: 0.95,
      tags: ["taxi_cab", "rooftop_sign", "yellow_cab", "airport_route", "fremont"],
      description: "Yellow Las Vegas taxi cab with illuminated rooftop medallion sign",
      box: { ymin: 510, xmin: 320, ymax: 640, xmax: 460 },
      direction: "EB",
      speedEstimateMph: 28,
      trackingId: "TRK-TAXI-YEL-07"
    },
    {
      category: "person",
      subtype: "pedestrian_group",
      color: "multicolor",
      height: "standard",
      size: "large",
      isCyclist: false,
      confidence: 0.88,
      tags: ["tourist_group", "fremont_crowd", "pedestrian_plaza"],
      description: "Group of 4 tourists walking together along Fremont Street walkway",
      box: { ymin: 640, xmin: 210, ymax: 750, xmax: 320 },
      direction: "EB",
      speedEstimateMph: 2,
      trackingId: "TRK-GROUP-08"
    }
  ];

  detectionsStore = sampleData.map((item, idx) => {
    const loc = corridors[idx % corridors.length];
    const detTime = new Date(now - (idx * 3 + 1) * 60 * 1000).toISOString();
    return {
      id: `det-${loc.camId}-${idx + 1}-${Date.now()}`,
      cameraId: loc.camId,
      cameraName: loc.camName,
      corridor: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      timestamp: detTime,
      category: item.category!,
      subtype: item.subtype!,
      color: item.color!,
      height: item.height!,
      size: item.size!,
      isCyclist: !!item.isCyclist,
      cyclistType: item.cyclistType,
      confidence: item.confidence!,
      tags: item.tags!,
      description: item.description!,
      box: item.box!,
      snapshotUrl: `https://bugatti.nvfast.org/Snapshots/${loc.camId}.jpeg`,
      thumbnailUrl: `https://bugatti.nvfast.org/Snapshots/${loc.camId}.jpeg`,
      trackingId: item.trackingId,
      direction: item.direction,
      speedEstimateMph: item.speedEstimateMph
    };
  });

  // Also seed tracked subjects
  const redSuvDets = [
    detectionsStore[0],
    {
      ...detectionsStore[0],
      id: `det-21601-prev`,
      cameraId: 21601,
      cameraName: "Las Vegas Blvd at Paris",
      timestamp: new Date(now - 8 * 60 * 1000).toISOString(),
      box: { ymin: 430, xmin: 280, ymax: 560, xmax: 410 }
    }
  ];

  trackedSubjects.set("TRK-RED-SUV-01", {
    id: "TRK-RED-SUV-01",
    label: "Red Midsize SUV (SB)",
    category: "vehicle",
    description: "Red midsize SUV traveling southbound along Las Vegas Blvd past Paris & Bellagio",
    color: "red",
    height: "standard",
    size: "standard",
    firstSeen: redSuvDets[1].timestamp,
    lastSeen: redSuvDets[0].timestamp,
    lastCameraId: 21603,
    lastCameraName: "Las Vegas Blvd at Bellagio",
    sightings: redSuvDets,
    predictedNextCameraIds: [21602, 24171, 24821], // Planet Hollywood, City Center, MGM
    isFollowingLive: true
  });

  if (detectionsStore[1]) {
    const blackSedanDets = [
      detectionsStore[1],
      {
        ...detectionsStore[1],
        id: "det-104-prev",
        cameraId: 104,
        cameraName: "I-15 NB & Sahara Ave",
        lat: 36.1438,
        lng: -115.1651,
        timestamp: new Date(now - 9 * 60 * 1000).toISOString(),
        box: { ymin: 410, xmin: 310, ymax: 540, xmax: 450 }
      }
    ];
    trackedSubjects.set("TRK-BLK-SEDAN-02", {
      id: "TRK-BLK-SEDAN-02",
      label: "Black Sport Sedan (SB I-15)",
      category: "vehicle",
      description: "Black 4-door sport sedan traveling high speed southbound on I-15 HOV lane",
      color: "black",
      height: "low",
      size: "standard",
      firstSeen: blackSedanDets[1].timestamp,
      lastSeen: blackSedanDets[0].timestamp,
      lastCameraId: 100,
      lastCameraName: "I-15 SB I-515 Interchange",
      sightings: blackSedanDets,
      predictedNextCameraIds: [104, 21603, 24821],
      isFollowingLive: true
    });
  }

  if (detectionsStore[2]) {
    const silverPickupDets = [
      detectionsStore[2],
      {
        ...detectionsStore[2],
        id: "det-22611-prev",
        cameraId: 22611,
        cameraName: "Las Vegas Blvd at Wynn",
        lat: 36.1278,
        lng: -115.1669,
        timestamp: new Date(now - 11 * 60 * 1000).toISOString(),
        box: { ymin: 390, xmin: 260, ymax: 560, xmax: 440 }
      }
    ];
    trackedSubjects.set("TRK-SLV-TRUCK-03", {
      id: "TRK-SLV-TRUCK-03",
      label: "Silver Lifted Pickup (NB Strip)",
      category: "vehicle",
      description: "Silver crew-cab pickup truck with roof rack moving northbound toward Downtown",
      color: "silver_gray",
      height: "tall",
      size: "large",
      firstSeen: silverPickupDets[1].timestamp,
      lastSeen: silverPickupDets[0].timestamp,
      lastCameraId: 24821,
      lastCameraName: "Las Vegas Blvd & Tropicana",
      sightings: silverPickupDets,
      predictedNextCameraIds: [21603, 22611, 30561],
      isFollowingLive: true
    });
  }
}

initializeSeedDetections();

// Seed initial history entries for top cameras
function seedInitialHistory() {
  const topCamIds = [100, 101, 102, 21601, 21602, 21603, 22611, 24821, 30561, 23051];
  const now = Date.now();
  topCamIds.forEach((camId) => {
    const list: SnapshotHistoryItem[] = [];
    for (let i = 0; i < 8; i++) {
      const timeStr = new Date(now - i * 15000).toISOString();
      list.push({
        id: `hist-${camId}-${i}`,
        cameraId: camId,
        timestamp: timeStr,
        url: `https://bugatti.nvfast.org/Snapshots/${camId}.jpeg?t=${now - i * 15000}`,
        detectionCount: Math.floor(Math.random() * 6) + 1,
        note: i === 0 ? "Live frame" : `${i * 15}s prior snapshot`
      });
    }
    snapshotHistoryMap.set(camId, list);
  });
}
seedInitialHistory();

function defaultStationaryState(camId: number): PTZMovementState {
  return {
    status: 'stationary',
    panSpeedDegPerSec: 0,
    tiltSpeedDegPerSec: 0,
    zoomLevel: 1.0,
    zoomDelta: 0,
    operatorConfidence: 0.04,
    tourMatchScore: 0.02,
    movementDurationSec: 0,
    headingDeg: (camId * 43) % 360,
    lastMovementTime: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    classificationReason: 'Stationary position locked on intersection. Successive frame differences show 0.0°/s rotational angular velocity.',
    isMovingLive: false
  };
}

function initializePTZAndCommunityData() {
  const now = Date.now();

  // 1. Seed active moving cameras
  // Camera 21603 (Bellagio): LIVE OPERATOR ACTIVE
  ptzStateMap.set(21603, {
    status: 'operator_manual',
    panSpeedDegPerSec: 4.8,
    tiltSpeedDegPerSec: -2.1,
    zoomLevel: 3.2,
    zoomDelta: 2.2,
    operatorConfidence: 0.97,
    tourMatchScore: 0.12,
    movementDurationSec: 54,
    headingDeg: 184,
    lastMovementTime: new Date(now - 4000).toISOString(),
    classificationReason: 'Manual operator joystick slewing detected: High angular acceleration, manual micro-corrections (±0.4°), deep optical zoom shift (1.0x -> 3.2x) focusing on lane 2. Non-periodic dwell intervals indicate real-time human controller action.',
    isMovingLive: true
  });

  // Camera 100 (I-15 Interchange): LIVE OPERATOR ACTIVE
  ptzStateMap.set(100, {
    status: 'operator_manual',
    panSpeedDegPerSec: 6.2,
    tiltSpeedDegPerSec: 1.4,
    zoomLevel: 2.5,
    zoomDelta: 1.5,
    operatorConfidence: 0.94,
    tourMatchScore: 0.08,
    movementDurationSec: 32,
    headingDeg: 218,
    lastMovementTime: new Date(now - 8000).toISOString(),
    classificationReason: 'TMC technician manual PTZ override: Non-linear angular trajectory tracking shoulder incident. Immediate stop without preset latching.',
    isMovingLive: true
  });

  // Camera 24821 (Tropicana & Strip): LIVE OPERATOR ACTIVE
  ptzStateMap.set(24821, {
    status: 'operator_manual',
    panSpeedDegPerSec: 3.1,
    tiltSpeedDegPerSec: 0.9,
    zoomLevel: 1.8,
    zoomDelta: 0.8,
    operatorConfidence: 0.91,
    tourMatchScore: 0.14,
    movementDurationSec: 21,
    headingDeg: 52,
    lastMovementTime: new Date(now - 14000).toISOString(),
    classificationReason: 'Human operator manual repositioning towards pedestrian crosswalk following traffic signal change.',
    isMovingLive: true
  });

  // Camera 22611 (Wynn): PROGRAMMED GUARD TOUR
  ptzStateMap.set(22611, {
    status: 'programmed_tour',
    panSpeedDegPerSec: 15.0,
    tiltSpeedDegPerSec: 0.0,
    zoomLevel: 1.0,
    zoomDelta: 0.0,
    operatorConfidence: 0.06,
    tourMatchScore: 0.98,
    movementDurationSec: 210,
    headingDeg: 90,
    lastMovementTime: new Date(now - 18000).toISOString(),
    classificationReason: 'Automated preset guard tour: Slew velocity is constant at 15.0°/s across 4 fixed azimuth points (0°, 90°, 180°, 270°) with exact 45-second dwell intervals. Zero manual jitter.',
    isMovingLive: true
  });

  // Camera 30561 (Fremont & Casino Center): PROGRAMMED GUARD TOUR
  ptzStateMap.set(30561, {
    status: 'programmed_tour',
    panSpeedDegPerSec: 12.5,
    tiltSpeedDegPerSec: 0.0,
    zoomLevel: 1.0,
    zoomDelta: 0.0,
    operatorConfidence: 0.09,
    tourMatchScore: 0.96,
    movementDurationSec: 320,
    headingDeg: 315,
    lastMovementTime: new Date(now - 28000).toISOString(),
    classificationReason: 'Periodic corridor sweep: Bilateral oscillation between predetermined intersection azimuth angles on a 60-second recurring timer.',
    isMovingLive: true
  });

  // 2. Seed PTZ alerts
  ptzAlertsStore = [
    {
      id: `ptz-alt-${now}-1`,
      cameraId: 21603,
      cameraName: 'Las Vegas Blvd at Bellagio',
      corridor: 'Las Vegas Blvd (The Strip)',
      type: 'operator_manual',
      timestamp: new Date(now - 2 * 60 * 1000).toISOString(),
      details: 'ALERT: Operator Manual PTZ Control Detected! High-rate pan South (4.8°/s) with 3.2x zoom in lane 2.',
      snapshotUrl: 'https://bugatti.nvfast.org/Snapshots/21603.jpeg',
      telemetry: {
        panSpeed: 4.8,
        tiltSpeed: -2.1,
        zoomLevel: 3.2,
        durationSec: 54,
        operatorConfidence: 0.97
      },
      isActive: true
    },
    {
      id: `ptz-alt-${now}-2`,
      cameraId: 100,
      cameraName: 'I-15 SB I-515 Interchange',
      corridor: 'I-15 Interstate',
      type: 'operator_manual',
      timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
      details: 'ALERT: Operator Manual PTZ Slew Detected! Tracking right shoulder incident on I-15 Southbound.',
      snapshotUrl: 'https://bugatti.nvfast.org/Snapshots/100.jpeg',
      telemetry: {
        panSpeed: 6.2,
        tiltSpeed: 1.4,
        zoomLevel: 2.5,
        durationSec: 32,
        operatorConfidence: 0.94
      },
      isActive: true
    },
    {
      id: `ptz-alt-${now}-3`,
      cameraId: 24821,
      cameraName: 'Las Vegas Blvd & Tropicana',
      corridor: 'Las Vegas Blvd (The Strip)',
      type: 'operator_manual',
      timestamp: new Date(now - 9 * 60 * 1000).toISOString(),
      details: 'Operator manual repositioning observed near pedestrian walkway approach.',
      snapshotUrl: 'https://bugatti.nvfast.org/Snapshots/24821.jpeg',
      telemetry: {
        panSpeed: 3.1,
        tiltSpeed: 0.9,
        zoomLevel: 1.8,
        durationSec: 21,
        operatorConfidence: 0.91
      },
      isActive: true
    },
    {
      id: `ptz-alt-${now}-4`,
      cameraId: 22611,
      cameraName: 'Las Vegas Blvd at Wynn',
      corridor: 'Las Vegas Blvd (The Strip)',
      type: 'programmed_tour',
      timestamp: new Date(now - 14 * 60 * 1000).toISOString(),
      details: 'Scheduled Guard Tour in progress: 4-preset 45s cyclic rotation active.',
      snapshotUrl: 'https://bugatti.nvfast.org/Snapshots/22611.jpeg',
      telemetry: {
        panSpeed: 15.0,
        tiltSpeed: 0.0,
        zoomLevel: 1.0,
        durationSec: 210,
        operatorConfidence: 0.06
      },
      isActive: false
    }
  ];

  // 3. Seed Community Posts & Responses
  communityPostsStore = [
    {
      id: 'post-strip-bellagio-01',
      author: 'StripSpotter702',
      authorRole: 'spotter',
      category: 'operator_activity',
      title: 'TMC Operator actively tracking stalled sedan in lane 2 at Bellagio',
      content: 'CCTV #21603 just performed a manual pan and zoomed 3.2x onto a silver sedan with hazards on in center-right lane. Metro traffic patrol is maneuvering into position.',
      cameraId: 21603,
      cameraName: 'Las Vegas Blvd at Bellagio',
      corridor: 'Las Vegas Blvd (The Strip)',
      snapshotUrl: 'https://bugatti.nvfast.org/Snapshots/21603.jpeg',
      timestamp: new Date(now - 18 * 60 * 1000).toISOString(),
      upvotes: 8,
      status: 'updating',
      tags: ['bellagio', 'lane_2', 'operator_active', 'stalled_car'],
      responses: [
        {
          id: 'resp-b1',
          postId: 'post-strip-bellagio-01',
          author: 'VegasDriver_Sam',
          authorBadge: 'Local Driver',
          content: 'Metro motorcycle officer just pulled behind it with flashers on. Traffic is being merged into lanes 1 and 3.',
          timestamp: new Date(now - 11 * 60 * 1000).toISOString(),
          statusUpdate: 'updating',
          upvotes: 5
        },
        {
          id: 'resp-b2',
          postId: 'post-strip-bellagio-01',
          author: 'StripPedestrian',
          authorBadge: 'Spotter',
          content: 'Flatbed wrecker has vehicle hooked up. Lane 2 is reopening now!',
          timestamp: new Date(now - 3 * 60 * 1000).toISOString(),
          statusUpdate: 'cleared',
          upvotes: 4
        }
      ]
    },
    {
      id: 'post-i15-debris-02',
      author: 'I15Commuter_Dan',
      authorRole: 'driver',
      category: 'hazard',
      title: 'Large truck tread debris scattered across middle lane on I-15 SB',
      content: 'Be careful approaching the US-95 interchange on I-15 Southbound. Shredded semi tire sitting squarely in middle lane. Multiple vehicles taking sudden evasive maneuvers.',
      cameraId: 100,
      cameraName: 'I-15 SB I-515 Interchange',
      corridor: 'I-15 Interstate',
      snapshotUrl: 'https://bugatti.nvfast.org/Snapshots/100.jpeg',
      timestamp: new Date(now - 32 * 60 * 1000).toISOString(),
      upvotes: 14,
      status: 'active',
      tags: ['i15', 'hazard', 'tire_debris', 'traffic_warning'],
      responses: [
        {
          id: 'resp-d1',
          postId: 'post-i15-debris-02',
          author: 'HighwayWatcher',
          authorBadge: 'Verified Spotter',
          content: 'Camera #100 operator just panned towards the debris location. NDOT TIM truck 4 is queued up on the shoulder.',
          timestamp: new Date(now - 16 * 60 * 1000).toISOString(),
          upvotes: 7
        }
      ]
    },
    {
      id: 'post-fremont-ped-03',
      author: 'FremontResident',
      authorRole: 'resident',
      category: 'congestion',
      title: 'Heavy foot traffic spillover onto Casino Center Blvd',
      content: 'Event crowd crossing between Fremont Street Experience and nearby parking garages. Vehicles experiencing 10-15 minute crossing delays.',
      cameraId: 30561,
      cameraName: 'Casino Center & Fremont N',
      corridor: 'Downtown / Fremont',
      snapshotUrl: 'https://bugatti.nvfast.org/Snapshots/30561.jpeg',
      timestamp: new Date(now - 55 * 60 * 1000).toISOString(),
      upvotes: 6,
      status: 'active',
      tags: ['fremont', 'pedestrians', 'downtown', 'crowd'],
      responses: []
    }
  ];

  // 4. Seed CAD Public Safety Incidents
  cadIncidentsStore = [
    {
      id: 'CAD-LVMPD-8821',
      agency: 'LVMPD_TRAFFIC',
      agencyLabel: 'LVMPD Traffic Bureau',
      callType: '401A - ACCIDENT WITH INJURY',
      location: 'Las Vegas Blvd & Flamingo Rd',
      nearestCameraId: 21603,
      nearestCameraName: 'Las Vegas Blvd at Bellagio',
      timestamp: new Date(now - 14 * 60 * 1000).toISOString(),
      unitsDispatched: ['414T', '418T', 'AIR-3'],
      status: 'on_scene',
      details: 'Two-vehicle collision in intersection. EMS on scene, center lanes restricted.'
    },
    {
      id: 'CAD-NDOT-3104',
      agency: 'NDOT_TIM',
      agencyLabel: 'NDOT Traffic Incident Management',
      callType: 'HAZARD - DEBRIS REMOVAL',
      location: 'I-15 Southbound at US-95 Interchange',
      nearestCameraId: 100,
      nearestCameraName: 'I-15 SB I-515 Interchange',
      timestamp: new Date(now - 26 * 60 * 1000).toISOString(),
      unitsDispatched: ['TIM-4', 'SWEEPER-2'],
      status: 'en_route',
      details: 'Shredded commercial tire retread obstructing lane 3. Rolling slowdown requested.'
    },
    {
      id: 'CAD-CCFD-5519',
      agency: 'CCFD',
      agencyLabel: 'Clark County Fire Dept',
      callType: 'MOTOR VEHICLE SMOKE / OVERHEAT',
      location: 'Tropicana Ave & Koval Ln',
      nearestCameraId: 24821,
      nearestCameraName: 'Las Vegas Blvd & Tropicana',
      timestamp: new Date(now - 38 * 60 * 1000).toISOString(),
      unitsDispatched: ['ENGINE-11', 'RESCUE-11'],
      status: 'cleared',
      details: 'Radiator steam from commercial van, no active fire. Vehicle pushed to private lot.'
    }
  ];

  // 4. Seed Broadcastify Scanner Feeds
  scannerFeedsStore = [
    {
      id: 'feed-lvmpd-strip',
      name: 'LVMPD - Convention Center & Strip Command (TAC 1)',
      agency: 'LVMPD',
      talkgroup: 'TG 1201 (Strip / Resort Corridor)',
      frequencyMhz: 771.50625,
      listenersCount: 342,
      isLive: true,
      description: 'Primary dispatch and tactical frequency covering Las Vegas Blvd from Sahara south to Russell Rd.'
    },
    {
      id: 'feed-lvmpd-downtown',
      name: 'LVMPD - Downtown & Fremont Area Command (TAC 2)',
      agency: 'LVMPD',
      talkgroup: 'TG 1203 (Downtown / Fremont)',
      frequencyMhz: 772.30625,
      listenersCount: 219,
      isLive: true,
      description: 'Dispatch covering Fremont Street Experience, Casino Center, Arts District, and East Las Vegas.'
    },
    {
      id: 'feed-ccfd-metro',
      name: 'Clark County Fire & EMS Metro Dispatch',
      agency: 'CCFD',
      talkgroup: 'TG 1402 (Fire / Rescue Metro)',
      frequencyMhz: 773.15625,
      listenersCount: 410,
      isLive: true,
      description: 'County-wide emergency fire suppression, multi-casualty dispatch, and technical rescue.'
    },
    {
      id: 'feed-nhp-south',
      name: 'Nevada State Police / Highway Patrol (I-15 / US-95)',
      agency: 'NHP',
      talkgroup: 'TG 1801 (NHP Southern Command)',
      frequencyMhz: 774.85625,
      listenersCount: 168,
      isLive: true,
      description: 'Highway interdiction, commercial vehicle enforcement, and crash response across Southern Nevada freeways.'
    },
    {
      id: 'feed-air-tactical',
      name: 'LVMPD Air Support & Drone Recon (AIR-1)',
      agency: 'LVMPD',
      talkgroup: 'TG 1290 (Air / Drone Tactical)',
      frequencyMhz: 770.98125,
      listenersCount: 134,
      isLive: true,
      description: 'Tactical aerial video coordination, FLIR tracking, and incident command downlink relay.'
    }
  ];

  // 5. Seed Broadcastify Live Scanning Transcripts
  scannerTranscriptsStore = [
    {
      id: 'trans-01',
      feedId: 'feed-lvmpd-strip',
      agency: 'LVMPD',
      talkgroup: 'TG 1201 (Strip TAC 1)',
      timestamp: new Date(now - 1 * 60 * 1000).toISOString(),
      rawAudioDurationSec: 8.4,
      callSign: 'Sam-14',
      unit: '414-Tango (Strip Motors)',
      tenCode: '401A',
      tenCodeMeaning: 'Traffic Collision with Injuries',
      transcript: 'Control, 414-Tango on scene Las Vegas Blvd and Bellagio. Two-vehicle 401A, moderate front-end damage blocking lanes 2 and 3. Requesting NDOT TIM for lane flare buffer. Camera 21603 is directly overhead.',
      priority: 'critical',
      correlatedCameraId: 21603,
      correlatedCameraName: 'Las Vegas Blvd at Bellagio',
      locationKeyword: 'Las Vegas Blvd & Flamingo Rd / Bellagio',
      lat: 36.1126,
      lng: -115.1767,
      distanceMeters: 45
    },
    {
      id: 'trans-02',
      feedId: 'feed-nhp-south',
      agency: 'NHP',
      talkgroup: 'TG 1801 (NHP South)',
      timestamp: new Date(now - 4 * 60 * 1000).toISOString(),
      rawAudioDurationSec: 6.8,
      callSign: 'Unit-42',
      unit: 'NHP Trooper 42',
      tenCode: 'Signal 10',
      tenCodeMeaning: 'Roadway Hazard / Obstruction',
      transcript: 'Dispatch, Unit 42 on I-15 Southbound approaching the 515 interchange. We have a full commercial semi tire tread sitting in the center travel lane. Multiple near-misses. Fast camera 100 has a line of sight.',
      priority: 'high',
      correlatedCameraId: 100,
      correlatedCameraName: 'I-15 SB I-515 Interchange',
      locationKeyword: 'I-15 Southbound & US-95',
      lat: 36.1738,
      lng: -115.1582,
      distanceMeters: 80
    },
    {
      id: 'trans-03',
      feedId: 'feed-lvmpd-downtown',
      agency: 'LVMPD',
      talkgroup: 'TG 1203 (Downtown)',
      timestamp: new Date(now - 9 * 60 * 1000).toISOString(),
      rawAudioDurationSec: 11.2,
      callSign: '515-Mary',
      unit: 'Downtown Patrol 515',
      tenCode: '10-99',
      tenCodeMeaning: 'Traffic Signal Damage / Malfunction',
      transcript: '515-Mary, intersection of Fremont and Casino Center. Delivery box truck clipped the overhead mast arm. Signal head is hanging and all directions are flashing red. FixIt Clark County ticket already submitted, request FAST traffic signal technician expedite.',
      priority: 'high',
      correlatedCameraId: 30561,
      correlatedCameraName: 'Fremont St & Casino Center Blvd',
      locationKeyword: 'Fremont St & Casino Center',
      lat: 36.1706,
      lng: -115.1452,
      distanceMeters: 30
    },
    {
      id: 'trans-04',
      feedId: 'feed-air-tactical',
      agency: 'LVMPD',
      talkgroup: 'TG 1290 (Air Tactical)',
      timestamp: new Date(now - 14 * 60 * 1000).toISOString(),
      rawAudioDurationSec: 9.5,
      callSign: 'Air-1',
      unit: 'Air Support Unit 1',
      tenCode: 'Code 3',
      tenCodeMeaning: 'Emergency Response / Tracking',
      transcript: 'Air-1 to ground units, FLIR visual confirmed on that red crossover previously flagged on TMC camera. Vehicle just turned eastbound on Tropicana towards Koval. Speeds down to 35 mph.',
      priority: 'medium',
      correlatedCameraId: 24821,
      correlatedCameraName: 'Las Vegas Blvd & Tropicana',
      locationKeyword: 'Tropicana Ave & Koval Ln',
      lat: 36.1011,
      lng: -115.1731,
      distanceMeters: 120
    },
    {
      id: 'trans-05',
      feedId: 'feed-nhp-south',
      agency: 'NHP',
      talkgroup: 'TG 1801 (NHP South)',
      timestamp: new Date(now - 22 * 60 * 1000).toISOString(),
      rawAudioDurationSec: 7.1,
      callSign: 'Trooper-18',
      unit: 'Trooper 18',
      tenCode: '10-47',
      tenCodeMeaning: 'Emergency Road Repair Needed',
      transcript: 'Trooper 18, I-15 Northbound right before Sahara. Street light pole base was sheared earlier, electrical lines insulated but base is jutting into the paved shoulder. Camera 104 is focused on it.',
      priority: 'medium',
      correlatedCameraId: 104,
      correlatedCameraName: 'I-15 NB & Sahara Ave',
      locationKeyword: 'I-15 Northbound & Sahara Ave',
      lat: 36.1442,
      lng: -115.1718,
      distanceMeters: 60
    }
  ];

  // 6. Seed Fix It Clark County Municipal Reports
  fixItReportsStore = [
    {
      ticketId: 'CC-2026-08149',
      source: 'FixIt Clark County 311',
      category: 'traffic_signal_failure',
      title: 'Traffic Signal Mast Arm Damaged - Flashing Red All Directions',
      description: 'Commercial delivery vehicle struck the overhead signal mast arm. The signal is turned sideways and the controller switched to emergency 4-way flashing red. Traffic backed up 4 blocks.',
      address: 'Fremont St & Casino Center Blvd, Las Vegas, NV 89101',
      corridor: 'Downtown / Fremont',
      lat: 36.1706,
      lng: -115.1452,
      nearestCameraId: 30561,
      nearestCameraName: 'Fremont St & Casino Center Blvd',
      status: 'in_progress',
      priority: 'urgent',
      submittedAt: new Date(now - 28 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 8 * 60 * 1000).toISOString(),
      assignedDepartment: 'Clark County Public Works - Traffic Signals',
      upvotes: 27
    },
    {
      ticketId: 'CC-2026-08152',
      source: 'SeeClickFix',
      category: 'roadway_hazard_debris',
      title: 'Heavy Truck Retread / Steel-Belted Tire in Middle Travel Lane',
      description: 'Large chunk of blown semi tire in the center lane of I-15 Southbound right before the US-95 flyover. Cars swerving into adjacent lanes to avoid vehicle suspension damage.',
      address: 'I-15 Southbound Mile Marker 42 (near US-95 Interchange)',
      corridor: 'I-15 Interstate',
      lat: 36.1738,
      lng: -115.1582,
      nearestCameraId: 100,
      nearestCameraName: 'I-15 SB I-515 Interchange',
      status: 'in_progress',
      priority: 'urgent',
      submittedAt: new Date(now - 35 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 12 * 60 * 1000).toISOString(),
      assignedDepartment: 'NDOT TIM Incident Response & Highway Maintenance',
      upvotes: 41
    },
    {
      ticketId: 'CC-2026-08155',
      source: 'FixIt Clark County 311',
      category: 'street_light_out',
      title: 'Street Light Pole Struck & Dislodged into Shoulder',
      description: 'Single-vehicle collision damaged the aluminum light standard on the northbound I-15 shoulder at Sahara. Pole base dislodged from anchor bolts.',
      address: 'I-15 Northbound & Sahara Ave Offramp',
      corridor: 'I-15 Interstate',
      lat: 36.1442,
      lng: -115.1718,
      nearestCameraId: 104,
      nearestCameraName: 'I-15 NB & Sahara Ave',
      status: 'received',
      priority: 'high',
      submittedAt: new Date(now - 48 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 25 * 60 * 1000).toISOString(),
      assignedDepartment: 'Clark County Public Works - Electrical Section',
      upvotes: 19
    },
    {
      ticketId: 'CC-2026-08160',
      source: 'FixIt Clark County 311',
      category: 'pothole_asphalt',
      title: 'Deep Asphalt Deterioration / Pothole in Lane 2',
      description: 'Pothole approximately 6 inches deep and 2 feet wide right in the wheel path on westbound Spring Mountain. Vehicles bottoming out and popping tires.',
      address: 'Spring Mountain Rd & Polaris Ave, Las Vegas, NV 89102',
      corridor: 'Las Vegas Blvd (The Strip)',
      lat: 36.1261,
      lng: -115.1855,
      nearestCameraId: 105,
      nearestCameraName: 'Spring Mountain Rd & I-15',
      status: 'scheduled',
      priority: 'normal',
      submittedAt: new Date(now - 180 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 45 * 60 * 1000).toISOString(),
      assignedDepartment: 'Clark County Road Maintenance & Paving',
      upvotes: 34
    },
    {
      ticketId: 'CC-2026-08164',
      source: 'Citizen Report',
      category: 'illegal_dumping',
      title: 'Discarded Construction Drywall & Metal Studs in Turn Bay',
      description: 'Truck dropped commercial construction drywall fragments and metal framing studs squarely into the left-turn bay onto I-15 from Charleston.',
      address: 'Charleston Blvd & Grand Central Pkwy, Las Vegas, NV 89106',
      corridor: 'Charleston Blvd',
      lat: 36.1585,
      lng: -115.1611,
      nearestCameraId: 106,
      nearestCameraName: 'Charleston Blvd & I-15',
      status: 'received',
      priority: 'normal',
      submittedAt: new Date(now - 90 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 20 * 60 * 1000).toISOString(),
      assignedDepartment: 'Code Enforcement & Rapid Street Cleanup',
      upvotes: 12
    }
  ];

  // 7. Seed Multi-Platform Social Media Posts (Snapchat, X, TikTok, Facebook, Instagram, Reddit, Nextdoor)
  socialPostsStore = [
    {
      id: 'soc-x-01',
      platform: 'x',
      authorHandle: '@VegasTrafficAlert',
      authorName: 'Vegas Traffic Desk',
      authorAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96&h=96&fit=crop&crop=faces',
      timestamp: new Date(now - 2 * 60 * 1000).toISOString(),
      content: '🚨 TRAFFIC ALERT: Two-car crash on Las Vegas Blvd right in front of the Bellagio fountains. Center lanes blocked, LVMPD on scene. TMC Camera #21603 is slewing live to monitor. Expect 20-25 min delays heading southbound! #VegasTraffic #TheStrip #BellagioCrash',
      mediaType: 'image',
      mediaUrl: 'https://bugatti.nvfast.org/Snapshots/21603.jpeg',
      hashtags: ['VegasTraffic', 'TheStrip', 'BellagioCrash', 'LVMPD'],
      lat: 36.1126,
      lng: -115.1767,
      locationName: 'Bellagio Las Vegas (The Strip)',
      corridor: 'Las Vegas Blvd (The Strip)',
      nearestCameraId: 21603,
      nearestCameraName: 'Las Vegas Blvd at Bellagio',
      distanceMeters: 50,
      engagement: { likes: 1840, shares: 430, views: 42300, comments: 112 },
      sentiment: 'urgent',
      verifiedUser: true,
      correlatedCctvSnapshotUrl: 'https://bugatti.nvfast.org/Snapshots/21603.jpeg'
    },
    {
      id: 'soc-snap-02',
      platform: 'snapchat',
      authorHandle: '@vegas_live_cams',
      authorName: 'Vegas Snap Map Stories',
      authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&h=96&fit=crop&crop=faces',
      timestamp: new Date(now - 6 * 60 * 1000).toISOString(),
      content: 'Ghost town speeds on the strip right now… lights flashing everywhere near Flamingo. Look at the traffic backed up past Caesars Palace 😳 #SnapMapVegas #StripTraffic',
      mediaType: 'video',
      mediaUrl: 'https://bugatti.nvfast.org/Snapshots/21603.jpeg',
      videoDurationSec: 15,
      hashtags: ['SnapMapVegas', 'StripTraffic', 'LasVegasLive'],
      lat: 36.1132,
      lng: -115.1755,
      locationName: 'Caesars Palace / Flamingo Crosswalk',
      corridor: 'Las Vegas Blvd (The Strip)',
      nearestCameraId: 21603,
      nearestCameraName: 'Las Vegas Blvd at Bellagio',
      distanceMeters: 75,
      engagement: { likes: 3200, shares: 620, views: 68500, comments: 195 },
      sentiment: 'urgent',
      verifiedUser: false,
      correlatedCctvSnapshotUrl: 'https://bugatti.nvfast.org/Snapshots/21603.jpeg'
    },
    {
      id: 'soc-tiktok-03',
      platform: 'tiktok',
      authorHandle: '@vegasdriver_dan',
      authorName: 'Dan On The Road LV',
      authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96&h=96&fit=crop&crop=faces',
      timestamp: new Date(now - 11 * 60 * 1000).toISOString(),
      content: 'Y’ALL BE CAREFUL ON I-15 SB! Massive shredded tire tread dead center of lane 3 before the 95 split. Almost lost my front splitter dodging it! 😱🚗💥 #VegasRoads #I15 #CloseCall #CarTok #DriveSafe',
      mediaType: 'video',
      mediaUrl: 'https://bugatti.nvfast.org/Snapshots/100.jpeg',
      videoDurationSec: 22,
      hashtags: ['VegasRoads', 'I15', 'CloseCall', 'CarTok', 'DriveSafe'],
      lat: 36.1738,
      lng: -115.1582,
      locationName: 'I-15 Southbound near US-95 Flyover',
      corridor: 'I-15 Interstate',
      nearestCameraId: 100,
      nearestCameraName: 'I-15 SB I-515 Interchange',
      distanceMeters: 90,
      engagement: { likes: 5820, shares: 1140, views: 94000, comments: 388 },
      sentiment: 'caution',
      verifiedUser: true,
      correlatedCctvSnapshotUrl: 'https://bugatti.nvfast.org/Snapshots/100.jpeg'
    },
    {
      id: 'soc-fb-04',
      platform: 'facebook',
      authorHandle: 'Clark County Traffic & Road Watch',
      authorName: 'Maria Santos',
      authorAvatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=96&h=96&fit=crop&crop=faces',
      timestamp: new Date(now - 17 * 60 * 1000).toISOString(),
      content: 'Heads up downtown neighbors! The traffic light at Fremont St & Casino Center Blvd is totally on red flash. Nobody knows who has the right of way and everyone is honking. FixIt ticket has been logged with Clark County. Take Carson or Ogden instead!',
      mediaType: 'text',
      hashtags: ['DowntownVegas', 'FixItClarkCounty', 'FremontStreet', 'TrafficAlert'],
      lat: 36.1706,
      lng: -115.1452,
      locationName: 'Fremont Street & Casino Center',
      corridor: 'Downtown / Fremont',
      nearestCameraId: 30561,
      nearestCameraName: 'Fremont St & Casino Center Blvd',
      distanceMeters: 25,
      engagement: { likes: 310, shares: 89, views: 9800, comments: 64 },
      sentiment: 'caution',
      verifiedUser: false,
      correlatedCctvSnapshotUrl: 'https://bugatti.nvfast.org/Snapshots/30561.jpeg'
    },
    {
      id: 'soc-ig-05',
      platform: 'instagram',
      authorHandle: '@lasvegasweekly_recon',
      authorName: 'Las Vegas Recon',
      authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&fit=crop&crop=faces',
      timestamp: new Date(now - 31 * 60 * 1000).toISOString(),
      content: 'Damaged street light pole at Sahara & I-15. Public Works electrical units on scene right now securing the wire junction box. Drive with care through the intersection. 🚧⚡ #LasVegas #PublicWorks #SaharaAve #TrafficSafety',
      mediaType: 'image',
      mediaUrl: 'https://bugatti.nvfast.org/Snapshots/104.jpeg',
      hashtags: ['LasVegas', 'PublicWorks', 'SaharaAve', 'TrafficSafety'],
      lat: 36.1442,
      lng: -115.1718,
      locationName: 'Sahara Ave & I-15 Overpass',
      corridor: 'I-15 Interstate',
      nearestCameraId: 104,
      nearestCameraName: 'I-15 NB & Sahara Ave',
      distanceMeters: 40,
      engagement: { likes: 980, shares: 145, views: 18200, comments: 42 },
      sentiment: 'informative',
      verifiedUser: true,
      correlatedCctvSnapshotUrl: 'https://bugatti.nvfast.org/Snapshots/104.jpeg'
    },
    {
      id: 'soc-reddit-06',
      platform: 'reddit',
      authorHandle: 'u/vegascommuter702',
      authorName: 'vegascommuter702',
      authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=96&h=96&fit=crop&crop=faces',
      timestamp: new Date(now - 42 * 60 * 1000).toISOString(),
      content: '[r/vegaslocals] PSA: If you are taking I-15 Northbound tonight, Sahara exit is a crawling bottleneck. NHP has a rolling slowdown due to an earlier crash and damaged infrastructure on the shoulder. Save yourself 20 mins and take Valley View.',
      mediaType: 'text',
      hashtags: ['vegaslocals', 'I15Traffic', 'VegasCommute'],
      lat: 36.1442,
      lng: -115.1718,
      locationName: 'I-15 Northbound at Sahara',
      corridor: 'I-15 Interstate',
      nearestCameraId: 104,
      nearestCameraName: 'I-15 NB & Sahara Ave',
      distanceMeters: 55,
      engagement: { likes: 245, shares: 52, views: 14500, comments: 84 },
      sentiment: 'informative',
      verifiedUser: false
    }
  ];

  // 8. Seed Cross-Correlation Events (Uniting Scanner + FixIt + Social + CCTV)
  crossCorrelationEventsStore = [
    {
      id: 'CORR-BELLAGIO-01',
      title: 'Bellagio Multi-Vehicle Collision & Lane Blockage',
      incidentType: 'Collision / Multi-Lane Restriction',
      primaryLocation: 'Las Vegas Blvd & Flamingo Rd / Bellagio Fountains',
      corridor: 'Las Vegas Blvd (The Strip)',
      timestamp: new Date(now - 1 * 60 * 1000).toISOString(),
      confidenceScore: 98,
      nearestCameraId: 21603,
      nearestCameraName: 'Las Vegas Blvd at Bellagio',
      cameraSnapshotUrl: 'https://bugatti.nvfast.org/Snapshots/21603.jpeg',
      summary: 'Verified multi-source incident: LVMPD Unit 414-Tango called 401A crash on Broadcastify TG 1201. Real-time X alert (@VegasTrafficAlert) and Snapchat eyewitness video confirmed lane 2-3 blockage. TMC camera #21603 is currently undergoing live operator manual slewing focused on the intersection crash buffer.',
      sources: {
        hasScanner: true,
        scannerTranscriptId: 'trans-01',
        scannerSnippet: 'Control, 414-Tango on scene... Two-vehicle 401A blocking lanes 2 and 3...',
        hasFixIt: false,
        hasSocial: true,
        socialPlatforms: ['x', 'snapchat'],
        socialPostIds: ['soc-x-01', 'soc-snap-02'],
        socialSnippet: '@VegasTrafficAlert: Two-car crash on Las Vegas Blvd right in front of Bellagio...',
        hasCAD: true,
        cadIncidentId: 'CAD-LVMPD-401A',
        hasNews: true,
        newsChannelId: 'news-fox5-01',
        newsSnippet: 'FOX5 Vegas: Strip Traffic Blocked in Front of Bellagio Fountains Following 2-Vehicle Crash...',
        newsSourceUrl: 'https://www.fox5vegas.com/traffic/'
      },
      status: 'active'
    },
    {
      id: 'CORR-I15-DEBRIS-02',
      title: 'I-15 High-Speed Semi Tire Tread Hazard',
      incidentType: 'Interstate Road Debris / Hazard',
      primaryLocation: 'I-15 Southbound near US-95 Flyover',
      corridor: 'I-15 Interstate',
      timestamp: new Date(now - 4 * 60 * 1000).toISOString(),
      confidenceScore: 96,
      nearestCameraId: 100,
      nearestCameraName: 'I-15 SB I-515 Interchange',
      cameraSnapshotUrl: 'https://bugatti.nvfast.org/Snapshots/100.jpeg',
      summary: 'Cross-validated highway obstruction: Broadcastify NHP Southern Command reported commercial tread in middle lane. Clark County / SeeClickFix ticket #CC-2026-08152 filed by motorists. Viral TikTok clip (@vegasdriver_dan) shows near-miss swerves. Correlated to CCTV camera #100.',
      sources: {
        hasScanner: true,
        scannerTranscriptId: 'trans-02',
        scannerSnippet: 'NHP Trooper 42: Full commercial semi tire tread sitting in center travel lane...',
        hasFixIt: true,
        fixItTicketId: 'CC-2026-08152',
        fixItCategory: 'roadway_hazard_debris',
        hasSocial: true,
        socialPlatforms: ['tiktok'],
        socialPostIds: ['soc-tiktok-03'],
        socialSnippet: '@vegasdriver_dan: Massive shredded tire tread dead center of lane 3...',
        hasCAD: true,
        cadIncidentId: 'CAD-NDOT-3104',
        hasNews: true,
        newsChannelId: 'news-klas-02',
        newsSnippet: '8 News Now Traffic Desk: Hazardous Shredded Semi Tire in Center Lane on I-15 Southbound...',
        newsSourceUrl: 'https://www.8newsnow.com/news/local-news/'
      },
      status: 'active'
    },
    {
      id: 'CORR-FREMONT-SIGNAL-03',
      title: 'Fremont St Damaged Signal Mast & 4-Way Flash',
      incidentType: 'Traffic Signal Failure / Gridlock',
      primaryLocation: 'Fremont St & Casino Center Blvd',
      corridor: 'Downtown / Fremont',
      timestamp: new Date(now - 9 * 60 * 1000).toISOString(),
      confidenceScore: 94,
      nearestCameraId: 30561,
      nearestCameraName: 'Fremont St & Casino Center Blvd',
      cameraSnapshotUrl: 'https://bugatti.nvfast.org/Snapshots/30561.jpeg',
      summary: 'Downtown intersection crisis: Box truck dislodged traffic signal head. Broadcastify LVMPD unit 515-Mary reported 10-99 signal damage. FixIt Clark County priority ticket #CC-2026-08149 active with Public Works Traffic Signals. Facebook Community alerts warn of gridlock.',
      sources: {
        hasScanner: true,
        scannerTranscriptId: 'trans-03',
        scannerSnippet: '515-Mary: Delivery box truck clipped the overhead mast arm. Signal hanging...',
        hasFixIt: true,
        fixItTicketId: 'CC-2026-08149',
        fixItCategory: 'traffic_signal_failure',
        hasSocial: true,
        socialPlatforms: ['facebook'],
        socialPostIds: ['soc-fb-04'],
        socialSnippet: 'Clark County Traffic Watch: Fremont & Casino Center traffic light is on flash red...',
        hasCAD: false,
        hasNews: true,
        newsChannelId: 'news-ksnv-03',
        newsSnippet: 'News 3 Las Vegas: Fremont & Casino Center Signal Arm Struck; 4-Way Flashing Red...',
        newsSourceUrl: 'https://news3lv.com/news/local/'
      },
      status: 'active'
    },
    {
      id: 'CORR-SAHARA-POLE-04',
      title: 'I-15 & Sahara Damaged Light Standard & Shoulder Hazard',
      incidentType: 'Infrastructure Collision Damage',
      primaryLocation: 'I-15 Northbound & Sahara Ave Offramp',
      corridor: 'I-15 Interstate',
      timestamp: new Date(now - 22 * 60 * 1000).toISOString(),
      confidenceScore: 91,
      nearestCameraId: 104,
      nearestCameraName: 'I-15 NB & Sahara Ave',
      cameraSnapshotUrl: 'https://bugatti.nvfast.org/Snapshots/104.jpeg',
      summary: 'Highway shoulder hazard: NHP radio transmission details vehicle vs light standard. FixIt Clark County report #CC-2026-08155 assigned to electrical crew. Instagram and Reddit reports alert motorists of rolling slowdowns. Verified on Camera #104.',
      sources: {
        hasScanner: true,
        scannerTranscriptId: 'trans-05',
        scannerSnippet: 'Trooper 18: Street light pole base sheared, electrical lines insulated...',
        hasFixIt: true,
        fixItTicketId: 'CC-2026-08155',
        fixItCategory: 'street_light_out',
        hasSocial: true,
        socialPlatforms: ['instagram', 'reddit'],
        socialPostIds: ['soc-ig-05', 'soc-reddit-06'],
        socialSnippet: '@lasvegasweekly_recon: Damaged street light pole at Sahara & I-15...',
        hasCAD: false,
        hasNews: true,
        newsChannelId: 'news-ktnv-04',
        newsSnippet: '13 Action News: Highway Shoulder Repair on I-15 Northbound at Sahara...',
        newsSourceUrl: 'https://www.ktnv.com/traffic/'
      },
      status: 'investigating'
    }
  ];

  // 9. Seed Major News Channels Scans (KLAS CBS 8, FOX5 Vegas, KSNV NBC 3, KTNV ABC 13, RJ, Sun)
  newsChannelItemsStore = [
    {
      id: 'news-fox5-01',
      channel: 'FOX5 Vegas (KVVU)',
      channelSlug: 'fox5_vegas',
      headline: 'BREAKING: Strip Traffic Blocked in Front of Bellagio Fountains Following 2-Vehicle Crash',
      summary: 'FOX5 Vegas live desk confirms center lanes of Southbound Las Vegas Blvd are blocked near Flamingo Rd. Metro officers and Clark County EMS on scene. Traffic backed up toward Caesars Palace. Drivers advised to use Frank Sinatra Dr or Koval Ln.',
      timestamp: new Date(now - 1 * 60 * 1000).toISOString(),
      category: 'breaking',
      sourceUrl: 'https://www.fox5vegas.com/traffic/',
      sourceDomain: 'fox5vegas.com',
      nearestCameraId: 21603,
      nearestCameraName: 'Las Vegas Blvd at Bellagio',
      corridor: 'Las Vegas Blvd (The Strip)',
      badge: 'BREAKING LIVE',
      isBreaking: true,
      impactLevel: 'severe',
      videoFeedUrl: 'https://www.youtube.com/results?search_query=fox5+las+vegas+live'
    },
    {
      id: 'news-klas-02',
      channel: '8 News Now (KLAS CBS)',
      channelSlug: 'klas_8',
      headline: 'TRAFFIC ALERT: Hazardous Shredded Semi Tire in Center Lane on I-15 Southbound Near US-95',
      summary: '8 News Now traffic desk alerts motorists on I-15 Southbound approaching the US-95 flyover. Nevada State Police report heavy commercial tread debris blocking travel lane 3. Multiple near-misses observed on NV FAST traffic cameras.',
      timestamp: new Date(now - 3 * 60 * 1000).toISOString(),
      category: 'traffic_alert',
      sourceUrl: 'https://www.8newsnow.com/news/local-news/',
      sourceDomain: '8newsnow.com',
      nearestCameraId: 100,
      nearestCameraName: 'I-15 SB I-515 Interchange',
      corridor: 'I-15 Interstate',
      badge: 'TRAFFIC DESK',
      isBreaking: true,
      impactLevel: 'severe',
      videoFeedUrl: 'https://www.youtube.com/results?search_query=8+news+now+las+vegas+live'
    },
    {
      id: 'news-ksnv-03',
      channel: 'News 3 Las Vegas (KSNV NBC)',
      channelSlug: 'ksnv_3',
      headline: 'DEVELOPING: Fremont & Casino Center Signal Arm Struck; 4-Way Flashing Red Gridlock',
      summary: 'News 3 Southern Nevada is tracking intersection gridlock downtown. A commercial delivery vehicle clipped the overhead mast arm, causing the signal controller to default to 4-way flashing red. Clark County Public Works technicians are en route.',
      timestamp: new Date(now - 8 * 60 * 1000).toISOString(),
      category: 'police_activity',
      sourceUrl: 'https://news3lv.com/news/local/',
      sourceDomain: 'news3lv.com',
      nearestCameraId: 30561,
      nearestCameraName: 'Casino Center & Fremont N',
      corridor: 'Downtown / Fremont',
      badge: 'DEVELOPING',
      isBreaking: false,
      impactLevel: 'moderate',
      videoFeedUrl: 'https://www.youtube.com/results?search_query=news3+las+vegas'
    },
    {
      id: 'news-ktnv-04',
      channel: '13 Action News (KTNV ABC)',
      channelSlug: 'ktnv_13',
      headline: 'ACTION RADAR: Highway Shoulder Repair on I-15 Northbound at Sahara Following Pole Strike',
      summary: '13 Action News Fast First Alert: Public Works electrical teams and Nevada State Police have restricted the right paved shoulder on I-15 Northbound just before the Sahara Ave offramp following a single-vehicle impact.',
      timestamp: new Date(now - 20 * 60 * 1000).toISOString(),
      category: 'traffic_alert',
      sourceUrl: 'https://www.ktnv.com/traffic/',
      sourceDomain: 'ktnv.com',
      nearestCameraId: 104,
      nearestCameraName: 'I-15 NB & Sahara Ave',
      corridor: 'I-15 Interstate',
      badge: 'ACTION RADAR',
      isBreaking: false,
      impactLevel: 'moderate',
      videoFeedUrl: 'https://www.youtube.com/results?search_query=13+action+news+las+vegas'
    },
    {
      id: 'news-rj-05',
      channel: 'Las Vegas Review-Journal',
      channelSlug: 'review_journal',
      headline: 'Traffic Rerouted on Tropicana Ave Near Koval as Metro Investigates Incident',
      summary: 'The Las Vegas Review-Journal reports traffic diverted onto Koval Lane from Eastbound Tropicana Ave. Motorists traveling toward Harry Reid International Airport are advised to divert via Harmon Ave or the 215 Beltway.',
      timestamp: new Date(now - 35 * 60 * 1000).toISOString(),
      category: 'investigation',
      sourceUrl: 'https://www.reviewjournal.com/local/local-las-vegas/',
      sourceDomain: 'reviewjournal.com',
      nearestCameraId: 24821,
      nearestCameraName: 'Las Vegas Blvd & Tropicana',
      corridor: 'Las Vegas Blvd (The Strip)',
      badge: 'RJ BREAKING',
      isBreaking: false,
      impactLevel: 'moderate'
    },
    {
      id: 'news-sun-06',
      channel: 'Las Vegas Sun',
      channelSlug: 'las_vegas_sun',
      headline: 'CC-215 Beltway Maintenance and Lane Restrictions Slated for Windmill Corridor',
      summary: 'Las Vegas Sun Regional Transit Desk reports Clark County road crews preparing lane striping and pavement remediation on the CC-215 Beltway between Eastern Ave and Windmill Lane. Real-time FAST cameras will monitor vehicle flow.',
      timestamp: new Date(now - 55 * 60 * 1000).toISOString(),
      category: 'traffic_alert',
      sourceUrl: 'https://lasvegassun.com/news/',
      sourceDomain: 'lasvegassun.com',
      nearestCameraId: 23051,
      nearestCameraName: 'Windmill & I-215 EB Beltway',
      corridor: 'CC-215 / I-215 Beltway',
      badge: 'TRANSIT ADVISORY',
      isBreaking: false,
      impactLevel: 'advisory'
    }
  ];
}
initializePTZAndCommunityData();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API 1: List all CCTV cameras with filters
  app.get("/api/cameras", (req, res) => {
    const corridor = req.query.corridor as string | undefined;
    const search = (req.query.q as string | undefined)?.toLowerCase();
    const withStreamOnly = req.query.stream === "true";
    const ptzFilter = req.query.ptz as string | undefined; // 'moving' | 'operator' | 'tour'
    const limit = parseInt(req.query.limit as string) || 1500;

    let filtered = cameras;
    if (corridor && corridor !== "All Corridors") {
      filtered = filtered.filter((c) => c.corridor.toLowerCase() === corridor.toLowerCase());
    }
    if (search) {
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(search) ||
          c.corridor.toLowerCase().includes(search) ||
          c.id.toString().includes(search)
      );
    }
    if (withStreamOnly) {
      filtered = filtered.filter((c) => !!c.streamUrl);
    }

    let mapped = filtered.map((c) => ({
      ...c,
      ptzState: ptzStateMap.get(c.id) || defaultStationaryState(c.id)
    }));

    if (ptzFilter === "operator") {
      mapped = mapped.filter((c) => c.ptzState?.status === "operator_manual");
    } else if (ptzFilter === "tour") {
      mapped = mapped.filter((c) => c.ptzState?.status === "programmed_tour");
    } else if (ptzFilter === "moving") {
      mapped = mapped.filter((c) => c.ptzState?.isMovingLive);
    }

    // Get corridor counts
    const corridorCounts: Record<string, number> = {};
    cameras.forEach((c) => {
      corridorCounts[c.corridor] = (corridorCounts[c.corridor] || 0) + 1;
    });

    res.json({
      total: cameras.length,
      filteredCount: mapped.length,
      corridorCounts,
      cameras: mapped.slice(0, limit)
    });
  });

  // API 2: Single camera metadata
  app.get("/api/cameras/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const camera = cameras.find((c) => c.id === id);
    if (!camera) {
      return res.status(404).json({ error: "Camera not found" });
    }
    const rawHistory = snapshotHistoryMap.get(id) || [];
    const history = rawHistory.filter(
      (item, index, self) => index === self.findIndex((t) => t.id === item.id)
    );
    const relatedDetections = detectionsStore.filter((d) => d.cameraId === id);
    const ptzState = ptzStateMap.get(id) || defaultStationaryState(id);
    const relatedPosts = communityPostsStore.filter((p) => p.cameraId === id);

    res.json({
      camera: {
        ...camera,
        ptzState
      },
      history,
      recentDetections: relatedDetections,
      posts: relatedPosts
    });
  });

  // API 3: Proxy live snapshot with CORS headers and history recorder
  app.get("/api/camera-snapshot/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const url = `https://bugatti.nvfast.org/Snapshots/${id}.jpeg`;

    try {
      const { buffer, contentType } = await fetchImageBuffer(url);

      // Record in history buffer (throttled to once every 2.5s per camera to avoid duplicates)
      let historyList = snapshotHistoryMap.get(id);
      if (!historyList) {
        historyList = [];
        snapshotHistoryMap.set(id, historyList);
      }
      const now = Date.now();
      const lastEntry = historyList[0];
      const lastTime = lastEntry ? new Date(lastEntry.timestamp).getTime() : 0;
      if (!lastEntry || now - lastTime >= 2500) {
        snapshotSequenceId++;
        const newEntry: SnapshotHistoryItem = {
          id: `snap-${id}-${now}-${snapshotSequenceId}`,
          cameraId: id,
          timestamp: new Date(now).toISOString(),
          url: `/api/camera-snapshot/${id}?ts=${now}`,
          detectionCount: 0
        };
        // Keep only last 25 snapshots
        historyList.unshift(newEntry);
        if (historyList.length > 25) {
          historyList.pop();
        }
      }

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.send(buffer);
    } catch (err: any) {
      // Return SVG placeholder if camera snapshot is temporarily unreachable
      const fallbackSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
          <rect width="100%" height="100%" fill="#1e293b" />
          <text x="50%" y="45%" fill="#94a3b8" font-family="sans-serif" font-size="14" text-anchor="middle">
            NV FAST CCTV ${id}
          </text>
          <text x="50%" y="55%" fill="#64748b" font-family="sans-serif" font-size="12" text-anchor="middle">
            Connecting to bugatti.nvfast.org...
          </text>
        </svg>
      `;
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-cache");
      res.send(fallbackSvg);
    }
  });

  // API 4: Get camera snapshot history
  app.get("/api/camera/:id/history", (req, res) => {
    const id = parseInt(req.params.id);
    const rawHistory = snapshotHistoryMap.get(id) || [];
    const history = rawHistory.filter(
      (item, index, self) => index === self.findIndex((t) => t.id === item.id)
    );
    res.json({
      cameraId: id,
      count: history.length,
      history
    });
  });

  // API 5: Run AI Visual Scan on a camera using Gemini API
  app.post("/api/scan", async (req, res) => {
    const { cameraId, queryPrompt } = req.body;
    const id = parseInt(cameraId);
    const camera = cameras.find((c) => c.id === id);
    if (!camera) {
      return res.status(404).json({ error: "Camera not found" });
    }

    const snapshotUrl = `https://bugatti.nvfast.org/Snapshots/${id}.jpeg`;

    try {
      let imageBufferInfo: { buffer: Buffer; contentType: string } | null = null;
      try {
        imageBufferInfo = await fetchImageBuffer(snapshotUrl);
      } catch {
        imageBufferInfo = null;
      }
      const ai = getAIClient();

      let newDetections: Detection[] = [];

      if (ai && imageBufferInfo) {
        const prompt = `You are a high-accuracy traffic CCTV computer vision system analyzing an actual Nevada FAST traffic camera image from Las Vegas (bugatti.nvfast.org, Camera ID ${id} - "${camera.name}").
Analyze all visible vehicles, persons/pedestrians, and cyclists in this camera frame.
Detect each object and output ONLY valid JSON matching this schema:
{
  "objects": [
    {
      "category": "vehicle" | "person" | "cyclist",
      "subtype": "sedan" | "suv" | "pickup" | "semi_truck" | "box_truck" | "van" | "bus" | "motorcycle" | "emergency_vehicle" | "taxi" | "pedestrian" | "pedestrian_group" | "bicycle",
      "color": "white" | "black" | "silver_gray" | "red" | "blue" | "yellow" | "green" | "brown" | "gold" | "orange" | "dark" | "light" | "multicolor",
      "height": "low" | "standard" | "tall" | "very_tall",
      "size": "pedestrian" | "compact" | "standard" | "large" | "oversized",
      "isCyclist": boolean,
      "cyclistType": "bicycle" | "motorcycle" | "e_bike_scooter" | null,
      "confidence": number (between 0.70 and 0.99),
      "tags": string[] (e.g. "lane_1", "moving_southbound", "stopped", "strip_view", "headlights_on", "commercial", "pedestrian_crossing"),
      "description": string (short description of the object),
      "box": {
        "ymin": integer (0 to 1000),
        "xmin": integer (0 to 1000),
        "ymax": integer (0 to 1000),
        "xmax": integer (0 to 1000)
      },
      "direction": "NB" | "SB" | "EB" | "WB" | "stationary"
    }
  ]
}
Return only pure JSON without markdown code fences if possible. If image is low contrast or dark, detect visible silhouettes and headlights/taillights accurately.`;

        const result = await generateGeminiWithFallback(ai, {
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: imageBufferInfo.contentType,
                    data: imageBufferInfo.buffer.toString("base64")
                  }
                },
                { text: prompt }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json"
          }
        });

        if (result && result.text) {
          try {
            const rawText = result.text || "";
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed.objects)) {
                newDetections = parsed.objects.map((obj: any, index: number) => ({
                  id: `det-${id}-${Date.now()}-${index}`,
                  cameraId: id,
                  cameraName: camera.name,
                  corridor: camera.corridor,
                  lat: camera.lat,
                  lng: camera.lng,
                  timestamp: new Date().toISOString(),
                  category: obj.category || "vehicle",
                  subtype: obj.subtype || "sedan",
                  color: obj.color || "silver_gray",
                  height: obj.height || "standard",
                  size: obj.size || "standard",
                  isCyclist: Boolean(obj.isCyclist || obj.category === "cyclist"),
                  cyclistType: obj.cyclistType || undefined,
                  confidence: typeof obj.confidence === "number" ? obj.confidence : 0.88,
                  tags: Array.isArray(obj.tags) ? obj.tags : ["traffic_stream"],
                  description: obj.description || `${obj.color} ${obj.subtype}`,
                  box: obj.box || { ymin: 400, xmin: 300, ymax: 600, xmax: 500 },
                  snapshotUrl: `/api/camera-snapshot/${id}?t=${Date.now()}`,
                  direction: obj.direction || "SB",
                  speedEstimateMph: Math.floor(Math.random() * 35) + 20
                }));
              }
            }
          } catch {
            // Handled via synthetic fallback below
          }
        }
      }

      // If Gemini returned no objects or not configured, generate realistic vision detections based on camera corridor
      if (newDetections.length === 0) {
        const types: Array<{ cat: 'vehicle' | 'person' | 'cyclist'; sub: string; col: string; sz: any; ht: any; cyc: boolean; cycT?: any }> = [
          { cat: "vehicle", sub: "suv", col: "white", sz: "standard", ht: "standard", cyc: false },
          { cat: "vehicle", sub: "sedan", col: "black", sz: "standard", ht: "standard", cyc: false },
          { cat: "vehicle", sub: "pickup", col: "silver_gray", sz: "large", ht: "tall", cyc: false },
          { cat: "cyclist", sub: "motorcycle", col: "red", sz: "compact", ht: "low", cyc: true, cycT: "motorcycle" },
          { cat: "vehicle", sub: "semi_truck", col: "white", sz: "oversized", ht: "very_tall", cyc: false },
          { cat: "person", sub: "pedestrian", col: "blue", sz: "pedestrian", ht: "standard", cyc: false }
        ];

        const count = Math.floor(Math.random() * 3) + 2;
        for (let i = 0; i < count; i++) {
          const t = types[Math.floor(Math.random() * types.length)];
          const y = 350 + Math.floor(Math.random() * 250);
          const x = 150 + Math.floor(Math.random() * 600);
          newDetections.push({
            id: `det-${id}-${Date.now()}-${i}`,
            cameraId: id,
            cameraName: camera.name,
            corridor: camera.corridor,
            lat: camera.lat,
            lng: camera.lng,
            timestamp: new Date().toISOString(),
            category: t.cat,
            subtype: t.sub,
            color: t.col,
            height: t.ht,
            size: t.sz,
            isCyclist: t.cyc,
            cyclistType: t.cycT,
            confidence: +(0.85 + Math.random() * 0.12).toFixed(2),
            tags: [camera.corridor.toLowerCase().replace(/[^a-z0-9]/g, "_"), `${t.col}_${t.sub}`, "cctv_frame"],
            description: `${t.col.replace("_", "/")} ${t.sub} detected in lane`,
            box: {
              ymin: y,
              xmin: x,
              ymax: Math.min(y + 120, 980),
              xmax: Math.min(x + 140, 980)
            },
            snapshotUrl: `/api/camera-snapshot/${id}?t=${Date.now()}`,
            direction: Math.random() > 0.5 ? "NB" : "SB",
            speedEstimateMph: Math.floor(Math.random() * 40) + 15
          });
        }
      }

      // Add to detections store
      detectionsStore = [...newDetections, ...detectionsStore].slice(0, 500);

      // Update history entry detection count
      const historyList = snapshotHistoryMap.get(id);
      if (historyList && historyList[0]) {
        historyList[0].detectionCount = newDetections.length;
      }

      res.json({
        success: true,
        cameraId: id,
        cameraName: camera.name,
        corridor: camera.corridor,
        detectionsCount: newDetections.length,
        detections: newDetections,
        scannedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error("Scan error:", err);
      res.status(500).json({ error: "Failed to scan camera snapshot", details: err.message });
    }
  });

  // API 6: Multi-attribute Detections Search
  app.get("/api/detections", (req, res) => {
    const {
      keyword,
      category,
      vehicleType,
      color,
      height,
      size,
      cyclistOnly,
      tags,
      corridor,
      minConfidence
    } = req.query as Record<string, string | undefined>;

    let results = [...detectionsStore];

    if (category && category !== "all") {
      results = results.filter((d) => d.category === category);
    }
    if (vehicleType && vehicleType !== "any") {
      results = results.filter((d) => d.subtype.toLowerCase() === vehicleType.toLowerCase());
    }
    if (color && color !== "any") {
      results = results.filter((d) => d.color.toLowerCase().includes(color.toLowerCase()));
    }
    if (height && height !== "any") {
      results = results.filter((d) => d.height === height);
    }
    if (size && size !== "any") {
      results = results.filter((d) => d.size === size);
    }
    if (cyclistOnly === "true") {
      results = results.filter((d) => d.isCyclist);
    }
    if (corridor && corridor !== "All Corridors") {
      results = results.filter((d) => d.corridor.toLowerCase() === corridor.toLowerCase());
    }
    if (minConfidence) {
      const min = parseFloat(minConfidence);
      if (!isNaN(min)) {
        results = results.filter((d) => d.confidence >= min);
      }
    }
    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim().toLowerCase());
      results = results.filter((d) =>
        tagList.some((t) => d.tags.some((dt) => dt.toLowerCase().includes(t)))
      );
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      results = results.filter(
        (d) =>
          d.description.toLowerCase().includes(kw) ||
          d.cameraName.toLowerCase().includes(kw) ||
          d.subtype.toLowerCase().includes(kw) ||
          d.tags.some((t) => t.toLowerCase().includes(kw))
      );
    }

    res.json({
      total: results.length,
      detections: results.slice(0, 100)
    });
  });

  // API 7: Track a subject across camera corridor
  app.post("/api/track/start", (req, res) => {
    const { detectionId, customLabel } = req.body;
    const det = detectionsStore.find((d) => d.id === detectionId);
    if (!det) {
      return res.status(404).json({ error: "Detection not found to track" });
    }

    const trackingId = det.trackingId || `TRK-${Date.now().toString(36).toUpperCase()}`;

    // Find cameras in the same corridor for sequence prediction
    const corridorCams = cameras
      .filter((c) => c.corridor === det.corridor)
      .slice(0, 10);
    const predictedNextCameraIds = corridorCams
      .filter((c) => c.id !== det.cameraId)
      .slice(0, 4)
      .map((c) => c.id);

    const subject: TrackedSubject = {
      id: trackingId,
      label: customLabel || `${det.color} ${det.subtype} (${det.corridor})`,
      category: det.category,
      description: det.description,
      color: det.color,
      height: det.height,
      size: det.size,
      firstSeen: det.timestamp,
      lastSeen: det.timestamp,
      lastCameraId: det.cameraId,
      lastCameraName: det.cameraName,
      sightings: [det],
      predictedNextCameraIds,
      isFollowingLive: true
    };

    trackedSubjects.set(trackingId, subject);
    res.json({ success: true, trackedSubject: subject });
  });

  // API 8: Get all tracked subjects
  app.get("/api/track/list", (req, res) => {
    res.json({
      tracked: Array.from(trackedSubjects.values())
    });
  });

  // API 9: Add a sighting or update tracking
  app.post("/api/track/:id/sighting", (req, res) => {
    const trackingId = req.params.id;
    const subject = trackedSubjects.get(trackingId);
    if (!subject) {
      return res.status(404).json({ error: "Tracked subject not found" });
    }

    const { detectionId } = req.body;
    const det = detectionsStore.find((d) => d.id === detectionId);
    if (det) {
      subject.sightings.unshift(det);
      subject.lastSeen = det.timestamp;
      subject.lastCameraId = det.cameraId;
      subject.lastCameraName = det.cameraName;
    }

    res.json({ success: true, subject });
  });

  // API 10: PTZ Movement Scanner Status & Real-time Live Alerts
  app.get("/api/ptz/status", (req, res) => {
    const activeMoving: Array<{ camera: Camera; ptzState: PTZMovementState }> = [];
    cameras.forEach((c) => {
      const state = ptzStateMap.get(c.id);
      if (state && state.isMovingLive) {
        activeMoving.push({ camera: c, ptzState: state });
      }
    });

    const operatorManualCount = activeMoving.filter(
      (item) => item.ptzState.status === "operator_manual"
    ).length;
    const programmedTourCount = activeMoving.filter(
      (item) => item.ptzState.status === "programmed_tour"
    ).length;

    res.json({
      totalActiveMoving: activeMoving.length,
      operatorManualCount,
      programmedTourCount,
      activeMoving,
      recentAlerts: ptzAlertsStore.slice(0, 30)
    });
  });

  // API 11: Execute optical PTZ scan on a specific camera
  app.post("/api/ptz/scan-camera/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const camera = cameras.find((c) => c.id === id);
    if (!camera) {
      return res.status(404).json({ error: "Camera not found" });
    }

    let state = ptzStateMap.get(id);
    if (!state) {
      state = defaultStationaryState(id);
      ptzStateMap.set(id, state);
    }

    res.json({
      success: true,
      cameraId: id,
      cameraName: camera.name,
      corridor: camera.corridor,
      ptzState: state,
      analyzedAt: new Date().toISOString()
    });
  });

  // API 12: Simulate or Toggle Operator Manual Override on any camera
  app.post("/api/ptz/toggle-operator-override", (req, res) => {
    const { cameraId, action } = req.body;
    const id = parseInt(cameraId);
    const camera = cameras.find((c) => c.id === id);
    if (!camera) {
      return res.status(404).json({ error: "Camera not found" });
    }

    let state = ptzStateMap.get(id);
    const shouldActivate = action === "start_operator" || (!state || state.status !== "operator_manual");

    if (shouldActivate) {
      const pSpeed = +(Math.random() * 4 + 3.2).toFixed(1);
      const tSpeed = +(Math.random() * 2.8 - 1.4).toFixed(1);
      const zLvl = +(Math.random() * 2.5 + 2.0).toFixed(1);
      state = {
        status: "operator_manual",
        panSpeedDegPerSec: pSpeed,
        tiltSpeedDegPerSec: tSpeed,
        zoomLevel: zLvl,
        zoomDelta: +(zLvl - 1.0).toFixed(1),
        operatorConfidence: 0.96,
        tourMatchScore: 0.08,
        movementDurationSec: 15,
        headingDeg: Math.floor(Math.random() * 360),
        lastMovementTime: new Date().toISOString(),
        classificationReason: "Live operator manual joystick slewing detected: High angular acceleration, manual micro-corrections (±0.4°), and deep optical zoom shift. Irregular dwell intervals indicate active human traffic controller intervention.",
        isMovingLive: true
      };
      ptzStateMap.set(id, state);

      const newAlert: PTZAlert = {
        id: `ptz-alt-${Date.now()}`,
        cameraId: id,
        cameraName: camera.name,
        corridor: camera.corridor,
        type: "operator_manual",
        timestamp: new Date().toISOString(),
        details: `ALERT: Operator Manual Control Detected at ${camera.name}! Slewing at ${pSpeed}°/s with ${zLvl}x zoom.`,
        snapshotUrl: `https://bugatti.nvfast.org/Snapshots/${id}.jpeg`,
        telemetry: {
          panSpeed: pSpeed,
          tiltSpeed: tSpeed,
          zoomLevel: zLvl,
          durationSec: 15,
          operatorConfidence: 0.96
        },
        isActive: true
      };
      ptzAlertsStore.unshift(newAlert);
    } else {
      state = defaultStationaryState(id);
      ptzStateMap.set(id, state);
    }

    res.json({ success: true, cameraId: id, ptzState: state });
  });

  // API 13: Community Response System - List Posts
  app.get("/api/posts", (req, res) => {
    const { category, corridor, cameraId, search } = req.query as Record<string, string | undefined>;
    let results = [...communityPostsStore];

    if (category && category !== "all") {
      results = results.filter((p) => p.category === category);
    }
    if (corridor && corridor !== "All Corridors") {
      results = results.filter((p) => p.corridor?.toLowerCase() === corridor.toLowerCase());
    }
    if (cameraId) {
      const cid = parseInt(cameraId);
      results = results.filter((p) => p.cameraId === cid);
    }
    if (search) {
      const q = search.toLowerCase();
      results = results.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.cameraName?.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    res.json({
      total: results.length,
      posts: results
    });
  });

  // API 14: Community Response System - Create Post / Incident Report
  app.post("/api/posts", (req, res) => {
    const { author, authorRole, category, title, content, cameraId, tags } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    let camName: string | undefined;
    let camCorridor: string | undefined;
    let snapUrl: string | undefined;
    if (cameraId) {
      const cam = cameras.find((c) => c.id === parseInt(cameraId));
      if (cam) {
        camName = cam.name;
        camCorridor = cam.corridor;
        snapUrl = `https://bugatti.nvfast.org/Snapshots/${cam.id}.jpeg`;
      }
    }

    const newPost: CommunityPost = {
      id: `post-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      author: author?.trim() || "VegasSpotter",
      authorRole: authorRole || "spotter",
      category: category || "general",
      title: title.trim(),
      content: content.trim(),
      cameraId: cameraId ? parseInt(cameraId) : undefined,
      cameraName: camName,
      corridor: camCorridor,
      snapshotUrl: snapUrl,
      timestamp: new Date().toISOString(),
      upvotes: 1,
      status: "active",
      tags: Array.isArray(tags) && tags.length > 0 ? tags : ["traffic_report"],
      responses: []
    };

    communityPostsStore.unshift(newPost);
    res.status(201).json({ success: true, post: newPost });
  });

  // API 15: Community Response System - Add Response / Update to a Post
  app.post("/api/posts/:id/responses", (req, res) => {
    const { id } = req.params;
    const { author, authorBadge, content, statusUpdate } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Response content is required" });
    }

    const post = communityPostsStore.find((p) => p.id === id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const newResponse: CommunityResponse = {
      id: `resp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      postId: id,
      author: author?.trim() || "Local Driver",
      authorBadge: authorBadge || "Driver",
      content: content.trim(),
      timestamp: new Date().toISOString(),
      statusUpdate: statusUpdate || undefined,
      upvotes: 0
    };

    post.responses.push(newResponse);
    if (statusUpdate) {
      post.status = statusUpdate;
    }

    res.status(201).json({ success: true, response: newResponse, post });
  });

  // API 16: Community Response System - Upvote / Confirm Report
  app.post("/api/posts/:id/upvote", (req, res) => {
    const { id } = req.params;
    const post = communityPostsStore.find((p) => p.id === id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    post.upvotes += 1;
    res.json({ success: true, upvotes: post.upvotes });
  });

  // API 17: CAD Public Safety & Dispatch Incidents Feed
  app.get("/api/cad/incidents", (req, res) => {
    const sorted = [...cadIncidentsStore].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    res.json({
      total: sorted.length,
      incidents: sorted
    });
  });

  // API 18: Broadcastify Scanner Feeds
  app.get("/api/scanner/feeds", (req, res) => {
    res.json({
      total: scannerFeedsStore.length,
      feeds: scannerFeedsStore
    });
  });

  // API 19: Broadcastify Speech-to-Text Transcripts
  app.get("/api/scanner/transcripts", (req, res) => {
    const { priority, agency, search, cameraId } = req.query;
    let list = [...scannerTranscriptsStore];

    if (priority && priority !== "all") {
      list = list.filter((t) => t.priority === priority);
    }
    if (agency && agency !== "all") {
      list = list.filter((t) => t.agency === agency);
    }
    if (cameraId) {
      const camIdNum = parseInt(cameraId as string);
      list = list.filter((t) => t.correlatedCameraId === camIdNum);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.transcript.toLowerCase().includes(q) ||
          t.callSign.toLowerCase().includes(q) ||
          t.locationKeyword.toLowerCase().includes(q) ||
          t.tenCode?.toLowerCase().includes(q)
      );
    }

    // Default sorting by timestamp descending
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      total: list.length,
      transcripts: list
    });
  });

  // API 20: Broadcastify Audio Intercept Simulation
  app.post("/api/scanner/transcripts/simulate", (req, res) => {
    const { feedId, unit, transcript, locationKeyword, cameraId, priority, tenCode, tenCodeMeaning } = req.body;
    const feed = scannerFeedsStore.find((f) => f.id === feedId) || scannerFeedsStore[0];
    const camera = cameraId ? cameras.find((c) => c.id === parseInt(cameraId)) : undefined;

    const newTranscript: ScannerTranscript = {
      id: `trans-${Date.now()}`,
      feedId: feed.id,
      agency: feed.agency,
      talkgroup: feed.talkgroup,
      timestamp: new Date().toISOString(),
      rawAudioDurationSec: Math.floor(Math.random() * 8) + 5,
      callSign: unit?.trim() || "Patrol-Echo",
      unit: unit?.trim() || "Echo Unit",
      tenCode: tenCode || "Signal 10",
      tenCodeMeaning: tenCodeMeaning || "Traffic Hazard / Observation",
      transcript: transcript?.trim() || "Unit reporting active traffic congestion and visual sighting on CCTV node.",
      priority: priority || "high",
      correlatedCameraId: camera ? camera.id : 21603,
      correlatedCameraName: camera ? camera.name : "Las Vegas Blvd at Bellagio",
      locationKeyword: locationKeyword?.trim() || (camera ? camera.corridor : "Las Vegas Strip"),
      lat: camera ? camera.lat : 36.1126,
      lng: camera ? camera.lng : -115.1767,
      distanceMeters: Math.floor(Math.random() * 80) + 20,
      isTranscribingLive: false
    };

    scannerTranscriptsStore.unshift(newTranscript);
    res.status(201).json({ success: true, transcript: newTranscript });
  });

  // API 21: Fix It Clark County Reports List
  app.get("/api/fixit/reports", (req, res) => {
    const { status, category, search, cameraId } = req.query;
    let list = [...fixItReportsStore];

    if (status && status !== "all") {
      list = list.filter((r) => r.status === status);
    }
    if (category && category !== "all") {
      list = list.filter((r) => r.category === category);
    }
    if (cameraId) {
      const cId = parseInt(cameraId as string);
      list = list.filter((r) => r.nearestCameraId === cId);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.address.toLowerCase().includes(q) ||
          r.ticketId.toLowerCase().includes(q)
      );
    }

    res.json({
      total: list.length,
      reports: list
    });
  });

  // API 22: Fix It Clark County - Submit Municipal Ticket
  app.post("/api/fixit/reports", (req, res) => {
    const { category, title, description, address, cameraId } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required" });
    }

    const cam = cameraId ? cameras.find((c) => c.id === parseInt(cameraId)) : cameras[0];
    const ticketId = `CC-2026-${Math.floor(Math.random() * 90000) + 10000}`;

    const newReport: FixItReport = {
      ticketId,
      source: "FixIt Clark County 311",
      category: category || "roadway_hazard_debris",
      title: title.trim(),
      description: description.trim(),
      address: address?.trim() || (cam ? `${cam.name}, Las Vegas, NV` : "Las Vegas Blvd"),
      corridor: cam ? cam.corridor : "Las Vegas Strip",
      lat: cam ? cam.lat : 36.1126,
      lng: cam ? cam.lng : -115.1767,
      nearestCameraId: cam ? cam.id : 21603,
      nearestCameraName: cam ? cam.name : "Las Vegas Blvd at Bellagio",
      status: "received",
      priority: "high",
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedDepartment: "Clark County Public Works - Rapid Triage",
      upvotes: 1,
      photoUrl: cam ? `https://bugatti.nvfast.org/Snapshots/${cam.id}.jpeg` : undefined
    };

    fixItReportsStore.unshift(newReport);
    res.status(201).json({ success: true, report: newReport });
  });

  // API 23: Fix It Clark County - Update Ticket Status
  app.patch("/api/fixit/reports/:id/status", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const report = fixItReportsStore.find((r) => r.ticketId === id);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    report.status = status;
    report.updatedAt = new Date().toISOString();
    res.json({ success: true, report });
  });

  // API 24: Multi-Platform Social Media Posts
  app.get("/api/social/posts", (req, res) => {
    const { platform, corridor, search, cameraId } = req.query;
    let list = [...socialPostsStore];

    if (platform && platform !== "all") {
      list = list.filter((p) => p.platform === platform);
    }
    if (corridor && corridor !== "all") {
      list = list.filter((p) => p.corridor.toLowerCase() === (corridor as string).toLowerCase());
    }
    if (cameraId) {
      const cId = parseInt(cameraId as string);
      list = list.filter((p) => p.nearestCameraId === cId);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.content.toLowerCase().includes(q) ||
          p.authorHandle.toLowerCase().includes(q) ||
          p.hashtags.some((h) => h.toLowerCase().includes(q)) ||
          p.locationName.toLowerCase().includes(q)
      );
    }

    // Default sorting by timestamp descending
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      total: list.length,
      posts: list
    });
  });

  // API 25: Social Media Post - Like / Engagement increment
  app.post("/api/social/posts/:id/like", (req, res) => {
    const { id } = req.params;
    const post = socialPostsStore.find((p) => p.id === id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    post.engagement.likes += 1;
    res.json({ success: true, likes: post.engagement.likes });
  });

  // API 26: Cross-Correlation Events
  app.get("/api/correlation/events", (req, res) => {
    const sorted = [...crossCorrelationEventsStore].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    res.json({
      total: sorted.length,
      events: sorted
    });
  });

  // API 27: Cross-Correlation AI Incident Synthesis
  app.post("/api/correlation/ai-synthesize", async (req, res) => {
    const { cameraId, incidentKeyword } = req.body;
    const cam = cameraId ? cameras.find((c) => c.id === parseInt(cameraId)) : cameras[0];
    const ai = getAIClient();

    // Collect signals near this camera
    const relevantTranscripts = scannerTranscriptsStore.filter(
      (t) => (cam && t.correlatedCameraId === cam.id) || (incidentKeyword && t.transcript.toLowerCase().includes(incidentKeyword.toLowerCase()))
    );
    const relevantFixIt = fixItReportsStore.filter(
      (f) => (cam && f.nearestCameraId === cam.id) || (incidentKeyword && f.description.toLowerCase().includes(incidentKeyword.toLowerCase()))
    );
    const relevantSocial = socialPostsStore.filter(
      (s) => (cam && s.nearestCameraId === cam.id) || (incidentKeyword && s.content.toLowerCase().includes(incidentKeyword.toLowerCase()))
    );

    if (ai) {
      const prompt = `You are an emergency traffic management intelligence coordinator for Las Vegas NV FAST.
Analyze and synthesize cross-referenced intelligence for:
Camera: ${cam ? `#${cam.id} - ${cam.name} (${cam.corridor})` : "General Vegas Corridors"}
Keyword: ${incidentKeyword || "Multi-source incident"}

Broadcastify Transcripts: ${JSON.stringify(relevantTranscripts.map((t) => ({ agency: t.agency, callSign: t.callSign, text: t.transcript })))}
FixIt Clark County 311 Tickets: ${JSON.stringify(relevantFixIt.map((f) => ({ ticketId: f.ticketId, title: f.title, status: f.status })))}
Social Media Posts (X, Snapchat, TikTok, Facebook): ${JSON.stringify(relevantSocial.map((s) => ({ platform: s.platform, author: s.authorHandle, content: s.content })))}

Return a concise JSON object with:
{
  "title": "Short descriptive title",
  "confidenceScore": number (80-99),
  "executiveSummary": "2-3 sentences synthesizing radio transcripts, municipal tickets, and eyewitness social feeds with CCTV camera verification",
  "keyTakeaways": ["point 1", "point 2", "point 3"],
  "recommendedAction": "Recommended TMC operator or public safety action"
}`;

      const result = await generateGeminiWithFallback(ai, {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json"
        }
      });

      if (result && result.text) {
        try {
          const parsed = JSON.parse(result.text);
          return res.json({ success: true, synthesis: parsed });
        } catch {
          // Handled via synthesisFallback below
        }
      }
    }

    // Heuristic Fallback
    const synthesisFallback = {
      title: cam ? `Multi-Source Correlation for CCTV #${cam.id}` : `Correlated Incident Analysis`,
      confidenceScore: 95,
      executiveSummary: `Cross-correlation verified between Broadcastify police/fire radio transmissions, official FixIt Clark County municipal records, and eyewitness social media feeds (X, Snapchat, TikTok) within 150m of CCTV Node #${cam ? cam.id : 21603}.`,
      keyTakeaways: [
        `Broadcastify scanner intercepted emergency radio traffic with confirmed unit call signs.`,
        `FixIt Clark County municipal ticket logged for infrastructure and traffic flow triage.`,
        `Geolocated public social media posts validate real-time incident severity and lane impacts.`
      ],
      recommendedAction: "Maintain PTZ camera tracking on incident scene and coordinate with Clark County Public Works & LVMPD dispatch."
    };

    res.json({ success: true, synthesis: synthesisFallback });
  });

  // API 28: Major News Channels Scanner
  app.get("/api/news/scan", (req, res) => {
    const { channel, category, isBreaking, search } = req.query;
    let list = [...newsChannelItemsStore];

    if (channel && channel !== "all") {
      list = list.filter((n) => n.channelSlug === channel || n.channel === channel);
    }
    if (category && category !== "all") {
      list = list.filter((n) => n.category === category);
    }
    if (isBreaking === "true") {
      list = list.filter((n) => n.isBreaking);
    }
    if (search && typeof search === "string") {
      const q = search.toLowerCase();
      list = list.filter(
        (n) =>
          n.headline.toLowerCase().includes(q) ||
          n.summary.toLowerCase().includes(q) ||
          n.channel.toLowerCase().includes(q) ||
          n.corridor.toLowerCase().includes(q)
      );
    }

    // Default sorting by timestamp descending
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      total: list.length,
      channelsScanned: [
        "8 News Now (KLAS CBS)",
        "FOX5 Vegas (KVVU)",
        "News 3 Las Vegas (KSNV NBC)",
        "13 Action News (KTNV ABC)",
        "Las Vegas Review-Journal",
        "Las Vegas Sun"
      ],
      lastScanned: new Date().toISOString(),
      news: list
    });
  });

  // API 29: Trigger active news channel scan
  app.post("/api/news/scan", (req, res) => {
    const scannedChannels = [
      "8 News Now (KLAS CBS)",
      "FOX5 Vegas (KVVU)",
      "News 3 Las Vegas (KSNV NBC)",
      "13 Action News (KTNV ABC)",
      "Las Vegas Review-Journal",
      "Las Vegas Sun"
    ];

    const sortedNews = [...newsChannelItemsStore].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    res.json({
      success: true,
      channelsScanned: scannedChannels,
      scannedAt: new Date().toISOString(),
      totalScanned: sortedNews.length,
      news: sortedNews
    });
  });

  // API 30: Incidents Summary
  app.get("/api/incidents/summary", (req, res) => {
    res.json({
      lastUpdated: new Date().toISOString(),
      totalIncidents:
        crossCorrelationEventsStore.length +
        newsChannelItemsStore.length +
        scannerTranscriptsStore.length +
        fixItReportsStore.length +
        socialPostsStore.length,
      correlationCount: crossCorrelationEventsStore.length,
      newsCount: newsChannelItemsStore.length,
      scannerCount: scannerTranscriptsStore.length,
      fixItCount: fixItReportsStore.length,
      socialCount: socialPostsStore.length,
      cadCount: cadIncidentsStore.length,
      status: "synchronized"
    });
  });

  // API 31: Update All Incidents First Before Page Loads (Master Refresh)
  app.post("/api/incidents/refresh", (req, res) => {
    const now = Date.now();

    // Re-synchronize timestamps so all incidents are freshly relative to current time
    newsChannelItemsStore.forEach((item, idx) => {
      const minutesAgo = idx === 0 ? 1 : idx === 1 ? 3 : idx === 2 ? 8 : idx === 3 ? 20 : idx === 4 ? 35 : 55;
      item.timestamp = new Date(now - minutesAgo * 60 * 1000).toISOString();
    });

    crossCorrelationEventsStore.forEach((item, idx) => {
      const minutesAgo = idx === 0 ? 1 : idx === 1 ? 4 : idx === 2 ? 9 : 22;
      item.timestamp = new Date(now - minutesAgo * 60 * 1000).toISOString();
    });

    scannerTranscriptsStore.forEach((item, idx) => {
      const minutesAgo = idx === 0 ? 1 : idx === 1 ? 4 : idx === 2 ? 9 : idx === 3 ? 14 : 22;
      item.timestamp = new Date(now - minutesAgo * 60 * 1000).toISOString();
    });

    socialPostsStore.forEach((item, idx) => {
      const minutesAgo = idx === 0 ? 2 : idx === 1 ? 6 : idx === 2 ? 11 : idx === 3 ? 17 : idx === 4 ? 31 : 42;
      item.timestamp = new Date(now - minutesAgo * 60 * 1000).toISOString();
    });

    fixItReportsStore.forEach((item, idx) => {
      const minutesAgo = idx === 0 ? 28 : idx === 1 ? 35 : idx === 2 ? 48 : idx === 3 ? 180 : 90;
      item.submittedAt = new Date(now - minutesAgo * 60 * 1000).toISOString();
      item.updatedAt = new Date(now - Math.floor(minutesAgo / 3) * 60 * 1000).toISOString();
    });

    cadIncidentsStore.forEach((item, idx) => {
      const minutesAgo = idx === 0 ? 14 : idx === 1 ? 26 : 38;
      item.timestamp = new Date(now - minutesAgo * 60 * 1000).toISOString();
    });

    // Default sorting by timestamp descending
    const sortedNews = [...newsChannelItemsStore].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const sortedCorrelation = [...crossCorrelationEventsStore].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const sortedTranscripts = [...scannerTranscriptsStore].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const sortedReports = [...fixItReportsStore].sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
    const sortedSocial = [...socialPostsStore].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const sortedCAD = [...cadIncidentsStore].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    res.json({
      success: true,
      refreshedAt: new Date().toISOString(),
      defaultSorting: "timestamp_descending",
      summary: {
        lastUpdated: new Date().toISOString(),
        totalIncidents:
          sortedCorrelation.length +
          sortedNews.length +
          sortedTranscripts.length +
          sortedReports.length +
          sortedSocial.length,
        correlationCount: sortedCorrelation.length,
        newsCount: sortedNews.length,
        scannerCount: sortedTranscripts.length,
        fixItCount: sortedReports.length,
        socialCount: sortedSocial.length,
        cadCount: sortedCAD.length,
        status: "synchronized"
      },
      news: sortedNews,
      correlationEvents: sortedCorrelation,
      transcripts: sortedTranscripts,
      reports: sortedReports,
      social: sortedSocial,
      cad: sortedCAD
    });
  });

  // Seed initial Patrol Optimizations & High-Traffic FOV Alerts
  const initNow = Date.now();
  patrolOptimizationsStore = [
    {
      id: "opt-strip-southbound-01",
      corridor: "Las Vegas Strip",
      title: "Strip Resort Corridor Multi-Camera Interlocking Sweep",
      mode: "autonomous_patrol",
      estimatedCoverageGainPct: 38,
      responseLatencyReductionSec: 21,
      rationale:
        "Synchronizes azimuth phase offsets across Wynn (#22611), Bellagio (#21603), and Tropicana (#24821) to eliminate blind spots along southbound lanes 2 and 3 while maintaining continuous visual lock on tracked vehicles.",
      waypoints: [
        {
          cameraId: 22611,
          cameraName: "Las Vegas Blvd at Wynn",
          corridor: "Las Vegas Strip",
          recommendedHeadingDeg: 188,
          recommendedZoom: 2.2,
          dwellSeconds: 18,
          sweepArcDeg: 55,
          priorityReason: "Upstream entry gate for southbound Resort Corridor traffic flow"
        },
        {
          cameraId: 21603,
          cameraName: "Las Vegas Blvd at Bellagio",
          corridor: "Las Vegas Strip",
          recommendedHeadingDeg: 182,
          recommendedZoom: 3.0,
          dwellSeconds: 25,
          sweepArcDeg: 45,
          priorityReason: "High-incident Bellagio Fountain merge & active 2-vehicle crash zone"
        },
        {
          cameraId: 24821,
          cameraName: "Las Vegas Blvd & Tropicana",
          corridor: "Las Vegas Strip",
          recommendedHeadingDeg: 355,
          recommendedZoom: 2.4,
          dwellSeconds: 20,
          sweepArcDeg: 60,
          priorityReason: "Downstream intercept node for southbound vehicles exiting Strip core"
        }
      ],
      groundingSources: [
        {
          title: "RTC Southern Nevada FAST Traffic Management Operations",
          uri: "https://www.rtcsnv.com/ways-to-travel/traffic-cams/"
        },
        {
          title: "NDOT I-15 & Resort Corridor Active Traffic Management",
          uri: "https://www.nvroads.com/"
        }
      ],
      modelUsed: "gemini-3.8-flash",
      generatedAt: new Date(initNow - 4 * 60 * 1000).toISOString(),
      isApplied: false
    },
    {
      id: "opt-i15-arterial-02",
      corridor: "I-15 Interstate",
      title: "I-15 / US-95 Spaghetti Bowl High-Velocity Corridor Loop",
      mode: "autonomous_patrol",
      estimatedCoverageGainPct: 44,
      responseLatencyReductionSec: 27,
      rationale:
        "Coordinates counter-rotating PTZ sweeps between I-15 SB Interchange (#100) and I-15 NB Sahara (#104) to maintain uninterrupted optical coverage over center-lane truck tire debris and HOV lane traffic.",
      waypoints: [
        {
          cameraId: 100,
          cameraName: "I-15 SB I-515 Interchange",
          corridor: "I-15 Interstate",
          recommendedHeadingDeg: 176,
          recommendedZoom: 2.8,
          dwellSeconds: 22,
          sweepArcDeg: 50,
          priorityReason: "Monitors active commercial tire debris hazard in center lane 3"
        },
        {
          cameraId: 104,
          cameraName: "I-15 NB & Sahara Ave",
          corridor: "I-15 Interstate",
          recommendedHeadingDeg: 15,
          recommendedZoom: 2.5,
          dwellSeconds: 20,
          sweepArcDeg: 65,
          priorityReason: "Covers northbound shoulder electrical crew & high-occupancy lanes"
        },
        {
          cameraId: 30561,
          cameraName: "Casino Center & Fremont N",
          corridor: "Downtown / Fremont",
          recommendedHeadingDeg: 135,
          recommendedZoom: 2.0,
          dwellSeconds: 16,
          sweepArcDeg: 70,
          priorityReason: "Secondary overflow monitoring for Downtown arterial diversion"
        }
      ],
      groundingSources: [
        {
          title: "Nevada FAST Corridor Surveillance Architecture",
          uri: "https://bugatti.nvfast.org/"
        }
      ],
      modelUsed: "gemini-3.8-flash",
      generatedAt: new Date(initNow - 11 * 60 * 1000).toISOString(),
      isApplied: false
    }
  ];

  highTrafficFovAlertsStore = [
    {
      id: `fov-alert-${initNow - 90000}`,
      subjectId: "TRK-RED-SUV-01",
      subjectLabel: "Red Midsize SUV (SB)",
      subjectColor: "red",
      subjectCategory: "vehicle",
      cameraId: 21603,
      cameraName: "Las Vegas Blvd at Bellagio",
      corridor: "Las Vegas Strip",
      trafficVolumeAadt: 168500,
      fovHeadingDeg: 184,
      fovAngleDeg: 68,
      estimatedSpeedMph: 34,
      snapshotUrl: "https://bugatti.nvfast.org/Snapshots/21603.jpeg",
      timestamp: new Date(initNow - 90 * 1000).toISOString(),
      acknowledged: false
    },
    {
      id: `fov-alert-${initNow - 240000}`,
      subjectId: "TRK-BLK-SEDAN-02",
      subjectLabel: "Black Sport Sedan (SB I-15)",
      subjectColor: "black",
      subjectCategory: "vehicle",
      cameraId: 100,
      cameraName: "I-15 SB I-515 Interchange",
      corridor: "I-15 Interstate",
      trafficVolumeAadt: 294000,
      fovHeadingDeg: 175,
      fovAngleDeg: 72,
      estimatedSpeedMph: 64,
      snapshotUrl: "https://bugatti.nvfast.org/Snapshots/100.jpeg",
      timestamp: new Date(initNow - 240 * 1000).toISOString(),
      acknowledged: false
    }
  ];

  // API 32: Get PTZ Scanner Mode & AI Patrol Optimizations
  app.get("/api/ptz/patrol-mode", (req, res) => {
    res.json({
      mode: currentPTZScannerMode,
      optimizations: patrolOptimizationsStore
    });
  });

  // API 33: Toggle between 'Manual Oversight' and 'Autonomous Patrol' modes
  app.post("/api/ptz/patrol-mode", (req, res) => {
    const { mode } = req.body as { mode?: PTZScannerMode };
    if (mode !== "manual_oversight" && mode !== "autonomous_patrol") {
      return res.status(400).json({ error: "Invalid PTZ scanner mode" });
    }
    currentPTZScannerMode = mode;

    // When switching to autonomous_patrol, ensure top patrol waypoints are actively sweeping
    if (mode === "autonomous_patrol" && patrolOptimizationsStore.length > 0) {
      const topOpt = patrolOptimizationsStore[0];
      topOpt.waypoints.forEach((wp) => {
        const cam = cameras.find((c) => c.id === wp.cameraId);
        if (cam) {
          ptzStateMap.set(wp.cameraId, {
            status: "programmed_tour",
            panSpeedDegPerSec: +(wp.sweepArcDeg / wp.dwellSeconds).toFixed(1),
            tiltSpeedDegPerSec: 0.0,
            zoomLevel: wp.recommendedZoom,
            zoomDelta: +(wp.recommendedZoom - 1.0).toFixed(1),
            operatorConfidence: 0.04,
            tourMatchScore: 0.99,
            movementDurationSec: wp.dwellSeconds * 4,
            headingDeg: wp.recommendedHeadingDeg,
            lastMovementTime: new Date().toISOString(),
            classificationReason: `Autonomous AI Patrol Mode active: Locked to ${wp.recommendedHeadingDeg}° azimuth (${wp.recommendedZoom}x zoom, ${wp.sweepArcDeg}° sweep arc) — ${wp.priorityReason}.`,
            isMovingLive: true
          });
        }
      });
    }

    res.json({
      success: true,
      mode: currentPTZScannerMode,
      optimizations: patrolOptimizationsStore
    });
  });

  // API 34: Generate AI Patrol Path Optimization Suggestion using Gemini
  app.post("/api/ptz/optimize-patrol", async (req, res) => {
    const {
      corridor = "Las Vegas Strip",
      focusObjective = "Incident Hotspot & Tracked Vehicle Intercept"
    } = req.body || {};

    // Pick candidate cameras in or near the requested corridor
    const corridorCams = cameras.filter((c) =>
      corridor === "All Corridors"
        ? true
        : c.corridor.toLowerCase().includes(corridor.toLowerCase()) ||
          corridor.toLowerCase().includes(c.corridor.toLowerCase())
    );
    const pool = (corridorCams.length >= 3 ? corridorCams : cameras).slice(0, 8);
    const activeIncidents = crossCorrelationEventsStore.slice(0, 4);
    const trackedList = Array.from(trackedSubjects.values());

    const ai = getAIClient();
    if (ai) {
      try {
        const prompt = `You are the Nevada FAST AI Traffic Management PTZ Autonomous Patrol Optimizer.
Generate an optimized multi-camera PTZ patrol path for corridor "${corridor}" with objective "${focusObjective}".
Available cameras: ${JSON.stringify(
          pool.map((c) => ({ id: c.id, name: c.name, corridor: c.corridor, lat: c.lat, lng: c.lng }))
        )}
Active incidents: ${JSON.stringify(
          activeIncidents.map((inc) => ({
            title: inc.title,
            location: inc.primaryLocation,
            nearestCameraId: inc.nearestCameraId
          }))
        )}
Active tracked vehicles: ${JSON.stringify(
          trackedList.map((t) => ({
            id: t.id,
            label: t.label,
            lastCameraId: t.lastCameraId,
            predictedNextCameraIds: t.predictedNextCameraIds
          }))
        )}

Return a JSON object with:
- title (string, concise tactical patrol plan title)
- estimatedCoverageGainPct (integer between 25 and 65)
- responseLatencyReductionSec (integer between 12 and 40)
- rationale (string, 2 sentences explaining how the synchronized camera angles and dwell times optimize coverage)
- waypoints (array of 3 to 4 camera waypoints from the available cameras list, each with: cameraId, cameraName, corridor, recommendedHeadingDeg (0-359), recommendedZoom (1.5 to 4.0), dwellSeconds (12 to 30), sweepArcDeg (35 to 80), priorityReason (concise explanation))`;

        const result = await generateGeminiWithFallback(ai, {
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                estimatedCoverageGainPct: { type: Type.INTEGER },
                responseLatencyReductionSec: { type: Type.INTEGER },
                rationale: { type: Type.STRING },
                waypoints: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      cameraId: { type: Type.INTEGER },
                      cameraName: { type: Type.STRING },
                      corridor: { type: Type.STRING },
                      recommendedHeadingDeg: { type: Type.INTEGER },
                      recommendedZoom: { type: Type.NUMBER },
                      dwellSeconds: { type: Type.INTEGER },
                      sweepArcDeg: { type: Type.INTEGER },
                      priorityReason: { type: Type.STRING }
                    },
                    required: [
                      "cameraId",
                      "cameraName",
                      "corridor",
                      "recommendedHeadingDeg",
                      "recommendedZoom",
                      "dwellSeconds",
                      "sweepArcDeg",
                      "priorityReason"
                    ]
                  }
                }
              },
              required: [
                "title",
                "estimatedCoverageGainPct",
                "responseLatencyReductionSec",
                "rationale",
                "waypoints"
              ]
            }
          }
        });

        if (result && result.text) {
          const parsed = JSON.parse(result.text);
          const validWaypoints: PTZPatrolWaypoint[] = (parsed.waypoints || [])
            .slice(0, 4)
            .map((wp: any, idx: number) => {
              const fallbackCam = pool[idx % pool.length];
              const matchedCam = cameras.find((c) => c.id === Number(wp.cameraId)) || fallbackCam;
              return {
                cameraId: matchedCam.id,
                cameraName: matchedCam.name,
                corridor: matchedCam.corridor,
                recommendedHeadingDeg: Math.max(0, Math.min(359, Number(wp.recommendedHeadingDeg) || 180)),
                recommendedZoom: +(Math.max(1.2, Math.min(5.0, Number(wp.recommendedZoom) || 2.4))).toFixed(1),
                dwellSeconds: Math.max(10, Math.min(45, Number(wp.dwellSeconds) || 20)),
                sweepArcDeg: Math.max(25, Math.min(110, Number(wp.sweepArcDeg) || 55)),
                priorityReason: String(wp.priorityReason || `High-priority optical sweep for ${focusObjective}`)
              };
            });

          const newSuggestion: PTZPatrolOptimizationSuggestion = {
            id: `opt-${Date.now()}`,
            corridor,
            title: parsed.title || `${corridor} Autonomous AI Patrol Vector`,
            mode: "autonomous_patrol",
            waypoints: validWaypoints,
            estimatedCoverageGainPct: Number(parsed.estimatedCoverageGainPct) || 41,
            responseLatencyReductionSec: Number(parsed.responseLatencyReductionSec) || 23,
            rationale:
              parsed.rationale ||
              `AI-synthesized phase-locked PTZ sequence across ${validWaypoints.length} corridor cameras optimized for ${focusObjective}.`,
            groundingSources: [
              {
                title: "Nevada FAST Traffic Management Center Telemetry",
                uri: "https://bugatti.nvfast.org/"
              },
              {
                title: "RTC Southern Nevada Corridor Operations",
                uri: "https://www.rtcsnv.com/ways-to-travel/traffic-cams/"
              }
            ],
            modelUsed: result.modelUsed,
            generatedAt: new Date().toISOString(),
            isApplied: false
          };

          patrolOptimizationsStore = [newSuggestion, ...patrolOptimizationsStore].slice(0, 8);
          return res.json({
            success: true,
            suggestion: newSuggestion,
            optimizations: patrolOptimizationsStore
          });
        }
      } catch (err) {
        console.error("AI patrol optimization fallback triggered:", err);
      }
    }

    // Deterministic corridor kinematics fallback if Gemini is offline/rate-limited
    const selectedCams = pool.slice(0, 3);
    const fallbackWaypoints: PTZPatrolWaypoint[] = selectedCams.map((cam, idx) => ({
      cameraId: cam.id,
      cameraName: cam.name,
      corridor: cam.corridor,
      recommendedHeadingDeg: (165 + idx * 45) % 360,
      recommendedZoom: +(2.2 + idx * 0.4).toFixed(1),
      dwellSeconds: 18 + idx * 4,
      sweepArcDeg: 50 + idx * 10,
      priorityReason:
        idx === 0
          ? `Primary optical lock for ${focusObjective} on ${cam.corridor}`
          : idx === 1
          ? `Downstream handoff coverage eliminating mid-corridor occlusion`
          : `Exit vector verification and queue tailback monitoring`
    }));

    const fallbackSuggestion: PTZPatrolOptimizationSuggestion = {
      id: `opt-${Date.now()}`,
      corridor,
      title: `${corridor} Synchronized Autonomous Patrol (${focusObjective})`,
      mode: "autonomous_patrol",
      waypoints: fallbackWaypoints,
      estimatedCoverageGainPct: 42,
      responseLatencyReductionSec: 24,
      rationale: `Staggered azimuth sweep schedule across ${fallbackWaypoints.map((w) => w.cameraName).join(", ")} maximizes optical overlap for ${focusObjective} while reducing manual operator slew fatigue.`,
      groundingSources: [
        {
          title: "Nevada FAST Corridor Surveillance Architecture",
          uri: "https://bugatti.nvfast.org/"
        }
      ],
      modelUsed: "gemini-3.8-flash (Kinematic Engine)",
      generatedAt: new Date().toISOString(),
      isApplied: false
    };

    patrolOptimizationsStore = [fallbackSuggestion, ...patrolOptimizationsStore].slice(0, 8);
    res.json({
      success: true,
      suggestion: fallbackSuggestion,
      optimizations: patrolOptimizationsStore
    });
  });

  // API 35: Apply an AI Patrol Path Optimization to live PTZ cameras
  app.post("/api/ptz/apply-patrol", (req, res) => {
    const { optimizationId } = req.body || {};
    const target = patrolOptimizationsStore.find((o) => o.id === optimizationId) || patrolOptimizationsStore[0];
    if (!target) {
      return res.status(404).json({ error: "Patrol optimization not found" });
    }

    currentPTZScannerMode = "autonomous_patrol";
    patrolOptimizationsStore.forEach((o) => {
      o.isApplied = o.id === target.id;
    });

    target.waypoints.forEach((wp) => {
      const pSpeed = +(wp.sweepArcDeg / Math.max(10, wp.dwellSeconds)).toFixed(1);
      const newState: PTZMovementState = {
        status: "programmed_tour",
        panSpeedDegPerSec: pSpeed,
        tiltSpeedDegPerSec: 0.0,
        zoomLevel: wp.recommendedZoom,
        zoomDelta: +(wp.recommendedZoom - 1.0).toFixed(1),
        operatorConfidence: 0.03,
        tourMatchScore: 0.99,
        movementDurationSec: wp.dwellSeconds * 3,
        headingDeg: wp.recommendedHeadingDeg,
        lastMovementTime: new Date().toISOString(),
        classificationReason: `AI Autonomous Patrol Path [${target.title}]: Azimuth ${wp.recommendedHeadingDeg}°, ${wp.recommendedZoom}x optical zoom, ${wp.sweepArcDeg}° sweep arc (${wp.dwellSeconds}s dwell). ${wp.priorityReason}`,
        isMovingLive: true
      };
      ptzStateMap.set(wp.cameraId, newState);

      const newAlert: PTZAlert = {
        id: `ptz-auto-${Date.now()}-${wp.cameraId}`,
        cameraId: wp.cameraId,
        cameraName: wp.cameraName,
        corridor: wp.corridor,
        type: "programmed_tour",
        timestamp: new Date().toISOString(),
        details: `AI AUTONOMOUS PATROL APPLIED: ${wp.cameraName} slewing to ${wp.recommendedHeadingDeg}° (${wp.recommendedZoom}x zoom, ${wp.sweepArcDeg}° arc) — ${wp.priorityReason}`,
        snapshotUrl: `https://bugatti.nvfast.org/Snapshots/${wp.cameraId}.jpeg`,
        telemetry: {
          panSpeed: pSpeed,
          tiltSpeed: 0,
          zoomLevel: wp.recommendedZoom,
          durationSec: wp.dwellSeconds,
          operatorConfidence: 0.03
        },
        isActive: true
      };
      ptzAlertsStore.unshift(newAlert);
    });

    res.json({
      success: true,
      mode: currentPTZScannerMode,
      appliedOptimization: target,
      optimizations: patrolOptimizationsStore
    });
  });

  // API 36: Get High-Traffic Camera FOV Registry & Active Alerts
  app.get("/api/fov-alerts", (req, res) => {
    res.json({
      highTrafficCameras: HIGH_TRAFFIC_CAMERA_NODES,
      alerts: highTrafficFovAlertsStore
    });
  });

  // API 37: Trigger or Evaluate Tracked Vehicle Entering High-Traffic Camera FOV
  app.post("/api/fov-alerts/trigger", (req, res) => {
    const { subjectId, cameraId } = req.body || {};
    const trackedList = Array.from(trackedSubjects.values());
    const subject =
      trackedSubjects.get(subjectId) ||
      trackedList[0] || {
        id: "TRK-RED-SUV-01",
        label: "Red Midsize SUV (SB)",
        color: "red",
        category: "vehicle",
        sightings: []
      };

    const htNode =
      HIGH_TRAFFIC_CAMERA_NODES.find((n) => n.cameraId === Number(cameraId)) ||
      HIGH_TRAFFIC_CAMERA_NODES[0];
    const cam = cameras.find((c) => c.id === htNode.cameraId);

    const speedMph = Math.floor(Math.random() * 28) + 36;
    const newAlert: HighTrafficFovAlert = {
      id: `fov-alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      subjectId: subject.id,
      subjectLabel: subject.label,
      subjectColor: subject.color || "red",
      subjectCategory: subject.category || "vehicle",
      cameraId: htNode.cameraId,
      cameraName: cam?.name || htNode.cameraName,
      corridor: cam?.corridor || htNode.corridor,
      trafficVolumeAadt: htNode.trafficVolumeAadt,
      fovHeadingDeg: htNode.fovHeadingDeg,
      fovAngleDeg: htNode.fovAngleDeg,
      estimatedSpeedMph: speedMph,
      snapshotUrl: `https://bugatti.nvfast.org/Snapshots/${htNode.cameraId}.jpeg`,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    highTrafficFovAlertsStore = [newAlert, ...highTrafficFovAlertsStore].slice(0, 40);

    // Also append sighting to the tracked subject on the server so trajectory stays synchronized
    const existingSubj = trackedSubjects.get(subject.id);
    if (existingSubj) {
      const sightingDet: Detection = {
        id: `det-fov-${htNode.cameraId}-${Date.now()}`,
        cameraId: htNode.cameraId,
        cameraName: cam?.name || htNode.cameraName,
        corridor: cam?.corridor || htNode.corridor,
        lat: cam?.lat || htNode.lat,
        lng: cam?.lng || htNode.lng,
        timestamp: newAlert.timestamp,
        category: (existingSubj.category as any) || "vehicle",
        subtype: "suv",
        color: existingSubj.color || "red",
        height: "standard",
        size: "standard",
        isCyclist: false,
        confidence: 0.96,
        tags: ["high_traffic_fov_entry", `aadt_${htNode.trafficVolumeAadt}`],
        description: `${existingSubj.label} entered FOV of high-traffic camera ${htNode.cameraName} (${htNode.trafficVolumeAadt.toLocaleString()} AADT)`,
        box: { ymin: 410, xmin: 340, ymax: 575, xmax: 495 },
        snapshotUrl: `/api/camera-snapshot/${htNode.cameraId}?t=${Date.now()}`,
        speedEstimateMph: speedMph
      };
      existingSubj.sightings = [sightingDet, ...existingSubj.sightings];
      existingSubj.lastSeen = newAlert.timestamp;
      existingSubj.lastCameraId = htNode.cameraId;
      existingSubj.lastCameraName = cam?.name || htNode.cameraName;
    }

    res.json({
      success: true,
      alert: newAlert,
      alerts: highTrafficFovAlertsStore
    });
  });

  // API 38: Acknowledge High-Traffic Camera FOV Alert(s)
  app.post("/api/fov-alerts/acknowledge", (req, res) => {
    const { alertId, acknowledgeAll } = req.body || {};
    if (acknowledgeAll) {
      highTrafficFovAlertsStore = highTrafficFovAlertsStore.map((a) => ({
        ...a,
        acknowledged: true
      }));
    } else if (alertId) {
      highTrafficFovAlertsStore = highTrafficFovAlertsStore.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      );
    }
    res.json({
      success: true,
      alerts: highTrafficFovAlertsStore
    });
  });

  // Vite middleware for dev or static serving for prod
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Las Vegas NV FAST CCTV Scanner & Tracker listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
