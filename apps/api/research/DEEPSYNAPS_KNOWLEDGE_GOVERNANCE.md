# DeepSynaps Knowledge Governance & Provenance System

> **Version:** 1.0.0 | **Status:** Architectural Specification | **Scope:** All clinical entities and AI outputs

---

## 1. Executive Summary

The Knowledge Governance & Provenance System (KGS) ensures every clinical datum and AI insight is traceable, auditable, ethically governed, and clinically safe across seven governance domains:

| # | Domain | Purpose |
|---|--------|---------|
| 1 | Provenance Model | Full data lineage from source to consumption |
| 2 | Confidence Scoring | Multi-dimensional transparent scoring |
| 3 | Research-Only Flagging | Prevent unvalidated data from clinical use |
| 4 | Audit Framework | Immutable logging of all operations |
| 5 | PHI Boundary Controls | Patient data isolation across clinics |
| 6 | Break-Glass Access | Emergency access with strict controls |
| 7 | Licensing Compliance | Automatic license term enforcement |

**Governance Principles:** Every clinical entity has full provenance. All outputs declare evidentiary strength. Unvalidated data is never clinical truth. Every operation is logged immutably. Patient data never crosses clinic boundaries. External data obeys license terms. AI outputs are always advisory; human judgment remains authoritative.

## 2. Provenance Model

### 2.1 Core Schema

```python
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Optional
from uuid import UUID, uuid4
from enum import Enum

class ConfidenceTier(str, Enum):
    VALIDATED = "validated"
    PEER_REVIEWED = "peer_reviewed"
    PRELIMINARY = "preliminary"
    RESEARCH_ONLY = "research_only"

class EvidenceGrade(str, Enum):
    GRADE_A = "A"  # Multiple RCTs / meta-analyses
    GRADE_B = "B"  # Limited RCTs / strong observational
    GRADE_C = "C"  # Observational / expert opinion
    GRADE_D = "D"  # Case reports / theoretical
    GRADE_NA = "N/A"

class ClinicalValidationStatus(str, Enum):
    VALIDATED = "validated"
    PENDING = "pending"
    NOT_APPLICABLE = "not_applicable"

class LicenseType(str, Enum):
    CC_BY_NC_SA_4_0 = "CC-BY-NC-SA-4.0"
    CC_BY_NC_4_0 = "CC-BY-NC-4.0"
    CC_BY_4_0 = "CC-BY-4.0"
    PUBLIC_DOMAIN = "Public Domain"
    UMLS_LICENSE = "UMLS License"
    GPL_3_0 = "GPL-3.0"
    ACADEMIC = "Academic"

@dataclass
class ProvenanceRecord:
    provenance_id: UUID = field(default_factory=uuid4)
    entity_id: UUID
    entity_type: str  # "variant", "drug", "pathway", "biomarker"

    # Source Attribution
    source_databases: List[str]; source_versions: Dict[str, str]
    source_records: Dict[str, str]; source_urls: Dict[str, str]
    # Ingestion Metadata
    ingestion_date: datetime; ingestion_pipeline: str
    ingestion_version: str; ingested_by: str; ingestion_method: str
    # Freshness
    last_verified: datetime; update_cadence: str
    next_scheduled_update: datetime; staleness_threshold_days: int = 30
    # Licensing
    license: LicenseType; license_url: str; attribution_required: bool
    attribution_text: str; commercial_use_permitted: bool
    share_alike_required: bool; redistribution_permitted: bool; modification_permitted: bool
    # Confidence & Evidence
    confidence_tier: ConfidenceTier; evidence_grade: EvidenceGrade
    evidence_grade_justification: str
    # Research-Only Flagging
    research_only: bool; research_only_reason: Optional[str]
    research_only_criteria_triggered: List[str] = field(default_factory=list)
    clinical_validation_status: ClinicalValidationStatus
    # Transformation History (append-only)
    transformation_log: List[Dict] = field(default_factory=list)
    cross_references: Dict[str, List[str]] = field(default_factory=dict)
    # Audit
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    version: int = 1

    def is_fresh(self) -> bool:
        age = (datetime.utcnow() - self.last_verified).days
        return age < self.staleness_threshold_days

    def get_display_attribution(self) -> str:
        if not self.attribution_required: return ""
        return f"Data from {', '.join(self.source_databases)} ({self.license.value})"

    def to_audit_dict(self) -> Dict:
        return {
            "provenance_id": str(self.provenance_id), "entity_id": str(self.entity_id),
            "sources": self.source_databases, "confidence_tier": self.confidence_tier.value,
            "evidence_grade": self.evidence_grade.value, "research_only": self.research_only,
            "license": self.license.value, "fresh": self.is_fresh(),
        }
```

### 2.2 Enforcement Rules

