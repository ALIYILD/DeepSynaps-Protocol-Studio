"""Protocol recommender — the clinical payoff module.

Implements CONTRACT_V2.md §5 ``ProtocolRecommendation`` shape. The flow
follows ``AI_UPGRADES.md §8``:

1. Biomarker → target mapping (a frozen dict of well-known qEEG priors)
2. Literature grounding via :mod:`deepsynaps_qeeg.ai.medrag`
3. Cohort-response estimate via :mod:`deepsynaps_qeeg.ai.similar_cases`
4. S-O-Z-O session plan template (Induction / Consolidation /
   Maintenance)
5. Banned-word sanitiser on the free-text ``rationale``

When no biomarker matches we return a conservative stub with
``confidence="low"`` and a rationale explaining the situation. Citations
in that path come from an unfiltered MedRAG call so the UI still shows
something.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Callable

from . import medrag as _medrag_mod
from . import similar_cases as _similar_cases_mod

log = logging.getLogger(__name__)


# -------------------------------------------------------------------- mapping
# (trigger_key, primary_modality, target_region, condition_slug,
#  required_risk_label, risk_threshold)
BIOMARKER_TARGET_MAP: dict[str, dict[str, Any]] = {
    "frontal_alpha_asymmetry_positive": {
        "modality": "rtms_10hz",
        "target": "L_DLPFC",
        "condition": "depression",
        "requires_risk": None,
        "risk_threshold": 0.0,
    },
    "elevated_theta_at_Fz": {
        "modality": "neurofeedback_smr_theta",
        "target": "Fz",
        "condition": "adhd",
        "requires_risk": "adhd_like",
        "risk_threshold": 0.4,
    },
    "elevated_posterior_alpha": {
        "modality": "alpha_downtraining",
        "target": "Pz",
        "condition": "anxiety",
        "requires_risk": "anxiety_like",
        "risk_threshold": 0.4,
    },
    "reduced_paf": {
        "modality": "tdcs_2ma",
        "target": "L_DLPFC",
        "condition": "cognitive_decline",
        "requires_risk": "cognitive_decline_like",
        "risk_threshold": 0.4,
    },
    "elevated_delta_frontal": {
        "modality": "hbot_pulsed_hf_emf",
        "target": "bifrontal",
        "condition": "tbi",
        "requires_risk": "tbi_residual_like",
        "risk_threshold": 0.4,
    },
    "reduced_sleep_spindles": {
        "modality": "closed_loop_sleep_stim",
        "target": "Cz",
        "condition": "insomnia",
        "requires_risk": "insomnia_like",
        "risk_threshold": 0.4,
    },
}

# Default dose envelopes (conservative starting points; clinician tunes).
_DOSE_DEFAULTS: dict[str, dict[str, Any]] = {
    "rtms_10hz": {"sessions": 30, "intensity": "120% RMT", "duration_min": 37, "frequency": "5x/week"},
    "itbs": {"sessions": 30, "intensity": "80% AMT", "duration_min": 10, "frequency": "5x/week"},
    "neurofeedback_smr_theta": {"sessions": 20, "intensity": "N/A (operant)", "duration_min": 40, "frequency": "2-3x/week"},
    "alpha_downtraining": {"sessions": 20, "intensity": "N/A (operant)", "duration_min": 40, "frequency": "2-3x/week"},
    "tdcs_2ma": {"sessions": 20, "intensity": "2.0 mA", "duration_min": 20, "frequency": "5x/week"},
    "hbot_pulsed_hf_emf": {"sessions": 40, "intensity": "1.5 ATA + pulsed HF-EMF", "duration_min": 60, "frequency": "5x/week"},
    "closed_loop_sleep_stim": {"sessions": 21, "intensity": "auditory closed-loop", "duration_min": 60, "frequency": "nightly x 3 wk"},
}

_CONTRAINDICATIONS: dict[str, list[str]] = {
    "rtms_10hz": ["seizure history", "ferromagnetic implants near coil", "pregnancy (relative)"],
    "itbs": ["seizure history", "ferromagnetic implants near coil"],
    "neurofeedback_smr_theta": ["active uncontrolled seizure disorder"],
    "alpha_downtraining": ["active uncontrolled seizure disorder"],
    "tdcs_2ma": ["scalp skin breakdown", "metallic cranial implant under electrode"],
    "hbot_pulsed_hf_emf": ["untreated pneumothorax", "certain chemotherapies (bleomycin)"],
    "closed_loop_sleep_stim": ["severe hearing impairment", "active psychosis"],
}

_RESPONSE_WINDOW: dict[str, tuple[int, int]] = {
    "rtms_10hz": (4, 8),
    "itbs": (3, 6),
    "neurofeedback_smr_theta": (6, 12),
    "alpha_downtraining": (6, 12),
    "tdcs_2ma": (4, 8),
    "hbot_pulsed_hf_emf": (6, 12),
    "closed_loop_sleep_stim": (3, 6),
}

# Condition slug → risk-score label used by the stub pipeline.
_CONDITION_TO_RISK: dict[str, str] = {
    "depression": "mdd_like",
    "adhd": "adhd_like",
    "anxiety": "anxiety_like",
    "cognitive_decline": "cognitive_decline_like",
    "tbi": "tbi_residual_like",
    "insomnia": "insomnia_like",
}


# -------------------------------------------------------------------- api
def recommend_protocol(
    features: dict[str, Any],
    zscores: dict[str, Any],
    risk_scores: dict[str, Any],
    *,
    embedding: list[float] | None = None,
    flagged_conditions: list[str] | None = None,
    db_session: Any | None = None,
    deterministic_seed: int | None = None,
    medrag_fn: Callable[..., list[dict[str, Any]]] | None = None,
    similar_cases_fn: Callable[..., Any] | None = None,
) -> dict[str, Any]:
    """Return a ``ProtocolRecommendation`` dict per CONTRACT_V2 §5.

    Parameters
    ----------
    features : dict
        Feature dict per ``CONTRACT.md §1.1``.
    zscores : dict
        Normative z-scores per ``CONTRACT.md §1.2`` (flagged list is
        scanned for biomarker triggers).
    risk_scores : dict
        Similarity-index payload from :mod:`risk_scores`. The
        ``*_like`` scores gate several biomarker→modality mappings.
    embedding : list of float, optional
        Needed for ``similar_cases`` lookup.
    flagged_conditions : list of str, optional
        Pre-computed condition slugs. When ``None`` we derive them from
        ``risk_scores`` and ``zscores.flagged``.
    db_session : Any, optional
        SQLA session forwarded to ``similar_cases.find_similar``.
    deterministic_seed : int, optional
        Forwarded to stubbed downstream calls.
    medrag_fn, similar_cases_fn : callable, optional
        Dependency-injection hooks primarily used by the tests.

    Returns
    -------
    dict
        ProtocolRecommendation-shaped dict.
    """
    medrag_fn = medrag_fn or _medrag_mod.retrieve
    similar_cases_fn = similar_cases_fn or _similar_cases_mod.find_similar

    # 1. match biomarker triggers ------------------------------------------
    matches = _detect_biomarker_triggers(features, zscores, risk_scores)

    if not matches:
        return _conservative_stub(features, risk_scores, flagged_conditions,
                                  medrag_fn)

    # 2. build primary + alternatives --------------------------------------
    primary_match = matches[0]
    alternative_matches = matches[1:3]

    conds = list(flagged_conditions or _derive_conditions(risk_scores, zscores))

    primary = _assemble_protocol(
        primary_match,
        features=features,
        risk_scores=risk_scores,
        conditions=conds,
        embedding=embedding,
        db_session=db_session,
        deterministic_seed=deterministic_seed,
        medrag_fn=medrag_fn,
        similar_cases_fn=similar_cases_fn,
        is_primary=True,
    )

    alternatives = [
        _assemble_protocol(
            m,
            features=features,
            risk_scores=risk_scores,
            conditions=conds,
            embedding=embedding,
            db_session=db_session,
            deterministic_seed=deterministic_seed,
            medrag_fn=medrag_fn,
            similar_cases_fn=similar_cases_fn,
            is_primary=False,
        )
        for m in alternative_matches
    ]

    primary["alternative_protocols"] = alternatives
    return primary


# -------------------------------------------------------------------- detectors
def _detect_biomarker_triggers(
    features: dict[str, Any],
    zscores: dict[str, Any],
    risk_scores: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return the ordered list of matching BIOMARKER_TARGET_MAP rows."""
    hits: list[tuple[float, dict[str, Any]]] = []

    asym = _safe_get(features, "asymmetry", "frontal_alpha_F3_F4", default=0.0)
    if isinstance(asym, (int, float)) and asym > 0.1:
        hits.append((float(asym) + 1.0,
                     _bind("frontal_alpha_asymmetry_positive")))

    # flags + z-score evidence for theta @ Fz
    if _zflag(zscores, "spectral.bands.theta", "Fz") or \
            _has_flag(features, "elevated_theta_at_Fz"):
        if _score(risk_scores, "adhd_like") >= 0.4:
            hits.append((1.5 + _score(risk_scores, "adhd_like"),
                         _bind("elevated_theta_at_Fz")))

    if _zflag(zscores, "spectral.bands.alpha", "Pz") or \
            _has_flag(features, "elevated_posterior_alpha"):
        if _score(risk_scores, "anxiety_like") >= 0.4:
            hits.append((1.2 + _score(risk_scores, "anxiety_like"),
                         _bind("elevated_posterior_alpha")))

    paf = _mean_paf(features)
    if paf is not None and paf < 9.0:
        if _score(risk_scores, "cognitive_decline_like") >= 0.4:
            hits.append((1.2 + _score(risk_scores, "cognitive_decline_like"),
                         _bind("reduced_paf")))

    delta = _frontal_delta(features)
    if delta is not None and delta > 1.3:
        if _score(risk_scores, "tbi_residual_like") >= 0.4:
            hits.append((1.0 + _score(risk_scores, "tbi_residual_like"),
                         _bind("elevated_delta_frontal")))

    if _has_flag(features, "reduced_sleep_spindles"):
        if _score(risk_scores, "insomnia_like") >= 0.4:
            hits.append((1.0 + _score(risk_scores, "insomnia_like"),
                         _bind("reduced_sleep_spindles")))

    hits.sort(key=lambda pair: pair[0], reverse=True)
    return [h[1] for h in hits]


