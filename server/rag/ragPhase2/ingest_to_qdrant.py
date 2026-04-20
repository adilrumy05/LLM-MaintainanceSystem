# ingest_to_qdrant.py
"""
Phase 2 — Chunk, Embed, and Store in Qdrant.

Reads the output of Phase 1 content extraction:

    content_extraction/{classification}/{document_group_id}/{filename_stem}/
        page_{N}/
            processed_content.txt
            metadata.json
        toc.json   (optional)

For each page unit:
  1. Load text from processed_content.txt + metadata from metadata.json.
  2. Build ContentUnit objects.
  3. Run IntelligentChunker → parent_chunks + child_chunks + table_chunks.
  4. Embed child_chunks and table_chunks with BAAI/bge-base-en-v1.5.
  5. Upsert everything into Qdrant (one collection: text_chunks_general).
  6. Save a local checkpoint so interrupted runs can resume.

Usage
-----
    python ingest_to_qdrant.py

Configuration (env vars or .env file)
---------------------------------------
    EXTRACTION_DIR      path to content_extraction root
                        e.g. /mnt/gdrive/RAG_OCRv1/content_extraction
    MODEL_LOCAL_PATH    local model dir   (default: ./models/bge-base-en-v1.5)
    QDRANT_URL          e.g. http://localhost:6333
    QDRANT_API_KEY      optional
    DEVICE              cpu or cuda        (default: cpu)
    EMBED_BATCH_SIZE    default 64
    PARENT_CHUNK_SIZE   default 1500
    CHILD_CHUNK_SIZE    default 400
    CHILD_OVERLAP       default 80
    MIN_CHUNK_SIZE      default 50

    LIMIT               int — process only first N document groups (debug)
    DOC_GROUP_FILTER    e.g. panasonic_aircon_CS-PW24KE (process one group)
    CLASSIFICATION_FILTER  e.g. MANUAL

Checkpoint
----------
    ./checkpoint/ingest_checkpoint.json
    Tracks which (document_group_id, filename_stem) files are done.
    Re-running skips already-ingested files.
"""

import json
import os
import sys
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Local imports ─────────────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))
from chunker      import IntelligentChunker, ContentUnit
from embedder     import Embedder
from vector_store import VectorStore


# ── Configuration ─────────────────────────────────────────────────────────────

EXTRACTION_DIR        = Path(os.getenv("EXTRACTION_DIR", "./content_extraction"))
CHECKPOINT_FILE       = Path(os.getenv("CHECKPOINT_DIR", "./checkpoint")) / "ingest_checkpoint.json"
LIMIT                 = int(os.getenv("LIMIT", "0")) or None          # 0 = no limit
DOC_GROUP_FILTER      = os.getenv("DOC_GROUP_FILTER",      None)
CLASSIFICATION_FILTER = os.getenv("CLASSIFICATION_FILTER", None)

EMBED_DIM = 768   # fixed for bge-base-en-v1.5


# ── Checkpoint helpers ────────────────────────────────────────────────────────

def _load_checkpoint() -> Dict[str, Any]:
    CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
    if CHECKPOINT_FILE.exists():
        try:
            data = json.loads(CHECKPOINT_FILE.read_text())
            n = len(data.get("done", {}))
            logger.info(f"Checkpoint loaded: {n} file(s) already ingested")
            return data
        except Exception as e:
            logger.warning(f"Could not load checkpoint: {e} — starting fresh")
    return {"last_updated": None, "done": {}, "failed": {}}


def _save_checkpoint(cp: Dict[str, Any]):
    cp["last_updated"] = datetime.now().isoformat()
    CHECKPOINT_FILE.write_text(json.dumps(cp, indent=2))


def _cp_key(doc_group_id: str, filename_stem: str) -> str:
    return f"{doc_group_id}|{filename_stem}"


def _mark_done(cp: Dict, key: str, meta: Dict):
    cp["done"][key] = {**meta, "timestamp": datetime.now().isoformat()}
    _save_checkpoint(cp)


def _mark_failed(cp: Dict, key: str, error: str):
    cp["failed"][key] = {"error": error, "timestamp": datetime.now().isoformat()}
    _save_checkpoint(cp)


# ── Content-unit loader ───────────────────────────────────────────────────────

