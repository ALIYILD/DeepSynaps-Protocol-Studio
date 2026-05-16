# SPEC.md — DeepSynaps Protocol Studio: Phase 3 Multimodal Intelligence Engine

## 1. Architecture Overview

```
DeepSynaps-Protocol-Studio/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── deepsynaps/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── contracts.py          # Canonical dataclasses
│   │   │   │   ├── knowledge_layer.py     # Phase 0-2 DB layer
│   │   │   │   ├── timeline_engine.py     # Module 1
│   │   │   │   ├── correlation_engine.py  # Module 2
│   │   │   │   ├── confound_engine.py     # Module 3
│   │   │   │   ├── evidence_engine.py     # Module 4
│   │   │   │   ├── hypothesis_engine.py   # Module 5
│   │   │   │   ├── missing_data_engine.py # Module 6
│   │   │   │   ├── synthesis_service.py   # POST synthesis orchestrator
│   │   │   │   ├── safety_governance.py   # All safety checks
│   │   │   │   ├── access_control.py      # RBAC, clinic isolation
│   │   │   │   ├── audit_logger.py        # Audit logging
│   │   │   │   └── main.py               # FastAPI app
│   │   ├── tests/
│   │   │   ├── test_contracts.py
│   │   │   ├── test_timeline_engine.py
│   │   │   ├── test_correlation_engine.py
│   │   │   ├── test_confound_engine.py
│   │   │   ├── test_evidence_engine.py
│   │   │   ├── test_hypothesis_engine.py
│   │   │   ├── test_missing_data_engine.py
│   │   │   ├── test_safety_governance.py
│   │   │   ├── test_access_control.py
│   │   │   └── test_api_endpoints.py
│   │   └── requirements.txt
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   │   └── multimodal/
│       │   │       ├── TimelineView.jsx
│       │   │       ├── CorrelationCard.jsx
│       │   │       ├── ConfounderCard.jsx
│       │   │       ├── DataQualityFlags.jsx
│       │   │       └── InsightCard.jsx
│       │   ├── pages-deeptwin/
│       │   │   └── SynthesisDashboard.jsx
│       │   ├── api.js
│       │   └── contracts.js
│       └── tests/
│           ├── multimodal.test.js
│           └── deeptwin.test.js
├── docs/
│   ├── PHASE3_MULTIMODAL_FUSION_DESIGN.md
│   ├── PHASE3_CORRELATION_ENGINE_DESIGN.md
│   ├── PHASE3_CONFOUND_ENGINE_DESIGN.md
│   ├── PHASE3_EVIDENCE_REASONING_DESIGN.md
│   └── OPEN_SOURCE_PHASE3_MULTIMODAL_INTELLIGENCE_STACK.md
├── DEEPSYNAPS_PHASE3_MULTIMODAL_INTELLIGENCE_REPORT.md
└── README.md
```

## 2. Canonical Data Contracts (Python)

All in `apps/api/src/deepsynaps/contracts.py`.

### MultimodalEvent
```python
@dataclass
class MultimodalEvent:
    event_id: str
    patient_id: str
    event_type: str  # assessment, qeeg, mri, biomarker, medication, ...
    modality: str
    source_system: str
    source_record_id: str
    timestamp: datetime
    value_summary: str
    numeric_features: Dict[str, float]
    textual_summary: str
    confidence: float  # 0.0 - 1.0
    data_quality: str  # high, medium, low, missing
    provenance: Dict[str, Any]
    evidence_links: List[str]
    audit_reference: str
```

### IntelligenceOutput
```python
@dataclass
class IntelligenceOutput:
    insight_id: str
    patient_id: str
    insight_type: str  # timeline, correlation, confound, hypothesis, quality_flag
    modalities_involved: List[str]
    timeline_window: Tuple[datetime, datetime]
    summary: str
    supporting_events: List[str]  # event_ids
    conflicting_events: List[str]  # event_ids
    confounders: List[Dict[str, Any]]
    evidence_links: List[Dict[str, Any]]
    confidence: float
    uncertainty_drivers: List[str]
    research_only: bool
    clinician_review_required: bool
    safety_labels: List[str]
```

### EvidenceLink
```python
@dataclass
class EvidenceLink:
    evidence_id: str
    source_type: str  # internal_db, external_db, literature
    citation: str
    evidence_grade: str  # A, B, C, D per GRADE
    confidence: float
    research_only: bool
    conflicting: bool
    url: Optional[str] = None
```

## 3. Module Contracts

### 3.1 MultimodalTimelineEngine
- **Input**: `patient_id`, optional `modality_filter`, optional `date_range`
- **Output**: `List[MultimodalEvent]` ordered by timestamp
- **Method**: `build_timeline(patient_id, **filters) -> List[MultimodalEvent]`

