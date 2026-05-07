"""Audit-friendly neuromodulation recommendation drafts for clinician review.

This module creates candidate recommendation drafts from protocol evidence
bundles so higher-level DeepSynaps workflows can present structured planning
options for human review. It does not prescribe treatment, does not create a
final protocol order, and always requires clinician oversight. The outputs are
intentionally evidence-linked, uncertainty-aware, and suitable for audit and
override workflows.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from typing import Any

from .protocol_evidence import ProtocolEvidenceBundle


class RecommendationDraftError(RuntimeError):
    """Raised when a recommendation draft cannot be built safely."""


@dataclass(slots=True)
class RecommendationOption:
    """One candidate neuromodulation planning option for clinician review."""

    option_id: str
    modality: str
    target_region: str | None
    laterality: str | None
    protocol_family: str | None
    evidence_keys: list[str]
    rationale: str
    confidence_level: str
    safety_flags: list[str]
    missing_information: list[str]
    notes: str | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the option into JSON-friendly primitives."""

        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RecommendationOption":
        """Reconstruct an option from serialized primitives."""

        return cls(
            option_id=data["option_id"],
            modality=data["modality"],
            target_region=data.get("target_region"),
            laterality=data.get("laterality"),
            protocol_family=data.get("protocol_family"),
            evidence_keys=list(data.get("evidence_keys", [])),
            rationale=data["rationale"],
            confidence_level=data["confidence_level"],
            safety_flags=list(data.get("safety_flags", [])),
            missing_information=list(data.get("missing_information", [])),
            notes=data.get("notes"),
        )


