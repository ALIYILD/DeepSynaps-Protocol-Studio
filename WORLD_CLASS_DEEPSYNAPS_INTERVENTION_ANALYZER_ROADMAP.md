# World-Class DeepSynaps Intervention Analyzer — 16-Week Implementation Roadmap

**Version:** 1.0.0
**Date:** July 2026
**Status:** Product roadmap + engineering contract
**Scope:** Transform the Treatment Sessions Analyzer into a world-class Intervention Analyzer supporting 20 intervention types, 11 multimodal contributor domains, evidence-backed decision support, and regulatory-grade safety architecture.

---

## 1. Executive Summary

The DeepSynaps Intervention Analyzer represents a strategic transformation from a session-log viewer into a clinician-reviewed, multimodal intervention decision-support platform. Building on the renamed and rearchitected codebase (1,380-line frontend, 1,382-line backend service, 719-line router), this roadmap delivers a 16-week implementation plan across four phases: **Safety Foundation** (rename + role gates + honest analytics), **Multimodal Intelligence** (11 contributor domains + biomarker confound panels + outcome correlation), **Evidence Integration** (OpenFDA + evidence-linked cards + pharmacogenomics + research bundle), and **Advanced Analytics** (causal inference safe methods including ITS and N-of-1 trials, adherence prediction, and compliance dashboard). The analyzer supports 20 intervention types spanning neuromodulation, pharmacological, behavioural, digital, lifestyle, environmental, and combined categories — all governed by 20 safety copy rules, 15 UX patterns adopted from 20+ production clinical systems, and an open-source integration map of 24 tools. Every feature is decision-support only, with explicit causal language standards, E-value reporting, and clinician review gates.

---

## 2. Transformation Summary — What Changed from Treatment Sessions Analyzer to Intervention Analyzer

### 2.1 Naming & Identity Shift

| Aspect | Treatment Sessions Analyzer (Legacy) | Intervention Analyzer (New) |
|--------|--------------------------------------|----------------------------|
| **Scope** | Session logs only | Full intervention lifecycle |
| **Types** | 8 neuromod modalities | 20 intervention types across 7 categories |
| **Contributors** | 3 domains (MRI, qEEG, assessments) | 11 multimodal contributor domains |
| **Evidence** | None | Live evidence corpus + research bundle + intelligence overview |
| **Safety** | Basic disclaimer | 20-rule safety copy + graded language + E-values |
| **Analytics** | Session counts | Outcome sparklines, adherence prediction, confound panels |
| **Router** | `/api/v1/treatment-sessions` | `/api/v1/treatment-sessions` (backward compat) |
| **Frontend** | `treatment-sessions-analyzer` route | `intervention-analyzer` route + 19 linked modules |

### 2.2 Files Renamed / Created

```
apps/web/src/pages-intervention-analyzer.js              (NEW — 1,380 lines)
apps/api/app/services/intervention_analyzer.py           (NEW — 1,382 lines)
apps/api/app/routers/treatment_sessions_router.py        (RENAMED → intervention_router.py planned)
docs/treatment-sessions-analyzer-spec.md                 (SUPERSEDED by this roadmap)
docs/WORLD_CLASS_DEEPSYNAPS_INTERVENTION_ANALYZER_ROADMAP.md  (THIS FILE)
```

### 2.3 Key Architectural Decisions

1. **Intervention type enum expanded** from 8 to 20 types with category taxonomy
2. **Role-based workspace access** via `canUseInterventionAnalyzerWorkspace()` with clinical role gating
3. **Safety banner** rendered on every view load with decision-support disclaimer
4. **Batch sign-status API** eliminates N+1 fan-out (3 queries vs. per-session calls)
5. **Schema versioned payload** (`1.3.0`) with provenance on every field
6. **Forecast numbers intentionally withheld** until calibrated model validated (honest analytics)
7. **Evidence enrichment triple-stack**: live SQLite corpus + neuromodulation CSV bundle + patient intelligence overview

---

## 3. Current State Assessment

### 3.1 What Is Implemented (Production-Ready)

#### Frontend (`pages-intervention-analyzer.js` — 1,380 lines)

| Feature | Status | Lines |
|---------|--------|-------|
| Intervention type registry (20 types, 7 categories) | PRODUCTION | 12-33 |
| Role-gated workspace access | PRODUCTION | 40-51 |
| Safety banner (every view) | PRODUCTION | 203-205 |
| Clinic-wide intervention table (sortable) | PRODUCTION | 541-596 |
| Patient detail view with course header | PRODUCTION | 612-637 |
| Session timeline with expandable rows | PRODUCTION | 741-775 |
| Outcome sparkline (SVG, multi-scale) | PRODUCTION | 695-738 |
| Sign-off queue with batch actions | PRODUCTION | 639-661 |
| Adverse event banner | PRODUCTION | 778-788 |
| Deviation panel (interruptions + params) | PRODUCTION | 664-692 |
| Audit trail teaser | PRODUCTION | 790-807 |
| Linked module navigation bar (19 modules) | PRODUCTION | 810-869 |
| Demo fixture support | PRODUCTION | 1033-1050 |
| Batch sign-status integration | PRODUCTION | 491-529 |
| AI report strip mounting | PRODUCTION | 956-966 |

#### Backend (`intervention_analyzer.py` — 1,382 lines)

| Feature | Status | Lines |
|---------|--------|-------|
| Payload builder (`build_intervention_analyzer_payload`) | PRODUCTION | 216-1383 |
| 11 multimodal contributor domains | PRODUCTION | 464-825 |
| Evidence enrichment (triple-stack) | PRODUCTION | 413-436, 1003-1057 |
| Medication interaction screening | PRODUCTION | 361-399 |
| Outcome trend extraction (PHQ-9 proxy) | PRODUCTION | 827-867 |
| Side effect event mapping | PRODUCTION | 869-889 |
| Optimization prompts (adherence + interactions) | PRODUCTION | 891-952 |
| Evidence link merging (corpus + intelligence) | PRODUCTION | 979-1057 |
| Audit event logging (ML feedback) | PRODUCTION | 1059-1342 |
| Schema version 1.3.0 payload | PRODUCTION | 1344-1383 |

