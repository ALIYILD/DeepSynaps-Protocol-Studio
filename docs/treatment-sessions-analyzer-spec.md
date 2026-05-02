# Treatment Sessions Analyzer + Protocol Intelligence — Product & Engineering Spec

**Status:** Product spec + v1 **API** (`GET /api/v1/patients/{id}/treatment-sessions-analyzer`) and **web** route `treatment-sessions-analyzer` (rules-based aggregate payload; models/evidence TBD).  
**Scope:** Clinician-facing workspace; **decision-support only** (not autonomous treatment).  
**Relevant modalities:** TMS, tDCS, TPS, VNS, DBS, CES, and related neuromodulation workflows.  
**Product line:** Health/wellness optimization and clinical disorder-focused care, with explicit transparency and regulatory-appropriate language.

This document is the build contract for a new DeepSynaps Studio page. It complements existing analyzers (qEEG, MRI, assessments, video, voice, text, biometrics, risk, medications) by anchoring **when** neuromodulation occurred, **with what parameters**, and **how that context changes interpretation** of longitudinal biomarkers and outcomes.

### DR / pilot readiness (engineering)

Use this before clinician design review or pilot demos:

| Gate | Expectation |
|------|-------------|
| API contract | `GET /api/v1/patients/{patient_id}/treatment-sessions-analyzer` returns `schema_version` + core panels; works when **no** `TreatmentCourse` exists (sessions-only chart). |
| Auth | Clinician + patient self paths consistent with other `/patients/{id}/…` resources; guest denied. |
| Tests | API: `pytest tests/test_treatment_sessions_analyzer.py`; Web: `treatment-sessions-analyzer-launch-audit.test.js` + full `apps/web` `test:unit` in CI. |
| Honest limits | Response probability and session ranges are **heuristic** until `meta` lists a calibrated model version; multimodal “stubs” are explicit in UI. |
| Staging smoke | Load a patient with course + sessions + at least one MRI or qEEG row; confirm contributors populate and no 500s. |

---

## PART 1 — PAGE PURPOSE

### 1.1 Why DeepSynaps needs this page

DeepSynaps already produces rich per-domain signals. Neuromodulation is **time-structured**: sessions introduce interventions whose effects interact with biomarkers, symptoms, and tolerability on specific horizons. Without a first-class **treatment course** object:

- Biomarker shifts may be misattributed (state vs intervention vs medication vs life stress).
- Protocol planning lacks a single place to reconcile **evidence**, **patient constraints**, and **observed course**.
- Adherence, dropout risk, and side-effect burden are invisible when fragmented across notes or a generic profile.

This page provides a **clinician workspace** to:

| Capability | User value |
|------------|------------|
| Treatment-course overview | One authoritative timeline of neuromodulation for the patient. |
| Session-by-session review | Parameters, completion, experience, and linked measures per visit. |
| Adherence / completion | Planned vs delivered sessions; patterns of misses. |
| Side-effect / tolerability | Structured tracking tied to protocol changes and timing. |
| Outcome tracking | Symptom and functional measures vs expected trajectories. |
| Protocol planning | Candidate protocols/targets with **uncertainty** and **review** gates. |
| Response prediction | Probability ranges and session-count estimates that **update** as data arrive. |
| Dynamic recalibration | Forecasts refresh after new sessions and new multimodal data. |

### 1.2 Why a dedicated analyzer (not only notes or profile)

1. **Temporal coupling:** Sessions define windows for pre/post comparisons (qEEG, MRI, assessments). The analyzer encodes **session boundaries** and **parameter sets** so downstream analytics know what changed and when.
2. **Structured parameters:** Intensity, frequency, pulse waveform, montage, target, phase — these must be machine-readable for rules, safety checks, and evidence linking.
3. **Cross-analyzer integration:** A profile field cannot express **links** to MRI reports, qEEG epochs, wearables, or video/voice sessions with provenance. The payload model below makes those links explicit.
4. **Auditability:** Protocol suggestions vs clinician decisions, overrides, and evidence citations require an **audit trail** tied to the course, not free text alone.

### 1.3 How treatment sessions affect interpretation of other analyzers

| Domain | Without session context | With session context |
|--------|------------------------|----------------------|
| **qEEG / EEG** | Shift may look like trait or sleep artifact. | Windows relative to stimulation can separate acute vs chronic EEG effects; confound risk is explicit. |
| **MRI / fMRI** | Structural/functional change timing unclear. | Pre/post imaging aligned to phase (acute vs maintenance) improves attribution; targeting hypotheses reference anatomy. |
| **Biometrics** | Trends lack intervention markers. | HR/HRV, sleep, activity can be modeled with session indicators and medication overlays. |
| **Video / movement** | Motor or activation changes ambiguous. | Session dates anchor “on stimulation” vs recovery periods if capture exists. |
| **Voice / speech** | Prosody changes multi-causal. | Dose changes and side effects (fatigue, anxiety) can be temporally associated with session records. |
| **Text / notes** | Unstructured only. | NLP can still run, but structured session records ground extracted events. |
| **Assessments** | Scores without phase. | PHQ-9/GAD-7 (and condition-specific scales) gain **expected trajectory bands** and recalibration after new sessions. |

