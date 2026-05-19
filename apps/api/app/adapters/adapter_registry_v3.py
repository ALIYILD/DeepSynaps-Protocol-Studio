"""
DeepSynaps Knowledge Layer — Adapter Registry v3
================================================

Complete fault-tolerant rewrite with:
- Individual try/except per adapter import
- 12-category intelligent routing
- Dependency injection support
- Health-check endpoint ready
- Hot-reload capability
- Graceful degradation when adapters fail

Usage:
    registry = AdapterRegistry()
    await registry.initialize()
    adapter = registry.get("rxnorm")
    pharma = registry.get_by_category("pharmaceutical")
    health = registry.health_check()
"""

from __future__ import annotations

import re
import asyncio
import logging
import importlib
import time
from typing import List, Dict, Optional, Any, Callable, Type
from dataclasses import dataclass, field
from datetime import datetime
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Dependency Injection Container
# ---------------------------------------------------------------------------

class DIContainer:
    """Lightweight dependency injection container for adapters."""

    def __init__(self):
        self._services: Dict[str, Any] = {}
        self._factories: Dict[str, Callable[[], Any]] = {}

    def register(self, name: str, instance: Any) -> None:
        """Register a singleton instance."""
        self._services[name] = instance

    def register_factory(self, name: str, factory: Callable[[], Any]) -> None:
        """Register a factory function."""
        self._factories[name] = factory

    def resolve(self, name: str) -> Optional[Any]:
        """Resolve a dependency by name."""
        if name in self._services:
            return self._services[name]
        if name in self._factories:
            try:
                instance = self._factories[name]()
                self._services[name] = instance
                return instance
            except Exception as e:
                logger.error(f"DI factory '{name}' failed: {e}")
                return None
        return None

    def has(self, name: str) -> bool:
        """Check if a service is registered."""
        return name in self._services or name in self._factories


# ---------------------------------------------------------------------------
# Adapter Metadata
# ---------------------------------------------------------------------------

@dataclass
class AdapterMeta:
    """Rich metadata for a single adapter entry."""
    key: str
    class_name: str
    module: str
    display_name: str
    category: str
    phase: int
    access: str
    data_types: List[str]
    description: str
    confidence: float = 0.95
    status: str = "unknown"  # active | degraded | unavailable | unknown
    dependencies: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    url: str = ""
    api_version: str = "1.0"
    retry_policy: Dict[str, Any] = field(default_factory=lambda: {
        "max_retries": 3,
        "backoff_factor": 1.5,
        "timeout_seconds": 30,
    })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "class_name": self.class_name,
            "module": self.module,
            "display_name": self.display_name,
            "category": self.category,
            "phase": self.phase,
            "access": self.access,
            "data_types": self.data_types,
            "description": self.description,
            "confidence": self.confidence,
            "status": self.status,
            "dependencies": self.dependencies,
            "tags": self.tags,
            "url": self.url,
            "api_version": self.api_version,
            "retry_policy": self.retry_policy,
        }


# ═══════════════════════════════════════════════════════════════════════════════
# ADAPTER REGISTRY — ALL 66 ADAPTERS ACROSS 12 CATEGORIES
# ═══════════════════════════════════════════════════════════════════════════════

