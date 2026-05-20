# Tier 2 — Real-Time E-Field Surrogate

A learned surrogate for SimNIBS E-field simulation, intended for fast
coil-placement preview during planning. Trades absolute accuracy for
sub-second latency so a clinician can iterate placement before a full
SimNIBS run.

**The surrogate is preview-only. SimNIBS remains the ground truth for
any clinical decision.**

## Status: stub

- Service: `apps/api/app/services/ai/tier2_efield/`
- Router: `/api/v1/ai/efield/*`
- 5 tests pass locally
- No surrogate model loaded, no E-field values returned

## Endpoints

| Method | Path                          | Role        |
|--------|-------------------------------|-------------|
| GET    | `/api/v1/ai/efield/health`      | any auth    |
| POST   | `/api/v1/ai/efield/simulate`    | clinician+  |

## Configuration

| Variable           | Default | Purpose                                  |
|--------------------|---------|------------------------------------------|
| `EFIELD_MODEL_PATH`| unset   | Path / HF id of the trained surrogate.   |
| `EFIELD_DEVICE`    | `cpu`   | Inference device.                        |

## Follow-up

1. Train surrogate against a SimNIBS-generated dataset (head models +
   coil positions → E-field). See sibling protocol-studio repo for the
   SimNIBS pipeline that produces training data.
2. Return real `peak_efield_v_per_m`, `target_efield_v_per_m`,
   `off_target_ratio`.
3. Render E-field overlay in the protocol-builder UI.
4. Always present a "run full SimNIBS" affordance next to surrogate
   output.

## Upstream

- SimNIBS: <https://simnibs.github.io/simnibs/>

Phase 3 — Phase C 6-12 month.
