# Deployment Notes — 2026-04-26 Night Shift

**Branch:** `overnight/2026-04-26-night-shift`
**Author:** DevOps / Release stream
**Status:** **YELLOW** — frontend & all touched backend code build/compile clean; full pytest run still blocked by missing scientific deps in dev env (documented in `devops_env_baseline.md`); no Vercel/Fly auto-deploy executed (per instructions).

---

## 1 Build status

### Frontend (`apps/web`)

| Check | Command | Result |
|---|---|---|
| TypeScript typecheck (project files) | `npx -p typescript@5.6.3 tsc --noEmit -p tsconfig.app.json` | **172 errors — all in 2 PRE-EXISTING files**: `src/components/QeegLive/LivePanel.tsx` and `src/components/QeegLive/useLiveStream.ts` (missing `@types/react`, `JSX.IntrinsicElements`). **Zero errors in any specialist-touched file.** Baseline doc claimed pass; that was incorrect (no `typescript` package is locally installed; baseline likely used a different runner). |
| Vite production build | `cd apps/web && /Users/aliyildirim/DeepSynaps-Protocol-Studio/node_modules/.bin/vite build` | **PASS — built in 2.54s.** 39 chunks emitted to `apps/web/dist/`. Largest: `pages-patient` 809.5 KB / 206.5 KB gzip; `pages-knowledge` 751.2 KB / 191.7 KB; `pages-clinical-tools` 605.6 KB / 154.6 KB. New stream chunks visible: `pages-protocols` 86.3 KB, `pages-deeptwin` 47.3 KB, `pages-mri-analysis` 73.1 KB, `pages-qeeg-analysis` 241.8 KB, `evidence-intelligence` 13.0 KB. **No build regressions.** |
| Unit tests | `npm run test:unit` | **94 / 95 PASS.** Pre-existing failure in `src/evidence-intelligence.test.js` reproduced — `DOMException [SecurityError]: Cannot initialize local storage without a --localstorage-file path` at `evidence-intelligence.test.js:37`. Evidence stream did **NOT** fix this Node 25 webstorage incompatibility — the test still uses bare `localStorage` at module-load time. **Workaround:** run with `node --test --localstorage-file=/tmp/ls.db` or stub `globalThis.localStorage` in the test. Not a blocker for ship; pre-existing. |
| Lint | `npm run lint:web` | **N/A — script not defined.** `apps/web/package.json` has no `lint` script. `eslint.config.js` exists at repo root with `typescript-eslint` rules but no `npm run lint` wired up. No specialist-introduced lint regressions detectable. |

### Backend (`apps/api` + `packages/`)

| Check | Command | Result |
|---|---|---|
| `py_compile` — services | All 5 new/modified service files | **PASS (exit 0)** — `risk_clinical_scores.py`, `deeptwin_decision_support.py`, `deeptwin_engine.py`, `report_payload.py`, `report_citations.py` all syntactically valid. |
| `py_compile` — package modules | 4 new package files | **PASS (exit 0)** — `evidence/score_response.py`, `render_engine/payload.py`, `mri/validation.py`, `mri/safety.py` all syntactically valid. |
| `pyflakes` | `python3.11 -m pyflakes …` | **N/A — module not installed in system Python.** Used `ruff` instead (also satisfies pyflakes use case). |
| `ruff check` — touched routers + services | (8 router/service files) | **CLEAN (1 file with 4 issues): `app/services/deeptwin_engine.py` has 4× `F401` (unused-import) for `build_scenario_comparison`, `evidence_status_for`, `soften_recommendation_block`, and one more from `deeptwin_decision_support`. All `--fix` -able.** All other touched routers/services lint-clean. |
| `ruff check` — packages (qeeg, mri, render-engine, generation-engine, evidence) | recursive | **34 issues, all auto-fixable.** Top categories: 21× `F401` unused-import (most common: `mne` in `qeeg/viz/source.py`, `..FREQ_BANDS` in `qeeg/viz/topomap.py`, `json` in 3 files); 2× `F541` empty f-string (`render_engine/renderers.py:303-304`); 2× `F841` unused local (`torch`, `colors`). **No blocking semantic errors.** |
| `pytest` (full suite) | `pytest apps/api/tests/` | **NOT RUN — blocked at conftest import** by missing `slowapi`, `mne`, `nibabel`, `weasyprint`, `python-docx`, `python-jose`, `passlib`, `sentry-sdk`, `anthropic`, `openai`, `stripe`, etc. Documented in `devops_env_baseline.md`. Specialists self-report passing on their scoped tests where deps were importable; see `scoring_tests_added.md` (25/25 pass on `test_risk_clinical_scores.py`), `qeeg_tests_added.md`, `mri_tests_added.md`, `prediction_tests_added.md`, `reports_upgrades_applied.md`. |

