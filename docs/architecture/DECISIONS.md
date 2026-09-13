# Architecture Decision Register

Decisions A1–A8 must be ratified before D7 (target architecture) can be considered final. Each is recorded here as **Proposed** with a recommendation and rationale. Change `Status` to **Accepted** with a date and the names of who agreed, or **Superseded** with a pointer to the replacement.

Gate 2 in the build order is closed when every row below reads Accepted.

| ID | Decision | Status | Decided on | Agreed by |
|---|---|---|---|---|
| A1 | Direct Firestore vs backend APIs | Proposed | — | — |
| A2 | Cloud, local or hybrid deployment | Proposed | — | — |
| A3 | Ambient data source | Proposed | — | — |
| A4 | Vision provider | Proposed | — | — |
| A5 | Speech-to-text and text-to-speech | Proposed | — | — |
| A6 | Online/offline requirements | Proposed | — | — |
| A7 | QR code contents | Proposed | — | — |
| A8 | Timer implementation | Proposed | — | — |

---

## A1 — Direct Firestore access vs backend APIs in the target

**Recommendation: hybrid.** Reads stay direct from the client, governed by Firestore security rules. Writes that carry authority route through the Node backend.

Authority-carrying writes are: role assignment, user creation and deletion, task status transitions, job completion, and HITL approve/reject.

**Rationale.** Proxying everything through the backend is effectively a rewrite, and it would destroy the real-time `onSnapshot` listeners that six screens depend on (`activity.jsx:78`, `analytics.jsx:34`, `history.jsx:42`, `mysessions.jsx:39`, `admin.jsx:40`). Rules plus backend-for-writes gets the security outcome at proportionate cost.

**What this changes.** Today `userform.jsx:79` writes `role_id` straight from the client — a user can grant themselves admin. Under A1 that call becomes a backend endpoint that verifies the caller's token and their existing role first.

**Consequence if rejected.** If the team chooses full proxying instead, budget for rewriting every screen's data layer and replacing live listeners with polling.

---

## A2 — Cloud, local or hybrid deployment

**Recommendation: hybrid.** Node, FastAPI and Qdrant containerised on one small cloud host. Firebase is already cloud. A `docker-compose.yml` is retained for local development.

**Rationale.** A developer laptop cannot host a client pilot — it is not reachable, not always on, and currently the single point of failure for the entire system. Fully managed infrastructure (managed Qdrant, managed container hosting) is beyond a student budget.

**Open sub-question.** The host's available RAM must be fixed before the BGE-M3 operational threshold can be stated as a number. Decide the instance size when this decision is ratified.

---

## A3 — Ambient data source

**Recommendation: weather API keyed to device location, with a mandatory manual override for indoor work.**

**Rationale for rejecting the alternatives.** Phone temperature sensors measure the phone's own thermal state, not the room. The equipment does not expose sensors readable from a phone. Manual-only entry will be skipped under time pressure, which is exactly when readings matter most.

**The weakness, stated plainly.** Outdoor weather is not plant-room conditions. A rooftop condenser in direct sun and a basement plant room can differ by fifteen degrees from the reported ambient. The manual override is therefore **load-bearing, not a convenience**, and the feature must mark any reading taken indoors as requiring it before a verdict is issued.

**Implication for D5b.** `AmbientContext.indoorOverrideRequired` exists for this reason, and `Measurement.verdict` must support `inconclusive` when the override was not supplied.

---

## A4 — Vision provider

**Recommendation: the existing OpenAI `gpt-4o-mini`.**

**Rationale.** It is already multimodal, already integrated (`server.js:169-184`), already paid for, and already holds the only LLM credential in the system. Adding a second vision vendor means a second key, a second billing relationship, a second failure mode and a second privacy review, for no capability the team needs.

**Implementation note.** The change is to the `messages` array only — today `content` is a plain string; multimodal requires a content-part array. No new service, no new dependency.

---

## A5 — Speech-to-text and text-to-speech

**Recommendation: `expo-speech-recognition` for STT (already a declared dependency, currently unused) and `expo-speech` for TTS (to be added).**

**Rationale.** Both run on-device. No new vendor, no new key, no per-request cost, and — importantly for A6 — both keep working with no connectivity. A cloud STT provider would make hands-free mode useless in exactly the basements and plant rooms where hands are busiest.

---

## A6 — Online/offline requirements

**Recommendation: per feature, not a blanket claim.**

| Feature | Offline behaviour |
|---|---|
| Procedure timers | Fully offline — local state plus a scheduled notification |
| Readings capture | Capture offline, queue, sync on reconnect |
| Readings evaluation | Works offline if the procedure was already opened and its spec table cached |
| Asset scan | Resolves offline against a cached asset registry |
| Camera / vision | Requires connectivity — it is an LLM call |
| Hands-free | STT and TTS work on-device; the answer itself needs connectivity |

**Rationale.** "Works offline" as a global claim is neither deliverable nor necessary. Being specific lets the team ship the offline behaviour that matters (timers, capture, asset lookup) without pretending the LLM path can work without a network.

---

## A7 — QR code contents

**Recommendation: an opaque asset identifier only**, e.g. `mc:asset:8f3c1e2a-...`. Not a URL, not the model number, not a Firestore document path.

**Rationale.**

- **A URL** leaks infrastructure, breaks when the domain changes, and invites anyone with a phone camera to probe the system.
- **The model number** goes stale the moment a unit is replaced with a different model at the same location — and the whole point of asset tags is to identify *this machine*, not its type.
- **A Firestore path** couples a physical sticker to a storage implementation the team may change.
- **An opaque ID** resolves offline against a cached registry, survives any backend change, and is meaningless to an outsider who photographs it.

**Lifecycle to support:** issue, print, replace (unit swapped, tag reissued, history retained), retire.

---

## A8 — Timer implementation

**Recommendation: persist a deadline timestamp (`endsAt`) and schedule a local notification. Never run a background countdown.**

**Rationale.** Background execution is unreliable on both iOS and Android — the OS suspends or kills the app, and a running countdown dies with it. Storing `endsAt` and computing the remaining time on resume is the only approach that survives app suspension, device lock, a phone call, or a battery-saver kill.

**Behaviour on resume.** If `now > endsAt`, the wait completed while the app was closed — show it as elapsed, record the `timer_elapsed` `StepEvent`, and do not silently restart it.

**Implication for D5b.** `StepEvent.endsAt` exists for this reason, and is the reason timers work fully offline in A6.