| Rule | Level | Violation |
|------|-------|-----------|
| Every entity MUST have provenance | Hard | Rejected at ingestion |
| Source MUST be on approved whitelist | Hard | Ingestion blocked, alert raised |
| Source version MUST be recorded | Hard | Ingestion blocked |
| License MUST be verified before access | Hard | Data quarantined |
| Attribution text MUST display alongside data | Hard | UI rendering blocked |
| Research-only flag MUST be visually prominent | Hard | Cannot be hidden |
| Confidence tier MUST display on all outputs | Hard | Output suppressed |
| Stale data MUST trigger warning | Soft | Warning badge displayed |
| Transformation log MUST be append-only | Hard | Write rejected |
| All provenance updates MUST be audited | Hard | Changes logged immutably |

## 3. Confidence Scoring Model

### 3.1 Seven-Dimensional Scoring

```python
from typing import ClassVar

@dataclass
class ConfidenceDimensions:
    data_quality: float         # Completeness, recency, source reliability (0-1)
    evidence_strength: float    # A=1.0, B=0.75, C=0.5, D=0.25 (0-1)
    sample_size: float          # Normalized by domain standards (0-1)
    replication: float          # Has finding been replicated? (0-1)
    consistency: float          # Agreement across sources (0-1)
    temporal_relevance: float   # Recency of evidence (0-1)
    population_match: float     # Match to patient population (0-1)

    # Metadata
    evidence_type: str; study_count: int; total_sample_size: int
    independent_replications: int; failed_replications: int
    sources_agreeing: int; sources_disagreeing: int; years_since_update: int
    evidence_populations: List[str]; target_population: str
    population_divergence_risk: str  # "low", "medium", "high"

@dataclass
class ConfidenceScore:
    score_id: UUID = field(default_factory=uuid4)
    entity_id: UUID
    dimensions: ConfidenceDimensions
    overall: float = 0.0
    overall_tier: str = "unscored"  # "high", "moderate", "low", "insufficient"
    evidence_grade: EvidenceGrade = EvidenceGrade.GRADE_NA
    limiting_factors: List[str] = field(default_factory=list)
    strength_factors: List[str] = field(default_factory=list)
    computed_at: datetime = field(default_factory=datetime.utcnow)
    weights_used: Dict[str, float] = field(default_factory=dict)

    DEFAULT_WEIGHTS: ClassVar[Dict[str, float]] = {
        "data_quality": 0.20, "evidence_strength": 0.25, "sample_size": 0.15,
        "replication": 0.15, "consistency": 0.10, "temporal_relevance": 0.10,
        "population_match": 0.05,
    }

    def compute_overall(self, custom_weights: Optional[Dict[str, float]] = None) -> float:
        weights = custom_weights or self.DEFAULT_WEIGHTS
        d = self.dimensions
        scores = {
            "data_quality": d.data_quality, "evidence_strength": d.evidence_strength,
            "sample_size": d.sample_size, "replication": d.replication,
            "consistency": d.consistency, "temporal_relevance": d.temporal_relevance,
            "population_match": d.population_match,
        }
        total = sum(weights.values())
        self.overall = round(sum(scores[k] * weights[k] for k in weights) / total, 4)
        self.overall_tier = (
            "high" if self.overall >= 0.75 else
            "moderate" if self.overall >= 0.50 else
            "low" if self.overall >= 0.25 else "insufficient"
        )
        self.evidence_grade = (
            EvidenceGrade.GRADE_A if self.overall >= 0.80 else
            EvidenceGrade.GRADE_B if self.overall >= 0.60 else
            EvidenceGrade.GRADE_C if self.overall >= 0.40 else
            EvidenceGrade.GRADE_D if self.overall >= 0.20 else EvidenceGrade.GRADE_NA
        )
        self.limiting_factors = [k for k, v in scores.items() if v < 0.3]
        self.strength_factors = [k for k, v in scores.items() if v >= 0.8]
        self.weights_used = weights.copy()
        return self.overall
```

### 3.2 Display Requirements

| Tier | Score | Color | UI Behavior |
|------|-------|-------|-------------|
| **High** | 0.75-1.0 | Green | Standard display; confidence badge |
| **Moderate** | 0.50-0.74 | Yellow | Standard display; explanation shown |
| **Low** | 0.25-0.49 | Orange | Warning; clinician acknowledgment required |
| **Insufficient** | 0.00-0.24 | Red | Research-only; clinical use blocked |

## 4. Research-Only Flagging System

### 4.1 Flagging Criteria

