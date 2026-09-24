"""Perceptual-hash based near-duplicate detection."""

import io
from typing import List, Optional, Tuple


def compute_phash(image_bytes: bytes) -> Optional[str]:
    try:
        from PIL import Image
        import imagehash

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        return str(imagehash.phash(img))
    except Exception:
        return None


def _hamming(a: str, b: str) -> int:
    try:
        ia, ib = int(a, 16), int(b, 16)
    except (TypeError, ValueError):
        return 999
    return bin(ia ^ ib).count("1")


class DuplicateIndex:
    """Greedy near-duplicate detector. Fine up to tens of thousands of images;
    for a much bigger sweep, bucket by the first N bits of the hash first."""

    def __init__(self, threshold: int = 5):
        self.threshold = threshold
        self._representatives: List[Tuple[str, str]] = []  # (doc_id, phash)

    def find_duplicate(self, phash: str) -> Optional[str]:
        for doc_id, rep_hash in self._representatives:
            if _hamming(phash, rep_hash) <= self.threshold:
                return doc_id
        return None

    def add_representative(self, doc_id: str, phash: str) -> None:
        self._representatives.append((doc_id, phash))