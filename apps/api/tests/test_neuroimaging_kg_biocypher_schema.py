"""Phase 5 — BioCypher schema-summary unit test.

We synthesise a tiny biocypher-style YAML schema file at tmp_path and ask the
service to count entities and edges. We do NOT load a full BioCypher ontology
— that would pull megabytes of node/edge types from the BioCypher core
schemas. The Phase 5 endpoint only needs surface counts.
"""
from __future__ import annotations

import importlib


def _reload_module():
    from app.services.neuroimaging import kg_biocypher
    return importlib.reload(kg_biocypher)


_TINY_YAML = """\
# Two entities, one edge — typical biocypher schema layout
protein:
  represented_as: node
  preferred_id: uniprot
  input_label: protein
disease:
  represented_as: node
  preferred_id: doid
  input_label: disease
protein_to_disease_association:
  represented_as: edge
  source: protein
  target: disease
  input_label: associated_with
"""


def test_build_schema_summary_counts_entities_and_edges(tmp_path):
    """Synth a 2-entity / 1-edge YAML; expect n_entity_types=2 n_edge_types=1."""
    kg = _reload_module()
    yaml_path = tmp_path / "schema.yaml"
    yaml_path.write_text(_TINY_YAML)
    summary = kg.build_schema_summary(str(yaml_path))
    assert summary["n_entity_types"] == 2
    assert summary["n_edge_types"] == 1
    assert summary["source"] == str(yaml_path)
