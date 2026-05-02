"""Tests for pipeline stage manifests."""
from __future__ import annotations

import json
from pathlib import Path

from deepsynaps_mri.pipeline_manifests import write_stage_manifest
from deepsynaps_mri.registration import Transform, write_registration_manifest


def test_write_stage_manifest(tmp_path: Path) -> None:
    p = write_stage_manifest(tmp_path, "ingest", {"n": 1})
    assert p.name == "ingest_manifest.json"
    assert p.parent.name == "manifests"
    data = json.loads(p.read_text(encoding="utf-8"))
    assert data["stage"] == "ingest"
    assert data["n"] == 1
    assert "written_at" in data


def test_write_registration_manifest(tmp_path: Path) -> None:
    xfm = Transform(
        fwd_transforms=[str(tmp_path / "a.mat")],
        inv_transforms=[str(tmp_path / "b.mat")],
        warped_moving=object(),
    )
    p = write_registration_manifest(
        tmp_path,
        moving_t1_path=tmp_path / "t1.nii.gz",
        warped_mni_path=tmp_path / "mni.nii.gz",
        xfm=xfm,
    )
    data = json.loads(p.read_text(encoding="utf-8"))
    assert data["stage"] == "register"
    assert data["tool"] == "antspyx"
    assert len(data["fwd_transforms"]) == 1
