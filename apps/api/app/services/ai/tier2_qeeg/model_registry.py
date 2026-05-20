"""Tier 2 qEEG model registry.

Static metadata about the qEEG models the adapter intends to serve. The
``path`` field is ``None`` while no weights are present. The follow-up
PR resolves ``QEEG_ONNX_MODELS_DIR`` into concrete file paths.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class QeegModelMeta(BaseModel):
    """Static metadata for a single qEEG model.

    Local Pydantic model so it can be used as a FastAPI response item
    without depending on TypedDict (which Pydantic 2 does not accept
    from ``typing`` on Python < 3.12).
    """

    model_config = ConfigDict(extra="forbid")

    name: str
    params_m: float
    target_latency_ms: int
    input_shape: tuple[int, int]
    path: str | None
    upstream: str


EEGNET_META = QeegModelMeta(
    name="eegnet",
    params_m=0.005,
    target_latency_ms=1,
    input_shape=(22, 512),
    path=None,
    upstream="https://github.com/vlawhern/arl-eegmodels",
)

BIOT_META = QeegModelMeta(
    name="biot",
    params_m=3.3,
    target_latency_ms=10,
    input_shape=(22, 2048),
    path=None,
    upstream="https://github.com/ycq091044/BIOT",
)


_ALL: dict[str, QeegModelMeta] = {
    "eegnet": EEGNET_META,
    "biot": BIOT_META,
}


def list_models() -> list[QeegModelMeta]:
    """Return registry entries in deterministic order."""
    return [_ALL[name] for name in ("eegnet", "biot")]


def get_model(name: str) -> QeegModelMeta | None:
    return _ALL.get(name)
