# Scheduling Hub live readiness (doctor preview)

This document is the **source of truth** for making the Scheduling Hub (`pgSchedulingHub`) safe and demo-ready for a controlled doctor preview.

## Scope statement

- **In scope**: clinician scheduling hub UI (`scheduling-hub` / `schedule-v2`) and the backing API surfaces for sessions, rooms/devices, and conflict checks.
- **Out of scope**:
  - UI redesigns or new scheduling modules/pages
  - AI auto-scheduling or autonomous clinical decision-making
  - Email/SMS delivery guarantees
  - Staff shift management persistence (currently stubbed in web)

## Safety statement (must be true in demo)

- **Controlled preview** uses **synthetic non‑PHI** demo schedule data when demo mode is enabled.
- Scheduling is **workflow coordination only**:
  - It **does not** diagnose, prescribe, triage emergencies, approve treatment, or act autonomously.
  - Clinicians must confirm the chart, consents, and resources before clinical action.
- **Truthfulness rules**:
  - No fake booking success, conflict-check success, staff-shift success, or delivery success.
  - Demo sessions must **never** appear silently in production.
  - If backend calls fail, the UI must show an honest degraded state.

## Feature entry points (routes)

- **Primary routes**:
  - `scheduling-hub` → `pgSchedulingHub(...)` (`apps/web/src/pages-clinical-hubs.js`)
  - `schedule-v2` → `pgSchedulingHub(...)` (alias; keeps `window._schedHubNavTarget`)
- **Common launchers**:
  - Dashboard “Open schedule →”
  - Sidebar “Schedule”
  - Cross-links from risk/treatment pages via `window._nav('scheduling-hub')`

## API endpoint matrix (scheduling-critical)

| Concern | Endpoint | Backend implementation | Notes |
|---|---|---|---|
| List sessions | `GET /api/v1/sessions` | `apps/api/app/routers/sessions_router.py::list_sessions_endpoint` | Supports clinic scoping + filters (`start_date`, `end_date`, `clinician_id`, `room_id`, `modality`, `status`, `appointment_type`, `telehealth`, `limit`, `offset`). |
| Create session | `POST /api/v1/sessions` | `sessions_router.py::create_session_endpoint` | Validates `appointment_type`, optional `clinician_id` (same clinic), **409 on conflict**. |
| Update/reschedule/cancel/status | `PATCH /api/v1/sessions/{id}` | `sessions_router.py::update_session_endpoint` | Enforces status transitions; **409 on conflict** when time/resource/clinician changes. |
| List session events | `GET /api/v1/sessions/{id}/events` | `sessions_router.py::list_session_events_endpoint` | Used by “Session audit” button. |
| Create session event | `POST /api/v1/sessions/{id}/events` | `sessions_router.py::create_session_event_endpoint` | Adds audit trail events. |
| List rooms | `GET /api/v1/schedule/rooms` | `apps/api/app/routers/schedules_router.py::list_rooms` | Clinic-scoped, clinician+. |
| Create room | `POST /api/v1/schedule/rooms` | `schedules_router.py::create_room` | Admin only. |
| List devices | `GET /api/v1/schedule/devices` | `schedules_router.py::list_devices` | Clinic-scoped, clinician+. |
| Create device | `POST /api/v1/schedule/devices` | `schedules_router.py::create_device` | Admin only. |
| Conflict check (non-mutating) | `POST /api/v1/schedule/conflicts` | `schedules_router.py::check_appointment_conflicts` → `app.repositories.sessions.check_conflicts` | Used by UI “Check conflicts”. Returns `has_conflicts` + list. |
| Combined resources | `GET /api/v1/schedule/resources` | `schedules_router.py::list_resources` | Returns clinicians + rooms + devices (frontend currently derives clinicians from `/api/v1/team`). |

## Demo and degraded behavior (must match UI)

### Demo schedule seed (frontend)

- **Where**: `apps/web/src/pages-clinical-hubs.js` (inside `pgSchedulingHub`)
- **When it can seed**:
  - `VITE_ENABLE_DEMO=1` **or** Vite `DEV`
  - AND sessions API **succeeds** with an empty list (`[]`)
- **When it must not seed**:
  - When the sessions API call fails (sessions == `null`)
  - In production builds with demo disabled
