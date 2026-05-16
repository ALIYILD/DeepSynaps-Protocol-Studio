#!/usr/bin/env bash
# DeepSynaps Protocol Studio — GitHub Push Script
# Usage: GITHUB_USERNAME=youruser GITHUB_TOKEN=ghp_xxx ./push-to-github.sh [repo-name]

set -euo pipefail

REPO_NAME="${1:-DeepSynaps-Protocol-Studio}"
USERNAME="${GITHUB_USERNAME:-}"
TOKEN="${GITHUB_TOKEN:-}"
VISIBILITY="${REPO_VISIBILITY:-public}"

if [[ -z "$USERNAME" ]]; then
    read -rp "Enter your GitHub username: " USERNAME
fi

if [[ -z "$TOKEN" ]]; then
    read -rsp "Enter your GitHub Personal Access Token (with 'repo' scope): " TOKEN
    echo
fi

echo "============================================"
echo "  DeepSynaps Protocol Studio — GitHub Push"
echo "============================================"
echo ""
echo "Repository: $REPO_NAME"
echo "Visibility: $VISIBILITY"
echo "Username:   $USERNAME"
echo ""

# Step 1: Create GitHub repository via API
echo "[1/6] Creating GitHub repository..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Authorization: token $TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    https://api.github.com/user/repos \
    -d "{\"name\":\"$REPO_NAME\",\"private\":$( [[ "$VISIBILITY" == "private" ]] && echo "true" || echo "false" ),\"description\":\"DeepSynaps Protocol Studio — Phase 3 Multimodal Intelligence Engine for clinical decision support\",\"auto_init\":false}")

if [[ "$HTTP_STATUS" == "201" ]]; then
    echo "      Repository created successfully."
elif [[ "$HTTP_STATUS" == "422" ]]; then
    echo "      Repository may already exist. Continuing..."
else
    echo "      WARNING: Unexpected HTTP status $HTTP_STATUS"
    echo "      Attempting to continue..."
fi

# Step 2: Set remote
echo "[2/6] Configuring git remote..."
git remote remove origin 2>/dev/null || true
git remote add origin "https://$TOKEN@github.com/$USERNAME/$REPO_NAME.git"
echo "      Remote 'origin' set to https://github.com/$USERNAME/$REPO_NAME.git"

# Step 3: Push master branch
echo "[3/6] Pushing master branch..."
git push -u origin master --force

# Step 4: Push feature branches
echo "[4/6] Pushing feature branches..."
for branch in agent-core-engines agent-reasoning-engines agent-api-frontend; do
    if git show-ref --verify --quiet "refs/heads/$branch"; then
        echo "      Pushing branch: $branch"
        git push -u origin "$branch" || echo "      WARNING: Failed to push $branch"
    else
        echo "      Branch not found locally: $branch"
    fi
done

# Step 5: Push tags (if any)
echo "[5/6] Pushing tags..."
git push --tags 2>/dev/null || echo "      No tags to push."

# Step 6: Verify
echo "[6/6] Verifying push..."
git fetch origin --prune
echo ""
echo "============================================"
echo "  PUSH COMPLETE"
echo "============================================"
echo ""
echo "Repository URL: https://github.com/$USERNAME/$REPO_NAME"
echo ""
echo "Remote branches:"
git branch -r
echo ""
echo "To clone elsewhere:"
echo "  git clone https://github.com/$USERNAME/$REPO_NAME.git"
echo ""

# Remove token from remote URL for safety
git remote set-url origin "https://github.com/$USERNAME/$REPO_NAME.git"
echo "Remote URL sanitized (token removed from config)."
