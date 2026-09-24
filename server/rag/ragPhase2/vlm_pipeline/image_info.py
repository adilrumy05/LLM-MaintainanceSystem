"""Image dimension reading and resizing before a VLM call. Kept separate from
dedup.py — that file is only about perceptual hashing / duplicate detection."""

import io
import logging
from typing import Optional, Tuple

logger = logging.getLogger("describe_images.image_info")


def get_image_dimensions(image_bytes: bytes) -> Tuple[Optional[int], Optional[int]]:
    """Return (width, height) of an image, or (None, None) on failure."""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        return img.width, img.height
    except Exception as e:
        logger.warning(f"Could not determine image dimensions: {e}")
        return None, None


def resize_for_vlm(image_bytes: bytes, max_side: int = 1024) -> Tuple[bytes, Optional[int], Optional[int]]:
    """Downscale before sending to the VLM (cuts token cost, negligible quality
    loss for reading labels/diagrams at this resolution).

    Returns (resized_bytes, sent_width, sent_height).
    """
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        scale = max_side / max(w, h)
        if scale < 1:
            img = img.resize((int(w * scale), int(h * scale)))
        sent_w, sent_h = img.size

        out = io.BytesIO()
        img.save(out, format="JPEG", quality=85)
        return out.getvalue(), sent_w, sent_h
    except Exception as e:
        logger.warning(f"resize failed, sending original bytes: {e}")
        original_w, original_h = get_image_dimensions(image_bytes)
        return image_bytes, original_w, original_h