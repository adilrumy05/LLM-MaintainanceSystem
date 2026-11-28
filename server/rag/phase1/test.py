#!/usr/bin/env python3
"""
install_test.py — dependency-install test ONLY (no MonkeyOCR, no weights, no notebooks).

Runs the exact same install logic as smoke_test.py (imported from it), then checks that
every key package imports, that torch + paddle can coexist in one process, that
`pip check` output is captured, and that a Jupyter kernel exists. A GPU is NOT required,
so it works on an AMD / Intel / CPU-only machine.

Put it next to smoke_test.py and requirements_cu12.txt / requirements_cu13.txt, then:

    python install_test.py --cuda 13          # test the cu13 profile (AMD box has no nvidia-smi)
    python install_test.py --cuda 12
    python install_test.py --cuda 13 --require-gpu     # on a real NVIDIA machine

Send back: _install_test/install_report.json  (and _install_test/pip_install.log if it failed)
"""
from __future__ import annotations
import argparse, json, platform, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import smoke_test as st          # noqa: E402  (reuses detect_cuda_major, build_install_steps, run_install_steps ...)

# Run INSIDE the venv; prints one JSON object. torch is imported before paddle on purpose
# (that is the order that triggers Windows DLL clashes, if there are any).
CHECK_SCRIPT = r'''
import importlib, json, sys, traceback
res = {"imports": {}, "info": {}}

def probe(label, module, ver_attr="__version__"):
    try:
        m = importlib.import_module(module)
        res["imports"][label] = {"ok": True, "version": str(getattr(m, ver_attr, "?"))}
        return m
    except BaseException as e:
        res["imports"][label] = {"ok": False, "error": f"{type(e).__name__}: {str(e)[:300]}"}
        return None

import os
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

# order matters: numpy first, then torch, then paddle, then opencv
probe("numpy", "numpy")
torch = probe("torch", "torch")
if torch is not None:
    try:
        res["info"]["torch_cuda_build"] = torch.version.cuda
        res["info"]["cuda_available"] = bool(torch.cuda.is_available())
        res["info"]["gpu"] = torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
    except BaseException as e:
        res["info"]["torch_info_error"] = repr(e)
probe("torchvision", "torchvision")
probe("torchaudio", "torchaudio")
probe("paddlex", "paddlex")
probe("cv2", "cv2")
probe("pymupdf", "pymupdf")
probe("bs4", "bs4")
probe("pandas", "pandas")
probe("transformers", "transformers")
probe("lmdeploy", "lmdeploy")
probe("qwen_vl_utils", "qwen_vl_utils")
probe("huggingface_hub", "huggingface_hub")
probe("openai", "openai")
probe("qdrant_client", "qdrant_client")
probe("pdf2image", "pdf2image")
probe("pypdfium2", "pypdfium2")
probe("accelerate", "accelerate")
probe("peft", "peft")
probe("nbformat", "nbformat")
probe("nbconvert", "nbconvert")
probe("ipykernel", "ipykernel")
if "--cu13" in sys.argv:
    probe("doclayout_yolo", "doclayout_yolo")
    probe("albumentations", "albumentations")

try:
    from jupyter_client.kernelspec import KernelSpecManager
    specs = KernelSpecManager().find_kernel_specs()
    res["info"]["kernelspecs"] = list(specs)
    res["imports"]["jupyter_kernel_python3"] = {"ok": "python3" in specs, "version": ",".join(specs)}
except BaseException as e:
    res["imports"]["jupyter_kernel_python3"] = {"ok": False, "error": repr(e)}

print("@@JSON@@" + json.dumps(res))
'''

# Imports that must succeed for the install test to pass; everything else is reported but advisory.
REQUIRED = ["numpy", "torch", "torchvision", "paddle_alone", "cv2", "pymupdf", "bs4", "pandas",
            "transformers", "nbformat", "nbconvert", "ipykernel", "jupyter_kernel_python3"]


