# STABILIZATION Performance Review

## Executive Summary

This document presents a comprehensive performance analysis and optimization strategy for the DeepSynaps Protocol Studio healthcare application platform. The review addresses critical performance bottlenecks across the React frontend, FastAPI backend, caching infrastructure, and database layers, with specific attention to healthcare-domain requirements including real-time patient monitoring, large medical image handling, HIPAA-compliant data caching, and time-series vitals data optimization.

Healthcare applications present unique performance challenges: Electronic Health Record (EHR) systems face heavy read loads during clinical hours, with the same patient records accessed repeatedly by nurses, physicians, and billing staff. Medical image files (DICOM) can exceed 500MB per study, and real-time patient monitoring systems must deliver sub-second latency for critical vitals. This review provides actionable recommendations with specific code examples to address each of these concerns.

**Key Findings:**
- N+1 query problems can increase database round-trips from 2 to 50+, degrading response times by 10x
- React virtualization can reduce DOM node count from 10,000+ to ~20 visible items, eliminating scroll lag
- Proper Redis caching with 5-15 minute TTL can reduce database read load by 60-80% during peak hours
- Cursor-based pagination maintains O(1) query performance regardless of dataset size, versus O(offset) degradation with traditional offset pagination
- Async database connection pooling enables handling thousands of concurrent connections without proportional resource increase

---

## React Performance Optimization

### 1.1 Bundle Splitting and Lazy Loading

Route-based code splitting is the most effective initial optimization for healthcare dashboards, which typically contain heavy components for data visualization, medical imaging viewers, and administrative modules that are not needed on initial load.

**Route-Based Code Splitting Pattern:**

```javascript
import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// Lazy-loaded route components
const PatientDashboard = lazy(() => 
  import(/* webpackChunkName: "patient-dashboard" */ './pages/PatientDashboard')
);
const VitalsMonitor = lazy(() => 
  import(/* webpackChunkName: "vitals-monitor" */ './pages/VitalsMonitor')
);
const MedicalImaging = lazy(() => 
  import(/* webpackChunkName: "medical-imaging" */ './pages/MedicalImaging')
);
const AdminPanel = lazy(() => 
  import(/* webpackPrefetch: true */ './pages/AdminPanel')
);

function App() {
  return (
    <Router>
      <Suspense fallback={<LoadingSkeleton type="page" />}>
        <Routes>
          <Route path="/patients/:id" element={<PatientDashboard />} />
          <Route path="/vitals/:patientId" element={<VitalsMonitor />} />
          <Route path="/imaging/:studyId" element={<MedicalImaging />} />
          <Route path="/admin/*" element={<AdminPanel />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
```

**Conditional Component Loading for Modal Dialogs:**

```javascript
import React, { lazy, Suspense, useState } from 'react';

const LabResultViewer = lazy(() => import('./LabResultViewer'));
const ImagingViewer = lazy(() => import('./ImagingViewer'));
const PrescriptionModal = lazy(() => import('./PrescriptionModal'));

function PatientEncounter() {
  const [activeModal, setActiveModal] = useState(null);

  return (
    <div className="encounter-page">
      <PatientSummary />
      <ActionBar onAction={setActiveModal} />
      
      {activeModal === 'lab' && (
        <Suspense fallback={<ModalSkeleton />}>
          <LabResultViewer onClose={() => setActiveModal(null)} />
        </Suspense>
      )}
      {activeModal === 'imaging' && (
        <Suspense fallback={<ModalSkeleton />}>
          <ImagingViewer onClose={() => setActiveModal(null)} />
        </Suspense>
      )}
      {activeModal === 'prescription' && (
        <Suspense fallback={<ModalSkeleton />}>
          <PrescriptionModal onClose={() => setActiveModal(null)} />
        </Suspense>
      )}
    </div>
  );
}
```

### 1.2 N+1 Fetch Prevention on the Frontend

Healthcare dashboards frequently aggregate data from multiple sources (patient demographics, recent vitals, active medications, lab results). A naive implementation fetches each resource independently, creating a waterfall of sequential requests.

**Anti-Pattern (Sequential Fetching):**

```javascript
// AVOID: Sequential fetches creating request waterfalls
function PatientOverview({ patientId }) {
  const [patient, setPatient] = useState(null);
  const [vitals, setVitals] = useState(null);
  const [labs, setLabs] = useState(null);
  const [medications, setMedications] = useState(null);

  useEffect(() => {
    // 4 sequential round-trips
    fetch(`/api/patients/${patientId}`).then(r => r.json()).then(setPatient);
    fetch(`/api/patients/${patientId}/vitals`).then(r => r.json()).then(setVitals);
    fetch(`/api/patients/${patientId}/labs`).then(r => r.json()).then(setLabs);
    fetch(`/api/patients/${patientId}/medications`).then(r => r.json()).then(setMedications);
  }, [patientId]);
  // ...
}
```

**Optimized Pattern (Parallel Fetching with Aggregated Endpoints):**

```javascript
// PREFERRED: Backend-aggregated summary endpoint
function PatientOverview({ patientId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['patient-overview', patientId],
    queryFn: () => fetch(`/api/patients/${patientId}/summary`).then(r => r.json()),
    staleTime: 30000, // 30 seconds
  });

  // Single round-trip returns:
  // { patient, latestVitals, recentLabs, activeMedications }
}
```

**Parallel Fetching for Independent Resources:**

```javascript
// ALTERNATIVE: Parallel fetching when aggregation isn't possible
function PatientOverview({ patientId }) {
  const results = useQueries({
    queries: [
      { queryKey: ['patient', patientId], queryFn: fetchPatient },
      { queryKey: ['vitals', patientId], queryFn: fetchVitals, staleTime: 15000 },
      { queryKey: ['labs', patientId], queryFn: fetchLabs },
      { queryKey: ['medications', patientId], queryFn: fetchMeds },
    ],
  });
  // All 4 requests fire simultaneously
}
```

### 1.3 Memoization Strategies

Healthcare UIs often display complex derived data (calculated risk scores, formatted medication schedules, filtered problem lists). Without memoization, these computations re-run on every render.

