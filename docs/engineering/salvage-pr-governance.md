# Salvage PR Governance

How to recover stranded work — stashes, untracked files, work-in-progress sitting on stale clones or worktrees — without contaminating `main`.

This doc is engineering process, not clinical governance. For clinical and evidence governance see `docs/qeeg-safety-governance.md`, `docs/safety_evidence_policy.md`, `docs/protocol_evidence_governance.md`.

## Why this exists

The repo is edited by multiple concurrent sessions, has long-lived stale clones with accumulated stashes, several active worktrees per branch, and a feature-overlay architecture (toolOverlay, hireOverlay, modal overlay, marketplace overlay) that touches the same files from different angles. Forcing a stash patch onto current `main` without understanding what's drifted will either fail loudly (merge conflicts) or — worse — succeed quietly and ship dead code, undefined references, or two competing implementations of the same thing.

The principle: **abort an unsafe salvage rather than force-merge it.** A dropped stash is recoverable from `git fsck` for two weeks. A bad merge contaminates `main` and slows the next ten clinicians who pull it.

## Salvage eligibility (what's worth recovering)

A stash, untracked file, or commit on a stale clone is *eligible* for salvage when ALL of the following hold:

1. **Not already on `main`.** Verify with `git merge-base --is-ancestor <sha> origin/main` for commits; with `grep` for sentinel strings; with `ls` for files. Stash labels lie — the stash's parent commit may be on `main` while the stash content has nothing to do with it. Triage by content, not by label.
2. **Coherent, single-concern.** A 26-file stash bundling netlify cache headers + ORM model + UX rewrite + test infrastructure is not one salvage — it's four. Split before applying.
3. **Architecturally compatible.** If main has moved to a different design for the same surface, the stash represents a rejected alternative. Salvage is no longer the right tool; re-author from scratch is.
4. **Applies via `git apply --3way` with at most a handful of conflicts.** Many conflicts mean the file has drifted past the patch's assumptions.

If any of these fail, drop to "abort" or "re-author from scratch."

## Abort conditions (when to walk away)

Walk away — leave the source stash intact, document the decision, do not file a PR — when you see any of:

| Smell | What it usually means | Right action |
|-------|-----------------------|--------------|
| Stash adds 76-line scaffold of a router that's 3490 lines on `main` | Stash predates a now-shipped implementation | Drop the stash, no salvage |
| Stash replaces N call-sites of one system with a different system | Architecturally entangled rewrite | Abort, re-author later |
| Stash defines functions whose state vars + handlers are scattered across the file | Feature was wired through, not bolted on | Abort, re-author later |
| "While I'm here" cleanup mixed in with the actual work | Patch boundary not respected at stash time | Split the salvage or abort |
| Conflicts you can't resolve by reading 10 lines either side | Underlying file moved | Abort |
| Reapplied patch passes syntax but introduces undefined references | Companion changes lived in another stash | Abort |

**Abort > unsafe salvage.** Always. The patch will still exist tomorrow; a corrupted `main` will not.

## Overlay coupling warning

The repo has multiple overlay/modal systems that touch the same files: `toolOverlay`, `hireOverlay`, marketplace modal, agent setup wizard, hire wizard, tool permission panel, modal dialog stack. Any salvage patch that touches more than one overlay's call-sites is architectural surgery, not salvage. Treat as abort-eligible.

Signs you're in overlay-coupling territory:

- The patch replaces `${toolOverlay}${hireOverlay}` with `${_renderSomeWizard()}` at multiple render call-sites.
- The patch introduces state vars whose lifecycle (`_thingState`, `_renderThing`, `_thingStep`, `_thingComplete`) is interwoven with existing overlays.
- The patch is "additive" but adds a parallel state machine that competes with existing ones.

