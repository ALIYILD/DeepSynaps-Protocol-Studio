#!/usr/bin/env bash
# =============================================================================
# rollback.sh — Rollback Automation for DeepSynaps Protocol Studio
# =============================================================================
# Healthcare-grade rollback script that detects the current active deployment
# and switches traffic back to the previous known-good version.
#
# SAFETY WARNING: This script does NOT automatically roll back database
# migrations. Migration rollback requires manual DBA review due to clinical
# data integrity requirements.
#
# Usage:
#   ./rollback.sh [staging|production] [--dry-run]
#   ./rollback.sh staging
#   ./rollback.sh production --dry-run
#   ./rollback.sh --help
#
# Environment Variables:
#   FLY_ACCESS_TOKEN    — Fly.io API token (required)
#   SLACK_WEBHOOK       — Slack notification webhook (optional)
#
# Exit Codes:
#   0   — Rollback successful
#   1   — General error
#   2   — Invalid arguments
#   3   — Missing dependencies
#   4   — Rollback authorization failed
#   5   — No previous version found
#   6   — Rollback verification failed
# =============================================================================

set -euo pipefail

# --- Script Metadata ---
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_VERSION="1.0.0"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Configuration ---
readonly APP_BLUE_PROD="deepsynaps-studio"
readonly APP_GREEN_PROD="deepsynaps-studio-green"
readonly APP_BLUE_STAGING="deepsynaps-studio-staging"
readonly APP_GREEN_STAGING="deepsynaps-studio-staging-green"
readonly HEALTH_CHECK_RETRIES=30
readonly HEALTH_CHECK_INTERVAL=10
readonly ROLLBACK_TIMEOUT=300  # 5 minutes max

# --- Runtime State ---
DRY_RUN=false
ENVIRONMENT=""
APP_BLUE=""
APP_GREEN=""
ROLLBACK_TYPE="green_abandon"  # default: just abandon green
REASON=""
ROLLBACK_START_TIME=""

# =============================================================================
# Logging
# =============================================================================

log_info() { printf "[INFO]  %s\n" "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_warn() { printf "[WARN]  %s\n" "$(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }
log_error() { printf "[ERROR] %s\n" "$(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }
log_audit() { printf "[AUDIT] %s\n" "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

log_section() {
    echo ""
    printf "=== %s ===\n" "$*"
    echo ""
}

# =============================================================================
# Usage & Help
# =============================================================================

usage() {
    cat << EOF
DeepSynaps Protocol Studio — Rollback Automation

Usage:
    $SCRIPT_NAME [staging|production] [OPTIONS]

Arguments:
    staging|production    Target environment (required)

Options:
    --dry-run             Simulate rollback without making changes
    --reason TEXT         Reason for rollback (required for production)
    --type TYPE           Rollback strategy:
                          - green_abandon     : Abandon green, keep blue (default)
                          - previous_version  : Roll back to previous release
                          - db_rollback       : Include database rollback warnings
    --help                Show this help message

Environment Variables:
    FLY_ACCESS_TOKEN      Fly.io API token (required)
    SLACK_WEBHOOK         Slack notification URL (optional)

Examples:
    $SCRIPT_NAME staging
    $SCRIPT_NAME staging --reason "API returning 500 errors"
    $SCRIPT_NAME production --reason "Critical bug in patient data API" --type previous_version
    $SCRIPT_NAME production --dry-run --type db_rollback

IMPORTANT:
    - Production rollback requires --reason
    - Database migrations are NEVER automatically rolled back
    - Rollback must complete within 5 minutes

EOF
}

# =============================================================================
# Utility Functions
# =============================================================================

cmd_exists() { command -v "$1" >/dev/null 2>&1; }

run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would execute: $*"
        return 0
    fi
    log_info "Executing: $*"
    "$@"
}

fly_cmd() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] flyctl $*"
        return 0
    fi
    FLY_ACCESS_TOKEN="${FLY_ACCESS_TOKEN:-}" flyctl "$@"
}

elapsed_seconds() {
    local start="$1"
    local end
    end="$(date +%s)"
    echo "$((end - start))"
}

format_duration() {
    local seconds="$1"
    local mins=$((seconds / 60))
    local secs=$((seconds % 60))
    printf "%dm%02ds" "$mins" "$secs"
}

# =============================================================================
# Validation
# =============================================================================

