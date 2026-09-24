"""
OpenAI vision calls.

Two passes, not one:

1. classify_image() — cheap, fast, runs on every non-duplicate image. Produces
   a short description + a content_type tag.

2. describe_diagram_detailed() — runs ONLY when pass 1 tagged the image
   "diagram". A generic description prompt naturally summarizes and rounds
   numbers, which is exactly wrong for a dimensioned drawing where the numbers
   ARE the content. This second pass uses a stricter prompt whose only job is
   exhaustive, view-by-view numeric transcription, and returns a structured
   `measurements` list alongside the prose description.

Both passes return the ACTUAL token usage OpenAI reports for that call
(input_tokens, output_tokens, total_tokens) — the caller (pipeline.py) sums
usage across passes and prices it once via pricing.calculate_cost(), so a
diagram's stored cost reflects both calls, not just the first.
"""

import base64
import json
import re

from .pricing import extract_usage

VALID_TAGS = {"diagram", "icon_arrow", "photo", "table_image", "decorative"}

CLASSIFY_SYSTEM_PROMPT = (
    "You are labeling images extracted from technical service/repair manuals "
    "(appliances like air conditioners). For the given image, respond with ONLY "
    "a JSON object, no markdown fences, no extra text, in this exact shape:\n"
    '{"description": "<2-4 sentence factual description of what the image shows, '
    'including any visible labels, part names, wiring/pipe colors, or values>", '
    '"content_type": "<one of: diagram, icon_arrow, photo, table_image, decorative>"}\n\n'
    "content_type guide:\n"
    "- diagram: wiring diagrams, exploded parts diagrams, flowcharts, schematics, "
    "dimensioned installation drawings — anything with technical lines, callouts, "
    "or measurements, INCLUDING a full page that is itself one large diagram\n"
    "- icon_arrow: small arrows, bullet icons, warning triangles, single UI glyphs "
    "with no real informational content on their own\n"
    "- photo: a real photograph of a unit, part, or installation\n"
    "- table_image: a table that was captured as an image rather than text\n"
    "- decorative: logos, page borders, blank/near-blank scans, unreadable noise\n"
    "If the image is unreadable or blank, still return valid JSON with an empty "
    'description and content_type "decorative".'
)

# Diagrams only. Completeness beats brevity here — a rounded-off or omitted
# measurement is useless to a technician; an exact one is the entire point.
DIAGRAM_SYSTEM_PROMPT = (
    "You are extracting exact data from a dimensioned technical diagram in a "
    "service/repair manual. Do not summarize or round anything. Respond with "
    "ONLY a JSON object, no markdown fences, in this exact shape:\n"
    '{"description": "<prose that walks through every labeled view in the image '
    '(e.g. Front View, Side View, Back View) in reading order and states what '
    'each view shows>", '
    '"measurements": [{"label": "<what this measures, include which view it '
    'belongs to if the image has multiple views, e.g. \'Side view - overall '
    'depth\'>", "value": "<exact number and unit as printed, e.g. \'989 mm\', '
    '\'65.4 mm\', \'42~54 mm\'>"}], '
    '"content_type": "diagram"}\n\n'
    "Rules:\n"
    "- Transcribe every visible dimension line, number, and unit exactly as "
    "printed. Do not omit a number because it seems minor.\n"
    "- If a value is a range (e.g. '42~54'), keep it as a range — do not average it.\n"
    "- Include labeled parts/callouts that have no number attached (e.g. 'Liquid "
    "side', 'Gas side', 'Left piping hole') as their own measurement entries, "
    "with value describing their position or what they connect to.\n"
    "- If the image has multiple views, keep each view's measurements grouped "
    "and labeled with that view's name so they aren't mixed up with each other.\n"
    "- If truly no numeric measurements are visible, return an empty measurements array and"
    "return nothing and DO NOT return any measurements that are not actually present in the image."
)


def _image_data_url(image_bytes: bytes) -> str:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def _parse_json_response(raw: str) -> dict:
    raw = re.sub(r"^```(json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    return json.loads(raw)


def classify_image(client, model: str, image_bytes: bytes, context_line: str) -> dict:
    """Pass 1: quick description + content_type tag, for every non-duplicate image."""
    resp = client.chat.completions.create(
        model=model,
        max_tokens=300,
        messages=[
            {"role": "system", "content": CLASSIFY_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": f"{context_line}\nDescribe this image from a service manual."},
                    {"type": "image_url", "image_url": {"url": _image_data_url(image_bytes)}},
                ],
            },
        ],
    )
    parsed = _parse_json_response(resp.choices[0].message.content)
    description = str(parsed.get("description", "")).strip()
    content_type = str(parsed.get("content_type", "")).strip().lower()
    if content_type not in VALID_TAGS:
        content_type = "decorative" if not description else "photo"

    input_tokens, output_tokens, total_tokens = extract_usage(resp)
    return {
        "description": description,
        "content_type": content_type,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def describe_diagram_detailed(client, model: str, image_bytes: bytes, context_line: str) -> dict:
    """Pass 2: diagrams only. Forces exhaustive, view-by-view measurement transcription."""
    resp = client.chat.completions.create(
        model=model,
        max_tokens=800,
        messages=[
            {"role": "system", "content": DIAGRAM_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"{context_line}\nExtract every view and every measurement from this diagram.",
                    },
                    {"type": "image_url", "image_url": {"url": _image_data_url(image_bytes)}},
                ],
            },
        ],
    )
    parsed = _parse_json_response(resp.choices[0].message.content)
    description = str(parsed.get("description", "")).strip()
    raw_measurements = parsed.get("measurements") or []

    measurements = []
    for m in raw_measurements:
        if isinstance(m, dict) and m.get("label") and m.get("value"):
            measurements.append({"label": str(m["label"]).strip(), "value": str(m["value"]).strip()})

    input_tokens, output_tokens, total_tokens = extract_usage(resp)
    return {
        "description": description,
        "measurements": measurements,
        "content_type": "diagram",
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }