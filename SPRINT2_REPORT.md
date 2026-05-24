# Sprint 2 Technical Breakdown — LLM Maintenance Copilot (Group 6, COS40005)
**Period:** 20 April 2026 – 10 May 2026
**Repository:** `adilrumy05/LLM-MaintainanceSystem`
**Branch:** `main`

---

## 1. SCOPE

Sprint 2 ran from 20 April 2026 through 10 May 2026 and represents the team's primary feature-delivery sprint. At the start of the sprint, the project had a basic React Native UI with a minimal Express backend and a Python RAG pipeline that was not yet wired to the frontend. By the end of the sprint, the application had:

- A fully connected RAG pipeline (Qdrant → FastAPI → Node.js → mobile UI)
- Role-based AI response differentiation (4 roles: beginner, intermediate, expert, admin)
- A dedicated Alert/Priority Agent powered by OpenAI gpt-4o-mini
- Human-in-the-Loop (HITL) audit workflow with Firestore-persisted approval/rejection
- User-specific chat history migrated from local files to Firestore
- Complete admin dashboard with user management, analytics, and task management
- Activity/Alerts feed with real-time Firestore `onSnapshot` updates
- Documents viewer (PDF, CSV) with Firestore-hosted links
- Image enrichment in RAG source citations (Firebase Storage)
- Input sanitization and output validation middleware
- A polished mobile UI with resolved keyboard/layout issues, Ionicons, and horizontal table scrolling

**Total commits in period:** 38 (including 4 merge commits)
**Substantive commits:** 34
**Estimated net new lines of code:** ~4,940 (7,814 insertions, 2,874 deletions)

---

## 2. PER-AUTHOR SUMMARY

### Adil Rumy (Team Lead / AI Developer) — 5 commits
**Commits:** `3230bee`, `742a2c7`, `a3a284e` (merge), `a4eb141`, `83e25bf` (merge)

Primary responsibility: AI layer, LLM provider integration, agent architecture, and server-side intelligence.

**Key contributions:**
- **Alert Agent & Priority Agent** (`a4eb141`, 2026-05-06): Added a real-time alert monitoring agent (`server/agents/alertAgent.js`) that polls Firestore `Alerts` collection and uses OpenAI to classify and respond to priority notifications. Added `ROLE_SYSTEM_PROMPTS` — four distinct system prompt personas keyed to user role (beginner: step-by-step instructions with safety warnings; intermediate: technical but guided; expert: terse and assumption-heavy; admin: diagnostic and system-level). Changed the LLM provider from OpenRouter (Gemma 3 27B) to OpenAI gpt-4o-mini across all AI-generating endpoints, resolving reliability and rate-limit issues experienced mid-sprint.
- **Merge conflict resolution** (`a3a284e`, 2026-04-20): Resolved a three-way conflict in `server.js` between local server changes and teammates' RAG wiring. Kept both the OpenAI API key and the FastAPI proxy configuration.
- **Env file hygiene** (`3230bee`, 2026-04-20): Removed `.env` and `serviceAccountKey.json` from git tracking via `.gitignore` update to prevent secrets from being committed.

**Files primarily touched:** `server.js`, `server/agents/alertAgent.js`, `server/agents/priorityAdjustmentAgent.js`, `.gitignore`

---

### Docsterk — 14 commits
**Commits:** `0bf6d11`, `a91fe48`, `472d551`, `d5b1d95`, `c8e1866`, `7e5d6c5`, `07aea3a`, `6b50a02`, `80daf27`, `bd61765`, `1e8fea0`, `1a8dbad`, `bd1a37e`, `0cddb5c`

Primary responsibility: Frontend UI, React Native screens, layout/navigation, and RAG pipeline integration at the Node.js boundary.

