"""EEG forward model — sphere BEM (template); optional MRI/BEM extension."""

from __future__ import annotations

from typing import Any


def make_sphere_forward(
    info: Any,
    *,
    pos_mm: float = 18.0,
    exclude_mm: float = 15.0,
    verbose: bool = False,
) -> tuple[Any, Any, Any]:
    """Build sphere conductor model + coarse volume source grid + forward operator."""
    import mne

    sphere = mne.make_sphere_model(info=info)
    src = mne.setup_volume_source_space(
        subject=None,
        pos=pos_mm,
        sphere=(0.0, 0.0, 0.0, 90.0),
        sphere_units="mm",
        mindist=max(exclude_mm * 0.4, 5.0),
        exclude=max(exclude_mm, 10.0),
        verbose=verbose,
    )
    fwd = mne.make_forward_solution(
        info,
        trans=None,
        src=src,
        bem=sphere,
        meg=False,
        eeg=True,
        mindist=max(exclude_mm * 0.5, 5.0),
        n_jobs=1,
        verbose=verbose,
    )
    return sphere, src, fwd


def describe_forward_capabilities() -> dict[str, Any]:
    return {
        "headModel": "sphere_3layer_equiv",
        "note": "Bundled Colin27 BEM optional — MRI upload builds patient-specific BEM in future pass.",
        "channels": "montage_standard_1020_or_digitized",
    }
