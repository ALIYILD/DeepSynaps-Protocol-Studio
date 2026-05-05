# Doctor-ready deployment checklist (DeepSynaps Protocol Studio)

This checklist is written for the **preview stack** used by reviewers and the “doctor-ready” validation pass.

- **Web preview (Netlify)**: `https://deepsynaps-studio-preview.netlify.app`
- **API preview/prod (Fly)**: `https://deepsynaps-studio.fly.dev` (Fly app: `deepsynaps-studio`)

## CI entrypoints (what runs in GitHub Actions)

The main CI workflow is `.github/workflows/ci.yml`.

### Local equivalents (copy/paste)

From repo root:

```bash
# Node version note (important)
# - CI uses Node 20 (`actions/setup-node@v4 node-version: 20`)
# - `apps/web` uses Vite 7 which requires Node >=20.19 (or >=22.12)
# If your local/node VM is Node 18, `npm run build` will fail.

# Node workspace install (required for web + api-client checks)
npm ci

# api-client drift check (OpenAPI JSON vs generated TS types)
npm run api-client:check-drift

# api-client typecheck
npm run typecheck --workspace @deepsynaps/api-client

# web unit tests (node --test)
npm run test:unit --workspace @deepsynaps/web

# web build
npm run build:web
```

Backend tests (matches CI’s “Backend Tests” job):

```bash
python -m pip install --upgrade pip
pip install pytest pytest-asyncio pytest-xdist pytest-timeout httpx
pip install \
  -e packages/evidence \
  -e packages/qeeg-pipeline \
  -e packages/core-schema \
  -e packages/condition-registry \
  -e packages/modality-registry \
  -e packages/device-registry \
  -e packages/clinical-data-registry \
  -e packages/qa \
  -e packages/safety-engine \
  -e packages/generation-engine \
  -e packages/render-engine \
  -e packages/biometrics-pipeline \
  -e apps/api

cd apps/api
python -m pytest -q -n auto --tb=short --timeout=120 --timeout-method=thread
```

E2E (Playwright + local uvicorn on `127.0.0.1:8000`, matching CI’s “E2E Tests” job):

```bash
npm ci

cd apps/web
npx playwright install --with-deps chromium
cd ../..

python -m pip install --upgrade pip
pip install \
  -e packages/evidence \
  -e packages/core-schema \
  -e packages/condition-registry \
  -e packages/modality-registry \
  -e packages/device-registry \
  -e packages/clinical-data-registry \
  -e packages/qa \
  -e packages/safety-engine \
  -e packages/generation-engine \
  -e packages/render-engine \
  -e packages/biometrics-pipeline \
  -e apps/api

# start backend (terminal A)
cd apps/api
DEEPSYNAPS_APP_ENV=test \
DEEPSYNAPS_API_HOST=127.0.0.1 \
DEEPSYNAPS_API_PORT=8000 \
DEEPSYNAPS_LOG_LEVEL=INFO \
JWT_SECRET_KEY=e2e-local-test-secret-not-for-production-use-only \
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Then in another terminal (repo root):

```bash
npm run test:e2e --workspace @deepsynaps/web
```

## Preview deploy (reviewer-visible URL)

The repo includes a one-command deploy script.

From repo root:

```bash
bash scripts/deploy-preview.sh            # web only (Netlify) — default
bash scripts/deploy-preview.sh --api      # web + API (Fly)
bash scripts/deploy-preview.sh --api-only # API only
```

### Auth requirements (do not commit tokens)

- **Netlify**: `netlify login` (or `NETLIFY_AUTH_TOKEN` in your shell)
- **Fly**: `flyctl auth login` (or `FLY_ACCESS_TOKEN` in your shell)

## Web (Netlify) configuration

Source of truth: `netlify.toml` and `.github/workflows/deploy-netlify.yml`.

### Web build/demo flags

- **`VITE_ENABLE_DEMO=1`**: enables landing-page demo shortcuts so reviewers can enter the app without requiring a working backend demo-login endpoint.
- **`VITE_API_BASE_URL=https://deepsynaps-studio.fly.dev`**: points the built frontend at Fly API.

Netlify also proxies `GET/POST /api/*` to Fly via redirects.

### Netlify secret(s)

- **`NETLIFY_AUTH_TOKEN`** (GitHub Actions secret): used by `.github/workflows/deploy-netlify.yml` to deploy to the pinned site ID.

## API (Fly) configuration

Source of truth: `apps/api/fly.toml`, `apps/api/app/settings.py`, and `apps/api/.env.example`.

### Required Fly secrets (production/staging boot will fail without these)