@dataclass(slots=True)
class RecommendationDraft:
    """Versioned non-final recommendation draft built from protocol evidence."""

    version: str
    condition: str
    subject_id: str
    session_id: str | None
    options: list[RecommendationOption]
    global_rationale: str
    required_human_review: bool
    review_status: str
    audit_tags: list[str]
    created_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize the draft into JSON-friendly primitives."""

        return {
            "version": self.version,
            "condition": self.condition,
            "subject_id": self.subject_id,
            "session_id": self.session_id,
            "options": [option.to_dict() for option in self.options],
            "global_rationale": self.global_rationale,
            "required_human_review": self.required_human_review,
            "review_status": self.review_status,
            "audit_tags": list(self.audit_tags),
            "created_at": self.created_at.isoformat(),
        }

    def to_json(self, **json_kwargs: Any) -> str:
        """Serialize the draft to a JSON string."""

        return json.dumps(self.to_dict(), **json_kwargs)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RecommendationDraft":
        """Reconstruct a draft from serialized primitives."""

        return cls(
            version=data["version"],
            condition=data["condition"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            options=[RecommendationOption.from_dict(option) for option in data.get("options", [])],
            global_rationale=data["global_rationale"],
            required_human_review=bool(data["required_human_review"]),
            review_status=data["review_status"],
            audit_tags=list(data.get("audit_tags", [])),
            created_at=datetime.fromisoformat(data["created_at"]),
        )


class RecommendationDraftBuilder:
    """Build deterministic, non-final neuromodulation draft options."""

    _ALIASES = {
        "depression": "depression",
        "mdd": "depression",
        "major_depression": "depression",
        "majordepression": "depression",
        "adhd": "adhd",
        "attention_deficit_hyperactivity_disorder": "adhd",
        "attentiondeficithyperactivitydisorder": "adhd",
        "alzheimers": "alzheimers",
        "alzheimer": "alzheimers",
        "dementia": "alzheimers",
        "ad": "alzheimers",
    }

    _COMMON_AUDIT_TAGS = [
        "evidence_linked",
        "non_prescriptive",
        "human_review_required",
    ]

    _COMMON_SAFETY_FLAGS = [
        "requires clinician confirmation",
        "screen for contraindications",
        "verify diagnostic formulation",
    ]

    def __init__(self, version: str = "1.0.0") -> None:
        """Initialize a stable rule-based draft builder."""

        self.version = version

    def build(self, evidence_bundle: ProtocolEvidenceBundle) -> RecommendationDraft:
        """Build a recommendation draft from a protocol evidence bundle."""

        condition = self._normalize_condition(evidence_bundle.condition)
        if condition == "depression":
            return self._build_depression_draft(evidence_bundle)
        if condition == "adhd":
            return self._build_adhd_draft(evidence_bundle)
        if condition == "alzheimers":
            return self._build_alzheimers_draft(evidence_bundle)
        raise RecommendationDraftError(f"Unsupported recommendation draft condition: {evidence_bundle.condition}")

    def _build_depression_draft(self, evidence_bundle: ProtocolEvidenceBundle) -> RecommendationDraft:
        """Build conservative depression-oriented draft options."""

        evidence = _evidence_map(evidence_bundle.items)
        options: list[RecommendationOption] = []

        functional_keys = self._available_keys(
            evidence,
            "functional_dmn_connectivity_abnormality_proxy",
            "cingulate_targeting_context",
        )
        structural_keys = self._available_keys(
            evidence,
            "structural_frontal_lobe_features_present",
            "cingulate_targeting_context",
        )
        if functional_keys:
            support_keys = sorted(set(functional_keys + structural_keys))
            options.append(
                RecommendationOption(
                    option_id="dep-01",
                    modality="rTMS",
                    target_region="left DLPFC",
                    laterality="left",
                    protocol_family="connectivity_informed_left_dlpfc",
                    evidence_keys=support_keys,
                    rationale=(
                        "This draft highlights a connectivity-informed left DLPFC planning family because "
                        "functional network evidence is present and can be reviewed alongside frontal structural context."
                    ),
                    confidence_level=self._confidence_level(evidence, support_keys),
                    safety_flags=self._condition_safety_flags("depression"),
                    missing_information=self._condition_missing_information(
                        "depression",
                        evidence_bundle.missing_feature_keys,
                        extra=[
                            "individual neuronavigation target coordinates",
                            "symptom severity scale",
                            "medication history",
                            "seizure risk review",
                        ],
                    ),
                    notes="Draft only. Final targeting and dosing require clinician review.",
                )
            )
            options.append(
                RecommendationOption(
                    option_id="dep-02",
                    modality="iTBS",
                    target_region="left DLPFC",
                    laterality="left",
                    protocol_family="connectivity_informed_left_dlpfc",
                    evidence_keys=support_keys,
                    rationale=(
                        "This draft keeps an accelerated left-prefrontal protocol family visible for review because "
                        "the same evidence substrate may support discussion of multiple non-final stimulation styles."
                    ),
                    confidence_level=self._confidence_level(evidence, support_keys),
                    safety_flags=self._condition_safety_flags("depression"),
                    missing_information=self._condition_missing_information(
                        "depression",
                        evidence_bundle.missing_feature_keys,
                        extra=[
                            "individual neuronavigation target coordinates",
                            "symptom severity scale",
                            "medication history",
                            "seizure risk review",
                        ],
                    ),
                    notes="Draft only. No final protocol parameters are selected here.",
                )
            )
        elif structural_keys:
            options.append(
                RecommendationOption(
                    option_id="dep-03",
                    modality="rTMS",
                    target_region="left DLPFC",
                    laterality="left",
                    protocol_family="frontal_structure_informed_exploratory",
                    evidence_keys=structural_keys,
                    rationale=(
                        "Only broad frontal structural context is available, so this remains an exploratory planning "
                        "option pending individualized functional guidance and clinical review."
                    ),
                    confidence_level="low",
                    safety_flags=self._condition_safety_flags("depression"),
                    missing_information=self._condition_missing_information(
                        "depression",
                        evidence_bundle.missing_feature_keys,
                        extra=[
                            "individual neuronavigation target coordinates",
                            "symptom severity scale",
                            "medication history",
                            "seizure risk review",
                        ],
                    ),
                    notes="Functional targeting evidence is limited or absent.",
                )
            )
        else:
            options.append(
                RecommendationOption(
                    option_id="dep-04",
                    modality="rTMS",
                    target_region=None,
                    laterality=None,
                    protocol_family="insufficient_evidence_review_only",
                    evidence_keys=[],
                    rationale=(
                        "The available evidence does not yet support a specific planning family beyond broad clinical review."
                    ),
                    confidence_level="low",
                    safety_flags=self._condition_safety_flags("depression"),
                    missing_information=self._condition_missing_information(
                        "depression",
                        evidence_bundle.missing_feature_keys,
                        extra=[
                            "individual neuronavigation target coordinates",
                            "symptom severity scale",
                            "medication history",
                            "seizure risk review",
                        ],
                    ),
                    notes="This option is included only to surface uncertainty explicitly.",
                )
            )

        return self._draft(
            condition="depression",
            evidence_bundle=evidence_bundle,
            options=options,
            global_rationale=(
                "These candidate drafts organize frontal and network-level evidence into reviewable left-prefrontal "
                "planning families without selecting a final protocol or stimulation parameters."
            ),
        )

    def _build_adhd_draft(self, evidence_bundle: ProtocolEvidenceBundle) -> RecommendationDraft:
        """Build conservative ADHD-oriented draft options."""

        evidence = _evidence_map(evidence_bundle.items)
        options: list[RecommendationOption] = []
        support_keys = self._available_keys(
            evidence,
            "frontostriatal_structural_proxy_measured",
            "frontostriatal_functional_proxy_measured",
            "frontoparietal_network_proxy_measured",
        )
        options.append(
            RecommendationOption(
                option_id="adhd-01",
                modality="rTMS",
                target_region="frontal executive-control region",
                laterality="left",
                protocol_family="frontocircuit_informed_exploratory",
                evidence_keys=support_keys,
                rationale=(
                    "This draft keeps a frontal/frontocircuit planning family visible for clinician review because "
                    "the evidence bundle contains structural and/or network proxies relevant to ADHD circuitry."
                ),
                confidence_level=self._confidence_level(evidence, support_keys),
                safety_flags=self._condition_safety_flags("adhd"),
                missing_information=self._condition_missing_information(
                    "adhd",
                    evidence_bundle.missing_feature_keys,
                    extra=[
                        "age-appropriate symptom scale",
                        "executive function assessment",
                        "medication exposure history",
                        "contraindication screening",
                    ],
                ),
                notes="Target remains intentionally generic until clinical and localization context is reviewed.",
            )
        )
        options.append(
            RecommendationOption(
                option_id="adhd-02",
                modality="tDCS",
                target_region="frontal control network region",
                laterality="bilateral",
                protocol_family="frontoparietal_exploratory",
                evidence_keys=self._available_keys(evidence, "frontoparietal_network_proxy_measured"),
                rationale=(
                    "A non-final frontoparietal planning scaffold is included because ADHD evidence may point toward "
                    "distributed control-network review rather than a single decisive target."
                ),
                confidence_level="low" if len(support_keys) < 2 else "moderate",
                safety_flags=self._condition_safety_flags("adhd"),
                missing_information=self._condition_missing_information(
                    "adhd",
                    evidence_bundle.missing_feature_keys,
                    extra=[
                        "age-appropriate symptom scale",
                        "executive function assessment",
                        "medication exposure history",
                        "contraindication screening",
                    ],
                ),
                notes="Draft only. No final stimulation montage or parameters are chosen here.",
            )
        )

        return self._draft(
            condition="adhd",
            evidence_bundle=evidence_bundle,
            options=options,
            global_rationale=(
                "These ADHD drafts surface frontal and frontocircuit candidate families for clinician review while "
                "keeping exact targeting, intensity, and treatment-course decisions out of the automation layer."
            ),
        )

    def _build_alzheimers_draft(self, evidence_bundle: ProtocolEvidenceBundle) -> RecommendationDraft:
        """Build conservative Alzheimer’s/dementia-oriented draft options."""

        evidence = _evidence_map(evidence_bundle.items)
        support_keys = self._available_keys(
            evidence,
            "structural_hippocampal_marker_measured",
            "structural_temporal_parietal_context_present",
            "functional_dmn_connectivity_context",
        )
        options = [
            RecommendationOption(
                option_id="ad-01",
                modality="rTMS",
                target_region="network-informed cortical target",
                laterality="bilateral",
                protocol_family="network_informed_exploratory_review",
                evidence_keys=support_keys,
                rationale=(
                    "This conservative exploratory draft is included to organize hippocampal, temporoparietal, and "
                    "network evidence for clinician discussion without implying established efficacy or a final plan."
                ),
                confidence_level="low",
                safety_flags=self._condition_safety_flags("alzheimers"),
                missing_information=self._condition_missing_information(
                    "alzheimers",
                    evidence_bundle.missing_feature_keys,
                    extra=[
                        "diagnostic confirmation",
                        "disease stage assessment",
                        "cognitive severity scale",
                        "caregiver and treating clinician review",
                    ],
                ),
                notes="Exploratory planning support only; clinician oversight is mandatory.",
            )
        ]
        return self._draft(
            condition="alzheimers",
            evidence_bundle=evidence_bundle,
            options=options,
            global_rationale=(
                "This draft remains intentionally conservative and observational. It only structures available "
                "neurodegeneration-relevant evidence for specialist review and does not assert treatment efficacy."
            ),
        )

    def _draft(
        self,
        *,
        condition: str,
        evidence_bundle: ProtocolEvidenceBundle,
        options: list[RecommendationOption],
        global_rationale: str,
    ) -> RecommendationDraft:
        """Create the final recommendation draft with shared audit settings."""

        return RecommendationDraft(
            version=self.version,
            condition=condition,
            subject_id=evidence_bundle.subject_id,
            session_id=evidence_bundle.session_id,
            options=options,
            global_rationale=global_rationale,
            required_human_review=True,
            review_status="draft",
            audit_tags=list(self._COMMON_AUDIT_TAGS),
            created_at=datetime.now(timezone.utc),
        )

    def _normalize_condition(self, condition: str) -> str:
        """Normalize supported condition aliases to canonical keys."""

        normalized = condition.strip().lower().replace("-", "_").replace(" ", "_")
        canonical = self._ALIASES.get(normalized)
        if canonical is None:
            raise RecommendationDraftError(f"Unsupported recommendation draft condition: {condition}")
        return canonical

    def _confidence_level(
        self,
        evidence: dict[str, Any],
        evidence_keys: list[str],
    ) -> str:
        """Assign a transparent rule-based confidence level."""

        if not evidence_keys:
            return "low"
        modalities = {
            evidence[key].modality
            for key in evidence_keys
            if key in evidence
        }
        if len(modalities) >= 2 and len(evidence_keys) >= 2:
            return "moderate"
        return "low"

    def _condition_safety_flags(self, condition: str) -> list[str]:
        """Return shared and condition-specific safety flags."""

        flags = list(self._COMMON_SAFETY_FLAGS)
        if condition == "depression":
            flags.extend(["review suicidality status", "confirm mood-disorder treatment context"])
        elif condition == "adhd":
            flags.extend(["review developmental context", "confirm impairment across settings"])
        elif condition == "alzheimers":
            flags.extend(["confirm treating neurologist oversight", "review disease stage and capacity considerations"])
        return flags

    def _condition_missing_information(
        self,
        condition: str,
        missing_feature_keys: list[str],
        *,
        extra: list[str],
    ) -> list[str]:
        """Combine evidence gaps with condition-specific checklist items."""

        items = list(missing_feature_keys) + list(extra)
        if condition == "depression":
            items.append("structured psychiatric review")
        elif condition == "adhd":
            items.append("behavioral and educational context")
        elif condition == "alzheimers":
            items.append("diagnostic and staging confirmation")
        return sorted(set(items))

    @staticmethod
    def _available_keys(evidence: dict[str, Any], *keys: str) -> list[str]:
        """Return evidence keys that are present in the bundle."""

        return [key for key in keys if key in evidence]


def _evidence_map(items: list[Any]) -> dict[str, Any]:
    """Index evidence items by evidence key."""

    return {item.key: item for item in items}


__all__ = [
    "RecommendationDraft",
    "RecommendationDraftBuilder",
    "RecommendationDraftError",
    "RecommendationOption",
]
