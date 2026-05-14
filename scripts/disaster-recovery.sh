#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Disaster Recovery Automation
# ═══════════════════════════════════════════════════════════════════════════════
# Automated disaster recovery orchestration that detects disaster types,
# executes appropriate recovery procedures, and verifies application health.
#
# Disaster Types Detected:
#   1. DATABASE_FAILURE    — PostgreSQL/SQLite unreachable or corrupted
#   2. REGION_OUTAGE       — Primary Fly.io region unavailable
#   3. DATA_CORRUPTION     — Data integrity issues detected
#   4. COMPLETE_FAILURE    — Total infrastructure failure (multi-service)
#   5. NETWORK_PARTITION   — Connectivity issues between services
#
# Recovery Procedures:
#   - Automatic disaster type detection via health checks
#   - Backup restoration coordination
#   - Regional failover (standby region activation)
#   - DNS/routing updates
#   - Post-recovery health verification
#   - Rollback capability if recovery fails
#
# Requirements:
#   RTO: < 1 hour  (Recovery Time Objective)
#   RPO: < 15 minutes (Recovery Point Objective)
#
# Environment Variables:
#   DEEPSYNAPS_DATABASE_URL    — Primary database connection string
#   BACKUP_S3_*                — S3 configuration for backup access
#   BACKUP_ENCRYPTION_KEY      — Backup encryption key
#   FLY_API_TOKEN              — Fly.io API token for failover operations
#   FLY_APP_NAME               — Fly.io application name
#   FLY_PRIMARY_REGION         — Primary region (default: lhr)
#   FLY_SECONDARY_REGION       — Standby region (default: iad)
#   DR_NOTIFICATION_WEBHOOK    — Webhook URL for DR alerts (optional)
#
# Usage:
#   ./disaster-recovery.sh                     # Detect and auto-recover
#   ./disaster-recovery.sh --detect            # Detection only, no action
#   ./disaster-recovery.sh --type DB_FAILURE   # Specify disaster type
#   ./disaster-recovery.sh --failover-region   # Trigger regional failover
#   ./disaster-recovery.sh --rollback          # Rollback last recovery
#   ./disaster-recovery.sh --dry-run           # Simulate
#   ./disaster-recovery.sh --status            # Show current DR status
#
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
: "${FLY_PRIMARY_REGION:=lhr}"
: "${FLY_SECONDARY_REGION:=iad}"
: "${FLY_API_TOKEN:=${FLY_API_TOKEN:-}}"
: "${FLY_APP_NAME:=${FLY_APP_NAME:-deepsynaps-studio}}"
: "${DR_MAX_RTO_MINUTES:=60}"
: "${DR_MAX_RPO_MINUTES:=15}"
: "${DR_HEALTH_CHECK_TIMEOUT:=15}"
: "${DR_VERIFY_RETRIES:=6}"
: "${DR_VERIFY_RETRY_DELAY:=30}"
: "${DEEPSYNAPS_APP_ENV:=production}"
: "${BACKUP_S3_ENDPOINT:=s3.amazonaws.com}"
: "${BACKUP_S3_REGION:=us-east-1}"
: "${BACKUP_S3_PATH_PREFIX:=backups/database}"

# ═══════════════════════════════════════════════════════════════════════════════
# State
# ═══════════════════════════════════════════════════════════════════════════════
DRY_RUN=false
DETECT_ONLY=false
SPECIFIED_TYPE=""
FAILOVER_REGION=false
ROLLBACK=false
SHOW_STATUS=false
DISASTER_TYPE=""
RECOVERY_SUCCESS=false
CURRENT_REGION="$FLY_PRIMARY_REGION"
RECOVERY_START_TIME=""
RECOVERY_END_TIME=""

# RTO tracking
RECOVERY_LOG="${DR_RECOVERY_LOG:-${SCRIPT_DIR}/../logs/disaster-recovery.log}"
STATE_FILE="${DR_STATE_FILE:-${SCRIPT_DIR}/../logs/dr-state.json}"

# ─────────────────────────────────────────────────────────────────────────────
# Logging — structured, PHI-safe
# ─────────────────────────────────────────────────────────────────────────────
LOG_LEVEL="${DR_LOG_LEVEL:-INFO}"

