# Capacity Planning Guide — DeepSynaps Protocol Studio

> **Classification:** Operations Planning Document  
> **Owner:** SRE Lead + Platform Engineering  
> **Review Cycle:** Monthly active review; Quarterly deep review  
> **Last Updated:** 2026-05-14

---

## Table of Contents

1. [Current Resource Baselines](#1-current-resource-baselines)
2. [Growth Projections and Scaling Triggers](#2-growth-projections-and-scaling-triggers)
3. [Scaling Procedures](#3-scaling-procedures)
4. [Database Capacity Planning](#4-database-capacity-planning)
5. [Cost Estimation Formulas](#5-cost-estimation-formulas)
6. [Seasonal Adjustment Factors](#6-seasonal-adjustal-factors)
7. [Capacity Review Schedule](#7-capacity-review-schedule)

---

## 1. Current Resource Baselines

### 1.1 Production Infrastructure (Fly.io)

| Component | Current Spec | Count | Purpose |
|-----------|-------------|-------|---------|
| **App (FastAPI)** | `performance-4x` (4 CPU / 8 GB) | 1 | HTTP API server |
| **qEEG Worker** | `shared-cpu-1x` (1 CPU / 1 GB) | 1 | Async qEEG/ERP analysis |
| **Stripe Worker** | `shared-cpu-1x` (1 CPU / 1 GB) | 1 | Webhook retry polling |
| **Volume** | 1 GB initial | 1 | SQLite DB, media, evidence |
| **PostgreSQL** | (Future: Fly Postgres) | — | Target production DB |
| **Redis** | (Upstash or Fly Redis) | — | Celery broker + rate limiting |

### 1.2 Resource Utilization Baselines

The following baselines were established during production smoke testing and load analysis. Update these monthly with actual metrics from `fly metrics`.

| Metric | Baseline | Peak Observed | Alert Threshold |
|--------|----------|---------------|-----------------|
| **API CPU Utilization** | 15-25% | 60% | >70% for 5 min |
| **API Memory Utilization** | 3-4 GB / 8 GB | 5 GB | >6.5 GB for 5 min |
| **Worker CPU** | 10-20% | 40% | >60% for 10 min |
| **Worker Memory** | 0.5 GB / 1 GB | 0.8 GB | >0.9 GB |
| **Disk Usage (/data)** | 200-500 MB | 800 MB | >80% of volume |
| **DB Response Time (SQLite)** | 5-20 ms | 100 ms | >200 ms |
| **API P95 Latency** | 50-100 ms | 300 ms | >200 ms (SLA) |
| **Concurrent Connections** | 5-15 | 25 | >20 (soft limit) |
| **Celery Queue Depth** | 0-5 | 20 | >50 for 5 min |
| **qEEG Job Duration** | 30-120 sec | 300 sec | >600 sec |

### 1.3 Database Connection Baselines

**Current: SQLite (file-based)**
- No connection pool limit (single file access via SQLAlchemy)
- Concurrent writes serialize via SQLite WAL mode
- Monitor file lock contention in logs

**Target: PostgreSQL**
- Default connection limit: 100
- Application pool size: 10-20 connections
- PgBouncer target pool: 50-100
- Alert at 80 active connections

### 1.4 Key Application Metrics

```bash
# Collect these baselines monthly
echo "=== Fly.io Status ==="
fly status --app deepsynaps-studio

echo "=== Volume Usage ==="
fly ssh console --app deepsynaps-studio -C "df -h /data"

echo "=== Database Size ==="
fly ssh console --app deepsynaps-studio -C "ls -lh /data/*.db"

echo "=== Media Storage ==="
fly ssh console --app deepsynaps-studio -C "du -sh /data/media_uploads 2>/dev/null || echo 'No media uploads'"

echo "=== Health Check ==="
curl -s https://deepsynaps-studio.fly.dev/health | jq .
```

---

## 2. Growth Projections and Scaling Triggers

### 2.1 Growth Assumptions

| Metric | Current | 3-Month Projection | 6-Month Projection | 12-Month Projection |
|--------|---------|-------------------|-------------------|-------------------|
| Active Clinicians | [N] | N x 1.5 | N x 2.5 | N x 5 |
| Patients / Clinic | [N] | N x 1.3 | N x 1.6 | N x 2 |
| qEEG Analyses / Day | [N] | N x 2 | N x 4 | N x 8 |
| DB Size (SQLite) | [N] MB | N x 1.5 | N x 2.5 | Migrate to PG |
| Media Storage | [N] MB | N x 2 | N x 4 | N x 10 |
| API Requests / Day | [N] | N x 1.5 | N x 3 | N x 6 |

### 2.2 Scaling Triggers

When any of the following triggers are breached for more than the observation window, initiate scaling.

| Trigger | Observation Window | Action |
|---------|-------------------|--------|
| API CPU > 70% | 5 minutes | Add app machine or scale CPU |
| API Memory > 6.5 GB | 5 minutes | Add app machine or scale memory |
| Worker Memory > 0.9 GB | 10 minutes | Scale worker VM memory |
| Disk usage > 80% | Immediate | Expand volume + alert |
| Queue depth > 50 | 5 minutes | Add qEEG worker machines |
| DB response > 200 ms | 10 minutes | Initiate DB optimization |
| P95 latency > 200 ms | 5 minutes | Investigate + scale if needed |
| Error rate > 0.1% | 5 minutes | Investigate (may be code, not capacity) |
| Concurrent connections > 20 | 5 minutes | Scale app machines |

### 2.3 Capacity Headroom Policy

Maintain the following minimum headroom at all times:

| Resource | Minimum Headroom |
|----------|-----------------|
| CPU | 30% |
| Memory | 25% |
| Disk | 20% |
| DB connections | 20% of pool |
| Queue workers | 1 spare worker capacity |

---

## 3. Scaling Procedures

### 3.1 Horizontal Scaling (Add Machines)

Preferred for API servers — add machines to distribute load.

```bash
# Current machine count
fly machine list --app deepsynaps-studio

# Scale app machines (e.g., from 1 to 2)
fly scale count app=2 --app deepsynaps-studio

# Scale qEEG workers (e.g., from 1 to 2)
fly scale count qeeg_worker=2 --app deepsynaps-studio

# Verify
fly status --app deepsynaps-studio

# Run load test / smoke test to verify
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf
```

**Considerations:**
- SQLite database is on a single volume — horizontal scaling of API machines requires migrating to PostgreSQL first (SQLite does not support multi-machine concurrent access well)
- For now, horizontal scaling is limited until PostgreSQL migration is complete
- Use `fly.io` `auto_stop_machines` and `auto_start_machines` for cost-efficient scaling

### 3.2 Vertical Scaling (Bigger Machines)

Preferred for workers and until PostgreSQL migration is complete.

```bash
# Scale API VM (e.g., from performance-4x to performance-8x)
# Edit apps/api/fly.toml:
# [[vm]]
#   processes = ["app"]
#   memory = "16gb"
#   cpu_kind = "performance"
#   cpus = 8

# Then deploy
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile

# Scale worker VMs
# Edit fly.toml worker vm section:
# [[vm]]
#   processes = ["qeeg_worker", "stripe_worker"]
#   memory = "2gb"  # upgraded from 1gb
#   cpu_kind = "shared"
#   cpus = 2

fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

### 3.3 Volume Expansion (Disk Scaling)

```bash
# List volumes
fly volumes list --app deepsynaps-studio

# Extend volume (e.g., from 1 GB to 5 GB)
fly volumes extend <volume-id> --size 5 --app deepsynaps-studio

# Verify
fly ssh console --app deepsynaps-studio -C "df -h /data"
```

**Note:** Volume expansion is online — no downtime required.

### 3.4 Database Scaling Path

The migration from SQLite to PostgreSQL is the critical scaling enabler.

**Phase 1: Current (SQLite)**
- Single machine access only
- Vertical scaling only
- Backup via `scripts/backup_database.py`

**Phase 2: Migration (SQLite → PostgreSQL)**
```bash
# See apps/api/scripts/migrate_sqlite_to_pg.py for migration tool
# 1. Provision Fly PostgreSQL
fly pg create --name deepsynaps-db --region lhr

# 2. Set connection string secret
fly secrets set DEEPSYNAPS_DATABASE_URL="postgresql://..." --app deepsynaps-studio

# 3. Run migration
fly ssh console --app deepsynaps-studio -C "python apps/api/scripts/migrate_sqlite_to_pg.py"

# 4. Verify and deploy
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

**Phase 3: PostgreSQL HA**
- Add read replicas for reporting queries
- Add PgBouncer for connection pooling
- Enable automated backups (Fly.io handles this)

### 3.5 Redis Scaling

Current Redis is used for Celery broker and rate limiting.

```bash
# Provision larger Redis (Upstash or Fly Redis)
fly redis create --name deepsynaps-redis --region lhr

# Update secrets
fly secrets set CELERY_BROKER_URL="redis://..." --app deepsynaps-studio
fly secrets set DEEPSYNAPS_LIMITER_REDIS_URI="redis://..." --app deepsynaps-studio

# Restart to pick up new config
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

---

## 4. Database Capacity Planning

### 4.1 SQLite Capacity Limits

| Metric | Limit | Current | Headroom |
|--------|-------|---------|----------|
| Max file size | 281 TB (theoretical) | [N] GB | [N]% |
| Max tables | 2 billion | ~100 | >99% |
| Max rows per table | 2^64 | [highest] | >99% |
| Concurrent writers | 1 (WAL mode) | 1 | N/A |
| Practical concurrent readers | 10s | 1-5 | Good |

**Critical Limitation:** SQLite supports only one writer at a time. As concurrent clinician count grows, write contention will degrade performance. PostgreSQL migration must be completed before write contention becomes an issue.

### 4.2 Migration Triggers (SQLite → PostgreSQL)

Initiate PostgreSQL migration when ANY of the following are true:

- [ ] Database file > 2 GB
- [ ] Concurrent active users > 20
- [ ] Write operations > 10 per second sustained
- [ ] Need for horizontal scaling (multiple API machines)
- [ ] Need for read replicas (reporting queries impacting API performance)
- [ ] Need for row-level security or advanced access control

### 4.3 PostgreSQL Capacity Plan (Target)

| Tier | Connections | Storage | CPU/Memory | Use Case |
|------|-------------|---------|------------|----------|
| Starter | 100 | 10 GB | 1 shared / 2 GB | < 50 clinicians |
| Professional | 200 | 100 GB | 2 shared / 4 GB | 50-200 clinicians |
| Enterprise | 500 | 500 GB + read replicas | 4 dedicated / 16 GB | 200+ clinicians |

### 4.4 Backup Capacity

```bash
# Current backup schedule
# - Automated via scripts/backup_database.py
# - Triggered: before deploys, daily at scheduled time

# Backup sizes
du -sh /data/backups/*

# Retention policy
# - Keep: Last 7 daily backups
# - Keep: Last 4 weekly backups
# - Keep: Last 12 monthly backups
# - Remove older backups (automated via script)

# Verify backup integrity monthly
fly ssh console --app deepsynaps-studio -C \
  "sqlite3 /data/backups/deepsynaps_protocol_studio_latest.db 'PRAGMA integrity_check;'"
```

---

## 5. Cost Estimation Formulas

### 5.1 Fly.io Cost Formula

```
Monthly Cost = App_VM_Cost + Worker_VM_Cost + Volume_Cost + Bandwidth_Cost + Database_Cost

App_VM_Cost     = $app_machines x $app_machine_monthly
                  # performance-4x ~$80/mo (while running)
                  # With auto_stop: ~$40-60/mo typical

Worker_VM_Cost  = $worker_machines x $worker_machine_monthly
                  # shared-cpu-1x ~$1.94/mo (while running)

Volume_Cost     = $volume_gb x $0.15/GB/month

Bandwidth_Cost  = Max(0, ($outbound_gb - 160) x $0.02/GB)
                  # First 160 GB/month free

Database_Cost   = $fly_pg_plan_monthly
                  # Fly Postgres: $0-$97/mo depending on plan
```

### 5.2 Current Cost Baseline (Monthly)

| Component | Spec | Cost/Month (USD) |
|-----------|------|-----------------|
| App (1 machine) | performance-4x, auto-stop | ~$40-80 |
| qEEG Worker (1) | shared-cpu-1x | ~$2 |
| Stripe Worker (1) | shared-cpu-1x | ~$2 |
| Volume (1 GB) | Persistent | ~$0.15 |
| Bandwidth | ~10-50 GB | Included in free tier |
| **Total Current** | | **~$45-85/month** |

### 5.3 Projected Costs at Scale

| Scenario | App Machines | Workers | Volume | PostgreSQL | Total/Month |
|----------|-------------|---------|--------|------------|-------------|
| Current (1 clinic) | 1 | 2 | 1 GB | — | ~$50-85 |
| 3-Month (5 clinics) | 1-2 | 2-3 | 5 GB | Starter | ~$100-150 |
| 6-Month (15 clinics) | 2 | 3-4 | 20 GB | Professional | ~$200-300 |
| 12-Month (50+ clinics) | 2-3 | 4-6 | 100 GB | Enterprise | ~$500-800 |

### 5.4 Cost Optimization Levers

| Lever | Savings | Trade-off |
|-------|---------|-----------|
| `auto_stop_machines = true` | 30-50% | Cold start latency on first request |
| `min_machines_running = 0` | Additional 20% | Higher first-request latency |
| `shared-cpu` for workers | ~80% vs performance | Slower qEEG processing |
| Whisper "base" model | ~$0 vs "medium" | Lower ASR accuracy |
| Evidence DB on volume | ~$0 vs managed DB | Manual backup management |

---

## 6. Seasonal Adjustment Factors

Healthcare platforms may experience seasonal variations in usage.

### 6.1 Expected Patterns

| Period | Expected Impact | Capacity Action |
|--------|----------------|-----------------|
| **January** | High — new year treatment plans | Pre-scale workers +20% |
| **Summer (Jun-Aug)** | Moderate — vacation schedules | Reduce standby capacity -10% |
| **September** | High — back-to-school neuro assessments | Pre-scale API + workers |
| **Year-End (Dec)** | Low — holiday closures | Reduce to baseline |
| **Conference Periods** | Spike — demo instances | Spin up temporary demo environment |
| **Product Launch** | Variable — marketing driven | Pre-scale 2x for 1 week |

### 6.2 Adjustment Formula

```
projected_capacity = baseline_capacity x (1 + growth_rate + seasonal_factor)

seasonal_factors = {
    "jan": +0.20,
    "feb": +0.10,
    "mar": +0.05,
    "apr": +0.05,
    "may": +0.00,
    "jun": -0.05,
    "jul": -0.10,
    "aug": -0.05,
    "sep": +0.20,
    "oct": +0.10,
    "nov": +0.05,
    "dec": -0.15
}
```

---

## 7. Capacity Review Schedule

### 7.1 Review Cadence

| Review Type | Frequency | Participants | Duration |
|-------------|-----------|--------------|----------|
| **Metrics Check** | Weekly (Monday) | On-call engineer | 15 min |
| **Capacity Review** | Monthly | SRE Lead + Eng Lead | 1 hour |
| **Quarterly Planning** | Quarterly | Full platform team | 2 hours |
| **Pre-Scale Review** | Ad-hoc (before major scaling) | SRE + Eng Lead + Product | 30 min |

### 7.2 Monthly Capacity Review Agenda

```markdown
## Capacity Review: [Month Year]

### Metrics Summary
- [ ] API request volume (requests/day)
- [ ] P50/P95/P99 latency trends
- [ ] Error rate trend
- [ ] CPU utilization trend
- [ ] Memory utilization trend
- [ ] Disk usage trend
- [ ] Queue depth trend
- [ ] Database response time trend

### Against Projections
- [ ] Growth vs 3-month projection
- [ ] Any scaling triggers breached?
- [ ] Headroom status for each resource

### Decisions Needed
- [ ] Any scaling required this month?
- [ ] Any optimization opportunities?
- [ ] PostgreSQL migration timeline update?
- [ ] Cost forecast update?

### Action Items
| Action | Owner | Due | Priority |
|--------|-------|-----|----------|
| | | | |
```

### 7.3 Capacity Testing

Schedule capacity tests quarterly:

```bash
# Load test with k6 or similar (to be implemented)
# Example structure:
# k6 run --vus 50 --duration 5m load-test.js

# Manual smoke test at current scale
uv run python scripts/qeeg_deploy_smoke.py \
  --base-url https://deepsynaps-studio.fly.dev \
  --token "$CLINICIAN_BEARER_TOKEN" \
  --require-pdf

# Stress test: submit multiple concurrent qEEG jobs
# (Implement as needed for capacity validation)
```

### 7.4 Capacity Document Versioning

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-05-14 | Initial baseline | SRE Lead |

---

## Cross-References

- [On-Call Playbook](./oncall-playbook.md) — Operational monitoring
- [Performance Tuning Guide](./performance-tuning.md) — Optimization before scaling
- [Incident Response Runbook](./incident-response.md) — Emergency scaling during incidents
- [Release Process](../operations/release-process.md) — Scaling during releases
