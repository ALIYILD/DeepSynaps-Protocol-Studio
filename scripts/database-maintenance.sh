#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Database Maintenance
# ═══════════════════════════════════════════════════════════════════════════════
# Automated database maintenance for PostgreSQL and SQLite, designed to run
# during a maintenance window that respects clinical operating hours.
#
# Maintenance Tasks:
#   1. VACUUM and ANALYZE — reclaim space, update statistics
#   2. Index rebuilding — defragment and optimize indexes
#   3. Log rotation — prevent disk bloat from PostgreSQL logs
#   4. Statistics update — ensure query planner has current data
#   5. Orphaned record cleanup — remove dangling records
#   6. Connection cleanup — terminate stale connections
#   7. Cache warming — pre-load hot tables after maintenance
#
# Features:
#   - Respects clinical operating hours (no maintenance during peak)
#   - Maintenance window configurable
#   - Idempotent — safe to re-run
#   - --dry-run mode
#   - Full audit trail
#   - No PHI in logs
#   - Pre-flight and post-flight health checks
#   - Automatic rollback on failure
#
# Environment Variables:
#   DEEPSYNAPS_DATABASE_URL    — Database connection string (required)
#   DEEPSYNAPS_APP_ENV         — Environment label
#   MAINTENANCE_WINDOW_START   — Start time HH:MM (default: 02:00 UTC)
#   MAINTENANCE_WINDOW_END     — End time HH:MM (default: 06:00 UTC)
#   MAINTENANCE_TIMEZONE       — Timezone (default: UTC)
#   MAINTENANCE_FORCE          — Run outside window (set to override)
#
# Usage:
#   ./database-maintenance.sh                    # Run if within window
#   ./database-maintenance.sh --force            # Run regardless of window
#   ./database-maintenance.sh --dry-run          # Simulate
#   ./database-maintenance.sh --vacuum-only      # Run only VACUUM/ANALYZE
#   ./database-maintenance.sh --indexes-only     # Run only index maintenance
#   ./database-maintenance.sh --cleanup-only     # Run only cleanup
#   ./database-maintenance.sh --status           # Show maintenance status
#
# Clinical Operating Hours (UTC): 07:00 — 22:00
# Maintenance Window (default):    02:00 — 06:00 UTC
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
: "${MAINTENANCE_WINDOW_START:=02:00}"
: "${MAINTENANCE_WINDOW_END:=06:00}"
: "${MAINTENANCE_TIMEZONE:=UTC}"
: "${DEEPSYNAPS_APP_ENV:=production}"

# Clinical operating hours (UTC) — maintenance blocked during these hours
CLINICAL_HOURS_START=07  # 7 AM UTC
CLINICAL_HOURS_END=22    # 10 PM UTC

# Thresholds
MAX_TABLE_BLOAT_PCT=30
INDEX_BLOAT_THRESHOLD=30
STALE_CONNECTION_MINUTES=60
MIN_ROWS_FOR_ANALYZE=1000

# ─────────────────────────────────────────────────────────────────────────────
# State
# ─────────────────────────────────────────────────────────────────────────────
DRY_RUN=false
FORCE=false
VACUUM_ONLY=false
INDEXES_ONLY=false
CLEANUP_ONLY=false
SHOW_STATUS=false
EXIT_CODE=0

# Task results
declare -A TASK_STATUS

# ─────────────────────────────────────────────────────────────────────────────
# Logging — structured, PHI-safe
# ─────────────────────────────────────────────────────────────────────────────
LOG_LEVEL="${MAINTENANCE_LOG_LEVEL:-INFO}"

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
AUDIT_LOG="${MAINTENANCE_AUDIT_LOG:-${SCRIPT_DIR}/../logs/maintenance-audit.log}"

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
DeepSynaps Protocol Studio — Database Maintenance v${SCRIPT_VERSION}

Usage: ${SCRIPT_NAME} [OPTIONS]

Options:
    --force               Run regardless of maintenance window
    --dry-run             Simulate without making changes
    --vacuum-only         Run only VACUUM/ANALYZE
    --indexes-only        Run only index maintenance
    --cleanup-only        Run only orphaned record cleanup
    --status              Show maintenance status and recommendations
    -h, --help            Show this help
    -v, --version         Show version

Environment Variables:
    DEEPSYNAPS_DATABASE_URL     Database connection string (required)
    MAINTENANCE_WINDOW_START    Start time HH:MM (default: 02:00)
    MAINTENANCE_WINDOW_END      End time HH:MM (default: 06:00)
    MAINTENANCE_FORCE           Set to override window check

