# DeepSynaps Protocol Studio — Deployment Runbook

## Document Information

| Field            | Value                                    |
|------------------|------------------------------------------|
| **Version**      | 1.0.0                                    |
| **Last Updated** | 2025-01-15                               |
| **Owner**        | Platform Engineering Team                |
| **Classification** | Internal — Clinical Systems              |
| **Review Cycle** | Quarterly                                |

## Purpose

This runbook provides step-by-step procedures for deploying the DeepSynaps Protocol Studio — a clinical neuromodulation platform with 130+ FastAPI routers serving patient data. All procedures are designed to maintain **zero downtime**, **clinical data integrity**, and **HIPAA compliance**.

## Prerequisites

### Required Access

- [ ] Fly.io account with `deepsynaps-studio` organization access
- [ ] GitHub repository write access
- [ ] Slack `#deployments` channel access (for notifications)
- [ ] Database migration review privileges (for production)

### Required Tools

| Tool      | Version | Verification Command       |
|-----------|---------|----------------------------|
| `flyctl`  | latest  | `flyctl version`           |
| `docker`  | 24.x+   | `docker --version`         |
| `curl`    | 7.x+    | `curl --version`           |
| `jq`      | 1.6+    | `jq --version`             |
| `openssl` | 1.1.x+  | `openssl version`          |

### Environment Variables

```bash
export FLY_ACCESS_TOKEN="<your-fly-token>"        # Required
export SLACK_WEBHOOK="<your-slack-webhook>"        # Optional (notifications)
```

> **HIPAA Reminder**: Never commit tokens to the repository. Use `fly secrets` or GitHub Secrets.

---

## Deployment Methods

### Method 1: Automated GitHub Actions Deployment (Recommended)

The preferred deployment method uses the blue-green deployment pipeline defined in `.github/workflows/deploy-blue-green.yml`.

#### Automatic Deployment

Deployments are triggered automatically when CI and Coverage workflows pass on the `main` branch:

```
Push to main → CI passes → Coverage passes → Blue-Green Deploy
```

#### Manual Deployment via workflow_dispatch

1. Navigate to **Actions > Deploy (Blue-Green)** in GitHub
2. Click **Run workflow**
3. Configure parameters:
   - **Environment**: `staging` or `production`
   - **Skip tests**: Only in emergencies (not recommended)
   - **Keep blue hours**: Hours to retain rollback environment (default: 24)
4. Click **Run workflow**

```yaml
# Example: Deploy to staging with custom retention
Environment: staging
Skip tests: false
Keep blue hours: 48
```

#### Monitor Deployment

1. Open the GitHub Actions run page
2. Watch the job progress:
   - **Pre-deploy checks** — Validates environment and secrets
   - **Build image** — Builds and tags Docker image
   - **Deploy green** — Deploys to secondary environment
   - **Smoke test green** — Runs health and route verification
   - **Switch traffic** — Promotes green to live
   - **Post-deploy verify** — Final validation
3. Verify Slack notification in `#deployments`

---

### Method 2: Local Script Deployment

Use the `deploy-blue-green.sh` script for direct deployment from your machine.

#### Step 1: Pre-Deployment Validation

```bash
# Validate the deployment environment
./scripts/deployment-checklist.sh pre staging
```

Expected output:
```
=== PRE-DEPLOYMENT CHECKLIST ===
[PASS]  flyctl CLI is installed
[PASS]  Fly.io authentication is active
[PASS]  App 'deepsynaps-studio-staging' exists and is accessible
[PASS]  Required secret 'DEEPSYNAPS_DATABASE_URL' is configured
[PASS]  Required secret 'JWT_SECRET_KEY' is configured
[PASS]  Required secret 'DEEPSYNAPS_SECRETS_KEY' is configured
[PASS]  SSL certificate valid for 85 day(s)
```

#### Step 2: Dry Run (Recommended)

```bash
# Simulate the deployment without making changes
./scripts/deploy-blue-green.sh staging --dry-run
```

This validates the entire pipeline without modifying any infrastructure.

#### Step 3: Execute Deployment

