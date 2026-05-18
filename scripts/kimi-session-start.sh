#!/usr/bin/env bash
# Set up an isolated worktree for a Kimi (or any chat-AI) coding session.
#
# Model: one chat = one branch = one PR.
#
# Usage:   bash scripts/kimi-session-start.sh <slug>
# Example: bash scripts/kimi-session-start.sh handbook-export-pdf
#
# What this does:
#   1. Refuses if your current repo has uncommitted changes (you'd lose context).
#   2. Refreshes origin/main.
#   3. Creates branch  kimi/<slug>  off the latest origin/main.
#   4. Creates a worktree at  /tmp/kimi-sessions/<slug>  so the Kimi work
#      cannot collide with your active checkout.
#   5. Prints the canonical constraint prompt for you to paste into Kimi.
#   6. Prints the next steps.
#
# When you finish:  cd into the worktree, then run
#                   bash scripts/kimi-session-finish.sh

set -euo pipefail

SLUG="${1:-}"

if [ -z "$SLUG" ]; then
  echo "Usage: $0 <slug>"
  echo "Example: $0 handbook-export-pdf"
  exit 1
fi

if ! [[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ ]]; then
  echo "ERROR: slug must be lowercase letters/digits/dashes, e.g. handbook-export-pdf"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
BRANCH="kimi/$SLUG"
WORKTREE="/tmp/kimi-sessions/$SLUG"

cd "$REPO_ROOT"

if [ -d "$WORKTREE" ]; then
  echo "ERROR: worktree already exists at $WORKTREE"
  echo "       remove it first: git worktree remove $WORKTREE"
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "ERROR: branch already exists: $BRANCH"
  echo "       pick a different slug or delete it: git branch -D $BRANCH"
  exit 1
fi

echo ">>> Fetching origin/main..."
git fetch origin main --quiet

echo ">>> Creating worktree at $WORKTREE on new branch $BRANCH (from origin/main)..."
mkdir -p "$(dirname "$WORKTREE")"
git worktree add -b "$BRANCH" "$WORKTREE" origin/main

cat <<'PROMPT'

============================================================
PASTE THIS AT THE START OF YOUR KIMI CHAT:
============================================================
Constraints for this session. Follow these strictly:

1. Output one file per response. Format every response as:
     PATH: <absolute repo path from repo root, e.g. apps/web/src/foo.js>
     ```<language>
     <full file content>
     ```
2. No base64. No flat-encoded paths (no foo__bar__baz.py). No helper
   scripts I should run (no push_*.py, no decoder scripts, no shell
   scripts).
3. Edit files where they already exist. Do not create parallel
   directory trees. Do not invent apps/api/src/ or similar.
4. I will run `npm run build:web` and `pytest` myself. Do not produce
   build logs, audit reports, or self-grading docs.
5. If a file would exceed one chat message, stop and ask before
   splitting. Never split arbitrarily.
6. For each change, after the file block, add a one-line note:
     VERIFY: <command I should run, e.g.
              `npm run build:web` or `pytest apps/api/tests/test_foo.py`>
7. Do not claim to have committed, pushed, or deployed anything.
   You cannot. I do that.

Task: <describe the single thing you want done — one paragraph>
============================================================
PROMPT

cat <<EOF
>>> Worktree ready.

Next steps:
    cd $WORKTREE
    # Apply Kimi's files in your editor as they come in.
    # Run each VERIFY: command Kimi gives you BEFORE asking for the next file.
    # When the session is done, while still inside $WORKTREE:
    bash scripts/kimi-session-finish.sh

Bail-out (throws away the session safely):
    git worktree remove $WORKTREE
    git branch -D $BRANCH
EOF
