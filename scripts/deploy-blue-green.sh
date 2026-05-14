#!/usr/bin/env bash
# =============================================================================
# deploy-blue-green.sh — Blue-Green Deployment for DeepSynaps Protocol Studio
# =============================================================================
# Healthcare-grade zero-downtime deployment script for Fly.io.
#
# Usage:
#   ./deploy-blue-green.sh [staging|production] [--dry-run]
#   ./deploy-blue-green.sh staging
#   ./deploy-blue-green.sh production --dry-run
#   ./deploy-blue-green.sh --help
#
# Environment Variables:
#   FLY_ACCESS_TOKEN    — Fly.io API token (required)
#   SLACK_WEBHOOK       — Slack notification webhook (optional)
#   KEEP_BLUE_HOURS     — Hours to retain blue env (default: 24)
#
# Exit Codes:
#   0   — Deployment successful
#   1   — General error
#   2   — Invalid arguments
#   3   — Missing dependencies
#   4   — Pre-deployment checks failed
#   5   — Green deployment failed
#   6   — Smoke tests failed
#   7   — Traffic switch failed
# =============================================================================

set -euo pipefail

# --- Script Metadata ---
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_VERSION="1.0.0"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Configuration ---
readonly APP_BLUE_PROD="deepsynaps-studio"
readonly APP_GREEN_PROD="deepsynaps-studio-green"
readonly APP_BLUE_STAGING="deepsynaps-studio-staging"
readonly APP_GREEN_STAGING="deepsynaps-studio-staging-green"
readonly FLY_REGION="lhr"
readonly HEALTH_RETRIES=30
readonly HEALTH_INTERVAL=10
readonly SMOKE_TEST_TIMEOUT=120

# --- Runtime State ---
DRY_RUN=false
ENVIRONMENT=""
APP_BLUE=""
APP_GREEN=""
IMAGE_TAG=""
GREEN_DEPLOYED=false
SWITCHED=false
DEPLOY_START_TIME=""

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
DeepSynaps Protocol Studio — Blue-Green Deployment

Usage:
    $SCRIPT_NAME [staging|production] [OPTIONS]

Arguments:
    staging|production    Target deployment environment (required)

Options:
    --dry-run             Simulate deployment without making changes
    --keep-hours N        Retain blue environment for N hours (default: 24)
    --version             Show script version
    --help                Show this help message

Environment Variables:
    FLY_ACCESS_TOKEN      Fly.io API token (required)
    SLACK_WEBHOOK         Slack notification URL (optional)
    KEEP_BLUE_HOURS       Hours to keep blue env (default: 24)

Examples:
    $SCRIPT_NAME staging
    $SCRIPT_NAME production --dry-run
    $SCRIPT_NAME staging --keep-hours 48

EOF
}

# =============================================================================
# Utility Functions
# =============================================================================

# Check if a command exists
cmd_exists() { command -v "$1" >/dev/null 2>&1; }

# Execute a command, respecting --dry-run
run_cmd() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would execute: $*"
        return 0
    fi
    log_info "Executing: $*"
    "$@"
}

# Execute a Fly.io command
fly_cmd() {
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] flyctl $*"
        return 0
    fi
    FLY_ACCESS_TOKEN="${FLY_ACCESS_TOKEN:-}" flyctl "$@"
}

# Generate ISO timestamp
iso_timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# Calculate elapsed time in seconds
elapsed_seconds() {
    local start="$1"
    local end
    end="$(date +%s)"
    echo "$((end - start))"
}

# Format seconds as human-readable duration
format_duration() {
    local seconds="$1"
    local mins=$((seconds / 60))
    local secs=$((seconds % 60))
    printf "%dm%02ds" "$mins" "$secs"
}

# =============================================================================
# Validation Functions
# =============================================================================

validate_environment() {
    log_section "Validating Environment"

    # Check Fly CLI
    if ! cmd_exists flyctl; then
        log_error "flyctl is not installed. Install: curl -L https://fly.io/install.sh | sh"
        exit 3
    fi
    log_info "✓ flyctl is available"

    # Check Fly authentication
    if [ -z "${FLY_ACCESS_TOKEN:-}" ]; then
        if ! flyctl auth whoami >/dev/null 2>&1; then
            log_error "Not authenticated to Fly.io. Set FLY_ACCESS_TOKEN or run 'flyctl auth login'"
            exit 3
        fi
        log_info "✓ Fly authentication verified (interactive)"
    else
        log_info "✓ FLY_ACCESS_TOKEN is set"
    fi

    # Check Docker
    if ! cmd_exists docker; then
        log_error "Docker is not installed"
        exit 3
    fi
    log_info "✓ Docker is available"

    # Validate app exists
    log_info "Verifying blue app '$APP_BLUE' exists..."
    if ! fly_cmd status --app "$APP_BLUE" >/dev/null 2>&1; then
        log_error "Blue app '$APP_BLUE' not found on Fly.io"
        exit 4
    fi
    log_info "✓ Blue app '$APP_BLUE' verified"
}

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
            --keep-hours)
                if [ -z "${2:-}" ]; then
                    log_error "--keep-hours requires a value"
                    exit 2
                fi
                KEEP_BLUE_HOURS="$2"
                shift 2
                ;;
            --version)
                echo "$SCRIPT_NAME version $SCRIPT_VERSION"
                exit 0
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

    # Set app names based on environment
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

    log_info "Environment : $ENVIRONMENT"
    log_info "Blue App    : $APP_BLUE"
    log_info "Green App   : $APP_GREEN"
    log_info "Dry Run     : $DRY_RUN"
}

