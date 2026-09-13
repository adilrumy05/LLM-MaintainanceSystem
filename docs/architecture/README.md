# Architecture Map

Thirteen diagrams covering the Maintenance Copilot as it exists today and the target system implied by the Project B proposals.

**Verified against commit `7670417` on 2026-08-24.** A diagram whose header date is older than the last architectural change is stale — treat it as unverified until re-checked.

---

## Which diagram do I need?

| # | File | Shows | Client deck | Report |
|---|---|---|---|---|
| D0a | `00a-overview-current` | **Overall map, current** — the whole system in six boxes | Yes | Yes |
| D0b | `00b-overview-target` | **Overall map, target** — the same six boxes, extended | Yes | Yes |
| D0c | `00c-overview-backend` | **Backend close-up, target** — inside the server box of D0b | Yes | Yes |
| D1 | `01-system-context` | The 30-second view | Yes | Yes |
| D2 | `02-runtime-topology` | Processes, ports, who calls whom | Yes, simplified | Yes |
| D3 | `03-query-flow` | A live request end to end | No | Yes |
| D4 | `04-offline-pipeline` | How manuals get into the system | No | Yes |
| D5a | `05a-data-model-current` | Collections as they stand | No | Yes |
| D5b | `05b-data-model-target` | Shared target domain model | No | Yes |
| D6 | `06-trust-boundaries` | Where auth is and is not enforced | **No** | Yes |
| D7 | `07-target-architecture` | The complete future system | Yes | Yes |
| D8 | `08-rollout-roadmap` | What must exist before what | Yes | Yes |
| D9 | `09-security-governance` | The target control set | Yes | Yes |
| D10 | `10-deployment` | Where the system actually runs | No | Yes |

**Client presentation order: D0a → D0b → D0c → D1 → D2 → D7 → D8 → D9.**

D0a and D0b are the pair to open with. They are deliberately coarse — six boxes each, laid out identically — so the client sees the delta by looking from one to the other rather than by reading labels. Every diagram after them is the same system at higher resolution.

D6 is report-only. Its client-facing counterpart is D9, which presents the same subject as forward-looking design rather than as a list of current gaps.

---

## Legend

| Style | Meaning |
|---|---|
| Solid blue fill | Exists today, reused unchanged |
| White fill, orange border | Exists today, being extended |
| Orange fill, dashed border | Genuinely new |
| Grey fill, dashed border | Conditional on a passing benchmark |
| Grey dotted arrow | A human copying files by hand |
| Red dashed border (D6 only) | Missing or unenforced control |
| Green fill (D9 only) | Control already delivered in Project A |

---

## Reading notes

### D0a / D0b — Overall maps

**These two are a matched pair and only work together.** Same nodes, same positions, same left-to-right reading order. Show D0a, let it settle, then show D0b and let the audience find the differences themselves.

The three differences worth naming out loud, in this order:

1. **The phone grows.** Camera, voice, timers and readings capture are new work on the device, not new servers.
2. **A security check appears in front of the backend, and writes now go through it.** On D0a the thick arrow runs phone → Firebase directly, bypassing our own server entirely. On D0b that arrow starts at the backend instead. This is the single structural change in the whole proposal.
3. **The laptop becomes a server, and ingestion becomes one command.** *Seven manual steps* on D0a is not a simplification made for the audience — it is the literal count. See D4.

Everything blue on D0b is carried over unchanged from D0a. Say that out loud: the proposal is an extension, and the overview pair is where that is easiest to prove.

D0a and D0b intentionally omit detail that D2 and D7 carry — ports, individual collections, the FastAPI and Qdrant split, the BGE-M3 branch. If someone asks a question these cannot answer, that is the cue to move to D2 or D7, not to add boxes here. **Resist growing them.** Their value is entirely in being small.

### D0c — Backend close-up (target)

**D0c is one box of D0b, opened up** — the server. Show it only after D0b has landed, and say that is what you are doing, or it reads as a seventh unrelated diagram.

The shape carries the argument: **one front door, five handlers, three shared services.**

- **The front door is one box on purpose.** Three numbered steps inside it — who are you, what may you do, input checks. Drawing them as three separate boxes made the diagram taller and implied they are three separately bypassable things. They are one gate.
- **One handler per kind of request** is the reuse argument in visual form. The question handler is blue because it exists and runs today; the other four are new code beside it, not a rewrite of it.
- **The shared services row is why this is cheaper than it looks.** Manual search, the alert and priority agents, and the audit log are all built already, and every new handler uses them rather than growing its own.

**One honesty note.** The audit arrow leaves the front door, which says *every request is logged whatever it is*. That is the target design. Today `auditLogger` is called after the answer is produced (`server.js:202-208`), so unanswered and rejected requests leave no trace. Moving the log to the entry point is a deliberate change, not a drawing convenience — see `TRACEABILITY.md`.

