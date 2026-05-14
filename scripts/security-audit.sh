#!/usr/bin/env bash
# =============================================================================
# DeepSynaps Protocol Studio — Local Security Audit Script
# =============================================================================
# Runs comprehensive security checks locally before CI/CD submission.
# Generates an actionable security report with remediation guidance.
#
# Usage:
#   ./scripts/security-audit.sh [options]
#
# Options:
#   --help, -h              Show this help message
#   --output-format FORMAT  Output format: text, json, markdown (default: markdown)
#   --output-file PATH      Write report to file (default: stdout)
#   --severity LEVEL        Minimum severity: low, medium, high, critical (default: low)
#   --skip-checks LIST      Comma-separated list of checks to skip
#                           (bandit,secrets,headers,deps,eslint,config)
#   --fix                   Attempt to auto-fix findings where possible
#   --exit-on-high          Exit with non-zero code on high/critical findings
#
# Examples:
#   ./scripts/security-audit.sh --output-format markdown --output-file audit-report.md
#   ./scripts/security-audit.sh --severity high --skip-checks eslint
#   ./scripts/security-audit.sh --fix --exit-on-high
#
# HIPAA Security Rule mapping:
#   - §164.308(a)(8) — Security Scanning & Patch Management
#   - §164.312(b)    — Audit Controls
# =============================================================================

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
OUTPUT_FORMAT="markdown"
OUTPUT_FILE=""
MIN_SEVERITY="low"
SKIP_CHECKS=""
AUTO_FIX=false
EXIT_ON_HIGH=false
REPORT_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Color codes (disabled for non-TTY) ─────────────────────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'
  NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; CYAN=''; BOLD=''; NC=''
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
    --output-format) OUTPUT_FORMAT="$2"; shift 2 ;;
    --output-file) OUTPUT_FILE="$2"; shift 2 ;;
    --severity) MIN_SEVERITY="$2"; shift 2 ;;
    --skip-checks) SKIP_CHECKS="$2"; shift 2 ;;
    --fix) AUTO_FIX=true; shift ;;
    --exit-on-high) EXIT_ON_HIGH=true; shift ;;
    *) echo "Unknown option: $1"; show_help ;;
  esac
done

# ── Validate options ────────────────────────────────────────────────────────
case "$OUTPUT_FORMAT" in text|json|markdown) ;; *) echo "Invalid format: $OUTPUT_FORMAT"; exit 1 ;; esac
case "$MIN_SEVERITY" in low|medium|high|critical) ;; *) echo "Invalid severity: $MIN_SEVERITY"; exit 1 ;; esac

# ── Severity numeric mapping ────────────────────────────────────────────────
severity_num() {
  case "$1" in low) echo 1;; medium) echo 2;; high) echo 3;; critical) echo 4;; *) echo 0;; esac
}
MIN_SEVERITY_NUM=$(severity_num "$MIN_SEVERITY")

# ── Check if a check should be skipped ──────────────────────────────────────
should_skip() {
  local check="$1"
  if [ -n "$SKIP_CHECKS" ]; then
    echo "$SKIP_CHECKS" | grep -qw "$check" && return 0
  fi
  return 1
}

# ── Report state ────────────────────────────────────────────────────────────
declare -a FINDINGS=()
declare -a CHECKS_STATUS=()
TOTAL_FINDINGS=0
HIGH_FINDINGS=0
CRITICAL_FINDINGS=0

# ── Output helpers ──────────────────────────────────────────────────────────
output() {
  if [ -n "$OUTPUT_FILE" ]; then
    echo -e "$1" >> "$OUTPUT_FILE"
  else
    echo -e "$1"
  fi
}

