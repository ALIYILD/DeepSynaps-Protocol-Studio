"""Phase 3 MONAI service tests.

MONAI lives in the [neuro-dl] optional-deps extra. On a default install
these tests skip via pytest.importorskip; with `pip install -e
"apps/api[neuro-dl]"` they exercise the real network builder.
"""
from __future__ import annotations

import pytest

# Skip the whole module when MONAI is not installed (default install path).
pytest.importorskip("monai")


def test_build_unet_returns_summary_with_param_count():
    from app.services.neuroimaging.monai_models import build_unet
    from app.services.neuroimaging.schemas import MonaiModelSummary

    summary = build_unet(in_channels=1, out_channels=2, spatial_dims=3)
    assert isinstance(summary, MonaiModelSummary)
    assert summary.in_channels == 1
    assert summary.out_channels == 2
    assert summary.spatial_dims == 3
    assert summary.param_count > 0
    assert "net" in summary.model_name.lower() or "unet" in summary.model_name.lower()


def test_build_unet_2d_variant():
    from app.services.neuroimaging.monai_models import build_unet

    summary = build_unet(in_channels=3, out_channels=1, spatial_dims=2)
    assert summary.spatial_dims == 2
    assert summary.in_channels == 3
    assert summary.out_channels == 1
    assert summary.param_count > 0


def test_list_bundles_returns_known_names():
    from app.services.neuroimaging.monai_models import list_bundles

    names = list_bundles()
    assert isinstance(names, list)
    assert all(isinstance(n, str) for n in names)
    assert len(names) >= 1
    # No network downloads — these are baked-in known bundle identifiers.
    assert "spleen_ct_segmentation" in names