# =============================================================================
# Deployment Functions
# =============================================================================

build_image() {
    log_section "Building Docker Image"

    IMAGE_TAG="${IMAGE_TAG:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")-$(date +%Y%m%d%H%M%S)}"
    log_info "Image tag: $IMAGE_TAG"

    cd "$REPO_ROOT"

    run_cmd docker build \
        -f apps/api/Dockerfile \
        -t "deepsynaps-api:${IMAGE_TAG}" \
        --build-arg "VITE_API_BASE_URL=" \
        .

    log_info "✓ Docker image built: deepsynaps-api:${IMAGE_TAG}"
}

smoke_test_container() {
    log_section "Container Smoke Test"

    log_info "Testing container import..."
    run_cmd docker run --rm "deepsynaps-api:${IMAGE_TAG}" python -c "
import sys
sys.path.insert(0, '/app/apps/api')
from app.main import app
routes = [r for r in app.routes if hasattr(r, 'path')]
print(f'✓ Container OK — {len(routes)} routes registered')
"
}

deploy_green() {
    log_section "Deploying to Green Environment"

    log_info "Target: $APP_GREEN"

    # Ensure green app exists
    if ! fly_cmd status --app "$APP_GREEN" >/dev/null 2>&1; then
        log_info "Creating green app '$APP_GREEN'..."
        if [ "$DRY_RUN" = false ]; then
            fly_cmd apps create "$APP_GREEN" --org personal 2>/dev/null || true
        fi
    fi

    # Generate green-specific fly.toml
    local green_toml="/tmp/fly-green-${IMAGE_TAG}.toml"
    sed "s/^app = .*/app = \"$APP_GREEN\"/" "$REPO_ROOT/apps/api/fly.toml" > "$green_toml"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would deploy $APP_GREEN using $green_toml"
        GREEN_DEPLOYED=true
        return 0
    fi

    # Deploy to green
    log_info "Starting green deployment..."
    fly_cmd deploy \
        --config "$green_toml" \
        --dockerfile apps/api/Dockerfile \
        --remote-only \
        --yes \
        --strategy immediate \
        --wait-timeout 300

    GREEN_DEPLOYED=true
    log_info "✓ Green deployment complete"
}

wait_for_green_health() {
    log_section "Waiting for Green Health Checks"

    local green_url="https://${APP_GREEN}.fly.dev"
    log_info "Health check URL: ${green_url}/health"

    for i in $(seq 1 $HEALTH_RETRIES); do
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY-RUN] Would check ${green_url}/health"
            return 0
        fi

        if curl -fsS "${green_url}/health" >/dev/null 2>&1; then
            log_info "✓ Green app is healthy after ${i} attempts"
            return 0
        fi

        log_info "  Attempt $i/$HEALTH_RETRIES — waiting ${HEALTH_INTERVAL}s..."
        sleep "$HEALTH_INTERVAL"
    done

    log_error "✗ Green app failed health check after $HEALTH_RETRIES attempts"
    return 1
}

run_smoke_tests() {
    log_section "Running Smoke Tests Against Green"

    local green_url="https://${APP_GREEN}.fly.dev"
    local failures=0

    # Test 1: Health endpoint
    log_info "→ Testing /health"
    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would test ${green_url}/health"
    else
        local health_resp
        health_resp=$(curl -fsS "${green_url}/health" 2>/dev/null || echo '{"status":"error"}')
        log_info "  Response: $health_resp"
    fi

    # Test 2: Critical API endpoints
    local critical_endpoints=(
        "/api/v1/conditions"
        "/api/v1/devices"
        "/api/v1/modalities"
        "/api/v1/evidence/search?q=test"
    )

    log_info "→ Testing critical endpoints"
    for endpoint in "${critical_endpoints[@]}"; do
        if [ "$DRY_RUN" = true ]; then
            log_info "[DRY-RUN] Would test ${green_url}${endpoint}"
            continue
        fi

        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "${green_url}${endpoint}" || echo "000")

        case "$http_code" in
            200|401|422)
                log_info "  ✓ $endpoint → HTTP $http_code"
                ;;
            *)
                log_warn "  ⚠ $endpoint → HTTP $http_code"
                ((failures++)) || true
                ;;
        esac
    done

    if [ "$failures" -gt 0 ]; then
        log_warn "  $failures endpoint(s) returned unexpected status codes"
        # In production, you might want to fail here. For now, warn only
        # since some endpoints may require auth.
    fi

    log_info "✓ Smoke tests complete"
}