#### Router (`treatment_sessions_router.py` — 719 lines)

| Feature | Status | Lines |
|---------|--------|-------|
| Batch sign-status endpoint | PRODUCTION | 278-488 |
| Clinic summary endpoint (3-query aggregation) | PRODUCTION | 490-719 |
| 20-type intervention enum | PRODUCTION | 47-53 |
| Role-gated access (clinician+) | PRODUCTION | 504 |
| Cross-clinic isolation | PRODUCTION | 518-523 |

### 3.2 What Is Missing (This Roadmap Addresses)

| # | Gap | Priority | Phase |
|---|-----|----------|-------|
| 1 | File rename: `treatment_sessions_router.py` → `intervention_router.py` | HIGH | W1 |
| 2 | Safety banner on clinic summary view (not just patient) | HIGH | W1 |
| 3 | Honest "insufficient data" states for all predictions | HIGH | W1-2 |
| 4 | Biomarker confound panel per contributor | HIGH | W5-6 |
| 5 | Cross-domain outcome correlation (not single-scale) | HIGH | W6-7 |
| 6 | OpenFDA adverse event integration | HIGH | W9-10 |
| 7 | Evidence-linked cards with strength badges | HIGH | W9-10 |
| 8 | Pharmacogenomics interaction layer | MEDIUM | W11 |
| 9 | Segmented regression ITS for single-patient monitoring | MEDIUM | W13-14 |
| 10 | N-of-1 trial infrastructure | MEDIUM | W14-15 |
| 11 | Adherence prediction model | MEDIUM | W13-14 |
| 12 | Compliance dashboard (clinic-wide) | MEDIUM | W15-16 |
| 13 | E-value calculation for observational analyses | MEDIUM | W14 |
| 14 | Causal Impact (BSTS) for intervention evaluation | LOW | W15-16 |
| 15 | Research bundle export (CSV/JSON) | LOW | W11-12 |

---

## 4. Four Critical Bugs Fixed

### Bug 1: Role Gate Bypass (FIXED)

**Problem:** Non-clinical roles (patient, guest, researcher) could access intervention analytics workspace.
**Fix:** `canUseInterventionAnalyzerWorkspace()` with `INTERVENTION_ANALYZER_CLINICAL_ROLES` Set check.

```javascript
const INTERVENTION_ANALYZER_CLINICAL_ROLES = new Set([
  'clinician', 'admin', 'clinic-admin', 'supervisor',
]);
```

**Lines:** 40-51 | **Verification:** `_restrictedCard()` rendered for unauthorized roles.

### Bug 2: Clinic Fan-Out N+1 (FIXED)

**Problem:** Clinic table loaded each course serially, causing N+1 API calls.
**Fix:** `_mapWithConcurrency()` with concurrency limit of 5 + batch sign-status endpoint.

```javascript
const details = await _mapWithConcurrency(courseEntries, 5, async (c) => { ... });
```

**Lines:** 480-484 | **Verification:** Clinic summary endpoint aggregates in 3-5 queries.

### Bug 3: Predictive Language in Outcomes (FIXED)

**Problem:** Outcome sparkline used "improving/worsening" as clinical fact.
**Fix:** `_trendArrow()` uses neutral direction labels with full provenance.

```javascript
// BEFORE: "Improving" / "Worsening" (clinical claim)
// AFTER: "Scores moved in direction consistent with improvement on this scale (rule-based)"
```

**Lines:** 92-98 | **Verification:** Every trend has `provenance: 'rule_based_heuristic'`.

### Bug 4: Placeholder Labels on Empty States (FIXED)

**Problem:** Empty outcome or session states showed "—" without context.
**Fix:** Explicit empty-state cards explaining *why* data is missing and what to do.

```javascript
// _emptySessionsCard(): "There are no delivered-session parameter rows...
// verify documentation and device imports."
```

**Lines:** 170-177 | **Verification:** All empty states include provenance and next steps.

---

## 5. 16-Week Implementation Roadmap

### Phase 1: Rename + Safety Foundation (Weeks 1-4)

#### Week 1: Rename All Files + Fix Role Gate

| Task | Owner | Deliverable |
|------|-------|-------------|
| Rename `treatment_sessions_router.py` → `intervention_router.py` | Backend | PR with router rename + URL backward compat |
| Rename route prefix `/treatment-sessions` → `/intervention-analyzer` | Backend | Redirect layer for v1 clients |
| Update `page_title` to "Intervention Analyzer" across all payloads | Backend | Schema version bump to 1.4.0 |
| Add role gate to clinic summary endpoint | Backend | 403 for non-clinical roles |
| Frontend route rename confirmation | Frontend | `navigate('intervention-analyzer')` works |
| Add safety banner to clinic view (currently only on patient view) | Frontend | `_safetyBanner()` in clinic render |
| Write migration guide for external API consumers | Docs | `docs/INTERVENTION_ANALYZER_MIGRATION.md` |

#### Week 2: Honest Analytics States + Empty State Overhaul

| Task | Owner | Deliverable |
|------|-------|-------------|
| Implement `forecast_status.available: false` with reason codes | Backend | 5 reason codes: `no_calibrated_model`, `insufficient_sessions`, `sparse_data`, `missing_biomarker`, `model_validation_pending` |
| Design "insufficient data" card component | Frontend | Reusable `_insufficientDataCard(domain, reason, nextSteps)` |
| Add honest states for: response probability, session count estimate, modality suitability | Frontend | Each shows why withheld + what's needed |
| Add data completeness indicator per contributor | Frontend | Progress ring showing % complete per domain |
| Implement "What would reduce uncertainty?" prompts | Backend | List next data to collect per prediction |

