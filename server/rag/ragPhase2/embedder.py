# embedder.py
"""
Embedder — BAAI/bge-base-en-v1.5 via sentence-transformers.

Load priority
-------------
1. Local path  MODEL_LOCAL_PATH  (e.g. /mnt/models/bge-base-en-v1.5)
               If the directory exists and contains config.json → load from disk.
2. HuggingFace hub download   → cached to MODEL_LOCAL_PATH (or HF default cache).

Required env vars
-----------------
    MODEL_LOCAL_PATH   path where model is/will be stored
                       default: ./models/bge-base-en-v1.5
    DEVICE             "cpu" or "cuda"  (default: "cpu")
    EMBED_BATCH_SIZE   batch size for encoding (default: 64)

Public API
----------
    embedder = Embedder()
    chunks   = embedder.embed_chunks(chunks)   # attaches "embedding" to each
    vec      = embedder.embed_query("...")      # returns np.ndarray
"""

import os
import logging
import numpy as np
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

MODEL_NAME = "BAAI/bge-base-en-v1.5"


class Embedder:
    """
    Sentence-transformers embedder for BAAI/bge-base-en-v1.5.

    On init:
      - Checks MODEL_LOCAL_PATH for an already-downloaded model.
      - If found → loads directly (fast, no network).
      - If not   → downloads from HuggingFace into MODEL_LOCAL_PATH.

    Attributes
    ----------
    model_name    : str       — HuggingFace model ID
    local_path    : Path      — where the model is stored locally
    device        : str       — "cpu" or "cuda"
    embedding_dim : int       — 768 for bge-base-en-v1.5
    model         : SentenceTransformer
    """

    def __init__(
        self,
        local_path:  str = None,
        device:      str = None,
        batch_size:  int = None,
    ):
        self.model_name   = MODEL_NAME
        BASE_DIR = Path(__file__).resolve().parent

        self.local_path = Path(
            local_path or os.getenv("MODEL_LOCAL_PATH") or BASE_DIR / "models/bge-base-en-v1.5"
        )
        self.device       = device     or os.getenv("DEVICE",          "cpu")
        self.batch_size   = batch_size or int(os.getenv("EMBED_BATCH_SIZE", "64"))
        self.embedding_dim = 768        # fixed for bge-base-en-v1.5

        self._load_model()

        print(
            f"Embedder ready:\n"
            f"  model={self.model_name}\n"
            f"  local_path={self.local_path}\n"
            f"  device={self.device}  dim={self.embedding_dim}  batch={self.batch_size}"
        )

    # ── Model loading ─────────────────────────────────────────────────────────

    def _load_model(self):
        """Load from local path if available, otherwise download and save."""
        from sentence_transformers import SentenceTransformer

        config_file = self.local_path / "config.json"

        if config_file.exists():
            print(f"Loading model from local path: {self.local_path}")
            self.model = SentenceTransformer(
                str(self.local_path),
                device=self.device,
            )
        else:
            print(
                f"Model not found at {self.local_path}.\n"
                f"Downloading {self.model_name} from HuggingFace..."
            )
            self.local_path.mkdir(parents=True, exist_ok=True)
            self.model = SentenceTransformer(
                self.model_name,
                device=self.device,
                cache_folder=str(self.local_path.parent),
            )
            # Save to local_path for next time
            self.model.save(str(self.local_path))
            print(f"Model saved to {self.local_path}")

        # Verify / update actual dimension
        actual_dim = self.model.get_sentence_embedding_dimension()
        if actual_dim != self.embedding_dim:
            logger.warning(
                f"Expected dim {self.embedding_dim} but model reports {actual_dim}. "
                "Updating embedding_dim."
            )
            self.embedding_dim = actual_dim

    # ── Public API ────────────────────────────────────────────────────────────

    def embed_chunks(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Add "embedding" (List[float]) to each chunk dict in-place.

        Also adds to chunk["metadata"]:
            embedding_model, embedding_dim, embedding_backend

        Parameters
        ----------
        chunks : list of chunk dicts produced by IntelligentChunker

        Returns
        -------
        Same list with embedding field populated.
        """
        if not chunks:
            return []

        texts = [c["text"] for c in chunks]
        print(f"Embedding {len(texts)} chunks...")

        embeddings = self._encode(texts)

        for i, chunk in enumerate(chunks):
            chunk["embedding"] = embeddings[i].tolist()
            chunk.setdefault("metadata", {}).update({
                "embedding_model":   self.model_name,
                "embedding_dim":     self.embedding_dim,
                "embedding_backend": "sentence_transformers",
            })

        print(f"Done — {len(chunks)} embeddings generated (dim={self.embedding_dim})")
        return chunks

    def embed_query(self, query: str) -> np.ndarray:
        """
        Embed a single query string.

        BGE models benefit from the instruction prefix during retrieval.
        Returns an L2-normalised 1-D float32 array.
        """
        # BGE retrieval instruction prefix
        instruction = "Represent this sentence for searching relevant passages: "
        text = instruction + query
        vec  = self.model.encode(
            text,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return vec.astype(np.float32)

    # ── Internal ──────────────────────────────────────────────────────────────

    def _encode(self, texts: List[str]) -> np.ndarray:
        """Batch-encode texts, L2-normalised."""
        return self.model.encode(
            texts,
            batch_size=self.batch_size,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=True,
        ).astype(np.float32)
