"""Protocol evidence blocks for DeepSynaps neuromodulation decision support.

This module converts condition-oriented protocol feature views into structured
evidence blocks that can be consumed by downstream reasoning engines and audit
surfaces. It does not diagnose disease or prescribe treatment. Instead, it
links measured imaging features to short rationales and lightweight literature
references so that higher-level components can explain why a feature may be
relevant while keeping the evidence layer interpretable and auditable.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
from typing import Any

from .protocol_views import ProtocolFeature, ProtocolFeatureView


class ProtocolEvidenceError(RuntimeError):
    """Raised when protocol evidence cannot be built safely."""


@dataclass(slots=True)
class EvidenceCitation:
    """Minimal citation metadata attached to one evidence item."""

    id: str
    title: str
    source: str
    year: int | None
    doi_or_url: str | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the citation into JSON-friendly primitives."""

        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EvidenceCitation":
        """Reconstruct a citation from serialized primitives."""

        return cls(**data)


@dataclass(slots=True)
class EvidenceItem:
    """One evidence statement derived from a protocol feature."""

    key: str
    modality: str
    condition: str
    direction: str | None
    value: float | int | str | None
    unit: str | None
    qualitative_strength: str | None
    rationale: str
    citations: list[EvidenceCitation]
    source_feature_key: str
    notes: str | None

    def to_dict(self) -> dict[str, Any]:
        """Serialize the evidence item into JSON-friendly primitives."""

        payload = asdict(self)
        payload["citations"] = [citation.to_dict() for citation in self.citations]
        return payload

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "EvidenceItem":
        """Reconstruct an evidence item from serialized primitives."""

        return cls(
            key=data["key"],
            modality=data["modality"],
            condition=data["condition"],
            direction=data.get("direction"),
            value=data.get("value"),
            unit=data.get("unit"),
            qualitative_strength=data.get("qualitative_strength"),
            rationale=data["rationale"],
            citations=[
                EvidenceCitation.from_dict(citation)
                for citation in data.get("citations", [])
            ],
            source_feature_key=data["source_feature_key"],
            notes=data.get("notes"),
        )


