# Release Process Definition — DeepSynaps Protocol Studio

> **Classification:** Engineering Process Document  
> **Owner:** Engineering Lead + SRE Lead  
> **Review Cycle:** Per release; Quarterly process review  
> **Last Updated:** 2026-05-14

---

## Table of Contents

1. [Release Types](#1-release-types)
2. [Release Checklist](#2-release-checklist)
3. [Staging Validation Procedures](#3-staging-validation-procedures)
4. [Production Deployment Steps](#4-production-deployment-steps)
5. [Post-Release Verification](#5-post-release-verification)
6. [Feature Flag Management](#6-feature-flag-management)
7. [Rollback Procedures](#7-rollback-procedures)

---

## 1. Release Types

### 1.1 Release Classification

| Type | Version Format | Description | Approval | Testing Required |
|------|---------------|-------------|----------|-----------------|
| **Major** | `X.0.0` | Breaking changes, architectural shifts, new subsystems | Eng Lead + Product Lead | Full regression |
| **Minor** | `x.Y.0` | New features, significant enhancements | Team Lead | Feature + smoke tests |
| **Patch** | `x.y.Z` | Bug fixes, security patches, small improvements | Team Lead | Smoke tests |
| **Hotfix** | `x.y.Z+1` | Critical production fix (emergency) | SRE Lead (verbal) | Smoke tests + targeted verification |

### 1.2 Release Cadence

| Type | Target Frequency | Notes |
|------|-----------------|-------|
| Major | Every 3-6 months | Coordinate with product roadmap |
| Minor | Every 2-4 weeks | Sprint-aligned |
| Patch | As needed | Typically 1-2 per week |
| Hotfix | Emergency only | Same-day deployment |

### 1.3 Release Schedule

Standard releases deploy on:
- **Tuesday-Thursday, 10:00-14:00 UTC**
- Avoid: Monday (week start), Friday (weekend risk), weekends
- No releases during blackout periods (conferences, high-traffic events)

---

## 2. Release Checklist

### 2.1 Pre-Release Checklist

Complete all items before any deployment:

- [ ] **Version updated** in relevant files (`pyproject.toml`, `package.json`, etc.)
- [ ] **CHANGELOG.md** updated with release notes
- [ ] **All tests passing**:
  ```bash
  cd apps/api && pytest -x -q
  cd apps/web && npm run typecheck && npm run test
  ```
- [ ] **Frontend build passing**:
  ```bash
  cd apps/web && npm run build
  ```
- [ ] **No uncommitted changes** in release branch:
  ```bash
  git status
  ```
- [ ] **Branch merged** to `main`:
  ```bash
  git log --oneline -5
  ```
- [ ] **Database migrations reviewed** (if applicable):
  ```bash
  ls apps/api/alembic/versions/
  # Verify migrations are reversible: check for downgrade() implementation
  ```
- [ ] **Feature flags configured** for production (see Section 6)
- [ ] **Rollback plan documented** (previous release image identified)
- [ ] **Change request approved** (see [Change Management](./change-management.md))

### 2.2 Release Notes Template

```markdown
## Release [X.Y.Z] — [YYYY-MM-DD]

### Summary
[One-paragraph description of the release]

### Changes
- [Feature/Fix] Description (#PR)
- [Feature/Fix] Description (#PR)

### Database Migrations
- [ ] No migrations
- [ ] Migrations included (reversible: yes/no)

### Feature Flags
- [ ] No new flags
- [ ] Flags: [list new flags and default values]

### Breaking Changes
- [ ] None
- [ ] [Description and migration path]

### Deployment Notes
- [Special instructions for this release]

### Rollback
- Previous release: [X.Y.Z-1]
- Rollback procedure: [link or brief description]
```

---

## 3. Staging Validation Procedures

### 3.1 Staging Environment

| Component | Staging Config |
|-----------|---------------|
| **API** | `deepsynaps-studio-staging.fly.dev` (to be provisioned) |
| **Database** | Separate SQLite file or staging PostgreSQL |
| **Workers** | Same as production (reduced count) |
| **CORS** | Staging frontend only |

### 3.2 Staging Deployment

```bash
# 1. Deploy to staging
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
  --app deepsynaps-studio-staging

# 2. Verify deployment
fly status --app deepsynaps-studio-staging
curl -s https://deepsynaps-studio-staging.fly.dev/health | jq .
```

### 3.3 Staging Validation Checklist

- [ ] **Health check passes**:
  ```bash
  curl -s https://staging-url/health | jq .
  ```
- [ ] **Authentication works** (all role types):
  ```bash
  # Guest
  curl -s staging-url/api/v1/registries/conditions \
    -H "Authorization: Bearer guest-demo-token" | jq . | head -5
  # Clinician
  curl -s staging-url/api/v1/registries/conditions \
    -H "Authorization: Bearer clinician-demo-token" | jq . | head -5
  # Admin
  curl -s staging-url/api/v1/registries/conditions \
    -H "Authorization: Bearer admin-demo-token" | jq . | head -5
  ```
- [ ] **Key user journeys verified**:
  - Patient lookup and viewing
  - Protocol generation
  - qEEG analysis submission and retrieval
  - Report generation
  - Media upload
- [ ] **Smoke test passes**:
  ```bash
  uv run python scripts/qeeg_deploy_smoke.py \
    --base-url https://staging-url \
    --token "$CLINICIAN_BEARER_TOKEN" \
    --require-pdf
  ```
- [ ] **No new errors in logs**:
  ```bash
  fly logs --app deepsynaps-studio-staging --recent | grep -i "error\|exception" | wc -l
  # Should be 0 or baseline level
  ```
- [ ] **Performance within baseline**:
  ```bash
  curl -w "\nTotal: %{time_total}s\n" -s -o /dev/null https://staging-url/health
  # Should be < 50ms
  ```

### 3.4 Staging Sign-Off

```markdown
## Staging Sign-Off: [Version X.Y.Z]

**Date:** [YYYY-MM-DD]
**Tester:** [Name]

- [ ] Health check: PASS
- [ ] Auth (all roles): PASS
- [ ] User journeys: PASS
- [ ] Smoke test: PASS
- [ ] No new errors: PASS
- [ ] Performance baseline: PASS

**Approved for production:** [YES/NO]
**Notes:** [any concerns or observations]
```

---

## 4. Production Deployment Steps

### 4.1 Deployment Preparation (T-30 min)

```bash
# 1. Verify on-call engineer is available
#    Confirm in #oncall Slack channel

# 2. Verify no active incidents
fly status --app deepsynaps-studio
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# 3. Verify backup completed
fly ssh console --app deepsynaps-studio -C "ls -la /data/backups/"

# 4. Identify rollback target (previous release)
fly releases list --app deepsynaps-studio | head -3

# 5. Create deployment announcement in #deployments
```

### 4.2 Deployment Announcement

```
:rocket: **Production Deployment Starting** :rocket:

**Version:** [X.Y.Z]
**Deployer:** @engineer-name
**Time:** [HH:MM UTC]
**Expected duration:** ~5 minutes
**Rollback target:** [X.Y.Z-1]
**Change list:** [link to CHANGELOG or PR list]

Monitoring: https://deepsynaps-studio.fly.dev/health
```

### 4.3 Production Deployment (Step-by-Step)

```bash
# Step 1: Deploy with Fly.io
# Fly.io performs:
#   a. Build new Docker image
#   b. Run release_command (alembic upgrade head)
#   c. Start new machines
#   d. Route traffic to new machines
#   e. Stop old machines

fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
  --app deepsynaps-studio

# Step 2: Monitor deployment
# Watch deployment progress
fly status --app deepsynaps-studio

# Step 3: Verify health (wait 30 seconds for startup)
sleep 30
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# Step 4: Check logs for errors
fly logs --app deepsynaps-studio --recent | grep -i "error\|exception" | head -10

# Step 5: Verify release in releases list
fly releases list --app deepsynaps-studio | head -3
```

### 4.4 Post-Deployment Verification (within 5 minutes)

```bash
# 1. Run production smoke test
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf

# Expected output:
# - execution_mode: celery
# - analysis_status: completed
# - report_html_generated: true
# - report_pdf_generated: true

# 2. Verify key endpoints respond
curl -s https://deepsynaps-studio.fly.dev/health | jq .
curl -s https://deepsynaps-studio.fly.dev/api/v1/registries/conditions \
  -H "Authorization: Bearer clinician-demo-token" | jq . | head -5

# 3. Check worker status
fly logs --app deepsynaps-studio --recent | grep -i "celery\|worker" | tail -10

# 4. Verify no critical Sentry errors
# Check Sentry dashboard for new errors in the last 10 minutes
```

### 4.5 Post-Deployment Announcement

```
:white_check_mark: **Deployment Complete: [X.Y.Z]** :white_check_mark:

**Duration:** [N minutes]
**Status:** SUCCESSFUL

**Verification:**
- Health check: PASS
- Smoke test: PASS
- Workers active: [yes/no]
- Sentry: [clean/N new issues]

**Monitoring for 30 minutes.** Will report any issues.
```

### 4.6 Deployment Monitoring (30-minute window)

Stay alert for 30 minutes post-deployment:

- [ ] No PagerDuty alerts
- [ ] No new Sentry errors
- [ ] P95 latency within SLA
- [ ] Error rate within SLA
- [ ] Worker queue processing normally
- [ ] No customer complaints

If any issues arise during this window, consider rollback (Section 7).

---

## 5. Post-Release Verification

### 5.1 Verification Timeline

| Timeframe | Checks |
|-----------|--------|
| T+5 min | Health, smoke test, Sentry check |
| T+30 min | Latency, error rate, queue depth |
| T+4 hours | Full metrics review, customer feedback |
| T+24 hours | Daily SLA report, complete validation |
| T+1 week | Weekly metrics comparison, feature adoption |

### 5.2 Post-Release Metrics

```bash
# Collect pre-release metrics for comparison
echo "=== Post-Release Metrics ==="
echo "Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Health
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# Latency sample
for i in {1..5}; do
  curl -w "%{time_total}s\n" -s -o /dev/null https://deepsynaps-studio.fly.dev/health
done

# Check Fly.io status
fly status --app deepsynaps-studio

# Check recent errors
fly logs --app deepsynaps-studio --recent | grep -ci "error\|exception"
```

### 5.3 Release Retrospective (Minor/Major releases)

Within 1 week of a Minor or Major release:

- [ ] Did the release go smoothly?
- [ ] Were there any issues not caught in staging?
- [ ] Did any features require post-release tuning?
- [ ] Were there any customer-impacting issues?
- [ ] Lessons learned for next release?
- [ ] Any process improvements needed?

---

## 6. Feature Flag Management

### 6.1 Feature Flag Strategy

Feature flags are implemented via environment variables and checked at runtime. This allows gradual rollout and quick disable without deployment.

### 6.2 Current Feature Flags

| Flag | Variable | Default | Description |
|------|----------|---------|-------------|
| MRI Demo Mode | `MRI_DEMO_MODE` | `1` | Use canned MRI report vs. real pipeline |
| DeepTwin Simulation | `DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION` | `0` (prod) | Enable simulated DeepTwin outputs |
| qEEG Unevidenced Indicators | `DEEPSYNAPS_QEEG_UNEVIDENCED_INDICATORS` | `0` | Surface alpha_reactivity, brain_balance, ai_brain_age |
| Voice Warmup | `DEEPSYNAPS_VOICE_WARMUP` | `1` | Pre-load Whisper model on startup |

### 6.3 Feature Flag Operations

```bash
# Enable a feature flag
fly secrets set FEATURE_FLAG_NAME=1 --app deepsynaps-studio

# Disable a feature flag
fly secrets set FEATURE_FLAG_NAME=0 --app deepsynaps-studio

# Check current value (note: secrets are encrypted, use logs for verification)
fly logs --app deepsynaps-studio | grep -i "feature\|flag\|enabled\|disabled" | tail -10
```

### 6.4 Feature Flag Best Practices

- [ ] Every new feature should be behind a flag for the first release
- [ ] Flags should have clear default values for production
- [ ] Flags should be documented in release notes
- [ ] Flags should be removed after feature is stable (within 2 releases)
- [ ] Flag changes should be logged and auditable

---

## 7. Rollback Procedures

### 7.1 When to Rollback

Initiate rollback if ANY of the following occur within 30 minutes of deployment:

- [ ] `/health` endpoint fails for >2 minutes
- [ ] Error rate exceeds 1%
- [ ] P95 latency exceeds 1000ms
- [ ] Smoke test fails
- [ ] Critical Sentry errors appear
- [ ] Customer-impacting issues reported
- [ ] Worker processes fail to start

### 7.2 Rollback Steps

```bash
# Step 1: Announce rollback in #deployments
# "Initiating rollback from [X.Y.Z] to [X.Y.Z-1] due to [reason]"

# Step 2: Identify previous release image
fly releases list --app deepsynaps-studio --image | head -5
# Note the image reference for the previous release

# Step 3: Deploy previous image
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
  --app deepsynaps-studio \
  --image <previous-image-ref>

# Alternative: Use fly deploy rollback (if supported for your app)
# fly deploy --config apps/api/fly.toml --app deepsynaps-studio \
#   --strategy immediate --image <previous-image>

# Step 4: Verify rollback
sleep 30
fly status --app deepsynaps-studio
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# Step 5: Run smoke test
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf

# Step 6: Check for DB migration issues
# If the new release included forward migrations, they may have already run.
# Check if data is compatible with the old code:
fly logs --app deepsynaps-studio --recent | grep -i "migration\|alembic\|error" | head -10

# Step 7: Announce completion
# "Rollback complete. [X.Y.Z-1] is now live. Investigating [X.Y.Z] issues."
```

### 7.3 Rollback with Database Migrations

⚠️ **CAUTION:** Database migrations complicate rollback.

**If forward migration is reversible:**
```bash
# Downgrade database
fly ssh console --app deepsynaps-studio -C \
  "cd /app/apps/api && python -m alembic downgrade -1"
```

**If forward migration is NOT reversible:**
1. Do NOT downgrade the database
2. The old code must be compatible with the new schema
3. If not compatible, a patch fix-forward is required instead of rollback
4. This should be tested during staging validation

**Prevention:**
- All migrations MUST have a `downgrade()` function
- Test migration reversibility in staging before production deploy
- For breaking schema changes, use multi-phase migrations:
  1. Phase 1: Add new columns/tables (backward-compatible)
  2. Phase 2: Update code to use new schema
  3. Phase 3: Remove old columns/tables (after code is stable)

### 7.4 Rollback Communication

```
:arrow_backward: **ROLLBACK COMPLETE** :arrow_backward:

**Rolled back:** [X.Y.Z] → [X.Y.Z-1]
**Reason:** [brief description]
**Time:** [HH:MM UTC]
**Duration:** [N minutes]

**Current Status:**
- Health check: PASS
- Smoke test: PASS
- Workers: ACTIVE

**Next Steps:**
- [Investigate issue / Fix-forward planned / etc.]

Incident channel: #inc-[YYYYMMDD]-[name] (if created)
```

---

## Quick Reference

```
RELEASE WORKFLOW
---------------
1. Pre-release checks (checklist)
2. Stage to staging + validate
3. Production deploy (fly deploy)
4. Smoke test + verify
5. Monitor for 30 minutes
6. Post-release verification (24h)

EMERGENCY HOTFIX
---------------
1. Fix on branch
2. Test locally
3. Deploy directly (bypass staging for speed)
4. Smoke test immediately
5. Full validation after
6. Retrospective within 24h

ROLLBACK
--------
1. Announce in #deployments
2. fly deploy --image <previous>
3. Verify health + smoke test
4. Handle DB migration if needed
5. Announce completion

KEY COMMANDS
------------
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
fly releases list --app deepsynaps-studio
fly status --app deepsynaps-studio
uv run python scripts/qeeg_deploy_smoke.py --base-url ... --token ... --require-pdf
curl -s https://deepsynaps-studio.fly.dev/health | jq .
```

---

## Cross-References

- [Change Management](./change-management.md) — Change request and approval process
- [Incident Response Runbook](../runbooks/incident-response.md) — Emergency procedures
- [On-Call Playbook](../runbooks/oncall-playbook.md) — Operational support during releases
- [SLA Definition](./sla-definition.md) — Service level targets
- [Capacity Planning Guide](../runbooks/capacity-planning.md) — Resource planning for releases
