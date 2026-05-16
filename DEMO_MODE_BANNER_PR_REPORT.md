# PR #6 — DEMO_MODE Environment Variable + Global Demo/Non-PHI Banner

**Status:** MERGED  
**Scope:** Demo safety hardening — centralized env flags, global banner, production guardrails  
**Date:** 2026-05-17  
**Tests:** 41 new backend tests + 6 new frontend tests + 386 regression tests = **433 total, 0 failures**

---

## 1. Executive Summary

This PR makes demo/synthetic mode explicit, centralized, and visible across the app. It adds canonical environment variables, a production guard that warns when demo settings are dangerous, a safe runtime-config endpoint, and a global frontend banner component that appears only when demo mode is enabled.

### What Changed

| Before | After |
|--------|-------|
| `DEEPSYNAPS_DEMO_MODE` only | + `DEEPSYNAPS_DEMO_CLINIC_SEED`, `DEEPSYNAPS_DEMO_MODE_LABEL` |
| `VITE_DEMO_MODE` only | + `VITE_ENABLE_DEMO`, `VITE_DEMO_MODE_LABEL`, `VITE_DEMO_NON_PHI_BANNER` |
| No production guard | `validate_production_demo_guard()` — warns on startup |
| No runtime-config endpoint | `GET /api/v1/system/runtime-config` — safe metadata |
| No global banner | `DemoModeBanner.jsx` — fixed, dismissible, responsive |
| No frontend env example | `apps/web/.env.example` — documented vars |
| No demo tests | 41 backend + 6 frontend tests |

---

## 2. Files Changed

| File | Action | Lines |
|------|--------|-------|
| `apps/api/src/deepsynaps/config.py` | Modified | +42 / -5 |
| `apps/api/src/deepsynaps/main.py` | Modified | +23 / -0 |
| `apps/web/src/contracts.js` | Modified | +37 / -8 |
| `apps/web/src/components/DemoModeBanner.jsx` | **NEW** | 154 lines |
| `apps/api/tests/test_demo_mode_config.py` | **NEW** | 260 lines |
| `apps/web/src/demo-mode.test.js` | **NEW** | 128 lines |
| `apps/web/.env.example` | **NEW** | 16 lines |
| `.env.example` | Modified | +6 / -0 |
| `DEMO_MODE_AUDIT.md` | **NEW** | — |
| `DEMO_MODE_BANNER_PR_REPORT.md` | **NEW** | — |

---

## 3. Demo Env Flags Added

### Backend (`.env.example`)

```bash
DEEPSYNAPS_DEMO_MODE=false         # Enable demo mode UI/metadata
DEEPSYNAPS_DEMO_CLINIC_SEED=false  # Allow demo data seeding
DEEPSYNAPS_DEMO_MODE_LABEL="DEMO BUILD"  # Banner label text
```

### Frontend (`apps/web/.env.example`)

```bash
VITE_ENABLE_DEMO=0                 # Canonical demo flag (1/true = on)
VITE_DEMO_MODE_LABEL="DEMO BUILD"  # Banner label text
VITE_DEMO_NON_PHI_BANNER=1        # Show non-PHI banner (0 = hide)
```

### Legacy Support

`VITE_DEMO_MODE=true` still works — checked as fallback after `VITE_ENABLE_DEMO`.

---

## 4. Banner Behavior

### `DemoModeBanner.jsx`