validate_arguments() {
    if [ $# -lt 1 ]; then
        usage
        exit 2
    fi

    local positional_set=false

    while [ $# -gt 0 ]; do
        case "$1" in
            staging|production)
                if [ "$positional_set" = true ]; then
                    log_error "Environment already specified"
                    exit 2
                fi
                ENVIRONMENT="$1"
                positional_set=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --reason)
                if [ -z "${2:-}" ]; then
                    log_error "--reason requires a value"
                    exit 2
                fi
                REASON="$2"
                shift 2
                ;;
            --type)
                if [ -z "${2:-}" ]; then
                    log_error "--type requires a value"
                    exit 2
                fi
                ROLLBACK_TYPE="$2"
                shift 2
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown argument: $1"
                usage
                exit 2
                ;;
        esac
    done

    if [ -z "$ENVIRONMENT" ]; then
        log_error "Environment (staging|production) is required"
        usage
        exit 2
    fi

    # Production requires a reason
    if [ "$ENVIRONMENT" = "production" ] && [ -z "$REASON" ]; then
        log_error "Production rollback requires --reason"
        usage
        exit 4
    fi

    # Set app names
    case "$ENVIRONMENT" in
        production)
            APP_BLUE="$APP_BLUE_PROD"
            APP_GREEN="$APP_GREEN_PROD"
            ;;
        staging)
            APP_BLUE="$APP_BLUE_STAGING"
            APP_GREEN="$APP_GREEN_STAGING"
            ;;
    esac

    log_info "Configuration:"
    log_info "  Environment : $ENVIRONMENT"
    log_info "  Blue App    : $APP_BLUE"
    log_info "  Green App   : $APP_GREEN"
    log_info "  Rollback Type: $ROLLBACK_TYPE"
    log_info "  Dry Run     : $DRY_RUN"
    [ -n "$REASON" ] && log_info "  Reason      : $REASON"
}

validate_environment() {
    log_section "Validating Environment"

    if ! cmd_exists flyctl; then
        log_error "flyctl not installed"
        exit 3
    fi

    if [ -z "${FLY_ACCESS_TOKEN:-}" ]; then
        if ! flyctl auth whoami >/dev/null 2>&1; then
            log_error "Not authenticated to Fly.io"
            exit 3
        fi
    fi

    if ! fly_cmd status --app "$APP_BLUE" >/dev/null 2>&1; then
        log_error "Blue app '$APP_BLUE' not found"
        exit 3
    fi

    log_info "✓ Environment validated"
}

# =============================================================================
# State Detection
# =============================================================================

detect_current_state() {
    log_section "Detecting Current Deployment State"

    log_info "Checking blue app: $APP_BLUE"
    local blue_status blue_machines blue_image
    blue_status=$(fly_cmd status --app "$APP_BLUE" --json 2>/dev/null || echo '{}')
    blue_machines=$(echo "$blue_status" | jq -r '.Machines | length // 0')
    blue_image=$(echo "$blue_status" | jq -r '.Machines[0].ImageRef // "unknown"')

    log_info "Checking green app: $APP_GREEN"
    local green_status green_machines green_image
    green_status=$(fly_cmd status --app "$APP_GREEN" --json 2>/dev/null || echo '{}')
    green_machines=$(echo "$green_status" | jq -r '.Machines | length // 0')
    green_image=$(echo "$green_status" | jq -r '.Machines[0].ImageRef // "unknown"')

    log_info "Current State:"
    log_info "  Blue  : $blue_machines machines, image=$blue_image"
    log_info "  Green : $green_machines machines, image=$green_image"

    # Determine active app
    local active_app="unknown"
    if [ "$blue_machines" -gt 0 ] && [ "$green_machines" -gt 0 ]; then
        active_app="blue"
        log_info "Both apps running — blue is the live app"
    elif [ "$blue_machines" -gt 0 ]; then
        active_app="blue"
    elif [ "$green_machines" -gt 0 ]; then
        active_app="green"
    else
        log_error "Neither app has running machines — manual intervention required"
        exit 5
    fi

    # Export state for other functions
    echo "$active_app"
}

