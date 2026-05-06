# Patients Hub / Registry — live readiness (doctor-demo preview)

## Readiness status

**READY WITH LIMITATIONS** — controlled doctor demo is appropriate from a **frontend** perspective; **backend pytest** for patient routers / seed should still run in **CI or the full API dev environment** (private monorepo packages such as `deepsynaps-core-schema` are not installable from public PyPI alone).

| Layer | Verification |
|-------|----------------|
| Frontend | `npm ci` OK; `npm run test:unit` — **1061 passed**; `npm run build` OK with **Node 20.19+** |
| Backend | `pytest` command below — run where `deepsynaps-api` installs with internal deps |

**Node.js:** Vite 7 requires **Node 20.19+** (e.g. 20.20.x). Builds on **Node 18** fail (`crypto.hash is not a function`). CI and demo machines should pin Node **20.19+**.

**Demo posture:** Safe for a **controlled** demo when preview banners are shown; treat **patient-specific persistence** (quick note, chart) as **environment-dependent** until API tests pass in full dev/CI.

**Source of truth:** This file (`docs/patients-hub-live-readiness.md`). Branch: `cursor/patients-hub-demo-readiness-23e4` · PR **#526** · readiness doc baseline commit `74762286` (additive governance edits may follow).

### Frozen baseline (pre-demo)

No further Patients Hub implementation changes before the demo **except** fixes for:

- blocking route errors  
- unsafe or misleading clinical copy  
- demo-label clarity  
- degraded-state honesty  
- role-gating issues  
- fake persistence / outcome prevention  

### Doctor-facing line (canonical)

> Patients Hub is a controlled preview with synthetic non-PHI demo data. It supports workflow navigation and clinician review; it is not a full clinical record, not emergency triage, and it does not diagnose, prescribe, approve treatment, or act autonomously.

## Scope

This document covers the **Patients** area of the clinician app:

- **Routes:** `patients-v2`, `patients-hub` (with `?tab=patients|analytics|alerts|reports|…`)
- **Implementation:** `apps/web/src/pages-clinical-hubs.js` (`pgPatientHub`), dashboard entry via `apps/web/src/pages-clinical.js` (`pgDash`)
- **API:** `apps/api/app/routers/patients_router.py` (`GET /api/v1/patients`, `GET /api/v1/patients/cohort-summary`)

Out of scope: redesigning UI, new clinical modules, or synthetic AI patient conclusions.

## Safety statement

- The registry supports **clinical workflow navigation** and **decision support**; it is **not** a complete electronic health record, **not** emergency triage, and **not** autonomous clinical decision-making.
- **Preview / demo** data are **synthetic and non-PHI**. KPIs may be **sample values** when the API is empty or unavailable in demo-enabled builds.
- Row-level flags (adverse event, overdue assessment) come from **backend enrichment or labeled preview rows** and **require clinician chart review**.

## Demo vs production behaviour

| Mode | Frontend | Backend DB seed |
|------|----------|-----------------|
| Preview demo | `VITE_ENABLE_DEMO=1` **or** dev: synthetic roster when API empty/fails | `DEEPSYNAPS_APP_ENV` ∈ `development` \| `test` **and** `DEEPSYNAPS_DEMO_CLINIC_SEED=1` (`scripts/seed_demo.py`) |
| Production | Does **not** silently inject synthetic patients without demo flag | Seed skipped unless env gate passes |

## API endpoint matrix (verified in router tests)

| Endpoint | Role | Behaviour |
|----------|------|-----------|
| `GET /api/v1/patients` | clinician+ | Paginated list; filters: `status`, `q`, `condition`, `modality`, `clinician`, `sort`, `limit`, `offset`; clinic-scoped via repository |
| `GET /api/v1/patients/cohort-summary` | clinician+ | Whole-cohort KPIs independent of pagination |
| Patient profile / audit | clinician+ | Chart drill-out; audit events best-effort (`recordPatientProfileAuditEvent` failures do not block navigation) |

## Button / action matrix (abbrev.)

For each control: **Label → handler → route/API → expected behaviour → demo → degraded → tests**

