"""
Adverse Event Bridge
====================
Bridge connecting FAERS and OnSIDES adapters to the Medication Analyzer.

Provides unified adverse-event intelligence with MANDATORY governance caveats:
  - Reporting data, NOT incidence data
  - Association signals, NOT causation
  - Always research-only
  - Never present report counts as risk percentages

Every response carries explicit disclaimers that spontaneous reporting data
cannot establish causation, incidence, or relative risk. Signal detection
statistics (PRR, ROR) are exploratory disproportionality measures only.

Author: DeepSynaps Protocol Studio / PHASE 2 Knowledge Layer
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Final, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class ConfidenceTier(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    RESEARCH = "research"


class EvidenceLevel(str, Enum):
    META_ANALYSIS = "A"
    RCT = "B"
    OBSERVATIONAL = "C"
    PILOT_EXPERT = "D"


# ---------------------------------------------------------------------------
# Constants — mandatory caveats applied to EVERY response
# ---------------------------------------------------------------------------

MANDATORY_CAVEATS: Final[List[str]] = [
    "FAERS is a spontaneous reporting database, not an incidence database",
    "Report counts do not indicate causation or relative risk",
    "OnSIDES captures label-reported associations, not proven causal relationships",
    "All adverse event data is research-only and requires clinical correlation",
    "Reporting bias, stimulated reporting, and underreporting affect all signals",
    "PRR and ROR are disproportionality metrics, not measures of causation",
    "Signal detection is exploratory; independent verification is always required",
]

RESEARCH_ONLY_FLAG: Final[bool] = True

RESEARCH_ONLY_REASON: Final[str] = (
    "Adverse event data from spontaneous reporting systems and label extractions "
    "cannot establish causation or incidence. All findings require independent "
    "clinical validation through controlled studies."
)

# Data source–specific disclaimers
FAERS_DISCLAIMER: Final[str] = (
    "FAERS data reflect voluntary reporting patterns, not population incidence. "
    "Increased report counts may result from increased awareness, media coverage, "
    "or stimulated reporting rather than true changes in event frequency."
)

ONSIDES_DISCLAIMER: Final[str] = (
    "OnSIDES extracts drug-event pairs from FDA product labels using NLP. These "
    "represent label-reported associations from clinical trials and post-marketing "
    "surveillance, not proven causal relationships or population incidence rates."
)

SIGNAL_DISCLAIMER: Final[str] = (
    "PRR (Proportional Reporting Ratio) and ROR (Reporting Odds Ratio) are "
    "disproportionality statistics computed from spontaneous report counts. They "
    "detect reporting patterns that differ from background, but do NOT measure "
    "causation, relative risk, or attributable risk. A high PRR/ROR requires "
    "confirmation through pharmacoepidemiologic studies."
)


# ---------------------------------------------------------------------------
# Response envelope
# ---------------------------------------------------------------------------

@dataclass
class AdverseEventResponse:
    """Standardized adverse event response with embedded governance."""

    query_drug: str
    query_event: Optional[str] = None
    data_sources: List[str] = field(default_factory=list)
    faers_results: List[Dict[str, Any]] = field(default_factory=list)
    onsides_results: List[Dict[str, Any]] = field(default_factory=list)
    signal_metrics: Optional[Dict[str, Any]] = None
    combined_profile: Dict[str, Any] = field(default_factory=dict)
    caveats: List[str] = field(default_factory=lambda: list(MANDATORY_CAVEATS))
    research_only: bool = True
    research_only_reason: str = RESEARCH_ONLY_REASON
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "query": {"drug": self.query_drug, "event": self.query_event},
            "data_sources": self.data_sources,
            "faers_results": self.faers_results,
            "onsides_results": self.onsides_results,
            "signal_metrics": self.signal_metrics,
            "combined_profile": self.combined_profile,
            "_governance": {
                "caveats": self.caveats,
                "research_only": self.research_only,
                "research_only_reason": self.research_only_reason,
            },
            "generated_at": self.generated_at.isoformat(),
        }


# ---------------------------------------------------------------------------
# Stub registry interface (resolved at runtime via actual registry)
# ---------------------------------------------------------------------------

class _StubRegistry:
    """Placeholder registry for type hints; actual registry is injected at runtime."""

    def get(self, name: str) -> Any:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Adverse Event Bridge
# ---------------------------------------------------------------------------

class AdverseEventBridge:
    """Bridge connecting FAERS/OnSIDES adapters to the Medication Analyzer.

    Provides adverse-event intelligence with MANDATORY caveats:
      - Reporting data, not incidence
      - Association signals, not causation
      - Always research-only

    Usage:
        bridge = AdverseEventBridge(registry)
        events = await bridge.get_drug_adverse_events("warfarin")
        signals = await bridge.check_safety_signals("warfarin", "bleeding")
        profile = await bridge.get_side_effect_profile("metformin")
    """

    def __init__(self, registry: Any) -> None:
        """Initialize bridge with adapter registry.

        Args:
            registry: AdapterRegistry instance providing 'faers' and 'onsides' adapters.
        """
        self._registry = registry
        self._faers: Any = None
        self._onsides: Any = None
        self._resolved = False

    async def _resolve_adapters(self) -> None:
        """Lazy-resolve adapters from registry."""
        if self._resolved:
            return
        try:
            self._faers = self._registry.get("faers")
        except Exception as exc:
            logger.warning("FAERS adapter not available: %s", exc)
        try:
            self._onsides = self._registry.get("onsides")
        except Exception as exc:
            logger.warning("OnSIDES adapter not available: %s", exc)
        self._resolved = True

    # -- Public API -------------------------------------------------------

    async def get_drug_adverse_events(
        self,
        drug_name: str,
        include_faers: bool = True,
        include_onsides: bool = True,
        faers_limit: int = 25,
        onsides_limit: int = 100,
        min_onsides_probability: Optional[float] = None,
    ) -> Dict[str, Any]:
        """Get adverse events for a drug with MANDATORY caveats.

        Queries both FAERS (report counts) and OnSIDES (label-derived events)
        and returns a unified, caveat-annotated response.

        Args:
            drug_name: Generic or brand drug name.
            include_faers: Whether to query FAERS report data.
            include_onsides: Whether to query OnSIDES label data.
            faers_limit: Maximum FAERS event types to return.
            onsides_limit: Maximum OnSIDES events to return.
            min_onsides_probability: Minimum NLP probability threshold.

        Returns:
            Dict containing adverse event data with mandatory governance envelope.
        """
        await self._resolve_adapters()

        response = AdverseEventResponse(query_drug=drug_name)
        data_sources: List[str] = []

        if include_faers and self._faers is not None:
            try:
                faers_events = await self._faers.get_drug_event_counts(drug_name, top_n=faers_limit)
                for ev in faers_events:
                    ev["_source_disclaimer"] = FAERS_DISCLAIMER
                response.faers_results = faers_events
                data_sources.append("FAERS")
            except Exception as exc:
                logger.error("FAERS query failed for '%s': %s", drug_name, exc)
                response.faers_results = [{"_error": f"FAERS query failed: {exc}"}]

        if include_onsides and self._onsides is not None:
            try:
                onsides_events = await self._onsides.get_drug_events(
                    drug_name=drug_name,
                    min_probability=min_onsides_probability,
                    limit=onsides_limit,
                )
                for ev in onsides_events:
                    ev["_source_disclaimer"] = ONSIDES_DISCLAIMER
                response.onsides_results = onsides_events
                data_sources.append("OnSIDES")
            except Exception as exc:
                logger.error("OnSIDES query failed for '%s': %s", drug_name, exc)
                response.onsides_results = [{"_error": f"OnSIDES query failed: {exc}"}]

        response.data_sources = data_sources
        response.combined_profile = self._build_combined_profile(
            response.faers_results, response.onsides_results, drug_name
        )

        result = response.to_dict()
        return self._add_mandatory_caveats(result)

    async def check_safety_signals(
        self,
        drug_name: str,
        event_term: str,
        include_prr: bool = True,
        include_ror: bool = True,
    ) -> Dict[str, Any]:
        """Check safety signals with PRR/ROR and confidence intervals.

        Calculates disproportionality metrics from FAERS data with explicit
        disclaimers that these are exploratory signals, not confirmatory evidence.

        Args:
            drug_name: Drug name to analyze.
            event_term: MedDRA Preferred Term for the adverse event.
            include_prr: Include PRR calculation.
            include_ror: Include ROR calculation.

        Returns:
            Dict with signal metrics and mandatory caveats.
        """
        await self._resolve_adapters()

        signal_data: Dict[str, Any] = {
            "query": {"drug": drug_name, "event": event_term},
            "signal_metrics": None,
            "interpretation": None,
        }

        if self._faers is None:
            signal_data["_error"] = "FAERS adapter not available for signal detection"
            return self._add_mandatory_caveats(signal_data)

        try:
            # Fetch drug-event counts from FAERS
            metrics = await self._faers.calculate_signal(drug_name, event_term)
            metrics_dict = metrics.to_dict()

            # Build human-readable interpretation with MANDATORY caveats
            interpretation_parts: List[str] = []

            if metrics.prr is not None:
                prr_note = f"PRR = {metrics.prr}"
                if metrics.prr_ci_lower and metrics.prr_ci_upper:
                    prr_note += f" (95% CI: {metrics.prr_ci_lower} - {metrics.prr_ci_upper})"
                if metrics.prr > 2 and (metrics.prr_ci_lower or 0) > 1:
                    prr_note += ". PRR > 2 with lower CI > 1 suggests a reporting signal."
                else:
                    prr_note += ". Does not meet PRR > 2 signal threshold."
                interpretation_parts.append(prr_note)

            if metrics.ror is not None:
                ror_note = f"ROR = {metrics.ror}"
                if metrics.ror_ci_lower and metrics.ror_ci_upper:
                    ror_note += f" (95% CI: {metrics.ror_ci_lower} - {metrics.ror_ci_upper})"
                if metrics.ror > 1 and (metrics.ror_ci_lower or 0) > 1:
                    ror_note += ". ROR > 1 with lower CI > 1 indicates disproportionality."
                else:
                    ror_note += ". No significant disproportionality detected."
                interpretation_parts.append(ror_note)

            if metrics.ic is not None:
                ic_note = f"Information Component (IC) = {metrics.ic}"
                if metrics.ic > 0:
                    ic_note += ". IC > 0 suggests the drug-event pair is reported more than expected."
                else:
                    ic_note += ". IC <= 0: no unexpected reporting pattern."
                interpretation_parts.append(ic_note)

            # CRITICAL: Add the signal disclaimer to EVERY interpretation
            interpretation_parts.append(SIGNAL_DISCLAIMER)

            # Add report count with correct framing
            if metrics.num_reports > 0:
                interpretation_parts.append(
                    f"{metrics.num_reports} spontaneous report(s) identified for {drug_name} + {event_term}. "
                    "This is a REPORT COUNT, not an incidence rate or risk percentage."
                )

            signal_data["signal_metrics"] = metrics_dict
            signal_data["interpretation"] = " ".join(interpretation_parts)
            signal_data["num_reports"] = metrics.num_reports
            signal_data["contingency_table"] = {
                "a_drug_and_event": metrics.a,
                "b_drug_not_event": metrics.b,
                "c_event_not_drug": metrics.c,
                "d_neither": metrics.d,
                "_note": "Contingency values are report counts from spontaneous reporting, not incidence data.",
            }

        except Exception as exc:
            logger.error("Signal calculation failed for %s/%s: %s", drug_name, event_term, exc)
            signal_data["_error"] = f"Signal calculation failed: {exc}"

        return self._add_mandatory_caveats(signal_data)

    async def get_side_effect_profile(
        self,
        drug_name: str,
        min_onsides_probability: Optional[float] = 0.5,
        faers_top_n: int = 25,
        onsides_limit: int = 100,
    ) -> Dict[str, Any]:
        """Get comprehensive side-effect profile from OnSIDES with caveats.

        Aggregates label-derived adverse events across all OnSIDES sections
        (adverse reactions, boxed warnings, warnings/precautions) and
        FAERS report counts, with mandatory governance annotations.

        Args:
            drug_name: Drug name to profile.
            min_onsides_probability: Minimum NLP extraction confidence.
            faers_top_n: Number of top FAERS events to include.
            onsides_limit: Maximum OnSIDES events per section.

        Returns:
            Dict with side-effect profile and mandatory caveats.
        """
        await self._resolve_adapters()

        profile: Dict[str, Any] = {
            "drug_name": drug_name,
            "profile_sections": {},
            "faers_summary": None,
            "onsides_summary": None,
            "consolidated_events": [],
        }

        # OnSIDES: query by label section
        if self._onsides is not None:
            onsides_all: List[Dict[str, Any]] = []
            for section_key, section_label in (
                ("adverse_reactions", "Adverse Reactions"),
                ("boxed_warnings", "Boxed Warnings"),
                ("warnings_precautions", "Warnings and Precautions"),
            ):
                try:
                    section_events = await self._onsides.get_by_label_section(
                        section=section_key, limit=onsides_limit
                    )
                    # Filter for specific drug if results are not pre-filtered
                    section_events = [
                        e for e in section_events
                        if drug_name.lower() in (e.get("drug_name") or "").lower()
                    ]
                    if min_onsides_probability:
                        section_events = [
                            e for e in section_events
                            if (e.get("probability_score") or 0) >= min_onsides_probability
                        ]
                    for ev in section_events:
                        ev["_source_disclaimer"] = ONSIDES_DISCLAIMER
                        ev["_label_section_display"] = section_label
                    profile["profile_sections"][section_label] = {
                        "event_count": len(section_events),
                        "events": section_events[:onsides_limit],
                        "_caveat": (
                            f"{len(section_events)} label-derived event(s) from '{section_label}' section. "
                            "These are NLP-extracted associations, not proven causation."
                        ),
                    }
                    onsides_all.extend(section_events)
                except Exception as exc:
                    logger.error("OnSIDES section query failed for %s/%s: %s", drug_name, section_key, exc)
                    profile["profile_sections"][section_label] = {"_error": str(exc)}

            profile["onsides_summary"] = {
                "total_events_found": len(onsides_all),
                "sections_queried": 3,
                "_caveat": ONSIDES_DISCLAIMER,
            }

        # FAERS: top reported events
        if self._faers is not None:
            try:
                faers_events = await self._faers.get_drug_event_counts(drug_name, top_n=faers_top_n)
                for ev in faers_events:
                    ev["_source_disclaimer"] = FAERS_DISCLAIMER
                profile["faers_summary"] = {
                    "top_events": faers_events,
                    "_caveat": FAERS_DISCLAIMER,
                }
            except Exception as exc:
                logger.error("FAERS profile query failed for '%s': %s", drug_name, exc)
                profile["faers_summary"] = {"_error": str(exc)}

        # Consolidated: unique events across sources
        profile["consolidated_events"] = self._consolidate_events(
            profile.get("faers_summary", {}).get("top_events", []),
            profile.get("onsides_summary", {}).get("total_events_found", 0),
        )

        return self._add_mandatory_caveats(profile)

    async def compare_drugs(
        self,
        drug_a: str,
        drug_b: str,
        event_term: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Compare adverse event patterns between two drugs.

        Performs parallel queries against both drugs and returns a
        comparison with MANDATORY caveats about non-comparability.

        Args:
            drug_a: First drug name.
            drug_b: Second drug name.
            event_term: Optional specific event to compare.

        Returns:
            Comparison dict with mandatory caveats.
        """
        await self._resolve_adapters()

        comparison: Dict[str, Any] = {
            "drug_a": drug_a,
            "drug_b": drug_b,
            "query_event": event_term,
            "drug_a_results": None,
            "drug_b_results": None,
        }

        # Parallel fetch
        tasks: List[Any] = []
        if event_term and self._faers is not None:
            tasks.append(self._faers.calculate_signal(drug_a, event_term))
            tasks.append(self._faers.calculate_signal(drug_b, event_term))
            try:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                if len(results) >= 2:
                    comparison["drug_a_results"] = (
                        results[0].to_dict() if hasattr(results[0], "to_dict") else {"_error": str(results[0])}
                    ) if not isinstance(results[0], Exception) else {"_error": str(results[0])}
                    comparison["drug_b_results"] = (
                        results[1].to_dict() if hasattr(results[1], "to_dict") else {"_error": str(results[1])}
                    ) if not isinstance(results[1], Exception) else {"_error": str(results[1])}
            except Exception as exc:
                comparison["_error"] = f"Comparison failed: {exc}"
        else:
            # General profile comparison
            try:
                a_events, b_events = await asyncio.gather(
                    self.get_drug_adverse_events(drug_a),
                    self.get_drug_adverse_events(drug_b),
                    return_exceptions=True,
                )
                comparison["drug_a_results"] = a_events if not isinstance(a_events, Exception) else {"_error": str(a_events)}
                comparison["drug_b_results"] = b_events if not isinstance(b_events, Exception) else {"_error": str(b_events)}
            except Exception as exc:
                comparison["_error"] = f"Comparison failed: {exc}"

        # CRITICAL comparison caveat
        comparison["_comparison_caveat"] = (
            "Direct comparison of spontaneous report counts between drugs is INVALID. "
            "Differences in report volumes may reflect differences in time on market, "
            "prescriber base size, media attention, or litigation patterns — not true "
            "differences in safety. Comparisons require pharmacoepidemiologic study design."
        )

        return self._add_mandatory_caveats(comparison)

    # -- Internal helpers -------------------------------------------------

    def _add_mandatory_caveats(self, response: Dict[str, Any]) -> Dict[str, Any]:
        """Add mandatory governance caveats to every response.

        This method is called on EVERY public-facing response to ensure
        adverse event data is never presented without proper context.
        """
        response["_governance"] = {
            "caveats": list(MANDATORY_CAVEATS),
            "research_only": RESEARCH_ONLY_FLAG,
            "research_only_reason": RESEARCH_ONLY_REASON,
            "confidence_tier": ConfidenceTier.RESEARCH.value,
            "evidence_level": EvidenceLevel.OBSERVATIONAL.value,
            "disclaimer": (
                "This response contains adverse event data from spontaneous reporting "
                "systems and/or label extraction. Such data CANNOT establish causation, "
                "incidence, or relative risk. All findings are research-only and require "
                "independent clinical validation."
            ),
        }
        response["generated_at"] = datetime.now(timezone.utc).isoformat()
        return response

    def _build_combined_profile(
        self,
        faers_results: List[Dict[str, Any]],
        onsides_results: List[Dict[str, Any]],
        drug_name: str,
    ) -> Dict[str, Any]:
        """Build a combined profile from FAERS and OnSIDES results."""
        # Extract unique event names from both sources
        faers_events: set = set()
        for ev in faers_results:
            if isinstance(ev, dict) and "adverse_event_meddra_pt" in ev:
                faers_events.add(ev["adverse_event_meddra_pt"])

        onsides_events: set = set()
        for ev in onsides_results:
            if isinstance(ev, dict) and "adverse_event_name" in ev:
                onsides_events.add(ev["adverse_event_name"])

        overlap = faers_events & onsides_events
        return {
            "drug_name": drug_name,
            "faers_event_count": len(faers_events),
            "onsides_event_count": len(onsides_events),
            "overlapping_events_count": len(overlap),
            "overlapping_events": sorted(overlap)[:50],
            "faers_unique_events": sorted(faers_events - onsides_events)[:50],
            "onsides_unique_events": sorted(onsides_events - faers_events)[:50],
            "_caveat": (
                f"FAERS: {len(faers_events)} event type(s); "
                f"OnSIDES: {len(onsides_events)} event type(s); "
                f"Overlap: {len(overlap)} event type(s). "
                "Event presence in either source does NOT indicate causation or incidence."
            ),
        }

    def _consolidate_events(
        self, faers_events: List[Dict[str, Any]], onsides_count: int
    ) -> List[Dict[str, Any]]:
        """Create a consolidated event list across sources."""
        consolidated: List[Dict[str, Any]] = []
        seen: set = set()

        for ev in faers_events:
            if not isinstance(ev, dict):
                continue
            pt = ev.get("adverse_event_meddra_pt") or ev.get("term")
            if pt and pt not in seen:
                seen.add(pt)
                consolidated.append({
                    "event_name": pt,
                    "sources": ["FAERS"],
                    "report_count": ev.get("report_count"),
                    "_note": ev.get("report_count_note", f"{ev.get('report_count', 0)} reports (NOT incidence)"),
                })

        if onsides_count > 0:
            consolidated.append({
                "_aggregated_from_onsides": True,
                "total_onsides_events": onsides_count,
                "sources": ["OnSIDES"],
                "_note": "See profile_sections for detailed OnSIDES events",
            })

        return consolidated

    # -- Health check -----------------------------------------------------

    async def health_check(self) -> Dict[str, Any]:
        """Check health of underlying adapters."""
        await self._resolve_adapters()

        status: Dict[str, Any] = {
            "bridge": "AdverseEventBridge",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "faers_available": self._faers is not None,
            "onsides_available": self._onsides is not None,
            "adapters": {},
        }

        if self._faers is not None:
            try:
                faers_health = await self._faers.health_check()
                status["adapters"]["faers"] = faers_health
            except Exception as exc:
                status["adapters"]["faers"] = {"_error": str(exc)}
        else:
            status["adapters"]["faers"] = {"_error": "Adapter not registered"}

        if self._onsides is not None:
            try:
                onsides_health = await self._onsides.health_check()
                status["adapters"]["onsides"] = onsides_health
            except Exception as exc:
                status["adapters"]["onsides"] = {"_error": str(exc)}
        else:
            status["adapters"]["onsides"] = {"_error": "Adapter not registered"}

        status["overall_healthy"] = all(
            v.get("connected", False) if isinstance(v, dict) else False
            for v in status["adapters"].values()
        )

        return self._add_mandatory_caveats(status)

    # -- String representation --------------------------------------------

    def __repr__(self) -> str:
        faers_ok = self._faers is not None if self._resolved else "unresolved"
        onsides_ok = self._onsides is not None if self._resolved else "unresolved"
        return f"AdverseEventBridge(faers={faers_ok}, onsides={onsides_ok})"


# Keep alias for backward compatibility
AdverseEventAnalyzerBridge = AdverseEventBridge