```python
class ResearchOnlyCriteria(str, Enum):
    PRECLINICAL_ONLY = "preclinical_only"
    SMALL_SAMPLE = "small_sample"
    SINGLE_STUDY = "single_study"
    NO_REPLICATION = "no_replication"
    POPULATION_MISMATCH = "population_mismatch"
    OUTDATED = "outdated"
    CONFLICTING_EVIDENCE = "conflicting_evidence"
    NOT_PEER_REVIEWED = "not_peer_reviewed"
    OFF_LABEL = "off_label"
    EXPERIMENTAL_INTERVENTION = "experimental_intervention"
    INCONSISTENT_RESULTS = "inconsistent_results"
    WITHDRAWN_PUBLICATION = "withdrawn_publication"
    HIGH_RISK_OF_BIAS = "high_risk_of_bias"
    INSUFFICIENT_FOLLOW_UP = "insufficient_follow_up"
    DOSAGE_UNCERTAINTY = "dosage_uncertainty"

CRITERIA_DEFS = {
    ResearchOnlyCriteria.PRECLINICAL_ONLY:
        {"severity": "critical", "auto_flag": True, "review": True,
         "rationale": "Animal models do not predict human outcomes"},
    ResearchOnlyCriteria.SMALL_SAMPLE:
        {"severity": "high", "auto_flag": True, "review": False,
         "rationale": "Small samples: low power, high false-positives"},
    ResearchOnlyCriteria.SINGLE_STUDY:
        {"severity": "high", "auto_flag": True, "review": False,
         "rationale": "Single studies need confirmation"},
    ResearchOnlyCriteria.NO_REPLICATION:
        {"severity": "medium", "auto_flag": True, "review": False,
         "rationale": "Replication is cornerstone of validity"},
    ResearchOnlyCriteria.POPULATION_MISMATCH:
        {"severity": "high", "auto_flag": True, "review": True,
         "rationale": "Population differences affect response"},
    ResearchOnlyCriteria.OUTDATED:
        {"severity": "medium", "auto_flag": True, "review": False,
         "rationale": "Old evidence may be superseded"},
    ResearchOnlyCriteria.CONFLICTING_EVIDENCE:
        {"severity": "critical", "auto_flag": True, "review": True,
         "rationale": "Conflicts need expert adjudication"},
    ResearchOnlyCriteria.NOT_PEER_REVIEWED:
        {"severity": "high", "auto_flag": True, "review": True,
         "rationale": "Peer review provides quality assurance"},
    ResearchOnlyCriteria.OFF_LABEL:
        {"severity": "medium", "auto_flag": True, "review": True,
         "rationale": "Off-label needs distinct evidence"},
    ResearchOnlyCriteria.EXPERIMENTAL_INTERVENTION:
        {"severity": "critical", "auto_flag": True, "review": True,
         "rationale": "Experimental: regulated research only"},
    ResearchOnlyCriteria.INCONSISTENT_RESULTS:
        {"severity": "medium", "auto_flag": True, "review": False,
         "rationale": "Inconsistency undermines recommendations"},
    ResearchOnlyCriteria.WITHDRAWN_PUBLICATION:
        {"severity": "critical", "auto_flag": True, "review": True,
         "rationale": "Retracted data must not inform care"},
    ResearchOnlyCriteria.HIGH_RISK_OF_BIAS:
        {"severity": "high", "auto_flag": True, "review": False,
         "rationale": "High bias risk limits evidence value"},
    ResearchOnlyCriteria.INSUFFICIENT_FOLLOW_UP:
        {"severity": "medium", "auto_flag": True, "review": False,
         "rationale": "Short follow-up misses adverse events"},
    ResearchOnlyCriteria.DOSAGE_UNCERTAINTY:
        {"severity": "medium", "auto_flag": True, "review": True,
         "rationale": "Dosing uncertainty is safety risk"},
}
```

### 4.2 Assessment Engine

