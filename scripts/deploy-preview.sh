#!/usr/bin/env bash
#
# deploy-preview.sh — publish the current working copy to the preview stack.
#
# Usage:
#   scripts/deploy-preview.sh            # web only (Netlify), takes ~45s
#   scripts/deploy-preview.sh --api      # web + API (Fly)
#   scripts/deploy-preview.sh --api-only # API only
#
# Preview stack:
#   Web: https://deepsynaps-studio-preview.netlify.app
#   API: https://deepsynaps-studio.fly.dev
#
# Auth requirements (interactive, one-time per machine):
#   Netlify: `netlify login` (or export NETLIFY_AUTH_TOKEN)
#   Fly:     `flyctl auth login` (or export FLY_ACCESS_TOKEN)
#
# Intended workflow: any Claude Code session that just landed a feature on
# `main` can run this at the end of the task to publish the same code the
# user will open in a browser. No arguments = fastest safe default.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

NETLIFY_SITE_ID="13baea11-07e8-4ab3-9c25-af1f045c845b"
API_BASE_URL="https://deepsynaps-studio.fly.dev"

netlify_cmd="netlify"
if command -v netlify.cmd >/dev/null 2>&1; then
  # Prefer the Windows Netlify CLI when available (avoids WSL shims that may not
  # have `node` on PATH).
  netlify_cmd="netlify.cmd"
fi

want_api=0
want_web=1
case "${1:-}" in
  --api)       want_api=1 ;;
  --api-only)  want_api=1; want_web=0 ;;
  --web-only)  ;;
  "")          ;;
  *) echo "Usage: $0 [--api | --api-only | --web-only]" >&2; exit 2 ;;
esac

if [ "$want_web" = 1 ]; then
  echo "▶ Building apps/web (demo mode on, API → $API_BASE_URL)"
  (
    cd apps/web
    VITE_ENABLE_DEMO=1 VITE_API_BASE_URL="$API_BASE_URL" npx vite build
  )

  if ! command -v "$netlify_cmd" >/dev/null 2>&1; then
    echo "✗ netlify CLI not on PATH. Install: npm i -g netlify-cli" >&2
    exit 1
  fi

  echo "▶ Deploying dist/ to Netlify site $NETLIFY_SITE_ID"
  "$netlify_cmd" deploy --dir apps/web/dist --prod --site "$NETLIFY_SITE_ID"
  echo "✓ Web live: https://deepsynaps-studio-preview.netlify.app"
fi

if [ "$want_api" = 1 ]; then
  if ! command -v flyctl >/dev/null 2>&1; then
    echo "✗ flyctl not on PATH. Install: curl -L https://fly.io/install.sh | sh" >&2
    exit 1
  fi
  if ! flyctl auth whoami >/dev/null 2>&1; then
    echo "✗ Not authenticated to Fly. Run: flyctl auth login" >&2
    echo "  (or export FLY_ACCESS_TOKEN=<token> before calling this script)" >&2
    exit 1
  fi

  echo "▶ Deploying API to Fly (deepsynaps-studio)"
  flyctl deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile \
    --remote-only --yes
  echo "✓ API live: $API_BASE_URL"
fi

echo
echo "Done. Preview: https://deepsynaps-studio-preview.netlify.app"
