# Load Testing Guide — DeepSynaps Protocol Studio

> **Version:** 1.0  
> **Owner:** Test Infrastructure Team  
> **Review cycle:** Quarterly or after every production incident

---

## 1. Purpose

This document describes the load-testing procedures, profiles, and
interpretation guidelines for the DeepSynaps Protocol Studio backend
API. Load tests are run against the **staging** environment and are
designed to:

1. Establish performance baselines for every release.
2. Detect latency regressions before they reach production.
3. Validate auto-scaling policies and circuit-breaker behaviour.
4. Provide SLO evidence for compliance and customer SLAs.

---

## 2. SLO Targets

| Metric | Target | Measurement |
|---|---|---|
| **P95 latency** | < 200 ms | Per-request response time (TTFB) |
| **P99 latency** | < 500 ms | Per-request response time (TTFB) |
| **Error rate** | < 0.1 % | HTTP 5xx + timeout fraction |
| **Throughput** | > 500 req/s | Sustained load profile |

These targets apply to the `gradual-ramp` and `sustained-load` profiles.
`spike-test` and `stress` profiles have intentionally relaxed error
budgets because they deliberately push the system past its comfort zone.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CI Runner (GitHub Actions)                                 │
│  └── locust -f tests/load/locustfile.py                     │
│       └── FastHttpUser ──► staging-api.deepsynaps.io        │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
            ┌──────────────┐    ┌──────────────┐
            │  FastAPI     │    │  PostgreSQL  │
            │  (apps/api)  │◄──►│  (RDS)       │
            └──────────────┘    └──────────────┘
                    │
                    ▼
            ┌──────────────┐
            │  Redis       │
            │  (ElastiCache)│
            └──────────────┘
```

**All traffic uses synthetic patient IDs** (`demo-pt-*`). No real PHI
is ever transmitted during load testing.

---

## 4. Test Profiles

### 4.1 `gradual-ramp` (default)

**When to use:** Weekly baselines, regression checks, pre-release gates.

**Shape:**
```
users
 75 │                    ┌──────┐
    │                 ┌──┘      └──┐
 25 │              ┌──┘             └───
  0 │──────────┘
    └───────────────────────────────────► time
      0    2    5    8    10 min
```

| Phase | Duration | Users | Purpose |
|---|---|---|---|
| Warm-up | 0–2 min | 0 → 25 | Verify cold-start behaviour |
| Ramp-up | 2–5 min | 25 → 75 | Gradual capacity build |
| Sustained | 5–8 min | 75 steady | Baseline measurement |
| Cool-down | 8–10 min | 75 → 0 | Graceful degradation check |

**Run:**
```bash
locust -f tests/load/locustfile.py \
  --config tests/load/load-test-config.yml \
  --host https://staging-api.deepsynaps.io
```

---

### 4.2 `sustained-load`

**When to use:** Memory-leak detection, connection-pool validation.

**Shape:** 100 users for 28 minutes of sustained load.

**Run:**
```bash
locust -f tests/load/locustfile.py \
  --config tests/load/load-test-config.yml \
  --host https://staging-api.deepsynaps.io \
  --users 100 --spawn-rate 10 --run-time 32m
```

**Watch for:**
- Gradual latency creep (indicates memory leak)
- Connection-pool exhaustion errors
- Redis memory growth

---

### 4.3 `spike-test`

**When to use:** Validate auto-scaling, circuit-breaker resilience.

**Shape:** Baseline 20 → sudden spike to 300 → recovery.

**Run:**
```bash
LOAD_PROFILE=spike-test locust -f tests/load/locustfile.py \
  --config tests/load/load-test-config.yml \
  --host https://staging-api.deepsynaps.io
```

**Watch for:**
- 503 / 504 errors during spike (acceptable briefly)
- Recovery time after spike subsides
- Auto-scaling event latency (CloudWatch / Fly metrics)

---

### 4.4 `endurance`

**When to use:** Monthly soak test, release-candidate validation.

**Shape:** 50 users for 4 hours.

**Run:**
```bash
LOAD_PROFILE=endurance locust -f tests/load/locustfile.py \
  --config tests/load/load-test-config.yml \
  --host https://staging-api.deepsynaps.io
```

---

### 4.5 `stress`

**When to use:** Find breaking point, capacity planning.

**Shape:** Start at 10 users, increase by 10 every 60 s until errors.

**Run:**
```bash
LOAD_PROFILE=stress locust -f tests/load/locustfile.py \
  --config tests/load/load-test-config.yml \
  --host https://staging-api.deepsynaps.io
