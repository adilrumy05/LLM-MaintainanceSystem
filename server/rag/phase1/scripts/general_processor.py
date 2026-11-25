# general_processor.py  (Phase 1 LLM Parsing — Colab version)
"""
Post-processing helpers called by phase1_llm_parsing.ipynb.

Steps applied per page:
  1. TOC detection  — flag TOC pages, collect heading strings
  2. Image extraction — strip ![]() tags, record caption + path in metadata
  3. Markdown cleaning — remove duplicate headers, repeating footers
  4. (LLM table normalisation is handled by llm_table_normalizer.py)

Public API
----------
detect_toc_pages(page_dirs, check_first_n=6)
    -> (toc_page_nums: list[int], toc_headings: list[str])

should_use_toc_nav(toc_headings, all_page_dirs, threshold=0.80) -> bool

extract_images_from_markdown(md_text, page_out_dir)
    -> (cleaned_md: str, image_records: list[dict])

clean_markdown(md_text) -> str

find_md_file(page_dir) -> Path | None
extract_headings_from_md(text) -> list[str]
"""

import re
from collections import Counter
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional


# ── TOC DETECTION ─────────────────────────────────────────────────────────────

_TOC_KEYWORDS = ["table of contents", "contents"]
_TOC_NUMBERING_RE = re.compile(r"^\s*(\d+\.)+\s+\S")


def detect_toc_pages(
    page_dirs: List[Path],
    check_first_n: int = 6,
) -> Tuple[List[int], List[str]]:
    """
    Scan the first `check_first_n` pages for a Table of Contents page.

    A page is flagged as TOC when:
      - It contains a known TOC keyword (case-insensitive), OR
      - >= 3 of the first 20 lines match a numbered-section pattern

    Returns
    -------
    toc_page_nums : 1-indexed page numbers identified as TOC pages
    toc_headings  : heading strings extracted from TOC lines
                    e.g. ["10.1 Cooling System", "10.2 Lubrication"]
    """
    toc_page_nums: List[int] = []
    toc_headings:  List[str] = []

    for page_dir in page_dirs[:check_first_n]:
        page_num = int(page_dir.name.split("_")[1])
        md_file  = find_md_file(page_dir)
        if md_file is None:
            continue

        try:
            text = md_file.read_text(encoding="utf-8")
        except Exception:
            continue

        lower  = text.lower()
        is_toc = any(kw in lower for kw in _TOC_KEYWORDS)

        if not is_toc:
            lines     = text.splitlines()
            toc_count = sum(1 for l in lines[:20] if _TOC_NUMBERING_RE.match(l))
            is_toc    = toc_count >= 3

        if is_toc:
            toc_page_nums.append(page_num)
            for line in text.splitlines():
                line = line.strip()
                # Match "1.2.3 Heading Title ....... 42" or "1. Title"
                m = re.match(r"^((?:\d+\.)+\d*)\s+(.+?)[\s\.]+\d*$", line)
                if m:
                    heading = f"{m.group(1)} {m.group(2).strip()}"
                    toc_headings.append(heading)

    return toc_page_nums, toc_headings


def should_use_toc_nav(
    toc_headings: List[str],
    all_page_dirs: List[Path],
    threshold: float = 0.80,
) -> bool:
    """
    Return True when >= `threshold` fraction of TOC headings appear as
    actual headings in the document body (80% rule).

    Matching is normalised to lowercase stripped text.
    """
    if not toc_headings:
        return False

    body_headings: set = set()
    for page_dir in all_page_dirs:
        md_file = find_md_file(page_dir)
        if md_file is None:
            continue
        try:
            text = md_file.read_text(encoding="utf-8")
        except Exception:
            continue
        for line in text.splitlines():
            m = re.match(r"^#{1,6}\s+(.+)$", line.strip())
            if m:
                body_headings.add(m.group(1).strip().lower())
            m2 = re.match(r"^((?:\d+\.)+\d*)\s+(.+)$", line.strip())
            if m2:
                body_headings.add(
                    f"{m2.group(1)} {m2.group(2).strip()}".lower()
                )

    matched = sum(1 for h in toc_headings if h.strip().lower() in body_headings)
    ratio   = matched / len(toc_headings)

    print(f"   TOC nav check: {matched}/{len(toc_headings)} headings matched "
          f"({ratio:.0%}) — threshold {threshold:.0%}")
    return ratio >= threshold


# ── IMAGE EXTRACTION ──────────────────────────────────────────────────────────

_IMG_TAG_RE = re.compile(r"!\[(?P<caption>[^\]]*)\]\((?P<path>[^)]+)\)")


def extract_images_from_markdown(
    md_text: str,
    page_out_dir: Path,
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Remove all Markdown image tags (![]()) from md_text.

    For each removed tag, record:
        caption  — alt-text / caption from the tag
        src_path — relative path/URL from the tag
        abs_path — resolved absolute path (may not exist)
        exists   — whether the file exists on disk

    Returns (cleaned_md, image_records)
    """
    image_records: List[Dict[str, Any]] = []

    def _replace(m: re.Match) -> str:
        caption  = m.group("caption").strip()
        img_path = m.group("path").strip()
        abs_path = page_out_dir / img_path

        image_records.append({
            "caption":  caption,
            "src_path": img_path,
            "abs_path": str(abs_path),
            "exists":   abs_path.exists(),
        })
        return ""

    cleaned = _IMG_TAG_RE.sub(_replace, md_text)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned, image_records


# ── MARKDOWN CLEANING ─────────────────────────────────────────────────────────

def clean_markdown(md_text: str) -> str:
    """
    Cosmetic cleaning:
      - Remove consecutive duplicate ATX headers
      - Remove lines that appear >= 3 times (page headers/footers)
      - Collapse excessive blank lines to max 2
    """
    lines           = md_text.split("\n")
    cleaned_lines   = []
    previous_header = None

    for line in lines:
        stripped = line.strip()
        hm = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if hm:
            current = (len(hm.group(1)), hm.group(2).strip().lower())
            if current == previous_header:
                continue
            previous_header = current
        cleaned_lines.append(line)

    text        = "\n".join(cleaned_lines)
    all_lines   = text.split("\n")
    line_counts = Counter(
        l.strip() for l in all_lines if l.strip() and len(l.strip()) < 120
    )
    repeating   = {l for l, c in line_counts.items() if c >= 3}
    text        = "\n".join(l for l in all_lines if l.strip() not in repeating)
    text        = re.sub(r"\n{4,}", "\n\n", text)
    return text.strip()


# ── HELPERS ───────────────────────────────────────────────────────────────────

def find_md_file(page_dir: Path) -> Optional[Path]:
    """Return the best markdown file in a Phase 1 OCR page directory."""
    for name in ["general.md", "general0.md", "output.md", "markdown.md"]:
        p = page_dir / name
        if p.exists():
            return p
    candidates = [
        f for f in page_dir.glob("*.md")
        if not f.name.startswith("_tmp")
    ]
    return candidates[0] if candidates else None


def extract_headings_from_md(text: str) -> List[str]:
    """Return all ATX heading strings from markdown text."""
    headings = []
    for line in text.splitlines():
        m = re.match(r"^#{1,6}\s+(.+)$", line.strip())
        if m:
            h = m.group(1).strip()
            if h and h not in headings:
                headings.append(h)
    return headings