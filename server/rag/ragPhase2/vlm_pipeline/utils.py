"""Small shared helpers — nothing here is specific to Firebase or the VLM."""

import os
import re
from typing import Optional


def env_path(name: str, default: str) -> str:
    return os.getenv(name, default)


def page_num_int(page_num_field: str) -> Optional[int]:
    """'page_7' -> 7. Returns None if it can't parse (never filtered out by mistake)."""
    if not page_num_field:
        return None
    m = re.search(r"(\d+)", str(page_num_field))
    return int(m.group(1)) if m else None


def page_num_display(page_num_field: str) -> str:
    """Human-readable page number for description prefixes, e.g. '7' or the raw field
    if it doesn't parse cleanly."""
    n = page_num_int(page_num_field)
    return str(n) if n is not None else str(page_num_field or "unknown")