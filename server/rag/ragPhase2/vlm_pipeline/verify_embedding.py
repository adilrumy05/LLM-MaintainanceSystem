"""
verify_embedding.py — verify that every image in Firebase for a given
document group actually made it into Qdrant.

Answers: "did every image for manual X get all the way through the VLM +
embedding pipeline?"

Three levels per image:
  1. vlmStatus    — was it described by the VLM pass at all?
  2. qdrantStatus — did embedding.py *mark* it as embedded in Firestore?
  3. Qdrant presence — is the point actually retrievable from Qdrant?
                       (only with --verify-qdrant; hits Qdrant directly)

Level 3 is the one that catches drift: Firestore says embedded but the
collection was recreated, or a batch upsert silently failed partway.
Without it you're just trusting the checkpoint field.

Expected non-embedded images:
  docs with vlmStatus == "skipped_duplicate" have no vlmDescription of
  their own, so embedding.py deliberately skips them (they're dedup-
  collapsed into a representative). They're counted separately here, not
  flagged as a problem.

Usage:
  # Fast: trust Firestore's qdrantStatus field only
  python verify_embedding.py --document-group panasonic_aircon_CS-PW24KE

  # Strict: also hit Qdrant for every expected point id
  python verify_embedding.py --document-group panasonic_aircon_CS-PW24KE --verify-qdrant

  # Show the doc ids of anything missing (up to --show-limit)
  python verify_embedding.py --document-group panasonic_aircon_CS-PW24KE \
      --verify-qdrant --show-missing

Exit code is non-zero if anything in scope is missing.
"""

import argparse
import logging
import os
import sys
from collections import Counter
from typing import Dict, Iterable, List, Optional, Set

# --- Make this script runnable from either ragPhase2/ OR vlm_pipeline/ ---
# If we're being executed as a plain file, sys.path[0] is the *script's*
# directory, not its parent. That makes `vlm_pipeline` unimportable when
# the script sits inside the package (which it does). Detect that case
# and prepend the parent so `import vlm_pipeline.*` resolves.
_here = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if os.path.basename(_here) == "vlm_pipeline" and _parent not in sys.path:
    sys.path.insert(0, _parent)
# ------------------------------------------------------------------------

from dotenv import load_dotenv

load_dotenv()

from vlm_pipeline.embedding import _point_id, DEFAULT_BUCKET
from vlm_pipeline.firebase_client import FirebaseClient
from vlm_pipeline.utils import env_path

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")
logger = logging.getLogger("verify_embedding")

def _expected_point_ids(docs: Iterable[dict]) -> Dict[str, int]:
    """doc_id -> int point id, using embedding.py's exact scheme.

    embedding.py builds the chunk id as f"image::{doc_id}" and then
    VectorStore hashes that to a point id. We replicate the same so we
    can ask Qdrant for precisely the id it would have been assigned.
    """
    return {d["_id"]: _point_id(f"image::{d['_id']}") for d in docs}


def _get_vector_store():
    # Imported lazily so the fast (Firestore-only) mode doesn't require
    # embedder.py / vector_store.py to be importable at all.
    from vector_store import VectorStore  # noqa: from RAG_PIPELINE_PATH
    return VectorStore()


def _query_existing_point_ids(vs, point_ids: List[int], batch_size: int = 256) -> Set[int]:
    """Fetch the subset of point_ids that actually exist in Qdrant."""
    existing: Set[int] = set()
    for i in range(0, len(point_ids), batch_size):
        batch = point_ids[i:i + batch_size]
        records = vs.client.retrieve(
            collection_name=vs.collection,
            ids=batch,
            with_payload=False,
            with_vectors=False,
        )
        for r in records:
            try:
                existing.add(int(r.id))
            except (TypeError, ValueError):
                # Defensive: only reachable if the collection was populated
                # with UUID-style ids by something other than embedding.py.
                logger.warning(f"Non-integer point id returned by Qdrant: {r.id!r}")
    return existing


