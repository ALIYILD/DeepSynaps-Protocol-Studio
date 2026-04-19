# DeepSynaps Studio — Design v2 Merge Map

Source of truth for the design-v2 migration. Each destination screen lists every legacy hub/page that must be merged in, so no feature is lost during the rebuild.

Branch: `feat/design-v2` · Prototype: `design-v2-prototype.html` (at repo root, gitignored copy for reference only).

## Primary nav — 12 canonical screens + 7 extension hubs

### 01 · Landing
- **From:** `pgHome` (pages-public.js)
- **Keep:** public marketing, modality index, condition cards, pricing CTA, patient portal entry, SSO sign-in entry

### 02 · Sign in / Sign up
- **From:** `showLogin` overlay in `auth.js`, role picker, demo-login buttons
- **Keep:** email/password, role picker (Clinician/Patient), SSO, demo access tab, password reset flow

### 03 · Clinic Dashboard
- **From:** `pgDash` (pages-clinical.js:650)
- **Keep:** KPI strip (caseload/responder rate/review queue), Today's Schedule, live brain-map targets card, caseload table, evidence governance callout, activity feed, outcomes trend

### 04 · Schedule (coordinator week view)
- **From:**
  - Scheduling Hub (pages-clinical-hubs.js — `pgSchedulingHub`)
  - **Referrals** (wherever referral flows live)
  - **Staff Scheduling** (clinician/room roster)
- **Keep:** week view × clinician columns, conflict/consent warnings, event detail panel, referral intake, staff roster view

### 05 · Assessments
- **From:**
  - Assessments Hub (pages-clinical-hubs.js — `pgAssessmentsHub`)
  - **All assessment backend + registries** (`scale-assessment-registry.js`, `assess-instruments-registry.js`)
  - Enter Scores flow
- **Keep:** Queue/Cohort/Library/Individual tabs, PHQ-9 item-9 red-flag escalation, brain-map linkage to symptom clusters, AI summary, trend chart, comparative norms, PDF export, clinician co-sign

### 06 · Brain Map Planner
- **From:**
  - Brain Map Planner (currently part of Protocol Hub)
  - **Protocol Designer** component (from Protocol Hub — `pgProtocolHub`)
  - `brain-map-svg.js` / `renderBrainMap10_20`
- **Keep:** Clinical/Montage/Research tabs, target atlas sidebar, 2D 10-20 + 3D + inflated + E-field views, timeline scrubber, session parameters, evidence cards, contraindications, save/export

### 07 · Patients (caseload list)
- **From:** `pgPatients` / `pgPatientHub` patients tab
- **Keep:** status tabs, KPI strip, sortable table (MRN/condition/protocol/progress/next step), pagination, row → patient detail routing

### 08 · Patient (individual dashboard)
- **From:**
  - `pgPatientProfile` (pages-clinical.js)
  - **Patient Dashboard** (patient portal — `pgPatientDashboard`)
- **Keep:** gradient hero + countdown, quick tiles (check-in/exercise/reading/DM), progress bars, mood grid (28-day), wellness ring + wearable metrics, target explainer, home program, care team, upcoming appointments

### 09 · Protocol Studio (generator wizard)
- **From:**
  - Protocol Hub backend + generator (`pgProtocolHub`, `protocols-data.js`, generation-engine package)
  - **Registry** (modality/device/condition registries)
  - **Brain Map** preview
  - **Protocol Designer** authoring surface
- **Keep:** 5-step wizard (Condition → Phenotype → Modality → Device → Target/Montage), live brain map preview, resolved parameters panel, "will render" document list, safety-engine status, registry-current indicator, save to protocol library

### 10 · Live Session (session runtime)
- **From:**
  - Session execution page
  - **Virtual Care Hub** — all functions (video consult, remote monitoring, telehealth room)
  - Monitor Hub (pull in if needed — real-time device telemetry)
- **Keep:** countdown ring, live current + impedance readouts, 60s current trace, side-effect panel, operator checklist, montage brain map, event log, video-consult overlay, remote-monitoring widgets

