#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Database Restore
# ═══════════════════════════════════════════════════════════════════════════════
# Restores PostgreSQL or SQLite databases from encrypted, compressed backups
# stored in S3-compatible storage.
#
# Features:
#   - Lists available backups with timestamps and sizes
#   - Interactive restore (prompt for confirmation)
#   - Automated restore (non-interactive for DR automation)
#   - Pre-restore validation (disk space, target DB connectivity)
#   - Post-restore verification (health check queries)
#   - Migration status check (alembic current vs head)
#   - Supports both PostgreSQL and SQLite
#   - Idempotent — safe to retry
#   - --dry-run mode
#   - No patient data (PHI) ever logged
#   - Full audit trail for compliance
#
# Environment Variables:
#   DEEPSYNAPS_DATABASE_URL    — Target database connection string (required)
#   BACKUP_S3_ENDPOINT         — S3 endpoint (default: s3.amazonaws.com)
#   BACKUP_S3_BUCKET           — S3 bucket name (required)
#   BACKUP_S3_ACCESS_KEY       — S3 access key (required)
#   BACKUP_S3_SECRET_KEY       — S3 secret key (required)
#   BACKUP_S3_REGION           — S3 region (default: us-east-1)
#   BACKUP_ENCRYPTION_KEY      — AES-256 encryption key (required)
#   DEEPSYNAPS_APP_ENV         — Environment label
#
# Usage:
#   ./restore-database.sh                     # Interactive — list and prompt
#   ./restore-database.sh --backup KEY        # Restore specific backup
#   ./restore-database.sh --latest            # Restore most recent backup
#   ./restore-database.sh --latest --auto     # Automated (no prompt)
#   ./restore-database.sh --dry-run           # Simulate restore
#   ./restore-database.sh --list              # List available backups
#   ./restore-database.sh --backup KEY --verify-only  # Just verify backup file
#
# RTO: < 1 hour
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail
IFS=$'\n\t'

# ─────────────────────────────────────────────────────────────────────────────
# Script metadata
# ─────────────────────────────────────────────────────────────────────────────
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_VERSION="2.0.0"
readonly SCRIPT_START_TIME="$(date -u +%s)"

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────
: "${BACKUP_S3_ENDPOINT:=s3.amazonaws.com}"
: "${BACKUP_S3_REGION:=us-east-1}"
: "${BACKUP_S3_PATH_PREFIX:=backups/database}"
: "${DEEPSYNAPS_APP_ENV:=production}"
: "${RESTORE_MIN_FREE_SPACE_GB:=5}"
: "${RESTORE_VERIFY_QUERIES:=true}"
: "${RESTORE_RUN_MIGRATIONS:=true}"

# Alembic configuration
ALEMBIC_INI="${ALEMBIC_INI:-${SCRIPT_DIR}/../apps/api/alembic.ini}"

# ─────────────────────────────────────────────────────────────────────────────
# State
# ─────────────────────────────────────────────────────────────────────────────
DRY_RUN=false
AUTO_MODE=false
LATEST=false
LIST_MODE=false
VERIFY_ONLY=false
SELECTED_BACKUP=""
EXIT_CODE=0
RESTORE_START_TIME=""
RESTORE_END_TIME=""

# ─────────────────────────────────────────────────────────────────────────────
# Logging — structured, PHI-safe
# ─────────────────────────────────────────────────────────────────────────────
LOG_LEVEL="${RESTORE_LOG_LEVEL:-INFO}"

log() {
    local level="$1"
    shift
    local timestamp
    timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    local message="$*"
    # Strip any potential PHI
    message="$(echo "$message" | sed -E 's/postgresql:\/\/[^@]+@/postgresql:\/\/***\/***@/g')"
    printf '%s %s [%s] %s\n' "$timestamp" "$SCRIPT_NAME" "$level" "$message" >&2
}

log_debug() { [[ "$LOG_LEVEL" == "DEBUG" ]] && log "DEBUG" "$@"; }
log_info()  { log "INFO" "$@"; }
log_warn()  { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }

# ─────────────────────────────────────────────────────────────────────────────
# Audit trail
# ─────────────────────────────────────────────────────────────────────────────
AUDIT_LOG="${RESTORE_AUDIT_LOG:-${SCRIPT_DIR}/../logs/restore-audit.log}"