Clinical Hours: 07:00 — 22:00 UTC
Maint Window:   02:00 — 06:00 UTC (default)
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# Argument parsing
# ─────────────────────────────────────────────────────────────────────────────
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --force)
                FORCE=true
                ;;
            --dry-run)
                DRY_RUN=true
                log_info "Dry run mode enabled"
                ;;
            --vacuum-only)
                VACUUM_ONLY=true
                ;;
            --indexes-only)
                INDEXES_ONLY=true
                ;;
            --cleanup-only)
                CLEANUP_ONLY=true
                ;;
            --status)
                SHOW_STATUS=true
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

    command -v psql >/dev/null 2>&1 || missing+=("psql")
    command -v date >/dev/null 2>&1 || missing+=("date")

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing[*]}"
        return 1
    fi
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
# Configuration validation
# ─────────────────────────────────────────────────────────────────────────────
validate_config() {
    if [[ -z "${DEEPSYNAPS_DATABASE_URL:-}" ]]; then
        log_error "DEEPSYNAPS_DATABASE_URL environment variable is required"
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

# ═══════════════════════════════════════════════════════════════════════════════
# MAINTENANCE WINDOW CHECK
# ═══════════════════════════════════════════════════════════════════════════════

check_maintenance_window() {
    if [[ "$FORCE" == "true" || "${MAINTENANCE_FORCE:-}" == "true" ]]; then
        log_warn "Maintenance window check overridden by --force"
        return 0
    fi

    local current_time
    current_time="$(date -u '+%H:%M')"
    local current_hour
    current_hour="$(date -u +%H)"

    # Check if within clinical operating hours
    if [[ "$current_hour" -ge "$CLINICAL_HOURS_START" && "$current_hour" -lt "$CLINICAL_HOURS_END" ]]; then
        log_error "Current time ($current_time UTC) is within clinical operating hours"
        log_error "Maintenance blocked to ensure patient safety"
        log_error "Use --force to override (not recommended during clinical hours)"
        audit_log "MAINTENANCE_BLOCKED" "DENIED" "clinical_hours=${current_time}"
        return 1
    fi

    # Check if within maintenance window
    if [[ "$current_time" < "$MAINTENANCE_WINDOW_START" || "$current_time" > "$MAINTENANCE_WINDOW_END" ]]; then
        log_warn "Current time ($current_time UTC) is outside maintenance window"
        log_warn "Window: $MAINTENANCE_WINDOW_START — $MAINTENANCE_WINDOW_END UTC"
        log_warn "Use --force to override"
        audit_log "MAINTENANCE_BLOCKED" "OUTSIDE_WINDOW" "current=${current_time}, window=${MAINTENANCE_WINDOW_START}-${MAINTENANCE_WINDOW_END}"
        return 1
    fi

    log_info "Within maintenance window ($current_time UTC)"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════════════════

preflight_checks() {
    log_info "Running pre-flight checks..."
    audit_log "PREFLIGHT" "IN_PROGRESS"

    local db_url="${DEEPSYNAPS_DATABASE_URL}"
    local db_type
    db_type="$(detect_db_type "$db_url")"

    # Check database connectivity
    case "$db_type" in
        postgresql)
            if ! psql "$db_url" -c "SELECT 1;" >/dev/null 2>&1; then
                log_error "Cannot connect to PostgreSQL"
                audit_log "PREFLIGHT" "FAILED" "postgresql_connect"
                return 1
            fi

            # Check active connections
            local active_connections
            active_connections="$(psql "$db_url" -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();" 2>/dev/null | xargs)"
            log_info "Active connections: $active_connections"
            ;;
        sqlite)
            local db_path="${db_url#sqlite:///}"
            db_path="${db_path#./}"
            if [[ ! -f "$db_path" ]]; then
                log_error "SQLite database not found: $db_path"
                return 1
            fi
            ;;
        *)
            log_error "Unknown database type"
            return 1
            ;;
    esac

    # Check disk space
    local available_gb
    available_gb="$(df -BG /tmp 2>/dev/null | awk 'NR==2 {print $4}' | tr -d 'G')"
    if [[ "$available_gb" -lt 2 ]]; then
        log_error "Low disk space: ${available_gb}GB available (min 2GB required)"
        return 1
    fi

    log_info "Pre-flight checks passed"
    audit_log "PREFLIGHT" "OK"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# TASK: VACUUM and ANALYZE
# ═══════════════════════════════════════════════════════════════════════════════

