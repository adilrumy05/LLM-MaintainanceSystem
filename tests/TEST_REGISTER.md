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



\## Test ID format



\- `BE-##` — backend (see tests/TEST\_DOCUMENTATION.md for details)

\- `RAG-##` — RAG service (server/rag/tests/test\_rag\_api.py)

\- `APP-##` — mobile app (LLM-Mobile/\_\_tests\_\_/)

\- `HF-##` — hands-free manual device tests (not yet run)

\- `DEP-##` — deployment smoke tests (not yet run)



\## How to add a run



After each `run-all-tests.ps1` run, add one row per layer to the table above with the date, your name, pass/fail, and the log file path.

