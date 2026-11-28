#!/usr/bin/env python3
"""
smoke_test.py — Phase 1 bootstrap + smoke test (Windows/Linux, CUDA 12/13).

Handles .venv creation, CUDA detection, dependency installation, MonkeyOCR
setup, and optional AI error diagnosis.

The requirements_cu*.txt files can stay as Colab `pip freeze` dumps: this
script filters out what cannot be installed from PyPI (nvidia-* wheels, triton
on Windows, torch/torchvision/torchaudio, paddlepaddle-gpu) and installs those
from their own wheel indexes instead.
"""

from __future__ import annotations
import argparse, importlib.util, json, os, re, shutil, subprocess, sys, time, traceback
import urllib.request
from pathlib import Path

# Windows consoles default to cp1252 and choke on emoji / non-ASCII log lines.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

SMOKE_GROUP = "smoke_test"
APP_NAME = "Maintaince-copilot"
IS_WIN = os.name == "nt"
SCRIPT_DIR = Path(__file__).resolve().parent

REQUIRED_FILES = {
    "data/data_information.csv":                     "CSV manifest",
    "scripts/general_processor.py":                  "helper script",
    "scripts/general_content_extractor.py":          "helper script",
    "scripts/html_table_converter.py":               "helper script",
    "phase1_ocr.ipynb":                              "OCR notebook",
    "phase1_llm_parsing.ipynb":                      "parsing notebook",
    # verify_extraction.py is checked separately (it may live in ../ragPhase2/)
}
LLM_ONLY_FILES = {"scripts/llm_table_normalizer.py": "LLM table normalizer (LLM mode only)"}
CSV_REQUIRED_COLUMNS = ["document_group_id", "filename", "classification"]

# Not in the Colab freeze but needed to run the notebooks locally.
EXTRA_PACKAGES = ["ipykernel", "nbformat", "nbconvert", "beautifulsoup4"]

PYPI = "https://pypi.org/simple"

# Known-good PyTorch stack for the cu130 index. cu130 wheels only exist for
# torch >= 2.9, so any older pin in a requirements_cu13.txt file is silently
# bumped to this triple before the torch reinstall step runs.
CU13_TORCH_DEFAULT = ("2.10.0", "0.25.0", "2.10.0")

# ============================================================ venv & deps

def detect_cuda_major() -> int:
    """Read the max CUDA version the driver supports from nvidia-smi.
    Handles both 'CUDA Version: 12.8' and newer 'CUDA UMD Version: 13.4'."""
    try:
        smi = subprocess.check_output(["nvidia-smi"], text=True, stderr=subprocess.STDOUT)
        m = re.search(r"CUDA\s+(?:UMD\s+)?Version:\s*(\d+)", smi)
        if m:
            return 13 if int(m.group(1)) >= 13 else 12
        print("[venv] WARNING: could not find a CUDA version in nvidia-smi output. Defaulting to CUDA 12.")
    except Exception:
        print("[venv] WARNING: could not run nvidia-smi (no NVIDIA driver?). Defaulting to CUDA 12.")
    return 12


def split_requirements(req_file: Path) -> dict:
    """Split a Colab-style freeze into what pip can install from PyPI and special cases."""
    out = {"torch": {}, "paddle": None, "rest": []}
    for line in req_file.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        name = re.split(r"[=<>!~ \[;]", s, maxsplit=1)[0].lower().replace("_", "-")
        if name in ("torch", "torchvision", "torchaudio"):
            m = re.search(r"==\s*([0-9][0-9.]*)", s)          # drop local tag like +cu130
            if m:
                out["torch"][name] = m.group(1).rstrip(".")
        elif name.startswith("nvidia-"):
            continue          # Linux-only; torch/paddle wheels bring the CUDA libs they need
        elif name == "triton" and IS_WIN:
            continue
        elif name == "paddlepaddle-gpu":
            out["paddle"] = s
        else:
            out["rest"].append(s)
    return out


