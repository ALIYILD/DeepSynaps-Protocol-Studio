# Connecting Netlify Preview to Staging API

This document explains how to connect the Netlify-deployed frontend to a
staging backend (e.g., Fly.io).

## Architecture

```
Browser  ──>  Netlify CDN  (apps/web dist, VITE_ENABLE_DEMO=0)
                │
                └──>  Fly.io / staging API  (apps/api, apps/worker)
                        │
                        ├── PostgreSQL
                        ├── Redis (Celery broker)
                        └── Model weights (optional)
```

## Netlify Environment Variables

Set these in Netlify > Site settings > Environment variables:

| Variable              | Value                             | Notes                           |
|-----------------------|-----------------------------------|---------------------------------|
| `VITE_API_BASE_URL`   | `https://deepsynaps-studio.fly.dev` | API base URL (no trailing `/`) |
| `VITE_ENABLE_DEMO`    | `0`                               | `1` = offline demo mode, `0` = live backend |

When `VITE_ENABLE_DEMO=0` and `VITE_API_BASE_URL` is set:
- Demo login buttons are hidden (only real auth works).
- All API calls go to the staging backend.
- No synthetic demo data is seeded.

When `VITE_ENABLE_DEMO=1` (current preview state):
- Demo buttons are visible.
- API calls are intercepted by the demo shim (no real network calls).
- Pages render with deterministic sample data.

## Fly.io / API Environment Variables

Required for the backend to start in staging:

| Variable                    | Required | Notes                                        |
|-----------------------------|----------|----------------------------------------------|
| `DEEPSYNAPS_APP_ENV`        | Yes      | `staging`                                    |
| `DEEPSYNAPS_DATABASE_URL`   | Yes      | PostgreSQL connection string                 |
| `JWT_SECRET_KEY`            | Yes      | 64+ char random string                      |
| `DEEPSYNAPS_SECRETS_KEY`    | Yes      | Fernet key for 2FA persistence               |
| `DEEPSYNAPS_CORS_ORIGINS`   | Yes      | `https://deepsynaps-studio-preview.netlify.app` |
| `WEARABLE_TOKEN_ENC_KEY`    | Yes      | Encryption key for wearable OAuth tokens     |
| `CELERY_BROKER_URL`         | Rec.     | Redis URL (e.g., `redis://...`)              |
| `CELERY_RESULT_BACKEND`     | No       | Falls back to broker URL                     |
| `DEEPSYNAPS_LIMITER_REDIS_URI` | No    | Rate limiter (in-memory if unset)            |
| `STRIPE_SECRET_KEY`         | No       | Billing features disabled if unset           |
| `STRIPE_WEBHOOK_SECRET`     | No       | Stripe webhooks disabled if unset            |
| `ANTHROPIC_API_KEY`         | No       | LLM copilot (one of Anthropic/OpenAI/GLM)   |
| `OPENAI_API_KEY`            | No       | LLM copilot alternative                     |
| `GLM_API_KEY`               | No       | LLM copilot alternative                     |
| `BRAINAGE_WEIGHTS_PATH`     | No       | Brain-age CNN model file path                |
| `FOUNDATION_WEIGHTS_DIR`    | No       | LaBraM foundation model directory            |

## CORS Configuration

The API reads `DEEPSYNAPS_CORS_ORIGINS` as a comma-separated list of allowed
origins. For staging with the Netlify preview:

```
DEEPSYNAPS_CORS_ORIGINS=https://deepsynaps-studio-preview.netlify.app
```

If empty, all cross-origin requests are rejected (safe default).

## Health Check Endpoints

After deploying the API, verify with:

```bash
# Basic health (checks DB connection)
curl https://deepsynaps-studio.fly.dev/healthz

# Versioned health
curl https://deepsynaps-studio.fly.dev/api/v1/health

# AI feature status (detailed readiness)
curl https://deepsynaps-studio.fly.dev/api/v1/health/ai
```

Expected responses:
- `/healthz` returns `{"status": "ok", "db": "ok", ...}` when DB is connected.
- `/api/v1/health/ai` returns per-feature status with `real_ai: true/false` flags.
  Features without model weights or API keys will show `status: "not_configured"`.

## Demo Mode Toggle

To switch between demo and live modes:

| Mode          | Netlify vars                                 | Behavior                        |
|---------------|----------------------------------------------|---------------------------------|
| Demo (current)| `VITE_ENABLE_DEMO=1`, no `VITE_API_BASE_URL` | Offline, synthetic data         |
| Staging       | `VITE_ENABLE_DEMO=0`, `VITE_API_BASE_URL=...`| Live backend, real auth         |
| Hybrid        | `VITE_ENABLE_DEMO=1`, `VITE_API_BASE_URL=...`| Tries API first, falls back to demo |

## Expected Unavailable States

When the staging API is connected but optional services are missing:

| Feature              | Without config                         | User sees                        |
|----------------------|----------------------------------------|----------------------------------|
| qEEG AI recommender  | No model weights                       | Quantitative data valid, AI recommendation unavailable |
| DeepTwin simulator   | Placeholder engine                     | Demo/deterministic predictions, not real AI |
| Brain Twin           | No real simulation                     | Placeholder forecasts            |
| MedRAG               | No pgvector/embeddings                 | Keyword-based fallback           |
| LLM Copilot          | No API keys                            | Chat unavailable                 |
| Billing              | No Stripe keys                         | Billing features disabled        |
| Brain-age CNN        | No weights file                        | Brain-age feature hidden         |

## Database Setup

```bash
# Run migrations against the staging database
cd apps/api
DEEPSYNAPS_DATABASE_URL=postgresql://... python -m alembic upgrade head
```

## Rollback Plan

1. **Frontend rollback**: Set `VITE_ENABLE_DEMO=1` in Netlify and redeploy.
   The frontend immediately reverts to offline demo mode.
2. **API rollback**: On Fly.io, `flyctl releases` shows deployment history.
   Use `flyctl deploy --image <previous-image>` to roll back.
3. **Database**: Alembic supports `downgrade -1` for the last migration.
   Test downgrades in staging before attempting in production.

## Validation Before Connecting

Run the production readiness validator locally:

```bash
python scripts/validate_production_readiness.py --json
# Should show 0 FAILs in dev mode

DEEPSYNAPS_APP_ENV=staging python scripts/validate_production_readiness.py --json
# WARNs for missing optional services are expected
```
