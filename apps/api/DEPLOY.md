# Deploying DeepSynaps API to Fly.io

## Prerequisites
- [flyctl](https://fly.io/docs/hands-on/install-flyctl/) installed and authenticated
- Run all commands from the **repository root** (not from `apps/api/`)

## First deploy

```bash
# 1. Create the app (skip if already created)
fly apps create deepsynaps-studio

# 2. Create a persistent volume for the SQLite database and media uploads
fly volumes create deepsynaps_data --size 1 --region lhr --app deepsynaps-studio

# 3. Set required secrets
fly secrets set JWT_SECRET_KEY=$(openssl rand -hex 32) --app deepsynaps-studio
fly secrets set DEEPSYNAPS_SECRETS_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())") --app deepsynaps-studio
fly secrets set DEEPSYNAPS_DATABASE_URL=sqlite:////data/deepsynaps_protocol_studio.db --app deepsynaps-studio
fly secrets set DEEPSYNAPS_CORS_ORIGINS=https://deepsynaps-web.fly.dev,https://deepsynaps-studio.fly.dev --app deepsynaps-studio
fly secrets set APP_URL=https://deepsynaps-studio.fly.dev --app deepsynaps-studio
fly secrets set MEDIA_STORAGE_ROOT=/data/media_uploads --app deepsynaps-studio

# 4. Set optional secrets (fill in real values before running)
# fly secrets set STRIPE_SECRET_KEY=sk_live_... --app deepsynaps-studio
# fly secrets set STRIPE_WEBHOOK_SECRET=whsec_... --app deepsynaps-studio
# fly secrets set SENTRY_DSN=https://...@sentry.io/... --app deepsynaps-studio
# fly secrets set ANTHROPIC_API_KEY=sk-ant-... --app deepsynaps-studio
# fly secrets set WEARABLE_TOKEN_ENC_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())") --app deepsynaps-studio

# 5. Deploy (Dockerfile is at apps/api/Dockerfile, but build context is repo root)
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

## Subsequent deploys

```bash
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

## Check health

```bash
fly status --app deepsynaps-studio
curl https://deepsynaps-studio.fly.dev/health
```

## View logs

```bash
fly logs --app deepsynaps-studio
```

## Database

The SQLite database is stored on a persistent Fly volume mounted at `/data`.
- Database path: `/data/deepsynaps_protocol_studio.db`
- Media uploads: `/data/media_uploads/`

Alembic migrations run automatically on every deploy via `release_command` in `fly.toml`.
To run migrations manually:
```bash
fly ssh console --app deepsynaps-studio -C "cd /app/apps/api && python -m alembic upgrade head"
```

## SSE (Server-Sent Events)

The `/api/v1/notifications/stream` endpoint uses SSE. Fly.io routes through an HTTP/2 proxy.

Known behaviour with `auto_stop_machines = true`:
- Machines can sleep after idle periods, cutting open SSE connections
- The frontend `EventSource` must handle reconnects on `onerror` / `EventSource.CLOSED`
- SSE responses already include `Cache-Control: no-cache` to prevent proxy buffering

## Environment variables reference

See `.env.example` in this directory for all supported variables.
All variables use the `DEEPSYNAPS_` prefix except JWT, Stripe, Sentry, and third-party service keys.

Production/staging hard requirements:
- `JWT_SECRET_KEY` must be set to a strong random value or the API refuses to boot.
- `DEEPSYNAPS_SECRETS_KEY` must be set to a stable Fernet key or the API refuses to boot.
- `WEARABLE_TOKEN_ENC_KEY` should be set before enabling real wearable/device OAuth flows; otherwise tokens are stored without encryption at rest.
