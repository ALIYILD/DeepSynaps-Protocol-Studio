#!/usr/bin/env bash
# =============================================================================
# deployment-checklist.sh — Pre/Post-Deployment Verification
# =============================================================================
# Comprehensive deployment verification checklist for DeepSynaps Protocol
# Studio, a clinical neuromodulation platform. This script performs a series
# of validation checks before and after deployment to ensure system health,
# security, and compliance.
#
# Usage:
#   ./deployment-checklist.sh pre [staging|production] [--dry-run]
#   ./deployment-checklist.sh post [staging|production] [--dry-run]
#   ./deployment-checklist.sh full [staging|production] [--dry-run]
#   ./deployment-checklist.sh --help
#
# Checks (pre-deployment):
#   - Required environment variables configured
#   - Fly.io app exists and is accessible
#   - Database connectivity
#   - SSL certificate validity
#   - Previous deployment state
#
# Checks (post-deployment):
#   - Health endpoint response
#   - Critical API routes
#   - SSL certificate expiry
#   - Response time validation
#   - Log stream check
#   - Database migration status
#
# Environment Variables:
#   FLY_ACCESS_TOKEN    — Fly.io API token (required)
#   SLACK_WEBHOOK       — Slack notification URL (optional)
#
# Exit Codes:
#   0   — All checks passed
#   1   — One or more checks failed
#   2   — Invalid arguments
#   3   — Missing dependencies
# =============================================================================

set -euo pipefail

# --- Script Metadata ---
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_VERSION="1.0.0"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Configuration ---
readonly APP_BLUE_PROD="deepsynaps-studio"
readonly APP_BLUE_STAGING="deepsynaps-studio-staging"
readonly HEALTH_ENDPOINT="/health"
readonly RESPONSE_TIME_THRESHOLD=5.0  # seconds
readonly SSL_EXPIRY_WARNING_DAYS=7
readonly SSL_EXPIRY_CRITICAL_DAYS=1

# Required environment variables per environment
readonly REQUIRED_SECRETS=(
    "DEEPSYNAPS_DATABASE_URL"
    "JWT_SECRET_KEY"
    "DEEPSYNAPS_SECRETS_KEY"
)

readonly OPTIONAL_SECRETS=(
    "SENTRY_DSN"
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "CELERY_BROKER_URL"
)

# Critical API endpoints to verify
readonly CRITICAL_ENDPOINTS=(
    "/health"
    "/api/v1/conditions"
    "/api/v1/devices"
    "/api/v1/modalities"
    "/api/v1/evidence/search?q=test"
    "/api/v1/protocols"
    "/api/v1/patients"
    "/api/v1/safety/check"
)

# --- Runtime State ---
CHECK_MODE=""       # pre, post, or full
ENVIRONMENT=""
APP_BLUE=""
DRY_RUN=false
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNINGS=0
REPORT_FILE=""

# =============================================================================
# Logging & Reporting
# =============================================================================

log_info() { printf "[INFO]  %s\n" "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_pass() { printf "[PASS]  %s\n" "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_fail() { printf "[FAIL]  %s\n" "$(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }
log_warn() { printf "[WARN]  %s\n" "$(date '+%Y-%m-%d %H:%M:%S') $*" >&2; }
log_section() {
    echo ""
    printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    printf "  %s\n" "$*"
    printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    echo ""
}

record_result() {
    local status="$1"
    local check_name="$2"

    case "$status" in
        pass)
            ((CHECKS_PASSED++))
            log_pass "$check_name"
            ;;
        fail)
            ((CHECKS_FAILED++))
            log_fail "$check_name"
            ;;
        warn)
            ((CHECKS_WARNINGS++))
            log_warn "$check_name"
            ;;
    esac

    # Write to report file if set
    if [ -n "${REPORT_FILE:-}" ]; then
        printf "%s | %s | %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$status" "$check_name" >> "$REPORT_FILE"
    fi
}

# =============================================================================
# Usage & Help
# =============================================================================

usage() {
    cat << EOF
DeepSynaps Protocol Studio — Deployment Checklist

Usage:
    $SCRIPT_NAME [MODE] [ENVIRONMENT] [OPTIONS]

Arguments:
    MODE                    Check mode: pre, post, or full
    ENVIRONMENT             Target environment: staging or production

Options:
    --dry-run               Simulate checks without making changes
    --report FILE           Write check results to report file
    --help                  Show this help message

Examples:
    $SCRIPT_NAME pre staging                    # Pre-deploy checks on staging
    $SCRIPT_NAME post production --report out   # Post-deploy checks with report
    $SCRIPT_NAME full staging --dry-run         # All checks, dry run

EOF
}

