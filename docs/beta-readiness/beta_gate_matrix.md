# Beta Gate Matrix

DeepSynaps Studio — 2026-04-27.

Every page or major feature is rated:

- **READY FOR BETA** — works end-to-end, error states handled.
- **READY WITH LIMITATIONS** — works for the common case; specific
  caveats called out below.
- **NOT BETA READY** — hidden, disabled, or labeled "Coming soon" /
  "Preview data" in the UI.

| Module / Surface | Gate | Notes |
|---|---|---|
| Auth + 2FA + password reset | READY | Demo login forced off in production/staging. |
| Public marketing + pricing + sign-up | READY | Stripe checkout live. |
| Today / Dashboard | READY | Hard-fail error block when core endpoints fail. |
| Patient Hub (Patients · Courses · Prescriptions · Analytics) | READY | All tabs server-backed. |
| Patient profile (clinician view) | READY | Full CRUD + report generation. |
| Patient portal (Today / Tasks / Assessments / Messages / Wellness) | READY | Patient identity properly scoped. |
| Patient Marketplace | READY WITH LIMITATIONS | Buy buttons go to Amazon/external; rows without `external_url` show a `link coming soon` toast. Catalog data only. |
| Patient Wearables (clinic-side) | READY WITH LIMITATIONS | OAuth flows for Polar / Oura where configured; otherwise empty-state helper text. |
| Scheduling Hub | READY WITH LIMITATIONS | Real bookings via `sessions_router`. When the API is unavailable the demo banner appears with a `Try real backend` retry. |
| Calendar (legacy `pgCalendar`) | READY | |
| Finance Hub (Overview · Invoices · Payments · Insurance · Analytics) | READY | Full CRUD via `finance_router`. |
| Documents Hub | READY | Download/open now wired to authenticated `/api/v1/documents/{id}/download` (this branch). |
| Reports Hub | READY | PDF + DOCX + FHIR + BIDS exports all wired. AI summary requires ownership. |
| Course wizard (intake → preflight → activate → log sessions) | READY | Off-label gating + safety preflight live. |
| Review queue | READY | Approve / reject / escalate posts to `/review-queue/actions`. |
| Adverse events | READY | Severity-aware nav badge. |
| qEEG Analysis | READY | Upload → analyze → AI report → PDF. Connectivity "Coming Soon" chips are static labels, not buttons. |
| MRI Analysis | READY | Upload → analyze → bottom-strip downloads + per-target JSON export. Pretend Neuronav buttons removed. |
| DeepTwin | READY WITH LIMITATIONS | Sim timeout is client-only; the backend job is not cancelled. Handoff requires explicit confirmation. |
| Brain Twin (alias surface) | READY | |
| Patient Timeline | READY | |
| Monitor Hub / Device Dashboard | READY | |
| Virtual Care / Messaging | READY | Mute/Camera/Record outer-iframe buttons removed (this branch); native Jitsi controls remain. Live transcription requires Chrome / Edge. |
| Live session | READY | |
| Home programs / task manager | READY | Server-authoritative completion + optimistic UI rollback. |
| Consent management | READY | |
| Consent automation | READY WITH LIMITATIONS | Rule toggle is local-only; toast labels it. |
| Forms builder | READY | |
| Med interactions | READY | |
| AI Agents (Practice / Clinician / Patient chat) | READY | |
| AI Note Assistant | READY | |
| Clinical notes | READY | |
| Population analytics + outcome prediction + rules engine | READY | |
| Protocol Hub (browse · generate · personalised · brain-scan) | READY | |
| Protocol Builder v2 | READY | |
| Protocol Detail | READY | |
| Brain map planner | READY WITH LIMITATIONS | Heatmap on Clinical tab is qualitative geometry only — labeled. FEM (ROAST/SimNIBS) overlay flagged "coming soon". |
| Conditions backlog | READY | |
| Decision support | READY | |
| Benchmark library | READY | |
| Knowledge / Evidence / Brain regions / qEEG maps / Handbooks | READY | |
| Handbook DOCX export | READY WITH LIMITATIONS | Clinical handbooks export. Ops / training handbooks are labeled "not yet wired to DOCX backend". |
| Report builder | READY | |
| Quality assurance | READY | |
| Clinical trials + IRB manager + Trial enrollment | READY | |
| Staff scheduling | READY | |
| **Clinic analytics** | NOT BETA READY (LABELED) | Renders an explicit `Preview data` banner. Charts are seeded demo values until `/api/v1/finance/monthly`, `/api/v1/sessions`, `/api/v1/leads` aggregations are wired. Page is intentionally kept visible because the banner is honest, but **should not be used to make business decisions during beta**. |
| Protocol marketplace | READY | |
| Data export | READY | |
| Literature library | READY | |
| Longitudinal report | READY | |
| Pricing (clinician view) | READY | |
| Audit trail | READY | |
| Onboarding + onboarding wizard | READY | |
| Practice / Programs | READY | |
| Referrals | READY | |
| Reminders | READY | |
| Telehealth + Telehealth recorder | READY | |
| Admin / Permissions / Multi-site | READY | Admin-only routes. |
| Clinic settings, settings, clinician account, academy | READY | |
| Marketplace hub | READY | |
| Tickets | READY | |
| Governance + system health | READY | |
| Research + Research evidence | READY | |
| Research datasets / safety signals | READY | |

## Hidden or disabled in this beta cycle

- Theme toggle (`_toggleTheme`) is a no-op; product decision to ship dark
  mode only. The button is not exposed, so this is invisible.
- "Send to Neuronav" overlay action — replaced with target JSON download.
- "Share with referring provider" — hidden, no real backend.
- "Open in Neuronav" — hidden.
- Outer-iframe Mute / Camera / Record buttons in Virtual Care — removed.

## Highest-priority remaining beta blockers

None of the items below block opening beta to friendly clinics, but each
has a follow-up tracked:

1. **Consent signature pad stroke validation** (`ISSUE-AUDIT-012`) — needs
   clinical PM sign-off on the "no signature → block save" UX before we can
   enforce it. Today the pad accepts an empty signature.
2. **SOAP note autosave** is localStorage-only. Data-loss risk if the
   browser cache is cleared mid-session. Needs a server-side autosave
   endpoint.
3. **DeepTwin simulation timeout** is client-only. Long-running server jobs
   keep running. Add a real cancellation endpoint.
4. **Clinic analytics aggregations** are not yet wired to real endpoints.
   The page is honest about it but cannot be relied on for business
   decisions.
5. **Patient JSON import XSS** — backend sanitises; a frontend `DOMPurify`
   pass would be belt-and-braces (security-team call).

## Recommendation

**Conditionally ready for beta.** All P0 / P1 critical journeys (J1-J22)
are wired to real backends. Pretend buttons in the most-visible analyzer
flows have been removed. Remaining limitations are honestly labeled in the
UI and tracked above.