def _load_page_unit(
    page_dir:         Path,
    document_group_id: str,
    filename_stem:    str,
    classification:   str,
) -> Optional[ContentUnit]:
    """
    Read processed_content.txt + metadata.json for one page.
    Returns ContentUnit or None if files are missing / empty.
    """
    txt_path  = page_dir / "processed_content.txt"
    meta_path = page_dir / "metadata.json"

    if not txt_path.exists() or not meta_path.exists():
        return None

    try:
        raw = txt_path.read_text(encoding="utf-8")
        # Strip the header lines and get just the CONTENT section
        if "CONTENT:\n" in raw:
            text = raw.split("CONTENT:\n", 1)[1].strip()
        else:
            text = raw.strip()

        if not text:
            return None

        with open(meta_path, encoding="utf-8") as fh:
            metadata = json.load(fh)

        page_num = metadata.get("page", int(page_dir.name.split("_")[1]))

        # Detect if this page contains table rows (embed-format) and flag it
        row_lines = sum(
            1 for line in text.splitlines()
            if line.strip().startswith("[Row ")
        )
        content_type = "table" if row_lines >= 2 else "text"

        unit_id = metadata.get("unit_id", f"{document_group_id}_{filename_stem}_p{page_num}")

        return ContentUnit(
            id=unit_id,
            text=text,
            content_type=content_type,
            page=page_num,
            source=str(txt_path),
            section_path=[document_group_id, filename_stem, f"Page {page_num}"],
            metadata=metadata,
        )

    except Exception as e:
        logger.warning(f"Could not load {page_dir}: {e}")
        return None


def _load_file_units(
    file_dir:         Path,
    document_group_id: str,
    filename_stem:    str,
    classification:   str,
) -> List[ContentUnit]:
    """Load all page ContentUnits for one PDF file's extraction output."""
    page_dirs = sorted(
        [d for d in file_dir.iterdir() if d.is_dir() and d.name.startswith("page_")],
        key=lambda d: int(d.name.split("_")[1]),
    )
    units = []
    for page_dir in page_dirs:
        unit = _load_page_unit(page_dir, document_group_id, filename_stem, classification)
        if unit:
            units.append(unit)
    return units


# ── Work-list builder ─────────────────────────────────────────────────────────

def _build_work_list() -> List[Dict[str, Any]]:
    """
    Walk EXTRACTION_DIR and collect all (document_group_id, filename_stem) pairs.

    Expected layout:
        EXTRACTION_DIR/
            {classification}/
                {document_group_id}/
                    {filename_stem}/
                        page_{N}/
                            processed_content.txt
                            metadata.json
    """
    work_items = []

    if not EXTRACTION_DIR.exists():
        raise FileNotFoundError(f"EXTRACTION_DIR not found: {EXTRACTION_DIR}")

    for classification_dir in sorted(EXTRACTION_DIR.iterdir()):
        if not classification_dir.is_dir():
            continue
        classification = classification_dir.name

        if CLASSIFICATION_FILTER and classification.upper() != CLASSIFICATION_FILTER.upper():
            continue

        for doc_group_dir in sorted(classification_dir.iterdir()):
            if not doc_group_dir.is_dir():
                continue
            doc_group_id = doc_group_dir.name

            if DOC_GROUP_FILTER and doc_group_id != DOC_GROUP_FILTER:
                continue

            for file_dir in sorted(doc_group_dir.iterdir()):
                if not file_dir.is_dir():
                    continue
                filename_stem = file_dir.name

                # Quick sanity check: must have at least one page_N subdir
                has_pages = any(
                    d.is_dir() and d.name.startswith("page_")
                    for d in file_dir.iterdir()
                )
                if not has_pages:
                    continue

                work_items.append({
                    "classification":    classification,
                    "document_group_id": doc_group_id,
                    "filename_stem":     filename_stem,
                    "file_dir":          file_dir,
                })

    if LIMIT:
        # Limit by unique document_group_id count
        seen: set = set()
        limited   = []
        for item in work_items:
            seen.add(item["document_group_id"])
            limited.append(item)
            if len(seen) >= LIMIT:
                break
        work_items = limited

    return work_items


