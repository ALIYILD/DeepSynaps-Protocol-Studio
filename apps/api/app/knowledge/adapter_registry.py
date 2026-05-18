"""
DeepSynaps Knowledge Layer — Adapter Registry v2

Auto-discover and manage all external database adapters.
66 adapters registered across 4 phases.

Usage:
    from app.knowledge.adapter_registry import AdapterRegistry
    registry = AdapterRegistry()
    adapters = registry.list_adapters()
    stats = registry.get_stats()
"""

import logging
from typing import List, Dict, Optional, Any, Type
from datetime import datetime

logger = logging.getLogger(__name__)

# ─── PHASE 1 — P0 Adapters (9) ───
from app.knowledge.rxnorm_adapter import RxNormAdapter
from app.knowledge.pharmgkb_adapter import PharmGKBAdapter
from app.knowledge.clinvar_adapter import ClinVarAdapter
from app.knowledge.loinc_adapter import LOINCAdapter
from app.knowledge.openfda_adapter import OpenFDAAdapter
from app.knowledge.chbmp_adapter import CHBMPAdapter
from app.knowledge.mni_atlas_adapter import MNIAtlasAdapter
from app.knowledge.promis_adapter import PROMISAdapter
from app.knowledge.simnibs_adapter import SimNIBSAdapter

# ─── PHASE 2 — P1 Adapters (7) ───
from app.knowledge.faers_adapter import FAERSAdapter
from app.knowledge.onsides_adapter import OnSIDESAdapter
from app.knowledge.allen_brain_adapter import AllenBrainAdapter
from app.knowledge.schaefer_adapter import SchaeferAdapter
from app.knowledge.neurosynth_adapter import NeurosynthAdapter
from app.knowledge.adni_adapter import ADNIAdapter
from app.knowledge.abide_adapter import ABIDEAdapter

# ─── PHASE 3 — P0 Adapters (29) ───
# Batch 1: Neuroimaging (5)
from app.knowledge.neurovault_adapter import NeuroVaultAdapter
from app.knowledge.hcp_adapter import HCPAdapter
from app.knowledge.openneuro_adapter import OpenNeuroAdapter
from app.knowledge.oasis_adapter import OASISAdapter
from app.knowledge.hcp_aging_adapter import HCPAgingAdapter
# Batch 2: Pharma / Terminology (5)
from app.knowledge.drugbank_adapter import DrugBankAdapter
from app.knowledge.chembl_adapter import ChEMBLAdapter
from app.knowledge.pubchem_adapter import PubChemAdapter
from app.knowledge.dailymed_adapter import DailyMedAdapter
from app.knowledge.snomedct_adapter import SNOMEDCTAdapter
# Batch 3: Evidence / Literature (5)
from app.knowledge.pubmed_adapter import PubMedAdapter
from app.knowledge.cochrane_adapter import CochraneAdapter
from app.knowledge.clinicaltrials_adapter import ClinicalTrialsAdapter
from app.knowledge.europepmc_adapter import EuropePMCAdapter
from app.knowledge.nice_adapter import NICEAdapter
# Batch 4: Genetics (5)
from app.knowledge.gwas_catalog_adapter import GWASCatalogAdapter
from app.knowledge.dbsnp_adapter import DbSNPAdapter
from app.knowledge.ensembl_adapter import EnsemblAdapter
from app.knowledge.gnomad_adapter import GnomADAdapter
from app.knowledge.uniprot_adapter import UniProtAdapter
# Batch 5: Atlas / Analytics (5)
from app.knowledge.string_adapter import STRINGAdapter
from app.knowledge.myvariant_adapter import MyVariantAdapter
from app.knowledge.yeo2011_adapter import Yeo2011Adapter
from app.knowledge.gordon2014_adapter import Gordon2014Adapter
from app.knowledge.adhd200_adapter import ADHD200Adapter
# Batch 6: Adverse Events / AI Literature (4)
from app.knowledge.semantic_scholar_adapter import SemanticScholarAdapter
from app.knowledge.aeolus_adapter import AEOLUSAdapter
from app.knowledge.sider_adapter import SIDERAdapter
from app.knowledge.offsides_twosides_adapter import OffsidesTwosidesAdapter