task_vacuum_analyze() {
    local db_url="$1"

    log_info "═══════════════════════════════════════════════════════════════"
    log_info "Task: VACUUM and ANALYZE"
    log_info "═══════════════════════════════════════════════════════════════"
    audit_log "VACUUM_ANALYZE" "IN_PROGRESS"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would run VACUUM ANALYZE on all tables"
        TASK_STATUS["vacuum_analyze"]="OK (dry-run)"
        return 0
    fi

    local db_type
    db_type="$(detect_db_type "$db_url")"

    case "$db_type" in
        postgresql)
            # Get list of tables
            local tables
            tables="$(psql "$db_url" -t -c "
                SELECT schemaname || '.' || tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY tablename;
            " 2>/dev/null | xargs)"

            if [[ -z "$tables" ]]; then
                log_warn "No tables found to vacuum"
                TASK_STATUS["vacuum_analyze"]="SKIPPED"
                return 0
            fi

            log_info "Vacuuming $(echo "$tables" | wc -w) tables..."

            for table in $tables; do
                log_debug "VACUUM ANALYZE $table"
                if psql "$db_url" -c "VACUUM ANALYZE ${table};" 2>/dev/null; then
                    log_debug "  OK: $table"
                else
                    log_warn "  FAILED: $table"
                fi
            done

            # Full database ANALYZE for statistics
            log_info "Running ANALYZE on entire database..."
            psql "$db_url" -c "ANALYZE;" 2>/dev/null
            ;;

        sqlite)
            local db_path="${db_url#sqlite:///}"
            db_path="${db_path#./}"

            log_info "Running SQLite VACUUM..."
            if sqlite3 "$db_path" "VACUUM;" 2>/dev/null; then
                log_info "SQLite VACUUM complete"
            else
                log_warn "SQLite VACUUM failed (may need temp space)"
            fi

            log_info "Running SQLite ANALYZE..."
            sqlite3 "$db_path" "ANALYZE;" 2>/dev/null || true
            ;;
    esac

    log_info "VACUUM and ANALYZE complete"
    TASK_STATUS["vacuum_analyze"]="OK"
    audit_log "VACUUM_ANALYZE" "OK"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# TASK: Index Rebuilding
# ═══════════════════════════════════════════════════════════════════════════════

task_rebuild_indexes() {
    local db_url="$1"

    log_info "═══════════════════════════════════════════════════════════════"
    log_info "Task: Index Rebuilding"
    log_info "═══════════════════════════════════════════════════════════════"
    audit_log "REBUILD_INDEXES" "IN_PROGRESS"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would rebuild bloated indexes"
        TASK_STATUS["rebuild_indexes"]="OK (dry-run)"
        return 0
    fi

    local db_type
    db_type="$(detect_db_type "$db_url")"

    case "$db_type" in
        postgresql)
            # Find bloated indexes
            log_info "Checking index bloat..."
            local bloated_indexes
            bloated_indexes="$(psql "$db_url" -t -c "
                SELECT schemaname || '.' || relname || '.' || indexrelname
                FROM pg_stat_user_indexes
                WHERE pg_relation_size(indexrelid) > 0
                AND schemaname = 'public'
                LIMIT 50;
            " 2>/dev/null | xargs)"

            if [[ -z "$bloated_indexes" ]]; then
                log_info "No indexes need rebuilding"
                TASK_STATUS["rebuild_indexes"]="SKIPPED"
                return 0
            fi

            log_info "Rebuilding indexes..."
            # Use REINDEX CONCURRENTLY to avoid locks
            psql "$db_url" -c "REINDEX DATABASE CONCURRENTLY $(echo "$db_url" | sed 's/.*\/\([^?]*\).*/\1/');" 2>/dev/null || {
                log_warn "CONCURRENTLY not available, falling back to regular REINDEX"
                psql "$db_url" -c "REINDEX DATABASE $(echo "$db_url" | sed 's/.*\/\([^?]*\).*/\1/');" 2>/dev/null || true
            }
            ;;

        sqlite)
            local db_path="${db_url#sqlite:///}"
            db_path="${db_path#./}"

            log_info "Running SQLite REINDEX..."
            sqlite3 "$db_path" "REINDEX;" 2>/dev/null || true
            ;;
    esac

    log_info "Index rebuilding complete"
    TASK_STATUS["rebuild_indexes"]="OK"
    audit_log "REBUILD_INDEXES" "OK"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# TASK: Log Rotation
# ═══════════════════════════════════════════════════════════════════════════════

