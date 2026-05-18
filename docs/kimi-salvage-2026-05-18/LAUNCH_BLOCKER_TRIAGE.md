# Launch Blocker Triage — DeepSynaps Protocol Studio

**Document ID:** DS-OPS-TRIAGE-001  
**Version:** 1.0.0  
**Date:** 2026-05-17  
**Status:** Active — Launch Freeze Gate  
**Audience:** Engineering Lead, Safety Officer, Product Director, Executive Sponsor  
**Classification:** Production Readiness — Pre-GA Review

---

## 1. Triage Framework

All launch-blocking and post-launch issues are classified into four priority tiers using a five-dimensional scoring rubric. Every item must declare **Severity**, **Likelihood**, **Impact**, **Fix Effort**, and **Owner** before it can enter triage review.

### 1.1 Priority Definitions

| Priority | Label | Description | Resolution Window |
|----------|-------|-------------|-------------------|
| **P0** | **Launch Blocker** | System cannot launch GA without resolution. Safety, compliance, or data-integrity risk. | Must resolve before launch freeze lift. |
| **P1** | **Critical** | High operational risk if not resolved before GA. Workaround may exist but is not sustainable. | Fix before GA date or obtain written exception. |
| **P2** | **Important** | Material degradation in UX, performance, or maintainability. No immediate safety risk. | Fix within first 2 weeks post-launch. |
| **P3** | **Nice to Have** | Strategic capability, UX polish, or architectural enhancement. No production impact. | Backlog — schedule for next quarter. |

### 1.2 Scoring Dimensions

| Dimension | Scale | Description |
|-----------|-------|-------------|
| **Severity** | 1–5 | 1 = Cosmetic, 2 = Minor, 3 = Moderate, 4 = High, 5 = Critical |
| **Likelihood** | Rare / Unlikely / Possible / Likely / Almost Certain | Probability of occurrence in first 30 days of production |
| **Impact** | Negligible / Low / Medium / High / Critical | Business, clinical, legal, or reputational consequence |
| **Fix Effort** | Hours / Days / Weeks / Months | Estimated engineering time for complete fix |
| **Owner** | Role | Single accountable role (not team). See Escalation Path (Section 8). |

### 1.3 Priority Assignment Matrix

| Severity × Likelihood | Score | Priority Assignment |
|-----------------------|-------|---------------------|
| 17–25 (Critical × Almost Certain) | **P0** | Immediate launch block |
| 12–16 (High × Likely) | **P0/P1** | Safety Officer determines blocker status |
| 10–12 (Medium × Possible–Likely) | **P1** | Must resolve before GA |
| 5–9 (Low–Medium × Unlikely–Possible) | **P2** | Fix in first 2 weeks |
| 1–4 (Negligible × Rare) | **P3** | Backlog |

### 1.4 Project Context at Triage Time

| Metric | Value |
|--------|-------|
| Total PRs merged | 14 |
| Backend Python modules | 25 |
| FastAPI endpoints | 30+ |
| React frontend pages (DeepTwin) | 12 |
| Playwright E2E tests | 22 |
| RBAC roles | 5 (admin, clinic_admin, clinician, researcher, patient_access) |
| Clinic isolation | Enforced via `X-Clinic-ID` header on every query |
| Safety disallowed patterns | 13 (see `safety_governance.py:12–26`) |
| DB dialects supported | SQLite (dev) / PostgreSQL (production) |
| Optional cache layer | Redis with `_MockRedis` fallback |
| Materialized views | 2 (PostgreSQL only, SQLite fallback) |
| Beta operations docs | 14 covering feedback, incidents, risk, training |
| Total test suite | 465+ tests, 0 regressions |

---

## 2. P0 Launch Blockers

**Status: 5 open. Must all resolve before GA.**

These items represent existential risks to patient safety, data integrity, regulatory compliance, or production stability. Each has a direct code-level evidence anchor and a named owner. No P0 item may be downgraded without sign-off from the Safety Officer and Product Director.

