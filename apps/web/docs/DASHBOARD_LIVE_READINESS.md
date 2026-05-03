# Clinical Dashboard — live readiness

Scope: clinician **home dashboard** served at `?page=home` (and aliases `?page=today`, `?page=dashboard`).

## Route mapping

| URL | `renderPage` case | Module | Function |
|-----|-------------------|--------|----------|
| `?page=home` | `home` | `pages-clinical.js` | `pgDash` |
| `?page=today` | `today` | same | `pgDash` |
| `?page=dashboard` | `dashboard` | same | `pgDash` |

Entry: `apps/web/src/app.js` → `loadClinical()` → `m.pgDash(setTopbar, navigate)`.

## Required environment variables (Vite)

| Variable | Role |
|----------|------|
| `VITE_API_BASE_URL` | Base URL for the FastAPI backend (e.g. Fly app). Must not point at `localhost` in production builds. |
| `VITE_ENABLE_DEMO` | Set to `1` only for **demo/preview** builds. **Must be unset or not `1` for production clinic deployments.** |

## Preview / demo mode vs production mode

| Aspect | Preview / demo (`VITE_ENABLE_DEMO=1`) | Production clinic |
|--------|----------------------------------------|-------------------|
| Purpose | Reviewers, training, marketing preview | Real clinical workflow |
| Empty clinic | May show **synthetic** `P-DEMO-*` sample patients (clearly bannered) | **Honest empty state** — no demo seed unless demo flag is on |
| API unreachable | `app.js` **suppresses** the fixed “backend unreachable” toast in demo builds | Backend health banner **can** appear when `api.health()` fails |
| Labelling | **“Demo data / not real patient data”** and `P-DEMO-*` called out in UI | Real API-backed rows only when authenticated |

## Warnings (read before merge or deploy)

1. **`VITE_ENABLE_DEMO=1` suppresses** the global backend-unreachable banner in `checkBackendHealth()` — expected for Netlify preview so reviewers are not alarmed when Fly is down, but **not** appropriate when the app is presented as a live EMR.
2. **Demo seeding** uses prefix **`P-DEMO-*`** for patient IDs. These are **not** real PHI. When `VITE_ENABLE_DEMO=1`, the dashboard shows explicit **“Demo data — not real patient data”** copy and references `P-DEMO-*` in the banner.
3. **Production requirement:** `VITE_ENABLE_DEMO` must be **false / off / unset** (anything other than `1`) for production clinic builds, unless you are intentionally shipping a **demo-only** distribution.

## Related code

- Dashboard logic: `apps/web/src/pages-clinical.js` — `pgDash`
- Demo seeding policy: `shouldSeedDashboardDemo` in `apps/web/src/clinical-dashboard-helpers.js`
- API overview: `GET /api/v1/dashboard/overview` (see `apps/api/tests/test_dashboard_router.py`)

## Smoke / regression tests

- Unit + source checks: `node --test src/clinical-dashboard-helpers.test.js src/clinical-dashboard-smoke.test.js`
- Full web unit suite: `npm run test:unit` (from `apps/web/`)

See also: `docs/TYPECHECK_BASELINE.md` for current `npm run typecheck` limitations unrelated to the dashboard.
