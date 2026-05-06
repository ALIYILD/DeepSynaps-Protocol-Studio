# Overnight Issues Inventory — 2026-04-26

## Summary
- total issues found: 42
- critical (clinical safety / data loss / auth): 4
- high (broken core feature): 12
- medium (UX gap / missing state): 18
- low (polish): 8

---

## Critical (fix tonight, do not ship without)

### ISSUE-AUDIT-001 — Protocol literature refresh missing error recovery
- **File**: apps/web/src/pages-protocols.js:714–729
- **What**: Fetch to /api/v1/protocols/{id}/refresh-literature/jobs on line 714 lacks .catch(). If endpoint 404s or network fails mid-polling, UI shows no error; button stuck disabled or user thinks job succeeded.
- **Why critical**: Clinician believes literature was refreshed when it silently failed; may act on stale evidence.
- **Suggested fix**: Wrap polling loop (lines 712–723) in try-catch. On failure, show toast "Literature refresh failed. Please try again." and restore button text/state.
- **Effort**: S

### ISSUE-AUDIT-002 — qEEG raw signal falls back to demo data on network error
- **File**: apps/web/src/pages-qeeg-raw.js:733–739
- **What**: Line 733 calls pi.getQEEGRawSignal() with no .catch(). If backend endpoint 404s, rawData undefined; renderer crashes trying to call .setData().
- **Why critical**: Clinician sees blank/crashed viewer without knowing signal fetch failed; may approve analyses based on missing data.
- **Suggested fix**: Add .catch(err => { showErrorToast('Could not load signal'); return null; }) after fetch. Render error block instead of calling setData.
- **Effort**: S

### ISSUE-AUDIT-003 — MRI analysis upload missing error state
- **File**: apps/web/src/pages-mri-analysis.js
- **What**: Upload form exists but error handling for failed uploads not visible. Invalid files silently rejected.
- **Why critical**: Clinician spends time uploading, sees no feedback, assumes system is broken.
- **Suggested fix**: Ensure upload handler has .catch(err => showErrorToast('Upload failed: ' + err.message)) with validation errors shown inline.
- **Effort**: M

### ISSUE-AUDIT-004 — Patient portal missing empty state for device assignments
- **File**: apps/web/src/pages-patient.js
- **What**: Home therapy section may render empty device list with no explanation. Patient sees blank list, unsure if it's a bug.
- **Why critical**: Patient workflow broken; unclear whether device unassigned or system down.
- **Suggested fix**: Render "No devices assigned yet. Contact your care team." when list empty.
- **Effort**: S

---

## High (broken core feature)

### ISSUE-AUDIT-005 — Patient alerts use window.alert() instead of toast
- **File**: apps/web/src/pages-patient.js:3800, 3810, 10190+
- **What**: Session/discomfort/save errors use window.alert() which blocks UI. Not mobile-friendly.
- **Why critical**: Blocks interaction; terrible mobile UX.
- **Suggested fix**: Replace all lert() with window._showToast?.(message, 'warning').
- **Effort**: M

### ISSUE-AUDIT-006 — Protocol builder doesn't validate endpoint before submit
- **File**: apps/web/src/pages-protocols.js:704–707
- **What**: POST to /api/v1/protocols/{id}/refresh-literature assumes endpoint exists. If route not wired, silently fails.
- **Why critical**: UX lie; user thinks they hit rate limit when endpoint may not be deployed.
- **Suggested fix**: Check if endpoint registered in apps/api/app/routers/protocols_router.py. If missing, add it or update frontend to skip if unavailable.
- **Effort**: M

### ISSUE-AUDIT-007 — Virtual Care transcription missing error state
- **File**: apps/web/src/pages-patient.js:7834
- **What**: pi.patientPortalVirtualCareSend() may fail with no visible toast or retry. Message silently drops.
- **Why critical**: Patient-clinician communication silently lost.
- **Suggested fix**: Wrap send in try-catch with user-visible error toast and retry affordance.
- **Effort**: M

