"""
OpenAI vision calls.

Pass 1 — classify_image(): cheap, fast, runs on every non-duplicate image.
Produces a short description + a content_type tag from a fixed taxonomy.

Pass 2 — one of five DETAIL functions, dispatched by content_type, runs ONLY
on images pass 1 tagged as one of the five "structured" types below. Each
type gets its OWN prompt and output schema because a generic "describe this"
prompt is the wrong tool once the numbers/structure themselves are the point:

  diagram              — dimensioned installation drawing. Output: a flat
                          measurements[] list (label/value), one entry per
                          printed dimension or callout.
  graph                — a plotted curve with numeric axes (e.g. resistance
                          vs temperature). An image can contain MULTIPLE
                          distinct graphs — output is a graphs[] LIST, one
                          object per graph, so ticks from different graphs
                          are never merged into one ambiguous list.
  schematic            — electrical/wiring schematic. Output: components[]
                          (name/type/rating/location) + connections[]
                          (from/to/relationship) — structured circuit data,
                          not flat text, since a future goal is overlaying
                          this onto the same static image.
  flowchart            — troubleshooting/decision flowchart, possibly several
                          independent sections on one page. Output: a
                          flowcharts[] list, each with nodes[]/edges[] (the
                          same node-link shape as schematic, since a
                          flowchart is a graph in the graph-theory sense too).
  installation_diagram — step-by-step illustrated installation/assembly
                          instructions, usually several small panels. Output:
                          an ordered steps[] list, one object per panel.

All five detail functions return a *standardized* shape so pipeline.py can
merge them generically:
    {
        "description": str,           # replaces pass 1's description
        "payload": {...},             # tag-specific Firestore field names/values
        "input_tokens": int, "output_tokens": int, "total_tokens": int,
    }

Every detail function also enforces its own has_visible_X gate IN CODE, same
pattern as the original diagram gate: the model self-reports whether it can
actually see the structure it's being asked to extract, and if it says no,
the code empties the corresponding array regardless of what the model still
produced — a plain "don't invent data" instruction on its own isn't a strong
enough constraint once a model has seen several real examples in one run.

NOTE ON max_completion_tokens:
    GPT-5.x and o-series models reject `max_tokens` with a 400 error and
    require `max_completion_tokens`. This file uses the newer name
    exclusively — safe for GPT-4o too since OpenAI accepts it as an alias.
    The limits are set generously because GPT-5.x spends part of the budget
    on internal reasoning tokens before emitting any visible output; a limit
    that's fine on GPT-4o can yield empty/truncated responses on GPT-5.x.
"""

import base64
import json
import re

from .pricing import extract_usage

VALID_TAGS = {
    "diagram", "graph", "schematic", "flowchart", "installation_diagram",
    "icon_arrow", "photo", "table_image", "decorative",
}

# Tags that get a second, structured-extraction pass with a more capable model.
DETAIL_TAGS = {"diagram", "graph", "schematic", "flowchart", "installation_diagram"}

