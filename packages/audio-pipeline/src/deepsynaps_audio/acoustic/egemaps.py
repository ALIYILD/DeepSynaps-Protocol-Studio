"""eGeMAPS / ComParE feature vectors via openSMILE.

Behind the ``[acoustic-extras]`` install extra; the rest of the
pipeline must degrade gracefully when openSMILE is unavailable.
"""

from __future__ import annotations

from ..schemas import EGeMAPSVector, Recording


def extract_egemaps(
    recording: Recording,
    *,
    feature_set: str = "eGeMAPSv02",
) -> EGeMAPSVector:
    """Extract the standardised eGeMAPS (or ComParE) functional vector.

    TODO: implement in PR #2 (optional path). Wrap
    ``opensmile.Smile(feature_set=opensmile.FeatureSet.eGeMAPSv02,
    feature_level=opensmile.FeatureLevel.Functionals)``. Raise a
    typed ``OptionalDependencyMissing`` when openSMILE isn't
    installed so the orchestrator can mark this feature group as
    "unavailable" without crashing.
    """

    raise NotImplementedError(
        "acoustic.egemaps.extract_egemaps: implement in PR #2 (optional). "
        "Requires the `acoustic-extras` install extra (openSMILE)."
    )
