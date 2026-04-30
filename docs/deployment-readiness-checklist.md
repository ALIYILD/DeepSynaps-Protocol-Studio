# Deployment Readiness Checklist

## Preview Deploy (Current Target)

### Web (Netlify)
- [x] `vite build` passes (2.14s, 0 errors)
- [x] 291 unit tests pass
- [x] 6 Playwright smoke tests pass
- [x] `netlify.toml` configured with SPA fallback + API proxy
- [x] `VITE_ENABLE_DEMO=1` enables offline demo login
- [x] Asset caching headers set (hashed = immutable, index.html = no-cache)
- [ ] `netlify login` completed on deploy machine

### API (Fly.io)
- [x] `fly.toml` configured (app: `deepsynaps-studio`, region: `lhr`)
- [x] Dockerfile builds (multi-stage, Python 3.11)
- [x] Health check endpoint at `/health`
- [x] AI health endpoint at `/api/v1/health/ai`
- [x] Release command runs `alembic upgrade head`
- [x] 1755 backend tests pass, 0 failures
- [ ] Required secrets set via `fly secrets set`:
  - [ ] `DEEPSYNAPS_DATABASE_URL` (PostgreSQL connection string)
  - [ ] `JWT_SECRET_KEY` (min 32 chars)
  - [ ] `DEEPSYNAPS_SECRETS_KEY` (Fernet key)
  - [ ] `DEEPSYNAPS_CORS_ORIGINS` (e.g. `https://deepsynaps-studio-preview.netlify.app`)
- [ ] Optional secrets:
  - [ ] `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (payments)
  - [ ] `SENTRY_DSN` (error tracking)
  - [ ] `WEARABLE_TOKEN_ENC_KEY` (wearable OAuth)
  - [ ] `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (AI features)
- [ ] `flyctl auth login` completed on deploy machine
- [ ] Volume `deepsynaps_data` created and mounted at `/data`

## Production Readiness (Future)

### Database
- [ ] PostgreSQL instance provisioned (recommend Fly Postgres or Supabase)
- [ ] Alembic migration chain verified end-to-end on PostgreSQL
- [ ] `pgvector` extension enabled for MedRAG dense retrieval
- [ ] Backup schedule configured

### Security
- [x] Demo tokens only honored in `development` / `test` environments
- [x] Cross-clinic ownership gate enforced on all patient-scoped endpoints
- [x] No secrets in health endpoint responses (verified by tests)
- [ ] Rate limiting configured on auth endpoints
- [ ] HTTPS enforced (Fly.io: `force_https = true`)
- [ ] CORS origins restricted to known frontend domains

### AI Features
- [x] AI health endpoint reports truthful per-feature status
- [x] All features degrade gracefully when dependencies are missing
- [x] Frontend labels honest about rule-based vs real AI
- [ ] LLM API keys provisioned for copilot/interpreter features
- [ ] MedRAG paper embeddings populated (`scripts/embed_papers.py`)
- [ ] Model weights deployed for brain-age CNN, LaBraM, etc.

### Monitoring
- [ ] Sentry DSN configured for backend error tracking
- [ ] Structured logging to stdout (already implemented)
- [ ] `/health` and `/api/v1/health/ai` monitored by uptime service
- [ ] SSE reconnect behavior verified under machine sleep/wake

### CI/CD
- [ ] GitHub Actions workflow for `pytest` on PR
- [ ] GitHub Actions workflow for `npm run build && npm run test:unit` on PR
- [ ] Playwright tests in CI (headless Chromium)
- [ ] Auto-deploy to Fly.io on merge to `main`
- [ ] Auto-deploy to Netlify on merge to `main`

## Quick Deploy Commands

```bash
# Preview web (Netlify)
bash scripts/deploy-preview.sh

# Preview API (Fly.io)
bash scripts/deploy-preview.sh --api

# Both
bash scripts/deploy-preview.sh --api
```