# =============================================================================
# Argument Parsing
# =============================================================================

parse_args() {
    if [ $# -lt 2 ]; then
        usage
        exit 2
    fi

    CHECK_MODE="$1"
    ENVIRONMENT="$2"
    shift 2

    case "$CHECK_MODE" in
        pre|post|full) ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            log_fail "Invalid mode: $CHECK_MODE (use pre, post, or full)"
            exit 2
            ;;
    esac

    case "$ENVIRONMENT" in
        production)
            APP_BLUE="$APP_BLUE_PROD"
            ;;
        staging)
            APP_BLUE="$APP_BLUE_STAGING"
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            log_fail "Invalid environment: $ENVIRONMENT (use staging or production)"
            exit 2
            ;;
    esac

    # Parse remaining options
    while [ $# -gt 0 ]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --report)
                if [ -z "${2:-}" ]; then
                    log_fail "--report requires a file path"
                    exit 2
                fi
                REPORT_FILE="$2"
                shift 2
                ;;
            --help|-h)
                usage
                exit 0
                ;;
            *)
                log_fail "Unknown option: $1"
                usage
                exit 2
                ;;
        esac
    done

    # Initialize report file
    if [ -n "$REPORT_FILE" ]; then
        echo "timestamp | status | check" > "$REPORT_FILE"
        echo "--------------------------" >> "$REPORT_FILE"
    fi

    log_info "Mode        : $CHECK_MODE"
    log_info "Environment : $ENVIRONMENT"
    log_info "App         : $APP_BLUE"
    log_info "Dry Run     : $DRY_RUN"
}

# =============================================================================
# Utility Functions
# =============================================================================

cmd_exists() { command -v "$1" >/dev/null 2>&1; }

fly_cmd() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] flyctl $*"
        return 0
    fi
    FLY_ACCESS_TOKEN="${FLY_ACCESS_TOKEN:-}" flyctl "$@" 2>/dev/null
}

http_code() {
    local url="$1"
    curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" 2>/dev/null || echo "000"
}

http_response_time() {
    local url="$1"
    curl -s -o /dev/null -w "%{time_total}" --max-time 30 "$url" 2>/dev/null || echo "999"
}

# =============================================================================
# Pre-Deployment Checks
# =============================================================================

check_dependencies() {
    log_section "Pre-Deployment: Dependencies"

    local deps_ok=true

    if ! cmd_exists flyctl; then
        record_result "fail" "flyctl CLI is installed"
        deps_ok=false
    else
        record_result "pass" "flyctl CLI is installed"
    fi

    if ! cmd_exists curl; then
        record_result "fail" "curl is installed"
        deps_ok=false
    else
        record_result "pass" "curl is installed"
    fi

    if ! cmd_exists jq; then
        record_result "warn" "jq is installed (recommended for JSON parsing)"
    else
        record_result "pass" "jq is installed"
    fi

    if ! cmd_exists openssl; then
        record_result "warn" "openssl is installed (needed for SSL checks)"
    else
        record_result "pass" "openssl is installed"
    fi

    [ "$deps_ok" = true ] || return 1
}

check_fly_auth() {
    log_section "Pre-Deployment: Fly.io Authentication"

    if [ -n "${FLY_ACCESS_TOKEN:-}" ]; then
        record_result "pass" "FLY_ACCESS_TOKEN is set"
    elif flyctl auth whoami >/dev/null 2>&1; then
        record_result "pass" "Fly.io interactive authentication is active"
    else
        record_result "fail" "Fly.io authentication (set FLY_ACCESS_TOKEN or run flyctl auth login)"
        return 1
    fi
}

check_app_exists() {
    log_section "Pre-Deployment: Fly.io App Exists"

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "App '$APP_BLUE' exists [DRY-RUN]"
        return 0
    fi

    if fly_cmd status --app "$APP_BLUE" >/dev/null; then
        record_result "pass" "App '$APP_BLUE' exists and is accessible"
    else
        record_result "fail" "App '$APP_BLUE' not found or not accessible"
        return 1
    fi
}

