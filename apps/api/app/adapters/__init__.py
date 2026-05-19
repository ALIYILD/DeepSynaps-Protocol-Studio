"""
DeepSynaps Knowledge Layer — Graceful Adapter Loader

Fault-tolerant module-level imports for all 66 adapters.
Each adapter is wrapped in individual try/except so missing files
don't crash the entire application.

Usage:
    from app.adapters import get_adapter, list_available_adapters, list_failed_adapters
    adapter = get_adapter("rxnorm")
    all_ok = list_available_adapters()
    failed = list_failed_adapters()
"""

from __future__ import annotations

import logging
import time
import importlib
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Import result tracking
# ---------------------------------------------------------------------------

@dataclass
class ImportRecord:
    """Record of a single adapter import attempt."""
    name: str
    module_path: str
    class_name: str
    success: bool = False
    error: Optional[str] = None
    load_time_ms: float = 0.0
    adapter_class: Optional[type] = None
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat()


# Global import tracking
_import_records: Dict[str, ImportRecord] = {}
_adapter_cache: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# 66 Adapter import specifications: (registry_key, module_path, class_name)
# ---------------------------------------------------------------------------

_ADAPTER_IMPORTS: List[Tuple[str, str, str]] = [
    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 1 — P0 Adapters (9)
    # ═══════════════════════════════════════════════════════════════════════
    ("rxnorm", "app.knowledge.rxnorm_adapter", "RxNormAdapter"),
    ("pharmgkb", "app.knowledge.pharmgkb_adapter", "PharmGKBAdapter"),
    ("clinvar", "app.knowledge.clinvar_adapter", "ClinVarAdapter"),
    ("loinc", "app.knowledge.loinc_adapter", "LOINCAdapter"),
    ("openfda", "app.knowledge.openfda_adapter", "OpenFDAAdapter"),
    ("chbmp", "app.knowledge.chbmp_adapter", "CHBMPAdapter"),
    ("mni_atlas", "app.knowledge.mni_atlas_adapter", "MNIAtlasAdapter"),
    ("promis", "app.knowledge.promis_adapter", "PROMISAdapter"),
    ("simnibs", "app.knowledge.simnibs_adapter", "SimNIBSAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 2 — P1 Adapters (7)
    # ═══════════════════════════════════════════════════════════════════════
    ("faers", "app.knowledge.faers_adapter", "FAERSAdapter"),
    ("onsides", "app.knowledge.onsides_adapter", "OnSIDESAdapter"),
    ("allen_brain", "app.knowledge.allen_brain_adapter", "AllenBrainAdapter"),
    ("schaefer", "app.knowledge.schaefer_adapter", "SchaeferAdapter"),
    ("neurosynth", "app.knowledge.neurosynth_adapter", "NeurosynthAdapter"),
    ("adni", "app.knowledge.adni_adapter", "ADNIAdapter"),
    ("abide", "app.knowledge.abide_adapter", "ABIDEAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 3 — Batch 1: Neuroimaging (5)
    # ═══════════════════════════════════════════════════════════════════════
    ("neurovault", "app.knowledge.neurovault_adapter", "NeuroVaultAdapter"),
    ("hcp", "app.knowledge.hcp_adapter", "HCPAdapter"),
    ("openneuro", "app.knowledge.openneuro_adapter", "OpenNeuroAdapter"),
    ("oasis", "app.knowledge.oasis_adapter", "OASISAdapter"),
    ("hcp_aging", "app.knowledge.hcp_aging_adapter", "HCPAgingAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 3 — Batch 2: Pharma / Terminology (5)
    # ═══════════════════════════════════════════════════════════════════════
    ("drugbank", "app.knowledge.drugbank_adapter", "DrugBankAdapter"),
    ("chembl", "app.knowledge.chembl_adapter", "ChEMBLAdapter"),
    ("pubchem", "app.knowledge.pubchem_adapter", "PubChemAdapter"),
    ("dailymed", "app.knowledge.dailymed_adapter", "DailyMedAdapter"),
    ("snomedct", "app.knowledge.snomedct_adapter", "SNOMEDCTAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 3 — Batch 3: Evidence / Literature (5)
    # ═══════════════════════════════════════════════════════════════════════
    ("pubmed", "app.knowledge.pubmed_adapter", "PubMedAdapter"),
    ("cochrane", "app.knowledge.cochrane_adapter", "CochraneAdapter"),
    ("clinicaltrials", "app.knowledge.clinicaltrials_adapter", "ClinicalTrialsAdapter"),
    ("europepmc", "app.knowledge.europepmc_adapter", "EuropePMCAdapter"),
    ("nice", "app.knowledge.nice_adapter", "NICEAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 3 — Batch 4: Genetics (5)
    # ═══════════════════════════════════════════════════════════════════════
    ("gwas_catalog", "app.knowledge.gwas_catalog_adapter", "GWASCatalogAdapter"),
    ("dbsnp", "app.knowledge.dbsnp_adapter", "DbSNPAdapter"),
    ("ensembl", "app.knowledge.ensembl_adapter", "EnsemblAdapter"),
    ("gnomad", "app.knowledge.gnomad_adapter", "GnomADAdapter"),
    ("uniprot", "app.knowledge.uniprot_adapter", "UniProtAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 3 — Batch 5: Atlas / Analytics (5)
    # ═══════════════════════════════════════════════════════════════════════
    ("string", "app.knowledge.string_adapter", "STRINGAdapter"),
    ("myvariant", "app.knowledge.myvariant_adapter", "MyVariantAdapter"),
    ("yeo2011", "app.knowledge.yeo2011_adapter", "Yeo2011Adapter"),
    ("gordon2014", "app.knowledge.gordon2014_adapter", "Gordon2014Adapter"),
    ("adhd200", "app.knowledge.adhd200_adapter", "ADHD200Adapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 3 — Batch 6: Adverse Events / AI Literature (4)
    # ═══════════════════════════════════════════════════════════════════════
    ("semantic_scholar", "app.knowledge.semantic_scholar_adapter", "SemanticScholarAdapter"),
    ("aeolus", "app.knowledge.aeolus_adapter", "AEOLUSAdapter"),
    ("sider", "app.knowledge.sider_adapter", "SIDERAdapter"),
    ("offsides_twosides", "app.knowledge.offsides_twosides_adapter", "OffsidesTwosidesAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 4 — Batch A: Neuroimaging (5)
    # ═══════════════════════════════════════════════════════════════════════
    ("functional_connectomes_1000", "app.knowledge.functional_connectomes_1000_adapter", "FunctionalConnectomes1000Adapter"),
    ("nitrc", "app.knowledge.nitrc_adapter", "NITRCAdapter"),
    ("glasser2016", "app.knowledge.glasser2016_adapter", "Glasser2016Adapter"),
    ("brainnetome", "app.knowledge.brainnetome_adapter", "BrainnetomeAdapter"),
    ("ixi", "app.knowledge.ixi_adapter", "IXIAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 4 — Batch B: Neuroimaging (5)
    # ═══════════════════════════════════════════════════════════════════════
    ("cobre", "app.knowledge.cobre_adapter", "COBREAdapter"),
    ("corr", "app.knowledge.corr_adapter", "CORRAdapter"),
    ("ds030", "app.knowledge.ds030_adapter", "DS030Adapter"),
    ("gsp", "app.knowledge.gsp_adapter", "GSPAdapter"),
    ("hcp_lifespan", "app.knowledge.hcp_lifespan_adapter", "HCPLifespanAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 4 — Batch C: Pharma / Evidence (5)
    # ═══════════════════════════════════════════════════════════════════════
    ("orange_book", "app.knowledge.orange_book_adapter", "OrangeBookAdapter"),
    ("ndc_directory", "app.knowledge.ndc_directory_adapter", "NDCDirectoryAdapter"),
    ("unii", "app.knowledge.unii_adapter", "UNIIAdapter"),
    ("otseeker", "app.knowledge.otseeker_adapter", "OTseekerAdapter"),
    ("pedro", "app.knowledge.pedro_adapter", "PEDROAdapter"),

    # ═══════════════════════════════════════════════════════════════════════
    # PHASE 4 — Batch D: Evidence (6)
    # ═══════════════════════════════════════════════════════════════════════
    ("ahrq_epss", "app.knowledge.ahrq_epss_adapter", "AHRQEPSSAdapter"),
    ("trip_database", "app.knowledge.trip_database_adapter", "TRIPDatabaseAdapter"),
    ("epistemonikos", "app.knowledge.epistemonikos_adapter", "EpistemonikosAdapter"),
    ("nih_reporter", "app.knowledge.nih_reporter_adapter", "NIHReporterAdapter"),
    ("core", "app.knowledge.core_adapter", "COREAdapter"),
    ("biorxiv", "app.knowledge.biorxiv_adapter", "BioRxivAdapter"),
]


# ---------------------------------------------------------------------------
# Fault-tolerant import of all adapters
# ---------------------------------------------------------------------------

def _attempt_import(name: str, module_path: str, class_name: str) -> ImportRecord:
    """Attempt to import a single adapter, catching all errors."""
    t0 = time.perf_counter()
    record = ImportRecord(name=name, module_path=module_path, class_name=class_name)

    try:
        module = importlib.import_module(module_path)
        adapter_class = getattr(module, class_name)
        record.success = True
        record.adapter_class = adapter_class
        elapsed = (time.perf_counter() - t0) * 1000
        record.load_time_ms = round(elapsed, 2)
        logger.info(f"[OK] Adapter '{name}' loaded from {module_path} in {elapsed:.1f}ms")
    except ModuleNotFoundError as e:
        elapsed = (time.perf_counter() - t0) * 1000
        record.load_time_ms = round(elapsed, 2)
        record.error = f"ModuleNotFoundError: {e}"
        logger.warning(f"[MISSING] Adapter '{name}' — module {module_path} not found ({elapsed:.1f}ms)")
    except ImportError as e:
        elapsed = (time.perf_counter() - t0) * 1000
        record.load_time_ms = round(elapsed, 2)
        record.error = f"ImportError: {e}"
        logger.warning(f"[IMPORT ERROR] Adapter '{name}' — {e} ({elapsed:.1f}ms)")
    except AttributeError as e:
        elapsed = (time.perf_counter() - t0) * 1000
        record.load_time_ms = round(elapsed, 2)
        record.error = f"AttributeError: class {class_name} not found in {module_path}"
        logger.warning(f"[CLASS MISSING] Adapter '{name}' — {class_name} not in {module_path} ({elapsed:.1f}ms)")
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        record.load_time_ms = round(elapsed, 2)
        record.error = f"{type(e).__name__}: {e}"
        logger.error(f"[UNEXPECTED] Adapter '{name}' — {type(e).__name__}: {e} ({elapsed:.1f}ms)")

    return record


def _load_all_adapters() -> None:
    """Load all adapters at module import time with fault tolerance."""
    global _import_records
    logger.info("=" * 60)
    logger.info("DeepSynaps Adapter Loader — Starting fault-tolerant import")
    logger.info(f"Total adapters to load: {len(_ADAPTER_IMPORTS)}")
    logger.info("=" * 60)

    success_count = 0
    fail_count = 0

    for name, module_path, class_name in _ADAPTER_IMPORTS:
        record = _attempt_import(name, module_path, class_name)
        _import_records[name] = record
        if record.success:
            success_count += 1
        else:
            fail_count += 1

    logger.info("=" * 60)
    logger.info(f"Adapter loading complete: {success_count} OK, {fail_count} FAILED")
    logger.info("=" * 60)


# ---------------------------------------------------------------------------
# Run imports on module load
# ---------------------------------------------------------------------------
_load_all_adapters()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_adapter(name: str) -> Optional[Any]:
    """
    Get an adapter class by registry key.

    Returns the adapter class if loaded successfully, None otherwise.
    Does NOT instantiate — caller should call class_name().

    Args:
        name: Registry key (e.g. 'rxnorm', 'pubmed')

    Returns:
        Adapter class or None
    """
    record = _import_records.get(name)
    if record is None:
        logger.warning(f"Unknown adapter '{name}' — not in registry")
        return None
    if not record.success:
        logger.warning(f"Adapter '{name}' is unavailable — {record.error}")
        return None
    return record.adapter_class


def get_adapter_instance(name: str) -> Optional[Any]:
    """
    Get or create a singleton adapter instance by name.

    Args:
        name: Registry key

    Returns:
        Adapter instance or None
    """
    if name in _adapter_cache:
        return _adapter_cache[name]

    adapter_class = get_adapter(name)
    if adapter_class is None:
        return None

    try:
        instance = adapter_class()
        _adapter_cache[name] = instance
        return instance
    except Exception as e:
        logger.error(f"Failed to instantiate adapter '{name}': {e}")
        return None


def list_adapters() -> List[str]:
    """Return list of all registered adapter keys (66 total)."""
    return list(_import_records.keys())


def list_available_adapters() -> List[str]:
    """Return list of successfully loaded adapter keys."""
    return [name for name, rec in _import_records.items() if rec.success]


def list_failed_adapters() -> List[Dict[str, Any]]:
    """Return detailed info for adapters that failed to load."""
    return [
        {
            "name": name,
            "module_path": rec.module_path,
            "class_name": rec.class_name,
            "error": rec.error,
            "load_time_ms": rec.load_time_ms,
        }
        for name, rec in _import_records.items()
        if not rec.success
    ]


def get_import_report() -> Dict[str, Any]:
    """
    Full import diagnostic report.

    Returns:
        Dict with success_count, fail_count, total, available, failed details
    """
    available = list_available_adapters()
    failed = list_failed_adapters()
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "total_adapters": len(_import_records),
        "success_count": len(available),
        "fail_count": len(failed),
        "available": available,
        "failed": failed,
        "by_phase": _group_by_phase(),
        "load_time_stats": _load_time_stats(),
    }


def _group_by_phase() -> Dict[str, int]:
    """Count adapters by phase (inferred from registry)."""
    phase_counts: Dict[str, int] = {"available": 0, "failed": 0}
    for rec in _import_records.values():
        key = "available" if rec.success else "failed"
        phase_counts[key] = phase_counts.get(key, 0) + 1
    return phase_counts


def _load_time_stats() -> Dict[str, float]:
    """Calculate load time statistics."""
    times = [rec.load_time_ms for rec in _import_records.values()]
    if not times:
        return {}
    return {
        "min_ms": round(min(times), 2),
        "max_ms": round(max(times), 2),
        "avg_ms": round(sum(times) / len(times), 2),
        "total_ms": round(sum(times), 2),
    }


def reload_adapter(name: str) -> bool:
    """
    Hot-reload a single adapter by re-importing its module.

    Args:
        name: Registry key

    Returns:
        True if reload succeeded
    """
    record = _import_records.get(name)
    if record is None:
        logger.error(f"Cannot reload unknown adapter '{name}'")
        return False

    # Remove from cache
    _adapter_cache.pop(name, None)

    # Force module reload
    try:
        if record.module_path in importlib.sys.modules:
            del importlib.sys.modules[record.module_path]
    except Exception:
        pass

    new_record = _attempt_import(name, record.module_path, record.class_name)
    _import_records[name] = new_record

    if new_record.success:
        logger.info(f"Adapter '{name}' reloaded successfully")
    else:
        logger.warning(f"Adapter '{name}' reload failed: {new_record.error}")

    return new_record.success


def adapter_status(name: str) -> Dict[str, Any]:
    """
    Get detailed status for a single adapter.

    Args:
        name: Registry key

    Returns:
        Status dict with success, error, load_time, module_path
    """
    record = _import_records.get(name)
    if record is None:
        return {"name": name, "status": "unknown", "error": "Not in registry"}
    return {
        "name": record.name,
        "status": "available" if record.success else "unavailable",
        "module_path": record.module_path,
        "class_name": record.class_name,
        "load_time_ms": record.load_time_ms,
        "error": record.error,
        "cached": name in _adapter_cache,
    }


# Convenience: expose commonly used items at package level
__all__ = [
    "get_adapter",
    "get_adapter_instance",
    "list_adapters",
    "list_available_adapters",
    "list_failed_adapters",
    "get_import_report",
    "reload_adapter",
    "adapter_status",
    "ImportRecord",
]