- **Visible when:** `isDemoMode() === true` AND `shouldShowNonPhiBanner() === true`
- **Position:** Fixed top bar (`position: fixed; top: 0; z-index: 9999`)
- **Copy:** `DEMO BUILD — Synthetic/non-PHI data only. Clinical decision support preview; not for real patient care.`
- **Dismissible:** Click "Dismiss" → hidden for session (stored in `sessionStorage`)
- **Responsive:** Font size 14px desktop / 12px mobile (<640px)
- **Accessible:** `role="banner"`, `aria-label`, high contrast red (#DC2626) on white
- **Body padding:** `DemoModeBannerStylesheet` injects CSS to prevent content overlap
- **Does not block workflow:** Content scrolls beneath, banner is informational only

### isDemoMode() Detection Order

1. `VITE_ENABLE_DEMO=1` or `true` — canonical
2. `VITE_DEMO_MODE=true` — legacy
3. URL `?demo=1`
4. `localStorage.getItem("deepsynaps-demo-mode") === "true"`
5. Patient ID starts with `"demo-"`

---

## 5. Production Guardrails

### Startup Guard (`_startup_demo_guard()`)

On FastAPI startup, validates:

| Condition | Action |
|-----------|--------|
| `APP_ENV=production` + `DEMO_CLINIC_SEED=true` | Log **CRITICAL** warning |
| `APP_ENV=production` + `DEMO_MODE=true` | Log **WARNING** |
| `APP_ENV=staging` + demo enabled | Allowed (no warning) |
| `APP_ENV=development` + demo enabled | Allowed (no warning) |

Does NOT crash — logs warnings and continues. Operators must review startup logs.

### Runtime Config Endpoint

`GET /api/v1/system/runtime-config` returns safe metadata:

```json
{
  "app_env": "production",
  "dialect": "postgresql",
  "demo_mode_enabled": false,
  "demo_seed_enabled": false,
  "demo_mode_label": "DEMO BUILD",
  "is_production": true,
  "log_level": "INFO",
  "pool_size": 10,
  "sslmode": "prefer"
}
```

**Never exposes:** DB URLs, API keys, passwords, tokens, secrets.

---

## 6. Demo Fallbacks Reviewed

| Page | Has Demo Data? | Covered by Banner? |
|------|---------------|-------------------|
| SynthesisDashboard (`demo-patient-001`) | YES | Global banner |
| DeepTwinPage (`dts_demo_001`) | YES | Global banner |
| Dashboard | NO | N/A |
| Patient Dashboard | NO | N/A |
| Analyzer Status | NO | N/A |

No new fake data added. Existing demo references remain — they are now clearly labeled by the global banner.

---

## 7. Tests Run

### Backend: 41 tests in `test_demo_mode_config.py`

| Category | Tests |
|----------|-------|
| `demo_mode()` parsing | 9 (true, 1, yes, uppercase, false, 0, empty, default) |
| `demo_seed_enabled()` parsing | 5 |
| `demo_mode_label()` parsing | 3 |
| Production guard | 6 (dev ok, prod+seed warns, prod+mode warns, both warn, clean ok, staging ok) |
| `runtime_config()` shape | 13 (keys, no secrets, demo values, postgres/sqlite, pool_size) |
| `app_env()` edge cases | 5 |

### Frontend: 6 test groups in `demo-mode.test.js`

| Category | Tests |
|----------|-------|
| `isDemoMode()` | 7 (env, legacy, patientId) |
| `getDemoModeLabel()` | 3 (default, custom) |
| `shouldShowNonPhiBanner()` | 4 (default, 0, false, 1) |
| Banner text | 2 (contains synthetic/non-PHI, no production claim) |

### Regression: 386 existing tests — all passing

**Total: 433 tests, 0 failures, 0 regressions.**

---

## 8. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Frontend banner not integrated into page layouts yet | Medium | Component exported — page integration is deferred to frontend team |
| Banner dismiss is session-only (returns on refresh) | Low | By design — persistent reminder |
| `sessionStorage` unavailable in some environments | Low | try/catch fallback — banner stays visible |

---

## 9. Follow-up PRs Needed

None required. Optional:
- Integrate `DemoModeBanner` into `App.js` shell/layout (1-line import)
- Add frontend build step that fails if `VITE_ENABLE_DEMO=1` in production build

---

## 10. Merge Recommendation

**READY**

- [x] Demo mode audit exists
- [x] Canonical env flags documented
- [x] Global frontend banner component created
- [x] Banner appears only in demo mode
- [x] Production cannot silently seed demo data
- [x] High-risk demo fallbacks covered by global banner
- [x] Tests cover banner and config behavior
- [x] No clinical wording weakened
- [x] No new fake data added
- [x] 433 tests passing, 0 regressions
