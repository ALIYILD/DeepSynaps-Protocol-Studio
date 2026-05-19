from __future__ import annotations

from ..inference_contracts import InferenceContract
from .schemas import EEGModelStatus


class EEGNetProvider(InferenceContract):
    provider_name = "EEGNet"

    def status(self) -> EEGModelStatus:
        return EEGModelStatus(
            provider_name=self.provider_name,
            configured=False,
            recommended_packages=["braindecode", "onnxruntime"],
        )


class CBraModProvider(InferenceContract):
    provider_name = "CBraMod"