### 1.4 How MRI, qEEG, assessments, and biometrics should influence planning

- **MRI / fMRI:** Target/site hypotheses (e.g., DLPFC localization), safety constraints (lesions), stratification features where evidence supports them — always with **confidence** and modality-specific limitations (see internal MRI docs).
- **qEEG / EEG:** Predictive features for response probability where literature supports them; **responsive** monitoring (e.g., engagement proxies) for dose/timing decisions — separated by biomarker class (see Part 5).
- **Assessments:** Baseline severity, trajectory, and clinically meaningful change thresholds drive **session-count priors** and **nonresponse** detection.
- **Biometrics:** Tolerability (sleep, autonomic stress) and adherence proxies; may elevate **dropout risk** or suggest spacing/intensity review.

**Product stance:** All of the above feed **suggestions** and **forecasts with uncertainty**. They do not replace clinical judgment or device-specific labeling.

### 1.5 UI disclaimers (required)

Surface consistently in header and near any numeric prediction:

- **Decision-support only;** not a medical device instruction for treatment. Does not prescribe, program devices, or change parameters autonomously.
- **Clinician review required** for any protocol, target, dose, or schedule implication.
- **Predictions are probabilistic** and depend on data completeness; ranges reflect uncertainty, not guarantees.
- **Wellness vs disorder contexts:** Language adapts; wellness flows avoid diagnostic claims; clinical flows reference assessments and standards without substituting for evaluation.
- **Evidence:** Suggestions may cite guidelines or literature; strength varies — show **strength/confidence** always.
- **Test-retest / acquisition variability:** Biomarkers have reliability limits; do not overclaim certainty (align with MRI/qEEG limitation messaging elsewhere in the product).

---

## PART 2 — PAGE STRUCTURE

### A. Header / summary

- **Title:** Treatment Sessions Analyzer + Protocol Intelligence  
- **Subtitle:** Neuromodulation course review, multimodal context, and protocol decision-support (non-prescriptive).  
- **Decision-support disclaimer:** Short paragraph + link to expanded safety/evidence policy (reuse product-wide patterns from `docs/protocol_evidence_governance.md` / safety docs where applicable).

### B. Protocol Planning Snapshot

- Likely **protocol candidates** (ranked) with confidence bands.  
- Likely **target/site** candidates (modality-specific ontology).  
- **Predicted response probability** (with horizon label, e.g., acute phase weeks 1–4).  
- **Estimated session-count range** (e.g., median + credible interval or min–max with qualifier).  
- **Modality suitability** (contraindication flags as deterministic rules).  
- **Confidence / uncertainty** (missing data, sparse sessions, conflicting biomarkers).  
- **Why-this-is-suggested** (bullet summary + expandable evidence).

### C. Treatment Course Snapshot

- Active **modality** (TMS, tDCS, etc.).  
- **Current protocol status** (name/version, start date).  
- **Completed vs planned** sessions.  
- **Interrupted/missed** counts and last miss date.  
- **Response status** (on track / partial / nonresponse / unclear — rule+model hybrid).  
- **Side-effect burden** (aggregate score or tier).  
- **Phase** (acute / continuation / maintenance / rescue).

### D. Session Timeline

Table or swimlane; each row/session card:

- Date/time (timezone-aware).  
- Modality; device/program identifier if available.  
- Protocol / target labels.  
- **Parameters** (see `SessionParameterSet`).  
- Duration; attendance/completion status.  
- Patient-reported experience (quick scales + free text optional).  
- Acute side effects (structured picklist + severity).  
- Linked **pre/post** measures (IDs to assessments, qEEG epochs, biometrics windows, imaging studies).

### E. Multimodal Contributors Panel

For each contributor type, show **role**: predictive vs responsive, **weight or relevance** (qualitative or scored), **last update**, **data quality**, **links** to sibling analyzers:

- MRI / fMRI  
- qEEG / EEG  
- Assessments  
- Biometrics  
- Medications  
- Video / movement  
- Voice / speech  
- Text / notes  
- Prior treatment history  

### F. Outcomes & Response Panel

- PHQ-9, GAD-7, condition-specific measures **over time** (with session markers).  
- Biomarker trends (selected metrics per availability).  
- Subjective improvement (PRO).  
- Functional outcomes (e.g., work/social — as captured).  
- **Expected vs observed** response trajectory (band from model + observed points).  
- **Recalibration** note after new sessions (“forecast updated on &lt;date&gt;”).

### G. Side-Effect / Tolerability Panel

Structured tracking:

