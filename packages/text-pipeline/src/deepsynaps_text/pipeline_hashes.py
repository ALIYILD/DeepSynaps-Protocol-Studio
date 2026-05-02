"""Canonical hashing for audit trails (no PHI in logs — hashes only)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from deepsynaps_text.schemas import ClinicalTextDocument, TextPipelineDefinition


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonical_clinical_body(doc: ClinicalTextDocument) -> str:
    """Same precedence as NLP working text: normalized → de-identified → raw."""
    if doc.normalized_text is not None:
        return doc.normalized_text
    if doc.deidentified_text is not None:
        return doc.deidentified_text
    return doc.raw_text


def hash_pipeline_definition(definition: TextPipelineDefinition) -> str:
    data = definition.model_dump(mode="json")
    s = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return sha256_hex(s)


def hash_json_object(obj: Any) -> str:
    s = json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)
    return sha256_hex(s)
