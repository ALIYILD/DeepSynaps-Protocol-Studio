"""
Configurable LLM extraction tasks for clinical text (schema-validated JSON).

Injection point: implement :class:`LlmClient` and pass it to
:func:`run_llm_extraction_task`. No neuromodulation-specific logic — tasks are
data-driven via :class:`~deepsynaps_text.schemas.LLMExtractionTaskConfig`.
"""

from __future__ import annotations

import json
import logging
import re
import time
from abc import ABC, abstractmethod
from typing import Any

from jsonschema import Draft202012Validator
from jsonschema.exceptions import ValidationError

from deepsynaps_text.schemas import (
    ClinicalTextDocument,
    LLMExtractionBenchmarkResult,
    LLMExtractionResult,
    LLMExtractionTaskBenchmarkRow,
    LLMExtractionTaskConfig,
)

logger = logging.getLogger(__name__)


class LlmClient(ABC):
    """Abstract LLM adapter (OpenAI-compatible chat, Anthropic, Azure, etc.)."""

    @abstractmethod
    def complete(
        self,
        prompt: str,
        *,
        model: str,
        temperature: float | None = None,
    ) -> str:
        """Return raw assistant text (caller parses JSON)."""


def _clinical_note_text(doc: ClinicalTextDocument) -> str:
    if doc.normalized_text is not None:
        return doc.normalized_text
    if doc.deidentified_text is not None:
        return doc.deidentified_text
    return doc.raw_text


def _build_template_context(doc: ClinicalTextDocument) -> dict[str, Any]:
    meta = doc.metadata
    body = _clinical_note_text(doc)
    return {
        "document_id": doc.id,
        "raw_text": doc.raw_text,
        "deidentified_text": doc.deidentified_text or "",
        "normalized_text": doc.normalized_text or "",
        "clinical_note_text": body,
        "clinical_text": body,
        "channel": meta.channel,
        "patient_ref": meta.patient_ref or "",
        "encounter_ref": meta.encounter_ref or "",
        "author_role": meta.author_role or "",
    }


def _render_prompt(task: LLMExtractionTaskConfig, doc: ClinicalTextDocument) -> str:
    ctx = _build_template_context(doc)
    allowed = {"document_id", *task.input_fields}
    payload = {k: v for k, v in ctx.items() if k in allowed}
    missing = set(task.input_fields) - set(payload)
    if missing:
        raise ValueError(
            f"Task {task.task_id!r} requests unknown input_fields: {sorted(missing)}.",
        )
    try:
        return task.prompt_template.format(**payload)
    except KeyError as e:
        raise ValueError(
            f"Prompt template for task {task.task_id!r} missing placeholder: {e}",
        ) from e


def _extract_json_object(raw: str) -> dict[str, Any]:
    """Parse first JSON object from model output (strip fences, find braces)."""
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.I)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in model output.")
    depth = 0
    for i in range(start, len(text)):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                chunk = text[start : i + 1]
                data = json.loads(chunk)
                if isinstance(data, dict):
                    return data
                raise ValueError("Top-level JSON value is not an object.")
    raise ValueError("Unbalanced braces in model output.")


def _validate_schema(instance: dict[str, Any], schema: dict[str, Any]) -> list[str]:
    errs: list[str] = []
    try:
        Draft202012Validator(schema).validate(instance)
    except ValidationError as e:
        errs.append(e.message)
    return errs


