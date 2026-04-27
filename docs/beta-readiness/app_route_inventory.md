# App Route Inventory

DeepSynaps Studio — beta-readiness audit, generated 2026-04-27.

The web app is a single-page Vite app with a hand-rolled hash-style router in
`apps/web/src/app.js` (`switch (currentPage)` inside `renderPage()`). Each
route lazy-imports a page module from `apps/web/src/pages-*.js`. Routes that
require auth gate at the renderPage entry; routes that don't are listed in
`PUBLIC_ROUTES`.

For brevity below, identical routes that simply set a sub-tab state and
`_nav()` to a hub are listed once with their hub.

## 1. Public / unauthenticated routes (`pages-public.js`)

Driven by a separate `navigatePublic()` switch:

| Route id | Purpose | Status |
|---|---|---|
| `home` | Landing page | WORKING |
| `signin` / `login` | Sign-in form, with optional demo tab in dev / `VITE_ENABLE_DEMO=1` | WORKING |
| `signup-clinic`, `signup-patient` | Account creation | WORKING |
| `pricing` | Plans + Stripe checkout | WORKING (real `/api/v1/payments/create-checkout`) |
| `forgot-password`, `reset-password` | Password reset | WORKING (token-gated) |
| `2fa-setup`, `2fa-verify` | TOTP enrolment | WORKING |
| `permissions` (admin) | Role matrix | WORKING |
| `multi-site` (admin) | Multi-site overview | WORKING |
| `404` | Fallback | WORKING |

## 2. Patient portal routes (`pages-patient.js`, navigated via `navigatePatient()`)

| Route id | Purpose | Status |
|---|---|---|
| `patient-dashboard` | Today/wellness summary | WORKING (uses real `api.patientPortal*`) |
| `patient-courses` | Active courses | WORKING |
| `patient-tasks` / `patient-homework` | Treatment tasks | WORKING (server-authoritative completion) |
| `patient-assessments` | Assessment forms | WORKING |
| `patient-messages` | Threaded messaging with assigned clinician | WORKING (auth-gated to own patient id) |
| `patient-wearables` | Connected devices + bio sync | PARTIAL (UI shows placeholder when no devices) |
| `pt-media-capture`, `pt-media-history`, `pt-media-consent` | Voice/video patient uploads | WORKING |
| `pt-outcomes` | Outcome surveys | WORKING |
| `patient-marketplace` | Wellness store with Amazon links | WORKING (open to external) |
| `patient-virtualcare` | Patient-side virtual care | WORKING |
| `patient-careteam` | Care-team contact list | WORKING |
| `patient-education` | Education library | WORKING |
| `patient-profile` | Profile edit | WORKING |
| `guardian-portal` | Guardian view | WORKING |

## 3. Clinician routes (lazy modules)

### Today / Dashboard
| Route id | Module | Purpose | Status |
|---|---|---|---|
| `today` / `home` / `dashboard` | `pages-clinical.js` `pgDash` | Clinic dashboard | WORKING (hard-fails on core endpoint failure since 4c5ddaf) |

### Patients & courses
| Route id | Module | Status |
|---|---|---|
| `patients` / `patients-hub` / `patients-v2` | `pages-clinical-hubs.js` `pgPatientHub` | WORKING |
| `patients-full` | `pages-clinical.js` `pgPatients` | WORKING |
| `patient-analytics` | `pages-patient-analytics.js` | WORKING |
| `patient` / `patient-profile` | `pages-clinical.js` `pgPatientProfile` | WORKING |
| `homework-builder` | `pages-patient.js` `pgHomeworkBuilder` | WORKING |
| `intake` | `pages-patient.js` `pgIntake` | WORKING |
| `data-import` | `pages-patient.js` `pgDataImport` | WORKING (with file-size guard) |
| `courses-full` | `pages-courses.js` `pgCourses` | WORKING |
| `course-detail` | `pages-courses.js` `pgCourseDetail` | WORKING |
| `session-execution` | `pages-courses.js` `pgSessionExecution` | WORKING |
| `session-monitor` | `pages-courses.js` `pgSessionMonitor` | WORKING |
| `course-completion-report` | `pages-courses.js` `pgCourseCompletionReport` | WORKING |
| `review-queue` | `pages-courses.js` `pgReviewQueue` | WORKING |
| `calendar` | `pages-courses.js` `pgCalendar` | WORKING |
| `clinical-notes` | `pages-courses.js` `pgClinicalNotes` | WORKING |
| `ai-note-assistant` | `pages-courses.js` `pgAINoteAssistant` | WORKING |
| `population-analytics` | `pages-courses.js` `pgPopulationAnalytics` | WORKING |
| `outcome-prediction` | `pages-courses.js` `pgOutcomePrediction` | WORKING |
| `rules-engine` | `pages-courses.js` `pgRulesEngine` | WORKING |
| `protocols-registry-full` | `pages-courses.js` `pgProtocolRegistry` | WORKING |
| `adverse-events-full` | `pages-courses.js` `pgAdverseEvents` | WORKING |

