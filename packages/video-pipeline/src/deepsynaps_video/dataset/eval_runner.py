"""End-to-end model-bundle evaluation.

One command turns a manifest + a model bundle into ``eval_report.json``,
which the dashboard ingests for the "Errors" tab and which gates promotion
of a new bundle to production.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any


def run_eval(
    manifest_path: Path,
    *,
    bundle_id: str,
    output_path: Path,
) -> dict[str, Any]:
    """Run a model bundle over a manifest and write ``eval_report.json``.

    TODO(impl):
    1. Load manifest with ``manifest.load_manifest``.
    2. For each clip, run the full ``pipeline.run_task`` path.
    3. Join predictions to ground truth.
    4. Hand off to ``error_analysis.evaluate`` for slice metrics.
    5. Write a JSON report and return the in-memory dict.
    """

    _ = (manifest_path, bundle_id, output_path)
    raise NotImplementedError


__all__ = ["run_eval"]
