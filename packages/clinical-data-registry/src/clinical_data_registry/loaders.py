"""Shared CSV loader primitives for DeepSynaps clinical data.

These were originally private helpers inside
``apps/api/app/services/clinical_data.py`` and
``apps/api/app/services/neuro_csv.py``.  They were imported across many
service modules (``registries``, ``protocol_registry``, ``neuro_csv``,
``neuromodulation_research``), making them de-facto public.  Moving them
into a dedicated workspace package gives them a single, testable home and
lets ``apps/api`` shrink toward "just FastAPI wiring".

Behaviour is intentionally unchanged:

* ``_read_csv_records`` reads the whole file eagerly with ``utf-8-sig``
  encoding and normalizes mojibake via ``TEXT_REPLACEMENTS``.
* ``_csv_reader`` returns the open handle alongside a ``csv.DictReader``
  so consumers can stream rows lazily and close the handle in a
  ``finally`` block — this preserves the lazy-iteration contract used by
  ``neuromodulation_research``.

Both helpers keep their leading-underscore names so the existing import
sites (``from app.services.clinical_data import _read_csv_records``) keep
working through the re-export shims.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import IO, Tuple


# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------

TEXT_REPLACEMENTS: dict[str, str] = {
    "—": "-",
    "–": "-",
    "â€”": "-",
    "â€“": "-",
    "â‰¥": ">=",
    "â‰¤": "<=",
    "â€™": "'",
    "â€˜": "'",
    "â€œ": '"',
    "â€": '"',
    "â€¢": "-",
    "Â": "",
}


def _clean_text(value: str) -> str:
    """Strip mojibake encodings out of a CSV cell and trim whitespace."""

    cleaned = value
    for source, target in TEXT_REPLACEMENTS.items():
        cleaned = cleaned.replace(source, target)
    return cleaned.strip()


# ---------------------------------------------------------------------------
# CSV readers
# ---------------------------------------------------------------------------


def _read_csv_records(path: Path) -> list[dict[str, str]]:
    """Read a CSV file eagerly and return cleaned ``dict`` rows.

    Uses ``utf-8-sig`` so byte-order marks at the start of files exported
    from Excel do not show up as part of the first column header.
    """

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return [
            {
                key: _clean_text(value)
                for key, value in dict(row).items()
            }
            for row in csv.DictReader(handle)
        ]


def _csv_reader(path: Path) -> Tuple[IO[str], "csv.DictReader[str]"]:
    """Open ``path`` and return ``(handle, DictReader)`` for lazy streaming.

    The caller is responsible for closing the returned handle (typically
    in a ``finally`` block).  We keep this helper instead of using
    ``with``-managed context inside the function because the existing
    consumers want to iterate the reader incrementally and close the
    file only after the iteration finishes.
    """

    handle = path.open(newline="", encoding="utf-8")
    return handle, csv.DictReader(handle)


# ---------------------------------------------------------------------------
# Clinical CSV filename constants
# ---------------------------------------------------------------------------
#
# These three filenames live next to the rest of the imported clinical
# CSVs (see ``app.settings.CLINICAL_DATA_ROOT``).  They were declared as
# module-level constants in ``apps/api/app/services/neuro_csv.py``;
# moving them here means consumers (and any new registry packages) can
# import them without reaching back into ``apps/api``.

_BRAIN_REGIONS_FILE: str = "brain_regions.csv"
_QEEG_BIOMARKERS_FILE: str = "qeeg_biomarkers.csv"
_QEEG_CONDITION_MAP_FILE: str = "qeeg_condition_map.csv"


__all__ = [
    "TEXT_REPLACEMENTS",
    "_clean_text",
    "_read_csv_records",
    "_csv_reader",
    "_BRAIN_REGIONS_FILE",
    "_QEEG_BIOMARKERS_FILE",
    "_QEEG_CONDITION_MAP_FILE",
]
