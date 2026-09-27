"""
Browser-based visual review page for manually grading VLM output.

generate_review_html() is called at the end of a real run() with the images
that were just processed. rebuild_review() does the same thing but reads
already-described docs straight back out of Firestore — no OpenAI calls — so
you (or a coworker) can regenerate the page any time without spending money.

The CSS and JS are kept as plain strings (NOT f-strings) so their literal
braces never need escaping. Only the HTML template uses f-strings, and only
for the parts that interpolate Python data.
"""

import html
import logging
import os
import re
from typing import Any, Dict, List, Optional

from .firebase_client import FirebaseClient

logger = logging.getLogger("describe_images.review")

REVIEW_DIR = "vlm_review"
REVIEW_HTML = os.path.join(REVIEW_DIR, "review.html")


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

.badges { margin-bottom: 15px; }

.tag {
    display: inline-block;
    padding: 6px 12px;
    background: #e9eef5;
    border-radius: 20px;
    font-size: 13px;
    margin-right: 8px;
}

.scope-badge {
    display: inline-block;
    padding: 6px 12px;
    border-radius: 20px;
    font-size: 13px;
}

.scope-badge.page    { background: #eaf2ff; color: #1959a8; }
.scope-badge.figure  { background: #f1ecff; color: #5b3fb0; }

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

.measurements {
    margin-top: 18px;
}

.measurements strong.title {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
}

.measurements table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.measurements th, .measurements td {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid #eee;
}

.measurements th { color: #666; font-weight: 600; }

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
        'doc_id', 'page', 'scope', 'tag', 'model',
        'evaluation', 'notes'
    ]];
    document.querySelectorAll('.card').forEach(card => {
        const sel = card.querySelector('input[type=radio]:checked');
        rows.push([
            card.dataset.docId || '',
            card.dataset.page  || '',
            card.dataset.scope || '',
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


def _measurements_html(measurements: List[Dict[str, str]]) -> str:
    if not measurements:
        return ""
    rows = "".join(
        f"<tr><td>{html.escape(str(m.get('label', '')))}</td>"
        f"<td>{html.escape(str(m.get('value', '')))}</td></tr>"
        for m in measurements
    )
    return f"""
            <div class="measurements">
                <strong class="title">Extracted measurements ({len(measurements)})</strong>
                <table>
                    <tr><th>Label</th><th>Value</th></tr>
                    {rows}
                </table>
            </div>
    """


def _review_card_html(item: Dict[str, Any]) -> str:
    """Build a single <article> card for one reviewed image."""
    description = html.escape(item.get("description", ""))
    tag = html.escape(str(item.get("tag", "")))
    scope = html.escape(str(item.get("image_scope", "")))
    page = html.escape(str(item.get("page", "")))
    doc_id = html.escape(str(item.get("doc_id", "")))
    model = html.escape(str(item.get("model", "")))
    image_file = html.escape(item["image"])

    original_width = item.get("original_width")
    original_height = item.get("original_height")
    sent_width = item.get("sent_width")
    sent_height = item.get("sent_height")
    input_tokens = item.get("input_tokens", 0)
    output_tokens = item.get("output_tokens", 0)
    total_tokens = item.get("total_tokens", 0)
    cost = item.get("cost", 0)
    measurements_html = _measurements_html(item.get("measurements") or [])

    return f"""
    <article class="card"
             data-doc-id="{doc_id}"
             data-page="{page}"
             data-scope="{scope}"
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

            <div class="badges">
                <span class="tag">{tag}</span>
                <span class="scope-badge {scope}">{scope}</span>
            </div>

            <h2>VLM Description</h2>

            <p class="description">{description}</p>

            {measurements_html}

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
                        <input type="radio" name="eval_{doc_id}" value="accurate">
                        Accurate
                    </label>
                    <label>
                        <input type="radio" name="eval_{doc_id}" value="partial">
                        Partially accurate
                    </label>
                    <label>
                        <input type="radio" name="eval_{doc_id}" value="incorrect">
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
    next to its VLM description (and, for diagrams, its extracted
    measurements table), with manual accuracy-evaluation fields that persist
    in the browser's localStorage and export as JSON/CSV.
    """
    os.makedirs(REVIEW_DIR, exist_ok=True)

    cards = [_review_card_html(item) for item in review_items]

    total_cost = sum(float(item.get("cost", 0)) for item in review_items)
    total_input_tokens = sum(int(item.get("input_tokens", 0)) for item in review_items)
    total_output_tokens = sum(int(item.get("output_tokens", 0)) for item in review_items)
    total_tokens = sum(int(item.get("total_tokens", 0)) for item in review_items)

    document_group = ""
    if review_items:
        document_group = html.escape(str(review_items[0].get("document_group", "")))

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
            The <span class="scope-badge page">page</span> /
            <span class="scope-badge figure">figure</span> badge shows
            whether this is a whole-page render or a cropped figure — use it
            to spot cases where both exist for the same page.
        </p>

        <p>
            Document group: <strong>{document_group}</strong>
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
            <button class="primary" onclick="exportJSON()">Export evaluations (JSON)</button>
            <button onclick="exportCSV()">Export evaluations (CSV)</button>
            <button onclick="window.print()">Print / Save as PDF</button>
            <button class="danger" onclick="clearEvaluations()">Clear evaluations</button>
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

    logger.info(f"VLM review page created: {os.path.abspath(REVIEW_HTML)}")


def rebuild_review(
    document_group: Optional[str],
    max_pages: Optional[int],
    limit: Optional[int],
    service_account_path: str,
    bucket_name: str,
) -> None:
    """
    Rebuild vlm_review/review.html straight from Firestore, for docs already
    marked vlmStatus=="described". Re-downloads each image (it may not exist
    locally, e.g. on a coworker's machine) but makes NO OpenAI calls.
    """
    fb = FirebaseClient(service_account_path, bucket_name)
    docs = fb.fetch_image_docs(document_group=document_group, max_pages=max_pages, limit=limit)
    described = [d for d in docs if d.get("vlmStatus") == "described"]
    logger.info(f"Rebuilding review page from {len(described)} already-described doc(s)")

    if not described:
        logger.warning("No described docs found in scope — nothing to rebuild.")
        return

    os.makedirs(REVIEW_DIR, exist_ok=True)
    review_items: List[Dict[str, Any]] = []

    for i, doc in enumerate(described, start=1):
        doc_id = doc["_id"]
        storage_path = doc.get("storagePath", "")
        if not storage_path:
            logger.warning(f"[{doc_id}] missing storagePath, skipping")
            continue

        try:
            image_bytes = fb.download_image_bytes(storage_path)
        except Exception as e:
            logger.warning(f"[{doc_id}] could not download for review: {e}")
            continue

        safe_doc_id = re.sub(r"[^a-zA-Z0-9_-]", "_", doc_id)
        image_filename = f"{i:04d}_{safe_doc_id}.jpg"
        with open(os.path.join(REVIEW_DIR, image_filename), "wb") as f:
            f.write(image_bytes)

        review_items.append({
            "image": image_filename,
            "doc_id": doc_id,
            "page": doc.get("pageNum", "unknown"),
            "document_group": doc.get("documentGroup", ""),
            "description": doc.get("vlmDescription", ""),
            "tag": doc.get("vlmTag", ""),
            "image_scope": doc.get("imageScope", ""),
            "measurements": doc.get("vlmMeasurements") or [],
            "model": doc.get("vlmModel", ""),
            "original_width": doc.get("vlmOriginalWidth"),
            "original_height": doc.get("vlmOriginalHeight"),
            "sent_width": doc.get("vlmSentWidth"),
            "sent_height": doc.get("vlmSentHeight"),
            "input_tokens": doc.get("vlmInputTokens", 0),
            "output_tokens": doc.get("vlmOutputTokens", 0),
            "total_tokens": doc.get("vlmTotalTokens", 0),
            "cost": doc.get("vlmTotalCostUSD", 0),
        })

    generate_review_html(review_items)