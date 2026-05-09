"""Tests for deepsynaps_condition_registry.

Locks the contract for loading per-condition profile JSON from
data/conditions/<slug>.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from deepsynaps_condition_registry import get_condition_profile
from deepsynaps_condition_registry.registry import DATA_DIR
from deepsynaps_core_schema import ConditionProfile


REPO_ROOT = Path(__file__).resolve().parents[3]


# ───────────────────────────── data-dir wiring ──────────────────────────────


class TestDataDir:
    def test_data_dir_resolves_to_repo_root_data(self) -> None:
        # The registry derives DATA_DIR by climbing 4 parents up from the
        # registry.py file to reach <repo>/data/conditions. Pin that contract.
        expected = REPO_ROOT / "data" / "conditions"
        assert DATA_DIR.resolve() == expected.resolve()

    def test_data_dir_exists(self) -> None:
        assert DATA_DIR.exists(), f"missing: {DATA_DIR}"

    def test_data_dir_has_json_files(self) -> None:
        slugs = sorted(p.stem for p in DATA_DIR.glob("*.json"))
        assert slugs, "no condition profiles in data/conditions"


# ───────────────────────────── happy-path loading ───────────────────────────


def _all_slugs() -> list[str]:
    return sorted(p.stem for p in DATA_DIR.glob("*.json"))


class TestGetConditionProfile:
    def test_returns_condition_profile(self) -> None:
        profile = get_condition_profile("adhd")
        assert isinstance(profile, ConditionProfile)

    def test_known_slug_has_name(self) -> None:
        profile = get_condition_profile("adhd")
        assert profile.slug == "adhd"
        assert "ADHD" in profile.name or "Attention" in profile.name

    def test_unknown_slug_raises_filenotfound(self) -> None:
        with pytest.raises(FileNotFoundError):
            get_condition_profile("not-a-real-condition")

    def test_contraindications_field_is_list_of_str(self) -> None:
        profile = get_condition_profile("adhd")
        assert isinstance(profile.contraindications, list)
        for item in profile.contraindications:
            assert isinstance(item, str)

    def test_phenotypes_field_is_list_of_str(self) -> None:
        profile = get_condition_profile("adhd")
        assert isinstance(profile.phenotypes, list)
        for item in profile.phenotypes:
            assert isinstance(item, str)


# ───────────────────────────── data-integrity sweep ─────────────────────────


class TestDataIntegrity:
    @pytest.mark.parametrize("slug", _all_slugs())
    def test_every_condition_loads_cleanly(self, slug: str) -> None:
        # If a condition JSON is malformed or its slug field doesn't match the
        # filename, pin that as a regression — the API expects file/slug parity.
        profile = get_condition_profile(slug)
        assert profile.slug == slug, f"file '{slug}.json' has mismatched slug={profile.slug!r}"

    @pytest.mark.parametrize("slug", _all_slugs())
    def test_every_condition_has_required_top_level_fields(self, slug: str) -> None:
        record_path = DATA_DIR / f"{slug}.json"
        payload = json.loads(record_path.read_text(encoding="utf-8"))
        for field in ("slug", "name"):
            assert field in payload, f"{slug}.json missing {field}"

    @pytest.mark.parametrize("slug", _all_slugs())
    def test_every_condition_name_is_non_empty(self, slug: str) -> None:
        profile = get_condition_profile(slug)
        assert profile.name and profile.name.strip()
