# PostgreSQL Deployment Guide

## Quick Start

### 1. Install psycopg2

```bash
pip install psycopg2-binary
```

### 2. Set Environment Variables

```bash
export DEEPSYNAPS_APP_ENV=production
export DATABASE_URL=postgresql://user:password@localhost:5432/deepsynaps
```

### 3. Run the Application

```bash
cd apps/api
uvicorn src.deepsynaps.main:app --host 0.0.0.0 --port 8000
```

## Connection Pooling

Tune via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| POSTGRES_POOL_SIZE | 10 | Base pool size |
| POSTGRES_MAX_OVERFLOW | 20 | Overflow connections |
| POSTGRES_POOL_RECYCLE | 3600 | Connection recycle (seconds) |
| POSTGRES_POOL_PRE_PING | true | Health-check before checkout |
| POSTGRES_SSLMODE | prefer | SSL mode (disable/allow/prefer/require) |

## SSL

For production, use `POSTGRES_SSLMODE=require`:

```bash
export POSTGRES_SSLMODE=require
```

## Health Check

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status": "ok", "dialect": "postgresql", "app_env": "production"}
```

## Docker Compose

```yaml
version: "3.8"
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: deepsynaps
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: deepsynaps
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: .
    environment:
      DEEPSYNAPS_APP_ENV: production
      DATABASE_URL: postgresql://deepsynaps:changeme@db:5432/deepsynaps
    ports:
      - "8000:8000"
    depends_on:
      - db

volumes:
  pgdata:
```

## Environment Reference

See `.env.example` in project root for all available variables.
