"""TRIBE-inspired DeepTwin layer (modality encoders → fusion → adapter →
simulation heads → explanation) for DeepSynaps Studio.

Public surface used by ``deeptwin_router.py`` and tests:

- ``simulate_protocol`` — full single-protocol simulation
- ``compare_protocols`` — rank a list of candidate protocols
- ``compute_patient_latent`` — encoders + fusion + adapter only
- ``encode_all`` — bare modality encoders
- ``explain_latest`` — re-run explanation
- ``ProtocolSpec`` — input dataclass for protocol scenarios
- ``to_jsonable`` — dataclass → dict helper for FastAPI responses
- ``GENERIC_DISCLAIMER`` — the standard safety footer

This package layers on top of the existing deeptwin_engine without
replacing any of its endpoints.
"""

from .simulator import (
    GENERIC_DISCLAIMER,
    compare_protocols,
    compute_patient_latent,
    encode_all,
    explain_latest,
    simulate_protocol,
    to_jsonable,
)
from .types import (
    EMBED_DIM,
    AdaptedPatient,
    Explanation,
    HeadOutputs,
    ModalityEmbedding,
    PatientLatent,
    ProtocolComparison,
    ProtocolSpec,
    SimulationOutput,
    TrajectoryHead,
    TrajectoryPoint,
)

__all__ = [
    "EMBED_DIM",
    "GENERIC_DISCLAIMER",
    "AdaptedPatient",
    "Explanation",
    "HeadOutputs",
    "ModalityEmbedding",
    "PatientLatent",
    "ProtocolComparison",
    "ProtocolSpec",
    "SimulationOutput",
    "TrajectoryHead",
    "TrajectoryPoint",
    "compare_protocols",
    "compute_patient_latent",
    "encode_all",
    "explain_latest",
    "simulate_protocol",
    "to_jsonable",
]
