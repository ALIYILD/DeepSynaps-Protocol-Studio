"""Tier 1 vLLM client.

Stub-only. Reads ``TIER1_LLM_ENDPOINT`` / ``TIER1_LLM_MODEL`` /
``TIER1_LLM_API_KEY`` from the environment on construction. If the
endpoint is unset the client stays in stub mode and every ``complete``
call returns ``stub: True, output: None`` with the canonical disclaimer.

The real network path (httpx → vLLM OpenAI-compatible ``/v1/completions``)
is intentionally NOT wired in this PR — the contract ships first so
downstream surfaces can integrate against the schema without a model.
"""
from __future__ import annotations

import os
import time
from typing import Optional

from .disclaimers import CLINICAL_DISCLAIMER
from .schemas import (
    ClinicalReasoningRequest,
    ClinicalReasoningResponse,
    Tier1HealthResponse,
)

_DEFAULT_MODEL = "me-llama-13b"
_STUB_PLACEHOLDER = "[stub: clinical reasoning model not yet wired]"


class VLLMClient:
    """Thin client over a vLLM-hosted OpenAI-compatible endpoint.

    Constructed without arguments — config is read from the environment
    so the same client can be reused across requests and switched on by
    setting ``TIER1_LLM_ENDPOINT`` without redeploying code.
    """

    def __init__(self) -> None:
        self.endpoint: Optional[str] = os.getenv("TIER1_LLM_ENDPOINT") or None
        self.model: str = os.getenv("TIER1_LLM_MODEL", _DEFAULT_MODEL)
        # API key is read into a private attribute so it never appears in
        # health / debug responses.
        self._api_key: Optional[str] = os.getenv("TIER1_LLM_API_KEY") or None

    @property
    def is_stub(self) -> bool:
        return self.endpoint is None

    def health(self) -> Tier1HealthResponse:
        if self.is_stub:
            return Tier1HealthResponse(
                status="stub",
                model=self.model,
                endpoint=None,
                stub=True,
                message=(
                    "Tier 1 LLM endpoint not configured. "
                    "Set TIER1_LLM_ENDPOINT to wire a real vLLM server."
                ),
            )
        return Tier1HealthResponse(
            status="not_configured",
            model=self.model,
            endpoint=self.endpoint,
            stub=True,
            message=(
                "Endpoint configured but real client is not yet implemented "
                "in this PR. complete() still returns stub responses."
            ),
        )

    async def complete(
        self, request: ClinicalReasoningRequest
    ) -> ClinicalReasoningResponse:
        """Stub-mode completion.

        Returns deterministic placeholder content. The real implementation
        will POST to ``{endpoint}/v1/completions`` with the OpenAI-compatible
        payload that vLLM accepts.
        """
        start = time.monotonic()
        # Touch the request so static analysers see it as used.
        _ = request.prompt
        latency_ms = int((time.monotonic() - start) * 1000)

        return ClinicalReasoningResponse(
            stub=True,
            model=self.model,
            status="stub",
            output=None,
            message=_STUB_PLACEHOLDER,
            tokens_used=0,
            latency_ms=latency_ms,
            disclaimer=CLINICAL_DISCLAIMER,
        )


_singleton: Optional[VLLMClient] = None


def get_client() -> VLLMClient:
    """Return a process-wide ``VLLMClient`` singleton.

    Re-reads env on first access only. To pick up new env values, restart
    the process (Fly machine restart, ``uvicorn --reload`` in dev).
    """
    global _singleton
    if _singleton is None:
        _singleton = VLLMClient()
    return _singleton
