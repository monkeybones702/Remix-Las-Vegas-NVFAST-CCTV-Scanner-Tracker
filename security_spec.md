# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Global Default-Deny**: Any path not explicitly matched in `/databases/{database}/documents` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity Requirement**: All write operations (`create`, `update`, `delete`) require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
3. **Path Variable Hardening**: Document IDs (`{watchlistId}`, `{logId}`) must match `^[a-zA-Z0-9_\-]+$` and be at most 128 characters (`isValidId()`).
4. **Ownership & PII Isolation**:
   - Neither `/userWatchlists/{watchlistId}` nor `/userIncidentLogs/{logId}` stores raw PII (emails/phones), and all documents are strictly scoped to their owner (`resource.data.ownerId == request.auth.uid`).
   - `allow get` and `allow list` both enforce `isSignedIn() && resource.data.ownerId == request.auth.uid`, preventing unauthorized query scraping or cross-user reads.
5. **Strict Blueprint Validation & Anti-Update-Gap**:
   - Every `create` and `update` operation must pass `isValidUserWatchlist(incoming())` or `isValidUserIncidentLog(incoming())`, enforcing exact key sets (`hasAll` and `hasOnly`), string length bounds, numeric ranges, enum memberships, and `incoming().ownerId == request.auth.uid`.
6. **Temporal & Immutable Field Integrity**:
   - On `create`: `incoming().createdAt == request.time && incoming().updatedAt == request.time`.
   - On `update`: `incoming().createdAt == existing().createdAt && incoming().ownerId == existing().ownerId && incoming().updatedAt == request.time`.
7. **Terminal State Locking**:
   - Once `userWatchlists.status == 'archived'` or `userIncidentLogs.status == 'resolved'`, no subsequent updates are permitted.

---

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 (Unauthenticated Write)**: `auth = null`, attempting to create a document in `/userWatchlists/wl_1`. Expected: `PERMISSION_DENIED`.
2. **Payload 2 (Unverified Email Spoof)**: `auth = { uid: 'user_1', token: { email_verified: false } }`, attempting to create a document in `/userWatchlists/wl_1`. Expected: `PERMISSION_DENIED`.
3. **Payload 3 (Identity Spoofing on Create)**: `auth = { uid: 'user_1', token: { email_verified: true } }`, payload has `ownerId: 'user_2'`. Expected: `PERMISSION_DENIED`.
4. **Payload 4 (Shadow / Ghost Field Injection on Create)**: Payload includes all required fields plus `"isAdmin": true`. Expected: `PERMISSION_DENIED` via `keys().hasOnly(...)`.
5. **Payload 5 (ID Poisoning Attack)**: Document ID contains illegal characters or exceeds 128 chars (`/userWatchlists/invalid$id!`). Expected: `PERMISSION_DENIED` via `isValidId()`.
6. **Payload 6 (String Boundary Overflow / Denial of Wallet)**: `notes` or `description` length > 500 characters. Expected: `PERMISSION_DENIED`.
7. **Payload 7 (Client Timestamp Forgery on Create)**: `createdAt` is a forged past/future timestamp instead of `request.time`. Expected: `PERMISSION_DENIED`.
8. **Payload 8 (Immutable Field Tampering on Update)**: Attempting to mutate `createdAt` or `ownerId` during `update`. Expected: `PERMISSION_DENIED`.
9. **Payload 9 (Unauthorized Field Mutation in Action Update)**: Attempting to mutate `subjectId` or `cameraId` during a status/notes update action not in `affectedKeys().hasOnly(...)`. Expected: `PERMISSION_DENIED`.
10. **Payload 10 (Terminal State Bypass)**: Attempting to update a document whose `existing().status` is already `'archived'` or `'resolved'`. Expected: `PERMISSION_DENIED`.
11. **Payload 11 (Cross-User Read / PII Blanket Test)**: `user_2` attempting `get` on a document owned by `user_1`. Expected: `PERMISSION_DENIED`.
12. **Payload 12 (Unconstrained List Query Trust Test)**: Authenticated `user_2` executing an unconstrained `list` query across `/userWatchlists` without filtering `ownerId == request.auth.uid`. Expected: `PERMISSION_DENIED`.
