# Interactive Elements Inventory

DeepSynaps Studio — beta-readiness audit, generated 2026-04-27.

This is a survey of the major user-actionable elements (buttons, forms,
exports, uploaders, modals) on each beta-visible surface, with status
classification per the brief:

- **WORKING** — calls a real backend / produces a real artifact / persists
  to a real store.
- **PARTIAL** — does most of the right work but with at least one labeled
  caveat (e.g. local-only mirror, no toast yet, etc.).
- **UI ONLY / PRETEND** — visible action that does not do what it implies.
- **BROKEN** — visible and intended to be real, but the call does not work.
- **HIDDEN BUT IMPLEMENTED** — backend ready, UI not exposed.
- **IMPLEMENTED BUT NOT WIRED** — code exists, no consumer.

## Today / Dashboard (`pgDash`)

| Element | Status | Notes |
|---|---|---|
| Patient list, KPI cards, quick filters | WORKING | Real `api.patients()`, `api.listCourses()`, etc. Falls back to demo data + banner when both core endpoints fail (4c5ddaf). |
| "+ Add patient" | WORKING | Routes to `intake`. |
| Open patient row | WORKING | Routes to `patients-hub`. |
| Quick alerts (course pending, AE) | WORKING | Driven from `refreshNavBadges`. |

## Patient Hub (`pgPatientHub`)

| Element | Status | Notes |
|---|---|---|
| Patients · Courses · Prescriptions · Analytics tabs | WORKING | Tab state persisted to `_patientHubTab`. |
| New patient | WORKING | Server `POST /api/v1/patients`. |
| Patient row click | WORKING | Routes to per-patient analytics dashboard. |
| Save medical history | WORKING | `patchPatientMedicalHistorySections` / `replacePatientMedicalHistory`. |
| Assign assessment | WORKING | `assignAssessment` / `bulkAssignAssessments`. |

## Scheduling Hub (`pgSchedulingHub`)

| Element | Status | Notes |
|---|---|---|
| Calendar grid (week / day / resources / month) | WORKING | Renders from `api.listSessions()`; if endpoint errors, demo banner + seeded events. |
| `+ New booking` | WORKING | Wizard → `api.bookSession()` or `api.createSession()`. Shows "Booked (local)" warning toast on backend failure so beta testers know nothing was persisted. |
| Reschedule | WORKING | `api.updateSession`. |
| Cancel | WORKING | `api.cancelSession`. |
| Check conflicts | WORKING | `api.checkSlotConflicts` with deterministic local fallback. |
| Triage / dismiss / assign / book referral | WORKING | `api.triageReferral`, `api.dismissReferral`. |

## Finance Hub (`pgFinanceHub`)

| Element | Status | Notes |
|---|---|---|
| Overview · Invoices · Payments · Insurance · Analytics tabs | WORKING | Real `/api/v1/finance/*`. |
| New invoice | WORKING | `api.finance.createInvoice`. |
| Edit / mark paid | WORKING | `updateInvoice`, `markInvoicePaid`. |
| Record payment | WORKING | `recordPayment`. |
| Submit claim | WORKING | `createClaim`, `updateClaim`. |
| Search / filters | WORKING | Filters re-issue list call. |
| Failure state | WORKING | Renders an explicit "Failed to load finance data — Retry" block when summary call fails. |

## Documents Hub (`pgDocumentsHubNew`)

| Element | Status | Notes |
|---|---|---|
| Document list | WORKING | `api.listDocuments()` hydrates over a localStorage seed. |
| Upload | WORKING | `api.uploadDocument(formData)`. |
| Open / Download | WORKING (this branch) | Now uses `api.documentDownloadUrl(id)` when an `_apiId` is present. Previously showed "PDF generation coming soon". |
| Send for signature | WORKING | Updates server status. |
| Mark signed | WORKING | Updates `signed_at` + status. |
| Replace | WORKING | Triggers re-upload. |
| Fill (Consent) | WORKING (this branch) | Now routes into the consent capture surface. |
| Fill (Intake / Clinical) | PARTIAL | Routes to a "fills are completed in the patient portal" notice. Fills via portal work end-to-end. |
| Assign to patient | WORKING | `api.assignDocument`. |
| Templates | WORKING | `api.listDocumentTemplates`, CRUD wired. |

