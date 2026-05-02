"""Tests for the unified V3 qEEG payload JSON Schema.

Architect Rec #10 PR-A — additive only. The schema folds CONTRACT.md (V1),
CONTRACT_V2.md (V2), and CONTRACT_V3.md (V3) into one machine-readable spec.
PR-A only ships the schema + loader + this validator harness; the runtime
pipeline still reads the markdown files as source of truth.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

jsonschema = pytest.importorskip("jsonschema")

# Ensure ``packages/qeeg-pipeline/schemas/`` is importable as a top-level
# package even when the pipeline is not installed in editable mode (matches
# the pattern used by ``test_web_payload.py``).
_PKG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_PKG_ROOT))

from schemas import (  # noqa: E402  (deliberate sys.path manipulation above)
    SCHEMA_FILENAME,
    SCHEMA_VERSION,
    load_v3_schema,
    schema_path,
)

_FIXTURE_DIR = _PKG_ROOT / "tests" / "fixtures" / "payloads"
_FIXTURES = [
    _FIXTURE_DIR / "payload_v1_minimal.json",
    _FIXTURE_DIR / "payload_v2_ai_upgrades.json",
    _FIXTURE_DIR / "payload_v3_full.json",
]


def test_schema_constants():
    """Loader exposes the documented version + filename constants."""
    assert SCHEMA_VERSION == "v3"
    assert SCHEMA_FILENAME == "qeeg_payload_v3.json"
    assert schema_path().exists(), f"missing schema: {schema_path()}"


def test_schema_loads_and_self_validates():
    """The packaged schema is valid JSON Schema (draft 2020-12)."""
    schema = load_v3_schema()
    # Top-level metadata required by the contract spec.
    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert "$id" in schema
    assert schema["title"] == "QEEGPayloadV3"
    assert schema.get("version") == "v3"
    assert "description" in schema and schema["description"]

    # The schema itself must be a valid draft-2020-12 schema document.
    Validator = jsonschema.Draft202012Validator
    Validator.check_schema(schema)


@pytest.mark.parametrize("fixture_path", _FIXTURES, ids=lambda p: p.name)
def test_fixture_payload_validates(fixture_path: Path):
    """Each shipped payload fixture validates cleanly against the V3 schema."""
    import json

    schema = load_v3_schema()
    with fixture_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    validator = jsonschema.Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path))
    if errors:
        # Surface the first few errors with their JSON-Pointer-style paths.
        rendered = "\n".join(
            f"  - /{'/'.join(str(p) for p in err.absolute_path)}: {err.message}"
            for err in errors[:5]
        )
        pytest.fail(
            f"{fixture_path.name} failed schema validation ({len(errors)} error(s)):\n{rendered}"
        )


def test_invalid_payload_is_rejected():
    """Sanity check — a bogus payload is rejected (the schema actually constrains)."""
    schema = load_v3_schema()
    bogus = {
        # Missing all four required top-level keys.
        "not_a_real_field": 123,
    }
    validator = jsonschema.Draft202012Validator(schema)
    errors = list(validator.iter_errors(bogus))
    assert errors, "schema should reject payload missing required keys"
    missing = {err.message for err in errors if err.validator == "required"}
    # Each of the four V1 required fields should appear in at least one error message.
    for field in ("features", "zscores", "flagged_conditions", "quality"):
        assert any(field in msg for msg in missing), (
            f"expected required-field error mentioning '{field}', got: {missing}"
        )
