#!/usr/bin/env python3
"""
Example: MRI-oriented workflow with the lean orchestrator.

Step 1: ``validate_nifti_header`` on a T1 path (always available).
Step 2: If ``deepsynaps_mri.morphometry_reporting`` exists, run ``compute_regional_volumes``
        on ``aseg.stats``; otherwise writes a stub artefact (module not in all checkouts).

Usage:
  python demo/workflow_mri_example.py /path/to/t1.nii.gz /path/to/out_dir [/path/to/aseg.stats]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO / "src"))

from deepsynaps_mri.validation import validate_nifti_header
from deepsynaps_mri.workflow_orchestration import (
    ArtifactRecord,
    PipelineNode,
    PipelineRun,
    StepResult,
    collect_provenance,
    execute_pipeline,
)


def _maybe_compute_volumes(run: PipelineRun, node: PipelineNode) -> StepResult:
    p = run.context.get("aseg_stats_path")
    if not p:
        stub = Path(run.artefacts_dir) / "workflow" / "morphometry_skipped.txt"
        stub.write_text("no aseg_stats_path in context\n", encoding="utf-8")
        return StepResult(
            ok=True,
            message="skipped_no_aseg",
            artifacts=[
                ArtifactRecord(node_id=node.id, path=str(stub), kind="file", label="stub"),
            ],
        )
    try:
        from deepsynaps_mri.morphometry_reporting import compute_regional_volumes
    except ImportError:
        stub = Path(run.artefacts_dir) / "workflow" / "morphometry_unavailable.txt"
        stub.write_text("morphometry_reporting not installed in this checkout\n", encoding="utf-8")
        return StepResult(
            ok=True,
            message="morphometry_optional_missing",
            artifacts=[
                ArtifactRecord(node_id=node.id, path=str(stub), kind="file", label="stub"),
            ],
        )

    res = compute_regional_volumes(artefacts_dir=run.artefacts_dir, aseg_stats_path=p)
    arts = []
    if res.manifest_path:
        arts.append(
            ArtifactRecord(
                node_id=node.id,
                path=res.manifest_path,
                kind="json",
                label="regional_volumes",
            )
        )
    return StepResult(
        ok=res.ok,
        message=res.message,
        artifacts=arts,
        context_updates={"n_regions_volume": len(res.rows) if res.ok else 0},
    )


def validate_t1(run: PipelineRun, node: PipelineNode) -> StepResult:
    t1_path = run.context.get("t1_path")
    if not t1_path:
        return StepResult(ok=False, message="context missing t1_path")
    vr = validate_nifti_header(Path(t1_path))
    log_path = Path(run.artefacts_dir) / "workflow" / "validation_log.txt"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(str(vr.to_dict()), encoding="utf-8")
    return StepResult(
        ok=vr.ok,
        message=vr.message,
        artifacts=[
            ArtifactRecord(
                node_id=node.id,
                path=str(log_path),
                kind="log",
                label="validation",
            ),
        ],
        context_updates={"nifti_validation_ok": vr.ok},
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="DeepSynaps workflow MRI example")
    ap.add_argument("t1", help="T1 NIfTI path")
    ap.add_argument("out_dir", help="Output artefacts directory")
    ap.add_argument("aseg", nargs="?", default=None, help="Optional aseg.stats")
    args = ap.parse_args()

    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)

    ctx = {"t1_path": str(Path(args.t1).resolve())}
    if args.aseg:
        ctx["aseg_stats_path"] = str(Path(args.aseg).resolve())

    nodes = [
        PipelineNode(
            id="validate_nifti",
            name="Validate T1 NIfTI",
            handler_key="validate_t1",
            metadata={"tool": "deepsynaps_mri.validation"},
        ),
        PipelineNode(
            id="regional_volumes",
            name="Regional volumes (optional)",
            handler_key="volumes",
            depends_on=["validate_nifti"],
            metadata={"tool": "morphometry_reporting"},
            continue_on_failure=True,
        ),
    ]

    run = execute_pipeline(
        nodes,
        {"validate_t1": validate_t1, "volumes": _maybe_compute_volumes},
        out,
        initial_context=ctx,
    )

    print("run_id:", run.run_id)
    print("status:", run.status)
    print("provenance keys:", list(collect_provenance(run).keys()))


if __name__ == "__main__":
    main()
