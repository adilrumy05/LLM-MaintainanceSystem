# Traceability

Every arrow on a current-state diagram must map to a real call site. Every arrow on a target-state diagram must map to a presentation requirement or a recorded decision.

**An arrow nobody can point at in code comes off the diagram.**

Verified against commit `7670417` on 2026-08-24.

Status key: `verified` — someone opened the file and confirmed it. `asserted` — taken from the exploration pass, not yet re-confirmed by a person. `unverified` — cannot be confirmed from the repository.

---

## D0a — Overall map (current)

D0a is a simplification of D2, not an independent claim. Every box collapses one or more D2 nodes, and every arrow collapses one or more D2 arrows. **A simplification can still be a lie**, so each collapse is recorded here.

| Element | Collapses | Status |
|---|---|---|
| `Backend — 3 endpoints` | `POST /api/query`, `/api/approve`, `/api/reject` — `server.js:78`, `:245`, `:270`. No fourth route accepts app traffic | asserted |
| `Retrieval + Qdrant search` | FastAPI `:8001` and Qdrant `:6333`, drawn as one box because they are never separately addressable from the app | asserted |
| `One developer laptop` | Both processes plus the Qdrant container, per `start.bat` | asserted |
| Thick arrow, app → Firebase (direct SDK, no backend hop) | The five direct-SDK paths in the D2 table (Auth, Users, Alerts, audit_logs, maintenance_tasks, ManualDocuments, Storage) | asserted |
| Thin arrow, app → backend | `services/api.js:33-69` | asserted |
| `loaded by hand — 7 manual steps` | The seven dotted handoffs enumerated in the D4 table | asserted |
| `9 manuals PDF` | Corpus size as ingested | asserted |

**Deliberately omitted from D0a**, and defensible only because D2 carries them: ports, bind addresses, the unverified token, CORS, `latest_prompt.txt`, and the individual Firestore collections. D0a is the client opener, **not** the security picture — that is D6, and it is report-only.

---

## D0b — Overall map (target)

| Element | Traces to | Status |
|---|---|---|
| `Security check` | Decision **A1** plus the D9 control set | proposed |
| Writes routed through the backend | Decision **A1** | proposed |
| App reads direct under security rules | Decision **A1** | proposed |
| `One small cloud server` | Decision **A2** | proposed |
| `Camera · Voice · Timers · Readings` | The four capability slides, collapsed into one box | requirement |
| `Weather` | Decision **A3** | proposed |
| `Data + job history` | Shared target domain model, D5b | requirement |
| `Files, now private` | D9 — private Storage with signed access | proposed |
| `repeatable — one command` | Reproducible ingestion, D8 Phase 1 | requirement |
| Blue boxes carried over unchanged | The reuse-versus-build table in the plan | requirement |

**Deliberately omitted from D0b**: the BGE-M3 branch, the individual backend services, and the target collection set. If asked, move to D7 — do not add boxes to D0b.

**One claim on D0b to be careful with.** *Files, now private* implies the change is scheduled, and it is Phase 1 on D8 — but it is not built. Present the overview maps as current-versus-proposed, never as current-versus-committed.

---

## D0c — Backend close-up (target)

| Element | Traces to | Status |
|---|---|---|
| Front door step 1, token check | Decision **A1**; closes the gap recorded on D6 | proposed |
| Front door step 2, role looked up server-side | Decision **A1**; today the role arrives in the body (`server.js:80-91`) | proposed |
| Front door step 3, `sanitise · validate` | **Exists today** — `server.js:78`. Extended, not added | asserted |
| Supervisor approve / reject entering the front door | `server.js:245`, `:270` today have no middleware at all | asserted |
| `Question handler` drawn blue | `server.js:78-208` — the one handler that exists | asserted |
| `Photo handler` | Camera slides, merged; decision **A4** for the provider | requirement |
| `Reading checker` | Slide *Readings in context*; decision **A3** for ambient | requirement |
| `Asset service` | Slide *Asset tags*; decision **A7** for the QR payload | requirement |
| `Job recorder` | Shared target domain model, D5b — `ServiceVisit` and `StepEvent` | requirement |
| `Manual search` drawn blue | `retrieval_service.py` + `vector_store.py`, reused unchanged | asserted |
| `Alert + priority agents` drawn blue | `server.js:308-330`; `priorityAdjustmentAgent.js` | asserted |
| `Audit log` drawn blue | `services/auditLogger.js:21-31` | asserted |
| Private Storage with signed links | D9 control set | proposed |

**One claim on D0c is a target design choice, not current behaviour.** The audit arrow leaves the *front door*, implying every request is logged on arrival. Today `auditLogger` runs after the OpenAI response (`server.js:202-208`), so a request that is rejected or that fails never reaches it. Moving audit to the entry point is part of the proposal. Do not present D0c as though the audit trail is already complete.

**Deliberately omitted from D0c**, and defensible only because D7 carries them: the FastAPI/Qdrant split inside *Manual search*, the BGE-M3 branch, and the HITL path past the front door.

---

## D2 — Runtime topology (current)

