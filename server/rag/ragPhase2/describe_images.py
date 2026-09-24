"""
describe_images.py — VLM image description pipeline (Firebase → OpenAI → Firebase)

Pulls image records from the ManualImages Firestore collection, downloads each
image from Firebase Storage, deduplicates near-identical images, sends unique
images to an OpenAI vision model, and writes the description + actual API usage
back onto the same Firestore document.

Fields written per successfully described image:
    vlmDescription, vlmTag, vlmModel
    vlmOriginalWidth, vlmOriginalHeight, vlmSentWidth, vlmSentHeight
    vlmInputTokens, vlmOutputTokens, vlmTotalTokens
    vlmInputCostUSD, vlmOutputCostUSD, vlmTotalCostUSD
    phash, vlmStatus, vlmUpdatedAt

Also prints per-image usage/cost and a final run total, and generates a
browser-based visual review page (vlm_review/review.html) with manual
accuracy-evaluation fields for FYP validation.

IMPORTANT: cost calculation uses the actual token usage returned by the OpenAI
API. The prices in MODEL_PRICING must match the model/pricing you are using.
"""

import argparse
import base64
import html
import io
import json
import logging
import os
import re
import sys
import time

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()


# ──────────────────────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
)
logger = logging.getLogger("describe_images")


# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────

COLLECTION_NAME = "ManualImages"
DEFAULT_MODEL = os.getenv("VLM_MODEL", "gpt-4o-mini")
DEFAULT_BUCKET = os.getenv("FIREBASE_BUCKET", "rbacfyp.firebasestorage.app")

# Maximum image dimension (px) sent to the VLM.
VLM_MAX_IMAGE_SIDE = int(os.getenv("VLM_MAX_IMAGE_SIDE", "1024"))

# Local visual review output.
REVIEW_DIR = "vlm_review"
REVIEW_HTML = os.path.join(REVIEW_DIR, "review.html")


# ──────────────────────────────────────────────────────────────────────────────
# OpenAI pricing — USD per 1 MILLION tokens.
# Update these values if you change VLM_MODEL or OpenAI changes pricing.
# ──────────────────────────────────────────────────────────────────────────────

MODEL_PRICING = {
    "gpt-4o-mini": {
        "input_per_1m": 0.15,
        "output_per_1m": 0.60,
    },
}


def get_model_pricing(model: str) -> Tuple[float, float]:
    """Return (input_price_per_1M, output_price_per_1M) for the given model."""
    if model not in MODEL_PRICING:
        raise ValueError(
            f"No pricing configured for model '{model}'. "
            f"Add it to MODEL_PRICING before running."
        )

    pricing = MODEL_PRICING[model]
    return pricing["input_per_1m"], pricing["output_per_1m"]


def calculate_cost(
    input_tokens: int,
    output_tokens: int,
    model: str,
) -> Tuple[float, float, float]:
    """
    Calculate actual API cost from the token usage returned by OpenAI.

    Returns:
        input_cost_usd, output_cost_usd, total_cost_usd
    """
    input_price_per_1m, output_price_per_1m = get_model_pricing(model)

    input_cost = (input_tokens / 1_000_000) * input_price_per_1m
    output_cost = (output_tokens / 1_000_000) * output_price_per_1m
    total_cost = input_cost + output_cost

    return input_cost, output_cost, total_cost


# ──────────────────────────────────────────────────────────────────────────────
# VLM prompt
# ──────────────────────────────────────────────────────────────────────────────

VALID_TAGS = {
    "diagram",
    "icon_arrow",
    "photo",
    "table_image",
    "decorative",
}

VLM_SYSTEM_PROMPT = (
    "You are labeling images extracted from technical service/repair manuals "
    "(appliances like air conditioners). For the given image, respond with ONLY "
    "a JSON object, no markdown fences, no extra text, in this exact shape:\n"
    '{"description": "<2-4 sentence factual description of what the image shows, '
    'including any visible labels, part names, wiring/pipe colors, or values>", '
    '"content_type": "<one of: diagram, icon_arrow, photo, table_image, decorative>"}\n\n'
    "content_type guide:\n"
    "- diagram: wiring diagrams, exploded parts diagrams, flowcharts, schematics\n"
    "- icon_arrow: small arrows, bullet icons, warning triangles, single UI glyphs "
    "with no real informational content on their own\n"
    "- photo: a real photograph of a unit, part, or installation\n"
    "- table_image: a table that was captured as an image rather than text\n"
    "- decorative: logos, page borders, blank/near-blank scans, unreadable noise\n"
    "If the image is unreadable or blank, still return valid JSON with an empty "
    'description and content_type "decorative".'
)


# ──────────────────────────────────────────────────────────────────────────────
# Env / helpers
# ──────────────────────────────────────────────────────────────────────────────

def _env_path(name: str, default: str) -> str:
    """Read an env var, falling back to a default."""
    return os.getenv(name, default)


def _page_num_int(page_num_field: str) -> Optional[int]:
    """Extract the integer from a page field like 'page_7' → 7."""
    if not page_num_field:
        return None

    m = re.search(r"(\d+)", str(page_num_field))
    return int(m.group(1)) if m else None


