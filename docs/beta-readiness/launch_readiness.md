# Launch Readiness — Beta

DeepSynaps Studio
Branch: `cursor/beta-readiness-functional-completion-9a99`
Date: `2026-04-27`

## Recommendation

**Conditionally ready for beta.**

All P0 critical user journeys (auth, patient view, booking, report PDF
export, documents upload/download, course safety preflight, AE reporting,
consent capture) are wired to real backends and pass tests. The two
highest-visibility pretend interactions — MRI Neuronav buttons and Virtual
Care outer-iframe call controls — are removed. Documents Hub
download/open is wired to the authenticated `/api/v1/documents/{id}/download`
endpoint instead of a "PDF generation coming soon" toast.

Beta testers should not encounter any visible button that looks live but
isn't. The remaining placeholder surfaces (Clinic Analytics, FEM overlay
for brain-map, dwPLI / PLV / PDC / DTF connectivity chips) are
honestly labeled in the UI as "Preview data" or "Coming Soon" and have no
fake action.

## What is safe for beta

- **Auth** — login, 2FA, password reset, demo login is force-disabled in
  staging / production.
- **Patient management** — create, view, intake, profile edit, sessions,
  assessments, notes, documents, reports, tasks, messages.
- **Scheduling** — create, reschedule, cancel, conflict-check, referrals.
  Demo banner kicks in if `/api/v1/sessions` is unavailable; new bookings
  during outage label themselves "(local)".
- **Finance** — invoices, payments, claims, insurance with full CRUD via
  `/api/v1/finance/*`. Failure states render Retry blocks.
- **Documents** — upload, download (newly wired), open, send for
  signature, mark signed, replace, archive.
- **Reports** — generate, AI summary (ownership-gated), PDF/DOCX export,
  FHIR/BIDS bundles (clinic-ownership-gated).
- **qEEG analyzer** — upload, analyze, status poll, AI report, PDF,
  brain-age, condition scoring, embeddings, recommend protocol.
- **MRI analyzer** — upload, analyze, view targets, download PDF/HTML/JSON
  /FHIR/BIDS, per-target JSON export for Neuronav, annotation drawer.
- **DeepTwin** — summary, timeline, signals, correlations, predictions,
  scenario simulation (with 30s client timeout + eviction notification),
  evidence basis, generate handoff (with confirmation), generate report.
- **AI agents** — Practice / Clinician / Patient chats with provider
  switch; Free GLM tier works without an API key.
- **Course management** — wizard, safety preflight + override, activate,
  log sessions, review queue, course completion report, AE reporting.
- **Protocol intelligence** — search, builder v2 (governance-gated for
  off-label), brain-map planner, decision support, benchmark library,
  protocol marketplace, protocol detail, evidence basis.
- **Knowledge surfaces** — evidence, brain regions, qEEG maps, handbooks
  (clinical DOCX export wired), report builder, QA, clinical trials,
  literature, IRB, longitudinal report.
- **Patient portal** — dashboard, tasks, assessments, messages, wellness,
  marketplace (Amazon/external), virtualcare, careteam, education,
  outcomes, media capture (gated by consent).
- **Public marketing** — pricing, sign-up, sales inquiry, Stripe checkout.
- **Practice / admin** — settings, team, clinic profile, academy,
  governance, system health, audit trail, multi-site (admin only).

## What is still risky / has limitations

| Limitation | Impact | Mitigation in place |
|---|---|---|
| Clinic Analytics page renders seeded demo values | Wrong numbers if a clinician acts on them | Sticky `Preview data` banner explains; not in primary nav |
| Consent signature pad does not validate strokes before save | Empty signatures could be saved | Awaiting clinical PM sign-off on enforcement copy |
| SOAP note autosave is localStorage-only | Data loss if browser cache cleared mid-session | Notes can be re-synced manually; planned server endpoint |
| DeepTwin sim 30 s timeout is client-side | Server keeps running long jobs | Client UX is correct; server cancellation is a future endpoint |
| FEM (ROAST/SimNIBS) overlay on brain-map | Heatmap is geometry-only qualitative | Clearly labeled in UI |
| Connectivity dwPLI / PLV / PDC / DTF | Static "Coming Soon" chips on report | No interactive button — pure label |
| Wearable OAuth (Polar/Oura) | Only configured devices are working | Empty-state helper text |
| Patient JSON import XSS | Backend already sanitises | DOMPurify pass deferred for security review |

## What was disabled or hidden

| Surface | Action | Why |
|---|---|---|
| MRI Analyzer · bottom strip | "Share with referring provider" | No real backend integration. |
| MRI Analyzer · bottom strip | "Open in Neuronav" | No real backend integration. |
| Virtual Care · in-call overlay | Mute / Camera / Record outer buttons | Could not reach the Jitsi iframe's media tracks (cross-origin); pretend toggles. |
| Theme toggle | `_setTheme` | Product decision: dark mode only. Toggle UI is not exposed. |

The MRI Per-target "Send to Neuronav" and the Virtual Care Note button were
**kept** because they perform real work (JSON download / open capture
modal).

## Highest-priority remaining beta blockers

These are tracked but **do not block opening beta**:

1. **Consent signature pad stroke validation.** Today the pad accepts an
   empty signature. Needs clinical PM sign-off on the "no signature →
   block save" UX before enforcing.
2. **SOAP note autosave** is localStorage-only. Plan a server-side
   autosave endpoint.
3. **DeepTwin simulation cancellation** on the server side.
4. **Clinic analytics aggregations** — need real `/api/v1/finance/monthly`,
   `/api/v1/sessions`, `/api/v1/leads` aggregation endpoints.
5. **Patient JSON import XSS belt-and-braces** with `DOMPurify`.
6. **Mobile responsive audit** — large-screen optimised; mobile is mostly
   workable but not audited.

## Pre-merge dance

```
git fetch
git checkout cursor/beta-readiness-functional-completion-9a99
npm install
npm run build:web
npm run test:unit --workspace @deepsynaps/web
```

All three should be `PASS`.

## Post-merge (recommended)

```
bash scripts/deploy-preview.sh
```

The Netlify build is already flagged `VITE_ENABLE_DEMO=1` so reviewers
can exercise the patient and clinician demo paths without the API
needing to be up to date.

## Recommendation

**Conditionally ready for beta.** Move forward.
