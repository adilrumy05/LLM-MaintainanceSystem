# server\rag\ragPhase2\retrieval_pipeline.py
"""
Retrieval pipeline — LLM-agnostic.

The pipeline retrieves relevant chunks from Qdrant and assembles a context
package. Answer generation is intentionally NOT done here — the caller
decides which LLM (local Qwen, OpenAI, Anthropic, etc.) to use.

Architecture
------------
                   query
                     │
            ┌────────▼─────────┐
            │  RetrievalPipeline│
            │                  │
            │  1. Embed query   │
            │  2. Filter build  │
            │  3. Qdrant search │  ← children + tables
            │  4. Parent hydrate│  ← fetch full context for matched children
            │  5. TOC nav layer │  ← optionally restrict to TOC section
            │  6. Assemble ctx  │
            └────────┬─────────┘
                     │
              RetrievalResult
          (context_blocks, sources,
           toc_section, raw_hits)
                     │
              [caller's LLM]

RetrievalResult is a plain dataclass — pass it straight to any prompt builder.

LLM Integration
---------------
The pipeline does NOT call any LLM. Pass RetrievalResult.context_str to your
LLM of choice:

    # OpenAI / compatible API
    import openai
    client = openai.OpenAI(api_key=os.getenv("LLM_API_KEY"),
                           base_url=os.getenv("LLM_BASE_URL"))  # optional for proxies
    resp = client.chat.completions.create(
        model=os.getenv("LLM_MODEL", "gpt-4o-mini"),
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": result.build_prompt(question)},
        ]
    )
    answer = resp.choices[0].message.content

    # Local Qwen / HuggingFace
    inputs  = tokenizer(result.build_prompt(question), return_tensors="pt")
    outputs = model.generate(**inputs, max_new_tokens=512)
    answer  = tokenizer.decode(outputs[0], skip_special_tokens=True)

    # Anthropic
    import anthropic
    client = anthropic.Anthropic(api_key=os.getenv("LLM_API_KEY"))
    msg = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": result.build_prompt(question)}],
    )
    answer = msg.content[0].text

Required env vars
-----------------
    QDRANT_URL              e.g. http://localhost:6333
    QDRANT_API_KEY          optional (local Docker: leave unset)
    MODEL_LOCAL_PATH        path to BAAI/bge-base-en-v1.5 embedder
    DEVICE                  cpu or cuda

Optional env vars
-----------------
    RETRIEVAL_TOP_K         default 5  — child + table hits to fetch
    RETRIEVAL_SCORE_MIN     default 0.0 — minimum cosine similarity
    RETRIEVAL_HYDRATE_PARENTS  true/false  (default true)
                               fetch parent text for every matched child
    LLM_API_KEY             API key forwarded to caller (not used here)
    LLM_MODEL               LLM model name forwarded to caller (not used here)
    LLM_BASE_URL            Custom base URL for OpenAI-compatible proxies

Public API
----------
    pipeline = RetrievalPipeline()

    result = pipeline.retrieve(
        question="What is the cooling capacity?",
        document_group_id="panasonic_aircon_CS-PW24KE",   # optional
        classification="MANUAL",                           # optional
        category_level_1="Air_Conditioner",               # optional
    )

    print(result.context_str)          # ready-to-paste context block
    print(result.build_prompt(question))  # full prompt string

    for block in result.context_blocks:
        print(block["chunk_type"], block["score"], block["text"][:100])
"""

import os
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Env helpers ───────────────────────────────────────────────────────────────

def _env_int(name: str, default: int) -> int:
    val = os.getenv(name)
    if val is None:
        return default
    try:
        return int(val)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    val = os.getenv(name)
    if val is None:
        return default
    try:
        return float(val)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    val = os.getenv(name, "").lower()
    if val in ("1", "true", "yes"):
        return True
    if val in ("0", "false", "no"):
        return False
    return default


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class ContextBlock:
    """One retrieved piece of context (child chunk, table, or hydrated parent)."""
    chunk_id:          str
    chunk_type:        str          # "child", "table", "parent"
    score:             float        # cosine similarity (0 for hydrated parents)
    text:              str
    page:              int
    document_group_id: str
    filename:          str
    classification:    str
    source_file:       str
    parent_id:         str          # empty for tables / parents themselves
    metadata:          Dict[str, Any] = field(default_factory=dict)


