# Patients Hub / Registry — live readiness (doctor-demo preview)

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
| Env verification | Documented above; agent runs in CI-like shell — **execute local `pytest` / `npm run build` / `npm run test:unit` before release** |
| Manual Netlify preview | Run `bash scripts/deploy-preview.sh` from repo root per `CLAUDE.md` (requires Netlify auth on reviewer machine) |

## Tests (commands)

```bash
cd apps/api && python3 -m pytest -q tests/test_patients_router.py tests/test_dashboard_router.py tests/test_demo_clinic_seed.py tests/test_seed_demo.py
cd apps/web && npm run test:unit
cd apps/web && npm run build
```

---

*Last updated as part of Patients Hub doctor-demo readiness work.*
