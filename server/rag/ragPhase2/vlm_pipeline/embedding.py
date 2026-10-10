"""
embedding.py — embed VLM-described images from Firestore into the existing
Qdrant collection, as new chunk_type="image" points.

This does NOT touch the text-ingestion pipeline (children/tables/parents) —
it only adds one more kind of point, built from ManualImages docs that
already have a VLM description (vlmStatus == "described").

Checkpointing works exactly like the VLM step: each ManualImages doc gets a
`qdrantStatus` field once embedded, so re-running this only processes images
that are newly described since the last run, or that previously errored.
No separate checkpoint file — Firestore IS the checkpoint.

IMPORTANT: this script never calls VectorStore.ensure_collection(). That
method DELETES and recreates the whole collection on any schema mismatch
(see vector_store.py's own warning comment on it) — it must only ever be
called by whatever owns the collection's schema (ingest_to_qdrant.py), never
by this script.

Uses Embedder.embed_chunks() — the SAME method ingest_to_qdrant.py uses for
every other chunk type — not embed_query(). This matters: embed_chunks()
mutates the chunk dict in place with `embedding`, `sparse_embedding`, and the
correct embedding_model/embedding_dim/embedding_backend metadata, and it
batches internally via the embedder's own EMBED_BATCH_SIZE. Using embed_query
instead would silently skip that metadata and process one at a time.

Embedder() itself requires the same env vars as ingest_to_qdrant.py:
DENSE_EMBED_MODEL, MODEL_LOCAL_PATH, DEVICE, EMBED_BATCH_SIZE, USE_FP16 — all
are hard-required with no default, so this must run with access to the same
.env (or equivalent env vars) that pipeline uses.
"""

import hashlib
import logging
import os
import sys
import time
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional

from .firebase_client import FirebaseClient
from .utils import page_num_int

logger = logging.getLogger("describe_images.embedding")

DEFAULT_BUCKET = os.getenv("FIREBASE_BUCKET", "rbacfyp.firebasestorage.app")

# How many images to embed per Embedder.embed_chunks() / VectorStore.upsert_chunks()
# call. Embedder batches internally via EMBED_BATCH_SIZE for the actual model
# calls — this is a coarser outer grouping so a crash mid-run only costs this
# many un-checkpointed images, not the whole sweep.
SUPERBATCH_SIZE = int(os.getenv("EMBED_SUPERBATCH_SIZE", "50"))

# Point this at the folder containing embedder.py / vector_store.py if
# they're not already importable (e.g. an absolute path to server/rag/ragPhase2).
# Leave unset if this script already sits alongside those files or they're on
# PYTHONPATH some other way.
RAG_PIPELINE_PATH = os.getenv("RAG_PIPELINE_PATH")
if RAG_PIPELINE_PATH and RAG_PIPELINE_PATH not in sys.path:
    sys.path.insert(0, RAG_PIPELINE_PATH)


def _get_embedder():
    from embedder import Embedder  # noqa: from RAG_PIPELINE_PATH
    return Embedder()


def _get_vector_store():
    from vector_store import VectorStore  # noqa: from RAG_PIPELINE_PATH
    return VectorStore()


def _point_id(chunk_id: str) -> int:
    """Must match vector_store.py's private _point_id exactly — used here only
    to know what id Qdrant will have assigned, for the checkpoint field. The
    actual id assignment happens inside VectorStore.upsert_chunks()."""
    return int(hashlib.md5(chunk_id.encode()).hexdigest()[:15], 16)


