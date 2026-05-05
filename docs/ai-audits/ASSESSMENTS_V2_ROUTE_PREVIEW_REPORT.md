## Assessments v2 Route / Preview Report

### Current route key and how deep-linking works
- **Route id**: `assessments-v2`
- **Deep-link support**: `/?page=<routeId>` and `/#/<routeId>` (hash fallback) are parsed in `apps/web/src/app.js` (`bootApp()` + `init()`).

### Why preview looked like “offline/loading”
- If **no auth token** exists, `init()` routes to public home and opens the login overlay for deep-linked private routes. In preview this can look like the Assessments page “doesn’t render”.
- Assessments v2 itself has a **demo/sample queue fallback**, but you must actually be in an authenticated clinician shell for it to mount.

### Changes made to make preview reliable
#### Auto-enter demo clinician for demo-enabled preview builds
- In `apps/web/src/app.js`, when **no token** and a **private** `?page=` deep link is present, and `VITE_ENABLE_DEMO=1` (Netlify preview) / `DEV` is true, the app now **auto-enters clinician demo** via `window.demoLogin('clinician-demo-token')` instead of stopping at the login overlay.
- This makes `https://deepsynaps-studio-preview.netlify.app/?page=assessments-v2` render the Assessments v2 shell for reviewers without manual steps.

#### Stable selectors / testids added (doctor-ready UI anchors)
In `apps/web/src/pages-clinical-hubs.js` (`pgAssessmentsHub`):
- **Root**: `id="assessments-v2-root"` and `data-testid="assessments-v2-root"`
- **Library**: `id="assessments-library"` and `data-testid="assessments-library"`
- **Queue**: `id="assessments-queue"` and `data-testid="assessments-queue"`
- **Condition map (cohort tab)**: `id="assessments-condition-map"` and `data-testid="assessments-condition-map"`
- **Evidence/side panel container**: `data-testid="assessments-evidence-panel"`
- **Demo banner**: `id="assessments-demo-banner"` and `data-testid="assessments-demo-banner"`
- **Safety banner**: `id="assessments-safety-banner"` and `data-testid="assessments-safety-banner"`
- **Tabs**:
  - `data-testid="assessments-library-tab"`
  - `data-testid="assessments-queue-tab"`
  - `data-testid="assessments-condition-map-tab"`
  - `data-testid="assessments-fill-score-tab"`

### Playwright smoke test added
- New spec: `apps/web/e2e/smoke-assessments-v2.spec.ts`
- Assertions:
  - Page loads `/?page=assessments-v2`
  - Safety banner is visible
  - Queue + Library + Condition Map tabs are visible
  - Queue panel renders (even if empty)
  - Switching to Library and Condition Map mounts stable containers
  - No page-level JS errors

### Notes / constraints
- This work **does not** claim new clinical capabilities; it fixes **rendering/preview usability** and adds test anchors.
- Demo mode is explicitly flagged via the existing demo banner strings from `apps/web/src/assessments-hub-mapping.js`.
