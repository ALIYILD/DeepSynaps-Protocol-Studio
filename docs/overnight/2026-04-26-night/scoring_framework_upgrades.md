# Scoring Framework Upgrades — Stream 4 (Risk / Scoring / Decision-Support)

Generated: 2026-04-26 overnight.

This document is the deliverable record for Stream 4. It lists every
file:line that was added or modified, the rationale, and what is now
available for downstream consumers.

## Files added

### `packages/evidence/src/deepsynaps_evidence/score_response.py` (new, 224 lines)

Unified `ScoreResponse` schema for every clinical decision-support score.

* `ScoreResponse` — the single wire shape (`score_response.py:117`).
* `Caution` — structured safety / quality caution with `code`,
  `severity ∈ {info, warning, block}` (`score_response.py:73`).
* `EvidenceRef` — lightweight pointer to an evidence record
  (`score_response.py:88`).
* `MethodProvenance` — audit metadata: `model_id`, `version`,
  `inputs_hash`, `upstream_is_stub` (`score_response.py:99`).
* `TopContributor` — feature/weight/direction triple
  (`score_response.py:54`).
* `cap_confidence(...)` — policy: no validated anchor → cap at `med`;
  research-grade → cap at `med` (`score_response.py:202`).
* `hash_inputs(...)` — deterministic SHA-256 of canonicalised inputs,
  used by every builder for audit (`score_response.py:188`).
* Pydantic validator: rejects inverted `uncertainty_band`
  (`score_response.py:170`).

Confidence taxonomy is normalised to `{low, med, high, no_data}`
across the platform — replacing the prior drift between
`low/moderate/high` (qEEG, brain-age) and
`low/medium/high/no_data` (risk_stratification).

### `apps/api/app/services/risk_clinical_scores.py` (new, 600 lines)

Score adapter service. Eight public builders + an aggregator:

* `build_anxiety_score` (`risk_clinical_scores.py:298`) — PROM:
  GAD-7 → HAM-A; biomarker support: `anxiety_like`.
* `build_depression_score` (`risk_clinical_scores.py:316`) — PROM:
  PHQ-9 → HAM-D → BDI-II; biomarker support: `mdd_like`. PHQ-9 item
  9 surfaces a BLOCK caution at ≥ 2.
* `build_stress_score` (`risk_clinical_scores.py:333`) — PROM: PSS-10
  / PSS; wearable HRV / mood composite when no PROM
  (research-grade, ceiling med).
* `build_mci_score` (`risk_clinical_scores.py:419`) — PROM: MoCA →
  MMSE; biomarker support: `cognitive_decline_like`. Adds
  `out-of-distribution-age` warning when chronological_age < 40.
* `build_brain_age_score` (`risk_clinical_scores.py:438`) — consumes
  the qEEG / MRI brain-age payload, validates `predicted_years` in
  `[5, 95]`, surfaces `stub-model-fallback`, `large-brain-age-gap`,
  `missing-chronological-age` cautions.
* `build_relapse_risk_score` (`risk_clinical_scores.py:530`) —
  research-grade composite of `0.6 *
  fraction_significantly_worsening_features + 0.4 * min(1, AEs/3)`,
  ceiling med.
* `build_adherence_risk_score` (`risk_clinical_scores.py:582`) —
  wraps `home_device_adherence.compute_adherence_summary` aggregates,
  HIGH risk when adherence_rate_pct < 50 OR open_flags ≥ 1 OR
  side_effect_count ≥ 3.
* `build_response_probability_score` (`risk_clinical_scores.py:646`)
  — research-grade prior from qEEG `*_like` similarity for the
  primary target, ceiling med, `evidence-pending` caution.
* `build_all_clinical_scores` (`risk_clinical_scores.py:739`) —
  best-effort aggregator that wraps each builder in its own
  try/except so a single failure does not blow up the dispatcher.
* Audit logging: every builder calls `_emit_log` (`risk_clinical_scores.py:153`)
  which logs `score_id model_id version inputs_hash confidence
  upstream_is_stub` per task spec.

The PROM-anchored helper `_prom_anchored_score`
(`risk_clinical_scores.py:182`) implements the universal policy:
PROM is PRIMARY, biomarker is SUPPORTING; `cap_confidence` enforces
the no-anchor / research-grade ceilings.

### `apps/api/tests/test_risk_clinical_scores.py` (new, 25 tests, all PASSING)

See `scoring_tests_added.md` for the full coverage matrix. Tests are
self-contained — they path-shim the evidence package so they pass
without an editable install.

### Docs added

* `docs/overnight/2026-04-26-night/scoring_audit.md` — Phase A audit
  table for every score in scope.
* `docs/overnight/2026-04-26-night/score_api_contracts.md` — Phase C
  unified API contract reference.
* `docs/overnight/2026-04-26-night/scoring_tests_added.md` — Phase D
  test inventory + run results.
* `docs/overnight/2026-04-26-night/scoring_framework_upgrades.md` —
  this file (Phase E).

## Files modified

### `packages/evidence/src/deepsynaps_evidence/__init__.py`

Re-export the new score-response symbols
(`__init__.py:9` — added `from deepsynaps_evidence.score_response
import …`; `__init__.py:22` — added entries to `__all__`).

### `apps/api/app/routers/risk_stratification_router.py`

* New imports for the score builder + a re-use of
  `assemble_patient_context` from the existing service
  (`risk_stratification_router.py:30`-`risk_stratification_router.py:37`).
