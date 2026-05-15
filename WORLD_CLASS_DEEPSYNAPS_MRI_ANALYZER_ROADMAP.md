# World-Class DeepSynaps MRI Analyzer: Strategic Roadmap 2026

## Executive Summary

The DeepSynaps MRI Analyzer is a clinical-grade neuroimaging decision-support platform that bridges the gap between raw MRI data and actionable neuromodulation treatment planning. This roadmap charts a **16-week, 4-phase journey** to elevate the platform from its current beta state to a world-class clinical tool that rivals the best commercial neuroimaging platforms while maintaining the openness, safety, and governance rigor that defines the DeepSynaps protocol.

### Strategic Pillars

| Pillar | Description | Target Outcome |
|--------|-------------|----------------|
| **Safety First** | Clinical governance, audit trails, role-based access, export controls | FDA 510(k)-ready safety framework |
| **Viewer Excellence** | Multi-planar reconstruction, interactive overlays, annotations, e-field visualization | Parity with Freeview + Papaya + NiiVue combined |
| **Neuroimaging Intelligence** | Biomarker panels, atlas targeting, AI analysis, evidence links | Clinical decision-support at the standard of BrainVue/Neurolytic |
| **Advanced Integration** | Multimodal wiring, report generation, compliance dashboard | Full clinical workflow integration |

### Investment Summary

| Phase | Weeks | Engineering Focus | Deliverables |
|-------|-------|-------------------|--------------|
| Phase 1 | W1-4 | Bug Fixes + Safety Foundation | 4 critical bugs, safety cockpit, audit trail, role gates |
| Phase 2 | W5-8 | Professional Viewer | NiiVue integration, MPR, overlays, annotations |
| Phase 3 | W9-12 | Neuroimaging Intelligence | Biomarker panel, atlas targeting, AI analysis |
| Phase 4 | W13-16 | Advanced Integration | Multimodal wiring, report generator, compliance dashboard |

---

## Section 2: Four Critical Bugs Fixed (Pre-Flight)

Before the 16-week roadmap begins, four critical bugs must be resolved. These bugs represent foundational gaps that undermine clinical trust and regulatory readiness.

### Bug 1: Report Payload Schema Version Missing

**File:** `apps/api/app/routers/mri_analysis_router.py`
**Location:** `_report_from_row()` function
**Severity:** HIGH
**Impact:** Downstream consumers cannot determine payload format compatibility, causing deserialization failures in fusion workbench and external integrations.

**Root Cause:** The `MRI_REPORT_SCHEMA_VERSION` constant (defined as `"0.4.0"` in the schema module) was never injected into the report payload. When `_report_from_row()` hydrates the report dict from database JSON columns, it omits the `schema_version` field entirely.

**Fix Applied:**
```python
def _report_from_row(row: MriAnalysis) -> dict[str, Any]:
    report = {
        "schema_version": MRI_REPORT_SCHEMA_VERSION,  # Added
        "analysis_id": row.analysis_id,
        "patient": _patient_block_from_row(row),
        # ... remainder of payload
    }
    return report
```

**Verification:** Check that `GET /api/v1/mri/report/{analysis_id}` returns `"schema_version": "0.4.0"` in the root object.

### Bug 2: Export Governance Bypass

**File:** `apps/api/app/routers/mri_analysis_router.py`
**Location:** `export_mri_bids_package()` and `export_mri_package()` endpoints
**Severity:** CRITICAL
**Impact:** Unapproved, unsigned reports could be exported as clinical packages, creating serious liability exposure.

**Root Cause:** The `_verify_export_governance()` function existed in the codebase but was never called by the two export endpoints. The `can_export()` function in `mri_clinician_review.py` correctly implements the governance logic (requires `MRI_APPROVED` or `MRI_REVIEWED_WITH_AMENDMENTS` state + signed_by + signed_at), but the router endpoints bypassed it entirely.

**Fix Applied:**
```python
@router.post("/{analysis_id}/export-bids")
def export_mri_bids_package(...) -> StreamingResponse:
    # ... validation ...
    _gate_patient_access(actor, analysis.patient_id, db)
    _verify_export_governance(analysis)  # Added — was missing!
    # ... build and return package ...

@router.post("/{analysis_id}/export")
def export_mri_package(...) -> StreamingResponse:
    # ... validation ...
    _gate_patient_access(actor, analysis.patient_id, db)
    _verify_export_governance(analysis)  # Added — was missing!
    # ... build and return package ...
```

**Verification:** Attempting to export a report in `MRI_DRAFT_AI` state returns HTTP 403 with code `"export_not_approved"`.

### Bug 3: Workbench Sections Backend Disconnect

**File:** `apps/web/src/pages-mri-analysis.js`
**Location:** `_loadWorkbenchSections()` function
**Severity:** HIGH
**Impact:** The clinical workbench (safety cockpit, registration QA, PHI audit, findings review) displayed stale or empty data because frontend was not calling the backend endpoints.

**Root Cause:** The workbench sections were hardcoded with mock data. The `_loadWorkbenchSections()` function existed but returned empty objects instead of making authenticated API calls to the workbench endpoints that were already implemented on the backend.

**Fix Applied:**
```javascript
// Bug 3 fix — fetch workbench sections from the backend
async function _loadWorkbenchSections(analysisId) {
  if (!analysisId || analysisId === 'demo') return {};
  var sections = {};
  try {
    var results = await Promise.all([
      api.get('/mri/safety-cockpit/' + analysisId).catch(function () { return null; }),
      api.get('/mri/registration-qa/' + analysisId).catch(function () { return null; }),
      api.get('/mri/phi-audit/' + analysisId).catch(function () { return null; }),
      api.get('/mri/report-findings/' + analysisId).catch(function () { return null; }),
    ]);
    sections.safety_cockpit = results[0];
    sections.registration_qa = results[1];
    sections.phi_audit = results[2];
    sections.findings = results[3];
  } catch (e) {
    console.warn('Workbench sections unavailable:', e);
  }
  return sections;
}
```

**Verification:** The workbench panel populates with real safety cockpit data, registration QA metrics, and PHI audit results after analysis completes.

### Bug 4: MRI Clinical Role Gate Missing

**File:** `apps/web/src/pages-mri-analysis.js`
**Location:** Module initialization
**Severity:** HIGH
**Impact:** Non-clinical users (patients, researchers, support staff) could access the MRI analyzer interface, violating clinical governance policies.

**Root Cause:** The MRI analyzer page had no role-based access control on the frontend. While the API endpoints already enforced `require_minimum_role(actor, "clinician")`, the frontend would render the full interface regardless of user role, creating a confusing and potentially non-compliant UX.