def _build_image_text(doc: dict) -> str:
    """Text actually embedded for this image: description + a flattened form
    of whichever structured extraction is present, so a query like 'what is
    the depth of the indoor unit' or 'what does FUSE104 connect to' can match
    on the exact value, not just prose that happens to mention it."""
    parts = [doc.get("vlmDescription", "")]

    measurements = doc.get("vlmMeasurements") or []
    if measurements:
        flat = "; ".join(f"{m.get('label', '')}: {m.get('value', '')}" for m in measurements if m.get("label"))
        if flat:
            parts.append(f"Measurements: {flat}")

    graphs = doc.get("vlmGraphs") or []
    for g in graphs:
        x, y = g.get("x_axis") or {}, g.get("y_axis") or {}
        bits = [g.get("title", "")]
        if x.get("label"):
            bits.append(f"X axis {x['label']} ({x.get('unit', '')}): {', '.join(x.get('ticks') or [])}")
        if y.get("label"):
            bits.append(f"Y axis {y['label']} ({y.get('unit', '')}): {', '.join(y.get('ticks') or [])}")
        if g.get("curve_description"):
            bits.append(g["curve_description"])
        parts.append("Graph — " + " | ".join(b for b in bits if b))

    components = doc.get("vlmComponents") or []
    if components:
        flat = "; ".join(
            f"{c.get('name', '')} ({c.get('type', '')}{', ' + c['value'] if c.get('value') else ''}, {c.get('location', '')})"
            for c in components
        )
        parts.append(f"Components: {flat}")
    connections = doc.get("vlmConnections") or []
    if connections:
        flat = "; ".join(f"{c.get('from', '')} -> {c.get('to', '')} ({c.get('relationship', '')})" for c in connections)
        parts.append(f"Connections: {flat}")

    flowcharts = doc.get("vlmFlowcharts") or []
    for f in flowcharts:
        node_text = "; ".join(f"{n.get('label', '')}" + (f" ({n['value']})" if n.get("value") else "") for n in f.get("nodes") or [])
        edge_text = "; ".join(f"{e.get('from', '')} -> {e.get('to', '')}" + (f" [{e['label']}]" if e.get("label") else "") for e in f.get("edges") or [])
        parts.append(f"Flowchart '{f.get('title', '')}': nodes: {node_text}. branches: {edge_text}")

    steps = doc.get("vlmInstallationSteps") or []
    for s in steps:
        bits = [s.get("panel_title", "")]
        if s.get("parts_shown"):
            bits.append("parts: " + ", ".join(s["parts_shown"]))
        if s.get("note"):
            bits.append(s["note"])
        parts.append("Step — " + " | ".join(b for b in bits if b))

    return "\n".join(p for p in parts if p)


def _build_storage_url(storage_path: str, bucket_name: str) -> str:
    encoded = storage_path.replace("/", "%2F")
    return f"https://firebasestorage.googleapis.com/v0/b/{bucket_name}/o/{encoded}?alt=media"


def _build_chunk(doc: dict, text: str, bucket_name: str) -> Dict[str, Any]:
    """Chunk dict shaped exactly the way Embedder.embed_chunks() and
    VectorStore.upsert_chunks() expect — same shape ingest_to_qdrant.py's
    children/tables use, minus the fields that don't apply to a standalone
    image chunk (no parent/child links, no table rows)."""
    doc_id = doc["_id"]
    storage_path = doc.get("storagePath", "")
    page_num = page_num_int(doc.get("pageNum"))

    return {
        "id": f"image::{doc_id}",
        "text": text,
        "page": page_num or 0,
        "metadata": {
            "chunk_type": "image",
            "content_type": doc.get("vlmTag", ""),
            "document_group_id": doc.get("documentGroup", ""),
            "filename": doc.get("filename", ""),
            "classification": doc.get("classification", ""),
            "file_path": storage_path,
            "images": [{
                "src_path": storage_path,
                "abs_path": storage_path,
                "caption": doc.get("vlmDescription", "")[:200],
                "url": _build_storage_url(storage_path, bucket_name),
            }],
        },
    }


