"""
governance_layer.py — Intelligent Synaps v4
=============================================
Clinical safety governance for all Intelligent Synaps responses.

Performs:
- Known adverse event cross-referencing
- Contraindication detection (drug-disease, drug-drug)
- Interaction screening
- Confidence threshold enforcement
- Risk level classification
- Comprehensive audit logging

No response may reach the user without passing the governance layer.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sqlite3
import time
import unittest
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple

from pydantic import BaseModel, Field

logger = logging.getLogger("intelligent_synaps.governance_layer")

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class RiskLevel(Enum):
    """Risk classification levels."""

    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Contraindication(BaseModel):
    """A detected contraindication."""

    type: str  # absolute, relative, conditional
    drug: str = ""
    condition: str = ""
    severity: str  # low, medium, high, critical
    mechanism: str = ""
    evidence_sources: List[str] = Field(default_factory=list)
    recommendation: str = ""


class Interaction(BaseModel):
    """A detected drug-drug or drug-gene interaction."""

    interaction_type: str  # drug_drug, drug_gene, drug_disease
    entity_a: str
    entity_b: str
    severity: str  # minor, moderate, major, contraindicated
    mechanism: str = ""
    clinical_effect: str = ""
    management: str = ""
    evidence_level: str = ""
    sources: List[str] = Field(default_factory=list)


class SafetyFlag(BaseModel):
    """A safety flag raised by the governance layer."""

    flag_type: str
    severity: str
    description: str
    affected_entities: List[str] = Field(default_factory=list)
    recommendation: str = ""
    references: List[str] = Field(default_factory=list)
    requires_action: bool = False


class SafetyResult(BaseModel):
    """Complete safety check result."""

    check_id: str = ""
    query: str = ""
    overall_risk: str = "none"  # RiskLevel value
    risk_score: float = 0.0  # 0-1
    is_safe: bool = True
    contraindications: List[Contraindication] = Field(default_factory=list)
    interactions: List[Interaction] = Field(default_factory=list)
    adverse_events: List[str] = Field(default_factory=list)
    safety_flags: List[SafetyFlag] = Field(default_factory=list)
    confidence_enforced: bool = True
    audit_log_id: str = ""
    warnings: List[str] = Field(default_factory=list)
    requires_human_review: bool = False
    review_reasons: List[str] = Field(default_factory=list)
    checked_at: str = ""
    processing_time_ms: float = 0.0

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        if not self.checked_at:
            self.checked_at = datetime.now(timezone.utc).isoformat()


class AuditEntry(BaseModel):
    """A single audit log entry."""

    entry_id: str = ""
    timestamp: str = ""
    query: str = ""
    response_summary: str = ""
    checks_performed: List[str] = Field(default_factory=list)
    risk_level: str = ""
    risk_score: float = 0.0
    flags_raised: int = 0
    adapter_count: int = 0
    sources_used: List[str] = Field(default_factory=list)
    overall_confidence: float = 0.0
    correlation_id: str = ""

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()
        if not self.entry_id:
            self.entry_id = hashlib.sha256(
                f"{self.correlation_id}:{self.timestamp}".encode()
            ).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Seed contraindication data
# ---------------------------------------------------------------------------

SEED_CONTRAINDICATIONS: List[Contraindication] = [
    Contraindication(
        type="absolute", drug="sertraline", condition="MAOI_use_current",
        severity="critical", mechanism="Serotonin syndrome risk",
        recommendation="Contraindicated. Allow 14-day washout."
    ),
    Contraindication(
        type="absolute", drug="sertraline", condition="MAOI_use_past_14_days",
        severity="critical", mechanism="Serotonin syndrome risk",
        recommendation="Contraindicated. Allow 14-day washout."
    ),
    Contraindication(
        type="relative", drug="sertraline", condition="bipolar_disorder",
        severity="high", mechanism="May induce mania/hypomania",
        recommendation="Use with mood stabilizer; monitor closely."
    ),
    Contraindication(
        type="relative", drug="sertraline", condition="seizure_disorder",
        severity="medium", mechanism="Lowered seizure threshold",
        recommendation="Use with caution; start low, go slow."
    ),
    Contraindication(
        type="relative", drug="sertraline", condition="cyp2c19_poor_metabolizer",
        severity="medium", mechanism="Increased sertraline levels",
        recommendation="Consider 50% dose reduction."
    ),
    Contraindication(
        type="relative", drug="sertraline", condition="pregnancy",
        severity="medium", mechanism="Potential fetal effects (Category C)",
        recommendation="Weigh risks/benefits; lowest effective dose."
    ),
    Contraindication(
        type="relative", drug="sertraline", condition="hepatic_impairment",
        severity="medium", mechanism="Reduced clearance",
        recommendation="Start at 25 mg; slower titration."
    ),
    Contraindication(
        type="absolute", drug="tDCS", condition="intracranial_metal_implant",
        severity="critical", mechanism="Risk of heating/migration",
        recommendation="Contraindicated."
    ),
    Contraindication(
        type="absolute", drug="TMS", condition="pacemaker_implant",
        severity="critical", mechanism="Magnetic field interference",
        recommendation="Contraindicated."
    ),
    Contraindication(
        type="relative", drug="tDCS", condition="epilepsy",
        severity="high", mechanism="May lower seizure threshold",
        recommendation="Use with caution; consult neurologist."
    ),
]

SEED_INTERACTIONS: List[Interaction] = [
    Interaction(
        interaction_type="drug_drug", entity_a="sertraline", entity_b="tramadol",
        severity="major", mechanism="Dual serotonin reuptake inhibition",
        clinical_effect="Serotonin syndrome risk",
        management="Avoid combination or use with extreme caution",
        evidence_level="well_established",
    ),
    Interaction(
        interaction_type="drug_drug", entity_a="sertraline", entity_b="warfarin",
        severity="moderate", mechanism="CYP2C9 inhibition + antiplatelet effect",
        clinical_effect="Increased INR/bleeding risk",
        management="Monitor INR closely",
        evidence_level="well_established",
    ),
    Interaction(
        interaction_type="drug_drug", entity_a="sertraline", entity_b="ibuprofen",
        severity="minor", mechanism="Antiplatelet effect + NSAID",
        clinical_effect="Slight bleeding risk increase",
        management="Generally safe; monitor if high risk",
        evidence_level="moderate",
    ),
    Interaction(
        interaction_type="drug_gene", entity_a="sertraline", entity_b="cyp2d6",
        severity="moderate", mechanism="CYP2D6 substrate",
        clinical_effect="Metabolism varies by genotype",
        management="Consider pharmacogenomic testing",
        evidence_level="moderate",
    ),
    Interaction(
        interaction_type="drug_gene", entity_a="sertraline", entity_b="cyp2c19",
        severity="moderate", mechanism="CYP2C19 substrate",
        clinical_effect="Dose adjustments needed for PM/UM",
        management="CPIC guideline: adjust based on genotype",
        evidence_level="strong",
    ),
    Interaction(
        interaction_type="drug_drug", entity_a="fluoxetine", entity_b="sertraline",
        severity="major", mechanism="Dual SSRI — serotonin syndrome",
        clinical_effect="Serotonin syndrome, QT prolongation",
        management="Avoid concurrent SSRI use",
        evidence_level="well_established",
    ),
]

# High-risk keywords that trigger governance review
HIGH_RISK_KEYWORDS = [
    "suicide", "suicidal", "overdose", "serotonin syndrome",
    "malignant hyperthermia", "anaphylaxis", " Stevens-Johnson",
    "toxic epidermal necrolysis", "QT prolongation", "torsades",
    "agranulocytosis", "hepatotoxicity", "nephrotoxicity",
]

# ---------------------------------------------------------------------------
# GovernanceLayer
# ---------------------------------------------------------------------------

class GovernanceLayer:
    """Clinical safety governance for all Intelligent Synaps responses.

    Usage:
        gov = GovernanceLayer()
        result = await gov.check_response(response, patient_context)
        if not result.is_safe:
            # Block response or show warnings
    """

    def __init__(
        self,
        db_path: Optional[str] = None,
        contraindications: Optional[List[Contraindication]] = None,
        interactions: Optional[List[Interaction]] = None,
    ) -> None:
        self.db_path = db_path or os.environ.get(
            "GOVERNANCE_DB_PATH", "/mnt/agents/output/intelligent_synaps_v4/governance.db"
        )
        self.contraindications = list(contraindications or SEED_CONTRAINDICATIONS)
        self.interactions = list(interactions or SEED_INTERACTIONS)
        self._init_db()
        self._contra_index: Dict[str, List[Contraindication]] = {}
        self._interaction_index: Dict[str, List[Interaction]] = {}
        self._build_indexes()
        logger.info(
            "GovernanceLayer initialised (%d contras, %d interactions, db=%s)",
            len(self.contraindications),
            len(self.interactions),
            self.db_path,
        )

    # -- Database -------------------------------------------------------------

    def _init_db(self) -> None:
        """Initialise SQLite audit database."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS audit_log (
                    entry_id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    query TEXT,
                    response_summary TEXT,
                    checks_performed TEXT,
                    risk_level TEXT,
                    risk_score REAL,
                    flags_raised INTEGER,
                    adapter_count INTEGER,
                    sources_used TEXT,
                    overall_confidence REAL,
                    correlation_id TEXT
                )
            """)
            conn.commit()
            conn.close()
        except Exception as exc:
            logger.warning("Audit DB init failed (non-critical): %s", exc)

    # -- Indexing -------------------------------------------------------------

    def _build_indexes(self) -> None:
        """Build lookup indexes for fast contraindication/interaction checks."""
        for c in self.contraindications:
            key = c.drug.lower() if c.drug else ""
            self._contra_index.setdefault(key, []).append(c)
            # Also index by condition
            if c.condition:
                self._contra_index.setdefault(c.condition.lower(), []).append(c)

        for i in self.interactions:
            key_a = i.entity_a.lower()
            key_b = i.entity_b.lower()
            self._interaction_index.setdefault(key_a, []).append(i)
            self._interaction_index.setdefault(key_b, []).append(i)

    # -- Main API -------------------------------------------------------------

    async def check_response(
        self,
        response: Dict[str, Any],
        patient_context: Optional[Dict[str, Any]] = None,
        correlation_id: str = "",
    ) -> SafetyResult:
        """Full safety check on a response.

        Parameters
        ----------
        response:
            The response dict to check. Should contain 'natural_language',
            'structured_data', 'sources_used', 'overall_confidence'.
        patient_context:
            Optional patient data with keys like 'conditions', 'medications',
            'genetics'.
        correlation_id:
            Request correlation ID for audit trail.

        Returns
        -------
        SafetyResult with all checks and flags.
        """
        import time
        start_time = time.time()

        check_id = self._generate_check_id()
        contras: List[Contraindication] = []
        interactions: List[Interaction] = []
        flags: List[SafetyFlag] = []
        warnings: List[str] = []

        # 1. Extract entities from response
        drugs = self._extract_drugs(response)
        conditions = self._extract_conditions(response, patient_context)

        # 2. Check contraindications
        if patient_context and conditions:
            for drug in drugs:
                for condition in conditions:
                    found = await self.check_contraindications([drug], [condition])
                    contras.extend(found)
        elif drugs:
            # Check general contraindications
            for drug in drugs:
                contras_for_drug = self._contra_index.get(drug.lower(), [])
                for c in contras_for_drug:
                    if not c.condition or c.condition.lower() in conditions:
                        contras.append(c)

        # 3. Check drug interactions
        if len(drugs) >= 2:
            interactions = await self.check_interactions(drugs)

        # 4. Check gene-drug interactions
        if patient_context and "genetics" in patient_context:
            for drug in drugs:
                for gene in patient_context["genetics"]:
                    gene_interactions = [
                        i for i in self.interactions
                        if i.interaction_type == "drug_gene"
                        and drug.lower() in (i.entity_a.lower(), i.entity_b.lower())
                        and gene.lower() in (i.entity_a.lower(), i.entity_b.lower())
                    ]
                    interactions.extend(gene_interactions)

        # 5. Check high-risk keywords
        response_text = response.get("natural_language", "")
        high_risk_found = [kw for kw in HIGH_RISK_KEYWORDS if kw.lower() in response_text.lower()]
        if high_risk_found:
            flags.append(
                SafetyFlag(
                    flag_type="high_risk_content",
                    severity="high" if any(s in ["suicide", "overdose", "serotonin syndrome"] for s in high_risk_found) else "medium",
                    description=f"High-risk keywords detected: {', '.join(high_risk_found)}",
                    recommendation="Ensure appropriate clinical context and safety warnings",
                    requires_action=True,
                )
            )

        # 6. Confidence threshold enforcement
        conf = response.get("overall_confidence", 0.0)
        confidence_enforced = conf >= 0.40
        if not confidence_enforced:
            flags.append(
                SafetyFlag(
                    flag_type="low_confidence",
                    severity="high",
                    description=f"Overall confidence ({conf:.2f}) below minimum threshold",
                    recommendation="Flag for human expert review",
                    requires_action=True,
                )
            )
            warnings.append(f"Low confidence response: {conf:.2f}")

        # 7. Adverse event cross-referencing
        adverse_events = self._check_adverse_events(response_text, drugs)

        # 8. Calculate risk
        risk_score = self._calculate_risk_score(contras, interactions, flags)
        risk_level = self._risk_level(risk_score)

        # 9. Determine if human review needed
        review_reasons: List[str] = []
        if risk_level in ("high", "critical"):
            review_reasons.append(f"Risk level: {risk_level}")
        if any(c.severity == "critical" for c in contras):
            review_reasons.append("Critical contraindication detected")
        if any(i.severity == "contraindicated" for i in interactions):
            review_reasons.append("Contraindicated interaction detected")
        if flags and any(f.requires_action for f in flags):
            review_reasons.append("Action-required safety flags")

        result = SafetyResult(
            check_id=check_id,
            query=response.get("query", ""),
            overall_risk=risk_level,
            risk_score=round(risk_score, 3),
            is_safe=risk_level not in ("critical", "high") and not review_reasons,
            contraindications=contras,
            interactions=interactions,
            adverse_events=adverse_events,
            safety_flags=flags,
            confidence_enforced=confidence_enforced,
            warnings=warnings,
            requires_human_review=len(review_reasons) > 0,
            review_reasons=review_reasons,
            processing_time_ms=round((time.time() - start_time) * 1000, 1),
        )

        # 10. Audit log
        audit_id = await self.log_decision(
            response.get("query", ""),
            response,
            {
                "risk_level": risk_level,
                "risk_score": risk_score,
                "contraindications": len(contras),
                "interactions": len(interactions),
                "flags": len(flags),
                "confidence": conf,
            },
            correlation_id=correlation_id,
        )
        result.audit_log_id = audit_id

        logger.info(
            "Safety check %s: risk=%s (%.3f), contras=%d, interactions=%d, flags=%d",
            check_id,
            risk_level,
            risk_score,
            len(contras),
            len(interactions),
            len(flags),
        )
        return result

    async def check_contraindications(
        self, drugs: List[str], conditions: List[str]
    ) -> List[Contraindication]:
        """Check for contraindications between drugs and conditions.

        Parameters
        ----------
        drugs:
            List of drug names.
        conditions:
            List of patient conditions.

        Returns
        -------
        List of matching contraindications.
        """
        results: List[Contraindication] = []
        for drug in drugs:
            drug_lower = drug.lower()
            for condition in conditions:
                cond_lower = condition.lower()
                # Check direct drug-condition pairs
                for c in self.contraindications:
                    if (
                        drug_lower in c.drug.lower()
                        and cond_lower in c.condition.lower()
                    ):
                        results.append(c)
        # Deduplicate
        seen: Set[str] = set()
        unique: List[Contraindication] = []
        for c in results:
            key = f"{c.drug}:{c.condition}:{c.severity}"
            if key not in seen:
                seen.add(key)
                unique.append(c)
        return unique

    async def check_interactions(
        self, drugs: List[str]
    ) -> List[Interaction]:
        """Check for interactions among a list of drugs.

        Parameters
        ----------
        drugs:
            List of drug names.

        Returns
        -------
        List of detected interactions.
        """
        results: List[Interaction] = []
        drug_lowers = [d.lower() for d in drugs]

        for interaction in self.interactions:
            a_lower = interaction.entity_a.lower()
            b_lower = interaction.entity_b.lower()
            if (
                any(a_lower in d for d in drug_lowers)
                and any(b_lower in d for d in drug_lowers)
                and a_lower != b_lower
            ):
                results.append(interaction)

        return results

    async def log_decision(
        self,
        query: str,
        response: Dict[str, Any],
        checks: Dict[str, Any],
        correlation_id: str = "",
    ) -> str:
        """Log a governance decision to the audit database.

        Parameters
        ----------
        query:
            The original query.
        response:
            The response dict.
        checks:
            Dict with check results.
        correlation_id:
            Request correlation ID.

        Returns
        -------
        Audit entry ID.
        """
        entry = AuditEntry(
            query=query,
            response_summary=response.get("summary", "")[:500],
            checks_performed=list(checks.keys()),
            risk_level=checks.get("risk_level", "unknown"),
            risk_score=checks.get("risk_score", 0.0),
            flags_raised=checks.get("flags", 0),
            adapter_count=checks.get("adapter_count", len(response.get("sources_used", []))),
            sources_used=response.get("sources_used", []),
            overall_confidence=checks.get("confidence", 0.0),
            correlation_id=correlation_id,
        )

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO audit_log VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                entry.entry_id,
                entry.timestamp,
                entry.query[:1000],
                entry.response_summary[:1000],
                json.dumps(entry.checks_performed),
                entry.risk_level,
                entry.risk_score,
                entry.flags_raised,
                entry.adapter_count,
                json.dumps(entry.sources_used),
                entry.overall_confidence,
                entry.correlation_id,
            ))
            conn.commit()
            conn.close()
        except Exception as exc:
            logger.warning("Audit log write failed: %s", exc)

        logger.debug("Audit logged: %s", entry.entry_id)
        return entry.entry_id

    # -- Internal helpers -----------------------------------------------------

    def _extract_drugs(self, response: Dict[str, Any]) -> List[str]:
        """Extract drug names from response."""
        drugs: List[str] = []
        text = response.get("natural_language", "")
        # Simple extraction — production would use NER
        drug_list = ["sertraline", "fluoxetine", "escitalopram", "paroxetine", "citalopram",
                     "venlafaxine", "duloxetine", "bupropion", "mirtazapine", "trazodone",
                     "amitriptyline", "imipramine", "clomipramine", "tramadol", "warfarin"]
        for drug in drug_list:
            if drug.lower() in text.lower():
                drugs.append(drug)
        return drugs

    def _extract_conditions(
        self, response: Dict[str, Any], patient_context: Optional[Dict[str, Any]]
    ) -> List[str]:
        """Extract conditions from response and patient context."""
        conditions: List[str] = []
        if patient_context and "conditions" in patient_context:
            conditions.extend(patient_context["conditions"])
        return conditions

    def _check_adverse_events(
        self, text: str, drugs: List[str]
    ) -> List[str]:
        """Cross-reference response text for known adverse events."""
        events: List[str] = []
        ae_keywords = {
            "sertraline": ["nausea", "diarrhea", "insomnia", "sexual dysfunction",
                           "headache", "dry mouth", "fatigue", "serotonin syndrome"],
            "fluoxetine": ["anxiety", "insomnia", "sexual dysfunction", "weight loss",
                           "headache", "nausea", "agitation"],
            "escitalopram": ["nausea", "headache", "sexual dysfunction", "insomnia",
                            "fatigue", "diaphoresis"],
        }
        for drug in drugs:
            for ae in ae_keywords.get(drug.lower(), []):
                if ae.lower() in text.lower():
                    events.append(f"{drug}: {ae}")
        return events

    @staticmethod
    def _calculate_risk_score(
        contras: List[Contraindication],
        interactions: List[Interaction],
        flags: List[SafetyFlag],
    ) -> float:
        """Calculate overall risk score from 0 (safe) to 1 (critical)."""
        score = 0.0

        # Contraindications
        severity_weights = {"critical": 0.40, "high": 0.25, "medium": 0.10, "low": 0.03}
        for c in contras:
            score += severity_weights.get(c.severity, 0.05)

        # Interactions
        interaction_weights = {"contraindicated": 0.35, "major": 0.20, "moderate": 0.10, "minor": 0.02}
        for i in interactions:
            score += interaction_weights.get(i.severity, 0.05)

        # Flags
        flag_weights = {"critical": 0.25, "high": 0.15, "medium": 0.05, "low": 0.01}
        for f in flags:
            score += flag_weights.get(f.severity, 0.05)

        return min(1.0, score)

    @staticmethod
    def _risk_level(score: float) -> str:
        if score >= 0.60:
            return "critical"
        if score >= 0.40:
            return "high"
        if score >= 0.20:
            return "medium"
        if score >= 0.05:
            return "low"
        return "none"

    @staticmethod
    def _generate_check_id() -> str:
        return hashlib.sha256(
            str(time.time()).encode()
        ).hexdigest()[:12]

    def get_audit_log(
        self, limit: int = 100
    ) -> List[AuditEntry]:
        """Retrieve recent audit log entries."""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?",
                (limit,),
            )
            rows = cursor.fetchall()
            conn.close()

            entries = []
            for row in rows:
                entries.append(AuditEntry(
                    entry_id=row[0],
                    timestamp=row[1],
                    query=row[2] or "",
                    response_summary=row[3] or "",
                    risk_level=row[5] or "",
                    risk_score=row[6] or 0.0,
                    flags_raised=row[7] or 0,
                    adapter_count=row[8] or 0,
                    overall_confidence=row[10] or 0.0,
                    correlation_id=row[11] or "",
                ))
            return entries
        except Exception as exc:
            logger.warning("Audit log read failed: %s", exc)
            return []


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------

class TestGovernanceLayer(unittest.IsolatedAsyncioTestCase):
    async def test_init(self) -> None:
        gov = GovernanceLayer()
        self.assertTrue(len(gov.contraindications) > 0)
        self.assertTrue(len(gov.interactions) > 0)

    async def test_check_contraindications(self) -> None:
        gov = GovernanceLayer()
        result = await gov.check_contraindications(
            ["sertraline"], ["bipolar_disorder"]
        )
        self.assertTrue(len(result) > 0)
        self.assertEqual(result[0].drug, "sertraline")
        self.assertEqual(result[0].condition, "bipolar_disorder")

    async def test_check_interactions(self) -> None:
        gov = GovernanceLayer()
        result = await gov.check_interactions(["sertraline", "tramadol"])
        self.assertTrue(len(result) > 0)
        self.assertTrue(any("sertraline" in [r.entity_a, r.entity_b] for r in result))

    async def test_check_interactions_none(self) -> None:
        gov = GovernanceLayer()
        result = await gov.check_interactions(["sertraline"])
        self.assertEqual(len(result), 0)

    async def test_check_response_safe(self) -> None:
        gov = GovernanceLayer()
        response = {
            "query": "What is the mechanism of sertraline?",
            "natural_language": "Sertraline is an SSRI that inhibits serotonin reuptake.",
            "overall_confidence": 0.95,
            "sources_used": ["drugbank", "pubmed"],
        }
        result = await gov.check_response(response)
        self.assertIsInstance(result, SafetyResult)
        self.assertTrue(result.is_safe or result.risk_score < 0.5)

    async def test_check_response_unsafe(self) -> None:
        gov = GovernanceLayer()
        response = {
            "query": "sertraline for bipolar patient",
            "natural_language": "Sertraline can be used for bipolar disorder patients without mood stabilizer.",
            "overall_confidence": 0.3,
            "sources_used": ["unknown"],
        }
        patient = {"conditions": ["bipolar_disorder"], "medications": ["sertraline"]}
        result = await gov.check_response(response, patient)
        # Should flag low confidence
        self.assertFalse(result.confidence_enforced or result.is_safe)

    async def test_high_risk_keyword(self) -> None:
        gov = GovernanceLayer()
        response = {
            "query": "test",
            "natural_language": "Patient reported suicidal ideation after starting medication.",
            "overall_confidence": 0.8,
            "sources_used": ["pubmed"],
        }
        result = await gov.check_response(response)
        self.assertTrue(any(f.flag_type == "high_risk_content" for f in result.safety_flags))

    async def test_risk_score_calculation(self) -> None:
        score = GovernanceLayer._calculate_risk_score(
            [Contraindication(type="absolute", drug="x", condition="y", severity="critical")],
            [Interaction(interaction_type="drug_drug", entity_a="a", entity_b="b", severity="major")],
            [],
        )
        self.assertTrue(score > 0.5)

    async def test_risk_level(self) -> None:
        self.assertEqual(GovernanceLayer._risk_level(0.0), "none")
        self.assertEqual(GovernanceLayer._risk_level(0.1), "low")
        self.assertEqual(GovernanceLayer._risk_level(0.3), "medium")
        self.assertEqual(GovernanceLayer._risk_level(0.5), "high")
        self.assertEqual(GovernanceLayer._risk_level(0.7), "critical")

    async def test_audit_logging(self) -> None:
        gov = GovernanceLayer()
        audit_id = await gov.log_decision(
            "test query",
            {"summary": "test response", "sources_used": ["test"]},
            {"risk_level": "low", "risk_score": 0.1},
        )
        self.assertTrue(len(audit_id) > 0)

    async def test_extract_drugs(self) -> None:
        gov = GovernanceLayer()
        drugs = gov._extract_drugs({"natural_language": "Sertraline and fluoxetine are SSRIs."})
        self.assertIn("sertraline", [d.lower() for d in drugs])
        self.assertIn("fluoxetine", [d.lower() for d in drugs])


if __name__ == "__main__":
    unittest.main(module=__name__, exit=False, verbosity=2)
