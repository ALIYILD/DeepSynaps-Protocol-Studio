"""Smoke test: neuroimaging sub-package imports cleanly and exposes HAS_* flags."""
from __future__ import annotations


def test_has_flags_are_booleans():
    from app.services.neuroimaging import HAS_NIBABEL, HAS_PYBIDS, HAS_PYNWB
    assert isinstance(HAS_NIBABEL, bool)
    assert isinstance(HAS_PYBIDS, bool)
    assert isinstance(HAS_PYNWB, bool)


def test_schemas_importable():
    from app.services.neuroimaging.schemas import (
        BIDSFileRef,
        LayoutSummary,
        NeuroimagingHealth,
        NiftiSummary,
        NwbSummary,
    )
    assert NiftiSummary
    assert LayoutSummary
    assert BIDSFileRef
    assert NwbSummary
    assert NeuroimagingHealth


def test_router_importable():
    from app.routers.neuroimaging_router import router
    assert router.prefix == "/api/v1/neuroimaging"