Real example: the 2026-05-17 AI Agents salvage (PR-C, aborted) replaced main's `toolOverlay`/`hireOverlay` at 5 tab-render call-sites with a `_renderAgentSetupWizard` system whose state (`_setupWizardAgent`, `_setupWizardStep`, `_setupWizardConfig`, `_setupWizardLoading`, `_setupWizardError`) lived at lines 4609–4715 + 5531–5560+. Cleanly extracting just the patient picker + welcome banner would have required hand-crafting a fresh patch, not merging this stash. Aborted; logged in [`deepsynaps-stash-salvage-map-2026-05-17`](../../../../.claude/projects/-Users-aliyildirim/memory/deepsynaps-stash-salvage-map-2026-05-17.md) for future re-author.

## Maximum safe diff size

| Diff size | Risk | Action |
|-----------|------|--------|
| ≤ 50 lines | Low | Apply directly, single PR |
| 50–200 lines | Medium | Apply, but split if multiple concerns |
| 200–500 lines | High | Must be single-concern; verify with `git diff --stat` before commit |
| > 500 lines | Architectural | Not a salvage. Either split or re-author |

These are guidelines, not hard limits. A 600-line patch that adds one new router + tests is fine. A 50-line patch that changes 3 call-sites of an overlay system is not.

## Stale-clone policy

Stale clones — `~/Desktop/DeepSynaps-Protocol-Studio`, `~/DeepSynaps-Protocol-Studio-pr877`, sibling Conductor worktrees, Hermes kanban worktrees — are NOT working trees. They are source of forensic evidence for stranded work, not places to do new work.

Rules:

1. **Never `git pull` or `git checkout` on a stale clone.** That's how the runaway-agent-master-branch incident happened.
2. **Never commit or push from a stale clone.** Branches pushed from there will have outdated parent commits and contaminate PR diffs.
3. **Always salvage INTO a fresh worktree off `origin/main` in the active clone** (`~/DeepSynaps-Protocol-Studio`).
4. **Leave the stale stash intact** until the salvage PR lands, in case the diff needs to be re-read.
5. **Drop stashes by SHA, not by index.** Concurrent sessions shift stash indices. See [`deepsynaps-stash-drop-by-sha`](../../../../.claude/projects/-Users-aliyildirim/memory/deepsynaps-stash-drop-by-sha.md).

## Concurrent-session handling

Several Claude / Cursor / Hermes / Codex / OpenClaw sessions may be editing this repo simultaneously. Specifically:

- Concurrent sessions can `git reset --hard` or `git checkout --` your active branch mid-edit. See [`deepsynaps-concurrent-session-reset-on-branch`](../../../../.claude/projects/-Users-aliyildirim/memory/deepsynaps-concurrent-session-reset-on-branch.md).
- Squash-merges can bundle unintended commits if branches share a base. See [`deepsynaps-pr-contamination-triage`](../../../../.claude/projects/-Users-aliyildirim/memory/deepsynaps-pr-contamination-triage.md).
- Autonomous agents have pushed zero-ancestry branches building parallel codebases. See [`deepsynaps-runaway-agent-master-branch`](../../../../.claude/projects/-Users-aliyildirim/memory/deepsynaps-runaway-agent-master-branch.md).

The defense for salvage PRs:

1. **One worktree per PR.** `git worktree add -b salvage/<short-name> /tmp/wt-<short-name> origin/main`.
2. **Commit + push within ~60 seconds of staging.** Don't leave dirty state sitting overnight.
3. **Use `git push --force-with-lease`, never `--force`.** Only force-push your own salvage branch, never a shared branch.
4. **`git merge-base origin/main HEAD` before trusting a diff.** A 6000-line PR may actually be 200 lines of real change + 5800 lines of stale parentage.

## Drift disclosure format

Every salvage PR body MUST include a "Provenance" section, and (if applicable) a "Drift" section.

```markdown
## Provenance

Recovered from a stale-workspace stash whose parent commit was
`<sha>`. <One sentence on why it sat un-merged>.

## Drift

<Optional. If main moved on the touched file(s) between stash time and now, name what moved and how the merge resolved.>
```

