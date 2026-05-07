## INVESTIGATION REPORT

- Symptom: Production on `https://deepsynaps-studio-preview.netlify.app` did not expose the expected Biomarkers work even though it was present locally.
- Root cause: The live Netlify deploy was serving an `index.html` that referenced a missing hashed JavaScript asset (`/assets/main-5gD48TFf.js`). Requests to that missing asset fell through to the SPA fallback and returned HTML instead of JavaScript, so the app shell loaded but the updated UI never hydrated.
- Fix: Rebuilt `apps/web` from `main` at commit `d0300df0` and redeployed production explicitly to site `13baea11-07e8-4ab3-9c25-af1f045c845b` with `npx netlify deploy --prod --site ... --filter @deepsynaps/web --dir apps/web/dist`.
- Evidence:
  - Before fix: `/assets/main-5gD48TFf.js` returned `200 text/html`.
  - After fix: `/` references `/assets/main-DuObnxas.js`.
  - After fix: `/assets/main-DuObnxas.js` returns `200 application/javascript`.
  - After fix: live `app-EL3K5ShT.js` contains `biomarkers-ref`, `biomarkers.html`, `pages-biomarkers`, and `pages-knowledge`.
  - After fix: `/biomarkers.html` is live and contains the interactive Biomarkers workspace content.
- Regression test: No source-code change. Verification was production artifact validation plus Netlify deploy `69fad56dde9e89ba4eb8fc4b`.
- Audit impact: None. No backend or audit schema changes.
- Related: This was deployment artifact drift, not a missing feature regression in source.
- Status: DONE_WITH_CONCERNS

Concerns:
- The repo was not locally linked to the Netlify site, so deployment needed explicit `--site` and `--filter`.
- The current SPA fallback still returns `index.html` for missing asset paths, which can mask broken deploys during debugging.
