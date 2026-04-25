from __future__ import annotations

import sys
import math
from pathlib import Path

import pytest

# Ensure src/ is importable when tests run without editable install.
_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from deepsynaps_qeeg.longitudinal.compare import compare_sessions
from deepsynaps_qeeg.longitudinal.significance import rci_for_comparison
from deepsynaps_qeeg.longitudinal.store import SessionData


def _synthetic_session(
    *,
    session_id: str,
    channels: list[str],
    theta_abs: list[float],
    beta_abs: list[float],
    alpha_abs: list[float],
    theta_z: list[float],
    beta_z: list[float],
    alpha_z: list[float],
    paf: list[float],
    coh_mat: list[list[float]],
    state: str = "eyes_closed",
) -> SessionData:
    band_payload = lambda vals: {ch: float(v) for ch, v in zip(channels, vals, strict=True)}
    z_band_payload = lambda vals: {ch: float(v) for ch, v in zip(channels, vals, strict=True)}

    features = {
        "spectral": {
            "bands": {
                "theta": {"absolute_uv2": band_payload(theta_abs), "relative": band_payload([0.2] * len(channels))},
                "beta": {"absolute_uv2": band_payload(beta_abs), "relative": band_payload([0.1] * len(channels))},
                "alpha": {"absolute_uv2": band_payload(alpha_abs), "relative": band_payload([0.3] * len(channels))},
            },
            "peak_alpha_freq": band_payload(paf),
        },
        "connectivity": {
            "channels": list(channels),
            "coherence": {"alpha": coh_mat},
            "wpli": {"alpha": coh_mat},
        },
    }
    zscores = {
        "spectral": {
            "bands": {
                "theta": {"absolute_uv2": z_band_payload(theta_z), "relative": z_band_payload([0.0] * len(channels))},
                "beta": {"absolute_uv2": z_band_payload(beta_z), "relative": z_band_payload([0.0] * len(channels))},
                "alpha": {"absolute_uv2": z_band_payload(alpha_z), "relative": z_band_payload([0.0] * len(channels))},
            }
        }
    }
    quality = {"recording_state": state}
    return SessionData(
        patient_id="p1",
        session_id=session_id,
        features=features,
        zscores=zscores,
        quality=quality,
    )


def test_compare_two_synthetic_sessions_nonzero_finite_deltas() -> None:
    ch = ["Fz", "Cz", "Pz"]
    prev = _synthetic_session(
        session_id="s1",
        channels=ch,
        theta_abs=[10.0, 11.0, 12.0],
        beta_abs=[5.0, 5.0, 5.0],
        alpha_abs=[8.0, 8.0, 8.0],
        theta_z=[0.0, 0.0, 0.0],
        beta_z=[0.0, 0.0, 0.0],
        alpha_z=[0.0, 0.0, 0.0],
        paf=[10.0, 10.0, 10.0],
        coh_mat=[[0.0, 0.2, 0.1], [0.2, 0.0, 0.15], [0.1, 0.15, 0.0]],
    )
    curr = _synthetic_session(
        session_id="s2",
        channels=ch,
        theta_abs=[12.0, 13.0, 14.0],
        beta_abs=[4.0, 4.0, 4.0],
        alpha_abs=[9.0, 9.0, 9.0],
        theta_z=[2.0, 2.0, 2.0],
        beta_z=[-1.0, -1.0, -1.0],
        alpha_z=[1.0, 1.0, 1.0],
        paf=[10.5, 10.5, 10.5],
        coh_mat=[[0.0, 0.25, 0.1], [0.25, 0.0, 0.2], [0.1, 0.2, 0.0]],
    )

    comp = compare_sessions(curr, prev)

    # spectral delta should be non-zero and finite for at least one channel/band
    dz = comp.spectral["bands"]["theta"]["z_absolute_uv2"]["Fz"]["delta"]
    assert dz is not None
    assert math.isfinite(float(dz))
    assert float(dz) != 0.0

    # connectivity delta summary should be finite and non-zero
    dconn = comp.connectivity["coherence"]["alpha"]["mean_abs_edge_delta"]
    assert dconn is not None
    assert math.isfinite(float(dconn))
    assert float(dconn) > 0.0

    # iapf shift and TBR delta should be finite and non-zero
    assert comp.iapf_shift_hz is not None
    assert math.isfinite(float(comp.iapf_shift_hz))
    assert float(comp.iapf_shift_hz) != 0.0

    assert comp.tbr_delta is not None
    assert math.isfinite(float(comp.tbr_delta))
    assert float(comp.tbr_delta) != 0.0