def run(
    document_group: Optional[str],
    max_pages: Optional[int],
    limit: Optional[int],
    dry_run: bool,
    force: bool,
    service_account_path: str,
    bucket_name: str,
) -> Counter:
    fb = FirebaseClient(service_account_path, bucket_name)
    docs = fb.fetch_image_docs(document_group=document_group, max_pages=max_pages, limit=limit)

    # Only images that actually have a description are embeddable. Duplicates
    # (skipped_duplicate) have no description of their own and are skipped —
    # say if you want those made discoverable too (e.g. by reusing the
    # representative's text), that's a judgment call worth deciding explicitly.
    candidates = [d for d in docs if d.get("vlmStatus") == "described"]
    logger.info(f"{len(candidates)} described image(s) in scope (of {len(docs)} total)")

    stats: Counter = Counter()

    pending: List[dict] = []
    for doc in candidates:
        stats["scanned"] += 1
        if doc.get("qdrantStatus") == "embedded" and not force:
            stats["already_embedded"] += 1
            continue
        text = _build_image_text(doc)
        if not text.strip():
            stats["skipped_empty"] += 1
            continue
        pending.append(doc)

    if dry_run:
        for doc in pending:
            logger.info(f"[{doc['_id']}] would embed")
        stats["would_embed"] = len(pending)
        return stats

    if not pending:
        return stats

    embedder = _get_embedder()
    vs = _get_vector_store()

    for i in range(0, len(pending), SUPERBATCH_SIZE):
        batch_docs = pending[i:i + SUPERBATCH_SIZE]
        chunks = [_build_chunk(d, _build_image_text(d), bucket_name) for d in batch_docs]

        try:
            embedder.embed_chunks(chunks)  # mutates chunks in place
            stored = vs.upsert_chunks(chunks)
            if stored != len(chunks):
                logger.warning(f"Batch: expected {len(chunks)} stored, got {stored}")

            for doc, chunk in zip(batch_docs, chunks):
                doc_id = doc["_id"]
                point_id = _point_id(chunk["id"])

                # image_scope / traceability fields aren't part of
                # vector_store.py's fixed _build_payload() schema, so they're
                # attached as a direct payload patch rather than editing that
                # shared file.
                vs.client.set_payload(
                    collection_name=vs.collection,
                    payload={
                        "image_scope": doc.get("imageScope", ""),
                        "source_manual_image_doc_id": doc_id,
                        "embedding_source": "vlm_pipeline",
                    },
                    points=[point_id],
                )

                fb.update_doc(doc_id, {
                    "qdrantStatus": "embedded",
                    "qdrantPointId": str(point_id),
                    "qdrantCollection": vs.collection,
                    "qdrantEmbeddedAt": datetime.now().isoformat(),
                })
                stats["embedded"] += 1

            logger.info(f"Batch {i // SUPERBATCH_SIZE + 1}: embedded {len(batch_docs)} image(s)")

        except Exception as e:
            logger.warning(f"Batch embedding failed ({len(batch_docs)} images): {e}")
            for doc in batch_docs:
                fb.update_doc(doc["_id"], {"qdrantStatus": "error", "qdrantError": str(e)})
            stats["errors"] += len(batch_docs)

        time.sleep(0.1)

    return stats


def report(document_group: Optional[str], service_account_path: str, bucket_name: str) -> None:
    fb = FirebaseClient(service_account_path, bucket_name)
    docs = fb.fetch_image_docs(document_group=document_group)
    described = [d for d in docs if d.get("vlmStatus") == "described"]

    qdrant_status_counts = Counter(d.get("qdrantStatus", "not_embedded") for d in described)

    print(f"\nDescribed images in scope: {len(described)} (of {len(docs)} total)")
    print("\nBy qdrantStatus:")
    for k, v in qdrant_status_counts.most_common():
        print(f"  {k:<20} {v}")

    error_docs = [d for d in described if d.get("qdrantStatus") == "error"]
    if error_docs:
        print(f"\n{len(error_docs)} embedding error(s):")
        for d in error_docs[:20]:
            print(f"  [{d['_id']}]  {d.get('qdrantError', '(no message stored)')}")
        if len(error_docs) > 20:
            print(f"  ... and {len(error_docs) - 20} more")