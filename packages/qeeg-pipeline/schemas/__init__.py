"""Machine-readable JSON Schemas for the qEEG payload contract.

This package ships ``qeeg_payload_v3.json`` — the canonical, unified spec that
folds CONTRACT.md (V1), CONTRACT_V2.md (V2), and CONTRACT_V3.md (V3) into one
JSON Schema (draft 2020-12). The original markdown files remain the source of
truth used by the runtime pipeline (PR-A is additive only); PR-B will wire
this schema into validators and rewrite CONTRACT.md as a summary.

Typical use::

    from deepsynaps_qeeg.schemas import load_v3_schema, SCHEMA_VERSION
    schema = load_v3_schema()
    assert SCHEMA_VERSION == "v3"

The package also doubles as a ``deepsynaps_qeeg.schemas`` import path: the
top-level package is published from ``packages/qeeg-pipeline/schemas/`` so
that ``importlib.resources`` works without depending on setuptools data-file
configuration in PR-A. PR-B will move it under ``src/deepsynaps_qeeg/`` once
the pipeline runtime depends on it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

__all__ = ["SCHEMA_VERSION", "SCHEMA_FILENAME", "schema_path", "load_v3_schema"]

#: Canonical version label for the qEEG payload contract.
SCHEMA_VERSION: str = "v3"

#: Filename of the unified schema relative to this package.
SCHEMA_FILENAME: str = "qeeg_payload_v3.json"


def schema_path() -> Path:
    """Return the absolute :class:`pathlib.Path` to the V3 schema JSON file.

    Returns
    -------
    pathlib.Path
        Path to ``qeeg_payload_v3.json`` shipped alongside this module.
    """
    return Path(__file__).resolve().parent / SCHEMA_FILENAME


def load_v3_schema() -> dict[str, Any]:
    """Load and return the unified V3 qEEG payload JSON Schema.

    Returns
    -------
    dict
        Parsed JSON Schema (draft 2020-12) folding CONTRACT.md, CONTRACT_V2.md,
        and CONTRACT_V3.md into one machine-readable spec.

    Raises
    ------
    FileNotFoundError
        If the schema file is missing from the package directory.
    json.JSONDecodeError
        If the schema file is not valid JSON.
    """
    with schema_path().open("r", encoding="utf-8") as handle:
        return json.load(handle)