def default_cuda_tags(cuda_ver: int, torch_ver: str) -> tuple[str, str]:
    """(torch_tag, paddle_tag). torch and paddle each ship their own cublas64_12.dll on Windows;
    if they are different CUDA minors (e.g. 12.8 vs 12.9) whichever is imported second fails with
    WinError 127. So pick matching tags whenever a matching pair exists."""
    try:
        mm = tuple(int(x) for x in torch_ver.split(".")[:2])
    except ValueError:
        mm = (0, 0)
    if cuda_ver >= 13 and mm >= (2, 9):
        return "cu130", "cu130"
    if mm >= (2, 8):
        return "cu129", "cu129"      # torch 2.8+ has cu129; paddle 3.3.0 has cu129 (Blackwell-capable)
    return "cu128", "cu129"          # torch <= 2.7 has no cu129 build -> unavoidable 12.8 vs 12.9 mismatch


def torch_index_for(cuda_ver: int, torch_ver: str, tag: str | None = None) -> str:
    if tag:
        return f"https://download.pytorch.org/whl/{tag}"
    return f"https://download.pytorch.org/whl/{default_cuda_tags(cuda_ver, torch_ver)[0]}"


def _cuda_wheel_version(ver: str, tag: str) -> str:
    """Return 'X.Y.Z+tag' unless the version already carries a local identifier."""
    ver = ver.strip()
    return ver if "+" in ver else f"{ver}+{tag}"


def _pip(venv_python: Path, args: list[str], log_fh) -> tuple[int, str]:
    """Run `python -m pip ...`, streaming output to the console and a log file."""
    cmd = [str(venv_python), "-m", "pip", *args]
    print("  $ " + " ".join(cmd[2:])[:160])
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace")
    captured: list[str] = []
    for line in proc.stdout:
        sys.stdout.write(line)
        log_fh.write(line)
        captured.append(line)
    proc.wait()
    return proc.returncode, "".join(captured[-200:])


def _torch_cuda_ok(venv_python: Path) -> bool:
    r = subprocess.run([str(venv_python), "-c",
                        "import torch,sys; sys.exit(0 if torch.cuda.is_available() else 1)"],
                       capture_output=True)
    return r.returncode == 0