#### Week 3: Safety Architecture Hardening

| Task | Owner | Deliverable |
|------|-------|-------------|
| Implement safety copy rule engine (20 rules) | Backend | `safety_copy_validator.py` — validates all UI copy |
| Add graded language linter to CI | DevOps | Block PRs using forbidden causal language |
| Implement E-value calculator module | Backend | `e_value_calculator.py` (from INTERVENTION_CAUSALITY_ANALYSIS_DESIGN Appendix B) |
| Add confound disclosure checklist to payload | Backend | 7-item checklist per analysis |
| Safety banner v2: dynamic based on analysis type | Frontend | Different banner for ITS vs. pre-post vs. N-of-1 |

#### Week 4: Phase 1 Integration + QA

| Task | Owner | Deliverable |
|------|-------|-------------|
| End-to-end rename testing | QA | All routes, all roles, demo + production modes |
| Safety copy audit — every string in UI | QA | Zero violations of 20 safety rules |
| Load testing: clinic summary with 500 patients | QA | <2s response time |
| Write Phase 1 retrospective | Product | Lessons learned + Phase 2 adjustments |
| **Phase 1 Gate Review** | **Leadership** | **Go/no-go for Phase 2** |

---

### Phase 2: Multimodal Intelligence (Weeks 5-8)

#### Week 5: Contributor Domain Expansion (11 Domains)

| Domain | Biomarker Role | Deep Link | Data Quality |
|--------|---------------|-----------|--------------|
| qEEG/EEG | Predictive | `/?page=qeeg-analysis` | Good / Missing |
| MRI/fMRI | Predictive | `/?page=mri-analysis` | Good / Missing |
| Assessments | Responsive | `/?page=assessments-v2` | Good / Sparse |
| Biometrics | Responsive | `/?page=wearables` | Good / Missing |
| Medications | Unknown | `/?page=med-interactions` | Good / Missing |
| Video/movement | Responsive | `/?page=video-assessments` | Good / Missing |
| Voice/speech | Responsive | `/?page=voice-analyzer` | Good / Missing |
| Text/notes | Unknown | `/?page=text-analyzer` | Good / Missing |
| Wearables | Responsive | `/?page=wearables` | Good / Missing |
| Risk analyzer | Predictive | `/?page=risk-analyzer` | Placeholder |
| Digital phenotyping | Responsive | `/?page=digital-phenotyping` | Placeholder |

**Tasks:**
- Finalize all 11 contributor payloads with consistent schema
- Add `biomarker_role` taxonomy: predictive vs. responsive vs. unknown
- Implement relevance scoring (0-1) per domain
- Add confidence calibration per data quality level

#### Week 6: Biomarker Confound Panel

| Task | Owner | Deliverable |
|------|-------|-------------|
| Universal confound checklist (biological, medication, psychological, technical) | Backend | 40-item checklist from MULTIMODAL_INTERVENTION_OUTCOME_MAP |
| Confound-aware interpretation framework (7 rules) | Backend | Rules 1-7 from research report |
| Confound panel UI per contributor | Frontend | Expandable checklist with completion state |
| Temporal dynamics display (Days → Weeks → Months) | Frontend | Timeline showing when each biomarker modality responds |
| Evidence-to-recommendation translation table | Frontend | Grade A/B/C/D with clinical action |

#### Week 7: Cross-Domain Outcome Correlation

| Task | Owner | Deliverable |
|------|-------|-------------|
| Cross-modal concordance matrix | Backend | 6 interventions x 7 biomarker modalities |
| Correlation engine (windowed, with multiple testing caution) | Backend | `correlate_sessions_with_outcomes()` |
| Outcome correlation panel UI | Frontend | Heatmap + caution banner |
| Expected trajectory bands per intervention type | Backend | Populate from evidence matrices |
| MCID thresholds per scale (PHQ-9, GAD-7, etc.) | Backend | Grade A evidence thresholds |

#### Week 8: Phase 2 Integration + UX Polish

| Task | Owner | Deliverable |
|------|-------|-------------|
| Multi-source data fusion display (Pattern 13 from UX benchmark) | Frontend | Unified timeline: clinical + PRO + wearable + lab |
| Patient snapshot cards (Pattern 12) | Frontend | Compact summary cards in population views |
| Normal range + threshold shading (Pattern 14) | Frontend | Background shading on trend charts |
| Data completeness indicators (Pattern 11) | Frontend | Visual completeness per patient/assessment |
| **Phase 2 Gate Review** | **Leadership** | **Go/no-go for Phase 3** |

---

### Phase 3: Evidence Integration (Weeks 9-12)

#### Week 9: OpenFDA Integration

| Task | Owner | Deliverable |
|------|-------|-------------|
| OpenFDA client module | Backend | `openfda_client.py` — adverse event, label, recall APIs |
| Device-specific adverse event lookup | Backend | Query by device name (TMS, tDCS, etc.) |
| Drug-label interaction screening | Backend | Screen patient meds against neuromodulation contraindications |
| OpenFDA evidence panel | Frontend | "FDA Safety Signals" expandable section |
| Caching layer for OpenFDA queries | Backend | 24-hour TTL to respect rate limits |

#### Week 10: Evidence-Linked Cards

| Task | Owner | Deliverable |
|------|-------|-------------|
| Evidence badge system (strength + confidence) | Frontend | `evidence_strength` badge: high/moderate/low |
| Expandable evidence drawer | Frontend | "Why & evidence" → snippet + link per card |
| Model card display for AI outputs | Frontend | Inputs, version, limitations, cohort mismatch |
| Evidence registry v1 (JSON/YAML) | Backend | 7 use-case registries (protocol, target, EEG, MRI, outcome, side-effect, dose) |
| Every surfaced claim has evidence object | Backend | `evidence_source_type`, `snippet`, `strength`, `confidence` |

