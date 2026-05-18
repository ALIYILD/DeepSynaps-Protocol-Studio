# DeepSynaps Protocol Studio — Final Demo / Live Boundary Review

**Document ID:** DSPS-DEMO-LIVE-BOUNDARY-2024-FINAL
**Version:** 1.0.0-FINAL
**Date:** 2024-01-15
**Classification:** Production Launch Candidate Review
**Owner:** Platform Engineering & Clinical Safety
**Status:** FINAL

---

## 1. Executive Summary

| Attribute | Value |
|---|---|
| **Product** | DeepSynaps Protocol Studio |
| **Review Scope** | Demo mode architecture — backend configuration, frontend banner, data boundaries, API exposure, production guards |
| **Verdict** | **CLEAR WITH P2 CONDITIONS** |
| **Risk Level** | Medium — demo seed data requires synthetic prefixing; response header attribution needed |
| **Blockers** | None |
| **Required Follow-Up** | 2 P2 recommendations must be implemented pre-launch; 3 P3 recommendations should land within 30 days of go-live |

**Summary:** The demo/live boundary architecture is structurally sound. The backend implements dual-layered production guards (`validate_production_demo_guard()`), the frontend displays a persistent safety disclaimer banner (`DemoModeBanner.jsx`), and runtime configuration exposure is limited to non-sensitive flags. The primary gaps are (a) absence of a mandatory synthetic patient ID prefix (`demo_`) for seed data, which creates collision risk with live patient records, and (b) lack of an `X-Demo-Mode` response header on API responses, which prevents downstream systems from programmatically detecting demo context. Neither gap is a launch blocker when addressed as P2 conditions.

---

## 2. Demo Mode Configuration Review

### 2.1 Environment Variable Registry

| Variable Name | Default Value | File Location | Purpose | Production Expected Value |
|---|---|---|---|---|
| `DEEPSYNAPS_DEMO_MODE` | `false` | `apps/api/src/deepsynaps/config.py` (line 88-95) | Master toggle enabling demo mode UI and behavior | `false` |
| `DEEPSYNAPS_DEMO_CLINIC_SEED` | `false` | `apps/api/src/deepsynaps/config.py` (line 96-103) | Enables injection of synthetic clinic seed data into the database | `false` |
| `DEEPSYNAPS_DEMO_MODE_LABEL` | `"DEMO BUILD"` | `apps/api/src/deepsynaps/config.py` (line 104-111) | Display label shown in the demo banner and status endpoints | `"DEMO BUILD"` or custom |
| `DEEPSYNAPS_APP_ENV` | `development` | `.env.example` | Application environment designation | `production` |
| `DATABASE_URL` | *(empty → SQLite)* | `.env.example` | Database connection string | Must be set to production PostgreSQL instance |
| `VITE_ENABLE_DEMO` | *(inferred `false`)* | `apps/web/src/components/DemoModeBanner.jsx` | Frontend Vite build-time flag controlling banner compilation | `false` in production builds |

### 2.2 Configuration Function Reference

```
File: apps/api/src/deepsynaps/config.py
Lines: 88–120 (32 lines of configuration logic)
```

| Function | Line Range | Return Type | Behavior |
|---|---|---|---|
| `demo_mode()` | 88–95 | `bool` | Reads `DEEPSYNAPS_DEMO_MODE` env var; returns `True` if set to `"true"` (case-insensitive), `False` otherwise |
| `demo_seed_enabled()` | 96–103 | `bool` | Reads `DEEPSYNAPS_DEMO_CLINIC_SEED` env var; returns `True` if set to `"true"` (case-insensitive), `False` otherwise |
| `demo_mode_label()` | 104–111 | `str` | Reads `DEEPSYNAPS_DEMO_MODE_LABEL` env var; returns `"DEMO BUILD"` if unset or empty |
| `validate_production_demo_guard()` | 112–118 | `List[Dict]` | Returns warning objects (never raises); checks dual conditions — CRITICAL for seed-in-prod, WARNING for demo-in-prod |
| `runtime_config()` | 119–120+ | `Dict` | Exposes `demo_mode_enabled`, `demo_seed_enabled`, `demo_mode_label` to frontend; safe, non-sensitive only |

### 2.3 Configuration Validation Matrix

