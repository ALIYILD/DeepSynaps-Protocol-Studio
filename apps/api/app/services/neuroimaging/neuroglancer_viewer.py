"""Phase 6 — Neuroglancer viewer URL construction."""
from __future__ import annotations

try:
    import neuroglancer as _neuroglancer  # noqa: F401
    HAS_NEUROGLANCER: bool = True
except ImportError:
    HAS_NEUROGLANCER = False


def _require_neuroglancer():
    if not HAS_NEUROGLANCER:
        raise ImportError("neuroglancer is not installed")


def default_layer_template(precomputed_url):
    _require_neuroglancer()
    return {"source": precomputed_url, "type": "image"}


def build_viewer_url(layer_spec):
    _require_neuroglancer()
    if "source" not in layer_spec:
        raise ValueError("layer_spec missing required key: 'source'")
    if "type" not in layer_spec:
        raise ValueError("layer_spec missing required key: 'type'")

    import neuroglancer

    state = neuroglancer.ViewerState()
    state.layers["layer"] = neuroglancer.ImageLayer(source=layer_spec["source"])
    return neuroglancer.to_url(state, prefix="https://neuroglancer-demo.appspot.com/")