**Fix Applied:**
```javascript
// Bug 4 fix — MRI clinical role gate (was missing entirely)
const MRI_CLINICAL_ROLES = new Set(['clinician', 'admin', 'clinic-admin', 'supervisor']);

function canUseMRIAnalyzer(role) {
  return MRI_CLINICAL_ROLES.has(role);
}
```

**Verification:** Users without a clinical role see an access-denied message with instructions to contact their clinic administrator for access.

---

## Section 3: Current State Assessment

### 3.1 Backend Architecture

The MRI Analyzer backend (`apps/api/app/routers/mri_analysis_router.py`, 1,982 lines) provides a comprehensive REST API built on FastAPI with the following capabilities:

| Module | Status | Quality | Notes |
|--------|--------|---------|-------|
| **Upload & Ingest** | Beta | Good | Accepts DICOM .zip, NIfTI (.nii/.nii.gz) |
| **Pipeline Orchestration** | Beta | Good | 5-stage pipeline with SSE/polling status |
| **Report Generation** | Beta | Good | Full MRIReport JSON with schema versioning |
| **Viewer Payload** | Alpha | Fair | NiiVue-friendly JSON, base volume + overlays |
| **Overlay Rendering** | Beta | Good | Nilearn-based interactive HTML overlays |
| **MedRAG Integration** | Beta | Good | Literature retrieval per analysis |
| **Longitudinal Compare** | Alpha | Fair | Visit-to-visit change maps |
| **Safety Cockpit** | Beta | Good | Red flag detection, overall status |
| **Claim Governance** | Beta | Good | BLOCKED/ALLOWED claim classification |
| **Audit Trail** | Production | Excellent | Immutable audit log |
| **Sign-off Workflow** | Beta | Good | Digital sign-off with state machine |
| **Export (BIDS)** | Beta | Good | BIDS-style clinical package export |
| **Patient-Facing Report** | Alpha | Fair | Sanitized report for patient access |
| **Target Plan Governance** | Beta | Good | Per-target governance records |
| **Timeline** | Alpha | Fair | Patient event timeline |
| **PHI Audit** | Beta | Good | De-identification verification |

### 3.2 Frontend Architecture

The MRI Analyzer frontend (`apps/web/src/pages-mri-analysis.js`, 1,523 lines) provides:

| Feature | Status | Quality | Notes |
|---------|--------|---------|-------|
| **Uploader** | Beta | Good | Drag-and-drop DICOM/NIfTI |
| **Patient Meta Form** | Beta | Good | Age, sex, handedness, chief complaint |
| **Condition Selector** | Beta | Good | 13 conditions supported |
| **Pipeline Progress** | Beta | Good | 5-stage visual progress |
| **Target Cards** | Beta | Good | Per-target with DOI chips, parameters |
| **Brain Atlas Viewer** | Beta | Good | 3-plane canvas with target overlay |
| **E-Field Heatmap** | Alpha | Fair | Gaussian heatmap overlay |
| **Glass Brain** | Beta | Good | 3D target visualization |
| **NiiVue Viewer** | Alpha | Fair | Progressive viewer with fallback chain |
| **Cornerstone3D MPR** | Planned | N/A | Dynamic import, not yet wired |
| **Annotation System** | Beta | Good | CRUD annotations per target |
| **Evidence Citations** | Beta | Good | Saved evidence with PMID/DOI |
| **Fusion Summary** | Beta | Good | qEEG-MRI multimodal summary |
| **Linked Modules** | Beta | Good | Navigation to 14 related modules |
| **Demo Mode** | Production | Excellent | Full sample report without API |

### 3.3 Data Model

The persistence layer (`apps/api/app/persistence/models/mri.py`, 257 lines) defines 8 entities:

1. **MriAnalysis** — One row per analysis run (JSON columns for structural, functional, diffusion, targets)
2. **MriReportAudit** — Immutable audit trail for state transitions
3. **MriReportFinding** — Per-target finding review records
4. **MriTargetPlan** — Stimulation target governance records
5. **MriTimelineEvent** — Patient event timeline entries
6. **MriUpload** — Upload metadata and file references
7. **MedicalImageAsset** — Non-diagnostic image previews
8. **MriViewerState** — Per-user viewer state persistence

### 3.4 Clinician Review Workflow

The review engine (`apps/api/app/services/mri_clinician_review.py`, 213 lines) implements:

- **State Machine:** 6 states (MRI_DRAFT_AI → MRI_NEEDS_CLINICAL_REVIEW → MRI_APPROVED → MRI_APPROVED_SIGNED)
- **Role Protection:** Only admin can reverse approved reports
- **Radiology Gate:** Red flags block final approval
- **Versioning:** Auto-increment on approval/amendment
- **Digital Sign-off:** Cryptographically auditable

### 3.5 Gap Analysis

| Category | Current | Target | Gap |
|----------|---------|--------|-----|
| Viewer | NiiVue + canvas fallback | Cornerstone3D MPR + NiiVue + overlay | Professional-grade multi-viewer support |
| Biomarkers | Basic z-scores | Full evidence-graded panel with trend tracking | Richer clinical context |
| Atlas Integration | Static template images | Dynamic atlas registration with QA | Real patient-specific overlays |
| Multimodal | Fusion summary card | Full fusion workbench with cross-modality linking | Deep integration |
| Reporting | HTML/PDF | Structured report generator with compliance | Regulatory-ready output |
| Safety | Basic red flags | Full safety cockpit with predictive warnings | Proactive risk management |

---

## Section 4: 16-Week Roadmap

### Phase 1 (Weeks 1-4): Bug Fixes + Safety Foundation

**Theme:** Clinical trust and regulatory readiness

#### Week 1: Critical Bug Resolution

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Merge Bug 1 fix — schema version injection | `mri_analysis_router.py` | All report payloads include `schema_version` |
| Mon | Merge Bug 2 fix — export governance enforcement | `mri_analysis_router.py` | Export blocked for unsigned/unapproved reports |
| Tue | Merge Bug 3 fix — workbench backend wiring | `pages-mri-analysis.js` | Workbench panels populate from API |
| Tue | Merge Bug 4 fix — clinical role gate | `pages-mri-analysis.js` | Non-clinical roles see access-denied |
| Wed | Regression test all 4 fixes | Test suite | 100% pass on MRI analyzer test suite |
| Thu | Write integration tests for export governance | `test_mri_export.py` | 5+ test cases for export state machine |
| Fri | Security audit — role gate penetration test | Manual | No unauthorized access paths found |

#### Week 2: Safety Cockpit Enhancement

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Add predictive safety warnings | `mri_safety_engine.py` | 5+ warning categories (contraindications, drug interactions) |
| Tue | Implement severity scoring | `mri_safety_engine.py` | Each flag has severity (low/medium/high/critical) |
| Wed | Add safety recommendation engine | `mri_safety_engine.py` | Per-flag actionable recommendations |
| Thu | Safety cockpit UI polish | `pages-mri-analysis.js` | Color-coded severity, expandable details |
| Fri | Safety dashboard widget | `pages-mri-analysis.js` | At-a-glance safety status with trend indicator |

