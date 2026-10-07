\# Test Register — Maintenance Copilot



Run history for the full automated test suite. Run everything at once with:



```powershell

powershell -ExecutionPolicy Bypass -File .\\run-all-tests.ps1

```



Logs are saved to `test-results\\run\_<timestamp>.txt` (git-ignored).



\## Latest run summary



| Area | Test ID range | Tests | Status | Tester | Date | Evidence |

|---|---|---|---|---|---|---|

| Backend (Jest) | BE-01 to BE-166 | 166 | Pass | Prince | 2026-09-26 | test-results/run\_2026-09-26\_11-42.txt |

| RAG (pytest) | RAG-01 to RAG-04 | 4 | Pass | Prince | 2026-09-26 | test-results/run\_2026-09-26\_11-42.txt |

| App (jest-expo) | APP-05 | 1 | Pass | Prince | 2026-09-26 | test-results/run\_2026-09-26\_11-42.txt |

| \*\*Total\*\* | | \*\*171\*\* | \*\*Pass\*\* | | | |



\## Candidate run — feat/sprint5-chat-ux (Feature B, before commit)

Run by Adil on 2026-09-30 in an isolated worktree: `HEAD` 263fa4b plus the uncommitted Feature B changes and new files (excluding `latest_prompt.txt` and the temporary `app/spike-select.jsx`). Installed with the commands in docs/SETUP.md Stage 4 (root `npm install --legacy-peer-deps`; `LLM-Mobile` `npm ci --legacy-peer-deps`).

| Area | Test ID range | Tests | Status | Tester | Date | Evidence |

|---|---|---|---|---|---|---|

| Backend (Jest) | BE-01 to BE-166 + quote reply (tests/endpoints/query.quote.test.js) | 177 | Pass | Adil | 2026-09-30 | 14/14 suites, console output |

| App (jest-expo) | APP-05, APP-B1-1 to APP-B4-4 | 16 | Pass | Adil | 2026-09-30 | 5/5 suites, console output |

| Bundles (expo export) | ios, android, web | 3 | Pass | Adil | 2026-09-30 | exit 0 for each platform |

| iPhone device checks (B0–B5 + regressions) | — | — | Pass (user-reported) | Adil | 2026-10-04 | User confirmed in chat: remaining iPhone checks done and working |

Feature B checkpoint verification, 2026-10-04: Codex independently re-ran the
backend (177 tests, 14 suites) and app (16 tests, 5 suites), all passing. Device
results above are the user's checks, not a simulator or automated device run.
The temporary selection screen and generated debug-prompt changes were excluded.

## Verified Feature B checkpoint — 2026-10-04

Exact local commit: `14bc965877675020454402d564f09b3554c27824`.
Codex installed dependencies in a fresh, detached verification checkout using
the documented root install and mobile clean install (offline cache), then ran:

| Area | Result | Evidence |
|---|---|---|
| Backend Jest | 177 tests, 14 suites passed | Exact-checkpoint console output |
| App jest-expo | 16 tests, 5 suites passed | Exact-checkpoint console output |
| Expo exports | iOS, Android, web passed | `expo export --platform all`, exit 0 |

No push was performed. The user's B iPhone verification is recorded above.

## Feature A candidate (response detail) — 2026-10-08

Uncommitted, on top of B checkpoint `14bc965`. Run by Adil in the working tree.

| Area | Result | Evidence |
|---|---|---|
| Backend Jest | 238 tests, 17 suites passed | Full suite, console output; includes tests/endpoints/query.detail.test.js and tests/unit/responseDetail.test.js |
| App jest-expo | 52 tests, 11 suites passed | Full suite, console output; APP-A1-1 to APP-A5-1 |
| Expo exports | iOS, Android, web passed | `expo export`, exit 0 for each platform |
| Live check | Several rounds through the real backend, local manual database | Results in docs/RESPONSE_DETAIL.md |
| Feature A iPhone checks | First pass 2026-10-08 found 3 defects (fixed); recheck pending | docs/RESPONSE_DETAIL.md |

The automated tests mock OpenAI and retrieval, so they do not show answer
quality. The live checks are a handful of questions; Brief answers have not been checked
line by line against the manual pages.



\## Test ID format



\- `BE-##` — backend (see tests/TEST\_DOCUMENTATION.md for details)

\- `RAG-##` — RAG service (server/rag/tests/test\_rag\_api.py)

\- `APP-##` — mobile app (LLM-Mobile/\_\_tests\_\_/)

\- `HF-##` — hands-free manual device tests (not yet run)

\- `DEP-##` — deployment smoke tests (not yet run)



\## How to add a run



After each `run-all-tests.ps1` run, add one row per layer to the table above with the date, your name, pass/fail, and the log file path.