```javascript
import React, { useMemo, useCallback, memo } from 'react';

// Memoized risk score calculation
function PatientRiskPanel({ patient, vitals, labs }) {
  const riskScore = useMemo(() => {
    const ageFactor = patient.age > 65 ? 1.5 : 1.0;
    const bpFactor = vitals.systolic > 140 ? 2.0 : 1.0;
    const glucoseFactor = labs.glucose > 126 ? 1.8 : 1.0;
    return calculateCompositeRisk(ageFactor, bpFactor, glucoseFactor);
  }, [patient.age, vitals.systolic, labs.glucose]);

  const sortedMedications = useMemo(() => {
    return [...patient.medications].sort((a, b) => 
      new Date(b.prescribedDate) - new Date(a.prescribedDate)
    );
  }, [patient.medications]);

  const handleMedicationClick = useCallback((medId) => {
    openMedicationDetail(medId);
  }, []);

  return (
    <RiskPanel score={riskScore}>
      <MedicationList 
        medications={sortedMedications} 
        onClick={handleMedicationClick}
      />
    </RiskPanel>
  );
}

// Memoized list item to prevent unnecessary re-renders
const MedicationItem = memo(function MedicationItem({ medication, onClick }) {
  return (
    <li onClick={() => onClick(medication.id)}>
      {medication.name} - {medication.dosage}
    </li>
  );
});
```

### 1.4 Virtualization for Long Lists

EHR systems frequently display long lists: patient medication histories, lab result timelines, appointment schedules, and ward census lists. Rendering thousands of DOM nodes causes severe scroll lag and memory pressure.

**Virtualized Patient List with react-window:**

```javascript
import React, { useMemo, memo } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

const PatientRow = memo(({ index, style, data }) => {
  const patient = data.patients[index];
  const isSelected = data.selectedIds.has(patient.id);

  return (
    <div
      style={{
        ...style,
        display: 'grid',
        gridTemplateColumns: '60px 1.5fr 1fr 120px 100px',
        gap: '8px',
        padding: '12px 16px',
        alignItems: 'center',
        borderBottom: '1px solid #e8e8e8',
        backgroundColor: isSelected ? '#e6f7ff' : index % 2 === 0 ? '#fff' : '#fafafa',
      }}
      onClick={() => data.onSelect(patient.id)}
    >
      <span className="mrn">{patient.mrn}</span>
      <span className="name">{patient.lastName}, {patient.firstName}</span>
      <span className="ward">{patient.currentWard}</span>
      <span className="status">
        <StatusBadge status={patient.status} />
      </span>
      <span className="room">{patient.roomNumber}</span>
    </div>
  );
});

function VirtualizedPatientList({ patients, selectedIds, onSelect }) {
  const itemData = useMemo(() => ({
    patients,
    selectedIds,
    onSelect,
  }), [patients, selectedIds, onSelect]);

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <AutoSizer>
        {({ height, width }) => (
          <List
            height={height}
            itemCount={patients.length}
            itemSize={56}
            width={width}
            itemData={itemData}
            overscanCount={5}
          >
            {PatientRow}
          </List>
        )}
      </AutoSizer>
    </div>
  );
}
```

**Key Virtualization Parameters for Healthcare UIs:**

| Parameter | Recommendation | Rationale |
|-----------|---------------|-----------|
| `itemSize` | Fixed when possible, `VariableSizeList` for dynamic content | Lab reports have variable content length |
| `overscanCount` | 3-5 items | Prevents visual gaps during fast scrolling |
| `itemData` | Memoized object containing all row dependencies | Prevents re-render cascades |
| Row component | Wrapped with `React.memo` | Essential for immutable list performance |

### 1.5 Unnecessary Re-Render Prevention

```javascript
// Use React DevTools Profiler to identify re-render sources
// Common healthcare UI anti-patterns:

// ANTI-PATTERN: Context value changes trigger all consumers
function PatientProvider({ children }) {
  const [patient, setPatient] = useState(null);
  const [vitals, setVitals] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Value object recreated every render - all consumers re-render
  const value = { patient, vitals, setPatient, isLoading, setIsLoading };
  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
}

// OPTIMIZED: Split contexts by update frequency
const PatientDataContext = createContext();
const PatientActionsContext = createContext();

function SplitPatientProvider({ children }) {
  const [patient, setPatient] = useState(null);
  const [vitals, setVitals] = useState(null);

  // Data context - rarely changes
  const dataValue = useMemo(() => ({ patient, vitals }), [patient, vitals]);
  
  // Actions context - stable reference
  const actionsValue = useMemo(() => ({
    updatePatient: setPatient,
    updateVitals: setVitals,
  }), []);

  return (
    <PatientDataContext.Provider value={dataValue}>
      <PatientActionsContext.Provider value={actionsValue}>
        {children}
      </PatientActionsContext.Provider>
    </PatientDataContext.Provider>
  );
}
```

---

## FastAPI Backend Scaling

### 2.1 Async Endpoint Patterns

Healthcare APIs must handle concurrent requests from multiple clinicians, devices, and systems. FastAPI's async support enables efficient I/O-bound operations without blocking the event loop.

**Correct Async Pattern for Database Operations:**

```python
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

app = FastAPI()

# Correct: async def for I/O-bound database operations
@app.get("/api/patients/{patient_id}")
async def get_patient(
    patient_id: int,
    db: AsyncSession = Depends(get_async_db)
):
    result = await db.execute(
        select(Patient)
        .where(Patient.id == patient_id)
        .options(selectinload(Patient.active_medications))
        .options(selectinload(Patient.allergies))
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient

# Correct: Regular def for CPU-bound operations
@app.post("/api/analytics/risk-score")
def calculate_risk_score(data: RiskFactorData):
    # CPU-intensive calculation - don't block event loop
    score = compute_composite_risk(data.factors)
    return {"risk_score": score, "category": categorize_risk(score)}
```

**Background Tasks for Non-Critical Operations:**

```python
from fastapi import BackgroundTasks

@app.post("/api/patients/{patient_id}/vitals")
async def record_vitals(
    patient_id: int,
    vitals: VitalsInput,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db)
):
    # Critical path: store vitals immediately
    vital_record = await vitals_service.save(db, patient_id, vitals)
    
    # Non-critical: audit logging and alert evaluation
    background_tasks.add_task(audit_log.record, "vitals_entered", patient_id, vitals)
    background_tasks.add_task(alert_engine.evaluate_vitals, patient_id, vitals)
    
    return vital_record
```