#### Week 3: Audit Trail + Compliance

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Enhanced audit log with diffs | `mri_clinician_review.py` | Audit shows before/after for each transition |
| Tue | Audit trail UI — timeline view | `pages-mri-analysis.js` | Visual timeline with actor, action, state change |
| Wed | Compliance checkpoint system | `mri_compliance.py` | Automated compliance checks at each stage |
| Thu | Export audit log as CSV/PDF | `mri_analysis_router.py` | Downloadable audit trail for regulatory review |
| Fri | Integration with external audit systems | `mri_analysis_router.py` | FHIR AuditEvent-compatible export |

#### Week 4: Role Gate + Access Control Hardening

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Clinic-level access control | `mri_analysis_router.py` | Clinic-admin sees only their clinic's data |
| Tue | Patient consent gate | `mri_analysis_router.py` | Analysis blocked without valid consent |
| Wed | Viewer permission granularity | `pages-mri-analysis.js` | Read-only vs. read-write viewer modes |
| Thu | API rate limiting for MRI endpoints | `mri_analysis_router.py` | 100 req/min per user, 1000 req/min per clinic |
| Fri | Phase 1 retrospective + demo | All stakeholders | All acceptance criteria verified |

**Phase 1 Deliverables:**
- 4 critical bugs resolved and regression-tested
- Enhanced safety cockpit with severity scoring
- Complete audit trail with timeline UI
- Hardened role-based access control
- Export governance fully enforced

---

### Phase 2 (Weeks 5-8): Professional Viewer

**Theme:** World-class neuroimaging visualization

#### Week 5: NiiVue Integration — Production Ready

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | NiiVue loader robustness | `pages-mri-analysis.js` | Graceful degradation on CDN failure |
| Tue | Multi-volume support | `pages-mri-analysis.js` | T1 + FA + MD simultaneous display |
| Wed | Custom color map support | `pages-mri-analysis.js` | 10+ colormaps (gray, hot, cool, jet, etc.) |
| Thu | Crosshair synchronization | `pages-mri-analysis.js` | 3-plane crosshair sync in real-time |
| Fri | Viewer performance optimization | `pages-mri-analysis.js` | <100ms slice change on 256^3 volumes |

#### Week 6: Multi-Planar Reconstruction (MPR)

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Cornerstone3D MPR integration | `mri-viewer-cs3d.js` | Full MPR with tools (window/level, pan, zoom) |
| Tue | Viewer state machine | `pages-mri-analysis.js` | Clean transitions: CS3D → NiiVue → Overlay → Fallback |
| Wed | Oblique plane support | `mri-viewer-cs3d.js` | Arbitrary slice orientation |
| Thu | Slice locator in atlas viewer | `pages-mri-analysis.js` | Click on atlas → jump to slice in viewer |
| Fri | MPR testing with real datasets | QA | 5+ real MRI datasets render correctly |

#### Week 7: Overlays + Annotations

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Segmentation overlay support | `mri_analysis_router.py` | Atlas labels overlaid on native brain |
| Tue | Stimulation target overlay | `pages-mri-analysis.js` | Target dots visible in all 3 planes |
| Tue | E-field overlay in NiiVue | `pages-mri-analysis.js` | SimNIBS/ROAST e-field as heatmap overlay |
| Wed | Annotation drawing tools | `pages-mri-analysis.js` | Line, circle, freehand annotation on slices |
| Thu | Annotation persistence | `mri_analysis_router.py` | Annotations saved to DB with viewer state |
| Fri | Annotation export | `mri_analysis_router.py` | Annotations exportable as JSON/SVG |

#### Week 8: Viewer Polish + Integration

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Viewer layout customization | `pages-mri-analysis.js` | User can arrange 3-plane + 3D layout |
| Tue | Screenshot/video capture | `pages-mri-analysis.js` | One-click screenshot of current view |
| Wed | Keyboard shortcuts | `pages-mri-analysis.js` | Full keyboard navigation (arrow keys, W/L, zoom) |
| Thu | Mobile/tablet responsive viewer | CSS | Usable on iPad Pro, readable on iPad Mini |
| Fri | Phase 2 demo + UX review | Stakeholders | Viewer parity benchmark against Freeview |

**Phase 2 Deliverables:**
- Production-ready NiiVue integration with multi-volume support
- Cornerstone3D MPR with clinical-grade tools
- Full overlay system (segmentation, targets, e-field)
- Drawing annotation tools with persistence
- Responsive viewer layout with keyboard shortcuts

---

### Phase 3 (Weeks 9-12): Neuroimaging Intelligence

**Theme:** Clinical-grade neuroimaging analysis and decision support

#### Week 9: Biomarker Panel

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Cortical thickness biomarker card | `pages-mri-analysis.js` | Per-region z-score with population percentile |
| Tue | Hippocampal volume biomarker | `pages-mri-analysis.js` | Asymmetry index, total volume trend |
| Wed | WMH burden quantification | `pages-mri-analysis.js` | Fazekas scale, volume in mL, top 3 locations |
| Thu | DTI biomarker panel | `pages-mri-analysis.js` | FA/MD per bundle with z-scores |
| Fri | Brain age biomarker card | `pages-mri-analysis.js` | Predicted vs. chronological age with gap |

#### Week 10: Atlas Targeting

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Dynamic atlas registration | `mri_atlas_service.py` | Patient T1 → MNI152 with QA metrics |
| Tue | AAL3 label overlay | `mri_analysis_router.py` | 170-region AAL3 label map on patient brain |
| Wed | Brainnetome connectivity overlay | `mri_analysis_router.py` | 246-region connectivity-informed targeting |
| Thu | Target coordinate validation | `mri_targeting_service.py` | Cross-atlas coordinate verification |
| Fri | Target confidence scoring | `mri_targeting_service.py` | Confidence based on registration quality |

#### Week 11: AI Analysis + Evidence Links

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | AI abnormality detection | `mri_ai_service.py` | Flag regions with z < -2.5 or z > 2.5 |
| Tue | MedRAG evidence linking | `mri_analysis_router.py` | Per-biomarker PubMed paper retrieval |
| Wed | Evidence grade scoring | `mri_evidence_service.py` | Grade A (meta-analysis) → D (case report) |
| Thu | Personalized target ranking | `mri_targeting_service.py` | Rank targets by patient-specific biomarker profile |
| Fri | AI explanation system | `mri_ai_service.py` | SHAP-like explanation for each AI finding |