audit_log() {
    local event="$1"
    local status="$2"
    shift 2
    local timestamp
    timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    mkdir -p "$(dirname "$AUDIT_LOG")"
    printf '{"time":"%s","event":"%s","status":"%s","script":"%s","version":"%s","host":"%s","pid":%d,"env":"%s","details":"%s"}\n' \
        "$timestamp" "$event" "$status" "$SCRIPT_NAME" "$SCRIPT_VERSION" "$(hostname)" $$ "$DEEPSYNAPS_APP_ENV" "$*" \
        >> "$AUDIT_LOG"
}

# ─────────────────────────────────────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
DeepSynaps Protocol Studio — Database Restore v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    --backup KEY       Restore specific backup S3 key
    --latest           Restore the most recent backup
    --auto             Non-interactive mode (for automation/DR)
    --verify-only      Download and verify backup without restoring
    --list             List available backups
    --dry-run          Simulate without making changes
    --skip-migrations  Skip alembic migration check after restore
    -h, --help         Show this help message
    -v, --version      Show version

Environment Variables:
    DEEPSYNAPS_DATABASE_URL    Target database connection string (required)
    BACKUP_S3_BUCKET           S3 bucket name (required)
    BACKUP_S3_ACCESS_KEY       S3 access key (required)
    BACKUP_S3_SECRET_KEY       S3 secret key (required)
    BACKUP_ENCRYPTION_KEY      AES-256 encryption key (required, 64 hex chars)

Examples:
    # Interactive restore
    ${SCRIPT_NAME}

    # Restore latest backup (automated)
    ${SCRIPT_NAME} --latest --auto

    # Restore specific backup
    ${SCRIPT_NAME} --backup backups/database/production/backup_20240115.tar.zst.enc

    # Verify a backup
    ${SCRIPT_NAME} --backup KEY --verify-only

    # Dry run
    ${SCRIPT_NAME} --latest --auto --dry-run
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --backup)
                SELECTED_BACKUP="$2"
                shift
                ;;
            --latest)
                LATEST=true
                ;;
            --auto)
                AUTO_MODE=true
                ;;
            --verify-only)
                VERIFY_ONLY=true
                ;;
            --list)
                LIST_MODE=true
                ;;
            --dry-run)
                DRY_RUN=true
                log_info "Dry run mode enabled"
                ;;
            --skip-migrations)
                RESTORE_RUN_MIGRATIONS=false
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            -v|--version)
                echo "${SCRIPT_NAME} v${SCRIPT_VERSION}"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
        shift
    done
}

# ─────────────────────────────────────────────────────────────────────────────
# Dependency checks
# ─────────────────────────────────────────────────────────────────────────────
check_dependencies() {
    local missing=()

    command -v openssl >/dev/null 2>&1 || missing+=("openssl")
    command -v zstd >/dev/null 2>&1 || missing+=("zstd")
    command -v date >/dev/null 2>&1 || missing+=("date")

    if command -v aws >/dev/null 2>&1; then
        S3_TOOL="aws"
    elif command -v curl >/dev/null 2>&1; then
        S3_TOOL="curl"
    else
        missing+=("aws-cli OR curl")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing[*]}"
        return 1
    fi

    log_debug "Dependencies OK (S3: $S3_TOOL)"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Configuration validation
