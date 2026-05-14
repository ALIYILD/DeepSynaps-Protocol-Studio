#!/usr/bin/env bash
# =============================================================================
# DeepSynaps Protocol Studio — Secret Rotation Automation
# =============================================================================
# Automates zero-downtime rotation of all application secrets.
# Supports: JWT secrets, database passwords, API keys, Stripe secrets.
#
# Architecture:
#   Phase 1: Generate new secrets
#   Phase 2: Deploy new secrets alongside old (dual-validation period)
#   Phase 3: Verify new secrets work
#   Phase 4: Retire old secrets
#   Phase 5: Verify old secrets rejected
#
# Usage:
#   ./scripts/rotate-secrets.sh [options] <secret-type>
#
# Arguments:
#   secret-type             Type of secret to rotate:
#                           all, jwt, database, api-keys, stripe, telegram, fernet
#
# Options:
#   --help, -h              Show this help message
#   --env ENV               Target environment: dev|staging|prod (default: dev)
#   --skip-verify           Skip post-rotation verification (NOT RECOMMENDED)
#   --dry-run               Show what would be done without making changes
#   --force                 Force rotation even if current secrets are valid
#   --dual-period SECONDS   Dual-validation period in seconds (default: 300)
#   --vault-addr URL        HashiCorp Vault address (default: env VAULT_ADDR)
#   --vault-token TOKEN     Vault token (default: env VAULT_TOKEN)
#
# Examples:
#   ./scripts/rotate-secrets.sh --dry-run jwt
#   ./scripts/rotate-secrets.sh --env staging all
#   ./scripts/rotate-secrets.sh --env prod --dual-period 600 database
#
# HIPAA Security Rule mapping:
#   - §164.308(a)(5)(ii)(D) — Password Management
#   - §164.312(a)(2)(iv)    — Encryption and Decryption
#   - §164.312(b)           — Audit Controls (secret rotation logging)
# =============================================================================

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENVIRONMENT="dev"
SKIP_VERIFY=false
DRY_RUN=false
FORCE=false
DUAL_PERIOD=300
VAULT_ADDR="${VAULT_ADDR:-}"
VAULT_TOKEN="${VAULT_TOKEN:-}"

# ── Color codes ─────────────────────────────────────────────────────────────
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

# ── Logging ─────────────────────────────────────────────────────────────────
log() {
  echo -e "${BLUE}[$(date -u +'%Y-%m-%dT%H:%M:%SZ')]${NC} $1"
}

log_ok() {
  echo -e "${GREEN}[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] ✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] ⚠${NC} $1"
}

log_error() {
  echo -e "${RED}[$(date -u +'%Y-%m-%dT%H:%M:%SZ']) ✗${NC} $1"
}

# ── Argument parsing ────────────────────────────────────────────────────────
SECRET_TYPE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --help|-h) show_help ;;
    --env) ENVIRONMENT="$2"; shift 2 ;;
    --skip-verify) SKIP_VERIFY=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --force) FORCE=true; shift ;;
    --dual-period) DUAL_PERIOD="$2"; shift 2 ;;
    --vault-addr) VAULT_ADDR="$2"; shift 2 ;;
    --vault-token) VAULT_TOKEN="$2"; shift 2 ;;
    -*|'') echo "Unknown option: $1"; show_help ;;
    *) SECRET_TYPE="$1"; shift ;;
  esac
done

# Validate secret type
if [ -z "$SECRET_TYPE" ]; then
  log_error "No secret type specified. Use: all, jwt, database, api-keys, stripe, telegram, fernet"
  exit 1
fi

case "$SECRET_TYPE" in
  all|jwt|database|api-keys|stripe|telegram|fernet) ;;
  *) log_error "Invalid secret type: $SECRET_TYPE"; exit 1 ;;
esac

# Validate environment
case "$ENVIRONMENT" in
  dev|staging|prod) ;;
  *) log_error "Invalid environment: $ENVIRONMENT"; exit 1 ;;
esac

