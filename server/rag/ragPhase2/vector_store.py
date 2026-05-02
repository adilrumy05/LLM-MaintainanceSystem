# vector_store.py
"""
Qdrant vector store — single collection, Qdrant 1.16.3.

Collection
----------
    text_chunks_general
        Stores text children, table chunks, and parent chunk payloads (no vector).
        All chunks are namespaced by document_group_id so every document group
        within the collection is independently filterable.

Document identity
-----------------
    document_group_id  — comes directly from the CSV (e.g. "panasonic_aircon_CS-PW24KE")
    filename           — the PDF stem (e.g. "CS-PW24KE_service_manual_…")
    All files under the same document_group_id share the same group.

Required env vars
-----------------
    QDRANT_URL     e.g. http://localhost:6333   (default: http://localhost:6333)
    QDRANT_API_KEY optional; omit for local Docker

Public API
----------
    vs = VectorStore()
    vs.ensure_collection(embedding_dim=768)
    vs.upsert_chunks(embedded_child_chunks)
    vs.upsert_chunks(table_chunks)
    vs.upsert_parent_payloads(parent_chunks)   # payload-only, no vector
    results = vs.search("query text", embedder, limit=5)
"""

import hashlib
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

COLLECTION_NAME = "text_chunks_general"

# Payload fields we want indexed for fast filtering
_KEYWORD_INDEXES = [
    "document_group_id",
    "filename",
    "classification",
    "category_level_1",
    "category_level_2",
    "model_number",
    "chunk_type",
    "content_type",
]
_INTEGER_INDEXES = ["page"]


