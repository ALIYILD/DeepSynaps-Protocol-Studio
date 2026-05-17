#!/usr/bin/env bash
#
# deploy-via-hook.sh — trigger a Netlify build-from-git via build hook.
#
# Unlike scripts/deploy-preview.sh (which builds locally and uploads the
# dist), this script tells Netlify to pull `main` and build server-side.
# No local netlify login or local build required.
#
# Usage:
#   scripts/deploy-via-hook.sh                       # trigger build of main
#   scripts/deploy-via-hook.sh --title "post-#974"   # set deploy title in dashboard
#   scripts/deploy-via-hook.sh --clear-cache         # bust Netlify build cache
#
# Hook URL resolution (first match wins):
#   1. NETLIFY_BUILD_HOOK_URL env var
#   2. macOS Keychain: service=deepsynaps-netlify-hook account=preview
#
# One-time setup (pick one):
#
#   # Option A — keychain (recommended on Ali's primary Mac)
#   security add-generic-password \
#       -s deepsynaps-netlify-hook \
#       -a preview \
#       -w 'https://api.netlify.com/build_hooks/REPLACE_ME'
#
#   # Option B — env var (for CI or one-off shell)
#   export NETLIFY_BUILD_HOOK_URL='https://api.netlify.com/build_hooks/REPLACE_ME'
#
# Get the hook URL from:
#   Netlify dashboard → deepsynaps-studio-preview → Site configuration
#                     → Build & deploy → Build hooks → Add build hook
#
# Treat the hook URL as a secret. Anyone with it can trigger production
# rebuilds.

set -euo pipefail

KEYCHAIN_SERVICE="deepsynaps-netlify-hook"
KEYCHAIN_ACCOUNT="preview"
SITE_NAME="deepsynaps-studio-preview"

title=""
clear_cache=0

while [ $# -gt 0 ]; do
  case "$1" in
    --title)
      title="${2:-}"
      shift 2
      ;;
    --clear-cache)
      clear_cache=1
      shift
      ;;
    -h|--help)
      sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown flag: $1" >&2
      echo "run with --help for usage" >&2
      exit 64
      ;;
  esac
done

hook_url="${NETLIFY_BUILD_HOOK_URL:-}"

if [ -z "$hook_url" ]; then
  if ! command -v security >/dev/null 2>&1; then
    echo "no NETLIFY_BUILD_HOOK_URL set and \`security\` not found (non-macOS host?)" >&2
    echo "either export NETLIFY_BUILD_HOOK_URL, or run on macOS with a keychain entry" >&2
    exit 1
  fi

  hook_url="$(security find-generic-password \
                -s "$KEYCHAIN_SERVICE" \
                -a "$KEYCHAIN_ACCOUNT" \
                -w 2>/dev/null || true)"

  if [ -z "$hook_url" ]; then
    echo "no hook URL found." >&2
    echo "set one of:" >&2
    echo "  export NETLIFY_BUILD_HOOK_URL='https://api.netlify.com/build_hooks/...'" >&2
    echo "  security add-generic-password -s ${KEYCHAIN_SERVICE} -a ${KEYCHAIN_ACCOUNT} -w '<url>'" >&2
    exit 1
  fi
fi

if ! [[ "$hook_url" =~ ^https://api\.netlify\.com/build_hooks/[A-Za-z0-9]+$ ]]; then
  echo "hook URL does not look like a Netlify build-hook URL: ${hook_url%/*}/<redacted>" >&2
  echo "expected: https://api.netlify.com/build_hooks/<id>" >&2
  exit 1
fi

query=""
if [ "$clear_cache" -eq 1 ]; then
  query="?clear_cache=true"
fi

# Curl args. Build hook accepts an optional JSON body { "trigger_title": "..." }
# for the dashboard label. Title is metadata only; rebuild branch comes from
# the hook configuration (default = main).
curl_args=(
  -sS
  -X POST
  -o /dev/null
  -w 'HTTP %{http_code} | %{time_total}s\n'
  "${hook_url}${query}"
)

if [ -n "$title" ]; then
  curl_args+=(
    -H 'Content-Type: application/json'
    -d "{\"trigger_title\":$(printf '%s' "$title" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"
  )
fi

echo "→ triggering ${SITE_NAME} build${title:+ (title: $title)}${clear_cache:+ (cache cleared)}..."
curl "${curl_args[@]}"

cat <<EOF
→ watch progress: https://app.netlify.com/projects/${SITE_NAME}/deploys
→ live URL:       https://${SITE_NAME}.netlify.app
EOF
