"""Boot-safe compatibility facade for the legacy knowledge adapter registry."""

from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional

from app.services.knowledge.adapter_bootstrap import (
    build_production_registry,
    list_production_adapter_keys,
)
from app.services.knowledge.adapter_registry import AdapterRegistry as ServiceAdapterRegistry

_LEGACY_METADATA: Dict[str, Dict[str, Any]] = {
    "rxnorm": {
        "display_name": "RxNorm",
        "category": "pharmaceutical",
        "phase": 1,
        "access": "open",
        "data_types": ["medication", "terminology"],
        "description": "Normalized drug concepts and identifiers from the U.S. National Library of Medicine.",
    },
    "pharmgkb": {
        "display_name": "PharmGKB",
        "category": "pharmacogenomics",
        "phase": 1,
        "access": "api_key",
        "data_types": ["drug_gene", "variant_annotation"],
        "description": "Pharmacogenomic clinical annotations, haplotypes, and dosing guidance.",
    },
    "clinvar": {
        "display_name": "ClinVar",
        "category": "genetics",
        "phase": 1,
        "access": "open",
        "data_types": ["genetic_variant", "clinical_significance"],
        "description": "Clinical significance assertions for human genetic variants.",
    },
    "loinc": {
        "display_name": "LOINC",
        "category": "terminology",
        "phase": 1,
        "access": "open",
        "data_types": ["laboratory", "observation"],
        "description": "Standardized laboratory and clinical observation codes.",
    },
    "openfda": {
        "display_name": "openFDA",
        "category": "regulatory",
        "phase": 1,
        "access": "open",
        "data_types": ["drug_label", "adverse_event", "recall"],
        "description": "FDA drug labels, adverse event signals, and recall data.",
    },
    "chbmp": {
        "display_name": "CHBMP",
        "category": "qeeg",
        "phase": 1,
        "access": "open",
        "data_types": ["normative_eeg"],
        "description": "Normative EEG cohorts from the Cuban Human Brain Mapping Project.",
    },
    "mni_atlas": {
        "display_name": "MNI / AAL Atlas",
        "category": "neuroimaging",
        "phase": 1,
        "access": "open",
        "data_types": ["atlas", "coordinate_transform"],
        "description": "MNI152 coordinate transforms and atlas region mapping.",
    },
    "promis": {
        "display_name": "PROMIS",
        "category": "outcomes",
        "phase": 1,
        "access": "license",
        "data_types": ["patient_reported_outcome"],
        "description": "PROMIS instruments, scoring metadata, and outcome norms.",
    },
    "simnibs": {
        "display_name": "SimNIBS",
        "category": "neuromodulation",
        "phase": 1,
        "access": "local_compute",
        "data_types": ["simulation", "electric_field"],
        "description": "tDCS/TMS electric-field simulation and montage analysis.",
    },
    "faers": {
        "display_name": "FAERS",
        "category": "safety",
        "phase": 2,
        "access": "open",
        "data_types": ["adverse_event"],
        "description": "FDA Adverse Event Reporting System signal analysis.",
    },
    "onsides": {
        "display_name": "OnSIDES",
        "category": "safety",
        "phase": 2,
        "access": "open",
        "data_types": ["adverse_event"],
        "description": "Post-market adverse event associations mined from observational data.",
    },
    "allen_brain": {
        "display_name": "Allen Brain Atlas",
        "category": "neuroimaging",
        "phase": 2,
        "access": "open",
        "data_types": ["brain_expression", "atlas"],
        "description": "Brain atlas and gene-expression resources from the Allen Institute.",
    },
    "schaefer": {
        "display_name": "Schaefer Atlas",
        "category": "neuroimaging",
        "phase": 2,
        "access": "open",
        "data_types": ["atlas", "parcellation"],
        "description": "Functional brain parcellations at multiple spatial granularities.",
    },
    "neurosynth": {
        "display_name": "Neurosynth",
        "category": "literature",
        "phase": 2,
        "access": "open",
        "data_types": ["meta_analysis", "activation_map"],
        "description": "Meta-analytic neuroimaging evidence and reverse-inference maps.",
    },
    "adni": {
        "display_name": "ADNI",
        "category": "neuroimaging",
        "phase": 2,
        "access": "register",
        "data_types": ["neuroimaging", "clinical"],
        "description": "Alzheimer's Disease Neuroimaging Initiative dataset adapter.",
    },
    "abide": {
        "display_name": "ABIDE",
        "category": "neuroimaging",
        "phase": 2,
        "access": "open",
        "data_types": ["neuroimaging", "clinical"],
        "description": "Autism Brain Imaging Data Exchange dataset adapter.",
    },
    "pubmed": {
        "display_name": "PubMed",
        "category": "literature",
        "phase": 3,
        "access": "open",
        "data_types": ["literature"],
        "description": "Biomedical literature search via NCBI PubMed / MEDLINE.",
    },
    "ctgov": {
        "display_name": "ClinicalTrials.gov",
        "category": "evidence",
        "phase": 3,
        "access": "open",
        "data_types": ["clinical_trial"],
        "description": "Clinical trial registry search and study metadata.",
    },
    "cochrane": {
        "display_name": "Cochrane Library",
        "category": "evidence",
        "phase": 3,
        "access": "subscription",
        "data_types": ["systematic_review"],
        "description": "Systematic reviews and evidence syntheses.",
    },
    "europepmc": {
        "display_name": "Europe PMC",
        "category": "literature",
        "phase": 3,
        "access": "open",
        "data_types": ["literature", "preprint"],
        "description": "Biomedical literature and preprint search via Europe PMC.",
    },
    "gnomad": {
        "display_name": "gnomAD",
        "category": "genetics",
        "phase": 3,
        "access": "open",
        "data_types": ["genetic_variant"],
        "description": "Population genetic variant frequency reference.",
    },
    # ── Category 8: Diagnosis Coding ──────────────────────────────────────
    "icd10": {
        "display_name": "ICD-10-CM",
        "category": "diagnosis_coding",
        "phase": 3,
        "access": "open",
        "data_types": ["diagnosis_code", "terminology"],
        "description": (
            "ICD-10-CM diagnosis codes via NIH Clinical Tables. "
            "Decision-support only; codes do not assert diagnosis or coverage."
        ),
        "license_url": "https://www.cdc.gov/nchs/icd/icd-10-cm.htm",
        "endpoint": "https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search",
        "clinical_utility": (
            "Diagnosis coding for billing context and eligibility lookups; "
            "requires clinician/coder review."
        ),
    },
    "snomedct": {
        "display_name": "SNOMED CT",
        "category": "diagnosis_coding",
        "phase": 3,
        "access": "license_affiliate",
        "data_types": ["clinical_concept", "terminology"],
        "description": (
            "SNOMED CT clinical concepts via NIH Clinical Tables. "
            "Use governed by SNOMED Affiliate License."
        ),
        "license_url": "https://www.snomed.org/get-snomed",
        "endpoint": "https://clinicaltables.nlm.nih.gov/api/snomed/v3/search",
        "clinical_utility": (
            "Clinical terminology for condition specification, problem lists, "
            "and cross-system mapping."
        ),
    },
    "mesh": {
        "display_name": "MeSH",
        "category": "diagnosis_coding",
        "phase": 3,
        "access": "open",
        "data_types": ["mesh_descriptor", "terminology"],
        "description": (
            "Medical Subject Headings lookup for literature search expansion."
        ),
        "license_url": "https://www.nlm.nih.gov/mesh/meshhome.html",
        "endpoint": "https://id.nlm.nih.gov/mesh/lookup/term",
        "clinical_utility": (
            "Expands clinical terms into MeSH descriptors for PubMed and "
            "Europe PMC evidence search."
        ),
    },
    "umls": {
        "display_name": "UMLS",
        "category": "diagnosis_coding",
        "phase": 3,
        "access": "license_uts",
        "data_types": ["concept_mapping", "terminology"],
        "description": (
            "Unified Medical Language System (Metathesaurus). "
            "Requires UTS account and API key — degraded until configured."
        ),
        "license_url": "https://uts.nlm.nih.gov/uts/signup-login",
        "endpoint": "https://uts-ws.nlm.nih.gov/rest/",
        "license_required": True,
        "credentials_env": "UMLS_API_KEY",
        "clinical_utility": (
            "Unified terminology mapping across ICD-10, SNOMED, MeSH, "
            "LOINC, and others via UMLS CUI."
        ),
    },
    "ols": {
        "display_name": "OLS (EBI)",
        "category": "diagnosis_coding",
        "phase": 3,
        "access": "open",
        "data_types": ["ontology_term", "terminology"],
        "description": (
            "EBI Ontology Lookup Service for HPO, DOID, MONDO, EFO, etc."
        ),
        "license_url": "https://www.ebi.ac.uk/ols4",
        "endpoint": "https://www.ebi.ac.uk/ols4/api/",
        "clinical_utility": (
            "Cross-ontology lookup for phenotype and disease terms; "
            "supports semantic interoperability."
        ),
    },
}