| ID | Description | Evidence | Risk | Owner | ETA |
|----|-------------|----------|------|-------|-----|
| **B-001** | **Production DB guard must block SQLite in production.** The `validate_production_db()` function must raise `RuntimeError` when `DEEPSYNAPS_APP_ENV=production` and the database dialect resolves to SQLite. Any path that bypasses this guard would allow a dev-grade in-memory database to serve clinical traffic, destroying audit trail integrity and enabling cross-clinic data leakage. | `config.py:60–65` — `RuntimeError` raised explicitly when `env == "production"` and `db_url.startswith("sqlite")`. Unit test at `test_config.py:42–48` verifies the exception message. | **Severity: 5 / Likelihood: Unlikely / Impact: Critical** — Risk Score: 10. If bypassed: zero audit durability, no transaction integrity, no clinic isolation enforcement at DB level. | Engineering Lead | Launch Day −2 |
| **B-002** | **Demo seed must be blocked in production.** The demo data seeder must return `CRITICAL` warning and abort when `DEMO_MODE=true` coexists with `DEEPSYNAPS_APP_ENV=production`. Synthetic patient records in a production environment constitute data integrity violation and may trigger regulatory non-compliance. | `config.py:109–114` — Returns log level `CRITICAL` with message `"Demo seed blocked in production environment"`. Seed function returns early without executing `INSERT` statements. | **Severity: 5 / Likelihood: Possible / Impact: High** — Risk Score: 15. Synthetic PHI in production violates clinic trust and audit integrity. | Engineering Lead | Launch Day −3 |
| **B-003** | **All API outputs must include safety disclaimer.** Every response from the intelligence pipeline must carry the required safety disclaimer: *"DeepTwin provides decision support only and requires clinician review. It does not diagnose, prescribe, prove causality, or predict outcomes."* Missing disclaimers on any endpoint or component risk clinical misinterpretation and regulatory action. | `contracts.py:265` — `safety_disclaimer` field on `IntelligenceOutput` dataclass. `main.py:148` — FastAPI response interceptor appends disclaimer to all `IntelligenceOutput` serializations. `EvidenceLinksCard.jsx:118` — Frontend renders disclaimer banner on every evidence card. E2E test `safety-wording.spec.ts` verifies DOM presence. | **Severity: 4 / Likelihood: Possible / Impact: High** — Risk Score: 12. Regulatory exposure; each undisclosed response is a liability event. | Safety Officer | Launch Day −1 |
| **B-004** | **Confidence cap must enforce `< 0.95`.** No clinical interpretation may express confidence ≥ 0.95. The `MAX_CONFIDENCE = 0.95` constant in `safety_governance.py` must be applied to every insight via `apply_all()`. Visual layer hard-caps at 94% (`Math.min((h.confidence || 0) * 100, 94)%` in `RankedHypotheses.jsx:45`). Backend must reject or clamp any score ≥ 0.95 before serialization. | `safety_governance.py:31–57` — `MAX_CONFIDENCE = 0.95` declared at line 31; `apply_all()` enforces cap at line 48. `correlation_engine.py:148` caps at `min(0.94, round(raw_score, 4))`. `hypothesis_engine.py:25` sets `MAX_SCORE = 0.94`. | **Severity: 5 / Likelihood: Unlikely / Impact: Critical** — Risk Score: 10. Overconfident AI claims in clinical context can lead to treatment errors and liability. | Safety Officer | Launch Day −2 |
| **B-005** | **Clinic isolation must be active on every patient query.** Every database query for patient data must include `WHERE clinic_id = ?` filtering. The `AccessControl.enforce_clinic_isolation()` method must be called on every patient-scoped endpoint before query execution. Cross-clinic data leakage is a HIPAA-class violation. | `access_control.py:229–245` — `enforce_clinic_isolation()` verifies `X-Clinic-ID` header matches the patient's assigned clinic. Returns `403 Forbidden` on mismatch. `access_control.py:312` — All patient queries include `WHERE clinic_id = :clinic_id`. Test suite: 71 access-control tests covering all 5 roles. | **Severity: 5 / Likelihood: Rare / Impact: Critical** — Risk Score: 5. Single breach = regulatory incident + loss of clinic trust. | Engineering Lead | Launch Day −2 |

### P0 Resolution Sign-Off Requirements

