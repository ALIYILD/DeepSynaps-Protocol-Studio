"""LaBraM / foundation-model EEG embedding wrapper.

Contract
--------
See ``CONTRACT_V2.md §1`` — ``features["embedding"]`` is a 200-dim list of
floats produced by LaBraM-Base. This module is the sole producer.

Heavy deps (``torch``, ``einops``, and a local LaBraM checkpoint) are
imported behind a try/except. When any of them is missing — or the
``DEEPSYNAPS_ALLOW_MODEL_DOWNLOAD`` env flag is unset and no local
checkpoint is cached — :func:`compute_embedding` returns a deterministic
200-dim stub seeded by a hash of the ``epochs.info`` payload.

The stub path never raises: a qEEG analyser running on a CPU-only worker
must still return a well-shaped ``embedding`` field so the UI renders.

Notes
-----
All risk / classifier outputs built on top of this embedding are labelled
as **"similarity indices"** (see ``CONTRACT_V2.md §7``). The embedding
itself is a neutral representation — it does not encode a diagnosis.
"""
from __future__ import annotations

import hashlib
import logging
import os
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

EMBEDDING_DIM = 200
DEFAULT_MODEL_NAME = "labram-base"
_DEFAULT_CACHE_DIR = Path.home() / ".deepsynaps" / "models"
_DOWNLOAD_GUARD_ENV = "DEEPSYNAPS_ALLOW_MODEL_DOWNLOAD"


def _try_import_heavy() -> tuple[bool, Any, Any]:
    """Attempt to import the LaBraM heavy-dep stack.

    Returns
    -------
    tuple
        ``(ok, torch_module_or_None, einops_module_or_None)``. ``ok`` is
        True only when both ``torch`` and ``einops`` import cleanly.
    """
    try:
        import torch  # type: ignore[import-not-found]
        import einops  # type: ignore[import-not-found]
    except ImportError as exc:
        log.info("LaBraM heavy deps unavailable (%s); embedding will use stub.", exc)
        return False, None, None
    return True, torch, einops


_HEAVY_OK, _TORCH, _EINOPS = _try_import_heavy()


def _default_checkpoint_path(cache_dir: Path | None = None) -> Path:
    """Return the expected on-disk path of the LaBraM-Base checkpoint.

    Parameters
    ----------
    cache_dir : Path or None
        Override cache root. Defaults to ``~/.deepsynaps/models``.

    Returns
    -------
    Path
        File path (may not exist).
    """
    root = Path(cache_dir) if cache_dir else _DEFAULT_CACHE_DIR
    return root / "labram_base.pt"


def _checkpoint_available(cache_dir: Path | None = None) -> bool:
    """Whether a local LaBraM checkpoint file is present.

    Parameters
    ----------
    cache_dir : Path or None
        Override cache root.

    Returns
    -------
    bool
    """
    return _default_checkpoint_path(cache_dir).exists()


#: Public flag — True iff heavy deps import AND a local checkpoint exists.
HAS_LABRAM: bool = bool(_HEAVY_OK and _checkpoint_available())


def _download_checkpoint(cache_dir: Path) -> Path:
    """Prepare to download the LaBraM-Base checkpoint.

    This function is a guard, not an executor. It verifies the user has
    explicitly opted into network downloads via the
    ``DEEPSYNAPS_ALLOW_MODEL_DOWNLOAD`` env var. Actual HTTP fetching is
    intentionally *not* performed here so this repo is safe to run in
    CI / offline scaffolding environments.

    Parameters
    ----------
    cache_dir : Path
        Directory to drop the checkpoint into.

    Returns
    -------
    Path
        The expected on-disk path (the file is NOT created).

    Raises
    ------
    RuntimeError
        When the download guard env var is not set to ``"1"``.
    """
    if os.environ.get(_DOWNLOAD_GUARD_ENV) != "1":
        raise RuntimeError(
            "LaBraM checkpoint not cached and "
            f"{_DOWNLOAD_GUARD_ENV}!=1. Refusing to fetch model weights "
            "in this environment. Set the env var and re-run to opt in."
        )
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    expected = _default_checkpoint_path(cache_dir)
    log.warning(
        "Download guard passed but actual fetch is scaffolded out. "
        "Implement real fetch in deployment container. Expected path: %s",
        expected,
    )
    return expected


