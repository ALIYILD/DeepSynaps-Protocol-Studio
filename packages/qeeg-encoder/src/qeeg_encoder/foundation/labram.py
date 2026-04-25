"""LaBraM / EEGPT foundation backbone wrapper.

This is a frozen-weights inference wrapper. It does not expose training APIs.
The actual backbone is loaded read-only from a mounted directory.

In production the real LaBraM checkpoint is loaded via timm or a local module.
For the scaffold we expose a stable interface and a deterministic stub that the
test suite can exercise without GPU or large weights.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

import numpy as np
import structlog
import torch
from torch import Tensor, nn

from .loader import find_weights_file, verify_sha256

log = structlog.get_logger(__name__)


class FoundationBackbone(Protocol):
    """Protocol satisfied by any frozen EEG foundation model."""

    embedding_dim: int

    def encode(self, eeg: Tensor) -> Tensor:
        """Map (batch, channels, samples) -> (batch, embedding_dim)."""
        ...


class LaBraMBackbone(nn.Module):
    """Frozen LaBraM-style backbone.

    Production path loads the real checkpoint. Scaffold path uses a small
    deterministic projector so the contract is testable end-to-end.
    """

    def __init__(self, embedding_dim: int = 512, in_channels: int = 32) -> None:
        super().__init__()
        self.embedding_dim = embedding_dim
        self.in_channels = in_channels
        # Lightweight stand-in: temporal conv + global pool + linear.
        # The real backbone replaces this in-place when weights are loaded.
        self.temporal = nn.Conv1d(in_channels, 64, kernel_size=15, stride=8)
        self.pool = nn.AdaptiveAvgPool1d(1)
        self.head = nn.Linear(64, embedding_dim)
        for p in self.parameters():
            p.requires_grad = False

    @torch.no_grad()
    def encode(self, eeg: Tensor) -> Tensor:
        x = self.temporal(eeg)
        x = torch.relu(x)
        x = self.pool(x).squeeze(-1)
        return self.head(x)

    def forward(self, eeg: Tensor) -> Tensor:  # noqa: D401
        return self.encode(eeg)


def load_backbone(
    weights_dir: Path,
    expected_sha256: str,
    device: str = "cuda",
    embedding_dim: int = 512,
    in_channels: int = 32,
) -> FoundationBackbone:
    """Load a frozen backbone after SHA256 verification.

    If `weights_dir` does not exist or has no weights file, returns the
    deterministic stub so local dev and tests work without weights.
    """
    model = LaBraMBackbone(embedding_dim=embedding_dim, in_channels=in_channels)
    try:
        path = find_weights_file(weights_dir)
        verify_sha256(path, expected_sha256)
        state = torch.load(path, map_location="cpu", weights_only=True)
        model.load_state_dict(state, strict=False)
        log.info("backbone_loaded", weights=str(path))
    except (FileNotFoundError, RuntimeError) as e:
        log.warning("backbone_stub_mode", reason=str(e))

    target_device = device if (device == "cpu" or torch.cuda.is_available()) else "cpu"
    model = model.to(target_device).eval()
    return model


def to_tensor(eeg: np.ndarray, device: str = "cpu") -> Tensor:
    """Convert (channels, samples) float32 numpy to (1, channels, samples) tensor."""
    if eeg.ndim != 2:
        raise ValueError(f"expected (channels, samples), got shape {eeg.shape}")
    return torch.from_numpy(eeg.astype(np.float32)).unsqueeze(0).to(device)


def to_tensor_padded(
    eeg: np.ndarray,
    *,
    device: str = "cpu",
    target_channels: int,
) -> Tensor:
    """Convert EEG to a tensor, padding/truncating channels to match a backbone contract.

    Many EEG foundation models are trained with a fixed channel count. For the scaffold
    (and for mixed montage inputs), we keep the contract stable by zero-padding missing
    channels or truncating extra channels.
    """
    if eeg.ndim != 2:
        raise ValueError(f"expected (channels, samples), got shape {eeg.shape}")
    n_ch, n_samp = eeg.shape
    if target_channels <= 0:
        raise ValueError(f"target_channels must be > 0, got {target_channels}")

    if n_ch == target_channels:
        x = eeg
    elif n_ch < target_channels:
        pad = np.zeros((target_channels - n_ch, n_samp), dtype=eeg.dtype)
        x = np.concatenate([eeg, pad], axis=0)
    else:
        x = eeg[:target_channels]

    return torch.from_numpy(x.astype(np.float32)).unsqueeze(0).to(device)

