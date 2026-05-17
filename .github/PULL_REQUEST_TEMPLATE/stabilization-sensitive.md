<!--
Opt-in PR template for changes touching stabilization-sensitive surfaces.

This is NOT a default template — GitHub only uses it when the user
appends `?template=stabilization-sensitive.md` to the New PR URL, or
selects it from the template picker. Default PRs are unaffected.

When to use: any PR that touches a surface named in
docs/stabilization/governance-lock-2026-05-17.md § 1 (PRESERVED or
ABANDONED) or docs/engineering/runtime-critical-surface-protection.md
"Stabilization-sensitive surfaces" section.

See also:
- docs/stabilization/governance-lock-2026-05-17.md § 4.2 (mandatory checklist)
- docs/engineering/runtime-critical-surface-protection.md
- docs/engineering/salvage-pr-governance.md
- docs/engineering/pr-hygiene-and-drift-disclosure.md

Delete sections that genuinely do not apply before submitting.
-->

## Summary

<!--
1-3 sentences. User-visible impact first.
Avoid implementation detail in the summary.
-->

## Stabilization-sensitive surfaces touched

<!--
Required. Name each surface from:
- docs/stabilization/governance-lock-2026-05-17.md § 1.1 (ABANDONED — should normally be NONE)
- docs/stabilization/governance-lock-2026-05-17.md § 1.2 (PRESERVED)
- docs/engineering/runtime-critical-surface-protection.md (full list)

If none, state "none — this PR does not touch a stabilization-sensitive
surface". Then ask why this template is being used at all.

If ANY ABANDONED symbol appears in your diff, this PR is a governance
violation unless it explicitly names "architectural reversal of the
2026-05-17 abandonment" as its task. Stop and re-scope before continuing.
-->

## Governance lock acknowledgement

<!--
Required. Verbatim:

> I have read `docs/stabilization/governance-lock-2026-05-17.md` § 1
> and confirm this PR does NOT re-introduce any ABANDONED symbol.

If you cannot make this statement, your PR is in scope of a
governance reversal and needs explicit task ownership before review.
-->

## Additive-only declaration

<!--
Required. One of:

(a) "This PR is additive-only on stabilization-sensitive surfaces"
    — new functions, new files, new endpoints, opt-in feature flags
    that default to off, etc.

(b) "Non-additive change authorized by [task / issue / explicit
    instruction]" — then cite the source.

Removing, renaming, or restructuring a stabilization-sensitive surface
without (b) is rejected at review.
-->

## Drift

<!--
Optional. Only if `main` moved on the touched files between when this
PR branched and now.

Example:
"`main` added the X / Y exports to `<file>` between this PR branching
off `<sha>` and now. The merge keeps main's exports verbatim and slots
the new helper below them."

Omit this section if there's no drift.
-->

## Files intentionally untouched

<!--
Recommended for any PR with adjacent stranded work.

A short list of files NOT touched and why. Pre-empts
"did you mean to leave X alone?" review questions.

Example:
- pages-agents.js overlay state machinery (toolOverlay, hireOverlay) —
  preserved per governance lock § 1.2
- CLAUDE.md — actively edited by other sessions
-->

## Concurrent sessions / agents involved

<!--
Optional. If multiple agents collaborated or the PR was salvaged from
a sibling session's worktree, name it.

Example:
"Authored from the parent Claude Code session foreground per
openclaw-subagent-write-tool-denial memory."
-->

## Test plan

<!--
Bulleted checklist. Mix manual + automatic. Mark `[x]` only what you
actually ran. Be honest about what failed and why.

Example:
- [x] Local: `cd apps/web && node --check src/<file>.js` → OK
- [ ] CI: backend tests
- [ ] CI: web-unit lane
- [ ] Manual: <one specific click-path or curl>
-->

## Abort considered?

<!--
For stabilization-sensitive PRs only. If you nearly aborted but
proceeded, name what tipped the decision. Helps future PRs calibrate.

Example: "Considered aborting at the merge conflict on <file>, but
the conflict was a clean superset choice — took 'theirs' and verified
2/2 tests pass."

If no abort was considered, omit this section.
-->