def build_install_steps(req_file: Path, cuda_ver: int, raw: bool, work_dir: Path,
                        torch_tag: str | None = None, paddle_tag: str | None = None) -> list[tuple[str, list[str]]]:
    """Ordered pip steps for this OS / CUDA profile. Shared with install_test.py."""
    work_dir.mkdir(parents=True, exist_ok=True)
    spec = split_requirements(req_file)
    log_dir = work_dir
    args_raw = raw
    steps: list[tuple[str, list[str]]] = [("upgrade pip", ["install", "-q", "--upgrade", "pip"])]

    if args_raw:
        steps.append((f"{req_file.name} (verbatim)", ["install", "-r", str(req_file)]))
        steps.append(("extra notebook tools", ["install", *EXTRA_PACKAGES]))
        return steps

    # ---------------------------------------------------------------- CUDA 13
    if cuda_ver >= 13:
        # Sequenced install, validated on Windows + RTX Blackwell:
        #   1. misc packages          (lmdeploy/transformers may pull CPU torch)
        #   2. paddlepaddle-gpu cu130 (declares paddle's nvidia-* cu13 deps)
        #   3. paddlex                (after paddle, so it sees the right runtime)
        #   4. uninstall torch stack  (removes any CPU wheel step 1 pulled in)
        #   5. torch stack cu130      (torch+torchvision+torchaudio from one index)
        #   6. extra notebook tools
        #
        # torch/torchvision/torchaudio pins in the file are IGNORED when torch < 2.9
        # because there are no cu130 wheels for that line; CU13_TORCH_DEFAULT is used.
        paddlex_pin = None
        rest = []
        for p in spec["rest"]:
            if p.lower().replace("_", "").startswith("paddlex"):
                paddlex_pin = p
            else:
                rest.append(p)

        req_clean = log_dir / f"requirements_cu{cuda_ver}.filtered.txt"
        req_clean.write_text("\n".join(rest) + "\n")
        steps.append(("remaining packages", ["install", "-r", str(req_clean)]))

        if spec["paddle"]:
            ptag = paddle_tag or "cu130"
            pidx = f"https://www.paddlepaddle.org.cn/packages/stable/{ptag}/"
            steps.append((f"paddlepaddle-gpu ({ptag})", [
                "install", spec["paddle"], "--index-url", pidx, "--extra-index-url", PYPI]))

        steps.append(("paddlex", ["install", paddlex_pin or "paddlex"]))

        # Remove whatever torch-shaped package landed transitively (usually a CPU wheel).
        steps.append(("uninstall torch stack",
                      ["uninstall", "-y", "torch", "torchvision", "torchaudio", "triton"]))

        tv = spec["torch"]
        file_torch = tv.get("torch")
        try:
            torch_ok_for_cu130 = (
                file_torch is not None
                and tuple(int(x) for x in file_torch.split(".")[:2]) >= (2, 9)
            )
        except ValueError:
            torch_ok_for_cu130 = False

        if torch_ok_for_cu130:
            torch_ver = file_torch
            tv_ver = tv.get("torchvision") or CU13_TORCH_DEFAULT[1]
            ta_ver = tv.get("torchaudio") or CU13_TORCH_DEFAULT[2]
        else:
            if file_torch:
                print(f"[venv] cu130 has no wheels for torch {file_torch}; "
                      f"using {CU13_TORCH_DEFAULT[0]}.")
            torch_ver, tv_ver, ta_ver = CU13_TORCH_DEFAULT

        tag = torch_tag or "cu130"
        idx = f"https://download.pytorch.org/whl/{tag}"
        steps.append((f"torch ({tag})", [
            "install",
            f"torch=={_cuda_wheel_version(torch_ver, tag)}",
            f"torchvision=={_cuda_wheel_version(tv_ver, tag)}",
            f"torchaudio=={_cuda_wheel_version(ta_ver, tag)}",
            "--index-url", idx,
        ]))
        steps.append(("extra notebook tools", ["install", *EXTRA_PACKAGES]))
        return steps

    # ------------------------------------------------------- CUDA 12 / Linux
    if not IS_WIN:
        # Linux / Colab-like: install the requirements file exactly as tested, no filtering.
        steps.append((f"{req_file.name} (verbatim)", ["install", "-r", str(req_file)]))
        steps.append(("extra notebook tools", ["install", *EXTRA_PACKAGES]))
        return steps

    # Windows CUDA 12: keep every pinned version, but skip the Linux-only wheels pip
    # cannot install here (nvidia-*, triton) and fetch torch/paddle from their own indexes.
    tv = spec["torch"]
    if "torch" in tv:
        idx = torch_index_for(cuda_ver, tv["torch"], torch_tag)
        pkgs = [f"torch=={tv['torch']}"]
        if "torchvision" in tv: pkgs.append(f"torchvision=={tv['torchvision']}")
        if "torchaudio" in tv:  pkgs.append(f"torchaudio=={tv['torchaudio']}")
        steps.append((f"torch ({idx.rsplit('/',1)[-1]})", ["install", *pkgs, "--index-url", idx]))
    if spec["paddle"]:
        ptag = paddle_tag or default_cuda_tags(cuda_ver, tv.get("torch", "0"))[1]
        pidx = f"https://www.paddlepaddle.org.cn/packages/stable/{ptag}/"
        steps.append((f"paddlepaddle-gpu ({ptag})", ["install", spec["paddle"], "--index-url", pidx,
                                                     "--extra-index-url", PYPI]))
    req_clean = log_dir / f"requirements_cu{cuda_ver}.filtered.txt"
    req_clean.write_text("\n".join(spec["rest"]) + "\n")
    steps.append(("remaining packages", ["install", "-r", str(req_clean)]))
    steps.append(("extra notebook tools", ["install", *EXTRA_PACKAGES]))
    return steps


