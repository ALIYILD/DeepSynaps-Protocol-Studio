from __future__ import annotations

from ..inference_contracts import InferenceContract


class MeLLaMAProvider(InferenceContract):
    provider_name = "Me-LLaMA-13B"


class MedRAGProvider(InferenceContract):
    provider_name = "MedRAG"
