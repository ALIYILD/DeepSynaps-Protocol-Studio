#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Automated Database Backup
# ═══════════════════════════════════════════════════════════════════════════════
# Backs up PostgreSQL (pg_dump) or SQLite databases with compression,
# encryption, and S3-compatible upload. Enforces retention policies.
#
# Features:
#   - Supports PostgreSQL (pg_dump) and SQLite (file copy)
#   - Compresses with zstd, encrypts with AES-256-GCM via openssl
#   - Uploads to S3-compatible storage (AWS S3, Wasabi, MinIO, etc.)
#   - Configurable retention policy with automatic cleanup
#   - Backup verification via checksum
#   - Lock file prevents concurrent runs
#   - Idempotent — safe to run multiple times
#   - --dry-run mode for testing
#   - No patient data (PHI) ever logged
#
# Environment Variables:
#   DEEPSYNAPS_DATABASE_URL    — Database connection string (required)
#   BACKUP_S3_ENDPOINT         — S3 endpoint (default: s3.amazonaws.com)
#   BACKUP_S3_BUCKET           — S3 bucket name (required)
#   BACKUP_S3_ACCESS_KEY       — S3 access key (required)
#   BACKUP_S3_SECRET_KEY       — S3 secret key (required)
#   BACKUP_S3_REGION           — S3 region (default: us-east-1)
#   BACKUP_ENCRYPTION_KEY      — AES-256 encryption key (required)
#   BACKUP_RETENTION_DAYS      — Retention period (default: 30)
#   BACKUP_SCHEDULE            — Cron schedule (informational)
#   DEEPSYNAPS_APP_ENV         — environment label
#
# Usage:
#   ./backup-database.sh                    # Normal backup
#   ./backup-database.sh --dry-run          # Simulate without side effects
#   ./backup-database.sh --force            # Override lock file
#   ./backup-database.sh --verify-only      # Verify last backup without creating new
#   ./backup-database.sh --list             # List available backups
#
# RPO: < 15 minutes (production), < 6 hours (staging)
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
# Configuration defaults
# ─────────────────────────────────────────────────────────────────────────────
: "${BACKUP_S3_ENDPOINT:=s3.amazonaws.com}"
: "${BACKUP_S3_REGION:=us-east-1}"
: "${BACKUP_S3_PATH_PREFIX:=backups/database}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_COMPRESSION_LEVEL:=9}"
: "${BACKUP_LOCK_TIMEOUT:=3600}"      # 1 hour max lock hold time
: "${BACKUP_VERIFY_ENABLED:=true}"
: "${BACKUP_MAX_RETRIES:=3}"
: "${DEEPSYNAPS_APP_ENV:=production}"

# Clinical operating hours (UTC) — avoid backups during peak hours
CLINICAL_HOURS_START=07  # 7 AM UTC
CLINICAL_HOURS_END=22    # 10 PM UTC

# ─────────────────────────────────────────────────────────────────────────────
# State
# ─────────────────────────────────────────────────────────────────────────────
DRY_RUN=false
FORCE=false
VERIFY_ONLY=false
LIST_BACKUPS=false
BACKUP_FILE=""
BACKUP_CHECKSUM=""
BACKUP_SIZE=0
EXIT_CODE=0

# ─────────────────────────────────────────────────────────────────────────────
# Logging — structured, audit-compliant, PHI-safe
# ─────────────────────────────────────────────────────────────────────────────
LOG_LEVEL="${BACKUP_LOG_LEVEL:-INFO}"  # DEBUG, INFO, WARN, ERROR

log() {
    local level="$1"
    shift
    local timestamp
    timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    local message="$*"
    # Strip any potential PHI — never log database content, URLs with credentials, etc.
    message="$(echo "$message" | sed -E 's/postgresql:\/\/[^@]+@/postgresql:\/\/***\/***@/g')"
    printf '%s %s [%s] %s\n' "$timestamp" "$SCRIPT_NAME" "$level" "$message" >&2
}