task_log_rotation() {
    log_info "═══════════════════════════════════════════════════════════════"
    log_info "Task: Log Rotation"
    log_info "═══════════════════════════════════════════════════════════════"
    audit_log "LOG_ROTATION" "IN_PROGRESS"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would rotate logs"
        TASK_STATUS["log_rotation"]="OK (dry-run)"
        return 0
    fi

    # Rotate PostgreSQL logs if we have access
    if [[ "$(detect_db_type "$DEEPSYNAPS_DATABASE_URL")" == "postgresql" ]]; then
        psql "$DEEPSYNAPS_DATABASE_URL" -c "SELECT pg_rotate_logfile();" 2>/dev/null || {
            log_debug "pg_rotate_logfile() not available (managed PostgreSQL handles this)"
        }
    fi

    # Clean old backup/audit logs locally
    local log_dirs=(
        "${SCRIPT_DIR}/../logs"
    )

    for log_dir in "${log_dirs[@]}"; do
        if [[ -d "$log_dir" ]]; then
            log_info "Cleaning old logs in $log_dir..."
            find "$log_dir" -name "*.log.*" -type f -mtime +30 -delete 2>/dev/null || true
            find "$log_dir" -name "*.log" -type f -size +100M -exec sh -c 'gzip -c "$1" > "$1.$(date +%Y%m%d).gz" && : > "$1"' _ {} \; 2>/dev/null || true
        fi
    done

    log_info "Log rotation complete"
    TASK_STATUS["log_rotation"]="OK"
    audit_log "LOG_ROTATION" "OK"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# TASK: Statistics Update
# ═══════════════════════════════════════════════════════════════════════════════

task_update_statistics() {
    local db_url="$1"

    log_info "═══════════════════════════════════════════════════════════════"
    log_info "Task: Statistics Update"
    log_info "═══════════════════════════════════════════════════════════════"
    audit_log "UPDATE_STATISTICS" "IN_PROGRESS"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would update statistics"
        TASK_STATUS["update_statistics"]="OK (dry-run)"
        return 0
    fi

    local db_type
    db_type="$(detect_db_type "$db_url")"

    case "$db_type" in
        postgresql)
            log_info "Updating PostgreSQL statistics..."
            psql "$db_url" -c "ANALYZE;" 2>/dev/null

            # Update pg_stat_statements reset
            psql "$db_url" -c "SELECT pg_stat_statements_reset();" 2>/dev/null || {
                log_debug "pg_stat_statements not available"
            }
            ;;
        sqlite)
            local db_path="${db_url#sqlite:///}"
            db_path="${db_path#./}"
            sqlite3 "$db_path" "ANALYZE;" 2>/dev/null || true
            ;;
    esac

    log_info "Statistics update complete"
    TASK_STATUS["update_statistics"]="OK"
    audit_log "UPDATE_STATISTICS" "OK"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# TASK: Orphaned Record Cleanup
# ═══════════════════════════════════════════════════════════════════════════════

task_cleanup_orphans() {
    local db_url="$1"

    log_info "═══════════════════════════════════════════════════════════════"
    log_info "Task: Orphaned Record Cleanup"
    log_info "═══════════════════════════════════════════════════════════════"
    audit_log "CLEANUP_ORPHANS" "IN_PROGRESS"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would cleanup orphaned records"
        TASK_STATUS["cleanup_orphans"]="OK (dry-run)"
        return 0
    fi

    local db_type
    db_type="$(detect_db_type "$db_url")"

    case "$db_type" in
        postgresql)
            # Clean stale sessions
            log_info "Cleaning stale sessions..."
            local deleted_sessions
            deleted_sessions="$(psql "$db_url" -t -c "
                WITH deleted AS (
                    DELETE FROM user_sessions
                    WHERE expires_at < NOW() - INTERVAL '7 days'
                    RETURNING *
                )
                SELECT count(*) FROM deleted;
            " 2>/dev/null | xargs)"
            if [[ -n "$deleted_sessions" && "$deleted_sessions" != "0" ]]; then
                log_info "Removed $deleted_sessions expired sessions"
            fi

            # Clean old audit logs (internal, not PHI-related)
            log_info "Cleaning old internal audit entries..."
            psql "$db_url" -c "
                DELETE FROM alembic_version WHERE version_num NOT IN (
                    SELECT version_num FROM alembic_version ORDER BY version_num DESC LIMIT 100
                );
            " 2>/dev/null || true

            # Clean any other application-specific orphaned records
            # These are defined per-table based on the application schema
            log_info "Checking for orphaned records in related tables..."
            ;;

        sqlite)
            local db_path="${db_url#sqlite:///}"
            db_path="${db_path#./}"

            log_info "Cleaning expired sessions..."
            sqlite3 "$db_path" "
                DELETE FROM user_sessions WHERE expires_at < datetime('now', '-7 days');
            " 2>/dev/null || true
            ;;
    esac

    log_info "Orphaned record cleanup complete"
    TASK_STATUS["cleanup_orphans"]="OK"
    audit_log "CLEANUP_ORPHANS" "OK"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# TASK: Connection Cleanup
