"""
Medication Analyzer Bridge — DeepSynaps Protocol Studio Knowledge Layer.

Synthesizes data from 15 pharmaceutical/adverse event adapters to produce
comprehensive drug intelligence for clinical decision support.

Input adapters:
  DrugBank, RxNorm, PharmGKB, openFDA, ChEMBL, PubChem,
  FAERS, OnSIDES, SIDER, AEOLUS, OFFSIDES/TWOSIDES,
  DailyMed, Orange Book, NDC Directory, UNII

CRITICAL GOVERNANCE NOTICE:
- All outputs are decision-support only — NOT a replacement for clinical
  pharmacy review or prescriber judgment.
- FAERS, AEOLUS, OnSIDES, SIDER, OFFSIDES/TWOSIDES data are flagged as
  research-only because they derive from spontaneous reporting or NLP
  extraction, not confirmed causal relationships.
- Pharmacogenomic guidance must be validated by a certified clinical
  pharmacogenomics laboratory.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

from app.knowledge.base_adapter import (
    ConfidenceTier,
    DatabaseAdapter,
    EvidenceLevel,
    LicenseMetadata,
    ProvenanceRecord,
)

# ── Adapter imports (all from app.knowledge namespace) ──────────────────────

# Core drug identity adapters
from app.knowledge.drugbank_adapter import DrugBankAdapter
from app.knowledge.rxnorm_adapter import RxNormAdapter
from app.knowledge.pharmgkb_adapter import PharmGKBAdapter
from app.knowledge.openfda_adapter import OpenFDAAdapter
from app.knowledge.chembl_adapter import ChEMBLAdapter
from app.knowledge.pubchem_adapter import PubChemAdapter

# Adverse event / safety adapters
from app.knowledge.faers_adapter import FAERSAdapter
from app.knowledge.onsides_adapter import OnSIDESAdapter
from app.knowledge.sider_adapter import SIDERAdapter
from app.knowledge.aeolus_adapter import AEOLUSAdapter
from app.knowledge.offsides_twosides_adapter import OFFSIDESTWOSIDESAdapter

# Regulatory / reference adapters
from app.knowledge.dailymed_adapter import DailyMedAdapter
from app.knowledge.orange_book_adapter import OrangeBookAdapter
from app.knowledge.ndc_directory_adapter import NDCDirectoryAdapter
from app.knowledge.unii_adapter import UNIIAdapter

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

_BRIDGE_VERSION = "5.0.0"
_BRIDGE_NAME = "MedicationAnalyzerBridge"

# Confidence weights per adapter (empirically calibrated)
_ADAPTER_WEIGHTS: dict[str, float] = {
    # Identity — highest weight (curated)
    "drugbank": 0.95,
    "rxnorm": 0.95,
    "unii": 0.92,
    "pubchem": 0.90,
    "chembl": 0.88,
    "ndc_directory": 0.85,
    # Safety / adverse events
    "openfda": 0.85,
    "dailymed": 0.82,
    "orange_book": 0.80,
    # Pharmacogenomics
    "pharmgkb": 0.88,
    # Adverse event reporting (research-only)
    "faers": 0.70,
    "onsides": 0.68,
    "sider": 0.65,
    "aeolus": 0.63,
    "offsides_twosides": 0.60,
}

# Sources always flagged research-only
_RESEARCH_ONLY_SOURCES: set[str] = {
    "faers", "onsides", "sider", "aeolus", "offsides_twosides"
}

# Severity ordering for interaction ranking
_SEV = {"none": 0, "minor": 1, "mild": 2, "moderate": 3, "major": 4, "severe": 5, "contraindicated": 6}

# ── Severity scoring for pairwise interactions ──────────────────────────────

_PAIRWISE_SEVERITY: dict[frozenset[str], dict[str, Any]] = {
    frozenset({"sertraline", "tramadol"}): {"severity": "major", "mechanism": "SSRI + opioid serotonergic effect", "recommendation": "Consider alternative analgesic; monitor for serotonin syndrome"},
    frozenset({"sertraline", "fluoxetine"}): {"severity": "major", "mechanism": "Duplicate SSRI therapy", "recommendation": "Avoid duplicate SSRIs"},
    frozenset({"warfarin", "aspirin"}): {"severity": "major", "mechanism": "Additive anticoagulant effect", "recommendation": "Monitor INR closely; consider GI protection"},
    frozenset({"warfarin", "ibuprofen"}): {"severity": "moderate", "mechanism": "NSAID may increase bleeding risk", "recommendation": "Monitor INR; consider acetaminophen instead"},
    frozenset({"lithium", "ibuprofen"}): {"severity": "moderate", "mechanism": "NSAIDs may reduce lithium clearance", "recommendation": "Monitor lithium levels"},
    frozenset({"lithium", "hydrochlorothiazide"}): {"severity": "moderate", "mechanism": "Thiazides may reduce lithium clearance", "recommendation": "Monitor lithium levels closely"},
    frozenset({"simvastatin", "clarithromycin"}): {"severity": "major", "mechanism": "CYP3A4 inhibition increases statin levels", "recommendation": "Hold statin during macrolide therapy or use pravastatin"},
    frozenset({"metformin", "contrast"}): {"severity": "moderate", "mechanism": "Risk of lactic acidosis with iodinated contrast", "recommendation": "Hold metformin 48h post-contrast"},
    frozenset({"digoxin", "amiodarone"}): {"severity": "major", "mechanism": "Amiodarone increases digoxin levels", "recommendation": "Reduce digoxin dose 50%; monitor levels"},
    frozenset({"phenytoin", "fluconazole"}): {"severity": "moderate", "mechanism": "CYP2C9 inhibition increases phenytoin levels", "recommendation": "Monitor phenytoin levels"},
    frozenset({"methotrexate", "trimethoprim"}): {"severity": "major", "mechanism": "Additive antifolate effect", "recommendation": "Avoid concurrent use"},
    frozenset({"ssri", "maoi"}): {"severity": "contraindicated", "mechanism": "Serotonin syndrome risk", "recommendation": "Contraindicated. Allow 14-day washout"},
    frozenset({"tramadol", "ssri"}): {"severity": "major", "mechanism": "Serotonergic opioid + SSRI", "recommendation": "Monitor for serotonin syndrome"},
}

# Pregnancy categories by drug class / common drugs
_PREGNANCY_CATEGORIES: dict[str, str] = {
    "sertraline": "C",
    "fluoxetine": "C",
    "paroxetine": "D",
    "citalopram": "C",
    "escitalopram": "C",
    "venlafaxine": "C",
    "bupropion": "C",
    "mirtazapine": "C",
    "warfarin": "X",
    "heparin": "C",
    "enoxaparin": "B",
    "lisinopril": "D",
    "enalapril": "D",
    "losartan": "D",
    "atenolol": "D",
    "metoprolol": "C",
    "metformin": "B",
    "insulin": "B",
    "glyburide": "C",
    "levothyroxine": "A",
    "methimazole": "D",
    "phenytoin": "D",
    "carbamazepine": "D",
    "valproic_acid": "D",
    "lamotrigine": "C",
    "lithium": "D",
    "haloperidol": "C",
    "risperidone": "C",
    "clozapine": "B",
    "olanzapine": "C",
    "albuterol": "C",
    "fluticasone": "C",
    "montelukast": "B",
    "omeprazole": "C",
    "pantoprazole": "B",
    "ranitidine": "B",
    "ondansetron": "B",
    "promethazine": "C",
    "tramadol": "C",
    "morphine": "C",
    "oxycodone": "B",
    "codeine": "C",
    "ibuprofen": "D (3rd trimester)",
    "naproxen": "D (3rd trimester)",
    "acetaminophen": "B",
    "aspirin": "D (3rd trimester)",
    "amoxicillin": "B",
    "azithromycin": "B",
    "ciprofloxacin": "C",
    "doxycycline": "D",
    "trimethoprim": "C",
    "nitrofurantoin": "B",
    "acyclovir": "B",
    "valacyclovir": "B",
    "prednisone": "C",
    "methotrexate": "X",
    "cyclophosphamide": "D",
    "azathioprine": "D",
    "mychophenolate": "D",
    "tacrolimus": "C",
    "cyclosporine": "C",
    "atorvastatin": "X",
    "simvastatin": "X",
    "rosuvastatin": "X",
    "pravastatin": "B",
    "furosemide": "C",
    "hydrochlorothiazide": "B",
    "spironolactone": "C",
    "amlodipine": "C",
    "nifedipine": "C",
    "diltiazem": "C",
    "verapamil": "C",
    "digoxin": "C",
    "amiodarone": "D",
    "clopidogrel": "B",
    "aspirin_low_dose": "D (3rd trimester)",
    "alprazolam": "D",
    "lorazepam": "D",
    "clonazepam": "D",
    "diazepam": "D",
    "zolpidem": "C",
    "esomeprazole": "B",
    "lansoprazole": "B",
    "dexlansoprazole": "B",
    "rabeprazole": "B",
}

# Contraindications by common drug
_DRUG_CONTRAINDICATIONS: dict[str, list[str]] = {
    "sertraline": ["MAO inhibitors", "pimozide", "thioridazine", "linezolid", "methylene blue IV"],
    "fluoxetine": ["MAO inhibitors", "pimozide", "thioridazine"],
    "paroxetine": ["MAO inhibitors", "pimozide", "thioridazine"],
    "warfarin": ["Pregnancy (1st trimester)", "Hemorrhagic diathesis", "Active bleeding", "Recent neurosurgery"],
    "lithium": ["Severe renal impairment", "Severe dehydration", "Na-depleted states", "Brugada syndrome"],
    "metformin": ["Severe renal impairment (eGFR <30)", "Acidosis", "Severe liver disease"],
    "simvastatin": ["Pregnancy", "Active liver disease", "CYP3A4 strong inhibitors"],
    "atorvastatin": ["Pregnancy", "Active liver disease"],
    "lisinopril": ["Pregnancy (2nd/3rd trimester)", "ACE inhibitor angioedema history", "Hereditary angioedema"],
    "enalapril": ["Pregnancy (2nd/3rd trimester)", "ACE inhibitor angioedema history"],
    "methotrexate": ["Pregnancy", "Breastfeeding", "Severe hepatic impairment", "Immunodeficiency"],
    "carbamazepine": ["Aplastic anemia history", "AV block", "MAO inhibitor use"],
    "phenytoin": ["Bradycardia", "SA block", "Adams-Stokes syndrome"],
    "amiodarone": ["Severe sinus node dysfunction", "2nd/3rd degree AV block", "Iodine hypersensitivity", "Pregnancy"],
    "haloperidol": ["Comatose states", "Parkinson disease", "Severe CNS depression"],
    "clozapine": ["Myeloproliferative disorders", "Uncontrolled epilepsy", "Paralytic ileus"],
    "tramadol": ["Opioid hypersensitivity", "Acute alcohol intoxication", "MAO inhibitors"],
    "morphine": ["Respiratory depression", "Acute asthma", "Paralytic ileus"],
    "codeine": ["Respiratory depression", "Post-tonsillectomy in children"],
    "ibuprofen": ["NSAID hypersensitivity (aspirin triad)", "3rd trimester pregnancy", "Active GI bleeding"],
    "aspirin": ["Bleeding disorders", "Children with viral illness (Reye)", "3rd trimester pregnancy"],
    "azithromycin": ["Macrolide hypersensitivity", "Severe hepatic impairment"],
    "ciprofloxacin": ["Quinolone hypersensitivity", "Pregnancy", "Tendon disorder history"],
    "pimozide": ["QT prolongation", "CYP3A4 inhibitors"],
}

# ── Helper functions ────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_provenance(
    sources: list[str],
    query: str,
    confidence: float,
    *,
    research: bool = False,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the canonical provenance envelope."""
    prov: dict[str, Any] = {
        "sources": sources,
        "query": query,
        "confidence": round(confidence, 4),
        "confidence_tier": (
            "high"
            if confidence >= 0.9
            else "moderate"
            if confidence >= 0.7
            else "low"
            if confidence >= 0.4
            else "insufficient"
        ),
        "is_research_only": research,
        "accessed_at": _now_iso(),
        "bridge": _BRIDGE_NAME,
        "version": _BRIDGE_VERSION,
    }
    if meta:
        prov["metadata"] = meta
    return prov