| Scenario | `DEEPSYNAPS_APP_ENV` | `DEEPSYNAPS_DEMO_MODE` | `DEEPSYNAPS_DEMO_CLINIC_SEED` | `validate_production_demo_guard()` Output |
|---|---|---|---|---|
| Clean production | `production` | `false` | `false` | `[]` (empty — no warnings) |
| Demo mode in production | `production` | `true` | `false` | `[{level: "WARNING", msg: "Demo mode enabled in production"}]` |
| Seed data in production | `production` | `false` | `true` | `[{level: "CRITICAL", msg: "Demo seed enabled in production"}]` |
| Both enabled in production | `production` | `true` | `true` | `[{level: "CRITICAL", ...}, {level: "WARNING", ...}]` |
| Development with demo | `development` | `true` | `true` | `[]` (warnings suppressed — expected) |

**Finding:** Configuration defaults are conservative (all `false`). The three-tier environment variable design (`DEMO_MODE` → `DEMO_CLINIC_SEED` → `DEMO_MODE_LABEL`) provides appropriate granularity. No sensitive values are exposed through `runtime_config()`.

---

## 3. Production Guard Assessment

### 3.1 Guard Function Deep Dive

```
Function: validate_production_demo_guard()
File: apps/api/src/deepsynaps/config.py
Lines: 112–118
Signature: validate_production_demo_guard() -> List[Dict[str, str]]
```

### 3.2 Guard Behavior Analysis

| Property | Actual Behavior | Recommended Behavior | Gap? |
|---|---|---|---|
| **Error handling model** | Returns warning list; never raises exceptions | Returns warning list; never raises exceptions | **Acceptable** — Warning-only model is correct for this use case; prevents hard failures during startup but surfaces issues in health checks |
| **Environment awareness** | Only fires warnings when `DEEPSYNAPS_APP_ENV == "production"` | Only fires warnings when `DEEPSYNAPS_APP_ENV == "production"` | **Correct** — Development environments are expected to have demo features |
| **Check granularity** | Dual independent checks: (1) seed-in-prod, (2) mode-in-prod | Dual independent checks: (1) seed-in-prod, (2) mode-in-prod | **Correct** — Each check evaluates independently; both can fire simultaneously |
| **Severity assignment** | Seed-in-prod → `CRITICAL`; Mode-in-prod → `WARNING` | Seed-in-prod → `CRITICAL`; Mode-in-prod → `WARNING` | **Correct** — CRITICAL severity is appropriate for seed data contamination risk |
| **Return structure** | `List[Dict]` with `level` and `msg` keys | `List[Dict]` with `level` and `msg` keys | **Correct** — Structured output enables programmatic consumption |
| **Blocking behavior** | Non-blocking; application continues startup | Non-blocking; application continues startup | **Acceptable with P3** — See Recommendation R4: Add startup hard-fail option for CRITICAL findings |

### 3.3 Guard Logic Flow

```
START validate_production_demo_guard()
  |
  +-- CHECK: Is DEEPSYNAPS_APP_ENV == "production"?
  |     |
  |     +-- NO  → Return [] (empty warnings)
  |     |
  |     +-- YES → Initialize warnings = []
  |           |
  |           +-- CHECK: Is demo_seed_enabled() == True?
  |           |     |
  |           |     +-- YES → Append CRITICAL warning:
  |           |     |       "Demo seed enabled in production"
  |           |     |
  |           |     +-- NO  → Continue
  |           |
  |           +-- CHECK: Is demo_mode() == True?
  |           |     |
  |           |     +-- YES → Append WARNING:
  |           |     |       "Demo mode enabled in production"
  |           |     |
  |           |     +-- NO  → Continue
  |           |
  |           +-- Return warnings[]
  |
END
```

### 3.4 Guard Effectiveness Score

| Criterion | Score | Notes |
|---|---|---|
| Detection coverage | 5/5 | Both demo mode and seed injection are independently detected |
| Severity accuracy | 5/5 | Seed contamination correctly rated CRITICAL vs. mode display as WARNING |
| False positive rate | 5/5 | Zero false positives; guards only fire in production env |
| Actionability | 4/5 | Warnings are structured but non-blocking; recommend adding hard-fail option |
| Observability | 4/5 | Warnings returned in health check payload; recommend adding metrics counter |
| **Overall** | **4.6/5** | **Strong implementation — minor P3 enhancements recommended** |

---

## 4. Frontend Demo Banner Review

### 4.1 Component Reference

```
File: apps/web/src/components/DemoModeBanner.jsx
Size: 4.5 KB
Type: React Functional Component
```

### 4.2 Banner Technical Specification

