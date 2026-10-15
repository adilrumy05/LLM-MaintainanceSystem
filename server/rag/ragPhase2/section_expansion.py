"""section_expansion.py  (put next to retrieval_pipeline.py)

Generic, manual-agnostic helpers. Nothing in here knows about a particular page,
chapter or manufacturer.

  compute_page_sections   (ingest side)  work out which section(s) every page
                          belongs to, per document, from the headings in its text.
  merge_with_type_floor   (query side)   keep top-k children/tables AND the top few
                          images, because they are scored on different scales.
  expand_sections         (query side)   find the section(s) the question is about
                          and add every chunk of them, in page order, score 0.
  embed_heading_prefix    (ingest side)  heading text to prepend to image embeddings.

A "document" is (document_group_id, filename): page numbers restart per PDF and
section numbers repeat between PDFs, so nothing is ever grouped across documents.

Heading styles handled
  numbered   "# 16.1.1.5 To Remove ..."  grouped by number
             "16.1.1.5 To Remove ..."     (markdown '#' lost by the converter)
  unnumbered "## Removing the filter"    grouped by title, levels # and ## only
  none       no headings in the text     falls back to +/-N neighbouring pages
"""
import math
import os
import re
import time
from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Tuple

from qdrant_client.models import FieldCondition, Filter, MatchValue, Range

IMAGE_FLOOR            = int(os.getenv("RETRIEVAL_IMAGE_FLOOR", "4"))     # extra image hits kept
SECTION_SEED_HITS      = int(os.getenv("SECTION_SEED_HITS", "1"))         # top hits per document that nominate sections
SECTION_MAX_DOCS       = int(os.getenv("SECTION_MAX_DOCS", "2"))          # documents expanded per query
SECTION_MAX_PARENTS    = int(os.getenv("SECTION_MAX_PARENTS", "3"))       # sections expanded per document
SECTION_MAX_PAGES      = int(os.getenv("SECTION_MAX_PAGES", "8"))         # pages kept per section
SECTION_MAX_CHARS      = int(os.getenv("SECTION_MAX_CHARS", "60000"))     # hard cap on text added
SECTION_NEIGHBOR_PAGES = int(os.getenv("SECTION_NEIGHBOR_PAGES", "1"))    # fallback when no headings
CATALOG_TTL            = int(os.getenv("SECTION_CATALOG_TTL", "600"))     # seconds
MAX_HEADINGS_PER_PAGE  = 12                                               # more => TOC/index page
_GENERIC = {"note", "notes", "caution", "cautions", "warning", "warnings", "important",
            "tip", "tips", "reference", "remarks", "remark"}              # never a section

TOC_FIELDS = ["toc_sections", "toc_section_keys", "toc_section", "toc_parents", "toc_page_headings"]

# ── headings ──────────────────────────────────────────────────────────────────

# Normal markdown heading:  "# 16.1.1.5 To Remove the filter"
_MARKDOWN_HEADING_RE = re.compile(
    r"^[ \t]*(#{1,6})[ \t]*(?:(\d+(?:\.\d+)*)[.)]?[ \t]+)?(\S.*?)[ \t]*$", re.M)

# Fallback for numbered headings whose markdown '#' prefix the PDF->markdown
# converter dropped:  "16.1.1.4 To Remove Control Board"
# Require >= 3 number parts (16.1.1.4, not 16.1 and not 1.) so numbered step
# lists like "1. Remove screw" are never mistaken for headings.
_NUMBERED_HEADING_RE = re.compile(
    r"^[ \t]*(\d+(?:\.\d+){2,})[.)]?[ \t]+(\S[^\n]{0,150})[ \t]*$", re.M)

# Boundaries that mean "heading title ends here, body begins".  Order in the
# alternation does not matter — the leftmost match wins.
# Boundaries that mean "heading title ends here, body begins".
_TITLE_CUT = re.compile(
    r" # "                                    # start of the next heading
    r"| - "                                   # bullet list
    r"| \| "                                  # pipe separator
    r"| <"                                    # angle-bracket figure label: <Top View>
    r"|(?<=[a-z]) (?=[A-Z][A-Z0-9]+\b)"       # ALL-CAPS word after lowercase (2+ chars, includes ON/PC/AC)
    r"|\. (?=[A-Z])"                          # sentence end + capital
    r"| \d+ [A-Z]"                            # step list: " 1 Insert ...", " 2 Fix ..."
)


