# Brain Twin / DeepTwin Simulation Contract

> Status: **placeholder** (no production simulation model connected)
> Last updated: 2026-04-30

## Overview

The "Brain Twin" simulation feature lives in the Celery worker at
`apps/worker/app/deeptwin_simulation.py` and is dispatched via the
`deepsynaps.deeptwin.simulate` Celery task registered in `apps/worker/app/jobs.py`.
The API surface is exposed through `POST /api/v1/deeptwin/simulate` in
`apps/api/app/routers/deeptwin_router.py`.

**There is no real simulation model.** The worker returns deterministic
placeholder data seeded by `(patient_id, protocol_id)`. The system is wired
end-to-end (API -> Celery -> worker -> response schema) so the deployment
pipeline, monitoring, and UI rendering can all be validated, but the
_numerical output has no clinical meaning._

## Current Behavior (3 Code Paths)

### Path 1: Feature Flag Off

When `DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION` resolves to `False`
(default in production/staging), the worker short-circuits immediately:

```json
{
  "status": "disabled",
  "reason": "deeptwin_simulation_not_enabled_in_environment",
  "message": "DeepTwin simulation is gated off in this environment. Contact admin to enable."
}
```

The API router maps this to HTTP 503 with `code: "deeptwin_simulation_disabled"`.

### Path 2: autoresearch Installed

If `import autoresearch` succeeds, the worker returns:

```json
{
  "engine": {"name": "autoresearch", "status": "available"},
  "status": "not_implemented",
  "job_id": "<job_id>",
  "inputs_echo": { ... },
  "notes": [
    "Autoresearch is installed but Deeptwin requires a domain-specific simulator wrapper.",
    "Recommended: run simulator in worker, store artifacts, and return pointers to API for auditability."
  ]
}
```

No simulation is actually performed. This path exists to detect when the
research framework is available so the integration can proceed.

### Path 3: Stub (Default in Dev/Test)

The deterministic stub generates a timecourse seeded by `abs(hash((patient_id, protocol_id))) % 1000`:

```json
{
  "engine": {
    "name": "stub",
    "status": "placeholder",
    "real_ai": false,
    "notice": "No production simulation model is connected. Output is deterministic placeholder data for UI development only."
  },
  "job_id": "<job_id>",
  "timecourse": [ {"day": 0, "delta_symptom_score": -0.15}, ... ],
  "modalities_used": [...],
  "scenario": { ... }
}
```

### Key Safety Properties

| Property | Value | Enforced By |
|---|---|---|
| `engine.real_ai` | `false` | Worker code, API tests |
| `engine.status` | `placeholder` | Worker code, API tests |
| `engine.notice` | Present, mentions "placeholder" | Worker code |
| Feature gate in production | Off by default | `_is_simulation_enabled()` + settings |
| Clinician role required | Yes | `_require_clinician_review_actor()` in router |
| Cross-clinic patient access gate | Yes | `_gate_patient_access()` in router |

## Input Schema

```python
class DeeptwinSimulationJob(BaseModel):
    job_id: str
    tenant_id: str | None = None
    patient_id: str = Field(..., min_length=1)
    protocol_id: str = Field(..., min_length=1)
    horizon_days: int = Field(90, ge=7, le=365)
    modalities: list[str] = Field(default_factory=list)
    scenario: dict[str, Any] = Field(default_factory=dict)
```

## Output Schema (Stub Path)

| Field | Type | Description |
|---|---|---|
| `engine.name` | `str` | Always `"stub"` |
| `engine.status` | `str` | Always `"placeholder"` |
| `engine.real_ai` | `bool` | Always `False` |
| `engine.notice` | `str` | Human-readable placeholder notice |
| `job_id` | `str` | Echo of input job_id |
| `timecourse` | `list[dict]` | Deterministic `[{day, delta_symptom_score}]` |
| `modalities_used` | `list[str]` | Echo of input modalities |
| `scenario` | `dict` | Echo of input scenario |

## Timeout Handling

- **Celery task timeout**: Not explicitly configured in the task registration (`bind=False`, no `time_limit` or `soft_time_limit`).
- **Worker-level**: Celery's default `task_time_limit` applies (typically 300s if configured in Celery settings, otherwise no limit).
- **Recommendation**: When a real simulation model is connected, add `soft_time_limit=120` and `time_limit=180` to the `@celery_app.task` decorator. The stub completes in <10ms so this is not currently a risk.

## Task Result Schema

The Celery task `deeptwin_simulation_job` (name: `deepsynaps.deeptwin.simulate`)
accepts a `dict[str, Any]` payload, validates it via `DeeptwinSimulationJob.model_validate()`,
and returns `dict[str, Any]`. If the simulation module fails to import:

```json
{"status": "failed", "error": "deeptwin simulation job unavailable"}
```

## Celery Broker Requirements

| Environment | Requirement |
|---|---|
| production/staging | Real Celery + `CELERY_BROKER_URL` required. Module raises `RuntimeError` at import time if either is missing. |
| development/test | Noop fallback allowed with WARNING log. Jobs run inline (blocking). |

## Clinical Safety Language

All simulation outputs use the following safety vocabulary:

- `"placeholder"` (never `"active"` or `"ok"`)
- `"real_ai": false`
- `"Decision-support only"` in all router-level responses
- `"decision_support_only": true` on every simulation response
- Clinician review required before any clinical action
- `"approval_required": true` on all simulation reports

## What Does NOT Exist

1. **No trained simulation model** - outputs are RNG-seeded, not learned from data
2. **No real brain twin** - the name "Brain Twin" is aspirational product naming
3. **No patient-specific learned parameters** - seed is from `hash(patient_id)` only
4. **No real-time data fusion** - timecourse ignores actual patient history
5. **No validated outcome predictions** - the delta_symptom_score curve is synthetic
6. **No calibrated confidence intervals** - all uncertainty bands are illustrative
7. **No regulatory clearance** - this is a research/preview feature

## Upgrade Path to Real Simulation

1. Implement or integrate a neuromodulation simulation engine (e.g., biophysical or ML-based)
2. Add `soft_time_limit` and `time_limit` to the Celery task decorator
3. Store simulation artifacts in object storage, return pointers
4. Wire real patient feature vectors (from feature store) into the engine
5. Add calibration dataset and reliability metrics
6. Update `engine.real_ai` to `True` and `engine.status` to `"active"` only after validation
7. Update AI health endpoint to reflect actual model availability
8. Add outcome tracking for post-market surveillance

## Test Enforcement

Tests that must pass for this contract to hold:

- `test_worker_returns_disabled_status_when_flag_off` (simulation gate)
- `test_worker_proceeds_past_gate_when_flag_on` (stub fallback)
- `test_simulate_endpoint_returns_503_when_flag_disabled` (router 503)
- `test_simulate_stub_declares_placeholder` (honesty)
- `test_simulate_engine_not_active` (not active)
- `test_health_deeptwin_simulation_not_implemented` (health endpoint)
- `test_brain_twin_worker_stub_returns_real_ai_false` (new)
- `test_brain_twin_worker_stub_includes_placeholder_notice` (new)
- `test_brain_twin_celery_task_validates_payload` (new)
- `test_brain_twin_disabled_path_has_clinician_review_language` (new)