| ID | Verification Steps | Sign-Off Roles |
|----|--------------------|-----------------|
| B-001 | (a) Unit test passes with `DEEPSYNAPS_APP_ENV=production` + SQLite URL. (b) Integration test confirms app refuses startup. (c) Code review confirms no alternate code path bypasses guard. | Engineering Lead + Safety Officer |
| B-002 | (a) Integration test confirms seed aborts in production. (b) Log output verifies `CRITICAL` level. (c) DB query confirms zero synthetic records. | Engineering Lead + Product Director |
| B-003 | (a) All 22 E2E tests pass with disclaimer assertion. (b) API response schema check confirms `safety_disclaimer` field non-empty on every `/synthesis`, `/correlations`, `/hypotheses` response. (c) Manual spot-check of all 12 DeepTwin pages. | Safety Officer + Product Director |
| B-004 | (a) `test_safety_governance.py` passes — confidence cap enforcement. (b) `test_correlation_engine.py` line 148 cap verification. (c) `test_hypothesis_engine.py` line 25 max score. (d) Frontend unit test: no rendered confidence ≥ 94%. | Safety Officer + Engineering Lead |
| B-005 | (a) All 71 `test_access_control.py` tests pass. (b) Penetration test: request with mismatched `X-Clinic-ID` returns 403 for every patient endpoint. (c) SQL query log confirms `clinic_id` predicate on every patient query. | Engineering Lead + Safety Officer |

---

## 3. P1 Critical Items

**Status: 6 open. Must resolve before GA or obtain written exception signed by Product Director and Safety Officer.**

These items represent significant operational or safety risk that will degrade production reliability, observability, or recoverability if not addressed before GA. Each has a defined mitigation until resolved.

| ID | Description | Evidence | Risk | Owner | ETA |
|----|-------------|----------|------|-------|-----|
| **C-001** | **Redis cache requires load testing under clinic-scale traffic.** The Redis cache layer (`cache_service.py`) with 30-second TTL for clinic summaries and 60-second TTL for patient summaries has been validated for correctness (392 tests) but not for performance under concurrent clinic-scale load. The `_MockRedis` fallback handles single-threaded dev but may create memory pressure under production concurrency. | `cache_service.py:1–200` — `CacheService` class with `set_json()`/`get_json()`. `REDIS_CACHE_READINESS_AUDIT.md` Section 7 — graceful degradation path documented. PHI-safe key patterns verified. No load test results at >50 concurrent clinic sessions. | **Severity: 3 / Likelihood: Possible / Impact: Medium** — Risk Score: 9. Cache miss storm under launch load could degrade dashboard response times from <500ms to >5s. | Engineering Lead | GA + 5 days (or pre-launch exception) |
| **C-002** | **Materialized view refresh scheduling not yet configured.** Two materialized views (`mv_clinic_activity_summary`, `mv_patient_analyzer_counts`) are created on startup but rely on manual or external scheduled refresh. No cron job, systemd timer, or APScheduler background task is active. Stale views cause dashboard data to lag indefinitely. | `materialized_views.py:1–300` — `refresh_all()` method exists and works. `main.py:45–52` — startup hook creates views. `MATERIALIZED_VIEWS_PR_REPORT.md` Section 5 — refresh strategy documented as "Cron/systemd recommended every 15–30 min." `MATERIALIZED_VIEWS_PR_REPORT.md` Section 9 — APScheduler code snippet provided but not merged. | **Severity: 3 / Likelihood: Likely / Impact: Medium** — Risk Score: 9. Without scheduling, views go stale after first 15 minutes of clinic operation. Dashboard shows increasingly outdated counts. | Engineering Lead | GA + 3 days |
| **C-003** | **PostgreSQL connection pool tuning needs production validation.** Pool defaults (`POSTGRES_POOL_SIZE=10`, `POSTGRES_MAX_OVERFLOW=20`) are calibrated for dev/staging. Production load with 30+ endpoints, materialized view queries, and optional Redis operations may saturate 10 connections at clinic scale. | `POSTGRES_CONFIG_AUDIT.md` — recommends `POOL_SIZE=20`, `MAX_OVERFLOW=30`, `POOL_RECYCLE=1800` for production. Current source defaults to `POOL_SIZE=10`, `MAX_OVERFLOW=20`, `POOL_RECYCLE=3600`. No production load test at target concurrency. | **Severity: 3 / Likelihood: Possible / Impact: Medium** — Risk Score: 9. Pool exhaustion causes 500 errors on patient-facing endpoints. | Engineering Lead | GA + 7 days |
| **C-004** | **Audit log retention policy not yet defined.** The `audit_logger.py` module records every API call, consent change, and clinician review action. No retention policy (time-based or volume-based) is configured. In production, this table will grow without bound, impacting query performance and storage cost. | `audit_logger.py:1–150` — Inserts to `audit_log` table on every governed action. No `DELETE` or `ARCHIVE` routine exists. No `audit_log_retention_days` configuration variable. `BETA_RISK_REGISTER.md` R5 notes audit logging as mitigated but does not address retention. | **Severity: 3 / Likelihood: Likely / Impact: Medium** — Risk Score: 9. Unbounded table growth degrades DB performance within 90 days at clinic scale. | Product Director | GA + 14 days |
| **C-005** | **Backup and disaster recovery procedures not yet documented.** Production PostgreSQL data (patient records, audit logs, clinician reviews, consent decisions) has no documented backup schedule, restore procedure, or RTO/RPO targets. Clinic onboarding cannot complete without DR assurance. | No file exists at `docs/operations/backup-recovery.md`. No `pg_dump` or WAL archive scripts in repo. `CLINIC_ONBOARDING_CHECKLIST.md` references "confirm backup policy" but links to no document. | **Severity: 4 / Likelihood: Possible / Impact: High** — Risk Score: 12. Data loss event with no recovery path is a contractual and regulatory failure. | Product Director | GA + 10 days |
| **C-006** | **Rate limiting not yet implemented on public endpoints.** FastAPI application has no rate limiting middleware on any of the 30+ endpoints. Public-facing authentication endpoints and summary endpoints are exposed to brute-force and abuse without throttling. | `main.py:1–200` — No `SlowAPILimiter` or similar middleware imported. No `@limiter` decorators on endpoints. `requirements.txt` does not include `slowapi` or `fastapi-limiter`. | **Severity: 3 / Likelihood: Possible / Impact: Medium** — Risk Score: 9. Credential brute-force, endpoint abuse, or cache stampede possible without throttling. | Engineering Lead | GA + 7 days |

