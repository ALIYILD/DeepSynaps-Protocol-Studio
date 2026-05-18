# Rebase report — `fix/e2e-guardian-portal-render-ready`

- **Original branch:** `origin/fix/e2e-guardian-portal-render-ready`
- **Rebased branch:** `rebase/fix-e2e-guardian-portal-render-ready-onto-main-2026-05-18` (pushed)
- **State vs main pre-rebase:** 14 commits ahead, 910 behind
- **State vs main post-rebase:** 1 commit ahead, 0 behind

## What the original branch claimed
14 commits, but only `43493c50 fix(e2e): make guardian portal readiness deterministic` was unique. The other 13 are squash-merged copies of already-on-main PRs (#897, #899, #912, #915, #916, #918, #919, #920, #922, #923, #924, #925, #926). git rebase patch-id matched them and skipped them automatically.

## Conflict file
- `apps/web/e2e/flows.spec.ts` — single conflict region at line 211.

## Conflict classification
**SAFE_TEST · MOSTLY_REDUNDANT**

The actual locator (`page.locator('[data-page="guardian-portal"]')`) is identical on both sides — `main` already adopted the marker-container approach via #913/#926. The conflict is only over an *explanatory comment block* the branch added but main did not.

## Resolution
Kept the explanatory comment from the branch — it documents *why* the marker-scoped locator is the right choice (post-fetch render race, dashboard h1 collision). Pure doc improvement, no behaviour change. Final delta:

```
 apps/web/e2e/flows.spec.ts | 11 ++++++++++-
 1 file changed, 10 insertions(+), 1 deletion(-)
```

## Tests run
- Spec line count + grep: file still parses to 370 lines after resolution.
- Playwright e2e itself **not run** — requires a dev server + browser; comment-only change does not warrant the infrastructure spin-up. Existing CI will exercise it.

## Remaining risks
None — comment-only change to an existing e2e test.

## Recommendation
**READY** to merge `rebase/fix-e2e-guardian-portal-render-ready-onto-main-2026-05-18` → `main`. Pure doc improvement; the underlying fix is already on main.
