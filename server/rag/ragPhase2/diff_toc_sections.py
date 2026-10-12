"""diff_toc_sections.py  (put in ragPhase2/)

Show OLD vs NEW TOC tags per page for one document group.

  python diff_toc_sections.py --group GROUP_ID                 # only changed pages
  python diff_toc_sections.py --group GROUP_ID --all           # every page
  python diff_toc_sections.py --group GROUP_ID --page 76-90    # slice
  python diff_toc_sections.py --group GROUP_ID --field toc_parents
"""
import argparse
import os
import re
from collections import defaultdict

from dotenv import load_dotenv
load_dotenv()
from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchValue

from section_expansion import TOC_FIELDS, compute_page_sections

COLLECTION = os.getenv("QDRANT_COLLECTION", "text_chunks_general")

ap = argparse.ArgumentParser()
ap.add_argument("--group", required=True)
ap.add_argument("--all", action="store_true", help="show unchanged pages too")
ap.add_argument("--page", help="FIRST-LAST page range filter, e.g. 76-90")
ap.add_argument("--field", default="toc_sections",
                choices=["toc_sections", "toc_parents", "toc_section", "toc_page_headings"],
                help="which TOC field to diff (default toc_sections)")
args = ap.parse_args()

client = QdrantClient(url=os.environ["QDRANT_URL"], api_key=os.environ["QDRANT_API_KEY"],
                      check_compatibility=False)

flt = Filter(must=[FieldCondition(key="document_group_id", match=MatchValue(value=args.group))])
pts, offset = [], None
while True:
    batch, offset = client.scroll(COLLECTION, scroll_filter=flt, limit=512, offset=offset,
                                  with_payload=True, with_vectors=False)
    pts.extend(batch)
    if offset is None:
        break
print(f"scanned {len(pts)} points in group {args.group!r}")

lo, hi = (int(x) for x in args.page.split("-")) if args.page else (None, None)


# ── numeric-aware sort key ────────────────────────────────────────────────────
def numkey(v: str):
    """
    Sort key that orders section strings numerically.

    "12.9 ..."  -> (12, 9)
    "12.10 ..." -> (12, 10)         -> 12.9 comes before 12.10
    "11.1.6.1"  -> (11, 1, 6, 1)
    non-numeric -> ((10**9,), v)    -> sorts after everything numeric
    """
    m = re.match(r"(\d+(?:\.\d+)*)", v)
    return (tuple(int(x) for x in m.group(1).split(".")), v) if m else ((10**9,), v)


# ── OLD: from current payloads, collapsed per (group, filename, page) ─────────
old = defaultdict(set)                        # (g, fn, pg) -> set of values
for p in pts:
    pl = p.payload or {}
    g, fn, pg = pl.get("document_group_id"), pl.get("filename") or "", pl.get("page")
    if not isinstance(pg, int):
        continue
    val = pl.get(args.field)
    if isinstance(val, list):
        old[(g, fn, pg)].update(val)
    elif val:
        old[(g, fn, pg)].add(val)

# ── NEW: recompute ────────────────────────────────────────────────────────────
tags, _ = compute_page_sections((p.id, p.payload) for p in pts)
new = {}
for (g, fn, pg), t in tags.items():
    v = t.get(args.field)
    new[(g, fn, pg)] = set(v) if isinstance(v, list) else ({v} if v else set())

# ── print ─────────────────────────────────────────────────────────────────────
all_keys = sorted(set(old) | set(new), key=lambda k: (k[0], k[1], k[2]))
last_doc = None
n_changed = 0
for key in all_keys:
    g, fn, pg = key
    if lo is not None and not (lo <= pg <= hi):
        continue
    o, n = old.get(key, set()), new.get(key, set())
    changed = o != n
    if not changed and not args.all:
        continue
    if (g, fn) != last_doc:
        print(f"\n{g} / {fn or '(no filename)'}")
        print(f"{'page':>6}  {'OLD':<45}  NEW")
        last_doc = (g, fn)
    if changed:
        n_changed += 1
    mark = " *" if changed else "  "

    def fmt(s):
        if not s:
            return "-"
        return " | ".join(sorted(s, key=numkey))

    print(f"{pg:>6}{mark} {fmt(o):<45}  {fmt(n)}")

print(f"\n{n_changed} changed page(s) for field {args.field!r}")