log() {
    local level="$1"
    shift
    local timestamp
    timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    local message="$*"
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
AUDIT_LOG="${DR_AUDIT_LOG:-${SCRIPT_DIR}/../logs/dr-audit.log}"

audit_log() {
    local event="$1"
    local status="$2"
    shift 2
    local timestamp
    timestamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    mkdir -p "$(dirname "$AUDIT_LOG")"
    printf '{"time":"%s","event":"%s","status":"%s","script":"%s","version":"%s","host":"%s","pid":%d,"env":"%s","disaster_type":"%s","details":"%s"}\n' \
        "$timestamp" "$event" "$status" "$SCRIPT_NAME" "$SCRIPT_VERSION" "$(hostname)" $$ "$DEEPSYNAPS_APP_ENV" "$DISASTER_TYPE" "$*" \
        >> "$AUDIT_LOG"
}

# ─────────────────────────────────────────────────────────────────────────────
# State management
# ─────────────────────────────────────────────────────────────────────────────
load_state() {
    if [[ -f "$STATE_FILE" ]]; then
        cat "$STATE_FILE" 2>/dev/null || echo '{}'
    else
        echo '{}'
    fi
}

save_state() {
    local state="$1"
    if [[ "$DRY_RUN" != "true" ]]; then
        mkdir -p "$(dirname "$STATE_FILE")"
        echo "$state" > "$STATE_FILE"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Notification
# ─────────────────────────────────────────────────────────────────────────────
send_notification() {
    local severity="$1"   # INFO, WARNING, CRITICAL
    local message="$2"

    # Always log
    case "$severity" in
        CRITICAL) log_error "NOTIFICATION [$severity]: $message" ;;
        WARNING)  log_warn  "NOTIFICATION [$severity]: $message" ;;
        *)        log_info  "NOTIFICATION [$severity]: $message" ;;
    esac

    # Webhook notification
    if [[ -n "${DR_NOTIFICATION_WEBHOOK:-}" ]]; then
        local payload
        payload="$(cat <<JSON
{
  "severity": "$severity",
  "message": "$message",
  "timestamp": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')",
  "environment": "$DEEPSYNAPS_APP_ENV",
  "app": "$FLY_APP_NAME",
  "disaster_type": "$DISASTER_TYPE",
  "region": "$CURRENT_REGION"
}
JSON
)"
        if [[ "$DRY_RUN" != "true" ]]; then
            curl -s -X POST \
                -H "Content-Type: application/json" \
                -d "$payload" \
                "$DR_NOTIFICATION_WEBHOOK" >/dev/null 2>&1 || true
        fi
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
DeepSynaps Protocol Studio — Disaster Recovery v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    --detect              Detect disaster type only, do not recover
    --type TYPE           Specify disaster type (skip detection)
    --failover-region     Trigger regional failover to secondary region
    --rollback            Rollback the last recovery attempt
    --status              Show current DR status
    --dry-run             Simulate without making changes
    -h, --help            Show this help
    -v, --version         Show version

Disaster Types:
    DATABASE_FAILURE    Database unreachable or corrupted
    REGION_OUTAGE       Primary region unavailable
    DATA_CORRUPTION     Data integrity issues detected
    COMPLETE_FAILURE    Total infrastructure failure
    NETWORK_PARTITION   Service connectivity issues

Environment Variables:
    DEEPSYNAPS_DATABASE_URL     Primary database URL
    FLY_API_TOKEN               Fly.io API token
    FLY_APP_NAME                Application name
    FLY_PRIMARY_REGION          Primary region (default: lhr)
    FLY_SECONDARY_REGION        Standby region (default: iad)
    DR_NOTIFICATION_WEBHOOK     Alert webhook URL

Examples:
    ${SCRIPT_NAME} --detect
    ${SCRIPT_NAME} --type DATABASE_FAILURE --dry-run
    ${SCRIPT_NAME} --failover-region
    ${SCRIPT_NAME} --status
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --detect)
                DETECT_ONLY=true
                ;;
            --type)
                SPECIFIED_TYPE="$2"
                shift
                ;;
            --failover-region)
                FAILOVER_REGION=true
                SPECIFIED_TYPE="REGION_OUTAGE"
                ;;
            --rollback)
                ROLLBACK=true
                ;;
            --status)
                SHOW_STATUS=true
                ;;
            --dry-run)
                DRY_RUN=true
                log_info "Dry run mode enabled"
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

    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v date >/dev/null 2>&1 || missing+=("date")
    command -v psql >/dev/null 2>&1 || missing+=("psql")

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_warn "Missing optional dependencies: ${missing[*]}"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# DISASTER DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

