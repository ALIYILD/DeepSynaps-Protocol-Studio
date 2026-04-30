# DeepTwin Model Contract

## Current Status: `not_implemented` (Placeholder)

DeepTwin does not have a real downstream inference model. All outputs
are deterministic, rule-based, or seeded pseudo-random placeholder data.

## What Exists

### Input Schema (`DeeptwinAnalyzeRequest`)
```
patient_id: str           # Required, non-empty
as_of: str | None         # Optional timestamp for point-in-time analysis
modalities: list[str]     # e.g. ["qeeg_features", "assessments", "wearables"]
combine: str              # "all_selected" | "minimal_viable" | "custom_weights"
custom_weights: dict      # Optional per-modality weights
analysis_modes: list[str] # ["prediction", "correlation", "causation"]
```

### Simulation Schema (`DeeptwinSimulateRequest`)
```
patient_id: str           # Required
protocol_id: str          # Required
horizon_days: int         # 7-365 (default 30)
modalities: list[str]     # Data modalities to incorporate
scenario: dict            # Custom scenario parameters
```

### Output Schema
```
engine:
  status: "placeholder"   # MUST be "placeholder" until real model
  real_ai: false          # MUST be false until real model
  notice: str             # Human-readable disclaimer
outputs:
  timecourse: list[{day, delta_symptom_score}]  # Deterministic stub data
  forecast: list          # Empty or seeded pseudo-random
  monitoring_plan: dict   # Template-based
decision_support_only: true  # Always true
provenance:
  surface: str            # "simulate" | "analyze" | "explain"
  schema_version: str     # Versioned for compatibility
  generated_at: str       # ISO timestamp
```

### Confidence / Explanation Schema
```
confidence:
  tier: str               # "low" | "moderate" | "high"
  score: float            # 0.0 - 1.0 (currently seeded from patient hash)
  calibration_status: str # "uncalibrated" (always, until real model)
uncertainty_block:
  sources: list[str]      # ["model_not_trained", "no_real_inference", ...]
  interpretation: str     # Human-readable uncertainty explanation
```

### Safety Caveat Schema
Every response includes:
```
decision_support_only: true
engine.notes: [
  "Deeptwin is decision-support only and does not make diagnostic claims.",
  "Causation outputs are hypotheses, not clinical truth."
]
```

## What Does NOT Exist

1. **No trained ML model** - No neural network, no learned weights
2. **No real inference** - All "predictions" are seeded deterministic outputs
3. **No real embeddings** - Patient latent representations are synthetic
4. **No clinical validation** - No prospective or retrospective validation
5. **No autoresearch integration** - Import-guarded; even if installed,
   the clinical wrapper is not wired

## Clinician Review Requirement

The `_require_clinician_review_actor()` gate enforces that only users
with role >= `clinician` can access DeepTwin endpoints. This is
enforced at the router level, before any output is generated.

## Upgrade Path to Real Model

1. Implement a model training pipeline (e.g. in `apps/worker/`)
2. Store trained weights with versioned path in `DEEPTWIN_WEIGHTS_PATH`
3. Add weight-loading code to `deeptwin_engine.py`
4. Update `ai_health_router.py` to check for weights presence
5. Only then change `status` from `not_implemented` to `active`
6. Add `real_ai: true` only when real inference is happening
7. Run clinical validation before production deployment

## Test Enforcement

Tests in `test_audit_fixes_validation.py` enforce:
- `TestDeepTwinHonesty.test_simulate_stub_declares_placeholder`:
  Stub simulation must declare `real_ai=False`
- `TestAIHealthEndpoint.test_health_ai_deeptwin_not_active`:
  DeepTwin must NOT be marked as active in health endpoint
- `TestTribeEngineInfo.*` (4 tests): All TRIBE endpoints must include
  `engine_info.real_ai=False` and `engine_info.method="rule_based"`
