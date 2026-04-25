"""Tests for the license lock-file gate."""

from __future__ import annotations

from pathlib import Path

import yaml

from qeeg_encoder.licensing.lockcheck import check_lockfile


def _write(path: Path, data: dict) -> None:
    path.write_text(yaml.safe_dump(data))


def test_valid_lockfile(tmp_path: Path):
    f = tmp_path / "models.lock.yaml"
    _write(
        f,
        {
            "models": [
                {"id": "labram-base", "license": "Apache-2.0"},
                {"id": "eegpt-small", "license": "MIT"},
            ],
            "banned": [{"id": "tribe-v2", "reason": "CC BY-NC"}],
        },
    )
    assert check_lockfile(f) == []


def test_non_permissive_license_fails(tmp_path: Path):
    f = tmp_path / "models.lock.yaml"
    _write(f, {"models": [{"id": "x", "license": "GPL-3.0"}]})
    violations = check_lockfile(f)
    assert any("non-permissive" in v for v in violations)
    assert any("GPL-3" in v for v in violations)


def test_cc_bync_fails(tmp_path: Path):
    f = tmp_path / "models.lock.yaml"
    _write(f, {"models": [{"id": "tribe-v2", "license": "CC-BY-NC-4.0"}]})
    violations = check_lockfile(f)
    assert any("banned model present" in v for v in violations)


def test_missing_lockfile(tmp_path: Path):
    violations = check_lockfile(tmp_path / "nope.yaml")
    assert violations and "missing" in violations[0]


def test_real_lockfile_passes():
    """The shipped configs/models.lock.yaml must pass."""
    repo_lock = Path(__file__).resolve().parents[1] / "configs" / "models.lock.yaml"
    assert repo_lock.exists()
    assert check_lockfile(repo_lock) == []

