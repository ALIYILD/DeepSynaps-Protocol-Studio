"""Advanced qEEG analysis engine — public API.

Usage:
    from app.services.analyses import run_advanced_analyses
    result = run_advanced_analyses(raw, band_powers)
"""
from __future__ import annotations

from typing import Any

from app.services.analyses._engine import run_all
from app.services.analyses._helpers import build_context

# Import analysis modules to trigger @register_analysis decorators.
# Order doesn't matter — each module self-registers on import.
import app.services.analyses.spectral as _spectral  # noqa: F401
import app.services.analyses.asymmetry as _asymmetry  # noqa: F401
import app.services.analyses.connectivity as _connectivity  # noqa: F401
import app.services.analyses.complexity as _complexity  # noqa: F401
import app.services.analyses.network as _network  # noqa: F401
import app.services.analyses.microstate as _microstate  # noqa: F401
import app.services.analyses.clinical as _clinical  # noqa: F401


def run_advanced_analyses(raw: Any, band_powers: dict[str, Any]) -> dict[str, Any]:
    """Run all registered advanced analyses on the given EEG data.

    Args:
        raw: MNE Raw object (cleaned, standard 10-20 channels)
        band_powers: existing band_powers result from spectral_analysis.compute_band_powers()

    Returns:
        {
            "results": {slug: {label, category, data, summary, status, error, duration_ms}},
            "meta": {total, completed, failed, duration_sec}
        }
    """
    context = build_context(raw, band_powers)
    return run_all(context)
