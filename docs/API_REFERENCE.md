# API Reference - Maintenance Copilot Backend

**Base URL:** `http://localhost:8000`  
**Server:** Node.js + Express  
**All request bodies:** JSON (`Content-Type: application/json`)  
**All responses:** JSON

---

## Middleware Pipeline

Every request to `/api/query` passes through three middleware layers in order before reaching the route handler:

```
Request → sanitize.js → validate.js → outputSanitize.js → Route Handler → Response
```

| Middleware | File | What it does |
|---|---|---|
| sanitize | `server/middleware/sanitize.js` | Strips HTML tags from all string fields. Blocks XSS, SQL injection, and prompt injection patterns in the `query` field. Rejects inputs over 1000 characters. |
| validate | `server/middleware/validate.js` | Checks that `query` is a non-empty string. Validates optional field types. Rejects non-positive `topK` values. |
| outputSanitize | `server/middleware/outputSanitize.js` | Intercepts `res.json()` and HTML-encodes all string values in the response to prevent XSS in the client. |

---

## Endpoints

### POST /api/query

Submits a maintenance query. Retrieves relevant document chunks via the RAG pipeline, generates a role-appropriate response via OpenAI gpt-4o-mini, logs the session to Firestore, and runs the alert and priority adjustment agents.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | The maintenance question. Max 1000 characters. |
| `role` | string | No | User role - `beginner`, `intermediate`, `expert`, `admin`. Determines system prompt. Defaults to generic prompt if omitted. |
| `userId` | string | No | Firebase user ID. Used for audit logging. |
| `userEmail` | string | No | User email. Used by the priority adjustment agent. |
| `sessionId` | string | No | Session identifier. Used to group audit log entries. |
| `docGroup` | string | No | Filter retrieval to a specific document group ID. |
| `classification` | string | No | Filter retrieval by document classification. |
| `category1` | string | No | Filter retrieval by category level 1. |
| `category2` | string | No | Filter retrieval by category level 2. |
| `topK` | number | No | Number of document chunks to retrieve. Must be a positive integer. Defaults to `5`. |
| `imageBase64` | string | No | Photo-and-ask. The photo as **raw base64** (JPEG), without a `data:` URL prefix. Max 4 MB decoded; the whole request body is capped at 12 MB. |
| `confirmedModel` | string | No | Photo-and-ask. The model the technician confirmed for this chat, sent after an `ask_model` or `conflict` reply. |

**Example request**
```json
{
  "query": "How do I connect the wiring for the indoor unit panasonic_aircon_E7JKEW?",
  "role": "beginner",
  "userId": "user-abc123",
  "userEmail": "tech@fedex.com",
  "sessionId": "sess-xyz789",
  "topK": 5
}
```

**Success response - 200 OK**

```json
{
  "text": "To connect the wiring for the indoor unit...",
  "sources": [
    {
      "filename": "CS-E7JKEW_SM_PNAAW016053C9.pdf",
      "document_group_id": "panasonic_aircon_E7JKEW",
      "page": 55,
      "classification": "MANUAL"
    }
  ],
  "context_blocks": [
    {
      "text": "...",
      "chunk_type": "text",
      "page": 55
    }
  ],
  "reasoning": "Generated via OpenAI gpt-4o-mini with RAG context",
  "alert": {
    "level": "warning",
    "icon": "⚠️",
    "title": "Safety Warning in Response",
    "reason": "Response contains safety content: \"warning\""
  },
  "priorityTask": null
}
```

The `alert` field is `null` if no safety keywords are detected. `level` is either `"warning"` or `"critical"`.

**Needs-input response - 200 OK (photo requests only)**

When a photo is attached and the backend cannot safely answer yet, it returns **200** so the app renders a normal
reply and keeps the photo. These are expected outcomes, not errors.

```json
{
  "text": "I read this as RAS-30. Which model is it?",
  "sources": [],
  "needsInput": "ask_model",
  "candidates": ["RAS-30-BKVS-A"],
  "readModel": null,
  "imageAttached": true
}
```