def _clean_heading_title(raw: str, max_len: int = 120, max_words: int = 14) -> str:
    """
    Cut a heading title off at the first plausible body-text boundary, then
    hard-cap the word count so body text that begins with a plain capitalised
    word ('Connect the Cable to the Indoor Unit The power supply cord ...')
    is trimmed even when no textual boundary marker is present.
    """
    t = (raw or "").strip()
    if not t:
        return t
    m = _TITLE_CUT.search(t)
    if m:
        t = t[: m.start()]
    t = t.strip().rstrip(" -|#.,;:")
    words = t.split()
    if len(words) > max_words:
        t = " ".join(words[:max_words])
    return t[:max_len]


def extract_headings(text: str) -> List[Tuple[int, Optional[str], str]]:
    """
    Return (level, number, title) for every heading in a chunk.

    Three problems are handled here, all caused by the chunker joining
    sentences with spaces:

      1. Any heading after the first in a chunk has lost its leading newline,
         so the anchored regex would skip it.  We restore a newline before
         each '# <number>' marker first.

      2. Some headings in the source PDF were never converted to markdown
         headings, so they arrive as bare '16.1.1.4 To Remove Control Board'
         with no '#'.  A second regex catches those, but requires >= 3 number
         parts so numbered step lists ('1. Remove screw') never match.

      3. Flattened headings carry their body text with them ('Timer Control -
         There are 2 sets ...'); _clean_heading_title trims that.
    """
    t = re.sub(r"[ \t]+(?=#[ \t]*\d+(?:\.\d+)*[.)]?[ \t])", "\n", " " + (text or ""))

    out: List[Tuple[int, Optional[str], str]] = []

    # Pass 1 — markdown headings
    for m in _MARKDOWN_HEADING_RE.finditer(t):
        title = _clean_heading_title(m.group(3))
        if title:
            out.append((len(m.group(1)), m.group(2), title))

    # Pass 2 — numbered headings whose '#' was dropped by the converter
    for m in _NUMBERED_HEADING_RE.finditer(t):
        num   = m.group(1)
        title = _clean_heading_title(m.group(2))
        if title:
            out.append((min(num.count(".") + 1, 6), num, title))

    return out


def group_key(num: str) -> str:
    """Section number -> grouping key.  Cap at 4 levels deep.
       16.1.1.1.1 -> 16.1.1.1 ; 16.1.1.1 -> 16.1.1.1 ; 16.1.1 -> 16.1.1 ; 3.2 -> 3.2"""
    parts = num.split(".")
    return ".".join(parts[:4])