### Test summary cite-source

No `qa_review.md` was produced this shift. Citations rely on per-stream self-reports listed above. **Recommend QA pass on a real env post-deps-install.**

---

## 2 Environment requirements (production image)

These deps **MUST** be present in any image that runs `apps/api` (extracted from `apps/api/pyproject.toml` and Dockerfile-side editable installs documented in `devops_env_baseline.md`):

### Pinned / declared
- `fastapi>=0.116`, `uvicorn[standard]>=0.35`, `pydantic>=2.11`, `sqlalchemy>=2`, `alembic>=1.13`, `psycopg2-binary>=2.9`
- `python-multipart>=0.0.9`, `aiofiles>=23,<25`
- `slowapi>=0.1.9` (rate limiting — currently the conftest blocker locally)
- `python-jose[cryptography]>=3.3`, `passlib[bcrypt]>=1.7.4`, `cryptography>=42`, `pyotp>=2.9`
- `sentry-sdk[fastapi]>=2`, `stripe>=7`
- `anthropic>=0.40`, `openai>=1,<2`
- `python-telegram-bot>=20`
- `pillow>=10`
- **Scientific stack:** `mne>=1.7,<2`, `scipy>=1.13,<2`, `numpy>=1.26,<3`, `specparam>=2.0.0rc0,<3`

### Sibling editable packages (NOT in `dependencies` — must be `pip install -e` separately by Dockerfile)
- `packages/qeeg-pipeline` (provides `deepsynaps_qeeg` — preprocess, ICA, SpecParam, connectivity, eLORETA)
- `packages/mri-pipeline` (provides `deepsynaps_mri` — structural, brain-age, NIfTI validation, NEW: `validation.py` + `safety.py` this shift)
- `packages/evidence` (NEW this shift: `score_response.py`)
- `packages/render-engine` (NEW this shift: `payload.py`; renderers.py expanded +509 LOC)
- `packages/generation-engine` (`protocols.py` +123 this shift)
- `packages/safety-engine`, `packages/qeeg-encoder`, `packages/feature-store` (existing)
- `packages/core-schema`, `packages/condition-registry`, `packages/modality-registry`, `packages/device-registry` (declared as `deepsynaps-*` in pyproject)

### System packages (Docker base layer)
- WeasyPrint runtime: `libpango-1.0-0`, `libpangoft2-1.0-0`, `libcairo2`, `libharfbuzz0b`, `libffi-dev`, `libgdk-pixbuf2.0-0` (Debian/Ubuntu names)
- `python-docx` is pure-Python — no system deps
- `psycopg2-binary` ships wheels — no `libpq-dev` needed at runtime
- MNE relies on standard scientific stack; no extra OS deps for the spectral/preproc paths used here

### NOT yet declared but used at runtime by new code
The reports stream introduced HTML→PDF rendering paths via WeasyPrint; verify `weasyprint` is in the production lockfile (`uv.lock`). It is NOT in `apps/api/pyproject.toml` `dependencies`. Same for `python-docx` if export-to-DOCX is wired.

---

## 3 New endpoints (this shift)

| Method | Path | Stream | Source |
|---|---|---|---|
| **GET** | `/api/v1/risk/patient/{patient_id}/clinical-scores` | Scoring | `apps/api/app/routers/risk_stratification_router.py` (verified in source: `@router.get("/patient/{patient_id}/clinical-scores")`). **Note:** Task brief said POST; actual implementation is GET — confirmed in code. |
| **POST** | `/api/v1/deeptwin/patients/{pid}/scenarios/compare` | DeepTwin | `apps/api/app/routers/deeptwin_router.py` (lines ~931-985 per `digital_twin_upgrades_applied.md`). Returns structured deltas across N scenarios. |
| **GET** | `/api/v1/mri/report/{analysis_id}/fusion_payload` | MRI | `apps/api/app/routers/mri_analysis_router.py`. Returns stable fusion payload for downstream consumers. |
| **POST** | `/api/v1/reports/preview-payload` | Reports | `apps/api/app/routers/reports_router.py`. Returns a `ReportPayload` (no persistence). |
| **GET** | `/api/v1/reports/{id}/payload` | Reports | Returns the structured payload for a stored report. |
| **GET** | `/api/v1/reports/{id}/render?format=html\|pdf&audience=…` | Reports | Server-rendered output via render-engine. |

All response shapes augmented with `schema_version`, `provenance`, `decision_support_only` fields per per-stream upgrade docs (back-compat: defaults set, old callers unaffected).

---

## 4 DB migrations

**No new Alembic migrations this shift.** `git diff --name-only main apps/api/alembic/` returns empty. `apps/api/alembic/versions/` directory is unchanged (49 files, last is `029_home_task_templates.py`). All new fields are Pydantic-only response augmentations or in-memory service objects — no schema changes.