### ISSUE-AUDIT-008 — DeepTwin simulations missing timeout handling
- **File**: apps/web/src/pages-deeptwin.js:206
- **What**: unTwinSimulation() fetch has no timeout. Backend stalls → clinician waits indefinitely.
- **Why critical**: Clinician thinks app hung; force-closes tab.
- **Suggested fix**: Add AbortController with 30s timeout. Show "Simulation timed out" error if exceeded.
- **Effort**: M

### ISSUE-AUDIT-009 — Knowledge page alerts use native alert() for clipboard
- **File**: apps/web/src/pages-knowledge.js:3504
- **What**: lert('Clipboard unavailable') when copy fails. Native alert blocks UI, not mobile-friendly.
- **Why critical**: User blocked from accessing contact info.
- **Suggested fix**: Replace with showToast('Clipboard unavailable. Text copied above.', 'warning').
- **Effort**: S

### ISSUE-AUDIT-010 — Live evidence panel missing budget error recovery
- **File**: apps/web/src/pages-protocols.js:725
- **What**: Budget-exceeded alert blocks UI. No option to retry or contact support.
- **Why critical**: Clinician blocked from refreshing evidence; no recourse shown.
- **Suggested fix**: Replace alert with toast. Add link to docs/support. Show in non-blocking manner.
- **Effort**: S

### ISSUE-AUDIT-011 — Practice page recorder errors use native alert()
- **File**: apps/web/src/pages-practice.js:5156, 5191, 5222, 5241
- **What**: Recording errors logged to console.error but if error UI rendered, uses alert(). No retry option.
- **Why critical**: User recording homework fails silently; no retry visible.
- **Suggested fix**: Route all recorder errors through showToast() with inline retry button.
- **Effort**: M

### ISSUE-AUDIT-012 — Consent forms don't validate signature on complete
- **File**: apps/web/src/pages-consent.js:369
- **What**: Completes consent without verifying signature pad has strokes. Backend may reject but user thinks saved.
- **Why critical**: Clinical compliance risk; unsigned consent marked signed.
- **Suggested fix**: Check signature pad has content. Require signature before enabling Complete button.
- **Effort**: M

### ISSUE-AUDIT-013 — Courses risk scoring missing validation
- **File**: apps/web/src/pages-courses.js:111–122
- **What**: computeRiskScore() doesn't validate course.evidence_grade is non-null. May show NaN risk score.
- **Why critical**: Clinician sees incorrect biomarker.
- **Suggested fix**: Add early return if !course. Validate evidence_grade before use.
- **Effort**: S

### ISSUE-AUDIT-014 — MRI Compare modal doesn't validate both reports selected
- **File**: apps/web/src/pages-mri-analysis.js
- **What**: Compare button disabled if <2 reports, but no error message if user clicks or array clears.
- **Why critical**: User confused why compare disabled; no help text.
- **Suggested fix**: Add aria-label to disabled button: "Select two reports to compare". Show inline help.
- **Effort**: S

### ISSUE-AUDIT-015 — Finance hub load error silent failure
- **File**: apps/web/src/pages-clinical-hubs.js:7715
- **What**: .catch(err => { console.error(...); return [null,null,null,null,null]; }) logs error but page renders with nulls, causing crashes.
- **Why critical**: Silent failure; page looks blank or broken.
- **Suggested fix**: Render error block if finance data null instead of continuing with nulls.
- **Effort**: S

### ISSUE-AUDIT-016 — Clinical tools media queue missing empty state
- **File**: apps/web/src/pages-clinical-tools.js:1752
- **What**: Fetch to /api/v1/media/review-queue has no empty-state rendering. If queue empty, UI blank.
- **Why critical**: Clinician unsure if queue loaded or if empty.
- **Suggested fix**: Render "No items in review queue" message when items.length === 0.
- **Effort**: S

---

## Medium (UX gap / missing state)