def align_cudnn(venv_python: Path, log_fh) -> None:
    """Windows: torch (torch/lib) and paddle (site-packages/nvidia/cudnn*) each ship the cuDNN 9 DLL set.
    cuDNN sub-libraries must match the main DLL exactly, so when the two copies differ (e.g. torch has
    9.10.2, paddle pins 9.9.0) the second library to load fails with WinError 127 on
    cudnn_engines_precompiled64_9.dll. Make paddle's copy match torch's.

    Auto-detects whether the profile uses nvidia-cudnn-cu13 (cu13) or nvidia-cudnn-cu12 (cu12)."""
    try:
        r = subprocess.run([str(venv_python), "-c",
                            "import torch;print(torch.backends.cudnn.version() or 0)"],
                           capture_output=True, text=True, timeout=300)
        v = int(r.stdout.strip().splitlines()[-1])
        if v < 90000:
            return
        want = f"{v // 10000}.{(v // 100) % 100}.{v % 100}"          # 91002 -> 9.10.2

        # Only one of these packages exists per profile; try cu13 first then cu12.
        for pkg_name in ("nvidia-cudnn-cu13", "nvidia-cudnn-cu12"):
            have = subprocess.run([str(venv_python), "-m", "pip", "show", pkg_name],
                                  capture_output=True, text=True)
            m = re.search(r"^Version:\s*(\S+)", have.stdout, re.M)
            if not m:
                continue
            if m.group(1).startswith(want + ".") or m.group(1) == want:
                log_fh.write(f"\n===== cuDNN already aligned ({pkg_name} {m.group(1)}) =====\n")
                return
            print(f"\n[venv] Aligning cuDNN ({pkg_name}): paddle copy is {m.group(1)}, "
                  f"torch uses {want}. Installing {pkg_name}=={want}.*")
            log_fh.write(f"\n===== align cuDNN {m.group(1)} -> {want}.* =====\n")
            rc, _ = _pip(venv_python, ["install", f"{pkg_name}=={want}.*", "--no-deps"], log_fh)
            if rc != 0:
                print(f"[venv] WARNING: could not align cuDNN ({pkg_name}); torch+paddle may not coexist.")
            return
    except Exception as e:
        log_fh.write(f"\nalign_cudnn skipped: {e!r}\n")


def run_install_steps(venv_python: Path, steps: list[tuple[str, list[str]]], log_path: Path) -> str | None:
    """Run the steps, streaming to console + log. Returns the failed step label, or None."""
    failed = None
    with open(log_path, "w", encoding="utf-8") as log_fh:
        for label, args in steps:
            print(f"\n[venv] Step: {label}")
            log_fh.write(f"\n===== {label} =====\n")
            rc, out = _pip(venv_python, args, log_fh)
            if rc != 0 and "-r" in args and ("ResolutionImpossible" in out or "conflicting dependencies" in out):
                # The requirements file is a full freeze: every transitive dependency is already
                # pinned to the combination that was tested. pip's resolver rejects freezes whose
                # metadata disagrees (e.g. numpy 1.26.4 vs opencv wanting numpy>=2) even though
                # they run fine, so install exactly those pins without re-resolving.
                print(f"\n[venv] Resolver conflict in '{label}'. Retrying with --no-deps to install your pins exactly as written...")
                log_fh.write(f"\n===== {label} (retry --no-deps) =====\n")
                rc, out = _pip(venv_python, [*args, "--no-deps"], log_fh)
                if rc == 0:
                    log_fh.write("\n===== pip check =====\n")
                    _, chk = _pip(venv_python, ["check"], log_fh)
                    # A Linux freeze lacks Windows-only deps (colorama, tzdata, pywin32, win32-setctime ...).
                    # Install only the packages reported as *not installed*, constrained to your pins so
                    # nothing already pinned (e.g. numpy) can move.
                    missing = sorted({m.group(1) for m in re.finditer(
                        r"requires ([A-Za-z0-9_.\-]+)(?:[<>=!~;][^,]*)?, which is not installed", chk)})
                    if missing:
                        cons = Path(log_path).parent / "pins.constraints.txt"
                        req_arg = args[args.index("-r") + 1]
                        cons.write_text(Path(req_arg).read_text())
                        print(f"[venv] Installing dependencies the freeze was missing: {', '.join(missing)}")
                        log_fh.write(f"\n===== missing deps: {missing} =====\n")
                        rc, _ = _pip(venv_python, ["install", *missing, "-c", str(cons)], log_fh)
            if rc != 0:
                # `pip uninstall -y X` returns non-zero if X isn't installed on some pip
                # versions; treat that as a no-op rather than a failed step.
                if args and args[0] == "uninstall" and (
                        "not installed" in out.lower()
                        or "skipping" in out.lower()
                        or "warning" in out.lower()):
                    print("  [venv] (nothing to uninstall for this step, continuing)")
                    log_fh.write("\n(no-op uninstall, continuing)\n")
                else:
                    failed = label
                    break
        if failed is None and IS_WIN:
            align_cudnn(venv_python, log_fh)      # non-fatal; see docstring
    return failed


