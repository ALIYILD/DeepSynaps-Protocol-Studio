"""Tests for the neuroimaging inventory (Category 4, PR-1).

Validates:

- All 18 catalogued sources are present with required keys.
- Restricted-access sources are correctly gated (``enabled=False`` +
  ``requires_credentials=True`` for ``requires_application`` entries).
- Every ``lifecycle_state`` value resolves to a real ``LifecycleState``
  enum member.
- NeuroSynth is wired to the canonical adapter.
- ``clinical_utility`` strings contain only approved phrases and no
  prescriptive language.
"""
from __future__ import annotations

import re

import pytest

from app.services.knowledge.lifecycle import LifecycleState
from app.services.knowledge.neuroimaging_inventory import (
    DECISION_SUPPORT_DISCLAIMER,
    NEUROIMAGING_SOURCES,
    get_neuroimaging_source,
    list_enabled_sources,
    list_lifecycle_summary,
    list_neuroimaging_sources,
)

REQUIRED_KEYS = {
    "id",
    "name",
    "category",
    "access_type",
    "source_url",
    "requires_credentials",
    "lifecycle_state",
    "enabled",
    "clinical_utility",
    "provenance",
    "access_notes",
    "modality_tags",
    "population_tags",
    "atlas_compatibility",
    "import_path",
    "metadata",
}

EXPECTED_IDS = {
    "neurovault",
    "openneuro",
    "brainmap",
    "neurosynth",
    "alba_ba",
    "adhd200",
    "nsg",
    "oasis",
    "abcd",
    "hcp",
    "uk_biobank",
    "ebrains",
    "neuromaps",
    "allen_brain",
    "brain_atlas_cebm",
    "cneuromod",
    "openfmri",
    "fcp_indi",
}

FORBIDDEN_PHRASES = (
    "optimal coordinate",
    "recommended site",
    "validated for this patient",
    "safe target",
    "exact target",
)


# ─── Catalog shape ───────────────────────────────────────────────────────


def test_eighteen_sources_present():
    assert len(NEUROIMAGING_SOURCES) == 18
    ids = {src["id"] for src in NEUROIMAGING_SOURCES}
    assert ids == EXPECTED_IDS


def test_all_sources_have_required_keys():
    for src in NEUROIMAGING_SOURCES:
        missing = REQUIRED_KEYS - set(src.keys())
        assert not missing, f"source {src.get('id')} missing keys: {missing}"


def test_all_sources_category_neuroimaging():
    for src in NEUROIMAGING_SOURCES:
        assert src["category"] == "neuroimaging"


def test_list_neuroimaging_sources_returns_copies():
    """Mutating the returned list must not affect the canonical catalog."""
    a = list_neuroimaging_sources()
    a[0]["name"] = "MUTATED"
    b = list_neuroimaging_sources()
    assert b[0]["name"] != "MUTATED"


def test_get_neuroimaging_source_known_and_unknown():
    src = get_neuroimaging_source("neurosynth")
    assert src is not None and src["id"] == "neurosynth"
    assert get_neuroimaging_source("does-not-exist") is None


# ─── Lifecycle gating ────────────────────────────────────────────────────


def test_lifecycle_values_are_valid_enum_members():
    valid_values = {member.value for member in LifecycleState}
    for src in NEUROIMAGING_SOURCES:
        assert src["lifecycle_state"] in valid_values, (
            f"unknown lifecycle for {src['id']}: {src['lifecycle_state']}"
        )


def test_requires_application_sources_are_gated():
    """Every ``requires_application`` entry must be disabled + credentialed."""
    for src in NEUROIMAGING_SOURCES:
        if src["lifecycle_state"] == LifecycleState.REQUIRES_APPLICATION.value:
            assert src["enabled"] is False, (
                f"{src['id']} is requires_application but enabled=True"
            )
            assert src["requires_credentials"] is True, (
                f"{src['id']} is requires_application but requires_credentials=False"
            )


def test_deprecated_sources_are_disabled():
    for src in NEUROIMAGING_SOURCES:
        if src["lifecycle_state"] == LifecycleState.DEPRECATED.value:
            assert src["enabled"] is False


def test_software_resource_sources_are_disabled():
    for src in NEUROIMAGING_SOURCES:
        if src["lifecycle_state"] == LifecycleState.SOFTWARE_RESOURCE.value:
            assert src["enabled"] is False


def test_catalogued_sources_are_disabled():
    """``catalogued`` entries are documentation-only; not auto-federated."""
    for src in NEUROIMAGING_SOURCES:
        if src["lifecycle_state"] == LifecycleState.CATALOGUED.value:
            assert src["enabled"] is False, (
                f"{src['id']} is catalogued but enabled=True"
            )


def test_healthy_sources_have_import_path():
    for src in NEUROIMAGING_SOURCES:
        if src["lifecycle_state"] == LifecycleState.HEALTHY.value:
            assert src["enabled"] is True
            assert src["import_path"], (
                f"{src['id']} is healthy but has no import_path"
            )


# ─── Specific source bindings ────────────────────────────────────────────