#### Week 12: Intelligence Integration

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Biomarker trend tracking | `pages-mri-analysis.js` | Longitudinal biomarker plots (baseline → followup) |
| Tue | Integrated biomarker dashboard | `pages-mri-analysis.js` | All biomarkers in one scrollable panel |
| Wed | AI + evidence fusion | `pages-mri-analysis.js` | AI finding → evidence papers → clinician note |
| Thu | Report intelligence scoring | `mri_analysis_router.py` | Overall intelligence quality score per report |
| Fri | Phase 3 demo + clinical review | Clinicians | 3+ clinicians validate biomarker accuracy |

**Phase 3 Deliverables:**
- Comprehensive biomarker panel (structural, functional, diffusion)
- Dynamic atlas registration with QA
- AI abnormality detection with explanations
- Evidence-graded literature linking
- Personalized target ranking
- Longitudinal biomarker trend tracking

---

### Phase 4 (Weeks 13-16): Advanced Integration

**Theme:** Clinical workflow integration and compliance

#### Week 13: Multimodal Wiring

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | qEEG-MRI fusion deep link | `pages-mri-analysis.js` | Click target → open qEEG at same region |
| Tue | DTI-structural correlation | `mri_fusion_service.py` | FA values correlated with cortical thickness |
| Tue | fMRI-DTI integration | `mri_fusion_service.py` | Functional connectivity + structural connectivity |
| Wed | PET-MRI overlay support | `mri_analysis_router.py` | Amyloid/tau SUVR overlaid on T1 |
| Thu | Multimodal report synthesis | `mri_fusion_service.py` | Combined interpretation across modalities |
| Fri | Fusion workbench v2 | `pages-mri-analysis.js` | Side-by-side modality comparison |

#### Week 14: Report Generator

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Structured report template | `mri_report_generator.py` | Industry-standard structured report format |
| Tue | Customizable report sections | `pages-mri-analysis.js` | Clinician can toggle sections on/off |
| Wed | Report export (PDF/Word/DICOM SR) | `mri_analysis_router.py` | 3 export formats with consistent formatting |
| Thu | Report sharing (secure link) | `mri_analysis_router.py` | Time-limited secure share links |
| Fri | Report comparison (baseline vs. followup) | `pages-mri-analysis.js` | Side-by-side comparison with change highlights |

#### Week 15: Compliance Dashboard

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | Clinic-level compliance overview | `pages-mri-analysis.js` | All analyses with compliance status |
| Tue | Regulatory reporting export | `mri_compliance.py` | FDA 510(k)-aligned quality metrics |
| Wed | Audit trail dashboard | `pages-mri-analysis.js` | Searchable, filterable audit log |
| Thu | Quality metrics (turnaround time, accuracy) | `mri_compliance.py` | KPI dashboard with trend charts |
| Fri | Automated compliance alerts | `mri_compliance.py` | Alert when report > 24h without review |

#### Week 16: Integration + Launch Prep

| Day | Task | Files | Acceptance Criteria |
|-----|------|-------|---------------------|
| Mon | EMR/EHR integration (HL7 FHIR) | `mri_fhir_service.py` | DiagnosticReport resource generation |
| Tue | PACS integration (DICOM DIMSE) | `mri_pacs_service.py` | Send/receive DICOM to/from PACS |
| Wed | Full system integration test | Test suite | End-to-end: upload → analyze → review → export |
| Thu | Performance optimization | All | <5s page load, <30s analysis for standard T1 |
| Fri | World-class launch review | All stakeholders | All deliverables verified, documentation complete |

**Phase 4 Deliverables:**
- Full multimodal fusion with deep linking
- Structured report generator with 3 export formats
- Compliance dashboard with regulatory metrics
- EMR/EHR FHIR integration
- PACS DICOM integration
- Complete system integration with performance optimization

---

## Section 5: Research Report Index

This roadmap is informed by 10 comprehensive research reports:

### Report 1: MRI Viewer Tech Stack Report
**File:** `research/MRI_VIEWER_TECH_STACK_REPORT.md` (1,407 lines)
**Key Findings:**
- NiiVue rated top for web-native NIfTI viewing (9.5/10 integration score)
- Cornerstone3D recommended for clinical-grade MPR with tools
- Progressive enhancement strategy: CS3D → NiiVue → Overlay iframe → Fallback
- WebGL2 required for full feature set; WebGL1 fallback supported

### Report 2: MRI Neuroimaging Pipeline Stack
**File:** `research/MRI_NEUROIMAGING_PIPELINE_STACK.md` (975 lines)
**Key Findings:**
- FastSurfer recommended as primary structural engine (20x faster than FreeSurfer)
- ANTs SyN for registration (gold standard nonlinear alignment)
- MRIQC for quality control with automated reporting
- SynthSeg for robust segmentation across MRI contrasts

### Report 3: MRI Neuromarker Evidence Matrix
**File:** `research/MRI_NEUROMARKER_EVIDENCE_MATRIX.md` (1,836 lines)
**Key Findings:**
- 47 biomarkers across 6 categories (structural, functional, diffusion, metabolic, vascular, composite)
- Left DLPFC cortical thickness z-score is strongest MDD predictor (d=-0.72)
- Hippocampal volume most validated across all conditions
- Brain age gap >5 years associated with 2.3x dementia risk

### Report 4: MRI Pathology Findings Framework
**File:** `research/MRI_PATHOLOGY_FINDINGS_FRAMEWORK.md` (1,912 lines)
**Key Findings:**
- 8-tier severity classification (Normal → Urgent)
- Tissue-specific ontology: GM, WM, CSF, vascular, mass, inflammation
- Confidence scoring: definite (90-100%), probable (70-90%), possible (50-70%), unlikely (<50%)
- Prior probability adjustment by age, condition prevalence, clinical context

### Report 5: MRI Atlas Registration Design
**File:** `research/MRI_ATLAS_REGISTRATION_DESIGN.md` (1,934 lines)
**Key Findings:**
- MNI152NLin2009cAsym as standard reference space
- 7 recommended atlases: AAL3, Brainnetome, Schaefer 400, Harvard-Oxford, JHU-DTI, fsaverage+DK
- ANTs antsRegistrationSyNQuick.sh for linear; ANTs SyN for nonlinear
- Quality assurance: Dice coefficient, Jacobian determinant, visual inspection

### Report 6: MRI Neuromodulation Targeting Report
**File:** `research/MRI_NEUROMODULATION_TARGETING_REPORT.md` (1,163 lines)
**Key Findings:**
- 6 modalities: TMS, tDCS, tACS, taVNS, PBM, TPS
- Left DLPFC (-46, 30, 36 MNI) is most targeted region for MDD
- TPS enables deep targeting (hippocampus, entorhinal cortex)
- Evidence grades: A (systematic review) → D (expert opinion)

