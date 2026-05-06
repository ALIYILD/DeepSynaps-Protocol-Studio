# Clinical Inbox — live demo readiness (doctor-facing)

Scope: **DeepSynaps Studio → Clinical → Inbox** (`?page=clinician-inbox`, alias `?page=inbox`).

This document is intentionally explicit about what the Inbox **is** and **is not**:

- **Is**: a deterministic **clinical work queue** aggregating **HIGH-priority audit/activity mirror rows** emitted by connected workflow surfaces.
- **Is not**: an AI diagnostic system, an emergency triage system, autonomous prescribing/dosing/treatment planning, or a guarantee of safety outcomes.

## What a “doctor-ready” Inbox means for tomorrow’s demo

Must be true in the demo build:

- Inbox loads without console errors and shows an honest **scope/safety banner**.
- A clinician can **see a realistic (but clearly DEMO / non-PHI) queue** in demo mode.
- A clinician can **filter** (surface, status), **search**, **export CSV**, **acknowledge** (single + bulk) with a **required note**, and **drill out** without dead ends.
- When the API is unavailable for real clinician sessions, the UI shows a **truthful degraded/offline state** (no fake “success”).
- Demo data **never** appears for production clinician sessions unless the backend explicitly returns demo-marked rows.
- Priority remains **deterministic** and **transparent** (rule-based).

## Visible Inbox sections (UI inventory)

Rendered by `apps/web/src/pages-inbox.js` (design preserved):

- **Scope / safety disclaimer banner** (work queue; decision support; not emergency triage; not autonomous diagnosis/prescribing/dosing/treatment planning)
- **KPI counters**: Unread HIGH-priority, Last 24 hours, Last 7 days, Surfaces with traffic
- **Queue lenses/tabs** (category buckets)
- **Search + filters row**: Search, Surface dropdown, Status dropdown
- **DEMO banner**: only when server/shim returns `is_demo_view=true`
- **Connection banners**
  - Hard failure banner (no data yet)
  - Stale refresh banner (polling refresh failed but last data retained)
- **Grouped patient/event cards**
- **Row actions**
  - Single acknowledge (“Acknowledge…”) with required note
  - Bulk acknowledge (“Acknowledge selected”) with required note
  - Open source (drill-out)
  - Export CSV

## Button/action matrix (end-to-end wiring)

| Label (UI) | Frontend handler | API call / route | Backend implementation | Expected result | Demo / offline behavior | Test coverage |
|---|---|---|---|---|---|---|
| Inbox mount | `pgClinicianInbox()` | `POST /api/v1/clinician-inbox/audit-events` (`event=view`) | `clinician_inbox_router.post_audit_event` → `_audit()` | Breadcrumb audit row best-effort | In demo-token sessions, shim accepts shape (no network) | `apps/web/src/clinician-inbox-launch-audit.test.js` (source-grep contract) |
| Poll refresh | `setInterval(...30_000...)` → `loadInboxData()` | `GET /items` + `GET /summary` | `clinician_inbox_router.list_items` + `get_summary` | Refresh counts/rows | Stops polling when user navigates away (URL page check) | Source-grep contract for polling tick exists |
| Search | input handler → `refreshInboxDomNav()` | none (client-side) | n/a | Filters current loaded items | Same | N/A (logic embedded; smoke-tested via manual demo) |
| Filter: Surface | dropdown onchange → `loadInboxData()` | `GET /items?surface=...` | `_query_high_priority_rows(...surface=...)` | Server-side surface filter | Demo-token uses shimmed response | Unit contracts in `clinician-inbox-launch-audit.test.js` cover param builder |
| Filter: Status | dropdown onchange → `loadInboxData()` | `GET /items?status=unread|acknowledged|''` | list filters (`unread`, `acknowledged`/`reviewed`) | Server-side status filter | Demo-token: UI demo ack is persisted locally so status toggles are meaningful | Backend tests added in `apps/api/tests/test_clinician_inbox_router.py` |
| Queue lens tabs | `.inbox-cat-btn` → `refreshInboxDomNav()` | none | n/a | Client-side category bucket | Same | Source contract asserts category mapping exists |
| Select row | checkbox change | none | n/a | Updates selection, disables/enables bulk button | Same | Manual demo; bulk button disabled when none selected |
| Acknowledge (single) | `.inbox-ack-btn` | `POST /items/{id}/acknowledge` body `{note}` | `acknowledge_item` | Writes audit ack row; item becomes acknowledged in subsequent fetches | Demo-token: stored locally (does not claim backend persistence) | Backend tests: note required, ack writes row |
| Acknowledge selected | `#inbox-bulk-ack-btn` | `POST /items/bulk-acknowledge` body `{event_ids,note}` | `bulk_acknowledge` | Writes ack rows; partial failures reported | Demo-token: stored locally | Backend tests: note + event_ids required |
| Open source | `.inbox-drillout-btn` | UI navigation (route id) | n/a | Routes to correct module | No dead ends (mapping updated to existing routes) | `clinician-inbox-launch-audit.test.js` pins mapping |
| Export CSV | `#inbox-export-csv-btn` | `GET /export.csv` (binary) | `export_csv` | Downloads `text/csv`; DEMO prefix when demo rows included | Demo-token: client generates `DEMO-clinician-inbox.csv` with `# DEMO` header | Backend test: export returns CSV + headers |

