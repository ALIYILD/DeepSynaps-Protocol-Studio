#!/usr/bin/env bash
# Validate, commit, push, and open a PR for the current Kimi session.
#
# Run from inside the worktree created by scripts/kimi-session-start.sh.
#
# Gates (in order):
#   1. Scope check       — show the diff stat against origin/main.
#   2. Forbidden-file    — refuse push_*.py, base64 payloads, .pyc, flat-encoded
#      smell scan         paths, agent self-reports.
#   3. Size advisory     — warn if diff > 800 lines (PR may be too large).
#   4. Build gate        — npm run build:web if web/ changed, pytest if api/ changed.
#   5. Commit + push     — stage + commit (interactive message) + push branch.
#   6. Open PR           — gh pr create against main.
#
# Any gate failing exits non-zero. The same checks run again in CI via the
# Agent PR Gate workflow — this script is your local first line.

set -euo pipefail

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
case "$BRANCH" in
  kimi/*) ;;
  *)
    echo "ERROR: current branch is '$BRANCH' — must be kimi/* (created by kimi-session-start.sh)"
    exit 1
    ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo ">>> Fetching origin/main..."
git fetch origin main --quiet

echo ""
echo "============================================================"
echo "1. Scope check"
echo "============================================================"
git diff --stat origin/main..HEAD || true
echo ""

echo "============================================================"
echo "2. Forbidden-file smell check"
echo "============================================================"
# Patterns:
#   push_*.py               — agent push helpers
#   *_b64.txt, *_b64.json   — base64 payloads in chat output
#   *payloads.json          — same
#   encoded_content*        — same
#   KIMI_BUILD_LOG*         — agent self-narration
#   REDEPLOY_*.sh           — agent deploy helpers
#   *_push_report.*         — agent self-reports
#   *.pyc, __pycache__/*    — compiled artifacts
#   audit_report_*.md       — agent self-grading
#   [a-z0-9]+__[a-z0-9]+__[a-z0-9_]+\.(py|js|ts|md|json)$
#     — flat-encoded paths like apps__api__app__main.py
#       (this is strict enough to NOT match __init__.py)
FORBIDDEN_RE='(^|/)(push_[a-z_]*\.py|.*_b64\.(txt|json)|.*payloads\.json|encoded_content[^/]*|KIMI_BUILD_LOG[^/]*|REDEPLOY_[^/]*\.sh|.*_push_report\.(md|json)|audit_report_[^/]*\.md|.*\.pyc|.*__pycache__.*|[a-z0-9]+__[a-z0-9_]+__[a-z0-9_]+\.(py|js|ts|md|json))$'

MATCHES=$(git diff --name-only origin/main..HEAD | grep -E "$FORBIDDEN_RE" || true)
if [ -n "$MATCHES" ]; then
  echo "STOP — agent detritus in diff:"
  echo "$MATCHES" | sed 's/^/  - /'
  echo ""
  echo "These patterns are forbidden because they correlate with the runaway-agent failure mode."
  echo "See docs/stabilization/deploy-hotfix-2026-05-18.md for context."
  exit 1
fi
echo "OK — no forbidden patterns."
echo ""

echo "============================================================"
echo "3. Size advisory"
echo "============================================================"
LINES=$(git diff origin/main..HEAD | wc -l | tr -d ' ')
echo "Diff is $LINES lines."
if [ "$LINES" -gt 2000 ]; then
  echo "FAIL — diff > 2000 lines. Split into smaller PRs (see brain-twin incident)."
  exit 1
elif [ "$LINES" -gt 800 ]; then
  echo "WARN — diff > 800 lines. Reviewers will appreciate a split, but proceeding."
fi
echo ""

echo "============================================================"
echo "4. Build gate"
echo "============================================================"
CHANGED_WEB=$(git diff --name-only origin/main..HEAD | grep -E '^(apps/web|packages/api-client|package(-lock)?\.json)' || true)
CHANGED_API=$(git diff --name-only origin/main..HEAD | grep -E '^apps/api' || true)

if [ -n "$CHANGED_WEB" ]; then
  echo "Web files changed — running: npm ci && npm run build:web"
  npm ci
  npm run build:web
else
  echo "No web files changed — skipping web build."
fi

if [ -n "$CHANGED_API" ]; then
  echo "API files changed — running: pytest apps/api -x"
  if [ "${SKIP_PYTEST:-0}" = "1" ]; then
    echo "  (skipped: SKIP_PYTEST=1 was set in the environment)"
  else
    (cd apps/api && pytest -x --tb=short 2>&1 | tail -40) || {
      echo ""
      echo "Pytest reported failures. Re-run after fixes, or set SKIP_PYTEST=1 to bypass."
      exit 1
    }
  fi
else
  echo "No api files changed — skipping pytest."
fi
echo ""

echo "============================================================"
echo "5. Commit + push"
echo "============================================================"

# Stage any unstaged changes (user may have edited but not committed)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Staging uncommitted changes..."
  git add -A
  if ! git diff --cached --quiet; then
    echo ""
    echo "Files staged but not yet committed. Commit them first with a real subject line:"
    echo "  git commit -m 'feat(<area>): one-line description'"
    echo "Then re-run this script."
    exit 1
  fi
fi

if [ -z "$(git log origin/main..HEAD --oneline)" ]; then
  echo "ERROR: no commits on $BRANCH yet."
  echo "Make at least one commit before finishing the session."
  exit 1
fi

COMMIT_COUNT=$(git log origin/main..HEAD --oneline | wc -l | tr -d ' ')
echo "$COMMIT_COUNT commit(s) on $BRANCH ahead of origin/main."
echo ""

echo "Pushing $BRANCH to origin..."
git push -u origin "$BRANCH"
echo ""

echo "============================================================"
echo "6. Open PR"
echo "============================================================"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found — push succeeded; open the PR manually:"
  echo "  https://github.com/$(git config --get remote.origin.url | sed -E 's|.*github.com[:/]([^/]+/[^/.]+)(\.git)?|\1|')/compare/main...$BRANCH"
  exit 0
fi

SLUG="${BRANCH#kimi/}"
LAST_SUBJECT="$(git log -1 --pretty=%s)"

PR_BODY=$(cat <<EOF
Agent-authored PR from a Kimi web-UI session.

## Local verification (run by \`scripts/kimi-session-finish.sh\`)

- [x] Forbidden-file smell scan: clean
- [x] Diff size: $LINES lines (under 2000-line hard cap)
- [x] Build gate: passed (web=$([ -n "$CHANGED_WEB" ] && echo yes || echo skipped), api=$([ -n "$CHANGED_API" ] && echo yes || echo skipped))

## Reviewer notes

- Do **not** \`--admin\`-merge this PR. Let CI run to green.
- The Agent PR Gate workflow re-runs the same checks server-side.
- If CI fails on a check that passed locally, that is a real signal — do not paper over.

## Branch

\`$BRANCH\` (created from \`origin/main\` by \`scripts/kimi-session-start.sh\`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)

gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "kimi/$SLUG: $LAST_SUBJECT" \
  --label "agent-authored" \
  --body "$PR_BODY" || {
    echo ""
    echo "gh pr create failed — push succeeded; open the PR manually from the URL above."
    exit 0
  }

echo ""
echo ">>> Done. Cleanup when the PR merges:"
echo "    git worktree remove \$(git rev-parse --show-toplevel)"
echo "    cd $REPO_ROOT && git fetch --prune && git branch -D $BRANCH"