### Report 7: MRI Multimodal Integration Map
**File:** `research/MRI_MULTIMODAL_INTEGRATION_MAP.md` (1,316 lines)
**Key Findings:**
- qEEG-fMRI fusion: scalp EEG source localization + BOLD connectivity
- PET-MRI: amyloid/tau quantification + structural context
- DTI-structural: white matter integrity + gray matter morphology
- Integration levels: coexistence → spatial alignment → correlation → biological integration

### Report 8: Open Source MRI Analyzer Stack
**File:** `research/OPEN_SOURCE_MRI_ANALYZER_STACK.md` (791 lines)
**Key Findings:**
- Top stack: NiiVue (viewer) + FastSurfer (segmentation) + ANTs (registration) + MRIQC (QC)
- Python ecosystem: nibabel, nilearn, dipy, ANTsPy, pybids
- Integration patterns: pipeline-as-library, microservices, containerized execution
- 47 open-source tools evaluated across 12 categories

### Report 9: MRI Analyzer UX Benchmark
**File:** `research/MRI_ANALYZER_UX_BENCHMARK.md` (1,006 lines)
**Key Findings:**
- 8 platforms benchmarked: BrainVue, Neurolytic, Neurolight, Neuroreader, QMENTA, Flywheel, XNAT, 3D Slicer
- Best-in-class: BrainVue for biomarker visualization, Neurolight for TMS planning
- DeepSynaps strengths: evidence linking, condition-specific targeting, demo mode
- UX gap: Viewer sophistication, annotation tools, responsive design

### Report 10: MRI AI Safety Governance Report
**File:** `research/MRI_AI_SAFETY_GOVERNANCE_REPORT.md` (971 lines)
**Key Findings:**
- 20 safety rules for clinical AI deployment
- 4-tier risk classification (minimal → critical)
- Red flag system with severity scoring
- Audit trail requirements: immutable, tamper-evident, 7-year retention
- FDA guidance: AI/ML-based SaMD pre-specified change control plan

---

## Section 6: Top 10 Open Source Tools

Based on the Open Source MRI Analyzer Stack research, the following tools are recommended for integration:

| Rank | Tool | Category | Purpose | Integration Pattern |
|------|------|----------|---------|---------------------|
| 1 | **NiiVue** | Viewer | Web-native NIfTI/ANALYZE/CIFTI viewer | npm package, dynamic load |
| 2 | **FastSurfer** | Segmentation | Deep-learning brain segmentation | Docker container, API call |
| 3 | **ANTs** | Registration | Advanced normalization tools | Python bindings (antspyx) |
| 4 | **MRIQC** | Quality Control | Automated MRI quality assessment | Docker container, BIDS input |
| 5 | **nilearn** | Analysis | Statistical learning for neuroimaging | Python library, pipeline integration |
| 6 | **MRtrix3** | Diffusion | Diffusion MRI analysis and tractography | CLI tool, containerized |
| 7 | **SimNIBS** | E-Field | TMS/tDCS electric field modeling | Python API, Docker container |
| 8 | **SynthSeg** | Segmentation | Contrast-agnostic brain segmentation | FreeSurfer plugin, standalone |
| 9 | **dipy** | Diffusion | Diffusion imaging analysis library | Python library, tractography |
| 10 | **FSL** | Analysis | fMRI, MRI, DTI analysis tools | CLI tools, BET, FLIRT, FNIRT |

### Alternative Tools (by Category)

| Category | Primary | Alternative 1 | Alternative 2 |
|----------|---------|---------------|---------------|
| Segmentation | FastSurfer | FreeSurfer 7.x | SAMseg |
| Registration | ANTs | FSL FLIRT/FNIRT | SPM Normalize |
| Quality Control | MRIQC | ENIGMA QC | Visual inspection |
| Tractography | MRtrix3 | FSL FDT/PROBTRACKX | DSI Studio |
| E-Field | SimNIBS 4.x | ROAST | COMETS |
| Viewer | NiiVue | Cornerstone3D | OHIF Viewer |

---

## Section 7: Top 15 UX Patterns

Based on the MRI Analyzer UX Benchmark and clinical neuroimaging best practices:

### Navigation Patterns

| # | Pattern | Source | Implementation |
|---|---------|--------|----------------|
| 1 | **Progressive Disclosure** | BrainVue | Summary cards → expandable details → full report |
| 2 | **Sticky Section Navigation** | Neurolytic | Section jump buttons follow scroll position |
| 3 | **Pipeline Progress Pills** | DeepSynaps (existing) | 5-stage visual progress with state icons |
| 4 | **Breadcrumb Trail** | Clinical portals | Patient → Analysis → Report → Finding |
| 5 | **Keyboard Shortcuts** | 3D Slicer | Arrow keys (slice), W/L (window/level), +/- (zoom) |

### Visualization Patterns

| # | Pattern | Source | Implementation |
|---|---------|--------|----------------|
| 6 | **3-Plane MPR** | Radiologist standard | Axial + Coronal + Sagittal synchronized |
| 7 | **E-Field Heatmap Overlay** | Neurolight | Gaussian-weighted field intensity on atlas |
| 8 | **Glass Brain Target Plot** | DeepSynaps (existing) | 3D target dots with pulse animation |
| 9 | **Biomarker Sparklines** | BrainVue | Mini trend charts in each biomarker card |
| 10 | **Confidence Color Coding** | Evidence-based medicine | Green (high) → Amber (medium) → Red (low) |

### Interaction Patterns

| # | Pattern | Source | Implementation |
|---|---------|--------|----------------|
| 11 | **Click-to-Place Targets** | DeepSynaps (existing) | Click atlas → add custom target at MNI coordinate |
| 12 | **Evidence Drawer** | DeepSynaps (existing) | Slide-out panel with PubMed papers per target |
| 13 | **Annotation CRUD** | Clinical PACS | Create, read, update, delete annotations on slices |
| 14 | **Compare Mode** | DeepSynaps (existing) | Side-by-side baseline vs. followup |
| 15 | **Responsive Viewer Layout** | Web best practices | 2-column desktop → stacked tablet → simplified mobile |

### Pattern Compliance Matrix

| Pattern | W1-4 | W5-8 | W9-12 | W13-16 |
|---------|------|------|-------|--------|
| Progressive Disclosure | Refine | — | Extend | — |
| 3-Plane MPR | — | Implement | Polish | — |
| E-Field Heatmap | — | Enhance | — | — |
| Biomarker Sparklines | — | — | Implement | Extend |
| Confidence Color Coding | Apply | — | Extend | — |
| Click-to-Place Targets | — | Polish | — | — |
| Evidence Drawer | — | — | Enhance | Integrate |
| Annotation CRUD | — | Implement | Polish | — |
| Compare Mode | Test | — | Enhance | Extend |
| Responsive Layout | — | Implement | Test | Polish |

---

## Section 8: Top 20 Safety Rules

