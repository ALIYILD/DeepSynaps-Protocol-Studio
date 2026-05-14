#!/bin/bash
echo "=== BRANCH MERGE STATUS ==="
echo ""

for branch in $(git branch -r | grep -E 'origin/(feat|fix)/' | sed 's|origin/||'); do
    commit_hash=$(git rev-parse origin/$branch 2>/dev/null)
    
    # Check if this commit exists in main
    if git log origin/main --oneline | grep -q "^${commit_hash:0:7}"; then
        status="✅ MERGED"
    else
        # Check if main has this commit
        if git merge-base --is-ancestor origin/$branch origin/main 2>/dev/null; then
            status="✅ MERGED (ancestor)"
        else
            status="⏳ OPEN"
        fi
    fi
    
    subject=$(git log -1 --format="%s" origin/$branch 2>/dev/null | cut -c1-50)
    echo "$branch | $status | $subject"
done | column -t -s'|'