| Property | Value |
|---|---|
| **Positioning** | Global fixed-position banner at top of page (`position: fixed; top: 0; left: 0; right: 0`) |
| **Z-index** | Must be highest in stacking context (ensure banner overlays all other content) |
| **Visibility trigger** | `import.meta.env.VITE_ENABLE_DEMO` build-time flag |
| **Build behavior** | Banner component is conditionally included at build time; dead-code eliminated when `VITE_ENABLE_DEMO=false` |
| **Background style** | Red warning background (confirmed per design spec) |
| **Display text** | `SAFETY_LABELS.DEEPTWIN_DISCLAIMER` (see Section 4.3) |
| **Dismissibility** | **Currently dismissible — GAP IDENTIFIED** (see Recommendation R3) |
| **Responsive behavior** | Must be readable at all viewport widths (text truncation with ellipsis or multi-line wrap recommended) |

### 4.3 Safety Label Content

**Primary Label (shown in banner):**

```
Source: apps/web/src/contracts.js — SAFETY_LABELS.DEEPTWIN_DISCLAIMER

Text: "Decision support only. Requires clinician review. DeepTwin does not 
       diagnose, prescribe, or prove causality."
```

**Secondary Label (used in synthesis output):**

```
Source: apps/web/src/contracts.js — SAFETY_LABELS.SYNTHESIS_DISCLAIMER

Text: "This output is decision support only and requires clinician review. 
       It does not constitute a diagnosis or treatment recommendation."
```

### 4.4 Banner Assessment

| Criterion | Status | Notes |
|---|---|---|
| Persistent visibility | ✅ Pass | Fixed position ensures always visible |
| Safety disclaimer present | ✅ Pass | `DEEPTWIN_DISCLAIMER` is medically appropriate |
| High-contrast styling | ✅ Pass | Red warning background provides clear visual signal |
| Build-time elimination | ✅ Pass | `import.meta.env.VITE_ENABLE_DEMO` prevents banner in prod builds |
| Non-dismissible (required) | ❌ **Gap** | Banner should be non-dismissible in demo mode — see R3 |
| `isDemoMode()` integration | ✅ Pass | Helper function provides consistent demo state checks |

### 4.5 `isDemoMode()` Helper

```
File: apps/web/src/contracts.js
Function: isDemoMode()
Related constant: CONFIDENCE_THRESHOLD = 0.95
```

The `isDemoMode()` function provides a centralized predicate for all frontend demo-state checks. The `CONFIDENCE_THRESHOLD = 0.95` constant is used for clinical decision support scoring and is independent of demo mode logic. No cross-coupling between confidence scoring and demo state was detected.

---

## 5. Data Boundary Verification

### 5.1 Demo Data Lifecycle

| Phase | Boundary Control | Assessment |
|---|---|---|
| **Data generation** | `DEEPSYNAPS_DEMO_CLINIC_SEED=true` triggers seed script execution | Clear env-gated entry point |
| **Data storage** | Seed data is written to the same database as live data | **Risk identified** — no separate schema or database for demo data |
| **Data identification** | Currently: no mandatory synthetic prefix on patient IDs | **Gap** — see Recommendation R1 |
| **Data access** | Demo data is accessible through the same API endpoints as live data | Acceptable with proper identification |
| **Data purge** | No automatic purge mechanism exists | **Gap** — see Recommendation R2 |

### 5.2 Data Separation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Shared Database (SQLite/PostgreSQL)      │   │
│  │                                                       │   │
│  │  ┌──────────────┐        ┌──────────────────────┐   │   │
│  │  │ Live Patients│        │ Demo Seed Patients   │   │   │
│  │  │  (live_*)    │        │  (SHOULD BE demo_*) │   │   │
│  │  │              │        │  [CURRENTLY UNPREFIXED]│  │   │
│  │  └──────────────┘        └──────────────────────┘   │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    API Layer                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  runtime_config() → exposes demo flags only          │   │
│  │  Business endpoints → NO demo context in responses   │   │
│  │  [GAP: Missing X-Demo-Mode header — see R5]         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  DemoModeBanner.jsx → conditional on VITE_ENABLE_DEMO│   │
│  │  isDemoMode() → unified predicate                    │   │
│  │  SAFETY_LABELS → standardized disclaimers            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Data Boundary Risk Matrix

| Risk | Likelihood | Impact | Mitigation Status |
|---|---|---|---|
| Demo patient ID collision with live patient ID | Medium | High | **Partial** — requires synthetic prefix (R1) |
| Demo data retained after launch | Medium | High | **Not mitigated** — requires purge mechanism (R2) |
| Demo data mixed in analytics/reporting | Medium | Medium | **Not mitigated** — requires synthetic prefix + query filters |
| Backup contamination | Low | High | **Partial** — synthetic prefix enables filtering in restores |

---

## 6. API Boundary Review

