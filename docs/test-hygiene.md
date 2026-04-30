# Test Hygiene — Local Experiments & Scratch Files

## Rule

Only **committed**, **isolated** test files may live under `apps/api/tests/`.

## Why

pytest with `-n auto` (pytest-xdist) discovers **every** `test_*.py` file in the
tree. An untracked local experiment file such as
`apps/api/tests/test_e2e_controlled_demo.py` will be picked up, execute
against the shared per-worker SQLite database, and can break unrelated tests
via DB-state pollution, fixture collisions, or side-effect mutations.

## What happened (real incident)

- An untracked 44 KB `test_e2e_controlled_demo.py` was left in
  `apps/api/tests/`.
- Full-suite run: 8 failures in the e2e file + cascading failures in
  `test_qeeg_raw_workbench.py`.
- Deleting the untracked file restored the suite to **1684 passed, 0 failed**.

## Safe places for local experiments

| Location | Pattern | Gitignored? |
|----------|---------|-------------|
| `apps/api/tests/_scratch/` | any | ✅ yes |
| `apps/api/tests/` | `local_*.py` | ✅ yes |
| `apps/api/tests/` | `*_local.py` | ✅ yes |
| `apps/api/tests/` | `e2e_*.py` | ✅ yes |
| `apps/api/tests/` | `test_*.py` | ❌ **NO** — only committed tests |

## pytest safeguards (already in `apps/api/pytest.ini`)

```ini
testpaths = tests
python_files = test_*.py
norecursedirs = _scratch .* build dist __pycache__ .pytest_cache node_modules
```

These settings ensure:
1. pytest only looks in `apps/api/tests/` (not random subdirectories).
2. Only `test_*.py` files are collected (not `local_*.py`, `e2e_*.py`, etc.).
3. `_scratch/` is never recursed into.

## Checklist before pushing

- [ ] `git status --short apps/api/tests/` shows no untracked `test_*.py` files.
- [ ] Local experiments are in `_scratch/` or use `local_` / `_local` / `e2e_` prefix.
- [ ] Full backend suite passes locally: `pytest apps/api/tests -q`.
