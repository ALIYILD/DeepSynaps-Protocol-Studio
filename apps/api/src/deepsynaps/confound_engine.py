"""ConfoundEngine — detects possible confounders that may explain observed clinical patterns."""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from contracts import ConfounderCandidate, IntelligenceOutput, MultimodalEvent
from knowledge_layer import KnowledgeLayer
from safety_governance import SafetyGovernance


class ConfoundEngine:
    """Detects potential confounders that could distort interpretation of clinical signals."""

    def __init__(self, knowledge_layer: KnowledgeLayer):
        self.kl = knowledge_layer

    def detect_confounders(
        self,
        patient_id: str,
        context_events: Optional[List[MultimodalEvent]] = None,
    ) -> List[IntelligenceOutput]:
        """Detect possible confounders for a patient's clinical observations.

        Parameters
        ----------
        patient_id: str
            Patient identifier.
        context_events: list of MultimodalEvent, optional
            Pre-fetched events to analyze. If None, fetched from knowledge layer.

        Returns
        -------
        List[IntelligenceOutput]
            One IntelligenceOutput per detected confounder category with evidence.
        """
        events = context_events or self.kl.get_events_for_patient(patient_id)
        now = datetime.now(timezone.utc)

        outputs: List[IntelligenceOutput] = []

        # Run each confound detection rule
        outputs.extend(self._check_medication_changes(events, patient_id, now))
        outputs.extend(self._check_poor_sleep(events, patient_id, now))
        outputs.extend(self._check_missed_sessions(events, patient_id, now))
        outputs.extend(self._check_adverse_events(events, patient_id, now))
        outputs.extend(self._check_infection_inflammation(events, patient_id, now))
        outputs.extend(self._check_nutrition_abnormalities(events, patient_id, now))
        outputs.extend(self._check_data_gaps(events, patient_id, now))
        outputs.extend(self._check_poor_quality(events, patient_id, now))
        outputs.extend(self._check_missing_assessments(events, patient_id, now))
        outputs.extend(self._check_stale_data(events, patient_id, now))
        outputs.extend(self._check_low_adherence(events, patient_id, now))
        outputs.extend(self._check_changed_parameters(events, patient_id, now))

        # Apply safety governance
        outputs = SafetyGovernance.apply_all(outputs)
        outputs.sort(key=lambda o: o.confidence, reverse=True)
        return outputs

    # ------------------------------------------------------------------
    # 1. Medication changes
    # ------------------------------------------------------------------

    def _check_medication_changes(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        med_events = [e for e in events if e.modality == "medications"]
        outputs = []
        for evt in med_events:
            evt_age_days = (now - evt.timestamp).total_seconds() / 86400.0
            if evt_age_days > 90:
                continue
            conf = ConfounderCandidate(
                confounder_type="medication_changes",
                description=f"Medication change detected: {evt.value_summary} ({evt.timestamp.date()}). "
                            f"This may affect symptoms, side effects, or biomarkers.",
                severity="high" if evt_age_days < 14 else "moderate",
                evidence_events=[evt.event_id],
                impact_estimate="May confound symptom and biomarker interpretation for 2-6 weeks after change.",
                mitigation_suggestion="Stratify analysis by pre/post medication change periods. "
                                       "Monitor for dose-dependent effects.",
            )
            outputs.append(self._confounder_to_intelligence(conf, patient_id, ["medications"], evt.timestamp))
        return outputs

    # ------------------------------------------------------------------
    # 2. Poor sleep
    # ------------------------------------------------------------------

    def _check_poor_sleep(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        wearables = [e for e in events if e.modality == "wearables"]
        poor_sleep_events = []
        for evt in wearables:
            eff = evt.numeric_features.get("sleep_efficiency", 1.0)
            total = evt.numeric_features.get("total_sleep_min", 480.0)
            if isinstance(eff, (int, float)) and eff < 0.75:
                poor_sleep_events.append(evt)
            elif isinstance(total, (int, float)) and total < 360:
                poor_sleep_events.append(evt)

        if not poor_sleep_events:
            return []

        earliest = min(e.timestamp for e in poor_sleep_events)
        latest = max(e.timestamp for e in poor_sleep_events)
        conf = ConfounderCandidate(
            confounder_type="poor_sleep",
            description=f"Poor sleep quality detected in {len(poor_sleep_events)} wearable records "
                        f"(efficiency <75% or total sleep <6h). Latest: {latest.date()}.",
            severity="moderate",
            evidence_events=[e.event_id for e in poor_sleep_events],
            impact_estimate="Sleep disruption can affect mood, cognition, and biomarker levels.",
            mitigation_suggestion="Include sleep quality as covariate. Consider sleep-focused intervention.",
        )
        return [self._confounder_to_intelligence(conf, patient_id, ["wearables"], earliest, latest)]

    # ------------------------------------------------------------------
    # 3. Missed sessions
    # ------------------------------------------------------------------

    def _check_missed_sessions(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        sessions = sorted(
            [e for e in events if e.modality in ("interventions", "sessions")],
            key=lambda e: e.timestamp,
        )
        if len(sessions) < 2:
            return []

        gap_events = []
        for i in range(1, len(sessions)):
            gap_days = (sessions[i].timestamp - sessions[i - 1].timestamp).total_seconds() / 86400.0
            if gap_days > 10:
                gap_events.append((sessions[i - 1], sessions[i], gap_days))

        if not gap_events:
            return []

        conf = ConfounderCandidate(
            confounder_type="missed_sessions",
            description=f"Detected {len(gap_events)} gap(s) >10 days between scheduled sessions. "
                        f"Largest gap: {max(g[2] for g in gap_events):.0f} days.",
            severity="moderate",
            evidence_events=[e.event_id for g in gap_events for e in [g[0], g[1]]],
            impact_estimate="Missed sessions may reduce intervention efficacy and confound outcome assessment.",
            mitigation_suggestion="Track attendance as covariate. Consider per-protocol vs ITT analysis.",
        )
        return [self._confounder_to_intelligence(
            conf, patient_id, ["interventions", "sessions"], gap_events[0][0].timestamp, gap_events[-1][1].timestamp
        )]

    # ------------------------------------------------------------------
    # 4. Adverse events
    # ------------------------------------------------------------------

    def _check_adverse_events(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        ae_keywords = ["adverse", "side effect", "headache", "nausea", "dizziness",
                       "fatigue", "pain", "discomfort", "tolerating"]
        ae_events = []
        for evt in events:
            summary_lower = (evt.value_summary or "").lower()
            text_lower = (evt.textual_summary or "").lower()
            combined = summary_lower + " " + text_lower
            if any(kw in combined for kw in ae_keywords):
                evt_age_days = (now - evt.timestamp).total_seconds() / 86400.0
                if evt_age_days < 90:
                    ae_events.append(evt)

        if not ae_events:
            return []

        earliest = min(e.timestamp for e in ae_events)
        latest = max(e.timestamp for e in ae_events)
        conf = ConfounderCandidate(
            confounder_type="adverse_events",
            description=f"Detected {len(ae_events)} potential adverse event reference(s) in recent records. "
                        f"Latest: {ae_events[-1].value_summary}",
            severity="high",
            evidence_events=[e.event_id for e in ae_events],
            impact_estimate="Adverse events may lead to medication changes, dose reductions, or dropout.",
            mitigation_suggestion="Review adverse event chronology relative to medication changes and symptom shifts.",
        )
        return [self._confounder_to_intelligence(conf, patient_id, ["medications", "patient_checkins"], earliest, latest)]

    # ------------------------------------------------------------------
    # 5. Infection / inflammation
    # ------------------------------------------------------------------

    def _check_infection_inflammation(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        lab_events = [e for e in events if e.modality in ("labs", "biomarkers")]
        inflam_events = []
        for evt in lab_events:
            crp = evt.numeric_features.get("crp_mg_l", 0)
            wbc = evt.numeric_features.get("wbc_k_ul", 0)
            if isinstance(crp, (int, float)) and crp > 3.0:
                inflam_events.append(evt)
            elif isinstance(wbc, (int, float)) and wbc > 10.0:
                inflam_events.append(evt)

        if not inflam_events:
            return []

        earliest = min(e.timestamp for e in inflam_events)
        latest = max(e.timestamp for e in inflam_events)
        conf = ConfounderCandidate(
            confounder_type="infection_inflammation",
            description=f"Elevated inflammatory markers in {len(inflam_events)} lab record(s). "
                        f"CRP or WBC above normal thresholds.",
            severity="high",
            evidence_events=[e.event_id for e in inflam_events],
            impact_estimate="Systemic inflammation can affect mood, cognition, and sleep architecture.",
            mitigation_suggestion="Consider inflammatory markers as covariates. Rule out acute infection.",
        )
        return [self._confounder_to_intelligence(conf, patient_id, ["labs", "biomarkers"], earliest, latest)]

    # ------------------------------------------------------------------
    # 6. Nutrition abnormalities
    # ------------------------------------------------------------------

    def _check_nutrition_abnormalities(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        lab_events = [e for e in events if e.modality in ("labs", "biomarkers")]
        nutri_events = []
        for evt in lab_events:
            vit_d = evt.numeric_features.get("vitamin_d_ng_ml", None)
            b12 = evt.numeric_features.get("b12_pg_ml", None)
            if isinstance(vit_d, (int, float)) and vit_d < 20:
                nutri_events.append(evt)
            elif isinstance(b12, (int, float)) and b12 < 200:
                nutri_events.append(evt)

        if not nutri_events:
            return []

        earliest = min(e.timestamp for e in nutri_events)
        latest = max(e.timestamp for e in nutri_events)
        conf = ConfounderCandidate(
            confounder_type="nutrition_abnormalities",
            description=f"Nutritional deficiency indicators in {len(nutri_events)} lab record(s). "
                        f"Vitamin D <20 ng/mL or B12 <200 pg/mL detected.",
            severity="moderate",
            evidence_events=[e.event_id for e in nutri_events],
            impact_estimate="Nutritional deficiencies can contribute to fatigue, mood disturbance, and cognitive symptoms.",
            mitigation_suggestion="Consider supplementation and re-test. Include nutrition status in interpretation.",
        )
        return [self._confounder_to_intelligence(conf, patient_id, ["labs", "biomarkers"], earliest, latest)]

    # ------------------------------------------------------------------
    # 7. Data gaps
    # ------------------------------------------------------------------

    def _check_data_gaps(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        gap_mods = ["wearables", "qeeg", "mri", "assessments"]
        outputs = []
        for mod in gap_mods:
            mod_events = sorted([e for e in events if e.modality == mod], key=lambda e: e.timestamp)
            if not mod_events:
                conf = ConfounderCandidate(
                    confounder_type="data_gaps",
                    description=f"No {mod} data available for this patient at all.",
                    severity="high" if mod in ("qeeg", "mri") else "moderate",
                    evidence_events=[],
                    impact_estimate=f"Missing {mod} data limits multimodal interpretation and may bias conclusions.",
                    mitigation_suggestion=f"Schedule {mod} data collection to fill the gap.",
                )
                outputs.append(self._confounder_to_intelligence(conf, patient_id, [mod], now - timedelta(days=30), now))
                continue

            # Check for gaps >21 days between consecutive events
            for i in range(1, len(mod_events)):
                gap_days = (mod_events[i].timestamp - mod_events[i - 1].timestamp).total_seconds() / 86400.0
                if gap_days > 21:
                    conf = ConfounderCandidate(
                        confounder_type="data_gaps",
                        description=f"{mod} data gap of {gap_days:.0f} days between "
                                    f"{mod_events[i-1].timestamp.date()} and {mod_events[i].timestamp.date()}.",
                        severity="moderate",
                        evidence_events=[mod_events[i - 1].event_id, mod_events[i].event_id],
                        impact_estimate=f"Missing {mod} data during this period may obscure important clinical changes.",
                        mitigation_suggestion=f"Review why {mod} data collection lapsed. Consider imputation sensitivity analysis.",
                    )
                    outputs.append(self._confounder_to_intelligence(
                        conf, patient_id, [mod], mod_events[i - 1].timestamp, mod_events[i].timestamp
                    ))
        return outputs

    # ------------------------------------------------------------------
    # 8. Poor data quality
    # ------------------------------------------------------------------

    def _check_poor_quality(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        recent = [e for e in events if (now - e.timestamp).total_seconds() / 86400.0 < 30]
        poor = [e for e in recent if e.data_quality in ("low", "missing")]
        if not poor:
            return []

        conf = ConfounderCandidate(
            confounder_type="poor_quality",
            description=f"{len(poor)} recent event(s) with low or missing data quality in past 30 days.",
            severity="moderate",
            evidence_events=[e.event_id for e in poor],
            impact_estimate="Low quality data may introduce noise or bias into temporal analysis.",
            mitigation_suggestion="Flag low-quality records in downstream analysis. Consider sensitivity analysis excluding them.",
        )
        return [self._confounder_to_intelligence(
            conf, patient_id, list({e.modality for e in poor}), poor[0].timestamp, poor[-1].timestamp
        )]

    # ------------------------------------------------------------------
    # 9. Missing assessments
    # ------------------------------------------------------------------

    def _check_missing_assessments(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        assessments = [e for e in events if e.modality == "assessments"]
        if not assessments:
            conf = ConfounderCandidate(
                confounder_type="missing_assessments",
                description="No formal assessments recorded for this patient in the past 90 days.",
                severity="high",
                evidence_events=[],
                impact_estimate="Without recent assessments, clinical status changes may go undetected.",
                mitigation_suggestion="Schedule comprehensive assessment battery within 2 weeks.",
            )
            return [self._confounder_to_intelligence(conf, patient_id, ["assessments"], now - timedelta(days=90), now)]

        latest = max(e.timestamp for e in assessments)
        days_since = (now - latest).total_seconds() / 86400.0
        if days_since > 90:
            conf = ConfounderCandidate(
                confounder_type="missing_assessments",
                description=f"No assessment in past 90 days. Latest assessment was {days_since:.0f} days ago on {latest.date()}.",
                severity="high",
                evidence_events=[e.event_id for e in assessments if e.timestamp == latest],
                impact_estimate="Long gap since last assessment limits ability to track clinical trajectory.",
                mitigation_suggestion="Schedule follow-up assessment to re-establish clinical baseline.",
            )
            return [self._confounder_to_intelligence(conf, patient_id, ["assessments"], latest, now)]
        return []

    # ------------------------------------------------------------------
    # 10. Stale data
    # ------------------------------------------------------------------

    def _check_stale_data(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        if not events:
            conf = ConfounderCandidate(
                confounder_type="stale_data",
                description="No events at all for this patient in the past 30 days.",
                severity="high",
                evidence_events=[],
                impact_estimate="Completely absent data stream prevents any clinical monitoring.",
                mitigation_suggestion="Review patient engagement. Re-establish data collection pipeline.",
            )
            return [self._confounder_to_intelligence(conf, patient_id, ["all"], now - timedelta(days=30), now)]

        latest = max(e.timestamp for e in events)
        days_since = (now - latest).total_seconds() / 86400.0
        if days_since > 30:
            conf = ConfounderCandidate(
                confounder_type="stale_data",
                description=f"No new events in past 30 days. Latest event was {days_since:.0f} days ago on {latest.date()}.",
                severity="high",
                evidence_events=[e.event_id for e in events if e.timestamp == latest],
                impact_estimate="Stale data may miss recent clinical changes or acute events.",
                mitigation_suggestion="Investigate data stream interruption. Contact patient if dropout suspected.",
            )
            return [self._confounder_to_intelligence(conf, patient_id, [e.modality for e in events if e.timestamp == latest], latest, now)]
        return []

    # ------------------------------------------------------------------
    # 11. Low adherence
    # ------------------------------------------------------------------

    def _check_low_adherence(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        checkins = sorted([e for e in events if e.modality == "patient_checkins"], key=lambda e: e.timestamp)
        gap_events = []
        for i in range(1, len(checkins)):
            gap_days = (checkins[i].timestamp - checkins[i - 1].timestamp).total_seconds() / 86400.0
            if gap_days > 14:
                gap_events.append((checkins[i - 1], checkins[i], gap_days))

        outputs = []
        if gap_events:
            conf = ConfounderCandidate(
                confounder_type="low_adherence",
                description=f"{len(gap_events)} gap(s) >14 days between patient check-ins. "
                            f"Largest gap: {max(g[2] for g in gap_events):.0f} days.",
                severity="moderate",
                evidence_events=[e.event_id for g in gap_events for e in [g[0], g[1]]],
                impact_estimate="Low adherence may reduce treatment efficacy and obscure true signal.",
                mitigation_suggestion="Engage patient to improve check-in regularity. Review barriers to adherence.",
            )
            outputs.append(self._confounder_to_intelligence(
                conf, patient_id, ["patient_checkins"], gap_events[0][0].timestamp, gap_events[-1][1].timestamp
            ))

        # Also check medication-related events for adherence signals
        med_events = [e for e in events if e.modality == "medications"]
        if len(med_events) >= 2:
            # Check for irregular refill patterns (simplified)
            last_two = sorted(med_events, key=lambda e: e.timestamp)[-2:]
            gap = (last_two[1].timestamp - last_two[0].timestamp).total_seconds() / 86400.0
            if gap > 35:
                conf = ConfounderCandidate(
                    confounder_type="low_adherence",
                    description=f"Medication refill gap of {gap:.0f} days detected, suggesting possible non-adherence.",
                    severity="high",
                    evidence_events=[e.event_id for e in last_two],
                    impact_estimate="Medication non-adherence may explain lack of treatment response.",
                    mitigation_suggestion="Review pharmacy records. Discuss adherence barriers with patient.",
                )
                outputs.append(self._confounder_to_intelligence(
                    conf, patient_id, ["medications"], last_two[0].timestamp, last_two[1].timestamp
                ))
        return outputs

    # ------------------------------------------------------------------
    # 12. Changed parameters
    # ------------------------------------------------------------------

    def _check_changed_parameters(
        self, events: List[MultimodalEvent], patient_id: str, now: datetime
    ) -> List[IntelligenceOutput]:
        param_events = [e for e in events if e.modality in ("interventions", "sessions", "qeeg")]
        # Look for events that mention parameter changes
        change_keywords = ["parameter", "protocol", "adjusted", "changed", "modified", "updated", "titrated"]
        changed = []
        for evt in param_events:
            combined = ((evt.value_summary or "") + " " + (evt.textual_summary or "")).lower()
            if any(kw in combined for kw in change_keywords):
                evt_age_days = (now - evt.timestamp).total_seconds() / 86400.0
                if evt_age_days < 90:
                    changed.append(evt)

        if not changed:
            return []

        earliest = min(e.timestamp for e in changed)
        latest = max(e.timestamp for e in changed)
        conf = ConfounderCandidate(
            confounder_type="changed_parameters",
            description=f"{len(changed)} device or protocol parameter change(s) detected in past 90 days.",
            severity="moderate",
            evidence_events=[e.event_id for e in changed],
            impact_estimate="Parameter changes may alter signal characteristics and confound longitudinal comparisons.",
            mitigation_suggestion="Stratify analysis by parameter epoch. Document all changes with timestamps.",
        )
        return [self._confounder_to_intelligence(conf, patient_id, ["interventions", "sessions", "qeeg"], earliest, latest)]

    # ------------------------------------------------------------------
    # Helper: convert ConfounderCandidate to IntelligenceOutput
    # ------------------------------------------------------------------

    def _confounder_to_intelligence(
        self,
        confounder: ConfounderCandidate,
        patient_id: str,
        modalities: List[str],
        window_start: datetime,
        window_end: Optional[datetime] = None,
    ) -> IntelligenceOutput:
        """Convert a ConfounderCandidate into a full IntelligenceOutput."""
        if window_end is None:
            window_end = window_start + timedelta(days=7)

        # Severity-based confidence mapping (capped < 0.95)
        severity_score = {"high": 0.85, "moderate": 0.65, "low": 0.45}.get(confounder.severity, 0.5)

        summary = (
            f"Possible confounder detected: {confounder.confounder_type} — {confounder.description} "
            f"Severity: {confounder.severity}. "
            f"{confounder.impact_estimate} "
            f"Mitigation: {confounder.mitigation_suggestion} "
            f"Possible contributor. Requires clinician review."
        )

        return IntelligenceOutput(
            patient_id=patient_id,
            insight_type="confound",
            modalities_involved=modalities,
            timeline_window=(window_start, window_end),
            summary=summary,
            supporting_events=confounder.evidence_events,
            conflicting_events=[],
            confounders=[confounder.to_dict()],
            evidence_links=[],
            confidence=severity_score,
            uncertainty_drivers=[
                "confounder detection based on heuristic rules",
                "other unmeasured confounders may exist",
                "causal role not established — association only",
                "clinical judgment required to assess relevance",
            ],
            research_only=True,
            clinician_review_required=True,
            safety_labels=[
                "Possible contributor. Requires clinician review.",
                "Decision support only. Requires clinician review.",
            ],
        )
