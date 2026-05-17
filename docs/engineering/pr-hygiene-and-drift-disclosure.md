# PR hygiene and drift disclosure

How to write a PR so that reviewers, future engineers, and future agents can trust what they're reading.

Companion docs: [`salvage-pr-governance.md`](./salvage-pr-governance.md), [`concurrent-agent-safety.md`](./concurrent-agent-safety.md).

## The four PR hygiene rules

1. **Single concern.** One PR, one problem solved. If your PR title needs "and", it's probably two PRs.
2. **Additive when possible.** Adding code is reversible; rewriting code is risky in a multi-agent repo. Default to adding new functions/files; replace existing ones only when the task requires it.
3. **Honest about scope.** If your diff includes a "while I was here" fix, either remove it or call it out in the PR body. Surprise scope is a contamination vector.
4. **Drift-aware.** If main moved between when you started and when you opened the PR, say so.

## Sizing

| Size | When it's OK | When it's a smell |
|------|--------------|-------------------|
| 1–50 lines | Most PRs. Single fix, single feature stub, small doc | Never |
| 50–200 lines | Single coherent feature with tests | "Drive-by" cleanup added |
| 200–500 lines | New module + tests, or feature + needed refactor | Multiple concerns mixed |
| 500–1000 lines | Net-new system that genuinely can't split | Cross-cutting refactor of existing code |
| > 1000 lines | Almost always wrong | Almost always wrong |

These are guidelines, not gates. A 50-line PR that quietly changes a serialization format is more dangerous than a 5000-line PR that adds a new isolated package.

## Single-concern test

Before opening a PR, ask:

- Can I describe what changed in one sentence without using "and"?
- If I revert this PR, do I undo exactly one thing?
- Does my commit list tell a single coherent story?

If any answer is "no", split the PR.

## Required PR body sections (any non-trivial PR)

### `## Summary`

What changed, in 1–3 sentences. Lead with user-visible impact, not implementation detail.

### `## Test plan`

A bulleted checklist of what to verify. Mix automatic (CI lanes) and manual. If you ran any tests locally, mark them checked.

```markdown
## Test plan

- [x] Local: `cd apps/web && node --test src/<file>.test.js` → 2 pass, 0 fail
- [ ] CI: backend tests
- [ ] CI: web-unit lane
- [ ] Manual: trigger toast in stub clinic, verify new wording
```

## Required for salvage PRs

### `## Provenance`

Where did this work come from? Stale-clone stash, untracked file, dropped PR, agent recovery, etc. One paragraph.

```markdown
## Provenance

Recovered from a stale-workspace stash whose parent commit was
`<sha>`. <One sentence on why it sat un-merged>.
```

### `## Drift`

If `main` moved on the touched files between the stash time and now, name what moved and how the merge resolved.

```markdown
## Drift

`main` added the X / Y / Z exports to `<file>` between the stash time
and now. The merge keeps main's exports verbatim and slots the new
helper below them.
```

If there's no drift, omit the section.

## Required for any PR touching runtime-critical surfaces

See [`runtime-critical-surface-protection.md`](./runtime-critical-surface-protection.md) for the surface list.

### `## Runtime surface impact`

Name the surface(s) you touched, and describe the change as additive-only / contract-preserving / breaking. If breaking, link to the migration / contract update.

```markdown
## Runtime surface impact

Touches: `apps/api/app/routers/agent_config_router.py` (new file),
`apps/api/app/main.py` (one import + one include_router line).

Surface: agent-config API endpoints. Additive only — no existing
endpoint changed. New table `agent_configs` was already on main via
migration `100_agent_configs`; this PR adds the ORM model + router.
```

## Recommended for every PR

### `## Files intentionally untouched`

For PRs where the reviewer might wonder "did you mean to leave X alone?", a short list of files NOT touched and why. This pre-empts review questions and documents scope discipline.

```markdown
## Files intentionally untouched

- `apps/web/src/pages-agents.js` — overlay system is in flux; the
  patient-picker addition will land in a separate PR after that
  settles.
- `CLAUDE.md` — actively edited by other sessions; out of scope.
```

### `## Concurrent sessions / agents involved`

If multiple agents collaborated, or if the PR was salvaged from a sibling session's worktree, name it. This makes the multi-agent provenance explicit.

```markdown
## Concurrent sessions / agents involved

Recovered from a stale Desktop clone stash from an earlier Cursor
session. No subagent delegation in this PR — written from the parent
Claude Code session foreground per `openclaw-subagent-write-tool-denial`.
```

## Anti-patterns in PR bodies

- ❌ "Various improvements." Name them or split them.
- ❌ "Fixes #N." Without explaining what changed. The issue may be wrong about the fix.
- ❌ "Refactored for clarity." Refactors are not clarifications. Say what moved where.
- ❌ Promising future work in the PR body that's not in this PR's scope.
- ❌ Claiming tests pass that you didn't actually run.
- ❌ Marking CI lanes as `[x]` before CI has actually reported back.

## Honest state reporting

Better to admit a known gap than to imply it doesn't exist:

```markdown
- [ ] Note: `node --test src/<file>.test.js` on this branch tripped on
  the existing `_vaBackendSessions is not defined` error that's
  already on main — that's the documented web-unit assertion-drift
  lane, not introduced by this PR.
```

This is the **drift disclosure** pattern. It tells the reviewer "I saw a failure, here's why I'm filing anyway, here's the lane responsible." Reviewers can trust you because you didn't pretend the failure didn't happen.

## Multi-commit vs single-commit PRs

| Use multiple commits when | Use a single commit when |
|---------------------------|--------------------------|
| Each commit is independently revertable | The change can't bisect smaller |
| The PR has logical phases (refactor → add → test) | The change is small (< 50 lines) |
| You want bisectable git history | The branch will be squash-merged anyway |

This repo squash-merges by default (see `CLAUDE.md` § "Deploy Configuration"). Squash collapses commit messages, so commit hygiene matters less than PR-body hygiene. But for review legibility, separate commits per concern still helps.

## When to abort instead of opening a PR

- The diff is more than you intended → split into smaller PRs or abort
- Conflicts proliferate during merge resolution → see [`salvage-pr-governance.md`](./salvage-pr-governance.md) § Abort conditions
- The change touches more than 2–3 runtime surfaces → reconsider scope
- You can't write a 1-sentence summary without "and" → split

## Final principle

> The PR body is the audit trail. Future agents and humans read it to decide whether to trust this change.

Honesty about scope, drift, and concurrent context costs nothing at PR time and saves enormous time at review and rollback.
