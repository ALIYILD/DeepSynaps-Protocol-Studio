<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# Datetime Deprecation Audit

**Date:** 2026-05-17 (revised 2026-05-18)
**Auditor:** Automated Code Quality Audit
**Scope:** `datetime.utcnow()` and `datetime.utcfromtimestamp()` deprecation
**Current status:** ~176 `utcnow()` calls remain in `apps/api/app/` as of 2026-05-18. The original salvage doc described 30 fixed instances in a prototype tree (`apps/api/src/deepsynaps/`) that was never merged to main. The strategy and helper pattern below remain valid and applicable to the current codebase.

---

## 1. Current State (main)

| Pattern | Count in `apps/api/app/` |
|---------|--------------------------|
| `datetime.utcnow()` | ~176 (🟢 grep-measured 2026-05-18) |
| `datetime.utcfromtimestamp()` | <!-- TODO: verify against current main --> |

Files with `utcnow()` span routers, services, knowledge adapters, and persistence models. A systematic replacement pass is needed.

---

## 2. Recommended Strategy

### UTC Helper (`time_utils.py`)

Create (or reuse if already present) `apps/api/app/utils/time_utils.py`:

<!-- TODO: verify against current main — check if apps/api/app/utils/time_utils.py already exists -->

| Function | Return Type | Use Case |
|----------|-------------|----------|
| `utc_now()` | Aware UTC datetime | All new code, comparisons with aware timestamps |
| `utc_iso()` | ISO 8601 string | API responses |
| `utc_from_timestamp()` | Aware UTC datetime | Unix timestamp conversion |
| `naive_utc_now()` | Naive UTC datetime | DB compatibility bridge (documented) |
| `to_naive()` | Naive datetime | DB write boundary |
| `to_aware()` | Aware datetime | DB read boundary |

### Aware vs Naive Decision

- **Source code:** Use `utc_now()` (aware) everywhere.
- **Tests:** Use `datetime.now(timezone.utc)` for event creation.
- **DB boundary:** SQLAlchemy `DateTime` columns — check current column definitions; use the bridge helpers at the boundary.
- **No schema migration needed** unless columns are typed `TIMESTAMP WITH TIME ZONE` — verify actual column types in `apps/api/app/persistence/models/`.

### What to NOT Change

| Item | Reason |
|------|--------|
| Historical alembic migration files | Out of scope |
| `naive_utc_now()` helper | Intentionally preserves DB compatibility |
| `datetime.now()` in tests for non-event timestamps | Acceptable for non-comparison usage |

---

## 3. Replacement Pattern

```python
# Before (deprecated, raises DeprecationWarning in Python 3.12+)
from datetime import datetime
ts = datetime.utcnow()

# After
from datetime import datetime, timezone
ts = datetime.now(timezone.utc)

# Or, using the shared helper:
from app.utils.time_utils import utc_now
ts = utc_now()
```

---

## 4. Verification Commands

```bash
# Count remaining deprecated patterns in current main
grep -rn "\.utcnow()\|utcfromtimestamp" apps/api/app --include="*.py" | wc -l

# List affected files
grep -rl "\.utcnow()" apps/api/app --include="*.py"

# Run tests after replacement
cd apps/api && python -m pytest tests/ -q
```

---

## 5. Scope Note

The original salvage doc listed 7 specific source files under `apps/api/src/deepsynaps/` — a path that does not exist in current main. The affected files in current main are distributed across:

- `apps/api/app/routers/` (multiple router files)
- `apps/api/app/services/` (multiple service files)
- `apps/api/app/knowledge/` (multiple adapter files)
- `apps/api/app/persistence/models/`
- `apps/api/app/hermes_runtime_bundle/`

<!-- TODO: verify against current main — run the grep commands above and update the table in section 1 with exact counts per directory -->