| Control | Handler | API / route | Expected | Demo | Degraded |
|---------|---------|-------------|----------|------|----------|
| Sidebar Patients | `_nav('patients-hub')` | — | Opens hub | Same | Same |
| Dashboard “All patients” / caseload | `_nav('patients')` → hub | — | Opens Patients tab | Same | Same if shell loads |
| Search | `_phOnSearch` → `listPatients` | `GET /api/v1/patients?q=` | Server search | Preview roster searchable locally | Error banner if API down |
| Status tabs | `_phSetStatus` | `status=` query | Filter | Demo roster statuses | Empty + message |
| Quick filters | `_phSetQuickFilter` | Client filter on page | Sub-filter | Same | Same |
| Condition / modality / clinician | `_phSetFacet` | Facet query params | Server filter | Facets from summary or empty | “None yet” in menus |
| Sort | `_phSetFacet(sort)` | `sort=` | Server sort | Same | — |
| Comfortable / Compact | `_phToggleDensity` | localStorage | Density toggle | Same | Same |
| Help `?` | `_phToggleShortcuts` | — | Shortcuts overlay | Same | Same |
| Bell | `_phOpenNotifications` | — → `review-queue` | Routes to review queue | Same | Same |
| DeepTwin (top) | `_nav('deeptwin')` | DeepTwin stack | Patient intelligence hub | Same | Toast if nav missing |
| + Add patient | `showAddPatient` | `POST /api/v1/patients` when wired | Create intake | May route legacy modal | Toast if unavailable |
| Import CSV | `showImportCSV` | **No bulk upload in preview** | Honest toast — use single intake or ops pipeline | Preview-only message | Same |
| Open chart 📂 | `_phOpenChart` | Audit + `patient-profile` | Chart | Same | Toast |
| Analytics ▤ | `_phOpenAnalytics` | Audit + `patient-analytics` | Analytics terminal | Same | Toast |
| Start ▶ | `_phStartSession` | `session-runner` if session id; else scheduling | Real session only when id exists | Demo session id on Samantha | Toast “no session today” |
| Quick note ✎ | `_phSubmitQuickNote` | `createClinicianNote` if present | Persist or honest failure | Browser-only if API absent | Warn |
| Message ✉ | `_phMessage` | `messaging` / compose | Routes when wired | Toast fallback | Toast |
| Module strip (qEEG … Assess) | `_phNavigatePatientModule` | Whitelist → `_nav(route)` | Known routes only | Same | “Module unavailable…” toast |
| Today’s Queue Start | `_phStartSession(pid)` | Same as Start | Same | Same | Same |
| Analytics / Alerts / Reports tabs | Tab switch / delegate | Analytics module; stubs | Alerts/reports honest empty/shim | Same | Same |

## Synthetic preview roster (frontend)

When `VITE_ENABLE_DEMO=1` (or dev) **and** the patient API returns empty or fails, `buildDemoPatientRosterPreview()` supplies five deterministic **demo-pt-*** IDs:

`demo-pt-samantha-li`, `demo-pt-marcus-chen`, `demo-pt-elena-vasquez`, `demo-pt-omar-haddad`, `demo-pt-amelia-brown`

Each row is labeled **Demo patient** and outcome columns prefix **Sample** where illustrative scores are shown.

## Drill-out route whitelist (registry strip)

Validated routes include: `qeeg-launcher`, `qeeg-analysis`, `mri-analysis`, `video-assessments`, `wearables`, `text-analyzer`, `deeptwin`, `documents-v2`, `schedule-v2`, `scheduling-hub`, `clinician-inbox`, `protocol-studio`, `assessments-v2`, `monitor`, `documents`, `protocol-hub`, `patient-wearables`.

Unknown routes show a safe toast — **no silent navigation**.

## Known limitations

- CSV bulk import is **not** exposed as an API-backed upload on this preview surface.
- Alerts tab does not yet aggregate a live cross-service feed; Patients tab + chart remain authoritative.
- Quick note uses `createClinicianNote` when defined; duplicate key overwrite in `api.js` means the **last** exported `createClinicianNote` wins — verify intended backend path for your deployment.

## Doctor-demo script (tomorrow)

1. Open **Patients** — point out **preview / synthetic non-PHI** banner and safety copy.
2. Explain: registry is for **workflow and clinician review**, not diagnosis or treatment approval.
3. Show **cohort KPI cards** (from `cohort-summary` when API healthy).
4. **Search** and switch **status tabs** and **quick filters**.
5. Open **patient chart** and **Analytics**.
6. **Start session** where a session id exists; otherwise show scheduling / honest toast.
7. **Quick note** — show persisted path or local-only message.
8. Open **module shortcuts** (qEEG, MRI, DeepTwin, Protocol, Assessments).
9. Show **Today’s Queue** card.
10. Close with: *“This registry coordinates patient workflow and review. It is not a full clinical record, not emergency triage, and does not replace clinician judgement.”*

## Preview click-through log

| Step | Result |
|------|--------|
| Frontend unit + build | See **Readiness status** — verified with Node 20.20.x |
| Backend pytest | **Pending** in bare containers; run in CI / full monorepo API environment |
| Manual Netlify preview | Run `bash scripts/deploy-preview.sh` from repo root per `CLAUDE.md` (requires Netlify auth on reviewer machine) |

## Tests (commands)

```bash
cd apps/web && npm ci
cd apps/web && npm run test:unit
cd apps/web && npm run build   # requires Node 20.19+

cd apps/api && python3 -m pytest -q tests/test_patients_router.py tests/test_dashboard_router.py tests/test_demo_clinic_seed.py tests/test_seed_demo.py
```

The API pytest block requires a working install of `apps/api` including **internal** DeepSynaps packages — use the repo’s standard API virtualenv or CI image, not a minimal PyPI-only sandbox.

---

*Last updated as part of Patients Hub doctor-demo readiness work.*
