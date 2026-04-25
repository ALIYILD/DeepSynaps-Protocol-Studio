"""Shared pytest fixtures for deepsynaps_qa tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from deepsynaps_qa.models import Artifact, QASpec
from deepsynaps_qa.specs.brain_twin_summary import BRAIN_TWIN_SUMMARY_SPEC
from deepsynaps_qa.specs.mri_report import MRI_REPORT_SPEC
from deepsynaps_qa.specs.protocol_draft import PROTOCOL_DRAFT_SPEC
from deepsynaps_qa.specs.qeeg_narrative import QEEG_NARRATIVE_SPEC

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load_artifact(name: str) -> Artifact:
    path = FIXTURES_DIR / name
    data = json.loads(path.read_text(encoding="utf-8"))
    return Artifact(**data)


# ── Golden artifacts (expected: PASS) ───────────────────────────────────────

@pytest.fixture
def golden_qeeg() -> Artifact:
    return _load_artifact("golden_qeeg_narrative.json")


@pytest.fixture
def golden_mri() -> Artifact:
    return _load_artifact("golden_mri_report.json")


@pytest.fixture
def golden_protocol() -> Artifact:
    return _load_artifact("golden_protocol_draft.json")


@pytest.fixture
def golden_bts() -> Artifact:
    return _load_artifact("golden_brain_twin_summary.json")


# ── Broken artifacts (expected: FAIL) ──────────────────────────────────────

@pytest.fixture
def broken_sections_qeeg() -> Artifact:
    return _load_artifact("broken_sections_qeeg.json")


@pytest.fixture
def broken_citations_protocol() -> Artifact:
    return _load_artifact("broken_citations_protocol.json")


@pytest.fixture
def broken_language_protocol() -> Artifact:
    return _load_artifact("broken_language_protocol.json")


@pytest.fixture
def broken_banned_bts() -> Artifact:
    return _load_artifact("broken_banned_bts.json")


@pytest.fixture
def broken_placeholder_mri() -> Artifact:
    return _load_artifact("broken_placeholder_mri.json")


@pytest.fixture
def broken_redaction_bts() -> Artifact:
    return _load_artifact("broken_redaction_bts.json")


# ── Specs ──────────────────────────────────────────────────────────────────

@pytest.fixture
def qeeg_spec() -> QASpec:
    return QEEG_NARRATIVE_SPEC


@pytest.fixture
def mri_spec() -> QASpec:
    return MRI_REPORT_SPEC


@pytest.fixture
def protocol_spec() -> QASpec:
    return PROTOCOL_DRAFT_SPEC


@pytest.fixture
def bts_spec() -> QASpec:
    return BRAIN_TWIN_SUMMARY_SPEC