# ─── PHASE 4 — P1 Adapters (21) ───
# Batch A: Neuroimaging (5)
from app.knowledge.functional_connectomes_1000_adapter import FunctionalConnectomes1000Adapter
from app.knowledge.nitrc_adapter import NITRCAdapter
from app.knowledge.glasser2016_adapter import Glasser2016Adapter
from app.knowledge.brainnetome_adapter import BrainnetomeAdapter
from app.knowledge.ixi_adapter import IXIAdapter
# Batch B: Neuroimaging (5)
from app.knowledge.cobre_adapter import COBREAdapter
from app.knowledge.corr_adapter import CORRAdapter
from app.knowledge.ds030_adapter import DS030Adapter
from app.knowledge.gsp_adapter import GSPAdapter
from app.knowledge.hcp_lifespan_adapter import HCPLifespanAdapter
# Batch C: Pharma / Evidence (5)
from app.knowledge.orange_book_adapter import OrangeBookAdapter
from app.knowledge.ndc_directory_adapter import NDCDirectoryAdapter
from app.knowledge.unii_adapter import UNIIAdapter
from app.knowledge.otseeker_adapter import OTseekerAdapter
from app.knowledge.pedro_adapter import PEDROAdapter
# Batch D: Evidence (6)
from app.knowledge.ahrq_epss_adapter import AHRQEPSSAdapter
from app.knowledge.trip_database_adapter import TRIPDatabaseAdapter
from app.knowledge.epistemonikos_adapter import EpistemonikosAdapter
from app.knowledge.nih_reporter_adapter import NIHReporterAdapter
from app.knowledge.core_adapter import COREAdapter
from app.knowledge.biorxiv_adapter import BioRxivAdapter

# ──────────────────────────────────────────────────────────────────────────────
# REGISTRY DEFINITION — ALL 66 ADAPTERS
# ──────────────────────────────────────────────────────────────────────────────