def run_llm_extraction_task(
    task: LLMExtractionTaskConfig,
    doc: ClinicalTextDocument,
    *,
    client: LlmClient,
) -> LLMExtractionResult:
    """
    Render prompt from ``task`` and ``doc``, call ``client``, validate JSON against schema.

    Retries up to ``task.max_retries`` additional attempts on parse or schema failure
    (same prompt; suitable for non-deterministic models).
    """
    prompt = _render_prompt(task, doc)
    attempts = 0
    last_raw: str | None = None
    last_parse_err: str | None = None
    last_schema_errs: list[str] = []
    qc: list[str] = []
    t0 = time.perf_counter()

    max_attempts = 1 + task.max_retries
    while attempts < max_attempts:
        attempts += 1
        try:
            raw = client.complete(
                prompt,
                model=task.target_model,
                temperature=task.temperature,
            )
        except Exception as e:
            logger.exception("LLM client failure for task %s", task.task_id)
            latency_ms = (time.perf_counter() - t0) * 1000
            return LLMExtractionResult(
                task_id=task.task_id,
                document_id=doc.id,
                target_model=task.target_model,
                success=False,
                parsed_output=None,
                raw_response=None,
                parse_error=f"client_error:{type(e).__name__}",
                schema_validation_errors=[],
                attempts_used=attempts,
                latency_ms=latency_ms,
                qc_notes=["client_exception"],
            )

        last_raw = raw
        try:
            parsed = _extract_json_object(raw)
        except (json.JSONDecodeError, ValueError) as e:
            last_parse_err = str(e)
            qc.append("parse_retry")
            continue

        schema_errs = _validate_schema(parsed, task.output_json_schema)
        if not schema_errs:
            latency_ms = (time.perf_counter() - t0) * 1000
            if any(x.startswith("parse_retry") for x in qc):
                qc.append("recovered_after_retry")
            return LLMExtractionResult(
                task_id=task.task_id,
                document_id=doc.id,
                target_model=task.target_model,
                success=True,
                parsed_output=parsed,
                raw_response=raw[:8000] if raw else None,
                parse_error=None,
                schema_validation_errors=[],
                attempts_used=attempts,
                latency_ms=latency_ms,
                qc_notes=sorted(set(qc)) or ["ok"],
            )

        last_schema_errs = schema_errs
        qc.append("schema_retry")

    latency_ms = (time.perf_counter() - t0) * 1000
    err_parts: list[str] = []
    if last_parse_err:
        err_parts.append(f"parse:{last_parse_err}")
    if last_schema_errs:
        err_parts.extend(last_schema_errs)
    return LLMExtractionResult(
        task_id=task.task_id,
        document_id=doc.id,
        target_model=task.target_model,
        success=False,
        parsed_output=None,
        raw_response=last_raw[:8000] if last_raw else None,
        parse_error="; ".join(err_parts) if err_parts else "unknown_failure",
        schema_validation_errors=last_schema_errs,
        attempts_used=attempts,
        latency_ms=latency_ms,
        qc_notes=sorted(set(qc)) or ["failed"],
    )


def benchmark_llm_extractors(
    tasks: list[LLMExtractionTaskConfig],
    docs: list[ClinicalTextDocument],
    *,
    client: LlmClient,
    max_sample_errors: int = 20,
) -> LLMExtractionBenchmarkResult:
    """
    Run every task against every document (cartesian product).

    Aggregates success counts and mean latency per task.
    """
    total_runs = 0
    successful_runs = 0
    failed_runs = 0
    per_task_stats: dict[str, dict[str, Any]] = {}
    sample_errors: list[str] = []

    for task in tasks:
        per_task_stats[task.task_id] = {
            "runs": 0,
            "successes": 0,
            "failures": 0,
            "latency_sum_ms": 0.0,
            "latency_n": 0,
        }

    for task in tasks:
        for doc in docs:
            total_runs += 1
            res = run_llm_extraction_task(task, doc, client=client)
            st = per_task_stats[task.task_id]
            st["runs"] += 1
            if res.success:
                successful_runs += 1
                st["successes"] += 1
            else:
                failed_runs += 1
                st["failures"] += 1
                if len(sample_errors) < max_sample_errors and res.parse_error:
                    sample_errors.append(
                        f"{task.task_id}/{doc.id}: {res.parse_error}",
                    )
            if res.latency_ms is not None:
                st["latency_sum_ms"] += res.latency_ms
                st["latency_n"] += 1

    rows: list[LLMExtractionTaskBenchmarkRow] = []
    for tid, st in per_task_stats.items():
        avg_lat = None
        if st["latency_n"]:
            avg_lat = st["latency_sum_ms"] / st["latency_n"]
        rows.append(
            LLMExtractionTaskBenchmarkRow(
                task_id=tid,
                runs=st["runs"],
                successes=st["successes"],
                failures=st["failures"],
                avg_latency_ms=avg_lat,
            )
        )

    return LLMExtractionBenchmarkResult(
        total_runs=total_runs,
        successful_runs=successful_runs,
        failed_runs=failed_runs,
        per_task=sorted(rows, key=lambda r: r.task_id),
        sample_errors=sample_errors,
    )