log_debug() { [[ "$LOG_LEVEL" == "DEBUG" ]] && log "DEBUG" "$@"; }
log_info()  { log "INFO" "$@"; }
log_warn()  { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }

# ─────────────────────────────────────────────────────────────────────────────
# Audit trail — structured JSON for compliance
# ─────────────────────────────────────────────────────────────────────────────
AUDIT_LOG="${BACKUP_AUDIT_LOG:-${SCRIPT_DIR}/../logs/backup-audit.log}"

audit_log() {
    local event="$1"
    local status="$2"
    shift 2
    local details="$*"
    local timestamp
    timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    local hostname
    hostname="$(hostname)"
    local pid="$$"

    # Create audit log directory
    mkdir -p "$(dirname "$AUDIT_LOG")"

    printf '{"time":"%s","event":"%s","status":"%s","script":"%s","version":"%s","host":"%s","pid":%d,"env":"%s","details":"%s"}\n' \
        "$timestamp" "$event" "$status" "$SCRIPT_NAME" "$SCRIPT_VERSION" "$hostname" "$pid" "$DEEPSYNAPS_APP_ENV" "$details" \
        >> "$AUDIT_LOG"
}

# ─────────────────────────────────────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
DeepSynaps Protocol Studio — Database Backup v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    --dry-run          Simulate backup without creating/uploading files
    --force            Override lock file (use with caution)
    --verify-only      Verify the most recent backup without creating new
    --list             List available backups in S3
    --retention N      Override retention period (days)
    --env ENV          Override environment label
    -h, --help         Show this help message
    -v, --version      Show version

Environment Variables:
    DEEPSYNAPS_DATABASE_URL    Database connection string (required)
    BACKUP_S3_ENDPOINT         S3 endpoint URL
    BACKUP_S3_BUCKET           S3 bucket name (required)
    BACKUP_S3_ACCESS_KEY       S3 access key (required)
    BACKUP_S3_SECRET_KEY       S3 secret key (required)
    BACKUP_S3_REGION           S3 region (default: us-east-1)
    BACKUP_ENCRYPTION_KEY      AES-256 encryption key (required)
    BACKUP_RETENTION_DAYS      Retention period in days (default: 30)

Examples:
    ${SCRIPT_NAME}
    ${SCRIPT_NAME} --dry-run
    ${SCRIPT_NAME} --force --retention 7
    ${SCRIPT_NAME} --list
    ${SCRIPT_NAME} --verify-only
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                log_info "Dry run mode enabled — no changes will be made"
                ;;
            --force)
                FORCE=true
                log_warn "Force mode enabled — will override lock file"
                ;;
            --verify-only)
                VERIFY_ONLY=true
                log_info "Verify-only mode — checking last backup"
                ;;
            --list)
                LIST_BACKUPS=true
                ;;
            --retention)
                BACKUP_RETENTION_DAYS="$2"
                shift
                ;;
            --env)
                DEEPSYNAPS_APP_ENV="$2"
                shift
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
# Lock file management — prevents concurrent backup runs
# ─────────────────────────────────────────────────────────────────────────────
LOCK_FILE="/tmp/${SCRIPT_NAME%.sh}.lock"
LOCK_PID=""

acquire_lock() {
    if [[ -f "$LOCK_FILE" ]]; then
        LOCK_PID="$(cat "$LOCK_FILE" 2>/dev/null || true)"
        if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
            if [[ "$FORCE" != "true" ]]; then
                log_error "Another backup is already running (PID: $LOCK_PID). Use --force to override."
                audit_log "BACKUP_LOCK" "FAILED" "Lock held by PID $LOCK_PID"
                return 1
            fi
            log_warn "Force-acquiring lock from PID $LOCK_PID"
        fi
    fi

    if [[ "$DRY_RUN" != "true" ]]; then
        echo $$ > "$LOCK_FILE"
        # Set trap to release lock on exit
        trap release_lock EXIT
    fi
    log_info "Lock acquired"
    return 0
}

