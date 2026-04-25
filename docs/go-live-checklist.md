# DeepSynaps 48-Hour Go-Live Checklist

## Goal

This checklist exists to focus the final 48 hours on launch readiness rather
than new platform construction.

## 1. Freeze Scope

- Stop non-launch feature work.
- Stop broad refactors.
- Stop new agent-system work.
- Define the list of launch-critical flows.
- Create one task card per launch-critical blocker.

## 2. Confirm Owners

- Human Release Owner confirmed
- Lead Agent active
- Implementation Agent active
- QA Agent active

## 3. Validate Environments

- Preview deployment command works
- Required auth is available for deploy commands
- Production environment variables confirmed
- Database target confirmed
- Health endpoint path confirmed

## 4. Launch-Critical Flows

Mark each as `pass`, `fail`, or `not_applicable`.

- app loads successfully
- login works
- clinician critical path works
- patient critical path works
- payments or billing flow works
- API health returns `ok`
- frontend can reach expected backend
- core data read/write path works
- major error states are visible and named

## 5. Verification Commands

Run only what is relevant, but capture the result.

- backend tests
- frontend tests
- frontend build
- health endpoint smoke test
- preview deploy if needed

## 6. QA Gate

Before any release candidate:

- diff reviewed
- regressions checked
- critical findings resolved
- residual risks written down
- recommendation recorded as `GO`, `GO_WITH_CONCERNS`, or `NO_GO`

## 7. Release Readiness

- release notes written in plain language
- rollback path known
- owner knows which deploy command to run
- secrets are not pasted into chat or committed
- post-deploy smoke checks defined

## 8. Post-Deploy Smoke Check

After deploy, verify:

- app is reachable
- health endpoint is healthy
- one clinician path works
- one patient path works
- no immediate error spike in logs

## 9. Rollback Trigger Conditions

Rollback immediately if any of these happen:

- app does not load
- login fails
- health endpoint fails
- billing flow breaks
- launch-critical workflow breaks
- severe data integrity issue appears

## 10. End-of-Day Summary

At the end of each go-live day, publish:

```text
Completed today:
Still blocked:
Highest-risk unresolved item:
Release readiness:
Next first task:
```