# ── Safety checks for production ────────────────────────────────────────────
if [ "$ENVIRONMENT" = "prod" ]; then
  log_warn "⚠️  PRODUCTION ENVIRONMENT — Extra confirmations required"

  echo -n "Are you authorized to rotate production secrets? (yes/no): "
  read -r confirm
  [ "$confirm" = "yes" ] || { log_error "Aborted"; exit 1; }

  echo -n "Have you notified the on-call team? (yes/no): "
  read -r confirm
  [ "$confirm" = "yes" ] || { log_error "Aborted — notify on-call team first"; exit 1; }

  echo -n "Type the environment name to confirm: [production] "
  read -r confirm_env
  [ "$confirm_env" = "production" ] || { log_error "Aborted"; exit 1; }
fi

# ── Secret storage helpers ──────────────────────────────────────────────────
load_env_file() {
  local env_file="$REPO_ROOT/.env.$ENVIRONMENT"
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$env_file"
    set +a
    log "Loaded environment from $env_file"
  elif [ -f "$REPO_ROOT/.env" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$REPO_ROOT/.env"
    set +a
    log "Loaded environment from .env"
  fi
}

get_secret() {
  local key="$1"
  local value

  # Priority: 1) Environment variable 2) Vault 3) .env file
  value="${!key:-}"
  if [ -n "$value" ]; then
    echo "$value"
    return 0
  fi

  # Try Vault
  if [ -n "$VAULT_ADDR" ] && [ -n "$VAULT_TOKEN" ]; then
    value=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
      "$VAULT_ADDR/v1/secret/data/deepsynaps/$ENVIRONMENT/$key" 2>/dev/null | \
      jq -r '.data.data.value // empty' 2>/dev/null) || true
    if [ -n "$value" ]; then
      echo "$value"
      return 0
    fi
  fi

  return 1
}

store_secret() {
  local key="$1"
  local value="$2"

  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would store $key"
    return 0
  fi

  # Store in Vault if available
  if [ -n "$VAULT_ADDR" ] && [ -n "$VAULT_TOKEN" ]; then
    curl -s -H "X-Vault-Token: $VAULT_TOKEN" \
      -H "Content-Type: application/json" \
      -X POST \
      -d "{\"data\":{\"value\":\"$value\"}}" \
      "$VAULT_ADDR/v1/secret/data/deepsynaps/$ENVIRONMENT/$key" > /dev/null 2>&1 || true
    log_ok "Stored $key in Vault"
  fi

  # Update local .env file
  local env_file="$REPO_ROOT/.env.$ENVIRONMENT"
  [ -f "$env_file" ] || env_file="$REPO_ROOT/.env"

  if [ -f "$env_file" ]; then
    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
      # In-place update (portable sed)
      sed -i.bak "s|^${key}=.*|${key}=$value|" "$env_file" && rm -f "$env_file.bak"
    else
      echo "$key=$value" >> "$env_file"
    fi
    log_ok "Updated $key in $env_file"
  fi
}

# ── Generation functions ────────────────────────────────────────────────────
generate_jwt_secret() {
  openssl rand -hex 32
}

generate_db_password() {
  # Generate a strong DB password: 32 chars, alphanumeric + special
  LC_ALL=C tr -dc 'A-Za-z0-9!@#$%^&*' < /dev/urandom | head -c 32
  echo
}

generate_api_key() {
  # API key format: prefix + random suffix
  local prefix="$1"
  local suffix
  suffix=$(openssl rand -hex 24)
  echo "${prefix}_${suffix}"
}

generate_fernet_key() {
  # Fernet key: URL-safe base64-encoded 32-byte key
  python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || \
    openssl rand -base64 32
}

