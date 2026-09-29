"""
describe_images.py — VLM image description pipeline (Firebase -> OpenAI -> Firebase)

Pulls image records from the `ManualImages` Firestore collection, downloads
each image from Firebase Storage, deduplicates near-identical images with
perceptual hashing, sends unique images to an OpenAI vision model, and writes
the description + ACTUAL token usage/cost back onto the same Firestore doc.

Three things this version specifically handles:

1. Page-vs-figure ambiguity. Every doc gets an `imageScope` field ("page" or
   "figure") and the stored description is deterministically prefixed with
   which one it is and which page it's on, so a whole-page render and a
   cropped figure from the same page never get confused when filtering later.

2. Diagram accuracy. Anything tagged "diagram" on the first pass automatically
   gets a second, stricter pass using a MORE CAPABLE model (--diagram-model,
   default gpt-6-sol) that forces exhaustive, view-by-view transcription of
   every measurement and callout — stored both in the prose description and
   as a structured `vlmMeasurements` list. The classify pass stays on the
   cheaper --model (default gpt-4o-mini) since accuracy matters far more for
   the numbers than for the initial tag.

3. Real cost tracking. Every OpenAI call's actual response.usage is read and
   priced via vlm_pipeline/pricing.py — not an estimate — and a browser-based
   review page (vlm_review/review.html) is generated so you can visually
   grade each description as Accurate / Partially accurate / Incorrect for
   your FYP evaluation, with the ratings exportable as JSON/CSV.

Fields written to each ManualImages/{docId} on success:
    vlmDescription, vlmTag, imageScope, vlmModel
    vlmMeasurements, vlmHasVisibleMeasurements, vlmDiagramModel (diagrams only)
    vlmOriginalWidth/Height, vlmSentWidth/Height
    vlmInputTokens, vlmOutputTokens, vlmTotalTokens
    vlmInputCostUSD, vlmOutputCostUSD, vlmTotalCostUSD
    phash, vlmStatus, vlmUpdatedAt

Required env vars (a .env file next to this script is loaded automatically)
------------------
    OPENAI_API_KEY               your OpenAI key
    FIREBASE_SERVICE_ACCOUNT     path to serviceAccountKey.json
                                  (default: "../serviceAccountKey.json")
    FIREBASE_BUCKET               default: "rbacfyp.firebasestorage.app"

Install
-------
    pip install firebase-admin openai Pillow imagehash python-dotenv --break-system-packages

Usage
-----
    # Dry run: plan only, no API calls, no writes
    python describe_images.py --document-group panasonic_aircon_CS-PW24KE --max-pages 10 --dry-run

    # Real run, small scope, to sanity-check before a full sweep
    python describe_images.py --document-group panasonic_aircon_CS-PW24KE --max-pages 10

    # Status/scope/tag/cost breakdown for a scope, read-only
    python describe_images.py --document-group panasonic_aircon_CS-PW24KE --report

    # Rebuild the visual review page from Firestore, no OpenAI calls
    python describe_images.py --document-group panasonic_aircon_CS-PW24KE --rebuild-review

    # Full sweep across everything not yet described
    python describe_images.py

    # Re-describe everything, ignoring prior vlmStatus
    python describe_images.py --document-group panasonic_aircon_CS-PW24KE --force

    # Skip the diagram 2nd pass entirely (cheaper, less exact on dimensions)
    python describe_images.py --no-diagram-detail

    # Re-tag everything currently marked "diagram" under the new 5-tag taxonomy
    # (graphs, schematics, and flowcharts that were previously lumped into
    # "diagram" get correctly split out). Only touches docs tagged diagram —
    # photos, icons, tables etc. are left alone. --force is implied.
    python describe_images.py --only-tag diagram

    # Same, but only for one manual, and multiple tags at once
    python describe_images.py --document-group <group> --only-tag diagram,graph

    # Use a different (or cheaper) model for the diagram pass than the default gpt-6-sol
    python describe_images.py --diagram-model gpt-6-astra   # even more capable, ~5x gpt-6-sol cost
    python describe_images.py --diagram-model gpt-4o-mini   # disable the upgrade, same model throughout

NOTE on --diagram-model: gpt-6-sol is current as of Sept 2026 — if your
OpenAI account doesn't yet have access to it (new model rollouts are
sometimes gated), the diagram pass will fail with a clear vlmError on the
affected docs while everything else keeps working. Test with
`--max-pages 1 --force` on a page you know is a diagram before a full sweep.
"""

import argparse
import logging
import os
import sys

from dotenv import load_dotenv

load_dotenv()

from vlm_pipeline.pipeline import DEFAULT_BUCKET, DEFAULT_MODEL, report, run
from vlm_pipeline.review import rebuild_review
from vlm_pipeline.utils import env_path

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--document-group", default=None, help="Restrict to one documentGroup (test scope)")
    ap.add_argument("--max-pages", type=int, default=None, help="Only pageNum <= this value (e.g. 10 for a test run)")
    ap.add_argument("--limit", type=int, default=None, help="Hard cap on number of image docs processed")
    ap.add_argument("--dry-run", action="store_true", help="Show plan + cost estimate, call nothing, write nothing")
    ap.add_argument("--force", action="store_true", help="Re-describe even if vlmStatus is already set")
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"OpenAI vision model for the classify pass (default {DEFAULT_MODEL})")
    ap.add_argument("--diagram-model", default=os.getenv("VLM_DIAGRAM_MODEL", "gpt-6-sol"),
                     help="More capable model used ONLY for the diagram measurement-extraction pass (default: gpt-6-sol). "
                          "Set to the same value as --model to disable the upgrade and use one model throughout.")
    ap.add_argument("--dedup-threshold", type=int, default=5, help="Hamming distance for near-duplicate match (default 5)")
    ap.add_argument("--no-diagram-detail", action="store_true", help="Disable the diagram 2nd-pass measurement extraction")
    ap.add_argument("--service-account", default=env_path("FIREBASE_SERVICE_ACCOUNT", "../serviceAccountKey.json"))
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    ap.add_argument("--report", action="store_true", help="Print status/scope/tag/cost breakdown for the scope and exit")
    ap.add_argument("--rebuild-review", action="store_true", help="Rebuild vlm_review/review.html from already-described docs (no OpenAI calls)")
    ap.add_argument("--only-tag", default=None,
                     help="Comma-separated vlmTag(s) to re-tag, e.g. 'diagram' or 'diagram,graph'. "
                          "Implies --force for the matched docs and skips dedup (they already passed it once). "
                          "Use this after a prompt/taxonomy change to re-classify only what's affected, "
                          "instead of re-running everything.")
    args = ap.parse_args()

    if not args.dry_run and not args.report and not args.rebuild_review and not os.getenv("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY is not set.")

    if args.report:
        report(args.document_group, args.service_account, args.bucket)
        return

    if args.rebuild_review:
        rebuild_review(args.document_group, args.max_pages, args.limit, args.service_account, args.bucket)
        return

    stats = run(
        document_group=args.document_group,
        max_pages=args.max_pages,
        limit=args.limit,
        dry_run=args.dry_run,
        force=args.force,
        model=args.model,
        diagram_model=args.diagram_model,
        dedup_threshold=args.dedup_threshold,
        service_account_path=args.service_account,
        bucket_name=args.bucket,
        diagram_detail=not args.no_diagram_detail,
        only_tags=[t.strip() for t in args.only_tag.split(",")] if args.only_tag else None,
    )
    print(stats.summary(args.dry_run))


if __name__ == "__main__":
    main()