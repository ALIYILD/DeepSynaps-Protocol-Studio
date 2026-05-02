"""
Clinical text pipeline orchestration: linear stages, artefacts, provenance.

Runs are persisted via :mod:`deepsynaps_text.run_store` (memory by default; JSON
files when ``DEEPSYNAPS_TEXT_PERSIST_RUNS`` and ``DEEPSYNAPS_TEXT_RUN_STORE_DIR`` are set).
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any, Sequence

from deepsynaps_text.coding import auto_code_note, link_entities_to_terminology
from deepsynaps_text.core_nlp import (
    detect_negation_and_assertion,
    detect_temporal_context,
    extract_clinical_entities,
)
from deepsynaps_text.feature_flags import load_text_pipeline_feature_flags
from deepsynaps_text.ingestion import deidentify_text, normalize_note_format
from deepsynaps_text.message_analyzers import (
    classify_message_intent,
    classify_message_urgency,
    extract_action_items_from_message,
)
from deepsynaps_text.neuromodulation_phenotyper import (
    extract_neuromodulation_history,
    extract_neuromodulation_risks_and_contraindications,
    extract_stimulation_parameters,
)
from deepsynaps_text.pipeline_hashes import (
    canonical_clinical_body,
    hash_json_object,
    hash_pipeline_definition,
    sha256_hex,
)
from deepsynaps_text.pipeline_versions import (
    DEID_RULES_VERSION,
    MESSAGE_RULES_VERSION,
    RULE_PACK_VERSION,
    TERMINOLOGY_STUB_VERSION,
    package_version,
)
from deepsynaps_text.reporting import generate_clinical_text_report_payload
from deepsynaps_text.run_store import ensure_run_store_configured, get_run_store
from deepsynaps_text.schemas import (
    ClinicalEntityExtractionResult,
    ClinicalTextDocument,
    CodedEntityExtractionResult,
    NeuromodulationHistory,
    NeuromodulationParameters,
    NeuromodulationRiskProfile,
    PipelineStepKind,
    TextArtifactRecord,
    TextPipelineDefinition,
    TextPipelineNode,
    TextPipelineRun,
)

MESSAGE_CHANNELS = frozenset({"message", "email", "chat"})


def default_text_pipeline_definition() -> TextPipelineDefinition:
    """Built-in linear pipeline: ingestion helpers → NLP → coding → neuromod → messaging → report."""
    nodes = [
        TextPipelineNode(node_id="deid", step="deidentify"),
        TextPipelineNode(node_id="norm", step="normalize_note"),
        TextPipelineNode(node_id="ner", step="extract_entities"),
        TextPipelineNode(node_id="ctx", step="annotate_entities"),
        TextPipelineNode(node_id="code", step="link_terminology"),
        TextPipelineNode(node_id="nm_hist", step="neuromodulation_history"),
        TextPipelineNode(node_id="nm_param", step="neuromodulation_parameters"),
        TextPipelineNode(node_id="nm_risk", step="neuromodulation_risks"),
        TextPipelineNode(node_id="msg_int", step="message_intent"),
        TextPipelineNode(node_id="msg_urg", step="message_urgency"),
        TextPipelineNode(node_id="msg_act", step="message_actions"),
        TextPipelineNode(node_id="report", step="assemble_report"),
    ]
    return TextPipelineDefinition(pipeline_id="default_clinical_text", nodes=nodes)


def _message_source_text(doc: ClinicalTextDocument) -> str:
    if doc.normalized_text is not None:
        return doc.normalized_text
    if doc.deidentified_text is not None:
        return doc.deidentified_text
    return doc.raw_text


def _detail(**extra: Any) -> dict[str, Any]:
    """Merge audit versions into every artefact detail."""
    base = {
        "package_version": package_version(),
        "rule_pack_version": RULE_PACK_VERSION,
    }
    base.update(extra)
    return base


def execute_text_pipeline(
    pipeline_definition: TextPipelineDefinition,
    input_doc: ClinicalTextDocument,
    *,
    reuse_run_id: str | None = None,
    entity_backend: str = "rule",
    terminology_backend: str = "biosyn",
    deid_strategy: str = "mask",
) -> TextPipelineRun:
    """
    Execute enabled nodes in order and attach :class:`ClinicalTextReportPayload`.

    Uses ``rule`` entity extraction and ``biosyn`` stub terminology linking by default
    for deterministic offline runs.
    """
    ensure_run_store_configured()
    flags = load_text_pipeline_feature_flags()
    effective_backend = "rule" if flags.force_rules_entity_backend else entity_backend

    run_id = reuse_run_id or str(uuid.uuid4())
    started = datetime.now(timezone.utc)
    input_body = canonical_clinical_body(input_doc)
    input_hash = sha256_hex(input_body)
    def_hash = hash_pipeline_definition(pipeline_definition)

    run = TextPipelineRun(
        run_id=run_id,
        pipeline_id=pipeline_definition.pipeline_id,
        document_id=input_doc.id,
        package_version=package_version(),
        input_content_sha256=input_hash,
        definition_content_sha256=def_hash,
        feature_flags={
            "rules_only_nlp": flags.force_rules_entity_backend,
            "llm_disabled": flags.disable_llm_tasks,
            "persist_runs": flags.persist_runs_to_disk,
        },
        input_document=input_doc.model_copy(deep=True),
        definition=pipeline_definition.model_copy(deep=True),
        status="running",
        started_at=started,
        artifacts=[],
    )

    working = input_doc.model_copy(deep=True)
    entities: ClinicalEntityExtractionResult | None = None
    coded: CodedEntityExtractionResult | None = None
    nm_hist: NeuromodulationHistory | None = None
    nm_params: NeuromodulationParameters | None = None
    nm_risks: NeuromodulationRiskProfile | None = None
    msg_ctx: dict[str, Any] = {}

    def record(
        node_id: str,
        step: PipelineStepKind,
        ms: float,
        *,
        status: str = "ok",
        detail: dict[str, Any] | None = None,
    ) -> None:
        merged = _detail(**(detail or {}))
        run.artifacts.append(
            TextArtifactRecord(
                run_id=run_id,
                node_id=node_id,
                step=step,
                status=status,  # type: ignore[arg-type]
                duration_ms=ms,
                detail=merged,
            )
        )

    current_node_id = ""
    try:
        for node in pipeline_definition.nodes:
            current_node_id = node.node_id
            if not node.enabled:
                record(node.node_id, node.step, 0.0, status="skipped", detail={"reason": "disabled"})
                continue

            t0 = time.perf_counter()
            step = node.step
            detail: dict[str, Any]

            if step == "deidentify":
                working = deidentify_text(working, strategy=deid_strategy)  # type: ignore[arg-type]
                detail = {"strategy": deid_strategy, "deid_rules_version": DEID_RULES_VERSION}
            elif step == "normalize_note":
                working = normalize_note_format(working)
                detail = {"sections_count": len(working.sections)}
            elif step == "extract_entities":
                entities = extract_clinical_entities(working, backend=effective_backend)
                detail = {
                    "entity_backend": effective_backend,
                    "entity_count": len(entities.entities),
                    "rule_pack_version": RULE_PACK_VERSION,
                }
            elif step == "annotate_entities":
                if entities is None:
                    entities = extract_clinical_entities(working, backend=effective_backend)
                entities = detect_temporal_context(detect_negation_and_assertion(entities))
                detail = {"entity_count": len(entities.entities)}
            elif step == "link_terminology":
                if entities is None:
                    entities = extract_clinical_entities(working, backend=effective_backend)
                    entities = detect_temporal_context(detect_negation_and_assertion(entities))
                coded = link_entities_to_terminology(entities, backend=terminology_backend)
                auto = auto_code_note(coded)
                detail = {
                    "terminology_backend": terminology_backend,
                    "terminology_ruleset": TERMINOLOGY_STUB_VERSION,
                    "coded_entities": len(coded.entities),
                    "auto_code_suggestions": len(auto.suggestions),
                }
            elif step == "neuromodulation_history":
                src = coded if coded is not None else entities
                if src is None:
                    src = extract_clinical_entities(working, backend=effective_backend)
                    src = detect_temporal_context(detect_negation_and_assertion(src))
                nm_hist = extract_neuromodulation_history(src)
                detail = {"modalities": len(nm_hist.modalities_seen)}
            elif step == "neuromodulation_parameters":
                src = coded if coded is not None else entities
                if src is None:
                    src = extract_clinical_entities(working, backend=effective_backend)
                nm_params = extract_stimulation_parameters(src)
                detail = {"has_session_count": nm_params.session_count is not None}
            elif step == "neuromodulation_risks":
                src = coded if coded is not None else entities
                if src is None:
                    src = extract_clinical_entities(working, backend=effective_backend)
                nm_risks = extract_neuromodulation_risks_and_contraindications(src)
                detail = {"risk_notes": len(nm_risks.notes)}
            elif step == "message_intent":
                txt = _message_source_text(working)
                intent = classify_message_intent(txt)
                msg_ctx["intent"] = intent
                detail = {
                    "intent": intent.intent,
                    "message_rules_version": MESSAGE_RULES_VERSION,
                }
            elif step == "message_urgency":
                txt = _message_source_text(working)
                urg = classify_message_urgency(txt)
                msg_ctx["urgency"] = urg
                detail = {
                    "level": urg.level,
                    "message_rules_version": MESSAGE_RULES_VERSION,
                }
            elif step == "message_actions":
                txt = _message_source_text(working)
                acts = extract_action_items_from_message(txt)
                msg_ctx["actions"] = acts
                detail = {
                    "action_count": len(acts),
                    "message_rules_version": MESSAGE_RULES_VERSION,
                }
            elif step == "assemble_report":
                intent = msg_ctx.get("intent")
                urgency = msg_ctx.get("urgency")
                actions = msg_ctx.get("actions")
                if working.metadata.channel not in MESSAGE_CHANNELS:
                    intent = None
                    urgency = None
                    actions = None
                final_body = canonical_clinical_body(working)
                report_hash = sha256_hex(final_body)
                report = generate_clinical_text_report_payload(
                    working,
                    entities=entities,
                    coded_entities=coded,
                    neuromod_profile=nm_hist,
                    neuromod_params=nm_params,
                    neuromod_risks=nm_risks,
                    message_intent=intent,
                    message_urgency=urgency,
                    action_items=actions,
                    pipeline_run_id=run_id,
                    content_sha256=report_hash,
                    package_version_label=package_version(),
                )
                run.report = report
                run.output_report_sha256 = hash_json_object(report.model_dump(mode="json"))
                detail = {"schema_version": report.schema_version}
            else:
                raise ValueError(f"Unknown pipeline step: {step}")

            ms = (time.perf_counter() - t0) * 1000
            record(node.node_id, step, ms, detail=detail)

        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)[:2000]
        run.failed_at_node_id = current_node_id or None
        run.completed_at = datetime.now(timezone.utc)

    final = run.model_copy(deep=True)
    get_run_store().save(final)
    return final


def resume_text_pipeline(run_id: str) -> TextPipelineRun:
    """
    Re-run from stored input + definition (full re-execution).

    For MVP the entire pipeline is executed again with the same inputs.
    """
    ensure_run_store_configured()
    prev = get_run_store().get(run_id)
    if prev is None:
        raise KeyError(f"No pipeline run found for run_id={run_id!r}.")
    if prev.input_document is None or prev.definition is None:
        raise ValueError("Stored run is missing input_document or definition; cannot resume.")
    return execute_text_pipeline(
        prev.definition,
        prev.input_document,
        reuse_run_id=str(uuid.uuid4()),
    )


def collect_text_provenance(run_id: str) -> Sequence[dict[str, Any]]:
    """Return artefact rows as plain dicts for logging / export."""
    ensure_run_store_configured()
    run = get_run_store().get(run_id)
    if run is None:
        raise KeyError(f"No pipeline run found for run_id={run_id!r}.")
    return [a.model_dump(mode="json") for a in run.artifacts]


def get_text_pipeline_run(run_id: str) -> TextPipelineRun | None:
    """Load a full run including report (from active store)."""
    ensure_run_store_configured()
    return get_run_store().get(run_id)
