# DeepTwin — Best-Practice Comparison vs Clinical Decision Support Standards

Compares current `deeptwin_engine.py` + router against widely cited
clinical-decision-support (CDS) standards for trustworthy AI. Cites
generic standard names rather than search results, since this is a code
audit pass not a literature review.

## 1. Calibration of probability outputs

- **Standard:** Predicted probabilities should be calibrated using
  Platt scaling (logistic regression on validation logits) or
  isotonic regression. Reliability diagrams (predicted vs empirical
  frequency) should accompany any reported probability.
- **DeepTwin today:** No calibration layer. `responder_probability`
  is a deterministic transform of inputs. CI95 is fixed ±0.18.
- **Do tonight:** expose `calibration: { method: "uncalibrated", note: ... }`
  as a top-level field on every prediction; do not invent calibration data.
- **Future:** wire `packages/qeeg-encoder/conformal/` (per repo_map line 124)
  through to twin predictions; build a calibration set from cohort outcomes.

## 2. Uncertainty decomposition

- **Standard:** Trustworthy CDS distinguishes
  - **Epistemic** (model uncertainty) → MC-dropout, deep ensembles, BNN.
  - **Aleatoric** (irreducible noise) → heteroscedastic head or
    quantile regression.
  - **Calibration** (reliability of the probability scale) → above.
  Each should be reported separately so a clinician can tell
  "I don't have enough data" from "this signal is genuinely noisy".
- **DeepTwin today:** one combined deterministic band; method
  documented as `deterministic_scenario_band`.
- **Do tonight:** add `uncertainty.components` block exposing a
  zero-filled or `unavailable`-flagged shape for all three, and a
  one-line method note per component. Do not fake numbers.

## 3. Attribution (top drivers)

- **Standard:** SHAP / Integrated Gradients / LIME should produce
  per-recommendation top-k features with magnitude + direction.
- **DeepTwin today:** only `feature_attribution[]` on simulate, with
  4 fixed entries.
- **Do tonight:** add `top_drivers[]` (3-5 items, with magnitude in
  `[0,1]` and direction in `{positive, negative, neutral}`) on every
  recommendation. Magnitudes should be derived from the actual inputs
  in the request (modality presence, adherence assumption,
  contraindication count) — that is patient-specific even if the
  engine is rule-based.

## 4. Prediction intervals

- **Standard:** Conformal prediction yields distribution-free coverage
  guarantees and is the recommended interval method when calibration
  data is small.
- **DeepTwin today:** ad-hoc bands.
- **Do tonight:** label intervals as `illustrative` and add a
  `coverage_method` field; document conformal as the planned
  upgrade path.

## 5. Reproducibility / provenance

- **Standard:** Every output must reconstruct from
  `(model_id, model_version, schema_version, inputs_hash, timestamp,
  data_window)`. Required by EU AI Act + FDA SaMD audit.
- **DeepTwin today:** has engine, seed_salt, generated_at,
  calibration_status. Missing: `model_id` (separate from engine),
  `model_version`, `schema_version`, `inputs_hash`, `data_window`.
- **Do tonight:** add the missing fields to every
  prediction/simulation provenance block.

## 6. Safe language

- **Standard:** CDS must use cautious phrasing:
  "consider", "may benefit from", "discuss with clinician".
  Forbidden: "should take", "diagnose", "prescribe", "guarantee".
- **DeepTwin today:** mostly OK already, but a few absolute phrasings
  ("Best current use is treatment-readiness ranking", "Lead biomarker
  expected to move first", "Predicted trajectory is model-estimated"
  — last is fine, first two should be softened).
- **Do tonight:** wrap all summary/why fields through a small
  language helper that ensures a `consider` / `may` opener.

## 7. Per-recommendation evidence binding

- **Standard:** Every recommendation row must carry either
  (a) cited evidence references with grades, or (b) explicit
  `evidence_pending` status. Never silent.
- **DeepTwin today:** `evidence_support[]` is generic.
- **Do tonight:** add `evidence_status` enum per recommendation:
  `linked` | `pending` | `unavailable`, with a free-text caveat.

## 8. UI safety surface

- **Standard:** "Decision-support, not diagnosis" banner persistent
  on every page; per-card confidence chips; per-recommendation
  expandable rationale; no dead buttons.
- **DeepTwin today:** safety footer present (`safetyFooter()` in
  `safety.js` line 54). Per-rec confidence + rationale not exposed.
- **Do tonight:** add confidence chip + top-driver list rendering to
  `renderSimulationDetail()`; ensure footer is on every error/empty
  state too (already partially done).

---

## Do-tonight checklist (mapped to tasks B/C of brief)

- [x] Confidence tier helper centralised
- [x] Top-driver computation derived from request inputs
- [x] Scenario comparison structured payload returned by simulate
- [x] Recommendation language softener
- [x] schema_version + inputs_hash in provenance
- [x] UI: per-rec confidence chip + driver list + footer everywhere
- [x] uncertainty.components block (epistemic/aleatoric/calibration)
- [x] calibration top-level field exposing "uncalibrated"
- [x] tests for the new fields
- [ ] (deferred) Wire qeeg-encoder conformal layer — needs cross-stream
  coordination + training data; not safe to do tonight without breaking
  qEEG stream OFF-LIMITS.
- [ ] (deferred) Real SHAP / MC-dropout — needs an actual model.
- [ ] (deferred) Server-side scenario persistence — needs DB migration,
  out of stream-3 scope.
