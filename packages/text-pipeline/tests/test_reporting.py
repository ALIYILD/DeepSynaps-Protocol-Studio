"""Reporting payload assembly tests."""

from __future__ import annotations

from datetime import datetime, timezone

from deepsynaps_text import import_clinical_text, normalize_note_format
from deepsynaps_text.reporting import generate_clinical_text_report_payload, generate_longitudinal_text_summary


def test_generate_clinical_text_report_payload_minimal() -> None:
    doc = import_clinical_text(
        "HPI: Stable.",
        patient_ref="pat-x",
        encounter_ref="enc-y",
        channel="note",
        created_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
    )
    doc = normalize_note_format(doc)
    p = generate_clinical_text_report_payload(doc)
    assert p.document_id == doc.id
    assert p.content_sha256 and len(p.content_sha256) == 64
    assert p.package_version
    assert p.channel == "note"
    assert p.patient_ref == "pat-x"
    assert p.encounter_ref == "enc-y"
    assert p.pipeline_run_id is None
    assert p.messaging is None


def test_longitudinal_summary_aggregation() -> None:
    d1 = import_clinical_text(
        "x",
        patient_ref="pat-z",
        encounter_ref=None,
        channel="message",
    )
    from deepsynaps_text.message_analyzers import classify_message_intent, classify_message_urgency

    r1 = generate_clinical_text_report_payload(
        d1,
        message_intent=classify_message_intent("refill please"),
        message_urgency=classify_message_urgency("urgent chest pain"),
    )
    r2 = generate_clinical_text_report_payload(
        import_clinical_text(
            "y",
            patient_ref="pat-z",
            encounter_ref=None,
            channel="note",
        ),
    )
    summary = generate_longitudinal_text_summary("pat-z", [r1, r2])
    assert summary.report_count == 2
    assert summary.by_channel.get("message") == 1
    assert summary.by_channel.get("note") == 1
    assert summary.messaging_high_urgency_events >= 1
