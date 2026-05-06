# DeepSynaps Studio — Clinical Dashboard live demo readiness

This doc tracks **doctor-demo readiness** for the Clinical Dashboard (“Week view”) and its immediate drill-outs.

## Safety + demo disclosure (must be visible)

- **DEMO BUILD — demo data only, not real patient data.**
- **Clinical decision support only.** Not autonomous diagnosis, prescribing, dosing, or treatment planning. **Clinician review required.**

## Dashboard inventory + button/action matrix (from `pgDash`)

Source of truth: `apps/web/src/pages-clinical.js` (`pgDash`).

| Section / Card | Visible label | Button/action | Frontend handler | Route or API endpoint | Backend function (if applicable) | Current status | Required fix | Test added |
|---|---|---|---|---|---|---|---|---|
| Top bar | `+ Walk-in` | Add walk-in | `onclick="window._cdAddWalkin?.() || window._nav('clinic-day')"` | Route: `clinic-day` | N/A (SPA route) | **Partial** (depends on `_cdAddWalkin`) | Ensure always navigates; if read-only, disable w/ reason | TBD |
| Top bar | `⚠ Risk Analyzer` | Open Risk Analyzer | `window._nav('risk-analyzer')` | Route: `risk-analyzer` | N/A (SPA route) | **Works** (route exists) | Add honest degraded state if module/API unavailable | TBD |
| Top bar | `🧠 DeepTwin` | Open DeepTwin | `window._nav('deeptwin')` | Route: `deeptwin` | N/A (SPA route) | **Works** (route exists) | Add honest degraded state if module/API unavailable | TBD |
| Top bar | `▶ Start Session` | Start session console | `window._nav('session-execution')` | Route: `session-execution` | N/A (SPA route) | **Partial** (no selected context by default) | Ensure it carries course/session context when launched from schedule | TBD |
| Top bar | `⚠ Report AE` | Report adverse event | `window._nav('adverse-events')` | Route: `adverse-events` | API behind page | **Works** (route exists) | If API fails, show honest degraded state on target page | TBD |
| Page head tabs | `Day board` | Open clinic day board | `window._nav('clinic-day')` | Route: `clinic-day` | N/A | **Works** (route exists) | If missing data, show honest empty/degraded | TBD |
| Page head tabs | `Week view` | Current view | (no navigation) | N/A | N/A | **Works** | N/A | N/A |
| Page head tabs | `Month reports` | Open reports hub | `window._nav('reports-hub')` | Route: `reports-hub` | N/A (SPA route; API varies inside module) | **Works** (route exists) | If exports unavailable, disable export actions inside reports hub | TBD |
| Page head tabs | `Quarter reports` | Open reports hub | `window._nav('reports-hub')` | Route: `reports-hub` | N/A | **Works** | Same as above | TBD |
| Page head action | `Export data` | Export data | `window._nav('reports-hub')` | Route: `reports-hub` | N/A | **Partial** (navigates; export availability depends on module) | If exports not supported in build, disable with reason or add dashboard snapshot JSON export | TBD |
| Attention strip | `Awaiting sign-off` | Open review queue | `_renderChip(... 'review-queue' ...)` | Route: `review-queue` | API behind page | **Works** (route exists) | Ensure `review-queue` page handles empty/degraded | TBD |
| Attention strip | `New messages` | Open clinician inbox | `_renderChip(... 'clinician-inbox' ...)` | Route: `clinician-inbox` | API: `/api/v1/clinician-inbox/summary` + detail endpoints | **Works** (route exists) | If inbox summary unavailable, show count as unavailable and keep nav working | TBD |
| Attention strip | `Today's sessions` | Open clinic day board | `_renderChip(... 'clinic-day' ...)` | Route: `clinic-day` | N/A | **Works** | N/A | TBD |
| Attention strip | `Pending reviews` | Open review queue | `_renderChip(... 'review-queue' ...)` | Route: `review-queue` | API behind page | **Works** | N/A | TBD |
| Attention strip | `Critical flags` | Open AE hub | `_renderChip(... 'adverse-events' ...)` | Route: `adverse-events` | API behind page | **Works** | N/A | TBD |
| Alert strip (when present) | `Review now` | Open highest-tier queue | `window._nav(_topAlert.nav)` | Route: `adverse-events` / `wearables` / `media-queue` etc. | Module-specific APIs | **Works** (routes exist) | Ensure each destination page has honest degraded state | TBD |
| KPI card | `Active caseload` | Open patients hub | `onclick="window._nav('patients')"` | Route: `patients` → redirects to `patients-hub` | N/A | **Works** | N/A | TBD |
| KPI card | `Sessions delivered` | Open courses hub | `onclick="window._nav('courses')"` | Route: `courses` → redirects to `patients-hub` | N/A | **Works** | N/A | TBD |
| KPI card | `Responder rate` | Open outcomes | `onclick="window._nav('outcomes')"` | Route: `outcomes` | API behind page | **Works** (route exists) | Ensure outcomes module handles empty/degraded | TBD |
| KPI card | `Pending review` | Open review queue/outcomes | `window._nav(pendingQueue.length ? 'review-queue' : 'outcomes')` | Route | N/A | **Works** | N/A | TBD |
| Today’s schedule card | `Today's schedule` | Open schedule | `window._nav('scheduling-hub')` | Route: `scheduling-hub` | API behind page | **Works** (route exists) | Ensure schedule module handles empty/degraded | TBD |
| Today’s schedule card | `Launch →` | Launch session for slot | `window._startCourseSession(courseId)` or `window._nav('session-execution')` | Route: `session-execution` | N/A | **Partial** (needs context) | Ensure selected course/patient context is carried to session console | TBD |
| Targets card | `Active targets · today` | Open planner | `window._nav('brain-map-planner')` | Route: `brain-map-planner` | API behind page | **Works** (route exists) | Ensure planner module handles empty/degraded | TBD |
| Caseload card | `Active patient caseload` | All patients | `window._nav('patients')` | Route: `patients` → redirects to `patients-hub` | N/A | **Works** | N/A | TBD |
| Caseload card | (Queue row) | Open course detail | `window._openCourse(courseId)` | Route: `course-detail` (via global `_openCourse`) | API behind course UI | **Works** (global handler exists) | Ensure course detail has honest empty/degraded states | TBD |
| Evidence governance card | `Evidence governance` | Browse protocols | `window._nav('protocol-hub')` | Route: `protocol-hub` | API behind page | **Works** | N/A | TBD |
| Evidence governance card | (Modality row) | Open Protocol Studio | `onclick="window._nav('protocol-hub')"` | Route: `protocol-hub` | N/A | **Works** | N/A | TBD |
| Evidence governance card | `Generate protocol` | Open generator | `window._protocolHubTab='generate'; window._nav('protocol-hub')` | Route: `protocol-hub` | API behind page | **Works** | Ensure tab selection works even on refresh | TBD |
| Evidence governance card | `Evidence library` | Open research evidence | `window._nav('research-evidence',{tab:'search',source:'clinical-dashboard'})` | Route: `research-evidence` | API behind page | **Works** | N/A | TBD |
| Evidence governance card | `Labs / meds / diet evidence` | Open adjunct evidence | `window._nav('research-evidence',{tab:'adjunct',source:'clinical-dashboard'})` | Route: `research-evidence` | API behind page | **Works** | N/A | TBD |
| Quick actions card | `Quick actions` | Add Patient | `window._nav('patients')` | Route: `patients` | N/A | **Works** | If read-only role, hide/disable with reason | TBD |
| Quick actions card | `Quick actions` | New Course | `window._nav('protocol-wizard')` | Route: `protocol-wizard` | N/A | **Works** | If role lacks permission, disable with reason | TBD |
| Quick actions card | `Quick actions` | Assessments | `window._nav('assessments-hub')` | Route: `assessments-hub` | N/A | **Works** | Ensure assessments hub has honest empty/degraded | TBD |
| Quick actions card | `Quick actions` | Brain Map | `window._nav('brain-map-planner')` | Route: `brain-map-planner` | N/A | **Works** | N/A | TBD |
| Quick actions card | `Quick actions` | Review Queue | `window._nav('review-queue')` | Route: `review-queue` | API behind page | **Works** | N/A | TBD |
| Quick actions card | `Quick actions` | Reports | `window._nav('reports-hub')` | Route: `reports-hub` | N/A | **Works** | N/A | TBD |
| Needs attention card | `Needs attention` | Open patient profile | `window.openPatient(patientId)` | Route: `patient-profile` | API behind page | **Works** | Ensure patient profile handles empty/degraded | TBD |
| Risk stratification card | `Risk Stratification` | Open patient profile (row) | `onclick="window.openPatient(patient_id)"` | Route: `patient-profile` | API behind page | **Works** | If risk data missing, show honest empty state (already) | TBD |
| Clinic activity card | `Clinic activity` | Audit log | `window._nav('adverse-events')` | Route: `adverse-events` | API behind page | **Works** | Ensure AE page handles empty/degraded | TBD |
| Outcomes card | `Outcomes · cohort avg Δ` | Full report | `window._nav('outcomes')` | Route: `outcomes` | API behind page | **Works** | Ensure outcomes page handles empty/degraded | TBD |
| Protocol Studio card | `Protocol Studio` | Open Studio | `window._nav('protocol-hub')` | Route: `protocol-hub` | API behind page | **Works** | If research API unavailable, ensure “REGISTRY” badge is honest (already) | TBD |
| Agent strip | `Clinic specialist agents` | Open agents | `window._dashAgentOpen()` | API: `POST /api/v1/chat/agent` via `api.chatAgent(...)` | `apps/api/app/routers/chat_router.py::agent_chat` → `chat_agent_with_evidence(...)` | **Partial** (errors collapse to generic “Assistant unavailable”) | Show truthful degraded reason (provider not configured / backend unreachable); show citations panel when present | TBD |
| Patient profile (drill-out) | `⚠ Risk Analyzer` | Patient risk | `window._patDashRiskAnalyzer()` | Route: `risk-analyzer` | N/A | **Works** if route exists | Ensure patient ID context is passed or module shows “select patient” state | TBD |
| Patient profile (drill-out) | `🧠 Open in DeepTwin` | Patient DeepTwin | `window._patDashDeepTwin()` | Route: `deeptwin` | N/A | **Works** if route exists | Ensure patient ID context is passed or module shows “select patient” state | TBD |

