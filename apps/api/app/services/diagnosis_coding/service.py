"""Category 8 — Diagnosis Coding service logic.

Pure service functions consumed by the FastAPI router. They orchestrate the
ICD-10, SNOMED CT, MeSH, UMLS, and OLS adapters from the knowledge layer,
attach provenance, sanitise warnings, and degrade gracefully when an
adapter (notably UMLS) lacks credentials or upstream connectivity.

Design rules:
- Never assert a diagnosis. Functions return *possible coding matches*.
- Never raise on a partial source failure. Record the failure as a warning
  with a per-source status entry; return what worked.
- No PHI in logs.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple

from app.services.diagnosis_coding.safety import (
    DECISION_SUPPORT_DISCLAIMER,
    ELIGIBILITY_DISCLAIMER,
    NORMALIZATION_DISCLAIMER,
    QUERY_EXPANSION_DISCLAIMER,
    sanitise_warnings,
)

logger = logging.getLogger(__name__)


# Canonical Category 8 source identifiers exposed by the API. Stable strings;
# callers (frontend, downstream services) depend on them.
DIAGNOSIS_CODING_SOURCES: Tuple[str, ...] = (
    "icd10",
    "snomedct",
    "mesh",
    "umls",
    "ols",
)

# Mapping from external/API-friendly name to the adapter-registry key. The
# router accepts either spelling.
SOURCE_TO_ADAPTER_KEY: Dict[str, str] = {
    "icd10": "icd10",
    "ICD-10": "icd10",
    "ICD-10-CM": "icd10",
    "snomedct": "snomedct",
    "snomed": "snomedct",
    "SNOMED": "snomedct",
    "SNOMED CT": "snomedct",
    "mesh": "mesh",
    "MeSH": "mesh",
    "umls": "umls",
    "UMLS": "umls",
    "ols": "ols",
    "OLS": "ols",
}

_ICD10_CODE_RE = re.compile(r"^[A-TV-Z][0-9][0-9AB](?:\.[0-9A-TV-Z]{1,4})?$")
_SNOMED_ID_RE = re.compile(r"^[1-9][0-9]{5,17}$")
_MESH_ID_RE = re.compile(r"^D[0-9]{6,9}$", re.IGNORECASE)
_UMLS_CUI_RE = re.compile(r"^C[0-9]{7}$", re.IGNORECASE)


def detect_coding_system(term: str) -> Optional[str]:
    """Cheap shape-based guess at the source for a free-text token.

    Used only to bias retrieval — every match is still re-verified upstream
    and never used to claim diagnosis. Returns the adapter key (e.g. "icd10")
    or ``None`` if the term doesn't look like a structured code.
    """
    if not term:
        return None
    stripped = term.strip()
    if _ICD10_CODE_RE.match(stripped):
        return "icd10"
    if _SNOMED_ID_RE.match(stripped):
        return "snomedct"
    if _MESH_ID_RE.match(stripped):
        return "mesh"
    if _UMLS_CUI_RE.match(stripped):
        return "umls"
    return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _safe_query(
    adapter: Any,
    query: Dict[str, Any],
    *,
    source_label: str,
    warnings: List[str],
    source_status: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Run fetch → normalize → validate on an adapter without raising.

    Adapter failures are converted into a warning + per-source status entry
    so the caller can still return a useful partial response.
    """
    if adapter is None:
        source_status[source_label] = {
            "status": "missing",
            "available": False,
            "reason": "adapter_not_registered",
        }
        warnings.append(f"{source_label} adapter is not registered.")
        return []

    try:
        if not getattr(adapter, "is_connected", False):
            connected = await adapter.connect()
            label_lower = source_label.lower()
            if not connected and label_lower == "umls":
                source_status[source_label] = {
                    "status": "degraded",
                    "available": False,
                    "reason": "missing_license",
                    "message": (
                        "UMLS adapter requires a UTS API key. "
                        "Set UMLS_API_KEY to enable."
                    ),
                }
                warnings.append(
                    "UMLS terminology is unavailable (license/API key not configured)."
                )
                return []
            if not connected and label_lower == "snomedct":
                source_status[source_label] = {
                    "status": "degraded",
                    "available": False,
                    "reason": "missing_license",
                    "message": (
                        "SNOMED CT adapter requires a licensed Snowstorm endpoint. "
                        "Set SNOMEDCT_SNOWSTORM_URL to enable."
                    ),
                }
                warnings.append(
                    "SNOMED CT terminology is unavailable (no licensed Snowstorm endpoint configured)."
                )
                return []
            if not connected:
                source_status[source_label] = {
                    "status": "down",
                    "available": False,
                    "reason": "connect_failed",
                }
                warnings.append(f"{source_label} upstream is unavailable.")
                return []
    except Exception as exc:  # noqa: BLE001 — degrade, don't raise
        logger.warning("%s connect() failed: %s", source_label, exc)
        source_status[source_label] = {
            "status": "down",
            "available": False,
            "reason": "connect_exception",
        }
        warnings.append(f"{source_label} upstream is unavailable.")
        return []

    try:
        raw = await adapter.fetch(query)
        normalised = await adapter.normalize(raw)
        validated = await adapter.validate(normalised)
        source_status[source_label] = {
            "status": "ok",
            "available": True,
            "matches": len(validated),
        }
        return validated
    except Exception as exc:  # noqa: BLE001
        logger.warning("%s query failed: %s", source_label, exc)
        source_status[source_label] = {
            "status": "down",
            "available": False,
            "reason": "query_failed",
        }
        warnings.append(f"{source_label} query failed; results may be incomplete.")
        return []


