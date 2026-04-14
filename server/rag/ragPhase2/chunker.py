# chunker.py
"""
Intelligent chunker — semantic parent-child for text, single-chunk for tables.

Strategy
--------
Text pages (processed_content.txt):
    Segmentation — ContentUnits that mix paragraphs and [Row N] table lines
                   are split into interleaved TEXT / TABLE segments first, so
                   table rows are never swallowed into child chunks.

    Parent pass  — Semantic chunking using embedding cosine-similarity to find
                   topic boundaries between sentences. One parent = one coherent
                   topic block. Hard upper bound at PARENT_CHUNK_SIZE chars.

    Child pass   — Fixed-size overlapping windows of CHILD_CHUNK_SIZE chars
                   within each parent. Children are what get embedded/searched.

Table segments:
    Single chunk — the whole [Row N] block is one chunk, never split.
                   Uses chunk_type="table".

Required env vars
-----------------
    PARENT_CHUNK_SIZE             e.g. 1500
    CHILD_CHUNK_SIZE              e.g. 400
    CHILD_OVERLAP                 e.g. 80
    MIN_CHUNK_SIZE                e.g. 50
    SEMANTIC_BOUNDARY_THRESHOLD   e.g. 0.65  (cosine-sim below → new parent)
    EMBEDDING_MODEL               e.g. BAAI/bge-base-en-v1.5
    DEVICE                        e.g. cpu  or  cuda

Public API
----------
    chunker = IntelligentChunker()
    result  = chunker.chunk_content_units(content_units)
    # {
    #     "parent_chunks": [...],   # large context blocks, NOT embedded
    #     "child_chunks":  [...],   # small search units, embedded
    #     "table_chunks":  [...],   # whole table blocks, embedded
    # }
"""

import hashlib
import os
import re
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)


# ── Env helpers ───────────────────────────────────────────────────────────────

def _env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(f"Required env var {name!r} is not set.")
    return val


def _env_int(name: str, default: int = None) -> int:
    val = os.getenv(name)
    if val is None:
        if default is not None:
            return default
        raise RuntimeError(f"Required env var {name!r} is not set.")
    try:
        return int(val)
    except ValueError:
        raise RuntimeError(f"Env var {name} must be an integer, got: {val!r}")


def _env_float(name: str, default: float = None) -> float:
    val = os.getenv(name)
    if val is None:
        if default is not None:
            return default
        raise RuntimeError(f"Required env var {name!r} is not set.")
    try:
        return float(val)
    except ValueError:
        raise RuntimeError(f"Env var {name} must be a float, got: {val!r}")


# ── Optional dependency flags ─────────────────────────────────────────────────

try:
    import nltk
    from nltk.tokenize import sent_tokenize
    _NLTK = True
except ImportError:
    _NLTK = False

try:
    from sentence_transformers import SentenceTransformer
    _ST = True
except ImportError:
    _ST = False


# ── Lightweight ContentUnit ───────────────────────────────────────────────────

@dataclass
class ContentUnit:
    """Minimal representation of one extracted page unit."""
    id:           str
    text:         str
    content_type: str           # "text" or "table"
    page:         int
    source:       str           # path to processed_content.txt
    section_path: List[str]
    metadata:     Dict[str, Any] = field(default_factory=dict)


# ── Intra-unit segmentation ───────────────────────────────────────────────────

@dataclass
class _Segment:
    """
    A pure-text or pure-table slice carved out of one ContentUnit.

    A mixed unit like ``paragraph → [Row N] lines → paragraph`` becomes three
    _Segment objects and each is routed correctly — no table rows swallowed
    into child chunks.
    """
    kind: str           # "text" or "table"
    text: str
    unit: ContentUnit   # parent unit, kept for metadata


_ROW_RE = re.compile(r"^\[Row \d+\]")


def _segment_unit(unit: ContentUnit) -> List[_Segment]:
    """
    Split one ContentUnit into an ordered list of TEXT and TABLE segments.

    Pure units (all text or all table rows) are returned as a single segment.
    Mixed units are split line-by-line into alternating runs.
    """
    lines    = unit.text.splitlines()
    has_rows = any(_ROW_RE.match(l.strip()) for l in lines)

    # Fast-path: explicit type + pure content
    if unit.content_type == "table" and has_rows:
        return [_Segment(kind="table", text=unit.text.strip(), unit=unit)]
    if not has_rows:
        return [_Segment(kind="text", text=unit.text.strip(), unit=unit)]

    # Mixed: accumulate runs
    segments:      List[_Segment] = []
    current_kind:  Optional[str]  = None
    current_lines: List[str]      = []

    def _flush() -> None:
        txt = "\n".join(current_lines).strip()
        if txt:
            segments.append(_Segment(kind=current_kind, text=txt, unit=unit))

    for line in lines:
        kind = "table" if _ROW_RE.match(line.strip()) else "text"
        if kind != current_kind:
            if current_kind is not None:
                _flush()
            current_kind  = kind
            current_lines = [line]
        else:
            current_lines.append(line)

    if current_lines:
        _flush()

    return segments


