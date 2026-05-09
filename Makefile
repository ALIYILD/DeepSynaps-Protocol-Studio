.PHONY: setup-web install-python dev-api dev-web lint-web build-web test-web test-api test-worker test-packages test-all test-coverage test-coverage-api test-coverage-worker test-coverage-web test-coverage-packages backup-db write-runtime-snapshot overnight-summary verify

setup-web:
	npm install

install-python:
	python -m pip install \
		-e ./packages/core-schema \
		-e ./packages/clinical-data-registry \
		-e ./packages/condition-registry \
		-e ./packages/modality-registry \
		-e ./packages/device-registry \
		-e ./packages/biometrics-pipeline \
		-e ./packages/deepsynaps-core \
		-e ./packages/deeptwin-neuroai-lab \
		-e ./packages/audio-pipeline \
		-e ./packages/evidence \
		-e ./packages/feature-store \
		-e ./packages/mri-pipeline \
		-e ./packages/qa \
		-e ./packages/qeeg-encoder \
		-e ./packages/qeeg-pipeline \
		-e ./packages/text-pipeline \
		-e ./packages/video-pipeline \
		-e ./packages/safety-engine \
		-e ./packages/generation-engine \
		-e ./packages/render-engine \
		-e ./apps/api \
		-e ./apps/worker

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
	cd packages/clinical-data-registry && python -m pytest tests/ -q
	cd packages/qa && python -m pytest tests/ -q
	cd packages/qeeg-pipeline && python -m pytest tests/ -q

# Run all test suites in separate processes to avoid app namespace collision.
test-all: test-api test-worker test-packages

# ────────────────────────────────────────────────────────────────────────────
# Coverage targets — see docs/test-coverage-plan.md for thresholds and
# the phase-by-phase lift schedule. Each target writes coverage.xml,
# lcov.info, and an htmlcov/ directory under the relevant working dir.
# ────────────────────────────────────────────────────────────────────────────

test-coverage-api:
	cd apps/api && python -m pytest --cov=app --cov-report=term-missing --cov-report=xml --cov-report=html -o "addopts="

test-coverage-worker:
	cd apps/worker && python -m pytest --cov=app --cov-report=term-missing --cov-report=xml --cov-report=html

test-coverage-web:
	npm run test:coverage --workspace @deepsynaps/web

# Each package runs in its own process. Failures in one package do NOT abort
# the whole loop (we want a complete picture for the final report); CI uses
# the coverage workflow to enforce per-package fail-under thresholds instead.
test-coverage-packages:
	@for pkg in clinical-data-registry qa qeeg-pipeline core-schema condition-registry modality-registry device-registry safety-engine generation-engine render-engine evidence biometrics-pipeline mri-pipeline qeeg-encoder neuro-engine deeptwin-neuroai-lab feature-store text-pipeline audio-pipeline video-pipeline voice-engine; do \
		echo "=== packages/$$pkg ===" ; \
		cd packages/$$pkg 2>/dev/null && \
			(test -d tests && python -m pytest tests/ --cov-config=$$PWD/../../.coveragerc --cov-report=term --cov-report=xml --cov-report=html || echo "  (no tests/ dir — skipping)") ; \
		cd - >/dev/null ; \
	done

# Run all coverage suites in separate processes (matches test-all topology).
test-coverage: test-coverage-api test-coverage-worker test-coverage-web test-coverage-packages

backup-db:
	uv run --no-project --with sqlalchemy --with pydantic python scripts/backup_database.py

write-runtime-snapshot:
	uv run --no-project --with sqlalchemy --with pydantic python scripts/write_runtime_snapshot.py

overnight-summary:
	.\.venv\Scripts\python.exe scripts/generate_overnight_swarm_summary.py

verify: test-api test-web build-web write-runtime-snapshot