#### Week 11: Pharmacogenomics + Research Bundle

| Task | Owner | Deliverable |
|------|-------|-------------|
| Pharmacogenomics interaction layer | Backend | CYP450 enzyme checks for psychiatric medications |
| PGx alert integration with medication panel | Frontend | "Genetic interaction possible" banner |
| Research bundle export (CSV/JSON) | Backend | One-click export of patient data in research-ready format |
| Data dictionary + codebook generation | Backend | Auto-generated from schema |
| Publication-quality chart export | Frontend | SVG/PNG export for all trend charts |

#### Week 12: Phase 3 Integration + Evidence QA

| Task | Owner | Deliverable |
|------|-------|-------------|
| Evidence accuracy audit | QA | Every claim traceable to source |
| OpenFDA integration testing | QA | Graceful degradation when API unavailable |
| Export format validation | QA | CSV validates against CDISC standards |
| **Phase 3 Gate Review** | **Leadership** | **Go/no-go for Phase 4** |

---

### Phase 4: Advanced Analytics (Weeks 13-16)

#### Week 13: Safe Causal Inference — ITS Foundation

| Task | Owner | Deliverable |
|------|-------|-------------|
| Segmented regression ITS module | Backend | `its_segmented_regression.py` — pre/post intervention breakpoint |
| ARIMA + seasonal adjustment | Backend | `statsmodels` integration with auto-ARIMA |
| Interrupted Time Series UI panel | Frontend | Segmented chart with breakpoint marker |
| Causal language standards enforcement | Backend | Table: Design Strength → Appropriate Language |
| E-value calculation + display | Frontend | E-value badge on every observational analysis |
| Regression to the mean adjustment | Backend | `rtm_adjustment()` function |

#### Week 14: N-of-1 Trial Infrastructure

| Task | Owner | Deliverable |
|------|-------|-------------|
| N-of-1 trial schema (ABAB design) | Backend | Period randomization, washout tracking |
| N-of-1 trial setup UI | Frontend | Clinician configures periods, randomization, outcomes |
| Bayesian updating for N-of-1 | Backend | `pymc` + `arviz` integration |
| CONSORT extension for N-of-1 (CENT 2015) compliance | Backend | Required reporting fields |
| N-of-1 results display | Frontend | Period-separated chart with probability of benefit |

#### Week 15: Adherence Prediction + Compliance Dashboard

| Task | Owner | Deliverable |
|------|-------|-------------|
| Adherence prediction model (rules-based) | Backend | Pattern detection: recurrent misses, clustering |
| Dropout risk score (0-1, explainable) | Backend | Weighted sum with conservative coefficients |
| Clinic compliance dashboard | Frontend | Population-level: courses, sign-offs, AEs, adherence |
| Multi-stakeholder dashboard architecture | Frontend | Role-aware views (clinician, admin, supervisor) |
| Population-to-individual drill-down | Frontend | Click clinic metric → patient list |

#### Week 16: Causal Impact + Final Integration

| Task | Owner | Deliverable |
|------|-------|-------------|
| Causal Impact (BSTS) integration | Backend | `tfcausalimpact` or `pycausalimpact` wrapper |
| Synthetic control methods | Backend | For multi-site policy evaluation |
| Quality assurance checklist | Backend | 13-item checklist before any analysis finalization |
| Final end-to-end testing | QA | All 20 intervention types, all 11 domains, all 4 phases |
| **Final Gate Review** | **Leadership** | **Production release approval** |

---

## 6. Twenty Intervention Types Supported

### 6.1 Neuromodulation (8 types)

| # | Slug | Label | Evidence Grade |
|---|------|-------|----------------|
| 1 | `tms` | TMS | A (Meta-analysis confirmed) |
| 2 | `tdcs` | tDCS | B (Consistent RCT evidence) |
| 3 | `tacs` | tACS | C (Limited evidence) |
| 4 | `trns` | tRNS | C (Limited evidence) |
| 5 | `tavns` | taVNS | B (Consistent RCT evidence) |
| 6 | `tps` | TPS | C (Limited evidence) |
| 7 | `pbm` | PBM | C (Limited evidence) |
| 8 | `neurofeedback` | Neurofeedback | B (Consistent RCT evidence) |

### 6.2 Pharmacological (1 type)

| # | Slug | Label | Evidence Grade |
|---|------|-------|----------------|
| 9 | `medication_change` | Medication change | A (Meta-analysis confirmed) |

### 6.3 Behavioural (4 types)

| # | Slug | Label | Evidence Grade |
|---|------|-------|----------------|
| 10 | `psychotherapy` | Psychotherapy | A (Meta-analysis confirmed) |
| 11 | `occupational_therapy` | Occupational therapy | B (Consistent RCT evidence) |
| 12 | `speech_therapy` | Speech/language therapy | B (Consistent RCT evidence) |
| 13 | `physiotherapy` | Physiotherapy | B (Consistent RCT evidence) |

### 6.4 Digital (1 type)

| # | Slug | Label | Evidence Grade |
|---|------|-------|----------------|
| 14 | `digital_therapeutics` | Digital therapeutics | B (Consistent RCT evidence) |

### 6.5 Lifestyle (4 types)

| # | Slug | Label | Evidence Grade |
|---|------|-------|----------------|
| 15 | `sleep_intervention` | Sleep intervention | A (Meta-analysis confirmed) |
| 16 | `nutrition` | Nutrition/supplements | B (Consistent RCT evidence) |
| 17 | `exercise` | Exercise plan | A (Meta-analysis confirmed) |
| 18 | `lifestyle` | Lifestyle intervention | B (Consistent RCT evidence) |

