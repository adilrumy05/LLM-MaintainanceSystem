# test_retrieval.py
"""
Retrieval test script — no LLM required.

Runs the full retrieval pipeline and prints everything that would be sent
to an LLM, so you can verify the context quality before wiring up a model.

Usage
-----
    python test_retrieval.py

    # Or with overrides:
    QUESTION="What is the cooling capacity?" python test_retrieval.py
    DOC_GROUP=panasonic_aircon_CS-PW24KE python test_retrieval.py

Configuration (.env or environment)
-------------------------------------
    # Required
    QDRANT_URL          http://localhost:6333
    MODEL_LOCAL_PATH    ./models/bge-base-en-v1.5
    DEVICE              cpu

    # Retrieval tuning
    RETRIEVAL_TOP_K     5
    RETRIEVAL_SCORE_MIN 0.0
    RETRIEVAL_HYDRATE_PARENTS  true

    # Test options (can also be set in the CONFIG block below)
    QUESTION            your test question
    DOC_GROUP           document_group_id filter  (optional)
    CLASSIFICATION      e.g. MANUAL               (optional)
    CATEGORY_1          category_level_1 filter   (optional)
"""

import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, str(Path(__file__).parent))


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIG — edit here or set env vars
# ═══════════════════════════════════════════════════════════════════════════════

QUESTION       = os.getenv("QUESTION",       "What is the cooling capacity?")
DOC_GROUP      = os.getenv("DOC_GROUP",       None)   # e.g. "panasonic_aircon_CS-PW24KE"
CLASSIFICATION = os.getenv("CLASSIFICATION",  None)   # e.g. "MANUAL"
CATEGORY_1     = os.getenv("CATEGORY_1",      None)   # e.g. "Air_Conditioner"
CATEGORY_2     = os.getenv("CATEGORY_2",      None)

TOP_K          = int(os.getenv("RETRIEVAL_TOP_K", "5"))

# Custom system prompt (optional — leave as None to use the pipeline default)
SYSTEM_PROMPT  = None

# ═══════════════════════════════════════════════════════════════════════════════


def _separator(char: str = "─", width: int = 70) -> str:
    return char * width


def _print_section(title: str):
    print(f"\n{'═' * 70}")
    print(f"  {title}")
    print(f"{'═' * 70}")