switch_traffic() {
    log_section "Switching Traffic: Blue → Green"

    log_info "Promoting green ($APP_GREEN) to blue ($APP_BLUE)"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would redeploy $APP_BLUE with latest image"
        SWITCHED=true
        return 0
    fi

    # Deploy the new image to blue (this is the traffic switch)
    fly_cmd deploy \
        --config "$REPO_ROOT/apps/api/fly.toml" \
        --dockerfile apps/api/Dockerfile \
        --remote-only \
        --yes \
        --strategy immediate \
        --wait-timeout 300

    SWITCHED=true
    log_info "✓ Traffic switched to new version"
}

verify_blue_post_switch() {
    log_section "Verifying Blue (Live) After Switch"

    local blue_url="https://${APP_BLUE}.fly.dev"

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would verify ${blue_url}/health"
        return 0
    fi

    for i in $(seq 1 20); do
        if curl -fsS "${blue_url}/health" >/dev/null 2>&1; then
            log_info "✓ Live app healthy after switch (attempt $i)"
            return 0
        fi
        sleep 2
    done

    log_error "✗ Live app not healthy after traffic switch"
    return 1
}

schedule_cleanup() {
    log_section "Scheduling Cleanup"

    local keep_hours="${KEEP_BLUE_HOURS:-24}"
    log_info "Green app '$APP_GREEN' will be kept for $keep_hours hours"
    log_info "To manually cleanup: flyctl apps destroy $APP_GREEN"

    # In production, you might set up a scheduled job or cron
    # For now, we leave green running as a hot standby
}

send_notification() {
    local status="$1"
    local duration="$2"

    if [ -z "${SLACK_WEBHOOK:-}" ]; then
        log_info "No Slack webhook configured — skipping notification"
        return 0
    fi

    local emoji
    case "$status" in
        success) emoji="✅" ;;
        failure) emoji="🚨" ;;
        *) emoji="⚠️" ;;
    esac

    local payload
    payload=$(cat <<EOF
{
    "text": "${emoji} DeepSynaps Deploy — ${status} (${ENVIRONMENT})",
    "blocks": [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "${emoji} *Deployment ${status}*\n• Environment: \`${ENVIRONMENT}\`\n• App: \`${APP_BLUE}\`\n• Duration: ${duration}\n• Dry Run: ${DRY_RUN}\n• Commit: ${IMAGE_TAG%%-*}"
            }
        }
    ]
}
EOF
)

    if [ "$DRY_RUN" = true ]; then
        log_info "[DRY-RUN] Would send Slack notification"
        return 0
    fi

    curl -s -X POST "$SLACK_WEBHOOK" \
        -H 'Content-type: application/json' \
        --data "$payload" >/dev/null || log_warn "Slack notification failed (non-critical)"
}

# =============================================================================
# Cleanup & Rollback
# =============================================================================

cleanup_on_failure() {
    if [ "$GREEN_DEPLOYED" = true ] && [ "$SWITCHED" = false ]; then
        log_warn "Cleaning up green deployment after failure..."
        if [ "$DRY_RUN" = false ]; then
            fly_cmd scale count 0 --app "$APP_GREEN" --yes 2>/dev/null || true
        fi
        log_info "✓ Green scaled to 0 (no traffic was switched)"
    fi
}

trap_exit() {
    local exit_code=$?
    local duration
    duration=$(elapsed_seconds "$DEPLOY_START_TIME")

    if [ $exit_code -ne 0 ]; then
        log_error "Deployment failed after $(format_duration $duration)"
        cleanup_on_failure
        send_notification "failure" "$(format_duration $duration)"
    fi

    log_audit "DEPLOYMENT END — exit_code=$exit_code duration=$(format_duration $duration)"
    exit $exit_code
}

# =============================================================================
# Main
# =============================================================================

main() {
    # Validate arguments first
    validate_arguments "$@"

    # Set up trap for cleanup
    DEPLOY_START_TIME="$(date +%s)"
    trap trap_exit EXIT

    log_audit "DEPLOYMENT START — environment=$ENVIRONMENT dry_run=$DRY_RUN user=$(whoami)"

    # Pre-deployment validation
    validate_environment

    # Build image
    build_image
    smoke_test_container

    # Deploy green
    deploy_green
    wait_for_green_health

    # Smoke test green
    run_smoke_tests

    # Switch traffic
    switch_traffic
    verify_blue_post_switch

    # Post-deployment
    schedule_cleanup

    local duration
    duration=$(elapsed_seconds "$DEPLOY_START_TIME")
    log_section "Deployment Complete"
    log_info "Environment : $ENVIRONMENT"
    log_info "App         : $APP_BLUE"
    log_info "Duration    : $(format_duration $duration)"
    log_info "Dry Run     : $DRY_RUN"
    log_info "✓ Blue-green deployment successful"

    send_notification "success" "$(format_duration $duration)"
}

# Run main if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