```bash
# Deploy to staging
./scripts/deploy-blue-green.sh staging

# Deploy to production
./scripts/deploy-blue-green.sh production

# Deploy with extended retention
./scripts/deploy-blue-green.sh production --keep-hours 72
```

#### Step 4: Post-Deployment Verification

```bash
# Run post-deployment checks
./scripts/deployment-checklist.sh post staging
```

---

### Method 3: Emergency Direct Deployment

> **⚠️ WARNING**: Use only when the automated pipeline is unavailable and patient care systems are affected.

```bash
# Deploy directly to the live app (no blue-green)
flyctl deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
    --remote-only --yes --strategy immediate

# Verify health
curl -fsS https://deepsynaps-studio.fly.dev/health
```

**After emergency deploy**:
1. Document the emergency in the incident log
2. Review why the automated pipeline was not used
3. Update the deployment runbook if gaps were identified

---

## Deployment Architecture

### Blue-Green Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Traffic Router                           │
│              (Fly.io Load Balancer)                          │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
    ┌─────────▼─────────┐          ┌─────────▼─────────┐
    │     BLUE (live)   │          │    GREEN (new)    │
    │  deepsynaps-studio│◄────────►│ deepsynaps-studio-│
    │                   │          │      green         │
    │  Serving traffic  │          │  Deploy & test     │
    │  Previous version │          │  New version       │
    └───────────────────┘          └───────────────────┘
```

### Deployment Flow

```
Phase 1: Pre-deploy checks
    ├── Validate Fly CLI and auth
    ├── Verify app configuration
    ├── Check SSL certificate
    └── Confirm secrets are set

Phase 2: Build
    ├── Build Docker image
    ├── Tag with git SHA + timestamp
    └── Run container smoke test

Phase 3: Deploy Green
    ├── Create/update green app
    ├── Deploy new image
    └── Wait for health checks

Phase 4: Smoke Test Green
    ├── Test /health endpoint
    ├── Test critical API routes
    ├── Verify response times
    └── Check security headers

Phase 5: Switch Traffic
    ├── Deploy same image to blue
    ├── Blue picks up new version
    └── Verify blue health

Phase 6: Post-deploy verify
    ├── Health endpoint check
    ├── Critical route validation
    ├── SSL verification
    └── Log stream check

Phase 7: Cleanup
    ├── Keep green for 24h (rollback)
    └── Notify team via Slack
```

---

## Pre-Deployment Checklist

### For Staging

- [ ] Feature branch has passed CI (tests, lint, typecheck)
- [ ] Code review has been completed and approved
- [ ] Database migrations (if any) have been reviewed
- [ ] `deployment-checklist.sh pre staging` passes
- [ ] No uncommitted secrets in the working directory
- [ ] `git status` shows clean working tree at the target commit

### For Production

- [ ] **ALL staging checks above** have passed
- [ ] Staging deployment has been verified and stable for ≥ 24 hours
- [ ] Database migration has been tested against a production-like dataset
- [ ] Rollback plan has been reviewed and documented
- [ ] On-call engineer has been notified
- [ ] Deployment window is within approved maintenance hours (if applicable)
- [ ] `deployment-checklist.sh pre production` passes
- [ ] Patient data backup has been verified within the last 24 hours
- [ ] Clinical team has been notified of the deployment window

---

## Post-Deployment Checklist

### Immediate (0-5 minutes)

- [ ] `deployment-checklist.sh post <env>` passes
- [ ] Health endpoint returns 200 OK
- [ ] Response time is < 5 seconds
- [ ] No critical errors in application logs
- [ ] SSL certificate is valid

### Short-term (5-30 minutes)

- [ ] Critical user workflows are functional
- [ ] Patient data endpoints respond correctly (verify with test queries)
- [ ] Background workers (qEEG, Stripe) are processing jobs
- [ ] No alerts in Sentry or error monitoring
- [ ] Database connection pool is healthy

### Long-term (1-24 hours)

- [ ] Error rates remain at baseline
- [ ] CPU and memory usage are within normal ranges
- [ ] No customer-reported issues
- [ ] Green environment is ready for cleanup (after 24h retention)

---

## Database Migrations

### Migration Policy

> **CRITICAL**: All database migrations must be **backward-compatible** with the previous application version. This allows rollback without database reversion.

### Migration Checklist

- [ ] Migration has been tested on a copy of production data
- [ ] Migration is backward-compatible (additive changes only)
- [ ] Migration rollback script has been prepared
- [ ] Database backup exists before migration runs
- [ ] Migration duration has been estimated for production data volume

### Running Migrations

Migrations run automatically during deployment via the `release_command` in `fly.toml`:

```toml
[deploy]
release_command = "sh -c 'cd /app/apps/api && python -m alembic upgrade head'"
```

**To check migration status**:

```bash
flyctl ssh console --app deepsynaps-studio -C \
    'cd /app/apps/api && python -m alembic current'
