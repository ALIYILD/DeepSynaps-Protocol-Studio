# Doctor-ready Frontend / Playwright Report (Agent 6)

Branch: `doctor-ready/e2e-validation-and-hardening`  
Date: 2026-05-05  
Scope: Frontend lint/build/unit + Playwright triage for doctor-demo flows.

## Commands run

From `apps/web`:

```bash
npm run lint
npm run test:unit
npm run build
npx playwright test --reporter=line
```

## Results (Pass/Fail)

- **`npm run lint`**: **PASS**
- **`npm run test:unit`**: **PASS** (`1029` tests)
- **`npm run build`**: **FAIL (environment / Node version)**
  - VM Node: `v18.19.1`
  - Vite requires Node `20.19+` or `22.12+` (repo CI uses Node 20).
  - Error excerpt: `TypeError: crypto.hash is not a function`
- **`npx playwright test`**: **FAIL (environment / dev server cannot start)**
  - Root cause: Playwright attempts to start the Vite dev server; Vite fails under Node 18 for the same reason as `npm run build`.

## Doctor-demo flow validation

### What is validated in this VM

Because Vite cannot run under Node 18, full E2E flows cannot be executed here. However:

- **Unit coverage for doctor-demo surfaces** is present and passed (examples include):
  - qEEG Analyzer launcher + audit
  - qEEG Raw Workbench + ERP tab
  - MRI Analyzer pages unit tests
  - many clinical portal launch-audit tests

### What must be validated in CI / Node 20+

- `npm run build` (Vite)
- Playwright E2E suite (requires local backend on `127.0.0.1:8000` per `.github/workflows/ci.yml`)

## Playwright failure table

| Failure | Classification | Notes |
|---|---|---|
| Vite dev server fails (`crypto.hash is not a function`) | **Node/version issue** | Requires Node 20+; CI already uses Node 20. |

## Fixes made

- **None** in this step (failures are environment-only).

## Remaining environment requirements

- **Node 20.19+ (or 22.12+)** for `vite build` and Playwright webServer startup.
- For Playwright: backend must be running on `127.0.0.1:8000` (CI starts uvicorn automatically).

## Verdict (frontend)

- **Doctor-ready (frontend)**: **Conditional on CI Node 20 build + Playwright passing**.
- **Local VM status**: lint + unit tests are green; build/e2e cannot be executed due to Node 18 runtime.