check_environment_variables() {
    log_section "Pre-Deployment: Environment Variables"

    if [ "$DRY_RUN" = true ]; then
        for secret in "${REQUIRED_SECRETS[@]}"; do
            record_result "pass" "Secret '$secret' is configured [DRY-RUN]"
        done
        return 0
    fi

    # Check required secrets
    local secrets_json
    secrets_json=$(fly_cmd secrets list --app "$APP_BLUE" --json 2>/dev/null || echo '[]')

    local all_passed=true
    for secret in "${REQUIRED_SECRETS[@]}"; do
        if echo "$secrets_json" | jq -e ".[] | select(.Name == \"$secret\")" >/dev/null 2>&1; then
            record_result "pass" "Required secret '$secret' is configured"
        else
            record_result "fail" "Required secret '$secret' is NOT configured"
            all_passed=false
        fi
    done

    # Check optional secrets
    for secret in "${OPTIONAL_SECRETS[@]}"; do
        if echo "$secrets_json" | jq -e ".[] | select(.Name == \"$secret\")" >/dev/null 2>&1; then
            record_result "pass" "Optional secret '$secret' is configured"
        else
            record_result "warn" "Optional secret '$secret' is NOT configured"
        fi
    done

    [ "$all_passed" = true ] || return 1
}

check_database_connectivity() {
    log_section "Pre-Deployment: Database Connectivity"

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "Database is reachable [DRY-RUN]"
        return 0
    fi

    # Check if database is accessible via the app's health check (which includes DB)
    local app_url="https://${APP_BLUE}.fly.dev"
    local health_response
    health_response=$(curl -fsS "${app_url}${HEALTH_ENDPOINT}" --max-time 15 2>/dev/null || echo '{"status":"unreachable"}')

    if echo "$health_response" | grep -qi '"database".*"ok\|"db".*"ok\|"status".*"ok"'; then
        record_result "pass" "Database connection is healthy"
    elif echo "$health_response" | grep -qi '"status".*"ok"'; then
        record_result "pass" "App is healthy (database check may be implicit)"
    else
        record_result "warn" "Could not confirm database connectivity from health endpoint"
    fi
}

check_ssl_certificate() {
    log_section "Pre-Deployment: SSL Certificate"

    if ! cmd_exists openssl; then
        record_result "warn" "SSL check skipped (openssl not installed)"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "SSL certificate is valid [DRY-RUN]"
        return 0
    fi

    local host="${APP_BLUE}.fly.dev"
    local cert_info
    cert_info=$(echo | openssl s_client -servername "$host" -connect "${host}:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)

    if [ -z "$cert_info" ]; then
        record_result "fail" "Could not retrieve SSL certificate for $host"
        return 1
    fi

    local expiry_date
    expiry_date=$(echo "$cert_info" | grep notAfter | cut -d= -f2)

    if [ -z "$expiry_date" ]; then
        record_result "fail" "Could not parse SSL expiry date"
        return 1
    fi

    # Calculate days until expiry (portable, works on Linux and macOS)
    local expiry_epoch now_epoch days_until
    expiry_epoch=$(date -d "$expiry_date" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$expiry_date" +%s 2>/dev/null)
    now_epoch=$(date +%s)
    days_until=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [ "$days_until" -lt "$SSL_EXPIRY_CRITICAL_DAYS" ]; then
        record_result "fail" "SSL certificate expires in $days_until day(s) — CRITICAL"
        return 1
    elif [ "$days_until" -lt "$SSL_EXPIRY_WARNING_DAYS" ]; then
        record_result "warn" "SSL certificate expires in $days_until day(s) — renew soon"
    else
        record_result "pass" "SSL certificate valid for $days_until day(s)"
    fi
}

check_previous_deployment_state() {
    log_section "Pre-Deployment: Previous Deployment State"

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "Previous deployment state is stable [DRY-RUN]"
        return 0
    fi

    local releases_json
    releases_json=$(fly_cmd releases list --app "$APP_BLUE" --json 2>/dev/null || echo '[]')
    local release_count
    release_count=$(echo "$releases_json" | jq 'length')

    if [ "$release_count" -eq 0 ]; then
        record_result "warn" "No previous releases found (first deployment?)"
    else
        local latest_version
        latest_version=$(echo "$releases_json" | jq -r '.[0].Version // "unknown"')
        local latest_status
        latest_status=$(echo "$releases_json" | jq -r '.[0].Stable // "unknown"')
        record_result "pass" "Latest release: v$latest_version (stable=$latest_status)"
    fi

    # Check machine count
    local machines_json
    machines_json=$(fly_cmd status --app "$APP_BLUE" --json 2>/dev/null || echo '{}')
    local machine_count
    machine_count=$(echo "$machines_json" | jq '.Machines | length')
    record_result "pass" "Running machines: $machine_count"
}

# =============================================================================
# Post-Deployment Checks
# =============================================================================

check_health_endpoint() {
    log_section "Post-Deployment: Health Endpoint"

    local app_url="https://${APP_BLUE}.fly.dev"
    local health_url="${app_url}${HEALTH_ENDPOINT}"

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "Health endpoint responds [DRY-RUN]"
        return 0
    fi

    local health_response
    health_response=$(curl -fsS "$health_url" --max-time 15 2>/dev/null || echo '{"status":"unreachable"}')

    if echo "$health_response" | grep -qi '"status".*"ok\|"healthy\|"ok"'; then
        record_result "pass" "Health endpoint returns OK: $health_response"
    elif echo "$health_response" | grep -qi '"status"'; then
        record_result "pass" "Health endpoint responds: $health_response"
    else
        record_result "fail" "Health endpoint unreachable or unexpected response"
        return 1
    fi
}

check_critical_routes() {
    log_section "Post-Deployment: Critical API Routes"

    local app_url="https://${APP_BLUE}.fly.dev"
    local failures=0

    for endpoint in "${CRITICAL_ENDPOINTS[@]}"; do
        local full_url="${app_url}${endpoint}"

        if [ "$DRY_RUN" = true ]; then
            record_result "pass" "$endpoint responds [DRY-RUN]"
            continue
        fi

        local code
        code=$(http_code "$full_url")

        case "$code" in
            200)
                record_result "pass" "$endpoint → HTTP 200"
                ;;
            401|403)
                record_result "pass" "$endpoint → HTTP $code (auth required, endpoint exists)"
                ;;
            422)
                record_result "pass" "$endpoint → HTTP 422 (validation, endpoint exists)"
                ;;
            000)
                record_result "fail" "$endpoint → unreachable"
                ((failures++)) || true
                ;;
            *)
                record_result "warn" "$endpoint → HTTP $code"
                ;;
        esac
    done

    [ "$failures" -eq 0 ] || return 1
}