### Protocol intelligence
| Route id | Module | Status |
|---|---|---|
| `protocol-hub` (+ `protocols`, `protocol-wizard`) | `pages-clinical-hubs.js` `pgProtocolHub` | WORKING |
| `protocol-search-full` | `pages-protocols.js` `pgProtocolSearch` | WORKING |
| `protocol-builder-full`, `protocol-builder` | `pages-protocols.js` `pgProtocolBuilderV2` | WORKING (governance gates: off-label requires reviewed) |
| `protocol-detail` | `pages-protocols.js` `pgProtocolDetail` | WORKING |
| `brain-map-planner` (`brain-map-full`, `reg-protocols`, `brainmap-v2`) | `pages-clinical-tools.js` `pgBrainMapPlanner` | WORKING |
| `protocols-registry` | `pages-protocols.js` `pgProtocolSearch` | WORKING |
| `personalized-protocol`, `brain-scan-protocol` | `pages-clinical-hubs.js` `pgProtocolHub` (mode hint) | WORKING |
| `condition-backlog` | `pages-conditions.js` `pgConditionBacklog` | WORKING |
| `decision-support` | `pages-clinical.js` `pgDecisionSupport` | WORKING |
| `benchmark-library` | `pages-clinical-tools.js` `pgBenchmarkLibrary` | WORKING |
| `outcomes` (alias) | `pages-clinical-hubs.js` `pgClinicalHub` (outcomes tab) | WORKING |
| `braindata` | `pages-clinical.js` `pgBrainData` | WORKING |

### Knowledge / registries
| Route id | Module | Status |
|---|---|---|
| `evidence` | `pages-knowledge.js` `pgEvidence` | WORKING |
| `brainregions` | `pages-knowledge.js` `pgBrainRegions` | WORKING |
| `qeegmaps` / `biomarkers` | `pages-knowledge.js` `pgQEEGMaps` | WORKING |
| `handbooks` / `handbooks-full` / `handbooks-v2` / `reg-handbooks` | `pages-handbooks.js` `pgHandbooks` | WORKING (DOCX export wired for clinical handbooks) |
| `report-builder` | `pages-knowledge.js` `pgReportBuilder` | WORKING |
| `quality-assurance` | `pages-knowledge.js` `pgQualityAssurance` | WORKING |
| `clinical-trials` | `pages-knowledge.js` `pgClinicalTrials` | WORKING |
| `trial-enrollment` | `pages-knowledge.js` `pgTrialEnrollment` | WORKING |
| `staff-scheduling` | `pages-knowledge.js` `pgStaffScheduling` | WORKING |
| `clinic-analytics` | `pages-knowledge.js` `pgClinicAnalytics` | UI ONLY (clearly labeled "Preview data" — see fake_or_incomplete_features.md) |
| `protocol-marketplace` | `pages-knowledge.js` `pgProtocolMarketplace` | WORKING |
| `data-export` | `pages-knowledge.js` `pgDataExport` | WORKING |
| `literature` | `pages-knowledge.js` `pgLiteratureLibrary` | WORKING |
| `irb-manager` | `pages-knowledge.js` `pgIRBManager` | WORKING |
| `longitudinal-report` | `pages-knowledge.js` `pgLongitudinalReport` | WORKING |
| `pricing` | `pages-knowledge.js` `pgPricing` | WORKING |

