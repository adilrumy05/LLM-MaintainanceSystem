# general_content_extractor.py  (Phase 1 LLM Parsing — Colab version)
"""
Write processed_content.txt + metadata.json for each page and
return lightweight ContentUnit objects.

Called per-file by phase1_llm_parsing.ipynb after cleaning and
table normalisation are complete.

Output layout
-------------
content_extraction/{classification}/{document_group_id}/{filename_stem}/
    page_{N}/
        processed_content.txt   ← clean markdown text
        metadata.json           ← full metadata for this page unit
    toc.json                    ← written once per file when a TOC is found
"""

import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional


# ── Lightweight ContentUnit (no app dependency needed in Colab) ───────────────

class ContentUnit:
    __slots__ = ("id", "text", "content_type", "page", "source",
                 "section_path", "metadata")

    def __init__(self, *, id, text, content_type, page,
                 source, section_path, metadata):
        self.id           = id
        self.text         = text
        self.content_type = content_type
        self.page         = page
        self.source       = source
        self.section_path = section_path
        self.metadata     = metadata

    def __repr__(self):
        return f"<ContentUnit id={self.id!r} page={self.page} len={len(self.text)}>"


# ── Extractor ─────────────────────────────────────────────────────────────────

class GeneralContentExtractor:
    """
    Persist one ContentUnit per page to disk.

    Parameters
    ----------
    output_root  : root for content_extraction output
    csv_metadata : full CSV row dict for this file (all columns)
    """

    EXTRACTION_VERSION = "1.1.0"
    PIPELINE_VERSION   = "rag_pipeline_v1.0"

    # All optional CSV columns forwarded to metadata when non-empty
    OPTIONAL_CSV_COLS = [
        "category_level_1", "category_level_2",
        "model_number", "date_added", "notes",
    ]

    def __init__(self, output_root: Path, csv_metadata: dict):
        self.output_root  = Path(output_root)
        self.csv_metadata = csv_metadata

    # ── Public ────────────────────────────────────────────────────────────

    def process_page(
        self,
        *,
        document_group_id: str,
        filename_stem:     str,
        classification:    str,
        page_num:          int,
        ocr_page_dir:      Path,          # Phase 1 OCR output for this page
        cleaned_md:        str,           # text after images removed + cleaning
        image_records:     List[Dict],    # from extract_images_from_markdown()
        table_records:     List[Dict],    # from normalize_tables_in_markdown()
        toc_page_nums:     List[int],
        use_toc_nav:       bool,
        toc_headings:      List[str],
    ) -> Optional[ContentUnit]:
        """
        Write processed_content.txt + metadata.json, return ContentUnit.
        Returns None if cleaned_md is empty.
        """
        is_empty = not cleaned_md.strip()

        if is_empty:
            print(f"    page {page_num}: empty after cleaning")
            cleaned_md = "[EMPTY AFTER CLEANING]"

        # ── Output dir ────────────────────────────────────────────────────
        page_out_dir = (
            self.output_root
            / classification
            / document_group_id
            / filename_stem
            / f"page_{page_num}"
        )
        page_out_dir.mkdir(parents=True, exist_ok=True)

        unit_id  = f"{document_group_id}_{filename_stem}_p{page_num}"
        txt_path = page_out_dir / "processed_content.txt"

        # ── 1. processed_content.txt ──────────────────────────────────────
        txt_path.write_text(
            f"UNIT ID: {unit_id}\n"
            f"DOCUMENT GROUP: {document_group_id}\n"
            f"FILENAME: {filename_stem}\n"
            f"CLASSIFICATION: {classification}\n"
            f"PAGE: {page_num}\n\n"
            f"CONTENT:\n{cleaned_md}\n",
            encoding="utf-8",
        )

        # ── 2. Resolve supporting paths ───────────────────────────────────
        page_png  = ocr_page_dir / "page.png"
        md_source = self._find_md_file(ocr_page_dir)

        # ── 3. Chunking hints ─────────────────────────────────────────────
        headings       = _extract_headings(cleaned_md)
        chunking_hints = {
            "is_table":                  False,
            "preserve_as_parent":        True,
            "split_into_children":       True,
            "suggested_parent_grouping": "page",
            "natural_boundaries":        headings,
        }

        # ── 4. Metadata ───────────────────────────────────────────────────
        metadata = self._build_metadata(
            unit_id=unit_id,
            document_group_id=document_group_id,
            filename_stem=filename_stem,
            classification=classification,
            page_num=page_num,
            txt_path=txt_path,
            md_source=md_source,
            page_png=page_png if page_png.exists() else None,
            cleaned_md=cleaned_md,
            image_records=image_records,
            table_records=table_records,
            toc_page_nums=toc_page_nums,
            use_toc_nav=use_toc_nav,
            toc_headings=toc_headings,
            chunking_hints=chunking_hints,
        )

        # ── 5. metadata.json ──────────────────────────────────────────────
        meta_path = page_out_dir / "metadata.json"
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump(metadata, fh, indent=2, ensure_ascii=False)

        print(
            f"    page {page_num:>4}: "
            f"{len(cleaned_md):>6} chars | "
            f"{len(image_records)} img | "
            f"{len(table_records)} tbl | "
            f"→ page_{page_num}/"
        )

        return ContentUnit(
            id=unit_id,
            text=cleaned_md,
            content_type="text",
            page=page_num,
            source=str(txt_path),
            section_path=[document_group_id, filename_stem, f"Page {page_num}"],
            metadata=metadata,
        )

    def write_toc_json(
        self,
        *,
        document_group_id: str,
        filename_stem:     str,
        classification:    str,
        toc_page_nums:     List[int],
        toc_headings:      List[str],
        use_toc_nav:       bool,
        toc_page_texts:    Dict[int, str],   # {page_num: raw OCR text}
    ) -> Optional[Path]:
        """
        Write toc.json at file level. Raw TOC text is preserved for future
        navigation-layer use even when use_toc_nav is False.
        Returns path written, or None if no TOC detected.
        """
        if not toc_page_nums:
            return None

        file_dir = (
            self.output_root / classification / document_group_id / filename_stem
        )
        file_dir.mkdir(parents=True, exist_ok=True)

        toc_data = {
            "document_group_id": document_group_id,
            "filename":          filename_stem,
            "toc_page_nums":     toc_page_nums,
            "use_toc_nav":       use_toc_nav,
            "toc_headings":      toc_headings,
            # Raw text preserved for future navigation-layer use
            "toc_page_texts": {str(k): v for k, v in toc_page_texts.items()},
        }

        toc_path = file_dir / "toc.json"
        with open(toc_path, "w", encoding="utf-8") as fh:
            json.dump(toc_data, fh, indent=2, ensure_ascii=False)

        print(
            f"   TOC saved: {len(toc_headings)} headings | "
            f"nav_layer={'ENABLED' if use_toc_nav else 'DISABLED (<80% match)'} "
            f"→ toc.json"
        )
        return toc_path

    # ── Private ───────────────────────────────────────────────────────────

    def _build_metadata(
        self, *, unit_id, document_group_id, filename_stem, classification,
        page_num, txt_path, md_source, page_png,
        cleaned_md, image_records, table_records,
        toc_page_nums, use_toc_nav, toc_headings, chunking_hints,
    ) -> Dict[str, Any]:

        meta: Dict[str, Any] = {
            # identity
            "unit_id":           unit_id,
            "document_group_id": document_group_id,
            "filename":          filename_stem,
            "page":              page_num,
            "classification":    classification,

            # file paths
            "file_path":       str(txt_path),
            "md_file_path":    str(md_source) if md_source else "",
            "page_image_path": str(page_png) if page_png else "",

            # content stats
            "text_length":   len(cleaned_md),
            "has_tables":    len(table_records) > 0,
            "has_figures":   len(image_records) > 0,
            "total_tables":  len(table_records),
            "total_figures": len(image_records),

            # image records: caption + path stored, raw HTML dropped
            "images": image_records,

            # table records: raw HTML dropped, normalised text kept
            "tables": [
                {
                    "table_index": r.get("table_index"),
                    "normalised": r.get("normalised", "")
                }
                for r in table_records
            ],

            # TOC navigation layer
            "toc_page_nums": toc_page_nums,
            "use_toc_nav":   use_toc_nav,
            # Headings only stored when nav layer is active
            "toc_headings":  toc_headings if use_toc_nav else [],

            # pipeline provenance
            "content_type":       "text",
            "pipeline_type":      "general",
            "extraction_method":  "phase1_llm_parsing",
            "extraction_version": self.EXTRACTION_VERSION,
            "pipeline_version":   self.PIPELINE_VERSION,
            "needs_chunking":     True,

            # chunking hints
            "chunking_hints": chunking_hints,
        }

        # Inject all CSV optional fields when non-empty
        for col in self.OPTIONAL_CSV_COLS:
            val = self.csv_metadata.get(col)
            if val and str(val).strip():
                meta[col] = str(val).strip()

        return meta

    @staticmethod
    def _find_md_file(page_dir: Path) -> Optional[Path]:
        for name in ["general.md", "general0.md", "output.md", "markdown.md"]:
            p = page_dir / name
            if p.exists():
                return p
        candidates = [f for f in page_dir.glob("*.md") if not f.name.startswith("_tmp")]
        return candidates[0] if candidates else None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_headings(text: str) -> List[str]:
    headings = []
    for line in text.splitlines():
        m = re.match(r"^#{1,6}\s+(.+)$", line.strip())
        if m:
            h = m.group(1).strip()
            if h and h not in headings:
                headings.append(h)
    return headings