CLASSIFY_SYSTEM_PROMPT = (
    "You are labeling images extracted from technical service/repair manuals "
    "(appliances like air conditioners). For the given image, respond with ONLY "
    "a JSON object, no markdown fences, no extra text, in this exact shape:\n"
    '{"description": "<2-4 sentence factual description of what the image shows, '
    'including any visible labels, part names, wiring/pipe colors, or values>", '
    '"content_type": "<one of: diagram, graph, schematic, flowchart, '
    'installation_diagram, icon_arrow, photo, table_image, decorative>"}\n\n'
    "content_type guide:\n"
    "- diagram: a dimensioned technical drawing — an installation view with "
    "printed physical measurements (widths, heights, clearances, offsets). "
    "Use this when the image's main value is exact printed size/position "
    "numbers, INCLUDING a full page that is itself one large dimensioned "
    "drawing.\n"
    "- graph: a plotted curve or chart with numeric axes (e.g. resistance vs "
    "temperature, pressure vs current). Look for axis labels, tick marks, "
    "and a plotted line. An image can contain MORE THAN ONE graph — still "
    "tag the whole image 'graph' regardless of how many curves it has.\n"
    "- schematic: an electrical/wiring schematic or circuit diagram — "
    "components (fuses, relays, terminals, connectors, sensors, motors) "
    "connected by lines/wires. Use this when the main value is which "
    "components exist and how they connect, not a physical dimension.\n"
    "- flowchart: a troubleshooting/decision flowchart with boxes and "
    "branches (e.g. yes/no or threshold-based branching to a cause or "
    "outcome). A page can have several independent flowchart sections — "
    "still tag the whole image 'flowchart'.\n"
    "- installation_diagram: step-by-step illustrated installation/assembly "
    "instructions — several small labeled illustration panels showing how "
    "to mount, connect, route, or remove something, each panel usually a "
    "different view or step. If unsure between this and 'diagram', prefer "
    "installation_diagram when you see a sequence of small illustrated "
    "panels rather than one single dimensioned view.\n"
    "- photo: a real photograph, OR a page whose main visual element is a "
    "product photo/thumbnail — including a manual's cover/title page "
    "showing the unit — even if it also has a title, model number, safety "
    "warning text, or a table of contents around it. A small illustrative "
    "picture of the unit used as a title graphic is 'photo', NOT any "
    "technical tag above, even though it depicts the same equipment a real "
    "diagram would. Do not tag a cover page as a technical type just "
    "because it contains an image of the equipment.\n"
    "- icon_arrow: small arrows, bullet icons, warning triangles, single UI "
    "glyphs with no real informational content on their own\n"
    "- table_image: a table that was captured as an image rather than text\n"
    "- decorative: logos, page borders, blank/near-blank scans, unreadable "
    "noise\n"
    "If the image is unreadable or blank, still return valid JSON with an "
    'empty description and content_type "decorative".'
)


def _image_data_url(image_bytes: bytes) -> str:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def _parse_json_response(raw: str) -> dict:
    raw = re.sub(r"^```(json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    return json.loads(raw)


def _call_vision(client, model: str, system_prompt: str, user_text: str,
                 image_bytes: bytes, max_completion_tokens: int):
    """
    Single low-level helper for every vision call.

    Uses `max_completion_tokens` (not `max_tokens`) — GPT-5.x and o-series
    models reject the old parameter name with a 400 error. OpenAI also accepts
    this name for GPT-4o, so a single code path works across model families.
    """
    resp = client.chat.completions.create(
        model=model,
        max_completion_tokens=max_completion_tokens,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": _image_data_url(image_bytes)}},
                ],
            },
        ],
    )
    parsed = _parse_json_response(resp.choices[0].message.content)
    input_tokens, output_tokens, total_tokens = extract_usage(resp)
    return parsed, input_tokens, output_tokens, total_tokens


