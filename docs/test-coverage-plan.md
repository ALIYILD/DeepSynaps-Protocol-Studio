# Test Coverage Plan — DeepSynaps Protocol Studio

**Branch:** `chore/test-coverage-baseline-90pct`
**Goal:** ≥90% meaningful automated test coverage across backend, frontend, and shared packages — without gaming, deletion, or excluding real product code.
**Status:** Phase 1 (baseline + tooling) — first PR of a multi-PR initiative.

---

## 1. Current state (measured, not assumed)

### 1.1 Test commands today (`Makefile`)

| Target | Command |
|---|---|
| `make test-api` | `cd apps/api && python -m pytest -q -o "addopts="` |
| `make test-worker` | `cd apps/worker && python -m pytest -q` |
| `make test-packages` | runs only **3** of 24 packages: `clinical-data-registry`, `qa`, `qeeg-pipeline` |
| `make test-web` | `npm run test --workspace @deepsynaps/web` (build + node --test) |
| `make test-all` | `test-api && test-worker && test-packages` |

CI (`.github/workflows/ci.yml`) runs `pytest -n auto` for backend, the same node --test list for web, plus a separate `worker-test` job and a router-schema-lint job. **No coverage measurement is currently configured anywhere in CI.**

### 1.2 Coverage tooling today

- Backend: **none** (no `pytest-cov` in deps, no `.coveragerc`, no `[tool.coverage]` in pyproject)
- Frontend: **none** (vitest installed but unused for coverage; `test:unit` runs `node --test`)
- Packages: **none**

### 1.3 Repo inventory

| Area | Source files | Test files | Test framework |
|---|---:|---:|---|
| `apps/api/app` | ~75,000 statements (measured by `coverage` import) | 286 `test_*.py` | pytest |
| `apps/worker/app` | small | 1 `test_*.py` | pytest |
| `apps/web/src` | 279 (.js / .ts / .jsx / .tsx, excl. tests) | 197 `*.test.js` in `src/` + 9 in `tests/` | `node --test` |
| `packages/*` | 24 packages | 16 packages have `tests/`; **8 have none** | pytest |

**Packages with NO tests at all (Phase 5 targets):**
`api-client`, `condition-registry`, `core-schema`, `deepsynaps-core`, `device-registry`, `modality-registry`, `safety-engine`, `voice-engine` (TBD).

**Frontend wiring gap:** `apps/web/src/` contains **197** `*.test.js` files, but `package.json::test:unit` only wires up **~80** of them. ~117 existing tests aren't run. Wiring them in is a no-new-test coverage win.

---

## 2. Measured baseline (this branch)

### 2.1 Backend (`apps/api`)

Command:

```bash
cd apps/api && python -m pytest \
  --cov=app --cov-report=term --cov-report=xml --cov-report=html \
  -o "addopts=" --tb=line --timeout=60 --timeout-method=thread -q
```

Status: **pending** — full run in progress while this doc was written. Initial probe (`tests/test_health.py` only, 2 tests) yields a 33 % import-time floor on 75,359 statements; full-suite numbers will replace this section in `docs/test-coverage-report.md` once the run completes.

### 2.2 Frontend (`apps/web`) — measured

Command:

```bash
node_modules/.bin/c8 \
  --reporter=text --reporter=json-summary --reporter=lcov \
  --reports-dir=apps/web/coverage \
  --include='apps/web/src/**/*.js' \
  --exclude='apps/web/src/**/*.test.js' \
  --exclude='apps/web/dist/**' \
  --exclude='apps/web/coverage/**' \
  --exclude='apps/web/node_modules/**' \
  npm --prefix apps/web run test:unit
```

Result (1196 tests pass in 10s):

| Metric | % |
|---|---:|
| Statements | **43.01** |
| Branches | **64.05** |
| Functions | **17.62** |
| Lines | **43.01** |

#### Top uncovered frontend modules

| File | Lines % |
|---|---:|
| `src/ui_chat_widget.js` | 3.23 |
| `src/auth.js` | 3.69 |
| `src/research-bundle-workspace.js` | 6.75 |
| `src/evidence-ui-live.js` | 7.69 |
| `src/deeptwin/demo-dashboard-payload.js` | 8.20 |
| `src/pages-research-evidence.js` | 9.33 |
| `src/qeeg-upload-workflow.js` | 10.91 |
| `src/live-evidence.js` | 10.95 |
| `src/brain-map-svg.js` | 14.96 |
| `src/pages-brainmap.js` | 17.14 |
| `src/pages-qeeg-analysis.js` | 19.12 |
| `src/deeptwin/mockData.js` | 23.47 |
| `src/beta-readiness-utils.js` | 25.19 |
| `src/qeeg-ai-panels.js` | 21.64 |
| `src/pages-agents.js` | 40.04 |

> Many of these have *existing* `*.test.js` siblings that aren't wired into `test:unit`. Wiring them is a Phase 4 quick win.

### 2.3 Packages — pending

