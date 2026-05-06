# Best-in-class Neuromodulation Software Research — 2026-04-26

Research budget: 60 min. Sources: BrainsWay, Neuronetics TrakStar Cloud, Soterix
Neurotargeting + Open-Panel, MagVenture 360 + StimGuide Pro, Mensia Koala,
BrainMaster BrainAvatar, BEE Medic Cygnet, NeuroGuide, MNE-Python topomap docs,
Spring Health Compass, Doximity Dialer, Epic 2026 (Art / AI Charting), W3C
WCAG 2.2, FDA 21 CFR Part 11, FDA 2023 premarket software guidance, FDA Jan 2026
CDS guidance, HIPAA 2026 best-practice guides. Repo grounded against
`apps/web/src/` and `LAUNCH_READINESS_REPORT.md`.

## Executive summary

DeepSynaps already beats every competitor on **breadth** (one product covers TMS
+ tDCS + tACS + neurofeedback + qEEG + MRI + DeepTwin + portal + courses +
evidence + home program), on **safety governance** (off-label gating, clinician
ownership checks, audit trail, structured override modal), and on **AI
narrative** (citation-linked QEEG narratives). The gap is **not features** — it
is **clinician-day workflow density**: NeuroStar TrakStar Cloud, MagVenture
360, and Spring Health Compass all win on a single screen — "what do I do in
the next 5 minutes for which patient" — backed by automated SMS/email,
relapse-trigger alerts, and a single-tap call/document/sign action. DeepSynaps
has 9,716 lines of `pages-clinical-hubs.js` exporting 7 hubs; clinicians today
hop between them. The other gap is **dose & safety affordances on the
session-execution surface** (Soterix RELAX slider, SmartScan electrode quality,
True Current readout) and **topomap colormap discipline** (MNE/EEGLAB use a
fixed diverging RdBu_r at ±3 z; we vary). Closing those two gaps + a
TrakStar-style "Today" page would put DeepSynaps clearly ahead of any single
competitor on UX while keeping its breadth advantage.

## Recommended improvements (ranked by impact)

### REC-001 — "Today" clinician landing page (TrakStar/Compass pattern)
- **Source**: Neuronetics TrakStar Cloud "Patient Dashboard" + Spring Health
  Compass "To Do List" + Epic Hyperspace personalised home.
- **Pattern observed**: First page after login is a single, prioritised list:
  (a) sessions scheduled in next 4 hours, (b) unsigned notes, (c) overdue
  PHQ-9/GAD-7/C-SSRS, (d) flagged adverse events, (e) relapse-risk patients
  (PHQ-9 trending up). Each row has a single primary action.
- **DeepSynaps gap**: app boots into role-routed entry pages
  (`apps/web/src/constants.js` `ROLE_ENTRY_PAGE`), but the clinician's first
  page is a hub grid, not a worklist. `pages-clinical-hubs.js:139`
  (`pgPatientHub`) is patient-centric, not day-centric. There is no single
  surface that answers "what do I do next."
- **Concrete fix**: Add `pgClinicianToday(setTopbar, navigate)` in a new
  `apps/web/src/pages-today.js`, wired into `app.js` lazy-load + a `today`
  route. Reuse existing API calls: `/api/v1/sessions/today`,
  `/api/v1/assessments/overdue`, `/api/v1/adverse-events/recent`,
  `/api/v1/courses/relapse-flags`. ~3-4h.
- **Impact**: Clinician time-saving (the single biggest sales differentiator
  vs hub-grid products) + clinical safety (adverse events surfaced first).
- **Source URL**: https://ir.neuronetics.com/news-releases/news-release-details/neurostarr-releases-software-upgrades-elevate-patient-care · https://www.springhealth.com/blog/compass-helps-providers-elevate-their-mental-health-practice-with-intuitive-technology

### REC-002 — Relapse-trigger alerts on the patient timeline
- **Source**: TrakStar Cloud "real-time notifications when patients exhibit
  signs of relapse or experience changes in mental health post-TMS."
- **Pattern observed**: Automatic flag when PHQ-9 rises ≥5 points across two
  measurements OR C-SSRS escalates a category, with the flag appearing both in
  the day list AND on the patient timeline header.
- **DeepSynaps gap**: `pages-patient-timeline.js` shows assessments
  chronologically but does not compute trend deltas server-side or render a
  "relapse risk" pill. `apps/api/app/routers` has assessments + course-safety
  but no `relapse_flags_router.py`.