- **How it is labeled**:
  - Yellow banner: “**Demo schedule — synthetic sample sessions (non‑PHI)** …”
  - Side panel includes “Controlled preview — synthetic data” warning for demo appointments

### Degraded mode (API failure)

- If `GET /api/v1/sessions` fails:
  - UI shows an error banner: live schedule unavailable
  - UI must **not** silently show demo appointments
  - Booking attempts still call the backend and must report true success/failure

### Backend demo clinic seed (API)

- **Where**: `apps/api/app/services/demo_clinic_seed.py`
- **How it is gated** (must all be true):
  - `settings.app_env in {"development","test"}`
  - `DEEPSYNAPS_DEMO_CLINIC_SEED=1`
- **What it seeds** (synthetic, non‑PHI):
  - Rooms + devices
  - Demo patients (notes prefixed `[DEMO]`)
  - 10 sessions in the current week, including **one overlap conflict pair**

## Button / action matrix (doctor-demo-ready)

For each item: **label → frontend handler → route/API → backend function → expected behavior → demo behavior → degraded behavior → tests**

### Launch / navigation

| Label | Frontend handler | Route/API | Backend | Expected behavior | Demo behavior | Degraded behavior | Tests |
|---|---|---|---|---|---|---|---|
| Sidebar “Schedule” | `window._nav('schedule-v2')` or `window._nav('scheduling-hub')` | web route | `apps/web/src/app.js` routing to `pgSchedulingHub` | Opens Scheduling Hub | Works | Works | `e2e/07-scheduling-golive.spec.ts` |
| Dashboard “Open schedule →” | `window._nav('scheduling-hub')` | web route | N/A | Opens Scheduling Hub | Works | Works | (covered by smoke/e2e navigation) |

### Calendar toolbar

| Label | Frontend handler | Route/API | Backend | Expected behavior | Demo behavior | Degraded behavior | Tests |
|---|---|---|---|---|---|---|---|
| Previous | `window._schedShift(-shift)` | re-render | N/A | Moves anchor date back | Works | Works | `e2e/07-scheduling-golive.spec.ts` |
| Today | `window._schedToday()` | re-render | N/A | Sets anchor date to today | Works | Works | (add in unit/e2e as needed) |
| Next | `window._schedShift(+shift)` | re-render | N/A | Moves anchor date forward | Works | Works | `e2e/07-scheduling-golive.spec.ts` |
| Day view | `window._schedSetView('day')` | re-render | N/A | Switches to day grid | Works | Works | `e2e/07-scheduling-golive.spec.ts` |
| Week view | `window._schedSetView('week')` | re-render | N/A | Switches to week grid | Works | Works | `e2e/07-scheduling-golive.spec.ts` |
| Resources view | `window._schedSetView('resources')` | re-render | N/A | Switches to room utilization grid | Works | Works | `e2e/07-scheduling-golive.spec.ts` |
| Month view | `window._schedSetView('month')` | re-render | N/A | Switches to month grid | Works | Works | `e2e/07-scheduling-golive.spec.ts` |

### Filters / chips

| Label | Frontend handler | Route/API | Backend | Expected behavior | Demo behavior | Degraded behavior | Tests |
|---|---|---|---|---|---|---|---|
| Clinician chips | `window._schedToggleClinician(id)` | re-render | N/A | Filters visible appointments by clinician | Works | Works | (unit/e2e follow-up) |
| Room chips | `window._schedToggleRoom(name)` | re-render | N/A | Filters by room label | Works | Works | (unit/e2e follow-up) |
| Type chips | `window._schedToggleType(t)` | re-render | N/A | Filters by appointment type slug | Works | Works | (unit/e2e follow-up) |
| Conflicts/prereqs chip | `window._schedToggleConflicts()` | re-render | N/A | Shows flagged events only | Works | Works | (unit/e2e follow-up) |

### Tabs

