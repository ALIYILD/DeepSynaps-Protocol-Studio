"""
DeepSynaps Protocol Studio — Adapter Wiring Module

Helper module that:
- Lists all 66 adapters with their import paths
- Creates the adapter initialization order (pharmaceutical first, then genetic, etc.)
- Provides health check aggregation
- Provides graceful shutdown

This module is the central nervous system for all 66 external database adapters,
organizing them by domain and providing fault-tolerant wiring patterns.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger("deepsynaps.adapter_wiring")

# ═══════════════════════════════════════════════════════════════════════════════
#  ADAPTER DEFINITIONS — All 66 Adapters
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class AdapterSpec:
    """Specification for a single adapter."""

    name: str
    module_path: str
    class_name: str
    category: str
    priority: int  # Lower = initialized first
    description: str
    status: str = "pending"  # pending, loaded, failed
    instance: Any = None
    error: Optional[str] = None


# ── Category priority order ──
# 1. Pharmaceutical (medication data)
# 2. Genetic (genomic variants)
# 3. Neuroimaging (brain atlases, imaging)
# 4. Evidence (literature, trials)
# 5. Terminology (medical codes)
# 6. Adverse Events (safety data)
# 7. AI Literature (ML/neuroscience papers)
# 8. Pending (future adapters)

CATEGORY_ORDER = [
    "pharmaceutical",
    "genetic",
    "neuroimaging",
    "evidence",
    "terminology",
    "adverse_events",
    "ai_literature",
    "pending",
]

# ═══════════════════════════════════════════════════════════════════════════════
#  ALL 66 ADAPTERS
# ═══════════════════════════════════════════════════════════════════════════════

ADAPTER_SPECS: list[AdapterSpec] = [
    # ═══════════════════════════════════════════════════════════════════════════
    #  CATEGORY 1: PHARMACEUTICAL (9 adapters)
    #  Medication databases, drug interactions, pharmacogenomics
    # ═══════════════════════════════════════════════════════════════════════════
    AdapterSpec(
        name="rxnorm",
        module_path="app.adapters.rxnorm_adapter",
        class_name="RxNormAdapter",
        category="pharmaceutical",
        priority=1,
        description="Normalized drug names from NIH",
    ),
    AdapterSpec(
        name="pharmgkb",
        module_path="app.adapters.pharmgkb_adapter",
        class_name="PharmGKBAdapter",
        category="pharmaceutical",
        priority=2,
        description="Pharmacogenomics knowledge base",
    ),
    AdapterSpec(
        name="drugbank",
        module_path="app.adapters.drugbank_adapter",
        class_name="DrugBankAdapter",
        category="pharmaceutical",
        priority=3,
        description="Drug-target-disease relationships",
    ),
    AdapterSpec(
        name="chembl",
        module_path="app.adapters.chembl_adapter",
        class_name="ChEMBLAdapter",
        category="pharmaceutical",
        priority=4,
        description="Bioactivity data for drug discovery",
    ),
    AdapterSpec(
        name="pubchem",
        module_path="app.adapters.pubchem_adapter",
        class_name="PubChemAdapter",
        category="pharmaceutical",
        priority=5,
        description="Chemical structures and bioassays",
    ),
    AdapterSpec(
        name="dailymed",
        module_path="app.adapters.dailymed_adapter",
        class_name="DailyMedAdapter",
        category="pharmaceutical",
        priority=6,
        description="FDA-approved drug labels",
    ),
    AdapterSpec(
        name="ndc_directory",
        module_path="app.adapters.ndc_directory_adapter",
        class_name="NDCDirectoryAdapter",
        category="pharmaceutical",
        priority=7,
        description="National Drug Code directory",
    ),
    AdapterSpec(
        name="orange_book",
        module_path="app.adapters.orange_book_adapter",
        class_name="OrangeBookAdapter",
        category="pharmaceutical",
        priority=8,
        description="FDA approved drug products",
    ),
    AdapterSpec(
        name="unii",
        module_path="app.adapters.unii_adapter",
        class_name="UNIIAdapter",
        category="pharmaceutical",
        priority=9,
        description="FDA Unique Ingredient Identifier",
    ),
    # ═══════════════════════════════════════════════════════════════════════════
    #  CATEGORY 2: GENETIC (10 adapters)
    #  Genomic variants, GWAS, gene annotations
    # ═══════════════════════════════════════════════════════════════════════════
    AdapterSpec(
        name="clinvar",
        module_path="app.adapters.clinvar_adapter",
        class_name="ClinVarAdapter",
        category="genetic",
        priority=10,
        description="Clinical significance of genetic variants",
    ),
    AdapterSpec(
        name="dbsnp",
        module_path="app.adapters.dbsnp_adapter",
        class_name="DbSNPAdapter",
        category="genetic",
        priority=11,
        description="SNP database from NCBI",
    ),
    AdapterSpec(
        name="gnomad",
        module_path="app.adapters.gnomad_adapter",
        class_name="GnomADAdapter",
        category="genetic",
        priority=12,
        description="Genome aggregation database",
    ),
    AdapterSpec(
        name="ensembl",
        module_path="app.adapters.ensembl_adapter",
        class_name="EnsemblAdapter",
        category="genetic",
        priority=13,
        description="Genome browser and annotation",
    ),
    AdapterSpec(
        name="gwas_catalog",
        module_path="app.adapters.gwas_catalog_adapter",
        class_name="GWASCatalogAdapter",
        category="genetic",
        priority=14,
        description="GWAS summary statistics",
    ),
    AdapterSpec(
        name="uniprot",
        module_path="app.adapters.uniprot_adapter",
        class_name="UniProtAdapter",
        category="genetic",
        priority=15,
        description="Protein sequence and function",
    ),
    AdapterSpec(
        name="myvariant",
        module_path="app.adapters.myvariant_adapter",
        class_name="MyVariantAdapter",
        category="genetic",
        priority=16,
        description="Variant annotation aggregator",
    ),
    AdapterSpec(
        name="string",
        module_path="app.adapters.string_adapter",
        class_name="STRINGAdapter",
        category="genetic",
        priority=17,
        description="Protein-protein interaction networks",
    ),
    AdapterSpec(
        name="corr",
        module_path="app.adapters.corr_adapter",
        class_name="CORRAdapter",
        category="genetic",
        priority=18,
        description="Connectivity-based risk genes",
    ),
    AdapterSpec(
        name="gsp",
        module_path="app.adapters.gsp_adapter",
        class_name="GSPAdapter",
        category="genetic",
        priority=19,
        description="Genetic signal processing",
    ),
    # ═══════════════════════════════════════════════════════════════════════════
    #  CATEGORY 3: NEUROIMAGING (12 adapters)
    #  Brain atlases, imaging datasets, neuroimaging tools
    # ═══════════════════════════════════════════════════════════════════════════
    AdapterSpec(
        name="mni_atlas",
        module_path="app.adapters.mni_atlas_adapter",
        class_name="MNIAtlasAdapter",
        category="neuroimaging",
        priority=20,
        description="MNI brain atlas coordinates",
    ),
    AdapterSpec(
        name="simnibs",
        module_path="app.adapters.simnibs_adapter",
        class_name="SimNIBSAdapter",
        category="neuroimaging",
        priority=21,
        description="TMS/tDCS electric field simulation",
    ),
    AdapterSpec(
        name="chbmp",
        module_path="app.adapters.chbmp_adapter",
        class_name="CHBMPAdapter",
        category="neuroimaging",
        priority=22,
        description="Chinese Brain Mapping Project",
    ),
    AdapterSpec(
        name="hcp",
        module_path="app.adapters.hcp_adapter",
        class_name="HCPAdapter",
        category="neuroimaging",
        priority=23,
        description="Human Connectome Project",
    ),
    AdapterSpec(
        name="hcp_aging",
        module_path="app.adapters.hcp_aging_adapter",
        class_name="HCPAgingAdapter",
        category="neuroimaging",
        priority=24,
        description="HCP Aging study data",
    ),
    AdapterSpec(
        name="hcp_lifespan",
        module_path="app.adapters.hcp_lifespan_adapter",
        class_name="HCPLifespanAdapter",
        category="neuroimaging",
        priority=25,
        description="HCP Lifespan development data",
    ),
    AdapterSpec(
        name="openneuro",
        module_path="app.adapters.openneuro_adapter",
        class_name="OpenNeuroAdapter",
        category="neuroimaging",
        priority=26,
        description="Open neuroimaging data archive",
    ),
    AdapterSpec(
        name="oasis",
        module_path="app.adapters.oasis_adapter",
        class_name="OASISAdapter",
        category="neuroimaging",
        priority=27,
        description="Open Access Series of Imaging Studies",
    ),
    AdapterSpec(
        name="neurovault",
        module_path="app.adapters.neurovault_adapter",
        class_name="NeuroVaultAdapter",
        category="neuroimaging",
        priority=28,
        description="Neuroimaging results repository",
    ),
    AdapterSpec(
        name="adhd200",
        module_path="app.adapters.adhd200_adapter",
        class_name="ADHD200Adapter",
        category="neuroimaging",
        priority=29,
        description="ADHD-200 neuroimaging dataset",
    ),
    AdapterSpec(
        name="cobre",
        module_path="app.adapters.cobre_adapter",
        class_name="COBREAdapter",
        category="neuroimaging",
        priority=30,
        description="Center for Biomedical Research Excellence",
    ),
    AdapterSpec(
        name="ixi",
        module_path="app.adapters.ixi_adapter",
        class_name="IXIAdapter",
        category="neuroimaging",
        priority=31,
        description="IXI brain development dataset",
    ),
    # ═══════════════════════════════════════════════════════════════════════════
    #  CATEGORY 4: EVIDENCE (9 adapters)
    #  Clinical trials, systematic reviews, literature
    # ═══════════════════════════════════════════════════════════════════════════
    AdapterSpec(
        name="pubmed",
        module_path="app.adapters.pubmed_adapter",
        class_name="PubMedAdapter",
        category="evidence",
        priority=32,
        description="Biomedical literature from NCBI",
    ),
    AdapterSpec(
        name="clinicaltrials",
        module_path="app.adapters.clinicaltrials_adapter",
        class_name="ClinicalTrialsAdapter",
        category="evidence",
        priority=33,
        description="ClinicalTrials.gov registry",
    ),
    AdapterSpec(
        name="cochrane",
        module_path="app.adapters.cochrane_adapter",
        class_name="CochraneAdapter",
        category="evidence",
        priority=34,
        description="Cochrane systematic reviews",
    ),
    AdapterSpec(
        name="epistemonikos",
        module_path="app.adapters.epistemonikos_adapter",
        class_name="EpistemonikosAdapter",
        category="evidence",
        priority=35,
        description="Evidence database in Spanish/Portuguese",
    ),
    AdapterSpec(
        name="europepmc",
        module_path="app.adapters.europepmc_adapter",
        class_name="EuropePMCAdapter",
        category="evidence",
        priority=36,
        description="Europe PubMed Central",
    ),
    AdapterSpec(
        name="nice",
        module_path="app.adapters.nice_adapter",
        class_name="NICEAdapter",
        category="evidence",
        priority=37,
        description="UK NICE clinical guidelines",
    ),
    AdapterSpec(
        name="trip_database",
        module_path="app.adapters.trip_database_adapter",
        class_name="TripDatabaseAdapter",
        category="evidence",
        priority=38,
        description="TRIP clinical search engine",
    ),
    AdapterSpec(
        name="pedro",
        module_path="app.adapters.pedro_adapter",
        class_name="PEDroAdapter",
        category="evidence",
        priority=39,
        description="Physiotherapy Evidence Database",
    ),
    AdapterSpec(
        name="otseeker",
        module_path="app.adapters.otseeker_adapter",
        class_name="OTSeekerAdapter",
        category="evidence",
        priority=40,
        description="Occupational Therapy Systematic Evaluations",
    ),
    # ═══════════════════════════════════════════════════════════════════════════
    #  CATEGORY 5: TERMINOLOGY (5 adapters)
    #  Medical coding systems, classifications
    # ═══════════════════════════════════════════════════════════════════════════
    AdapterSpec(
        name="loinc",
        module_path="app.adapters.loinc_adapter",
        class_name="LOINCAdapter",
        category="terminology",
        priority=41,
        description="Logical Observation Identifiers",
    ),
    AdapterSpec(
        name="snomedct",
        module_path="app.adapters.snomedct_adapter",
        class_name="SNOMEDCTAdapter",
        category="terminology",
        priority=42,
        description="Systematized Nomenclature of Medicine",
    ),
    AdapterSpec(
        name="promis",
        module_path="app.adapters.promis_adapter",
        class_name="PROMISAdapter",
        category="terminology",
        priority=43,
        description="Patient-Reported Outcomes Measurement",
    ),
    AdapterSpec(
        name="ahrq_epss",
        module_path="app.adapters.ahrq_epss_adapter",
        class_name="AHRQEPSSAdapter",
        category="terminology",
        priority=44,
        description="AHRQ Electronic Preventive Services Selector",
    ),
    AdapterSpec(
        name="nih_reporter",
        module_path="app.adapters.nih_reporter_adapter",
        class_name="NIHReporterAdapter",
        category="terminology",
        priority=45,
        description="NIH Research Portfolio Online Reports",
    ),
    # ═══════════════════════════════════════════════════════════════════════════
    #  CATEGORY 6: ADVERSE EVENTS (5 adapters)
    #  Drug safety, side effects, adverse reactions
    # ═══════════════════════════════════════════════════════════════════════════
    AdapterSpec(
        name="openfda",
        module_path="app.adapters.openfda_adapter",
        class_name="OpenFDAAdapter",
        category="adverse_events",
        priority=46,
        description="FDA adverse event reporting",
    ),
    AdapterSpec(
        name="sider",
        module_path="app.adapters.sider_adapter",
        class_name="SIDERAdapter",
        category="adverse_events",
        priority=47,
        description="Side Effect Resource (SIDER)",
    ),
    AdapterSpec(
        name="aeolus",
        module_path="app.adapters.aeolus_adapter",
        class_name="AEOLUSAdapter",
        category="adverse_events",
        priority=48,
        description="Adverse Event Ontology Universe",
    ),
    AdapterSpec(
        name="offsides_twosides",
        module_path="app.adapters.offsides_twosides_adapter",
        class_name="OffsidesTwosidesAdapter",
        category="adverse_events",
        priority=49,
        description="Offsides/Twosides drug interactions",
    ),
    AdapterSpec(
        name="nitrc",
        module_path="app.adapters.nitrc_adapter",
        class_name="NITRCAdapter",
        category="adverse_events",
        priority=50,
        description="Neuroimaging Informatics Tools",
    ),
    # ═══════════════════════════════════════════════════════════════════════════
    #  CATEGORY 7: AI LITERATURE (6 adapters)
    #  AI-powered literature analysis, semantic search
    # ═══════════════════════════════════════════════════════════════════════════
    AdapterSpec(
        name="semantic_scholar",
        module_path="app.adapters.semantic_scholar_adapter",
        class_name="SemanticScholarAdapter",
        category="ai_literature",
        priority=51,
        description="AI-powered academic search",
    ),
    AdapterSpec(
        name="biorxiv",
        module_path="app.adapters.biorxiv_adapter",
        class_name="BioRxivAdapter",
        category="ai_literature",
        priority=52,
        description="Preprint biology server",
    ),
    AdapterSpec(
        name="brainnetome",
        module_path="app.adapters.brainnetome_adapter",
        class_name="BrainnetomeAdapter",
        category="ai_literature",
        priority=53,
        description="Brainnetome atlas and connectivity",
    ),
    AdapterSpec(
        name="glasser2016",
        module_path="app.adapters.glasser2016_adapter",
        class_name="Glasser2016Adapter",
        category="ai_literature",
        priority=54,
        description="Glasser multimodal parcellation",
    ),
    AdapterSpec(
        name="yeo2011",
        module_path="app.adapters.yeo2011_adapter",
        class_name="Yeo2011Adapter",
        category="ai_literature",
        priority=55,
        description="Yeo resting-state networks",
    ),
    AdapterSpec(
        name="gordon2014",
        module_path="app.adapters.gordon2014_adapter",
        class_name="Gordon2014Adapter",
        category="ai_literature",
        priority=56,
        description="Gordon functional parcellation",
    ),
    # ═══════════════════════════════════════════════════════════════════════════
    #  CATEGORY 8: PENDING (10 adapters — planned for future phases)
    #  These adapters are reserved slots for Phase 4+ expansion
    # ═══════════════════════════════════════════════════════════════════════════
    AdapterSpec(
        name="functional_connectomes_1000",
        module_path="app.adapters.functional_connectomes_1000_adapter",
        class_name="FunctionalConnectomes1000Adapter",
        category="pending",
        priority=57,
        description="1000 Functional Connectomes Project",
    ),
    AdapterSpec(
        name="ds030",
        module_path="app.adapters.ds030_adapter",
        class_name="DS030Adapter",
        category="pending",
        priority=58,
        description="OpenfMRI DS030 dataset",
    ),
    AdapterSpec(
        name="allen_brain",
        module_path="app.adapters.allen_brain_adapter",
        class_name="AllenBrainAdapter",
        category="pending",
        priority=59,
        description="Allen Institute Brain Atlas",
    ),
    AdapterSpec(
        name="abide",
        module_path="app.adapters.abide_adapter",
        class_name="ABIDEAdapter",
        category="pending",
        priority=60,
        description="Autism Brain Imaging Data Exchange",
    ),
    AdapterSpec(
        name="adni",
        module_path="app.adapters.adni_adapter",
        class_name="ADNIAdapter",
        category="pending",
        priority=61,
        description="Alzheimers Disease Neuroimaging Initiative",
    ),
    AdapterSpec(
        name="neurosynth",
        module_path="app.adapters.neurosynth_adapter",
        class_name="NeurosynthAdapter",
        category="pending",
        priority=62,
        description="Neurosynth meta-analysis platform",
    ),
    AdapterSpec(
        name="schaefer",
        module_path="app.adapters.schaefer_adapter",
        class_name="SchaeferAdapter",
        category="pending",
        priority=63,
        description="Schaefer cortical parcellation",
    ),
    AdapterSpec(
        name="pubmed_central",
        module_path="app.adapters.pubmed_central_adapter",
        class_name="PubMedCentralAdapter",
        category="pending",
        priority=64,
        description="PubMed Central full-text archive",
    ),
    AdapterSpec(
        name="who_drug_dictionary",
        module_path="app.adapters.who_drug_dictionary_adapter",
        class_name="WHODrugDictionaryAdapter",
        category="pending",
        priority=65,
        description="WHO Drug Dictionary",
    ),
    AdapterSpec(
        name="meddra",
        module_path="app.adapters.meddra_adapter",
        class_name="MedDRAAdapter",
        category="pending",
        priority=66,
        description="Medical Dictionary for Regulatory Activities",
    ),
]

# Quick lookup by name
ADAPTER_BY_NAME: dict[str, AdapterSpec] = {a.name: a for a in ADAPTER_SPECS}


# ═══════════════════════════════════════════════════════════════════════════════
#  ADAPTER WIRING CLASS
# ═══════════════════════════════════════════════════════════════════════════════


class AdapterWiring:
    """Central wiring manager for all 66 adapters.

    Handles:
    - Ordered initialization by category
    - Fault-tolerant loading (individual failures don't crash the system)
    - Health check aggregation
    - Graceful shutdown
    """

    def __init__(self) -> None:
        self.adapters: dict[str, AdapterSpec] = {
            a.name: AdapterSpec(
                name=a.name,
                module_path=a.module_path,
                class_name=a.class_name,
                category=a.category,
                priority=a.priority,
                description=a.description,
            )
            for a in ADAPTER_SPECS
        }
        self._instances: dict[str, Any] = {}
        self._init_order = sorted(self.adapters.values(), key=lambda a: a.priority)
        logger.info("AdapterWiring initialized with %s adapters", len(self.adapters))

    # ── Properties ──────────────────────────────────────────────────────────

    @property
    def total_count(self) -> int:
        return len(self.adapters)

    @property
    def loaded_count(self) -> int:
        return sum(1 for a in self.adapters.values() if a.status == "loaded")

    @property
    def failed_count(self) -> int:
        return sum(1 for a in self.adapters.values() if a.status == "failed")

    @property
    def pending_count(self) -> int:
        return sum(1 for a in self.adapters.values() if a.status == "pending")

    @property
    def by_category(self) -> dict[str, list[AdapterSpec]]:
        result: dict[str, list[AdapterSpec]] = {cat: [] for cat in CATEGORY_ORDER}
        for a in self.adapters.values():
            result.setdefault(a.category, []).append(a)
        return result

    # ── Initialization ──────────────────────────────────────────────────────

    async def initialize_all(self) -> dict[str, Any]:
        """Initialize all adapters in priority order. Fault-tolerant."""
        logger.info("=" * 60)
        logger.info("Adapter Initialization — %s adapters", self.total_count)
        logger.info("=" * 60)

        results = {"loaded": 0, "failed": 0, "pending": 0, "details": {}}

        for spec in self._init_order:
            try:
                instance = await self._load_adapter(spec)
                if instance is not None:
                    spec.status = "loaded"
                    spec.instance = instance
                    self._instances[spec.name] = instance
                    results["loaded"] += 1
                    logger.info(
                        "  [OK] %-30s (%s)", spec.name, spec.description
                    )
                else:
                    # Pending adapters return None gracefully
                    spec.status = "pending"
                    results["pending"] += 1
                    logger.info(
                        "  [..] %-30s (%s) — PENDING", spec.name, spec.description
                    )
            except Exception as exc:
                spec.status = "failed"
                spec.error = str(exc)
                results["failed"] += 1
                logger.warning(
                    "  [FAIL] %-30s — %s", spec.name, exc
                )

        logger.info("=" * 60)
        logger.info(
            "Adapter init complete: %s loaded, %s failed, %s pending",
            results["loaded"], results["failed"], results["pending"],
        )
        logger.info("=" * 60)
        return results

    async def _load_adapter(self, spec: AdapterSpec) -> Any:
        """Load a single adapter. Returns None for pending adapters."""
        if spec.category == "pending":
            # Pending adapters are slots for future phases
            return None

        try:
            module = __import__(spec.module_path, fromlist=[spec.class_name])
            cls = getattr(module, spec.class_name)
            # Try to instantiate; if it requires async init, return the class
            try:
                instance = cls()
                # If the instance has an async initialize method, call it
                if hasattr(instance, "initialize") and callable(getattr(instance, "initialize")):
                    if asyncio.iscoroutinefunction(instance.initialize):
                        await instance.initialize()
                    else:
                        instance.initialize()
                return instance
            except Exception as exc:
                # If instantiation fails, return the class as fallback
                logger.debug("Adapter %s instantiation deferred: %s", spec.name, exc)
                return cls
        except ImportError as exc:
            logger.debug("Adapter %s not available: %s", spec.name, exc)
            return None
        except Exception as exc:
            logger.debug("Adapter %s load error: %s", spec.name, exc)
            return None

    async def initialize_category(self, category: str) -> dict[str, Any]:
        """Initialize only adapters in a specific category."""
        adapters = [a for a in self._init_order if a.category == category]
        results = {"loaded": 0, "failed": 0, "category": category}

        for spec in adapters:
            try:
                instance = await self._load_adapter(spec)
                if instance is not None:
                    spec.status = "loaded"
                    spec.instance = instance
                    self._instances[spec.name] = instance
                    results["loaded"] += 1
                else:
                    spec.status = "pending"
            except Exception as exc:
                spec.status = "failed"
                spec.error = str(exc)
                results["failed"] += 1

        return results

    # ── Health Checks ───────────────────────────────────────────────────────

    async def health_check(self, name: str) -> dict[str, Any]:
        """Health check a single adapter."""
        spec = self.adapters.get(name)
        if spec is None:
            return {"name": name, "status": "unknown", "error": "Adapter not found"}

        if spec.status == "pending":
            return {"name": name, "status": "pending", "description": spec.description}

        if spec.instance is None:
            return {"name": name, "status": "not_loaded", "description": spec.description}

        # Try to call health check on instance
        try:
            if hasattr(spec.instance, "health_check") and callable(
                getattr(spec.instance, "health_check")
            ):
                if asyncio.iscoroutinefunction(spec.instance.health_check):
                    hc_result = await spec.instance.health_check()
                else:
                    hc_result = spec.instance.health_check()
                return {
                    "name": name,
                    "status": "healthy" if hc_result else "degraded",
                    "description": spec.description,
                    "detail": hc_result,
                }
            else:
                return {
                    "name": name,
                    "status": "healthy",
                    "description": spec.description,
                    "note": "no health_check method",
                }
        except Exception as exc:
            return {
                "name": name,
                "status": "unhealthy",
                "description": spec.description,
                "error": str(exc),
            }

    async def health_check_all(self) -> dict[str, Any]:
        """Health check all adapters. Returns aggregated results."""
        results = []
        healthy = 0
        unhealthy = 0
        pending = 0

        for spec in self._init_order:
            result = await self.health_check(spec.name)
            results.append(result)
            if result["status"] in ("healthy",):
                healthy += 1
            elif result["status"] in ("unhealthy", "degraded", "not_loaded"):
                unhealthy += 1
            else:
                pending += 1

        return {
            "total": self.total_count,
            "healthy": healthy,
            "unhealthy": unhealthy,
            "pending": pending,
            "by_category": {
                cat: [r for r in results if self.adapters.get(r["name"], AdapterSpec("", "", "", "", 0, "")).category == cat]
                for cat in CATEGORY_ORDER
            },
            "adapters": results,
        }

    # ── Graceful Shutdown ───────────────────────────────────────────────────

    async def shutdown(self) -> dict[str, Any]:
        """Gracefully shutdown all loaded adapters."""
        logger.info("Adapter Wiring — shutting down %s instances...", len(self._instances))
        results = {"closed": 0, "errors": 0, "details": {}}

        for name, instance in self._instances.items():
            try:
                if hasattr(instance, "close") and callable(getattr(instance, "close")):
                    if asyncio.iscoroutinefunction(instance.close):
                        await instance.close()
                    else:
                        instance.close()
                    results["closed"] += 1
                    logger.info("  Adapter closed: %s", name)
                elif hasattr(instance, "shutdown") and callable(getattr(instance, "shutdown")):
                    if asyncio.iscoroutinefunction(instance.shutdown):
                        await instance.shutdown()
                    else:
                        instance.shutdown()
                    results["closed"] += 1
                    logger.info("  Adapter shutdown: %s", name)
                else:
                    results["closed"] += 1  # Nothing to close, counts as OK
            except Exception as exc:
                results["errors"] += 1
                results["details"][name] = str(exc)
                logger.warning("  Adapter shutdown error for %s: %s", name, exc)

        self._instances.clear()
        logger.info("Adapter Wiring — shutdown complete: %s closed, %s errors", results["closed"], results["errors"])
        return results

    # ── Query Interface ─────────────────────────────────────────────────────

    def get_adapter(self, name: str) -> Any:
        """Get a loaded adapter instance by name."""
        return self._instances.get(name)

    def list_loaded(self) -> list[str]:
        """List names of all loaded adapters."""
        return [name for name, inst in self._instances.items() if inst is not None]

    def list_by_category(self, category: str) -> list[str]:
        """List adapter names in a category."""
        return [a.name for a in self.adapters.values() if a.category == category]

    def get_status(self) -> dict[str, Any]:
        """Get overall wiring status."""
        return {
            "total": self.total_count,
            "loaded": self.loaded_count,
            "failed": self.failed_count,
            "pending": self.pending_count,
            "categories": {
                cat: {
                    "total": len(adapters),
                    "loaded": sum(1 for a in adapters if a.status == "loaded"),
                    "failed": sum(1 for a in adapters if a.status == "failed"),
                    "pending": sum(1 for a in adapters if a.status == "pending"),
                    "adapters": [
                        {"name": a.name, "status": a.status, "description": a.description}
                        for a in adapters
                    ],
                }
                for cat, adapters in self.by_category.items()
            },
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  HEALTH CHECK AGGREGATION
# ═══════════════════════════════════════════════════════════════════════════════


class HealthCheckAggregator:
    """Aggregates health checks across all subsystems."""

    def __init__(self) -> None:
        self.checks: dict[str, Callable[[], Awaitable[dict[str, Any]]]] = {}
        self._results: dict[str, Any] = {}

    def register(
        self,
        name: str,
        check_fn: Callable[[], Awaitable[dict[str, Any]]],
    ) -> None:
        """Register a health check function."""
        self.checks[name] = check_fn
        logger.debug("Health check registered: %s", name)

    async def run_all(self) -> dict[str, Any]:
        """Run all registered health checks."""
        results = {}
        overall = "healthy"

        for name, check_fn in self.checks.items():
            try:
                result = await check_fn()
                results[name] = result
                if result.get("status") in ("unhealthy", "failed", "error"):
                    overall = "degraded"
            except Exception as exc:
                results[name] = {"status": "error", "error": str(exc)}
                overall = "degraded"

        self._results = results
        return {
            "overall": overall,
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
            "checks": results,
        }

    def get_last_results(self) -> dict[str, Any]:
        """Return cached results from last run."""
        return self._results


# ═══════════════════════════════════════════════════════════════════════════════
#  SINGLETON INSTANCE
# ═══════════════════════════════════════════════════════════════════════════════

_wiring: Optional[AdapterWiring] = None
_health_aggregator: Optional[HealthCheckAggregator] = None


def get_adapter_wiring() -> AdapterWiring:
    """Get or create the singleton AdapterWiring instance."""
    global _wiring
    if _wiring is None:
        _wiring = AdapterWiring()
    return _wiring


def get_health_aggregator() -> HealthCheckAggregator:
    """Get or create the singleton HealthCheckAggregator."""
    global _health_aggregator
    if _health_aggregator is None:
        _health_aggregator = HealthCheckAggregator()
    return _health_aggregator