# ── Sentence splitting ────────────────────────────────────────────────────────

def _split_sentences(text: str) -> List[str]:
    """Sentence-split with NLTK (if available) or simple regex fallback."""
    if _NLTK:
        try:
            nltk.data.find("tokenizers/punkt")
            return [s.strip() for s in sent_tokenize(text) if s.strip()]
        except Exception:
            pass
    # Regex fallback: split on . ! ? followed by whitespace + capital
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
    return [p.strip() for p in parts if p.strip()]


# ── Chunker ───────────────────────────────────────────────────────────────────

class IntelligentChunker:
    """
    Semantic parent-child chunker for text; single-chunk for tables.

    Parameters (all fall back to env vars when omitted)
    ----------
    parent_chunk_size           : int   hard upper bound chars per parent
    child_chunk_size            : int   target chars per child window
    child_overlap               : int   char overlap between children
    min_chunk_size              : int   discard chunks shorter than this
    semantic_boundary_threshold : float cosine-sim below this → new parent
    embedding_model_name        : str   HF model ID for semantic parents
    device                      : str   "cpu" or "cuda"
    """

    def __init__(
        self,
        parent_chunk_size:           int   = None,
        child_chunk_size:            int   = None,
        child_overlap:               int   = None,
        min_chunk_size:              int   = None,
        semantic_boundary_threshold: float = None,
        embedding_model_name:        str   = None,
        device:                      str   = None,
    ):
        self.parent_chunk_size           = parent_chunk_size           or _env_int("PARENT_CHUNK_SIZE", 1500)
        self.child_chunk_size            = child_chunk_size            or _env_int("CHILD_CHUNK_SIZE",  400)
        self.child_overlap               = child_overlap               or _env_int("CHILD_OVERLAP",     80)
        self.min_chunk_size              = min_chunk_size              or _env_int("MIN_CHUNK_SIZE",     50)
        self.semantic_boundary_threshold = (
            semantic_boundary_threshold
            or _env_float("SEMANTIC_BOUNDARY_THRESHOLD", 0.65)
        )
        self.embedding_model_name = embedding_model_name or _env("EMBEDDING_MODEL")
        self.device               = device or os.getenv("DEVICE", "cpu")

        if not 0.0 <= self.semantic_boundary_threshold <= 1.0:
            raise RuntimeError("SEMANTIC_BOUNDARY_THRESHOLD must be between 0 and 1.")

        self._embedding_model: Optional[SentenceTransformer] = None
        self._init_embedding_model()

        print(
            f"IntelligentChunker ready:\n"
            f"  model={self.embedding_model_name}  device={self.device}\n"
            f"  parent={self.parent_chunk_size}  child={self.child_chunk_size}"
            f"  overlap={self.child_overlap}  min={self.min_chunk_size}\n"
            f"  semantic_threshold={self.semantic_boundary_threshold}"
        )

    # ── Embedding model init ──────────────────────────────────────────────────

    def _init_embedding_model(self):
        """Load SentenceTransformer for semantic parent boundary detection."""
        if not _ST:
            raise RuntimeError(
                "sentence-transformers is required for semantic chunking. "
                "Install it with:  pip install sentence-transformers"
            )
        trust = any(
            p in self.embedding_model_name.lower()
            for p in ["jina", "nomic"]
        )
        logger.info(f"Loading chunker embedding model: {self.embedding_model_name}")
        self._embedding_model = SentenceTransformer(
            self.embedding_model_name,
            device=self.device,
            trust_remote_code=trust,
        )
        logger.info("Chunker embedding model loaded.")

    # ── Public entry point ────────────────────────────────────────────────────

    def chunk_content_units(
        self,
        content_units: List[ContentUnit],
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Chunk a list of ContentUnits.

        Step 1 — Intra-unit segmentation
            Each unit → ordered list of pure-text / pure-table _Segment objects.
            Prevents table rows being swallowed into child chunks.

        Step 2 — Tables → fixed single chunks (never split).

        Step 3 — Text segments → semantic parents → fixed-size children.

        Returns
        -------
        {
            "parent_chunks": [...],
            "child_chunks":  [...],
            "table_chunks":  [...],
        }
        """
        if not content_units:
            return {"parent_chunks": [], "child_chunks": [], "table_chunks": []}

        # Step 1: segment every unit into pure-text / pure-table runs
        all_segments: List[_Segment] = []
        for unit in content_units:
            all_segments.extend(_segment_unit(unit))

        text_segs  = [s for s in all_segments if s.kind == "text"]
        table_segs = [s for s in all_segments if s.kind == "table"]

        # Step 2: tables → single chunks
        table_chunks = [
            c for c in (_make_table_chunk(s) for s in table_segs)
            if c is not None
        ]

        # Step 3: text → semantic parents → fixed children
        parent_chunks, child_chunks = self._parent_child(text_segs)

        logger.info(
            f"Chunking done: {len(parent_chunks)} parents, "
            f"{len(child_chunks)} children, {len(table_chunks)} tables"
        )
        return {
            "parent_chunks": parent_chunks,
            "child_chunks":  child_chunks,
            "table_chunks":  table_chunks,
        }

    # ── Parent-child pipeline ─────────────────────────────────────────────────

    def _parent_child(
        self,
        text_segs: List[_Segment],
    ) -> Tuple[List[Dict], List[Dict]]:
        """Two-pass: semantic parents → fixed-size overlapping children."""
        parent_chunks: List[Dict] = []
        child_chunks:  List[Dict] = []

        parents = self._make_parents(text_segs)
        for parent in parents:
            children = self._make_children(parent)
            parent["metadata"]["child_ids"] = [c["id"] for c in children]
            for child in children:
                child["metadata"]["parent_id"] = parent["id"]
            parent_chunks.append(parent)
            child_chunks.extend(children)

        # Deduplicate children by ID (identical text on adjacent pages)
        seen: Set[str] = set()
        unique_children: List[Dict] = []
        for c in child_chunks:
            if c["id"] not in seen:
                seen.add(c["id"])
                unique_children.append(c)

        return parent_chunks, unique_children

    # ── Semantic parent creation ──────────────────────────────────────────────

    def _make_parents(self, text_segs: List[_Segment]) -> List[Dict]:
        """
        Build parent chunks using sentence-embedding cosine-similarity.

        Algorithm
        ---------
        1. Sentence-split every text segment.
        2. Embed all sentences in one batch.
        3. Find pairs where consecutive cosine-similarity < threshold → boundary.
        4. Also hard-split when accumulated chars reach parent_chunk_size.
        5. Materialise each sentence group as a parent chunk dict.
        """
        if not text_segs:
            return []

        # Collect sentences with back-references to their source segment
        sent_records: List[Dict] = []
        for seg in text_segs:
            for sent in _split_sentences(seg.text):
                if sent.strip():
                    sent_records.append({"text": sent.strip(), "seg": seg})

        if not sent_records:
            return []

        # Embed all sentences
        sentences  = [r["text"] for r in sent_records]
        embeddings = self._embed(sentences)          # (N, dim) float32

        # Find semantic boundaries
        boundaries = self._find_boundaries(embeddings)

        # Group sentences into parent blocks
        groups: List[List[Dict]] = []
        current: List[Dict]      = []

        for i, rec in enumerate(sent_records):
            if i in boundaries and current:
                groups.append(current)
                current = []
            current.append(rec)
            # Hard split when accumulated text is already large enough
            if (
                len(" ".join(r["text"] for r in current)) >= self.parent_chunk_size
                and i < len(sent_records) - 1
            ):
                groups.append(current)
                current = []

        if current:
            groups.append(current)

        # Build chunk dicts
        parents: List[Dict] = []
        for group in groups:
            text = " ".join(r["text"] for r in group).strip()
            if len(text) < self.min_chunk_size:
                continue

            rep_seg      = group[0]["seg"]
            source_units = list(
                {id(r["seg"].unit): r["seg"].unit for r in group}.values()
            )

            chunk = _make_text_chunk(
                text=text,
                rep_seg=rep_seg,
                source_units=source_units,
                chunk_type="parent",
                extra_meta={
                    "sentence_count":    len(group),
                    "child_ids":         [],          # filled in later
                    "chunking_strategy": "semantic_parent_child",
                },
            )
            parents.append(chunk)

        return parents

    def _find_boundaries(self, embeddings: np.ndarray) -> Set[int]:
        """
        Return sentence indices where cosine-similarity to the previous
        sentence drops below semantic_boundary_threshold.
        """
        boundaries: Set[int] = set()
        for i in range(1, len(embeddings)):
            a, b = embeddings[i - 1], embeddings[i]
            na, nb = np.linalg.norm(a), np.linalg.norm(b)
            if na == 0 or nb == 0:
                boundaries.add(i)
                continue
            sim = float(np.dot(a, b) / (na * nb))
            if sim < self.semantic_boundary_threshold:
                boundaries.add(i)
        return boundaries

    # ── Fixed-size child creation ─────────────────────────────────────────────

    def _make_children(self, parent: Dict) -> List[Dict]:
        """
        Fixed-size overlapping child chunks within one parent.

        Splits on word boundaries. Overlap carries the tail of the previous
        child into the start of the next.
        """
        text     = parent["text"].strip()
        children: List[Dict] = []

        if len(text) <= self.child_chunk_size:
            children.append(_copy_chunk_as_child(parent))
            return children

        words   = text.split()
        buf:    List[str] = []
        buf_len = 0

        def _flush_child(word_list: List[str]) -> Dict:
            child_text = " ".join(word_list).strip()
            child = dict(parent)
            child["text"] = child_text
            child["id"]   = _chunk_id(child_text, parent["page"], "child")
            child["metadata"] = {
                **parent["metadata"],
                "chunk_type": "child",
                "chunk_size": len(child_text),
                "parent_id":  parent["id"],
            }
            return child

        for word in words:
            wl = len(word) + (1 if buf else 0)
            if buf_len + wl > self.child_chunk_size and buf:
                children.append(_flush_child(buf))
                # Carry overlap words from end of flushed buffer
                overlap_words: List[str] = []
                carried = 0
                for w in reversed(buf):
                    if carried + len(w) + 1 > self.child_overlap:
                        break
                    overlap_words.insert(0, w)
                    carried += len(w) + 1
                buf     = overlap_words + [word]
                buf_len = sum(len(w) + 1 for w in buf)
            else:
                buf.append(word)
                buf_len += wl

        if buf:
            children.append(_flush_child(buf))

        return children

    # ── Embedding ─────────────────────────────────────────────────────────────

    def _embed(self, texts: List[str]) -> np.ndarray:
        """Batch-encode sentences with the loaded SentenceTransformer."""
        return self._embedding_model.encode(
            texts,
            batch_size=32,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        ).astype(np.float32)


# ── Chunk factory helpers (module-level) ──────────────────────────────────────

def _chunk_id(text: str, page: int, chunk_type: str) -> str:
    return hashlib.md5(
        f"{text[:120]}_{page}_{chunk_type}".encode()
    ).hexdigest()[:16]


def _make_text_chunk(
    text:         str,
    rep_seg:      _Segment,
    source_units: List[ContentUnit],
    chunk_type:   str,
    extra_meta:   Dict[str, Any] = None,
) -> Dict[str, Any]:
    """
    Build a chunk dict from a _Segment, preserving all ContentUnit metadata.

    Metadata priority (highest wins):
        1. chunk-specific fields  (chunk_type, chunk_size, …)
        2. extra_meta passed in
        3. rep_seg.unit.metadata  (representative / first unit)
        4. merged metadata from all other source units (first-unit-wins)
    """
    # Merge source unit metadata — first unit overwrites later ones
    merged: Dict[str, Any] = {}
    for unit in reversed(source_units):
        if unit.metadata:
            merged.update(unit.metadata)

    unit = rep_seg.unit
    cid  = _chunk_id(text, unit.page, chunk_type)

    meta = {
        **merged,
        # Chunk-specific fields always win
        "chunk_type":       chunk_type,
        "chunk_size":       len(text),
        "page":             unit.page,
        "unit_id":          unit.id,
        "source_file":      unit.source,
        "section_path":     unit.section_path,
        "source_unit_ids":  [u.id for u in source_units],
    }
    if extra_meta:
        meta.update(extra_meta)

    return {
        "id":       cid,
        "text":     text,
        "page":     unit.page,
        "metadata": meta,
    }


def _copy_chunk_as_child(parent: Dict) -> Dict:
    """Wrap a parent that is already ≤ child_chunk_size as its own child."""
    child = dict(parent)
    child["id"] = _chunk_id(parent["text"], parent["page"], "child")
    child["metadata"] = {
        **parent["metadata"],
        "chunk_type": "child",
        "chunk_size": len(parent["text"]),
        "parent_id":  parent["id"],
    }
    return child


def _make_table_chunk(seg: _Segment) -> Optional[Dict[str, Any]]:
    """
    One chunk per TABLE segment — never split.
    Rows stay intact exactly as html_table_converter emitted them.
    """
    text = seg.text.strip()
    if not text:
        return None

    unit      = seg.unit
    cid       = _chunk_id(text, unit.page, "table")
    row_count = sum(
        1 for line in text.splitlines()
        if _ROW_RE.match(line.strip())
    )

    return {
        "id":   cid,
        "text": text,
        "page": unit.page,
        "metadata": {
            **unit.metadata,
            "chunk_type":        "table",
            "chunk_size":        len(text),
            "page":              unit.page,
            "unit_id":           unit.id,
            "source_file":       unit.source,
            "section_path":      unit.section_path,
            "chunking_strategy": "fixed_table",
            "row_count":         row_count,
        },
    }