```

**To view migration history**:

```bash
flyctl ssh console --app deepsynaps-studio -C \
    'cd /app/apps/api && python -m alembic history'
```

---

## Environment Configuration

### Staging

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Blue App        | `deepsynaps-studio-staging`          |
| Green App       | `deepsynaps-studio-staging-green`    |
| Region          | `lhr`                                |
| URL             | https://deepsynaps-studio-staging.fly.dev |

### Production

| Parameter       | Value                                |
|-----------------|--------------------------------------|
| Blue App        | `deepsynaps-studio`                  |
| Green App       | `deepsynaps-studio-green`            |
| Region          | `lhr`                                |
| URL             | https://deepsynaps-studio.fly.dev    |

---

## Troubleshooting

### Deployment Fails at Green Deploy

**Symptom**: Green deployment step fails with Fly error.

**Steps**:
1. Check Fly status: `flyctl status --app deepsynaps-studio-green`
2. View logs: `flyctl logs --app deepsynaps-studio-green`
3. Common causes:
   - Docker build failure → Check Dockerfile syntax
   - Insufficient memory → VM may need more RAM
   - Secret missing → Verify all secrets are set
4. Blue app continues serving — no patient impact

### Smoke Tests Fail After Traffic Switch

**Symptom**: Health endpoint or critical routes fail after switching traffic.

**Steps**:
1. Check if rollback is needed (see Rollback Runbook)
2. Verify the issue: `curl -v https://deepsynaps-studio.fly.dev/health`
3. Check application logs: `flyctl logs --app deepsynaps-studio`
4. The previous version is still running on green for rapid rollback

### Database Migration Fails

**Symptom**: Release command (Alembic migration) fails.

**Steps**:
1. The deployment will fail before traffic is switched
2. Check migration error in Fly logs
3. Fix the migration or revert the migration commit
4. Re-run deployment

### SSL Certificate Issues

**Symptom**: SSL certificate expiry warning or invalid certificate.

**Steps**:
1. Fly.io manages SSL automatically via Let's Encrypt
2. Verify domain configuration: `flyctl certs show --app deepsynaps-studio`
3. If auto-renewal fails, create a new certificate

---

## Contact & Escalation

| Role              | Contact Method                        |
|-------------------|---------------------------------------|
| Platform Engineer | `#platform-support` Slack             |
| On-Call Engineer  | PagerDuty rotation                    |
| Clinical Lead     | `#clinical-systems` Slack             |
| Security Team     | `#security` Slack or security@deepsynaps.io |

---

## Related Documents

- [Rollback Runbook](./rollback-runbook.md)
- [Security Scan Workflow](../../.github/workflows/security-scan.yml)
- [Blue-Green Deploy Script](../../scripts/deploy-blue-green.sh)
- [Deployment Checklist Script](../../scripts/deployment-checklist.sh)
- [Fly.io Configuration](../../../apps/api/fly.toml)
- [HIPAA Compliance Policy](../../../docs/compliance/)

---

## Change Log

| Date       | Version | Author | Changes                                  |
|------------|---------|--------|------------------------------------------|
| 2025-01-15 | 1.0.0   | Platform Eng | Initial runbook creation              |
