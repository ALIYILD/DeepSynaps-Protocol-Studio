# Workflow orchestration (`deepsynaps_mri.workflow_orchestration`)

## Architecture (lean)

This is **not** a full Nipype/Luigi replacement. It is a **small stateful runner**:

- **Nodes** = `PipelineNode` (id, `handler_key`, `depends_on`, retry policy, `continue_on_failure`).
- **Handlers** = plain callables `(run, node) -> StepResult` registered in a dict.
- **State** = `workflow/pipeline_state.json` (full `PipelineRun` JSON) updated after **each** node.
- **Provenance** = `workflow/provenance.json` from `collect_provenance(run)`.

Nipype-style ideas retained: **explicit DAG order**, **artifact records**, **run id**, **structured logs**. Omitted: distributed execution, generic interface specs, provenance RDF.

## API

| Symbol | Role |
|--------|------|
| `PipelineNode` | Step definition + metadata for audit. |
| `PipelineRun` | Live + persisted run envelope (`context`, `node_states`, `execution_order`). |
| `ArtifactRecord` | Path + kind + label per output. |
| `execute_pipeline(nodes, handlers, artefacts_dir, ...)` | Run or **resume** (`resume=True` loads state if graph matches). |
| `resume_pipeline(artefacts_dir, handlers)` | Convenience: load + `execute_pipeline(..., resume=True)`. |
| `collect_provenance(run)` | Single JSON blob for DB / compliance. |
| `load_pipeline_run(artefacts_dir)` | Read state without executing. |

## Status semantics

- **Node:** `pending` → `running` → `success` | `failed` | `skipped` (skipped when upstream failed and `continue_on_failure` is false on the failed node’s dependents).
- **Run:** `completed` (no failed nodes), `failed` (hard stop: a node failed without `continue_on_failure`), `partial` (some nodes failed but execution continued).

## Resume and graph identity

If `resume=True` and `workflow/pipeline_state.json` exists, the **serialized** `PipelineNode` list must match the nodes you pass in. A mismatch raises `ValueError` instead of silently starting a new run with stale state (avoids corrupt or crossed patient runs).

## Provenance JSON

`collect_provenance` / `workflow/provenance.json` include `node_states` (per-node status, attempts, errors, timestamps) in addition to declarative `nodes` and flat `artifacts`.

## Retries

`max_retries=N` ⇒ **N** additional attempts after the first failure (total **1+N** tries). Only transient steps should use retries.

## Failure isolation

- Default: first failing node **aborts** unstarted dependents (`skipped`).
- `continue_on_failure=True` on a node: if **that** node fails, dependents still run (use for optional QC).

## Example

- **Script:** `demo/workflow_mri_example.py` — validates T1 + runs `compute_regional_volumes` on `aseg.stats`.
- **Tests:** `tests/test_workflow_orchestration.py`.

## Integration with `pipeline.py`

Keep `run_pipeline()` as the monolithic clinical path. Use this orchestrator for **new modular DAGs** (preprocessing → segmentation → morphometry) or **worker jobs** that must survive restarts. Optionally wrap legacy stages as single-node handlers later.
