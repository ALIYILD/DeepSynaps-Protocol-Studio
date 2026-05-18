# SPEC.md — Phase 4 DeepTwin Patient Intelligence Layer

## 1. Architecture Overview

Phase 4 builds a governed, clinician-reviewed DeepTwin patient synthesis layer on top of Phase 3's 6 intelligence engines.

```
DeepSynaps-Protocol-Studio/
├── apps/api/src/deepsynaps/
│   ├── contracts.py              # UPDATED: +DeepTwinSnapshot, +ClinicianReview, +DeepTwinAuditEvent
│   ├── deeptwin_snapshot.py      # NEW: Patient Twin Snapshot generator
│   ├── deeptwin_review.py       # NEW: Clinician review workflow engine
│   ├── deeptwin_audit.py        # NEW: DeepTwin audit event logging
│   ├── deeptwin_export.py       # NEW: Export/handoff engine
│   └── main.py                   # UPDATED: +DeepTwin endpoints
├── apps/web/src/pages-deeptwin/
│   ├── DeepTwinPage.jsx          # NEW: Main DeepTwin page shell
│   ├── PatientOverview.jsx       # NEW: Patient twin overview panel
│   ├── ModalityCoverage.jsx      # NEW: Modality coverage + recency + quality
│   ├── CorrelationHighlights.jsx # NEW: Correlation review panel
│   ├── ConfounderPanel.jsx       # NEW: Confounder display
│   ├── RankedHypotheses.jsx      # NEW: Hypothesis display + ranking
│   ├── EvidencePanel.jsx         # NEW: Evidence links + grades
│   ├── ClinicianReview.jsx       # NEW: Review workspace (accept/reject/note)
│   ├── ReportHandoff.jsx         # NEW: Report/protocol handoff + export
│   └── ForecastPanel.jsx         # NEW: Honest forecast (or "unavailable")
├── apps/api/tests/
│   ├── test_deeptwin_snapshot.py # NEW
│   ├── test_deeptwin_review.py  # NEW
│   └── test_deeptwin_api.py     # NEW
└── docs/
    ├── PHASE4_CLINICAL_DIGITAL_TWIN_BENCHMARK.md
    ├── PHASE4_PATIENT_TIMELINE_UX.md
    ├── PHASE4_HYPOTHESIS_REASONING_DESIGN.md
    ├── PHASE4_EVIDENCE_GROUNDED_AI_DESIGN.md
    └── OPEN_SOURCE_PHASE4_DEEPTWIN_STACK.md
```

## 2. DeepTwin Canonical Contracts (extends contracts.py)

### DeepTwinSnapshot
```python
@dataclass
class DeepTwinSnapshot:
    snapshot_id: str
    patient_id: str
    generated_at: datetime
    modality_coverage: Dict[str, bool]
    recency_status: Dict[str, str]
    data_quality_flags: List[Dict[str, Any]]
    timeline_events: List[Dict[str, Any]]
    correlation_findings: List[Dict[str, Any]]
    confounders: List[Dict[str, Any]]
    ranked_hypotheses: List[Dict[str, Any]]
    evidence_links: List[Dict[str, Any]]
    uncertainty_drivers: List[str]
    forecast_status: str  # "available" | "unavailable: no calibrated model"
    clinician_review_status: Dict[str, Any]
    provenance: Dict[str, Any]
    safety_disclaimer: str
```

### ClinicianReview
```python
@dataclass
class ClinicianReview:
    review_id: str
    patient_id: str
    clinician_id: str
    snapshot_id: str
    hypothesis_id: str
    action: str  # accept | reject | note | request_data | report | protocol | export
    note: str
    requested_modalities: List[str]
    follow_up_tasks: List[str]
    reviewed_at: datetime
    audit_reference: str
```

### DeepTwinAuditEvent
```python
@dataclass
class DeepTwinAuditEvent:
    event_id: str
    patient_id: str
    clinician_id: str
    event_type: str  # deeptwin_opened | snapshot_generated | synthesis_requested | hypothesis_accepted | hypothesis_rejected | report_handoff | protocol_handoff | export_generated | review_completed
    snapshot_id: Optional[str]
    details: Dict[str, Any]
    timestamp: datetime
```

## 3. Core Module Contracts

### 3.1 DeepTwinSnapshotEngine (deeptwin_snapshot.py)
- **Method:** `generate_snapshot(patient_id, include_modalities=None, date_range=None) -> DeepTwinSnapshot`
- Orchestrates all 6 Phase 3 engines into a unified patient view
- Produces modality coverage map, recency map, data quality map
- Labels: "Decision support only. Requires clinician review."
- Forecast: only shows "available" if calibrated model exists, else "unavailable: no calibrated model"