| `needsInput` | Meaning | What the app should do |
|---|---|---|
| `ask_photo` | Photo unreadable (blurred, dark, cropped) | Show `text`; offer a retake |
| `ask_model` | No model established, or only a partial match | Show `candidates` as choices; resend the same question and photo with `confirmedModel` |
| `conflict` | Photo disagrees with the chat's confirmed model or selected manual | Ask which one; resend with the chosen `confirmedModel` |
| `no_manual` | Model read, but no manual for it in the system | Show `text`; do not retry automatically |
| `no_context` | Model known, but nothing relevant retrieved | Show `text`; suggest rephrasing or checking the selected manual |

**Error responses**

Every non-2xx body has `error`, a message the app can show as-is. Photo and service errors also carry a stable
`code`. Service failures carry `retryable: true`, and `imageAttached: true` when a photo was sent, so the app can
keep the photo and offer a retry. Raw upstream bodies are logged server-side, never returned.

| Status | Condition | `code` | Body |
|---|---|---|---|
| 400 | Query missing or empty | — | `{ "error": "Query is required and must be a non-empty string." }` |
| 400 | XSS / SQL / prompt injection detected | — | `{ "error": "Malicious input detected" }` |
| 400 | Input over 1000 characters | — | `{ "error": "Input too long" }` |
| 400 | Invalid field types | — | `{ "error": "<field> must be a string." }` |
| 400 | Invalid topK value | — | `{ "error": "topK must be a positive number." }` |
| 400 | Body is not valid JSON | `invalid_json` | `{ "error": "Request body is not valid JSON.", "code": "invalid_json" }` |
| 400 | `imageBase64` not base64, not a string, or sent as a `data:` URL | `invalid_image` | `{ "error": "<how to fix it>", "code": "invalid_image" }` |
| 413 | Image over 4 MB decoded, or body over 12 MB | `image_too_large` | `{ "error": "Image too large ... Retake the photo at a lower resolution and try again.", "code": "image_too_large" }` |
| 500 | OPENAI_API_KEY not set | `server_misconfigured` | `{ "error": "Missing OPENAI_API_KEY in environment variables.", "code": "server_misconfigured" }` |
| 500 | Unhandled server error | `internal_error` | `{ "error": "Internal server error. Try again, and report it if it keeps happening.", "code": "internal_error" }` |
| 502 | Answer model returned an error (provider status is never passed through) | `answer_unavailable` | `{ "error": "The answer service failed. Try again in a moment.", "code": "answer_unavailable", "retryable": true }` |
| 503 | Answer model unreachable | `answer_unavailable` | `{ "error": "Could not reach the answer service. Try again in a moment.", "code": "answer_unavailable", "retryable": true }` |
| 503 | Manual catalogue unavailable (photo requests) | `catalogue_unavailable` | `{ "error": "Cannot reach the manual catalogue right now. Try again in a moment.", "code": "catalogue_unavailable", "retryable": true, "imageAttached": true }` |
| 503 | Vision model unavailable (photo requests) | `vision_unavailable` | `{ "error": "Could not analyse the photo right now. Try again in a moment.", "code": "vision_unavailable", "retryable": true, "imageAttached": true }` |
| 503 | Retrieval service unreachable or failing | `retrieval_unavailable` | `{ "error": "Retrieval service unavailable. Try again in a moment. ...", "code": "retrieval_unavailable", "retryable": true }` |

**Photo-and-ask status**

- Backend and contract: implemented and covered by `tests/endpoints/query.photo.test.js` and `tests/unit/visionIntake.test.js` (vision calls mocked).
- **Real-photo testing: pending.** Not yet run against real nameplate and fault-display photos. Not complete.
- **Hands-free device spike: pending.** Not started on a device. Not complete.
- Mobile integration: pending (`dashboard.jsx`, `services/api.js`).

---

### POST /api/approve

Approves an audit log session. Updates the `audit_logs` Firestore document for the given `sessionId` with status `approved`.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | Yes | The audit log document ID to approve. |
| `reviewedBy` | string | No | Email or name of the reviewer. Defaults to `"admin"`. |
| `reviewedAt` | string | No | Timestamp of review. Defaults to current server time (`YYYY-MM-DD HH:MM:SS`). |