@dataclass
class RetrievalResult:
    """
    Complete retrieval output — LLM-ready.

    Attributes
    ----------
    question        : original query
    context_blocks  : ordered list of ContextBlock objects
    context_str     : pre-formatted context string (numbered blocks)
    sources         : deduplicated list of (document_group_id, filename, page)
    toc_section     : TOC heading matched to the query, if TOC nav active
    raw_hits        : raw Qdrant hit dicts for debugging
    """
    question:       str
    context_blocks: List[ContextBlock]
    context_str:    str
    sources:        List[Dict[str, Any]]
    toc_section:    Optional[str]
    raw_hits:       List[Dict[str, Any]]

    def build_prompt(
        self,
        question:      str = None,
        system_prompt: str = None,
    ) -> str:
        """
        Assemble a ready-to-send prompt string.

        Parameters
        ----------
        question      : overrides self.question if supplied
        system_prompt : custom system instruction; uses a sensible default

        Returns
        -------
        str  — formatted prompt for any LLM
        """
        q = question or self.question
        sp = system_prompt or (
            "You are a helpful technical assistant. "
            "Answer the question using ONLY the context provided below. "
            "If the context does not contain enough information, say so. "
            "Cite page numbers where relevant."
        )

        toc_note = (
            f"\n[TOC section matched: {self.toc_section}]\n"
            if self.toc_section else ""
        )

        return (
            f"{sp}\n\n"
            f"=== CONTEXT ==={toc_note}\n"
            f"{self.context_str}\n"
            f"=== QUESTION ===\n"
            f"{q}\n\n"
            f"=== ANSWER ==="
        )


# ── Pipeline ──────────────────────────────────────────────────────────────────