### Hubs (design-v2 surfaces)
| Route id | Module | Status |
|---|---|---|
| `clinical-hub` / `assessments` / `assessments-v2` | `pages-clinical-hubs.js` `pgClinicalHub` | WORKING |
| `scheduling` / `scheduling-hub` / `schedule-v2` | `pages-clinical-hubs.js` `pgSchedulingHub` | WORKING (demo banner when `/api/v1/sessions` errors) |
| `monitor-hub` | `pages-clinical-hubs.js` `pgMonitorHub` | WORKING |
| `virtual-care-hub` | `pages-clinical-hubs.js` `pgVirtualCareHub` | WORKING |
| `documents-hub` / `documents-v2` / `documents` | `pages-clinical-hubs.js` `pgDocumentsHubNew` | WORKING (download wired to API) |
| `reports-hub` / `reports-v2` | `pages-clinical-hubs.js` `pgReportsHubNew` | WORKING |
| `finance-hub` / `finance-v2` | `pages-clinical-hubs.js` `pgFinanceHub` | WORKING (server-backed) |
| `marketplace` | `pages-clinical-hubs.js` `pgMarketplaceHub` | WORKING |

### Operations
| Route id | Module | Status |
|---|---|---|
| `messaging` (alias of virtualcare) | `pages-virtualcare.js` `pgVirtualCare` | WORKING |
| `live-session`, `live-session-monitor` | `pages-virtualcare.js` `pgVirtualCare` | WORKING |
| `home-task-manager` / `home-tasks-v2` | `pages-clinical-tools.js` `pgHomePrograms` | WORKING |
| `consent-automation` | `pages-clinical-tools.js` `pgConsentAutomation` | PARTIAL (rule toggle is local-only, clearly labeled) |
| `forms-builder` | `pages-clinical-tools.js` `pgFormsBuilder` | WORKING |
| `med-interactions` | `pages-clinical-tools.js` `pgMedInteractionChecker` | WORKING |
| `media-queue` / `media-detail` | `pages-clinical-tools.js` `pgMediaReviewQueue` / `pgMediaDetail` | WORKING |
| `clinician-dictation` | `pages-clinical-tools.js` `pgClinicianDictation` | WORKING |
| `clinic-day` / `patient-queue` | `pages-clinical-tools.js` | WORKING |
| `clinician-draft-review` | `pages-clinical-tools.js` `pgClinicianDraftReview` | WORKING |
| `evidence-builder` | `pages-clinical-tools.js` `pgEvidenceBuilder` | WORKING |
| `prescriptions-full` | `pages-clinical-tools.js` `pgPrescriptions` | WORKING |
| `patient-protocol` | `pages-clinical-tools.js` `pgPatientProtocolView` | WORKING |
| `advanced-search` | `pages-clinical-tools.js` `pgAdvancedSearch` | WORKING |

### Practice + admin
| Route id | Module | Status |
|---|---|---|
| `programs` | `pages-practice.js` `pgPrograms` | WORKING (3-tab Education) |
| `referrals` | `pages-practice.js` `pgReferrals` | WORKING |
| `reminders` | `pages-practice.js` `pgReminderAutomation` | WORKING |
| `telehealth`, `telehealth-recorder` | `pages-practice.js` | WORKING |
| `admin` | `pages-practice.js` `pgAdmin` | WORKING |
| `clinic-settings`, `settings`, `clinician-account`, `academy` | `pages-practice.js` | WORKING |
| `tickets` | `pages-practice.js` `pgTickets` | WORKING |
| `governance-v2`, `settings-v2`, `system-health` | `pages-practice.js` `pgSettingsHub` | WORKING |

