"""Neuroimaging knowledge-source inventory (Category 4).

Catalogues the 18 canonical neuroimaging data sources DeepSynaps tracks for
decision-support workflows (Brain Map Planner, Protocol Studio, Biomarkers
Workspace). This is a *static* registry of source metadata + lifecycle
state — it does not own adapter instantiation. The live ``import_path``
column points at the canonical adapter when one exists; ``None`` means the
source is documentation-only.

Design notes
------------

- This module is intentionally minimal and pure-Python (no I/O at import
  time). Adapter wiring lives in
  ``apps/api/app/services/knowledge/adapter_bootstrap.py``; this inventory
  is just the catalog of source metadata + lifecycle policy.

- Restricted-access sources (HCP, UK Biobank, OASIS, ABCD, EBRAINS,
  cNeuroMod, NSG) are catalogued as ``requires_application`` with
  ``enabled=False`` so they show up in operator dashboards but are never
  auto-federated by the live search endpoint.

- Software libraries (NeuroMaps) are catalogued as ``software_resource``
  with ``enabled=False`` — they are not HTTP APIs.

- ``deprecated`` is used for OpenfMRI, which migrated to OpenNeuro. The
  entry remains so historical citations resolve.

- ``clinical_utility`` strings use *approved* phrases only (see
  ``_APPROVED_UTILITY_PHRASES``). Prescriptive language is forbidden and
  enforced by ``test_neuroimaging_adapters.py``.

Decision-support disclaimer
---------------------------

Every search response and every catalog entry surfaces
``DECISION_SUPPORT_DISCLAIMER`` to remind downstream consumers that
neuroimaging-derived coordinates are *references*, not patient-specific
targets. Clinician verification is mandatory.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.services.knowledge.lifecycle import LifecycleState

# Path prefixes for adapter ``import_path`` strings.
_LEGACY = "app.knowledge"
_CANONICAL = "app.services.knowledge.adapters"


# ── Safety constants ─────────────────────────────────────────────────────

#: Decision-support disclaimer attached to every neuroimaging response.
#: Stable HTTP contract: clients may surface this verbatim. Do not edit
#: without coordinating with the Protocol Studio and Brain Map Planner
#: surfaces.
DECISION_SUPPORT_DISCLAIMER: str = (
    "decision support only; not diagnostic; not a treatment prescription; "
    "coordinates/regions are source-derived references; clinician must "
    "verify against patient anatomy and clinical context; imaging datasets "
    "may not match patient population"
)


#: Phrases approved for ``clinical_utility`` strings. Free-form clinical
#: language is forbidden — the test suite enforces this allow-list to keep
#: catalog copy non-prescriptive.
_APPROVED_UTILITY_PHRASES: tuple[str, ...] = (
    "candidate target reference",
    "source-derived coordinate",
    "population-level map",
    "requires clinician review",
    "atlas-dependent",
    "uncertain/limited evidence",
)


#: Forbidden phrases that would imply a prescriptive recommendation.
#: Enforced by ``test_no_prescriptive_language``.
_FORBIDDEN_UTILITY_PHRASES: tuple[str, ...] = (
    "optimal coordinate",
    "recommended site",
    "validated for this patient",
    "safe target",
    "exact target",
)


# ── 18 canonical sources ─────────────────────────────────────────────────

NEUROIMAGING_SOURCES: List[Dict[str, Any]] = [
    {
        "id": "neurovault",
        "name": "NeuroVault",
        "category": "neuroimaging",
        "access_type": "open_http_api",
        "source_url": "https://neurovault.org/api/",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.HEALTHY.value,
        "enabled": True,
        "clinical_utility": (
            "population-level map; source-derived coordinate; "
            "requires clinician review"
        ),
        "provenance": (
            "Repository of statistical brain maps (T/Z/F/beta maps) shared "
            "by the neuroimaging community."
        ),
        "access_notes": "Open API; no credentials required.",
        "modality_tags": ["fMRI-BOLD", "VBM", "PET", "DTI"],
        "population_tags": ["adult", "mixed"],
        "atlas_compatibility": ["MNI152", "Talairach"],
        "import_path": f"{_LEGACY}.neurovault_adapter",
        "metadata": {"legacy_shim": True},
    },
    {
        "id": "openneuro",
        "name": "OpenNeuro",
        "category": "neuroimaging",
        "access_type": "open_graphql_api",
        "source_url": "https://openneuro.org/crn/graphql",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.HEALTHY.value,
        "enabled": True,
        "clinical_utility": (
            "population-level map; source-derived coordinate; "
            "requires clinician review"
        ),
        "provenance": (
            "BIDS-formatted open neuroimaging dataset repository; successor "
            "to OpenfMRI."
        ),
        "access_notes": "Open GraphQL API; no credentials required for read.",
        "modality_tags": ["fMRI-BOLD", "MRI", "MEG", "EEG", "iEEG"],
        "population_tags": ["adult", "pediatric", "mixed"],
        "atlas_compatibility": ["MNI152"],
        "import_path": f"{_LEGACY}.openneuro_adapter",
        "metadata": {"legacy_shim": True},
    },
    {
        "id": "brainmap",
        "name": "BrainMap",
        "category": "neuroimaging",
        "access_type": "external_application",
        "source_url": "https://www.brainmap.org/",
        "requires_credentials": True,
        "lifecycle_state": LifecycleState.REQUIRES_APPLICATION.value,
        "enabled": False,
        "clinical_utility": (
            "population-level map; source-derived coordinate; "
            "requires clinician review; uncertain/limited evidence"
        ),
        "provenance": (
            "Coordinate-based meta-analysis database (Sleuth / GingerALE). "
            "Access via desktop applications; no public HTTP API."
        ),
        "access_notes": (
            "Application required; data consumed through Sleuth/GingerALE "
            "desktop tooling, not federated by this router."
        ),
        "modality_tags": ["fMRI-BOLD", "PET"],
        "population_tags": ["adult", "mixed"],
        "atlas_compatibility": ["Talairach", "MNI152"],
        "import_path": None,
        "metadata": {
            "requires_external_tooling": True,
            "tooling": ["Sleuth", "GingerALE"],
        },
    },
    {
        "id": "neurosynth",
        "name": "NeuroSynth",
        "category": "neuroimaging",
        "access_type": "open_http_api",
        "source_url": "https://neurosynth.org/api/",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.HEALTHY.value,
        "enabled": True,
        "clinical_utility": (
            "candidate target reference; population-level map; "
            "source-derived coordinate; requires clinician review"
        ),
        "provenance": (
            "Automated coordinate-based meta-analysis of fMRI literature."
        ),
        "access_notes": (
            "Open HTTP API + local SQLite snapshot. NeuroSynth is also "
            "distributed as a Python package; this inventory exposes the "
            "HTTP/SQLite adapter."
        ),
        "modality_tags": ["fMRI-BOLD"],
        "population_tags": ["adult", "mixed"],
        "atlas_compatibility": ["MNI152"],
        "import_path": f"{_CANONICAL}.neurosynth_adapter",
        "metadata": {
            "canonical_adapter": True,
            "also_distributed_as_python_package": True,
        },
    },
    {
        "id": "alba_ba",
        "name": "ALBA-BA (Anatomy Laboratory Brain Atlas)",
        "category": "neuroimaging",
        "access_type": "static_dataset",
        "source_url": "http://www.alba-ba.fchampalimaud.org/",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.CATALOGUED.value,
        "enabled": False,
        "clinical_utility": (
            "atlas-dependent; source-derived coordinate; "
            "uncertain/limited evidence"
        ),
        "provenance": (
            "Histology-based brain atlas dataset; not a queryable API."
        ),
        "access_notes": "Static dataset distribution; no live API adapter.",
        "modality_tags": ["histology", "atlas"],
        "population_tags": ["adult"],
        "atlas_compatibility": ["MNI152"],
        "import_path": None,
        "metadata": {"dataset_only": True},
    },
    {
        "id": "adhd200",
        "name": "ADHD-200",
        "category": "neuroimaging",
        "access_type": "open_dataset",
        "source_url": "http://fcon_1000.projects.nitrc.org/indi/adhd200/",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.CATALOGUED.value,
        "enabled": False,
        "clinical_utility": (
            "population-level map; atlas-dependent; "
            "uncertain/limited evidence"
        ),
        "provenance": (
            "Pediatric ADHD resting-state fMRI sample. Dataset metadata only; "
            "no per-subject federation."
        ),
        "access_notes": (
            "Open dataset; metadata-only adapter available but disabled "
            "pending download workflow."
        ),
        "modality_tags": ["fMRI-BOLD", "structural-MRI"],
        "population_tags": ["pediatric"],
        "atlas_compatibility": ["MNI152"],
        "import_path": f"{_LEGACY}.adhd200_adapter",
        "metadata": {"legacy_shim": True, "dataset_metadata_only": True},
    },
    {
        "id": "nsg",
        "name": "Neuroscience Gateway (NSG)",
        "category": "neuroimaging",
        "access_type": "compute_gateway",
        "source_url": "https://www.nsgportal.org/",
        "requires_credentials": True,
        "lifecycle_state": LifecycleState.REQUIRES_APPLICATION.value,
        "enabled": False,
        "clinical_utility": (
            "requires clinician review; uncertain/limited evidence"
        ),
        "provenance": (
            "HPC compute gateway for neuroscience simulations (NEURON, "
            "NEST). Account application required."
        ),
        "access_notes": "Application + account required; no public query API.",
        "modality_tags": ["simulation"],
        "population_tags": [],
        "atlas_compatibility": [],
        "import_path": None,
        "metadata": {"compute_gateway": True},
    },
    {
        "id": "oasis",
        "name": "OASIS Brains",
        "category": "neuroimaging",
        "access_type": "restricted_dataset",
        "source_url": "https://www.oasis-brains.org/",
        "requires_credentials": True,
        "lifecycle_state": LifecycleState.REQUIRES_APPLICATION.value,
        "enabled": False,
        "clinical_utility": (
            "population-level map; atlas-dependent; "
            "uncertain/limited evidence"
        ),
        "provenance": (
            "Open Access Series of Imaging Studies — aging + Alzheimer's "
            "cohort. DUA required for full data; metadata adapter available."
        ),
        "access_notes": (
            "Data Use Agreement required. Adapter present but gated until "
            "DUA workflow is wired."
        ),
        "modality_tags": ["MRI", "PET"],
        "population_tags": ["adult", "geriatric"],
        "atlas_compatibility": ["MNI152"],
        "import_path": f"{_LEGACY}.oasis_adapter",
        "metadata": {"legacy_shim": True, "requires_dua": True},
    },
    {
        "id": "abcd",
        "name": "Adolescent Brain Cognitive Development (ABCD) Study",
        "category": "neuroimaging",
        "access_type": "restricted_dataset",
        "source_url": "https://abcdstudy.org/",
        "requires_credentials": True,
        "lifecycle_state": LifecycleState.REQUIRES_APPLICATION.value,
        "enabled": False,
        "clinical_utility": (
            "population-level map; requires clinician review; "
            "uncertain/limited evidence"
        ),
        "provenance": (
            "Longitudinal pediatric neuroimaging + cognition cohort. "
            "NIMH Data Archive (NDA) access required."
        ),
        "access_notes": "NDA Data Access Request required.",
        "modality_tags": ["MRI", "fMRI-BOLD", "DTI"],
        "population_tags": ["pediatric", "adolescent"],
        "atlas_compatibility": ["MNI152"],
        "import_path": None,
        "metadata": {"requires_nda_access": True},
    },
    {
        "id": "hcp",
        "name": "Human Connectome Project (HCP)",
        "category": "neuroimaging",
        "access_type": "restricted_dataset",
        "source_url": "https://www.humanconnectome.org/",
        "requires_credentials": True,
        "lifecycle_state": LifecycleState.REQUIRES_APPLICATION.value,
        "enabled": False,
        "clinical_utility": (
            "population-level map; atlas-dependent; "
            "source-derived coordinate; requires clinician review"
        ),
        "provenance": (
            "Young adult, lifespan, and disease HCP cohorts (1200+ subjects). "
            "ConnectomeDB account + Open Access Terms required."
        ),
        "access_notes": (
            "ConnectomeDB account required. Adapter present but gated until "
            "auth workflow is wired."
        ),
        "modality_tags": ["MRI", "fMRI-BOLD", "DTI", "MEG"],
        "population_tags": ["adult"],
        "atlas_compatibility": ["MNI152", "fsLR"],
        "import_path": f"{_LEGACY}.hcp_adapter",
        "metadata": {"legacy_shim": True, "requires_connectomedb": True},
    },
    {
        "id": "uk_biobank",
        "name": "UK Biobank Imaging",
        "category": "neuroimaging",
        "access_type": "restricted_dataset",
        "source_url": "https://www.ukbiobank.ac.uk/",
        "requires_credentials": True,
        "lifecycle_state": LifecycleState.REQUIRES_APPLICATION.value,
        "enabled": False,
        "clinical_utility": (
            "population-level map; requires clinician review; "
            "uncertain/limited evidence"
        ),
        "provenance": (
            "UK Biobank large-scale imaging arm (~100k subjects). "
            "Research application + fee required."
        ),
        "access_notes": "Application + access fee required.",
        "modality_tags": ["MRI", "fMRI-BOLD", "DTI"],
        "population_tags": ["adult", "geriatric"],
        "atlas_compatibility": ["MNI152"],
        "import_path": None,
        "metadata": {"requires_paid_application": True},
    },
    {
        "id": "ebrains",
        "name": "EBRAINS",
        "category": "neuroimaging",
        "access_type": "federated_platform",
        "source_url": "https://ebrains.eu/",
        "requires_credentials": True,
        "lifecycle_state": LifecycleState.REQUIRES_APPLICATION.value,
        "enabled": False,
        "clinical_utility": (
            "atlas-dependent; source-derived coordinate; "
            "requires clinician review"
        ),
        "provenance": (
            "European Brain Research Infrastructure — atlases, models, "
            "datasets, simulation. Account required for restricted assets."
        ),
        "access_notes": (
            "Account + per-resource terms required. No unified read-only "
            "adapter wired."
        ),
        "modality_tags": ["MRI", "PET", "histology", "atlas", "simulation"],
        "population_tags": ["adult", "mixed"],
        "atlas_compatibility": ["MNI152", "Julich-Brain"],
        "import_path": None,
        "metadata": {"federated_platform": True},
    },
    {
        "id": "neuromaps",
        "name": "NeuroMaps",
        "category": "neuroimaging",
        "access_type": "python_package",
        "source_url": "https://netneurolab.github.io/neuromaps/",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.SOFTWARE_RESOURCE.value,
        "enabled": False,
        "clinical_utility": (
            "atlas-dependent; source-derived coordinate; "
            "uncertain/limited evidence"
        ),
        "provenance": (
            "Python library + curated dataset of brain annotation maps "
            "(receptor density, neurotransmitter, cortical hierarchy)."
        ),
        "access_notes": (
            "Distributed as a Python package; not a queryable HTTP API. "
            "Surface via offline ETL when needed."
        ),
        "modality_tags": ["PET", "fMRI-BOLD", "annotation"],
        "population_tags": ["adult"],
        "atlas_compatibility": ["MNI152", "fsLR", "fsaverage"],
        "import_path": None,
        "metadata": {"python_package": "neuromaps"},
    },
    {
        "id": "allen_brain",
        "name": "Allen Brain Connectivity",
        "category": "neuroimaging",
        "access_type": "open_http_api",
        "source_url": "https://connectivity.brain-map.org/",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.HEALTHY.value,
        "enabled": True,
        "clinical_utility": (
            "atlas-dependent; source-derived coordinate; "
            "uncertain/limited evidence"
        ),
        "provenance": (
            "Allen Mouse Brain Connectivity Atlas + Allen Human Brain Atlas; "
            "tracer-based connectivity and gene expression."
        ),
        "access_notes": (
            "Open HTTP API; primarily preclinical (mouse) connectivity — "
            "human translation requires clinician interpretation."
        ),
        "modality_tags": ["tracer", "gene-expression", "atlas"],
        "population_tags": ["mouse", "adult-human"],
        "atlas_compatibility": ["Allen-CCF", "MNI152"],
        "import_path": f"{_CANONICAL}.allen_brain_adapter",
        "metadata": {"canonical_adapter": True},
    },
    {
        "id": "brain_atlas_cebm",
        "name": "Brain Atlas (cebm.nl)",
        "category": "neuroimaging",
        "access_type": "static_dataset",
        "source_url": "https://www.cebm.nl/?p=brain_atlas",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.CATALOGUED.value,
        "enabled": False,
        "clinical_utility": (
            "atlas-dependent; source-derived coordinate; "
            "uncertain/limited evidence"
        ),
        "provenance": (
            "Educational brain atlas; static distribution, no queryable API."
        ),
        "access_notes": "Static dataset; no live API adapter.",
        "modality_tags": ["atlas"],
        "population_tags": ["adult"],
        "atlas_compatibility": ["MNI152"],
        "import_path": None,
        "metadata": {"dataset_only": True},
    },
    {
        "id": "cneuromod",
        "name": "Courtois NeuroMod (cNeuroMod)",
        "category": "neuroimaging",
        "access_type": "restricted_dataset",
        "source_url": "https://www.cneuromod.ca/",
        "requires_credentials": True,
        "lifecycle_state": LifecycleState.REQUIRES_APPLICATION.value,
        "enabled": False,
        "clinical_utility": (
            "population-level map; uncertain/limited evidence"
        ),
        "provenance": (
            "Deep-imaging cohort (six subjects, hundreds of hours each) "
            "for naturalistic-stimulus fMRI."
        ),
        "access_notes": "Data Use Agreement + application required.",
        "modality_tags": ["fMRI-BOLD"],
        "population_tags": ["adult"],
        "atlas_compatibility": ["MNI152"],
        "import_path": None,
        "metadata": {"requires_dua": True},
    },
    {
        "id": "openfmri",
        "name": "OpenfMRI (deprecated)",
        "category": "neuroimaging",
        "access_type": "deprecated",
        "source_url": "https://www.openfmri.org/",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.DEPRECATED.value,
        "enabled": False,
        "clinical_utility": (
            "uncertain/limited evidence; population-level map"
        ),
        "provenance": (
            "OpenfMRI is retired. All datasets migrated to OpenNeuro. "
            "Entry retained for historical citation resolution."
        ),
        "access_notes": (
            "Service retired; use OpenNeuro for any new federated queries."
        ),
        "modality_tags": ["fMRI-BOLD"],
        "population_tags": ["adult"],
        "atlas_compatibility": ["MNI152"],
        "import_path": None,
        "metadata": {"deprecated_in_favor_of": "openneuro"},
    },
    {
        "id": "fcp_indi",
        "name": "Functional Connectomes Project (FCP-INDI / 1000)",
        "category": "neuroimaging",
        "access_type": "open_dataset",
        "source_url": "http://fcon_1000.projects.nitrc.org/",
        "requires_credentials": False,
        "lifecycle_state": LifecycleState.HEALTHY.value,
        "enabled": True,
        "clinical_utility": (
            "population-level map; atlas-dependent; "
            "uncertain/limited evidence"
        ),
        "provenance": (
            "1000 Functional Connectomes Project + International "
            "Neuroimaging Data-sharing Initiative (INDI)."
        ),
        "access_notes": "Open dataset distribution + metadata adapter.",
        "modality_tags": ["fMRI-BOLD", "resting-state"],
        "population_tags": ["adult", "mixed"],
        "atlas_compatibility": ["MNI152"],
        "import_path": f"{_LEGACY}.functional_connectomes_1000_adapter",
        "metadata": {"legacy_shim": True},
    },
]


# ── Helpers ──────────────────────────────────────────────────────────────


def list_neuroimaging_sources() -> List[Dict[str, Any]]:
    """Return the full neuroimaging source catalog as a list of dicts.

    Returns shallow copies so callers cannot mutate the canonical entries.
    """
    return [dict(src) for src in NEUROIMAGING_SOURCES]


def get_neuroimaging_source(key: str) -> Optional[Dict[str, Any]]:
    """Return a single source by ``id``, or ``None`` if not found."""
    for src in NEUROIMAGING_SOURCES:
        if src["id"] == key:
            return dict(src)
    return None


def list_lifecycle_summary() -> Dict[str, Any]:
    """Aggregate lifecycle state counts for the neuroimaging inventory.

    Mirrors the shape returned by
    ``lifecycle.summarize_lifecycle`` so the live HTTP surfaces remain
    interchangeable.
    """
    by_state: Dict[str, int] = {member.value: 0 for member in LifecycleState}
    per_source: Dict[str, str] = {}
    for src in NEUROIMAGING_SOURCES:
        state = src["lifecycle_state"]
        by_state[state] = by_state.get(state, 0) + 1
        per_source[src["id"]] = state
    return {
        "total": len(NEUROIMAGING_SOURCES),
        "by_state": by_state,
        "sources": per_source,
    }


def list_enabled_sources() -> List[Dict[str, Any]]:
    """Return only sources with ``enabled=True`` and a live ``import_path``.

    These are the sources the federated search endpoint may contact.
    """
    return [
        dict(src)
        for src in NEUROIMAGING_SOURCES
        if src.get("enabled") is True and src.get("import_path")
    ]


__all__: List[str] = [
    "DECISION_SUPPORT_DISCLAIMER",
    "NEUROIMAGING_SOURCES",
    "get_neuroimaging_source",
    "list_enabled_sources",
    "list_lifecycle_summary",
    "list_neuroimaging_sources",
]
