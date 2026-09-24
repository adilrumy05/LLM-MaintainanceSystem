"""describe_images/pipeline.py — VLM description pipeline (Firebase → OpenAI → Firebase).

Pulls image records from the ManualImages Firestore collection, downloads each
image from Firebase Storage, deduplicates near-identical figures, sends unique
images to an OpenAI vision model (with an optional second detailed pass for
diagrams), and writes the description + actual API usage back onto the same
Firestore document.

A token rate limiter keeps total tokens sent to OpenAI within a rolling
60-second window at or below TOKEN_RATE_LIMIT_PER_MIN, so the pipeline
never trips OpenAI's per-minute cap.
"""

import logging
import os
import re
import threading
import time
from collections import Counter, deque
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .dedup import DuplicateIndex, compute_phash
from .firebase_client import FirebaseClient
from .image_info import get_image_dimensions, resize_for_vlm
from .pricing import calculate_cost
from .review import REVIEW_DIR, generate_review_html
from .scope import determine_scope, scope_label
from .utils import page_num_display
from .vlm import classify_image, describe_diagram_detailed

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger("describe_images.pipeline")

DEFAULT_MODEL = os.getenv("VLM_MODEL", "gpt-4o-mini")
DEFAULT_BUCKET = os.getenv("FIREBASE_BUCKET", "rbacfyp.firebasestorage.app")

# OpenAI tokens-per-minute cap for this model/account tier.
TOKEN_RATE_LIMIT_PER_MIN = int(os.getenv("VLM_TOKEN_LIMIT_PER_MIN"))

# Conservative first-call estimate (image tiles + prompt + max output).
# Updated to the real value after each call.
DEFAULT_TOKEN_ESTIMATE = int(os.getenv("VLM_TOKEN_ESTIMATE"))


# ──────────────────────────────────────────────────────────────────────────────
# Token rate limiter (sliding 60-second window)
# ──────────────────────────────────────────────────────────────────────────────

class TokenRateLimiter:
    """
    Blocks before each OpenAI call so total tokens sent in any rolling
    60-second window stays at or below `limit_per_minute`.

    Usage:
        waited = limiter.wait_for_capacity(estimated_tokens)
        response = call_openai(...)
        limiter.record(actual_total_tokens)
    """

    def __init__(self, limit_per_minute: int, window_seconds: float = 60.0):
        self.limit = limit_per_minute
        self.window = window_seconds
        self._events: deque = deque()  # (monotonic_ts, tokens)
        self._lock = threading.Lock()

    def _prune(self, now: float) -> None:
        cutoff = now - self.window
        while self._events and self._events[0][0] < cutoff:
            self._events.popleft()

    def _tokens_in_window(self, now: float) -> int:
        self._prune(now)
        return sum(t for _, t in self._events)

    def wait_for_capacity(self, estimated_tokens: int) -> float:
        """Block until `estimated_tokens` fits. Returns seconds slept."""
        total_slept = 0.0

        while True:
            with self._lock:
                now = time.monotonic()
                used = self._tokens_in_window(now)

                if used + estimated_tokens <= self.limit:
                    return total_slept

                oldest_ts, _ = self._events[0]
                sleep_for = max(0.5, (oldest_ts + self.window) - now)

            logger.info(
                f"Rate limit: {used:,}/{self.limit:,} tokens in window — "
                f"sleeping {sleep_for:.1f}s"
            )
            time.sleep(sleep_for)
            total_slept += sleep_for

    def record(self, tokens: int) -> None:
        """Record actual usage after a call completes."""
        if tokens <= 0:
            return
        with self._lock:
            self._events.append((time.monotonic(), tokens))