def setup_venv_and_restart(root: Path, report_path: Path, args_raw: bool = False):
    """Detect CUDA, create a named .venv, install deps, and restart inside it."""
    if sys.prefix != sys.base_prefix:      # already inside a venv
        return

    cuda_ver = detect_cuda_major()
    venv_name = f".venv_cu{cuda_ver}_{APP_NAME}"
    venv_path = SCRIPT_DIR / venv_name
    print(f"\n[venv] Detected CUDA {cuda_ver}. Using environment: {venv_name}")

    if not venv_path.exists():
        print(f"[venv] Creating virtual environment at {venv_path}...")
        subprocess.run([sys.executable, "-m", "venv", str(venv_path)], check=True)

    venv_python = venv_path / ("Scripts/python.exe" if IS_WIN else "bin/python")
    marker = venv_path / ".smoke_install_ok"

    req_file = SCRIPT_DIR / f"requirements_cu{cuda_ver}.txt"
    if not req_file.exists():
        print(f"\n[ERROR] {req_file} is missing! Keep requirements_cu12.txt and requirements_cu13.txt next to smoke_test.py.")
        sys.exit(1)
    req_stamp = f"{req_file.stat().st_size}:{int(req_file.stat().st_mtime)}"

    # "import torch works" is not enough: PyPI torch on Windows is CPU-only.
    installed = marker.exists() and marker.read_text() == req_stamp and _torch_cuda_ok(venv_python)

    if not installed:
        log_dir = root / "_smoke_test"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / "pip_install.log"
        print(f"[venv] Installing dependencies from {req_file.name} (this will take several minutes)...")
        print(f"[venv] Full pip log: {log_path}")

        steps = build_install_steps(req_file, cuda_ver, args_raw, log_dir)
        failed = run_install_steps(venv_python, steps, log_path)

        if failed is None and not _torch_cuda_ok(venv_python):
            failed = "torch CUDA check"
            log_path.write_text(log_path.read_text(encoding="utf-8") +
                                "\ntorch installed but torch.cuda.is_available() is False "
                                "(wrong wheel, or GPU driver too old).\n", encoding="utf-8")

        if failed:
            tail = "\n".join(log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-40:])
            print(f"\n[ERROR] Install failed at step: {failed}. Log: {log_path}")
            report = {"started_at": time.time(), "overall": "FAIL",
                      "cuda_major": cuda_ver,
                      "stages": {"install": {"ok": False, "step": failed, "log": tail}}}
            _write(report, report_path)
            explain_failure_with_ai(report)
            sys.exit(1)
        marker.write_text(req_stamp)

    print(f"\n[venv] Environment {venv_name} ready. Restarting script inside it...\n")
    os.environ["SMOKE_TEST_VENV_ACTIVE"] = "1"
    proc = subprocess.run([str(venv_python), str(Path(__file__).resolve())] + sys.argv[1:])
    sys.exit(proc.returncode)

# ============================================================ git hygiene

def hide_from_git(root: Path):
    """Add generated folders to .git/info/exclude (local only; no tracked file is touched)."""
    def git(*a):
        return subprocess.run(["git", "-C", str(root), *a], capture_output=True, text=True)
    try:
        exclude = git("rev-parse", "--git-path", "info/exclude")
        prefix = git("rev-parse", "--show-prefix")
        if exclude.returncode != 0 or shutil.which("git") is None:
            return
        ex = Path(exclude.stdout.strip())
        if not ex.is_absolute():
            ex = (root / ex).resolve()
        pre = prefix.stdout.strip()
        entries = [f"/{pre}{p}" for p in ("MonkeyOCR/", "_smoke_test/", f"data/{SMOKE_GROUP}/",
                                          "output/", "checkpoint/", "content_extraction/")]
        ex.parent.mkdir(parents=True, exist_ok=True)
        existing = ex.read_text().splitlines() if ex.exists() else []
        new = [e for e in entries if e not in existing]
        if new:
            with open(ex, "a", encoding="utf-8") as f:
                f.write("\n# smoke_test.py generated folders\n" + "\n".join(new) + "\n")
    except Exception:
        pass

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
            if IS_WIN:
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

