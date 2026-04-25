from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .features import FeatureVector


@dataclass(frozen=True)
class RuleCitation:
    label: str
    url: str | None = None


@dataclass(frozen=True)
class RuleHit:
    rule_id: str
    condition_slug: str
    score: float
    summary: str
    citations: list[RuleCitation]
    debug: dict[str, Any]


def _z(fv: FeatureVector, region: str, band: str) -> float | None:
    try:
        return float(fv.region_band_z[region][band])
    except Exception:
        return None


def evaluate_rules(fv: FeatureVector) -> list[RuleHit]:
    """Return auditable rule hits.

    The rules here are explicit *decision support* heuristics; they do not
    claim to diagnose.
    """
    hits: list[RuleHit] = []

    # ADHD-like: elevated frontal theta + high TBR.
    # Operationalisation:
    # - frontal theta z > +1.5 (absolute)
    # - TBR > 4.0 (global mean relative theta/beta)
    frontal_theta = _z(fv, "frontal", "theta")
    tbr = fv.theta_beta_ratio
    if frontal_theta is not None and tbr is not None and frontal_theta > 1.5 and tbr > 4.0:
        hits.append(
            RuleHit(
                rule_id="RULE-ADHD-THETA-TBR",
                condition_slug="adhd_like",
                score=2.0,
                summary="Elevated frontal theta with high theta/beta ratio pattern.",
                citations=[
                    RuleCitation(
                        label="Theta/Beta ratio literature (overview)",
                        url="https://pubmed.ncbi.nlm.nih.gov/?term=theta+beta+ratio+ADHD+EEG",
                    )
                ],
                debug={"frontal_theta_z": frontal_theta, "tbr": tbr},
            )
        )

    # MDD-like: negative FAA (left-dominant) + reduced posterior alpha.
    # Operationalisation:
    # - FAA < -0.1
    # - occipital alpha z < -1.0 (absolute)
    faa = fv.frontal_alpha_asymmetry_f3_f4
    occ_alpha = _z(fv, "occipital", "alpha")
    if faa is not None and occ_alpha is not None and faa < -0.1 and occ_alpha < -1.0:
        hits.append(
            RuleHit(
                rule_id="RULE-MDD-FAA-POSTALPHA",
                condition_slug="mdd_like",
                score=1.5,
                summary="Negative frontal alpha asymmetry with reduced posterior alpha power.",
                citations=[
                    RuleCitation(
                        label="Frontal alpha asymmetry literature (overview)",
                        url="https://pubmed.ncbi.nlm.nih.gov/?term=frontal+alpha+asymmetry+depression+EEG",
                    )
                ],
                debug={"faa_f3_f4": faa, "occipital_alpha_z": occ_alpha},
            )
        )

    # Anxiety-like: elevated posterior alpha and/or high within-occipital alpha coherence.
    # Operationalisation:
    # - occipital alpha z > +1.0 OR alpha_coherence_within_occipital > 0.35
    occ_alpha2 = _z(fv, "occipital", "alpha")
    occ_coh = fv.alpha_coherence.get("alpha_coherence_within_occipital")
    if (occ_alpha2 is not None and occ_alpha2 > 1.0) or (occ_coh is not None and occ_coh > 0.35):
        hits.append(
            RuleHit(
                rule_id="RULE-ANX-POSTALPHA-COH",
                condition_slug="anxiety_like",
                score=1.0,
                summary="Posterior alpha elevation and/or elevated alpha coherence pattern.",
                citations=[
                    RuleCitation(
                        label="Alpha rhythm and anxiety literature (overview)",
                        url="https://pubmed.ncbi.nlm.nih.gov/?term=alpha+power+anxiety+EEG",
                    )
                ],
                debug={"occipital_alpha_z": occ_alpha2, "occipital_alpha_coherence": occ_coh},
            )
        )

    # Cognitive-decline-like: reduced IAPF.
    # Operationalisation:
    # - IAPF < 9.0 Hz
    if fv.iapf_hz is not None and fv.iapf_hz < 9.0:
        hits.append(
            RuleHit(
                rule_id="RULE-COG-IAPF-LOW",
                condition_slug="cognitive_decline_like",
                score=1.0,
                summary="Low individual alpha peak frequency pattern.",
                citations=[
                    RuleCitation(
                        label="Peak alpha frequency and cognition literature (overview)",
                        url="https://pubmed.ncbi.nlm.nih.gov/?term=peak+alpha+frequency+cognitive+decline+EEG",
                    )
                ],
                debug={"iapf_hz": fv.iapf_hz},
            )
        )

    return hits