def _summary_match(record: Dict[str, Any]) -> Dict[str, Any]:
    """Build a per-match summary, stripping any adapter-private keys."""
    return {
        "source": record.get("source", ""),
        "code": record.get("code", ""),
        "display": record.get("display", ""),
        "coding_system": record.get("coding_system", ""),
        "version": record.get("version", ""),
        "synonyms": list(record.get("synonyms", []) or []),
        "uri": record.get("uri", ""),
        "ontology": record.get("ontology", ""),
        "confidence": record.get("_confidence", "unknown"),
        "provenance": record.get("_provenance", {}),
    }


async def diagnosis_source_status(
    registry_getter: Callable[[], Awaitable[Any]],
) -> Dict[str, Any]:
    """Return a per-source status table for all 5 diagnosis coding sources.

    ``registry_getter`` is awaitable (matching
    ``adapter_bootstrap.get_production_registry``) so the same function is
    usable from FastAPI deps and from unit tests with a fake registry.
    """
    registry = await registry_getter()
    sources: List[Dict[str, Any]] = []
    # Sources that require credentials/license to be healthy. Without
    # credentials they REGISTER but report `degraded` so the API surface
    # makes the gap explicit.
    LICENSE_GATED = {"umls", "snomedct"}
    for key in DIAGNOSIS_CODING_SOURCES:
        adapter = registry.get(key) if hasattr(registry, "get") else None
        license_required = key in LICENSE_GATED
        if adapter is None:
            sources.append(
                {
                    "key": key,
                    "registered": False,
                    "status": "catalogued",
                    "available": False,
                    "license_required": license_required,
                    "reason": "not_registered",
                }
            )
            continue
        has_creds = getattr(adapter, "has_credentials", True)
        if license_required and not has_creds:
            status_str = "degraded"
            available = False
            reason = "missing_license"
        else:
            status_str = "registered"
            available = True
            reason = None
        sources.append(
            {
                "key": key,
                "registered": True,
                "status": status_str,
                "available": available,
                "license_required": license_required,
                "reason": reason,
                "source_name": getattr(adapter, "source_name", key),
                "version": getattr(adapter, "source_version", "unknown"),
            }
        )
    return {
        "category": "diagnosis_coding",
        "expected_total": len(DIAGNOSIS_CODING_SOURCES),
        "sources": sources,
        "decision_support_disclaimer": DECISION_SUPPORT_DISCLAIMER,
        "generated_at": _now_iso(),
    }


