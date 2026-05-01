"""External neuroimaging adapters (subprocess or optional in-process bindings)."""

from .ants_kelly_kapowski import (
    KellyKapowskiRunResult,
    kelly_kapowski_available,
    run_kelly_kapowski_thickness,
)

__all__ = [
    "KellyKapowskiRunResult",
    "kelly_kapowski_available",
    "run_kelly_kapowski_thickness",
]