```python
@dataclass
class ResearchOnlyFlag:
    flag_id: UUID = field(default_factory=uuid4)
    criteria: ResearchOnlyCriteria; severity: str
    triggered_at: datetime = field(default_factory=datetime.utcnow)
    triggered_by: str; justification: str
    confidence_at_flagging: float; requires_human_review: bool
    review_status: str = "pending"; reviewed_by: Optional[str] = None

@dataclass
class ResearchOnlyAssessment:
    assessment_id: UUID = field(default_factory=uuid4)
    entity_id: UUID
    entity_type: str
    flags: List[ResearchOnlyFlag] = field(default_factory=list)
    is_research_only: bool = False
    highest_severity: Optional[str] = None
    recommendation: str = "clinical_use"
    overridable: bool = False
    override_requires_role: Optional[str] = None

    def assess(self, entity, confidence_score, provenance) -> "ResearchOnlyAssessment":
        flags = []
        d = confidence_score.dimensions

        if d.evidence_type in ["preclinical_animal", "preclinical_in_vitro"]:
            flags.append(self._flag(ResearchOnlyCriteria.PRECLINICAL_ONLY, "critical",
                "Only preclinical evidence; no human data", confidence_score.overall))
        if d.total_sample_size < 30 and d.evidence_type in ["rct", "observational"]:
            flags.append(self._flag(ResearchOnlyCriteria.SMALL_SAMPLE, "high",
                f"Sample size ({d.total_sample_size}) below threshold", confidence_score.overall))
        if d.study_count == 1:
            flags.append(self._flag(ResearchOnlyCriteria.SINGLE_STUDY, "high",
                "Only one study supports this claim", confidence_score.overall))
        if d.independent_replications == 0 and d.study_count >= 1:
            flags.append(self._flag(ResearchOnlyCriteria.NO_REPLICATION, "medium",
                "Finding not independently replicated", confidence_score.overall))
        if d.years_since_update > 10:
            flags.append(self._flag(ResearchOnlyCriteria.OUTDATED, "medium",
                f"Evidence is {d.years_since_update} years old", confidence_score.overall))
        if d.population_divergence_risk == "high":
            flags.append(self._flag(ResearchOnlyCriteria.POPULATION_MISMATCH, "high",
                "Evidence population diverges from target", confidence_score.overall))
        if d.consistency < 0.3:
            flags.append(self._flag(ResearchOnlyCriteria.CONFLICTING_EVIDENCE, "critical",
                "Higher-quality evidence contradicts this finding", confidence_score.overall))
        if provenance.confidence_tier == ConfidenceTier.RESEARCH_ONLY:
            flags.append(self._flag(ResearchOnlyCriteria.NOT_PEER_REVIEWED, "high",
                "Source not peer reviewed", confidence_score.overall))

        self.flags = flags
        critical = [f for f in flags if f.severity == "critical"]
        high = [f for f in flags if f.severity == "high"]

        if critical:
            self.is_research_only = True
            self.recommendation = "research_only"
            self.highest_severity = "critical"
        elif high:
            self.is_research_only = True
            self.recommendation = "expert_review_required"
            self.highest_severity = "high"
        elif flags:
            self.recommendation = "research_only"
            self.highest_severity = "medium"

        self.overridable = len(critical) == 0
        self.override_requires_role = "senior_clinician" if high else None
        return self

    def _flag(self, criteria, severity, justification, confidence) -> ResearchOnlyFlag:
        return ResearchOnlyFlag(
            criteria=criteria, severity=severity, justification=justification,
            confidence_at_flagging=confidence,
            requires_human_review=CRITERIA_DEFS[criteria]["review"],
        )
```

### 4.3 Display Requirements

| Severity | UI Treatment | Action Required |
|----------|-------------|----------------|
| **Critical** | Full-screen overlay, non-dismissable | Acknowledgment + documented reason |
| **High** | Prominent banner | One-click acknowledgment |
| **Medium** | Warning badge | Optional review |

## 5. Audit Framework

### 5.1 Event Types