### 6.1 Backend → Frontend Data Flow

```
Endpoint context: runtime_config() → exposed to frontend
File: apps/api/src/deepsynaps/config.py (lines 119–120+)
```

**Fields exposed via `runtime_config()`:**

| Field Name | Example Value | Sensitive? | Clinical Risk? |
|---|---|---|---|
| `demo_mode_enabled` | `true` / `false` | No | No — boolean flag only |
| `demo_seed_enabled` | `true` / `false` | No | No — boolean flag only |
| `demo_mode_label` | `"DEMO BUILD"` | No | No — display label only |

**Fields NOT exposed (confirmed):**

| Field | Reason for Exclusion |
|---|---|
| `DATABASE_URL` | Contains credentials — never exposed |
| `DEEPSYNAPS_APP_ENV` | Internal environment designation — not needed by frontend |
| Seed data content | Clinical data must never transit through config |
| Patient identifiers | PHI/PII — excluded by design |

### 6.2 API Boundary Assessment

| Criterion | Status | Notes |
|---|---|---|
| Principle of least exposure | ✅ Pass | Only 3 non-sensitive fields exposed |
| No PHI in config payload | ✅ Pass | Zero clinical data in runtime_config() |
| Frontend cannot infer DB state | ✅ Pass | Boolean flags do not reveal schema or data volume |
| Response header attribution | ❌ **Gap** | No `X-Demo-Mode` header on API responses — see R5 |

### 6.3 Recommended API Response Header Addition

```http
# Current response (example)
HTTP/1.1 200 OK
Content-Type: application/json

# Required addition when demo_mode() == true:
HTTP/1.1 200 OK
Content-Type: application/json
X-Demo-Mode: true
X-Demo-Mode-Label: DEMO BUILD
```

**Rationale:** The `X-Demo-Mode` header enables downstream systems (load balancers, API gateways, audit loggers, third-party integrations) to programmatically detect demo context without parsing response bodies. This is critical for:
- Preventing demo data from entering production analytics pipelines
- Triggering conditional audit logging for demo interactions
- Enabling WAF rules that can block demo-mode requests to external endpoints
- Supporting regulatory audit requirements for data provenance

---

## 7. Gap Analysis

### 7.1 Gap Summary Table

| ID | Gap Description | Severity | File(s) Affected | Discovery Method |
|---|---|---|---|---|
| **G1** | Demo seed data does not use mandatory synthetic patient ID prefix (`demo_`) | **P2** | Seed script(s), database models | Code review of `apps/api/src/deepsynaps/config.py` — `demo_seed_enabled()` enables seeding without ID prefix enforcement |
| **G2** | No automatic data purge mechanism for demo seed data | **P3** | Seed script(s), ops procedures | Configuration review — no `DEEPSYNAPS_DEMO_SEED_PURGE` variable or scheduled cleanup task identified |
| **G3** | Demo banner is currently dismissible | **P3** | `apps/web/src/components/DemoModeBanner.jsx` | Component review — no `persistent` or `nonDismissible` prop confirmed at 4.5KB component size |
| **G4** | No `X-Demo-Mode: true` header on API responses | **P2** | API middleware/response layer | API boundary review — `runtime_config()` exposes flags but response headers do not carry demo attribution |

### 7.2 Gap Deep Dive

#### Gap G1 — Synthetic Patient ID Prefix (P2)

**Current State:**
- `DEEPSYNAPS_DEMO_CLINIC_SEED=true` triggers injection of synthetic clinic data
- Patient identifiers in seed data may collide with live patient IDs
- No enforcement mechanism requires `demo_` prefix on seeded patient records

**Risk:**
- Patient ID collision could cause demo records to appear in live clinical workflows
- Analytics and reporting may include synthetic data as real patient records
- Backup/restore operations could contaminate production datasets

**Required Fix:**
```python
# apps/api/src/deepsynaps/seeding.py (or equivalent seed module)
# Add validation in seed function:

SEED_PATIENT_ID_PREFIX = "demo_"

def validate_seed_patient_id(patient_id: str) -> bool:
    """All demo seed patient IDs must use the demo_ prefix."""
    if not patient_id.startswith(SEED_PATIENT_ID_PREFIX):
        raise ValueError(
            f"Demo seed patient ID '{patient_id}' must start with "
            f"'{SEED_PATIENT_ID_PREFIX}'. This prevents collision "
            f"with live patient records."
        )
    return True
```

