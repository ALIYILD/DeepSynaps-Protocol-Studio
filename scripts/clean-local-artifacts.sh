#!/bin/bash
# clean-local-artifacts.sh — Remove local agent worktrees and temporary build artifacts
#
# Usage: ./scripts/clean-local-artifacts.sh [--dry-run]
#
# Removes:
# - .hermes_worktrees/ (Hermes agent sandboxes)
# - .claude_worktrees/ (Claude Code worktrees)
# - .qoder_worktrees/, .codex_worktrees/ (other agent tooling)
# - __pycache__/, .pytest_cache/, .ruff_cache/ (Python)
# - node_modules/, dist/, build/ (Node/build)
# - coverage/, .coverage* (test coverage)
# - *.pyc, *.log (misc)
#
# Never committed; safe to remove.

set -e

DRY_RUN=0
if [ "$1" = "--dry-run" ] || [ "$1" = "-n" ]; then
    DRY_RUN=1
    echo "🔍 DRY RUN — no changes will be made"
    echo ""
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== CLEANING LOCAL ARTIFACTS ==="
echo "Repository: $REPO_ROOT"
echo ""

# Counters
DELETED_COUNT=0
SIZE_FREED=0

# Function to remove with dry-run support
remove_pattern() {
    local pattern=$1
    local description=$2
    
    while IFS= read -r -d '' item; do
        if [ -n "$item" ]; then
            SIZE=$(du -sh "$item" 2>/dev/null | awk '{print $1}' || echo "?")
            if [ "$DRY_RUN" = 1 ]; then
                echo "  Would remove: $item ($SIZE)"
            else
                rm -rf "$item"
                echo "  Removed: $item ($SIZE)"
            fi
            ((DELETED_COUNT++))
        fi
    done < <(find . -name "$pattern" -type d -print0 2>/dev/null)
}

# Agent worktrees
echo "🧹 Agent worktrees:"
remove_pattern ".hermes_worktrees" "Hermes Agent"
remove_pattern ".claude_worktrees" "Claude Code"
remove_pattern ".qoder_worktrees" "Qoder"
remove_pattern ".codex_worktrees" "Codex"

# Python artifacts
echo ""
echo "🧹 Python artifacts:"
remove_pattern "__pycache__" "Python cache"
remove_pattern ".pytest_cache" "pytest cache"
remove_pattern ".ruff_cache" "ruff cache"
find . -name "*.pyc" -type f -delete 2>/dev/null && echo "  Removed: *.pyc files"
find . -name "*.pyo" -type f -delete 2>/dev/null && echo "  Removed: *.pyo files"

# Node/build artifacts
echo ""
echo "🧹 Build artifacts:"
remove_pattern "node_modules" "node_modules"
remove_pattern "dist" "dist/"
remove_pattern "build" "build/"

# Test coverage
echo ""
echo "🧹 Test coverage:"
remove_pattern "coverage" "coverage/"
remove_pattern ".coverage" ".coverage*"
find . -name "coverage.xml" -type f -delete 2>/dev/null && echo "  Removed: coverage.xml"
find . -name "htmlcov" -type d -delete 2>/dev/null && echo "  Removed: htmlcov/"

# Logs
echo ""
echo "🧹 Logs & temp:"
find . -name "*.log" -type f -delete 2>/dev/null && echo "  Removed: *.log files"
find . -name ".test_artifacts" -type d -delete 2>/dev/null && echo "  Removed: .test_artifacts/"

echo ""
if [ "$DRY_RUN" = 1 ]; then
    echo "✅ DRY RUN COMPLETE — No changes made"
    echo ""
    echo "To actually clean, run:"
    echo "  ./scripts/clean-local-artifacts.sh"
else
    echo "✅ CLEANUP COMPLETE"
fi

echo ""
echo "Safe to commit after cleanup."
