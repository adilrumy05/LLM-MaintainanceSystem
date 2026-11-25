#!/usr/bin/env python3
"""
smoke_test.py — Phase 1 bootstrap + smoke test.
Handles automatic .venv creation, CUDA detection, dependency installation,
MonkeyOCR setup, real-time downloads, and optional AI error diagnosis.
"""

from __future__ import annotations
import argparse, json, os, shutil, subprocess, sys, time, traceback
from pathlib import Path

SMOKE_GROUP = "smoke_test"
APP_NAME = "Maintaince-copilot"

REQUIRED_FILES = {
    "data/data_information.csv":                     "CSV manifest",
    "scripts/general_processor.py":                  "helper script",
    "scripts/general_content_extractor.py":          "helper script",
    "scripts/html_table_converter.py":               "helper script",
    "phase1_ocr.ipynb":                              "OCR notebook",
    "phase1_llm_parsing.ipynb":                      "parsing notebook",
    "verify_extraction.py":                          "structural verifier",
}
LLM_ONLY_FILES = {"scripts/llm_table_normalizer.py": "LLM table normalizer (LLM mode only)"}
CSV_REQUIRED_COLUMNS = ["document_group_id", "filename", "classification"]

# ============================================================ venv & deps

def setup_venv_and_restart():
    """Detect CUDA, create a named .venv, install deps, and restart."""
    # If we are already inside a venv, don't loop
    if sys.prefix != sys.base_prefix:
        return

    # 1. Detect CUDA version first
    cuda_ver = 12 # Default
    try:
        smi = subprocess.check_output(["nvidia-smi"], text=True)
        if "CUDA Version: 13" in smi:
            cuda_ver = 13
        elif "CUDA Version: 12" in smi:
            cuda_ver = 12
    except Exception:
        print("[venv] WARNING: Could not run nvidia-smi. Defaulting to CUDA 12.")
    
    # 2. Set the venv name based on CUDA and App Name
    venv_name = f".venv_cu{cuda_ver}_{APP_NAME}"
    venv_path = Path(venv_name).resolve()
    
    print(f"\n[venv] Detected CUDA {cuda_ver}. Using environment: {venv_name}")

    # 3. Create venv if it doesn't exist
    if not venv_path.exists():
        print(f"[venv] Creating virtual environment at {venv_path}...")
        subprocess.run([sys.executable, "-m", "venv", str(venv_path)], check=True)

    # Determine python and pip paths based on OS
    if os.name == "nt":
        venv_python = venv_path / "Scripts" / "python.exe"
        venv_pip = venv_path / "Scripts" / "pip.exe"
    else:
        venv_python = venv_path / "bin" / "python"
        venv_pip = venv_path / "bin" / "pip"

    # 4. Check if requirements are already installed
    try:
        subprocess.run([str(venv_python), "-c", "import torch"], check=True, capture_output=True)
        already_installed = True
    except subprocess.CalledProcessError:
        already_installed = False

    # 5. Install requirements if needed
    if not already_installed:
        req_file = Path(f"requirements_cu{cuda_ver}.txt")
        if not req_file.exists():
            print(f"\n[ERROR] Detected CUDA {cuda_ver}, but {req_file} is missing!")
            print(f"Please ensure both requirements_cu12.txt and requirements_cu13.txt are in {Path.cwd()}")
            sys.exit(1)

        print(f"[venv] Installing dependencies from {req_file} (this will take several minutes)...")
        
        proc = subprocess.Popen([str(venv_pip), "install", "-r", str(req_file)])
        proc.wait()
        
        if proc.returncode != 0:
            print(f"\n[ERROR] pip install failed. Please check the output above.")
            sys.exit(1)

    # 6. Restart the script inside the newly created environment
    print(f"\n[venv] Environment {venv_name} ready. Restarting script inside it...\n")
    
    os.environ["SMOKE_TEST_VENV_ACTIVE"] = "1"
    cmd = [str(venv_python), str(Path(__file__).resolve())] + sys.argv[1:]
    proc = subprocess.run(cmd)
    sys.exit(proc.returncode)

# ============================================================ bootstrap