def dll_order_tests(vpy: Path) -> dict:
    """On Windows, torch and paddle each bundle cublas64_12.dll. Whichever loads second can fail with
    WinError 127 if the CUDA minor versions differ. Test each import order in its own process."""
    cases = {
        "paddle_alone":      "import paddle; print(paddle.__version__)",
        "torch_alone":       "import torch; print(torch.__version__)",
        "torch->paddle":     "import torch, paddle; print('ok')",
        "paddle->torch":     "import paddle, torch; print('ok')",
    }
    out = {}
    for name, code in cases.items():
        r = subprocess.run([str(vpy), "-c", code], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=300, env=st._utf8_env())
        ok = r.returncode == 0
        out[name] = {"ok": ok, "version": r.stdout.strip()[-60:] if ok else "",
                     "error": "" if ok else (r.stderr.strip().splitlines() or ["?"])[-1][:400]}
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Install-only test (no MonkeyOCR)")
    ap.add_argument("--cuda", type=int, choices=(12, 13), default=None,
                    help="force a requirements profile (default: auto-detect from nvidia-smi)")
    ap.add_argument("--raw-requirements", action="store_true", help="install the file verbatim even on Windows")
    ap.add_argument("--require-gpu", action="store_true", help="fail unless torch.cuda.is_available()")
    ap.add_argument("--fresh", action="store_true", help="delete the test venv first")
    ap.add_argument("--torch-tag", default=None, help="override PyTorch wheel index tag, e.g. cu126 / cu128 / cu129 / cu130")
    ap.add_argument("--paddle-tag", default=None, help="override Paddle wheel index tag, e.g. cu126 / cu129 / cu130")
    ap.add_argument("--out", type=Path, default=HERE / "_install_test")
    args = ap.parse_args()

    out = args.out
    out.mkdir(parents=True, exist_ok=True)
    cuda_ver = args.cuda or st.detect_cuda_major()
    req_file = HERE / f"requirements_cu{cuda_ver}.txt"
    venv_path = HERE / f".venv_cu{cuda_ver}_{st.APP_NAME}_installtest"
    log_path = out / "pip_install.log"

    report = {
        "started_at": time.time(), "os": platform.platform(), "python": sys.version.split()[0],
        "cuda_profile": cuda_ver, "forced_profile": args.cuda is not None,
        "windows_filtered_install": st.IS_WIN and not args.raw_requirements,
        "stages": {},
    }
    print(f"\n[install_test] OS={report['os']}  Python={report['python']}  profile=cu{cuda_ver}")

    if not req_file.exists():
        print(f"[ERROR] missing {req_file}")
        return 1

    if args.fresh and venv_path.exists():
        import shutil
        shutil.rmtree(venv_path, ignore_errors=True)
    if not venv_path.exists():
        print(f"[install_test] creating venv {venv_path.name}")
        subprocess.run([sys.executable, "-m", "venv", str(venv_path)], check=True)
    vpy = venv_path / ("Scripts/python.exe" if st.IS_WIN else "bin/python")

    # ---- stage 1: pip install (same steps as smoke_test.py)
    steps = st.build_install_steps(req_file, cuda_ver, args.raw_requirements, out, args.torch_tag, args.paddle_tag)
    report["steps"] = [label for label, _ in steps]
    failed = st.run_install_steps(vpy, steps, log_path)
    report["stages"]["install"] = {"ok": failed is None, "failed_step": failed}
    if failed:
        tail = "\n".join(log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-40:])
        report["stages"]["install"]["log_tail"] = tail
        print(f"\n[FAIL] install stopped at step: {failed}\n{tail}")

    # ---- stage 2: imports (runs even after a failed install, to show what did land)
    print("\n[install_test] checking imports...")
    cmd = [str(vpy), "-c", CHECK_SCRIPT] + (["--cu13"] if cuda_ver == 13 else [])
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          timeout=600, env=st._utf8_env())
    payload = None
    for line in proc.stdout.splitlines():
        if line.startswith("@@JSON@@"):
            payload = json.loads(line[len("@@JSON@@"):])
    if payload is None:
        report["stages"]["imports"] = {"ok": False, "error": "check script crashed",
                                       "stderr_tail": (proc.stderr or "")[-1500:]}
        print("[FAIL] import check crashed:\n" + (proc.stderr or "")[-1500:])
    else:
        imps = payload["imports"]
        order = dll_order_tests(vpy)
        report["dll_order"] = order
        for k, v in order.items():
            imps[k] = {"ok": v["ok"], "version": v["version"], "error": v["error"]}
        if not (order["torch->paddle"]["ok"] or order["paddle->torch"]["ok"]):
            imps["torch_paddle_coexist"] = {"ok": False, "error": "neither import order works"}
            REQUIRED.append("torch_paddle_coexist")
        elif not (order["torch->paddle"]["ok"] and order["paddle->torch"]["ok"]):
            print("\n  NOTE: torch and paddle only coexist in ONE import order. "
                  "MonkeyOCR will fail if it imports them the other way round. "
                  "Match their CUDA tags (--torch-tag / --paddle-tag).")
        bad = [k for k in REQUIRED if not imps.get(k, {}).get("ok")]
        report["stages"]["imports"] = {"ok": not bad, "required_failed": bad,
                                       "details": imps, "info": payload["info"]}
        for k, v in imps.items():
            tag = "ok  " if v.get("ok") else ("FAIL" if k in REQUIRED else "warn")
            print(f"  {tag} {k:24s} {v.get('version') if v.get('ok') else v.get('error', '')}")
        info = payload["info"]
        print(f"\n  torch CUDA build: {info.get('torch_cuda_build')}  |  GPU available: {info.get('cuda_available')}  |  {info.get('gpu')}")

    # ---- stage 3: pip check (informational unless it reveals missing packages)
    chk = subprocess.run([str(vpy), "-m", "pip", "check"], capture_output=True, text=True,
                         encoding="utf-8", errors="replace")
    pc = (chk.stdout + chk.stderr).strip()
    report["stages"]["pip_check"] = {"ok": True, "informational": True, "output": pc[-3000:]}
    print(f"\n[install_test] pip check: {'clean' if chk.returncode == 0 else 'reported issues (see report; often expected for a freeze)'}")

    # ---- stage 4: GPU (only enforced with --require-gpu)
    gpu_ok = bool(report["stages"].get("imports", {}).get("info", {}).get("cuda_available"))
    report["stages"]["gpu"] = {"ok": gpu_ok or not args.require_gpu, "available": gpu_ok,
                               "enforced": args.require_gpu}

    report["overall"] = "PASS" if all(s.get("ok") for s in report["stages"].values()) else "FAIL"
    report["finished_at"] = time.time()
    (out / "install_report.json").write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")

    print("\n=== Summary ===")
    for name, s in report["stages"].items():
        print(f"  {name:10s} {'PASS' if s.get('ok') else 'FAIL'}")
    print(f"\n  OVERALL: {report['overall']}   report: {out / 'install_report.json'}")
    return 0 if report["overall"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())