class VectorStore:
    """
    Thin wrapper around Qdrant for the RAG pipeline.

    All chunks (text children + tables) are upserted into one collection.
    Parent chunks are stored as payload-only points (zero vector) so the
    retrieval layer can hydrate full context without a second DB.
    """

    def __init__(
        self,
        url:     str = None,
        api_key: str = None,
    ):
        from qdrant_client import QdrantClient

        self.url     = url     or os.getenv("QDRANT_URL",     "http://localhost:6333")
        self.api_key = api_key or os.getenv("QDRANT_API_KEY", None)
        self.collection = COLLECTION_NAME

        self.client = QdrantClient(
            url=self.url,
            api_key=self.api_key or None,
            timeout=60,
        )
        print(f"VectorStore connected: {self.url}  collection={self.collection}")

    # ── Collection management ─────────────────────────────────────────────────

    def ensure_collection(self, embedding_dim: int = 768):
        """
        Create the collection if it does not exist.
        If it exists but has the wrong vector size, recreate it (data loss warning).
        Then ensure all payload indexes exist.

        Qdrant 1.16 API: uses client.collection_exists() and client.create_collection().
        """
        from qdrant_client.models import (
            VectorParams, Distance, PayloadSchemaType
        )

        try:
            self.client.get_collection(self.collection)
            exists = True
        except Exception:
            exists = False

        if exists:
            info     = self.client.get_collection(self.collection)
            existing = info.config.params.vectors.size
            if existing != embedding_dim:
                logger.warning(
                    f"Collection '{self.collection}' has dim={existing}, "
                    f"expected {embedding_dim}. Recreating — all data will be lost."
                )
                self.client.delete_collection(self.collection)
                exists = False
            else:
                print(f"Collection '{self.collection}' already exists (dim={existing}) ✓")

        if not exists:
            self.client.create_collection(
                collection_name=self.collection,
                vectors_config=VectorParams(
                    size=embedding_dim,
                    distance=Distance.COSINE,
                ),
            )
            print(f"Created collection '{self.collection}' (dim={embedding_dim})")

        self._ensure_indexes()

    def _ensure_indexes(self):
        """Create payload field indexes for commonly filtered fields."""
        from qdrant_client.models import PayloadSchemaType

        for field in _KEYWORD_INDEXES:
            try:
                self.client.create_payload_index(
                    collection_name=self.collection,
                    field_name=field,
                    field_schema=PayloadSchemaType.KEYWORD,
                )
            except Exception:
                pass  # Already exists

        for field in _INTEGER_INDEXES:
            try:
                self.client.create_payload_index(
                    collection_name=self.collection,
                    field_name=field,
                    field_schema=PayloadSchemaType.INTEGER,
                )
            except Exception:
                pass

    # ── Upsert — embedded chunks (children + tables) ─────────────────────────

    def upsert_chunks(
        self,
        chunks: List[Dict[str, Any]],
        batch_size: int = 100,
    ) -> int:
        """
        Upsert child or table chunks that have an "embedding" field.

        Each chunk's metadata is flattened into the Qdrant payload so every
        searchable/filterable field is at the top level.

        Returns the number of points upserted.
        """
        from qdrant_client.models import PointStruct

        if not chunks:
            return 0

        points = []
        skipped = 0

        for chunk in chunks:
            embedding = chunk.get("embedding")
            if not embedding:
                skipped += 1
                continue

            payload = _build_payload(chunk)
            pid     = _point_id(chunk["id"])

            points.append(PointStruct(
                id=pid,
                vector=embedding,
                payload=payload,
            ))

        if skipped:
            logger.warning(f"Skipped {skipped} chunks without embeddings")

        stored = _batch_upsert(self.client, self.collection, points, batch_size)
        print(f"Upserted {stored} chunk(s) into '{self.collection}'")
        return stored

    # ── Upsert — parent payloads (no vector) ─────────────────────────────────

    def upsert_parent_payloads(
        self,
        parent_chunks: List[Dict[str, Any]],
        embedding_dim: int = 768,
        batch_size: int = 100,
    ) -> int:
        """
        Store parent chunks as payload-only points (zero vector).

        They are retrievable by ID (child.metadata.parent_id) so the
        retrieval layer can hydrate full context for any matched child.

        Parameters
        ----------
        embedding_dim : must match the collection's vector size
        """
        from qdrant_client.models import PointStruct

        if not parent_chunks:
            return 0

        zero_vec = [0.0] * embedding_dim
        points   = []

        for chunk in parent_chunks:
            payload = _build_payload(chunk)
            payload["is_parent_store"] = True
            pid = _point_id(chunk["id"])
            points.append(PointStruct(
                id=pid,
                vector=zero_vec,
                payload=payload,
            ))

        stored = _batch_upsert(self.client, self.collection, points, batch_size)
        print(f"Upserted {stored} parent payload(s) into '{self.collection}'")
        return stored

    # ── Search ────────────────────────────────────────────────────────────────

    def search(
        self,
        query:                   str,
        embedder,                         # Embedder instance
        limit:                   int      = 5,
        score_threshold:         float    = None,
        document_group_id:       str      = None,
        filename:                str      = None,
        classification:          str      = None,
        category_level_1:        str      = None,
        category_level_2:        str      = None,
        chunk_type:              str      = None,   # "child", "table"
        page:                    int      = None,
        model_number: str = None,
    ) -> List[Dict[str, Any]]:
        """
        Embed query and return top-k results with optional filters.

        All filters are AND-combined.

        Returns
        -------
        List of dicts: {id, score, payload}
        """
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        query_vec = embedder.embed_query(query).tolist()

        conditions = []
        _kw = lambda key, val: conditions.append(
            FieldCondition(key=key, match=MatchValue(value=val))
        )

        if document_group_id: _kw("document_group_id", document_group_id)
        if filename:          _kw("filename",          filename)
        if classification:    _kw("classification",    classification)
        if category_level_1:  _kw("category_level_1",  category_level_1)
        if category_level_2:  _kw("category_level_2",  category_level_2)
        if chunk_type:        _kw("chunk_type",        chunk_type)
        if page is not None:
            conditions.append(
                FieldCondition(key="page", match=MatchValue(value=page))
            )
        if model_number:      _kw("model_number",      model_number)

        query_filter = Filter(must=conditions) if conditions else None

        kwargs: Dict[str, Any] = {}
        if score_threshold is not None:
            kwargs["score_threshold"] = score_threshold

        # Qdrant Python client >= 1.x: client.search() removed -> query_points()
        response = self.client.query_points(
            collection_name=self.collection,
            query=query_vec,
            query_filter=query_filter,
            limit=limit,
            with_payload=True,
            with_vectors=False,
            **kwargs,
        )

        # query_points returns QueryResponse; .points is the list of ScoredPoint
        return [
            {"id": r.id, "score": r.score, "payload": r.payload or {}}
            for r in response.points
        ]
    
    def get_known_filters(self):
        seen_groups = set()
        seen_files = set()
        seen_classifications = set()
        seen_cat1 = set()
        seen_cat2 = set()
        seen_models = set()
        offset = None

        while True:
            result = self.client.scroll(
                collection_name=self.collection,
                limit=1000,
                offset=offset,
                with_payload=[
                    "document_group_id",
                    "filename",
                    "classification",
                    "category_level_1",
                    "category_level_2",
                    "model_number"
                ],
                with_vectors=False,
            )

            if isinstance(result, tuple):
                batch, offset = result
            else:
                batch = result.points
                offset = result.next_page_offset

            for p in batch:
                payload = p.payload or {}
                if payload.get("document_group_id"):
                    seen_groups.add(payload["document_group_id"])
                if payload.get("filename"):
                    seen_files.add(payload["filename"])
                if payload.get("classification"):
                    seen_classifications.add(payload["classification"])
                if payload.get("category_level_1"):
                    seen_cat1.add(payload["category_level_1"])
                if payload.get("category_level_2"):
                    seen_cat2.add(payload["category_level_2"])
                if payload.get("model_number"):
                    seen_models.add(payload["model_number"])

            if not offset:
                break

        return {
            "document_group_ids": sorted(seen_groups),
            "filenames": sorted(seen_files),
            "classifications": sorted(seen_classifications),
            "category_level_1": sorted(seen_cat1),
            "category_level_2": sorted(seen_cat2),
            "model_numbers": sorted(seen_models),
        }
    
    def extract_filters(query: str, known_groups=None, known_files=None):
        known_groups = known_groups or []
        known_files = known_files or []

        q = query.lower()
        matched_group = None
        matched_file = None

        for g in known_groups:
            if g.lower() in q:
                matched_group = g
                logger.info(f"✅ Matched document_group_id: {matched_group}")
                break

        for f in known_files:
            if f.lower() in q:
                matched_file = f
                logger.info(f"📄 Matched filename: {matched_file}")
                break

        if not matched_group and not matched_file:
            logger.info("⚠️ No filters matched in query")

        return {"matched_group": matched_group, "matched_file": matched_file}

    def fetch_parent(self, parent_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a parent chunk's full payload by its chunk ID string.

        Returns the payload dict, or None if not found.
        """
        pid = _point_id(parent_id)
        try:
            result = self.client.retrieve(
                collection_name=self.collection,
                ids=[pid],
                with_payload=True,
                with_vectors=False,
            )
            if result:
                return result[0].payload
        except Exception as e:
            logger.warning(f"fetch_parent({parent_id}): {e}")
        return None

    # ── Inspection helpers ────────────────────────────────────────────────────

    def collection_stats(self) -> Dict[str, Any]:
        """Return basic stats about the collection (Qdrant 1.x compatible)."""
        info = self.client.get_collection(self.collection)
        # points_count / indexed_vectors_count / status are stable across versions.
        # vectors_count was removed in newer clients; use indexed_vectors_count instead.
        points  = getattr(info, "points_count",          0) or 0
        vectors = getattr(info, "indexed_vectors_count",  None)
        if vectors is None:
            vectors = getattr(info, "vectors_count", 0) or 0
        segs = 0
        if hasattr(info, "segments_count"):
            segs = info.segments_count or 0
        elif hasattr(info, "segments") and info.segments:
            segs = len(info.segments)
        return {
            "points_count":   points,
            "vectors_count":  vectors,
            "status":         str(info.status),
            "segments_count": segs,
        }

    def list_document_groups(self) -> List[str]:
        """
        Return a sorted list of unique document_group_id values in the collection.
        Uses facet scroll — works for small-to-medium collections.
        """
        seen: set = set()
        offset = None

        while True:
            # Qdrant client >= 1.x: scroll() returns ScrollResult with .points and .next_page_offset
            result = self.client.scroll(
                collection_name=self.collection,
                limit=1000,
                offset=offset,
                with_payload=["document_group_id"],
                with_vectors=False,
            )
            # Handle both tuple (old) and ScrollResult (new) return types
            if isinstance(result, tuple):
                batch, offset = result
            else:
                batch  = result.points
                offset = result.next_page_offset

            for point in batch:
                gid = (point.payload or {}).get("document_group_id")
                if gid:
                    seen.add(gid)
            if not offset:
                break

        return sorted(seen)

    def delete_document_group(self, document_group_id: str) -> int:
        """
        Delete all points whose document_group_id matches.

        Returns the number of points deleted (approximate — Qdrant does not
        always return exact counts from delete operations).
        """
        from qdrant_client.models import Filter, FieldCondition, MatchValue

        result = self.client.delete(
            collection_name=self.collection,
            points_filter=Filter(
                must=[FieldCondition(
                    key="document_group_id",
                    match=MatchValue(value=document_group_id),
                )]
            ),
        )
        logger.info(f"Deleted document_group_id='{document_group_id}': {result}")
        return 0  # Qdrant delete returns operation info, not count


# ── Payload builder ───────────────────────────────────────────────────────────

def _build_payload(chunk: Dict[str, Any]) -> Dict[str, Any]:
    """
    Flatten chunk + chunk.metadata into a single Qdrant payload dict.

    Metadata keys are promoted to top level so Qdrant indexes them directly.
    Qdrant payload values must be str / int / float / bool / list / dict.
    """
    meta = chunk.get("metadata", {})

    payload: Dict[str, Any] = {
        # ── Core chunk identity ───────────────────────────────────────────
        "chunk_id":   chunk.get("id", ""),
        "chunk_type": meta.get("chunk_type", "child"),
        "text":       chunk.get("text", ""),
        "page":       chunk.get("page", 0),

        # ── Document identity ─────────────────────────────────────────────
        "document_group_id": meta.get("document_group_id", ""),
        "filename":          meta.get("filename",          ""),
        "unit_id":           meta.get("unit_id",           ""),

        # ── Classification & categories ───────────────────────────────────
        "classification":  meta.get("classification",  ""),
        "category_level_1": meta.get("category_level_1", ""),
        "category_level_2": meta.get("category_level_2", ""),
        "model_number":    meta.get("model_number",    ""),
        "date_added":      meta.get("date_added",      ""),
        "notes":           meta.get("notes",           ""),

        # ── Content stats ─────────────────────────────────────────────────
        "chunk_size":    meta.get("chunk_size",    len(chunk.get("text", ""))),
        "has_tables":    meta.get("has_tables",    False),
        "has_figures":   meta.get("has_figures",   False),
        "total_tables":  meta.get("total_tables",  0),
        "total_figures": meta.get("total_figures", 0),

        # ── Images & tables from extraction ──────────────────────────────
        "images": _safe_list(meta.get("images",  [])),
        "tables": _safe_list(meta.get("tables",  [])),

        # ── TOC nav layer ─────────────────────────────────────────────────
        "toc_page_nums": _safe_list(meta.get("toc_page_nums", [])),
        "use_toc_nav":   meta.get("use_toc_nav",  False),
        "toc_headings":  _safe_list(meta.get("toc_headings",  [])),

        # ── Parent-child links ────────────────────────────────────────────
        "parent_id":  meta.get("parent_id",  ""),
        "child_ids":  _safe_list(meta.get("child_ids", [])),

        # ── Table-specific ────────────────────────────────────────────────
        "row_count": meta.get("row_count", 0),

        # ── File paths (useful for UI / re-reading source) ────────────────
        "file_path":       meta.get("file_path",       ""),
        "page_image_path": meta.get("page_image_path", ""),

        # ── Pipeline provenance ───────────────────────────────────────────
        "content_type":       meta.get("content_type",       "text"),
        "pipeline_type":      meta.get("pipeline_type",      "general"),
        "extraction_method":  meta.get("extraction_method",  ""),
        "extraction_version": meta.get("extraction_version", ""),
        "pipeline_version":   meta.get("pipeline_version",   ""),
        "chunking_strategy":  meta.get("chunking_strategy",  ""),

        # ── Embedding provenance ──────────────────────────────────────────
        "embedding_model":   meta.get("embedding_model",   ""),
        "embedding_dim":     meta.get("embedding_dim",     0),
        "embedding_backend": meta.get("embedding_backend", ""),

        # ── Ingestion timestamp ───────────────────────────────────────────
        "ingested_at": datetime.now().isoformat(),
    }

    # Sanitise: convert any Path / set / tuple → serialisable types
    return _sanitise(payload)


def _safe_list(val: Any) -> list:
    if isinstance(val, list):
        return val
    if isinstance(val, (set, tuple)):
        return list(val)
    return []


def _sanitise(d: Dict) -> Dict:
    out = {}
    for k, v in d.items():
        if v is None:
            continue  # drop None
        if isinstance(v, Path):
            v = str(v)
        elif isinstance(v, (set, tuple)):
            v = list(v)
        elif not isinstance(v, (str, int, float, bool, list, dict)):
            v = str(v)
        out[k] = v
    return out


def _point_id(chunk_id: str) -> int:
    """Map a hex chunk ID string to a stable 64-bit integer Qdrant point ID."""
    return int(hashlib.md5(chunk_id.encode()).hexdigest()[:15], 16)


def _batch_upsert(
    client,
    collection: str,
    points: list,
    batch_size: int,
) -> int:
    """Upsert points in batches; return total stored."""
    stored = 0
    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        client.upsert(collection_name=collection, points=batch, wait=True)
        stored += len(batch)
        logger.info(f"  batch {i // batch_size + 1}: {len(batch)} points upserted")
    return stored