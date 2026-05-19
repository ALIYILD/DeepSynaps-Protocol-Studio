# Concurrent-session policy — automated enforcement

**Status:** Active. Enforced by `.github/workflows/concurrent-session-check.yml` from this PR forward.

This document defines what the CI gate enforces (versus what the
operational governance docs document but cannot block).

## Why this exists

`docs/engineering/runtime-critical-surface-protection.md` already lists
the protected surfaces and the additive-only discipline. It ends with
an honest concession:

> "The stabilization-sensitive subset is enforced by **human review at
> the PR gate**, not by CI."

That gap is what bit us on 2026-05-18. A single direct-to-main commit
(`6d495ce4 feat(wiring): Complete rewrite of main.py — Intelligent
Synaps v4 wiring`) rewrote `apps/api/app/main.py` wholesale (-1153
+557, 96% of the file). The rewrite:

- Removed `/healthz` and `/api/v1/health` endpoints
- Changed the `/health` response shape (sync → async, dropped DB session, dropped clinical_snapshot/version)
- Activated a parallel 38-file `apps/api/app/adapters/` codebase that had been quietly accumulating across ~40 prior direct-to-main commits

Recovery required 4 PRs (#1041–#1044) and ~29 000 line deletions. No
human reviewed the rewrite before it landed.

This policy closes the loop by adding a CI gate on the single most
impactful failure mode: **a single commit performing a wholesale
rewrite of a protected runtime file.**

## The rule

A commit FAILS the gate when, for any file in the protected list, it
deletes BOTH:

1. **≥ 400 lines** (`REWRITE_THRESHOLD_DELETIONS`), AND
2. **≥ 40 %** of the file's previous line count (`REWRITE_THRESHOLD_PCT`).

Either threshold alone is fine. A 600-line deletion from a 10 000-line
generated file is not a rewrite; a 100-line deletion from a 200-line
file is also not a rewrite. **Both** thresholds together identify a
real wholesale rewrite without false-positive friction.

## Protected files

| File | Why protected |
|---|---|
| `apps/api/app/main.py` | 2026-05-18 v4 incident (this policy's motivating event). |
| `apps/web/src/app.js` | 2026-05-18 hotfix #1034 — concurrent-session reverter incidents. |
| `apps/web/src/api.js` | 2026-05-18 cursor-buffer-revert + apiFetch dedup hotfix. |
| `apps/web/src/pages-knowledge-explorer.js` | Stabilization-sensitive page renderer; explicitly named for freeze. |
| `apps/web/src/pages-brain-twin.js` | Same. |
| `apps/web/src/pages-agents.js` | Marketplace overlay state machine — see `runtime-critical-surface-protection.md` § "Frontend overlay surface". |

The list is intentionally narrow. Every entry has an incident behind
it; speculative protection causes false-positive friction without
value. To add a file, link an incident or PR that motivates it.

## How to override

If a wholesale rewrite is genuinely intended (e.g., a planned migration
to FastAPI v3 lifespan; an architecture-reversal scope explicitly
approved in advance), add this marker to the commit message body:

```
concurrent-session-policy: allow=wholesale-rewrite
```

The checker honours the marker per commit. Reviewers see the marker in
the diff and can approve or reject — the gate moves the decision from
post-merge cleanup to pre-merge review.

Use sparingly. Splitting a rewrite into incremental commits is almost
always preferable: each commit individually fails to trip the gate,
each commit is bisectable, and the eventual end-state still ships.

## What this gate does NOT enforce

This is a deliberately narrow gate. It does NOT:

- Detect parallel-codebase landings (a brand-new directory tree of N
  files arriving in one push). The v4 incident did this across ~40
  commits over several days; per-commit additions are individually
  benign and only the wiring commit (caught above) made them live.
  Detection here would require directory-level heuristics that are
  prone to false positives on legitimate new features.
- Detect direct-to-main pushes that bypass PRs. GitHub branch
  protection rules are the right tool for that (not CI).
- Enforce the operational rules in `concurrent-agent-safety.md`
  (one-agent-one-worktree, foreground-only writes, etc.) — those are
  human discipline, not file-based.

If a future incident exposes a new failure mode that *is* file-based,
add a new rule here rather than overloading this one.

## Companion documents

- `docs/engineering/concurrent-agent-safety.md` — operational rules (worktrees, foreground-only writes, force-with-lease)
- `docs/engineering/worktree-discipline.md` — when to use worktrees and how
- `docs/engineering/pr-hygiene-and-drift-disclosure.md` — what to disclose in PR bodies
- `docs/engineering/runtime-critical-surface-protection.md` — full critical-surface taxonomy (broader than this gate)
- `docs/engineering/runtime-hygiene-policy.md` — sister gate against test-only imports leaking into runtime

## Memory anchors

- `cursor-buffer-reverts-disk-edits` — buffer-replay reverters
- `deepsynaps-concurrent-session-chaos` — the broad pattern
- `deepsynaps-runaway-agent-master-branch` — autonomous agent + direct-to-main
- `deepsynaps-v4-rewrite-revert-2026-05-19` — this policy's motivating incident