### 11 · Handbooks
- **From:**
  - Handbooks tab currently inside **Protocol Hub**
  - `handbooks-data.js` / `HANDBOOK_DATA`
  - `pgHandbooks` if present
- **Keep:** three-pane layout (collections rail / reading pane / TOC), 65-condition rich handbook library, interactive checklists, version history, back-references

### 12 · Governance
- **From:** existing Governance content (IRB flows stay in Research hub below; this screen focuses on evidence grading + AE register + audit log + approval pipeline)
- **Keep:** compliance dial, approval pipeline kanban (Draft/In-review/Sign-off/Published), evidence ledger with A–D grades, reviewer load board, AE register, audit log

---

## Extension hubs — additional nav entries

### 13 · Documents
- **From:** `pgDocumentsHubNew` (pages-clinical-hubs.js), `documents-templates.js`, documents_router.py
- **Keep:** All Documents, Templates, Consent, Letters, Uploads tabs; 15 real template bodies; Preview modal; Send-to-Sign; Upload; Download

### 14 · AI Practice Agent
- **From:** `pages-agents.js` + AI agent chat widget
- **Keep:** agent list, per-agent chat, protocol recommendations, evidence citation

### 15 · Reports
- **From:** Reports Hub (all report generation, analytics, export)
- **Keep:** Generate / Recent / Analytics / Export tabs, auto-report templates, PDF export

### 16 · Library
- **From:** Library Hub (literature, evidence, devices, conditions browser)
- **Keep:** overview, condition summary, external search, evidence summarization, live literature watch

### 17 · Finance
- **From:** Finance Hub + **Insurance** flows
- **Keep:** revenue/AR/billing/insurance claims/payer-mix dashboards, invoice generation, payment tracking

### 18 · Research
- **From:**
  - Quality Assurance (protocol coverage audit, etc.)
  - Longitudinal Report
  - Data Export (GDPR Article 20 + research exports)
  - IRB Manager
- **Keep:** IRB protocol authoring, participant consent tracking, adverse-event escalation, cohort builder, data export scheduler, longitudinal outcome tracking

### 19 · Home Task Manager
- **From:** `pgHomeworkBuilder`, `home-program-condition-templates.js`, `home-program-task-sync.js`
- **Keep:** task authoring, condition-based templates, sync engine, completion tracking, adherence analytics

---

## Non-goals / deferred

- **Brain scan AI analysis** (currently in Protocol Hub) — stays as a sub-tool under Brain Map Planner
- **Legacy Protocol Hub landing** — removed; its children reparented to Studio (09), Brain Map (06), Handbooks (11), Registry (inside 09)
- **Patient Portal sub-pages** (pt-journal, pt-wellness, pt-learn, pt-media-*, pt-outcomes) — stay as patient-role routes, not top-level clinician nav

---

## Phase order (recommended)

| # | Phase | Touches |
|---|---|---|
| 0 | Foundation: design tokens + nav + dev screen switcher | `styles.css`, `app.js` sidebar config |
| 2 | Clinic Dashboard (03) | `pages-clinical.js` `pgDash` |
| 1 | Landing (01) + Auth (02) | `pages-public.js` `pgHome`, `auth.js` |
| 4 | Patients list (07) + Patient detail (08) | `pgPatientHub`, `pgPatientProfile` |
| 3 | Schedule (04) + Referrals + Staff | `pgSchedulingHub` + new code |
| 5 | Protocol Studio (09) + Registry | `pgProtocolHub` → `pgProtocolStudio` |
| 6 | Assessments (05) | `pgAssessmentsHub` |
| 7 | Brain Map Planner (06) | new screen wrapping `brain-map-svg.js` |
| 8 | Live Session (10) + Virtual Care | session exec + VC hub merge |
| 9 | Handbooks (11) | unpack from Protocol Hub |
| 10 | Governance (12) | existing governance page |
| 11 | Extensions: Documents, AI Agent, Reports, Library, Finance, Research, Home Tasks | token-refresh of each hub (no function change) |
| 12 | Polish: Tweaks panel, responsive, a11y, delete old UI | all |

Each phase = its own PR merged to main before the next starts.