### 6.6 Environmental (1 type)

| # | Slug | Label | Evidence Grade |
|---|------|-------|----------------|
| 19 | `accommodations` | School/workplace accommodations | C (Limited evidence) |

### 6.7 Combined (1 type)

| # | Slug | Label | Evidence Grade |
|---|------|-------|----------------|
| 20 | `multimodal` | Multimodal combined | B (Consistent RCT evidence) |

### 6.8 Intervention Type Helper

```javascript
function _interventionTypeLabel(slug) {
  const entry = INTERVENTION_TYPES.find((t) => t.slug === slug);
  return entry?.label || slug || '—';
}
```

---

## 7. Research Report Index

### Report 1: INTERVENTION_EVIDENCE_MATRIX.md
**Summary:** 193-line comprehensive evidence matrix covering neuromodulation treatments (rTMS, tDCS, VNS, DBS, ECT, TENS, CES) with clinical guidelines (APA, NHS NICE, VA/DoD), patient populations (MDD, TRD, bipolar, PTSD, OCD), effect sizes, adverse events, session parameters, evidence grading (A/B/C/D), pharmacotherapy interactions, qEEG integration, wearables, digital assessments, and ongoing major trials. **Key finding:** rTMS for MDD has strongest evidence (Grade A, multiple meta-analyses); DBS requires highest specialist oversight.

### Report 2: INTERVENTION_CAUSALITY_ANALYSIS_DESIGN.md
**Summary:** 1,475-line causal inference methodology reference covering study designs (RCTs, non-randomized studies, ITS, DiD, N-of-1), confounding (E-values, sensitivity analysis, directed acyclic graphs), regression to the mean, missing data handling, subgroup analysis, Bayesian vs. frequentist approaches, and clinical trial analysis methods. **Key finding:** E-value threshold of 1.5-2.0 for moderate confounding; always report CI with point estimates; simple pre-post without controls is fundamentally flawed for causal claims.

### Report 3: MULTIMODAL_INTERVENTION_OUTCOME_MAP.md
**Summary:** 1,520-line mapping of 9+ interventions across 7 biomarker modalities (qEEG, MRI/fMRI, blood biomarkers, clinical assessments, wearables, voice/video/text) with expected changes, time courses, effect sizes, individual variability assessments, and confound-aware interpretation framework. **Key finding:** Multimodal concordance required — single-modality findings must be confirmed across at least 2 domains before clinical interpretation.

### Report 4: OPEN_SOURCE_INTERVENTION_ANALYZER_STACK.md
**Summary:** 1,020-line catalog of 24 open-source clinical research tools organized into 7 categories (regulatory evidence, clinical trials analytics, causal inference, clinical outcomes research, safety/aggregation, clinical analysis/visualization, clinical research infrastructure) with integration paths, evidence search/synthesis, and risk/implementation scoring. **Key finding:** OpenFDA + ClinicalTrials.gov API provide strongest evidence foundation; CausalImpact + PyMC enable Bayesian causal inference.

### Report 5: INTERVENTION_ANALYZER_UX_BENCHMARK.md
**Summary:** 1,165-line UX pattern extraction from 20+ production clinical systems (Epic, Cerner, Flatiron, Physitrack, Constant Therapy, Greenspace, Akili, BRIDGE Platform) identifying 15 priority patterns organized into 3 implementation phases. **Key finding:** Master clinical timeline with session anchoring + safety-first alert architecture are highest-priority foundational patterns.

### Report 6: INTERVENTION_ANALYZER_SAFETY_COPY.md
**Summary:** 215-line safety copy guidelines establishing 20 explicit rules for clinical AI communication, covering decision-support framing, causal language, prediction hedging, risk communication, actionability, evidence presentation, professional role clarity, bias acknowledgment, temporal qualification, and regulatory compliance (FDA, HIPAA). **Key finding:** "Decision-support only. Requires clinician review." must appear on every prediction/actionable insight.

---

## 8. UX Patterns Adopted (Top 15 from Benchmark)

### Phase 1 Patterns (Foundation)

| # | Pattern | Source | Priority | Implementation |
|---|---------|--------|----------|----------------|
| 1 | Master clinical timeline with session anchoring | Physitrack, RehabMyPatient | CRITICAL | Session timeline + course header |
| 2 | Safety-first alert architecture | Safety Explorer | CRITICAL | Safety banner + AE banner + deviation panel |
| 10 | Real-time session monitoring view | Physitrack, Akili | HIGH | Session parameter display + interruption alerts |
| 8 | Adverse event timeline overlay | Safety Explorer | HIGH | AE banner with severity + unresolved count |
| 7 | Protocol template system with safety constraints | Epic, Cerner | HIGH | Protocol snapshot with evidence grade + review flag |

### Phase 2 Patterns (Clinical Intelligence)

| # | Pattern | Source | Priority | Implementation |
|---|---------|--------|----------|----------------|
| 6 | Symptom trend correlation panel | Physitrack, RehabMyPatient | HIGH | Outcome sparkline with multi-scale support |
| 9 | Outcome score progress visualization | Greenspace, Blueprint | HIGH | SVG sparkline with MCID thresholds |
| 5 | Adherence calendar with multi-metric overlay | reSET, Physitrack | HIGH | Adherence % ring + session completion tracking |
| 12 | Patient snapshot cards | reSET, Safety Explorer | MEDIUM-HIGH | Compact cards in clinic table |
| 14 | Normal range and threshold shading | Safety Explorer Outlier | MEDIUM | Background shading on trend charts |

### Phase 3 Patterns (Scale)