def _hamming(a: str, b: str) -> int:
    """Hamming distance between two equal-length hex hash strings."""
    try:
        ia, ib = int(a, 16), int(b, 16)
    except (TypeError, ValueError):
        return 999

    return bin(ia ^ ib).count("1")


# ──────────────────────────────────────────────────────────────────────────────
# Image information
# ──────────────────────────────────────────────────────────────────────────────

def get_image_dimensions(image_bytes: bytes) -> Tuple[Optional[int], Optional[int]]:
    """Return (width, height) of an image, or (None, None) on failure."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        return img.width, img.height

    except Exception as e:
        logger.warning(f"Could not determine image dimensions: {e}")
        return None, None


def resize_for_vlm(
    image_bytes: bytes,
    max_side: int = VLM_MAX_IMAGE_SIDE,
) -> Tuple[bytes, Optional[int], Optional[int]]:
    """
    Resize image before sending to VLM so the longest side is <= max_side.

    Returns:
        resized_bytes, sent_width, sent_height
    """
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        scale = max_side / max(w, h)

        if scale < 1:
            new_w = int(w * scale)
            new_h = int(h * scale)
            img = img.resize((new_w, new_h))

        sent_w, sent_h = img.size

        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85)

        return out.getvalue(), sent_w, sent_h

    except Exception as e:
        logger.warning(f"resize failed, sending original bytes: {e}")

        # Try to determine dimensions even if resizing failed.
        original_w, original_h = get_image_dimensions(image_bytes)
        return image_bytes, original_w, original_h


# ──────────────────────────────────────────────────────────────────────────────
# Firebase
# ──────────────────────────────────────────────────────────────────────────────

class FirebaseClient:
    """Thin wrapper around Firestore + Storage for image documents."""

    def __init__(self, service_account_path: str, bucket_name: str):
        import firebase_admin
        from firebase_admin import credentials, firestore, storage

        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})

        self.db = firestore.client()
        self.bucket = storage.bucket()

        logger.info(f"Firebase connected: bucket={bucket_name}")

    def fetch_image_docs(
        self,
        document_group: Optional[str] = None,
        max_pages: Optional[int] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Fetch ManualImages docs, optionally filtered by documentGroup/max page/limit."""
        query = self.db.collection(COLLECTION_NAME)

        if document_group:
            query = query.where("documentGroup", "==", document_group)

        docs = []

        for snap in query.stream():
            data = snap.to_dict() or {}
            data["_id"] = snap.id

            if max_pages is not None:
                pn = _page_num_int(data.get("pageNum"))
                if pn is not None and pn > max_pages:
                    continue

            docs.append(data)

            if limit is not None and len(docs) >= limit:
                break

        return docs

    def download_image_bytes(self, storage_path: str) -> bytes:
        """Download the raw bytes for a Storage blob."""
        blob = self.bucket.blob(storage_path)
        return blob.download_as_bytes()

    def update_doc(self, doc_id: str, fields: Dict[str, Any]) -> None:
        """Update a ManualImages doc, stamping vlmUpdatedAt automatically."""
        from firebase_admin import firestore

        fields = dict(fields)
        fields["vlmUpdatedAt"] = firestore.SERVER_TIMESTAMP

        self.db.collection(COLLECTION_NAME).document(doc_id).update(fields)


# ──────────────────────────────────────────────────────────────────────────────
# Perceptual hashing / de-dup
# ──────────────────────────────────────────────────────────────────────────────

def compute_phash(image_bytes: bytes) -> Optional[str]:
    """Compute a perceptual hash string, or None if hashing fails."""
    try:
        from PIL import Image
        import imagehash

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return str(imagehash.phash(img))

    except Exception as e:
        logger.warning(f"phash failed: {e}")
        return None


class DuplicateIndex:
    """Greedy near-duplicate detector using a Hamming-distance threshold."""

    def __init__(self, threshold: int = 5):
        self.threshold = threshold
        self._representatives: List[Tuple[str, str]] = []

    def find_duplicate(self, phash: str) -> Optional[str]:
        """Return doc_id of the first representative within the threshold, else None."""
        for doc_id, rep_hash in self._representatives:
            if _hamming(phash, rep_hash) <= self.threshold:
                return doc_id
        return None

    def add_representative(self, doc_id: str, phash: str) -> None:
        """Register a doc as a representative for future duplicate checks."""
        self._representatives.append((doc_id, phash))


# ──────────────────────────────────────────────────────────────────────────────
# OpenAI vision call
# ──────────────────────────────────────────────────────────────────────────────

