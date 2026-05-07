## Clinician Digest — live readiness (controlled doctor preview)

### Scope statement

The **Clinician Digest** page (`?page=clinician-digest`, alias `?page=daily-digest`) is an **audit/hub-backed clinical activity briefing** for a selected reporting window.

- **What it is**: deterministic aggregates and event listings derived from `audit_events` and existing clinician hub tables (Inbox / Wearables Workbench / Adherence Hub / Wellness Hub / Adverse Events).
- **What it is not**: a full clinic census, an “all clear” signal, or an autonomous clinical decision system.

### Safety statement (doctor-demo-ready)

For this controlled preview demo:

- **Decision support only**: supports workflow review; **does not diagnose, prescribe, triage emergencies, or act autonomously**.
- **Audit/hub-backed**: digest counts are **deterministic audit/hub aggregates**, **not AI-generated clinical conclusions**.
- **Not a census**: absence of items in a window does **not** imply patients are stable/risk-free or that other workflows are clear.
- **Delivery honesty**: “Email digest” and “Share with colleague” are **audit-queued** unless the backend reports `delivery_status="sent"`. Do not imply delivery when it is queued.

### Demo / degraded behavior

- **Demo banner**: shown only when the API returns `is_demo_view=true`.
  - Must say: “**Controlled preview using synthetic non‑PHI** … exports are **DEMO-prefixed** and **not regulator‑submittable**.”
- **Degraded network/API**: if API fails, show a truthful “Digest unavailable” banner and allow “Retry”.

---

## Button / action matrix (doctor-demo-ready contract)

Legend:
- **FE handler**: `apps/web/src/pages-courses.js`
- **FE API client**: `apps/web/src/api.js`
- **BE router**: `apps/api/app/routers/clinician_digest_router.py`
- **Tests**:
  - FE: `apps/web/src/clinician-digest-launch-audit.test.js`
  - BE: `apps/api/tests/test_clinician_digest_launch_audit.py`

### Filters / controls

| Label | Frontend handler | API / route | Backend handler | Expected behavior | Demo behavior | Degraded behavior | Test coverage |
|---|---|---|---|---|---|---|---|
| Period preset | `_cdgBindControls` (`#cdg-preset`) → `_cdgPresetWindow` → `_cdgLoadData` | `GET /api/v1/clinician-digest/{summary,sections,events}` | `get_summary`, `get_sections`, `list_events` | Updates window (`since/until`) and reloads counts/events | Works with demo data when `is_demo_view=true` | If API fails: show “Digest unavailable” + Retry | FE presetWindow tests; BE date-range tests |
| Since (ISO) | `_cdgBindControls` (`#cdg-since`) → `_cdgLoadData` | same | same | Overrides since; reload | same | same | FE filter-param tests; BE window tests |
| Until (ISO) | `_cdgBindControls` (`#cdg-until`) → `_cdgLoadData` | same | same | Overrides until; reload | same | same | FE filter-param tests; BE window tests |
| Surface filter | `_cdgBindControls` (`#cdg-surface`) → `_cdgLoadData` | same (query `surface`) | `get_summary`, `get_sections`, `list_events` | Filters summary/sections/events coherently to that surface | same | same | BE events surface-filter test; BE summary/sections filter tests (added) |
| Patient ID filter | `_cdgBindControls` (`#cdg-patient`) → `_cdgLoadData` | same (query `patient_id`) | `get_summary`, `get_sections`, `list_events` | Filters summary/sections/events coherently to that patient | same | same | BE events patient-filter test; BE summary/sections filter tests (added) |

### Primary actions

| Label | Frontend handler | API / route | Backend handler | Expected behavior | Demo behavior | Degraded behavior | Test coverage |
|---|---|---|---|---|---|---|---|
| Email digest | `_cdgBindControls` (`#cdg-email-btn`) | `POST /api/v1/clinician-digest/send-email` | `send_digest_email` | Records audit `clinician_digest.email_sent`; returns `delivery_status` (`queued` unless SMTP wired) | Must clearly communicate **queued/audit-only** | If API fails: toast “Email send failed.” | BE send-email tests; FE source contract strings |
| Share with colleague | `_cdgBindControls` (`#cdg-share-btn`) | `POST /api/v1/clinician-digest/share-colleague` | `share_with_colleague` | Records audit `clinician_digest.colleague_shared`; enforces same-clinic recipient for clinicians; returns `queued` unless delivery wired | Must clearly communicate **queued/audit-only** | 404 for cross-clinic/unknown → safe toast | BE share tests |
| Export CSV | `#cdg-csv-btn` link + audit ping | `GET /api/v1/clinician-digest/export.csv` | `export_csv` | Downloads valid CSV; scoped rows only; `Content-Disposition` DEMO-prefix when demo rows included; `X-ClinicianDigest-Demo` header | Demo exports must be **DEMO-prefixed** and **not regulator-submittable** | If API unreachable: browser download fails; page still usable | BE export CSV tests; FE export URL tests |
| Export NDJSON | `#cdg-ndjson-btn` link + audit ping | `GET /api/v1/clinician-digest/export.ndjson` | `export_ndjson` | Downloads valid NDJSON; scoped rows only; DEMO-prefixed when demo rows included | same | same | BE export NDJSON tests; FE export URL tests |

### Drill-out / navigation actions