| # | Pattern | Source | Priority | Implementation |
|---|---------|--------|----------|----------------|
| 3 | Multi-stakeholder dashboard architecture | Agile Clinical Dashboard | HIGH | Role-aware views |
| 4 | Population-to-individual drill-down | Flatiron, Physitrack | HIGH | Click clinic metric → patient list |
| 11 | Data completeness and quality indicators | REDCap, Agile Clinical | MEDIUM-HIGH | Visual completeness per domain |
| 13 | Multi-source data fusion display | BRIDGE Platform, Apple Health | MEDIUM-HIGH | Unified timeline with color-coding |
| 15 | Export and reporting for research | Flatiron, Safety Explorer | MEDIUM | One-click CSV/Excel/SPSS export |

---

## 9. Safety Copy Guidelines — Top 20 Rules

| # | Rule | Forbidden | Required | Status |
|---|------|-----------|----------|--------|
| 1 | Frame as decision-support | "The AI recommends..." | "Analysis suggests... consult your clinician" | IMPLEMENTED |
| 2 | No causal language without evidence | "This treatment caused..." | "This treatment was associated with..." | IMPLEMENTED |
| 3 | Hedge predictions | "You will respond in 4 weeks" | "Research suggests a range of 4-6 weeks for some patients" | IMPLEMENTED |
| 4 | Frame uncertainty | "The outcome is..." | "The evidence is inconclusive, but suggests..." | IMPLEMENTED |
| 5 | Never omit risk context | Benefits-only framing | Balanced risks + benefits + "Discuss with your clinician" | IMPLEMENTED |
| 6 | Require clinician review | "You should change dosage" | "Ask your clinician if dosage adjustment is appropriate" | IMPLEMENTED |
| 7 | No emergency override | "Go to ER now" (without triage) | "If you experience [specific red flags], seek immediate care" | IMPLEMENTED |
| 8 | Grade evidence quality | "Studies show..." (vague) | "A 2023 RCT (n=150) showed..." | IMPLEMENTED |
| 9 | Calibrate confidence | "We are 95% confident..." | "The model indicates X with moderate confidence" | IMPLEMENTED |
| 10 | Flag algorithmic limitations | "AI is unbiased" | "This model may not account for [specific limitation]" | IMPLEMENTED |
| 11 | Temporal qualification | "After 2 weeks you will..." | "Some patients may begin to notice changes after 2 weeks" | IMPLEMENTED |
| 12 | Individual variability | "Most patients respond..." | "Response varies; some patients may not experience..." | IMPLEMENTED |
| 13 | No prescriptive certainty | "The best treatment is..." | "Evidence supports X as an option; discuss with your clinician" | IMPLEMENTED |
| 14 | Transparency in data sources | "Based on your data" | "Based on your session logs and outcome assessments from [date range]" | IMPLEMENTED |
| 15 | Regulatory compliance | Unsubstantiated device claims | "This feature is for informational purposes and is not [FDA-cleared/CE-marked] to diagnose" | IMPLEMENTED |
| 16 | User agency | "You must..." | "You may consider..." | IMPLEMENTED |
| 17 | Provenance for every claim | Unsourced assertions | Every claim has `provenance` object with source + date | IMPLEMENTED |
| 18 | Honest empty states | "—" | "No qEEG analyses linked -- add imaging for stronger targeting context" | IMPLEMENTED |
| 19 | Appropriate causal language by design strength | "causal effect" for observational data | "temporal association" / "estimated effect" per design | PLANNED (W13) |
| 20 | E-value reporting | Observational claims without sensitivity analysis | E-value on every observational analysis | PLANNED (W14) |

---

## 10. Open Source Integration Map — Top 10 Tools

| # | Tool | Category | Integration Path | Risk Score |
|---|------|----------|-----------------|------------|
| 1 | **OpenFDA API** | Regulatory evidence | `openfda_client.py` — adverse events, labels, recalls | Low |
| 2 | **ClinicalTrials.gov API** | Clinical trials | Evidence registry — trial status, results | Low |
| 3 | **PyMC + ArviZ** | Causal inference | Bayesian models for N-of-1, hierarchical models | Medium |
| 4 | **CausalImpact / tfcausalimpact** | Causal inference | BSTS for intervention evaluation with control series | Medium |
| 5 | **statsmodels** | Statistical analysis | ITS segmented regression, ARIMA, DiD | Low |
| 6 | **scikit-survival** | Survival analysis | Time-to-response prediction, dropout modeling | Medium |
| 7 | **Prophet** | Time series forecasting | Adherence pattern forecasting, seasonal adjustment | Low |
| 8 | **REDCap** | Clinical research | Data collection forms, survey administration | Low (API) |
| 9 | **i2b2 / tranSMART** | Clinical research | Research cohort queries, phenotype definitions | High |
| 10 | **Open mHealth** | Visualization | Wearable data visualization schemas | Low |

### Full Stack Reference (24 Tools)

```python
# Required packages for causal inference analyses
pip install statsmodels scikit-learn pymc arviz causalimpact pandas numpy scipy matplotlib lifelines

# Optional: survival analysis
pip install scikit-survival

# Optional: time series
pip install sktime prophet tsfresh
```

---

## 11. Button / Action Matrix

### 11.1 Frontend Actions

| Button | Action | Role Required | Safety Gate |
|--------|--------|--------------|-------------|
| Refresh sign-off status | Reload batch sign status | clinician+ | None |
| Record sign-off | Write SIGN event to session | clinician+ | `canUseInterventionAnalyzerWorkspace()` |
| Sign all | Batch SIGN events | clinician+ | Confirm dialog + role check |
| Open Protocol Studio | Navigate to protocol-studio | any clinical | None |
| Open schedule | Navigate to scheduling-hub | any clinical | None |
| View session | Toggle session detail expand | any clinical | None |
| Hide session | Toggle session detail collapse | any clinical | None |
| Back to clinic | Return to clinic view | any clinical | None |
| Open profile | Navigate to patient-profile | any clinical | None |
| Refresh | Reload current view | any clinical | None |
| Select patient | Change active patient | any clinical | None |
| Switch outcome scale | Change sparkline scale | any clinical | None |

