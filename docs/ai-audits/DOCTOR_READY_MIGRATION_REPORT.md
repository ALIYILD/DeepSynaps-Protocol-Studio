# Doctor-Ready Migration Report (Agent 1)

**Branch:** `doctor-ready/e2e-validation-and-hardening`  
**Scope:** Alembic/migrations only (no feature changes)

## Commands run (from repo root unless noted)

From `apps/api`:

```bash
python3 -m alembic heads
python3 -m alembic history --verbose
python3 -m alembic upgrade head
python3 -m alembic downgrade -1
python3 -m alembic upgrade head
```

## Outputs summary

- **`alembic heads`**: exactly **one head**
  - `093_qeeg_105_jobs_audit_cache (head)`
- **`alembic history --verbose`**: head `093_qeeg_105_jobs_audit_cache` with parent
  - `092_merge_eeg_studio_and_parallel_heads (mergepoint)`
- **`alembic upgrade head` (initial attempt)**: **FAILED** on SQLite at revision `093`
  - Error: `NotImplementedError: No support for ALTER of constraints in SQLite dialect`
  - Cause: migration attempted `op.create_unique_constraint(...)` (SQLite requires batch mode)
- **`alembic upgrade head` (after fix)**: **PASSED**
- **`alembic downgrade -1`** (093 → 092): **PASSED**
- **re-`alembic upgrade head`** (092 → 093): **PASSED**

## Pass/Fail checklist

- **Single head**: **PASS**
- **Upgrade to head**: **PASS** (after migration portability fix)
- **Downgrade by one revision**: **PASS**
- **Re-upgrade to head**: **PASS**
- **QEEG-105 `093` migration index/constraint duplication**: **PASS** (no duplicate index/constraint creation observed during a clean upgrade; constraint creation is now dialect-safe)

## Changes made

- **Portability fix (SQLite vs Postgres)**: use Alembic batch mode for UNIQUE constraint add/drop.
  - File: `apps/api/alembic/versions/093_qeeg_105_jobs_audit_cache.py`
  - Change: replace `op.create_unique_constraint(...)` with:
    - `with op.batch_alter_table("qeeg_analysis_jobs") as batch_op: batch_op.create_unique_constraint(...)`
  - Downgrade: likewise uses `batch_alter_table` to drop the UNIQUE constraint.

## Risks / Notes

- **SQLite constraint ALTER**: without batch mode, `093` cannot apply on SQLite (blocker). Fixed.
- **Partial index**: `ix_qeeg_analysis_jobs_status_active` uses `postgresql_where=...`; on SQLite it becomes a normal index (semantics differ, but this is expected and not new behavior).
- **Idempotency**: these migrations are not designed to be re-run on an already-partially-migrated DB. If a deploy fails mid-revision, the operator should reset/recreate the dev SQLite DB or manually reconcile schema before retrying.

## Next action

- Land the portability fix commit on `doctor-ready/e2e-validation-and-hardening`.
- (Optional) If Postgres is used in CI for migrations, run the same upgrade/downgrade smoke test against Postgres to confirm the unique constraint and partial index behavior matches expectations.