_LEGACY_KEY_ALIASES: Dict[str, str] = {
    "clinicaltrials": "ctgov",
    "clinicaltrials.gov": "ctgov",
    "clinical_trials": "ctgov",
}

_registry_lock = Lock()
_registry_instance: Optional[ServiceAdapterRegistry] = None
_facade_instance: Optional["AdapterRegistry"] = None


def _canonical_key(key: str) -> str:
    return _LEGACY_KEY_ALIASES.get(key, key)


def _get_service_registry() -> ServiceAdapterRegistry:
    global _registry_instance
    if _registry_instance is not None:
        return _registry_instance

    with _registry_lock:
        if _registry_instance is None:
            _registry_instance = build_production_registry()
    return _registry_instance


def _metadata_for(key: str, registry: ServiceAdapterRegistry) -> Dict[str, Any]:
    canonical_key = _canonical_key(key)
    metadata = dict(_LEGACY_METADATA.get(canonical_key, {}))
    adapter = registry.get(canonical_key)

    if adapter is not None:
        metadata.setdefault("display_name", adapter.source_name)
    metadata.setdefault("display_name", canonical_key)
    metadata.setdefault("category", "unknown")
    metadata.setdefault("phase", None)
    metadata.setdefault("access", "unknown")
    metadata.setdefault("data_types", [])
    metadata.setdefault("description", "")

    return {
        "key": key,
        "display_name": metadata["display_name"],
        "category": metadata["category"],
        "phase": metadata["phase"],
        "access": metadata["access"],
        "data_types": list(metadata["data_types"]),
        "description": metadata["description"],
    }


