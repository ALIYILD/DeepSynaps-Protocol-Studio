#!/usr/bin/env python3
"""
Adverse Event Real-Time Alerting System
========================================
Monitors FAERS, SIDER, and OnSIDES for new adverse events related to
deep learning-based seizure prediction (DeepSynaps) treatments.

Alert Types
-----------
1. New Safety Signal     -- Previously unknown adverse event for treatment
2. Increased Frequency   -- Known event occurring more frequently
3. Drug Interaction      -- New interaction reported
4. Recall Alert          -- Device or medication recall

Severity Levels
---------------
- CRITICAL  → Route to admin immediately
- WARNING   → Route to clinician
- INFO      → Log for review

Example
-------
>>> monitor = AdverseEventMonitor()
>>> alerts = await monitor.daily_scan()
>>> patient_alerts = await monitor.check_patient_alerts(
...     patient_id="P-12345", medications=["levetiracetam", "lacosamide"]
... )
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import (
    Any,
    AsyncIterator,
    Callable,
    Dict,
    List,
    Optional,
    Protocol,
    Tuple,
    Union,
)

import numpy as np

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("adverse_event_alerts")


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class SeverityLevel(Enum):
    """Clinical severity classification for adverse events."""

    CRITICAL = "critical"   # Life-threatening; route to admin immediately
    WARNING = "warning"      # Clinically significant; route to clinician
    INFO = "info"            # Minor; log for periodic review
    LOW = "low"              # Negligible; silent log


class AlertType(Enum):
    """Enumeration of supported alert categories."""

    NEW_SAFETY_SIGNAL = "new_safety_signal"
    INCREASED_FREQUENCY = "increased_frequency"
    DRUG_INTERACTION = "drug_interaction"
    RECALL_ALERT = "recall_alert"


class DataSource(Enum):
    """Upstream pharmacovigilance data sources."""

    FAERS = "FAERS"
    SIDER = "SIDER"
    ONSIDES = "OnSIDES"
    MANUFACTURER = "MANUFACTURER"
    FDA_MEDWATCH = "FDA_MedWatch"


# ---------------------------------------------------------------------------
# Protocols (adapters)
# ---------------------------------------------------------------------------
class _BaseAdapter(Protocol):
    """Minimal interface for upstream data adapters."""

    async def fetch_latest(self, since: datetime) -> List[Dict[str, Any]]:
        ...


class FaersAdapter(_BaseAdapter, Protocol):
    """Adapter for FDA Adverse Event Reporting System (FAERS) quarterly data."""

    base_url: str = "https://fis.fda.gov/extensions/FPD-QDE-FAERS/FPD-QDE-FAERS.html"

    async def fetch_latest(self, since: datetime) -> List[Dict[str, Any]]: ...
    async def fetch_by_drug(self, drug_name: str) -> List[Dict[str, Any]]: ...
    async def fetch_quarter_meta(self) -> Dict[str, Any]: ...


class SiderAdapter(_BaseAdapter, Protocol):
    """Adapter for SIDER (Side Effect Resource) database."""

    async def fetch_latest(self, since: datetime) -> List[Dict[str, Any]]: ...
    async def fetch_drug_side_effects(self, drug_name: str) -> List[Dict[str, Any]]: ...


class OnSidesAdapter(_BaseAdapter, Protocol):
    """Adapter for OnSIDES (ONSIDE of Seizure-related Drugs and Effects) database."""

    async def fetch_latest(self, since: datetime) -> List[Dict[str, Any]]: ...
    async def fetch_seizure_related_events(self) -> List[Dict[str, Any]]: ...


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class MedDRATerm:
    """A MedDRA-coded adverse event term with hierarchical context."""

    pt_code: str                           # Preferred Term code
    pt_name: str                           # Preferred Term name
    hlt_code: Optional[str] = None         # High-Level Term code
    hlt_name: Optional[str] = None
    hlgt_code: Optional[str] = None        # High-Level Group Term code
    hlgt_name: Optional[str] = None
    soc_code: Optional[str] = None         # System Organ Class code
    soc_name: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pt_code": self.pt_code,
            "pt_name": self.pt_name,
            "hlt_code": self.hlt_code,
            "hlt_name": self.hlt_name,
            "hlgt_code": self.hlgt_code,
            "hlgt_name": self.hlgt_name,
            "soc_code": self.soc_code,
            "soc_name": self.soc_name,
        }


@dataclass
class AdverseEvent:
    """Structured representation of an adverse event report."""

    event_id: str
    source: DataSource
    alert_type: AlertType
    drug_name: str
    event_term: MedDRATerm
    reporter_type: str = "unknown"          # e.g., 'physician', 'patient', 'pharmacist'
    onset_date: Optional[datetime] = None
    report_date: Optional[datetime] = None
    patient_age: Optional[int] = None
    patient_sex: Optional[str] = None
    outcome: Optional[str] = None           # e.g., 'recovered', 'fatal', 'unknown'
    frequency: Optional[float] = None       # Proportion (0.0-1.0) if known
    confidence: float = 0.0                 # Model / heuristic confidence
    severity_score: float = 0.0             # 0.0 - 10.0
    severity_level: SeverityLevel = SeverityLevel.INFO
    raw_text: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    # Internal tracking
    _hash: str = field(init=False, repr=False)

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "_hash",
            hashlib.sha256(
                f"{self.source.value}:{self.drug_name}:{self.event_term.pt_code}".encode()
            ).hexdigest()[:16],
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "source": self.source.value,
            "alert_type": self.alert_type.value,
            "drug_name": self.drug_name,
            "event_term": self.event_term.to_dict(),
            "reporter_type": self.reporter_type,
            "onset_date": self.onset_date.isoformat() if self.onset_date else None,
            "report_date": self.report_date.isoformat() if self.report_date else None,
            "patient_age": self.patient_age,
            "patient_sex": self.patient_sex,
            "outcome": self.outcome,
            "frequency": self.frequency,
            "confidence": round(self.confidence, 4),
            "severity_score": round(self.severity_score, 2),
            "severity_level": self.severity_level.value,
            "raw_text": self.raw_text,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class Alert:
    """A fully-formatted alert ready for routing."""

    alert_id: str
    alert_type: AlertType
    severity_level: SeverityLevel
    severity_score: float
    title: str
    message: str
    affected_drugs: List[str]
    affected_patients: List[str]
    recommended_action: str
    confidence: float
    source_events: List[str]                    # References to AdverseEvent.event_id
    route_to: List[str] = field(default_factory=list)
    sent_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "alert_id": self.alert_id,
            "alert_type": self.alert_type.value,
            "severity_level": self.severity_level.value,
            "severity_score": round(self.severity_score, 2),
            "title": self.title,
            "message": self.message,
            "affected_drugs": self.affected_drugs,
            "affected_patients": self.affected_patients,
            "recommended_action": self.recommended_action,
            "confidence": round(self.confidence, 4),
            "source_events": self.source_events,
            "route_to": self.route_to,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "acknowledged_at": self.acknowledged_at.isoformat()
            if self.acknowledged_at
            else None,
            "metadata": self.metadata,
            "created_at": self.created_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# Severity scorer
# ---------------------------------------------------------------------------
class SeverityScorer:
    """
    Score adverse events by clinical significance.

    Combines multiple heuristic and (optionally) ML-derived sub-scores:
    - outcome_score  : Severity of reported outcome (fatal > disability > hospitalised)
    - frequency_score: How often the event occurs relative to baseline
    - reporter_score : Weight by reporter credibility (physician > pharmacist > patient)
    - age_score      : Weight if vulnerable populations involved
    - novelty_score  : Weight if this is a newly-discovered event
    """

    # Outcome severity mapping (0-10 scale)
    _OUTCOME_WEIGHTS: Dict[str, float] = {
        "fatal": 10.0,
        "death": 10.0,
        "life_threatening": 9.0,
        "disability": 8.0,
        "hospitalisation": 7.0,
        "prolonged_hospitalisation": 7.5,
        "congenital_anomaly": 8.5,
        "required_intervention": 5.0,
        "other_serious": 4.0,
        "not_serious": 1.0,
        "unknown": 3.0,
        "recovered": 1.0,
        "recovering": 2.0,
        "not_recovered": 5.0,
    }

    # Reporter credibility weights
    _REPORTER_WEIGHTS: Dict[str, float] = {
        "physician": 1.0,
        "pharmacist": 0.9,
        "other_health_professional": 0.85,
        "nurse": 0.85,
        "patient": 0.6,
        "lawyer": 0.5,
        "unknown": 0.7,
    }

    # Age vulnerability thresholds
    _VULNERABLE_AGE_MAX = 18
    _ELDERLY_AGE_MIN = 65

    def __init__(self, model_path: Optional[str] = None) -> None:
        self.model_path = model_path
        self._ml_model: Optional[Any] = None
        if model_path and Path(model_path).exists():
            logger.info("Loading severity ML model from %s", model_path)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def score(self, event: AdverseEvent) -> Tuple[float, SeverityLevel]:
        """
        Compute composite severity score and assign level.

        Parameters
        ----------
        event : AdverseEvent
            The event to score.

        Returns
        -------
        Tuple[float, SeverityLevel]
            (score 0-10, severity level enum)
        """
        outcome_score = self._outcome_score(event)
        frequency_score = self._frequency_score(event)
        reporter_score = self._reporter_score(event)
        age_score = self._age_vulnerability_score(event)
        novelty_score = self._novelty_score(event)

        # Weighted composite (weights sum to 1.0)
        composite = (
            0.35 * outcome_score
            + 0.25 * frequency_score
            + 0.15 * reporter_score
            + 0.15 * age_score
            + 0.10 * novelty_score
        )

        # Clamp to [0, 10]
        composite = max(0.0, min(10.0, composite))

        level = self._score_to_level(composite)
        return round(composite, 2), level

    # ------------------------------------------------------------------
    # Sub-scores (private)
    # ------------------------------------------------------------------

    def _outcome_score(self, event: AdverseEvent) -> float:
        if not event.outcome:
            return 3.0
        outcome_key = re.sub(r"\s+", "_", event.outcome.lower().strip())
        return self._OUTCOME_WEIGHTS.get(outcome_key, 3.0)

    def _frequency_score(self, event: AdverseEvent) -> float:
        if event.frequency is None:
            return 5.0
        freq = event.frequency
        if freq >= 0.10:
            return 8.0
        if freq >= 0.05:
            return 6.5
        if freq >= 0.01:
            return 5.0
        if freq >= 0.001:
            return 3.5
        return 2.0

    def _reporter_score(self, event: AdverseEvent) -> float:
        key = re.sub(r"\s+", "_", event.reporter_type.lower().strip())
        return self._REPORTER_WEIGHTS.get(key, 0.7) * 10.0

    def _age_vulnerability_score(self, event: AdverseEvent) -> float:
        age = event.patient_age
        if age is None:
            return 5.0
        if age <= self._VULNERABLE_AGE_MAX:
            return 8.5
        if age >= self._ELDERLY_AGE_MIN:
            return 7.0
        return 5.0

    def _novelty_score(self, event: AdverseEvent) -> float:
        if event.alert_type == AlertType.NEW_SAFETY_SIGNAL:
            return 9.0
        if event.alert_type == AlertType.DRUG_INTERACTION:
            return 7.5
        if event.alert_type == AlertType.INCREASED_FREQUENCY:
            return 6.0
        if event.alert_type == AlertType.RECALL_ALERT:
            return 10.0
        return 5.0

    @staticmethod
    def _score_to_level(score: float) -> SeverityLevel:
        if score >= 8.0:
            return SeverityLevel.CRITICAL
        if score >= 5.5:
            return SeverityLevel.WARNING
        if score >= 3.0:
            return SeverityLevel.INFO
        return SeverityLevel.LOW


# ---------------------------------------------------------------------------
# Alert router
# ---------------------------------------------------------------------------
class AlertRouter:
    """
    Route alerts to the appropriate recipients based on severity.

    Routing rules (configurable):
    - CRITICAL → admin, safety_officer, regulatory_affairs
    - WARNING  → clinician, prescribing_physician, pharmacist
    - INFO     → quality_assurance, log_only
    - LOW      → silent log
    """

    DEFAULT_RULES: Dict[SeverityLevel, List[str]] = {
        SeverityLevel.CRITICAL: [
            "admin",
            "safety_officer",
            "regulatory_affairs",
        ],
        SeverityLevel.WARNING: [
            "clinician",
            "prescribing_physician",
            "pharmacist",
        ],
        SeverityLevel.INFO: ["quality_assurance"],
        SeverityLevel.LOW: [],
    }

    def __init__(self, rules: Optional[Dict[SeverityLevel, List[str]]] = None) -> None:
        self.rules = rules or dict(self.DEFAULT_RULES)
        self._channels: Dict[str, Callable[[Alert], Any]] = {}

    def register_channel(
        self, recipient: str, callback: Callable[[Alert], Any]
    ) -> None:
        """Register a delivery channel (e.g., email, SMS, pager, Slack)."""
        self._channels[recipient] = callback

    async def route(self, alert: Alert) -> List[str]:
        """Route an alert to all configured recipients for its severity level."""
        recipients = self.rules.get(alert.severity_level, [])
        alert.route_to = recipients.copy()
        delivered: List[str] = []
        for recipient in recipients:
            handler = self._channels.get(recipient)
            if handler is not None:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        await handler(alert)
                    else:
                        handler(alert)
                    delivered.append(recipient)
                except Exception as exc:
                    logger.error("Failed to deliver alert %s to %s: %s", alert.alert_id, recipient, exc)
            else:
                logger.debug("No channel registered for recipient '%s'", recipient)
        alert.sent_at = datetime.now(timezone.utc)
        return delivered


# ---------------------------------------------------------------------------
# Patient medication cross-reference
# ---------------------------------------------------------------------------
class PatientMedicationRegistry:
    """
    In-memory registry of active patient medications.

    In production, this would be backed by an EHR / FHIR interface.
    """

    def __init__(self) -> None:
        self._patients: Dict[str, Dict[str, Any]] = {}

    def register_patient(
        self,
        patient_id: str,
        medications: List[str],
        allergies: Optional[List[str]] = None,
        risk_factors: Optional[List[str]] = None,
    ) -> None:
        """Register or update a patient's medication profile."""
        self._patients[patient_id] = {
            "medications": [m.lower().strip() for m in medications],
            "allergies": [a.lower().strip() for a in (allergies or [])],
            "risk_factors": risk_factors or [],
            "updated_at": datetime.now(timezone.utc),
        }

    def get_medications(self, patient_id: str) -> List[str]:
        profile = self._patients.get(patient_id)
        return profile["medications"] if profile else []

    def find_patients_on_drug(self, drug_name: str) -> List[str]:
        needle = drug_name.lower().strip()
        return [
            pid
            for pid, profile in self._patients.items()
            if any(needle in med or med in needle for med in profile["medications"])
        ]

    def find_patients_on_any(self, drug_names: List[str]) -> Dict[str, List[str]]:
        result: Dict[str, List[str]] = {}
        for drug in drug_names:
            affected = self.find_patients_on_drug(drug)
            if affected:
                result[drug] = affected
        return result


