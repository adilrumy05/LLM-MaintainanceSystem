"""
Distinguishes a whole-page render from a cropped figure extracted from that page.

Why this exists: a single page can produce TWO ManualImages docs describing the
SAME visual area —
  - the whole-page screenshot, imageName == "page.png" (the fallback used when
    no individual figure was cropped, or the page IS one large diagram)
  - one or more individually-cropped figures pulled out of that page

Before this, both got a generic vlmTag with no way to tell which is which, so a
caller reading "diagram" descriptions for a page could get two different,
seemingly-contradictory write-ups of the same drawing. Tagging `imageScope`
explicitly means a filter can ask for imageScope=="page" AND vlmTag=="diagram"
and know exactly what it's getting, with no ambiguity against the figure-level
crops from the same page.
"""

import re

PAGE_LEVEL_NAME_RE = re.compile(r"^page\.(png|jpe?g)$", re.IGNORECASE)

SCOPE_PAGE = "page"
SCOPE_FIGURE = "figure"


def determine_scope(image_name: str) -> str:
    """Return 'page' for a whole-page render, 'figure' for a cropped sub-image.

    Extend PAGE_LEVEL_NAME_RE if your pipeline uses other whole-page filenames
    (e.g. 'full_page.png') — keep it name-based rather than size-based, since
    a page that IS one giant diagram can be just as large as a cropped figure.
    """
    if image_name and PAGE_LEVEL_NAME_RE.match(image_name.strip()):
        return SCOPE_PAGE
    return SCOPE_FIGURE


def scope_label(scope: str, page_display: str) -> str:
    """Deterministic prefix baked into the stored description — not left to the
    model to remember, so it's always present and always consistent."""
    if scope == SCOPE_PAGE:
        return f"Page {page_display} (full-page image)"
    return f"Figure on page {page_display}"