from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass(frozen=True, slots=True)
class NMTStudy:
    """NMT EEG study adapter (CC BY 4.0)."""

    path: Path

    def load_events(self) -> pd.DataFrame:
        manifest = self.path / "events.parquet"
        if manifest.exists():
            return pd.read_parquet(manifest)

        raise FileNotFoundError(
            f"Expected NMT events manifest at {manifest}. "
            "Create it as a parquet file matching the NeuralSet events contract."
        )