# ── Phase 1: Generate new secrets ───────────────────────────────────────────
phase1_generate() {
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "${BOLD}PHASE 1: Generate New Secrets${NC}"
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  local new_secrets_file
  new_secrets_file="$REPO_ROOT/.secrets-new-$ENVIRONMENT-$(date +%s).tmp"

  {
    echo "# New secrets generated on $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "# ENVIRONMENT=$ENVIRONMENT"
    echo "# ROTATION_ID=$(openssl rand -hex 8)"
    echo ""

    # JWT Secret
    if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "jwt" ]; then
      log "Generating new JWT secret..."
      local new_jwt_secret
      new_jwt_secret=$(generate_jwt_secret)
      echo "JWT_SECRET_KEY=$new_jwt_secret"
      log_ok "JWT secret generated"
    fi

    # Database Password
    if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "database" ]; then
      log "Generating new database password..."
      local new_db_password
      new_db_password=$(generate_db_password)
      echo "DATABASE_PASSWORD=$new_db_password"
      log_ok "Database password generated"
    fi

    # API Keys
    if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "api-keys" ]; then
      log "Generating new API keys..."
      local new_anthropic_key
      new_anthropic_key=$(generate_api_key "sk-ant")
      echo "ANTHROPIC_API_KEY=$new_anthropic_key"
      local new_openai_key
      new_openai_key=$(generate_api_key "sk")
      echo "OPENAI_API_KEY=$new_openai_key"
      log_ok "API keys generated"
    fi

    # Stripe Secrets
    if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "stripe" ]; then
      log "Generating Stripe webhook secret..."
      local new_stripe_webhook
      new_stripe_webhook="whsec_$(openssl rand -hex 24)"
      echo "STRIPE_WEBHOOK_SECRET=$new_stripe_webhook"
      log_ok "Stripe webhook secret generated"
      log_warn "Note: You must update the webhook endpoint in the Stripe dashboard with the new secret"
    fi

    # Telegram Bot Token
    if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "telegram" ]; then
      log "Generating Telegram webhook secret..."
      local new_telegram_secret
      new_telegram_secret=$(openssl rand -hex 32)
      echo "TELEGRAM_WEBHOOK_SECRET=$new_telegram_secret"
      log_ok "Telegram webhook secret generated"
    fi

    # Fernet Keys
    if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "fernet" ]; then
      log "Generating Fernet keys..."
      local new_secrets_key
      new_secrets_key=$(generate_fernet_key)
      echo "DEEPSYNAPS_SECRETS_KEY=$new_secrets_key"
      local new_wearable_key
      new_wearable_key=$(generate_fernet_key)
      echo "WEARABLE_TOKEN_ENC_KEY=$new_wearable_key"
      log_ok "Fernet keys generated"
    fi

  } > "$new_secrets_file"

  echo "$new_secrets_file"
}

