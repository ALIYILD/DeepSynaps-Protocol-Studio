"""Tests for the audit trail."""

from __future__ import annotations

from deepsynaps_qa.audit import compute_hash, emit_audit_record, verify_chain
from deepsynaps_qa.models import QAResult, Score, Verdict


def _make_result(run_id: str = "run-1", score: float = 85.0) -> QAResult:
    return QAResult(
        run_id=run_id,
        artifact_id="art-1",
        spec_id="spec:test",
        score=Score(numeric=score, block_count=0),
        verdict=Verdict.PASS,
        timestamp_utc="2024-01-01T00:00:00Z",
    )


def test_hash_is_deterministic():
    payload = {"a": 1, "b": "hello"}
    h1 = compute_hash("prev", payload)
    h2 = compute_hash("prev", payload)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex


def test_different_prev_hash_gives_different_result():
    payload = {"a": 1}
    h1 = compute_hash("prev1", payload)
    h2 = compute_hash("prev2", payload)
    assert h1 != h2


def test_emit_audit_record_creates_valid_entry():
    result = _make_result()
    entry = emit_audit_record(result, operator="test_user")
    assert entry.run_id == "run-1"
    assert entry.prev_hash == "GENESIS"
    assert len(entry.this_hash) == 64
    assert entry.operator == "test_user"


def test_verify_chain_valid():
    result = _make_result()
    entry1 = emit_audit_record(result, operator="user1")
    # Chain a second entry
    result2 = _make_result(run_id="run-2", score=70.0)
    result2.verdict = Verdict.NEEDS_REVIEW
    result2.score.numeric = 70.0
    entry2 = emit_audit_record(result2, operator="user2", prev_hash=entry1.this_hash)
    assert verify_chain([entry1, entry2])


def test_verify_chain_tampered():
    result = _make_result()
    entry = emit_audit_record(result, operator="user1")
    # Tamper with the hash
    entry.this_hash = "0" * 64
    assert not verify_chain([entry])
