# Typecheck baseline (known failures)

`npm run typecheck` in `apps/web` currently **fails** for **pre-existing** reasons unrelated to the Clinical Dashboard hardening (PR #472 area).

Dashboard-specific checks use **`node --test`** on small JS modules and **source-level smoke tests** instead.

## Representative `tsc` errors (sample)

1. `Cannot find module 'vitest'` — React component tests reference Vitest without it being a project dependency.
2. `Cannot find module '@testing-library/react'` — same test files.
3. `Could not find a declaration file for module 'react'` — missing `@types/react` in the typecheck path.
4. `Cannot find module '@niivue/niivue'` — optional brain viewer dependency without types in the check environment.
5. Widespread `JSX element implicitly has type 'any'` in TSX under `src/components/QeegBrain3D/` and `QeegLive/`.

## What we verify for the dashboard PR instead

- `node --test src/clinical-dashboard-helpers.test.js` — **pass** (policy + name resolution).
- `node --test src/clinical-dashboard-smoke.test.js` — **pass** (pgDash safety strings and demo policy).
- `npm run build` — **pass** (Vite bundle; use Node 20.19+ or 22.12+ per Vite 7).

Do **not** block the dashboard PR on clearing the global typecheck debt unless the team explicitly scopes that work.
