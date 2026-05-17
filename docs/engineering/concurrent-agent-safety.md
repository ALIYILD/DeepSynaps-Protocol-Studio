# Concurrent-agent safety

Multiple AI sessions edit this repo in parallel. This doc captures the failure modes, the defensive patterns that work, and the anti-patterns that have caused incidents.

Companion docs: [`worktree-discipline.md`](./worktree-discipline.md), [`pr-hygiene-and-drift-disclosure.md`](./pr-hygiene-and-drift-disclosure.md), [`salvage-pr-governance.md`](./salvage-pr-governance.md).

## Who else is in the repo

Any of the following may be editing this checkout right now, often without your session knowing:

- Other Claude Code sessions in `~/DeepSynaps-Protocol-Studio` (foreground or `isolation: worktree` subagents)
- Cursor sessions in the same checkout
- Codex CLI runs (independent worktrees, but pushing to the same remote)
- Hermes profiles (Fly coordinator on `hermes-ali`, scoped worktrees under `~/.hermes/worktrees/`)
- OpenClaw subagents and orchestrators
- Cron-driven services (nightly evidence enrichment, dataset jobs)
- The human operator themselves

The remote has been seeing 5-10+ PRs per day with active CI billing. Assume something is always happening.

## Failure modes seen in this repo

| Incident | Pattern | Root cause |
|----------|---------|------------|
| Concurrent session reset on branch (2026-04-30+) | Edits silently reverted between `Edit` and `git add` | Another session ran `git reset --hard` or `git checkout --` on the same branch |
| Worktree-revert race | Patch reverted between apply and commit, even with worktrees | Two sessions targeting the same branch via worktree |
| PR contamination | A squash-merge bundled commits from another concurrent session | Same base branch shared; second session pushed before the first's PR merged |
| Runaway agent master branch (2026-05-16) | 6 zero-ancestry branches building a parallel codebase | Autonomous agent on a remote machine bypassed worktree discipline |
| Subagent write denial | Delegated writes fail silently because parent permission mode propagates | Subagents inherit parent's restrictive Bash permission state |

Memory anchors: `deepsynaps-concurrent-session-chaos`, `deepsynaps-concurrent-session-reset-on-branch`, `deepsynaps-worktree-when-revert-races`, `deepsynaps-pr-contamination-triage`, `deepsynaps-runaway-agent-master-branch`, `openclaw-subagent-write-tool-denial`.

## Defensive patterns that work

### 1. Worktree per PR

Every non-trivial change goes into its own worktree off `origin/main`, not into the active clone's `main` branch. See [`worktree-discipline.md`](./worktree-discipline.md). The worktree's index cannot be hijacked by a sibling session's `git checkout` on the parent clone.

### 2. Foreground-only writes

The current permission mode denies Bash to subagents (`openclaw-subagent-write-tool-denial`). Treat the deepsynaps-* subagent fleet as read-only useful (audit, grep, summarize). Land every write from the parent session foreground. If you need parallelism, run subagents in parallel for *triage* only, then file PRs sequentially in the foreground.

### 3. Commit + push within ~60 seconds

The longer your dirty worktree sits, the higher the chance another session reverts or resets your branch. Stage → commit → push in one continuous flow. No "I'll come back to this in an hour."

### 4. `merge-base` before trusting any diff

```
git merge-base origin/main HEAD
git diff $(git merge-base origin/main HEAD) HEAD --stat
```

A diff showing 6000 lines may be 200 lines of real change + 5800 lines of stale parentage from an old branch base. Always trust `merge-base` output, never trust a raw `git diff` against `origin/main` without it.

### 5. `--force-with-lease`, never `--force`

If you must force-push your own salvage branch, `--force-with-lease` aborts if the remote has moved since you last fetched. Plain `--force` will silently destroy a sibling session's pushed commit. The `runaway-agent-master-branch` incident is the cautionary tale.

### 6. Identify agent-authored work before trusting it

```
git log --author="agent@deepsynaps.ai" --all --oneline
git merge-base origin/main <suspect-branch>
```

Autonomous agents have built parallel codebases (`apps/api/src/deepsynaps/` instead of `apps/api/app/`). If `merge-base` returns nothing or a very old commit, the branch is not a normal feature branch and should be archived, not reviewed.

### 7. Never `cd` into a stale clone to "do new work"

Stale clones (`~/Desktop/DeepSynaps-Protocol-Studio`, `~/DeepSynaps-Protocol-Studio-pr877`, Hermes/Conductor sibling worktrees) are forensic evidence, not working trees. See [`salvage-pr-governance.md`](./salvage-pr-governance.md). Pull, salvage, and commit only from the canonical active clone.

## Anti-patterns

- ❌ Running `git checkout main && git pull && <edit> && git push origin main` directly. This is the single most common cause of contamination in this repo. **Always branch-then-PR.**
- ❌ Delegating writes to a subagent without verifying the permission mode. The denial is silent at delegation time and discovered only at the first Bash call.
- ❌ Leaving uncommitted changes overnight. Another session has likely reset or moved on by morning.
- ❌ Using `git stash pop` blindly. Stash indices shift under concurrent activity; refer to stashes by SHA, per `deepsynaps-stash-drop-by-sha`.
- ❌ Trusting a stash label to describe the stash content. The label reflects the BRANCH the stash was taken on, not what's in it.
- ❌ Force-pushing a shared branch. Only ever `--force-with-lease` your own salvage branch.
- ❌ Using `clean -fd` to "tidy up". You may be deleting another session's WIP.

## When you see unfamiliar state in `git status`

If your fresh checkout shows files you did not author:

1. Do NOT `git checkout --` or `git restore` to "clean it up". That's another session's WIP.
2. `git stash push -m "another-session-wip-<date>"` to set it aside.
3. If you have to undo your own work and `git status` is mixed with sibling work, stash first, work second, restore selectively.

If your branch has commits you did not author:

1. `git log --author` to identify who.
2. If the author email is `agent@deepsynaps.ai` or similar autonomous-agent identity, `git merge-base origin/main HEAD` before doing anything else. If merge-base is empty or ancient, the branch is suspect.
3. Don't merge or rebase such branches until the human operator has confirmed they're intended.

## Subagent spawning rules

- Spawn subagents in parallel only for read-only triage (auditing patches, grepping for symbols, summarizing logs).
- Never spawn subagents in parallel for git writes. They will collide on `.git/worktrees/` lock files even if the project state looks isolated.
- Subagents under this permission mode cannot use Bash. Plan for it by either (a) running entirely in foreground, or (b) accepting that the subagent will return a "blocked on Bash" message and you'll execute the plan yourself.

## Codex / Hermes coordination notes

- Codex worktrees push to the same `origin`; assume Codex PRs may appear independently and overlap with yours.
- Hermes Fly coordinator runs cron-triggered tasks; the nightly evidence enrichment is on the LaunchAgent at 03:00. Avoid heavy backend test runs between 02:55–04:00.
- Hermes profile worktrees under `~/.hermes/{worktrees,kanban}` are theirs to manage. Do not touch them from the Claude Code session.
- OpenClaw orchestrators sometimes spawn subagents in this repo too. Treat their pushes as just another concurrent session.

## Final principle

> Assume the repo is being edited by someone else right now. Plan for it.

Defensive patterns are not paranoia; they are the cheapest insurance against the systemic risks of multi-agent collaboration. The cost of one bad merge is higher than the cost of always using a worktree.
