# DeepSynaps Studio - Overnight Swarm Summary

## 1. High-level status

- Date: `2026-04-26`
- Requested lane branches were not present locally:
  - `deps/audit`
  - `qa/e2e`
  - `qa/visual`
  - `obs/sentry-otel`
  - `perf/reliability`
  - `ux/polish`
- Verified overnight branches/worktrees present locally:
  - `launch-readiness-audit`
  - `api/fix-fixture-order-failures`
  - `web/split-clinical-tools-bundle`
  - `practice/programs-page`

## 2. Critical / high issues

| Severity | Area | Short description | Lane | Branch | Needs human review? |
|---------|------|-------------------|------|--------|---------------------|
| Critical | Auth / roles | DeepTwin patient-scoped endpoints lacked clinician/admin gating. Fix exists on the audit branch, but this is a release-sensitive access-control change. | `launch_audit` | `launch-readiness-audit` | Yes |
| High | Auth | Demo login was enabled in `staging` / `production`. Audit branch changes block it with `403 demo_login_disabled`. | `launch_audit` | `launch-readiness-audit` | Yes |
| High | Auth UX / QA | Unauthenticated deep-link flow to private routes did not reliably force login overlay behavior. Audit branch adds the fix and regression coverage. | `launch_audit` | `launch-readiness-audit` | Yes |
| High | Verification | Full backend suite was not completed end-to-end during the audit window. A longer unattended pass is still required. | `launch_audit` | `launch-readiness-audit` | Yes |

Notes:
- No verified overnight repo evidence was found for the placeholder `qEEG Analyzer` critical issue from the draft template.
- No local evidence was found for the requested `qa/e2e` lane branch.

## 3. Safe changes applied overnight

- `launch-readiness-audit`
  - Tightened demo auth behavior for non-dev environments.
  - Added clinician-or-admin gating for DeepTwin patient-scoped endpoints.
  - Fixed unauthenticated deep-link login behavior.
  - Added regression coverage in API and web tests.
- `api/fix-fixture-order-failures`
  - Repaired MRI analyze/report round-trip and timeline test coverage.
- `web/split-clinical-tools-bundle`
  - Split `pages-clinical-tools` into 5 sub-page chunks to reduce bundle pressure and isolate route-level loading.
- `practice/programs-page`
  - Replaced the Programs stub with a 3-tab Education Programs page, with supporting API wiring and styles.

Lane mapping status:
- `deps/audit`: no local branch/report found
- `qa/e2e`: no local branch/report found
- `qa/visual`: no local branch/report found
- `obs/sentry-otel`: no local branch/report found
- `perf/reliability`: no local branch/report found
- `ux/polish`: no local branch/report found

## 4. Items explicitly NOT auto-merged

Explicit `REVIEW_REQUIRED` matches:
- `.\scripts\generate_overnight_swarm_summary.py:166:            "REVIEW_REQUIRED",`
- `.\scripts\generate_overnight_swarm_summary.py:253:        lines.append("Explicit `REVIEW_REQUIRED` matches:")`
- `.\scripts\generate_overnight_swarm_summary.py:257:        lines.append("No local branches or artifacts were explicitly labeled `REVIEW_REQUIRED`.")`
- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:56:Explicit `REVIEW_REQUIRED` matches:`
- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:57:- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:56:Explicit `REVIEW_REQUIRED` matches:``
- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:58:- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:57:- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:56:No local branches or artifacts were explicitly labeled `REVIEW_REQUIRED`.```
- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:59:- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:58:- `.\scripts\generate_overnight_swarm_summary.py:166:            "REVIEW_REQUIRED",```
- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:60:- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:59:- `.\scripts\generate_overnight_swarm_summary.py:243:        lines.append("Explicit `REVIEW_REQUIRED` matches:")```
- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:61:- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:60:- `.\scripts\generate_overnight_swarm_summary.py:247:        lines.append("No local branches or artifacts were explicitly labeled `REVIEW_REQUIRED`.")```
- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:62:- `.\scripts\generate_overnight_swarm_summary.py:166:            "REVIEW_REQUIRED",``
- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:63:- `.\scripts\generate_overnight_swarm_summary.py:243:        lines.append("Explicit `REVIEW_REQUIRED` matches:")``
- `.\docs\OVERNIGHT_SWARM_SUMMARY.md:64:- `.\scripts\generate_overnight_swarm_summary.py:247:        lines.append("No local branches or artifacts were explicitly labeled `REVIEW_REQUIRED`.")``

The following changes still require human review before merge:
- Area: Auth / DeepTwin access
  - Branch: `launch-readiness-audit`
  - Summary: Role gating was tightened for patient-scoped DeepTwin routes.
  - Why: Access-control changes are release-sensitive and need explicit reviewer confirmation.
- Area: Release audit / verification
  - Branch: `launch-readiness-audit`
  - Summary: Audit branch contains auth hardening, UX fixes, and launch-readiness findings.
  - Why: Full backend verification is still incomplete.
- Area: Frontend architecture / performance
  - Branch: `web/split-clinical-tools-bundle`
  - Summary: Large route/module split of the clinical tools surface.
  - Why: Heavy refactor size warrants smoke testing on chunk loading and navigation.

## 5. Recommended next steps (today)

- Review and merge `launch-readiness-audit` first.
- Run a full unattended backend test pass before making any release call.
- Smoke test private-route auth, DeepTwin clinician access, and demo-login behavior in a production-like environment.
- Manually test `web/split-clinical-tools-bundle` for route loading, chunking, and regressions.
- Treat the requested lane list as stale until the missing branches or reports are surfaced.

## Evidence basis

This summary was generated from the local repo state on `2026-04-26`, using:
- current branch and diff state
- local worktree/branch inventory
- `LAUNCH_READINESS_REPORT.md`
- commit history and diff stats for verified overnight branches
