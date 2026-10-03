"""
embed_images.py — embed VLM-described images from Firestore into Qdrant.

Run this AFTER describe_images.py has described the images you want indexed.
Checkpointing is automatic: each ManualImages doc gets a `qdrantStatus` field
once embedded, so re-running only processes newly-described or previously-
errored images. No separate checkpoint file needed — Firestore is the
checkpoint, same pattern as vlmStatus in describe_images.py.

Required env vars (loaded from a .env file automatically) — these are the
SAME ones ingest_to_qdrant.py needs, since this uses the same Embedder /
VectorStore classes:
    DENSE_EMBED_MODEL, MODEL_LOCAL_PATH, DEVICE, EMBED_BATCH_SIZE, USE_FP16
    QDRANT_URL, QDRANT_API_KEY
    RAG_PIPELINE_PATH                    — absolute path to the folder containing
                                            embedder.py / vector_store.py, if
                                            they aren't already importable
    FIREBASE_SERVICE_ACCOUNT, FIREBASE_BUCKET — same as describe_images.py

Optional
--------
    EMBED_SUPERBATCH_SIZE (default 50)   — how many images are embedded and
                                            upserted per batch. A crash mid-run
                                            only costs this many un-checkpointed
                                            images, not the whole sweep. The
                                            embedder's own EMBED_BATCH_SIZE
                                            still governs the actual model
                                            batching within each superbatch.

Usage
-----
    # Dry run: see what would be embedded, no Qdrant writes, no embed calls
    python embed_images.py --document-group <group> --dry-run

    # Real run for one group, to sanity-check before a full sweep
    python embed_images.py --document-group <group>

    # Status breakdown for a scope
    python embed_images.py --document-group <group> --report

    # Full sweep: embed every described image across every manual
    python embed_images.py

    # Re-embed even if qdrantStatus is already "embedded"
    python embed_images.py --document-group <group> --force

NOTE: images embedded this way get chunk_type="image" in Qdrant. If your
retrieval code calls RetrievalPipeline.retrieve() without an explicit
chunk_types argument, it defaults to ["child", "table"] and will NOT include
these — you need to pass chunk_types=["child", "table", "image"] (or change
that default) for these to actually show up in answers. Flagging this rather
than changing retrieval_pipeline.py myself since that file is shared/central
and that default is worth you deciding on deliberately.
"""

import argparse
import logging
import os

from dotenv import load_dotenv

load_dotenv()

from vlm_pipeline.embedding import DEFAULT_BUCKET, report, run
from vlm_pipeline.utils import env_path

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--document-group", default=None, help="Restrict to one documentGroup")
    ap.add_argument("--max-pages", type=int, default=None, help="Only pageNum <= this value")
    ap.add_argument("--limit", type=int, default=None, help="Hard cap on number of docs processed")
    ap.add_argument("--dry-run", action="store_true", help="Show plan only, no embed calls, no Qdrant writes")
    ap.add_argument("--force", action="store_true", help="Re-embed even if qdrantStatus is already 'embedded'")
    ap.add_argument("--service-account", default=env_path("FIREBASE_SERVICE_ACCOUNT", "../serviceAccountKey.json"))
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    ap.add_argument("--report", action="store_true", help="Print qdrantStatus breakdown for the scope and exit")
    args = ap.parse_args()

    if args.report:
        report(args.document_group, args.service_account, args.bucket)
        return

    stats = run(
        document_group=args.document_group,
        max_pages=args.max_pages,
        limit=args.limit,
        dry_run=args.dry_run,
        force=args.force,
        service_account_path=args.service_account,
        bucket_name=args.bucket,
    )

    print()
    print("═" * 70)
    print("EMBED SUMMARY" + ("  (DRY RUN — nothing was called or written)" if args.dry_run else ""))
    print("═" * 70)
    for k, v in stats.items():
        print(f"  {k:<20} {v}")
    print("═" * 70)


if __name__ == "__main__":
    main()