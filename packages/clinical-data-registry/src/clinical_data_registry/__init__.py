"""Public exports for ``clinical_data_registry``.

The leading-underscore names are intentionally re-exported here.  They
were the public surface used across ``apps/api/app/services/``
(``_read_csv_records``, ``_csv_reader``, ``_BRAIN_REGIONS_FILE`` etc.)
and the move from ``app.services`` to this package must not change their
spelling.  See ``loaders.py`` and the package README for the rationale.
"""

from .loaders import (
    TEXT_REPLACEMENTS,
    _BRAIN_REGIONS_FILE,
    _QEEG_BIOMARKERS_FILE,
    _QEEG_CONDITION_MAP_FILE,
    _clean_text,
    _csv_reader,
    _read_csv_records,
)

__all__ = [
    "TEXT_REPLACEMENTS",
    "_clean_text",
    "_read_csv_records",
    "_csv_reader",
    "_BRAIN_REGIONS_FILE",
    "_QEEG_BIOMARKERS_FILE",
    "_QEEG_CONDITION_MAP_FILE",
]