### 2.2 Database Connection Pooling

Connection pooling is essential for healthcare applications where multiple clinicians and systems maintain concurrent database connections. SQLAlchemy's pool configuration manages connection lifecycle efficiently.

**Optimized Async Engine Configuration:**

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Primary write engine
write_engine = create_async_engine(
    DATABASE_URL,
    pool_size=20,              # Base connections for write operations
    max_overflow=30,           # Burst capacity for peak clinical hours
    pool_pre_ping=True,        # Verify connection validity before use
    pool_recycle=1800,         # Recycle connections after 30 minutes
    pool_timeout=30,           # Wait up to 30s for available connection
    echo=False,                # Set True in development only
)

# Read replica engine for heavy analytics
read_engine = create_async_engine(
    READ_REPLICA_URL,
    pool_size=40,              # More connections for read-heavy workloads
    max_overflow=60,
    pool_pre_ping=True,
    pool_recycle=1800,
)

WriteSession = async_sessionmaker(write_engine, expire_on_commit=False)
ReadSession = async_sessionmaker(read_engine, expire_on_commit=False)

# Dependency injection for read/write splitting
async def get_write_session() -> AsyncGenerator[AsyncSession, None]:
    async with WriteSession() as session:
        yield session

async def get_read_session() -> AsyncGenerator[AsyncSession, None]:
    async with ReadSession() as session:
        yield session
```

### 2.3 Query Optimization and the N+1 Problem

The N+1 query problem is the most common silent performance killer in healthcare APIs. When fetching patients with their related data (medications, allergies, providers), an ORM may execute one query for patients plus N additional queries for each patient's relationships.

**The N+1 Problem Illustrated:**

```python
# ANTI-PATTERN: 51 queries for 50 patients
@app.get("/api/patients/naive")
def get_patients_naive(db: Session = Depends(get_db)):
    patients = db.query(Patient).all()  # 1 query
    result = []
    for p in patients:
        result.append({
            "name": p.name,
            "medications": [m.name for m in p.medications],  # N queries!
            "allergies": [a.name for a in p.allergies],      # N queries!
        })
    return result  # Total: 1 + 2N queries (101 for 50 patients)
```

**Solution with Eager Loading (selectinload):**

```python
from sqlalchemy.orm import selectinload, joinedload

# OPTIMIZED: 2 queries regardless of patient count
@app.get("/api/patients/optimized")
async def get_patients_optimized(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(
        select(Patient)
        .options(selectinload(Patient.medications))
        .options(selectinload(Patient.allergies))
        .options(selectinload(Patient.primary_provider))
        .limit(50)
    )
    patients = result.scalars().all()
    return patients  # Total: exactly 2 queries

# For single-patient fetches with complex relationships
@app.get("/api/patients/{patient_id}/full-record")
async def get_patient_full_record(
    patient_id: int,
    db: AsyncSession = Depends(get_async_db)
):
    result = await db.execute(
        select(Patient)
        .where(Patient.id == patient_id)
        .options(
            selectinload(Patient.medications),
            selectinload(Patient.allergies),
            selectinload(Patient.vitals_history),
            selectinload(Patient.lab_results),
            selectinload(Patient.imaging_studies),
            selectinload(Patient.encounters).selectinload(Encounter.provider),
        )
    )
    return result.scalar_one_or_none()
```

**Loading Strategy Selection Guide:**

| Strategy | Use Case | Query Count | Performance |
|----------|----------|-------------|-------------|
| `selectinload()` | Most collections (medications, allergies, vitals) | 2 | O(1) scaling |
| `joinedload()` | Single related object (primary provider) | 1 | Best for small data |
| `lazyload()` | Rarely accessed nested data | N+1 | Acceptable for <5 items |
| `raiseload()` | Development safety - catch N+1 early | N/A | Development only |

### 2.4 Response Compression

```python
from fastapi.middleware.gzip import GZipMiddleware

app = FastAPI()

# Add GZip compression for responses > 1KB
app.add_middleware(
    GZipMiddleware,
    minimum_size=1000,  # Only compress responses > 1KB
    compresslevel=6,    # Balance between speed and compression
)
```

### 2.5 Rate Limiting

Healthcare APIs require rate limiting to prevent abuse while ensuring critical clinical endpoints remain accessible. A token bucket algorithm provides burst tolerance for urgent requests.

```python
import time
from fastapi import Request, HTTPException
from fastapi.middleware import Middleware

class TokenBucket:
    def __init__(self, max_tokens: int, refill_rate: float, interval: float):
        self.max_tokens = max_tokens
        self.refill_rate = refill_rate
        self.interval = interval
        self.tokens = max_tokens
        self.last_refill = time.time()

    def allow_request(self) -> bool:
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(
            self.max_tokens,
            self.tokens + (elapsed / self.interval) * self.refill_rate
        )
        self.last_refill = now
        
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False

# Per-IP rate limiting with different tiers
class RateLimiterStore:
    def __init__(self):
        self.buckets = {}
    
    def get_bucket(self, key: str, tier: str = "standard") -> TokenBucket:
        tiers = {
            "critical": {"max": 50, "rate": 10, "interval": 1.0},   # Vitals endpoints
            "standard": {"max": 20, "rate": 5, "interval": 1.0},    # Standard API
            "analytics": {"max": 10, "rate": 2, "interval": 1.0},  # Reports
        }
        config = tiers.get(tier, tiers["standard"])
        
        if key not in self.buckets:
            self.buckets[key] = TokenBucket(**config)
        return self.buckets[key]

limiter = RateLimiterStore()

@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Skip rate limiting for health checks
    if request.url.path == "/health":
        return await call_next(request)
    
    # Determine tier by endpoint
    tier = "standard"
    if "/vitals" in request.url.path:
        tier = "critical"
    elif "/analytics" in request.url.path:
        tier = "analytics"
    
    client_id = request.headers.get("X-API-Key", request.client.host)
    bucket = limiter.get_bucket(client_id, tier)
    
    if not bucket.allow_request():
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Retry after 1 second."
        )
    
    return await call_next(request)
```

### 2.6 Request Batching

For bulk operations common in healthcare (batch lab uploads, ward census updates, medication reconciliation):

```python
from pydantic import BaseModel
from typing import List