**Example request**
```json
{
  "sessionId": "sess-xyz789",
  "reviewedBy": "admin@fedex.com",
  "reviewedAt": "2026-06-13 10:30:00"
}
```

**Success response - 200 OK**
```json
{ "status": "approved" }
```

**Firestore fields written**
```
status:       "approved"
reviewed_by:  "admin@fedex.com"
reviewed_at:  "2026-06-13 10:30:00"
last_updated: "2026-06-13 10:30:00"
```

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 400 | `sessionId` missing | `{ "error": "sessionId required" }` |
| 503 | Firebase Admin not initialised | `{ "error": "Firebase Admin not configured" }` |
| 500 | Firestore write failed | `{ "error": "<firestore error message>" }` |

---

### POST /api/reject

Rejects an audit log session. Updates the `audit_logs` Firestore document for the given `sessionId` with status `rejected`.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | Yes | The audit log document ID to reject. |
| `reviewedBy` | string | No | Email or name of the reviewer. Defaults to `"admin"`. |
| `reviewedAt` | string | No | Timestamp of review. Defaults to current server time. |
| `reason` | string | No | Rejection reason. Written to `rejection_reason` field in Firestore if provided. |

**Example request**
```json
{
  "sessionId": "sess-xyz789",
  "reviewedBy": "admin@fedex.com",
  "reason": "Procedure not followed correctly"
}
```

**Success response - 200 OK**
```json
{ "status": "rejected" }
```

**Firestore fields written**
```
status:           "rejected"
reviewed_by:      "admin@fedex.com"
reviewed_at:      "2026-06-13 10:30:00"
last_updated:     "2026-06-13 10:30:00"
rejection_reason: "Procedure not followed correctly"  (only if reason was provided)
```

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 400 | `sessionId` missing | `{ "error": "sessionId required" }` |
| 503 | Firebase Admin not initialised | `{ "error": "Firebase Admin not configured" }` |
| 500 | Firestore write failed | `{ "error": "<firestore error message>" }` |

---

### GET /api/health

Health check endpoint. Returns immediately with no external calls.

**Example request**
```
GET http://localhost:8000/api/health
```

**Success response - 200 OK**
```json
{ "status": "ok" }
```

---

### GET /api/documents

Returns all known filter values from the RAG retrieval service - document group IDs, filenames, classifications, categories, and model numbers. Used by the mobile app to populate filter dropdowns.

**Example request**
```
GET http://localhost:8000/api/documents
```

**Success response - 200 OK**
```json
{
  "document_group_ids": ["panasonic_aircon_E7JKEW", "panasonic_aircon_CS5"],
  "filenames": ["CS-E7JKEW_SM_PNAAW016053C9.pdf"],
  "classifications": ["MANUAL", "SERVICE_BULLETIN"],
  "category_level_1": ["Installation", "Maintenance"],
  "category_level_2": ["Wiring", "Refrigerant"],
  "model_numbers": ["E7JKEW", "CS5"]
}
```

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 500 | Retrieval service unreachable | `{ "error": "<error message>" }` |

---

## Alert Levels

The `/api/query` response includes an `alert` field generated by scanning the AI response text for safety-critical keywords.

| Level | Keywords that trigger it | Example |
|---|---|---|
| `critical` | loto, lockout, tagout, high voltage, electrical hazard, life-threatening, fatal, electrocution | Response mentions LOTO procedure |
| `warning` | warning, caution, ppe, personal protective equipment, hazard, danger, high risk, critical safety, do not operate | Response contains a caution note |
| `null` | No keywords found | Safe, non-hazardous response |

---

## Role System Prompts

The `role` field in `/api/query` selects one of four system prompts sent to OpenAI:

| Role | Persona | Focus |
|---|---|---|
| `beginner` | Guidance Helper | Plain language, numbered steps, safety flags, escalation reminder |
| `intermediate` | Task Assistance Helper | Procedure from manual, CAUTION notes, tools and torque specs |
| `expert` | Technical Decision Support | Tolerances, specs, failure modes, standards and compliance |
| `admin` | Approval and Oversight Helper | Risk level summary, compliance flags, audit considerations |