ADAPTER_REGISTRY: Dict[str, Dict[str, Any]] = {
    # ═══════════════════════════════════════════════════════════════════
    # PHASE 1: P0 Adapters (9)
    # ═══════════════════════════════════════════════════════════════════
    "rxnorm": {"class": RxNormAdapter, "display_name": "RxNorm", "category": "pharmaceutical", "phase": 1, "access": "open", "data_types": ["medication"], "description": "Normalized drug names (NIH/NLM)"},
    "pharmgkb": {"class": PharmGKBAdapter, "display_name": "PharmGKB", "category": "pharmacogenomics", "phase": 1, "access": "register", "data_types": ["genetic_variant", "medication"], "description": "Pharmacogenomics knowledge base (Stanford)"},
    "clinvar": {"class": ClinVarAdapter, "display_name": "ClinVar", "category": "genetics", "phase": 1, "access": "open", "data_types": ["genetic_variant"], "description": "Genetic variant significance (NCBI)"},
    "loinc": {"class": LOINCAdapter, "display_name": "LOINC", "category": "terminology", "phase": 1, "access": "register", "data_types": ["lab_observation"], "description": "Lab observation codes (Regenstrief)"},
    "openfda": {"class": OpenFDAAdapter, "display_name": "openFDA", "category": "pharmaceutical", "phase": 1, "access": "open", "data_types": ["adverse_event", "medication"], "description": "FDA drug adverse events and recalls"},
    "chbmp": {"class": CHBMPAdapter, "display_name": "CHBMP", "category": "neuroimaging", "phase": 1, "access": "academic", "data_types": ["brain_atlas"], "description": "Chinese Brain Mapping Project"},
    "mni_atlas": {"class": MNIAtlasAdapter, "display_name": "MNI Atlas", "category": "neuroimaging", "phase": 1, "access": "open", "data_types": ["brain_atlas"], "description": "Neuroimaging atlases (McGill)"},
    "promis": {"class": PROMISAdapter, "display_name": "PROMIS", "category": "outcomes", "phase": 1, "access": "register", "data_types": ["patient_reported_outcome"], "description": "Patient-reported outcomes (NIH)"},
    "simnibs": {"class": SimNIBSAdapter, "display_name": "SimNIBS", "category": "simulation", "phase": 1, "access": "open", "data_types": ["simulation"], "description": "tDCS/TMS simulation (DTU)"},
    # ═══════════════════════════════════════════════════════════════════
    # PHASE 2: P1 Adapters (7)
    # ═══════════════════════════════════════════════════════════════════
    "faers": {"class": FAERSAdapter, "display_name": "FAERS", "category": "adverse_event", "phase": 2, "access": "open", "data_types": ["adverse_event"], "description": "FDA Adverse Event Reporting System"},
    "onsides": {"class": OnSIDESAdapter, "display_name": "OnSIDES", "category": "adverse_event", "phase": 2, "access": "open", "data_types": ["adverse_event", "medication"], "description": "Drug side effect frequency (Stanford/OHSU)"},
    "allen_brain": {"class": AllenBrainAdapter, "display_name": "Allen Brain Atlas", "category": "genetics", "phase": 2, "access": "open", "data_types": ["gene_expression"], "description": "Gene expression atlas (Allen Institute)"},
    "schaefer": {"class": SchaeferAdapter, "display_name": "Schaefer Atlas", "category": "neuroimaging", "phase": 2, "access": "open", "data_types": ["brain_atlas"], "description": "Brain parcellation 400-1000 regions (Harvard)"},
    "neurosynth": {"class": NeurosynthAdapter, "display_name": "Neurosynth", "category": "neuroimaging", "phase": 2, "access": "open", "data_types": ["meta_analysis"], "description": "Neuroimaging meta-analysis (Stanford)"},
    "adni": {"class": ADNIAdapter, "display_name": "ADNI", "category": "neuroimaging", "phase": 2, "access": "restricted", "data_types": ["neuroimaging", "clinical"], "description": "Alzheimer's Disease Neuroimaging Initiative"},
    "abide": {"class": ABIDEAdapter, "display_name": "ABIDE", "category": "neuroimaging", "phase": 2, "access": "register", "data_types": ["neuroimaging", "clinical"], "description": "Autism Brain Imaging Data Exchange"},
    # ═══════════════════════════════════════════════════════════════════
    # PHASE 3: Batch 1 — Neuroimaging (5)
    # ═══════════════════════════════════════════════════════════════════
    "neurovault": {"class": NeuroVaultAdapter, "display_name": "NeuroVault", "category": "neuroimaging", "phase": 3, "access": "open", "data_types": ["statistical_map"], "description": "200K+ statistical brain maps"},
    "hcp": {"class": HCPAdapter, "display_name": "Human Connectome Project", "category": "neuroimaging", "phase": 3, "access": "register", "data_types": ["neuroimaging"], "description": "Gold standard connectome data (1,200+ subjects)"},
    "openneuro": {"class": OpenNeuroAdapter, "display_name": "OpenNeuro", "category": "neuroimaging", "phase": 3, "access": "open", "data_types": ["neuroimaging"], "description": "500+ raw neuroimaging datasets (BIDS)"},
    "oasis": {"class": OASISAdapter, "display_name": "OASIS", "category": "neuroimaging", "phase": 3, "access": "open", "data_types": ["neuroimaging", "clinical"], "description": "1,000+ aging and dementia MRI scans"},
    "hcp_aging": {"class": HCPAgingAdapter, "display_name": "HCP Aging", "category": "neuroimaging", "phase": 3, "access": "register", "data_types": ["neuroimaging"], "description": "Lifespan connectome data (36-100+ years)"},
    # Phase 3: Batch 2 — Pharma / Terminology (5)
    "drugbank": {"class": DrugBankAdapter, "display_name": "DrugBank", "category": "pharmaceutical", "phase": 3, "access": "academic", "data_types": ["medication", "drug_interaction"], "description": "15K+ drugs, 280K+ interactions (Univ. Alberta)"},
    "chembl": {"class": ChEMBLAdapter, "display_name": "ChEMBL", "category": "pharmaceutical", "phase": 3, "access": "open", "data_types": ["bioactivity", "compound"], "description": "2M+ bioactivity records (EMBL-EBI)"},
    "pubchem": {"class": PubChemAdapter, "display_name": "PubChem", "category": "pharmaceutical", "phase": 3, "access": "open", "data_types": ["chemical_structure"], "description": "110M+ chemical structures (NCBI)"},
    "dailymed": {"class": DailyMedAdapter, "display_name": "DailyMed", "category": "pharmaceutical", "phase": 3, "access": "open", "data_types": ["drug_label"], "description": "FDA-approved drug labels (NLM)"},
    "snomedct": {"class": SNOMEDCTAdapter, "display_name": "SNOMED CT", "category": "terminology", "phase": 3, "access": "academic", "data_types": ["clinical_concept"], "description": "350K+ clinical concepts (IHTSDO)"},
    # Phase 3: Batch 3 — Evidence / Literature (5)
    "pubmed": {"class": PubMedAdapter, "display_name": "PubMed / MEDLINE", "category": "literature", "phase": 3, "access": "open", "data_types": ["literature", "citation"], "description": "35M+ biomedical citations (NLM)"},
    "cochrane": {"class": CochraneAdapter, "display_name": "Cochrane Library", "category": "evidence", "phase": 3, "access": "open", "data_types": ["systematic_review"], "description": "Gold standard systematic reviews"},
    "clinicaltrials": {"class": ClinicalTrialsAdapter, "display_name": "ClinicalTrials.gov", "category": "evidence", "phase": 3, "access": "open", "data_types": ["clinical_trial"], "description": "400K+ registered clinical trials (NIH)"},
    "europepmc": {"class": EuropePMCAdapter, "display_name": "Europe PMC", "category": "literature", "phase": 3, "access": "open", "data_types": ["literature", "full_text"], "description": "40M+ biomedical articles (EMBL-EBI)"},
    "nice": {"class": NICEAdapter, "display_name": "NICE Evidence", "category": "guideline", "phase": 3, "access": "open", "data_types": ["clinical_guideline"], "description": "UK National clinical guidelines"},
    # Phase 3: Batch 4 — Genetics (5)
    "gwas_catalog": {"class": GWASCatalogAdapter, "display_name": "GWAS Catalog", "category": "genetics", "phase": 3, "access": "open", "data_types": ["genetic_association"], "description": "500K+ genome-wide associations (EMBL-EBI)"},
    "dbsnp": {"class": DbSNPAdapter, "display_name": "dbSNP", "category": "genetics", "phase": 3, "access": "open", "data_types": ["genetic_variant"], "description": "600M+ submitted SNPs (NCBI)"},
    "ensembl": {"class": EnsemblAdapter, "display_name": "Ensembl", "category": "genetics", "phase": 3, "access": "open", "data_types": ["genome_annotation"], "description": "Genome browser for 200+ species (EMBL-EBI)"},
    "gnomad": {"class": GnomADAdapter, "display_name": "gnomAD", "category": "genetics", "phase": 3, "access": "open", "data_types": ["population_genetics"], "description": "807K+ exomes, 76K+ genomes (Broad)"},
    "uniprot": {"class": UniProtAdapter, "display_name": "UniProt", "category": "genetics", "phase": 3, "access": "open", "data_types": ["protein"], "description": "250M+ protein sequences"},
    # Phase 3: Batch 5 — Atlas / Analytics (5)
    "string": {"class": STRINGAdapter, "display_name": "STRING", "category": "genetics", "phase": 3, "access": "open", "data_types": ["protein_interaction"], "description": "67M+ protein-protein interactions"},
    "myvariant": {"class": MyVariantAdapter, "display_name": "MyVariant.info", "category": "genetics", "phase": 3, "access": "open", "data_types": ["variant_annotation"], "description": "Variant annotation aggregator (20+ DBs)"},
    "yeo2011": {"class": Yeo2011Adapter, "display_name": "Yeo 2011 Atlas", "category": "neuroimaging", "phase": 3, "access": "open", "data_types": ["brain_atlas"], "description": "7/17 functional brain networks (Harvard)"},
    "gordon2014": {"class": Gordon2014Adapter, "display_name": "Gordon 2014 Atlas", "category": "neuroimaging", "phase": 3, "access": "open", "data_types": ["brain_atlas"], "description": "333 cortical areas, 13 networks (WashU)"},
    "adhd200": {"class": ADHD200Adapter, "display_name": "ADHD-200", "category": "neuroimaging", "phase": 3, "access": "open", "data_types": ["neuroimaging", "clinical"], "description": "ADHD resting-state fMRI (973 subjects)"},
    # Phase 3: Batch 6 — Adverse Events / AI Literature (4)
    "semantic_scholar": {"class": SemanticScholarAdapter, "display_name": "Semantic Scholar", "category": "literature", "phase": 3, "access": "open", "data_types": ["literature"], "description": "AI-powered literature search (AI2)"},
    "aeolus": {"class": AEOLUSAdapter, "display_name": "AEOLUS", "category": "adverse_event", "phase": 3, "access": "open", "data_types": ["adverse_event"], "description": "Standardized FAERS adverse events (NLM)"},
    "sider": {"class": SIDERAdapter, "display_name": "SIDER", "category": "adverse_event", "phase": 3, "access": "open", "data_types": ["adverse_event", "medication"], "description": "Drug side effects (EMBL-EBI)"},
    "offsides_twosides": {"class": OffsidesTwosidesAdapter, "display_name": "OFFSIDES / TWOSIDES", "category": "adverse_event", "phase": 3, "access": "open", "data_types": ["adverse_event", "drug_interaction"], "description": "Drug side effects & interactions (Columbia)"},
    # ═══════════════════════════════════════════════════════════════════
    # PHASE 4: P1 Adapters (21)
    # ═══════════════════════════════════════════════════════════════════
    # Batch A: Neuroimaging (5)
    "functional_connectomes_1000": {"class": FunctionalConnectomes1000Adapter, "display_name": "1000 Functional Connectomes", "category": "neuroimaging", "phase": 4, "access": "open", "data_types": ["neuroimaging"], "description": "35 sites, resting-state fMRI"},
    "nitrc": {"class": NITRCAdapter, "display_name": "NITRC", "category": "neuroimaging", "phase": 4, "access": "open", "data_types": ["neuroimaging", "tools"], "description": "Neuroimaging tools & resources registry"},
    "glasser2016": {"class": Glasser2016Adapter, "display_name": "Glasser 2016 Atlas", "category": "neuroimaging", "phase": 4, "access": "open", "data_types": ["brain_atlas"], "description": "360 cortical areas, HCP multi-modal"},
    "brainnetome": {"class": BrainnetomeAdapter, "display_name": "Brainnetome Atlas", "category": "neuroimaging", "phase": 4, "access": "open", "data_types": ["brain_atlas"], "description": "246 regions, connectivity-based"},
    "ixi": {"class": IXIAdapter, "display_name": "IXI Dataset", "category": "neuroimaging", "phase": 4, "access": "open", "data_types": ["neuroimaging"], "description": "600 healthy subjects, T1/T2/MRA (KCL)"},
    # Batch B: Neuroimaging (5)
    "cobre": {"class": COBREAdapter, "display_name": "COBRE", "category": "neuroimaging", "phase": 4, "access": "open", "data_types": ["neuroimaging", "clinical"], "description": "Schizophrenia 72 patients + 74 controls"},
    "corr": {"class": CORRAdapter, "display_name": "CORR", "category": "neuroimaging", "phase": 4, "access": "open", "data_types": ["neuroimaging"], "description": "33 datasets, test-retest reliability"},
    "ds030": {"class": DS030Adapter, "display_name": "UCLA ds030", "category": "neuroimaging", "phase": 4, "access": "open", "data_types": ["neuroimaging", "clinical"], "description": "272 subjects, phenomics (BIDS)"},
    "gsp": {"class": GSPAdapter, "display_name": "Brain Genomics Superstruct", "category": "neuroimaging", "phase": 4, "access": "register", "data_types": ["neuroimaging"], "description": "1,570 subjects, structural + resting-state (Harvard)"},
    "hcp_lifespan": {"class": HCPLifespanAdapter, "display_name": "HCP Lifespan", "category": "neuroimaging", "phase": 4, "access": "register", "data_types": ["neuroimaging"], "description": "1,260+ subjects, multi-cohort lifespan"},
    # Batch C: Pharma / Evidence (5)
    "orange_book": {"class": OrangeBookAdapter, "display_name": "Orange Book", "category": "pharmaceutical", "phase": 4, "access": "open", "data_types": ["medication"], "description": "FDA approved drug products with patents"},
    "ndc_directory": {"class": NDCDirectoryAdapter, "display_name": "NDC Directory", "category": "pharmaceutical", "phase": 4, "access": "open", "data_types": ["medication"], "description": "300K+ drug product identifiers (FDA)"},
    "unii": {"class": UNIIAdapter, "display_name": "UNII", "category": "pharmaceutical", "phase": 4, "access": "open", "data_types": ["substance"], "description": "200K+ substance identifiers (FDA)"},
    "otseeker": {"class": OTseekerAdapter, "display_name": "OTseeker", "category": "evidence", "phase": 4, "access": "open", "data_types": ["systematic_review"], "description": "Occupational therapy evidence (10K+ records)"},
    "pedro": {"class": PEDROAdapter, "display_name": "PEDro", "category": "evidence", "phase": 4, "access": "open", "data_types": ["clinical_trial"], "description": "Physiotherapy evidence database (50K+ trials)"},
    # Batch D: Evidence (6)
    "ahrq_epss": {"class": AHRQEPSSAdapter, "display_name": "AHRQ ePSS", "category": "guideline", "phase": 4, "access": "open", "data_types": ["clinical_guideline"], "description": "USPSTF preventive services recommendations"},
    "trip_database": {"class": TRIPDatabaseAdapter, "display_name": "TRIP Database", "category": "evidence", "phase": 4, "access": "freemium", "data_types": ["evidence"], "description": "Clinical search engine (500K+ sources)"},
    "epistemonikos": {"class": EpistemonikosAdapter, "display_name": "Epistemonikos", "category": "evidence", "phase": 4, "access": "open", "data_types": ["systematic_review"], "description": "100K+ systematic reviews + evidence"},
    "nih_reporter": {"class": NIHReporterAdapter, "display_name": "NIH RePORTER", "category": "research", "phase": 4, "access": "open", "data_types": ["funding"], "description": "3M+ funded research projects (NIH)"},
    "core": {"class": COREAdapter, "display_name": "CORE", "category": "literature", "phase": 4, "access": "open", "data_types": ["literature"], "description": "200M+ open access research articles"},
    "biorxiv": {"class": BioRxivAdapter, "display_name": "bioRxiv / medRxiv", "category": "literature", "phase": 4, "access": "open", "data_types": ["preprint"], "description": "300K+ biology and medicine preprints"},
}


