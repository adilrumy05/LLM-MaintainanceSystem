# Setup — new machine, BGE-M3 RAG

Full environment build for the Maintenance Copilot, including Andrei's BGE-M3
retrieval upgrade. Written for **Windows + PowerShell**.

If you only need to restart an existing setup, skip to [Stage 9](#stage-9--run-it).

## Where to run these commands

Two kinds of command in this guide, and mixing them up wastes an afternoon.

**Machine-wide — the working directory does not matter.** Run these from any
terminal, including the Windows Start menu:

- `wsl --status`, `wsl --install`
- `docker --version`, `docker info`, `docker run ... qdrant`
- the toolchain check in Stage 1, and every installer

**Project commands — must run from the repository root.** That is the folder
containing `server.js`, `start.bat` and the hidden `.git` directory — **not** the
folder you cloned it into. A typical mistake:

```
C:\...\FYP\                          <- the parent. git status fails here.
C:\...\FYP\LLM-MaintainanceSystem\   <- the repository root. Work here.
```

Get there, quoting the path if it contains spaces:

```powershell
Set-Location "C:\path\to\LLM-MaintainanceSystem"
```

Confirm you are in the right place before running anything else:

```powershell
Test-Path .\server.js, .\start.bat, .\.git    # expect: True True True
```

These commands create or read files relative to where you are —
`python -m venv .venv` in the wrong folder puts your virtual environment
somewhere random and `start.bat` will not find it:

- `git pull`, `git status`
- `npm ci`
- `python -m venv .venv`, `.\.venv\Scripts\Activate.ps1`
- `Copy-Item .env.example .env`
- `.\start.bat`

Two steps run from a **subdirectory**, and both say so where they appear:
`npm ci` for the app (from `LLM-Mobile`) and the ingestion scripts (from
`server\rag\ragPhase2`).

### Two things that catch people out

**`wsl --install` needs an Administrator terminal.** The VS Code integrated
terminal is not elevated, so it fails there with an access-denied error. Open
one properly: **Start → type "PowerShell" → right-click → Run as
administrator**, or press **Win+X** and choose *Terminal (Admin)*.

**After installing Python or Node, open a new terminal.** PATH changes do not
reach windows that were already open. A "the install did not work" report is
almost always a terminal that has been open the whole time.

---

## Stage 0 — Ask Andrei for four things

**Send this message now, then carry on with Stages 1–4 while you wait.** Nothing
in Stages 1–4 depends on his reply. Only the Python packages (Stage 5) and the
re-embedding (Stage 8) do.

### Why bother

The BGE-M3 pipeline works on exactly one machine right now: Andrei's. Every
version you guess instead of copy is a way for your setup to differ from the one
that demonstrably runs — and you will not find out until ingestion fails two
hours in. Four questions now saves that.

### Message to send him

> Setting up on a new laptop — two quick ones. On the machine where BGE-M3
> works, what do these say?
>
> ```powershell
> python --version
> docker ps -a --filter name=qdrant --format "{{.Image}}"
> ```

**Only the Python version is still outstanding.** Everything else this stage
originally asked for has been answered or resolved from the code itself.

### What came back

| Question | Status |
|---|---|
| `python --version` | **Still outstanding.** Ten-second answer — chase it. Meanwhile install 3.12 (Stage 1b). |
| Pinned requirements | **Answered by his push.** He committed `server/rag/ragPhase2/requirements.txt` — a full 88-package `pip freeze`, `torch==2.4.1` + `torch-directml==0.2.5.dev240914`. Use it (Stage 5). |
| Qdrant image + tag | **Answered by the code, not by him.** `vector_store.py` line 3 documents *"Qdrant 1.16.3"*, and the freeze pins `qdrant-client==1.19.0`. Stage 6 pins `qdrant/qdrant:v1.16.3`. |
| BGE-M3 model folder | **Not needed.** *"It auto downloads so it's fine."* Stage 8 pulls it from Hugging Face on first run (~2.2 GB). |

> **Worth noting how two of these were answered.** The pinned file and the Qdrant
> version were both sitting in the repository once the branch landed. When a
> teammate is slow to reply, the code often already knows — check before waiting.

### What is and is not blocked

| Stage | Blocked? |
|---|---|
| 1 — Python | Version preference only. Install 3.12 now, swap later if he says 3.11. |
| 1a — Docker / WSL2 | No |
| 2 — Pull the repo | No — **his BGE-M3 branch has landed** (`787ab88`) |
| 3 — Environment files | No |
| 4 — Node dependencies | No |
| 5 — Python packages | No — his pinned file is committed |
| 6 — Qdrant | No — version resolved to `v1.16.3` |
| 8 — Re-embedding | **Yes — needs `EXTRACTION_DIR`**, the corpus that lives on Google Drive |

**Only Stage 8 is genuinely blocked now**, and on the corpus rather than on
anything Andrei has to send. Everything through Stage 7 can be completed today.

---

## Stage 1 — Install the toolchain

### First, check what you already have

Paste this whole block into PowerShell. Anything that reports `MISSING` is what
you actually need to install:

```powershell
foreach ($t in 'node','npm','git','python','docker') {
  $v = $null
  if (Get-Command $t -ErrorAction SilentlyContinue) {
    $v = (& $t --version 2>&1 | Select-Object -First 1 | Out-String).Trim()
  }
  if     ($v -match '\d+\.\d+')    { "{0,-8} {1}" -f $t, $v }
  elseif ($t -eq 'python' -and $v) { "{0,-8} MISSING  <- Microsoft Store alias is hijacking it, see Stage 1b" -f $t }
  else                             { "{0,-8} MISSING" -f $t }
}
```

On a fresh machine this typically prints something like:

```
node     v24.18.0
npm      11.16.0
git      git version 2.55.0.windows.2
python   MISSING  <- Microsoft Store alias is hijacking it, see Stage 1b
docker   MISSING
```

The check deliberately treats a Store alias as `MISSING`. Without that, `python`
looks installed while every command against it fails — see [Stage 1b](#stage-1b--python).

| Tool | Why | Walkthrough |
|---|---|---|
| **Docker Desktop** | Runs Qdrant, the vector database | [Stage 1a](#stage-1a--docker-desktop) — **start this first**, it is the longest |
| **Python** | The RAG pipeline and FastAPI retrieval service | [Stage 1b](#stage-1b--python) |
| **Node.js + Git** | Backend, mobile app, source control | [Stage 1c](#stage-1c--nodejs-and-git) |
| **Expo Go** | Runs the app on your phone | [Stage 1d](#stage-1d--expo-go-on-your-phone) |

**Do them in that order.** Docker's WSL2 step needs a reboot, so starting it
first means the reboot happens while you are installing everything else.

Android Studio is **not** required — the app runs inside Expo Go.

---

## Stage 1a — Docker Desktop

Docker runs **Qdrant and nothing else** here. Node and FastAPI both run natively.
But Qdrant holds every embedding, and `start.bat` refuses to start without
Docker running, so it is not optional.

### Which installer: AMD64 or Arm64?

Check, don't guess:

```powershell
$env:PROCESSOR_ARCHITECTURE
```

| Output | Download | Typical machines |
|---|---|---|
| `AMD64` | **Docker Desktop for Windows — x86_64 / AMD64** | Any Intel or AMD laptop |
| `ARM64` | **Docker Desktop for Windows — Arm64** | Snapdragon X, ARM Surface devices |

> **`AMD64` does not mean "made by AMD".** It is the industry name for 64-bit
> x86, which AMD designed — an Intel laptop also reports `AMD64`. Pick the
> installer by this string, not by the badge on the lid.

Download from <https://docs.docker.com/desktop/install/windows-install/>.

### Prerequisite: WSL2

Docker Desktop uses WSL2 as its backend. Installing Docker without it gives a
confusing failure partway through setup, so do this **first**.

Check whether you already have it:

```powershell
wsl --status
```

*"The Windows Subsystem for Linux is not installed"* means you need it. In an
**Administrator** PowerShell:

```powershell
wsl --install
```

Then **reboot**. This installs WSL2 and a default Ubuntu distribution; on first
boot Ubuntu asks you to create a username and password. That account is
unrelated to Windows and Docker does not need it — any value is fine.

Verify after rebooting:

```powershell
wsl --status          # should report Default Version: 2
```

### Virtualisation must be on in BIOS

WSL2 needs hardware virtualisation. Confirm:

```powershell
(Get-CimInstance Win32_Processor).VirtualizationFirmwareEnabled
```

`True` means you are fine. `False` means enable it in BIOS/UEFI — look for
**SVM Mode** (AMD) or **Intel VT-x / Virtualization Technology** (Intel). This
is the single most common reason Docker Desktop refuses to install, and no
amount of reinstalling fixes it from inside Windows.

### Install and verify

1. Run the installer. Keep **"Use WSL 2 instead of Hyper-V"** ticked.
2. Reboot if prompted.
3. **Launch Docker Desktop from the Start menu.** Installing it does not start
   it, and it does not necessarily start on login. The whale icon in the system
   tray stops animating when the engine is ready — expect 30–60 seconds.
4. Accept the service agreement on first run.

```powershell
docker --version     # the CLI — answers even when the engine is stopped
docker info          # the ENGINE; start.bat runs exactly this check
docker run --rm hello-world
```

`docker run --rm hello-world` should end with *"Hello from Docker!"*.

> **`docker --version` working proves nothing.** The CLI is a separate
> executable from the engine and answers happily while Docker Desktop is shut
> down. `docker info` is the real test.

### "cannot find the file specified" — the daemon is not running

```
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine;
check if the path is correct and if the daemon is running:
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

This reads like a broken installation. It is not — it means **Docker Desktop is
not running**. That named pipe only exists while the engine is up. Launch Docker
Desktop, wait for the tray whale to settle, and retry.

To stop it recurring after every reboot: **Docker Desktop → Settings → General →
"Start Docker Desktop when you sign in"**.

### Should you enable start-on-login?

Know the price first. Measured with the engine up and **no containers running**:

| Process | Memory |
|---|---|
| `vmmemWSL` (the Linux VM) | ~2.2 GB |
| Docker Desktop UI + backend | ~0.8 GB |
| **Total idle** | **~3 GB** |

CPU is negligible when nothing is running — the cost is memory and a little
battery, not processing power.

**Leaving it off is the reasonable default.** You only need Docker when working
on the RAG side, and `start.bat` checks for it first and stops with a clear
message, so forgetting costs you one click rather than a debugging session.
Turn it on if you find that reminder annoying.

On a machine with 8 GB or less, definitely leave it off, and consider capping
WSL2 in `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
memory=6GB
processors=4
```

Apply with `wsl --shutdown`, then restart Docker Desktop.

### Where Docker Desktop actually installed

Recent versions may install **per user** rather than system-wide, which puts it
somewhere most guides do not mention:

| Install type | Location |
|---|---|
| Per user | `%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe` |
| System-wide | `C:\Program Files\Docker\Docker\Docker Desktop.exe` |

A per-user install also has **no `com.docker.service` Windows service** — that
is normal, not a fault. If you cannot find the app, this locates it:

```powershell
Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*,
                 HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\* |
  Where-Object DisplayName -like "*Docker*" |
  Select-Object DisplayName, DisplayVersion, InstallLocation
```

### Licensing

Docker Desktop is free for personal use, education, and small businesses. A
student FYP is comfortably inside that. Larger organisations need a paid
subscription — relevant only if this is ever deployed by the client.

### If Docker Desktop genuinely will not install

**Qdrant Cloud** needs no code changes — the pipeline already reads
`QDRANT_API_KEY` (`vector_store.py:83`, documented at `:21` as *"omit for local
Docker"*). Set two values in `.env`:

```ini
QDRANT_URL=https://<your-cluster>.cloud.qdrant.io:6333
QDRANT_API_KEY=<key>
```

Three trade-offs worth knowing before choosing this: re-embedding uploads
~2 GB of vectors over the network instead of to localhost, so it is markedly
slower; you stop matching Andrei's environment, which makes retrieval bugs
harder to reproduce; and the manuals leave your machine, which is worth a
moment's thought on a client-facing project.

---

## Stage 1b — Python

Runs the RAG pipeline and the FastAPI retrieval service.

### Which version

**3.12** unless Andrei's answer from Stage 0 says 3.11. **Never 3.13** — no
`torch==2.4.1` or `torch-directml` wheels exist for it, and pip fails with a
resolver error that reads like an unrelated problem.

### Install

1. Go to <https://www.python.org/downloads/windows/>.
2. Under the latest **3.12.x** release, download **Windows installer (64-bit)**
   — the `AMD64` build, same reasoning as Docker in Stage 1a.
3. Run it. On the **first screen**, before clicking anything else:
   - Tick **"Add python.exe to PATH"** ← the one that matters
   - Tick **"Install launcher for all users"** if offered
4. Choose **Install Now**.
5. If the final screen offers **"Disable path length limit"**, click it. Long
   nested paths under `models/` and `node_modules/` can otherwise fail.

### Verify

Open a **new** PowerShell window — PATH changes do not reach already-open ones:

```powershell
python --version      # expect: Python 3.12.x
pip --version
```

### If `python` says "Python was not found"

> *Python was not found; run without arguments to install from the Microsoft
> Store, or disable this shortcut from Settings > Apps > Advanced app settings >
> App execution aliases.*

**Check the boring cause first: is this terminal older than the install?** PATH
is captured when a process starts, so a terminal — or an editor, or anything
launched from it — that was already open will not see a newly installed Python.
This is by far the most common cause, and it happened during this very setup.

Close the terminal and open a new one. To fix an existing session without
restarting it:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [Environment]::GetEnvironmentVariable("Path","User")
python --version
```

**If a new terminal still fails**, then Python genuinely is not on PATH and the
Windows Store stub is answering instead. Check what is actually there:

```powershell
Get-Command python*.exe -All | Select-Object -ExpandProperty Source
[Environment]::GetEnvironmentVariable("Path","User") -split ';'
```

If you see only `...\WindowsApps\python.exe`, either:

- re-run the installer → **Modify → Advanced Options → Add Python to environment variables**, or
- **Settings → Apps → Advanced app settings → App execution aliases** → turn **off** `python.exe` and `python3.exe`.

If your real Python appears in PATH but the stub still wins, the stub is listed
**earlier** — order decides. Move the Python entries above `WindowsApps`.

---

## Stage 1c — Node.js and Git

Both are commonly already installed. Check before downloading anything:

```powershell
node --version    # v20 or newer
npm --version
git --version
```

### Node.js — only if missing

1. <https://nodejs.org> → **LTS** → **Windows Installer (.msi), 64-bit**.
2. Accept the defaults. npm is bundled; you do not install it separately.
3. Leave the *"Tools for Native Modules"* checkbox **unticked** — this project
   does not need it, and it pulls in a large Visual Studio toolchain.
4. Reopen PowerShell, then `node --version`.

### Git — only if missing

1. <https://git-scm.com/download/win> → **64-bit Git for Windows Setup**.
2. Accept the defaults. The one screen worth reading is *"Adjusting your PATH
   environment"* — keep the recommended **"Git from the command line and also
   from 3rd-party software"**.
3. Reopen PowerShell, then `git --version`.

Set your identity if this is a fresh machine, or commits will be rejected or
mis-attributed:

```powershell
git config --global user.name  "Your Name"
git config --global user.email "you@example.com"
```

---

## Stage 1d — Expo Go on your phone

The app runs inside Expo Go, so there is no Android Studio and no native build.

1. Install **Expo Go** from the App Store or Google Play.
2. Connect the phone to **the same network as the PC**.
3. After `start.bat` (Stage 9), scan the QR code in the Expo terminal window.

### Finding the right IP for `EXPO_PUBLIC_API_URL`

The phone reaches your laptop by LAN IP, so Stage 3 needs the correct one. Run
`ipconfig` and read the adapter that matches how you are connected:

| Connection | Adapter to read | Example |
|---|---|---|
| University Wi-Fi (SUTS / eduroam) | `Wireless LAN adapter Wi-Fi` | `172.17.120.52` |
| Phone hotspot (phone shares data) | `Wireless LAN adapter Wi-Fi` | `172.20.10.2` |
| Home Wi-Fi | `Wireless LAN adapter Wi-Fi` | `192.168.0.117` |
| Windows hotspot (PC shares its connection) | `Ethernet adapter Local Area Connection` | `192.168.137.1` |

**This changes every time you switch network.** When the app suddenly cannot
reach the backend, this is almost always why — re-run `ipconfig` and update
`LLM-Mobile\.env.local`.

> **University Wi-Fi often blocks device-to-device traffic**, so the phone
> cannot reach your laptop even with the right IP. If Expo Go connects but every
> query times out, switch both devices to a phone hotspot. Alternatively press
> **W** in the Expo terminal to run the app in a desktop browser, which
> bypasses the phone entirely and is usually enough for development.

---

## Stage 2 — Get the code

First, be in the repository root — not the folder you cloned it into:

```powershell
Set-Location "C:\path\to\LLM-MaintainanceSystem"
Test-Path .\server.js, .\start.bat, .\.git      # expect: True True True
```

> `fatal: not a git repository` means you are one level too high. Git searches
> the current folder and upwards, never down into subfolders.

```powershell
git status                       # confirm clean before pulling
git pull --ff-only origin main   # refuse to silently merge local work
```

Then confirm Andrei's BGE-M3 work is actually in your checkout:

```powershell
Select-String -Path server\rag\ragPhase2\*.py -Pattern "directml"
```

**No output means his branch has not landed yet. Stop here** — Stages 5 and 8
will not work against the old bge-base pipeline.

---

## Stage 3 — Environment files (there are two)

Expo reads environment variables from the **Expo project root**, not the repo
root, so one file cannot serve both halves.

```powershell
Copy-Item .env.example .env
Copy-Item LLM-Mobile\.env.example LLM-Mobile\.env.local
```

**`.env`** (repo root) — backend and RAG. Fill in `OPENAI_API_KEY` and
`EXTRACTION_DIR`. Every other value is pre-set for BGE-M3.

**`LLM-Mobile\.env.local`** — the app. One value:

```powershell
ipconfig    # take the IPv4 Address of your active adapter
```
Set `EXPO_PUBLIC_API_URL=http://<that IP>:8000/api`. Update it whenever your
network or IP changes.

> Everything prefixed `EXPO_PUBLIC_` is **embedded in the built app**. Never put a secret there.

### Two values worth understanding rather than copying

- `EMBED_DIM` moves **768 → 1024**. The vector size differs, so the existing collection cannot be reused — Stage 8 ingests into a *new* one.
- `EMBED_BATCH_SIZE` drops **64 → 4**. BGE-M3 is roughly 5× the parameters of bge-base; 64 will exhaust memory.

### Secrets that are files, not variables

`serviceAccountKey.json` is gitignored and lives in **one** place:

```
<repo root>/serviceAccountKey.json
```

All three consumers now read that single path — `server/config/firebaseAdmin.js`
and both `uploads/` scripts, which use `../serviceAccountKey.json`. **Do not put
a second copy in `uploads/`**; the scripts previously required one there, and
duplicating a private key means more chances one is committed and two copies to
rotate.

### Get it yourself rather than asking for it

A private key should not travel through chat. If you have access to the
`rbacfyp` Firebase project — anyone who has committed to this repo probably
does — mint your own in about thirty seconds:

1. <https://console.firebase.google.com> → project **rbacfyp**
2. ⚙️ **Project settings** → **Service accounts**
3. **Generate new private key** → Generate
4. Rename the download to `serviceAccountKey.json`, put it in the repo root

Generating a key does **not** invalidate existing ones, so nobody else's setup
breaks. If you lack console access, ask to be added to the project rather than
asking for the file — then the next person can self-serve too.

> **Rename it immediately.** Firebase Console downloads the key as something
> like `rbacfyp-firebase-adminsdk-ab12c-1234567890.json`. `.gitignore` now
> covers that pattern too, but the safe habit is to rename first.

Without the key the backend still runs — `firebaseAdmin.js` catches the missing
file and logs *"audit logging disabled"*. Queries work; the audit trail does not.

---

## Stage 4 — Node dependencies

Both lockfiles are committed, so use `npm ci` (reproducible) rather than
`npm install`:

```powershell
npm ci
Set-Location LLM-Mobile; npm ci; Set-Location ..
```

> **If root `npm ci` fails with `ERESOLVE`** mentioning `react-dom`, you are on
> a commit before the fix. Root `package.json` had `react-dom@^19.1.0`, which
> resolved to `19.2.5` and demanded `react@^19.2.5`, while `react` was pinned to
> `19.1.0` — an internally inconsistent lockfile. `react-dom` is now pinned to
> `19.1.0` to match. Either pull, or use `npm ci --legacy-peer-deps` to proceed.
>
> Worth knowing: the backend imports only `cors`, `dotenv`, `express`,
> `firebase-admin`, `multer` and `openai`. The `react`, `react-native` and
> `expo` entries in the **root** `package.json` are leftovers duplicating the
> mobile app and are not used by the server. Removing them is a sensible tidy-up
> for the team, but it is a bigger change than this fix.

---

## Stage 5 — Python dependencies

Andrei's pinned file is committed at **`server/rag/ragPhase2/requirements.txt`**
— note the path, it is not at the repo root.

Run from the **repository root**, so `.venv` lands in the right place:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r server\rag\ragPhase2\requirements.txt
```

Expect this to take several minutes and download well over a gigabyte — `torch`
alone is ~200 MB and pulls CUDA-adjacent libraries even on the CPU build.

If PowerShell blocks the activation script:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

Confirm the venv is active — the prompt gains a `(.venv)` prefix, and:

```powershell
python -c "import sys; print(sys.executable)"   # must be ...\.venv\Scripts\python.exe
```

### About that file

It is a full **88-package `pip freeze`** from Andrei's working machine, so every
transitive dependency is pinned exactly. The pins that matter:

```
torch==2.4.1              torch-directml==0.2.5.dev240914
torchvision==0.19.1       FlagEmbedding==1.3.2
transformers==4.44.2      sentence-transformers==3.0.1
qdrant-client==1.19.0     numpy==2.4.6
```

`torch-directml` builds against one exact torch version — mismatch it and you
silently drop to CPU, or the native extension fails to load outright.

> **It was committed as UTF-16.** PowerShell's `>` redirect writes UTF-16LE with
> a BOM, which git treats as a **binary file** — so nobody could review changes
> to it, and some `pip` versions choke on it. It has been converted to UTF-8.
> If you ever regenerate it, use
> `pip freeze | Out-File -Encoding utf8 <path>`, not `pip freeze > <path>`.

**These pins are verified working.** BGE-M3 loads on DirectML and produces both
dense and sparse vectors with exactly this set — see Stage 7, check 4.

> **Ignore the second, larger requirements file** if Andrei sends one. He later
> shared a ~250-package list containing TensorFlow, Streamlit, PyQt5, sqlmap,
> PyAutoGUI and Jupyter — a freeze of his **whole machine**, not the project
> venv. Its torch stack is identical to the committed file; six ML libraries
> differ (`sentence-transformers` 3.0.1 vs 5.2.0, `transformers` 4.44.2 vs
> 4.57.3, `FlagEmbedding` 1.3.2 vs 1.4.0, `qdrant-client` 1.19.0 vs 1.16.2,
> `numpy` 2.4.6 vs 2.0.0). Since the committed set demonstrably works, keep it.
> If embedding ever misbehaves, those six are the first place to look — bump
> them individually rather than adopting the whole freeze.

**Still treat it as a starting point.** When an import fails at Stage 8 or 9:

1. `pip install <the missing package>`
2. Add it to `server/rag/ragPhase2/requirements.txt`
3. Commit it

That is how the file becomes accurate — by being corrected on contact, rather
than by waiting for a perfect one that is not coming.

---

## Stage 6 — Qdrant

Idempotent: starts the existing container, creates it only if absent.

```powershell
if (docker ps -aq -f name=qdrant) {
    docker start qdrant
} else {
    docker run -d --name qdrant -p 6333:6333 -p 6334:6334 `
      -v qdrant_storage:/qdrant/storage qdrant/qdrant:v1.16.3
}
```

**Pin the tag.** `:latest` means a rebuild months from now silently changes the
engine underneath your index. The **named volume** keeps embeddings across
container restarts — without it, every `docker rm` costs a full re-ingest.

`v1.16.3` is not a guess: `vector_store.py` line 3 documents the pipeline as
targeting *"Qdrant 1.16.3"*.

> **Expect a version-mismatch warning, and leave it alone for now.**
>
> ```
> UserWarning: Qdrant client version 1.19.0 is incompatible with server version 1.16.3.
> ```
>
> The pinned freeze carries `qdrant-client==1.19.0` while the code documents a
> 1.16.3 server, so the client is three minor versions ahead of what it supports.
> **Ingestion and hybrid retrieval were both verified working with this pairing**
> — 3390 points, dense + sparse, correct results including exact model-code
> lookups.
>
> It is deliberately not "fixed" here. Silencing it means either upgrading the
> server (diverging from whatever Andrei runs, which he has not confirmed) or
> downgrading the client (diverging from the pinned requirements). Agree one with
> the team. If odd retrieval behaviour ever appears, this is the first suspect:
> run `qdrant/qdrant:v1.19.x` to match the client, then re-ingest.

Confirm what you actually got:

```powershell
Invoke-RestMethod http://localhost:6333/ | ConvertTo-Json -Compress
# {"title":"qdrant - vector search engine","version":"1.16.3",...}
```

Confirm it is up:

```powershell
Invoke-RestMethod http://localhost:6333/collections
```

---

## Stage 7 — Pre-flight gate

**Nothing is ingested or deleted until all five pass.** These are cheap; a
failure discovered after a wipe is not.

1. **Andrei's commit is present** — the `Select-String` from Stage 2 returns hits.
2. **The corpus exists and is complete** — see [Stage 8a](#stage-8a--get-the-corpus):
   ```powershell
   .\.venv\Scripts\python.exe server\rag\ragPhase2\verify_extraction.py
   ```
   Must print `OK - safe to ingest`. A raw file count proves nothing here —
   a half-extracted zip still has thousands of files.
3. **DirectML actually works on this GPU** — do not just import it, make it
   compute something:
   ```powershell
   .\.venv\Scripts\python.exe -c "import torch_directml as d; print(d.device(), d.device_count(), d.device_name(0))"
   .\.venv\Scripts\python.exe -c "import torch, torch_directml as d; dev=d.device(); a=torch.randn(512,512).to(dev); print(((a@a).cpu()).shape)"
   ```
   A successful import proves the package installed. Only the matmul proves the
   GPU path works. Discovering this fails *after* dropping a collection is the
   worst possible ordering.

   > Expect `privateuseone:0` as the device name — that is normal for DirectML,
   > not an error. `device_count()` above 1 just means both the discrete and
   > integrated GPUs are visible; device 0 is the discrete one.
   >
   > `torch` reporting `2.4.1+cpu` is also correct. DirectML supplies the GPU
   > backend, so the CPU build of torch is the right one — do not "fix" it by
   > installing a CUDA build, which would break the `torch-directml` pin.

4. **BGE-M3 loads and embeds.** This is the check that proves the whole stack,
   and it is the last cheap thing you can do before ingestion:
   ```powershell
   .\.venv\Scripts\python.exe -c @"
import sys, os; sys.path.insert(0, os.path.abspath('server/rag/ragPhase2'))
from dotenv import load_dotenv; load_dotenv()
from embedder import Embedder
v = Embedder().embed_query('compressor overheating fault code H27')
print('keys:', list(v.keys()))
print('dense dim:', len(v['dense']), ' sparse terms:', len(v['sparse']))
"@
   ```
   Expect `device=dml (active: dml)`, `dim=1024`, and **both** keys present:

   ```
   keys: ['dense', 'sparse']
   dense dim: 1024   sparse terms: 10
   ```

   `embed_query` returns a **dict, not a vector** — `dense` (1024 floats,
   L2-normalised) and `sparse` (term indices + weights). If `sparse` is missing
   or empty, the hybrid half is not working and the "better keyword search"
   improvement will not materialise, however healthy the collection looks.

   **First run downloads ~2.2 GB** and takes several minutes; afterwards the
   model loads from cache in about 10 seconds and a query embeds in under a
   second.

   > **Budget ~4.3 GB of disk**, not 2.2 GB. Without Windows Developer Mode the
   > Hugging Face cache cannot use symlinks and stores files twice. `models/` is
   > gitignored. Enabling Developer Mode before the first download halves it.
4. **Target collection and checkpoint directory are both set** (Stage 8).
5. **Whatever is already in Qdrant is disposable or backed up.**

If step 3 fails, set `DEVICE=cpu` in `.env`. Slower, always works.

---

## Stage 8a — Get the corpus

Ingestion reads pre-OCR'd text from `EXTRACTION_DIR`. That folder is **not in
the repository** — it lives on Google Drive:

<https://drive.google.com/drive/folders/1zTQbmkQfKo6K997Cd6ey0Uy5cP8fsQA2?usp=drive_link>

Download `content_extraction`, put it anywhere you like, and point
`EXTRACTION_DIR` at it. Andrei runs it straight from his Drive mount
(`G:\My Drive\RAG_OCRv1\content_extraction`); a downloaded copy works identically.

### Set the path with forward slashes

```ini
EXTRACTION_DIR=C:/Users/you/Downloads/content_extraction
```

Backslashes are the usual source of grief here. `python-dotenv` processes escape
sequences inside double quotes, so `"G:\My Drive\..."` mangles `\M`. If you must
use backslashes, either double them (`G:\\My Drive\\...`) or leave the value
unquoted. **Forward slashes avoid the question entirely** — Python accepts them
on Windows.

### Verify the download before ingesting

A Drive download of a large folder fails in quiet ways: it arrives as split
zips, extracts one level too deep, or Windows truncates paths past 260
characters. Each produces a folder that looks fine and then yields nothing after
twenty minutes of ingestion.

```powershell
.\.venv\Scripts\python.exe server\rag\ragPhase2\verify_extraction.py
```

It walks the same tree the ingester expects and reports classification, document
group and page counts, flagging pages missing `processed_content.txt` or
`metadata.json`, over-long paths, and the double-nesting mistake. **Do not start
Stage 8 until it prints `OK - safe to ingest`.**

Expected layout:

```
content_extraction/
    {classification}/
        {document_group_id}/
            {filename_stem}/
                page_001/
                    processed_content.txt
                    metadata.json
                toc.json           (optional)
```

---

## Stage 8 — Re-embed into a new collection

The new model gets its **own collection and its own checkpoint**. The existing
768-dim collection keeps serving until the new one is validated, which makes
rollback a restart instead of a re-ingest.

```powershell
$env:QDRANT_COLLECTION = "text_chunks_bgem3"
$env:CHECKPOINT_DIR    = "./checkpoint_bgem3"
Set-Location server\rag\ragPhase2
python ingest_to_qdrant.py
Set-Location ..\..\..
```

First run downloads BGE-M3 (~2.2 GB) unless you copied Andrei's `models/bge-m3`.

> ### The checkpoint trap — read this before changing the collection
>
> `ingest_to_qdrant.py:332` skips any file already recorded in the checkpoint,
> and the key is `(document_group_id, filename_stem)` — **it contains no model
> or collection name**. Point a new collection at the old checkpoint and every
> file prints an ordinary-looking `SKIP (done @ ...)`, leaving the new
> collection **empty while the run reports success**. Always pair a new
> `QDRANT_COLLECTION` with a new `CHECKPOINT_DIR`.

Make the same two variables permanent in `.env` once you are happy.

### If you genuinely must wipe instead

`delete_qdrant.py` is **interactive and blunt**. It lists the collections,
prompts `Select collections (e.g. 1 2 3 or ALL)`, then requires you to type
`WIPE`. Critically, it deletes `checkpoint/ingest_checkpoint.json`
**unconditionally — even if you select no collections at all**, so the next
ingest restarts from zero with no resume.

Name the exact collection at the prompt. **Never type `ALL`.**

---

## Stage 9 — Run it

```powershell
.\start.bat
```

This launches FastAPI (8001), the Node backend (8000) and Expo in LAN mode. It
pre-checks Docker and the three ports first.

`start.bat` uses `.venv\Scripts\python.exe` directly rather than bare `python`,
so it does not matter whether the venv is active in your shell. If `.venv` does
not exist it warns and falls back to system Python.

---

## Stage 10 — Verify the index is what it claims to be

Vector dimension proves the pipeline ran. It does **not** prove retrieval
improved.

```powershell
Invoke-RestMethod http://localhost:6333/collections/text_chunks_bgem3 |
  ConvertTo-Json -Depth 6
```

Confirm **both**:

- the dense vector size is **1024**, and
- a **sparse vector configuration exists**.

A 1024-dim collection with no sparse config means the sparse half never landed —
and sparse retrieval is the entire basis of the "better keyword search" claim.

Then prove retrieval *uses* both: run an exact part-number or model-code query
that dense-only retrieval is known to miss, and confirm it comes back.

---

## Stage 11 — Retrieval acceptance set

Write **10–20 real questions** with the manual and page each should return. Run
them against the old and the new collection and compare.

Model codes and part numbers are exactly what sparse retrieval should improve,
so weight the set towards those. This doubles as the golden set the BGE-M3
quality gates in `docs/architecture/DECISIONS.md` already require.

Without this, "the new model is better" is an assertion, not a result.

---

## Stage 12 — Cutover and rollback

Both collections coexist, so switching is configuration, not migration.

| | Action |
|---|---|
| **Cut over** | Set `QDRANT_COLLECTION=text_chunks_bgem3` in `.env`, restart FastAPI, run the acceptance set. |
| **Roll back** | Set `QDRANT_COLLECTION=text_chunks_general`, restart FastAPI. Nothing to restore. |

**Do not delete the old collection** until the acceptance set has passed and the
team agrees. Deleting it turns a five-second rollback into a two-day re-ingest.

---

## Known blockers

**`EXTRACTION_DIR` points at a Google Drive mount.** On Andrei's machine it is
`G:\My Drive\RAG_OCRv1\content_extraction`. A new laptop has no `G:` drive, and
ingestion cannot run without those files. Either mount Google Drive for Desktop
so the letter matches, or copy the folder locally and repoint `EXTRACTION_DIR`.
This is a known reproducibility gap — see diagram **D4** in
`docs/architecture/`.

**Four helper modules used by the OCR phase live only on Google Drive** and are
not in the repository. They are not needed for Stages 1–12, but they are needed
to process a *new* manual.

**`data_information.csv` is not committed** and drives the Qdrant filter schema.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `pip` fails resolving `torch==2.4.1` | Python 3.13 | Uninstall, install 3.11/3.12 |
| `ModuleNotFoundError` on FastAPI start | System Python, not the venv | Use `.\start.bat`, or activate `.venv` first |
| Ingest prints `SKIP` for every file | Stale checkpoint | Set a new `CHECKPOINT_DIR` |
| New collection is empty but run "succeeded" | Same as above | Same as above |
| Collection recreated, data lost | `EMBED_DIM` mismatch against an existing collection | Ingest into a new `QDRANT_COLLECTION` |
| App cannot reach the backend | IP changed, or the value is in the wrong file | Update `LLM-Mobile\.env.local`, not the root `.env` |
| Backend won't start: *"Missing credentials … set the `OPENAI_API_KEY`"* | **Fixed.** `transcribe.js` used to build the OpenAI client at import time, killing the whole server without a key. It is now built on first use | Pull. Voice transcription still needs the key, but only that one route |
| `npm test`: 4 of 8 suites fail on import | **Fixed** — same cause. The suite runs credential-free again, as `jest.config.js` promises | Pull; `npx jest` should show 8/8, 68 tests |
| Root `npm ci` fails with `ERESOLVE` on `react-dom` | **Fixed.** `react-dom` was `^19.1.0`, resolving to `19.2.5`, which needs `react@^19.2.5` while `react` was pinned `19.1.0`. Now pinned `19.1.0` | Pull, or `npm ci --legacy-peer-deps` on older commits |
| Qdrant unreachable | Docker Desktop not running | Start Docker, then `docker start qdrant` |
| Docker Desktop won't install | WSL2 missing | Admin PowerShell: `wsl --install`, reboot |
| Docker Desktop install fails after WSL2 | Virtualisation off in BIOS | Enable **SVM Mode** (AMD) / **VT-x** (Intel) |
| `docker info` says daemon not running | Docker Desktop installed but not launched | Start it, wait for the tray whale to settle |
| `npipe:////./pipe/dockerDesktopLinuxEngine ... cannot find the file specified` | Same thing — the engine is stopped, despite `docker --version` working | Launch Docker Desktop; enable *Start on sign in* |
| Cannot find `Docker Desktop.exe` under Program Files | Installed per-user | Look in `%LOCALAPPDATA%\Programs\DockerDesktop` |
| Downloaded the wrong Docker build | Assumed Arm vs AMD | `$env:PROCESSOR_ARCHITECTURE` — `AMD64` means x86-64, Intel included |
| DirectML device error | GPU unsupported | `DEVICE=cpu` |
| `.\.venv\Scripts\Activate.ps1` blocked | Execution policy | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` |