def bootstrap(root: Path, sample_pdf: Path | None, force: bool) -> dict:
    rep = {"created": [], "skipped": [], "errors": []}
    for d in ["data", "scripts", "checkpoint", "output", "content_extraction"]:
        p = root / d
        if p.exists():
            rep["skipped"].append(f"dir: {d}/")
        else:
            p.mkdir(parents=True, exist_ok=True)
            rep["created"].append(f"dir: {d}/")

    csv = root / "data" / "data_information.csv"
    if csv.exists() and not force:
        rep["skipped"].append(f"CSV: {csv}")
    else:
        csv.write_text("document_group_id,filename,classification\n")
        rep["created"].append(f"CSV: {csv}")

    group_dir = root / "data" / SMOKE_GROUP
    group_dir.mkdir(parents=True, exist_ok=True)

    if sample_pdf is not None:
        dst = group_dir / sample_pdf.name
        if dst.exists() and not force:
            rep["skipped"].append(f"PDF: {dst}")
        else:
            shutil.copy2(sample_pdf, dst)
            rep["created"].append(f"PDF copied: {dst}")
        pdf_name = sample_pdf.name
    else:
        pdf_name = "sample.pdf"
        dst = group_dir / pdf_name
        if dst.exists() and not force:
            rep["skipped"].append(f"PDF: {dst}")
        else:
            try:
                _generate_sample_pdf(dst)
                rep["created"].append(f"PDF generated: {dst}")
            except Exception as e:
                rep["errors"].append(f"PDF generation failed: {e}")

    try:
        text = csv.read_text().rstrip("\n")
        if not any(line.startswith(f"{SMOKE_GROUP},") for line in text.splitlines()[1:]):
            csv.write_text(text + f"\n{SMOKE_GROUP},{pdf_name},MANUAL\n")
            rep["created"].append(f"CSV row: {SMOKE_GROUP},{pdf_name},MANUAL")
        else:
            rep["skipped"].append("CSV smoke_test row (already present)")
    except Exception as e:
        rep["errors"].append(f"CSV append failed: {e}")
    return rep

def _generate_sample_pdf(path: Path):
    try:
        import pymupdf as fitz
    except ImportError:
        import fitz
    doc = fitz.open()
    for i in (1, 2):
        page = doc.new_page()
        page.insert_text((72, 72),
            f"SMOKE TEST — page {i}\n\nModel: TEST-{i}00\nCooling capacity: {3.0 + i * 0.5:.1f} kW\nHeating capacity: {4.0 + i * 0.5:.1f} kW\n\nTable {i}:\n  Item | Value\n  Voltage | 220-240 V\n  Frequency | 50 Hz\n",
            fontsize=12)
    doc.save(str(path))
    doc.close()