### 3.2 DeepTwinReviewEngine (deeptwin_review.py)
- **Method:** `record_review(review: ClinicianReview) -> str`
- **Method:** `get_reviews_for_patient(patient_id) -> List[ClinicianReview]`
- **Method:** `get_reviews_for_snapshot(snapshot_id) -> List[ClinicianReview]`
- Actions: accept, reject, note, request_data, report, protocol, export
- Every action creates audit event

### 3.3 DeepTwinAuditLogger (deeptwin_audit.py)
- **Method:** `log_event(event: DeepTwinAuditEvent) -> str`
- Pre-defined event types: deeptwin_opened, snapshot_generated, synthesis_requested, hypothesis_accepted, hypothesis_rejected, report_handoff, protocol_handoff, export_generated, review_completed
- All events include patient_id, clinician_id, snapshot_id, timestamp

### 3.4 DeepTwinExportEngine (deeptwin_export.py)
- **Method:** `export_snapshot(snapshot_id, format="json") -> Dict[str, Any]`
- **Method:** `handoff_to_report(snapshot_id, clinician_id) -> str`
- **Method:** `handoff_to_protocol(snapshot_id, clinician_id) -> str`
- Creates audit events for each handoff

## 4. API Endpoints (additions to main.py)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/deeptwin/patients/{pid}/snapshot` | clinician + patient | DeepTwin patient snapshot |
| GET | `/api/v1/deeptwin/patients/{pid}/timeline` | clinician + patient | DeepTwin timeline view |
| GET | `/api/v1/deeptwin/patients/{pid}/hypotheses` | clinician + patient | Ranked hypotheses |
| POST | `/api/v1/deeptwin/patients/{pid}/synthesis` | clinician + ai_consent | Full DeepTwin synthesis |
| POST | `/api/v1/deeptwin/patients/{pid}/review` | clinician + patient | Clinician review action |
| POST | `/api/v1/deeptwin/patients/{pid}/export` | clinician + patient | Export snapshot/handoff |

All endpoints enforce: clinician role, patient access, clinic isolation, ai_consent for synthesis, audit logging.

## 5. Frontend — DeepTwin Page Sections

### PatientOverview
- Patient identifier (de-identified)
- Snapshot timestamp
- Modality coverage summary (X/Y modalities active)
- Data quality summary (green/yellow/red)
- Last clinician review status
- Safety disclaimer banner (always visible)

### ModalityCoverage
- Grid showing each modality: present/missing
- Recency indicator: fresh/stale
- Data quality badge per modality
- Expand for detail view

### CorrelationHighlights
- Cards for each correlation finding
- Agreement vs divergence badges
- Pre/post intervention windows
- Safety label: "Temporal association only"

### ConfounderPanel
- Yellow warning cards
- Severity badges
- Impact estimates
- Mitigation suggestions

### RankedHypotheses
- Ranked list with confidence bars
- Evidence grade badges (A/B/C/D)
- Uncertainty drivers per hypothesis
- Accept/Reject/Note buttons (clinician only)
- Safety label: "Ranked hypothesis. Requires clinician review."

### EvidencePanel
- Evidence links per hypothesis
- Source citations
- Evidence grades
- Conflicting evidence indicators
- research-only flags

### ClinicianReview
- Review history for this patient
- Action buttons: Accept, Reject, Add Note, Request Data
- Text area for clinical notes
- Follow-up task creation
- Mark as reviewed

### ReportHandoff
- Export to PDF/JSON
- Send to Report module
- Send to Protocol Studio
- Audit log of handoffs

### ForecastPanel
- If calibrated model exists: show validated prediction with confidence intervals
- If no model: show "Forecast unavailable: no calibrated model"
- Never fake predictions

## 6. Safety / Governance

- Every insight: "Decision support only. Requires clinician review."
- Every correlation: "Temporal association only. Not causal proof."
- Every hypothesis: "Ranked hypothesis. Requires clinician review."
- Forecast: only if calibrated model exists
- Forbidden: "DeepTwin diagnosed", "DeepTwin recommends treatment", "DeepTwin proves cause", "DeepTwin predicts outcome" (unless validated)
- clinician_review_required = True (always)
- confidence < 0.95 (always)

## 7. Test Requirements

- test_deeptwin_snapshot.py: snapshot generation, modality coverage, hypothesis provenance, correlation labels, no causal overclaiming, missing data flags, forecast status
- test_deeptwin_review.py: clinician review actions, accept/reject/note, request data, report handoff, protocol handoff, audit events
- test_deeptwin_api.py: all 6 endpoints, access control, safety disclaimers, response structure