class RetrievalPipeline:
    """
    LLM-agnostic retrieval pipeline.

    Embeds the query, searches Qdrant for child + table chunks, optionally
    hydrates matched children with their parent context, applies TOC nav
    filtering when available, and returns a RetrievalResult.
    """

    def __init__(self):
        # Lazy imports so heavy models are only loaded on first retrieve()
        self._embedder      = None
        self._vector_store  = None

        self.top_k            = _env_int("RETRIEVAL_TOP_K",   5)
        self.score_min        = _env_float("RETRIEVAL_SCORE_MIN", 0.0)
        self.hydrate_parents  = _env_bool("RETRIEVAL_HYDRATE_PARENTS", True)

        print(
            f"RetrievalPipeline ready:\n"
            f"  top_k={self.top_k}  score_min={self.score_min}"
            f"  hydrate_parents={self.hydrate_parents}"
        )

    # ── Lazy init ─────────────────────────────────────────────────────────────

    def _get_embedder(self):
        if self._embedder is None:
            from .embedder import Embedder
            self._embedder = Embedder()
        return self._embedder

    def _get_vs(self):
        if self._vector_store is None:
            from .vector_store import VectorStore
            self._vector_store = VectorStore()
        return self._vector_store

    # ── Public API ────────────────────────────────────────────────────────────

    def retrieve(
        self,
        question:          str,
        document_group_id: str   = None,
        filename:          str   = None,
        classification:    str   = None,
        category_level_1:  str   = None,
        category_level_2:  str   = None,
        top_k:             int   = None,
        score_min:         float = None,
        chunk_types:       List[str] = None,  # default: ["child", "table"]
    ) -> RetrievalResult:
        """
        Retrieve context for a question.

        Parameters
        ----------
        question          : user query
        document_group_id : restrict to one document group
        filename          : restrict to one PDF filename stem
        classification    : e.g. "MANUAL"
        category_level_1  : e.g. "Air_Conditioner"
        category_level_2  : optional sub-category
        top_k             : override default RETRIEVAL_TOP_K
        score_min         : override default RETRIEVAL_SCORE_MIN
        chunk_types       : which chunk types to search
                            default ["child", "table"]

        Returns
        -------
        RetrievalResult
        """
        vs        = self._get_vs()
        embedder  = self._get_embedder()
        k         = top_k    or self.top_k
        min_score = score_min if score_min is not None else self.score_min
        types     = chunk_types or ["child", "table"]

        # ── 1. TOC nav check ──────────────────────────────────────────────
        toc_section = self._toc_section_for_query(
            question, vs, document_group_id, classification
        )

        # ── 2. Search children + tables ───────────────────────────────────
        raw_hits: List[Dict] = []

        print(f"Retrieving with filters:\n"
            f"  document_group_id={document_group_id}\n"
            f"  filename={filename}\n"
            f"  classification={classification}\n"
            f"  category_level_1={category_level_1}\n"
            f"  category_level_2={category_level_2}\n"
            f"  chunk_types={types}\n"
            f"  top_k={k}  score_min={min_score}")

        for chunk_type in types:
            hits = vs.search(
                query=question,
                embedder=embedder,
                limit=k,
                score_threshold=min_score if min_score > 0 else None,
                document_group_id=document_group_id,
                filename=filename,
                classification=classification,
                category_level_1=category_level_1,
                category_level_2=category_level_2,
                chunk_type=chunk_type,
            )
            raw_hits.extend(hits)

        # Sort by score descending and cap at top_k total
        raw_hits.sort(key=lambda h: h["score"], reverse=True)
        raw_hits = raw_hits[:k]

        # ── 3. TOC section filtering ──────────────────────────────────────
        if toc_section:
            raw_hits = self._filter_by_toc_section(raw_hits, toc_section)

        # ── 4. Hydrate with parent context ────────────────────────────────
        context_blocks = self._build_context_blocks(raw_hits, vs)

        # ── 5. Assemble output ────────────────────────────────────────────
        context_str = _format_context(context_blocks)
        sources     = _deduplicate_sources(context_blocks)

        return RetrievalResult(
            question=question,
            context_blocks=context_blocks,
            context_str=context_str,
            sources=sources,
            toc_section=toc_section,
            raw_hits=raw_hits,
        )

    # ── TOC nav layer ─────────────────────────────────────────────────────────

    def _toc_section_for_query(
        self,
        question:          str,
        vs,
        document_group_id: Optional[str],
        classification:    Optional[str],
    ) -> Optional[str]:
        """
        If any document in scope has use_toc_nav=True, search the toc_headings
        payload field for the best matching section heading.

        Strategy: retrieve one point that has use_toc_nav=True and toc_headings
        populated, then pick the heading with the highest word-overlap to the
        question (simple but fast; no extra embedding call).

        Returns the matched heading string, or None.
        """
        try:
            from qdrant_client.models import Filter, FieldCondition, MatchValue

            conditions = [
                FieldCondition(key="use_toc_nav", match=MatchValue(value=True))
            ]
            if document_group_id:
                conditions.append(
                    FieldCondition(
                        key="document_group_id",
                        match=MatchValue(value=document_group_id)
                    )
                )
            if classification:
                conditions.append(
                    FieldCondition(
                        key="classification",
                        match=MatchValue(value=classification)
                    )
                )

            scroll_result, _ = vs.client.scroll(
                collection_name=vs.collection,
                scroll_filter=Filter(must=conditions),
                limit=1,
                with_payload=["toc_headings"],
                with_vectors=False,
            )

            if not scroll_result:
                return None

            toc_headings = scroll_result[0].payload.get("toc_headings", [])
            if not toc_headings:
                return None

            # Word-overlap match between question and each heading
            q_words = set(question.lower().split())
            best_heading  = None
            best_overlap  = 0

            for heading in toc_headings:
                h_words = set(heading.lower().split())
                overlap = len(q_words & h_words)
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_heading = heading

            return best_heading if best_overlap > 0 else None

        except Exception as e:
            logger.debug(f"TOC nav check failed (non-fatal): {e}")
            return None

    def _filter_by_toc_section(
        self,
        hits:        List[Dict],
        toc_section: str,
    ) -> List[Dict]:
        """
        Prefer hits whose text contains words from the matched TOC section.
        Falls back to all hits if filtering would leave nothing.
        """
        section_words = set(toc_section.lower().split())
        filtered = [
            h for h in hits
            if section_words & set(h["payload"].get("text", "").lower().split())
        ]
        return filtered if filtered else hits

    # ── Context block assembly ────────────────────────────────────────────────

    def _build_context_blocks(
        self,
        raw_hits: List[Dict],
        vs,
    ) -> List[ContextBlock]:
        """
        Convert raw Qdrant hits to ContextBlock objects.

        For child chunks: optionally prepend the parent's full text as an
        additional ContextBlock (chunk_type="parent", score=0) before the child.
        Tables are added as-is.
        """
        blocks:        List[ContextBlock] = []
        seen_parent_ids: set = set()

        for hit in raw_hits:
            p   = hit["payload"]
            cid = p.get("chunk_id", str(hit["id"]))

            block = ContextBlock(
                chunk_id=cid,
                chunk_type=p.get("chunk_type", "child"),
                score=hit["score"],
                text=p.get("text", ""),
                page=p.get("page", 0),
                document_group_id=p.get("document_group_id", ""),
                filename=p.get("filename", ""),
                classification=p.get("classification", ""),
                source_file=p.get("file_path", p.get("source_file", "")),
                parent_id=p.get("parent_id", ""),
                metadata=p,
            )

            # Hydrate parent if requested
            if (
                self.hydrate_parents
                and block.chunk_type == "child"
                and block.parent_id
                and block.parent_id not in seen_parent_ids
            ):
                parent_payload = vs.fetch_parent(block.parent_id)
                if parent_payload:
                    seen_parent_ids.add(block.parent_id)
                    parent_block = ContextBlock(
                        chunk_id=block.parent_id,
                        chunk_type="parent",
                        score=0.0,
                        text=parent_payload.get("text", ""),
                        page=parent_payload.get("page", block.page),
                        document_group_id=parent_payload.get(
                            "document_group_id", block.document_group_id
                        ),
                        filename=parent_payload.get("filename", block.filename),
                        classification=parent_payload.get(
                            "classification", block.classification
                        ),
                        source_file=parent_payload.get("file_path", ""),
                        parent_id="",
                        metadata=parent_payload,
                    )
                    blocks.append(parent_block)

            blocks.append(block)

        return blocks

    # ── Convenience wrappers ──────────────────────────────────────────────────

    def retrieve_for_document_group(
        self,
        question:          str,
        document_group_id: str,
        **kwargs,
    ) -> RetrievalResult:
        """Shorthand: search within one document group only."""
        return self.retrieve(
            question=question,
            document_group_id=document_group_id,
            **kwargs,
        )

    def retrieve_all(self, question: str, **kwargs) -> RetrievalResult:
        """Shorthand: search across all document groups."""
        return self.retrieve(question=question, **kwargs)

    def list_document_groups(self) -> List[str]:
        """Return all indexed document_group_id values."""
        return self._get_vs().list_document_groups()

    def collection_stats(self) -> Dict[str, Any]:
        """Return basic Qdrant collection stats."""
        return self._get_vs().collection_stats()