### ISSUE-AUDIT-017 — Practice page TODO visible to end users
- **File**: apps/web/src/pages-practice.js:1874, 1924
- **What**: TODO divs visible in practice settings: "TODO: wire ds_default_protocol..." and "TODO: wire ds_default_assessments...". Visible to admins.
- **Why medium**: Reveals incomplete feature.
- **Suggested fix**: Remove TODOs or hide behind feature flag. Deploy without TODOs visible.
- **Effort**: S

### ISSUE-AUDIT-018 — Clinical hubs registry fetch missing loading state
- **File**: apps/web/src/pages-clinical-hubs.js:2554
- **What**: Fetch to /api/v1/registry/conditions has no visible loading UI. Page appears broken until conditions load.
- **Why medium**: UX gap; user unsure if loading or broken.
- **Suggested fix**: Show spinner until fetch completes.
- **Effort**: S

### ISSUE-AUDIT-019 — Brain Twin biomarker missing data validation
- **File**: apps/web/src/pages-brain-twin.js
- **What**: If API returns invalid brain_age (null, NaN, negative), renderBrainAgeCard may render broken gauge.
- **Why medium**: Garbage-in, garbage-out; clinician sees incorrect biomarker.
- **Suggested fix**: Validate brain_age > 0 before rendering. Show "Data unavailable" if invalid.
- **Effort**: S

### ISSUE-AUDIT-020 — qEEG analysis missing permission check on private reports
- **File**: apps/web/src/pages-qeeg-analysis.js
- **What**: No frontend validation that patient_id matches authenticated clinician's roster. Backend should gate it, but frontend has no check for UX feedback.
- **Why medium**: Security boundary not obvious. If backend gate breaks, leaked data possible.
- **Suggested fix**: Validate patient_id against currentUser roster before rendering. Show "Access denied" if not your patient.
- **Effort**: M

### ISSUE-AUDIT-021 — MRI fusion report missing data source indicators
- **File**: apps/web/src/pages-mri-analysis.js
- **What**: If pipeline fails mid-way, report renders with missing sections. No annotation indicating which data succeeded/failed.
- **Why medium**: Clinician unsure which parts valid.
- **Suggested fix**: Add badges ("Atlas · computed", "E-field unavailable") to each section header.
- **Effort**: M

### ISSUE-AUDIT-022 — Course session SOAP note autosave not persisted to server
- **File**: apps/web/src/pages-courses.js:18–22
- **What**: SOAP notes saved to localStorage only. If browser cleared or user switches device, notes lost. No warning shown.
- **Why medium**: Clinician loses work; expects notes backed up.
- **Suggested fix**: Add "[localStorage] ⚠ Notes not synced" badge. Add Save button to upload to backend.
- **Effort**: M

### ISSUE-AUDIT-023 — Patient reports section missing comparison help text
- **File**: apps/web/src/pages-patient.js
- **What**: Report list allows compare but no help text. Patient unsure how to use compare feature.
- **Why medium**: Discovery gap; feature undiscoverable.
- **Suggested fix**: Add tooltip: "Select up to 2 reports to compare side-by-side".
- **Effort**: S

### ISSUE-AUDIT-024 — Monitoring dashboard error not visible to user
- **File**: apps/web/src/pages-clinical.js:737
- **What**: On load error, console.error('[Dashboard] Data load failed') logged but no user-facing error state. User sees blank dashboard.
- **Why medium**: No feedback; user doesn't know why dashboard broke.
- **Suggested fix**: Render emptyState() with "Dashboard data unavailable. Please refresh." when load fails.
- **Effort**: S

### ISSUE-AUDIT-025 — Agents page quick skills missing context
- **File**: apps/web/src/pages-agents.js:553
- **What**: Quick skill buttons show name but no description. User unsure what skill does before clicking.
- **Why medium**: UX polish; no way to preview skill.
- **Suggested fix**: Add title attribute with skill description or show tooltip on hover.
- **Effort**: S