## Reports Hub (`pgReportsHubNew`)

| Element | Status | Notes |
|---|---|---|
| Reports list | WORKING | `api.listReports()`. |
| Open report | WORKING | Inline render. |
| Generate AI summary | WORKING | `api.generateReportSummary(id)` (auth gated to owner + patient access). |
| Export PDF | WORKING | `documentDownloadUrl` for stored reports; protocol/handbook DOCX via `exportProtocolDocx`/`exportHandbookDocx`. |
| Export FHIR / BIDS bundle | WORKING | `/api/v1/export/fhir-r4-bundle`, `/api/v1/export/bids-derivatives` (clinic-ownership gated). |
| Population reports tab | WORKING | Aggregates outcomes from `longitudinalReport`. |

## qEEG Analysis (`pgQEEGAnalysis`)

| Element | Status | Notes |
|---|---|---|
| EDF/BDF/SET upload | WORKING | `api.uploadQEEG`. |
| Analyze (run pipeline) | WORKING | `api.analyzeQEEG` / `analyzeQEEGMNE`. |
| Status polling | WORKING | `api.getQEEGStatus`. |
| Quality check / advanced run | WORKING | Real backend. |
| Brain-age prediction, condition scoring, centiles, embeddings, explain | WORKING | Real `/api/v1/qeeg-analysis/*`. |
| AI report generation | WORKING | `api.generateQEEGAIReport`. |
| Compare two analyses | WORKING | `api.compareQEEGAnalyses`. |
| PDF download | WORKING | Direct browser open of authenticated PDF URL. |
| Recommend protocol | WORKING | `api.recommendProtocolFromQEEG`. |
| Connectivity panel "Coming Soon" badges (dwPLI, PLV, PDC, DTF) | UI ONLY (labeled) | Static informational chips, no buttons. Keep — clearly labeled, not actionable. |

## MRI Analysis (`pgMRIAnalysis`)

| Element | Status | Notes |
|---|---|---|
| NIfTI upload | WORKING | `api.uploadMRI`. |
| Analyze | WORKING | Pipeline endpoint. |
| Brain age gauge | WORKING | Validates `brain_age` before render (d4c5558). |
| Compare studies | WORKING | When ≥2 reports exist. |
| Bottom strip: PDF / HTML / JSON / FHIR / BIDS | WORKING | Auth-gated download URLs. |
| Per-target "Send to Neuronav" | WORKING (this branch) | Now exports the target as JSON for manual import (was a fake "stub" toast). |
| "View overlay", "Download target JSON" | WORKING | Real overlay open / blob download. |
| Open patient timeline | WORKING | Routes to `patient-timeline`. |
| ~~"Share with referring provider"~~ | REMOVED (this branch) | Was UI-only "coming soon" toast — now hidden. |
| ~~"Open in Neuronav"~~ | REMOVED (this branch) | Was UI-only "coming soon" toast — now hidden. |
| Annotation drawer | WORKING | `api.annotateAnalysis`. |

## DeepTwin (`pgDeeptwin`)

| Element | Status | Notes |
|---|---|---|
| Patient summary / timeline / signals / correlations / predictions | WORKING | All `/api/v1/deeptwin/patients/{pid}/*`. |
| Run simulation | WORKING | `runTwinSimulation` with 30s client timeout. |
| Compare scenarios | WORKING | Up to 3 in cache; UI notifies on eviction. |
| Evidence basis | WORKING | `deeptwinEvidence`. |
| Generate handoff | WORKING | `postTwinAgentHandoff`, requires confirm before send. |
| Generate twin report | WORKING | `generateTwinReport`. |
| Sim Room overlay | WORKING | Lazy-loaded `sim-room.js`. |

## Brain Twin (`pgBrainTwin`)

| Element | Status | Notes |
|---|---|---|
| Analyze / simulate / evidence | WORKING | `/api/v1/brain-twin/*`. |

## AI Agents (`pgAgentChat`)

