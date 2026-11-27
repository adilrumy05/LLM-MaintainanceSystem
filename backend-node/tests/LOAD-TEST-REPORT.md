# Load Test Report: `/api/query` under 20 Concurrent Users
 
**System:** LLM Maintenance Assistant (Node service → FastAPI retrieval + OpenAI `gpt-6-luna`)
**Endpoint:** `POST /api/query` (Railway deployment)
**Date:** 27 November 2026
**Environment:** Windows 11, PowerShell 7
 
---
 
## 1. Objective
 
Check whether the system serves **20 concurrent users** with zero failures (no non-200, no 429, no timeouts), a batch wall clock under 3 minutes, and find the concurrency ceiling.
 
## 2. Setup
 
| File (`backend-node/tests/endpoints/`) | Purpose |
|---|---|
| `warmup.ps1` | Sequential single-user queries to remove cold starts |
| `load20.ps1` | 20 concurrent queries (`ForEach-Object -Parallel -ThrottleLimit 20`) |
 
- 5 queries, round-robin, all scoped to `CS-S10TKH` (e.g. "how do I reset the compressor on a Panasonic CS-S10TKH after a fault?")
- Each user has a unique `userId` / `sessionId`, role `intermediate`
- Filter confirmed active in FastAPI logs (`model_number=CS-S10TKH`, 40 chunks / 30,062 chars retrieved)
## 3. Baseline (single user, warm)
 
| Path | Warm latency | Response size |
|---|---|---|
| Unfiltered | ~9.0–10.2 s | ~43 KB |
| Filtered (CS-S10TKH) | **16.6 s** | ~92 KB |
 
The filtered path is heavier because more chunks clear `score_min=0.5`.
 
## 4. Results (20 concurrent)
 
| Metric | Value |
|---|---|
| Success rate | 20/20 (100%) |
| 429s / timeouts | 0 / 0 |
| Wall clock | 116.7 s |
| Min | 23.1 s |
| Median (p50) | 72.2 s |
| Mean | 74.7 s |
| p95 | 114.7 s |
| Max | 116.6 s |
| Mean ÷ baseline | 4.5× |
| Throughput | ~10.3 req/min (0.171 req/s) |
| Parallel speedup | ~2.8× (16.6 s ÷ 5.84 s) |
 
## 5. Analysis
 
- Finish times form a **queue**, not a uniformly slow path: the first 5 finish within 40 s, the remaining 15 trickle out over the next ~78 s.
- Wall clock matches a ~3-way parallel model: 20 × 16.6 s ÷ 3 ≈ 111 s (actual 116.7 s).
- Identical "red LED" queries finished at 23 s and 101 s, so queue position matters more than query content.
## 6. Suspected bottlenecks
 
Use the `[TIMING]` log fields to confirm which one spikes:
 
| Field | Bottleneck if it spikes |
|---|---|
| `filtersMs` | `getKnownFilters()` has no cache and scrolls the full Qdrant collection on every request |
| `retrievalMs` | FastAPI embedding model serialising requests (~5.6 it/s) |
| `answerMs` | OpenAI TPM/RPM throttling |
| `stepsAndBriefMs` | Step-extraction call (still on `gpt-6-luna`) |
 
Also: `fs.writeFile(PROMPT_FILE_PATH, ...)` on every request is a shared-file race, so `latest_prompt.txt` reflects only the last request to finish.
 
## 7. Recommended fixes
 
| # | Change |
|---|---|---|
| 1 | Cache `getKnownFilters()` (5-min TTL) |
| 2 | Run embedding in a thread pool (`asyncio.to_thread`) |
 
## 8. Conclusion
 
> Twenty concurrent queries scoped to `panasonic_aircon_CS-S10TKH` completed with 100% success (zero 429s, zero timeouts) in 116.7 s. Mean latency was 74.7 s (p50 72.2 s, p95 114.7 s) against a 16.6 s single-user baseline, giving ~10.3 queries/min and ~2.8× parallel speedup. The system is correct and stable but capacity-limited by a shared bottleneck above ~3 concurrent requests.
 
## 9. Next steps
 
1. Re-run after fixes #1 and #4 and compare p50 / wall clock.
2. Run an unfiltered 20-user test to compare against the filtered path.
3. Run a 10-user probe to confirm the ~3-way ceiling.
4. Screenshot Railway logs within 7 days (Hobby plan retention) and cite timestamps.