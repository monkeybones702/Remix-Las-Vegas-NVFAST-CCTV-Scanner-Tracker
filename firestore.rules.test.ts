/**
 * Phase 0: Security TDD Test Specification for Firestore Rules
 * Verifies that all 12 "Dirty Dozen" adversarial payloads are rejected with PERMISSION_DENIED.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  collection: 'userWatchlists' | 'userIncidentLogs';
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  existingData?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_TEST_CASES: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write Attempt',
    collection: 'userWatchlists',
    docId: 'wl_valid_01',
    operation: 'create',
    auth: null,
    payload: { ownerId: 'user_1', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Unverified Email Spoof Attempt',
    collection: 'userWatchlists',
    docId: 'wl_valid_01',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: false },
    payload: { ownerId: 'user_1', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Identity Spoofing on Create (Mismatched ownerId)',
    collection: 'userWatchlists',
    docId: 'wl_valid_01',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_2', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Shadow / Ghost Field Injection (isAdmin: true)',
    collection: 'userIncidentLogs',
    docId: 'log_valid_01',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', isAdmin: true, status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'ID Poisoning Attack (Illegal Path Characters)',
    collection: 'userWatchlists',
    docId: 'invalid$doc!id',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'String Boundary Overflow (> 500 chars)',
    collection: 'userIncidentLogs',
    docId: 'log_valid_01',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', description: 'A'.repeat(501), status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'Client Timestamp Forgery on Create',
    collection: 'userWatchlists',
    docId: 'wl_valid_01',
    operation: 'create',
    auth: { uid: 'user_1', email_verified: true },
    payload: { ownerId: 'user_1', createdAt: '2020-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'Immutable Field Tampering on Update (ownerId changed)',
    collection: 'userWatchlists',
    docId: 'wl_valid_01',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    existingData: { ownerId: 'user_1', status: 'active' },
    payload: { ownerId: 'user_2', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Unauthorized Field Mutation During Update',
    collection: 'userIncidentLogs',
    docId: 'log_valid_01',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    existingData: { ownerId: 'user_1', cameraId: 21603, status: 'active' },
    payload: { ownerId: 'user_1', cameraId: 99999, status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'Terminal State Bypass (Updating already archived/resolved doc)',
    collection: 'userWatchlists',
    docId: 'wl_valid_01',
    operation: 'update',
    auth: { uid: 'user_1', email_verified: true },
    existingData: { ownerId: 'user_1', status: 'archived' },
    payload: { ownerId: 'user_1', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Cross-User Get Request',
    collection: 'userWatchlists',
    docId: 'wl_valid_01',
    operation: 'get',
    auth: { uid: 'user_2', email_verified: true },
    existingData: { ownerId: 'user_1', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Unconstrained List Query Scraping by Non-Owner',
    collection: 'userIncidentLogs',
    docId: 'log_valid_01',
    operation: 'list',
    auth: { uid: 'user_2', email_verified: true },
    existingData: { ownerId: 'user_1', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED'
  }
];