| Label | Frontend handler | Route/API | Backend | Expected behavior | Demo behavior | Degraded behavior | Tests |
|---|---|---|---|---|---|---|---|
| Calendar tab | `window._schedHubGoTab('appointments')` | re-render | N/A | Calendar grid + side panel | Works | Works | `e2e/07-scheduling-golive.spec.ts` |
| Booking queue tab | `window._schedHubGoTab('referrals')` | `api.listReferrals()` | `/api/v1/reception/referrals` (via `api.listLeads`) | Shows referrals; actions truthfully persisted or local-only | Can show demo label if empty | If API missing, still renders but actions are local-only labeled | (unit/e2e follow-up) |
| Workload tab | `window._schedHubGoTab('staff')` | `api.listStaffSchedule` (stub) | N/A | Shows derived workload; shift management not available | Works | Works | (unit/e2e follow-up) |
| All appointments tab | `window._schedHubGoTab('list')` | re-render | N/A | Table view of filtered items | Works | Works | (unit/e2e follow-up) |

### Demo banner

| Label | Frontend handler | Route/API | Backend | Expected behavior | Demo behavior | Degraded behavior | Tests |
|---|---|---|---|---|---|---|---|
| Demo banner dismiss | `window._schedDismissDemoBanner()` | DOM remove | N/A | Hides banner for session | Visible only when demo-seeded | Not shown on API failure | `e2e/07-scheduling-golive.spec.ts`, `apps/web/src/scheduling-hub-live-readiness.test.js` |

### Booking

| Label | Frontend handler | Route/API | Backend | Expected behavior | Demo behavior | Degraded behavior | Tests |
|---|---|---|---|---|---|---|---|
| `+ New booking` | `window._schedNewBookingIntent()` | opens wizard | N/A | Visible only for clinician/admin/superadmin | Works | Works | `e2e/07-scheduling-golive.spec.ts` |
| Wizard step: Patient | `_schedWiz*` helpers | `api.listPatients()` | patients router | Pick patient or enter full name for create | Works | Works | `e2e/07-scheduling-golive.spec.ts` |
| Wizard step: Slot | `_schedWizSet(...)` | N/A | N/A | Select day/clinician/time/duration/room | Works | Works | (unit/e2e follow-up) |
| Wizard step: Type | `_schedWizSet('type', ...)` | N/A | N/A | Select appointment type + notes | Works | Works | (unit/e2e follow-up) |
| Wizard confirm | `window._schedWizConfirm()` | `POST /api/v1/sessions` or `PATCH /api/v1/sessions/{id}` | sessions router | Shows saving state; reports true success/failure | Works | If backend rejects, show error and keep wizard | (backend tests cover 409/400; UI e2e follow-up) |

### Appointment selection and side panel actions

| Label | Frontend handler | Route/API | Backend | Expected behavior | Demo behavior | Degraded behavior | Tests |
|---|---|---|---|---|---|---|---|
| Appointment click/select | click `.dv2s-event` → `window._schedSelectEvent(id)` | re-render | N/A | Opens side panel | Works | Works | (e2e follow-up) |
| Reschedule | `window._schedReschedule(id)` | `PATCH /api/v1/sessions/{id}` | sessions router | Opens wizard prefilled; on save persists or errors truthfully | Disabled for demo sample appts | Shows backend error if rejected | backend tests |
| Cancel appointment | `window._schedCancelEvent(id)` | `PATCH /api/v1/sessions/{id}` via `api.cancelSession` | sessions router | **Requires reason**; persists cancel_reason | Disabled for demo sample appts | Shows backend error if rejected | backend tests |
| Check conflicts | `window._schedCheckConflictsBtn(id)` | `POST /api/v1/schedule/conflicts` | schedules router | Uses server check when available; fallback is local-only and labeled in toast | Works | If server fails, fallback toast must not imply authoritative | backend tests + UI e2e follow-up |
| Open chart | `window._schedOpenChart(id)` | web route | N/A | Navigates to patient hub/profile context | Works | If patient id missing, no-op | drill-out check |
| Mark attended/no-show/cancel | `window._schedMarkAttended(id)` | `PATCH /api/v1/sessions/{id}` | sessions router | Enforces status transitions; errors truthfully | Disabled for demo sample appts | Errors truthfully | backend tests |
| Open Assessments | `window._schedOpenAssessments(id)` | `window._nav('assessments-v2')` | N/A | Opens assessments hub for patient | Works | Works | drill-out check |
| Open Protocol Studio | `window._schedOpenProtocol(id)` | `window._nav('protocol-studio')` | N/A | Opens protocol hub | Works | Works | drill-out check |
| Open Session Prep / Execution | `window._schedOpenSessionPrep(id)` | `window._nav('session-execution')` | N/A | Opens session execution module | Works | Works | drill-out check |
| Session audit | `window._schedSessionAudit(id)` | `GET /api/v1/sessions/{id}/events` | sessions router | Displays audit availability; no crashes | Not available for demo sample appts | Shows backend error if rejected | backend tests |

