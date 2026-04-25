from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest


pytest.importorskip("numpy")


def test_embedder_shapes(synthetic_raw: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """Embedder should return windows x d without needing real weights in tests."""
    import numpy as np

    from deepsynaps_qeeg.embeddings.labram import LaBraMEmbedder

    emb = LaBraMEmbedder(target_sfreq=200.0, window_seconds=4.0, stride_seconds=4.0)

    def _fake_embed_windows(windows: np.ndarray) -> np.ndarray:
        # windows: (n_windows, 19, n_samples)
        return np.zeros((windows.shape[0], 200), dtype=np.float32)

    monkeypatch.setattr(emb, "_embed_windows", _fake_embed_windows)
    out = emb.embed_recording(synthetic_raw)
    assert out.ndim == 2
    assert out.shape[1] == 200
    assert out.shape[0] >= 1


def test_license_allowlist(monkeypatch: pytest.MonkeyPatch) -> None:
    """Registry must refuse unknown/non-commercial licenses."""
    from deepsynaps_qeeg.embeddings import registry

    def _fake_info(_repo_id: str) -> dict[str, Any]:
        return {"sha": registry.MODEL_SPECS["labram-base"].pinned_sha, "cardData": {"license": "cc-by-nc-4.0"}}

    monkeypatch.setattr(registry, "_hf_model_info", _fake_info)

    with pytest.raises(registry.LicenseRefusedError):
        registry.get_embedder("labram-base")


def test_caching_idempotent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Factory is cached; repeated get_embedder returns same instance and doesn't re-hit network."""
    from deepsynaps_qeeg.embeddings import registry

    calls: list[str] = []

    def _fake_info(_repo_id: str) -> dict[str, Any]:
        calls.append("info")
        return {
            "sha": registry.MODEL_SPECS["labram-base"].pinned_sha,
            "cardData": {"license": registry.MODEL_SPECS["labram-base"].expected_license},
        }

    monkeypatch.setattr(registry, "_hf_model_info", _fake_info)

    # Avoid importing braindecode/torch by stopping before model load; factory should still create instance.
    e1 = registry.get_embedder("labram-base", cache_dir=tmp_path)
    e2 = registry.get_embedder("labram-base", cache_dir=tmp_path)

    assert e1 is e2
    # Enforce happened once (second call hits the instance cache).
    assert calls.count("info") == 1