If a test currently fails on `main` independently of the salvage, name the failure mode and link to the relevant lane (e.g. assertion-drift, web-unit timeout). Do not promise to "fix it as part of this PR" unless that genuinely is the scope.

## Workflow (the only sanctioned one)

```bash
# 0. From the active clone, fresh fetch.
cd ~/DeepSynaps-Protocol-Studio
git fetch origin

# 1. Worktree per PR off latest origin/main.
git worktree add -b salvage/<short-name> /tmp/wt-<short-name> origin/main

# 2. Apply the staged patch (3-way handles small drift).
cd /tmp/wt-<short-name>
git apply --3way /path/to/patch.patch

# 3. Resolve any conflicts by reading both sides.
#    If conflicts are architectural, ABORT (see § Abort conditions).

# 4. Verify diff is what you expect.
git diff --stat
git diff --cached --stat   # if --3way auto-staged

# 5. Smoke check (syntax, targeted test).
node --check apps/web/src/<changed>.js
# Skip running broader test suites locally; CI catches those.

# 6. Stage specific files. Never `git add .` or `-A`.
git add <specific-files>
git commit -m "<conventional commit>"

# 7. Push, open PR.
git push -u origin salvage/<short-name>
gh pr create --base main --title "..." --body "<includes Provenance section>"

# 8. Cleanup.
cd ~/DeepSynaps-Protocol-Studio
git worktree remove --force /tmp/wt-<short-name>
```

Anti-patterns:

- ❌ Working in the stale clone directly.
- ❌ Cherry-picking a stash commit onto `main` locally (per [`deepsynaps-concurrent-session-chaos`](../../../../.claude/projects/-Users-aliyildirim/memory/deepsynaps-concurrent-session-chaos.md), never land on `main` locally — always PR).
- ❌ Delegating the write phase to a subagent (per [`openclaw-subagent-write-tool-denial`](../../../../.claude/projects/-Users-aliyildirim/memory/openclaw-subagent-write-tool-denial.md), subagents in this config inherit a restrictive permission mode and are denied Bash). Foreground only.
- ❌ Folding "while I'm here" cleanups into a salvage PR. Stay scoped.

## Subagent fallback

Salvage cannot be safely delegated to specialist subagents (`deepsynaps-ai-agents`, `deepsynaps-clinical-hub`, etc.) under the current permission mode. Tried it on 2026-05-17 across three subagents in parallel; all three returned within seconds with Bash-denied. Use subagents for read-only triage (audit, grep, summarize patches). Land all writes from the foreground session.

## Worked example: 2026-05-17 wave

5 PRs filed, 1 aborted, 1 superseded — see [`deepsynaps-stash-salvage-map-2026-05-17`](../../../../.claude/projects/-Users-aliyildirim/memory/deepsynaps-stash-salvage-map-2026-05-17.md).

| Verdict | Why |
|---------|-----|
| #971 netlify cache headers — FILED | 15-line additive, zero conflicts, single concern |
| #972 agent-config feature — FILED | 355-line single feature (model + router + test), pattern matches existing routers |
| #973 DOM polyfill — FILED | 28-line additive; small merge conflict resolved cleanly (took the superset) |
| #975 honest empty-state toasts — FILED | 20-line copy-only change across one surface family |
| #976 video-assessments draft pattern — FILED | 62-line single-concern, 1 small conflict resolved by keeping main's new exports verbatim |
| PR-C AI Agents UX — ABORTED | 735-line patch spanning overlay system replacement at 5 call-sites + scattered state |
| Stash@{1} (3 router scaffolds) — SUPERSEDED | Main grew those routers from 76/121/77 lines to 3490/454/972; stash had nothing left to give |

## "Abort > unsafe salvage" — the only rule that matters

If the salvage attempt grows beyond its stated scope, if conflicts proliferate, if state starts looking scattered, if the diff stat surprises you — stop, leave the stash intact, write a memo, and walk away. The repo will be in a better place tomorrow.