def _hash_epochs_info(epochs: Any) -> int:
    """Deterministic integer hash of an MNE ``Epochs`` object.

    Uses ``ch_names``, ``sfreq``, and ``n_epochs`` when available. Falls
    back to ``repr(epochs)`` otherwise. The returned int is stable
    across Python processes (unlike the builtin :func:`hash`).

    Parameters
    ----------
    epochs : object
        Typically ``mne.Epochs``; duck-typed.

    Returns
    -------
    int
        Non-negative 64-bit integer.
    """
    try:
        info = epochs.info  # type: ignore[attr-defined]
        ch_names = list(info.get("ch_names", []))
        sfreq = float(info.get("sfreq", 0.0) or 0.0)
        n_epochs = int(getattr(epochs, "__len__", lambda: 0)())
        payload = f"{ch_names}|{sfreq:.6f}|{n_epochs}"
    except Exception:
        payload = repr(epochs)
    digest = hashlib.sha256(payload.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=False)


def _stub_embedding(seed: int) -> list[float]:
    """Produce a deterministic 200-dim unit-norm-ish vector from ``seed``.

    Uses SHA-256 chunks so the output is fully reproducible across
    Python versions and does not depend on NumPy's RNG internals.

    Parameters
    ----------
    seed : int
        Any non-negative integer.

    Returns
    -------
    list of float
        Length :data:`EMBEDDING_DIM`.
    """
    vec: list[float] = []
    counter = 0
    seed_bytes = int(seed).to_bytes(8, "big", signed=False)
    while len(vec) < EMBEDDING_DIM:
        chunk = hashlib.sha256(seed_bytes + counter.to_bytes(4, "big")).digest()
        for i in range(0, len(chunk), 4):
            if len(vec) >= EMBEDDING_DIM:
                break
            word = int.from_bytes(chunk[i : i + 4], "big", signed=False)
            # Map into roughly N(0, 1) space via centred scaling.
            vec.append((word / 0xFFFFFFFF) * 2.0 - 1.0)
        counter += 1
    # L2-normalise so downstream cosine-similarity math is well-behaved.
    norm = sum(v * v for v in vec) ** 0.5 or 1.0
    return [v / norm for v in vec]


