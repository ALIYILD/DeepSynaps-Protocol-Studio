# Future safeguards (documentation only — not implemented)

Design space for future CI / validation checks that would mechanically enforce the principles in [`salvage-pr-governance.md`](./salvage-pr-governance.md), [`pr-hygiene-and-drift-disclosure.md`](./pr-hygiene-and-drift-disclosure.md), and [`runtime-critical-surface-protection.md`](./runtime-critical-surface-protection.md).

These are **not built**. This doc exists so that the next person evaluating "should we add a CI lane for X?" can see what's been considered, what trade-offs the design has, and what's intentionally been left out.

## Status

| Item | Status | Why not built yet |
|------|--------|-------------------|
| Drift detection | Not built | Heuristic; risk of false positives on legitimate refactors |
| Oversized PR warning | Not built | Easy to game; better as advisory comment than gate |
| Stale clone warning | Not built | Runs locally, not in CI; would need a pre-push hook |
| Overlay-coupling heuristic | Not built | Needs codebase-specific heuristics; high false-positive risk |
| Concurrent-session metadata | Not built | Requires git-trailer convention nobody's signed up to follow yet |
| Provenance validation | Not built | Could grep PR body for `## Provenance`; simple to add when desired |
| Worktree hygiene checks | Not built | Local cleanliness, not CI-visible |

## Candidate safeguards

### Drift-detection check

**Idea:** A CI job that compares the touched files against `git log --since=14.days.ago --name-only` and warns if more than N% of touched files have had heavy churn in the last two weeks.

**Why useful:** Catches salvage PRs whose patches were written against a stale tree.

**Risks:** False positives during stabilization waves where many files churn legitimately.

**Recommended form:** comment-only on PR, not a blocking check. Threshold tunable.

**Implementation sketch:**
```yaml
# .github/workflows/drift-advisory.yml (not built)
name: Drift advisory
on: pull_request
jobs:
  drift-check:
    runs-on: ubuntu-latest
    steps:
      - name: Compare touched files vs recent churn
        run: |
          # Score = (files touched in PR) ∩ (files churned in last 14d)
          # If score > 30%, post advisory comment
```

### Oversized-PR warning

**Idea:** Post a comment when a PR's net diff exceeds 500 lines OR touches more than 15 files OR mixes more than 3 top-level directories.

**Why useful:** Cheap nudge toward single-concern discipline.

**Risks:** Net-new packages legitimately have large diffs.

**Recommended form:** comment with the size + the heuristic, do not block. Reviewer decides.

**Implementation sketch:**
```yaml
# .github/workflows/pr-size-advisory.yml (not built)
on: pull_request
jobs:
  size:
    steps:
      - run: |
          ADDED=$(git diff --shortstat origin/${{github.base_ref}} | awk '...')
          if [ "$ADDED" -gt 500 ]; then echo "::warning ::Large PR ($ADDED lines added)"; fi
```

### Stale-clone warning (pre-push hook)

**Idea:** A `pre-push` git hook that compares `HEAD`'s base against `origin/main` and warns if the base is more than N commits behind.

**Why useful:** Catches "I'm pushing from a clone that's been sitting for two weeks."

**Risks:** Hooks aren't enforced (developers can `--no-verify`).

**Recommended form:** advisory, in the repo's `.githooks/` with documented opt-in via `git config core.hooksPath`.

**Implementation sketch:**
```bash
# .githooks/pre-push (not built)
behind=$(git rev-list --count HEAD..origin/main)
if [ "$behind" -gt 50 ]; then
  echo "WARNING: HEAD is $behind commits behind origin/main."
  echo "Consider rebasing or branching off a fresh origin/main."
fi
```

### Overlay-coupling heuristic

**Idea:** A lint rule that flags PRs touching ≥ 3 of the known overlay call-sites (`toolOverlay`, `hireOverlay`, `_renderMarketplaceModal`, modal lifecycle helpers) in the same PR.

**Why useful:** Catches the "stash replaced overlays at N call-sites" pattern that aborted PR-C on 2026-05-17.

**Risks:** Hard-coded list of "overlay" names goes stale fast.

