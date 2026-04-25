"""Tests for the placeholders check."""

from __future__ import annotations

from deepsynaps_qa.checks.placeholders import PlaceholdersCheck
from deepsynaps_qa.models import Artifact, CheckSeverity


def test_golden_mri_no_placeholders(golden_mri, mri_spec):
    check = PlaceholdersCheck()
    results = check.run(golden_mri, mri_spec)
    blocks = [r for r in results if not r.passed and r.severity == CheckSeverity.BLOCK]
    assert len(blocks) == 0


def test_todo_placeholder_detected(broken_placeholder_mri, mri_spec):
    check = PlaceholdersCheck()
    results = check.run(broken_placeholder_mri, mri_spec)
    blocks = [r for r in results if r.check_id == "placeholders.detected" and not r.passed]
    assert len(blocks) >= 1


def test_tbd_detected(mri_spec):
    art = Artifact(
        artifact_id="test:tbd",
        artifact_type="mri_report",
        content="Results are TBD pending further analysis.",
    )
    check = PlaceholdersCheck()
    results = check.run(art, mri_spec)
    blocks = [r for r in results if r.check_id == "placeholders.detected" and not r.passed]
    assert len(blocks) == 1


def test_lorem_ipsum_detected(mri_spec):
    art = Artifact(
        artifact_id="test:lorem",
        artifact_type="mri_report",
        content="Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
    )
    check = PlaceholdersCheck()
    results = check.run(art, mri_spec)
    blocks = [r for r in results if r.check_id == "placeholders.detected" and not r.passed]
    assert len(blocks) == 1