### P1 Mitigations Until Resolved

| ID | Interim Mitigation | Expiry |
|----|--------------------|--------|
| C-001 | `_MockRedis` fallback ensures zero-downtime cache degradation. TTL at 30–60s bounds stale data. Monitor dashboard response time; alert if p95 > 3s. | 14 days post-GA |
| C-002 | Manual refresh via `POST /api/v1/system/materialized-views/refresh` (admin role, gated). Status endpoint `GET /api/v1/system/materialized-views/status` shows last refresh time. Runbook: refresh every 15 min during business hours. | 7 days post-GA |
| C-003 | Set `POSTGRES_POOL_SIZE=20`, `POSTGRES_MAX_OVERFLOW=30` via environment variables on deployment. Monitor `pg_stat_activity` for wait events during launch week. | Immediate (config change) |
| C-004 | Manual `pg_dump` of `audit_log` table weekly. Store dumps in encrypted S3-equivalent with 90-day lifecycle. Alert when table exceeds 1M rows. | 30 days post-GA |
| C-005 | Cloud provider automated backups (if available) as interim. Document RTO ≤ 4h, RPO ≤ 1h targets in clinic SLA addendum. | 14 days post-GA |
| C-006 | Cloud WAF / load balancer rate limiting as interim. Restrict source IPs to clinic VPN ranges where possible. | 14 days post-GA |

---

## 4. P2 Important Items

**Status: 5 open. Target: resolve within first 2 weeks post-launch.**

These items degrade user experience, limit analytical capability, or introduce technical debt. None blocks launch or introduces safety risk.

