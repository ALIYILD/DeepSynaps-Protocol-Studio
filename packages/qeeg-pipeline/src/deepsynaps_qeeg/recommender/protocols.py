from __future__ import annotations

import csv
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Protocol:
    """A single protocol row from the existing clinical catalog."""

    protocol_id: str
    protocol_name: str
    condition_id: str
    phenotype_id: str | None
    modality_id: str
    device_id_if_specific: str | None
    evidence_grade: str | None
    evidence_summary: str | None
    target_region: str | None
    laterality: str | None
    intensity: str | None
    session_duration: str | None
    sessions_per_week: str | None
    total_course: str | None
    contraindication_check_required: str | None
    adverse_event_monitoring: str | None
    source_url_primary: str | None
    source_url_secondary: str | None
    notes: str | None

    @property
    def source_urls(self) -> list[str]:
        urls: list[str] = []
        for u in (self.source_url_primary, self.source_url_secondary):
            if u and u.strip():
                urls.append(u.strip())
        return urls


def _default_catalog_path() -> Path:
    """Best-effort default path to the shipped clinical protocol catalog."""
    # Repo-relative default: data/imports/clinical-database/protocols.csv
    here = Path(__file__).resolve()
    repo_root = here.parents[5]
    candidate = repo_root / "data" / "imports" / "clinical-database" / "protocols.csv"
    env_root = os.environ.get("DEEPSYNAPS_CLINICAL_DATA_ROOT", "").strip()
    if env_root:
        env_candidate = Path(env_root) / "protocols.csv"
        if env_candidate.exists():
            return env_candidate
    return candidate


class ProtocolLibrary:
    """Loader for the existing protocol catalog.

    Notes
    -----
    The project’s current protocol catalog is the imported clinical database CSV
    (``protocols.csv``). This loader does not move or transform that file; it
    reads it as-is and returns normalised :class:`Protocol` records.
    """

    def __init__(self, protocols: Iterable[Protocol]) -> None:
        self._protocols = list(protocols)

    @property
    def protocols(self) -> list[Protocol]:
        return list(self._protocols)

    @classmethod
    def load(cls, csv_path: str | Path | None = None) -> "ProtocolLibrary":
        path = Path(csv_path) if csv_path else _default_catalog_path()
        if not path.exists():
            raise FileNotFoundError(
                f"Protocol catalog not found at {path}. "
                "Set DEEPSYNAPS_CLINICAL_DATA_ROOT or pass csv_path explicitly."
            )
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        protos: list[Protocol] = []
        for row in rows:
            protos.append(
                Protocol(
                    protocol_id=(row.get("Protocol_ID") or "").strip(),
                    protocol_name=(row.get("Protocol_Name") or "").strip(),
                    condition_id=(row.get("Condition_ID") or "").strip(),
                    phenotype_id=(row.get("Phenotype_ID") or "").strip() or None,
                    modality_id=(row.get("Modality_ID") or "").strip(),
                    device_id_if_specific=(row.get("Device_ID_if_specific") or "").strip() or None,
                    evidence_grade=(row.get("Evidence_Grade") or "").strip() or None,
                    evidence_summary=(row.get("Evidence_Summary") or "").strip() or None,
                    target_region=(row.get("Target_Region") or "").strip() or None,
                    laterality=(row.get("Laterality") or "").strip() or None,
                    intensity=(row.get("Intensity") or "").strip() or None,
                    session_duration=(row.get("Session_Duration") or "").strip() or None,
                    sessions_per_week=(row.get("Sessions_per_Week") or "").strip() or None,
                    total_course=(row.get("Total_Course") or "").strip() or None,
                    contraindication_check_required=(row.get("Contraindication_Check_Required") or "").strip()
                    or None,
                    adverse_event_monitoring=(row.get("Adverse_Event_Monitoring") or "").strip() or None,
                    source_url_primary=(row.get("Source_URL_Primary") or "").strip() or None,
                    source_url_secondary=(row.get("Source_URL_Secondary") or "").strip() or None,
                    notes=(row.get("Notes") or "").strip() or None,
                )
            )
        # Drop empty protocol_id rows defensively.
        protos = [p for p in protos if p.protocol_id]
        return cls(protos)