| Arrow | Evidence | Status |
|---|---|---|
| App → Node `POST /api/query` | `LLM-Mobile/app/dashboard.jsx:78`, `:398`; impl `services/api.js:33-69` | asserted |
| Bearer token attached but unverified | Set `services/api.js:42-44`, sent `:59`. `verifyIdToken` — **zero occurrences repo-wide** | asserted |
| App → Node `POST /api/approve` / `/reject` | `LLM-Mobile/app/history.jsx:77-86` — no `Authorization` header | asserted |
| App → Firebase Auth | `login.jsx:30` `signInWithEmailAndPassword`; `userform.jsx:77` `createUserWithEmailAndPassword` | asserted |
| App → Firestore `Users` | read `login.jsx:34`; write `userform.jsx:66`, `:79`; delete `usermanagement.jsx:72` | asserted |
| App → Firestore `Alerts` | write `services/api.js:85-97`, `:101-113`; read `activity.jsx:78-85` | asserted |
| App → Firestore `audit_logs` | `history.jsx:42-47`, `mysessions.jsx:39-42`, `profile.jsx:37-41`, `analytics.jsx:34-38` | asserted |
| App → Firestore `maintenance_tasks` | `tasks.jsx:62-69` read, `:90` add, `:122` update | asserted |
| App → Firestore `ManualDocuments` | `documents.jsx:203` | asserted |
| App → Storage (unauthenticated) | `documents.jsx:140` fetch, `dashboard.jsx:215` `<Image>` | asserted |
| Node → FastAPI `GET /filters` | `server.js:396`; callers `server.js:106`, `:302` | asserted |
| Node → FastAPI `POST /retrieve` | `server.js:130-144` | asserted |
| Node → OpenAI | `server.js:169-184` | asserted |
| Node → Firestore (Admin SDK) | `services/auditLogger.js:21-31`; `agents/priorityAdjustmentAgent.js:15-42`; `server.js:257-262`, `:282-288` | asserted |
| Node → `latest_prompt.txt` | `server.js:28` path, `:161-164` write | asserted |
| FastAPI → Qdrant | `vector_store.py:303-311` search; `:329-342` scroll; `:418-423` parent fetch; `retrieval_pipeline.py:404-410` TOC probe | asserted |
| Node bound `0.0.0.0` | `server.js:310-316` | asserted |
| FastAPI bound `0.0.0.0` | `start.bat:79`; `retrieval_service.py:160-162` | asserted |

---

## D3 — Query flow (current)

| Step | Evidence | Status |
|---|---|---|
| Middleware chain | `server.js:78` — `sanitize, validate, outputSanitize` | asserted |
| Filter fetch on every query | `server.js:106` → `:396` → `vector_store.py:329-342` full scroll, uncached | asserted |
| Substring filter extraction | `server.js:359-391` — `q.includes(value)`, first match wins | asserted |
| Retrieve call | `server.js:130-144`; served by `retrieval_service.py:56-90` | asserted |
| Two searches, truncated to k | `retrieval_pipeline.py:322-337` loop, `:340-341` sort and slice | asserted |
| Parent hydration | `retrieval_pipeline.py:489-517`; `vector_store.py:410-430` | asserted |
| Prompt written to disk | `server.js:161-164` | asserted |
| OpenAI call | `server.js:169-184` — `gpt-4o-mini`, temp 0.2, max_tokens 2048 | asserted |
| Audit write | `server.js:202-208` → `auditLogger.js:21-31` | asserted |
| Alert keyword scan | `server.js:308-330` `detectAlerts` | asserted |
| Priority escalation, critical only | `priorityAdjustmentAgent.js:5` gate, `:15-42` writes | asserted |
| Client writes its own Alerts | `services/api.js:85-113` — after the response | asserted |

---

## D4 — Offline pipeline (current)

| Element | Evidence | Status |
|---|---|---|
| OCR notebook, Colab + GPU | `server/rag/phase1/phase1_ocr.ipynb` — Drive mount, `paddlepaddle-gpu`, MonkeyOCR subprocess | asserted |
| OCR checkpoint | `checkpoint/ocr_checkpoint.json`, composite key `group\|CLASS\|stem` | asserted |
| Parsing notebook | `phase1_llm_parsing.ipynb` — consumes the OCR checkpoint, hard-fails without it | asserted |
| Four helper modules absent from repo | `general_processor.py`, `general_content_extractor.py`, `html_table_converter.py`, `llm_table_normalizer.py` — copied from `Drive/scripts/` | asserted |
| Ingestion entry point | `ingest_to_qdrant.py:23`; reads `EXTRACTION_DIR` `:78` | asserted |
| Chunk → embed → upsert order | `ingest_to_qdrant.py:293-373` | asserted |
| Collection and dimensions | `vector_store.py:43` name; `:26`, `ingest_to_qdrant.py:304-307` dim 768; `embedder.py:33`, `:68` model | asserted |
| `migrateImages.js` hardcoded source | `uploads/migrateImages.js:8` — `G:\.shortcut-targets-by-id\...` | asserted |
| `images/` insertion | `uploads/migrateImages.js:74-75` | asserted |
| Runtime mirror of that insertion | `retrieval_pipeline.py:646` | asserted |
| `uploadDocuments.js` hardcoded source | `uploads/uploadDocuments.js:19` — `C:/Users/phill/Downloads/data` | asserted |
| `[Row ` content-type heuristic | `ingest_to_qdrant.py:179-183`; producer `chunker.py:135` `_ROW_RE` | asserted |
| `data_information.csv` not in repo | No `*.csv` in the working tree; read only in the two Colab notebooks | asserted |
| No orchestration exists | No shell script, Makefile, CI workflow or npm ingestion script; `start.bat` is runtime only | asserted |