def describe_with_vlm(client, model: str, image_bytes: bytes) -> Dict[str, Any]:
    """
    Send one image to the OpenAI vision model and return the parsed result.

    Returns a dict with: description, content_type, token counts and costs.
    """
    b64 = base64.b64encode(image_bytes).decode("utf-8")

    resp = client.chat.completions.create(
        model=model,
        max_tokens=300,
        messages=[
            {
                "role": "system",
                "content": VLM_SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Describe this image from a service manual.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": "data:image/jpeg;base64," + b64},
                    },
                ],
            },
        ],
    )

    raw = resp.choices[0].message.content.strip()

    # Remove accidental markdown fences.
    raw = re.sub(
        r"^```(json)?|```$",
        "",
        raw.strip(),
        flags=re.MULTILINE,
    ).strip()

    parsed = json.loads(raw)

    description = str(parsed.get("description", "")).strip()
    content_type = str(parsed.get("content_type", "")).strip().lower()

    if content_type not in VALID_TAGS:
        content_type = "decorative" if not description else "photo"

    # Actual usage returned by OpenAI.
    usage = getattr(resp, "usage", None)

    if usage is not None:
        input_tokens = int(getattr(usage, "prompt_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "completion_tokens", 0) or 0)
        total_tokens = int(
            getattr(usage, "total_tokens", input_tokens + output_tokens) or 0
        )
    else:
        logger.warning("OpenAI response did not contain usage information.")
        input_tokens = 0
        output_tokens = 0
        total_tokens = 0

    input_cost, output_cost, total_cost = calculate_cost(
        input_tokens, output_tokens, model
    )

    return {
        "description": description,
        "content_type": content_type,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "input_cost_usd": input_cost,
        "output_cost_usd": output_cost,
        "total_cost_usd": total_cost,
    }


# ──────────────────────────────────────────────────────────────────────────────
# Run statistics
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class RunStats:
    """Aggregated counters + token/cost totals for a single pipeline run."""

    scanned: int = 0
    already_done: int = 0
    duplicates: int = 0
    described: int = 0
    errors: int = 0

    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0

    total_input_cost_usd: float = 0.0
    total_output_cost_usd: float = 0.0
    total_cost_usd: float = 0.0

    def add_usage(
        self,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        input_cost: float,
        output_cost: float,
        total_cost: float,
    ) -> None:
        """Accumulate token/cost usage from one VLM call."""
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.total_tokens += total_tokens
        self.total_input_cost_usd += input_cost
        self.total_output_cost_usd += output_cost
        self.total_cost_usd += total_cost

    def summary(self, dry_run: bool) -> str:
        """Return the final run-summary text block."""
        lines = [
            "",
            "═" * 70,
            "RUN SUMMARY",
            "═" * 70,
            f"  Images scanned:          {self.scanned}",
            f"  Already described:       {self.already_done}",
            f"  Near-duplicates:         {self.duplicates}",
            f"  Sent to VLM:             {self.described}",
            f"  Errors:                  {self.errors}",
            "",
            "  TOKEN USAGE",
            f"  Input tokens:            {self.total_input_tokens:,}",
            f"  Output tokens:           {self.total_output_tokens:,}",
            f"  Total tokens:            {self.total_tokens:,}",
            "",
            "  ACTUAL VLM COST",
            f"  Input cost:              ${self.total_input_cost_usd:.8f}",
            f"  Output cost:             ${self.total_output_cost_usd:.8f}",
            f"  TOTAL VLM COST:          ${self.total_cost_usd:.8f}",
            "",
            "═" * 70,
        ]

        if dry_run:
            lines.insert(
                2,
                "DRY RUN — no API calls or Firebase writes were performed.",
            )

        return "\n".join(lines)


# ──────────────────────────────────────────────────────────────────────────────
# Visual review page (HTML + CSS + JS)
#
# The CSS and JS are kept as plain strings (NOT f-strings) so that their
# literal braces do not need escaping. Only the surrounding HTML template
# uses f-strings, and only for the parts that interpolate Python data.
# ──────────────────────────────────────────────────────────────────────────────

REVIEW_CSS = """
<style>
* { box-sizing: border-box; }

body {
    margin: 0;
    padding: 30px;
    font-family: Arial, Helvetica, sans-serif;
    background: #f4f5f7;
    color: #222;
}

.container { max-width: 1500px; margin: auto; }

.header {
    background: white;
    padding: 25px;
    border-radius: 12px;
    margin-bottom: 25px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    position: sticky;
    top: 0;
    z-index: 10;
}

.header h1 { margin-top: 0; }

.summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    margin-top: 20px;
}

.stat {
    background: #f7f8fa;
    padding: 12px 15px;
    border-radius: 8px;
    font-size: 13px;
    color: #555;
}

.stat strong {
    display: block;
    font-size: 22px;
    margin-top: 5px;
    color: #222;
}

.stat.accurate strong   { color: #1a7f37; }
.stat.partial strong    { color: #a15c00; }
.stat.incorrect strong  { color: #b42318; }

.controls {
    margin-top: 18px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.controls button {
    padding: 9px 16px;
    border-radius: 8px;
    border: 1px solid #c7c9cc;
    background: white;
    color: #222;
    font-size: 14px;
    cursor: pointer;
}

.controls button:hover { background: #eef0f3; }

.controls button.primary {
    background: #1f6feb;
    color: white;
    border-color: #1f6feb;
}

.controls button.primary:hover { background: #1a5fd0; }

.controls button.danger {
    background: #fff5f4;
    color: #b42318;
    border-color: #f0c2bd;
}

.card {
    display: grid;
    grid-template-columns: minmax(400px, 1fr) minmax(400px, 1fr);
    gap: 25px;
    background: white;
    padding: 25px;
    margin-bottom: 25px;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.image-section { text-align: center; }

.image-section img {
    max-width: 100%;
    max-height: 750px;
    object-fit: contain;
    border: 1px solid #ddd;
    border-radius: 8px;
    background: #fafafa;
}

.image-info {
    margin-top: 10px;
    color: #666;
    font-size: 13px;
}

.result-section { padding: 10px; }

.page { color: #666; margin-bottom: 10px; }

.tag {
    display: inline-block;
    padding: 6px 12px;
    background: #e9eef5;
    border-radius: 20px;
    font-size: 13px;
    margin-bottom: 15px;
}

.result-section h2 { margin-bottom: 10px; }

.description {
    font-size: 18px;
    line-height: 1.6;
    background: #f8f9fb;
    padding: 20px;
    border-radius: 8px;
    border-left: 4px solid #555;
    white-space: pre-wrap;
}

.metadata {
    display: grid;
    grid-template-columns: repeat(2, minmax(150px, 1fr));
    gap: 12px;
    margin-top: 20px;
}

.metadata > div {
    background: #f5f6f8;
    padding: 12px;
    border-radius: 7px;
    font-size: 13px;
    overflow-wrap: anywhere;
}

.evaluation {
    margin-top: 20px;
    padding: 16px;
    background: #fffdf5;
    border: 1px solid #f1e2a8;
    border-radius: 8px;
}

.evaluation strong.title {
    display: block;
    margin-bottom: 10px;
    font-size: 14px;
}

.eval-options {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    margin-bottom: 12px;
}

.eval-options label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    cursor: pointer;
}

.evaluation textarea {
    width: 100%;
    min-height: 70px;
    padding: 10px;
    border-radius: 6px;
    border: 1px solid #d7d7d7;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
}

@media (max-width: 900px) {
    .card { grid-template-columns: 1fr; }
    body { padding: 10px; }
    .header { position: static; }
}

@media print {
    body { background: white; padding: 0; }
    .controls { display: none; }
    .header { position: static; box-shadow: none; }
    .card {
        box-shadow: none;
        border: 1px solid #ddd;
        page-break-inside: avoid;
        break-inside: avoid;
    }
}
</style>
"""


REVIEW_JS = """
<script>
const STORAGE_KEY = 'vlm_review_evaluations_v1';

function collectEvaluations() {
    const out = {};
    document.querySelectorAll('.card').forEach(card => {
        const docId = card.dataset.docId;
        const selected = card.querySelector('input[type=radio]:checked');
        const notes = card.querySelector('textarea').value;
        out[docId] = {
            evaluation: selected ? selected.value : '',
            notes: notes
        };
    });
    return out;
}

function saveEvaluations() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(collectEvaluations()));
    } catch (e) {
        console.warn('Could not save evaluations:', e);
    }
}

function loadEvaluations() {
    let data = {};
    try {
        data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
        return;
    }
    document.querySelectorAll('.card').forEach(card => {
        const docId = card.dataset.docId;
        const entry = data[docId];
        if (!entry) return;

        if (entry.evaluation) {
            const radio = card.querySelector(
                'input[type=radio][value="' + entry.evaluation + '"]'
            );
            if (radio) radio.checked = true;
        }
        if (entry.notes) {
            card.querySelector('textarea').value = entry.notes;
        }
    });
}

function updateSummary() {
    let accurate = 0, partial = 0, incorrect = 0, unrated = 0;
    document.querySelectorAll('.card').forEach(card => {
        const sel = card.querySelector('input[type=radio]:checked');
        if (!sel) { unrated++; return; }
        if (sel.value === 'accurate') accurate++;
        else if (sel.value === 'partial') partial++;
        else if (sel.value === 'incorrect') incorrect++;
    });

    document.getElementById('count-accurate').textContent  = accurate;
    document.getElementById('count-partial').textContent   = partial;
    document.getElementById('count-incorrect').textContent = incorrect;
    document.getElementById('count-unrated').textContent   = unrated;

    const total = accurate + partial + incorrect;
    const pct = total > 0 ? ((accurate / total) * 100).toFixed(1) : '0.0';
    document.getElementById('pct-accurate').textContent = pct + '%';
}

function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportJSON() {
    const evals = collectEvaluations();
    const payload = {
        exported_at: new Date().toISOString(),
        document_group: document.body.dataset.documentGroup || '',
        total_images: document.querySelectorAll('.card').length,
        evaluations: evals
    };
    download(
        'vlm_evaluations.json',
        JSON.stringify(payload, null, 2),
        'application/json'
    );
}

function exportCSV() {
    const rows = [[
        'doc_id', 'page', 'tag', 'model',
        'evaluation', 'notes'
    ]];
    document.querySelectorAll('.card').forEach(card => {
        const sel = card.querySelector('input[type=radio]:checked');
        rows.push([
            card.dataset.docId || '',
            card.dataset.page  || '',
            card.dataset.tag   || '',
            card.dataset.model || '',
            sel ? sel.value : '',
            card.querySelector('textarea').value
        ]);
    });
    const csv = rows.map(r => r.map(cell => {
        const s = String(cell);
        if (s.includes(',') || s.includes('"') || s.includes('\\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }).join(',')).join('\\n');

    download('vlm_evaluations.csv', csv, 'text/csv');
}

function clearEvaluations() {
    if (!confirm('Clear all evaluations? This cannot be undone.')) return;
    localStorage.removeItem(STORAGE_KEY);
    document.querySelectorAll('.card').forEach(card => {
        card.querySelectorAll('input[type=radio]')
            .forEach(r => { r.checked = false; });
        card.querySelector('textarea').value = '';
    });
    updateSummary();
}

document.addEventListener('DOMContentLoaded', () => {
    loadEvaluations();
    updateSummary();

    document.querySelectorAll('input[type=radio], textarea').forEach(el => {
        el.addEventListener('change', () => {
            saveEvaluations();
            updateSummary();
        });
        el.addEventListener('input', () => {
            saveEvaluations();
        });
    });
});
</script>
"""


def _review_card_html(item: Dict[str, Any]) -> str:
    """Build a single <article> card for one reviewed image."""
    description = html.escape(item.get("description", ""))
    tag         = html.escape(str(item.get("tag", "")))
    page        = html.escape(str(item.get("page", "")))
    doc_id      = html.escape(str(item.get("doc_id", "")))
    model       = html.escape(str(item.get("model", "")))
    image_file  = html.escape(item["image"])

    original_width  = item.get("original_width")
    original_height = item.get("original_height")
    sent_width      = item.get("sent_width")
    sent_height     = item.get("sent_height")
    input_tokens    = item.get("input_tokens", 0)
    output_tokens   = item.get("output_tokens", 0)
    total_tokens    = item.get("total_tokens", 0)
    cost            = item.get("cost", 0)

    return f"""
    <article class="card"
             data-doc-id="{doc_id}"
             data-page="{page}"
             data-tag="{tag}"
             data-model="{model}">

        <div class="image-section">
            <img src="{image_file}" alt="Manual image" />
            <div class="image-info">
                Original: {original_width} × {original_height}<br>
                Sent to VLM: {sent_width} × {sent_height}
            </div>
        </div>

        <div class="result-section">

            <div class="page">
                Page: <strong>{page}</strong>
            </div>

            <div class="tag">{tag}</div>

            <h2>VLM Description</h2>

            <p class="description">{description}</p>

            <div class="metadata">
                <div>
                    <strong>Document ID</strong><br>{doc_id}
                </div>
                <div>
                    <strong>Model</strong><br>{model}
                </div>
                <div>
                    <strong>Input tokens</strong><br>{input_tokens:,}
                </div>
                <div>
                    <strong>Output tokens</strong><br>{output_tokens:,}
                </div>
                <div>
                    <strong>Total tokens</strong><br>{total_tokens:,}
                </div>
                <div>
                    <strong>Cost</strong><br>${cost:.8f}
                </div>
            </div>

            <div class="evaluation">
                <strong class="title">Manual evaluation</strong>

                <div class="eval-options">
                    <label>
                        <input type="radio"
                               name="eval_{doc_id}"
                               value="accurate">
                        Accurate
                    </label>
                    <label>
                        <input type="radio"
                               name="eval_{doc_id}"
                               value="partial">
                        Partially accurate
                    </label>
                    <label>
                        <input type="radio"
                               name="eval_{doc_id}"
                               value="incorrect">
                        Incorrect
                    </label>
                </div>

                <textarea placeholder="Reviewer notes…"></textarea>
            </div>

        </div>

    </article>
    """


def generate_review_html(review_items: List[Dict[str, Any]]) -> None:
    """
    Write vlm_review/review.html — a visual review page showing each image
    next to its VLM description, with manual accuracy-evaluation fields
    (Accurate / Partially accurate / Incorrect + notes).

    Evaluations persist in the browser's localStorage and can be exported
    as JSON or CSV for the FYP appendix.
    """
    os.makedirs(REVIEW_DIR, exist_ok=True)

    cards = [_review_card_html(item) for item in review_items]

    total_cost = sum(float(item.get("cost", 0)) for item in review_items)
    total_input_tokens = sum(int(item.get("input_tokens", 0)) for item in review_items)
    total_output_tokens = sum(int(item.get("output_tokens", 0)) for item in review_items)
    total_tokens = sum(int(item.get("total_tokens", 0)) for item in review_items)

    document_group = ""
    if review_items:
        document_group = html.escape(
            str(review_items[0].get("document_group", ""))
        )

    page_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VLM Image Review</title>
{REVIEW_CSS}
</head>
<body data-document-group="{document_group}">

<div class="container">

    <div class="header">
        <h1>VLM Image Review</h1>

        <p>
            Compare each service-manual image against the description
            generated by the vision model, then record your evaluation.
        </p>

        <p>
            Document group:
            <strong>{document_group}</strong>
        </p>

        <div class="summary">
            <div class="stat">
                Images reviewed
                <strong>{len(review_items)}</strong>
            </div>
            <div class="stat accurate">
                Accurate
                <strong id="count-accurate">0</strong>
            </div>
            <div class="stat partial">
                Partially accurate
                <strong id="count-partial">0</strong>
            </div>
            <div class="stat incorrect">
                Incorrect
                <strong id="count-incorrect">0</strong>
            </div>
            <div class="stat">
                Unrated
                <strong id="count-unrated">0</strong>
            </div>
            <div class="stat">
                Accuracy rate
                <strong id="pct-accurate">0.0%</strong>
            </div>
            <div class="stat">
                Total tokens
                <strong>{total_tokens:,}</strong>
            </div>
            <div class="stat">
                Total cost
                <strong>${total_cost:.6f}</strong>
            </div>
        </div>

        <div class="controls">
            <button class="primary" onclick="exportJSON()">
                Export evaluations (JSON)
            </button>
            <button onclick="exportCSV()">
                Export evaluations (CSV)
            </button>
            <button onclick="window.print()">
                Print / Save as PDF
            </button>
            <button class="danger" onclick="clearEvaluations()">
                Clear evaluations
            </button>
        </div>
    </div>

    {''.join(cards)}

</div>

{REVIEW_JS}
</body>
</html>
"""

    with open(REVIEW_HTML, "w", encoding="utf-8") as f:
        f.write(page_html)

    logger.info(
        f"VLM review page created: {os.path.abspath(REVIEW_HTML)}"
    )


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
) -> RunStats:
    """
    Execute the full pipeline: fetch docs → dedup → VLM → write back to Firebase,
    and generate a visual review page for the images processed in this run.

    Returns the aggregated RunStats for the run.
    """
    fb = FirebaseClient(service_account_path, bucket_name)

    openai_client = None
    if not dry_run:
        from openai import OpenAI

        openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

    docs = fb.fetch_image_docs(
        document_group=document_group,
        max_pages=max_pages,
        limit=limit,
    )
    logger.info(f"Found {len(docs)} image doc(s) matching scope")

    dupe_index = DuplicateIndex(threshold=dedup_threshold)
    stats = RunStats()

    review_items: List[Dict[str, Any]] = []
    os.makedirs(REVIEW_DIR, exist_ok=True)

    for doc in docs:
        stats.scanned += 1

        doc_id = doc["_id"]
        storage_path = doc.get("storagePath", "")
        existing_status = doc.get("vlmStatus")
        page_num = doc.get("pageNum", "unknown")

        # Already processed (unless --force).
        if existing_status in ("described", "skipped_duplicate") and not force:
            stats.already_done += 1

            if doc.get("phash"):
                dupe_index.add_representative(doc_id, doc["phash"])

            continue

        # Missing Storage path.
        if not storage_path:
            logger.warning(f"[{doc_id}] missing storagePath, skipping")
            stats.errors += 1
            continue

        # Download image.
        try:
            image_bytes = fb.download_image_bytes(storage_path)
        except Exception as e:
            logger.warning(f"[{doc_id}] download failed: {e}")
            stats.errors += 1

            if not dry_run:
                fb.update_doc(
                    doc_id,
                    {"vlmStatus": "error", "vlmError": f"download: {e}"},
                )

            continue

        # Original dimensions.
        original_width, original_height = get_image_dimensions(image_bytes)

        # Perceptual hash.
        phash = compute_phash(image_bytes)
        dup_of = dupe_index.find_duplicate(phash) if phash else None

        # Near-duplicate — skip the VLM.
        if dup_of:
            stats.duplicates += 1
            logger.info(
                f"[{doc_id}] page={page_num} near-duplicate of {dup_of} — skipping VLM"
            )

            if not dry_run:
                fb.update_doc(
                    doc_id,
                    {
                        "phash": phash,
                        "vlmStatus": "skipped_duplicate",
                        "duplicateOf": dup_of,
                        "vlmOriginalWidth": original_width,
                        "vlmOriginalHeight": original_height,
                        "vlmInputTokens": 0,
                        "vlmOutputTokens": 0,
                        "vlmTotalTokens": 0,
                        "vlmInputCostUSD": 0.0,
                        "vlmOutputCostUSD": 0.0,
                        "vlmTotalCostUSD": 0.0,
                    },
                )

            continue

        # Add representative before VLM.
        if phash:
            dupe_index.add_representative(doc_id, phash)

        # Dry run — no API call, no write.
        if dry_run:
            logger.info(
                f"[{doc_id}] page={page_num} would call VLM "
                f"original={original_width}x{original_height}"
            )
            continue

        # Resize before sending.
        small, sent_width, sent_height = resize_for_vlm(image_bytes)

        # VLM call + write-back.
        try:
            result = describe_with_vlm(openai_client, model, small)

            input_tokens = result["input_tokens"]
            output_tokens = result["output_tokens"]
            total_tokens = result["total_tokens"]
            input_cost = result["input_cost_usd"]
            output_cost = result["output_cost_usd"]
            total_cost = result["total_cost_usd"]

            # Update statistics.
            stats.described += 1
            stats.add_usage(
                input_tokens,
                output_tokens,
                total_tokens,
                input_cost,
                output_cost,
                total_cost,
            )

            # ──────────────────────────────────────────────────────────────
            # Save image locally for visual VLM review
            # ──────────────────────────────────────────────────────────────

            review_number = stats.described
            safe_doc_id = re.sub(r"[^a-zA-Z0-9_-]", "_", doc_id)
            image_filename = f"{review_number:04d}_{safe_doc_id}.jpg"
            image_path = os.path.join(REVIEW_DIR, image_filename)

            with open(image_path, "wb") as image_file:
                image_file.write(image_bytes)

            # ──────────────────────────────────────────────────────────────
            # Add review information
            # ──────────────────────────────────────────────────────────────

            review_items.append(
                {
                    "image": image_filename,
                    "doc_id": doc_id,
                    "page": page_num,
                    "document_group": doc.get("documentGroup", ""),
                    "description": result["description"],
                    "tag": result["content_type"],
                    "model": model,
                    "original_width": original_width,
                    "original_height": original_height,
                    "sent_width": sent_width,
                    "sent_height": sent_height,
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": total_tokens,
                    "cost": total_cost,
                }
            )

            # Save everything to Firebase.
            fb.update_doc(
                doc_id,
                {
                    "vlmDescription": result["description"],
                    "vlmTag": result["content_type"],
                    "vlmModel": model,
                    "vlmOriginalWidth": original_width,
                    "vlmOriginalHeight": original_height,
                    "vlmSentWidth": sent_width,
                    "vlmSentHeight": sent_height,
                    "vlmInputTokens": input_tokens,
                    "vlmOutputTokens": output_tokens,
                    "vlmTotalTokens": total_tokens,
                    "vlmInputCostUSD": input_cost,
                    "vlmOutputCostUSD": output_cost,
                    "vlmTotalCostUSD": total_cost,
                    "phash": phash or "",
                    "vlmStatus": "described",
                },
            )

            # Detailed terminal output.
            print()
            print("─" * 70)
            print(f"[IMAGE] {doc_id}")
            print(f"  Page:                 {page_num}")
            print(f"  Storage:              {storage_path}")
            print(f"  Original dimensions:  {original_width} x {original_height}")
            print(f"  Sent dimensions:      {sent_width} x {sent_height}")
            print(f"  Tag:                  {result['content_type']}")
            print(f"  Model:                {model}")
            print(f"  Input tokens:         {input_tokens:,}")
            print(f"  Output tokens:        {output_tokens:,}")
            print(f"  Total tokens:         {total_tokens:,}")
            print(f"  Input cost:           ${input_cost:.8f}")
            print(f"  Output cost:          ${output_cost:.8f}")
            print(f"  Image cost:           ${total_cost:.8f}")
            print()
            print("  DESCRIPTION:")
            print(f"  {result['description']}")
            print("─" * 70)

        except Exception as e:
            logger.warning(f"[{doc_id}] VLM/write failed: {e}")
            stats.errors += 1

            fb.update_doc(
                doc_id,
                {
                    "vlmStatus": "error",
                    "vlmError": str(e),
                    "vlmOriginalWidth": original_width,
                    "vlmOriginalHeight": original_height,
                    "vlmSentWidth": sent_width,
                    "vlmSentHeight": sent_height,
                },
            )

        # Gentle pacing.
        time.sleep(0.2)

    # ──────────────────────────────────────────────────────────────────────
    # Generate browser-based visual review for this run
    # ──────────────────────────────────────────────────────────────────────

    if review_items:
        generate_review_html(review_items)

    return stats


# ──────────────────────────────────────────────────────────────────────────────
# Report
# ──────────────────────────────────────────────────────────────────────────────
def rebuild_review(
    document_group: Optional[str],
    max_pages: Optional[int],
    limit: Optional[int],
    service_account_path: str,
    bucket_name: str,
) -> None:
    """
    Rebuild vlm_review/review.html from images already described in Firebase.

    Downloads each image again from Storage and reuses the stored VLM fields.
    Does NOT call OpenAI — no cost.
    """
    fb = FirebaseClient(service_account_path, bucket_name)

    docs = fb.fetch_image_docs(
        document_group=document_group,
        max_pages=max_pages,
        limit=limit,
    )

    described = [d for d in docs if d.get("vlmStatus") == "described"]
    logger.info(f"Found {len(described)} described doc(s) to rebuild review for")

    if not described:
        logger.warning("No described docs found — nothing to rebuild.")
        return

    os.makedirs(REVIEW_DIR, exist_ok=True)

    review_items: List[Dict[str, Any]] = []

    for i, doc in enumerate(described, start=1):
        doc_id = doc["_id"]
        storage_path = doc.get("storagePath", "")
        page_num = doc.get("pageNum", "unknown")

        if not storage_path:
            logger.warning(f"[{doc_id}] missing storagePath, skipping")
            continue

        try:
            image_bytes = fb.download_image_bytes(storage_path)
        except Exception as e:
            logger.warning(f"[{doc_id}] download failed: {e}")
            continue

        safe_doc_id = re.sub(r"[^a-zA-Z0-9_-]", "_", doc_id)
        image_filename = f"{i:04d}_{safe_doc_id}.jpg"
        image_path = os.path.join(REVIEW_DIR, image_filename)

        with open(image_path, "wb") as f:
            f.write(image_bytes)

        review_items.append(
            {
                "image": image_filename,
                "doc_id": doc_id,
                "page": page_num,
                "document_group": doc.get("documentGroup", ""),
                "description": doc.get("vlmDescription", ""),
                "tag": doc.get("vlmTag", ""),
                "model": doc.get("vlmModel", ""),
                "original_width": doc.get("vlmOriginalWidth"),
                "original_height": doc.get("vlmOriginalHeight"),
                "sent_width": doc.get("vlmSentWidth"),
                "sent_height": doc.get("vlmSentHeight"),
                "input_tokens": int(doc.get("vlmInputTokens", 0) or 0),
                "output_tokens": int(doc.get("vlmOutputTokens", 0) or 0),
                "total_tokens": int(doc.get("vlmTotalTokens", 0) or 0),
                "cost": float(doc.get("vlmTotalCostUSD", 0) or 0),
            }
        )

    if review_items:
        generate_review_html(review_items)


def report(
    document_group: Optional[str],
    service_account_path: str,
    bucket_name: str,
) -> None:
    """
    Print a status/tag/cost breakdown for the given scope.

    Does NOT call OpenAI — it only reads fields already stored in Firebase.
    """
    fb = FirebaseClient(service_account_path, bucket_name)
    docs = fb.fetch_image_docs(document_group=document_group)

    from collections import Counter

    status_counts = Counter(d.get("vlmStatus", "pending") for d in docs)
    tag_counts = Counter(d.get("vlmTag") for d in docs if d.get("vlmTag"))

    # Status/tag report.
    print(f"\nTotal images in scope: {len(docs)}")

    print("\nBy vlmStatus:")
    for k, v in status_counts.most_common():
        print(f"  {k:<20} {v}")

    print("\nBy vlmTag:")
    for k, v in tag_counts.most_common():
        print(f"  {k:<20} {v}")

    # Cost totals already stored in Firebase.
    total_input_tokens = 0
    total_output_tokens = 0
    total_tokens = 0
    total_input_cost = 0.0
    total_output_cost = 0.0
    total_cost = 0.0
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

    print()
    print("═" * 70)
    print("STORED VLM COST")
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


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def main():
    """Parse CLI args and dispatch to report() / rebuild_review() / run()."""
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    ap.add_argument(
        "--document-group",
        default=None,
        help="Restrict to one documentGroup (test scope)",
    )
    ap.add_argument(
        "--max-pages",
        type=int,
        default=None,
        help="Only pageNum <= this value (e.g. 10 for a test run)",
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Hard cap on number of image docs processed",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Show plan only. No OpenAI calls and no Firebase writes.",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="Re-describe even if vlmStatus is already set.",
    )
    ap.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"OpenAI vision model (default {DEFAULT_MODEL})",
    )
    ap.add_argument(
        "--dedup-threshold",
        type=int,
        default=5,
        help="Hamming distance for near-duplicate match (default 5)",
    )
    ap.add_argument(
        "--service-account",
        default=_env_path(
            "FIREBASE_SERVICE_ACCOUNT",
            "../serviceAccountKey.json",
        ),
    )
    ap.add_argument("--bucket", default=DEFAULT_BUCKET)
    ap.add_argument(
        "--report",
        action="store_true",
        help="Print status/tag/cost breakdown for the given scope and exit.",
    )
    ap.add_argument(
        "--rebuild-review",
        action="store_true",
        help="Rebuild vlm_review/review.html from already-described docs (no OpenAI calls).",
    )

    args = ap.parse_args()

    # API key check (not needed for --dry-run, --report, or --rebuild-review).
    if (
        not args.dry_run
        and not args.report
        and not args.rebuild_review
        and not os.getenv("OPENAI_API_KEY")
    ):
        sys.exit("OPENAI_API_KEY is not set.")

    # Report mode — read-only.
    if args.report:
        report(
            args.document_group,
            args.service_account,
            args.bucket,
        )
        return

    # Rebuild review page from already-described docs — read-only, no OpenAI.
    if args.rebuild_review:
        rebuild_review(
            args.document_group,
            args.max_pages,
            args.limit,
            args.service_account,
            args.bucket,
        )
        return

    # Normal run.
    stats = run(
        document_group=args.document_group,
        max_pages=args.max_pages,
        limit=args.limit,
        dry_run=args.dry_run,
        force=args.force,
        model=args.model,
        dedup_threshold=args.dedup_threshold,
        service_account_path=args.service_account,
        bucket_name=args.bucket,
    )

    print(stats.summary(args.dry_run))


if __name__ == "__main__":
    main()