def classify_image(client, model: str, image_bytes: bytes, context_line: str) -> dict:
    """Pass 1: quick description + content_type tag, for every non-duplicate image."""
    parsed, input_tokens, output_tokens, total_tokens = _call_vision(
        client, model, CLASSIFY_SYSTEM_PROMPT,
        f"{context_line}\nDescribe this image from a service manual.",
        image_bytes, max_completion_tokens=2048,
    )
    description = str(parsed.get("description", "")).strip()
    content_type = str(parsed.get("content_type", "")).strip().lower()
    if content_type not in VALID_TAGS:
        content_type = "decorative" if not description else "photo"

    return {
        "description": description,
        "content_type": content_type,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


# ── Pass 2: diagram (dimensioned drawing) ──────────────────────────────────────
# Unchanged behavior from before — kept here for the DETAIL_TAGS dispatch table.

DIAGRAM_SYSTEM_PROMPT = (
    "You are extracting exact data from a dimensioned technical diagram in a "
    "service/repair manual. Do not summarize, round, or invent anything. Respond "
    "with ONLY a JSON object, no markdown fences, in this exact shape:\n"
    '{"has_visible_measurements": <true or false>, '
    '"description": "<prose that walks through every labeled view in the image '
    '(e.g. Front View, Side View, Back View) in reading order and states what '
    'each view shows>", '
    '"measurements": [{"label": "<what this measures, include which view it '
    'belongs to if the image has multiple views, e.g. \'Side view - overall '
    'depth\'>", "value": "<exact number and unit as printed, e.g. \'989 mm\', '
    '\'65.4 mm\', \'42~54 mm\'>"}], '
    '"content_type": "diagram"}\n\n'
    "Rules — read carefully, these are graded strictly:\n"
    "- Set has_visible_measurements to true ONLY if you can point to printed "
    "digits actually visible in the image next to a dimension line, label, or "
    "callout. If the image turns out to have no printed numbers on it at all, "
    "set this to false.\n"
    "- Every 'value' you output must be digits/text you can literally see "
    "printed in the image. NEVER invent a typical, standard, or 'usually "
    "around' measurement for this type of product just because similar "
    "diagrams usually have one — if you did not read it directly off THIS "
    "image, leave it out.\n"
    "- If has_visible_measurements is false, measurements MUST be an empty "
    "array. Do not include placeholder, example, or 'typical' values.\n"
    "- If a value is a range (e.g. '42~54'), keep it as a range — do not "
    "average it.\n"
    "- Include labeled parts/callouts that have no number attached (e.g. "
    "'Liquid side', 'Gas side', 'Left piping hole') as their own measurement "
    "entries, with value describing their position or what they connect to "
    "— but only if that label is actually printed in the image.\n"
    "- If the image has multiple views, keep each view's measurements grouped "
    "and labeled with that view's name so they aren't mixed up with each other."
)


def describe_diagram_detailed(client, model: str, image_bytes: bytes, context_line: str) -> dict:
    parsed, input_tokens, output_tokens, total_tokens = _call_vision(
        client, model, DIAGRAM_SYSTEM_PROMPT,
        f"{context_line}\nExtract every view and every measurement from this diagram.",
        image_bytes, max_completion_tokens=8192,
    )
    description = str(parsed.get("description", "")).strip()
    has_visible_measurements = bool(parsed.get("has_visible_measurements", False))

    measurements = []
    if has_visible_measurements:
        for m in parsed.get("measurements") or []:
            if isinstance(m, dict) and m.get("label") and m.get("value"):
                measurements.append({"label": str(m["label"]).strip(), "value": str(m["value"]).strip()})

    return {
        "description": description,
        "payload": {"vlmMeasurements": measurements, "vlmHasVisibleMeasurements": has_visible_measurements},
        "input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": total_tokens,
    }


# ── Pass 2: graph ────────────────────────────────────────────────────────────

GRAPH_SYSTEM_PROMPT = (
    "You are extracting data from a chart/graph image in a technical service "
    "manual. The image may contain ONE or MULTIPLE separate graphs — examine "
    "it carefully and treat each distinct plotted-curve-with-its-own-axes as "
    "its own graph object, even if several share the page. Do not merge tick "
    "marks or labels from different graphs together. Respond with ONLY a "
    "JSON object, no markdown fences, in this exact shape:\n"
    '{"has_readable_graphs": <true or false>, '
    '"graphs": [{"title": "<the graph\'s printed title/caption, or a short '
    'description if untitled>", '
    '"x_axis": {"label": "<axis label as printed>", "unit": "<unit if shown, '
    'else empty string>", "ticks": ["<tick value 1>", "<tick value 2>", ...]}, '
    '"y_axis": {"label": "<axis label as printed>", "unit": "<unit if shown, '
    'else empty string>", "ticks": [...]}, '
    '"curve_description": "<2-3 sentences on the trend/shape of the plotted '
    'curve(s) in THIS graph only — direction, roughly linear/exponential/etc, '
    'notable points, and which line is which if more than one is plotted>"}], '
    '"description": "<1-2 sentence overview naming how many graphs are shown '
    'and what each is about>", '
    '"content_type": "graph"}\n\n'
    "Rules:\n"
    "- Only include tick values you can actually read printed on an axis — "
    "do not invent evenly-spaced values you assume should be there.\n"
    "- If there are 2 or more distinct graphs, return one object per graph in "
    "the graphs array, in reading order (left-to-right, top-to-bottom).\n"
    "- If has_readable_graphs is false, graphs MUST be an empty array."
)


def describe_graph_detailed(client, model: str, image_bytes: bytes, context_line: str) -> dict:
    parsed, input_tokens, output_tokens, total_tokens = _call_vision(
        client, model, GRAPH_SYSTEM_PROMPT,
        f"{context_line}\nExtract every distinct graph from this image, keeping each one separate.",
        image_bytes, max_completion_tokens=8192,
    )
    description = str(parsed.get("description", "")).strip()
    has_readable_graphs = bool(parsed.get("has_readable_graphs", False))

    graphs = []
    if has_readable_graphs:
        for g in parsed.get("graphs") or []:
            if not isinstance(g, dict):
                continue
            x_axis = g.get("x_axis") or {}
            y_axis = g.get("y_axis") or {}
            graphs.append({
                "title": str(g.get("title", "")).strip(),
                "x_axis": {
                    "label": str(x_axis.get("label", "")).strip(),
                    "unit": str(x_axis.get("unit", "")).strip(),
                    "ticks": [str(t).strip() for t in (x_axis.get("ticks") or [])],
                },
                "y_axis": {
                    "label": str(y_axis.get("label", "")).strip(),
                    "unit": str(y_axis.get("unit", "")).strip(),
                    "ticks": [str(t).strip() for t in (y_axis.get("ticks") or [])],
                },
                "curve_description": str(g.get("curve_description", "")).strip(),
            })

    return {
        "description": description,
        "payload": {"vlmGraphs": graphs, "vlmHasReadableGraphs": has_readable_graphs},
        "input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": total_tokens,
    }


# ── Pass 2: schematic ──────────────────────────────────────────────────────

SCHEMATIC_SYSTEM_PROMPT = (
    "You are extracting a structured circuit map from an electrical schematic "
    "or wiring diagram in a service manual. Identify every labeled component "
    "and how components connect to each other. This structured data may later "
    "be used to overlay information onto this same static image, so "
    "consistent naming matters — use the exact printed label/reference "
    "designator (e.g. 'FUSE104', 'TERMINAL BOARD') as a component's name "
    "wherever one is printed. Respond with ONLY a JSON object, no markdown "
    "fences, in this exact shape:\n"
    '{"has_identifiable_components": <true or false>, '
    '"components": [{"name": "<printed label/reference designator>", '
    '"type": "<one of: fuse, relay, connector, terminal_block, capacitor, '
    'resistor, thermistor, motor, compressor, reactor, transformer, ic, '
    'power_supply, pfc, rectifier, communication_circuit, sensor, other>", '
    '"value": "<rating/marking/value as printed, or empty string if none>", '
    '"location": "<brief position description, e.g. \'upper left\'>"}], '
    '"connections": [{"from": "<component name>", "to": "<component name>", '
    '"relationship": "<short label, e.g. \'power_path\', \'signal\', '
    '\'ground\', or the printed wire color/number if that\'s what\'s shown>"}], '
    '"description": "<2-4 sentence prose overview of the circuit>", '
    '"content_type": "schematic"}\n\n'
    "Rules:\n"
    "- Only list a component if you can see its label or a clear box/symbol "
    "for it in the image. Do not invent standard components that 'should' be "
    "there just because similar circuits usually have them.\n"
    "- Only list a connection if you can actually trace a line/wire between "
    "the two components, or the layout makes the relationship unambiguous "
    "(e.g. a fuse directly feeding the block drawn right below it). If "
    "you're guessing, leave it out.\n"
    "- If has_identifiable_components is false, both components and "
    "connections MUST be empty arrays.\n"
    "- Reuse the EXACT same 'name' string for a component every time it's "
    "referenced in connections, so they can be matched programmatically."
)


def describe_schematic_detailed(client, model: str, image_bytes: bytes, context_line: str) -> dict:
    parsed, input_tokens, output_tokens, total_tokens = _call_vision(
        client, model, SCHEMATIC_SYSTEM_PROMPT,
        f"{context_line}\nExtract every component and connection from this schematic.",
        image_bytes, max_completion_tokens=8192,
    )
    description = str(parsed.get("description", "")).strip()
    has_identifiable_components = bool(parsed.get("has_identifiable_components", False))

    components, connections = [], []
    if has_identifiable_components:
        for c in parsed.get("components") or []:
            if isinstance(c, dict) and c.get("name"):
                components.append({
                    "name": str(c["name"]).strip(),
                    "type": str(c.get("type", "other")).strip().lower(),
                    "value": str(c.get("value", "")).strip(),
                    "location": str(c.get("location", "")).strip(),
                })
        for e in parsed.get("connections") or []:
            if isinstance(e, dict) and e.get("from") and e.get("to"):
                connections.append({
                    "from": str(e["from"]).strip(),
                    "to": str(e["to"]).strip(),
                    "relationship": str(e.get("relationship", "")).strip(),
                })

    return {
        "description": description,
        "payload": {
            "vlmComponents": components,
            "vlmConnections": connections,
            "vlmHasIdentifiableComponents": has_identifiable_components,
        },
        "input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": total_tokens,
    }


# ── Pass 2: flowchart ──────────────────────────────────────────────────────

FLOWCHART_SYSTEM_PROMPT = (
    "You are extracting the decision logic from a troubleshooting flowchart "
    "in a service manual. The image may contain MULTIPLE independent "
    "flowcharts (e.g. separate sections for different checks) — keep each "
    "section separate. Respond with ONLY a JSON object, no markdown fences, "
    "in this exact shape:\n"
    '{"has_readable_flow": <true or false>, '
    '"flowcharts": [{"title": "<this section\'s printed heading>", '
    '"nodes": [{"id": "<short id you assign, e.g. \'n1\'>", "label": '
    '"<condition, question, or outcome text as printed>", "type": '
    '"<one of: start, decision, outcome, cause>", "value": "<threshold/number '
    'tied to this node if any, e.g. \'8°C\', \'15 minutes\', else empty '
    'string>"}], '
    '"edges": [{"from": "<node id>", "to": "<node id>", "label": "<branch '
    'condition, e.g. \'more than 8°C\', \'higher than specified\', or empty '
    'string if unconditional>"}]}], '
    '"description": "<2-4 sentence overview naming each flowchart section and '
    'what it checks>", '
    '"content_type": "flowchart"}\n\n'
    "Rules:\n"
    "- One object per independent flowchart/section if the page has more "
    "than one.\n"
    "- Only include a node or edge you can actually see in the image's "
    "boxes/arrows/branches — don't infer steps that 'should' logically be "
    "there.\n"
    "- If has_readable_flow is false, flowcharts MUST be an empty array."
)


def describe_flowchart_detailed(client, model: str, image_bytes: bytes, context_line: str) -> dict:
    parsed, input_tokens, output_tokens, total_tokens = _call_vision(
        client, model, FLOWCHART_SYSTEM_PROMPT,
        f"{context_line}\nExtract every flowchart section, its nodes, and its branches from this image.",
        image_bytes, max_completion_tokens=8192,
    )
    description = str(parsed.get("description", "")).strip()
    has_readable_flow = bool(parsed.get("has_readable_flow", False))

    flowcharts = []
    if has_readable_flow:
        for f in parsed.get("flowcharts") or []:
            if not isinstance(f, dict):
                continue
            nodes = [
                {
                    "id": str(n.get("id", "")).strip(),
                    "label": str(n.get("label", "")).strip(),
                    "type": str(n.get("type", "")).strip().lower(),
                    "value": str(n.get("value", "")).strip(),
                }
                for n in (f.get("nodes") or []) if isinstance(n, dict) and n.get("label")
            ]
            edges = [
                {
                    "from": str(e.get("from", "")).strip(),
                    "to": str(e.get("to", "")).strip(),
                    "label": str(e.get("label", "")).strip(),
                }
                for e in (f.get("edges") or []) if isinstance(e, dict) and e.get("from") and e.get("to")
            ]
            flowcharts.append({"title": str(f.get("title", "")).strip(), "nodes": nodes, "edges": edges})

    return {
        "description": description,
        "payload": {"vlmFlowcharts": flowcharts, "vlmHasReadableFlow": has_readable_flow},
        "input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": total_tokens,
    }


# ── Pass 2: installation_diagram ───────────────────────────────────────────

INSTALLATION_SYSTEM_PROMPT = (
    "You are extracting a step-by-step index from an illustrated "
    "installation/assembly instruction page in a service manual. The image "
    "usually shows several small illustration panels, each a different view "
    "or step. Respond with ONLY a JSON object, no markdown fences, in this "
    "exact shape:\n"
    '{"has_readable_steps": <true or false>, '
    '"steps": [{"panel_title": "<this panel\'s printed caption/heading, or a '
    'short name for the view if untitled, e.g. \'Right rear piping view\'>", '
    '"parts_shown": ["<part or component labeled in this panel>", ...], '
    '"note": "<any instruction text, measurement, or callout specific to '
    'this panel, e.g. \'70 mm or more clearance\', else empty string>"}], '
    '"description": "<2-4 sentence overview walking through the panels in '
    'order>", '
    '"content_type": "installation_diagram"}\n\n'
    "Rules:\n"
    "- One object per illustrated panel/view, in reading order (left-to-"
    "right, top-to-bottom).\n"
    "- Only list a part if it's actually labeled or clearly pointed to in "
    "that panel.\n"
    "- If has_readable_steps is false, steps MUST be an empty array."
)


def describe_installation_detailed(client, model: str, image_bytes: bytes, context_line: str) -> dict:
    parsed, input_tokens, output_tokens, total_tokens = _call_vision(
        client, model, INSTALLATION_SYSTEM_PROMPT,
        f"{context_line}\nExtract every illustrated panel/step from this installation page, in order.",
        image_bytes, max_completion_tokens=8192,
    )
    description = str(parsed.get("description", "")).strip()
    has_readable_steps = bool(parsed.get("has_readable_steps", False))

    steps = []
    if has_readable_steps:
        for s in parsed.get("steps") or []:
            if isinstance(s, dict) and s.get("panel_title"):
                steps.append({
                    "panel_title": str(s["panel_title"]).strip(),
                    "parts_shown": [str(p).strip() for p in (s.get("parts_shown") or [])],
                    "note": str(s.get("note", "")).strip(),
                })

    return {
        "description": description,
        "payload": {"vlmInstallationSteps": steps, "vlmHasReadableSteps": has_readable_steps},
        "input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": total_tokens,
    }


# ── Dispatch table used by pipeline.py ─────────────────────────────────────

DETAIL_HANDLERS = {
    "diagram": describe_diagram_detailed,
    "graph": describe_graph_detailed,
    "schematic": describe_schematic_detailed,
    "flowchart": describe_flowchart_detailed,
    "installation_diagram": describe_installation_detailed,
}

# Every structured field ANY detail pass can write, mapped to its "empty"
# default. pipeline.py applies this before writing a fresh result so that a
# doc reclassified from one tag to another (e.g. "diagram" -> "graph" on a
# retag run) never keeps stale fields from its old tag sitting alongside the
# new ones — Firestore's update() merges by default, it doesn't replace, so
# without this a re-tagged doc would carry both vlmMeasurements AND vlmGraphs
# and downstream code (embedding text-building in particular) would blend
# both into one confused chunk of text.
ALL_DETAIL_FIELDS = {
    "vlmMeasurements": [], "vlmHasVisibleMeasurements": None,
    "vlmGraphs": [], "vlmHasReadableGraphs": None,
    "vlmComponents": [], "vlmConnections": [], "vlmHasIdentifiableComponents": None,
    "vlmFlowcharts": [], "vlmHasReadableFlow": None,
    "vlmInstallationSteps": [], "vlmHasReadableSteps": None,
}