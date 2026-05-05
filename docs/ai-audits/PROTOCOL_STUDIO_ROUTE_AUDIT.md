# Protocol Studio Route Audit

## TL;DR
- The web app uses a custom router where the canonical deep-link format is **`?page=<route>`** (history API). Hash routing is supported as a fallback.
- `protocol-studio` is a valid route and maps to `pgProtocolHub`.
- If `/?page=protocol-studio` appears “broken” in the Netlify preview, the most likely cause is **authentication/role gating** (private route + patient-role guard), not missing routing code.

## Where routing happens
- **Router / deep-link parsing**: `apps/web/src/app.js`
  - Boot-time deep-link logic prefers `?page=` query param, then falls back to `location.hash`.
  - In-app navigation pushes `?page=<id>` via `history.pushState`.

## Protocol Studio route implementation
- **Route IDs**:
  - `protocol-studio` → `pgProtocolHub`
  - `protocol-hub` → `pgProtocolHub` (alias-like route)
- **Hub implementation**:
  - `apps/web/src/pages-clinical-hubs.js` exports `pgProtocolHub(setTopbar, navigate)`.

## Why Netlify preview `/?page=protocol-studio` may look broken
1) **Private route + unauth behavior**
- `protocol-studio` is not a public route; unauth visitors will not directly render the clinician hub.
- If you expect reviewers to open Protocol Studio without signing in, that is a product decision (see “Minimal fix options”).

2) **Patient-role gate**
- If `currentUser.role === 'patient'`, `pgProtocolHub` returns early and renders a clinician-only message instead of the full hub.

## Query param vs hash vs SPA router framework
- This repo does **not** use React Router/Vue Router.
- Canonical routing is **query-param** (`?page=`). Hash routing is a fallback.

## Nav ID mismatches
- The nav ID used is consistently `protocol-studio`.
- `protocol-hub` is an alias route and should not cause runtime mismatches, but can confuse docs/links.

## Minimal fix options (only if the “broken” behavior is undesired)
Decide intended reviewer experience for the Netlify preview:
- If Protocol Studio should be viewable without signing in:
  - Add `protocol-studio` (and/or `protocol-hub`) to the public-route allowlist **or**
  - Provide a demo-session bootstrap specifically when `VITE_ENABLE_DEMO=1` and `?page=protocol-studio` is requested (preferred over making clinician tools truly public).
- If Protocol Studio should remain private:
  - Update reviewer guidance to “sign in as clinician/admin/technician (or use demo login)”.

## Stable selectors (recommended `data-testid` contract)
Add minimal `data-testid` attributes to `pgProtocolHub` (no functional behavior change):
- `protocol-studio-root`
- `protocol-mode-selector`
- `protocol-evidence-search`
- `protocol-results-list`
- `protocol-generate-action`
- `protocol-draft-output`
- `protocol-evidence-links`
- `protocol-safety-banner`
- `protocol-patient-context`
- `protocol-approve-action`
- `protocol-off-label-warning`

(Frontend audit recommends additional PS-prefixed internal testids for tabs and generator fields; see `PROTOCOL_STUDIO_UX_REPORT.md` once created.)

## Repro steps
- **Unauth**: open `/?page=protocol-studio` in a fresh/incognito session → expect public/login surfaces, not the hub.
- **Patient role**: log in as patient → open `/?page=protocol-studio` → expect clinician-only gate message.
- **Clinician role**: log in as clinician/admin/technician → open `/?page=protocol-studio` → hub should render.

