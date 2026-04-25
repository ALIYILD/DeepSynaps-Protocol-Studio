"""LaBraM embedder wrapper (windowed embeddings from an MNE Raw)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)


_CANONICAL_19CH_1020: list[str] = [
    "Fp1",
    "Fp2",
    "F7",
    "F3",
    "Fz",
    "F4",
    "F8",
    "T7",
    "C3",
    "Cz",
    "C4",
    "T8",
    "P7",
    "P3",
    "Pz",
    "P4",
    "P8",
    "O1",
    "O2",
]

_SYNONYMS: dict[str, str] = {
    "T3": "T7",
    "T4": "T8",
    "T5": "P7",
    "T6": "P8",
}


@dataclass
class LaBraMEmbedder:
    """Compute LaBraM embeddings for a continuous recording.

    Parameters
    ----------
    model_id : str
        Hugging Face repo id (resolved by registry). Default maps to the pinned
        allowlisted LaBraM weights.
    cache_dir : Path
        Root cache directory. Weights are downloaded under this root.
    target_sfreq : float
        Model sampling rate. Default 200 Hz per task requirements.
    window_seconds : float
        Window length in seconds.
    stride_seconds : float
        Window stride in seconds.
    device : str
        Torch device string. CPU path must work.
    """

    model_id: str = "braindecode/labram-pretrained"
    cache_dir: Path | str = Path.home() / ".cache" / "deepsynaps"
    target_sfreq: float = 200.0
    window_seconds: float = 4.0
    stride_seconds: float = 4.0
    device: str = "cpu"

    # Populated lazily
    _model: object | None = None
    _spec: object | None = None  # set by registry, intentionally internal

    def embed_recording(self, raw) -> np.ndarray:
        """Embed a recording into a window-by-dim matrix."""
        mne = _try_import("mne")
        if mne is None:
            raise RuntimeError("mne is required to compute embeddings")

        raw2 = _prepare_raw(raw, target_sfreq=float(self.target_sfreq))
        data = _extract_ordered_19ch(raw2)  # (19, n_times)
        windows = _window(data, sfreq=float(raw2.info["sfreq"]), win_s=self.window_seconds, stride_s=self.stride_seconds)
        # windows: (n_windows, 19, n_samples)
        return self._embed_windows(windows)

    def _embed_windows(self, windows: np.ndarray) -> np.ndarray:
        """Run model inference for pre-windowed data.

        This method is intentionally isolated so unit tests can monkeypatch it
        without requiring torch/braindecode.
        """
        model = self._load_model()

        # Default real-path implementation: use braindecode's HF mixin.
        torch = _try_import("torch")
        if torch is None:
            raise RuntimeError("torch is required to compute LaBraM embeddings")

        # Expect model returns a tensor (batch, d) or (batch, tokens, d).
        with torch.no_grad():
            x = torch.from_numpy(windows).float().to(self.device)
            out = model(x)  # type: ignore[operator]
            if hasattr(out, "detach"):
                out = out.detach()
            out = out.cpu().numpy()

        if out.ndim == 3:
            # token sequences: mean pool
            out = out.mean(axis=1)
        if out.ndim != 2:
            raise RuntimeError(f"Unexpected model output shape: {out.shape}")
        return out.astype(np.float32, copy=False)

    def _load_model(self):
        if self._model is not None:
            return self._model

        # Download (or reuse) weights into the mounted cache.
        local_dir = _snapshot_to_cache(self.model_id, cache_root=Path(self.cache_dir))

        braindecode = _try_import("braindecode")
        if braindecode is None:
            raise RuntimeError(
                "braindecode is required to load LaBraM weights. "
                "Install an extra that provides it in the runtime image."
            )

        # `braindecode.models.Labram` supports `.from_pretrained`.
        from braindecode.models import Labram  # type: ignore[import-not-found]

        model = Labram.from_pretrained(local_dir)  # type: ignore[attr-defined]
        # Keep CPU safe by default
        try:
            model = model.to(self.device).eval()
        except Exception:
            pass
        self._model = model
        return model


def _try_import(name: str):
    try:
        return __import__(name)
    except Exception:
        return None


def _prepare_raw(raw, *, target_sfreq: float):
    """Standardize channel names + montage + resample."""
    raw2 = raw.copy()
    # rename synonyms (T3->T7 etc.)
    mapping = {ch: _SYNONYMS.get(ch, ch) for ch in raw2.ch_names}
    raw2.rename_channels(mapping)
    try:
        import mne  # type: ignore[import-not-found]

        montage = mne.channels.make_standard_montage("standard_1020")
        raw2.set_montage(montage, on_missing="ignore")
    except Exception:
        pass
    try:
        raw2.resample(float(target_sfreq), npad="auto", verbose="WARNING")
    except Exception as exc:
        raise RuntimeError(f"Resample failed: {exc}") from exc
    return raw2


def _extract_ordered_19ch(raw) -> np.ndarray:
    """Return data in fixed 19ch 10-20 order, padding missing with zeros."""
    np_mod = np
    sfreq = float(raw.info["sfreq"])
    n_times = int(raw.n_times)
    out = np_mod.zeros((len(_CANONICAL_19CH_1020), n_times), dtype=np_mod.float32)

    # Fast path: pick channels we have, fill rest zeros.
    present = {ch: i for i, ch in enumerate(raw.ch_names)}
    for j, name in enumerate(_CANONICAL_19CH_1020):
        idx = present.get(name)
        if idx is None:
            continue
        out[j] = raw.get_data(picks=[idx]).astype(np_mod.float32, copy=False)[0]

    # Basic sanity: ensure plausible sfreq so windows work.
    if sfreq <= 0:
        raise ValueError("raw.info['sfreq'] must be positive")
    return out


def _window(x: np.ndarray, *, sfreq: float, win_s: float, stride_s: float) -> np.ndarray:
    """Window continuous data into (n_windows, n_ch, n_samples)."""
    n_ch, n_times = x.shape
    win = int(round(float(win_s) * float(sfreq)))
    stride = int(round(float(stride_s) * float(sfreq)))
    if win <= 0 or stride <= 0:
        raise ValueError("Window and stride must be positive")
    if n_times < win:
        # single padded window
        padded = np.zeros((n_ch, win), dtype=x.dtype)
        padded[:, :n_times] = x
        return padded[None, :, :]

    starts = list(range(0, n_times - win + 1, stride))
    windows = np.stack([x[:, s : s + win] for s in starts], axis=0)
    return windows


def _snapshot_to_cache(repo_id: str, *, cache_root: Path) -> Path:
    """Ensure repo snapshot exists locally and return local directory."""
    cache_root = Path(cache_root)
    cache_root.mkdir(parents=True, exist_ok=True)
    # Delegate actual downloading to huggingface_hub when available.
    try:
        from huggingface_hub import snapshot_download  # type: ignore[import-not-found]
    except Exception as exc:
        raise RuntimeError(
            "huggingface_hub is required to download model weights. "
            "Install it in the environment that computes embeddings."
        ) from exc

    local_dir = snapshot_download(
        repo_id=repo_id,
        cache_dir=str(cache_root / "hf"),
        local_files_only=False,
    )
    return Path(local_dir)

