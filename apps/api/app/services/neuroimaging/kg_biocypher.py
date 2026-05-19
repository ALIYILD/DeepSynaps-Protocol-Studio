"""Phase 5 BioCypher schema helpers.

Reads a biocypher-style YAML schema and returns surface counts. We do not
instantiate `BioCypher()` itself — that would load full ontologies.
"""
from __future__ import annotations

from typing import Any

import yaml

try:
    import biocypher as _biocypher  # noqa: F401
    HAS_BIOCYPHER: bool = True
except ImportError:
    _biocypher = None  # type: ignore[assignment]
    HAS_BIOCYPHER = False


_EDGE_VALUES = frozenset({"edge", "relationship"})


def build_schema_summary(yaml_path: str) -> dict[str, Any]:
    with open(yaml_path, encoding="utf-8") as fh:
        loaded = yaml.safe_load(fh) or {}
    if not isinstance(loaded, dict):
        return {"n_entity_types": 0, "n_edge_types": 0, "source": yaml_path}
    n_entity = 0
    n_edge = 0
    for value in loaded.values():
        if not isinstance(value, dict):
            continue
        represented_as = str(value.get("represented_as", "")).strip().lower()
        if represented_as in _EDGE_VALUES:
            n_edge += 1
        else:
            n_entity += 1
    return {"n_entity_types": n_entity, "n_edge_types": n_edge, "source": yaml_path}


__all__ = ["HAS_BIOCYPHER", "build_schema_summary"]