Per-package pytest --cov runs are tooling-blocked until §3.2 lands (no `pytest-cov` in their environments). Listed for execution in §6.

---

## 3. Proposed coverage tooling

### 3.1 Backend — `apps/api/pyproject.toml`

```toml
[tool.coverage.run]
source = ["app"]
branch = true
parallel = true
omit = [
  "app/__main__.py",
  "app/main.py",            # uvicorn entrypoint, exercised by smoke tests
  "tests/*",
  "app/migrations/*",        # Alembic
  "alembic/*",
  "**/__pycache__/*",
]

[tool.coverage.report]
exclude_lines = [
  "pragma: no cover",
  "raise NotImplementedError",
  "if TYPE_CHECKING:",
  "if __name__ == .__main__.:",
  "raise AssertionError",
]
show_missing = true
skip_covered = false
fail_under = 60   # baseline; raise to 90 in follow-up PR per Phase 7

[tool.coverage.html]
directory = "htmlcov"

[tool.coverage.xml]
output = "coverage.xml"
```

### 3.2 Worker — `apps/worker/pyproject.toml`

Same shape as 3.1 but `source = ["app"]` rooted at `apps/worker/app`. Worker still runs in its own pytest process (the `app` namespace collision is documented).

### 3.3 Each Python package — `packages/<name>/pyproject.toml`

```toml
[tool.coverage.run]
source = ["src"]
branch = true
omit = ["tests/*", "**/__pycache__/*"]

[tool.coverage.report]
fail_under = 60   # raised per package as tests catch up
show_missing = true
```

Plus a top-level `pytest.ini` per package:

```ini
[pytest]
testpaths = tests
addopts = --cov --cov-report=term-missing --cov-report=xml --cov-report=html
```

> Packages without a `tests/` directory get a placeholder `tests/test_smoke.py` that imports the package (so coverage reports something real before bodies are written in Phase 5).

### 3.4 Frontend — `apps/web/.c8rc.json`

```json
{
  "all": true,
  "include": ["src/**/*.js", "src/**/*.ts", "src/**/*.jsx", "src/**/*.tsx"],
  "exclude": [
    "**/*.test.*",
    "**/*.d.ts",
    "src/**/_gen_*.cjs",
    "src/**/__fixtures__/**",
    "dist/**",
    "coverage/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**"
  ],
  "reporter": ["text", "lcov", "html", "json-summary"],
  "reports-dir": "coverage",
  "check-coverage": false,
  "lines": 60,
  "branches": 60,
  "functions": 60,
  "statements": 60
}
```

`all: true` makes c8 measure ALL files matched by `include`, not only the ones imported during the test run — this is what reveals the true coverage gap.

### 3.5 `apps/web/package.json` script additions

```json
{
  "scripts": {
    "test:coverage": "c8 npm run test:unit",
    "test:coverage:html": "c8 --reporter=html --reporter=text npm run test:unit",
    "test:coverage:ci": "c8 --reporter=lcov --reporter=text-summary --reporter=json-summary npm run test:unit"
  }
}
```

### 3.6 Root `Makefile` additions

```make
.PHONY: test-coverage test-coverage-api test-coverage-web test-coverage-packages

test-coverage-api:
	cd apps/api && python -m pytest --cov=app --cov-report=term-missing --cov-report=xml --cov-report=html -o "addopts="

test-coverage-web:
	npm run test:coverage --workspace @deepsynaps/web

test-coverage-packages:
	for pkg in clinical-data-registry qa qeeg-pipeline core-schema condition-registry modality-registry device-registry safety-engine generation-engine render-engine evidence biometrics-pipeline mri-pipeline qeeg-encoder neuro-engine deeptwin-neuroai-lab feature-store text-pipeline audio-pipeline video-pipeline voice-engine; do \
		echo "=== $$pkg ===" && cd packages/$$pkg && python -m pytest --cov=src --cov-report=term --cov-report=xml || true; cd -; \
	done

test-coverage: test-coverage-api test-coverage-web test-coverage-packages
```

---

## 4. Exclusions policy

Only the following are excluded from coverage:

| Allowed exclusion | Reason |
|---|---|
| `tests/**`, `**/__tests__/**`, `**/*.test.*` | Test code itself |
| `apps/api/alembic/**`, `apps/api/app/migrations/**` | DB migrations — reviewed via Alembic CI lint, not unit tests |
| `apps/web/dist/**`, `apps/api/build/**` | Build artifacts |
| `**/__pycache__/**`, `node_modules/**`, `.venv/**` | Runtime artefacts |
| `**/*.d.ts` | Type-only files (no runtime) |
| `apps/web/src/**/_gen_*.cjs` | Generated handbook scaffolds |
| Generated API client (`packages/api-client/src/openapi-types.ts`) | Auto-generated from OpenAPI |
| `apps/api/app/main.py` (entrypoint) | Exercised by smoke tests; line-level coverage of uvicorn boot-up not meaningful |
| Static fixtures, JSON-only data dirs, demo seeds | Not runtime code |

