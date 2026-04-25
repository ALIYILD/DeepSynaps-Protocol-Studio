"""Session store for longitudinal comparisons.

Default storage layout mirrors the Studio worker output convention:

    outputs/<patient_id>/<session_id>/features.json

Where available, we also opportunistically load `zscores.json` and `quality.json`
from the same directory to enable z-delta and state/montage validation.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


@dataclass(frozen=True)
class SessionData:
    """Minimal session bundle for longitudinal computations."""

    patient_id: str
    session_id: str
    features: dict[str, Any]
    zscores: dict[str, Any] | None = None
    quality: dict[str, Any] | None = None

    @property
    def channel_names(self) -> list[str]:
        """Ordered channel list used by connectivity/topomaps."""
        conn = (self.features or {}).get("connectivity") or {}
        ch = conn.get("channels") or []
        return [str(x) for x in ch]

    @property
    def recording_state(self) -> str | None:
        """Eyes-open / eyes-closed label if provided by the caller."""
        q = self.quality or {}
        state = q.get("recording_state") or q.get("eyes_state")
        return str(state) if state else None


class SessionStore(Protocol):
    """Protocol for loading session artifacts by ids."""

    def load(self, *, patient_id: str, session_id: str) -> SessionData:
        """Load a session bundle (must include `features`)."""


class FileSessionStore:
    """File-backed session store rooted at an outputs directory."""

    def __init__(self, root: str | Path = "outputs") -> None:
        self.root = Path(root)

    def _session_dir(self, patient_id: str, session_id: str) -> Path:
        return self.root / str(patient_id) / str(session_id)

    def load(self, *, patient_id: str, session_id: str) -> SessionData:
        sess_dir = self._session_dir(patient_id, session_id)
        features_path = sess_dir / "features.json"
        if not features_path.exists():
            raise FileNotFoundError(str(features_path))

        features = json.loads(features_path.read_text(encoding="utf-8"))

        zscores_path = sess_dir / "zscores.json"
        quality_path = sess_dir / "quality.json"
        zscores = (
            json.loads(zscores_path.read_text(encoding="utf-8"))
            if zscores_path.exists()
            else None
        )
        quality = (
            json.loads(quality_path.read_text(encoding="utf-8"))
            if quality_path.exists()
            else None
        )
        return SessionData(
            patient_id=str(patient_id),
            session_id=str(session_id),
            features=features,
            zscores=zscores,
            quality=quality,
        )