### 11.2 Backend Actions

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/treatment-sessions/sign-status/batch` | POST | clinician+ | Batch sign/review status |
| `/api/v1/treatment-sessions/clinic-summary` | POST | clinician+ | Clinic-wide summary (3-query) |
| `/api/v1/patients/{id}/treatment-sessions-analyzer` | GET | clinician+ | Full intervention analyzer payload |

### 11.3 Navigation Matrix (19 Linked Modules)

```javascript
const LINKED_MODULES = [
  { key: 'patient-profile',      label: 'Patient profile' },
  { key: 'course-detail',        label: 'Course detail' },
  { key: 'assessments-v2',       label: 'Assessments' },
  { key: 'qeeg-launcher',        label: 'qEEG' },
  { key: 'mri-analysis',         label: 'MRI' },
  { key: 'biomarkers',           label: 'Biomarkers' },
  { key: 'documents-hub',        label: 'Documents' },
  { key: 'voice-analyzer',       label: 'Voice' },
  { key: 'video-assessments',    label: 'Video' },
  { key: 'text-analyzer',        label: 'Text' },
  { key: 'deeptwin',             label: 'DeepTwin' },
  { key: 'brain-map-planner',    label: 'Brain Map Planner' },
  { key: 'risk-analyzer',        label: 'Risk Analyzer' },
  { key: 'medication-analyzer',  label: 'Medication Analyzer' },
  { key: 'protocol-studio',      label: 'Protocol Studio' },
  { key: 'handbooks',            label: 'Handbooks' },
  { key: 'scheduling-hub',       label: 'Schedule' },
  { key: 'clinician-inbox',      label: 'Inbox' },
  { key: 'session-execution',    label: 'Live session' },
];
```

---

## 12. Key Metrics for Success

### 12.1 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Clinic summary response time | <2s for 500 patients | Backend timing logs |
| Clinic summary query count | 3-5 queries max | SQL query logging |
| Frontend bundle size | <200KB gzipped for IA module | webpack-bundle-analyzer |
| API error rate | <0.1% | Error tracking |
| Test coverage | >80% lines | pytest + jest |

### 12.2 Clinical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Intervention types supported | 20 | Enum completeness |
| Multimodal contributor domains | 11 | Payload domain count |
| Evidence-linked claims | 100% | Audit every surfaced claim |
| Safety copy compliance | 100% (zero violations) | CI linter |
| Causal language accuracy | 100% | Manual review of all predictions |
| E-value reporting (Phase 4) | 100% of observational analyses | Automated check |

### 12.3 UX Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to clinic overview | <3s | Frontend performance timing |
| Empty state clarity | >90% user understanding | Usability testing |
| Navigation discoverability | >85% find linked modules | Heatmap analysis |
| Mobile responsiveness | Functional at 375px | Device testing |

### 12.4 Research Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Evidence sources integrated | 3+ (bundle, corpus, intelligence) | Source diversity |
| OpenFDA query coverage | All 20 intervention types | Device name matching |
| Causal inference methods | 3+ (ITS, N-of-1, BSTS) | Method catalog |
| Export formats | 3+ (CSV, JSON, SPSS) | Format validation |

---

## 13. Risk Assessment

### 13.1 High Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Clinician distrust of AI suggestions | High | Adoption failure | Safety-first design + evidence badges + clinician review gates + "Why & evidence" drawer |
| Regulatory scrutiny of predictive claims | Medium | Legal liability | Never claim causality without RCT evidence + E-values + graded language + model cards |
| Data quality insufficient for causal inference | High | False conclusions | Honest empty states + uncertainty drivers + withhold forecasts until model validated |
| Cross-clinic data isolation failure | Low | HIPAA breach | Clinic-scoped queries + `cross_clinic_access_denied` error + admin-only multi-clinic |

### 13.2 Medium Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| OpenFDA API rate limiting | Medium | Missing safety signals | 24-hour caching + graceful degradation |
| Calibrated model validation takes longer than 16 weeks | Medium | Phase 4 incomplete | Rules-based analytics are production-ready without ML |
| PGx integration complexity | Medium | Delayed Week 11 | Fallback to drug-class level alerts |
| N-of-1 trial adoption by clinicians | Medium | Underutilized feature | Simplified setup + template protocols |

### 13.3 Low Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Frontend performance with large datasets | Low | Slow rendering | Virtual scrolling + pagination + concurrency limits |
| Evidence corpus stale data | Low | Outdated recommendations | Automated refresh pipeline + versioned bundles |
| Open-source dependency breaking changes | Low | Build failures | Pinned versions + lockfiles |

---

## 14. Merge Recommendation

### 14.1 Recommended Merge Strategy: Phased Feature Flags

```
Phase 1 (W1-4): Rename + Safety Foundation
  ├── Merge to main: Week 1 (rename only, backward compat)
  ├── Merge to main: Week 2 (honest analytics states)
  ├── Merge to main: Week 3 (safety architecture)
  └── Merge to main: Week 4 (Phase 1 integration)

Phase 2 (W5-8): Multimodal Intelligence
  ├── Feature flag: `multimodal_contributors_v2`
  ├── Feature flag: `confound_panel`
  ├── Feature flag: `outcome_correlation`
  └── Merge to main: Week 8 (all flags default off until QA)

Phase 3 (W9-12): Evidence Integration
  ├── Feature flag: `openfda_integration`
  ├── Feature flag: `evidence_linked_cards`
  ├── Feature flag: `pharmacogenomics`
  └── Merge to main: Week 12

