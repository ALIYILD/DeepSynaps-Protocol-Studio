"""Pin the public pure-function contracts of app/services/agent_skills_seed.py.

The DB-dependent seed_default_agent_skills() is excluded (requires Session).
default_agent_skill_rows() and _payload_for() are pure and fully covered here.
"""
from __future__ import annotations

import json

import pytest

from app.services.agent_skills_seed import (
    DEFAULT_AGENT_SKILLS,
    _payload_for,
    default_agent_skill_rows,
)

# ── DEFAULT_AGENT_SKILLS constant ─────────────────────────────────────────────

class TestDefaultAgentSkillsConstant:
    def test_minimum_skill_count(self):
        # Must have at least 20 skills as of 2026-05 definition
        assert len(DEFAULT_AGENT_SKILLS) >= 20

    def test_all_entries_have_required_keys(self):
        required = {"id", "cat", "icon", "label", "desc", "prompt"}
        for skill in DEFAULT_AGENT_SKILLS:
            for key in required:
                assert key in skill, f"Key {key!r} missing from skill {skill.get('id', '?')!r}"

    def test_all_ids_unique(self):
        ids = [s["id"] for s in DEFAULT_AGENT_SKILLS]
        assert len(ids) == len(set(ids)), "Duplicate skill IDs found"

    def test_known_categories(self):
        expected_cats = {"launch", "comms", "clinical", "admin", "reports"}
        actual_cats = {s["cat"] for s in DEFAULT_AGENT_SKILLS}
        for cat in expected_cats:
            assert cat in actual_cats, f"Category {cat!r} missing"

    def test_launch_lead_skill_present(self):
        ids = {s["id"] for s in DEFAULT_AGENT_SKILLS}
        assert "launch-lead" in ids

    def test_qeeg_interpret_skill_present(self):
        ids = {s["id"] for s in DEFAULT_AGENT_SKILLS}
        assert "qeeg-interpret" in ids

    def test_prompts_are_non_empty(self):
        for skill in DEFAULT_AGENT_SKILLS:
            assert isinstance(skill["prompt"], str) and skill["prompt"].strip(), \
                f"Skill {skill['id']!r} has empty prompt"

    def test_labels_are_non_empty(self):
        for skill in DEFAULT_AGENT_SKILLS:
            assert isinstance(skill["label"], str) and skill["label"].strip(), \
                f"Skill {skill['id']!r} has empty label"


# ── _payload_for ──────────────────────────────────────────────────────────────

class TestPayloadFor:
    def test_returns_valid_json(self):
        skill = DEFAULT_AGENT_SKILLS[0]
        payload = _payload_for(skill)
        parsed = json.loads(payload)
        assert isinstance(parsed, dict)

    def test_payload_contains_prompt_key(self):
        skill = DEFAULT_AGENT_SKILLS[0]
        payload = _payload_for(skill)
        parsed = json.loads(payload)
        assert "prompt" in parsed

    def test_prompt_value_matches_source(self):
        skill = DEFAULT_AGENT_SKILLS[0]
        payload = _payload_for(skill)
        parsed = json.loads(payload)
        assert parsed["prompt"] == skill["prompt"]

    def test_no_extra_keys_beyond_prompt(self):
        # The payload spec is intentionally minimal
        skill = DEFAULT_AGENT_SKILLS[0]
        parsed = json.loads(_payload_for(skill))
        assert set(parsed.keys()) == {"prompt"}


# ── default_agent_skill_rows ──────────────────────────────────────────────────

class TestDefaultAgentSkillRows:
    def setup_method(self):
        self.rows = default_agent_skill_rows()

    def test_returns_same_count_as_constant(self):
        assert len(self.rows) == len(DEFAULT_AGENT_SKILLS)

    def test_row_has_required_db_fields(self):
        required = {
            "id", "category_id", "label", "description",
            "icon", "run_payload_json", "enabled", "sort_order",
            "created_at", "updated_at",
        }
        for row in self.rows:
            for key in required:
                assert key in row, f"Key {key!r} missing from row for {row.get('label', '?')!r}"

    def test_all_rows_enabled(self):
        for row in self.rows:
            assert row["enabled"] is True

    def test_sort_order_monotonic(self):
        orders = [row["sort_order"] for row in self.rows]
        assert orders == list(range(len(self.rows)))

    def test_ids_are_valid_uuids(self):
        import uuid as _uuid
        for row in self.rows:
            try:
                _uuid.UUID(row["id"])
            except ValueError:
                pytest.fail(f"Row id {row['id']!r} is not a valid UUID")

    def test_run_payload_json_is_valid_json_with_prompt(self):
        for row in self.rows:
            parsed = json.loads(row["run_payload_json"])
            assert "prompt" in parsed

    def test_category_id_matches_constant(self):
        for idx, row in enumerate(self.rows):
            assert row["category_id"] == DEFAULT_AGENT_SKILLS[idx]["cat"]

    def test_label_matches_constant(self):
        for idx, row in enumerate(self.rows):
            assert row["label"] == DEFAULT_AGENT_SKILLS[idx]["label"]

    def test_idempotent_uuids_differ_across_calls(self):
        # Each call generates fresh UUIDs (idempotency is handled at the DB level,
        # not by reusing the same UUID).
        rows2 = default_agent_skill_rows()
        ids1 = {r["id"] for r in self.rows}
        ids2 = {r["id"] for r in rows2}
        assert ids1.isdisjoint(ids2), "Same UUIDs returned on second call — UUIDs should be freshly generated"