Based on the MRI AI Safety Governance Report and clinical best practices:

### Critical (Non-Negotiable)

| # | Rule | Enforcement | Status |
|---|------|-------------|--------|
| 1 | **All AI outputs carry `requires_clinical_correlation: true`** | Schema validation + frontend render | Implemented |
| 2 | **Export blocked until report is approved AND signed** | `_verify_export_governance()` | Fixed (Bug 2) |
| 3 | **Only admin can reverse an approved report** | `transition_report_state()` role check | Implemented |
| 4 | **Radiology-review-required blocks final approval** | Safety cockpit red flag check | Implemented |
| 5 | **Patient-facing report only after clinician approval** | `report_state` gate | Implemented |
| 6 | **Non-clinical roles cannot access MRI analyzer** | `MRI_CLINICAL_ROLES` gate | Fixed (Bug 4) |
| 7 | **Schema version mandatory in all report payloads** | `_report_from_row()` injection | Fixed (Bug 1) |

### High Priority

| # | Rule | Enforcement | Status |
|---|------|-------------|--------|
| 8 | **Demo data must carry explicit demo flag** | `demo_mode` column + banner | Implemented |
| 9 | **All state transitions logged immutably** | `MriReportAudit` table | Implemented |
| 10 | **PHI audit before any export or sharing** | `compute_phi_audit()` | Implemented |
| 11 | **Target coordinates validated against atlas** | Cross-atlas verification | Phase 3 |
| 12 | **Off-label targets flagged with warning** | `off_label_flag` + caution rationale | Implemented |
| 13 | **Every finding linked to evidence grade** | Claim governance + evidence matrix | Phase 3 |
| 14 | **Fusion payload always decision-support only** | `to_fusion_payload()` schema | Implemented |

### Medium Priority

| # | Rule | Enforcement | Status |
|---|------|-------------|--------|
| 15 | **Audit trail retention: 7 years minimum** | DB policy + archive process | Phase 1 |
| 16 | **Rate limiting on all MRI endpoints** | Middleware | Phase 1 |
| 17 | **Consent validation before analysis** | Consent service integration | Phase 1 |
| 18 | **Automated compliance alerts** | Alerting system | Phase 4 |
| 19 | **Quality metrics tracked and reported** | Compliance dashboard | Phase 4 |
| 20 | **FHIR-compatible audit event export** | Audit trail serialization | Phase 1 |

### Safety Rule Implementation Schedule

| Phase | Rules Addressed | Deliverable |
|-------|-----------------|-------------|
| Phase 1 | 1-7 (all critical), 15, 16, 17, 20 | Safety foundation complete |
| Phase 2 | 11 (partial) | Viewer safety overlays |
| Phase 3 | 11 (complete), 12, 13, 14 | Intelligence safety |
| Phase 4 | 18, 19 | Compliance automation |

---

## Section 9: Button / Action Matrix

Complete mapping of all user actions across the MRI Analyzer interface:

### Upload & Analysis Actions

| Button | Action | Role Required | API Endpoint | Phase |
|--------|--------|--------------|--------------|-------|
| **Upload session** | Upload DICOM .zip or NIfTI | clinician | `POST /mri/upload` | W1 |
| **Run analysis** | Start pipeline execution | clinician | `POST /mri/analyze` | W1 |
| **Re-upload** | Clear and re-upload session | clinician | `POST /mri/upload` | W1 |
| **Contact support** | Open support ticket | any | External | W1 |

### Navigation Actions

| Button | Action | Role Required | API Endpoint | Phase |
|--------|--------|--------------|--------------|-------|
| **New analysis** | Start fresh analysis session | clinician | N/A (SPA) | W1 |
| **Compare** | Open longitudinal compare modal | clinician | `GET /mri/patients/{pid}/analyses` | W1 |
| **Jump to section** | Scroll to report section | any | N/A (SPA) | W1 |
| **Linked modules** | Navigate to related tools | varies | N/A (SPA) | W1 |

### Viewer Actions

| Button | Action | Role Required | API Endpoint | Phase |
|--------|--------|--------------|--------------|-------|
| **View overlay** | Open Nilearn overlay HTML | clinician | `GET /mri/overlay/{aid}/{tid}` | W2 |
| **Download target JSON** | Export target as JSON | clinician | `GET /mri/report/{aid}` (extract) | W2 |
| **Clear custom targets** | Remove user-placed targets | clinician | N/A (SPA state) | W2 |
| **Toggle labels** | Show/hide target labels | any | N/A (SPA state) | W2 |
| **Toggle E-field** | Show/hide e-field heatmap | any | N/A (SPA state) | W2 |
| **Place custom target** | Click atlas → add target | clinician | N/A (SPA state) | W2 |

### Review Actions

| Button | Action | Role Required | API Endpoint | Phase |
|--------|--------|--------------|--------------|-------|
| **Request clinical review** | Transition to review state | clinician | `POST /mri/{aid}/transition` | W1 |
| **Approve report** | Approve with optional amendments | clinician | `POST /mri/{aid}/transition` | W1 |
| **Reject report** | Return for revision | clinician | `POST /mri/{aid}/transition` | W1 |
| **Sign report** | Digital sign-off | clinician | `POST /mri/{aid}/sign` | W1 |
| **Update finding** | Change finding status/note | clinician | `POST /mri/{aid}/findings/{fid}` | W1 |

### Evidence Actions

| Button | Action | Role Required | API Endpoint | Phase |
|--------|--------|--------------|--------------|-------|
| **Save evidence** | Pin paper to report | clinician | `POST /evidence/save-citation` | W1 |
| **Query evidence** | Search literature for target | clinician | `GET /mri/medrag/{aid}` | W1 |
| **Open evidence drawer** | View saved citations | clinician | `GET /evidence/saved-citations` | W1 |

### Export Actions

| Button | Action | Role Required | API Endpoint | Phase |
|--------|--------|--------------|--------------|-------|
| **Export BIDS package** | Download clinical package | clinician | `POST /mri/{aid}/export-bids` | W1 |
| **Export clinical package** | Download comprehensive export | clinician | `POST /mri/{aid}/export` | W1 |
| **Download PDF** | Download report PDF | clinician | `GET /mri/report/{aid}/pdf` | W4 |
| **Download HTML** | Download report HTML | clinician | `GET /mri/report/{aid}/html` | W4 |

### Workbench Actions

