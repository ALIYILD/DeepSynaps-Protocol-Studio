# DeepSynaps Protocol Studio — Startup Health Check Matrix

> **Version:** 1.0.0  
> **Last Updated:** 2025-01-15  
> **Owner:** Platform Engineering  
> **Application:** DeepSynaps Protocol Studio (FastAPI)  
> **Environment:** Fly.io (Production / Staging / Development / Test)  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Phase 1: Pre-Startup Checks](#2-phase-1-pre-startup-checks)
3. [Phase 2: Startup Sequence Checks](#3-phase-2-startup-sequence-checks)
4. [Phase 3: HTTP Health Endpoint Matrix](#4-phase-3-http-health-endpoint-matrix)
5. [Phase 4: Dependency Health Checks](#5-phase-4-dependency-health-checks)
6. [Phase 5: Worker Health Checks](#6-phase-5-worker-health-checks)
7. [Phase 6: Python Health Check Script](#7-phase-6-python-health-check-script)
8. [Appendix: Environment Variable Reference](#appendix-environment-variable-reference)
9. [Appendix: Escalation Runbook](#appendix-escalation-runbook)

---

## 1. Overview

### 1.1 Purpose

This document defines the complete health check matrix for DeepSynaps Protocol Studio's startup sequence, runtime dependencies, and background workers. It serves as the single source of truth for:

- **CI/CD pipelines** — validating deployment readiness before promotion
- **Fly.io orchestrator** — determining container health via `[[http_service.checks]]`
- **Monitoring & alerting** — triggering PagerDuty/OpsGenie when checks fail
- **On-call engineers** — providing structured remediation steps

### 1.2 Application Startup Sequence

The application uses FastAPI's `lifespan` context manager. The following sequence executes on every cold start:

```
Step 01: os.makedirs(settings.media_storage_root, exist_ok=True)
Step 02: init_database()                              -- Alembic migrations
Step 03: seed_clinical_dataset(session)                -- Evidence DB population
Step 04: seed_default_agent_skills(session)            -- AI agent skill catalog
Step 05: _seed_demo_users_for_dev(session)             -- ONLY if env in ("development", "test")
Step 06: seed_demo_clinic_data(session)                -- ONLY if demo_seed_enabled(app_env) AND not pytest
Step 07: seed_demo_clinic(session)                     -- Scheduling data, same gates
Step 08: start_scheduler()                             -- Agent cron, gated by env
Step 09: start_auto_page_worker()                      -- Gated by DEEPSYNAPS_AUTO_PAGE_ENABLED
Step 10: start_caregiver_email_digest_worker()         -- Gated by DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED
Step 11: start_qeeg_105_worker()                       -- Gated by DEEPSYNAPS_QEEG_105_WORKER_ENABLED
Step 12: voice_warmup()                                -- Gated by DEEPSYNAPS_VOICE_WARMUP=1
```

### 1.3 Fly.io Health Check Configuration

```toml
[[http_service.checks]]
  method       = "GET"
  timeout      = "5s"
  path         = "/health"
  interval     = "15s"
  grace_period = "10s"
```

| Parameter | Value | Description |
|-----------|-------|-------------|
| `method` | `GET` | HTTP verb for the check |
| `timeout` | `5s` | Maximum time to wait for a response |
| `path` | `/health` | Endpoint path on the application |
| `interval` | `15s` | Time between consecutive checks |
| `grace_period` | `10s` | Time after startup before checks begin |

### 1.4 Health Check Severity Levels

| Level | Color | Description | Action |
|-------|-------|-------------|--------|
| `CRITICAL` | Red | Service cannot function; immediate intervention required | Halt deployment, page on-call |
| `WARNING` | Yellow | Service degraded but functional; intervention within 30 min | Log alert, notify Slack #alerts |
| `INFO` | Blue | Informational; no immediate action required | Log only, monitor trend |

---

## 2. Phase 1: Pre-Startup Checks

> **Executed by:** Container `ENTRYPOINT` script (`docker-entrypoint.sh`)  
> **Execution order:** Before `uvicorn` is spawned  
> **Timeout budget:** 30 seconds total  
> **On failure:** Container exits with non-zero code; Fly.io retries deployment

---

### Check 1.1: File System Writable

```yaml
Check ID:          PRE_STARTUP_001
Name:              File System Writable
Severity:          CRITICAL
Category:          Filesystem
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | The application can write to `/data` (persistent volume) and `/tmp` (ephemeral) |
| **Command** | `touch /data/.write_test && rm /data/.write_test && touch /tmp/.write_test && rm /tmp/.write_test` |
| **Expected behavior** | Both `touch` and `rm` operations succeed with exit code `0` |
| **Timeout** | `5s` |
| **On-failure action** | Exit code `101`; Fly.io marks deployment failed; log `FATAL: Persistent volume /data not writable` |
| **Log evidence** | `pre_startup:filesystem_write:OK /data` or `pre_startup:filesystem_write:FAIL <error>` |
| **Remediation** | 1. Verify volume is mounted: `df -h \| grep /data`  <br>2. Check permissions: `ls -la /data` <br>3. If permission denied, ensure `USER` in Dockerfile matches volume owner <br>4. If volume not mounted, check `fly.toml` `mounts` section |

---

### Check 1.2: Persistent Volume Mounted

```yaml
Check ID:          PRE_STARTUP_002
Name:              Persistent Volume Mounted
Severity:          CRITICAL
Category:          Filesystem
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | The persistent volume (`/data`) is actually mounted, not just an empty directory |
| **Command** | `mountpoint -q /data` |
| **Expected behavior** | Exit code `0` with no output |
| **Timeout** | `3s` |
| **On-failure action** | Exit code `102`; log `FATAL: /data is not a mountpoint` |
| **Log evidence** | `pre_startup:volume_mount:OK` or `pre_startup:volume_mount:FAIL` |
| **Remediation** | 1. Check `fly.toml` mounts: `fly config show` <br>2. Verify volume exists: `fly volumes list` <br>3. If volume exists but not mounted, restart machine: `fly machine restart` <br>4. If volume missing, restore from latest backup: `fly volumes create --snapshot-id <id>` |

---

### Check 1.3: Secrets Available

```yaml
Check ID:          PRE_STARTUP_003
Name:              Required Secrets Available
Severity:          CRITICAL
Category:          Configuration
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | All required secrets are present in the environment |
| **Required secrets** | `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, `DEEPSYNAPS_ENV` |
| **Optional secrets** | `STRIPE_API_KEY`, `SENTRY_DSN`, `SMTP_PASSWORD` |
| **Command** | Shell function `check_secret()` that validates each secret exists and is non-empty |
| **Expected behavior** | All 4 required secrets present with non-empty values |
| **Timeout** | `2s` |
| **On-failure action** | Exit code `103`; log `FATAL: Missing required secret: <secret_name>` |
| **Log evidence** | `pre_startup:secrets:OK 4/4 required` or `pre_startup:secrets:FAIL missing=<name>` |
| **Remediation** | 1. Check secret exists: `fly secrets list` <br>2. Set missing secret: `fly secrets set <NAME>=<VALUE>` <br>3. Verify secret is not empty string <br>4. Redeploy after secrets are set |

---

### Check 1.4: Network Connectivity

```yaml
Check ID:          PRE_STARTUP_004
Name:              Network Connectivity
Severity:          CRITICAL
Category:          Network
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Outbound network connectivity to Fly.io internal network and external services |
| **Internal target** | `private-networking.fly.dev` (or internal DNS resolver) |
| **External targets** | `api.stripe.com`, `api.fda.gov` (if Stripe/OpenFDA configured) |
| **Command** | `nc -z -w 3 <host> <port>` for each target |
| **Expected behavior** | `nc` returns exit code `0` for all targets |
| **Timeout** | `10s` total (5s per target) |
| **On-failure action** | Exit code `104`; log `FATAL: Network connectivity check failed for <target>` |
| **Log evidence** | `pre_startup:network:OK all_targets` or `pre_startup:network:FAIL unreachable=<target>` |
| **Remediation** | 1. Check Fly.io status page: `status.fly.io` <br>2. Verify DNS resolution: `nslookup <target>` <br>3. Check if outbound traffic is blocked by firewall <br>4. Restart machine to get new network lease <br>5. If persistent, open Fly.io support ticket |

---

### Check 1.5: PostgreSQL DNS Resolvable

```yaml
Check ID:          PRE_STARTUP_005
Name:              PostgreSQL DNS Resolvable
Severity:          CRITICAL
Category:          Database
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | The `DATABASE_URL` hostname resolves to an IP address |
| **Command** | Extract hostname from `DATABASE_URL`, run `getent hosts <hostname>` |
| **Expected behavior** | Returns at least one A/AAAA record |
| **Timeout** | `3s` |
| **On-failure action** | Exit code `105`; log `FATAL: PostgreSQL host <hostname> not resolvable` |
| **Log evidence** | `pre_startup:pg_dns:OK <ip_address>` or `pre_startup:pg_dns:FAIL NXDOMAIN` |
| **Remediation** | 1. Verify Fly Postgres is running: `fly status --app <pg-app>` <br>2. Check if DATABASE_URL is stale (after PG replacement) <br>3. Update DATABASE_URL with new hostname <br>4. Check internal DNS: `fly dig <hostname>` |

---

### Check 1.6: Redis DNS Resolvable

```yaml
Check ID:          PRE_STARTUP_006
Name:              Redis DNS Resolvable
Severity:          CRITICAL
Category:          Cache
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | The `REDIS_URL` (Upstash) hostname resolves to an IP address |
| **Command** | Extract hostname from `REDIS_URL`, run `getent hosts <hostname>` |
| **Expected behavior** | Returns at least one A/AAAA record |
| **Timeout** | `3s` |
| **On-failure action** | Exit code `106`; log `FATAL: Redis host <hostname> not resolvable` |
| **Log evidence** | `pre_startup:redis_dns:OK <ip_address>` or `pre_startup:redis_dns:FAIL NXDOMAIN` |
| **Remediation** | 1. Verify Upstash cluster status in console <br>2. Check if REDIS_URL is correct <br>3. Test connectivity: `redis-cli -u $REDIS_URL PING` <br>4. If persistent, rotate Upstash credentials |

---

### Check 1.7: Disk Space Available

```yaml
Check ID:          PRE_STARTUP_007
Name:              Disk Space Available
Severity:          WARNING
Category:          Filesystem
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Persistent volume has at least 20% free space |
| **Command** | `df -h /data \| awk 'NR==2 {gsub(/%/,""); print $5}'` |
| **Expected behavior** | Used percentage `< 80%` |
| **Timeout** | `2s` |
| **On-failure action** | Log `WARN: Disk usage at <N>%, cleanup recommended` but DO NOT block startup |
| **Log evidence** | `pre_startup:disk_space:OK <used>%` or `pre_startup:disk_space:WARN <used>%` |
| **Remediation** | 1. Identify large files: `du -sh /data/* \| sort -rh \| head -20` <br>2. Clean old media files if safe <br>3. If persistent, expand volume: `fly volumes extend <id> --size <new_gb>` |

---

### Check 1.8: Environment Validation

```yaml
Check ID:          PRE_STARTUP_008
Name:              Environment Validation
Severity:          CRITICAL
Category:          Configuration
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | `DEEPSYNAPS_ENV` is one of the valid values |
| **Valid values** | `production`, `staging`, `development`, `test` |
| **Command** | `echo "$DEEPSYNAPS_ENV" \| grep -Eq '^(production\|staging\|development\|test)$'` |
| **Expected behavior** | Pattern match succeeds |
| **Timeout** | `1s` |
| **On-failure action** | Exit code `108`; log `FATAL: DEEPSYNAPS_ENV=<value> is not a valid environment` |
| **Log evidence** | `pre_startup:env:OK env=<value>` or `pre_startup:env:FAIL invalid=<value>` |
| **Remediation** | 1. Set correct environment: `fly secrets set DEEPSYNAPS_ENV=production` <br>2. Verify value is lowercase and matches Fly.io app purpose |

---

### Phase 1 Summary Table

| Check ID | Name | Severity | Timeout | Exit Code on Failure |
|----------|------|----------|---------|---------------------|
| PRE_STARTUP_001 | File System Writable | CRITICAL | 5s | 101 |
| PRE_STARTUP_002 | Persistent Volume Mounted | CRITICAL | 3s | 102 |
| PRE_STARTUP_003 | Required Secrets Available | CRITICAL | 2s | 103 |
| PRE_STARTUP_004 | Network Connectivity | CRITICAL | 10s | 104 |
| PRE_STARTUP_005 | PostgreSQL DNS Resolvable | CRITICAL | 3s | 105 |
| PRE_STARTUP_006 | Redis DNS Resolvable | CRITICAL | 3s | 106 |
| PRE_STARTUP_007 | Disk Space Available | WARNING | 2s | — (non-blocking) |
| PRE_STARTUP_008 | Environment Validation | CRITICAL | 1s | 108 |

---

## 3. Phase 2: Startup Sequence Checks

> **Executed by:** FastAPI lifespan context manager  
> **Execution order:** Sequential, as defined in `app/main.py`  
> **Timeout budget:** 120 seconds total (configurable via `DEEPSYNAPS_STARTUP_TIMEOUT`)  
> **On failure:** Lifespan exits, app never starts accepting requests  

---

### Check 2.1: Media Storage Directory Creation

```yaml
Check ID:          STARTUP_001
Step:              01
Name:              Media Storage Directory Creation
Gated:             No (always executes)
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `os.makedirs(settings.media_storage_root, exist_ok=True)` |
| **What it validates** | The media storage directory exists and is writable on the persistent volume |
| **Expected behavior** | Directory created (if missing) or confirmed existing; no exception raised |
| **Timeout** | `5s` (built into OS call) |
| **On-failure action** | `OSError` propagates; lifespan exits; app fails to start |
| **Log evidence** | `startup:step_01:OK dir=<media_storage_root>` or `startup:step_01:FAIL error=<exception>` |
| **Remediation** | 1. Verify volume is mounted: `mountpoint /data` <br>2. Check permissions on parent directory <br>3. Verify `media_storage_root` setting points to `/data/...` not ephemeral path |
| **Metrics exposed** | `startup_step_duration_seconds{step="01_media_dir"}` |

---

### Check 2.2: Database Migration (Alembic)

```yaml
Check ID:          STARTUP_002
Step:              02
Name:              Database Migration
Gated:             No (always executes)
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `init_database()` — runs `alembic upgrade head` |
| **What it validates** | PostgreSQL is reachable and all Alembic migrations are applied |
| **Expected behavior** | Alembic exits `0`; all pending migrations applied; schema matches `head` |
| **Timeout** | `60s` (configurable via `DEEPSYNAPS_MIGRATION_TIMEOUT`) |
| **On-failure action** | `CommandError` or `OperationalError` propagates; app fails to start |
| **Log evidence** | `startup:step_02:OK revision=<head>` or `startup:step_02:FAIL revision=<current> error=<msg>` |
| **Remediation** | 1. Check PG connectivity: `psql $DATABASE_URL -c "SELECT 1"` <br>2. Check migration status: `alembic current` <br>3. If migration fails, check for lock: `SELECT * FROM pg_locks WHERE locktype='advisory'` <br>4. If schema drift, run `alembic stamp head` after manual review <br>5. Check migration log for specific SQL failure |

**Detailed migration sub-checks:**

| Sub-check | Validation | Timeout |
|-----------|------------|---------|
| `PG_CONNECT` | TCP connection to PostgreSQL | `5s` |
| `AUTH_OK` | Credential authentication | `3s` |
| `DB_EXISTS` | Database exists | `2s` |
| `MIGRATION_TABLE` | `alembic_version` table exists | `2s` |
| `APPLY_MIGRATIONS` | Pending migrations applied | `48s` |

---

### Check 2.3: Clinical Dataset Seeding

```yaml
Check ID:          STARTUP_003
Step:              03
Name:              Clinical Dataset Seeding
Gated:             No (always executes)
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `seed_clinical_dataset(session)` |
| **What it validates** | Evidence DB is populated with clinical datasets; tables created |
| **Expected behavior** | Session commits successfully; clinical evidence records are present |
| **Timeout** | `30s` |
| **On-failure action** | SQLAlchemy exception; app fails to start |
| **Log evidence** | `startup:step_03:OK records=<count>` or `startup:step_03:FAIL error=<exception>` |
| **Remediation** | 1. Check PostgreSQL connection pool <br>2. Verify `clinical_datasets` table schema <br>3. Check for unique constraint violations in seed data <br>4. If duplicate data, check if seed is idempotent (should use `ON CONFLICT`) <br>5. Review seed data JSON/XML files for corruption |

**Data integrity validation:**

| Sub-check | Expected Value |
|-----------|---------------|
| Clinical trials table exists | `SELECT to_regclass('clinical_trials') IS NOT NULL` -> `t` |
| Minimum trial records | `SELECT COUNT(*) FROM clinical_trials` >= `100` |
| Evidence categories populated | `SELECT COUNT(DISTINCT category) FROM clinical_evidence` >= `5` |
| Full-text search indexed | `SELECT indexname FROM pg_indexes WHERE tablename='clinical_trials'` contains `idx_*_search` |

---

### Check 2.4: Agent Skill Catalog Seeding

```yaml
Check ID:          STARTUP_004
Step:              04
Name:              Agent Skill Catalog Seeding
Gated:             No (always executes)
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `seed_default_agent_skills(session)` |
| **What it validates** | AI agent skill catalog is populated with default skill definitions |
| **Expected behavior** | Default skills upserted into `agent_skills` table; session commits |
| **Timeout** | `15s` |
| **On-failure action** | SQLAlchemy exception; app fails to start |
| **Log evidence** | `startup:step_04:OK skills=<count>` or `startup:step_04:FAIL error=<exception>` |
| **Remediation** | 1. Check `agent_skills` table schema <br>2. Verify JSON skill definitions parse correctly <br>3. Ensure seed uses `INSERT ... ON CONFLICT DO NOTHING` for idempotency <br>4. Check for foreign key constraint violations |

**Skill catalog validation:**

| Skill Category | Minimum Skills | Required |
|----------------|---------------|----------|
| Clinical reasoning | 10 | Yes |
| Evidence synthesis | 5 | Yes |
| Patient triage | 5 | Yes |
| Protocol generation | 5 | Yes |
| Data analysis | 3 | Yes |

---

### Check 2.5: Demo Users Seeding (Development Only)

```yaml
Check ID:          STARTUP_005
Step:              05
Name:              Demo Users Seeding
Gated:             Yes (env in ["development", "test"])
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `_seed_demo_users_for_dev(session)` |
| **Gate condition** | `app_env in ("development", "test")` |
| **What it validates** | Demo user accounts are created for local development/testing |
| **Expected behavior** | Demo users created or confirmed existing; no duplicate key errors |
| **Timeout** | `10s` |
| **On-failure action** | Log WARNING; app continues to start (non-blocking) |
| **Log evidence** | `startup:step_05:OK env=<env> users=<count>` or `startup:step_05:WARN error=<exception>` |
| **Remediation** | 1. Check `users` table for existing demo accounts <br>2. Verify demo user credentials are valid <br>3. If duplicate key, demo users likely already seeded; safe to ignore |
| **Security note** | Demo users must NOT be seeded in production. Gate must be verified. |

---

### Check 2.6: Demo Clinic Data Seeding

```yaml
Check ID:          STARTUP_006
Step:              06
Name:              Demo Clinic Data Seeding
Gated:             Yes (demo_seed_enabled(app_env) AND not pytest)
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `seed_demo_clinic_data(session)` |
| **Gate condition** | `demo_seed_enabled(app_env) is True` and `sys.argv[0]` does not contain `pytest` |
| **What it validates** | Demo clinic data (patients, appointments, protocols) is seeded |
| **Expected behavior** | Demo records created/confirmed; session commits |
| **Timeout** | `15s` |
| **On-failure action** | Log WARNING; app continues (non-blocking) |
| **Log evidence** | `startup:step_06:OK clinics=<count> patients=<count>` or `startup:step_06:WARN error=<exception>` |
| **Remediation** | 1. Check `demo_seed_enabled()` returns expected boolean for env <br>2. Verify `patients` and `clinic_data` tables exist <br>3. Check for foreign key constraint issues with clinic references |

---

### Check 2.7: Demo Clinic Scheduling Seeding

```yaml
Check ID:          STARTUP_007
Step:              07
Name:              Demo Clinic Scheduling Seeding
Gated:             Yes (same as Step 06)
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `seed_demo_clinic(session)` |
| **Gate condition** | Same as Step 06: `demo_seed_enabled(app_env) AND not pytest` |
| **What it validates** | Scheduling data (slots, templates, recurring patterns) is seeded |
| **Expected behavior** | Scheduling records created/confirmed; session commits |
| **Timeout** | `10s` |
| **On-failure action** | Log WARNING; app continues (non-blocking) |
| **Log evidence** | `startup:step_07:OK schedules=<count>` or `startup:step_07:WARN error=<exception>` |
| **Remediation** | 1. Verify scheduling tables exist (`schedules`, `time_slots`, `recurring_patterns`) <br>2. Check for timezone handling errors in seed data <br>3. Ensure date formats are ISO-8601 in seed files |

---

### Check 2.8: Agent Scheduler Startup

```yaml
Check ID:          STARTUP_008
Step:              08
Name:              Agent Scheduler Startup
Gated:             Yes (gated by environment)
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `start_scheduler()` |
| **Gate condition** | Enabled for production/staging; disabled for test |
| **What it validates** | Cron-based agent scheduler starts and registers all scheduled jobs |
| **Expected behavior** | Scheduler daemon starts; all cron jobs registered; no port conflicts |
| **Timeout** | `10s` |
| **On-failure action** | Exception propagates; app fails to start |
| **Log evidence** | `startup:step_08:OK jobs=<count>` or `startup:step_08:FAIL error=<exception>` |
| **Remediation** | 1. Check if another scheduler instance is running (port/file lock) <br>2. Verify cron job definitions are valid <br>3. Check scheduler log for job registration errors <br>4. Ensure `APScheduler` can write state to Redis |

**Scheduled jobs registry:**

| Job ID | Schedule | Description | Critical |
|--------|----------|-------------|----------|
| `evidence_sync` | `@hourly` | Sync clinical evidence from external sources | Yes |
| `protocol_cleanup` | `@daily` | Expire old draft protocols | Yes |
| `report_generation` | Every 6h | Generate pending clinical reports | Yes |
| `audit_archive` | `@weekly` | Archive old audit logs | No |

---

### Check 2.9: Auto-Page Worker Startup

```yaml
Check ID:          STARTUP_009
Step:              09
Name:              Auto-Page Worker Startup
Gated:             Yes (DEEPSYNAPS_AUTO_PAGE_ENABLED)
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `start_auto_page_worker()` |
| **Gate condition** | `os.environ.get("DEEPSYNAPS_AUTO_PAGE_ENABLED", "") in ("1", "true", "yes")` |
| **What it validates** | Auto-page worker thread/process starts and connects to Redis queue |
| **Expected behavior** | Worker starts; consumes from `auto_page` queue; health check passes |
| **Timeout** | `10s` |
| **On-failure action** | Log WARNING; app continues (worker is non-critical) |
| **Log evidence** | `startup:step_09:OK worker=auto_page queue=<queue_name>` or `startup:step_09:WARN error=<exception>` |
| **Remediation** | 1. Check `DEEPSYNAPS_AUTO_PAGE_ENABLED` env var <br>2. Verify Redis connection for queue <br>3. Check worker process health: `ps aux \| grep auto_page` <br>4. Review worker logs for connection errors |

---

### Check 2.10: Caregiver Email Digest Worker Startup

```yaml
Check ID:          STARTUP_010
Step:              10
Name:              Caregiver Email Digest Worker Startup
Gated:             Yes (DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED)
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `start_caregiver_email_digest_worker()` |
| **Gate condition** | `os.environ.get("DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED", "") in ("1", "true", "yes")` |
| **What it validates** | Email digest worker for caregivers starts and connects to SMTP |
| **Expected behavior** | Worker starts; SMTP connection verified; queue consumption begins |
| **Timeout** | `15s` |
| **On-failure action** | Log WARNING; app continues (non-critical) |
| **Log evidence** | `startup:step_10:OK worker=digest smtp=<host>` or `startup:step_10:WARN error=<exception>` |
| **Remediation** | 1. Check `DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED` env var <br>2. Verify SMTP configuration (host, port, credentials) <br>3. Test SMTP connection: `openssl s_client -connect <smtp_host>:587` <br>4. Check if SMTP provider has rate-limited the account |

---

### Check 2.11: qEEG 105 Worker Startup

```yaml
Check ID:          STARTUP_011
Step:              11
Name:              qEEG 105 Worker Startup
Gated:             Yes (DEEPSYNAPS_QEEG_105_WORKER_ENABLED)
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `start_qeeg_105_worker()` |
| **Gate condition** | `os.environ.get("DEEPSYNAPS_QEEG_105_WORKER_ENABLED", "") in ("1", "true", "yes")` |
| **What it validates** | qEEG 105 analysis worker starts and can access compute resources |
| **Expected behavior** | Worker starts; numpy/scipy imports succeed; queue consumption begins |
| **Timeout** | `20s` |
| **On-failure action** | Log WARNING; app continues (non-critical) |
| **Log evidence** | `startup:step_11:OK worker=qeeg_105` or `startup:step_11:WARN error=<exception>` |
| **Remediation** | 1. Check `DEEPSYNAPS_QEEG_105_WORKER_ENABLED` env var <br>2. Verify scientific Python dependencies installed: `pip list \| grep -E 'numpy\|scipy'` <br>3. Check available memory for qEEG computations <br>4. Verify model weights/files are accessible <br>5. Check queue connection to Redis |

---

### Check 2.12: Voice Warm-Up

```yaml
Check ID:          STARTUP_012
Step:              12
Name:              Voice Warm-Up
Gated:             Yes (DEEPSYNAPS_VOICE_WARMUP=1)
Severity:          INFO
```

| Attribute | Value |
|-----------|-------|
| **Code executed** | `voice_warmup()` (pre-loads TTS model into GPU/CPU memory) |
| **Gate condition** | `os.environ.get("DEEPSYNAPS_VOICE_WARMUP", "") == "1"` |
| **What it validates** | TTS model can be loaded into memory; inference pipeline is functional |
| **Expected behavior** | Model loaded; sample inference completes without error; model stays resident |
| **Timeout** | `60s` |
| **On-failure action** | Log WARNING; app continues (voice is non-critical) |
| **Log evidence** | `startup:step_12:OK model=<model_name> device=<gpu\|cpu>` or `startup:step_12:WARN error=<exception>` |
| **Remediation** | 1. Check `DEEPSYNAPS_VOICE_WARMUP` env var <br>2. Verify GPU availability: `nvidia-smi` (if CUDA expected) <br>3. Check model file exists and is not corrupted <br>4. Verify sufficient GPU memory: model size + working buffer <br>5. If OOM, reduce batch size or fall back to CPU inference |

---

### Phase 2 Summary Table

| Check ID | Step | Name | Gated | Severity | Timeout |
|----------|------|------|-------|----------|---------|
| STARTUP_001 | 01 | Media Storage Directory | No | CRITICAL | 5s |
| STARTUP_002 | 02 | Database Migration | No | CRITICAL | 60s |
| STARTUP_003 | 03 | Clinical Dataset Seeding | No | CRITICAL | 30s |
| STARTUP_004 | 04 | Agent Skill Catalog | No | CRITICAL | 15s |
| STARTUP_005 | 05 | Demo Users | Dev/Test only | WARNING | 10s |
| STARTUP_006 | 06 | Demo Clinic Data | Demo gate | WARNING | 15s |
| STARTUP_007 | 07 | Demo Clinic Scheduling | Demo gate | WARNING | 10s |
| STARTUP_008 | 08 | Agent Scheduler | Env gate | CRITICAL | 10s |
| STARTUP_009 | 09 | Auto-Page Worker | Feature flag | WARNING | 10s |
| STARTUP_010 | 10 | Caregiver Digest Worker | Feature flag | WARNING | 15s |
| STARTUP_011 | 11 | qEEG 105 Worker | Feature flag | WARNING | 20s |
| STARTUP_012 | 12 | Voice Warm-Up | Feature flag | INFO | 60s |

---

## 4. Phase 3: HTTP Health Endpoint Matrix

> **Served by:** Uvicorn workers (via FastAPI routers)  
> **Base URL:** `http://<app>.internal:8080` (internal) or `https://<app>.fly.dev` (external)  
> **Common headers:** `Content-Type: application/json`  
> **Authentication:** None for health endpoints (unauthenticated by design)

---

### Endpoint 3.1: GET /health (Primary Health Check)

```yaml
Endpoint ID:       HTTP_001
Method:            GET
Path:              /health
Fly.io check:      Yes (used by [[http_service.checks]])
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **Expected status code** | `200 OK` |
| **Expected response body** | `{"status": "healthy", "version": "<git_sha>", "timestamp": "<ISO8601>", "uptime_seconds": <float>, "environment": "<env>"}` |
| **Timeout** | `5s` (Fly.io enforced) |
| **Retry policy** | Immediate retry once, then 5s exponential backoff (max 3 retries) |
| **On-failure escalation** | Fly.io restarts container after 3 consecutive failures |
| **Critical fields** | `status` must be exactly `"healthy"` |
| **Additional checks** | `timestamp` within 60s of current time |
| **Log evidence** | `http:health:200 status=healthy` or `http:health:503 status=unhealthy` |
| **Remediation (500)** | 1. Check application logs for startup errors <br>2. Verify all Phase 2 steps completed <br>3. Check database connection pool saturation <br>4. Restart container if persistent |
| **Remediation (503)** | 1. App may still be starting; check `grace_period` <br>2. Verify lifespan hasn't hung on a seeding step <br>3. Check if DB migration is still running |

**Fly.io behavior:**

| Consecutive Failures | Action |
|---------------------|--------|
| 1 | Log failure, continue routing |
| 2 | Mark instance as degraded |
| 3 | Trigger container restart |
| 6 | Consider instance unhealthy, route to other instances |

---

### Endpoint 3.2: GET /metrics (Prometheus Metrics)

```yaml
Endpoint ID:       HTTP_002
Method:            GET
Path:              /metrics
Fly.io check:      No
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Expected status code** | `200 OK` |
| **Expected response body** | Prometheus exposition format (`# HELP`, `# TYPE`, metric lines) |
| **Key metrics present** | `up 1`, `python_info`, `process_virtual_memory_bytes`, `request_duration_seconds` |
| **Timeout** | `5s` |
| **Retry policy** | 2 retries with 3s delay |
| **On-failure escalation** | Alert to #monitoring Slack channel; metrics pipeline degraded |
| **Log evidence** | `http:metrics:200 metrics=<count>` or `http:metrics:500 error=<msg>` |
| **Remediation (500)** | 1. Check Prometheus client library version <br>2. Verify no label cardinality explosion <br>3. Check for metrics registration conflicts |
| **Remediation (404)** | 1. Verify Prometheus middleware is mounted <br>2. Check `/metrics` route registration in FastAPI |

**Required metrics for health inference:**

| Metric Name | Type | Purpose |
|-------------|------|---------|
| `up` | gauge | Binary: 1 = app running, 0 = down |
| `app_start_duration_seconds` | summary | Total startup time |
| `db_pool_available_connections` | gauge | Available DB connections |
| `redis_latency_seconds` | histogram | Redis round-trip latency |
| `request_duration_seconds` | histogram | HTTP request latency |
| `startup_step_duration_seconds` | summary | Per-step startup timing |
| `worker_queue_depth` | gauge | Background job queue depth |

---

### Endpoint 3.3: GET /api/v1/openapi.json (API Specification)

```yaml
Endpoint ID:       HTTP_003
Method:            GET
Path:              /api/v1/openapi.json
Fly.io check:      No
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Expected status code** | `200 OK` |
| **Expected response body** | Valid OpenAPI 3.0 JSON specification |
| **Validation criteria** | JSON parseable; `openapi` field starts with `3.`; `paths` has > 10 keys |
| **Timeout** | `5s` |
| **Retry policy** | 2 retries with 2s delay |
| **On-failure escalation** | API documentation broken; SDK generation may fail |
| **Log evidence** | `http:openapi:200 paths=<count>` or `http:openapi:500 error=<msg>` |
| **Remediation** | 1. Check FastAPI version compatibility <br>2. Verify no Pydantic model serialization errors <br>3. Check for circular references in schemas <br>4. Review recent route additions for type annotation errors |

---

### Endpoint 3.4: GET /api/v1/knowledge/status (Knowledge Layer Health)

```yaml
Endpoint ID:       HTTP_004
Method:            GET
Path:              /api/v1/knowledge/status
Fly.io check:      No
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **Expected status code** | `200 OK` |
| **Expected response body** | `{"status": "ok", "knowledge_base_version": "<version>", "indexed_documents": <int>, "last_sync": "<ISO8601>", "embedding_model": "<model_name>"}` |
| **Timeout** | `10s` |
| **Retry policy** | 3 retries with 5s exponential backoff |
| **On-failure escalation** | PagerDuty alert for knowledge layer degradation |
| **Critical checks** | `indexed_documents` > 0; `last_sync` within 24h |
| **Log evidence** | `http:knowledge:200 docs=<count>` or `http:knowledge:500/503 error=<msg>` |
| **Remediation (500)** | 1. Check embedding model availability <br>2. Verify vector database connectivity <br>3. Check knowledge base sync job logs <br>4. Re-index if documents count is 0 |
| **Remediation (503)** | 1. Knowledge service may still be initializing <br>2. Check embedding model loading status <br>3. Verify GPU memory if embeddings use CUDA |

---

### Endpoint 3.5: GET /api/v1/evidence/health (Evidence Pipeline Health)

```yaml
Endpoint ID:       HTTP_005
Method:            GET
Path:              /api/v1/evidence/health
Fly.io check:      No
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **Expected status code** | `200 OK` |
| **Expected response body** | `{"status": "ok", "db_status": "connected", "neurosynth_available": <bool>, "openfda_available": <bool>, "last_evidence_sync": "<ISO8601>", "total_evidence_records": <int>}` |
| **Timeout** | `10s` |
| **Retry policy** | 3 retries with 5s exponential backoff |
| **On-failure escalation** | PagerDuty alert for evidence pipeline degradation |
| **Critical checks** | `db_status` == `"connected"`; `total_evidence_records` > 100 |
| **Log evidence** | `http:evidence:200 records=<count>` or `http:evidence:500/503 error=<msg>` |
| **Remediation (500)** | 1. Check PostgreSQL connection pool <br>2. Verify Neurosynth SQLite DB exists: `ls -la /data/neurosynth*` <br>3. Test OpenFDA connectivity (if configured) <br>4. Check last sync job log output <br>5. Review evidence ingestion pipeline for errors |
| **Remediation (503)** | 1. Evidence pipeline may still be initializing <br>2. Check if evidence sync is in progress <br>3. Verify Neurosynth DB is not locked by another process |

**External dependency flags:**

| Dependency | Status Field | Health Threshold |
|------------|-------------|-----------------|
| PostgreSQL | `db_status` | Must be `"connected"` |
| Neurosynth | `neurosynth_available` | Must be `true` |
| OpenFDA | `openfda_available` | Optional; `false` is acceptable |

---

### Endpoint 3.6: GET /api/v1/stripe/status (Stripe Integration)

```yaml
Endpoint ID:       HTTP_006
Method:            GET
Path:              /api/v1/stripe/status
Fly.io check:      No
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Expected status code** | `200 OK` (if Stripe configured) or `404 Not Found` (if Stripe not configured) |
| **Expected response body (200)** | `{"status": "ok", "api_version": "<version>", "webhook_endpoint_active": <bool>, "products_synced": <int>}` |
| **Timeout** | `10s` |
| **Retry policy** | 2 retries with 5s delay |
| **On-failure escalation** | Slack #payments alert; billing may be impacted |
| **Critical checks** | `webhook_endpoint_active` == `true`; `products_synced` > 0 |
| **Log evidence** | `http:stripe:200 webhooks=<bool>` or `http:stripe:500/401 error=<msg>` |
| **Remediation (401)** | 1. Stripe API key is invalid or expired <br>2. Rotate API key in `fly secrets set STRIPE_API_KEY=<new>` <br>3. Verify key has correct permissions |
| **Remediation (500)** | 1. Check Stripe API status: `status.stripe.com` <br>2. Verify webhook endpoint is registered <br>3. Check if products need re-sync <br>4. Review Stripe SDK version compatibility |
| **Remediation (404)** | Stripe integration is disabled; this is expected if `STRIPE_API_KEY` is not set |

---

### Endpoint 3.7: GET /api/v1/qeeg/status (qEEG Pipeline Health)

```yaml
Endpoint ID:       HTTP_007
Method:            GET
Path:              /api/v1/qeeg/status
Fly.io check:      No
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **Expected status code** | `200 OK` |
| **Expected response body** | `{"status": "ok", "model_loaded": <bool>, "gpu_available": <bool>, "queue_depth": <int>, "processed_today": <int>, "average_processing_time_ms": <float>}` |
| **Timeout** | `15s` |
| **Retry policy** | 3 retries with 5s exponential backoff |
| **On-failure escalation** | Slack #clinical-alerts; qEEG analysis pipeline degraded |
| **Critical checks** | `model_loaded` == `true`; `queue_depth` < 100 |
| **Log evidence** | `http:qeeg:200 model=<bool> queue=<depth>` or `http:qeeg:500/503 error=<msg>` |
| **Remediation (500)** | 1. Check if ML model weights are loaded <br>2. Verify GPU/CUDA availability if GPU required <br>3. Check worker process health <br>4. Review queue for stuck jobs <br>5. Restart qEEG worker if model unload detected |
| **Remediation (503)** | 1. qEEG pipeline still initializing <br>2. Check model loading progress in logs <br>3. If GPU OOM, reduce batch size or switch to CPU |

**Performance thresholds:**

| Metric | Warning | Critical |
|--------|---------|----------|
| `queue_depth` | > 50 | > 100 |
| `average_processing_time_ms` | > 5000ms | > 10000ms |
| `processed_today` | < 10 (after noon) | 0 (after noon) |

---

### Endpoint 3.8: GET /api/v1/deeptwin/health (DeepTwin Health)

```yaml
Endpoint ID:       HTTP_008
Method:            GET
Path:              /api/v1/deeptwin/health
Fly.io check:      No
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **Expected status code** | `200 OK` |
| **Expected response body** | `{"status": "ok", "model_version": "<version>", "inference_ready": <bool>, "active_sessions": <int>, "response_latency_ms": <float>}` |
| **Timeout** | `10s` |
| **Retry policy** | 3 retries with 5s exponential backoff |
| **On-failure escalation** | PagerDuty alert; DeepTwin is core clinical feature |
| **Critical checks** | `inference_ready` == `true`; `response_latency_ms` < 5000 |
| **Log evidence** | `http:deeptwin:200 inference=<bool>` or `http:deeptwin:500/503 error=<msg>` |
| **Remediation (500)** | 1. Check DeepTwin model is loaded in memory <br>2. Verify GPU allocation and memory <br>3. Check model version compatibility <br>4. Review inference logs for errors <br>5. If model corrupted, trigger re-download from artifact store |
| **Remediation (503)** | 1. DeepTwin still initializing <br>2. Check model warm-up status <br>3. If cold start expected, increase `grace_period` <br>4. Verify model artifacts are cached on volume |
| **Remediation (latency)** | 1. Check GPU utilization: `nvidia-smi` <br>2. If CPU fallback, latency is expected to be higher <br>3. Consider scaling to GPU-enabled machine: `fly machine update --vm-gpu-kind l40s` |

---

### Phase 3 Summary Table

| Endpoint ID | Method | Path | Fly Check | Severity | Timeout |
|-------------|--------|------|-----------|----------|---------|
| HTTP_001 | GET | `/health` | Yes | CRITICAL | 5s |
| HTTP_002 | GET | `/metrics` | No | WARNING | 5s |
| HTTP_003 | GET | `/api/v1/openapi.json` | No | WARNING | 5s |
| HTTP_004 | GET | `/api/v1/knowledge/status` | No | CRITICAL | 10s |
| HTTP_005 | GET | `/api/v1/evidence/health` | No | CRITICAL | 10s |
| HTTP_006 | GET | `/api/v1/stripe/status` | No | WARNING | 10s |
| HTTP_007 | GET | `/api/v1/qeeg/status` | No | WARNING | 15s |
| HTTP_008 | GET | `/api/v1/deeptwin/health` | No | CRITICAL | 10s |

---

## 5. Phase 4: Dependency Health Checks

> **Executed by:** Background health check coroutine (every 30s)  
> **Triggered by:** `/health` endpoint (inline) and independent monitor  
> **Timeout budget:** 10s per dependency  
> **On failure:** Logged; reflected in `/health` response status

---

### Check 4.1: PostgreSQL Connectivity

```yaml
Check ID:          DEP_001
Name:              PostgreSQL Connectivity
Type:              Database
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | TCP connection + authentication + simple query execution |
| **Check method** | `SELECT 1` via SQLAlchemy connection pool |
| **Expected behavior** | Query returns `[(1,)]` within timeout |
| **Timeout** | `3s` |
| **Retry policy** | 2 retries with 1s delay |
| **On-failure escalation** | `/health` returns `503`; PagerDuty after 2 consecutive failures |
| **Log evidence** | `dep:postgres:OK latency=<ms>` or `dep:postgres:FAIL error=<exception>` |
| **Remediation** | 1. Check PG instance health: `fly status --app <pg-app>` <br>2. Verify connection string <br>3. Check connection pool exhaustion: `SELECT count(*) FROM pg_stat_activity` <br>4. Restart PG proxy if applicable <br>5. If PG disk full, expand volume immediately |

**PostgreSQL sub-metrics:**

| Metric | Warning | Critical |
|--------|---------|----------|
| Connection latency | > 500ms | > 2000ms or timeout |
| Active connections | > 80% of max | 100% of max |
| Replication lag | > 1s | > 10s (if replica) |

---

### Check 4.2: Redis Connectivity

```yaml
Check ID:          DEP_002
Name:              Redis Connectivity
Type:              Cache / Queue
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | TCP connection + AUTH + `PING`/`PONG` |
| **Check method** | `redis_client.ping()` |
| **Expected behavior** | Returns `True` within timeout |
| **Timeout** | `2s` |
| **Retry policy** | 2 retries with 500ms delay |
| **On-failure escalation** | `/health` returns `503`; caching and queueing degraded |
| **Log evidence** | `dep:redis:OK latency=<ms>` or `dep:redis:FAIL error=<exception>` |
| **Remediation** | 1. Check Upstash console for cluster status <br>2. Verify `REDIS_URL` hasn't expired <br>3. Test direct: `redis-cli -u $REDIS_URL PING` <br>4. Check if hitting connection limit <br>5. If persistent, failover to read replica |

**Redis sub-metrics:**

| Metric | Warning | Critical |
|--------|---------|----------|
| Response latency | > 10ms | > 100ms |
| Memory usage | > 80% | > 95% |
| Connected clients | > 80% of max | > 95% of max |
| Evicted keys rate | > 100/min | > 1000/min |

---

### Check 4.3: Volume Free Space

```yaml
Check ID:          DEP_003
Name:              Volume Free Space
Type:              Filesystem
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Persistent volume has sufficient free space for operations |
| **Check method** | `shutil.disk_usage(settings.media_storage_root)` |
| **Expected behavior** | Free space > 20% of total volume |
| **Timeout** | `2s` |
| **Retry policy** | Single check (no retry) |
| **On-failure escalation** | Slack #ops alert; automatic cleanup job triggered |
| **Log evidence** | `dep:volume:OK free=<bytes> pct=<pct>` or `dep:volume:WARN free=<bytes> pct=<pct>` |
| **Remediation** | 1. Identify large directories: `du -sh /data/*` <br>2. Clean temp files and old exports <br>3. Archive old media to S3 if configured <br>4. Expand volume: `fly volumes extend <id> --size <gb>` |

**Disk thresholds:**

| Level | Free Space | Action |
|-------|-----------|--------|
| OK | > 30% | None |
| WARNING | 20-30% | Log alert, trigger cleanup job |
| CRITICAL | < 20% | Page on-call, halt non-essential writes |
| EMERGENCY | < 10% | Read-only mode, emergency cleanup |

---

### Check 4.4: Evidence DB Readable

```yaml
Check ID:          DEP_004
Name:              Evidence DB Readable
Type:              Database
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Neurosynth SQLite DB is present, readable, and has expected tables |
| **Check method** | `sqlite3 /data/neurosynth.db "SELECT name FROM sqlite_master WHERE type='table' LIMIT 1"` |
| **Expected behavior** | Returns at least one table name |
| **Timeout** | `3s` |
| **Retry policy** | 1 retry after 2s |
| **On-failure escalation** | `/health` returns `503`; evidence pipeline degraded |
| **Log evidence** | `dep:evidence_db:OK tables=<count>` or `dep:evidence_db:FAIL error=<exception>` |
| **Remediation** | 1. Verify DB file exists: `ls -la /data/neurosynth.db` <br>2. Check file permissions and ownership <br>3. If corrupted, restore from backup or re-initialize <br>4. Verify DB is not locked by concurrent process <br>5. If missing, trigger re-download from artifact store |

**Evidence DB validation:**

| Table | Min Records | Purpose |
|-------|-------------|---------|
| `studies` | 10,000 | Neuroimaging studies |
| `terms` | 1,000 | Cognitive/neural terms |
| `mappings` | 50,000 | Study-to-term mappings |

---

### Check 4.5: External API Connectivity — OpenFDA

```yaml
Check ID:          DEP_005
Name:              OpenFDA API Connectivity
Type:              External API
Severity:          INFO
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | OpenFDA API is reachable and returning valid responses |
| **Check method** | `GET https://api.fda.gov/drug/event.json?limit=1` |
| **Expected behavior** | HTTP `200` with valid JSON body |
| **Timeout** | `5s` |
| **Retry policy** | 2 retries with 3s delay |
| **On-failure escalation** | Log INFO only; app functions without OpenFDA |
| **Log evidence** | `dep:openfda:OK latency=<ms>` or `dep:openfda:INFO unavailable` |
| **Remediation** | 1. Check OpenFDA status page <br>2. Verify no rate limiting (max 240 req/min with key) <br>3. Check API key validity if using authenticated endpoint <br>4. If persistent, evidence pipeline continues with cached data |

---

### Check 4.6: External API Connectivity — Stripe

```yaml
Check ID:          DEP_006
Name:              Stripe API Connectivity
Type:              External API
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Stripe API is reachable (if configured) |
| **Check method** | `stripe.Account.retrieve()` or `GET https://api.stripe.com/v1/account` |
| **Expected behavior** | HTTP `200` with account object |
| **Timeout** | `5s` |
| **Retry policy** | 2 retries with 3s delay |
| **On-failure escalation** | Slack #payments alert; billing operations paused |
| **Log evidence** | `dep:stripe:OK account=<id>` or `dep:stripe:WARN error=<code>` |
| **Remediation** | 1. Check Stripe status page <br>2. Verify API key and permissions <br>3. Check if account is in test mode vs live mode mismatch <br>4. Review webhook configuration if payments failing |

---

### Check 4.7: Sentry Integration

```yaml
Check ID:          DEP_007
Name:              Sentry Integration
Type:              Monitoring
Severity:          INFO
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Sentry DSN is valid and events can be sent |
| **Check method** | `sentry_sdk.capture_message("health_check")` and verify transmission |
| **Expected behavior** | Message transmitted without exception |
| **Timeout** | `3s` |
| **Retry policy** | No retry (fire-and-forget) |
| **On-failure escalation** | Log WARNING; error tracking may be offline |
| **Log evidence** | `dep:sentry:OK` or `dep:sentry:WARN dsn_invalid` |
| **Remediation** | 1. Verify `SENTRY_DSN` is valid and not revoked <br>2. Check Sentry project rate limits <br>3. If DSN expired, generate new one in Sentry dashboard <br>4. Update secret: `fly secrets set SENTRY_DSN=<new>` |

---

### Phase 4 Summary Table

| Check ID | Name | Type | Severity | Timeout |
|----------|------|------|----------|---------|
| DEP_001 | PostgreSQL Connectivity | Database | CRITICAL | 3s |
| DEP_002 | Redis Connectivity | Cache | CRITICAL | 2s |
| DEP_003 | Volume Free Space | Filesystem | WARNING | 2s |
| DEP_004 | Evidence DB Readable | Database | CRITICAL | 3s |
| DEP_005 | OpenFDA API | External | INFO | 5s |
| DEP_006 | Stripe API | External | WARNING | 5s |
| DEP_007 | Sentry Integration | Monitoring | INFO | 3s |

---

## 6. Phase 5: Worker Health Checks

> **Executed by:** Background monitoring loop (every 60s)  
> **Exposed via:** `/metrics` endpoint for Prometheus scraping  
> **Timeout budget:** 10s per worker check  
> **On failure:** Worker-specific alerts to designated channels

---

### Check 5.1: qEEG Worker Queue Depth

```yaml
Check ID:          WORKER_001
Name:              qEEG Worker Queue Depth
Worker:            qEEG 105 Worker
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | qEEG analysis job queue is not backing up beyond capacity |
| **Check method** | `redis_client.llen("qeeg:analysis:queue")` |
| **Expected behavior** | Queue depth `< 50` jobs |
| **Timeout** | `2s` |
| **Retry policy** | 1 retry after 1s |
| **Warning threshold** | Queue depth `>= 50` |
| **Critical threshold** | Queue depth `>= 100` |
| **On-failure escalation** | Slack #clinical-alerts; if critical for > 5min, PagerDuty |
| **Log evidence** | `worker:qeeg:queue_depth=<n>` |
| **Remediation** | 1. Check worker process is running: `ps aux \| grep qeeg` <br>2. If worker down, restart: `fly machine restart` <br>3. If queue growing, scale workers: increase `DEEPSYNAPS_QEEG_WORKERS` <br>4. Check for stuck jobs: inspect Redis queue for old entries <br>5. If jobs failing, check worker logs for error patterns |

**Queue depth thresholds:**

| Depth | Status | Action |
|-------|--------|--------|
| 0-25 | Healthy | None |
| 25-50 | Nominal | Monitor |
| 50-100 | Warning | Alert, investigate worker throughput |
| 100+ | Critical | Page on-call, scale workers or pause ingestion |

---

### Check 5.2: Stripe Worker Last Run

```yaml
Check ID:          WORKER_002
Name:              Stripe Worker Last Run
Worker:            Stripe Event Processor
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Stripe event processing worker has run within expected interval |
| **Check method** | `redis_client.get("stripe:last_run_timestamp")` |
| **Expected behavior** | Timestamp within last 15 minutes |
| **Timeout** | `2s` |
| **Retry policy** | 1 retry after 1s |
| **Warning threshold** | Last run > 15 minutes ago |
| **Critical threshold** | Last run > 60 minutes ago |
| **On-failure escalation** | Slack #payments alert |
| **Log evidence** | `worker:stripe:last_run=<timestamp> age=<minutes>` |
| **Remediation** | 1. Check Stripe webhook delivery status in dashboard <br>2. Verify worker process is consuming webhook queue <br>3. Check for failed webhook events <br>4. If worker stuck, restart queue consumer <br>5. Verify Stripe webhook endpoint URL is correct |

---

### Check 5.3: Scheduler Active Jobs

```yaml
Check ID:          WORKER_003
Name:              Scheduler Active Jobs
Worker:            APScheduler (Agent Cron)
Severity:          CRITICAL
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | All scheduled jobs are registered and have run recently |
| **Check method** | Query APScheduler job store + Redis last-run keys |
| **Expected behavior** | All critical jobs have `next_run_time` in the future and `last_run` within 2x their interval |
| **Timeout** | `5s` |
| **Retry policy** | 2 retries with 2s delay |
| **On-failure escalation** | PagerDuty after 2 consecutive failures |
| **Log evidence** | `worker:scheduler:jobs=<count> overdue=<count>` |
| **Remediation** | 1. Check APScheduler process: `ps aux \| grep scheduler` <br>2. Verify job store (Redis) is accessible <br>3. Check for misfire grace time exceeded <br>4. Restart scheduler: `kill -HUP <pid>` or container restart <br>5. If jobs lost, re-register via admin endpoint |

**Job health matrix:**

| Job ID | Interval | Max Last Run Age | Critical |
|--------|----------|-----------------|----------|
| `evidence_sync` | 1h | 3h | Yes |
| `protocol_cleanup` | 24h | 48h | Yes |
| `report_generation` | 6h | 12h | Yes |
| `audit_archive` | 7d | 14d | No |

---

### Check 5.4: Celery Beat Status

```yaml
Check ID:          WORKER_004
Name:              Celery Beat Status
Worker:            Celery Beat Scheduler
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Celery beat is alive and dispatching tasks on schedule |
| **Check method** | `redis_client.get("celery:beat:last_tick")` + inspect scheduled tasks |
| **Expected behavior** | Beat tick timestamp within last 2 minutes |
| **Timeout** | `3s` |
| **Retry policy** | 1 retry after 1s |
| **On-failure escalation** | Slack #ops alert; background tasks may be delayed |
| **Log evidence** | `worker:celery_beat:tick=<timestamp> age=<minutes>` |
| **Remediation** | 1. Check Celery beat process: `ps aux \| grep celery` <br>2. Verify beat schedule is loaded: `celery -A app beat --inspect` <br>3. If beat stuck, restart: `pkill -f "celery beat"` <br>4. Check for clock drift between beat and workers <br>5. Verify Redis broker connection |

---

### Check 5.5: Auto-Page Worker Heartbeat

```yaml
Check ID:          WORKER_005
Name:              Auto-Page Worker Heartbeat
Worker:            Auto-Page Notification Worker
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Auto-page worker is alive and processing notifications |
| **Check method** | `redis_client.get("worker:auto_page:last_heartbeat")` |
| **Expected behavior** | Heartbeat within last 5 minutes |
| **Timeout** | `2s` |
| **Retry policy** | 1 retry after 1s |
| **On-failure escalation** | Slack #alerts; paging may be delayed |
| **Log evidence** | `worker:auto_page:heartbeat=<timestamp>` |
| **Remediation** | 1. Check worker process status <br>2. Verify `DEEPSYNAPS_AUTO_PAGE_ENABLED` flag still set <br>3. If heartbeat stale > 15min, restart worker <br>4. Check notification queue depth |

---

### Check 5.6: Caregiver Digest Worker Heartbeat

```yaml
Check ID:          WORKER_006
Name:              Caregiver Digest Worker Heartbeat
Worker:            Caregiver Email Digest Worker
Severity:          WARNING
```

| Attribute | Value |
|-----------|-------|
| **What it validates** | Digest worker is alive and can send emails |
| **Check method** | `redis_client.get("worker:digest:last_heartbeat")` + SMTP check |
| **Expected behavior** | Heartbeat within last 15 minutes; SMTP connection verified |
| **Timeout** | `3s` |
| **Retry policy** | 1 retry after 1s |
| **On-failure escalation** | Slack #alerts; caregivers not receiving digests |
| **Log evidence** | `worker:digest:heartbeat=<timestamp> smtp=<bool>` |
| **Remediation** | 1. Check worker process status <br>2. Verify SMTP credentials are valid <br>3. Test SMTP: `sendmail` or `openssl s_client` <br>4. If heartbeat stale, restart worker <br>5. Check for email rate limiting |

---

### Phase 5 Summary Table

| Check ID | Name | Worker | Severity | Timeout |
|----------|------|--------|----------|---------|
| WORKER_001 | qEEG Queue Depth | qEEG 105 Worker | WARNING | 2s |
| WORKER_002 | Stripe Last Run | Stripe Event Processor | WARNING | 2s |
| WORKER_003 | Scheduler Active Jobs | APScheduler | CRITICAL | 5s |
| WORKER_004 | Celery Beat Status | Celery Beat | WARNING | 3s |
| WORKER_005 | Auto-Page Heartbeat | Auto-Page Worker | WARNING | 2s |
| WORKER_006 | Digest Heartbeat | Caregiver Digest Worker | WARNING | 3s |

---

## 7. Phase 6: Python Health Check Script

> **Purpose:** Standalone diagnostic tool for CI/CD, monitoring, and on-call troubleshooting  
> **Location:** `scripts/health_check.py` (in repository)  
> **Usage:** `python scripts/health_check.py [--json] [--verbose] [--timeout <sec>]`  
> **Exit codes:** `0` = all healthy, `1` = one or more critical checks failed  

---

### Script: `scripts/health_check.py`

```python
#!/usr/bin/env python3
"""
DeepSynaps Protocol Studio - Comprehensive Health Check Script

Usage:
    python scripts/health_check.py [--json] [--verbose] [--timeout 30]

Exit codes:
    0 - All critical checks passed (healthy)
    1 - One or more critical checks failed (unhealthy)
    2 - Script error (exception during execution)

Environment variables:
    DEEPSYNAPS_ENV          - Application environment (required)
    DATABASE_URL            - PostgreSQL connection string (required)
    REDIS_URL               - Redis connection string (required)
    HEALTH_CHECK_TIMEOUT    - Global timeout in seconds (default: 30)
    HEALTH_BASE_URL         - Base URL for HTTP checks (default: http://localhost:8080)
"""

import argparse
import asyncio
import json
import os
import sys
import time
import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

import httpx
import psycopg2
import redis
import sqlite3


class Severity(Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class Status(Enum):
    OK = "ok"
    FAIL = "fail"
    WARN = "warn"
    SKIP = "skip"
    ERROR = "error"


@dataclass
class CheckResult:
    check_id: str
    name: str
    phase: str
    severity: str
    status: str
    duration_ms: float
    message: str = ""
    details: dict = field(default_factory=dict)
    remediation: str = ""


class HealthChecker:
    """Comprehensive health checker for DeepSynaps Protocol Studio."""

    def __init__(self, base_url: str = "http://localhost:8080", timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.results: list[CheckResult] = []
        self.start_time = time.monotonic()
        self.env = os.environ.get("DEEPSYNAPS_ENV", "unknown")

    def _elapsed_ms(self) -> float:
        return round((time.monotonic() - self.start_time) * 1000, 2)

    def _add_result(
        self,
        check_id: str,
        name: str,
        phase: str,
        severity: Severity,
        status: Status,
        message: str = "",
        details: Optional[dict] = None,
        remediation: str = "",
    ) -> None:
        self.results.append(
            CheckResult(
                check_id=check_id,
                name=name,
                phase=phase,
                severity=severity.value,
                status=status.value,
                duration_ms=self._elapsed_ms(),
                message=message,
                details=details or {},
                remediation=remediation,
            )
        )

    # ========================================================================
    # PHASE 1: Pre-Startup Checks
    # ========================================================================

    def check_filesystem_writable(self) -> None:
        """PRE_STARTUP_001: File system writable check."""
        check_id = "PRE_STARTUP_001"
        name = "File System Writable"
        phase = "pre_startup"
        severity = Severity.CRITICAL
        start = time.monotonic()

        try:
            test_paths = ["/data", "/tmp"]
            for path in test_paths:
                test_file = os.path.join(path, ".health_write_test")
                with open(test_file, "w") as f:
                    f.write("health_check")
                os.remove(test_file)

            self._add_result(
                check_id, name, phase, severity, Status.OK,
                f"Successfully wrote to {', '.join(test_paths)}",
                {"paths_tested": test_paths},
                "N/A",
            )
        except OSError as e:
            self._add_result(
                check_id, name, phase, severity, Status.FAIL,
                f"Cannot write to filesystem: {e}",
                {"error": str(e)},
                "1. Verify volume is mounted: df -h | grep /data\n"
                "2. Check permissions: ls -la /data\n"
                "3. Ensure USER in Dockerfile matches volume owner",
            )

    def check_volume_mounted(self) -> None:
        """PRE_STARTUP_002: Persistent volume mount check."""
        check_id = "PRE_STARTUP_002"
        name = "Persistent Volume Mounted"
        phase = "pre_startup"
        severity = Severity.CRITICAL

        try:
            result = os.system("mountpoint -q /data")
            if result == 0:
                self._add_result(
                    check_id, name, phase, severity, Status.OK,
                    "/data is a mountpoint",
                    {},
                    "N/A",
                )
            else:
                self._add_result(
                    check_id, name, phase, severity, Status.FAIL,
                    "/data is not a mountpoint (local directory)",
                    {},
                    "1. Check fly.toml mounts section\n"
                    "2. Verify volume exists: fly volumes list\n"
                    "3. Restart machine: fly machine restart",
                )
        except Exception as e:
            self._add_result(
                check_id, name, phase, severity, Status.ERROR,
                f"Check failed with exception: {e}",
                {"error": traceback.format_exc()},
                "Check mountpoint binary is installed",
            )

    def check_secrets_available(self) -> None:
        """PRE_STARTUP_003: Required secrets check."""
        check_id = "PRE_STARTUP_003"
        name = "Required Secrets Available"
        phase = "pre_startup"
        severity = Severity.CRITICAL

        required = ["DATABASE_URL", "REDIS_URL", "SECRET_KEY", "DEEPSYNAPS_ENV"]
        optional = ["STRIPE_API_KEY", "SENTRY_DSN", "SMTP_PASSWORD"]
        missing = []
        present = []

        for secret in required:
            value = os.environ.get(secret)
            if not value:
                missing.append(secret)
            else:
                present.append(secret)

        for secret in optional:
            if os.environ.get(secret):
                present.append(secret)

        details = {
            "required_total": len(required),
            "required_present": len([s for s in present if s in required]),
            "optional_present": len([s for s in present if s in optional]),
            "missing": missing,
            "present": present,
        }

        if missing:
            self._add_result(
                check_id, name, phase, severity, Status.FAIL,
                f"Missing required secrets: {', '.join(missing)}",
                details,
                "1. Check secrets: fly secrets list\n"
                "2. Set missing secret: fly secrets set <NAME>=<VALUE>\n"
                "3. Redeploy after secrets are set",
            )
        else:
            self._add_result(
                check_id, name, phase, severity, Status.OK,
                f"All {len(required)} required secrets present",
                details,
                "N/A",
            )

    def check_environment_valid(self) -> None:
        """PRE_STARTUP_008: Environment validation check."""
        check_id = "PRE_STARTUP_008"
        name = "Environment Validation"
        phase = "pre_startup"
        severity = Severity.CRITICAL

        valid_envs = {"production", "staging", "development", "test"}
        env = os.environ.get("DEEPSYNAPS_ENV", "")

        if env in valid_envs:
            self._add_result(
                check_id, name, phase, severity, Status.OK,
                f"DEEPSYNAPS_ENV={env} is valid",
                {"environment": env},
                "N/A",
            )
        else:
            self._add_result(
                check_id, name, phase, severity, Status.FAIL,
                f"DEEPSYNAPS_ENV='{env}' is not valid (must be one of: {valid_envs})",
                {"environment": env, "valid_values": list(valid_envs)},
                "Set correct environment: fly secrets set DEEPSYNAPS_ENV=production",
            )

    def check_disk_space(self) -> None:
        """PRE_STARTUP_007: Disk space check."""
        check_id = "PRE_STARTUP_007"
        name = "Disk Space Available"
        phase = "pre_startup"
        severity = Severity.WARNING

        try:
            stat = os.statvfs("/data")
            total = stat.f_blocks * stat.f_frsize
            free = stat.f_bavail * stat.f_frsize
            used_pct = round((1 - free / total) * 100, 1)

            details = {"total_bytes": total, "free_bytes": free, "used_percent": used_pct}

            if used_pct < 80:
                self._add_result(
                    check_id, name, phase, severity, Status.OK,
                    f"Disk usage at {used_pct}% (threshold: 80%)",
                    details,
                    "N/A",
                )
            else:
                self._add_result(
                    check_id, name, phase, severity, Status.WARN,
                    f"Disk usage at {used_pct}% - cleanup recommended",
                    details,
                    "1. du -sh /data/* | sort -rh | head -20\n"
                    "2. Clean old media files if safe\n"
                    "3. Expand volume: fly volumes extend <id> --size <gb>",
                )
        except Exception as e:
            self._add_result(
                check_id, name, phase, severity, Status.ERROR,
                f"Cannot check disk space: {e}",
                {"error": str(e)},
                "Verify /data is accessible",
            )

    # ========================================================================
    # PHASE 4: Dependency Health Checks
    # ========================================================================

    def check_postgresql(self) -> None:
        """DEP_001: PostgreSQL connectivity check."""
        check_id = "DEP_001"
        name = "PostgreSQL Connectivity"
        phase = "dependency"
        severity = Severity.CRITICAL
        start = time.monotonic()

        try:
            db_url = os.environ.get("DATABASE_URL", "")
            if not db_url:
                self._add_result(
                    check_id, name, phase, severity, Status.SKIP,
                    "DATABASE_URL not set, skipping",
                    {},
                    "Set DATABASE_URL environment variable",
                )
                return

            conn = psycopg2.connect(db_url, connect_timeout=3)
            cursor = conn.cursor()
            cursor.execute("SELECT 1, version()")
            row = cursor.fetchone()
            conn.close()

            latency = round((time.monotonic() - start) * 1000, 2)
            self._add_result(
                check_id, name, phase, severity, Status.OK,
                f"PostgreSQL connected, latency={latency}ms",
                {"version": row[1], "latency_ms": latency},
                "N/A",
            )
        except psycopg2.OperationalError as e:
            self._add_result(
                check_id, name, phase, severity, Status.FAIL,
                f"Cannot connect to PostgreSQL: {e}",
                {"error_type": "OperationalError"},
                "1. fly status --app <pg-app>\n"
                "2. Verify DATABASE_URL\n"
                "3. Check connection pool: SELECT count(*) FROM pg_stat_activity",
            )
        except Exception as e:
            self._add_result(
                check_id, name, phase, severity, Status.ERROR,
                f"Unexpected error: {e}",
                {"error": traceback.format_exc()},
                "Check psycopg2 installation and PostgreSQL driver",
            )

    def check_redis(self) -> None:
        """DEP_002: Redis connectivity check."""
        check_id = "DEP_002"
        name = "Redis Connectivity"
        phase = "dependency"
        severity = Severity.CRITICAL
        start = time.monotonic()

        try:
            redis_url = os.environ.get("REDIS_URL", "")
            if not redis_url:
                self._add_result(
                    check_id, name, phase, severity, Status.SKIP,
                    "REDIS_URL not set, skipping",
                    {},
                    "Set REDIS_URL environment variable",
                )
                return

            client = redis.from_url(redis_url, socket_connect_timeout=3, socket_timeout=3)
            pong = client.ping()
            info = client.info(section="server")
            latency = round((time.monotonic() - start) * 1000, 2)

            self._add_result(
                check_id, name, phase, severity, Status.OK,
                f"Redis connected, latency={latency}ms",
                {"version": info.get("redis_version"), "latency_ms": latency},
                "N/A",
            )
        except redis.ConnectionError as e:
            self._add_result(
                check_id, name, phase, severity, Status.FAIL,
                f"Cannot connect to Redis: {e}",
                {"error_type": "ConnectionError"},
                "1. Check Upstash console\n2. Verify REDIS_URL\n3. redis-cli -u $REDIS_URL PING",
            )
        except Exception as e:
            self._add_result(
                check_id, name, phase, severity, Status.ERROR,
                f"Unexpected error: {e}",
                {"error": traceback.format_exc()},
                "Check redis-py installation",
            )

    def check_evidence_db(self) -> None:
        """DEP_004: Evidence DB (Neurosynth SQLite) check."""
        check_id = "DEP_004"
        name = "Evidence DB Readable"
        phase = "dependency"
        severity = Severity.CRITICAL

        try:
            db_path = "/data/neurosynth.db"
            if not os.path.exists(db_path):
                self._add_result(
                    check_id, name, phase, severity, Status.FAIL,
                    f"Neurosynth DB not found at {db_path}",
                    {"path": db_path},
                    "1. Verify DB file exists\n2. Restore from backup or re-initialize\n"
                    "3. Trigger re-download from artifact store",
                )
                return

            conn = sqlite3.connect(db_path, timeout=5)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            conn.close()

            # Count records in key tables
            counts = {}
            for table in ["studies", "terms", "mappings"]:
                if table in tables:
                    conn = sqlite3.connect(db_path, timeout=5)
                    cursor = conn.cursor()
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    counts[table] = cursor.fetchone()[0]
                    conn.close()

            self._add_result(
                check_id, name, phase, severity, Status.OK,
                f"Neurosynth DB accessible, {len(tables)} tables, key records: {counts}",
                {"tables": tables, "record_counts": counts},
                "N/A",
            )
        except Exception as e:
            self._add_result(
                check_id, name, phase, severity, Status.FAIL,
                f"Cannot read evidence DB: {e}",
                {"error": str(e)},
                "1. Check file permissions\n2. If corrupted, restore from backup",
            )

    async def check_http_endpoints(self) -> None:
        """Phase 3: HTTP endpoint health checks."""
        endpoints = [
            ("HTTP_001", "GET /health", "/health", 200, Severity.CRITICAL),
            ("HTTP_002", "GET /metrics", "/metrics", 200, Severity.WARNING),
            ("HTTP_003", "GET /api/v1/openapi.json", "/api/v1/openapi.json", 200, Severity.WARNING),
            ("HTTP_004", "GET /api/v1/knowledge/status", "/api/v1/knowledge/status", 200, Severity.CRITICAL),
            ("HTTP_005", "GET /api/v1/evidence/health", "/api/v1/evidence/health", 200, Severity.CRITICAL),
            ("HTTP_006", "GET /api/v1/stripe/status", "/api/v1/stripe/status", 200, Severity.WARNING),
            ("HTTP_007", "GET /api/v1/qeeg/status", "/api/v1/qeeg/status", 200, Severity.WARNING),
            ("HTTP_008", "GET /api/v1/deeptwin/health", "/api/v1/deeptwin/health", 200, Severity.CRITICAL),
        ]

        for check_id, name, path, expected_status, severity in endpoints:
            start = time.monotonic()
            url = f"{self.base_url}{path}"
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(url)
                    latency = round((time.monotonic() - start) * 1000, 2)

                    if response.status_code == expected_status:
                        self._add_result(
                            check_id, name, "http_endpoint", severity, Status.OK,
                            f"HTTP {response.status_code}, latency={latency}ms",
                            {"status_code": response.status_code, "latency_ms": latency},
                            "N/A",
                        )
                    elif response.status_code == 404 and "stripe" in path:
                        self._add_result(
                            check_id, name, "http_endpoint", severity, Status.OK,
                            "HTTP 404 - Stripe integration disabled (expected)",
                            {"status_code": 404},
                            "N/A",
                        )
                    else:
                        self._add_result(
                            check_id, name, "http_endpoint", severity, Status.FAIL,
                            f"Expected {expected_status}, got {response.status_code}",
                            {"status_code": response.status_code, "body": response.text[:500]},
                            "Check application logs for errors",
                        )
            except httpx.TimeoutException:
                self._add_result(
                    check_id, name, "http_endpoint", severity, Status.FAIL,
                    "Request timed out after 10s",
                    {"timeout": 10},
                    "1. Check if application is running\n2. Verify network connectivity",
                )
            except Exception as e:
                self._add_result(
                    check_id, name, "http_endpoint", severity, Status.ERROR,
                    f"Request failed: {e}",
                    {"error": str(e)},
                    "Verify base URL and network connectivity",
                )

    def check_worker_queue_depth(self) -> None:
        """WORKER_001: qEEG worker queue depth."""
        check_id = "WORKER_001"
        name = "qEEG Worker Queue Depth"
        phase = "worker"
        severity = Severity.WARNING

        try:
            redis_url = os.environ.get("REDIS_URL", "")
            if not redis_url:
                self._add_result(
                    check_id, name, phase, severity, Status.SKIP,
                    "REDIS_URL not set, skipping",
                    {},
                    "Set REDIS_URL",
                )
                return

            client = redis.from_url(redis_url, socket_connect_timeout=3)
            depth = client.llen("qeeg:analysis:queue") or 0

            details = {"queue_depth": depth, "queue_name": "qeeg:analysis:queue"}

            if depth < 50:
                self._add_result(
                    check_id, name, phase, severity, Status.OK,
                    f"Queue depth: {depth} (threshold: 50)",
                    details,
                    "N/A",
                )
            elif depth < 100:
                self._add_result(
                    check_id, name, phase, severity, Status.WARN,
                    f"Queue depth: {depth} - worker may be falling behind",
                    details,
                    "1. Check worker process status\n2. Consider scaling workers",
                )
            else:
                self._add_result(
                    check_id, name, phase, severity, Status.FAIL,
                    f"Queue depth: {depth} - CRITICAL backlog",
                    details,
                    "1. Restart qEEG worker\n2. Scale workers\n3. Check for stuck jobs",
                )
        except Exception as e:
            self._add_result(
                check_id, name, phase, severity, Status.ERROR,
                f"Cannot check queue: {e}",
                {"error": str(e)},
                "Verify Redis connectivity",
            )

    def check_scheduler_jobs(self) -> None:
        """WORKER_003: Scheduler active jobs."""
        check_id = "WORKER_003"
        name = "Scheduler Active Jobs"
        phase = "worker"
        severity = Severity.CRITICAL

        try:
            redis_url = os.environ.get("REDIS_URL", "")
            if not redis_url:
                self._add_result(
                    check_id, name, phase, severity, Status.SKIP,
                    "REDIS_URL not set, skipping",
                    {},
                    "Set REDIS_URL",
                )
                return

            client = redis.from_url(redis_url, socket_connect_timeout=3)
            last_runs = {}
            critical_jobs = ["evidence_sync", "protocol_cleanup", "report_generation"]
            overdue = []

            for job in critical_jobs:
                ts = client.get(f"scheduler:{job}:last_run")
                if ts:
                    last_runs[job] = ts.decode() if isinstance(ts, bytes) else ts
                else:
                    overdue.append(job)

            details = {"last_runs": last_runs, "overdue_jobs": overdue}

            if not overdue:
                self._add_result(
                    check_id, name, phase, severity, Status.OK,
                    f"All {len(critical_jobs)} critical jobs have run",
                    details,
                    "N/A",
                )
            else:
                self._add_result(
                    check_id, name, phase, severity, Status.FAIL,
                    f"Jobs with no last run record: {', '.join(overdue)}",
                    details,
                    "1. Check APScheduler process\n2. Verify job store connectivity\n"
                    "3. Restart scheduler",
                )
        except Exception as e:
            self._add_result(
                check_id, name, phase, severity, Status.ERROR,
                f"Cannot check scheduler: {e}",
                {"error": str(e)},
                "Verify Redis connectivity",
            )

    # ========================================================================
    # Execution
    # ========================================================================

    async def run_all(self) -> dict[str, Any]:
        """Execute all health checks and return aggregated report."""
        # Phase 1: Pre-startup
        self.check_filesystem_writable()
        self.check_volume_mounted()
        self.check_secrets_available()
        self.check_environment_valid()
        self.check_disk_space()

        # Phase 4: Dependencies
        self.check_postgresql()
        self.check_redis()
        self.check_evidence_db()

        # Phase 3: HTTP endpoints
        await self.check_http_endpoints()

        # Phase 5: Workers
        self.check_worker_queue_depth()
        self.check_scheduler_jobs()

        # Aggregate results
        critical_ok = all(
            r.status == "ok" or r.status in ("skip", "warn")
            for r in self.results if r.severity == "critical"
        )
        critical_failures = [
            r for r in self.results
            if r.severity == "critical" and r.status in ("fail", "error")
        ]
        warnings = [r for r in self.results if r.status == "warn"]

        return {
            "report_meta": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "environment": self.env,
                "checker_version": "1.0.0",
                "total_checks": len(self.results),
                "passed": len([r for r in self.results if r.status == "ok"]),
                "failed": len([r for r in self.results if r.status == "fail"]),
                "warnings": len([r for r in self.results if r.status == "warn"]),
                "skipped": len([r for r in self.results if r.status == "skip"]),
                "errors": len([r for r in self.results if r.status == "error"]),
                "critical_failures": len(critical_failures),
            },
            "overall_status": "healthy" if critical_ok and not critical_failures else "unhealthy",
            "checks": [asdict(r) for r in self.results],
        }


def main():
    parser = argparse.ArgumentParser(
        description="DeepSynaps Protocol Studio - Health Check",
    )
    parser.add_argument("--json", action="store_true", help="Output JSON report")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--timeout", type=int, default=30, help="Global timeout in seconds")
    parser.add_argument("--base-url", default="http://localhost:8080", help="Base URL for HTTP checks")
    args = parser.parse_args()

    checker = HealthChecker(base_url=args.base_url, timeout=args.timeout)

    try:
        report = asyncio.run(checker.run_all())
    except KeyboardInterrupt:
        print("\nHealth check interrupted.", file=sys.stderr)
        sys.exit(130)
    except Exception as e:
        print(f"\nHealth check script error: {e}", file=sys.stderr)
        traceback.print_exc()
        sys.exit(2)

    if args.json:
        print(json.dumps(report, indent=2, default=str))
    else:
        meta = report["report_meta"]
        print("=" * 70)
        print("DeepSynaps Protocol Studio - Health Check Report")
        print("=" * 70)
        print(f"Generated:    {meta['generated_at']}")
        print(f"Environment:  {meta['environment']}")
        print(f"Status:       {report['overall_status'].upper()}")
        print(f"Checks:       {meta['total_checks']} total | "
              f"{meta['passed']} passed | {meta['failed']} failed | "
              f"{meta['warnings']} warnings | {meta['skipped']} skipped")
        if meta['critical_failures'] > 0:
            print(f"\n!!! CRITICAL FAILURES: {meta['critical_failures']} !!!")
        print("-" * 70)

        for check in report["checks"]:
            status_icon = {
                "ok": "[PASS]",
                "fail": "[FAIL]",
                "warn": "[WARN]",
                "skip": "[SKIP]",
                "error": "[ERR!]",
            }.get(check["status"], "[?]")
            sev_tag = f"[{check['severity'].upper()}]"
            print(f"{status_icon} {check['check_id']} {sev_tag} {check['name']}")
            if args.verbose or check["status"] in ("fail", "warn", "error"):
                print(f"           Status:  {check['status']}")
                print(f"           Message: {check['message']}")
                if check.get("details"):
                    print(f"           Details: {json.dumps(check['details'], default=str)[:200]}")
                if check.get("remediation") and check["status"] != "ok":
                    print(f"           Fix:     {check['remediation'][:150]}")
                print()

        print("=" * 70)

    sys.exit(0 if report["overall_status"] == "healthy" else 1)


if __name__ == "__main__":
    main()
```

---

### Script Usage Examples

```bash
# Basic health check (human-readable output)
python scripts/health_check.py

# JSON output for CI/CD integration
python scripts/health_check.py --json

# Verbose output with all details
python scripts/health_check.py --verbose

# Custom base URL for remote checks
python scripts/health_check.py --base-url https://app.fly.dev

# In CI/CD pipeline (fails build on unhealthy)
python scripts/health_check.py --json --base-url https://staging.fly.dev || exit 1

# Cron monitoring job (every 5 minutes)
*/5 * * * * /usr/local/bin/python /app/scripts/health_check.py --json >> /var/log/health.jsonl
```

---

### Script Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| `0` | All healthy | None |
| `1` | Critical check(s) failed | Investigate and remediate |
| `2` | Script error (exception) | Fix script or environment |
| `130` | Interrupted (Ctrl-C) | Re-run manually |

---

## Appendix A: Environment Variable Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEEPSYNAPS_ENV` | Yes | — | Environment: `production`, `staging`, `development`, `test` |
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis/Upstash connection string |
| `SECRET_KEY` | Yes | — | Application secret key |
| `MEDIA_STORAGE_ROOT` | No | `/data/media` | Persistent volume media path |
| `DEEPSYNAPS_AUTO_PAGE_ENABLED` | No | — | Enable auto-page worker |
| `DEEPSYNAPS_CAREGIVER_DIGEST_ENABLED` | No | — | Enable caregiver email digest |
| `DEEPSYNAPS_QEEG_105_WORKER_ENABLED` | No | — | Enable qEEG 105 worker |
| `DEEPSYNAPS_VOICE_WARMUP` | No | — | Enable voice TTS warm-up |
| `STRIPE_API_KEY` | No | — | Stripe API key (optional) |
| `SENTRY_DSN` | No | — | Sentry error tracking DSN |
| `SMTP_PASSWORD` | No | — | SMTP password for email workers |
| `HEALTH_CHECK_TIMEOUT` | No | `30` | Global health check timeout |

---

## Appendix B: Escalation Runbook

### Immediate Actions by Failure Type

| Failure | First 5 Minutes | Next 30 Minutes |
|---------|----------------|-----------------|
| PostgreSQL unreachable | Check `fly status --app <pg>` | Failover to replica; restore from backup if needed |
| Redis unreachable | Check Upstash console; test `PING` | Switch to read replica; cache in degraded mode |
| Volume full | Emergency cleanup of temp files | Expand volume; investigate root cause |
| /health returns 503 | Check if app still starting | Review startup logs; restart if hung |
| qEEG queue critical | Restart worker; check for stuck jobs | Scale workers; pause ingestion if needed |
| Evidence DB missing | Check file existence and permissions | Restore from latest snapshot |
| DeepTwin 500 errors | Check GPU and model loading | Restart container; verify model artifacts |

### Notification Matrix

| Severity | Channel | Response Time |
|----------|---------|--------------|
| CRITICAL | PagerDuty + Slack #incidents | 15 minutes |
| WARNING | Slack #alerts | 30 minutes |
| INFO | Log aggregation only | Next business day |

### Rollback Procedures

| Scenario | Rollback Command |
|----------|-----------------|
| Bad deployment | `fly deploy --image <previous_image>` |
| DB migration failure | `fly ssh console -C "alembic downgrade -1"` |
| Config error | `fly secrets unset <BAD_SECRET>` then redeploy |
| Worker overload | `fly scale count 0 && fly scale count <N>` |

---

*End of Startup Health Check Matrix v1.0.0*