**Key contributions:**
- **RAG pipeline wiring** (`c8e1866`, `7e5d6c5`, 2026-04-21): Rewrote `server.js` to proxy chat requests through to the Python FastAPI RAG server (`http://127.0.0.1:8001/query`). Added `.env` configuration for the FastAPI URL, set the Node server to bind to `0.0.0.0` for LAN access, and updated `start.bat` to launch both servers in the correct order.
- **Sidebar, role-based prompts, Firebase activity logging, Markdown** (`07aea3a`, 2026-04-26): Added a slide-out sidebar in `dashboard.jsx` with clear-chat action. Integrated role-specific prompts into the chat request. Added Firebase Firestore write on each chat message to the `Alerts` collection for the activity feed. Enabled Markdown rendering for AI responses (using `react-native-markdown-display`). Added role guards to screen components.
- **HITL Audit Viewer** (`6b50a02`, 2026-05-03): Rewrote `history.jsx` to display `audit_logs` collection entries from Firestore. Added Approve/Deny action buttons visible only to admin. Each action calls the backend `/api/approve` or `/api/reject` endpoint and updates the Firestore document status in real time.
- **Profile, Analytics, Tasks, Documents** (`80daf27`, `bd61765`, 2026-05-03): Created four new screens from scratch (>1,400 lines net new). `analytics.jsx` displays real-time user role counts from Firestore. `profile.jsx` shows user details and logout. `tasks.jsx` displays maintenance tasks from the `maintenance_tasks` Firestore collection. `documents.jsx` fetches document links from `ManualDocuments` and renders PDF/CSV previews. Updated `_layout.jsx` to register all new screens and add admin-only tab routes.
- **Table support** (`1e8fea0`, 2026-05-03): Added horizontal scroll wrapper for markdown tables in the chat view to prevent overflow clipping.
- **UI polish** (`1a8dbad`, `bd1a37e`, 2026-05-06): Removed chat message avatars (simplified layout). Replaced emoji icons throughout with Ionicons from `@expo/vector-icons`. Fixed a keyboard gap in the dashboard input bar caused by `KeyboardAvoidingView` adding bottom padding even when the keyboard was hidden. Added horizontal scrolling for tables in `documents.jsx`.
- **Activity screen rename** (`0cddb5c`, 2026-05-06): Renamed the "Alerts" tab to "Activity" everywhere (`_layout.jsx`, `activity.jsx`). Rewrote `activity.jsx` to show a combined feed of all notification types (alerts, priority, info) with filter tabs and a live `onSnapshot` subscription.

**Files primarily touched:** `dashboard.jsx`, `activity.jsx`, `history.jsx`, `analytics.jsx`, `profile.jsx`, `tasks.jsx`, `documents.jsx`, `_layout.jsx`, `server.js`, `start.bat`

---

### Wlitzzz (Phillip) — 8 commits
**Commits:** `51614a6`, `042b323`, `36d9075`, `a91f682`, `3db41b9`, `9038fc2`, `6399205`, `86faf6b` (merge)

Primary responsibility: Backend audit logging, Firestore data persistence, session management, and image migration tooling.

**Key contributions:**
- **Audit logging v1** (`51614a6`, 2026-04-24): Built `server/services/auditLogger.js` — a dual-output logger that writes session data both to local JSON files (`audit_logs/`) and to Firestore `audit_logs` collection. Each log entry captures: `log_id`, `user_id`, `role`, `messages[]`, `createdAt`, `last_updated`, `status` (pending/approved/rejected). Integrated into the `/api/chat` endpoint to automatically record every session.
- **Audit logging v2 — Firebase consolidation** (`042b323`, 2026-04-26): Extended the audit logger to use `FieldValue.arrayUnion` for appending individual messages to an existing session document rather than overwriting. Added `server/config/firebaseAdmin.js` to encapsulate Firebase Admin SDK initialization from `serviceAccountKey.json`. Introduced `server/controllers/queryController.js` (routing layer for the query flow).
- **User-specific history migration** (`a91f682`, 2026-05-01): Rewrote `history.jsx` to use Firestore `onSnapshot` with a `where('user_id', '==', uid)` clause so each worker sees only their own sessions. Removed the previous approach of reading from all logs without user filtering.
- **Cleanup** (`3db41b9`, 2026-05-01): Deleted 7 stale local audit log JSON files from `audit_logs/` that were accumulating in the repo. Net −218 lines.
- **Logout fix** (`9038fc2`, 2026-05-01): Fixed `dashboard.jsx` logout handler which was clearing AsyncStorage but not navigating away, leaving the user on a blank authenticated screen.
- **Image migration scripts** (`6399205`, 2026-05-04): Added Firebase Storage image migration scripts and checkpoint files to `.gitignore` to prevent large binary uploads. These scripts (run locally) batch-uploaded maintenance manual images from local disk to Firebase Storage for later retrieval by the RAG pipeline.

**Files primarily touched:** `server/services/auditLogger.js`, `server/config/firebaseAdmin.js`, `server/controllers/queryController.js`, `history.jsx`, `audit_logs/` (deleted), `.gitignore`

---

### Andrei~ — 8 commits
**Commits:** `767e86c`, `99a7761`, `3b27d7a`, `ed0329c`, `15684c3`, `cf5965a`, `1c989f9`, `b486181`

Primary responsibility: Python RAG pipeline, query routing, vector search filtering, and image enrichment in source citations.

