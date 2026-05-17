# Hermes Deployment Agent — DeepSynaps Protocol Studio

## Mission
Deploy DeepSynaps Protocol Studio to production on Fly.io + Netlify with all safety gates, critical fixes, and verification steps.

## Repository
```
https://github.com/ALIYILD/DeepSynaps-Protocol-Studio.git
Branch: main
Local path: /mnt/agents/DeepSynaps-Protocol-Studio
```

## Prerequisites (verify before starting)
- [ ] `flyctl` installed and authenticated (`fly auth login`)
- [ ] `git` installed
- [ ] Repository cloned at `/mnt/agents/DeepSynaps-Protocol-Studio`
- [ ] Fly.io app `deepsynaps-studio` exists (create if not: `fly apps create deepsynaps-studio`)
- [ ] Fly.io volume `deepsynaps_data` exists (create if not: `fly volumes create deepsynaps_data --region lhr --size 1 --app deepsynaps-studio`)
- [ ] Fly Postgres `deepsynaps-db` attached (attach if not: `fly postgres attach --app deepsynaps-studio deepsynaps-db`)
- [ ] All required secrets set (see Secrets section below)

## Phase 1 — Pre-Deploy Safety Verification (MANDATORY)

Run the boundary verification script. If ANY check fails, STOP and report:

```bash
cd /mnt/agents/DeepSynaps-Protocol-Studio
python3 scripts/verify_demo_boundary.py
```

**Expected output**: `10/10 checks passed` and exit code 0.
**If failed**: Do NOT proceed. Report which checks failed.

### Critical Safety Gates (manual verification)

```bash
# Gate 1: MRI_DEMO_MODE must be "0"
grep 'MRI_DEMO_MODE' apps/api/fly.toml
# EXPECTED: MRI_DEMO_MODE = "0"
# IF "1": STOP — edit fly.toml and set to "0"

# Gate 2: demo_seed_enabled must have environment guard
grep -A5 'def demo_seed_enabled' apps/api/app/services/demo_clinic_seed.py
# EXPECTED: app_env check BEFORE env var check

# Gate 3: Production safety guard in main.py
grep -B2 -A8 'PRODUCTION SAFETY' apps/api/app/main.py
# EXPECTED: guard blocking demo seed in production

# Gate 4: No hardcoded secrets
grep -rni 'sk_live\|sk_test\|password.*=' apps/api/app/ --include='*.py' | grep -v 'env\|getenv\|settings\|config' | grep -v 'password_hash\|password_reset'
# EXPECTED: Empty (no hardcoded secrets)
```

## Phase 2 — Database Migrations (Staging Clone First)

```bash
# Step 1: Create staging backup
fly postgres backup create --app deepsynaps-db

# Step 2: Test migrations on a clone (if possible)
# OR test locally first:
cd /mnt/agents/DeepSynaps-Protocol-Studio/apps/api
python -m alembic current  # check current revision
python -m alembic upgrade head --sql > /tmp/migration_preview.sql  # preview

# Step 3: If preview looks safe, deploy migrations
# (Migrations run automatically via fly.toml release_command)
```

## Phase 3 — Deploy API (Fly.io)

```bash
cd /mnt/agents/DeepSynaps-Protocol-Studio

# Deploy with the canonical fly.toml
fly deploy \
  --config apps/api/fly.toml \
  --dockerfile apps/api/Dockerfile \
  --app deepsynaps-studio \
  --build-arg VITE_API_BASE_URL=""

# Monitor deploy
fly status --app deepsynaps-studio
fly logs --app deepsynaps-studio

# Verify deploy succeeded
DEPLOY_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://deepsynaps-studio.fly.dev/health)
if [ "$DEPLOY_HEALTH" != "200" ]; then
  echo "DEPLOY FAILED: /health returned $DEPLOY_HEALTH"
  echo "Initiating rollback..."
  # See Phase 6 for rollback
  exit 1
fi
```

## Phase 4 — Deploy Frontend (Netlify)

```bash
cd /mnt/agents/DeepSynaps-Protocol-Studio

# Build frontend
npm install --no-audit --no-fund
npm run build:web

# Deploy to Netlify
netlify deploy --prod --dir=apps/web/dist --site=deepsynaps-studio-preview

# Verify
FRONTEND_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" https://deepsynaps-studio-preview.netlify.app/)
if [ "$FRONTEND_HEALTH" != "200" ]; then
  echo "FRONTEND DEPLOY ISSUE: returned $FRONTEND_HEALTH"
  # Frontend issues are non-blocking for API
fi
```

## Phase 5 — Post-Deploy Verification (MANDATORY)

Run ALL checks. If ANY fail, consider rollback:

