**INVESTIGATION REPORT**
- **Symptom:** Deeptwin navigation was inconsistent after the rename from Brain Twin, with some user journeys still emitting the legacy `brain-twin` route id while the product now treats `deeptwin` as the renamed surface.
- **Root cause:** The April 25, 2026 rename commit updated labels but did not canonicalize route ownership. Route selection remained split between `brain-twin` and `deeptwin`, so patient-profile navigation and deep-link handling could keep users on the legacy route id instead of the renamed canonical route.
- **Fix:** Added a route normalizer in `apps/web/src/route-id.js`, used it in `apps/web/src/app.js` navigation and deep-link boot handling, and updated the patient-profile Deeptwin tab in `apps/web/src/pages-clinical.js` to navigate to `deeptwin`.
- **Evidence:** `git log --oneline -20 -- apps/web/src/app.js apps/web/src/pages-clinical.js apps/web/src/pages-deeptwin.js apps/web/src/pages-brain-twin.js apps/web/src/api.js` showed `7094ef0 chore: rename Brain Twin page to Deeptwin`; that diff changed labels only. Current source still had `window._nav('brain-twin')` in the patient-profile tab while `app.js` also exposed `deeptwin`.
- **Regression test:** Added `apps/web/src/route-id.test.js` covering legacy alias normalization.
- **Audit impact:** None. No API routes, audit event schemas, or hash chain behavior changed.
- **Related:** Backend API aliases for `/api/v1/deeptwin/*` and `/api/v1/brain-twin/*` were already intact; the defect was isolated to frontend route canonicalization.
- **Status:** DONE
