"""Chronological multimodal event timeline — association-oriented summaries only."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Iterator
from datetime import datetime

from deeptwin_neuroai_lab.modality_registry import MODALITY_REGISTRY
from deeptwin_neuroai_lab.schemas import Modality, PatientDataEvent


ASSOCIATION_NOTICE = (
    "Patterns describe temporal co-occurrence or observed association; "
    "they are hypotheses for clinician review and do not imply causation."
)


class EventTimeline:
    """In-memory timeline for research previews."""

    def __init__(self, events: Iterable[PatientDataEvent] | None = None) -> None:
        self._events: dict[str, PatientDataEvent] = {}
        if events:
            for ev in events:
                self.add_event(ev)

    def add_event(self, event: PatientDataEvent) -> None:
        self._events[event.event_id] = event

    def remove_event(self, event_id: str) -> bool:
        if event_id in self._events:
            del self._events[event_id]
            return True
        return False

    def list_events(self) -> list[PatientDataEvent]:
        return list(self._events.values())

    def filter_by_modality(self, modality: Modality) -> list[PatientDataEvent]:
        return [e for e in self._events.values() if e.modality == modality]

    def filter_by_date_range(
        self,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[PatientDataEvent]:
        out: list[PatientDataEvent] = []
        for e in self._events.values():
            if start is not None and e.timestamp < start:
                continue
            if end is not None and e.timestamp > end:
                continue
            out.append(e)
        return out

    def group_by_modality(self) -> dict[Modality, list[PatientDataEvent]]:
        g: dict[Modality, list[PatientDataEvent]] = defaultdict(list)
        for e in self._events.values():
            g[e.modality].append(e)
        for k in g:
            g[k].sort(key=lambda x: x.timestamp)
        return dict(g)

    def sort_chronologically(self) -> list[PatientDataEvent]:
        return sorted(self._events.values(), key=lambda e: e.timestamp)

    def iter_chronological(self) -> Iterator[PatientDataEvent]:
        yield from self.sort_chronologically()

    def create_patient_timeline_summary(self, patient_id: str | None = None) -> dict:
        """Human-readable phases — narrative hints only, not causal interpretation."""
        events = [
            e for e in self.sort_chronologically() if patient_id is None or e.patient_id == patient_id
        ]
        phases: list[dict] = []
        for e in events:
            label = _phase_label(e)
            phases.append(
                {
                    "timestamp": e.timestamp.isoformat(),
                    "modality": e.modality.value,
                    "label": label,
                    "event_id": e.event_id,
                    "association_notice": ASSOCIATION_NOTICE,
                }
            )
        return {
            "patient_id": patient_id,
            "event_count": len(events),
            "phases": phases,
            "wording": {
                "association": ASSOCIATION_NOTICE,
                "hypothesis": "Hypotheses require clinician review and sufficient evidence.",
            },
        }

    def detect_missing_modalities(self, desired: Iterable[Modality] | None = None) -> list[Modality]:
        present = {e.modality for e in self._events.values()}
        want = list(desired) if desired is not None else list(MODALITY_REGISTRY.keys())
        return [m for m in want if m not in present]

    def produce_dashboard_series(self) -> list[dict]:
        """Point series for charts — time vs modality category."""
        series: list[dict] = []
        for e in self.sort_chronologically():
            series.append(
                {
                    "t": e.timestamp.isoformat(),
                    "modality": e.modality.value,
                    "event_id": e.event_id,
                    "source": e.source,
                }
            )
        return series


def _phase_label(e: PatientDataEvent) -> str:
    if e.modality == Modality.intervention and e.intervention:
        return f"Intervention session ({e.intervention.intervention_type.value})"
    if e.modality == Modality.outcome_score or e.modality == Modality.assessment:
        return "Outcome / assessment checkpoint"
    if e.modality in (Modality.qeeg, Modality.eeg):
        return "EEG / qEEG recording"
    if e.modality == Modality.mri:
        return "MRI reference"
    if e.modality == Modality.clinical_note:
        return "Clinician note"
    if e.modality == Modality.biometric:
        return "Biometric observation"
    if e.modality == Modality.video:
        return "Video observation"
    if e.modality in (Modality.voice, Modality.audio):
        return "Voice / audio observation"
    return f"{e.modality.value} event"
