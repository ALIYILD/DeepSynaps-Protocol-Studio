# Async DB Migration Plan

> Status: **tech-debt backlog** (not started)
> Created: 2026-04-30
> Priority: Medium (required before 100+ concurrent users)

## Current State

The entire FastAPI backend uses **synchronous SQLAlchemy 2.0 Session** for all
database operations. There are zero uses of `AsyncSession`, `create_async_engine`,
or `async_session` anywhere in the codebase.

### Database Configuration (`apps/api/app/database.py`)

| Setting | PostgreSQL | SQLite (dev) |
|---|---|---|
| Engine | `create_engine(url, future=True)` | Same, + `check_same_thread=False` |
| Pool size | 10 | N/A |
| Max overflow | 20 (30 total) | N/A |
| Pool pre-ping | Yes | N/A |
| Pool recycle | 3600s | N/A |
| Session class | `sessionmaker(..., class_=Session)` | Same |

### Scaling Implication

The synchronous model blocks a thread per database call. With Uvicorn's default
thread pool (40 threads), database-heavy requests can exhaust available threads
before network or CPU limits are reached. At 20-50 concurrent users the current
pool_size=10 + max_overflow=20 is adequate. Above 100 concurrent users,
connection pool exhaustion and thread starvation become likely.

## Top 10 Routers by Complexity (Migration Candidates)

| Rank | Router | Size | Lines | Endpoints | Risk | Migration Order |
|---|---|---|---|---|---|---|
| 1 | `qeeg_analysis_router.py` | 142 KB | 3,748 | 41 | HIGH | Phase 3 |
| 2 | `evidence_router.py` | 77 KB | 2,046 | 41 | HIGH | Phase 3 |
| 3 | `mri_analysis_router.py` | 70 KB | 1,881 | 31 | HIGH | Phase 4 |
| 4 | `patients_router.py` | 66 KB | 1,791 | 19 | MEDIUM | Phase 2 |
| 5 | `media_router.py` | 66 KB | 1,923 | 22 | MEDIUM | Phase 4 |
| 6 | `assessments_router.py` | 65 KB | 1,443 | 14 | MEDIUM | Phase 3 |
| 7 | `patient_portal_router.py` | 64 KB | 1,768 | 26 | MEDIUM | Phase 4 |
| 8 | `deeptwin_router.py` | 57 KB | 1,563 | 20 | LOW | Phase 5 |
| 9 | `qeeg_raw_router.py` | 48 KB | 1,367 | 17 | MEDIUM | Phase 3 |
| 10 | `auth_router.py` | 43 KB | 1,288 | 16 | HIGH | Phase 1 |

### Risk Levels

- **HIGH**: Router is on the critical authentication/data path OR handles
  heavy I/O (file uploads, large queries, streaming). Blocking here directly
  impacts user experience and system stability.
- **MEDIUM**: Router has many endpoints and moderate query complexity. Users
  notice latency under load but the system won't crash.
- **LOW**: Router is low-traffic or mostly compute-bound (rule-based engine).
  Async migration provides marginal benefit until the router starts doing
  real I/O (e.g., model inference, external API calls).

## Migration Strategy

### Phase 0: Infrastructure (foundation, do first)

1. Add `asyncpg` to API dependencies (`pyproject.toml`)
2. Create `async_database.py` alongside `database.py`:
   ```python
   from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
   
   async_engine = create_async_engine(
       url.replace("postgresql://", "postgresql+asyncpg://"),
       pool_size=20,
       max_overflow=30,
       pool_pre_ping=True,
       pool_recycle=3600,
   )
   AsyncSessionLocal = async_sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)
   
   async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
       async with AsyncSessionLocal() as session:
           yield session
   ```
3. Keep `database.py` untouched -- both sync and async coexist during migration
4. Add a test proving both session factories work against the same schema

### Phase 1: Auth Router (highest risk, smallest surface)

- Convert `auth_router.py` (16 endpoints) to `async def` + `AsyncSession`
- Auth is on every request path via JWT middleware -- async here unblocks
  the event loop for all downstream handlers
- Test: all existing auth tests must pass unchanged (swap session fixture)
- Rollback: revert to sync `get_db_session` dependency

### Phase 2: Patients Router (core CRUD, medium complexity)