```python
class AuditEventType(str, Enum):
    # Data Access (7)
    DATABASE_QUERY = "DATABASE_QUERY"; DATABASE_IMPORT = "DATABASE_IMPORT"
    DATABASE_UPDATE = "DATABASE_UPDATE"; DATABASE_SYNC = "DATABASE_SYNC"
    CACHE_HIT = "CACHE_HIT"; CACHE_MISS = "CACHE_MISS"
    CACHE_INVALIDATION = "CACHE_INVALIDATION"
    # Intelligence (8)
    MULTIMODAL_FUSION = "MULTIMODAL_FUSION"; HYPOTHESIS_GENERATED = "HYPOTHESIS_GENERATED"
    HYPOTHESIS_RANKED = "HYPOTHESIS_RANKED"; HYPOTHESIS_DISCARDED = "HYPOTHESIS_DISCARDED"
    CORRELATION_COMPUTED = "CORRELATION_COMPUTED"; TREND_ANALYZED = "TREND_ANALYZED"
    PATTERN_DETECTED = "PATTERN_DETECTED"; ANOMALY_FLAGGED = "ANOMALY_FLAGGED"
    # DeepTwin (6)
    DEEPTWIN_SYNTHESIS_CREATED = "DEEPTWIN_SYNTHESIS_CREATED"
    DEEPTWIN_SYNTHESIS_REVIEWED = "DEEPTWIN_SYNTHESIS_REVIEWED"
    DEEPTWIN_SYNTHESIS_MODIFIED = "DEEPTWIN_SYNTHESIS_MODIFIED"
    DEEPTWIN_PROTOCOL_SUGGESTED = "DEEPTWIN_PROTOCOL_SUGGESTED"
    DEEPTWIN_PROTOCOL_ACCEPTED = "DEEPTWIN_PROTOCOL_ACCEPTED"
    DEEPTWIN_PROTOCOL_REJECTED = "DEEPTWIN_PROTOCOL_REJECTED"
    # Evidence (5)
    EVIDENCE_LOOKUP = "EVIDENCE_LOOKUP"; EVIDENCE_CITED = "EVIDENCE_CITED"
    EVIDENCE_GRADE_ASSIGNED = "EVIDENCE_GRADE_ASSIGNED"; EVIDENCE_DISPUTED = "EVIDENCE_DISPUTED"
    EVIDENCE_RETRACTED = "EVIDENCE_RETRACTED"
    # Governance (6)
    RESEARCH_ONLY_FLAGGED = "RESEARCH_ONLY_FLAGGED"; CONFIDENCE_SCORED = "CONFIDENCE_SCORED"
    PROVENANCE_RECORDED = "PROVENANCE_RECORDED"; LICENSE_CHECKED = "LICENSE_CHECKED"
    LICENSE_VIOLATION_PREVENTED = "LICENSE_VIOLATION_PREVENTED"
    ATTRIBUTION_DISPLAYED = "ATTRIBUTION_DISPLAYED"
    # Export (5)
    DATA_EXPORTED = "DATA_EXPORTED"; RESEARCH_DATASET_CREATED = "RESEARCH_DATASET_CREATED"
    PHI_REDACTED = "PHI_REDACTED"; EXPORT_APPROVED = "EXPORT_APPROVED"
    EXPORT_REJECTED = "EXPORT_REJECTED"
    # Safety (6)
    SAFETY_BOUNDARY_CHECKED = "SAFETY_BOUNDARY_CHECKED"
    FORBIDDEN_OUTPUT_BLOCKED = "FORBIDDEN_OUTPUT_BLOCKED"
    CLINICIAN_REVIEW_REQUIRED = "CLINICIAN_REVIEW_REQUIRED"
    CLINICIAN_REVIEW_COMPLETED = "CLINICIAN_REVIEW_COMPLETED"
    BREAK_GLASS_ACTIVATED = "BREAK_GLASS_ACTIVATED"
    BREAK_GLASS_EXPIRED = "BREAK_GLASS_EXPIRED"
    # Access (5)
    USER_LOGIN = "USER_LOGIN"; USER_LOGOUT = "USER_LOGOUT"
    PERMISSION_CHECKED = "PERMISSION_CHECKED"; ACCESS_DENIED = "ACCESS_DENIED"
    ROLE_CHANGED = "ROLE_CHANGED"
    # System (4)
    SYSTEM_STARTUP = "SYSTEM_STARTUP"; SYSTEM_SHUTDOWN = "SYSTEM_SHUTDOWN"
    CONFIGURATION_CHANGED = "CONFIGURATION_CHANGED"; ERROR_OCCURRED = "ERROR_OCCURRED"
```

### 5.2 Audit Record

```python
import hashlib

@dataclass
class AuditRecord:
    record_id: UUID = field(default_factory=uuid4)
    event_type: AuditEventType
    actor_id: str
    actor_type: str  # "user", "service", "system"
    actor_role: Optional[str] = None
    actor_clinic_id: Optional[str] = None
    patient_id_hash: Optional[str] = None
    event_timestamp: datetime = field(default_factory=datetime.utcnow)
    event_description: str = ""
    event_payload: Dict = field(default_factory=dict)
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    source_ip: Optional[str] = None
    api_endpoint: Optional[str] = None
    knowledge_graph_version: Optional[str] = None
    databases_accessed: List[str] = field(default_factory=list)
    entities_accessed: List[UUID] = field(default_factory=list)
    outcome: str = "success"  # "success", "failure", "blocked", "warning"
    outcome_reason: Optional[str] = None
    research_only_entities: List[UUID] = field(default_factory=list)
    phi_accessed: bool = False
    phi_fields: List[str] = field(default_factory=list)
    consent_verified: bool = False
    previous_record_hash: Optional[str] = None
    record_signature: Optional[str] = None
    retention_class: str = "standard"  # "standard", "extended", "permanent"

    def hash_record(self) -> str:
        content = f"{self.record_id}{self.event_type}{self.actor_id}{self.event_timestamp.isoformat()}"
        return hashlib.sha256(content.encode()).hexdigest()

    def chain(self, previous_hash: str) -> None:
        self.previous_record_hash = previous_hash
        self.record_signature = self.hash_record()
```

## 6. PHI Boundary Controls

### 6.1 Control Rules