class BulkVitalsEntry(BaseModel):
    patient_id: int
    temperature: float | None = None
    heart_rate: int | None = None
    blood_pressure_systolic: int | None = None
    blood_pressure_diastolic: int | None = None
    spo2: int | None = None
    recorded_at: datetime

class BulkVitalsRequest(BaseModel):
    entries: List[BulkVitalsEntry]
    ward_id: str

@app.post("/api/vitals/bulk")
async def bulk_record_vitals(
    request: BulkVitalsRequest,
    db: AsyncSession = Depends(get_write_session)
):
    """Batch insert vitals for entire ward - reduces 50 requests to 1."""
    from sqlalchemy.dialects.postgresql import insert
    
    values = [
        {
            "patient_id": e.patient_id,
            "temperature": e.temperature,
            "heart_rate": e.heart_rate,
            "bp_systolic": e.blood_pressure_systolic,
            "bp_diastolic": e.blood_pressure_diastolic,
            "spo2": e.spo2,
            "recorded_at": e.recorded_at,
            "ward_id": request.ward_id,
        }
        for e in request.entries
    ]
    
    result = await db.execute(
        insert(VitalsRecord).values(values).returning(VitalsRecord.id)
    )
    await db.commit()
    
    return {
        "inserted": len(result.all()),
        "ward_id": request.ward_id,
    }
```

---

## Caching Strategies

### 3.1 Patient Data Caching with Redis

Healthcare data caching requires careful balance between performance and data freshness. Medical records change frequently (new labs, medication updates), so aggressive caching can serve stale data.

**Redis Cache Layer for Patient Records:**

```python
import redis
import json
import hashlib
from datetime import timedelta

class PatientCacheManager:
    def __init__(self, redis_client: redis.Redis):
        self.r = redis_client
        self.prefix = "emr:patient"
        self.ttl = 600  # 10 minutes - balance freshness vs performance
        self.access_log = "emr:access:log"
    
    def _cache_key(self, patient_id: str, data_type: str = "full") -> str:
        """Generate namespaced cache key."""
        return f"{self.prefix}:{data_type}:{patient_id}"
    
    async def get_patient(self, patient_id: str, requester_id: str) -> dict | None:
        """Fetch patient from cache with audit logging."""
        cache_key = self._cache_key(patient_id)
        cached = self.r.get(cache_key)
        
        if cached:
            # Log cache hit for HIPAA audit trail
            self.r.xadd(self.access_log, {
                "event": "cache_hit",
                "patient_id": patient_id,
                "requester_id": requester_id,
                "timestamp": time.time(),
            })
            return json.loads(cached)
        return None
    
    async def set_patient(self, patient_id: str, data: dict) -> None:
        """Cache patient record with TTL."""
        cache_key = self._cache_key(patient_id)
        self.r.setex(cache_key, self.ttl, json.dumps(data))
    
    async def invalidate_patient(self, patient_id: str) -> None:
        """Immediate invalidation on record update."""
        # Delete all cache variants for this patient
        pattern = f"{self.prefix}:*:{patient_id}"
        keys = self.r.scan_iter(match=pattern)
        for key in keys:
            self.r.delete(key)
```

### 3.2 Multi-Tier Caching Architecture

```python
class TieredCacheManager:
    """
    Three-tier caching:
    L1: In-memory LRU (sub-millisecond) - patient context in active session
    L2: Redis shared cache (1-5ms) - ward-level shared data
    L3: Database (10-50ms) - source of truth
    """
    
    def __init__(self):
        from functools import lru_cache
        self.l1_local = {}  # Per-request context cache
        self.l2_redis = redis.Redis(host='localhost', port=6379, decode_responses=True)
        self.l3_db = None  # Set via dependency injection
    
    async def get(self, key: str, fetch_from_db, ttl: int = 600):
        # L1: Check local context cache
        if key in self.l1_local:
            return self.l1_local[key]
        
        # L2: Check Redis
        cached = self.l2_redis.get(key)
        if cached:
            data = json.loads(cached)
            self.l1_local[key] = data  # Promote to L1
            return data
        
        # L3: Database fallback
        data = await fetch_from_db()
        
        # Populate L2 and L1
        self.l2_redis.setex(key, ttl, json.dumps(data, default=str))
        self.l1_local[key] = data
        return data
```

### 3.3 Cache Invalidation Strategies

Cache invalidation is particularly critical in healthcare where stale data can impact clinical decisions.

```python
class CacheInvalidator:
    """HIPAA-compliant cache invalidation with audit logging."""
    
    async def invalidate_on_patient_update(
        self, 
        patient_id: str, 
        updated_fields: list[str],
        updater_id: str
    ) -> None:
        """Invalidate all caches for a patient when their record changes."""
        
        # 1. Immediately purge all cache entries
        patterns = [
            f"emr:patient:full:{patient_id}",
            f"emr:patient:summary:{patient_id}",
            f"emr:patient:vitals:{patient_id}",
            f"emr:ward:*:{patient_id}",
        ]
        
        pipe = self.redis.pipeline()
        for pattern in patterns:
            for key in self.redis.scan_iter(match=pattern):
                pipe.delete(key)
        
        # 2. Log invalidation for audit trail
        pipe.xadd("emr:invalidation:log", {
            "patient_id": patient_id,
            "updater_id": updater_id,
            "fields_changed": json.dumps(updated_fields),
            "timestamp": time.time(),
            "action": "cache_invalidation",
        })
        
        await pipe.execute()
    
    async def invalidate_ward_cache(self, ward_id: str) -> None:
        """Invalidate all patient caches for a ward (e.g., after shift change)."""
        pattern = f"emr:ward:{ward_id}:*"
        keys = list(self.redis.scan_iter(match=pattern))
        if keys:
            self.redis.delete(*keys)