def _bind(key: str) -> dict[str, Any]:
    row = dict(BIOMARKER_TARGET_MAP[key])
    row["trigger"] = key
    return row


# -------------------------------------------------------------------- assembly
def _assemble_protocol(
    match: dict[str, Any],
    *,
    features: dict[str, Any],
    risk_scores: dict[str, Any],
    conditions: list[str],
    embedding: list[float] | None,
    db_session: Any | None,
    deterministic_seed: int | None,
    medrag_fn: Callable[..., list[dict[str, Any]]],
    similar_cases_fn: Callable[..., Any],
    is_primary: bool,
) -> dict[str, Any]:
    """Build a single ProtocolRecommendation dict for one match."""
    modality: str = match["modality"]
    target: str = match["target"]
    condition: str = match["condition"]
    trigger: str = match["trigger"]

    # --- 2. MedRAG citations --------------------------------------------
    rag_query = {
        "flagged_conditions": [condition] + [
            c for c in conditions if c and c != condition
        ],
        "modalities": [modality],
    }
    try:
        papers = medrag_fn(rag_query, {}, k=5) or []
    except Exception as exc:
        log.warning("medrag_fn raised %s; continuing without citations.", exc)
        papers = []
    citations = _format_citations(papers)

    # --- 3. similar-case cohort -----------------------------------------
    cohort_note = ""
    if embedding is not None:
        try:
            cohort = similar_cases_fn(
                embedding,
                k=10,
                filters={"condition": condition},
                db_session=db_session,
                deterministic_seed=deterministic_seed,
            )
            cohort_note = _cohort_summary(cohort)
        except Exception as exc:
            log.warning("similar_cases_fn raised %s; skipping cohort note.", exc)

    # --- 4. S-O-Z-O session plan ----------------------------------------
    dose = dict(_DOSE_DEFAULTS.get(modality, {
        "sessions": 20, "intensity": "device-default",
        "duration_min": 30, "frequency": "per clinician",
    }))
    total_sessions = int(dose.get("sessions") or 20)
    session_plan = _sozo_plan(total_sessions, modality)

    # --- 5. assemble + sanitise ----------------------------------------
    rationale_raw = _compose_rationale(
        trigger=trigger, modality=modality, target=target,
        condition=condition, risk_scores=risk_scores,
        cohort_note=cohort_note,
        n_citations=len(citations), is_primary=is_primary,
    )
    rationale = _sanitise(rationale_raw)[:1200]

    risk_label = _CONDITION_TO_RISK.get(condition, f"{condition}_like")
    confidence = _confidence(
        n_citations=len(citations),
        risk_score=_score(risk_scores, risk_label)
            if risk_label in (risk_scores or {}) else None,
    )

    return {
        "primary_modality": modality,
        "target_region": target,
        "dose": dose,
        "session_plan": session_plan,
        "contraindications": list(_CONTRAINDICATIONS.get(modality, [])),
        "expected_response_window_weeks": list(
            _RESPONSE_WINDOW.get(modality, (4, 12))
        ),
        "citations": citations,
        "confidence": confidence,
        "alternative_protocols": [],
        "rationale": rationale,
    }


