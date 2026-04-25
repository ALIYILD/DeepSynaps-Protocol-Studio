"""Unit tests for deepsynaps_evidence.audit hash chain logic.

These tests use the audit module's internal hash computation function
and verify chain integrity checking against a mock session.
"""
from __future__ import annotations

from deepsynaps_evidence.audit import _compute_row_hash


def test_hash_deterministic():
    """Same inputs produce the same hash."""
    h1 = _compute_row_hash("evt-1", "include", "claim123", "GENESIS")
    h2 = _compute_row_hash("evt-1", "include", "claim123", "GENESIS")
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex


def test_hash_changes_with_event_id():
    h1 = _compute_row_hash("evt-1", "include", "claim123", "GENESIS")
    h2 = _compute_row_hash("evt-2", "include", "claim123", "GENESIS")
    assert h1 != h2


def test_hash_changes_with_decision():
    h1 = _compute_row_hash("evt-1", "include", "claim123", "GENESIS")
    h2 = _compute_row_hash("evt-1", "block", "claim123", "GENESIS")
    assert h1 != h2


def test_hash_changes_with_claim_hash():
    h1 = _compute_row_hash("evt-1", "include", "claim123", "GENESIS")
    h2 = _compute_row_hash("evt-1", "include", "claimXYZ", "GENESIS")
    assert h1 != h2


def test_hash_changes_with_prev_hash():
    h1 = _compute_row_hash("evt-1", "include", "claim123", "GENESIS")
    h2 = _compute_row_hash("evt-1", "include", "claim123", "abc123")
    assert h1 != h2


def test_genesis_chain_link():
    """First row in chain uses GENESIS as prev_hash."""
    h = _compute_row_hash("first-event", "include", "claim", "GENESIS")
    assert isinstance(h, str) and len(h) == 64


def test_chain_of_three():
    """Simulate a three-row chain and verify linkage."""
    h1 = _compute_row_hash("evt-1", "include", "c1", "GENESIS")
    h2 = _compute_row_hash("evt-2", "block", "c2", h1)
    h3 = _compute_row_hash("evt-3", "warn", "c3", h2)
    # Each hash is unique
    assert len({h1, h2, h3}) == 3
    # Changing h1 would break h2
    h1_tampered = _compute_row_hash("evt-1", "exclude", "c1", "GENESIS")
    h2_recomputed = _compute_row_hash("evt-2", "block", "c2", h1_tampered)
    assert h2_recomputed != h2