```

### 3.4 TTL-Based Caching Recommendations

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Patient demographics | 600s (10 min) | Changes infrequently |
| Current vitals | 60s (1 min) | Near real-time requirement |
| Active medications | 300s (5 min) | Changes with new orders |
| Lab results | 900s (15 min) | New results arrive periodically |
| Provider directory | 3600s (1 hour) | Changes infrequently |
| Reference data (ICD codes) | 86400s (24 hours) | Effectively static |
| Ward census list | 120s (2 min) | Changes with admissions/discharges |

### 3.5 Evidence and Snapshot Caching

```python
class EvidenceCacheManager:
    """Cache for clinical evidence, guidelines, and decision support data."""
    
    def __init__(self, redis_client: redis.Redis):
        self.r = redis_client
        self.snapshot_ttl = 86400  # 24 hours for evidence snapshots
    
    async def cache_evidence_snapshot(
        self, 
        evidence_id: str, 
        snapshot_data: dict
    ) -> str:
        """Cache an evidence snapshot with content-addressable key."""
        content_hash = hashlib.sha256(
            json.dumps(snapshot_data, sort_keys=True).encode()
        ).hexdigest()[:16]
        
        cache_key = f"evidence:snapshot:{evidence_id}:{content_hash}"
        self.r.setex(cache_key, self.snapshot_ttl, json.dumps(snapshot_data))
        return cache_key
    
    async def get_or_create_snapshot(
        self, 
        evidence_id: str, 
        generator_func
    ) -> dict:
        """Retrieve cached snapshot or generate new one."""
        # Try to find any valid snapshot for this evidence
        pattern = f"evidence:snapshot:{evidence_id}:*"
        keys = list(self.r.scan_iter(match=pattern))
        
        if keys:
            # Return most recent snapshot
            newest = max(keys, key=lambda k: self.r.ttl(k))
            return json.loads(self.r.get(newest))
        
        # Generate and cache new snapshot
        snapshot = await generator_func()
        await self.cache_evidence_snapshot(evidence_id, snapshot)
        return snapshot
```

---

## Payload Optimization

### 4.1 Summary Endpoints

Healthcare UIs often need condensed views. Rather than fetching full records, implement dedicated summary endpoints.

```python
@app.get("/api/patients/{patient_id}/summary")
async def get_patient_summary(
    patient_id: int,
    db: AsyncSession = Depends(get_read_session)
):
    """Optimized summary: ~5KB vs ~200KB for full record."""
    result = await db.execute(
        select(
            Patient.id,
            Patient.mrn,
            Patient.first_name,
            Patient.last_name,
            Patient.date_of_birth,
            Patient.room_number,
            Patient.admission_date,
            Patient.status,
        )
        .where(Patient.id == patient_id)
    )
    patient = result.one_or_none()
    
    # Fetch only latest vitals (1 row, not full history)
    vitals_result = await db.execute(
        select(VitalsRecord)
        .where(VitalsRecord.patient_id == patient_id)
        .order_by(VitalsRecord.recorded_at.desc())
        .limit(1)
    )
    latest_vitals = vitals_result.scalar_one_or_none()
    
    # Active medication count only
    med_count_result = await db.execute(
        select(func.count(Medication.id))
        .where(
            and_(
                Medication.patient_id == patient_id,
                Medication.status == "active"
            )
        )
    )
    active_med_count = med_count_result.scalar()
    
    return {
        "id": patient.id,
        "mrn": patient.mrn,
        "name": f"{patient.last_name}, {patient.first_name}",
        "age": calculate_age(patient.date_of_birth),
        "room": patient.room_number,
        "status": patient.status,
        "latest_vitals": {
            "heart_rate": latest_vitals.heart_rate if latest_vitals else None,
            "bp": f"{latest_vitals.bp_systolic}/{latest_vitals.bp_diastolic}" if latest_vitals else None,
            "spo2": latest_vitals.spo2 if latest_vitals else None,
            "recorded_at": latest_vitals.recorded_at if latest_vitals else None,
        },
        "active_medications": active_med_count,
        "admission_days": (datetime.now() - patient.admission_date).days,
    }
```

### 4.2 Field Selection

```python
@app.get("/api/patients/{patient_id}")
async def get_patient(
    patient_id: int,
    fields: str = Query(default=None, description="Comma-separated field list"),
    db: AsyncSession = Depends(get_read_session)
):
    """Support sparse fieldsets to reduce payload size."""
    
    # Default columns for full response
    columns = [Patient]
    
    if fields:
        requested = set(fields.split(","))
        available = {
            "id": Patient.id,
            "mrn": Patient.mrn,
            "name": Patient.last_name,  # Composite handled in response
            "dob": Patient.date_of_birth,
            "room": Patient.room_number,
            "status": Patient.status,
            "ward": Patient.ward_id,
        }
        columns = [available[f] for f in requested if f in available]
    
    result = await db.execute(
        select(*columns).where(Patient.id == patient_id)
    )
    return result.one_or_none()

# Usage: /api/patients/123?fields=mrn,name,room,status
# Returns only 4 fields instead of 30+
```

### 4.3 Cursor-Based Pagination

For large healthcare datasets (patient lists, lab histories, encounter logs), cursor-based pagination provides consistent O(1) query performance versus the O(offset) degradation of traditional offset pagination.

```python
from fastapi import Query
from pydantic import BaseModel
from typing import TypeVar, Generic
from base64 import b64encode, b64decode
import json

T = TypeVar("T")

class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None
    has_more: bool
    total_count: int | None

def encode_cursor(data: dict) -> str:
    return b64encode(json.dumps(data).encode()).decode()

def decode_cursor(cursor: str) -> dict:
    return json.loads(b64decode(cursor.encode()))

@app.get("/api/patients")
async def list_patients(
    cursor: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    ward_id: str | None = None,
    status: str | None = None,
    db: AsyncSession = Depends(get_read_session)
):
    """Cursor-based pagination for patient lists.
    
    Performance: ~0.15ms regardless of page depth
    vs offset pagination which degrades to 50ms+ at page 1000.
    """
    
    query = select(Patient).order_by(Patient.id)
    
    # Apply filters
    if ward_id:
        query = query.where(Patient.ward_id == ward_id)
    if status:
        query = query.where(Patient.status == status)
    
    # Apply cursor (keyset pagination)
    if cursor:
        cursor_data = decode_cursor(cursor)
        query = query.where(Patient.id > cursor_data["last_id"])
    
    # Fetch limit + 1 to determine has_more
    query = query.limit(limit + 1)
    
    result = await db.execute(
        query.options(selectinload(Patient.primary_provider))
    )
    patients = result.scalars().all()
    
    has_more = len(patients) > limit
    items = patients[:limit]
    
    next_cursor = None
    if has_more and items:
        next_cursor = encode_cursor({"last_id": items[-1].id})
    
    return CursorPage(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        total_count=None,  # Omit for performance; use separate count endpoint if needed
    )