def main():
    _print_section("RETRIEVAL TEST  (no LLM)")

    print(f"\n  Question       : {QUESTION}")
    print(f"  Doc group      : {DOC_GROUP or '(all)'}")
    print(f"  Classification : {CLASSIFICATION or '(all)'}")
    print(f"  Category L1    : {CATEGORY_1 or '(all)'}")
    print(f"  Top-K          : {TOP_K}")
    print(f"  Qdrant URL     : {os.getenv('QDRANT_URL', 'http://localhost:6333')}")
    print(f"  Model path     : {os.getenv('MODEL_LOCAL_PATH', './models/bge-base-en-v1.5')}")

    # ── 1. Init pipeline ──────────────────────────────────────────────────────
    print("\nInitialising retrieval pipeline...")
    try:
        from retrieval_pipeline import RetrievalPipeline
        pipeline = RetrievalPipeline()
    except Exception as e:
        print(f"\n❌  Failed to initialise pipeline: {e}")
        raise

    # ── 2. Show indexed document groups ───────────────────────────────────────
    _print_section("INDEXED DOCUMENT GROUPS")
    try:
        groups = pipeline.list_document_groups()
        if groups:
            for g in groups:
                print(f"  • {g}")
        else:
            print("  (none — collection may be empty)")
    except Exception as e:
        print(f"  Warning: could not list groups: {e}")

    # ── 3. Collection stats ───────────────────────────────────────────────────
    _print_section("COLLECTION STATS")
    try:
        stats = pipeline.collection_stats()
        for k, v in stats.items():
            print(f"  {k:<20}: {v}")
    except Exception as e:
        print(f"  Warning: could not get stats: {e}")

    # ── 4. Run retrieval ──────────────────────────────────────────────────────
    _print_section("RUNNING RETRIEVAL")
    print(f'\n  Query: "{QUESTION}"\n')

    try:
        result = pipeline.retrieve(
            question=QUESTION,
            document_group_id=DOC_GROUP,
            classification=CLASSIFICATION,
            category_level_1=CATEGORY_1,
            category_level_2=CATEGORY_2,
            top_k=TOP_K,
        )
    except Exception as e:
        print(f"\n❌  Retrieval failed: {e}")
        raise

    # ── 5. TOC nav result ─────────────────────────────────────────────────────
    _print_section("TOC NAVIGATION")
    if result.toc_section:
        print(f"  Matched TOC section: «{result.toc_section}»")
        print("  Retrieval was filtered/weighted to this section.")
    else:
        print("  No TOC navigation active for this query.")

    # ── 6. Raw hits summary ───────────────────────────────────────────────────
    _print_section(f"RAW HITS  ({len(result.raw_hits)} returned)")
    if not result.raw_hits:
        print("  No hits — collection may be empty or score threshold too high.")
    for i, hit in enumerate(result.raw_hits, 1):
        p = hit["payload"]
        print(
            f"  [{i}] score={hit['score']:.4f}  "
            f"type={p.get('chunk_type','?'):8}  "
            f"page={p.get('page','?'):>4}  "
            f"group={p.get('document_group_id','?')}  "
            f"file={p.get('filename','?')}"
        )
        # Preview first 100 chars of text
        text_preview = p.get("text", "")[:100].replace("\n", " ")
        print(f"       text: {text_preview}...")

    # ── 7. Context blocks (after parent hydration) ────────────────────────────
    _print_section(f"CONTEXT BLOCKS  ({len(result.context_blocks)} total)")
    for i, block in enumerate(result.context_blocks, 1):
        score_str = f"score={block.score:.4f}" if block.score > 0 else "hydrated parent"
        print(f"\n  [{i}] {block.chunk_type.upper()}  {score_str}")
        print(f"       page={block.page}  "
              f"group={block.document_group_id}  "
              f"file={block.filename}")
        if block.parent_id:
            print(f"       parent_id={block.parent_id}")
        # Show full text (wrapped at 80 chars for readability)
        print(f"\n       {_separator()}")
        for line in block.text.splitlines():
            if line.strip():
                # Wrap long lines
                while len(line) > 76:
                    print(f"       {line[:76]}")
                    line = line[76:]
                print(f"       {line}")
        print(f"       {_separator()}")

    # ── 8. Sources ────────────────────────────────────────────────────────────
    _print_section(f"SOURCES  ({len(result.sources)} unique)")
    for s in result.sources:
        print(
            f"  • {s['document_group_id']} / {s['filename']}  "
            f"(page {s['page']})  [{s['classification']}]"
        )

    # ── 9. Full prompt that would be sent to LLM ──────────────────────────────
    _print_section("FINAL PROMPT  (would be sent to LLM)")
    prompt = result.build_prompt(QUESTION, system_prompt=SYSTEM_PROMPT)
    print()
    print(prompt)

    # ── 10. Prompt stats ──────────────────────────────────────────────────────
    _print_section("PROMPT STATS")
    word_count = len(prompt.split())
    char_count = len(prompt)
    # Rough token estimate (GPT-style ~4 chars/token)
    token_est  = char_count // 4
    print(f"  Characters : {char_count:,}")
    print(f"  Words      : {word_count:,}")
    print(f"  Tokens est : ~{token_est:,}  (rough estimate, 4 chars/token)")

    # ── 11. Save prompt to file ───────────────────────────────────────────────
    out_file = Path("./last_retrieval_prompt.txt")
    out_file.write_text(prompt, encoding="utf-8")
    print(f"\n  Prompt saved to: {out_file.resolve()}")

    # Optional: save full result as JSON for inspection
    debug_file = Path("./last_retrieval_debug.json")
    debug_data = {
        "question":    QUESTION,
        "toc_section": result.toc_section,
        "sources":     result.sources,
        "raw_hits": [
            {
                "score":      h["score"],
                "chunk_type": h["payload"].get("chunk_type"),
                "page":       h["payload"].get("page"),
                "doc_group":  h["payload"].get("document_group_id"),
                "filename":   h["payload"].get("filename"),
                "text_preview": h["payload"].get("text", "")[:200],
            }
            for h in result.raw_hits
        ],
        "context_blocks": [
            {
                "chunk_type": b.chunk_type,
                "score":      b.score,
                "page":       b.page,
                "doc_group":  b.document_group_id,
                "filename":   b.filename,
                "text":       b.text,
            }
            for b in result.context_blocks
        ],
    }
    debug_file.write_text(
        json.dumps(debug_data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"  Debug JSON  : {debug_file.resolve()}")
    print(f"\n{'═' * 70}")
    print("  Done — no LLM was called.")
    print(f"{'═' * 70}\n")


if __name__ == "__main__":
    main()