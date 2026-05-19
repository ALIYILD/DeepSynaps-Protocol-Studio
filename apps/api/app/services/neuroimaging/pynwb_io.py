"""PyNWB I/O helpers — all HDF5 file handles in with blocks."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

try:
    import pynwb
    from pynwb import NWBHDF5IO, NWBFile
    HAS_PYNWB: bool = True
except ImportError:
    pynwb = None  # type: ignore[assignment]
    NWBHDF5IO = None  # type: ignore[assignment,misc]
    NWBFile = None  # type: ignore[assignment,misc]
    HAS_PYNWB = False

from app.services.neuroimaging.schemas import NwbSummary


def write_minimal_nwb(
    out_path: str | Path,
    *,
    session_description: str,
    identifier: str,
    session_start_time: datetime | str,
) -> None:
    """Write a minimal NWB file to *out_path*.

    All HDF5 file handles are managed in `with` blocks.
    Raises ImportError if pynwb is not installed.
    """
    if not HAS_PYNWB:
        raise ImportError("pynwb is not installed")
    if isinstance(session_start_time, str):
        session_start_time = datetime.fromisoformat(session_start_time)
    if session_start_time.tzinfo is None:
        session_start_time = session_start_time.replace(tzinfo=timezone.utc)
    nwbfile = NWBFile(
        session_description=session_description,
        identifier=identifier,
        session_start_time=session_start_time,
    )
    with NWBHDF5IO(str(out_path), mode="w") as io:
        io.write(nwbfile)


def read_nwb_summary(path: str | Path) -> NwbSummary:
    """Return a NwbSummary for the NWB file at *path*.

    All HDF5 file handles are managed in `with` blocks.
    Raises ImportError if pynwb is not installed.
    """
    if not HAS_PYNWB:
        raise ImportError("pynwb is not installed")
    with NWBHDF5IO(str(path), mode="r") as io:
        nwbfile = io.read()
        return NwbSummary(
            identifier=nwbfile.identifier,
            session_description=nwbfile.session_description,
            session_start_time=nwbfile.session_start_time.isoformat(),
            acquisition_keys=list(nwbfile.acquisition.keys()),
            processing_keys=list(nwbfile.processing.keys()),
        )
