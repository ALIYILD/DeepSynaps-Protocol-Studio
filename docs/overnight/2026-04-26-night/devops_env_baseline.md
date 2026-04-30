# DevOps Env Baseline — 2026-04-26 Night Shift

## System
- macOS Darwin 25.3.0, arm64
- Python: 3.11 at /opt/homebrew/bin/python3.11
- Node: v25.2.0
- npm: /opt/homebrew/bin/npm
- pytest: /opt/homebrew/bin/pytest
- uv: NOT INSTALLED (repo has uv.lock — uv is intended manager)

## Frontend (apps/web)
- Vite 7 + React 18.3 + TypeScript
- `npx tsc --noEmit -p tsconfig.app.json`: PASSES (exit 0)
- node_modules present (already installed)
- Built artifacts present in apps/web/dist

## Backend (apps/api)
- FastAPI + SQLAlchemy + Alembic
- Declared deps in apps/api/pyproject.toml include heavy scientific stack: mne>=1.7, scipy, numpy, specparam, slowapi, sentry, anthropic, openai, etc.
- Deps INSTALLED in system python3.11: fastapi, pydantic, sqlalchemy, pytest, pytest-asyncio, pytest-cov, alembic, numpy, scipy
- Deps MISSING in system python3.11 (collected pytest fails on import): slowapi (confirmed missing), almost certainly also: mne, specparam, anthropic, openai, python-jose, passlib, sentry-sdk, stripe, python-telegram-bot, pyotp, cryptography, pillow, aiofiles, python-multipart, deepsynaps-* sibling packages
- pip install attempt blocked by sandbox (no autonomous install permission)

## Test Collection State (baseline)
- `pytest apps/api/tests/ --collect-only` FAILS at conftest import:
  - apps/api/app/limiter.py imports `slowapi` → ModuleNotFoundError
- This is a blocker for full pytest runs tonight without env setup.

## Recommended User Action (morning)
```bash
# Option A — uv (matches uv.lock)
brew install uv
cd ~/DeepSynaps-Protocol-Studio
uv sync                     # installs root + workspace deps from uv.lock
uv pip install -e apps/api
uv pip install -e packages/qeeg-pipeline
uv pip install -e packages/mri-pipeline

# Option B — venv + pip
cd ~/DeepSynaps-Protocol-Studio
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e apps/api
pip install -e packages/qeeg-pipeline
pip install -e packages/mri-pipeline
pip install -e packages/evidence packages/render-engine packages/generation-engine packages/safety-engine
pytest apps/api/tests/ -v
```

## Tonight's Strategy Under Constraint
- Specialists write code + contract-style tests that DO NOT require running the full stack to validate at write-time.
- Specialists run their pytest scoped to their module; if it fails on missing deps, they record the failure as DEPS_MISSING_DEVOPS_BLOCKER, NOT a test failure.
- Frontend changes are validated by `npx tsc --noEmit` (which passes baseline) plus `node --test` for unit tests.
- E2E (Playwright) is skipped tonight unless trivially runnable; otherwise documented.

## Frontend Test Smoke
```bash
cd apps/web
npm run test:unit   # node --test, no build needed
```
This is the safe path for validating qEEG / MRI / etc. frontend changes.
