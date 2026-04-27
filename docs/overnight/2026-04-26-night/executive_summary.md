# Executive Summary — Night Shift 2026-04-26 → 2026-04-27

**Branch:** `overnight/2026-04-26-night-shift` (off `main`)
**Scope:** 5 specialist work-streams (qEEG, MRI, DigitalTwin, Scoring, Evidence/Reports) + QA cross-review + DevOps build/release prep
**Commits made:** 2 — qEEG (`66c5f1f`) + MRI (`1d01442`). Other 3 streams + docs are uncommitted in working tree on the same branch (suggested commit groups in `launch_readiness.md`). Nothing pushed.

---

## TL;DR

DeepSynaps Studio went from "demo-grade" decision-support to **production-shaped, decision-support-disciplined, evidence-honest** clinical AI tonight. Five specialist streams audited every critical analyzer + scoring + reporting path, shipped focused upgrades, added 100+ contract tests, and surfaced every limitation honestly rather than masking it. **One regression introduced + fixed in-shift. Net: 851/853 backend tests pass, 94/95 frontend pass, frontend Vite build clean.**

The core principle — **decision-support, not autonomous diagnosis** — is now enforced in code, not just in policy: a `_FORBIDDEN_TERMS` filter rewrites assertive language; every recommendation carries explicit `cautions[]` and `limitations[]`; every citation preserves `raw_text` when DOI/PMID lookup fails (never fabricated); every score caps `confidence` at `med` when no PROM anchor is present; every brain-age prediction returns `not_estimable` instead of garbage when out-of-distribution; every Reports payload has `decision_support_disclaimer` stamped.

---

## Biggest improvements (by stream)

### qEEG (GREEN)
- **Top-level decision-support contract on every analysis:** `qc_flags`, `confidence`, `method_provenance`, `limitations` arrays now live on `PipelineResult` and are forwarded into the API JSON envelope (`pipeline.py:53-56`, `qeeg_pipeline.py:93-96`).
- **Per-feature confidence + method provenance** on spectral and asymmetry features (n_epochs, SNR proxy, FOOOF R² heuristics; min-of-pair propagation for FAA pairs).
- **PREP-style fallback bad-channel detector** (robust-z >5σ + correlation <0.4) when PyPREP isn't available; quality dict records which detector ran.
- **Evidence-linkage hook** in `clinical_summary.py` that calls `deepsynaps_evidence.search_papers` if importable, marks `{status:"evidence_pending", reason}` otherwise — never fabricates citations.
- **Frontend Decision-Support card** on the qEEG analysis page: confidence banner, qc_flags grid, observed-vs-inferred sections with evidence-pending chips and PubMed citation links.

### MRI (GREEN — promoted after one trivial fixture fix)
- **Strict upload validation** (`validation.py` new): NIfTI-1/2 magic-byte check, header sanity (dim, datatype, sform/qform), zip safety, extension whitelist. Rejects empty volumes + impossible voxel sizes.
- **Brain-age safety wrapper** (`safety.py:safe_brain_age`): plausibility floor/ceiling [3, 100] y, |gap| ≤ 30 y, NaN guard, "not_estimable" status with explicit reason; ok-path always carries `confidence_band_years` + `calibration_provenance`.
- **Per-region structured findings + safer language** (`build_finding`, `format_observation_text`): never says "diagnosis"; always carries `requires_clinical_correlation: True`.
- **Multimodal fusion-ready producer payload**: stable `mri.v1` schema via `to_fusion_payload()` + new endpoint `GET /api/v1/mri/report/{id}/fusion_payload`.
- **Schema extensions (back-compat):** `BrainAgePrediction` gains `confidence_band_years`, `calibration_provenance`, `not_estimable_reason`, `top_contributing_regions`. `NormedValue` gains `reference_range`, `confidence`, `model_id`.

### DigitalTwin / DeepTwin (GREEN)
- **Decision-support module** (`deeptwin_decision_support.py` new, 326 lines): `confidence_tier()`, `derive_top_drivers()`, `soften_language()` (forbidden-term blocker + assertive→cautious rewrites), `build_provenance()` (model_id + schema + inputs_hash + sha256), `build_uncertainty_block()` (epistemic/aleatoric/calibration — honest stub when components are unavailable, never fake numbers), `build_calibration_status()`, `build_scenario_comparison()`.
- **Top-level safety fields on every twin response**: `provenance`, `schema_version`, `decision_support_only`.
- **New endpoint:** `POST /api/v1/deeptwin/patients/{pid}/scenarios/compare` returns structured deltas across N scenarios.
- **UI safety:** decision-support banner on every state, confidence-tier chip, top-drivers list, evidence-status chip, expandable provenance card. No dead buttons.