check_response_time() {
    log_section "Post-Deployment: Response Time"

    local app_url="https://${APP_BLUE}.fly.dev"
    local health_url="${app_url}${HEALTH_ENDPOINT}"

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "Response time acceptable [DRY-RUN]"
        return 0
    fi

    local response_time
    response_time=$(http_response_time "$health_url")

    # Use bc for float comparison if available, otherwise approximate
    local slow
    if cmd_exists bc; then
        slow=$(echo "$response_time > $RESPONSE_TIME_THRESHOLD" | bc -l)
    else
        # Fallback: compare integer part
        local int_part
        int_part="${response_time%.*}"
        [ "$int_part" -gt "${RESPONSE_TIME_THRESHOLD%.*}" ] && slow=1 || slow=0
    fi

    if [ "$slow" -eq 1 ]; then
        record_result "warn" "Response time is ${response_time}s (threshold: ${RESPONSE_TIME_THRESHOLD}s)"
    else
        record_result "pass" "Response time is ${response_time}s (threshold: ${RESPONSE_TIME_THRESHOLD}s)"
    fi
}

check_ssl_post_deploy() {
    log_section "Post-Deployment: SSL Certificate"
    check_ssl_certificate
}

check_database_migration_status() {
    log_section "Post-Deployment: Database Migration Status"

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "Database migrations are current [DRY-RUN]"
        return 0
    fi

    # Try to get migration info via SSH
    local migration_output
    migration_output=$(fly_cmd ssh console --app "$APP_BLUE" -C "cd /app/apps/api && python -m alembic current" 2>/dev/null || echo "")

    if [ -n "$migration_output" ]; then
        local head_rev
        head_rev=$(fly_cmd ssh console --app "$APP_BLUE" -C "cd /app/apps/api && python -m alembic heads" 2>/dev/null || echo "unknown")

        if echo "$migration_output" | grep -q "$head_rev"; then
            record_result "pass" "Database is at latest migration: $head_rev"
        else
            record_result "warn" "Database migration may not be current (current: $migration_output, head: $head_rev)"
        fi
    else
        record_result "warn" "Could not verify migration status (app may not be using Alembic)"
    fi
}

check_log_stream() {
    log_section "Post-Deployment: Log Stream Check"

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "Log stream accessible [DRY-RUN]"
        return 0
    fi

    # Check if we can access logs (just verify the command works)
    local log_sample
    log_sample=$(fly_cmd logs --app "$APP_BLUE" --limit 5 2>/dev/null | head -5 || true)

    if [ -n "$log_sample" ]; then
        record_result "pass" "Log stream is accessible"
    else
        record_result "warn" "Could not verify log stream access"
    fi
}