| ID | Description | Evidence | Risk | Owner | ETA |
|----|-------------|----------|------|-------|-----|
| **I-001** | **Evidence link auto-refresh not yet implemented.** Evidence links (`EvidenceLink` dataclass) are populated at synthesis time and cached with the insight. External literature URLs may become stale (404, retraction) without automatic re-validation. | `contracts.py:111–121` — `EvidenceLink` has `url` field but no `last_validated_at`. `evidence_engine.py:80–120` — Link attachment is one-time at synthesis. No background re-validation job. `EVIDENCE_LINKS_ANALYZER_AUDIT.md` recommends auto-refresh but notes implementation deferred. | **Severity: 2 / Likelihood: Possible / Impact: Low** — Risk Score: 4. Stale evidence links reduce clinician trust but do not affect patient safety. | Engineering Lead | GA + 14 days |
| **I-002** | **Confounder ML enrichment deferred to post-launch.** The ConfoundEngine (`confound_engine.py`) detects confounders using rule-based heuristics. ML-based enrichment (e.g., predictive confounding score from patient history) was scoped out of Phase 3 and will improve detection sensitivity. | `confound_engine.py:1–100` — Rule-based detection with static category lists. No ML model integration point. `PHASE3_CONFOUND_ENGINE_DESIGN.md` Section 4 — ML enrichment marked "Phase 4." | **Severity: 2 / Likelihood: N/A / Impact: Low** — Risk Score: 3. Rule-based detection covers 80%+ of common confounders. ML enrichment improves recall, not required for safety. | Engineering Lead | GA + 21 days |
| **I-003** | **Additional materialized views for reporting deferred.** Two MVs exist (`mv_clinic_activity_summary`, `mv_patient_analyzer_counts`). Three additional views were identified in `MATERIALIZED_VIEW_CANDIDATE_AUDIT.md` for cohort-level reporting and temporal analytics but not implemented. | `MATERIALIZED_VIEW_CANDIDATE_AUDIT.md` — Lists 5 candidate views; 2 implemented. Remaining 3: `mv_cohort_outcome_summary`, `mv_temporal_gap_analysis`, `mv_evidence_coverage_by_clinic`. | **Severity: 2 / Likelihood: N/A / Impact: Low** — Risk Score: 3. Reporting queries will use live queries (slower but correct). Dashboards functional without additional MVs. | Engineering Lead | GA + 30 days |
| **I-004** | **Frontend performance budget not yet defined.** No explicit performance budget (bundle size, First Contentful Paint, Time to Interactive) is defined for the 12 DeepTwin pages. React+Vite build is not size-profiled. | `vite.config.js` — No `rollup-plugin-visualizer` or bundle analysis. No `performance-budget.json` or equivalent. Largest page (`SynthesisDashboard.jsx`) imports 6 heavy components without code splitting. | **Severity: 2 / Likelihood: Likely / Impact: Low** — Risk Score: 4. Large clinics on slow networks may experience >3s initial load. No safety impact. | Engineering Lead | GA + 14 days |
| **I-005** | **Accessibility audit (WCAG 2.1 AA) not yet completed.** The 12 DeepTwin pages and 30+ API-driven components have not been formally audited for WCAG 2.1 AA compliance. Screen reader compatibility, keyboard navigation, and color contrast are unverified. | `DEEPTWIN_SAFETY_AUDIT.md` Section 4 — Recommends keyboard shortcut and visual indicators as accessibility improvements. No axe-core or Lighthouse CI accessibility gates in build. `playwright.config.ts` — No accessibility test fixtures. | **Severity: 2 / Likelihood: Possible / Impact: Medium** — Risk Score: 6. Regulatory risk in jurisdictions requiring healthcare software accessibility. Reputational risk. | Product Director | GA + 21 days |

---

## 5. P3 Backlog

**Status: 4 items. No target date — schedule for next quarter planning.**

These are strategic capabilities that expand platform value but are not required for GA launch.

| ID | Description | Evidence | Risk | Owner | ETA |
|----|-------------|----------|------|-------|-----|
| **L-001** | **Multi-clinic federation.** Enable a single administrator to view aggregated analytics across multiple clinic tenants without compromising isolation. Requires federated query layer, cross-clinic consent framework, and aggregated audit trail. | `access_control.py:1–400` — Clinic isolation is single-tenant. No federation primitives. `BETA_RISK_REGISTER.md` R4 — Cross-clinic leakage is mitigated by strict isolation; federation requires re-architecture. | **Severity: 2 / Likelihood: N/A / Impact: Low** — Strategic roadmap item. | Product Director | Q+1 |
| **L-002** | **Advanced analytics dashboard v2.** Rich cohort analytics, trend detection, and comparative outcome views. Phase 3 dashboards are summary-only (counts + flags). | `SUMMARY_ENDPOINTS_AUDIT.md` — Endpoints return counts, not statistical analytics. `SynthesisDashboard.jsx` — Displays individual patient synthesis only. No cohort-level views. | **Severity: 2 / Likelihood: N/A / Impact: Low** — Competitive feature. | Product Director | Q+1 |
| **L-003** | **Patient mobile app.** iOS/Android companion app for patients to view their own synthesis results, provide feedback, and manage consent. | `access_control.py` — `patient_access` role exists and is tested. API endpoints support patient-scoped queries. No mobile client code in repo. | **Severity: 1 / Likelihood: N/A / Impact: Negligible** — Patient engagement feature. | Product Director | Q+2 |
| **L-004** | **LLM integration for natural language queries.** Allow clinicians to ask questions in natural language ("What biomarkers correlate with attention scores?") and receive structured, governed responses. | `safety_governance.py:12–26` — 13 disallowed patterns would need LLM-specific expansion. No LLM client code in repo. `PHASE3_MULTIMODAL_FUSION_DESIGN.md` — LLM marked as "future phase." | **Severity: 3 / Likelihood: N/A / Impact: Medium** — LLM introduces novel safety risks (hallucination, prompt injection) requiring dedicated governance layer. | Safety Officer | Q+2 |