---

## 5 Manual steps before deploy

1. **Install editable packages** (already part of Dockerfile flow but worth confirming on the build runner):
   ```bash
   uv sync                                  # primary path (uv.lock authoritative)
   # or:
   pip install -e apps/api
   pip install -e packages/qeeg-pipeline packages/mri-pipeline
   pip install -e packages/evidence packages/render-engine packages/generation-engine packages/safety-engine
   ```
2. **Verify `weasyprint` is installed in the image** if reports stream PDF rendering is used in production. Add to `pyproject.toml` if not present.
3. **Run pytest in a real env** before promoting (the dev box can't due to missing deps; CI on Fly/GitHub Actions will be authoritative). Suggested:
   ```bash
   pytest apps/api/tests/test_risk_clinical_scores.py -v
   pytest apps/api/tests/test_deeptwin_router.py -v
   pytest apps/api/tests/test_mri_analysis_router.py -v
   pytest apps/api/tests/test_reports_router.py -v
   pytest packages/qeeg-pipeline/tests/ -v
   pytest packages/mri-pipeline/tests/ -v
   ```
4. **Optional cleanup (non-blocking):** `python3.11 -m ruff check --fix apps/api/app/services/deeptwin_engine.py packages/` will resolve 34+4 unused-import / empty-f-string warnings.
5. **Frontend `evidence-intelligence.test.js`** needs a localStorage stub fix for Node 25 (test infra task — ticket separately, not a deploy gate).

---

## 6 Rollout risk per stream

| Stream | Risk | Rationale |
|---|---|---|
| Scoring | **LOW** | New `GET` endpoint; new service file is self-contained; 25/25 unit tests pass per stream report; existing routes untouched in shape. |
| MRI | **LOW–MED** | New `GET fusion_payload` endpoint; new `validation.py` + `safety.py` modules. No existing endpoint contracts changed. Risk: WeasyPrint dep if MRI report renders PDFs. |
| DeepTwin | **MED** | Largest router diff (+300 LOC), engine refactor (+198), 4 unused imports indicate the wiring may have leftovers. New `POST /scenarios/compare` is additive. Existing `analyze`/`simulate` responses augmented with new fields (back-compat by default values). Recommend smoke test of analyze + simulate endpoints in preview before main. |
| Reports | **MED–HIGH** | Render-engine grew by 509 LOC; new payload module; 3 new endpoints; PDF rendering touches WeasyPrint sys-deps. Confirm prod image has Pango/Cairo. Do **NOT** ship without an end-to-end render check on preview. |
| qEEG | **LOW–MED** | Mostly internal package edits + new tests + UI page additions. No new endpoints. Pipeline preprocess/spectral/clinical_summary changes are large but specialists report passing tests. |
| Frontend | **LOW** | Vite build passes; new `pages-protocols`, `pages-deeptwin`, `pages-qeeg-analysis` chunks load. Pre-existing `QeegLive` TS errors unaffected. Pre-existing test failure unaffected. |

---

## 7 Rollback approach

- **Branch is uncommitted on local working tree** (29 modified, 11 new code files). To roll back to last shipped main:
  ```bash
  git stash -u                # safety-stash if needed
  git checkout main
  ```
- Once committed/pushed and merged, rollback = revert the merge commit:
  ```bash
  git revert -m 1 <merge-sha>
  ```
- **No destructive DB ops** (zero new migrations) → revert is purely code; no `alembic downgrade` required.
- Preview stack (Netlify + Fly): re-deploy from `main` via:
  ```bash
  git checkout main && bash scripts/deploy-preview.sh --api
  ```

---

## 8 Deploy command (per `CLAUDE.md` / `scripts/deploy-preview.sh`)

```bash
# Web only (Netlify, ~45s):
bash scripts/deploy-preview.sh

# Web + API (Fly):
bash scripts/deploy-preview.sh --api

# API only:
bash scripts/deploy-preview.sh --api-only
```

Targets:
- Web: `https://deepsynaps-studio-preview.netlify.app`
- API: `https://deepsynaps-studio.fly.dev`

Auth required (one-time per machine): `netlify login` and `flyctl auth login` (or `NETLIFY_AUTH_TOKEN` / `FLY_ACCESS_TOKEN` env).

**This DevOps stream did NOT execute the deploy script.** Per orders.

---

## 9 Verdict

**YELLOW** — code is build-clean and compile-clean across all specialist deltas. Fitness-for-deploy is gated by:

1. **Real-env pytest run** to confirm specialist self-reports of green tests (dev box can't validate due to missing scientific stack).
2. **WeasyPrint sys-deps confirmed in API image** (Reports stream).
3. **Smoke test of new endpoints** on preview before main merge — especially Reports and DeepTwin.

No hard blockers. After items 1-3, status flips to GREEN.