```

---

## 5. User Scenarios

| User Class | Weight | Description |
|---|---|---|
| `APIHealthCheckUser` | 3 | `/health`, `/version`, `/openapi.json` |
| `AuthFlowUser` | 4 | Demo-login, refresh, forgot-password |
| `ProtocolGenerationUser` | 2 | CRUD on `/protocols`, evidence queries |
| `PatientDataAccessUser` | 5 | Patient dashboard, portal sessions, qEEG |
| `EvidenceQueryUser` | 3 | Evidence search, metrics, conditions |
| `MixedWorkloadUser` | 10 | Realistic mixed clinician workflow |

Weights are relative. In a 50-user run with the default profile, expect
roughly:
- 20 MixedWorkloadUser
- 10 PatientDataAccessUser
- 8 AuthFlowUser
- 6 APIHealthCheckUser + EvidenceQueryUser
- 4 ProtocolGenerationUser

---

## 6. Running Locally

### 6.1 Prerequisites

```bash
python -m venv .venv
source .venv/bin/activate
pip install locust==2.31.*
```

### 6.2 Against local API

Start the API first:
```bash
cd apps/api
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then run Locust:
```bash
locust -f tests/load/locustfile.py \
  --host http://127.0.0.1:8000 \
  --users 20 --spawn-rate 5 --run-time 2m --headless
```

### 6.3 Web UI (interactive)

```bash
locust -f tests/load/locustfile.py --host http://127.0.0.1:8000
# Open http://localhost:8089
```

---

## 7. Interpreting Results

### 7.1 Console output

At the end of every run Locust prints:

```
============================================================
  LOAD TEST SLO SUMMARY
============================================================
  Total requests : 45,231
  Errors         : 12 (0.03%)
  P95 latency    : 142.3 ms  (SLO: 200 ms)
  P99 latency    : 298.7 ms
  P95 SLO status : PASS
  Error SLO      : PASS
============================================================
```

### 7.2 CSV artifacts

Three files are written to `load-results/`:
- `run_stats.csv` — aggregate stats per endpoint
- `run_failures.csv` — detailed failure log
- `run_exceptions.csv` — stack traces for errors

### 7.3 HTML report

Open `load-results/report.html` in a browser for:
- Response-time distribution histograms
- Per-endpoint RPS charts
- Failure-rate timelines

---

## 8. CI Integration

The `.github/workflows/load-test.yml` workflow:

1. **Preflight** — Verifies `/health` on staging.
2. **Run** — Executes Locust headless with the selected profile.
3. **Parse** — Extracts P95 and error-rate from the log.
4. **Compare** — Diff against the stored baseline artifact.
5. **Notify** — Posts results to GitHub Step Summary + Slack.

### Failing the build on SLO breach

The `on_quitting` event hook in `locustfile.py` sets
`environment.process_exit_code = 1` when SLOs are breached. This
causes the GitHub Actions step to fail, blocking the pipeline.

---

## 9. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| High P95 on `/protocols` | N+1 query in evidence scoring | Check `EXPLAIN ANALYZE` on staging DB |
| Timeout on `/evidence/search` | Full-text index missing | Verify GIN index on `evidence_search_vector` |
| Connection errors during spike | Connection pool exhausted | Increase `DB_POOL_SIZE` in staging |
| Gradual latency creep | Memory leak in worker | Run `endurance` profile + heap profiling |
| 401 errors | Token expiry during long runs | Implement token refresh in `on_start` |

---

## 10. Synthetic Data Guarantee

All patient identifiers used in load tests are synthetic:

- `demo-pt-samantha-li`
- `demo-pt-elena-vasquez`
- `demo-pt-marcus-chen`
- `demo-pt-omar-haddad`
- `demo-pt-amelia-brown`
- `demo-pt-noah-patel`
- `demo-pt-sofia-kim`
- `demo-pt-lucas-martinez`

These match the demo fixtures baked into the API staging image.
No real patient data is ever used, transmitted, or persisted during
load testing.

---

## 11. Checklist — Before Adding a New Endpoint

- [ ] Add a `@task` method to the appropriate user class in `locustfile.py`
- [ ] Use a synthetic patient/protocol ID (never a real UUID)
- [ ] Set `name=` on the request for consistent CSV grouping
- [ ] Add an SLO override in `load-test-config.yml` if the endpoint
      is expected to be slower than the default 200 ms P95
- [ ] Run a local 2-minute test to verify the task works
- [ ] Update this document with the new endpoint description