def test_neurosynth_points_to_canonical_adapter():
    src = get_neuroimaging_source("neurosynth")
    assert src is not None
    assert (
        src["import_path"]
        == "app.services.knowledge.adapters.neurosynth_adapter"
    )
    assert src["metadata"].get("also_distributed_as_python_package") is True
    assert src["metadata"].get("canonical_adapter") is True


def test_allen_brain_points_to_canonical_adapter():
    src = get_neuroimaging_source("allen_brain")
    assert src is not None
    assert (
        src["import_path"]
        == "app.services.knowledge.adapters.allen_brain_adapter"
    )


def test_brainmap_requires_application():
    src = get_neuroimaging_source("brainmap")
    assert src is not None
    assert src["lifecycle_state"] == LifecycleState.REQUIRES_APPLICATION.value
    assert src["enabled"] is False
    assert src["import_path"] is None


def test_openfmri_deprecated():
    src = get_neuroimaging_source("openfmri")
    assert src is not None
    assert src["lifecycle_state"] == LifecycleState.DEPRECATED.value
    assert src["metadata"].get("deprecated_in_favor_of") == "openneuro"


def test_neuromaps_software_resource():
    src = get_neuroimaging_source("neuromaps")
    assert src is not None
    assert src["lifecycle_state"] == LifecycleState.SOFTWARE_RESOURCE.value


def test_legacy_shims_point_to_legacy_tree():
    """Legacy-shim sources must point at ``app.knowledge.*``."""
    legacy_ids = {
        "neurovault",
        "openneuro",
        "adhd200",
        "oasis",
        "hcp",
        "fcp_indi",
    }
    for src_id in legacy_ids:
        src = get_neuroimaging_source(src_id)
        assert src is not None
        assert src["import_path"] is not None
        assert src["import_path"].startswith("app.knowledge."), (
            f"{src_id} should use legacy shim, got {src['import_path']}"
        )


# ─── Lifecycle summary ───────────────────────────────────────────────────


def test_lifecycle_summary_shape():
    summary = list_lifecycle_summary()
    assert summary["total"] == 18
    assert isinstance(summary["by_state"], dict)
    assert isinstance(summary["sources"], dict)
    assert set(summary["sources"].keys()) == EXPECTED_IDS


def test_lifecycle_summary_counts_match_catalog():
    summary = list_lifecycle_summary()
    expected: dict[str, int] = {}
    for src in NEUROIMAGING_SOURCES:
        expected[src["lifecycle_state"]] = expected.get(src["lifecycle_state"], 0) + 1
    for state, count in expected.items():
        assert summary["by_state"].get(state) == count


# ─── Enabled / federation filter ─────────────────────────────────────────


def test_list_enabled_sources_only_healthy_with_import_path():
    enabled = list_enabled_sources()
    enabled_ids = {src["id"] for src in enabled}
    # NeuroSynth, NeuroVault, OpenNeuro, Allen Brain, FCP-INDI = 5 healthy + enabled
    assert enabled_ids == {
        "neurovault",
        "openneuro",
        "neurosynth",
        "allen_brain",
        "fcp_indi",
    }
    for src in enabled:
        assert src["enabled"] is True
        assert src["import_path"] is not None


# ─── Disclaimer + non-prescriptive language ──────────────────────────────


def test_decision_support_disclaimer_is_stable_and_non_empty():
    assert DECISION_SUPPORT_DISCLAIMER
    assert "decision support only" in DECISION_SUPPORT_DISCLAIMER
    assert "clinician must verify" in DECISION_SUPPORT_DISCLAIMER


def test_no_prescriptive_language_in_clinical_utility():
    """``clinical_utility`` must NOT contain prescriptive phrases."""
    for src in NEUROIMAGING_SOURCES:
        utility = src["clinical_utility"].lower()
        for phrase in FORBIDDEN_PHRASES:
            assert phrase not in utility, (
                f"{src['id']} clinical_utility contains forbidden phrase "
                f"{phrase!r}: {src['clinical_utility']!r}"
            )


def test_clinical_utility_is_non_empty():
    for src in NEUROIMAGING_SOURCES:
        assert isinstance(src["clinical_utility"], str)
        assert src["clinical_utility"].strip(), f"{src['id']} has empty clinical_utility"


def test_no_prescriptive_language_in_provenance_or_access_notes():
    """Belt-and-braces: catch prescriptive language in other free-text fields too."""
    for src in NEUROIMAGING_SOURCES:
        for field in ("provenance", "access_notes"):
            text = src[field].lower()
            for phrase in FORBIDDEN_PHRASES:
                assert phrase not in text, (
                    f"{src['id']}.{field} contains forbidden phrase {phrase!r}"
                )


# ─── New LifecycleState members ──────────────────────────────────────────


def test_new_lifecycle_members_exist():
    assert LifecycleState.SOFTWARE_RESOURCE.value == "software_resource"
    assert LifecycleState.REQUIRES_APPLICATION.value == "requires_application"
    assert LifecycleState.DEPRECATED.value == "deprecated"