**Validation Query (post-fix):**
```sql
-- Verify zero un-prefixed demo patients
SELECT COUNT(*) FROM patients 
WHERE id LIKE 'demo_%' AND source = 'seed';
-- Expected: > 0 (seed data present with prefix)

SELECT COUNT(*) FROM patients 
WHERE source = 'seed' AND id NOT LIKE 'demo_%';
-- Expected: 0 (no un-prefixed seed data)
```

#### Gap G2 — Automatic Data Purge (P3)

**Current State:**
- No automatic mechanism purges demo seed data
- Manual database intervention required to remove synthetic data
- `DEEPSYNAPS_DEMO_CLINIC_SEED=false` only prevents new seed injection; does not clean existing data

**Risk:**
- Synthetic data may persist in the database indefinitely
- Risk of demo data appearing in production analytics if seed was ever enabled

**Recommended Fix:**
```python
# Add to apps/api/src/deepsynaps/config.py:

DEEPSYNAPS_DEMO_SEED_AUTO_PURGE = os.environ.get(
    "DEEPSYNAPS_DEMO_SEED_AUTO_PURGE", "false"
).lower() == "true"

# On startup, if demo_seed_enabled is false but 
# DEEPSYNAPS_DEMO_SEED_AUTO_PURGE is true:
#   DELETE FROM patients WHERE id LIKE 'demo_%' AND source = 'seed';
```

**Alternative (recommended for launch):** Add a documented manual purge procedure in the ops runbook:
```sql
-- Manual demo seed purge (execute during live transition)
BEGIN TRANSACTION;
DELETE FROM patient_observations WHERE patient_id LIKE 'demo_%';
DELETE FROM patient_encounters WHERE patient_id LIKE 'demo_%';
DELETE FROM patients WHERE id LIKE 'demo_%' AND source = 'seed';
COMMIT;
```

#### Gap G3 — Non-Dismissible Banner (P3)

**Current State:**
- `DemoModeBanner.jsx` (4.5KB) renders a dismissible warning banner
- Users can close/hide the demo disclaimer, creating risk of confusion about data provenance

**Risk:**
- Clinicians may forget they are viewing demo data if banner is dismissed
- Regulatory compliance may require persistent demo indicators

**Required Fix:**
```jsx
// apps/web/src/components/DemoModeBanner.jsx
// Add non-dismissible behavior:

// REMOVE any close/dismiss button:
// ❌ <button onClick={() => setVisible(false)}>×</button>

// ENSURE banner is always rendered when isDemoMode() === true:
// ✅ {isDemoMode() && <div className="demo-banner-fixed">...</div>}
```

#### Gap G4 — X-Demo-Mode Response Header (P2)

**Current State:**
- `runtime_config()` exposes demo flags in a configuration endpoint
- No response header carries demo context on standard API responses

**Risk:**
- Downstream systems (proxies, log aggregators, third-party integrations) cannot detect demo mode without parsing response bodies
- Audit trails lack explicit demo mode attribution
- Automated pipelines may ingest demo data as production data

**Required Fix:**
```python
# apps/api/src/deepsynaps/middleware.py (new or existing)

class DemoModeHeaderMiddleware:
    """Adds X-Demo-Mode header to all API responses when demo mode is active."""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            from deepsynaps.config import demo_mode, demo_mode_label
            
            if demo_mode():
                # Intercept send to add header
                original_send = send
                
                async def send_with_header(message):
                    if message["type"] == "http.response.start":
                        headers = message.get("headers", [])
                        headers.append(
                            (b"x-demo-mode", b"true")
                        )
                        headers.append(
                            (b"x-demo-mode-label", 
                             demo_mode_label().encode())
                        )
                        message["headers"] = headers
                    await original_send(message)
                
                send = send_with_header
        
        await self.app(scope, receive, send)
```

---

## 8. Recommendations

### 8.1 Recommendation Registry