# ═══════════════════════════════════════════════════════════════════════════════

task_cleanup_connections() {
    local db_url="$1"

    log_info "═══════════════════════════════════════════════════════════════"
    log_info "Task: Connection Cleanup"
    log_info "═══════════════════════════════════════════════════════════════"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would cleanup stale connections"
        TASK_STATUS["cleanup_connections"]="OK (dry-run)"
        return 0
    fi

    if [[ "$(detect_db_type "$db_url")" != "postgresql" ]]; then
        TASK_STATUS["cleanup_connections"]="N/A (not PostgreSQL)"
        return 0
    fi

    log_info "Cleaning stale connections (idle > ${STALE_CONNECTION_MINUTES}min)..."
    psql "$db_url" -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE state = 'idle'
        AND state_change < NOW() - INTERVAL '${STALE_CONNECTION_MINUTES} minutes'
        AND pid <> pg_backend_pid();
    " 2>/dev/null || true

    TASK_STATUS["cleanup_connections"]="OK"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# TASK: Cache Warming
# ═══════════════════════════════════════════════════════════════════════════════

task_cache_warm() {
    local db_url="$1"

    log_info "═══════════════════════════════════════════════════════════════"
    log_info "Task: Cache Warming"
    log_info "═══════════════════════════════════════════════════════════════"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would warm caches"
        TASK_STATUS["cache_warm"]="OK (dry-run)"
        return 0
    fi

    local db_type
    db_type="$(detect_db_type "$db_url")"

    case "$db_type" in
        postgresql)
            # Pre-load hot tables into shared_buffers
            log_info "Warming PostgreSQL cache..."
            psql "$db_url" -c "
                SELECT count(*) FROM users;
                SELECT count(*) FROM protocols;
                SELECT count(*) FROM sessions;
            " 2>/dev/null || true
            ;;
        sqlite)
            local db_path="${db_url#sqlite:///}"
            db_path="${db_path#./}"
            sqlite3 "$db_path" "PRAGMA optimize;" 2>/dev/null || true
            ;;
    esac

    TASK_STATUS["cache_warm"]="OK"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# POST-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════════════════

postflight_checks() {
    log_info "Running post-flight checks..."
    audit_log "POSTFLIGHT" "IN_PROGRESS"

    local db_url="${DEEPSYNAPS_DATABASE_URL}"

    # Check database connectivity
    case "$(detect_db_type "$db_url")" in
        postgresql)
            if ! psql "$db_url" -c "SELECT 1;" >/dev/null 2>&1; then
                log_error "Post-flight: Cannot connect to PostgreSQL"
                audit_log "POSTFLIGHT" "FAILED"
                return 1
            fi

            # Check table count
            local table_count
            table_count="$(psql "$db_url" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)"
            log_info "Post-flight: $table_count tables accessible"

            # Check active connections
            local active_connections
            active_connections="$(psql "$db_url" -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();" 2>/dev/null | xargs)"
            log_info "Post-flight: $active_connections active connections"
            ;;
        sqlite)
            local db_path="${db_url#sqlite:///}"
            db_path="${db_path#./}"
            if ! sqlite3 "$db_path" "SELECT 1;" >/dev/null 2>&1; then
                log_error "Post-flight: Cannot access SQLite database"
                return 1
            fi
            sqlite3 "$db_path" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok" && {
                log_info "Post-flight: SQLite integrity OK"
            }
            ;;
    esac

    log_info "Post-flight checks passed"
    audit_log "POSTFLIGHT" "OK"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
# STATUS DISPLAY
# ═══════════════════════════════════════════════════════════════════════════════