---

## 6. Risk Heat Map

### 6.1 2 × 2 Likelihood × Impact Matrix

```
                    IMPACT
              Low          High
         ┌─────────────┬─────────────┐
    High │  P2 items    │  P0 blockers │
         │  I-001       │  B-001       │
         │  I-002       │  B-002       │
         │  I-003       │  B-003       │
         │  I-004       │  B-004       │
         │              │  B-005       │
         ├─────────────┼─────────────┤
    Low  │  P3 backlog  │  P1 critical │
         │  L-001       │  C-001       │
         │  L-002       │  C-002       │
         │  L-003       │  C-003       │
         │  L-004       │  C-004       │
         │              │  C-005       │
         │              │  C-006       │
         └─────────────┴─────────────┘
```

### 6.2 Heat Map with Risk Scores

| | **Impact: Low** | **Impact: High** |
|---|---|---|
| **Likelihood: High** | I-004 (Perf budget, score 4)<br>I-001 (Evidence refresh, score 4) | C-002 (MV refresh, score 9)<br>C-004 (Audit retention, score 9)<br>C-006 (Rate limiting, score 9) |
| **Likelihood: Low** | L-001 (Federation, score 2)<br>L-002 (Analytics v2, score 2)<br>L-003 (Mobile app, score 1)<br>L-004 (LLM, score 3)<br>I-002 (ML confound, score 3)<br>I-003 (MV reporting, score 3)<br>I-005 (WCAG, score 6) | B-001 (DB guard, score 10)<br>B-002 (Demo seed, score 15)<br>B-003 (Disclaimer, score 12)<br>B-004 (Confidence cap, score 10)<br>B-005 (Clinic isolation, score 5)<br>C-001 (Redis load, score 9)<br>C-003 (Pool tuning, score 9)<br>C-005 (Backup/DR, score 12) |

### 6.3 Summary Counts by Quadrant

| Quadrant | Count | Items | Priority Mix |
|----------|-------|-------|-------------|
| High Likelihood × Low Impact | 2 | I-001, I-004 | 100% P2 |
| High Likelihood × High Impact | 3 | C-002, C-004, C-006 | 100% P1 |
| Low Likelihood × Low Impact | 6 | L-001, L-002, L-003, L-004, I-002, I-003 | 67% P3, 33% P2 |
| Low Likelihood × High Impact | 8 | B-001, B-002, B-003, B-004, B-005, C-001, C-003, C-005 | 38% P0, 62% P1 |

---

## 7. Resolution Criteria per Priority

### 7.1 P0 — Launch Blocker Resolution

A P0 item transitions to **RESOLVED** only when **all** of the following conditions are met:

| # | Criterion | Verification Method |
|---|-----------|---------------------|
| 1 | Code change merged to `main` via PR with ≥ 1 approving review | GitHub PR merge log |
| 2 | Unit tests added or updated, ≥ 90% diff coverage | `pytest --cov` report |
| 3 | Integration tests pass in CI pipeline | CI build log (465+ tests, 0 failures) |
| 4 | E2E tests pass (if UI-affected) | Playwright report (22/22 tests) |
| 5 | Safety Officer sign-off (for safety-related blockers) | Sign-off in `LAUNCH_BLOCKER_TRIAGE.md` |
| 6 | Engineering Lead sign-off (for all blockers) | Sign-off in `LAUNCH_BLOCKER_TRIAGE.md` |
| 7 | No new warnings or errors in application logs | Log review at `INFO` level |

### 7.2 P1 — Critical Resolution

A P1 item transitions to **RESOLVED** when:

