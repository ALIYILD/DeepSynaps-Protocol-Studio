"""Tests for ``deepsynaps_mri.niivue_payload``.

Pins the NiiVue viewer payload contract: clinicians need a stable JSON
shape on the frontend, and the modality colour map is referenced by
the React overlay code.
"""
from __future__ import annotations

import pytest

from deepsynaps_mri.niivue_payload import (
    MODALITY_RGBA,
    NiivueMesh,
    NiivuePayload,
    NiivueVolume,
    StimTarget,
    build_payload,
)


class TestModalityRgba:
    def test_all_six_modalities_have_rgba_entries(self) -> None:
        # The frontend renders one pin colour per modality. Missing
        # an entry would make targets invisible.
        assert set(MODALITY_RGBA.keys()) == {
            "rtms",
            "tdcs",
            "tacs",
            "tps",
            "tfus",
            "personalised",
        }

    @pytest.mark.parametrize("modality", list(MODALITY_RGBA.keys()))
    def test_each_rgba_is_4_floats_in_unit_range(self, modality: str) -> None:
        rgba = MODALITY_RGBA[modality]
        assert len(rgba) == 4
        for component in rgba:
            assert isinstance(component, float)
            assert 0.0 <= component <= 1.0


class TestBuildPayload:
    def test_minimal_call_returns_payload_with_only_base_volume(self) -> None:
        payload = build_payload(case_id="C1", api_prefix="/mri")
        assert isinstance(payload, NiivuePayload)
        assert payload.case_id == "C1"
        assert payload.base_volume.url == "/mri/C1/t1_mni.nii.gz"
        assert payload.overlays == []
        assert payload.meshes == []
        assert payload.points == []
        assert payload.initial_view == "multiplanar"

    def test_base_volume_t1_alternative(self) -> None:
        # Patient-space T1 (not MNI) is selectable.
        payload = build_payload(case_id="C1", api_prefix="/mri", base_volume="t1")
        assert payload.base_volume.url == "/mri/C1/t1.nii.gz"

    def test_overlays_become_volumes_with_url_colormap_opacity(self) -> None:
        payload = build_payload(
            case_id="C1",
            api_prefix="/mri",
            overlays=[("lesion.nii.gz", "red", 0.5), ("wmh.nii.gz", "yellow", 0.3)],
        )
        assert len(payload.overlays) == 2
        a, b = payload.overlays
        assert a.url == "/mri/C1/lesion.nii.gz"
        assert a.colormap == "red"
        assert a.opacity == 0.5
        assert b.url == "/mri/C1/wmh.nii.gz"
        assert b.colormap == "yellow"
        assert b.opacity == 0.3

    def test_first_stat_overlay_gets_clinical_threshold_window(self) -> None:
        # Clinically-meaningful default window for stat maps.
        payload = build_payload(
            case_id="C1",
            api_prefix="/mri",
            overlays=[("zstat1.nii.gz", "hot", 0.6)],
        )
        first = payload.overlays[0]
        assert first.cal_min == 2.3
        assert first.cal_max == 6.0

    def test_non_first_stat_overlay_does_not_get_threshold(self) -> None:
        # Only the first overlay gets the clinical threshold preset.
        payload = build_payload(
            case_id="C1",
            api_prefix="/mri",
            overlays=[
                ("anatomy.nii.gz", "gray", 1.0),
                ("zstat2.nii.gz", "hot", 0.5),
            ],
        )
        # The second one (a stat) must NOT be auto-windowed.
        second = payload.overlays[1]
        assert second.cal_min is None
        assert second.cal_max is None

    def test_non_stat_overlay_leaves_thresholds_none(self) -> None:
        payload = build_payload(
            case_id="C1",
            api_prefix="/mri",
            overlays=[("lesion.nii.gz", "red", 0.5)],
        )
        first = payload.overlays[0]
        assert first.cal_min is None
        assert first.cal_max is None

    def test_bundles_become_meshes_with_trx_urls(self) -> None:
        payload = build_payload(
            case_id="C1",
            api_prefix="/mri",
            bundles=("AF_left", "CST_right"),
        )
        urls = [m.url for m in payload.meshes]
        assert urls == [
            "/mri/C1/bundles/AF_left.trx",
            "/mri/C1/bundles/CST_right.trx",
        ]

    def test_targets_become_points_with_modality_rgba(self) -> None:
        target = StimTarget(
            name="L-DLPFC",
            mni=(-40.0, 44.0, 30.0),
            modality="rtms",
            radius_mm=5.0,
        )
        payload = build_payload(
            case_id="C1",
            api_prefix="/mri",
            targets=(target,),
        )
        assert len(payload.points) == 1
        pt = payload.points[0]
        assert pt["x"] == -40.0
        assert pt["y"] == 44.0
        assert pt["z"] == 30.0
        assert pt["label"] == "L-DLPFC"
        assert pt["modality"] == "rtms"
        assert pt["radius_mm"] == 5.0
        assert pt["rgba"] == list(MODALITY_RGBA["rtms"])

    def test_target_with_unknown_modality_falls_back_to_white(self) -> None:
        # Defensive: targeting code may emit an unrecognised modality
        # during a registry update — we render white rather than crash.
        target = StimTarget.__new__(StimTarget)
        # Bypass dataclass type-checking — Literal lets static checkers stop us
        # but at runtime any string is accepted.
        target.name = "X"
        target.mni = (0.0, 0.0, 0.0)
        target.modality = "unknown_mod"
        target.radius_mm = 4.0
        payload = build_payload(case_id="C1", api_prefix="/mri", targets=(target,))
        assert payload.points[0]["rgba"] == [1.0, 1.0, 1.0, 1.0]


class TestNiivuePayloadToDict:
    def test_to_dict_returns_serialisable_shape(self) -> None:
        payload = build_payload(
            case_id="C1",
            api_prefix="/mri",
            overlays=[("a.nii.gz", "red", 0.5)],
            bundles=("AF_left",),
            targets=(StimTarget(name="L-DLPFC", mni=(-40.0, 44.0, 30.0), modality="rtms"),),
        )
        d = payload.to_dict()
        assert d["case_id"] == "C1"
        assert "url" in d["base_volume"]
        assert isinstance(d["overlays"], list) and "url" in d["overlays"][0]
        assert isinstance(d["meshes"], list) and "url" in d["meshes"][0]
        assert isinstance(d["points"], list) and d["points"][0]["label"] == "L-DLPFC"
        assert d["initial_view"] == "multiplanar"

    def test_default_mesh_rgba_is_pale_blue_translucent(self) -> None:
        # Tractography bundles render in a pale blue by default
        # (not white — would be confused with background in light mode).
        mesh = NiivueMesh(url="/x.trx")
        assert mesh.rgba255 == (120, 200, 255, 200)

    def test_default_volume_settings(self) -> None:
        v = NiivueVolume(url="/x.nii.gz")
        assert v.colormap == "gray"
        assert v.opacity == 1.0
        assert v.cal_min is None
        assert v.cal_max is None
