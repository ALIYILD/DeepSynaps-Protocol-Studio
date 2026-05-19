# Tier 2 — sgACC-Connectivity TMS Targeting

Subgenual anterior cingulate cortex (sgACC) functional connectivity is the
single best-replicated predictor of TMS depression response in the
published literature — Pearson `r ≈ −0.55`, prospectively validated. The
service computes a recommended TMS coil location (MNI152 space) plus a
response-probability estimate from a resting-state fMRI volume.

Reference: Cash R.F.H. et al. *Functional Magnetic Resonance Imaging–Guided
Personalization of Transcranial Magnetic Stimulation Treatment for
Depression*, Biol. Psychiatry (2021).
<https://doi.org/10.1016/j.biopsych.2020.05.033>

## Status: stub

This PR ships the contract only:

- Service package `apps/api/app/services/ai/tier2_sgacc/`
- Router `apps/api/app/routers/ai_tier2_sgacc_router.py` mounted at `/api/v1/ai/sgacc`
- Schemas, canonical disclaimer
- Stub `SgaccPredictor` that returns `stub: True` with every nullable field set to `None`
- 6 tests covering health, role gating, schema validation, OpenAPI registration

**No fMRI is fetched, no connectivity is computed, no regression head is
loaded.** Real wiring lands in a follow-up PR.

## Endpoints

| Method | Path                          | Role        | Notes                                |
|--------|-------------------------------|-------------|--------------------------------------|
| GET    | `/api/v1/ai/sgacc/health`     | any auth    | Reports stub status.                 |
| POST   | `/api/v1/ai/sgacc/target`     | clinician+  | Returns stub envelope.               |

Every targeting response carries
`disclaimer = "TMS targeting suggestion derived from sgACC connectivity. Clinician must verify coil placement and clinical suitability. Not a treatment decision."`

## Configuration

Read from environment at process start:

| Variable                     | Default | Purpose                                                |
|------------------------------|---------|--------------------------------------------------------|
| `SGACC_REFERENCE_MAP_URI`    | unset   | Pointer to the sgACC reference seed map (NIfTI).       |
| `SGACC_MODEL_PATH`           | unset   | Path to the trained regression head (LightGBM/sklearn).|

While either is unset, every `/target` call returns stub.

## Follow-up work (not in this PR)

1. **Load the reference seed map.** The MNI-space sgACC seed used in the
   Cash et al. cohort. Cache as a numpy array at process start.
2. **Compute seed-based connectivity.** For each resting-state fMRI:
   resample to MNI152, extract the BOLD timeseries at every voxel,
   compute Pearson correlation against the seed timeseries, threshold +
   normalise.
3. **Train the regression head.** From the DeepSynaps outcomes DB:
   pair patients with pre-treatment fMRI and post-treatment PHQ-9
   response. Train LightGBM (or sklearn `Ridge`) on the connectivity
   features against response delta. Validate `predictor_correlation_r`
   in our cohort against the published `r ≈ −0.55`.
4. **Predict coil location.** From the highest-anticorrelation cluster
   in DLPFC, derive the MNI XYZ centroid; return it as
   `recommended_coil_mni`.
5. **Cross-clinic gate.** Once tied to a real patient, gate `/target`
   through `_gate_patient_access(actor, patient_id, db)` like other
   patient-scoped endpoints.
6. **Promote env vars to `AppSettings`** once the contract is settled.

## Upstream references

- Cash et al. 2021 — <https://doi.org/10.1016/j.biopsych.2020.05.033>
- Fox et al. 2012 (original anti-correlation finding) — <https://doi.org/10.1016/j.biopsych.2012.04.028>
- Weigand et al. 2018 (network targeting) — <https://doi.org/10.1016/j.biopsych.2017.10.028>

## Phase 3 context

Week 4-6 P1 in the DeepSynaps AI roadmap. Pairs with Tier 1 (LLM) and
Tier 2 MRI (FastSurfer) for the complete TMS-personalisation pipeline.