- **Concrete fix**: Add a small derived endpoint `/api/v1/patients/{id}/
  relapse-flags` (FastAPI, 60 lines: pull last 4 PHQ-9/GAD-7, compute slope,
  return categorical flag) and a `<span class="badge badge-warn">Relapse
  risk</span>` on `pages-patient-timeline.js`. ~2h.
- **Impact**: Clinical safety + retention (catches drop-off before patient
  ghosts the clinic) + sales differentiator.
- **Source URL**: https://www.marketscreener.com/quote/stock/NEURONETICS-INC-44403632/news/Neuronetics-Revolutionizes-Patient-Communication-and-Provider-Support-Through-Its-Exclusive-TrakStar-44607307/

### REC-003 — Live electrode/coil quality strip (Soterix SmartScan pattern)
- **Source**: Soterix Open-Panel SmartScan — "continuous visual indication of
  electrode quality before AND during stimulation."
- **Pattern observed**: A persistent horizontal strip with one cell per
  channel/electrode, each cell coloured green/amber/red by impedance or
  contact quality, updating live. Sits above the dose readout.
- **DeepSynaps gap**: `eeg-signal-renderer.js` and `pages-monitor.js` show
  signal traces but no per-channel quality strip; `pages-monitoring.js` is
  device-status, not contact-quality. During a TMS or tDCS session there is
  no single-glance read on whether the coil/electrode is good.
- **Concrete fix**: New component
  `apps/web/src/components/contact-quality-strip.js` (~120 LOC) consuming an
  existing impedance feed (or simulated when device offline). Insert into
  `pages-monitor.js` session-execution view above the existing chart. ~3h.
- **Impact**: Clinical safety + reduced retreatment (bad contact = wasted
  session) + tech credibility on demo.
- **Source URL**: https://soterixmedical.com/research/1x1/tdcs/device

### REC-004 — RELAX slider + True Current readout on the session page
- **Source**: Soterix RELAX (transient current reduction without aborting) +
  True Current readout (actual delivered current vs prescribed).
- **Pattern observed**: A single sliding bar that lets the operator
  temporarily reduce current to manage patient discomfort, paired with a
  large numeric readout of "actual current now" alongside "prescribed."
- **DeepSynaps gap**: Session execution surfaces (in `pages-courses.js`
  `openQuickOutcomeCapture` / `pages-clinical.js`) capture outcomes after
  the fact but have no in-session intensity-modulation control or
  delivered-vs-prescribed delta. FDA premarket guidance specifically calls
  out "dose displays" — we need this for clearance posture too.
- **Concrete fix**: Add a `<input type=range>` slider bound to a session-
  ephemeral `current_pct` plus two big numbers (prescribed mA, delivered
  mA) in `pages-monitor.js` session view. Persist any reductions as
  `delivered_session_parameters` events (table already exists per
  `LAUNCH_READINESS_REPORT.md` line 105). ~3h.
- **Impact**: Clinical safety + FDA UI guidance alignment + device-control
  parity with Soterix/MagVenture.
- **Source URL**: https://soterixmedical.com/research/1x1/tdcs/device · https://www.fda.gov/media/170714/download

### REC-005 — Fix topomap colormap to MNE/EEGLAB convention
- **Source**: MNE-Python `mne.viz.plot_topomap` defaults; NeuroGuide
  Z-score convention (±3 SD diverging).
- **Pattern observed**: Diverging colormap (RdBu_r), symmetric vlim around 0
  (default ±max abs), explicit colorbar with z-score units, head-circle
  electrodes labelled at standard 10-20.
- **DeepSynaps gap**: `pages-qeeg-analysis.js` line 1280-1310 renders
  `qeeg-mne-ztable` / `Normative z-scores` heatmaps, and line 4204 / 5097
  references "topographic heatmaps" but does not enforce a single
  diverging-colormap token; values are coloured ad-hoc and scales vary
  between baseline and follow-up. Line 4674's own note says "Use shared
  rails and fixed topomap scales" — we already know this.