**Key contributions:**
- **RAG filtering v1** (`99a7761`, 2026-04-20): Added automatic filter extraction to the Python FastAPI pipeline. Before querying Qdrant, the system now parses the user query for model numbers, part identifiers, and known keywords. Implemented `/api/filters` endpoint to expose known filterable values. Implemented `/api/debug-filters` endpoint for debugging extracted filters against a raw query. This allows the vector search to restrict results to relevant manual sections rather than returning noise from unrelated documents.
- **Stable POC v1** (`3b27d7a`, 2026-04-22): Stabilised the query API end-to-end. Fixed the FastAPI retrieval route (`/query` not `/search`). Updated the Python `requirements.txt`. Verified that the mobile app could receive structured JSON responses with `answer`, `sources`, and `context` fields.
- **POC v1.1** (`ed0329c`, 2026-04-29): Major RAG pipeline expansion (17 files changed, +1,715 lines). Added `chunker.py`, `embedder.py`, `vector_store.py`, and `retrieval_pipeline.py` as standalone modules. Added support for reading PDF and CSV files. Added `__init__.py` for the `ragPhase2` package. Updated the FastAPI app to use the modular pipeline. Added Qdrant collection management (create/delete/status).
- **RAG filtering v2** (`15684c3`, 2026-05-02): Extended filter extraction with `model_number` as a first-class filter field. Expanded `get_known_filters()` to return structured metadata about each filter type (name, example values, description). Updated the `/filters` response schema.
- **Image enrichment in sources** (`cf5965a`, 2026-05-06): Added `_enrich_sources_with_images()` function to the FastAPI response pipeline. Each source citation in the RAG response is now augmented with a `imageUrl` field constructed from the Firebase Storage path pattern (`gs://bucket/images/{doc_id}.jpg`). Added a download URL resolution step to convert `gs://` URIs to HTTPS Firebase Storage URLs.
- **Image display polish** (`1c989f9`, `b486181`, 2026-05-06/07): Updated the source card component in `dashboard.jsx` to conditionally render an `<Image>` component when `imageUrl` is present. Refined thumbnail layout — constrained image dimensions, added border radius, fixed a flex overflow issue with tall images.

**Files primarily touched:** `server/rag/ragPhase2/` (Python package), `server/rag/app.py`, `dashboard.jsx` (source card), `requirements.txt`

---

### Aichner-04 — 3 commits
**Commits:** `11590fd`, `1ac85e9`, `d556544`

Primary responsibility: Backend security middleware.

**Key contributions:**
- **Input sanitization and validation middleware** (`11590fd`, 2026-05-07): Added three new middleware modules to the Express backend:
  - `server/middleware/sanitize.js`: Strips HTML tags and control characters from all incoming request body fields before they reach route handlers. Protects against XSS payloads injected via the chat input.
  - `server/middleware/validate.js`: Validates required fields on the `/api/chat` endpoint (checks `message` is a non-empty string, `role` is one of the four known roles). Returns a structured 400 error before any AI call is made.
  - `server/middleware/outputSanitize.js`: Escapes HTML entities in outgoing AI response text before sending to the client. Registered as a response interceptor in `server.js`.
  - Updated `server.js` to `use()` all three middleware modules in the correct order.
- **Minor server fix** (`1ac85e9`, `d556544`, 2026-05-08): Two small patch commits adjusting middleware registration order and fixing a variable scoping issue introduced in the previous commit.

**Files primarily touched:** `server/middleware/sanitize.js`, `server/middleware/validate.js`, `server/middleware/outputSanitize.js`, `server.js`

---

## 3. PER-FEATURE / COMPONENT SUMMARY

### Feature 1: RAG Pipeline — End-to-End Integration
**Owners:** Andrei~ (Python), Docsterk (Node.js proxy)
**Commits:** `99a7761`, `3b27d7a`, `ed0329c`, `15684c3`, `c8e1866`, `7e5d6c5`

The RAG pipeline was non-functional at sprint start (FastAPI server existed but was not called by the Node backend, and the mobile app received no AI responses).

Changes made:
- Python FastAPI (`server/rag/ragPhase2/`) refactored into modular `chunker.py`, `embedder.py`, `vector_store.py`, `retrieval_pipeline.py`.
- Automatic filter extraction added: query text parsed for model numbers and part identifiers before Qdrant vector search.
- Node.js `server.js` updated to proxy chat requests to `http://127.0.0.1:8001/query` with the user message and role.
- Response returned to mobile as `{ answer, sources, context }` JSON.
- `start.bat` updated to start Python FastAPI on port 8001 first, then Node.js on port 8000.

### Feature 2: LLM Provider & Role-Based AI
**Owner:** Adil Rumy
**Commits:** `a4eb141`