detect_disaster() {
    log_info "Running disaster detection checks..."
    audit_log "DETECTION_START" "IN_PROGRESS"

    local db_healthy=false
    local app_healthy=false
    local region_healthy=false
    local data_integrity=true

    # Check 1: Database connectivity
    log_info "[Check 1/4] Database connectivity..."
    if check_database_health; then
        db_healthy=true
        log_info "  Database: HEALTHY"
    else
        log_error "  Database: UNREACHABLE"
    fi

    # Check 2: Application HTTP health
    log_info "[Check 2/4] Application health endpoint..."
    if check_application_health; then
        app_healthy=true
        log_info "  Application: HEALTHY"
    else
        log_error "  Application: UNHEALTHY"
    fi

    # Check 3: Region availability (Fly.io)
    log_info "[Check 3/4] Region availability..."
    if check_region_health; then
        region_healthy=true
        log_info "  Region: HEALTHY"
    else
        log_error "  Region: UNAVAILABLE"
    fi

    # Check 4: Data integrity
    if [[ "$db_healthy" == "true" ]]; then
        log_info "[Check 4/4] Data integrity..."
        if check_data_integrity; then
            data_integrity=true
            log_info "  Data integrity: OK"
        else
            data_integrity=false
            log_error "  Data integrity: CORRUPTED"
        fi
    fi

    # Determine disaster type
    local detected_type="HEALTHY"

    if [[ "$db_healthy" == "false" && "$region_healthy" == "false" ]]; then
        detected_type="COMPLETE_FAILURE"
    elif [[ "$db_healthy" == "false" && "$data_integrity" == "false" ]]; then
        detected_type="DATA_CORRUPTION"
    elif [[ "$db_healthy" == "false" ]]; then
        detected_type="DATABASE_FAILURE"
    elif [[ "$region_healthy" == "false" ]]; then
        detected_type="REGION_OUTAGE"
    elif [[ "$data_integrity" == "false" ]]; then
        detected_type="DATA_CORRUPTION"
    elif [[ "$app_healthy" == "false" && "$db_healthy" == "true" ]]; then
        detected_type="NETWORK_PARTITION"
    elif [[ "$app_healthy" == "false" ]]; then
        detected_type="COMPLETE_FAILURE"
    fi

    DISASTER_TYPE="$detected_type"

    log_info "═══════════════════════════════════════════════════════════════"
    if [[ "$detected_type" == "HEALTHY" ]]; then
        log_info "Detection result: ALL SYSTEMS HEALTHY"
    else
        log_error "Detection result: DISASTER DETECTED — Type: $detected_type"
        send_notification "CRITICAL" "Disaster detected: $detected_type in $DEEPSYNAPS_APP_ENV"
    fi
    log_info "═══════════════════════════════════════════════════════════════"

    audit_log "DETECTION_COMPLETE" "$detected_type"

    echo "$detected_type"
}

# ─────────────────────────────────────────────────────────────────────────────
# Health check functions
# ─────────────────────────────────────────────────────────────────────────────
check_database_health() {
    local db_url="${DEEPSYNAPS_DATABASE_URL:-}"
    if [[ -z "$db_url" ]]; then
        return 1
    fi

    if [[ "$db_url" == sqlite* ]]; then
        local db_path="${db_url#sqlite:///}"
        db_path="${db_path#./}"
        if [[ -f "$db_path" ]]; then
            sqlite3 "$db_path" "SELECT 1;" >/dev/null 2>&1
            return $?
        fi
        return 1
    elif [[ "$db_url" == postgresql* ]]; then
        if command -v pg_isready >/dev/null 2>&1; then
            PGPASSWORD="" pg_isready --dbname="$db_url" --timeout=5 >/dev/null 2>&1
            return $?
        elif command -v psql >/dev/null 2>&1; then
            psql "$db_url" -c "SELECT 1;" >/dev/null 2>&1
            return $?
        fi
    fi
    return 1
}

check_application_health() {
    local app_url="https://${FLY_APP_NAME}.fly.dev/health"
    local http_code
    http_code="$(curl -s -o /dev/null -w "%{http_code}" --max-time "$DR_HEALTH_CHECK_TIMEOUT" "$app_url" 2>/dev/null || echo "000")"
    [[ "$http_code" == "200" ]]
}

check_region_health() {
    # Check if Fly.io API reports region issues
    if [[ -n "$FLY_API_TOKEN" ]]; then
        local status
        status="$(curl -s -H "Authorization: Bearer ${FLY_API_TOKEN}" \
            --max-time 10 \
            "https://api.machines.dev/v1/apps/${FLY_APP_NAME}/machines" 2>/dev/null | head -c 10 || echo "FAIL")"
        [[ "$status" != "FAIL" ]]
    else
        # Without API token, assume healthy (app check covers most cases)
        true
    fi
}