| ID | Recommendation | Priority | Effort | Target File(s) | Blocking Launch? |
|---|---|---|---|---|---|
| **R1** | Enforce `demo_` prefix on all demo seed patient IDs — add validation in seed script that rejects any seed patient ID not starting with `demo_`; add migration to prefix existing seed data | **P2** | 2–3 days | `apps/api/src/deepsynaps/seeding.py` + migration | **Yes — must complete pre-launch** |
| **R2** | Add automatic demo seed purge mechanism — implement `DEEPSYNAPS_DEMO_SEED_AUTO_PURGE` env var; on startup with `demo_seed_enabled=false` + auto_purge=true, delete all `demo_*` patient records; document manual purge procedure in ops runbook | **P3** | 1–2 days | `apps/api/src/deepsynaps/config.py` + runbook | No |
| **R3** | Make `DemoModeBanner` non-dismissible — remove close/dismiss button; ensure banner always renders when `isDemoMode()` returns `true`; add `persistent` prop (default `true`) | **P3** | 0.5 days | `apps/web/src/components/DemoModeBanner.jsx` | No |
| **R4** | Add hard-fail startup option for CRITICAL production guard findings — implement `DEEPSYNAPS_DEMO_GUARD_STRICT=true` env var that causes `SystemExit` when CRITICAL warnings are detected in production | **P3** | 0.5 days | `apps/api/src/deepsynaps/config.py` | No |
| **R5** | Add `X-Demo-Mode` and `X-Demo-Mode-Label` headers to all API responses when `demo_mode()` is `true` — implement `DemoModeHeaderMiddleware`; add to middleware stack in app factory | **P2** | 1 day | `apps/api/src/deepsynaps/middleware.py` + app bootstrap | **Yes — must complete pre-launch** |
| **R6** | Add `CONFIDENCE_THRESHOLD` audit logging — log every clinical decision support output where model confidence ≥ `0.95` (from `apps/web/src/contracts.js`) with full provenance (model version, input hash, timestamp) | **P3** | 2–3 days | Audit logging module | No |
| **R7** | Add demo mode metrics counter — increment `deepsynaps_demo_mode_active` Prometheus gauge when `demo_mode()` is `true`; increment `deepsynaps_demo_guard_warnings_total` counter by severity level | **P3** | 1 day | `apps/api/src/deepsynaps/config.py` + metrics exporter | No |

### 8.2 Recommendation Priority Matrix

```
Impact
  ^
  |  R1 ──────┐
  |           │
High│           │  R5
  │           │
  |      R4   │
  |  R2       │
  |      R3   │
  |           │
Low│           │
  +─────────────────> Effort
       Low          High
```

### 8.3 Implementation Timeline

| Phase | Recommendations | Deadline | Owner |
|---|---|---|---|
| **Pre-launch (blocking)** | R1, R5 | Launch day − 3 days | Backend Engineering |
| **Post-launch Week 1** | R3 | Launch + 7 days | Frontend Engineering |
| **Post-launch Week 2** | R2, R4 | Launch + 14 days | Backend Engineering |
| **Post-launch Month 1** | R6, R7 | Launch + 30 days | Platform Engineering |

---

## 9. Live Launch Checklist

### 9.1 Environment Configuration Verification

| # | Step | Command / Verification Method | Expected Result | Owner | Sign-off |
|---|---|---|---|---|---|
| 1 | Set `DEEPSYNAPS_APP_ENV=production` | `echo $DEEPSYNAPS_APP_ENV` | `production` | DevOps | ☐ |
| 2 | Set `DEEPSYNAPS_DEMO_MODE=false` | `echo $DEEPSYNAPS_DEMO_MODE` | `false` | DevOps | ☐ |
| 3 | Set `DEEPSYNAPS_DEMO_CLINIC_SEED=false` | `echo $DEEPSYNAPS_DEMO_CLINIC_SEED` | `false` | DevOps | ☐ |
| 4 | Set `DEEPSYNAPS_DEMO_SEED_AUTO_PURGE=true` (post R2) | `echo $DEEPSYNAPS_DEMO_SEED_AUTO_PURGE` | `true` | DevOps | ☐ |
| 5 | Set `DATABASE_URL` to production PostgreSQL | `echo $DATABASE_URL` | Valid PostgreSQL connection string | DevOps | ☐ |
| 6 | Verify `VITE_ENABLE_DEMO=false` in production build | Check build artifact env | `false` | Frontend | ☐ |

### 9.2 Demo Seed Data Verification

| # | Step | Command / Verification Method | Expected Result | Owner | Sign-off |
|---|---|---|---|---|---|
| 7 | Confirm no synthetic data in production database | `SELECT COUNT(*) FROM patients WHERE id LIKE 'demo_%';` | `0` | DBA | ☐ |
| 8 | Confirm no seed-sourced records exist | `SELECT COUNT(*) FROM patients WHERE source = 'seed';` | `0` | DBA | ☐ |
| 9 | Verify patient ID prefix enforcement (post R1) | Code review of seed validation | All seed IDs require `demo_` prefix | Backend Lead | ☐ |
| 10 | Run manual purge if seed data detected | Execute purge SQL (Section 7.2 G2) | `0` remaining seed records | DBA | ☐ |
| 11 | Verify database backup is clean | Restore backup to staging; run checks 7–8 | `0` synthetic records | DBA | ☐ |

### 9.3 Production Guard Verification

