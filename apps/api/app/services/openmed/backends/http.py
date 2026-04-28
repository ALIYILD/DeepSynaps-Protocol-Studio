"""HTTP backend that calls a real OpenMed REST service.

Activated when ``OPENMED_BASE_URL`` is set in the environment. The
service is expected to expose:
  GET  /health
  POST /analyze            {text} -> {entities, pii, summary?}
  POST /pii/extract        {text} -> {pii}
  POST /pii/deidentify     {text} -> {redacted_text, replacements}

If the upstream returns a shape we don't recognise we fall back to the
heuristic backend so the caller never sees a 5xx because of an
adapter-level mismatch.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from . import heuristic
from ..schemas import (
    AnalyzeResponse,
    ClinicalTextInput,
    DeidentifyResponse,
    ExtractedClinicalEntity,
    HealthResponse,
    PIIEntity,
    PIIExtractResponse,
    TextSpan,
)

_log = logging.getLogger(__name__)

_TIMEOUT_S = float(os.getenv("OPENMED_TIMEOUT_S", "8"))


def _base_url() -> str | None:
    raw = os.getenv("OPENMED_BASE_URL")
    if not raw:
        return None
    return raw.rstrip("/")


def _client() -> httpx.Client:
    headers: dict[str, str] = {"User-Agent": "deepsynaps-openmed-adapter/1.0"}
    if (token := os.getenv("OPENMED_API_KEY")):
        headers["Authorization"] = f"Bearer {token}"
    return httpx.Client(timeout=_TIMEOUT_S, headers=headers)


def _post(path: str, body: dict[str, Any]) -> dict[str, Any] | None:
    base = _base_url()
    if not base:
        return None
    try:
        with _client() as c:
            resp = c.post(f"{base}{path}", json=body)
        if resp.status_code != 200:
            _log.warning("OpenMed %s %s -> %s", base, path, resp.status_code)
            return None
        data = resp.json()
        return data if isinstance(data, dict) else None
    except (httpx.HTTPError, ValueError) as exc:
        _log.warning("OpenMed %s call failed: %s", path, exc)
        return None


def _coerce_entities(raw: list[Any]) -> list[ExtractedClinicalEntity]:
    out: list[ExtractedClinicalEntity] = []
    for r in raw or []:
        if not isinstance(r, dict):
            continue
        label = str(r.get("label") or r.get("entity") or r.get("type") or "other").lower()
        if label not in {"diagnosis", "symptom", "medication", "procedure", "lab",
                         "anatomy", "vital", "risk_factor", "allergy", "device", "other"}:
            label = "other"
        try:
            start = int(r.get("start", r.get("span", {}).get("start", 0)))
            end = int(r.get("end", r.get("span", {}).get("end", 0)))
        except (TypeError, ValueError):
            continue
        text = str(r.get("text", r.get("matched_text", "")))
        if not text:
            continue
        out.append(
            ExtractedClinicalEntity(
                label=label,  # type: ignore[arg-type]
                text=text,
                span=TextSpan(start=start, end=end),
                normalised=str(r.get("normalised") or r.get("canonical") or text).lower().strip() or None,
                confidence=float(r.get("confidence", r.get("score", 0.0)) or 0.0),
                source="openmed",
            )
        )
    return out


def _coerce_pii(raw: list[Any]) -> list[PIIEntity]:
    out: list[PIIEntity] = []
    for r in raw or []:
        if not isinstance(r, dict):
            continue
        label = str(r.get("label") or r.get("entity") or r.get("type") or "other_pii").lower()
        if label not in {"person_name", "date", "mrn", "phone", "email", "address",
                         "id_number", "url", "ssn", "ip_address", "other_pii"}:
            label = "other_pii"
        try:
            start = int(r.get("start", r.get("span", {}).get("start", 0)))
            end = int(r.get("end", r.get("span", {}).get("end", 0)))
        except (TypeError, ValueError):
            continue
        text = str(r.get("text", r.get("matched_text", "")))
        if not text:
            continue
        out.append(
            PIIEntity(
                label=label,  # type: ignore[arg-type]
                text=text,
                span=TextSpan(start=start, end=end),
                confidence=float(r.get("confidence", r.get("score", 0.0)) or 0.0),
            )
        )
    return out


def analyze(payload: ClinicalTextInput) -> AnalyzeResponse:
    data = _post("/analyze", {"text": payload.text, "source_type": payload.source_type})
    if data is None:
        return heuristic.analyze(payload)
    return AnalyzeResponse(
        backend="openmed_http",
        entities=_coerce_entities(data.get("entities") or []),
        pii=_coerce_pii(data.get("pii") or []),
        summary=str(data.get("summary") or "")[:2000],
        char_count=payload.length,
    )


def extract_pii(payload: ClinicalTextInput) -> PIIExtractResponse:
    data = _post("/pii/extract", {"text": payload.text})
    if data is None:
        return heuristic.extract_pii(payload)
    return PIIExtractResponse(backend="openmed_http", pii=_coerce_pii(data.get("pii") or []))


def deidentify(payload: ClinicalTextInput) -> DeidentifyResponse:
    data = _post("/pii/deidentify", {"text": payload.text})
    if data is None:
        return heuristic.deidentify(payload)
    redacted = data.get("redacted_text")
    if not isinstance(redacted, str) or not redacted:
        return heuristic.deidentify(payload)
    return DeidentifyResponse(
        backend="openmed_http",
        redacted_text=redacted,
        replacements=_coerce_pii(data.get("replacements") or []),
    )


def health() -> HealthResponse:
    base = _base_url()
    if not base:
        return heuristic.health()
    upstream_ok = False
    try:
        with _client() as c:
            resp = c.get(f"{base}/health")
        upstream_ok = resp.status_code == 200
    except httpx.HTTPError as exc:
        _log.warning("OpenMed /health failed: %s", exc)
    return HealthResponse(
        ok=True,
        backend="openmed_http" if upstream_ok else "heuristic",
        upstream_ok=upstream_ok,
        upstream_url=base,
        note="Upstream healthy." if upstream_ok else "Upstream unreachable; heuristic fallback active.",
    )