* New endpoint `GET /api/v1/risk/patient/{patient_id}/clinical-scores`
  (`risk_stratification_router.py:289`-`risk_stratification_router.py:340`)
  returning a dict keyed by `score_id` of `ScoreResponse` payloads.
  Reuses the actor / db dependencies. Calls
  `build_all_clinical_scores` with whatever subset of inputs is
  available; the builders degrade gracefully to `no_data` when an
  input is absent.

The existing 8-category traffic-light endpoints (allergy /
suicide_risk / mental_crisis / self_harm / harm_to_others /
seizure_risk / implant_risk / medication_interaction) are
**unchanged** — they remain the hard-safety contraindication system
and are intentionally kept separate from the clinical decision-support
scores.

## Files explicitly NOT touched (off-limits per task board)

* `packages/qeeg-pipeline/**` (Stream 1) — Stream 4 only consumes the
  payloads from `risk_scores.py`, `brain_age.py`, `longitudinal.py`.
* `packages/mri-pipeline/**` (Stream 2) — Stream 4 only consumes the
  brain-age payload via the documented shape.
* `apps/api/app/routers/fusion_router.py` (Fusion).
* `packages/render-engine/**`, `packages/generation-engine/**`
  (Stream 5).
* `apps/api/app/services/risk_stratification.py` —
  contraindication / safety engine left intact.
* `apps/api/app/services/assessment_scoring.py` — catalogue gap (no
  PSS-10 / MoCA / MMSE) noted as a handoff to Evidence stream
  rather than edited from Stream 4.

## Confidence taxonomy normalisation

Before Stream 4, the platform used three different confidence
vocabularies:

| Source | Old taxonomy |
|---|---|
| `risk_stratification.py` | `high / medium / low / no_data` |
| qEEG `risk_scores.py` (`_decision_support_metadata`) | `low / moderate / high` |
| qEEG `brain_age.py` | `low / moderate / high` |

Stream 4 standardises on `{low, med, high, no_data}` at the
`ScoreResponse` boundary. The qEEG / MRI / risk_stratification
internal taxonomies are NOT modified (off-limits or out of scope);
the score builders translate at the boundary
(`risk_clinical_scores.py:514` for brain-age, `_prom_anchored_score`
for assessment-anchored scores).

## Confidence-cap policy (decision-support guard rails)

Implemented in `cap_confidence` (`score_response.py:202`):

* No validated PROM anchor → `confidence` cannot reach `high`.
* Research-grade scale (`scale == "research_grade"`) → `confidence`
  cannot exceed `med`.
* Tested in
  `test_risk_clinical_scores.py::test_cap_confidence_research_grade_caps_at_med`.

## Audit hooks

Every score logs a structured line at INFO level via
`_emit_log` (`risk_clinical_scores.py:153`):

```
clinical_score: score_id=anxiety model_id=anxiety-anchor-gad7 version=v1 inputs_hash=<sha256> confidence=high upstream_is_stub=False
```

`MethodProvenance.inputs_hash` is the SHA-256 of the canonicalised
input dict (`hash_inputs`, `score_response.py:188`), enabling
deterministic replay.

## Cross-stream handoffs requested

(Recorded in `scoring_audit.md` and `score_api_contracts.md`; no
edits made outside Stream 4 ownership.)

1. **Evidence stream**: add PSS-10, MoCA, MMSE rules to
   `apps/api/app/services/assessment_scoring._PREFIX_SCORING` so
   stress / mci scores can anchor to validated PROMs in production.
2. **MRI stream**: provide a stable accessor returning the
   brain-age payload shape consumed by `build_brain_age_score`
   (predicted_years, chronological_years, gap_years, gap_percentile,
   confidence ∈ {low, moderate, high}, is_stub, electrode_importance).
3. **Evidence stream**: implement an `evidence_refs` resolver per
   `score_id` returning up to 3 supporting refs. Stream 4 already
   exposes the parameter (`evidence_refs_by_score`) so wiring is a
   one-liner once the resolver lands.
4. **qEEG stream**: no changes requested. The
   `_decision_support_metadata` payload is consumed verbatim.

## Test results recap

| Suite | Result |
|---|---|
| `apps/api/tests/test_risk_clinical_scores.py` | 25 / 25 PASSED |
| `apps/api/tests/test_evidence_router.py` | 6 / 6 PASSED |
| `packages/evidence/tests/` (default invocation) | 3 collection ERRORS — pre-existing `ModuleNotFoundError: deepsynaps_evidence` unrelated to Stream 4 (no editable install in this env). |
| `packages/evidence/tests/` with `PYTHONPATH=packages/evidence/src` | 47 / 47 PASSED |

## Acceptance criteria — Stream 4 task board

| Criterion | Status |
|---|---|
| Risk scores include confidence intervals + calibration cautions | done — `uncertainty_band` (when biomarker provides CI95) and `cautions[]` with `uncalibrated-biomarker`, `stub-model-fallback`, `out-of-distribution-age`, `large-brain-age-gap`, `out-of-range-brain-age`, `missing-validated-anchor`, etc. |
| Evidence grading uses validated hierarchy (I, II-1, II-2, III, etc.) | already in `packages/evidence/src/deepsynaps_evidence/scoring.py` (GRADE A/B/C/D); not modified. |
| Decision-support outputs include attribution | done — `top_contributors[]`. |
| Counter-evidence retrieval works for key claims | already in `packages/evidence/src/deepsynaps_evidence/validator.py` (`citation_type == "contradicts"`); not modified. |
| Scores logged and auditable | done — `_emit_log` per builder, `inputs_hash` in provenance. |
