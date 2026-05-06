# Clinical Dashboard — live demo readiness (doctor-facing)

Scope: **DeepSynaps Studio → Clinical Dashboard** (`?page=dashboard` / `?page=home` / `?page=today` → `pgDash`).

This dashboard is **clinical decision support** and operational coordination.

- **Not** an emergency triage system.
- **Not** autonomous diagnosis, prescribing, dosing, or treatment planning.
- **Not** a guarantee of outcomes.

## Visible sections (UI inventory)

Rendered by `apps/web/src/pages-clinical.js` (`pgDash`), design preserved:

- **Greeting + head actions** (Day board / Week view tabs, Export data)
- **Safety strip** (decision support only; not emergency triage; not autonomous)
- **Demo banner** (when demo-seeded or preview build)
- **Attention chips** (incl. New messages → Inbox)
- **Core cards**: schedule preview, caseload summary, protocol actions, evidence shortcuts, etc. (varies by role/access)
- **Agent strip** (“Clinic specialist agents”) (full access only)
- **Degraded/offline banners** (backend unreachable, partial load, offline)

## Demo & production safety rules (pinned)

- **Production**: if the backend is unreachable, the dashboard shows a **truthful degraded state** (“We couldn’t reach your clinic data right now”). It must **not** silently invent patient rows.
- **Preview demo** (`DEV` or `VITE_ENABLE_DEMO=1`):
  - If the clinic is empty or the backend is unreachable, the dashboard may seed **synthetic** sample rows **only with a visible DEMO banner**.
  - Copy explicitly states **DEMO / non‑PHI** and that names/IDs are synthetic (e.g. `P-DEMO-*`).

The policy is implemented and unit-tested in `apps/web/src/clinical-dashboard-helpers.js` (`shouldSeedDashboardDemo`).

## Priority action checklist (doctor demo path)

Each item must either (a) work or (b) be honestly unavailable with safe copy (“This module is not available in this build. No clinical action has been taken.”).

| Action (priority) | Frontend (handler) | Route exists? | Backend/API needed? | Demo / degraded behavior |
|---|---|---:|---|---|
| Start Session | Dashboard header button / patient cards | Yes (`session-execution`) | Depends on session APIs | If unavailable, do not claim started; show route guard error |
| New Messages / Inbox | Attention chip: `New messages` | Yes (`clinician-inbox`) | Inbox API for counts | Degraded state if inbox summary fails |
| Open Schedule | “Open schedule →” | Yes (`scheduling-hub` / `clinic-day`) | Schedule APIs | If schedule API down, show what’s available or honest empty |
| Open Planner | “Open planner →” | Yes (`brain-map-planner`) | Optional | If role-gated, show staff-only guard |
| All Patients / Active Caseload | Patient Hub / Patients | Yes (`patients-hub` / `patients`) | Patients API | In demo build, demo banner + synthetic roster allowed |
| Browse Protocols | “Browse protocols” | Yes (`protocol-hub` / `protocols-registry`) | Optional | Works offline via bundled registry where applicable |
| Generate Protocol | “Generate protocol” | Yes (`protocol-hub` with generate tab) | Optional/AI optional | Must not claim autonomous recommendation |
| Evidence Library | “Evidence library” | Yes (`research-evidence`) | Optional | May use bundled index when research API missing |
| Ask Agent | “Open agents” strip | Yes (`ai-agents`) | Chat API + provider keys | If provider unavailable, show honest error (no hallucinated success) |
| Export Data | “Export data” | Yes (`reports-hub`) | Export endpoints | If export endpoints disabled, UI must say unavailable |
| Patient Profile | Patient rows → profile | Yes (`patient-profile`) | Patient APIs | Demo patients must be labeled DEMO |
| Risk Analyzer | “Risk Analyzer” | Yes (`risk-analyzer`) | Risk APIs | If API missing, show honest degraded state |
| DeepTwin | Dashboard cards | Yes (`deeptwin`) | Optional | Demo allowed only when clearly labeled |
| MRI / qEEG / Video / Voice analyzers | Links within dashboard/patient pages | Yes (various pages) | Analyzer APIs optional | If API unavailable, show truthful degraded state |

## Backend endpoints (API)

- `GET /api/v1/dashboard/overview` (`apps/api/app/routers/dashboard_router.py`)
- `GET /api/v1/dashboard/search?q=...`

Honesty rule: audit write failures must not break responses (best-effort audit).

## Tests run (record exact commands)

Results (this lock pass):

- **Backend (dashboard-specific)**: `cd apps/api && python3 -m pytest -q tests/test_dashboard_router.py` (**PASS**, 13 tests)
- **Backend (full suite)**: `cd apps/api && python3 -m pytest -q` (**FAIL** in this environment)
  - Example failures observed:
    - `tests/test_bandrange_fir_qa.py` fails because `scipy` is not installed (`RuntimeError: scipy is required for FIR bandrange filters`)
    - `tests/test_bio_router.py` failures/contract drift (404 vs 403 and 405 vs 200) unrelated to Dashboard routes
- **Frontend**: `cd apps/web && node --test src/clinical-dashboard-launch-audit.test.js` (**PASS**, 10 subtests)
- **Frontend build**: `cd apps/web && npm run build` (**PASS**, requires Node 20+ for Vite 7)

## Known limitations (explicit)

- Some modules are role-gated or require external providers; demo must not claim availability unless actually working.
- Notification/presence is separate; dashboard must not claim durable realtime guarantees.

## Tomorrow’s doctor-demo script

1. Open **Clinical Dashboard** (`Today → Dashboard`).
2. Point out the **safety strip** (decision support; not emergency triage; not autonomous diagnosis/prescribing/dosing/treatment planning).
3. If demo build: point out **DEMO banner** (synthetic / non‑PHI).
4. Click **New messages** → lands in **Clinical Inbox**.
5. Click **Open schedule** → show schedule hub/day board.
6. Click **Open planner** → show planner workspace (staff-only).
7. Click **Browse protocols** and **Evidence library**.
8. Click **Risk Analyzer**.
9. Open **Agents** (Ask Agent) and ask an operational question; if provider missing, show the honest error.
10. Click **Export data**; if backend export endpoints disabled, show “unavailable” messaging.

