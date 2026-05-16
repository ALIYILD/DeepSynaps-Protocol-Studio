# PostgreSQL Config Audit

## Environment Variables

| Variable | Default | Production | Notes |
|----------|---------|------------|-------|
| DATABASE_URL | (empty) | Required | PostgreSQL connection URL |
| DEEPSYNAPS_DB | :memory: | N/A | SQLite path (dev only) |
| POSTGRES_POOL_SIZE | 10 | 20 | Increase for production load |
| POSTGRES_MAX_OVERFLOW | 20 | 30 | Burst capacity |
| POSTGRES_POOL_RECYCLE | 3600 | 1800 | Faster recycle in prod |
| POSTGRES_POOL_PRE_PING | true | true | Always on |
| POSTGRES_SSLMODE | prefer | require | SSL in production |
| DEEPSYNAPS_APP_ENV | development | production | Controls dialect validation |

## Current Default Configuration

All PostgreSQL tuning parameters are configured via environment variables with sensible defaults. No hardcoded production credentials exist in source code.

## Audit Findings

- No secrets in source code
- All DB configuration via env vars
- SQLite blocked in production by `validate_production_db()`
- `.env.example` provided (no secrets committed)
- Demo mode off by default