# ──────────────────────────────────────────────────────────────────────────────
# Run statistics
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class RunStats:
    scanned: int = 0
    already_done: int = 0
    duplicates: int = 0
    described: int = 0
    diagrams_detailed: int = 0
    errors: int = 0
    scope_counts: Counter = field(default_factory=Counter)
    tag_counts: Counter = field(default_factory=Counter)

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    total_input_cost_usd: float = 0.0
    total_output_cost_usd: float = 0.0
    total_cost_usd: float = 0.0

    total_rate_limit_wait_s: float = 0.0

    def add_usage(self, input_tokens: int, output_tokens: int, total_tokens: int,
                   input_cost: float, output_cost: float, total_cost: float) -> None:
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.total_tokens += total_tokens
        self.total_input_cost_usd += input_cost
        self.total_output_cost_usd += output_cost
        self.total_cost_usd += total_cost

    def summary(self, dry_run: bool) -> str:
        lines = [
            "",
            "═" * 70,
            "RUN SUMMARY" + ("  (DRY RUN — nothing was called or written)" if dry_run else ""),
            "═" * 70,
            f"  Images scanned:          {self.scanned}",
            f"  Already described:       {self.already_done}  (skipped, use --force to redo)",
            f"  Near-duplicates:         {self.duplicates}  (no VLM call, tagged skipped_duplicate)",
            f"  Sent to VLM:             {self.described}",
            f"  Of which diagrams (2nd pass for exact measurements): {self.diagrams_detailed}",
            f"  Errors:                  {self.errors}",
        ]
        if self.scope_counts:
            lines.append(f"  By scope:                {dict(self.scope_counts)}")
        if self.tag_counts:
            lines.append(f"  By content_type:         {dict(self.tag_counts)}")

        lines += [
            "",
            "  TOKEN USAGE (actual, from OpenAI response.usage)",
            f"  Input tokens:            {self.total_input_tokens:,}",
            f"  Output tokens:           {self.total_output_tokens:,}",
            f"  Total tokens:            {self.total_tokens:,}",
            "",
            "  ACTUAL VLM COST",
            f"  Input cost:              ${self.total_input_cost_usd:.8f}",
            f"  Output cost:             ${self.total_output_cost_usd:.8f}",
            f"  TOTAL VLM COST:          ${self.total_cost_usd:.8f}",
            "",
            "  RATE LIMITING",
            f"  Time spent waiting:      {self.total_rate_limit_wait_s:.1f}s",
            "═" * 70,
        ]
        return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────────────
# Main pipeline
# ──────────────────────────────────────────────────────────────────────────────