## Notes / gaps (initial)

- Several dashboard actions navigate to other modules; “doctor-ready” requires those destinations to show **honest empty/degraded states**, not crash or fake success.
- The dashboard already includes a safety strip + demo banners; copy needs to exactly match the required disclaimers.

## Demo seed (deterministic, non-PHI)

Backend (API):

- **Enable**: set `DEEPSYNAPS_APP_ENV=development` (or `test`) and `DEEPSYNAPS_DEMO_CLINIC_SEED=1`.
- **What it creates** (synthetic + clearly labelled demo only):
  - 6 demo patients (names prefixed `DEMO …`, emails `demo.patient*@example.invalid`, `Patient.notes` prefixed `[DEMO]`).
  - Active + pending courses (with at least one `review_required`).
  - Today’s scheduled `ClinicalSession` rows.
  - Pending `ReviewQueueItem` rows.
  - Signed + expiring/expired `ConsentRecord` rows.
  - Adverse events (1 serious unresolved + 1 mild resolved), marked `AdverseEvent.is_demo=True`.
  - Wearable summaries + an urgent `WearableAlertFlag`.
  - Risk stratification traffic lights (`RiskStratificationResult`).
  - Clinician inbox high-priority demo rows (`AuditEventRecord.note` includes `priority=high`).
  - Media review queue demo uploads (`PatientMediaUpload.status=pending_review`).

Frontend (web):

- **Enable**: `VITE_ENABLE_DEMO=1` (build-time) to allow preview/demo sessions and the dashboard demo banner/copy.
- **Important**: production/non-demo builds must not silently seed `P-DEMO-*` sample content.

## Commands run (evidence)

Backend:

- `cd apps/api && python3 -m pytest -q`
  - Result: **PASS** (`3748 passed, 19 skipped`)

Frontend:

- `cd apps/web && npm run test:unit`
  - Result: **PASS** (`pass 1060`, `fail 0`)
- `cd apps/web && npm run build`
  - Result: **PASS**

