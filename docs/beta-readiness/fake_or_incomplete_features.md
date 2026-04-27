# Fake or Incomplete Features — Audit Findings

DeepSynaps Studio — beta-readiness audit, 2026-04-27.

This is the result of a code-level sweep for behaviour that *looks* live in
the UI but isn't, plus places where the UI is honest about being demo data.
Every finding here was reviewed against the rule:

> If a function looks live, it must work. If it does not work, it must not
> look live.

Findings are classified as in `interactive_elements_inventory.md`.

## Resolved in this branch (cursor/beta-readiness-functional-completion-9a99)

| ID | Surface | Old behaviour | Resolution |
|---|---|---|---|
| FAKE-1 | MRI Analyzer · per-target action | `Send to Neuronav` showed a `"Sent target to Neuronav (stub)"` toast and did nothing. | Replaced with a real JSON download of the target so a clinician can manually import into a Neuronav workstation. |
| FAKE-2 | MRI Analyzer · bottom strip | `Share with referring provider` button showed `"Sharing coming soon"` toast. | Hidden — no real backend integration yet. |
| FAKE-3 | MRI Analyzer · bottom strip | `Open in Neuronav` button showed `"Neuronav integration coming soon"` toast. | Hidden — no real integration yet. |
| FAKE-4 | Virtual Care · in-call controls | Mute, Camera, Record buttons rendered outside the Jitsi iframe and only emitted `"<ctrl> toggled."` toasts. They could never reach the iframe's media tracks (cross-origin). | Removed. Real controls live inside the Jitsi room. The Note button still works (opens the capture modal). |
| FAKE-5 | Documents Hub · Download | Showed `"PDF generation coming soon"` toast even when an authoritative API record existed. | Now downloads via `api.documentDownloadUrl(_apiId)` when the row was hydrated from the API; explicit "no file attached — use Replace" toast otherwise. |
| FAKE-6 | Documents Hub · Open | Same caveat. | Same fix — uses the authenticated download URL. |
| FAKE-7 | Documents Hub · Fill (Consent) | Showed `"In-platform form filling not yet wired"` toast. | Now navigates into the consent capture surface (`consent-management`). Other categories still surface a portal-handoff toast (true — that's where they're filled). |

## UI-only / placeholder, but honestly labeled (acceptable for beta)

| ID | Surface | Behaviour | Why acceptable |
|---|---|---|---|
| LBL-1 | Clinic Analytics page (`pgClinicAnalytics`) | Revenue trend, funnel, productivity matrix, heatmap and churn donut are seeded demo values. | Page renders a sticky amber banner: *"Preview data. Revenue trend, … are seeded demo values. Wire-up to /api/v1/finance/monthly, /api/v1/sessions, and /api/v1/leads is tracked separately."* — meets the beta rule. |
| LBL-2 | Scheduling Hub | Demo events when `/api/v1/sessions` errors. | Sticky `DEMO DATA` banner with "Try real backend" button. |
| LBL-3 | qEEG Analysis · Brain Connectivity Summary | Static `"Coming Soon"` chips for dwPLI, PLV, PDC, DTF. | Pure informational chips, no interactive button. Clearly distinct from working metrics. |
| LBL-4 | Brain map planner | Tip line: *"Finite-element modeling (ROAST / SimNIBS) · coming soon. Current overlay on the Clinical tab is a qualitative heatmap derived from electrode geometry only."* | The current heatmap is real and labeled correctly; the upcoming FEM overlay is described as not-yet-shipped. |
| LBL-5 | Consent automation rule toggle | Toggle works in the UI; toast says *"Rule state updated (client-side only — backend patch not yet wired)."* | Honestly labeled. Backend GET exists; PATCH does not. |
| LBL-6 | Patient Marketplace | When a catalog row has no `external_url`, click shows `"<name> · link coming soon"`. | Catalog data is the gap, not the feature. The buy button is otherwise real and opens Amazon/etc. |
| LBL-7 | Documents Hub · regenerate | Toast `"Regenerated"` is local-only — does not call any backend regenerate endpoint. Per current product scope, regenerate is just a clarity-stamp action. | Honest enough but should be revisited if a real pipeline lands. |
| LBL-8 | Reports / Audit / Analytics fallback toasts | Many surfaces fall back to localStorage cache when the API is offline and label that with a `(local)` suffix in the toast. | Acceptable — clinician sees the fallback is non-authoritative. |

## Hidden / not-yet-rendered features that are wired in code

| ID | Surface | Notes |
|---|---|---|
| HID-1 | Public CME / academy course listing form | `_acEduListNew` exists, surfaced behind a small footer link; not in primary nav. Acceptable. |
| HID-2 | Multi-site dashboard | Admin route only. |
| HID-3 | Permissions matrix admin page | Admin route only. |

## Items previously labelled as residual risks (still tracked)

These are tracked in prior `MORNING_REPORT.md` and `LAUNCH_READINESS_REPORT.md`:

- Patient surfaces still contain demo / sample fallback in some sub-modules
  (messages, virtual care, assessments, care-team) — protected by clear
  empty / loading / fallback states.
- `get_authenticated_actor()` still defaults missing auth to `guest`. Safe
  given explicit gating on every sensitive route.
- README / docs claims may be broader than backend test coverage; not a UI
  concern.
- localStorage-only autosave on SOAP notes (`ISSUE-AUDIT-022`) is still a
  data-loss-on-cache-clear risk; deferred for a server-side autosave
  endpoint.

## How the audit was performed

```
rg -n 'coming soon|coming Soon|Coming Soon|TODO|FIXME|stub|placeholder|fake|mock|not yet implemented|not implemented' apps/web/src
rg -n 'showToast.*coming|showNotifToast.*coming|alert.*coming|toast.*not yet'
rg -n 'window\._showNotifToast.*severity:\s*[\\'\\\"]info[\\'\\\"]' apps/web/src
rg -n 'onclick=' apps/web/src | wc -l   # ~1.5k handlers
```

Plus targeted reads of every page's primary action and form submit handler.
The detailed working/partial/pretend classification per page is in
`interactive_elements_inventory.md`.