- **Concrete fix**: Add CSS custom properties in `styles.css`:
  `--topo-pos: #b2182b; --topo-neg: #2166ac; --topo-zero: #f7f7f7;
  --topo-vmax: 3;`. Add a small `topomapScale(z)` helper in
  `apps/web/src/pages-qeeg-viz.js` that returns an interpolated colour;
  use it everywhere a heatmap cell is rendered (grep
  `qeeg-table-wrap`/`ds-topo-heatmap`). Ensure baseline + follow-up share
  the same vmax. Add a small inline colourbar SVG. ~2-3h.
- **Impact**: Clinical credibility (every qEEG-trained clinician will
  immediately recognise the convention or call out deviation) + reduces
  cognitive load comparing baseline vs follow-up.
- **Source URL**: https://mne.tools/stable/generated/mne.viz.plot_topomap.html · https://mne.tools/0.24/auto_examples/visualization/eeglab_head_sphere.html · https://www.peakbraininstitute.com/blog/how-to-use-loreta-eeg-source-localization-to-understand-qeeg

### REC-006 — Visible audit-trail viewer per record (21 CFR Part 11)
- **Source**: 21 CFR Part 11 — "secure, computer-generated, time-stamped
  audit trails... record changes not obscuring previously recorded
  information... audit trail documentation retained for a period at
  least as long as that required for the subject electronic records."
- **Pattern observed**: Every clinical record (assessment, protocol,
  consent, course, override) shows a "History" tab that lists who/when/
  what changed, never destructive.
- **DeepSynaps gap**: We already write audit logs (62 grep hits across
  the frontend; `auditLog`/`audit_trail` references in `api.js`,
  `deeptwin/handoff.js`, `pages-courses.js`, `pages-consent.js`), but
  there is no consistent UI surface to *view* them per record.
- **Concrete fix**: Single shared component
  `apps/web/src/components/audit-trail-drawer.js` that takes
  `(entityType, entityId)` and pops a right-side drawer fed by a single
  `/api/v1/audit/{entity_type}/{entity_id}` endpoint. Inject a "History"
  pill on protocol detail, course detail, consent record, override modal
  — total ~4 sites. ~3h.
- **Impact**: Regulatory (Part 11 + GxP customers) + sales differentiator
  (every enterprise procurement RFP asks for this) + safety (clinicians
  see prior off-label override decisions).
- **Source URL**: https://simplerqms.com/21-cfr-part-11-audit-trail/ · https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11

### REC-007 — Undo for irreversible-feeling actions
- **Source**: FDA 2023 premarket software UI guidance + NN/g general
  pattern (snackbar undo).
- **Pattern observed**: After "Apply protocol", "Send to patient",
  "Activate course", "Discharge patient" — a 6-second snackbar with a
  single Undo button that calls a soft-delete or status-revert endpoint.
- **DeepSynaps gap**: `confirmModal`/`areYouSure` references appear 56
  times across 10 frontend files (we use confirmation-modal pattern, not
  undo pattern). Confirmation modals interrupt flow and clinicians
  habituate to clicking through them; undo is safer.
- **Concrete fix**: Add `window._snackbarUndo({label, onUndo,
  ttlMs:6000})` in `app.js` and replace 5-10 highest-traffic confirm
  modals (start with course activation in `pages-courses.js` and
  protocol publish in `pages-protocols.js`). Keep confirm modal only for
  truly irreversible actions (e.g. data export with PHI). ~3h.
- **Impact**: Clinician time-saving + clinical safety (catches the
  fat-finger that clinicians click past in a confirm modal).
- **Source URL**: https://www.fda.gov/media/170714/download

### REC-008 — One-tap patient call (Doximity Dialer pattern)
- **Source**: Doximity Dialer "one-click calling... call patients on
  their cell phones while keeping their office number visible."
- **Pattern observed**: Patient row → single phone icon → opens system
  tel: link with the clinic's display caller-ID; logs the call to the
  patient timeline automatically.
- **DeepSynaps gap**: Patient roster surfaces in `pages-clinical-hubs.js`
  and `pages-patient.js` show patient name + status but no one-tap
  contact. Virtual care exists (`pages-virtualcare.js`) but it is a
  separate page, not a row affordance.
- **Concrete fix**: Add a `<a href="tel:..." onclick="logCall(...)">📞</a>`
  affordance to every patient row. `logCall` POSTs to
  `/api/v1/patients/{id}/call-events`. Add equivalent SMS button using
  `sms:` URI. ~1h. (Real telephony layer can come later; the affordance
  is the win.)
- **Impact**: Clinician time-saving + patient retention (faster
  callback) + sales differentiator vs every desktop EHR.
