# DeepSynaps Protocol Studio — Deployment Guide

## Overview

The application is a single Docker image that contains:
- **FastAPI backend** (uvicorn, port 8080)
- **Pre-built React frontend** (served as static files by FastAPI)

Production hosting is Fly.io (`fly.toml` is included). The same image can run on any Docker-compatible host.

---

## 1. Required Environment Variables

Copy `.env.example` to `.env` and fill in real values. The table below lists every variable that **must** be set for a production deployment. Variables marked *(optional)* have safe defaults and can be omitted.

| Variable | Required | Description |
|---|---|---|
| `DEEPSYNAPS_APP_ENV` | yes | `production` in prod; `development` locally |
| `DEEPSYNAPS_DATABASE_URL` | yes | PostgreSQL URL for prod; SQLite default for dev |
| `JWT_SECRET_KEY` | yes | Random 64-char hex string (`openssl rand -hex 32`) |
| `STRIPE_SECRET_KEY` | yes (payments) | Stripe secret key (`sk_live_…`) |
| `STRIPE_PUBLISHABLE_KEY` | yes (payments) | Stripe publishable key (`pk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | yes (payments) | Stripe webhook signing secret (`whsec_…`) |
| `STRIPE_PRICE_RESIDENT` | yes (payments) | Stripe Price ID for Resident tier |
| `STRIPE_PRICE_CLINICIAN_PRO` | yes (payments) | Stripe Price ID for Clinician Pro tier |
| `STRIPE_PRICE_CLINIC_TEAM` | yes (payments) | Stripe Price ID for Clinic Team tier |
| `ANTHROPIC_API_KEY` | yes (AI features) | Anthropic API key (`sk-ant-…`) |
| `TELEGRAM_BOT_TOKEN` | yes (Telegram bot) | Token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | optional | Validates Telegram webhook payloads |
| `SENTRY_DSN` | optional | Sentry DSN for error tracking |
| `DEEPSYNAPS_CORS_ORIGINS` | optional | Comma-separated allowed origins (defaults to localhost Vite ports) |
| `APP_URL` | optional | Public frontend URL used for Stripe redirect URLs |
| `DEEPSYNAPS_LOG_LEVEL` | optional | `INFO` (default); `DEBUG` for verbose output |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | optional | Default `60` |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | optional | Default `30` |

See `.env.example` for full documentation and example values.

---

## 2. Local Development Setup

```bash
# 1. Clone and enter the repo
git clone <repo-url>
cd DeepSynaps-Protocol-Studio

# 2. Create your local env file
cp .env.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY and JWT_SECRET_KEY

# 3. Install Python packages (editable mode)
pip install -e ./packages/core-schema \
            -e ./packages/condition-registry \
            -e ./packages/modality-registry \
            -e ./packages/device-registry \
            -e ./packages/safety-engine \
            -e ./packages/generation-engine \
            -e ./packages/render-engine \
            -e ./apps/api

# 4. Install Node packages and start the frontend dev server
npm ci
npm run dev:web          # starts Vite at http://localhost:5173

# 5. Start the API server (separate terminal)
cd apps/api
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The SQLite database is created automatically on first startup. Clinical data is seeded from `data/imports/clinical-database/` during the lifespan startup event.

---

## 3. Docker Build

```bash
# Build the image (frontend is compiled at build time)
docker build -t deepsynaps-studio:latest .

# Optional: pass a custom API base URL for the frontend build
docker build \
  --build-arg VITE_API_BASE_URL=https://deepsynaps-studio.fly.dev \
  -t deepsynaps-studio:latest .

# Run locally with Docker
docker run --rm \
  --env-file .env \
  -p 8080:8080 \
  deepsynaps-studio:latest
```

The container exposes port **8080**. The app will be available at `http://localhost:8080`.

---

## 4. Fly.io Deployment

```bash
# Install Fly CLI if needed
curl -L https://fly.io/install.sh | sh

# Authenticate
fly auth login

# First-time: create the app (skip if already created)
fly launch --no-deploy

# Set required secrets (never commit these — set them once via CLI)
fly secrets set \
  DEEPSYNAPS_DATABASE_URL="postgresql://user:pass@host:5432/deepsynaps_prod?sslmode=require" \
  JWT_SECRET_KEY="$(openssl rand -hex 32)" \
  STRIPE_SECRET_KEY="sk_live_..." \
  STRIPE_PUBLISHABLE_KEY="pk_live_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  STRIPE_PRICE_RESIDENT="price_..." \
  STRIPE_PRICE_CLINICIAN_PRO="price_..." \
  STRIPE_PRICE_CLINIC_TEAM="price_..." \
  ANTHROPIC_API_KEY="sk-ant-..." \
  TELEGRAM_BOT_TOKEN="..." \
  SENTRY_DSN="https://...@sentry.io/..."

# Deploy
fly deploy

# Stream logs
fly logs
```

Non-secret environment variables (`DEEPSYNAPS_APP_ENV`, `DEEPSYNAPS_LOG_LEVEL`, `DEEPSYNAPS_CORS_ORIGINS`) are already set in `fly.toml` and do not need to be added as secrets.

---

## 5. Database Initialization

### SQLite (development)

The database file is created and all tables are migrated automatically on startup via `init_database()`. No manual step is needed.

### PostgreSQL (production)

1. Provision a Postgres database (Fly Postgres, Supabase, Neon, RDS, etc.).
2. Set `DEEPSYNAPS_DATABASE_URL` to the connection string.
3. Tables are created automatically on first startup.
4. Clinical snapshot data is seeded from the `data/` directory on every startup — this is idempotent.

---

## 6. First-Time Setup

After the server is running for the first time:

1. **Create an admin user** — use the `/api/v1/auth/register` endpoint (or a seed script if available) to create the first user account.

2. **Verify clinical data seeding** — check the health endpoint to confirm the snapshot loaded:
   ```
   GET /health
   ```
   The response includes `clinical_snapshot.total_records`; this should be greater than 0.

3. **Configure Stripe webhook** (if using payments):
   - In the Stripe dashboard, add a webhook endpoint pointing to `https://<your-domain>/api/v1/payments/webhook`.
   - Set the signing secret as `STRIPE_WEBHOOK_SECRET`.

4. **Configure Telegram webhook** (if using the bot):
   - Register the webhook URL with Telegram's Bot API:
     ```
     POST https://api.telegram.org/bot<TOKEN>/setWebhook
     {"url": "https://<your-domain>/api/v1/telegram/webhook"}
     ```

---

## 7. Health Check

Two equivalent health endpoints are available:

| Endpoint | Description |
|---|---|
| `GET /health` | Returns app status, DB connectivity, and clinical snapshot info |
| `GET /healthz` | Alias — used by Fly.io (`fly.toml` → `[[http_service.checks]]`) |

Example healthy response:

```json
{
  "status": "ok",
  "environment": "production",
  "version": "0.1.0",
  "database": "ok",
  "clinical_snapshot": {
    "snapshot_id": "abc123",
    "total_records": 4200
  }
}
```

A non-`ok` status or a 5xx response indicates the database is unreachable or the app failed to start.

---

## 8. Makefile Shortcuts

The repo includes a `Makefile` — run `make` (or `make help` if a help target exists) to see available shortcuts for common tasks such as running tests, linting, and building.
