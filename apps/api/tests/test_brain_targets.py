"""Tests for the Brain Map Planner target registry.

The registry is the source of truth for clinical-target → 10-20 anchor
mappings used by the planner UI. Mappings must be deterministic (no AI),
cover the canonical clinical targets the UI surfaces, and stay aligned
with the JS `BMP_REGION_SITES` table in `apps/web/src/pages-clinical-tools.js`.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.services.brain_targets import (
    get_brain_target,
    list_brain_targets,
    resolve_target_anchor,
)


# ── Service-level invariants ───────────────────────────────────────────────

def test_registry_lists_all_canonical_targets() -> None:
    """The registry must include the targets the planner UI surfaces."""
    payload = list_brain_targets()
    items = {entry["id"] for entry in payload["items"]}
    # The UI's `BMP_REGION_SITES` keys — these MUST resolve.
    expected = {
        "DLPFC-L", "DLPFC-R", "DLPFC-B",
        "M1-L", "M1-R", "M1-B",
        "SMA", "mPFC", "DMPFC", "VMPFC", "OFC", "ACC",
        "IFG-L", "IFG-R", "PPC-L", "PPC-R",
        "TEMPORAL-L", "TEMPORAL-R",
        "S1", "V1", "CEREBELLUM",
        "Cz", "Pz", "Fz",
    }
    missing = expected - items
    assert not missing, f"Brain target registry missing canonical targets: {sorted(missing)}"
    assert payload["total"] == len(payload["items"])


def test_resolver_is_deterministic_for_dlpfc() -> None:
    """L-DLPFC → F3, R-DLPFC → F4. Bedrock 10-20 anchor mapping."""
    assert resolve_target_anchor("DLPFC-L") == "F3"
    assert resolve_target_anchor("DLPFC-R") == "F4"


def test_resolver_returns_none_for_unknown_target() -> None:
    """Never fabricate. Unknown id → None so callers can show honest UI."""
    assert resolve_target_anchor("NONEXISTENT") is None
    assert resolve_target_anchor("") is None


def test_each_target_has_anchor_and_evidence_grade() -> None:
    """Every entry must carry a primary_anchor + evidence_grade. Targets
    without a deterministic anchor electrode are not allowed in the
    registry — see docstring in brain_targets.py.
    """
    for entry in list_brain_targets()["items"]:
        assert entry.get("primary_anchor"), f"Target {entry['id']} missing primary_anchor"
        assert entry.get("evidence_grade") in {"A", "B", "C", "D"}, (
            f"Target {entry['id']} has invalid evidence_grade: {entry.get('evidence_grade')}"
        )
        # MNI must be a 3-vector of finite numbers
        mni = entry.get("mni")
        assert isinstance(mni, list) and len(mni) == 3, f"Target {entry['id']} has bad MNI: {mni}"
        for coord in mni:
            assert isinstance(coord, (int, float)), (
                f"Target {entry['id']} MNI coord not numeric: {coord}"
            )


def test_get_brain_target_round_trips() -> None:
    entry = get_brain_target("DLPFC-L")
    assert entry is not None
    assert entry["id"] == "DLPFC-L"
    assert entry["primary_anchor"] == "F3"
    assert entry["brodmann_area"] == "BA9/46"
    assert "MDD" in entry["indications"]


# ── HTTP integration ───────────────────────────────────────────────────────

def test_brain_targets_endpoint_returns_registry(client: TestClient) -> None:
    res = client.get("/api/v1/brain-targets")
    assert res.status_code == 200
    body = res.json()
    assert "items" in body and "total" in body
    assert body["total"] > 0
    ids = {entry["id"] for entry in body["items"]}
    assert "DLPFC-L" in ids and "M1-L" in ids


def test_brain_target_detail_endpoint_resolves_known_target(client: TestClient) -> None:
    res = client.get("/api/v1/brain-targets/DLPFC-L")
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == "DLPFC-L"
    assert body["primary_anchor"] == "F3"
    assert body["evidence_grade"] == "A"


def test_brain_target_detail_endpoint_returns_404_for_unknown(client: TestClient) -> None:
    res = client.get("/api/v1/brain-targets/NOPE")
    assert res.status_code == 404


# ── Cross-surface alignment ────────────────────────────────────────────────

def test_registry_anchors_align_with_planner_js_table() -> None:
    """The Python registry MUST agree with the JS `BMP_REGION_SITES` table
    on the primary anchor electrode for each shared target id. If this
    test breaks, one of the two tables drifted — fix BOTH (the JS file is
    `apps/web/src/pages-clinical-tools.js`, search for `BMP_REGION_SITES`).
    """
    expected = {
        "DLPFC-L":    "F3",
        "DLPFC-R":    "F4",
        "M1-L":       "C3",
        "M1-R":       "C4",
        "SMA":        "FCz",
        "mPFC":       "Fz",
        "DMPFC":      "Fz",
        "IFG-L":      "F7",
        "IFG-R":      "F8",
        "PPC-L":      "P3",
        "PPC-R":      "P4",
        "TEMPORAL-L": "T7",
        "TEMPORAL-R": "T8",
        "V1":         "Oz",
        "Cz":         "Cz",
        "Pz":         "Pz",
        "Fz":         "Fz",
    }
    for region_id, anchor in expected.items():
        assert resolve_target_anchor(region_id) == anchor, (
            f"Anchor drift: {region_id} resolves to {resolve_target_anchor(region_id)!r} "
            f"in Python but JS expects {anchor!r}"
        )
