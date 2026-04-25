"""Hash-chain audit trail for QA runs."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from uuid import uuid4

from deepsynaps_qa.models import QAAuditEntry, QAResult


def compute_hash(prev_hash: str, entry_payload: dict) -> str:
    """Compute SHA-256 of ``prev_hash || canonical_json(payload)``."""
    content = prev_hash + json.dumps(entry_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def emit_audit_record(
    result: QAResult,
    operator: str = "",
    prev_hash: str = "GENESIS",
) -> QAAuditEntry:
    """Create an audit record for a completed QA run."""
    entry_id = str(uuid4())
    timestamp = datetime.now(tz=UTC).isoformat()

    payload = {
        "entry_id": entry_id,
        "run_id": result.run_id,
        "artifact_id": result.artifact_id,
        "spec_id": result.spec_id,
        "score": result.score.numeric,
        "verdict": result.verdict.value,
        "block_count": result.score.block_count,
        "warning_count": result.score.warning_count,
        "info_count": result.score.info_count,
        "operator": operator,
        "timestamp_utc": timestamp,
    }

    this_hash = compute_hash(prev_hash, payload)

    return QAAuditEntry(
        entry_id=entry_id,
        run_id=result.run_id,
        artifact_id=result.artifact_id,
        artifact_type=result.artifact_id,  # populated from result context
        spec_id=result.spec_id,
        score=result.score.numeric,
        verdict=result.verdict.value,
        block_count=result.score.block_count,
        warning_count=result.score.warning_count,
        info_count=result.score.info_count,
        operator=operator,
        timestamp_utc=timestamp,
        prev_hash=prev_hash,
        this_hash=this_hash,
    )


def verify_chain(records: list[QAAuditEntry]) -> bool:
    """Verify integrity of a sequence of audit records.

    Returns ``True`` if every record's ``this_hash`` matches the recomputed
    hash from its ``prev_hash`` and payload.  Returns ``False`` on any gap.
    """
    for record in records:
        payload = {
            "entry_id": record.entry_id,
            "run_id": record.run_id,
            "artifact_id": record.artifact_id,
            "spec_id": record.spec_id,
            "score": record.score,
            "verdict": record.verdict,
            "block_count": record.block_count,
            "warning_count": record.warning_count,
            "info_count": record.info_count,
            "operator": record.operator,
            "timestamp_utc": record.timestamp_utc,
        }
        expected = compute_hash(record.prev_hash, payload)
        if expected != record.this_hash:
            return False
    return True