# ──────────────────────────────────────────────────────────────────────────────
# REGISTRY CLASS
# ──────────────────────────────────────────────────────────────────────────────

class AdapterRegistry:
    """Central registry for managing all 66 knowledge layer adapters."""

    def __init__(self):
        self._instances: Dict[str, Any] = {}
        self._registry = ADAPTER_REGISTRY

    def list_adapters(self, category: Optional[str] = None,
                      phase: Optional[int] = None,
                      access: Optional[str] = None) -> List[Dict[str, Any]]:
        """List registered adapters with optional filtering."""
        results = []
        for key, meta in self._registry.items():
            if category and meta["category"] != category:
                continue
            if phase and meta["phase"] != phase:
                continue
            if access and meta["access"] != access:
                continue
            results.append({
                "key": key,
                "display_name": meta["display_name"],
                "category": meta["category"],
                "phase": meta["phase"],
                "access": meta["access"],
                "data_types": meta["data_types"],
                "description": meta["description"],
            })
        return results

    def get_adapter(self, key: str) -> Any:
        """Get or create an adapter instance by key."""
        if key not in self._registry:
            raise KeyError(f"Unknown adapter: {key}. Registered: {list(self._registry.keys())}")
        if key not in self._instances:
            adapter_class = self._registry[key]["class"]
            self._instances[key] = adapter_class()
        return self._instances[key]

    def get_categories(self) -> List[str]:
        """Return all unique adapter categories."""
        return sorted(set(m["category"] for m in self._registry.values()))

    def get_stats(self) -> Dict[str, Any]:
        """Return registry statistics."""
        total = len(self._registry)
        by_phase = {}
        by_access = {}
        by_category = {}
        for meta in self._registry.values():
            by_phase[meta["phase"]] = by_phase.get(meta["phase"], 0) + 1
            by_access[meta["access"]] = by_access.get(meta["access"], 0) + 1
            by_category[meta["category"]] = by_category.get(meta["category"], 0) + 1
        return {
            "total_adapters": total,
            "by_phase": by_phase,
            "by_access": by_access,
            "by_category": by_category,
            "categories": sorted(by_category.keys()),
            "timestamp": datetime.utcnow().isoformat(),
        }

    async def search(self, query: str, databases: Optional[List[str]] = None,
                     filters: Optional[Dict] = None) -> List[Dict]:
        """Search across multiple adapters simultaneously."""
        targets = databases or list(self._registry.keys())
        results = []
        for key in targets:
            try:
                adapter = self.get_adapter(key)
                if await adapter.validate_connection():
                    search_results = await adapter.search(query, filters)
                    for r in search_results:
                        r["_adapter"] = key
                        r["_provenance"] = adapter.get_provenance(r)
                    results.extend(search_results)
            except Exception as e:
                logger.warning(f"Adapter {key} search failed: {e}")
        return results

    async def close_all(self):
        """Close all adapter connections."""
        for key, instance in self._instances.items():
            try:
                await instance.close()
            except Exception as e:
                logger.warning(f"Error closing adapter {key}: {e}")
        self._instances.clear()


# Singleton instance
_registry_instance: Optional[AdapterRegistry] = None

def get_registry() -> AdapterRegistry:
    """Get the singleton AdapterRegistry instance."""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = AdapterRegistry()
    return _registry_instance