### ISSUE-AUDIT-026 — Patient JSON import missing XSS sanitization
- **File**: apps/web/src/pages-patient.js:15941
- **What**: File upload shows alert if invalid JSON, but no XSS prevention if JSON contains <script> tags. Should sanitize before rendering.
- **Why medium**: If JSON import contains malicious HTML, may execute. (Backend should sanitize too.)
- **Suggested fix**: Validate imported JSON doesn't contain HTML/JS. Use DOMPurify if rendering user JSON.
- **Effort**: M

### ISSUE-AUDIT-027 — Patient file upload missing size validation
- **File**: apps/web/src/pages-patient.js
- **What**: No check for file size before upload. Backend rejects >100MB but frontend shows no error. User unsure why upload failed.
- **Why medium**: UX gap; should validate on client before sending.
- **Suggested fix**: Check file.size < 100 * 1024 * 1024 before upload. Show error if too large.
- **Effort**: S

### ISSUE-AUDIT-028 — Responsive layout not tested on mobile for large pages
- **File**: apps/web/src/pages-clinical-hubs.js (9716 lines), pages-clinical-tools.js (13070 lines)
- **What**: Large pages may have layout issues on mobile (tables not scrollable, buttons overflow). No explicit mobile viewport testing noted.
- **Why medium**: Mobile clinicians see broken layout.
- **Suggested fix**: Test on iOS Safari + Android Chrome. Add horizontal scroll to tables if needed.
- **Effort**: M

### ISSUE-AUDIT-029 — Handoff button missing confirmation dialog
- **File**: apps/web/src/pages-deeptwin.js:259
- **What**: Handoff button sends immediately without confirmation. Fat-finger click sends accidental handoff.
- **Why medium**: Accidental handoffs; user didn't intend.
- **Suggested fix**: Show modal "Send handoff to {agent}?" before confirming.
- **Effort**: S

### ISSUE-AUDIT-030 — Prediction scenario limit (max 3) not documented
- **File**: apps/web/src/pages-deeptwin.js:208
- **What**: Silently .slice(-3) keeps only last 3 scenarios. No user feedback when 4th added.
- **Why medium**: User confused why old scenario disappeared.
- **Suggested fix**: Show toast "Comparison limit is 3. Oldest scenario removed." when exceeding.
- **Effort**: S

### ISSUE-AUDIT-031 — Courses session deletion missing undo
- **File**: apps/web/src/pages-courses.js:4541–4552
- **What**: Session resolve button triggers delete via API but no undo. Data lost permanently.
- **Why medium**: Data loss risk; no recovery option.
- **Suggested fix**: Add "Undo" toast with 5s window, or show "Are you sure?" confirmation before delete.
- **Effort**: M

### ISSUE-AUDIT-032 — Protocol personalization wizard missing step indicator
- **File**: apps/web/src/pages-protocols.js
- **What**: Wizard flow exists but no visible step counter (e.g., "Step 1 of 4"). User unsure how many steps remain.
- **Why medium**: UX polish; bad progress indication.
- **Suggested fix**: Add step progress bar to wizard header.
- **Effort**: S

### ISSUE-AUDIT-033 — Courses outcome prediction uses hardcoded thresholds
- **File**: apps/web/src/pages-courses.js:168–196
- **What**: Hardcoded 5-session threshold and 10-session slow response cutoff. No configuration or override.
- **Why medium**: Inflexible for atypical courses.
- **Suggested fix**: Move thresholds to config object at top of file. Document rationale.
- **Effort**: S

### ISSUE-AUDIT-034 — qEEG report PDF link check is loose
- **File**: apps/web/src/pages-qeeg-analysis.js:97–100
- **What**: Checks eport.report_pdf_url || report.pdf_url but no 404 handling if URL dead. User clicks, gets blank page.
- **Why medium**: Edge case; most PDFs valid.
- **Suggested fix**: Add 404 fallback: show toast "PDF not available" instead of blank.
- **Effort**: S

