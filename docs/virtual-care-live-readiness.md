# Virtual Care — live readiness

## Scope

Virtual Care (`apps/web/src/pages-virtualcare.js`) is the clinician-facing hub for remote workflow support: unified tabs **Dashboard**, **Communications**, and **Live Session**. It integrates optional API data (sessions, patients, cohort KPIs, outcomes, wearable summaries, audit, alerts) and **never silently injects synthetic biometric or schedule rows in production builds**.

Entry routes: `virtual-care-hub` → `pgVirtualCareHub` → `pgVirtualCare`; aliases `live-session`, `live-session-monitor`.

## Safety & governance

- Virtual Care is **not** an emergency response system, **not** continuous bedside monitoring, and **not** autonomous clinical decision-making.
- Demo rows are **synthetic non-PHI** and appear only when `import.meta.env.DEV` or `VITE_ENABLE_DEMO === '1'`.
- Missing wearable metrics render **—** (em dash); they **do not** mean “safe” or “unsafe”.
- **Active targets** brain diagram is **illustrative workflow context only** — not treatment approval.
- Ward stress bands use **Lower / Mid / Higher band** labels — not “clinical Normal”.

## Environment

| Layer | Variable | Role |
|-------|----------|------|
| Frontend | `VITE_ENABLE_DEMO=1` | Allows labelled synthetic dashboard rows (preview/demo only). |
| Frontend | `VITE_API_BASE_URL` | FastAPI base URL for live API-backed metrics. |
| Backend | `DEEPSYNAPS_APP_ENV` | Runtime environment (existing app convention). |
| Backend | `DEEPSYNAPS_DEMO_CLINIC_SEED` | **Optional future** clinic seed flag — not wired in this repo revision; demo clinics use existing `clinic-demo-default`-style IDs where applicable. |

## Button / action matrix

| Label / control | Frontend handler | Route / API | Backend | Expected | Demo / local | Degraded |
|-------------------|------------------|-------------|---------|----------|--------------|----------|
| Sidebar **Virtual Care** | `navigate('virtual-care-hub')` | `virtual-care-hub` | — | Loads unified shell | Same | Same |
| Tab **Dashboard** | `_vcSwitchTab('dashboard')` | In-page | Lazy `pgVirtualCareDashboard` | Dashboard panel | Synthetic rows if demo flag | Empty KPIs **—** without cohort API |
| Tab **Communications** | `_vcSwitchTab('messaging')` | In-page | `pgVirtualCareLegacyFull` | Messaging UI | Hydrated fixtures | API lists empty → honest empty states |
| Tab **Live Session** | `_vcSwitchTab('livesession')` | In-page | `pgLiveSession` | Session workspace | Demo fixture if seeded | Empty state → Schedule / patients |
| **Open Video Assessments** | `onclick` | `video-assessments` | `pgVideoAssessments` | Opens module | Same | Same |
| Ward row **Launch** | `_vcdbLaunch` | Switches to Live Session tab + seed | — | Opens session prep | Allowed for `demo-pt-*` only when demo flag | Routes to `scheduling-hub` if demo launch blocked |
| Schedule **Launch** | `_vcdbLaunch` | Same | — | Requires patient context | Demo IDs launch when demo flag | No sessions → empty message; invalid → `scheduling-hub` |
| **Home Tasks** | `#vc-db-ht-btn` | `home-task-manager` | — | Opens tasks | Same | Same |
| **Day / Week / Month / Quarter / Export** | Period toggles (Day active); Export CSV | Export client-side only | — | Downloads schedule CSV | Uses visible rows | Empty CSV if no rows |
| Patient row (caseload / ward) | click | `patient-profile` + `_selectedPatientId` | — | Opens profile | Demo IDs navigate | Same |
| **Review now** (alert) | `#vc-db-alert-review-btn` | `reg-virtual-care` if demo alert; else `monitor-hub` | Wearable alerts API when live | Opens review surface | Demo banner when demo | Hidden when no alerts |
| **View audit log** | `#vc-db-audit-btn` | `audit-trail` | Audit API | Opens audit | Same | Empty activity card possible |

## API endpoints (dashboard parallel fetch)

| Client usage | HTTP |
|--------------|------|
| `api.me` | `GET /api/v1/me` (if present) |
| `api.listSessions` | Sessions list |
| `api.listPatients` | Patients |
| `api.getPatientsCohortSummary` | Cohort KPI source |
| `api.aggregateOutcomes` | Outcomes trends |
| `api.auditTrail` | Activity feed |
| `api.getClinicAlertSummary` | Alert banner |
| `loadResearchBundleOverview` | Evidence bundle |
| `api.getPatientWearableSummary(pid)` | Ward biometrics row merge |

If an endpoint fails or returns empty, the UI shows **—**, empty tables, or explanatory copy — never fabricated “healthy” vitals in production.

## Preview click-through (DevOps)

1. Build web with `VITE_ENABLE_DEMO=1` for preview.
2. Open `#virtual-care-hub` (or route configured in app sidebar).
3. Confirm top bar title reads **Virtual Care — …** (not `[object Object]`).
4. Confirm **Controlled preview** banner when demo flag on.
5. Confirm Ward Biometrics shows **Preview refresh (synthetic)** when demo rows active.
6. Toggle Communications / Live Session tabs — no console errors.

## Known limitations

- Communications / Live Session modules depend on additional APIs and local hydration; full messaging backend coverage is environment-specific.
- Global search `GET /api/v1/dashboard/search` is unrelated to Virtual Care and may not be surfaced here.

## Doctor-demo script (tomorrow)

1. Open **Virtual Care** from the sidebar.
2. Read the **Controlled preview** / workflow banner aloud (non-PHI, not emergency triage).
3. **Dashboard**: point to **Video motor assessments** → **Open Video Assessments**.
4. **Ward Biometrics**: explain API vs synthetic labels; show **—** for unavailable metrics.
5. Optionally click **Launch** on one schedule row **only** when demo mode or a real session ID is visible.
6. **Today’s schedule**: explain CSV export is derived from on-screen rows.
7. **Active targets**: clarify illustrative montage context — not approval.
8. **Communications** tab: workflow messaging — not emergency dispatch.
9. **Live Session** tab: documentation-oriented workspace until a session is loaded.
10. Close with: *“Virtual Care helps coordinate remote review and workflow. It does not replace clinician judgement, emergency services, or configured clinical monitoring.”*

## Tests

- `apps/web/src/pages-virtualcare-readiness.test.js` — source guardrails (topbar contract, banner copy, launch selector).

Run from `apps/web`:

```bash
node --test src/pages-virtualcare-readiness.test.js
npm run test:unit
npm run build
```