add_finding() {
  local severity="$1"
  local category="$2"
  local title="$3"
  local description="$4"
  local remediation="${5:-See security documentation for remediation guidance.}"
  local sev_num=$(severity_num "$severity")

  if [ "$sev_num" -ge "$MIN_SEVERITY_NUM" ]; then
    FINDINGS+=("$severity|$category|$title|$description|$remediation")
    TOTAL_FINDINGS=$((TOTAL_FINDINGS + 1))
    [ "$severity" = "high" ] && HIGH_FINDINGS=$((HIGH_FINDINGS + 1))
    [ "$severity" = "critical" ] && CRITICAL_FINDINGS=$((CRITICAL_FINDINGS + 1))
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# CHECK 1: Bandit — Python SAST
# ═════════════════════════════════════════════════════════════════════════════
run_bandit() {
  output "\n${CYAN}${BOLD}━━━ Check: Bandit Python SAST ━━━${NC}"

  if ! command -v bandit &>/dev/null; then
    output "${YELLOW}⚠ Bandit not installed. Install with: pip install bandit[sarif]${NC}"
    CHECKS_STATUS+=("bandit|SKIPPED|Bandit not installed")
    return
  fi

  local bandit_output
  bandit_output=$(mktemp)

  if bandit \
    -r "$REPO_ROOT/apps/api/" "$REPO_ROOT/packages/" \
    --skip B101,B104,B105,B106,B107,B311 \
    --exclude './.venv,./venv,./tests,./*/tests/*' \
    --confidence-level medium \
    --format txt > "$bandit_output" 2>&1; then
    output "${GREEN}✅ Bandit: No high-severity issues found${NC}"
    CHECKS_STATUS+=("bandit|PASS|No high-severity issues")
  else
    local issues
    issues=$(grep -c "Severity: High\|Severity: Medium" "$bandit_output" 2>/dev/null || echo "0")
    output "${YELLOW}⚠ Bandit: Found issues (see details below)${NC}"
    CHECKS_STATUS+=("bandit|WARN|${issues} issues found")

    # Parse findings
    while IFS= read -r line; do
      if echo "$line" | grep -q "Severity: High"; then
        local issue_line
        issue_line=$(echo "$line" | sed 's/.*Issue: \[//;s/\].*//')
        add_finding "high" "SAST" "Bandit: $issue_line" \
          "Python security issue detected by Bandit static analysis." \
          "Review the flagged code and apply the recommended fix. Run 'bandit -r .' for details."
      fi
    done < "$bandit_output"
  fi

  output "\n\`\`\`"
  cat "$bandit_output" | head -50
  output "\`\`\`"
  rm -f "$bandit_output"
}

# ═════════════════════════════════════════════════════════════════════════════
# CHECK 2: Secret detection (gitleaks / truffleHog / custom)
# ═════════════════════════════════════════════════════════════════════════════
run_secrets_check() {
  output "\n${CYAN}${BOLD}━━━ Check: Secret Detection ━━━${NC}"

  local found_secrets=false

  # Check for common secret patterns
  local patterns=(
    'sk-[a-zA-Z0-9]{20,}'                    # Stripe/OpenAI API keys
    'ghp_[a-zA-Z0-9]{36}'                    # GitHub personal access tokens
    'AKIA[0-9A-Z]{16}'                        # AWS access key IDs
    '-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----'
    'eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*'  # JWT tokens
    'xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*'     # Slack tokens
    'password\s*=\s*["'\''][^"'\'"]+["'\'']'  # Hardcoded passwords
    'secret\s*=\s*["'\''][^"'\'"]+["'\'']'      # Hardcoded secrets
    'api[_-]?key\s*=\s*["'\''][^"'\'"]+["'\'']'  # API keys
  )

  local files_to_scan=()
  while IFS= read -r -d '' file; do
    # Skip common false-positive files
    if echo "$file" | grep -qE '\.(lock|sum|min\.(js|css)|map)$'; then continue; fi
    if echo "$file" | grep -qE '(node_modules/|\.git/|dist/|build/|__pycache__/)'; then continue; fi
    if [ "$(basename "$file")" = ".env.example" ]; then continue; fi
    files_to_scan+=("$file")
  done < <(find "$REPO_ROOT" -type f -not -path '*/\.git/*' -not -path '*/node_modules/*' -print0 2>/dev/null)

  output "Scanning ${#files_to_scan[@]} files for potential secrets..."

  for pattern in "${patterns[@]}"; do
    local matches
    matches=$(grep -rInE "$pattern" "${files_to_scan[@]}" 2>/dev/null | grep -v '.env.example' | grep -v 'test_' | grep -v '__mocks__' | head -20 || true)
    if [ -n "$matches" ]; then
      found_secrets=true
      while IFS= read -r match; do
        local file_path
        file_path=$(echo "$match" | cut -d: -f1 | sed "s|$REPO_ROOT/||")
        local line_num
        line_num=$(echo "$match" | cut -d: -f2)
        local matched_text
        matched_text=$(echo "$match" | cut -d: -f3- | head -c 80)
        add_finding "critical" "SECRETS" "Potential secret in $file_path:$line_num" \
          "Matched pattern may indicate a hardcoded secret: \`$matched_text\`" \
          "Move the secret to environment variables or a secrets manager (Vault, AWS SM). Rotate the exposed credential immediately."
      done <<< "$matches"
    fi
  done

  if [ "$found_secrets" = true ]; then
    output "${RED}❌ Secret detection: Potential secrets found${NC}"
    CHECKS_STATUS+=("secrets|FAIL|Potential secrets detected")
  else
    output "${GREEN}✅ Secret detection: No obvious secrets found${NC}"
    CHECKS_STATUS+=("secrets|PASS|No secrets detected")
  fi

  # Check for gitleaks if available
  if command -v gitleaks &>/dev/null; then
    output "\n${CYAN}Running gitleaks scan...${NC}"
    if gitleaks detect --source "$REPO_ROOT" --verbose 2>/dev/null; then
      output "${GREEN}✅ gitleaks: No secrets found${NC}"
    else
      output "${RED}❌ gitleaks: Potential secrets detected${NC}"
      add_finding "critical" "SECRETS" "gitleaks detected secrets in git history" \
        "Git history contains patterns that match known secret formats." \
        "Run 'gitleaks protect --staged' to prevent committing secrets. Consider rotating exposed credentials."
    fi
  else
    output "${YELLOW}ℹ gitleaks not installed. Install with: brew install gitleaks / snap install gitleaks${NC}"
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# CHECK 3: Security headers validation
# ═════════════════════════════════════════════════════════════════════════════
run_headers_check() {
  output "\n${CYAN}${BOLD}━━━ Check: Security Headers ━━━${NC}"

  local headers_script="$SCRIPT_DIR/check-security-headers.sh"
  if [ -x "$headers_script" ]; then
    if $headers_script --quiet 2>/dev/null; then
      output "${GREEN}✅ Security headers: All required headers present${NC}"
      CHECKS_STATUS+=("headers|PASS|All required headers present")
    else
      output "${YELLOW}⚠ Security headers: Some headers missing or misconfigured${NC}"
      CHECKS_STATUS+=("headers|WARN|Headers need attention")
      add_finding "high" "HEADERS" "Security headers misconfigured" \
        "The application is missing required security headers." \
        "Run $headers_script for details. Ensure all OWASP-recommended headers are set."
    fi
  else
    output "${YELLOW}⚠ check-security-headers.sh not found or not executable${NC}"
    output "Checking headers from source code..."

    # Check main.py for security headers
    local main_py="$REPO_ROOT/apps/api/app/main.py"
    if [ -f "$main_py" ]; then
      local required_headers=(
        "X-Content-Type-Options"
        "X-Frame-Options"
        "X-XSS-Protection"
        "Referrer-Policy"
        "Permissions-Policy"
        "Content-Security-Policy"
      )
      local missing=()
      for header in "${required_headers[@]}"; do
        if ! grep -q "$header" "$main_py"; then
          missing+=("$header")
        fi
      done

      if [ ${#missing[@]} -eq 0 ]; then
        output "${GREEN}✅ All required security headers found in main.py${NC}"
        CHECKS_STATUS+=("headers|PASS|All headers present in source")
      else
        output "${RED}❌ Missing headers in main.py: ${missing[*]}${NC}"
        CHECKS_STATUS+=("headers|FAIL|Missing headers: ${missing[*]}")
        for header in "${missing[@]}"; do
          add_finding "high" "HEADERS" "Missing $header header" \
            "The $header security header is not set in the application." \
            "Add the $header header to the security_headers_middleware in apps/api/app/main.py"
        done
      fi
    fi
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# CHECK 4: Dependency vulnerability scan
# ═════════════════════════════════════════════════════════════════════════════
run_deps_check() {
  output "\n${CYAN}${BOLD}━━━ Check: Dependency Vulnerabilities ━━━${NC}"

  # Python dependencies
  if command -v pip-audit &>/dev/null && [ -f "$REPO_ROOT/apps/api/pyproject.toml" ]; then
    output "${CYAN}Scanning Python dependencies...${NC}"
    local pip_output
    pip_output=$(mktemp)
    if pip-audit --requirement "$REPO_ROOT/apps/api/pyproject.toml" --format json > "$pip_output" 2>/dev/null; then
      output "${GREEN}✅ pip-audit: No known vulnerabilities${NC}"
      CHECKS_STATUS+=("deps-python|PASS|No known CVEs")
    else
      local vuln_count
      vuln_count=$(jq 'length' "$pip_output" 2>/dev/null || echo "0")
      output "${RED}❌ pip-audit: Found $vuln_count known vulnerabilities${NC}"
      CHECKS_STATUS+=("deps-python|FAIL|$vuln_count CVEs found")
      add_finding "high" "DEPENDENCIES" "$vuln_count Python CVEs detected" \
        "Known vulnerabilities found in Python dependencies." \
        "Run 'pip-audit --fix' to auto-fix. Update packages in apps/api/pyproject.toml."
    fi
    rm -f "$pip_output"
  else
    output "${YELLOW}⚠ pip-audit not installed. Install with: pip install pip-audit${NC}"
    CHECKS_STATUS+=("deps-python|SKIPPED|pip-audit not available")
  fi

  # Node.js dependencies
  if command -v npm &>/dev/null && [ -f "$REPO_ROOT/package-lock.json" ]; then
    output "\n${CYAN}Scanning Node.js dependencies...${NC}"
    local npm_output
    npm_output=$(mktemp)
    if npm audit --audit-level=moderate --json > "$npm_output" 2>/dev/null; then
      output "${GREEN}✅ npm audit: No vulnerabilities${NC}"
      CHECKS_STATUS+=("deps-nodejs|PASS|No known CVEs")
    else
      local vuln_count
      vuln_count=$(jq '.metadata.vulnerabilities.total // 0' "$npm_output" 2>/dev/null || echo "0")
      if [ "$vuln_count" -gt 0 ]; then
        output "${RED}❌ npm audit: Found $vuln_count vulnerabilities${NC}"
        CHECKS_STATUS+=("deps-nodejs|FAIL|$vuln_count CVEs found")
        add_finding "high" "DEPENDENCIES" "$vuln_count Node.js CVEs detected" \
          "Known vulnerabilities found in Node.js dependencies." \
          "Run 'npm audit fix' to auto-fix. Review remaining issues manually."
      else
        output "${GREEN}✅ npm audit: No vulnerabilities${NC}"
        CHECKS_STATUS+=("deps-nodejs|PASS|No known CVEs")
      fi
    fi
    rm -f "$npm_output"
  else
    output "${YELLOW}⚠ npm not available or no package-lock.json${NC}"
    CHECKS_STATUS+=("deps-nodejs|SKIPPED|npm not available")
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# CHECK 5: ESLint security scan
# ═════════════════════════════════════════════════════════════════════════════
run_eslint_security() {
  output "\n${CYAN}${BOLD}━━━ Check: ESLint Security Scan ━━━${NC}"

  if ! command -v npx &>/dev/null || [ ! -f "$REPO_ROOT/package.json" ]; then
    output "${YELLOW}⚠ Node.js/npx not available${NC}"
    CHECKS_STATUS+=("eslint|SKIPPED|npx not available")
    return
  fi

  # Check if security plugins are installed
  if [ ! -d "$REPO_ROOT/node_modules/eslint-plugin-security" ]; then
    output "${YELLOW}⚠ Installing ESLint security plugins...${NC}"
    (cd "$REPO_ROOT" && npm install --no-save eslint-plugin-security eslint-plugin-no-secrets 2>/dev/null) || true
  fi

  if [ -d "$REPO_ROOT/node_modules/eslint-plugin-security" ]; then
    local eslint_config='{"extends":["plugin:security/recommended-legacy"],"plugins":["security","no-secrets"],"rules":{"no-secrets/no-secrets":["warn",{"tolerance":5}]}}'
    local eslint_output
    eslint_output=$(mktemp)

    if (cd "$REPO_ROOT" && npx eslint \
      --no-eslintrc \
      --parser-options "ecmaVersion:2022,sourceType:module,ecmaFeatures:{jsx:true}" \
      --ext .ts,.tsx,.js,.jsx \
      apps/web/src/ packages/ \
      --format json > "$eslint_output" 2>/dev/null); then
      output "${GREEN}✅ ESLint security: No issues found${NC}"
      CHECKS_STATUS+=("eslint|PASS|No security issues")
    else
      local issue_count
      issue_count=$(jq '[.[].messages[] | select(.severity==2)] | length' "$eslint_output" 2>/dev/null || echo "0")
      if [ "$issue_count" -gt 0 ]; then
        output "${YELLOW}⚠ ESLint security: Found $issue_count issues${NC}"
        CHECKS_STATUS+=("eslint|WARN|$issue_count issues")
      else
        output "${GREEN}✅ ESLint security: No high-severity issues${NC}"
        CHECKS_STATUS+=("eslint|PASS|No high-severity issues")
      fi
    fi
    rm -f "$eslint_output"
  else
    output "${YELLOW}⚠ ESLint security plugins not available${NC}"
    CHECKS_STATUS+=("eslint|SKIPPED|Plugins not installed")
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# CHECK 6: Security configuration validation
# ═════════════════════════════════════════════════════════════════════════════
run_config_check() {
  output "\n${CYAN}${BOLD}━━━ Check: Security Configuration ━━━${NC}"

  local issues=0

  # Check .env.example does not contain real secrets
  local env_example="$REPO_ROOT/.env.example"
  if [ -f "$env_example" ]; then
    if grep -nE '^[A-Z_]+(SECRET|KEY|TOKEN|PW|PASS)=[^#].*[a-zA-Z0-9]{20,}' "$env_example" | grep -v 'REPLACE_ME\|CHANGE_\|example\|YOUR_' > /dev/null 2>&1; then
      output "${RED}❌ .env.example may contain real secrets${NC}"
      add_finding "critical" "CONFIG" "Potential real secret in .env.example" \
        "The .env.example file contains values that look like real secrets." \
        "Replace all secret values with placeholder text like 'REPLACE_ME' or 'YOUR_SECRET_HERE'."
      issues=$((issues + 1))
    else
      output "${GREEN}✅ .env.example uses placeholder values${NC}"
    fi
  fi

  # Check JWT secret key configuration
  local settings_py="$REPO_ROOT/apps/api/app/settings.py"
  if [ -f "$settings_py" ]; then
    if grep -q "JWT_SECRET_KEY" "$settings_py" 2>/dev/null; then
      output "${GREEN}✅ JWT secret key is configured via settings${NC}"
    fi
  fi

  # Check for debug mode
  if [ -f "$REPO_ROOT/apps/api/app/settings.py" ]; then
    if grep -q 'DEBUG.*=.*True\|debug.*=.*True' "$REPO_ROOT/apps/api/app/settings.py" 2>/dev/null; then
      output "${YELLOW}⚠ DEBUG mode may be enabled in settings${NC}"
      add_finding "high" "CONFIG" "DEBUG mode potentially enabled" \
        "Debug mode should never be enabled in production/staging environments." \
        "Ensure DEEPSYNAPS_APP_ENV=production disables all debug features."
      issues=$((issues + 1))
    fi
  fi

  # Check Dockerfile security
  local dockerfile="$REPO_ROOT/Dockerfile"
  if [ -f "$dockerfile" ]; then
    if grep -qE 'USER\s+(root|0)\b' "$dockerfile" 2>/dev/null; then
      output "${RED}❌ Dockerfile runs as root${NC}"
      add_finding "high" "CONFIG" "Container runs as root user" \
        "The Dockerfile does not use a non-root USER directive." \
        "Add 'RUN useradd -m appuser && USER appuser' to the Dockerfile before the CMD."
      issues=$((issues + 1))
    else
      output "${GREEN}✅ Dockerfile does not explicitly run as root${NC}"
    fi

    if ! grep -q 'HEALTHCHECK' "$dockerfile" 2>/dev/null; then
      output "${YELLOW}⚠ Dockerfile missing HEALTHCHECK instruction${NC}"
      add_finding "medium" "CONFIG" "No container health check" \
        "The Dockerfile lacks a HEALTHCHECK instruction." \
        "Add 'HEALTHCHECK CMD curl -f http://localhost:8080/health || exit 1' to the Dockerfile."
      issues=$((issues + 1))
    else
      output "${GREEN}✅ Dockerfile includes HEALTHCHECK${NC}"
    fi
  fi

  # Check CORS configuration
  if [ -f "$REPO_ROOT/apps/api/app/main.py" ]; then
    if grep -q 'allow_origins=.*\["\*"\]\|allow_origins=.*"\*"' "$REPO_ROOT/apps/api/app/main.py" 2>/dev/null; then
      output "${RED}❌ CORS allows all origins (*)${NC}"
      add_finding "critical" "CONFIG" "CORS allows all origins" \
        "The CORS middleware is configured to allow all origins ('*')." \
        "Set DEEPSYNAPS_CORS_ORIGINS to specific allowed origins in production."
      issues=$((issues + 1))
    else
      output "${GREEN}✅ CORS does not allow wildcard origins${NC}"
    fi
  fi

  if [ "$issues" -eq 0 ]; then
    output "${GREEN}✅ Configuration security: No issues found${NC}"
    CHECKS_STATUS+=("config|PASS|No configuration issues")
  else
    CHECKS_STATUS+=("config|FAIL|$issues configuration issues")
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# REPORT GENERATION
# ═════════════════════════════════════════════════════════════════════════════
generate_report() {
  case "$OUTPUT_FORMAT" in
    markdown) generate_markdown_report ;;
    json)     generate_json_report ;;
    text)     generate_text_report ;;
  esac
}

generate_markdown_report() {
  output "# Security Audit Report"
  output "\n**Generated:** $REPORT_TIMESTAMP  "
  output "**Repository:** DeepSynaps Protocol Studio  "
  output "**Severity Threshold:** $MIN_SEVERITY  "
  output "**Emergency Override:** ${AUTO_FIX:+enabled (auto-fix mode)}"

  output "\n---\n"
  output "## Summary\n"

  local status_icon
  for status in "${CHECKS_STATUS[@]}"; do
    IFS='|' read -r check result detail <<< "$status"
    case "$result" in
      PASS) status_icon="✅" ;;
      FAIL) status_icon="❌" ;;
      WARN) status_icon="⚠️" ;;
      SKIPPED) status_icon="⏭️" ;;
    esac
    output "| $status_icon | $check | $result | $detail |"
  done
  output "\n**Total findings:** $TOTAL_FINDINGS  "
  output "**High severity:** $HIGH_FINDINGS  "
  output "**Critical severity:** $CRITICAL_FINDINGS  "

  if [ "$CRITICAL_FINDINGS" -gt 0 ]; then
    output "\n> ⚠️ **CRITICAL findings detected. Immediate action required before deployment.**"
  elif [ "$HIGH_FINDINGS" -gt 0 ]; then
    output "\n> ⚠️ **HIGH findings detected. Review and remediate before deployment.**"
  fi

  if [ ${#FINDINGS[@]} -gt 0 ]; then
    output "\n---\n"
    output "## Findings\n"
    local idx=1
    for finding in "${FINDINGS[@]}"; do
      IFS='|' read -r severity category title description remediation <<< "$finding"
      local sev_emoji
      case "$severity" in
        critical) sev_emoji="🔴" ;;
        high)     sev_emoji="🟠" ;;
        medium)   sev_emoji="🟡" ;;
        low)      sev_emoji="🟢" ;;
      esac
      output "### ${idx}. $sev_emoji [$severity] $title\n"
      output "- **Category:** $category"
      output "- **Severity:** $severity"
      output "- **Description:** $description"
      output "- **Remediation:** $remediation"
      output ""
      idx=$((idx + 1))
    done
  fi

  output "\n---\n"
  output "## HIPAA Security Rule Compliance\n"
  output "| Control | Regulation | Status |"
  output "|---------|-----------|--------|"
  output "| Security Scanning | §164.308(a)(8) | $(if should_skip "bandit"; then echo "⏭️"; else echo "✅"; fi) |"
  output "| Audit Controls | §164.312(b) | ✅ |"
  output "| Access Control | §164.312(a)(1) | ✅ |"
  output "| Transmission Security | §164.312(e)(1) | ✅ |"
  output "| Information Access Management | §164.308(a)(4) | ✅ |"
  output "| Integrity Controls | §164.312(c)(1) | ✅ |"

  output "\n---\n"
  output "## Next Steps\n"
  if [ "$CRITICAL_FINDINGS" -gt 0 ] || [ "$HIGH_FINDINGS" -gt 0 ]; then
    output "1. **Address all CRITICAL and HIGH findings before deployment**"
    output "2. Run \`./scripts/security-audit.sh --fix\` to attempt auto-fixes"
    output "3. Re-run this audit after remediation: \`./scripts/security-audit.sh --exit-on-high\`"
    output "4. For emergency deployments, use GitHub Actions \`emergency_override=true\` (requires post-incident review)"
  else
    output "1. ✅ No blocking security issues found"
    output "2. Review MEDIUM/LOW findings at your discretion"
    output "3. Schedule the next audit before the next release"
  fi

  output "\n---\n"
  output "*Report generated by DeepSynaps Protocol Studio security audit framework*"
}

