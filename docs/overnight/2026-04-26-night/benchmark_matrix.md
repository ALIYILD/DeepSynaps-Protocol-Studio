# Benchmark Matrix — Night Shift 2026-04-26

Cross-module best-practice comparison. For full per-module detail, see:
- `qeeg_best_practice_matrix.md`
- `mri_best_practice_matrix.md`
- `digital_twin_best_practice.md`
- `scoring_audit.md` (best-practice section)
- `evidence_audit.md` (best-practice section)

This file is the **executive roll-up**: one table per module showing where DeepSynaps now sits vs the practical best-in-class.

---

## qEEG Analyzer

| Capability | Best-in-class reference | DeepSynaps (post-night-shift) | Gap | Done tonight |
|---|---|---|---|---|
| EDF / BrainVision ingest | MNE-Python `read_raw_*` | MNE-based, malformed-file rejection added | None | ✓ |
| Bad-channel detection | PyPREP (RANSAC + correlation + deviation) | PyPREP if available, **PREP-style fallback** (robust-z >5σ + correlation <0.4) when not | Calibration-set tuning of thresholds | ✓ |
| ICA + IC labelling | ICLabel + autoreject | ICLabel + autoreject when installed; graceful skip + flag otherwise | Heavyweight in slim image | partial |
| Spectral parameterisation | FOOOF / specparam | specparam integrated; `aperiodic` + `periodic` decomposition fields | Validation against reference dataset | ✓ |
| Per-feature confidence | n/a (most tools omit) | n_epochs + SNR proxy + FOOOF R² heuristics; min-of-pair propagation for FAA | None | ✓ (better than most) |
| Connectivity | MNE-connectivity (coherence, PLI, etc.) | Existing implementation retained; method_provenance now exposed | Reproducibility report across devices | None |
| Source localisation | MNE eLORETA / sLORETA | eLORETA implemented; nibabel-blocked tests in baseline image | nibabel install in dev image (DevOps) | flagged |
| Top-level decision-support contract | n/a (no competitor exposes this) | `qc_flags` + `confidence` + `method_provenance` + `limitations` on every result | None — this is now best-in-class | ✓ |
| Evidence linkage on findings | None in market | Hook calls `search_papers`; `evidence_pending` honest fallback | Counter-evidence retrieval | partial |
| Frontend QC surfacing | Generally weak across competitors | Decision-Support card with observed-vs-inferred separation + evidence chips | None | ✓ |

---

## MRI / fMRI Analyzer

| Capability | Best-in-class reference | DeepSynaps (post-night-shift) | Gap | Done tonight |
|---|---|---|---|---|
| Format support | NIfTI-1/2 + DICOM (FreeSurfer / FSL / ANTs) | NIfTI-1/2 magic-byte validation + zip safety + extension whitelist | DICOM ingest hardening | ✓ |
| Header sanity | nibabel header check | dim / datatype / sform-qform / vox_offset validation in `validation.py` | None | ✓ |
| Skull strip | SynthStrip / FSL BET | Not bundled in slim worker (TODO stub) | FastSurfer/SynthStrip in worker image | flagged |
| Volumetrics | FreeSurfer 7.4+ / FastSurfer / SynthSeg | Stubbed (extract_structural_metrics:234 TODO) | Worker image deployment | flagged |
| Brain age | DeepBrainNet, brainageR | `safe_brain_age` wrapper: range guard [3, 100], gap ≤ 30, NaN guard, `not_estimable` with reason; ok-path emits band + calibration_provenance | Calibration data; SHAP for top_contributing_regions | ✓ wrapper + safety; calibration data missing |
| Per-region findings | Inconsistent across tools | `build_finding` + `format_observation_text` always carry `requires_clinical_correlation: True`; never says "diagnosis" | None | ✓ |
| Multimodal fusion payload | n/a (no standardised producer) | Stable `mri.v1` schema via `to_fusion_payload()` + `/fusion_payload` endpoint | Functional + diffusion rollups | partial |
| QC flags | MRIQC | Motion + intensity + orientation flags at validator level | MRIQC binary integration | partial |
| Safer interpretation language | Inconsistent | Code-enforced — never "diagnosis"; always carries `requires_clinical_correlation` | None | ✓ |

