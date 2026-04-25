"""Embedder factory + model pinning + license enforcement.

Hard constraints (see user story):
- Weights live outside the runtime container; downloaded on first use to a
  host-mounted cache (default ``~/.cache/deepsynaps``).
- License allowlist is enforced at load time.
- Model repos are pinned to specific commit SHAs.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

log = logging.getLogger(__name__)


DEFAULT_CACHE_DIR = Path(os.path.expanduser("~")) / ".cache" / "deepsynaps"

# Licenses we allow for fetching + using weights in this codebase.
# We intentionally exclude "non-commercial" and unknown/absent licenses.
_LICENSE_ALLOWLIST: set[str] = {
    "bsd-3-clause",
    "apache-2.0",
    "mit",
}


@dataclass(frozen=True)
class ModelSpec:
    name: str
    hf_repo_id: str
    pinned_sha: str
    expected_license: str


# Pinned model commits + explicit expected licenses.
# NOTE: the `pinned_sha` values come from Hugging Face model API `sha` fields.
MODEL_SPECS: dict[str, ModelSpec] = {
    # Alias requested in task: "labram-base" (maps to braindecode hosted weights).
    "labram-base": ModelSpec(
        name="labram-base",
        hf_repo_id="braindecode/labram-pretrained",
        pinned_sha="0563b6c626e7b40d9a36653b763715db94d945d7",
        expected_license="bsd-3-clause",
    ),
    # Alias requested in task: "eegpt-base".
    "eegpt-base": ModelSpec(
        name="eegpt-base",
        hf_repo_id="braindecode/eegpt-pretrained",
        pinned_sha="e41cb3ae2ce4fd9eb736862292c91f8128d15618",
        expected_license="bsd-3-clause",
    ),
}


_EMBEDDER_CACHE: dict[str, Any] = {}


class LicenseRefusedError(RuntimeError):
    pass


class ModelPinMismatchError(RuntimeError):
    pass


def get_embedder(
    name: str,
    *,
    cache_dir: str | Path | None = None,
    model_id: str | None = None,
    device: str = "cpu",
):
    """Factory for foundation-model embedders (lazy, cached).

    Parameters
    ----------
    name : str
        One of ``{"labram","labram-base","eegpt","eegpt-base"}``.
    cache_dir : str | Path | None
        Root cache directory. Defaults to ``~/.cache/deepsynaps``.
    model_id : str | None
        Optional override for the Hugging Face repo id. Overrides are still
        subject to license allowlist + pin checks (must match a known spec).
    device : str
        Torch device string. CPU-only must work.
    """
    key = f"{name}|{model_id or ''}|{Path(cache_dir) if cache_dir else ''}|{device}"
    if key in _EMBEDDER_CACHE:
        return _EMBEDDER_CACHE[key]

    normalized = name.strip().lower()
    if normalized in {"labram", "labram-base"}:
        from .labram import LaBraMEmbedder

        spec = _resolve_spec("labram-base", model_id=model_id)
        emb = LaBraMEmbedder(model_id=spec.hf_repo_id, cache_dir=_cache_root(cache_dir), device=device)
        emb._spec = spec  # internal for tests/debug; not public API
        _enforce_license_and_pin(spec)
        _EMBEDDER_CACHE[key] = emb
        return emb

    if normalized in {"eegpt", "eegpt-base"}:
        from .eegpt import EEGPTEmbedder

        spec = _resolve_spec("eegpt-base", model_id=model_id)
        emb = EEGPTEmbedder(model_id=spec.hf_repo_id, cache_dir=_cache_root(cache_dir), device=device)
        emb._spec = spec  # internal
        _enforce_license_and_pin(spec)
        _EMBEDDER_CACHE[key] = emb
        return emb

    raise ValueError(f"Unknown embedder name: {name!r}. Known: {sorted(MODEL_SPECS)}")


def _cache_root(cache_dir: str | Path | None) -> Path:
    root = Path(cache_dir) if cache_dir is not None else DEFAULT_CACHE_DIR
    root.mkdir(parents=True, exist_ok=True)
    return root


def _resolve_spec(canonical_name: str, *, model_id: str | None) -> ModelSpec:
    spec = MODEL_SPECS[canonical_name]
    if model_id is None:
        return spec

    # Only allow overrides that still map to an explicitly pinned+licensed spec.
    for s in MODEL_SPECS.values():
        if s.hf_repo_id == model_id:
            return s
    raise LicenseRefusedError(
        f"Refusing unrecognized model_id override {model_id!r}. "
        "Only allowlisted, pinned models may be loaded."
    )


def _enforce_license_and_pin(spec: ModelSpec) -> None:
    info = _hf_model_info(spec.hf_repo_id)
    sha = str(info.get("sha") or "")
    license_id = str((info.get("cardData") or {}).get("license") or "")

    if sha != spec.pinned_sha:
        raise ModelPinMismatchError(
            f"Model pin mismatch for {spec.hf_repo_id}: expected {spec.pinned_sha}, got {sha}"
        )

    if not license_id:
        raise LicenseRefusedError(f"Missing license metadata for {spec.hf_repo_id}; refusing to load.")

    normalized = license_id.strip().lower()
    if normalized != spec.expected_license:
        raise LicenseRefusedError(
            f"License mismatch for {spec.hf_repo_id}: expected {spec.expected_license}, got {normalized}"
        )

    if normalized not in _LICENSE_ALLOWLIST:
        raise LicenseRefusedError(
            f"License {normalized!r} not in allowlist; refusing to load {spec.hf_repo_id}."
        )


def _hf_model_info(repo_id: str) -> dict[str, Any]:
    # Public HF REST API, no auth needed for these public repos.
    url = f"https://huggingface.co/api/models/{repo_id}"
    req = Request(url, headers={"User-Agent": "deepsynaps-qeeg/embeddings"})
    with urlopen(req, timeout=30) as resp:  # nosec B310 (controlled URL)
        payload = resp.read().decode("utf-8")
    return json.loads(payload)

