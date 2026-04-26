# Tests Added

## qEEG

- `packages/qeeg-pipeline/tests/test_clinical_summary.py`
  - Validates that qEEG summaries surface low clean-epoch count, missing artifact tooling, observed findings, method provenance, and decision-support safety framing.
  - Validates high-quality inputs produce high-confidence summaries with no quality flags.

- `packages/qeeg-pipeline/tests/test_risk_scores.py`
  - Added checks for risk-score explanations, contributing factors, evidence basis, calibration notes, and assessment anchors.

## MRI

- `packages/mri-pipeline/tests/test_clinical_summary.py`
  - Validates MRI clinical summaries include QC flags, observed region/network findings, confidence, limitations, and safety statements.
  - Validates MRIReport carries the new `clinical_summary` payload.

## Fusion

- `apps/api/tests/test_fusion_router.py`
  - Added assertions for modality agreement, missing modality list, limitations, and partial-state metadata.

## Digital Twin

- `apps/api/tests/test_deeptwin_engine_provenance.py`
  - Validates simulation provenance, scenario comparison, uncertainty notes, feature attribution, and `approval_required` safety framing.

## Validation Run

- `PYTHONPATH=packages/qeeg-pipeline/src python3 -m pytest packages/qeeg-pipeline/tests/test_clinical_summary.py packages/qeeg-pipeline/tests/test_risk_scores.py`
  - Result: 7 passed.
- `PYTHONPATH=packages/mri-pipeline/src python3 -m pytest packages/mri-pipeline/tests/test_clinical_summary.py packages/mri-pipeline/tests/test_qc.py`
  - Result: 11 passed, 1 existing Pydantic deprecation warning.
- `PYTHONPATH=apps/api:packages/qeeg-pipeline/src python3 -m pytest apps/api/tests/test_deeptwin_engine_provenance.py`
  - Result: 1 passed, 1 existing Pydantic deprecation warning.
