"""Small JSON manifests under ``artefacts/manifests/`` for run_pipeline audit trail."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


def write_stage_manifest(
    artefacts_root: Path | str,
    stage: str,
    payload: dict[str, Any],
) -> Path:
    """
    Write ``<artefacts_root>/manifests/{stage}_manifest.json``.

    Parameters
    ----------
    artefacts_root
        Typically ``out_dir / "artefacts"``.
    stage
        Short identifier: ``ingest``, ``register``, etc.
    payload
        JSON-serialisable dict (paths as strings).
    """
    root = Path(artefacts_root)
    man_dir = root / "manifests"
    man_dir.mkdir(parents=True, exist_ok=True)
    path = man_dir / f"{stage}_manifest.json"
    body = {
        "stage": stage,
        "written_at": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    path.write_text(json.dumps(body, indent=2), encoding="utf-8")
    log.info("pipeline_manifest_written stage=%s path=%s", stage, path)
    return path
