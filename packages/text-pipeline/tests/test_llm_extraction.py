"""LLM extraction framework — mocked client, no real API calls."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import pytest

from deepsynaps_text.ingestion import import_clinical_text
from deepsynaps_text.llm_extraction import LlmClient, benchmark_llm_extractors, run_llm_extraction_task
from deepsynaps_text.schemas import (
    LLMExtractionTaskBenchmarkRow,
    LLMExtractionTaskConfig,
)


def _doc(text: str) -> Any:
    return import_clinical_text(
        text,
        patient_ref="p1",
        encounter_ref="e1",
        channel="note",
        created_at=datetime(2024, 3, 1, tzinfo=timezone.utc),
    )


_SIMPLE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "items": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["summary", "items"],
    "additionalProperties": False,
}


def test_run_extraction_success() -> None:
    class GoodClient(LlmClient):
        def complete(
            self, prompt: str, *, model: str, temperature: float | None = None
        ) -> str:
            assert "EXTRACT" in prompt
            assert "doc-oid" in prompt or "synthetic" in prompt.lower()
            return json.dumps({"summary": "ok", "items": ["a", "b"]})

    task = LLMExtractionTaskConfig(
        task_id="t1",
        target_model="test-model",
        prompt_template="EXTRACT\n{document_id}\n{clinical_text}\n",
        input_fields=["document_id", "clinical_text"],
        output_json_schema=_SIMPLE_SCHEMA,
        max_retries=0,
    )
    d = _doc("synthetic clinical line")
    r = run_llm_extraction_task(task, d, client=GoodClient())
    assert r.success
    assert r.parsed_output == {"summary": "ok", "items": ["a", "b"]}
    assert r.parse_error is None
    assert r.schema_validation_errors == []


def test_parse_failure_then_retry() -> None:
    calls: list[int] = []

    class FlakyClient(LlmClient):
        def complete(
            self, prompt: str, *, model: str, temperature: float | None = None
        ) -> str:
            calls.append(1)
            if len(calls) == 1:
                return "not json"
            return json.dumps({"summary": "fixed", "items": ["x"]})

    task = LLMExtractionTaskConfig(
        task_id="t_retry",
        target_model="m",
        prompt_template="{clinical_text}",
        input_fields=["clinical_text"],
        output_json_schema=_SIMPLE_SCHEMA,
        max_retries=2,
    )
    r = run_llm_extraction_task(task, _doc("x"), client=FlakyClient())
    assert r.success
    assert len(calls) == 2
    assert "parse_retry" in r.qc_notes
    assert "recovered_after_retry" in r.qc_notes


def test_schema_validation_fails() -> None:
    class BadJsonClient(LlmClient):
        def complete(
            self, prompt: str, *, model: str, temperature: float | None = None
        ) -> str:
            return json.dumps({"summary": 123, "items": "nope"})  # type: ignore[dict-item]

    task = LLMExtractionTaskConfig(
        task_id="t_bad",
        target_model="m",
        prompt_template="{clinical_text}",
        input_fields=["clinical_text"],
        output_json_schema=_SIMPLE_SCHEMA,
        max_retries=0,
    )
    r = run_llm_extraction_task(task, _doc("x"), client=BadJsonClient())
    assert not r.success
    assert r.parsed_output is None
    assert r.schema_validation_errors or r.parse_error


def test_client_exception_handled() -> None:
    class BoomClient(LlmClient):
        def complete(
            self, prompt: str, *, model: str, temperature: float | None = None
        ) -> str:
            raise RuntimeError("network down")

    task = LLMExtractionTaskConfig(
        task_id="t_boom",
        target_model="m",
        prompt_template="{clinical_text}",
        input_fields=["clinical_text"],
        output_json_schema=_SIMPLE_SCHEMA,
    )
    r = run_llm_extraction_task(task, _doc("x"), client=BoomClient())
    assert not r.success
    assert r.parse_error and "client_error" in r.parse_error
    assert "client_exception" in r.qc_notes


def test_unknown_input_field_errors() -> None:
    class NeverCalled(LlmClient):
        def complete(
            self, prompt: str, *, model: str, temperature: float | None = None
        ) -> str:
            raise AssertionError("client should not run when template context fails")

    task = LLMExtractionTaskConfig(
        task_id="t_fields",
        target_model="m",
        prompt_template="{nope}",
        input_fields=["nope"],
        output_json_schema=_SIMPLE_SCHEMA,
    )
    with pytest.raises(ValueError, match="unknown input_fields"):
        run_llm_extraction_task(task, _doc("x"), client=NeverCalled())


def test_benchmark_llm_extractors() -> None:
    class CountingClient(LlmClient):
        def __init__(self) -> None:
            self.n = 0

        def complete(
            self, prompt: str, *, model: str, temperature: float | None = None
        ) -> str:
            self.n += 1
            return json.dumps({"summary": "s", "items": []})

    t1 = LLMExtractionTaskConfig(
        task_id="A",
        target_model="m",
        prompt_template="{clinical_text}",
        input_fields=["clinical_text"],
        output_json_schema=_SIMPLE_SCHEMA,
        max_retries=0,
    )
    t2 = LLMExtractionTaskConfig(
        task_id="B",
        target_model="m2",
        prompt_template="{document_id}{clinical_text}",
        input_fields=["document_id", "clinical_text"],
        output_json_schema=_SIMPLE_SCHEMA,
        max_retries=0,
    )
    docs = [_doc("one"), _doc("two")]
    c = CountingClient()
    bench = benchmark_llm_extractors([t1, t2], docs, client=c)
    assert bench.total_runs == 4
    assert bench.successful_runs == 4
    assert bench.failed_runs == 0
    assert c.n == 4
    by_id = {r.task_id: r for r in bench.per_task}
    assert by_id["A"].runs == 2
    assert by_id["B"].runs == 2
    assert all(isinstance(x, LLMExtractionTaskBenchmarkRow) for x in bench.per_task)
