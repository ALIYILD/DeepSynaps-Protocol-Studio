"""Tests for the pure helpers in ``deepsynaps_qeeg.viz.web_payload``.

The module wraps the FreeSurfer + MNE mesh-loading pipeline that powers
the 3D brain viewer. The mesh-loading paths require subjects_dir and
fsaverage data; we don't test those here. Instead we cover:

- _sanitize_scalars: NaN/Inf -> 0.0 (defensive — WebGL would render
  garbage frags otherwise)
- _within_subject_z: zero / near-zero std returns zeros (no /0); clip
  range [-4, 4] applied so colour-mapping is stable.
- _pack_positions / _pack_indices: numpy -> flat JSON-friendly lists.
- _decimate_faces: deterministic stride-based decimation to TARGET_FACES.
- _quantize_positions: round to N decimals; negative N is a no-op.
- _band_to_vertex_scalars: vertex-form ({lh, rh}) shape mismatch raises;
  unsupported types raise TypeError.
- _build_luts: emits viridis (power) + RdBu_r (z) entries with rgba256
  arrays of length 4 * LUT_SIZE.
- _fallback_lut: viridis + RdBu_r (default) gradient generators.
- _estimate_payload_bytes: small payload returns silently; oversize
  payload would raise ValueError (we exercise the small-OK path).
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pytest

from deepsynaps_qeeg.viz.web_payload import (
    DEFAULT_SUBJECT,
    DEFAULT_SURF,
    LUT_SIZE,
    TARGET_FACES,
    _Mesh,
    _band_to_vertex_scalars,
    _build_luts,
    _decimate_faces,
    _estimate_payload_bytes,
    _fallback_lut,
    _lut_rgba256,
    _pack_indices,
    _pack_positions,
    _quantize_positions,
    _sanitize_scalars,
    _within_subject_z,
)


# ── Constants ────────────────────────────────────────────────────────────


class TestConstants:
    def test_default_subject_is_fsaverage(self) -> None:
        assert DEFAULT_SUBJECT == "fsaverage"

    def test_default_surf_is_pial(self) -> None:
        assert DEFAULT_SURF == "pial"

    def test_target_faces_documented(self) -> None:
        # 30k faces is the documented payload-size bound.
        assert TARGET_FACES == 30_000

    def test_lut_size_documented(self) -> None:
        # 256 entries is the standard 8-bit colour table.
        assert LUT_SIZE == 256


# ── _sanitize_scalars ────────────────────────────────────────────────────


class TestSanitizeScalars:
    def test_finite_array_passes_through(self) -> None:
        arr = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        out = _sanitize_scalars(arr)
        assert np.array_equal(out, arr)

    def test_nan_replaced_with_zero(self) -> None:
        # Pin: NaN MUST be replaced with 0 — the WebGL pipeline renders
        # garbage shading otherwise.
        arr = np.array([1.0, np.nan, 3.0], dtype=np.float32)
        out = _sanitize_scalars(arr)
        assert out[1] == 0.0
        assert out[0] == 1.0

    def test_inf_replaced_with_zero(self) -> None:
        arr = np.array([np.inf, -np.inf, 1.0], dtype=np.float32)
        out = _sanitize_scalars(arr)
        assert out[0] == 0.0
        assert out[1] == 0.0
        assert out[2] == 1.0

    def test_input_reshaped_to_1d(self) -> None:
        arr = np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32)
        out = _sanitize_scalars(arr)
        assert out.shape == (4,)


# ── _within_subject_z ────────────────────────────────────────────────────


class TestWithinSubjectZ:
    def test_zero_std_returns_zeros(self) -> None:
        # Pin: a constant array yields std=0 -> return zeros to avoid
        # division-by-zero NaNs reaching the colour pipeline.
        arr = np.array([5.0, 5.0, 5.0, 5.0], dtype=np.float32)
        out = _within_subject_z(arr)
        assert np.allclose(out, 0.0)

    def test_normal_distribution_centered_at_zero(self) -> None:
        rng = np.random.default_rng(42)
        arr = rng.standard_normal(1000).astype(np.float32) * 2.0 + 5.0
        z = _within_subject_z(arr)
        # Z-scored mean is approximately 0 and clipped to [-4, 4].
        assert abs(float(z.mean())) < 0.1
        assert z.min() >= -4.0
        assert z.max() <= 4.0

    def test_clip_at_4_sigma(self) -> None:
        # An extreme outlier should be clipped to the [-4, 4] range.
        arr = np.array([0.0, 0.0, 0.0, 0.0, 1000.0], dtype=np.float32)
        z = _within_subject_z(arr)
        assert z.max() <= 4.0
        assert z.min() >= -4.0


# ── _pack_positions / _pack_indices ─────────────────────────────────────


class TestPackHelpers:
    def test_pack_positions_flattens_to_list_of_floats(self) -> None:
        pos = np.array([[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]], dtype=np.float32)
        out = _pack_positions(pos)
        assert out == [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
        assert all(isinstance(x, float) for x in out)

    def test_pack_indices_flattens_to_list_of_ints(self) -> None:
        idx = np.array([[0, 1, 2], [3, 4, 5]], dtype=np.int32)
        out = _pack_indices(idx)
        assert out == [0, 1, 2, 3, 4, 5]
        assert all(isinstance(x, int) for x in out)


# ── _decimate_faces ─────────────────────────────────────────────────────


class TestDecimateFaces:
    def test_no_decimation_when_under_target(self) -> None:
        faces = np.zeros((100, 3), dtype=np.int32)
        out = _decimate_faces(faces, target_faces=200)
        assert out.shape == (100, 3)

    def test_decimates_to_target_or_below(self) -> None:
        faces = np.arange(60_000, dtype=np.int32).reshape(20_000, 3)
        out = _decimate_faces(faces, target_faces=10_000)
        assert out.shape[0] <= 10_000

    def test_deterministic(self) -> None:
        # Same input + target → same output.
        faces = np.arange(30_000, dtype=np.int32).reshape(10_000, 3)
        a = _decimate_faces(faces, target_faces=5_000)
        b = _decimate_faces(faces, target_faces=5_000)
        assert np.array_equal(a, b)


# ── _quantize_positions ─────────────────────────────────────────────────


class TestQuantizePositions:
    def test_rounds_to_decimals(self) -> None:
        pos = np.array([[1.23456, 2.34567, 3.45678]], dtype=np.float32)
        out = _quantize_positions(pos, decimals=2)
        # Rounded to 2 decimal places.
        assert abs(float(out[0, 0]) - 1.23) < 1e-3
        assert abs(float(out[0, 1]) - 2.35) < 1e-3

    def test_negative_decimals_is_noop(self) -> None:
        pos = np.array([[1.234, 5.678]], dtype=np.float32)
        out = _quantize_positions(pos, decimals=-1)
        assert np.array_equal(out, pos)

    def test_default_decimals_is_3(self) -> None:
        pos = np.array([[1.23456789]], dtype=np.float32)
        out = _quantize_positions(pos)
        assert abs(float(out[0, 0]) - 1.235) < 1e-4


# ── _band_to_vertex_scalars ──────────────────────────────────────────────


class TestBandToVertexScalars:
    def _mesh(self, n_lh: int = 5, n_rh: int = 5) -> _Mesh:
        return _Mesh(
            positions=np.zeros((n_lh + n_rh, 3), dtype=np.float32),
            indices=np.zeros((1, 3), dtype=np.int32),
            n_lh=n_lh,
            n_rh=n_rh,
        )

    def test_vertex_form_concatenates_lh_rh(self) -> None:
        payload = {"lh": [1.0, 2.0, 3.0, 4.0, 5.0], "rh": [10.0, 20.0, 30.0, 40.0, 50.0]}
        out = _band_to_vertex_scalars(
            payload, mesh=self._mesh(), subjects_dir="x", subject="fsaverage"
        )
        assert out.shape == (10,)
        assert out[0] == 1.0
        assert out[5] == 10.0

    def test_vertex_form_length_mismatch_raises(self) -> None:
        # Pin: a length mismatch must raise (catch wiring bugs early).
        payload = {"lh": [1.0, 2.0], "rh": [3.0, 4.0, 5.0, 6.0, 7.0]}
        with pytest.raises(ValueError, match="Scalar length mismatch"):
            _band_to_vertex_scalars(
                payload, mesh=self._mesh(n_lh=5, n_rh=5),
                subjects_dir="x", subject="fsaverage",
            )

    def test_unsupported_payload_type_raises(self) -> None:
        with pytest.raises(TypeError, match="Unsupported"):
            _band_to_vertex_scalars(
                "not a dict", mesh=self._mesh(),
                subjects_dir="x", subject="fsaverage",
            )


# ── _build_luts + _lut_rgba256 + _fallback_lut ──────────────────────────


class TestLuts:
    def test_build_luts_envelope(self) -> None:
        luts = _build_luts()
        assert "power" in luts
        assert "z" in luts
        assert luts["power"]["name"] == "viridis"
        assert luts["z"]["name"] == "RdBu_r"
        # rgba256 is a flat list of 4 * LUT_SIZE = 1024 ints.
        assert len(luts["power"]["rgba256"]) == 4 * LUT_SIZE
        assert len(luts["z"]["rgba256"]) == 4 * LUT_SIZE
        # All values are uint8-range ints.
        for v in luts["power"]["rgba256"][:64]:
            assert isinstance(v, int)
            assert 0 <= v <= 255

    def test_lut_rgba256_alpha_pinned_to_255(self) -> None:
        # The alpha channel (index 3 mod 4) must be 255 — opaque colour.
        out = _lut_rgba256("viridis")
        for i in range(LUT_SIZE):
            alpha = out[i * 4 + 3]
            assert alpha == 255

    def test_fallback_lut_viridis(self) -> None:
        out = _fallback_lut("viridis")
        assert len(out) == 4 * LUT_SIZE
        # Alpha pinned to 255 in fallback too.
        for i in range(LUT_SIZE):
            assert out[i * 4 + 3] == 255

    def test_fallback_lut_other_name_uses_diverging(self) -> None:
        # Anything not "viridis" falls into the blue->white->red branch.
        out = _fallback_lut("RdBu_r")
        assert len(out) == 4 * LUT_SIZE
        # Middle entry has high green (white-ish).
        mid = LUT_SIZE // 2
        green = out[mid * 4 + 1]
        assert green > 200


# ── _estimate_payload_bytes ─────────────────────────────────────────────


class TestEstimatePayloadBytes:
    def test_small_payload_returns_silently(self) -> None:
        # Small payload → no exception raised.
        payload = {"version": 1, "bands": {"alpha": {"power": [0.1, 0.2]}}}
        # Should not raise.
        _estimate_payload_bytes(payload)
