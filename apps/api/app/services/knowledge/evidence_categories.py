"""Knowledge-adapter category taxonomy.

Pure metadata: maps each registry adapter key to a high-level category so
the HTTP surface can return ``clinical_evidence`` sources separately from
``drug_safety`` / ``neuroimaging`` / etc. Categories are part of the
client contract — values must remain stable.

The taxonomy intentionally lives next to ``adapter_bootstrap.py`` rather
than inside the catalog tuple itself. Keeping it as a sibling dict means
the catalog tuple shape ``(cls, tier, config)`` stays unchanged, and
test fixtures / external readers that already consume the catalog do not
need to be updated.

Category 3 ("Clinical Evidence" in the product spec) covers the 12
external evidence sources plus the internal DeepSynaps evidence DB. The
internal DB is not in this map because it is not an
``AdapterRegistry`` entry — its lifecycle is reported by
``app.services.evidence_terminal_service`` directly.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, FrozenSet, List


class EvidenceCategory(str, Enum):
    """Stable category labels exposed to HTTP clients."""

    CLINICAL_EVIDENCE = "clinical_evidence"
    DRUG_SAFETY = "drug_safety"
    DRUG_KNOWLEDGE = "drug_knowledge"
    GENOMICS = "genomics"
    NEUROIMAGING = "neuroimaging"
    ASSESSMENTS = "assessments"
    MODELING = "modeling"
    UNCATEGORIZED = "uncategorized"


# Registry adapter key → category. Anything missing from this map is
# reported as UNCATEGORIZED rather than raising.
ADAPTER_CATEGORIES: Dict[str, EvidenceCategory] = {
    # Clinical evidence — Category 3
    "pubmed": EvidenceCategory.CLINICAL_EVIDENCE,
    "pubmed_central": EvidenceCategory.CLINICAL_EVIDENCE,
    "ctgov": EvidenceCategory.CLINICAL_EVIDENCE,
    "eudract": EvidenceCategory.CLINICAL_EVIDENCE,
    "europepmc": EvidenceCategory.CLINICAL_EVIDENCE,
    "cochrane": EvidenceCategory.CLINICAL_EVIDENCE,
    "nice": EvidenceCategory.CLINICAL_EVIDENCE,
    "trip": EvidenceCategory.CLINICAL_EVIDENCE,
    "epistemonikos": EvidenceCategory.CLINICAL_EVIDENCE,
    "crossref": EvidenceCategory.CLINICAL_EVIDENCE,
    "acp_journal_club": EvidenceCategory.CLINICAL_EVIDENCE,
    "dynamed": EvidenceCategory.CLINICAL_EVIDENCE,
    # Drug safety
    "faers": EvidenceCategory.DRUG_SAFETY,
    "onsides": EvidenceCategory.DRUG_SAFETY,
    "openfda": EvidenceCategory.DRUG_SAFETY,
    # Drug knowledge
    "rxnorm": EvidenceCategory.DRUG_KNOWLEDGE,
    "pharmgkb": EvidenceCategory.DRUG_KNOWLEDGE,
    "loinc": EvidenceCategory.DRUG_KNOWLEDGE,
    # Genomics
    "clinvar": EvidenceCategory.GENOMICS,
    "gnomad": EvidenceCategory.GENOMICS,
    # Neuroimaging / atlases
    "chbmp": EvidenceCategory.NEUROIMAGING,
    "mni_atlas": EvidenceCategory.NEUROIMAGING,
    "allen_brain": EvidenceCategory.NEUROIMAGING,
    "schaefer": EvidenceCategory.NEUROIMAGING,
    "neurosynth": EvidenceCategory.NEUROIMAGING,
    "adni": EvidenceCategory.NEUROIMAGING,
    "abide": EvidenceCategory.NEUROIMAGING,
    # Assessments / modeling
    "promis": EvidenceCategory.ASSESSMENTS,
    "simnibs": EvidenceCategory.MODELING,
}


# Canonical list of Category-3 clinical evidence registry keys, in the
# order the product spec presents them. Used by the HTTP endpoint to
# build a stable response order and by tests to assert completeness.
CLINICAL_EVIDENCE_REGISTRY_KEYS: tuple[str, ...] = (
    "pubmed",
    "ctgov",
    "cochrane",
    "nice",
    "trip",
    "epistemonikos",
    "pubmed_central",
    "europepmc",
    "crossref",
    "acp_journal_club",
    "dynamed",
    "eudract",
)


# Subscription / restricted-access sources. These MUST NOT report a
# HEALTHY lifecycle without credentials/license verification.
SUBSCRIPTION_CLINICAL_EVIDENCE_KEYS: FrozenSet[str] = frozenset({
    "cochrane",
    "acp_journal_club",
    "dynamed",
})


def category_for_adapter(key: str) -> EvidenceCategory:
    """Return the category for a registry adapter key (defaults to UNCATEGORIZED)."""
    return ADAPTER_CATEGORIES.get(key, EvidenceCategory.UNCATEGORIZED)


def clinical_evidence_keys() -> List[str]:
    """Stable list of Category-3 clinical-evidence external registry keys."""
    return list(CLINICAL_EVIDENCE_REGISTRY_KEYS)


def is_subscription_source(key: str) -> bool:
    """True if the source requires a paid subscription or license."""
    return key in SUBSCRIPTION_CLINICAL_EVIDENCE_KEYS


__all__ = [
    "ADAPTER_CATEGORIES",
    "CLINICAL_EVIDENCE_REGISTRY_KEYS",
    "SUBSCRIPTION_CLINICAL_EVIDENCE_KEYS",
    "EvidenceCategory",
    "category_for_adapter",
    "clinical_evidence_keys",
    "is_subscription_source",
]
