"""Source-localization subpackage.

Public API is split across:
- `forward.py`: template/subject forward model
- `noise.py`: noise covariance estimation
- `inverse.py`: inverse operator + inverse application helpers
- `roi.py`: Desikan–Killiany ROI band-power extraction
- `viz_3d.py`: optional static 3D snapshots (PyVista backend)
"""

from .forward import build_forward_model
from .inverse import apply_inverse, compute_inverse_operator
from .noise import estimate_noise_covariance
from .roi import extract_roi_band_power
from .viz_3d import save_stc_snapshots

__all__ = [
    "apply_inverse",
    "build_forward_model",
    "compute_inverse_operator",
    "estimate_noise_covariance",
    "extract_roi_band_power",
    "save_stc_snapshots",
]
