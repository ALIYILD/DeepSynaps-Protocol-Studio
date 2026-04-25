"""QEEGEncoder facade — single entry point for the dual-path encoder.

Combines:
- Foundation backbone (LaBraM/EEGPT, frozen) -> 512-dim embedding
- Tabular projector (canonical features) -> 128-dim embedding
- Conformal wrapper for any downstream confidence scoring

Inputs are validated against the qeeg-recording event payload contract.
Outputs are pure data classes that the consumer turns into Feast pushes
and ai_inference event emissions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import numpy as np
import structlog
import torch

from .conformal.wrapper import ConformalWrapper
from .config import Settings
from .foundation.labram import load_backbone, to_tensor
from .tabular.features import extract_features
from .tabular.projector import TabularProjector

log = structlog.get_logger(__name__)


@dataclass
class QEEGEmbedding:
    """The full output of a single encoder forward pass."""

    foundation_emb: np.ndarray  # (foundation_dim,)
    tabular_emb: np.ndarray  # (tabular_dim,)
    canonical_features: dict[str, Any]  # the raw canonical feature dict
    provenance: dict[str, Any] = field(default_factory=dict)

    @property
    def shape(self) -> dict[str, tuple[int, ...]]:
        return {
            "foundation": self.foundation_emb.shape,
            "tabular": self.tabular_emb.shape,
        }


class QEEGEncoder:
    """Dual-path encoder: foundation + tabular."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._device = settings.foundation.device

        # Foundation path
        self.backbone = (
            load_backbone(
                weights_dir=settings.foundation.weights_dir,
                expected_sha256=settings.foundation.expected_sha256,
                device=settings.foundation.device,
                embedding_dim=settings.foundation.embedding_dim,
            )
            if settings.foundation.enabled
            else None
        )

        # Tabular path
        self.projector = (
            TabularProjector(embedding_dim=settings.tabular.embedding_dim)
            if settings.tabular.enabled
            else None
        )

        # Default conformal wrapper (callers can override per-head)
        self.conformal = ConformalWrapper(alpha=settings.conformal.alpha)

        log.info(
            "encoder_initialized",
            foundation=bool(self.backbone),
            tabular=bool(self.projector),
            backbone=settings.foundation.backbone if self.backbone else None,
        )

    def forward(
        self,
        eeg: np.ndarray,
        sfreq: float,
        channel_names: list[str],
        recording_id: str,
        tenant_id: str,
    ) -> QEEGEmbedding:
        """Encode a single qEEG recording.

        Args:
            eeg: (n_channels, n_samples) float32, preprocessed upstream.
            sfreq: sampling frequency in Hz.
            channel_names: list of channel labels in same order as `eeg`.
            recording_id: source qeeg-recording event id.
            tenant_id: tenant scope for audit metadata.

        Returns:
            QEEGEmbedding with both paths populated and provenance metadata.
        """
        if eeg.ndim != 2:
            raise ValueError(f"expected (channels, samples), got {eeg.shape}")
        if eeg.shape[0] != len(channel_names):
            raise ValueError(
                f"channel mismatch: eeg has {eeg.shape[0]} channels but "
                f"channel_names has {len(channel_names)}"
            )

        # Foundation path
        if self.backbone is not None:
            tensor = to_tensor(eeg, device=self._device)
            with torch.no_grad():
                foundation = self.backbone.encode(tensor).cpu().numpy().squeeze(0)
        else:
            foundation = np.zeros(self.settings.foundation.embedding_dim, dtype=np.float32)

        # Tabular path
        canonical = extract_features(eeg, sfreq=sfreq, channel_names=channel_names)
        if self.projector is not None:
            feature_vector = canonical.to_vector(channel_names)
            tabular = self.projector.transform(feature_vector)
            projector_fp = self.projector.fingerprint()
        else:
            tabular = np.zeros(self.settings.tabular.embedding_dim, dtype=np.float32)
            projector_fp = None

        provenance = {
            "recording_id": recording_id,
            "tenant_id": tenant_id,
            "encoded_at": datetime.now(UTC).isoformat(),
            "backbone": self.settings.foundation.backbone if self.backbone else None,
            "foundation_dim": int(foundation.shape[0]),
            "tabular_dim": int(tabular.shape[0]),
            "projector_fingerprint": projector_fp,
            "n_channels": eeg.shape[0],
            "n_samples": eeg.shape[1],
            "sfreq": float(sfreq),
            "channel_names": list(channel_names),
        }

        canonical_dict = {
            "band_powers": {k: v.tolist() for k, v in canonical.band_powers.items()},
            "relative_powers": {k: v.tolist() for k, v in canonical.relative_powers.items()},
            "frontal_alpha_asymmetry": canonical.frontal_alpha_asymmetry,
            "coherence": canonical.coherence,
        }

        return QEEGEmbedding(
            foundation_emb=foundation.astype(np.float32),
            tabular_emb=tabular.astype(np.float32),
            canonical_features=canonical_dict,
            provenance=provenance,
        )

