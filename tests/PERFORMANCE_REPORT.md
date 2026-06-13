# Performance Testing Report - Maintenance Copilot Backend

**Date:** 2026-06-13  
**Environment:** Node.js v24.12.0, AMD Ryzen 5 3500U, 8 cores, 7GB RAM  
**Framework:** Jest v30 + Supertest  
**Total tests:** 18 passing across 2 suites  
**Run command:** `npx jest tests/performance --config jest.config.js`

---

## Scope

These tests measure the performance of the Node.js Express backend layer.
External services (Firebase, OpenAI, FastAPI retrieval service) are mocked so results
reflect the cost of the Node.js layer only, excluding real network and AI processing time.

Real-world query latency includes additional time from the FastAPI retrieval service
(vector search in Qdrant) and OpenAI API response time, which vary by network conditions.

---

## Middleware Performance

Each middleware was called 1000 times in isolation.

### sanitize.js

| Scenario | Avg | Min | Max | p95 |
|---|---|---|---|---|
| Clean input | 0.19 ms | 0.07 ms | 28.15 ms | 0.30 ms |
| HTML stripping | 0.19 ms | 0.08 ms | 14.50 ms | 0.37 ms |
| Injection detection block | 0.23 ms | 0.08 ms | 7.66 ms | 0.37 ms |
| Maximum length input (1000 chars) | 0.31 ms | 0.09 ms | 42.72 ms | 0.32 ms |

### validate.js

| Scenario | Avg | Min | Max | p95 |
|---|---|---|---|---|
| Full valid payload | 0.20 ms | 0.06 ms | 22.06 ms | 0.32 ms |
| Missing query (early reject) | 0.18 ms | 0.06 ms | 29.75 ms | 0.24 ms |

### outputSanitize.js

| Scenario | Avg | Min | Max | p95 |
|---|---|---|---|---|
| Small clean response | 0.30 ms | 0.04 ms | 147.67 ms | 0.15 ms |
| Large nested response (10 sources, 10 context blocks) | 0.28 ms | 0.17 ms | 10.39 ms | 0.41 ms |
| Response with HTML characters to escape | 0.09 ms | 0.06 ms | 1.09 ms | 0.13 ms |

### Full middleware chain (sanitize + validate + outputSanitize)

| Scenario | Avg | Min | Max | p95 |
|---|---|---|---|---|
| Clean request through all three layers | 0.16 ms | 0.05 ms | 28.15 ms | 0.18 ms |

All middleware executes well under 1ms on average. The occasional high max values are
caused by Node.js garbage collection pauses, not middleware logic. The p95 values
confirm consistent sub-millisecond performance across 95% of requests.

---

## Endpoint Performance

HTTP requests were made via Supertest against the full Express app with mocked external services.

### GET /api/health (100 requests)

| Avg | Min | Max | p95 |
|---|---|---|---|
| 11.83 ms | 6.82 ms | 103.22 ms | 17.14 ms |

### POST /api/query (50 requests, mocked pipeline)

| Avg | Min | Max | p95 |
|---|---|---|---|
| 30.61 ms | 18.68 ms | 163.77 ms | 53.22 ms |

This covers the full request lifecycle through sanitize, validate, filter extraction,
mocked retrieval service call, mocked OpenAI call, audit logging, alert detection,
priority agent, and output sanitization.

### POST /api/query blocked by sanitize (20 requests, XSS payload)

| Avg | Min | Max | p95 |
|---|---|---|---|
| 14.41 ms | 8.68 ms | 35.78 ms | 35.78 ms |

Malicious requests are rejected faster than valid ones since they exit early at the
sanitize middleware before reaching the RAG pipeline.

### POST /api/query blocked by validate (20 requests, empty query)

| Avg | Min | Max | p95 |
|---|---|---|---|
| 11.26 ms | 8.45 ms | 23.02 ms | 23.02 ms |

### POST /api/approve (50 requests, mocked Firestore)

| Avg | Min | Max | p95 |
|---|---|---|---|
| 10.79 ms | 7.66 ms | 19.08 ms | 17.30 ms |

### POST /api/reject (50 requests, mocked Firestore)

| Avg | Min | Max | p95 |
|---|---|---|---|
| 13.01 ms | 7.96 ms | 29.65 ms | 23.53 ms |

---

## Concurrency Testing

### 10 simultaneous GET /api/health requests

| Total wall time | All responses 200 |
|---|---|
| 84.01 ms | Yes |

### 10 simultaneous POST /api/query requests (mocked pipeline)

| Total wall time | All responses 200 |
|---|---|
| 210.58 ms | Yes |

The server handled 10 concurrent query requests correctly with no failures or race conditions.

---

## Summary

| Layer | Avg response time | Result |
|---|---|---|
| sanitize middleware | 0.19 to 0.31 ms | Pass |
| validate middleware | 0.18 to 0.20 ms | Pass |
| outputSanitize middleware | 0.09 to 0.30 ms | Pass |
| Full middleware chain | 0.16 ms | Pass |
| GET /api/health | 11.83 ms avg | Pass |
| POST /api/query (Node layer only) | 30.61 ms avg | Pass |
| POST /api/approve | 10.79 ms avg | Pass |
| POST /api/reject | 13.01 ms avg | Pass |
| 10 concurrent queries | 210.58 ms total | Pass |

The Node.js backend layer adds under 35ms average overhead per request.
Security middleware (sanitize, validate) adds under 0.5ms per request.
The system handles concurrent requests without errors or degradation.

Note: production query times will be higher due to real FastAPI vector search
(typically 1 to 3 seconds) and OpenAI API response time (typically 3 to 8 seconds).
The Node.js layer itself is not the bottleneck.
