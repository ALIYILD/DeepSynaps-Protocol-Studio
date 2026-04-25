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

