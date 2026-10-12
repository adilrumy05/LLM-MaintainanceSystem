"""backfill_toc_sections.py  (put in ragPhase2/)

Tags every chunk of EVERY document with the section(s) in effect on its page and prints
an audit. Safe to re-run: only chunks whose tags changed are written, and stale tags are
removed. Run it after every ingest or re-embed (upserts replace payloads).

  python backfill_toc_sections.py                       audit only (dry run), all documents
  python backfill_toc_sections.py --write               apply
  python backfill_toc_sections.py --group GROUP_ID      one document group
  python backfill_toc_sections.py --show GROUP_ID:120-130   print per-page tags for a range
  python backfill_toc_sections.py --write --force       rewrite everything even if unchanged
"""
import argparse
import os
from collections import defaultdict

from dotenv import load_dotenv
load_dotenv()
from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchValue, PayloadSchemaType

from section_expansion import TOC_FIELDS, compute_page_sections

COLLECTION = os.getenv("QDRANT_COLLECTION", "text_chunks_general")

ap = argparse.ArgumentParser()
ap.add_argument("--write", action="store_true")
ap.add_argument("--force", action="store_true")
ap.add_argument("--group")
ap.add_argument("--show", help="GROUP_ID:FIRST-LAST")
args = ap.parse_args()

client = QdrantClient(url=os.environ["QDRANT_URL"], api_key=os.environ["QDRANT_API_KEY"],
                      check_compatibility=False)

flt = (Filter(must=[FieldCondition(key="document_group_id", match=MatchValue(value=args.group))])
       if args.group else None)
pts, offset = [], None
while True:
    batch, offset = client.scroll(COLLECTION, scroll_filter=flt, limit=512, offset=offset,
                                  with_payload=True, with_vectors=False)
    pts.extend(batch)
    if offset is None:
        break
print(f"scanned {len(pts)} points")

existing = {p.id: (p.payload or {}) for p in pts}
tags, report = compute_page_sections((p.id, p.payload) for p in pts)

show_group = show_lo = show_hi = None
if args.show:
    show_group, rng = args.show.rsplit(":", 1)
    show_lo, show_hi = (int(x) for x in rng.split("-"))

# ── audit ─────────────────────────────────────────────────────────────────────
print()
for (g, fn), rep in sorted(report.items()):
    doc_tags = {pg: t for (gg, ff, pg), t in tags.items() if (gg, ff) == (g, fn)}
    by_key = defaultdict(set)
    for pg, t in doc_tags.items():
        for k in t["toc_parents"]:
            by_key[k].add(pg)
    print(f"{g} / {fn or '(no filename)'}")
    print(f"   headings: {rep['mode']}   pages tagged: {len(doc_tags)}/{rep['pages']}"
          f"   sections: {len(by_key)}")
    if rep["mode"] == "none":
        print("   WARN no headings found in text chunks -> retrieval falls back to neighbouring pages")
    if rep["toc_pages"]:
        print(f"   skipped contents/index pages: {rep['toc_pages']}")
    if rep["ignored"]:
        print(f"   ignored out-of-order (step-like) headings: {rep['ignored'][:8]}"
              f"{'...' if len(rep['ignored']) > 8 else ''}")
    if rep["untagged"]:
        print(f"   untagged pages (no heading yet): {rep['untagged'][:15]}"
              f"{'...' if len(rep['untagged']) > 15 else ''}")
    big = sorted(by_key.items(), key=lambda kv: -len(kv[1]))[:3]
    print("   largest sections: " + "; ".join(
        f"{k} ({len(v)}p, {min(v)}-{max(v)})" for k, v in big))
    gaps = [(k, sorted(v)) for k, v in by_key.items()
            if max(v) - min(v) + 1 - len(v) > 2]
    for k, v in gaps[:5]:
        print(f"   WARN section {k} is not contiguous: pages {v[:12]}{'...' if len(v) > 12 else ''}")
    if g == show_group:
        for pg in range(show_lo, show_hi + 1):
            t = doc_tags.get(pg)
            print(f"   p{pg}: " + (f"{t['toc_sections']}" if t else "(untagged)"))
    print()

# ── writes (only what changed) ────────────────────────────────────────────────
to_write = defaultdict(list)           # (group, filename, page) -> ids needing the tags
for key, t in tags.items():
    for pid in t["ids"]:
        cur = existing[pid]
        if args.force or any(cur.get(f) != t[f] for f in TOC_FIELDS):
            to_write[key].append(pid)

tagged_ids = {pid for t in tags.values() for pid in t["ids"]}
stale = [pid for pid, pl in existing.items()
         if pid not in tagged_ids and any(pl.get(f) for f in TOC_FIELDS)]

print(f"chunks to write: {sum(len(v) for v in to_write.values())}   stale tags to remove: {len(stale)}")
if not args.write:
    print("dry run only; re-run with --write to apply.")
    raise SystemExit

for key, ids in to_write.items():
    t = tags[key]
    client.set_payload(COLLECTION, payload={f: t[f] for f in TOC_FIELDS}, points=ids)
if stale:
    client.delete_payload(COLLECTION, keys=TOC_FIELDS, points=stale)

for field, schema in (("toc_parents", PayloadSchemaType.KEYWORD), ("page", PayloadSchemaType.INTEGER)):
    try:
        client.create_payload_index(COLLECTION, field, schema)
    except Exception as e:
        print(f"index {field}: {e}")
print("written.")