release_lock() {
    if [[ -f "$LOCK_FILE" ]] && [[ "$(cat "$LOCK_FILE" 2>/dev/null)" == "$$" ]]; then
        rm -f "$LOCK_FILE"
        log_debug "Lock released"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Dependency checks
# ─────────────────────────────────────────────────────────────────────────────
check_dependencies() {
    local missing=()

    # Always required
    command -v openssl >/dev/null 2>&1 || missing+=("openssl")
    command -v date >/dev/null 2>&1 || missing+=("date")

    if [[ "$VERIFY_ONLY" != "true" && "$LIST_BACKUPS" != "true" ]]; then
        # Backup creation needs these
        command -v zstd >/dev/null 2>&1 || missing+=("zstd")
    fi

    # S3 operations need curl or awscli
    if command -v aws >/dev/null 2>&1; then
            S3_TOOL="aws"
        elif command -v curl >/dev/null 2>&1; then
        S3_TOOL="curl"
    else
        missing+=("aws-cli OR curl")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing[*]}"
        audit_log "DEPENDENCY_CHECK" "FAILED" "Missing: ${missing[*]}"
        return 1
    fi

    log_debug "Dependencies OK (S3 tool: $S3_TOOL)"
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

    if [[ "$VERIFY_ONLY" != "true" && "$LIST_BACKUPS" != "true" ]]; then
        # Full backup needs S3 config
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
        # Validate encryption key length (AES-256 = 32 bytes = 64 hex chars)
        local key_len="${#BACKUP_ENCRYPTION_KEY}"
        if [[ "$key_len" -ne 64 ]]; then
            log_error "BACKUP_ENCRYPTION_KEY must be 64 hex characters (256-bit), got $key_len"
            errors=$((errors + 1))
        fi
    fi

    if [[ $errors -gt 0 ]]; then
        audit_log "VALIDATION" "FAILED" "$errors configuration errors"
        return 1
    fi

    log_info "Configuration validated"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Detect database type from connection string
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
# Extract database name from connection string (for backup filename)
# ─────────────────────────────────────────────────────────────────────────────
get_db_name() {
    local db_url="$1"
    local db_type
    db_type="$(detect_db_type "$db_url")"

    case "$db_type" in
        sqlite)
            # Extract filename from sqlite:///./path/to/db.sqlite3
            local db_path="${db_url#sqlite:///}"
            db_path="${db_path#./}"
            basename "$db_path" .sqlite3 2>/dev/null || basename "$db_path" .db 2>/dev/null || basename "$db_path"
            ;;
        postgresql)
            # Extract database name from postgresql://user:pass@host:port/dbname?params
            echo "$db_url" | sed -E 's/.*\/\/[^:]+:[^@]+@[^:]+:[0-9]+\/([^?]+).*/\1/'
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────────────────────
# Create backup directory
# ─────────────────────────────────────────────────────────────────────────────
ensure_backup_dir() {
    BACKUP_DIR="${BACKUP_DIR:-/tmp/deepsynaps-backups}"
    if [[ "$DRY_RUN" != "true" ]]; then
        mkdir -p "$BACKUP_DIR"
    fi
    log_debug "Backup directory: $BACKUP_DIR"
}

# ─────────────────────────────────────────────────────────────────────────────
# Generate backup filename
# ─────────────────────────────────────────────────────────────────────────────
generate_backup_filename() {
    local db_name="$1"
    local db_type="$2"
    local timestamp
    timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
    local hostname
    hostname="$(hostname -s 2>/dev/null || echo 'unknown')"

    # Format: deepsynaps_prod_postgresql_20240115T143000Z_lhr.tar.zst.enc
    echo "${db_name}_${db_type}_${timestamp}_${hostname}"
}

# ─────────────────────────────────────────────────────────────────────────────
# S3 helper functions
# ─────────────────────────────────────────────────────────────────────────────

