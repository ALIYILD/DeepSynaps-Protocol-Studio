# Internal maintainer note — PR 2 landed on `main` (2026-05-12)

## Baseline commit

- **`138ffb83`** — `feat(qeeg): normative scaffold, consent hardening (Refs #841 #844 #845)`
- Verify locally: `git show --stat 138ffb83`

## Branch protection / governance

This commit was **pushed directly to `main`**. GitHub reported **branch protection was bypassed** (e.g. “changes must be made through a pull request”, required status checks expected).

**Do not treat this as release-ready until required checks are green on `main` for `138ffb83`.**  
“Pushed successfully” is **not** the release gate — CI + dependency-complete verification are.

## Post-merge checklist (maintainers)

```bash
git checkout main
git pull --ff-only origin main
git log --oneline -5
git show --stat 138ffb83
```

Then on GitHub: **Actions / Checks** for commit **`138ffb83`** — all required checks must pass before release tagging.

### Local verification (when deps exist)

```bash
cd apps/web && npm install && npm run build
cd apps/web && node --test src/pages-qeeg-analysis-erp-tab.test.js
```

```bash
cd apps/api && .venv/bin/python -m pytest \
  tests/test_qeeg_demo_id_boundary.py \
  tests/test_qeeg_normative_consent.py \
  tests/test_qeeg_workflow_smoke.py::TestQEEGWorkflowSmoke::test_full_workflow -q
```

## Follow-up work (Hermes / engineering)

- Branch (created from `main` at `138ffb83`): **`fix/qeeg-router-consent-sweep`**
- Briefing: **`docs/hermes-qeeg-consent-sweep-after-pr2.md`**
- Scope: **`fix(consent): complete qEEG router ai_analysis consent sweep`**
- Issues: keep **`Refs #841`** unless the same change set also completes MRI and DeepTwin consent enforcement described in that issue.

## `git commit` “unknown option trailer” (local environment)

If `git commit` fails with `error: unknown option 'trailer'` but **`/usr/bin/git commit`** works, the **`git` first on `PATH` is likely not Apple/system Git** (wrapper, alias, or older install).

Diagnostic commands:

```bash
type -a git
which git
git --version
/usr/bin/git --version
alias git
grep -E 'alias git|function git' ~/.zshrc ~/.bashrc ~/.bash_profile ~/.profile 2>/dev/null
```

**Practical fix:** remove the wrapper/alias or put the intended modern `git` first on `PATH`.