def _resolve_device(device: str) -> str:
    """Map ``"auto"`` → ``"cuda"`` / ``"mps"`` / ``"cpu"``.

    Parameters
    ----------
    device : str
        ``"auto"`` or any explicit torch device string.

    Returns
    -------
    str
        Concrete device string.
    """
    if device != "auto":
        return device
    if _TORCH is None:
        return "cpu"
    try:
        if _TORCH.cuda.is_available():
            return "cuda"
        if getattr(_TORCH.backends, "mps", None) and _TORCH.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def compute_embedding(
    epochs: Any,
    *,
    model_name: str = DEFAULT_MODEL_NAME,
    device: str = "auto",
    deterministic_seed: int | None = None,
) -> dict[str, Any]:
    """Return a 200-dim LaBraM-style embedding for an ``mne.Epochs``.

    Real path
    ---------
    1. Resample to 200 Hz.
    2. Z-score each channel across all epochs.
    3. Patchify into 1-s windows.
    4. Run LaBraM encoder, mean-pool CLS tokens across epochs.
    5. Return a 200-dim numpy vector (surfaced as ``list[float]``).

    Stub path
    ---------
    Produce a deterministic 200-dim vector seeded by
    ``deterministic_seed`` (or a stable hash of ``epochs.info`` when the
    caller does not supply one). Emits a single ``log.warning`` per call
    so dashboards show the stub path is in use.

    Parameters
    ----------
    epochs : mne.Epochs-like
        Input epoch structure. Duck-typed so unit tests can pass a
        lightweight mock.
    model_name : str
        Tag returned in the output. Defaults to ``"labram-base"``.
    device : str
        ``"auto"``, ``"cpu"``, ``"cuda"``, or ``"mps"``.
    deterministic_seed : int or None
        Override the stub seed. Ignored on the real path.

    Returns
    -------
    dict
        ``{"embedding": list[float], "model": str, "dim": 200,
        "is_stub": bool}``.
    """
    seed = deterministic_seed if deterministic_seed is not None else _hash_epochs_info(epochs)

    if not HAS_LABRAM:
        log.warning(
            "compute_embedding: LaBraM unavailable — returning deterministic stub "
            "(seed=%d, model=%s).",
            seed,
            model_name,
        )
        return {
            "embedding": _stub_embedding(seed),
            "model": f"{model_name}-stub",
            "dim": EMBEDDING_DIM,
            "is_stub": True,
        }

    # Real path. Kept conservative so a test-time stub still works if any
    # runtime condition trips (e.g. missing optional MNE).
    try:
        import numpy as np  # noqa: WPS433 — local heavy import

        resolved_device = _resolve_device(device)
        # Resample to 200 Hz if supported by the epochs object.
        if hasattr(epochs, "copy") and hasattr(epochs, "resample"):
            ep = epochs.copy()
            try:
                ep.resample(200.0, verbose="WARNING")
            except Exception as exc:  # pragma: no cover — MNE variant
                log.warning("resample to 200Hz failed (%s); continuing with original.", exc)
                ep = epochs
        else:
            ep = epochs

        data = np.asarray(ep.get_data())  # (n_epochs, n_ch, n_times)
        mean = data.mean(axis=(0, 2), keepdims=True)
        std = data.std(axis=(0, 2), keepdims=True)
        std = np.where(std < 1e-12, 1.0, std)
        data = (data - mean) / std

        # Patchify into 1 s windows — 200 Hz × 1 s = 200 samples per patch.
        sfreq = 200
        patch = sfreq
        n_epochs, n_ch, n_times = data.shape
        n_patches = max(1, n_times // patch)
        data = data[:, :, : n_patches * patch]
        data = data.reshape(n_epochs, n_ch, n_patches, patch)

        # Load the encoder.
        import torch  # type: ignore[import-not-found]

        ckpt = _default_checkpoint_path()
        state = torch.load(ckpt, map_location=resolved_device)  # noqa: S614
        encoder = state.get("encoder") if isinstance(state, dict) else None
        if encoder is None:  # pragma: no cover — real-path fallback
            log.warning(
                "Checkpoint at %s did not contain a loadable encoder — falling "
                "back to deterministic stub.",
                ckpt,
            )
            return {
                "embedding": _stub_embedding(seed),
                "model": f"{model_name}-stub",
                "dim": EMBEDDING_DIM,
                "is_stub": True,
            }
        encoder = encoder.to(resolved_device).eval()
        with torch.no_grad():
            x = torch.from_numpy(data).float().to(resolved_device)
            cls = encoder(x)  # expected shape (n_epochs, EMBEDDING_DIM)
            emb = cls.mean(dim=0).detach().cpu().numpy().ravel()

        # Defensive shape fix — trim or pad to EMBEDDING_DIM.
        if emb.shape[0] != EMBEDDING_DIM:
            log.warning(
                "LaBraM encoder returned %d dims; reshaping to %d.",
                emb.shape[0],
                EMBEDDING_DIM,
            )
            out = np.zeros(EMBEDDING_DIM, dtype=float)
            n = min(emb.shape[0], EMBEDDING_DIM)
            out[:n] = emb[:n]
            emb = out

        return {
            "embedding": [float(x) for x in emb.tolist()],
            "model": model_name,
            "dim": EMBEDDING_DIM,
            "is_stub": False,
        }
    except Exception as exc:  # pragma: no cover — real-path guard
        log.exception("LaBraM real path failed (%s) — falling back to stub.", exc)
        return {
            "embedding": _stub_embedding(seed),
            "model": f"{model_name}-stub",
            "dim": EMBEDDING_DIM,
            "is_stub": True,
        }
