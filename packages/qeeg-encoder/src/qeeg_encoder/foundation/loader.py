"""Foundation-model weights loader with SHA256 verification.

Weights are NEVER bundled in the runtime image. They are mounted from
/opt/models/<backbone>/ and verified against the SHA256 in models.lock.yaml.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import structlog

log = structlog.get_logger(__name__)


class WeightsVerificationError(RuntimeError):
    """Raised when weights file SHA256 does not match the lock file."""


def verify_sha256(path: Path, expected: str) -> str:
    """Compute SHA256 of `path`. Raise if it does not match `expected`.

    Returns the computed hex digest.
    """
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    actual = h.hexdigest()
    if actual.lower() != expected.lower():
        raise WeightsVerificationError(
            f"SHA256 mismatch for {path}: expected {expected[:12]}..., got {actual[:12]}..."
        )
    log.info("weights_verified", path=str(path), sha256_prefix=actual[:12])
    return actual


def find_weights_file(weights_dir: Path) -> Path:
    """Locate the canonical weights file in the mounted directory.

    Looks for, in order: pytorch_model.bin, model.safetensors, weights.pt.
    """
    candidates = ["pytorch_model.bin", "model.safetensors", "weights.pt"]
    for name in candidates:
        candidate = weights_dir / name
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"No weights file in {weights_dir}. Expected one of: {candidates}")

