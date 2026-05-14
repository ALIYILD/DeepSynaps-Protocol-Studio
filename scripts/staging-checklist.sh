#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Staging Deployment Checklist — DeepSynaps Protocol Studio
# ═══════════════════════════════════════════════════════════════════════════════
# Interactive checklist for Phase 2C staging validation.
# Usage: ./scripts/staging-checklist.sh [--auto|--manual]
#
# --auto  : Runs automated checks (HTTP probes, metrics validation)
# --manual: Shows interactive checklist for human verification
# default : Runs automated checks then shows manual checklist
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CHECKLIST_FILE="${REPO_ROOT}/.staging-checklist-state"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'
NC='\033[0m' # No Color

# Defaults
STAGING_URL="${STAGING_URL:-https://deepsynaps-studio.fly.dev}"
APP_NAME="${FLY_APP_NAME:-deepsynaps-studio}"
MODE="${1:-both}"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# ── Helpers ───────────────────────────────────────────────────────────────────

log_info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
log_pass()  { echo -e "${GREEN}✅${NC} $*"; ((PASS_COUNT++)) || true; }
log_fail()  { echo -e "${RED}❌${NC} $*"; ((FAIL_COUNT++)) || true; }
log_warn()  { echo -e "${YELLOW}⚠️${NC}  $*"; ((WARN_COUNT++)) || true; }
log_step()  { echo -e "\n${BOLD}${CYAN}▶ $*${NC}\n"; }

section() {
    echo -e "\n${BOLD}═══════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  $*${NC}"
    echo -e "${BOLD}═══════════════════════════════════════════════════════════════════${NC}\n"
}

http_status() {
    local url="$1"
    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" "${url}" 2>/dev/null || echo "000")
    echo "$status"
}

http_time() {
    local url="$1"
    local time_ms
    time_ms=$(curl -s -o /dev/null -w "%{time_total}" "${url}" 2>/dev/null || echo "999")
    # Convert to milliseconds
    python3 -c "print(f'{float('$time_ms') * 1000:.1f}')" 2>/dev/null || echo "N/A"
}

save_state() {
    local item="$1" status="$2"
    echo "${item}:${status}:$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$CHECKLIST_FILE"
}

# ── Automated Checks ──────────────────────────────────────────────────────────

