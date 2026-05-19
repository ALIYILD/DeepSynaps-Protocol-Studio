from __future__ import annotations

from ..inference_contracts import InferenceContract


class BrainJEPAProvider(InferenceContract):
    provider_name = "Brain-JEPA"


class SGACCConnectivityProvider(InferenceContract):
    provider_name = "sgACC Connectivity"