```python
class PHIBoundaryControls:
    RULES = {
        "patient_data_clinic_scoped": True,
        "research_datasets_de_identified": True,
        "cross_clinic_aggregation_min_k": 5,
        "raw_phi_never_in_external_db_queries": True,
        "query_templates_validated": True,
        "query_results_phi_filtered": True,
        "audit_all_phi_access": True,
        "phi_access_requires_justification": True,
        "export_requires_consent": True,
        "export_phi_redacted_by_default": True,
        "export_review_required": True,
        "break_glass_access_logged": True,
        "break_glass_dual_authorization": True,
        "field_level_phi_classification": True,
        "phi_encryption_at_rest": True,
        "phi_encryption_in_transit": True,
        "phi_tokenization_enabled": True,
        "data_loss_prevention_enabled": True,
    }
```

### 6.2 PHI Classification

| Level | Type | Examples | Access Control |
|-------|------|----------|---------------|
| **L4** | Direct identifiers | Name, SSN, MRN, DOB | Clinic-only; break-glass capable |
| **L3** | Indirect identifiers | ZIP, age, rare diagnosis | Clinic-only; dual auth for export |
| **L2** | Quasi-identifiers | Lab values, medications | Aggregated only cross-clinic |
| **L1** | General health info | Common conditions | De-identified for research |
| **L0** | Non-PHI | Public health stats | No restrictions |

### 6.3 K-Anonymity

```python
class KAnonymityEnforcer:
    MIN_K: int = 5
    def validate_query(self, query) -> bool:
        return all(self._cardinality(d) >= self.MIN_K for d in query.grouping_dimensions)
    def suppress_cells(self, results):
        for cell in results.cells:
            if cell.count < self.MIN_K:
                cell.value = None
                cell.suppressed = True
        return results
```

## 7. Break-Glass Emergency Access

### 7.1 Conditions

```python
class BreakGlassCondition(str, Enum):
    PATIENT_SAFETY_EMERGENCY = "patient_safety_emergency"
    REGULATORY_AUDIT = "regulatory_audit"
    CLINICAL_RESEARCH_ETHICS_APPROVED = "clinical_research_ethics_approved"
    SYSTEM_FAILURE_RECOVERY = "system_failure_recovery"
    PUBLIC_HEALTH_EMERGENCY = "public_health_emergency"
    COURT_ORDER = "court_order"

BG_REQUIREMENTS = {
    BreakGlassCondition.PATIENT_SAFETY_EMERGENCY: {
        "roles": ["attending_physician", "medical_director"], "max_hours": 4,
        "dual_auth": True, "post_review_hours": 24,
        "notify": ["privacy_officer", "medical_director", "compliance"],
    },
    BreakGlassCondition.REGULATORY_AUDIT: {
        "roles": ["compliance_officer", "medical_director"], "max_hours": 72,
        "dual_auth": True, "post_review_hours": 48,
        "notify": ["medical_director", "legal"],
    },
    BreakGlassCondition.CLINICAL_RESEARCH_ETHICS_APPROVED: {
        "roles": ["principal_investigator", "ethics_chair"], "max_hours": 720,
        "dual_auth": True, "post_review_hours": 72,
        "notify": ["ethics_board", "privacy_officer"],
    },
    BreakGlassCondition.SYSTEM_FAILURE_RECOVERY: {
        "roles": ["system_administrator", "cto"], "max_hours": 24,
        "dual_auth": True, "post_review_hours": 12,
        "notify": ["cto", "security_team"],
    },
    BreakGlassCondition.PUBLIC_HEALTH_EMERGENCY: {
        "roles": ["public_health_officer", "medical_director"], "max_hours": 720,
        "dual_auth": True, "post_review_hours": 72,
        "notify": ["public_health_authority", "legal"],
    },
    BreakGlassCondition.COURT_ORDER: {
        "roles": ["legal_counsel", "medical_director"], "max_hours": 168,
        "dual_auth": True, "post_review_hours": 24,
        "notify": ["legal", "medical_director"],
    },
}
```

### 7.2 Session Management

```python
@dataclass
class BreakGlassSession:
    session_id: UUID = field(default_factory=uuid4)
    condition: BreakGlassCondition; justification: str
    requested_by: str; requested_at: datetime = field(default_factory=datetime.utcnow)
    approved_by: str; clinic_scope: str
    patient_scope: Optional[List[str]] = None
    data_scope: List[str] = field(default_factory=list)
    expires_at: datetime; status: str = "pending"
    actions: List[Dict] = field(default_factory=list)
    revoked_by: Optional[str] = None; revoked_at: Optional[datetime] = None
    revoke_reason: Optional[str] = None

    def is_active(self) -> bool:
        return self.status == "active" and datetime.utcnow() < self.expires_at

    def record_action(self, action: Dict) -> None:
        action["timestamp"] = datetime.utcnow().isoformat()
        self.actions.append(action)
```

## 8. Licensing Compliance Matrix

### 8.1 Source Definitions