def test_rci_flags_meaningful_change() -> None:
    ch = ["Fz", "Cz", "Pz"]
    prev = _synthetic_session(
        session_id="s1",
        channels=ch,
        theta_abs=[10.0, 10.0, 10.0],
        beta_abs=[5.0, 5.0, 5.0],
        alpha_abs=[8.0, 8.0, 8.0],
        theta_z=[0.0, 0.0, 0.0],
        beta_z=[0.0, 0.0, 0.0],
        alpha_z=[0.0, 0.0, 0.0],
        paf=[10.0, 10.0, 10.0],
        coh_mat=[[0.0, 0.2, 0.1], [0.2, 0.0, 0.15], [0.1, 0.15, 0.0]],
    )
    curr = _synthetic_session(
        session_id="s2",
        channels=ch,
        theta_abs=[10.0, 10.0, 10.0],
        beta_abs=[5.0, 5.0, 5.0],
        alpha_abs=[8.0, 8.0, 8.0],
        theta_z=[5.0, 5.0, 5.0],  # large z shift
        beta_z=[0.0, 0.0, 0.0],
        alpha_z=[0.0, 0.0, 0.0],
        paf=[10.0, 10.0, 10.0],
        coh_mat=[[0.0, 0.2, 0.1], [0.2, 0.0, 0.15], [0.1, 0.15, 0.0]],
    )

    comp = compare_sessions(curr, prev)
    rci = rci_for_comparison(comp, threshold=1.96)

    meaningful = [
        f
        for f in rci.flags
        if f.metric.startswith("spectral.z_absolute_uv2") and f.clinically_meaningful
    ]
    assert meaningful, "Expected at least one clinically meaningful RCI flag."


def test_montage_mismatch_rejected() -> None:
    ch_prev = ["Fz", "Cz", "Pz"]
    ch_curr = ["Fz", "Pz", "Cz"]  # swapped ordering -> mismatch

    prev = _synthetic_session(
        session_id="s1",
        channels=ch_prev,
        theta_abs=[10.0, 10.0, 10.0],
        beta_abs=[5.0, 5.0, 5.0],
        alpha_abs=[8.0, 8.0, 8.0],
        theta_z=[0.0, 0.0, 0.0],
        beta_z=[0.0, 0.0, 0.0],
        alpha_z=[0.0, 0.0, 0.0],
        paf=[10.0, 10.0, 10.0],
        coh_mat=[[0.0, 0.2, 0.1], [0.2, 0.0, 0.15], [0.1, 0.15, 0.0]],
    )
    curr = _synthetic_session(
        session_id="s2",
        channels=ch_curr,
        theta_abs=[10.0, 10.0, 10.0],
        beta_abs=[5.0, 5.0, 5.0],
        alpha_abs=[8.0, 8.0, 8.0],
        theta_z=[0.0, 0.0, 0.0],
        beta_z=[0.0, 0.0, 0.0],
        alpha_z=[0.0, 0.0, 0.0],
        paf=[10.0, 10.0, 10.0],
        coh_mat=[[0.0, 0.2, 0.1], [0.2, 0.0, 0.15], [0.1, 0.15, 0.0]],
    )

    with pytest.raises(ValueError, match="Montage mismatch"):
        compare_sessions(curr, prev)

