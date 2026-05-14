# Change Management Process — DeepSynaps Protocol Studio

> **Classification:** Governance Document  
> **Owner:** Engineering Lead + SRE Lead  
> **Review Cycle:** Quarterly  
> **Last Updated:** 2026-05-14  
> **Applies To:** All production changes to the DeepSynaps Protocol Studio platform

---

## Table of Contents

1. [Change Types and Approval Requirements](#1-change-types-and-approval-requirements)
2. [Change Request Template](#2-change-request-template)
3. [Risk Assessment Matrix](#3-risk-assessment-matrix)
4. [Testing Requirements by Change Type](#4-testing-requirements-by-change-type)
5. [Rollback Criteria](#5-rollback-criteria)
6. [Emergency Change Procedures](#6-emergency-change-procedures)
7. [Post-Change Validation Checklist](#7-post-change-validation-checklist)

---

## 1. Change Types and Approval Requirements

### 1.1 Change Classification

| Change Type | Description | Examples | Approval Required |
|-------------|-------------|----------|-------------------|
| **Standard** | Pre-planned, low-risk changes | Bug fixes, feature additions, dependency updates | Team Lead |
| **Major** | Significant architectural or feature changes | Database migration, new microservice, API contract changes | Eng Lead + Product Lead |
| **Critical** | Changes required to resolve active incidents | Hotfixes, security patches, emergency config changes | SRE Lead (post-hoc review within 24h) |
| **Infrastructure** | Changes to deployment infrastructure | Fly.toml changes, VM scaling, networking changes | SRE Lead |
| **Security** | Security-related changes | Auth changes, encryption updates, vulnerability patches | Security Reviewer + Eng Lead |
| **Data** | Changes affecting patient data | Schema changes, data migrations, backup changes | Eng Lead + Clinical Safety Officer |

### 1.2 Approval Workflow

```
CHANGE REQUESTED
       |
  +----+----+
  |         |
STANDARD   MAJOR/CRIT
  |         |
  v         v
TEAM      ENG LEAD +
LEAD      PRODUCT LEAD
  |         |
  v         v
SCHEDULE  SRE REVIEW
  |         |
  v         v
IMPLEMENT SCHEDULE
  |         |
  v         v
VALIDATE  IMPLEMENT
  |         |
  +----+----+
       |
       v
  POST-CHANGE
    REVIEW
```

### 1.3 Change Windows

| Environment | Standard Changes | Emergency Changes |
|-------------|-----------------|-------------------|
| **Production** | Tue-Thu, 08:00-16:00 UTC | Any time (with approval) |
| **Staging** | Mon-Fri, 06:00-22:00 UTC | Any time |
| **Development** | Any time | Any time |

**Blackout Periods:** No standard changes during:
- Week of major conferences or demos
- Known high-traffic periods (see [Capacity Planning](../runbooks/capacity-planning.md))
- Active P1/P2 incidents
- Within 24 hours of a previous production change (cooling-off period)

---

## 2. Change Request Template

### 2.1 Standard Change Request

```markdown
## Change Request: [CR-YYYY-MM-NNN]

**Title:** [Brief description]
**Requester:** [Name]
**Date:** [YYYY-MM-DD]
**Type:** Standard / Major / Critical / Infrastructure / Security / Data
**Priority:** Low / Medium / High / Critical
**Environment:** Production / Staging

### Description
[Detailed description of the change]

### Motivation
[Why this change is needed]

### Affected Components
- [ ] API (`apps/api`)
- [ ] Web frontend (`apps/web`)
- [ ] Worker processes
- [ ] Database schema
- [ ] Infrastructure/Fly.io
- [ ] External integrations (Stripe, OpenAI, etc.)
- [ ] Clinical data/registries

### Testing Performed
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Smoke tests pass
- [ ] Manual testing performed
- [ ] Performance testing (if applicable)
- [ ] Security review (if applicable)

### Risk Assessment
| Factor | Level | Notes |
|--------|-------|-------|
| Patient Safety Impact | None/Low/Medium/High | |
| Data Integrity Risk | None/Low/Medium/High | |
| Service Availability Risk | None/Low/Medium/High | |
| Rollback Complexity | Simple/Moderate/Complex | |
| Testing Coverage | Full/Partial/Limited | |

### Rollback Plan
[Detailed rollback procedure]

### Deployment Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Verification Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Schedule
- **Proposed Date:** [YYYY-MM-DD]
- **Proposed Time:** [HH:MM UTC]
- **Estimated Duration:** [N minutes]

### Approvals
- [ ] Team Lead: [Name] — Date: [YYYY-MM-DD]
- [ ] SRE Lead (if infra): [Name] — Date: [YYYY-MM-DD]
- [ ] Clinical Safety (if data): [Name] — Date: [YYYY-MM-DD]
```

### 2.2 Emergency Change Request

For P1 incidents requiring immediate change, use the abbreviated form:

```markdown
## Emergency Change Request: [ECR-YYYY-MM-NNN]

**Incident:** [Link to incident]
**Requester:** [Name]
**Date/Time:** [YYYY-MM-DD HH:MM UTC]
**Approver (verbal/immediate):** [Name]

### Change Description
[What is being changed and why]

### Risk Assessment
- Patient Safety Impact: [None/Low/Medium/High]
- Rollback Available: [Yes/No — explain if no]

### Change Steps
1. [Step]
2. [Step]

### Rollback Steps (if needed)
1. [Step]
2. [Step]

### Post-Change Review
Scheduled for: [Within 24 hours]
```

---

## 3. Risk Assessment Matrix

### 3.1 Risk Scoring

Score each factor from 1 (low) to 5 (high):

| Factor | 1 (Low) | 2 | 3 (Medium) | 4 | 5 (High) |
|--------|---------|---|------------|---|----------|
| **Patient Safety** | No patient impact | UI-only change | Indirect workflow impact | Direct clinical workflow | Data integrity or safety-critical |
| **Data Integrity** | Read-only change | New data, no existing data | Update existing non-critical | Update existing critical | Schema migration with data transform |
| **Availability** | <1 min downtime | <5 min downtime | <15 min downtime | <1 hour downtime | >1 hour or unknown |
| **Complexity** | Single file, well-tested | Small feature, tested | Multi-component change | Architectural change | Untested or experimental |
| **Rollback Ease** | Single command, instant | Documented rollback | Requires data restore | Complex multi-step | No rollback possible |

### 3.2 Risk Level Determination

```
Total Score = sum of all factors

Score Range | Risk Level | Approval Required | Change Window |
------------|-----------|-------------------|---------------|
5-10        | Low       | Team Lead         | Standard |
11-15       | Medium    | Eng Lead          | Standard |
16-20       | High      | Eng Lead + SRE    | Planned only |
21-25       | Critical  | Full review board | Special window |
```

### 3.3 Risk Mitigation Requirements

| Risk Level | Required Mitigations |
|-----------|---------------------|
| Low | Standard testing, documented rollback |
| Medium | Peer review, staging validation, rollback tested |
| High | Full test suite, security review, dedicated change window, SRE on-call standby |
| Critical | Architecture review, load testing, clinical safety review, phased rollout, immediate rollback capability |

---

## 4. Testing Requirements by Change Type

### 4.1 Minimum Testing Matrix

| Change Type | Unit Tests | Integration Tests | Smoke Tests | Manual QA | Performance | Security |
|-------------|-----------|------------------|-------------|-----------|-------------|----------|
| **Bug Fix** | Required | Required | Required | Recommended | If perf-related | If auth-related |
| **Feature** | Required | Required | Required | Required | If high-traffic | If auth/data |
| **Refactor** | Required | Required | Required | Recommended | Baseline check | — |
| **Dependency Update** | Required | Required | Required | Spot-check | — | If security update |
| **Config Change** | — | — | Required | Required | — | If security config |
| **DB Migration** | — | Required | Required | Required | If large table | If encryption |
| **Infra Change** | — | — | Required | Required | Required | If networking |
| **Security Patch** | Required | Required | Required | Required | — | Required |

### 4.2 Automated Test Execution

```bash
# Full test suite (run before any production change)

# 1. Backend tests
cd apps/api && pytest -x -q

# 2. Frontend tests
cd apps/web && npm run typecheck && npm run test

# 3. Frontend build
cd apps/web && npm run build

# 4. Smoke test (against staging)
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://staging-url \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf

# 5. Production smoke test (post-deploy)
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf
```

### 4.3 Staging Validation

Before any production deployment:

- [ ] Deploy to staging environment
- [ ] Verify `/health` endpoint returns 200
- [ ] Run full smoke test suite
- [ ] Verify all critical user journeys
- [ ] Check for new errors in staging logs
- [ ] Verify database migrations applied successfully
- [ ] Verify worker processes active

---

## 5. Rollback Criteria

### 5.1 Automatic Rollback Triggers

Rollback MUST be initiated automatically or immediately if:

| Condition | Action | Timeframe |
|-----------|--------|-----------|
| `/health` returns non-200 for >2 minutes | Rollback to previous release | Immediate |
| Error rate > 1% for >5 minutes | Rollback to previous release | Immediate |
| P95 latency > 1000ms for >10 minutes | Rollback to previous release | Within 15 min |
| Patient data integrity issues detected | Stop all writes, rollback data | Immediate |
| Security vulnerability introduced | Emergency rollback | Immediate |

### 5.2 Manual Rollback Decision Points

The on-call engineer should consider rollback if:

- [ ] New errors appear in Sentry within 10 minutes of deployment
- [ ] Customer reports increase within 30 minutes
- [ ] Any clinical workflow is degraded
- [ ] Queue processing slows significantly
- [ ] Memory/CPU usage is abnormally high

### 5.3 Rollback Procedure

```bash
# 1. Identify previous release
fly releases list --app deepsynaps-studio | head -5

# 2. Rollback to previous image
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
  --image <previous-image-ref>

# 3. Verify rollback
fly status --app deepsynaps-studio
curl -s https://deepsynaps-studio.fly.dev/health | jq .

# 4. Run smoke test
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf

# 5. If database migration was part of the change:
#    Check if migration needs to be reversed:
#    fly ssh console --app deepsynaps-studio -C \
#      "cd /app/apps/api && python -m alembic downgrade -1"
#    ⚠️ Only downgrade if the forward migration is known to be safe to reverse

# 6. Notify team of rollback
#    Post in #incidents with reason and timeline
```

---

## 6. Emergency Change Procedures

### 6.1 When Emergency Changes Are Allowed

Emergency changes bypass standard approval ONLY when:

1. **Active P1 incident** is in progress
2. **Security vulnerability** requires immediate patching
3. **Regulatory requirement** mandates immediate change
4. **Patient safety risk** requires immediate remediation

### 6.2 Emergency Change Process

```
EMERGENCY DETECTED
       |
       v
NOTIFY SRE LEAD (verbal/Slack/phone)
       |
       v
GET VERBAL APPROVAL
(minimum: SRE Lead or Eng Lead)
       |
       v
IMPLEMENT CHANGE
(document all steps live)
       |
       v
VALIDATE (smoke tests)
       |
       v
NOTIFY (Slack #incidents)
       |
       v
SCHEDULE POST-CHANGE REVIEW (within 24h)
       |
       v
COMPLETE FORMAL CHANGE REQUEST (retroactive)
```

### 6.3 Emergency Change Constraints

- Maximum 2 emergency changes per week without process review
- All emergency changes MUST have a post-change review within 24 hours
- If >3 emergency changes in a month, trigger process improvement review
- Emergency changes to patient data schemas require Clinical Safety Officer notification within 1 hour

### 6.4 Emergency Change Communication

```
:rotating_light: **EMERGENCY CHANGE IN PROGRESS** :rotating_light:

**Change:** [brief description]
**Reason:** [why emergency]
**Approved by:** [name] at [time]
**Implementing:** [engineer name]
**Estimated duration:** [N minutes]
**Rollback available:** [yes/no]

Updates in this thread.
```

---

## 7. Post-Change Validation Checklist

### 7.1 Immediate Validation (within 5 minutes)

- [ ] `/health` endpoint returns 200 with expected response
- [ ] Fly.io status shows all machines running
- [ ] No new Sentry errors in the past 5 minutes
- [ ] Log stream shows normal operation (no ERROR/FATAL)

### 7.2 Short-Term Validation (within 30 minutes)

- [ ] Smoke test passes:
  ```bash
  uv run python scripts/qeeg_deploy_smoke.py \
    --base-url https://deepsynaps-studio.fly.dev \
    --token "$CLINICIAN_BEARER_TOKEN" \
    --require-pdf
  ```
- [ ] P95 latency within SLA (< 200ms)
- [ ] Error rate within SLA (< 0.1%)
- [ ] Worker processes active and processing jobs
- [ ] No customer complaints in support channels

### 7.3 Medium-Term Validation (within 4 hours)

- [ ] All automated alerts green
- [ ] Queue processing at normal rate
- [ ] Database performance nominal
- [ ] No memory leaks or resource growth
- [ ] External integrations (Stripe, OpenAI) functioning

### 7.4 Long-Term Validation (within 24 hours)

- [ ] Daily SLA report shows no degradation
- [ ] Clinical workflows verified by spot-check
- [ ] No deferred or failed Celery tasks
- [ ] Backup completed successfully post-change
- [ ] Performance metrics within baseline

### 7.5 Post-Change Sign-Off

```markdown
## Change Sign-Off: [CR-YYYY-MM-NNN]

**Change:** [description]
**Deployed:** [YYYY-MM-DD HH:MM UTC]
**Deployed by:** [name]

### Validation Results
- [ ] Immediate validation: PASS/FAIL
- [ ] Short-term validation: PASS/FAIL
- [ ] Medium-term validation: PASS/FAIL
- [ ] Long-term validation: PASS/FAIL

### Issues Encountered
[None / description]

### Metrics Impact
- Latency: [before] → [after]
- Error rate: [before] → [after]
- Resource usage: [before] → [after]

### Sign-Off
- [ ] SRE Lead: [Name] — Date: [YYYY-MM-DD]
- [ ] Team Lead: [Name] — Date: [YYYY-MM-DD]
```

---

## Cross-References

- [Release Process](./release-process.md) — Deployment procedures
- [Incident Response Runbook](../runbooks/incident-response.md) — Emergency response
- [On-Call Playbook](../runbooks/oncall-playbook.md) — Operational procedures
- [SLA Definition](./sla-definition.md) — Service level targets