- **`JWT_SECRET_KEY`**: must be set and not the insecure placeholder (server refuses to start in `production`/`staging`).
- **`DEEPSYNAPS_SECRETS_KEY`**: Fernet key for persisted 2FA/TOTP secrets (server refuses to start in `production`/`staging`).
- **`WEARABLE_TOKEN_ENC_KEY`**: Fernet key for encrypting wearable OAuth tokens at rest (server refuses to start in `production`/`staging`).
- **`DEEPSYNAPS_DATABASE_URL`**: SQLAlchemy URL (Fly guide uses SQLite on the `/data` volume).
- **`DEEPSYNAPS_CORS_ORIGINS`**: comma-separated list; **empty means fail-closed** for browser clients.
- **`APP_URL`**: used for Stripe redirect URLs.
- **`MEDIA_STORAGE_ROOT`**: recommended `/data/media_uploads` on Fly volume.

Recommended in Fly env (`apps/api/fly.toml` sets many defaults):

- `DEEPSYNAPS_APP_ENV=production`
- `DEEPSYNAPS_LOG_LEVEL=INFO`
- `PORT=8080`
- `EVIDENCE_DB_PATH=/data/evidence.db`

### Optional but commonly-needed secrets

- **LLM providers**
  - `ANTHROPIC_API_KEY` (primary)
  - `OPENAI_API_KEY` (optional: Whisper + fallback LLM)
  - `GLM_API_KEY` (optional: OpenAI-compatible endpoint; `OPENROUTER_API_KEY` also supported as fallback input for the same setting)
- **Stripe (payments)**
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PUBLISHABLE_KEY` (frontend, not a secret but often managed alongside)
  - price IDs: `STRIPE_PRICE_*`
- **Sentry**
  - `SENTRY_DSN`
- **Telegram (webhooks)**
  - `TELEGRAM_BOT_TOKEN` (and/or `TELEGRAM_BOT_TOKEN_PATIENT`, `TELEGRAM_BOT_TOKEN_CLINICIAN`)
  - `TELEGRAM_WEBHOOK_SECRET` (or bot-specific secrets if configured in code)

### Demo vs real behavior (API)

| Area | Demo behavior | Real behavior | Control |
|---|---|---|---|
| **Auth** | demo bearer tokens accepted (see `apps/api/README.md`) | real JWT auth flows | environment + configuration |
| **MRI Analyzer** | returns canned report persisted from `demo/sample_mri_report.json` | runs real MRI pipeline (requires neuro stack) | **`MRI_DEMO_MODE`** (`apps/api/fly.toml` defaults to `"1"`) |
| **Evidence DB** | API returns **503** until evidence DB exists | serves evidence from `/data/evidence.db` | `EVIDENCE_DB_PATH` + ingestion |
| **Rate limiting** | in-memory counters (single process) | should use Redis for global limits | `DEEPSYNAPS_LIMITER_REDIS_URI` (recommended) |
| **DeepTwin simulation** | on by default in dev/test | off by default in prod/staging | `DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION` |

### Evidence ingestion (real vs “empty DB”)

Fly config expects an evidence SQLite DB at `EVIDENCE_DB_PATH` on the persistent `/data` volume. Until populated, evidence routes intentionally return **503** with a message.

The Fly config comments reference one-time ingestion via SSH, and the ingestion may require secrets:

- `NCBI_API_KEY`
- `UNPAYWALL_EMAIL`
- `OPENFDA_API_KEY`

(If these aren’t set, ingestion may be partial or fail depending on adapters.)

## Migrations (alembic)

Fly runs migrations automatically during deploy via `release_command` in `apps/api/fly.toml`:

- `cd /app/apps/api && python -m alembic upgrade head`

Manual migration run (Fly):

```bash
fly ssh console --app deepsynaps-studio -C "cd /app/apps/api && python -m alembic upgrade head"
```

Local migration run (repo root, after editable install of `apps/api`):

```bash
cd apps/api
python -m alembic upgrade head
```

## Rollback playbook (doctor-ready safety net)

### API rollback (Fly)

- Roll back to a prior release using Fly’s release history.
- Validate with:
  - `GET /health` on the public URL
  - a smoke path used by the UI (e.g., evidence list, auth, etc.)
- If rollback crosses alembic migrations, prefer **forward-only** migrations; avoid “down” migrations unless a specific downgrade path exists and was tested.

### Web rollback (Netlify)

- Roll back by redeploying a previous successful build (Netlify UI / deploy history) or re-running the deploy workflow from a known-good commit.
- Validate that `index.html` is not cached (Netlify headers in `netlify.toml` set `no-cache`).

## “What is real” expectations for reviewers

- **Web**: built with `VITE_ENABLE_DEMO=1` so demo entry paths work even if API demo-login changes; most browsing and UI navigation is “real UI”.
- **API**: real FastAPI service, real persistence (SQLite on `/data` or Postgres if configured), real health checks, and real migrations.
- **MRI Analyzer**: may be **demo** (canned report) unless the MRI pipeline stack is deployed and `MRI_DEMO_MODE=0`.
- **Evidence**: may be **empty/unavailable** until evidence DB is ingested; this is expected to show as an explicit 503 rather than silent failures.