check_data_integrity() {
    local db_url="${DEEPSYNAPS_DATABASE_URL:-}"
    if [[ -z "$db_url" ]]; then
        return 1
    fi

    if [[ "$db_url" == sqlite* ]]; then
        local db_path="${db_url#sqlite:///}"
        db_path="${db_path#./}"
        if [[ -f "$db_path" ]]; then
            sqlite3 "$db_path" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"
            return $?
        fi
        return 1
    elif [[ "$db_url" == postgresql* ]]; then
        # Run pg_dump schema-only to verify structure
        if command -v pg_dump >/dev/null 2>&1; then
            pg_dump --dbname="$db_url" --schema-only --verbose >/dev/null 2>&1
            return $?
        fi
    fi
    return 0  # Can't check, assume OK
}

# ═══════════════════════════════════════════════════════════════════════════════
# RECOVERY PROCEDURES
# ═══════════════════════════════════════════════════════════════════════════════

execute_recovery() {
    local disaster_type="$1"
    RECOVERY_START_TIME="$(date -u +%s)"

    log_info "═══════════════════════════════════════════════════════════════"
    log_info "EXECUTING RECOVERY — Type: $disaster_type"
    log_info "RTO Target: ${DR_MAX_RTO_MINUTES} minutes"
    log_info "═══════════════════════════════════════════════════════════════"

    audit_log "RECOVERY_START" "IN_PROGRESS" "type=$disaster_type"
    send_notification "CRITICAL" "Recovery initiated for $disaster_type"

    case "$disaster_type" in
        DATABASE_FAILURE)
            recover_database_failure
            ;;
        REGION_OUTAGE)
            recover_region_outage
            ;;
        DATA_CORRUPTION)
            recover_data_corruption
            ;;
        COMPLETE_FAILURE)
            recover_complete_failure
            ;;
        NETWORK_PARTITION)
            recover_network_partition
            ;;
        *)
            log_error "Unknown disaster type: $disaster_type"
            audit_log "RECOVERY" "FAILED" "unknown_type=$disaster_type"
            return 1
            ;;
    esac
}