def _slug(t: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def _num_tuple(n: str):
    return tuple(int(x) for x in n.split("."))


# ── ingest side: tag every page ───────────────────────────────────────────────
def compute_page_sections(points: Iterable[Tuple[Any, Dict]]):
    """
    points: iterable of (point_id, payload).
    Returns (tags, report)
      tags[(group, filename, page)] = {ids, toc_sections, toc_section_keys, toc_section,
                                       toc_parents, toc_page_headings}
      report[(group, filename)]     = {mode, pages, toc_pages, ignored, untagged}
    """
    docs = defaultdict(lambda: defaultdict(list))
    for pid, pl in points:
        pl = pl or {}
        g, pg = pl.get("document_group_id"), pl.get("page")
        if g and isinstance(pg, int):
            docs[(g, pl.get("filename") or "")][pg].append((pid, pl))

    tags, report = {}, {}
    for (g, fn), pages in docs.items():
        heads, n_num, n_un = {}, 0, 0
        for pg, chunks in pages.items():
            nums, uns = {}, {}
            for _, pl in chunks:
                if pl.get("chunk_type") == "image":      # image text is a VLM description, not the manual
                    continue
                for level, num, title in extract_headings(pl.get("text", "")):
                    if num:
                        if len(title) > len(nums.get(num, "")):
                            nums[num] = title
                    elif level <= 2:
                        uns[title] = level
            heads[pg] = (nums, uns)
            n_num += len(nums)
            n_un += len(uns)
        mode = ("numbered" if n_num >= 3 and n_num * 3 >= n_un
                else "unnumbered" if n_un else "none")
        rep = {"mode": mode, "pages": len(pages), "toc_pages": [], "ignored": [], "untagged": []}
        report[(g, fn)] = rep

        carried, cur_ch = None, None
        for pg in sorted(pages):
            nums, uns = heads[pg]
            if mode == "numbered":
                cands = sorted(nums, key=_num_tuple)
            elif mode == "unnumbered":
                cands = [t for t in sorted(uns, key=lambda t: (uns[t], t)) if _slug(t) not in _GENERIC]
            else:
                cands = []
            if len(cands) > MAX_HEADINGS_PER_PAGE:       # contents/index page: don't tag, don't carry
                rep["toc_pages"].append(pg)
                continue
            if mode == "numbered":
                # Numbered STEPS inside a procedure ("# 2 Remove the screws") look like chapter
                # headings. Real headings never go back to an earlier chapter, so ignore a
                # shallow (1-2 part) number whose chapter is lower than the one we are in.
                found = []
                for n in cands:
                    ch, depth = int(n.split(".")[0]), n.count(".") + 1
                    if depth <= 2 and cur_ch is not None and ch < cur_ch:
                        rep["ignored"].append((pg, n))
                        continue
                    if depth >= 2:
                        cur_ch = ch
                    found.append((f"{n} {nums[n]}", group_key(n)))
            elif mode == "unnumbered":
                found = [(t, _slug(t)) for t in cands]
            else:
                found = []
            # Carry the previous heading in only if it is the same section, so a page is never
            # glued to whatever unrelated section the previous page happened to end in.
            if found:
                carry_in = [carried] if carried and carried[1] == found[0][1] else []
            else:
                carry_in = [carried] if carried else []
            secs = list(dict.fromkeys(carry_in + found))
            if found:
                carried = found[-1]
            if not secs:
                rep["untagged"].append(pg)
                continue
            tags[(g, fn, pg)] = {
                "ids": [pid for pid, _ in pages[pg]],
                "toc_sections": [s[0] for s in secs],
                "toc_section_keys": [s[1] for s in secs],
                "toc_section": secs[-1][0],
                "toc_parents": sorted({s[1] for s in secs}),
                "toc_page_headings": [f[0] for f in found],
            }
    return tags, report


def embed_heading_prefix(page_headings: Optional[List[str]], section: Optional[str] = None,
                         max_items: int = 3) -> str:
    """Prepend to image text before embedding, e.g. '[Figure on page 124 - <prefix>] ...'"""
    items = list(page_headings or [])[:max_items] or ([section] if section else [])
    return "; ".join(items)


# ── query side ────────────────────────────────────────────────────────────────
def merge_with_type_floor(
    hits: List[Dict[str, Any]],
    k: int,
    image_floor: int = IMAGE_FLOOR,
):
    # Stable ordering for equal scores.
    hits = sorted(
        hits,
        key=lambda h: (h["score"], str(h["id"])),
        reverse=True,
    )

    images = [
        h for h in hits
        if h["payload"].get("chunk_type") == "image"
    ]
    others = [
        h for h in hits
        if h["payload"].get("chunk_type") != "image"
    ]

    chosen = others[:k] + images[:image_floor]

    chosen.sort(
        key=lambda h: (h["score"], str(h["id"])),
        reverse=True,
    )
    return chosen


_STOP = set(
    "a an the to of and or for in on at by with from how do does did i you we it is are be can "
    "could should would what which where when why my me this that there get gets got need needs "
    "want find show tell step steps procedure manual please".split())


def _stem(w: str) -> str:
    for suf in ("ation", "ing", "al", "ed", "es", "s", "e"):
        if w.endswith(suf) and len(w) - len(suf) >= 3:
            return w[: -len(suf)]
    return w


def _words(text: str) -> set:
    return {_stem(w) for w in re.findall(r"[a-z0-9]+", text.lower())
            if w not in _STOP and not w.isdigit()}


def _doc_filter(group, filename) -> list:
    must = []
    if group:
        must.append(FieldCondition(key="document_group_id", match=MatchValue(value=group)))
    if filename:
        must.append(FieldCondition(key="filename", match=MatchValue(value=filename)))
    return must


_NOT_CHILD = FieldCondition(key="chunk_type", match=MatchValue(value="child"))
_catalog_cache: Dict[Tuple, Tuple[float, dict]] = {}


def _scroll_all(vs, flt, fields):
    out, offset = [], None
    while True:
        pts, offset = vs.client.scroll(collection_name=vs.collection, scroll_filter=flt, limit=512,
                                       offset=offset, with_payload=fields, with_vectors=False)
        out.extend(pts)
        if offset is None:
            return out


def _catalog(vs, group, filename) -> dict:
    """Headings of one document -> {key, start pages, words}, plus document frequencies."""
    ck = (group, filename)
    cached = _catalog_cache.get(ck)
    if cached and time.time() - cached[0] < CATALOG_TTL:
        return cached[1]
    heads: Dict[str, dict] = {}
    for p in _scroll_all(vs, Filter(must=_doc_filter(group, filename)),
                         ["toc_sections", "toc_section_keys", "toc_page_headings", "page"]):
        pl = p.payload or {}
        starts = set(pl.get("toc_page_headings") or [])
        for h, k in zip(pl.get("toc_sections") or [], pl.get("toc_section_keys") or []):
            info = heads.setdefault(h, {"key": k, "pages": set()})
            if h in starts and isinstance(pl.get("page"), int):
                info["pages"].add(pl["page"])
    df = defaultdict(int)
    for h, info in heads.items():
        info["words"] = _words(re.sub(r"^\d+(?:\.\d+)*[.)]?\s+", "", h))
        for w in info["words"]:
            df[w] += 1
    cat = {"heads": heads, "df": df, "n": max(len(heads), 2)}
    if heads:                                    # never cache a not-yet-tagged (empty) catalogue
        _catalog_cache[ck] = (time.time(), cat)
    return cat

def _match_headings(question: str, cat: dict, hit_keys: set):
    """Rank headings by wording, with a small bonus for top-hit sections."""
    q = _words(question)

    # Interpret access/reach/get-to questions as removal intent.
    if re.search(
        r"\b(get to|access|reach|take (?:out|off)|open up|replace|change|"
        r"dismantl\w*|disassembl\w*|detach)\b",
        question.lower(),
    ):
        q.add(_stem("remove"))

    if not q or not cat["heads"]:
        return []

    n = cat["n"]
    thresh = 0.9 * math.log(n)
    scored = []

    for h, info in cat["heads"].items():
        shared = q & info["words"]
        if shared:
            score = sum(math.log(n / cat["df"][w]) for w in shared)
            if score >= thresh:
                scored.append((score, h, info))

    if not scored:
        return []

    best = max(s[0] for s in scored)
    keep = [s for s in scored if s[0] >= 0.85 * best]

    # Wording matters most. Depth and top-hit membership are small bonuses.
    keep.sort(
        key=lambda s: (
            s[0]
            + 0.3 * s[2]["key"].count(".")
            + (0.2 if s[2]["key"] in hit_keys else 0)
        ),
        reverse=True,
    )
    return keep


def _section_points(vs, group, filename, key, seed_pages):
    # Fetch all non-child chunks for this document, then filter client-side to
    # keep only those whose toc_parents contains `key` OR any key starting with
    # `key + '.'`. This covers the case where pages are tagged with their leaf
    # section only (e.g. '16.1.1.5') and don't carry ancestors ('16.1.1').
    flt = Filter(must=_doc_filter(group, filename), must_not=[_NOT_CHILD])
    all_pts = _scroll_all(vs, flt, True)

    prefix = key + "."
    pts = [
        p for p in all_pts
        if any(
            t == key or t.startswith(prefix)
            for t in ((p.payload or {}).get("toc_parents") or [])
        )
    ]

    pages = sorted({(p.payload or {}).get("page", 0) for p in pts})
    if len(pages) > SECTION_MAX_PAGES:           # keep the pages closest to what matched
        anchors = sorted(seed_pages) or pages[:1]
        pages = sorted(sorted(pages, key=lambda x: (min(abs(x - a) for a in anchors), x))
                       [:SECTION_MAX_PAGES])
    keep = set(pages)
    return [p for p in pts if (p.payload or {}).get("page", 0) in keep]


def _neighbor_points(vs, group, filename, page):
    n = SECTION_NEIGHBOR_PAGES
    flt = Filter(must=[FieldCondition(key="page", range=Range(gte=page - n, lte=page + n))]
                      + _doc_filter(group, filename), must_not=[_NOT_CHILD])
    return _scroll_all(vs, flt, True)


def expand_sections(
    vs,
    hits: List[Dict[str, Any]],
    question: str,
    document_group_id: Optional[str] = None,
    filename: Optional[str] = None,
):
    if not hits:
        return hits

    docs = []
    for h in hits[:3]:
        pl = h["payload"]
        d = (
            document_group_id or pl.get("document_group_id"),
            filename or pl.get("filename") or None,
        )
        if d[0] and d not in docs:
            docs.append(d)

    docs = docs[:SECTION_MAX_DOCS]

    have = {h["id"] for h in hits}
    extra, chars = [], 0

    for di, (grp, fn) in enumerate(docs):
        top = [
            h for h in hits
            if h["payload"].get("document_group_id") == grp
            and (not fn or h["payload"].get("filename") == fn)
        ][:SECTION_SEED_HITS]

        hit_keys = {
            k
            for h in top
            for k in (h["payload"].get("toc_parents") or [])
        }

        seeds: Dict[str, set] = {}

        # Seed sections matched by heading wording.
        for _, _, info in _match_headings(
            question, _catalog(vs, grp, fn), hit_keys
        ):
            seeds.setdefault(info["key"], set()).update(info["pages"])

        # Also seed sections containing the top retrieval hits.
        for h in top:
            pg = h["payload"].get("page")
            for k in h["payload"].get("toc_parents") or []:
                seeds.setdefault(k, set())
                if isinstance(pg, int):
                    seeds[k].add(pg)

        # Choose sections only after collecting all seeds.
        keys = list(seeds)[:SECTION_MAX_PARENTS]

        # Include parents of selected deep sections.
        for k in list(keys):
            if k.count(".") >= 3:
                parent = k.rsplit(".", 1)[0]

                if parent not in keys:
                    keys.append(parent)

                seeds.setdefault(parent, set()).update(seeds[k])

        print(
            f"[SECTION] doc={grp}/{fn or '*'} sections={keys}"
            + (
                ""
                if keys
                else f"  (no section tags; neighbour pages +/-{SECTION_NEIGHBOR_PAGES})"
            )
        )

        batches = [
            (rank, _section_points(vs, grp, fn, k, seeds[k]))
            for rank, k in enumerate(keys)
        ]

        if (
            not keys
            and top
            and SECTION_NEIGHBOR_PAGES > 0
            and isinstance(top[0]["payload"].get("page"), int)
        ):
            batches.append(
                (
                    0,
                    _neighbor_points(
                        vs, grp, fn, top[0]["payload"]["page"]
                    ),
                )
            )

        for rank, pts in batches:
            for p in pts:
                pl = p.payload or {}
                size = len(pl.get("text", "") or "")

                if p.id in have or chars + size > SECTION_MAX_CHARS:
                    continue

                have.add(p.id)
                chars += size

                order = {
                    "parent": 0,
                    "table": 1,
                }.get(pl.get("chunk_type"), 2)

                extra.append(
                    (
                        di,
                        rank,
                        pl.get("page", 0),
                        order,
                        {
                            "id": p.id,
                            "score": 0.0,
                            "payload": pl,
                        },
                    )
                )

    extra.sort(key=lambda e: e[:4])

    print(
        f"[SECTION] added {len(extra)} chunks, "
        f"pages {sorted({e[2] for e in extra})}, "
        f"{chars:,} chars"
    )

    return hits + [e[4] for e in extra]