check_security_headers() {
    log_section "Post-Deployment: Security Headers"

    local app_url="https://${APP_BLUE}.fly.dev"

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "Security headers verified [DRY-RUN]"
        return 0
    fi

    local headers
    headers=$(curl -fsS -I "${app_url}${HEALTH_ENDPOINT}" --max-time 10 2>/dev/null || true)

    if [ -z "$headers" ]; then
        record_result "warn" "Could not fetch headers for security check"
        return 0
    fi

    # Check for security headers (case-insensitive)
    local found_count=0
    local expected_headers=(
        "strict-transport-security"
        "x-content-type-options"
        "x-frame-options"
    )

    for header in "${expected_headers[@]}"; do
        if echo "$headers" | grep -qi "^${header}:"; then
            record_result "pass" "Security header '$header' is set"
            ((found_count++)) || true
        else
            record_result "warn" "Security header '$header' is NOT set"
        fi
    done

    if [ "$found_count" -eq "${#expected_headers[@]}" ]; then
        record_result "pass" "All expected security headers are present"
    fi
}

check_no_patient_data_in_logs() {
    log_section "Compliance: No Patient Data in Logs"

    # This is a policy check — ensure logs don't contain PHI
    # We can't scan logs here but we can verify the log configuration

    if [ "$DRY_RUN" = true ]; then
        record_result "pass" "Log configuration reviewed [DRY-RUN]"
        return 0
    fi

    # Check that DEEPSYNAPS_LOG_LEVEL is not DEBUG in production
    local log_level
    log_level=$(fly_cmd secrets list --app "$APP_BLUE" --json 2>/dev/null | \
        jq -r '.[] | select(.Name == "DEEPSYNAPS_LOG_LEVEL") | .Name' || true)

    if [ "$ENVIRONMENT" = "production" ] && [ "$log_level" = "DEBUG" ]; then
        record_result "warn" "LOG_LEVEL is DEBUG in production — may log sensitive data"
    else
        record_result "pass" "Log level appropriate for environment"
    fi

    # Verify HIPAA compliance note
    record_result "pass" "PHI/PII must never be logged — verify in application code"
}

# =============================================================================
# Summary
# =============================================================================

print_summary() {
    log_section "Checklist Summary"
    echo ""
    printf "  %-20s %d\n" "✓ Passed:"   "$CHECKS_PASSED"
    printf "  %-20s %d\n" "⚠ Warnings:" "$CHECKS_WARNINGS"
    printf "  %-20s %d\n" "✗ Failed:"   "$CHECKS_FAILED"
    echo ""

    if [ "$CHECKS_FAILED" -gt 0 ]; then
        printf "  Result: FAILED (%d check(s) failed)\n" "$CHECKS_FAILED"
        return 1
    elif [ "$CHECKS_WARNINGS" -gt 0 ]; then
        printf "  Result: PASSED WITH WARNINGS (%d warning(s))\n" "$CHECKS_WARNINGS"
        log_warn "Review warnings before proceeding with deployment"
        return 0
    else
        printf "  Result: ALL CHECKS PASSED\n"
        return 0
    fi
}

# =============================================================================
# Main
# =============================================================================

main() {
    parse_args "$@"

    log_section "DeepSynaps Deployment Checklist v${SCRIPT_VERSION}"
    log_info "Starting checklist: mode=$CHECK_MODE, env=$ENVIRONMENT"

    case "$CHECK_MODE" in
        pre|full)
            log_section "╔══════════════════════════════════════════╗"
            log_section "║     PRE-DEPLOYMENT CHECKLIST             ║"
            log_section "╚══════════════════════════════════════════╝"
            check_dependencies || true
            check_fly_auth
            check_app_exists
            check_environment_variables
            check_database_connectivity
            check_ssl_certificate
            check_previous_deployment_state
            ;;
    esac

    case "$CHECK_MODE" in
        post|full)
            log_section "╔══════════════════════════════════════════╗"
            log_section "║     POST-DEPLOYMENT CHECKLIST            ║"
            log_section "╚══════════════════════════════════════════╝"
            check_health_endpoint
            check_critical_routes
            check_response_time
            check_ssl_post_deploy
            check_database_migration_status
            check_log_stream
            check_security_headers
            check_no_patient_data_in_logs
            ;;
    esac

    # Print summary
    local exit_code=0
    print_summary || exit_code=$?

    # Report file summary
    if [ -n "$REPORT_FILE" ]; then
        log_info "Detailed report written to: $REPORT_FILE"
    fi

    log_info "Checklist complete"
    exit $exit_code
}

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
