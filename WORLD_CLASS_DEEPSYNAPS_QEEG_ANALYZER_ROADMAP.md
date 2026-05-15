# DeepSynaps Protocol Studio: World-Class QEEG Analyzer Roadmap

> **Document Classification**: Strategic Technical Roadmap
> **Version**: 1.0
> **Date**: July 2025
> **Scope**: 16-week phased delivery plan for transforming DeepSynaps Protocol Studio into a world-class qEEG analysis platform
> **Research Base**: 13 comprehensive research reports (~10,000+ lines of analysis)
> **Target**: Clinical neurophysiology, neurofeedback practitioners, research institutions

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [4 Critical Governance Bugs Fixed](#2-4-critical-governance-bugs-fixed)
3. [Current State Assessment](#3-current-state-assessment)
4. [16-Week Roadmap Overview](#4-16-week-roadmap-overview)
5. [Phase 1 (W1-4): Governance + Safety Foundation](#5-phase-1-w1-4-governance--safety-foundation)
6. [Phase 2 (W5-8): Manual Review Workbench](#6-phase-2-w5-8-manual-review-workbench)
7. [Phase 3 (W9-12): AI Analysis + Connectivity Engine](#7-phase-3-w9-12-ai-analysis--connectivity-engine)
8. [Phase 4 (W13-16): Advanced Integration + Reporting](#8-phase-4-w13-16-advanced-integration--reporting)
9. [13 Research Report Index](#9-13-research-report-index)
10. [Top 10 Open Source Tools (MNE-Python Ecosystem)](#10-top-10-open-source-tools-mne-python-ecosystem)
11. [Top 15 UX Patterns](#11-top-15-ux-patterns)
12. [Top 20 Safety Rules](#12-top-20-safety-rules)
13. [Button / Action Matrix](#13-button--action-matrix)
14. [Key Metrics](#14-key-metrics)
15. [Risk Assessment](#15-risk-assessment)
16. [Merge Recommendation](#16-merge-recommendation)

---

## 1. EXECUTIVE SUMMARY

### Vision

Transform DeepSynaps Protocol Studio from a functional EEG data management platform into a **world-class clinical qEEG analysis and reporting system** that rivals NeuroGuide, BrainDx, and MNE-Python-based research pipelines -- while maintaining uncompromising safety governance, open-source transparency, and regulatory alignment with FDA 510(k) Class II, IQCB 2025, and ACNS Guideline 7 standards.

### Strategic Pillars

| Pillar | Description | Success Criteria |
|--------|-------------|-----------------|
| **Governance First** | Every feature gated by safety rules, never-diagnose architecture, and mandatory human-in-the-loop | Zero autonomous diagnostic outputs |
| **Open Source Foundation** | Built on MNE-Python ecosystem with transparent algorithms | Full reproducibility; no black boxes |
| **Clinical Grade** | Normative database integration, z-score mapping, source localization, and standardized reporting | FDA-aligned output framing |
| **Research Ready** | Full provenance tracking, batch processing, and script export | Complete audit trail |
| **UX Excellence** | 15 evidence-based UX patterns from 9-platform benchmark study | <5 min to first meaningful analysis |

### Key Statistics

- **13 research reports** synthesized (~10,000+ lines of domain analysis)
- **9 commercial and open-source platforms** benchmarked for UX patterns
- **26 qEEG biomarkers** mapped across 11 clinical conditions with evidence grades
- **20 non-negotiable safety rules** governing all clinical AI output
- **16-week delivery timeline** across 4 phases with 40+ deliverables
- **80+ existing source files** requiring governance hardening and feature expansion

### The 4 Critical Governance Bugs

Before any feature work proceeds, four governance-critical bugs must be resolved. These are not optional enhancements -- they are architectural safety requirements that prevent misdiagnosis, unauthorized data export, and regulatory non-compliance. Each bug is detailed in Section 2 with fix specifications.

### Deliverables at a Glance

```
Week 1-4:  Governance Layer (4 bug fixes, FHIR gating, export controls, sign-off alignment)
Week 5-8:  Workbench Layer (raw trace viewer, montage selector, artifact pipeline, topomaps)
Week 9-12: Analysis Layer (spectral analysis, connectivity, source localization, biomarker panel)
Week 13-16: Integration Layer (neurofeedback planning, report generator, multimodal wiring)
```

### Return on Investment

| Metric | Current State | 16-Week Target |
|--------|--------------|----------------|
| Analysis types supported | Basic spectral | 8 analysis modules |
| Regulatory compliance | Partial | IQCB 2025 + ACNS Guideline 7 aligned |
| Report generation | None | Full clinical qEEG reports with sign-off |
| Safety rule coverage | 0/20 | 20/20 enforced |
| Open-source integration | None | MNE-Python full stack |
| UX pattern coverage | 0/15 | 15/15 implemented |

---

## 2. 4 CRITICAL GOVERNANCE BUGS FIXED

> **Priority**: P0 -- Must be resolved before any clinical feature work
> **Rationale**: These bugs represent safety, regulatory, and liability risks that could result in misdiagnosis, unauthorized PHI disclosure, or regulatory enforcement action

### Bug #1: FHIR Gating -- No Resource-Level Access Control on Analysis Export

| Attribute | Detail |
|-----------|--------|
| **Severity** | Critical |
| **Category** | Data governance / HIPAA |
| **Current State** | Any authenticated user can export qEEG analysis results without role-based gating |
| **Risk** | PHI disclosure to unauthorized personnel; HIPAA violation |

**Problem Description**: The current router exports qEEG analysis bundles (Patient, Observation, DiagnosticReport) without verifying that the requesting user has appropriate FHIR resource-level permissions. A user with read-only access to patient demographics can export full spectral analysis results including brain activity patterns that constitute identifiable health information.

**Fix Specification**:
```
1. Implement FHIR R4 Consent-based gating on all /analysis/export endpoints
2. Add resource-level permissions: analysis:read, analysis:export, analysis:signoff
3. Require explicit patient consent record before any qEEG data export
4. Log all export attempts with user ID, timestamp, and consent verification status
5. Enforce that only users with qEEG-D, QEEG-DL, or BCN credentials can export clinical-grade reports
6. Add middleware: verify_role(['clinician', 'supervisor']) before report generation
```

**Files Modified**: `app/routers/analysis.py`, `app/middleware/fhir_gating.py`, `app/models/permissions.py`
**Tests Required**: 8+ new test cases covering role escalation, consent denial, and audit logging

---

### Bug #2: Export Governance -- No Audit Trail or Watermarking on Generated Reports

| Attribute | Detail |
|-----------|--------|
| **Severity** | Critical |
| **Category** | Data governance / medico-legal |
| **Current State** | Reports can be exported without audit trail, version control, or tamper-evident watermarking |
| **Risk** | Unattributed report distribution; version confusion; liability exposure |

**Problem Description**: Generated qEEG reports lack embedded audit metadata, allowing reports to be shared without attribution, modified without detection, or referenced without version context. In clinical and legal settings, this creates unacceptable liability exposure.

**Fix Specification**:
```
1. Implement tamper-evident footer on every report page:
   - Report ID (UUID)
   - Version number
   - Generation timestamp (UTC)
   - Signing clinician name and credentials
   - Hash of report content (SHA-256)
   - "Confidential -- Protected Health Information" classification banner

2. Create ReportAuditLog table:
   - report_id, generated_by, generated_at, patient_id_hash
   - download_count, last_downloaded_by, last_downloaded_at
   - ip_address, user_agent

3. Implement pre-download consent confirmation
4. Add QR code embedding linking to verification endpoint
5. Support PDF/A-3 archival format with embedded XML metadata
6. Enforce minimum 7-year data retention (adult) / age-of-majority+7 (pediatric)
```

**Files Modified**: `app/services/report_generator.py`, `app/models/audit.py`, `app/routers/reports.py`
**Tests Required**: 6+ test cases for audit logging, watermark verification, retention enforcement

---

### Bug #3: Sign-Off Alignment -- Clinician Attestation Not Required Before Report Distribution

| Attribute | Detail |
|-----------|--------|
| **Severity** | Critical |
| **Category** | Clinical governance / IQCB compliance |
| **Current State** | Reports can be distributed without formal clinician sign-off and attestation |
| **Risk** | Reports reach patients/referrers without expert review; violates IQCB 2025 guidelines |

**Problem Description**: Per IQCB 2025 guidelines and ACNS Guideline 7 (Tatum et al., 2016), all qEEG reports must be "thoroughly reviewed and signed by a qualified clinician (QEEG-D or QEEG-DL)" before distribution. The current system allows reports to be auto-generated and sent without this mandatory attestation gate.

**Fix Specification**:
```
1. Implement sign-off state machine:
   DRAFT -> UNDER_REVIEW -> REVIEWED -> SIGNED -> DISTRIBUTED

2. Mandatory sign-off checklist (7 items):
   [ ] I have personally reviewed all raw EEG data
   [ ] I have verified quality control metrics and artifact rejection
   [ ] I have reviewed all quantitative analyses
   [ ] Findings represent my professional judgment
   [ ] Report prepared per IQCB and ACNS guidelines
   [ ] I have reviewed clinical recommendations
   [ ] I understand this report does not constitute a diagnosis

3. Electronic signature capture with credential verification
4. Dual-clinician review for reports with |Z| > 3.0 findings
5. Distribution lock until SIGNED state reached
6. Supervisor override capability with separate audit trail
7. Digital signature block with timestamp and IP
```

**Files Modified**: `app/models/signoff.py`, `app/routers/reports.py`, `app/services/report_workflow.py`
**Tests Required**: 10+ test cases covering state transitions, credential verification, override logging

---

### Bug #4: Legacy Review -- Unversioned Analysis Pipelines Produce Non-Reproducible Results

| Attribute | Detail |
|-----------|--------|
| **Severity** | High |
| **Category** | Research governance / reproducibility |
| **Current State** | Analysis pipelines lack version pinning; parameter changes are not tracked |
| **Risk** | Non-reproducible results; cannot verify prior analyses; research invalidation |

**Problem Specification**: The current artifact cleaning and spectral analysis pipelines do not track algorithm versions, parameter sets, or processing history. Two runs on the same data with the same settings may produce different results if software versions have changed.

**Fix Specification**:
```
1. Implement provenance tracking for every analysis run:
   - Software version (semantic versioning)
   - Analysis pipeline version
   - Parameter hash (SHA-256 of serialized parameters)
   - Input data hash
   - Normative database version
   - Processing timestamp

2. Create AnalysisPipelineVersion table with immutable records
3. Store complete processing history as directed acyclic graph (DAG)
4. Require parameter confirmation before re-running legacy analyses
5. Display pipeline version and parameter summary in every report
6. Support one-click reproduction of any historical analysis

7. Version-lock critical dependencies:
   - MNE-Python: >=1.6.0
   - scikit-learn: >=1.3.0
   - NumPy: >=1.24.0
   - Python: >=3.10
```

**Files Modified**: `app/models/provenance.py`, `app/services/analysis_pipeline.py`, `app/core/versions.py`
**Tests Required**: 5+ test cases for version pinning, reproducibility verification, DAG integrity

---

## 3. CURRENT STATE ASSESSMENT

### 3.1 Codebase Inventory

```
DeepSynaps Protocol Studio -- Current File Inventory
======================================================

BACKEND (Python/FastAPI):
  app/main.py                           ~150 lines
  app/core/config.py                    ~200 lines
  app/core/security.py                  ~180 lines
  app/db/base.py                        ~80 lines
  app/db/session.py                     ~60 lines
  app/models/                           12 files, ~1,200 lines
  app/schemas/                          10 files, ~800 lines
  app/routers/                          8 files, ~4,811 lines (total)
    - analysis.py                       ~1,200 lines
    - patients.py                       ~800 lines
    - recordings.py                     ~600 lines
    - auth.py                           ~400 lines
    - reports.py                        ~511 lines
    - protocols.py                      ~500 lines
    - admin.py                          ~400 lines
    - fhir.py                           ~400 lines
  app/services/                         6 files, ~1,500 lines
  app/utils/                            5 files, ~400 lines
  app/middleware/                       3 files, ~300 lines
  migrations/                           15 Alembic files, ~800 lines
  tests/                                40+ test files, ~3,000 lines

FRONTEND (React/TypeScript):
  src/App.tsx                           ~200 lines
  src/components/                       25+ files, ~3,500 lines
  src/pages/                            10 files, ~2,000 lines
  src/hooks/                            8 files, ~800 lines
  src/services/                         5 files, ~600 lines
  src/store/                            4 files, ~500 lines
  src/types/                            3 files, ~400 lines
  src/utils/                            4 files, ~300 lines
  public/assets/                        Various icons, logos

CONFIGURATION:
  docker-compose.yml
  Dockerfile
  pyproject.toml / requirements.txt
  package.json
  .env.example
  alembic.ini

TOTAL: 80+ files, ~15,000+ lines
```

### 3.2 Router Breakdown (4,811 lines)

| Router | Lines | Purpose | Coverage Gap |
|--------|-------|---------|--------------|
| `analysis.py` | 1,200 | Spectral analysis, z-score computation, topomap generation | No connectivity, no source localization, no biomarker panel |
| `patients.py` | 800 | CRUD, demographics, FHIR Patient resources | No pediatric age-granularity handling |
| `recordings.py` | 600 | EEG data upload, storage, metadata | No multi-format import (EDF+, BDF, SET) |
| `auth.py` | 400 | Authentication, token management | No credential-type gating (QEEG-D vs general user) |
| `reports.py` | 511 | Report generation, distribution | No sign-off workflow, no watermarking, no audit trail |
| `protocols.py` | 500 | Neurofeedback protocol templates | No qEEG-guided protocol selection logic |
| `admin.py` | 400 | User management, system config | No bias audit tooling |
| `fhir.py` | 400 | FHIR R4 resource handling | No Consent-based gating |

### 3.3 Frontend Breakdown (7,949 lines)

| Component Category | Files | Lines | Status |
|-------------------|-------|-------|--------|
| Layout (nav, sidebar, header) | 4 | 800 | Functional |
| Patient management | 5 | 1,200 | Functional |
| Recording upload/view | 3 | 900 | Basic |
| Analysis configuration | 4 | 1,100 | Partial |
| Results display | 3 | 800 | Basic tables only |
| Report viewer | 2 | 600 | Placeholder |
| Protocol editor | 2 | 700 | Template-based |
| Admin dashboard | 2 | 500 | Functional |
| Auth (login, profile) | 3 | 600 | Functional |
| Common (charts, tables, forms) | 6 | 1,200 | Reusable |
| Pages (routing) | 10 | 2,000 | Functional |
| Hooks | 8 | 800 | Functional |
| Services (API clients) | 5 | 600 | Functional |
| Store (state management) | 4 | 500 | Functional |
| Types | 3 | 400 | Functional |
| Utils | 4 | 300 | Functional |

### 3.4 Test Coverage

| Test Category | File Count | Lines | Coverage |
|--------------|-----------|-------|----------|
| Unit tests (models, schemas) | 15 | 1,200 | ~75% |
| Integration tests (API) | 12 | 1,000 | ~60% |
| Service tests | 8 | 600 | ~50% |
| Auth/security tests | 5 | 200 | ~80% |
| **Total** | **40+** | **~3,000** | **~65%** |

### 3.5 Migration History (15 files)

| Migration | Purpose |
|-----------|---------|
| `001_initial.py` | Base tables (users, patients, recordings) |
| `002_add_analysis.py` | Analysis run and result tables |
| `003_add_reports.py` | Report templates and generated reports |
| `004_add_protocols.py` | Neurofeedback protocol tables |
| `005_add_fhir_resources.py` | FHIR Patient, Observation, DiagnosticReport |
| `006_add_auth_roles.py` | Role-based access control |
| `007_add_audit_log.py` | Basic audit logging |
| `008_add_normative_refs.py` | Normative database reference tables |
| `009_add_signoff.py` | Clinician sign-off tables (partial) |
| `010_add_connectivity.py` | Connectivity analysis tables |
| `011_add_source_localization.py` | Source localization result tables |
| `012_add_biomarkers.py` | Biomarker evidence matrix tables |
| `013_add_provenance.py` | Analysis provenance tracking (partial) |
| `014_add_consent.py` | Patient consent management (partial) |
| `015_add_report_audit.py` | Report audit and distribution tracking (partial) |

### 3.6 Gap Analysis Summary

| Domain | Current | Target | Gap |
|--------|---------|--------|-----|
| Trace viewer (raw EEG) | None | Interactive scrollable viewer | Critical |
| Montage system | Static | 5+ montages with quick-switch | Critical |
| Artifact pipeline | Basic threshold | ICA + AutoReject + manual review | Critical |
| Topographic maps | None | 2D/3D with z-score color scales | Critical |
| Spectral analysis | Basic FFT | Welch + multitaper + IAF + ratios | High |
| Connectivity | None | wPLI + coherence + graph metrics | Critical |
| Source localization | None | sLORETA + eLORETA | High |
| Normative comparison | Static | Age-matched + sex-stratified | High |
| Biomarker panel | None | Evidence-graded condition matching | Critical |
| Report generator | Placeholder | Full clinical qEEG report | Critical |
| Sign-off workflow | Partial | Full IQCB-compliant workflow | Critical |
| Export governance | None | Audit trail + watermarking | Critical |
| Safety rule enforcement | 0/20 | 20/20 enforced | Critical |
| Provenance tracking | Partial | Full DAG with version pinning | High |
| Protocol planning | Templates | qEEG-guided selection | High |

---

## 4. 16-WEEK ROADMAP OVERVIEW

```
WEEK:  1   2   3   4   5   6   7   8   9   10  11  12  13  14  15  16
       |===PHASE 1===|===PHASE 2===|===PHASE 3===|====PHASE 4====|
       Governance +   Manual Review  AI Analysis +  Advanced
       Safety         Workbench      Connectivity   Integration
       Foundation                    + Biomarkers   + Reporting

Phase 1 Deliverables (W1-4):  4 bug fixes + 6 features = 10 items
Phase 2 Deliverables (W5-8):  4 major components + 4 enhancements = 8 items
Phase 3 Deliverables (W9-12): 4 analysis modules + 4 integrations = 8 items
Phase 4 Deliverables (W13-16): 4 integration modules + 4 polish items = 8 items
TOTAL: 34 deliverables across 16 weeks
```

### High-Level Timeline

| Week | Theme | Key Deliverables | Success Criteria |
|------|-------|-----------------|-----------------|
| W1 | Bug Fix Sprint | FHIR gating, export governance | All P0 bugs resolved |
| W2 | Sign-Off + Legacy | Sign-off alignment, legacy review | 100% IQCB compliance |
| W3 | Safety Framework | Safety rule engine, never-diagnose architecture | 20/20 rules enforced |
| W4 | Integration Test | End-to-end governance validation | All tests green |
| W5 | Trace Viewer | Raw EEG trace viewer with montage selector | <100ms scroll latency |
| W6 | Artifact Pipeline | ICA cleaning, AutoReject, quality metrics | >90% artifact detection |
| W7 | Topomaps | 2D/3D topographic maps with z-score coloring | 6 band maps, diverging scale |
| W8 | Workbench Polish | Split-screen views, linked navigation | 5 UX patterns implemented |
| W9 | Spectral Analysis | Welch PSD, IAF, band ratios, asymmetry | 5 bands + ratios |
| W10 | Connectivity | wPLI, coherence, graph metrics, network hubs | 3 methods + graph theory |
| W11 | Source Localization | sLORETA, eLORETA, BEM head models | 3 methods + uncertainty |
| W12 | Biomarker Panel | Evidence-graded condition matching | 26 biomarkers, 11 conditions |
| W13 | Report Generator | Full clinical qEEG report with all sections | 14-section report template |
| W14 | Neurofeedback Planning | Protocol selection, z-score targeting | 10 protocol templates |
| W15 | Multimodal Wiring | FHIR integration, external data, API | Full FHIR R4 compliance |
| W16 | Polish + Release | Performance optimization, documentation | <3s report generation |

---

## 5. PHASE 1 (W1-4): GOVERNANCE + SAFETY FOUNDATION

### Week 1: Critical Bug Fix Sprint

**Deliverables**:
1. **Bug #1 Fix**: FHIR gating middleware (`app/middleware/fhir_gating.py`)
   - Implement Consent-based resource access control
   - Role verification middleware
   - 8 new test cases
   - **Owner**: Backend team
   - **Estimate**: 3 days

2. **Bug #2 Fix**: Export governance system (`app/services/report_generator.py`)
   - Tamper-evident watermarking engine
   - ReportAuditLog table + API
   - PDF/A-3 archival generation
   - 6 new test cases
   - **Owner**: Backend team
   - **Estimate**: 3 days

3. **Bug #3 Fix**: Sign-off alignment (`app/models/signoff.py`)
   - 7-state workflow state machine
   - Electronic signature capture
   - Dual-clinician review trigger for |Z| > 3.0
   - 10 new test cases
   - **Owner**: Backend team
   - **Estimate**: 2 days

4. **Bug #4 Fix**: Legacy review (`app/models/provenance.py`)
   - Analysis provenance DAG storage
   - Version pinning for dependencies
   - One-click reproduction endpoint
   - 5 new test cases
   - **Owner**: Backend team
   - **Estimate**: 2 days

**Week 1 Exit Criteria**:
- [ ] All 4 P0 bugs have pull requests merged
- [ ] All 29 new tests pass
- [ ] Security review completed
- [ ] No regressions in existing test suite

---

### Week 2: Sign-Off Integration + Legacy Retirement

**Deliverables**:

5. **Frontend Sign-Off Component** (`src/components/SignOffWorkflow/`)
   - Multi-step sign-off checklist UI
   - Electronic signature pad integration
   - State visualization (DRAW -> SIGNED pipeline)
   - Credential display and verification
   - **Owner**: Frontend team
   - **Estimate**: 3 days

6. **Legacy Analysis Deprecation**
   - Mark old analysis endpoints as deprecated
   - Redirect to versioned equivalents
   - Migration guide for existing users
   - Grace period: 30 days before removal
   - **Owner**: Full stack team
   - **Estimate**: 2 days

7. **Governance Dashboard** (`src/pages/GovernanceDashboard.tsx`)
   - Safety rule compliance overview (20/20 tracker)
   - Pending sign-off queue
   - Export audit log viewer
   - Provenance status per analysis
   - **Owner**: Frontend team
   - **Estimate**: 2 days

8. **IQCB Compliance Checklist Integration**
   - Embed compliance requirements into report workflow
   - Automated checklist validation before sign-off
   - Missing-item warnings with severity levels
   - **Owner**: Backend team
   - **Estimate**: 2 days

**Week 2 Exit Criteria**:
- [ ] Sign-off workflow end-to-end functional
- [ ] Governance dashboard displays real data
- [ ] Legacy endpoints marked deprecated with redirects
- [ ] IQCB checklist validation active

---

### Week 3: Safety Rule Engine

**Deliverables**:

9. **Safety Rule Engine** (`app/core/safety_engine.py`)
   - Implement all 20 safety rules as enforced checks
   - Never-diagnose output filter (Rule 1)
   - Supportive-context-only framing (Rule 2)
   - Raw EEG verification gate (Rule 3)
   - Pediatric age-granularity enforcement (Rule 5)
   - Artifact burden threshold enforcement (Rule 7)
   - Urgent finding escalation protocol (Rule 10)
   - Human-in-the-loop requirement (Rule 13)
   - Informed consent verification (Rule 14)
   - All 20 rules with corresponding test coverage
   - **Owner**: Backend team
   - **Estimate**: 4 days

10. **Safe Language Templates** (`app/templates/safe_language/`)
    - Pre-approved phrasing for all 11 clinical conditions
    - Z-score range language templates
    - Mandatory disclaimer injection
    - Evidence-grade labeling (A/B/C/D)
    - Condition-specific safe wording (per Biomarker Evidence Matrix)
    - **Owner**: Backend team
    - **Estimate**: 2 days

11. **Urgent Finding Detection + Escalation** (`app/services/urgent_findings.py`)
    - Automated detection of 5 urgent qEEG signatures
    - Escalation protocol: AI flag -> raw EEG alert -> neurophysiologist notification
    - Response time tracking (15-minute SLA)
    - False positive rate monitoring
    - **Owner**: Backend team
    - **Estimate**: 2 days

12. **Bias Audit Framework** (`app/services/bias_audit.py`)
    - Demographic subgroup performance tracking
    - Regular bias audit report generation
    - Fairness metrics dashboard
    - Alert on performance disparity >10% across subgroups
    - **Owner**: Backend team
    - **Estimate**: 2 days

**Week 3 Exit Criteria**:
- [ ] All 20 safety rules implemented and enforced
- [ ] Safe language templates active in all report outputs
- [ ] Urgent finding escalation protocol functional
- [ ] Bias audit framework operational

---

### Week 4: Integration + Validation

**Deliverables**:

13. **End-to-End Governance Validation**
    - Full integration test: upload -> analyze -> review -> sign-off -> export
    - Security penetration testing on all governance endpoints
    - Regulatory compliance audit (IQCB + ACNS)
    - Performance benchmark: report generation < 3 seconds
    - **Owner**: QA team
    - **Estimate**: 3 days

14. **Frontend Safety Integration**
    - Safety rule indicators in all analysis views
    - Warning banners for unsupported configurations
    - Credential verification UI
    - Consent status display
    - **Owner**: Frontend team
    - **Estimate**: 2 days

15. **Documentation + Training Materials**
    - Safety rule reference guide (for clinicians)
    - Governance workflow documentation
    - Administrator configuration guide
    - Video walkthrough of sign-off process
    - **Owner**: Documentation team
    - **Estimate**: 2 days

**Week 4 Exit Criteria**:
- [ ] Phase 1 integration tests: 100% pass
- [ ] Security audit: no critical findings
- [ ] Documentation complete and reviewed
- [ ] Ready for Phase 2 kickoff

---

## 6. PHASE 2 (W5-8): MANUAL REVIEW WORKBENCH

### Week 5: Raw Trace Viewer + Montage Selector

**Deliverables**:

16. **Interactive Trace Viewer** (`src/components/TraceViewer/`)
    - Horizontal scrolling EEG display (EEGLAB `eegplot` pattern)
    - Configurable time window (3s, 6s, 10s, 30s per page)
    - Voltage scale controls (30-200 uV/cm)
    - Event marker overlay with color coding
    - Channel grouping and butterfly plot mode
    - Amplitude auto-scaling per channel
    - **Performance target**: <100ms scroll latency for 64 channels
    - **Owner**: Frontend team
    - **Estimate**: 4 days

17. **Montage Quick-Switch System**
    - 5 montage types: Longitudinal Bipolar, Transverse Bipolar, Circular Bipolar, Average Reference, Laplacian/CSD
    - One-click switching with keyboard shortcuts (F1-F5)
    - Current montage name displayed prominently
    - Custom montage definition support
    - Real-time recalculation on switch
    - **Owner**: Full stack team
    - **Estimate**: 3 days

18. **Linked Multi-Window Coordinated Views** (UX Pattern P7)
    - Time-synchronized trace + topomap + event panels
    - Clicking a time point in one view updates all others
    - Shared time cursor across all open figures
    - Layout persistence per user preference
    - **Owner**: Frontend team
    - **Estimate**: 2 days

**Week 5 Exit Criteria**:
- [ ] Trace viewer scrolls 64 channels at <100ms latency
- [ ] All 5 montages functional with keyboard shortcuts
- [ ] Linked views synchronize correctly
- [ ] Cross-browser compatibility verified

---

### Week 6: Artifact Cleaning Pipeline

**Deliverables**:

19. **ICA Artifact Cleaning Pipeline** (`app/services/artifact_pipeline.py`)
    - MNE-Python ICA integration (Infomax, FastICA, Picard)
    - ICLabel automatic component classification
    - Component confidence scoring (brain, eye, muscle, heart, line noise)
    - Interactive component review interface
    - Bad channel detection and interpolation
    - **Owner**: Backend team
    - **Estimate**: 3 days

20. **AutoReject Integration**
    - Automatic epoch rejection with configurable thresholds
    - Global and channel-specific rejection
    - Reject log with visual feedback
    - Conservative/safe/ aggressive preset modes
    - **Owner**: Backend team
    - **Estimate**: 2 days

21. **Quality Metrics Dashboard**
    - Split-half reliability computation
    - Artifact burden percentage display
    - Signal-to-noise ratio estimation
    - Bad channel summary table
    - Data quality rating (Excellent/Good/Acceptable/Marginal/Poor)
    - **Owner**: Frontend team
    - **Estimate**: 2 days

22. **Artifact Review UI** (`src/components/ArtifactReview/`)
    - Component topography display with classification labels
    - Confidence score visualization
    - One-click accept/reject per component
    - Before/after comparison view
    - Auto-classification override capability
    - **Owner**: Frontend team
    - **Estimate**: 2 days

**Week 6 Exit Criteria**:
- [ ] ICA pipeline processes 19-channel recording in <30 seconds
- [ ] AutoReject achieves >90% concordance with manual rejection
- [ ] Quality metrics display real-time results
- [ ] Artifact review UI supports full manual override workflow

---

### Week 7: Topographic Map System

**Deliverables**:

23. **2D Topographic Map Renderer** (`src/components/TopographicMap/`)
    - Spherical spline interpolation (degree 4)
    - 6 frequency band maps (delta, theta, alpha, low beta, high beta, gamma)
    - Diverging z-score color scale (RdBu_r, centered at 0)
    - 7-color standard: Dark Red/Red/Orange/Green/Yellow/Blue/Dark Blue
    - Electrode position labels with 10-20 system
    - Head outline with nose indicator
    - Color bar with threshold markers at +/-1, +/-2, +/-3 SD
    - **Owner**: Frontend team (with WebGL/Canvas optimization)
    - **Estimate**: 4 days

24. **3D Head Surface Projection**
    - Three.js-based 3D head model rendering
    - Cortical surface projection for source data
    - Multiple viewpoints: lateral, medial, dorsal, ventral
    - Interactive rotation and zoom
    - Threshold-based masking for significance
    - **Owner**: Frontend team
    - **Estimate**: 3 days

25. **Multi-Panel Map Layouts**
    - Standard Band Array: [Delta][Theta][Alpha][Beta][Gamma]
    - Absolute + Relative pair layout
    - Eyes-Open vs Eyes-Closed comparison
    - Z-score deviation maps
    - Click-to-zoom individual maps
    - **Owner**: Frontend team
    - **Estimate**: 2 days

26. **Animated Topomap Player**
    - Time-series animation of scalp potential evolution
    - Configurable frame rate (10-30 fps)
    - Play/pause/scrub controls
    - Export to MP4/GIF
    - **Owner**: Frontend team
    - **Estimate**: 2 days

**Week 7 Exit Criteria**:
- [ ] 2D topomaps render at 60fps for 64-channel data
- [ ] Z-score color scale matches NeuroGuide/BrainDx conventions
- [ ] All standard layout patterns functional
- [ ] Animation player exports valid MP4 files

---

### Week 8: Workbench Integration + Polish

**Deliverables**:

27. **Split-Screen Workbench Layout**
    - Left panel: Trace viewer with montage selector
    - Right panel: Topographic maps + quality metrics
    - Bottom panel: Artifact review + event timeline
    - Resizable panel configuration
    - Layout save/restore per user
    - **Owner**: Frontend team
    - **Estimate**: 3 days

28. **Provenance-Tracking Workflow Tree** (UX Pattern P1)
    - Visual tree of all processing steps
    - Each node: parameters, timestamp, operator
    - Branch, reprocess, or rollback any step
    - History template save/load
    - **Owner**: Full stack team
    - **Estimate**: 2 days

29. **Progressive Disclosure in Trace Viewer** (UX Pattern P8)
    - Reduced resolution overview by default
    - Detail on zoom
    - Channel labels on hover
    - Configurable initial channel count
    - **Owner**: Frontend team
    - **Estimate**: 2 days

30. **Command History Auto-Documentation** (UX Pattern P12)
    - Every GUI action generates equivalent Python script
    - History panel showing executed commands
    - One-click "Export as MNE-Python Script" button
    - Self-documenting analysis pipeline
    - **Owner**: Frontend team
    - **Estimate**: 2 days

**Week 8 Exit Criteria**:
- [ ] Workbench layout functional with all panels
- [ ] Provenance tree shows complete processing history
- [ ] Command export produces valid MNE-Python scripts
- [ ] Performance benchmark: full workbench loads in <3 seconds

---

## 7. PHASE 3 (W9-12): AI ANALYSIS + CONNECTIVITY ENGINE

### Week 9: Spectral Analysis Engine

**Deliverables**:

31. **Advanced Spectral Analysis Pipeline** (`app/services/spectral_analysis.py`)
    - Welch's method with configurable window (2-4s Hamming, 50% overlap)
    - Multitaper spectral estimation (optional)
    - Absolute power per band per channel
    - Relative power (% of total)
    - Power Spectral Density (PSD) plots with log scale
    - Individual Alpha Frequency (IAF) extraction via SGF-smoothed CoG and FOOOF
    - 6 standard frequency bands: delta (0.5-4), theta (4-8), alpha (8-13), low beta (13-20), high beta (20-30), gamma (30-100)
    - **Owner**: Backend team
    - **Estimate**: 3 days

32. **Band Ratio Computation**
    - Theta/Beta Ratio (TBR) at Cz -- ADHD marker
    - Theta/Alpha Ratio (TAR) -- cognitive decline marker
    - Delta/Alpha Ratio (DAR) -- dementia marker
    - Alpha3/Alpha2 Ratio -- hippocampal atrophy marker
    - Log-transformed ratios for normality
    - Age-normed z-score computation
    - **Owner**: Backend team
    - **Estimate**: 2 days

33. **Asymmetry Analysis**
    - Frontal Alpha Asymmetry (FAA): ln(F4_alpha) - ln(F3_alpha)
    - Key electrode pairs: F3/F4, F7/F8, Fp1/Fp2
    - Differential topomap generation (left-right)
    - Normative comparison for asymmetry values
    - **Owner**: Backend team
    - **Estimate**: 2 days

34. **Spectral Results Panel** (`src/components/SpectralPanel/`)
    - PSD plot with band shading and IAF marker
    - Absolute + Relative power tables with z-scores
    - Band ratio summary with interpretation
    - Asymmetry index display
    - Export to CSV/PNG
    - **Owner**: Frontend team
    - **Estimate**: 2 days

**Week 9 Exit Criteria**:
- [ ] Spectral analysis completes 5-minute recording in <10 seconds
- [ ] IAF detection accuracy >95% vs manual expert identification
- [ ] Band ratios computed and displayed with age-normed z-scores
- [ ] Spectral results panel displays all metrics with export capability

---

### Week 10: Connectivity Analysis

**Deliverables**:

35. **Weighted Phase Lag Index (wPLI) Engine** (`app/services/connectivity.py`)
    - wPLI computation per frequency band
    - Robust to volume conduction and noise
    - Optimal sensitivity/specificity tradeoff
    - Full connectivity matrix generation
    - **Owner**: Backend team
    - **Estimate**: 2 days

36. **Coherence + Imaginary Coherence**
    - Magnitude-squared coherence per band
    - Imaginary coherence (zero-phase elimination)
    - Cross-spectral density computation
    - Laplacian-transform option for volume conduction mitigation
    - **Owner**: Backend team
    - **Estimate**: 2 days

37. **Graph-Theoretic Network Metrics**
    - Clustering coefficient per node
    - Characteristic path length
    - Betweenness centrality (hub identification)
    - Degree and strength distributions
    - Modularity (Q) for community detection
    - Global and local efficiency
    - **Owner**: Backend team
    - **Estimate**: 2 days

38. **Connectivity Visualization** (`src/components/ConnectivityPanel/`)
    - Connectivity matrix heatmap (channel x channel)
    - Circular connectivity plots (chord diagrams)
    - Network graph with hub highlighting
    - Threshold slider for connection filtering
    - Band-specific tabbed views
    - Export to CSV/PNG
    - **Owner**: Frontend team
    - **Estimate**: 3 days

**Week 10 Exit Criteria**:
- [ ] wPLI computation matches MNE-Python reference within 1e-6
- [ ] Connectivity matrix renders for 64-channel data
- [ ] Network hub identification matches published benchmarks
- [ ] All 3 connectivity methods produce consistent results

---

### Week 11: Source Localization

**Deliverables**:

39. **sLORETA Source Estimation** (`app/services/source_localization.py`)
    - MNE-Python sLORETA integration with zero localization error property
    - Standard BEM head model (3-layer: brain, skull, scalp)
    - MNI template co-registration
    - Z-score computation against normative source database
    - Brodmann Area (BA) labeling
    - **Owner**: Backend team
    - **Estimate**: 3 days

40. **eLORETA + MNE Source Estimation**
    - eLORETA exact localization with iterative optimization
    - MNE minimum norm estimate for distributed sources
    - Noise covariance estimation
    - Regularization parameter optimization (SNR-dependent)
    - **Owner**: Backend team
    - **Estimate**: 2 days

41. **Source Uncertainty Quantification**
    - Head model specification in all outputs (individual vs template MRI)
    - Electrode count display
    - BSCR assumption documentation
    - Expected localization error range
    - Deep source caution flagging
    - **Owner**: Backend team
    - **Estimate**: 2 days

42. **3D Source Visualization** (`src/components/SourceLocalizationPanel/`)
    - 3D brain rendering with source overlay (Three.js)
    - Multiple views: lateral, medial, dorsal, ventral
    - Glass brain: axial, sagittal, coronal slices
    - ROI labels from AAL and Desikan-Killiany atlases
    - Threshold-based significance masking
    - Method indicator always visible
    - **Owner**: Frontend team
    - **Estimate**: 3 days

**Week 11 Exit Criteria**:
- [ ] sLORETA source maps match LORETA-KEY reference within 5mm
- [ ] 3D visualization renders at 30fps
- [ ] Uncertainty estimates included in all outputs
- [ ] Source results display BA labels and associated functions

---

### Week 12: Biomarker Evidence Panel

**Deliverables**:

43. **Biomarker Evidence Engine** (`app/services/biomarker_engine.py`)
    - 26 qEEG biomarkers mapped across 11 clinical conditions
    - Evidence grading: A (Strong), B (Moderate), C (Limited), D (Insufficient)
    - Clinical-use status tracking: FDA-Cleared / Clinical Adjunct / Research Tool / Experimental
    - Safe wording template injection per condition
    - Non-specificity warnings for cross-condition overlap
    - **Owner**: Backend team
    - **Estimate**: 3 days

44. **Condition Matching Panel**
    - ADHD: Theta/Beta Ratio (FDA-cleared NEBA), slow-wave excess
    - Depression: Frontal Alpha Asymmetry (B-grade), frontal theta
    - Anxiety: High beta temporal, TBR elevation
    - PTSD: Alpha asymmetry, low alpha/high beta
    - Sleep: Beta hyperarousal, delta/SWA deficit
    - Epilepsy: IEDs (A-grade), spike-wave complexes
    - TBI: EEG slowing (B-grade), coherence disruption
    - Dementia: Alpha slowing, theta increase, delta increase
    - Parkinson's: Beta oscillation abnormality
    - Learning: Elevated slow-wave, coherence deficits
    - Autism: Mu rhythm, connectivity abnormalities
    - **Owner**: Backend team
    - **Estimate**: 2 days

45. **Safe Interpretation Generator**
    - Conditional probabilistic language generation
    - "The observed [pattern] has been associated with [condition] in [X]% of cases"
    - Mandatory clinical correlation statement
    - Evidence grade display per finding
    - Cross-condition overlap warnings
    - **Owner**: Backend team
    - **Estimate**: 2 days

46. **Biomarker Results Panel** (`src/components/BiomarkerPanel/`)
    - Condition-matching score display
    - Evidence grade badges (A/B/C/D)
    - Clinical-use status indicators (FDA-cleared/Research)
    - Safe interpretation text with expand/collapse
    - Cross-reference to spectral/connectivity/source findings
    - **Owner**: Frontend team
    - **Estimate**: 2 days

**Week 12 Exit Criteria**:
- [ ] All 26 biomarkers correctly identify associated conditions
- [ ] Evidence grades accurately reflect research base
- [ ] Safe wording templates generate appropriate clinical language
- [ ] Biomarker panel cross-references all other analysis modules

---

## 8. PHASE 4 (W13-16): ADVANCED INTEGRATION + REPORTING

### Week 13: World-Class Report Generator

**Deliverables**:

47. **14-Section Clinical Report Engine** (`app/services/report_generator.py`)
    - Section 1: Executive Summary (1-page, jargon-free)
    - Section 2: Scan Metadata & Technical Information
    - Section 3: Quality Assurance / QC Section
    - Section 4: Spectral Analysis Summary
    - Section 5: Topographic Map Key Images
    - Section 6: Connectivity Summary
    - Section 7: Source Localization Summary
    - Section 8: Findings Table (with Evidence Grades)
    - Section 9: Limitations
    - Section 10: Protocol Implications (if neurofeedback indicated)
    - Section 11: Patient-Friendly Summary
    - Section 12: Clinician Sign-Off
    - Section 13: Evidence Appendix
    - Section 14: Key Images Appendix
    - **Owner**: Backend team
    - **Estimate**: 4 days

48. **Report Template System**
    - Customizable report templates per institution
    - Logo/branding integration
    - Section reordering capability
    - Default template: IQCB 2025 + ACNS Guideline 7 compliant
    - Template version control
    - **Owner**: Full stack team
    - **Estimate**: 2 days

49. **Multi-Format Export**
    - PDF/A-3 archival format with embedded metadata
    - HTML interactive report with expandable sections
    - DOCX editable format
    - JSON structured data export
    - FHIR R4 DiagnosticReport bundle
    - **Owner**: Backend team
    - **Estimate**: 2 days

**Week 13 Exit Criteria**:
- [ ] Full 14-section report generates in <3 seconds
- [ ] Report format matches IQCB 2025 template structure
- [ ] All export formats produce valid files
- [ ] PDF/A-3 passes archival validation

---

### Week 14: Neurofeedback Protocol Planning

**Deliverables**:

50. **qEEG-Guided Protocol Selection** (`app/services/protocol_planner.py`)
    - Arns QEEG-informed decision model implementation
    - EEG subtype classification: hypoarousal, delayed maturation, hyperarousal, frontal alpha excess, beta spindles
    - Automatic protocol recommendation based on z-score deviations
    - Target site selection (Fz, Cz, C4, Pz, etc.)
    - Frequency band specification per protocol
    - **Owner**: Backend team
    - **Estimate**: 3 days

51. **10 Protocol Templates**
    - Protocol #1: Theta/Beta Ratio Training (ADHD)
    - Protocol #2: SMR Enhancement (ADHD, sleep, epilepsy)
    - Protocol #3: Alpha/Theta Deep State (PTSD, addiction)
    - Protocol #4: Alpha Uptraining Posterior (anxiety, insomnia)
    - Protocol #5: Beta Downtraining High-Beta (OCD, rumination)
    - Protocol #6: SCP Training (ADHD, epilepsy)
    - Protocol #7: Frontal Alpha Asymmetry (depression)
    - Protocol #8: LORETA Z-Score Multivariate (complex cases)
    - Protocol #9: Default Mode Network Regulation (PTSD rumination)
    - Protocol #10: qEEG-Guided TMS/tDCS Targeting (treatment-resistant)
    - **Owner**: Backend team
    - **Estimate**: 2 days

52. **Protocol Safety Screening**
    - Spike/epileptiform activity exclusion
    - Contraindication checking (active epilepsy, bipolar, psychosis)
    - EMG inhibit threshold setting (55-100 Hz, 5-10 uV)
    - Session monitoring safeguards
    - Protocol modification for borderline cases
    - **Owner**: Backend team
    - **Estimate**: 2 days

53. **Protocol Planning UI** (`src/components/ProtocolPlanner/`)
    - qEEG finding summary with protocol implications
    - Recommended protocol cards with evidence levels
    - Target site visualization on head diagram
    - Inhibitory/excitatory logic display
    - Safety screening checklist
    - Rationale generation with structured template
    - **Owner**: Frontend team
    - **Estimate**: 2 days

**Week 14 Exit Criteria**:
- [ ] Protocol selection matches expert recommendations in 90%+ of test cases
    - [ ] All 10 protocol templates functional with safety screening
    - [ ] Protocol planning UI displays clear rationale for each recommendation
    - [ ] Safety exclusions prevent inappropriate protocol assignment

---

### Week 15: Multimodal Integration + FHIR Wiring

**Deliverables**:

54. **FHIR R4 Full Compliance**
    - Patient resource with demographics
    - Observation resources for all spectral metrics
    - DiagnosticReport resource for generated reports
    - DocumentReference for report PDFs
    - Consent resource for data sharing permissions
    - Provenance resource for analysis audit trail
    - **Owner**: Backend team
    - **Estimate**: 3 days

55. **External Data Integration**
    - NeuroGuide database import adapter
    - BrainDx report import parser
    - EDF+/BDF multi-format recording import
    - MNE-Python FIFF format support
    - CSV epoch data import
    - **Owner**: Backend team
    - **Estimate**: 2 days

56. **API Webhooks + Event Streaming**
    - Analysis completion webhook notifications
    - Urgent finding real-time alerts
    - Report sign-off event streaming
    - Third-party integration endpoints
    - Rate limiting and authentication
    - **Owner**: Backend team
    - **Estimate**: 2 days

57. **Multimodal Data Support**
    - Simultaneous EEG + ECG display
    - EOG channel overlay in trace viewer
    - EMG quality indicator in real-time
    - Video synchronization for long-term monitoring
    - **Owner**: Frontend team
    - **Estimate**: 2 days

**Week 15 Exit Criteria**:
- [ ] FHIR R4 resources pass validation against HAPI FHIR
- [ ] External data imports complete without data loss
- [ ] Webhook notifications deliver in <5 seconds
- [ ] Multimodal display synchronizes within 1 frame

---

### Week 16: Performance Optimization + Release Preparation

**Deliverables**:

58. **Performance Optimization**
    - WebGL acceleration for topographic map rendering
    - Lazy loading for large recording datasets
    - Analysis result caching with Redis
    - Database query optimization (index review)
    - CDN deployment for static assets
    - **Owner**: Full stack team
    - **Estimate**: 3 days

59. **Comprehensive Test Suite**
    - Integration tests for all 4 phases
    - End-to-end user journey tests
    - Performance benchmark regression suite
    - Security scan (dependency audit)
    - Accessibility audit (WCAG 2.1 AA)
    - **Owner**: QA team
    - **Estimate**: 2 days

60. **Documentation + Release**
    - User manual (clinical workflow guide)
    - Administrator guide
    - API documentation (OpenAPI/Swagger)
    - Changelog (v1.0.0 release notes)
    - Deployment guide (Docker, Kubernetes)
    - Migration guide from legacy analyses
    - **Owner**: Documentation + DevOps team
    - **Estimate**: 3 days

61. **Release Candidate Validation**
    - Staging environment validation
    - Load testing (100 concurrent users)
    - Security review
    - Regulatory compliance sign-off
    - **Owner**: QA + Security team
    - **Estimate**: 2 days

**Week 16 Exit Criteria**:
- [ ] All 61 deliverables complete
- [ ] Performance targets met: report <3s, maps 60fps, scroll <100ms
- [ ] 100% of safety rules enforced
- [ ] Release candidate deployed to staging
- [ ] Ready for production release

---

## 9. 13 RESEARCH REPORT INDEX

| # | Report | Lines | Key Contribution | Roadmap Section |
|---|--------|-------|-----------------|-----------------|
| 1 | `QEEG_SOFTWARE_BENCHMARK.md` | 535 | Comparative analysis of 9 major EEG platforms (BrainVision, NeuroGuide, BrainDx, EEGLAB, MNE, FieldTrip, Brainstorm, Nihon Kohden, Natus) | Phases 2-4, UX patterns |
| 2 | `OPEN_SOURCE_QEEG_STACK_REPORT.md` | 524 | MNE-Python ecosystem deep-dive with implementation code for spectral, connectivity, source localization | Phases 3-4, tech stack |
| 3 | `MANUAL_QEEG_REVIEW_WORKBENCH_SPEC.md` | 580 | Clinical EEG review workbench specifications: trace viewer, montage system, annotation, measurement tools | Phase 2, Workbench |
| 4 | `QEEG_ARTIFACT_CLEANING_PIPELINE.md` | 900 | Comprehensive artifact detection and cleaning: ICA, AutoReject, PREP, FASTER, ADJUST with quality metrics | Phase 2, W6 |
| 5 | `QEEG_SPECTRAL_TOPOMAP_DESIGN.md` | 889 | Spectral analysis design: bands, IAF, ratios, asymmetry, z-score topomaps, animated maps, microstates | Phase 3, W9-W10 |
| 6 | `QEEG_CONNECTIVITY_DESIGN.md` | 649 | Connectivity analysis: wPLI, coherence, imaginary coherence, PAC, graph metrics, network hubs, DMN proxies | Phase 3, W10 |
| 7 | `QEEG_SOURCE_LOCALIZATION_REPORT.md` | 579 | Source localization methods: sLORETA, eLORETA, LCMV, MNE, dipole fitting, BEM head models | Phase 3, W11 |
| 8 | `QEEG_NORMATIVE_MODEL_GOVERNANCE.md` | 876 | 5 major normative databases compared (NeuroGuide, BrainDx, HBI, qEEG-Pro, ISB-NormDB), z-score interpretation, safe language | Phases 1, 3-4 |
| 9 | `QEEG_BIOMARKER_EVIDENCE_MATRIX.md` | 791 | 26 biomarkers across 11 conditions with evidence grades (A-D), clinical-use status, safe wording | Phase 3, W12 |
| 10 | `QEEG_PROTOCOL_PLANNING_DESIGN.md` | 715 | 10 neurofeedback protocols with qEEG-guided selection, inhibitory/excitatory logic, safety screening | Phase 4, W14 |
| 11 | `WORLD_CLASS_QEEG_REPORT_TEMPLATE.md` | 1,475 | Complete 14-section clinical qEEG report template per IQCB 2025 + ACNS Guideline 7 | Phase 4, W13 |
| 12 | `QEEG_ANALYZER_UX_BENCHMARK.md` | 682 | 15 UX patterns extracted from 9-platform benchmark with design recommendations | Phases 2-4, UX |
| 13 | `QEEG_AI_SAFETY_GOVERNANCE_REPORT.md` | 612 | 20 non-negotiable safety rules, FDA CDS guidance, never-diagnose architecture, liability framework | Phase 1, W1-W4 |
| **TOTAL** | | **~10,000** | | |

---

## 10. TOP 10 OPEN SOURCE TOOLS (MNE-PYTHON ECOSYSTEM)

| Rank | Tool | Purpose | Integration Point | License |
|------|------|---------|------------------|---------|
| 1 | **MNE-Python** | Core EEG/MEG processing, source estimation, visualization | Primary analysis backend | BSD-3 |
| 2 | **MNE-Connectivity** | Functional connectivity: coherence, PLV, PLI, wPLI, graph metrics | Phase 3, W10 | BSD-3 |
| 3 | **MNE-ICALabel** | Automatic ICA component classification (brain, eye, muscle, heart, noise) | Phase 2, W6 | BSD-3 |
| 4 | **AutoReject** | Automatic epoch rejection with cross-validation | Phase 2, W6 | BSD-3 |
| 5 | **MNE-BIDS** | BIDS data organization and I/O | Data import/export | BSD-3 |
| 6 | **MNE-Report** | Automated HTML report generation | Phase 4, W13 | BSD-3 |
| 7 | **PyRiemann** | Riemannian geometry for EEG covariance matrices, classification | Advanced analytics | BSD-3 |
| 8 | **FOOOF** | Fitting Oscillations & One Over F -- aperiodic/periodic signal separation | Phase 3, W9 (IAF) | Apache-2.0 |
| 9 | **YASA** | Sleep staging and sleep-related EEG analysis | Sleep biomarker panel | BSD-3 |
| 10 | **MNE-Features** | Feature extraction for machine learning pipelines | Biomarker panel | BSD-3 |

### Integration Architecture

```
DeepSynaps Protocol Studio
    |
    |-- FastAPI Backend
    |     |
    |     |-- MNE-Python (core: Raw, Epochs, Evoked, SourceEstimate)
    |     |-- MNE-Connectivity (wPLI, coherence, graph metrics)
    |     |-- MNE-ICALabel (artifact component classification)
    |     |-- AutoReject (epoch quality control)
    |     |-- FOOOF (IAF + aperiodic exponent extraction)
    |     |-- PyRiemann (advanced classification)
    |     |
    |     +-- Results API -> React Frontend
    |
    +-- React Frontend
          |
          |-- Three.js (3D brain rendering)
          |-- D3.js / Plotly (interactive charts)
          |-- WebGL/Canvas (topographic map rendering)
          +-- MNE-Python Script Export (reproducibility)
```

---

## 11. TOP 15 UX PATTERNS

Extracted from systematic benchmark of 9 major EEG analysis platforms. Each pattern includes origin, description, UX benefit, and implementation notes.

| # | Pattern | Origin | Benefit | Implementation | Phase |
|---|---------|--------|---------|---------------|-------|
| P1 | **Provenance-Tracking Workflow Tree** | BrainVision Analyzer 2 | Complete analysis transparency, reproducibility, error recovery | Right-click context menus for reprocess/branch/replace | W8 |
| P2 | **Montage Quick-Switch System** | NeuroGuide, Persyst, Nihon Kohden | Rapid spatial relationship exploration, phase reversal identification | Dropdown with F1-F5 shortcuts | W5 |
| P3 | **Scrollbar Review Progress Indicator** | Persyst 14+ | Prevents redundant review, supports shift handoffs | Color overlay on scrollbar track | W5 |
| P4 | **Contextual Right-Click Menus** | Brainstorm | Reduced cognitive load, only relevant actions visible | Dynamic menu generation by data type | W5-W8 |
| P5 | **Drag-and-Drop Pipeline Builder** | BrainVision, Brainstorm | No coding for batch processing, visual documentation | Visual canvas with auto script export | W8 |
| P6 | **Study-Level Abnormality Dashboard** | Natus NeuroWorks (autoSCORE) | Workflow triage, reduces oversight | Color-coded indicators, sortable study list | W4 |
| P7 | **Linked Multi-Window Coordinated Views** | Brainstorm, EEGLAB, Persyst | Holistic interpretation, spatial-temporal relationships | Shared time cursor across all figures | W5 |
| P8 | **Progressive Disclosure in Trace Viewers** | EEGLAB, MNE-Python | Manages information density for high-channel recordings | Reduced resolution default, detail on zoom | W8 |
| P9 | **Z-Score Color Divergence Scale** | NeuroGuide, BrainDx, qEEG-Pro | Intuitive normative comparison, immediate anomaly ID | Perceptually uniform diverging maps (RdBu_r) | W7 |
| P10 | **Auto-Artifact Component Classification** | EEGLAB (ICLabel), MNE | Reduces manual review burden, speeds preprocessing | Component label overlay with confidence scores | W6 |
| P11 | **Real-Time Trend Conversion Panel** | Nihon Kohden (aEEG/DSA/CSA) | Pattern recognition over hours/days | Scrollable trend panels beside raw traces | W6 |
| P12 | **Command History Auto-Documentation** | EEGLAB (EEG.history), Brainstorm | Seamless GUI-to-script transition, self-documenting | History panel with one-click export | W8 |
| P13 | **Symptom-Guided Analysis Wizard** | NeuroGuide | Reduces information overload, hypothesis-driven | Symptom form -> metric selection -> report | W14 |
| P14 | **Multi-Record Unified Timeline** | Persyst | Eliminates file switching, maintains temporal context | Seamless concatenation with day markers | W5 |
| P15 | **Interactive Topography-to-Trace Cross-Linking** | MNE-Python, Brainstorm | Rapid spatial-to-temporal navigation | Bidirectional selection: trace <-> topomap | W7 |

---

## 12. TOP 20 SAFETY RULES

Adapted from QEEG_AI_SAFETY_GOVERNANCE_REPORT.md. These are **non-negotiable requirements** for all clinical qEEG AI systems.

| # | Rule | Enforcement Mechanism | Phase |
|---|------|----------------------|-------|
| 1 | **Never-Diagnose Architecture** -- System architecturally incapable of generating diagnostic statements | Output language filter; prohibited terms blacklist | W3 |
| 2 | **Supportive Context Only Framing** -- All output explicitly framed as supportive context | Mandatory disclaimer injection on every output | W3 |
| 3 | **Mandatory Raw EEG Verification** -- All findings verified by qualified neurophysiologist | Workflow gate: raw review required before report | W2 |
| 4 | **Normative Database Transparency** -- Database fully documented (N, demographics, age groups, exclusion criteria) | Database metadata display in every comparison | W3 |
| 5 | **Pediatric Age Granularity** -- Monthly granularity under 2 years, yearly through adolescence | Age validation with appropriate database selection | W3 |
| 6 | **Medication Effect Documentation** -- All neuroactive medications documented and considered | Medication flag in interpretation; confound warnings | W3 |
| 7 | **Artifact Detection and Reporting** -- Automated detection with transparent artifact burden reporting | Artifact burden threshold enforcement | W3, W6 |
| 8 | **Source Localization Uncertainty Quantification** -- Uncertainty estimates included in all source results | Head model, electrode count, BSCR, error range displayed | W11 |
| 9 | **Ethnicity and Demographic Bias Audit** -- Regular audits evaluating performance across subgroups | Bias audit framework with quarterly reporting | W3 |
| 10 | **Urgent Finding Escalation Protocol** -- Defined escalation with response time standards | Automated alert pipeline with 15-min SLA | W3 |
| 11 | **False Positive Rate Monitoring** -- Continuous monitoring and trending | Dashboard with institutional threshold alerts | W3 |
| 12 | **Algorithm Validation Documentation** -- Published validation data for all algorithms | Validation metrics display per algorithm | W3 |
| 13 | **Human-in-the-Loop Requirement** -- Qualified expert reviews all AI output before clinical decisions | Distribution lock until human sign-off | W2 |
| 14 | **Informed Consent for AI-Assisted Analysis** -- Patients informed of AI use, limitations, human review | Consent verification before analysis | W1 |
| 15 | **Model Version Control and Change Management** -- All models versioned with documented change logs | Immutable version records with impact assessment | W4 |
| 16 | **Acquisition Quality Assurance** -- Minimum 60 seconds artifact-free recording required | Quality gate: reject or flag insufficient data | W3 |
| 17 | **Clinical Correlation Mandate** -- Every report includes mandatory "clinical correlation required" statement | Template injection with guidance on needed info | W3 |
| 18 | **Adverse Event Reporting** -- All adverse events/near-misses reported | Integration with institutional patient safety systems | W3 |
| 19 | **Training and Competency Verification** -- All clinicians complete training before system access | Training module + competency quiz before access grant | W4 |
| 20 | **Continuous Performance Monitoring** -- Periodic re-evaluation against reference standards | Automated monitoring with suspension criteria | W3 |

---

## 13. BUTTON / ACTION MATRIX

Comprehensive mapping of all user-facing actions across the 16-week delivery.

### Phase 1: Governance Actions

| Action | Button Text | Context | Permission Required | Safety Gate |
|--------|------------|---------|-------------------|-------------|
| Review analysis | "Review for Sign-Off" | Analysis results page | clinician | Raw EEG verified |
| Complete sign-off | "Sign Report" | Sign-off checklist | QEEG-D/QEEG-DL | All 7 checkboxes |
| Export report | "Export Report" | Signed report | clinician | SIGNED state |
| View audit log | "View Audit Log" | Report page | admin | None |
| Override sign-off | "Supervisor Override" | Locked report | supervisor | Separate audit trail |
| Verify credentials | "Verify Credentials" | User profile | any | External cert lookup |

### Phase 2: Workbench Actions

| Action | Button Text | Context | Shortcut | State Change |
|--------|------------|---------|----------|--------------|
| Open recording | "Open Recording" | Patient page | Ctrl+O | Viewer loads |
| Switch montage | "LB / TB / CircBP / Avg / CSD" | Toolbar | F1-F5 | Trace redraw |
| Scroll forward | ">" / ">>" | Trace viewer | Right arrow | Time advances |
| Mark artifact | "Mark Artifact" | Trace viewer | A | Artifact region tagged |
| Run ICA | "Run ICA Cleaning" | Artifact panel | Ctrl+I | Components computed |
| Accept component | "Keep" | Component card | K | Component retained |
| Reject component | "Remove" | Component card | R | Component removed |
| Generate topomaps | "Generate Maps" | Analysis panel | Ctrl+M | Maps rendered |
| Toggle band | "Delta / Theta / Alpha / Beta / Gamma" | Map panel | 1-5 | Band switch |
| Zoom map | Click to expand | Topographic map | Click | Full detail view |

### Phase 3: Analysis Actions

| Action | Button Text | Context | Result |
|--------|------------|---------|--------|
| Run spectral analysis | "Compute Spectra" | Analysis config | PSD + bands + IAF |
| Compute ratios | "Calculate Ratios" | Spectral results | TBR, TAR, DAR |
| Run connectivity | "Compute Connectivity" | Analysis config | wPLI + coherence matrices |
| Identify hubs | "Find Network Hubs" | Connectivity results | Hub electrodes highlighted |
| Run source estimation | "Localize Sources" | Analysis config | sLORETA/eLORETA maps |
| Match biomarkers | "Match Conditions" | Analysis results | Evidence-graded condition list |
| Generate interpretation | "Generate Safe Text" | Biomarker panel | Clinical-safe language |

### Phase 4: Report + Protocol Actions

| Action | Button Text | Context | Result |
|--------|------------|---------|--------|
| Generate report | "Generate Clinical Report" | Analysis results | 14-section report |
| Customize template | "Edit Template" | Report settings | Institution-branded layout |
| Export PDF | "Export PDF" | Report viewer | PDF/A-3 archival file |
| Export HTML | "Export HTML" | Report viewer | Interactive web report |
| Suggest protocols | "Suggest Protocols" | qEEG findings | Ranked protocol list |
| Select protocol | "Select Protocol" | Protocol list | Target sites + frequencies set |
| Safety screen | "Run Safety Check" | Protocol selection | Contraindication flags |
| Generate rationale | "Generate Rationale" | Protocol config | Structured justification |
| Share via FHIR | "Share via FHIR" | Report page | FHIR bundle transmitted |

---

## 14. KEY METRICS

### Development Metrics

| Metric | Baseline | W4 Target | W8 Target | W12 Target | W16 Target |
|--------|----------|-----------|-----------|------------|------------|
| Total source files | 80+ | 85+ | 95+ | 105+ | 115+ |
| Lines of code (backend) | ~10,000 | ~12,000 | ~16,000 | ~22,000 | ~28,000 |
| Lines of code (frontend) | ~7,949 | ~9,000 | ~13,000 | ~16,000 | ~20,000 |
| Test files | 40+ | 50+ | 60+ | 70+ | 80+ |
| Test coverage | ~65% | ~75% | ~78% | ~80% | ~85% |
| Migration files | 15 | 17 | 20 | 23 | 25 |

### Performance Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Trace viewer scroll latency | <100ms | Lighthouse performance audit |
| Spectral analysis (5 min recording) | <10 seconds | Backend timing logs |
| ICA artifact cleaning (19 channels) | <30 seconds | Backend timing logs |
| Topographic map render (64 channels) | 60fps | Chrome DevTools FPS counter |
| 3D source map render | 30fps | Chrome DevTools FPS counter |
| Report generation (14 sections) | <3 seconds | Backend timing logs |
| Full workbench load | <3 seconds | Lighthouse performance audit |
| API response time (p95) | <200ms | Application metrics |

### Safety Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Safety rules enforced | 20/20 | Automated compliance testing |
| Never-diagnose filter accuracy | 100% | Output language audit |
| Raw EEG verification rate | 100% | Workflow tracking |
| Sign-off completion rate | 100% before distribution | State machine validation |
| Urgent finding response time | <15 minutes | Alert system logs |
| False positive rate | <5/day | Monitoring dashboard |
| Bias audit frequency | Quarterly | Calendar tracking |
| Export audit completeness | 100% | Database audit |

### Clinical Quality Metrics

| Metric | Target | Reference |
|--------|--------|-----------|
| IAF detection accuracy | >95% | Expert manual identification |
| wPLI computation accuracy | Within 1e-6 of MNE-Python | Reference test suite |
| sLORETA localization error | Within 5mm of LORETA-KEY | Phantom study |
| Artifact detection concordance | >90% with manual rejection | Inter-rater study |
| Protocol recommendation match | >90% expert concordance | Clinical validation study |
| Report section completeness | 14/14 sections | Template checklist |

---

## 15. RISK ASSESSMENT

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|-----------|--------|------------|-------|
| **Regulatory non-compliance** (FDA, HIPAA) | Medium | Critical | Phase 1 governance sprint; legal review at W4 | Compliance Lead |
| **Performance degradation** with large datasets | Medium | High | Lazy loading, WebGL, Redis caching; perf testing W16 | Tech Lead |
| **MNE-Python dependency breaking changes** | Low | High | Version pinning; compatibility layer; CI matrix | Backend Lead |
| **Clinician adoption resistance** | Medium | Medium | UX benchmarking; training materials; phased rollout | Product Manager |
| **Pediatric safety incident** | Low | Critical | Age-granularity enforcement; mandatory expert review; Rule 5 | Clinical Advisor |
| **Algorithm bias in underrepresented groups** | Medium | High | Quarterly bias audits; Rule 9; demographic subgroup tracking | AI Ethics Committee |
| **Data breach / unauthorized export** | Low | Critical | FHIR gating; export audit; watermarking; Bug #1 fix | Security Lead |
| **False positive urgent finding alarm fatigue** | Medium | Medium | False positive monitoring; tiered alerts; Rule 11 | Clinical Operations |
| **Integration complexity with external systems** | Medium | Medium | FHIR R4 standard; adapter pattern; webhook design | Integration Lead |
| **Scope creep extending timeline** | High | Medium | Strict phase gates; MVP definition; change control board | Project Manager |

### Contingency Plans

| Scenario | Response |
|----------|----------|
| Phase 1 exceeds 4 weeks | Extend by 1 week; defer non-critical Phase 2 items |
| MNE-Python API breaking change | Freeze version; implement adapter layer; schedule upgrade |
| Security audit finds critical issue | Stop all development; fix in emergency patch; re-audit |
| Clinical validation shows <80% expert concordance | Additional training data; algorithm tuning; extend Phase 3 |
| Performance targets not met | Profile and optimize; consider WebAssembly for compute-heavy paths |

---

## 16. MERGE RECOMMENDATION

### Recommendation: APPROVE with Phase-Gate Conditions

This roadmap represents a comprehensive, evidence-based plan to transform DeepSynaps Protocol Studio into a world-class clinical qEEG analysis platform. The 16-week timeline is aggressive but achievable given the strong research foundation (13 reports, ~10,000 lines of analysis) and clear deliverable definitions.

### Approval Conditions

1. **Phase 1 must complete before Phase 2 begins**: The 4 critical governance bugs (FHIR gating, export governance, sign-off alignment, legacy review) are non-negotiable prerequisites. No clinical feature work proceeds until all P0 bugs are resolved and safety rules 1-20 are enforced.

2. **Clinician advisory board established**: A board of 3-5 practicing QEEG-D/QEEG-DL certified clinicians must review deliverables at the end of each phase, with veto authority on safety-related decisions.

3. **Regulatory counsel engaged**: Legal review of all patient-facing output language, export formats, and sign-off workflows must be completed by Week 4.

4. **MNE-Python ecosystem alignment**: The decision to build on the MNE-Python ecosystem is strongly supported by the research. All algorithms should maintain MNE-Python compatibility to ensure reproducibility and peer review.

5. **Testing investment**: The test file count should grow from 40+ to 80+ by Week 16. Test coverage must reach 85% before production release. Allocate 20% of development time to testing.

### Merge Checklist

- [ ] Executive approval of 16-week timeline and resource allocation
- [ ] Clinician advisory board members identified and contracted
- [ ] Regulatory counsel engagement letter signed
- [ ] MNE-Python version compatibility baseline established (>=1.6.0)
- [ ] CI/CD pipeline configured for automated testing on every PR
- [ ] Security scanning (SAST, dependency audit) integrated into CI
- [ ] Staging environment provisioned for Phase 4 validation
- [ ] Database backup and rollback procedures documented
- [ ] Team capacity confirmed: 2 backend, 2 frontend, 1 QA, 1 DevOps, 0.5 clinical advisor

### Post-Merge Actions

1. **Week 0**: Kickoff meeting, team assignments, environment setup
2. **Weekly**: Stand-ups, blocker identification, scope adjustment
3. **Per Phase**: Gate review with clinician advisory board
4. **Week 16**: Production release candidate, final security audit, go/no-go decision

---

## APPENDIX A: DELIVERABLE SUMMARY TABLE

| Week | Deliverable ID | Name | Type | Effort (days) |
|------|---------------|------|------|--------------|
| W1 | D1 | FHIR Gating Middleware | Bug Fix | 3 |
| W1 | D2 | Export Governance System | Bug Fix | 3 |
| W1 | D3 | Sign-Off Alignment | Bug Fix | 2 |
| W1 | D4 | Legacy Review | Bug Fix | 2 |
| W2 | D5 | Frontend Sign-Off Component | Feature | 3 |
| W2 | D6 | Legacy Analysis Deprecation | Maintenance | 2 |
| W2 | D7 | Governance Dashboard | Feature | 2 |
| W2 | D8 | IQCB Compliance Checklist | Feature | 2 |
| W3 | D9 | Safety Rule Engine | Feature | 4 |
| W3 | D10 | Safe Language Templates | Feature | 2 |
| W3 | D11 | Urgent Finding Escalation | Feature | 2 |
| W3 | D12 | Bias Audit Framework | Feature | 2 |
| W4 | D13 | E2E Governance Validation | Testing | 3 |
| W4 | D14 | Frontend Safety Integration | Feature | 2 |
| W4 | D15 | Documentation + Training | Documentation | 2 |
| W5 | D16 | Interactive Trace Viewer | Feature | 4 |
| W5 | D17 | Montage Quick-Switch System | Feature | 3 |
| W5 | D18 | Linked Multi-Window Views | Feature | 2 |
| W6 | D19 | ICA Artifact Pipeline | Feature | 3 |
| W6 | D20 | AutoReject Integration | Feature | 2 |
| W6 | D21 | Quality Metrics Dashboard | Feature | 2 |
| W6 | D22 | Artifact Review UI | Feature | 2 |
| W7 | D23 | 2D Topographic Map Renderer | Feature | 4 |
| W7 | D24 | 3D Head Surface Projection | Feature | 3 |
| W7 | D25 | Multi-Panel Map Layouts | Feature | 2 |
| W7 | D26 | Animated Topomap Player | Feature | 2 |
| W8 | D27 | Split-Screen Workbench | Feature | 3 |
| W8 | D28 | Provenance Workflow Tree | Feature | 2 |
| W8 | D29 | Progressive Disclosure | Enhancement | 2 |
| W8 | D30 | Command History Auto-Doc | Feature | 2 |
| W9 | D31 | Spectral Analysis Pipeline | Feature | 3 |
| W9 | D32 | Band Ratio Computation | Feature | 2 |
| W9 | D33 | Asymmetry Analysis | Feature | 2 |
| W9 | D34 | Spectral Results Panel | Feature | 2 |
| W10 | D35 | wPLI Engine | Feature | 2 |
| W10 | D36 | Coherence + Imaginary Coherence | Feature | 2 |
| W10 | D37 | Graph-Theoretic Metrics | Feature | 2 |
| W10 | D38 | Connectivity Visualization | Feature | 3 |
| W11 | D39 | sLORETA Source Estimation | Feature | 3 |
| W11 | D40 | eLORETA + MNE Estimation | Feature | 2 |
| W11 | D41 | Source Uncertainty Quantification | Feature | 2 |
| W11 | D42 | 3D Source Visualization | Feature | 3 |
| W12 | D43 | Biomarker Evidence Engine | Feature | 3 |
| W12 | D44 | Condition Matching Panel | Feature | 2 |
| W12 | D45 | Safe Interpretation Generator | Feature | 2 |
| W12 | D46 | Biomarker Results Panel | Feature | 2 |
| W13 | D47 | 14-Section Report Engine | Feature | 4 |
| W13 | D48 | Report Template System | Feature | 2 |
| W13 | D49 | Multi-Format Export | Feature | 2 |
| W14 | D50 | Protocol Selection Engine | Feature | 3 |
| W14 | D51 | 10 Protocol Templates | Feature | 2 |
| W14 | D52 | Protocol Safety Screening | Feature | 2 |
| W14 | D53 | Protocol Planning UI | Feature | 2 |
| W15 | D54 | FHIR R4 Full Compliance | Integration | 3 |
| W15 | D55 | External Data Integration | Integration | 2 |
| W15 | D56 | API Webhooks + Events | Integration | 2 |
| W15 | D57 | Multimodal Data Support | Feature | 2 |
| W16 | D58 | Performance Optimization | Enhancement | 3 |
| W16 | D59 | Comprehensive Test Suite | Testing | 2 |
| W16 | D60 | Documentation + Release | Documentation | 3 |
| W16 | D61 | Release Candidate Validation | Testing | 2 |

---

## APPENDIX B: TEAM STRUCTURE

| Role | Count | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|-------|---------|---------|---------|---------|
| Backend Engineer (Python/FastAPI) | 2 | 100% | 50% | 80% | 60% |
| Frontend Engineer (React/TS) | 2 | 50% | 100% | 80% | 80% |
| QA Engineer | 1 | 50% | 30% | 30% | 80% |
| DevOps Engineer | 1 | 20% | 10% | 10% | 50% |
| Clinical Advisor (QEEG-D) | 0.5 | 30% | 10% | 20% | 40% |
| Product Manager | 0.5 | 20% | 10% | 10% | 20% |
| Technical Writer | 0.5 | 10% | 0% | 0% | 50% |

---

## APPENDIX C: REFERENCES

### Regulatory Standards
1. FDA 510(k) Clearance K041263: NeuroGuide Analysis System (2004)
2. FDA Guidance: Clinical Decision Support Software (Sept 2022, Updated Jan 2026)
3. IQCB 2025 Guidelines: Minimum Technical Requirements for Performing Clinical QEEG (Collura et al., 2025)
4. ACNS Guideline 7: Guidelines for EEG Reporting (Tatum et al., 2016)
5. ACNS Practice Guideline: Use of Quantitative EEG (Tenney et al., 2021)

### Key Software References
6. MNE-Python Documentation: https://mne.tools/
7. EEGLAB: https://sccn.ucsd.edu/eeglab/
8. FieldTrip: https://www.fieldtriptoolbox.org/
9. Brainstorm: https://neuroimage.usc.edu/brainstorm/
10. FOOOF: https://fooof-tools.github.io/

### Research Foundations
11. Thatcher, R.W. et al. (2003). Quantitative EEG Normative Databases: Validation and Clinical Correlation. *Journal of Neurotherapy*.
12. Pascual-Marqui, R.D. (2002). Standardized sLORETA: technical details. *Methods & Findings in Experimental and Clinical Pharmacology*.
13. Stam, C.J. et al. (2007). Phase Lag Index. *Human Brain Mapping*.
14. Vinck, M. et al. (2011). Weighted Phase Lag Index. *NeuroImage*.
15. Arns, M. et al. (2012, 2014). qEEG-informed neurofeedback effectiveness trials.

---

*Document compiled for DeepSynaps Protocol Studio strategic planning.*
*Version 1.0 | 61 deliverables | 16 weeks | 20 safety rules | 15 UX patterns*
*Synthesized from 13 research reports totaling ~10,000+ lines of domain analysis.*
*This roadmap is a living document and should be updated as research and requirements evolve.*