get_previous_release() {
    log_info "Finding previous release..."

    local releases_json
    releases_json=$(fly_cmd releases list --app "$APP_BLUE" --json 2>/dev/null || echo '[]')

    # Get the second-most-recent stable release
    local prev_image
    prev_image=$(echo "$releases_json" | jq -r '[.[] | select(.Stable == true)][1].ImageRef // empty')

    if [ -z "$prev_image" ] || [ "$prev_image" = "null" ]; then
        log_warn "No previous stable release found"
        echo ""
    else
        log_info "Previous release image: $prev_image"
        echo "$prev_image"
    fi
}

# =============================================================================
# Rollback Execution
# =============================================================================

execute_rollback() {
    local active_app="$1"
    local prev_image="${2:-}"

    log_section "Executing Rollback"
    log_info "Strategy: $ROLLBACK_TYPE"
    log_info "Active app: $active_app"

    case "$ROLLBACK_TYPE" in
        green_abandon)
            rollback_green_abandon "$active_app"
            ;;
        previous_version)
            rollback_previous_version "$prev_image"
            ;;
        db_rollback)
            rollback_with_db_warnings "$active_app" "$prev_image"
            ;;
        *)
            log_error "Unknown rollback type: $ROLLBACK_TYPE"
            exit 2
            ;;
    esac
}

rollback_green_abandon() {
    local active_app="$1"

    log_info "Strategy: Abandon green deployment"

    if [ "$active_app" = "blue" ]; then
        log_info "Blue is already the active app — scaling green to 0"
        fly_cmd scale count 0 --app "$APP_GREEN" --yes 2>/dev/null || true
    else
        log_info "Green is the active app — switching back to blue"
        fly_cmd scale count 1 --app "$APP_BLUE" --yes
        fly_cmd scale count 0 --app "$APP_GREEN" --yes 2>/dev/null || true
    fi

    log_info "✓ Green abandoned. Blue is serving traffic."
}

rollback_previous_version() {
    local prev_image="$1"

    if [ -z "$prev_image" ]; then
        log_warn "No previous image found — falling back to green_abandon"
        rollback_green_abandon "blue"
        return 0
    fi

    log_info "Rolling blue back to previous image: $prev_image"
    fly_cmd deploy --app "$APP_BLUE" --image "$prev_image" --yes --strategy immediate

    log_info "Scaling green to 0"
    fly_cmd scale count 0 --app "$APP_GREEN" --yes 2>/dev/null || true

    log_info "✓ Rolled back to previous version"
}

rollback_with_db_warnings() {
    local active_app="$1"
    local prev_image="$2"

    log_warn "============================================"
    log_warn "DATABASE ROLLBACK WARNING"
    log_warn "============================================"
    log_warn "This rollback type requires MANUAL database steps:"
    log_warn ""
    log_warn "1. Check which migrations were applied:"
    log_warn "   fly ssh console --app $APP_BLUE -C 'cd /app/apps/api && alembic history'"
    log_warn ""
    log_warn "2. Identify target downgrade revision"
    log_warn ""
    log_warn "3. Create database backup if not already done"
    log_warn ""
    log_warn "4. Run downgrade (REQUIRES DBA APPROVAL):"
    log_warn "   alembic downgrade <target_revision>"
    log_warn ""
    log_warn "5. Verify data integrity"
    log_warn ""
    log_warn "Proceeding with application-layer rollback only..."
    log_warn "============================================"

    # Execute application rollback
    if [ -n "$prev_image" ]; then
        rollback_previous_version "$prev_image"
    else
        rollback_green_abandon "$active_app"
    fi
}

# =============================================================================
# Verification
# =============================================================================

verify_rollback() {
    log_section "Verifying Rollback Health"

    local blue_url="https://${APP_BLUE}.fly.dev"
    local max_wait=$HEALTH_CHECK_RETRIES

    log_info "Checking health at: ${blue_url}/health"

    for i in $(seq 1 $max_wait); do
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY-RUN] Would verify ${blue_url}/health"
            return 0
        fi

        if curl -fsS "${blue_url}/health" >/dev/null 2>&1; then
            log_info "✓ App is healthy after rollback (attempt $i)"

            # Additional verification
            verify_critical_endpoints
            return 0
        fi

        log_info "  Attempt $i/$max_wait — waiting..."
        sleep "$HEALTH_CHECK_INTERVAL"
    done

    log_error "✗ App did not become healthy after rollback"
    return 1
}

