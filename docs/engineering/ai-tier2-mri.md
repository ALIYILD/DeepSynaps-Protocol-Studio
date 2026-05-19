# Tier 2 — MRI Segmentation Pipeline (FastSurfer + SynthSeg)

Tier 2 of the three-tier DeepSynaps AI architecture. Orchestrates MRI
segmentation pipelines behind a uniform `/api/v1/ai/mri/*` contract.

| Pipeline   | Target runtime | GPU   | Upstream                                              | License    |
|------------|----------------|-------|-------------------------------------------------------|------------|
| FastSurfer | <60 s          | yes   | <https://github.com/Deep-MI/FastSurfer>               | Apache-2.0 |
| SynthSeg   | <90 s          | no    | <https://github.com/BBillot/SynthSeg>                 | Apache-2.0 |

Downstream consumers in DeepSynaps Studio:

- **HD-BET** skull-stripper (<https://github.com/MIC-DKFZ/HD-BET>, Apache-2.0)
  is run as a pre-step inside the FastSurfer pipeline; surfaced as a
  `stage` in the job envelope, not as a separate pipeline.
- **SimNIBS 4.6** E-field simulation
  (<https://simnibs.github.io/simnibs/>) consumes the segmentation as
  input — see the protocol-studio repository for the SimNIBS wiring.

## Status: stub

This PR ships the contract only:

- Service package `apps/api/app/services/ai/tier2_mri/`
- Router `apps/api/app/routers/ai_tier2_mri_router.py` mounted at `/api/v1/ai/mri`
- Schemas, pipeline registry, canonical disclaimer
- Stub `MriPipelineRunner` that returns `stub: True, segmentation_uri: None`
- 7 tests covering health, registry, role gating, schema validation, OpenAPI registration

**No model binaries, no docker images, no NIfTI volumes are touched.** The
docker SDK / subprocess runner / job queue are NOT added as dependencies
in this PR.

## Endpoints

| Method | Path                            | Role        | Notes                                |
|--------|---------------------------------|-------------|--------------------------------------|
| GET    | `/api/v1/ai/mri/health`         | any auth    | Reports stub status.                 |
| GET    | `/api/v1/ai/mri/pipelines`      | any auth    | Registry metadata only.              |
| POST   | `/api/v1/ai/mri/jobs`           | clinician+  | Returns stub envelope (fresh UUID).  |
| GET    | `/api/v1/ai/mri/jobs/{job_id}`  | clinician+  | Returns stub envelope for any id.    |

Every response carries
`disclaimer = "AI-derived MRI segmentation. Clinician must verify anatomical accuracy. Not a diagnostic image."`

## Configuration

Read from environment at process start:

| Variable                  | Default | Purpose                                         |
|---------------------------|---------|-------------------------------------------------|
| `MRI_PIPELINE_WORKDIR`    | unset   | Scratch dir for per-job working trees.          |
| `MRI_FASTSURFER_IMAGE`    | unset   | Docker image reference (e.g. `deepmi/fastsurfer:cpu-v2.4.2`). |
| `MRI_GPU_DEVICE`          | `cpu`   | `cpu` / `cuda:0` / etc.                         |

While `MRI_PIPELINE_WORKDIR` or `MRI_FASTSURFER_IMAGE` is unset, every
job stays in stub mode.

## Follow-up work (not in this PR)

1. **Containerize pipelines.** Add docker-SDK (or subprocess) runner
   under `pipeline_runner.py`. FastSurfer publishes CPU and GPU images
   directly; SynthSeg ships as a Python package suitable for subprocess.
2. **Job queue.** Wire Celery or RQ (or use `apps/worker/`). Persist
   `MriJobResponse` state in Postgres so `/jobs/{job_id}` returns the
   real stage.
3. **NIfTI I/O.** Resolve `input_uri` (S3 / local file) → workdir;
   upload `segmentation_uri` to object store on completion.
4. **HD-BET skull-strip stage.** Run before FastSurfer, surface
   intermediate output paths in the job envelope.
5. **Integrate with `apps/worker/`.** That package already runs async
   jobs; the MRI runner should plug into the same worker pool.
6. **Promote env vars to `AppSettings`.** Once the contract is settled.
7. **Cross-clinic gate.** Once jobs are tied to a patient, gate
   `GET /jobs/{job_id}` through `_gate_patient_access` like other
   patient-scoped endpoints.

## Phase 3 context

This is Tier 2 (MRI) of 3 in the DeepSynaps AI roadmap. Tier 1 (cloud
LLM) and Tier 2 (qEEG) ship in sibling PRs.