def run(
    document_group: Optional[str],
    max_pages: Optional[int],
    limit: Optional[int],
    dry_run: bool,
    force: bool,
    model: str,
    dedup_threshold: int,
    service_account_path: str,
    bucket_name: str,
    diagram_detail: bool = True,
) -> RunStats:
    fb = FirebaseClient(service_account_path, bucket_name)

    openai_client = None
    if not dry_run:
        from openai import OpenAI
        openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    docs = fb.fetch_image_docs(document_group=document_group, max_pages=max_pages, limit=limit)
    logger.info(f"Found {len(docs)} image doc(s) matching scope")

    dupe_index = DuplicateIndex(threshold=dedup_threshold)
    stats = RunStats()
    review_items: List[Dict[str, Any]] = []
    if not dry_run:
        os.makedirs(REVIEW_DIR, exist_ok=True)

    limiter = TokenRateLimiter(limit_per_minute=TOKEN_RATE_LIMIT_PER_MIN)
    last_token_estimate = DEFAULT_TOKEN_ESTIMATE

    for doc in docs:
        stats.scanned += 1
        doc_id = doc["_id"]
        storage_path = doc.get("storagePath", "")
        image_name = doc.get("imageName", "")
        page_display = page_num_display(doc.get("pageNum"))
        scope = determine_scope(image_name)
        label = scope_label(scope, page_display)
        existing_status = doc.get("vlmStatus")

        if existing_status in ("described", "skipped_duplicate") and not force:
            stats.already_done += 1
            if doc.get("phash"):
                dupe_index.add_representative(doc_id, doc["phash"])
            continue

        if not storage_path:
            logger.warning(f"[{doc_id}] missing storagePath, skipping")
            stats.errors += 1
            continue

        try:
            image_bytes = fb.download_image_bytes(storage_path)
        except Exception as e:
            logger.warning(f"[{doc_id}] download failed: {e}")
            stats.errors += 1
            if not dry_run:
                fb.update_doc(doc_id, {"vlmStatus": "error", "vlmError": f"download: {e}", "imageScope": scope})
            continue

        original_width, original_height = get_image_dimensions(image_bytes)
        phash = compute_phash(image_bytes)

        # Dedup only ever applies to figure-scope crops matching OTHER figure-scope
        # crops (repeated icons/arrows/logos). Page-scope renders are NEVER checked
        # against the index and NEVER added to it:
        #   - every page must get at least one description, no matter what
        #   - a figure crop must never be discarded for merely resembling the
        #     full page it was cut from (a small photo can dominate a page's
        #     coarse visual hash even at ~20% area, which would otherwise wipe
        #     out the one description with enough resolution to say anything
        #     specific about it)
        dup_of = dupe_index.find_duplicate(phash) if (phash and scope != "page") else None

        if dup_of:
            stats.duplicates += 1
            logger.info(f"[{doc_id}] page={page_display} near-duplicate of {dup_of} — skipping VLM")
            if not dry_run:
                fb.update_doc(doc_id, {
                    "phash": phash,
                    "imageScope": scope,
                    "vlmStatus": "skipped_duplicate",
                    "duplicateOf": dup_of,
                    "vlmOriginalWidth": original_width,
                    "vlmOriginalHeight": original_height,
                    "vlmInputTokens": 0, "vlmOutputTokens": 0, "vlmTotalTokens": 0,
                    "vlmInputCostUSD": 0.0, "vlmOutputCostUSD": 0.0, "vlmTotalCostUSD": 0.0,
                })
            continue

        if phash and scope != "page":
            dupe_index.add_representative(doc_id, phash)

        if dry_run:
            logger.info(f"[{doc_id}] page={page_display} would call VLM  ({label}, original={original_width}x{original_height})")
            continue

        small, sent_width, sent_height = resize_for_vlm(image_bytes)

        try:
            context_line = (
                f"This is {label} from document group '{document_group or doc.get('documentGroup', '')}', "
                f"file '{doc.get('filename', '')}'."
            )

            # ── Rate limit + classify ─────────────────────────────────────
            stats.total_rate_limit_wait_s += limiter.wait_for_capacity(last_token_estimate)
            result = classify_image(openai_client, model, small, context_line)
            limiter.record(result["total_tokens"])
            last_token_estimate = max(1, result["total_tokens"])

            content_type = result["content_type"]
            in_tok, out_tok, tot_tok = result["input_tokens"], result["output_tokens"], result["total_tokens"]
            measurements = None

            if content_type == "diagram" and diagram_detail:
                # ── Rate limit + detailed diagram pass ────────────────────
                stats.total_rate_limit_wait_s += limiter.wait_for_capacity(last_token_estimate)
                detailed = describe_diagram_detailed(openai_client, model, small, context_line)
                limiter.record(detailed["total_tokens"])
                last_token_estimate = max(1, detailed["total_tokens"])

                result["description"] = detailed["description"] or result["description"]
                measurements = detailed["measurements"]
                in_tok += detailed["input_tokens"]
                out_tok += detailed["output_tokens"]
                tot_tok += detailed["total_tokens"]
                stats.diagrams_detailed += 1

            input_cost, output_cost, total_cost = calculate_cost(in_tok, out_tok, model)
            stats.described += 1
            stats.scope_counts[scope] += 1
            stats.tag_counts[content_type] += 1
            stats.add_usage(in_tok, out_tok, tot_tok, input_cost, output_cost, total_cost)

            final_description = f"[{label}] {result['description']}".strip()

            # Save locally for the visual review page.
            safe_doc_id = re.sub(r"[^a-zA-Z0-9_-]", "_", doc_id)
            image_filename = f"{stats.described:04d}_{safe_doc_id}.jpg"
            with open(os.path.join(REVIEW_DIR, image_filename), "wb") as image_file:
                image_file.write(image_bytes)

            review_items.append({
                "image": image_filename,
                "doc_id": doc_id,
                "page": page_display,
                "document_group": doc.get("documentGroup", ""),
                "description": final_description,
                "tag": content_type,
                "image_scope": scope,
                "measurements": measurements or [],
                "model": model,
                "original_width": original_width,
                "original_height": original_height,
                "sent_width": sent_width,
                "sent_height": sent_height,
                "input_tokens": in_tok,
                "output_tokens": out_tok,
                "total_tokens": tot_tok,
                "cost": total_cost,
            })

            fields = {
                "vlmDescription": final_description,
                "vlmTag": content_type,
                "imageScope": scope,
                "vlmModel": model,
                "vlmOriginalWidth": original_width,
                "vlmOriginalHeight": original_height,
                "vlmSentWidth": sent_width,
                "vlmSentHeight": sent_height,
                "vlmInputTokens": in_tok,
                "vlmOutputTokens": out_tok,
                "vlmTotalTokens": tot_tok,
                "vlmInputCostUSD": input_cost,
                "vlmOutputCostUSD": output_cost,
                "vlmTotalCostUSD": total_cost,
                "phash": phash or "",
                "vlmStatus": "described",
            }
            if measurements is not None:
                fields["vlmMeasurements"] = measurements
            fb.update_doc(doc_id, fields)

            print()
            print("─" * 70)
            print(f"[IMAGE] {doc_id}")
            print(f"  {label}")
            print(f"  Storage:              {storage_path}")
            print(f"  Original dimensions:  {original_width} x {original_height}")
            print(f"  Sent dimensions:      {sent_width} x {sent_height}")
            print(f"  Tag:                  {content_type}")
            print(f"  Model:                {model}")
            print(f"  Input / output / total tokens: {in_tok:,} / {out_tok:,} / {tot_tok:,}")
            print(f"  Cost:                 ${total_cost:.8f}")
            if measurements:
                print(f"  Measurements extracted: {len(measurements)}")
            print()
            print("  DESCRIPTION:")
            print(f"  {final_description}")
            print("─" * 70)

        except Exception as e:
            logger.warning(f"[{doc_id}] VLM/write failed: {e}")
            stats.errors += 1
            fb.update_doc(doc_id, {
                "vlmStatus": "error", "vlmError": str(e), "imageScope": scope,
                "vlmOriginalWidth": original_width, "vlmOriginalHeight": original_height,
                "vlmSentWidth": sent_width, "vlmSentHeight": sent_height,
            })

        time.sleep(0.2)

    if review_items:
        generate_review_html(review_items)

    return stats