# ── Main ingestion loop ───────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("PHASE 2 — CHUNK + EMBED + STORE")
    print("=" * 70)
    print(f"  Extraction dir : {EXTRACTION_DIR}")
    print(f"  Checkpoint     : {CHECKPOINT_FILE}")
    print(f"  Qdrant         : {os.getenv('QDRANT_URL', 'http://localhost:6333')}")
    print(f"  Model          : {os.getenv('MODEL_LOCAL_PATH', './models/bge-base-en-v1.5')}")
    print("=" * 70)

    # ── Init components ───────────────────────────────────────────────────────
    chunker      = IntelligentChunker()
    embedder     = Embedder()
    vector_store = VectorStore()
    vector_store.ensure_collection(embedding_dim=EMBED_DIM)

    checkpoint = _load_checkpoint()
    work_items = _build_work_list()

    print(f"\nWork list: {len(work_items)} file(s)")

    # ── Summary counters ──────────────────────────────────────────────────────
    total_files_done     = 0
    total_files_skip     = 0
    total_files_failed   = 0
    total_parents        = 0
    total_children       = 0
    total_tables         = 0

    for idx, work in enumerate(work_items, 1):
        doc_group_id   = work["document_group_id"]
        filename_stem  = work["filename_stem"]
        classification = work["classification"]
        file_dir       = work["file_dir"]
        cp_key         = _cp_key(doc_group_id, filename_stem)

        print(f"\n[{idx}/{len(work_items)}] {doc_group_id} / {filename_stem}")

        # ── Skip already done ──────────────────────────────────────────────
        if cp_key in checkpoint["done"]:
            done_at = checkpoint["done"][cp_key].get("timestamp", "?")
            print(f"  SKIP (done @ {done_at})")
            total_files_skip += 1
            continue

        try:
            # ── 1. Load ContentUnits ───────────────────────────────────────
            units = _load_file_units(
                file_dir, doc_group_id, filename_stem, classification
            )
            if not units:
                logger.warning(f"  No units loaded — skipping")
                continue
            print(f"  Loaded {len(units)} page unit(s)")

            # ── 2. Chunk ───────────────────────────────────────────────────
            result = chunker.chunk_content_units(units)
            parents = result["parent_chunks"]
            children = result["child_chunks"]
            tables   = result["table_chunks"]
            print(
                f"  Chunks: {len(parents)} parents | "
                f"{len(children)} children | {len(tables)} tables"
            )

            # ── 3. Embed children + tables ─────────────────────────────────
            to_embed = children + tables
            if to_embed:
                embedded = embedder.embed_chunks(to_embed)
                embedded_children = embedded[:len(children)]
                embedded_tables   = embedded[len(children):]
            else:
                embedded_children = []
                embedded_tables   = []

            # ── 4. Upsert ──────────────────────────────────────────────────
            n_children = vector_store.upsert_chunks(embedded_children)
            n_tables   = vector_store.upsert_chunks(embedded_tables)
            n_parents  = vector_store.upsert_parent_payloads(
                parents, embedding_dim=EMBED_DIM
            )

            total_parents  += n_parents
            total_children += n_children
            total_tables   += n_tables
            total_files_done += 1

            _mark_done(checkpoint, cp_key, {
                "document_group_id": doc_group_id,
                "filename":          filename_stem,
                "classification":    classification,
                "n_parents":         n_parents,
                "n_children":        n_children,
                "n_tables":          n_tables,
            })
            print(
                f"  ✓ stored: {n_parents} parents | "
                f"{n_children} children | {n_tables} tables"
            )

        except Exception as e:
            import traceback
            logger.error(f"  FAILED: {e}")
            traceback.print_exc()
            _mark_failed(checkpoint, cp_key, str(e)[:300])
            total_files_failed += 1

    # ── Final summary ──────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("PHASE 2 COMPLETE")
    print("=" * 70)
    print(f"  Files done     : {total_files_done}")
    print(f"  Files skipped  : {total_files_skip}")
    print(f"  Files failed   : {total_files_failed}")
    print(f"  Parent chunks  : {total_parents}")
    print(f"  Child chunks   : {total_children}")
    print(f"  Table chunks   : {total_tables}")

    stats = vector_store.collection_stats()
    print(f"\n  Qdrant collection '{vector_store.collection}':")
    print(f"    points  : {stats.get('points_count', '?')}")
    print(f"    vectors : {stats.get('vectors_count', '?')}")
    print(f"    status  : {stats.get('status', '?')}")
    print("=" * 70)


if __name__ == "__main__":
    main()
