"""Maps Video Analyzer task families to DeepSynaps evidence-registry context.

These links connect kinematic outputs to literature-backed condition axes in the
87k-paper intelligence surface (see apps/web/src/evidence-dataset.js). They do not
claim clinical validation of this pipeline — only where to find related evidence.
"""

from __future__ import annotations

from dataclasses import dataclass

# Mirrors EVIDENCE_DATASET_VERSION in evidence-dataset.js
EVIDENCE_REGISTRY_VERSION = "2026-04-24"
EVIDENCE_REGISTRY_TOTAL_PAPERS = 87000


@dataclass(frozen=True)
class TaskEvidenceLink:
    """One explainable bridge from an analyzer output to registry-backed literature."""

    task_family: str
    condition_id: str
    evidence_target_name: str
    context_type: str
    label: str
    paper_count: int
    rationale: str
    method_note: str
    example_citation: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "task_family": self.task_family,
            "condition_id": self.condition_id,
            "evidence_target_name": self.evidence_target_name,
            "context_type": self.context_type,
            "label": self.label,
            "paper_count": self.paper_count,
            "rationale": self.rationale,
            "method_note": self.method_note,
            "example_citation": self.example_citation,
        }


def registry_snapshot() -> dict[str, object]:
    return {
        "registry_total_papers": EVIDENCE_REGISTRY_TOTAL_PAPERS,
        "registry_version": EVIDENCE_REGISTRY_VERSION,
        "registry_label": "DeepSynaps evidence intelligence (87k curated papers)",
    }


def evidence_links_for_task_families(task_families: tuple[str, ...]) -> tuple[TaskEvidenceLink, ...]:
    """Return one primary literature anchor per distinct task family present."""

    catalog = _CATALOG
    seen: set[str] = set()
    out: list[TaskEvidenceLink] = []
    for family in task_families:
        key = family.lower().strip()
        if key in seen or key not in catalog:
            continue
        seen.add(key)
        out.append(catalog[key])
    return tuple(out)


def monitoring_evidence_links() -> tuple[TaskEvidenceLink, ...]:
    """Evidence anchors for continuous monitoring (falls, inactivity, zones)."""

    return (
        TaskEvidenceLink(
            task_family="room_monitoring",
            condition_id="alzheimers-dementia",
            evidence_target_name="video_room_monitoring",
            context_type="safety_signal",
            label="Fall risk & mobility surveillance literature",
            paper_count=2980,
            rationale=(
                "Video-derived movement and presence events are compared against clinical "
                "literature on mobility decline and institutional safety monitoring — not as "
                "a validated detector."
            ),
            method_note=(
                "Rule-based kinematic proxies from tracks/zones; thresholds are deployment-specific "
                "and require local validation."
            ),
            example_citation="Telecare / ambient monitoring systematic reviews (indexed in registry).",
        ),
    )


# Paper counts per condition match CONDITION_EVIDENCE in evidence-dataset.js (do not edit casually).
_CATALOG: dict[str, TaskEvidenceLink] = {
    "gait": TaskEvidenceLink(
        task_family="gait",
        condition_id="post-stroke-motor",
        evidence_target_name="video_gait_kinematics",
        context_type="biomarker",
        label="Gait / mobility biomarker literature",
        paper_count=2835,
        rationale=(
            "Cadence, stride proxies, and asymmetry are interpreted alongside stroke-rehab "
            "and neurology literature on spatiotemporal gait — not as a substitute for instrumented gait lab."
        ),
        method_note=(
            "Metrics come from 2D pose trajectories and pixel or calibrated scalars; compare trends within "
            "the same camera setup rather than against population norms unless calibrated."
        ),
        example_citation="See registry: post-stroke motor recovery — gait intervention trials & reviews.",
    ),
    "bradykinesia": TaskEvidenceLink(
        task_family="bradykinesia",
        condition_id="parkinsons-motor",
        evidence_target_name="video_bradykinesia_proxy",
        context_type="biomarker",
        label="Parkinson motor / bradykinesia literature",
        paper_count=3161,
        rationale=(
            "Finger tapping and repetitive-task proxies echo MDS-UPDRS kinematic themes in the literature; "
            "outputs here are algorithmic severity hints for review, not official scale scores."
        ),
        method_note=(
            "Amplitude decrement and rhythm variability are computed from joint trajectories; "
            "clinical correlation requires study-specific validation."
        ),
        example_citation="See registry: Parkinson motor — neuromodulation and kinematic outcome studies.",
    ),
    "tremor": TaskEvidenceLink(
        task_family="tremor",
        condition_id="essential-tremor",
        evidence_target_name="video_tremor_frequency_proxy",
        context_type="biomarker",
        label="Tremor / movement disorder literature",
        paper_count=618,
        rationale=(
            "Dominant frequency and amplitude proxies align with movement-disorder literature on "
            "tremor phenomenology; video-only estimates are screening-grade, not EMG-equivalent."
        ),
        method_note=("Spectral peak picking on a joint trace; lighting and framing strongly affect SNR."),
        example_citation="See registry: essential tremor — intervention and phenomenology papers.",
    ),
    "posture": TaskEvidenceLink(
        task_family="posture",
        condition_id="parkinsons-motor",
        evidence_target_name="video_postural_sway_proxy",
        context_type="biomarker",
        label="Postural control / sway literature",
        paper_count=3161,
        rationale=(
            "Sway area and trunk angle proxies relate to balance literature in neurodegeneration and "
            "rehab; single-camera estimates are relative markers for clinician review."
        ),
        method_note=("Trunk/hip-driven sway metrics without force-plate ground truth."),
        example_citation="See registry: Parkinson motor — balance and postural instability references.",
    ),
}

__all__ = [
    "EVIDENCE_REGISTRY_TOTAL_PAPERS",
    "EVIDENCE_REGISTRY_VERSION",
    "TaskEvidenceLink",
    "evidence_links_for_task_families",
    "monitoring_evidence_links",
    "registry_snapshot",
]