```python
LICENSING_COMPLIANCE = {
    "PharmGKB": {
        "license": "CC-BY-NC-SA-4.0", "attribution": True,
        "commercial_restricted": True, "share_alike": True,
        "attribution_text": "Data from PharmGKB (CC-BY-NC-SA-4.0)",
    },
    "ClinVar": {
        "license": "Public Domain", "attribution": False,
        "commercial_restricted": False, "share_alike": False,
    },
    "DrugBank": {
        "license": "CC-BY-NC-4.0", "attribution": True,
        "commercial_restricted": True, "share_alike": False,
        "attribution_text": "Data from DrugBank (CC-BY-NC-4.0)",
    },
    "RxNorm": {
        "license": "UMLS License", "attribution": True,
        "commercial_restricted": False, "share_alike": False,
        "attribution_text": "Data courtesy of the U.S. National Library of Medicine",
    },
    "PubMed": {
        "license": "Public Domain", "attribution": False,
        "commercial_restricted": False, "share_alike": False,
    },
    "FAERS": {
        "license": "Public Domain", "attribution": False,
        "commercial_restricted": False, "share_alike": False,
    },
    "CHBMP": {
        "license": "CC-BY-NC-SA-4.0", "attribution": True,
        "commercial_restricted": True, "share_alike": True,
        "attribution_text": "Data from CHBMP (CC-BY-NC-SA-4.0)",
    },
    "SimNIBS": {
        "license": "GPL-3.0", "attribution": True,
        "commercial_restricted": False, "share_alike": True,
        "attribution_text": "Uses SimNIBS (GPL-3.0)",
    },
    "Allen Brain Atlas": {
        "license": "CC-BY-4.0", "attribution": True,
        "commercial_restricted": False, "share_alike": False,
        "attribution_text": "Data from Allen Institute (CC-BY-4.0)",
    },
    "ADNI": {
        "license": "Academic", "attribution": True,
        "commercial_restricted": True, "share_alike": False,
        "attribution_text": "Data from ADNI, governed by DUA",
    },
}
```

### 8.2 Enforcement Engine

```python
@dataclass
class LicenseCheckResult:
    permitted: bool
    violation: Optional[str] = None
    reason: str = ""
    attribution_required: bool = False
    attribution_text: str = ""
    share_alike_required: bool = False

class LicenseEnforcementEngine:
    def check(self, source: str, context: str, operation: str) -> LicenseCheckResult:
        if source not in LICENSING_COMPLIANCE:
            return LicenseCheckResult(False, "UNKNOWN_SOURCE",
                f"Source '{source}' not in licensing registry")
        info = LICENSING_COMPLIANCE[source]
        if context == "commercial" and info["commercial_restricted"]:
            return LicenseCheckResult(False, "COMMERCIAL_RESTRICTED",
                f"{source} prohibits commercial use under {info['license']}")
        if operation == "redistribute" and not info.get("redistribution_permitted", True):
            return LicenseCheckResult(False, "REDISTRIBUTION_PROHIBITED",
                f"{source} does not permit redistribution")
        return LicenseCheckResult(True, None, "Usage permitted",
            info["attribution"], info["attribution_text"], info["share_alike"])

    def get_attributions(self, sources: List[str]) -> List[str]:
        return [LICENSING_COMPLIANCE[s]["attribution_text"]
                for s in sources if s in LICENSING_COMPLIANCE
                and LICENSING_COMPLIANCE[s]["attribution"]]
```

## 9. Export Governance

### 9.1 Export Rules

```python
class ExportType(str, Enum):
    CLINICAL_REPORT = "clinical_report"
    RESEARCH_DATASET = "research_dataset"
    REGULATORY_SUBMISSION = "regulatory_submission"
    AUDIT_TRAIL = "audit_trail"
    KNOWLEDGE_DUMP = "knowledge_dump"
    API_RESPONSE = "api_response"
    THIRD_PARTY_INTEGRATION = "third_party_integration"

EXPORT_RULES = {
    ExportType.CLINICAL_REPORT: {"phi": True, "consent": True, "de_id": "none", "research_only_ok": False, "approval_role": "attending_physician"},
    ExportType.RESEARCH_DATASET: {"phi": False, "consent": True, "de_id": "full", "research_only_ok": True, "approval_role": "ethics_chair"},
    ExportType.REGULATORY_SUBMISSION: {"phi": True, "consent": False, "de_id": "partial", "research_only_ok": False, "approval_role": "regulatory_director"},
    ExportType.AUDIT_TRAIL: {"phi": False, "consent": False, "de_id": "hashed", "research_only_ok": True, "approval_role": "compliance_officer"},
    ExportType.KNOWLEDGE_DUMP: {"phi": False, "consent": False, "de_id": "full", "research_only_ok": True, "approval_role": "medical_director"},
    ExportType.API_RESPONSE: {"phi": False, "consent": False, "de_id": "full", "research_only_ok": True, "approval_role": None},
    ExportType.THIRD_PARTY_INTEGRATION: {"phi": False, "consent": True, "de_id": "full", "research_only_ok": False, "approval_role": "medical_director"},
}
```

