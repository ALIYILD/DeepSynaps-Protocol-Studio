# DeepSynaps Studio

Clinical neuromodulation knowledge and document platform for professional users. The current MVP is deterministic, registry-driven, and backed by an imported 201-record clinical database.

## Product framing
DeepSynaps Studio supports evidence-based assessments, protocols, clinician handbooks, patient guides, device review, governance, and clinician-gated upload review. It is not an autonomous diagnosis or treatment system.

## Repository structure
- `apps/api` FastAPI backend
- `apps/web` React + Vite frontend
- `apps/worker` worker scaffold
- `tools/deepsweeper` vendored issue/PR sweeper kit with regulated guardrails
- `packages/core-schema` shared API and domain contracts
- `packages/*-registry` shared registry packages
- `packages/safety-engine` deterministic compatibility checks
- `data/imports/clinical-database` imported clinical source files
- `data/snapshots/clinical-database` generated snapshot manifests
- `data/backups` database backups
- `data/conditions` authoritative condition package JSON (one file per condition)
- `docs` governance and contributor policy notes

## Condition packages (evidence and governance)

See [`docs/protocol-evidence-governance-policy.md`](docs/protocol-evidence-governance-policy.md) for repo-wide rules on protocol evidence levels, downgrade/remove decisions, and required wording for clinician-facing vs patient-facing content.

## Verified production-readiness baseline
- backend health endpoints with database + snapshot status
- structured request logging
- validated environment configuration
- deterministic seeding from the imported 201-record clinical dataset
- database backup hook
- runtime snapshot hook
- frontend error boundary and graceful network/API errors
- backend tests passing
- frontend tests passing
- frontend production build passing
- live API smoke pass succeeding on all core endpoints

## Required environment
Defaults are provided for local development.

```bash
DEEPSYNAPS_APP_ENV=development
DEEPSYNAPS_API_HOST=127.0.0.1
DEEPSYNAPS_API_PORT=8000
DEEPSYNAPS_LOG_LEVEL=INFO
DEEPSYNAPS_DATABASE_URL=sqlite:///./deepsynaps_protocol_studio.db
DEEPSYNAPS_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
DEEPSYNAPS_CLINICAL_DATA_ROOT=./data/imports/clinical-database
DEEPSYNAPS_CLINICAL_SNAPSHOT_ROOT=./data/snapshots/clinical-database
DEEPSYNAPS_DATABASE_BACKUP_ROOT=./data/backups
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Local development
Install frontend dependencies:

```bash
npm install
```

Install backend packages:

```bash
python -m pip install -e ./packages/core-schema -e ./packages/condition-registry -e ./packages/modality-registry -e ./packages/device-registry -e ./packages/safety-engine -e ./packages/generation-engine -e ./packages/render-engine -e ./apps/api
```

Run the backend:

```bash
uvicorn app.main:app --reload --app-dir apps/api
```

Run the frontend:

```bash
npm run dev:web
```

## Verified fallback workflow in this environment
Backend tests:

```bash
uv run --no-project --with pytest --with fastapi --with sqlalchemy --with pydantic --with uvicorn --with httpx python -m pytest apps/api/tests -q
```

Frontend tests:

```bash
npm.cmd run test:web
```

Frontend build:

```bash
npm.cmd run build:web
```

Live API runtime:

```bash
uv run --python 3.11 --no-project --with-editable packages/core-schema --with-editable packages/condition-registry --with-editable packages/modality-registry --with-editable packages/device-registry --with-editable packages/safety-engine --with-editable packages/generation-engine --with-editable packages/render-engine --with fastapi --with sqlalchemy --with pydantic --with uvicorn --with httpx python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir apps/api
```

Backup hook:

```bash
uv run --python 3.11 --no-project --with pydantic --with sqlalchemy python scripts/backup_database.py
```

Runtime snapshot hook:

```bash
uv run --python 3.11 --no-project --with-editable packages/core-schema --with-editable packages/condition-registry --with-editable packages/modality-registry --with-editable packages/device-registry --with-editable packages/safety-engine --with-editable packages/generation-engine --with-editable packages/render-engine --with fastapi --with sqlalchemy --with pydantic python scripts/write_runtime_snapshot.py
```

## Demo auth mapping
- `Guest` -> `guest-demo-token`
- `Verified Clinician` -> `clinician-demo-token`
- `Admin` -> `admin-demo-token`

Sensitive backend behavior uses the server-side Bearer token role, not a client-supplied role field.

## Verification artifacts
- `data/snapshots/clinical-database/runtime-readiness.json`
- `data/backups/`
