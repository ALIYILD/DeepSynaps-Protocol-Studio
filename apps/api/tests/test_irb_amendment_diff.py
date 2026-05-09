"""Unit tests for app.services.irb_amendment_diff — pure business logic, no DB."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services.irb_amendment_diff import (
    CHANGE_ADDED,
    CHANGE_MODIFIED,
    CHANGE_REMOVED,
    TRACKED_FIELDS,
    FieldDiff,
    _is_unset,
    _truncate,
    compute_amendment_diff,
)


# ── helpers ──────────────────────────────────────────────────────────────────

class TestIsUnset:
    def test_none_is_unset(self):
        assert _is_unset(None) is True

    def test_empty_string_is_unset(self):
        assert _is_unset("") is True

    def test_blank_string_is_unset(self):
        assert _is_unset("   ") is True

    def test_nonempty_string_is_not_unset(self):
        assert _is_unset("hello") is False

    def test_empty_list_is_unset(self):
        assert _is_unset([]) is True

    def test_nonempty_list_is_not_unset(self):
        assert _is_unset(["arm1"]) is False

    def test_empty_dict_is_unset(self):
        assert _is_unset({}) is True

    def test_zero_not_unset(self):
        # Integer 0 is not a sentinal; it's a real value
        assert _is_unset(0) is False


class TestTruncate:
    def test_short_string_unchanged(self):
        assert _truncate("short") == "short"

    def test_long_string_truncated(self):
        long = "x" * 1500
        result = _truncate(long)
        # 1000 chars + "…[truncated]" suffix (≤15 extra chars)
        assert len(result) <= 1015
        assert result.endswith("…[truncated]")

    def test_exactly_at_limit_unchanged(self):
        exact = "a" * 1000
        assert _truncate(exact) == exact

    def test_non_string_passed_through(self):
        assert _truncate([1, 2, 3]) == [1, 2, 3]
        assert _truncate(42) == 42
        assert _truncate(None) is None


# ── compute_amendment_diff ────────────────────────────────────────────────────

def _mock_protocol(title="Original Title", description="Original summary"):
    proto = MagicMock()
    proto.title = title
    proto.description = description
    # The other tracked fields don't exist on the current schema yet
    for f in TRACKED_FIELDS:
        if f not in ("title", "summary"):
            setattr(proto, f, None)
    return proto


class TestComputeAmendmentDiff:
    def test_added_when_old_is_none(self):
        proto = _mock_protocol(title=None)
        diffs = compute_amendment_diff(proto, {"title": "New Title"})
        assert len(diffs) == 1
        assert diffs[0].field == "title"
        assert diffs[0].change_type == CHANGE_ADDED
        assert diffs[0].old_value is None
        assert diffs[0].new_value == "New Title"

    def test_removed_when_new_is_empty(self):
        proto = _mock_protocol(title="Existing Title")
        diffs = compute_amendment_diff(proto, {"title": ""})
        assert len(diffs) == 1
        assert diffs[0].field == "title"
        assert diffs[0].change_type == CHANGE_REMOVED
        assert diffs[0].old_value == "Existing Title"
        assert diffs[0].new_value is None

    def test_modified_when_both_differ(self):
        proto = _mock_protocol(title="Old Title")
        diffs = compute_amendment_diff(proto, {"title": "New Title"})
        assert len(diffs) == 1
        assert diffs[0].change_type == CHANGE_MODIFIED

    def test_unchanged_field_not_in_diff(self):
        proto = _mock_protocol(title="Same Title")
        diffs = compute_amendment_diff(proto, {"title": "Same Title"})
        assert diffs == []

    def test_both_unset_skipped(self):
        proto = _mock_protocol(title=None)
        diffs = compute_amendment_diff(proto, {"title": ""})
        assert diffs == []

    def test_field_not_in_payload_skipped(self):
        proto = _mock_protocol(title="Title")
        # Payload mentions summary but not title — title change must be skipped
        diffs = compute_amendment_diff(proto, {"summary": "New summary"})
        titles = [d for d in diffs if d.field == "title"]
        assert titles == []

    def test_summary_maps_to_description(self):
        """summary in payload compares against protocol.description."""
        proto = _mock_protocol(description="Old description")
        diffs = compute_amendment_diff(proto, {"summary": "New description"})
        assert len(diffs) == 1
        assert diffs[0].field == "summary"
        assert diffs[0].old_value == "Old description"

    def test_none_payload_returns_empty(self):
        proto = _mock_protocol()
        diffs = compute_amendment_diff(proto, None)
        assert diffs == []

    def test_none_protocol_all_added(self):
        diffs = compute_amendment_diff(None, {"title": "New"})
        assert len(diffs) == 1
        assert diffs[0].change_type == CHANGE_ADDED

    def test_long_value_truncated_in_diff(self):
        proto = _mock_protocol(title="Short")
        long_title = "T" * 2000
        diffs = compute_amendment_diff(proto, {"title": long_title})
        assert diffs[0].new_value.endswith("…[truncated]")

    def test_diff_ordering_matches_tracked_fields(self):
        proto = MagicMock()
        proto.title = None
        proto.description = None
        for f in TRACKED_FIELDS:
            if f not in ("title", "summary"):
                setattr(proto, f, None)
        payload = {f: f"new_{f}" for f in TRACKED_FIELDS}
        diffs = compute_amendment_diff(proto, payload)
        returned_fields = [d.field for d in diffs]
        expected = [f for f in TRACKED_FIELDS if f in payload]
        assert returned_fields == expected

    def test_field_diff_to_dict(self):
        d = FieldDiff(field="title", old_value="old", new_value="new", change_type=CHANGE_MODIFIED)
        as_dict = d.to_dict()
        assert as_dict["field"] == "title"
        assert as_dict["change_type"] == CHANGE_MODIFIED
        assert as_dict["old_value"] == "old"
        assert as_dict["new_value"] == "new"
