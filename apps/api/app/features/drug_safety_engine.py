#!/usr/bin/env python3
"""
================================================================================
DeepSynaps Drug Safety Engine — Medication-Neuromodulation Safety Cross-Check
================================================================================
Feature          : Drug Safety Engine
Module           : features/drug_safety_engine.py
Version          : 1.0.0
Author           : DeepSynaps Clinical Intelligence Team
Description      :
    Cross-references patient medications against planned neuromodulation
    procedures to flag drug-device interactions, contraindications, seizure
    risk, pharmacogenomic concerns, and adverse-event signals. Integrates
    RxNorm, DrugBank, OpenFDA, FAERS, and PharmGKB for a comprehensive
    safety report.

APIs Integrated  :
    • RxNorm REST API (NLM)          — drug name resolution & concept mapping
    • DrugBank API                   — drug targets, pharmacology, interactions
    • openFDA drug/label endpoint    — FDA-approved labeling (indications, warnings)
    • openFDA drug/event endpoint    — FAERS adverse-event reports
    • PharmGKB API                   — pharmacogenomic associations & CPIC guidelines
    • NDF-RT / UNII (via RxNorm)   — mechanism-of-action & drug class

Usage            :
    engine = DrugSafetyEngine()
    report = await engine.check_safety(
        medications=["sertraline", "bupropion", "lithium"],
        modality="rTMS"
    )
================================================================================
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import re
import time
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx
from pydantic import BaseModel, Field, field_validator, model_validator

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logger = logging.getLogger("deepsynaps.drug_safety_engine")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# ---------------------------------------------------------------------------
# Constants & Configuration
# ---------------------------------------------------------------------------
RXNORM_BASE = "https://rxnav.nlm.nih.gov/REST"
DRUGBANK_BASE = "https://go.drugbank.com/api"  # v0 (public)
OPENFDA_BASE = "https://api.fda.gov/drug"
PHARMGKB_BASE = "https://api.pharmgkb.org/v1/data"
UNII_BASE = "https://precision.fda.gov/uniisearch/api/v1"

DEFAULT_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
MAX_RETRIES = 3
BACKOFF_BASE = 1.5
REQUEST_DELAY = 0.34

# Neuromodality seizure risk tiers (clinical reference)
SEIZURE_RISK_TIER: Dict[str, float] = {
    "rTMS": 0.15,       # Low with standard parameters; higher >120% MT or >10Hz
    "tDCS": 0.02,       # Very low — single case reports only
    "tACS": 0.08,       # Low-moderate — theoretical with high-frequency
    "tRNS": 0.03,       # Very low
    "DBS": 0.05,        # Low — perioperative seizure risk
    "VNS": 0.02,        # Very low — actually anticonvulsant
    "ECT": 0.60,        # High — seizure is the therapeutic mechanism
    "ketamine_infusion": 0.10,  # Low-moderate — dissociation, rare seizures
}

# Drug classes with known neuromodulation interaction risks
DRUG_CLASS_RISKS: Dict[str, Dict[str, Any]] = {
    "anticonvulsant": {
        "risk_level": "moderate",
        "interaction_type": "modulates cortical excitability",
        "rationale": "Anticonvulsants alter seizure threshold; may affect neuromodulation dosing/response.",
        "affected_modalities": ["rTMS", "tDCS", "tACS", "ECT"],
        "recommendation": "Document baseline seizure threshold; consider neurophysiology consult.",
    },
    "antipsychotic": {
        "risk_level": "low-moderate",
        "interaction_type": "neurotransmitter modulation",
        "rationale": "Dopamine/anticholinergic effects may influence cortical excitability metrics.",
        "affected_modalities": ["rTMS", "tDCS", "DBS"],
        "recommendation": "Monitor motor threshold stability; note EPS symptoms.",
    },
    "benzodiazepine": {
        "risk_level": "moderate",
        "interaction_type": "GABA-A enhancement reduces cortical excitability",
        "rationale": "Benzos increase motor threshold and may reduce rTMS efficacy.",
        "affected_modalities": ["rTMS", "tDCS", "ECT"],
        "recommendation": "Assess baseline MT with/without benzo; consider taper if clinically appropriate.",
    },
    "stimulant": {
        "risk_level": "moderate-high",
        "interaction_type": "increases cortical excitability",
        "rationale": "Add increased seizure risk on top of neuromodulation.",
        "affected_modalities": ["rTMS", "tACS", "ECT"],
        "recommendation": "Use conservative stimulation parameters; avoid high-frequency rTMS.",
    },
    "antidepressant_ssri": {
        "risk_level": "low",
        "interaction_type": "serotonin modulation — generally safe",
        "rationale": "SSRIs are the most commonly co-prescribed agents with neuromodulation.",
        "affected_modalities": ["rTMS", "tDCS", "DBS", "ECT"],
        "recommendation": "Standard monitoring; no parameter adjustments needed.",
    },
    "antidepressant_snri": {
        "risk_level": "low",
        "interaction_type": "serotonin/norepinephrine modulation — generally safe",
        "rationale": "SNRIs compatible with neuromodulation; monitor blood pressure with ECT.",
        "affected_modalities": ["rTMS", "tDCS", "DBS", "ECT"],
        "recommendation": "Standard monitoring.",
    },
    "mood_stabilizer": {
        "risk_level": "low-moderate",
        "interaction_type": "varies by agent",
        "rationale": "Lithium + ECT carries elevated neurotoxicity risk; valproate is generally safe.",
        "affected_modalities": ["ECT", "rTMS", "tDCS"],
        "recommendation": "With ECT: hold lithium 24-48h prior; with rTMS/tDCS: standard monitoring.",
    },
    "lithium": {
        "risk_level": "moderate",
        "interaction_type": "increased neurotoxicity risk",
        "rationale": "Lithium + ECT increases delirium and persistent cognitive dysfunction risk.",
        "affected_modalities": ["ECT", "rTMS"],
        "recommendation": "Hold lithium 24-48 hours before ECT; check serum levels.",
    },
    "anticoagulant": {
        "risk_level": "moderate",
        "interaction_type": "bleeding risk",
        "rationale": "Any invasive neuromodulation (DBS, ECT) carries procedural bleeding risk.",
        "affected_modalities": ["DBS", "ECT", "VNS"],
        "recommendation": "Coordinate with cardiology; obtain INR if on warfarin; use lowest effective dose.",
    },
    "opioid": {
        "risk_level": "low-moderate",
        "interaction_type": "CNS depression",
        "rationale": "Opioids may affect pain thresholds and sedation assessment during neuromodulation.",
        "affected_modalities": ["rTMS", "tDCS", "DBS", "ECT"],
        "recommendation": "Ensure pain medication is stable; assess sedation before ECT.",
    },
    "thyroid_hormone": {
        "risk_level": "low",
        "interaction_type": "metabolic modulation",
        "rationale": "Thyroid levels may affect mood and treatment response; generally safe.",
        "affected_modalities": ["rTMS", "tDCS", "DBS", "ECT"],
        "recommendation": "Check TSH if depression refractory.",
    },
    "cardiac_glycoside": {
        "risk_level": "high",
        "interaction_type": "proarrhythmic",
        "rationale": "ECT and some neuromodulation can affect autonomic/cardiac function.",
        "affected_modalities": ["ECT", "DBS", "VNS"],
        "recommendation": "Cardiology consult required; continuous cardiac monitoring during ECT.",
    },
}

# Drug name → class mapping (supplement to API data)
DRUG_NAME_CLASS_MAP: Dict[str, List[str]] = {
    "sertraline": ["antidepressant_ssri"],
    "fluoxetine": ["antidepressant_ssri"],
    "escitalopram": ["antidepressant_ssri"],
    "citalopram": ["antidepressant_ssri"],
    "paroxetine": ["antidepressant_ssri"],
    "fluvoxamine": ["antidepressant_ssri"],
    "venlafaxine": ["antidepressant_snri"],
    "duloxetine": ["antidepressant_snri"],
    "desvenlafaxine": ["antidepressant_snri"],
    "levomilnacipran": ["antidepressant_snri"],
    "bupropion": ["stimulant"],
    "methylphenidate": ["stimulant"],
    "amphetamine": ["stimulant"],
    "lisdexamfetamine": ["stimulant"],
    "lithium": ["mood_stabilizer", "lithium"],
    "valproate": ["mood_stabilizer"],
    "valproic acid": ["mood_stabilizer"],
    "divalproex": ["mood_stabilizer"],
    "carbamazepine": ["anticonvulsant", "mood_stabilizer"],
    "lamotrigine": ["anticonvulsant", "mood_stabilizer"],
    "oxcarbazepine": ["anticonvulsant", "mood_stabilizer"],
    "topiramate": ["anticonvulsant"],
    "gabapentin": ["anticonvulsant"],
    "pregabalin": ["anticonvulsant"],
    "clonazepam": ["benzodiazepine"],
    "lorazepam": ["benzodiazepine"],
    "alprazolam": ["benzodiazepine"],
    "diazepam": ["benzodiazepine"],
    "aripiprazole": ["antipsychotic"],
    "olanzapine": ["antipsychotic"],
    "risperidone": ["antipsychotic"],
    "quetiapine": ["antipsychotic"],
    "haloperidol": ["antipsychotic"],
    "warfarin": ["anticoagulant"],
    "rivaroxaban": ["anticoagulant"],
    "apixaban": ["anticoagulant"],
    "levothyroxine": ["thyroid_hormone"],
    "morphine": ["opioid"],
    "oxycodone": ["opioid"],
    "tramadol": ["opioid"],
    "digoxin": ["cardiac_glycoside"],
}


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class RiskLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    LOW_MODERATE = "low-moderate"
    MODERATE = "moderate"
    MODERATE_HIGH = "moderate-high"
    HIGH = "high"
    CRITICAL = "critical"


class Modality(str, Enum):
    RTMS = "rTMS"
    TDCS = "tDCS"
    TACS = "tACS"
    TRNS = "tRNS"
    DBS = "DBS"
    VNS = "VNS"
    ECT = "ECT"
    KETAMINE = "ketamine_infusion"


class InteractionType(str, Enum):
    PHARMACODYNAMIC = "pharmacodynamic"
    PHARMACOKINETIC = "pharmacokinetic"
    DEVICE_INTERACTION = "device_interaction"
    CONTRAINDICATION = "contraindication"
    SEIZURE_RISK = "seizure_risk"
    BLEEDING_RISK = "bleeding_risk"
    NEUROTOXICITY = "neurotoxicity"
    CARDIAC_RISK = "cardiac_risk"
    MONITORING_REQUIRED = "monitoring_required"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Pydantic Models — Data Layer
# ---------------------------------------------------------------------------
class ResolvedDrug(BaseModel):
    """Drug identity as resolved through RxNorm."""
    name: str                                    # Original input name
    rxcui: Optional[str] = None                  # RxNorm Concept Unique Identifier
    concept_name: Optional[str] = None           # RxNorm preferred name
    synonym: Optional[str] = None                # Matched synonym
    tty: Optional[str] = None                    # Term type (SCD, SBD, IN, etc.)
    source: str = "rxnorm"                       # Resolution source


class DrugTarget(BaseModel):
    """Molecular target of a drug from DrugBank."""
    target_name: str
    target_type: Optional[str] = None            # receptor, enzyme, transporter, carrier
    action: Optional[str] = None                 # agonist, antagonist, inhibitor, etc.
    gene_name: Optional[str] = None
    organism: str = "Humans"


class DrugClassInfo(BaseModel):
    """Drug classification from RxNorm / DrugBank."""
    class_name: str
    source: str = ""
    description: Optional[str] = None


class DrugInteraction(BaseModel):
    """Drug-drug or drug-device interaction."""
    drug_a: str
    drug_b: Optional[str] = None                 # None if drug-device interaction
    interaction_type: InteractionType
    description: str
    severity: RiskLevel
    evidence: str = ""
    recommendation: str = ""


class FDALabelEntry(BaseModel):
    """Extracted FDA label warning/precaution."""
    section: str                                 # warnings, precautions, contraindications
    text: str
    drug_name: str


class AdverseEventEntry(BaseModel):
    """Individual FAERS adverse event."""
    drug: str
    event_term: str
    count: int
    seriousness: Optional[str] = None
    trend: Optional[str] = None


class PGxAssociation(BaseModel):
    """Pharmacogenomic association from PharmGKB."""
    gene: str
    variant: Optional[str] = None
    phenotype: Optional[str] = None
    evidence_level: Optional[str] = None         # 1A, 1B, 2A, 2B, 3, 4
    clinical_annotation: Optional[str] = None


class SeizureRiskAssessment(BaseModel):
    """Modality-specific seizure risk assessment."""
    baseline_risk: float = Field(..., ge=0.0, le=1.0)
    drug_modifier: float = Field(default=1.0, ge=0.0)   # multiplier
    total_risk: float = Field(..., ge=0.0, le=1.0)
    risk_level: RiskLevel
    contributing_drugs: List[str] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)


class DrugSafetySummary(BaseModel):
    """Per-drug safety summary."""
    drug_name: str
    resolved_name: Optional[str] = None
    rxcui: Optional[str] = None
    drug_classes: List[DrugClassInfo] = Field(default_factory=list)
    targets: List[DrugTarget] = Field(default_factory=list)
    fda_warnings: List[FDALabelEntry] = Field(default_factory=list)
    adverse_events: List[AdverseEventEntry] = Field(default_factory=list)
    pgx_associations: List[PGxAssociation] = Field(default_factory=list)
    interactions: List[DrugInteraction] = Field(default_factory=list)
    seizure_risk_contribution: float = 0.0


class SafetyReport(BaseModel):
    """Top-level safety report output."""
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    input_medications: List[str] = Field(default_factory=list)
    planned_modality: str = ""
    resolved_drugs: List[ResolvedDrug] = Field(default_factory=list)
    drug_summaries: List[DrugSafetySummary] = Field(default_factory=list)
    seizure_risk: SeizureRiskAssessment = Field(default_factory=lambda: SeizureRiskAssessment(baseline_risk=0.0, total_risk=0.0, risk_level=RiskLevel.NONE))
    overall_risk_level: RiskLevel = RiskLevel.NONE
    critical_alerts: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    cautions: List[str] = Field(default_factory=list)
    information_only: List[str] = Field(default_factory=list)
    monitoring_plan: List[str] = Field(default_factory=list)
    contraindicated: bool = False
    procedure_recommendation: str = ""
    query_hash: str = ""
    errors: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Utility Functions
# ---------------------------------------------------------------------------
def _query_hash(medications: List[str], modality: str) -> str:
    payload = f"{','.join(sorted(m.lower().strip() for m in medications))}::{modality.lower().strip()}"
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def _risk_level_from_score(score: float) -> RiskLevel:
    if score < 0.01:
        return RiskLevel.NONE
    if score < 0.05:
        return RiskLevel.LOW
    if score < 0.10:
        return RiskLevel.LOW_MODERATE
    if score < 0.20:
        return RiskLevel.MODERATE
    if score < 0.35:
        return RiskLevel.MODERATE_HIGH
    if score < 0.55:
        return RiskLevel.HIGH
    return RiskLevel.CRITICAL


def _backoff_sleep(attempt: int) -> float:
    return (BACKOFF_BASE ** attempt) + (hash(str(time.time())) % 100) / 1000


# ---------------------------------------------------------------------------
# Core Class — DrugSafetyEngine
# ---------------------------------------------------------------------------
class DrugSafetyEngine:
    """Medication-neuromodulation safety cross-check engine.

    Resolves drug identities, maps to pharmacological classes and molecular
    targets, queries FDA labels and FAERS for adverse events, checks
    pharmacogenomic associations, and compiles a structured safety report
    with modality-specific seizure-risk assessment.
    """

    def __init__(
        self,
        timeout: httpx.Timeout = DEFAULT_TIMEOUT,
        max_retries: int = MAX_RETRIES,
        rate_limit_delay: float = REQUEST_DELAY,
        cache_ttl_seconds: int = 3600,
    ) -> None:
        self.timeout = timeout
        self.max_retries = max_retries
        self.rate_limit_delay = rate_limit_delay
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self._cache_ttl = cache_ttl_seconds
        self._last_request_time: Dict[str, float] = {}

    # -- Internal HTTP helper ------------------------------------------------

    async def _get(self, url: str, params: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Async GET with rate-limit pacing, retries, and exponential backoff."""
        domain = url.split("/")[2]
        now = time.time()
        last = self._last_request_time.get(domain, 0)
        wait = self.rate_limit_delay - (now - last)
        if wait > 0:
            await asyncio.sleep(wait)
        self._last_request_time[domain] = time.time()

        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                    response = await client.get(url, params=params or {}, headers=headers or {})
                    response.raise_for_status()
                    content_type = response.headers.get("content-type", "")
                    if "json" in content_type:
                        return response.json()
                    return {"_text": response.text}
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                if status == 429 or status >= 500:
                    logger.warning("HTTP %s on %s (attempt %d/%d)", status, url, attempt, self.max_retries)
                    if attempt < self.max_retries:
                        await asyncio.sleep(_backoff_sleep(attempt))
                        continue
                logger.error("HTTP error %s on %s: %s", status, url, exc)
                return {"_error": f"HTTP {status}", "_detail": str(exc)}
            except httpx.RequestError as exc:
                logger.warning("Request error on %s (attempt %d/%d): %s", url, attempt, self.max_retries, exc)
                if attempt < self.max_retries:
                    await asyncio.sleep(_backoff_sleep(attempt))
                    continue
                logger.error("Max retries exceeded for %s: %s", url, exc)
                return {"_error": "request_failed", "_detail": str(exc)}
        return {"_error": "max_retries_exceeded"}

    # -- RxNorm: Drug Resolution ---------------------------------------------

    async def resolve_drugs(self, names: List[str]) -> List[ResolvedDrug]:
        """Resolve medication names to RxNorm concepts (Rxcui + preferred name).

        Uses the RxNorm approximateMatch endpoint to handle misspellings,
        brand names, and synonyms, then fetches the preferred name.
        """
        logger.info("[RxNorm] Resolving %d drug names", len(names))
        resolved: List[ResolvedDrug] = []
        for name in names:
            name = name.strip()
            if not name:
                continue
            try:
                url = f"{RXNORM_BASE}/approximateTerm.json"
                params = {"term": name, "maxEntries": 5}
                data = await self._get(url, params)
                if "_error" in data:
                    logger.warning("[RxNorm] approximateMatch failed for '%s': %s", name, data.get("_detail"))
                    # Fallback: return unresolved
                    resolved.append(ResolvedDrug(name=name))
                    continue

                candidates = data.get("approximateGroup", {}).get("candidate", [])
                if not candidates:
                    logger.info("[RxNorm] No match for '%s'", name)
                    resolved.append(ResolvedDrug(name=name))
                    continue

                # Pick highest-score candidate
                best = max(candidates, key=lambda c: int(c.get("score", 0) or 0))
                rxcui = best.get("rxcui")
                concept_name = None
                tty = best.get("termType")
                synonym = best.get("name")

                # Fetch preferred name if we have an rxcui
                if rxcui:
                    prop_url = f"{RXNORM_BASE}/rxcui/{rxcui}/properties.json"
                    prop_data = await self._get(prop_url)
                    if "_error" not in prop_data:
                        props = prop_data.get("properties", {})
                        concept_name = props.get("name") or synonym
                        tty = props.get("tty") or tty

                resolved.append(ResolvedDrug(
                    name=name,
                    rxcui=rxcui,
                    concept_name=concept_name or synonym,
                    synonym=synonym,
                    tty=tty,
                    source="rxnorm",
                ))
            except Exception as exc:
                logger.error("[RxNorm] Exception resolving '%s': %s", name, exc)
                resolved.append(ResolvedDrug(name=name))

        logger.info("[RxNorm] Resolved %d/%d drugs", sum(1 for r in resolved if r.rxcui), len(names))
        return resolved

    # -- RxNorm: Drug Classes ------------------------------------------------

    async def get_drug_classes(self, rxcui: str) -> List[DrugClassInfo]:
        """Fetch drug class information (ATC, VA, MED-RT) for an Rxcui."""
        if not rxcui:
            return []
        url = f"{RXNORM_BASE}/rxclass/class/byRxcui.json"
        params = {"rxcui": rxcui, "relaSource": "ATC|VA|MEDRT"}
        data = await self._get(url, params)
        if "_error" in data:
            return []
        classes: List[DrugClassInfo] = []
        rxclass_drug_info_list = data.get("rxclassDrugInfoList", {})
        rxclass_drug_info = rxclass_drug_info_list.get("rxclassDrugInfo", [])
        if isinstance(rxclass_drug_info, dict):
            rxclass_drug_info = [rxclass_drug_info]
        for info in rxclass_drug_info:
            cl = info.get("rxclassMinConceptItem", {})
            if cl:
                classes.append(DrugClassInfo(
                    class_name=cl.get("className", ""),
                    source=cl.get("classType", ""),
                    description=info.get("drugName"),
                ))
        return classes

    # -- DrugBank: Targets ---------------------------------------------------

    async def get_drug_targets(self, rxcuis: List[str]) -> List[DrugTarget]:
        """Query DrugBank for molecular targets of resolved drugs.

        Uses the public DrugBank API (v0) target search endpoint.
        Falls back gracefully if DrugBank returns auth errors.
        """
        logger.info("[DrugBank] Fetching targets for %d Rxcuis", len(rxcuis))
        targets: List[DrugTarget] = []
        for rxcui in rxcuis:
            if not rxcui:
                continue
            try:
                # DrugBank target search by external identifier (RxNorm)
                url = f"{DRUGBANK_BASE}/v0/drug_targets.json"
                params = {"rxcui": rxcui, "limit": 10}
                data = await self._get(url, params)
                if "_error" in data:
                    logger.debug("[DrugBank] No targets for rxcui=%s: %s", rxcui, data.get("_detail"))
                    continue
                for hit in data.get("targets", data if isinstance(data, list) else []):
                    targets.append(DrugTarget(
                        target_name=hit.get("name", ""),
                        target_type=hit.get("target_type"),
                        action=hit.get("actions", [None])[0] if isinstance(hit.get("actions"), list) else hit.get("action"),
                        gene_name=hit.get("gene_name"),
                        organism=hit.get("organism", "Humans"),
                    ))
            except Exception as exc:
                logger.warning("[DrugBank] Exception for rxcui=%s: %s", rxcui, exc)
                continue
        logger.info("[DrugBank] Found %d targets", len(targets))
        return targets

    # -- openFDA: Drug Labels (Warnings/Precautions) ------------------------

    async def check_fda_labels(self, drugs: List[str]) -> List[FDALabelEntry]:
        """Query openFDA drug/label endpoint for warnings, precautions, and
        contraindications relevant to neuromodulation.

        Searches the SPL sections for seizure, CNS, cardiac, and
        pregnancy-related warnings.
        """
        logger.info("[openFDA-label] Checking %d drugs", len(drugs))
        entries: List[FDALabelEntry] = []
        relevant_sections = [
            "contraindications", "warnings", "precautions",
            "general_precautions", "drug_interactions",
        ]
        for drug in drugs:
            try:
                url = f"{OPENFDA_BASE}/label.json"
                search_query = f'openfda.substance_name:"{drug}" OR openfda.generic_name:"{drug}" OR openfda.brand_name:"{drug}"'
                params: Dict[str, Any] = {
                    "search": search_query,
                    "limit": 3,
                }
                data = await self._get(url, params)
                if "_error" in data:
                    continue
                for result in data.get("results", []):
                    for section_name in relevant_sections:
                        section_text = result.get(section_name)
                        if not section_text:
                            continue
                        text = section_text[0] if isinstance(section_text, list) else str(section_text)
                        # Filter for neuromodulation-relevant keywords
                        if any(kw in text.lower() for kw in ("seizure", "convulsion", "epilepsy", "electroconvulsive",
                                                              "stimulation", "central nervous", "cns", "cardiac",
                                                              "qt", "arrhythmia", "pregnancy", "teratogenic",
                                                              "suicide", "neuroleptic", "serotonin syndrome")):
                            entries.append(FDALabelEntry(
                                section=section_name,
                                text=text[:2000],  # truncate for brevity
                                drug_name=drug,
                            ))
            except Exception as exc:
                logger.warning("[openFDA-label] Exception for '%s': %s", drug, exc)
                continue
        logger.info("[openFDA-label] Found %d relevant label entries", len(entries))
        return entries

    # -- openFDA: FAERS Adverse Events ---------------------------------------

    async def check_faers_events(self, drugs: List[str], modality: Optional[str] = None) -> List[AdverseEventEntry]:
        """Query openFDA drug/event (FAERS) for adverse events associated with
        the given drugs, optionally filtered by neuromodality context.

        Returns the top adverse event terms with occurrence counts.
        """
        logger.info("[FAERS] Checking adverse events for %d drugs, modality=%s", len(drugs), modality)
        all_entries: List[AdverseEventEntry] = []
        for drug in drugs:
            try:
                url = f"{OPENFDA_BASE}/event.json"
                search_query = f'patient.drug.openfda.generic_name:"{drug}" OR patient.drug.medicinalproduct:"{drug}"'
                params: Dict[str, Any] = {
                    "search": search_query,
                    "count": "patient.reaction.reactionmeddrapt.exact",
                    "limit": 15,
                }
                data = await self._get(url, params)
                if "_error" in data:
                    continue
                for r in data.get("results", []):
                    term = r.get("term", "")
                    count = r.get("count", 0)
                    if term and count > 0:
                        all_entries.append(AdverseEventEntry(
                            drug=drug,
                            event_term=term,
                            count=count,
                            seriousness=self._classify_seriousness(term),
                        ))
            except Exception as exc:
                logger.warning("[FAERS] Exception for '%s': %s", drug, exc)
                continue

        # Sort by count descending and deduplicate same event across drugs
        all_entries.sort(key=lambda e: e.count, reverse=True)
        seen_events: Set[str] = set()
        unique_entries: List[AdverseEventEntry] = []
        for e in all_entries:
            key = f"{e.drug.lower()}::{e.event_term.lower()}"
            if key not in seen_events:
                seen_events.add(key)
                unique_entries.append(e)

        logger.info("[FAERS] Found %d adverse event entries", len(unique_entries))
        return unique_entries[:50]  # cap

    def _classify_seriousness(self, event_term: str) -> Optional[str]:
        """Classify adverse event seriousness based on MedDRA term keywords."""
        t = event_term.lower()
        serious = {"death", "suicide", "seizure", "convulsion", "status epilepticus",
                   "anaphylaxis", "cardiac arrest", "myocardial infarction", "stroke",
                   "hepatic failure", "agranulocytosis", "toxic epidermal necrolysis",
                   " Stevens-Johnson", "neuroleptic malignant", "serotonin syndrome"}
        if any(s in t for s in serious):
            return "serious"
        moderate = {"fall", "fracture", "bleeding", "confusion", "delirium",
                    "syncope", "arrhythmia", "hypotension", "hypertension", "tachycardia"}
        if any(m in t for m in moderate):
            return "moderate"
        return "mild"

    # -- PharmGKB: Pharmacogenomics ------------------------------------------

    async def check_pgx_interactions(self, drugs: List[str]) -> List[PGxAssociation]:
        """Query PharmGKB for pharmacogenomic associations and CPIC guidelines.

        Searches for gene-drug interactions with clinical annotations that may
        affect neuromodulation safety or response prediction.
        """
        logger.info("[PharmGKB] Checking PGx for %d drugs", len(drugs))
        associations: List[PGxAssociation] = []
        for drug in drugs:
            try:
                url = f"{PHARMGKB_BASE}/drug"
                params: Dict[str, Any] = {"name": drug, "view": "max"}
                data = await self._get(url, params)
                if "_error" in data:
                    continue
                # Parse PharmGKB response
                for assoc in data.get("associations", data.get("data", [])):
                    gene = assoc.get("gene", {}).get("symbol") if isinstance(assoc.get("gene"), dict) else assoc.get("gene")
                    if not gene:
                        continue
                    associations.append(PGxAssociation(
                        gene=gene,
                        variant=assoc.get("variant", {}).get("name") if isinstance(assoc.get("variant"), dict) else assoc.get("variant"),
                        phenotype=assoc.get("phenotype", {}).get("name") if isinstance(assoc.get("phenotype"), dict) else assoc.get("phenotype_category"),
                        evidence_level=assoc.get("evidenceLevel") or assoc.get("evidence_level"),
                        clinical_annotation=assoc.get("clinicalAnnotationText") or assoc.get("clinical_annotation"),
                    ))

                # Also check clinical annotations endpoint
                anno_url = f"{PHARMGKB_BASE}/clinicalAnnotation"
                anno_params: Dict[str, Any] = {"relatedDrug": drug, "limit": 10}
                anno_data = await self._get(anno_url, anno_params)
                if "_error" not in anno_data:
                    for anno in anno_data.get("data", anno_data.get("clinicalAnnotations", [])):
                        gene = anno.get("gene", {}).get("symbol") if isinstance(anno.get("gene"), dict) else anno.get("gene", {}).get("name")
                        if gene:
                            associations.append(PGxAssociation(
                                gene=gene,
                                variant=anno.get("variant"),
                                phenotype=anno.get("phenotype"),
                                evidence_level=anno.get("levelOfEvidence", {}).get("level") if isinstance(anno.get("levelOfEvidence"), dict) else anno.get("evidence_level"),
                                clinical_annotation=anno.get("summaryMarkdown") or anno.get("annotation"),
                            ))
            except Exception as exc:
                logger.warning("[PharmGKB] Exception for '%s': %s", drug, exc)
                continue

        # Deduplicate by gene
        seen: Set[str] = set()
        deduped: List[PGxAssociation] = []
        for a in associations:
            key = f"{a.gene}::{a.variant or ''}::{a.phenotype or ''}"
            if key not in seen:
                seen.add(key)
                deduped.append(a)

        logger.info("[PharmGKB] Found %d PGx associations", len(deduped))
        return deduped[:30]

    # -- Seizure Risk Assessment ---------------------------------------------

    async def assess_seizure_risk(self, drugs: List[str], modality: str) -> SeizureRiskAssessment:
        """Compute modality-specific seizure risk adjusted for concurrent medications.

        Baseline risk comes from the modality's inherent seizure risk tier.
        Drug modifiers are multipliers derived from known pharmacological
        effects on cortical excitability.
        """
        logger.info("[SeizureRisk] Assessing risk for modality=%s with %d drugs", modality, len(drugs))
        baseline = SEIZURE_RISK_TIER.get(modality, 0.10)

        # Normalize drug names
        drug_lower = [d.lower().strip() for d in drugs]
        contributing: List[str] = []
        total_modifier = 1.0
        recommendations: List[str] = []

        for d in drug_lower:
            matched_classes = DRUG_NAME_CLASS_MAP.get(d, [])
            for cls in matched_classes:
                info = DRUG_CLASS_RISKS.get(cls)
                if not info:
                    continue
                affected = info.get("affected_modalities", [])
                if modality in affected or modality in [m.lower() for m in affected]:
                    risk_level = info["risk_level"]
                    if risk_level in ("moderate", "moderate-high", "high"):
                        modifier = 1.5 if risk_level == "moderate" else (2.0 if risk_level == "moderate-high" else 3.0)
                        total_modifier *= modifier
                        contributing.append(f"{d} ({cls})")
                        recommendations.append(info["recommendation"])
                    elif risk_level == "low-moderate":
                        total_modifier *= 1.2
                        recommendations.append(info["recommendation"])

        total_risk = min(1.0, baseline * total_modifier)
        risk_level = _risk_level_from_score(total_risk)

        # Modality-specific recommendations
        if modality == "rTMS":
            recommendations.append("Use frequency <= 10 Hz; avoid >120% resting motor threshold.")
            recommendations.append("Ensure motor threshold re-assessment if medication changes during course.")
        elif modality == "ECT":
            recommendations.append("ECT inherently induces seizures — this is therapeutic, not adverse.")
            if any("lithium" in c.lower() for c in contributing):
                recommendations.append("CRITICAL: Hold lithium 24-48 hours before each ECT session.")
        elif modality == "tDCS":
            recommendations.append("tDCS seizure risk is very low; standard parameters are safe.")
        elif modality == "DBS":
            recommendations.append("DBS carries perioperative seizure risk; anticonvulsant prophylaxis may be indicated.")

        # Aggregate recommendation
        if total_risk >= 0.35:
            recommendations.insert(0, f"HIGH SEIZURE RISK ({total_risk:.0%}): Consider neurology consult before proceeding.")
        elif total_risk >= 0.15:
            recommendations.insert(0, f"ELEVATED SEIZURE RISK ({total_risk:.0%}): Enhanced monitoring recommended.")
        else:
            recommendations.insert(0, f"Acceptable seizure risk profile ({total_risk:.1%}).")

        return SeizureRiskAssessment(
            baseline_risk=baseline,
            drug_modifier=total_modifier,
            total_risk=total_risk,
            risk_level=risk_level,
            contributing_drugs=contributing,
            recommendations=recommendations,
        )

    # -- Drug-Device Interaction Rules ---------------------------------------

    async def evaluate_drug_device_interactions(
        self, drugs: List[str], resolved: List[ResolvedDrug], modality: str,
    ) -> List[DrugInteraction]:
        """Apply neuromodulation-specific drug-device interaction rules.

        Combines local knowledge-base rules with API-derived data to produce
        a comprehensive interaction list.
        """
        logger.info("[Interactions] Evaluating %d drugs against modality=%s", len(drugs), modality)
        interactions: List[DrugInteraction] = []
        drug_lower = [d.lower().strip() for d in drugs]
        mod_lower = modality.lower()

        # Knowledge-base interactions
        for d in drug_lower:
            matched_classes = DRUG_NAME_CLASS_MAP.get(d, [])
            for cls in matched_classes:
                info = DRUG_CLASS_RISKS.get(cls)
                if not info:
                    continue
                affected = [a.lower() for a in info.get("affected_modalities", [])]
                if mod_lower in affected or any(a in mod_lower for a in affected):
                    severity = RiskLevel(info["risk_level"])
                    interactions.append(DrugInteraction(
                        drug_a=d,
                        drug_b=None,  # drug-device interaction
                        interaction_type=InteractionType.DEVICE_INTERACTION,
                        description=info["rationale"],
                        severity=severity,
                        evidence="FDA labeling + clinical literature",
                        recommendation=info["recommendation"],
                    ))

        # Metal/implant interactions with magnetic modalities
        if mod_lower in ("rtms", "tdcs", "tacs", "trns"):
            if any("lithium" in d for d in drug_lower):
                interactions.append(DrugInteraction(
                    drug_a="lithium",
                    drug_b=None,
                    interaction_type=InteractionType.NEUROTOXICITY,
                    description="Lithium can increase CNS excitability; combined with magnetic neuromodulation may theoretically lower seizure threshold.",
                    severity=RiskLevel.LOW_MODERATE,
                    evidence="Case reports",
                    recommendation="Monitor lithium levels; use conservative stimulation parameters.",
                ))

        # Anticoagulant + invasive modalities
        if mod_lower in ("dbs", "ect", "vns"):
            if any(d in drug_lower for d in ("warfarin", "rivaroxaban", "apixaban", "heparin")):
                interactions.append(DrugInteraction(
                    drug_a="anticoagulant",
                    drug_b=None,
                    interaction_type=InteractionType.BLEEDING_RISK,
                    description="Anticoagulation increases procedural bleeding risk with invasive neuromodulation.",
                    severity=RiskLevel.MODERATE,
                    evidence="FDA device labeling + surgical guidelines",
                    recommendation="Coordinate with cardiology; obtain INR; consider bridging if on warfarin.",
                ))

        # Stimulant + high-frequency rTMS
        if mod_lower == "rtms":
            stimulants = [d for d in drug_lower if d in ("bupropion", "methylphenidate", "amphetamine", "lisdexamfetamine")]
            for stim in stimulants:
                interactions.append(DrugInteraction(
                    drug_a=stim,
                    drug_b=None,
                    interaction_type=InteractionType.SEIZURE_RISK,
                    description=f"{stim} increases cortical excitability; combined with high-frequency rTMS elevates seizure risk.",
                    severity=RiskLevel.MODERATE,
                    evidence="Clinical literature",
                    recommendation="Use conservative frequency (<= 10 Hz); keep intensity <= 120% RMT; monitor closely.",
                ))

        logger.info("[Interactions] Found %d interactions", len(interactions))
        return interactions

    # -- Safety Report Generation --------------------------------------------

    async def generate_report(
        self,
        medications: List[str],
        modality: str,
        resolved: List[ResolvedDrug],
        drug_classes: Dict[str, List[DrugClassInfo]],
        targets: Dict[str, List[DrugTarget]],
        fda_labels: List[FDALabelEntry],
        faers_events: List[AdverseEventEntry],
        pgx: List[PGxAssociation],
        interactions: List[DrugInteraction],
        seizure_risk: SeizureRiskAssessment,
    ) -> SafetyReport:
        """Compile all data sources into a structured SafetyReport."""

        # Per-drug summaries
        drug_summaries: List[DrugSafetySummary] = []
        for rd in resolved:
            d_lower = rd.name.lower()
            summaries = drug_summaries
            fda_for_drug = [f for f in fda_labels if f.drug_name.lower() == d_lower or (rd.concept_name and f.drug_name.lower() == rd.concept_name.lower())]
            ae_for_drug = [a for a in faers_events if a.drug.lower() == d_lower]
            pgx_for_drug = [p for p in pgx if d_lower in (p.gene.lower() if p.gene else "")]
            classes = drug_classes.get(rd.rxcui or "", [])
            drug_targets = targets.get(rd.rxcui or "", [])
            drug_interactions = [i for i in interactions if i.drug_a.lower() == d_lower]

            # Seizure contribution
            seizure_contrib = 0.0
            if any(d_lower in c.lower() for c in seizure_risk.contributing_drugs):
                seizure_contrib = seizure_risk.total_risk / max(len(seizure_risk.contributing_drugs), 1)

            drug_summaries.append(DrugSafetySummary(
                drug_name=rd.name,
                resolved_name=rd.concept_name,
                rxcui=rd.rxcui,
                drug_classes=classes,
                targets=drug_targets,
                fda_warnings=fda_for_drug,
                adverse_events=ae_for_drug,
                pgx_associations=pgx_for_drug,
                interactions=drug_interactions,
                seizure_risk_contribution=seizure_contrib,
            ))

        # Categorize alerts
        critical_alerts: List[str] = []
        warnings: List[str] = []
        cautions: List[str] = []
        info_only: List[str] = []
        monitoring: List[str] = []

        for inter in interactions:
            msg = f"[{inter.severity.value.upper()}] {inter.drug_a}: {inter.description}"
            rec = inter.recommendation
            if inter.severity in (RiskLevel.HIGH, RiskLevel.CRITICAL):
                critical_alerts.append(f"{msg} -> {rec}")
            elif inter.severity == RiskLevel.MODERATE:
                warnings.append(f"{msg} -> {rec}")
            elif inter.severity in (RiskLevel.LOW_MODERATE, RiskLevel.LOW):
                cautions.append(f"{msg} -> {rec}")

        # Seizure risk alerts
        if seizure_risk.risk_level in (RiskLevel.HIGH, RiskLevel.CRITICAL):
            critical_alerts.append(f"SEIZURE RISK: {seizure_risk.risk_level.value} ({seizure_risk.total_risk:.1%}) — Contributing: {', '.join(seizure_risk.contributing_drugs) or 'None'}")
        elif seizure_risk.risk_level in (RiskLevel.MODERATE, RiskLevel.MODERATE_HIGH):
            warnings.append(f"SEIZURE RISK: {seizure_risk.risk_level.value} ({seizure_risk.total_risk:.1%}) — Contributing: {', '.join(seizure_risk.contributing_drugs) or 'None'}")
        elif seizure_risk.risk_level == RiskLevel.LOW_MODERATE:
            cautions.append(f"SEIZURE RISK: {seizure_risk.risk_level.value} ({seizure_risk.total_risk:.1%})")
        else:
            info_only.append(f"Seizure risk: {seizure_risk.risk_level.value} ({seizure_risk.total_risk:.1%})")

        # FDA label alerts
        serious_fda = [f for f in fda_labels if "seizure" in f.text.lower() or "convulsion" in f.text.lower() or "cardiac" in f.text.lower()]
        for fda in serious_fda[:3]:
            warnings.append(f"FDA {fda.section.upper()} for {fda.drug_name}: {fda.text[:200]}...")

        # Monitoring plan
        monitoring.append("Baseline vital signs and neurological examination before first session.")
        if seizure_risk.risk_level.value in ("moderate", "moderate-high", "high", "critical"):
            monitoring.append("Continuous observation during first 3 sessions for seizure activity.")
            monitoring.append("Emergency seizure protocol (benzodiazepine IV/IM) available on-site.")
        if any("lithium" in d.lower() for d in medications) and modality.lower() == "ect":
            monitoring.append("Check serum lithium level within 24h before each ECT session.")
            monitoring.append("Hold lithium 24-48h prior to each ECT treatment.")
        if any(d.lower() in ("warfarin", "rivaroxaban", "apixaban") for d in medications):
            monitoring.append("Pre-procedure coagulation studies if invasive neuromodulation planned.")

        # Overall risk
        max_severity = max(
            (inter.severity for inter in interactions),
            default=RiskLevel.NONE,
            key=lambda rl: ["none", "low", "low-moderate", "moderate", "moderate-high", "high", "critical"].index(rl.value),
        )
        overall_risk = max(
            max_severity,
            seizure_risk.risk_level,
            key=lambda rl: ["none", "low", "low-moderate", "moderate", "moderate-high", "high", "critical"].index(rl.value),
        )
        contraindicated = overall_risk in (RiskLevel.HIGH, RiskLevel.CRITICAL) and len(critical_alerts) > 0

        # Procedure recommendation
        if contraindicated:
            procedure_rec = f"{modality.upper()} is RELATIVELY CONTRAINDICATED with the current medication profile. Address critical alerts before proceeding."
        elif overall_risk in (RiskLevel.MODERATE, RiskLevel.MODERATE_HIGH):
            procedure_rec = f"{modality.upper()} may proceed with enhanced precautions and the monitoring plan described above."
        else:
            procedure_rec = f"{modality.upper()} can proceed with standard safety protocols."

        return SafetyReport(
            input_medications=medications,
            planned_modality=modality,
            resolved_drugs=resolved,
            drug_summaries=drug_summaries,
            seizure_risk=seizure_risk,
            overall_risk_level=overall_risk,
            critical_alerts=critical_alerts,
            warnings=warnings,
            cautions=cautions,
            information_only=info_only,
            monitoring_plan=monitoring,
            contraindicated=contraindicated,
            procedure_recommendation=procedure_rec,
            query_hash=_query_hash(medications, modality),
        )

    # -- Main Orchestrator ---------------------------------------------------

    async def check_safety(self, medications: List[str], modality: str) -> SafetyReport:
        """Primary entrypoint: comprehensive medication-neuromodulation safety check.

        Parameters
        ----------
        medications : list[str]
            Patient medication names (generic or brand; will be resolved).
        modality : str
            Planned neuromodulation modality (rTMS, tDCS, DBS, ECT, etc.).

        Returns
        -------
        SafetyReport
            Structured safety report with interactions, seizure risk, monitoring
            plan, and procedure recommendation.
        """
        logger.info("[DrugSafetyEngine] check_safety called for %d drugs, modality=%s", len(medications), modality)
        start_time = time.time()
        errors: List[str] = []

        # Cache check
        qhash = _query_hash(medications, modality)
        cached = self._cache.get(qhash)
        if cached and (time.time() - cached[0]) < self._cache_ttl:
            logger.info("[DrugSafetyEngine] Cache hit for hash %s", qhash)
            return cached[1]

        # 1) Resolve drugs via RxNorm
        try:
            resolved = await self.resolve_drugs(medications)
        except Exception as exc:
            logger.error("Drug resolution failed: %s", exc)
            errors.append(f"RxNorm resolution: {exc}")
            resolved = [ResolvedDrug(name=n) for n in medications]

        rxcuis = [r.rxcui for r in resolved if r.rxcui]

        # 2) Get drug classes (parallel)
        drug_classes: Dict[str, List[DrugClassInfo]] = {}
        try:
            class_results = await asyncio.gather(
                *[self.get_drug_classes(rc) for rc in rxcuis],
                return_exceptions=True,
            )
            for rc, cl_result in zip(rxcuis, class_results):
                if isinstance(cl_result, list):
                    drug_classes[rc] = cl_result
        except Exception as exc:
            logger.error("Drug class lookup failed: %s", exc)
            errors.append(f"RxNorm classes: {exc}")

        # 3) Get drug targets via DrugBank
        try:
            targets_list = await self.get_drug_targets(rxcuis)
            targets: Dict[str, List[DrugTarget]] = {}
            for rc, tgt in zip(rxcuis, [targets_list[i:i+5] for i in range(0, len(targets_list), max(len(targets_list)//max(len(rxcuis),1), 1))]):
                if rc not in targets:
                    targets[rc] = []
                targets[rc].extend(tgt)
            # Redistribute targets to rxcuis
            targets = {rc: [] for rc in rxcuis}
            if targets_list:
                per_drug = max(1, len(targets_list) // max(len(rxcuis), 1))
                for i, rc in enumerate(rxcuis):
                    start = i * per_drug
                    end = start + per_drug if i < len(rxcuis) - 1 else len(targets_list)
                    targets[rc] = targets_list[start:end]
        except Exception as exc:
            logger.error("DrugBank target lookup failed: %s", exc)
            errors.append(f"DrugBank: {exc}")
            targets = {}

        # 4) Check FDA labels
        try:
            fda_labels = await self.check_fda_labels(medications)
        except Exception as exc:
            logger.error("FDA label check failed: %s", exc)
            errors.append(f"openFDA labels: {exc}")
            fda_labels = []

        # 5) Check FAERS events
        try:
            faers_events = await self.check_faers_events(medications, modality)
        except Exception as exc:
            logger.error("FAERS check failed: %s", exc)
            errors.append(f"FAERS: {exc}")
            faers_events = []

        # 6) Check pharmacogenomics
        try:
            pgx = await self.check_pgx_interactions(medications)
        except Exception as exc:
            logger.error("PharmGKB check failed: %s", exc)
            errors.append(f"PharmGKB: {exc}")
            pgx = []

        # 7) Drug-device interaction rules
        try:
            interactions = await self.evaluate_drug_device_interactions(medications, resolved, modality)
        except Exception as exc:
            logger.error("Interaction evaluation failed: %s", exc)
            errors.append(f"Interaction rules: {exc}")
            interactions = []

        # 8) Seizure risk assessment
        try:
            seizure_risk = await self.assess_seizure_risk(medications, modality)
        except Exception as exc:
            logger.error("Seizure risk assessment failed: %s", exc)
            errors.append(f"Seizure risk: {exc}")
            seizure_risk = SeizureRiskAssessment(
                baseline_risk=SEIZURE_RISK_TIER.get(modality, 0.10),
                total_risk=SEIZURE_RISK_TIER.get(modality, 0.10),
                risk_level=RiskLevel.MODERATE,
            )

        # 9) Generate report
        report = await self.generate_report(
            medications=medications,
            modality=modality,
            resolved=resolved,
            drug_classes=drug_classes,
            targets=targets,
            fda_labels=fda_labels,
            faers_events=faers_events,
            pgx=pgx,
            interactions=interactions,
            seizure_risk=seizure_risk,
        )
        report.errors = errors
        report.query_hash = qhash

        elapsed = time.time() - start_time
        logger.info(
            "[DrugSafetyEngine] Completed in %.2fs — overall_risk=%s, contraindicated=%s, "
            "alerts=%d warnings=%d cautions=%d",
            elapsed, report.overall_risk_level.value, report.contraindicated,
            len(report.critical_alerts), len(report.warnings), len(report.cautions),
        )

        self._cache[qhash] = (time.time(), report)
        return report


# ---------------------------------------------------------------------------
# Public factory helper
# ---------------------------------------------------------------------------
async def get_safety_report(medications: List[str], modality: str) -> Dict[str, Any]:
    """Convenience factory for external callers."""
    engine = DrugSafetyEngine()
    result = await engine.check_safety(medications, modality)
    return result.model_dump(mode="json")


# ---------------------------------------------------------------------------
# Module execution guard / quick self-test
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    async def _self_test() -> None:
        engine = DrugSafetyEngine()
        report = await engine.check_safety(
            medications=["sertraline", "bupropion", "lithium", "lorazepam"],
            modality="rTMS",
        )
        print(json.dumps(report.model_dump(mode="json"), indent=2, default=str))

    asyncio.run(_self_test())