def _sozo_plan(total: int, modality: str) -> dict[str, dict[str, Any]]:
    """Split total sessions across Induction / Consolidation / Maintenance."""
    induction = max(1, total // 3)
    consolidation = max(1, total // 3)
    maintenance = max(0, total - induction - consolidation)
    return {
        "induction": {
            "sessions": induction,
            "notes": (
                f"S phase: daily {modality} dosing to induce neuroplastic change; "
                "track tolerability after every 5 sessions."
            ),
        },
        "consolidation": {
            "sessions": consolidation,
            "notes": (
                "O-Z phase: taper cadence to 3x/week; pair with behavioural "
                "loading (cognitive, sleep, or exposure tasks) matched to the "
                "targeted network."
            ),
        },
        "maintenance": {
            "sessions": maintenance,
            "notes": (
                "O phase: booster sessions 1-2x/week for 4–6 weeks, then "
                "clinician-gated tail-off based on symptom trajectory."
            ),
        },
    }


# -------------------------------------------------------------------- conservative stub
def _conservative_stub(
    features: dict[str, Any],  # noqa: ARG001
    risk_scores: dict[str, Any],
    flagged_conditions: list[str] | None,
    medrag_fn: Callable[..., list[dict[str, Any]]],
) -> dict[str, Any]:
    """Return a low-confidence fallback when no biomarker triggers fire."""
    conds = list(flagged_conditions or [])
    try:
        papers = medrag_fn({"flagged_conditions": conds}, {}, k=3) or []
    except Exception:
        papers = []

    rationale = _sanitise(
        "No clearly actionable qEEG biomarker trigger was detected above "
        "threshold. Similarity indices and flagged findings do not yet "
        "converge on a single target. Suggesting a conservative wellness "
        "plan and a repeat qEEG in 4-6 weeks before considering a "
        "neuromodulation protocol consideration. Clinician judgement "
        "required."
    )
    return {
        "primary_modality": "observation",
        "target_region": "n/a",
        "dose": {"sessions": 0, "intensity": "n/a", "duration_min": 0, "frequency": "n/a"},
        "session_plan": _sozo_plan(0, "observation"),
        "contraindications": [],
        "expected_response_window_weeks": [0, 0],
        "citations": _format_citations(papers),
        "confidence": "low",
        "alternative_protocols": [],
        "rationale": rationale[:1200],
    }


# -------------------------------------------------------------------- helpers
_BANNED_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"treatment recommendations?", re.IGNORECASE), "protocol consideration"),
    (re.compile(r"\bdiagnos\w*", re.IGNORECASE), "finding"),
]