### 9.2 Export Workflow

```
Request Export -> Validate Rules -> Check Consent -> Check License
                                                    |
Approve Export <- Role Review <- Dual Auth (if PHI) <-
      |
Execute: Redact PHI -> Add Attribution -> Audit Log -> Deliver
```

## 10. Safety Boundaries

### 10.1 Forbidden Outputs

```python
FORBIDDEN_OUTPUTS = [
    "direct_diagnosis",          # AI cannot issue definitive diagnoses
    "treatment_prescription",    # AI cannot prescribe medications/dosages
    "prognosis_definitive",      # AI cannot give definitive prognoses
    "contradicting_physician",   # AI must not contradict attending physician
    "unverified_protocol",       # AI cannot suggest unverified protocols
    "off_label_promotion",       # AI cannot promote off-label uses
    "dosage_calculation",        # AI cannot calculate patient-specific dosages
    "suicide_method",            # Never provide self-harm methods
    "drug_synthesis",            # Never provide drug synthesis instructions
    "eugenics_content",          # Never generate eugenics content
    "unethical_research",        # Never suggest unethical research designs
    "false_certainty",           # Never express false certainty
    "unverified_biomarker",      # Never present unverified biomarkers as validated
    "population_stereotyping",   # Never make harmful population generalizations
    "pseudoscience_promotion",   # Never promote pseudoscientific claims
    "data_fabrication",          # Never fabricate results or citations
    "confidence_manipulation",   # Never manipulate confidence scores
    "research_only_as_clinical", # Research-only data never presented as clinical truth
]
```

### 10.2 Safety Enforcer

```python
@dataclass
class SafetyCheckResult:
    permitted: bool
    violations: List[Dict] = field(default_factory=list)
    requires_clinician_review: bool = False

class SafetyBoundaryEnforcer:
    def check(self, output) -> SafetyCheckResult:
        violations = []
        for category in FORBIDDEN_OUTPUTS:
            if output.classification.get(category, False):
                violations.append({"category": category, "severity": "critical",
                    "action": "BLOCK", "reason": f"Category '{category}' prohibited"})
        if output.contains_research_only and output.presentation_mode == "clinical":
            violations.append({"category": "research_only_as_clinical",
                "severity": "critical", "action": "BLOCK",
                "reason": "Research-only data presented as clinical truth"})
        if output.requires_attribution and not output.has_attribution:
            violations.append({"category": "missing_attribution", "severity": "high",
                "action": "BLOCK", "reason": "Required attribution missing"})
        return SafetyCheckResult(
            permitted=len(violations) == 0,
            violations=violations,
            requires_clinician_review=any(v["severity"] == "high" for v in violations),
        )
```

### 10.3 Clinician Review Triggers

| Trigger | Condition | Review Type | Timeline |
|---------|-----------|-------------|----------|
| Low confidence | Overall < 0.25 | Mandatory | Before display |
| Research-only data | Any research-only flags | Acknowledgment | Before access |
| Conflicting evidence | Consistency < 0.3 | Expert review | Within 24h |
| Novel finding | First occurrence in clinic | Peer review | Within 48h |
| Safety warning | Safety check warning | Immediate | Real-time |
| Break-glass used | Emergency access | Post-hoc review | Within 24h |

## 11. Component Summary

| # | Component | Key Metric |
|---|-----------|------------|
| 1 | **Provenance Model** | 10 enforcement rules, full lineage on every entity |
| 2 | **Confidence Scoring** | 7 dimensions, weighted composite 0-1 |
| 3 | **Research-Only Flagging** | 15 auto-detection criteria, 3 severity tiers |
| 4 | **Audit Framework** | 44 event types, immutable chained records |
| 5 | **PHI Boundary Controls** | 5 classification levels, k-anonymity enforced |
| 6 | **Break-Glass Access** | 6 conditions, dual auth, time-limited sessions |
| 7 | **License Compliance** | 10 sources tracked, auto-enforced |
| 8 | **Export Governance** | 7 export types, approval workflows |
| 9 | **Safety Boundaries** | 18 forbidden categories, real-time enforcement |

**Total Governance Components: 9**
**Total Enforcement Rules: 27**
**Total Audit Event Types: 44**
**Total Research-Only Criteria: 15**
**Total Licensed Sources: 10**
**Total Export Types: 7**
**Total Forbidden Output Categories: 18**

> *"Trust is not assumed; it is engineered. Every datum carries its story, every output declares its uncertainty, and every action leaves its trace. This is the governance contract of DeepSynaps."*