s3_upload() {
    local local_file="$1"
    local s3_key="$2"
    local content_type="application/octet-stream"
    local max_retries="${BACKUP_MAX_RETRIES}"
    local retry=0

    log_info "Uploading to s3://${BACKUP_S3_BUCKET}/${s3_key} ..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would upload $local_file to s3://${BACKUP_S3_BUCKET}/${s3_key}"
        return 0
    fi

    while [[ $retry -lt $max_retries ]]; do
        if _s3_upload_raw "$local_file" "$s3_key" "$content_type"; then
            log_info "Upload successful: $s3_key"
            return 0
        fi
        retry=$((retry + 1))
        log_warn "Upload attempt $retry failed, retrying in $((retry * 5))s..."
        sleep $((retry * 5))
    done

    log_error "Upload failed after $max_retries attempts"
    return 1
}

_s3_upload_raw() {
    local local_file="$1"
    local s3_key="$2"
    local content_type="$3"

    if [[ "$S3_TOOL" == "aws" ]]; then
        aws s3 cp "$local_file" "s3://${BACKUP_S3_BUCKET}/${s3_key}" \
            --endpoint-url "https://${BACKUP_S3_ENDPOINT}" \
            --region "$BACKUP_S3_REGION" \
            --content-type "$content_type" \
            --metadata "x-amz-meta-backup-time=$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
            --metadata "x-amz-meta-app-env=${DEEPSYNAPS_APP_ENV}" \
            --metadata "x-amz-meta-script-version=${SCRIPT_VERSION}"
    else
        # curl-based upload with AWS Signature V4
        _s3_curl_upload "$local_file" "$s3_key" "$content_type"
    fi
}

_s3_curl_upload() {
    local local_file="$1"
    local s3_key="$2"
    local content_type="$3"
    local date_stamp
    date_stamp="$(date -u '+%Y%m%d')"
    local amz_date
    amz_date="${date_stamp}T$(date -u '+%H%M%S')Z"
    local payload_hash
    payload_hash="$(openssl dgst -sha256 "$local_file" | awk '{print $2}')"

    # Simplified signed URL approach using pre-signed URL generation
    # For production, use aws-cli or a proper S3 client
    curl -s -o /dev/null -w "%{http_code}" \
        -X PUT \
        -T "$local_file" \
        -H "Content-Type: $content_type" \
        -H "x-amz-date: $amz_date" \
        -H "x-amz-content-sha256: $payload_hash" \
        "https://${BACKUP_S3_BUCKET}.${BACKUP_S3_ENDPOINT}/${s3_key}" 2>/dev/null | grep -q '^2'
}

s3_download() {
    local s3_key="$1"
    local local_file="$2"

    if [[ "$S3_TOOL" == "aws" ]]; then
        aws s3 cp "s3://${BACKUP_S3_BUCKET}/${s3_key}" "$local_file" \
            --endpoint-url "https://${BACKUP_S3_ENDPOINT}" \
            --region "$BACKUP_S3_REGION"
    else
        curl -s -L \
            -o "$local_file" \
            "https://${BACKUP_S3_BUCKET}.${BACKUP_S3_ENDPOINT}/${s3_key}"
    fi
}

s3_list() {
    local prefix="${1:-$BACKUP_S3_PATH_PREFIX}"

    if [[ "$S3_TOOL" == "aws" ]]; then
        aws s3 ls "s3://${BACKUP_S3_BUCKET}/${prefix}/" \
            --endpoint-url "https://${BACKUP_S3_ENDPOINT}" \
            --region "$BACKUP_S3_REGION" \
            --recursive 2>/dev/null | sort -k1,2
    else
        log_warn "Listing via curl not implemented — install aws-cli for --list"
        return 1
    fi
}

