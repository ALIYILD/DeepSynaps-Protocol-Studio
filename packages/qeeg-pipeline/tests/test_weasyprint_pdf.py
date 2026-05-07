from __future__ import annotations


def test_band_z_map_accepts_nested_absolute_uv2_payload() -> None:
    from deepsynaps_qeeg.report.weasyprint_pdf import _band_z_map

    spectral_z = {
        "alpha": {
            "absolute_uv2": {"Fz": 1.5, "Cz": -0.4},
            "relative": {"Fz": 0.2, "Cz": 0.1},
        }
    }

    assert _band_z_map(spectral_z, "alpha") == {"Fz": 1.5, "Cz": -0.4}


def test_band_z_map_accepts_flat_payload() -> None:
    from deepsynaps_qeeg.report.weasyprint_pdf import _band_z_map

    spectral_z = {"theta": {"Fz": 0.8, "Cz": 0.3}}

    assert _band_z_map(spectral_z, "theta") == {"Fz": 0.8, "Cz": 0.3}
