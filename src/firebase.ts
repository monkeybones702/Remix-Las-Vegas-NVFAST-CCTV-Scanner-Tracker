import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  type Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface UserWatchlistDoc {
  id: string;
  ownerId: string;
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
  status: 'active' | 'archived';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface UserIncidentLogDoc {
  id: string;
  ownerId: string;
  cameraId: number;
  cameraName: string;
  corridor: string;
  lat: number;
  lng: number;
  incidentType: 'collision' | 'congestion' | 'hazard' | 'police_activity' | 'pedestrian_density';
  severity: 'low' | 'moderate' | 'high' | 'critical';
  description: string;
  status: 'active' | 'resolved';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function sanitizeDocId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return cleaned.length > 0 && VALID_ID_REGEX.test(cleaned) ? cleaned : `doc_${Date.now()}`;
}

export async function signInWithGooglePopup(): Promise<User | null> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };

export async function saveTrajectoryWatchlistItem(params: {
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
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be signed in to save a trajectory watchlist item.');
  }

  const docId = sanitizeDocId(`wl_${user.uid.slice(0, 12)}_${Date.now()}`);
  const path = `userWatchlists/${docId}`;

  const payload = {
    ownerId: user.uid.slice(0, 128),
    subjectId: (params.subjectId || 'TRK-UNKNOWN').slice(0, 100),
    subjectLabel: (params.subjectLabel || 'Tracked Target').slice(0, 160),
    lastCameraId: Number(params.lastCameraId) || 21603,
    lastCameraName: (params.lastCameraName || 'Las Vegas Blvd at Bellagio').slice(0, 160),
    predictedCameraId: Number(params.predictedCameraId) || 21603,
    predictedCameraName: (params.predictedCameraName || 'Downstream Corridor Node').slice(0, 160),
    predictedBearingDeg: Math.max(0, Math.min(360, Math.round(Number(params.predictedBearingDeg) || 0))),
    predictedSpeedMph: Math.max(0, Math.min(200, Math.round(Number(params.predictedSpeedMph) || 35))),
    confidence: Math.max(0, Math.min(100, Math.round(Number(params.confidence) || 85))),
    notes: (params.notes || '').slice(0, 500),
    status: 'active' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'userWatchlists', docId), payload);
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function archiveTrajectoryWatchlistItem(docId: string): Promise<void> {
  const path = `userWatchlists/${docId}`;
  try {
    await updateDoc(doc(db, 'userWatchlists', docId), {
      status: 'archived',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTrajectoryWatchlistItem(docId: string): Promise<void> {
  const path = `userWatchlists/${docId}`;
  try {
    await deleteDoc(doc(db, 'userWatchlists', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createCorridorIncidentLog(params: {
  cameraId: number;
  cameraName: string;
  corridor: string;
  lat: number;
  lng: number;
  incidentType: 'collision' | 'congestion' | 'hazard' | 'police_activity' | 'pedestrian_density';
  severity: 'low' | 'moderate' | 'high' | 'critical';
  description: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be signed in to log a corridor incident.');
  }

  const docId = sanitizeDocId(`inc_${user.uid.slice(0, 12)}_${Date.now()}`);
  const path = `userIncidentLogs/${docId}`;

  const payload = {
    ownerId: user.uid.slice(0, 128),
    cameraId: Number(params.cameraId) || 21603,
    cameraName: (params.cameraName || 'Las Vegas Blvd at Bellagio').slice(0, 160),
    corridor: (params.corridor || 'Las Vegas Strip').slice(0, 120),
    lat: Math.max(-90, Math.min(90, Number(params.lat) || 36.1126)),
    lng: Math.max(-180, Math.min(180, Number(params.lng) || -115.1767)),
    incidentType: params.incidentType,
    severity: params.severity,
    description: (params.description || 'Field observation logged on corridor').slice(0, 500),
    status: 'active' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'userIncidentLogs', docId), payload);
    return docId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function resolveCorridorIncidentLog(docId: string): Promise<void> {
  const path = `userIncidentLogs/${docId}`;
  try {
    await updateDoc(doc(db, 'userIncidentLogs', docId), {
      status: 'resolved',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteCorridorIncidentLog(docId: string): Promise<void> {
  const path = `userIncidentLogs/${docId}`;
  try {
    await deleteDoc(doc(db, 'userIncidentLogs', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserWatchlists(
  userId: string,
  onData: (items: UserWatchlistDoc[]) => void
): () => void {
  const path = 'userWatchlists';
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: UserWatchlistDoc[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<UserWatchlistDoc, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeUserIncidentLogs(
  userId: string,
  onData: (items: UserIncidentLogDoc[]) => void
): () => void {
  const path = 'userIncidentLogs';
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => {
      const items: UserIncidentLogDoc[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<UserIncidentLogDoc, 'id'>),
      }));
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
