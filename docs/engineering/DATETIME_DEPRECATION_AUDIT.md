# Datetime Deprecation Audit

**Date:** 2026-05-17  
**Auditor:** Automated Code Quality Audit  
**Scope:** `datetime.utcnow()` and `datetime.utcfromtimestamp()` deprecation

---

## 1. Findings Summary

| Pattern | Count (Before) | Count (After) |
|---------|---------------|--------------|
| `datetime.utcnow()` in source | 17 | 0 |
| `datetime.utcnow()` in tests | 13 | 0 |
| `datetime.now()` in tests | ~25 | ~25 (intentionally naive for DB compat) |
| `datetime.utcfromtimestamp()` | 0 | 0 |

**Total fixed: 30 instances**

---

## 2. Files Changed

### Source Code (7 files)

| File | Instances | Replacement |
|------|-----------|-------------|
| `contracts.py` | 1 | `lambda: datetime.now(timezone.utc)` |
| `hypothesis_engine.py` | 1 | `utc_now()` |
| `correlation_engine.py` | 1 | `datetime.now(timezone.utc)` |
| `confound_engine.py` | 1 | `datetime.now(timezone.utc)` |
| `missing_data_engine.py` | 3 | `utc_now()` |
| `evidence_engine.py` | 0 | Already clean |
| `cache_service.py` | 2 | `datetime.now(timezone.utc)` |

### Tests (6 files)

| File | Instances | Replacement |
|------|-----------|-------------|
| `test_missing_data_engine.py` | 13 | `datetime.now(timezone.utc)` |
| `test_hypothesis_engine.py` | 2 | `datetime.now(timezone.utc)` |
| `test_evidence_engine.py` | 1 | `datetime.now(timezone.utc)` |
| `test_api_endpoints.py` | 2 | `datetime.now(timezone.utc)` |
| `test_deeptwin_api.py` | 1 | `datetime.now(timezone.utc)` |
| `test_deeptwin_snapshot.py` | ~7 | `datetime.now(timezone.utc)` |

---

## 3. Strategy

### New UTC Helper (`time_utils.py`)

| Function | Return Type | Use Case |
|----------|-------------|----------|
| `utc_now()` | Aware UTC datetime | All new code, comparisons with aware timestamps |
| `utc_iso()` | ISO 8601 string | API responses |
| `utc_from_timestamp()` | Aware UTC datetime | Unix timestamp conversion |
| `naive_utc_now()` | Naive UTC datetime | DB compatibility (documented bridge) |
| `to_naive()` | Naive datetime | DB boundary conversion |
| `to_aware()` | Aware datetime | DB read boundary conversion |

### Decision: Aware vs Naive

- **Source code:** Uses `utc_now()` (aware) everywhere
- **Tests:** Use `datetime.now(timezone.utc)` (aware) for event creation
- **DB boundary:** SQLite stores ISO strings which preserve timezone info
- **No schema migration:** Existing `DateTime` columns work with aware ISO strings

### What Was NOT Changed

| Item | Reason |
|------|--------|
| Historical migration files | Out of scope — historical artifacts |
| `naive_utc_now()` helper | Intentionally preserves DB compatibility |
| `datetime.now()` in tests for non-event timestamps | Acceptable for non-comparison usage |
| DB schema | `DateTime` column stores ISO string — no migration needed |

---

## 4. Verification

```bash
# No deprecated patterns remain
grep -rn "\.utcnow\|utcfromtimestamp" apps/api/src/deepsynaps/*.py
# (only time_utils.py references them in docstrings and the bridge helper)

# All tests pass
python3 -m pytest apps/api/tests/ -q
# 489 passed, 1 warning (pytest mark)
```