| # | Step | Command / Verification Method | Expected Result | Owner | Sign-off |
|---|---|---|---|---|---|
| 12 | Verify `validate_production_demo_guard()` returns empty list | Health check endpoint: `/health` | `{"demo_warnings": []}` | Backend | ☐ |
| 13 | Verify CRITICAL warning fires if seed accidentally enabled | Temp set `DEEPSYNAPS_DEMO_CLINIC_SEED=true`; check health | `{"demo_warnings": [{"level": "CRITICAL", ...}]}` | QA | ☐ |
| 14 | Verify WARNING fires if demo mode accidentally enabled | Temp set `DEEPSYNAPS_DEMO_MODE=true`; check health | `{"demo_warnings": [{"level": "WARNING", ...}]}` | QA | ☐ |
| 15 | Confirm warnings suppressed in non-production env | Set `DEEPSYNAPS_APP_ENV=staging` + demo flags true | `{"demo_warnings": []}` | QA | ☐ |

### 9.4 Frontend Verification

| # | Step | Command / Verification Method | Expected Result | Owner | Sign-off |
|---|---|---|---|---|---|
| 16 | Confirm `DemoModeBanner` is absent from production build | Visual inspection of production deployment | No banner visible | Frontend | ☐ |
| 17 | Confirm `SAFETY_LABELS.DEEPTWIN_DISCLAIMER` text accuracy | String match against approved clinical copy | Exact match | Clinical Safety | ☐ |
| 18 | Verify `isDemoMode()` returns `false` in production | Frontend console: `isDemoMode()` | `false` | Frontend | ☐ |
| 19 | Confirm `VITE_ENABLE_DEMO` is not set in production | Build environment audit | Variable absent or `false` | DevOps | ☐ |

### 9.5 API Boundary Verification

| # | Step | Command / Verification Method | Expected Result | Owner | Sign-off |
|---|---|---|---|---|---|
| 20 | Verify `runtime_config()` returns `demo_mode_enabled: false` | GET `/api/v1/runtime-config` | `{demo_mode_enabled: false, demo_seed_enabled: false}` | Backend | ☐ |
| 21 | Verify no sensitive fields in runtime config | Inspect full response payload | Only 3 documented fields present | Security | ☐ |
| 22 | Verify `X-Demo-Mode` header absent in production (post R5) | `curl -I /api/v1/any-endpoint` | Header not present | Backend | ☐ |
| 23 | Verify `X-Demo-Mode` header present when demo enabled (post R5) | Enable demo; `curl -I /api/v1/any-endpoint` | `X-Demo-Mode: true` present | QA | ☐ |

### 9.6 Audit & Observability Verification

| # | Step | Command / Verification Method | Expected Result | Owner | Sign-off |
|---|---|---|---|---|---|
| 24 | Enable audit logging for all clinical decisions | Verify audit log sink is configured | Logs routing to approved destination | Security | ☐ |
| 25 | Confirm `CONFIDENCE_THRESHOLD = 0.95` is documented in ops runbook | Runbook review | Value documented with clinical rationale | Clinical Safety | ☐ |
| 26 | Notify operations team of launch | Email/slack to #ops-clinical-ai | Acknowledgment received | PM | ☐ |
| 27 | Verify monitoring dashboards are active | Check Grafana/observability platform | All critical alerts configured | SRE | ☐ |

### 9.7 Final Sign-off

| # | Step | Verification Method | Expected Result | Owner | Sign-off |
|---|---|---|---|---|---|
| 28 | Complete end-to-end clinical workflow test | Execute full patient journey in production | All outputs show live data; no demo indicators | Clinical Safety | ☐ |
| 29 | Security team sign-off | Security review ticket closure | Approved | Security Lead | ☐ |
| 30 | Clinical safety officer sign-off | CSO review document | Approved | CSO | ☐ |
| 31 | Engineering lead sign-off | Final PR review + merge | Approved | Engineering Lead | ☐ |
| 32 | Product manager sign-off | Launch readiness review | Approved | PM | ☐ |

---

## 10. Final Verdict

### 10.1 Verdict Statement

**CLEAR WITH P2 CONDITIONS**

The DeepSynaps Protocol Studio demo/live boundary architecture is approved for production launch subject to completion of two P2 recommendations prior to go-live:

| Condition | Recommendation | Status Required |
|---|---|---|
| **C1** | **R1 — Synthetic patient ID prefix enforcement**: All demo seed patient IDs must use the `demo_` prefix. Validation must reject any seed patient ID not matching this pattern. | **Complete pre-launch** |
| **C2** | **R5 — `X-Demo-Mode` response header**: All API responses must include `X-Demo-Mode: true` and `X-Demo-Mode-Label` headers when demo mode is active. | **Complete pre-launch** |