Deliberately omitted: the FastAPI and Qdrant split inside *Manual search*, the HITL approval path beyond its arrival at the front door, and the BGE-M3 branch. D7 carries all three.

### D1 — System context
The Gate 4 test lives here: hand this to someone outside the team. If they cannot describe what the system does after one read, simplify it further before it goes in front of the client.

### D2 — Runtime topology
**Read the arrow weights.** Thick arrows are the real data path. The backend carries exactly three flows; everything else the app does goes phone → Firebase directly, with authority enforced only in client-side JavaScript.

This asymmetry is the single most important true thing about the current system, and every design decision downstream follows from it. Any diagram that draws phone → backend → Firestore is fiction.

Two details worth annotating when presenting: `getKnownFilters()` triggers a full Qdrant collection scroll on **every** query with no caching, and `latest_prompt.txt` is a single global file overwritten on every request.

### D3 — Query flow
Every step maps to a line in `server.js` or the Python pipeline — see `TRACEABILITY.md`.

Note the two searches (child and table) that each fetch `k` results and are then truncated to `k` total: tables and prose compete for the same five slots, which is why a long procedure can lose its figures.

Future overlay, not yet drawn as a separate diagram: a token verification step precedes `sanitize`; an image branch feeds identified model numbers into the filter step instead of substring matching; `GET /filters` becomes cached; retrieval becomes dense + sparse **if** the benchmark passes.

### D4 — Offline ingestion pipeline
**Dotted arrows are humans copying files. There are seven of them.** Nothing here is orchestrated; resumability via six unrelated checkpoint files is the substitute for automation.

Two fragile seams, coupled by nothing but a comment:

1. The `images/` directory insertion, duplicated in `migrateImages.js:74` and `retrieval_pipeline.py:646`. Change the migration layout and retrieval silently 404s.
2. The `[Row ` prefix, which couples `html_table_converter` output to the content-type heuristic at `ingest_to_qdrant.py:181`. Switching phase 1 to `llm` table mode would silently classify every table page as plain text.

Two reproducibility holes are marked in orange: `data_information.csv` (which drives output paths, metadata **and** the Qdrant filter schema) is not committed, and four helper modules exist only on a Google Drive.

### D5a — Data model, current
No foreign keys exist anywhere. Every relationship is a string convention.

`maintenance_tasks` has **no completion data at all** — `tasks.jsx:122` writes `{ status }` and nothing else, so time-to-resolution is not computable. `ManualImages` is written by the upload script and never read by anything; the runtime rebuilds Storage URLs by string surgery instead.

### D5b — Shared target domain model
Decisions baked into this diagram:

- `ServiceVisit` and `JobSession` were two names for one thing. **One entity: `ServiceVisit`.**
- `StepEvent` and `TimerEvent` are merged; a timer event is a *type* of step event.
- `AmbientContext` is **embedded** in `Measurement`, not referenced — conditions at the moment of measurement are immutable and belong with the reading.
- **Every child carries `assetId` denormalised.** Firestore has no joins, so without this, "show me this unit's history" becomes N queries instead of one. This is the single most consequential modelling decision in the set.

Mapping to what exists: `maintenance_tasks` **extends** into `ServiceVisit` (old documents stay valid), `audit_logs` gains a `visitId`, `Alerts` is reused with new event types and no schema change.

### D6 — Trust boundaries *(report only)*
The one-sentence version for the report: **identity is asserted by the client and never checked by the server**, so the role-based access control described in Portfolio Task 1 is a user-interface affordance rather than a security control.

Evidence: `verifyIdToken` has zero occurrences repo-wide; the token is obtained at `login.jsx:48` and sent at `services/api.js:59`; `history.jsx:79` sends no `Authorization` header at all; `server.js:312` binds `0.0.0.0`; `server.js:24` enables CORS with no allowlist.

**One unverified assumption is marked on the diagram:** the Qdrant container's port mapping is not in the repo. Run `docker inspect` before asserting LAN exposure.

### D7 — Target architecture
**The colours carry the argument.** Of eleven touched components, one is replaced (`start.bat`) and two are activations of scaffolding already sitting in the codebase (`ImagePicker`, `expo-speech-recognition`). This is an extension, not a rebuild — say so, because a client looking at a busy target diagram will assume otherwise.

The structural change against D2: the backend is now **on the write path**. Reads stay direct to Firestore under security rules (decision A1), but nothing carrying authority bypasses the boundary any more.

Depends on decisions A1–A8 being Accepted in `DECISIONS.md`.

### D8 — Dependency and rollout roadmap
**The line to say out loud: Phase 1 and Phase 2 are not features.** They are what make the other six buildable, and skipping them produces six half-working capabilities.

Why readings waits: it needs `Asset` to know which unit and `ServiceVisit` to hang the reading off. Built earlier, it has nowhere to store anything.

