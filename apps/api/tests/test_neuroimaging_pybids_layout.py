"""PyBIDS layout: build minimal BIDS dataset in tmp_path and query it."""
from __future__ import annotations

import json
import re

import pytest

bids = pytest.importorskip("bids")


def _make_bids(root):
    """Build a minimal valid BIDS dataset at root."""
    desc = {
        "Name": "TestDataset",
        "BIDSVersion": "1.8.0",
    }
    (root / "dataset_description.json").write_text(json.dumps(desc))
    sub_dir = root / "sub-01" / "anat"
    sub_dir.mkdir(parents=True)
    nii_path = sub_dir / "sub-01_T1w.nii.gz"
    # 1-byte placeholder — pybids only needs the file to exist for indexing
    nii_path.write_bytes(b"\x00")


def test_layout_summary(tmp_path):
    from app.services.neuroimaging.pybids_query import open_layout, summarise_layout

    _make_bids(tmp_path)
    layout = open_layout(str(tmp_path))
    summary = summarise_layout(layout)
    assert summary.n_subjects == 1
    assert isinstance(summary.n_sessions, int)
    assert isinstance(summary.modalities, list)
    assert isinstance(summary.validated, bool)


def test_query_files_returns_refs(tmp_path):
    from app.services.neuroimaging.pybids_query import open_layout, query_files

    _make_bids(tmp_path)
    layout = open_layout(str(tmp_path))
    refs = query_files(layout, suffix="T1w")
    assert len(refs) == 1
    ref = refs[0]
    assert ref.suffix == "T1w"
    # subject must be a 12-char hex pseudonym (SHA-256 first 12 hex digits)
    assert ref.subject is not None
    assert len(ref.subject) == 12
    assert re.fullmatch(r"[0-9a-f]{12}", ref.subject)


def test_neuroimaging_pybids_subject_is_hashed():
    """Subject "01" → 12-char hex pseudonym, NOT the literal string "01"."""
    from app.services.neuroimaging.pybids_query import _pseudo_subject

    result = _pseudo_subject("01")
    assert result != "01"
    assert len(result) == 12
    assert re.fullmatch(r"[0-9a-f]{12}", result)