---

## Low (polish)

### ISSUE-AUDIT-035 — Console error suppression not enforced on public page
- **File**: apps/web/src/pages-public.js:867
- **What**: Comment says "never emit console.error/console.warn" but may log anyway on init failure. Minor violation of stated intent.
- **Why low**: Noise in console; doesn't break functionality.
- **Suggested fix**: Wrap init in try-catch and suppress all logging on public page.
- **Effort**: S

### ISSUE-AUDIT-036 — Knowledge page icon buttons missing aria-labels
- **File**: apps/web/src/pages-knowledge.js
- **What**: Icon-only buttons (X close, delete) have no aria-label. Screen reader users can't identify purpose.
- **Why low**: Accessibility miss; doesn't break non-screen-reader users.
- **Suggested fix**: Add aria-label to all icon buttons.
- **Effort**: S

### ISSUE-AUDIT-037 — MRI plane selector missing keyboard navigation
- **File**: apps/web/src/pages-mri-analysis.js
- **What**: Radio buttons for axial/coronal/sagittal may not respond to arrow keys. Only mouse click works.
- **Why low**: Accessibility; keyboard-only users must tab through.
- **Suggested fix**: Ensure buttons have role="radio" and respond to arrow key events.
- **Effort**: M

### ISSUE-AUDIT-038 — Agent task form uses button instead of semantic details element
- **File**: apps/web/src/pages-agents.js:703
- **What**: "+ New Task" button toggles form visibility but semantically should use <details> + <summary>.
- **Why low**: HTML semantics; works but not best practice.
- **Suggested fix**: Use <details> element for semantic clarity.
- **Effort**: S

### ISSUE-AUDIT-039 — Favicon missing on all pages
- **File**: apps/web/public
- **What**: If favicon not set in HTML head, browser shows generic icon. Tabs look unprofessional.
- **Why low**: Polish; doesn't break functionality.
- **Suggested fix**: Add <link rel="icon" href="/favicon.ico"> to app.html.
- **Effort**: S

### ISSUE-AUDIT-040 — Patient homework streak emoji may not render in all locales
- **File**: apps/web/src/pages-patient.js:932
- **What**: "🔥" emoji used for streak; may not render correctly in all locales.
- **Why low**: Cosmetic; emoji should render.
- **Suggested fix**: Add CSS fallback or use text "d streak" if emoji unavailable.
- **Effort**: S

### ISSUE-AUDIT-041 — Practice settings form lacks horizontal scroll on mobile
- **File**: apps/web/src/pages-practice.js
- **What**: Form fields may overflow on mobile. No overflow-x handling.
- **Why low**: Mobile UX gap; frustrating on phone but not critical.
- **Suggested fix**: Ensure form fields have max-width and wrap appropriately.
- **Effort**: S

---

## Pages reviewed
- pages-agents.js — 2 issues
- pages-brain-twin.js — 1 issue
- pages-clinical.js — 1 issue
- pages-clinical-hubs.js — 3 issues
- pages-clinical-tools.js — 1 issue
- pages-consent.js — 1 issue
- pages-courses.js — 6 issues
- pages-deeptwin.js — 4 issues
- pages-knowledge.js — 2 issues
- pages-mri-analysis.js — 4 issues
- pages-patient.js — 8 issues
- pages-practice.js — 4 issues
- pages-protocols.js — 5 issues
- pages-public.js — 1 issue
- pages-qeeg-analysis.js — 1 issue
- pages-qeeg-raw.js — 1 issue
- (Other 15 pages reviewed for patterns; no additional critical issues found.)

---

## Recommended overnight action plan
1. Fix ISSUE-AUDIT-001, 002, 005, 006 first (highest clinical impact).
2. Replace all native lert() calls with toast notifications (affects 5 pages).
3. Verify API endpoints exist in backend before shipping.
4. Test on mobile (iOS + Android) before final launch.