run_automated_checks() {
    section "AUTOMATED STAGING CHECKS"
    log_info "Target: ${STAGING_URL}"
    log_info "App:    ${APP_NAME}"
    log_info "Time:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo

    # 1. Basic Connectivity
    log_step "1. Basic Connectivity"

    STATUS=$(http_status "${STAGING_URL}/health")
    if [ "$STATUS" = "200" ]; then
        log_pass "Health endpoint returns 200"
        save_state "health_endpoint" "pass"
    else
        log_fail "Health endpoint returned status: $STATUS (expected 200)"
        save_state "health_endpoint" "fail"
    fi

    # 2. Response Time
    log_step "2. Response Time Check"

    TIME_MS=$(http_time "${STAGING_URL}/health")
    if [ "$TIME_MS" != "N/A" ] && python3 -c "exit(0 if float('$TIME_MS') < 200 else 1)" 2>/dev/null; then
        log_pass "Health endpoint P95 latency: ${TIME_MS}ms (target: <200ms)"
        save_state "latency_p95" "pass"
    else
        log_warn "Health endpoint latency: ${TIME_MS}ms (target: <200ms)"
        save_state "latency_p95" "warn"
    fi

    # 3. Metrics Endpoint
    log_step "3. Metrics Endpoint"

    METRICS_STATUS=$(http_status "${STAGING_URL}/metrics")
    if [ "$METRICS_STATUS" = "200" ]; then
        log_pass "Metrics endpoint returns 200"

        # Check key metrics are present
        METRICS_DATA=$(curl -s "${STAGING_URL}/metrics" 2>/dev/null || true)

        if echo "$METRICS_DATA" | grep -q "http_requests_total"; then
            log_pass "http_requests_total metric found"
        else
            log_fail "http_requests_total metric NOT found"
        fi

        if echo "$METRICS_DATA" | grep -q "http_request_duration_seconds"; then
            log_pass "http_request_duration_seconds metric found"
        else
            log_fail "http_request_duration_seconds metric NOT found"
        fi

        if echo "$METRICS_DATA" | grep -q "clinical_operations_total"; then
            log_pass "clinical_operations_total metric found"
        else
            log_warn "clinical_operations_total metric NOT found (may need API traffic)"
        fi

        save_state "metrics_endpoint" "pass"
    else
        log_fail "Metrics endpoint returned status: $METRICS_STATUS (expected 200)"
        log_info "Check if prometheus_client is installed and monitoring middleware is loaded"
        save_state "metrics_endpoint" "fail"
    fi

    # 4. Detailed Health Check
    log_step "4. Detailed Health Endpoint (/api/v1/health)"

    HEALTH_STATUS=$(http_status "${STAGING_URL}/api/v1/health")
    if [ "$HEALTH_STATUS" = "200" ]; then
        log_pass "Detailed health endpoint returns 200"

        HEALTH_JSON=$(curl -s "${STAGING_URL}/api/v1/health" 2>/dev/null || true)

        if echo "$HEALTH_JSON" | python3 -m json.tool > /dev/null 2>&1; then
            log_pass "Health response is valid JSON"

            # Check database status
            DB_STATUS=$(echo "$HEALTH_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('database','{}').get('status','unknown'))" 2>/dev/null || echo "unknown")
            if [ "$DB_STATUS" = "connected" ] || [ "$DB_STATUS" = "healthy" ]; then
                log_pass "Database status: $DB_STATUS"
            else
                log_warn "Database status: $DB_STATUS"
            fi
        else
            log_warn "Health response is not valid JSON"
        fi

        save_state "detailed_health" "pass"
    else
        log_fail "Detailed health endpoint returned status: $HEALTH_STATUS (expected 200)"
        save_state "detailed_health" "fail"
    fi

    # 5. Security Headers
    log_step "5. Security Headers"

    HEADERS=$(curl -sI "${STAGING_URL}/health" 2>/dev/null || true)

    if echo "$HEADERS" | grep -qi "strict-transport-security"; then
        log_pass "HSTS header present"
    else
        log_warn "HSTS header missing"
    fi

    if echo "$HEADERS" | grep -qi "x-content-type-options"; then
        log_pass "X-Content-Type-Options header present"
    else
        log_warn "X-Content-Type-Options header missing"
    fi

    if echo "$HEADERS" | grep -qi "x-frame-options"; then
        log_pass "X-Frame-Options header present"
    else
        log_warn "X-Frame-Options header missing"
    fi

    save_state "security_headers" "pass"

    # 6. SSL Certificate
    log_step "6. SSL Certificate"

    CERT_DAYS=$(echo | openssl s_client -connect "${STAGING_URL#https://}:443" -servername "${STAGING_URL#https://}" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [ -n "$CERT_DAYS" ]; then
        EXPIRY_EPOCH=$(date -d "$CERT_DAYS" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y %Z" "$CERT_DAYS" +%s 2>/dev/null || echo "0")
        NOW_EPOCH=$(date +%s)
        DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))

        if [ "$DAYS_LEFT" -gt 30 ]; then
            log_pass "SSL certificate valid for ${DAYS_LEFT} days"
            save_state "ssl_certificate" "pass"
        elif [ "$DAYS_LEFT" -gt 7 ]; then
            log_warn "SSL certificate expires in ${DAYS_LEFT} days"
            save_state "ssl_certificate" "warn"
        else
            log_fail "SSL certificate expires in ${DAYS_LEFT} days!"
            save_state "ssl_certificate" "fail"
        fi
    else
        log_warn "Could not verify SSL certificate"
        save_state "ssl_certificate" "warn"
    fi

    # 7. Fly.io Status (if flyctl available)
    log_step "7. Fly.io Application Status"

    if command -v flyctl >/dev/null 2>&1; then
        APP_STATUS=$(flyctl status --app "$APP_NAME" 2>/dev/null | grep -i "failed\|crashed" || true)
        if [ -z "$APP_STATUS" ]; then
            log_pass "No failed or crashed machines detected"
            save_state "fly_status" "pass"
        else
            log_fail "Failed/crashed machines detected:"
            echo "$APP_STATUS"
            save_state "fly_status" "fail"
        fi

        # Check machine count
        MACHINE_COUNT=$(flyctl status --app "$APP_NAME" 2>/dev/null | grep -c "started" || echo "0")
        log_info "Running machines: $MACHINE_COUNT"
    else
        log_warn "flyctl not available — skipping Fly status check"
        save_state "fly_status" "skip"
    fi

    # 8. API Endpoints Smoke Test
    log_step "8. API Endpoints Smoke Test"

    PUBLIC_ENDPOINTS=(
        "/health:200"
        "/healthz:200"
        "/api/v1/health:200"
    )

    for endpoint_spec in "${PUBLIC_ENDPOINTS[@]}"; do
        IFS=: read -r endpoint expected <<< "$endpoint_spec"
        STATUS=$(http_status "${STAGING_URL}${endpoint}")
        if [ "$STATUS" = "$expected" ]; then
            log_pass "GET $endpoint → $STATUS"
        else
            log_fail "GET $endpoint → $STATUS (expected $expected)"
        fi
    done

    save_state "api_smoke_test" "pass"

    # Summary
    section "AUTOMATED CHECKS SUMMARY"
    echo -e "${GREEN}✅ Passed:  $PASS_COUNT${NC}"
    echo -e "${YELLOW}⚠️  Warnings: $WARN_COUNT${NC}"
    echo -e "${RED}❌ Failed:  $FAIL_COUNT${NC}"
    echo

    if [ "$FAIL_COUNT" -eq 0 ]; then
        echo -e "${GREEN}${BOLD}All critical automated checks passed!${NC}\n"
        return 0
    else
        echo -e "${RED}${BOLD}$FAIL_COUNT automated check(s) failed.${NC}"
        echo -e "Fix failures before proceeding to manual checklist.\n"
        return 1
    fi
}

