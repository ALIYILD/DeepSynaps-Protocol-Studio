# DeepSynaps Go-Live Agent Team v1

## Purpose

This is the minimal agent operating model for the final 48 hours before launch.
It is intentionally narrow. It is designed to reduce coordination overhead,
surface blockers early, and keep deployment authority controlled.

This is not a full autonomous agent organization.

It is a launch-mode delivery loop with:
- one coordinator
- one implementation worker
- one QA/review worker
- one human release owner

## Ready Assets

These repo assets now define the launch team directly:

- `config/agent-team/go-live-team.json`
- `docs/agents/go-live-lead.md`
- `docs/agents/go-live-implementer.md`
- `docs/agents/go-live-qa.md`
- `docs/agents/release-brief.md`
- `docs/agents/launch-task-board.md`

## Hard Constraints

- No autonomous production deployment.
- No agent makes roadmap decisions during go-live.
- No agent silently expands scope.
- No agent marks work done without verification output.
- Every task has exactly one owner and exactly one verifier.

## Roles

### 1. Lead Agent

Role:
- intake a request
- inspect the repo state
- identify affected areas
- choose the next highest-value task
- assign one implementation owner
- request QA review before release
- report outcome clearly

Responsibilities:
- keep scope narrow
- prevent overlapping edits
- stop non-launch work from entering the queue
- maintain a visible status line for every active task

Required output:
- task summary
- scope
- owner
- verifier
- acceptance criteria
- current status

### 2. Implementation Agent

Role:
- make the code or config change
- run the smallest relevant verification commands
- report exactly what changed

Responsibilities:
- touch only owned files unless reassigned
- keep diffs minimal
- run relevant tests/builds/smoke checks
- surface blockers immediately

Required output:
- changed files
- commands run
- results
- unresolved risks

### 3. QA / Review Agent

Role:
- review the diff independently
- identify regressions, missing tests, risky behavior changes, and weak assumptions
- decide go / no-go for release readiness

Responsibilities:
- do not re-implement the feature
- focus on correctness, regressions, and launch risk
- escalate any missing verification

Required output:
- findings ordered by severity
- residual risks
- release recommendation: `GO`, `GO_WITH_CONCERNS`, or `NO_GO`

### 4. Human Release Owner

Role:
- final deployment authority
- approve or reject release based on the evidence
- trigger preview or production deployment

Responsibilities:
- own secrets and credentials
- own rollback approval
- own final production sign-off

## Operating Loop

Use this loop for every go-live task.

1. Lead Agent defines one task.
2. Implementation Agent changes only what is needed.
3. Implementation Agent runs verification and reports.
4. QA Agent reviews the result and issues a release recommendation.
5. Human Release Owner decides whether to deploy.
6. Lead Agent publishes a plain-language summary.

## Task Card Template

Copy this structure for every active launch task.

```text
TASK:
Owner:
Verifier:
Scope:
Acceptance criteria:
Files expected:
Verification required:
Status:
Blockers:
```

## Status Model

Use only these statuses:

- `queued`
- `in_progress`
- `qa_review`
- `ready_for_release`
- `blocked`
- `done`

## Allowed Task Types During Go-Live

- critical bug fix
- deploy blocker removal
- smoke-test failure fix
- auth/payment/runtime correction
- launch-page correction
- monitoring/logging gap for launch-critical flows

## Disallowed Task Types During Go-Live

- broad refactors
- speculative platform improvements
- nice-to-have UX polish
- new architectural systems
- new autonomous agent infrastructure
- non-essential data model changes

## Launch Priority Order

Always process work in this order:

1. production outage or deploy blocker
2. authentication and access failures
3. payment or billing failures
4. core clinician workflow failures
5. patient-facing critical path failures
6. launch messaging/content errors
7. non-critical polish

## File Ownership Guidance

Use one implementation owner per task area:

- `apps/api/**`, `packages/**`, `scripts/**`, `services/**`: backend owner
- `apps/web/**`, `e2e/**`: frontend owner
- `.github/**`, `fly.toml`, `netlify.toml`, deployment scripts: release-focused owner
- `docs/**`: lead or reporting owner

If a task spans backend and frontend, split it into two linked tasks unless the
change is tiny and tightly coupled.

## Required Evidence Before Release

No task is release-ready unless the task card includes:

- changed files
- exact commands run
- command outcomes
- QA recommendation
- rollback note if the change affects launch-critical behavior

## Release Rule

Deployment is allowed only when all of the following are true:

- implementation output is complete
- QA output is complete
- there is no unresolved `NO_GO` finding
- rollback path is known
- the Human Release Owner approves

## Final Reporting Format

Every completed task should end with this structure:

```text
Request:
What changed:
Files changed:
Verification:
QA result:
Release decision:
Follow-up:
```

## Recommendation for the Next 48 Hours

Do not build more agent roles right now.

Run with:
- one Lead Agent
- one Implementation Agent
- one QA Agent
- one Human Release Owner

If load increases, add a second implementation worker only after the first loop
is operating cleanly.
