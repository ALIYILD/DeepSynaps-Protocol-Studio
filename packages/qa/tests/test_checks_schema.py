"""Tests for ``deepsynaps_qa.checks.schema.SchemaCheck``.

Pins the load-bearing JSON-Schema conformance check contract:

- No schema_ref configured -> INFO passed=True (skip, not block).
- schema_ref points at missing file -> WARNING passed=False
  (operator surface: the file is missing, but don't block the run).
- jsonschema library missing -> INFO passed=True (skip with note).
- Validation errors emitted as BLOCK checks, one per error, with
  the JSON-pointer absolute_path.
- Deprecated fields emit WARNING per field.
- Schema with additionalProperties=false emits INFO per unknown
  field.
- All-clean validation emits INFO passed=True ("Schema validation
  passed").
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from deepsynaps_qa.checks.schema import SchemaCheck
from deepsynaps_qa.models import (
    Artifact,
    ArtifactType,
    CheckSeverity,
    QASpec,
)


def _spec(*, schema_ref: str = "") -> QASpec:
    return QASpec(
        spec_id="spec:test_v1",
        artifact_type=ArtifactType.QEEG_NARRATIVE,
        schema_ref=schema_ref,
    )


def _artifact(*, schema_ref: str = "") -> Artifact:
    return Artifact(
        artifact_id="A1",
        artifact_type=ArtifactType.QEEG_NARRATIVE,
        content="x",
        schema_ref=schema_ref,
    )


# ── No schema_ref configured ─────────────────────────────────────────────


class TestNoSchemaRef:
    def test_emits_info_passed_when_neither_spec_nor_artifact_carries_ref(self) -> None:
        # Pin: skip is INFO + passed=True, NOT a fail.
        out = SchemaCheck().run(_artifact(), _spec())
        assert len(out) == 1
        assert out[0].severity == CheckSeverity.INFO
        assert out[0].passed is True
        assert "schema check skipped" in out[0].message.lower()


# ── schema_ref points at missing file ────────────────────────────────────


class TestMissingSchemaFile:
    def test_emits_warning_passed_false(self, tmp_path: Path) -> None:
        # Pin: missing file is WARNING (operator surface), not BLOCK.
        out = SchemaCheck().run(
            _artifact(),
            _spec(schema_ref=str(tmp_path / "does_not_exist.json")),
        )
        assert len(out) == 1
        assert out[0].severity == CheckSeverity.WARNING
        assert out[0].passed is False
        assert "not found" in out[0].message.lower()


# ── Validation errors ────────────────────────────────────────────────────


class TestSchemaValidation:
    def test_clean_doc_emits_info_passed(self, tmp_path: Path) -> None:
        # An open-permissive schema (no required fields) → no errors →
        # the function emits the canonical "Schema validation passed"
        # INFO at the end.
        schema_path = tmp_path / "open.json"
        schema_path.write_text(
            json.dumps(
                {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {},
                }
            ),
            encoding="utf-8",
        )
        out = SchemaCheck().run(
            _artifact(),
            _spec(schema_ref=str(schema_path)),
        )
        passes = [r for r in out if r.passed and r.check_id == "schema.invalid"]
        assert len(passes) == 1
        assert "validation passed" in passes[0].message.lower()

    def test_required_field_missing_emits_block(self, tmp_path: Path) -> None:
        # Pin: validation errors are BLOCK. A "required" field missing
        # MUST surface a block-level finding so it forces FAIL.
        schema_path = tmp_path / "required.json"
        schema_path.write_text(
            json.dumps(
                {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "required": ["nonexistent_field"],
                    "properties": {"nonexistent_field": {"type": "string"}},
                }
            ),
            encoding="utf-8",
        )
        out = SchemaCheck().run(
            _artifact(),
            _spec(schema_ref=str(schema_path)),
        )
        blocks = [r for r in out if r.severity == CheckSeverity.BLOCK]
        assert len(blocks) >= 1
        assert all(r.passed is False for r in blocks)

    def test_deprecated_field_emits_warning(self, tmp_path: Path) -> None:
        schema_path = tmp_path / "deprecated.json"
        schema_path.write_text(
            json.dumps(
                {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "properties": {
                        "content": {"type": "string", "deprecated": True},
                    },
                }
            ),
            encoding="utf-8",
        )
        # The artifact has 'content' set to "x", so the deprecated
        # warning should fire.
        out = SchemaCheck().run(
            _artifact(),
            _spec(schema_ref=str(schema_path)),
        )
        warnings = [r for r in out if r.severity == CheckSeverity.WARNING]
        assert any("deprecated" in r.message.lower() for r in warnings)

    def test_extra_field_emits_info_when_additional_properties_false(
        self, tmp_path: Path
    ) -> None:
        # When additionalProperties=False AND properties is set, any
        # field in the doc that isn't declared emits an INFO.
        schema_path = tmp_path / "strict.json"
        schema_path.write_text(
            json.dumps(
                {
                    "$schema": "https://json-schema.org/draft/2020-12/schema",
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "artifact_id": {"type": "string"},
                    },
                }
            ),
            encoding="utf-8",
        )
        out = SchemaCheck().run(
            _artifact(),
            _spec(schema_ref=str(schema_path)),
        )
        infos = [r for r in out if r.severity == CheckSeverity.INFO and not r.passed]
        # At least one extra-field INFO fires (the artifact has 6+
        # fields not in the strict schema).
        assert len(infos) > 0
        for inf in infos:
            assert "Unknown field" in inf.message


# ── Spec.schema_ref preferred over Artifact.schema_ref ──────────────────


class TestSchemaRefResolution:
    def test_spec_ref_used_first(self, tmp_path: Path) -> None:
        # Pin: spec.schema_ref takes precedence over artifact.schema_ref.
        spec_schema = tmp_path / "spec.json"
        spec_schema.write_text(
            json.dumps({"type": "object"}),
            encoding="utf-8",
        )
        out = SchemaCheck().run(
            _artifact(schema_ref=str(tmp_path / "missing.json")),
            _spec(schema_ref=str(spec_schema)),
        )
        # The resolved schema is the spec's; no "not found" warning.
        assert all("not found" not in r.message.lower() for r in out)

    def test_artifact_ref_falls_back(self, tmp_path: Path) -> None:
        # When the spec has no schema_ref, the artifact's is used.
        artifact_schema = tmp_path / "art.json"
        artifact_schema.write_text(
            json.dumps({"type": "object"}),
            encoding="utf-8",
        )
        out = SchemaCheck().run(
            _artifact(schema_ref=str(artifact_schema)),
            _spec(schema_ref=""),
        )
        # Validates cleanly via the artifact-side ref.
        assert all("not found" not in r.message.lower() for r in out)
