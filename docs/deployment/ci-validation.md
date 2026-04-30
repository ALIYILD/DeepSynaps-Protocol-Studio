# CI Validation Commands

How to reproduce CI locally and what each job does.

## Prerequisites

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ./packages/core-schema \
            -e ./packages/condition-registry \
            -e ./packages/modality-registry \
            -e ./packages/device-registry \
            -e ./packages/safety-engine \
            -e ./packages/generation-engine \
            -e ./packages/render-engine \
            -e ./packages/evidence \
            -e ./packages/qa \
            -e ./apps/api \
            -e ./apps/worker
pip install pytest pytest-xdist httpx
npm ci
```

## Test Suites

### Backend API tests

```bash
cd apps/api && python -m pytest -q -o "addopts="
```

- **1,770+ tests**, ~90 seconds
- Runs from `apps/api/` to set correct `sys.path` (the `app` package must
  resolve to `apps/api/app/`, not the worker)
- Uses SQLite in-memory for test isolation
- CI job: `backend-test` in `.github/workflows/ci.yml`

### Worker tests

```bash
cd apps/worker && python -m pytest -q
```

- **10 tests**, <1 second
- **Must run in a separate process from API tests** -- both apps use an `app`
  Python package, and combined runs cause namespace collision
- CI job: `worker-test` in `.github/workflows/ci.yml`

### QA package tests

```bash
cd packages/qa && python -m pytest tests/ -q
```

- **54 tests**, ~2 seconds
- Tests the QA engine, specs, verdicts, and demotion logic

### qEEG pipeline tests

```bash
cd packages/qeeg-pipeline && python -m pytest tests/ -q -o "addopts="
```

- **121 passed, 2 skipped**, ~20 seconds
- Skipped tests require `nibabel` (optional `source` extra: `pip install -e '.[source]'`)
- Heavy MNE/signal processing; first run may be slow

### Run all Python test suites

```bash
make test-all
```

Runs API, worker, and package tests sequentially in separate processes.

## Frontend

### Build

```bash
npm run build:web
```

### Unit tests

```bash
npm run test:unit --workspace @deepsynaps/web
```

### Playwright E2E

```bash
cd apps/web && npx playwright install --with-deps chromium
npm run test:e2e --workspace @deepsynaps/web
```

Requires the API backend running on port 8001:

```bash
cd apps/api && DEEPSYNAPS_APP_ENV=test uvicorn app.main:app --host 127.0.0.1 --port 8001
```

## Migrations

```bash
cd apps/api && python -m alembic upgrade head
```

- Single head: `061_composite_indexes`
- No forks or merge conflicts

## Production Readiness Validator

### Development mode (expect WARN, exit 0)

```bash
python scripts/validate_production_readiness.py
python scripts/validate_production_readiness.py --json   # machine-readable
```

### Production mode (expect FAIL if secrets missing, exit 1)

```bash
python scripts/validate_production_readiness.py --env production
python scripts/validate_production_readiness.py --env production --json
```

### In CI (gate deployment)

```yaml
- name: Validate production readiness
  run: python scripts/validate_production_readiness.py --env production --json
```

Exit code 1 means at least one FAIL-level check failed. The script never
prints secret values.

## Optional Dependency Groups

| Package | Extra | What it enables |
|---|---|---|
| `deepsynaps-qeeg` | `source` | eLORETA source localization (needs `nibabel`) |
| `deepsynaps-qeeg` | `reporting` | PDF report generation (needs `weasyprint`) |
| `deepsynaps-qeeg` | `rag` | PostgreSQL-backed literature RAG |
| `deepsynaps-qeeg` | `edf` | Extra EDF readers (`pyedflib`, `edfio`) |

## Known Test Isolation Rules

1. **API and worker tests cannot share a pytest process.** Both use `app` as
   their package name. Run them via `make test-all` or separate `cd` commands.
2. **qEEG pipeline tests skip source localization** when `nibabel` is not installed.
3. **Package tests must run from their own directory** (`cd packages/qa`) to avoid
   `ModuleNotFoundError` from conftest path resolution.

## CI Jobs Summary

| Job | File | What it does |
|---|---|---|
| `build` | `ci.yml` | `npm ci`, unit tests, `npm run build:web` |
| `e2e` | `ci.yml` | Playwright browser tests with live API |
| `backend-test` | `ci.yml` | Full API test suite from `apps/api/` |
| `backend-smoke` | `ci.yml` | Fast subset of API tests |
| `worker-test` | `ci.yml` | Worker tests from `apps/worker/` |
| `api-image-smoke` | `ci.yml` | Docker build + import smoke test |
