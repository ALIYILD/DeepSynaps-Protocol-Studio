# Engineering process docs

Process documentation for DeepSynaps Studio engineering workflow. Distinct from clinical governance (which lives directly under `docs/`).

These docs codify lessons learned from concurrent multi-agent work, stale-clone salvage, and CI stabilization waves. They are advisory; the runtime stack does not enforce them. They exist so that the next person who walks into a salvage, a worktree mess, or a "did this PR really land what I think it landed" question can find the canonical answer.

## Index

| Doc | Purpose |
|-----|---------|
| [`salvage-pr-governance.md`](./salvage-pr-governance.md) | Recovering stranded work from stale clones / stashes without contaminating `main`. The reference doc for any "salvage" PR. |
| [`concurrent-agent-safety.md`](./concurrent-agent-safety.md) | How multiple AI sessions (Claude Code, Cursor, Codex, Hermes, OpenClaw) share this repo safely. |
| [`worktree-discipline.md`](./worktree-discipline.md) | When and how to use `git worktree`. Naming, isolation, cleanup. |
| [`pr-hygiene-and-drift-disclosure.md`](./pr-hygiene-and-drift-disclosure.md) | PR sizing, single-concern boundaries, provenance + drift sections. |
| [`runtime-critical-surface-protection.md`](./runtime-critical-surface-protection.md) | Surfaces where additive-only discipline is mandatory. The "do not touch unless explicitly tasked" list. |
| [`future-safeguards.md`](./future-safeguards.md) | Documentation-only ideas for future CI / validation safeguards. Not implemented; tracked here so the design space is captured. |

## How to use these

- **Starting a salvage PR?** Read [`salvage-pr-governance.md`](./salvage-pr-governance.md) first.
- **Spawning subagents or coordinating with Codex/Hermes?** Read [`concurrent-agent-safety.md`](./concurrent-agent-safety.md).
- **About to touch a backend service, the qEEG pipeline, evidence DB, or any "important" file?** Read [`runtime-critical-surface-protection.md`](./runtime-critical-surface-protection.md).
- **Filing any PR?** The hygiene rules in [`pr-hygiene-and-drift-disclosure.md`](./pr-hygiene-and-drift-disclosure.md) apply, not just to salvage.

## Philosophy

DeepSynaps engineering aims for:

- **Auditability** — every change traceable to a person, agent, or recovery decision
- **Deterministic workflows** — same input + same workflow = same result
- **Explicit provenance** — PR bodies say where work came from
- **Honest state reporting** — "tests fail on main, not introduced by this PR" beats silent fixes
- **Additive changes** — small, single-concern, low blast radius
- **Clinic-safe culture** — the people who depend on this software treat real patients

These principles are not bureaucracy. They are the cheapest way to keep a fast-moving multi-agent repo from drifting into a state where nobody understands what shipped or why.

## When to add a new doc here

Add a new doc under `docs/engineering/` when:

- You codify a process that applies to multiple PRs / multiple agents / multiple sessions
- The lesson came from an incident worth remembering across humans and sessions
- The content doesn't fit in a single existing doc

Do NOT add a doc here for:

- A single bug fix (use PR body)
- Clinical / evidence governance (use `docs/`)
- Runtime architecture (use `docs/architecture/`)
- One-time project plans (use the appropriate planning location, not here)

Keep new docs:

- Single-concern, < 250 lines
- Cross-linked to the relevant memory / incident
- Honest about what is advisory vs enforced
