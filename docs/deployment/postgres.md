<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# PostgreSQL Deployment Guide

## Quick Start

### 1. Install psycopg2

```bash
pip install psycopg2-binary
```

### 2. Set Environment Variables on Fly

```bash
fly secrets set DEEPSYNAPS_APP_ENV=production --app deepsynaps-studio
fly secrets set DEEPSYNAPS_DATABASE_URL="postgresql://user:password@host:5432/deepsynaps?sslmode=require" --app deepsynaps-studio
```

The env var name is `DEEPSYNAPS_DATABASE_URL` — not `DATABASE_URL`.

### 3. Run the Application

The correct module path is `app.main:app` (not `src.deepsynaps.main`):

```bash
cd apps/api
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

On Fly this is handled by `fly.toml` / the Dockerfile entrypoint — verify those reference `app.main:app`.

## Connection Pooling

Configured in `apps/api/app/database.py` and tunable via Fly secrets:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_POOL_SIZE` | 10 | Base pool size |
| `POSTGRES_MAX_OVERFLOW` | 20 | Overflow connections |
| `POSTGRES_POOL_RECYCLE` | 3600 | Connection recycle (seconds) |
| `POSTGRES_POOL_PRE_PING` | true | Health-check before checkout |
| `POSTGRES_SSLMODE` | prefer | SSL mode (disable/allow/prefer/require) |

## SSL

Fly Postgres requires SSL. Use `sslmode=require` in the connection string or set:

```bash
fly secrets set POSTGRES_SSLMODE=require --app deepsynaps-studio
```

## Health Check

```bash
curl https://deepsynaps-studio.fly.dev/health
```

Expected response:
```json
{"status": "ok", "dialect": "postgresql", "app_env": "production"}
```

## Migrations

Alembic manages schema. Current known heads: `b5278dd39fee`, `d1e2f3a4b5c6_merge_100_agent_configs`, `104_merge_agent_configs_lineage`.

```bash
cd apps/api
alembic current        # check deployed revision
alembic upgrade head   # apply pending migrations
```

Run migrations before deploying a new API version.

## Environment Reference

See `.env.example` in the project root for all available variables. On Fly, all variables are managed as secrets — never committed to source.

<!-- TODO: verify against current main — confirm .env.example exists at repo root and lists DEEPSYNAPS_DATABASE_URL -->