```bash
#!/bin/bash
echo "=== POST-DEPLOY VERIFICATION ==="

BASE_URL="https://deepsynaps-studio.fly.dev"
FAILS=0

check() {
  local name=$1
  local cmd=$2
  local expected=$3
  result=$(eval "$cmd")
  if [ "$result" = "$expected" ]; then
    echo "  ✓ $name"
  else
    echo "  ✗ $name (got: $result, expected: $expected)"
    FAILS=$((FAILS+1))
  fi
}

# Health endpoints
check "Basic health" "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/health" "200"
check "API spec" "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/api/v1/openapi.json" "200"

# Knowledge layer
check "Knowledge status" "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/api/v1/knowledge/status" "200"

# MRI demo mode verification (CRITICAL)
MRI_DEMO_RESPONSE=$(curl -s $BASE_URL/api/v1/mri/analyze -X POST -H "Content-Type: application/json" -d '{"dummy":"test"}' | grep -o '"demo"[^,}]*' | head -1)
if echo "$MRI_DEMO_RESPONSE" | grep -q 'true'; then
  echo "  ✗ CRITICAL: MRI endpoint returning demo data in production!"
  FAILS=$((FAILS+1))
else
  echo "  ✓ MRI not returning demo data"
fi

# Workers (check via status)
check "Worker health" "curl -s -o /dev/null -w '%{http_code}' $BASE_URL/api/v1/workers/status" "200"

# Database
check "DB connectivity" "curl -s $BASE_URL/health | grep -o '"database"[^,}]*'" "\"database\": \"ok\""

echo ""
echo "=== RESULT: $FAILS failures ==="
if [ $FAILS -gt 0 ]; then
  echo "DEPLOYMENT HAS ISSUES. Review failures above."
  exit 1
else
  echo "ALL CHECKS PASSED. Deployment successful."
  exit 0
fi
```

## Phase 6 — Rollback (if needed)

If ANY verification fails:

```bash
# Step 1: Identify bad release
fly releases list --app deepsynaps-studio

# Step 2: Roll back to previous release
PREVIOUS_VERSION=$(fly releases list --app deepsynaps-studio --json | jq -r '.[1].Version')
fly deploy --image registry.fly.io/deepsynaps-studio:$PREVIOUS_VERSION --app deepsynaps-studio

# Step 3: Verify rollback
sleep 30
curl -s -o /dev/null -w "%{http_code}" https://deepsynaps-studio.fly.dev/health
# EXPECTED: 200

# Step 4: If DB migration was bad, downgrade
cd /mnt/agents/DeepSynaps-Protocol-Studio/apps/api
python -m alembic downgrade -1

# Step 5: Notify
# Log the incident with release version and failure reason
```

## Secrets Required

Set these BEFORE deploying:

```bash
fly secrets set --app deepsynaps-studio \
  DEEPSYNAPS_DATABASE_URL="postgres://..." \
  JWT_SECRET_KEY="$(openssl rand -hex 32)" \
  DEEPSYNAPS_SECRETS_KEY="$(openssl rand -hex 16 | xxd -r -p | base64)" \
  DEEPSYNAPS_CORS_ORIGINS="https://deepsynaps-studio-preview.netlify.app" \
  STRIPE_SECRET_KEY="sk_live_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  CELERY_BROKER_URL="redis://default:...@... .upstash.io" \
  WEARABLE_TOKEN_ENC_KEY="..."
```

## Expected Duration

| Phase | Estimated Time |
|-------|---------------|
| Phase 1: Safety verification | 2 minutes |
| Phase 2: DB migrations | 3 minutes |
| Phase 3: API deploy | 5-8 minutes |
| Phase 4: Frontend deploy | 3 minutes |
| Phase 5: Verification | 2 minutes |
| **Total** | **15-20 minutes** |

## Success Criteria

- [ ] `verify_demo_boundary.py` passes (10/10)
- [ ] `/health` returns 200
- [ ] `/api/v1/openapi.json` accessible
- [ ] MRI endpoint does NOT return demo data
- [ ] Workers running (status shows healthy)
- [ ] Frontend loads without errors
- [ ] Zero critical alerts in first 5 minutes

## Abort Conditions

STOP and roll back if:
- Safety verification script fails
- `/health` does not return 200 within 2 minutes of deploy
- MRI endpoint returns `demo: true`
- 500 errors > 5% in first 5 minutes
- Database connection failures
- Any P0 alert fires

## Output Format

Report results as:
```
HERMES DEPLOY REPORT
====================
Phase 1 (Safety): PASS/FAIL — details
Phase 2 (Migrations): PASS/FAIL — details
Phase 3 (API Deploy): PASS/FAIL — version, duration
Phase 4 (Frontend): PASS/FAIL — details
Phase 5 (Verification): X/Y checks passed
Phase 6 (Rollback): N/A or EXECUTED — reason

FINAL STATUS: SUCCESS / ROLLED_BACK / FAILED
Duration: X minutes
API Version: vX.X.X
Frontend Version: commit SHA
Issues Found: [list or "none"]
```