def _resolve_verify(root: Path, override: Path | None) -> Path | None:
    candidates = [override] if override else []
    candidates += [root / "verify_extraction.py", root.parent / "ragPhase2" / "verify_extraction.py"]
    for c in candidates:
        if c and c.exists(): return c
    return None

def preflight(root: Path, pdf: Path, verify_script: Path | None = None) -> dict:
    rep = {"ok": [], "warn": [], "fail": []}
    v = sys.version_info
    (rep["fail"] if v < (3, 10) else rep["ok"]).append(f"Python {sys.version.split()[0]}")

    for rel, desc in REQUIRED_FILES.items():
        p = root / rel
        (rep["ok"] if p.exists() else rep["fail"]).append(f"{desc}: {rel}" if p.exists() else f"Missing {desc}: {p}")

    verify = _resolve_verify(root, verify_script)
    if verify: rep["ok"].append(f"structural verifier: {verify}")
    else: rep["fail"].append("verify_extraction.py not found (looked in root and ../ragPhase2/; or pass --verify-script)")

    for rel, desc in LLM_ONLY_FILES.items():
        p = root / rel
        if p.exists(): rep["ok"].append(f"{desc}: {rel}")
        else: rep["warn"].append(f"{desc} not found (only needed for TABLE_PARSE_MODE='llm')")

    _check_csv(root, rep)

    monkey = root / "MonkeyOCR"
    if not (monkey / "parse.py").exists():
        rep["fail"].append(f"MonkeyOCR repo missing: {monkey}")
    elif not ((monkey / "model_weight").is_dir() or (monkey / "weights").is_dir()):
        rep["fail"].append(f"MonkeyOCR weights missing: {monkey / 'model_weight'} and {monkey / 'weights'}")
    else:
        rep["ok"].append(f"MonkeyOCR: {monkey}")

    # Really check the packages instead of assuming them.
    for label, mods in [("pymupdf", ("pymupdf", "fitz")), ("bs4", ("bs4",)), ("pandas", ("pandas",)),
                        ("nbformat", ("nbformat",)), ("nbconvert", ("nbconvert",)),
                        ("ipykernel", ("ipykernel",)), ("torch", ("torch",)), ("paddle", ("paddle",))]:
        if any(importlib.util.find_spec(m) for m in mods): rep["ok"].append(f"package: {label}")
        else: rep["fail"].append(f"package missing: {label}")

    try:
        import torch
        if torch.cuda.is_available():
            rep["ok"].append(f"CUDA: {torch.cuda.get_device_name(0)} (torch {torch.__version__}, CUDA {torch.version.cuda})")
        else:
            rep["fail"].append(f"CUDA not available (torch {torch.__version__}) — OCR requires a GPU build of torch")
    except ImportError:
        pass


        # torch and paddle must load in ONE process (MonkeyOCR uses both); import order matters on Windows
    if importlib.util.find_spec("torch") and importlib.util.find_spec("paddle"):
        for a, b in (("torch", "paddle"), ("paddle", "torch")):
            r = subprocess.run([sys.executable, "-c", f"import {a}, {b}"], capture_output=True,
                               text=True, timeout=300, env=_utf8_env())
            label = f"import order {a} -> {b}"
            if r.returncode == 0:
                rep["ok"].append(label)
            else:
                msg = (r.stderr.strip().splitlines() or ["?"])[-1][:200]
                # torch -> paddle is the order that has to work; the reverse is only a warning
                (rep["fail"] if a == "torch" else rep["warn"]).append(f"{label} failed: {msg}")

                
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