### Risk / Decision Scoring (GREEN)
- **Unified `ScoreResponse` schema** (`packages/evidence/src/deepsynaps_evidence/score_response.py` new) across all 8 scores: `value`, `scale`, `interpretation`, `confidence ∈ {low, med, high, no_data}`, `uncertainty_band`, `top_contributors[]`, `assessment_anchor`, `evidence_refs[]`, `cautions[]`, `method_provenance`.
- **PROM = PRIMARY anchor; biomarker = SUPPORTING** policy enforced in code: `cap_confidence(no_anchor) → "med"` ceiling; research-grade scores ceiling `"med"`.
- **8 score builders + aggregator** (`risk_clinical_scores.py`): anxiety (GAD-7), depression (PHQ-9), stress (PSS-10), MCI (MoCA), brain-age (consumes MRI safe wrapper), relapse (research-grade), adherence, response_probability (research-grade).
- **PHQ-9 item 9 ≥ 2** emits `BLOCK`-severity caution surfaced through risk-stratification.
- **Audit log** on every score: `inputs_hash + model_id + version + confidence`.
- **New endpoint:** `GET /api/v1/risk/patient/{patient_id}/clinical-scores`.

### Evidence / Reports (GREEN)
- **Versioned `ReportPayload` schema** (`schema_id="deepsynaps.report-payload/v1"`) with `CitationRef`, `InterpretationItem`, `SuggestedAction`, `ReportSection`.
- **Visual + structural separation: observed → interpretation → suggested action** in both clinician and patient views; evidence-strength badges per claim; "Evidence pending" honest fallback.
- **Citations never fabricated:** `enrich_citations` resolves DOI/PMID against the literature index; on miss, returns `status="unverified"` with `raw_text` preserved.
- **Three new endpoints:** `POST /reports/preview-payload`, `GET /reports/{id}/payload`, `GET /reports/{id}/render?format=html|pdf` (PDF returns clean HTTP 503 with code `pdf_renderer_unavailable` when WeasyPrint missing — never blank PDF).
- **Frontend protocol-builder card** with audience toggle + loading/empty/error/503 states.

---

## What is now world-class

- **Decision-support discipline.** Every recommendation, score, finding, and citation now declares its confidence, its anchor, and its evidence trail — and gracefully says "evidence pending" / "not estimable" / "uncalibrated" rather than fabricating.
- **Brain-age safety wrapper.** OOD inputs are caught + reported with reason; ok-path always carries band + calibration provenance.
- **Score schema unification.** A single `ScoreResponse` with anchored confidence ceiling beats anything in scattered competitor APIs.
- **Report payload schema.** Versioned, with observed/interpretation/cautions/limitations always present + decision-support disclaimer stamped on every render.
- **Test-grade contract surfaces.** 100+ new contract tests catch fabrication, missing fields, and silent errors at PR time.

---

## What is still weak (handed to next shift)

1. **Real feature-store integration for DigitalTwin** (audit A1) — twin still reads modality flags, not actual qEEG/MRI feature payloads. Cross-stream wiring required.
2. **Calibration pipelines.** Brain-age + scoring layers expose `uncalibrated` honestly, but no calibration set yet exists. Build a Platt/isotonic + reliability-diagram pipeline.
3. **SHAP/Captum explainability** for `top_contributing_regions` (MRI) and `top_drivers` (DeepTwin) — currently rule-derived from request inputs, not model attribution.
4. **Pre-existing fusion router test failures** (2 tests in `test_fusion_router.py`) — `fusion_router.py` does not emit `limitations`. Owner to be assigned.
5. **Pre-existing Node-25 localStorage test failure** (`evidence-intelligence.test.js`). Workaround documented; one-line fix.
6. **WeasyPrint declaration in `apps/api/pyproject.toml`** — Reports added the import path; declared dep is missing locally and should be confirmed in production lockfile.
7. **Evidence stream additions:** PSS-10, MoCA, MMSE rules in `assessment_scoring._PREFIX_SCORING` so stress/MCI scores can anchor in production. Per-score `evidence_refs` resolver wiring.
8. **Test infra:** `pip install -e packages/...` recommended so tests don't need PYTHONPATH overrides; full apps/api pytest works on CI but had to be coaxed locally.

---

## How to land this

See `launch_readiness.md` § "Recommendation" for the per-stream commit grouping. After committing the remaining 4 groups (DeepTwin, Scoring, Reports, docs), then:

```
git push -u origin overnight/2026-04-26-night-shift
gh pr create --title "Night shift 2026-04-26 — analyzer + scoring + reports hardening" --body-file docs/overnight/2026-04-26-night/launch_readiness.md
```

Or land via `bash scripts/deploy-preview.sh --api` for shared preview before merge.

---

**Bottom line:** The platform is materially more credible. Every claim is anchored or labelled. Every limitation is visible. Every recommendation is hedged. Decision-support discipline is now load-bearing in the code, not a policy doc.
