# Backup and Restore Runbook

## DeepSynaps Protocol Studio — Clinical Neuromodulation Platform

**Document ID:** RUN-001  
**Version:** 2.0.0  
**Classification:** Operational — HIPAA-Ready  
**Owner:** Infrastructure Engineering  
**Review Cycle:** Quarterly  
**Last Updated:** 2025-01-15

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Architecture](#3-architecture)
4. [Automated Backups](#4-automated-backups)
5. [Manual Backup Procedures](#5-manual-backup-procedures)
6. [Restore Procedures](#6-restore-procedures)
7. [Verification Procedures](#7-verification-procedures)
8. [Encryption and Security](#8-encryption-and-security)
9. [Compliance and Auditing](#9-compliance-and-auditing)
10. [Troubleshooting](#10-troubleshooting)
11. [Escalation](#11-escalation)
12. [Appendices](#12-appendices)

---

## 1. Overview

This runbook documents the procedures for backing up and restoring the DeepSynaps Protocol Studio database. The platform uses PostgreSQL in production and SQLite in development. All backup operations are encrypted, compressed, and stored in S3-compatible object storage.

### Recovery Objectives

| Metric | Target | Description |
|--------|--------|-------------|
| **RPO** | < 15 minutes | Maximum acceptable data loss |
| **RTO** | < 1 hour | Maximum acceptable downtime |
| **Backup Frequency** | Every 15 min (prod) | Automated schedule |
| **Retention** | 30 days | Production retention period |

### Supported Database Engines

| Engine | Backup Method | Compression | Encryption |
|--------|--------------|-------------|------------|
| PostgreSQL 15+ | `pg_dump` (custom format) | zstd (level 9) | AES-256-CBC |
| SQLite 3+ | File copy + VACUUM INTO | zstd (level 9) | AES-256-CBC |

---

## 2. Prerequisites

### Required Tools

- `bash` 4.0+
- `openssl` (for AES-256 encryption)
- `zstd` (for compression)
- `pg_dump` / `pg_restore` (for PostgreSQL)
- `sqlite3` (for SQLite)
- `aws-cli` or `curl` (for S3 operations)

### Required Environment Variables

| Variable | Purpose | Sensitivity |
|----------|---------|-------------|
| `DEEPSYNAPS_DATABASE_URL` | Database connection string | **HIGH** |
| `BACKUP_S3_BUCKET` | S3 bucket name | Medium |
| `BACKUP_S3_ACCESS_KEY` | S3 access key | **HIGH** |
| `BACKUP_S3_SECRET_KEY` | S3 secret key | **HIGH** |
| `BACKUP_S3_ENDPOINT` | S3-compatible endpoint | Low |
| `BACKUP_S3_REGION` | S3 region | Low |
| `BACKUP_ENCRYPTION_KEY` | AES-256 key (64 hex chars) | **CRITICAL** |
| `BACKUP_RETENTION_DAYS` | Retention period | Low |

### Access Requirements

- Read access to the database
- Write access to the S3 bucket
- Execution permissions on scripts

---

## 3. Architecture

### Backup Data Flow

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│   PostgreSQL    │────▶│  pg_dump     │────▶│  zstd        │────▶│ AES-256-CBC │
│   or SQLite     │     │  (custom)    │     │  compress    │     │  encrypt    │
└─────────────────┘     └──────────────┘     └──────────────┘     └──────┬──────┘
                                                                          │
                                     ┌────────────────────────────────────┘
                                     ▼
                            ┌─────────────────┐
                            │  S3-compatible  │
                            │  Object Store   │
                            └─────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
              [15-min]      [hourly]        [daily]
               (prod)       (staging)      (archive)
```

### Backup File Format

```
{db_name}_{db_type}_{YYYYMMDDTHHMMSSZ}_{hostname}.tar.zst.enc
├── {filename}.tar.zst.enc        # Encrypted, compressed backup
├── {filename}.tar.zst.enc.iv     # Initialization vector
├── {filename}.tar.zst.enc.hmac   # HMAC-SHA256 integrity check
└── {filename}.tar.zst.enc.sha256 # SHA-256 checksum
```

### S3 Path Structure

```
s3://{bucket}/
└── backups/
    └── database/
        ├── production/
        │   ├── deepsynaps_prod_postgresql_20240115T143000Z_app.tar.zst.enc
        │   ├── deepsynaps_prod_postgresql_20240115T143000Z_app.tar.zst.enc.iv
        │   ├── deepsynaps_prod_postgresql_20240115T143000Z_app.tar.zst.enc.hmac
        │   ├── deepsynaps_prod_postgresql_20240115T143000Z_app.tar.zst.enc.sha256
        │   └── LATEST.tar.zst.enc              # Symlink to latest
        └── staging/
            └── ...
```

---

## 4. Automated Backups

### Production Schedule

| Environment | Frequency | Cron Expression |
|-------------|-----------|----------------|
| Production | Every 15 minutes | `*/15 * * * *` |
| Staging | Every 6 hours | `0 */6 * * *` |
| Development | Manual only | N/A |

### Fly.io Machine Scheduler

A dedicated backup scheduler machine runs in production, executing `backup-database.sh` on the configured cron schedule.

### Setting Up Automated Backups

```bash
# 1. Set required secrets
fly secrets set BACKUP_S3_BUCKET=deepsynaps-backups \
              BACKUP_S3_ACCESS_KEY=<ACCESS_KEY> \
              BACKUP_S3_SECRET_KEY=<SECRET_KEY> \
              BACKUP_ENCRYPTION_KEY=<64_CHAR_HEX_KEY> \
              --app deepsynaps-studio

# 2. Verify scheduler is running
fly status --app deepsynaps-studio

# 3. Check backup logs
fly logs --app deepsynaps-studio | grep backup
```

---

## 5. Manual Backup Procedures

### 5.1 Initiate a Manual Backup

```bash
# Navigate to scripts directory
cd /app/scripts

# Standard backup
./backup-database.sh

# With dry-run (no actual backup created)
./backup-database.sh --dry-run

# Force (override lock file)
./backup-database.sh --force
```

### 5.2 List Available Backups

```bash
./backup-database.sh --list
```

**Expected Output:**
```
TIMESTAMP                 SIZE            S3 KEY
─────────────────────────────────────────────────────────────────────────
2024-01-15 14:30:00      45.2 MB         backups/database/production/deepsynaps_prod_postgresql_20240115T143000Z_app.tar.zst.enc
2024-01-15 14:15:00      45.1 MB         backups/database/production/deepsynaps_prod_postgresql_20240115T141500Z_app.tar.zst.enc
```

### 5.3 Verify the Latest Backup

```bash
./backup-database.sh --verify-only
```

---

## 6. Restore Procedures

### ⚠️ Critical Warnings

- **Restoring OVERWRITES the current database.** All data since the backup will be lost.
- **This action is irreversible.** Create a manual snapshot before proceeding if possible.
- **All operations are audited.** The restore will be logged for compliance.
- **No PHI is logged.** Only aggregate metadata is recorded.

### 6.1 Emergency Restore (Automated)

For disaster recovery scenarios where time is critical:

```bash
# Restore the most recent backup automatically (no prompts)
./restore-database.sh --latest --auto

# With dry-run to preview
./restore-database.sh --latest --auto --dry-run
```

**Timeline:**

| Step | Duration | Cumulative |
|------|----------|------------|
| Download from S3 | 2-10 min | 2-10 min |
| Decrypt | 1-3 min | 3-13 min |
| Decompress | 1-2 min | 4-15 min |
| Restore (pg_restore) | 5-30 min | 9-45 min |
| Verification | 1-2 min | 10-47 min |
| **Total** | | **< 1 hour** |

### 6.2 Interactive Restore

For controlled restores where you want to review before proceeding:

```bash
# List available backups
./restore-database.sh --list

# Restore specific backup
./restore-database.sh --backup backups/database/production/deepsynaps_prod_postgresql_20240115T143000Z_app.tar.zst.enc
```

You will be prompted to type `RESTORE` to confirm.

### 6.3 Restore to a Different Environment

```bash
# Set target environment variables
export DEEPSYNAPS_DATABASE_URL="postgresql://user:pass@staging-db:5432/deepsynaps_staging"
export DEEPSYNAPS_APP_ENV="staging"

# Restore
./restore-database.sh --latest --auto
```

### 6.4 Point-in-Time Recovery (PostgreSQL)

For recovering to a specific point in time (within backup granularity):

```bash
# 1. Identify the backup closest to (but before) target time
./restore-database.sh --list | grep "2024-01-15 14:"

# 2. Restore that backup
./restore-database.sh --backup <BACKUP_KEY> --auto

# 3. Apply WAL logs if available (managed by PostgreSQL)
# Contact infrastructure team for WAL-based PITR.
```

---

## 7. Verification Procedures

### 7.1 Automated Verification

Run the dedicated verification script:

```bash
./backup-verify.sh
```

This performs a 6-step verification:
1. Downloads the latest backup
2. Verifies SHA-256 checksum and HMAC
3. Decrypts the backup
4. Decompresses the data
5. Restores to a temporary database
6. Runs health check queries

### 7.2 Verification with Metrics Output

For monitoring integration (Prometheus):

```bash
./backup-verify.sh --json --metrics /var/lib/node_exporter/backup_verify.prom
```

### 7.3 Manual Health Check Queries

**PostgreSQL:**
```sql
-- Verify connectivity
SELECT 1;

-- Check table count
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';

-- Verify pgvector extension
SELECT * FROM pg_extension WHERE extname = 'pgvector';

-- Check database size (no PHI)
SELECT pg_size_pretty(pg_database_size(current_database()));
```

**SQLite:**
```sql
-- Integrity check
PRAGMA integrity_check;

-- Table count
SELECT count(*) FROM sqlite_master WHERE type='table';
```

---

## 8. Encryption and Security

### Encryption Scheme

- **Algorithm:** AES-256-CBC
- **Key Derivation:** PBKDF2 (100,000 iterations)
- **Key Length:** 256 bits (64 hex characters)
- **Integrity:** HMAC-SHA256

### Key Generation

```bash
# Generate a new encryption key
openssl rand -hex 32

# Store securely (never in version control)
fly secrets set BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32) --app deepsynaps-studio
```

### Key Rotation

1. Generate new key
2. Set as `BACKUP_ENCRYPTION_KEY_V2`
3. Update backup script to use v2 key for new backups
4. Maintain v1 key for historical backup decryption
5. After retention period expires, v1 key can be retired

---

## 9. Compliance and Auditing

### Audit Trail

All backup and restore operations are logged to structured JSON audit files:

```
logs/
├── backup-audit.log      # Backup operations
├── restore-audit.log     # Restore operations
├── verify-audit.log      # Verification results
└── dr-audit.log          # Disaster recovery events
```

### Audit Record Format

```json
{
  "time": "2024-01-15T14:30:00Z",
  "event": "BACKUP_COMPLETE",
  "status": "OK",
  "script": "backup-database.sh",
  "version": "2.0.0",
  "host": "app-machine-abc123",
  "pid": 1234,
  "env": "production",
  "details": "duration=45s, size=47384920"
}
```

### Data Retention

| Data Type | Retention | Compliance |
|-----------|-----------|------------|
| Database backups | 30 days (configurable) | HIPAA |
| Audit logs | 7 years | HIPAA |
| Verification reports | 1 year | Internal |
| PHI in backups | Encrypted, same as production | HIPAA |

### PHI Handling

- **No PHI is ever logged.** Only aggregate counts and metadata.
- Database connection strings are redacted in all logs.
- Backup files are encrypted at rest with AES-256.
- S3 bucket should have server-side encryption enabled.
- Access to backups is restricted to infrastructure engineers.

---

## 10. Troubleshooting

### Common Issues

#### Issue: Lock file prevents backup

```
ERROR: Another backup is already running (PID: 1234). Use --force to override.
```

**Resolution:**
```bash
# Check if the process is actually running
ps aux | grep backup-database

# If stale lock (process dead), force override
./backup-database.sh --force
```

#### Issue: Insufficient disk space

```
ERROR: Insufficient disk space: 1GB available, 5GB required
```

**Resolution:**
```bash
# Check disk usage
df -h

# Clean temp files
rm -rf /tmp/deepsynaps-*

# Free up space or reduce backup size
```

#### Issue: S3 upload fails

```
ERROR: Upload failed after 3 attempts
```

**Resolution:**
```bash
# 1. Verify S3 credentials
aws s3 ls s3://$BACKUP_S3_BUCKET --endpoint-url https://$BACKUP_S3_ENDPOINT

# 2. Check network connectivity
ping $BACKUP_S3_ENDPOINT

# 3. Retry with verbose output
aws s3 cp backup.tar.zst.enc s3://$BACKUP_S3_BUCKET/test/ --debug
```

#### Issue: Decryption fails

```
ERROR: Decryption failed — wrong encryption key or corrupted backup
```

**Resolution:**
```bash
# 1. Verify key matches
# 2. Check backup HMAC for tampering
# 3. Try an older backup
./restore-database.sh --list
./restore-database.sh --backup <OLDER_BACKUP_KEY> --auto
```

#### Issue: pg_restore fails

```
ERROR: pg_restore failed
```

**Resolution:**
```bash
# Check PostgreSQL logs
fly logs --app deepsynaps-studio-db

# Try with --single-transaction
pg_restore --single-transaction --dbname="$DEEPSYNAPS_DATABASE_URL" backup.dump

# Check for version mismatch
pg_restore --version
psql "$DEEPSYNAPS_DATABASE_URL" -c "SELECT version();"
```

---

## 11. Escalation

### Severity Levels

| Level | Scenario | Response Time | Action |
|-------|----------|--------------|--------|
| **P0** | All backups failing, data loss risk | 15 minutes | On-call engineer + page |
| **P1** | Single backup failure | 1 hour | Log ticket, investigate |
| **P2** | Verification warnings | 4 hours | Review at next business day |
| **P3** | Retention policy issues | 24 hours | Scheduled fix |

### Escalation Path

```
1. On-Call Engineer (P0/P1)
   ↓ (if unresolved after 30 min)
2. Infrastructure Lead
   ↓ (if unresolved after 1 hour)
3. Engineering Manager
   ↓ (if data loss confirmed)
4. CTO + Legal (HIPAA breach assessment)
```

### Contact Information

| Role | Contact | Channel |
|------|---------|---------|
| On-Call | PagerDuty rotation | pagerduty.com/deepsynaps |
| Infrastructure Lead | infra@deepsynaps.com | Slack #infra-alerts |
| Security | security@deepsynaps.com | Slack #security |

---

## 12. Appendices

### Appendix A: Quick Reference Card

```
BACKUP:
  ./backup-database.sh                    # Create backup
  ./backup-database.sh --dry-run          # Simulate
  ./backup-database.sh --list             # List backups
  ./backup-database.sh --verify-only      # Verify latest

RESTORE:
  ./restore-database.sh --latest --auto   # Emergency restore
  ./restore-database.sh --list            # List available
  ./restore-database.sh --backup KEY      # Restore specific
  ./restore-database.sh --dry-run         # Simulate

VERIFY:
  ./backup-verify.sh                      # Full verification
  ./backup-verify.sh --json               # JSON output
```

### Appendix B: Related Scripts

| Script | Purpose | Schedule |
|--------|---------|----------|
| `backup-database.sh` | Create encrypted backups | Every 15 min (prod) |
| `restore-database.sh` | Restore from backup | On-demand |
| `backup-verify.sh` | Verify backup integrity | Every 6 hours |
| `disaster-recovery.sh` | Orchestrate full DR | On-demand |
| `database-maintenance.sh` | DB maintenance tasks | Weekly (maintenance window) |

### Appendix C: Glossary

| Term | Definition |
|------|-----------|
| **RPO** | Recovery Point Objective — max acceptable data loss |
| **RTO** | Recovery Time Objective — max acceptable downtime |
| **PHI** | Protected Health Information — patient data |
| **PITR** | Point-in-Time Recovery — restore to specific moment |
| **WAL** | Write-Ahead Logging — PostgreSQL transaction logs |
| **pgvector** | PostgreSQL extension for vector similarity search |

### Appendix D: Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0.0 | 2025-01-15 | Infra Team | Production-ready version |
| 1.1.0 | 2024-11-01 | Infra Team | Added SQLite support |
| 1.0.0 | 2024-09-15 | Infra Team | Initial version |

---

**END OF DOCUMENT**

*For questions or updates, contact infrastructure@deepsynaps.com or open a ticket in the internal tracker.*