```

**Pagination Performance Comparison:**

| Page Depth | Offset Pagination | Cursor Pagination | Improvement |
|------------|------------------|-------------------|-------------|
| Page 1 | 0.5ms | 0.15ms | 3.3x faster |
| Page 100 | 15ms | 0.15ms | 100x faster |
| Page 1000 | 150ms | 0.15ms | 1000x faster |
| Page 10000 | 2000ms | 0.15ms | 13000x faster |

### 4.4 Compression

```python
from fastapi.middleware.gzip import GZipMiddleware
from fastapi import Response

app.add_middleware(GZipMiddleware, minimum_size=1000)

# For medical imaging DICOM metadata endpoints
@app.get("/api/imaging/{study_id}/metadata")
async def get_imaging_metadata(study_id: str):
    metadata = await imaging_service.get_metadata(study_id)
    
    # Pre-compress large payloads
    import gzip
    import json
    
    json_bytes = json.dumps(metadata).encode()
    if len(json_bytes) > 1024:
        compressed = gzip.compress(json_bytes, compresslevel=6)
        return Response(
            content=compressed,
            media_type="application/json",
            headers={"Content-Encoding": "gzip"}
        )
    return metadata
```

### 4.5 Streaming for Large Datasets

```python
from fastapi.responses import StreamingResponse
import asyncio

@app.get("/api/patients/{patient_id}/vitals/export")
async def export_vitals_csv(
    patient_id: int,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    db: AsyncSession = Depends(get_read_session)
):
    """Stream large vitals datasets as CSV to prevent memory exhaustion."""
    
    async def generate_csv_rows():
        # Yield header
        yield "recorded_at,heart_rate,bp_systolic,bp_diastolic,temperature,spo2,respiratory_rate\n"
        
        # Stream in chunks of 1000 rows
        offset = 0
        chunk_size = 1000
        
        while True:
            result = await db.execute(
                select(VitalsRecord)
                .where(
                    and_(
                        VitalsRecord.patient_id == patient_id,
                        VitalsRecord.recorded_at >= start_date if start_date else True,
                        VitalsRecord.recorded_at <= end_date if end_date else True,
                    )
                )
                .order_by(VitalsRecord.recorded_at)
                .offset(offset)
                .limit(chunk_size)
            )
            
            rows = result.scalars().all()
            if not rows:
                break
            
            for row in rows:
                yield f"{row.recorded_at},{row.heart_rate},{row.bp_systolic},{row.bp_diastolic},{row.temperature},{row.spo2},{row.respiratory_rate}\n"
            
            offset += chunk_size
            await asyncio.sleep(0)  # Yield control between chunks
    
    return StreamingResponse(
        generate_csv_rows(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=vitals_{patient_id}.csv",
            "X-Content-Type-Options": "nosniff",
        }
    )
```

---

## Healthcare-Specific Performance

### 5.1 Real-Time Monitoring Requirements

Patient monitoring systems must deliver critical vitals data with sub-second latency. A hybrid MQTT + WebSocket architecture provides the best balance of efficiency and browser compatibility.

**Architecture Overview:**

```
IoT Vitals Devices → MQTT Broker (TLS) → FastAPI Consumer → Redis Pub/Sub → WebSocket → React UI
```

```python
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
import aiomqtt

class VitalsConnectionManager:
    """Manage WebSocket connections for real-time vitals streaming."""
    
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        async with self._lock:
            if room_id not in self.active_connections:
                self.active_connections[room_id] = []
            self.active_connections[room_id].append(websocket)
    
    async def disconnect(self, websocket: WebSocket, room_id: str):
        async with self._lock:
            self.active_connections[room_id].remove(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
    
    async def broadcast_to_room(self, room_id: str, message: dict):
        """Push vitals update to all connected clients in a room."""
        if room_id not in self.active_connections:
            return
        
        dead_connections = []
        for ws in self.active_connections[room_id]:
            try:
                await ws.send_json(message)
            except Exception:
                dead_connections.append(ws)
        
        # Clean up failed connections
        for ws in dead_connections:
            self.active_connections[room_id].remove(ws)

manager = VitalsConnectionManager()

@app.websocket("/ws/vitals/{room_id}")
async def vitals_websocket(websocket: WebSocket, room_id: str):
    await manager.connect(websocket, room_id)
    try:
        while True:
            # Keep connection alive, process client pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await manager.disconnect(websocket, room_id)

# MQTT Consumer (runs as background task)
async def mqtt_vitals_consumer():
    async with aiomqtt.Client("mqtt.broker.local", tls_params=ssl_params) as client:
        await client.subscribe("hospital/+/vitals/+")
        async for message in client.messages:
            payload = json.loads(message.payload)
            room_id = payload["room_id"]
            
            # Forward to WebSocket clients
            await manager.broadcast_to_room(room_id, {
                "type": "vitals_update",
                "patient_id": payload["patient_id"],
                "heart_rate": payload["heart_rate"],
                "bp": payload["blood_pressure"],
                "spo2": payload["spo2"],
                "timestamp": payload["timestamp"],
            })
            
            # Persist to time-series database
            await store_vitals_timeseries(payload)
```

**Performance Benchmarks for Real-Time Pipeline:**

| Metric | Target | Achievable |
|--------|--------|------------|
| MQTT message delivery | < 100ms | ~90ms |
| WebSocket push latency | < 150ms | 70-120ms |
| Concurrent connections | 500+ | 500+ verified |
| Data drop rate | < 0.1% | < 0.01% |

### 5.2 Large Medical Image Handling

Medical images (DICOM) require specialized handling due to file sizes exceeding 500MB per study.

```python
from fastapi import UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
import aiofiles
import os

CHUNK_SIZE = 1024 * 1024  # 1MB chunks

@app.post("/api/imaging/upload")
async def upload_dicom_study(
    files: list[UploadFile] = File(...),
    patient_id: int = ...,
    study_id: str = ...
):
    """Stream large DICOM files to storage without loading into memory."""
    
    saved_files = []
    for upload_file in files:
        file_path = f"/storage/dicom/{patient_id}/{study_id}/{upload_file.filename}"
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        # Stream write in chunks to avoid memory pressure
        async with aiofiles.open(file_path, 'wb') as f:
            while chunk := await upload_file.read(CHUNK_SIZE):
                await f.write(chunk)
        
        saved_files.append({
            "filename": upload_file.filename,
            "size": os.path.getsize(file_path),
            "path": file_path,
        })
    
    # Trigger async thumbnail generation
    background_tasks.add_task(
        generate_dicom_thumbnails, 
        patient_id, 
        study_id
    )
    
    return {"study_id": study_id, "files": saved_files}

@app.get("/api/imaging/{study_id}/stream")
async def stream_dicom_image(study_id: str, series_uid: str, instance_uid: str):
    """Stream DICOM images with HTTP range support for partial requests."""
    
    file_path = f"/storage/dicom/{study_id}/{series_uid}/{instance_uid}.dcm"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404)
    
    file_size = os.path.getsize(file_path)
    
    async def file_iterator():
        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.read(CHUNK_SIZE):
                yield chunk
    
    return StreamingResponse(
        file_iterator(),
        media_type="application/dicom",
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=86400",
        }
    )