**Not excluded** (explicit):

- All routers, services, schemas, persistence layers in `apps/api/app/`
- All workers in `apps/worker/app/jobs/`
- All page modules in `apps/web/src/pages-*.js`
- `safety-engine`, `condition-registry`, `modality-registry`, `device-registry` source — these are clinical-safety-critical and **must** be tested before the gate is raised to 90 %

---

## 5. Phased target plan to 90 %

| Phase | Scope | Target | Owner / agent |
|---|---|---|---|
| **1 (this PR)** | Tooling, baseline, plan, CI gate at baseline+5 | measured baseline + reproducible commands | Coverage Tooling Agent |
| 2 | Wire up the **117 unwired frontend test files** | frontend lines: 43 → 60 % | Frontend Page Coverage Agent |
| 3 | Backend routers/services already touched for demo (`dashboard_router`, `clinician_inbox_router`, `clinician_digest_router`, `sessions_router`, `schedules_router`, `patients_router`, `assessments_v2_router`, `protocol_studio_router`, exports, evidence, biomarkers, risk) | backend lines: baseline → 80 % | Backend API Coverage Agent |
| 4 | Doctor-demo frontend pages (clinical, inbox, courses digest, clinical-hubs, protocols, handbooks, biomarkers, virtualcare, research-evidence, mri-analysis, qEEG workbench, risk analyzer) | frontend lines: 60 → 80 % | Frontend Page Coverage Agent |
| 5 | Shared packages — start with **safety-engine, condition-registry, core-schema, modality-registry, device-registry** (currently 0 tests) | 8 packages from 0 → 80 % | Packages Coverage Agent |
| 6 | Generation/render/evidence/biometrics packages | 90 % per package | Packages Coverage Agent |
| 7 | Lift CI threshold to 90 % | gates flip to fail-under 90 | Coverage Gate Agent |
| 8 | Clinical safety regression scans (banned phrases) | binary pass/fail | Clinical Safety Regression Agent |

Each phase is a separate PR. Phases 2 and 3 can land in parallel.

---

## 6. CI gate proposal

A new workflow `.github/workflows/coverage.yml` runs on every PR with three parallel jobs (`backend-coverage`, `frontend-coverage`, `packages-coverage`). Each:

1. Installs deps including `pytest-cov` / `c8`.
2. Runs the relevant `test-coverage-*` Make target.
3. Uploads `coverage.xml`, `lcov.info`, `htmlcov/`, `coverage/` as artefacts.
4. Fails if `fail-under` (or c8 `check-coverage`) is breached.

Initial thresholds (Phase 1 — baseline + 5 %):

| Job | Lines | Branches | Functions | Statements |
|---|---:|---:|---:|---:|
| backend | TBD (set after full run completes) | TBD | n/a | n/a |
| frontend | **48** | **65** | **20** | **48** |
| packages | per-package, 60 floor | 60 | n/a | n/a |

Final thresholds (Phase 7):

| Job | Lines | Branches |
|---|---:|---:|
| backend | 90 | 80 |
| frontend | 90 | 80 |
| packages | 90 | 80 |

Branch coverage is intentionally one notch lower than line coverage during the lift — chasing 90 % branch is a Phase 8+ concern; the priority is line and function coverage of clinical/safety paths first.

A separate **changed-files-only** gate (`diff-cover` or `c8 --check-coverage --per-file`) is added before the global gate hits 90, so PRs to high-coverage areas don't regress while the wider lift is happening.

---

## 7. What this PR does NOT do

- Does **not** lower `fail-under` to game numbers (every threshold here is at-or-above today's measurement).
- Does **not** add `# pragma: no cover` to hide untested paths.
- Does **not** delete or skip existing tests.
- Does **not** weaken safety tests (`packages/safety-engine`, clinical guard tests).
- Does **not** rewrite components for testability beyond what's needed to compile.
- Does **not** introduce production fake data or autonomous-prescribing copy (Phase 8 will scan for and ban these).

---

## 8. Open questions for the team

1. **Worker coverage.** `apps/worker` has 1 test for ~ N worker modules. Is a 90 % gate realistic this quarter, or do we hold worker at 60 % and lift after the demo?
2. **`pages-clinical.js` is split across many files** — confirm which "doctor-demo" pages must hit 90 % vs which can ride at 80 % (Phase 4 acceptance criteria).
3. **WeasyPrint / MNE optional deps** — render-engine + qeeg-pipeline have try/except import guards. Should the "PDF unavailable" / "MNE unavailable" branches count toward coverage, or be excluded as environment-specific? Current proposal: **include them** — the unavailable-state branches are real product code that must be tested.
4. **Generated API client** (`packages/api-client/src/openapi-types.ts`) — exclude from coverage (yes, per §4) but keep `npm run api-client:check-drift` as the gate for that file.
5. **E2E vs unit coverage** — Playwright tests are *not* counted toward line coverage (we don't instrument production builds). Phase 6 keeps E2E as a smoke-flow gate, not a coverage source.