def _sanitise(text: str) -> str:
    """Scrub banned clinical language per CONTRACT_V2 §7."""
    out = text or ""
    for pat, replacement in _BANNED_PATTERNS:
        out = pat.sub(replacement, out)
    return out


def _format_citations(papers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, p in enumerate(papers, start=1):
        out.append(
            {
                "n": i,
                "pmid": p.get("pmid"),
                "doi": p.get("doi"),
                "title": p.get("title") or "",
                "url": p.get("url") or "",
            }
        )
    return out


def _compose_rationale(
    *,
    trigger: str,
    modality: str,
    target: str,
    condition: str,
    risk_scores: dict[str, Any],
    cohort_note: str,
    n_citations: int,
    is_primary: bool,
) -> str:
    risk_label = _CONDITION_TO_RISK.get(condition, f"{condition}_like")
    rs = _score(risk_scores, risk_label)
    role = "Primary" if is_primary else "Alternative"
    base = (
        f"{role} consideration: {modality} over {target}. "
        f"Trigger biomarker: {trigger}. "
        f"Associated condition similarity index ({risk_label}) = {rs:.2f}. "
        f"Grounded in {n_citations} retrieved papers."
    )
    if cohort_note:
        base += f" {cohort_note}"
    return base


def _cohort_summary(cohort: Any) -> str:
    if isinstance(cohort, dict) and "aggregate" in cohort:
        agg = cohort["aggregate"]
        return (
            f"Aggregate cohort (n={agg.get('n')}): responder rate "
            f"{float(agg.get('responder_rate', 0.0)) * 100:.0f}%."
        )
    if isinstance(cohort, list) and cohort:
        responders = sum(
            1 for c in cohort if (c.get("outcome") or {}).get("responder")
        )
        rate = responders / len(cohort) if cohort else 0.0
        return (
            f"Top-{len(cohort)} similar cases: {responders} responders "
            f"({rate * 100:.0f}%)."
        )
    return ""


def _confidence(*, n_citations: int, risk_score: float | None) -> str:
    if n_citations >= 3 and (risk_score is None or risk_score >= 0.5):
        return "high"
    if n_citations >= 1:
        return "moderate"
    return "low"


def _derive_conditions(
    risk_scores: dict[str, Any],
    zscores: dict[str, Any],
) -> list[str]:
    out: list[str] = []
    for label, payload in (risk_scores or {}).items():
        if not isinstance(payload, dict):
            continue
        if float(payload.get("score", 0.0)) >= 0.4:
            out.append(label.replace("_like", ""))
    for flag in (zscores or {}).get("flagged", []) or []:
        path = flag.get("metric", "") if isinstance(flag, dict) else ""
        if "adhd" in path and "adhd" not in out:
            out.append("adhd")
    return out


def _score(risk_scores: dict[str, Any], label: str) -> float:
    entry = (risk_scores or {}).get(label)
    if isinstance(entry, dict):
        v = entry.get("score")
        if isinstance(v, (int, float)):
            return float(v)
    return 0.0


def _zflag(zscores: dict[str, Any], metric_prefix: str, channel: str) -> bool:
    for flag in (zscores or {}).get("flagged", []) or []:
        if not isinstance(flag, dict):
            continue
        if (flag.get("metric") or "").startswith(metric_prefix) and \
                flag.get("channel") == channel:
            return True
    return False


def _safe_get(d: Any, *keys: str, default: Any = None) -> Any:
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
        if cur is None:
            return default
    return cur


def _has_flag(features: dict[str, Any], flag: str) -> bool:
    flags = features.get("flags") or features.get("qeeg_flags") or []
    return flag in set(flags) if isinstance(flags, (list, tuple, set)) else False


def _mean_paf(features: dict[str, Any]) -> float | None:
    paf = _safe_get(features, "spectral", "peak_alpha_freq")
    if not isinstance(paf, dict):
        return None
    vals = [v for v in paf.values() if isinstance(v, (int, float))]
    return float(sum(vals) / len(vals)) if vals else None


def _frontal_delta(features: dict[str, Any]) -> float | None:
    delta = _safe_get(features, "spectral", "bands", "delta", "absolute_uv2")
    if not isinstance(delta, dict):
        return None
    frontal = [delta.get(ch) for ch in ("Fp1", "Fp2", "F3", "F4", "Fz")
               if isinstance(delta.get(ch), (int, float))]
    return float(sum(frontal) / len(frontal)) if frontal else None


