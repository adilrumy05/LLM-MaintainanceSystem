r"""
verify_extraction.py — check EXTRACTION_DIR before running a long ingest.

Google Drive downloads fail in quiet ways: they arrive as split zips, they
extract one level too deep, and Windows silently truncates paths that exceed
260 characters. Any of these produce an EXTRACTION_DIR that *looks* fine and
then yields zero chunks after twenty minutes of ingestion.

This walks the same tree ingest_to_qdrant.py expects and reports what it finds.

    .\.venv\Scripts\python.exe server\rag\ragPhase2\verify_extraction.py

Expected layout:

    content_extraction/
        {classification}/
            {document_group_id}/
                {filename_stem}/
                    page_001/
                        processed_content.txt
                        metadata.json
                    toc.json           (optional)
"""

import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# An unset var and a var set to "" are different things to os.getenv, and
# Path("") is ".", which would happily walk the whole repository.
_raw = (os.getenv("EXTRACTION_DIR") or "").strip().strip('"').strip("'")
ROOT = Path(_raw) if _raw else None

MAX_WINDOWS_PATH = 260


def main() -> int:
    if ROOT is None:
        print("FAIL: EXTRACTION_DIR is not set (or is empty) in .env")
        print("\n  Download content_extraction from the Drive link in docs/SETUP.md,")
        print("  then set the path - forward slashes avoid all escaping problems:")
        print("\n    EXTRACTION_DIR=C:/Users/you/Downloads/content_extraction")
        return 1

    print(f"EXTRACTION_DIR = {ROOT}")

    if not ROOT.exists():
        print("\nFAIL: that path does not exist.")
        print("  - Check for stray quotes in .env - the value must not be wrapped in \" \".")
        print("  - Prefer forward slashes: C:/Users/you/Downloads/content_extraction")
        return 1

    # A zip extracted one level too deep is the most common Drive mistake.
    nested = ROOT / "content_extraction"
    if nested.is_dir():
        print(f"\nFAIL: found a nested '{nested.name}' folder inside EXTRACTION_DIR.")
        print("  The zip extracted one level too deep. Either point EXTRACTION_DIR at:")
        print(f"    {nested}")
        print("  or move its contents up one level.")
        return 1

    classifications = [d for d in sorted(ROOT.iterdir()) if d.is_dir()]
    if not classifications:
        print("\nFAIL: no subfolders. EXTRACTION_DIR should contain classification folders.")
        return 1

    groups = pages = complete = 0
    missing_text, missing_meta, long_paths = [], [], []

    for cls in classifications:
        for grp in sorted(d for d in cls.iterdir() if d.is_dir()):
            groups += 1
            for stem in sorted(d for d in grp.iterdir() if d.is_dir()):
                for page in sorted(d for d in stem.iterdir()
                                   if d.is_dir() and d.name.startswith("page_")):
                    pages += 1
                    txt = page / "processed_content.txt"
                    meta = page / "metadata.json"
                    if not txt.exists():
                        missing_text.append(page)
                    if not meta.exists():
                        missing_meta.append(page)
                    if txt.exists() and meta.exists():
                        complete += 1
                    if len(str(txt.resolve())) > MAX_WINDOWS_PATH:
                        long_paths.append(txt)

    print(f"\n  classifications : {len(classifications)}  "
          f"({', '.join(c.name for c in classifications[:5])}"
          f"{', ...' if len(classifications) > 5 else ''})")
    print(f"  document groups : {groups}")
    print(f"  page folders    : {pages}")
    print(f"  complete pages  : {complete}   (both processed_content.txt and metadata.json)")

    ok = True
    if pages == 0:
        print("\nFAIL: no page_* folders found. The download looks incomplete.")
        ok = False
    if missing_text:
        print(f"\nWARN: {len(missing_text)} page(s) missing processed_content.txt, e.g.")
        for p in missing_text[:3]:
            print(f"    {p}")
        ok = False
    if missing_meta:
        print(f"\nWARN: {len(missing_meta)} page(s) missing metadata.json, e.g.")
        for p in missing_meta[:3]:
            print(f"    {p}")
        ok = False
    if long_paths:
        print(f"\nWARN: {len(long_paths)} path(s) exceed {MAX_WINDOWS_PATH} characters.")
        print("  Windows may have truncated these during extraction. Either enable long")
        print("  paths, or move content_extraction closer to the drive root (e.g. C:\\ce).")
        for p in long_paths[:2]:
            print(f"    {len(str(p))} chars: {p}")
        ok = False

    print("\nOK - safe to ingest." if ok else "\nFix the above before ingesting.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