@dataclass(slots=True)
class ProtocolEvidenceBundle:
    """Structured evidence blocks for one condition-oriented session view."""

    version: str
    condition: str
    subject_id: str
    session_id: str | None
    items: list[EvidenceItem]
    missing_feature_keys: list[str]
    created_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Serialize the evidence bundle into JSON-friendly primitives."""

        return {
            "version": self.version,
            "condition": self.condition,
            "subject_id": self.subject_id,
            "session_id": self.session_id,
            "items": [item.to_dict() for item in self.items],
            "missing_feature_keys": list(self.missing_feature_keys),
            "created_at": self.created_at.isoformat(),
        }

    def to_json(self, **json_kwargs: Any) -> str:
        """Serialize the evidence bundle into a JSON string."""

        return json.dumps(self.to_dict(), **json_kwargs)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ProtocolEvidenceBundle":
        """Reconstruct an evidence bundle from serialized primitives."""

        return cls(
            version=data["version"],
            condition=data["condition"],
            subject_id=data["subject_id"],
            session_id=data.get("session_id"),
            items=[EvidenceItem.from_dict(item) for item in data.get("items", [])],
            missing_feature_keys=list(data.get("missing_feature_keys", [])),
            created_at=datetime.fromisoformat(data["created_at"]),
        )


class ProtocolEvidenceBuilder:
    """Build structured evidence blocks from protocol feature views."""

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

    def __init__(self, version: str = "1.0.0") -> None:
        """Initialize a stable evidence-builder version."""

        self.version = version
        self._citation_catalog = _build_citation_catalog()

    def build(self, feature_view: ProtocolFeatureView) -> ProtocolEvidenceBundle:
        """Build a condition-specific evidence bundle from a protocol feature view."""

        normalized = self._normalize_condition(feature_view.condition)
        if normalized == "depression":
            return self._build_depression_evidence(feature_view)
        if normalized == "adhd":
            return self._build_adhd_evidence(feature_view)
        if normalized == "alzheimers":
            return self._build_alzheimers_evidence(feature_view)
        raise ProtocolEvidenceError(f"Unsupported protocol evidence condition: {feature_view.condition}")

    def _build_depression_evidence(self, feature_view: ProtocolFeatureView) -> ProtocolEvidenceBundle:
        """Build conservative depression-oriented evidence blocks."""

        features = _feature_map(feature_view.selected_features)
        items: list[EvidenceItem] = []
        missing = set(feature_view.missing_features)

        dmn_feature = self._first_feature(
            features,
            "dmn_within_connectivity_mean",
            "connectivity_matrix_mean_value",
            "connectivity_upper_triangle_abs_mean",
        )
        if dmn_feature is not None:
            items.append(
                self._make_item(
                    key="functional_dmn_connectivity_abnormality_proxy",
                    modality="fMRI",
                    condition="depression",
                    direction="non_directional",
                    feature=dmn_feature,
                    qualitative_strength="moderate",
                    rationale=(
                        "Resting-state connectivity features capture large-scale network organization relevant to "
                        "depression, including DMN-related mechanisms often discussed in TMS biomarker studies."
                    ),
                    citation_ids=["MDD_DMN_TMS_2012_Fox", "MDD_DMN_Review_2017_Mulders"],
                )
            )
        else:
            missing.add("dmn_within_connectivity_mean")
            missing.add("connectivity_matrix_mean_value")

        frontal_features = self._collect_features(
            features,
            "frontal_lobe_gray_matter_volume_mm3_lh",
            "frontal_lobe_gray_matter_volume_mm3_rh",
            "frontal_lobe_mean_thickness_mm_lh",
            "frontal_lobe_mean_thickness_mm_rh",
        )
        if frontal_features:
            items.append(
                self._make_group_item(
                    key="structural_frontal_lobe_features_present",
                    modality="sMRI",
                    condition="depression",
                    direction=None,
                    source_features=frontal_features,
                    qualitative_strength="exploratory",
                    rationale=(
                        "Frontal structural measurements provide context around dorsolateral prefrontal anatomy and "
                        "may help frame neuromodulation interpretation without determining a protocol on their own."
                    ),
                    citation_ids=["MDD_DMN_TMS_2012_Fox"],
                )
            )
        else:
            missing.update(
                {
                    "frontal_lobe_gray_matter_volume_mm3_lh",
                    "frontal_lobe_gray_matter_volume_mm3_rh",
                    "frontal_lobe_mean_thickness_mm_lh",
                    "frontal_lobe_mean_thickness_mm_rh",
                }
            )

        cingulate_feature = self._first_feature(
            features,
            "prefrontal_cingulate_connectivity_mean",
            "cingulate_mean_thickness_mm_lh",
            "cingulate_mean_thickness_mm_rh",
            "cingulate_gray_matter_volume_mm3_lh",
            "cingulate_gray_matter_volume_mm3_rh",
        )
        if cingulate_feature is not None:
            items.append(
                self._make_item(
                    key="cingulate_targeting_context",
                    modality="fMRI" if "connectivity" in cingulate_feature.feature_key else "sMRI",
                    condition="depression",
                    direction=None,
                    feature=cingulate_feature,
                    qualitative_strength="emerging",
                    rationale=(
                        "Cingulate-linked features provide non-prescriptive context for network-level depression "
                        "reasoning because anterior and subgenual cingulate systems are often discussed in TMS and "
                        "MDD connectivity literature."
                    ),
                    citation_ids=["MDD_DMN_TMS_2012_Fox", "MDD_DMN_Review_2017_Mulders"],
                )
            )
        else:
            missing.add("prefrontal_cingulate_connectivity_mean")
            missing.add("cingulate_mean_thickness_mm_lh")
            missing.add("cingulate_mean_thickness_mm_rh")

        missing.update({"dlpfc_sgacc_connectivity_explicit", "executive_control_network_specific_metric"})
        return self._bundle("depression", feature_view, items, missing)

    def _build_adhd_evidence(self, feature_view: ProtocolFeatureView) -> ProtocolEvidenceBundle:
        """Build conservative ADHD-oriented evidence blocks."""

        features = _feature_map(feature_view.selected_features)
        items: list[EvidenceItem] = []
        missing = set(feature_view.missing_features)

        frontostriatal_structural = self._first_feature(
            features,
            "caudate_asymmetry_index_percent",
            "thalamus_asymmetry_index_percent",
            "frontal_lobe_gray_matter_volume_mm3_lh",
            "frontal_lobe_gray_matter_volume_mm3_rh",
        )
        if frontostriatal_structural is not None:
            items.append(
                self._make_item(
                    key="frontostriatal_structural_proxy_measured",
                    modality="sMRI",
                    condition="adhd",
                    direction=None,
                    feature=frontostriatal_structural,
                    qualitative_strength="moderate",
                    rationale=(
                        "Frontal and subcortical structural proxies reflect circuitry often discussed in ADHD "
                        "frontostriatal models and can support higher-level interpretation of measured anatomy."
                    ),
                    citation_ids=["ADHD_FRONTROSTRIATAL_REVIEW_2018_Valera", "ADHD_NETWORKS_REVIEW_2014_Cortese"],
                )
            )
        else:
            missing.update({"caudate_asymmetry_index_percent", "thalamus_asymmetry_index_percent"})

        frontostriatal_functional = self._first_feature(features, "frontostriatal_connectivity_mean")
        if frontostriatal_functional is not None:
            items.append(
                self._make_item(
                    key="frontostriatal_functional_proxy_measured",
                    modality="fMRI",
                    condition="adhd",
                    direction="non_directional",
                    feature=frontostriatal_functional,
                    qualitative_strength="emerging",
                    rationale=(
                        "Functional connectivity proxies spanning frontal and striatal labels provide a lightweight "
                        "network summary relevant to ADHD circuitry without implying a treatment rule."
                    ),
                    citation_ids=["ADHD_FRONTROSTRIATAL_REVIEW_2018_Valera", "ADHD_NETWORKS_REVIEW_2014_Cortese"],
                )
            )
        else:
            missing.add("frontostriatal_connectivity_mean")

        frontoparietal_feature = self._first_feature(features, "frontoparietal_connectivity_mean")
        if frontoparietal_feature is not None:
            items.append(
                self._make_item(
                    key="frontoparietal_network_proxy_measured",
                    modality="fMRI",
                    condition="adhd",
                    direction="non_directional",
                    feature=frontoparietal_feature,
                    qualitative_strength="emerging",
                    rationale=(
                        "Frontoparietal connectivity summaries can complement frontostriatal proxies because ADHD "
                        "imaging literature often discusses distributed executive-control network differences."
                    ),
                    citation_ids=["ADHD_NETWORKS_REVIEW_2014_Cortese"],
                )
            )
        else:
            missing.add("frontoparietal_connectivity_mean")

        return self._bundle("adhd", feature_view, items, missing)

    def _build_alzheimers_evidence(self, feature_view: ProtocolFeatureView) -> ProtocolEvidenceBundle:
        """Build conservative Alzheimer’s/dementia-oriented evidence blocks."""

        features = _feature_map(feature_view.selected_features)
        items: list[EvidenceItem] = []
        missing = set(feature_view.missing_features)

        hippocampal_feature = self._first_feature(
            features,
            "hippocampus_volume_mm3_per_icv_lh",
            "hippocampus_volume_mm3_per_icv_rh",
            "hippocampus_volume_mm3_lh",
            "hippocampus_volume_mm3_rh",
            "hippocampus_asymmetry_index_percent",
        )
        if hippocampal_feature is not None:
            items.append(
                self._make_item(
                    key="structural_hippocampal_marker_measured",
                    modality="sMRI",
                    condition="alzheimers",
                    direction="lower_is_worse"
                    if "volume" in hippocampal_feature.feature_key
                    else "non_directional",
                    feature=hippocampal_feature,
                    qualitative_strength="strong",
                    rationale=(
                        "Hippocampal structural measurements are widely used as neurodegeneration-relevant markers "
                        "in Alzheimer’s and dementia imaging workflows."
                    ),
                    citation_ids=["AD_HIPPOCAMPAL_ATROPHY_REVIEW_2022_Fotuhi", "AD_DMN_REVIEW_2021_Buckner"],
                )
            )
        else:
            missing.update(
                {
                    "hippocampus_volume_mm3_per_icv_lh",
                    "hippocampus_volume_mm3_per_icv_rh",
                    "hippocampus_asymmetry_index_percent",
                }
            )

        temporal_parietal_features = self._collect_features(
            features,
            "temporal_lobe_gray_matter_volume_mm3_lh",
            "temporal_lobe_gray_matter_volume_mm3_rh",
            "parietal_lobe_gray_matter_volume_mm3_lh",
            "parietal_lobe_gray_matter_volume_mm3_rh",
        )
        if temporal_parietal_features:
            items.append(
                self._make_group_item(
                    key="structural_temporal_parietal_context_present",
                    modality="sMRI",
                    condition="alzheimers",
                    direction=None,
                    source_features=temporal_parietal_features,
                    qualitative_strength="moderate",
                    rationale=(
                        "Temporal and parietal lobe structural summaries provide additional atrophy context often "
                        "considered alongside hippocampal markers in dementia imaging interpretation."
                    ),
                    citation_ids=["AD_HIPPOCAMPAL_ATROPHY_REVIEW_2022_Fotuhi"],
                )
            )
        else:
            missing.update(
                {
                    "temporal_lobe_gray_matter_volume_mm3_lh",
                    "temporal_lobe_gray_matter_volume_mm3_rh",
                    "parietal_lobe_gray_matter_volume_mm3_lh",
                    "parietal_lobe_gray_matter_volume_mm3_rh",
                }
            )

        dmn_feature = self._first_feature(features, "dmn_within_connectivity_mean", "connectivity_matrix_mean_value")
        if dmn_feature is not None:
            items.append(
                self._make_item(
                    key="functional_dmn_connectivity_context",
                    modality="fMRI",
                    condition="alzheimers",
                    direction="non_directional",
                    feature=dmn_feature,
                    qualitative_strength="moderate",
                    rationale=(
                        "Default-mode network summaries provide functional context because Alzheimer’s imaging studies "
                        "frequently discuss DMN disruption alongside structural neurodegeneration."
                    ),
                    citation_ids=["AD_DMN_REVIEW_2021_Buckner"],
                )
            )
        else:
            missing.add("dmn_within_connectivity_mean")

        return self._bundle("alzheimers", feature_view, items, missing)

    def _bundle(
        self,
        condition: str,
        feature_view: ProtocolFeatureView,
        items: list[EvidenceItem],
        missing: set[str],
    ) -> ProtocolEvidenceBundle:
        """Create the final evidence bundle."""

        return ProtocolEvidenceBundle(
            version=self.version,
            condition=condition,
            subject_id=feature_view.subject_id,
            session_id=feature_view.session_id,
            items=items,
            missing_feature_keys=sorted(missing),
            created_at=datetime.now(timezone.utc),
        )

    def _make_item(
        self,
        *,
        key: str,
        modality: str,
        condition: str,
        direction: str | None,
        feature: ProtocolFeature,
        qualitative_strength: str | None,
        rationale: str,
        citation_ids: list[str],
    ) -> EvidenceItem:
        """Create one evidence item from a single protocol feature."""

        return EvidenceItem(
            key=key,
            modality=modality,
            condition=condition,
            direction=direction,
            value=feature.value,
            unit=feature.unit,
            qualitative_strength=qualitative_strength,
            rationale=rationale,
            citations=[self._citation_catalog[citation_id] for citation_id in citation_ids],
            source_feature_key=feature.feature_key,
            notes=feature.notes,
        )

    def _make_group_item(
        self,
        *,
        key: str,
        modality: str,
        condition: str,
        direction: str | None,
        source_features: list[ProtocolFeature],
        qualitative_strength: str | None,
        rationale: str,
        citation_ids: list[str],
    ) -> EvidenceItem:
        """Create one evidence item summarizing a small set of related features."""

        notes = f"Source features: {', '.join(feature.feature_key for feature in source_features)}"
        return EvidenceItem(
            key=key,
            modality=modality,
            condition=condition,
            direction=direction,
            value=len(source_features),
            unit="count",
            qualitative_strength=qualitative_strength,
            rationale=rationale,
            citations=[self._citation_catalog[citation_id] for citation_id in citation_ids],
            source_feature_key=source_features[0].feature_key,
            notes=notes,
        )

    @staticmethod
    def _first_feature(features: dict[str, ProtocolFeature], *keys: str) -> ProtocolFeature | None:
        """Return the first available feature under the provided keys."""

        for key in keys:
            if key in features:
                return features[key]
        return None

    @staticmethod
    def _collect_features(features: dict[str, ProtocolFeature], *keys: str) -> list[ProtocolFeature]:
        """Collect available features under the provided keys."""

        return [features[key] for key in keys if key in features]

    def _normalize_condition(self, condition: str) -> str:
        """Normalize supported condition aliases to canonical keys."""

        normalized = condition.strip().lower().replace("-", "_").replace(" ", "_")
        canonical = self._ALIASES.get(normalized)
        if canonical is None:
            raise ProtocolEvidenceError(f"Unsupported protocol evidence condition: {condition}")
        return canonical


def _feature_map(features: list[ProtocolFeature]) -> dict[str, ProtocolFeature]:
    """Index protocol features by feature key."""

    return {feature.feature_key: feature for feature in features}


def _build_citation_catalog() -> dict[str, EvidenceCitation]:
    """Build the small internal evidence citation catalog."""

    return {
        "MDD_DMN_TMS_2012_Fox": EvidenceCitation(
            id="MDD_DMN_TMS_2012_Fox",
            title="Efficacy of transcranial magnetic stimulation targets for depression is related to intrinsic functional connectivity with the subgenual cingulate",
            source="Biological Psychiatry",
            year=2012,
            doi_or_url="https://doi.org/10.1016/j.biopsych.2012.04.028",
        ),
        "MDD_DMN_Review_2017_Mulders": EvidenceCitation(
            id="MDD_DMN_Review_2017_Mulders",
            title="Resting-state functional connectivity in major depressive disorder: A review",
            source="Neuroscience & Biobehavioral Reviews",
            year=2015,
            doi_or_url="https://doi.org/10.1016/j.neubiorev.2014.10.014",
        ),
        "ADHD_FRONTROSTRIATAL_REVIEW_2018_Valera": EvidenceCitation(
            id="ADHD_FRONTROSTRIATAL_REVIEW_2018_Valera",
            title="Meta-Analysis of Structural Imaging Findings in Attention-Deficit/Hyperactivity Disorder",
            source="Biological Psychiatry: Cognitive Neuroscience and Neuroimaging",
            year=2018,
            doi_or_url="https://doi.org/10.1016/j.bpsc.2017.11.004",
        ),
        "ADHD_NETWORKS_REVIEW_2014_Cortese": EvidenceCitation(
            id="ADHD_NETWORKS_REVIEW_2014_Cortese",
            title="Toward systems neuroscience of ADHD: a meta-analysis of 55 fMRI studies",
            source="American Journal of Psychiatry",
            year=2012,
            doi_or_url="https://doi.org/10.1176/appi.ajp.2012.11101521",
        ),
        "AD_HIPPOCAMPAL_ATROPHY_REVIEW_2022_Fotuhi": EvidenceCitation(
            id="AD_HIPPOCAMPAL_ATROPHY_REVIEW_2022_Fotuhi",
            title="Hippocampal atrophy in Alzheimer disease: A literature review",
            source="Cureus",
            year=2022,
            doi_or_url="https://www.cureus.com/articles/105010-hippocampal-atrophy-in-alzheimers-disease-a-systematic-review",
        ),
        "AD_DMN_REVIEW_2021_Buckner": EvidenceCitation(
            id="AD_DMN_REVIEW_2021_Buckner",
            title="Molecular, structural, and functional characterization of Alzheimer's disease: evidence for a relationship between default activity, amyloid, and memory",
            source="Journal of Neuroscience",
            year=2005,
            doi_or_url="https://doi.org/10.1523/JNEUROSCI.2177-05.2005",
        ),
    }


__all__ = [
    "EvidenceCitation",
    "EvidenceItem",
    "ProtocolEvidenceBuilder",
    "ProtocolEvidenceBundle",
    "ProtocolEvidenceError",
]
