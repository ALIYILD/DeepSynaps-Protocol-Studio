# Cache Invalidation Matrix

**Scope:** Redis/Mock cache entries for summary endpoints  
**Date:** 2026-05-17  
**Version:** 1.0

---

## 1. Cache Key Structure

```
ds:v1:{env}:{scope}:clinic:{clinic_id}:patient:{patient_id}:route:{route}:role:{role}:params:{hash}
```

| Scope | Endpoint | Clinic Key | Patient Key |
|-------|----------|-----------|-------------|
| `clinic_dashboard` | GET /api/v1/summary/clinic-dashboard | Yes | — |
| `analyzer_status` | GET /api/v1/summary/analyzer-status | Yes | — |
| `patient_dashboard` | GET /api/v1/summary/patients/{id}/dashboard | — | Yes |
| `patient_analyzer` | GET /api/v1/summary/patients/{id}/analyzer | — | Yes |

---

## 2. Invalidation Strategy: Conservative + TTL

Two layers of cache freshness:

1. **TTL expiration** — automatic, primary mechanism
   - Clinic summaries: 30 seconds
   - Patient summaries: 60 seconds
   - Analyzer summaries: 30 seconds (clinic), 60 seconds (patient)

2. **Eager invalidation** — on data mutation, secondary mechanism
   - Patient cache → invalidated on event insert, audit log
   - Clinic cache → invalidated on audit log

---

## 3. Patient Cache Invalidation Triggers

### Implemented (in `knowledge_layer.py`)

| Trigger | Method | Invalidated | Code Location |
|---------|--------|-------------|---------------|
| Multimodal event inserted | `insert_event()` | `patient:{id}` | `knowledge_layer.py:158-160` |
| Audit log entry | `log_audit()` | `clinic:{id}` | `knowledge_layer.py:224-227` |

### Coverage Matrix

| Write Operation | Patient Cache Invalidated? | Clinic Cache Invalidated? | Notes |
|-----------------|---------------------------|--------------------------|-------|
| `insert_event()` — assessment saved | **YES** | No | Via `invalidate_patient()` |
| `insert_event()` — qEEG/MRI added | **YES** | No | Via `invalidate_patient()` |
| `insert_event()` — biomarker updated | **YES** | No | Via `invalidate_patient()` |
| `insert_event()` — medication changed | **YES** | No | Via `invalidate_patient()` |
| `insert_event()` — session/intervention | **YES** | No | Via `invalidate_patient()` |
| `insert_event()` — risk_signal | **YES** | No | Via `invalidate_patient()` |
| `log_audit()` — report signed | No | **YES** | Via `invalidate_clinic()` |
| `log_audit()` — consent changed | No | **YES** | Via `invalidate_clinic()` |
| `log_audit()` — user access changed | No | **YES** | Via `invalidate_clinic()` |

### Not Directly Covered (TTL handles these)

| Write Operation | Patient Cache | Clinic Cache | Mitigation |
|-----------------|--------------|-------------|------------|
| Evidence DB updated | No | No | TTL 30s — stale for at most 30s |
| Patient access record updated | No | No | TTL 30s — stale for at most 30s |
| DeepTwin review created | No | No | TTL 30s — stale for at most 30s |

---

## 4. Invalidation Implementation

### Patient Invalidation (eager)

```python
# knowledge_layer.py — insert_event()
try:
    from cache_service import get_cache_service
    cache = get_cache_service()
    cache.invalidate_patient(event.patient_id)
except Exception:
    pass  # Best-effort: cache invalidation failure never breaks writes
```

**Effect:** Deletes ALL cache keys matching `ds:v1:{env}:patient:{patient_id}:*`  
**Scope:** Patient dashboard + patient analyzer summaries for this patient  
**Best-effort:** Wrapped in try/except — cache failure never blocks writes

### Clinic Invalidation (eager)

```python
# knowledge_layer.py — log_audit()
try:
    from cache_service import get_cache_service
    cache = get_cache_service()
    if clinic_id:
        cache.invalidate_clinic(clinic_id)
except Exception:
    pass  # Best-effort
```

**Effect:** Deletes ALL cache keys matching `ds:v1:{env}:clinic:{clinic_id}:*`  
**Scope:** Clinic dashboard + analyzer status summaries for this clinic  
**Best-effort:** Wrapped in try/except

### Lazy Invalidation (TTL)

All cached entries have explicit TTL:
- Clinic-scoped entries: 30 seconds
- Patient-scoped entries: 60 seconds

After TTL expires, the entry is automatically evicted. Next request triggers a fresh DB query.

---

## 5. Consistency Model

```
┌──────────────────────────────────────────────────────────┐
│                    Consistency: Eventual                  │
├──────────────────────────────────────────────────────────┤
│  Write → eager invalidation (best-effort, <10ms)        │
│        → OR TTL expiration (guaranteed, 30-60s)          │
│  Read  → cache first (0.5ms hit)                         │
│        → DB query on miss (15-50ms)                      │
└──────────────────────────────────────────────────────────┘
```

**Maximum staleness window:** 60 seconds (patient) / 30 seconds (clinic)  
**Typical staleness:** <10ms (eager invalidation succeeds)  
**Worst case:** 60 seconds (eager invalidation fails + TTL hasn't expired)

---

## 6. Invalidation Order

```
1. Data mutation (DB write, transaction commit)
2. Cache invalidation (async, best-effort)
3. Cache TTL continues counting down
4. Next read: cache miss → fresh DB query → cache store
```

**Race condition handling:** If a read occurs between write and invalidation:
- The old cached value may be returned
- TTL will eventually expire the stale entry
- This is acceptable for summary dashboards (eventual consistency)

---

## 7. Risk: Invalidation Gaps

| Gap | Impact | Mitigation |
|-----|--------|------------|
| Evidence DB updates don't invalidate | Clinic evidence_coverage may be stale | TTL 30s bounds staleness |
| Direct SQL updates bypass KL | Cache won't be invalidated | Use KL methods for all writes |
| Cross-clinic patient moves | Old clinic cache may be stale | TTL 30s + clinic invalidation on audit |
| Bulk imports | Many invalidations at once | Batch operations should clear cache after import |

---

## 8. Monitoring

Log entries to watch:
```
INFO  Invalidated N cache entries for patient {id}
INFO  Invalidated N cache entries for clinic {id}
WARNING Redis connection failed — falling back to in-memory mock
```

Cache health endpoint (via `CacheService.health()`):
```json
{
  "enabled": true,
  "backend": "redis|mock",
  "redis_url_set": true|false,
  "env_enabled": "true|false"
}
```
