# Demo Mode Audit — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Auditor:** Automated Architecture Audit  
**Scope:** Frontend + backend demo flags, synthetic data, demo fallbacks

---

## 1. Current Demo Flags

### Backend

| Flag | Location | Type | Default | Used By |
|------|----------|------|---------|---------|
| `DEEPSYNAPS_DEMO_MODE` | `config.py:90-91` | bool | `""` (false) | `debug_info()`, access control |
| `DEEPSYNAPS_APP_ENV` | `config.py:19-20` | string | `"development"` | `is_production()`, `is_test()` |

### Frontend

| Flag | Location | Type | Detection Method |
|------|----------|------|-----------------|
| `VITE_DEMO_MODE` | `contracts.js:741` | env | `import.meta.env.VITE_DEMO_MODE === "true"` |
| URL param `?demo=1` | `contracts.js:750` | runtime | `URLSearchParams` |
| `localStorage` | `contracts.js:758` | persistent | `deepsynaps-demo-mode` key |
| Patient ID heuristic | `contracts.js:766` | runtime | Patient ID starts with `"demo-"` |

### Env Files

| File | Has Demo Vars? |
|------|---------------|
| `.env.example` | YES — `DEEPSYNAPS_DEMO_MODE=false` |
| `apps/api/.env.example` | NO (file does not exist) |
| `apps/web/.env.example` | NO (file does not exist) |

---

## 2. Demo Data Sources

### Backend Synthetic Data

| Function | File | Description | Production Risk |
|----------|------|-------------|----------------|
| `_seed_evidence()` | `knowledge_layer.py:44-69` | Seeds 6 evidence DB rows on DB init | **LOW** — always seeded, no PHI |
| `seed_sample_events()` | `timeline_engine.py:43+` | Seeds 5 sample events per patient | **MEDIUM** — called on demand, may be confused with real |

### Frontend Demo References

| File | Line | Demo Reference |
|------|------|----------------|
| `SynthesisDashboard.jsx:49` | `patientId = "demo-patient-001"` | Hardcoded demo patient ID |
| `DeepTwinPage.jsx:48` | `snapshot_id: "dts_demo_001"` | Hardcoded demo snapshot ID |

### Data Console / Dashboard

| Page | Has Demo Fallback? | Labeled? |
|------|-------------------|----------|
| SynthesisDashboard | YES (demo-patient-001) | Partial (patient ID implies demo) |
| DeepTwinPage | YES (dts_demo_001) | Partial (ID implies demo) |
| Dashboard | NO explicit demo | N/A |
| Patient Dashboard | NO explicit demo | N/A |

---

## 3. Pages Missing Demo Labels

| Page | Risk | Needs Label? |
|------|------|-------------|
| SynthesisDashboard | Hardcoded demo patient | YES — global banner covers |
| DeepTwinPage | Hardcoded demo snapshot | YES — global banner covers |
| Dashboard | No explicit demo | NO |
| Patient Dashboard | No explicit demo | NO |
| Analyzer Status | No explicit demo | NO |

---

## 4. Production Risk Areas

| Risk | Severity | Mitigation |
|------|----------|------------|
| Demo seed enabled silently in production | **HIGH** | Add production guard in `config.py` |
| Frontend shows demo data without banner | **MEDIUM** | Global `DemoModeBanner` component |
| `VITE_DEMO_MODE` set in production build | **MEDIUM** | Build-time check / env validation |
| Demo patient IDs mixed with real data | **LOW** | Naming convention `"demo-"` prefix |
| No runtime-config endpoint for demo status | **LOW** | Add `/api/v1/system/runtime-config` |

---

## 5. Recommendations (PR #6 Scope)

1. **Centralize env flags** — canonical `VITE_ENABLE_DEMO`, `VITE_DEMO_MODE_LABEL`, `DEEPSYNAPS_DEMO_CLINIC_SEED`
2. **Global banner** — `DemoModeBanner.jsx`, visible on all pages when demo enabled
3. **Production guard** — fail/warn if demo seed in production env
4. **Runtime config endpoint** — `GET /api/v1/system/runtime-config` with safe metadata
5. **Update env examples** — `.env.example`, `apps/web/.env.example`
6. **Tests** — banner render, config guards, no secrets in runtime config