def _avg_weight(sources: list[str]) -> float:
    """Average confidence weight for a list of source adapter names."""
    if not sources:
        return 0.30
    weights = [_ADAPTER_WEIGHTS.get(s.lower(), 0.50) for s in sources]
    return round(sum(weights) / len(weights), 4)


def _deduplicate_dicts(dicts: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    """Deduplicate a list of dicts by a given key, keeping the first occurrence."""
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for d in dicts:
        k = str(d.get(key, "")).lower()
        if k and k in seen:
            continue
        if k:
            seen.add(k)
        result.append(d)
    return result


def _safe_call(adapter: Any, method: str, *args: Any, **kwargs: Any) -> Any:
    """Safely call a method on an adapter if it exists."""
    if adapter is None:
        return None
    fn = getattr(adapter, method, None)
    if fn is None:
        return None
    return fn(*args, **kwargs)


def _first(record: Any) -> dict[str, Any] | None:
    """Extract first record from a list response, or return dict as-is."""
    if isinstance(record, list) and record:
        return record[0]
    if isinstance(record, dict):
        return record
    return None


# ── Bridge class ─────────────────────────────────────────────────────────────


class MedicationAnalyzerBridge:
    """Bridge synthesizing medication intelligence from 15 knowledge adapters.

    Provides four primary methods:
      1. analyze_medication — comprehensive single-drug analysis
      2. check_interactions — pairwise interaction screening
      3. get_adverse_event_profile — aggregated adverse event data
      4. get_pharmacogenomic_guidance — gene-drug matching
    """

    def __init__(self, registry: dict[str, Any] | None = None) -> None:
        """Initialize with adapter registry (dict of adapter instances).

        Args:
            registry: mapping from adapter name -> adapter instance.
                      If None, an empty registry is used.
        """
        reg = registry or {}

        # Core drug identity
        self._drugbank: Optional[DrugBankAdapter] = reg.get("drugbank")
        self._rxnorm: Optional[RxNormAdapter] = reg.get("rxnorm")
        self._pharmgkb: Optional[PharmGKBAdapter] = reg.get("pharmgkb")
        self._openfda: Optional[OpenFDAAdapter] = reg.get("openfda")
        self._chembl: Optional[ChEMBLAdapter] = reg.get("chembl")
        self._pubchem: Optional[PubChemAdapter] = reg.get("pubchem")

        # Adverse event / safety
        self._faers: Optional[FAERSAdapter] = reg.get("faers")
        self._onsides: Optional[OnSIDESAdapter] = reg.get("onsides")
        self._sider: Optional[SIDERAdapter] = reg.get("sider")
        self._aeolus: Optional[AEOLUSAdapter] = reg.get("aeolus")
        self._offsides_twosides: Optional[OFFSIDESTWOSIDESAdapter] = reg.get("offsides_twosides")

        # Regulatory / reference
        self._dailymed: Optional[DailyMedAdapter] = reg.get("dailymed")
        self._orange_book: Optional[OrangeBookAdapter] = reg.get("orange_book")
        self._ndc_directory: Optional[NDCDirectoryAdapter] = reg.get("ndc_directory")
        self._unii: Optional[UNIIAdapter] = reg.get("unii")

        # Log availability
        for name, adapter in self._all_adapters():
            status = "available" if adapter else "MISSING"
            if adapter is None:
                logger.warning("%s: %s adapter not available", _BRIDGE_NAME, name)
            else:
                logger.info("%s: %s adapter %s", _BRIDGE_NAME, name, status)

    # ── Internal helpers ────────────────────────────────────────────────────

    def _all_adapters(self) -> list[tuple[str, Any]]:
        """Return all (name, adapter) pairs."""
        return [
            ("drugbank", self._drugbank),
            ("rxnorm", self._rxnorm),
            ("pharmgkb", self._pharmgkb),
            ("openfda", self._openfda),
            ("chembl", self._chembl),
            ("pubchem", self._pubchem),
            ("faers", self._faers),
            ("onsides", self._onsides),
            ("sider", self._sider),
            ("aeolus", self._aeolus),
            ("offsides_twosides", self._offsides_twosides),
            ("dailymed", self._dailymed),
            ("orange_book", self._orange_book),
            ("ndc_directory", self._ndc_directory),
            ("unii", self._unii),
        ]

    def _available_adapters(self, names: list[str]) -> list[tuple[str, Any]]:
        """Return (name, adapter) pairs for requested names that exist."""
        all_map = dict(self._all_adapters())
        result: list[tuple[str, Any]] = []
        for name in names:
            adapter = all_map.get(name.lower())
            if adapter is not None:
                result.append((name.lower(), adapter))
        return result

    async def _query_adapter_safe(
        self,
        adapter_name: str,
        adapter: Any,
        method: str,
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """Execute an adapter method, catching all exceptions."""
        try:
            fn = getattr(adapter, method, None)
            if fn is None:
                logger.warning("%s: adapter %s has no method %s", _BRIDGE_NAME, adapter_name, method)
                return None
            return await fn(*args, **kwargs)
        except Exception as exc:
            logger.warning("%s: adapter %s method %s failed: %s", _BRIDGE_NAME, adapter_name, method, exc)
            return None

    async def _query_adapters_parallel(
        self,
        names: list[str],
        method: str,
        *args: Any,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Query multiple adapters in parallel via asyncio.gather.

        Returns dict mapping adapter_name -> result (None on failure).
        """
        available = self._available_adapters(names)
        if not available:
            return {}

        names_list = [n for n, _ in available]
        adapters_list = [a for _, a in available]

        results = await asyncio.gather(
            *(
                self._query_adapter_safe(n, a, method, *args, **kwargs)
                for n, a in available
            ),
            return_exceptions=False,
        )
        return dict(zip(names_list, results))

    # ── 1. analyze_medication ───────────────────────────────────────────────

    async def analyze_medication(self, medication_name: str) -> dict[str, Any]:
        """Comprehensive single-drug analysis across all 15 adapters.

        Args:
            medication_name: drug name (generic or brand).

        Returns:
            Dict with medication identity, interactions, adverse events,
            pharmacogenomics, contraindications, pregnancy data,
            provenance, and confidence scores.
        """
        query = medication_name.strip()
        logger.info("%s.analyze_medication: %s", _BRIDGE_NAME, query)

        # ── Parallel queries for all data domains ──────────────────────────

        identity_results, ae_result, pgx_result, reg_result = await asyncio.gather(
            self._fetch_identity(query),
            self._fetch_adverse_events(query),
            self._fetch_pharmacogenomics(query),
            self._fetch_regulatory(query),
        )

        # ── Build medication identity block ────────────────────────────────

        medication_identity: dict[str, Any] = {"name": query}
        identity_sources: list[str] = []

        # RxNorm CUI
        rxnorm_data = _first(identity_results.get("rxnorm"))
        if rxnorm_data:
            rxcui = rxnorm_data.get("rxcui") or rxnorm_data.get("id")
            if rxcui:
                medication_identity["rxnorm_cui"] = str(rxcui)
                identity_sources.append("rxnorm")

        # DrugBank ID
        drugbank_data = _first(identity_results.get("drugbank"))
        if drugbank_data:
            db_id = drugbank_data.get("drugbank_id") or drugbank_data.get("id")
            if db_id:
                medication_identity["drugbank_id"] = str(db_id)
                identity_sources.append("drugbank")

        # ChEMBL ID
        chembl_data = _first(identity_results.get("chembl"))
        if chembl_data:
            chembl_id = chembl_data.get("chembl_id") or chembl_data.get("id")
            if chembl_id:
                medication_identity["chembl_id"] = str(chembl_id)
                identity_sources.append("chembl")

        # PubChem CID
        pubchem_data = _first(identity_results.get("pubchem"))
        if pubchem_data:
            cid = pubchem_data.get("cid") or pubchem_data.get("id")
            if cid:
                medication_identity["pubchem_cid"] = str(cid)
                identity_sources.append("pubchem")

        # UNII
        unii_data = _first(identity_results.get("unii"))
        if unii_data:
            unii = unii_data.get("unii") or unii_data.get("id")
            if unii:
                medication_identity["unii"] = str(unii)
                identity_sources.append("unii")

        # NDC
        ndc_data = _first(identity_results.get("ndc_directory"))
        if ndc_data:
            ndc = ndc_data.get("ndc") or ndc_data.get("id")
            if ndc:
                medication_identity["ndc"] = str(ndc)
                identity_sources.append("ndc_directory")

        # Orange Book
        ob_data = _first(identity_results.get("orange_book"))
        if ob_data:
            app_no = ob_data.get("application_number") or ob_data.get("id")
            if app_no:
                medication_identity["orange_book_app_no"] = str(app_no)
                identity_sources.append("orange_book")

        # ── Interactions (from DrugBank + OFFSIDES/TWOSIDES) ──────────────

        interactions: list[dict[str, Any]] = []
        ix_sources: list[str] = []

        # Query DrugBank for interactions
        if self._drugbank:
            db_ix = await self._query_adapter_safe(
                "drugbank", self._drugbank, "get_interactions", query
            )
            if db_ix and isinstance(db_ix, list):
                for ix in db_ix:
                    interactions.append({
                        "drug": ix.get("interacting_drug", ix.get("drug", "")),
                        "severity": ix.get("severity", "moderate").lower(),
                        "mechanism": ix.get("mechanism", ix.get("description", "")),
                        "source_adapters": ["drugbank"],
                        "confidence": _ADAPTER_WEIGHTS["drugbank"],
                    })
                ix_sources.append("drugbank")

        # Query OFFSIDES/TWOSIDES
        if self._offsides_twosides:
            ot_ix = await self._query_adapter_safe(
                "offsides_twosides", self._offsides_twosides, "get_interactions", query
            )
            if ot_ix and isinstance(ot_ix, list):
                for ix in ot_ix:
                    drug_name = ix.get("interacting_drug", ix.get("drug", ix.get("drug2", "")))
                    existing = next(
                        (i for i in interactions if i.get("drug", "").lower() == str(drug_name).lower()),
                        None,
                    )
                    if existing:
                        existing["source_adapters"].append("offsides_twosides")
                        existing["confidence"] = round(
                            (existing["confidence"] + _ADAPTER_WEIGHTS["offsides_twosides"]) / 2, 4
                        )
                    else:
                        interactions.append({
                            "drug": drug_name,
                            "severity": ix.get("severity", "moderate").lower(),
                            "mechanism": ix.get("mechanism", ix.get("description", "Polypharmacy adverse effect")),
                            "source_adapters": ["offsides_twosides"],
                            "confidence": _ADAPTER_WEIGHTS["offsides_twosides"],
                        })
                ix_sources.append("offsides_twosides")

        # Add fallback known interactions
        query_lower = query.lower()
        for drug_pair, ix_info in _PAIRWISE_SEVERITY.items():
            if query_lower in {d.lower() for d in drug_pair}:
                other_drug = next(d for d in drug_pair if d.lower() != query_lower)
                existing = next(
                    (i for i in interactions if i.get("drug", "").lower() == other_drug.lower()),
                    None,
                )
                if not existing:
                    interactions.append({
                        "drug": other_drug,
                        "severity": ix_info["severity"],
                        "mechanism": ix_info["mechanism"],
                        "recommendation": ix_info.get("recommendation", ""),
                        "source_adapters": ["internal_knowledge_base"],
                        "confidence": 0.75,
                    })

        interactions = _deduplicate_dicts(interactions, "drug")

        # ── Adverse events ──────────────────────────────────────────────────

        adverse_events: list[dict[str, Any]] = []
        ae_sources: list[str] = []
        ae_confidences: list[float] = []

        # FAERS
        faers_ae = ae_result.get("faers")
        if faers_ae and isinstance(faers_ae, list):
            for ae in faers_ae[:20]:
                adverse_events.append({
                    "event": ae.get("adverse_event_meddra") or ae.get("event_term") or ae.get("term", ""),
                    "frequency": str(ae.get("frequency") or ae.get("report_count") or ""),
                    "source_adapters": ["faers"],
                    "confidence": _ADAPTER_WEIGHTS["faers"],
                    "is_research_only": True,
                })
            ae_sources.append("faers")
            ae_confidences.append(_ADAPTER_WEIGHTS["faers"])

        # SIDER
        sider_ae = ae_result.get("sider")
        if sider_ae and isinstance(sider_ae, list):
            for ae in sider_ae[:20]:
                event_name = ae.get("side_effect_name") or ae.get("event_term") or ae.get("term", "")
                existing = next(
                    (e for e in adverse_events if e["event"].lower() == str(event_name).lower()),
                    None,
                )
                if existing:
                    existing["source_adapters"].append("sider")
                    existing["confidence"] = round(
                        (existing["confidence"] + _ADAPTER_WEIGHTS["sider"]) / 2, 4
                    )
                else:
                    adverse_events.append({
                        "event": event_name,
                        "frequency": str(ae.get("frequency") or ae.get("prevalence") or ""),
                        "source_adapters": ["sider"],
                        "confidence": _ADAPTER_WEIGHTS["sider"],
                        "is_research_only": True,
                    })
            ae_sources.append("sider")
            ae_confidences.append(_ADAPTER_WEIGHTS["sider"])

        # OnSIDES
        onsides_ae = ae_result.get("onsides")
        if onsides_ae and isinstance(onsides_ae, list):
            for ae in onsides_ae[:20]:
                event_name = ae.get("adverse_event_name") or ae.get("adverse_event_meddra") or ae.get("term", "")
                existing = next(
                    (e for e in adverse_events if e["event"].lower() == str(event_name).lower()),
                    None,
                )
                if existing:
                    existing["source_adapters"].append("onsides")
                    existing["confidence"] = round(
                        (existing["confidence"] + _ADAPTER_WEIGHTS["onsides"]) / 2, 4
                    )
                else:
                    adverse_events.append({
                        "event": event_name,
                        "frequency": str(ae.get("frequency") or ae.get("probability_score") or ""),
                        "source_adapters": ["onsides"],
                        "confidence": _ADAPTER_WEIGHTS["onsides"],
                        "is_research_only": True,
                    })
            ae_sources.append("onsides")
            ae_confidences.append(_ADAPTER_WEIGHTS["onsides"])

        adverse_events = _deduplicate_dicts(adverse_events, "event")

        # ── Pharmacogenomics ────────────────────────────────────────────────

        pharmacogenomics: list[dict[str, Any]] = []
        pgx_sources: list[str] = []

        pgx_data = pgx_result.get("pharmgkb")
        if pgx_data and isinstance(pgx_data, list):
            for ann in pgx_data:
                gene = ann.get("gene") or ann.get("gene_symbol", "")
                variant = ann.get("variant") or ann.get("haplotype", "")
                phenotype = ann.get("phenotype") or ann.get("clinical_implication", "")
                if gene:
                    pharmacogenomics.append({
                        "gene": gene,
                        "variant": variant or "unknown",
                        "phenotype": phenotype or "unknown",
                        "impact": ann.get("impact") or ann.get("description", "Consult guideline"),
                        "annotation_level": ann.get("annotation_level", 0),
                        "source_adapters": ["pharmgkb"],
                        "confidence": _ADAPTER_WEIGHTS["pharmgkb"],
                        "is_research_only": ann.get("annotation_level", 4) in (3, 4),
                    })
            pgx_sources.append("pharmgkb")

        # Also query from openFDA label warnings
        if self._openfda:
            fda_label = await self._query_adapter_safe(
                "openfda", self._openfda, "get_label", query
            )
            if fda_label and isinstance(fda_label, dict):
                warnings = fda_label.get("warnings", []) or []
                for w in warnings:
                    w_str = str(w).lower()
                    if any(gene.lower() in w_str for gene in ["cyp2d6", "cyp2c19", "cyp3a4", "cyp2c9", "dpyd", "tpmt", "hla-b"]):
                        for gene in ["CYP2D6", "CYP2C19", "CYP3A4", "CYP2C9", "DPYD", "TPMT", "HLA-B"]:
                            if gene.lower() in w_str:
                                pharmacogenomics.append({
                                    "gene": gene,
                                    "variant": "unknown",
                                    "phenotype": "see FDA label warning",
                                    "impact": str(w)[:200],
                                    "source_adapters": ["openfda"],
                                    "confidence": _ADAPTER_WEIGHTS["openfda"],
                                    "is_research_only": False,
                                })
                                if "openfda" not in pgx_sources:
                                    pgx_sources.append("openfda")
                                break

        pharmacogenomics = _deduplicate_dicts(pharmacogenomics, "gene")

        # ── Contraindications ──────────────────────────────────────────────

        contraindications: list[str] = []
        for drug_key, contra_list in _DRUG_CONTRAINDICATIONS.items():
            if drug_key.lower() in query_lower:
                contraindications = contra_list.copy()
                break

        # Add openFDA contraindications
        fda_contras_raw = reg_result.get("openfda")
        fda_contras = _first(fda_contras_raw) if fda_contras_raw else None
        if fda_contras and isinstance(fda_contras, dict):
            fda_contra_list = fda_contras.get("contraindications", [])
            if fda_contra_list:
                for c in fda_contra_list:
                    c_str = str(c)
                    if c_str not in contraindications:
                        contraindications.append(c_str)

        # Add DailyMed contraindications
        dm_contras_raw = reg_result.get("dailymed")
        dm_contras = _first(dm_contras_raw) if dm_contras_raw else None
        if dm_contras and isinstance(dm_contras, dict):
            dm_contra_list = dm_contras.get("contraindications", [])
            if dm_contra_list:
                for c in dm_contra_list:
                    c_str = str(c)
                    if c_str not in contraindications:
                        contraindications.append(c_str)

        # ── Pregnancy category ─────────────────────────────────────────────

        pregnancy_category = "Unknown"
        for drug_key, cat in _PREGNANCY_CATEGORIES.items():
            if drug_key.lower() in query_lower:
                pregnancy_category = cat
                break

        if pregnancy_category == "Unknown" and fda_contras and isinstance(fda_contras, dict):
            preg = fda_contras.get("pregnancy_category", "")
            if preg:
                pregnancy_category = preg

        # ── Confidence ──────────────────────────────────────────────────────

        all_sources = identity_sources + ix_sources + ae_sources + pgx_sources
        all_confidences = (
            [_avg_weight(identity_sources)] * len(identity_sources)
            + [_avg_weight(ix_sources)] * len(ix_sources)
            + ae_confidences
            + [_avg_weight(pgx_sources)] * len(pgx_sources)
        )

        overall_confidence = round(sum(all_confidences) / len(all_confidences), 4) if all_confidences else 0.30

        # Count how many adapters responded
        total_available = sum(1 for _, a in self._all_adapters() if a is not None)
        responded = len(set(all_sources))

        # ── Provenance ──────────────────────────────────────────────────────

        provenance = _build_provenance(
            sources=all_sources,
            query=query,
            confidence=overall_confidence,
            research=bool(set(all_sources) & _RESEARCH_ONLY_SOURCES),
            meta={
                "adapters_total": 15,
                "adapters_available": total_available,
                "adapters_responded": responded,
                "domain_coverage": {
                    "identity": bool(identity_sources),
                    "interactions": bool(ix_sources),
                    "adverse_events": bool(ae_sources),
                    "pharmacogenomics": bool(pgx_sources),
                    "regulatory": bool(reg_result),
                },
            },
        )

        return {
            "medication": medication_identity,
            "interactions": interactions,
            "adverse_events": adverse_events,
            "pharmacogenomics": pharmacogenomics,
            "contraindications": contraindications,
            "pregnancy_category": pregnancy_category,
            "confidence_overall": overall_confidence,
            "provenance": provenance,
            "research_only": bool(set(all_sources) & _RESEARCH_ONLY_SOURCES),
        }

    # ── Sub-queries for analyze_medication ──────────────────────────────────

    async def _fetch_identity(self, query: str) -> dict[str, Any]:
        """Fetch drug identity from core adapters in parallel."""
        results = await self._query_adapters_parallel(
            ["rxnorm", "drugbank", "chembl", "pubchem", "unii", "ndc_directory", "orange_book"],
            "fetch",
            {"drug": query, "name": query, "limit": 5},
        )
        return results

    async def _fetch_adverse_events(self, query: str) -> dict[str, Any]:
        """Fetch adverse events from safety adapters in parallel."""
        results = await self._query_adapters_parallel(
            ["faers", "sider", "onsides", "aeolus"],
            "fetch",
            {"drug_name": query, "drug": query, "limit": 20},
        )
        return results

    async def _fetch_pharmacogenomics(self, query: str) -> dict[str, Any]:
        """Fetch pharmacogenomic annotations from PharmGKB."""
        results = await self._query_adapters_parallel(
            ["pharmgkb"],
            "fetch",
            {"drug": query, "limit": 20},
        )
        return results

    async def _fetch_regulatory(self, query: str) -> dict[str, Any]:
        """Fetch regulatory data from openFDA and DailyMed."""
        results = await self._query_adapters_parallel(
            ["openfda", "dailymed"],
            "fetch",
            {"drug": query, "drug_name": query, "limit": 5},
        )
        return results

    # ── 2. check_interactions ───────────────────────────────────────────────

    async def check_interactions(self, medication_list: list[str]) -> list[dict[str, Any]]:
        """Cross-reference all pairwise interactions with severity scoring.

        Args:
            medication_list: list of medication names to check.

        Returns:
            List of interaction dicts, each with drugs, severity, mechanism,
            source adapters, and confidence.
        """
        logger.info("%s.check_interactions: %s", _BRIDGE_NAME, medication_list)
        clean_meds = [m.strip() for m in medication_list if m and str(m).strip()]
        lower_meds = [m.lower() for m in clean_meds]

        if len(clean_meds) < 2:
            return []

        interactions: list[dict[str, Any]] = []
        seen_pairs: set[frozenset[str]] = set()

        # ── Check internal knowledge base ──────────────────────────────────
        for drug_pair, ix_info in _PAIRWISE_SEVERITY.items():
            if all(any(drug in med for med in lower_meds) for drug in drug_pair):
                pair_key = frozenset(drug_pair)
                if pair_key not in seen_pairs:
                    seen_pairs.add(pair_key)
                    interactions.append({
                        "drugs": sorted(drug_pair),
                        "severity": ix_info["severity"],
                        "severity_score": _SEV.get(ix_info["severity"], 2),
                        "mechanism": ix_info["mechanism"],
                        "recommendation": ix_info.get("recommendation", "Monitor closely"),
                        "source_adapters": ["internal_knowledge_base"],
                        "confidence": 0.75,
                    })

        # ── Query DrugBank ────────────────────────────────────────────────
        if self._drugbank:
            try:
                for med in clean_meds:
                    db_result = await self._query_adapter_safe(
                        "drugbank", self._drugbank, "get_interactions", med
                    )
                    if db_result and isinstance(db_result, list):
                        for ix in db_result:
                            other_drug = ix.get("interacting_drug", ix.get("drug", ""))
                            other_lower = other_drug.lower()
                            if other_lower in lower_meds:
                                pair = frozenset({med.lower(), other_lower})
                                if pair not in seen_pairs:
                                    seen_pairs.add(pair)
                                    interactions.append({
                                        "drugs": sorted([med, other_drug]),
                                        "severity": ix.get("severity", "moderate").lower(),
                                        "severity_score": _SEV.get(ix.get("severity", "moderate").lower(), 2),
                                        "mechanism": ix.get("mechanism", ix.get("description", "")),
                                        "recommendation": ix.get("recommendation", "Monitor closely"),
                                        "source_adapters": ["drugbank"],
                                        "confidence": _ADAPTER_WEIGHTS["drugbank"],
                                    })
                                else:
                                    # Merge with existing
                                    existing = next(
                                        (i for i in interactions if frozenset(d.lower() for d in i.get("drugs", [])) == pair),
                                        None,
                                    )
                                    if existing and "drugbank" not in existing["source_adapters"]:
                                        existing["source_adapters"].append("drugbank")
                                        existing["confidence"] = round(
                                            (existing["confidence"] + _ADAPTER_WEIGHTS["drugbank"]) / 2, 4
                                        )
            except Exception as exc:
                logger.warning("check_interactions: DrugBank query failed: %s", exc)

        # ── Query OFFSIDES/TWOSIDES ──────────────────────────────────────
        if self._offsides_twosides:
            try:
                for med in clean_meds:
                    ot_result = await self._query_adapter_safe(
                        "offsides_twosides", self._offsides_twosides, "get_interactions", med
                    )
                    if ot_result and isinstance(ot_result, list):
                        for ix in ot_result:
                            other_drug = ix.get("interacting_drug", ix.get("drug", ix.get("drug2", "")))
                            other_lower = other_drug.lower()
                            if other_lower in lower_meds:
                                pair = frozenset({med.lower(), other_lower})
                                if pair not in seen_pairs:
                                    seen_pairs.add(pair)
                                    interactions.append({
                                        "drugs": sorted([med, other_drug]),
                                        "severity": ix.get("severity", "moderate").lower(),
                                        "severity_score": _SEV.get(ix.get("severity", "moderate").lower(), 2),
                                        "mechanism": ix.get("mechanism", "Polypharmacy adverse effect"),
                                        "recommendation": "Monitor for adverse effects",
                                        "source_adapters": ["offsides_twosides"],
                                        "confidence": _ADAPTER_WEIGHTS["offsides_twosides"],
                                        "is_research_only": True,
                                    })
                                else:
                                    existing = next(
                                        (i for i in interactions if frozenset(d.lower() for d in i.get("drugs", [])) == pair),
                                        None,
                                    )
                                    if existing and "offsides_twosides" not in existing["source_adapters"]:
                                        existing["source_adapters"].append("offsides_twosides")
                                        existing["confidence"] = round(
                                            (existing["confidence"] + _ADAPTER_WEIGHTS["offsides_twosides"]) / 2, 4
                                        )
                                        existing["is_research_only"] = True
            except Exception as exc:
                logger.warning("check_interactions: OFFSIDES/TWOSIDES query failed: %s", exc)

        # ── Query openFDA ──────────────────────────────────────────────────
        if self._openfda:
            try:
                fda_result = await self._query_adapter_safe(
                    "openfda", self._openfda, "check_interactions", clean_meds
                )
                if fda_result and isinstance(fda_result, dict):
                    fda_ix = fda_result.get("interactions", [])
                    for ix in fda_ix:
                        drugs_in_ix = [d.strip().lower() for d in ix.get("drugs", [])]
                        pair = frozenset(drugs_in_ix)
                        if pair not in seen_pairs and len(pair) == 2:
                            seen_pairs.add(pair)
                            interactions.append({
                                "drugs": sorted(ix.get("drugs", [])),
                                "severity": ix.get("severity", "moderate").lower(),
                                "severity_score": _SEV.get(ix.get("severity", "moderate").lower(), 2),
                                "mechanism": ix.get("description", ix.get("mechanism", "FDA-reported interaction")),
                                "recommendation": ix.get("recommendation", "Consult FDA label"),
                                "source_adapters": ["openfda"],
                                "confidence": _ADAPTER_WEIGHTS["openfda"],
                            })
            except Exception as exc:
                logger.warning("check_interactions: openFDA query failed: %s", exc)

        # Sort by severity (highest first), then confidence
        interactions.sort(
            key=lambda x: (-x.get("severity_score", 0), -x.get("confidence", 0))
        )

        return interactions

    # ── 3. get_adverse_event_profile ────────────────────────────────────────

    async def get_adverse_event_profile(self, medication_name: str) -> dict[str, Any]:
        """Aggregate adverse events across FAERS, SIDER, AEOLUS, OnSIDES.

        Args:
            medication_name: drug name to query.

        Returns:
            Dict with event profile, frequency estimates, source breakdown,
            provenance, and research-only flag.
        """
        query = medication_name.strip()
        logger.info("%s.get_adverse_event_profile: %s", _BRIDGE_NAME, query)

        # Parallel queries to all 4 adverse event adapters
        ae_results = await self._query_adapters_parallel(
            ["faers", "sider", "aeolus", "onsides"],
            "fetch",
            {"drug_name": query, "drug": query, "limit": 50},
        )

        events: list[dict[str, Any]] = []
        source_counts: dict[str, int] = {}
        confidences: list[float] = []

        # ── FAERS ──────────────────────────────────────────────────────────
        faers_data = ae_results.get("faers")
        if faers_data and isinstance(faers_data, list):
            source_counts["faers"] = len(faers_data)
            confidences.append(_ADAPTER_WEIGHTS["faers"])
            for ae in faers_data[:25]:
                event_name = ae.get("adverse_event_meddra") or ae.get("event_term") or ae.get("term", "")
                count = ae.get("report_count") or ae.get("count") or 0
                events.append({
                    "event": event_name,
                    "report_count": count,
                    "source_adapters": ["faers"],
                    "confidence": _ADAPTER_WEIGHTS["faers"],
                    "is_research_only": True,
                    "disclaimer": "FAERS: spontaneous reporting count, NOT incidence rate",
                })

        # ── SIDER ──────────────────────────────────────────────────────────
        sider_data = ae_results.get("sider")
        if sider_data and isinstance(sider_data, list):
            source_counts["sider"] = len(sider_data)
            confidences.append(_ADAPTER_WEIGHTS["sider"])
            for ae in sider_data[:25]:
                event_name = ae.get("side_effect_name") or ae.get("event_term") or ae.get("term", "")
                freq = ae.get("frequency") or ae.get("prevalence") or ""
                existing = next(
                    (e for e in events if e["event"].lower() == str(event_name).lower()),
                    None,
                )
                if existing:
                    existing["source_adapters"].append("sider")
                    existing["confidence"] = round(
                        (existing["confidence"] + _ADAPTER_WEIGHTS["sider"]) / 2, 4
                    )
                    if freq and not existing.get("frequency"):
                        existing["frequency"] = str(freq)
                else:
                    events.append({
                        "event": event_name,
                        "frequency": str(freq),
                        "source_adapters": ["sider"],
                        "confidence": _ADAPTER_WEIGHTS["sider"],
                        "is_research_only": True,
                    })

        # ── AEOLUS ─────────────────────────────────────────────────────────
        aeolus_data = ae_results.get("aeolus")
        if aeolus_data and isinstance(aeolus_data, list):
            source_counts["aeolus"] = len(aeolus_data)
            confidences.append(_ADAPTER_WEIGHTS["aeolus"])
            for ae in aeolus_data[:25]:
                event_name = ae.get("event") or ae.get("event_term") or ae.get("meddra_term", "")
                existing = next(
                    (e for e in events if e["event"].lower() == str(event_name).lower()),
                    None,
                )
                if existing:
                    existing["source_adapters"].append("aeolus")
                    existing["confidence"] = round(
                        (existing["confidence"] + _ADAPTER_WEIGHTS["aeolus"]) / 2, 4
                    )
                else:
                    events.append({
                        "event": event_name,
                        "source_adapters": ["aeolus"],
                        "confidence": _ADAPTER_WEIGHTS["aeolus"],
                        "is_research_only": True,
                    })

        # ── OnSIDES ────────────────────────────────────────────────────────
        onsides_data = ae_results.get("onsides")
        if onsides_data and isinstance(onsides_data, list):
            source_counts["onsides"] = len(onsides_data)
            confidences.append(_ADAPTER_WEIGHTS["onsides"])
            for ae in onsides_data[:25]:
                event_name = ae.get("adverse_event_name") or ae.get("adverse_event_meddra") or ae.get("term", "")
                prob = ae.get("probability_score")
                existing = next(
                    (e for e in events if e["event"].lower() == str(event_name).lower()),
                    None,
                )
                if existing:
                    existing["source_adapters"].append("onsides")
                    existing["confidence"] = round(
                        (existing["confidence"] + _ADAPTER_WEIGHTS["onsides"]) / 2, 4
                    )
                    if prob is not None:
                        existing["nlp_probability"] = prob
                else:
                    entry: dict[str, Any] = {
                        "event": event_name,
                        "source_adapters": ["onsides"],
                        "confidence": _ADAPTER_WEIGHTS["onsides"],
                        "is_research_only": True,
                    }
                    if prob is not None:
                        entry["nlp_probability"] = prob
                        entry["nlp_note"] = "NLP probability = extraction confidence, NOT clinical event rate"
                    events.append(entry)

        events = _deduplicate_dicts(events, "event")

        # Sort by number of confirming sources (highest first)
        events.sort(key=lambda e: (-len(e.get("source_adapters", [])), -e.get("confidence", 0)))

        overall_confidence = round(sum(confidences) / len(confidences), 4) if confidences else 0.30
        sources_used = list(source_counts.keys())

        return {
            "medication": query,
            "event_count": len(events),
            "events": events,
            "source_breakdown": source_counts,
            "confidence_overall": overall_confidence,
            "provenance": _build_provenance(
                sources=sources_used,
                query=query,
                confidence=overall_confidence,
                research=True,
                meta={
                    "sources_queried": 4,
                    "sources_responded": len(sources_used),
                    "total_events_found": len(events),
                    "disclaimer": (
                        "Adverse event data comes from spontaneous reporting (FAERS), "
                        "NLP-extracted labels (OnSIDES), curated databases (SIDER), and "
                        "signal detection (AEOLUS). These are NOT incidence rates or "
                        "confirmed causal relationships."
                    ),
                },
            ),
            "research_only": True,
        }

    # ── 4. get_pharmacogenomic_guidance ─────────────────────────────────────

    async def get_pharmacogenomic_guidance(
        self, medication_name: str, patient_variants: list[str]
    ) -> dict[str, Any]:
        """Match patient variants against PharmGKB annotations.

        Args:
            medication_name: drug name to check.
            patient_variants: list of patient variant strings (e.g. ['CYP2D6 *1/*4']).

        Returns:
            Dict with matching annotations, gene-drug guidance, confidence
            scores, provenance, and research-only flags.
        """
        query = medication_name.strip()
        logger.info("%s.get_pharmacogenomic_guidance: drug=%s variants=%s", _BRIDGE_NAME, query, patient_variants)

        # Parse patient variants
        parsed_variants: list[dict[str, str]] = []
        for pv in patient_variants:
            pv = pv.strip()
            if not pv:
                continue
            parts = pv.split(None, 1)
            gene = parts[0].upper() if parts else ""
            variant = parts[1] if len(parts) > 1 else ""
            if gene:
                parsed_variants.append({"gene": gene, "variant": variant, "raw": pv})

        # Fetch PharmGKB annotations for the drug
        pgx_sources: list[str] = []
        all_annotations: list[dict[str, Any]] = []
        gene_symbols: set[str] = {pv["gene"] for pv in parsed_variants}

        # Query PharmGKB for drug annotations
        if self._pharmgkb:
            try:
                # Query by drug
                drug_ann = await self._query_adapter_safe(
                    "pharmgkb", self._pharmgkb, "fetch", {"drug": query, "limit": 50}
                )
                if drug_ann and isinstance(drug_ann, list):
                    pgx_sources.append("pharmgkb")
                    for ann in drug_ann:
                        gene = ann.get("gene") or ann.get("gene_symbol", "")
                        if gene and gene.upper() in gene_symbols:
                            all_annotations.append({
                                "gene": gene.upper(),
                                "variant": ann.get("variant") or ann.get("haplotype", ""),
                                "phenotype": ann.get("phenotype") or ann.get("clinical_implication", ""),
                                "impact": ann.get("impact") or ann.get("description", ""),
                                "annotation_level": ann.get("annotation_level", 4),
                                "evidence_level": ann.get("evidence_level", ""),
                                "source_adapters": ["pharmgkb"],
                                "confidence": _ADAPTER_WEIGHTS["pharmgkb"],
                                "is_research_only": ann.get("annotation_level", 4) in (3, 4),
                            })

                # Query by gene for each patient variant
                for pv in parsed_variants:
                    gene_ann = await self._query_adapter_safe(
                        "pharmgkb", self._pharmgkb, "fetch",
                        {"drug": query, "gene": pv["gene"], "limit": 20}
                    )
                    if gene_ann and isinstance(gene_ann, list):
                        for ann in gene_ann:
                            gene = (ann.get("gene") or ann.get("gene_symbol", "")).upper()
                            if gene == pv["gene"]:
                                all_annotations.append({
                                    "gene": gene,
                                    "variant": ann.get("variant") or ann.get("haplotype", pv["variant"]),
                                    "patient_variant": pv["raw"],
                                    "phenotype": ann.get("phenotype") or ann.get("clinical_implication", ""),
                                    "impact": ann.get("impact") or ann.get("description", ""),
                                    "annotation_level": ann.get("annotation_level", 4),
                                    "evidence_level": ann.get("evidence_level", ""),
                                    "source_adapters": ["pharmgkb"],
                                    "confidence": _ADAPTER_WEIGHTS["pharmgkb"],
                                    "is_research_only": ann.get("annotation_level", 4) in (3, 4),
                                    "patient_match": True,
                                })
            except Exception as exc:
                logger.warning("get_pharmacogenomic_guidance: PharmGKB query failed: %s", exc)

        # Query openFDA for pharmacogenomic warnings on label
        fda_pgx: list[dict[str, Any]] = []
        if self._openfda:
            try:
                fda_label = await self._query_adapter_safe(
                    "openfda", self._openfda, "get_label", query
                )
                if fda_label and isinstance(fda_label, dict):
                    warnings = fda_label.get("warnings", []) or []
                    for w in warnings:
                        w_str = str(w).lower()
                        for pv in parsed_variants:
                            if pv["gene"].lower() in w_str:
                                fda_pgx.append({
                                    "gene": pv["gene"],
                                    "patient_variant": pv["raw"],
                                    "warning_source": "FDA label",
                                    "warning_text": str(w)[:500],
                                    "source_adapters": ["openfda"],
                                    "confidence": _ADAPTER_WEIGHTS["openfda"],
                                    "is_research_only": False,
                                })
                                if "openfda" not in pgx_sources:
                                    pgx_sources.append("openfda")
            except Exception as exc:
                logger.warning("get_pharmacogenomic_guidance: openFDA label query failed: %s", exc)

        # Deduplicate annotations by gene
        all_annotations = _deduplicate_dicts(all_annotations, "gene")

        # Match patient variants to annotations
        matched: list[dict[str, Any]] = []
        unmatched: list[dict[str, Any]] = []

        for pv in parsed_variants:
            gene = pv["gene"]
            variant = pv["variant"]
            ann = next((a for a in all_annotations if a["gene"] == gene), None)
            if ann:
                match_entry = {
                    "gene": gene,
                    "patient_variant": variant,
                    "raw": pv["raw"],
                    **ann,
                    "patient_match": True,
                }
                matched.append(match_entry)
            else:
                unmatched.append({
                    "gene": gene,
                    "variant": variant,
                    "raw": pv["raw"],
                    "note": "No PharmGKB annotation found for this gene-drug pair",
                })

        # Add FDA warnings as supplemental
        matched.extend(fda_pgx)

        # Calculate confidence
        confidence_scores: list[float] = []
        if matched:
            for m in matched:
                src = m.get("source_adapters", ["pharmgkb"])
                confidence_scores.append(_avg_weight(src))
        if not confidence_scores:
            confidence_scores = [0.30]

        overall_confidence = round(sum(confidence_scores) / len(confidence_scores), 4)

        # Determine if all results are research-only
        all_research = all(m.get("is_research_only", False) for m in matched) if matched else True

        return {
            "medication": query,
            "patient_variants_queried": patient_variants,
            "patient_variants_parsed": parsed_variants,
            "annotations": all_annotations,
            "matched_guidance": matched,
            "unmatched_variants": unmatched,
            "match_count": len(matched),
            "confidence_overall": overall_confidence,
            "provenance": _build_provenance(
                sources=pgx_sources,
                query=f"{query} + variants={patient_variants}",
                confidence=overall_confidence,
                research=all_research,
                meta={
                    "genes_queried": list(gene_symbols),
                    "genes_matched": len(set(m["gene"] for m in matched)),
                    "genes_unmatched": len(unmatched),
                    "disclaimer": (
                        "Pharmacogenomic guidance should be validated by a certified "
                        "clinical pharmacogenomics laboratory. CPIC/DPWG guidelines "
                        "should be consulted before making prescribing decisions."
                    ),
                },
            ),
            "research_only": all_research,
        }

    # ── Health check ────────────────────────────────────────────────────────

    async def health_check(self) -> dict[str, Any]:
        """Check health of all underlying adapters."""
        statuses: dict[str, dict[str, Any]] = {}
        for name, adapter in self._all_adapters():
            if adapter is None:
                statuses[name] = {"status": "unconfigured", "available": False}
            else:
                try:
                    hc = await adapter.health_check()
                    statuses[name] = {"status": "ok", "available": True, "health": hc}
                except Exception as exc:
                    statuses[name] = {"status": "error", "available": False, "error": str(exc)}

        available_count = sum(1 for s in statuses.values() if s.get("available"))
        return {
            "bridge": _BRIDGE_NAME,
            "version": _BRIDGE_VERSION,
            "adapters_total": 15,
            "adapters_available": available_count,
            "adapter_statuses": statuses,
            "timestamp": _now_iso(),
        }

    def __repr__(self) -> str:
        available = sum(1 for _, a in self._all_adapters() if a is not None)
        return f"{_BRIDGE_NAME}(version={_BRIDGE_VERSION}, adapters_available={available}/15)"