- Replaced OpenRouter (Gemma 3 27B, external dependency, unreliable rate limits) with OpenAI gpt-4o-mini (direct API, consistent).
- Added `ROLE_SYSTEM_PROMPTS` object in `server.js` with four tailored system prompts:
  - **beginner**: "You are a safety-first maintenance assistant... provide step-by-step numbered instructions... warn before any step that could cause injury."
  - **intermediate**: "You are a knowledgeable maintenance assistant... assume basic technical competence... provide complete procedures."
  - **expert**: "You are a concise technical reference... provide direct answers... skip basic explanations."
  - **admin**: "You are a system diagnostic assistant... provide technical analysis, error diagnosis, and system health insights."
- Chat endpoint selects the correct system prompt based on `role` in the request body.

### Feature 3: Alert Agent & Priority Adjustment Agent
**Owner:** Adil Rumy
**Commits:** `a4eb141`

- `server/agents/alertAgent.js`: Polls Firestore `Alerts` collection every 30 seconds. For any alert with `status: 'unprocessed'`, calls OpenAI to generate a contextual response and writes the result back to Firestore. Updates alert status to `'processed'`.
- `server/agents/priorityAdjustmentAgent.js`: Analyses open maintenance tasks and adjusts priority fields based on elapsed time and task category using LLM classification. Triggered on demand via a dedicated endpoint.

### Feature 4: Audit Logging & HITL Workflow
**Owner:** Wlitzzz (Phillip), with HITL UI by Docsterk
**Commits:** `51614a6`, `042b323`, `36d9075`, `a91f682`, `3db41b9`, `6b50a02`

- `auditLogger.js` records every chat session to Firestore `audit_logs/{sessionId}` with fields: `log_id`, `user_id`, `user_email`, `role`, `messages[]` (arrayUnion), `createdAt`, `last_updated`, `status` (default `'pending'`).
- `history.jsx` (admin-facing): Fetches `audit_logs` in real time via `onSnapshot`. Renders each session as a tappable card. Tapping opens a modal showing the full message thread. Admin can tap Approve or Reject, which calls `/api/approve` or `/api/reject` on the backend.
- Backend endpoints update the Firestore document with `status`, `reviewed_by`, `reviewed_at`, `last_updated`.
- `mysessions.jsx` (worker-facing): Identical view but filtered with `where('user_id', '==', uid)` — workers see only their own history.

### Feature 5: Activity Feed (Alerts Tab → Activity Tab)
**Owner:** Docsterk
**Commits:** `a91fe48`, `07aea3a`, `0cddb5c`

- Initial version: Alerts screen displaying Firestore notifications with priority badges.
- Expanded: Added real-time `onSnapshot` subscription to `Alerts` collection. Added filter tabs (All / Alerts / Priority / Info). Renamed tab from "Alerts" to "Activity". Fixed layout to show header outside `FlatList` so filter tabs don't remount on scroll.

### Feature 6: Admin Dashboard Expansion
**Owner:** Docsterk
**Commits:** `80daf27`, `bd61765`, `6b50a02`

- `analytics.jsx`: Reads `Users` collection, groups by `role_id`, renders role distribution as stat cards.
- `tasks.jsx`: Lists `maintenance_tasks` Firestore documents sorted by priority and date. Shows task title, priority badge (High/Medium/Low), assigned user, and status.
- `documents.jsx`: Lists `ManualDocuments` Firestore documents. Expandable rows showing PDF (via `expo-web-browser`) or CSV (inline parsed renderer) previews.
- `admin.jsx`: Updated to include links to Analytics, User Management, and Pending Sessions count pulled live from Firestore.
- `_layout.jsx`: Added tab registrations for all new screens. Admin tab shown only when `role === 'admin'`; My Sessions tab shown only to non-admins.

### Feature 7: User Management
**Owner:** Docsterk (screens), integrated by Adil Rumy
**Commits:** `bd61765`, `80daf27`

- `usermanagement.jsx`: Lists all `Users` Firestore documents. Search by name. Tap a user to edit.
- `userform.jsx`: Create or edit user (username, email, role_id). On create: writes `{ username, email, role_id, isActive: true, createdAt }`. On edit: uses `setDoc` with `merge: true` to preserve existing fields. Both screens guard against non-admin access via `useFocusEffect`.

### Feature 8: Image Enrichment in RAG Sources
**Owner:** Andrei~
**Commits:** `cf5965a`, `1c989f9`, `b486181`

- Python FastAPI now calls `_enrich_sources_with_images()` before returning the response. Each source citation is augmented with a Firebase Storage download URL for the corresponding manual page image.
- The mobile `dashboard.jsx` source card conditionally renders an `<Image>` component using the `imageUrl` from the source.
- A local migration script (not committed) was used by Wlitzzz to batch-upload manual page images to Firebase Storage prior to this feature landing.

### Feature 9: Security Middleware
**Owner:** Aichner-04
**Commits:** `11590fd`, `1ac85e9`, `d556544`

