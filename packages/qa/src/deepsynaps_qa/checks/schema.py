"""JSON Schema conformance checks."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from deepsynaps_qa.checks import BaseCheck, CheckRegistry
from deepsynaps_qa.models import Artifact, CheckResult, CheckSeverity, QASpec

_SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "specs" / "schemas"


def _load_schema(schema_ref: str) -> dict[str, Any] | None:
    """Load a JSON Schema from the built-in schemas directory."""
    # schema_ref may be a filename or a relative path
    candidate = _SCHEMAS_DIR / Path(schema_ref).name
    if candidate.exists():
        return json.loads(candidate.read_text(encoding="utf-8"))
    # Try as-is
    p = Path(schema_ref)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return None


@CheckRegistry.register
class SchemaCheck(BaseCheck):
    """Validate the artifact against its JSON Schema."""

    category = "schema"

    def run(self, artifact: Artifact, spec: QASpec) -> list[CheckResult]:
        results: list[CheckResult] = []
        schema_ref = spec.schema_ref or artifact.schema_ref
        if not schema_ref:
            results.append(
                self._result(
                    check_id="schema.invalid",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="No JSON Schema reference configured; schema check skipped.",
                )
            )
            return results

        schema = _load_schema(schema_ref)
        if schema is None:
            results.append(
                self._result(
                    check_id="schema.invalid",
                    severity=CheckSeverity.WARNING,
                    passed=False,
                    location=f"schema_ref={schema_ref}",
                    message=f"Schema file '{schema_ref}' not found.",
                )
            )
            return results

        try:
            import jsonschema
        except ImportError:
            results.append(
                self._result(
                    check_id="schema.invalid",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="jsonschema library not available; schema check skipped.",
                )
            )
            return results

        # Build the document to validate — combine artifact fields into a dict
        doc = artifact.model_dump(mode="json")

        validator_cls = jsonschema.validators.validator_for(schema)
        validator = validator_cls(schema)
        errors = list(validator.iter_errors(doc))

        deprecated_fields = set()
        if "properties" in schema:
            for field_name, field_schema in schema["properties"].items():
                if field_schema.get("deprecated", False):
                    deprecated_fields.add(field_name)

        additional_allowed = schema.get("additionalProperties", True)

        # ── BLOCK: validation errors ────────────────────────────────────
        for err in errors:
            results.append(
                self._result(
                    check_id="schema.invalid",
                    severity=CheckSeverity.BLOCK,
                    passed=False,
                    location=".".join(str(p) for p in err.absolute_path) or "(root)",
                    message=err.message,
                )
            )

        # ── WARNING: deprecated fields ──────────────────────────────────
        for field_name in deprecated_fields:
            if field_name in doc:
                results.append(
                    self._result(
                        check_id="schema.deprecated_field",
                        severity=CheckSeverity.WARNING,
                        passed=False,
                        location=field_name,
                        message=f"Field '{field_name}' is deprecated.",
                    )
                )

        # ── INFO: extra fields ──────────────────────────────────────────
        if not additional_allowed and "properties" in schema:
            known = set(schema["properties"].keys())
            for key in doc:
                if key not in known:
                    results.append(
                        self._result(
                            check_id="schema.extra_field",
                            severity=CheckSeverity.INFO,
                            passed=False,
                            location=key,
                            message=f"Unknown field '{key}' not declared in schema.",
                        )
                    )

        if not results:
            results.append(
                self._result(
                    check_id="schema.invalid",
                    severity=CheckSeverity.INFO,
                    passed=True,
                    message="Schema validation passed.",
                )
            )

        return results