| Element | Status | Notes |
|---|---|---|
| Provider switch (GLM-Free / Claude / GPT-4o) | WORKING | Local pref + skill metadata. |
| Send message | WORKING | `chatAgent` / `chatClinician` / `chatPatient`. Failures surface inline error. |
| Skill chips | WORKING | Pre-fills the input. |
| Tasks list (created by agent) | WORKING | `listHomeProgramTasks`, falls back to localStorage when offline. |
| Add task / Complete task | WORKING | `createHomeProgramTask` etc. |
| Config view (provider key) | WORKING | Stored in `localStorage`. |

## Virtual Care / Messaging (`pgVirtualCare`)

| Element | Status | Notes |
|---|---|---|
| Inbox / messages | WORKING | `/api/v1/patient-messages`. |
| Send message | WORKING | Posts to clinician thread. |
| Schedule video / voice | PARTIAL | Buttons route to calendar with explanatory toast (no native scheduler in-call). |
| Start call | WORKING | Embeds Jitsi room. |
| Live transcription | WORKING | Uses Web Speech API where available; warns on Safari/Firefox. |
| AI summary (post-call) | WORKING | `chatAgent` summarisation. |
| Voice / video / mute outer controls | REMOVED (this branch) | Were duplicates outside the Jitsi iframe and could not reach the iframe's media tracks (cross-origin). |
| Capture clinical note | WORKING | `createClinicianNote` with retry. Sign-off uses `approveClinicianDraft`. |
| Dismiss / resolve call request | WORKING | `resolveCallRequest`. |
| One-click actions (Note, Task, Assessment, Flag, Follow-up, Monitoring, Home Tasks) | WORKING | Each navigates to the right hub and surfaces a context toast. |

## Patient profile (clinician view, `pgPatientProfile`)

| Element | Status | Notes |
|---|---|---|
| Tabs: Overview · Sessions · Assessments · Documents · Reports · Notes · Tasks · Comms | WORKING | All wired to real APIs. |
| Save profile fields | WORKING | `updatePatient`. |
| Open course | WORKING | Routes to `course-detail`. |
| Trigger AE report | WORKING | `reportAdverseEvent`. |
| Generate report | WORKING | `createReport`, `generateReportSummary`. |
| Export FHIR / BIDS | WORKING | Server-side ownership gates. |

## Patient portal (`pgPatient*`)

| Element | Status | Notes |
|---|---|---|
| Today task list | WORKING | `listPatientTasks` + completion `portalCompleteHomeProgramTask`. |
| Daily check-in | WORKING | Persists to `outcomes-router`. |
| Wellness library | WORKING | Static + dynamic mix. |
| Marketplace product card → Buy | WORKING | Opens `external_url` (Amazon etc.). When no URL, shows "link coming soon" toast (the catalog item is incomplete, not a missing feature). |
| Wearables connect | PARTIAL | Real OAuth for Polar/Oura via `wearables_router` exists; in-portal "Connect" button surfaces a server-driven flow when device-registry is configured. |
| Patient assistant (AI) | WORKING | `chatPatient` with patient context. Disclaimer copy makes clear this is decision support, not a clinician. |
| Voice / video upload | WORKING | `patientUploadAudio`/`patientUploadVideo` with consent gate. |
| Outcome surveys | WORKING | `submitOutcomeSurvey`. |
| Messages | WORKING | Patient-side messaging is gated to the patient's own thread (5d audit fix). |

## Public / marketing (`pages-public.js`)

| Element | Status | Notes |
|---|---|---|
| Pricing | WORKING | Stripe checkout + sales inquiry. |
| Demo button (Patient / Clinician) | WORKING when `VITE_ENABLE_DEMO=1` | Otherwise hidden. |
| Sign-in | WORKING | Real auth + 2FA. |
| Sales inquiry form | WORKING | `/api/v1/chat/sales`. |

## Cross-cutting

| Element | Status | Notes |
|---|---|---|
| Notification bell + SSE | WORKING | Deduped by event id; persists state. |
| Language switcher | WORKING | `_setLocale` + nav re-render. |
| Theme toggle | DISABLED | Dark mode is forced — see `app.js` `_setTheme` no-op. Could be hidden if not desired. |
| High-contrast toggle | WORKING | Body class + announce. |
| Idle-timeout sign-out | WORKING | `_handleSessionExpired`. |
| Error toasts | WORKING | All previously-blocking `alert()` swept to `_dsToast` / `_showNotifToast` last sprint. |