# ──────────────────────────────────────────────────────────────────────────────
# Report
# ──────────────────────────────────────────────────────────────────────────────

def report(document_group: Optional[str], service_account_path: str, bucket_name: str) -> None:
    fb = FirebaseClient(service_account_path, bucket_name)
    docs = fb.fetch_image_docs(document_group=document_group)

    status_counts = Counter(d.get("vlmStatus", "pending") for d in docs)
    tag_counts = Counter(d.get("vlmTag") for d in docs if d.get("vlmTag"))
    scope_counts = Counter(d.get("imageScope") for d in docs if d.get("imageScope"))
    scope_tag_counts = Counter(
        (d.get("imageScope"), d.get("vlmTag")) for d in docs if d.get("imageScope") and d.get("vlmTag")
    )

    print(f"\nTotal images in scope: {len(docs)}")

    print("\nBy vlmStatus:")
    for k, v in status_counts.most_common():
        print(f"  {k:<20} {v}")

    print("\nBy imageScope:")
    for k, v in scope_counts.most_common():
        print(f"  {k:<20} {v}")

    print("\nBy vlmTag (candidates for cleanup, e.g. icon_arrow / decorative):")
    for k, v in tag_counts.most_common():
        print(f"  {k:<20} {v}")

    print("\nBy (imageScope, vlmTag) — use this to spot page-vs-figure overlap:")
    for (scope, tag), v in scope_tag_counts.most_common():
        print(f"  {scope:<8} {tag:<15} {v}")

    total_input_tokens = total_output_tokens = total_tokens = 0
    total_input_cost = total_output_cost = total_cost = 0.0
    described_count = 0

    for doc in docs:
        if doc.get("vlmStatus") != "described":
            continue
        described_count += 1
        total_input_tokens += int(doc.get("vlmInputTokens", 0) or 0)
        total_output_tokens += int(doc.get("vlmOutputTokens", 0) or 0)
        total_tokens += int(doc.get("vlmTotalTokens", 0) or 0)
        total_input_cost += float(doc.get("vlmInputCostUSD", 0) or 0)
        total_output_cost += float(doc.get("vlmOutputCostUSD", 0) or 0)
        total_cost += float(doc.get("vlmTotalCostUSD", 0) or 0)

    error_docs = [d for d in docs if d.get("vlmStatus") == "error"]
    if error_docs:
        print(f"\n{len(error_docs)} errored image(s) — reason stored per-doc in vlmError:")
        for d in error_docs[:20]:
            print(f"  [{d['_id']}] page={d.get('pageNum', '?')}  {d.get('vlmError', '(no message stored)')}")
        if len(error_docs) > 20:
            print(f"  ... and {len(error_docs) - 20} more")

    print()
    print("═" * 70)
    print("STORED VLM COST (sum of vlmTotalCostUSD already written to Firestore)")
    print("═" * 70)
    print(f"  Described images:       {described_count}")
    print(f"  Input tokens:           {total_input_tokens:,}")
    print(f"  Output tokens:          {total_output_tokens:,}")
    print(f"  Total tokens:           {total_tokens:,}")
    print()
    print(f"  Input cost:             ${total_input_cost:.8f}")
    print(f"  Output cost:            ${total_output_cost:.8f}")
    print(f"  TOTAL VLM COST:         ${total_cost:.8f}")
    print("═" * 70)