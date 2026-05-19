"""Phase 6 — Neuroglancer URL construction unit tests."""
from __future__ import annotations

import importlib
import json
from urllib.parse import unquote

import pytest


def _reload_viewer():
    from app.services.neuroimaging import neuroglancer_viewer as mod
    return importlib.reload(mod)


def test_default_layer_template_shape():
    mod = _reload_viewer()
    spec = mod.default_layer_template("precomputed://gs://example/data")
    assert spec["source"] == "precomputed://gs://example/data"
    assert spec["type"] == "image"


def test_build_viewer_url_has_fragment():
    """URL must carry a `#!` JSON fragment encoding the layer source."""
    mod = _reload_viewer()
    spec = mod.default_layer_template("precomputed://gs://example/data")
    url = mod.build_viewer_url(spec)
    assert isinstance(url, str)
    assert "#!" in url
    fragment = url.split("#!", 1)[1]
    payload = json.loads(unquote(fragment))
    assert "layers" in payload
    assert "precomputed://gs://example/data" in json.dumps(payload["layers"])


def test_build_viewer_url_rejects_missing_source():
    mod = _reload_viewer()
    with pytest.raises(ValueError):
        mod.build_viewer_url({"type": "image"})


def test_build_viewer_url_rejects_missing_type():
    mod = _reload_viewer()
    with pytest.raises(ValueError):
        mod.build_viewer_url({"source": "precomputed://gs://example/data"})


def test_helpers_raise_when_neuroglancer_missing(monkeypatch):
    """When HAS_NEUROGLANCER is False, both helpers must raise ImportError."""
    mod = _reload_viewer()
    monkeypatch.setattr(mod, "HAS_NEUROGLANCER", False)
    with pytest.raises(ImportError):
        mod.build_viewer_url({"source": "precomputed://gs://x", "type": "image"})
    with pytest.raises(ImportError):
        mod.default_layer_template("precomputed://gs://x")


def test_neuroimaging_package_reexports_phase6_symbols():
    """`app.services.neuroimaging` must re-export Phase 6 helpers + flag."""
    import app.services.neuroimaging as ni
    assert hasattr(ni, "HAS_NEUROGLANCER")
    assert hasattr(ni, "build_viewer_url")
    assert hasattr(ni, "default_layer_template")
    assert hasattr(ni, "NeuroglancerViewerResponse")