- Convert `patients_router.py` (19 endpoints) to async
- This is the most-used CRUD surface -- patients are loaded on every clinical page
- Requires converting any service-layer functions that take `Session` as arg
- Test: patient CRUD + cross-clinic access tests must pass

### Phase 3: qEEG + Evidence + Assessments (heavy query routers)

- Convert `qeeg_analysis_router.py` (41 endpoints), `evidence_router.py` (41),
  `assessments_router.py` (14), `qeeg_raw_router.py` (17) -- 113 endpoints total
- These routers contain the heaviest queries (multi-join, pagination, aggregation)
- Benefit: largest throughput improvement per router migrated
- Risk: highest test surface area, most service-layer dependencies
- Test: full qEEG + evidence + assessment test suites

### Phase 4: MRI + Media + Patient Portal (file I/O routers)

- Convert `mri_analysis_router.py` (31), `media_router.py` (22),
  `patient_portal_router.py` (26) -- 79 endpoints total
- These routers handle file uploads/downloads -- async I/O gives the biggest
  latency win for these routes
- Test: file upload/download, streaming response tests

### Phase 5: DeepTwin + Remaining Routers

- Convert `deeptwin_router.py` (20) and remaining smaller routers
- DeepTwin is mostly compute-bound (rule-based engine) so async benefit is
  marginal until a real model is connected
- This is cleanup -- by this phase the pattern is well-established

## Alembic Considerations

- Alembic migrations currently use sync engine. No change needed during
  migration -- Alembic only runs at deploy time, not at request time.
- After full async migration, optionally switch Alembic to async runner
  (`alembic.config.Config` with `async_fallback=True` or a custom `env.py`)

## Service Layer Impact

Many routers delegate to service modules (`app/services/*.py`) that accept
`Session` as a parameter. These must be converted to accept `AsyncSession`
or made dual-compatible:

```python
# Before
def get_patient(db: Session, patient_id: str) -> Patient | None:
    return db.query(Patient).filter_by(id=patient_id).first()

# After (option A: full async)
async def get_patient(db: AsyncSession, patient_id: str) -> Patient | None:
    result = await db.execute(select(Patient).filter_by(id=patient_id))
    return result.scalar_one_or_none()

# After (option B: dual-compat during migration)
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

def get_patient(db: Session | AsyncSession, patient_id: str) -> Patient | None:
    stmt = select(Patient).filter_by(id=patient_id)
    if isinstance(db, AsyncSession):
        raise TypeError("Use get_patient_async for AsyncSession")
    return db.execute(stmt).scalar_one_or_none()
```

**Recommended**: Option A (full async) per-router, converting the entire
call chain at once. Dual-compat adds complexity with no long-term value.

## Test Plan

For each migration phase:

1. Create an `async_session` test fixture alongside the existing `session` fixture
2. Run the full existing test suite against the converted router
3. Add async-specific tests for:
   - Concurrent request handling (verify no thread starvation)
   - Connection pool exhaustion recovery
   - Transaction rollback on error
4. Load test with `locust` or `wrk` to verify throughput improvement

## Rollback Plan

Each phase is independently reversible:

1. Revert the router file to use `Session` + sync `def`
2. Remove `get_async_db` import from the reverted router
3. `async_database.py` remains available -- it doesn't affect sync routers
4. No schema changes are involved, so no Alembic rollback needed

The sync and async session factories coexist by design. A partially-migrated
codebase (some routers async, others sync) works correctly as long as each
router consistently uses one session type.

## Prerequisites

- [ ] `asyncpg` driver installed and tested against PostgreSQL
- [ ] SQLAlchemy 2.0+ confirmed (already using `future=True`)
- [ ] Uvicorn running with `--workers N` and `--loop uvloop` for max async benefit
- [ ] Connection pool sizing reviewed for production load profile
- [ ] Monitoring for connection pool metrics (active, idle, overflow)

## Decision: When to Start

This migration is NOT blocking for production launch. The current synchronous
architecture supports the expected initial user base (< 50 concurrent users).
Start this migration when:

1. Production monitoring shows connection pool saturation (>80% utilization)
2. P95 latency exceeds acceptable thresholds for database-heavy routes
3. The team has capacity for a multi-sprint infrastructure effort

Do NOT start this migration concurrently with feature development on the
same routers -- it will cause painful merge conflicts.
