# Performance Tuning Guide — DeepSynaps Protocol Studio

> **Classification:** Technical Operations Document  
> **Owner:** Platform Engineering + SRE  
> **Review Cycle:** Monthly  
> **Last Updated:** 2026-05-14

---

## Table of Contents

1. [API Endpoint Performance Baselines](#1-api-endpoint-performance-baselines)
2. [Database Query Optimization](#2-database-query-optimization)
3. [Cache Tuning](#3-cache-tuning)
4. [Worker Queue Optimization](#4-worker-queue-optimization)
5. [Frontend Bundle Optimization](#5-frontend-bundle-optimization)
6. [Memory Leak Detection](#6-memory-leak-detection)
7. [Profiling Tools and Techniques](#7-profiling-tools-and-techniques)

---

## 1. API Endpoint Performance Baselines

### 1.1 SLA Targets

| Metric | Target | P1 Alert | P2 Alert |
|--------|--------|----------|----------|
| **API Availability** | 99.9% | <99.9% | <99.5% |
| **P50 Latency** | <50 ms | >100 ms | >200 ms |
| **P95 Latency** | <200 ms | >500 ms | >1000 ms |
| **P99 Latency** | <500 ms | >1000 ms | >2000 ms |
| **Error Rate** | <0.1% | >0.5% | >1% |
| **qEEG Analysis** | <5 min | >10 min | >15 min |
| **Protocol Generation** | <10 sec | >30 sec | >60 sec |

### 1.2 Endpoint-Specific Baselines

Measure each endpoint monthly using:

```bash
# Install hey (HTTP load generator) if not available
# go install github.com/rakyll/hey@latest

# Test health endpoint
hey -n 1000 -c 50 https://deepsynaps-studio.fly.dev/health

# Test authenticated endpoint
hey -n 100 -c 10 -H "Authorization: Bearer clinician-demo-token" \
  https://deepsynaps-studio.fly.dev/api/v1/registries/conditions

# Test with timing
curl -w "\nHTTP Code: %{http_code}\nTime DNS: %{time_namelookup}s\nTime Connect: %{time_connect}s\nTime Total: %{time_total}s\n" \
  -s -o /dev/null https://deepsynaps-studio.fly.dev/health
```

| Endpoint | Expected P95 | Notes |
|----------|-------------|-------|
| `GET /health` | <20 ms | No auth, lightweight |
| `GET /api/v1/registries/conditions` | <100 ms | Cached data from JSON files |
| `GET /api/v1/registries/devices` | <100 ms | Registry data |
| `POST /api/v1/protocols/draft` | <10 sec | AI generation; may vary |
| `POST /api/v1/qeeg/analyze` | <5 min (async) | Submits Celery job; returns immediately |
| `GET /api/v1/qeeg/analyze/{id}` | <200 ms | Job status check |
| `POST /api/v1/assessments` | <500 ms | Database write |
| `POST /api/v1/media/upload` | <5 sec | Depends on file size |
| `POST /api/v1/voice/analyze` | <30 sec | Whisper transcription |
| `GET /api/v1/notifications/stream` | N/A (SSE) | Long-lived connection |

### 1.3 Slow Endpoint Identification

```bash
# From application logs, identify slow endpoints
fly logs --app deepsynaps-studio --recent | grep -i "duration\|slow\|took" | sort -k3 -rn | head -20

# Using Python cProfile for local profiling
uv run python -m cProfile -s cumulative -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

---

## 2. Database Query Optimization

### 2.1 Query Performance Monitoring

**SQLite (Current):**
```bash
# Enable query timing in SQLite
fly ssh console --app deepsynaps-studio -C \
  "sqlite3 /data/deepsynaps_protocol_studio.db 'PRAGMA timer=on;'"

# Check for missing indexes
fly ssh console --app deepsynaps-studio -C \
  "sqlite3 /data/deepsynaps_protocol_studio.db '.indexes'"

# Analyze query plan for slow queries
fly ssh console --app deepsynaps-studio -C \
  "sqlite3 /data/deepsynaps_protocol_studio.db 'EXPLAIN QUERY PLAN SELECT ...;'"
```

**PostgreSQL (Target):**
```bash
# Enable pg_stat_statements (must be configured in postgresql.conf)
# Top slow queries
psql $DB_URL -c "SELECT query, mean_exec_time, calls, total_exec_time
  FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;"

# Queries with high total time (frequently called + slow)
psql $DB_URL -c "SELECT query, calls, total_exec_time, mean_exec_time
  FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;"

# Missing index detection
psql $DB_URL -c "SELECT schemaname, tablename, attname AS column,
  n_tup_read, n_tup_fetch, seq_scan, idx_scan
  FROM pg_stats WHERE schemaname = 'public'
  ORDER BY seq_scan DESC LIMIT 20;"
```

### 2.2 Common Slow Query Patterns

| Pattern | Cause | Fix |
|---------|-------|-----|
| N+1 queries | SQLAlchemy lazy loading | Use `selectinload` or `joinedload` |
| Missing indexes | No index on filter columns | Add `CREATE INDEX` migrations |
| Full table scans | Queries without WHERE on large tables | Add appropriate indexes |
| Large OFFSET pagination | `OFFSET 100000` is slow | Use cursor/keyset pagination |
| Unbounded queries | No LIMIT on list endpoints | Add default LIMIT (100) and max LIMIT (1000) |
| Complex JOINs | Deep nesting | Denormalize or create materialized views |

### 2.3 Optimization Procedures

**Add an Index:**
```python
# In Alembic migration
from alembic import op

def upgrade():
    op.create_index(
        'idx_table_column',
        'table_name',
        ['column_name'],
        unique=False
    )

def downgrade():
    op.drop_index('idx_table_column', table_name='table_name')
```

**Fix N+1 Queries:**
```python
# BAD: N+1 query
patients = db.query(Patient).all()
for patient in patients:
    print(patient.clinic.name)  # Extra query per patient!

# GOOD: Eager loading
from sqlalchemy.orm import selectinload
patients = db.query(Patient).options(selectinload(Patient.clinic)).all()
```

**Add Query Limits:**
```python
# Ensure all list endpoints have limits
query = db.query(Model).limit(min(requested_limit, 1000)).offset(offset)
```

### 2.4 Database Migration Performance

Large migrations can cause downtime. Use these patterns:

```python
# For adding columns with defaults: do it in steps
# Step 1: Add nullable column
op.add_column('table', sa.Column('new_col', sa.String(), nullable=True))

# Step 2: Backfill in batches (run in separate transaction)
# Step 3: Add NOT NULL constraint
op.alter_column('table', 'new_col', nullable=False)

# For adding indexes: use CONCURRENTLY (PostgreSQL)
op.execute('CREATE INDEX CONCURRENTLY idx_name ON table(column)')
```

---

## 3. Cache Tuning

### 3.1 Current Caching Architecture

The platform uses multiple caching layers:

| Layer | Technology | Scope | Use Case |
|-------|-----------|-------|----------|
| **API Response** | In-memory (FastAPI) | Per-instance | Lightweight health data |
| **Registry Data** | File-based JSON | Shared | Condition/device/modality registries |
| **Clinical Snapshots** | File system | Shared | Runtime readiness snapshots |
| **Rate Limiting** | Redis (if configured) | Global | API rate limiting |
| **Session Store** | Database | Shared | User sessions |

### 3.2 Redis Configuration

```bash
# Current Redis uses (when CELERY_BROKER_URL is set):
# 1. Celery task broker
# 2. Celery result backend
# 3. SlowAPI rate limit storage (when DEEPSYNAPS_LIMITER_REDIS_URI is set)

# Redis tuning parameters (to be set in Redis config):
# maxmemory-policy: allkeys-lru  # Evict least recently used when full
# timeout: 300                   # Close idle connections
# tcp-keepalive: 60              # Detect dead connections

# Check Redis stats
celery -A app.jobs inspect stats --workdir apps/api
```

### 3.3 Adding Application Caching

For endpoints that serve relatively static data:

```python
# In FastAPI router, add caching via Cache-Control headers
@router.get("/registries/conditions")
async def list_conditions():
    # Registry data changes rarely — cache for 5 minutes
    return Response(
        content=registry_data,
        headers={"Cache-Control": "public, max-age=300"}
    )

# For computationally expensive endpoints:
from functools import lru_cache
import time

@lru_cache(maxsize=128)
def get_expensive_computation(key: str) -> dict:
    # This will cache in memory per-process
    # For distributed caching, use Redis
    return expensive_operation(key)
```

### 3.4 Cache Invalidation Strategy

| Cache Type | Invalidation Trigger | Method |
|------------|---------------------|--------|
| Registry data | New clinical data import | Admin API endpoint or deployment |
| Protocol drafts | New evidence published | Event-driven or time-based expiry |
| Patient summaries | Patient data update | Write-through invalidation |
| API responses | Code deployment | Deployment automatically clears |

---

## 4. Worker Queue Optimization

### 4.1 Celery Configuration

Current Celery configuration in `apps/api/app/jobs.py`:

```python
# Key tuning parameters:
# - worker_prefetch_multiplier: 1 (prevents one worker from hoarding tasks)
# - task_acks_late: True (tasks acknowledged after completion, not at start)
# - task_reject_on_worker_lost: True (requeue if worker crashes)
# - worker_max_tasks_per_child: 1000 (restart worker after N tasks to prevent memory leaks)
```

### 4.2 Queue Monitoring

```bash
# Check active tasks
celery -A app.jobs inspect active --workdir apps/api

# Check scheduled tasks
celery -A app.jobs inspect scheduled --workdir apps/api

# Check reserved tasks
celery -A app.jobs inspect reserved --workdir apps/api

# Check worker stats
celery -A app.jobs inspect stats --workdir apps/api
```

### 4.3 Worker Scaling

```bash
# Scale qEEG workers based on queue depth
# Check queue depth via logs:
fly logs --app deepsynaps-studio | grep -i "queue\|backlog" | tail -20

# Scale workers:
fly scale count qeeg_worker=2 --app deepsynaps-studio

# Scale back down when queue clears:
fly scale count qeeg_worker=1 --app deepsynaps-studio
```

### 4.4 Task Timeout Configuration

| Task Type | Soft Timeout | Hard Timeout | Max Retries | Retry Delay |
|-----------|-------------|-------------|-------------|-------------|
| qEEG Analysis | 300 sec | 600 sec | 2 | 60 sec |
| Report Generation | 120 sec | 180 sec | 2 | 30 sec |
| Protocol Draft | 60 sec | 120 sec | 1 | 30 sec |
| Stripe Webhook | 30 sec | 60 sec | 5 | 300 sec |
| Data Export | 600 sec | 900 sec | 1 | 60 sec |
| Media Processing | 120 sec | 180 sec | 2 | 30 sec |

### 4.5 Dead Letter Handling

Tasks that fail after max retries should be:
1. Logged to Sentry with full context
2. Stored in a dead-letter table for manual review
3. Notified to `#alerts` Slack channel

```bash
# Review failed tasks
fly logs --app deepsynaps-studio | grep -i "failed\|retry\|dead" | tail -30
```

---

## 5. Frontend Bundle Optimization

### 5.1 Current Frontend Architecture

- **Framework:** React + Vite
- **Build output:** `apps/web/dist/`
- **Deployment:** Netlify

### 5.2 Bundle Size Budgets

| Metric | Target | Alert |
|--------|--------|-------|
| Initial JS bundle | <200 KB gzipped | >300 KB |
| Total JS (all chunks) | <500 KB gzipped | >800 KB |
| CSS bundle | <50 KB gzipped | >80 KB |
| First Contentful Paint | <1.5 sec | >2 sec |
| Time to Interactive | <3 sec | >5 sec |

### 5.3 Build Analysis

```bash
# Build with analysis
cd apps/web
npm run build

# Analyze bundle size
npx vite-bundle-visualizer

# Check output sizes
ls -lh dist/assets/*.js dist/assets/*.css
```

### 5.4 Optimization Checklist

- [ ] Code splitting by route (`React.lazy()` + `Suspense`)
- [ ] Vendor chunk separation (React, libraries in separate chunk)
- [ ] Tree shaking verification (no dead code in bundle)
- [ ] Image optimization (WebP format, responsive images)
- [ ] Font optimization (subset fonts, `font-display: swap`)
- [ ] Compression enabled on Netlify (brotli + gzip)
- [ ] Caching headers for static assets
- [ ] Preload critical resources
- [ ] Defer non-critical JavaScript

### 5.5 Netlify Performance Settings

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/*.html"
  [headers.values]
    Cache-Control = "public, max-age=0, must-revalidate"
```

---

## 6. Memory Leak Detection

### 6.1 Symptoms of Memory Leaks

- Gradual increase in memory usage over time
- OOM kills by Fly.io
- Restart fixes the issue temporarily
- Sentry reports `MemoryError` exceptions

### 6.2 Detection Procedures

**Monitor memory trends:**
```bash
# Check Fly.io metrics for memory growth
fly metrics --app deepsynaps-studio

# Check for OOM in logs
fly logs --app deepsynaps-studio | grep -i "oom\|out of memory\|killed"

# Memory usage over time (run periodically)
fly ssh console --app deepsynaps-studio -C "ps aux --sort=-%mem | head -10"
```

**Local memory profiling:**
```bash
# Use memory_profiler for specific functions
# Install: pip install memory_profiler

# Profile a specific module
python -m memory_profiler app/services/some_service.py

# Use tracemalloc for detailed tracking
python -c "
import tracemalloc
tracemalloc.start()
# ... run your code ...
snapshot = tracemalloc.take_snapshot()
top_stats = snapshot.statistics('lineno')
for stat in top_stats[:10]:
    print(stat)
"
```

### 6.3 Common Memory Leak Sources

| Source | Detection | Fix |
|--------|-----------|-----|
| SQLAlchemy session leaks | Monitor `SessionLocal()` calls | Ensure `finally: db.close()` |
| Unclosed file handles | Check `lsof` output | Use context managers (`with open`) |
| Cache growth without bounds | Monitor cache size | Add TTL or size limits |
| Large object retention | `tracemalloc` analysis | Use generators for large datasets |
| Celery worker bloat | Worker memory growth over time | Set `worker_max_tasks_per_child` |
| Whisper model memory | ~1.5GB for "medium", ~140MB for "base" | Use "base" model as configured |

### 6.4 Worker Memory Management

```bash
# Set worker_max_tasks_per_child to restart workers periodically
# This prevents memory bloat in long-running workers
# Already configured in jobs.py — verify it's set:
# worker_max_tasks_per_child = 1000

# Monitor worker memory via Fly.io metrics
# If workers consistently OOM:
# 1. Increase VM memory in fly.toml
# 2. Reduce concurrency
# 3. Investigate task memory usage
```

---

## 7. Profiling Tools and Techniques

### 7.1 Python Profiling

**CPU Profiling:**
```bash
# cProfile — built-in, no dependencies
python -m cProfile -s cumulative -m uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000

# py-spy — sampling profiler (low overhead)
# pip install py-spy
py-spy top --pid <uvicorn-pid>
py-spy record -o profile.svg --pid <uvicorn-pid>

# yappi — yet another profiler
# pip install yappi
python -m yappi -c "import app.main"
```

**Memory Profiling:**
```bash
# memory_profiler — line-by-line memory usage
# pip install memory_profiler
python -m memory_profiler app/services/slow_service.py

# pympler — object size tracking
# pip install Pympler
python -c "
from pympler import tracker
tr = tracker.SummaryTracker()
# ... run code ...
tr.print_diff()
"

# fil — memory profiler for production-like environments
# pip install filprofiler
fil-profile run app/main.py
```

### 7.2 SQLAlchemy Query Profiling

```python
# Enable SQL echo for debugging (development only!)
# In database.py or settings:
echo = True  # Logs all SQL queries

# Query timing in application code:
import time
start = time.time()
result = db.query(Model).all()
print(f"Query took {time.time() - start:.3f}s")
```

### 7.3 Fly.io Performance Metrics

```bash
# View Fly.io built-in metrics
fly metrics --app deepsynaps-studio

# Check specific machine metrics
fly machine status <machine-id> --app deepsynaps-studio

# Log-based performance analysis
fly logs --app deepsynaps-studio | grep -i "duration\|timing\|slow"
```

### 7.4 Frontend Performance Profiling

```bash
# Lighthouse CI (automated)
npx lighthouse https://deepsynaps-studio.fly.dev --output=json --output-path=./lighthouse.json

# Chrome DevTools Performance tab (manual)
# 1. Open DevTools → Performance
# 2. Click Record
# 3. Perform actions
# 4. Analyze flame graph

# React DevTools Profiler (manual)
# 1. Install React DevTools extension
# 2. Open Profiler tab
# 3. Record component renders
```

### 7.5 Load Testing

```bash
# hey — simple HTTP load testing
# go install github.com/rakyll/hey@latest

# Basic load test
hey -n 1000 -c 50 https://deepsynaps-studio.fly.dev/health

# With authentication
hey -n 100 -c 10 -H "Authorization: Bearer clinician-demo-token" \
  https://deepsynaps-studio.fly.dev/api/v1/registries/conditions

# Sustained load test
hey -z 60s -c 20 https://deepsynaps-studio.fly.dev/health
```

### 7.6 Performance Regression Checklist

Run this checklist before every production deployment:

- [ ] Health endpoint P95 < 20 ms
- [ ] Key GET endpoints P95 < 100 ms
- [ ] No new N+1 queries introduced
- [ ] No unbounded queries introduced
- [ ] Frontend bundle size within budget
- [ ] No new memory allocations in hot paths
- [ ] Worker task durations within baseline

---

## Quick Reference: Performance Debugging

```
API SLOW?
1. Check endpoint: curl -w "%{time_total}" <url>
2. Check Fly metrics: fly metrics
3. Check logs for slow queries
4. Check for N+1 queries
5. Check external API latency
6. Profile locally if needed

WORKER SLOW?
1. Check queue depth: celery inspect active
2. Check worker memory: fly metrics
3. Check for OOM in logs
4. Profile task locally
5. Scale workers if needed

MEMORY HIGH?
1. Check OOM kills in logs
2. Monitor memory trend: fly metrics
3. Profile with tracemalloc
4. Check for session leaks
5. Restart worker machines
6. Scale VM memory if chronic

DATABASE SLOW?
1. Check query plans
2. Check for missing indexes
3. Check for N+1 queries
4. Check connection count
5. Add indexes if needed
6. Consider query rewriting
```

---

## Cross-References

- [Capacity Planning Guide](./capacity-planning.md) — When to scale vs. optimize
- [On-Call Playbook](./oncall-playbook.md) — Alert responses
- [Incident Response Runbook](./incident-response.md) — Performance-related incidents
- [Release Process](../operations/release-process.md) — Performance regression testing