| Label | Frontend handler | API / route | Backend handler | Expected behavior | Demo behavior | Degraded behavior | Test coverage |
|---|---|---|---|---|---|---|---|
| Open (priority item) | `_cdgBindSectionDrillOuts` (`.cdg-drill-event-btn`) | none (navigation only) | n/a | Navigates to `?page=<route>` derived from `drill_out_url` or surface route mapping | Works with demo | If destination missing: safe placeholder via toast/alert (“module not available… no clinical action taken…”) | FE source contract contains wiring; BE drill_out_url test |
| Open hub (section card) | `_cdgBindSectionDrillOuts` (`.cdg-drill-section-btn`) | none | n/a | Navigates to hub route for that surface | Works with demo | Safe placeholder if route missing | FE source contract contains wiring |
| Patient link (top patients) | `_cdgBindSectionDrillOuts` (`.cdg-drill-patient-btn`) | none | n/a | Navigates to patient profile route (or surface route) with selected patient id | Works with demo | Safe placeholder if patient view missing | FE source contract contains wiring |
| “Other modules” shortcuts | `_cdgBindRetryAndExtras` (`.cdg-nav-extra`) | none | n/a | Navigation only; must not imply digest aggregation | Works with demo | If destination missing: safe placeholder | FE source contract includes “navigation only” copy |
| Audit/event detail links | n/a | n/a | n/a | No dedicated event detail drill-out is required for demo; audit trail shortcut exists | n/a | n/a | n/a |

---

## API endpoint matrix (verified contract)

| Endpoint | Purpose | Key query/body fields | Response fields used by FE | Notes |
|---|---|---|---|---|
| `GET /api/v1/clinician-digest/summary` | KPI strip + window | `since`, `until`, `surface?`, `severity?`, `patient_id?`, `actor_id?` (admin) | `handled`, `escalated`, `paged`, `open`, `sla_breached`, `by_surface`, `since`, `until`, `is_demo_view`, `disclaimers` | Deterministic aggregates; not LLM |
| `GET /api/v1/clinician-digest/sections` | Per-surface cards | `since`, `until`, `surface?`, `severity?`, `patient_id?` | `sections[]`, `is_demo_view`, `since`, `until` | Filters align with page filters |
| `GET /api/v1/clinician-digest/events` | Timeline list | `since`, `until`, `surface?`, `severity?`, `patient_id?`, `limit?` | `items[]` (incl `drill_out_url`, `is_demo`, flags) | Line-level, filtered |
| `POST /api/v1/clinician-digest/send-email` | Audit-queued email | `{recipient_email?, reason?, since?, until?}` | `delivery_status`, `recipient_email`, `audit_event_id` | “queued” is not delivery |
| `POST /api/v1/clinician-digest/share-colleague` | Audit-queued share | `{recipient_user_id, reason?, since?, until?}` | `delivery_status`, `recipient_user_id`, `recipient_email?` | Cross-clinic protected |
| `GET /api/v1/clinician-digest/export.csv` | CSV export | same filters as events | file download | DEMO-prefixed when demo rows |
| `GET /api/v1/clinician-digest/export.ndjson` | NDJSON export | same filters as events | file download | DEMO-prefixed when demo rows |
| `POST /api/v1/clinician-digest/audit-events` | Page breadcrumb audit | `{event, target_id?, note?, using_demo_data?}` | none (fire-and-forget) | Must never block UI |

---

## Drill-out route matrix (current mapping)

| Digest surface | Drill-out route id |
|---|---|
| `clinician_inbox` | `clinician-inbox` |
| `wearables_workbench` | `monitor` |
| `clinician_adherence_hub` | `clinician-adherence` |
| `clinician_wellness_hub` | `clinician-wellness` |
| `adverse_events_hub` | `adverse-events` |

---

## Email/share delivery status (truthful demo contract)

- **`delivery_status="queued"`** means: recipient selected + audit row written. **It does not mean delivered.**
- Only if the backend returns **`delivery_status="sent"`** may the UI describe it as delivered.

---

## Demo seed (synthetic, deterministic)

- Seed module: `apps/api/app/services/demo_clinic_seed.py`
- Enable only when:
  - `DEEPSYNAPS_APP_ENV` is `development` or `test`
  - and `DEEPSYNAPS_DEMO_CLINIC_SEED=1`
- Demo patients (fixed ids):
  - `demo-pt-samantha-li`
  - `demo-pt-elena-vasquez`
  - `demo-pt-marcus-chen`
  - `demo-pt-omar-haddad`
  - `demo-pt-amelia-brown`

Seed ensures (digest surfaces):
- `handled > 0`, `escalated > 0`, `paged > 0`, `open > 0`, `sla_breached > 0`
- At least **two** “Today’s clinical priorities” (from `paged` rows).

---

## Tomorrow doctor-demo script (click-through)

- Open `?page=clinician-digest`.
- Point out:
  - Safety sentence (“decision support only; not diagnosis/prescribing/emergency triage/autonomous”).
  - Demo/non‑PHI disclosure (if demo banner shown).
  - “audit/hub-backed aggregates, not AI-generated clinical conclusions”.
- Use **Period** preset (Today / 7d) and show that summary + sections + timeline update.
- Use **Surface** filter and show coherent filtering across summary/sections/events.
- Use **Patient ID** filter and show coherent filtering.
- Show KPI strip: **Handled / Escalated / Paged / Open / SLA breached**.
- Show “Today’s clinical priorities”, open one item (“Open”).
- Show “Hub activity by surface”, click “Open hub”.
- Export **CSV** (note DEMO prefix in demo), then export **NDJSON**.
- Click **Email digest**; explain “queued/audit-only” unless SMTP is wired.
- Click **Share with colleague**; explain “queued/audit-only” unless delivery is wired.
- Close: “This summarizes operational activity from connected clinical hubs; it is not a full clinical census and does not replace clinician judgement.”