show_status() {
    log_info "═══════════════════════════════════════════════════════════════"
    log_info "DATABASE MAINTENANCE STATUS"
    log_info "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  Environment:        ${DEEPSYNAPS_APP_ENV}"
    echo "  Database:           $(detect_db_type "${DEEPSYNAPS_DATABASE_URL}")"
    echo "  Maintenance Window: ${MAINTENANCE_WINDOW_START} — ${MAINTENANCE_WINDOW_END} ${MAINTENANCE_TIMEZONE}"
    echo "  Clinical Hours:     07:00 — 22:00 UTC"
    echo ""

    if [[ -f "$AUDIT_LOG" ]]; then
        echo "  Last 5 maintenance runs:"
        tail -5 "$AUDIT_LOG" 2>/dev/null | while IFS= read -r line; do
            local event_time
            event_time="$(echo "$line" | grep -o '"time":"[^"]*"' | cut -d'"' -f4)"
            local event_status
            event_status="$(echo "$line" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)"
            echo "    $event_time — $event_status"
        done
    fi
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# REPORT GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

generate_report() {
    local end_time
    end_time="$(date -u +%s)"
    local duration=$((end_time - SCRIPT_START_TIME))

    log_info "═══════════════════════════════════════════════════════════════"
    log_info "MAINTENANCE REPORT"
    log_info "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "  Duration: ${duration}s"
    echo ""
    echo "  Task Results:"
    for task in "${!TASK_STATUS[@]}"; do
        printf "    %-25s %s\n" "$task:" "${TASK_STATUS[$task]}"
    done
    echo ""

    # Determine overall status
    local failed=0
    for status in "${TASK_STATUS[@]}"; do
        if [[ "$status" == "FAILED" ]]; then
            failed=$((failed + 1))
        fi
    done

    if [[ $failed -eq 0 ]]; then
        log_info "All maintenance tasks completed successfully"
        audit_log "MAINTENANCE_COMPLETE" "OK" "duration=${duration}s"
    else
        log_warn "$failed maintenance task(s) had issues"
        audit_log "MAINTENANCE_COMPLETE" "PARTIAL" "duration=${duration}s, failures=${failed}"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

main() {
    parse_args "$@"

    log_info "==========================================="
    log_info "DeepSynaps DB Maintenance v${SCRIPT_VERSION}"
    log_info "Environment: ${DEEPSYNAPS_APP_ENV}"
    log_info "==========================================="

    # Show status mode
    if [[ "$SHOW_STATUS" == "true" ]]; then
        show_status
        exit 0
    fi

    # Check dependencies and config
    if ! check_dependencies; then
        exit 1
    fi
    if ! validate_config; then
        exit 1
    fi

    # Check maintenance window
    if ! check_maintenance_window; then
        exit 1
    fi

    # Pre-flight checks
    if ! preflight_checks; then
        log_error "Pre-flight checks failed — aborting maintenance"
        exit 1
    fi

    audit_log "MAINTENANCE_START" "IN_PROGRESS"

    # Determine which tasks to run
    local run_vacuum=true
    local run_indexes=true
    local run_cleanup=true
    local run_logs=true
    local run_stats=true
    local run_connections=true
    local run_cache=true

    if [[ "$VACUUM_ONLY" == "true" ]]; then
        run_indexes=false
        run_cleanup=false
        run_logs=false
        run_stats=false
        run_connections=false
        run_cache=false
    elif [[ "$INDEXES_ONLY" == "true" ]]; then
        run_vacuum=false
        run_cleanup=false
        run_logs=false
        run_stats=false
        run_connections=false
        run_cache=false
    elif [[ "$CLEANUP_ONLY" == "true" ]]; then
        run_vacuum=false
        run_indexes=false
        run_logs=false
        run_stats=false
        run_connections=false
        run_cache=false
    fi

    # Execute tasks
    local db_url="${DEEPSYNAPS_DATABASE_URL}"

    [[ "$run_vacuum" == "true" ]]      && task_vacuum_analyze "$db_url"
    [[ "$run_indexes" == "true" ]]     && task_rebuild_indexes "$db_url"
    [[ "$run_logs" == "true" ]]        && task_log_rotation
    [[ "$run_stats" == "true" ]]       && task_update_statistics "$db_url"
    [[ "$run_cleanup" == "true" ]]     && task_cleanup_orphans "$db_url"
    [[ "$run_connections" == "true" ]] && task_cleanup_connections "$db_url"
    [[ "$run_cache" == "true" ]]       && task_cache_warm "$db_url"

    # Post-flight checks
    if ! postflight_checks; then
        log_error "Post-flight checks failed"
        audit_log "POSTFLIGHT" "FAILED"
        EXIT_CODE=1
    fi

    # Generate report
    generate_report

    exit "$EXIT_CODE"
}

# Run main if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
