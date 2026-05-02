"""Assemble UI-ready clinical text report payloads and longitudinal summaries."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Sequence

from deepsynaps_text.pipeline_hashes import canonical_clinical_body, sha256_hex
from deepsynaps_text.pipeline_versions import package_version
from deepsynaps_text.schemas import (
    ActionItem,
    ClinicalEntityExtractionResult,
    ClinicalTextDocument,
    ClinicalTextReportPayload,
    CodedEntityExtractionResult,
    LongitudinalEncounterRef,
    LongitudinalTextSummaryPayload,
    MessageIntentLabel,
    MessageUrgencyLabel,
    MessagingReportSection,
    NeuromodulationHistory,
    NeuromodulationParameters,
    NeuromodulationReportSection,
    NeuromodulationRiskProfile,
)


def generate_clinical_text_report_payload(
    doc: ClinicalTextDocument,
    *,
    entities: ClinicalEntityExtractionResult | None = None,
    coded_entities: CodedEntityExtractionResult | None = None,
    neuromod_profile: NeuromodulationHistory | None = None,
    neuromod_params: NeuromodulationParameters | None = None,
    neuromod_risks: NeuromodulationRiskProfile | None = None,
    message_intent: MessageIntentLabel | None = None,
    message_urgency: MessageUrgencyLabel | None = None,
    action_items: list[ActionItem] | None = None,
    pipeline_run_id: str | None = None,
    content_sha256: str | None = None,
    package_version_label: str | None = None,
) -> ClinicalTextReportPayload:
    """
    Merge pipeline outputs into a single payload for Studio UI / downstream APIs.

    Neuromodulation and messaging sections are omitted when no inputs are provided.
    """
    meta = doc.metadata
    nm_section = None
    if (
        neuromod_profile is not None
        or neuromod_params is not None
        or neuromod_risks is not None
    ):
        nm_section = NeuromodulationReportSection(
            history=neuromod_profile,
            parameters=neuromod_params,
            risks=neuromod_risks,
        )

    msg_section = None
    if (
        message_intent is not None
        or message_urgency is not None
        or (action_items is not None and len(action_items) > 0)
    ):
        msg_section = MessagingReportSection(
            intent=message_intent,
            urgency=message_urgency,
            action_items=list(action_items or []),
        )

    body = canonical_clinical_body(doc)
    ch = content_sha256 if content_sha256 is not None else sha256_hex(body)
    pkg = package_version_label if package_version_label is not None else package_version()
    return ClinicalTextReportPayload(
        document_id=doc.id,
        content_sha256=ch,
        package_version=pkg,
        channel=meta.channel,
        patient_ref=meta.patient_ref,
        encounter_ref=meta.encounter_ref,
        document_ingested_at=meta.ingested_at,
        entities=entities,
        coded_entities=coded_entities,
        neuromodulation=nm_section,
        messaging=msg_section,
        pipeline_run_id=pipeline_run_id,
        generated_at=datetime.now(timezone.utc),
    )


def generate_longitudinal_text_summary(
    patient_id: str,
    reports: Sequence[ClinicalTextReportPayload],
) -> LongitudinalTextSummaryPayload:
    """Aggregate counts and light longitudinal signals across prior report payloads."""
    now = datetime.now(timezone.utc)
    if not reports:
        return LongitudinalTextSummaryPayload(
            patient_id=patient_id,
            report_count=0,
            by_channel={},
            timeline=[],
            distinct_neuromod_modalities=[],
            messaging_high_urgency_events=0,
            generated_at=now,
        )

    by_ch = Counter(r.channel for r in reports)
    timeline = [
        LongitudinalEncounterRef(
            document_id=r.document_id,
            channel=r.channel,
            ingested_at=r.document_ingested_at,
            encounter_ref=r.encounter_ref,
        )
        for r in sorted(
            reports,
            key=lambda x: x.document_ingested_at or datetime.min.replace(tzinfo=timezone.utc),
        )
    ]

    modalities: set[str] = set()
    for r in reports:
        if r.neuromodulation and r.neuromodulation.history:
            modalities.update(r.neuromodulation.history.modalities_seen)

    high_urg = 0
    for r in reports:
        if r.messaging and r.messaging.urgency and r.messaging.urgency.level == "high":
            high_urg += 1

    return LongitudinalTextSummaryPayload(
        patient_id=patient_id,
        report_count=len(reports),
        by_channel=dict(by_ch),
        timeline=timeline,
        distinct_neuromod_modalities=sorted(modalities),
        messaging_high_urgency_events=high_urg,
        generated_at=now,
    )