- Three Express middleware functions added to the request/response pipeline.
- Input sanitization (HTML stripping) applied before any route handler runs.
- Request validation enforces required fields and role whitelisting.
- Output sanitization escapes HTML entities in AI responses before they are sent to the client.

### Feature 10: UI/UX Polish & Keyboard Handling
**Owner:** Docsterk
**Commits:** `0bf6d11`, `472d551`, `d5b1d95`, `bd1a37e`, `1a8dbad`

- Fixed keyboard layout issues on Android (`edgeToEdgeEnabled` flag, `KeyboardAvoidingView` offset calculation).
- Fixed input bar gap when keyboard is hidden.
- Removed chat message avatars (simplified message list).
- Replaced emoji characters with `@expo/vector-icons` Ionicons throughout all screens.
- Added horizontal scroll for tables in markdown responses.
- Fixed FlatList scroll behaviour in activity screen (header lifted out of `ListHeaderComponent` to prevent remounting on each keystroke).

---

## 4. CHRONOLOGY

```
2026-04-20  Sprint kickoff
            - Docsterk: UI updates, keyboard layout fixes, Firebase integration wiring
            - Andrei~:  RAG filter extraction: auto-detect model numbers from query
            - Adil:     Merge server.js conflict; stop tracking env files

2026-04-21  RAG pipeline first connection
            - Docsterk: Wire FastAPI to Node.js backend; fix .env encoding; LAN mode start.bat
            - Docsterk: Fix retrieval endpoint path, switch to free LLM model fallback

2026-04-22  First stable end-to-end query
            - Andrei~:  Stable POC v1 — query API confirmed working frontend→backend→RAG

2026-04-24  Audit logging begins
            - Wlitzzz:  Audit Logging Feature — dual-output logger (local JSON + Firestore)

2026-04-26  Dashboard intelligence + audit logging v2
            - Docsterk: Sidebar, role-based system prompts, Firebase activity logging, Markdown
            - Wlitzzz:  Audit logging v2 — arrayUnion per-message, firebaseAdmin.js extracted

2026-04-28  Audit logging iteration
            - Wlitzzz:  Further audit log session tracking improvements

2026-04-29  RAG pipeline modularisation
            - Andrei~:  POC v1.1 — full module split: chunker, embedder, vector_store,
                        retrieval_pipeline; PDF/CSV ingestion; Qdrant collection management

2026-05-01  Firestore persistence for history
            - Wlitzzz:  Move chat logs to Firestore; user-specific history with onSnapshot
            - Wlitzzz:  Remove stale local audit JSON files
            - Wlitzzz:  Fix logout (navigate away after clearing storage)

2026-05-02  RAG filter improvements
            - Andrei~:  Update RAG filtering — model_number filter, expanded get_known_filters()

2026-05-03  Major UI expansion (admin + worker screens)
            - Docsterk: HITL approve/deny in history.jsx
            - Docsterk: Profile, Analytics dashboard, admin pending sessions count
            - Docsterk: Tasks, Documents, Analytics — complete screens + server /api/documents
            - Docsterk: Fix: added table rendering support

2026-05-04  Image migration prep
            - Wlitzzz:  Image migration scripts and .gitignore entries for checkpoint files

2026-05-06  Alert Agent + OpenAI switch + image enrichment + UI polish
            - Adil:     Alert Agent, Priority Agent, ROLE_SYSTEM_PROMPTS, switch to OpenAI gpt-4o-mini
            - Andrei~:  Add image URLs to RAG source citations (Firebase Storage)
            - Docsterk: Remove avatars, add Ionicons, horizontal table scroll
            - Docsterk: Fix keyboard gap on input bar
            - Andrei~:  Update source image display UI

2026-05-07  RAG thumbnail polish + security middleware
            - Andrei~:  Refine thumbnail layout styling
            - Aichner:  sanitize.js, validate.js, outputSanitize.js — full middleware suite

2026-05-08  Middleware patches
            - Aichner:  Two patch commits fixing middleware integration in server.js

End of sprint: 10 May 2026
```

---

## 5. TECHNICAL DETAIL FOR EVIDENCE

### 5.1 ROLE_SYSTEM_PROMPTS (commit `a4eb141`, `server.js`)
Four role-differentiated system prompts defined in `server.js`. Example (beginner):
```
"You are a safety-first maintenance assistant for FedEx Singapore technicians.
Your user is a beginner worker. Always provide step-by-step numbered instructions.
Warn before any step that could cause injury or equipment damage. Use simple language."
```
Expert persona:
```
"You are a concise technical reference for experienced FedEx Singapore maintenance technicians.
Your user is an expert. Provide direct answers. Skip basic explanations. Use correct
technical terminology. Reference part numbers and procedures directly."
```