### Analyzers / AI
| Route id | Module | Status |
|---|---|---|
| `qeeg-analysis` | `pages-qeeg-analysis.js` `pgQEEGAnalysis` | WORKING (real upload → analyze → AI report) |
| `mri-analysis` | `pages-mri-analysis.js` `pgMRIAnalysis` | WORKING (real upload → analyze → report; pretend Neuronav buttons removed in this branch) |
| `deeptwin` | `pages-deeptwin.js` `pgDeeptwin` | WORKING (sim 30s timeout, evidence basis required) |
| `brain-twin` | `pages-brain-twin.js` `pgBrainTwin` | WORKING |
| `monitor` / `device-dashboard` | `pages-monitor.js`, `pages-device-dashboard.js` | WORKING |
| `patient-timeline` | `pages-patient-timeline.js` | WORKING |
| `ai-assistant` | `pages-practice.js` `pgAIAssistant` | WORKING (calls `/api/v1/chat/agent`) |
| `ai-agents` / `ai-agent-v2` | `pages-agents.js` `pgAgentChat` | WORKING (`chatAgent`/`chatClinician`/`chatPatient`) |
| `research-v2` | `pages-research.js` `pgResearch` | WORKING |
| `research-evidence` / `library-hub` / `library-v2` | `pages-research-evidence.js` `pgResearchEvidence` | WORKING |
| `condition-package` | `pages-knowledge.js` `pgConditionPackage` | WORKING |
| `audittrail` | `pages-knowledge.js` `pgAuditTrail` | WORKING |
| `onboarding`, `onboarding-wizard` | `pages-onboarding.js` | WORKING |

### Aliases / sub-tabs
The router also accepts these sub-tab aliases that just set a `window._*Tab`
state and re-navigate to a parent hub: `billing`, `insurance`, `prescriptions`,
`assessments-hub`, `medical-history`, `outcomes-redirect`, `consent-management`,
`condition-packages`, `notes-dictation`, `wearable-integration`,
`reg-conditions`, `reg-assessments`, `reg-protocols-full`, `reg-devices`,
`reg-targets`, `reg-handbooks-full`, `reg-virtual-care`, `monitoring`,
`wearables`, `protocol-studio`, `population-reports`. All resolve into
working hub views.

## Backend route inventory (relevant to beta surfaces)

Listed centrally in `apps/api/app/main.py` (~50 routers). Highlights:

- Auth: `auth_router`, `2fa_router`, `password_router`. Demo login is forced
  off in production/staging.
- Patients: `patients_router`, `patient_portal_router`, `patient_messaging_router`.
- Sessions / scheduling: `sessions_router` (also serves the scheduling hub via
  `bookSession`/`createSession`/`updateSession`/`cancelSession`).
- Treatment courses: `treatment_courses_router`, `review_queue_router`,
  `course_safety_router`.
- Assessments: `assessments_router`, `cohorts_router`, `crisis_router`.
- Documents: `documents_router` (CRUD + `/upload` + `/download`,
  governance-aware). Templates at `documents/templates`.
- Reports: `reports_router` (per-patient, AI summary, render).
- Recordings: `recordings_router` (Fly volume).
- Media uploads: `media_router` (patient + clinician).
- Home program tasks: `home_program_tasks_router`,
  `home_task_templates_router`.
- Adverse events: `adverse_events_router`.
- Protocols: `protocols_router` (generate, save, refresh literature),
  `governance_router`.
- Evidence: `evidence_router`, `library_router`, `literature_router`.
- qEEG: `qeeg_records_router`, `qeeg_analysis_router`,
  `qeeg_advanced_router`, `qeeg_live_ws.py`.
- MRI: `mri_router`, `mri_fusion_router`.
- DeepTwin / Brain Twin: `deeptwin_router`, `brain_twin_router`,
  TRIBE-extended endpoints.
- Finance: `finance_router` (invoices, payments, claims, summary, monthly).
- Payments: `payments_router` (Stripe).
- Chat: `chat_router` (public, sales, agent, clinician, patient).
- Audit + governance: `audit_router`, `governance_router`.
- Admin: `admin_pgvector_router`, `feature_store_router`.
- Notifications & SSE: `notifications_router`, `sse_router`.
