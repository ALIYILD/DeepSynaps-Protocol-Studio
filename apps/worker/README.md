# apps/worker

Background job runner for generation, rendering, and long-running modality
tasks.

qEEG note:
- The async qEEG Celery tasks delegate into shared API-layer services such as
  `app.services.qeeg_pipeline_job`.
- A worker environment that is expected to execute real qEEG analysis must
  install:
  - `apps/api`
  - `packages/qeeg-pipeline` with the required extras for the deployed flow
  - `celery`
  - the native/reporting/scientific dependencies required by that qEEG path

If those are not installed, the worker may still import in development/test
with noop or failure envelopes, but it is not production-ready for qEEG.