async def normalize_diagnosis(
    *,
    registry_getter: Callable[[], Awaitable[Any]],
    term: str,
    coding_system: Optional[str] = None,
    patient_id: Optional[str] = None,
    limit: int = 10,
) -> Dict[str, Any]:
    """Normalise a free-text term or diagnosis code into matches across the
    Category 8 sources. Always returns provenance and disclaimers.

    NOTE: ``patient_id`` is accepted so downstream audit logs can correlate
    queries, but this function never reads or writes the patient record.
    """
    term = (term or "").strip()
    warnings: List[str] = []
    source_status: Dict[str, Dict[str, Any]] = {}

    if not term:
        return {
            "input_term": term,
            "input_coding_system": coding_system,
            "patient_id": patient_id,
            "detected_coding_system": None,
            "matches_by_source": {k: [] for k in DIAGNOSIS_CODING_SOURCES},
            "matches": [],
            "source_status": source_status,
            "warnings": sanitise_warnings(["Empty input term — no normalization possible."]),
            "decision_support_disclaimer": NORMALIZATION_DISCLAIMER,
            "generated_at": _now_iso(),
        }

    detected = detect_coding_system(term)
    registry = await registry_getter()

    targets: Sequence[str]
    if coding_system:
        key = SOURCE_TO_ADAPTER_KEY.get(coding_system, coding_system.lower())
        if key not in DIAGNOSIS_CODING_SOURCES:
            warnings.append(
                f"Unknown coding_system hint '{coding_system}' — falling back to all sources."
            )
            targets = DIAGNOSIS_CODING_SOURCES
        else:
            targets = (key,) + tuple(s for s in DIAGNOSIS_CODING_SOURCES if s != key)
    elif detected:
        targets = (detected,) + tuple(s for s in DIAGNOSIS_CODING_SOURCES if s != detected)
    else:
        targets = DIAGNOSIS_CODING_SOURCES

    matches_by_source: Dict[str, List[Dict[str, Any]]] = {
        k: [] for k in DIAGNOSIS_CODING_SOURCES
    }
    flat_matches: List[Dict[str, Any]] = []

    for key in targets:
        adapter = registry.get(key) if hasattr(registry, "get") else None
        if adapter is None:
            source_status[key] = {
                "status": "missing",
                "available": False,
                "reason": "adapter_not_registered",
            }
            warnings.append(f"{key} adapter is not registered.")
            continue

        query: Dict[str, Any] = {"limit": int(max(1, min(limit, 50)))}
        if key == "mesh":
            query["label"] = term
        elif key == "umls":
            query["string"] = term
        elif key == "ols":
            query["q"] = term
        else:
            query["terms"] = term

        records = await _safe_query(
            adapter,
            query,
            source_label=key,
            warnings=warnings,
            source_status=source_status,
        )
        summaries = [_summary_match(r) for r in records[:limit] if r.get("code")]
        matches_by_source[key] = summaries
        flat_matches.extend(summaries)

    return {
        "input_term": term,
        "input_coding_system": coding_system,
        "patient_id": patient_id,
        "detected_coding_system": detected,
        "matches_by_source": matches_by_source,
        "matches": flat_matches,
        "source_status": source_status,
        "warnings": sanitise_warnings(warnings),
        "decision_support_disclaimer": NORMALIZATION_DISCLAIMER,
        "generated_at": _now_iso(),
    }


async def query_expansion(
    *,
    registry_getter: Callable[[], Awaitable[Any]],
    condition: str,
    target_workflow: Optional[str] = None,
    coding_context: Optional[Dict[str, Any]] = None,
    limit: int = 10,
) -> Dict[str, Any]:
    """Expand a condition into safe terms/synonyms across the Category 8
    sources. Surfaces what's source-backed vs. unsupported so downstream
    evidence search doesn't silently fabricate terms.
    """
    condition = (condition or "").strip()
    warnings: List[str] = []
    source_status: Dict[str, Dict[str, Any]] = {}

    if not condition:
        return {
            "condition": condition,
            "target_workflow": target_workflow,
            "coding_context": coding_context or {},
            "normalized_terms": [],
            "synonyms": [],
            "mappings": {k: [] for k in DIAGNOSIS_CODING_SOURCES},
            "evidence_search_terms": [],
            "source_status": source_status,
            "warnings": sanitise_warnings(["Empty condition — no expansion possible."]),
            "decision_support_disclaimer": QUERY_EXPANSION_DISCLAIMER,
            "generated_at": _now_iso(),
        }

    normalized = await normalize_diagnosis(
        registry_getter=registry_getter,
        term=condition,
        limit=limit,
    )
    matches_by_source = normalized["matches_by_source"]
    source_status = normalized["source_status"]
    warnings.extend(normalized["warnings"])

    normalized_terms: List[str] = []
    synonyms: List[str] = []
    mappings: Dict[str, List[Dict[str, Any]]] = {
        k: [] for k in DIAGNOSIS_CODING_SOURCES
    }

    for src, recs in matches_by_source.items():
        for rec in recs:
            display = rec.get("display", "").strip()
            if display:
                normalized_terms.append(display)
            for syn in rec.get("synonyms", []) or []:
                if isinstance(syn, str) and syn:
                    synonyms.append(syn)
            mappings[src].append(
                {
                    "code": rec.get("code", ""),
                    "display": display,
                    "coding_system": rec.get("coding_system", ""),
                    "uri": rec.get("uri", ""),
                    "ontology": rec.get("ontology", ""),
                    "provenance": rec.get("provenance", {}),
                }
            )

    seen: set = set()
    deduped_terms: List[str] = []
    for token in [condition] + normalized_terms + synonyms:
        token_clean = token.strip()
        token_key = token_clean.lower()
        if not token_clean or token_key in seen:
            continue
        seen.add(token_key)
        deduped_terms.append(token_clean)

    evidence_search_terms = deduped_terms[: max(limit * 2, 10)]

    if not any(mappings.values()):
        warnings.append(
            "No source-backed mappings returned — evidence search will use the "
            "original condition string unchanged."
        )

    return {
        "condition": condition,
        "target_workflow": target_workflow,
        "coding_context": coding_context or {},
        "normalized_terms": deduped_terms,
        "synonyms": sorted(set(synonyms)),
        "mappings": mappings,
        "evidence_search_terms": evidence_search_terms,
        "source_status": source_status,
        "warnings": sanitise_warnings(warnings),
        "decision_support_disclaimer": QUERY_EXPANSION_DISCLAIMER,
        "generated_at": _now_iso(),
    }


