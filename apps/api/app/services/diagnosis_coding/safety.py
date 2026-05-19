"""Disclaimers and safety wording for Category 8 diagnosis coding outputs.

All responses from the diagnosis-coding router MUST attach the relevant
disclaimer so clinicians/coders are not misled into treating a coding match
as a diagnosis, an eligibility decision, or a guarantee of reimbursement.
"""
from __future__ import annotations

from typing import List, Sequence

DECISION_SUPPORT_DISCLAIMER: str = (
    "Decision support only. This response is not a diagnosis, prescription, "
    "or coverage decision. Clinician and coder verification required."
)

NORMALIZATION_DISCLAIMER: str = (
    "Diagnosis-code normalisation returns possible coding matches based on the "
    "term provided. It does not assert that any patient has been diagnosed with "
    "the matched condition. Clinician review of the underlying patient record "
    "is required before clinical use."
)

QUERY_EXPANSION_DISCLAIMER: str = (
    "Terminology expansion returns synonyms and source-backed cross-mappings to "
    "help literature and evidence search. Expansions are not equivalent claims "
    "about clinical sameness; mappings may be incomplete or jurisdiction-"
    "specific."
)

ELIGIBILITY_DISCLAIMER: str = (
    "Eligibility context is informational. It does not constitute an "
    "eligibility decision, coverage determination, prior-authorisation, or "
    "reimbursement guarantee. Payer-specific policies and clinician judgement "
    "govern actual eligibility."
)

DEFAULT_WARNINGS: tuple = (
    "Codes may not reflect the patient's actual diagnosis — coder review required.",
    "Mappings can be incomplete or jurisdiction-specific.",
    "Coverage and reimbursement are not determined by this service.",
)

# Phrases the router/service must NEVER emit unguarded — they imply a
# diagnosis assertion, coverage decision, or guaranteed reimbursement.
FORBIDDEN_PHRASES: tuple = (
    "patient has ",
    "diagnosed with ",
    "is eligible",
    "is covered",
    "guaranteed reimbursement",
    "approved indication",
    "approved for treatment",
)


def sanitise_warnings(warnings: Sequence[str]) -> List[str]:
    """Return a deduplicated, ordered list of warnings; never empty.

    Always prepends ``DEFAULT_WARNINGS`` so downstream consumers can rely on a
    minimum disclosure surface, then folds in caller-provided warnings.
    """
    seen: set = set()
    out: List[str] = []
    for w in list(DEFAULT_WARNINGS) + list(warnings or []):
        if not w:
            continue
        if w in seen:
            continue
        seen.add(w)
        out.append(w)
    return out