---

## Digital Twin / Predictions

| Capability | Best-in-class reference | DeepSynaps (post-night-shift) | Gap | Done tonight |
|---|---|---|---|---|
| Confidence calibration | Platt / isotonic + reliability diagrams | `calibration.status="uncalibrated"` everywhere — top-level disclosure with planned method named, NO fake numbers | Real calibration data | ✓ honest disclosure; data gap remains |
| Uncertainty quantification | MC-dropout / ensembling (epistemic) + aleatoric model + calibration check | 3-component block: epistemic + aleatoric + calibration. **Honest stub**: epistemic/aleatoric `status:"unavailable"`, calibration `status:"uncalibrated"` | Real MC-dropout / ensemble | ✓ structure; data gap remains |
| Feature attribution | SHAP / Captum on validated model | `derive_top_drivers()` binds to patient-specific request inputs (3-5 drivers per recommendation, magnitude + direction) | SHAP for true model attribution | ✓ rule-derived; SHAP TBD |
| Recommendation language | Often assertive in competitor copy | `soften_language()` with `_FORBIDDEN_TERMS` filter rewrites assertive→cautious ("consider", "may benefit", "discuss with clinician") | None | ✓ best-in-class |
| Provenance | Often missing model_id + inputs hash | `build_provenance()`: model_id + schema + inputs_hash (sha256) + timestamp on every response | None | ✓ |
| Scenario comparison | n/a in most tools | `build_scenario_comparison()` with structured deltas; `/scenarios/compare` endpoint | None | ✓ |
| Decision-support framing | Often missing in competitor UI | `decision_support_only:true` + UI banner on every state | None | ✓ |
| Real feature input | Standard: pull from feature store | **Audit A1**: still reads modality flags only (RNG-seeded by patient_id). `provenance.mode=deterministic_demo` honestly surfaced. | Real feature-store integration | flagged |

---

## Risk / Decision Scoring

| Capability | Best-in-class reference | DeepSynaps (post-night-shift) | Gap | Done tonight |
|---|---|---|---|---|
| Validated assessment as primary anchor | DSM-aligned scoring (PHQ-9, GAD-7, PSS-10, MoCA) | PRIMARY anchor enforced via `_prom_anchored_score`; biomarker = SUPPORTING | None | ✓ best-in-class policy |
| Confidence calibration | Reliability diagrams | `cap_confidence` policy: no anchor → ceiling `med`; research-grade → ceiling `med` | Real calibration set | ✓ policy; data gap |
| Top contributors | SHAP / linear-model coefficients | `top_contributors[{feature, weight, direction}]` in unified schema | SHAP integration | ✓ schema |
| Uncertainty band | Bootstrap CIs / posterior CrIs | `uncertainty_band(lo, hi)` field with validator | Bootstrap implementation | ✓ schema |
| Evidence linkage | Often missing in competitors | `evidence_refs[]` hook + "evidence pending" honest fallback | Per-score resolver wiring | partial |
| Audit log | Often missing | Every compute logs `inputs_hash + model_id + version + confidence` | None | ✓ |
| Suicide-risk safety | Variable across competitors | PHQ-9 item 9 ≥ 2 emits BLOCK-severity caution → existing risk_stratification suicide_risk handler | None | ✓ |
| Unified schema | n/a — usually fragmented | Single `ScoreResponse` across 8 scores + aggregator `build_all_clinical_scores` | None | ✓ best-in-class |

---

## Evidence / Reports