---

## D5a — Data model (current)

| Element | Evidence | Status |
|---|---|---|
| `Users` fields | `userform.jsx:79-85`; role map `login.jsx:12-17` | asserted |
| `audit_logs` fields | `auditLogger.js:14-31`; HITL fields `server.js:257-262`, `:282-288` | asserted |
| `last_updated` is a string | `auditLogger.js:22`; consequence `analytics.jsx:35`, `:94` | asserted |
| `Alerts` writers | `services/api.js:85`, `:101`; `priorityAdjustmentAgent.js:29-42` | asserted |
| `maintenance_tasks` has no completion data | `tasks.jsx:90-99` create, `:122` the only update | asserted |
| `ManualImages` never read | Written `uploads/uploadToFirebase.js:90`; no reader found | asserted |
| Qdrant payload fields | `vector_store.py:510-591` `_build_payload` | asserted |
| Indexed fields | `vector_store.py:46-56` | asserted |
| No `firestore.rules` in repo | File absent | asserted |

---

## D6 — Trust boundaries (current)

| Claim | Evidence | Status |
|---|---|---|
| Token never verified | `verifyIdToken` — zero occurrences repo-wide | asserted |
| `/approve`, `/reject` have no middleware | `server.js:245`, `:270` — no middleware arguments | asserted |
| Identity taken from the request body | `server.js:80-91`; `role` selects the prompt `:167`; `userId` written to audit `:206` | asserted |
| CORS wide open | `server.js:24` — `app.use(cors())` | asserted |
| RBAC is client-side only | `LLM-Mobile/hooks/useRole.js:6-19`; no server equivalent | asserted |
| Client writes its own role | `userform.jsx:79` writes `role_id` | asserted |
| Storage public by URL | `uploadToFirebase.js:87` mints `?alt=media`; no `makePublic()` or signed URL call | asserted |
| Service account key in two locations | `server/config/firebaseAdmin.js:6`; `uploads/uploadToFirebase.js:8` | asserted |
| **Qdrant LAN exposure** | **`docker run` invocation is not in the repo. Confirm with `docker inspect` before asserting.** | **unverified** |

---

## D5b, D7, D8, D9, D10 — target state

Target arrows trace to a decision or a requirement, not to code.

| Element | Traces to | Status |
|---|---|---|
| Backend on the write path | Decision **A1** | proposed |
| Cloud container host | Decision **A2** | proposed |
| Weather API + indoor override | Decision **A3** | proposed |
| Vision via existing `gpt-4o-mini` | Decision **A4** | proposed |
| On-device STT and TTS | Decision **A5** | proposed |
| Per-feature offline behaviour | Decision **A6** | proposed |
| Opaque asset ID in the QR code | Decision **A7** | proposed |
| `StepEvent.endsAt` deadline model | Decision **A8** | proposed |
| Camera subsystem, three use cases | Slides *Show it, don't describe it* and *Point the camera at it*, merged | requirement |
| `Measurement` + `AmbientContext` | Slide *Readings in context* | requirement |
| `ProcedureRun` + `StepEvent` | Slide *Procedure timers* | requirement |
| `Asset` + QR lifecycle | Slide *Asset tags* | requirement |
| Voice command state machine | Slide *Hands-free mode* | requirement |
| Dense + sparse fusion, blue-green migration | Slide *RAG updates*; thresholds in the plan | requirement, gated |
| `assetId` denormalised on every child | Firestore has no join support | design constraint |
| Qdrant snapshot schedule | No backup process exists today | gap |

---

## Outstanding verification

Nothing here is `verified` yet — every current-state row is `asserted` from the exploration pass. Before these diagrams are presented as fact:

- [ ] A named owner opens each file and confirms every row in their diagram's table, changing `asserted` to `verified`.
- [ ] Run `docker inspect` on the Qdrant container and resolve the one `unverified` row.
- [ ] Walk D4 by putting one PDF through the full pipeline.
- [ ] Trace the six required flows listed in the plan's verification section.
- [ ] Ratify A1–A8 in `DECISIONS.md`, which moves the target rows from `proposed` to `accepted`.
- [ ] Confirm the five handler boundaries in D0c survive contact with A1–A8. D0c asserts one handler per request type; if the team consolidates any two, the diagram changes.
- [ ] Re-check D0a against D2 after any D2 change. The overview is a projection of D2 — if D2 moves and D0a does not, the client is being shown a stale map.
