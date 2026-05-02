"""Unit tests for the moved CSV-loader primitives.

These cover the behaviour previously implicit in
``apps/api/app/services/clinical_data.py`` and
``apps/api/app/services/neuro_csv.py`` — there were no dedicated unit
tests for the helpers before the move, so we add them now to lock the
contract.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from clinical_data_registry import (
    TEXT_REPLACEMENTS,
    _BRAIN_REGIONS_FILE,
    _QEEG_BIOMARKERS_FILE,
    _QEEG_CONDITION_MAP_FILE,
    _clean_text,
    _csv_reader,
    _read_csv_records,
)


# ---------------------------------------------------------------------------
# Filename constants
# ---------------------------------------------------------------------------


def test_brain_regions_filename_constant() -> None:
    assert _BRAIN_REGIONS_FILE == "brain_regions.csv"


def test_qeeg_biomarkers_filename_constant() -> None:
    assert _QEEG_BIOMARKERS_FILE == "qeeg_biomarkers.csv"


def test_qeeg_condition_map_filename_constant() -> None:
    assert _QEEG_CONDITION_MAP_FILE == "qeeg_condition_map.csv"


# ---------------------------------------------------------------------------
# _clean_text / TEXT_REPLACEMENTS
# ---------------------------------------------------------------------------


def test_clean_text_strips_whitespace() -> None:
    assert _clean_text("  hello  ") == "hello"


def test_clean_text_replaces_em_and_en_dashes() -> None:
    # — (em dash) and – (en dash) → hyphen.
    assert _clean_text("alpha—beta") == "alpha-beta"
    assert _clean_text("alpha–beta") == "alpha-beta"


def test_clean_text_replaces_mojibake_quotes() -> None:
    assert _clean_text("itâ€™s") == "it's"
    assert _clean_text("â€œquotedâ€") == '"quoted"'


def test_clean_text_replaces_mojibake_inequalities() -> None:
    assert _clean_text("score â‰¥ 5") == "score >= 5"
    assert _clean_text("score â‰¤ 3") == "score <= 3"


def test_clean_text_drops_stray_a_circumflex() -> None:
    # The bare "Â" is a common mojibake artefact when UTF-8 NBSP is
    # double-decoded; the loader strips it entirely.
    assert _clean_text("ÂHello") == "Hello"


def test_text_replacements_table_is_complete() -> None:
    # Locks the public mapping so reordering or accidental key removal
    # surfaces as a test failure rather than silent behaviour drift.
    assert TEXT_REPLACEMENTS["—"] == "-"
    assert TEXT_REPLACEMENTS["–"] == "-"
    assert TEXT_REPLACEMENTS["â€”"] == "-"
    assert TEXT_REPLACEMENTS["â€“"] == "-"
    assert TEXT_REPLACEMENTS["â‰¥"] == ">="
    assert TEXT_REPLACEMENTS["â‰¤"] == "<="
    assert TEXT_REPLACEMENTS["â€™"] == "'"
    assert TEXT_REPLACEMENTS["â€˜"] == "'"
    assert TEXT_REPLACEMENTS["â€œ"] == '"'
    assert TEXT_REPLACEMENTS["â€"] == '"'
    assert TEXT_REPLACEMENTS["â€¢"] == "-"
    assert TEXT_REPLACEMENTS["Â"] == ""


# ---------------------------------------------------------------------------
# _read_csv_records
# ---------------------------------------------------------------------------


@pytest.fixture()
def small_csv(tmp_path: Path) -> Path:
    path = tmp_path / "sample.csv"
    path.write_text(
        "id,name,note\n"
        "C-1,Alpha, hello \n"
        "C-2,Beta,it’s fine\n",
        encoding="utf-8",
    )
    return path


def test_read_csv_records_returns_cleaned_dicts(small_csv: Path) -> None:
    rows = _read_csv_records(small_csv)
    assert rows == [
        {"id": "C-1", "name": "Alpha", "note": "hello"},
        # ’ (curly apostrophe) is not in TEXT_REPLACEMENTS — only its
        # mojibake double-encoded form â€™ is. So the row text is left
        # alone except for whitespace stripping.
        {"id": "C-2", "name": "Beta", "note": "it’s fine"},
    ]


def test_read_csv_records_handles_utf8_bom(tmp_path: Path) -> None:
    # Excel-exported CSVs start with a UTF-8 BOM; the loader must use
    # utf-8-sig so the first column header is "id" not "﻿id".
    path = tmp_path / "with_bom.csv"
    path.write_bytes("﻿id,name\nC-9,Gamma\n".encode("utf-8"))
    rows = _read_csv_records(path)
    assert rows == [{"id": "C-9", "name": "Gamma"}]


def test_read_csv_records_normalizes_mojibake(tmp_path: Path) -> None:
    path = tmp_path / "mojibake.csv"
    path.write_text(
        "id,note\nC-3,scoreâ‰¥5\nC-4,alpha—beta\n",
        encoding="utf-8",
    )
    rows = _read_csv_records(path)
    assert rows == [
        {"id": "C-3", "note": "score>=5"},
        {"id": "C-4", "note": "alpha-beta"},
    ]


def test_read_csv_records_returns_empty_for_header_only(tmp_path: Path) -> None:
    path = tmp_path / "empty.csv"
    path.write_text("id,name\n", encoding="utf-8")
    assert _read_csv_records(path) == []


# ---------------------------------------------------------------------------
# _csv_reader (lazy/streaming contract)
# ---------------------------------------------------------------------------


def test_csv_reader_is_lazy_and_returns_handle(tmp_path: Path) -> None:
    path = tmp_path / "stream.csv"
    path.write_text("id,score\n1,9\n2,8\n3,7\n", encoding="utf-8")

    handle, reader = _csv_reader(path)
    try:
        assert not handle.closed
        first = next(reader)
        assert first == {"id": "1", "score": "9"}
        # Caller controls iteration — pulling the next row works.
        second = next(reader)
        assert second == {"id": "2", "score": "8"}
    finally:
        handle.close()
    assert handle.closed


def test_csv_reader_yields_all_rows(tmp_path: Path) -> None:
    path = tmp_path / "stream2.csv"
    path.write_text("id\nA\nB\nC\n", encoding="utf-8")
    handle, reader = _csv_reader(path)
    try:
        rows = list(reader)
    finally:
        handle.close()
    assert [row["id"] for row in rows] == ["A", "B", "C"]