| Capability | Best-in-class reference | DeepSynaps (post-night-shift) | Gap | Done tonight |
|---|---|---|---|---|
| Versioned schema | Inconsistent | `schema_id="deepsynaps.report-payload/v1"` + `generator_version` + `generated_at` | None | ✓ |
| Observed vs interpretation | Often blurred in competitor reports | Visual + structural separation in clinician + patient views; both `observed[]` and `interpretations[]` arrays in payload | None | ✓ best-in-class |
| Evidence-strength badges | OCEBM / GRADE | Per-claim badges: Strong / Moderate / Limited / Conflicting / **Evidence pending** (honest fallback) | None | ✓ |
| Citations | DOI / PMID standard | `CitationRef` with `doi`, `pmid`, `url`, `evidence_level`, `retrieved_at`, `status ∈ {verified, unverified, retracted}`. Unresolved refs preserve `raw_text`. | Counter-evidence retrieval | ✓ no-fabrication guarantee |
| Clinician + patient view | Standard in clinical reporting | Audience toggle in UI; both views render from same payload | None | ✓ |
| Export formats | HTML + PDF + DOCX | HTML always works; PDF returns clean 503 when WeasyPrint missing (never blank PDF); DOCX renderers exist but unwired | Wire DOCX | partial |
| Decision-support disclaimer | Often missing | Stamped on every payload via `decision_support_disclaimer` | None | ✓ |
| Cautions + limitations | Often missing in competitor reports | Always present per section, with explicit "No cautions identified" placeholders (never silent) | None | ✓ |
| Suggested actions | Often imperative | Defaults to `requires_clinician_review=True`, rendered with "Consider:" prefix | None | ✓ |
| Section-level provenance | Often missing | `method_provenance` available per section | OpenAPI examples | partial |

---

## Cross-cutting summary

| Theme | DeepSynaps post-shift |
|---|---|
| Decision-support discipline | **Load-bearing in code** — `_FORBIDDEN_TERMS`, `cap_confidence`, `not_estimable`, `evidence_pending`, `decision_support_only:true` are not policy doc, they are guards |
| Honesty over fabrication | No silent fabrication anywhere — citations preserve `raw_text` on miss; calibration is `uncalibrated` not faked; uncertainty components are `unavailable` not invented |
| Schema versioning | `schema_id` + `schema_version` + `generator_version` on all new payloads |
| Audit trail | inputs_hash + model_id + version logged on every score compute |
| Test coverage | 100+ new contract tests catch regressions on every claim |

---

## What competitors typically do worse (now)

1. **Confidence pretence.** Most competitors report a single confidence number with no anchor; DeepSynaps caps confidence when no PROM anchor exists.
2. **Citation hallucination.** Most LLM-augmented clinical AI products have been caught fabricating PMIDs; DeepSynaps preserves `raw_text` + marks `unverified`.
3. **"Diagnosis" language.** Most non-FDA-cleared tools still use diagnostic-tone copy; DeepSynaps' `_FORBIDDEN_TERMS` filter rewrites assertive language at runtime.
4. **Silent PDF failures.** Most clinical platforms produce blank or partial PDFs when a renderer is misconfigured; DeepSynaps returns HTTP 503 with `pdf_renderer_unavailable` code.
5. **Brain-age garbage.** Most brain-age services return whatever number the model produced even on OOD inputs; DeepSynaps returns `not_estimable` with explicit reason.

---

## What competitors still do better

1. **Calibration data.** Real reliability diagrams + clinic-specific calibration sets — DeepSynaps exposes the gap honestly but doesn't yet have the data.
2. **SHAP/Captum attribution.** DeepSynaps' top-drivers are rule-derived from request inputs; not yet SHAP from a deployed validated model.
3. **Production scientific stack.** FreeSurfer 7.4+ / FastSurfer / SynthSeg / antspyx / MRIQC binaries in the worker image — current slim image stubs structural extraction.
4. **Real feature-store wiring for DeepTwin.** Twin still reads modality flags only (audit A1).