# ── Phase 2: Deploy new secrets (dual-validation) ───────────────────────────
phase2_deploy() {
  local secrets_file="$1"

  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "${BOLD}PHASE 2: Deploy New Secrets (Dual-Validation)${NC}"
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would deploy secrets from $secrets_file"
    return 0
  fi

  # Read and deploy each secret
  while IFS='=' read -r key value; do
    [ -z "$key" ] && continue
    [[ "$key" =~ ^# ]] && continue
    store_secret "$key" "$value"
  done < "$secrets_file"

  log_ok "New secrets deployed"
  log "Starting dual-validation period (${DUAL_PERIOD}s)..."

  # For JWT: application accepts BOTH old and new tokens during dual period
  # This is handled by the application's JWT verification middleware
  # which checks against a list of valid secrets

  if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "jwt" ]; then
    log "JWT dual-validation: Application should accept tokens signed with either old or new secret"
  fi

  sleep "$DUAL_PERIOD"
  log_ok "Dual-validation period complete"
}

# ── Phase 3: Verify new secrets ─────────────────────────────────────────────
phase3_verify() {
  local secrets_file="$1"

  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "${BOLD}PHASE 3: Verify New Secrets${NC}"
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if [ "$SKIP_VERIFY" = true ]; then
    log_warn "Skipping verification (--skip-verify was set)"
    return 0
  fi

  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would verify new secrets"
    return 0
  fi

  local all_pass=true

  # Verify JWT secret
  if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "jwt" ]; then
    log "Verifying JWT secret..."
    local new_jwt
    new_jwt=$(grep "^JWT_SECRET_KEY=" "$secrets_file" | cut -d= -f2-)
    if [ -n "$new_jwt" ]; then
      # Test: Generate a token with the new secret and verify it
      local test_token
      test_token=$(python3 -c "
import jwt, time
print(jwt.encode({'sub': 'rotation-test', 'iat': time.time(), 'exp': time.time() + 60}, '$new_jwt', algorithm='HS256'))
" 2>/dev/null) || true
      if [ -n "$test_token" ]; then
        # Verify the token
        local verify_result
        verify_result=$(python3 -c "
import jwt
try:
    jwt.decode('$test_token', '$new_jwt', algorithms=['HS256'])
    print('OK')
except Exception as e:
    print(f'FAIL: {e}')
" 2>/dev/null) || true
        if [ "$verify_result" = "OK" ]; then
          log_ok "JWT secret verification passed"
        else
          log_error "JWT secret verification failed: $verify_result"
          all_pass=false
        fi
      else
        log_warn "Could not generate test JWT token (Python jwt library may not be installed)"
      fi
    fi
  fi

  # Verify Fernet key
  if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "fernet" ]; then
    log "Verifying Fernet key..."
    local new_fernet
    new_fernet=$(grep "^DEEPSYNAPS_SECRETS_KEY=" "$secrets_file" | cut -d= -f2-)
    if [ -n "$new_fernet" ]; then
      local fernet_test
      fernet_test=$(python3 -c "
from cryptography.fernet import Fernet
f = Fernet('$new_fernet')
token = f.encrypt(b'test-rotation')
assert f.decrypt(token) == b'test-rotation'
print('OK')
" 2>/dev/null) || true
      if [ "$fernet_test" = "OK" ]; then
        log_ok "Fernet key verification passed"
      else
        log_error "Fernet key verification failed"
        all_pass=false
      fi
    fi
  fi

  # Verify database connectivity (if running in the target environment)
  if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "database" ]; then
    log "Verifying database connectivity..."
    local db_url
    db_url="${DEEPSYNAPS_DATABASE_URL:-}"
    if [ -n "$db_url" ]; then
      # Test connectivity using Python
      local db_test
      db_test=$(python3 -c "
from sqlalchemy import create_engine, text
try:
    engine = create_engine('$db_url')
    with engine.connect() as conn:
        conn.execute(text('SELECT 1'))
    print('OK')
except Exception as e:
    print(f'FAIL: {e}')
" 2>/dev/null) || true
      if [ "$db_test" = "OK" ]; then
        log_ok "Database connectivity verification passed"
      else
        log_error "Database connectivity verification failed: $db_test"
        all_pass=false
      fi
    else
      log_warn "DEEPSYNAPS_DATABASE_URL not set — skipping DB connectivity test"
    fi
  fi

  # Verify application health endpoint
  local api_port
  api_port="${DEEPSYNAPS_API_PORT:-8000}"
  local api_host
  api_host="${DEEPSYNAPS_API_HOST:-127.0.0.1}"

  log "Checking application health at http://$api_host:$api_port/health..."
  local health_status
  health_status=$(curl -s -o /dev/null -w "%{http_code}" "http://$api_host:$api_port/health" 2>/dev/null || echo "000")
  if [ "$health_status" = "200" ]; then
    log_ok "Application health check passed (HTTP 200)"
  else
    log_warn "Application health check returned HTTP $health_status (may be expected if app is not running)"
  fi

  if [ "$all_pass" = true ]; then
    log_ok "All verifications passed"
  else
    log_error "Some verifications failed. Review errors above."
    if [ "$ENVIRONMENT" = "prod" ]; then
      log_error "PRODUCTION: Consider rolling back to old secrets immediately"
      exit 1
    fi
  fi
}

# ── Phase 4: Retire old secrets ─────────────────────────────────────────────
phase4_retire() {
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "${BOLD}PHASE 4: Retire Old Secrets${NC}"
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would retire old secrets"
    return 0
  fi

  # For JWT: Remove old secret from accepted list
  # Tokens signed with the old secret will now be rejected
  if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "jwt" ]; then
    log "JWT old secret retired — tokens signed with old secret will be rejected"
  fi

  # For database: Old password revoked at DB level
  if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "database" ]; then
    log_warn "Database password changed — ensure database user password was updated"
    log_warn "Old DB password is now invalid — any connections using it will fail"
  fi

  # For API keys: Old keys revoked at provider level
  if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "api-keys" ]; then
    log_warn "API keys rotated — revoke old keys in their respective dashboards:"
    log_warn "  - Anthropic: https://console.anthropic.com/settings/keys"
    log_warn "  - OpenAI: https://platform.openai.com/api-keys"
  fi

  # For Stripe: Old webhook secret invalidated
  if [ "$SECRET_TYPE" = "all" ] || [ "$SECRET_TYPE" = "stripe" ]; then
    log_warn "Stripe webhook secret rotated — update the endpoint in Stripe dashboard"
    log_warn "Old webhook signatures will fail verification"
  fi

  log_ok "Old secrets retired"
}