# ── Formatting helpers ────────────────────────────────────────────────────────

def _format_context(blocks: List[ContextBlock]) -> str:
    """
    Format context blocks into a numbered string ready to paste into a prompt.

    Layout per block:
        [1] [child] page 12 — panasonic_aircon_CS-PW24KE / CS-PW24KE_service_...
        score: 0.842
        <text>
        ---
    """
    if not blocks:
        return "(no context retrieved)"

    parts = []
    for i, b in enumerate(blocks, 1):
        header = (
            f"[{i}] [{b.chunk_type}] page {b.page}"
            f" — {b.document_group_id} / {b.filename}"
        )
        score_str = f"score: {b.score:.3f}" if b.score > 0 else "(context parent)"
        parts.append(f"{header}\n{score_str}\n{b.text}\n---")

    return "\n\n".join(parts)


def _deduplicate_sources(blocks: List[ContextBlock]) -> List[Dict[str, Any]]:
    """Return unique (document_group_id, filename, page) triples."""
    seen: set = set()
    sources   = []
    for b in blocks:
        key = (b.document_group_id, b.filename, b.page)
        if key not in seen:
            seen.add(key)
            sources.append({
                "document_group_id": b.document_group_id,
                "filename":          b.filename,
                "page":              b.page,
                "classification":    b.classification,
            })
    return sources