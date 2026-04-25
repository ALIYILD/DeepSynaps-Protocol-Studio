from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass(frozen=True, slots=True)
class TDBrainStudy:
    """TDBRAIN study adapter.

    Notes
    -----
    This is intentionally thin: it only defines the contract for producing
    a NeuralSet-compatible `events` DataFrame. Dataset-specific file parsing,
    subject manifests, and DUA handling live outside this repo.
    """

    path: Path

    def load_events(self) -> pd.DataFrame:
        """Return a NeuralSet `events` DataFrame.

        Expected columns (minimum)
        --------------------------
        - subject_id: str
        - recording_path: str (absolute or relative to `self.path`)
        - event_type: str (e.g. 'eyes_closed')
        - onset_sec: float
        - duration_sec: float
        - diagnosis: str (task label source)
        """

        manifest = self.path / "events.parquet"
        if manifest.exists():
            return pd.read_parquet(manifest)

        raise FileNotFoundError(
            f"Expected TDBRAIN events manifest at {manifest}. "
            "Create it as a parquet file matching the NeuralSet events contract."
        )