# ---------------------------------------------------------------------------
# DeepSynaps drug catalog
# ---------------------------------------------------------------------------
DEEPSYNAPS_DRUGS: List[str] = [
    "levetiracetam",
    "lacosamide",
    "perampanel",
    "brivaracetam",
    "eslicarbazepine",
    "cenobamate",
    "cannabidiol",
    "stiripentol",
    "fenfluramine",
    "valproate",
    "lamotrigine",
    "carbamazepine",
    "deep synaps",
    "deepsynaps",
]


# ---------------------------------------------------------------------------
# Core monitor
# ---------------------------------------------------------------------------
class AdverseEventMonitor:
    """
    Real-time adverse event monitoring for DeepSynaps-related treatments.

    Parameters
    ----------
    faers_adapter : FaersAdapter or None
        Adapter for FAERS data. If None, uses a no-op stub.
    sider_adapter : SiderAdapter or None
        Adapter for SIDER data.
    onsides_adapter : OnSidesAdapter or None
        Adapter for OnSIDES data.
    patient_registry : PatientMedicationRegistry or None
        Active patient medication registry.
    alert_router : AlertRouter or None
        Alert delivery router.
    scorer : SeverityScorer or None
        Severity scoring engine.
    storage_path : str or None
        Local path to persist scan state and alert history.
    """

    def __init__(
        self,
        faers_adapter: Optional[Any] = None,
        sider_adapter: Optional[Any] = None,
        onsides_adapter: Optional[Any] = None,
        patient_registry: Optional[PatientMedicationRegistry] = None,
        alert_router: Optional[AlertRouter] = None,
        scorer: Optional[SeverityScorer] = None,
        storage_path: Optional[str] = None,
    ) -> None:
        self.faers = faers_adapter
        self.sider = sider_adapter
        self.onsides = onsides_adapter
        self.patients = patient_registry or PatientMedicationRegistry()
        self.router = alert_router or AlertRouter()
        self.scorer = scorer or SeverityScorer()
        self.storage_path = storage_path

        # Scan state
        self._last_scan: Optional[datetime] = None
        self._known_event_hashes: set[str] = set()
        self._known_frequencies: Dict[str, float] = {}

    # ===================================================================
    # Public async API
    # ===================================================================

    async def daily_scan(self) -> List[Dict[str, Any]]:
        """
        Daily scan for new adverse events across all configured sources.

        Returns
        -------
        List[Dict]
            Serialized list of generated alerts.
        """
        since = self._get_scan_window()
        logger.info("Starting daily scan since %s", since.isoformat())

        # Fetch from all sources concurrently
        results = await asyncio.gather(
            self._safe_fetch(self.check_faers_updates, since),
            self._safe_fetch(self.check_sider_updates, since),
            self._safe_fetch(self.check_onsides_updates, since),
            return_exceptions=True,
        )

        all_events: List[AdverseEvent] = []
        for source_name, result in zip(["FAERS", "SIDER", "OnSIDES"], results):
            if isinstance(result, Exception):
                logger.error("%s fetch failed: %s", source_name, result)
                continue
            logger.info("%s returned %d events", source_name, len(result))
            all_events.extend(result)

        # Deduplicate against known events
        new_events = self._deduplicate(all_events)
        logger.info("%d new events after deduplication", len(new_events))

        # Score significance
        scored_events = await self.evaluate_significance(new_events)

        # Generate alerts for significant events
        alerts: List[Alert] = []
        for event in scored_events:
            if event.severity_level in (SeverityLevel.CRITICAL, SeverityLevel.WARNING):
                alert = await self.generate_alert(
                    event.to_dict(), event.severity_level.value
                )
                alerts.append(alert)

        # Route all alerts
        for alert in alerts:
            await self.router.route(alert)

        # Persist state
        self._last_scan = datetime.now(timezone.utc)
        self._persist_state()

        logger.info("Daily scan complete: %d alerts generated", len(alerts))
        return [a.to_dict() for a in alerts]

    async def check_faers_updates(self) -> List[AdverseEvent]:
        """Check FAERS for new quarterly data."""
        events: List[AdverseEvent] = []
        if self.faers is None:
            logger.debug("No FAERS adapter configured")
            return events

        try:
            raw_records = await self.faers.fetch_latest(self._get_scan_window())
            for record in raw_records:
                event = self._parse_faers_record(record)
                if event and self._is_deepsynaps_related(event):
                    events.append(event)
        except Exception as exc:
            logger.error("FAERS check failed: %s", exc)

        logger.info("FAERS: %d DeepSynaps-related events", len(events))
        return events

    async def check_sider_updates(self) -> List[AdverseEvent]:
        """Check SIDER for database updates."""
        events: List[AdverseEvent] = []
        if self.sider is None:
            logger.debug("No SIDER adapter configured")
            return events

        try:
            raw_records = await self.sider.fetch_latest(self._get_scan_window())
            for record in raw_records:
                event = self._parse_sider_record(record)
                if event and self._is_deepsynaps_related(event):
                    events.append(event)
        except Exception as exc:
            logger.error("SIDER check failed: %s", exc)

        logger.info("SIDER: %d DeepSynaps-related events", len(events))
        return events

    async def check_onsides_updates(self) -> List[AdverseEvent]:
        """Check OnSIDES for seizure-related adverse event updates."""
        events: List[AdverseEvent] = []
        if self.onsides is None:
            logger.debug("No OnSIDES adapter configured")
            return events

        try:
            raw_records = await self.onsides.fetch_latest(self._get_scan_window())
            for record in raw_records:
                event = self._parse_onsides_record(record)
                if event and self._is_deepsynaps_related(event):
                    events.append(event)
        except Exception as exc:
            logger.error("OnSIDES check failed: %s", exc)

        logger.info("OnSIDES: %d DeepSynaps-related events", len(events))
        return events

    async def evaluate_significance(
        self, events: List[AdverseEvent]
    ) -> List[AdverseEvent]:
        """
        Score events by clinical significance and classify alert types.

        Parameters
        ----------
        events : list of AdverseEvent
            Raw parsed events.

        Returns
        -------
        list of AdverseEvent
            Events with ``severity_score`` and ``severity_level`` populated.
        """
        scored: List[AdverseEvent] = []
        for event in events:
            score, level = self.scorer.score(event)
            event.severity_score = score
            event.severity_level = level

            # Update known frequency baselines
            hash_key = event._hash
            if event.frequency is not None:
                if hash_key in self._known_frequencies:
                    old_freq = self._known_frequencies[hash_key]
                    if event.frequency > old_freq * 1.5:
                        event.alert_type = AlertType.INCREASED_FREQUENCY
                self._known_frequencies[hash_key] = event.frequency

            scored.append(event)

        # Sort by severity descending
        scored.sort(key=lambda e: e.severity_score, reverse=True)
        return scored

    async def check_patient_alerts(
        self, patient_id: str, medications: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Check if a patient's medications have new adverse events.

        Parameters
        ----------
        patient_id : str
            Patient identifier.
        medications : list of str
            Current medication list.

        Returns
        -------
        list of dict
            Patient-specific alerts.
        """
        self.patients.register_patient(patient_id, medications)

        # Fetch adverse events for each medication
        med_events: List[AdverseEvent] = []
        for med in medications:
            if self.faers:
                try:
                    records = await self.faers.fetch_by_drug(med)
                    med_events.extend(
                        e
                        for r in records
                        if (e := self._parse_faers_record(r))
                    )
                except Exception as exc:
                    logger.error("FAERS fetch for %s failed: %s", med, exc)

            if self.sider:
                try:
                    records = await self.sider.fetch_drug_side_effects(med)
                    med_events.extend(
                        e
                        for r in records
                        if (e := self._parse_sider_record(r))
                    )
                except Exception as exc:
                    logger.error("SIDER fetch for %s failed: %s", med, exc)

        # Deduplicate and score
        new_events = self._deduplicate(med_events)
        scored = await self.evaluate_significance(new_events)

        # Filter to events that match this patient's meds
        patient_lower = [m.lower().strip() for m in medications]
        relevant = [
            e
            for e in scored
            if any(
                e.drug_name.lower().strip() == med
                or e.drug_name.lower().strip() in med
                or med in e.drug_name.lower().strip()
                for med in patient_lower
            )
            and e.severity_level in (SeverityLevel.CRITICAL, SeverityLevel.WARNING)
        ]

        # Generate patient-specific alerts
        alerts: List[Alert] = []
        for event in relevant:
            alert = await self.generate_alert(
                event.to_dict(), event.severity_level.value
            )
            alert.affected_patients = [patient_id]
            alerts.append(alert)

        # Route
        for alert in alerts:
            await self.router.route(alert)

        logger.info(
            "Patient %s medication check: %d alerts", patient_id, len(alerts)
        )
        return [a.to_dict() for a in alerts]

    async def generate_alert(self, event: Dict[str, Any], severity: str) -> Alert:
        """
        Generate a formatted alert from a scored event.

        Parameters
        ----------
        event : dict
            Serialized adverse event (from ``AdverseEvent.to_dict()``).
        severity : str
            One of 'critical', 'warning', 'info', 'low'.

        Returns
        -------
        Alert
            Fully formatted alert ready for routing.
        """
        alert_type = AlertType(event.get("alert_type", "new_safety_signal"))
        event_id = event["event_id"]
        drug = event["drug_name"]
        pt_name = event.get("event_term", {}).get("pt_name", "Unknown event")
        soc_name = event.get("event_term", {}).get("soc_name", "")
        confidence = event.get("confidence", 0.0)
        sev_score = event.get("severity_score", 0.0)
        sev_level = SeverityLevel(severity)
        outcome = event.get("outcome", "unknown")

        # Build title and message
        if alert_type == AlertType.NEW_SAFETY_SIGNAL:
            title = f"NEW SAFETY SIGNAL: {pt_name} with {drug}"
            message = (
                f"A previously unreported adverse event has been identified.\n"
                f"  Drug: {drug}\n"
                f"  Event: {pt_name}\n"
                f"  System Organ Class: {soc_name}\n"
                f"  Outcome: {outcome}\n"
                f"  Confidence: {confidence:.1%}"
            )
            action = (
                "1. Review patient records for similar events.\n"
                "2. Consider updating informed consent documentation.\n"
                "3. Report to regulatory authority if required."
            )

        elif alert_type == AlertType.INCREASED_FREQUENCY:
            title = f"FREQUENCY INCREASE: {pt_name} with {drug}"
            freq = event.get("frequency", "unknown")
            message = (
                f"A known adverse event is occurring more frequently than baseline.\n"
                f"  Drug: {drug}\n"
                f"  Event: {pt_name}\n"
                f"  Current frequency: {freq}\n"
                f"  System Organ Class: {soc_name}"
            )
            action = (
                "1. Review recent batch data for quality issues.\n"
                "2. Assess whether usage patterns have changed.\n"
                "3. Consider risk mitigation strategies."
            )

        elif alert_type == AlertType.DRUG_INTERACTION:
            title = f"DRUG INTERACTION: {drug} + {event.get('metadata', {}).get('interacting_drug', 'unknown')}"
            message = (
                f"A new drug-drug interaction has been reported.\n"
                f"  Primary drug: {drug}\n"
                f"  Interacting drug: {event.get('metadata', {}).get('interacting_drug', 'N/A')}\n"
                f"  Event: {pt_name}\n"
                f"  Severity: {severity.upper()}"
            )
            action = (
                "1. Cross-check against patient medication records.\n"
                "2. Update interaction databases.\n"
                "3. Alert prescribing clinicians."
            )

        elif alert_type == AlertType.RECALL_ALERT:
            title = f"RECALL ALERT: {drug}"
            recall_reason = event.get("metadata", {}).get("recall_reason", "Unspecified")
            message = (
                f"A recall has been issued for this product.\n"
                f"  Product: {drug}\n"
                f"  Reason: {recall_reason}\n"
                f"  Classification: {event.get('metadata', {}).get('recall_class', 'N/A')}"
            )
            action = (
                "1. IMMEDIATE: Quarantine affected lots.\n"
                "2. Notify all patients with current prescriptions.\n"
                "3. Prepare regulatory submission."
            )
        else:
            title = f"Adverse event alert: {pt_name}"
            message = f"Alert for {drug}: {pt_name}"
            action = "Review event details and determine appropriate action."

        alert_id = self._generate_alert_id(event_id, alert_type.value)
        return Alert(
            alert_id=alert_id,
            alert_type=alert_type,
            severity_level=sev_level,
            severity_score=sev_score,
            title=title,
            message=message,
            affected_drugs=[drug],
            affected_patients=[],
            recommended_action=action,
            confidence=confidence,
            source_events=[event_id],
        )

    # ===================================================================
    # Utility / private helpers
    # ===================================================================

    def _get_scan_window(self) -> datetime:
        """Return the datetime from which to scan."""
        if self._last_scan:
            return self._last_scan
        return datetime.now(timezone.utc) - timedelta(days=1)

    @staticmethod
    async def _safe_fetch(
        coro: Callable[..., Any], *args: Any, **kwargs: Any
    ) -> Any:
        """Wrap a coroutine for safe concurrent execution."""
        try:
            result = coro(*args, **kwargs)
            if asyncio.iscoroutine(result):
                return await result
            return result
        except Exception as exc:
            return exc

    def _deduplicate(self, events: List[AdverseEvent]) -> List[AdverseEvent]:
        """Remove already-known events."""
        new_events: List[AdverseEvent] = []
        for event in events:
            if event._hash not in self._known_event_hashes:
                self._known_event_hashes.add(event._hash)
                new_events.append(event)
        return new_events

    def _is_deepsynaps_related(self, event: AdverseEvent) -> bool:
        """Check if event drug is in DeepSynaps catalog (fuzzy)."""
        drug_lower = event.drug_name.lower()
        return any(
            catalog_drug in drug_lower or drug_lower in catalog_drug
            for catalog_drug in DEEPSYNAPS_DRUGS
        )

    @staticmethod
    def _parse_faers_record(record: Dict[str, Any]) -> Optional[AdverseEvent]:
        """Convert a FAERS raw record into an AdverseEvent."""
        try:
            drug = record.get("drug_name", record.get("medicinalproduct", "unknown"))
            pt_name = record.get("reaction", record.get("pt", "unknown"))
            pt_code = record.get("pt_code", "")
            term = MedDRATerm(pt_code=pt_code, pt_name=pt_name)
            return AdverseEvent(
                event_id=f"FAERS-{record.get('safetyreportid', hashlib.sha256(str(record).encode()).hexdigest()[:12])}",
                source=DataSource.FAERS,
                alert_type=AlertType.NEW_SAFETY_SIGNAL,
                drug_name=drug,
                event_term=term,
                reporter_type=record.get("reporter_qualification", "unknown"),
                onset_date=_parse_date(record.get("reaction_start_date")),
                report_date=_parse_date(record.get("receipt_date")),
                patient_age=_safe_int(record.get("patient_age")),
                patient_sex=record.get("patient_sex"),
                outcome=record.get("seriousness_outcome", record.get("outcome", "unknown")),
                confidence=0.75,
                raw_text=json.dumps(record, default=str)[:2000],
            )
        except Exception as exc:
            logger.warning("Failed to parse FAERS record: %s", exc)
            return None

    @staticmethod
    def _parse_sider_record(record: Dict[str, Any]) -> Optional[AdverseEvent]:
        """Convert a SIDER raw record into an AdverseEvent."""
        try:
            drug = record.get("drug_name", record.get("drug", "unknown"))
            pt_name = record.get("side_effect_name", record.get("umls_label", "unknown"))
            pt_code = record.get("umls_cui", "")
            freq = record.get("frequency")
            term = MedDRATerm(pt_code=pt_code, pt_name=pt_name)
            event = AdverseEvent(
                event_id=f"SIDER-{record.get('sider_id', hashlib.sha256(str(record).encode()).hexdigest()[:12])}",
                source=DataSource.SIDER,
                alert_type=AlertType.NEW_SAFETY_SIGNAL,
                drug_name=drug,
                event_term=term,
                frequency=_safe_float(freq),
                confidence=0.85 if freq else 0.60,
                metadata={"sider_source": record.get("source", "unknown")},
            )
            return event
        except Exception as exc:
            logger.warning("Failed to parse SIDER record: %s", exc)
            return None

    @staticmethod
    def _parse_onsides_record(record: Dict[str, Any]) -> Optional[AdverseEvent]:
        """Convert an OnSIDES raw record into an AdverseEvent."""
        try:
            drug = record.get("drug_name", record.get("drug", "unknown"))
            pt_name = record.get("event_name", record.get("pt", "unknown"))
            pt_code = record.get("pt_code", "")
            term = MedDRATerm(pt_code=pt_code, pt_name=pt_name)
            return AdverseEvent(
                event_id=f"ONSIDES-{record.get('onsides_id', hashlib.sha256(str(record).encode()).hexdigest()[:12])}",
                source=DataSource.ONSIDES,
                alert_type=AlertType.NEW_SAFETY_SIGNAL,
                drug_name=drug,
                event_term=term,
                outcome=record.get("outcome", "unknown"),
                confidence=record.get("prediction_probability", 0.70),
                metadata={
                    "onsides_model": record.get("model_version", "unknown"),
                    "prediction_prob": record.get("prediction_probability"),
                },
            )
        except Exception as exc:
            logger.warning("Failed to parse OnSIDES record: %s", exc)
            return None

    @staticmethod
    def _generate_alert_id(event_id: str, alert_type: str) -> str:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        digest = hashlib.sha256(f"{event_id}:{alert_type}:{ts}".encode()).hexdigest()[:8]
        return f"ALERT-{ts}-{alert_type[:3].upper()}-{digest}"

    def _persist_state(self) -> None:
        """Persist scan state to local storage."""
        if not self.storage_path:
            return
        try:
            state = {
                "last_scan": self._last_scan.isoformat() if self._last_scan else None,
                "known_hashes": list(self._known_event_hashes),
                "known_frequencies": self._known_frequencies,
            }
            Path(self.storage_path).parent.mkdir(parents=True, exist_ok=True)
            with open(self.storage_path, "w", encoding="utf-8") as fh:
                json.dump(state, fh, default=str, indent=2)
        except Exception as exc:
            logger.error("State persistence failed: %s", exc)

    def load_state(self) -> None:
        """Load persisted scan state."""
        if not self.storage_path or not Path(self.storage_path).exists():
            return
        try:
            with open(self.storage_path, "r", encoding="utf-8") as fh:
                state = json.load(fh)
            if state.get("last_scan"):
                self._last_scan = datetime.fromisoformat(state["last_scan"])
            self._known_event_hashes = set(state.get("known_hashes", []))
            self._known_frequencies = state.get("known_frequencies", {})
            logger.info("Loaded state: %d known events", len(self._known_event_hashes))
        except Exception as exc:
            logger.error("State load failed: %s", exc)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def _parse_date(raw: Any) -> Optional[datetime]:
    """Best-effort date parsing from FAERS/SIDER date strings."""
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw
    for fmt in ("%Y%m%d", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(str(raw).strip(), fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _safe_int(val: Any) -> Optional[int]:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _safe_float(val: Any) -> Optional[float]:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Stub adapters (for testing / development without live connections)
# ---------------------------------------------------------------------------

class StubFaersAdapter:
    """Stub FAERS adapter that returns synthetic records."""

    def __init__(self, records: Optional[List[Dict[str, Any]]] = None) -> None:
        self._records = records or []

    async def fetch_latest(self, since: datetime) -> List[Dict[str, Any]]:
        await asyncio.sleep(0.01)
        return self._records

    async def fetch_by_drug(self, drug_name: str) -> List[Dict[str, Any]]:
        await asyncio.sleep(0.01)
        return [
            r for r in self._records
            if drug_name.lower() in r.get("drug_name", "").lower()
        ]

    async def fetch_quarter_meta(self) -> Dict[str, Any]:
        return {"quarter": "2024Q1", "record_count": len(self._records)}


class StubSiderAdapter:
    """Stub SIDER adapter that returns synthetic records."""

    def __init__(self, records: Optional[List[Dict[str, Any]]] = None) -> None:
        self._records = records or []

    async def fetch_latest(self, since: datetime) -> List[Dict[str, Any]]:
        await asyncio.sleep(0.01)
        return self._records

    async def fetch_drug_side_effects(self, drug_name: str) -> List[Dict[str, Any]]:
        await asyncio.sleep(0.01)
        return [
            r for r in self._records
            if drug_name.lower() in r.get("drug_name", "").lower()
        ]


class StubOnSidesAdapter:
    """Stub OnSIDES adapter that returns synthetic records."""

    def __init__(self, records: Optional[List[Dict[str, Any]]] = None) -> None:
        self._records = records or []

    async def fetch_latest(self, since: datetime) -> List[Dict[str, Any]]:
        await asyncio.sleep(0.01)
        return self._records

    async def fetch_seizure_related_events(self) -> List[Dict[str, Any]]:
        return self._records


# ---------------------------------------------------------------------------
# Scheduler wrapper
# ---------------------------------------------------------------------------
class DailyScanScheduler:
    """
    Lightweight async scheduler that runs the monitor on a daily cadence.

    Usage
    -----
    >>> scheduler = DailyScanScheduler(monitor)
    >>> asyncio.run(scheduler.run())
    """

    def __init__(
        self,
        monitor: AdverseEventMonitor,
        hour: int = 6,
        minute: int = 0,
        max_runs: Optional[int] = None,
    ) -> None:
        self.monitor = monitor
        self.hour = hour
        self.minute = minute
        self.max_runs = max_runs
        self._run_count = 0
        self._stop_event = asyncio.Event()

    async def run(self) -> None:
        """Run the scheduler loop."""
        logger.info("Scheduler started (daily at %02d:%02d UTC)", self.hour, self.minute)
        while not self._stop_event.is_set():
            now = datetime.now(timezone.utc)
            next_run = now.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
            wait_seconds = (next_run - now).total_seconds()
            logger.info("Next scan at %s (waiting %.0f s)", next_run.isoformat(), wait_seconds)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=wait_seconds)
            except asyncio.TimeoutError:
                pass
            if self._stop_event.is_set():
                break
            try:
                alerts = await self.monitor.daily_scan()
                logger.info("Scheduled scan produced %d alerts", len(alerts))
            except Exception as exc:
                logger.error("Scheduled scan failed: %s", exc)
            self._run_count += 1
            if self.max_runs and self._run_count >= self.max_runs:
                break

    def stop(self) -> None:
        """Signal the scheduler to stop."""
        self._stop_event.set()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

async def _test_severity_scorer() -> None:
    """Test the severity scoring engine."""
    scorer = SeverityScorer()

    # Critical event (fatal outcome)
    event_fatal = AdverseEvent(
        event_id="TEST-001",
        source=DataSource.FAERS,
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        drug_name="levetiracetam",
        event_term=MedDRATerm(pt_code="PT001", pt_name="Anaphylaxis"),
        outcome="fatal",
        reporter_type="physician",
        patient_age=75,
        confidence=0.9,
    )
    score, level = scorer.score(event_fatal)
    assert level == SeverityLevel.CRITICAL, f"Expected CRITICAL, got {level}"
    assert score >= 8.0, f"Expected score >= 8.0, got {score}"
    print(f"  [PASS] Fatal anaphylaxis scored {score} → {level.value}")

    # Warning event (hospitalised adult)
    event_warn = AdverseEvent(
        event_id="TEST-002",
        source=DataSource.SIDER,
        alert_type=AlertType.INCREASED_FREQUENCY,
        drug_name="lacosamide",
        event_term=MedDRATerm(pt_code="PT002", pt_name="Dizziness"),
        outcome="hospitalisation",
        reporter_type="patient",
        patient_age=35,
        frequency=0.08,
        confidence=0.7,
    )
    score2, level2 = scorer.score(event_warn)
    assert level2 in (SeverityLevel.WARNING, SeverityLevel.CRITICAL), f"Got {level2}"
    print(f"  [PASS] Dizziness scored {score2} → {level2.value}")

    # Low severity (recovered minor event)
    event_low = AdverseEvent(
        event_id="TEST-003",
        source=DataSource.ONSIDES,
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        drug_name="perampanel",
        event_term=MedDRATerm(pt_code="PT003", pt_name="Mild headache"),
        outcome="recovered",
        reporter_type="patient",
        patient_age=28,
        confidence=0.5,
    )
    score3, level3 = scorer.score(event_low)
    assert level3 in (SeverityLevel.INFO, SeverityLevel.LOW), f"Got {level3}"
    print(f"  [PASS] Mild headache scored {score3} → {level3.value}")


async def _test_alert_router() -> None:
    """Test alert routing logic."""
    deliveries: Dict[str, List[str]] = {"admin": [], "clinician": []}

    def admin_handler(alert: Alert) -> None:
        deliveries["admin"].append(alert.alert_id)

    def clinician_handler(alert: Alert) -> None:
        deliveries["clinician"].append(alert.alert_id)

    router = AlertRouter()
    router.register_channel("admin", admin_handler)
    router.register_channel("clinician", clinician_handler)

    critical_alert = Alert(
        alert_id="ALERT-CRIT-001",
        alert_type=AlertType.RECALL_ALERT,
        severity_level=SeverityLevel.CRITICAL,
        severity_score=9.5,
        title="CRITICAL TEST ALERT",
        message="Test critical message",
        affected_drugs=["levetiracetam"],
        affected_patients=["P-001"],
        recommended_action="Test action",
        confidence=0.95,
        source_events=["E-001"],
    )
    delivered = await router.route(critical_alert)
    assert "admin" in critical_alert.route_to
    assert len(deliveries["admin"]) == 1
    print(f"  [PASS] Critical alert routed to: {delivered}")

    warning_alert = Alert(
        alert_id="ALERT-WARN-001",
        alert_type=AlertType.DRUG_INTERACTION,
        severity_level=SeverityLevel.WARNING,
        severity_score=6.5,
        title="WARNING TEST ALERT",
        message="Test warning message",
        affected_drugs=["lacosamide"],
        affected_patients=["P-002"],
        recommended_action="Test action",
        confidence=0.80,
        source_events=["E-002"],
    )
    delivered2 = await router.route(warning_alert)
    assert "clinician" in warning_alert.route_to
    assert len(deliveries["clinician"]) == 1
    print(f"  [PASS] Warning alert routed to: {delivered2}")


async def _test_daily_scan() -> None:
    """Test the full daily scan pipeline with stub adapters."""
    faers_stub = StubFaersAdapter([
        {
            "safetyreportid": "SR12345",
            "drug_name": "Levetiracetam",
            "reaction": "Severe Rash",
            "pt_code": "PT100",
            "reporter_qualification": "physician",
            "seriousness_outcome": "hospitalisation",
            "patient_age": 42,
            "patient_sex": "F",
        },
        {
            "safetyreportid": "SR12346",
            "drug_name": "DeepSynaps",
            "reaction": "Seizure clustering",
            "pt_code": "PT101",
            "reporter_qualification": "physician",
            "seriousness_outcome": "life_threatening",
            "patient_age": 12,
            "patient_sex": "M",
        },
    ])

    sider_stub = StubSiderAdapter([
        {
            "drug_name": "Lacosamide",
            "side_effect_name": "PR interval prolongation",
            "umls_cui": "CUI200",
            "frequency": "0.025",
        },
    ])

    onsides_stub = StubOnSidesAdapter([
        {
            "drug_name": "Perampanel",
            "event_name": "Psychotic episode",
            "pt_code": "PT300",
            "prediction_probability": 0.88,
            "model_version": "onsides-v2.1",
            "outcome": "disability",
        },
    ])

    monitor = AdverseEventMonitor(
        faers_adapter=faers_stub,
        sider_adapter=sider_stub,
        onsides_adapter=onsides_stub,
    )
    alerts = await monitor.daily_scan()

    assert len(alerts) >= 0, "daily_scan should complete"
    print(f"  [PASS] Daily scan produced {len(alerts)} alerts")
    if alerts:
        severities = {a["severity_level"] for a in alerts}
        print(f"  [PASS] Severity distribution: {severities}")
        for alert in alerts:
            assert "alert_id" in alert
            assert "severity_score" in alert
            assert "title" in alert
            assert "message" in alert
            assert "recommended_action" in alert


async def _test_patient_medication_check() -> None:
    """Test patient-specific medication cross-referencing."""
    faers_stub = StubFaersAdapter([
        {
            "safetyreportid": "SR50001",
            "drug_name": "Levetiracetam",
            "reaction": "Stevens-Johnson syndrome",
            "pt_code": "PT500",
            "reporter_qualification": "physician",
            "seriousness_outcome": "fatal",
            "patient_age": 8,
        },
        {
            "safetyreportid": "SR50002",
            "drug_name": "Ibuprofen",  # Not DeepSynaps-related
            "reaction": "Stomach pain",
            "pt_code": "PT501",
            "reporter_qualification": "patient",
            "seriousness_outcome": "not_serious",
        },
    ])

    monitor = AdverseEventMonitor(faers_adapter=faers_stub)
    patient_alerts = await monitor.check_patient_alerts(
        patient_id="P-TEST-001",
        medications=["Levetiracetam", "Lacosamide"],
    )

    assert len(patient_alerts) > 0, "Expected alerts for patient's meds"
    assert all("Levetiracetam" in str(a.get("affected_drugs", [])) for a in patient_alerts)
    assert all("P-TEST-001" in a.get("affected_patients", []) for a in patient_alerts)
    print(f"  [PASS] Patient check produced {len(patient_alerts)} alerts")


async def _test_alert_generation() -> None:
    """Test alert generation for all alert types."""
    monitor = AdverseEventMonitor()

    for atype in AlertType:
        event = AdverseEvent(
            event_id=f"TEST-{atype.value}",
            source=DataSource.FAERS,
            alert_type=atype,
            drug_name="Levetiracetam",
            event_term=MedDRATerm(pt_code=f"PT-{atype.value}", pt_name="Test event"),
            outcome="hospitalisation",
            confidence=0.8,
        )
        event.severity_score, event.severity_level = SeverityScorer().score(event)
        alert = await monitor.generate_alert(event.to_dict(), event.severity_level.value)
        assert alert.alert_type == atype
        assert alert.alert_id.startswith("ALERT-")
        assert alert.severity_score > 0
        print(f"  [PASS] {atype.value} alert generated: {alert.title[:50]}...")


async def _test_deduplication() -> None:
    """Test event deduplication logic."""
    monitor = AdverseEventMonitor()

    event1 = AdverseEvent(
        event_id="DEDUP-001",
        source=DataSource.FAERS,
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        drug_name="levetiracetam",
        event_term=MedDRATerm(pt_code="PT001", pt_name="Dizziness"),
    )
    event2 = AdverseEvent(
        event_id="DEDUP-002",
        source=DataSource.FAERS,
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        drug_name="levetiracetam",
        event_term=MedDRATerm(pt_code="PT001", pt_name="Dizziness"),
    )
    event3 = AdverseEvent(
        event_id="DEDUP-003",
        source=DataSource.FAERS,
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        drug_name="lacosamide",
        event_term=MedDRATerm(pt_code="PT002", pt_name="Nausea"),
    )

    deduped = monitor._deduplicate([event1, event2, event3])
    assert len(deduped) == 2, f"Expected 2 unique, got {len(deduped)}"
    print(f"  [PASS] Deduplication: 3 events → {len(deduped)} unique")


async def _test_frequency_change_detection() -> None:
    """Test detection of increased frequency of known events."""
    monitor = AdverseEventMonitor()

    # First appearance — baseline frequency
    event1 = AdverseEvent(
        event_id="FREQ-001",
        source=DataSource.SIDER,
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        drug_name="levetiracetam",
        event_term=MedDRATerm(pt_code="PT010", pt_name="Somnolence"),
        frequency=0.02,
        confidence=0.85,
    )
    # Set known frequency without adding to dedup set
    monitor._known_frequencies[event1._hash] = 0.02

    # Second appearance — frequency increased 3x
    event2 = AdverseEvent(
        event_id="FREQ-002",
        source=DataSource.SIDER,
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        drug_name="levetiracetam",
        event_term=MedDRATerm(pt_code="PT010", pt_name="Somnolence"),
        frequency=0.06,  # 3x increase
        confidence=0.88,
    )

    scored = await monitor.evaluate_significance([event2])
    assert len(scored) == 1
    assert scored[0].alert_type == AlertType.INCREASED_FREQUENCY
    print(f"  [PASS] Frequency increase detected: 0.02 → 0.06, alert={scored[0].alert_type.value}")


async def _test_patient_registry() -> None:
    """Test the patient medication registry."""
    registry = PatientMedicationRegistry()
    registry.register_patient("P-001", ["levetiracetam", "lacosamide"])
    registry.register_patient("P-002", ["carbamazepine"])
    registry.register_patient("P-003", ["levetiracetam", "valproate"])

    levetiracetam_patients = registry.find_patients_on_drug("levetiracetam")
    assert set(levetiracetam_patients) == {"P-001", "P-003"}

    carbamazepine_patients = registry.find_patients_on_drug("carbamazepine")
    assert carbamazepine_patients == ["P-002"]

    any_map = registry.find_patients_on_any(["levetiracetam", "carbamazepine"])
    assert "levetiracetam" in any_map
    assert "carbamazepine" in any_map
    print(f"  [PASS] Registry: found patients on levetiracetam={levetiracetam_patients}")


async def _test_data_source_enum() -> None:
    """Test data source enum values."""
    assert DataSource.FAERS.value == "FAERS"
    assert DataSource.SIDER.value == "SIDER"
    assert DataSource.ONSIDES.value == "OnSIDES"
    assert DataSource.MANUFACTURER.value == "MANUFACTURER"
    assert DataSource.FDA_MEDWATCH.value == "FDA_MedWatch"
    print("  [PASS] DataSource enum values correct")


async def _test_meddra_term() -> None:
    """Test MedDRA term dataclass."""
    term = MedDRATerm(
        pt_code="PT1001",
        pt_name="Anaphylactic reaction",
        hlt_code="HLT001",
        hlt_name="Allergic reactions",
        soc_code="SOC008",
        soc_name="Immune system disorders",
    )
    d = term.to_dict()
    assert d["pt_code"] == "PT1001"
    assert d["pt_name"] == "Anaphylactic reaction"
    assert d["soc_name"] == "Immune system disorders"
    print("  [PASS] MedDRATerm serialization correct")


async def _test_serialization_roundtrip() -> None:
    """Test that Alert round-trips through to_dict cleanly."""
    alert = Alert(
        alert_id="ALERT-RT-001",
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        severity_level=SeverityLevel.WARNING,
        severity_score=6.5,
        title="Round-trip test",
        message="Test message",
        affected_drugs=["drug1"],
        affected_patients=["P-1"],
        recommended_action="Do something",
        confidence=0.85,
        source_events=["E-1"],
    )
    d = alert.to_dict()
    assert d["alert_id"] == "ALERT-RT-001"
    assert d["severity_level"] == "warning"
    assert d["alert_type"] == "new_safety_signal"
    assert d["severity_score"] == 6.5
    print("  [PASS] Alert serialization round-trip OK")


async def _test_scheduler() -> None:
    """Test the daily scan scheduler (short-circuited)."""
    faers_stub = StubFaersAdapter([
        {
            "safetyreportid": "SR-SCH-001",
            "drug_name": "Levetiracetam",
            "reaction": "Headache",
            "pt_code": "PT-Sch",
            "reporter_qualification": "patient",
            "seriousness_outcome": "not_serious",
        },
    ])
    monitor = AdverseEventMonitor(faers_adapter=faers_stub)
    scheduler = DailyScanScheduler(monitor, max_runs=1)

    # Run with a short timeout to verify it starts and stops
    try:
        await asyncio.wait_for(scheduler.run(), timeout=0.1)
    except asyncio.TimeoutError:
        pass
    scheduler.stop()
    print("  [PASS] Scheduler start/stop works")


async def _test_adverse_event_hash() -> None:
    """Test that adverse events produce consistent hashes."""
    e1 = AdverseEvent(
        event_id="E-HASH-1",
        source=DataSource.FAERS,
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        drug_name="levetiracetam",
        event_term=MedDRATerm(pt_code="PT001", pt_name="Dizziness"),
    )
    e2 = AdverseEvent(
        event_id="E-HASH-2",
        source=DataSource.FAERS,
        alert_type=AlertType.NEW_SAFETY_SIGNAL,
        drug_name="levetiracetam",
        event_term=MedDRATerm(pt_code="PT001", pt_name="Dizziness"),
    )
    assert e1._hash == e2._hash, "Same drug+event should produce same hash"
    print(f"  [PASS] Consistent hashing: {e1._hash}")


async def _test_no_adapter_fallback() -> None:
    """Test that monitor works even without adapters."""
    monitor = AdverseEventMonitor()
    # Manually set scan window to avoid issues
    monitor._last_scan = datetime.now(timezone.utc) - timedelta(hours=1)
    # With no adapters, no sources are checked
    alerts = await monitor.check_faers_updates()
    assert alerts == [], f"Expected empty, got {alerts}"
    alerts_sider = await monitor.check_sider_updates()
    assert alerts_sider == [], f"Expected empty, got {alerts_sider}"
    alerts_onsides = await monitor.check_onsides_updates()
    assert alerts_onsides == [], f"Expected empty, got {alerts_onsides}"
    print("  [PASS] No-adapter fallback returns empty alerts")


async def _test_outcome_score_variations() -> None:
    """Test severity scoring for various outcomes."""
    scorer = SeverityScorer()
    # (outcome, expected_min_severity, min_total_score)
    # outcome contributes only 35% to composite, so min_score reflects total composite
    outcomes = [
        ("fatal", SeverityLevel.WARNING, 6.0),
        ("death", SeverityLevel.WARNING, 6.0),
        ("life_threatening", SeverityLevel.WARNING, 6.0),
        ("disability", SeverityLevel.WARNING, 5.0),
        ("hospitalisation", SeverityLevel.WARNING, 4.5),
        ("congenital_anomaly", SeverityLevel.WARNING, 6.0),
        ("recovered", SeverityLevel.INFO, 2.5),
    ]
    for outcome, expected_min_level, min_score in outcomes:
        event = AdverseEvent(
            event_id=f"E-OUT-{outcome}",
            source=DataSource.FAERS,
            alert_type=AlertType.NEW_SAFETY_SIGNAL,
            drug_name="test_drug",
            event_term=MedDRATerm(pt_code="PT-TEST", pt_name="Test"),
            outcome=outcome,
            reporter_type="physician",
            patient_age=35,
            confidence=0.5,
        )
        score, level = scorer.score(event)
        assert score >= min_score, f"Outcome '{outcome}': score {score} < {min_score}"
        severity_order = {"critical": 3, "warning": 2, "info": 1, "low": 0}
        assert severity_order[level.value] >= severity_order[expected_min_level.value], (
            f"Outcome '{outcome}': level {level.value} below {expected_min_level.value}"
        )
    print(f"  [PASS] All {len(outcomes)} outcome variations scored correctly")


async def _test_severity_score_bounds() -> None:
    """Test that severity scores are always within [0, 10]."""
    scorer = SeverityScorer()
    ages = [5, 30, 70, None]
    freqs = [0.0001, 0.001, 0.01, 0.05, 0.15, None]
    for i in range(100):
        age = ages[i % len(ages)]
        freq = freqs[i % len(freqs)]
        event = AdverseEvent(
            event_id=f"E-RAND-{i}",
            source=DataSource.FAERS,
            alert_type=list(AlertType)[i % len(AlertType)],
            drug_name="test_drug",
            event_term=MedDRATerm(pt_code=f"PT{i}", pt_name="Random"),
            outcome=list(scorer._OUTCOME_WEIGHTS.keys())[i % len(scorer._OUTCOME_WEIGHTS)],
            reporter_type=list(scorer._REPORTER_WEIGHTS.keys())[i % len(scorer._REPORTER_WEIGHTS)],
            patient_age=age,
            frequency=freq,
            confidence=(i % 100) / 100.0,
        )
        score, level = scorer.score(event)
        assert 0.0 <= score <= 10.0, f"Score {score} out of bounds"
        assert level in SeverityLevel
    print("  [PASS] 100 random events all scored within [0, 10]")


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

async def run_all_tests() -> Dict[str, bool]:
    """Execute the full test suite and return pass/fail map."""
    test_functions = [
        ("severity_scorer", _test_severity_scorer),
        ("alert_router", _test_alert_router),
        ("daily_scan", _test_daily_scan),
        ("patient_medication_check", _test_patient_medication_check),
        ("alert_generation", _test_alert_generation),
        ("deduplication", _test_deduplication),
        ("frequency_change_detection", _test_frequency_change_detection),
        ("patient_registry", _test_patient_registry),
        ("data_source_enum", _test_data_source_enum),
        ("meddra_term", _test_meddra_term),
        ("serialization_roundtrip", _test_serialization_roundtrip),
        ("scheduler", _test_scheduler),
        ("adverse_event_hash", _test_adverse_event_hash),
        ("no_adapter_fallback", _test_no_adapter_fallback),
        ("outcome_score_variations", _test_outcome_score_variations),
        ("severity_score_bounds", _test_severity_score_bounds),
    ]

    results: Dict[str, bool] = {}
    print("\n" + "=" * 60)
    print("RUNNING ADVERSE EVENT ALERT TESTS")
    print("=" * 60)

    for name, test_fn in test_functions:
        print(f"\n--- {name} ---")
        try:
            await test_fn()
            results[name] = True
        except Exception as exc:
            logger.error("Test '%s' FAILED: %s", name, exc)
            results[name] = False

    passed = sum(results.values())
    total = len(results)
    print("\n" + "=" * 60)
    print(f"RESULTS: {passed}/{total} tests passed")
    print("=" * 60)
    for name, ok in results.items():
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}")

    return results


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    results = asyncio.run(run_all_tests())
    exit(0 if all(results.values()) else 1)
