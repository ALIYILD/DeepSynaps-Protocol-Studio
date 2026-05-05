# Protocol Studio — Deploy / Preview / Smoke Report (Agent 11)

## Scope
Inspect preview deploy scripts, Netlify config, Vite routing topology, demo-mode behavior, and propose a Playwright smoke that keeps the preview honest (no fake “live literature”, no fake approvals).

## What ships to Netlify preview
- **Preview deploy script**: `scripts/deploy-preview.sh`
  - Builds web from `apps/web` with:
    - `VITE_ENABLE_DEMO=1`
    - `VITE_API_BASE_URL="https://deepsynaps-studio.fly.dev"`
  - Deploys `apps/web/dist` to Netlify site ID `13baea11-07e8-4ab3-9c25-af1f045c845b`.

## Netlify behavior affecting `?page=protocol-studio`
- **Config**: `netlify.toml`
  - Publishes `apps/web/dist`.
  - Sets `VITE_ENABLE_DEMO=1` and `VITE_API_BASE_URL="https://deepsynaps-studio.fly.dev"`.
  - Redirects:
    - `/api/*` → `https://deepsynaps-studio.fly.dev/api/:splat`
    - `/*` → `/index.html` (SPA fallback)

### Important subtlety: `/api/*` vs `/api/v1/*`
Some web code uses relative calls like `fetch('/api/v1/registry/conditions')`. This **does not match** Netlify’s `/api/*` proxy rule, and may return 404 or SPA HTML instead of JSON.

**Recommendation (minimal & safe)**:
- Either add a Netlify redirect for `from="/api/v1/*"` (proxy to Fly), or standardize relative calls to the `/api/*` prefix, or always use `${VITE_API_BASE_URL}`.

## Vite routing topology (multi-entry)
- **Vite config**: `apps/web/vite.config.ts`
  - Two HTML entries: `index.html` and `studio.html`
- **Boot selector**: `apps/web/src/main.js`
  - Uses pathname detection for `/studio/analyzer/<id>` to mount `./studio/bootstrap.tsx`
  - Otherwise loads `./app.js` which is the query-param router.

**Implication**: `/?page=protocol-studio` is a query-param route on `/` and should boot via `app.js`.

## Demo-mode behavior (reviewer experience)
- Demo mode is enabled when `VITE_ENABLE_DEMO=1` and a demo token ending `-demo-token` is active.
- The web API client short-circuits many calls in demo sessions to avoid noisy 401/404 console spam.

**Honesty constraints**:
- Demo should be clearly labeled and must not claim “approved” unless returned by real backend governance state.
- If generation/drafts endpoints are missing, show unavailable/error state; do not invent server persistence.
- Avoid representing ingest as “live literature” unless backed by real evidence services; show “indexed corpus unavailable” when `evidence.db` isn’t present.

## Route verification checklist (manual)
Against Netlify preview:
- Open `/?page=protocol-studio` in incognito.
- Perform demo clinician login (UI button or `window.demoLogin(...)`) so demo fetch shim activates.
- Confirm:
  - Protocol Studio shell loads (tabs render).
  - Safety banner / clinician decision-support wording is visible.
  - Browse/Conditions render even when backend endpoints are absent.
  - Drafts/Generate show honest failures if endpoints unavailable (no crash).

## Recommended Playwright smoke (proposal)
Goal: detect regressions where Protocol Studio does not render or throws JS errors, without requiring a real backend.

Suggested spec file (proposal): `apps/web/e2e/protocol-studio.smoke.spec.ts`
- Mock `/api/v1/auth/me` to a clinician.
- Mock protocol studio endpoints (`/api/v1/protocols/saved`, `/api/v1/library/overview`, `/api/v1/protocols/generate-*`) to return minimal safe shapes.
- Assert:
  - `Protocol Studio` text exists.
  - Tabs exist.
  - Safety / decision-support wording exists.
  - Page text does **not** include “FDA approved”, “guaranteed outcome”, or similar strong claims.
  - No `pageerror` events.

If adding a second test that runs against preview, ensure it uses demo login and asserts only stable UI invariants (not evidence counts).

