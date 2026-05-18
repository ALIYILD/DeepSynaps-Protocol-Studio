<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# PostgreSQL Config Audit

## Environment Variables

| Variable | Default | Production | Notes |
|----------|---------|------------|-------|
| `DEEPSYNAPS_DATABASE_URL` | (sqlite fallback) | Required | PostgreSQL connection URL — **not** `DATABASE_URL` |
| `DEEPSYNAPS_DB` | `:memory:` | N/A | SQLite path (dev/test only) |
| `POSTGRES_POOL_SIZE` | 10 | 20 | Increase for production load |
| `POSTGRES_MAX_OVERFLOW` | 20 | 30 | Burst capacity |
| `POSTGRES_POOL_RECYCLE` | 3600 | 1800 | Faster recycle in prod |
| `POSTGRES_POOL_PRE_PING` | true | true | Always on |
| `POSTGRES_SSLMODE` | prefer | require | SSL in production (Fly Postgres requires SSL) |
| `DEEPSYNAPS_APP_ENV` | development | production | Controls dialect validation |

Settings are read in `apps/api/app/settings.py`. The `database_url` field maps to `DEEPSYNAPS_DATABASE_URL` (with `DATABASE_URL` as fallback for legacy compatibility — prefer the canonical name).

## Current Default Configuration

All PostgreSQL tuning parameters are configured via environment variables with sensible defaults in `apps/api/app/database.py`. No hardcoded production credentials exist in source code.

## Audit Findings

- No secrets in source code
- All DB configuration via env vars (managed as Fly secrets in production)
- SQLite blocked in production by `validate_database_url()` in `apps/api/app/settings.py`
- `.env.example` provided (no secrets committed)
- Demo mode off by default
- 55+ index declarations already present in `apps/api/app/persistence/models/`

<!-- TODO: verify against current main — confirm validate_database_url behaviour blocks SQLite when DEEPSYNAPS_APP_ENV=production -->