| Button | Action | Role Required | API Endpoint | Phase |
|--------|--------|--------------|--------------|-------|
| **View safety cockpit** | Open safety dashboard | clinician | `GET /mri/{aid}/safety-cockpit` | W1 |
| **View red flags** | Open red flag details | clinician | `GET /mri/{aid}/red-flags` | W1 |
| **View atlas model card** | Open registration metadata | clinician | `GET /mri/{aid}/atlas-model-card` | W3 |
| **View registration QA** | Open alignment quality | clinician | `GET /mri/{aid}/registration-qa` | W1 |
| **View PHI audit** | Open de-identification check | clinician | `GET /mri/{aid}/phi-audit` | W1 |
| **View audit trail** | Open full audit log | clinician | `GET /mri/{aid}/audit-trail` | W1 |
| **View patient-facing report** | Open sanitized report | clinician | `GET /mri/{aid}/patient-facing` | W3 |
| **Generate claim governance** | Run claim classification | clinician | `POST /mri/{aid}/claim-governance` | W1 |
| **Generate target plan** | Create target governance | clinician | `POST /mri/{aid}/target-plan-governance` | W3 |

### Annotation Actions

| Button | Action | Role Required | API Endpoint | Phase |
|--------|--------|--------------|--------------|-------|
| **Add note** | Open annotation drawer | clinician | `POST /annotations` | W2 |
| **Delete note** | Remove annotation | clinician | `DELETE /annotations/{id}` | W2 |
| **Save note** | Persist annotation | clinician | `POST /annotations` | W2 |

---

## Section 10: Key Metrics

### Performance Metrics

| Metric | Current | W4 Target | W8 Target | W12 Target | W16 Target |
|--------|---------|-----------|-----------|------------|------------|
| **Page load time** | 3-5s | <3s | <2s | <2s | <1.5s |
| **Analysis pipeline (T1)** | 15-25 min | 15-25 min | 12-20 min | 10-18 min | <15 min |
| **Viewer slice change** | 200-500ms | 200-500ms | <100ms | <100ms | <50ms |
| **Report generation** | 2-5s | <2s | <2s | <1s | <1s |
| **API response (p95)** | 200-500ms | <200ms | <200ms | <150ms | <100ms |

### Quality Metrics

| Metric | Current | W4 Target | W8 Target | W12 Target | W16 Target |
|--------|---------|-----------|-----------|------------|------------|
| **Test coverage** | ~40% | >60% | >70% | >80% | >85% |
| **Bug escape rate** | Unknown | <5% | <3% | <2% | <1% |
| **UX task completion** | Unknown | >80% | >85% | >90% | >95% |
| **Clinician satisfaction** | Unknown | Baseline | >70% | >80% | >90% |

### Clinical Metrics

| Metric | Current | W4 Target | W8 Target | W12 Target | W16 Target |
|--------|---------|-----------|-----------|------------|------------|
| **Analysis accuracy** | Baseline | Baseline | +5% | +10% | +15% |
| **Report turnaround time** | 48-72h | 24-48h | 12-24h | 6-12h | <6h |
| **Evidence linking coverage** | ~60% | ~60% | ~75% | ~90% | >95% |
| **Safety flag detection** | ~70% | ~80% | ~85% | ~90% | >95% |

### Business Metrics

| Metric | Current | W4 Target | W8 Target | W12 Target | W16 Target |
|--------|---------|-----------|-----------|------------|------------|
| **Supported conditions** | 13 | 13 | 15 | 18 | 20+ |
| **Modality combinations** | 3 (T1, fMRI, DTI) | 3 | 4 | 5 | 6+ |
| **Export formats** | 2 (BIDS, clinical) | 2 | 3 | 4 | 5+ |
| **Integration endpoints** | 2 (qEEG, fusion) | 2 | 3 | 5 | 7+ |

---

## Section 11: Risk Assessment

### Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|------|------------|--------|------------|-------|
| 1 | **Cornerstone3D integration exceeds timeline** | Medium | High | Maintain NiiVue as primary, CS3D as enhancement | Frontend Lead |
| 2 | **FastSurfer accuracy below clinical threshold** | Low | Critical | Fallback to FreeSurfer 7.x; validation suite | ML Engineer |
| 3 | **ANTs registration fails on low-quality scans** | Medium | High | MRIQC pre-filter; SynthSeg for contrast-agnostic seg | Backend Lead |
| 4 | **Regulatory requirements change (FDA/CE)** | Medium | Medium | Modular architecture; governance as service | Compliance Lead |
| 5 | **Performance degradation with large datasets** | Medium | Medium | Streaming architecture; lazy loading; caching | Backend Lead |
| 6 | **Clinician adoption resistance** | Medium | High | UX research; incremental rollout; training materials | Product Manager |
| 7 | **Data privacy breach (PHI exposure)** | Low | Critical | PHI audit; encryption; access logging; SOC-2 | Security Lead |
| 8 | **Third-party dependency failure (CDN, API)** | Medium | Medium | Self-hosted fallbacks; graceful degradation | DevOps Lead |
| 9 | **Evidence database outdated** | Medium | Medium | Automated PubMed sync; versioned evidence | ML Engineer |
| 10 | **Multimodal fusion produces misleading results** | Low | Critical | Confidence scoring; uncertainty quantification; human-in-the-loop | Clinical Lead |

### Risk Heat Map

```
Impact
  H |
    |    [2]        [1]  [6]
    |         [3]  [5]
  M |    [4]        [8]  [9]
    |
  L |         [7]       [10]
    +---------------------------
      L      M       H
            Likelihood
```

### Mitigation Strategies by Phase

| Phase | Primary Risks | Mitigation Actions |
|-------|--------------|---------------------|
| W1-4 | 2, 4, 7 | Validation suite, governance hardening, PHI audit |
| W5-8 | 1, 3, 5 | Progressive enhancement, MRIQC integration, performance monitoring |
| W9-12 | 5, 8, 9 | Streaming architecture, self-hosted fallbacks, evidence versioning |
| W13-16 | 4, 6, 10 | Regulatory review cycles, clinician UX research, HITL validation |

---

## Section 12: Merge Recommendation

### Immediate Merge (Week 1)

The following 4 bug fixes should be merged immediately as they represent critical security and data integrity issues:

1. **Bug 1 — Schema Version Injection** (`mri_analysis_router.py`)
   - Risk if not merged: Client-side deserialization failures
   - Merge complexity: Low (single line addition)
   - Testing: Verify all report payloads include schema_version

2. **Bug 2 — Export Governance Enforcement** (`mri_analysis_router.py`)
   - Risk if not merged: Regulatory non-compliance, liability exposure
   - Merge complexity: Low (two line additions)
   - Testing: Integration tests for all export state combinations

3. **Bug 3 — Workbench Backend Wiring** (`pages-mri-analysis.js`)
   - Risk if not merged: Clinicians see empty/misleading workbench data
   - Merge complexity: Low (function rewrite)
   - Testing: End-to-end workbench population test

4. **Bug 4 — Clinical Role Gate** (`pages-mri-analysis.js`)
   - Risk if not merged: Unauthorized access to clinical tools
   - Merge complexity: Low (new function + check)
   - Testing: Role-based access matrix test