### 5.2 auditLogger.js — Dual Output Pattern
```js
// Firestore path: audit_logs/{sessionId}
await db.collection('audit_logs').doc(sessionId).set({
  log_id:       sessionId,
  user_id:      userId,
  user_email:   userEmail,
  role:         role,
  messages:     FieldValue.arrayUnion(messageEntry),
  createdAt:    formattedTimestamp,
  last_updated: formattedTimestamp,
  status:       'pending',
}, { merge: true });
```
Timestamps formatted as `YYYY-MM-DD HH:MM:SS` strings (not `FieldValue.serverTimestamp()`) to maintain consistent ordering with the legacy file-based audit logs.

### 5.3 RAG Filter Extraction (commit `99a7761`, Python)
```python
def extract_filters(query: str) -> dict:
    filters = {}
    model_match = re.search(r'\b(MD-\d+|FX-\d+|\w+-\d{3,})\b', query, re.IGNORECASE)
    if model_match:
        filters['model_number'] = model_match.group(0).upper()
    known_parts = get_known_filters()['part_types']
    for part in known_parts:
        if part.lower() in query.lower():
            filters['part_type'] = part
            break
    return filters
```
Filters are passed to Qdrant as a `must` condition in the search payload.

### 5.4 Image Enrichment (commit `cf5965a`, Python)
```python
def _enrich_sources_with_images(sources: list) -> list:
    for source in sources:
        doc_id = source.get('doc_id') or source.get('id')
        if doc_id:
            gs_path = f"gs://{FIREBASE_BUCKET}/images/{doc_id}.jpg"
            source['imageUrl'] = _resolve_storage_url(gs_path)
    return sources
```

### 5.5 Security Middleware (commit `11590fd`, `server/middleware/`)
`sanitize.js` — strips HTML before route handlers:
```js
module.exports = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].replace(/<[^>]*>/g, '').replace(/[\x00-\x1F]/g, '');
      }
    }
  }
  next();
};
```
`validate.js` — validates `/api/chat` required fields and role whitelist.
`outputSanitize.js` — escapes `<`, `>`, `&`, `"` in AI response text.

### 5.6 HITL Approve/Reject Flow
1. Admin opens `history.jsx` → `onSnapshot` on `audit_logs` collection fires with all logs.
2. Admin taps a session → modal opens showing full `messages[]` array.
3. Admin taps Approve → `fetch('POST', '/api/approve', { sessionId, reviewedBy, reviewedAt })`.
4. Server writes `{ status: 'approved', reviewed_by, reviewed_at, last_updated }` to Firestore.
5. `onSnapshot` fires again → badge on the card in `history.jsx` updates in real time without a page reload.

### 5.7 Role Guard Pattern (useFocusEffect)
Used consistently in admin-only screens (`usermanagement.jsx`, `userform.jsx`, `analytics.jsx`):
```js
useFocusEffect(
  useCallback(() => {
    if (!user) return;
    if (user.role !== 'admin') router.replace('/dashboard');
  }, [user, router])
);
```

---

## 6. STATS

### 6.1 Commit Distribution

| Author | Commits | Role |
|--------|---------|------|
| Docsterk | 14 | Frontend / Full-Stack |
| Wlitzzz (Phillip) | 8 | Backend / Firestore persistence |
| Andrei~ | 8 | Python RAG pipeline |
| Adil Rumy | 5 | AI agents / LLM integration / Team Lead |
| Aichner-04 | 3 | Security middleware |
| **Total** | **38** | |

*(Includes 4 merge commits: `83e25bf`, `a3a284e`, `86faf6b`, `36d9075`)*

### 6.2 Lines of Code

| Metric | Count |
|--------|-------|
| Total insertions | ~7,814 |
| Total deletions | ~2,874 |
| Net new lines | ~4,940 |

### 6.3 Largest Commits by Insertions

| Commit | Author | Description | Insertions |
|--------|--------|-------------|-----------|
| `ed0329c` | Andrei~ | RAG POC v1.1 — full module split | +1,715 |
| `bd61765` | Docsterk | Tasks, Documents, Analytics, Profile screens | +756 |
| `80daf27` | Docsterk | Profile, Analytics, admin pending count | +684 |
| `c8e1866` | Docsterk | Wire FastAPI to Node.js | +623 |
| `d5b1d95` | Docsterk | Keyboard layout overhaul | +522 |
| `07aea3a` | Docsterk | Sidebar, role prompts, Markdown, activity logging | +459 |
| `1a8dbad` | Docsterk | Remove avatars, Ionicons, table scroll | +385 |
| `0cddb5c` | Docsterk | Activity screen (was Alerts), rename + rewrite | +339 |
| `6b50a02` | Docsterk | HITL history viewer with approve/deny | +325 |
| `042b323` | Wlitzzz | Audit logging v2 with Firebase Admin | +283 |

