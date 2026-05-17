# Worktree discipline

`git worktree` is the primary defense against concurrent-session collisions in this repo. This doc covers when to use it, how to name them, and how to keep the worktree list from sprawling.

Companion docs: [`concurrent-agent-safety.md`](./concurrent-agent-safety.md), [`salvage-pr-governance.md`](./salvage-pr-governance.md).

## When to use a worktree

Use a worktree when ANY of these is true:

- The change will take longer than ~5 minutes from staging to push
- You're recovering work from a stash, untracked file, or stale clone (always — see [`salvage-pr-governance.md`](./salvage-pr-governance.md))
- You're applying a patch via `git apply --3way` that may produce conflicts
- You're touching a runtime-critical surface (see [`runtime-critical-surface-protection.md`](./runtime-critical-surface-protection.md))
- Another session has any uncommitted state in the active clone

Do NOT use a worktree for:

- A trivial one-line doc fix that takes 10 seconds
- Read-only inspection (use the active clone directly)
- Running tests in CI mode

## Naming

Format: `salvage/<short-name>` or `feat/<short-name>` or `docs/<short-name>` etc. — match the existing commit-prefix convention.

Worktree path: `/tmp/wt-<short-name>` or under `~/DeepSynaps-Protocol-Studio/.claude/worktrees/agent-<hash>` for agent-launched ones.

Keep the short name under 30 characters and descriptive enough that `git worktree list` reads cleanly.

## The sanctioned workflow

```
# 0. Always from the active clone.
cd ~/DeepSynaps-Protocol-Studio

# 1. Refresh remote refs.
git fetch origin

# 2. Branch + worktree off origin/main in one command.
git worktree add -b <branch> /tmp/wt-<short-name> origin/main

# 3. cd into worktree, do the work.
cd /tmp/wt-<short-name>
# ... edits, patches, etc.

# 4. Verify diff is what you expect BEFORE staging.
git diff --stat

# 5. Stage specific files. NEVER -A or '.'.
git add path/to/file1 path/to/file2

# 6. Commit (heredoc preserves message formatting).
git commit -m "$(cat <<'EOF'
type(scope): one-line summary

Body.
EOF
)"

# 7. Push, open PR.
git push -u origin <branch>
gh pr create --base main --title "..." --body "..."

# 8. Cleanup worktree (after PR is filed).
cd ~/DeepSynaps-Protocol-Studio
git worktree remove --force /tmp/wt-<short-name>
```

The `cd ~/DeepSynaps-Protocol-Studio && git worktree remove` step is non-optional. Orphaned worktrees accumulate fast (see § Cleanup).

## Two worktrees, one branch — never

`git worktree add` refuses to check out the same branch in two worktrees. If you hit this error, find the existing worktree (`git worktree list | grep <branch>`) and either continue work there or `git worktree remove` it before re-adding. Do not create a new branch with the same intent under a different name.

## Patch application order

When a worktree is brand-new (just `git worktree add`-ed from `origin/main`), `git apply --3way` is safer than `git apply` because it falls back to 3-way merge if the patch's context lines don't match exactly. Conflicts may surface — that's fine, resolve them.

```
git apply --3way /path/to/patch.patch
# If conflicts: edit the files, then `git add` to mark resolved
```

If a patch fails outright (not even --3way can apply), the patch is too stale or too broad. Treat as abort-eligible per [`salvage-pr-governance.md`](./salvage-pr-governance.md).

## When to clean up

Clean up a worktree:

- ✅ Immediately after the PR is filed (`gh pr create` returned a URL)
- ✅ When you've decided to abort the work
- ✅ When you've finished a triage and don't need the worktree anymore

Do NOT clean up:

- ❌ Before pushing — you'll lose unstaged work
- ❌ During CI iteration on the PR — you may need to push more commits

## Cleanup commands

```
# Remove a specific worktree.
git worktree remove --force /tmp/wt-<short-name>

# Delete the branch locally (if you don't want to keep it around).
git branch -D <branch>   # only after PR is closed/merged; never for in-flight PRs

# Audit orphaned worktrees.
git worktree list

# Prune metadata for worktrees whose directories have been deleted.
git worktree prune
```

This repo's active worktree list already has 25+ worktrees from past agent runs. That's fine for forensic purposes; just don't conflate them with active work. Worktrees under `.claude/worktrees/agent-*` are agent-launched; worktrees under `~/.hermes/{worktrees,kanban}` belong to Hermes.

## Worktrees under `.gitignore`

`.hermes_worktrees/`, `.claude_worktrees/`, and `.qoder_worktrees/` are gitignored per `CONTRIBUTING.md` § "Cleaning local artifacts". They will never be committed. The cleanup script `scripts/clean-local-artifacts.sh` handles them.

NEVER manually `git add` an agent worktree directory. If you see them in `git status`, run the cleanup script.

## What a healthy worktree life cycle looks like

1. Worktree created (00:00)
2. Patch applied or edits made (00:00–00:02)
3. `git diff --stat` review (00:02)
4. Smoke check / targeted test (00:02–00:04)
5. Stage + commit (00:04)
6. Push + PR (00:05)
7. Worktree removed (00:05)

Total: 5 minutes from start to clean state. The longer the worktree sits, the higher the chance of drift, collision, or forgetting which worktree owned what change.

## Recovering a "lost" worktree

If you cleaned up a worktree before pushing and need to recover the work:

1. `git reflog` on the active clone often shows the branch's last known SHA.
2. `git checkout -b recovery/<branch> <sha>` in a new worktree.
3. If the work was in a stash (not committed), `git stash list` and look for entries you may have missed.
4. As a last resort, `git fsck --lost-found` may find dangling commits.

Do not try to recover by re-applying the original patch from scratch — the conflict resolution work you did is what's been lost, not the patch itself.

## Anti-patterns

- ❌ Editing `~/DeepSynaps-Protocol-Studio` directly on the `main` branch.
- ❌ Creating a worktree from a feature branch (always from `origin/main`).
- ❌ Keeping a worktree around for "I might need it later." Either ship the PR or remove the worktree.
- ❌ Removing a worktree with `rm -rf` instead of `git worktree remove`. Leaves stale metadata under `.git/worktrees/`.
- ❌ Naming worktrees generically (`/tmp/wt`, `/tmp/work`). Use a descriptive short-name.

## Final principle

> A worktree is a contract: this checkout is for ONE PR, lives for ONE work session, and goes away as soon as the PR is filed.

If a worktree has been around for more than a day, either it's blocked on something external (CI, review) or it should be cleaned up.