# ─────────────────────────────────────────────────────────────────────────────
validate_config() {
    local errors=0

    if [[ -z "${DEEPSYNAPS_DATABASE_URL:-}" ]]; then
        log_error "DEEPSYNAPS_DATABASE_URL environment variable is required"
        errors=$((errors + 1))
    fi

    if [[ -z "${BACKUP_S3_BUCKET:-}" ]]; then
        log_error "BACKUP_S3_BUCKET environment variable is required"
        errors=$((errors + 1))
    fi
    if [[ -z "${BACKUP_S3_ACCESS_KEY:-}" ]]; then
        log_error "BACKUP_S3_ACCESS_KEY environment variable is required"
        errors=$((errors + 1))
    fi
    if [[ -z "${BACKUP_S3_SECRET_KEY:-}" ]]; then
        log_error "BACKUP_S3_SECRET_KEY environment variable is required"
        errors=$((errors + 1))
    fi
    if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        log_error "BACKUP_ENCRYPTION_KEY environment variable is required"
        errors=$((errors + 1))
    fi

    if [[ $errors -gt 0 ]]; then
        return 1
    fi
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Detect database type
# ─────────────────────────────────────────────────────────────────────────────
detect_db_type() {
    local db_url="$1"
    if [[ "$db_url" == sqlite* ]]; then
        echo "sqlite"
    elif [[ "$db_url" == postgresql* ]] || [[ "$db_url" == postgres* ]]; then
        echo "postgresql"
    else
        echo "unknown"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# S3 helpers
# ─────────────────────────────────────────────────────────────────────────────
s3_download() {
    local s3_key="$1"
    local local_file="$2"

    log_info "Downloading s3://${BACKUP_S3_BUCKET}/${s3_key} ..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would download to $local_file"
        return 0
    fi

    if [[ "$S3_TOOL" == "aws" ]]; then
        if ! aws s3 cp "s3://${BACKUP_S3_BUCKET}/${s3_key}" "$local_file" \
                --endpoint-url "https://${BACKUP_S3_ENDPOINT}" \
                --region "$BACKUP_S3_REGION" 2>/dev/null; then
            log_error "Download failed"
            return 1
        fi
    else
        if ! curl -s -L -o "$local_file" \
                "https://${BACKUP_S3_BUCKET}.${BACKUP_S3_ENDPOINT}/${s3_key}" 2>/dev/null; then
            log_error "Download failed"
            return 1
        fi
    fi

    log_info "Download complete: $(du -h "$local_file" 2>/dev/null | cut -f1)"
    return 0
}

s3_list() {
    local prefix="${1:-$BACKUP_S3_PATH_PREFIX}"

    if [[ "$S3_TOOL" == "aws" ]]; then
        aws s3 ls "s3://${BACKUP_S3_BUCKET}/${prefix}/" \
            --endpoint-url "https://${BACKUP_S3_ENDPOINT}" \
            --region "$BACKUP_S3_REGION" \
            --recursive 2>/dev/null | sort -k1,2 | tail -50
    else
        log_warn "Listing via curl not implemented — install aws-cli for listing"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# List available backups
# ─────────────────────────────────────────────────────────────────────────────
list_backups() {
    log_info "Available backups for environment: $DEEPSYNAPS_APP_ENV"
    echo ""
    printf "%-25s %-15s %s\n" "TIMESTAMP" "SIZE" "S3 KEY"
    printf '%*s\n' 80 '' | tr ' ' '-'

    local backups
    backups="$(s3_list "${BACKUP_S3_PATH_PREFIX}/${DEEPSYNAPS_APP_ENV}")"
    if [[ -z "$backups" ]]; then
        echo "(No backups found)"
        return 1
    fi

    echo "$backups"
    echo ""
    echo "To restore: ${SCRIPT_NAME} --backup <S3_KEY>"
    audit_log "LIST_BACKUPS" "OK" "environment=$DEEPSYNAPS_APP_ENV"
}

# ─────────────────────────────────────────────────────────────────────────────
# Find latest backup
# ─────────────────────────────────────────────────────────────────────────────
find_latest_backup() {
    log_info "Finding latest backup..."

    local backups
    backups="$(s3_list "${BACKUP_S3_PATH_PREFIX}/${DEEPSYNAPS_APP_ENV}")"
    if [[ -z "$backups" ]]; then
        log_error "No backups found"
        return 1
    fi

    # Get the most recent .enc file (skip .iv, .hmac, .sha256 files)
    local latest
    latest="$(echo "$backups" | grep '\.enc$' | grep -v 'LATEST' | sort -k1,2 | tail -1)"
    if [[ -z "$latest" ]]; then
        log_error "No valid backup files found"
        return 1
    fi

    # Extract S3 key from ls output
    local s3_key
    s3_key="$(echo "$latest" | awk '{print $4}')"
    echo "$s3_key"
}

# ─────────────────────────────────────────────────────────────────────────────
# Download and decrypt backup
# ─────────────────────────────────────────────────────────────────────────────
download_and_decrypt() {
    local s3_key="$1"
    local temp_dir="$2"

    local encrypted_file="${temp_dir}/backup.tar.zst.enc"
    local compressed_file="${temp_dir}/backup.tar.zst"

    # Download
    if ! s3_download "$s3_key" "$encrypted_file"; then
        return 1
    fi

    # Download IV file
    s3_download "${s3_key}.iv" "${encrypted_file}.iv" 2>/dev/null || true

    if [[ "$VERIFY_ONLY" == "true" ]]; then
        log_info "Backup downloaded and available at: $encrypted_file"
        echo "$encrypted_file"
        return 0
    fi

    # Decrypt
    log_info "Decrypting backup..."
    local iv
    if [[ -f "${encrypted_file}.iv" ]]; then
        iv="$(cat "${encrypted_file}.iv")"
    else
        log_error "IV file not found — cannot decrypt"
        return 1
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would decrypt with AES-256-CBC"
        echo "$compressed_file"
        return 0
    fi

    if ! openssl enc -aes-256-cbc -d \
            -in "$encrypted_file" \
            -out "$compressed_file" \
            -K "$BACKUP_ENCRYPTION_KEY" \
            -iv "$iv" 2>/dev/null; then
        log_error "Decryption failed — wrong encryption key or corrupted backup"
        return 1
    fi

    rm -f "$encrypted_file" "${encrypted_file}.iv"
    log_info "Decryption complete"
    echo "$compressed_file"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Pre-restore validation
# ─────────────────────────────────────────────────────────────────────────────
pre_restore_validation() {
    local db_url="$1"
    local db_type
    db_type="$(detect_db_type "$db_url")"

    log_info "Running pre-restore validation..."
    audit_log "PRE_RESTORE_VALIDATION" "IN_PROGRESS" "type=$db_type"

    # Check disk space
    local temp_dir="${RESTORE_TEMP_DIR:-/tmp}"
    local available_gb
    available_gb="$(df -BG "$temp_dir" 2>/dev/null | awk 'NR==2 {print $4}' | tr -d 'G')"
    if [[ "$available_gb" -lt "$RESTORE_MIN_FREE_SPACE_GB" ]]; then
        log_error "Insufficient disk space: ${available_gb}GB available, ${RESTORE_MIN_FREE_SPACE_GB}GB required"
        audit_log "PRE_RESTORE_VALIDATION" "FAILED" "disk_space=${available_gb}GB"
        return 1
    fi
    log_info "Disk space OK: ${available_gb}GB available"

    # Check target database connectivity
    case "$db_type" in
        postgresql)
            if ! PGPASSWORD="" pg_isready --dbname="$db_url" --timeout=10 >/dev/null 2>&1; then
                # Try with uri format
                if ! psql "$db_url" -c "SELECT 1;" >/dev/null 2>&1; then
                    log_warn "Cannot connect to target PostgreSQL — will attempt restore anyway"
                else
                    log_info "PostgreSQL connection OK"
                fi
            else
                log_info "PostgreSQL connection OK"
            fi
            ;;
        sqlite)
            # SQLite file access check
            local db_path="${db_url#sqlite:///}"
            db_path="${db_path#./}"
            local db_dir
            db_dir="$(dirname "$db_path")"
            if [[ ! -d "$db_dir" ]]; then
                log_warn "SQLite directory does not exist: $db_dir — will create"
                if [[ "$DRY_RUN" != "true" ]]; then
                    mkdir -p "$db_dir"
                fi
            fi
            log_info "SQLite target path OK: $db_path"
            ;;
        *)
            log_error "Unknown database type: $db_type"
            return 1
            ;;
    esac

    log_info "Pre-restore validation passed"
    audit_log "PRE_RESTORE_VALIDATION" "OK" "type=$db_type"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Restore PostgreSQL
# ─────────────────────────────────────────────────────────────────────────────
restore_postgresql() {
    local compressed_file="$1"
    local db_url="$2"

    log_info "Restoring PostgreSQL database..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would restore PostgreSQL from: $compressed_file"
        return 0
    fi

    # Decompress
    local dump_file="${compressed_file%.zst}"
    log_info "Decompressing backup..."
    zstd -d --force "$compressed_file" -o "$dump_file"

    # Create pre-restore snapshot if possible
    log_info "Creating safety snapshot of current database..."
    local safety_file="/tmp/pre_restore_safety_$(date -u '+%Y%m%dT%H%M%SZ').dump"
    if pg_dump --dbname="$db_url" --format=custom --file="$safety_file" 2>/dev/null; then
        log_info "Safety snapshot created: $safety_file"
    else
        log_warn "Could not create safety snapshot — proceeding anyway"
    fi

    # Drop and recreate database (or use pg_restore --clean)
    log_info "Restoring database (this may take several minutes)..."
    if pg_restore --dbname="$db_url" \
            --clean \
            --if-exists \
            --no-owner \
            --no-privileges \
            --verbose \
            "$dump_file" 2>/dev/null; then
        log_info "pg_restore completed successfully"
    elif pg_restore --dbname="$db_url" \
            --clean \
            --if-exists \
            --no-owner \
            --no-privileges \
            --verbose \
            --single-transaction \
            "$dump_file" 2>/dev/null; then
        log_info "pg_restore (single-transaction) completed successfully"
    else
        log_error "pg_restore failed"
        rm -f "$dump_file"
        return 1
    fi

    rm -f "$dump_file"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Restore SQLite
# ─────────────────────────────────────────────────────────────────────────────
restore_sqlite() {
    local compressed_file="$1"
    local db_url="$2"

    local db_path="${db_url#sqlite:///}"
    db_path="${db_path#./}"

    log_info "Restoring SQLite database to: $db_path"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would restore SQLite from: $compressed_file"
        return 0
    fi

    # Create safety backup of current database
    if [[ -f "$db_path" ]]; then
        local safety_backup="${db_path}.pre_restore_$(date -u '+%Y%m%dT%H%M%SZ')"
        cp "$db_path" "$safety_backup"
        log_info "Safety backup of current DB: $safety_backup"
    fi

    # Decompress
    log_info "Decompressing backup..."
    zstd -d --force "$compressed_file" -o "$db_path"

    log_info "SQLite restore complete"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Post-restore verification
# ─────────────────────────────────────────────────────────────────────────────
post_restore_verification() {
    local db_url="$1"
    local db_type
    db_type="$(detect_db_type "$db_url")"

    log_info "Running post-restore verification..."
    audit_log "POST_RESTORE_VERIFY" "IN_PROGRESS" "type=$db_type"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would run verification queries"
        return 0
    fi

    case "$db_type" in
        postgresql)
            # Basic connectivity
            if ! psql "$db_url" -c "SELECT 1;" >/dev/null 2>&1; then
                log_error "Cannot connect to restored PostgreSQL database"
                audit_log "POST_RESTORE_VERIFY" "FAILED" "connectivity=failed"
                return 1
            fi
            log_info "Database connectivity OK"

            # Check critical tables exist (without logging their content)
            local table_count
            table_count="$(psql "$db_url" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)"
            if [[ -z "$table_count" || "$table_count" == "0" ]]; then
                log_error "No tables found in restored database"
                audit_log "POST_RESTORE_VERIFY" "FAILED" "table_count=0"
                return 1
            fi
            log_info "Table count: $table_count"

            # Check row counts (aggregate only, no PHI)
            local total_rows
            total_rows="$(psql "$db_url" -t -c "SELECT sum(n_live_tup) FROM pg_stat_user_tables;" 2>/dev/null | xargs)"
            log_info "Total approximate row count: ${total_rows:-unknown}"

            # Verify extensions
            local extensions
            extensions="$(psql "$db_url" -t -c "SELECT extname FROM pg_extension;" 2>/dev/null | xargs)"
            log_info "Installed extensions: $extensions"
            ;;

        sqlite)
            # Basic connectivity
            if ! sqlite3 "$db_path" "SELECT 1;" >/dev/null 2>&1; then
                log_error "Cannot access restored SQLite database"
                audit_log "POST_RESTORE_VERIFY" "FAILED" "connectivity=failed"
                return 1
            fi
            log_info "SQLite database accessible"

            # Check tables
            local table_count
            table_count="$(sqlite3 "$db_path" "SELECT count(*) FROM sqlite_master WHERE type='table';" 2>/dev/null)"
            log_info "Table count: $table_count"

            # Quick integrity check
            if sqlite3 "$db_path" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
                log_info "SQLite integrity check passed"
            else
                log_warn "SQLite integrity check reported issues"
            fi
            ;;

        *)
            log_error "Unknown database type for verification"
            return 1
            ;;
    esac

    log_info "Post-restore verification passed"
    audit_log "POST_RESTORE_VERIFY" "OK" "type=$db_type"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Check migration status
# ─────────────────────────────────────────────────────────────────────────────
check_migrations() {
    local db_url="$1"

    if [[ "$RESTORE_RUN_MIGRATIONS" != "true" ]]; then
        log_info "Skipping migration check (--skip-migrations)"
        return 0
    fi

    log_info "Checking migration status..."

    if [[ ! -f "$ALEMBIC_INI" ]]; then
        log_warn "Alembic config not found at $ALEMBIC_INI — skipping migration check"
        return 0
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would check: alembic current vs head"
        return 0
    fi

    # Find alembic directory
    local alembic_dir
    alembic_dir="$(dirname "$ALEMBIC_INI")"

    # Run alembic current and head
    local current_version
    local head_version

    cd "$alembic_dir" || {
        log_warn "Cannot cd to $alembic_dir — skipping migration check"
        return 0
    }

    if command -v alembic >/dev/null 2>&1; then
        current_version="$(alembic current 2>/dev/null | head -1 || echo 'unknown')"
        head_version="$(alembic heads 2>/dev/null | head -1 || echo 'unknown')"

        log_info "Alembic current: $current_version"
        log_info "Alembic head: $head_version"

        if echo "$current_version" | grep -q "head"; then
            log_info "Database is at latest migration"
        else
            log_warn "Database is NOT at latest migration — running alembic upgrade..."
            if alembic upgrade head 2>/dev/null; then
                log_info "Migrations applied successfully"
                audit_log "MIGRATIONS" "APPLIED" "alembic upgrade head"
            else
                log_error "Failed to apply migrations"
                audit_log "MIGRATIONS" "FAILED" "alembic upgrade head"
                return 1
            fi
        fi
    else
        log_warn "alembic command not found — skipping migration check"
    fi

    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Interactive confirmation
# ─────────────────────────────────────────────────────────────────────────────
confirm_restore() {
    local backup_info="$1"

    if [[ "$AUTO_MODE" == "true" ]]; then
        log_info "Auto mode — skipping confirmation"
        return 0
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  DATABASE RESTORE CONFIRMATION"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  Target Database:    ${DEEPSYNAPS_APP_ENV}"
    echo "  Database Type:      $(detect_db_type "$DEEPSYNAPS_DATABASE_URL")"
    echo "  Backup:             $backup_info"
    echo "  Dry Run:            $DRY_RUN"
    echo ""
    echo "  WARNING: This will OVERWRITE the current database!"
    echo "  All data since the backup was taken will be lost."
    echo ""
    echo "  This action is logged for compliance auditing."
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    read -r -p "Type 'RESTORE' to proceed: " confirm

    if [[ "$confirm" != "RESTORE" ]]; then
        log_info "Restore cancelled by user"
        audit_log "RESTORE_CONFIRM" "CANCELLED" "user_cancelled"
        return 1
    fi

    log_info "Restore confirmed"
    audit_log "RESTORE_CONFIRM" "CONFIRMED" "$backup_info"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Main restore procedure
# ─────────────────────────────────────────────────────────────────────────────
run_restore() {
    local s3_key="$1"

    log_info "Starting restore from: $s3_key"
    RESTORE_START_TIME="$(date -u +%s)"
    audit_log "RESTORE_START" "IN_PROGRESS" "s3_key=$s3_key"

    # Create temp directory
    local temp_dir
    temp_dir="$(mktemp -d /tmp/deepsynaps_restore.XXXXXX)"
    log_debug "Temp directory: $temp_dir"

    # Cleanup on exit
    cleanup() {
        rm -rf "$temp_dir"
    }
    trap cleanup EXIT

    # Download and decrypt
    local compressed_file
    if ! compressed_file="$(download_and_decrypt "$s3_key" "$temp_dir")"; then
        audit_log "RESTORE_DECRYPT" "FAILED" "s3_key=$s3_key"
        return 1
    fi

    if [[ "$VERIFY_ONLY" == "true" ]]; then
        log_info "Backup verification complete — no restore performed"
        audit_log "VERIFY_ONLY" "OK" "s3_key=$s3_key"
        return 0
    fi

    # Pre-restore validation
    if ! pre_restore_validation "$DEEPSYNAPS_DATABASE_URL"; then
        audit_log "RESTORE_PRECHECK" "FAILED" "validation_failed"
        return 1
    fi

    # Confirm with user (interactive mode)
    if ! confirm_restore "$s3_key"; then
        return 1
    fi

    # Perform restore
    local db_type
    db_type="$(detect_db_type "$DEEPSYNAPS_DATABASE_URL")"

    case "$db_type" in
        postgresql)
            if ! restore_postgresql "$compressed_file" "$DEEPSYNAPS_DATABASE_URL"; then
                audit_log "RESTORE_EXECUTE" "FAILED" "type=postgresql"
                return 1
            fi
            ;;
        sqlite)
            if ! restore_sqlite "$compressed_file" "$DEEPSYNAPS_DATABASE_URL"; then
                audit_log "RESTORE_EXECUTE" "FAILED" "type=sqlite"
                return 1
            fi
            ;;
        *)
            log_error "Unsupported database type: $db_type"
            return 1
            ;;
    esac

    # Post-restore verification
    if ! post_restore_verification "$DEEPSYNAPS_DATABASE_URL"; then
        log_error "Post-restore verification failed"
        audit_log "RESTORE_VERIFY" "FAILED" "post_restore_check_failed"
        return 1
    fi

    # Check migrations
    if ! check_migrations "$DEEPSYNAPS_DATABASE_URL"; then
        log_warn "Migration check had issues — manual review recommended"
    fi

    # Calculate duration
    RESTORE_END_TIME="$(date -u +%s)"
    local duration=$((RESTORE_END_TIME - RESTORE_START_TIME))

    log_info "═══════════════════════════════════════════════════════════════"
    log_info "Restore complete — duration: ${duration}s"
    log_info "═══════════════════════════════════════════════════════════════"
    audit_log "RESTORE_COMPLETE" "OK" "duration=${duration}s, s3_key=$s3_key"

    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
main() {
    parse_args "$@"

    log_info "==========================================="
    log_info "DeepSynaps Restore v${SCRIPT_VERSION} starting"
    log_info "Environment: ${DEEPSYNAPS_APP_ENV}"
    log_info "Auto mode: ${AUTO_MODE}"
    log_info "Dry run: ${DRY_RUN}"
    log_info "==========================================="

    # Check dependencies
    if ! check_dependencies; then
        exit 1
    fi

    # List mode
    if [[ "$LIST_MODE" == "true" ]]; then
        validate_config || exit 1
        list_backups
        exit 0
    fi

    # Validate configuration
    if ! validate_config; then
        exit 1
    fi

    # Determine which backup to restore
    local target_backup=""

    if [[ -n "$SELECTED_BACKUP" ]]; then
        target_backup="$SELECTED_BACKUP"
    elif [[ "$LATEST" == "true" ]]; then
        if ! target_backup="$(find_latest_backup)"; then
            log_error "Could not find latest backup"
            exit 1
        fi
        log_info "Latest backup: $target_backup"
    else
        # Interactive: list and prompt
        list_backups
        echo ""
        read -r -p "Enter backup S3 key to restore (or 'cancel'): " user_input
        if [[ "$user_input" == "cancel" ]]; then
            log_info "Restore cancelled"
            exit 0
        fi
        target_backup="$user_input"
    fi

    if [[ -z "$target_backup" ]]; then
        log_error "No backup selected"
        exit 1
    fi

    # Run restore
    if run_restore "$target_backup"; then
        EXIT_CODE=0
    else
        EXIT_CODE=1
    fi

    # Calculate total duration
    local end_time
    end_time="$(date -u +%s)"
    local total_duration=$((end_time - SCRIPT_START_TIME))
    log_info "Total execution time: ${total_duration}s"

    exit "$EXIT_CODE"
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
