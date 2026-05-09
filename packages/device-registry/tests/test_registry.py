"""Tests for deepsynaps_device_registry."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from deepsynaps_core_schema import DeviceProfile
from deepsynaps_device_registry import get_device_profile
from deepsynaps_device_registry.registry import DATA_DIR


REPO_ROOT = Path(__file__).resolve().parents[3]


def _all_slugs() -> list[str]:
    return sorted(p.stem for p in DATA_DIR.glob("*.json"))


class TestDataDir:
    def test_data_dir_resolves_to_repo_data_devices(self) -> None:
        expected = REPO_ROOT / "data" / "devices"
        assert DATA_DIR.resolve() == expected.resolve()

    def test_data_dir_exists(self) -> None:
        assert DATA_DIR.exists(), f"missing: {DATA_DIR}"

    def test_data_dir_has_json_files(self) -> None:
        assert _all_slugs(), "no device profiles in data/devices"


class TestGetDeviceProfile:
    def test_known_slug_returns_device_profile(self) -> None:
        slugs = _all_slugs()
        if not slugs:
            pytest.skip("no device slugs available")
        profile = get_device_profile(slugs[0])
        assert isinstance(profile, DeviceProfile)

    def test_unknown_slug_raises_filenotfound(self) -> None:
        with pytest.raises(FileNotFoundError):
            get_device_profile("not-a-real-device")


class TestDataIntegrity:
    @pytest.mark.parametrize("slug", _all_slugs())
    def test_every_device_loads_cleanly(self, slug: str) -> None:
        profile = get_device_profile(slug)
        assert profile.slug == slug, f"{slug}.json slug field mismatch: {profile.slug!r}"

    @pytest.mark.parametrize("slug", _all_slugs())
    def test_required_fields_populated(self, slug: str) -> None:
        record_path = DATA_DIR / f"{slug}.json"
        payload = json.loads(record_path.read_text(encoding="utf-8"))
        for field in ("slug", "name", "manufacturer"):
            assert field in payload, f"{slug}.json missing {field}"

    @pytest.mark.parametrize("slug", _all_slugs())
    def test_supported_modality_slugs_is_list(self, slug: str) -> None:
        profile = get_device_profile(slug)
        assert isinstance(profile.supported_modality_slugs, list)
