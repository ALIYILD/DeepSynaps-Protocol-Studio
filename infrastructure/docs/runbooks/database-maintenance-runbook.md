# Database Maintenance Runbook

## DeepSynaps Protocol Studio — Clinical Neuromodulation Platform

**Document ID:** RUN-003  
**Version:** 2.0.0  
**Classification:** Operational — HIPAA-Ready  
**Owner:** Infrastructure Engineering  
**Review Cycle:** Quarterly  
**Last Updated:** 2025-01-15

---

## Table of Contents

1. [Overview](#1-overview)
2. [Maintenance Window](#2-maintenance-window)
3. [Clinical Operating Hours](#3-clinical-operating-hours)
4. [Maintenance Tasks](#4-maintenance-tasks)
5. [Procedures](#5-procedures)
6. [Pre-Maintenance Checklist](#6-pre-maintenance-checklist)
7. [Post-Maintenance Verification](#7-post-maintenance-verification)
8. [Troubleshooting](#8-troubleshooting)
9. [Compliance](#9-compliance)
10. [Appendices](#10-appendices)

---

## 1. Overview

This runbook documents the database maintenance procedures for the DeepSynaps Protocol Studio. Maintenance is designed to run automatically during a defined maintenance window that respects clinical operating hours to ensure patient safety and data integrity.

### Maintenance Objectives

| Objective | Target | Measurement |
|-----------|--------|-------------|
| Table bloat | < 30% | `pgstattuple` extension |
| Index bloat | < 30% | `pgstatindex` extension |
| Query performance | < 100ms p95 | Application metrics |
| Disk utilization | < 80% | System monitoring |
| Stale connections | 0 | `pg_stat_activity` |

### Database Specifications

| Property | Production | Staging | Development |
|----------|-----------|---------|-------------|
| Engine | PostgreSQL 15 | PostgreSQL 15 | SQLite 3 |
| Size | 20GB+ | 5GB | < 500MB |
| Tables | 40+ | 40+ | 40+ |
| Extensions | pgvector, uuid-ossp, pgcrypto | pgvector, uuid-ossp | (builtin) |
| Max connections | 200 | 100 | N/A |
| Backup frequency | Every 15 min | Every 6 hours | Manual |

---

## 2. Maintenance Window

### Defined Window

| Property | Value |
|----------|-------|
| **Start Time** | 02:00 UTC |
| **End Time** | 06:00 UTC |
| **Duration** | Up to 4 hours |
| **Timezone** | UTC |
| **Frequency** | Weekly (Sundays) |

### Configuration

```bash
# Set custom window (if needed)
export MAINTENANCE_WINDOW_START="02:00"
export MAINTENANCE_WINDOW_END="06:00"
export MAINTENANCE_TIMEZONE="UTC"

# Or force outside window (emergency only)
export MAINTENANCE_FORCE=true
```

### Calendar Reference

| UTC | EST (UTC-5) | PST (UTC-8) | Status |
|-----|-------------|-------------|--------|
| 02:00 | 21:00 (prev) | 18:00 (prev) | ✅ Maintenance OK |
| 06:00 | 01:00 | 22:00 (prev) | ✅ Maintenance OK |
| 07:00 | 02:00 | 23:00 (prev) | ⚠️ Clinical hours begin |
| 22:00 | 17:00 | 14:00 | ⚠️ Clinical hours end |

---

## 3. Clinical Operating Hours

### Definition

Clinical operating hours are the times during which healthcare providers actively use the platform for patient care. Maintenance must **never** occur during these hours.

| Schedule | Hours (UTC) | Activity Level |
|----------|-------------|----------------|
| **Peak** | 07:00 — 22:00 | Active clinical use |
| **Maintenance** | 02:00 — 06:00 | Approved for maintenance |
| **Off-peak** | 22:00 — 02:00 | Low activity (backup OK) |

### Regional Considerations

The primary user base is in the UK/EU (LHR region). The maintenance window is chosen to minimize impact:

- **UK (GMT/BST):** 02:00-06:00 UTC = 02:00-06:00 GMT / 03:00-07:00 BST
- **US East (ET):** 21:00-01:00 previous day
- **US West (PT):** 18:00-22:00 previous day

### Emergency Override

In case of critical database issues (disk full, imminent corruption), maintenance can be forced outside the window:

```bash
# ⚠️ Use with extreme caution during clinical hours
./database-maintenance.sh --force
```

**Requires:**
1. Approval from on-call engineering lead
2. Notification in #incidents Slack channel
3. Customer notification if user-facing impact expected

---

## 4. Maintenance Tasks

### Task Overview

| # | Task | Description | Duration | Impact |
|---|------|-------------|----------|--------|
| 1 | **VACUUM ANALYZE** | Reclaim dead tuples, update statistics | 10-30 min | Read-only locks briefly |
| 2 | **Index Rebuild** | Defragment indexes, update statistics | 15-45 min | Table locks (CONCURRENTLY) |
| 3 | **Log Rotation** | Rotate and archive PostgreSQL logs | 1-2 min | None |
| 4 | **Statistics Update** | Force planner statistics refresh | 2-5 min | None |
| 5 | **Orphan Cleanup** | Remove expired sessions, stale records | 5-15 min | Minimal |
| 6 | **Connection Cleanup** | Terminate idle connections | < 1 min | Idle connections dropped |
| 7 | **Cache Warming** | Pre-load hot tables into memory | 2-5 min | None |

### Task Details

#### Task 1: VACUUM ANALYZE

Reclaims storage occupied by dead tuples and updates query planner statistics.

**PostgreSQL:**
```sql
-- Standard VACUUM (doesn't lock)
VACUUM ANALYZE public.users;
VACUUM ANALYZE public.protocols;
VACUUM ANALYZE public.sessions;
-- ... for all tables

-- Full database ANALYZE
ANALYZE;
```

**SQLite:**
```sql
-- SQLite VACUUM (rebuilds entire database)
VACUUM;

-- ANALYZE for query planner
ANALYZE;
```

**Monitoring:**
- Pre-VACUUM: Check `pgstattuple` bloat percentage
- Post-VACUUM: Verify reduction in dead tuples
- Expected: < 30% bloat after VACUUM

---

#### Task 2: Index Rebuild

Rebuilds indexes to eliminate fragmentation and improve scan performance.

**PostgreSQL:**
```sql
-- Concurrent rebuild (no table locks)
REINDEX DATABASE CONCURRENTLY deepsynaps_production;

-- If CONCURRENTLY not available:
REINDEX DATABASE deepsynaps_production;
```

**SQLite:**
```sql
-- SQLite reindex
REINDEX;
```

**Monitoring:**
- Check index bloat before/after using `pgstatindex`
- Expected: < 30% bloat after rebuild

---

#### Task 3: Log Rotation

Rotates PostgreSQL logs to prevent disk space exhaustion.

**Actions:**
- Trigger `pg_rotate_logfile()` if available
- Compress logs older than 30 days
- Delete logs older than 90 days

**Monitoring:**
- Verify log directory size < 5GB
- Check no active logs are lost

---

#### Task 4: Statistics Update

Forces the PostgreSQL query planner to refresh table statistics.

**PostgreSQL:**
```sql
-- Full ANALYZE
ANALYZE VERBOSE;

-- Reset pg_stat_statements
SELECT pg_stat_statements_reset();
```

**Monitoring:**
- Check `pg_stat_user_tables.last_analyze` timestamps
- All tables should show recent analyze time

---

#### Task 5: Orphaned Record Cleanup

Removes expired sessions and dangling records that accumulate over time.

**Cleanup Targets:**

| Table | Condition | Retention |
|-------|-----------|-----------|
| `user_sessions` | `expires_at < NOW() - 7 days` | 7 days |
| `alembic_version` | Keep last 100 versions | Last 100 |

**PostgreSQL:**
```sql
-- Clean expired sessions
WITH deleted AS (
    DELETE FROM user_sessions
    WHERE expires_at < NOW() - INTERVAL '7 days'
    RETURNING *
)
SELECT count(*) FROM deleted;
```

**⚠️ PHI Safety:** Only metadata (counts, timestamps) is logged. No patient data is exposed in maintenance logs.

---

#### Task 6: Connection Cleanup

Terminates idle connections that consume resources.

**PostgreSQL:**
```sql
-- Terminate idle connections older than 60 minutes
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
AND state_change < NOW() - INTERVAL '60 minutes'
AND pid <> pg_backend_pid();
```

**Monitoring:**
- Active connections should drop to baseline
- No active queries should be interrupted

---

#### Task 7: Cache Warming

Pre-loads frequently accessed tables into PostgreSQL shared_buffers after maintenance.

**PostgreSQL:**
```sql
-- Sequential scans to load into cache
SELECT count(*) FROM users;
SELECT count(*) FROM protocols;
SELECT count(*) FROM sessions;
```

**SQLite:**
```sql
-- PRAGMA optimize
PRAGMA optimize;
```

---

## 5. Procedures

### 5.1 Automated Maintenance (Standard)

Maintenance runs automatically every Sunday during the maintenance window:

```bash
# Add to crontab (runs at 02:00 UTC on Sundays)
0 2 * * 0 /app/scripts/database-maintenance.sh

# Or via Fly.io scheduled machine
fly machines run --app deepsynaps-studio \
    --image registry.fly.io/deepsynaps-studio:latest \
    --schedule "weekly" \
    --command "/app/scripts/database-maintenance.sh"
```

### 5.2 Manual Maintenance (On-Demand)

```bash
cd /app/scripts

# Full maintenance
./database-maintenance.sh

# Force outside window
./database-maintenance.sh --force

# Dry run (no changes)
./database-maintenance.sh --dry-run

# Individual tasks
./database-maintenance.sh --vacuum-only
./database-maintenance.sh --indexes-only
./database-maintenance.sh --cleanup-only

# Check status
./database-maintenance.sh --status
```

### 5.3 Emergency Maintenance

For urgent situations (disk full, performance crisis):

```bash
# 1. Check current status
./database-maintenance.sh --status

# 2. Notify team
# Post in #incidents: "Emergency DB maintenance starting — reason: [X]"

# 3. Run with force (even during clinical hours)
./database-maintenance.sh --force --vacuum-only

# 4. Monitor
watch -n 5 'psql "$DEEPSYNAPS_DATABASE_URL" -c "SELECT now(), count(*) FROM pg_stat_activity;"'

# 5. Verify
./database-maintenance.sh --status
```

### 5.4 Maintenance for Specific Tasks

#### Disk Space Emergency

```bash
# If disk > 90% full:
./database-maintenance.sh --force --vacuum-only

# Check space after
df -h
```

#### Performance Degradation

```bash
# If queries are slow:
./database-maintenance.sh --force --indexes-only

# Then statistics
./database-maintenance.sh --force --vacuum-only
```

#### Connection Saturation

```bash
# If max_connections reached:
./database-maintenance.sh --force --cleanup-only

# Check connections
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    SELECT state, count(*) 
    FROM pg_stat_activity 
    GROUP BY state;
"
```

---

## 6. Pre-Maintenance Checklist

Before starting maintenance, verify:

- [ ] Within maintenance window (02:00-06:00 UTC) or `--force` approved
- [ ] No active incidents in progress
- [ ] Recent backup exists (< 1 hour old)
- [ ] Disk space > 5GB available on temp volume
- [ ] Database connectivity confirmed
- [ ] Team notified in #maintenance (Slack)
- [ ] Customer-facing status page updated (if applicable)
- [ ] Rollback plan ready (backup S3 key noted)

**Quick Check:**
```bash
./database-maintenance.sh --status
curl -s https://deepsynaps-studio.fly.dev/health
./backup-database.sh --verify-only
```

---

## 7. Post-Maintenance Verification

After maintenance completes, verify:

### Automated Verification

The script automatically runs post-flight checks:

```
[POSTFLIGHT] Database connectivity: OK
[POSTFLIGHT] 42 tables accessible
[POSTFLIGHT] 12 active connections
```

### Manual Verification Checklist

- [ ] Application health endpoint returns 200
- [ ] No errors in application logs
- [ ] Query response times < 100ms (p95)
- [ ] Table bloat < 30% (if measurable)
- [ ] Index bloat < 30% (if measurable)
- [ ] Disk utilization decreased (if VACUUM ran)
- [ ] No connection errors in logs
- [ ] Workers processing normally

**Verification Commands:**
```bash
# Application health
curl -s https://deepsynaps-studio.fly.dev/health

# Database stats
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    SELECT schemaname, tablename, 
           pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
    FROM pg_tables 
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LIMIT 10;
"

# Active connections
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    SELECT state, count(*) 
    FROM pg_stat_activity 
    WHERE datname = current_database()
    GROUP BY state;
"

# Table bloat (if pgstattuple available)
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    SELECT relname, 
           pg_size_pretty(pg_total_relation_size(oid)) as size,
           n_live_tup, n_dead_tup
    FROM pg_stat_user_tables
    WHERE n_dead_tup > 1000
    ORDER BY n_dead_tup DESC
    LIMIT 10;
"
```

---

## 8. Troubleshooting

### Issue: Maintenance blocked (outside window)

```
ERROR: Current time (14:30 UTC) is within clinical operating hours
ERROR: Maintenance blocked to ensure patient safety
```

**Resolution:**
```bash
# Wait for maintenance window, or use --force (with approval)
./database-maintenance.sh --force
```

### Issue: VACUUM fails (insufficient disk space)

```
ERROR: VACUUM failed — disk full
```

**Resolution:**
```bash
# 1. Check disk space
df -h

# 2. Free up temp space
rm -rf /tmp/deepsynaps-*

# 3. Run VACUUM with minimal requirements
./database-maintenance.sh --force --vacuum-only

# 4. If still failing, run VACUUM without FULL
psql "$DEEPSYNAPS_DATABASE_URL" -c "VACUUM;"  # (no ANALYZE, quick pass)
```

### Issue: REINDEX CONCURRENTLY fails

```
WARNING: CONCURRENTLY not available, falling back to regular REINDEX
```

**Resolution:**
- Regular REINDEX will acquire locks — plan for brief unavailability
- Consider running during lower-activity period
- For large tables, consider `REINDEX TABLE CONCURRENTLY` per-table

### Issue: Orphan cleanup hangs

```
ERROR: Orphan cleanup query timeout
```

**Resolution:**
```bash
# Check for long-running queries
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    SELECT pid, query, now() - query_start as duration
    FROM pg_stat_activity
    WHERE state = 'active'
    AND now() - query_start > interval '5 minutes';
"

# Cancel problematic query if safe
SELECT pg_cancel_backend(<PID>);
```

### Issue: Post-flight checks fail

```
ERROR: Post-flight: Cannot connect to PostgreSQL
```

**Resolution:**
```bash
# 1. Check if PostgreSQL is running
fly status --app deepsynaps-studio-db

# 2. Check PostgreSQL logs
fly logs --app deepsynaps-studio-db

# 3. If PostgreSQL is down, restart
fly machines restart <DB_MACHINE_ID> --app deepsynaps-studio-db

# 4. If restart fails, initiate DR procedure
./disaster-recovery.sh --type DATABASE_FAILURE
```

---

## 9. Compliance

### HIPAA Compliance

| Requirement | Implementation |
|-------------|---------------|
| **Maintenance during off-hours** | Window 02:00-06:00 UTC, clinical hours respected |
| **Audit trail** | All maintenance logged to `maintenance-audit.log` |
| **No PHI in logs** | Only aggregate counts and metadata |
| **Access control** | Only infrastructure engineers can execute |
| **Change documentation** | This runbook + automated logs |

### Audit Log Format

```json
{
  "time": "2024-01-15T03:00:00Z",
  "event": "VACUUM_ANALYZE",
  "status": "OK",
  "script": "database-maintenance.sh",
  "version": "2.0.0",
  "host": "maintenance-runner",
  "pid": 4567,
  "env": "production",
  "details": "42 tables processed"
}
```

### Log Retention

| Log Type | Retention | Location |
|----------|-----------|----------|
| Maintenance audit | 7 years | `logs/maintenance-audit.log` |
| PostgreSQL logs | 90 days | Managed by Fly.io |
| Application logs | 30 days | `fly logs` |

---

## 10. Appendices

### Appendix A: Quick Command Reference

```bash
# STATUS
./database-maintenance.sh --status

# FULL MAINTENANCE
./database-maintenance.sh                    # (during window)
./database-maintenance.sh --force            # (override window)
./database-maintenance.sh --dry-run          # (simulate)

# INDIVIDUAL TASKS
./database-maintenance.sh --vacuum-only      # VACUUM + ANALYZE
./database-maintenance.sh --indexes-only     # Index rebuild
./database-maintenance.sh --cleanup-only     # Orphan cleanup

# MANUAL QUERIES
# VACUUM specific table
psql "$DEEPSYNAPS_DATABASE_URL" -c "VACUUM ANALYZE public.users;"

# Check bloat
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    SELECT schemaname, tablename, n_live_tup, n_dead_tup,
           round(n_dead_tup::numeric/nullif(n_live_tup,0)*100, 2) as bloat_pct
    FROM pg_stat_user_tables
    ORDER BY n_dead_tup DESC
    LIMIT 10;
"

# Check connections
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    SELECT state, count(*) 
    FROM pg_stat_activity 
    WHERE datname = current_database()
    GROUP BY state;
"

# Database size
psql "$DEEPSYNAPS_DATABASE_URL" -c "
    SELECT pg_size_pretty(pg_database_size(current_database()));
"
```

### Appendix B: Maintenance Schedule

| Environment | Frequency | Window | Tasks |
|-------------|-----------|--------|-------|
| Production | Weekly (Sunday) | 02:00-06:00 UTC | All tasks |
| Staging | Weekly (Saturday) | 02:00-06:00 UTC | All tasks |
| Development | Monthly | Manual | VACUUM only |

### Appendix C: Performance Baselines

| Metric | Healthy Threshold | Warning | Critical |
|--------|------------------|---------|----------|
| Query p95 latency | < 100ms | 100-500ms | > 500ms |
| Table bloat | < 30% | 30-50% | > 50% |
| Index bloat | < 30% | 30-50% | > 50% |
| Dead tuples | < 10% of live | 10-25% | > 25% |
| Active connections | < 80% max | 80-95% | > 95% |
| Disk utilization | < 70% | 70-85% | > 85% |

### Appendix D: Related Documents

| Document | ID | Location |
|----------|-----|----------|
| Backup and Restore Runbook | RUN-001 | `docs/runbooks/backup-restore-runbook.md` |
| Disaster Recovery Runbook | RUN-002 | `docs/runbooks/disaster-recovery-runbook.md` |
| Infrastructure Architecture | ARC-001 | `docs/architecture/infrastructure.md` |

### Appendix E: Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0.0 | 2025-01-15 | Infra Team | Production-ready, clinical hours support |
| 1.1.0 | 2024-11-01 | Infra Team | Added SQLite maintenance |
| 1.0.0 | 2024-09-15 | Infra Team | Initial maintenance runbook |

---

**END OF DOCUMENT**

*For questions: infrastructure@deepsynaps.com or Slack #infrastructure*