- **Source URL**: https://www.doximity.com/dialer

### REC-009 — Automated patient SMS/email comms (TrakStar pattern)
- **Source**: TrakStar Cloud "automated SMS and email communication,
  offering personalized guidance during the early stages of treatment."
- **Pattern observed**: After course activation, system auto-sends day-
  of-treatment reminders, post-session "how do you feel" check-in (with
  link back to assessment), and weekly progress summary.
- **DeepSynaps gap**: Repo has `notifications` + `reminders` routes per
  `LAUNCH_READINESS_REPORT.md` line 86 but the UI for *templating &
  scheduling* these around a course is missing.
- **Concrete fix**: Add a "Communications" tab to course detail in
  `pages-courses.js` with three preset templates (reminder, post-session,
  weekly) editable per clinic. Schedule via existing reminders router.
  ~4h.
- **Impact**: Patient retention + clinical safety (post-session check-in
  catches AEs) + sales (reduces no-show rate).
- **Source URL**: https://ir.neuronetics.com/news-releases/news-release-details/neurostarr-releases-software-upgrades-elevate-patient-care

### REC-010 — Coil-placement visualisation on protocol detail (StimGuide)
- **Source**: MagVenture StimGuide Pro — "approximation of all 10/20
  electrode positions, anatomical landmark registration check, on-screen
  visualization of Pointer tool and Coils, gimbal navigation aid."
- **Pattern observed**: Protocol detail shows a 3D head with the coil
  position rendered, plus a small 10-20 sketch with target highlighted.
- **DeepSynaps gap**: `pages-protocols.js` describes targets in text
  ("F3", "left DLPFC") but does not visualise. We have `brain-map-svg.js`
  and `pages-brainmap.js` — the asset exists.
- **Concrete fix**: Embed `brain-map-svg.js` montage view (small, 220px)
  in the protocol detail header, with the target electrode highlighted
  via class. Re-use existing `pages-brainmap.js` markup. ~2h.
- **Impact**: Clinical credibility + fewer "where do I put the coil"
  pings to senior staff + onboarding for technicians.
- **Source URL**: https://magventure.com/us/tms-research/

### REC-011 — Personalised home (Epic Hyperspace pattern)
- **Source**: Epic Hyperspace — "individual clinicians can personalize
  layout preferences, frequently used activities, shortcuts, and default
  views, as well as specialty-focused navigation choices that reduce
  scrolling and hunting."
- **Pattern observed**: Each clinician sees their *own* arrangement of
  hub tiles, with most-recent and most-used floated to top.
- **DeepSynaps gap**: Hub layout in `pages-clinical-hubs.js` is static;
  the command palette (`app.js:413`, `app.js:934`) tracks recents but
  the hub grid does not.
- **Concrete fix**: Persist `localStorage['ds_hub_order']` per user and
  read it in `pages-clinical-hubs.js` to reorder tiles. Add a simple
  "drag to reorder" via HTML5 DnD. ~3h.
- **Impact**: Clinician time-saving + retention (personalisation =
  ownership) + onboarding (different specialties weight different hubs).
- **Source URL**: https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/what-epic-is-signaling-for-2026/

### REC-012 — Seizure-risk pre-flight check on TMS course activation
- **Source**: PMC literature review — "62% of reported seizures occur
  during the first session, 75% within the first three sessions";
  Clinical TMS Society checklist.
- **Pattern observed**: Before first TMS session, software requires
  clinician to confirm a structured 7-item checklist (current
  anticonvulsants, seizure history, sleep deprivation, alcohol
  withdrawal, prior brain injury, current intracranial metal,
  pregnancy) and stores it in the audit trail.
- **DeepSynaps gap**: We have a course-safety gate
  (`apps/api/app/routers/.../course_safety_gate.py` per
  LAUNCH_READINESS) but the TMS-specific seizure pre-flight checklist
  is not surfaced as its own structured form. `handbooks-data.js:1601`
  has the dosing instructions but no checkbox UI.
- **Concrete fix**: New component
  `apps/web/src/components/tms-seizure-preflight.js` rendered in the
  course-activation modal when `modality === 'TMS'`. Block activation
  until all items checked OR explicit override (already supported per
  course safety gate). ~2h.
- **Impact**: Clinical safety (largest single TMS AE) + regulatory
  posture + sales (every TMS clinic compliance officer asks).
