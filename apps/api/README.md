# DeepSynaps Studio API

FastAPI backend for the DeepSynaps Studio MVP. The service is deterministic, registry-driven, role-aware, and now includes production-readiness basics: structured request logging, environment validation, health checks, persisted audit events, and verified backup/snapshot hooks.

## Scope
- evidence library endpoint
- device registry endpoint
- simulated upload case-summary endpoint
- deterministic protocol draft generator
- deterministic handbook generator
- persisted review action endpoint
- persisted audit trail endpoint
- legacy intake preview scaffold
- runtime health endpoints

## Required environment
Default values are safe for local development.

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
```

## Preferred local run
Install the editable packages from the repository root:

```bash
python -m pip install -e ./packages/core-schema -e ./packages/condition-registry -e ./packages/modality-registry -e ./packages/device-registry -e ./packages/safety-engine -e ./packages/generation-engine -e ./packages/render-engine -e ./apps/api
```

Run the API:

```bash
uvicorn app.main:app --reload --app-dir apps/api
```

## Verified fallback commands in this environment
Backend tests:

```bash
uv run --no-project --with pytest --with fastapi --with sqlalchemy --with pydantic --with uvicorn --with httpx python -m pytest apps/api/tests -q
```

Live API smoke pass:

```bash
uv run --python 3.11 --no-project --with-editable packages/core-schema --with-editable packages/condition-registry --with-editable packages/modality-registry --with-editable packages/device-registry --with-editable packages/safety-engine --with-editable packages/generation-engine --with-editable packages/render-engine --with fastapi --with sqlalchemy --with pydantic --with uvicorn --with httpx python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 --app-dir apps/api
```

Backup hook:

```bash
uv run --python 3.11 --no-project --with pydantic --with sqlalchemy python scripts/backup_database.py
```

Runtime snapshot hook:

```bash
uv run --python 3.11 --no-project --with-editable packages/core-schema --with-editable packages/condition-registry --with-editable packages/modality-registry --with-editable packages/device-registry --with-editable packages/safety-engine --with-editable packages/generation-engine --with-editable packages/render-engine --with fastapi --with sqlalchemy --with pydantic python scripts/write_runtime_snapshot.py
```

## Demo auth scaffolding
Protected endpoints no longer trust request-body role fields. Role is resolved server-side from a Bearer token.

Supported demo tokens:
- `guest-demo-token`
- `clinician-demo-token`
- `admin-demo-token`

Example:

```bash
curl -H "Authorization: Bearer clinician-demo-token" http://127.0.0.1:8000/api/v1/evidence
```

Protected routes:
- `POST /api/v1/uploads/case-summary` requires clinician or admin
- `POST /api/v1/protocols/generate-draft` allows guest for standard drafts, but off-label mode requires clinician or admin
- `POST /api/v1/handbooks/generate` requires clinician or admin
- `POST /api/v1/review-actions` requires clinician or admin
- `GET /api/v1/audit-trail` requires admin

## Health endpoints
- `GET /health`
- `GET /healthz`

Both endpoints verify database connectivity and expose the active imported clinical snapshot id and record count.

## API surface
- `GET /api/v1/evidence`
- `GET /api/v1/devices`
- `POST /api/v1/uploads/case-summary`
- `POST /api/v1/protocols/generate-draft`
- `POST /api/v1/handbooks/generate`
- `POST /api/v1/review-actions`
- `GET /api/v1/audit-trail`
- `POST /api/v1/intake/preview`

## Notes
- deterministic responses only
- no customer-specific Sozo logic
- uploads remain simulated and metadata-driven for now, but upload preparation is separated for future parsing
- role-sensitive actions use server-side resolution rather than request-body role claims
- review actions and audit events persist in SQLite through the repository layer
- imported clinical database counts are validated to the 201-record baseline before seeding
