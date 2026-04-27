# Fixes Applied — Beta Readiness Pass

Branch: `cursor/beta-readiness-functional-completion-9a99`
Date: `2026-04-27`
Base: `main` (commit `e434d5c`)

## Summary

| # | Surface | Risk before | Resolution |
|---|---|---|---|
| 1 | MRI Analyzer · per-target action | UI-only "Sent target to Neuronav (stub)" toast that did nothing. Visible after every analysis. | Replaced with a real `Blob` JSON download of the target so a clinician can manually import into a Neuronav workstation. |
| 2 | MRI Analyzer · bottom strip | UI-only "Sharing coming soon" button. Highly visible at the end of every report. | Hidden — no real backend integration. |
| 3 | MRI Analyzer · bottom strip | UI-only "Neuronav integration coming soon" button. Highly visible at the end of every report. | Hidden — no real integration. |
| 4 | Virtual Care · in-call controls | Mute / Camera / Record buttons rendered outside the Jitsi iframe. Cross-origin → could never reach the iframe's media tracks. They emitted a `"<ctrl> toggled."` toast and did nothing. | Removed. Real controls live inside the embedded Jitsi room. The Note button still works (opens the capture modal). |
| 5 | Documents Hub · Download | "PDF generation coming soon" toast even when an authoritative API record existed (the page already calls `api.listDocuments()` to hydrate). | Now downloads via `api.documentDownloadUrl(_apiId)` when the row was hydrated from the API. Explicit "no file attached — use Replace" toast otherwise. |
| 6 | Documents Hub · Open | Same fallback. | Same fix — uses the authenticated download URL. |
| 7 | Documents Hub · Fill (Consent) | "In-platform form filling not yet wired" toast for Consent docs. | Now navigates into the consent capture surface (`consent-management`). |

## Files changed

```
apps/web/package.json                          |  2 +-
apps/web/src/beta-readiness-regressions.test.js | 71 ++++++++++++++++++++++++++ (new)
apps/web/src/pages-clinical-tools.js           | 49 +++++++++++++++--
apps/web/src/pages-mri-analysis.js             | 33 ++++++++----
apps/web/src/pages-mri-analysis.test.js        | 21 ++++++++
apps/web/src/pages-virtualcare.js              | 13 ++---
docs/beta-readiness/app_route_inventory.md          | (new)
docs/beta-readiness/beta_gate_matrix.md             | (new)
docs/beta-readiness/critical_user_journeys.md       | (new)
docs/beta-readiness/fake_or_incomplete_features.md  | (new)
docs/beta-readiness/fixes_applied.md                | (new, this file)
docs/beta-readiness/interactive_elements_inventory.md | (new)
docs/beta-readiness/launch_readiness.md             | (new)
docs/beta-readiness/test_results.md                 | (new)
docs/beta-readiness/tests_added.md                  | (new)
```

## Commits

```
faadaaa fix(beta): remove pretend buttons in MRI/virtual-care; wire doc download
<next>  test(beta): add regression tests for pretend-button removal
```

## Verification

- `npm run build:web` (Vite production build) → passes; bundle sizes
  unchanged within rounding.
- `npm run test:unit --workspace @deepsynaps/web` →  **105/105 pass**
  (was 99 before; six new regression tests added).
- Per-file syntax check on every touched file →  pass.

## Trade-offs / things to know

1. **Hidden vs. disabled.** I chose to hide the MRI Share + Neuronav
   bottom-strip buttons rather than render them disabled. Disabled but
   visible would still have advertised features the product cannot
   deliver during beta. If product wants a "coming soon" badge in the
   roadmap, do that separately on the marketing site.
2. **Per-target "Send to Neuronav" remains visible** because the JSON
   export is a real artifact a Neuronav operator can use. If your beta
   clinics don't run Neuronav, consider hiding this card too.
3. **Virtual Care Note button still uses the existing capture modal**;
   the in-iframe Jitsi controls are the source of truth for mute /
   camera / record. Live transcription requires Chrome / Edge.
4. **Documents Hub:** download/open now requires that the document was
   hydrated from `/api/v1/documents`. If the row is a localStorage seed
   only, it falls back to a clear "no file attached — use Replace"
   toast. This is the honest state.
5. **Clinic Analytics page (`pgClinicAnalytics`)** is intentionally still
   visible because it renders a sticky `Preview data — seeded demo
   values` banner. If product prefers, hide the route entirely.

## Items deferred (not done in this pass)

These remain unfixed because they are larger-scope and were already
flagged in `MORNING_REPORT.md` / `LAUNCH_READINESS_REPORT.md`. They are
not visible pretend buttons, so they don't block beta readiness as
defined by the brief.

- Consent signature pad stroke validation (clinical PM sign-off required).
- SOAP note autosave is localStorage-only; needs server endpoint.
- DeepTwin sim 30s timeout is client-only; server job not cancelled.
- Clinic analytics aggregations are seeded demo (banner labels it).
- Mobile responsive audit (4h+ scope, not pretend-button territory).
- Patient JSON import XSS belt-and-braces DOMPurify pass.