def _utf8_env(extra: dict | None = None) -> dict:
    env = {**os.environ, "PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8", **(extra or {})}
    # The notebooks call subprocess.run(["python", "parse.py", ...]); without this, "python" resolves
    # to the system interpreter (no torch/paddle) instead of the venv.
    venv_bin = str(Path(sys.executable).parent)
    env["PATH"] = venv_bin + os.pathsep + env.get("PATH", "")
    env["VIRTUAL_ENV"] = str(Path(sys.executable).parent.parent)
    return env

def run_notebook(nb_path: Path, workdir: Path, timeout: int = 1800) -> tuple[bool, str]:
    cmd = [sys.executable, "-m", "nbconvert", "--to", "notebook", "--execute", f"--ExecutePreprocessor.timeout={timeout}", "--output", nb_path.name, "--output-dir", str(workdir), str(nb_path)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=timeout + 60, env=_utf8_env())
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

def run_verify(root: Path, verify_script: Path | None) -> tuple[bool, str]:
    verify = _resolve_verify(root, verify_script)
    if verify is None: return False, "verify_extraction.py not found"
    env = _utf8_env({"EXTRACTION_DIR": str(root / "content_extraction")})
    try:
        proc = subprocess.run([sys.executable, str(verify)], capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=120, env=env)
    except subprocess.TimeoutExpired:
        return False, "verify_extraction.py timed out"
    return proc.returncode == 0, (proc.stdout + proc.stderr).strip()[-2000:]

# ============================================================ AI Copilot

def explain_failure_with_ai(report: dict):
    """If the test fails, ask an LLM to explain the error. Uses plain HTTPS so it
    also works before the venv (and the openai package) exists."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return

    print("\n[AI Copilot] Analyzing failure log to find a fix...")
    try:
        ctx = f"The following smoke test failed on a client PC ({sys.platform}, Python {sys.version.split()[0]}):\n"
        for stage, data in report.get("stages", {}).items():
            if not data.get("ok"):
                ctx += f"\nStage: {stage}\nLog Tail:\n{data.get('log', 'No log available')}\n"
                if data.get("error"):
                    ctx += f"Error: {data['error']}\n"
        body = json.dumps({
            "model": "gpt-4o-mini", "max_tokens": 300,
            "messages": [
                {"role": "system", "content": "You are an expert Python and DevOps assistant helping a non-technical user fix a RAG pipeline installation error. Look at the log tail provided and give 1-3 bullet points on exactly what they need to install or fix. Be concise and direct."},
                {"role": "user", "content": ctx},
            ]}).encode()
        req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body,
                                     headers={"Content-Type": "application/json",
                                              "Authorization": f"Bearer {api_key}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            text = json.loads(r.read())["choices"][0]["message"]["content"].strip()
        print("\n" + "=" * 60)
        print("AI COPILOT SUGGESTED FIX:")
        print(text)
        print("=" * 60 + "\n")
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
    ap.add_argument("--raw-requirements", action="store_true", help="install requirements_cu*.txt verbatim even on Windows")
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
    report_path = args.report or workdir / "smoke_report.json"

    hide_from_git(root)
    setup_venv_and_restart(root, report_path, args.raw_requirements)   # restarts inside the venv; install failures still write a report

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
    pre = preflight(root, pdf, args.verify_script)
    report["preflight"] = pre
    for k in ("ok", "warn", "fail"):
        for line in pre[k]: print(f"  {k.upper():4s} {line}")

    if pre["fail"]:
        report["overall"] = "FAIL"
        report["stages"]["preflight"] = {"ok": False, "log": "\n".join(pre["fail"])}
        _write(report, report_path)
        print("\n  OVERALL: FAIL (preflight)")
        explain_failure_with_ai(report)
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

    _write(report, report_path)
    if report["overall"] == "FAIL":
        explain_failure_with_ai(report)
    return _finish(args, root, report)

def _finish(args, root, report):
    if args.clean:
        cleanup(root)
        print("[smoke] smoke artifacts removed")
    return 0 if report["overall"] == "PASS" else 1

def _write(report, path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")

if __name__ == "__main__":
    sys.exit(main())