```

### 5.3 Time Series Data Optimization

Vitals data is inherently time-series in nature. Specialized storage and query patterns dramatically improve performance.

```python
# Optimized time-series vitals query using hypertables (TimescaleDB)
@app.get("/api/patients/{patient_id}/vitals/timeseries")
async def get_vitals_timeseries(
    patient_id: int,
    metric: str = Query(..., enum=["heart_rate", "bp_systolic", "bp_diastolic", "spo2", "temperature"]),
    start: datetime | None = None,
    end: datetime | None = None,
    bucket_minutes: int = Query(default=5, ge=1, le=1440),
    db: AsyncSession = Depends(get_read_session)
):
    """Aggregated time-series vitals using TimescaleDB continuous aggregates."""
    
    result = await db.execute(
        text("""
        SELECT 
            time_bucket(:bucket, recorded_at) as bucket_time,
            avg(value) as avg_value,
            min(value) as min_value,
            max(value) as max_value,
            count(*) as sample_count
        FROM vitals_timeseries
        WHERE patient_id = :patient_id
          AND metric = :metric
          AND recorded_at BETWEEN :start AND :end
        GROUP BY bucket_time
        ORDER BY bucket_time
        """),
        {
            "patient_id": patient_id,
            "metric": metric,
            "start": start or datetime.now() - timedelta(days=1),
            "end": end or datetime.now(),
            "bucket": f"{bucket_minutes} minutes",
        }
    )
    
    return [
        {
            "timestamp": row.bucket_time,
            "avg": round(row.avg_value, 1),
            "min": row.min_value,
            "max": row.max_value,
            "samples": row.sample_count,
        }
        for row in result.all()
    ]
```

### 5.4 Batch Upload Optimization

```python
@app.post("/api/lab-results/bulk-import")
async def bulk_import_lab_results(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_write_session)
):
    """Process bulk lab results with progress tracking."""
    
    import csv
    import io
    
    contents = await file.read()
    decoded = io.StringIO(contents.decode('utf-8'))
    reader = csv.DictReader(decoded)
    
    # Validate all rows first
    rows = list(reader)
    if len(rows) > 10000:
        raise HTTPException(status_code=400, detail="Maximum 10,000 rows per batch")
    
    # Process in batches of 500 for optimal insert performance
    BATCH_INSERT_SIZE = 500
    total_inserted = 0
    errors = []
    
    for i in range(0, len(rows), BATCH_INSERT_SIZE):
        batch = rows[i:i + BATCH_INSERT_SIZE]
        
        try:
            values = [
                {
                    "patient_mrn": row["mrn"],
                    "test_code": row["test_code"],
                    "result_value": float(row["result_value"]),
                    "unit": row["unit"],
                    "reference_range": row.get("reference_range"),
                    "tested_at": datetime.fromisoformat(row["tested_at"]),
                    "status": "final",
                }
                for row in batch
            ]
            
            result = await db.execute(
                insert(LabResult).values(values)
            )
            total_inserted += result.rowcount
            
        except Exception as e:
            errors.append({"batch_index": i, "error": str(e)})
    
    await db.commit()
    
    # Invalidate affected patient caches
    background_tasks.add_task(
        invalidate_patient_caches_for_lab_batch,
        [row["mrn"] for row in rows]
    )
    
    return {
        "processed": len(rows),
        "inserted": total_inserted,
        "errors": errors,
        "processing_time_ms": elapsed_ms,
    }
```

---

## Database Query Optimization

### 6.1 Indexing Strategy

Proper indexing is the single most impactful database optimization for healthcare applications. The following composite indexes address common query patterns:

```sql
-- Core patient lookups
CREATE INDEX CONCURRENTLY idx_patients_mrn ON patients(mrn);
CREATE INDEX CONCURRENTLY idx_patients_ward_status ON patients(ward_id, status) 
    INCLUDE (room_number, last_name, first_name);

-- Vitals time-series queries (TimescaleDB hypertable)
CREATE INDEX CONCURRENTLY idx_vitals_patient_metric_time 
    ON vitals_timeseries(patient_id, metric, recorded_at DESC);

-- Lab results with ordering
CREATE INDEX CONCURRENTLY idx_lab_results_patient_ordered 
    ON lab_results(patient_id, tested_at DESC) 
    INCLUDE (test_code, result_value, status);

-- Medication active queries
CREATE INDEX CONCURRENTLY idx_medications_active 
    ON medications(patient_id, status, prescribed_date DESC) 
    WHERE status = 'active';

-- Encounter lookups
CREATE INDEX CONCURRENTLY idx_encounters_patient_date 
    ON encounters(patient_id, encounter_date DESC) 
    INCLUDE (encounter_type, provider_id);

-- Full-text search on patient names
CREATE INDEX CONCURRENTLY idx_patients_name_search 
    ON patients USING gin(to_tsvector('english', 
        coalesce(first_name, '') || ' ' || coalesce(last_name, '')
    ));

-- Composite index for ward census (most common dashboard query)
CREATE INDEX CONCURRENTLY idx_patients_census 
    ON patients(ward_id, status, admission_date DESC) 
    WHERE status IN ('admitted', 'observation', 'critical');