| # | Criterion | Verification Method |
|---|-----------|---------------------|
| 1 | Implementation merged and deployed to staging | CI/CD pipeline log |
| 2 | Functional verification test passes | Manual or automated test report |
| 3 | Interim mitigation removed or replaced by permanent fix | Deployment config diff |
| 4 | Owner signs off in weekly triage meeting | Meeting notes |

### 7.3 P2 — Important Resolution

A P2 item transitions to **RESOLVED** when:

| # | Criterion | Verification Method |
|---|-----------|---------------------|
| 1 | Implementation merged to `main` | GitHub PR merge log |
| 2 | Tests pass (unit or integration) | CI build log |
| 3 | Verified in staging or production | Manual check or automated smoke test |

### 7.4 P3 — Backlog Acceptance

A P3 item transitions to **ACCEPTED** (into product backlog) when:

| # | Criterion | Verification Method |
|---|-----------|---------------------|
| 1 | Item refined into user stories with acceptance criteria | Backlog ticket (Jira/Linear) |
| 2 | Effort estimated (story points or hours) | Sprint planning record |
| 3 | Priority assigned within backlog | Backlog ranking |

---

## 8. Escalation Path

### 8.1 Triage Decision Authority

| Level | Role | Authority | Escalation Trigger |
|-------|------|-----------|-------------------|
| **L1** | Engineering Lead | Can resolve P0 items (with Safety Officer co-sign for safety blockers). Can downgrade P1→P2 with Product Director agreement. | P0 unresolved 48h before launch. P1 unresolved at GA date. |
| **L2** | Safety Officer | Can block launch on any safety-related P0. Can escalate any item to P0 if patient safety risk identified. Can sign off on P0 safety resolutions. | Safety P0 unresolved 24h before launch. New safety risk discovered. |
| **L3** | Product Director | Can approve written exception for any P1 item. Can accept P2 items into post-launch backlog. Owns P3 backlog prioritization. | >2 P1 items unresolved at GA. Business risk of delay exceeds technical risk of launch. |
| **L4** | Executive Sponsor | Final authority on go/no-go decision. Can approve launch with known P0 exceptions in emergency (documented, time-bound, with remediation bond). | Multiple P0 unresolved at launch freeze. Regulatory or contractual deadline forces decision. |

### 8.2 Escalation Timeline

| Hours to Launch | Action Required |
|-----------------|-----------------|
| **T-72h** | All P0 items must show status "In Review" or "Resolved." Weekly triage meeting mandatory. |
| **T-48h** | Any open P0 triggers L1→L2 escalation (Engineering Lead → Safety Officer). |
| **T-24h** | Any open P0 triggers L2→L3 escalation (Safety Officer → Product Director). Go/No-Go meeting scheduled. |
| **T-12h** | Any open P0 triggers L3→L4 escalation (Product Director → Executive Sponsor). Written exception or launch delay decision required. |
| **T-0h** | Launch authorized only if: (a) all P0 resolved, OR (b) written exceptions signed by Executive Sponsor with remediation bond. |

### 8.3 Communication Protocols

| Channel | Purpose | Response Time |
|---------|---------|---------------|
| Slack `#launch-blockers` | Real-time P0 status updates | Immediate |
| Email `safety@deepsynaps.io` | Safety Officer notifications | ≤ 2 hours |
| Weekly Triage Meeting (Tues 09:00) | Priority review, exception requests | Synchronous |
| Launch Dashboard (Notion) | Status board for all P0–P3 items | Updated within 4h of any change |

---

## 9. Sign-Off Log

| Role | Name | Date | Status |
|------|------|------|--------|
| Engineering Lead | _________________ | ________ | ☐ Approved / ☐ Conditional / ☐ Blocked |
| Safety Officer | _________________ | ________ | ☐ Approved / ☐ Conditional / ☐ Blocked |
| Product Director | _________________ | ________ | ☐ Approved / ☐ Conditional / ☐ Blocked |
| Executive Sponsor | _________________ | ________ | ☐ Approved / ☐ Conditional / ☐ Blocked |

---

## 10. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-05-17 | Technical Documentation | Initial creation — 5 P0, 6 P1, 5 P2, 4 P3 items triaged |

---

*This document is a controlled artifact. All changes require PR review and sign-off from the Safety Officer. Reference: DS-OPS-TRIAGE-001*
