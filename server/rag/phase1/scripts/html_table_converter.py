# html_table_converter.py
"""
HTML table → plain text converter for the embedding pipeline.

Two output modes
----------------
embed     → clean pipe-delimited rows, no cell labels  (used for vector store)
retrieval → same rows with [C0], [C1]... labels        (used for LLM retrieval context)

Public API
----------
html_table_to_text(html, mode="embed")  -> str
embed_to_retrieval(embed_line)          -> str
"""

from bs4 import BeautifulSoup
import re


def collapse_adjacent(cells, min_collapse=6):
    """
    Collapse adjacent duplicate cells into 'word xN' notation.
    Only triggers when N >= min_collapse (default: 6).
    Groups smaller than min_collapse are left as-is.
    """
    if not cells:
        return cells

    result = []
    i = 0

    while i < len(cells):
        current = cells[i]
        count = 1

        while i + count < len(cells) and cells[i + count] == current:
            count += 1

        if count >= min_collapse:
            label = current if current else "(empty)"
            result.append(f"{label} x{count}")
        else:
            result.extend([current] * count)

        i += count

    return result


def normalize_temperature_units(text):
    if not text:
        return ""

    # Normalize Celsius
    text = re.sub(r"°\s*C", " Celsius", text, flags=re.IGNORECASE)
    text = re.sub(r"℃", " Celsius", text)

    # Normalize Fahrenheit
    text = re.sub(r"°\s*F", " Fahrenheit", text, flags=re.IGNORECASE)
    text = re.sub(r"℉", " Fahrenheit", text)

    # Clean double spaces
    text = re.sub(r"\s+", " ", text).strip()

    return text


def build_grid(table):
    grid = []
    span_map = {}

    rows = table.find_all("tr")

    max_cols = 0

    for r_idx, row in enumerate(rows):
        grid_row = []
        c_idx = 0

        cells = row.find_all(["td", "th"])

        for cell in cells:

            while (r_idx, c_idx) in span_map:
                grid_row.append(span_map[(r_idx, c_idx)])
                c_idx += 1

            rowspan = int(cell.get("rowspan", 1))
            colspan = int(cell.get("colspan", 1))

            raw = cell.get_text(" ", strip=True)
            raw = normalize_temperature_units(raw)

            text = raw if raw not in ["", "—", "-", "N/A"] else ""

            for i in range(colspan):
                grid_row.append(text)

                if rowspan > 1:
                    for j in range(1, rowspan):
                        span_map[(r_idx + j, c_idx)] = text

                c_idx += 1

        while (r_idx, c_idx) in span_map:
            grid_row.append(span_map[(r_idx, c_idx)])
            c_idx += 1

        max_cols = max(max_cols, len(grid_row))
        grid.append(grid_row)

    for r_idx, row in enumerate(grid):
        c_idx = len(row)

        while c_idx < max_cols:
            if (r_idx, c_idx) in span_map:
                row.append(span_map[(r_idx, c_idx)])
            else:
                row.append("")
            c_idx += 1

    return grid


def grid_to_embed_text(grid):
    """Clean format for embedding — no [C] labels, pipe-delimited with closing pipe."""
    lines = []
    for idx, row in enumerate(grid):
        collapsed = collapse_adjacent(row)
        cells = " | ".join(cell if cell else "" for cell in collapsed)
        line = f"[Row {idx}] {cells} |"
        lines.append(line)
    return "\n".join(lines)


def grid_to_retrieval_text(grid):
    """Structured format for LLM retrieval — [C] labels, pipe-delimited with closing pipe."""
    lines = []
    for idx, row in enumerate(grid):
        collapsed = collapse_adjacent(row)
        parts = [f"[C{i}] {cell}" if cell else f"[C{i}]" for i, cell in enumerate(collapsed)]
        cells = " | ".join(parts)
        line = f"[Row {idx}] {cells} |"
        lines.append(line)
    return "\n".join(lines)


def html_table_to_text(html, mode="embed"):
    """
    Convert HTML table to text.

    mode="embed"     → clean format, no [C] labels (for vector store)
    mode="retrieval" → structured format with [C] labels (for LLM context)
    """
    soup = BeautifulSoup(html, "html.parser")
    table = soup.find("table")

    if not table:
        raise ValueError("No <table> found")

    grid = build_grid(table)

    if mode == "embed":
        return grid_to_embed_text(grid)
    elif mode == "retrieval":
        return grid_to_retrieval_text(grid)
    else:
        raise ValueError(f"Unknown mode: {mode}. Use 'embed' or 'retrieval'.")


def embed_to_retrieval(embed_line):
    """
    Convert a single embed-format line back to retrieval format.

    Input:  "[Row 10] Cooling | Capacity | kW | 7.01 | 7.03 |"
    Output: "[Row 10] [C0] Cooling | [C1] Capacity | [C2] kW | [C3] 7.01 | [C4] 7.03 |"
    """
    bracket_end = embed_line.index("]") + 1
    row_prefix  = embed_line[:bracket_end]
    rest        = embed_line[bracket_end:].strip()

    if rest.endswith(" |"):
        rest = rest[:-2].strip()

    cells   = rest.split(" | ")
    labeled = [f"[C{i}] {cell.strip()}" if cell.strip() else f"[C{i}]"
               for i, cell in enumerate(cells)]

    return f"{row_prefix} {' | '.join(labeled)} |"


# ── Batch helper used by the notebook ─────────────────────────────────────────

def convert_tables_in_markdown(md_text: str) -> tuple:
    """
    Find every HTML <table>…</table> block in md_text, convert each to
    embed-format text, splice back in place.

    Also stores the retrieval-format version in the record for future use.

    Returns
    -------
    cleaned_md    : str        — markdown with HTML tables replaced by row text
    table_records : list[dict] — one entry per table:
        {
          "table_index":      int,
          "embed_text":       str,   ← used for embedding
          "retrieval_text":   str,   ← stored in metadata for retrieval phase
          "char_start":       int,
          "char_end":         int,
        }
    """
    import re as _re

    _HTML_TABLE_RE = _re.compile(r"<table[\s\S]*?</table>", _re.IGNORECASE)

    matches       = list(_HTML_TABLE_RE.finditer(md_text))
    table_records = []

    if not matches:
        return md_text, []

    result_text = md_text
    offset      = 0

    for idx, match in enumerate(matches):
        html_src  = match.group(0)
        start, end = match.start(), match.end()

        try:
            embed_text     = html_table_to_text(html_src, mode="embed")
            retrieval_text = html_table_to_text(html_src, mode="retrieval")
            replacement    = embed_text
            success        = True
        except Exception as e:
            embed_text     = ""
            retrieval_text = ""
            replacement = html_src
            success        = False

        adj_start   = start + offset
        adj_end     = end   + offset
        result_text = result_text[:adj_start] + replacement + result_text[adj_end:]
        offset     += len(replacement) - (end - start)

        table_records.append({
            "table_index":    idx,
            "embed_text":     embed_text,
            "retrieval_text": retrieval_text,
            "success":        success,
            "char_start":     start,
            "char_end":       end,
        })

    return result_text, table_records
