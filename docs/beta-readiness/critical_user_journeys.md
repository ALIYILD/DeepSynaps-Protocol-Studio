# Critical User Journeys — Beta Readiness

DeepSynaps Studio — 2026-04-27.

Each journey is rated on:

- **Business importance** (how central is it to the value prop)
- **Beta visibility** (how often a beta tester encounters it)
- **Likelihood of failure** (current code-state risk)
- **Trust damage if broken** (psychological cost when a clinician hits this
  failing during evaluation)

Risk = subjective rollup. **All P0/P1 journeys are wired to real backends as
of this branch.**

| # | Journey | Importance | Beta visibility | Failure likelihood | Trust damage | Risk |
|---|---|---|---|---|---|---|
| J1 | Login → 2FA → land on dashboard | Critical | Every session | Low | Catastrophic if broken | **P0** |
| J2 | Open patient → review profile → view sessions, assessments, notes | Critical | Every session | Low | High | **P0** |
| J3 | Create patient → intake → save | Critical | Onboarding | Low | High | **P0** |
| J4 | Create booking → reschedule → cancel | Critical | Daily | Low (server-backed) | High | **P0** |
| J5 | Generate report → export PDF | Critical | Weekly | Low | High | **P0** |
| J6 | Export report as DOCX (protocol / handbook / patient guide) | Critical | Weekly | Low | Medium | **P1** |
| J7 | qEEG upload → analyze → AI report → PDF | Critical | First-time setup, then ad-hoc | Medium (long pipeline) | High | **P1** |
| J8 | MRI upload → analyze → bottom-strip download (PDF/HTML/JSON/FHIR/BIDS) | Critical | First-time setup, then ad-hoc | Medium | High | **P1** |
| J9 | Run AI agent action (Practice Agent / Clinician chat) on patient context | Important | Daily for power users | Medium (LLM provider) | Medium | **P1** |
| J10 | DeepTwin: simulate scenario → compare → generate handoff | Important | Per-decision | Medium (simulator timeout) | Medium | **P1** |
| J11 | Add finance / budget record → save → totals reflect | Important | Front-office daily | Low | Medium | **P1** |
| J12 | Send message to clinician (patient portal) | Important | Daily for engaged patients | Low | Medium | **P1** |
| J13 | Capture clinical note (voice / text) → AI summary → sign | Important | Daily | Medium (Web Speech API browser support) | Medium | **P1** |
| J14 | Assign home-program task → patient completes from portal | Important | Weekly | Low | Medium | **P1** |
| J15 | Run prediction / risk score on a patient | Important | Per-decision | Low | Medium | **P2** |
| J16 | Course safety preflight → activate course | Critical | Per-course | Low | High | **P0** |
| J17 | Adverse-event reporting | Critical | Rare but high stakes | Low | Catastrophic | **P0** |
| J18 | Consent capture / signature | Critical | Onboarding + each new modality | Medium (signature pad still pending review) | High | **P1** |
| J19 | Document upload + download | Critical | Daily | Low (after this branch) | High | **P0** |
| J20 | Public marketing → sign-up → checkout | Important | Acquisition | Low | High | **P1** |
| J21 | Settings / clinic profile / team management | Important | Once | Low | Low | **P2** |
| J22 | Audit trail review | Important for compliance | Auditor only | Low | High | **P2** |

## Per-journey verification status

J1 (login + 2FA): Backend `auth_router`, `2fa_router`, `password_router`
covered by `tests/test_auth_persistence.py`, `tests/test_2fa_flow.py`. Demo
login disabled in production/staging. **OK for beta.**

J2 (patient view): Profile, sessions, assessments, notes all real. Tests:
`tests/test_patient_portal.py`, `tests/test_assessments_router.py`,
`tests/test_clinical_notes.py` (where present). **OK for beta.**

J3 (create patient): `POST /api/v1/patients` + intake form. **OK.**

J4 (booking lifecycle): `bookSession` / `createSession` / `updateSession`
/ `cancelSession` all wired. The wizard surfaces a "Booked (local)" warn
toast on backend failure — beta testers know if persistence fails. **OK.**

J5 (report PDF): `documentDownloadUrl` for stored reports; ownership-gated
since 2026-04-26 audit pass. **OK.**

J6 (DOCX export): `exportProtocolDocx`, `exportHandbookDocx`,
`exportPatientGuideDocx` all wired. Ops/training handbooks are explicitly
labelled as not yet DOCX-backed. **OK with limitations.**

J7 (qEEG flow): upload → analyze → status poll → AI report → download.
Tests in `pages-qeeg-analysis-page.test.js`, backend
`tests/test_qeeg_router.py`. **OK for beta.**

J8 (MRI flow): upload → analyze → bottom-strip downloads → annotation
drawer. Pretend "Share with referring provider" / "Open in Neuronav"
buttons are removed in this branch. **OK for beta.**

J9 (AI agent): `chatAgent` / `chatClinician` / `chatPatient`. Failure path
shows inline error. **OK.**

J10 (DeepTwin): real `/api/v1/deeptwin/*` endpoints; sim has a 30 s
client-side timeout; handoff requires confirmation. **OK with the caveat
that simulator timeouts do not cancel the server job.**

J11 (finance): Server-backed CRUD with retry block on summary failure.
**OK.**

J12 (patient messaging): patient-side gated to own thread; clinician thread
auto-discovered. **OK.**

J13 (notes): Web Speech API used opportunistically; manual fallback when
no transcript. Note save uses `createClinicianNote`. **OK.**

J14 (home program): Server-authoritative completion as of audit fixes.
Optimistic UI rolls back on save failure. **OK.**

J15 (predictions): All `/api/v1/qeeg-analysis/*/predict-*` and DeepTwin
predictions wire to real endpoints with validation guards (e.g.
brain_age guard d4c5558). **OK.**

J16 (course safety): `courseSafetyPreflight` returns structured override
flags; UI renders a real override modal. **OK.**

J17 (AE reporting): `reportAdverseEvent`, `resolveAdverseEvent`. **OK.**

J18 (consent): Capture flow wired; the audit notes the signature pad still
requires stroke-validation hardening before "no signature → block save"
is enforced. **OK with limitation — flagged in beta gate matrix.**

J19 (documents): Download + open + upload all wired (download newly real
in this branch). **OK.**

J20 (public sign-up + checkout): Stripe checkout via `payments_router`;
checkout-session creation tested in production-hardening suite. **OK.**

J21 (settings): Practice settings, team mgmt, clinic profile all real.

J22 (audit trail): `pgAuditTrail` reads from `audit_router` (real). **OK.**

## Negative-path scenarios (also exercised)

- Wrong creds → friendly error + lockout count in 2FA flow.
- Session expired in middle of action → `_handleSessionExpired` saves the
  intended destination and prompts re-login (audit-fixed).
- API down → toasts label local fallback as `(local)` + show retry block on
  finance summary, scheduling, dashboard.
- Off-label protocol routed through builder → blocked at submit unless
  reviewed and acknowledged.
- File too large for data import → client-side guard before upload
  (f240565).
- Invalid brain-age → gauge falls back to "data unavailable" stub instead
  of a misleading 0 reading.