def _iter_legacy_keys(registry: ServiceAdapterRegistry) -> List[str]:
    keys = list(list_production_adapter_keys())
    return [key for key in keys if registry.get(key) is not None]


class AdapterRegistry:
    """Legacy sync facade over the service-layer production adapter registry."""

    def __init__(self) -> None:
        self._service_registry: Optional[ServiceAdapterRegistry] = None

    def _registry(self) -> ServiceAdapterRegistry:
        if self._service_registry is None:
            self._service_registry = _get_service_registry()
        return self._service_registry

    def list_adapters(
        self,
        category: Optional[str] = None,
        phase: Optional[int] = None,
        access: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        registry = self._registry()
        results: List[Dict[str, Any]] = []
        for key in _iter_legacy_keys(registry):
            meta = _metadata_for(key, registry)
            if category and meta["category"] != category:
                continue
            if phase is not None and meta["phase"] != phase:
                continue
            if access and meta["access"] != access:
                continue
            results.append(meta)
        return results

    def list_categories(self) -> List[str]:
        return sorted({meta["category"] for meta in self.list_adapters()})

    def get_categories(self) -> List[str]:
        return self.list_categories()

    def get_stats(self) -> Dict[str, Any]:
        adapters = self.list_adapters()
        by_phase: Dict[Any, int] = {}
        by_access: Dict[str, int] = {}
        by_category: Dict[str, int] = {}

        for meta in adapters:
            by_phase[meta["phase"]] = by_phase.get(meta["phase"], 0) + 1
            by_access[meta["access"]] = by_access.get(meta["access"], 0) + 1
            by_category[meta["category"]] = by_category.get(meta["category"], 0) + 1

        return {
            "total_adapters": len(adapters),
            "by_phase": by_phase,
            "by_access": by_access,
            "by_category": by_category,
            "categories": sorted(by_category.keys()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    def get(self, key: str) -> Any:
        canonical_key = _canonical_key(key)
        return self._registry().get(canonical_key)

    def get_adapter(self, key: str) -> Any:
        adapter = self.get(key)
        if adapter is None:
            registry = self._registry()
            registered = sorted(_iter_legacy_keys(registry) + list(_LEGACY_KEY_ALIASES.keys()))
            raise KeyError(f"Unknown adapter: {key}. Registered: {registered}")
        return adapter


def get_registry() -> AdapterRegistry:
    global _facade_instance
    if _facade_instance is not None:
        return _facade_instance

    with _registry_lock:
        if _facade_instance is None:
            _facade_instance = AdapterRegistry()
    return _facade_instance


def list_adapters(
    category: Optional[str] = None,
    phase: Optional[int] = None,
    access: Optional[str] = None,
) -> List[Dict[str, Any]]:
    return get_registry().list_adapters(category=category, phase=phase, access=access)


def list_categories() -> List[str]:
    return get_registry().list_categories()


def get_stats() -> Dict[str, Any]:
    return get_registry().get_stats()


def get(key: str) -> Any:
    return get_registry().get(key)
