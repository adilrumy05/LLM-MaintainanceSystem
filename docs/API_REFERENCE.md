# API Reference — Maintenance Copilot Backend

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
| `role` | string | No | User role — `beginner`, `intermediate`, `expert`, `admin`. Determines system prompt. Defaults to generic prompt if omitted. |
| `userId` | string | No | Firebase user ID. Used for audit logging. |
| `userEmail` | string | No | User email. Used by the priority adjustment agent. |
| `sessionId` | string | No | Session identifier. Used to group audit log entries. |
| `docGroup` | string | No | Filter retrieval to a specific document group ID. |
| `classification` | string | No | Filter retrieval by document classification. |
| `category1` | string | No | Filter retrieval by category level 1. |
| `category2` | string | No | Filter retrieval by category level 2. |
| `topK` | number | No | Number of document chunks to retrieve. Must be a positive integer. Defaults to `5`. |

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

**Success response — 200 OK**

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

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 400 | Query missing or empty | `{ "error": "Query is required." }` |
| 400 | XSS / SQL / prompt injection detected | `{ "error": "Malicious input detected" }` |
| 400 | Input over 1000 characters | `{ "error": "Input too long" }` |
| 400 | Invalid field types | `{ "error": "<field> must be a string." }` |
| 400 | Invalid topK value | `{ "error": "topK must be a positive number." }` |
| 500 | OPENAI_API_KEY not set | `{ "error": "Missing OPENAI_API_KEY in environment variables." }` |
| 503 | RAG retrieval service unreachable | `{ "error": "Retrieval service unavailable", "details": "..." }` |
| 500 | Unhandled server error | `{ "error": "Internal server error", "details": "..." }` |

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

**Success response — 200 OK**
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

**Success response — 200 OK**
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

**Success response — 200 OK**
```json
{ "status": "ok" }
```

---

### GET /api/documents

Returns all known filter values from the RAG retrieval service — document group IDs, filenames, classifications, categories, and model numbers. Used by the mobile app to populate filter dropdowns.

**Example request**
```
GET http://localhost:8000/api/documents
```

**Success response — 200 OK**
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
