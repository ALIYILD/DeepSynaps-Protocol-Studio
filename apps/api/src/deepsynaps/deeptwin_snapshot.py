"""DeepTwin Snapshot Engine — orchestrates 6 Phase 3 engines into a unified patient view.

Safety-critical design principles:
- NEVER fake forecasts — always "unavailable: no calibrated model"
- NEVER output causal certainty — all correlations labeled "Temporal association only"
- ALWAYS label: "Decision support only. Requires clinician review."
- NEVER set confidence >= 0.95 (enforced via SafetyGovernance.MAX_CONFIDENCE)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from contracts import IntelligenceOutput, MultimodalEvent, SynthesisRequest
from deeptwin_contracts import DeepTwinSnapshot
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance
from timeline_engine import MultimodalTimelineEngine
from correlation_engine import CorrelationEngine
from confound_engine import ConfoundEngine
from evidence_engine import EvidenceLinkingEngine
from hypothesis_engine import HypothesisRankingEngine
from missing_data_engine import MissingDataEngine


class DeepTwinSnapshotEngine:
    """Orchestrates all 6 Phase 3 engines into a unified DeepTwin patient snapshot.

    This is the core Phase 4 engine that produces the canonical ``DeepTwinSnapshot``
    — a comprehensive, safety-governed view of a patient's multimodal data.

    Parameters
    ----------
    knowledge_layer : KnowledgeLayer
        The governed knowledge-layer providing patient data access.

    Attributes
    ----------
    ALL_MODALITIES : list[str]
        The 18 canonical modalities tracked for coverage and recency.
    """

    ALL_MODALITIES: List[str] = [
        "assessment", "qeeg", "mri", "biomarker", "lab",
        "medication", "intervention", "session", "voice", "text",
        "video", "movement", "wearable", "digital_phenotyping",
        "risk_signal", "report", "document", "patient_checkin",
    ]

    # Recency thresholds (days)
    FRESH_THRESHOLD: int = 14
    STALE_THRESHOLD: int = 90

    # Safety hard-codes
    FORECAST_UNAVAILABLE: str = "unavailable: no calibrated model"
    SAFETY_DISCLAIMER: str = (
        "Decision support only. Requires clinician review. "
        "DeepTwin does not diagnose, prescribe, or prove causality."
    )

    def __init__(self, knowledge_layer: KnowledgeLayer) -> None:
        self.kl = knowledge_layer
        self.timeline_engine = MultimodalTimelineEngine(knowledge_layer)
        self.correlation_engine = CorrelationEngine(knowledge_layer)
        self.confound_engine = ConfoundEngine(knowledge_layer)
        self.evidence_engine = EvidenceLinkingEngine(knowledge_layer)
        self.hypothesis_engine = HypothesisRankingEngine(knowledge_layer)
        self.missing_data_engine = MissingDataEngine(knowledge_layer)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_snapshot(
        self,
        patient_id: str,
        include_modalities: Optional[List[str]] = None,
        date_range: Optional[Tuple[str, str]] = None,
        max_hypotheses: int = 5,
    ) -> DeepTwinSnapshot:
        """Generate a unified DeepTwin snapshot by orchestrating all 6 Phase 3 engines.

        Execution order:
        1. MultimodalTimelineEngine — build timeline
        2. CorrelationEngine — find temporal correlations
        3. ConfoundEngine — detect confounders
        4. MissingDataEngine — quality flags
        5. HypothesisRankingEngine — rank hypotheses
        6. EvidenceLinkingEngine — attach evidence
        7. SafetyGovernance — apply safety rules

        Parameters
        ----------
        patient_id : str
            Patient identifier.
        include_modalities : list[str] | None
            Subset of modalities to include. ``None`` = all.
        date_range : tuple[str, str] | None
            ISO-format date range ``(start, end)``.
        max_hypotheses : int
            Maximum number of ranked hypotheses to include (default 5).

        Returns
        -------
        DeepTwinSnapshot
            The unified, safety-governed patient snapshot.

        Safety Guarantees
        -----------------
        - Correlations labeled "Temporal association only. Not causal proof."
        - Hypotheses labeled "Ranked hypothesis. Requires clinician review."
        - Forecast status always "unavailable: no calibrated model".
        - safety_disclaimer always present.
        - No confidence value >= 0.95.
        """
        # --- Parse parameters ---
        modality_filter = include_modalities or None
        dt_range: Optional[Tuple[datetime, datetime]] = None
        if date_range:
            dt_range = (
                datetime.fromisoformat(date_range[0]),
                datetime.fromisoformat(date_range[1]),
            )

        # --- 1. Build timeline ---
        timeline_events: List[MultimodalEvent] = self.timeline_engine.build_timeline(
            patient_id=patient_id,
            modality_filter=modality_filter,
            date_range=dt_range,
        )

        # --- Coverage & recency (computed from raw events) ---
        modality_coverage = self.get_modality_coverage(timeline_events)
        recency_status = self.get_recency_status(timeline_events)

        # --- 2. Correlations ---
        correlations: List[IntelligenceOutput] = self.correlation_engine.find_correlations(
            patient_id=patient_id,
            window_days=30,
            min_confidence=0.3,
        )
        correlations = SafetyGovernance.apply_all(correlations)

        # --- 3. Confounders ---
        confounders: List[IntelligenceOutput] = self.confound_engine.detect_confounders(
            patient_id=patient_id,
            context_events=timeline_events,
        )
        confounders = SafetyGovernance.apply_all(confounders)

        # --- 4. Quality flags ---
        quality_flags: List[IntelligenceOutput] = self.missing_data_engine.detect_gaps(
            patient_id=patient_id,
            expected_modalities=modality_filter,
        )
        quality_flags = SafetyGovernance.apply_all(quality_flags)

        # --- 5. Hypotheses ---
        observation = timeline_events[-1] if timeline_events else None
        hypotheses: List[IntelligenceOutput] = self.hypothesis_engine.rank_hypotheses(
            patient_id=patient_id,
            observation_event=observation,
            max_hypotheses=max_hypotheses,
        )
        hypotheses = SafetyGovernance.apply_all(hypotheses)

        # --- 6. Evidence linking (all insights) ---
        all_insights = correlations + confounders + hypotheses + quality_flags
        all_insights = self.evidence_engine.attach_evidence(all_insights)

        # --- Re-split after evidence enrichment ---
        correlations = [i for i in all_insights if i.insight_type == "correlation"]
        confounders = [i for i in all_insights if i.insight_type == "confound"]
        hypotheses = [i for i in all_insights if i.insight_type == "hypothesis"]
        quality_flags = [i for i in all_insights if i.insight_type == "quality_flag"]

        # --- 7. Collect uncertainty drivers ---
        uncertainty_drivers = self._collect_uncertainty_drivers(
            correlations, confounders, hypotheses, quality_flags
        )

        # --- Build provenance ---
        provenance = self._build_provenance([
            "MultimodalTimelineEngine",
            "CorrelationEngine",
            "ConfoundEngine",
            "MissingDataEngine",
            "HypothesisRankingEngine",
            "EvidenceLinkingEngine",
            "SafetyGovernance",
        ])

        # --- Assemble snapshot ---
        snapshot = DeepTwinSnapshot(
            patient_id=patient_id,
            modality_coverage=modality_coverage,
            recency_status=recency_status,
            data_quality_flags=[q.to_dict() for q in quality_flags],
            timeline_events=[e.to_dict() for e in timeline_events],
            correlation_findings=[c.to_dict() for c in correlations],
            confounders=[c.to_dict() for c in confounders],
            ranked_hypotheses=[h.to_dict() for h in hypotheses],
            evidence_links=self._collect_evidence_links(all_insights),
            uncertainty_drivers=uncertainty_drivers,
            forecast_status=self.FORECAST_UNAVAILABLE,
            provenance=provenance,
            safety_disclaimer=self.SAFETY_DISCLAIMER,
        )

        return snapshot

    # ------------------------------------------------------------------
    # Modality analysis helpers
    # ------------------------------------------------------------------

    def get_modality_coverage(
        self,
        events: List[MultimodalEvent],
    ) -> Dict[str, bool]:
        """Compute coverage map for all 18 canonical modalities.

        Returns a dict mapping each modality name to ``True`` if at least
        one event of that modality is present, else ``False``.
        """
        present = {e.modality for e in events}
        return {mod: mod in present for mod in self.ALL_MODALITIES}

    def get_recency_status(
        self,
        events: List[MultimodalEvent],
    ) -> Dict[str, str]:
        """Classify each of the 18 modalities by data recency.

        Classifications
        ---------------
        "fresh"   : most recent event < 14 days old
        "stale"   : most recent event 14–90 days old
        "old"     : most recent event > 90 days old
        "missing" : no events for this modality
        """
        now = datetime.now()
        # Gather latest timestamp per modality
        latest: Dict[str, datetime] = {}
        for e in events:
            ts = e.timestamp
            if ts.tzinfo:
                ts = ts.replace(tzinfo=None)
            if e.modality not in latest or ts > latest[e.modality]:
                latest[e.modality] = ts

        status: Dict[str, str] = {}
        for mod in self.ALL_MODALITIES:
            if mod not in latest:
                status[mod] = "missing"
                continue
            age_days = (now - latest[mod]).days
            if age_days < self.FRESH_THRESHOLD:
                status[mod] = "fresh"
            elif age_days <= self.STALE_THRESHOLD:
                status[mod] = "stale"
            else:
                status[mod] = "old"
        return status

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _collect_uncertainty_drivers(
        self,
        correlations: List[IntelligenceOutput],
        confounders: List[IntelligenceOutput],
        hypotheses: List[IntelligenceOutput],
        quality_flags: List[IntelligenceOutput],
    ) -> List[str]:
        """Aggregate uncertainty drivers from all engine outputs.

        De-duplicates while preserving order. Adds default drivers if
        the combined set would otherwise be empty.
        """
        seen: set = set()
        drivers: List[str] = []
        for insight in correlations + confounders + hypotheses + quality_flags:
            for d in insight.uncertainty_drivers:
                if d not in seen:
                    seen.add(d)
                    drivers.append(d)
        if not drivers:
            drivers = [
                "Limited multimodal data available",
                "Temporal association only — no causal inference",
                "Clinician review required for all hypotheses",
            ]
        return drivers

    def _collect_evidence_links(
        self,
        insights: List[IntelligenceOutput],
    ) -> List[Dict[str, Any]]:
        """Flatten evidence links from all insights into serializable dicts."""
        links: List[Dict[str, Any]] = []
        seen_ids: set = set()
        for insight in insights:
            for ev in insight.evidence_links:
                ev_dict = dict(ev) if isinstance(ev, dict) else ev
                ev_id = ev_dict.get("evidence_id", "")
                if ev_id and ev_id in seen_ids:
                    continue
                if ev_id:
                    seen_ids.add(ev_id)
                links.append(ev_dict)
        return links

    def _build_provenance(
        self,
        engine_names: List[str],
    ) -> Dict[str, Any]:
        """Build provenance metadata tracking which engines ran and when.

        Parameters
        ----------
        engine_names : list[str]
            Human-readable names of engines that executed.

        Returns
        -------
        dict
            Contains ``engines``, ``timestamp``, ``version``, and
            ``safety_governance_applied``.
        """
        return {
            "engines": engine_names,
            "timestamp": datetime.now().isoformat(),
            "version": "4.0.0",
            "safety_governance_applied": True,
            "forecast_policy": "never_faked",
            "causal_language_policy": "temporal_association_only",
        }
