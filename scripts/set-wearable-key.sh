#!/usr/bin/env bash
# Generate a fresh Fernet key and set it as a Fly secret on deepsynaps-studio,
# then verify it landed in the running machine's environment.
#
# Usage: bash scripts/set-wearable-key.sh
set -euo pipefail

APP="deepsynaps-studio"
KEY_NAME="WEARABLE_TOKEN_ENC_KEY"

echo "▶ Generating fresh Fernet key (32-byte urlsafe base64)…"

# Try python with cryptography first; fall back to openssl (always present on macOS).
PY_BIN=""
for candidate in /opt/homebrew/bin/python3.11 /usr/local/bin/python3.11 python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1; then
    if "$candidate" -c "import cryptography" 2>/dev/null; then
      PY_BIN="$candidate"
      break
    fi
  fi
done

if [ -n "$PY_BIN" ]; then
  echo "  Using $PY_BIN with cryptography.Fernet"
  KEY=$("$PY_BIN" -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
else
  echo "  cryptography not installed; falling back to openssl rand (urlsafe-base64-encoded 32 random bytes)"
  KEY=$(openssl rand 32 | base64 | tr '+/' '-_' | tr -d '\n')
fi

if [ -z "$KEY" ] || [ "${#KEY}" -lt 40 ]; then
  echo "✗ Key generation failed (got empty or short value). Aborting."
  exit 1
fi

echo "  Generated key length: ${#KEY} chars (expected ~44)."
echo

echo "▶ Setting Fly secret ${KEY_NAME} on app ${APP}…"
flyctl secrets set "${KEY_NAME}=${KEY}" -a "${APP}"
echo

echo "▶ Verifying secret is present in running machine env…"
flyctl ssh console -a "${APP}" -C "sh -c 'echo SECRET_LEN=\${#${KEY_NAME}}'"
echo

echo "▶ Re-running API deploy so the new image's release_command picks up the key…"
bash "$(dirname "$0")/deploy-preview.sh" --api-only