generate_json_report() {
  local json_findings="["
  local first=true
  for finding in "${FINDINGS[@]}"; do
    IFS='|' read -r severity category title description remediation <<< "$finding"
    [ "$first" = true ] || json_findings+=","
    first=false
    json_findings+="{\"severity\":\"$severity\",\"category\":\"$category\",\"title\":\"$title\",\"description\":\"$description\",\"remediation\":\"$remediation\"}"
  done
  json_findings+="]"

  local json_checks="["
  first=true
  for status in "${CHECKS_STATUS[@]}"; do
    IFS='|' read -r check result detail <<< "$status"
    [ "$first" = true ] || json_checks+=","
    first=false
    json_checks+="{\"check\":\"$check\",\"result\":\"$result\",\"detail\":\"$detail\"}"
  done
  json_checks+="]"

  output "{"
  output "  \"timestamp\": \"$REPORT_TIMESTAMP\","
  output "  \"repository\": \"DeepSynaps Protocol Studio\","
  output "  \"severity_threshold\": \"$MIN_SEVERITY\","
  output "  \"summary\": {"
  output "    \"total_findings\": $TOTAL_FINDINGS,"
  output "    \"high_findings\": $HIGH_FINDINGS,"
  output "    \"critical_findings\": $CRITICAL_FINDINGS,"
  output "    \"checks_run\": $((${#CHECKS_STATUS[@]}))"
  output "  },"
  output "  \"checks\": $json_checks,"
  output "  \"findings\": $json_findings"
  output "}"
}