ADAPTER_REGISTRY: Dict[str, Dict[str, Any]] = {
    # ════════════════════════════════════════════════════════════════════════
    # 1. PHARMACEUTICAL (11)
    # ════════════════════════════════════════════════════════════════════════
    "rxnorm": {
        "class_name": "RxNormAdapter",
        "module": "app.knowledge.rxnorm_adapter",
        "display_name": "RxNorm",
        "category": "pharmaceutical",
        "phase": 1,
        "access": "free",
        "data_types": ["drug", "medication", "ndc"],
        "confidence": 0.95,
        "description": "Normalized drug names (NIH/NLM)",
        "tags": ["drug", "terminology", "NLM"],
    },
    "drugbank": {
        "class_name": "DrugBankAdapter",
        "module": "app.knowledge.drugbank_adapter",
        "display_name": "DrugBank",
        "category": "pharmaceutical",
        "phase": 3,
        "access": "academic",
        "data_types": ["drug", "medication", "drug_interaction"],
        "confidence": 0.92,
        "description": "15K+ drugs, 280K+ interactions (Univ. Alberta)",
        "tags": ["drug", "interaction", "pharma"],
    },
    "openfda": {
        "class_name": "OpenFDAAdapter",
        "module": "app.knowledge.openfda_adapter",
        "display_name": "openFDA",
        "category": "pharmaceutical",
        "phase": 1,
        "access": "free",
        "data_types": ["drug", "adverse_event", "recall"],
        "confidence": 0.93,
        "description": "FDA drug adverse events and recalls",
        "tags": ["FDA", "safety", "regulatory"],
    },
    "pubchem": {
        "class_name": "PubChemAdapter",
        "module": "app.knowledge.pubchem_adapter",
        "display_name": "PubChem",
        "category": "pharmaceutical",
        "phase": 3,
        "access": "free",
        "data_types": ["chemical_structure", "compound"],
        "confidence": 0.94,
        "description": "110M+ chemical structures (NCBI)",
        "tags": ["chemistry", "structure", "NCBI"],
    },
    "chembl": {
        "class_name": "ChEMBLAdapter",
        "module": "app.knowledge.chembl_adapter",
        "display_name": "ChEMBL",
        "category": "pharmaceutical",
        "phase": 3,
        "access": "free",
        "data_types": ["bioactivity", "compound", "drug"],
        "confidence": 0.93,
        "description": "2M+ bioactivity records (EMBL-EBI)",
        "tags": ["bioactivity", "EMBL-EBI"],
    },
    "dailymed": {
        "class_name": "DailyMedAdapter",
        "module": "app.knowledge.dailymed_adapter",
        "display_name": "DailyMed",
        "category": "pharmaceutical",
        "phase": 3,
        "access": "free",
        "data_types": ["drug_label", "medication"],
        "confidence": 0.91,
        "description": "FDA-approved drug labels (NLM)",
        "tags": ["label", "FDA", "NLM"],
    },
    "orange_book": {
        "class_name": "OrangeBookAdapter",
        "module": "app.knowledge.orange_book_adapter",
        "display_name": "Orange Book",
        "category": "pharmaceutical",
        "phase": 4,
        "access": "free",
        "data_types": ["drug", "patent"],
        "confidence": 0.90,
        "description": "FDA approved drug products with patents",
        "tags": ["FDA", "patent", "approval"],
    },
    "ndc_directory": {
        "class_name": "NDCDirectoryAdapter",
        "module": "app.knowledge.ndc_directory_adapter",
        "display_name": "NDC Directory",
        "category": "pharmaceutical",
        "phase": 4,
        "access": "free",
        "data_types": ["drug", "ndc", "medication"],
        "confidence": 0.92,
        "description": "300K+ drug product identifiers (FDA)",
        "tags": ["NDC", "identifier", "FDA"],
    },
    "unii": {
        "class_name": "UNIIAdapter",
        "module": "app.knowledge.unii_adapter",
        "display_name": "UNII",
        "category": "pharmaceutical",
        "phase": 4,
        "access": "free",
        "data_types": ["substance", "identifier"],
        "confidence": 0.92,
        "description": "200K+ substance identifiers (FDA)",
        "tags": ["identifier", "substance", "FDA"],
    },
    "pharmgkb": {
        "class_name": "PharmGKBAdapter",
        "module": "app.knowledge.pharmgkb_adapter",
        "display_name": "PharmGKB",
        "category": "pharmaceutical",
        "phase": 1,
        "access": "register",
        "data_types": ["drug", "genetic_variant", "medication"],
        "confidence": 0.94,
        "description": "Pharmacogenomics knowledge base (Stanford)",
        "tags": ["pharmacogenomics", "Stanford", "genetics"],
    },
    "aeolus": {
        "class_name": "AEOLUSAdapter",
        "module": "app.knowledge.aeolus_adapter",
        "display_name": "AEOLUS",
        "category": "pharmaceutical",
        "phase": 3,
        "access": "free",
        "data_types": ["drug", "adverse_event"],
        "confidence": 0.88,
        "description": "Standardized FAERS adverse events (NLM)",
        "tags": ["FAERS", "adverse_event", "NLM"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 2. GENETIC (14)
    # ════════════════════════════════════════════════════════════════════════
    "dbsnp": {
        "class_name": "DbSNPAdapter",
        "module": "app.knowledge.dbsnp_adapter",
        "display_name": "dbSNP",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["genetic_variant", "snp"],
        "confidence": 0.95,
        "description": "600M+ submitted SNPs (NCBI)",
        "tags": ["SNP", "variant", "NCBI"],
    },
    "clinvar": {
        "class_name": "ClinVarAdapter",
        "module": "app.knowledge.clinvar_adapter",
        "display_name": "ClinVar",
        "category": "genetic",
        "phase": 1,
        "access": "free",
        "data_types": ["genetic_variant", "clinical_significance"],
        "confidence": 0.96,
        "description": "Genetic variant significance (NCBI)",
        "tags": ["variant", "clinical", "NCBI"],
    },
    "gwas_catalog": {
        "class_name": "GWASCatalogAdapter",
        "module": "app.knowledge.gwas_catalog_adapter",
        "display_name": "GWAS Catalog",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["genetic_association", "snp", "trait"],
        "confidence": 0.94,
        "description": "500K+ genome-wide associations (EMBL-EBI)",
        "tags": ["GWAS", "association", "EMBL-EBI"],
    },
    "ensembl": {
        "class_name": "EnsemblAdapter",
        "module": "app.knowledge.ensembl_adapter",
        "display_name": "Ensembl",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["genome_annotation", "gene", "transcript"],
        "confidence": 0.95,
        "description": "Genome browser for 200+ species (EMBL-EBI)",
        "tags": ["genome", "browser", "EMBL-EBI"],
    },
    "uniprot": {
        "class_name": "UniProtAdapter",
        "module": "app.knowledge.uniprot_adapter",
        "display_name": "UniProt",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["protein", "sequence", "function"],
        "confidence": 0.95,
        "description": "250M+ protein sequences",
        "tags": ["protein", "sequence", "function"],
    },
    "gnomad": {
        "class_name": "GnomADAdapter",
        "module": "app.knowledge.gnomad_adapter",
        "display_name": "gnomAD",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["population_genetics", "variant_frequency"],
        "confidence": 0.94,
        "description": "807K+ exomes, 76K+ genomes (Broad)",
        "tags": ["population", "frequency", "Broad"],
    },
    "disgenet": {
        "class_name": "DisGeNETAdapter",
        "module": "app.knowledge.disgenet_adapter",
        "display_name": "DisGeNET",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["disease", "gene_association", "variant"],
        "confidence": 0.92,
        "description": "Gene-disease associations and variant-disease associations",
        "tags": ["disease", "gene", "variant"],
    },
    "opentargets": {
        "class_name": "OpenTargetsAdapter",
        "module": "app.knowledge.opentargets_adapter",
        "display_name": "Open Targets",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["drug_target", "disease", "evidence"],
        "confidence": 0.93,
        "description": "Target-disease evidence and drug discovery platform",
        "tags": ["drug", "target", "evidence"],
    },
    "string": {
        "class_name": "STRINGAdapter",
        "module": "app.knowledge.string_adapter",
        "display_name": "STRING",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["protein_interaction", "network"],
        "confidence": 0.93,
        "description": "67M+ protein-protein interactions",
        "tags": ["PPI", "network", "protein"],
    },
    "myvariant": {
        "class_name": "MyVariantAdapter",
        "module": "app.knowledge.myvariant_adapter",
        "display_name": "MyVariant.info",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["variant_annotation", "snp"],
        "confidence": 0.91,
        "description": "Variant annotation aggregator (20+ DBs)",
        "tags": ["variant", "annotation", "aggregator"],
    },
    "biogrid": {
        "class_name": "BioGRIDAdapter",
        "module": "app.knowledge.biogrid_adapter",
        "display_name": "BioGRID",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["protein_interaction", "genetic_interaction"],
        "confidence": 0.92,
        "description": "Protein and genetic interaction database",
        "tags": ["interaction", "protein", "genetic"],
    },
    "reactome": {
        "class_name": "ReactomeAdapter",
        "module": "app.knowledge.reactome_adapter",
        "display_name": "Reactome",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["pathway", "reaction", "protein"],
        "confidence": 0.93,
        "description": "Curated biological pathways database",
        "tags": ["pathway", "biology", "reaction"],
    },
    "kegg": {
        "class_name": "KEGGAdapter",
        "module": "app.knowledge.kegg_adapter",
        "display_name": "KEGG",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["pathway", "disease", "drug", "gene"],
        "confidence": 0.93,
        "description": "Kyoto Encyclopedia of Genes and Genomes",
        "tags": ["pathway", "disease", "drug"],
    },
    "omim": {
        "class_name": "OMIMAdapter",
        "module": "app.knowledge.omim_adapter",
        "display_name": "OMIM",
        "category": "genetic",
        "phase": 3,
        "access": "free",
        "data_types": ["disease", "gene", "phenotype"],
        "confidence": 0.94,
        "description": "Online Mendelian Inheritance in Man catalog",
        "tags": ["disease", "gene", "phenotype"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 3. CLINICAL_EVIDENCE (12)
    # ════════════════════════════════════════════════════════════════════════
    "pubmed": {
        "class_name": "PubMedAdapter",
        "module": "app.knowledge.pubmed_adapter",
        "display_name": "PubMed / MEDLINE",
        "category": "clinical_evidence",
        "phase": 3,
        "access": "free",
        "data_types": ["literature", "citation", "abstract"],
        "confidence": 0.97,
        "description": "35M+ biomedical citations (NLM)",
        "tags": ["literature", "citation", "NLM"],
    },
    "clinicaltrials": {
        "class_name": "ClinicalTrialsAdapter",
        "module": "app.knowledge.clinicaltrials_adapter",
        "display_name": "ClinicalTrials.gov",
        "category": "clinical_evidence",
        "phase": 3,
        "access": "free",
        "data_types": ["clinical_trial", "study", "protocol"],
        "confidence": 0.95,
        "description": "400K+ registered clinical trials (NIH)",
        "tags": ["trial", "NIH", "registry"],
    },
    "cochrane": {
        "class_name": "CochraneAdapter",
        "module": "app.knowledge.cochrane_adapter",
        "display_name": "Cochrane Library",
        "category": "clinical_evidence",
        "phase": 3,
        "access": "free",
        "data_types": ["systematic_review", "meta_analysis"],
        "confidence": 0.96,
        "description": "Gold standard systematic reviews",
        "tags": ["review", "evidence", "Cochrane"],
    },
    "nice": {
        "class_name": "NICEAdapter",
        "module": "app.knowledge.nice_adapter",
        "display_name": "NICE Evidence",
        "category": "clinical_evidence",
        "phase": 3,
        "access": "free",
        "data_types": ["clinical_guideline", "recommendation"],
        "confidence": 0.94,
        "description": "UK National clinical guidelines",
        "tags": ["guideline", "UK", "NICE"],
    },
    "trip_database": {
        "class_name": "TRIPDatabaseAdapter",
        "module": "app.knowledge.trip_database_adapter",
        "display_name": "TRIP Database",
        "category": "clinical_evidence",
        "phase": 4,
        "access": "freemium",
        "data_types": ["evidence", "guideline", "systematic_review"],
        "confidence": 0.90,
        "description": "Clinical search engine (500K+ sources)",
        "tags": ["search", "evidence", "clinical"],
    },
    "epistemonikos": {
        "class_name": "EpistemonikosAdapter",
        "module": "app.knowledge.epistemonikos_adapter",
        "display_name": "Epistemonikos",
        "category": "clinical_evidence",
        "phase": 4,
        "access": "free",
        "data_types": ["systematic_review", "evidence"],
        "confidence": 0.91,
        "description": "100K+ systematic reviews + evidence",
        "tags": ["review", "evidence", "Spanish"],
    },
    "pubmed_central": {
        "class_name": "PubMedCentralAdapter",
        "module": "app.knowledge.pubmed_central_adapter",
        "display_name": "PubMed Central",
        "category": "clinical_evidence",
        "phase": 3,
        "access": "free",
        "data_types": ["full_text", "literature"],
        "confidence": 0.95,
        "description": "Free full-text biomedical literature archive",
        "tags": ["full-text", "literature", "NLM"],
    },
    "europepmc": {
        "class_name": "EuropePMCAdapter",
        "module": "app.knowledge.europepmc_adapter",
        "display_name": "Europe PMC",
        "category": "clinical_evidence",
        "phase": 3,
        "access": "free",
        "data_types": ["literature", "full_text", "citation"],
        "confidence": 0.94,
        "description": "40M+ biomedical articles (EMBL-EBI)",
        "tags": ["literature", "Europe", "EMBL-EBI"],
    },
    "crossref": {
        "class_name": "CrossrefAdapter",
        "module": "app.knowledge.crossref_adapter",
        "display_name": "Crossref",
        "category": "clinical_evidence",
        "phase": 4,
        "access": "free",
        "data_types": ["citation", "doi", "metadata"],
        "confidence": 0.93,
        "description": "Scholarly citation metadata and DOI registry",
        "tags": ["citation", "DOI", "metadata"],
    },
    "acp": {
        "class_name": "ACPAdapter",
        "module": "app.knowledge.acp_adapter",
        "display_name": "Annals of Internal Medicine",
        "category": "clinical_evidence",
        "phase": 4,
        "access": "freemium",
        "data_types": ["clinical_guideline", "systematic_review"],
        "confidence": 0.93,
        "description": "ACP clinical guidelines and recommendations",
        "tags": ["guideline", "internal_medicine", "ACP"],
    },
    "dynamed": {
        "class_name": "DynaMedAdapter",
        "module": "app.knowledge.dynamed_adapter",
        "display_name": "DynaMed",
        "category": "clinical_evidence",
        "phase": 4,
        "access": "subscription",
        "data_types": ["clinical_guideline", "evidence_summary"],
        "confidence": 0.92,
        "description": "Evidence-based clinical decision support",
        "tags": ["decision_support", "evidence", "EBM"],
    },
    "eudract": {
        "class_name": "EudraCTAdapter",
        "module": "app.knowledge.eudract_adapter",
        "display_name": "EudraCT",
        "category": "clinical_evidence",
        "phase": 4,
        "access": "free",
        "data_types": ["clinical_trial", "registry"],
        "confidence": 0.91,
        "description": "EU Clinical Trials Register",
        "tags": ["EU", "trial", "registry"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 4. NEUROIMAGING (18)
    # ════════════════════════════════════════════════════════════════════════
    "neurovault": {
        "class_name": "NeuroVaultAdapter",
        "module": "app.knowledge.neurovault_adapter",
        "display_name": "NeuroVault",
        "category": "neuroimaging",
        "phase": 3,
        "access": "free",
        "data_types": ["statistical_map", "brain_map"],
        "confidence": 0.93,
        "description": "200K+ statistical brain maps",
        "tags": ["fMRI", "maps", "sharing"],
    },
    "openneuro": {
        "class_name": "OpenNeuroAdapter",
        "module": "app.knowledge.openneuro_adapter",
        "display_name": "OpenNeuro",
        "category": "neuroimaging",
        "phase": 3,
        "access": "free",
        "data_types": ["neuroimaging", "MRI", "fMRI", "BIDS"],
        "confidence": 0.94,
        "description": "500+ raw neuroimaging datasets (BIDS)",
        "tags": ["BIDS", "MRI", "open_science"],
    },
    "brainmap": {
        "class_name": "BrainMapAdapter",
        "module": "app.knowledge.brainmap_adapter",
        "display_name": "BrainMap",
        "category": "neuroimaging",
        "phase": 4,
        "access": "free",
        "data_types": ["functional_imaging", "coordinate", "meta_analysis"],
        "confidence": 0.90,
        "description": "Functional neuroimaging coordinate database",
        "tags": ["coordinate", "fMRI", "meta-analysis"],
    },
    "neurosynth": {
        "class_name": "NeurosynthAdapter",
        "module": "app.knowledge.neurosynth_adapter",
        "display_name": "Neurosynth",
        "category": "neuroimaging",
        "phase": 2,
        "access": "free",
        "data_types": ["meta_analysis", "term_map", "coordinate"],
        "confidence": 0.92,
        "description": "Neuroimaging meta-analysis (Stanford)",
        "tags": ["meta-analysis", "fMRI", "Stanford"],
    },
    "albaba": {
        "class_name": "AllenBrainAdapter",
        "module": "app.knowledge.allen_brain_adapter",
        "display_name": "Allen Brain Atlas",
        "category": "neuroimaging",
        "phase": 2,
        "access": "free",
        "data_types": ["gene_expression", "brain_map", "atlas"],
        "confidence": 0.94,
        "description": "Gene expression atlas (Allen Institute)",
        "tags": ["expression", "atlas", "Allen"],
    },
    "adhd200": {
        "class_name": "ADHD200Adapter",
        "module": "app.knowledge.adhd200_adapter",
        "display_name": "ADHD-200",
        "category": "neuroimaging",
        "phase": 3,
        "access": "free",
        "data_types": ["neuroimaging", "resting_state", "clinical"],
        "confidence": 0.90,
        "description": "ADHD resting-state fMRI (973 subjects)",
        "tags": ["ADHD", "resting-state", "fMRI"],
    },
    "nsg": {
        "class_name": "NITRCAdapter",
        "module": "app.knowledge.nitrc_adapter",
        "display_name": "NITRC",
        "category": "neuroimaging",
        "phase": 4,
        "access": "free",
        "data_types": ["neuroimaging", "tools", "software"],
        "confidence": 0.89,
        "description": "Neuroimaging tools & resources registry",
        "tags": ["tools", "software", "registry"],
    },
    "oasis": {
        "class_name": "OASISAdapter",
        "module": "app.knowledge.oasis_adapter",
        "display_name": "OASIS",
        "category": "neuroimaging",
        "phase": 3,
        "access": "free",
        "data_types": ["neuroimaging", "aging", "dementia", "MRI"],
        "confidence": 0.92,
        "description": "1,000+ aging and dementia MRI scans",
        "tags": ["aging", "dementia", "MRI", "OASIS"],
    },
    "hcp": {
        "class_name": "HCPAdapter",
        "module": "app.knowledge.hcp_adapter",
        "display_name": "Human Connectome Project",
        "category": "neuroimaging",
        "phase": 3,
        "access": "register",
        "data_types": ["neuroimaging", "connectome", "MRI"],
        "confidence": 0.95,
        "description": "Gold standard connectome data (1,200+ subjects)",
        "tags": ["connectome", "HCP", "MRI"],
    },
    "ukbiobank": {
        "class_name": "UKBiobankAdapter",
        "module": "app.knowledge.ukbiobank_adapter",
        "display_name": "UK Biobank",
        "category": "neuroimaging",
        "phase": 4,
        "access": "register",
        "data_types": ["neuroimaging", "genetic", "health_record"],
        "confidence": 0.94,
        "description": "500K+ participants imaging-genetics-health data",
        "tags": ["UK", "biobank", "genetics", "MRI"],
    },
    "ebrains": {
        "class_name": "EBRAINSAdapter",
        "module": "app.knowledge.ebrains_adapter",
        "display_name": "EBRAINS",
        "category": "neuroimaging",
        "phase": 4,
        "access": "free",
        "data_types": ["neuroimaging", "atlases", "models"],
        "confidence": 0.91,
        "description": "European brain research infrastructures",
        "tags": ["Europe", "infrastructure", "atlas"],
    },
    "neuromaps": {
        "class_name": "NeuromapsAdapter",
        "module": "app.knowledge.neuromaps_adapter",
        "display_name": "neuromaps",
        "category": "neuroimaging",
        "phase": 4,
        "access": "free",
        "data_types": ["brain_map", "transformation", "atlas"],
        "confidence": 0.90,
        "description": "Structural and functional brain mapping tools",
        "tags": ["mapping", "transformation", "atlas"],
    },
    "connectivity_map": {
        "class_name": "ConnectivityMapAdapter",
        "module": "app.knowledge.connectivity_map_adapter",
        "display_name": "Connectivity Map",
        "category": "neuroimaging",
        "phase": 4,
        "access": "free",
        "data_types": ["connectivity", "network", "brain_map"],
        "confidence": 0.88,
        "description": "Brain connectivity mapping and visualization",
        "tags": ["connectivity", "network", "visualization"],
    },
    "brainatlas": {
        "class_name": "BrainAtlasAdapter",
        "module": "app.knowledge.brainatlas_adapter",
        "display_name": "Brain Atlas",
        "category": "neuroimaging",
        "phase": 4,
        "access": "free",
        "data_types": ["atlas", "parcellation", "region"],
        "confidence": 0.90,
        "description": "Multi-species brain atlas repository",
        "tags": ["atlas", "parcellation", "species"],
    },
    "cneuromod": {
        "class_name": "CNeuroModAdapter",
        "module": "app.knowledge.cneuromod_adapter",
        "display_name": "Courtois NeuroMod",
        "category": "neuroimaging",
        "phase": 4,
        "access": "free",
        "data_types": ["neuroimaging", "movie", "naturalistic"],
        "confidence": 0.87,
        "description": "Naturalistic neuroimaging dataset (10 subjects, 250h)",
        "tags": ["naturalistic", "movie", "fMRI"],
    },
    "openfmri": {
        "class_name": "OpenfMRIAdapter",
        "module": "app.knowledge.openfmri_adapter",
        "display_name": "OpenfMRI",
        "category": "neuroimaging",
        "phase": 4,
        "access": "free",
        "data_types": ["neuroimaging", "task_fMRI", "BIDS"],
        "confidence": 0.88,
        "description": "Legacy OpenfMRI repository (now OpenNeuro)",
        "tags": ["legacy", "task", "fMRI"],
    },
    "functionalconnectomes": {
        "class_name": "FunctionalConnectomes1000Adapter",
        "module": "app.knowledge.functional_connectomes_1000_adapter",
        "display_name": "1000 Functional Connectomes",
        "category": "neuroimaging",
        "phase": 4,
        "access": "free",
        "data_types": ["neuroimaging", "resting_state", "connectome"],
        "confidence": 0.89,
        "description": "35 sites, resting-state fMRI",
        "tags": ["resting-state", "connectome", "multi-site"],
    },
    "schaefer": {
        "class_name": "SchaeferAdapter",
        "module": "app.knowledge.schaefer_adapter",
        "display_name": "Schaefer Atlas",
        "category": "neuroimaging",
        "phase": 2,
        "access": "free",
        "data_types": ["brain_atlas", "parcellation", "network"],
        "confidence": 0.92,
        "description": "Brain parcellation 400-1000 regions (Harvard)",
        "tags": ["parcellation", "Harvard", "network"],
    },
    "hcp_lifespan": {
        "class_name": "HCPLifespanAdapter",
        "module": "app.knowledge.hcp_lifespan_adapter",
        "display_name": "HCP Lifespan",
        "category": "neuroimaging",
        "phase": 4,
        "access": "register",
        "data_types": ["neuroimaging", "lifespan", "connectome"],
        "confidence": 0.92,
        "description": "1,260+ subjects, multi-cohort lifespan",
        "tags": ["lifespan", "connectome", "development"],
    },
    "hcp_aging": {
        "class_name": "HCPAgingAdapter",
        "module": "app.knowledge.hcp_aging_adapter",
        "display_name": "HCP Aging",
        "category": "neuroimaging",
        "phase": 3,
        "access": "register",
        "data_types": ["neuroimaging", "aging", "connectome"],
        "confidence": 0.92,
        "description": "Lifespan connectome data (36-100+ years)",
        "tags": ["aging", "connectome", "lifespan"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 5. NEUROMODULATION (6)
    # ════════════════════════════════════════════════════════════════════════
    "clin_neurophysiology": {
        "class_name": "ClinicalNeurophysiologyAdapter",
        "module": "app.knowledge.clin_neurophysiology_adapter",
        "display_name": "Clinical Neurophysiology",
        "category": "neuromodulation",
        "phase": 4,
        "access": "free",
        "data_types": ["EEG", "EMG", "EP", "clinical"],
        "confidence": 0.88,
        "description": "Clinical neurophysiology data and standards (IFCN)",
        "tags": ["EEG", "EMG", "clinical"],
    },
    "ieeg": {
        "class_name": "IEEGAdapter",
        "module": "app.knowledge.ieeg_adapter",
        "display_name": "iEEG.org",
        "category": "neuromodulation",
        "phase": 4,
        "access": "register",
        "data_types": ["iEEG", "seizure", "electrocorticography"],
        "confidence": 0.90,
        "description": "Intracranial EEG data sharing platform",
        "tags": ["iEEG", "epilepsy", "invasive"],
    },
    "tms_atlas": {
        "class_name": "TMSAtlasAdapter",
        "module": "app.knowledge.tms_atlas_adapter",
        "display_name": "TMS Atlas",
        "category": "neuromodulation",
        "phase": 4,
        "access": "free",
        "data_types": ["TMS", "motor_map", "stimulation"],
        "confidence": 0.87,
        "description": "Transcranial magnetic stimulation mapping atlas",
        "tags": ["TMS", "motor", "mapping"],
    },
    "deepbrain": {
        "class_name": "DeepBrainAdapter",
        "module": "app.knowledge.deepbrain_adapter",
        "display_name": "DeepBrain Stimulation Atlas",
        "category": "neuromodulation",
        "phase": 4,
        "access": "free",
        "data_types": ["DBS", "stimulation_target", "atlas"],
        "confidence": 0.86,
        "description": "Deep brain stimulation targeting atlas",
        "tags": ["DBS", "targeting", "stimulation"],
    },
    "neuromodevices": {
        "class_name": "NeuromodDevicesAdapter",
        "module": "app.knowledge.neuromodevices_adapter",
        "display_name": "Neuromodulation Devices",
        "category": "neuromodulation",
        "phase": 4,
        "access": "free",
        "data_types": ["device", "regulatory", "safety"],
        "confidence": 0.85,
        "description": "Neuromodulation device registry and safety data",
        "tags": ["device", "FDA", "safety"],
    },
    "simnibs": {
        "class_name": "SimNIBSAdapter",
        "module": "app.knowledge.simnibs_adapter",
        "display_name": "SimNIBS",
        "category": "neuromodulation",
        "phase": 1,
        "access": "free",
        "data_types": ["simulation", "TMS", "tDCS", "E_field"],
        "confidence": 0.91,
        "description": "tDCS/TMS simulation (DTU)",
        "tags": ["simulation", "tDCS", "TMS", "DTU"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 6. ADVERSE_EVENTS (6)
    # ════════════════════════════════════════════════════════════════════════
    "faers": {
        "class_name": "FAERSAdapter",
        "module": "app.knowledge.faers_adapter",
        "display_name": "FAERS",
        "category": "adverse_events",
        "phase": 2,
        "access": "free",
        "data_types": ["adverse_event", "drug_safety", "report"],
        "confidence": 0.93,
        "description": "FDA Adverse Event Reporting System",
        "tags": ["FDA", "safety", "report"],
    },
    "meddra": {
        "class_name": "MedDRAAdapter",
        "module": "app.knowledge.meddra_adapter",
        "display_name": "MedDRA",
        "category": "adverse_events",
        "phase": 4,
        "access": "register",
        "data_types": ["adverse_event", "terminology", "coding"],
        "confidence": 0.92,
        "description": "Medical Dictionary for Regulatory Activities",
        "tags": ["terminology", "ICH", "regulatory"],
    },
    "vigibase": {
        "class_name": "VigiBaseAdapter",
        "module": "app.knowledge.vigibase_adapter",
        "display_name": "VigiBase",
        "category": "adverse_events",
        "phase": 4,
        "access": "register",
        "data_types": ["adverse_event", "drug_safety", "global"],
        "confidence": 0.90,
        "description": "WHO global adverse drug reaction database",
        "tags": ["WHO", "global", "safety"],
    },
    "whoadr": {
        "class_name": "WHOADRAdapter",
        "module": "app.knowledge.whoadr_adapter",
        "display_name": "WHO-ADR",
        "category": "adverse_events",
        "phase": 4,
        "access": "free",
        "data_types": ["adverse_event", "drug_reaction"],
        "confidence": 0.88,
        "description": "WHO adverse drug reactions monitoring",
        "tags": ["WHO", "ADR", "monitoring"],
    },
    "ich": {
        "class_name": "ICHAdapter",
        "module": "app.knowledge.ich_adapter",
        "display_name": "ICH Guidelines",
        "category": "adverse_events",
        "phase": 4,
        "access": "free",
        "data_types": ["regulatory_guideline", "safety_standard"],
        "confidence": 0.91,
        "description": "ICH pharmacovigilance guidelines (E2A-E2D)",
        "tags": ["ICH", "guideline", "regulatory"],
    },
    "ctcae": {
        "class_name": "CTCAEAdapter",
        "module": "app.knowledge.ctcae_adapter",
        "display_name": "CTCAE",
        "category": "adverse_events",
        "phase": 4,
        "access": "free",
        "data_types": ["adverse_event", "toxicity", "grading"],
        "confidence": 0.92,
        "description": "Common Terminology Criteria for Adverse Events (NCI)",
        "tags": ["toxicity", "grading", "oncology", "NCI"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 7. ELECTROPHYSIOLOGY (4)
    # ════════════════════════════════════════════════════════════════════════
    "eegbase": {
        "class_name": "EEGBaseAdapter",
        "module": "app.knowledge.eegbase_adapter",
        "display_name": "EEGBase",
        "category": "electrophysiology",
        "phase": 4,
        "access": "free",
        "data_types": ["EEG", "dataset", "experiment"],
        "confidence": 0.87,
        "description": "EEG experiment data repository",
        "tags": ["EEG", "data", "repository"],
    },
    "eeglab_datasets": {
        "class_name": "EEGLABDatasetsAdapter",
        "module": "app.knowledge.eeglab_datasets_adapter",
        "display_name": "EEGLAB Datasets",
        "category": "electrophysiology",
        "phase": 4,
        "access": "free",
        "data_types": ["EEG", "tutorial", "sample"],
        "confidence": 0.85,
        "description": "EEGLAB sample and tutorial datasets",
        "tags": ["EEGLAB", "tutorial", "sample"],
    },
    "openeeg": {
        "class_name": "OpenEEGAdapter",
        "module": "app.knowledge.openeeg_adapter",
        "display_name": "OpenEEG",
        "category": "electrophysiology",
        "phase": 4,
        "access": "free",
        "data_types": ["EEG", "open_source", "hardware"],
        "confidence": 0.83,
        "description": "Open-source EEG hardware and software community",
        "tags": ["open-source", "hardware", "EEG"],
    },
    "sleepedf": {
        "class_name": "SleepEDFAdapter",
        "module": "app.knowledge.sleepedf_adapter",
        "display_name": "Sleep-EDF",
        "category": "electrophysiology",
        "phase": 4,
        "access": "free",
        "data_types": ["EEG", "sleep", "polysomnography"],
        "confidence": 0.88,
        "description": "Sleep EEG and polysomnography datasets",
        "tags": ["sleep", "PSG", "EEG"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 8. DIAGNOSIS_CODING (5)
    # ════════════════════════════════════════════════════════════════════════
    "icd10": {
        "class_name": "ICD10Adapter",
        "module": "app.knowledge.icd10_adapter",
        "display_name": "ICD-10",
        "category": "diagnosis_coding",
        "phase": 4,
        "access": "free",
        "data_types": ["diagnosis", "code", "billing"],
        "confidence": 0.96,
        "description": "International Classification of Diseases 10th Revision",
        "tags": ["diagnosis", "WHO", "coding"],
    },
    "snomedct": {
        "class_name": "SNOMEDCTAdapter",
        "module": "app.knowledge.snomedct_adapter",
        "display_name": "SNOMED CT",
        "category": "diagnosis_coding",
        "phase": 3,
        "access": "academic",
        "data_types": ["clinical_concept", "code", "ontology"],
        "confidence": 0.96,
        "description": "350K+ clinical concepts (IHTSDO)",
        "tags": ["terminology", "ontology", "clinical"],
    },
    "mesh": {
        "class_name": "MeSHAdapter",
        "module": "app.knowledge.mesh_adapter",
        "display_name": "MeSH",
        "category": "diagnosis_coding",
        "phase": 4,
        "access": "free",
        "data_types": ["descriptor", "ontology", "indexing"],
        "confidence": 0.95,
        "description": "Medical Subject Headings (NLM)",
        "tags": ["ontology", "NLM", "indexing"],
    },
    "umls": {
        "class_name": "UMLSAdapter",
        "module": "app.knowledge.umls_adapter",
        "display_name": "UMLS",
        "category": "diagnosis_coding",
        "phase": 4,
        "access": "register",
        "data_types": ["terminology_mapping", "concept", "crosswalk"],
        "confidence": 0.95,
        "description": "Unified Medical Language System (NLM)",
        "tags": ["terminology", "mapping", "NLM"],
    },
    "ols": {
        "class_name": "OLSAdapter",
        "module": "app.knowledge.ols_adapter",
        "display_name": "Ontology Lookup Service",
        "category": "diagnosis_coding",
        "phase": 4,
        "access": "free",
        "data_types": ["ontology", "term", "search"],
        "confidence": 0.91,
        "description": "EMBL-EBI ontology lookup and search",
        "tags": ["ontology", "EBI", "search"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 9. NEUROSCIENCE_SOCIETY (5)
    # ════════════════════════════════════════════════════════════════════════
    "sfn": {
        "class_name": "SFNAdapter",
        "module": "app.knowledge.sfn_adapter",
        "display_name": "Society for Neuroscience",
        "category": "neuroscience_society",
        "phase": 4,
        "access": "free",
        "data_types": ["conference", "abstract", "researcher"],
        "confidence": 0.88,
        "description": "SfN annual meeting abstracts and researcher directory",
        "tags": ["SfN", "conference", "abstract"],
    },
    "braincongress": {
        "class_name": "BrainCongressAdapter",
        "module": "app.knowledge.braincongress_adapter",
        "display_name": "Brain Congress",
        "category": "neuroscience_society",
        "phase": 4,
        "access": "free",
        "data_types": ["conference", "proceeding", "neuroscience"],
        "confidence": 0.85,
        "description": "International Brain Research Organization proceedings",
        "tags": ["IBRO", "conference", "international"],
    },
    "neurology_academy": {
        "class_name": "NeurologyAcademyAdapter",
        "module": "app.knowledge.neurology_academy_adapter",
        "display_name": "Neurology Academy",
        "category": "neuroscience_society",
        "phase": 4,
        "access": "free",
        "data_types": ["education", "training", "certification"],
        "confidence": 0.84,
        "description": "Neurology professional education and training resources",
        "tags": ["education", "training", "neurology"],
    },
    "epilepsy_foundation": {
        "class_name": "EpilepsyFoundationAdapter",
        "module": "app.knowledge.epilepsy_foundation_adapter",
        "display_name": "Epilepsy Foundation",
        "category": "neuroscience_society",
        "phase": 4,
        "access": "free",
        "data_types": ["patient_resource", "education", "support"],
        "confidence": 0.86,
        "description": "Epilepsy patient resources and professional network",
        "tags": ["epilepsy", "patient", "support"],
    },
    "movement_disorder": {
        "class_name": "MovementDisorderAdapter",
        "module": "app.knowledge.movement_disorder_adapter",
        "display_name": "Movement Disorder Society",
        "category": "neuroscience_society",
        "phase": 4,
        "access": "free",
        "data_types": ["conference", "guideline", "research"],
        "confidence": 0.87,
        "description": "International Parkinson and Movement Disorder Society",
        "tags": ["Parkinson", "movement", "MDS"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 10. STANDARDS_GUIDELINES (5)
    # ════════════════════════════════════════════════════════════════════════
    "ieee_neuro": {
        "class_name": "IEEENeuroAdapter",
        "module": "app.knowledge.ieee_neuro_adapter",
        "display_name": "IEEE Neurotechnology Standards",
        "category": "standards_guidelines",
        "phase": 4,
        "access": "free",
        "data_types": ["standard", "neurotechnology", "BCI"],
        "confidence": 0.87,
        "description": "IEEE standards for neurotechnology and BCIs",
        "tags": ["IEEE", "standard", "BCI"],
    },
    "neuromod_standards": {
        "class_name": "NeuromodStandardsAdapter",
        "module": "app.knowledge.neuromod_standards_adapter",
        "display_name": "Neuromodulation Standards",
        "category": "standards_guidelines",
        "phase": 4,
        "access": "free",
        "data_types": ["standard", "neuromodulation", "protocol"],
        "confidence": 0.86,
        "description": "Neuromodulation clinical practice standards",
        "tags": ["standard", "practice", "protocol"],
    },
    "iso_neuro": {
        "class_name": "ISONeuroAdapter",
        "module": "app.knowledge.iso_neuro_adapter",
        "display_name": "ISO Neurotechnology",
        "category": "standards_guidelines",
        "phase": 4,
        "access": "free",
        "data_types": ["standard", "safety", "device"],
        "confidence": 0.87,
        "description": "ISO neurotechnology device safety standards",
        "tags": ["ISO", "safety", "device"],
    },
    "fda_guidance": {
        "class_name": "FDAGuidanceAdapter",
        "module": "app.knowledge.fda_guidance_adapter",
        "display_name": "FDA Neuro Device Guidance",
        "category": "standards_guidelines",
        "phase": 4,
        "access": "free",
        "data_types": ["guidance", "regulatory", "neurodevice"],
        "confidence": 0.90,
        "description": "FDA guidance for neurological devices",
        "tags": ["FDA", "guidance", "device"],
    },
    "eu_mdr": {
        "class_name": "EUMDRAdapter",
        "module": "app.knowledge.eu_mdr_adapter",
        "display_name": "EU MDR",
        "category": "standards_guidelines",
        "phase": 4,
        "access": "free",
        "data_types": ["regulatory", "medical_device", "EU"],
        "confidence": 0.89,
        "description": "EU Medical Device Regulation for neurodevices",
        "tags": ["EU", "MDR", "regulatory"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 11. LITERATURE (4)
    # ════════════════════════════════════════════════════════════════════════
    "semantic_scholar": {
        "class_name": "SemanticScholarAdapter",
        "module": "app.knowledge.semantic_scholar_adapter",
        "display_name": "Semantic Scholar",
        "category": "literature",
        "phase": 3,
        "access": "free",
        "data_types": ["literature", "citation", "AI_summary"],
        "confidence": 0.92,
        "description": "AI-powered literature search (AI2)",
        "tags": ["AI", "literature", "search"],
    },
    "openalex": {
        "class_name": "OpenAlexAdapter",
        "module": "app.knowledge.openalex_adapter",
        "display_name": "OpenAlex",
        "category": "literature",
        "phase": 4,
        "access": "free",
        "data_types": ["literature", "bibliographic", "open_access"],
        "confidence": 0.92,
        "description": "Open bibliographic catalog of scholarly works",
        "tags": ["open_access", "catalog", "bibliographic"],
    },
    "dimensions": {
        "class_name": "DimensionsAdapter",
        "module": "app.knowledge.dimensions_adapter",
        "display_name": "Dimensions",
        "category": "literature",
        "phase": 4,
        "access": "register",
        "data_types": ["literature", "funding", "citation", "patent"],
        "confidence": 0.91,
        "description": "Research analytics: publications, funding, patents",
        "tags": ["analytics", "funding", "patent"],
    },
    "core": {
        "class_name": "COREAdapter",
        "module": "app.knowledge.core_adapter",
        "display_name": "CORE",
        "category": "literature",
        "phase": 4,
        "access": "free",
        "data_types": ["literature", "open_access", "full_text"],
        "confidence": 0.91,
        "description": "200M+ open access research articles",
        "tags": ["open_access", "articles", "full_text"],
    },

    # ════════════════════════════════════════════════════════════════════════
    # 12. SPECIALIZED_GENOMICS (7)
    # ════════════════════════════════════════════════════════════════════════
    "epilepsygenome": {
        "class_name": "EpilepsyGenomeAdapter",
        "module": "app.knowledge.epilepsygenome_adapter",
        "display_name": "Epilepsy Genome",
        "category": "specialized_genomics",
        "phase": 4,
        "access": "free",
        "data_types": ["epilepsy", "gene", "variant"],
        "confidence": 0.90,
        "description": "Epilepsy genetics consortium variant data",
        "tags": ["epilepsy", "genetics", "consortium"],
    },
    "alzgene": {
        "class_name": "AlzGeneAdapter",
        "module": "app.knowledge.alzgene_adapter",
        "display_name": "AlzGene",
        "category": "specialized_genomics",
        "phase": 4,
        "access": "free",
        "data_types": ["alzheimer", "gene", "gwas"],
        "confidence": 0.88,
        "description": "Alzheimer disease genetic association database",
        "tags": ["alzheimer", "genetics", "association"],
    },
    "neurodev": {
        "class_name": "NeuroDevAdapter",
        "module": "app.knowledge.neurodev_adapter",
        "display_name": "Neurodevelopmental Genetics",
        "category": "specialized_genomics",
        "phase": 4,
        "access": "free",
        "data_types": ["neurodevelopment", "gene", "disorder"],
        "confidence": 0.88,
        "description": "Neurodevelopmental disorder genetics consortium",
        "tags": ["neurodevelopment", "genetics", "disorder"],
    },
    "pharmacogenomics": {
        "class_name": "PharmacogenomicsAdapter",
        "module": "app.knowledge.pharmacogenomics_adapter",
        "display_name": "Pharmacogenomics Knowledge Base",
        "category": "specialized_genomics",
        "phase": 3,
        "access": "free",
        "data_types": ["drug_response", "gene", "variant"],
        "confidence": 0.91,
        "description": "Pharmacogenomic variant-drug response associations",
        "tags": ["pharmacogenomics", "drug_response", "PGx"],
    },
    "neurogenetics": {
        "class_name": "NeuroGeneticsAdapter",
        "module": "app.knowledge.neurogenetics_adapter",
        "display_name": "NeuroGenetics",
        "category": "specialized_genomics",
        "phase": 4,
        "access": "free",
        "data_types": ["neurological", "gene", "mutation"],
        "confidence": 0.89,
        "description": "Neurological disorder gene mutation database",
        "tags": ["neurology", "genetics", "mutation"],
    },
    "psychiatric_genomics": {
        "class_name": "PsychiatricGenomicsAdapter",
        "module": "app.knowledge.psychiatric_genomics_adapter",
        "display_name": "Psychiatric Genomics Consortium",
        "category": "specialized_genomics",
        "phase": 4,
        "access": "free",
        "data_types": ["psychiatric", "gwas", "polygenic_risk"],
        "confidence": 0.90,
        "description": "PGC GWAS summary statistics for psychiatric disorders",
        "tags": ["psychiatric", "GWAS", "PGC"],
    },
    "stroke_genetics": {
        "class_name": "StrokeGeneticsAdapter",
        "module": "app.knowledge.stroke_genetics_adapter",
        "display_name": "Stroke Genetics",
        "category": "specialized_genomics",
        "phase": 4,
        "access": "free",
        "data_types": ["stroke", "gwas", "risk_variant"],
        "confidence": 0.88,
        "description": "Stroke genetics consortium GWAS and risk variants",
        "tags": ["stroke", "genetics", "GWAS"],
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORY METADATA
# ═══════════════════════════════════════════════════════════════════════════════

CATEGORY_METADATA: Dict[str, Dict[str, Any]] = {
    "pharmaceutical": {
        "display_name": "Pharmaceutical",
        "description": "Drug databases, pharmacology, and medication resources",
        "icon": "pill",
        "priority": 1,
        "expected_count": 11,
    },
    "genetic": {
        "display_name": "Genetic",
        "description": "Genomics, variants, genes, and pathway databases",
        "icon": "dna",
        "priority": 1,
        "expected_count": 14,
    },
    "clinical_evidence": {
        "display_name": "Clinical Evidence",
        "description": "Trials, systematic reviews, and clinical guidelines",
        "icon": "clipboard-check",
        "priority": 1,
        "expected_count": 12,
    },
    "neuroimaging": {
        "display_name": "Neuroimaging",
        "description": "MRI, fMRI, connectome, and brain atlas databases",
        "icon": "brain",
        "priority": 1,
        "expected_count": 18,
    },
    "neuromodulation": {
        "display_name": "Neuromodulation",
        "description": "TMS, tDCS, DBS, and stimulation atlases",
        "icon": "bolt",
        "priority": 2,
        "expected_count": 6,
    },
    "adverse_events": {
        "display_name": "Adverse Events",
        "description": "Pharmacovigilance and drug safety reporting",
        "icon": "exclamation-triangle",
        "priority": 2,
        "expected_count": 6,
    },
    "electrophysiology": {
        "display_name": "Electrophysiology",
        "description": "EEG, iEEG, and electrophysiology datasets",
        "icon": "waveform",
        "priority": 2,
        "expected_count": 4,
    },
    "diagnosis_coding": {
        "display_name": "Diagnosis Coding",
        "description": "ICD, SNOMED, MeSH, and terminology systems",
        "icon": "code",
        "priority": 2,
        "expected_count": 5,
    },
    "neuroscience_society": {
        "display_name": "Neuroscience Society",
        "description": "Professional societies and conference resources",
        "icon": "users",
        "priority": 3,
        "expected_count": 5,
    },
    "standards_guidelines": {
        "display_name": "Standards & Guidelines",
        "description": "IEEE, ISO, FDA, and EU regulatory standards",
        "icon": "file-contract",
        "priority": 3,
        "expected_count": 5,
    },
    "literature": {
        "display_name": "Literature",
        "description": "Open access catalogs and bibliographic databases",
        "icon": "book-open",
        "priority": 2,
        "expected_count": 4,
    },
    "specialized_genomics": {
        "display_name": "Specialized Genomics",
        "description": "Disease-specific genetics consortiums",
        "icon": "microscope",
        "priority": 3,
        "expected_count": 7,
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# INTELLIGENT ROUTING KEYWORDS
# ═══════════════════════════════════════════════════════════════════════════════

CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "pharmaceutical": [
        "drug", "medication", "pharma", "pill", "tablet", "dose",
        "prescription", "rx", "drugbank", "chembl", "pubchem",
        "pharmacology", "compound", "formulation", "ndc", "orange book",
    ],
    "genetic": [
        "gene", "variant", "snp", "genome", "genomic", "genetics",
        "mutation", "allele", "chromosome", "dna", "rna", "protein",
        "pathway", "gwas", "clinvar", "dbsnp", "ensembl", "uniprot",
    ],
    "clinical_evidence": [
        "trial", "study", "clinical", "evidence", "review", "guideline",
        "systematic review", "meta-analysis", "pubmed", "cochrane",
        "recommendation", "protocol", "patient", "outcome",
    ],
    "neuroimaging": [
        "mri", "fmri", "pet", "ct", "scan", "brain", "neuroimaging",
        "connectome", "atlas", "voxel", "cortex", "hippocampus",
        "white matter", "grey matter", "diffusion", "bold", "hcp",
        "neurovault", "openneuro", "atlas",
    ],
    "neuromodulation": [
        "tms", "tdcs", "dbs", "stimulation", "neuromodulation",
        "e-field", "simulation", "coil", "electrode", "montage",
        "simnibs", "stimulator", "device",
    ],
    "adverse_events": [
        "side effect", "adverse", "toxicity", "reaction", "safety",
        "faers", "meddra", "vigibase", "pharmacovigilance", "harm",
        "contraindication", "warning", "recall",
    ],
    "electrophysiology": [
        "eeg", "ieeg", "ecog", "erp", "eegbase", "electrode",
        "oscillation", "alpha", "beta", "gamma", "theta", "delta",
        "sleep", "epilepsy", "seizure", "waveform",
    ],
    "diagnosis_coding": [
        "icd", "snomed", "mesh", "umls", "diagnosis", "code",
        "terminology", "ontology", "classification", "encounter",
        "billing", "condition", "symptom",
    ],
    "neuroscience_society": [
        "conference", "society", "abstract", "proceeding", "meeting",
        "symposium", "workshop", "collaboration", "networking",
    ],
    "standards_guidelines": [
        "standard", "guideline", "guidance", "regulatory", "ieee",
        "iso", "fda", "eu mdr", "compliance", "certification",
        "protocol", "quality",
    ],
    "literature": [
        "paper", "article", "publication", "journal", "citation",
        "bibliography", "doi", "open access", "preprint", "peer review",
    ],
    "specialized_genomics": [
        "epilepsy gene", "alzheimer gene", "stroke gene",
        "psychiatric genomics", "neurodevelopmental", "pharmacogenomics",
        "rare disease", "consortium", "polygenic",
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
# ADAPTER REGISTRY CLASS
# ═══════════════════════════════════════════════════════════════════════════════

class AdapterRegistry:
    """
    Fault-tolerant adapter registry with intelligent routing.

    Features:
    - Individual try/except per adapter import (no cascade failures)
    - Category-based grouping and discovery
    - Data-type-aware adapter selection
    - Query analysis for intelligent routing
    - Health check endpoint for monitoring
    - Hot-reload capability for individual adapters
    - Dependency injection container
    """

    def __init__(self, di_container: Optional[DIContainer] = None):
        self._adapters: Dict[str, Any] = {}          # loaded adapter instances
        self._classes: Dict[str, Optional[type]] = {} # loaded adapter classes
        self._status: Dict[str, str] = {}             # active | degraded | unavailable
        self._load_times: Dict[str, float] = {}       # ms
        self._error_counts: Dict[str, int] = {}       # runtime errors
        self._last_errors: Dict[str, str] = {}        # last error message
        self._metadata: Dict[str, AdapterMeta] = {}   # rich metadata
        self._di = di_container or DIContainer()
        self._initialized = False
        self._registry = ADAPTER_REGISTRY

    # ────────────────────────────────────────────────────────────────────
    # Initialization
    # ────────────────────────────────────────────────────────────────────

    async def initialize(self) -> Dict[str, Any]:
        """
        Load all adapters, marking failed ones as unavailable.

        Returns:
            Dict with success/fail summary
        """
        if self._initialized:
            logger.warning("Registry already initialized; skipping")
            return self._init_summary()

        logger.info("=" * 60)
        logger.info("AdapterRegistry v3 — Initializing 66 adapters")
        logger.info("=" * 60)

        success = 0
        failed = 0

        tasks = []
        for key, meta in self._registry.items():
            tasks.append(self._load_one(key, meta))

        # Load with limited concurrency to avoid overwhelming the system
        semaphore = asyncio.Semaphore(10)
        results = await asyncio.gather(*[self._load_with_semaphore(key, meta, semaphore)
                                          for key, meta in self._registry.items()],
                                       return_exceptions=True)

        for result in results:
            if isinstance(result, Exception):
                failed += 1
                logger.error(f"Unexpected error during load: {result}")
            elif result is True:
                success += 1
            else:
                failed += 1

        self._initialized = True
        logger.info("=" * 60)
        logger.info(f"Initialization complete: {success} OK, {failed} FAILED")
        logger.info("=" * 60)

        return self._init_summary()

    async def _load_with_semaphore(self, key: str, meta: Dict[str, Any],
                                    semaphore: asyncio.Semaphore) -> bool:
        async with semaphore:
            return await self._load_one(key, meta)

    async def _load_one(self, key: str, meta: Dict[str, Any]) -> bool:
        """Load a single adapter with full error handling."""
        t0 = time.perf_counter()

        # Build metadata record
        self._metadata[key] = AdapterMeta(
            key=key,
            class_name=meta["class_name"],
            module=meta["module"],
            display_name=meta["display_name"],
            category=meta["category"],
            phase=meta["phase"],
            access=meta["access"],
            data_types=meta.get("data_types", []),
            description=meta["description"],
            confidence=meta.get("confidence", 0.95),
            tags=meta.get("tags", []),
        )

        try:
            # Attempt dynamic import
            module = importlib.import_module(meta["module"])
            adapter_class = getattr(module, meta["class_name"])
            self._classes[key] = adapter_class

            # Try to instantiate — inject dependencies if needed
            instance = self._instantiate(key, adapter_class)

            if instance is not None:
                self._adapters[key] = instance
                self._status[key] = "active"
                elapsed = (time.perf_counter() - t0) * 1000
                self._load_times[key] = round(elapsed, 2)
                self._error_counts[key] = 0
                logger.info(f"[OK] {key} loaded in {elapsed:.1f}ms")
                return True
            else:
                self._status[key] = "unavailable"
                self._classes[key] = adapter_class  # class loaded but can't instantiate
                logger.warning(f"[DEGRADED] {key}: class loaded but instantiation failed")
                return False

        except ModuleNotFoundError as e:
            self._status[key] = "unavailable"
            self._last_errors[key] = f"ModuleNotFound: {e}"
            elapsed = (time.perf_counter() - t0) * 1000
            self._load_times[key] = round(elapsed, 2)
            logger.warning(f"[MISSING] {key}: {meta['module']} not found ({elapsed:.1f}ms)")
            return False

        except ImportError as e:
            self._status[key] = "unavailable"
            self._last_errors[key] = f"ImportError: {e}"
            elapsed = (time.perf_counter() - t0) * 1000
            self._load_times[key] = round(elapsed, 2)
            logger.warning(f"[IMPORT ERROR] {key}: {e} ({elapsed:.1f}ms)")
            return False

        except AttributeError as e:
            self._status[key] = "unavailable"
            self._last_errors[key] = f"AttributeError: {e}"
            elapsed = (time.perf_counter() - t0) * 1000
            self._load_times[key] = round(elapsed, 2)
            logger.warning(f"[CLASS MISSING] {key}: {meta['class_name']} not in {meta['module']} ({elapsed:.1f}ms)")
            return False

        except Exception as e:
            self._status[key] = "unavailable"
            self._last_errors[key] = f"{type(e).__name__}: {e}"
            elapsed = (time.perf_counter() - t0) * 1000
            self._load_times[key] = round(elapsed, 2)
            logger.error(f"[UNEXPECTED] {key}: {type(e).__name__}: {e} ({elapsed:.1f}ms)")
            return False

    def _instantiate(self, key: str, adapter_class: type) -> Optional[Any]:
        """Instantiate an adapter class with dependency injection."""
        try:
            # Check if the class accepts dependency injection
            import inspect
            sig = inspect.signature(adapter_class.__init__)
            params = list(sig.parameters.keys())

            if len(params) > 1 and "di_container" in params:
                return adapter_class(di_container=self._di)
            return adapter_class()
        except Exception as e:
            logger.warning(f"Failed to instantiate {key}: {e}")
            return None

    def _init_summary(self) -> Dict[str, Any]:
        """Build initialization summary."""
        available = [k for k, v in self._status.items() if v == "active"]
        unavailable = [k for k, v in self._status.items() if v != "active"]
        return {
            "total": len(self._registry),
            "available": len(available),
            "unavailable": len(unavailable),
            "available_adapters": available,
            "unavailable_adapters": unavailable,
            "by_category": self._count_by_category(),
            "timestamp": datetime.utcnow().isoformat(),
        }

    def _count_by_category(self) -> Dict[str, int]:
        """Count active adapters by category."""
        counts: Dict[str, int] = {}
        for key, status in self._status.items():
            if status == "active":
                cat = self._registry[key]["category"]
                counts[cat] = counts.get(cat, 0) + 1
        return counts

    # ────────────────────────────────────────────────────────────────────
    # Core Access API
    # ────────────────────────────────────────────────────────────────────

    def get(self, name: str) -> Optional[Any]:
        """
        Get adapter by name. Returns None if unavailable.

        Args:
            name: Registry key

        Returns:
            Adapter instance or None
        """
        if name not in self._registry:
            logger.warning(f"Unknown adapter: '{name}'")
            return None

        # Return cached instance if available
        if name in self._adapters:
            return self._adapters[name]

        # Try to instantiate from loaded class
        if name in self._classes and self._classes[name] is not None:
            instance = self._instantiate(name, self._classes[name])
            if instance is not None:
                self._adapters[name] = instance
                self._status[name] = "active"
                return instance

        logger.warning(f"Adapter '{name}' is unavailable (status: {self._status.get(name, 'unknown')})")
        return None

    def get_class(self, name: str) -> Optional[type]:
        """Get adapter class without instantiating."""
        return self._classes.get(name)

    def get_metadata(self, name: str) -> Optional[AdapterMeta]:
        """Get rich metadata for an adapter."""
        return self._metadata.get(name)

    def get_status(self, name: str) -> str:
        """Get adapter status: active | degraded | unavailable | unknown."""
        return self._status.get(name, "unknown")

    # ────────────────────────────────────────────────────────────────────
    # Discovery API
    # ────────────────────────────────────────────────────────────────────

    def get_by_category(self, category: str) -> List[Any]:
        """
        Get all active adapters in a category.

        Args:
            category: Category name (e.g. 'pharmaceutical')

        Returns:
            List of active adapter instances
        """
        results = []
        for key, meta in self._registry.items():
            if meta["category"] == category:
                adapter = self.get(key)
                if adapter is not None:
                    results.append(adapter)
        return results

    def get_by_data_type(self, data_type: str) -> List[Any]:
        """
        Get adapters supporting a data type.

        Args:
            data_type: Data type string (e.g. 'drug', 'neuroimaging')

        Returns:
            List of active adapter instances
        """
        results = []
        for key, meta in self._registry.items():
            if data_type in meta.get("data_types", []):
                adapter = self.get(key)
                if adapter is not None:
                    results.append(adapter)
        return results

    def get_for_query(self, query: str, detected_types: Optional[List[str]] = None) -> List[Dict]:
        """
        Intelligent adapter selection based on query analysis.

        Analyzes query text for keywords matching each category,
        then returns ranked list of adapters with confidence scores.

        Args:
            query: User search query
            detected_types: Optional pre-detected data types

        Returns:
            List of dicts with adapter_key, display_name, category, relevance_score
        """
        query_lower = query.lower()
        scores: Dict[str, float] = {}

        # Keyword matching per category
        for category, keywords in CATEGORY_KEYWORDS.items():
            score = 0.0
            for kw in keywords:
                if kw.lower() in query_lower:
                    score += 1.0
            # Normalize by keyword count
            if len(keywords) > 0:
                score = score / len(keywords) * 10
            scores[category] = score

        # Boost with detected types
        if detected_types:
            for dtype in detected_types:
                for key, meta in self._registry.items():
                    if dtype in meta.get("data_types", []):
                        cat = meta["category"]
                        scores[cat] = scores.get(cat, 0) + 3.0

        # Build ranked results
        results = []
        seen = set()
        for key, meta in self._registry.items():
            cat = meta["category"]
            cat_score = scores.get(cat, 0)
            adapter_confidence = meta.get("confidence", 0.95)

            # Skip if category doesn't match
            if cat_score < 0.1 and (not detected_types):
                continue

            relevance = cat_score * adapter_confidence
            status = self._status.get(key, "unknown")

            results.append({
                "adapter_key": key,
                "display_name": meta["display_name"],
                "category": cat,
                "relevance_score": round(relevance, 3),
                "confidence": adapter_confidence,
                "status": status,
                "access": meta["access"],
                "data_types": meta.get("data_types", []),
                "description": meta["description"],
            })
            seen.add(key)

        # Sort by relevance descending
        results.sort(key=lambda x: x["relevance_score"], reverse=True)
        return results

    def list_adapters(self, category: Optional[str] = None,
                      phase: Optional[int] = None,
                      access: Optional[str] = None,
                      data_type: Optional[str] = None,
                      status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List registered adapters with optional filtering.

        Returns:
            List of adapter info dicts
        """
        results = []
        for key, meta in self._registry.items():
            if category and meta["category"] != category:
                continue
            if phase and meta["phase"] != phase:
                continue
            if access and meta["access"] != access:
                continue
            if data_type and data_type not in meta.get("data_types", []):
                continue
            if status_filter and self._status.get(key) != status_filter:
                continue

            results.append({
                "key": key,
                "display_name": meta["display_name"],
                "category": meta["category"],
                "category_display": CATEGORY_METADATA.get(meta["category"], {}).get("display_name", meta["category"]),
                "phase": meta["phase"],
                "access": meta["access"],
                "data_types": meta.get("data_types", []),
                "description": meta["description"],
                "confidence": meta.get("confidence", 0.95),
                "status": self._status.get(key, "unknown"),
                "load_time_ms": self._load_times.get(key, 0),
                "error_count": self._error_counts.get(key, 0),
            })
        return results

    def list_categories(self) -> List[Dict[str, Any]]:
        """Return all categories with metadata and adapter counts."""
        results = []
        for cat_key, meta in CATEGORY_METADATA.items():
            active_count = sum(1 for k, v in self._status.items()
                               if v == "active" and self._registry[k]["category"] == cat_key)
            total_in_cat = sum(1 for v in self._registry.values() if v["category"] == cat_key)
            results.append({
                "key": cat_key,
                "display_name": meta["display_name"],
                "description": meta["description"],
                "icon": meta.get("icon", ""),
                "priority": meta["priority"],
                "expected_count": meta["expected_count"],
                "actual_count": total_in_cat,
                "active_count": active_count,
                "availability_pct": round(active_count / total_in_cat * 100, 1) if total_in_cat else 0,
            })
        return results

    def get_categories(self) -> List[str]:
        """Return all unique category keys."""
        return sorted(set(meta["category"] for meta in self._registry.values()))

    # ────────────────────────────────────────────────────────────────────
    # Health Check
    # ────────────────────────────────────────────────────────────────────

    def health_check(self) -> Dict[str, Any]:
        """
        Health status of all adapters.

        Returns:
            Dict with overall_health, adapter_status list, and summary stats
        """
        adapter_statuses = []
        status_counts = {"active": 0, "degraded": 0, "unavailable": 0, "unknown": 0}

        for key, meta in self._registry.items():
            status = self._status.get(key, "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1

            adapter_statuses.append({
                "key": key,
                "display_name": meta["display_name"],
                "category": meta["category"],
                "status": status,
                "load_time_ms": self._load_times.get(key, 0),
                "error_count": self._error_counts.get(key, 0),
                "last_error": self._last_errors.get(key),
                "confidence": meta.get("confidence", 0.95),
                "data_types": meta.get("data_types", []),
            })

        total = len(self._registry)
        active = status_counts.get("active", 0)
        health_pct = (active / total * 100) if total else 0

        overall = "healthy" if health_pct >= 90 else \
                  "degraded" if health_pct >= 50 else "critical"

        return {
            "overall_health": overall,
            "health_percentage": round(health_pct, 1),
            "total_adapters": total,
            "active": active,
            "degraded": status_counts.get("degraded", 0),
            "unavailable": status_counts.get("unavailable", 0),
            "unknown": status_counts.get("unknown", 0),
            "timestamp": datetime.utcnow().isoformat(),
            "by_category": self._count_by_category(),
            "adapters": adapter_statuses,
        }

    # ────────────────────────────────────────────────────────────────────
    # Hot Reload
    # ────────────────────────────────────────────────────────────────────

    async def reload_adapter(self, name: str) -> bool:
        """
        Hot-reload a specific adapter.

        Args:
            name: Registry key

        Returns:
            True if reload succeeded
        """
        if name not in self._registry:
            logger.error(f"Cannot reload unknown adapter '{name}'")
            return False

        # Clean up existing instance
        if name in self._adapters:
            try:
                adapter = self._adapters[name]
                if hasattr(adapter, "close"):
                    await adapter.close()
            except Exception as e:
                logger.warning(f"Error closing adapter {name} for reload: {e}")
            del self._adapters[name]

        # Force module reimport
        meta = self._registry[name]
        try:
            if meta["module"] in importlib.sys.modules:
                del importlib.sys.modules[meta["module"]]
        except Exception:
            pass

        self._classes.pop(name, None)
        self._status.pop(name, None)
        self._last_errors.pop(name, None)

        # Reload
        result = await self._load_one(name, meta)
        logger.info(f"Hot-reload of '{name}': {'SUCCESS' if result else 'FAILED'}")
        return result

    async def reload_all(self) -> Dict[str, Any]:
        """Reload all unavailable adapters."""
        unavailable = [k for k, v in self._status.items() if v != "active"]
        results = {}
        for key in unavailable:
            results[key] = await self.reload_adapter(key)
        return results

    # ────────────────────────────────────────────────────────────────────
    # Dependency Injection
    # ────────────────────────────────────────────────────────────────────

    def register_dependency(self, name: str, instance: Any) -> None:
        """Register a dependency in the DI container."""
        self._di.register(name, instance)

    def register_dependency_factory(self, name: str, factory: Callable[[], Any]) -> None:
        """Register a dependency factory."""
        self._di.register_factory(name, factory)

    def resolve_dependency(self, name: str) -> Optional[Any]:
        """Resolve a dependency."""
        return self._di.resolve(name)

    # ────────────────────────────────────────────────────────────────────
    # Stats & Reporting
    # ────────────────────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        """Return comprehensive registry statistics."""
        by_phase = {}
        by_access = {}
        by_category = {}
        for key, meta in self._registry.items():
            status = self._status.get(key, "unknown")
            by_phase[meta["phase"]] = by_phase.get(meta["phase"], 0) + 1
            by_access[meta["access"]] = by_access.get(meta["access"], 0) + 1
            by_category[meta["category"]] = by_category.get(meta["category"], 0) + 1

        load_times = [v for v in self._load_times.values() if v > 0]
        return {
            "total_adapters": len(self._registry),
            "active": sum(1 for s in self._status.values() if s == "active"),
            "unavailable": sum(1 for s in self._status.values() if s == "unavailable"),
            "degraded": sum(1 for s in self._status.values() if s == "degraded"),
            "by_phase": by_phase,
            "by_access": by_access,
            "by_category": by_category,
            "load_time_avg_ms": round(sum(load_times) / len(load_times), 2) if load_times else 0,
            "load_time_max_ms": round(max(load_times), 2) if load_times else 0,
            "total_errors": sum(self._error_counts.values()),
            "categories": self.list_categories(),
            "timestamp": datetime.utcnow().isoformat(),
        }

    # ────────────────────────────────────────────────────────────────────
    # Async Context Manager
    # ────────────────────────────────────────────────────────────────────

    @asynccontextmanager
    async def session(self):
        """Async context manager for registry lifecycle."""
        await self.initialize()
        try:
            yield self
        finally:
            await self.close_all()

    async def close_all(self):
        """Close all adapter connections gracefully."""
        logger.info("Shutting down all adapters...")
        for key, instance in list(self._adapters.items()):
            try:
                if hasattr(instance, "close"):
                    await instance.close()
                elif hasattr(instance, "disconnect"):
                    await instance.disconnect()
                logger.debug(f"Closed adapter: {key}")
            except Exception as e:
                logger.warning(f"Error closing adapter {key}: {e}")
        self._adapters.clear()
        self._initialized = False
        logger.info("All adapters shut down")


# ═══════════════════════════════════════════════════════════════════════════════
# MODULE-LEVEL CONVENIENCES
# ═══════════════════════════════════════════════════════════════════════════════

_registry_instance: Optional[AdapterRegistry] = None


def get_registry(di_container: Optional[DIContainer] = None) -> AdapterRegistry:
    """Get or create singleton AdapterRegistry."""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = AdapterRegistry(di_container=di_container)
    return _registry_instance


async def init_registry(di_container: Optional[DIContainer] = None) -> AdapterRegistry:
    """Initialize and return the singleton registry."""
    reg = get_registry(di_container)
    await reg.initialize()
    return reg


__all__ = [
    "AdapterRegistry",
    "AdapterMeta",
    "DIContainer",
    "ADAPTER_REGISTRY",
    "CATEGORY_METADATA",
    "CATEGORY_KEYWORDS",
    "get_registry",
    "init_registry",
]