- **Source URL**: https://pmc.ncbi.nlm.nih.gov/articles/PMC7732158/ · https://www.apna.org/transcranial-magnetic-stimulation-tms-considerations-checklist/

### REC-013 — SAINT/SNT accelerated-protocol scheduler
- **Source**: Stanford SAINT/SNT — "10 sessions per day for 5 days,
  every hour, 1800 TBS pulses per session."
- **Pattern observed**: Specialised scheduler that auto-blocks 10
  hourly slots × 5 consecutive days as a single bookable unit.
- **DeepSynaps gap**: `pgSchedulingHub` in `pages-clinical-hubs.js:3152`
  handles per-session bookings but no "course-as-block" concept for
  accelerated protocols.
- **Concrete fix**: Add a "Book accelerated course" modal that takes
  start date + clinician + room and creates 50 sessions in one POST.
  Reuse existing scheduling API. ~3h.
- **Impact**: Sales differentiator (huge: SAINT clinics will pay
  premium for this) + clinician time-saving.
- **Source URL**: https://med.uth.edu/psychiatry/2026/03/12/saint-tms-a-new-era-of-accelerated-brain-stimulation-for-severe-depression/

### REC-014 — Z-Builder-style normative customisation
- **Source**: BrainMaster BrainAvatar Z-Builder — "create customized
  training norms based on clients' unique needs."
- **Pattern observed**: Clinician selects a subset of channels +
  frequency bands and saves as a per-patient training target.
- **DeepSynaps gap**: `pages-qeeg-analysis.js` exposes normative
  comparisons but does not let the clinician define a per-patient
  z-score training target for use in subsequent sessions.
- **Concrete fix**: Add "Save as training target" button on the
  normative z-score panel (`renderNormativeZScoreHeatmap`,
  pages-qeeg-analysis.js:1186). Persist to a new
  `qeeg_training_targets` table. ~3h.
- **Impact**: Clinical depth (matches NeuroGuide / BrainMaster
  workflow) + retention.
- **Source URL**: https://brainmaster.com/our-software/

### REC-015 — Mobile-optimised clinician view (TrakStar Plus pattern)
- **Source**: TrakStar Plus — "interface optimized for mobile phones
  and tablets... allowing physicians to remotely access and navigate."
- **Pattern observed**: Same desktop features, responsive at <768px,
  with touch-friendly hit targets and stacked tables.
- **DeepSynaps gap**: `styles.css` has 27,850 lines but most layouts
  are sidebar+main desktop. Sidebar width is fixed (`--sidebar-w:
  220px`). No `@media (max-width: 768px)` collapse for the main hubs.
- **Concrete fix**: Audit the 5 most-used clinician pages
  (today, patient detail, course detail, protocol detail, qEEG
  analysis) and add a single mobile breakpoint that collapses sidebar
  to a hamburger and stacks two-column layouts. ~4h.
- **Impact**: Clinician retention (call from car) + sales (every
  buyer asks "is there a mobile version").
- **Source URL**: https://ir.neuronetics.com/news-releases/news-release-details/neuroneticsr-launches-trakstarr-plus-patient-data-management/

### REC-016 — PHI-out-of-titles & no-PHI-in-URL audit
- **Source**: HIPAA 2026 best-practice guides — "pre-launch checks
  should include PHI-in-URL tests... keep ePHI out of tokens, profiles,
  URLs, and logs."
- **Pattern observed**: Page `<title>` never contains patient name;
  URLs use opaque IDs not MRN; clipboard copies of links don't leak
  PHI.
- **DeepSynaps gap**: Routes use IDs (good), but page titles often
  set patient name into `setTopbar(title, html)` and the document
  title chain may pick it up. We already use opaque IDs per
  `route-id.js` — the gap is in the `<title>` element only.
- **Concrete fix**: In `app.js`, force `document.title = 'DeepSynaps
  Studio'` regardless of the per-page `setTopbar(title)`; topbar in-
  page title can show patient initials only ("J.D., 47F"). ~30 min.
- **Impact**: Regulatory (BAA-able by design) + breach hygiene
  (browser history, screen-share leaks).
- **Source URL**: https://www.hipaajournal.com/considered-phi-hipaa/ · https://www.feroot.com/blog/hipaa-website-compliance-checklist/

