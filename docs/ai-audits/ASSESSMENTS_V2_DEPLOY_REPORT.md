# Assessments v2 — Deploy / Preview / Routing Report

## Preview URL expectation

- **Primary URL**: `https://deepsynaps-studio-preview.netlify.app/?page=assessments-v2`
- **Goal**: Page renders a meaningful clinician Assessments v2 shell (Queue/Library/Condition Map tabs, safety banner), even if the backend is unavailable.

## Netlify preview configuration

- **Netlify build env** is explicitly demo-enabled:
  - `VITE_ENABLE_DEMO=1`
  - `VITE_API_BASE_URL=https://deepsynaps-studio.fly.dev`
- **API proxy redirect**: Netlify routes `/api/*` to Fly so browser calls can be same-origin in preview.
- Source: `netlify.toml`.

## What was fixed for preview deep-links

- **Auto demo-login on deep-link**: when the app is opened with a deep link to a private route (like `?page=assessments-v2`) and **no token** is present, the app now auto-enters clinician demo **when demo mode is enabled** (`VITE_ENABLE_DEMO=1` or dev).
  - This removes the “public shell + login overlay + looks stuck/offline” failure mode for reviewers.
  - Source: `apps/web/src/app.js` (`init()` unauth deep-link branch).

## Playwright remote preview guidance

- The repo already contains remote preview smoke tests under `apps/web/e2e/` that can run against Netlify using:
  - `PLAYWRIGHT_BASE_URL=https://deepsynaps-studio-preview.netlify.app`
- A new Assessments v2 smoke spec was added that runs fully offline by mocking `/api/v1/**` responses, asserting that the page renders and key selectors exist.

## Env vars (web)

- **`VITE_ENABLE_DEMO`**:
  - `1` = allow demo tokens + demo-only fallbacks in certain hubs.
  - Used by Assessments v2 sample queue gating in `apps/web/src/assessments-hub-mapping.js`.
- **`VITE_API_BASE_URL`**:
  - Base for API requests (Fly in preview).

## Known limitations (honesty)

- This report covers **preview route stability** and demo rendering.
- It does **not** claim that live evidence keys, scoring licenses, or proprietary instruments are fillable/scorable unless the repo already supports them via licensed templates.

