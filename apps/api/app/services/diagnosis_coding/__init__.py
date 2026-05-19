"""Category 8 — Diagnosis Coding service layer.

Decision-support only. Sources here normalise clinical language and support
evidence/eligibility context. They never diagnose, prescribe, or guarantee
coverage.
"""

from app.services.diagnosis_coding.safety import (
    DEFAULT_WARNINGS,
    DECISION_SUPPORT_DISCLAIMER,
    ELIGIBILITY_DISCLAIMER,
    NORMALIZATION_DISCLAIMER,
    QUERY_EXPANSION_DISCLAIMER,
    sanitise_warnings,
)
from app.services.diagnosis_coding.indication_rules import (
    all_rules as indication_all_rules,
    evidence_references_for,
    match_rules as match_indication_rules,
    reload_rules as reload_indication_rules,
)
from app.services.diagnosis_coding.service import (
    DIAGNOSIS_CODING_SOURCES,
    SOURCE_TO_ADAPTER_KEY,
    diagnosis_source_status,
    eligibility_context,
    normalize_diagnosis,
    query_expansion,
)

__all__ = [
    "DEFAULT_WARNINGS",
    "DECISION_SUPPORT_DISCLAIMER",
    "DIAGNOSIS_CODING_SOURCES",
    "ELIGIBILITY_DISCLAIMER",
    "NORMALIZATION_DISCLAIMER",
    "QUERY_EXPANSION_DISCLAIMER",
    "SOURCE_TO_ADAPTER_KEY",
    "diagnosis_source_status",
    "eligibility_context",
    "evidence_references_for",
    "indication_all_rules",
    "match_indication_rules",
    "normalize_diagnosis",
    "query_expansion",
    "reload_indication_rules",
    "sanitise_warnings",
]