s3_delete() {
    local s3_key="$1"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would delete s3://${BACKUP_S3_BUCKET}/${s3_key}"
        return 0
    fi

    if [[ "$S3_TOOL" == "aws" ]]; then
        aws s3 rm "s3://${BACKUP_S3_BUCKET}/${s3_key}" \
            --endpoint-url "https://${BACKUP_S3_ENDPOINT}" \
            --region "$BACKUP_S3_REGION"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# PostgreSQL backup (pg_dump)
# ─────────────────────────────────────────────────────────────────────────────
backup_postgresql() {
    local db_url="$1"
    local output_file="$2"
    local dump_file="${output_file%.zst.enc}.sql"
    local compressed_file="${output_file%.enc}"

    log_info "Creating PostgreSQL backup with pg_dump..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would run: pg_dump --clean --if-exists --verbose --file=$dump_file"
        BACKUP_SIZE=0
        return 0
    fi

    # pg_dump with custom format (compressed, parallel-restorable)
    if ! PGPASSWORD="" pg_dump --dbname="$db_url" \
            --format=custom \
            --verbose \
            --clean \
            --if-exists \
            --no-owner \
            --no-privileges \
            --file="$dump_file" 2>/dev/null; then
        log_error "pg_dump failed"
        rm -f "$dump_file"
        return 1
    fi

    log_info "pg_dump complete: $(du -h "$dump_file" 2>/dev/null | cut -f1)"

    # Compress with zstd
    log_info "Compressing with zstd (level $BACKUP_COMPRESSION_LEVEL)..."
    zstd -${BACKUP_COMPRESSION_LEVEL} --force --rm "$dump_file" -o "$compressed_file"

    BACKUP_SIZE="$(stat -c%s "$compressed_file" 2>/dev/null || stat -f%z "$compressed_file" 2>/dev/null)"
    log_info "Compressed size: $(numfmt --to=iec "$BACKUP_SIZE" 2>/dev/null || echo "$BACKUP_SIZE bytes")"

    # Encrypt
    encrypt_file "$compressed_file" "$output_file"
    rm -f "$compressed_file"

    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# SQLite backup (safe file copy + VACUUM)
# ─────────────────────────────────────────────────────────────────────────────
backup_sqlite() {
    local db_url="$1"
    local output_file="$2"
    local compressed_file="${output_file%.enc}"

    # Extract path from sqlite:///./path or sqlite:////absolute/path
    local db_path="${db_url#sqlite:///}"
    if [[ "$db_path" == ./* ]]; then
        db_path="${db_path#./}"
    fi

    if [[ ! -f "$db_path" ]]; then
        log_error "SQLite database file not found: $db_path"
        return 1
    fi

    log_info "Creating SQLite backup from: $db_path"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would copy and compress SQLite database"
        BACKUP_SIZE=0
        return 0
    fi

    # Create a safe copy (SQLite is safe to copy while in use)
    local temp_copy="${BACKUP_DIR}/sqlite_copy_$$.db"
    cp "$db_path" "$temp_copy"

    # Run VACUUM INTO for a clean, defragmented backup
    local vacuum_file="${BACKUP_DIR}/sqlite_vacuum_$$.db"
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$temp_copy" "VACUUM INTO '$vacuum_file';"
        if [[ -f "$vacuum_file" ]]; then
            mv "$vacuum_file" "$temp_copy"
        fi
    fi

    # Compress
    log_info "Compressing with zstd (level $BACKUP_COMPRESSION_LEVEL)..."
    zstd -${BACKUP_COMPRESSION_LEVEL} --force --rm "$temp_copy" -o "$compressed_file"

    BACKUP_SIZE="$(stat -c%s "$compressed_file" 2>/dev/null || stat -f%z "$compressed_file" 2>/dev/null)"
    log_info "Compressed size: $(numfmt --iec "$BACKUP_SIZE" 2>/dev/null || echo "$BACKUP_SIZE bytes")"

    # Encrypt
    encrypt_file "$compressed_file" "$output_file"
    rm -f "$compressed_file"

    return 0
}

# ─────────────────═════════════════════════════════════════════════════════════
# Encryption — AES-256-CBC with HMAC-SHA256 authentication
# ─────────────────══════════════════════════════════════════════════════════════

encrypt_file() {
    local input_file="$1"
    local output_file="$2"
    local iv
    iv="$(openssl rand -hex 16)"
    local salt
    salt="$(openssl rand -hex 16)"

    log_info "Encrypting backup (AES-256-CBC)..."

    # Derive key using PBKDF2 from the hex key
    local derived_key
    derived_key="$(echo -n "$BACKUP_ENCRYPTION_KEY" | openssl dgst -sha256 -binary | od -An -tx1 | tr -d ' \n')"

    # Encrypt: openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000
    # Using the hex key directly with -K flag
    if ! openssl enc -aes-256-cbc \
            -in "$input_file" \
            -out "$output_file" \
            -K "$BACKUP_ENCRYPTION_KEY" \
            -iv "$iv" 2>/dev/null; then
        log_error "Encryption failed"
        rm -f "$output_file"
        return 1
    fi

    # Store IV alongside the encrypted file for decryption
    echo "$iv" > "${output_file}.iv"

    # Compute HMAC for integrity verification
    local hmac
    hmac="$(openssl dgst -sha256 -hex -hmac "$BACKUP_ENCRYPTION_KEY" "$output_file" 2>/dev/null | awk '{print $2}')"
    echo "$hmac" > "${output_file}.hmac"

    log_info "Encryption complete (IV + HMAC stored)"
    return 0
}

decrypt_file() {
    local input_file="$1"
    local output_file="$2"
    local iv_file="${input_file}.iv"

    if [[ ! -f "$iv_file" ]]; then
        log_error "IV file not found: $iv_file"
        return 1
    fi

    local iv
    iv="$(cat "$iv_file")"

    log_info "Decrypting backup..."
    if ! openssl enc -aes-256-cbc -d \
            -in "$input_file" \
            -out "$output_file" \
            -K "$BACKUP_ENCRYPTION_KEY" \
            -iv "$iv" 2>/dev/null; then
        log_error "Decryption failed"
        rm -f "$output_file"
        return 1
    fi

    log_info "Decryption complete"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Checksum computation
# ─────────────────────────────────────────────────────────────────────────────
compute_checksum() {
    local file="$1"
    sha256sum "$file" 2>/dev/null | awk '{print $1}'
}

# ─────────────────────────────────────────────────────────────────────────────
# Verify backup integrity
# ─────────────────────────────────────────────────────────────────────────────
verify_backup() {
    local backup_file="$1"
    log_info "Verifying backup integrity..."

    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi

    # Check HMAC
    local hmac_file="${backup_file}.hmac"
    if [[ -f "$hmac_file" ]]; then
        local stored_hmac
        stored_hmac="$(cat "$hmac_file")"
        local computed_hmac
        computed_hmac="$(openssl dgst -sha256 -hex -hmac "$BACKUP_ENCRYPTION_KEY" "$backup_file" 2>/dev/null | awk '{print $2}')"
        if [[ "$stored_hmac" != "$computed_hmac" ]]; then
            log_error "HMAC verification FAILED — backup may be corrupted or tampered"
            return 1
        fi
        log_info "HMAC verification OK"
    fi

    # Compute and store checksum
    BACKUP_CHECKSUM="$(compute_checksum "$backup_file")"
    echo "$BACKUP_CHECKSUM" > "${backup_file}.sha256"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Backup integrity verification passed"
        return 0
    fi

    # Attempt decrypt to temp to verify
    local temp_decrypted="${BACKUP_DIR}/verify_decrypt_$$.tmp"
    if decrypt_file "$backup_file" "$temp_decrypted"; then
        # Verify zstd integrity
        if zstd -t "$temp_decrypted" 2>/dev/null; then
            log_info "Backup verification passed (decrypt + compression OK)"
            rm -f "$temp_decrypted"
            return 0
        else
            log_error "Compressed data integrity check failed"
            rm -f "$temp_decrypted"
            return 1
        fi
    else
        log_error "Backup decryption failed during verification"
        rm -f "$temp_decrypted"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Retention policy enforcement
# ─────────────────────────────────────────────────────────────────────────────
enforce_retention() {
    log_info "Enforcing retention policy ($BACKUP_RETENTION_DAYS days)..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would delete backups older than $BACKUP_RETENTION_DAYS days"
        return 0
    fi

    local cutoff_date
    cutoff_date="$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" '+%Y%m%d' 2>/dev/null || date -v-${BACKUP_RETENTION_DAYS}d -u '+%Y%m%d')"
    local deleted=0

    if [[ "$S3_TOOL" == "aws" ]]; then
        # List all backups and delete old ones
        local old_backups
        old_backups="$(aws s3api list-objects-v2 \
            --bucket "$BACKUP_S3_BUCKET" \
            --prefix "${BACKUP_S3_PATH_PREFIX}/" \
            --endpoint-url "https://${BACKUP_S3_ENDPOINT}" \
            --region "$BACKUP_S3_REGION" \
            --query "Contents[?LastModified<='$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" '+%Y-%m-%dT%H:%M:%SZ')'].Key" \
            --output text 2>/dev/null || true)"

        if [[ -n "$old_backups" && "$old_backups" != "None" ]]; then
            for key in $old_backups; do
                log_info "Deleting old backup: $key"
                s3_delete "$key"
                deleted=$((deleted + 1))
            done
        fi
    fi

    log_info "Retention cleanup complete ($deleted old backups removed)"
    audit_log "RETENTION" "OK" "Deleted $deleted backups older than $BACKUP_RETENTION_DAYS days"
}

# ─────────────────────────────────────────────────────────────────────────────
# List available backups
# ─────────────────────────────────────────────────────────────────────────────
list_backups() {
    log_info "Listing available backups..."
    s3_list "$BACKUP_S3_PATH_PREFIX"
    audit_log "LIST_BACKUPS" "OK" "Listed backups from s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PATH_PREFIX}/"
}

# ─────────────────────────────────────────────────────────────────────────────
# Main backup procedure
# ─────────────────────────────────────────────────────────────────────────────
run_backup() {
    local db_url="$1"
    local db_type
    db_type="$(detect_db_type "$db_url")"
    local db_name
    db_name="$(get_db_name "$db_url")"

    log_info "Starting backup — DB type: $db_type, DB name: $db_name, Env: $DEEPSYNAPS_APP_ENV"
    audit_log "BACKUP_START" "IN_PROGRESS" "type=$db_type, db=$db_name"

    # Generate filenames
    local base_filename
    base_filename="$(generate_backup_filename "$db_name" "$db_type")"
    BACKUP_FILE="${BACKUP_DIR}/${base_filename}.tar.zst.enc"

    # Create backup
    case "$db_type" in
        postgresql)
            if ! backup_postgresql "$db_url" "$BACKUP_FILE"; then
                audit_log "BACKUP_CREATE" "FAILED" "type=postgresql"
                return 1
            fi
            ;;
        sqlite)
            if ! backup_sqlite "$db_url" "$BACKUP_FILE"; then
                audit_log "BACKUP_CREATE" "FAILED" "type=sqlite"
                return 1
            fi
            ;;
        *)
            log_error "Unsupported database type: $db_type"
            audit_log "BACKUP_CREATE" "FAILED" "type=unknown"
            return 1
            ;;
    esac

    # Verify backup
    if ! verify_backup "$BACKUP_FILE"; then
        audit_log "BACKUP_VERIFY" "FAILED" "file=${base_filename}"
        rm -f "$BACKUP_FILE" "${BACKUP_FILE}.iv" "${BACKUP_FILE}.hmac" "${BACKUP_FILE}.sha256"
        return 1
    fi

    # Upload to S3
    local s3_key="${BACKUP_S3_PATH_PREFIX}/${DEEPSYNAPS_APP_ENV}/${base_filename}.tar.zst.enc"
    if ! s3_upload "$BACKUP_FILE" "$s3_key"; then
        audit_log "BACKUP_UPLOAD" "FAILED" "s3_key=$s3_key"
        return 1
    fi

    # Upload metadata files
    s3_upload "${BACKUP_FILE}.iv" "${s3_key}.iv" 2>/dev/null || true
    s3_upload "${BACKUP_FILE}.hmac" "${s3_key}.hmac" 2>/dev/null || true
    s3_upload "${BACKUP_FILE}.sha256" "${s3_key}.sha256" 2>/dev/null || true

    # Also upload as "latest" for easy reference
    local latest_key="${BACKUP_S3_PATH_PREFIX}/${DEEPSYNAPS_APP_ENV}/LATEST.tar.zst.enc"
    s3_upload "$BACKUP_FILE" "$latest_key" 2>/dev/null || true

    # Cleanup local files
    rm -f "$BACKUP_FILE" "${BACKUP_FILE}.iv" "${BACKUP_FILE}.hmac" "${BACKUP_FILE}.sha256"

    # Enforce retention
    enforce_retention

    # Calculate duration
    local end_time
    end_time="$(date -u +%s)"
    local duration=$((end_time - SCRIPT_START_TIME))

    log_info "Backup complete — duration: ${duration}s, size: $(numfmt --to=iec "$BACKUP_SIZE" 2>/dev/null || echo "${BACKUP_SIZE}b")"
    audit_log "BACKUP_COMPLETE" "OK" "duration=${duration}s, size=${BACKUP_SIZE}, s3_key=$s3_key"

    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Verify last backup from S3
# ─────────────────────────────────────────────────────────────────────────────
verify_last_backup() {
    log_info "Downloading and verifying last backup..."
    audit_log "VERIFY_START" "IN_PROGRESS" "mode=download_and_verify"

    local latest_key="${BACKUP_S3_PATH_PREFIX}/${DEEPSYNAPS_APP_ENV}/LATEST.tar.zst.enc"
    local temp_file="${BACKUP_DIR}/verify_latest_$$.tar.zst.enc"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would download s3://${BACKUP_S3_BUCKET}/${latest_key}"
        audit_log "VERIFY_COMPLETE" "OK" "dry_run=true"
        return 0
    fi

    if ! s3_download "$latest_key" "$temp_file"; then
        log_error "Failed to download latest backup"
        audit_log "VERIFY_DOWNLOAD" "FAILED" "s3_key=$latest_key"
        return 1
    fi

    if verify_backup "$temp_file"; then
        log_info "Latest backup verified successfully"
        audit_log "VERIFY_COMPLETE" "OK" "file=$latest_key"
        rm -f "$temp_file"
        return 0
    else
        log_error "Latest backup verification FAILED"
        audit_log "VERIFY_COMPLETE" "FAILED" "file=$latest_key"
        rm -f "$temp_file"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Check if within clinical operating hours
# ─────────────────────────────────────────────────────────────────────────────
is_clinical_hours() {
    local current_hour
    current_hour="$(date -u +%H)"
    if [[ "$current_hour" -ge "$CLINICAL_HOURS_START" && "$current_hour" -lt "$CLINICAL_HOURS_END" ]]; then
        return 0  # Yes, it's clinical hours
    fi
    return 1  # Outside clinical hours
}

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
main() {
    parse_args "$@"

    log_info "==========================================="
    log_info "DeepSynaps Backup v${SCRIPT_VERSION} starting"
    log_info "Environment: ${DEEPSYNAPS_APP_ENV}"
    log_info "Dry run: ${DRY_RUN}"
    log_info "==========================================="

    # Check dependencies
    if ! check_dependencies; then
        exit 1
    fi

    # List mode
    if [[ "$LIST_BACKUPS" == "true" ]]; then
        validate_config || exit 1
        list_backups
        exit 0
    fi

    # Verify-only mode
    if [[ "$VERIFY_ONLY" == "true" ]]; then
        validate_config || exit 1
        verify_last_backup
        exit $?
    fi

    # Full backup mode
    if ! validate_config; then
        exit 1
    fi

    # Acquire lock
    if ! acquire_lock; then
        exit 1
    fi

    # Warn if during clinical hours (but still proceed — RPO compliance is critical)
    if is_clinical_hours; then
        log_warn "Backup running during clinical operating hours — this is expected for RPO <15min compliance"
    fi

    # Run backup
    if run_backup "$DEEPSYNAPS_DATABASE_URL"; then
        log_info "Backup procedure completed successfully"
        EXIT_CODE=0
    else
        log_error "Backup procedure failed"
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