## Drill-out / navigation matrix (surface → route)

Single source of truth (mirrored in both frontend + backend):

- `patient_messages` → `patient-messages`
- `adherence_events` → `adherence-hub`
- `home_program_tasks` → `home-tasks-v2`
- `wearables` → `patient-wearables`
- `wearables_workbench` → `monitor` (sets monitor tab)
- `adverse_events_hub` → `adverse-events` (lands on full AE hub when drill params exist)
- `quality_assurance` → `quality-assurance`
- `course_detail` → `course-detail`
- `patient_profile` → `patient-profile`

## Backend demo data: how the demo queue becomes “alive”

There are **two** honest demo paths:

1) **Offline demo-token session (Netlify preview / dev only)**  
`apps/web/src/api.js` short-circuits most API calls and returns **synthetic, non-PHI** demo inbox data with `is_demo_view=true`. This is explicitly an **offline demo mode** (not “backend is healthy”).

2) **Real backend demo seed (local dev / demo DB)**  
`apps/api/scripts/seed_demo.py` now seeds:

- a demo clinic (`clinic-demo-default`)
- a demo clinician with `clinic_id=clinic-demo-default`
- **Clinician Inbox audit rows** marked `DEMO` + `priority=high` so the real API returns realistic queue items

Run:

```bash
cd apps/api
python scripts/seed_demo.py
```

Reset demo DB: delete the local sqlite DB you’re using (or follow your environment’s DB reset workflow) and re-run seed.

## Clinical safety / governance checks (Inbox copy)

Inbox scope banner (frontend) explicitly states:

- “clinical work queue (audit signals)”
- “decision support only”
- “not an emergency triage system”
- “not autonomous diagnosis, prescription, dosing, or treatment planning”

Priority rules are deterministic and documented in `apps/api/app/routers/clinician_inbox_router.py`:

- note contains `priority=high`, or
- action suffix `_to_clinician` / `_to_clinician_mirror`, or
- explicit allowlist (`ALWAYS_HIGH_ACTIONS`)

## Notifications / real-time limitations (honesty)

- Inbox uses **30s polling** (2 GETs per interval: `/items` + `/summary`).
- The separate notifications SSE stream is **in-memory** and not multi-instance durable; Inbox does **not** claim durable real-time guarantees.

## Must-fix vs nice-to-have

- **Must-fix (for tomorrow)**:
  - Drill-outs map to real routes (no dead ends)
  - Demo queue is clearly DEMO/non-PHI and meaningful (8–12 items)
  - Demo acknowledgements behave coherently (items can become “reviewed” in demo)
  - Export CSV works and is DEMO-prefixed in demo
  - Real sessions never see silent fake data
  - Degraded/offline states are truthful
  - Polling does not duplicate and stops when leaving the page

- **Nice-to-have (post-demo)**:
  - Durable notifications (DB-backed) and/or SSE for inbox refresh
  - Assignment/snooze/owner workflow beyond acknowledge
  - First-class inbox item table (if we ever need non-audit state)

## Tomorrow’s doctor-demo script (click-by-click)

1. Open **Clinical → Inbox** (`Today → Inbox`).
2. Point out the **Scope / safety** banner (work queue; decision support; not emergency triage; not autonomous).
3. Point out the **DEMO banner** (“DEMO sample data / non-PHI / exports DEMO-prefixed”).
4. Highlight **Unread HIGH-priority** counter and the grouped patient cards.
5. Use **Surface filter** (e.g. Patient Messages vs Adverse Events).
6. Use **Status filter** (Unread → Reviewed/Acknowledged → All).
7. Use **Search** (patient id fragment or “priority=high” / “consent”).
8. Click **Open source** on:
   - a **patient message** item (lands on `patient-messages`)
   - an **adverse event** item (lands on `adverse-events` drill-in)
9. Return to Inbox; click **Acknowledge…** on one item; enter a brief note (required).
10. Select 2–3 items and click **Acknowledge selected**; enter a note (required).
11. Click **Export CSV** and open the downloaded file; point out DEMO prefix/header.
12. Close: explain that the Inbox is a **deterministic audit/activity aggregation queue**, not AI triage.

