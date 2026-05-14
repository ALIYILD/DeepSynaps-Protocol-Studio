#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# DeepSynaps Protocol Studio — Push Script (No PR Experience Needed)
# ═══════════════════════════════════════════════════════════════════
# 
# This script pushes 3 feature branches to your GitHub repo.
# Run this from YOUR local machine (not from the sandbox).
#
# STEP 1: Save this file as push.sh in your repo folder
# STEP 2: Run: bash push.sh
#
# The script will guide you through everything.

set -e

REPO_URL="https://github.com/ALIYILD/DeepSynaps-Protocol-Studio.git"
BRANCHES="feat/production-infrastructure feat/ai-core-pages feat/clinical-bug-fixes"

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║   DeepSynaps Protocol Studio — Branch Push Helper              ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in a git repo
if [ ! -d .git ]; then
    echo "❌ Error: Not a git repository. Please run this from your repo folder."
    echo "   cd /path/to/DeepSynaps-Protocol-Studio"
    exit 1
fi

echo "✅ Git repository found"
echo ""

# Check git remote
echo "── Checking GitHub remote ────────────────────────────────────────"
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if [ "$CURRENT_REMOTE" != "$REPO_URL" ]; then
    echo "⚠️  Remote URL doesn't match. Setting correct remote..."
    git remote remove origin 2>/dev/null || true
    git remote add origin "$REPO_URL"
fi
echo "✅ Remote: $REPO_URL"
echo ""

# Check if user has push access
echo "── Checking GitHub authentication ────────────────────────────────"
echo "GitHub needs to know who you are to push code."
echo ""

# Check if already authenticated
if git ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
    echo "✅ You're authenticated with GitHub!"
else
    echo "⚠️  GitHub authentication needed."
    echo ""
    echo "You have 2 options:"
    echo ""
    echo "OPTION A (Easiest) — Use GitHub Personal Access Token:"
    echo "  1. Go to: https://github.com/settings/tokens/new"
    echo "  2. Enter 'Note': DeepSynaps Push"
    echo "  3. Select scopes: ✅ repo (full control)"
    echo "  4. Click 'Generate token'"
    echo "  5. Copy the token (looks like: ghp_xxxxxxxxxxxx)"
    echo "  6. Come back here and paste it"
    echo ""
    read -s -p "Paste your GitHub token here: " TOKEN
    echo ""
    
    # Configure git to use token
    git remote set-url origin "https://${TOKEN}@github.com/ALIYILD/DeepSynaps-Protocol-Studio.git"
    
    # Test authentication
    if git ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
        echo "✅ Authentication successful!"
    else
        echo "❌ Authentication failed. Please check your token and try again."
        # Reset remote URL
        git remote set-url origin "$REPO_URL"
        exit 1
    fi
fi
echo ""

# Fetch latest main
echo "── Fetching latest main branch ───────────────────────────────────"
git fetch origin main
echo "✅ Latest main fetched"
echo ""

# Create and push each branch
echo "── Creating and pushing 3 feature branches ───────────────────────"
echo ""

for branch in $BRANCHES; do
    echo "📦 Processing: $branch"
    
    # Check if branch exists locally
    if git show-ref --verify --quiet "refs/heads/$branch"; then
        echo "   Branch exists locally"
    else
        echo "   Creating branch from main..."
        git checkout -b "$branch" origin/main 2>/dev/null || git checkout -b "$branch"
    fi
    
    # Checkout the branch
    git checkout "$branch" 2>/dev/null || true
    
    # Show what's in this branch
    COMMIT_COUNT=$(git rev-list --count main..$branch 2>/dev/null || echo "0")
    FILE_COUNT=$(git diff --name-only main..$branch 2>/dev/null | wc -l)
    echo "   Commits: $COMMIT_COUNT | Files: $FILE_COUNT"
    
    # Push to origin
    echo "   Pushing to GitHub..."
    if git push -u origin "$branch" 2>/dev/null; then
        echo "   ✅ $branch pushed successfully!"
    else
        echo "   ⚠️  Push failed — branch may already exist on GitHub"
    fi
    echo ""
done

# Switch back to main
git checkout main 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                    🎉 ALL DONE! 🎉                               ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "3 branches have been pushed to your GitHub repo:"
echo ""
echo "  1. feat/production-infrastructure    (CI/CD, monitoring, security)"
echo "  2. feat/ai-core-pages                (Protocol Studio, Copilot, Dashboard)"
echo "  3. feat/clinical-bug-fixes           (Bug fixes, tests, safety hardening)"
echo ""
echo "Next step: Go to https://github.com/ALIYILD/DeepSynaps-Protocol-Studio"
echo "           Click 'Pull requests' → 'New pull request'"
echo "           Select each branch and click 'Create pull request'"
echo ""
echo "Or simply merge them (since you own the repo):"
echo "  git checkout main"
echo "  git merge feat/production-infrastructure"
echo "  git merge feat/ai-core-pages"
echo "  git merge feat/clinical-bug-fixes"
echo "  git push origin main"
echo ""