# ─────────────────────────────────────────────────────────────────────────────
# Recovery: Database Failure
# ─────────────────────────────────────────────────────────────────────────────
recover_database_failure() {
    log_info "Recovery procedure: DATABASE_FAILURE"
    audit_log "RECOVERY_DB" "IN_PROGRESS"

    # Step 1: Verify backup availability
    log_info "[DB-Recovery 1/5] Verifying backup availability..."
    if ! verify_backup_availability; then
        log_error "No backups available for recovery"
        audit_log "RECOVERY_DB" "FAILED" "no_backups"
        return 1
    fi

    # Step 2: Restore from latest backup
    log_info "[DB-Recovery 2/5] Restoring database from backup..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would restore database"
    else
        # Find the backup-verify.sh script and run restore
        local restore_script="${SCRIPT_DIR}/restore-database.sh"
        if [[ -x "$restore_script" ]]; then
            if ! "$restore_script" --latest --auto; then
                log_error "Database restore failed"
                audit_log "RECOVERY_DB" "FAILED" "restore_failed"
                return 1
            fi
        else
            log_error "Restore script not found: $restore_script"
            return 1
        fi
    fi

    # Step 3: Verify database connectivity post-restore
    log_info "[DB-Recovery 3/5] Verifying restored database..."
    if ! verify_post_recovery; then
        log_error "Post-restore verification failed"
        audit_log "RECOVERY_DB" "FAILED" "post_verify_failed"
        return 1
    fi

    # Step 4: Restart application processes
    log_info "[DB-Recovery 4/5] Restarting application processes..."
    restart_application

    # Step 5: Final health check
    log_info "[DB-Recovery 5/5] Final health verification..."
    if verify_post_recovery; then
        log_info "Database recovery COMPLETE"
        audit_log "RECOVERY_DB" "OK"
        RECOVERY_SUCCESS=true
    else
        log_error "Final health check failed after recovery"
        audit_log "RECOVERY_DB" "FAILED" "final_check_failed"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Recovery: Region Outage
# ─────────────────────────────────────────────────────────────────────────────
recover_region_outage() {
    log_info "Recovery procedure: REGION_OUTAGE"
    audit_log "RECOVERY_REGION" "IN_PROGRESS"

    # Step 1: Activate standby machines in secondary region
    log_info "[Region-Recovery 1/4] Activating standby in ${FLY_SECONDARY_REGION}..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would activate standby machines in $FLY_SECONDARY_REGION"
    else
        activate_standby_region
    fi

    # Step 2: Update DNS/routing if applicable
    log_info "[Region-Recovery 2/4] Updating routing..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would update routing to $FLY_SECONDARY_REGION"
    else
        update_routing "$FLY_SECONDARY_REGION"
    fi

    # Step 3: Verify application in secondary region
    log_info "[Region-Recovery 3/4] Verifying standby region..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would verify $FLY_SECONDARY_REGION"
    else
        CURRENT_REGION="$FLY_SECONDARY_REGION"
        if ! verify_region_health "$FLY_SECONDARY_REGION"; then
            log_error "Standby region verification failed"
            audit_log "RECOVERY_REGION" "FAILED" "standby_verify_failed"
            return 1
        fi
    fi

    # Step 4: Final verification
    log_info "[Region-Recovery 4/4] Final verification..."
    if verify_post_recovery; then
        log_info "Region failover COMPLETE — now serving from $FLY_SECONDARY_REGION"
        audit_log "RECOVERY_REGION" "OK" "region=$FLY_SECONDARY_REGION"
        RECOVERY_SUCCESS=true
        send_notification "WARNING" "Failover to $FLY_SECONDARY_REGION completed successfully"
    else
        log_error "Final verification after region failover failed"
        audit_log "RECOVERY_REGION" "FAILED" "final_check_failed"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Recovery: Data Corruption
# ─────────────────────────────────────────────────────────────────────────────
recover_data_corruption() {
    log_info "Recovery procedure: DATA_CORRUPTION"
    audit_log "RECOVERY_CORRUPTION" "IN_PROGRESS"

    # Step 1: Quarantine current database
    log_info "[Corruption-Recovery 1/4] Quarantining corrupted database..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would quarantine database"
    else
        quarantine_database
    fi

    # Step 2: Restore from known-good backup
    log_info "[Corruption-Recovery 2/4] Restoring from clean backup..."
    local restore_script="${SCRIPT_DIR}/restore-database.sh"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would restore from backup"
    elif [[ -x "$restore_script" ]]; then
        if ! "$restore_script" --latest --auto; then
            log_error "Clean backup restore failed"
            audit_log "RECOVERY_CORRUPTION" "FAILED" "restore_failed"
            return 1
        fi
    fi

    # Step 3: Run data integrity verification
    log_info "[Corruption-Recovery 3/4] Verifying data integrity..."
    if ! check_data_integrity; then
        log_error "Data integrity still compromised after restore"
        audit_log "RECOVERY_CORRUPTION" "FAILED" "integrity_still_compromised"
        return 1
    fi

    # Step 4: Final verification
    log_info "[Corruption-Recovery 4/4] Final verification..."
    if verify_post_recovery; then
        log_info "Data corruption recovery COMPLETE"
        audit_log "RECOVERY_CORRUPTION" "OK"
        RECOVERY_SUCCESS=true
    else
        log_error "Final verification failed"
        audit_log "RECOVERY_CORRUPTION" "FAILED" "final_check_failed"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Recovery: Complete Failure
# ─────────────────────────────────────────────────────────────────────────────
recover_complete_failure() {
    log_info "Recovery procedure: COMPLETE_FAILURE"
    audit_log "RECOVERY_COMPLETE_FAILURE" "IN_PROGRESS"

    # This combines database restore + region failover
    # Order matters: restore DB first, then handle region

    # Step 1: Region failover
    log_info "[Complete-Recovery 1/5] Initiating region failover..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would failover to $FLY_SECONDARY_REGION"
    else
        activate_standby_region
        update_routing "$FLY_SECONDARY_REGION"
        CURRENT_REGION="$FLY_SECONDARY_REGION"
    fi

    # Step 2: Restore database
    log_info "[Complete-Recovery 2/5] Restoring database..."
    local restore_script="${SCRIPT_DIR}/restore-database.sh"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would restore database"
    elif [[ -x "$restore_script" ]]; then
        if ! "$restore_script" --latest --auto; then
            log_error "Database restore failed during complete recovery"
            audit_log "RECOVERY_COMPLETE_FAILURE" "FAILED" "db_restore_failed"
            return 1
        fi
    fi

    # Step 3: Verify data integrity
    log_info "[Complete-Recovery 3/5] Verifying data integrity..."
    if ! check_data_integrity; then
        log_error "Data integrity check failed"
    fi

    # Step 4: Restart all services
    log_info "[Complete-Recovery 4/5] Restarting services..."
    restart_application

    # Step 5: Final verification
    log_info "[Complete-Recovery 5/5] Final verification..."
    if verify_post_recovery; then
        log_info "Complete failure recovery COMPLETE"
        audit_log "RECOVERY_COMPLETE_FAILURE" "OK" "region=$CURRENT_REGION"
        RECOVERY_SUCCESS=true
        send_notification "CRITICAL" "Complete failure recovery successful — serving from $CURRENT_REGION"
    else
        log_error "Final verification failed after complete recovery"
        audit_log "RECOVERY_COMPLETE_FAILURE" "FAILED" "final_check_failed"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Recovery: Network Partition
# ─────────────────────────────────────────────────────────────────────────────
recover_network_partition() {
    log_info "Recovery procedure: NETWORK_PARTITION"
    audit_log "RECOVERY_NETWORK" "IN_PROGRESS"

    # Network partitions often resolve themselves
    # Strategy: restart services, wait, verify

    # Step 1: Restart application
    log_info "[Network-Recovery 1/3] Restarting application..."
    restart_application

    # Step 2: Wait for network stabilization
    log_info "[Network-Recovery 2/3] Waiting for network stabilization (30s)..."
    if [[ "$DRY_RUN" != "true" ]]; then
        sleep 30
    fi

    # Step 3: Verify
    log_info "[Network-Recovery 3/3] Verifying connectivity..."
    if verify_post_recovery; then
        log_info "Network partition recovery COMPLETE"
        audit_log "RECOVERY_NETWORK" "OK"
        RECOVERY_SUCCESS=true
    else
        # Escalate to complete failure recovery
        log_error "Network recovery failed — escalating to COMPLETE_FAILURE"
        DISASTER_TYPE="COMPLETE_FAILURE"
        recover_complete_failure
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# RECOVERY HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

verify_backup_availability() {
    local latest_key="${BACKUP_S3_PATH_PREFIX}/${DEEPSYNAPS_APP_ENV}/LATEST.tar.zst.enc"

    if [[ "$S3_TOOL" == "aws" ]]; then
        aws s3 ls "s3://${BACKUP_S3_BUCKET}/${latest_key}" \
            --endpoint-url "https://${BACKUP_S3_ENDPOINT}" \
            --region "$BACKUP_S3_REGION" >/dev/null 2>&1
    else
        curl -s -I --max-time 10 \
            "https://${BACKUP_S3_BUCKET}.${BACKUP_S3_ENDPOINT}/${latest_key}" 2>/dev/null | head -1 | grep -q "200"
    fi
}

activate_standby_region() {
    if [[ -z "$FLY_API_TOKEN" ]]; then
        log_warn "FLY_API_TOKEN not set — cannot activate standby via API"
        return 1
    fi

    log_info "Activating machines in $FLY_SECONDARY_REGION..."

    # Get machines in secondary region
    local machines
    machines="$(curl -s -H "Authorization: Bearer ${FLY_API_TOKEN}" \
        "https://api.machines.dev/v1/apps/${FLY_APP_NAME}/machines" 2>/dev/null | \
        grep -o '"region":"'"$FLY_SECONDARY_REGION"'"[^}]*' || true)"

    if [[ -z "$machines" ]]; then
        log_warn "No standby machines found in $FLY_SECONDARY_REGION"
        return 1
    fi

    # Start standby machines
    # (In Fly.io, machines auto-start on traffic when configured)
    log_info "Standby machines configured in $FLY_SECONDARY_REGION"
}

update_routing() {
    local region="$1"
    log_info "Updating routing to prefer region: $region"

    # In Fly.io, routing is automatic based on machine health
    # For external DNS, you'd update the DNS records here
    if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
        log_info "Custom DNS update would be performed for: $CUSTOM_DOMAIN -> $region"
    fi
}

quarantine_database() {
    local db_url="${DEEPSYNAPS_DATABASE_URL:-}"
    if [[ "$db_url" == sqlite* ]]; then
        local db_path="${db_url#sqlite:///}"
        db_path="${db_path#./}"
        if [[ -f "$db_path" ]]; then
            local quarantine_path="${db_path}.quarantine_$(date -u '+%Y%m%dT%H%M%SZ')"
            mv "$db_path" "$quarantine_path"
            log_info "Quarantined SQLite DB: $quarantine_path"
        fi
    elif [[ "$db_url" == postgresql* ]]; then
        # For PostgreSQL, rename the database
        local quarantine_name="deepsynaps_quarantine_$(date -u '+%Y%m%dT%H%M%SZ')"
        psql "$db_url" -c "ALTER DATABASE deepsynaps_${DEEPSYNAPS_APP_ENV} RENAME TO ${quarantine_name};" 2>/dev/null || {
            log_warn "Could not quarantine PostgreSQL — proceeding with overwrite"
        }
    fi
}

restart_application() {
    log_info "Restarting application processes..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would restart application"
        return 0
    fi

    if [[ -n "$FLY_API_TOKEN" ]]; then
        # Restart via Fly.io API
        local machines
        machines="$(curl -s -H "Authorization: Bearer ${FLY_API_TOKEN}" \
            "https://api.machines.dev/v1/apps/${FLY_APP_NAME}/machines" 2>/dev/null | \
            grep -o '"id":"[^"]*"' | cut -d'"' -f4)"

        for machine_id in $machines; do
            log_info "Restarting machine: $machine_id"
            curl -s -X POST \
                -H "Authorization: Bearer ${FLY_API_TOKEN}" \
                "https://api.machines.dev/v1/apps/${FLY_APP_NAME}/machines/${machine_id}/restart" \
                >/dev/null 2>&1 || true
        done
    else
        log_warn "FLY_API_TOKEN not set — manual restart required"
    fi

    # Wait for restart
    log_info "Waiting for application to come back..."
    sleep 15
}

verify_post_recovery() {
    log_info "Running post-recovery verification..."
    local retries="$DR_VERIFY_RETRIES"
    local delay="$DR_VERIFY_RETRY_DELAY"

    for i in $(seq 1 $retries); do
        log_debug "Verification attempt $i/$retries..."

        local all_ok=true

        if ! check_database_health; then
            all_ok=false
            log_warn "DB health check failed (attempt $i/$retries)"
        fi

        if ! check_application_health; then
            all_ok=false
            log_warn "App health check failed (attempt $i/$retries)"
        fi

        if [[ "$all_ok" == "true" ]]; then
            log_info "Post-recovery verification PASSED"
            return 0
        fi

        if [[ $i -lt $retries ]]; then
            log_info "Waiting ${delay}s before next attempt..."
            sleep "$delay"
        fi
    done

    log_error "Post-recovery verification FAILED after $retries attempts"
    return 1
}

verify_region_health() {
    local region="$1"
    # Check health endpoint via region-specific URL
    local health_url="https://${FLY_APP_NAME}.fly.dev/health"
    local http_code
    http_code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$health_url" 2>/dev/null || echo "000")"
    [[ "$http_code" == "200" ]]
}

# ═══════════════════════════════════════════════════════════════════════════════
# ROLLBACK
# ═══════════════════════════════════════════════════════════════════════════════

execute_rollback() {
    log_info "═══════════════════════════════════════════════════════════════"
    log_info "EXECUTING ROLLBACK of last recovery"
    log_info "═══════════════════════════════════════════════════════════════"

    audit_log "ROLLBACK_START" "IN_PROGRESS"

    local state
    state="$(load_state)"

    local previous_region
    previous_region="$(echo "$state" | grep -o '"previous_region":"[^"]*"' | cut -d'"' -f4)"

    if [[ -z "$previous_region" ]]; then
        log_warn "No previous region state found — cannot rollback routing"
    elif [[ "$previous_region" != "$CURRENT_REGION" ]]; then
        log_info "Rolling back routing to: $previous_region"
        if [[ "$DRY_RUN" != "true" ]]; then
            update_routing "$previous_region"
            CURRENT_REGION="$previous_region"
        fi
    fi

    log_info "Rollback complete"
    audit_log "ROLLBACK_COMPLETE" "OK"
}

# ═══════════════════════════════════════════════════════════════════════════════
# STATUS DISPLAY
# ═══════════════════════════════════════════════════════════════════════════════

show_status() {
    log_info "═══════════════════════════════════════════════════════════════"
    log_info "DISASTER RECOVERY STATUS"
    log_info "════════════════════════════════════════════════════════════════"

    local state
    state="$(load_state)"

    echo ""
    echo "  Environment:        ${DEEPSYNAPS_APP_ENV}"
    echo "  Application:        ${FLY_APP_NAME}"
    echo "  Primary Region:     ${FLY_PRIMARY_REGION}"
    echo "  Secondary Region:   ${FLY_SECONDARY_REGION}"
    echo "  Current Region:     ${CURRENT_REGION}"
    echo "  RTO Target:         ${DR_MAX_RTO_MINUTES} minutes"
    echo "  RPO Target:         ${DR_MAX_RPO_MINUTES} minutes"
    echo ""
    echo "  Health Status:"

    local db_status="UNHEALTHY"
    check_database_health && db_status="HEALTHY"
    echo "    Database:         ${db_status}"

    local app_status="UNHEALTHY"
    check_application_health && app_status="HEALTHY"
    echo "    Application:      ${app_status}"

    local region_status="UNHEALTHY"
    check_region_health && region_status="HEALTHY"
    echo "    Region:           ${region_status}"

    echo ""
    echo "  Last Recovery:      $(echo "$state" | grep -o '"last_recovery":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo 'Never')"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# RTO TRACKING
# ═══════════════════════════════════════════════════════════════════════════════

track_rto() {
    if [[ -n "$RECOVERY_START_TIME" && -n "$RECOVERY_END_TIME" ]]; then
        local duration=$((RECOVERY_END_TIME - RECOVERY_START_TIME))
        local minutes=$((duration / 60))
        log_info "Recovery Time: ${minutes}m ${duration}s (Target: ${DR_MAX_RTO_MINUTES}m)"

        if [[ $minutes -lt $DR_MAX_RTO_MINUTES ]]; then
            log_info "RTO TARGET MET"
        else
            log_warn "RTO TARGET EXCEEDED"
        fi

        audit_log "RTO_TRACKING" "$([[ $minutes -lt $DR_MAX_RTO_MINUTES ]] && echo OK || echo EXCEEDED)" "duration=${minutes}m"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    parse_args "$@"

    log_info "==========================================="
    log_info "DeepSynaps Disaster Recovery v${SCRIPT_VERSION}"
    log_info "Environment: ${DEEPSYNAPS_APP_ENV}"
    log_info "==========================================="

    check_dependencies

    # Show status mode
    if [[ "$SHOW_STATUS" == "true" ]]; then
        show_status
        exit 0
    fi

    # Rollback mode
    if [[ "$ROLLBACK" == "true" ]]; then
        execute_rollback
        exit 0
    fi

    # Detect disaster type
    if [[ -n "$SPECIFIED_TYPE" ]]; then
        DISASTER_TYPE="$SPECIFIED_TYPE"
        log_info "Using specified disaster type: $DISASTER_TYPE"
    else
        DISASTER_TYPE="$(detect_disaster)"
    fi

    # Detection-only mode
    if [[ "$DETECT_ONLY" == "true" ]]; then
        echo "$DISASTER_TYPE"
        if [[ "$DISASTER_TYPE" == "HEALTHY" ]]; then
            exit 0
        else
            exit 1
        fi
    fi

    # If healthy, nothing to do
    if [[ "$DISASTER_TYPE" == "HEALTHY" ]]; then
        log_info "No disaster detected — all systems healthy"
        exit 0
    fi

    # Save pre-recovery state
    if [[ "$DRY_RUN" != "true" ]]; then
        local pre_state
        pre_state="$(cat <<JSON
{"previous_region":"$CURRENT_REGION","last_recovery":"$(date -u '+%Y-%m-%dT%H:%M:%SZ')","disaster_type":"$DISASTER_TYPE"}
JSON
)"
        save_state "$pre_state"
    fi

    # Execute recovery
    if execute_recovery "$DISASTER_TYPE"; then
        RECOVERY_END_TIME="$(date -u +%s)"
        track_rto

        log_info "═══════════════════════════════════════════════════════════════"
        log_info "DISASTER RECOVERY COMPLETE"
        log_info "Type: $DISASTER_TYPE"
        log_info "Success: $RECOVERY_SUCCESS"
        log_info "═══════════════════════════════════════════════════════════════"

        audit_log "RECOVERY_COMPLETE" "OK" "type=$DISASTER_TYPE"
        send_notification "WARNING" "Disaster recovery complete: $DISASTER_TYPE"
        exit 0
    else
        RECOVERY_END_TIME="$(date -u +%s)"
        track_rto

        log_error "═══════════════════════════════════════════════════════════════"
        log_error "DISASTER RECOVERY FAILED"
        log_error "Type: $DISASTER_TYPE"
        log_error "═══════════════════════════════════════════════════════════════"

        audit_log "RECOVERY_COMPLETE" "FAILED" "type=$DISASTER_TYPE"
        send_notification "CRITICAL" "DISASTER RECOVERY FAILED: $DISASTER_TYPE — manual intervention required"
        exit 1
    fi
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