def ensure_monkeyocr(root: Path, model_name: str, download: bool) -> dict:
    rep = {"ok": [], "warn": [], "fail": []}
    monkey = root / "MonkeyOCR"

    if (monkey / "parse.py").exists():
        rep["ok"].append(f"MonkeyOCR repo: {monkey}")
    elif not download:
        rep["fail"].append(f"MonkeyOCR repo missing and --no-download-weights: {monkey}")
        return rep
    else:
        if shutil.which("git") is None:
            rep["fail"].append("git not found on PATH — cannot clone MonkeyOCR")
            return rep
        print(f"  [git] Cloning MonkeyOCR into {monkey}...")
        proc = subprocess.Popen(["git", "clone", "https://github.com/Yuliang-Liu/MonkeyOCR.git", str(monkey)], stdout=sys.stdout, stderr=sys.stderr)
        proc.wait()
        if proc.returncode != 0:
            rep["fail"].append("git clone failed (see terminal output above)")
            return rep
        rep["ok"].append(f"cloned MonkeyOCR -> {monkey}")

    model_weight = monkey / "model_weight"
    weights = monkey / "weights"
    has_weights = any((d / "Recognition").is_dir() or (d / "Structure").is_dir() for d in (model_weight, weights) if d.is_dir())

    if has_weights:
        rep["ok"].append(f"weights present under {monkey}")
    elif not download:
        rep["warn"].append(f"weights missing and --no-download-weights: {model_weight}")
    else:
        if not (monkey / "tools" / "download_model.py").exists():
            rep["fail"].append(f"download script missing: {monkey / 'tools' / 'download_model.py'}")
            return rep
        print("  [pip] Ensuring huggingface_hub is installed...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "huggingface_hub"], stdout=sys.stdout, stderr=sys.stderr)
        print(f"\n  [download] Downloading {model_name} weights (~3GB).\n  Progress bars will appear below:")
        print("-" * 60)
        proc = subprocess.Popen([sys.executable, str(monkey / "tools" / "download_model.py"), "-n", model_name], cwd=str(monkey), stdout=sys.stdout, stderr=sys.stderr)
        proc.wait()
        print("-" * 60)
        if proc.returncode != 0:
            rep["fail"].append("download_model.py failed (see terminal output above)")
            return rep
        rep["ok"].append(f"weights downloaded: {model_name} -> {model_weight}")

    if model_weight.is_dir() and not weights.exists():
        try:
            if os.name == "nt":
                subprocess.run(["cmd", "/c", "mklink", "/J", str(weights), str(model_weight)], check=True, capture_output=True)
            else:
                os.symlink(model_weight, weights, target_is_directory=True)
            rep["ok"].append(f"linked {weights.name} -> {model_weight.name} (for the notebook)")
        except Exception as e:
            rep["warn"].append(f"could not create 'weights' junction ({e})")
    elif weights.is_dir():
        rep["ok"].append(f"weights directory: {weights}")
    return rep

# ============================================================ preflight

def preflight(root: Path, pdf: Path) -> dict:
    rep = {"ok": [], "warn": [], "fail": []}
    v = sys.version_info
    (rep["fail"] if v < (3, 10) else rep["ok"]).append(f"Python {sys.version.split()[0]}")

    for rel, desc in REQUIRED_FILES.items():
        p = root / rel
        (rep["ok"] if p.exists() else rep["fail"]).append(f"{desc}: {rel}" if p.exists() else f"Missing {desc}: {p}")

    for rel, desc in LLM_ONLY_FILES.items():
        p = root / rel
        if p.exists(): rep["ok"].append(f"{desc}: {rel}")
        else: rep["warn"].append(f"{desc} not found (only needed for TABLE_PARSE_MODE='llm')")

    _check_csv(root, rep)

    monkey = root / "MonkeyOCR"
    if not (monkey / "parse.py").exists():
        rep["fail"].append(f"MonkeyOCR repo missing: {monkey}")
    else:
        model_weight = monkey / "model_weight"
        weights = monkey / "weights"
        if not (model_weight.is_dir() or weights.is_dir()):
            rep["fail"].append(f"MonkeyOCR weights missing: {model_weight} and {weights}")
        else:
            rep["ok"].append(f"MonkeyOCR: {monkey}")

    for name in ["pymupdf", "bs4", "pandas", "nbformat", "nbconvert", "torch", "paddle"]:
        rep["ok"].append(f"package: {name}")

    try:
        import torch
        if torch.cuda.is_available():
            rep["ok"].append(f"CUDA: {torch.cuda.get_device_name(0)} (torch {torch.__version__})")
        else:
            rep["fail"].append("CUDA not available — OCR requires a GPU")
    except ImportError:
        pass

    if pdf.exists(): rep["ok"].append(f"test PDF: {pdf}")
    else: rep["fail"].append(f"test PDF not found: {pdf}")
    return rep

def _check_csv(root: Path, rep: dict):
    import pandas as pd
    csv = root / "data" / "data_information.csv"
    if not csv.exists():
        rep["fail"].append(f"CSV missing: {csv}")
        return
    try:
        df = pd.read_csv(csv)
    except Exception as e:
        rep["fail"].append(f"CSV unreadable: {e}")
        return
    missing = [c for c in CSV_REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        rep["fail"].append(f"CSV missing required columns: {missing}")
        return
    df["classification"] = df["classification"].astype(str).str.strip().str.upper()
    missing_pdfs = [f"data/{str(r['document_group_id']).strip()}/{str(r['filename']).strip()}" for _, r in df.iterrows() if not (root / "data" / str(r["document_group_id"]).strip() / str(r["filename"]).strip()).exists()]
    rep["ok"].append(f"CSV: {len(df)} row(s), columns OK" + ("" if not missing_pdfs else f", {len(missing_pdfs)} missing PDF(s)"))
    if missing_pdfs:
        rep["warn"].append("CSV references missing PDFs (rows skipped): " + ", ".join(missing_pdfs[:5]) + (" ..." if len(missing_pdfs) > 5 else ""))

# ============================================================ notebook prep

DRIVE_STUB = """\
import sys, types
try:
    import google.colab
except ImportError:
    _gc = types.ModuleType("google.colab")
    _gd = types.ModuleType("google.colab.drive")
    _gd.mount = lambda *a, **kw: print("[smoke] drive.mount stubbed (non-Colab)")
    _gc.drive = _gd
    sys.modules["google.colab"] = _gc
    sys.modules["google.colab.drive"] = _gd
"""

def _find_cell(nb, predicate):
    for i, c in enumerate(nb.cells):
        if c.cell_type == "code" and predicate("".join(c.source)): return i
    return None

def prepare_parsing_notebook(src: Path, dst: Path, root: Path, limit: int, pages: int):
    import nbformat
    nb = nbformat.read(src, as_version=4)
    nb.cells.insert(0, nbformat.v4.new_code_cell(DRIVE_STUB))
    cfg = _find_cell(nb, lambda s: 'EXTRACTION_DIR = DRIVE_BASE / "content_extraction"' in s)
    if cfg is None: raise RuntimeError("config cell not found in parsing notebook")
    nb.cells.insert(cfg + 1, nbformat.v4.new_code_cell(f"""\
from pathlib import Path
DRIVE_BASE = Path({str(root)!r})
OCR_OUTPUT_DIR = DRIVE_BASE / "output"
CSV_PATH = DRIVE_BASE / "data" / "data_information.csv"
EXTRACTION_DIR = DRIVE_BASE / "content_extraction"
CHECKPOINT_DIR = DRIVE_BASE / "checkpoint"
OCR_CHECKPOINT = CHECKPOINT_DIR / "ocr_checkpoint.json"
EXTRACTION_CHECKPOINT = CHECKPOINT_DIR / "content_extraction_checkpoint.json"
EXTRACTION_DIR.mkdir(parents=True, exist_ok=True)
CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
print(f"[smoke] DRIVE_BASE = {{DRIVE_BASE}}")
"""))
    wl = _find_cell(nb, lambda s: "work_items = []" in s)
    if wl is not None:
        nb.cells.insert(wl + 1, nbformat.v4.new_code_cell(f"""\
work_items = work_items[:{limit}]
for _w in work_items: _w["page_dirs"] = _w["page_dirs"][:{pages}]
print(f"[smoke] limited to {{len(work_items)}} file(s), up to {pages} page(s) each")
"""))
    nbformat.write(nb, dst)

def prepare_ocr_notebook(src: Path, dst: Path, root: Path, limit: int, monkeyocr_path: Path):
    import nbformat
    nb = nbformat.read(src, as_version=4)
    nb.cells.insert(0, nbformat.v4.new_code_cell(DRIVE_STUB))
    cfg = _find_cell(nb, lambda s: "DRIVE_BASE" in s and "LIMIT" in s)
    if cfg is None: raise RuntimeError("config cell not found in OCR notebook")
    nb.cells.insert(cfg + 1, nbformat.v4.new_code_cell(f"""\
from pathlib import Path
DRIVE_BASE = Path({str(root)!r})
MONKEYOCR_PATH = Path({str(monkeyocr_path)!r})
LIMIT = {limit}
DOC_GROUP_FILTER = None
CLASSIFICATION_FILTER = None
print(f"[smoke] DRIVE_BASE = {{DRIVE_BASE}}")
print(f"[smoke] MONKEYOCR_PATH = {{MONKEYOCR_PATH}}")
if not (MONKEYOCR_PATH / "model_weight").is_dir() and not (MONKEYOCR_PATH / "weights").is_dir():
    raise RuntimeError(f"weights missing under {{MONKEYOCR_PATH}}")
"""))
    nbformat.write(nb, dst)

# ============================================================ runners

def run_notebook(nb_path: Path, workdir: Path, timeout: int = 1800) -> tuple[bool, str]:
    cmd = [sys.executable, "-m", "nbconvert", "--to", "notebook", "--execute", f"--ExecutePreprocessor.timeout={timeout}", "--output", nb_path.name, "--output-dir", str(workdir), str(nb_path)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 60)
    except subprocess.TimeoutExpired:
        return False, f"timed out after {timeout}s"
    ok = proc.returncode == 0
    tail = (proc.stdout + proc.stderr).strip().splitlines()[-40:]
    return ok, "\n".join(tail)

def check_parsing_output(root: Path) -> tuple[bool, str]:
    out = root / "content_extraction" / "MANUAL" / SMOKE_GROUP
    if not out.exists(): return False, f"no output dir: {out}"
    pages = list(out.glob("**/page_*/processed_content.txt"))
    if not pages: return False, "no processed_content.txt produced"
    empty = [p for p in pages if p.stat().st_size < 10]
    if empty: return False, f"{len(empty)} empty processed_content.txt files"
    return True, f"{len(pages)} page(s) produced"

def _resolve_verify(root: Path, override: Path | None) -> Path | None:
    candidates = [override] if override else []
    candidates += [root / "verify_extraction.py", root.parent / "ragPhase2" / "verify_extraction.py"]
    for c in candidates:
        if c and c.exists(): return c
    return None

def run_verify(root: Path, verify_script: Path | None) -> tuple[bool, str]:
    verify = _resolve_verify(root, verify_script)
    if verify is None: return False, "verify_extraction.py not found"
    env = {**os.environ, "EXTRACTION_DIR": str(root / "content_extraction")}
    try:
        proc = subprocess.run([sys.executable, str(verify)], capture_output=True, text=True, timeout=120, env=env)
    except subprocess.TimeoutExpired:
        return False, "verify_extraction.py timed out"
    return proc.returncode == 0, (proc.stdout + proc.stderr).strip()[-2000:]

# ============================================================ AI Copilot

def explain_failure_with_ai(report: dict):
    """If the test fails, ask an LLM to explain the error to the client."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return
        
    print("\n[AI Copilot] Analyzing failure log to find a fix...")
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        
        failure_context = "The following smoke test failed on a client PC:\n"
        for stage, data in report.get("stages", {}).items():
            if not data.get("ok"):
                failure_context += f"\nStage: {stage}\n"
                failure_context += f"Log Tail:\n{data.get('log', 'No log available')}\n"
                if data.get('error'):
                    failure_context += f"Error: {data['error']}\n"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert Python and DevOps assistant helping a non-technical user fix a RAG pipeline installation error. Look at the log tail provided and give 1-3 bullet points on exactly what they need to install or fix. Be concise and direct."},
                {"role": "user", "content": failure_context}
            ],
            max_tokens=300
        )
        
        print("\n" + "="*60)
        print("🤖 AI COPILOT SUGGESTED FIX:")
        print(response.choices[0].message.content.strip())
        print("="*60 + "\n")
        
    except Exception as e:
        print(f"  [AI Copilot] Could not analyze: {e}")

# ============================================================ cleanup & main

def cleanup(root: Path):
    for p in [root / "data" / SMOKE_GROUP, root / "output" / "MANUAL" / SMOKE_GROUP, root / "content_extraction" / "MANUAL" / SMOKE_GROUP]:
        shutil.rmtree(p, ignore_errors=True)
    for cp in [root / "checkpoint" / "ocr_checkpoint.json", root / "checkpoint" / "content_extraction_checkpoint.json"]:
        if cp.exists():
            try:
                data = json.loads(cp.read_text())
                for k in [k for k in data.get("files", {}) if SMOKE_GROUP in k]: del data["files"][k]
                cp.write_text(json.dumps(data, indent=2))
            except Exception: pass
    manifest = root / "data" / "data_information.csv"
    if manifest.exists():
        lines = manifest.read_text().splitlines()
        keep = [l for l in lines if not l.startswith(f"{SMOKE_GROUP},")]
        manifest.write_text("\n".join(keep) + "\n")

def main():
    setup_venv_and_restart()

    ap = argparse.ArgumentParser(description="Phase 1 bootstrap + smoke test")
    ap.add_argument("--root", type=Path, default=Path("."), help="Phase 1 root (DRIVE_BASE)")
    ap.add_argument("--pdf", type=Path, default=None, help="test PDF (default: generate sample)")
    ap.add_argument("--pages", type=int, default=2)
    ap.add_argument("--limit", type=int, default=1)
    ap.add_argument("--skip-bootstrap", action="store_true")
    ap.add_argument("--no-download-weights", action="store_true")
    ap.add_argument("--monkeyocr-model", default="MonkeyOCR-pro-3B")
    ap.add_argument("--verify-script", type=Path, default=None)
    ap.add_argument("--skip-ocr", action="store_true")
    ap.add_argument("--skip-parsing", action="store_true")
    ap.add_argument("--clean", action="store_true")
    ap.add_argument("--report", type=Path, default=None)
    args = ap.parse_args()

    root = args.root.resolve()
    
    # Guard against nested paths
    if (root / "server" / "rag" / "phase1").exists():
        print("\n[ERROR] You passed a relative path while already inside the target folder.")
        print(f"        Resolved root became: {root}")
        print("        Please delete the nested 'server' folder and run: python smoke_test.py --root .\n")
        sys.exit(1)

    workdir = root / "_smoke_test"
    workdir.mkdir(parents=True, exist_ok=True)
    report = {"started_at": time.time(), "stages": {}}

    if not args.skip_bootstrap:
        print("\n=== Bootstrap ===")
        boot = bootstrap(root, args.pdf, force=False)
        report["bootstrap"] = boot
        for k in ("created", "skipped", "errors"):
            for line in boot[k]: print(f"  {k.upper():8s} {line}")

    print("\n=== MonkeyOCR ===")
    monkey = ensure_monkeyocr(root, args.monkeyocr_model, not args.no_download_weights)
    report["monkeyocr"] = monkey
    for k in ("ok", "warn", "fail"):
        for line in monkey[k]: print(f"  {k.upper():4s} {line}")
    monkeyocr_path = root / "MonkeyOCR"

    pdf = args.pdf.resolve() if args.pdf else root / "data" / SMOKE_GROUP / "sample.pdf"
    print("\n=== Preflight ===")
    pre = preflight(root, pdf)
    report["preflight"] = pre
    for k in ("ok", "warn", "fail"):
        for line in pre[k]: print(f"  {k.upper():4s} {line}")

    if pre["fail"]:
        report["overall"] = "FAIL"
        _write(report, args.report or workdir / "smoke_report.json")
        print("\n  OVERALL: FAIL (preflight)")
        return _finish(args, root, report)

    if not args.skip_ocr:
        print("\n=== Stage 1: OCR ===")
        try:
            dst = workdir / "phase1_ocr.smoke.ipynb"
            prepare_ocr_notebook(root / "phase1_ocr.ipynb", dst, root, args.limit, monkeyocr_path)
            ok, log = run_notebook(dst, workdir)
            report["stages"]["ocr"] = {"ok": ok, "log": log}
            print(f"  {'PASS' if ok else 'FAIL'} OCR")
            print("\n".join("    " + l for l in log.splitlines()[-15:]))
        except Exception as e:
            report["stages"]["ocr"] = {"ok": False, "error": repr(e), "trace": traceback.format_exc()}
            print(f"  FAIL OCR prep: {e!r}")

    if not args.skip_parsing:
        print("\n=== Stage 2: parsing ===")
        try:
            dst = workdir / "phase1_llm_parsing.smoke.ipynb"
            prepare_parsing_notebook(root / "phase1_llm_parsing.ipynb", dst, root, args.limit, args.pages)
            nb_ok, log = run_notebook(dst, workdir)
            out_ok, out_msg = check_parsing_output(root)
            ok = nb_ok and out_ok
            report["stages"]["parsing"] = {"ok": ok, "notebook_ok": nb_ok, "output_ok": out_ok, "output": out_msg, "log": log}
            print(f"  {'PASS' if ok else 'FAIL'} parsing — {out_msg}")
            print("\n".join("    " + l for l in log.splitlines()[-15:]))
        except Exception as e:
            report["stages"]["parsing"] = {"ok": False, "error": repr(e), "trace": traceback.format_exc()}
            print(f"  FAIL parsing prep: {e!r}")

    print("\n=== Stage 3: verify_extraction.py ===")
    ok, log = run_verify(root, args.verify_script)
    report["stages"]["verify"] = {"ok": ok, "log": log}
    print(f"  {'PASS' if ok else 'FAIL'} verify")
    if log: print("\n".join("    " + l for l in log.splitlines()[-15:]))

    all_ok = all(s.get("ok") for s in report["stages"].values())
    report["overall"] = "PASS" if all_ok else "FAIL"
    report["finished_at"] = time.time()

    print("\n=== Summary ===")
    for name, s in report["stages"].items(): print(f"  {name:8s} {'PASS' if s.get('ok') else 'FAIL'}")
    print(f"\n  OVERALL: {report['overall']}")
    
    if report['overall'] == "FAIL":
        explain_failure_with_ai(report)
        
    _write(report, args.report or workdir / "smoke_report.json")
    return _finish(args, root, report)

def _finish(args, root, report):
    if args.clean:
        cleanup(root)
        print("[smoke] smoke artifacts removed")
    return 0 if report["overall"] == "PASS" else 1

def _write(report, path):
    Path(path).write_text(json.dumps(report, indent=2, default=str))

if __name__ == "__main__":
    sys.exit(main())