### 6.4 Key New Files Created

| File | Author | Purpose |
|------|--------|---------|
| `server/services/auditLogger.js` | Wlitzzz | Dual-output session audit logger |
| `server/config/firebaseAdmin.js` | Wlitzzz | Firebase Admin SDK initializer |
| `server/agents/alertAgent.js` | Adil Rumy | Alert monitoring agent |
| `server/agents/priorityAdjustmentAgent.js` | Adil Rumy | Task priority adjustment agent |
| `server/middleware/sanitize.js` | Aichner-04 | Input HTML sanitization |
| `server/middleware/validate.js` | Aichner-04 | Request field validation |
| `server/middleware/outputSanitize.js` | Aichner-04 | Output HTML escaping |
| `server/rag/ragPhase2/chunker.py` | Andrei~ | PDF/text chunking module |
| `server/rag/ragPhase2/embedder.py` | Andrei~ | OpenAI embedding wrapper |
| `server/rag/ragPhase2/vector_store.py` | Andrei~ | Qdrant collection management |
| `server/rag/ragPhase2/retrieval_pipeline.py` | Andrei~ | End-to-end RAG retrieval |
| `LLM-Mobile/app/analytics.jsx` | Docsterk | Role distribution dashboard |
| `LLM-Mobile/app/tasks.jsx` | Docsterk | Maintenance task list |
| `LLM-Mobile/app/documents.jsx` | Docsterk | Document viewer (PDF/CSV) |
| `LLM-Mobile/app/profile.jsx` | Docsterk | User profile screen |

### 6.5 Sprint Deliverables Summary

| Deliverable | Status | Primary Owner |
|-------------|--------|---------------|
| RAG pipeline connected to mobile app | Complete | Andrei~, Docsterk |
| Role-differentiated AI responses | Complete | Adil Rumy |
| OpenAI gpt-4o-mini integration | Complete | Adil Rumy |
| Alert Agent (real-time alert processing) | Complete | Adil Rumy |
| Priority Adjustment Agent | Complete | Adil Rumy |
| Audit logging per session | Complete | Wlitzzz |
| User-specific session history (Firestore) | Complete | Wlitzzz |
| HITL approve/reject workflow | Complete | Wlitzzz + Docsterk |
| Admin analytics dashboard | Complete | Docsterk |
| Task management screen | Complete | Docsterk |
| Document viewer (PDF/CSV) | Complete | Docsterk |
| User management (create/edit/list) | Complete | Docsterk |
| Activity feed with real-time updates | Complete | Docsterk |
| Image enrichment in RAG sources | Complete | Andrei~ |
| Query filter extraction (model numbers) | Complete | Andrei~ |
| Security middleware (sanitize/validate) | Complete | Aichner-04 |
| Keyboard/layout fixes (mobile) | Complete | Docsterk |
| Markdown rendering for AI responses | Complete | Docsterk |

---

*All data derived from `git log --since=2026-04-20 --until=2026-05-11` on branch `main`. Commit hashes are the first 7 characters of SHA-1. Line counts are approximate due to reformatting within modified files.*

# Client Meeting Minutes

**Project:** Maintenance Copilot / Maintenance RAG System  
**Date:** 24 April 2026  
**Time:** 5:00 PM  
**Duration:** 14 minutes 10 seconds  
**Meeting Type:** Client progress update / persona and RAG demonstration  
**Client:** Terence Siew  
**Team Members Present:** Adil Rumy, Prince Chikukwa, Andrei Lo Wen Heng, Aichner Anak Abert Achilles Nunong, Phillip Anthony Christopher

## Meeting Purpose

To present the updated persona-based use cases, demonstrate progress on the RAG system and filtering capability, show examples of retrieved manual-based responses, and clarify the next direction for building a more realistic Proof of Concept around a physical maintenance use case.

## Agenda

1. Presentation of updated persona and use-case slides
2. Client feedback on persona-based role design
3. Demonstration of current RAG dataset and filtering capability
4. Review of example query outputs using air-conditioner manuals
5. Discussion of improvements to response formatting and visual retrieval
6. Clarification of physical POC direction and possible equipment sourcing
7. Discussion on next steps and future project direction

## Discussion Summary

### 1. Persona and use-case presentation

- The slides covered four main roles:
  - Beginner
  - Intermediate
  - Expert
  - Admin
- Each role was linked to a specific AI helper:
  - Beginner: Guidance Helper Agent
  - Intermediate: Task Assistance Helper Agent
  - Expert: Technical Decision Support Agent
  - Admin: Approval and Oversight Agent
