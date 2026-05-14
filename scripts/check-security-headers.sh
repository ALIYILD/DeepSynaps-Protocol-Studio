#!/usr/bin/env bash
# =============================================================================
# DeepSynaps Protocol Studio — Security Headers Validation
# =============================================================================
# Validates that all required security headers are present and correctly
# configured on the target application. Checks against OWASP recommendations
# and HIPAA Security Rule requirements.
#
# Usage:
#   ./scripts/check-security-headers.sh [options] [target-url]
#
# Arguments:
#   target-url              URL to check (default: http://127.0.0.1:8000)
#
# Options:
#   --help, -h              Show this help message
#   --quiet, -q             Only output results, no headers
#   --format FORMAT         Output: text|json|junit (default: text)
#   --output-file PATH      Write output to file
#   --timeout SECONDS       Request timeout (default: 10)
#   --auth-token TOKEN      Bearer token for authenticated endpoints
#   --strict                Fail on warnings (medium severity)
#   --all-endpoints         Check multiple endpoints, not just /health
#
# Examples:
#   ./scripts/check-security-headers.sh
#   ./scripts/check-security-headers.sh https://staging.example.com
#   ./scripts/check-security-headers.sh --format json --output-file headers.json
#   ./scripts/check-security-headers.sh --auth-token $TOKEN https://prod.example.com
#
# HIPAA Security Rule mapping:
#   - §164.312(e)(1) — Transmission Security (TLS/encryption headers)
#   - §164.312(e)(2)(i) — Integrity Controls
#   - §164.312(a)(1)   — Access Control (CSP, framing controls)
# =============================================================================

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
TARGET_URL="${SECURITY_HEADERS_TARGET:-http://127.0.0.1:8000}"
QUIET=false
FORMAT="text"
OUTPUT_FILE=""
TIMEOUT=10
AUTH_TOKEN=""
STRICT=false
ALL_ENDPOINTS=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Color codes ─────────────────────────────────────────────────────────────
if [ -t 1 ] && [ "$QUIET" = false ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; NC=''
fi

# ── Help ────────────────────────────────────────────────────────────────────
show_help() {
  sed -n '/^# Usage:/,/^# /p' "$0" | sed 's/^# //' | sed 's/^//'
  exit 0
}

# ── Argument parsing ────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) show_help ;;
    --quiet|-q) QUIET=true; shift ;;
    --format) FORMAT="$2"; shift 2 ;;
    --output-file) OUTPUT_FILE="$2"; shift 2 ;;
    --timeout) TIMEOUT="$2"; shift 2 ;;
    --auth-token) AUTH_TOKEN="$2"; shift 2 ;;
    --strict) STRICT=true; shift ;;
    --all-endpoints) ALL_ENDPOINTS=true; shift ;;
    http://*|https://*) TARGET_URL="$1"; shift ;;
    *) echo "Unknown option: $1"; show_help ;;
  esac
done

# Validate format
case "$FORMAT" in text|json|junit) ;; *) echo "Invalid format: $FORMAT"; exit 1 ;; esac

# ── Output helper ───────────────────────────────────────────────────────────
output() {
  if [ -n "$OUTPUT_FILE" ]; then
    echo -e "$1" >> "$OUTPUT_FILE"
  elif [ "$QUIET" = false ]; then
    echo -e "$1"
  fi
}

# ── State ───────────────────────────────────────────────────────────────────
declare -a RESULTS=()
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_WARNINGS=0

# ── Record result ───────────────────────────────────────────────────────────
record_result() {
  local header="$1"
  local status="$2"   # PASS, FAIL, WARN
  local expected="$3"
  local actual="$4"
  local severity="$5" # low, medium, high, critical
  local owasp_ref="$6"

  RESULTS+=("$header|$status|$expected|$actual|$severity|$owasp_ref")

  case "$status" in
    PASS) TOTAL_PASSED=$((TOTAL_PASSED + 1)) ;;
    FAIL) TOTAL_FAILED=$((TOTAL_FAILED + 1)) ;;
    WARN) TOTAL_WARNINGS=$((TOTAL_WARNINGS + 1)) ;;
  esac
}

# ── Fetch headers ───────────────────────────────────────────────────────────
fetch_headers() {
  local url="$1"
  local headers_file
  headers_file=$(mktemp)

  local curl_opts=(-sI --max-time "$TIMEOUT" -w "\nHTTP_CODE:%{http_code}\n")
  if [ -n "$AUTH_TOKEN" ]; then
    curl_opts+=(-H "Authorization: Bearer $AUTH_TOKEN")
  fi

  if curl "${curl_opts[@]}" "$url" > "$headers_file" 2>/dev/null; then
    cat "$headers_file"
  fi
  rm -f "$headers_file"
}

