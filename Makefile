.PHONY: setup-web install-python dev-api dev-web lint-web build-web test-web test-api test-worker test-packages test-all backup-db write-runtime-snapshot overnight-summary verify

setup-web:
	npm install

install-python:
	python -m pip install -e ./packages/core-schema -e ./packages/condition-registry -e ./packages/modality-registry -e ./packages/device-registry -e ./packages/safety-engine -e ./packages/generation-engine -e ./packages/render-engine -e ./apps/api -e ./apps/worker

dev-api:
	uvicorn app.main:app --reload --app-dir apps/api

dev-web:
	npm run dev --workspace @deepsynaps/web

lint-web:
	npm run lint --workspace @deepsynaps/web

build-web:
	npm run build --workspace @deepsynaps/web

test-web:
	npm run test --workspace @deepsynaps/web

test-api:
	cd apps/api && python -m pytest -q -o "addopts="

# Worker tests MUST run in a separate process from API tests.
# Both apps use an `app` Python package; combined runs cause namespace collision.
test-worker:
	cd apps/worker && python -m pytest -q

test-packages:
	cd packages/qa && python -m pytest tests/ -q
	cd packages/qeeg-pipeline && python -m pytest tests/ -q

# Run all test suites in separate processes to avoid app namespace collision.
test-all: test-api test-worker test-packages

backup-db:
	uv run --no-project --with sqlalchemy --with pydantic python scripts/backup_database.py

write-runtime-snapshot:
	uv run --no-project --with sqlalchemy --with pydantic python scripts/write_runtime_snapshot.py

overnight-summary:
	.\.venv\Scripts\python.exe scripts/generate_overnight_swarm_summary.py

verify: test-api test-web build-web write-runtime-snapshot
