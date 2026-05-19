"""Phase 3: MONAI model wrappers (optional [neuro-dl] extra).

MONAI is Apache 2.0 so it's safe as a Python dependency, BUT it ships
~150 MB of medical-imaging assets and requires torch. We keep it in the
optional `[neuro-dl]` extras group so plain `pip install -e apps/api`
stays small. Import is guarded; all public functions raise `ImportError`
when the library is missing.

No bundle downloads happen — `list_bundles()` returns the names of two
well-known MONAI bundles only.
"""
from __future__ import annotations

from .schemas import MonaiModelSummary

# ── Optional import guards ────────────────────────────────────────────────

try:
    import torch as _torch  # noqa: F401
    _HAS_TORCH = True
except ImportError:
    _HAS_TORCH = False

try:
    if not _HAS_TORCH:
        raise ImportError("torch is required by monai")
    import monai as _monai  # noqa: F401
    HAS_MONAI: bool = True
except ImportError:
    HAS_MONAI = False


# Built-in MONAI bundle names (no downloads happen here — these are
# well-known identifiers from MONAI Model Zoo).
_KNOWN_BUNDLES: tuple[str, ...] = (
    "spleen_ct_segmentation",
    "swin_unetr_btcv_segmentation",
)


def build_unet(
    in_channels: int,
    out_channels: int,
    spatial_dims: int = 3,
) -> MonaiModelSummary:
    """Construct a small MONAI UNet on CPU and return a summary.

    No training happens. The UNet is constructed with conservative channel
    counts so the param-count stays small and the network is instantiable
    without a GPU.
    """
    if not HAS_MONAI:
        raise ImportError("MONAI is not installed")

    if spatial_dims not in (2, 3):
        raise ValueError("spatial_dims must be 2 or 3")
    if in_channels <= 0 or out_channels <= 0:
        raise ValueError("in_channels and out_channels must be positive")

    from monai.networks.nets import UNet  # noqa: WPS433

    model = UNet(
        spatial_dims=spatial_dims,
        in_channels=in_channels,
        out_channels=out_channels,
        channels=(8, 16, 32),
        strides=(2, 2),
        num_res_units=1,
    )
    param_count = sum(p.numel() for p in model.parameters())

    return MonaiModelSummary(
        model_name="UNet",
        in_channels=in_channels,
        out_channels=out_channels,
        spatial_dims=spatial_dims,
        param_count=int(param_count),
    )


def list_bundles() -> list[str]:
    """Return the names of well-known MONAI bundles.

    No network I/O — purely a static list of identifiers callers can use
    to navigate the MONAI Model Zoo.
    """
    if not HAS_MONAI:
        raise ImportError("MONAI is not installed")
    return list(_KNOWN_BUNDLES)