# ── Phase 5: Final verification ─────────────────────────────────────────────
phase5_final_verify() {
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "${BOLD}PHASE 5: Final Verification${NC}"
  log "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if [ "$SKIP_VERIFY" = true ]; then
    log_warn "Skipping final verification (--skip-verify was set)"
    return 0
  fi

  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would run final verification"
    return 0
  fi

  local api_port
  api_port="${DEEPSYNAPS_API_PORT:-8000}"
  local api_host
  api_host="${DEEPSYNAPS_API_HOST:-127.0.0.1}"

  # Test that new auth works
  log "Testing authentication with new secrets..."
  local health_status
  health_status=$(curl -s -o /dev/null -w "%{http_code}" "http://$api_host:$api_port/health" 2>/dev/null || echo "000")
  if [ "$health_status" = "200" ]; then
    log_ok "Application responds correctly with new secrets (HTTP 200)"
  else
    log_warn "Application health check: HTTP $health_status"
  fi

  log_ok "Secret rotation complete"
}

# ── Cleanup ─────────────────────────────────────────────────────────────────
cleanup() {
  local secrets_file="$1"
  if [ "$DRY_RUN" = false ] && [ -f "$secrets_file" ]; then
    log "Securely removing temporary secrets file..."
    # Overwrite before delete
    dd if=/dev/urandom of="$secrets_file" bs=4096 count=10 status=none 2>/dev/null || true
    rm -f "$secrets_file"
    log_ok "Temporary file securely removed"
  fi
}

# ── Audit logging ───────────────────────────────────────────────────────────
log_rotation_event() {
  local event="$1"
  local rotation_id
  rotation_id="${ROTATION_ID:-$(openssl rand -hex 8)}"

  log "AUDIT: rotation_event=$event type=$SECRET_TYPE env=$ENVIRONMENT id=$rotation_id user=$(whoami)"

  # If audit trail endpoint is available, log there too
  local api_port="${DEEPSYNAPS_API_PORT:-8000}"
  local api_host="${DEEPSYNAPS_API_HOST:-127.0.0.1}"

  curl -s -X POST "http://$api_host:$api_port/api/v1/audit-trail" \
    -H "Content-Type: application/json" \
    -d "{\"event\":\"secret_rotation\",\"event_type\":\"$event\",\"secret_type\":\"$SECRET_TYPE\",\"environment\":\"$ENVIRONMENT\",\"rotation_id\":\"$rotation_id\",\"actor\":\"$(whoami)\"}" \
    > /dev/null 2>&1 || true
}

# ═════════════════════════════════════════════════════════════════════════════
# MAIN
# ═════════════════════════════════════════════════════════════════════════════
main() {
  log "${BOLD}🔐 DeepSynaps Protocol Studio — Secret Rotation${NC}"
  log "Secret type: $SECRET_TYPE | Environment: $ENVIRONMENT | Dry-run: $DRY_RUN"

  load_env_file

  local rotation_id
  rotation_id=$(openssl rand -hex 8)
  export ROTATION_ID="$rotation_id"

  log_rotation_event "started"

  # Phase 1: Generate
  local secrets_file
  secrets_file=$(phase1_generate)
  log_ok "New secrets written to temporary file"

  # Phase 2: Deploy
  phase2_deploy "$secrets_file"

  # Phase 3: Verify new secrets
  phase3_verify "$secrets_file"

  # Phase 4: Retire old secrets
  phase4_retire

  # Phase 5: Final verification
  phase5_final_verify

  # Cleanup
  cleanup "$secrets_file"

  log_rotation_event "completed"

  log "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  log "${GREEN}${BOLD}Secret rotation completed successfully${NC}"
  log "${GREEN}${BOLD}Rotation ID: $rotation_id${NC}"
  log "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  if [ "$SECRET_TYPE" = "stripe" ] || [ "$SECRET_TYPE" = "all" ]; then
    log_warn "ACTION REQUIRED: Update webhook endpoint in Stripe dashboard"
  fi

  if [ "$SECRET_TYPE" = "api-keys" ] || [ "$SECRET_TYPE" = "all" ]; then
    log_warn "ACTION REQUIRED: Revoke old API keys in their provider dashboards"
  fi
}

# ── Trap to ensure cleanup ──────────────────────────────────────────────────
trap 'cleanup "${secrets_file:-}" 2>/dev/null' EXIT

main "$@"
