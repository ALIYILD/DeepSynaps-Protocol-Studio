"""Canonical knowledge-adapter inventory.

Static source of truth for service-layer adapter existence, bootstrap intent,
live-router exposure, and bridge dependencies. This module must stay read-only:
no adapter imports, no filesystem scans, no instantiation, and no network I/O.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Tuple


def _entry(
    *,
    source_name: str,
    tier: str,
    implemented: bool,
    registered: bool = False,
    live_exposed: bool = False,
    import_path: str = "",
    class_name: str = "",
    bridge_dependencies: Iterable[str] = (),
    references: Iterable[str] = (),
    notes: str = "",
) -> Dict[str, Any]:
    if not implemented:
        status = "missing"
    elif registered and live_exposed:
        status = "active"
    elif registered:
        status = "registered"
    elif live_exposed:
        status = "partial"
    else:
        status = "experimental"
    return {
        "source_name": source_name,
        "tier": tier,
        "implemented": implemented,
        "registered": registered,
        "live_exposed": live_exposed,
        "import_path": import_path,
        "class_name": class_name,
        "bridge_dependencies": list(sorted(set(bridge_dependencies))),
        "references": list(sorted(set(references))),
        "notes": notes,
        "status": status,
    }


_SERVICE = "app.services.knowledge.adapters"

ADAPTER_MANIFEST: Dict[str, Dict[str, Any]] = {
    "rxnorm": _entry(source_name="RxNorm", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.rxnorm_adapter", class_name="RxNormAdapter", bridge_dependencies=("medication_analyzer_bridge",)),
    "pharmgkb": _entry(source_name="PharmGKB", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.pharmgkb_adapter", class_name="PharmGKBAdapter", bridge_dependencies=("genetic_analyzer_bridge", "medication_analyzer_bridge")),
    "clinvar": _entry(source_name="ClinVar", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.clinvar_adapter", class_name="ClinVarAdapter", bridge_dependencies=("genetic_analyzer_bridge",)),
    "loinc": _entry(source_name="LOINC", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.loinc_adapter", class_name="LOINCAdapter"),
    "openfda": _entry(source_name="OpenFDA", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.openfda_adapter", class_name="OpenFDAAdapter", bridge_dependencies=("medication_analyzer_bridge",)),
    "chbmp": _entry(source_name="CHBMP", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.chbmp_adapter", class_name="CHBMPAdapter", bridge_dependencies=("qeeg_analyzer_bridge",)),
    "mni_atlas": _entry(source_name="MNI Atlas", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.mni_atlas_adapter", class_name="MNIAtlasAdapter", bridge_dependencies=("mri_analyzer_bridge", "qeeg_analyzer_bridge")),
    "promis": _entry(source_name="PROMIS", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.promis_adapter", class_name="PROMISAdapter"),
    "simnibs": _entry(source_name="SimNIBS", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.simnibs_adapter", class_name="SimNIBSAdapter"),
    "faers": _entry(source_name="FAERS", tier="P1", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.faers_adapter", class_name="FAERSAdapter", bridge_dependencies=("medication_analyzer_bridge",)),
    "onsides": _entry(source_name="OnSIDES", tier="P1", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.onsides_adapter", class_name="OnSIDESAdapter", bridge_dependencies=("medication_analyzer_bridge",)),
    "allen_brain": _entry(source_name="Allen Brain Atlas", tier="P1", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.allen_brain_adapter", class_name="AllenBrainAdapter", bridge_dependencies=("genetic_analyzer_bridge",)),
    "schaefer": _entry(source_name="Schaefer Atlas", tier="P1", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.schaefer_adapter", class_name="SchaeferAdapter", bridge_dependencies=("mri_analyzer_bridge", "qeeg_analyzer_bridge")),
    "neurosynth": _entry(source_name="Neurosynth", tier="P1", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.neurosynth_adapter", class_name="NeurosynthAdapter", bridge_dependencies=("qeeg_analyzer_bridge",)),
    "adni": _entry(source_name="ADNI", tier="P1", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.adni_adapter", class_name="ADNIAdapter", bridge_dependencies=("mri_analyzer_bridge",)),
    "abide": _entry(source_name="ABIDE", tier="P1", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.abide_adapter", class_name="ABIDEAdapter", bridge_dependencies=("mri_analyzer_bridge",)),
    "pubmed": _entry(source_name="PubMed", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.pubmed_adapter", class_name="PubMedAdapter"),
    "ctgov": _entry(source_name="ClinicalTrials.gov", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.clinicaltrials_adapter", class_name="ClinicalTrialsAdapter"),
    "cochrane": _entry(source_name="Cochrane", tier="P0", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.cochrane_adapter", class_name="CochraneAdapter"),
    "europepmc": _entry(source_name="Europe PMC", tier="P1", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.europepmc_adapter", class_name="EuropePMCAdapter"),
    "gnomad": _entry(source_name="gnomAD", tier="P1", implemented=True, registered=True, live_exposed=True, import_path=f"{_SERVICE}.gnomad_adapter", class_name="GnomadAdapter", bridge_dependencies=("genetic_analyzer_bridge",)),
    "uniprot": _entry(source_name="UniProt", tier="P1", implemented=False, bridge_dependencies=("genetic_analyzer_bridge",), references=("apps/api/tests/knowledge/test_batch4_genetics.py", "docs/engineering/knowledge-adapter-roadmap.md", "docs/knowledge/BATCH4_GENETICS_INTEGRATION_REPORT.md"), notes="Referenced by genetics bridge and docs, but no canonical service adapter file exists."),
    "disgenet": _entry(source_name="DisGeNET", tier="P1", implemented=False, references=("requested_rebuild_report",), notes="Claimed in rebuild report, absent from canonical service adapter package."),
    "opentargets": _entry(source_name="OpenTargets", tier="P1", implemented=False, references=("requested_rebuild_report",), notes="Claimed in rebuild report, absent from canonical service adapter package."),
    "pharnet": _entry(source_name="Pharos", tier="P1", implemented=False, references=("requested_rebuild_report",), notes="Claimed in rebuild report, absent from canonical service adapter package."),
    "guidetopharmacology": _entry(source_name="Guide to Pharmacology", tier="P1", implemented=False, references=("requested_rebuild_report",), notes="Claimed in rebuild report, absent from canonical service adapter package."),
    "epilepsygenome": _entry(source_name="EpilepsyGenome", tier="P1", implemented=False, references=("requested_rebuild_report",), notes="Claimed in rebuild report, absent from canonical service adapter package."),
    "alzgene": _entry(source_name="AlzGene", tier="P1", implemented=False, references=("requested_rebuild_report",), notes="Claimed in rebuild report, absent from canonical service adapter package."),
    "neurodev": _entry(source_name="NeuroDev", tier="P1", implemented=False, references=("requested_rebuild_report",), notes="Claimed in rebuild report, absent from canonical service adapter package."),
    "gwas_catalog": _entry(source_name="GWAS Catalog", tier="P1", implemented=False, bridge_dependencies=("genetic_analyzer_bridge",), notes="Bridge dependency is declared, but no canonical service adapter file exists."),
    "dbsnp": _entry(source_name="dbSNP", tier="P1", implemented=False, bridge_dependencies=("genetic_analyzer_bridge",), notes="Bridge dependency is declared, but no canonical service adapter file exists."),
    "ensembl": _entry(source_name="Ensembl", tier="P1", implemented=False, bridge_dependencies=("genetic_analyzer_bridge",), notes="Bridge dependency is declared, but no canonical service adapter file exists."),
    "string": _entry(source_name="STRING", tier="P1", implemented=False, bridge_dependencies=("genetic_analyzer_bridge",), notes="Bridge dependency is declared, but no canonical service adapter file exists."),
    "myvariant": _entry(source_name="MyVariant.info", tier="P1", implemented=False, bridge_dependencies=("genetic_analyzer_bridge",), notes="Bridge dependency is declared, but no canonical service adapter file exists."),
}


def list_manifest_keys() -> Tuple[str, ...]:
    return tuple(ADAPTER_MANIFEST.keys())


def get_manifest_entry(key: str) -> Dict[str, Any] | None:
    entry = ADAPTER_MANIFEST.get(key)
    return dict(entry) if entry is not None else None


def get_registered_manifest_keys() -> Tuple[str, ...]:
    return tuple(key for key, entry in ADAPTER_MANIFEST.items() if entry.get("registered", False))


def get_live_manifest_keys() -> Tuple[str, ...]:
    return tuple(key for key, entry in ADAPTER_MANIFEST.items() if entry.get("live_exposed", False))


def build_inventory_rows(*, disabled_keys: Tuple[str, ...] = ()) -> List[Dict[str, Any]]:
    disabled = set(disabled_keys)
    rows: List[Dict[str, Any]] = []
    for key, entry in ADAPTER_MANIFEST.items():
        status = "disabled" if key in disabled else str(entry.get("status", "missing"))
        rows.append(
            {
                "key": key,
                "implemented": bool(entry.get("implemented", False)),
                "registered": bool(entry.get("registered", False)),
                "live_exposed": bool(entry.get("live_exposed", False)),
                "status": status,
                "tier": str(entry.get("tier", "")),
                "bridge_dependencies": list(entry.get("bridge_dependencies", [])),
                "references": list(entry.get("references", [])),
            }
        )
    return rows


def build_drift_report() -> Dict[str, List[str]]:
    return {
        "manifest_keys": sorted(ADAPTER_MANIFEST.keys()),
        "registered_manifest_keys": sorted(get_registered_manifest_keys()),
        "live_manifest_keys": sorted(get_live_manifest_keys()),
        "orphan_imports": sorted(
            key
            for key, entry in ADAPTER_MANIFEST.items()
            if not entry.get("implemented", False) and entry.get("bridge_dependencies")
        ),
        "unregistered_implemented_adapters": sorted(
            key
            for key, entry in ADAPTER_MANIFEST.items()
            if entry.get("implemented", False) and not entry.get("registered", False)
        ),
        "registered_missing_adapters": sorted(
            key
            for key, entry in ADAPTER_MANIFEST.items()
            if entry.get("registered", False) and not entry.get("implemented", False)
        ),
        "live_exposed_missing_adapters": sorted(
            key
            for key, entry in ADAPTER_MANIFEST.items()
            if entry.get("live_exposed", False) and not entry.get("implemented", False)
        ),
        "missing_bridge_dependencies": sorted(
            key
            for key, entry in ADAPTER_MANIFEST.items()
            if not entry.get("implemented", False) and entry.get("bridge_dependencies")
        ),
    }


__all__: List[str] = [
    "ADAPTER_MANIFEST",
    "build_drift_report",
    "build_inventory_rows",
    "get_manifest_entry",
    "get_live_manifest_keys",
    "get_registered_manifest_keys",
    "list_manifest_keys",
]