- Headache; discomfort/pain; fatigue; sleep disruption; agitation/mood worsening; seizure / SAE flags.  
- Timing vs **protocol changes** and session events.  
- Severity and action suggestions (review prompts only).

### H. Protocol Optimization Panel

- Remap/retarget **prompts** (not automatic changes).  
- Spacing/frequency **review**.  
- Intensity/dose **review**.  
- Maintenance/rescue **suggestions**.  
- Switch / stay / escalate **prompts** (decision framing, not commands).  
- **Clinician review** CTAs with audit hooks.

### I. Audit / Review Panel

- Who reviewed (user id, role).  
- Protocol changes (from → to, rationale).  
- Notes.  
- Overrides (declined suggestion + reason).  
- Timestamps; immutable log append model.

---

## PART 3 — DATA MODEL (JSON-friendly schemas)

**Conventions:**

- All top-level payloads include `schema_version`, `generated_at` (ISO 8601), `patient_id`, `provenance`.  
- **Provenance** = `{ "source": "api"|"import"|"manual"|"rules_engine"|"model"|"external_ehr", "source_ref": "...", "extracted_at": "..." }`.  
- **Confidence** where relevant: `0..1` or enum `low|medium|high` plus optional numeric CI.  
- **Biomarker role:** `predictive` | `responsive` | `unknown` (see §22).