async def eligibility_context(
    *,
    registry_getter: Callable[[], Awaitable[Any]],
    diagnosis_code: str,
    modality: Optional[str] = None,
    jurisdiction: Optional[str] = None,
    payer: Optional[str] = None,
    limit: int = 5,
) -> Dict[str, Any]:
    """Return cautious eligibility *context* for a coded diagnosis + modality.

    This is deliberately not an eligibility decision. The response surfaces
    coding matches, any source-backed indication context the adapters return,
    missing sources, and a strong disclaimer. The router must NEVER use
    language like "eligible", "covered", or "approved" in this output.
    """
    diagnosis_code = (diagnosis_code or "").strip()
    warnings: List[str] = []
    if not diagnosis_code:
        return {
            "diagnosis_code": diagnosis_code,
            "modality": modality,
            "jurisdiction": jurisdiction,
            "payer": payer,
            "coding_match": None,
            "possible_indication_context": [],
            "required_evidence_references": [],
            "missing_sources": list(DIAGNOSIS_CODING_SOURCES),
            "status": "missing_input",
            "coverage_determined": False,
            "warnings": sanitise_warnings(
                ["No diagnosis_code provided — eligibility context cannot be computed."]
            ),
            "decision_support_disclaimer": ELIGIBILITY_DISCLAIMER,
            "generated_at": _now_iso(),
        }

    normalized = await normalize_diagnosis(
        registry_getter=registry_getter,
        term=diagnosis_code,
        limit=limit,
    )
    source_status = normalized["source_status"]
    matches_by_source = normalized["matches_by_source"]
    warnings.extend(normalized["warnings"])

    coding_match: Optional[Dict[str, Any]] = None
    for preferred in ("icd10", "snomedct", "mesh", "umls", "ols"):
        if matches_by_source.get(preferred):
            coding_match = matches_by_source[preferred][0]
            break

    missing_sources = [
        key
        for key in DIAGNOSIS_CODING_SOURCES
        if source_status.get(key, {}).get("available", False) is False
    ]
    if missing_sources:
        warnings.append(
            "Some terminology sources are unavailable; eligibility context is "
            "based on a partial coding lookup only."
        )

    if modality:
        warnings.append(
            f"Modality '{modality}' may have jurisdiction- and payer-specific "
            "indication requirements not represented in this response."
        )
    if jurisdiction:
        warnings.append(
            f"Jurisdiction '{jurisdiction}' coverage rules are not embedded in "
            "this service — consult local payer policies."
        )
    if payer:
        warnings.append(
            f"Payer '{payer}' policies are not modelled here; coverage is not "
            "determined by this service."
        )

    # Curated indication-rule lookup. Imported here to avoid a top-of-file
    # import cycle and to keep the loader lazy when tests reload the
    # YAML fixture.
    from app.services.diagnosis_coding.indication_rules import (
        evidence_references_for,
        match_rules,
    )

    matched_rules = match_rules(
        diagnosis_code=diagnosis_code,
        modality=modality,
        jurisdiction=jurisdiction,
    )
    possible_indication_context: List[Dict[str, Any]] = [
        {
            "rule_id": rule.get("id", ""),
            "modality": rule.get("modality", ""),
            "jurisdiction": rule.get("jurisdiction", ""),
            "regulatory_status": rule.get("regulatory_status", ""),
            "indication_context": rule.get("indication_context", ""),
        }
        for rule in matched_rules
    ]
    required_evidence_references = evidence_references_for(matched_rules)

    if not matched_rules:
        warnings.append(
            "No curated indication rule matched this diagnosis_code / modality / "
            "jurisdiction combination; this service has no opinion on indication context."
        )

    return {
        "diagnosis_code": diagnosis_code,
        "modality": modality,
        "jurisdiction": jurisdiction,
        "payer": payer,
        "coding_match": coding_match,
        "possible_indication_context": possible_indication_context,
        "required_evidence_references": required_evidence_references,
        "missing_sources": missing_sources,
        "status": "context_only",
        "coverage_determined": False,
        "warnings": sanitise_warnings(warnings),
        "decision_support_disclaimer": ELIGIBILITY_DISCLAIMER,
        "generated_at": _now_iso(),
    }
