# Live Readiness Report

## Summary
DeepSynaps Studio is now in a stable demo/staging-ready state. The backend and frontend both build and test cleanly, the API starts locally against the imported clinical database, and the core authenticated flows return deterministic responses from the shared registry-driven backend.

The Perplexity-generated deployment checklist and summary report were reviewed from:
- `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\deployment_checklist.md`
- `C:\Users\yildi\OneDrive\Desktop\deepsynaps studio\SUMMARY_REPORT.md`

Those documents were useful for baseline counts, rollback concepts, and deployment discipline, but their direct commands target a different Node/Drizzle stack and were not adopted verbatim.

## Passed checks
- Imported clinical database copied into `data/imports/clinical-database`
- Clinical import validation passes against the expected 201-record baseline
- Deterministic seeding writes snapshot metadata and idempotent seed records
- `GET /health` and `GET /healthz` verify database connectivity and active clinical snapshot
- Structured request logging is enabled for API requests
- Environment configuration is centrally validated in `apps/api/app/settings.py`
- Database backup hook executed successfully
- Runtime snapshot hook executed successfully
- Backend test suite passes: `16 passed`
- Frontend test suite passes: `20 passed`
- Frontend production build passes
- Live backend smoke pass succeeds for:
  - `GET /health`
  - `GET /api/v1/evidence`
  - `GET /api/v1/devices`
  - `POST /api/v1/uploads/case-summary`
  - `POST /api/v1/protocols/generate-draft`
  - `POST /api/v1/handbooks/generate`
  - `POST /api/v1/review-actions`
  - `GET /api/v1/audit-trail`

## Failed checks
- No browser-driven end-to-end test pass was run against the live frontend and backend together
- Demo Bearer-token auth is still not real authentication and is not production-secure
- SQLite is acceptable for MVP demo/staging but is not the final production persistence plan
- Generated Perplexity deployment docs reference a `rollback_plan.md` that is not present in the source package

## Required secrets and environment variables
Current MVP requires configuration, not secrets.

Required environment variables or defaults:
- `DEEPSYNAPS_APP_ENV=development`
- `DEEPSYNAPS_API_HOST=127.0.0.1`
- `DEEPSYNAPS_API_PORT=8000`
- `DEEPSYNAPS_LOG_LEVEL=INFO`
- `DEEPSYNAPS_DATABASE_URL=sqlite:///./deepsynaps_protocol_studio.db`
- `DEEPSYNAPS_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173`
- `DEEPSYNAPS_CLINICAL_DATA_ROOT=./data/imports/clinical-database`
- `DEEPSYNAPS_CLINICAL_SNAPSHOT_ROOT=./data/snapshots/clinical-database`
- `DEEPSYNAPS_DATABASE_BACKUP_ROOT=./data/backups`
- `VITE_API_BASE_URL=http://127.0.0.1:8000`

## Verified commands
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

Live backend start:

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

## Deployment command
Preferred local production-style startup after dependencies are installed:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir apps/api
```

If using the verified fallback environment in this session:

```bash
uv run --python 3.11 --no-project --with-editable packages/core-schema --with-editable packages/condition-registry --with-editable packages/modality-registry --with-editable packages/device-registry --with-editable packages/safety-engine --with-editable packages/generation-engine --with-editable packages/render-engine --with fastapi --with sqlalchemy --with pydantic --with uvicorn --with httpx python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir apps/api
```

## Rollback steps
1. Stop the running API process.
2. Restore the latest backup from `data/backups/`.
3. Revert to the previous known-good git revision.
4. Restart the backend with the previous revision.
5. Verify `GET /health` returns `status=ok` and the expected snapshot id.
6. Rebuild the frontend with `npm run build:web`.

## Notable findings
- Imported clinical CSV text contained encoding artifacts; this was normalized during import so runtime responses are now clinician-readable.
- Remaining `TODO` markers are limited to non-runtime scaffolds:
  - `apps/worker/app/jobs.py`
  - `packages/generation-engine/src/deepsynaps_generation_engine/protocols.py`
- Those items are not currently blocking MVP runtime readiness.

## Recommendation
Proceed to a controlled demo/staging pass, not a public production launch yet.

Next priorities:
1. Replace demo Bearer-token auth with real authentication and role resolution
2. Move from SQLite to production-grade persistence if concurrent writes matter
3. Add browser-driven end-to-end checks for live frontend + backend flows
4. Add deployment automation that matches this FastAPI/React architecture rather than the older Node deployment checklist