### REC-017 — WCAG 2.2 AA contrast pass on safety-critical surfaces
- **Source**: WCAG 2.2 AA + healthcare safety perspective ("a subtle
  but critical trend line on a patient's vitals monitor could be
  missed under the glare of hospital lights").
- **Pattern observed**: Contrast ratio 4.5:1 minimum for text, 3:1
  for UI components and graphical elements; never use colour alone
  to convey state.
- **DeepSynaps gap**: `styles.css` `--text-tertiary: #8b97a8` on
  `--bg-card: rgba(14,22,40,0.8)` is borderline (≈4.4:1) and the
  red/amber/green badges (`--red: #ff6b6b`, `--amber: #ffb547`,
  `--green: #4ade80`) carry status meaning without text or icon
  redundancy in many places.
- **Concrete fix**: (1) Bump `--text-tertiary` to `#9ba6b8` (≈5.0:1).
  (2) Audit `.badge` rules in `styles.css` and ensure each colour
  class has an accompanying icon or text label, never colour alone.
  (3) Add `prefers-reduced-motion` media query disabling the
  pulse/glow animations for vestibular-sensitive users (currently 31
  occurrences of motion-related `prefers-reduced-motion` per grep —
  but only in 30 of 70+ files). ~2h.
- **Impact**: Regulatory (HHS WCAG 2.1/2.2 AA mandate effective
  May 2026) + clinical safety + accessibility-procurement signal.
- **Source URL**: https://www.w3.org/TR/WCAG22/ · https://pilotdigital.com/blog/what-wcag-2-1aa-means-for-healthcare-organizations-in-2026/ · https://www.hristovdevelopment.com/post/healthtech-accessibility-compliance-safety

### REC-018 — Conversational chart-Q&A entry on patient detail
- **Source**: Epic Art — "conversational search that answers clinician
  questions using information from across a patient's chart, including
  clinical notes, orders, medications, imaging and billing data."
- **Pattern observed**: Search box on patient detail page accepts
  natural-language ("any seizure history?", "last PHQ-9", "current
  meds") and returns a citation-linked answer pulled from the chart.
- **DeepSynaps gap**: We have a chat widget (`ui_chat_widget.js`) and
  evidence RAG, but no patient-scoped chart-Q&A on the patient detail
  page itself.
- **Concrete fix**: Add a slim search input at the top of patient
  detail (`pages-patient.js`) calling a new
  `/api/v1/patients/{id}/chart-qa` that does retrieval over the
  patient's own records (assessments, sessions, notes, AEs) and
  returns a cited answer. Reuse the existing chat-widget rendering
  for the response. ~4h (mostly backend retrieval shape).
- **Impact**: Clinician time-saving (massive — Epic chose this as
  THE 2026 announcement) + sales differentiator + AI moat.
- **Source URL**: https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/what-epic-is-signaling-for-2026/ · https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/epic-rolls-out-ai-charting-tool/

### REC-019 — Per-patient draft / autosave for long forms
- **Source**: Spring Health Compass — task-list awareness of
  "outstanding or overdue" notes; common EHR pattern.
- **Pattern observed**: Notes/assessments save a draft per patient
  every 10 s; a draft indicator shows in the patient row.
- **DeepSynaps gap**: We already have per-patient draft for MH tab
  (per memory `project_deepsynaps_patients_hub.md`) but it is not
  generalised across documents/notes/protocols.
- **Concrete fix**: Extract the MH-tab draft helper into a shared
  `apps/web/src/components/draft-store.js` and apply to documents
  (`documents-templates.js`) + protocol builder
  (`protocol-personalization-wizard.js`) + clinical session notes.
  ~2h.
- **Impact**: Clinician retention (nothing more rage-inducing than
  losing a half-typed note) + safety (no dropped data).
- **Source URL**: https://www.springhealth.com/blog/compass-helps-providers-elevate-their-mental-health-practice-with-intuitive-technology

### REC-020 — Live-Z-score neurofeedback display (Mensia/NeuroGuide)
- **Source**: Mensia Koala personalises training to baseline qEEG;
  NeuroGuide ships sLORETA Z-score neurofeedback as a built-in.
- **Pattern observed**: During a neurofeedback session, the screen
  shows live z-scores per band per channel, with the trained channel/
  band highlighted and a count of "in-target seconds."
- **DeepSynaps gap**: `eeg-spectral-panel.js` shows spectra but the
  *training-target view* (large, simple, in-target indicator) for a
  neurofeedback session is missing.
- **Concrete fix**: Add `apps/web/src/components/nfb-live-target.js`
  with a single big number ("seconds in target this session") + a
  per-channel z-score strip. Wire to existing live qEEG signal
  endpoint. ~3h.
- **Impact**: Clinical depth (parity with Cygnet / BrainAvatar) +
  patient engagement (visible feedback).
- **Source URL**: https://www.mensia.com/adhd-treatment-brain-therapy-mensia-koala/ · https://appliedneuroscience.com/whats-new-with-neuroguide/

## Visual / design system upgrades

All edits land in `apps/web/src/styles.css` (one file, 27,850 lines, single
source of truth).

- **Spacing scale**: Adopt a strict 4-px scale token set
  (`--s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-6: 24px;
  --s-8: 32px; --s-12: 48px;`) and replace ad-hoc `padding: 16px 18px`
  (e.g. `.card-body` line 514) with `var(--s-4)`. Audit revealed mixed
  16/17/18/20/22 px values — clinicians read tighter rhythms as
  "cleaner."
- **Type scale**: Body is currently `font-size: 13px` on `body`. Add a
  modular scale `--t-xs:11; --t-sm:12; --t-base:13; --t-md:15;
  --t-lg:18; --t-xl:22; --t-2xl:28;` and use `--t-2xl` for the single
  big numeric readouts (REC-004 prescribed/delivered mA, REC-020 in-
  target seconds). The display font is Outfit (good); body DM Sans
  (good); keep both.
- **Color (clinical safety)**: Add a dedicated alert palette distinct
  from accents: `--safety-critical: #dc2626; --safety-warn: #f59e0b;
  --safety-info: #2563eb; --safety-ok: #16a34a;`. Current
  `--red: #ff6b6b` / `--amber: #ffb547` are accent-grade brightness;
  safety states need denser values to read on hospital displays.
- **Topomap colormap tokens**: Add `--topo-pos: #b2182b; --topo-neg:
  #2166ac; --topo-zero: #f7f7f7; --topo-vmax: 3;` to the `:root`
  block (REC-005). Single source for every heatmap cell.
- **Motion**: Add a global `@media (prefers-reduced-motion: reduce)
  { *, *::before, *::after { animation: none !important; transition:
  none !important; } }` near the top of `styles.css`. We already
  reference reduced-motion in 30 files but inconsistently.
- **Iconography**: Standardise on a single inline-SVG icon set
  (Phosphor or Lucide) over emoji. `app.js` line 96 uses 🌐 for the
  language switcher — emojis render inconsistently on Windows
  clinicians' machines and never carry an accessible name. Create
  `apps/web/src/components/icon.js` with a 30-icon manifest.
- **Focus ring**: Single token `--focus-ring: 0 0 0 2px var(--blue),
  0 0 0 4px rgba(74,158,255,0.25);` and apply to every interactive
  element via `:focus-visible`. Currently only `.btn`, `.form-control`,
  `.tab-btn` have it (line 2586). WCAG 2.2 AA SC 2.4.11 (target).

## Quick wins (under 30 min each)

- Force `document.title = 'DeepSynaps Studio'` in `app.js` regardless
  of in-page topbar (REC-016 partial; PHI-out-of-titles).
- Add `<meta name="referrer" content="no-referrer">` to `index.html`
  (HIPAA: prevent PHI leak via Referer header).
- Replace `🌐` emoji language switcher with an inline SVG globe in
  `app.js:95` (icon consistency, screen-reader name).
- Add `aria-live="polite"` to the existing `_announce()` host element
  in `app.js:19` if not already present, and an `aria-live="assertive"`
  alternate for safety alerts (REC-012, REC-002 will need it).
- In `styles.css`, add the `prefers-reduced-motion` global rule.
- Bump `--text-tertiary` from `#8b97a8` to `#9ba6b8` for WCAG 2.2 AA
  contrast (REC-017 part 1).
- Add a "Last signed by … at …" footer line on every clinical record
  detail page using existing audit data — Part 11 visible signature
  (REC-006 cheap precursor).
- Add a session-storage `ds_today_dismissed_alerts` set so REC-002
  relapse flags don't re-pop after a clinician has acknowledged them.
- In `pages-patient.js` patient row, add `<a href="tel:{phone}">📞</a>`
  immediately (REC-008 v0; full call-event logging can come later).

## Things we should NOT copy

- **Epic's hidden-shortcut depth.** Epic Hyperspace personalisation is
  great but its 8-16 hour training requirement is a known anti-pattern
  the field complains about. Keep DeepSynaps discoverable: any
  personalisation in REC-011 must have visible affordances, not
  keyboard-only Epic-style F-key shortcuts.
- **NeuroStar's vendor-locked device-only data flow.** TrakStar
  syncs only with Neuronetics hardware. DeepSynaps' multi-vendor stance
  (TMS + tDCS + tACS + neurofeedback in one platform) is a moat —
  don't add device-vendor lock-in for any one feature, even if it
  makes integration easier short-term.
- **Soterix's research-only "1×1" deep configuration surface.**
  Soterix's full Neurotargeting montage editor is powerful but
  expert-only. We already have an `eeg-montage-editor.js`; do not
  surface its full complexity on the clinical hub. Keep an "advanced"
  drawer hidden by default — clinicians want defaults that just work.

## Sources

1. https://ir.neuronetics.com/news-releases/news-release-details/neurostarr-releases-software-upgrades-elevate-patient-care
2. https://www.marketscreener.com/quote/stock/NEURONETICS-INC-44403632/news/Neuronetics-Revolutionizes-Patient-Communication-and-Provider-Support-Through-Its-Exclusive-TrakStar-44607307/
3. https://ir.neuronetics.com/news-releases/news-release-details/neuroneticsr-launches-trakstarr-plus-patient-data-management/
4. https://soterixmedical.com/research/1x1/tdcs/device
5. https://soterixmedical.com/research/software
6. https://magventure.com/us/tms-research/
7. https://www.magstim.com/app/uploads/2025/01/Magstim-Catalog-2025.pdf
8. https://www.brainsway.com/news_events/landmark-data-validate-brainsways-swift-deep-tms-beginning-a-new-era-in-depression-treatment/
9. https://www.mensia.com/adhd-treatment-brain-therapy-mensia-koala/
10. https://pmc.ncbi.nlm.nih.gov/articles/PMC6676623/
11. https://brainmaster.com/our-software/
12. https://beemedic.com/en/cygnet
13. https://appliedneuroscience.com/neuroguide/
14. https://appliedneuroscience.com/whats-new-with-neuroguide/
15. https://www.peakbraininstitute.com/blog/how-to-use-loreta-eeg-source-localization-to-understand-qeeg
16. https://mne.tools/stable/generated/mne.viz.plot_topomap.html
17. https://mne.tools/0.24/auto_examples/visualization/eeglab_head_sphere.html
18. https://mne.tools/stable/auto_examples/visualization/evoked_topomap.html
19. https://www.springhealth.com/blog/compass-helps-providers-elevate-their-mental-health-practice-with-intuitive-technology
20. https://www.prnewswire.com/news-releases/spring-health-launches-guide-new-ai-experience-that-improves-mental-health-outcomes-302751086.html
21. https://www.doximity.com/dialer
22. https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/what-epic-is-signaling-for-2026/
23. https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/epic-rolls-out-ai-charting-tool/
24. https://www.w3.org/TR/WCAG22/
25. https://pilotdigital.com/blog/what-wcag-2-1aa-means-for-healthcare-organizations-in-2026/
26. https://www.hristovdevelopment.com/post/healthtech-accessibility-compliance-safety
27. https://www.fda.gov/media/170714/download
28. https://www.berkleyls.com/blog/fdas-2026-guidance-expands-pathway-low-risk-digital-health-products-caution-remains-essential
29. https://simplerqms.com/21-cfr-part-11-audit-trail/
30. https://www.ecfr.gov/current/title-21/chapter-I/subchapter-A/part-11
31. https://www.hipaajournal.com/considered-phi-hipaa/
32. https://www.feroot.com/blog/hipaa-website-compliance-checklist/
33. https://med.uth.edu/psychiatry/2026/03/12/saint-tms-a-new-era-of-accelerated-brain-stimulation-for-severe-depression/
34. https://pmc.ncbi.nlm.nih.gov/articles/PMC10700378/
35. https://pmc.ncbi.nlm.nih.gov/articles/PMC7732158/
36. https://www.apna.org/transcranial-magnetic-stimulation-tms-considerations-checklist/
37. https://www.sciencedirect.com/science/article/pii/S2352250X25002003