**Recommended form:** repo-specific script under `scripts/check-overlay-coupling.sh`, advisory-only.

### Concurrent-session metadata

**Idea:** A git commit-trailer convention like `Concurrent-sessions: 0` / `Concurrent-sessions: 2` to record how many other sessions were active when the commit was made.

**Why useful:** Audit trail for incident response — "PR contamination on 2026-05-13 happened during peak concurrency."

**Risks:** Trailers must be self-reported; no enforcement; honest only if the human/agent remembers.

**Recommended form:** documentation-only. Not enforceable. Track via memory entries (`deepsynaps-pr-contamination-triage`) instead.

### Provenance-section validation

**Idea:** A CI check that greps the PR body for `## Provenance` if the branch name starts with `salvage/`.

**Why useful:** Mechanical enforcement of [`salvage-pr-governance.md`](./salvage-pr-governance.md) § Drift disclosure format.

**Risks:** Trivial to satisfy without writing real content.

**Recommended form:** advisory comment, not blocking. If the heading is missing on a `salvage/*` branch, post: "Salvage PRs should include `## Provenance` and (if applicable) `## Drift` sections per `docs/engineering/pr-hygiene-and-drift-disclosure.md`."

**Implementation sketch:**
```yaml
# .github/workflows/salvage-pr-provenance-advisory.yml (not built)
on:
  pull_request:
    types: [opened, edited]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - if: startsWith(github.head_ref, 'salvage/')
        run: |
          body=$(gh pr view ${{github.event.pull_request.number}} --json body -q .body)
          echo "$body" | grep -q '## Provenance' || gh pr comment ... --body "..."
```

### Worktree hygiene checks

**Idea:** A local script `scripts/check-worktrees.sh` that audits `git worktree list` and warns about worktrees older than 7 days, or worktrees on branches that have been merged.

**Why useful:** Helps developers clean up the accumulated worktree list (currently 25+).

**Risks:** Local-only; never enforced.

**Recommended form:** add to the existing `scripts/clean-local-artifacts.sh` family, opt-in.

### Auto-detection of agent-authored zero-ancestry branches

**Idea:** A nightly CI job that lists branches with `git merge-base origin/main <branch>` returning empty or ancient and posts a summary to a triage issue.

**Why useful:** Surfaces runaway-agent branches before they get accidentally reviewed (per `deepsynaps-runaway-agent-master-branch` incident).

**Risks:** Could surface legitimate long-running release branches.

**Recommended form:** nightly cron, post a comment to a single rolling triage issue, do not auto-delete.

## What we are NOT planning to build

These are explicitly out of scope, with reason:

| Idea | Why not |
|------|---------|
| Pre-commit hook for "must include Provenance section" | Too invasive; hooks bypassed with --no-verify anyway |
| Branch naming policy gate | Too rigid; legitimate one-off names happen |
| Automatic PR splitter | Too magical; humans should make the splitting decision |
| Mandatory reviewer based on touched surface | We have CODEOWNERS conventions; redundant |
| Locked files (codeowners with required review) | This is `runtime-critical-surface-protection.md`'s domain, advisory not enforced |
| Auto-archive of agent-authored branches | High blast radius; needs human in the loop |
| Linting "while I was here" diffs | Heuristic that can't tell intent from text |

## How to graduate an item from this doc to implemented

If one of these becomes worth building:

1. Open an RFC issue with the design + cost + maintenance burden estimate.
2. Implement as an advisory check first (comment-only, never blocking).
3. Run it in advisory mode for at least 2 weeks before any "gate" promotion.
4. Document the gate in [`pr-hygiene-and-drift-disclosure.md`](./pr-hygiene-and-drift-disclosure.md) so contributors know it exists.
5. Move the entry from "Candidate safeguards" to "Implemented" in this file (or remove it if it's now self-documenting via the workflow file).

## Final principle

> Mechanical enforcement is a tax. Pay it only when the disclosure pattern is failing on its own.

The current state — written discipline + memory entries + honest PR bodies — has worked through several salvage waves and CI stabilization sprints. Add CI gates only when you see a specific failure mode the advisory doesn't catch.