verify_critical_endpoints() {
    log_info "→ Checking critical endpoints"

    local blue_url="https://${APP_BLUE}.fly.dev"
    local endpoints=(
        "/health"
        "/api/v1/conditions"
        "/api/v1/devices"
    )

    for endpoint in "${endpoints[@]}"; do
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY-RUN] Would check ${blue_url}${endpoint}"
            continue
        fi

        local code
        code=$(curl -s -o /dev/null -w "%{http_code}" "${blue_url}${endpoint}" || echo "000")

        if [ "$code" = "200" ] || [ "$code" = "401" ]; then
            log_info "  ✓ $endpoint → HTTP $code"
        else
            log_warn "  ⚠ $endpoint → HTTP $code"
        fi
    done
}

# =============================================================================
# Notification
# =============================================================================

send_notification() {
    local status="$1"
    local duration="$2"

    if [ -z "${SLACK_WEBHOOK:-}" ]; then
        log_info "No Slack webhook configured"
        return 0
    fi

    local emoji
    case "$status" in
        success) emoji="✅" ;;
        failure) emoji="🚨" ;;
        *) emoji="⚠️" ;;
    esac

    local rollback_url="https://${APP_BLUE}.fly.dev"

    local payload
    payload=$(cat <<EOF
{
    "text": "${emoji} DeepSynaps Rollback — ${status} (${ENVIRONMENT})",
    "blocks": [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "${emoji} *Rollback ${status}*\n• Environment: \`${ENVIRONMENT}\`\n• App: \`${APP_BLUE}\`\n• Duration: ${duration}\n• Type: \`${ROLLBACK_TYPE}\`\n• Reason: ${REASON:-\"N/A\"}\n• <${rollback_url}|View App>"
            }
        }
    ]
}
EOF
)

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would send notification"
        return 0
    fi

    curl -s -X POST "$SLACK_WEBHOOK" \
        -H 'Content-type: application/json' \
        --data "$payload" >/dev/null || log_warn "Notification failed"
}

# =============================================================================
# Audit Trail
# =============================================================================

write_audit_log() {
    local status="$1"
    local duration="$2"
    local active_app="$3"

    log_section "Rollback Audit Trail"
    log_audit "ROLLBACK ${status}"
    log_audit "  Timestamp : $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    log_audit "  User      : $(whoami)"
    log_audit "  Host      : $(hostname)"
    log_audit "  Environment: $ENVIRONMENT"
    log_audit "  Type      : $ROLLBACK_TYPE"
    log_audit "  Active App: $active_app"
    log_audit "  Duration  : $duration"
    log_audit "  Dry Run   : $DRY_RUN"
    [ -n "$REASON" ] && log_audit "  Reason    : $REASON"
}

# =============================================================================
# Main
# =============================================================================

main() {
    validate_arguments "$@"
    validate_environment

    ROLLBACK_START_TIME="$(date +%s)"

    # Detect current state
    local active_app
    active_app=$(detect_current_state)

    # Get previous release (for previous_version strategy)
    local prev_image=""
    if [ "$ROLLBACK_TYPE" = "previous_version" ] || [ "$ROLLBACK_TYPE" = "db_rollback" ]; then
        prev_image=$(get_previous_release)
    fi

    # Execute rollback
    execute_rollback "$active_app" "$prev_image"

    # Verify
    if verify_rollback; then
        local duration
        duration=$(elapsed_seconds "$ROLLBACK_START_TIME")

        log_section "Rollback Complete"
        log_info "Status      : SUCCESS"
        log_info "Duration    : $(format_duration $duration)"
        log_info "Environment : $ENVIRONMENT"
        log_info "App         : $APP_BLUE"

        write_audit_log "SUCCESS" "$(format_duration $duration)" "$active_app"
        send_notification "success" "$(format_duration $duration)"

        # Warn about database if needed
        if [ "$ROLLBACK_TYPE" = "db_rollback" ]; then
            log_warn ""
            log_warn "Remember: Database migration rollback steps are MANUAL"
            log_warn "See the checklist printed above for required steps"
        fi

        exit 0
    else
        local duration
        duration=$(elapsed_seconds "$ROLLBACK_START_TIME")

        log_error "Rollback verification failed"
        write_audit_log "FAILED_VERIFICATION" "$(format_duration $duration)" "$active_app"
        send_notification "failure" "$(format_duration $duration)"
        exit 6
    fi
}

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