def run(
    document_group: str,
    max_pages: Optional[int],
    limit: Optional[int],
    service_account_path: str,
    bucket_name: str,
    verify_qdrant: bool,
    show_missing: bool,
    show_limit: int,
) -> int:
    fb = FirebaseClient(service_account_path, bucket_name)
    docs = fb.fetch_image_docs(document_group=document_group, max_pages=max_pages, limit=limit)
    logger.info(f"{len(docs)} image doc(s) in scope")

    if not docs:
        print("No image docs matched the filter.")
        return 0

    by_vlm: Counter = Counter()
    by_qdrant_flag: Counter = Counter()
    not_described: List[dict] = []
    described_not_flagged: List[dict] = []

    for d in docs:
        vlm = d.get("vlmStatus", "pending")
        qd = d.get("qdrantStatus", "not_embedded")
        by_vlm[vlm] += 1
        by_qdrant_flag[qd] += 1

        if vlm == "described":
            if qd != "embedded":
                described_not_flagged.append(d)
        elif vlm == "skipped_duplicate":
            # Expected to be absent from Qdrant by design.
            pass
        else:
            not_described.append(d)

    print(f"\nScope: document_group={document_group!r}  max_pages={max_pages}  limit={limit}")
    print(f"Total image docs: {len(docs)}")

    print("\nvlmStatus:")
    for k, v in by_vlm.most_common():
        print(f"  {k:<24} {v}")

    print("\nqdrantStatus (Firestore flag):")
    for k, v in by_qdrant_flag.most_common():
        print(f"  {k:<24} {v}")

    qdrant_missing: List[dict] = []
    qdrant_orphan_ids: List[int] = []
    expected_count = actual_count = 0

    if verify_qdrant:
        described = [d for d in docs if d.get("vlmStatus") == "described"]
        expected = _expected_point_ids(described)
        expected_count = len(expected)

        logger.info(f"Querying Qdrant for {expected_count} expected point id(s)...")
        vs = _get_vector_store()
        existing = _query_existing_point_ids(vs, list(expected.values()))
        actual_count = len(existing)
        logger.info(f"Qdrant returned {actual_count} of {expected_count}")

        for d in described:
            pid = expected[d["_id"]]
            if pid not in existing:
                qdrant_missing.append(d)
            elif d.get("qdrantStatus") != "embedded":
                qdrant_orphan_ids.append(pid)

        print(f"\nStrict Qdrant verification (collection={vs.collection!r}):")
        print(f"  expected points:                            {expected_count}")
        print(f"  actually present in Qdrant:                 {actual_count}")
        print(f"  expected but missing from Qdrant:           {len(qdrant_missing)}")
        print(f"  present in Qdrant but Firestore flag stale: {len(qdrant_orphan_ids)}")

    # --- Verdict --------------------------------------------------------
    print("\n=== Verdict ===")
    problems = 0

    if not_described:
        problems += len(not_described)
        print(f"  {len(not_described)} image(s) have no VLM description yet "
              f"-> re-run: python describe_images.py --document-group {document_group}")

    if described_not_flagged:
        problems += len(described_not_flagged)
        print(f"  {len(described_not_flagged)} described image(s) not marked embedded "
              f"-> re-run: python embedding.py ... (or your embedding entrypoint)")

    if verify_qdrant and qdrant_missing:
        problems += len(qdrant_missing)
        print(f"  {len(qdrant_missing)} described image(s) MISSING from Qdrant entirely "
              f"(collection recreated, or upsert failed). Re-run embedding with --force.")

    if verify_qdrant and qdrant_orphan_ids:
        # Not a correctness problem, just bookkeeping drift. Call it out
        # but don't fail the run on it.
        print(f"  NOTE: {len(qdrant_orphan_ids)} point(s) exist in Qdrant but Firestore "
              f"isn't marked embedded. Probably a crash between upsert and update_doc. "
              f"Re-running embedding.py will reconcile the flag (it's idempotent on upsert).")

    if problems == 0:
        scope = "described and embedded" if verify_qdrant else "described and marked embedded"
        print(f"  ALL CLEAR — every image in this scope is {scope}.")

    # --- Optional listings ---------------------------------------------
    if show_missing:
        def _dump(label: str, items: List[dict]):
            if not items:
                return
            print(f"\n{label} ({len(items)}):")
            for d in items[:show_limit]:
                print(f"  [{d['_id']}]  page={d.get('pageNum')}  file={d.get('filename')}")
            if len(items) > show_limit:
                print(f"  ... and {len(items) - show_limit} more")

        _dump("Not yet described", not_described)
        _dump("Described but not marked embedded", described_not_flagged)
        if verify_qdrant:
            _dump("Missing from Qdrant", qdrant_missing)

    return 0 if problems == 0 else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--document-group", required=True, help="Which manual to verify (single group only)")
    ap.add_argument("--max-pages", type=int, default=None)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--verify-qdrant", action="store_true",
                    help="Also fetch each expected point id from Qdrant (definitive, slower)")
    ap.add_argument("--show-missing", action="store_true",
                    help="Print doc id / page / filename of anything that's missing")
    ap.add_argument("--show-limit", type=int, default=50,
                    help="Cap on how many missing entries --show-missing prints (default 50)")
    ap.add_argument("--service-account", default=env_path("FIREBASE_SERVICE_ACCOUNT", "../serviceAccountKey.json"))
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    args = ap.parse_args()

    sys.exit(run(
        document_group=args.document_group,
        max_pages=args.max_pages,
        limit=args.limit,
        service_account_path=args.service_account,
        bucket_name=args.bucket,
        verify_qdrant=args.verify_qdrant,
        show_missing=args.show_missing,
        show_limit=args.show_limit,
    ))


if __name__ == "__main__":
    main()