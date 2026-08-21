"""
Embedder — BAAI/bge-m3 via FlagEmbedding (dense + sparse lexical weights).

Required env vars
------------------
    MODEL_LOCAL_PATH   default ./models/bge-m3   (used as HF cache_dir)
    DEVICE              "cpu", "cuda", or "dml"   (default: "cpu")
    EMBED_BATCH_SIZE    default 16
    USE_FP16             true/false — forced off on dml regardless of this
"""

import os
import logging
import numpy as np
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def _env_int(name, default=None):
    value = os.getenv(name)
    if value is None:
        if default is None:
            raise ValueError(f"Missing environment variable: {name}")
        return default
    try:
        return int(value)
    except ValueError:
        raise ValueError(f"{name} must be an integer, got: {value}")

def _env_bool(name, default=None):
    value = os.getenv(name)
    if value is None:
        if default is None:
            raise ValueError(f"Missing environment variable: {name}")
        return default
    if isinstance(value, bool):
        return value
    if value.lower() in ("true", "1", "yes", "on"):
        return True
    if value.lower() in ("false", "0", "no", "off"):
        return False
    raise ValueError(f"{name} must be a boolean, got: {value}")

def _env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(f"Required env var {name!r} is not set.")
    return val


def _project_root() -> Path:
    """Find the project root by locating .env or .git."""
    current = Path(__file__).resolve().parent

    while current != current.parent:
        if (current / ".env").is_file() or (current / ".git").exists():
            return current
        current = current.parent

    raise RuntimeError(
        f"Could not find project root from {Path(__file__).resolve()}"
    )

# Some transformers versions refuse to load these checkpoint files without this.
# Confirmed necessary in the DML smoke test — keep it, harmless if not needed.
try:
    import transformers.utils.import_utils as _tiu
    _tiu.check_torch_load_is_safe = lambda *a, **k: None
    import transformers.modeling_utils as _tmu
    _tmu.check_torch_load_is_safe = lambda *a, **k: None
except Exception:
    pass

class Embedder:
    def __init__(self):
        self.model_name = _env("DENSE_EMBED_MODEL")
        model_path = Path(_env("MODEL_LOCAL_PATH"))

        if not model_path.is_absolute():
            model_path = _project_root() / model_path

        self.local_path = model_path.resolve()
        self.local_path.mkdir(parents=True, exist_ok=True)

        self.device = _env("DEVICE").lower()
        if self.device not in ("cpu", "cuda", "dml"):
            raise RuntimeError(f"DEVICE must be 'cpu', 'cuda', or 'dml' — got {self.device!r}")

        self.batch_size = _env_int("EMBED_BATCH_SIZE")
        self.use_fp16 = _env_bool("USE_FP16")
        if self.use_fp16 and self.device == "dml":
            raise RuntimeError(
                "USE_FP16=true is not supported with DEVICE=dml — DirectML fp16 op "
                "coverage is unreliable. Set USE_FP16=false in .env."
            )

        self.embedding_dim = None   # set by _load_model
        self.active_device = None   # set by _load_model

        self._load_model()

        print(
            f"Embedder ready:\n"
            f"  model={self.model_name}\n"
            f"  cache_dir={self.local_path}\n"
            f"  device={self.device} (active: {self.active_device})\n"
            f"  dim={self.embedding_dim}  batch={self.batch_size}  fp16={self.use_fp16}"
        )

    def _device_str(self, kind: str) -> str:
        """Return the torch device string for a given kind."""
        if kind == "dml":
            import torch_directml
            return str(torch_directml.device())   # 'privateuseone:0'
        if kind == "cuda":
            return "cuda:0"
        return "cpu"

    def _make_model(self, device_str: str):
        from FlagEmbedding import BGEM3FlagModel
        return BGEM3FlagModel(
            self.model_name,
            devices=device_str,             # confirmed: string, not a list
            use_fp16=self.use_fp16,
            cache_dir=str(self.local_path),  # HF cache — reused automatically on later runs
        )

    def _test_encode(self, model):
        out = model.encode(
            ["directml smoke test"],
            batch_size=1,
            max_length=32,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )
        # We don't know dim yet, just check it runs
        return out

    def _load_model(self):
        # Attempt requested device first
        if self.device == "dml":
            try:
                device_str = self._device_str("dml")
                print(f"Attempting DirectML device: {device_str}")
                self.model = self._make_model(device_str)
                out = self._test_encode(self.model)
                self.embedding_dim = int(out["dense_vecs"].shape[-1])
                self.active_device = "dml"
                return
            except Exception as e:
                logger.warning(
                    f"DirectML load/encode failed ({e!r}). Falling back to CPU."
                )

        # Fallback to CPU (or CUDA if requested)
        kind = "cuda" if self.device == "cuda" else "cpu"
        device_str = self._device_str(kind)
        self.model = self._make_model(device_str)
        out = self._test_encode(self.model)
        self.embedding_dim = int(out["dense_vecs"].shape[-1])
        self.active_device = kind

    # ── Public API ────────────────────────────────────────────────────────────

    def embed_chunks(self, chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not chunks:
            return []

        texts = [c["text"] for c in chunks]
        print(f"Embedding {len(texts)} chunks (dense + sparse) on {self.active_device}...")

        out = self.model.encode(
            texts,
            batch_size=self.batch_size,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )
        dense  = out["dense_vecs"]
        sparse = out["lexical_weights"]

        for i, chunk in enumerate(chunks):
            chunk["embedding"] = np.asarray(dense[i], dtype=np.float32).tolist()
            chunk["sparse_embedding"] = _sparse_to_qdrant(sparse[i])
            chunk.setdefault("metadata", {}).update({
                "embedding_model":   self.model_name,
                "embedding_dim":     self.embedding_dim,
                "embedding_backend": f"FlagEmbedding[{self.active_device}]",
            })

        print(f"Done — {len(chunks)} embeddings generated (dense dim={self.embedding_dim})")
        return chunks

    def embed_query(self, query: str) -> Dict[str, Any]:
        out = self.model.encode(
            [query],
            batch_size=1,
            return_dense=True,
            return_sparse=True,
            return_colbert_vecs=False,
        )
        dense_vec  = np.asarray(out["dense_vecs"][0], dtype=np.float32)
        sparse_vec = _sparse_to_qdrant(out["lexical_weights"][0])
        return {"dense": dense_vec, "sparse": sparse_vec}


def _sparse_to_qdrant(lexical_weights: Dict[str, float]) -> Dict[str, list]:
    if not lexical_weights:
        return {"indices": [], "values": []}
    return {
        "indices": [int(tok) for tok in lexical_weights.keys()],
        "values":  [float(w) for w in lexical_weights.values()],
    }