### 3.2 CorrelationEngine
- **Input**: `patient_id`, `window_days` (default 30), `min_confidence` (default 0.5)
- **Output**: `List[IntelligenceOutput]` with insight_type="correlation"
- **Method**: `find_correlations(patient_id, **params) -> List[IntelligenceOutput]`
- **Rules**: Must label all outputs with "Temporal association only. Not causal proof."

### 3.3 ConfoundEngine
- **Input**: `patient_id`, `context_events: List[MultimodalEvent]`
- **Output**: `List[IntelligenceOutput]` with insight_type="confound"
- **Method**: `detect_confounders(patient_id, context_events) -> List[IntelligenceOutput]`

### 3.4 EvidenceLinkingEngine
- **Input**: `insights: List[IntelligenceOutput]`
- **Output**: Same list with `evidence_links` populated
- **Method**: `attach_evidence(insights) -> List[IntelligenceOutput]`

### 3.5 HypothesisRankingEngine
- **Input**: `patient_id`, `observation_event: MultimodalEvent`
- **Output**: `List[IntelligenceOutput]` with insight_type="hypothesis", ranked by score
- **Method**: `rank_hypotheses(patient_id, observation_event) -> List[IntelligenceOutput]`

### 3.6 MissingDataEngine
- **Input**: `patient_id`, `expected_modalities: List[str]`
- **Output**: `List[IntelligenceOutput]` with insight_type="quality_flag"
- **Method**: `detect_gaps(patient_id, expected_modalities) -> List[IntelligenceOutput]`

## 4. API Contract

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/multimodal/patients/{patient_id}/timeline` | clinician + patient_access | Full multimodal timeline |
| GET | `/api/v1/multimodal/patients/{patient_id}/correlations` | clinician + patient_access | Correlation findings |
| GET | `/api/v1/multimodal/patients/{patient_id}/confounders` | clinician + patient_access | Confounder candidates |
| GET | `/api/v1/multimodal/patients/{patient_id}/quality-flags` | clinician + patient_access | Missing/stale data flags |
| POST | `/api/v1/multimodal/patients/{patient_id}/synthesis` | clinician + ai_consent | Full synthesis across all modules |

### Auth Requirements (all endpoints)
- Header: `X-Clinic-ID` (clinic isolation)
- Header: `X-Patient-Access-Token` (patient access)
- Role: `clinician` in JWT
- For POST /synthesis: additional `ai_analysis` consent required
- All requests logged to audit trail

## 5. Safety / Governance Rules (ALL must be enforced)

1. Every output MUST include `safety_labels` list
2. Every correlation MUST include "Temporal association only. Not causal proof."
3. Every hypothesis MUST include "Ranked clinical hypothesis. Requires clinician review."
4. `clinician_review_required` MUST be True for ALL insights
5. NEVER include causal certainty language
6. NEVER include autonomous treatment advice
7. `research_only` flag set based on evidence grade (C/D = True)
8. Confidence must be < 0.95 for any clinical interpretation
9. Uncertainty drivers must ALWAYS be populated

## 6. Frontend Components

### TimelineView
- Vertical timeline with modality color-coding
- Expandable event cards showing provenance, confidence, evidence links
- Filter by modality, date range, data quality

### CorrelationCard
- Shows temporal association pairs
- Confidence badge
- Safety label badge
- Supporting/conflicting event links

### ConfounderCard
- Yellow warning styling
- Lists potential confounders with evidence
- Impact severity indicator

### DataQualityFlags
- Red/orange/green severity badges
- Lists missing/stale items
- Actionable suggestions

### InsightCard
- Generic card for any intelligence output
- Always shows "Requires clinician review" banner
- Evidence grade badge
- Confidence with uncertainty drivers

## 7. Test Requirements

- `test_contracts.py`: Validate canonical contract serialization
- `test_timeline_engine.py`: Timeline ordering, filtering, edge cases
- `test_correlation_engine.py`: Window logic, confidence thresholds
- `test_confound_engine.py`: Confound detection for each category
- `test_evidence_engine.py`: Evidence link attachment, grading
- `test_hypothesis_engine.py`: Ranking logic, label enforcement
- `test_missing_data_engine.py`: Gap detection, staleness
- `test_safety_governance.py`: Verify no causal overclaiming, all labels present
- `test_access_control.py`: Clinic isolation, role checks, consent checks
- `test_api_endpoints.py`: Full endpoint integration tests

## 8. Technology Stack

- **Backend**: Python 3.11+, FastAPI, Pydantic, pytest, httpx
- **Frontend**: React 18+, Vite, Tailwind CSS (if available)
- **Data**: In-memory SQLite for demo, PostgreSQL support via env
- **Auth**: JWT with role claims, clinic_id isolation
