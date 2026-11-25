# RAG ingestion pipeline: complete documentation (v3.6)

Repo root: `server/rag/ragPhase2/`\
Updated: 2026-11-24\
Changes from v2: added §13 (classification backfill) and §14 (TOC backfill), plus cross-references in Trap 7 and §10 #6. Both new sections are a design built from what v2 documents; they are NOT verified against backfill source code (see the "needs source" list at the end of each).\
Changes from v1 (carried forward): §3.3, §4.2, §5.5, §6.1 rewritten from actual source. Tag taxonomy is 9-way (not 2). vlmDetailModel corrected (was vlmDiagramModel). Dedup scope rules, rate limiter, and gate-field semantics documented for the first time.

Changes in v3.6: added §24 (source review of `describe_images.py` and `test_retrieval.py`, both now provided: confirmed flags, defaults and run order; stale-docstring findings D1–D9; test-harness gaps R1–R9; an audit of a real `.env` against the code, findings E1–E12; and a file inventory saying which documented files are entry points, which are library modules, and which are unused, only proposed, or not provided). Added §7.9, the complete environment-variable reference (every variable any reviewed file reads, with its default and whether it is required), and rewrote the §20.5 template to match. §3.3 corrected (the `--model` default was wrong), §3.6 expanded, §3.7 now lists the service start commands (inferred from comments in a real `.env`). Updated in place: §2, §3.3, §3.6, §3.7, §7.1–§7.3, §7.6, §7.8, §9 (new Traps 27–29), §10 (#4 and #5 now confirmed from source), §18, §20.5, §22.1, §23.1 and §23.11. Still not provided: `server.js`, `retrieval_service.py` and the Expo app, the code that registers `ManualImages`, any classification backfill, `docs/SETUP.md`, `vlm_pipeline/__init__.py`. Nothing in §24 was executed; items marked "derived" are inferences from the code. Secret values seen in the audited `.env` are deliberately not reproduced anywhere in this document.

Changes in v3.5: added §23 (source review of `section_expansion.py` and `backfill_toc_sections.py`, both now provided: the real TOC backfill, the five `toc_*` section fields it writes, how the type-floor merge and section expansion use them, the env defaults, findings S1–S18) and §3.8 (entry point). §14 is marked superseded: the real script tags every chunk from the headings in the chunk's own text (not from Phase 1's `toc.json`), writes `toc_sections`, `toc_section_keys`, `toc_section`, `toc_parents` and `toc_page_headings` (not `toc_page_nums`, `toc_headings` or `use_toc_nav`), and no filter is re-enabled. Updated in place: §1, §2, §4.3, §5.4, §6.2, §7.5, §7.8, §8, §9 (Trap 7 resolved, new Traps 23–26), §10 (pointer), §11, §12, §13 and §14 (notes), §15.4, §15.5, §16.9, §17.8, §18, §20.5 and the status notes in §22 (I14, §22.1, §22.4, §22.8). Still not provided: `describe_images.py`, `test_retrieval.py`, the code that registers `ManualImages`, any classification backfill, `docs/SETUP.md`. Nothing in §23 was executed: it is read from source only, and items marked "derived" are inferences from the code.

Changes in v3.4: added §22 (source review of `ingest_to_qdrant.py`, `chunker.py`, `embedder.py`, `vector_store.py`, the newer `retrieval_pipeline.py`, `embed_images.py` and `verify_extraction.py`; findings I1–I18; the TOC backfill identified as `backfill_toc_sections.py`, with section expansion replacing the old TOC filter). Corrected in place: the P4, P17 and P22 sentences in §16 and §17, the payload-defaults sentence in §15.3, the `date_added` and `model_number` rules in §19, the chunk-size lines, `MODEL_LOCAL_PATH` and `EMBED_BATCH_SIZE` in the §20.5 `.env` template, `nltk` in the §20.4 requirements, the TOC-backfill wording in §18, the path question in §21.7, and the Trap 7 heading. Still not provided: `describe_images.py`, `test_retrieval.py`, `section_expansion.py`, `backfill_toc_sections.py`, the code that registers `ManualImages`, and any classification backfill.

Changes in v3.3: added §17 (source review of the four Phase 1 helper scripts and of `pipeline.py`, `vlm.py`, `review.py`: full `metadata.json`, `processed_content.txt` and `toc.json` layouts, TOC detection and cleaning rules, both table converters, findings P11–P24, new traps 18–22, corrections to §4.2, §5.5, §5.6, §5.9, §6.1, §16 and the §13–§14 designs); §18 (run the whole pipeline from start to finish, with each step labelled verified, README v2, or unknown); §19 (the `data_information.csv` specification); §20 (requirements and a `.env` template); §21 (plan for running Phase 1 on a PC, not started). The §6.1 description example and several §16 sentences were corrected in place. Still not provided: `ingest_to_qdrant.py`, `describe_images.py`, `embed_images.py`, `chunker.py`, `embedder.py`, `vector_store.py`, `retrieval_pipeline.py`, `test_retrieval.py`, `verify_extraction.py`, the code that registers `ManualImages`, and the real backfill scripts.

Changes in v3.2: added §16, documenting Phase 1 from `phase1_ocr.ipynb` and `phase1_llm_parsing.ipynb` (inputs, folder layout, both checkpoints, per-page steps, TOC handling, table formats, the Phase 1 to Phase 2 contract, ten findings P1–P10, recovery steps, and what Phase 1 changes for the §13 and §14 backfills). Corrected the "Updated" date: earlier versions of this doc said 2026-11-06, which was wrong. Still not read: the four Phase 1 helper scripts (`general_processor.py`, `general_content_extractor.py`, `html_table_converter.py`, `llm_table_normalizer.py`), `pipeline.py`, `vlm.py`, `review.py`, and every Phase 2 file outside `vlm_pipeline/`.

Changes in v3.1: added source-verified details for the eight `vlm_pipeline/` files reviewed this round (`dedup`, `embedding`, `firebase_client`, `image_info`, `pricing`, `scope`, `utils`, `verify_embedding`) as §5.13–§5.15; new traps 13–17 (§9); new known issues 10–17 (§10); notes added to §3.5 and §7.8; open questions from §13 and §14 partly answered in the new §15. Not reviewed against source this round: `pipeline.py`, `vlm.py` and `review.py` (uploaded, but their contents were not readable in this session) and every file outside `vlm_pipeline/`. Their sections still rest on v2.

## Table of contents

1. Architecture overview
2. Directory layout
3. Entry-point reference
4. Data flow
5. Shared modules
6. Data schemas
7. Environment variables
8. Checkpoints
9. Traps
10. Known bugs and stale docs
11. Recovery playbook
12. Glossary
13. Classification backfill (new)
14. TOC backfill (original design, superseded by §23)
15. Source review (v3.1)
16. Phase 1: OCR and content extraction (v3.2)
17. Source review, round 3 (v3.3)
18. Running the pipeline start to finish
19. data\_information.csv: what to provide
20. Dependencies and configuration (requirements, .env)
21. Planned work: Phase 1 on a normal PC
22. Source review, round 4 (v3.4)
23. Source review, round 5 (v3.5)
24. Source review, round 6 (v3.6): `describe_images.py`, `test_retrieval.py`, environment audit, file inventory

## 1. Architecture overview

Two independent ingestion flows, one Qdrant collection, one retrieval layer.

```text
                    Phase 1 (two Colab notebooks, see section 16):
                    content_extraction/{cls}/{group}/{stem}/page_N/
                        processed_content.txt, metadata.json
                                    │
                     verify_extraction.py
                                    ▼
              ┌───────────────────────────────────────┐
              │  ingest_to_qdrant.py                  │
              │  chunk → embed → upsert               │
              │  chunk_type: child | table | parent   │
              │  ▸ SCHEMA OWNER                       │
              └────────────────┬──────────────────────┘
                               │
                               ▼
              ┌───────────────────────────────────────┐
              │  Qdrant: text_chunks_general          │
              │  dense (cosine) + sparse              │
              └────────────────▲──────────────────────┘
                               │
                               │ (independent flow, same collection)
                               │
              ┌────────────────┴──────────────────────┐
              │  describe_images.py                   │
              │  VLM (classify + optional detail)     │
              │  → Firestore ManualImages             │
              └────────────────┬──────────────────────┘
                               │
                               ▼
              ┌───────────────────────────────────────┐
              │  embed_images.py                      │
              │  chunk_type="image"                   │
              └───────────────────────────────────────┘

              backfill_toc_sections.py   (separate step after every ingest / embed:
                                          tags every point with toc_* section fields, §23)

              ─── retrieval ───
              retrieval_pipeline.py (+ section_expansion.py: type-floor merge, section expansion)
              → RetrievalResult → caller's LLM
              test_retrieval.py (debug harness, no LLM)
```

**Key invariant:** `VectorStore.ensure_collection()` deletes and recreates the collection on schema mismatch. Only `ingest_to_qdrant.py` may call it. The image flow must never call it. See Trap 2.

## 2. Directory layout

```text
server/rag/ragPhase2/
├── .env
├── serviceAccountKey.json
│
│   ─── Text flow ───
├── verify_extraction.py
├── ingest_to_qdrant.py
│
│   ─── Image flow ───
├── describe_images.py                 # CLI
├── embed_images.py                    # CLI
│
│   ─── Retrieval ───
├── test_retrieval.py
├── retrieval_pipeline.py
├── section_expansion.py               # imported by retrieval_pipeline.py and by the backfill
│
│   ─── Backfill (separate step) ───
├── backfill_toc_sections.py           # CLI, see 3.8
│
│   ─── Shared modules ───
├── chunker.py
├── embedder.py
├── vector_store.py
│
├── vlm_pipeline/
│   ├── __init__.py
│   ├── pipeline.py                    # run() / report() for describe
│   ├── vlm.py                         # classify + 5 detail passes
│   ├── scope.py                       # page vs figure
│   ├── dedup.py                       # DuplicateIndex, compute_phash
│   ├── image_info.py                  # get_image_dimensions, resize_for_vlm
│   ├── embedding.py                   # run() / report() for embed
│   ├── verify_embedding.py            # verification entry point
│   ├── firebase_client.py
│   ├── pricing.py
│   ├── review.py
│   └── utils.py
│
│   ─── Generated ───
├── checkpoint/ingest_checkpoint.json
├── vlm_review/
│   ├── review.html
│   └── *.jpg
├── last_retrieval_prompt.txt
├── last_retrieval_debug.json
└── models/
```

The app side lives outside `ragPhase2/`. This tree is **inferred** from the start commands in a real `.env` (§3.7); none of these files was provided:

```text
<repo root>/
├── server/
│   ├── server.js                      # Express backend, PORT (8000)          [not provided]
│   └── rag/
│       ├── ragPhase2/                 # everything above
│       └── retrieval/
│           └── retrieval_service.py   # FastAPI app, uvicorn on 8001          [not provided]
└── LLM-Mobile/                        # Expo (React Native) app              [not provided]
```

## 3. Entry-point reference

### 3.1 verify\_extraction.py

Pre-flight check on `EXTRACTION_DIR`. Catches split zips, one-level-too-deep extraction, and Windows >260-char paths.

```powershell
python verify_extraction.py
```

No flags; reads `EXTRACTION_DIR` from env. Non-zero exit if anything is wrong.

### 3.2 ingest\_to\_qdrant.py

Env-var driven, no CLI flags. Chunks, embeds, upserts text. Owns the collection schema.

| Var | Purpose |
| --- | --- |
| `EXTRACTION_DIR` | Phase 1 output root |
| `CHECKPOINT_DIR` | where the text checkpoint lives |
| `DOC_GROUP_FILTER` | process only one group |
| `CLASSIFICATION_FILTER` | process only one classification |
| `LIMIT` | max unique document groups |
| `EMBED_DIM` | dense vector dim (required) |

```powershell
$env:DOC_GROUP_FILTER="panasonic_aircon_CS-PW24KE"
$env:CLASSIFICATION_FILTER="MANUAL"
python ingest_to_qdrant.py
```

### 3.3 describe\_images.py

Pulls `ManualImages`, dedups by pHash, VLM-describes unique images, writes description + cost back.

**Tag taxonomy (9 types)**, see §5.6 for definitions:

| Classify tag | Detail pass? | Detail handler |
| --- | --- | --- |
| `diagram` | ✔ | `describe_diagram_detailed` |
| `graph` | ✔ | `describe_graph_detailed` |
| `schematic` | ✔ | `describe_schematic_detailed` |
| `flowchart` | ✔ | `describe_flowchart_detailed` |
| `installation_diagram` | ✔ | `describe_installation_detailed` |
| `icon_arrow` | ✘ | n/a |
| `photo` | ✘ | n/a |
| `table_image` | ✘ | n/a |
| `decorative` | ✘ | n/a |

**Flags:**

| Flag | Default | Notes |
| --- | --- | --- |
| `--document-group` | None |  |
| `--max-pages N` | None | client-side filter (pageNum ≤ N) |
| `--limit N` | None | client-side cap |
| `--dry-run` | off |  |
| `--force` | off | re-describe even if vlmStatus is set |
| `--model M` | `$VLM_MODEL`, else `gpt-4o-mini` | classify pass. Read from `.env` when `vlm_pipeline.pipeline` is imported (`DEFAULT_MODEL`), so the effective default is whatever your `.env` says (D1) |
| `--diagram-model M` | `$VLM_DIAGRAM_MODEL` or `gpt-6-sol` | detail pass |
| `--dedup-threshold N` | 5 | Hamming distance |
| `--no-diagram-detail` | off | skip pass 2 |
| `--report` | off | read-only breakdown |
| `--rebuild-review` | off | regenerate HTML, no OpenAI |
| `--only-tag T1,T2` | None | re-tag; implies `--force`, skips dedup |
| `--service-account` | `$FIREBASE_SERVICE_ACCOUNT`, else `../serviceAccountKey.json` (relative to the working directory) | Firebase credentials; the default is built when the parser is created |
| `--bucket` | `$FIREBASE_BUCKET`, else `rbacfyp.firebasestorage.app` | Storage bucket (`DEFAULT_BUCKET`) |

**Rate limiting:** a sliding-window token limiter blocks before every API call. Two independent limiters if `--model` and `--diagram-model` differ (different OpenAI TPM quotas). See §5.5.

**Early stop:** if OpenAI returns `insufficient_quota` or `credit_balance_exhausted`, the run stops immediately rather than repeating the same failure N times. `RunStats.stopped_early` records this. Re-run the exact same command after fixing.

**Run order in the CLI (source-verified in v3.6).** (1) `load_dotenv()` runs before `vlm_pipeline.pipeline` is imported, so `DEFAULT_MODEL`, `DEFAULT_BUCKET` and the token-limit variables are fixed from `.env` at import. (2) Unless `--dry-run`, `--report` or `--rebuild-review` is given, a missing `OPENAI_API_KEY` stops the run with `OPENAI_API_KEY is not set.` (3) `--report` is checked first and returns after printing; `--rebuild-review` is next. Both ignore `--force`, `--dry-run`, the model flags and `--only-tag`, and neither needs an OpenAI key. `--rebuild-review` uses only `--document-group`, `--max-pages`, `--limit`, `--service-account` and `--bucket`. (4) Otherwise `run(...)` is called with every flag and `stats.summary(dry_run)` is printed. `--only-tag` is split on commas and stripped, nothing more: no lower-casing, no validation. Per §17.7 it becomes a server-side Firestore `in` filter, so a misspelt or differently-cased tag silently matches nothing (D5). Deeper notes: §24.2.

Fields written on success: see §6.1.

### 3.4 embed\_images.py

Reads `vlmStatus=="described"` docs, builds one chunk per image, embeds, upserts, patches payload, updates checkpoint.

```powershell
python embed_images.py --document-group <group>
```

| Flag | Notes |
| --- | --- |
| `--document-group`, `--max-pages`, `--limit` | scope narrowing |
| `--dry-run` | plan only |
| `--force` | re-embed even if `qdrantStatus=="embedded"` |
| `--report` | breakdown |
| `--service-account`, `--bucket` | Firebase |

Never calls `ensure_collection()`.

### 3.5 vlm\_pipeline/verify\_embedding.py

Read-only. Three-level check: `vlmStatus`, `qdrantStatus`, actual Qdrant point presence.

```powershell
python -m vlm_pipeline.verify_embedding --document-group <group> --verify-qdrant --show-missing
```

| Flag | Notes |
| --- | --- |
| `--document-group` | required |
| `--max-pages`, `--limit` |  |
| `--verify-qdrant` | hit Qdrant for every expected point id |
| `--show-missing` | print doc ids of anything wrong |
| `--show-limit N` | default 50 |

Non-zero exit if anything is missing. Deliberately ignores `skipped_duplicate`.

Invoke with `-m`, not as a file path. See Trap 1.

Source-review notes (v3.1): the hints printed by `verify_embedding.py` are partly stale. For described-but-not-embedded images it prints `re-run: python embedding.py ... (or your embedding entrypoint)`; the real entry point is `python embed_images.py --document-group <group>`. The exit code is 0 when no image docs match the filter (it prints `No image docs matched the filter.`), so a mistyped group name passes silently. Full internals: §5.14.

### 3.6 test\_retrieval.py

Debug harness. Prints raw hits, mode comparison, context blocks, sources, final prompt. Writes `last_retrieval_prompt.txt` + `last_retrieval_debug.json`. No LLM.

```powershell
$env:QUESTION="What is the cooling capacity?"
$env:DOC_GROUP="panasonic_aircon_CS-PW24KE"
python test_retrieval.py
```

Env inputs read by the script itself (v3.6, source-verified):

| Variable | Default | Notes |
| --- | --- | --- |
| `QUESTION` | `What is the cooling capacity?` | the test question |
| `DOC_GROUP` | none | `document_group_id` filter |
| `CLASSIFICATION` | none | classification filter (for example `MANUAL`) |
| `CATEGORY_1`, `CATEGORY_2` | none | `category_level_1` / `category_level_2` filters |
| `RETRIEVAL_TOP_K` | `5` | parsed with `int()` at import, so an empty value raises `ValueError` |

It also prints `QDRANT_URL` and `MODEL_LOCAL_PATH`. Everything else (`DEVICE`, `EMBED_BATCH_SIZE`, `QDRANT_API_KEY`, `RETRIEVAL_SCORE_MIN`, the `SECTION_*` variables) is read inside `retrieval_pipeline.py`, `embedder.py`, `vector_store.py` and `section_expansion.py`.

**What it prints, in order:** the settings; indexed document groups (`list_document_groups`); collection stats (`collection_stats`); the retrieval run; a dense / sparse / hybrid comparison (child and table only); a "TOC navigation" note; raw hits; context blocks; unique sources; the final prompt; prompt stats (characters, words, and a characters÷4 token estimate). It writes `./last_retrieval_prompt.txt` and `./last_retrieval_debug.json` into the **current working directory**, not the script folder.

**Not exposed by the script:** the `filename`, `model_number`, `date_added` and `chunk_types` arguments and `score_min`. **Known gaps:** the comparison block ignores images, the type-floor merge and section expansion; the TOC note is stale; and expansion chunks are mislabelled "hydrated parent" (§24.3, R1 to R3). Use it to inspect context quality, not to prove what a production call returns (Trap 29).

### 3.7 App-level entry point

Not in this repo. Typical shape:

```python
from retrieval_pipeline import RetrievalPipeline

pipeline = RetrievalPipeline()
result = pipeline.retrieve(
    question="…",
    document_group_id="…",
    chunk_types=["child", "table", "image"],   # default already includes "image"
)
prompt = result.build_prompt(question)
# send `prompt` to your LLM; result.sources[] carries image URLs for citations
```

**Running system (v3.6).** The start commands below come from comments in a real `.env`; the files they start were not provided, so what each one does is inferred.

```powershell
# Express backend (PORT, 8000 in your .env). Run from the folder that holds server.js.
node server.js

# FastAPI retrieval service (port 8001). Run from the repo root that contains server/.
python -m uvicorn server.rag.retrieval.retrieval_service:app --reload --port 8001

# Expo app
cd LLM-Mobile
npx expo start -c
```

Express reaches the retrieval service through `RETRIEVAL_SERVICE_URL` (`http://localhost:8001` locally). The app reaches Express through `EXPO_PUBLIC_API_URL` (a Railway deployment in that file; `API_BASE_URL=http://localhost:8000/api` was the commented-out local alternative). `retrieval_service.py` sits in `server/rag/retrieval/`, a different folder from `ragPhase2/`, so how it imports `retrieval_pipeline` (path injection, a copy, or `RAG_PIPELINE_PATH`) is unknown. `RETRIEVAL_SERVICE_URL`, `PORT` and `MAX_RETRIEVAL_ROUNDS` are read only by this side (§7.9, E9).

### 3.8 backfill\_toc\_sections.py

Separate step, run from `ragPhase2/`. Tags every chunk of every document with the section or sections in effect on its page and prints an audit. Safe to re-run: only chunks whose tags changed are written, and stale tags are removed. Run it after every ingest and after every re-embed, because an upsert replaces the whole payload (Trap 23). Internals: §23.3.

```powershell
python backfill_toc_sections.py                            # audit only (dry run), all documents
python backfill_toc_sections.py --group <group>            # audit one document group
python backfill_toc_sections.py --group <group> --write    # apply
python backfill_toc_sections.py --show <group>:120-130     # also print per-page tags for pages 120-130
python backfill_toc_sections.py --write --force            # rewrite every point even if unchanged
```

| Flag | Notes |
| --- | --- |
| `--write` | apply the changes; without it nothing is written and the script ends with `dry run only` |
| `--force` | rewrite every tagged chunk even if its tags already match |
| `--group G` | scan and tag one `document_group_id` only |
| `--show G:FIRST-LAST` | print `toc_sections` per page for that range (parsed with `rsplit(":", 1)`, so a malformed value raises `ValueError`) |

Needs `QDRANT_URL` and `QDRANT_API_KEY` (both read with `os.environ[...]`, so a missing key raises `KeyError`, S13) and uses `QDRANT_COLLECTION` (default `text_chunks_general`).

## 4. Data flow

### 4.1 Text flow

```text
content_extraction/{cls}/{group}/{stem}/page_N/{processed_content.txt, metadata.json}
```

1. `_load_file_units()` → `ContentUnit` list (one per page).
2. `IntelligentChunker.chunk_content_units()`:
   - `_segment_unit()` splits each unit into pure-text / pure-table segments.
   - Table segments → single `table_chunk` each.
   - Text segments → sentence split → embed (boundary model) → cosine-boundary parents → fixed-overlap children.
3. `Embedder.embed_chunks(children + tables)` mutates in place.
4. `VectorStore.upsert_chunks(children)` then `upsert_chunks(tables)`.
5. `VectorStore.upsert_parent_payloads(parents)` writes zero-vector points.
6. `_mark_done()` writes the checkpoint entry.

Chunk IDs are `md5(text[:120] + page + chunk_type)[:16]`.

### 4.2 Image flow

```text
ManualImages/{docId}
    documentGroup, filename, storagePath, imageName, pageNum
    vlmStatus, qdrantStatus, phash, duplicateOf
```

Per-doc flow (`pipeline.py::run()`):

1. **Skip check.** If `vlmStatus in ("described","skipped_duplicate")` and not `--force`, skip. If `phash` present, add to `DuplicateIndex` as representative.
2. **Download** `storagePath` via `fb.download_image_bytes()`.
3. **Compute** original dimensions and phash.
4. **Scope determination**: `determine_scope(doc["imageName"])`:
   - `"page"` if imageName matches `^page\.(png|jpe?g)$`
   - `"figure"` otherwise
5. **Dedup**, only for `figure` scope and not `--only-tag`:
   - `find_duplicate(phash)` → if match within Hamming threshold, tag `skipped_duplicate`, store `duplicateOf`, no VLM call.
   - If not duplicate, `add_representative(doc_id, phash)`.
   - `page` scope is never checked and never added: every page must get a description, and a small photo can dominate a page's coarse hash at 20% area.
6. **Resize**: `resize_for_vlm(image_bytes)` → `(small_bytes, width, height)`.
7. **Classify (pass 1)**: `classify_image(openai_client, model, small, context_line)`:
   - Prompt demands JSON `{description, content_type}`.
   - Invalid `content_type` → `decorative` (if empty description) or `photo`.
8. **Detail pass (pass 2)**: if `vlmTag in DETAIL_TAGS` and diagram\_detail enabled:
   - Dispatch to `DETAIL_HANDLERS[tag]`.
   - Handler returns `{description, payload, input_tokens, output_tokens, total_tokens}`.
   - Pass 2 description replaces pass 1's.
9. **Write to Firestore**: `ALL_DETAIL_FIELDS` are wiped first (all 11 structured fields reset), then the tag-specific payload is applied. This prevents stale fields from a previous tag surviving a retag.
10. **Local save**: `vlm_review/NNNN_<safe_doc_id>.jpg` + append to `review_items`.
11. **Rate limit**: `limiter.record(total_tokens)` after each call, `wait_for_capacity(estimate)` before.

`final_description` is always prefixed with the deterministic `scope_label`; the model never owns this part.

Then `embed_images.py`:

1. Fetches `vlmStatus=="described"` docs.
2. `_build_image_text()`: `vlmDescription` + flattened structured fields (measurements, graph ticks, components, connections, flowchart nodes/edges, installation steps).
3. `_build_chunk()`: `chunk_type="image"`, id `"image::<doc_id>"`.
4. `embedder.embed_chunks()` mutates in place.
5. `vs.upsert_chunks()`.
6. `vs.client.set_payload(...)` patches `image_scope`, `source_manual_image_doc_id`, `embedding_source`.
7. `fb.update_doc(...)` writes `qdrantStatus`, `qdrantPointId`, etc.

### 4.3 Retrieval flow

```text
question → embed once (dense + sparse)
         → for each chunk_type in ["child","table","image"]:
             vs.search(mode="hybrid", limit=top_k; top_k*3 for image)  → RRF-fused hits
         → _dense_sparse_agreement_hits()          ← re-add agreement hits dropped by RRF
         → merge_with_type_floor(raw_hits, top_k)  ← top-k children + tables, plus the top 4 images
         → expand_sections(vs, raw_hits, question) ← add the non-child chunks of the matched section(s), score 0
         → _build_context_blocks()                 ← hydrate parents for matched children
         → _format_context() + _deduplicate_sources() + _enrich_sources_with_images()
         → RetrievalResult
```

(v3.5: the earlier "sort by score, cap at top\_k" step no longer exists; the two `section_expansion.py` steps replace it. Details: §22.4 and §23.6.)

`RetrievalResult.build_prompt(q, system_prompt=None)` assembles the final prompt with `=== CONTEXT ===` / `=== QUESTION ===` / `=== ANSWER ===` sections.

## 5. Shared modules

### 5.1 chunker.py

`IntelligentChunker`: semantic parent/child + single-chunk tables.

Requires: `PARENT_CHUNK_SIZE`, `CHILD_CHUNK_SIZE`, `CHILD_OVERLAP`, `MIN_CHUNK_SIZE`, `SEMANTIC_BOUNDARY_THRESHOLD`, `EMBEDDING_MODEL`, `DEVICE`.

Loads a `SentenceTransformer` (env `EMBEDDING_MODEL`) separately from `Embedder` (env `DENSE_EMBED_MODEL`). Same `MODEL_LOCAL_PATH` cache dir; can be the same model or different.

Public API: `chunk_content_units(units) -> {parent_chunks, child_chunks, table_chunks}`.

### 5.2 embedder.py

`Embedder`: BGE-M3 via FlagEmbedding, dense + sparse.

Requires: `DENSE_EMBED_MODEL`, `MODEL_LOCAL_PATH`, `DEVICE` (cpu/cuda/dml), `EMBED_BATCH_SIZE`, `USE_FP16`. `USE_FP16=true` with `DEVICE=dml` raises.

Device fallback: `DEVICE=dml` failure → auto-fallback to CPU with a warning.

Public API:

- `embed_chunks(chunks)` mutates in place; adds `embedding`, `sparse_embedding`, `embedding_model`, `embedding_dim`, `embedding_backend`.
- `embed_query(query)` returns `{"dense": ndarray, "sparse": {...}}`.

### 5.3 vector\_store.py

`VectorStore`: Qdrant wrapper. Collection: `QDRANT_COLLECTION` env, default `text_chunks_general`.

| Method | Notes |
| --- | --- |
| `ensure_collection(embedding_dim)` | **Destructive on mismatch.** Only `ingest_to_qdrant.py` may call. |
| `upsert_chunks(chunks)` | Batches at 100. |
| `upsert_parent_payloads(parents, dim)` | Zero-vector points. |
| `search(…, mode="hybrid"\|"dense"\|"sparse")` | Prefer `precomputed_query` when embedding once. |
| `fetch_parent(parent_id)` | Retrieve parent payload. |
| `collection_stats()`, `list_document_groups()`, `delete_document_group(id)` | Inspection / cleanup. |

Parent points use `dense=[0.0]*dim`. Never call `search(chunk_type=None)`: parents would match with score ≈ 0.

### 5.4 retrieval\_pipeline.py

`RetrievalPipeline`: LLM-agnostic. Returns `RetrievalResult` dataclass.

Defaults: `chunk_types=["child", "table", "image"]`. Env: `RETRIEVAL_TOP_K` (5), `RETRIEVAL_SCORE_MIN` (0.0), `RETRIEVAL_HYDRATE_PARENTS` (true).

`RetrievalResult` fields: `question`, `context_blocks`, `context_str`, `sources`, `toc_section`, `raw_hits`.

`build_prompt(question=None, system_prompt=None)` assembles the final prompt string.

Lazy-imports `embedder` and `vector_store` on first `retrieve()`.

Since v3.4 `retrieve()` also calls `merge_with_type_floor` and `expand_sections` from `section_expansion.py`. Their env variables and defaults are in §7.5 and §23.6; the heading tags they depend on come from `backfill_toc_sections.py` (§3.8, §23.3).

### 5.5 vlm\_pipeline/pipeline.py (describe-flow internals)

`TokenRateLimiter`: sliding 60s window, thread-safe.

```python
waited = limiter.wait_for_capacity(estimated_tokens)
resp = call_openai(...)
limiter.record(actual_total_tokens)
```

