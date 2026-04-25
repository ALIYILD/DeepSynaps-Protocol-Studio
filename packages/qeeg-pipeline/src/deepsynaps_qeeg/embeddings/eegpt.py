"""EEGPT embedder wrapper (windowed embeddings from an MNE Raw)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .labram import _CANONICAL_19CH_1020, _SYNONYMS, _try_import, _window

log = logging.getLogger(__name__)


@dataclass
class EEGPTEmbedder:
    """Compute EEGPT embeddings for a continuous recording."""

    model_id: str = "braindecode/eegpt-pretrained"
    cache_dir: Path | str = Path.home() / ".cache" / "deepsynaps"
    target_sfreq: float = 200.0
    window_seconds: float = 4.0
    stride_seconds: float = 4.0
    device: str = "cpu"

    _model: object | None = None
    _spec: object | None = None  # set by registry, internal

    def embed_recording(self, raw) -> np.ndarray:
        mne = _try_import("mne")
        if mne is None:
            raise RuntimeError("mne is required to compute embeddings")
        raw2 = _prepare_raw(raw, target_sfreq=float(self.target_sfreq))
        data = _extract_ordered_19ch(raw2)  # (19, n_times)
        windows = _window(
            data,
            sfreq=float(raw2.info["sfreq"]),
            win_s=self.window_seconds,
            stride_s=self.stride_seconds,
        )
        return self._embed_windows(windows)

    def _embed_windows(self, windows: np.ndarray) -> np.ndarray:
        model = self._load_model()
        torch = _try_import("torch")
        if torch is None:
            raise RuntimeError("torch is required to compute EEGPT embeddings")
        with torch.no_grad():
            x = torch.from_numpy(windows).float().to(self.device)
            out = model(x)  # type: ignore[operator]
            if hasattr(out, "detach"):
                out = out.detach()
            out = out.cpu().numpy()
        if out.ndim == 3:
            out = out.mean(axis=1)
        if out.ndim != 2:
            raise RuntimeError(f"Unexpected model output shape: {out.shape}")
        return out.astype(np.float32, copy=False)

    def _load_model(self):
        if self._model is not None:
            return self._model

        local_dir = _snapshot_to_cache(self.model_id, cache_root=Path(self.cache_dir))
        braindecode = _try_import("braindecode")
        if braindecode is None:
            raise RuntimeError(
                "braindecode is required to load EEGPT weights. "
                "Install an extra that provides it in the runtime image."
            )
        from braindecode.models import EEGPT  # type: ignore[import-not-found]

        model = EEGPT.from_pretrained(local_dir)  # type: ignore[attr-defined]
        try:
            model = model.to(self.device).eval()
        except Exception:
            pass
        self._model = model
        return model


def _prepare_raw(raw, *, target_sfreq: float):
    raw2 = raw.copy()
    mapping = {ch: _SYNONYMS.get(ch, ch) for ch in raw2.ch_names}
    raw2.rename_channels(mapping)
    try:
        import mne  # type: ignore[import-not-found]

        montage = mne.channels.make_standard_montage("standard_1020")
        raw2.set_montage(montage, on_missing="ignore")
    except Exception:
        pass
    raw2.resample(float(target_sfreq), npad="auto", verbose="WARNING")
    return raw2


def _extract_ordered_19ch(raw) -> np.ndarray:
    n_times = int(raw.n_times)
    out = np.zeros((len(_CANONICAL_19CH_1020), n_times), dtype=np.float32)
    present = {ch: i for i, ch in enumerate(raw.ch_names)}
    for j, name in enumerate(_CANONICAL_19CH_1020):
        idx = present.get(name)
        if idx is None:
            continue
        out[j] = raw.get_data(picks=[idx]).astype(np.float32, copy=False)[0]
    return out


def _snapshot_to_cache(repo_id: str, *, cache_root: Path) -> Path:
    try:
        from huggingface_hub import snapshot_download  # type: ignore[import-not-found]
    except Exception as exc:
        raise RuntimeError("huggingface_hub is required to download model weights.") from exc
    cache_root.mkdir(parents=True, exist_ok=True)
    local_dir = snapshot_download(
        repo_id=repo_id,
        cache_dir=str(cache_root / "hf"),
        local_files_only=False,
    )
    return Path(local_dir)

