# DeepSynaps Go-Live QA Gate

## Purpose

This gate is the minimum review standard for changes made in the 48 hours
before launch.

## QA Output Contract

Every QA review must return:

- Findings
- Residual risks
- Verification gaps
- Release recommendation

## Findings Format

List findings first, ordered by severity.

Use:

```text
[severity] file-or-flow - issue
impact
required fix
```

Severity levels:

- `critical`
- `high`
- `medium`
- `low`

## Mandatory Checks

The QA agent must check:

- does the change match the request
- are there obvious regressions
- are there missing tests for the changed behavior
- are error paths named and visible
- is any deploy/runtime config affected
- is rollback clarity preserved

## Release Recommendation Rules

### GO

Use `GO` only if:

- no critical findings
- no unresolved high findings
- verification is sufficient for the changed area

### GO_WITH_CONCERNS

Use `GO_WITH_CONCERNS` only if:

- no critical findings
- remaining concerns are explicitly written
- release owner can accept the residual risk knowingly

### NO_GO

Use `NO_GO` if any of the following are true:

- critical finding exists
- high-risk regression is unresolved
- verification is missing for a launch-critical flow
- deploy impact is unknown

## Required Verification Evidence

QA should reject release readiness if the implementation report does not include:

- changed files
- commands run
- results from those commands
- summary of what behavior was verified

## Launch-Critical Bias

In the final 48 hours, QA should bias toward:

- correctness over completeness
- preserving working flows over adding polish
- reducing blast radius over expanding scope

## Final QA Summary Template

```text
Findings:
Residual risks:
Verification evidence reviewed:
Recommendation:
Reason:
```