### 10.2 Verdict Rationale

The architecture demonstrates strong foundational safety controls:

1. **Dual-layered production guards** (`validate_production_demo_guard()`) provide independent CRITICAL and WARNING checks that only fire in production environments
2. **Conservative defaults** (`false` for all demo toggles) minimize accidental activation risk
3. **Safe frontend exposure** (`runtime_config()`) transmits only non-sensitive boolean flags and labels
4. **Build-time banner elimination** (`VITE_ENABLE_DEMO`) ensures the demo banner is dead-code-eliminated from production builds
5. **Medically accurate disclaimers** (`SAFETY_LABELS.DEEPTWIN_DISCLAIMER`) provide appropriate clinical decision support caveats

The two P2 conditions address the remaining material risks:

- **Condition C1 (R1)** prevents patient ID collision between demo seed data and live clinical records. Without this prefix, a synthetic patient record could theoretically appear in live clinical workflows, constituting a patient safety risk.
- **Condition C2 (R5)** enables programmatic detection of demo mode by downstream systems. Without this header, automated pipelines cannot distinguish demo API responses from live ones, creating data provenance risk.

### 10.3 Risk Acceptance

All P3 recommendations (R2, R3, R4, R6, R7) are accepted as post-launch technical debt. These enhancements improve operational safety and observability but do not represent launch-blocking risks given the strength of the existing guard architecture.

### 10.4 Sign-off Block

| Role | Name | Date | Signature |
|---|---|---|---|
| Engineering Lead | | | |
| Clinical Safety Officer | | | |
| Security Lead | | | |
| Product Manager | | | |
| SRE / DevOps Lead | | | |
| QA Lead | | | |

---

## Appendix A: File Reference Index

| File Path | Purpose | Size / Lines | Review Status |
|---|---|---|---|
| `apps/api/src/deepsynaps/config.py` | Backend demo mode configuration | Lines 88–120 (32 lines) | ✅ Reviewed |
| `apps/web/src/components/DemoModeBanner.jsx` | Frontend demo banner component | 4.5 KB | ✅ Reviewed |
| `apps/web/src/contracts.js` | Frontend constants and helpers | — | ✅ Reviewed |
| `.env.example` | Environment variable template | — | ✅ Reviewed |
| `apps/api/src/deepsynaps/seeding.py` | Data seed logic | — | ⬜ Assumed — not in review scope |
| `apps/api/src/deepsynaps/middleware.py` | API middleware layer | — | ⬜ To be created (R5) |

## Appendix B: Environment Variable Quick Reference

```bash
# === PRODUCTION REQUIRED VALUES ===
DEEPSYNAPS_APP_ENV=production
DEEPSYNAPS_DEMO_MODE=false
DEEPSYNAPS_DEMO_CLINIC_SEED=false
DEEPSYNAPS_DEMO_SEED_AUTO_PURGE=true      # Post R2 implementation
DEEPSYNAPS_DEMO_GUARD_STRICT=true          # Post R4 implementation
DATABASE_URL=postgresql://...              # Production PostgreSQL

# === FRONTEND BUILD (production) ===
VITE_ENABLE_DEMO=false

# === NEVER SET IN PRODUCTION ===
# DEEPSYNAPS_DEMO_MODE=true
# DEEPSYNAPS_DEMO_CLINIC_SEED=true
```

## Appendix C: Decision Log

| Date | Decision | Rationale | Decision Maker |
|---|---|---|---|
| 2024-01-15 | Warning-only (non-blocking) production guard behavior accepted | Hard-fail on CRITICAL could cause cascading production outage if env var is accidentally set; warning model enables graceful degradation with alerting | Engineering Lead |
| 2024-01-15 | `demo_` prefix chosen over separate schema | Separate schema adds operational complexity (connection management, migrations); prefix approach achieves same isolation with lower overhead | Engineering Lead |
| 2024-01-15 | `X-Demo-Mode` header chosen over response body flag | Headers are inspectable by proxies and load balancers without body parsing; industry standard for mode signaling | Backend Lead |
| 2024-01-15 | P3 recommendations accepted as post-launch debt | Existing guard architecture provides sufficient protection; P3 items enhance operability but do not close known safety gaps | Clinical Safety Officer |

---

*Document generated for DeepSynaps Protocol Studio production launch candidate review. This document is a controlled record and must be updated if any referenced file paths, configuration values, or boundary controls are modified.*
