# DeepSynaps Protocol Studio - Deployment Approval Checklist

## Clinical Neuromodulation Platform | Fly.io + Netlify Deployment

| **Property** | **Value** |
|-------------|-----------|
| **Application** | DeepSynaps Protocol Studio |
| **Classification** | HIPAA-adjacent Clinical Data System |
| **Environment** | Production |
| **Platforms** | Fly.io (backend), Netlify (frontend) |
| **Version Tag** | `________________________________________` |
| **Deployment Date** | `______________` |
| **Change Ticket** | `________________________________________` |
| **Risk Level** | [ ] Low  [ ] Medium  [ ] High  [ ] Critical |

---

## Table of Contents

- [1. Security Approval](#1-security-approval)
- [2. Database & Migration Approval](#2-database--migration-approval)
- [3. Infrastructure Approval](#3-infrastructure-approval)
- [4. Feature & Integration Approval](#4-feature--integration-approval)
- [5. Operational Approval](#5-operational-approval)
- [6. Approval Sign-off Matrix](#6-approval-sign-off-matrix)
- [7. Pre-Deployment Checklist Summary](#7-pre-deployment-checklist-summary)
- [8. Post-Deployment Verification](#8-post-deployment-verification)
- [9. Emergency Contacts](#9-emergency-contacts)
- [Appendix A: Regulatory Compliance Mapping](#appendix-a-regulatory-compliance-mapping)

---

> **CRITICAL NOTICE**: This checklist must be completed in full before any production deployment of the DeepSynaps Protocol Studio platform. No item may be skipped without written exception approval from the Security Lead and DevOps Lead. All sign-offs must be collected before deployment proceeds. This checklist is a controlled document subject to change management procedures.

---

## 1. Security Approval

**Section Owner**: Security Lead  
**Section Status**: [ ] PENDING  [ ] IN REVIEW  [ ] APPROVED  [ ] REJECTED  
**Review Date**: `______________`  
**Approving Party**: `________________________________________`

---

### 1.1 Source Code Secret Hygiene

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 1.1.1 | **No hardcoded secrets in source code** - All API keys, tokens, passwords, and credentials must be externalized to environment variables or secrets manager (Fly secrets, 1Password, or equivalent). Verify with `grep -ri "api_key\|password\|secret\|token" src/` and manual code review of all files changed since last deployment. | Security Lead + Dev Lead | SAST scan (`truffleHog` or `git-secrets`) + manual peer review | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.1.2 | **All secrets rotated since last incident** - If any security incident occurred since last deployment, confirm all potentially compromised secrets have been rotated and new values are deployed. Review incident log and rotation evidence. | Security Lead + DevOps Lead | Cross-reference incident tracker with secrets manager audit log | Security Lead + DevOps Lead dual sign-off | `__________` | `____________________` | `________________________________________` |
| 1.1.3 | **No default credentials present** - Verify no default usernames, passwords, or admin accounts exist with factory settings. Check admin initialization scripts and seed data. Confirm default accounts either disabled or credentials changed. | Security Lead | Automated credential scanner + manual review of `seed.py`, `init_admin.py` | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.1.4 | **Debug endpoints removed/hidden** - Confirm all debug, test, and development-only endpoints (e.g., `/debug`, `/test`, `/health-detailed` with sensitive data) are disabled or protected in production. Check route registration and environment-gated middleware. | Dev Lead + Security Lead | Automated endpoint discovery scan + manual route table review | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.1.5 | **Admin endpoints require role-based access control** - All administrative endpoints (`/admin/*`, `/governance/*`, `/system/*`) must enforce role checks. Verify `require_admin`, `require_clinician`, `require_superuser` decorators are applied consistently. Test with unprivileged JWT token. | Security Lead | Automated RBAC policy scan + penetration test with limited-privilege token | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 1.2 Authentication & Cryptography

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 1.2.1 | **JWT secret meets minimum entropy (32+ characters, cryptographically random)** - Verify JWT signing secret is at least 32 characters and generated with a CSPRNG (`openssl rand -hex 32` or equivalent). Confirm secret is stored in Fly secrets or 1Password, never committed. | Security Lead | `fly secrets list` grep for JWT_SECRET + length check + entropy analysis | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.2.2 | **Fernet keys for field-level encryption properly generated** - Confirm Fernet key is 32-byte URL-safe base64-encoded, generated via `cryptography.fernet.Fernet.generate_key()`. Verify key rotation policy documented and last rotation date within policy window. | Security Lead | Key format validation + rotation log review | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.2.3 | **Password hashing uses Argon2 or bcrypt with appropriate work factor** - Verify `werkzeug.security` or `argon2-cffi` is configured with minimum work factor: bcrypt cost >= 12, Argon2 time_cost >= 2, memory_cost >= 65536. Check configuration in auth module. | Security Lead | Configuration file audit + hash sample extraction and analysis | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.2.4 | **Session management secure** - Verify session cookies use `Secure`, `HttpOnly`, `SameSite=Strict` flags. Confirm session timeout is configured (<= 24 hours idle, <= 8 hours absolute for clinical sessions). Check CSRF protection on all state-changing operations. | Security Lead + Dev Lead | Cookie attribute scan + session timeout configuration review + CSRF test | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 1.3 Network & Transport Security

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 1.3.1 | **SSL/HTTPS enforced for all endpoints** - Confirm all ingress traffic uses TLS 1.2 or higher. Verify HSTS headers present. No HTTP-only endpoints accessible. Check Fly.io TLS termination and Netlify SSL configuration. | DevOps Lead | SSL Labs scan (`ssllabs.com`) + `curl -I -L` header inspection + forced HTTP redirect test | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.3.2 | **CORS origins restricted to known domains** - Verify `Access-Control-Allow-Origin` does not allow `*`. Whitelist only: `app.deepsynaps.io`, `portal.deepsynaps.io`, `admin.deepsynaps.io`, `*.netlify.app` (staging only). Confirm preflight handling correct. | Dev Lead + Security Lead | CORS configuration file review + `curl` preflight test from unauthorized origin | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.3.3 | **Rate limiting enabled on all API endpoints** - Confirm rate limiting middleware (`slowapi` or Flask-Limiter) is active. Verify tiers: unauthenticated 30/min, authenticated 300/min, admin 600/min. Check burst handling and header responses (`X-RateLimit-*`). | DevOps Lead + Security Lead | Load test with `k6` or ` artillery` + rate limit header verification | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.3.4 | **Webhook secrets configured and validated** - All Stripe webhooks and third-party webhook receivers must verify signatures using shared secrets. Confirm `Stripe-Signature` verification and payload signature comparison implemented. | Security Lead | Webhook secret presence in `fly secrets list` + replay attack test with invalid signature | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.3.5 | **Network ingress/egress rules reviewed** - Confirm Fly.io internal network segmentation between process groups (app, qeeg_worker, stripe_worker). Verify only necessary ports open (443 ingress, 5432 egress to Postgres, 6379 egress to Redis). | DevOps Lead + Security Lead | `fly ips list` + `fly services list` + internal network topology review | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 1.4 Data Protection & Privacy

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 1.4.1 | **PHI/PII not logged to unencrypted channels** - Verify patient identifiers, SSN, diagnoses, medication lists, and clinical assessments never appear in application logs, error traces, or monitoring dashboards. Check log sanitization middleware and Sentry scrubbing rules. | Security Lead + Dev Lead | Log grep for PHI patterns (`patient_id`, `ssn`, `diagnosis`, `medication`) + Sentry scrubbing config review | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.4.2 | **PHI encryption at rest** - Confirm all PHI stored in PostgreSQL uses field-level encryption via Fernet for sensitive columns. Verify SQLite `evidence.db` on persistent volume is encrypted or stored on encrypted volume. Check encryption key management procedures. | Security Lead | Database schema review for encrypted columns + volume encryption verification | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.4.3 | **Data classification tags applied** - Verify all new data fields added since last deployment are classified (Public, Internal, Confidential, Restricted/PHI). Confirm classification drives access controls and encryption requirements. | Security Lead + Product Lead | Data dictionary review + field-level classification audit | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.4.4 | **HIPAA audit logging enabled** - Confirm all access to PHI is logged with user ID, timestamp, action type, and resource accessed. Verify audit logs are tamper-resistant (append-only, checksum-verified). | Security Lead + DevOps Lead | Audit log configuration review + sample log entry verification | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.4.5 | **BAA agreements current** - Verify Business Associate Agreements are in place and current with all third-party vendors processing PHI (Fly.io, Stripe, Netlify, any wearable data processors). | Product Lead + Security Lead | Contract review + vendor BAA status tracker verification | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 1.5 Payment Security

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 1.5.1 | **Stripe keys are live keys (not test keys) for production** - Verify `STRIPE_SECRET_KEY` starts with `sk_live_`, not `sk_test_`. Confirm `STRIPE_PUBLISHABLE_KEY` starts with `pk_live_`. Verify webhook endpoint configured for live mode. | DevOps Lead | `fly secrets list` grep for STRIPE keys + prefix validation | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.5.2 | **PCI DSS scope minimization verified** - Confirm no cardholder data (PAN, CVV) touches application servers. Verify Stripe Elements/Checkout used for all card data collection. Confirm SAQ-A eligibility maintained. | Security Lead | Payment flow review + network packet capture analysis (no PAN in payloads) | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 1.6 Application Security

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 1.6.1 | **SQL injection protection verified** - Confirm all database queries use parameterized queries/SQLAlchemy ORM (no string concatenation). Verify no raw SQL with user input. Check for `text()` usage with sanitization. | Dev Lead | SAST scan (`bandit`, `semgrep`) + manual query review | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.6.2 | **XSS protection enabled** - Verify output encoding for all user-generated content. Confirm Content-Security-Policy headers configured. Check for `unsafe-inline` in script-src; if present, justify with nonce implementation. | Dev Lead + Security Lead | CSP header review + reflected/stored XSS payload testing | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.6.3 | **Security scan passed (SAST/DAST)** - Confirm latest SAST scan (Semgrep, CodeQL, or SonarQube) shows zero critical/high findings. DAST scan (OWASP ZAP or Burp Suite) completed with no high/critical vulnerabilities. | Security Lead | SAST/DAST report review and attachment | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.6.4 | **Dependency vulnerability scan passed** - Verify `pip-audit` or `safety check` run with zero critical/high severity vulnerabilities in dependencies. Confirm all vulnerable dependencies either patched or have documented compensating controls. | Dev Lead + Security Lead | `pip-audit` report + `requirements.txt` lockfile review | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.6.5 | **Container image scan passed** - If using Docker/OCI images, confirm Trivy or Snyk container scan shows no critical/high OS or library vulnerabilities. Image built from hardened base image. | DevOps Lead + Security Lead | Container scan report attachment | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 1.6.6 | **Secrets manager integration verified** - Confirm all secrets referenced via environment variables map to Fly secrets or 1Password. Verify no secrets in `fly.toml`, `Dockerfile`, or docker-compose files. | DevOps Lead | `fly secrets list` + grep of all config files for secret patterns | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

**Security Approval Section Summary:**

| Total Items | Passed | Failed | N/A | Waived | Section Status |
|-------------|--------|--------|-----|--------|---------------|
| 22 | `____` | `____` | `____` | `____` | [ ] PASS  [ ] FAIL  [ ] CONDITIONAL |

**Security Lead Final Sign-off:**  
**Name**: `________________________________________`  
**Date**: `______________`  
**Signature**: `________________________________________`  

---


## 2. Database & Migration Approval

**Section Owner**: DevOps Lead (with DBA consultation)  
**Section Status**: [ ] PENDING  [ ] IN REVIEW  [ ] APPROVED  [ ] REJECTED  
**Review Date**: `______________`  
**Approving Party**: `________________________________________`

---

### 2.1 Migration Testing & Validation

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 2.1.1 | **Migrations tested on staging clone** - All Alembic/Flask-Migrate migrations since last deployment executed successfully on a staging database that is a fresh restore from production backup. Confirm no migration errors, timeout, or data corruption. | DevOps Lead | Staging deployment log + migration execution output attachment | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.1.2 | **Migration rollback path documented** - For each migration file, verify a corresponding downgrade path exists and has been tested. Confirm downgrade script tested on staging clone. Document estimated rollback time. | DevOps Lead + Dev Lead | `alembic downgrade` test on staging + rollback procedure document review | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.1.3 | **No destructive schema changes without data migration** - Verify no `DROP TABLE`, `DROP COLUMN`, or `ALTER COLUMN` that loses data without a data preservation migration step. Check all migration files for destructive operations. | Dev Lead + DevOps Lead | Migration file diff review (`git diff`) + destructive operation grep (`DROP\|TRUNCATE\|DELETE FROM`) | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.1.4 | **Migration duration acceptable (< 30 seconds)** - Measure migration execution time on staging clone with production-equivalent data volume. If any single migration exceeds 30 seconds, document justification and deployment window (maintenance mode). | DevOps Lead | `time alembic upgrade head` output on staging with production-size dataset | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.1.5 | **No migration locks anticipated** - Verify migrations do not acquire long-duration exclusive locks on heavily-used tables. Review migration SQL for `ACCESS EXCLUSIVE` lock patterns. Confirm migrations run in transaction-safe manner. | DevOps Lead + DBA | Lock analysis using `pg_locks` during staging migration test + query plan review | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.1.6 | **Migration checksums/versions validated** - Confirm Alembic version table on production matches expected baseline. Verify migration file hashes have not been modified after creation. No manual edits to existing migration files. | DevOps Lead | `SELECT * FROM alembic_version;` output + `sha256sum` of migration files against git hashes | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 2.2 Database Backup & Recovery

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 2.2.1 | **PostgreSQL backup completed** - Verify automated PostgreSQL backup completed successfully within 24 hours of deployment. Confirm backup integrity (size check, sample restore test). Document backup location and retention. | DevOps Lead | Fly.io backup dashboard screenshot + `pg_dump` integrity verification + restore test log | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.2.2 | **SQLite evidence.db backed up** - Verify persistent volume containing `evidence.db` backed up before migration. Confirm backup file size matches source. Test read access to backup copy. | DevOps Lead | `fly ssh console` file copy + `ls -la` size comparison + sqlite3 `.tables` verification on backup | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.2.3 | **Point-in-time recovery validated** - Confirm PostgreSQL PITR (point-in-time recovery) capability is available and tested. Document RPO (Recovery Point Objective) <= 1 hour and RTO (Recovery Time Objective) <= 4 hours. | DevOps Lead | PITR restore test log + RPO/RTO documentation review | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.2.4 | **Backup retention policy compliant** - Verify backup retention meets regulatory requirements: daily backups retained 30 days, weekly 12 months, yearly 7 years (HIPAA). Confirm automated cleanup functional. | DevOps Lead | Backup retention configuration review + sample backup listing by date | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 2.3 Database Performance & Configuration

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 2.3.1 | **Connection pool limits appropriate** - Verify SQLAlchemy pool configuration: `pool_size` and `max_overflow` appropriate for Fly.io instance count. Confirm `pool_pre_ping=True` for connection health. Pool size <= 80% of PostgreSQL `max_connections`. | DevOps Lead + Dev Lead | `fly.toml` env var review + `SHOW max_connections;` + pool config in `database.py` | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.3.2 | **Evidence DB path valid and writable** - Confirm `evidence.db` SQLite file path on persistent volume is accessible and writable by application user. Verify file permissions (600 or 660). Confirm disk quota not exceeded. | DevOps Lead | `fly ssh console` path check + `touch` write test + `df -h` disk usage check | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.3.3 | **Database indices reviewed for new queries** - Verify new queries introduced since last deployment have appropriate database indexes. Check query execution plans (`EXPLAIN ANALYZE`) for new query paths. Confirm no duplicate or redundant indexes created. | Dev Lead + DBA | `EXPLAIN ANALYZE` output for new queries + index review via `pg_indexes` | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.3.4 | **Database performance baseline recorded** - Capture `pg_stat_statements` top 10 queries by execution time before deployment. Confirm no query exceeds 500ms average execution time. Document baseline for post-deployment comparison. | DevOps Lead | `pg_stat_statements` export + query latency histogram | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.3.5 | **Long-running query monitoring configured** - Confirm queries exceeding 2 seconds are logged automatically. Verify `log_min_duration_statement` or application-level query timeout configured. Alert rule in place for sustained query degradation. | DevOps Lead | PostgreSQL `log_min_duration_statement` config + alerting rule review | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.3.6 | **Dead connection cleanup configured** - Verify idle connections are cleaned up after timeout. Confirm `pool_recycle` or equivalent set appropriately (e.g., 3600s). Check for connection leaks in application code. | DevOps Lead + Dev Lead | Connection pool configuration review + `pg_stat_activity` idle connection check | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 2.4 Data Integrity

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 2.4.1 | **Foreign key constraints intact** - Verify all foreign key relationships are enforced. Confirm no orphaned records exist in related tables. Check referential integrity after migration test on staging. | Dev Lead + DBA | `pg_constraint` review + orphaned record query (`LEFT JOIN ... WHERE NULL` count) | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.4.2 | **Data validation rules enforced** - Confirm CHECK constraints, NOT NULL constraints, and application-level validators are active for all new fields. Verify enum values match application code definitions. | Dev Lead | Schema constraint review + application model validator review | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 2.4.3 | **Seed data validated for new features** - If deployment includes new features requiring reference/lookup data, confirm seed data is present and correct. Verify lookup tables populated before feature enablement. | Dev Lead + Product Lead | Seed data execution log + lookup table content verification | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

**Database & Migration Approval Section Summary:**

| Total Items | Passed | Failed | N/A | Waived | Section Status |
|-------------|--------|--------|-----|--------|---------------|
| 18 | `____` | `____` | `____` | `____` | [ ] PASS  [ ] FAIL  [ ] CONDITIONAL |

**DevOps Lead Final Sign-off:**  
**Name**: `________________________________________`  
**Date**: `______________`  
**Signature**: `________________________________________`  

---

## 3. Infrastructure Approval

**Section Owner**: DevOps Lead  
**Section Status**: [ ] PENDING  [ ] IN REVIEW  [ ] APPROVED  [ ] REJECTED  
**Review Date**: `______________`  
**Approving Party**: `________________________________________`

---

### 3.1 Compute Resources

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 3.1.1 | **Fly app resource limits appropriate (memory/CPU)** - Verify `fly.toml` `[vm]` section specifies adequate resources: app process group minimum 512MB RAM, qeeg_worker minimum 1GB RAM, stripe_worker minimum 256MB RAM. CPU shares appropriate for workload. No OOM kills in last 7 days. | DevOps Lead | `fly.toml` review + `fly status --app` resource usage + OOM event log check | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.1.2 | **All 3 process groups configured** - Confirm `app` (web/API), `qeeg_worker` (neuroimaging pipeline), and `stripe_worker` (payment processing) process groups are defined in `fly.toml` with correct commands and concurrency settings. | DevOps Lead | `fly.toml` `[processes]` section review + `fly services list` | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.1.3 | **Auto-scaling configured** - Verify Fly auto-scaling or custom scaling logic is active with appropriate min/max instance counts. Confirm scale-up triggers based on CPU/memory thresholds or request queue depth. Document max instance count and cost implications. | DevOps Lead | `fly autoscale show` or scaling configuration review + load test scale-up verification | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.1.4 | **Health check endpoint configured** - Confirm HTTP health check endpoint (`/health`, `/healthz`, or `/api/health`) returns 200 with appropriate payload. Verify Fly checks are passing consistently (no flapping). Health check does not depend on external services. | DevOps Lead | `fly checks list` output + `curl` health endpoint response + health check payload review | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.1.5 | **Graceful shutdown configured** - Verify application handles SIGTERM gracefully with appropriate timeout (30s). Confirm in-flight requests complete, database connections close cleanly, background jobs finish or checkpoint. | DevOps Lead + Dev Lead | SIGTERM simulation test + graceful shutdown log review | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.1.6 | **Resource utilization within bounds** - Confirm average CPU < 70%, memory < 80%, disk I/O within acceptable ranges over past 7 days. No sustained resource saturation. | DevOps Lead | Fly Metrics dashboard screenshot / `fly metrics` CLI output | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 3.2 Storage & Persistence

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 3.2.1 | **Volume has adequate free space** - Verify persistent volume has at least 30% free space available. Confirm `evidence.db` growth rate is sustainable within current volume size. Document volume expansion procedure if needed. | DevOps Lead | `fly ssh console` `df -h` output + evidence.db size trend over 30 days | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.2.2 | **Volume snapshot/backup policy active** - Confirm automated volume snapshots are enabled with appropriate frequency (daily minimum). Verify last snapshot age < 24 hours. Snapshot retention meets compliance requirements. | DevOps Lead | Fly volume snapshot list + last snapshot timestamp + retention policy review | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.2.3 | **SQLite journal mode safe** - Confirm `evidence.db` uses WAL (Write-Ahead Logging) mode for better concurrency and crash safety. Verify `PRAGMA journal_mode` returns `wal`. Check checkpoint frequency. | DevOps Lead | `fly ssh console` `sqlite3 evidence.db "PRAGMA journal_mode;"` output | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 3.3 PostgreSQL Infrastructure

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 3.3.1 | **PostgreSQL connections within limits** - Verify current connection count is below `max_connections` limit. Confirm connection pool sizing appropriate. No connection exhaustion events in last 7 days. | DevOps Lead | `SELECT count(*) FROM pg_stat_activity;` + `SHOW max_connections;` comparison | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.3.2 | **PostgreSQL version current and patched** - Confirm PostgreSQL version is within supported range with latest security patches applied. No known CVEs affecting installed version. | DevOps Lead | `SELECT version();` output + CVE scan against installed version | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.3.3 | **PostgreSQL replication healthy** - If using Fly PostgreSQL with replicas, confirm replication lag < 5 seconds. Verify failover capability tested within last 90 days. | DevOps Lead | `pg_stat_replication` lag check + last failover test date documentation | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.3.4 | **PostgreSQL parameter tuning reviewed** - Confirm key parameters (`shared_buffers`, `effective_cache_size`, `work_mem`, `maintenance_work_mem`) are tuned for instance size and workload. No aggressive vacuum or checkpoint settings. | DevOps Lead | `postgresql.conf` review + parameter tuning justification document | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 3.4 Redis & Caching

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 3.4.1 | **Redis connection healthy** - Verify Redis/Upstash Redis connection from all process groups. Confirm `PING` returns `PONG` with < 50ms latency. No connection timeout errors in logs. | DevOps Lead | `redis-cli PING` from app console + connection latency test + error log grep | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.4.2 | **Redis memory usage within limits** - Confirm Redis memory usage < 80% of maxmemory. Verify eviction policy appropriate (`allkeys-lru` or `volatile-lru`). No unexpected memory growth pattern. | DevOps Lead | `INFO memory` output + memory usage trend graph | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.4.3 | **Cache invalidation strategy verified** - Confirm cache keys for modified features are invalidated or updated during deployment. Verify stale cache data does not cause consistency issues. | Dev Lead + DevOps Lead | Cache key prefix review + invalidation script execution log | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 3.5 Networking & DNS

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 3.5.1 | **DNS records correct** - Verify A/AAAA/CNAME records for all domains (`api.deepsynaps.io`, `app.deepsynaps.io`, `portal.deepsynaps.io`, `admin.deepsynaps.io`) resolve correctly. Confirm TTL values appropriate (< 300s for rapid failover if needed). | DevOps Lead | `dig` + `nslookup` output for all domains + DNS propagation check | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.5.2 | **SSL certificates valid (not expiring < 30 days)** - Confirm all TLS certificates have > 30 days until expiration. Verify certificate chain complete and trusted. No mixed-content warnings. Auto-renewal functional. | DevOps Lead | SSL Labs scan + `openssl s_client -connect` + expiry date extraction | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.5.3 | **CDN/edge configuration correct** - If using Cloudflare or other CDN, confirm caching rules, page rules, and security settings are correct. Verify no sensitive endpoints cached. | DevOps Lead | CDN dashboard review + cache-bypass rule verification for `/api/*` | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 3.6 Monitoring & Observability Infrastructure

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 3.6.1 | **Log aggregation functional** - Verify logs from all 3 process groups are reaching centralized logging destination. Confirm structured logging format (JSON) is intact. No log loss during high-throughput periods. | DevOps Lead | Log stream check + throughput test + log completeness verification | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.6.2 | **Metrics pipeline operational** - Confirm application metrics (request rate, latency, error rate) are being collected and forwarded to metrics backend. Key SLI metrics defined and tracked. | DevOps Lead | Metrics dashboard review + custom metrics spot-check | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 3.6.3 | **Distributed tracing configured** - Verify trace context propagation across API -> worker boundaries. Confirm trace sampling rate appropriate (100% for errors, 1-10% for success paths). | DevOps Lead + Dev Lead | Trace viewer spot-check + cross-service trace verification | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

**Infrastructure Approval Section Summary:**

| Total Items | Passed | Failed | N/A | Waived | Section Status |
|-------------|--------|--------|-----|--------|---------------|
| 21 | `____` | `____` | `____` | `____` | [ ] PASS  [ ] FAIL  [ ] CONDITIONAL |

**DevOps Lead Final Sign-off:**  
**Name**: `________________________________________`  
**Date**: `______________`  
**Signature**: `________________________________________`  

---


## 4. Feature & Integration Approval

**Section Owner**: Product Lead (with Dev Lead technical validation)  
**Section Status**: [ ] PENDING  [ ] IN REVIEW  [ ] APPROVED  [ ] REJECTED  
**Review Date**: `______________`  
**Approving Party**: `________________________________________`

---

### 4.1 Knowledge Layer & AI Systems

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 4.1.1 | **Knowledge Layer adapters tested** - All 16 database adapters in the Knowledge Layer tested with positive and negative test cases. Confirm adapter health check endpoints return 200. Verify fallback behavior when adapter unavailable. | Dev Lead | Adapter integration test report + health check curl output + failover test log | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.1.2 | **DeepTwin synthesis operational** - Verify DeepTwin synthesis pipeline produces consistent, clinically-relevant outputs. Confirm input validation prevents adversarial or malformed inputs. Check output quality metrics within acceptable thresholds. | Dev Lead + Product Lead | DeepTwin synthesis test suite results + output quality scorecard + adversarial input test | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.1.3 | **Knowledge graph consistency verified** - Confirm knowledge graph relationships are intact post-deployment. Verify no orphaned nodes or broken relationships after migration. Check graph query performance. | Dev Lead | Graph integrity query results + relationship count baseline comparison | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.1.4 | **Adapter timeout and circuit breaker functional** - Verify each adapter has appropriate timeout configuration (5-30s depending on data source). Confirm circuit breaker pattern prevents cascade failures when external knowledge sources are unavailable. | Dev Lead | Circuit breaker test results + adapter timeout configuration review | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.1.5 | **Adapter response caching operational** - Verify Knowledge Layer caches adapter responses appropriately. Confirm cache invalidation on data updates. Check cache hit rate > 60% for frequently accessed knowledge. | Dev Lead | Cache metrics review + cache hit rate dashboard + invalidation test | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 4.2 Clinical Data Pipelines

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 4.2.1 | **qEEG pipeline functional** - Verify quantitative EEG processing pipeline accepts standard EEG file formats (EDF, BDF, SET), processes correctly, and produces expected output metrics. Confirm pipeline handles corrupted/malformed files gracefully. | Dev Lead + Product Lead | qEEG end-to-end test with sample data + error handling test with malformed input | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.2.2 | **MRI analysis functional** - Verify MRI/NIfTI analysis pipeline processes neuroimaging data correctly. Confirm output volumes, segmentations, and derived metrics match reference standards. Validate DICOM metadata extraction. | Dev Lead + Product Lead | MRI analysis test suite results + reference standard comparison + DICOM parsing test | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.2.3 | **Medication analyzer working** - Confirm medication interaction analysis produces accurate results. Verify drug-drug interaction database is current. Check contraindication detection for common neuromodulation medications. | Dev Lead + Product Lead | Medication analyzer test cases + interaction database version check | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.2.4 | **Genetic analyzer working** - Verify genetic variant analysis pipeline processes VCF/PLINK inputs correctly. Confirm pharmacogenomic annotations are current. Check rare variant handling and population frequency references. | Dev Lead + Product Lead | Genetic analyzer test results + annotation database version verification | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.2.5 | **Clinical data validation rules active** - Confirm all clinical data inputs undergo schema validation and clinical range checking. Verify abnormal value flagging works for out-of-range clinical measurements. | Dev Lead | Validation rule test suite + boundary condition test results | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.2.6 | **Evidence pipeline updated** - Verify evidence generation pipeline incorporates new data sources and scoring models. Confirm evidence grades assigned consistently per clinical evidence hierarchy. | Dev Lead + Product Lead | Evidence pipeline test results + evidence grade consistency audit | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 4.3 Patient & Clinician Interfaces

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 4.3.1 | **Patient portal functional** - Verify patient portal login, dashboard, data viewing, and consent management work correctly. Confirm accessibility (WCAG 2.1 AA) compliance. Check mobile responsiveness. | Product Lead + Dev Lead | End-to-end portal test script results + accessibility scan (axe/lighthouse) | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.3.2 | **Clinician dashboard functional** - Confirm clinician dashboard loads correctly with patient data, treatment protocols, and analytics. Verify role-based data filtering (clinicians see only their patients). | Product Lead + Dev Lead | Dashboard test script results + RBAC data filtering test | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.3.3 | **Admin governance panel functional** - Verify admin panel user management, role assignment, audit log viewing, and system configuration work correctly. Confirm superuser escalation requires MFA. | Dev Lead + Security Lead | Admin panel test script + MFA escalation test + audit log review | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.3.4 | **Data export compliance verified** - Confirm patient data export produces complete, accurate records in standard format. Verify export includes required HIPAA accounting of disclosures. | Product Lead + Security Lead | Data export test + completeness verification + format validation | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 4.4 Payment Processing

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 4.4.1 | **Stripe payments tested end-to-end** - Verify full payment flow: card input -> tokenization -> charge -> receipt -> refund. Confirm test transactions with Stripe test cards succeed. Verify webhook processing (payment_intent.succeeded, invoice.paid). | Dev Lead + DevOps Lead | Stripe test card transaction log + webhook delivery verification + refund test | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.4.2 | **Subscription lifecycle functional** - Confirm subscription creation, modification, cancellation, and proration work correctly. Verify subscription status webhook handling. Check grace period and dunning logic. | Dev Lead | Subscription lifecycle test suite + webhook event log review | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.4.3 | **Invoice generation accurate** - Verify invoice PDF generation produces correct amounts, tax calculations, and line items. Confirm invoice numbering sequential and auditable. | Dev Lead + Product Lead | Invoice generation test + sample invoice accuracy review | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.4.4 | **Stripe Connect / marketplace payouts functional** - If applicable, verify clinician/provider payout scheduling, payout thresholds, and transfer reconciliation work correctly. | Dev Lead | Payout test transactions + reconciliation report | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 4.5 Wearable & Device Integrations

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 4.5.1 | **Wearable integrations functional** - Verify data sync from supported wearable devices (heart rate, sleep, activity, HRV) works correctly. Confirm OAuth token refresh handling. Check data deduplication logic. | Dev Lead + Product Lead | Wearable sync test with real/simulated device + token refresh test + dedup verification | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.5.2 | **Device API rate limits respected** - Confirm wearable API calls stay within vendor rate limits. Verify backoff/retry logic functional. Check quota usage dashboard. | Dev Lead | Rate limit configuration review + API call log analysis + retry test | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.5.3 | **Wearable data normalization correct** - Verify data from different wearable vendors normalized consistently. Confirm unit conversions accurate (steps, calories, distance, sleep stages). | Dev Lead | Normalization test suite + cross-vendor data comparison | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 4.6 Voice Engine

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 4.6.1 | **Voice engine operational** - Verify text-to-speech and speech-to-text endpoints functional. Confirm voice synthesis quality meets clinical accessibility standards. Check supported languages and voices. | Dev Lead + Product Lead | Voice engine API test + synthesized audio quality review + language coverage check | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.6.2 | **Voice data privacy protected** - Confirm voice recordings and transcripts are encrypted at rest and in transit. Verify retention policy for voice data documented and enforced. Check voice data excluded from general analytics. | Security Lead + Dev Lead | Voice data encryption verification + retention policy review + analytics exclusion check | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 4.7 Safety & Compliance Systems

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 4.7.1 | **Adverse event system functional** - Verify adverse event reporting workflow works: detection -> triage -> escalation -> resolution. Confirm notifications sent to appropriate clinical reviewers. Check severity classification accuracy. | Product Lead + Dev Lead | Adverse event simulation test + notification delivery verification + escalation timeout test | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.7.2 | **Adherence tracking operational** - Confirm patient adherence tracking accurately records session completion, medication timing, and protocol compliance. Verify adherence score calculation correct. | Product Lead + Dev Lead | Adherence tracking test + score calculation verification + edge case handling | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.7.3 | **Safety alert system active** - Verify automated safety alerts trigger correctly for abnormal clinical values, protocol deviations, or patient-reported adverse effects. Confirm alert routing to responsible clinicians. | Product Lead + Dev Lead | Safety alert trigger test + routing verification + escalation cascade test | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 4.7.4 | **Protocol deviation handling verified** - Confirm protocol deviation detection, documentation, and approval workflow functional. Verify deviations tracked with appropriate severity and resolution status. | Product Lead + Dev Lead | Protocol deviation workflow test + audit trail verification | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

**Feature & Integration Approval Section Summary:**

| Total Items | Passed | Failed | N/A | Waived | Section Status |
|-------------|--------|--------|-----|--------|---------------|
| 25 | `____` | `____` | `____` | `____` | [ ] PASS  [ ] FAIL  [ ] CONDITIONAL |

**Product Lead Final Sign-off:**  
**Name**: `________________________________________`  
**Date**: `______________`  
**Signature**: `________________________________________`  

---

## 5. Operational Approval

**Section Owner**: DevOps Lead (with Operations team coordination)  
**Section Status**: [ ] PENDING  [ ] IN REVIEW  [ ] APPROVED  [ ] REJECTED  
**Review Date**: `______________`  
**Approving Party**: `________________________________________`

---

### 5.1 Monitoring & Alerting

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 5.1.1 | **Monitoring dashboards accessible** - Confirm Grafana/Datadog/CloudWatch dashboards are accessible to on-call team. Verify all critical service dashboards load correctly and show current data. Dashboard covers all 3 process groups. | DevOps Lead | Dashboard URL accessibility test + live data verification + screenshot attachment | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.1.2 | **Alert rules configured** - Verify alerting rules defined for: HTTP 5xx rate > 1%, p99 latency > 2s, error rate > 0.1%, database connection failures, queue depth > threshold, disk usage > 85%, memory > 90%. Confirm alert severity levels (P1/P2/P3) assigned. | DevOps Lead | Alert rule configuration review + alert manager config validation + test alert firing | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.1.3 | **Alert routing verified** - Confirm P1 alerts route to on-call engineer via PagerDuty/Opsgenie with < 2 minute delivery. P2 alerts route to Slack/email. P3 alerts create tickets. Escalation policy tested. | DevOps Lead | Alert routing test results + escalation policy verification + delivery time check | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.1.4 | **SLI/SLO definitions current** - Verify Service Level Indicators (availability, latency, error rate, throughput) defined with thresholds. Confirm Service Level Objectives documented and baselined. Error budget tracking active. | DevOps Lead | SLI/SLO document review + error budget dashboard screenshot | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.1.5 | **Synthetic monitoring active** - Confirm uptime checks/synthetic monitors running against critical endpoints every 60 seconds from multiple locations. Verify alert triggers when endpoint down > 2 minutes. | DevOps Lead | Synthetic monitoring dashboard + deliberate failure test + alert response time | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 5.2 Logging & Diagnostics

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 5.2.1 | **Log retention configured** - Verify application logs retained >= 90 days (HIPAA requirement). Confirm audit logs retained >= 6 years. Verify log rotation functional. No log loss during rotation. | DevOps Lead | Log retention policy configuration + storage capacity check + rotation log review | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.2.2 | **Sentry DSN set (if applicable)** - Confirm Sentry project DSN configured and receiving events. Verify error grouping functional. Confirm PII scrubbing rules active in Sentry. Check alert rules for new error types. | DevOps Lead + Dev Lead | Sentry project dashboard review + test error injection + PII scrubbing verification | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.2.3 | **Structured logging format enforced** - Verify all log entries follow JSON structured format with standard fields: timestamp, severity, service, trace_id, user_id (hashed), message. Confirm log parsing works in log aggregator. | Dev Lead + DevOps Lead | Log sample review + parser test + field completeness check | DevLead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.2.4 | **Correlation IDs propagated** - Confirm trace/correlation IDs propagated across all services (app -> qeeg_worker -> stripe_worker). Verify end-to-end request tracing functional. | Dev Lead | Distributed trace sample review + correlation ID propagation test | Dev Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 5.3 Incident Response & Runbooks

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 5.3.1 | **On-call rotation defined** - Confirm primary and secondary on-call engineers assigned for deployment period. Verify escalation path documented. Contact information current. Handoff from previous rotation complete. | DevOps Lead | On-call calendar review + contact info verification + escalation path test | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.3.2 | **Rollback runbook accessible** - Verify deployment rollback runbook is accessible, current (reviewed within 30 days), and tested on staging. Confirm rollback steps executable in < 15 minutes. Runbook covers database rollback scenario. | DevOps Lead | Runbook document review + rollback timing test on staging + runbook accessibility check | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.3.3 | **Incident response plan current** - Confirm incident response plan reviewed within last 90 days. Verify severity classification matrix documented. Communication templates prepared. Post-mortem process defined. | DevOps Lead + Security Lead | IR plan document review + communication template check + last review date | Security Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.3.4 | **Communication plan ready** - Confirm stakeholder notification list current. Verify communication channels defined for different incident severities. Status page (if applicable) ready for updates. | DevOps Lead + Product Lead | Stakeholder list review + communication channel test + status page access check | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

### 5.4 Deployment Execution

| # | Checklist Item | Owner | Verification Method | Sign-off Required | Date | Name | Notes |
|---|---------------|-------|-------------------|------------------|------|------|-------|
| 5.4.1 | **Post-deploy verification script ready** - Confirm automated post-deployment verification script exists and covers: health checks, critical API endpoints, database connectivity, cache connectivity, external integrations, payment flow sanity check. | DevOps Lead + Dev Lead | Verification script code review + dry-run on staging + coverage checklist | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.4.2 | **Deployment window confirmed** - Verify deployment scheduled during approved maintenance window. Confirm stakeholder notifications sent >= 24 hours in advance. No conflicting maintenance activities scheduled. | DevOps Lead | Deployment calendar check + stakeholder notification confirmation | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.4.3 | **Feature flags configured** - Confirm all new features behind feature flags have correct default state. Verify flag configuration matches deployment plan (gradual rollout or full enable). Kill switch accessible. | Dev Lead + Product Lead | Feature flag configuration review + kill switch test + default state verification | Product Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.4.4 | **Canary deployment plan ready** - If using canary deployment, confirm traffic split percentage and duration. Verify rollback trigger conditions defined. Monitoring alerts configured for canary metrics comparison. | DevOps Lead | Canary configuration review + rollback trigger definition + metric comparison dashboard | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |
| 5.4.5 | **Database migration order documented** - Confirm order of operations: backup -> migration -> application deploy -> verification. Verify no application code depends on migration before migration runs. | DevOps Lead + Dev Lead | Deployment procedure document review + dependency analysis | DevOps Lead sign-off | `__________` | `____________________` | `________________________________________` |

---

**Operational Approval Section Summary:**

| Total Items | Passed | Failed | N/A | Waived | Section Status |
|-------------|--------|--------|-----|--------|---------------|
| 18 | `____` | `____` | `____` | `____` | [ ] PASS  [ ] FAIL  [ ] CONDITIONAL |

**DevOps Lead Final Sign-off:**  
**Name**: `________________________________________`  
**Date**: `______________`  
**Signature**: `________________________________________`  

---


## 6. Approval Sign-off Matrix

**Purpose**: Define approval authority, review responsibilities, and final sign-off requirements for each section of this deployment checklist. No deployment proceeds without all required signatures.

---

### 6.1 Authority Matrix

| Role | Security (22 items) | Database & Migration (18 items) | Infrastructure (21 items) | Features & Integration (25 items) | Operations (18 items) | **FINAL APPROVAL** |
|------|:-------------------:|:-------------------------------:|:-------------------------:|:---------------------------------:|:---------------------:|:------------------:|
| **Dev Lead** | Review | Review | Review | **Approve** | Review | -- |
| **DevOps Lead** | Review | Review | **Approve** | Review | **Approve** | -- |
| **Security Lead** | **Approve** | Review | Review | Review | Review | -- |
| **Product Lead** | -- | -- | -- | **Approve** | -- | **Approve** |

**Legend:**
- **Approve** = Primary approver with authority to approve or reject the section
- **Review** = Must review and provide input, cannot unilaterally approve/reject
- **--** = Not required for this section

---

### 6.2 Individual Sign-off Records

#### Dev Lead

| Section | Action | Date | Name | Signature | Notes |
|---------|--------|------|------|-----------|-------|
| 1. Security Approval | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |
| 2. Database & Migration | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |
| 3. Infrastructure | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |
| 4. Features & Integration | [ ] Approved  [ ] Rejected  [ ] Conditional | `__________` | `____________________` | `____________________` | `________________________________________` |
| 5. Operational | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |

**Dev Lead Final Acknowledgment:**  
I have reviewed all sections within my scope and confirm the deployment is technically sound from a development perspective.  
**Name**: `________________________________________`  
**Date**: `______________`  
**Signature**: `________________________________________`

---

#### DevOps Lead

| Section | Action | Date | Name | Signature | Notes |
|---------|--------|------|------|-----------|-------|
| 1. Security Approval | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |
| 2. Database & Migration | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |
| 3. Infrastructure | [ ] Approved  [ ] Rejected  [ ] Conditional | `__________` | `____________________` | `____________________` | `________________________________________` |
| 4. Features & Integration | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |
| 5. Operational | [ ] Approved  [ ] Rejected  [ ] Conditional | `__________` | `____________________` | `____________________` | `________________________________________` |

**DevOps Lead Final Acknowledgment:**  
I confirm infrastructure is ready, migrations are tested, rollback procedures are in place, and operational readiness is achieved.  
**Name**: `________________________________________`  
**Date**: `______________`  
**Signature**: `________________________________________`

---

#### Security Lead

| Section | Action | Date | Name | Signature | Notes |
|---------|--------|------|------|-----------|-------|
| 1. Security Approval | [ ] Approved  [ ] Rejected  [ ] Conditional | `__________` | `____________________` | `____________________` | `________________________________________` |
| 2. Database & Migration | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |
| 3. Infrastructure | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |
| 4. Features & Integration | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |
| 5. Operational | [ ] Reviewed  [ ] Waived | `__________` | `____________________` | `____________________` | `________________________________________` |

**Security Lead Final Acknowledgment:**  
I confirm the deployment meets security requirements, no critical vulnerabilities are present, and risk is acceptable.  
**Name**: `________________________________________`  
**Date**: `______________`  
**Signature**: `________________________________________`

---

#### Product Lead

| Section | Action | Date | Name | Signature | Notes |
|---------|--------|------|------|-----------|-------|
| 1. Security Approval | -- | -- | -- | -- | Not required |
| 2. Database & Migration | -- | -- | -- | -- | Not required |
| 3. Infrastructure | -- | -- | -- | -- | Not required |
| 4. Features & Integration | [ ] Approved  [ ] Rejected  [ ] Conditional | `__________` | `____________________` | `____________________` | `________________________________________` |
| 5. Operational | -- | -- | -- | -- | Not required |

**Product Lead Final Acknowledgment:**  
I confirm features are complete, integrations are functional, user-facing changes are acceptable, and business requirements are met.  
**Name**: `________________________________________`  
**Date**: `______________`  
**Signature**: `________________________________________`

---

### 6.3 Final Deployment Authorization

**FINAL DEPLOYMENT AUTHORIZATION**

All required approvals collected. Deployment authorized to proceed.

| Role | Final Approval | Date | Name | Signature |
|------|---------------|------|------|-----------|
| Dev Lead | [ ] Approved  [ ] Rejected  [ ] Conditional | `__________` | `____________________` | `____________________` |
| DevOps Lead | [ ] Approved  [ ] Rejected  [ ] Conditional | `__________` | `____________________` | `____________________` |
| Security Lead | [ ] Approved  [ ] Rejected  [ ] Conditional | `__________` | `____________________` | `____________________` |
| Product Lead | [ ] Approved  [ ] Rejected  [ ] Conditional | `__________` | `____________________` | `____________________` |

**Deployment Status**: [ ] **AUTHORIZED**  [ ] **REJECTED**  [ ] **CONDITIONAL** (conditions documented below)  
**Authorization Date**: `______________`  
**Authorized Window**: `______________` to `______________`

**Conditions for CONDITIONAL Approval:**  
`________________________________________________________________`  
`________________________________________________________________`  
`________________________________________________________________`  
`________________________________________________________________`  

---

## 7. Pre-Deployment Checklist Summary

**Complete this section immediately before deployment begins.**

### 7.1 Final Verification Checklist

| # | Item | Status | Verified By | Time |
|---|------|--------|-------------|------|
| 1 | All section summaries show PASS or CONDITIONAL with documented exceptions | [ ] Yes  [ ] No | `____________________` | `______` |
| 2 | All required signatures collected in Section 6 | [ ] Yes  [ ] No | `____________________` | `______` |
| 3 | Production backup completed within last 24 hours | [ ] Yes  [ ] No | `____________________` | `______` |
| 4 | Rollback runbook accessible and current | [ ] Yes  [ ] No | `____________________` | `______` |
| 5 | On-call engineer confirmed and available | [ ] Yes  [ ] No | `____________________` | `______` |
| 6 | Deployment window confirmed with stakeholders | [ ] Yes  [ ] No | `____________________` | `______` |
| 7 | Feature flag states verified | [ ] Yes  [ ] No | `____________________` | `______` |
| 8 | No high/critical security vulnerabilities outstanding | [ ] Yes  [ ] No | `____________________` | `______` |
| 9 | Database migration tested on production-like data | [ ] Yes  [ ] No | `____________________` | `______` |
| 10 | Post-deploy verification script tested | [ ] Yes  [ ] No | `____________________` | `______` |
| 11 | Canary/slow-roll plan ready (if applicable) | [ ] Yes  [ ] No  [ ] N/A | `____________________` | `______` |
| 12 | No conflicting maintenance windows or deployments | [ ] Yes  [ ] No | `____________________` | `______` |
| 13 | Status page updated (if applicable) | [ ] Yes  [ ] No  [ ] N/A | `____________________` | `______` |
| 14 | Stakeholder notifications sent | [ ] Yes  [ ] No | `____________________` | `______` |
| 15 | Deployment artifact (container image/commit) tagged and immutable | [ ] Yes  [ ] No | `____________________` | `______` |

### 7.2 Deployment Readiness Decision

| Decision | Status |
|----------|--------|
| [ ] **READY TO DEPLOY** - All checks passed, all approvals collected | |
| [ ] **READY WITH CONDITIONS** - Documented conditions must be met during/after deployment | |
| [ ] **NOT READY** - Blocking issues must be resolved before deployment | |

**Blocking Issues:**  
`________________________________________________________________`  
`________________________________________________________________`  
`________________________________________________________________`  

**Decision Made By**: `________________________________________`  
**Decision Date/Time**: `______________` `______`

---

## 8. Post-Deployment Verification

**Complete this section immediately after deployment completes.**

### 8.1 Immediate Post-Deploy Checks (0-15 minutes)

| # | Check | Expected Result | Actual Result | Status | Checked By | Time |
|---|-------|----------------|---------------|--------|------------|------|
| 1 | Application health endpoint | HTTP 200, response time < 500ms | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 2 | Database connectivity | Successful query execution | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 3 | Redis/cache connectivity | PING returns PONG, < 50ms | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 4 | Error rate (Sentry/logs) | Zero critical errors, < 0.1% error rate | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 5 | Key API endpoints (list top 5) | All return 200 with correct payloads | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 6 | Frontend loads correctly | No console errors, key features accessible | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 7 | SSL certificate valid | TLS 1.2+, cert not expired | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 8 | Process group status | All 3 groups healthy (app, qeeg_worker, stripe_worker) | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 9 | Autoscaling response | Metrics visible, scaling rules active | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 10 | Log streaming active | Logs flowing to aggregator, structured format intact | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |

### 8.2 Short-Term Monitoring (15-60 minutes)

| # | Check | Expected Result | Actual Result | Status | Checked By | Time |
|---|-------|----------------|---------------|--------|------------|------|
| 1 | p50/p95/p99 latency | p50 < 200ms, p95 < 800ms, p99 < 2000ms | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 2 | Database connection pool | Usage < 80% of max, no wait events | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 3 | Queue depth (qeeg_worker) | Processing without backlog | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 4 | Queue depth (stripe_worker) | Processing without backlog | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 5 | Payment processing | Test transaction successful | `____________________` | [ ] Pass  [ ] Fail  [ ] N/A | `____________________` | `______` |
| 6 | User login/auth | Successful authentication, token issuance | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 7 | Alert rules quiet | No false positive alerts | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 8 | Resource utilization | CPU < 70%, Memory < 80%, Disk < 85% | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |

### 8.3 Extended Monitoring (1-24 hours)

| # | Check | Expected Result | Actual Result | Status | Checked By | Time |
|---|-------|----------------|---------------|--------|------------|------|
| 1 | Error budget consumption | < 5% of daily budget consumed | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 2 | No customer-reported issues | Zero P1/P2 customer tickets | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 3 | Adverse event system quiet | No missed alerts or false negatives | `____________________` | [ ] Pass  [ ] Fail  [ ] N/A | `____________________` | `______` |
| 4 | Scheduled jobs executing | Cron/scheduled tasks running on time | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 5 | Data pipeline throughput | Processing rate within normal range | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |
| 6 | Backup verification | Automated backup completed successfully | `____________________` | [ ] Pass  [ ] Fail | `____________________` | `______` |

### 8.4 Deployment Completion Record

| Property | Value |
|----------|-------|
| Deployment Start Time | `______________` |
| Deployment End Time | `______________` |
| Total Duration | `______________` |
| Deployment Method | [ ] Blue-Green  [ ] Rolling  [ ] Canary  [ ] Recreate |
| Issues Encountered | `________________________________________` |
| Issues Resolution | `________________________________________` |
| Rollback Required | [ ] Yes  [ ] No |
| Rollback Executed At | `______________` |
| Post-Deploy Status | [ ] Healthy  [ ] Degraded  [ ] Incident Declared |

### 8.5 Post-Deployment Sign-off

| Role | Sign-off | Date | Name |
|------|----------|------|------|
| Dev Lead | [ ] Post-deploy verified  [ ] Issues noted | `__________` | `____________________` |
| DevOps Lead | [ ] Systems stable  [ ] Monitoring active | `__________` | `____________________` |
| Security Lead | [ ] No security anomalies  [ ] Review complete | `__________` | `____________________` |
| Product Lead | [ ] Features verified  [ ] Users not impacted | `__________` | `____________________` |

---

## 9. Emergency Contacts

### 9.1 Primary Response Team

| Role | Name | Phone | Email | Slack Handle | Backup Contact |
|------|------|-------|-------|-------------|---------------|
| Dev Lead | `____________________` | `____________________` | `____________________` | `@________________` | `____________________` |
| DevOps Lead | `____________________` | `____________________` | `____________________` | `@________________` | `____________________` |
| Security Lead | `____________________` | `____________________` | `____________________` | `@________________` | `____________________` |
| Product Lead | `____________________` | `____________________` | `____________________` | `@________________` | `____________________` |
| Clinical Lead | `____________________` | `____________________` | `____________________` | `@________________` | `____________________` |
| QA Lead | `____________________` | `____________________` | `____________________` | `@________________` | `____________________` |

### 9.2 Escalation Path

| Level | Trigger | Contact | Response Time |
|-------|---------|---------|---------------|
| L1 - Team | Any deployment anomaly | On-call engineer (see rotation) | 5 minutes |
| L2 - Leads | L1 cannot resolve in 15 min | Dev Lead + DevOps Lead | 15 minutes |
| L3 - Management | L2 cannot resolve in 30 min | Engineering Manager + Product Lead | 30 minutes |
| L4 - Executive | Patient safety or data breach | CTO + CPO + Legal | 1 hour |

### 9.3 External Vendor Contacts

| Vendor | Service | Support URL/Phone | Account ID | Escalation Path |
|--------|---------|------------------|------------|-----------------|
| Fly.io | Hosting/Compute | `____________________` | `____________________` | `____________________` |
| Stripe | Payments | `____________________` | `____________________` | `____________________` |
| Netlify | Frontend CDN | `____________________` | `____________________` | `____________________` |
| Upstash/Redis | Caching | `____________________` | `____________________` | `____________________` |
| Sentry | Error Tracking | `____________________` | `____________________` | `____________________` |
| PagerDuty/Opsgenie | On-call | `____________________` | `____________________` | `____________________` |
| Cloudflare | DNS/Security | `____________________` | `____________________` | `____________________` |

### 9.4 Regulatory & Compliance

| Entity | Contact | Phone | Email | Purpose |
|--------|---------|-------|-------|---------|
| HIPAA Privacy Officer | `____________________` | `____________________` | `____________________` | Data breach notification |
| Legal Counsel | `____________________` | `____________________` | `____________________` | Regulatory guidance |
| Compliance Officer | `____________________` | `____________________` | `____________________` | Audit and reporting |

---

## Appendix A: Regulatory Compliance Mapping

### A.1 HIPAA Compliance Mapping

| HIPAA Requirement | Checklist Section(s) | Responsible Role | Verification |
|------------------|---------------------|------------------|--------------|
| 164.312(a)(1) - Access Control | 1.2, 1.4, 4.3 | Security Lead | Authentication + authorization verified |
| 164.312(a)(2)(i) - Unique User ID | 1.2, 4.3 | Security Lead | Unique user identification enforced |
| 164.312(a)(2)(ii) - Emergency Access | 5.3, 9 | DevOps Lead + Security Lead | Emergency procedures documented |
| 164.312(a)(2)(iv) - Encryption/Decryption | 1.2, 1.4, 3.3 | Security Lead | Fernet + TLS encryption verified |
| 164.312(b) - Audit Controls | 1.4.4, 5.2 | Security Lead + DevOps Lead | Audit logging enabled and retained |
| 164.312(c)(1) - Integrity Controls | 2.4, 4.2 | Dev Lead | Data validation + integrity checks active |
| 164.312(c)(2) - Mechanism to Authenticate ePHI | 2.4, 2.3 | Dev Lead + DevOps Lead | Checksums + validation rules active |
| 164.312(d) - Person/Entity Authentication | 1.2 | Security Lead | MFA + strong authentication verified |
| 164.312(e)(1) - Transmission Security | 1.3, 3.5 | DevOps Lead + Security Lead | TLS 1.2+ enforced, no plaintext PHI |
| 164.308(a)(5)(ii)(B) - Protection from Malicious Software | 1.6 | Security Lead | Dependency + container scanning |
| 164.308(a)(6)(ii) - Response and Reporting | 5.3, 9 | Security Lead + DevOps Lead | Incident response plan current |
| 164.310(d)(2)(iv) - Backup Procedures | 2.2, 3.2 | DevOps Lead | Backup + recovery tested |
| 164.312(e)(2)(ii) - Encryption of ePHI at Rest | 1.4.2, 3.3 | Security Lead | Field-level + volume encryption verified |

### A.2 PCI DSS Compliance Mapping (Payment Processing)

| PCI DSS Requirement | Checklist Section(s) | Responsible Role | Verification |
|--------------------|---------------------|------------------|--------------|
| Req 1 - Firewall Configuration | 1.3.4, 3.5 | DevOps Lead + Security Lead | Network segmentation verified |
| Req 2 - Default Passwords | 1.1.3 | Security Lead | No default credentials confirmed |
| Req 3 - Stored Cardholder Data | 1.5.2 | Security Lead | No PAN/CVV in application scope |
| Req 4 - Encryption in Transit | 1.3.1, 3.5.2 | DevOps Lead + Security Lead | TLS 1.2+ enforced |
| Req 6 - Secure Systems/Applications | 1.6, 1.4 | Security Lead + Dev Lead | SAST/DAST + dependency scanning |
| Req 8 - Identify and Authenticate Access | 1.2, 4.3 | Security Lead | Strong auth + RBAC verified |
| Req 10 - Track and Monitor Access | 1.4.4, 5.2 | Security Lead + DevOps Lead | Audit logging + log retention |
| Req 11 - Security Testing | 1.6.3, 1.3.1 | Security Lead | Vulnerability scanning active |
| Req 12 - Information Security Policy | 5.3, 9 | Security Lead | IR plan + security policies current |

### A.3 FDA 21 CFR Part 820 (Medical Device Software) Mapping

| 21 CFR 820 Requirement | Checklist Section(s) | Responsible Role | Verification |
|------------------------|---------------------|------------------|--------------|
| 820.30(i) - Design Changes | 4, 6 | Product Lead | Change controlled + approved |
| 820.70(i) - Automated Processes | 4.2, 5 | DevOps Lead + Dev Lead | qEEG/MRI pipeline validated |
| 820.75 - Process Validation | 4.1, 4.2 | Dev Lead + Product Lead | Knowledge Layer + clinical pipelines tested |
| 820.80 - Receiving Acceptance | 4.5 | Dev Lead | Wearable integration validated |
| 820.90 - Nonconforming Product | 4.7.1, 4.7.4 | Product Lead | Adverse event + deviation handling verified |
| 820.100 - CAPA | 5.3, 8 | DevOps Lead + Security Lead | Corrective action procedures documented |
| 820.198 - Complaint Files | 4.7, 9 | Product Lead | Adverse event tracking + escalation |

### A.4 SOC 2 Type II Mapping

| SOC 2 Trust Service Criteria | Checklist Section(s) | Responsible Role | Verification |
|-----------------------------|---------------------|------------------|--------------|
| CC6.1 - Security Infrastructure | 1, 3 | Security Lead + DevOps Lead | Security + infra controls verified |
| CC6.2 - Security Incident Response | 5.3, 9 | Security Lead + DevOps Lead | IR plan + escalation tested |
| CC6.3 - Security Monitoring | 5.1, 5.2 | DevOps Lead | Monitoring + alerting operational |
| CC6.6 - Encryption | 1.2, 1.3, 1.4 | Security Lead | Encryption at rest + in transit |
| CC7.1 - System Operations | 5, 8 | DevOps Lead | Operational procedures + post-deploy checks |
| CC7.2 - System Monitoring | 5.1 | DevOps Lead | Monitoring dashboards + alerts |
| CC7.3 - Change Management | 2, 6, 7 | DevOps Lead + Dev Lead | Migration tested + approvals collected |
| CC8.1 - Change Control | 6, 7 | Product Lead + DevOps Lead | Change ticket + authorization |
| CC9.1 - Risk Assessment | 1, A | Security Lead | Security risk assessed + accepted |

### A.5 State and Federal Clinical Regulations

| Regulation | Checklist Section(s) | Responsible Role | Verification |
|------------|---------------------|------------------|--------------|
| State Medical Practice Act Compliance | 4.2, 4.3, 4.7 | Product Lead | Clinical workflows reviewed |
| DEA Controlled Substance Reporting | 4.2.3, 4.7 | Product Lead + Security Lead | Medication tracking + audit trail |
| FDA Adverse Event Reporting (MDR) | 4.7.1, 4.7.3 | Product Lead | AE detection + reporting workflow |
| State Data Breach Notification Laws | 1.4, 5.3, 9 | Security Lead | Breach response procedures current |
| 21 CFR Part 11 (Electronic Records) | 1.2, 1.4.4, 2.4 | Security Lead + Dev Lead | Audit trail + electronic signature |

---

> **END OF DEPLOYMENT APPROVAL CHECKLIST**
>
> This document is a controlled record. All modifications must be tracked through the change management process. Retention period: 7 years per HIPAA requirements.
>
> **Document Version**: `____________________`  
> **Last Updated**: `____________________`  
> **Document Owner**: DevOps Lead  
> **Next Review Date**: `____________________`

---

*Generated for DeepSynaps Protocol Studio - Clinical Neuromodulation Platform*  
*Classification: INTERNAL - RESTRICTED*  
*Distribution: Dev Lead, DevOps Lead, Security Lead, Product Lead only*