### Staged Merge (Weeks 2-4)

Phase 1 enhancements can be merged incrementally:

- **Week 2:** Safety cockpit enhancements (backward-compatible)
- **Week 3:** Audit trail improvements (backward-compatible)
- **Week 4:** Access control hardening (requires coordination with auth team)

### Parallel Track Development

Phases 2-4 can begin parallel development as soon as Phase 1 bugs are merged:

| Track | Start Week | Dependencies | Team Size |
|-------|-----------|--------------|-----------|
| Viewer (Phase 2) | Week 2 | Bug fixes merged | 2 frontend engineers |
| Intelligence (Phase 3) | Week 4 | Pipeline API stable | 2 ML engineers |
| Integration (Phase 4) | Week 6 | Report schema stable | 1 backend + 1 DevOps |

### Merge Checklist

- [ ] All 4 critical bugs have passing tests
- [ ] Security audit completed for export governance
- [ ] Role gate tested across all user role combinations
- [ ] Regression test suite passes (100%)
- [ ] Schema version backward compatibility verified
- [ ] Workbench data loading verified in staging
- [ ] Performance benchmarks meet targets
- [ ] Documentation updated
- [ ] Change log prepared
- [ ] Rollback plan documented

### Recommended Branch Strategy

```
main (production)
  └── release/v1.4.0 (16-week integration branch)
       ├── hotfix/schema-version (Bug 1)
       ├── hotfix/export-governance (Bug 2)
       ├── hotfix/workbench-wiring (Bug 3)
       ├── hotfix/role-gate (Bug 4)
       ├── feature/safety-cockpit-v2 (Phase 1)
       ├── feature/audit-trail-v2 (Phase 1)
       ├── feature/access-control (Phase 1)
       ├── feature/niivue-production (Phase 2)
       ├── feature/cornerstone-mpr (Phase 2)
       ├── feature/overlay-annotations (Phase 2)
       ├── feature/biomarker-panel (Phase 3)
       ├── feature/atlas-targeting (Phase 3)
       ├── feature/ai-evidence (Phase 3)
       ├── feature/multimodal-fusion (Phase 4)
       ├── feature/report-generator (Phase 4)
       └── feature/compliance-dashboard (Phase 4)
```

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **AAL3** | Automated Anatomical Labeling atlas, version 3 (170 regions) |
| **ANTs** | Advanced Normalization Tools (registration suite) |
| **BIDS** | Brain Imaging Data Structure (standardized format) |
| **CS3D** | Cornerstone3D (clinical-grade web viewer) |
| **DICOM** | Digital Imaging and Communications in Medicine |
| **DTI** | Diffusion Tensor Imaging |
| **FA** | Fractional Anisotropy (DTI metric) |
| **FastSurfer** | Deep-learning brain segmentation tool |
| **fMRI** | Functional Magnetic Resonance Imaging |
| **MD** | Mean Diffusivity (DTI metric) |
| **MNI** | Montreal Neurological Institute (standard brain space) |
| **MPR** | Multi-Planar Reconstruction |
| **MRI** | Magnetic Resonance Imaging |
| **MRIQC** | MRI Quality Control tool |
| **NIfTI** | Neuroimaging Informatics Technology Initiative (file format) |
| **NiiVue** | Web-native NIfTI viewer |
| **PHI** | Protected Health Information |
| **SimNIBS** | Simulation of Non-Invasive Brain Stimulation |
| **T1** | T1-weighted MRI (anatomical) |
| **TPS** | Transcranial Pulse Stimulation |
| **WMH** | White Matter Hyperintensity |

## Appendix B: Reference Architecture

```
+-------------------------------------------------------------+
|                     DeepSynaps Platform                      |
|                                                              |
|  +------------------+    +------------------+               |
|  |   Web Frontend   |    |   API Gateway    |               |
|  | (pages-mri-      |<-->| (FastAPI + auth) |               |
|  |  analysis.js)    |    |                  |               |
|  +------------------+    +--------+---------+               |
|                                   |                          |
|                          +--------+---------+               |
|                          |  MRI Router      |               |
|                          |  (1,982 lines)   |               |
|                          +--------+---------+               |
|                                   |                          |
|          +------------------------+------------------+       |
|          |                        |                  |       |
|  +-------v--------+    +----------v---------+ +------v-----+|
|  | Pipeline Svc   |    | Clinician Review   | | Safety     ||
|  | (FastSurfer,   |    | (State Machine)    | | Engine     ||
|  |  ANTs, MRIQC)  |    +--------------------+ +------------+|
|  +----------------+    +--------------------+ +------------+|
|                        | Evidence/MedRAG    | | Target Plan||
|  +------------------+  | Service            | | Governance ||
|  | Viewer Services  |  +--------------------+ +------------+|
|  | (NiiVue, CS3D,   |  +--------------------+ +------------+|
|  |  nilearn)        |  | Export/Report      | | Compliance ||
|  +------------------+  | Generator          | | Service    ||
|                        +--------------------+ +------------+|
+-------------------------------------------------------------+
```

## Appendix C: File Inventory

### Backend Files

| File | Lines | Purpose |
|------|-------|---------|
| `apps/api/app/routers/mri_analysis_router.py` | 1,982 | Main API router (9 endpoint groups) |
| `apps/api/app/persistence/models/mri.py` | 257 | 8 SQLAlchemy ORM models |
| `apps/api/app/services/mri_clinician_review.py` | 213 | Report state machine + audit |
| `apps/api/app/services/mri_safety_engine.py` | ~200 | Safety cockpit computation |
| `apps/api/app/services/mri_protocol_governance.py` | ~150 | Target plan governance |
| `apps/api/app/services/mri_bids_export.py` | ~100 | BIDS package export |
| `apps/api/app/services/mri_claim_governance.py` | ~100 | Claim classification |
| `apps/api/app/services/mri_timeline.py` | ~80 | Patient timeline building |
| `apps/api/app/services/mri_registration_qa.py` | ~80 | Registration quality metrics |
| `apps/api/app/services/mri_phi_audit.py` | ~60 | PHI de-identification audit |

### Frontend Files

| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/src/pages-mri-analysis.js` | 1,523 | Main MRI analyzer page |
| `apps/web/src/mri-viewer-cs3d.js` | ~200 | Cornerstone3D viewer wrapper |
| `apps/web/src/mri-quick-preview-section.js` | ~150 | Quick preview panel |
| `apps/web/src/evidence-intelligence.js` | ~300 | Evidence drawer and chips |
| `apps/web/src/analyzer-ai-report-ui.js` | ~200 | AI report strip |

---

*Document version: 1.0*
*Last updated: 2026-07-21*
*Next review: End of Phase 1 (Week 4)*
*Owner: DeepSynaps Product Strategy Team*
