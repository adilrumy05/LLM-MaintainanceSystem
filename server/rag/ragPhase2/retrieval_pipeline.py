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
            │  2. Qdrant search │  ← children + tables + images (per-type limits)
            │  3. Agreement hits│  ← dense+sparse agreement survives the merge
            │  4. Type-floor    │  ← top-k children/tables AND top few images
            │     merge         │
            │  5. Section       │  ← add every chunk of the section(s) the question
            │     expansion     │    is about (see section_expansion.py)
            │  6. Parent hydrate│  ← fetch full context for matched children
            │  7. Assemble ctx  │
            └────────┬─────────┘
                     │
              RetrievalResult
          (context_blocks, sources,
           toc_section, raw_hits)
                     │
              [caller's LLM]

Section expansion needs the toc_* payload fields written by
backfill_toc_sections.py. Run that after every ingest / re-embed.

RetrievalResult is a plain dataclass — pass it straight to any prompt builder.

Required env vars
-----------------
    QDRANT_URL              e.g. http://localhost:6333
    QDRANT_API_KEY          optional (local Docker: leave unset)
    MODEL_LOCAL_PATH        path to BAAI/bge-base-en-v1.5 embedder
    DEVICE                  cpu or cuda

Optional env vars
-----------------
    RETRIEVAL_TOP_K            default 5   — child + table hits to fetch
    RETRIEVAL_SCORE_MIN        default 0.0 — minimum cosine similarity
    RETRIEVAL_HYDRATE_PARENTS  true/false  (default true)
    RETRIEVAL_IMAGE_FLOOR      default 4   — extra image hits kept after the merge
    SECTION_MAX_PARENTS        default 3   — sections expanded per document
    SECTION_MAX_PAGES          default 8   — pages kept per section
    SECTION_MAX_CHARS          default 60000 — cap on text added by expansion
    (more in section_expansion.py)

Public API
----------
    pipeline = RetrievalPipeline()

    result = pipeline.retrieve(
        question="What is the cooling capacity?",
        document_group_id="panasonic_aircon_CS-PW24KE",   # optional
        classification="MANUAL",                           # optional
        category_level_1="Air_Conditioner",               # optional
    )

    print(result.context_str)
    print(result.build_prompt(question))

    for block in result.context_blocks:
        print(block.chunk_type, block.score, block.text[:100])
"""

import os

FIREBASE_BUCKET = os.getenv("FIREBASE_BUCKET", "rbacfyp.firebasestorage.app")
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

try:
    from .section_expansion import expand_sections, merge_with_type_floor
except ImportError:
    from section_expansion import expand_sections, merge_with_type_floor

logger = logging.getLogger(__name__)


# ── Result dataclass ──────────────────────────────────────────────────────────

@dataclass
class ContextBlock:
    """One retrieved piece of context (child chunk, table, image, or hydrated parent)."""
    chunk_id:          str
    chunk_type:        str          # "child", "table", "image", "parent"
    score:             float        # cosine similarity (0 for hydrated parents / same-section pages)
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
    toc_section     : section heading of the best hit, if the chunk was tagged
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
        """Assemble a ready-to-send prompt string for any LLM."""
        q = question or self.question
        sp = system_prompt or (
            "You are a helpful technical assistant. "
            "Answer the question using ONLY the context provided below. "
            "If the context does not contain enough information, say so. "
            "Cite page numbers where relevant."
        )

        toc_note = (
            f"\n[Best match is in section: {self.toc_section}]\n"
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

    Embeds the query, searches Qdrant for child + table + image chunks,
    merges them without letting one type crowd out another, adds the rest of
    the section the question is about, hydrates matched children with their
    parent context, and returns a RetrievalResult.
    """

    def __init__(self):
        # Lazy imports so heavy models are only loaded on first retrieve()
        self._embedder      = None
        self._vector_store  = None

        self.top_k           = int(os.getenv("RETRIEVAL_TOP_K", "5"))
        self.score_min       = float(os.getenv("RETRIEVAL_SCORE_MIN", "0.0"))
        self.hydrate_parents = os.getenv("RETRIEVAL_HYDRATE_PARENTS", "true").lower() in ("1", "true", "yes")

        print(
            f"RetrievalPipeline ready:\n"
            f"  top_k={self.top_k}  score_min={self.score_min}"
            f"  hydrate_parents={self.hydrate_parents}"
        )

    # ── Lazy init ─────────────────────────────────────────────────────────────

    def _get_embedder(self):
        if self._embedder is None:
            try:
                from .embedder import Embedder
            except ImportError:
                from embedder import Embedder
            self._embedder = Embedder()
        return self._embedder

    def _get_vs(self):
        if self._vector_store is None:
            try:
                from .vector_store import VectorStore
            except ImportError:
                from vector_store import VectorStore
            self._vector_store = VectorStore()
        return self._vector_store

    # ── Public API ────────────────────────────────────────────────────────────

    def retrieve(
        self,
        question:          str,
        document_group_id: str   = None,
        date_added:        str   = None,
        filename:          str   = None,
        classification:    str   = None,
        category_level_1:  str   = None,
        category_level_2:  str   = None,
        model_number:      str   = None,
        top_k:             int   = None,
        score_min:         float = None,
        chunk_types:       List[str] = None,
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
        model_number      : restrict to one indexed model number
        top_k             : override default RETRIEVAL_TOP_K
        score_min         : override default RETRIEVAL_SCORE_MIN
        chunk_types       : which chunk types to search
                            default ["child", "table", "image"]
        """
        vs        = self._get_vs()
        embedder  = self._get_embedder()
        k         = top_k    or self.top_k
        min_score = score_min if score_min is not None else self.score_min
        types = chunk_types or ["child", "table", "image"]

        # ── 1. Search children + tables + images ──────────────────────────
        raw_hits: List[Dict] = []

        print(f"Retrieving with filters:\n"
            f"  document_group_id={document_group_id}\n"
            f"  filename={filename}\n"
            f"  classification={classification}\n"
            f"  category_level_1={category_level_1}\n"
            f"  category_level_2={category_level_2}\n"
            f"  model_number={model_number}\n"
            f"  date_added={date_added}\n"
            f"  chunk_types={types}\n"
            f"  top_k={k}  score_min={min_score}")

        # Embed the query once and reuse it for all chunk types
        query_vec = embedder.embed_query(question)

        # Per-type limits: image chunks score on a lower scale than children and
        # tables, so give them 3x the candidate headroom before the merge.
        def _per_type_limit(chunk_type: str) -> int:
            return k * 3 if chunk_type == "image" else k

        for chunk_type in types:
            hits = vs.search(
                precomputed_query=query_vec,
                limit=_per_type_limit(chunk_type),
                score_threshold=min_score if min_score > 0 else None,
                document_group_id=document_group_id,
                date_added=date_added,
                filename=filename,
                classification=classification,
                category_level_1=category_level_1,
                category_level_2=category_level_2,
                model_number=model_number,
                chunk_type=chunk_type,
            )
            raw_hits.extend(hits)

        # ── 2. Guarantee dense+sparse agreement survives fusion ───────────
        filters = dict(
            document_group_id=document_group_id, date_added=date_added, filename=filename,
            classification=classification, category_level_1=category_level_1,
            category_level_2=category_level_2, model_number=model_number,
        )
        agreed_hits = self._dense_sparse_agreement_hits(vs, query_vec, types, k, **filters)
        existing_ids = {h["id"] for h in raw_hits}
        for hit in agreed_hits:
            if hit["id"] not in existing_ids:
                raw_hits.append(hit)
                existing_ids.add(hit["id"])
                logger.info(f"Re-added dense+sparse-agreed hit dropped by fusion: {hit['id']}")

        # ── 3. Type-aware merge ───────────────────────────────────────────
        # Top-k children/tables PLUS the top few images. A single sort-and-cap
        # lets children and tables (scored near 1.0) crowd out every image
        # (scored around 0.6) even when the image is the right page.
        raw_hits = merge_with_type_floor(raw_hits, k)

        # ── 4. Section expansion ──────────────────────────────────────────
        # A procedure spans several pages and most never mention the thing the
        # user asked about. Add every chunk of the section(s) the question is
        # about, in page order, with score 0. Needs toc_* payload fields from
        # backfill_toc_sections.py; with none present it falls back to the pages
        # either side of the best hit.
        raw_hits = expand_sections(
            vs, raw_hits, question,
            document_group_id=document_group_id, filename=filename,
        )

        # ── 5. Hydrate with parent context ────────────────────────────────
        context_blocks = self._build_context_blocks(raw_hits, vs)

        # ── 6. Assemble output ────────────────────────────────────────────
        context_str = _format_context(context_blocks)
        sources     = _deduplicate_sources(context_blocks)
        sources     = _enrich_sources_with_images(sources, context_blocks)

        toc_section = next(
            (h["payload"].get("toc_section") for h in raw_hits if h["payload"].get("toc_section")),
            None,
        )

        return RetrievalResult(
            question=question,
            context_blocks=context_blocks,
            context_str=context_str,
            sources=sources,
            toc_section=toc_section,
            raw_hits=raw_hits,
        )

    # ── Dense+sparse agreement ────────────────────────────────────────────────
    def _dense_sparse_agreement_hits(self, vs, query_vec, chunk_types, k, **filters) -> List[Dict]:
        """Chunks ranked in BOTH dense-only and sparse-only top-k for every chunk_type searched."""
        agreed = []
        for chunk_type in chunk_types:
            dense_hits  = vs.search(precomputed_query=query_vec, limit=k, chunk_type=chunk_type, mode="dense",  **filters)
            sparse_hits = vs.search(precomputed_query=query_vec, limit=k, chunk_type=chunk_type, mode="sparse", **filters)
            sparse_ids  = {h["id"] for h in sparse_hits}
            agreed.extend(h for h in dense_hits if h["id"] in sparse_ids)
        return agreed

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
        Tables and image chunks are added as-is. A chunk that appears twice
        (e.g. a hydrated parent that is also a same-section chunk) is kept once.
        """
        blocks:          List[ContextBlock] = []
        seen_parent_ids: set = set()
        seen_ids:        set = set()

        for hit in raw_hits:
            p   = hit["payload"]
            cid = p.get("chunk_id", str(hit["id"]))

            if cid in seen_ids:
                continue
            seen_ids.add(cid)

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
                and block.parent_id not in seen_ids
            ):
                parent_payload = vs.fetch_parent(block.parent_id)
                if parent_payload:
                    seen_parent_ids.add(block.parent_id)
                    seen_ids.add(block.parent_id)
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
    """Format context blocks into a numbered string ready to paste into a prompt."""
    if not blocks:
        return "(no context retrieved)"

    parts = []
    for i, b in enumerate(blocks, 1):
        header = (
            f"[{i}] [{b.chunk_type}] page {b.page}"
            f" — {b.document_group_id} / {b.filename}"
        )
        if b.score > 0:
            score_str = f"score: {b.score:.3f}"
        elif b.chunk_type == "parent":
            score_str = "(context parent)"
        else:
            score_str = "(same section, page order)"
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


def _enrich_sources_with_images(sources: List[Dict], blocks: List[ContextBlock]) -> List[Dict]:
    from collections import defaultdict

    key_to_images = defaultdict(list)
    seen_urls     = defaultdict(set)

    def build_url(abs_path: str, src_path: str) -> Optional[str]:
        """Rebuild a Firebase URL from a path. Only used when 'url' is absent."""
        rel_path = None
        for p in (abs_path, src_path):
            if not p:
                continue
            p = p.replace("\\", "/")
            if p.startswith("output/"):
                rel_path = p
                break
            if "/output/" in p:
                rel_path = "output/" + p.split("/output/")[-1]
                break
        if not rel_path:
            return None
        encoded = rel_path.replace("/", "%2F")
        return (
            f"https://firebasestorage.googleapis.com/v0/b/"
            f"{FIREBASE_BUCKET}/o/{encoded}?alt=media"
        )

    for b in blocks:
        key = (b.document_group_id, b.filename, b.page)
        images = b.metadata.get("images") or []

        if images:
            for img in images:
                # Prefer the ingest-provided URL. Rebuild only as a fallback.
                url = img.get("url") or build_url(
                    img.get("abs_path", ""), img.get("src_path", "")
                )
                if not url:
                    logger.warning(
                        "image entry has no usable url on "
                        f"{b.document_group_id}/{b.filename} p{b.page}: {img!r}"
                    )
                    continue
                if url in seen_urls[key]:
                    continue
                seen_urls[key].add(url)
                key_to_images[key].append({
                    "caption": img.get("caption", ""),
                    "url":     url,
                })
        else:
            page_image_path = b.metadata.get("page_image_path", "")
            if page_image_path and "__page_fallback__" not in seen_urls[key]:
                seen_urls[key].add("__page_fallback__")
                url = build_url(page_image_path, "")
                if url:
                    key_to_images[key].append({
                        "caption": f"Page {b.page}",
                        "url":     url,
                    })

    for src in sources:
        key = (src["document_group_id"], src["filename"], src["page"])
        src["images"] = key_to_images.get(key, [])

    return sources