```

### 6.2 Query Plan Analysis

Always verify query performance with `EXPLAIN ANALYZE`:

```python
@app.middleware("http")
async def slow_query_logger(request: Request, call_next):
    """Log queries exceeding threshold for optimization review."""
    import time
    start = time.time()
    
    # Enable SQL echoing in development
    if settings.ENV == "development":
        from sqlalchemy import event
        @event.listens_for(AsyncSession, "before_cursor_execute")
        def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            context._query_start_time = time.time()
        
        @event.listens_for(AsyncSession, "after_cursor_execute")
        def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
            total = time.time() - context._query_start_time
            if total > 0.1:  # Log queries > 100ms
                logger.warning(f"Slow query ({total:.2f}s): {statement[:200]}")
    
    response = await call_next(request)
    return response
```

### 6.3 Materialized Views for Dashboards

```sql
-- Pre-computed ward census for dashboard
CREATE MATERIALIZED VIEW ward_census_summary AS
SELECT 
    p.ward_id,
    w.name as ward_name,
    p.status,
    COUNT(*) as patient_count,
    COUNT(*) FILTER (WHERE p.acuity = 'critical') as critical_count,
    AVG(EXTRACT(EPOCH FROM (NOW() - p.admission_date))/3600)::int as avg_length_of_stay_hours
FROM patients p
JOIN wards w ON p.ward_id = w.id
WHERE p.status IN ('admitted', 'observation', 'critical')
GROUP BY p.ward_id, w.name, p.status;

CREATE UNIQUE INDEX idx_ward_census ON ward_census_summary(ward_id, status);

-- Refresh every 2 minutes
SELECT cron.schedule('refresh-census', '*/2 * * * *', 
    'REFRESH MATERIALIZED VIEW CONCURRENTLY ward_census_summary');
```

---

## DeepSynaps Performance Recommendations

### 7.1 Immediate Actions (Week 1-2)

1. **Implement `selectinload()` on all patient endpoints** - This single change can reduce database queries by 80-90% on list endpoints.

2. **Add Redis caching for patient summary data** with 10-minute TTL. Configure immediate invalidation on all patient update operations.

3. **Replace offset pagination with cursor-based pagination** on all list endpoints handling >1000 records.

4. **Enable GZip compression** for all JSON responses >1KB.

5. **Add database connection pooling** with `pool_size=20`, `max_overflow=30`, `pool_pre_ping=True`.

### 7.2 Short-Term Improvements (Month 1)

1. **Implement React virtualization** on patient lists, medication histories, and lab result tables using `react-window`.

2. **Deploy route-based code splitting** to reduce initial bundle size by 40-60%.

3. **Add tiered rate limiting** (critical/standard/analytics tiers) to protect vitals endpoints.

4. **Create materialized views** for dashboard census data and common analytics queries.

5. **Implement streaming responses** for large dataset exports (vitals CSV, lab reports).

### 7.3 Long-Term Architecture (Quarter 1)

1. **Deploy read replica database** for analytics and reporting queries, routing write operations to primary.

2. **Implement MQTT + WebSocket pipeline** for real-time vitals with sub-100ms delivery targets.

3. **Add TimescaleDB hypertables** for vitals time-series data with automatic partitioning.

4. **Deploy CDN for DICOM image caching** at edge locations near clinical facilities.

5. **Implement comprehensive APM** (Application Performance Monitoring) with query-level tracing.

### 7.4 Performance Budget

| Metric | Current Target | Optimized Target |
|--------|---------------|-----------------|
| Dashboard initial load | < 3s | < 1.5s |
| Patient search results | < 500ms | < 100ms |
| Vitals save-to-display | < 2s | < 500ms |
| Large list scroll (10K items) | Janky | 60fps |
| API response (p95) | < 500ms | < 100ms |
| Image viewer load (10MB DICOM) | < 5s | < 2s |
| Bulk upload (1000 records) | > 30s | < 5s |

---

## Risk Assessment

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Stale cache serving outdated patient data | Clinical decision errors | 10-minute max TTL; immediate invalidation on writes; version stamps |
| N+1 queries under load | Database overload, cascading failures | Mandatory `selectinload()` review in PR process; query count assertions in tests |
| Real-time vitals latency | Missed critical alerts | MQTT QoS 1 delivery; WebSocket reconnection; fallback SMS alerts |
| Large DICOM uploads causing memory pressure | Server crashes | Stream chunked uploads; reject files >2GB; pre-signed URL offloading |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rate limiting blocking emergency access | Delayed critical care | Separate rate limit tier for vitals endpoints; bypass for emergency roles |
| Redis unavailability | Cache misses, increased DB load | Fail-open strategy; connection pool fallback; circuit breaker pattern |
| Pagination inconsistency | Duplicate/missing records | Cursor-based pagination; immutable sort keys; snapshot isolation |
| Bundle size growth | Slow initial load on mobile | Code splitting; tree shaking; bundle size CI gates (<200KB initial) |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Compression CPU overhead | Slight latency increase | `compresslevel=6` balance; skip compression for <1KB responses |
| Virtualization accessibility | Screen reader compatibility | `aria-rowindex` attributes; focus management; semantic table structure |
| Connection pool exhaustion | Request queuing | `pool_timeout=30s`; queue depth monitoring; auto-scaling triggers |

---

## Appendix: Performance Testing Checklist

```markdown
- [ ] Verify N+1 query prevention: `pytest` with query count assertions
- [ ] Load test: 500 concurrent users for 15 minutes
- [ ] Vitals latency test: measure end-to-end MQTT→WebSocket delivery
- [ ] Memory profile: 100MB DICOM upload without memory spike
- [ ] React render audit: no component re-renders >10x per interaction
- [ ] Cache hit rate: >80% for patient summary endpoints
- [ ] Database slow query log: zero queries >200ms
- [ ] Bundle analysis: initial JS <200KB, lazy chunks <500KB each
- [ ] Accessibility: virtualized lists work with keyboard navigation
- [ ] HIPAA audit: all cache hits and invalidations logged
```

---

*Document Version: 1.0*
*Last Updated: 2025-06-30*
*Classification: Internal - DeepSynaps Protocol Studio*
