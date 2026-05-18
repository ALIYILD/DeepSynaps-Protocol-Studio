# Security Review: Redis Patient Cache (PR #5)

**Reviewer:** Automated Security Audit  
**Scope:** `cache_service.py`, `summary_engine.py`, `knowledge_layer.py`  
**Date:** 2026-05-17  
**Verdict:** APPROVED with observations

---

## 1. Threat Model

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **PHI in cache keys** | Keys use scoped IDs only (clinic_id, patient_id) — no free-text PHI | OK |
| **PHI in cache values** | Values are JSON summaries with counts/flags only — no full records | OK |
| **Pickle deserialization (RCE)** | JSON serialization only (`json.dumps`/`json.loads`) — no pickle anywhere | OK |
| **Cache poisoning** | TTL enforced on every write; invalidation on data mutation | OK |
| **Redis injection via keys** | Keys built from IDs via `join(":")` — no user-controlled free text | OK |
| **Cross-patient data leak** | Patient-scoped keys + clinic isolation in existing auth layer | OK |
| **Cross-clinic data leak** | Clinic-scoped keys + clinic isolation in existing auth layer | OK |
| **Redis credential exposure** | URL parsed with `@` split for logging — password masked | OK |
| **Unbounded cache growth** | Explicit TTL on all writes; SCAN-based prefix deletion | OK |

---

## 2. Code Review: `cache_service.py`

### 2.1 Key Builder (`build_key`) — SECURE

```python
@classmethod
def build_key(cls, scope, clinic_id="", patient_id="", route="", params=None, actor_role=""):
    parts = [CacheConfig.key_prefix(), scope]
    if clinic_id: parts.append(f"clinic:{clinic_id}")
    if patient_id: parts.append(f"patient:{patient_id}")
    ...
    if params:
        params_hash = hashlib.sha256(params_json.encode()).hexdigest()[:12]
        parts.append(f"params:{params_hash}")
    return ":".join(parts)
```

- **No user-controlled text in keys.** Only structured IDs and hashed parameters.
- **Params hashed to 12-char SHA-256 prefix.** Prevents unbounded key lengths.
- **Environment prefix** (`ds:v1:{env}`) prevents cross-environment cache contamination.

### 2.2 Serialization — SECURE

```python
def set_json(self, key, value, ttl):
    serialized = json.dumps(value, default=str)  # JSON only — no pickle
    return self._redis_set(key, serialized, ex=ttl)

def get_json(self, key):
    raw = self._redis_get(key)
    if raw is None: return None
    return json.loads(raw)  # JSON only — no pickle
```

- **No pickle serialization** — `json.dumps`/`json.loads` only.
- **`default=str` fallback** converts unserializable objects to string representations (safe, not executable).
- **TTL is mandatory** — no permanent cache entries.

### 2.3 Redis Connection — SECURE

```python
self._client = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
```

- **`decode_responses=True`** — returns strings, not bytes (prevents byte-level issues).
- **`socket_connect_timeout=2`** — fast fail on Redis unavailable.
- **Graceful fallback** — falls back to `_MockRedis` on any connection failure.
- **Credential masking in logs:**
  ```python
  logger.info("Redis cache connected: %s", url.split("@")[-1])
  ```
  URL before `@` (which contains password) is stripped from logs.

### 2.4 Prefix Deletion — SAFE

```python
def delete_prefix(self, prefix):
    if self.is_redis():
        cursor = 0
        while True:
            cursor, keys = self._client.scan(cursor=cursor, match=f"{prefix}*", count=100)
            if keys: self._client.delete(*keys)
            if cursor == 0: break
```

- Uses **SCAN** (not KEYS) to avoid blocking Redis on large datasets.
- **Batch size of 100** — bounded memory per iteration.

---

## 3. Code Review: `summary_engine.py` (Cache Integration)

### 3.1 Cache Lookup Pattern — CORRECT

```python
cache_key = CacheService.build_key("clinic_dashboard", clinic_id=clinic_id)
cached = self._cache.get_json(cache_key)
if cached is not None:
    return cached
# ... compute ...
self._cache.set_json(cache_key, result, ttl=CacheConfig.clinic_summary_ttl())
```

- **Cache-before-compute** — reduces DB load on repeated requests.
- **Scoped TTL** — clinic summaries 30s, patient summaries 60s.

### 3.2 Data in Cache — NO PHI

Cache values contain:
- Counts (`active_patients`, `recent_events_30d`)
- Modality breakdowns (modality name + count)
- Quality flags (quality level + count)
- Timestamps (ISO format)
- Safety disclaimer (static string)

**No patient names, SSNs, clinical notes, diagnoses, or full records.**

---

## 4. Code Review: `knowledge_layer.py` (Cache Invalidation)

### 4.1 Invalidation Hooks — CORRECT

```python
def insert_event(self, event):
    # ... DB insert ...
    try:
        from cache_service import get_cache_service
        cache = get_cache_service()
        cache.invalidate_patient(event.patient_id)
    except Exception:
        pass  # Cache invalidation is best-effort

def log_audit(self, ...):
    # ... DB insert ...
    try:
        from cache_service import get_cache_service
        cache = get_cache_service()
        if clinic_id: cache.invalidate_clinic(clinic_id)
    except Exception:
        pass
```

- **Lazy import** prevents circular dependency at module load.
- **Best-effort** — cache invalidation failure doesn't break the write operation.
- **Correct granularity:**
  - `insert_event` → invalidates patient-scoped cache entries
  - `log_audit` → invalidates clinic-scoped cache entries

---

## 5. Observations (Non-Blocking)

| # | Observation | Severity | Recommendation |
|---|-------------|----------|----------------|
| 1 | `_MockRedis` is in-process and not shared across workers | Low | Document that mock is for dev/test only |
| 2 | `datetime.utcnow()` used in `_MockRedis` (deprecated) | Low | Replace with `datetime.now(timezone.utc)` in future |
| 3 | Cache misses don't distinguish "expired" from "never set" | Info | Acceptable for summary dashboards |
| 4 | No cache warming or pre-computation | Info | Future enhancement for large deployments |

---

## 6. Verdict

**APPROVED.** The Redis patient cache implementation:
- Uses JSON-only serialization (no pickle, no RCE risk)
- Never stores PHI in cache keys or values
- Enforces TTL on all writes
- Invalidates cache on data mutations
- Gracefully degrades to in-memory mock when Redis unavailable
- Uses SCAN (not KEYS) for safe prefix deletion
- Masks Redis credentials in logs
- Maintains clinic/patient isolation boundaries