- The client was satisfied with the persona direction.
- He said the team could proceed in regards to the role, use case, and agentic helper.

### 2. RAG system filtering update

- The team explained that a CSV file is being used to store structured metadata for the ingested documents.
- The RAG system filtering now supports:
  - `document_group_ids`: Unique identifiers grouping related documents
  - `filenames`: Source document names
  - `classifications`: Document types, such as manuals
  - `category_level_1` / `category_level_2`: Hierarchical categorization
  - `model_numbers`: Associated product model mappings

### 3. Dataset and OCR progress

- The team reported that eight air-conditioner manuals have been ingested and are ready to be queried.
- The OCR engine processed around 625 pages.
- The full OCR process took roughly 24 hours.

### 4. Demonstration of manual-based retrieval

- The team demonstrated an example query related to connecting wiring for a Panasonic air-conditioner indoor unit.
- The system retrieved the relevant table content and displayed citations linked to the manual pages.
- The team also showed another example involving a table-based query about flare and flare nut dimensions for R410A.
- The system retrieved the relevant table content and displayed citations linked to the manual pages.
- A video was also sent to demonstrate the POC, including the UI tour and RAG system demo.

### 5. Client feedback on RAG output

- The client said that, at the surface level, the system looked acceptable and was retrieving the required information.
- He suggested that the team could identify improvements by allowing someone to test the system and provide feedback.
- Overall, he said the current RAG output worked for him at this stage.

### 6. Identified improvements

- Response display could be improved.
- One proposed improvement was to display retrieved table information in a cleaner table format, similar to how ChatGPT formats tables.
- The team also mentioned the possibility of adding image retrieval capability in the future, so that figures from manuals could be shown alongside the answer when useful.

### 7. Physical POC discussion

- He suggested that the team could obtain a second-hand air-conditioner compressor/condenser unit as the physical object for the use case.
- The unit will be used for demonstrating a maintenance workflow.
- This would build a more realistic POC around the manuals already being used.

### 8. Funding discussion

- Client budget for obtaining a unit is RM1500.
- He also clarified that the team does not need to use the allocated compute/API budget. The procurement of the air-conditioner unit is separate.
- Once the team has found the suitable air-conditioner and is ready to proceed, they should let the client know so he can arrange the payment.
- He mentioned that payment could be arranged through Wise transfer or Touch 'n Go.

### 9. Future project direction

- The client explained that the POC should help the team identify:
  - what else can be improved
  - what else should be added
  - how the project can be expanded further
- He also discussed the possibility of the project later becoming either:
  - a research project
  - or a system that could eventually be used by the client or related faculty/team
- The client emphasized that, regardless of the future direction, the team still needs to understand requirements clearly and decide how to move forward.

## Decisions Made

- The client accepted the updated persona/use-case direction and said the team could proceed.
- The current RAG retrieval output was considered acceptable at this stage.
- The team will continue improving prompt design and response formatting based on further testing.
- The team will explore better output formatting for table-based responses.
- Image retrieval from manuals can be considered a future improvement.
- The team will look for a suitable physical air-conditioner compressor/condenser unit or similar complex object for the POC.
- The client is open to sponsoring the physical unit separately from the team's compute/API budget if required.

## Action Items

| Action Item | Owner | Deadline |
|---|---|---|
| Continue refining the persona/use-case design based on the approved direction | Team | Ongoing |
| Improve RAG response formatting, especially for table-based outputs | AI / RAG team | Next development cycle |
| Continue testing prompt quality and adjust prompts based on tester feedback | AI / RAG team | Ongoing |
| Explore image/figure retrieval from manuals as a future improvement | AI / RAG team | Future enhancement |
| Source a suitable second-hand air-conditioner compressor/condenser unit or similar physical model | Team | As soon as possible |
| Check whether a matching manual is available for the selected physical unit | Team | Before finalizing purchase |
| Inform the client once a suitable item is found and funding is needed | Team | Before purchase |
| Focus the next POC around a realistic air-conditioner maintenance workflow | Team | Next sprint / upcoming development |

## Closing Summary

The meeting confirmed that the client was satisfied with the updated persona and role-based use cases. The team also demonstrated progress on the RAG system, including improved filtering, ingestion of eight air-conditioner manuals, and manual-grounded query responses. The client agreed that the current retrieval output works at this stage, while also suggesting that further prompt tuning and user testing can help improve it. The next major direction is to build a more realistic POC around a physical air-conditioner compressor or similar maintenance object, with the client open to supporting the purchase if needed.

## Signatures

**Adil Rumy, Team Leader Signature**

**Andrei Lo Wen Heng, Product Owner Signature**

**Terence Siew, Client Signature**

**Date:** 23 May 2026