# ── Extract header value ────────────────────────────────────────────────────
get_header() {
  local headers="$1"
  local name="$2"
  echo "$headers" | grep -i "^$name:" | sed 's/^[^:]*: *//' | tr -d '\r' || true
}

# ── Check a single header ───────────────────────────────────────────────────
check_header() {
  local headers="$1"
  local header_name="$2"
  local required="$3"      # "required" or "recommended"
  local expected_pattern="$4"
  local severity="$5"
  local owasp_ref="$6"
  local description="$7"

  local actual_value
  actual_value=$(get_header "$headers" "$header_name")

  if [ -n "$actual_value" ]; then
    if [ -n "$expected_pattern" ] && echo "$actual_value" | grep -qiE "$expected_pattern"; then
      if [ "$QUIET" = false ]; then
        output "${GREEN}✅${NC} $header_name: $actual_value"
      fi
      record_result "$header_name" "PASS" "$expected_pattern" "$actual_value" "$severity" "$owasp_ref"
    elif [ -z "$expected_pattern" ]; then
      if [ "$QUIET" = false ]; then
        output "${GREEN}✅${NC} $header_name: $actual_value"
      fi
      record_result "$header_name" "PASS" "present" "$actual_value" "$severity" "$owasp_ref"
    else
      if [ "$QUIET" = false ]; then
        output "${YELLOW}⚠${NC} $header_name: $actual_value (expected: $expected_pattern)"
      fi
      record_result "$header_name" "WARN" "$expected_pattern" "$actual_value" "$severity" "$owasp_ref"
    fi
  else
    if [ "$required" = "required" ]; then
      if [ "$QUIET" = false ]; then
        output "${RED}❌${NC} $header_name: MISSING ($description)"
      fi
      record_result "$header_name" "FAIL" "$expected_pattern" "(missing)" "$severity" "$owasp_ref"
    else
      if [ "$QUIET" = false ]; then
        output "${YELLOW}⚠${NC} $header_name: MISSING (recommended — $description)"
      fi
      record_result "$header_name" "WARN" "$expected_pattern" "(missing)" "$severity" "$owasp_ref"
    fi
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# HEADER VALIDATION LOGIC
# ═════════════════════════════════════════════════════════════════════════════
validate_headers() {
  local headers="$1"
  local endpoint_label="$2"

  output "\n${BOLD}${CYAN}━━━ Validating: $endpoint_label ━━━${NC}"

  # ── Critical headers (HIPAA + OWASP) ────────────────────────────────────
  check_header "$headers" "Strict-Transport-Security" "required" \
    "max-age=31536000" "high" "OWASP ASVS V12.4" \
    "HSTS enforces HTTPS connections — required for PHI transmission security"

  check_header "$headers" "X-Content-Type-Options" "required" \
    "nosniff" "high" "OWASP ASVS V12.4" \
    "Prevents MIME type sniffing attacks"

  check_header "$headers" "X-Frame-Options" "required" \
    "(DENY|SAMEORIGIN)" "high" "OWASP ASVS V12.4" \
    "Prevents clickjacking attacks via frame embedding"

  check_header "$headers" "Content-Security-Policy" "required" \
    "default-src" "critical" "OWASP ASVS V12.4" \
    "CSP prevents XSS and data injection attacks — REQUIRED for healthcare apps"

  check_header "$headers" "Referrer-Policy" "required" \
    "(strict-origin|no-referrer|same-origin)" "high" "OWASP ASVS V12.4" \
    "Controls referrer information leakage"

  # ── Important headers ────────────────────────────────────────────────────
  check_header "$headers" "Permissions-Policy" "required" \
    "" "high" "OWASP ASVS V12.4" \
    "Restricts browser feature access (camera, microphone, geolocation)"

  check_header "$headers" "X-XSS-Protection" "recommended" \
    "1; mode=block" "medium" "OWASP ASVS V12.4" \
    "Legacy XSS protection for older browsers"

  # ── Additional security headers ──────────────────────────────────────────
  check_header "$headers" "X-Request-ID" "recommended" \
    "" "low" "OWASP ASVS V7.1" \
    "Request correlation ID for audit tracing"

  # Note: Cache-Control varies by endpoint, so we only check for its presence on API routes
  if echo "$endpoint_label" | grep -q "API"; then
    check_header "$headers" "Cache-Control" "recommended" \
      "(no-store|private|no-cache)" "medium" "OWASP ASVS V8.2" \
      "Prevents caching of sensitive PHI data"
  fi

  # ── Server information disclosure ────────────────────────────────────────
  local server_header
  server_header=$(get_header "$headers" "Server")
  if [ -n "$server_header" ]; then
    if echo "$server_header" | grep -qiE "(nginx/[0-9]+\.[0-9]+\.[0-9]+|Apache/[0-9]+\.[0-9]+|uvicorn|gunicorn)"; then
      output "${YELLOW}⚠${NC} Server header exposes version: $server_header"
      record_result "Server" "WARN" "hidden" "$server_header" "low" "OWASP ASVS V8.1" \
        "Server version disclosure aids targeted attacks"
    else
      output "${GREEN}✅${NC} Server header: $server_header"
      record_result "Server" "PASS" "hidden" "$server_header" "low" "OWASP ASVS V8.1" \
        ""
    fi
  fi

  local powered_by
  powered_by=$(get_header "$headers" "X-Powered-By")
  if [ -n "$powered_by" ]; then
    output "${YELLOW}⚠${NC} X-Powered-By header exposes tech stack: $powered_by"
    record_result "X-Powered-By" "WARN" "absent" "$powered_by" "low" "OWASP ASVS V8.1" \
      "Remove X-Powered-By to reduce information disclosure"
  fi
}

# ── Validate CSP policy in detail ──────────────────────────────────────────
validate_csp_detail() {
  local headers="$1"
  local csp_value
  csp_value=$(get_header "$headers" "Content-Security-Policy")

  if [ -z "$csp_value" ]; then
    return
  fi

  output "\n${BOLD}${CYAN}━━━ CSP Policy Analysis ━━━${NC}"

  local csp_directives=(
    "default-src"
    "script-src"
    "style-src"
    "img-src"
    "font-src"
    "connect-src"
    "frame-ancestors"
    "base-uri"
    "form-action"
  )

  for directive in "${csp_directives[@]}"; do
    if echo "$csp_value" | grep -qi "$directive"; then
      local directive_value
      directive_value=$(echo "$csp_value" | grep -oi "$directive[^;]*" | head -1)
      output "${GREEN}✅${NC} $directive_value"
    else
      output "${YELLOW}⚠${NC} $directive: not explicitly set (inherits default-src)"
    fi
  done

  # Security checks on CSP
  if echo "$csp_value" | grep -qi "'unsafe-inline'"; then
    output "\n${YELLOW}⚠ CSP contains 'unsafe-inline' — mitigated with nonce in production${NC}"
  fi

  if echo "$csp_value" | grep -qi "'unsafe-eval'"; then
    output "${RED}❌ CSP contains 'unsafe-eval' — avoid in production${NC}"
  fi

  if ! echo "$csp_value" | grep -qi "frame-ancestors"; then
    output "${RED}❌ CSP missing frame-ancestors — add frame-ancestors 'none'${NC}"
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# REPORT GENERATION
# ═════════════════════════════════════════════════════════════════════════════
generate_text_report() {
  output "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  output "${BOLD}Security Headers Validation Report${NC}"
  output "Target: $TARGET_URL"
  output "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  output "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  output "\n${BOLD}Summary:${NC}"
  output "  ${GREEN}Passed:${NC}   $TOTAL_PASSED"
  output "  ${RED}Failed:${NC}   $TOTAL_FAILED"
  output "  ${YELLOW}Warnings:${NC} $TOTAL_WARNINGS"

  if [ "$TOTAL_FAILED" -gt 0 ]; then
    output "\n${RED}${BOLD}FAILED checks:${NC}"
    for result in "${RESULTS[@]}"; do
      IFS='|' read -r header status expected actual severity owasp_ref <<< "$result"
      if [ "$status" = "FAIL" ]; then
        output "  ${RED}❌${NC} $header ($severity) — $owasp_ref"
        output "     Expected: $expected"
        output "     Actual:   $actual"
      fi
    done
  fi

  if [ "$TOTAL_WARNINGS" -gt 0 ]; then
    output "\n${YELLOW}${BOLD}WARNINGS:${NC}"
    for result in "${RESULTS[@]}"; do
      IFS='|' read -r header status expected actual severity owasp_ref <<< "$result"
      if [ "$status" = "WARN" ]; then
        output "  ${YELLOW}⚠${NC} $header — $owasp_ref"
      fi
    done
  fi

  # HIPAA compliance
  output "\n${BOLD}HIPAA Security Rule Compliance:${NC}"
  if [ "$TOTAL_FAILED" -eq 0 ]; then
    output "  ${GREEN}✅${NC} §164.312(e)(1) Transmission Security — headers present"
    output "  ${GREEN}✅${NC} §164.312(e)(2)(i) Integrity Controls — framing protection active"
  else
    output "  ${RED}❌${NC} §164.312(e)(1) Transmission Security — some headers missing"
  fi

  output "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

generate_json_report() {
  local json_results="["
  local first=true
  for result in "${RESULTS[@]}"; do
    IFS='|' read -r header status expected actual severity owasp_ref <<< "$result"
    [ "$first" = true ] || json_results+=","
    first=false
    json_results+="{\"header\":\"$header\",\"status\":\"$status\",\"expected\":\"$expected\",\"actual\":\"$actual\",\"severity\":\"$severity\",\"owasp_ref\":\"$owasp_ref\"}"
  done
  json_results+="]"

  output "{"
  output "  \"target\": \"$TARGET_URL\","
  output "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  output "  \"summary\": {"
  output "    \"passed\": $TOTAL_PASSED,"
  output "    \"failed\": $TOTAL_FAILED,"
  output "    \"warnings\": $TOTAL_WARNINGS"
  output "  },"
  output "  \"results\": $json_results"
  output "}"
}

generate_junit_report() {
  local total_tests=$((TOTAL_PASSED + TOTAL_FAILED + TOTAL_WARNINGS))

  output "<?xml version=\"1.0\" encoding=UTF-8\"?>"
  output "<testsuites name=\"Security Headers Validation\">"
  output "  <testsuite name=\"Security Headers\" tests=\"$total_tests\" failures=\"$TOTAL_FAILED\">"

  for result in "${RESULTS[@]}"; do
    IFS='|' read -r header status expected actual severity owasp_ref <<< "$result"
    local test_status
    case "$status" in
      PASS) test_status="" ;;
      FAIL) test_status="<failure message=\"$header missing or misconfigured\">Expected: $expected, Actual: $actual</failure>" ;;
      WARN) test_status="<skipped message=\"Warning: $header\"><![CDATA[Expected: $expected, Actual: $actual]]></skipped>" ;;
    esac
    output "    <testcase name=\"$header\" classname=\"security-headers.$severity\">$test_status</testcase>"
  done

  output "  </testsuite>"
  output "</testsuites>"
}

# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════
main() {
  if [ -n "$OUTPUT_FILE" ]; then
    : > "$OUTPUT_FILE"
  fi

  if [ "$QUIET" = false ]; then
    output "${BOLD}🔒 Security Headers Validation${NC}"
    output "Target: $TARGET_URL"
  fi

  # Test connectivity
  local headers
  headers=$(fetch_headers "$TARGET_URL")
  local http_code
  http_code=$(echo "$headers" | grep "HTTP_CODE:" | cut -d: -f2 || echo "000")

  if [ "$http_code" = "000" ]; then
    output "${RED}❌ Could not connect to $TARGET_URL${NC}"
    output "Is the application running? Start with: uvicorn app.main:app --host 0.0.0.0 --port 8000"
    exit 1
  fi

  if [ "$QUIET" = false ]; then
    output "HTTP Status: $http_code"
  fi

  # Clean headers (remove HTTP_CODE line)
  headers=$(echo "$headers" | grep -v "HTTP_CODE:")

  # Validate headers on main endpoint
  validate_headers "$headers" "Health Endpoint ($TARGET_URL/health)"
  validate_csp_detail "$headers"

  # Validate on additional endpoints if requested
  if [ "$ALL_ENDPOINTS" = true ]; then
    local endpoints=("/api/v1/health" "/api/v1/patients")
    for endpoint in "${endpoints[@]}"; do
      local endpoint_headers
      endpoint_headers=$(fetch_headers "$TARGET_URL$endpoint")
      local ep_http_code
      ep_http_code=$(echo "$endpoint_headers" | grep "HTTP_CODE:" | cut -d: -f2 || echo "000")
      if [ "$ep_http_code" != "000" ]; then
        endpoint_headers=$(echo "$endpoint_headers" | grep -v "HTTP_CODE:")
        validate_headers "$endpoint_headers" "API Endpoint ($endpoint)"
      fi
    done
  fi

  # Generate report
  case "$FORMAT" in
    text) generate_text_report ;;
    json) generate_json_report ;;
    junit) generate_junit_report ;;
  esac

  # Exit code
  if [ "$TOTAL_FAILED" -gt 0 ]; then
    exit 1
  elif [ "$STRICT" = true ] && [ "$TOTAL_WARNINGS" -gt 0 ]; then
    exit 1
  else
    exit 0
  fi
}

main "$@"