Two instances when `diagram_model != model`. Env: `VLM_TOKEN_LIMIT_PER_MIN` (default 60000), `VLM_TOKEN_ESTIMATE` (default 1200; only used for the first call of a run).

`RunStats` tracks: `scanned`, `already_done`, `duplicates`, `described`, `diagrams_detailed`, `detail_pass_counts`, `errors`, `scope_counts`, `tag_counts`, cumulative tokens and cost, `total_rate_limit_wait_s`, and `stopped_early` (a reason string).

**Detail-pass write protocol:**

```python
fields = { ...core fields..., **ALL_DETAIL_FIELDS }   # wipe all structured fields
if extra_payload:
    fields.update(extra_payload)                      # apply this tag's data
    fields["vlmDetailModel"] = used_diagram_model
fb.update_doc(doc_id, fields)
```

Firestore's `update()` merges by default. `ALL_DETAIL_FIELDS` wipes the 11 possible structured fields to prevent a doc retagged from diagram → graph from carrying both `vlmMeasurements` and `vlmGraphs`.

**Early-stop:** `if "insufficient_quota" in err_str or "credit_balance_exhausted" in err_str: break`. `stopped_early = "out of OpenAI credits"`.

### 5.6 vlm\_pipeline/vlm.py (classify + 5 detail passes)

**Tag taxonomy, `VALID_TAGS` (9):**

| Tag | Definition (from classify prompt) |
| --- | --- |
| `diagram` | Dimensioned technical drawing with printed physical measurements, including a full page that's one large dimensioned drawing. |
| `graph` | Plotted curve/chart with numeric axes. Image may contain multiple graphs. |
| `schematic` | Electrical/wiring schematic. Components connected by lines. |
| `flowchart` | Troubleshooting/decision flowchart with boxes and branches. |
| `installation_diagram` | Step-by-step illustrated installation/assembly, several small labeled panels. |
| `icon_arrow` | Small arrows, bullet icons, single UI glyphs. |
| `photo` | Real photograph, product cover image, title page with equipment picture. |
| `table_image` | A table captured as an image rather than text. |
| `decorative` | Logos, borders, blank/near-blank scans. |

**Detail passes (5)**, all return the same standardized shape:

```python
{
    "description": str,
    "payload": {tag-specific Firestore field names/values},
    "input_tokens": int, "output_tokens": int, "total_tokens": int,
}
```

| Tag | Payload fields | Gate field |
| --- | --- | --- |
| `diagram` | `vlmMeasurements` (list of `{label, value}`) | `vlmHasVisibleMeasurements` |
| `graph` | `vlmGraphs` (list of `{title, x_axis, y_axis, curve_description}`) | `vlmHasReadableGraphs` |
| `schematic` | `vlmComponents`, `vlmConnections` | `vlmHasIdentifiableComponents` |
| `flowchart` | `vlmFlowcharts` (list of `{title, nodes, edges}`) | `vlmHasReadableFlow` |
| `installation_diagram` | `vlmInstallationSteps` (list of `{panel_title, parts_shown, note}`) | `vlmHasReadableSteps` |

**Gate-field enforcement is in code, not just in the prompt:** each handler checks `bool(parsed.get("has_X", False))` and if false, writes an empty array regardless of what the model produced. This is needed because a plain "don't invent" instruction weakens once a model sees several examples in one run.

`ALL_DETAIL_FIELDS`: every structured field with its empty default; applied before every write to prevent stale fields on retag.

**Model parameter:** uses `max_completion_tokens` (GPT-5.x/o-series reject `max_tokens`). GPT-4o accepts it as an alias. Limits are generous because GPT-5.x spends budget on internal reasoning.

**`_call_vision`**: single low-level helper. Every vision call goes through it:

- Base64-encodes the JPEG as a `data:` URL.
- Passes `system_prompt` + `user_text`.
- Parses JSON (strips code fences).
- Reads usage via `pricing.extract_usage()`.

### 5.7 vlm\_pipeline/scope.py

```python
PAGE_LEVEL_NAME_RE = re.compile(r"^page\.(png|jpe?g)$", re.IGNORECASE)

def determine_scope(image_name): ...  # "page" | "figure"
def scope_label(scope, page_display): ...
```

`determine_scope` is name-based, not size-based. This is deliberate, because a page that IS one giant diagram can be as large as a cropped figure. Extend `PAGE_LEVEL_NAME_RE` if your pipeline uses other page filenames.

`scope_label` produces:

- `"Page {N} (full-page image)"` for page scope
- `"Figure on page {N}"` for figure scope

This label is prepended to every stored description by `pipeline.py`, so downstream filtering always sees a deterministic prefix.

### 5.8 vlm\_pipeline/dedup.py

```python
def compute_phash(image_bytes) -> Optional[str]: ...    # None on failure

class DuplicateIndex:
    def __init__(self, threshold=5): ...
    def find_duplicate(self, phash) -> Optional[str]: ...
    def add_representative(self, doc_id, phash): ...
```

Linear-scan greedy matcher (fine up to tens of thousands of images). Threshold is Hamming distance on `imagehash.phash()`. Only applied to figure-scope images; see §4.2.

### 5.9 vlm\_pipeline/pricing.py

```python
MODEL_PRICING = {
    "gpt-4o-mini":  {"input_per_1m": 0.15,  "output_per_1m": 0.60},
    "gpt-6-luna":   {"input_per_1m": 0.10,  "output_per_1m": 0.50},
    "gpt-6-sol":    {"input_per_1m": 2.00,  "output_per_1m": 10.00},
    "gpt-6-astra":  {"input_per_1m": 10.00, "output_per_1m": 50.00},
}
```

`get_model_pricing(model)` raises `ValueError` on unknown models: the run does not silently continue with $0 cost.

`calculate_cost(in_tok, out_tok, model) -> (input_cost, output_cost, total)`.

`extract_usage(resp) -> (input_tokens, output_tokens, total_tokens)`. Returns zeros if usage is missing (never crashes).

`gpt-6-luna` is cheaper than `gpt-4o-mini` on both axes, so it is worth considering for the classify pass.

### 5.10 vlm\_pipeline/firebase\_client.py

```python
class FirebaseClient:
    def __init__(self, service_account_path, bucket_name): ...
    def fetch_image_docs(
        self, document_group=None, max_pages=None, limit=None, vlm_tags=None
    ) -> List[Dict]: ...
    def download_image_bytes(self, storage_path) -> bytes: ...
    def update_doc(self, doc_id, fields) -> None: ...
```

`fetch_image_docs` filters by `documentGroup` server-side. `max_pages` and `limit` are client-side: Firestore returns all docs for the group and the loop filters/slices.

`vlm_tags` uses Firestore's `"in"` operator (max 10 values).

`update_doc` always injects `vlmUpdatedAt = firestore.SERVER_TIMESTAMP`.

### 5.11 vlm\_pipeline/review.py

Generates `vlm_review/review.html`: a visual review page showing each image next to its description + structured table, with manual eval radio buttons (Accurate / Partial / Incorrect) + notes, persisted to localStorage, exportable as JSON/CSV.

- `generate_review_html(review_items)`: called from `pipeline.py` at end of run.
- `rebuild_review(document_group, max_pages, limit, service_account_path, bucket_name)`: reads Firestore, no OpenAI.

Dispatches structured rendering by tag:

- `diagram` → measurements table
- `graph` → graph blocks with axes
- `schematic` → components + connections tables
- `flowchart` → flowchart node/edge tables
- `installation_diagram` → steps table

### 5.12 vlm\_pipeline/utils.py

- `env_path(name, default)`: env var lookup with fallback.
- `page_num_display(value)`: display formatting.
- `page_num_int(value)`: int parsing, None-safe.

### 5.13 vlm\_pipeline/embedding.py (embed-flow internals, source-verified in v3.1)

This module is the engine behind `embed_images.py`. It adds one `chunk_type="image"` point per described image to the existing collection and never touches child, table or parent points.

**Design rules stated in its docstring**

- Firestore is the checkpoint. Each `ManualImages` doc gets `qdrantStatus` once embedded, so a re-run only processes newly described images or ones that previously errored. There is no separate checkpoint file.
- It never calls `VectorStore.ensure_collection()` (destructive on schema mismatch; only `ingest_to_qdrant.py` may call it).
- It uses `Embedder.embed_chunks()`, the same method the text flow uses, not `embed_query()`. `embed_chunks()` mutates each chunk in place with `embedding`, `sparse_embedding`, `embedding_model`, `embedding_dim` and `embedding_backend`, and batches internally via `EMBED_BATCH_SIZE`. `embed_query()` would skip that metadata and process one text at a time.
- `Embedder()` needs the same hard-required env vars as ingest (`DENSE_EMBED_MODEL`, `MODEL_LOCAL_PATH`, `DEVICE`, `EMBED_BATCH_SIZE`, `USE_FP16`; none has a default), so it must run with the same `.env`.

**Import-time behavior**

- `DEFAULT_BUCKET = os.getenv("FIREBASE_BUCKET", "rbacfyp.firebasestorage.app")` (hardcoded fallback; see §7.8 for the empty-string case).
- `SUPERBATCH_SIZE = int(os.getenv("EMBED_SUPERBATCH_SIZE", "50"))`. This is a coarse outer grouping around each `embed_chunks()` + `upsert_chunks()` call, so a crash costs at most one superbatch of un-checkpointed images.
- If `RAG_PIPELINE_PATH` is set and not already in `sys.path`, it is prepended so `embedder.py` and `vector_store.py` can be imported.
- `_get_embedder()` and `_get_vector_store()` import lazily with plain `from embedder import Embedder` and `from vector_store import VectorStore`. Unlike `RetrievalPipeline`, there is no relative-import fallback.

**`_point_id(chunk_id)`**: `int(hashlib.md5(chunk_id.encode()).hexdigest()[:15], 16)`. It must match `vector_store.py`'s private `_point_id` exactly. It is used only to know which id Qdrant assigned (for `qdrantPointId` and the `set_payload` target); the real assignment happens inside `upsert_chunks()`. See Trap 15.

**`_build_image_text(doc)`**: the exact text that gets embedded. It starts with `vlmDescription` (which already carries the scope label) and appends a flattened form of whichever structured extraction is present, so a query like "what is the depth of the indoor unit" or "what does FUSE104 connect to" can match the exact value. Parts are joined with newlines and empty parts are dropped.

- `vlmMeasurements`: `Measurements: label: value; label: value` (entries with no label are dropped).
- `vlmGraphs`: one line per graph, `Graph — <title> | X axis <label> (<unit>): <ticks> | Y axis <label> (<unit>): <ticks> | <curve_description>`. An axis part appears only if that axis has a `label`; ticks are comma-joined.
- `vlmComponents`: `Components: name (type, value, location); ...` (the value is included only when present).
- `vlmConnections`: `Connections: from -> to (relationship); ...`
- `vlmFlowcharts`: one line per flowchart, `Flowchart '<title>': nodes: label (value); .... branches: from -> to [label]; ...`
- `vlmInstallationSteps`: one line per step, `Step — <panel_title> | parts: a, b | <note>`.
- The `vlmHas*` gate fields are not read here. They were already enforced at describe time by emptying the arrays (§5.6).