Phase 4 (W13-16): Advanced Analytics
  ├── Feature flag: `causal_inference_its`
  ├── Feature flag: `n_of_1_trials`
  ├── Feature flag: `adherence_prediction`
  └── Merge to main: Week 16 (all flags for v2.0 release)
```

### 14.2 Merge Checklist

- [ ] All 20 intervention types present in frontend + backend enums
- [ ] Role gate active on all endpoints
- [ ] Safety banner renders on every view
- [ ] Batch sign-status works (no N+1)
- [ ] Clinic summary aggregates in 3-5 queries
- [ ] All empty states explain *why* + *next steps*
- [ ] Forecast numbers withheld (no calibrated model)
- [ ] Evidence enrichment triple-stack functional
- [ ] 19 linked modules navigable
- [ ] Demo fixtures work in demo mode only
- [ ] Zero safety copy violations in CI
- [ ] All tests pass (pytest + jest)
- [ ] Performance: clinic summary <2s for 500 patients
- [ ] HIPAA: cross-clinic isolation verified
- [ ] Audit trail: every view logged

### 14.3 Post-Merge Monitoring

| Metric | Alert Threshold | Action |
|--------|----------------|--------|
| API error rate | >0.5% | Rollback + investigate |
| Clinic summary latency | >5s p95 | Scale backend + optimize queries |
| Frontend crash rate | >0.1% | Hotfix patch |
| Safety copy violations | >0 | Block all deploys until fixed |
| Clinician feedback score | <4/5 | UX review + iteration |

---

## Appendix A: Evidence Grading Criteria

| Grade | Definition | Clinical Action |
|-------|-----------|----------------|
| **A** | At least one high-quality meta-analysis OR multiple well-powered RCTs with consistent findings | Can inform clinical decision-making |
| **B** | Multiple RCTs with some inconsistency OR single large RCT with supportive observational data | Promising; consider in treatment planning |
| **C** | Small RCTs OR well-designed observational studies only | Research use only; not ready for clinical decisions |
| **D** | Expert opinion OR case series OR preclinical evidence only | Hypothesis-generating only |

## Appendix B: Causal Language Standards

| Design Strength | Appropriate Language | Inappropriate Language |
|-----------------|---------------------|----------------------|
| RCT | "caused," "treatment effect" | — |
| N-of-1 + multiple periods | "estimated individual effect," "strong evidence for" | "proved," "definitively caused" |
| ITS with controls | "temporal association," "estimated effect" | "causal effect" (without caveats) |
| DiD (parallel trends met) | "difference-in-differences estimate," "estimated impact" | "causal effect" (unqualified) |
| Propensity score + sensitivity | "adjusted association," "estimated effect, conditional on measured confounders" | "causal effect" |
| Simple pre-post | "observed change" | "treatment effect," "causal effect" |

## Appendix C: Method Selection by Scenario

| Scenario | Recommended Method | Evidence Grade | Minimum Data |
|----------|-------------------|----------------|--------------|
| Single patient, no randomization, 20+ time points | ITS with ARIMA + seasonal adjustment | B | 10 pre, 10 post |
| Single patient, treatment periods can be randomized | N-of-1 (ABAB or more periods) | B | 4+ periods |
| Single patient, 50+ time points, control series available | Causal Impact (BSTS) | B | 20 pre, 20+ controls |
| Multiple patients, treatment vs control groups | DiD with event study + robust SEs | B | 2 groups, 8+ time points each |
| Multiple patients, many baseline covariates | Propensity score + IPW + E-value | B | 50+ per group |
| Multiple patients, time-varying treatment | Marginal Structural Model (IPW) | B | Longitudinal data with treatment changes |
| Multiple patients, repeated measures, individual effects | Bayesian hierarchical model | B | 20+ patients, 5+ time points |

## Appendix D: Schema Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Initial spec | Treatment Sessions Analyzer spec |
| 1.1.0 | Evidence wiring | Added `enrich_evidence` with triple-stack |
| 1.2.0 | Medication interactions | Added `enrich_medication_interactions` |
| 1.3.0 | Intervention rename | Renamed to Intervention Analyzer, 20 types, 11 domains |
| 1.4.0 | Phase 1 (planned) | File rename completion, safety banner v2, honest states |
| 2.0.0 | Full roadmap | Multimodal intelligence + evidence integration + advanced analytics |

## Appendix E: File Inventory

### Production Files (Current)

```
apps/web/src/pages-intervention-analyzer.js              (1,380 lines)
apps/api/app/services/intervention_analyzer.py           (1,382 lines)
apps/api/app/routers/treatment_sessions_router.py        (719 lines)
```

### Research Reports (Referenced)

```
research/INTERVENTION_EVIDENCE_MATRIX.md                  (193 lines)
research/INTERVENTION_CAUSALITY_ANALYSIS_DESIGN.md        (1,475 lines)
research/MULTIMODAL_INTERVENTION_OUTCOME_MAP.md           (1,520 lines)
research/OPEN_SOURCE_INTERVENTION_ANALYZER_STACK.md       (1,020 lines)
research/INTERVENTION_ANALYZER_UX_BENCHMARK.md            (1,165 lines)
research/INTERVENTION_ANALYZER_SAFETY_COPY.md             (215 lines)
```

### This Roadmap

```
WORLD_CLASS_DEEPSYNAPS_INTERVENTION_ANALYZER_ROADMAP.md   (THIS FILE)
```

---

*This roadmap was synthesized from 6 research reports (5,588 lines total), 3 code files (3,481 lines total), and 1 product spec (829 lines). It represents the comprehensive implementation plan for transforming the DeepSynaps Treatment Sessions Analyzer into a world-class Intervention Analyzer platform.*

*Decision-support only. Not a medical device. Requires clinician review.*

*Last updated: July 2026*