### 3.1 `TreatmentSessionsAnalyzerPagePayload`

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-05-02T12:00:00Z",
  "patient_id": "pat_123",
  "provenance": { "source": "api", "source_ref": "treatment_sessions_analyzer/v1", "extracted_at": "2026-05-02T12:00:00Z" },
  "page_title": "Treatment Sessions Analyzer + Protocol Intelligence",
  "disclaimer_refs": ["policy://decision-support-v1"],
  "planning_snapshot": { },
  "course": { },
  "sessions": [ ],
  "multimodal_contributors": [ ],
  "outcome_trends": [ ],
  "side_effect_events": [ ],
  "optimization_prompts": [ ],
  "recommendations": [ ],
  "evidence_links": [ ],
  "audit_events": [ ],
  "data_gaps": [ ],
  "prediction_horizon": { "label": "acute_phase_weeks_1_4", "start": "...", "end": "..." }
}
```

### 3.2 `ProtocolPlanningSnapshot`

```json
{
  "updated_at": "2026-05-02T12:00:00Z",
  "provenance": { "source": "model", "source_ref": "response_forecast/v0", "extracted_at": "..." },
  "modality": "TMS",
  "candidate_protocols": [ ],
  "candidate_targets": [ ],
  "response_probability": { "point": 0.62, "ci": [0.45, 0.78], "horizon": "12_weeks" },
  "session_count_estimate": { "median": 28, "range": [20, 36], "unit": "sessions" },
  "modality_suitability": { "status": "generally_suitable", "flags": [ ] },
  "uncertainty": { "level": "medium", "drivers": ["sparse_qeeg", "only_4_sessions_completed"] },
  "why_summary": "Short narrative bullets",
  "biomarker_roles_used": { "predictive": ["qeeg_frontal_theta"], "responsive": ["phq9_slope"] },
  "confidence": 0.55
}
```

### 3.3 `CandidateProtocolRecommendation`

```json
{
  "id": "cpr_001",
  "created_at": "2026-05-02T12:00:00Z",
  "provenance": { "source": "rules_engine", "source_ref": "protocol_rules/depression_tms_v2", "extracted_at": "..." },
  "modality": "TMS",
  "protocol_key": "HFT_DLPFC_A",
  "label": "High-frequency left DLPFC (example)",
  "waveform_family": "rTMS_biphasic",
  "evidence_strength": "moderate",
  "confidence": 0.7,
  "rank": 1,
  "rationale_bullets": [ ],
  "evidence_link_ids": [ "tel_1", "tel_2" ],
  "contraindication_hits": [ ],
  "requires_clinician_review": true
}
```

### 3.4 `TargetRecommendation`

```json
{
  "id": "tr_001",
  "created_at": "2026-05-02T12:00:00Z",
  "provenance": { "source": "model", "source_ref": "target_ranker/v0", "extracted_at": "..." },
  "modality": "TMS",
  "anatomical_target": "left_DLPFC",
  "coordinate_space": "MNI152",
  "coordinates_mm": [ -45.2, 32.1, 48.0 ],
  "confidence": 0.6,
  "mri_anchor_study_id": "mri_report_xyz",
  "uncertainty_mm": 5.2,
  "biomarker_role": "predictive",
  "notes": "Hypothesis only — verify with imaging + clinical context."
}
```

### 3.5 `SessionDoseEstimate`

```json
{
  "id": "sde_001",
  "created_at": "2026-05-02T12:00:00Z",
  "provenance": { "source": "rules_engine", "source_ref": "dose_estimator/v0", "extracted_at": "..." },
  "modality": "TMS",
  "phase": "acute",
  "intensity": { "type": "percent_MT", "value": 120, "confidence": 0.5 },
  "sessions_per_week": { "min": 5, "max": 5 },
  "total_sessions_planned": { "point": 36, "range": [30, 36] },
  "time_horizon": "index_treatment_course",
  "rationale": "Initial estimate from guidelines + baseline MT; update after early response.",
  "linked_parameters": { "mt_percent": 120, "trains_per_session": 75 },
  "confidence": 0.5
}
```

### 3.6 `TreatmentCourse`

```json
{
  "id": "tc_001",
  "updated_at": "2026-05-02T12:00:00Z",
  "provenance": { "source": "manual", "source_ref": "clinician_form", "extracted_at": "..." },
  "modality": "TMS",
  "indication_context": { "type": "clinical", "condition_codes": [ "F32.1" ] },
  "wellness_mode": false,
  "protocol_status": { "name": "HF-L-DLPFC", "version": "2025-Q4", "started_on": "2026-01-10" },
  "phase": "acute",
  "planned_sessions": 36,
  "completed_sessions": 12,
  "missed_sessions": 2,
  "last_session_at": "2026-04-28T15:00:00Z",
  "response_status": "partial_response",
  "side_effect_burden": { "score": 0.35, "tier": "moderate" },
  "linked_analyzer_ids": {
    "mri": [ "mri_1" ],
    "qeeg": [ "qeeg_1" ],
    "assessments": [ "phq9_series" ],
    "biometrics": [ "wearable_1" ],
    "medications": [ "med_profile_1" ],
    "video": [ ],
    "voice": [ ],
    "text": [ "notes_1" ]
  }
}
```

### 3.7 `TreatmentSessionRecord`

```json
{
  "id": "tsr_001",
  "session_index": 13,
  "started_at": "2026-04-28T14:00:00Z",
  "ended_at": "2026-04-28T14:38:00Z",
  "timezone": "America/New_York",
  "provenance": { "source": "import", "source_ref": "ehr://visit/123", "extracted_at": "..." },
  "modality": "TMS",
  "protocol_label": "HF-L-DLPFC",
  "target": { "label": "left_DLPFC", "confidence": 0.9 },
  "parameters": { },
  "duration_minutes": 37,
  "status": "completed",
  "attendance": "full",
  "patient_experience": { "comfort": 3, "anxiety": 2, "notes": "..." },
  "acute_side_effects": [ { "type": "headache", "severity": 2 } ],
  "linked_pre_measures": [ { "type": "PHQ9", "assessment_id": "a1", "taken_at": "..." } ],
  "linked_post_measures": [ ],
  "linked_analyzers_impacted": [ "qeeg_window_post72h", "hrv_night_of" ],
  "severity_for_monitoring": "routine",
  "urgency": "none"
}
```

**Enums:** `status`: `planned` | `completed` | `missed` | `cancelled` | `partial`; `phase`: `acute` | `continuation` | `maintenance` | `rescue`; `modality`: extensible string enum per regulatory/product list.

### 3.8 `SessionParameterSet`

Modality-specific optional fields; all scalar fields allow `null` if unknown.

```json
{
  "mt_percent": 120,
  "frequency_hz": 10,
  "pulse_width_us": 280,
  "coil_type": "figure8",
  "train_duration_s": 4,
  "inter_train_interval_s": 26,
  "trains_per_session": 75,
  "total_pulses": 3000,
  "electrode_montage": null,
  "current_ma": null,
  "dbs_contact": null,
  "provenance": { "source": "manual", "source_ref": "session_form", "extracted_at": "..." },
  "confidence": 0.85
}
```

### 3.9 `MultimodalContributor`

```json
{
  "id": "mmc_001",
  "updated_at": "2026-05-02T12:00:00Z",
  "provenance": { "source": "api", "source_ref": "fusion_service/v1", "extracted_at": "..." },
  "domain": "qeeg",
  "biomarker_role": "predictive",
  "summary": "Elevated theta — stratification feature per internal evidence link.",
  "relevance_score": 0.42,
  "confidence": 0.55,
  "data_quality": "good",
  "linked_artifact_ids": [ "qeeg_report_1" ],
  "linked_analyzer_route": "/patient/{id}/qeeg",
  "impacted_predictions": [ "response_probability", "target_hypothesis" ],
  "caveats": [ "test-retest unknown for this metric" ]
}
```

### 3.10 `TreatmentOutcomeTrend`

```json
{
  "id": "tot_001",
  "measure_key": "PHQ9",
  "provenance": { "source": "assessments", "source_ref": "series/phq9", "extracted_at": "..." },
  "points": [ { "t": "...", "value": 18, "session_index": 0 } ],
  "trajectory_class": "improving",
  "expected_band": { "lower": [ ], "upper": [ ], "model_version": "trajectory_v0" },
  "last_recalibrated_at": "2026-05-02T12:00:00Z",
  "confidence": 0.6
}
```

### 3.11 `TreatmentSideEffectEvent`

```json
{
  "id": "tse_001",
  "occurred_at": "2026-04-28T16:00:00Z",
  "provenance": { "source": "patient_reported", "source_ref": "session_tsr_001", "extracted_at": "..." },
  "category": "headache",
  "severity": 2,
  "related_session_id": "tsr_001",
  "related_protocol_change": null,
  "urgency": "low",
  "sa_flag": false,
  "confidence": 0.9,
  "notes": ""
}
```

### 3.12 `ProtocolOptimizationPrompt`

```json
{
  "id": "pop_001",
  "created_at": "2026-05-02T12:00:00Z",
  "provenance": { "source": "rules_engine", "source_ref": "tolerability_rules/v1", "extracted_at": "..." },
  "prompt_type": "spacing_review",
  "severity": "moderate",
  "urgency": "routine",
  "title": "Consider spacing review after repeated headaches",
  "detail": "…",
  "suggested_actions": [ { "label": "Review intensity", "type": "clinician_review" } ],
  "deterministic": true,
  "evidence_link_ids": [ "tel_x" ],
  "requires_clinician_review": true,
  "confidence": 0.8
}
```

### 3.13 `TreatmentRecommendation`

```json
{
  "id": "trec_001",
  "created_at": "2026-05-02T12:00:00Z",
  "provenance": { "source": "model", "source_ref": "copilot_ranker/v0", "extracted_at": "..." },
  "kind": "protocol_candidate",
  "title": "Maintain current protocol with tolerability monitoring",
  "body": "…",
  "priority": "medium",
  "decision_support_only": true,
  "clinician_review_required": true,
  "structured": { "protocol_id": "cpr_001", "target_id": "tr_001" },
  "evidence_link_ids": [ ],
  "confidence": 0.55,
  "time_horizon": "next_4_sessions"
}
```

### 3.14 `TreatmentEvidenceLink`

```json
{
  "id": "tel_001",
  "created_at": "2026-05-02T12:00:00Z",
  "provenance": { "source": "evidence_api", "source_ref": "/api/v1/evidence/...", "extracted_at": "..." },
  "evidence_type": "literature",
  "title": "EEG markers and TMS response (example)",
  "snippet": "One-line excerpt…",
  "strength": "moderate",
  "confidence": 0.6,
  "uri": "https://…",
  "expand_behavior": "drawer_full_abstract",
  "related_domains": [ "eeg", "TMS" ]
}
```

### 3.15 `TreatmentReviewAuditEvent`

```json
{
  "id": "trae_001",
  "at": "2026-05-02T12:30:00Z",
  "actor": { "user_id": "usr_1", "role": "clinician" },
  "action": "override_suggestion",
  "subject": { "type": "CandidateProtocolRecommendation", "id": "cpr_001" },
  "from_state": { "selected": true },
  "to_state": { "selected": false },
  "rationale": "Patient preference and insurance constraints.",
  "immutable": true
}
```

---

## PART 4 — ANALYTICS MODULES

Each function lists **inputs**, **outputs**, **first-pass logic**, **rules vs ML**, and **analyzers informed**.

### 4.1 `normalize_treatment_sessions(raw_sessions, modality_schema) -> List[TreatmentSessionRecord]`

- **Inputs:** Raw rows from EHR/import/forms; modality-specific parameter schema.  
- **Outputs:** Validated, deduplicated session records with enums and UTC timestamps.  
- **Logic:** Parse dates; map local TZ; fill `session_index`; coerce parameters into `SessionParameterSet`; flag unknown fields.  
- **Rules first.**  
- **Informs:** All panels; biometrics/qEEG windowing.

### 4.2 `build_treatment_course_timeline(sessions, course_metadata) -> TreatmentCourse + timeline artifacts`

- **Inputs:** Normalized sessions; course-level metadata.  
- **Outputs:** `TreatmentCourse` aggregates; optional visualization bundle (bins for charts).  
- **Logic:** Sort by time; compute planned vs completed; assign phase if rules match dates or clinician labels.  
- **Rules first** (phase defaults); ML optional for phase inference later.  
- **Informs:** Session timeline UI; outcome charts.

### 4.3 `compute_session_adherence(sessions, plan) -> adherence_metrics`

- **Inputs:** Sessions; planned schedule (frequency, total count).  
- **Outputs:** Rates, gaps, streaks.  
- **Logic:** Compare actual intervals to plan; handle holidays/cancellations.  
- **Rules.**  
- **Informs:** Course snapshot; dropout module.

### 4.4 `detect_missed_session_patterns(sessions) -> pattern_alerts`

- **Inputs:** Sessions with status.  
- **Outputs:** Recurrent weekday misses, clustering before dropout.  
- **Logic:** Simple statistics + rule thresholds.  
- **Rules first.**  
- **Informs:** Optimization panel; audit narrative.

### 4.5 `detect_dropout_risk(adherence, side_effects, assessments, biometrics) -> risk_score + drivers`

- **Inputs:** Adherence metrics; side-effect burden; worsening assessment slopes; sleep/HRV proxies if present.  
- **Outputs:** Risk score 0–1, explainable drivers.  
- **Logic:** Weighted sum / logistic placeholder with conservative coefficients; **no autonomous action**.  
- **Hybrid:** Start rules + transparent weights; optional ML later with calibration.  
- **Informs:** Protocol snapshot; text/voice sentiment if integrated as features (optional).

### 4.6 `select_candidate_protocols(patient_context, evidence_registry, modality) -> List[CandidateProtocolRecommendation]`

- **Inputs:** Diagnosis/wellness flag; contraindications; evidence bundles from neuromodulation APIs (`docs/neuromodulation_evidence_ui_wiring_plan.md`).  
- **Outputs:** Ranked candidates with strength labels.  
- **Logic:** Filter by modality + indication; rank by evidence strength + feasibility; always attach citations.  
- **Rules + evidence DB first.**  
- **Informs:** Planning snapshot; recommendations.

### 4.7 `recommend_stimulation_target(mri_features, qeeg_features, modality, safety_constraints) -> List[TargetRecommendation]`

- **Inputs:** Summarized MRI targets (if available); EEG features; safety.  
- **Outputs:** Ranked targets with uncertainty.  
- **Logic:** Deterministic mapping tables where validated; else propagate **hypothesis** with wide uncertainty.  
- **Rules first;** ML ranking later with guardrails.  
- **Informs:** MRI analyzer cross-links; planning snapshot.

### 4.8 `combine_multimodal_predictors(contributors: List[MultimodalContributor], biomarker_class_map) -> fused_features`

- **Inputs:** Per-domain summaries; map feature → predictive/responsive.  
- **Outputs:** Vector or structured fusion + missingness report.  
- **Logic:** Missing-data-aware concatenation; weights higher for quality-rated domains; **never** hide missingness.  
- **Rules/ensemble first;** learned fusion later.  
- **Informs:** Response probability; contributor panel.

### 4.9 `estimate_initial_session_dose(modality, baseline_metrics, guidelines_ruleset) -> SessionDoseEstimate`

- **Inputs:** Modality; MT for TMS etc.; guideline tables.  
- **Outputs:** `SessionDoseEstimate`.  
- **Logic:** Table lookup + bounds; confidence low when baselines missing.  
- **Rules.**  
- **Informs:** Planning snapshot; parameter deviation checks.

### 4.10 `predict_response_probability(fused_features, modality, indication) -> probability + CI`

- **Inputs:** Fused features; context.  
- **Outputs:** Probabilistic forecast + horizon label.  
- **Logic:** Start with **prior** from population evidence + simple logistic on available features; wide CI when data sparse.  
- **Hybrid:** Calibrated simple model first; richer ML with governance.  
- **Informs:** Planning snapshot; outcomes panel expected bands.

### 4.11 `predict_partial_response_and_time_to_response(outcome_series, session_series) -> time_to_event_estimate`

- **Inputs:** Longitudinal outcomes; session markers.  
- **Outputs:** Estimated weeks/sessions to partial response with uncertainty.  
- **Logic:** Fit simple piecewise or Bayesian updating placeholder; conservative when N small.  
- **Hybrid.**  
- **Informs:** Session-count range; outcomes panel.

### 4.12 `update_response_forecast_with_new_sessions(prior_forecast, new_sessions, new_outcomes) -> updated_forecast`

- **Inputs:** Prior model state; deltas.  
- **Outputs:** Updated probabilities + “recalibrated at” timestamp.  
- **Logic:** Bayesian update or Kalman-like heuristic for demo; full model later.  
- **Hybrid.**  
- **Informs:** Course snapshot; disclosures.

### 4.13 `correlate_sessions_with_outcomes(sessions, outcomes) -> correlation_report`

- **Inputs:** Aligned time series.  
- **Outputs:** Lags, correlation coefficients, caveats.  
- **Logic:** Windowed correlation; multiple testing caution in UI.  
- **Rules/stats first.**  
- **Informs:** Multimodal panel; research export.

### 4.14 `estimate_response_trajectory(outcomes, model_prior) -> expected_band`

- **Inputs:** Outcomes; population trajectory prior.  
- **Outputs:** Expected band paths for chart overlays.  
- **Logic:** Parametric growth/decay defaults; personalize as N grows.  
- **Hybrid.**  
- **Informs:** Outcomes panel.

### 4.15 `detect_nonresponse_or_partial_response(outcomes, ruleset) -> labels`

- **Inputs:** Scale scores; minimal clinically important difference rules.  
- **Outputs:** Response labels + confidence.  
- **Rules first** (guideline thresholds where applicable).  
- **Informs:** Course snapshot; optimization prompts.

### 4.16 `detect_rebound_or_relapse_after_pause(sessions, outcomes) -> events`

- **Inputs:** Gaps in sessions; outcome spikes.  
- **Outputs:** Candidate relapse windows.  
- **Logic:** Rule-based gap detection + outcome threshold crossings.  
- **Rules first.**  
- **Informs:** Rescue/maintenance suggestions (review only).

### 4.17 `track_session_side_effects(session_events) -> aggregates`

- **Inputs:** Structured side-effect events.  
- **Outputs:** Burden score; category frequencies.  
- **Logic:** Weighted severity sums; taper by recency optional.  
- **Rules.**  
- **Informs:** Tolerability panel; dropout risk.

### 4.18 `detect_protocol_tolerability_issues(side_effect_series, dose_changes) -> prompts`

- **Inputs:** Side effects; dose change timeline.  
- **Outputs:** `ProtocolOptimizationPrompt` list.  
- **Logic:** If side effects cluster after intensity rises → prompt review.  
- **Rules.**  
- **Informs:** Optimization panel.

### 4.19 `link_side_effects_to_parameters(side_effects, parameters) -> associations`

- **Inputs:** Events + parameter sets.  
- **Outputs:** Association hints with **low causal claim** language.  
- **Logic:** Temporal proximity + simple regression optional; always label as associative.  
- **Rules/stats;** ML optional.  
- **Informs:** Audit; education cards.

### 4.20 `flag_parameter_deviation_from_plan(sessions, planned_parameters) -> deviations`

- **Inputs:** Delivered vs planned.  
- **Outputs:** Deviation list with severity.  
- **Logic:** Tolerance bands per modality.  
- **Rules.**  
- **Informs:** Audit; safety review prompts.

### 4.21 `classify_predictive_vs_responsive_biomarkers(feature_defs, literature_map) -> biomarker_class_map`

- **Inputs:** Feature dictionary; curated map from evidence ops.  
- **Outputs:** Per-feature role + confidence.  
- **Logic:** Priority to curated labels; default `unknown` if ambiguous.  
- **Rules + curated KB.**  
- **Informs:** Multimodal panel; fusion weights.

### 4.22 `estimate_treatment_confound_risk(sessions, medications, life_events_text) -> confound_score`

- **Inputs:** Session timing; med changes; optional NLP events from text analyzer.  
- **Outputs:** Qualitative confound risk + listed factors.  
- **Logic:** Med change proximity rules; major gaps; **no** diagnostic claims from text.  
- **Rules + NLP assist.**  
- **Informs:** Uncertainty disclosures; contributor caveats.

### 4.23 `suggest_protocol_adjustment(context, tolerability, forecasts) -> List[ProtocolOptimizationPrompt]`

- **Inputs:** Full context.  
- **Outputs:** Prompts (never auto-apply).  
- **Logic:** Combine outputs from 4.17–4.20; cap prompt count; prioritize safety.  
- **Rules orchestration;** optional ranked ML suggestions with human review gate.  
- **Informs:** Optimization panel.

### 4.24 `estimate_maintenance_need(response_trajectory, modality_guidelines) -> maintenance_estimate`

- **Inputs:** Trajectory; guideline maintenance schedules.  
- **Outputs:** Suggested maintenance evaluation windows ( informational ).  
- **Logic:** Rule thresholds on stability duration.  
- **Rules.**  
- **Informs:** Course phase labeling; planning snapshot.

### 4.25 `generate_protocol_review_actions(prompts, audit_policy) -> action_checklist`

- **Inputs:** Prompts; policy (who can sign off).  
- **Outputs:** Checklist items for Audit panel; optional task export.  
- **Logic:** Map prompt types to required reviewer roles; immutable logging on completion.  
- **Rules.**  
- **Informs:** Audit / governance.

---

## PART 5 — AI / DECISION SUPPORT

### 5.1 Design principles

- **Structured reasoning:** Every suggestion ships with **JSON schema** sections: `claim`, `supporting_features`, `evidence_links`, `uncertainty_drivers`, `alternative_hypotheses`, `next_data_that_would_reduce_uncertainty`.  
- **Not alerts-only:** Use short narrative + expandable structured block (for audit and clinician trust).

### 5.2 Deterministic rules vs predictive models

| Layer | Responsibility | UI labeling |
|-------|----------------|-------------|
| **Deterministic rules** | Contraindications, missing mandatory labs/imaging per internal policy, dose bounds, phase labels from dates, deviation flags | Badge: “Rule-based” |
| **Predictive models** | Response probability, time-to-response, ranked protocol hypotheses beyond rules | Badge: “Model-based (probabilistic)” |
| **Clinician-entered** | Overrides, preferences, clinical judgment notes | Badge: “Clinician” |

Server returns **lineage** per output: which layers contributed.

### 5.3 “Suggested protocol” vs “Recommended by clinician”

- **Suggested protocol:** System-ranked candidate from evidence + models + rules; never labeled “prescription.” Copy: “Candidate protocol (decision-support).”  
- **Recommended by clinician:** Explicitly chosen in UI/EHR; stored as authoritative intent for the chart **outside** the scope of automation.

### 5.4 “Estimated session range” vs certainty

- Always pair **range** with **CI or spread** and **assumption paragraph** (e.g., “Assumes weekly cadence per plan; missing sessions widen interval”).  
- Avoid single-point session counts without interval.

### 5.5 Predictive vs responsive biomarkers

- **Definitions in UI:**  
  - **Predictive:** measured **before** or independent of treatment segment for forecasting response / stratification.  
  - **Responsive:** measured **during** course to monitor change and guide titration/monitoring.  
- Visual: color/icon encoding + link to glossary drawer.

### 5.6 Uncertainty and missing data

- **Data gap register** in payload (`data_gaps`): list missing domains with impact on which predictions are disabled or widened.  
- **Downgrade confidence** automatically when: &lt;N sessions, conflicting modalities, stale assessments.

### 5.7 Auditability

- Immutable append-only **audit log** for overrides, acknowledgments, and reviewer sign-off.  
- Model version + ruleset version stamped on each generation.  
- Export bundle (JSON/PDF) for compliance narrative (reuse existing export patterns if present).

---

## PART 6 — EVIDENCE WIRING

### 6.1 Evidence object for each surfaced claim

For **alerts**, **protocol suggestions**, **target suggestions**, **outcome trends**, **optimization prompts**, **recommendations**:

| Field | Purpose |
|-------|---------|
| `evidence_source_type` | `guideline` \| `literature` \| `rule` \| `model_card` \| `clinician_note` |
| `snippet` | Short quoted or paraphrased line (compliant with copyright policy). |
| `strength` | `high` \| `moderate` \| `low` or numeric. |
| `confidence` | Calibration-aware where models involved. |
| `expand_behavior` | `drawer_abstract` \| `modal_full_text` \| `internal_model_card` \| `note_only` |

### 6.2 Structured evidence registry (by use case)

Maintain registries (could start as versioned JSON/YAML in repo, promoted to DB):

1. **Protocol selection:** Maps `{ modality, indication_tags } → evidence bundles` via existing neuromodulation research APIs (`listResearchExactProtocols`, `protocolCoverage`, etc.).  
2. **Target recommendation:** Links MRI coordinate conventions + neuroscience citations; reference `TargetRecommendation.mri_anchor_study_id`.  
3. **EEG biomarker evidence:** Curated feature→citation map for predictive/responsive classification.  
4. **MRI/fMRI biomarker evidence:** Stratification/limitation snippets (tie to `docs/mri-known-limitations.md` patterns).  
5. **Outcome tracking:** MCID/interpretability references per scale (PHQ-9/GAD-7/condition-specific).  
6. **Side-effect / tolerability:** Safety signals API (`listResearchSafetySignals`) + device labeling summaries where allowed.  
7. **Session-dose estimation:** Guideline tables as **rule artifacts** with citations per modality.

### 6.3 UI behavior

- Every card has **“Why & evidence”** → expands to snippet + link to evidence drawer (reuse `evidencePatientOverview` / `evidenceByFinding` patterns per `docs/neuromodulation_evidence_ui_wiring_plan.md`).  
- **Model cards** for AI outputs: inputs, version, known limitations, cohort mismatch warnings.

---

## Implementation notes (engineering handoff)

- **API:** New route family e.g. `GET /api/v1/patients/{id}/treatment-sessions-analyzer` returning `TreatmentSessionsAnalyzerPagePayload` (versioned).  
- **Web:** New page module alongside existing analyzers; **no treatment automation** — buttons lead to **review** workflows and sibling analyzer routes.  
- **Tests:** Contract tests for JSON schema; golden fixtures for timeline/adherence; rule-engine unit tests for deterministic paths.  
- **Governance:** Reuse `docs/protocol_evidence_governance.md` and safety/evidence policies for copy and promotion rules.

---

## References (product context)

- Internal evidence UI wiring: `docs/neuromodulation_evidence_ui_wiring_plan.md`  
- Protocol evidence governance: `docs/protocol_evidence_governance.md`, `docs/protocol-evidence-governance-policy.md`  
- Analyzer stacks: `packages/mri-pipeline/docs/MRI_ANALYZER.md`, `packages/qeeg-pipeline/QEEG_ANALYZER_STACK.md`, video/voice packages as applicable  

**External evidence themes (for registry curation, not hardcoded in UI):** multimodal MRI+EEG+clinical features for individualized planning; EEG/qEEG for response prediction and personalization; predictive vs responsive biomarker framing in personalized neuromodulation; confidence and test-retest reliability in targeting and parameter decisions.