**`_build_storage_url(storage_path, bucket_name)`**: `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path with / replaced by %2F>?alt=media`. No other escaping and no token (§10 #11).

**`_build_chunk(doc, text, bucket_name)`** produces exactly this shape, which `Embedder.embed_chunks()` and `VectorStore.upsert_chunks()` expect:

```python
{
    "id": f"image::{doc_id}",
    "text": text,
    "page": page_num_int(doc.get("pageNum")) or 0,
    "metadata": {
        "chunk_type": "image",
        "content_type": doc.get("vlmTag", ""),
        "document_group_id": doc.get("documentGroup", ""),
        "filename": doc.get("filename", ""),
        "classification": doc.get("classification", ""),   # always "" today (§10 #6)
        "file_path": storage_path,
        "images": [{
            "src_path": storage_path,
            "abs_path": storage_path,
            "caption": doc.get("vlmDescription", "")[:200],
            "url": _build_storage_url(storage_path, bucket_name),
        }],
    },
}
```

For image points, `content_type` carries the VLM tag (`diagram`, `graph`, ...). Nothing else is passed: no `category_level_1`, `category_level_2`, `model_number`, `date_added`, `notes` and no `toc_*` fields. Whether `vector_store._build_payload` fills those with defaults or omits them is not visible in the reviewed files (see §15.3).

**`run(document_group, max_pages, limit, dry_run, force, service_account_path, bucket_name)` returns a `Counter`:**

1. `fb.fetch_image_docs(document_group, max_pages, limit)`. `limit` applies here, before filtering (Trap 17).
2. Candidates are docs with `vlmStatus == "described"`. `skipped_duplicate` docs have no description of their own and are skipped.
3. For each candidate, `scanned += 1`. If `qdrantStatus == "embedded"` and not `--force`, `already_embedded += 1` and skip. If the built text is empty after strip, `skipped_empty += 1` and skip. Otherwise the doc goes into `pending`.
4. `--dry-run`: log `would embed` per doc, set `would_embed = len(pending)`, return before loading the embedder.
5. Nothing pending: return.
6. Load `Embedder` and `VectorStore`, then process `pending` in superbatches: build chunks, `embedder.embed_chunks(chunks)`, `vs.upsert_chunks(chunks)`. A warning is logged if the stored count differs from the chunk count.
7. Per doc: `vs.client.set_payload(collection_name=vs.collection, payload={image_scope, source_manual_image_doc_id, embedding_source="vlm_pipeline"}, points=[point_id])` (one network call per image), then `fb.update_doc(doc_id, {qdrantStatus: "embedded", qdrantPointId: str(point_id), qdrantCollection: vs.collection, qdrantEmbeddedAt: datetime.now().isoformat()})`. `embedded += 1`. The timestamp is local naive time (no timezone), unlike `vlmUpdatedAt`, which is a server timestamp.
8. Any exception in step 6 or 7 marks every doc in that superbatch `qdrantStatus="error"` with `qdrantError=str(e)` and adds the batch size to `errors` (Trap 14).
9. `time.sleep(0.1)` between superbatches.

Counter keys: `scanned`, `already_embedded`, `skipped_empty`, `would_embed`, `embedded`, `errors`.

**`report(document_group, service_account_path, bucket_name)`**: prints the number of described images in scope (of total), a `qdrantStatus` breakdown (missing status shown as `not_embedded`), and up to 20 embedding errors with `qdrantError` (then "... and N more").

### 5.14 vlm\_pipeline/verify\_embedding.py (internals, source-verified in v3.1)

**Startup.** A self-locating block prepends the parent directory to `sys.path` only when the script's own folder is named `vlm_pipeline` (Trap 1). It then calls `load_dotenv()` and imports `_point_id` and `DEFAULT_BUCKET` from `vlm_pipeline.embedding`, `FirebaseClient`, and `env_path`. Importing `embedding` therefore also triggers its import-time work (§5.13). `VectorStore` is imported lazily, only with `--verify-qdrant`, via plain `from vector_store import VectorStore`.

**Flags:** `--document-group` (required, single group), `--max-pages`, `--limit`, `--verify-qdrant`, `--show-missing`, `--show-limit` (default 50), `--service-account` (default `env_path("FIREBASE_SERVICE_ACCOUNT", "../serviceAccountKey.json")`, see Trap 13), `--bucket` (default `DEFAULT_BUCKET`).

**Classification of each image doc**

- `vlmStatus` defaults to `pending` and `qdrantStatus` defaults to `not_embedded` when absent.
- `vlmStatus == "described"` and `qdrantStatus != "embedded"`: goes to `described_not_flagged`.
- `vlmStatus == "skipped_duplicate"`: ignored (absent from Qdrant by design, Trap 4).
- Anything else (`pending`, `error`, missing): goes to `not_described`.

**Strict mode (`--verify-qdrant`)**

- Expected ids: for each described doc, `_point_id(f"image::{doc_id}")`.
- `_query_existing_point_ids` calls `client.retrieve(collection_name, ids=batch, with_payload=False, with_vectors=False)` in batches of 256 and collects integer ids. A non-integer id returned by Qdrant logs a warning (only possible if something other than `embedding.py` populated the collection with UUID ids).
- A described doc whose point is absent goes to `qdrant_missing`. A point that exists while the Firestore flag is not `embedded` goes to `qdrant_orphan_ids`.
- It prints expected, present, missing and "flag stale" counts, with the collection name.
- It checks only that points exist. It does not read or validate any payload field, so it cannot detect an empty `classification` or missing TOC data (§13, §14).

**Verdict and exit code.** `problems = len(not_described) + len(described_not_flagged) + len(qdrant_missing)`. Flag-stale orphans are reported as a NOTE and do not count. Exit code is 0 only if `problems == 0`; it is also 0 if no docs matched the filter. Hints printed: re-run `describe_images.py --document-group <group>` for undescribed docs; re-run embedding for unflagged ones (stale text, §10 #10); re-run embedding with `--force` for points missing from Qdrant.

**`--show-missing`** lists doc id, `pageNum` and `filename` for each of the three buckets, capped at `--show-limit` per bucket.

### 5.15 Additional source-verified details for modules in §5.7–§5.12 (v3.1)

**`firebase_client.py`**

- Calls `load_dotenv()` at import time; `COLLECTION_NAME = "ManualImages"`.
- `__init__` initializes `firebase_admin` only if `firebase_admin._apps` is empty, so constructing several clients in one process is safe. It uses the service-account certificate and `storageBucket=bucket_name`.
- `fetch_image_docs` streams every doc matching the server-side filters (`documentGroup ==`, `vlmTag in [...]`). With no `document_group` it streams the whole collection. Each returned dict gets `_id` set to the doc id.
- Client-side filters: `max_pages` skips a doc only when its page number parses and is greater than `max_pages` (unparseable page numbers are kept). `limit` breaks out of the loop after appending the doc that reaches it, so it counts docs that survived the page filter (Trap 12).
- `download_image_bytes(storage_path)` is `bucket.blob(storage_path).download_as_bytes()`.
- `update_doc` copies `fields`, adds `vlmUpdatedAt = SERVER_TIMESTAMP`, and calls Firestore `.update()`. `.update()` fails if the doc does not exist (no upsert), and the timestamp is bumped on every call (§10 #13).

**`image_info.py`**

- `get_image_dimensions(bytes)` returns `(width, height)`, or `(None, None)` with a logged warning on any failure.
- `resize_for_vlm(bytes, max_side=1024)` converts to RGB, scales only down (`scale = max_side / max(w, h)`, applied only if `scale < 1`), saves as JPEG at quality 85, and returns `(jpeg_bytes, sent_width, sent_height)`. On any failure it logs a warning and returns the original bytes together with the original dimensions (or `None, None`). That fallback sends the original, un-resized bytes onward.

**`dedup.py`**

- `compute_phash` opens with PIL, converts to RGB, and returns `str(imagehash.phash(img))` (default 8x8 hash, 16 hex characters). Any exception, including a missing package, returns `None` silently (Trap 16).
- `_hamming(a, b)` parses both as hex and returns the bit count of the XOR; on `TypeError` or `ValueError` it returns 999 so the pair never matches.
- `DuplicateIndex.find_duplicate` scans representatives in insertion order and returns the first one within `threshold` (default 5). It is first-match, not closest-match, so results depend on processing order. The source comment suggests bucketing by the first N hash bits for sweeps much larger than tens of thousands of images.

**`pricing.py`**

- The module docstring says costs are computed from the actual token usage in `resp.usage` for every call, not an estimate. Rates for `gpt-6-astra`, `gpt-6-sol` and `gpt-6-luna` are noted as current as of September 2026, Standard tier, short context. Long-context, batch and flex rates differ.
- `gpt-4o-mini` is kept for backward compatibility as the classify-pass default; it no longer appears on OpenAI's current flagship pricing page, and the docstring recommends planning a migration to the GPT-6 line (not forced).
- `get_model_pricing(model)` returns `(input_per_1M, output_per_1M)` and raises `ValueError` for any model not in `MODEL_PRICING`. `extract_usage` reads `prompt_tokens`, `completion_tokens` and `total_tokens`, and returns zeros when `usage` is absent.

**`scope.py`**

- Why it exists: one page can yield two `ManualImages` docs covering the same visual area, the whole-page render (`imageName == page.png`) and one or more cropped figures. Tagging `imageScope` explicitly lets a caller filter on `imageScope == "page"` AND `vlmTag == "diagram"` without seeing two seemingly contradictory write-ups of the same drawing.
- Constants `SCOPE_PAGE = "page"` and `SCOPE_FIGURE = "figure"`. `determine_scope` strips whitespace from the name before matching, and an empty or `None` name returns `figure`.
- `scope_label` is a deterministic prefix baked into the stored description, "not left to the model to remember".

**`utils.py`**

- `page_num_int(value)`: returns `None` for any falsy input (including integer `0`) or when no digit run is found; otherwise the first run of digits as an int (`"page_7"` gives 7).
- `page_num_display(value)`: the parsed int as a string, else `str(value or "unknown")`.
- `env_path(name, default)`: `os.getenv(name, default)` (empty-string trap, §7.8).

## 6. Data schemas

### 6.1 ManualImages/{docId} (Firestore)

Upstream fields (from Phase 1 or wherever images are registered):

```json
{
  "documentGroup": "panasonic_aircon_CS-PW24KE",
  "filename": "CS-PW24KE_service_manual.pdf",
  "storagePath": "ManualImages/.../page_003_fig_02.png",
  "imageName": "page.png",        // or e.g. "figure_02.png"
  "pageNum": 3
}
```

Written by `describe_images.py` on success:

```json
{
  "vlmDescription": "[Figure on page 3] This is a dimensioned...",
  "vlmTag": "diagram",
  "imageScope": "figure",
  "vlmModel": "gpt-4o-mini",
  "vlmDetailModel": "gpt-6-sol",      // only if a detail pass ran

  // tag-specific (only one set is populated):
  "vlmMeasurements": [{"label": "…", "value": "…"}],
  "vlmHasVisibleMeasurements": true,
  // OR vlmGraphs + vlmHasReadableGraphs
  // OR vlmComponents + vlmConnections + vlmHasIdentifiableComponents
  // OR vlmFlowcharts + vlmHasReadableFlow
  // OR vlmInstallationSteps + vlmHasReadableSteps

  "vlmOriginalWidth": 2480,
  "vlmOriginalHeight": 1754,
  "vlmSentWidth": 1024,
  "vlmSentHeight": 724,

  "vlmInputTokens": 1234,
  "vlmOutputTokens": 567,
  "vlmTotalTokens": 1801,
  "vlmInputCostUSD": 0.0001851,
  "vlmOutputCostUSD": 0.0008505,
  "vlmTotalCostUSD": 0.0010356,

  "phash": "a3f4b8c2d1e0f9a7",
  "vlmStatus": "described",     // | "skipped_duplicate" | "error"
  "vlmUpdatedAt": "<Firestore Timestamp>"   // SERVER_TIMESTAMP
}
```

On dedup skip:

```json
{
  "phash": "...",
  "imageScope": "figure",
  "vlmStatus": "skipped_duplicate",
  "duplicateOf": "<doc_id>",
  "vlmOriginalWidth": ..., "vlmOriginalHeight": ...,
  "vlmInputTokens": 0, "vlmOutputTokens": 0, "vlmTotalTokens": 0,
  "vlmInputCostUSD": 0.0, "vlmOutputCostUSD": 0.0, "vlmTotalCostUSD": 0.0
}
```

On error:

```json
{
  "vlmStatus": "error",
  "vlmError": "...",
  "imageScope": "...",
  "vlmOriginalWidth": ..., "vlmOriginalHeight": ...,
  "vlmSentWidth": ..., "vlmSentHeight": ...
}
```

Written by `embed_images.py` on success:

```json
{
  "qdrantStatus": "embedded",
  "qdrantPointId": "123456789012345",
  "qdrantCollection": "text_chunks_general",
  "qdrantEmbeddedAt": "<ISO timestamp>"
}
```

On failure: `qdrantStatus="error"`, `qdrantError="…"`.

Note: `classification` is **not** written by any script in this repo. `embedding.py::_build_chunk` reads `doc.get("classification", "")` and always gets `""`. Confirmed bug; see §10 #6 and the backfill design in §13.

### 6.2 Qdrant point payload

Built by `vector_store._build_payload()`. All chunk types share one schema.

**Core:** `chunk_id`, `chunk_type` (`"child"` | `"table"` | `"parent"` | `"image"`), `text`, `page`

**Document identity:** `document_group_id`, `filename`, `unit_id`

**Classification:** `classification`, `category_level_1`, `category_level_2`, `model_number` (list), `date_added`, `notes`

**Content stats:** `chunk_size`, `has_tables`, `has_figures`, `total_tables`, `total_figures`, `images`, `tables`

**TOC nav (from Phase 1, via `metadata.json`):** `toc_page_nums`, `use_toc_nav`, `toc_headings`. Stored by ingest; nothing reviewed reads them at query time (S1).

**Section tags (written only by `backfill_toc_sections.py`, absent until it has run):** `toc_sections`, `toc_section_keys`, `toc_section`, `toc_parents`, `toc_page_headings` (field meanings: §23.5). They are written to every chunk type, including image and parent points.

**Parent-child:** `parent_id`, `child_ids`

**Table:** `row_count`

**Paths:** `file_path`, `page_image_path`

**Provenance:** `content_type`, `pipeline_type`, `extraction_method`, `extraction_version`, `pipeline_version`, `chunking_strategy`, `embedding_model`, `embedding_dim`, `embedding_backend`, `ingested_at`

Image points also carry (patched post-upsert, not in `_build_payload`): `image_scope`, `source_manual_image_doc_id`, `embedding_source="vlm_pipeline"`.

Parent points add: `is_parent_store = true`.

## 7. Environment variables

### 7.1 Text ingestion

`EXTRACTION_DIR` (default `./content_extraction`), `CHECKPOINT_DIR` (default `./checkpoint`), `DOC_GROUP_FILTER`, `CLASSIFICATION_FILTER`, `LIMIT` (all three optional), `EMBED_DIM` (required, no default).

### 7.2 Chunking

`EMBEDDING_MODEL` (required), `EMBED_BATCH_SIZE` (required by the chunker too), `DEVICE` (chunker default `cpu`), and the built-in defaults `PARENT_CHUNK_SIZE` 1500, `CHILD_CHUNK_SIZE` 400, `CHILD_OVERLAP` 80, `MIN_CHUNK_SIZE` 50, `SEMANTIC_BOUNDARY_THRESHOLD` 0.65. (Earlier versions of this line wrote "400/500", "80/100" and "50/30" because the v2 README and a real `.env` disagreed; the code defaults are the first number. A real `.env` used 500, 100 and 30, see E5.)

### 7.3 Embedding

`embedder.py` hard-requires all five of `DENSE_EMBED_MODEL`, `MODEL_LOCAL_PATH`, `DEVICE` (`cpu`, `cuda` or `dml`), `EMBED_BATCH_SIZE` and `USE_FP16`; none has a default (§22.3). Only the chunker defaults `DEVICE` to `cpu`. `EMBED_SUPERBATCH_SIZE` (50) is read by `embedding.py` (image flow) only.

### 7.4 Qdrant

`QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` (`text_chunks_general`).

### 7.5 Retrieval

`RETRIEVAL_TOP_K` (5), `RETRIEVAL_SCORE_MIN` (0.0), `RETRIEVAL_HYDRATE_PARENTS` (true).

Read in `section_expansion.py` (defaults verified from source in v3.5): `RETRIEVAL_IMAGE_FLOOR` (4, extra image hits kept by the merge), `SECTION_SEED_HITS` (1, top hits per document that nominate sections), `SECTION_MAX_DOCS` (2, documents expanded per query), `SECTION_MAX_PARENTS` (3, sections expanded per document), `SECTION_MAX_PAGES` (8, pages kept per section), `SECTION_MAX_CHARS` (60000, hard cap on text added), `SECTION_NEIGHBOR_PAGES` (1, fallback when a document has no section tags), `SECTION_CATALOG_TTL` (600 seconds). `MAX_HEADINGS_PER_PAGE` (12) is a constant, not an env variable.

### 7.6 Firebase + VLM

`FIREBASE_SERVICE_ACCOUNT` (default `../serviceAccountKey.json`), `FIREBASE_BUCKET` (hardcoded fallback `rbacfyp.firebasestorage.app`), `OPENAI_API_KEY` (no default; required for paid runs), `VLM_MODEL` (`gpt-4o-mini`, the classify model; the code default, not necessarily what your `.env` sets), `VLM_DIAGRAM_MODEL` (`gpt-6-sol`), `VLM_TOKEN_LIMIT_PER_MIN` (60000), `VLM_TOKEN_ESTIMATE` (1200).

### 7.7 Path injection

`RAG_PIPELINE_PATH`: needed by `embed_images.py` and `verify_embedding.py --verify-qdrant`.

### 7.8 ⚠ Empty-string env var trap

Python's `os.getenv(name, default)` returns `""` when the var is set but empty. It only falls back to `default` when the var is unset. If your `.env` has:

```text
VLM_MODEL=
VLM_TOKEN_LIMIT_PER_MIN=
VLM_TOKEN_ESTIMATE=
FIREBASE_BUCKET=
```

Then `DEFAULT_MODEL = ""` (from `os.getenv("VLM_MODEL", "gpt-4o-mini")`), and `int(os.getenv("VLM_TOKEN_LIMIT_PER_MIN", "60000"))` raises `ValueError` at import. Either set real values or delete the keys entirely.

Sanity check:

```powershell
python -c "from vlm_pipeline.pipeline import DEFAULT_MODEL, DEFAULT_BUCKET, TOKEN_RATE_LIMIT_PER_MIN; print(repr(DEFAULT_MODEL), repr(DEFAULT_BUCKET), TOKEN_RATE_LIMIT_PER_MIN)"
```

Three more places this bites (v3.1, from source): (1) `DEFAULT_BUCKET` in `embedding.py` is `os.getenv("FIREBASE_BUCKET", "rbacfyp.firebasestorage.app")`. Unset falls back to that hardcoded bucket; set-but-empty yields `""`, and `verify_embedding.py` imports `DEFAULT_BUCKET` from there. (2) `utils.env_path(name, default)` is a plain `os.getenv`, so a `--service-account` default built from `FIREBASE_SERVICE_ACCOUNT` becomes `""` if that variable is set but empty. (3) `EMBED_SUPERBATCH_SIZE` is parsed with `int(os.getenv("EMBED_SUPERBATCH_SIZE", "50"))` when `embedding.py` is imported, so an empty value raises `ValueError` there, and `verify_embedding.py` imports that module too.

v3.5 addition to this trap: `section_expansion.py` parses all eight variables above with `int(os.getenv(NAME, "default"))` when the module is imported (by `retrieval_pipeline.py` on first use). A variable that is set but empty raises `ValueError` there, which breaks retrieval in the FastAPI service, not just a script.

v3.6 addition to this trap: `describe_images.py` builds its `--diagram-model` default as `os.getenv("VLM_DIAGRAM_MODEL", "gpt-6-sol")`, so a set-but-empty `VLM_DIAGRAM_MODEL` becomes an empty model name and the detail pass fails at the API call. `test_retrieval.py` parses `RETRIEVAL_TOP_K` with `int(...)` when it starts, so an empty value raises `ValueError` there as well.

### 7.9 Complete variable reference (v3.6)

Every variable that any reviewed Python file reads. "Required" means the code fails without it. Dotted `section_expansion` variables are in §7.5. Phase 1 notebooks read no environment variables (they use notebook constants, §16). Secrets are marked; never paste them into a document, chat or repository.

**Text ingestion** (`ingest_to_qdrant.py`, `verify_extraction.py`)

| Variable | Default | Required | Notes |
| --- | --- | --- | --- |
| `EXTRACTION_DIR` | `./content_extraction` | no | Phase 1 output root |
| `CHECKPOINT_DIR` | `./checkpoint` | no | holds `ingest_checkpoint.json` |
| `DOC_GROUP_FILTER` | none | no | exact match |
| `CLASSIFICATION_FILTER` | none | no | case-insensitive |
| `LIMIT` | none | no | set-but-empty raises `ValueError` |
| `EMBED_DIM` | none | **yes** | must match the model (1024 for BAAI/bge-m3); read at import |

**Chunking** (`chunker.py`)

| Variable | Default | Required | Notes |
| --- | --- | --- | --- |
| `EMBEDDING_MODEL` | none | **yes** | boundary-detection model (SentenceTransformer) |
| `EMBED_BATCH_SIZE` | none | **yes** | also required by the embedder |
| `DEVICE` | `cpu` | no | |
| `PARENT_CHUNK_SIZE` | 1500 | no | characters |
| `CHILD_CHUNK_SIZE` | 400 | no | characters |
| `CHILD_OVERLAP` | 80 | no | characters |
| `MIN_CHUNK_SIZE` | 50 | no | shorter parents are discarded (I6) |
| `SEMANTIC_BOUNDARY_THRESHOLD` | 0.65 | no | must be between 0 and 1 |
| `MODEL_LOCAL_PATH` | none | see embedder | passed unchanged as the model cache folder (I9) |

**Embedding** (`embedder.py`, `embedding.py`)

| Variable | Default | Required | Notes |
| --- | --- | --- | --- |
| `DENSE_EMBED_MODEL` | none | **yes** | `BAAI/bge-m3` |
| `MODEL_LOCAL_PATH` | none | **yes** | relative paths resolve against the project root (I9) |
| `DEVICE` | none | **yes** | `cpu`, `cuda` or `dml`; `dml` falls back to CPU on failure |
| `EMBED_BATCH_SIZE` | none | **yes** | |
| `USE_FP16` | none | **yes** | `true` with `dml` raises |
| `EMBED_SUPERBATCH_SIZE` | 50 | no | image flow only; empty raises at import |
| `RAG_PIPELINE_PATH` | none | no | only if scripts run outside `ragPhase2/` |

**Qdrant** (`vector_store.py`, `backfill_toc_sections.py`)

| Variable | Default | Required | Notes |
| --- | --- | --- | --- |
| `QDRANT_URL` | none confirmed | **yes** | `backfill_toc_sections.py` reads it with `os.environ[...]` |
| `QDRANT_API_KEY` | none | **yes for the backfill; for cloud Qdrant in general** | secret; the backfill raises `KeyError` when unset (Trap 26) |
| `QDRANT_COLLECTION` | `text_chunks_general` | no | changing it needs a fresh `CHECKPOINT_DIR` (§8.1) |

**Retrieval** (`retrieval_pipeline.py`, `section_expansion.py`, `test_retrieval.py`)

| Variable | Default | Required | Notes |
| --- | --- | --- | --- |
| `RETRIEVAL_TOP_K` | 5 | no | also read by `test_retrieval.py` |
| `RETRIEVAL_SCORE_MIN` | 0.0 | no | compared with RRF scores in hybrid mode; 0.5 can drop everything (I12) |
| `RETRIEVAL_HYDRATE_PARENTS` | true | no | `1`, `true`, `yes` count as true |
| `RETRIEVAL_IMAGE_FLOOR`, `SECTION_SEED_HITS`, `SECTION_MAX_DOCS`, `SECTION_MAX_PARENTS`, `SECTION_MAX_PAGES`, `SECTION_MAX_CHARS`, `SECTION_NEIGHBOR_PAGES`, `SECTION_CATALOG_TTL` | 4, 1, 2, 3, 8, 60000, 1, 600 | no | `int()` at import (§7.8) |
| `FIREBASE_BUCKET` | `rbacfyp.firebasestorage.app` | no | used to build image URLs |
| `QUESTION`, `DOC_GROUP`, `CLASSIFICATION`, `CATEGORY_1`, `CATEGORY_2` | see §3.6 | no | `test_retrieval.py` only |

**Firebase and VLM** (`describe_images.py`, `embed_images.py`, `verify_embedding.py`, `vlm_pipeline/`)

| Variable | Default | Required | Notes |
| --- | --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | `../serviceAccountKey.json` | **yes** | path to the key file, relative to the working directory unless absolute |
| `FIREBASE_BUCKET` | `rbacfyp.firebasestorage.app` | recommended | set it for any other project |
| `OPENAI_API_KEY` | none | **yes for paid describe runs** | secret |
| `VLM_MODEL` | `gpt-4o-mini` | no | classify model; must be in `pricing.MODEL_PRICING` |
| `VLM_DIAGRAM_MODEL` | `gpt-6-sol` | no | detail-pass model; must be priced |
| `VLM_TOKEN_LIMIT_PER_MIN` | 60000 | no | set to your OpenAI tier |
| `VLM_TOKEN_ESTIMATE` | 1200 | no | first call of a run only |

**Not read by any provided Python file** (app side, inferred from a real `.env`; see §3.7)

| Variable | Likely reader | Notes |
| --- | --- | --- |
| `RETRIEVAL_SERVICE_URL` | Express (`server.js`) | where Express finds the FastAPI service |
| `PORT` | Express | 8000 in the audited file |
| `MAX_RETRIEVAL_ROUNDS` | LLM or Express code | meaning unconfirmed (E9) |
| `EXPO_PUBLIC_API_URL` | Expo app | inlined into the app bundle, so it is public by design; never put a secret in an `EXPO_PUBLIC_` variable |
| `API_BASE_URL` | app or scripts | local alternative to the line above |
| `OPENROUTER_API_KEY` | nothing found | secret; no reviewed file reads it (E8) |

Check what a `.env` file actually resolves to (the last duplicate wins, Trap 27); keys are skipped on purpose:

```powershell
python -c "from dotenv import dotenv_values; d=dotenv_values('.env'); [print(k,'=',d[k]) for k in sorted(d) if 'KEY' not in k]"
```

## 8. Checkpoints

### 8.1 Text flow: JSON file

`./checkpoint/ingest_checkpoint.json` (from `CHECKPOINT_DIR`).

Key: `<document_group_id>|<filename_stem>`. Stores `n_parents`, `n_children`, `n_tables`, `timestamp` per entry.

**Critical:** the key contains neither the model nor the collection. Switching `QDRANT_COLLECTION` without a fresh `CHECKPOINT_DIR` makes every file report SKIP and the new collection stays empty.

### 8.2 Image flow: Firestore fields

- `vlmStatus`: `described` / `skipped_duplicate` / `error`
- `qdrantStatus`: `embedded` / `not_embedded` / `error`

`--force` overrides both.

### 8.3 TOC backfill: no checkpoint

`backfill_toc_sections.py` keeps no checkpoint file and writes nothing to Firestore. It is idempotent by comparison: on each run it recomputes every page's tags and writes only the points whose current `toc_*` payload differs (or all of them with `--force`). The only record that it has run is the payload itself.

## 9. Traps

### Trap 1: verify\_embedding.py import path

Sits inside `vlm_pipeline/` but uses absolute imports. A self-locating block at the top prepends the package parent. Canonical: `python -m vlm_pipeline.verify_embedding`.

### Trap 2: ensure\_collection() is destructive

Deletes and recreates on dense-dim or sparse-config mismatch. Only `ingest_to_qdrant.py` may call.

Schema migration:

1. New `QDRANT_COLLECTION` (rollback stays a config change)
2. Fresh `CHECKPOINT_DIR`
3. `python ingest_to_qdrant.py`
4. `python embed_images.py --force`

### Trap 3: Parent points have zero vectors

Never call `search(chunk_type=None)`. `RetrievalPipeline` passes explicit `chunk_type` per iteration.

### Trap 4: skipped\_duplicate is not a failure

Dedup-collapsed near-duplicates have no description and are intentionally excluded from embedding. `verify_embedding.py` correctly ignores them. Re-running describe won't help.

### Trap 5: Qdrant client/server version drift

Current: client 1.16.2, server 1.19.1. Pin `qdrant-client` ≥ 1.18.

### Trap 6: Windows console encoding

`ingest_to_qdrant.py` reconfigures stdout/stderr to UTF-8 at import. Without it, cp1252 raised `UnicodeEncodeError` on the ✓ after `_mark_done()`, and the except block re-marked every completed file as failed. Don't remove.

### Trap 7: TOC nav is inert (resolved in v3.5: replaced by section expansion, see §23)

`_toc_section_for_query()` populates `toc_section`, but the filtering step in `retrieve()` is commented out:

```python
# if toc_section:
#     raw_hits = self._filter_by_toc_section(raw_hits, toc_section)
```

Consequence for backfills: populating TOC payload fields has no retrieval effect until this filter is re-enabled. See §14.

**v3.5 status: resolved.** The filter no longer exists. Retrieval now uses `expand_sections()`, which adds chunks rather than filtering them out, and it reads the section tags written by `backfill_toc_sections.py`, not the Phase 1 `toc_*` fields (§23, S1).

### Trap 8: Two embedding models, not one

`EMBEDDING_MODEL` (chunker, sentence\_transformers) and `DENSE_EMBED_MODEL` (embedder, FlagEmbedding) are independent. Changing `DENSE_EMBED_MODEL` requires matching `EMBED_DIM`.

### Trap 9: Empty-string env vars

See §7.8. Different from unset.

### Trap 10: Dedup scope rules

Only figure-scope images are deduped. Page-scope is never checked and never added. This is intentional and can't be changed without breaking the "every page gets described" invariant.

### Trap 11: --only-tag skips dedup

Because a filtered subset would produce wrong matches (a diagram could dedupe against nothing when its original near-duplicate isn't in the subset). Documented in a code comment in `pipeline.py`.

### Trap 12: max\_pages and limit are client-side

`fetch_image_docs()` filters by `documentGroup` and `vlm_tags` server-side, but `max_pages` and `limit` are applied in the Python loop. `limit` counts docs that survived page filtering, not total docs.

### Trap 13: verify\_embedding's default service-account path is relative to the working directory

`verify_embedding.py` defaults `--service-account` to `env_path("FIREBASE_SERVICE_ACCOUNT", "../serviceAccountKey.json")`. That is a path relative to the current working directory, not to the file. The key lives at `ragPhase2/serviceAccountKey.json` (§2), so `../serviceAccountKey.json` is correct only when you run from a subfolder such as `vlm_pipeline/`. Run `python -m vlm_pipeline.verify_embedding` from `ragPhase2/` (the canonical way, Trap 1) and the default points one level above the repo. Set `FIREBASE_SERVICE_ACCOUNT` or pass `--service-account`. Not checked: which defaults `describe_images.py` and `embed_images.py` use.

### Trap 14: one failure mid-batch marks the whole embed batch as error

In `embedding.run()`, the per-image loop (`set_payload` then Firestore `update_doc`) sits inside the same `try` as the batch embed and upsert. If anything raises midway (for example `set_payload` fails on the 7th image of 50), the `except` block writes `qdrantStatus="error"` to all 50 docs, including the six already written as `embedded`. Their points are in Qdrant but Firestore says error. `verify_embedding` then lists them under "described but not marked embedded" (a counted problem, exit 1) and, with `--verify-qdrant`, under "flag stale". Recovery is a plain re-run without `--force`: docs with status `error` are not `embedded`, so they are picked up again, and the upsert is idempotent.

### Trap 15: point-id coupling between three places

`embedding._point_id(chunk_id)` is `int(md5(chunk_id).hexdigest()[:15], 16)`, and its docstring says it must match `vector_store.py`'s private `_point_id` exactly. It supplies (a) the `qdrantPointId` Firestore field, (b) the ids that `set_payload` patches, and (c) the expected ids in `verify_embedding`. `VectorStore.upsert_chunks()` assigns the real id internally. If `vector_store._point_id` ever changes, `set_payload` may silently patch nothing and `verify_embedding` will report every image missing. Any backfill that patches image points by id (§13, §14) must call this function rather than recompute the id. Ids are below 2^60, so they fit Qdrant's unsigned integer id type; Firestore stores them as strings.

### Trap 16: pHash failures are silent

`dedup.compute_phash` returns `None` on any exception, including a missing `PIL` or `imagehash` package, with no log line. `_hamming` returns 999 for an unparseable hash, so a `None` hash never matches anything. If those packages are missing the run does not crash: it simply dedupes nothing and spends VLM calls on every near-duplicate. Check with `python -c "import PIL, imagehash"` before a large run. (How `pipeline.py` handles a `None` phash was not reviewed.)

### Trap 17: --limit counts before the described filter in the embed flow

In `embedding.run()`, `limit` is applied inside `fetch_image_docs`, before the `vlmStatus == "described"` filter. `--limit 50` can therefore embed fewer than 50 images, because pending, errored and duplicate docs use up the limit. Same mechanism as Trap 12.

### Trap 23: any upsert erases the section tags

`toc_*` fields live only in the Qdrant payload (not in Firestore, `metadata.json` or `_build_chunk`). `ingest_to_qdrant.py` and `embed_images.py --force` upsert whole points, so a re-ingested file or a force-re-embedded image loses its tags until `backfill_toc_sections.py --write` runs again. Retrieval does not fail: expansion quietly falls back to the pages either side of the best hit (§23.6).

### Trap 24: the section catalogue is cached for 10 minutes per process, and an empty one is never cached

`_catalog()` keeps each document's heading catalogue in memory for `SECTION_CATALOG_TTL` (600 s). After a backfill, a running service can keep using the old catalogue for up to ten minutes (restart it or wait). A document with no tags yet produces an empty catalogue, which is deliberately not cached, so every query on it re-scans the whole document (S4).

### Trap 25: expansion scans the whole document for every section it expands

`_section_points()` scrolls every non-child chunk of the document, payload and text included, once per section key, with no server-side TOC filter and no cache. Latency grows with document size and with the number of sections chosen (S5).

### Trap 26: the backfill refuses to start without `QDRANT_API_KEY`

`backfill_toc_sections.py` reads `os.environ["QDRANT_API_KEY"]`. The §20.5 template used to call the key optional; for this script it is required, and a Qdrant server without a key still needs some value set (behaviour with an empty string not checked) (S13).

### Trap 27: duplicate keys in `.env`, the last one wins

python-dotenv keeps the last occurrence of a repeated key (derived from how `dotenv_values` builds its mapping; not run here). An audited `.env` defined `RETRIEVAL_SCORE_MIN` twice (`0.5`, then `"0."`), and `RETRIEVAL_TOP_K`, `USE_FP16` and `OPENAI_API_KEY` more than once. A value fixed near the top can be silently overridden near the bottom. Keep one line per variable and check the result with the one-liner in §7.9. Process-level environment variables (a shell `$env:`, Railway settings) override `.env` entirely, so the deployed service can differ from the file on your PC.

### Trap 28: a required variable that is commented out fails only when that script runs

`MODEL_LOCAL_PATH` is required by `embedder.py`, so it breaks ingest, `embed_images.py`, `verify_embedding.py --verify-qdrant` and the retrieval pipeline; `QDRANT_URL` and `QDRANT_API_KEY` break the backfill and anything that opens Qdrant. A `.env` with those lines commented out looks tidy and works only where the same variables are set another way. Use §7.9 as the checklist (E3, E4).

### Trap 29: `test_retrieval.py` is not what production returns

Its mode comparison covers child and table chunks only, it never applies the type-floor merge or section expansion in that block, its "TOC navigation" text describes a filter that no longer exists, and it labels every score-0 context block "hydrated parent", including section-expansion chunks (§24.3, R1 to R3). Judge images and expansion from the RAW HITS and CONTEXT BLOCKS sections and the prompt, not from the comparison.

## 10. Known bugs and stale docs

Priority-ordered.

1. **`VectorStore.extract_filters` has no `self`.** Defined as a class method but takes `(query, known_groups, known_files)`. Nothing calls it. Mark `@staticmethod` or delete.
2. **`_build_firebase_url` in `retrieval_pipeline.py` is dead code.** Unused `self` parameter, never called. Delete.
3. **`print(f"DEBUG: page.png fallback -> {url}")` in `_enrich_sources_with_images`** fires once per source without an `images` list. Remove or gate behind a logger.
4. **`test_retrieval.py` mode comparison hardcodes `["child", "table"]`** in the mode-comparison loop, so it won't show image hits even though `retrieve()` now includes them. Add `"image"` to that list. Confirmed from source in v3.6 (§24.3, R1).
5. **Docstring drift:**
   - `retrieval_pipeline.py` docstring says default `["child","table"]`; code is `["child","table","image"]`.
   - `describe_images.py` docstring says "diagram accuracy... `--diagram-model` default gpt-6-sol" but doesn't mention the other 4 detail tags. Update to reflect the 9-tag taxonomy.
   - `ingest_to_qdrant.py` says `BAAI/bge-base-en-v1.5`; `embedder.py` says `BAAI/bge-m3`. What matters is `DENSE_EMBED_MODEL`.
6. **`classification` is never written to ManualImages.** Confirmed: no write site. `embedding.py::_build_chunk` reads `doc.get("classification", "")` and always gets `""`. Image points in Qdrant have empty classification. If retrieval ever filters images by classification, they will be silently excluded. Backfill design: §13.
7. **`RetrievalPipeline._get_embedder` / `_get_vs`** try `from .embedder import …` then `from embedder import …`. Works, but if the first silently fails for an unrelated reason, the fallback masks it. Consider logging the `ImportError`.
8. **`imageName` field is assumed to exist.** `determine_scope(doc["imageName"])` is called on every doc. Nothing in this repo writes `imageName`; it comes from Phase 1 (or wherever ManualImages docs are registered). If it's missing, `determine_scope("")` returns `"figure"` and every page render gets tagged as figure scope, defeating the page/figure distinction.
9. **`report()` sums historical costs.** `vlmTotalCostUSD` is per-doc, frozen at description time. If you change pricing in `pricing.py`, historical docs keep their old cost. Correct behavior, but the report's total is "cost at the time of each description," not "cost at current pricing."

**Additional findings from the v3.1 source review** (continuing the numbering above; from the eight files reviewed, nothing yet from `pipeline.py`, `vlm.py` or `review.py`):

- **#10 `verify_embedding.py` prints a stale hint.** It tells you to re-run `python embedding.py ...`; the real entry point is `embed_images.py` (§3.5).
- **#11 `_build_storage_url` escapes only `/`.** It replaces `/` with `%2F` and does nothing else: no other URL encoding, and no download token. The `url` stored in each image payload therefore works only if storage rules allow unauthenticated `alt=media` reads, and may break for paths containing spaces or special characters. Not tested against a real bucket.
- **#12 Hardcoded fallback bucket.** `embedding.py` falls back to `rbacfyp.firebasestorage.app` when `FIREBASE_BUCKET` is unset (§7.8).
- **#13 `vlmUpdatedAt` means "last write of any kind".** `update_doc` injects `SERVER_TIMESTAMP` on every call, including the `qdrantStatus` writes from the embed flow and any backfill, so it no longer means "last described".
- **#14 Page-number edge cases.** `page_num_int` returns `None` for any falsy input, so an integer `0` is treated as unparseable. `embedding._build_chunk` stores `page: page_num or 0`, so "page 0" and "unparseable" look identical in Qdrant. Separately, `fetch_image_docs(max_pages=N)` never filters out docs whose `pageNum` does not parse (deliberate: "never filtered out by mistake").
- **#15 Duplicates are not retrievable.** `skipped_duplicate` docs get no point. A code comment in `embedding.py` flags reusing the representative's text for them as an undecided judgment call. Today only the representative image can be retrieved.
- **#16 One `set_payload` network call per image.** The embed flow patches `image_scope`, `source_manual_image_doc_id` and `embedding_source` one point at a time after the batch upsert, which is the slow part of a large sweep and also the source of Trap 14.
- **#17 Silent empty `image_scope`.** If a Firestore doc has no `imageScope`, the patch writes an empty string rather than failing, which would hide a missing scope (see also §10 #8 on `imageName`).

**Additional findings from the v3.5 source review:** S1–S18 in §23.9 (TOC backfill and section expansion). No numbered item above changed status except where §22.6 already noted it.

**Additional findings from the v3.6 source review:** D1–D9 (`describe_images.py`), R1–R9 (`test_retrieval.py`) and E1–E12 (a real `.env`) in §24; §10 #4 and #5 are now confirmed from source.

## 11. Recovery playbook

**Pre-ingest check**

```powershell
python verify_extraction.py
```

**Re-ingest one group's text**

```powershell
# remove the checkpoint entry first, or accept SKIP
$env:DOC_GROUP_FILTER="<group>"; python ingest_to_qdrant.py
```

**Retry errored VLM docs**

```powershell
# retries only the ones with vlmStatus=="error"
python describe_images.py --document-group <group>

# verify
python -m vlm_pipeline.verify_embedding --document-group <group> --show-missing
```

**Embed described images**

```powershell
python embed_images.py --document-group <group>
```

**Firestore says embedded, Qdrant missing**

```powershell
python embed_images.py --document-group <group> --force
```

**Re-tag after a taxonomy change**

```powershell
# skip dedup, re-classify only docs already tagged diagram
python describe_images.py --document-group <group> --only-tag diagram

# multiple tags
python describe_images.py --document-group <group> --only-tag diagram,graph
```

**Rebuild review HTML (no OpenAI cost)**

```powershell
python describe_images.py --document-group <group> --rebuild-review
```

**Out of credits mid-run**

The run stops early with `stopped_early = "out of OpenAI credits"`. Add credits, then:

```powershell
python describe_images.py --document-group <group>   # same command, no --force
```

**Section tags missing or wrong for one document group**

```powershell
python backfill_toc_sections.py --group <group>                # audit: headings mode, untagged pages, WARN lines
python backfill_toc_sections.py --group <group> --show <group>:120-130
python backfill_toc_sections.py --group <group> --write        # apply, then restart the retrieval service (Trap 24)
```

If the audit shows `headings: none` or many untagged pages, the fix is upstream (the chunk text has no recognisable headings, §23.4); patching more will not help.

**Full smoke test**

```powershell
python verify_extraction.py
$env:DOC_GROUP_FILTER="<group>"; python ingest_to_qdrant.py
python describe_images.py --document-group <group>
python embed_images.py --document-group <group>
python -m vlm_pipeline.verify_embedding --document-group <group> --verify-qdrant --show-missing
python backfill_toc_sections.py --group <group>            # audit (dry run)
python backfill_toc_sections.py --group <group> --write
$env:QUESTION="What is the cooling capacity?"; $env:DOC_GROUP="<group>"; python test_retrieval.py
```

**Collection migration**

```powershell
$env:QDRANT_COLLECTION="text_chunks_bgem3"
$env:CHECKPOINT_DIR="./checkpoint_bgem3"
python ingest_to_qdrant.py
python embed_images.py --force
python backfill_toc_sections.py --write      # last: upserts wiped the toc_* tags (Trap 23)
```

## 12. Glossary

| Term | Meaning |
| --- | --- |
| classify pass | Pass 1 of the VLM flow: cheap model, produces `vlmTag` + short description. |
| detail pass | Pass 2: runs only for the 5 `DETAIL_TAGS`, uses `--diagram-model`, produces structured payload. |
| gate field | `vlmHas*` boolean the model self-reports. If false, the corresponding array is emptied in code (not just by prompt instruction). |
| scope | `"page"` (whole-page render, `imageName == page.png`) or `"figure"` (cropped sub-image). |
| representative | The first non-duplicate image whose pHash becomes the baseline for a cluster. Subsequent images within the threshold are `skipped_duplicate`. |
| parent chunk | \~1500-char context block, stored as a zero-vector payload point. Not searched, fetched. |
| child chunk | \~400-char searchable unit, embedded dense + sparse. Points to parent via `parent_id`. |
| table chunk | One chunk per `[Row N]` block, never split. |
| image chunk | One chunk per VLM-described image. `chunk_type="image"`, id `image::<docId>`. |
| RRF | Reciprocal Rank Fusion: how dense + sparse are merged in `mode="hybrid"`. |
| rate limiter | Sliding 60s token window that blocks before each OpenAI call. Two instances if classify model ≠ detail model. |
| hydration | Fetching a matched child's parent text and prepending it to the context. |
| backfill | Patching a field onto points/docs that already exist, without re-chunking or re-embedding (§13, and the real TOC backfill in §23). |
| section tags | The five `toc_*` payload fields written by `backfill_toc_sections.py` (§23.5). |
| `toc_parents` | Sorted section keys in effect on a chunk's page; numbered keys are capped at 4 levels (`16.1.1.5`), unnumbered keys are slugged titles. Used for prefix matching in expansion. |
| section expansion | Query step (`expand_sections`) that adds the non-child chunks of the section(s) the question is about, in page order, with score 0 (§23.6). |
| type floor | `merge_with_type_floor`: keep the top-k children and tables plus the top few images, because images score on a different scale. |
| heading catalogue | In-memory map of a document's headings (key, start pages, stemmed words) built from the section tags and cached 600 s. |

### Appendix: inferred vs verified

Verified from source (v2):

- All VLM prompts, tag taxonomy, detail handlers, gate-field enforcement
- Scope rules (name-based regex)
- Dedup rules (figure-only)
- Rate limiter mechanics
- Cost calculation (strict, raises on unknown)
- Checkpoint semantics
- Firestore schema (write sites)

Not verified from source (v3 additions): everything in §13 (the classification backfill design). §14 was also a design in v3 to v3.4; it is superseded by §23, which is read from the real source.

## 13. Classification backfill (design; partly confirmed by source review, see §15 and §16.9)

> v3.5 note: the TOC backfill is now source-reviewed (§23) and is a different script with a different job. It does not touch `classification`, `category_level_1/2`, `model_number` or `date_added` (its `TOC_FIELDS` are the five section fields only). Everything below is still a design, and there is still no classification backfill in any reviewed file.

### 13.1 The problem

No script writes `classification` to `ManualImages` (§10 #6), so `embedding.py::_build_chunk` always reads `""`. Every `chunk_type="image"` point therefore has an empty `classification`. Any retrieval filter on classification silently excludes images. The same likely applies to the other identity fields that text points carry (`category_level_1`, `category_level_2`, `model_number`, `date_added`, `notes`): check an image point's payload before assuming only `classification` is empty.

### 13.2 Principles (these follow from documented behavior)

- **Payload-only.** Classification is metadata, not content. Use `client.set_payload(...)` (the same call `embed_images.py` already uses for `image_scope`). No re-embed, no OpenAI cost, no `ensure_collection()`.
- **Never call `ensure_collection()`** (Trap 2).
- **Two stores must agree.** Patch Firestore `ManualImages.classification` as well as the Qdrant payload, otherwise the next `embed_images.py --force` rebuilds image points with `""` again.
- **Fix the write site too.** A one-off backfill without fixing `_build_chunk` (or the `describe_images.py` write) means newly embedded images are empty again.
- **Idempotent and dry-run first.** Only touch points where the field is empty; support a dry-run that only counts.

### 13.3 Source of truth (pick one, decide before running)

1. **Qdrant text points of the same group.** For a given `document_group_id`, the `child`/`table` points already carry `classification`, `category_level_1`, `category_level_2`, `model_number`, `date_added`, `notes`. Read one such point per group and copy the values. Assumes every group's text was ingested.
2. **Phase 1 path.** `content_extraction/{cls}/{group}/{stem}/...` encodes the classification as the first folder. Works for `classification` only, not the category fields.

If the two disagree for a group, stop and look at that group manually.

### 13.4 Procedure

1. **Inventory (read-only).** Count image points with empty classification per group (Qdrant scroll filtered on `chunk_type == "image"`, grouped by `document_group_id`).
2. **Resolve** each group's values from the chosen source; refuse groups with no value found.
3. **Dry-run:** print per-group counts of Firestore docs and Qdrant points that would change.
4. **Firestore pass:** `fb.update_doc(doc_id, {"classification": value, ...})` for `ManualImages` docs in the group. Note `update_doc` also bumps `vlmUpdatedAt`, which is acceptable but means timestamps no longer mean "last described".
5. **Qdrant pass:** `set_payload` on point ids `image::<doc_id>` (use the stored `qdrantPointId` where present rather than recomputing).
6. **Verify:** re-run the inventory (expect zero empty), then `verify_embedding --verify-qdrant --show-missing`, then a `test_retrieval.py` query with `CLASSIFICATION` set and confirm image hits appear.
7. **Fix the write site** so new embeds carry the fields.

### 13.5 Risks

- `skipped_duplicate` docs have no point and are skipped (Trap 4); don't treat them as missing.
- Page-scope and figure-scope images both need patching.
- If a group was later re-ingested into a different collection, patch the collection named by `qdrantCollection` on the doc, not the default.

### 13.6 Needs source before this is final

- The exact existing backfill script, its flags, and where it reads classification from.
- Whether other identity fields are also empty on image points.
- Whether `embedding.py` has a place to receive these fields from the group.

## 14. TOC backfill (original design, SUPERSEDED by §23 in v3.5)

> **Superseded.** The script is `backfill_toc_sections.py` and it was reviewed in v3.5. What the design below got wrong, and what to read instead:
>
> | v3 to v3.4 design (this section) | Real behaviour (§23) |
> | --- | --- |
> | Obtain the TOC per document from Phase 1 output | Headings are read from the chunk text itself; Phase 1's `toc.json` and `toc_*` fields are not used (S1) |
> | Fill `toc_page_nums`, `toc_headings`, `use_toc_nav` | Writes `toc_sections`, `toc_section_keys`, `toc_section`, `toc_parents`, `toc_page_headings` |
> | Patch parents and images too, if the filter reads them | Tags every chunk on the page, all chunk types (images only if their `(group, filename)` matches, S3) |
> | Backfill, verify, then re-enable a hard filter behind a flag | No filter: `expand_sections()` adds chunks instead (§23.6) |
> | Dry-run, then patch in batches of 100 | Dry run is the default, `--write` applies, one `set_payload` per page (S15) |
> | Inventory on empty `toc_headings` | Use the script's own audit (§23.3) |
>
> The sections below are kept for history only.

### 14.1 The problem

The point payload defines `toc_page_nums`, `use_toc_nav`, `toc_headings` (§6.2), and `RetrievalResult` has `toc_section`, but:

- `_toc_section_for_query()` computes a section, yet the filter that would use it is commented out in `retrieve()` (Trap 7), so TOC navigation currently has no effect on results.
- Points ingested before TOC data existed (or with TOC extraction failing) carry empty TOC fields.
- Re-running `ingest_to_qdrant.py` won't fix this: the checkpoint skips completed files (§8.1).

### 14.2 Principles

- **Payload-only, no re-chunk.** TOC fields describe where a chunk sits in the manual; patch with `set_payload`, keyed by existing point ids.
- **Don't re-ingest to get TOC.** That deletes nothing but re-embeds everything and, without a fresh `CHECKPOINT_DIR`, is skipped anyway.
- **Backfill and filter are separate changes.** Backfill the data first, verify it, then re-enable the filter behind an env flag. Doing both at once makes retrieval regressions impossible to attribute.
- **Image points need TOC too** if the filter is applied to all chunk types: image points are created by `embed_images.py` and carry no `toc_*` fields unless patched.

### 14.3 Procedure

1. **Inventory (read-only):** per `document_group_id`, count points where `toc_headings` is empty/missing, split by `chunk_type`.
2. **Obtain the TOC per document.** The source of TOC data is not documented in this README (it comes from the same extraction output the text flow reads, or from whatever `ingest_to_qdrant.py` uses to populate the field). Reuse that exact logic rather than writing a second TOC parser, so backfilled and freshly ingested points agree.
3. **Map page → section.** For each chunk, `page` gives its position; derive the covering heading(s) and fill `toc_page_nums`, `toc_headings`, set `use_toc_nav` consistently with how ingest sets it.
4. **Parents:** parent points (`is_parent_store=true`) carry the same payload schema; patch them too if hydration or filtering reads TOC from parents.
5. **Dry-run, then patch** in batches (Qdrant upsert batches at 100 in this codebase; match that for consistency).
6. **Verify:** re-run the inventory; spot-check pages at section boundaries by hand against the manual's PDF; confirm `toc_section` returned by `test_retrieval.py` is sensible for several questions.
7. **Only then** re-enable the filter in `retrieve()` behind an env flag (e.g. a hypothetical `RETRIEVAL_TOC_FILTER`, default off) and compare `test_retrieval.py` output with the flag off vs on across a fixed set of questions.

### 14.4 Risks

- **A wrong TOC section filters out the right answer.** Hard filtering on a mis-detected section is worse than no filtering; consider a boost or fallback-to-unfiltered when the filtered set is thin.
- Manuals without a parseable TOC should be left untouched (`use_toc_nav=false`), not guessed.
- Page-number offsets (printed page vs PDF page index) are the usual source of off-by-N errors; check this on at least one real manual first.
- `_filter_by_toc_section` is referenced by the commented code: confirm it still exists and behaves before enabling it.

### 14.5 Needs source before this is final (resolved in v3.5: the script and `section_expansion.py` were provided, see §23)

- The existing TOC backfill script (if any), its flags, and its data source.
- How `ingest_to_qdrant.py` currently derives and sets `toc_page_nums`, `toc_headings` and `use_toc_nav`.
- Whether the filter is meant to hard-filter or boost, and why it was commented out.

## 15. Source review (v3.1)

### 15.1 What was and was not reviewed

| Files | Status in this round |
| --- | --- |
| `dedup.py`, `embedding.py`, `firebase_client.py`, `image_info.py`, `pricing.py`, `scope.py`, `utils.py`, `verify_embedding.py` | Read in full. Details in §5.13–§5.15; findings in §9 (Traps 13–17) and §10 (#10–#17). |
| `pipeline.py`, `vlm.py`, `review.py` | Uploaded, but their contents were not readable in this session. §3.3, §4.2, §5.5, §5.6 and §5.11 are unchanged from v2. |
| `ingest_to_qdrant.py`, `describe_images.py`, `embed_images.py`, `chunker.py`, `embedder.py`, `vector_store.py`, `retrieval_pipeline.py`, `test_retrieval.py`, `verify_extraction.py` | Not provided. Their sections are unchanged from v2. |
| Any TOC backfill or classification backfill script | Not provided. §13 and §14 remain designs. |

### 15.2 What the reviewed source confirms from v2

No statement in v2 was contradicted by the eight files, within the parts they cover. Specifically confirmed:

- Dedup: Hamming distance on `imagehash.phash`, default threshold 5, greedy linear scan (§5.8).
- Scope: the `^page\.(png|jpe?g)$` regex (case-insensitive) and the two label formats, `Page {N} (full-page image)` and `Figure on page {N}` (§5.7).
- Pricing: the four-model table, `ValueError` on an unknown model, and `extract_usage` returning zeros when usage is missing (§5.9).
- Firebase client: server-side `documentGroup` and `vlmTag in` filters (max 10 values), client-side `max_pages` and `limit`, and `vlmUpdatedAt = SERVER_TIMESTAMP` on every `update_doc` (§5.10).
- Embed flow: never calls `ensure_collection()`; uses `embed_chunks()`; chunk id `image::<doc_id>`; payload patch of `image_scope`, `source_manual_image_doc_id` and `embedding_source`; the four `qdrant*` Firestore fields; `EMBED_SUPERBATCH_SIZE` default 50; `RAG_PIPELINE_PATH` injection (§4.2, §5.13).
- Verify flow: the three levels, `skipped_duplicate` deliberately ignored, non-zero exit on problems, and the `-m` invocation reason (§3.5, Trap 1).
- `classification` is read from the Firestore doc and never written by anything in the reviewed files (§10 #6).

### 15.3 Answers to the open questions in §13.6 and §14.5

**Classification (§13)**

- `_build_chunk` reads `doc.get("classification", "")` from the `ManualImages` doc. So writing a `classification` field onto those Firestore docs is enough for the next embed to pick it up, with no code change to `embedding.py`.
- Existing image points still need either a `set_payload` patch or a `--force` re-embed. Qdrant's upsert replaces the whole point, payload included. A payload-only patch that is not mirrored in Firestore is therefore lost the next time `embed_images.py --force` runs. The Firestore backfill is the durable one; the Qdrant patch is the fast one. Do both (§13.2 already says this; the reason is now confirmed from the code).
- Only `classification` is read by `_build_chunk`. `category_level_1`, `category_level_2`, `model_number`, `date_added` and `notes` are never passed. To carry them, `_build_chunk` must be extended or they must be patched into Qdrant directly. `vector_store._build_payload` emits them as empty defaults (empty strings, and an empty list for `model_number`); confirmed in v3.4 (§22.7 I13).
- Image points use `content_type = vlmTag`, a different meaning from `content_type` on text points. Any filter on `content_type` mixes the two.
- `verify_embedding` checks only that points exist, so it cannot confirm a backfill. Verify with a Qdrant scroll or a `test_retrieval.py` query with `CLASSIFICATION` set.
- Use `embedding._point_id(f"image::{doc_id}")` for ids, or `int(doc["qdrantPointId"])` (stored as a string). Do not recompute the hash in a separate script (Trap 15).
- Every Firestore write from a backfill bumps `vlmUpdatedAt` (§10 #13).

**TOC (§14)**

- None of the eight reviewed files references a table of contents. The embed flow gives image points no `toc_*` fields, so image points have no TOC data unless a separate step adds it.
- Image chunks do carry `page` (`page_num or 0`), the natural key for a page-to-section mapper. A value of 0 means "unparseable or zero" (§10 #14) and should be skipped, not mapped.
- Same durability rule as above: a TOC patch on an image point is lost on `embed_images.py --force` unless the TOC step is re-run afterwards, because the TOC data is not in Firestore or in `_build_chunk`.

### 15.4 Backfills run as separate steps (operator note, unconfirmed)

You described the TOC backfill as a step that runs separately from the main pipeline. The README now records that as an operator note, not as verified behavior: the script was not among the reviewed files, so its name, flags, data source and position in the run order are unknown. The same applies to the classification backfill if it is also separate.

Implications that follow from the code that was reviewed (these are derived, not observed):

- Any backfill that patches image points must run after `embed_images.py`, because that is what creates the points, and must be re-run after any `embed_images.py --force`.
- Any backfill that patches text points must run after `ingest_to_qdrant.py`, and again after a collection migration. The checkpoint (§8.1) does not record backfill state, so nothing will remind you.
- The collection-migration playbook in §11 does not list backfills. Once the real scripts are known, add them to it, after the `embed_images.py --force` step.
- Neither `verify_embedding.py` nor `verify_extraction.py` checks backfilled fields. A backfill needs its own inventory and verification step (§13.4, §14.3).

**v3.5 update:** the operator note above is confirmed by source. `backfill_toc_sections.py` is a separate command, writes only to Qdrant, has no checkpoint (§8.3), and must be re-run after every ingest and re-embed (Trap 23). The "derived implications" above hold, and verification of its output is the script's own audit (§23.3).

### 15.5 Still needed to finish §13 and §14

1. The TOC backfill script (and the classification backfill script, if one exists): name, flags, data source, what it writes, whether it is idempotent.
2. Where each one sits in your usual run order, and whether you run it per document group or for the whole collection.
3. `vector_store.py` (`_build_payload`, `_point_id`, `upsert_chunks`) to settle which payload fields image points really carry.
4. `ingest_to_qdrant.py`, to see how `toc_page_nums`, `toc_headings` and `use_toc_nav` are derived at ingest time.
5. Readable copies of `pipeline.py`, `vlm.py` and `review.py` if you want §3.3, §4.2, §5.5, §5.6 and §5.11 checked against source in the same way.

> v3.5: item 1 above is resolved for the TOC backfill (§23); items 2 to 5 stand, and a classification backfill is still unseen.

## 16. Phase 1: OCR and content extraction (source-verified from the two notebooks, v3.2)

Phase 1 is two Google Colab notebooks that run in order and produce the `content_extraction/` tree that `verify_extraction.py` checks and `ingest_to_qdrant.py` reads. Until v3.1 this README treated Phase 1 as external; it is now documented from `phase1_ocr.ipynb` and `phase1_llm_parsing.ipynb`.

Not reviewed: the four helper scripts the second notebook imports (`general_processor.py`, `general_content_extractor.py`, `html_table_converter.py`, `llm_table_normalizer.py`), MonkeyOCR's own output structure, and any code that uploads images to Firebase Storage or registers `ManualImages` docs. Everything below that depends on them is marked as unknown.

### 16.1 End-to-end shape

```text
data/data_information.csv  +  data/{document_group_id}/{filename}.pdf
        |  phase1_ocr.ipynb
        |  PyMuPDF rasterises each page at 300 DPI -> MonkeyOCR parse.py, one page at a time
        v
output/{CLASSIFICATION}/{group}/{stem}/page_{N}/   page.png, *.md, *.json, images...
checkpoint/ocr_checkpoint.json
        |  phase1_llm_parsing.ipynb
        |  TOC detect -> strip image tags -> convert tables -> clean markdown -> write
        v
content_extraction/{CLASSIFICATION}/{group}/{stem}/page_{N}/processed_content.txt + metadata.json
content_extraction/{CLASSIFICATION}/{group}/{stem}/toc.json        (only when a TOC is found)
checkpoint/content_extraction_checkpoint.json
        |  verify_extraction.py -> ingest_to_qdrant.py        (text flow, §4.1)
        |  page.png and figure crops -> ManualImages           (registration step NOT in the notebooks)
```

### 16.2 Input manifest: data/data\_information.csv

- **Required columns:** `document_group_id`, `filename`, `classification`. Missing any raises `ValueError`.
- **Optional columns:** `category_level_1`, `category_level_2`, `model_number`, `date_added`, `notes`. They are carried only when present and non-empty.
- `classification` is normalised with `.str.strip().str.upper()`, so `manual` and `MANUAL` become `MANUAL`. This uppercase value names a folder in both output trees and is used by `CLASSIFICATION_FILTER`.
- PDFs live at `data/{document_group_id}/{filename}`. A row whose PDF is missing is skipped with a printed message, not an error.
- `model_number` is a plain string in the CSV and in the metadata. Qdrant payloads store it as a list (§6.2). The splitting rule lives in code that was not reviewed.
- The extraction notebook rebuilds the manifest as a lookup keyed by `(document_group_id, stem of filename)` with every column as a string (empty string for blanks).

### 16.3 Drive layout

```text
RAG_OCRv1/
  MonkeyOCR/                 MonkeyOCR repo (weights expected inside it, see 16.4)
  scripts/                   helper .py files for the extraction notebook
  data/data_information.csv
  data/{document_group_id}/{filename}.pdf
  checkpoint/ocr_checkpoint.json
  checkpoint/content_extraction_checkpoint.json
  output/{CLASSIFICATION}/{group}/{stem}/page_{N}/
  content_extraction/{CLASSIFICATION}/{group}/{stem}/
```

### 16.4 phase1\_ocr.ipynb in detail

**Setup cells**

1. Mount Drive at `/content/mydrive` (`force_remount=True`).
2. Install pinned dependencies: `transformers==4.57.6`, `lmdeploy==0.9.2`, `pypdfium2==5.6.0`, `pdf2image==1.17.0`, `boto3`, `fitz`, `PyMuPDF==1.24.14`, `loguru`, `pdfminer`, `pdfminer.six`, `pandas==2.2.2`, `protobuf==5.29.6`, `pillow==11.3.0`, `psutil==5.9.5`, `fast_langdetect`, `qwen-vl-utils`; then `paddlepaddle-gpu==3.3.0` from the cu130 index, then `paddlex`; then it uninstalls `torch`, `torchvision`, `torchaudio`, `triton` and installs `torch==2.10.0+cu130`, `torchvision==0.25.0+cu130`, `torchaudio==2.10.0+cu130` from the PyTorch cu130 index. A later cell (after the OCR loop) installs `PyMuPDF==1.27.2.2`.
3. Config: `DRIVE_BASE=/content/mydrive/MyDrive/RAG_OCRv1`, `DPI=300`, `LIMIT=None`, `DOC_GROUP_FILTER=None`, `CLASSIFICATION_FILTER=None`. Output and checkpoint folders are created on Drive so they persist across sessions.
4. Copy MonkeyOCR repo + weights from Drive to the VM's local SSD (`/content/monkeyocr_local/MonkeyOCR`) with a progress bar. It runs only if `.../MonkeyOCR/weights` does not already exist locally, so once per Colab session. `MONKEYOCR_PATH` is then the local copy.
5. A clone cell (`git clone https://github.com/Yuliang-Liu/MonkeyOCR.git`) creates the repo in Drive if absent; see P7 for path inconsistencies around it.

**Work list.** One item per CSV row that passes `DOC_GROUP_FILTER` and `CLASSIFICATION_FILTER` and whose PDF exists, carrying `document_group_id`, `filename`, `filename_stem`, `classification`, `pdf_path` and the optional metadata. `LIMIT` is intended to cap document groups (see P1).

**Per-page loop** (pages are 1-indexed, `page_{N}` folders):

1. Skip the whole file if its checkpoint status is `completed`. Otherwise open the PDF with `pymupdf` and set the file entry to `in_progress` with `total_pages`.
2. Skip a page already in `completed_pages`.
3. **Rasterise** one page with `fitz.Matrix(DPI/72, DPI/72)`, `alpha=False`, saved as `page_{N}/page.png`. Failure: record `Rasterise failed: ...` under `failed_pages` and move on.
4. **MonkeyOCR** via `subprocess.run(["python", "parse.py", <page.png>, "-o", <page_dir>/_temp_ocr], cwd=MONKEYOCR_PATH, capture_output=True, text=True)`. A non-zero return code raises `RuntimeError` with the first 500 characters of stderr.
5. **Move outputs up.** If `_temp_ocr` holds exactly one directory, its contents are used (MonkeyOCR may nest by image name); each item is moved into `page_{N}/`, overwriting anything of the same name; the temp dir is deleted. A one-line preview of the first non-empty line of the first `*.md` is printed.
6. Record the page in `completed_pages` with `output_dir` and a timestamp. Failures store the error string cut to 300 characters.
7. After the last page: if `len(completed_pages) == total_pages`, mark the file `completed`; otherwise it stays `in_progress` and a partial summary prints.

**Per-page output folder:** `page.png` (the rasterised page), plus whatever MonkeyOCR writes (`*.md`, `*.json`, cropped images). `page.png` is the origin of the `imageName == "page.png"` convention that `scope.py` uses to decide page vs figure scope (§5.7).

**Checkpoint `checkpoint/ocr_checkpoint.json`**

```json
{
  "last_updated": "<ISO>",
  "files": {
    "<document_group_id>|<CLASSIFICATION>|<filename_stem>": {
      "status": "in_progress | completed",
      "total_pages": 120,
      "completed_pages": {"1": {"output_dir": "...", "timestamp": "..."}},
      "failed_pages":    {"7": {"error": "...", "timestamp": "..."}},
      "started_at": "...", "completed_at": "... or null",
      "output_dir": "...", "document_group_id": "...", "classification": "...",
      "filename": "<pdf filename with extension>",
      "category_level_1": "...", "category_level_2": "...", "model_number": "...",
      "date_added": "...", "notes": "..."
    }
  }
}
```

The `output_dir` through `notes` fields are written only at file completion, and the optional ones only when non-empty. The checkpoint is saved after every page.

**Other cells.** Section 8 prints a checkpoint summary (per file: pages done and failed, status, first 80 characters of each failure). Section 9 is a legacy single-PDF MonkeyOCR validation cell, labelled "No need to run"; it hardcodes the Panasonic manual path and writes to `DRIVE_BASE/temp_images` and `DRIVE_BASE/output`, bypassing the checkpoint. A commented-out `pip freeze` cell is the only requirements capture.

### 16.5 phase1\_llm\_parsing.ipynb in detail

**Mode toggle.** `TABLE_PARSE_MODE` is `"text"` (default; HTML tables converted by BeautifulSoup, no GPU) or `"llm"` (tables normalised by a local Qwen model, GPU needed). Any other value fails an assert. In text mode the GPU install and model-loading cells are skipped.

**Setup.** Mount Drive at `/content/drive` (note: different from the OCR notebook, P7). Install `beautifulsoup4 pandas tqdm`, plus `transformers accelerate huggingface_hub safetensors` in llm mode. Copy helper scripts from `RAG_OCRv1/scripts/` to `/content/rag_scripts` and add that folder to `sys.path`. Always copied: `general_processor.py`, `general_content_extractor.py`, `html_table_converter.py`; llm mode adds `llm_table_normalizer.py`. A missing script prints `MISSING: <path>` but does not stop; the failure surfaces later as an import error.

**Config.** `OCR_OUTPUT_DIR=DRIVE_BASE/output`, `EXTRACTION_DIR=DRIVE_BASE/content_extraction`, `TOC_NAV_THRESHOLD=0.80`, `DOC_GROUP_FILTER`, `CLASSIFICATION_FILTER`. LLM settings (llm mode only): `LLM_MODEL_NAME="Qwen/Qwen3.5-4B"`, cache at `/content/model_cache`, `LLM_MAX_NEW_TOKENS=512`, loaded with `device_map="auto"`, `torch_dtype=float16`, `trust_remote_code=True`, TF32 matmul enabled, downloaded fresh from HuggingFace each session.

**Work list.** Built from `ocr_checkpoint.json`: only entries with `status == "completed"`. The key is split with `split("|", 2)` into group, classification and stem. A file is skipped (with a message) if its OCR folder is missing or has no `page_*` folders. Page folders are sorted by their numeric suffix. If `ocr_checkpoint.json` does not exist the notebook raises `FileNotFoundError` telling you to run the OCR notebook first.

**Per file**

A. **TOC detection:** `detect_toc_pages(page_dirs, check_first_n=6)` returns `toc_page_nums` and `toc_headings`. If TOC pages exist, their markdown is read into `toc_page_texts`, and `use_toc_nav = should_use_toc_nav(toc_headings, page_dirs, threshold=0.80)`. This is the "80% rule" named in the notebook header; the rule is the share of TOC headings found exactly among body headings (reviewed in §17.2). Without a TOC, `use_toc_nav` is `False`.

B. **Per page** (pages in `toc_page_nums` are skipped: they never get a `page_N` output folder or `processed_content.txt`; pages already in the extraction checkpoint are skipped):

1. Load the page markdown with `find_md_file(page_dir)`; no markdown raises `FileNotFoundError`.
2. `extract_images_from_markdown(raw_md, page_dir)` strips image tags and returns `image_records` (caption and path, stored in metadata).
3. Table conversion: `convert_tables_in_markdown(md)` in text mode, or `normalize_tables_in_markdown(md, model, tokenizer, max_new_tokens=512)` in llm mode. Returns text plus `table_records`.
4. `clean_markdown(...)` (removes duplicate headers and repeating footers).
5. `GeneralContentExtractor(output_root=EXTRACTION_DIR, csv_metadata=csv_meta).process_page(...)` writes `processed_content.txt` and `metadata.json`, receiving `toc_page_nums`, `use_toc_nav` and `toc_headings`.
6. Mark the page extracted; any exception stores the first 300 characters of the error under `failed_pages`.

C. **`toc.json`:** if a TOC was found, `write_toc_json(...)` writes it at file level with `toc_page_nums`, `toc_headings`, `use_toc_nav` and `toc_page_texts`.

D. **Finalise:** `body_pages = len(page_dirs) - len(toc_page_nums)`. If the checkpoint's `failed_pages` is empty the file is marked `completed` (with `use_toc_nav` and `table_parse_mode`), else it stays partial (see P2).

**Table output formats**

- Text mode: `[Row N] val | val |` (BeautifulSoup). In-memory records carry `embed_text` and `retrieval_text`, but `metadata.json` keeps only `table_index` and `normalised`, which is empty in text mode (corrected in §17.3, P13).
- LLM mode: `FACT: key = value` and `ROW: v1 | v2`. Records carry the text under the key `normalised`, which is also what `metadata.json` keeps.
- The Phase 2 chunker and glossary are built around `[Row N]` blocks (§4.1, §12). The chunker does not recognise `FACT:` / `ROW:` output as table content: it detects tables only by lines starting with `[Row N]`, so llm-mode tables are chunked as plain text (verified in v3.4, §22.7 I3).

**`metadata.json` fields visible in the notebook's inspect cell:** `unit_id`, `page`, `classification`, `text_length`, `total_tables`, `total_figures`, `use_toc_nav`, `toc_page_nums`, `model_number`, `category_level_1`, `date_added`, `notes`, `images` (list), `tables` (list). `category_level_2` and `toc_headings` are passed to the extractor but are not in that print list. The full schema is in the unreviewed extractor.

**Extraction checkpoint `checkpoint/content_extraction_checkpoint.json`:** same shape as the OCR one (key `<group>|<CLASSIFICATION>|<stem>`, `completed_pages`, `failed_pages`, `status`), with these differences: the file entry gets `total_pages` (body pages only), `completed_at`, `document_group_id`, `filename` (the stem, not the PDF name), `classification`, `use_toc_nav` and `table_parse_mode` at completion.

**Optional cells.** Section 11 prints a checkpoint summary including mode and a TOC label. Section 12 prints one page's `processed_content.txt` (first 60 lines) and key `metadata.json` fields once the `INSPECT_*` variables are set. Section 13 (clear GPU memory) has the actual cleanup lines commented out and only prints a message.

### 16.6 Contract between Phase 1 and Phase 2

- **Path:** `content_extraction/{CLASSIFICATION}/{group}/{stem}/page_{N}/` is what `verify_extraction.py` validates and `ingest_to_qdrant.py` walks (§4.1). The classification comes from the uppercase folder name, and `EXTRACTION_DIR` in Phase 2 should point at the `content_extraction` folder itself.
- **One content unit per page:** `processed_content.txt` + `metadata.json`.
- **Page numbers stay original and 1-based.** TOC pages are absent from the sequence, so a manual with a 3-page TOC starts at `page_4`. Those pages produce no text chunks; their text lives only in `toc.json`.
- **Metadata-to-payload:** the identity fields (`classification`, `category_level_1/2`, `model_number`, `date_added`, `notes`) and the TOC fields (`use_toc_nav`, `toc_page_nums`, `toc_headings`) reach Qdrant payloads through `metadata.json`. The mapping code is in `ingest_to_qdrant.py` / `vector_store._build_payload`, which were not reviewed.
- **Images:** the OCR notebook writes `page.png` per page; figure crops come from MonkeyOCR's output folder. The notebooks do not upload them to Firebase Storage or create `ManualImages` docs. `imageName`, `pageNum` and `storagePath` (§6.1, §10 #8) are therefore produced by some other step. The `page_N` folder naming matches what `page_num_int("page_7")` parses.
- **Three checkpoints, three key formats:** OCR and extraction use `<group>|<CLASSIFICATION>|<stem>`; ingest uses `<group>|<stem>` (§8.1). In the OCR checkpoint `filename` includes the extension; in the extraction checkpoint it is the stem.

### 16.7 Findings in the Phase 1 notebooks

- **P1: `LIMIT` includes only the first file of the last group.** The OCR work-list loop adds an item, records its group, and breaks as soon as `len(seen) >= LIMIT`. With `LIMIT=2`, group 2 contributes only its first PDF if it has several.
- **P2: a page that failed once can stop its file from ever completing (extraction notebook).** `_mark_page_extracted` does not remove the page from `failed_pages`, and finalisation requires `failed_pages` to be empty. After a successful retry the file stays `in_progress` on every later run. The OCR notebook is not affected because it compares `completed_pages` to `total_pages`, but it also keeps stale `failed_pages` entries, which its inspection cell then prints.
- **P3: switching `TABLE_PARSE_MODE` mid-corpus mixes formats.** Pages already marked extracted are skipped regardless of mode, and the mode is recorded only when a file completes. A file extracted partly in text mode and partly in llm mode is possible.
- **P4: llm-mode table format is a possible chunker mismatch.** See 16.5. Treat llm mode as unverified for Phase 2 until the chunker's table detection is checked.
- **P5: one MonkeyOCR process per page.** `parse.py` is launched as a fresh subprocess for every page, so model start-up cost is likely paid per page. Not measured; it is the obvious speed lever for large manuals.
- **P6: dependency hazards.** The install cell installs both `fitz` and `PyMuPDF==1.24.14` (the PyPI package `fitz` is a different project and is known to clash with PyMuPDF), imports `pymupdf` in the loop, and only later pins `PyMuPDF==1.27.2.2`. `pdfminer` and `pdfminer.six` are both listed. Requirements are not captured anywhere except a commented-out `pip freeze`.
- **P7: inconsistent Drive paths.** The OCR notebook mounts at `/content/mydrive`, the extraction notebook at `/content/drive`, and the clone cell uses `/content/MyDrive/MyDrive/RAG_OCRv1` with a separate `MonkeyOCR_weights` folder. The copy cell, however, expects weights at `RAG_OCRv1/MonkeyOCR/weights`. If the weights are not there, the local copy is skipped and MonkeyOCR will not find them.
- **P8: TOC detection covers only the first six pages.** A TOC that starts later, or runs past page six, is treated as body text or missed. Both outcomes affect `toc_page_nums` and therefore the TOC backfill (§14).
- **P9: TOC label in the inspect cell.** Files without a TOC are completed with `use_toc_nav=False`, not `None`, so section 11 prints `toc-stored` for them; `no-toc` appears only for entries that lack the field.
- **P10: skipped helper failures are quiet.** A missing helper script only prints a message; PDFs that cannot be opened are skipped with a message and are not recorded in `failed_pages`, so they never appear in the checkpoint at all.

### 16.8 Recovery and re-run behaviour (derived from the notebook code)

- **Retry after failures:** re-run the notebook. Completed files and done pages are skipped; failed pages are retried. Extraction files with stale failures will need the P2 workaround below.
- **Force a page to be re-OCR'd:** remove its entry from `completed_pages` in `ocr_checkpoint.json` and make sure the file's `status` is not `completed` (set it to `in_progress` or delete the file entry). The output for that page is overwritten.
- **Re-extract a file** (new table mode, TOC settings, or a fixed helper script): delete the file's entry from `content_extraction_checkpoint.json`. Changing the mode alone does nothing for pages already marked extracted.
- **P2 workaround:** delete the page's key from `failed_pages` after it has succeeded, then re-run so the file can be marked complete.
- **After any Phase 1 change:** run `verify_extraction.py`, then ingest. The ingest checkpoint (§8.1) will skip files it already has, so a changed file needs its ingest entry removed (or a fresh `CHECKPOINT_DIR`) to be picked up. The extractor overwrites an existing page's two output files on re-run (reviewed in v3.3).

### 16.9 What Phase 1 changes for the §13 and §14 backfills

**Classification and identity fields (§13)**

- The original source of truth is `data_information.csv`. It holds `classification` plus all five optional fields. A backfill can read the CSV directly instead of copying values from Qdrant text points.
- Join on `(document_group_id, filename)`: `ManualImages.documentGroup` and `ManualImages.filename` against the CSV columns of the same meaning. The §6.1 example shows `filename` with a `.pdf` extension, matching the CSV. Check one real doc before running; whether `ManualImages.filename` is exactly the CSV value was not verified.
- Normalise `classification` with `strip().upper()` the way Phase 1 does, or backfilled values will not match the folder-derived ones on text points.
- `model_number` needs the same string-to-list conversion the ingest uses (rule not seen).
- The extraction checkpoint also stores `document_group_id`, `filename` (stem) and `classification` per file, which is a second source if the CSV has changed since ingest.

**TOC (§14)**

- Phase 1 already computes TOC data for every file. Per-page `metadata.json` carries `toc_page_nums` and `use_toc_nav`, and `toc_headings` only when `use_toc_nav` is true (corrected in §17.3); `toc.json` holds the same plus the TOC page text; the extraction checkpoint stores `use_toc_nav` per file. A TOC backfill can therefore read those files rather than re-parse PDFs.
- If the detection itself was wrong (first six pages only, 80% threshold, P8), the fix is upstream: delete the file's extraction checkpoint entry, re-run the extraction notebook, then re-ingest or patch Qdrant from the new `metadata.json`.
- Your separate TOC backfill is not in these notebooks. v3.5 confirms it is `backfill_toc_sections.py`, and it does **not** use the TOC data Phase 1 computes: it derives sections from the headings in each chunk's own text (§23.4, S1). Phase 1's `toc_page_nums`, `toc_headings`, `use_toc_nav` and `toc.json` are stored but not read by it or by section expansion.
- TOC pages have no content chunks, so only body pages carry (or need) TOC payload fields.

### 16.10 Still needed for Phase 1

1. `general_processor.py`, `general_content_extractor.py`, `html_table_converter.py`, `llm_table_normalizer.py` (reviewed in v3.3, see §17.2; the extractor overwrites processed\_content.txt and metadata.json on every call, so a re-extraction replaces them).
2. The step that uploads page images and figure crops and creates `ManualImages` docs (where `imageName`, `pageNum`, `storagePath` come from).
3. A sample MonkeyOCR output folder for one page, to document its exact file names.
4. Confirmation of how `data_information.csv` is produced and whether it is edited after ingest.

## 17. Source review, round 3 (v3.3): Phase 1 helper scripts and the rest of vlm\_pipeline

### 17.1 What was reviewed this round

| Files | Status |
| --- | --- |
| `general_content_extractor.py`, `general_processor.py`, `html_table_converter.py`, `llm_table_normalizer.py` (Phase 1 helpers) | Read in full. Details in §17.2; corrections to §16 in §17.3; new findings P11–P24 in §17.4. |
| `pipeline.py`, `vlm.py`, `review.py` (`vlm_pipeline/`) | Now readable; read in full. Details in §17.5; new traps in §17.6. |
| `ingest_to_qdrant.py`, `describe_images.py`, `embed_images.py`, `chunker.py`, `embedder.py`, `vector_store.py`, `retrieval_pipeline.py`, `test_retrieval.py`, `verify_extraction.py`, `vlm_pipeline/__init__.py` | Still not provided. Their sections remain as in v2. |
| The step that uploads images and creates `ManualImages` docs; the real classification and TOC backfill scripts | Still not provided. |

### 17.2 Phase 1 helper scripts (source-verified)

**`general_content_extractor.py`** (`GeneralContentExtractor`, `EXTRACTION_VERSION = "1.1.0"`, `PIPELINE_VERSION = "rag_pipeline_v1.0"`)

`process_page(...)` writes two files per page into `content_extraction/{CLASSIFICATION}/{group}/{stem}/page_{N}/`.

`processed_content.txt` has this exact layout (a five-line header, a blank line, then the cleaned text, then a newline):

```text
UNIT ID: {group}_{stem}_p{N}
DOCUMENT GROUP: {group}
FILENAME: {stem}
CLASSIFICATION: {CLASSIFICATION}
PAGE: {N}

CONTENT:
{cleaned markdown}
```

If the cleaned text is empty, the file still gets written with the literal placeholder `[EMPTY AFTER CLEANING]` as its content, and the unit is still returned. (The docstring says it returns `None` for empty pages; the code never does.)

`metadata.json` (UTF-8, `indent=2`, `ensure_ascii=False`) contains:

- **Identity:** `unit_id` (`{group}_{stem}_p{N}`), `document_group_id`, `filename` (the stem, no extension), `page` (int), `classification`.
- **Paths (absolute, as seen by the notebook, so Colab paths):** `file_path` (the `processed_content.txt`), `md_file_path` (the OCR markdown used, or empty), `page_image_path` (the OCR `page.png` if it exists, else empty).
- **Content stats:** `text_length`, `has_tables`, `has_figures`, `total_tables`, `total_figures`.
- **`images`:** list of `{caption, src_path, abs_path, exists}` from the stripped image tags.
- **`tables`:** list of `{table_index, normalised}` only. Raw HTML, `embed_text`, `retrieval_text`, `success` and character offsets are all dropped (see P13).
- **TOC:** `toc_page_nums` (list), `use_toc_nav` (bool), `toc_headings` (the heading list only when `use_toc_nav` is true, otherwise an empty list).
- **Provenance:** `content_type = "text"`, `pipeline_type = "general"`, `extraction_method = "phase1_llm_parsing"`, `extraction_version`, `pipeline_version`, `needs_chunking = true`.
- **`chunking_hints`:** `is_table = false`, `preserve_as_parent = true`, `split_into_children = true`, `suggested_parent_grouping = "page"`, `natural_boundaries` (the ATX headings found in the cleaned text, de-duplicated, in order).
- **CSV fields:** each of `category_level_1`, `category_level_2`, `model_number`, `date_added`, `notes` is added as a stripped string only when the CSV value is non-empty.

The returned `ContentUnit` (`id`, `text`, `content_type="text"`, `page`, `source`, `section_path=[group, stem, "Page N"]`, `metadata`) is not used by the notebook.

`write_toc_json(...)` returns `None` when there are no TOC pages; otherwise it writes `toc.json` at file level with exactly these keys: `document_group_id`, `filename` (stem), `toc_page_nums`, `use_toc_nav`, `toc_headings` (always the full list, regardless of `use_toc_nav`), and `toc_page_texts` (page number as a string key mapped to the raw OCR text). It does not store `classification`. It prints `nav_layer=ENABLED` or `DISABLED (<80% match)`.

Markdown file lookup (`_find_md_file`, same as `find_md_file`): first existing of `general.md`, `general0.md`, `output.md`, `markdown.md`; otherwise the first `*.md` from a directory glob whose name does not start with `_tmp`. Glob order is not sorted, so if MonkeyOCR writes several markdown files per page the one used is not deterministic.

**`general_processor.py`**

- **`detect_toc_pages(page_dirs, check_first_n=6)`** looks at the first six page folders only. A page is flagged as TOC when its lower-cased text contains `table of contents` or `contents` anywhere (substring match on the whole page), or when at least 3 of its first 20 lines match `^\s*(\d+\.)+\s+\S` (a numbered-section line such as `3.2 Title`). For each flagged page, every stripped line matching `^((?:\d+\.)+\d*)\s+(.+?)[\s\.]+\d*$` becomes a heading string `"<number> <title>"`. That pattern needs a dotted number at the start and at least one space or dot (optionally followed by a page number) after the title, so a bare `1.2 Title` with nothing after it does not match, and unnumbered TOC lines never match.
- **`should_use_toc_nav(toc_headings, all_page_dirs, threshold=0.80)`** returns `False` for an empty heading list. Otherwise it collects "body headings" from every page folder passed in (the notebook passes all pages, including the TOC pages themselves): ATX `#` headings, plus any line that looks like a numbered heading (`^((?:\d+\.)+\d*)\s+(.+)$`), all lower-cased. It counts how many TOC headings appear exactly (lower-cased, stripped) in that set, prints `TOC nav check: matched/total (ratio)`, and returns `ratio >= threshold`.
- **`extract_images_from_markdown(md, page_dir)`** removes every `![caption](path)` tag, records `{caption, src_path, abs_path = page_dir / path, exists}`, collapses runs of 3+ newlines to 2 and strips. Figure captions therefore leave the page text and live only in `metadata.json`.
- **`clean_markdown(md)`** (a) drops an ATX heading when its level and lower-cased text equal the previous heading seen (even with body text in between), (b) counts non-empty stripped lines shorter than 120 characters and deletes every line whose text occurs 3 or more times, (c) collapses 4+ newlines to 2. This runs per page, not per document.
- `find_md_file` and `extract_headings_from_md` are the helpers described above.

**`html_table_converter.py`** (text mode)

- `convert_tables_in_markdown(md)` finds each `<table ...>...</table>` with the non-greedy, case-insensitive regex `<table[\s\S]*?</table>`, converts it, and splices the result in place. Records: `{table_index, embed_text, retrieval_text, success, char_start, char_end}` (offsets refer to the original input text).
- `build_grid` expands `rowspan` and `colspan` into a rectangular grid (spanned cells repeat their text), reads cell text with `get_text(" ", strip=True)`, normalises temperature units, and blanks cells whose text is `""`, `"—"`, `"-"` or `"N/A"`.
- `normalize_temperature_units` rewrites `°C` and `℃` to `  Celsius ` and `°F` and `℉` to `  Fahrenheit ` (the degree patterns allow optional spaces and ignore case), then collapses whitespace.
- `collapse_adjacent(cells, min_collapse=6)` replaces a run of 6 or more identical adjacent cells with `<value> x<N>` (`(empty) xN` for blanks).
- **Embed format:** one line per row, `[Row N] c0 | c1 | c2 |` with a 0-based row number that includes the header row and restarts at 0 for every table. **Retrieval format:** `[Row N] [C0] c0 | [C1] c1 |`. Only the embed text is spliced into the page; the retrieval text is kept in the in-memory record and is never written to `metadata.json`.
- On any conversion error the original HTML stays in the page text, `success = False` and both texts are empty.
- No marker or blank line is inserted around the converted rows.

**`llm_table_normalizer.py`** (llm mode)

- `normalize_tables_in_markdown(md, model, tokenizer, max_new_tokens=512)` uses the same table regex and calls `normalize_table_with_llm` once per table.
- The system prompt tells the model to extract only what is present, never guess, keep numbers and units exactly, write `[EMPTY]` for missing values and `[UNCLEAR: ...]` for corrupt text, and emit plain text records: `FACT: <label> = <value>`, `ROW: <col1> | <col2> | ...` (header row first), optionally grouped by `SECTION: <n>`.
- Generation: `apply_chat_template` (falls back to concatenating system and user text), `do_sample=False`, `max_new_tokens` from the notebook (512), and `temperature=0.1` is passed but has no effect when sampling is off.
- Success replaces the table with `\n<!-- TABLE n -->\n<normalised>\n` (n starts at 1). An empty result or an exception replaces it with `\n<!-- TABLE n LLM FAILED -->\n`. Records: `{table_index (0-based), normalised, success, char_start, char_end}`.

### 17.3 Corrections to §16 made by this round

1. **§16.5, "Table output formats":** the in-memory text-mode record uses `embed_text` and `retrieval_text`, and the llm-mode record uses `normalised`, but `metadata.json` keeps only `table_index` and `normalised` for both modes. In text mode `normalised` does not exist on the record, so `metadata.json` holds an empty string for every table (P13).
2. **§16.5, step A:** the "80% rule" is now known: the share of TOC headings found exactly among body headings (§17.2).
3. **§16.5, TOC fields and §16.9:** `toc_headings` in a page's `metadata.json` is non-empty only when `use_toc_nav` is true. The complete heading list is always in `toc.json`.
4. **§16.5, step B and §16.10 item 1:** the helper scripts were reviewed; item 1 of §16.10 is resolved.
5. **§16.5, `metadata.json` fields:** the full schema is in §17.2. `category_level_2` and `toc_headings` are both present in the schema (the inspect cell simply does not print them).
6. **P4 (§16.7)** stays open: the chunker was still not reviewed.
7. **P8 (§16.7):** TOC detection has a worse failure mode than "misses a late TOC": it can flag body pages as TOC (P11).

### 17.4 New findings in the Phase 1 helpers

- **P11: any of the first six pages containing the word "contents" is treated as a TOC page and dropped from the content.** The keyword test is a plain substring match on the whole page, so a cover page, safety page or accessories list ("package contents") qualifies. A flagged page produces no `page_N` output, no `processed_content.txt` and no chunks; its text survives only inside `toc.json`. Check `toc_page_nums` against the real TOC for every manual.
- **P12: TOC heading extraction is narrow.** It needs dotted numbering and a trailing space, dot or page number (§17.2). A TOC without section numbers, or with bare numbered lines, gives `toc_page_nums` with an empty `toc_headings`, so `use_toc_nav` is false while the pages are still dropped.
- **P13: text-mode `metadata.json` loses all table text.** `_build_metadata` reads `r.get("normalised", "")`, but text-mode records have `embed_text` and `retrieval_text` instead. Every `tables[].normalised` is therefore empty, and the labelled retrieval text that the converter's docstring says is "stored in metadata for retrieval phase" is never stored. The table text still exists inside `processed_content.txt`, so ingestion is unaffected unless Phase 2 reads `metadata.tables`. The notebook's inspect cell prefers `embed_text` and will print an empty string.
- **P14: a failed table is handled differently in the two modes.** Text mode leaves the raw HTML in the page text. llm mode replaces it with `<!-- TABLE n LLM FAILED -->`, so the table's data is gone from `processed_content.txt` and nothing in `metadata.json` retains it.
- **P15: llm-mode output can be silently truncated.** The 512-token cap is not checked, so a long table is cut mid-row and recorded as `success = True`. There is no retry, no validation against the source and one generation per table.
- **P16: `clean_markdown` is per page.** Headers and footers that repeat across pages are not removed. Within a page, any short (under 120 characters) line that appears 3 or more times is deleted everywhere it occurs, which can remove legitimate repeated content such as repeated labels, bullet markers or leftover table tags from a failed conversion.
- **P17: empty pages are kept.** A page that cleans down to nothing is written with `[EMPTY AFTER CLEANING]` as its content and counted as extracted, and ingestion keeps it and stores it as a chunk (verified in v3.4, §22.7 I4).
- **P18: absolute Colab paths are baked into the output.** `file_path`, `md_file_path`, `page_image_path` and every `images[].abs_path` hold the paths seen in Colab (for example under `/content/drive/MyDrive/RAG_OCRv1/`). They are meaningless on another machine, and the Qdrant payload fields `file_path` and `page_image_path` (§6.2) are very likely populated from them. Not verified in `ingest_to_qdrant.py`.
- **P19: the temperature regexes can over-match.** `°\s*C` and `°\s*F` ignore case and have no word boundary, so a degree sign followed by a word that starts with C or F (for example `90° Flare`) would also be rewritten. Derived from the pattern, not run. Cells reading `-`, `—` or `N/A` become empty, so those values are indistinguishable from blanks.
- **P20: wide tables get collapsed cells.** Six or more identical adjacent cells become `value xN`, which will also hit merged header cells that span many columns.
- **P21: nested tables break the converter.** The non-greedy regex closes at the first `</table>`, so an inner table ends the match early.
- **P22: `processed_content.txt` starts with five header lines and `CONTENT:`.** `ingest_to_qdrant.py` strips them: it keeps only the text after the first `CONTENT:` line (verified in v3.4, §22.2).
- **P23: figure captions leave the text.** Image tags are removed from the page text, so a figure's caption is searchable only through the VLM image flow, not through text chunks.
- **P24: no document-level view.** `toc.json` omits `classification`, and `metadata.json` repeats `toc_page_nums` and `use_toc_nav` on every page of a file, which is useful for backfills (§17.8).

### 17.5 vlm\_pipeline: pipeline.py, vlm.py, review.py (source-verified)

**pipeline.py: configuration.** `load_dotenv()` runs at import. `DEFAULT_MODEL = os.getenv("VLM_MODEL", "gpt-4o-mini")`, `DEFAULT_BUCKET = os.getenv("FIREBASE_BUCKET", "rbacfyp.firebasestorage.app")`, `TOKEN_RATE_LIMIT_PER_MIN = int(os.getenv("VLM_TOKEN_LIMIT_PER_MIN", "60000"))`, `DEFAULT_TOKEN_ESTIMATE = int(os.getenv("VLM_TOKEN_ESTIMATE", "1200"))`. The OpenAI client is created only outside `--dry-run`, with `os.environ["OPENAI_API_KEY"]` (a missing key raises `KeyError`).

**TokenRateLimiter.** A deque of `(monotonic timestamp, tokens)`; `wait_for_capacity(estimate)` loops: under a lock it prunes events older than 60 s and returns if `used + estimate <= limit`; otherwise it sleeps until the oldest event leaves the window (minimum 0.5 s) and logs `Rate limit: used/limit tokens in window`. `record(tokens)` ignores values of 0 or less. There is a separate limiter for the detail model when `diagram_model != model`, but both use the same configured limit. Each limiter keeps its own running estimate (initialised from `DEFAULT_TOKEN_ESTIMATE`, then replaced by the last call's real total), so `VLM_TOKEN_ESTIMATE` only matters for the first classify call and the first detail call of a run. Limiter state starts empty on every run.

**RunStats.** `scanned`, `already_done`, `duplicates`, `described`, `diagrams_detailed` (counts a detail pass for any of the five tags despite the name), `detail_pass_counts`, `errors`, `scope_counts`, `tag_counts`, token and cost totals, `total_rate_limit_wait_s`, `stopped_early`. `summary()` prints these, with a dry-run banner and an early-stop warning when set.

**run(...) in exact order, per doc**

1. `scanned += 1`. Scope is `determine_scope(doc["imageName"])`; the page label is `page_num_display(doc["pageNum"])`; the label text is from `scope_label`.
2. If `vlmStatus` is `described` or `skipped_duplicate` and not forced: `already_done += 1`, and if the doc has a `phash`, it is added to the duplicate index as a representative, whatever its scope or status (see Trap 18). Then skip.
3. No `storagePath`: warn, `errors += 1`, skip without writing to Firestore.
4. Download from Storage. On failure: warn, `errors += 1`, and (outside dry-run) write `vlmStatus="error"`, `vlmError="download: ..."`, `imageScope`.
5. Read original dimensions; compute `phash`.
6. Duplicate check only if `phash` exists, scope is not `page` and not retag mode. A match writes the `skipped_duplicate` fields (§6.1) with zero tokens and cost and skips the VLM.
7. Otherwise, with the same conditions, add this doc as a representative.
8. Dry-run: log `would call VLM` and skip. Note that steps 4 to 7 already ran (Trap 21).
9. Resize to at most 1024 px on the long side (JPEG, quality 85).
10. Inside a `try`: build the context line `This is {label} from document group '{group}', file '{filename}'.`; wait on the limiter; `classify_image`; record tokens; compute cost with `calculate_cost(..., model)`.
11. If the tag has a detail handler and detail is enabled: wait on the detail limiter; run the handler on the resized image; record tokens; compute cost with `calculate_cost(..., diagram_model)`; add tokens and costs to the running totals. The pass-2 description replaces pass 1's only when it is non-empty (`detailed["description"] or result["description"]`).
12. Update counters. The stored description is `[<label>] <description>` (square brackets).
13. Write the original downloaded bytes to `vlm_review/NNNN_<safe_doc_id>.jpg` (the filename extension is `.jpg` even if the bytes are PNG) and append a review item (which also carries the detail payload).
14. Write the Firestore fields: the core fields plus `**ALL_DETAIL_FIELDS`, then `fields.update(extra_payload)` and `vlmDetailModel` when a detail pass ran. Print a summary block.
15. Any exception: write `vlmStatus="error"`, `vlmError`, `imageScope` and the dimensions; `errors += 1`; if the message contains `insufficient_quota` or `credit_balance_exhausted`, set `stopped_early = "out of OpenAI credits"` and stop the loop; otherwise log a warning and carry on.
16. `time.sleep(0.2)` at the end of each doc that reached the bottom of the loop (skip and duplicate paths do not sleep).

After the loop, `generate_review_html` runs only if this run produced review items, so the review page covers only the images processed in that run.

**report(...).** Prints counts by `vlmStatus`, `imageScope`, `vlmTag`, and by `(imageScope, vlmTag)` pairs. For each of the five detail tags it prints how many described docs have extracted data and how many are "confirmed nothing readable" (empty list with the gate field exactly `False`), plus a count of `vlmDetailModel` values. It lists up to 20 errored docs with `vlmError`, then totals tokens and cost from the stored per-doc fields (so the total is cost at the time of each description).

**vlm.py: prompts and schemas.** Pass 1 (`classify_image`) sends the system prompt with the nine-tag guide and the user text `<context line>\nDescribe this image from a service manual.`, `max_completion_tokens=2048`; it expects `{description, content_type}`. Pass 2 uses `max_completion_tokens=8192` and asks for these shapes (every handler also asks for a `description` and echoes `content_type`):

- **diagram:** `has_visible_measurements`, `measurements[{label, value}]`. Entries without both label and value are dropped. The prompt forbids inventing typical values, keeps ranges as ranges, and groups entries by view name.
- **graph:** `has_readable_graphs`, `graphs[{title, x_axis{label, unit, ticks[]}, y_axis{...}, curve_description}]`, one object per distinct graph in reading order. No entries are filtered.
- **schematic:** `has_identifiable_components`, `components[{name, type, value, location}]`, `connections[{from, to, relationship}]`. Components need a name; connections need `from` and `to`. The prompt lists the component type vocabulary (fuse, relay, connector, terminal\_block, capacitor, resistor, thermistor, motor, compressor, reactor, transformer, ic, power\_supply, pfc, rectifier, communication\_circuit, sensor, other), but the code only lower-cases the model's value and does not validate it.
- **flowchart:** `has_readable_flow`, `flowcharts[{title, nodes[{id, label, type, value}], edges[{from, to, label}]}]`. Nodes need a label; edges need `from` and `to`. Node types (start, decision, outcome, cause) are likewise not validated.
- **installation\_diagram:** `has_readable_steps`, `steps[{panel_title, parts_shown[], note}]`. Steps need a `panel_title`.

In every handler the gate is enforced in code (an empty array unless the boolean is true). `_call_vision` has no `try`, so a malformed JSON reply raises and the doc is marked `error`. `_parse_json_response` strips leading and trailing code fences before parsing. `ALL_DETAIL_FIELDS` has 11 keys; the empty defaults are `[]` for lists and `None` for the gate booleans (not `False`).

**review.py.** Output is `vlm_review/review.html` with image files beside it (open it from that folder). Each card shows the image, page, tag and scope badges, description, the structured data table for its tag, token and cost metadata, three radio buttons (Accurate, Partially accurate, Incorrect) and a notes box. Evaluations persist in `localStorage` under the key `vlm_review_evaluations_v1`, keyed by doc id and shared by every document group opened in that browser. Exports: JSON (`exported_at`, `document_group`, `total_images`, `evaluations`) and CSV (`doc_id, page, scope, tag, model, evaluation, notes`). The accuracy rate is accurate divided by rated. `rebuild_review` re-downloads each described image with no OpenAI call; it names files from an index over the described docs rather than the run counter, and its `model` column shows only `vlmModel`, not the detail model.

### 17.6 New traps from this round (numbering continues from Trap 17)

**Trap 18: a resumed run puts page-scope hashes back into the duplicate index.** Trap 10 says page-scope images are never added to `DuplicateIndex`. That holds inside one fresh run. On a re-run, the skip path (step 2 above) adds every already-processed doc that has a stored `phash` as a representative, including page renders and `skipped_duplicate` docs. A figure crop processed later can then be marked `skipped_duplicate` because it resembles an earlier-run page render, which is the case the invariant was meant to prevent. A possible fix is to skip the `add_representative` call when the doc's `imageScope` is `page` (not applied; shown here only as an option). Until then, describe a document group in one uninterrupted pass where you can.

**Trap 19: pricing is validated after the API call is paid for.** `calculate_cost` runs after `classify_image` and after the detail handler return. A model missing from `MODEL_PRICING` raises `ValueError` only then, inside the per-doc `try`, so the doc is marked `error` after the call was billed, and the same happens for every remaining doc. Check `--model` and `--diagram-model` against `pricing.MODEL_PRICING` before starting. `--dry-run` does not catch it because it does no costing.

**Trap 20: `vlmDetailModel` is never wiped.** It is not in `ALL_DETAIL_FIELDS` and is written only when a detail pass runs. A doc re-tagged from a detail tag to a non-detail tag, or re-described with `--no-diagram-detail`, keeps its old `vlmDetailModel`, and `report()` counts it.

**Trap 21: `--dry-run` is not free.** It still downloads every image from Storage and computes its pHash (to preview duplicates). It writes nothing and calls no OpenAI endpoint.

**Trap 22: rate-limiter edge cases.** If a single estimated call is larger than the whole limit while the window is empty, `wait_for_capacity` reads `self._events[0]` on an empty deque and raises `IndexError`. Unlikely at the default 60,000. The limiter also cannot see tokens spent by other processes or by earlier runs less than a minute old.

### 17.7 Corrections to earlier sections from the Phase 2 source

1. **§6.1 example.** The stored description is `[Figure on page 3] This is a dimensioned...` (square brackets, no dash). The example in §6.1 is corrected in place.
2. **§4.2 step 1 and Trap 10:** see Trap 18.
3. **§4.2 step 8 / §5.6 "Pass 2 description replaces pass 1's":** only when the pass-2 description is non-empty.
4. **§5.5 `VLM_TOKEN_ESTIMATE` "only used for the first call":** it seeds two estimates (classify and detail), each replaced after its own first call.
5. **§5.9 "does not silently continue with $0 cost":** true, but the check happens after the paid call (Trap 19).
6. **§3.3 `--dry-run`:** also downloads images (Trap 21). `--only-tag` is passed to Firestore as a server-side `in` filter and also forces `--force` and skips dedup.
7. **Confirmed unchanged:** the nine tags and five handlers, gate enforcement, the 11-field wipe, `max_completion_tokens`, early stop on quota errors, the two-limiter design, `RunStats` fields and the `skipped_duplicate` and error field sets.

### 17.8 What the new source changes for the §13 and §14 backfills

**TOC (§14)**

- `toc.json` is the only complete record of the TOC headings. A page's `metadata.json` has `toc_headings` filled only when `use_toc_nav` is true. In §14.3 step 1, an inventory that treats an empty `toc_headings` as "missing TOC data" would flag every file whose navigation layer is off. Inventory on `toc_page_nums` and `use_toc_nav` instead.
- `toc_page_nums` and `use_toc_nav` are identical on every page of a file, so they can be backfilled per file from `toc.json` or from the extraction checkpoint entry.
- Phase 1 stores no heading-to-page mapping. A mapper can build one from each page's `chunking_hints.natural_boundaries` (the ATX headings on that page) matched against the TOC headings, with the caveat that numbered lines that are not `#` headings are not in `natural_boundaries` (they are, however, used by the 80% check).
- A wrong TOC detection (P11, P12) must be fixed upstream; patching Qdrant only copies the mistake.
- v3.5: the real backfill ignores these Phase 1 TOC fields (S1), so P11 and P12 do not feed section expansion. What does feed it is the heading text surviving into `processed_content.txt`, including the numbered headings whose `#` the converter dropped (§23.4).

**Classification and identity fields (§13)**

- Besides `data_information.csv` and the folder name, each `processed_content.txt` carries a `CLASSIFICATION:` header line, and each `metadata.json` carries `classification` plus the optional CSV fields as strings.
- `model_number` is a string in `metadata.json`; the payload type is a list (§6.2), so a backfill must apply the ingest's conversion (not seen).
- `file_path`, `page_image_path`, `md_file_path` and `images[].abs_path` in `metadata.json` are Colab paths (P18). If §13 or §14 patches those payload fields, decide first whether they should be rewritten for the PC.

## 18. Running the pipeline start to finish (v3.3)

This is the order to follow for a new manual (or a new batch). Every step is labelled by how well it is known:

- **Verified:** read in the source files.
- **README v2:** taken from the earlier documentation; the script was not provided.
- **Unknown:** no script or code has been seen. These are the gaps that need your input.

### 18.1 Overview

| # | Step | Where it runs | Needs | Produces | Basis |
| --- | --- | --- | --- | --- | --- |
| 1 | Prepare the manifest CSV and PDFs | Your PC, then Google Drive | §19 | `RAG_OCRv1/data/` | Verified |
| 2 | Phase 1a: OCR | Colab with a GPU | `data/`, MonkeyOCR with weights | `output/...`, `ocr_checkpoint.json` | Verified |
| 3 | Phase 1b: parse and clean | Colab (CPU is enough in text mode) | `output/`, the 4 helper scripts | `content_extraction/...`, `content_extraction_checkpoint.json` | Verified |
| 4 | Copy results to the PC | PC | `content_extraction/` (and `output/` for images) | local folders | Derived |
| 5 | Configure the PC | PC | §20 | `.env`, virtual environment | Verified and README v2 |
| 6 | Verify the extraction | PC | `EXTRACTION_DIR` | exit code | README v2 |
| 7 | Ingest text into Qdrant | PC | Qdrant, `.env` | text points, `checkpoint/ingest_checkpoint.json` | README v2 |
| 8 | Register images in Firebase (`ManualImages`) | Unknown | page images and figure crops | Storage files and Firestore docs | **Unknown** |
| 9 | Describe images with the VLM | PC | Firebase, OpenAI key | `vlm*` fields, `vlm_review/` | Verified (pipeline and CLI, v3.6) |
| 10 | Embed described images | PC | Qdrant, embedder | image points, `qdrant*` fields | Verified (embedding); CLI from README v2 |
| 11 | Verify images | PC | Firebase, Qdrant | exit code | Verified |
| 12 | Test retrieval | PC | everything above | `last_retrieval_*` files | Verified (v3.6) |
| 13 | Backfills (classification, TOC) | PC | the real scripts | patched payloads | Verified for TOC (`backfill_toc_sections.py`, §23); classification backfill unknown |
| 14 | Use from your app | App | `RetrievalPipeline` | prompts | Start commands inferred from `.env` comments (§3.7) |

### 18.2 Step 1: prepare the manifest and PDFs

1. Build `data_information.csv` exactly as specified in §19.
2. Put each PDF at `RAG_OCRv1/data/{document_group_id}/{filename}` on Google Drive, with `filename` identical to the CSV value (extension included).
3. Put the CSV at `RAG_OCRv1/data/data_information.csv`.
4. Make sure `RAG_OCRv1/MonkeyOCR/` holds the MonkeyOCR repo and its `weights/` folder (the OCR notebook copies it to the VM's local disk and skips the copy only if `weights/` already exists there).
5. Put the four helper scripts in `RAG_OCRv1/scripts/`: `general_processor.py`, `general_content_extractor.py`, `html_table_converter.py` and (llm mode only) `llm_table_normalizer.py`.

### 18.3 Step 2: Phase 1a OCR (`phase1_ocr.ipynb`, Colab GPU runtime)

1. Open the notebook in Colab and select a GPU runtime.
2. Run the Drive mount and the install cells. They install pinned packages and replace PyTorch with a CUDA 13 build (§16.4, P6). If Colab asks for a runtime restart after the install cells, restart and continue from the configuration cell (the notebook does not say; this is the usual Colab behaviour).
3. In the configuration cell, set `DOC_GROUP_FILTER` (for example `"panasonic_aircon_CS-PW24KE"`) for a first trial, and leave `LIMIT = None` (P1).
4. Run the MonkeyOCR copy cell. The first run in a session copies the repo and weights to local disk and takes a while.
5. Run the checkpoint-helper, CSV-load and work-list cells. Read the printed work list. A line starting `File not found, skipping:` means the CSV and the Drive folder disagree.
6. Run the OCR loop cell. It prints each page and a summary at the end.
7. Check success: the inspection cell (section 8) shows the file as completed with every page done and none failed, and each `page_N` folder under `output/{CLASSIFICATION}/{group}/{stem}/` holds `page.png` and a markdown file.
8. If pages failed, run the loop cell again. Failed pages are retried; completed pages and files are skipped (§16.8).

Skip the legacy section 9 cell; it bypasses the checkpoint.

### 18.4 Step 3: Phase 1b parse (`phase1_llm_parsing.ipynb`, Colab)

1. Set `TABLE_PARSE_MODE` in the toggle cell: `"text"` (default, recommended until the chunker is checked against the llm format, P4) or `"llm"` (GPU, Qwen). Do not switch modes in the middle of a corpus (P3).
2. Run the Drive mount (`/content/drive`), install and helper-copy cells. A `MISSING:` line means a script is not in `RAG_OCRv1/scripts/`.
3. Run the configuration cell (set `DOC_GROUP_FILTER` for a trial). Skip the LLM-loading cell in text mode.
4. Run the checkpoint cells and the work-list cell. It lists only files whose OCR status is `completed`.
5. Run the extraction cell. For each file it prints `TOC pages: [...]` and `TOC nav check: x/y headings matched`. **Compare the printed TOC pages with the real manual now** (P11, P12): a wrongly flagged page is missing from the output.
6. Check success with section 11 (every file completed, none failed) and section 12 (set the `INSPECT_*` variables and read one page's `processed_content.txt` and `metadata.json`).
7. If a page failed and later succeeded, apply the P2 workaround so the file can complete.

Output: `content_extraction/{CLASSIFICATION}/{group}/{stem}/page_N/{processed_content.txt, metadata.json}` and `toc.json` per file when a TOC was found.

### 18.5 Step 4: copy the results to the PC

- Copy the whole `content_extraction/` folder to the PC and point `EXTRACTION_DIR` at it. Copy `output/` as well if you will register page images and figure crops from it (step 8).
- Avoid downloading a large Drive folder through the browser: it arrives as several zip files and `verify_extraction.py` exists to catch split zips and extraction one level too deep. Drive for desktop or a sync tool avoids that (a suggestion, not something the pipeline requires).
- Keep the destination path short; `verify_extraction.py` also checks for Windows paths over 260 characters.
- `metadata.json` files contain Colab paths (P18). They do not need to exist on the PC for ingestion to work, but expect those strings in the data.

### 18.6 Step 5: configure the PC

1. Create a virtual environment and install the Phase 2 requirements from §20. The Python version used is not recorded anywhere in the files reviewed.
2. Put the Firebase service-account JSON at `server/rag/ragPhase2/serviceAccountKey.json` (or set `FIREBASE_SERVICE_ACCOUNT`; see Trap 13 for the default-path pitfall).
3. Create `.env` from the template in §20. Do not leave any variable present but empty (§7.8).
4. Make sure Qdrant is reachable at `QDRANT_URL` (server 1.19.1 is what v2 was run against; keep `qdrant-client` at 1.18 or later, Trap 5).
5. Run the sanity checks:

```powershell
python -c "from vlm_pipeline.pipeline import DEFAULT_MODEL, DEFAULT_BUCKET, TOKEN_RATE_LIMIT_PER_MIN; print(repr(DEFAULT_MODEL), repr(DEFAULT_BUCKET), TOKEN_RATE_LIMIT_PER_MIN)"
python -c "import PIL, imagehash; print('pHash libraries OK')"
python -c "from vlm_pipeline.pricing import MODEL_PRICING; print(list(MODEL_PRICING))"
```

The third check shows which model names are priced; your `VLM_MODEL` and `VLM_DIAGRAM_MODEL` must be in that list (Trap 19).

### 18.7 Steps 6 and 7: verify and ingest text (README v2)

```powershell
python verify_extraction.py

# trial on one group first
$env:DOC_GROUP_FILTER="panasonic_aircon_CS-PW24KE"
$env:CLASSIFICATION_FILTER="MANUAL"
python ingest_to_qdrant.py
```

`ingest_to_qdrant.py` is the only script allowed to create or recreate the collection (Trap 2). It skips files already in `checkpoint/ingest_checkpoint.json` (key `<group>|<stem>`), so to re-ingest a changed file delete its entry or use a fresh `CHECKPOINT_DIR` (§8.1). Clear the two filter variables (`Remove-Item Env:DOC_GROUP_FILTER`) to ingest everything.

### 18.8 Steps 8 to 11: images

**Step 8 (unknown).** The image flow starts from `ManualImages` Firestore docs and the matching files in Firebase Storage. No code that creates them has been provided. Each doc must have at least `documentGroup`, `filename`, `storagePath` (the Storage object path), `imageName` (`page.png` for whole-page renders, anything else for figure crops) and `pageNum` (a value such as `page_7` or `7`). The OCR notebook produces `page.png` per page; the figure crops are whatever MonkeyOCR writes beside it. Until this step is documented, you cannot run steps 9 to 11 from the notebooks' output alone.

**Step 9: describe (verified in `pipeline.py` and `describe_images.py`)**

```powershell
python describe_images.py --document-group <group> --dry-run      # downloads images, no OpenAI calls (Trap 21)
python describe_images.py --document-group <group> --limit 5      # small paid trial
python describe_images.py --document-group <group>                # full run
python describe_images.py --document-group <group> --report       # read-only breakdown and stored cost
python describe_images.py --document-group <group> --rebuild-review   # regenerate vlm_review/review.html, no OpenAI
```

Before the paid run: confirm both models are priced (Trap 19) and that `VLM_TOKEN_LIMIT_PER_MIN` matches your OpenAI tier (§5.5). Open `vlm_review/review.html` and grade a sample. If the run stops with `out of OpenAI credits`, add credits and re-run the same command (§11).

**Step 10: embed (verified in `embedding.py`; flags from README v2)**

```powershell
python embed_images.py --document-group <group> --dry-run
python embed_images.py --document-group <group>
```

**Step 11: verify (verified in `verify_embedding.py`)**

```powershell
python -m vlm_pipeline.verify_embedding --document-group <group> --verify-qdrant --show-missing
```

Exit code 0 means every described image is embedded and present. Run it from `ragPhase2/` and mind Trap 13 (service-account path).

### 18.9 Steps 12 to 14: retrieval and the app (test harness verified in v3.6; services inferred)

```powershell
$env:QUESTION="What is the cooling capacity?"
$env:DOC_GROUP="panasonic_aircon_CS-PW24KE"
python test_retrieval.py
```

Inspect `last_retrieval_prompt.txt` and `last_retrieval_debug.json`. In the app, call `RetrievalPipeline().retrieve(question, document_group_id, chunk_types=["child","table","image"])` and send `result.build_prompt(question)` to your LLM (§3.7). The start commands for Express, the FastAPI retrieval service and the Expo app are in §3.7 (inferred from `.env` comments; those files were not provided).

### 18.10 Step 13: backfills

TOC (verified, §23): run after step 10, and again after any ingest, `embed_images.py --force` or collection migration (Trap 23):

```powershell
python backfill_toc_sections.py --group <group>            # audit first
python backfill_toc_sections.py --group <group> --write
```

Read the audit before writing (§23.3). Restart the retrieval service afterwards or wait 10 minutes (Trap 24). A classification backfill is still unseen and §13 is a design.

### 18.11 Re-run and resume rules

| Stage | What marks work as done | How to redo it |
| --- | --- | --- |
| OCR notebook | `completed_pages` and file `status` in `ocr_checkpoint.json` | Remove the page or file entry from the checkpoint (§16.8) |
| Parse notebook | `completed_pages` and file `status` in `content_extraction_checkpoint.json` | Remove the file or page entry; apply the P2 workaround first if a page once failed |
| Ingest | `<group>\|<stem>` in `ingest_checkpoint.json` | Remove the entry, or use a fresh `CHECKPOINT_DIR` |
| Describe | `vlmStatus` on each Firestore doc | `--force`, or `--only-tag T1,T2` to re-tag |
| Embed | `qdrantStatus` on each Firestore doc | `--force` |
| TOC backfill | the `toc_*` payload values themselves, compared on every run | re-run; `--force` rewrites everything (§23.3) |

### 18.12 Adding one new manual: the short version

1. Add its rows to the CSV and upload the PDFs and CSV to Drive.
2. Run the OCR notebook with `DOC_GROUP_FILTER` set to the new group, then the parse notebook the same way. Check the TOC pages it printed.
3. Copy the new `content_extraction` folders to the PC; run `verify_extraction.py`.
4. Run `ingest_to_qdrant.py` with `DOC_GROUP_FILTER` set to the group.
5. Register its images (step 8), then run describe, embed and verify for that group.
6. Run `test_retrieval.py` with a question you know the answer to.
7. Run `python backfill_toc_sections.py --group <group>`, read the audit, then add `--write`. Do this after ingest and after embed, never before. Run any classification backfill too (none seen).

### 18.13 What still blocks a complete runbook

- Step 8 (how images reach Firebase and become `ManualImages` docs).
- A classification backfill (step 13). The TOC backfill is documented in §23.
- The app-side files (`server.js`, `retrieval_service.py`, the Expo app) and the meaning of `MAX_RETRIEVAL_ROUNDS` (§24.4, E9).
- The Python version (the chunk-size defaults are now known, §22.2).

## 19. data\_information.csv: what to provide (v3.3)

### 19.1 What it is and who reads it

One CSV, one row per PDF, stored at `RAG_OCRv1/data/data_information.csv`. It is read by both Phase 1 notebooks: the OCR notebook builds its work list from it, and the parse notebook looks up each file's row by `(document_group_id, stem of filename)` and hands the row to the extractor, which writes the optional fields into every page's `metadata.json`. No Phase 2 script reads the CSV; Phase 2 sees its values only through `metadata.json` (and the folder names).

### 19.2 Columns

| Column | Required | Meaning and use | Rules |
| --- | --- | --- | --- |
| `document_group_id` | Yes | Names a manual set or product. It is the folder under `data/`, part of every output path, and becomes `document_group_id` in Qdrant and `documentGroup` in Firestore. Several PDFs can share one group. | Exact spelling and case must match on every row of the group and the folder name. Must not contain `\|`. Avoid spaces. |
| `filename` | Yes | The PDF file name including `.pdf`. `Path(filename).stem` becomes the folder name and the `filename` field in metadata. | Must equal the file at `data/{document_group_id}/{filename}`, character for character. Keep the stem unique within a group. |
| `classification` | Yes | A category such as `MANUAL`. It is trimmed and upper-cased on load and becomes a folder name in `output/` and `content_extraction/`, a field in every `metadata.json`, and the `CLASSIFICATION_FILTER` value. | Must not contain `\|`. Spell consistently; `manual` and `MANUAL` are the same, `MANUALS` is different. |
| `category_level_1` | No | Carried into `metadata.json` and the Qdrant payload. | Free text. |
| `category_level_2` | No | As above. | Free text. |
| `model_number` | No | Carried into `metadata.json` as a string; the Qdrant payload type is a list (§6.2). | Several models in one cell are split on commas into the payload list (`vector_store._build_payload`); put the whole cell in quotes. |
| `date_added` | No | Carried as a string. Ingest normalises it: `dd/mm/yyyy` and `YYYY-MM-DD` are accepted, anything else is kept as typed with a warning (v3.4, I8). | Use `YYYY-MM-DD`. Avoid `mm/dd/yyyy`: it is silently read as `dd/mm/yyyy`. |
| `notes` | No | Free text carried into metadata. | Quote the cell if it contains commas. Avoid line breaks. |

An optional column that is blank for a row is left out of that file's metadata entirely. Any extra columns are ignored.

### 19.3 Rules and what breaks if they are not followed

- **Header row and names.** The header must be present and the three required names must match exactly (lowercase, underscores). Header names are not trimmed. A missing required column stops the OCR notebook with `CSV is missing required columns`.
- **Encoding.** Save as plain UTF-8. Excel's "CSV UTF-8" adds a byte-order mark; most current pandas versions strip it, but if the notebook reports a missing column while all three are visibly there, a BOM on the first header is the likely cause.
- **Whitespace and case.** Cell values are stripped. `classification` is upper-cased. `document_group_id` and `filename` are not case-folded, and Drive paths are case-sensitive, so a case mismatch produces `File not found, skipping:` and the row is silently not processed.
- **Pipe character.** The checkpoint key is `<group>|<CLASSIFICATION>|<stem>` and is split with `split("|", 2)`, so `document_group_id` and `classification` must not contain `|`.
- **Duplicate identity.** The parse notebook's lookup is keyed by `(document_group_id, stem)` only and ignores classification, while output folders include the classification. Two rows with the same group and stem (for example under two classifications) share one lookup entry, and the last row wins for the metadata. Keep each `(group, stem)` pair unique.
- **Rows and outputs are independent.** Deleting a row does not delete anything already produced. Editing a value after extraction does not change existing `metadata.json` files; fix them by re-extracting (§16.8) or by a backfill (§13).
- **`LIMIT` and filters.** Both notebooks filter by `DOC_GROUP_FILTER` and `CLASSIFICATION_FILTER` (the latter compared in upper case). `LIMIT` in the OCR notebook counts groups but behaves oddly (P1).
- **Images do not get these fields automatically.** Nothing copies `classification` or the category fields onto `ManualImages` docs, which is the gap behind §10 #6 and §13.

### 19.4 Example

The first row uses the group and file named in the notebooks' legacy cell; the category values and the second row are illustrative placeholders.

```csv
document_group_id,filename,classification,category_level_1,category_level_2,model_number,date_added,notes
panasonic_aircon_CS-PW24KE,CS-PW24KE_service_manual_PHAAM0810057C2.pdf,MANUAL,Air conditioner,Split system,CS-PW24KE,2026-11-24,Service manual
panasonic_aircon_CS-PW24KE,EXAMPLE_second_file.pdf,MANUAL,Air conditioner,Split system,CS-PW24KE,2026-11-24,"Placeholder row, comma inside quotes"
```

### 19.5 Check before you run

1. The header has the three required columns, spelled exactly.
2. Every `filename` exists at `data/{document_group_id}/{filename}` with the same spelling and case.
3. No `|` in `document_group_id` or `classification`.
4. Every `(document_group_id, filename stem)` pair appears once.
5. `classification` values use one consistent spelling.
6. Several models in one `model_number` cell are separated by commas and the cell is quoted.
7. The file opens as UTF-8 text and every row has the same number of fields (check cells with commas or quotes).
8. The CSV is in `data/`, not in a group folder.

## 20. Dependencies and configuration (v3.3)

### 20.1 Four environments

| Environment | Where | Installed how |
| --- | --- | --- |
| Phase 1a OCR | Colab GPU | `!pip` cells inside `phase1_ocr.ipynb` (§20.2) |
| Phase 1b parse | Colab | `!pip` cells inside `phase1_llm_parsing.ipynb` (§20.3) |
| Phase 2 | Your PC | `requirements.txt` (§20.4) and `.env` (§20.5) |
| Phase 1 on a PC | Planned, not built | Requirement sets to be derived in §21 |

### 20.2 Colab OCR (exactly as the notebook installs them)

```text
transformers==4.57.6
lmdeploy==0.9.2
pypdfium2==5.6.0
pdf2image==1.17.0
boto3
fitz
PyMuPDF==1.24.14
loguru
pdfminer
pdfminer.six
pandas==2.2.2
protobuf==5.29.6
pillow==11.3.0
psutil==5.9.5
fast_langdetect
qwen-vl-utils

# separate cells, in this order
paddlepaddle-gpu==3.3.0        (index: https://www.paddlepaddle.org.cn/packages/stable/cu130/)
paddlex
# uninstall torch torchvision torchaudio triton, then:
torch==2.10.0+cu130
torchvision==0.25.0+cu130
torchaudio==2.10.0+cu130       (index: https://download.pytorch.org/whl/cu130)

# later cell, after the OCR loop
PyMuPDF==1.27.2.2
```

See P6: `fitz` (a different PyPI project) and `PyMuPDF` are both installed, and the final PyMuPDF pin comes after the loop that already used it. Colab already provides `google.colab`, `tqdm` and `pandas`; MonkeyOCR itself is the cloned repo plus its weights, not a pip package.

### 20.3 Colab parse

```text
beautifulsoup4
pandas
tqdm

# llm mode only
transformers
accelerate
huggingface_hub
safetensors
# plus torch (provided by the Colab GPU image) and the model Qwen/Qwen3.5-4B downloaded from HuggingFace
```

Nothing here is version-pinned in the notebook.

### 20.4 Phase 2 on the PC: proposed requirements.txt

Compiled from the imports in the reviewed files and from README v2. It has not been tested by installing into a clean environment, and only `qdrant-client` has a known version constraint (Trap 5). After a successful full smoke test, run `pip freeze > requirements.lock.txt` and keep that as the pinned record.

```text
# Phase 2: text + image ingestion, retrieval
firebase-admin
openai
python-dotenv
Pillow
imagehash
qdrant-client>=1.18
FlagEmbedding
sentence-transformers
torch
numpy
nltk                                  # optional: needs its punkt data, otherwise a regex splitter is used

# optional, only if DEVICE=dml
# torch-directml
```

| Package | Needed because |
| --- | --- |
| `firebase-admin` | `firebase_client.py` imports `firebase_admin` (Firestore and Storage) |
| `openai` | `pipeline.py` creates the OpenAI client |
| `python-dotenv` | `load_dotenv()` in `firebase_client.py`, `pipeline.py`, `verify_embedding.py` |
| `Pillow`, `imagehash` | `dedup.py` and `image_info.py` |
| `qdrant-client` | `vector_store.py` (version ≥ 1.18, Trap 5) |
| `FlagEmbedding` | `embedder.py` (BGE-M3, dense plus sparse) per README v2 |
| `sentence-transformers` | `chunker.py` loads a `SentenceTransformer` per README v2 |
| `torch`, `numpy` | model runtime and vector handling; install the PyTorch build that matches your hardware (CPU, CUDA, or DirectML) |
| `torch-directml` | only when `DEVICE=dml` (README v2 §5.2) |

`pandas`, `beautifulsoup4` and `tqdm` are Phase 1 packages and are not imported by the Phase 2 files reviewed.

### 20.5 `.env` template (rewritten in v3.6 from §7.9)

Values in angle brackets must be filled in. Never leave a variable present but empty (§7.8), never define one twice (Trap 27), and never commit this file or paste it anywhere: it holds secrets. Add `.env` and your service-account JSON to `.gitignore`, and keep the service-account file out of folders such as Downloads.

```text
# ===== Phase 2 (ragPhase2/) =====

# --- text ingestion ---
EXTRACTION_DIR=<path to the copied content_extraction folder>
CHECKPOINT_DIR=./checkpoint
# DOC_GROUP_FILTER=<only to limit a run>
# CLASSIFICATION_FILTER=MANUAL
# LIMIT=<max unique document groups>
EMBED_DIM=1024                       # must match DENSE_EMBED_MODEL (1024 for BAAI/bge-m3)

# --- chunking (the values below are the built-in defaults; set them only to change them) ---
EMBEDDING_MODEL=BAAI/bge-m3          # boundary-detection model
PARENT_CHUNK_SIZE=1500
CHILD_CHUNK_SIZE=400
CHILD_OVERLAP=80
MIN_CHUNK_SIZE=50
SEMANTIC_BOUNDARY_THRESHOLD=0.65

# --- embedding (all five REQUIRED by embedder.py) ---
DENSE_EMBED_MODEL=BAAI/bge-m3
MODEL_LOCAL_PATH=<absolute path to the model folder, see I9>
DEVICE=cpu                           # cpu, cuda or dml (dml needs torch-directml)
EMBED_BATCH_SIZE=<integer, for example 4>
USE_FP16=false                       # true is rejected with DEVICE=dml
# EMBED_SUPERBATCH_SIZE=50           # image flow only

# --- Qdrant ---
QDRANT_URL=<http://host:6333 or your cloud URL>
QDRANT_API_KEY=<secret; required by backfill_toc_sections.py and by cloud Qdrant>
# QDRANT_COLLECTION=text_chunks_general

# --- retrieval ---
RETRIEVAL_TOP_K=5
RETRIEVAL_SCORE_MIN=0.0              # NOT a cosine value in hybrid mode; 0.5 can drop everything (I12)
RETRIEVAL_HYDRATE_PARENTS=true
# section expansion (all optional; built-in defaults; never leave one empty, §7.8)
# RETRIEVAL_IMAGE_FLOOR=4
# SECTION_SEED_HITS=1
# SECTION_MAX_DOCS=2
# SECTION_MAX_PARENTS=3
# SECTION_MAX_PAGES=8
# SECTION_MAX_CHARS=60000
# SECTION_NEIGHBOR_PAGES=1
# SECTION_CATALOG_TTL=600

# --- Firebase and VLM ---
FIREBASE_SERVICE_ACCOUNT=<absolute path to the service-account JSON>
FIREBASE_BUCKET=<your-project>.firebasestorage.app
OPENAI_API_KEY=<secret>
VLM_MODEL=gpt-4o-mini                # classify model (gpt-6-luna is cheaper, §5.9)
VLM_DIAGRAM_MODEL=gpt-6-sol          # detail-pass model
VLM_TOKEN_LIMIT_PER_MIN=60000        # set to your real OpenAI tier
VLM_TOKEN_ESTIMATE=1200

# --- only if the scripts run from another folder ---
# RAG_PIPELINE_PATH=<absolute path to ragPhase2>

# --- test_retrieval.py only (set per run with $env:, not here) ---
# QUESTION, DOC_GROUP, CLASSIFICATION, CATEGORY_1, CATEGORY_2

# ===== App side (read by code that was not provided; names from a real .env) =====
# RETRIEVAL_SERVICE_URL=http://localhost:8001   # Express -> FastAPI retrieval service
# PORT=8000                                      # Express
# MAX_RETRIEVAL_ROUNDS=<see E9 before setting>
# EXPO_PUBLIC_API_URL=https://<host>/api         # Expo app; public by design, no secrets
# API_BASE_URL=http://localhost:8000/api         # local alternative
```

Notes: both VLM model names must exist in `pricing.MODEL_PRICING` (Trap 19). `FIREBASE_BUCKET` defaults to the old project's bucket in `embedding.py`, `pipeline.py` and `retrieval_pipeline.py`, so set it explicitly for any other project. PowerShell `$env:` assignments in a session override `.env` for that session only. The chunk sizes in effect when a collection was built are not recorded in the payload (derived), so write down the values you ingested with and reuse them for every later ingest (E5).

## 21. Planned work: Phase 1 on a normal PC (not started)

Status: **planned, nothing built.** Today Phase 1 only runs in Colab. This section records what a PC version has to change, so the work can start from facts instead of from the notebooks again. It is a proposal, not a description of existing code.

### 21.1 Goal

Run OCR and parsing from a command line on a PC, producing the same `output/` and `content_extraction/` trees and the same checkpoint formats as the notebooks, so a manual processed in Colab and one processed on the PC are interchangeable for Phase 2.

### 21.2 What is Colab-specific today (from the notebooks)

- **OCR notebook:** `google.colab.drive.mount` at `/content/mydrive`; every path under `/content`; `!pip install` and `!git clone` cells; copying MonkeyOCR and its weights from Drive to the VM's local disk each session; CUDA 13 wheels (`cu130`) for PyTorch and PaddlePaddle; one `subprocess` call of `python parse.py` per page with the MonkeyOCR folder as working directory; emoji in printed messages.
- **Parse notebook:** Drive mount at `/content/drive` (a different mount name); helper scripts copied to `/content/rag_scripts` and put on `sys.path`; the Qwen model cached under `/content/model_cache`; notebook-style `tqdm`.
- **Helper scripts:** platform-neutral (`pathlib`, `BeautifulSoup`, explicit UTF-8 reads and writes). Their printed arrows and dashes can still fail on a Windows console that is not UTF-8 (the same problem as Trap 6).
- **Baked-in paths:** `metadata.json` stores absolute paths from the machine that ran it (P18).

### 21.3 Proposed shape

1. Keep the four helper scripts unchanged at first.
2. Add a small `phase1/` package with: a config module (read the same names Phase 2 already uses, `DOC_GROUP_FILTER`, `CLASSIFICATION_FILTER`, `LIMIT`, `CHECKPOINT_DIR`, plus input and output folders), a common module (CSV loading and validation, checkpoint read and write copied from the notebooks), `phase1_ocr.py`, `phase1_parse.py`, and a thin `phase1_run.py` that runs both and then `verify_extraction.py`.
3. Keep the folder layout and checkpoint JSON formats exactly as in §16, so Colab and PC runs can share one tree.
4. Run the CSV checklist from §19.5 in code before any work starts, and fail fast with a clear message.
5. Print with ASCII or force UTF-8 output.

### 21.4 Suggested order of work

| Stage | Work | Risk |
| --- | --- | --- |
| A | Port the parse notebook to `phase1_parse.py` in text mode. CPU only; needs `beautifulsoup4`, `pandas`, `tqdm`. | Low |
| B | Decide OCR placement. If the PC has a suitable NVIDIA GPU and MonkeyOCR runs on its operating system, port the OCR notebook. If not, keep OCR in Colab and sync `output/` and `ocr_checkpoint.json` to the PC. | Medium to high; MonkeyOCR on Windows is unverified |
| C | Add `phase1_run.py`, the CSV validation and the verify step. | Low |
| D | Optional: llm table mode on a local GPU. | Medium |

### 21.5 Problems to fix while porting

From the findings above, so the port does not copy them: `LIMIT` counting (P1), stale `failed_pages` blocking completion (P2), mode switching mid-corpus (P3), TOC false positives and narrow heading extraction (P11, P12), empty `tables[].normalised` in text mode (P13), data lost on a failed llm table and truncation at 512 tokens (P14, P15), per-page-only cleaning (P16), absolute paths in metadata (P18), the model start-up cost of one MonkeyOCR process per page (P5), and the inconsistent mount paths and dependency pins (P6, P7).

### 21.6 Acceptance checks

1. Run one small group through Colab and through the PC from the same CSV and PDFs.
2. Compare the two `content_extraction` trees: `processed_content.txt` files should match except for anything intentionally changed; `metadata.json` should match except for paths.
3. `verify_extraction.py` passes on the PC output.
4. `ingest_to_qdrant.py` ingests the PC output with no change to Phase 2.
5. Re-running either script resumes without redoing completed pages.

### 21.7 Open questions before starting

- Does the PC have an NVIDIA GPU, and what operating system will it run? (Decides stage B.)
- Should `metadata.json` keep absolute paths, use paths relative to the extraction root, or drop them? Answered in v3.4 (§22.4): retrieval builds Storage image URLs from the part of `abs_path` and `page_image_path` after `output/`, so keep that segment or change `build_url`.
- Should the port also register page images and figure crops in Firebase (step 8 in §18), since that step is currently undocumented?
- Which Python version and which MonkeyOCR commit are known to work together? Neither is recorded.

## 22. Source review, round 4 (v3.4): the Phase 2 core files

### 22.1 What was reviewed and what is still missing

| Files | Status |
| --- | --- |
| `ingest_to_qdrant.py`, `chunker.py`, `embedder.py`, `vector_store.py`, `embed_images.py`, `verify_extraction.py` | Read in full and checked against v2 (details in §22.2–§22.5; corrections in §22.6; findings I1–I18 in §22.7). |
| `retrieval_pipeline.py` | Read in full. **It is newer than the version v2 described**: it now calls `section_expansion` and no longer has the commented-out TOC filter (§22.4). |
| `describe_images.py`, `test_retrieval.py` | Not provided in v3.4. **Provided and reviewed in v3.6, see §24.** |
| `section_expansion.py`, `backfill_toc_sections.py` | **Referenced by `retrieval_pipeline.py` but not provided.** `backfill_toc_sections.py` is the TOC backfill (§22.8). |
| The code that registers `ManualImages` docs, any classification backfill, `docs/SETUP.md`, `vlm_pipeline/__init__.py` | Not provided. |

> v3.5: `section_expansion.py` and `backfill_toc_sections.py`, listed above as not provided, were reviewed in full in §23.

### 22.2 ingest\_to\_qdrant.py and chunker.py: how text becomes chunks (source-verified)

**ingest\_to\_qdrant.py: configuration.** `EXTRACTION_DIR` (default `./content_extraction`), checkpoint at `CHECKPOINT_DIR/ingest_checkpoint.json` (default `./checkpoint`), `LIMIT` (`int(os.getenv("LIMIT","0")) or None`, so set-but-empty raises `ValueError`), `DOC_GROUP_FILTER`, `CLASSIFICATION_FILTER` (compared case-insensitively; the group filter is an exact match), and `EMBED_DIM = int(os.getenv("EMBED_DIM"))` at import (unset gives an unhelpful `TypeError`). Output is forced to UTF-8 (Trap 6). The script imports `chunker`, `embedder` and `vector_store` as flat modules after putting its own folder on `sys.path`. It has no command-line flags.

**Order of operations.** Build `IntelligentChunker`, `Embedder` and `VectorStore`; call `vector_store.ensure_collection(embedding_dim=EMBED_DIM)` (on every run, see Trap 2); load the checkpoint; walk `EXTRACTION_DIR` (classification folder, then group, then stem folder, which must contain at least one `page_*` folder). Then for each file not already in `done`:

1. `_load_file_units` loads each page: reads `processed_content.txt`, keeps only the text after the first `CONTENT:` line (so the five header lines are stripped), skips the page if that text is empty or either file is missing, loads `metadata.json`, and normalises `date_added` (`normalize_date`: tries `dd/mm/yyyy`, then `YYYY-MM-DD`; any other format is kept as typed with a warning).
2. Each page becomes a `ContentUnit` whose `content_type` is `"table"` when at least two stripped lines start with ` [Row  `, otherwise `"text"`.
3. `chunker.chunk_content_units(units)` runs on the whole file's pages at once.
4. Children and tables are embedded together in one `embed_chunks` call, then upserted: children, then tables, then parent payloads.
5. `_mark_done` writes the checkpoint entry: `document_group_id`, `filename` (stem), `classification`, `n_parents`, `n_children`, `n_tables`, `timestamp`.

An exception marks the file in the checkpoint's `failed` dict (message cut to 300 characters) and the loop continues. Only `done` entries are skipped on later runs, so failed files retry; `failed` entries are never removed after a later success. A file that yields no units is logged and neither marked done nor failed, so it is re-scanned on every run. The checkpoint is `{last_updated, done{}, failed{}}` keyed `<group>|<stem>` (classification is not in the key).

`LIMIT` counts document groups but breaks right after adding the first file of the Nth group, so only that group's first file is included (the same behaviour as P1).

**chunker.py: configuration.** Defaults are built in: `PARENT_CHUNK_SIZE` 1500, `CHILD_CHUNK_SIZE` 400, `CHILD_OVERLAP` 80, `MIN_CHUNK_SIZE` 50, `SEMANTIC_BOUNDARY_THRESHOLD` 0.65 (must be between 0 and 1). `EMBEDDING_MODEL` is required, `DEVICE` defaults to `cpu`, and `EMBED_BATCH_SIZE` is required (no default) because the boundary embedding call reads it. The module imports `torch` at load time and replaces `torch.inference_mode` with `torch.no_grad` for the whole process (I18). Optional packages: `nltk` (sentence splitting; falls back to a regex split on `.`, `!`, `?` followed by whitespace and a capital letter when NLTK or its punkt data is missing) and `sentence-transformers` (required; the constructor raises without it). The boundary model is loaded with `cache_folder=os.getenv("MODEL_LOCAL_PATH")` exactly as written, so a relative path resolves against the current directory (I9), and `max_seq_length` is set to 256.

**chunker.py: what it actually does**

- **Segmentation.** `_ROW_RE = ^\[Row \d+\]` is tested against each stripped line. If the unit's `content_type` is `table` and it has any row line, the entire page text becomes one table segment. If it has no row line, it is one text segment. Only a page with exactly one row line takes the mixed path that splits alternating text and table runs. Because ingest marks any page with two or more row lines as `table`, the mixed path is rarely reached (I2).
- **Tables.** One chunk per table segment, `chunk_type="table"`, `chunking_strategy="fixed_table"`, with `row_count`. Its metadata is the page's full `metadata.json`.
- **Parents.** All text segments of the file are split into sentences (across pages), all sentences are embedded in one batch with `normalize_embeddings=True`, and a boundary is placed wherever the cosine similarity to the previous sentence is below the threshold (a zero-length vector also forces a boundary). A parent is also cut once its text reaches `PARENT_CHUNK_SIZE` characters, so it can exceed that by up to one sentence. Nothing forces a break at a page boundary, so a parent can span pages; its `page` is the page of its first sentence (I5). A parent shorter than `MIN_CHUNK_SIZE` is discarded, and its text is not stored anywhere unless the whole page ends up with no chunks (I6).
- **Children.** A parent no longer than `CHILD_CHUNK_SIZE` becomes one child; otherwise word-boundary windows of `CHILD_CHUNK_SIZE` characters with up to `CHILD_OVERLAP` characters carried over. Children whose id repeats are dropped.
- **Ids.** `md5(f"{text[:120]}_{page}_{chunk_type}").hexdigest()[:16]` (underscores between the parts). Only the first 120 characters count (I7).
- **Page fallback.** Any page with no parent, child or table chunk gets one child holding its text (or `[Page N]` when empty), `chunking_strategy="page_fallback"`, `parent_id` empty. This is why a `[EMPTY AFTER CLEANING]` page still produces a stored chunk (I4).
- **Payload.** Every chunk copies the page's whole metadata, including the full `images` and `tables` lists (I17).

### 22.3 embedder.py and vector\_store.py (source-verified)

**embedder.py**

- All five settings are hard-required with no default, despite the docstring: `DENSE_EMBED_MODEL`, `MODEL_LOCAL_PATH`, `DEVICE` (`cpu`, `cuda` or `dml`, lower-cased), `EMBED_BATCH_SIZE`, `USE_FP16` (`true/1/yes/on` or `false/0/no/off`; `true` with `dml` raises).
- A relative `MODEL_LOCAL_PATH` is resolved against the "project root", found by walking up from `embedder.py` until a folder containing a `.env` file, a `.git` entry or a `requirements.txt` is found (error if none). It then creates that folder. The chunker does not do this (I9).
- Loading: `BGEM3FlagModel(model_name, devices=<"cpu" | "cuda:0" | torch_directml device string>, use_fp16, cache_dir=...)`, followed by a one-sentence test encode that fixes `embedding_dim`. With `DEVICE=dml`, any failure falls back to CPU with a warning, and `active_device` records what was really used. The module also disables transformers' `check_torch_load_is_safe` (the comment says it was needed for DirectML).
- `embed_chunks` encodes dense and sparse (no ColBERT), writes `embedding` (list of floats), `sparse_embedding` (`{indices, values}` from the lexical weights) and `embedding_model`, `embedding_dim`, `embedding_backend` (`FlagEmbedding[<device>]`) into each chunk's metadata, and returns the same list. `embed_query` returns `{dense: ndarray, sparse: {...}}`.

**vector\_store.py**

- **Collection:** `QDRANT_COLLECTION` (default `text_chunks_general`). `ensure_collection` compares only the dense dimension and whether sparse vectors exist (not the distance metric); a mismatch deletes and recreates the collection. New collections get a named `dense` vector (cosine) and a `sparse` vector.
- **Payload indexes** are created only for keyword fields `document_group_id`, `filename`, `classification`, `category_level_1`, `category_level_2`, `model_number`, `chunk_type`, `content_type`, and the integer field `page`. `date_added` and the `toc_*` fields are not indexed (I14).
- **Points:** id is `int(md5(chunk_id)[:15], 16)`; chunks without a dense vector are skipped with a warning; a sparse vector is attached only when it has indices; upserts go in batches of 100 with `wait=True`. Parents are written with a zero dense vector (no sparse) and `is_parent_store=True`.
- **`search`:** filters are exact matches (`model_number` uses `MatchAny` on the stored list). Modes: `dense`; `sparse` (returns `[]` when the query has no lexical weights); `hybrid`, which prefetches dense and sparse with `limit = max(limit*4, 20)` each, applies the filter in both prefetches and the outer query, and fuses with RRF. `score_threshold` is passed through, so in hybrid mode it is compared with fused RRF scores, not cosine similarity (I12).
- **`_build_payload`:** the field list in §6.2 is confirmed. `model_number` is split on commas into a list. `content_type` defaults to `text`. `images` and `tables` are copied as given. `toc_page_nums`, `use_toc_nav` and `toc_headings` are copied from the metadata, and **there is no `toc_section` field in this builder** (it is written later by the TOC backfill, §22.8). `None` values are dropped, and `ingested_at` is the current local time.
- **Helpers:** `get_known_filters` and `list_document_groups` scroll the entire collection (I15). `extract_filters` still has no `self` (§10 #1). `delete_document_group` calls `client.delete(..., points_filter=...)`; `points_filter` is not a parameter of `QdrantClient.delete` in the versions I know (it takes `points_selector`), so it very likely raises `TypeError`, and it returns 0 regardless (I11). Not run.

### 22.4 retrieval\_pipeline.py (the uploaded, newer version)

**What changed from the version v2 described.** The old `_toc_section_for_query`, the commented-out `_filter_by_toc_section`, `_build_firebase_url` and the `DEBUG: page.png fallback` print are gone. The retrieve flow now has a type-floor merge and a section-expansion step. The file imports `expand_sections` and `merge_with_type_floor` from `section_expansion` (relative import first, then flat), and that module was reviewed in v3.5 (§23).

**Configuration.** `RETRIEVAL_TOP_K` (5), `RETRIEVAL_SCORE_MIN` (0.0), `RETRIEVAL_HYDRATE_PARENTS` (true; `1`, `true`, `yes` count as true). The module docstring also names `RETRIEVAL_IMAGE_FLOOR` (default 4, extra image hits kept after the merge), `SECTION_MAX_PARENTS` (3, sections expanded per document), `SECTION_MAX_PAGES` (8, pages kept per section) and `SECTION_MAX_CHARS` (60000, cap on text added by expansion); those are read in `section_expansion.py`; the defaults are verified in v3.5 (§7.5, §23.6). A module-level `FIREBASE_BUCKET = os.getenv("FIREBASE_BUCKET", "rbacfyp.firebasestorage.app")` is a third hardcoded fallback (§7.8). Its docstring still says `MODEL_LOCAL_PATH` points at `BAAI/bge-base-en-v1.5`, which is stale.

**`retrieve(question, document_group_id, date_added, filename, classification, category_level_1, category_level_2, model_number, top_k, score_min, chunk_types)`**

1. Embed the query once.
2. For each chunk type (default `child`, `table`, `image`) run a hybrid search with the given filters. The per-type limit is `top_k`, or `top_k * 3` for images (image chunks score lower, so they get more candidates). `score_threshold` is passed only when `score_min > 0` (I12).
3. **Agreement hits:** for each type run a dense-only and a sparse-only search with limit `top_k`; any dense hit that is also in the sparse top-k is added if fusion dropped it.
4. **`merge_with_type_floor(raw_hits, k)`:** keeps the top-k children and tables plus the top few images, so scores near 1.0 cannot crowd out every image.
5. **`expand_sections(vs, raw_hits, question, document_group_id, filename)`:** adds the non-child chunks (parents, tables, images) of the section or sections the question is about, in page order, with score 0 (§23.6). It needs the `toc_*` payload fields written by `backfill_toc_sections.py`; with none present it falls back to the pages either side of the best hit.
6. **Context blocks:** each hit becomes a `ContextBlock`, de-duplicated by chunk id. For a child, its parent is fetched once and inserted before it as a block with score 0 and type `parent`.
7. **Output:** `context_str` is numbered blocks, each with a header `[i] [type] page N — group / filename` and a score line: `score: 0.xxx`, `(context parent)`, or `(same section, page order)`. `sources` are unique (group, filename, page) triples with image links. `toc_section` is the first hit payload that has a `toc_section`.

`build_prompt` is unchanged (the same default system prompt, a `[Best match is in section: ...]` note when `toc_section` is set, then `=== CONTEXT ===`, `=== QUESTION ===`, `=== ANSWER ===`).

**Image links depend on the Phase 1 folder name.** `_enrich_sources_with_images` uses an image's own `url` when present (VLM image points always have one). Otherwise it rebuilds a Storage URL from `abs_path` or `src_path`, or from `page_image_path` for pages with no listed images, but only when the path starts with `output/` or contains `/output/`; it keeps the part from `output/` onward and builds `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path with / as %2F>?alt=media`. So the Colab paths stored by Phase 1 (§17.4, P18) are used downstream, and they imply the Storage objects mirror the OCR tree, `output/{CLASSIFICATION}/{group}/{stem}/page_N/...` (an inference; the upload step has not been seen). Do not rewrite those paths or rename the `output` folder without changing this function.

### 22.5 embed\_images.py and verify\_extraction.py (source-verified)

**embed\_images.py** is a thin command-line wrapper over `vlm_pipeline.embedding` (§5.13). Flags: `--document-group`, `--max-pages`, `--limit`, `--dry-run`, `--force`, `--report`, `--service-account` (default `env_path("FIREBASE_SERVICE_ACCOUNT", "../serviceAccountKey.json")`, so Trap 13 applies here too) and `--bucket` (default `DEFAULT_BUCKET`). With no `--document-group` it processes every described image across all manuals. It prints a summary of the counters (§5.13) and, with `--report`, prints the `qdrantStatus` breakdown and exits. The docstring's `RAG_PIPELINE_PATH` advice only matters when the script is run from outside `ragPhase2/`: Python puts the script's own folder first on the import path, so `embedder.py` and `vector_store.py` are found without it. The docstring's "retrieval defaults to child and table only" note is stale.

**verify\_extraction.py**

- Reads `EXTRACTION_DIR` after trimming whitespace and surrounding quotes; unset or empty fails with a message (it refers to a `docs/SETUP.md` that was not provided).
- Fails if the path does not exist, if a nested `content_extraction` folder sits inside it (the "zip extracted one level too deep" case), if there are no classification folders, or if there are no `page_*` folders at all.
- Walks classification, group, stem and `page_*`; counts pages and pages that have both files; warns for each page missing `processed_content.txt` or `metadata.json`, and for paths longer than 260 characters after `resolve()`.
- **Any warning also makes the exit code 1.** It prints `OK - safe to ingest.` and exits 0 only when nothing was flagged.
- It does not check `toc.json`, does not validate JSON, and does not look at page text, so empty or placeholder pages pass. Its docstring example shows `.venv\Scripts\python.exe server\rag\ragPhase2\verify_extraction.py`, which suggests `.env` and `.venv` sit at the repository root rather than inside `ragPhase2/`.

### 22.6 Corrections to earlier sections from this round

Corrected in place in the sections named: §6.2 is unchanged but see §22.3; §15.3 (payload defaults now known), §16.5 and §16.7 (the P4 and P17 sentences), §17.4 (P22), §19.2–§19.5 (`date_added` and `model_number`), §20.4 and §20.5 (`nltk`, chunk-size defaults), §18.1, §18.10 and §18.13 (the TOC backfill), and the Trap 7 heading.

Noted here only:

1. **§4.1 chunk ids:** the id is `md5(f"{text[:120]}_{page}_{chunk_type}")[:16]`, with underscores between the parts.
2. **§4.1 segmentation:** pages with two or more ` [Row  ` lines are one whole-page table chunk (I2); parents are built across the whole file and can span pages (I5).
3. **§4.3 and §5.4 retrieval flow:** replaced by §22.4 (type-floor merge, section expansion, new env variables). The "sort by score, cap at top\_k" step no longer exists.
4. **§7.2 chunking defaults:** 1500 / 400 / 80 / 50 / 0.65 are the code defaults; the "400/500", "80/100" and "50/30" pairs in v2 are not both in use.
5. **§9 Trap 7:** obsolete for the uploaded retrieval file; see §22.8.
6. **§10:** #2 (`_build_firebase_url`), #3 (the debug print) and #5's retrieval docstring item are resolved in the uploaded `retrieval_pipeline.py`; #1 (`extract_filters` without `self`) and #7 (the import fallback) still apply; #4 concerns `test_retrieval.py`, which was not provided. Docstrings in `ingest_to_qdrant.py`, `embedder.py`, `retrieval_pipeline.py` and `embed_images.py` still name `bge-base-en-v1.5` or stale defaults; the real model is whatever `DENSE_EMBED_MODEL` and `EMBEDDING_MODEL` say.
7. **§13 and §15.3:** image points get `category_level_1`/`category_level_2` as empty strings, `model_number` as an empty list and `date_added` as an empty string (§22.7, I13).
8. **§7.7 `RAG_PIPELINE_PATH`:** not needed when scripts run from `ragPhase2/` (§22.5).

### 22.7 New findings I1–I18

- **I1: `LIMIT` in ingest has the same first-file-of-last-group behaviour as P1.**
- **I2: a page with two or more ` [Row  ` lines becomes one whole-page "table" chunk.** Ingest sets `content_type="table"` for such pages and the chunker's fast path then turns the entire page text (paragraphs included, and every table on the page) into a single table chunk with no parent or children. The interleaved text/table split described in the chunker's docstring only runs for pages with exactly one row line. Long mixed pages are therefore embedded as one block. This is read from the code, not run.
- **I3: llm-mode tables are never table chunks (resolves P4).** `FACT:` / `ROW:` lines do not match `^\[Row \d+\]`, so those pages are chunked as ordinary text (sentence-split into parents and children), and the `<!-- TABLE n -->` comments stay in the text. A table glued to the preceding text with no newline would also fail the row test in text mode.
- **I4: pages that cleaned to nothing are stored (resolves P17).** `[EMPTY AFTER CLEANING]` is non-empty text, so ingest keeps the page; the chunker drops it as a parent (22 characters is below `MIN_CHUNK_SIZE`), then the page fallback stores it as a child chunk. These placeholder chunks are embedded and searchable.
- **I5: parents can span pages** and take the page of their first sentence, so citations can be off by a page.
- **I6: short parents are silently lost.** Any sentence group under `MIN_CHUNK_SIZE` characters between two boundaries is discarded, and the page fallback only helps pages that end up with no chunks at all.
- **I7: chunk ids use only the first 120 characters** of text plus the page and type. Two chunks on one page that share those 120 characters get the same id; children are de-duplicated by id and the later one is lost, and parents and tables would overwrite each other at upsert.
- **I8: `date_added` accepts only `dd/mm/yyyy` and `YYYY-MM-DD`.** Anything else is kept as typed with a warning. A `mm/dd/yyyy` value is read as `dd/mm/yyyy` without error, so 03/04/2026 becomes 2026-04-03.
- **I9: two ways of resolving `MODEL_LOCAL_PATH`.** The embedder resolves a relative path against the project root; the chunker passes it unchanged to SentenceTransformer, so it resolves against the current directory. Run from different folders (or use a relative path) and two model caches can appear. Use an absolute path in `.env`.
- **I10: `ensure_collection` runs at the start of every ingest** (including a run limited to one group), so a dimension mismatch deletes the whole collection at that moment (Trap 2).
- **I11: `delete_document_group` very likely fails** (`points_filter`) and reports 0 even when it works. Do not rely on it for cleanup until it is fixed and tested.
- **I12: `RETRIEVAL_SCORE_MIN` is not a cosine threshold in hybrid mode.** The pipeline's docs call it a minimum cosine similarity, but hybrid results carry RRF scores and the threshold is compared with those. A value like 0.5 can filter out everything. The scale was not measured.
- **I13: image points are excluded by metadata filters.** Searches pass `classification`, `category_level_1`, `category_level_2`, `model_number` and `date_added` to every chunk type, but image points have these as empty values (§22.6 item 7), so any such filter removes all image hits. A `filename` filter can also miss images if `ManualImages.filename` keeps the `.pdf` extension while text points store the stem (not verified). The same mismatch would split text and image sources for one page in `_deduplicate_sources`.
- **I14: `date_added` has no payload index, and the `toc_*` fields have none at ingest** (§22.3). v3.5: `backfill_toc_sections.py --write` creates indexes on `toc_parents` (keyword) and `page` (integer), but section expansion does not filter on `toc_parents` server-side (S5), so that index is not used by the reviewed code.
- **I15: `list_document_groups` and `get_known_filters` scan every point** in the collection.
- **I16: ingest checkpoint housekeeping.** `failed` entries are never cleared, and a file with no loadable pages is re-scanned on every run.
- **I17: payload bloat.** Every child, parent and table chunk carries the whole page's `images` and `tables` lists (with Colab `abs_path` strings), and in text mode the `tables[].normalised` values are empty strings (P13).
- **I18: process-wide monkeypatches.** `chunker.py` replaces `torch.inference_mode` with `torch.no_grad`, and `embedder.py` disables transformers' `check_torch_load_is_safe`. Both affect every library in the same process.

### 22.8 The TOC backfill is `backfill_toc_sections.py` (inferred in v3.4; script reviewed in v3.5, see §23)

The docstring of `retrieval_pipeline.py` says: section expansion needs the `toc_*` payload fields written by `backfill_toc_sections.py`, and it should be run after every ingest and re-embed. That settles several open points:

- **It is a separate script,** run after ingest and after `embed_images.py --force`, not part of `ingest_to_qdrant.py`.
- **It writes `toc_section`,** which retrieval reads from hit payloads and which `_build_payload` never writes, plus four more fields. Resolved in v3.5: the five fields are `toc_sections`, `toc_section_keys`, `toc_section`, `toc_parents`, `toc_page_headings`, derived from the headings in each chunk's text (§23.4, §23.5).
- **It must be re-run after every re-ingest or re-embed,** because an upsert replaces the whole point (§15.3), so the order for a manual is: ingest, `embed_images.py`, `backfill_toc_sections.py`, then `test_retrieval.py`. Add it to the migration checklist in §11 as well.
- **§14 is partly superseded.** The plan to "backfill, then re-enable the filter" no longer applies: the filter was replaced by section expansion. The backfill itself is still required, and the §14 risks (wrong TOC detection, page offsets) now feed section expansion instead of a filter.
- **Without the backfill, retrieval degrades quietly:** expansion falls back to the pages either side of the best hit.
- A classification backfill is not mentioned anywhere in the files reviewed. §13 still describes a design for it, and I13 shows why image points need those fields.

### 22.9 Effects on the runbook, CSV and PC port

- **CSV (§19):** `date_added` should be `YYYY-MM-DD` (or `dd/mm/yyyy`); several models go in one quoted cell separated by commas.
- **`.env` (§20):** the chunker's sizes have built-in defaults, so those lines are optional; `EMBED_BATCH_SIZE` is required by both the chunker and the embedder; use an absolute `MODEL_LOCAL_PATH`; `RAG_PIPELINE_PATH` is rarely needed.
- **Requirements (§20.4):** add `nltk` (optional; needs its punkt data, otherwise a regex splitter is used).
- **Runbook (§18):** step 13 is `backfill_toc_sections.py` (not provided); a classification backfill is unknown.
- **PC port (§21):** the open question about paths is answered: keep an `output/` segment in `page_image_path` and `abs_path`, or change `build_url` in `retrieval_pipeline.py`. A PC port should also decide the whole-page table behaviour (I2) and the empty-page placeholder (I4) rather than copy them.

## 23. Source review, round 5 (v3.5): section_expansion.py and backfill_toc_sections.py

### 23.1 What was reviewed and what is still missing

| Files | Status |
| --- | --- |
| `section_expansion.py`, `backfill_toc_sections.py` | Read in full. Details in §23.3 to §23.6; corrections in §23.8; findings S1–S18 in §23.9. |
| `retrieval_pipeline.py` and the other Phase 2 core files | Not re-uploaded this round. §22.4 stands; it is cross-checked here only where it calls `section_expansion.py`. |
| `describe_images.py`, `test_retrieval.py` | Provided and reviewed in v3.6 (§24). |
| The `ManualImages` registration code, any classification backfill, `docs/SETUP.md`, `vlm_pipeline/__init__.py` | Still not provided. |

Nothing was executed. Statements marked "derived" are inferences from the code, not observed behaviour.

### 23.2 Where the two files sit

```text
ingest_to_qdrant.py ──► text points (child | table | parent)   no section tags
embed_images.py     ──► image points                            no section tags
              │
              ▼
backfill_toc_sections.py   (separate command)
   scroll points ► compute_page_sections() ► set_payload toc_* ► create indexes (toc_parents, page)
              │
              ▼
retrieval_pipeline.py ► merge_with_type_floor() ► expand_sections()      (both in section_expansion.py)
```

`section_expansion.py` has three roles: the ingest-side tagger (`compute_page_sections`, heading extraction, `embed_heading_prefix`), the query-side helpers (`merge_with_type_floor`, `expand_sections` and what they call), and the shared constant `TOC_FIELDS`, which the backfill imports. The module docstring says nothing in it is specific to a page, chapter or manufacturer; one heuristic is an exception (S12).

A "document" throughout is the pair `(document_group_id, filename)`. Page numbers restart per PDF and section numbers repeat between PDFs, so nothing is ever grouped across documents.

### 23.3 backfill_toc_sections.py in detail

**Configuration.** `load_dotenv()`; `QDRANT_URL` and `QDRANT_API_KEY` via `os.environ[...]`; `QDRANT_COLLECTION` default `text_chunks_general`; the client is built with `check_compatibility=False`. Flags are in §3.8.

**Run order inside the script**

1. Scroll the whole collection (or one group with `--group`) in pages of 512, with payload and without vectors, into one in-memory list. Prints `scanned N points` (S14).
2. `compute_page_sections((id, payload) ...)` returns `tags` and `report` (§23.4).
3. Audit, printed per `(group, filename)`:
   - `headings: <mode>   pages tagged: x/y   sections: n` (mode is `numbered`, `unnumbered` or `none`).
   - `WARN no headings found in text chunks -> retrieval falls back to neighbouring pages` when the mode is `none`.
   - `skipped contents/index pages: [...]`, `ignored out-of-order (step-like) headings: [...]` (first 8) and `untagged pages (no heading yet): [...]` (first 15).
   - `largest sections:` the three sections spanning most pages, with page range.
   - `WARN section <key> is not contiguous` when a section's pages have more than 2 missing pages inside their min-to-max range (first 5 reported).
   - With `--show G:A-B`, one `pN: [sections]` line per page of that range for document group G.
4. Work out the writes. A page's points need writing when `--force` is set or any of the five `TOC_FIELDS` differs from what the point already holds. Stale points are those that received no tags this run but still carry a non-empty `toc_*` value.
5. Prints `chunks to write: N   stale tags to remove: M`. Without `--write` it prints `dry run only; re-run with --write to apply.` and exits with code 0 (warnings never change the exit code).
6. With `--write`: one `set_payload` per `(group, filename, page)` covering every point id on that page (S15), then `delete_payload(keys=TOC_FIELDS)` for the stale points, then `create_payload_index` for `toc_parents` (keyword) and `page` (integer). An index error (for example "already exists") is printed as `index <field>: <error>` and the script carries on. Final line: `written.`

**What it does not do:** no embedding, no chunking, no Firestore access, no checkpoint (§8.3), no verification beyond its own audit. Points without an integer `page` or without a `document_group_id` are never tagged, and if they already carry `toc_*` values those are removed as stale. Image points with `page = 0` (unparseable page, §10 #14) therefore end up untagged.

### 23.4 compute_page_sections: how a page gets its sections

**Heading extraction (`extract_headings`)**, applied to each non-image chunk's text. Image chunks are skipped because their text is a VLM description, not the manual.

1. Chunks are joined with spaces, so every heading after the first in a chunk has lost its newline. A newline is restored before each `# <number>` marker.
2. Markdown headings: `#` to `######`, an optional number such as `16.1.1.5` (with optional trailing `.` or `)`), then the title.
3. Numbered headings whose `#` the converter dropped (`16.1.1.4 To Remove Control Board`) are caught by a second pattern that needs **at least three number parts**, so `1. Remove screw` is never a heading. A two-part number such as `3.2 Title` without a `#` is not detected.
4. Title cleaning (`_clean_heading_title`): the title is cut at the first body-text boundary (a following ` # `, ` - `, ` | `, ` <`, an ALL-CAPS word after lowercase, `. ` followed by a capital, or a step marker such as ` 1 Insert`), trailing punctuation is stripped, and it is capped at 14 words and 120 characters.
5. `group_key`: the section number cut to its first four parts (`16.1.1.1.1` becomes `16.1.1.1`).

**Per document**

- Number to longest title (`nums`) and title to level (`uns`, levels 1 and 2 only) are collected per page. Generic titles (note, caution, warning, important, tip, reference and similar) never count as sections.
- **Mode:** `numbered` when there are at least 3 numbered headings and `n_numbered * 3 >= n_unnumbered`; otherwise `unnumbered` when any unnumbered heading exists; otherwise `none`. The minority style in a document is ignored (S10).
- **Contents pages:** a page with more than 12 candidate headings (`MAX_HEADINGS_PER_PAGE`) is treated as a contents or index page: not tagged and not carried forward (S11).
- **Step headings (numbered mode):** a shallow number (1 or 2 parts) whose chapter is lower than the chapter already reached is ignored as a numbered step (`# 2 Remove the screws`). Ignored numbers are listed in the audit (S9).
- **Candidates** are sorted by number (numbered mode) or by level then title (unnumbered mode). Keys: numbered gives the 4-level number; unnumbered gives the slugged title.
- **Carry rule.** Pages are walked in order. A page with no heading of its own inherits the last heading seen. A page that does have headings carries the previous heading in only if it has the same key as the page's first heading; otherwise the page gets only its own headings. So a page is never glued to an unrelated section the previous page happened to end in (S8).
- A page with no sections at all is listed as untagged and gets no tags.

**What a tagged page receives** (identical for every point on that page, including parents, tables and images):

```json
{
  "toc_sections":      ["16.1.1.4 To Remove Control Board"],
  "toc_section_keys":  ["16.1.1.4"],
  "toc_section":       "16.1.1.4 To Remove Control Board",
  "toc_parents":       ["16.1.1.4"],
  "toc_page_headings": []
}
```

(Example for page 124 of a numbered document whose heading appeared on page 123: the page inherits it, so `toc_page_headings`, the headings that start on that page, is empty.)

### 23.5 The five section fields

| Field | Type | Meaning | Read by |
| --- | --- | --- | --- |
| `toc_sections` | list of strings | every section in effect on the page, as `"<number> <title>"` (numbered) or the title (unnumbered), carried heading first | `_catalog()` (heading catalogue) |
| `toc_section_keys` | list of strings | one key per entry above, same order | `_catalog()` |
| `toc_section` | string | the last entry of `toc_sections` | `RetrievalResult.toc_section`, the "Best match is in section" note (§22.4) |
| `toc_parents` | sorted list of strings | the distinct keys, used for prefix matching | `expand_sections()`, `_section_points()` |
| `toc_page_headings` | list of strings | headings that start on this page | `_catalog()` (start pages); `embed_heading_prefix()` (S16) |

These do not replace the Phase 1 fields `toc_page_nums`, `use_toc_nav` and `toc_headings` (§6.2). The two groups coexist on text points, and the Phase 1 group is not read by the reviewed query code (S1).

### 23.6 Query side: merge_with_type_floor and expand_sections

**Defaults** (from source): see §7.5. `MAX_HEADINGS_PER_PAGE = 12` and the generic-title list are constants.

**`merge_with_type_floor(hits, k, image_floor=4)`.** Sorts all hits by `(score, id)` descending (stable for ties), splits images from everything else, keeps the top `k` others plus the top `image_floor` images, and sorts the result by score again. Images are scored on a different scale from children and tables (the source comment), so without the floor a run of near-1.0 text hits could push every image out.

**`expand_sections(vs, hits, question, document_group_id, filename)`**

1. **Documents.** Up to `SECTION_MAX_DOCS` (2) distinct `(group, filename)` pairs taken from the first three hits. A `document_group_id` or `filename` argument overrides the hit's own value.
2. **Seeds, per document.** The top `SECTION_SEED_HITS` (1) hit of that document nominates its `toc_parents` (and its page). Heading-wording matches (below) also nominate sections, with the pages on which those headings start.
3. **Section keys.** Heading matches come first, then the top hit's sections, cut to `SECTION_MAX_PARENTS` (3). For every key with four levels (three dots), its parent key is then appended even if that exceeds 3 (S6).
4. **Chunks per key (`_section_points`).** Scroll every non-child chunk of the document (parents, tables, images), keep those whose `toc_parents` contains the key or any key starting with `key.` (so `16.1.1` also collects `16.1.1.5`), and if they span more than `SECTION_MAX_PAGES` (8) pages keep the 8 closest to the seed pages.
5. **Fallback.** If a document yields no keys at all and the top hit has an integer page, the non-child chunks on `page ± SECTION_NEIGHBOR_PAGES` (1) are used instead. The log line says `(no section tags; neighbour pages +/-1)`.
6. **Adding.** A chunk already in the hits is skipped. A chunk that would take the added text over `SECTION_MAX_CHARS` (60,000) is skipped, and the loop continues with smaller ones (S7). Added chunks get `score = 0.0` and are ordered by document, section rank, page, then type (parent, then table, then everything else). They are appended after the original hits.
7. **Log.** Two plain `print` lines per query: `[SECTION] doc=... sections=[...]` and `[SECTION] added N chunks, pages [...], N chars` (S18).

**Heading-wording match (`_match_headings`).** The question is reduced to stemmed words (stop-words and digits dropped). If it contains verbs such as get to, access, reach, take out or off, open up, replace, change, dismantle, disassemble or detach, the stem of "remove" is added (S12). Each heading of the document's catalogue is scored as the sum of `ln(n / df(word))` over the words it shares with the question, where `n` is the number of headings (at least 2) and `df` is how many headings contain the word. A heading qualifies at a score of at least `0.9 * ln(n)`, which one rare word can reach and common words alone cannot. Qualifying headings within 85% of the best score are kept and ordered by score plus 0.3 per section depth plus 0.2 if the heading's key is among the top hit's sections.

**Catalogue (`_catalog`).** Built from the `toc_sections`, `toc_section_keys` and `toc_page_headings` of every point of the document (one full scroll), cached per `(group, filename)` for `SECTION_CATALOG_TTL` seconds in the process (Trap 24).

### 23.7 What the model sees

Unchanged from §22.4: expansion chunks appear as extra context blocks marked `(same section, page order)` and `RetrievalResult.toc_section` is the first hit payload's `toc_section`, which feeds the `[Best match is in section: ...]` line in `build_prompt`. How `retrieval_pipeline.py` labels an expansion chunk that is itself a `parent` was not re-checked.

### 23.8 Corrections to earlier sections made by this round

1. **§14:** superseded (data source, fields, no filter). Banner added in place.
2. **§22.4:** expansion adds the non-child chunks (parents, tables, images), not "every chunk"; the section env defaults are now verified.
3. **§22.8:** the field list is known (five fields) and the derivation is known (§23.4).
4. **§22.7 I14:** the backfill creates `toc_parents` and `page` indexes (unused by expansion, S5).
5. **§6.2, §16.9, §17.8:** the Phase 1 `toc_*` fields and the backfill's section fields are two separate groups (S1).
6. **§20.5:** `QDRANT_API_KEY` is required by the backfill (Trap 26); the section variables are listed.
7. **§4.3, §5.4:** the retrieval flow has the merge and expansion steps; "sort by score, cap at top\_k" is gone.
8. **§7.8:** the eight section variables are parsed at import time and break on an empty value.

### 23.9 New findings S1–S18

- **S1: the tags come from the chunk text, not from Phase 1's TOC.** `toc.json`, `toc_page_nums`, `toc_headings` and `use_toc_nav` are stored but unused by the backfill and by expansion. P11 and P12 (TOC mis-detection) therefore do not reach retrieval through this path. TOC pages produce no chunks, so no headings are read from them.
- **S2: the run-order dependency** is Trap 23. Ingest, embed, then backfill, in that order, every time.
- **S3: image points are tagged only if their `(group, filename)` matches the text points' pair (derived, not run).** Documents are grouped by that pair. If `ManualImages.filename` keeps the `.pdf` extension while text points store the stem (the same unverified mismatch as I13), image points form a separate "document" with no headings, so they are never tagged and the audit lists them as `headings: none`. Image points with `page = 0` are untagged either way. Check one image point's `filename` against a text point's before trusting image expansion.
- **S4: the catalogue cache** is Trap 24 (10-minute staleness; empty catalogues are rescanned on every query).
- **S5: whole-document scroll per section key** is Trap 25. The `toc_parents` keyword index the backfill creates is not used by `_section_points`, which filters client-side because it needs prefix matching on a keyword field.
- **S6: more sections than `SECTION_MAX_PARENTS`.** Parent keys of four-level sections are appended after the cut to 3, so up to six keys per document can be expanded, and a parent key's prefix match pulls in every sibling subsection. Each key is still capped at 8 pages and the run at 60,000 characters.
- **S7: the 60,000-character cap is characters, not tokens, and is applied with `continue`.** Early (higher-ranked) sections claim the budget first, and a later large chunk is skipped silently while smaller ones may still fit. Whether the result fits the LLM context was not checked.
- **S8: numbered-mode ordering and carry (derived).** Candidates are sorted numerically, so `carried` becomes the numerically highest heading of the page, not the last one printed on it. A page that starts a new section does not carry the section its first lines belong to, so the top of such a page is tagged only with the new section.
- **S9: step-heading protection is partial.** Only 1- and 2-part numbers lower than the current chapter are ignored. A numbered step with a number at or above the current chapter (likely in low-numbered chapters, or before any chapter has been seen) is accepted as a heading with a short key such as `2` (derived).
- **S10: one heading style per document.** The mode is chosen once; headings of the other style are ignored. In unnumbered mode only levels 1 and 2 count, generic titles are excluded, and the key is the slugged title, so the same title in two places becomes one section (the non-contiguous WARN is the hint).
- **S11: dense pages are indistinguishable from contents pages.** A page with more than 12 candidate headings is skipped and not carried, even if it is real body text.
- **S12: one English-specific heuristic.** Questions containing access, replace, change, detach and similar words get "remove" added to the matching words. That suits service-manual headings such as "To Remove ..." and is not manufacturer-specific, but it is English-only and not configurable.
- **S13: the backfill requires `QDRANT_API_KEY`** (Trap 26), unlike the optional note in §20.5 before v3.5.
- **S14: the whole collection is held in memory.** Every point, with its full payload (the `images` and `tables` lists of I17 included), is loaded before any work. Use `--group` on a large collection.
- **S15: one `set_payload` call per page.** Not batched across pages. A failure part-way leaves some pages tagged, others not; a re-run repairs it because only changed points are written.
- **S16: `embed_heading_prefix()` is defined but nothing reviewed calls it.** Its docstring describes prefixing image embeddings with the page's headings (`[Figure on page 124 - <prefix>] ...`). `embedding.py::_build_image_text` (§5.13) does not do this, so image embeddings carry no section text.
- **S17: expansion is driven by one hit.** With `SECTION_SEED_HITS = 1`, the single best hit per document picks the section(s) besides heading matches, and only the first three hits choose which documents are expanded. A wrong top hit seeds the wrong section.
- **S18: expansion logs with plain `print`** to the service's stdout on every query, the same pattern as the debug print removed from `retrieval_pipeline.py` (§10 #3). It also assumes each hit dict's `id` equals the Qdrant point id when it deduplicates added chunks (not checked).

### 23.10 Operating it

```powershell
# 1. audit one document group (read-only)
python backfill_toc_sections.py --group <group>

# 2. inspect the pages around a procedure you care about
python backfill_toc_sections.py --group <group> --show <group>:120-130

# 3. apply, then restart the retrieval service (Trap 24)
python backfill_toc_sections.py --group <group> --write

# 4. check a real question; look for the [SECTION] log lines
$env:QUESTION="How do I remove the control board?"; $env:DOC_GROUP="<group>"; python test_retrieval.py
```

What to look for in the audit: `headings: numbered` (or `unnumbered`) with most pages tagged; few untagged pages; the largest sections matching the manual's real chapters; no non-contiguous WARNs. A `none` mode or a long untagged list means the chunk text has no recognisable headings and expansion will fall back to neighbouring pages. The script's exit code is always 0, so do not gate automation on it.

### 23.11 Still needed

1. (Resolved in v3.6, §24.3.) `test_retrieval.py` does not label expansion chunks correctly and its mode comparison skips images (R1, R3).
2. One real image point and one real text point from Qdrant, to settle S3 (do the `filename` values match, and do image points carry `toc_*` tags after a backfill).
3. A real audit printout for one manual, to confirm the heading modes and the "validated on Panasonic manuals only" claim made about the backfill.
4. The `ManualImages` registration code and any classification backfill (§13).

## 24. Source review, round 6 (v3.6): describe_images.py, test_retrieval.py, environment audit, file inventory

### 24.1 What was reviewed and what is still missing

| Files | Status |
| --- | --- |
| `describe_images.py` | Read in full (§24.2, findings D1–D9). |
| `test_retrieval.py` | Read in full (§24.3, findings R1–R9). |
| A real `.env` | Compared with every variable the reviewed code reads (§24.4, findings E1–E12). Secret values are not reproduced here. |
| Every file named in this document | Classified in §24.5. |
| `server.js`, `retrieval_service.py`, the Expo app, the `ManualImages` registration code, any classification backfill, `docs/SETUP.md`, `vlm_pipeline/__init__.py` | Still not provided. |

Nothing was executed. "Derived" means inferred from the code.

### 24.2 describe_images.py (source-verified)

A thin command-line wrapper. Imports: `argparse`, `logging`, `os`, `sys`, `dotenv.load_dotenv`; then, after `load_dotenv()`, `DEFAULT_BUCKET`, `DEFAULT_MODEL`, `report`, `run` from `vlm_pipeline.pipeline`; `rebuild_review` from `vlm_pipeline.review`; `env_path` from `vlm_pipeline.utils`. Logging is `INFO` with the format `time  LEVEL  message`. All real work is in `pipeline.py` (§5.5, §17.5).

**Control flow**

1. Parse arguments (the `--help` text is the whole module docstring).
2. If none of `--dry-run`, `--report`, `--rebuild-review` is set and `OPENAI_API_KEY` is unset, exit with `OPENAI_API_KEY is not set.`
3. `--report`: `report(document_group, service_account, bucket)` and return.
4. `--rebuild-review`: `rebuild_review(document_group, max_pages, limit, service_account, bucket)` and return.
5. Otherwise `run(document_group, max_pages, limit, dry_run, force, model, diagram_model, dedup_threshold, service_account_path, bucket_name, diagram_detail=not --no-diagram-detail, only_tags=[...] or None)`, then print `stats.summary(dry_run)`.

**Flags and defaults (all confirmed)**

| Flag | Default | Notes |
| --- | --- | --- |
| `--document-group` | none | scope |
| `--max-pages N` | none | |
| `--limit N` | none | |
| `--dry-run` | off | still downloads images (Trap 21) |
| `--force` | off | |
| `--model` | `DEFAULT_MODEL` (`$VLM_MODEL`, else `gpt-4o-mini`) | classify pass |
| `--diagram-model` | `$VLM_DIAGRAM_MODEL`, else `gpt-6-sol` | detail passes for all five detail tags, not only diagrams |
| `--dedup-threshold` | 5 | Hamming distance |
| `--no-diagram-detail` | off | |
| `--service-account` | `env_path("FIREBASE_SERVICE_ACCOUNT", "../serviceAccountKey.json")` | |
| `--bucket` | `DEFAULT_BUCKET` | |
| `--report` | off | read-only |
| `--rebuild-review` | off | no OpenAI calls |
| `--only-tag` | none | comma-separated; implies force and skips dedup (Trap 11) |

**Findings**

- **D1: the `--model` default depends on `.env`.** `DEFAULT_MODEL` is `os.getenv("VLM_MODEL", "gpt-4o-mini")`, evaluated at import after `load_dotenv()`. The v3.5 §3.3 table said `gpt-6-luna`, which was wrong (and garbled); corrected in v3.6. On a machine whose `.env` sets `VLM_MODEL=gpt-6-luna` that is what the classify pass uses (E7).
- **D2: the docstring still describes a diagram-only second pass.** Five tags get a detail pass (§3.3). Only the `--only-tag` help text mentions the 5-tag taxonomy. Confirms §10 #5.
- **D3: the docstring's field list is stale.** It names `vlmDiagramModel`; the real field is `vlmDetailModel` (§6.1, Trap 20). It also omits the other detail-pass fields.
- **D4: `--report` and `--rebuild-review` short-circuit.** If both are given, only `--report` runs; both ignore `--force`, `--dry-run` and `--only-tag`.
- **D5: `--only-tag` is not validated.** Exact, case-sensitive match (derived from the server-side `in` filter, §17.7); a typo matches nothing and the run reports zero work.
- **D6: `--dry-run` is not offline.** The docstring says "plan only, no API calls, no writes". It still needs Firebase credentials and downloads every image to hash it (Trap 21). It needs no OpenAI key.
- **D7: the `--service-account` default is a relative path** built when the parser is created, so it resolves against the working directory (the same family as Trap 13). An absolute path in `.env` avoids it.
- **D8: the docstring's install line ends in `--break-system-packages`.** That option exists only in pip 23.0.1 and later and is meant for Linux system Pythons; on Windows or in a virtual environment omit it. The line also lists only the describe-flow packages; the full list is §20.4.
- **D9: model availability.** The docstring warns that `gpt-6-sol` may not be enabled on every account and that the failure then appears as `vlmError` on the affected docs while the rest keeps working. Test with `--max-pages 1 --force` on a known diagram page before a sweep. `--diagram-model gpt-6-astra` is five times the `gpt-6-sol` price (§5.9), and any model must be in `pricing.MODEL_PRICING` (Trap 19).

### 24.3 test_retrieval.py (source-verified)

**Flow.** Put the script's folder on `sys.path`; read the config block (§3.6); build `RetrievalPipeline()`; print `list_document_groups()` and `collection_stats()` (each in its own try/except); call `retrieve(question, document_group_id, classification, category_level_1, category_level_2, top_k)`; run the dense / sparse / hybrid comparison; print the TOC note, raw hits, context blocks, sources, the prompt from `result.build_prompt(QUESTION, system_prompt=None)` and prompt stats; write the two output files.

It confirms the interfaces it uses: `vs.search(precomputed_query=..., limit=..., document_group_id, classification, category_level_1, category_level_2, chunk_type, mode)` with modes `dense`, `sparse`, `hybrid`; `embedder.embed_query(text)`; the result's `toc_section`, `raw_hits` (dicts with `score` and `payload`), `context_blocks` (`chunk_type`, `score`, `page`, `document_group_id`, `filename`, `parent_id`, `text`) and `sources` (`document_group_id`, `filename`, `page`, `classification`).

**Findings**

- **R1: the mode comparison is not the retrieval path.** It loops over `["child", "table"]` only (§10 #4), merges the two types by raw score before taking the top K (sparse scores are unbounded dot products, dense are cosine, hybrid are RRF, so the merge order differs by mode), and applies no type floor and no section expansion.
- **R2: the "TOC navigation" section is stale.** When `toc_section` is set it prints that retrieval "was filtered/weighted to this section". No such filter exists (Trap 7, §23). `toc_section` is only the label behind the `[Best match is in section: ...]` line, and the script prints "No TOC navigation active" both when there is no match and before the backfill has run.
- **R3: every score-0 context block is labelled "hydrated parent".** Since v3.4 score-0 blocks also include section-expansion chunks (§23.6), including tables and images. Production labels them differently (`(context parent)` versus `(same section, page order)`, §22.4 step 7). In this script the two cannot be told apart. Raw hits likely also include score-0.0000 expansion chunks (derived).
- **R4: several filters cannot be tested.** No `filename`, `model_number`, `date_added` or `chunk_types`, and `score_min` comes only from the pipeline's own environment default.
- **R5: little configuration is reported.** It prints `QDRANT_URL` (the full URL, including a cloud cluster id, so mind screenshots and shared logs) and `MODEL_LOCAL_PATH` and nothing about `QDRANT_API_KEY`, `DEVICE` or `RETRIEVAL_SCORE_MIN`. The docstring's "Required" list shows a localhost URL and omits the API key.
- **R6: outputs go to the current directory and hold manual text.** `last_retrieval_prompt.txt` and `last_retrieval_debug.json` are overwritten on every run. In the JSON the field named `text_preview` contains the full chunk text, so the file can be large. Add both to `.gitignore`.
- **R7: `RETRIEVAL_TOP_K` is read once at start-up** with `int(...)` (an empty value raises `ValueError`), and the script's default is 5 while a `.env` may say 10 (E2).
- **R8: the question is embedded twice and private methods are used.** `retrieve()` embeds it once; the comparison block calls `embedder.embed_query` again through `pipeline._get_vs()` and `pipeline._get_embedder()`. A rename of either private method breaks the script.
- **R9: the comparison block has no error handling.** A failure there aborts the run after retrieval but before the raw hits, the prompt and the output files are produced. A failure in `retrieve()` re-raises with a traceback and writes nothing.

### 24.4 Environment audit: a real `.env` against the code

Compared with §7.9. Secret values are omitted on purpose.

| Variable | In the audited file | Code default | Verdict |
| --- | --- | --- | --- |
| `DEVICE` | `dml` | required (embedder), `cpu` (chunker) | OK; needs `torch-directml`, falls back to CPU on failure |
| `USE_FP16` | `false` | required | OK (also repeated, Trap 27) |
| `EMBED_BATCH_SIZE` | `4` | required | OK |
| `PARENT_CHUNK_SIZE` | `1500` | 1500 | same |
| `CHILD_CHUNK_SIZE` | `500` | 400 | **differs** (E5) |
| `CHILD_OVERLAP` | `100` | 80 | **differs** (E5) |
| `MIN_CHUNK_SIZE` | `30` | 50 | **differs** (E5) |
| `SEMANTIC_BOUNDARY_THRESHOLD` | `0.65` | 0.65 | same |
| `EMBEDDING_MODEL`, `DENSE_EMBED_MODEL` | `BAAI/bge-m3` | required | OK; same model loaded twice (E11) |
| `EMBED_DIM` | `1024` | required | OK |
| `MODEL_LOCAL_PATH` | commented out | **required** | **missing** (E3) |
| `QDRANT_URL`, `QDRANT_API_KEY` | commented out | required | **missing** (E4) |
| `EXTRACTION_DIR` | absent | `./content_extraction` | OK if you run beside that folder |
| `CHECKPOINT_DIR` | commented out | `./checkpoint` | same as the default |
| `RETRIEVAL_TOP_K` | `10` (twice) | 5 | differs; applies to the service and `test_retrieval.py` |
| `RETRIEVAL_SCORE_MIN` | `0.5`, then `"0."` | 0.0 | last wins, so 0.0 locally (E2, E6) |
| `RETRIEVAL_HYDRATE_PARENTS` | `true` | true | same |
| `FIREBASE_SERVICE_ACCOUNT` | an absolute path | `../serviceAccountKey.json` | OK |
| `FIREBASE_BUCKET` | `rbacfyp.firebasestorage.app` | same fallback | OK |
| `OPENAI_API_KEY` | set (also as a comment) | none | OK; exposed, rotate it (E1) |
| `VLM_MODEL` | `gpt-6-luna` | `gpt-4o-mini` | differs; priced in §5.9 |
| `VLM_DIAGRAM_MODEL` | absent | `gpt-6-sol` | default applies |
| `VLM_TOKEN_LIMIT_PER_MIN` | `470000` | 60000 | differs; fine if it matches your tier |
| `VLM_TOKEN_ESTIMATE` | `3000` | 1200 | differs; first call of a run only |
| `MAX_RETRIEVAL_ROUNDS` | `1` | not read by any provided file | unconfirmed (E9) |
| `RETRIEVAL_SERVICE_URL`, `PORT` | `http://localhost:8001`, `8000` | app side | not read by Python files provided |
| `EXPO_PUBLIC_API_URL` | a Railway host without a scheme | app side | check (E10) |
| `API_BASE_URL` | commented out | app side | |
| `OPENROUTER_API_KEY` | commented out | nothing reads it | unused (E8) |

**Findings**

- **E1: live secrets were pasted into a chat.** The audited text contained an OpenAI key (twice), an OpenRouter key and a Qdrant API key and cluster URL, some of them in commented lines, which are still exposed. Revoke and replace all of them, then update the deployments that use them. Keep `.env` out of version control (§20.5). This document does not reproduce any of them.
- **E2: duplicate keys.** `RETRIEVAL_SCORE_MIN`, `RETRIEVAL_TOP_K`, `USE_FP16` and `OPENAI_API_KEY` appear more than once; the last occurrence wins (Trap 27). Keep one line each.
- **E3: `MODEL_LOCAL_PATH` is commented out but required.** With the file as audited, `Embedder()` raises unless the variable comes from the shell or the host (Trap 28). That blocks ingest, the image embed flow and the retrieval pipeline. `EMBEDDING_MODEL` would still download the chunker's model without it, so the symptom appears at the embedder, not the chunker.
- **E4: the Qdrant settings are commented out.** `backfill_toc_sections.py` needs both `QDRANT_URL` and `QDRANT_API_KEY` (Trap 26), and cloud Qdrant needs the key everywhere. If they are set only on the deployed service, local scripts cannot reach the same index.
- **E5: chunk sizes differ from the documented defaults.** The file sets child 500, overlap 100 and minimum 30; this document, the architecture diagram and §4.1 say child about 400 with overlap 80 and minimum 50. The index reflects whatever values were in force when each file was ingested, and the payload does not record them (derived). Decide which values the collection was built with and make the docs and diagram match. Changing them later means re-ingesting everything (§11), or the index mixes two chunkings.
- **E6: `RETRIEVAL_SCORE_MIN=0.5` would break hybrid search.** In hybrid mode the threshold is compared with RRF scores, which are far below 0.5 (I12; the script's own note says about 0 to 0.03). The audited file also sets `"0."`, which wins locally, but a service that reads only the first value, or a platform that deduplicates differently, would return no hits. Set 0.0 and remove the other line.
- **E7: effective VLM models.** Classify uses `gpt-6-luna` (from `VLM_MODEL`), the detail pass uses the default `gpt-6-sol`. Docs and diagrams that say "gpt-4o-mini for classify" describe the code default, not this configuration. Both are priced.
- **E8: variables nothing reads.** `OPENROUTER_API_KEY` is read by no reviewed file. If the Node or Python app code does not use it either, delete it (and revoke the key, E1).
- **E9: `MAX_RETRIEVAL_ROUNDS=1` is unexplained.** The architecture says the model may trigger one extra retrieval round (at most two rounds in total). If this variable means the total number of rounds, a value of 1 disables the extra round; if it means extra rounds, 1 is correct. The code that reads it was not provided.
- **E10: `EXPO_PUBLIC_API_URL` has no `https://`.** A bare host name will not work as a fetch base in React Native. It may be a paste artifact; check the value in the app. Anything prefixed `EXPO_PUBLIC_` ends up in the app bundle, so it must never hold a secret.
- **E11: one model loaded twice.** The chunker's boundary model and the embedder's dense model are the same `BAAI/bge-m3` here but are loaded separately (Trap 8), so ingest holds two copies in memory.
- **E12: two folders for one system.** The retrieval service starts from `server.rag.retrieval...` while the scripts live in `server/rag/ragPhase2/` (§2). Whatever connects them (a copy, `RAG_PIPELINE_PATH`, a package import) must stay in step with `retrieval_pipeline.py` and `section_expansion.py`, or the service and `test_retrieval.py` can behave differently.

### 24.5 File inventory: used, entry point, unused, proposed, or not provided

Based on the sources reviewed in rounds 1 to 6. "Used" means imported or called by a file on the pipeline path.

**Entry points (have run instructions)**

| File | Used by the pipeline | Run instruction | Verdict |
| --- | --- | --- | --- |
| `verify_extraction.py` | pre-flight check | §3.1 | keep |
| `ingest_to_qdrant.py` | text ingest, schema owner | §3.2 | keep |
| `describe_images.py` | image flow, step 1 | §3.3 | keep |
| `embed_images.py` | image flow, step 2 | §3.4 | keep |
| `vlm_pipeline/verify_embedding.py` | optional QA of the image flow | §3.5 (`python -m`) | keep; its hint text is stale (§10 #10) |
| `backfill_toc_sections.py` | needed for section expansion | §3.8 | keep |
| `test_retrieval.py` | not on the production path (debug tool) | §3.6 | keep, optional; read Trap 29 |
| `phase1_ocr.ipynb`, `phase1_llm_parsing.ipynb` | Phase 1 (Colab) | §18.3, §18.4 | keep |

**Library modules (imported; no run instruction needed)**

`chunker.py`, `embedder.py`, `vector_store.py`, `retrieval_pipeline.py`, `section_expansion.py`, and in `vlm_pipeline/`: `pipeline.py`, `vlm.py`, `scope.py`, `dedup.py`, `image_info.py`, `embedding.py`, `firebase_client.py`, `pricing.py`, `review.py`, `utils.py`. Phase 1 helpers imported by the parse notebook: `general_content_extractor.py`, `general_processor.py`, `html_table_converter.py`.

**Documented files that are unused, only proposed, or not provided**

| File or path | Where it is mentioned | Status | Run instruction |
| --- | --- | --- | --- |
| `llm_table_normalizer.py` | §16, §17.2 | Imported only when `TABLE_PARSE_MODE="llm"`, which §18.4 recommends against. Its `FACT:` / `ROW:` output is never chunked as a table (I3, P4), so in practice it is **unused**. | none (a notebook toggle) |
| `phase1_ocr.py`, `phase1_parse.py`, `phase1_run.py`, the `phase1/` package | §21 | **Do not exist.** A plan for running Phase 1 on a PC. | none |
| `vlm_pipeline/__init__.py` | §2 | Package marker, never provided. Harmless. | none |
| `parse.py` | §16.4 | MonkeyOCR's own script, outside this repository. | called by the OCR notebook |
| `server.js`, `retrieval_service.py`, `LLM-Mobile/` | §3.7 (new) | Real, per the start commands in a `.env`, but **not provided and not documented before v3.6**. | `node server.js`, `python -m uvicorn server.rag.retrieval.retrieval_service:app --reload --port 8001`, `npx expo start -c` |
| `docs/SETUP.md` | §15 | Referenced, never provided. | none |

**Unused code inside files that are used** (functions, not files)

| Item | Notes |
| --- | --- |
| `VectorStore.extract_filters`, `get_known_filters` | never called (§10 #1); the "query understanding" step does not exist at runtime |
| `VectorStore.delete_document_group` | no reviewed caller; likely raises `TypeError` anyway (I11) |
| `section_expansion.embed_heading_prefix` | defined, called by nothing reviewed (S16) |

**Result.** Every provided `.py` file with a CLI is on the pipeline path or is a debug tool with a run instruction. Nothing provided is useless. The unused or non-existent items are `llm_table_normalizer.py` (in practice), the proposed `phase1_*.py` files, the three dead functions above, and the unexplained `OPENROUTER_API_KEY` variable (E8). The only real gap in run instructions was the app side, now in §3.7. This classification covers what has been reviewed; files not provided could add or remove entries.

### 24.6 Corrections to earlier sections made by this round

1. **§3.3:** `--model` default is `$VLM_MODEL`, else `gpt-4o-mini` (it said `gpt-6-luna`); `--service-account` and `--bucket` defaults added; the CLI run order is documented.
2. **§3.6:** the script's own environment inputs, outputs and gaps are documented.
3. **§3.7:** the app-side start commands (inferred) and the second directory tree in §2.
4. **§7.1–§7.3, §7.6:** defaults and required flags restated per file; §7.9 added.
5. **§10 #4 and #5:** confirmed from source.
6. **§18.1, §18.8, §18.9, §18.13, §22.1, §23.1, §23.11:** statuses updated.
7. **§20.5:** template rewritten; keys are placeholders.

### 24.7 Still needed

1. `server.js`, `retrieval_service.py` and the Expo app's API client: to document how retrieval is called, what `MAX_RETRIEVAL_ROUNDS` does (E9), and how the service imports the retrieval code (E12).
2. Confirmation of the chunk sizes the live collection was built with (E5), and of the `.env` the Railway service actually uses (E2, E6).
3. The `ManualImages` registration code and any classification backfill (§13).
4. One real run of `describe_images.py --dry-run` and `test_retrieval.py` to confirm D6, R3 and the `[SECTION]` log lines (§23.10).