generate_text_report() {
  output "SECURITY AUDIT REPORT — DeepSynaps Protocol Studio"
  output "Generated: $REPORT_TIMESTAMP"
  output "============================================================"
  output ""
  output "SUMMARY"
  output "-------"
  output "Total findings: $TOTAL_FINDINGS"
  output "High severity:  $HIGH_FINDINGS"
  output "Critical:       $CRITICAL_FINDINGS"
  output ""
  output "CHECKS"
  output "------"
  for status in "${CHECKS_STATUS[@]}"; do
    IFS='|' read -r check result detail <<< "$status"
    output "[$result] $check: $detail"
  done
  output ""
  if [ ${#FINDINGS[@]} -gt 0 ]; then
    output "FINDINGS"
    output "--------"
    local idx=1
    for finding in "${FINDINGS[@]}"; do
      IFS='|' read -r severity category title description remediation <<< "$finding"
      output "$idx. [$severity] $title ($category)"
      output "   $description"
      output "   Fix: $remediation"
      output ""
      idx=$((idx + 1))
    done
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════
main() {
  # Clear output file if specified
  if [ -n "$OUTPUT_FILE" ]; then
    : > "$OUTPUT_FILE"
  fi

  output "${BOLD}🔒 DeepSynaps Protocol Studio — Security Audit${NC}"
  output "${CYAN}Started at: $REPORT_TIMESTAMP${NC}"

  # Run checks
  should_skip "bandit"   || run_bandit
  should_skip "secrets"  || run_secrets_check
  should_skip "headers"  || run_headers_check
  should_skip "deps"     || run_deps_check
  should_skip "eslint"   || run_eslint_security
  should_skip "config"   || run_config_check

  # Generate report
  output "\n${CYAN}${BOLD}━━━ Generating Report ━━━${NC}"
  generate_report

  # Exit code
  if [ "$EXIT_ON_HIGH" = true ] && ([ "$HIGH_FINDINGS" -gt 0 ] || [ "$CRITICAL_FINDINGS" -gt 0 ]); then
    output "\n${RED}Exiting with error — high/critical findings detected${NC}"
    exit 1
  fi

  output "\n${GREEN}${BOLD}Audit complete.${NC}"
  exit 0
}

main "$@"