### Referral actions (Booking queue)

| Label | Frontend handler | Route/API | Backend | Expected behavior | Demo behavior | Degraded behavior | Tests |
|---|---|---|---|---|---|---|---|
| Triage referral | `window._schedTriageLead(id)` | `api.triageReferral` (stubbed) | N/A | If backend missing: must say **local-only** | Works | Works | (unit/e2e follow-up) |
| Dismiss referral | `window._schedDismissLead(id)` | `api.dismissReferral` (stubbed) | N/A | If backend missing: must say **local-only** | Works | Works | (unit/e2e follow-up) |
| Assign clinician | `window._schedAssignLead(id)` | local-only | N/A | Must say **local-only** | Works | Works | (unit/e2e follow-up) |
| Book intake | `window._schedBookLead(id)` | booking wizard + sessions API | sessions router | Truthful booking outcome | Works | Works | (unit/e2e follow-up) |

### Workload / staff actions

| Label | Frontend handler | Route/API | Backend | Expected behavior | Demo behavior | Degraded behavior | Tests |
|---|---|---|---|---|---|---|---|
| Add shift | `window._schedOpenShiftModal()` / `_schedSubmitShift('shift')` | `api.createStaffShift` (stub) | N/A | Must show “not available in this build” and not fake success | Works | Works | (unit/e2e follow-up) |
| Mark PTO | `window._schedOpenPtoModal()` / `_schedSubmitShift('pto')` | `api.createStaffShift` (stub) | N/A | Must show “not available in this build” and not fake success | Works | Works | (unit/e2e follow-up) |

## Drill-out route matrix (no dead ends)

| Action | Route | Exists in `apps/web/src/app.js` | Expected |
|---|---|---:|---|
| Open Schedule | `scheduling-hub` / `schedule-v2` | Yes | Always lands in `pgSchedulingHub` |
| Open chart | `patients-hub` / `patient-profile` | Yes | Opens patient context (if patient id available) |
| Assessments | `assessments-v2` | Yes | Opens assessments hub |
| Protocol | `protocol-studio` | Yes | Opens protocol hub |
| Session prep | `session-execution` | Yes | Opens session execution |

## Stubbed / not implemented (must be labeled honestly)

- `api.listStaffSchedule` → rejects `not_implemented`
- `api.createStaffShift` → rejects `not_implemented`
- Referral triage/dismiss/assign are **local-only** unless backend endpoints ship

## Tests (expected to be run before merge)

### Frontend

- `cd apps/web && npm run test`
- `cd apps/web && npm run build`
- `npx playwright test e2e/07-scheduling-golive.spec.ts`

### Backend

- `cd apps/api && python3 -m pytest -q tests/test_schedule_router.py tests/test_demo_clinic_seed.py`

## Tomorrow doctor-demo script (controlled preview)

1. Open **Schedule** from sidebar or dashboard.
2. Point at the banner: **Demo schedule — synthetic, non‑PHI**.
3. State safety: “Scheduling supports operational workflow only — not emergency triage, diagnosis, prescribing, or autonomous decision-making.”
4. Switch views: **Week → Day → Resources → Month**.
5. Use filters: clinician + type + rooms.
6. Click an appointment to open the side panel.
7. Click **Open chart** (patient hub/profile).
8. Click **Check conflicts**:
   - Explain “server check when available; otherwise local-only estimate”.
9. Click **Session prep** (session execution module).
10. Open **New booking** wizard:
    - Demonstrate steps; only confirm if backend preview API is ready.
11. Switch to **Booking queue**:
    - Explain triage/dismiss/assign are **local-only** in this build unless backend is enabled.
12. Switch to **Workload**:
    - Explain shift management is **not available in this build** (no fake success).
13. Close: “Schedule coordinates operational workflow and resources; it does not approve treatment or replace staff judgment.”