Why BGE-M3 is a diamond and not a box: the slide says *evaluating*. The fail branch is a real outcome, not a formality.

### D9 — Security and governance *(client-facing)*
Green nodes are controls already delivered in Project A and carried forward unchanged — the audit trail and the human-in-the-loop gate. Worth saying out loud, because the new data types hang off them.

**Speaking note:** lead with "the new features introduce photographs, voice and location data, so here is the governance that has to exist around them." That framing is true and complete. It does not require walking the client through current gaps, and it misrepresents nothing.

### D10 — Deployment topology
The sharpest fact on this diagram: **Qdrant has no backup process.** If the container or its volume is lost today, recovery means re-running seven manual ingestion stages — two of which depend on helper scripts that exist only on a Google Drive, and one of which needs a hardcoded `G:\` mount on one specific person's machine.

A scheduled Qdrant snapshot is the single highest-value item here.

---

## Regenerating the exports

Mermaid is canonical. SVGs are generated, never hand-edited.

```bash
cd docs/architecture
for f in src/*.mmd; do
  b=$(basename "$f" .mmd)
  npx -y @mermaid-js/mermaid-cli@11 -i "$f" -o "export/$b.svg"
done
```

Add `-o export/$b.png` for raster output if the report needs it.

**Two file-format rules, both learned the hard way:**

1. **Frontmatter first, header comment second.** Every flowchart opens with a `---` config block selecting the ELK router. Mermaid requires that block at the very start of the text, so the `%%` header line sits *below* it. Putting the comment first makes the parser reject the file outright.
2. **One comment line only.** Multi-line `%%` prose blocks break the parser in some diagram types — that is why all commentary lives in this file. Do not reintroduce comment blocks into the sources.

```
---
config:
  layout: elk
---
%% D7 Target Architecture. Owner ... Verified ... Commit ...
flowchart TB
```

## Why ELK, and why the edges are dark

Mermaid's default router (dagre) draws long diagonal edges and spreads wide — D7 came out **4038px across** with edges crossing the whole canvas, which a client called unreadable, correctly. **ELK routes orthogonally and minimises crossings**: the same diagram, same boxes, is now **1635px** with right-angled edges.

Every flowchart carries two styling rules at the bottom:

```
    linkStyle default stroke:#1F2A33,stroke-width:2px      all edges: near-black, 2px
    linkStyle 2,3,4  stroke:#1F2A33,stroke-width:4.5px     the ==> edges that carry the argument
```

The default 1px `#333` was too faint to survive a projector. **The indexed rule is load-bearing, not decoration:** `linkStyle default` flattens the thick `==>` arrows, and on D2 those three arrows *are* the finding — phone straight to Firebase, bypassing the backend. **Edge indices are positional**, counted in declaration order from zero, so inserting an edge mid-file silently re-points the emphasis. Re-check the indices after any edge change.

**Every subgraph needs an explicit `style` line.** Mermaid's unstyled cluster default is a pale yellow (`#ffffde`) that clashes with the palette; five diagrams were quietly rendering phase and zone boxes in it.

---

## Keeping it honest

**The roadmap artifact embeds the rendered SVGs, not live Mermaid.** The published page cannot be assumed to ship the ELK layout engine, so shipping the exports guarantees the client sees the layout that was actually checked. Re-run the export loop *and* re-embed after any diagram change, or the artifact silently keeps showing the old picture.

**Source of truth is Mermaid.** `maintenance-copilot.drawio` holds the five client-facing diagrams as pages and is a *derived presentation artifact*, created by importing the Mermaid once and then hand-styling. It is not generated automatically — no tool converts Mermaid to draw.io faithfully.

**Drift checklist — run before any client-facing use:**

- [ ] Architecture changed? Edit the `.mmd` **first**.
- [ ] Re-run the export loop above.
- [ ] Re-import and re-style the affected page in `maintenance-copilot.drawio`.
- [ ] Update the header line in the `.mmd`: verified date and commit.
- [ ] Update the corresponding row in `TRACEABILITY.md`.

**Verification owed before these diagrams are presented as fact** — see the plan's verification section. In particular: every arrow in D2 must map to a real call site, D4 must be walked by actually running one PDF through the pipeline, and the Qdrant port binding on D6 must be confirmed with `docker inspect`.

## Files

```
docs/architecture/
  README.md                   this file
  DECISIONS.md                A1-A8, ratify before D7 is final
  TRACEABILITY.md             every arrow to its evidence
  src/00a-overview-current.mmd  the overall map, today
  src/00b-overview-target.mmd   the overall map, proposed
  src/00c-overview-backend.mmd  the proposed backend, close up
  src/*.mmd                     canonical source, D0-D10
  export/*.svg                  generated
  export/png/*.png              2600px raster, for slides and the artifact
  maintenance-copilot.drawio  derived, client presentation only
```