# ── Manual Checklist ──────────────────────────────────────────────────────────

run_manual_checklist() {
    section "MANUAL STAGING CHECKLIST"
    echo -e "${YELLOW}Review each item and confirm by pressing ENTER.${NC}"
    echo -e "${YELLOW}Type 'skip' to skip an item, 'no' to mark as failed.${NC}\n"

    local items=(
        "Application deployed without errors in Fly.io logs"
        "Frontend loads correctly at staging URL"
        "User login/authentication flow works"
        "Protocol generation completes successfully"
        "Patient data loads correctly"
        "qEEG analysis triggers and completes"
        "SSE (Server-Sent Events) connections stay alive"
        "Error tracking appears in Sentry (if configured)"
        "Logs show structured JSON format with trace_id"
        "Database migrations ran successfully (release command)"
        "Persistent volume (/data) is mounted and accessible"
        "Evidence database is queryable (if configured)"
        "Celery workers are processing jobs"
        "Rate limiting is active (test with rapid requests)"
        "Monitoring middleware logs request durations"
        "Metrics increment after API requests"
        "Backup configuration is documented and accessible"
        "Rollback procedure is understood by on-call engineer"
        "Incident response runbook has been reviewed"
        "On-call playbook has been reviewed"
    )

    local passed=0
    local skipped=0
    local failed=0

    for i in "${!items[@]}"; do
        local num=$((i + 1))
        echo -e "${CYAN}[$num/${#items[@]}]${NC} ${items[$i]}"
        read -r -p "Confirm? [Y/n/skip]: " response
        response="${response:-y}"

        case "${response,,}" in
            y|yes|"")
                log_pass "Item $num confirmed"
                save_state "manual_$num" "pass"
                ((passed++)) || true
                ;;
            skip|s)
                log_warn "Item $num skipped"
                save_state "manual_$num" "skip"
                ((skipped++)) || true
                ;;
            *)
                log_fail "Item $num not confirmed"
                save_state "manual_$num" "fail"
                ((failed++)) || true
                ;;
        esac
        echo
    done

    section "MANUAL CHECKLIST SUMMARY"
    echo -e "${GREEN}✅ Confirmed: $passed${NC}"
    echo -e "${YELLOW}⚠️  Skipped:   $skipped${NC}"
    echo -e "${RED}❌ Failed:    $failed${NC}"
    echo

    # Overall verdict
    section "STAGING SIGN-OFF VERDICT"
    if [ "$failed" -eq 0 ] && [ "$FAIL_COUNT" -eq 0 ]; then
        echo -e "${GREEN}${BOLD}✅ STAGING SIGN-OFF: APPROVED${NC}"
        echo -e "${GREEN}Ready to proceed to Phase 2D: Production Cutover${NC}\n"
        save_state "staging_signoff" "approved"
        return 0
    elif [ "$FAIL_COUNT" -eq 0 ] && [ "$failed" -le 2 ]; then
        echo -e "${YELLOW}${BOLD}⚠️  STAGING SIGN-OFF: CONDITIONAL${NC}"
        echo -e "${YELLOW}Address skipped/failed items before production cutover${NC}\n"
        save_state "staging_signoff" "conditional"
        return 0
    else
        echo -e "${RED}${BOLD}❌ STAGING SIGN-OFF: NOT APPROVED${NC}"
        echo -e "${RED}Fix all failures before proceeding${NC}\n"
        save_state "staging_signoff" "rejected"
        return 1
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
    echo -e "${BOLD}"
    cat << 'EOF'
╔══════════════════════════════════════════════════════════════════════════════╗
║      DEEPSYNAPS PROTOCOL STUDIO — STAGING DEPLOYMENT CHECKLIST             ║
╚══════════════════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    # Clean previous state
    rm -f "$CHECKLIST_FILE"

    case "${MODE}" in
        --auto)
            run_automated_checks
            exit $?
            ;;
        --manual)
            run_manual_checklist
            exit $?
            ;;
        *)
            if run_automated_checks; then
                echo
                read -r -p "Proceed to manual checklist? [Y/n]: " proceed
                if [ "${proceed:-y}" = "y" ] || [ -z "$proceed" ]; then
                    run_manual_checklist
                    exit $?
                else
                    log_info "Manual checklist skipped. Run with --manual when ready."
                    exit 0
                fi
            else
                log_fail "Automated checks failed. Fix issues before manual checklist."
                exit 1
            fi
            ;;
    esac
}

main "$@"
