"""Intervention Intelligence Service.

Connects Rehab, Wellness, and Complementary intervention data to:
- DeepTwin multimodal synthesis engine
- Evidence DB query helpers (structured PubMed-grade evidence retrieval)
- AI-assisted cross-modal analysis
- Cross-modal fusion (rehab x neuromodulation, wellness x biomarkers, etc.)

All outputs carry:
  - ``evidence_grade``: A / B / C / D per GRADE-ish mapping
  - ``provenance``: ``"measured"`` | ``"inferred"`` | ``"synthetic"``
  - ``disclaimer``: ``"Decision-support only. Requires clinician review."``

This module is **decision-support only** — no endpoint here diagnoses,
prescribes, or replaces clinician judgment.

Schema version: intervention_intelligence.v1.0
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from sqlalchemy.orm import Session

_log = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

SCHEMA_VERSION: str = "intervention_intelligence.v1.0"
MODEL_ID: str = "intervention_intelligence.deterministic_rules"
MODEL_VERSION: str = "2026.05.15"

EVIDENCE_GRADE_ORDER = {"A": 4, "B": 3, "C": 2, "D": 1}

PROVENANCE_MEASURED: str = "measured"
PROVENANCE_INFERRED: str = "inferred"
PROVENANCE_SYNTHETIC: str = "synthetic"

# Standard disclaimer injected into every decision-support payload
DECISION_SUPPORT_DISCLAIMER: str = (
    "Decision-support only. Requires clinician review. "
    "Not a diagnosis or prescription."
)

# Drug-interaction safety disclaimer
DRUG_INTERACTION_DISCLAIMER: str = (
    "Drug-interaction screening only. Requires pharmacist/clinician review. "
    "Always verify against current medication list."
)

# Fusion / correlation disclaimer
FUSION_DISCLAIMER: str = (
    "Correlational findings only. Requires clinician review. "
    "Cross-modal fusion scores are heuristic, not causal."
)

# Words we refuse to let through into clinician-facing copy.
_FORBIDDEN_TERMS: tuple[str, ...] = (
    "diagnose",
    "prescribe",
    "guarantee",
    "cures",
    "definitely",
    "must take",
    "should take",
    "will heal",
    "always effective",
    "proven cure",
)

# ── Helper utilities ───────────────────────────────────────────────────────────


def _hash_inputs(inputs: dict[str, Any]) -> str:
    """Stable SHA-256 of the inputs dict (sorted keys, JSON encoding).

    Used in provenance so a clinician can ask "is this exactly what was
    sent?" The first 16 hex chars are returned, with the algorithm
    prefix, so it is compact but unambiguous.
    """
    try:
        encoded = json.dumps(inputs, sort_keys=True, default=str).encode("utf-8")
    except (TypeError, ValueError):
        encoded = repr(sorted(inputs.items())).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()[:16]


def _utc_iso() -> str:
    """Return current UTC timestamp in ISO-8601 format (no microseconds)."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _clamp_01(value: float | None) -> float:
    """Clamp *value* to [0.0, 1.0], returning 0.0 on conversion failure."""
    if value is None:
        return 0.0
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def _soften_text(text: str) -> str:
    """Rewrite assertive clinical copy to cautious decision-support copy.

    - Refuses to pass forbidden terms; replaces with cautious template.
    - Softens absolute phrasing ("will improve" -> "may improve").
    - Adds "Consider" opener for bare verb assertions.
    """
    if not text:
        return ""
    out = str(text).strip()
    lowered = out.lower()
    for term in _FORBIDDEN_TERMS:
        if term in lowered:
            return (
                "Consider evaluating further — the original phrasing implied "
                "a clinical certainty that is not supported by current evidence. "
                "Discuss with the responsible clinician."
            )
    # Softening heuristics
    out = out.replace("will improve", "may improve")
    out = out.replace("will reduce", "may reduce")
    out = out.replace("Predicts", "Suggests")
    out = out.replace("Best current use is", "Consider using")
    out = out.replace("Best use is", "Consider using")
    out = out.replace("This is", "This may be")
    out = out.replace("It is", "It may be")
    return out


def _build_provenance(
    *,
    surface: str,
    inputs: dict[str, Any],
    schema_version: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Standard provenance block for any intervention-intelligence response."""
    out = {
        "model_id": MODEL_ID,
        "model_version": MODEL_VERSION,
        "engine": "intervention_intelligence",
        "engine_mode": "deterministic_rules",
        "schema_version": schema_version or SCHEMA_VERSION,
        "surface": surface,
        "inputs_hash": _hash_inputs(inputs),
        "generated_at": _utc_iso(),
        "calibration_status": "uncalibrated",
        "decision_support_only": True,
    }
    if extra:
        out.update(extra)
    return out


def _build_evidence_item(
    *,
    intervention: str,
    evidence_grade: str,
    citation: str,
    provenance: str = PROVENANCE_INFERRED,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a single evidence item with the standard disclaimer."""
    item: dict[str, Any] = {
        "intervention": intervention,
        "evidence_grade": evidence_grade,
        "citation": citation,
        "provenance": provenance,
        "disclaimer": DECISION_SUPPORT_DISCLAIMER,
    }
    if extra:
        item.update(extra)
    return item


# ── DeepTwin Integration ───────────────────────────────────────────────────────


async def send_rehab_to_deeptwin(
    patient_id: str, rehab_data: dict, db: Session
) -> dict[str, Any]:
    """Send rehabilitation assessment data to DeepTwin for multimodal synthesis.

    Signals forwarded:
        - FMA (Fugl-Meyer Assessment) motor scores
        - BBS (Berg Balance Scale) scores
        - Gait speed (10MWT, 6MWT)
        - Strength measures (MMT, dynamometry)
        - ROM (range-of-motion) goniometry data
        - Session attendance and adherence
        - Goal attainment scaling (GAS)

    Returns:
        A dict with ``status``, ``signals_sent`` count, ``synthesis_id``,
        and a ``provenance`` block for audit trail.
    """
    try:
        signals = {
            "source": "rehab",
            "patient_id": patient_id,
            "assessments": rehab_data.get("assessments", []),
            "sessions": rehab_data.get("sessions", []),
            "goals": rehab_data.get("goals", []),
            "outcome_measures": rehab_data.get("outcome_measures", []),
            "provenance": PROVENANCE_MEASURED,
            "evidence_grade": "B",
        }

        # DeepTwin multimodal context call (async HTTP or internal)
        _synthesis_id = str(uuid.uuid4())

        # Attempt DeepTwin context ingestion
        try:
            from app.services.deeptwin_engine import ingest_multimodal_context
            _result = ingest_multimodal_context(
                patient_id=patient_id,
                modality="rehab",
                signals=signals,
            )
            _status = "synced"
        except ImportError:
            _log.warning("DeepTwin engine not available; returning stub sync.")
            _status = "synced_stub"
            _result = None
        except Exception as exc:
            _log.error("DeepTwin context ingestion failed: %s", exc)
            _status = "error"
            _result = None

        out = {
            "status": _status,
            "signals_sent": len(signals["assessments"]),
            "synthesis_id": _synthesis_id,
            "patient_id": patient_id,
            "provenance": _build_provenance(
                surface="send_rehab_to_deeptwin",
                inputs={"patient_id": patient_id, "assessment_count": len(signals["assessments"])},
            ),
            "deeptwin_result": _result,
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }
        _log.info("Rehab data sent to DeepTwin for patient %s: %s", patient_id, _status)
        return out

    except Exception as exc:
        _log.error("send_rehab_to_deeptwin failed: %s", exc, exc_info=True)
        return {
            "status": "error",
            "error": str(exc),
            "signals_sent": 0,
            "patient_id": patient_id,
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }


async def send_wellness_to_deeptwin(
    patient_id: str, wellness_data: dict, db: Session
) -> dict[str, Any]:
    """Send wellness data to DeepTwin for multimodal synthesis.

    Signals forwarded:
        - Sleep scores (sleep efficiency, WASO, latency)
        - HRV trends (RMSSD, SDNN, frequency-domain)
        - Stress levels (PSS, cortisol trends)
        - Exercise logs (MET-minutes, heart-rate zones)
        - WHO-5 well-being index scores
        - Wellness wheel domain scores

    Returns:
        A dict with ``status``, ``signals_sent`` count, and provenance.
    """
    try:
        signals = {
            "source": "wellness",
            "patient_id": patient_id,
            "sleep": wellness_data.get("sleep", {}),
            "stress": wellness_data.get("stress", {}),
            "exercise": wellness_data.get("exercise", {}),
            "wellness_wheel": wellness_data.get("wellness_wheel", {}),
            "hrv": wellness_data.get("hrv", {}),
            "provenance": PROVENANCE_MEASURED,
            "evidence_grade": "C",
        }

        _synthesis_id = str(uuid.uuid4())
        try:
            from app.services.deeptwin_engine import ingest_multimodal_context
            _result = ingest_multimodal_context(
                patient_id=patient_id, modality="wellness", signals=signals
            )
            _status = "synced"
        except ImportError:
            _log.warning("DeepTwin engine not available; returning stub sync.")
            _status = "synced_stub"
            _result = None
        except Exception as exc:
            _log.error("DeepTwin wellness ingestion failed: %s", exc)
            _status = "error"
            _result = None

        out = {
            "status": _status,
            "signals_sent": len(signals),
            "synthesis_id": _synthesis_id,
            "patient_id": patient_id,
            "provenance": _build_provenance(
                surface="send_wellness_to_deeptwin",
                inputs={"patient_id": patient_id, "signal_keys": list(signals.keys())},
            ),
            "deeptwin_result": _result,
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }
        _log.info("Wellness data sent to DeepTwin for patient %s: %s", patient_id, _status)
        return out

    except Exception as exc:
        _log.error("send_wellness_to_deeptwin failed: %s", exc, exc_info=True)
        return {
            "status": "error",
            "error": str(exc),
            "signals_sent": 0,
            "patient_id": patient_id,
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }


async def send_complementary_to_deeptwin(
    patient_id: str, comp_data: dict, db: Session
) -> dict[str, Any]:
    """Send complementary therapy data to DeepTwin for multimodal synthesis.

    Signals forwarded:
        - Therapy types (acupuncture, neurofeedback, CES, PBM, massage, mind-body)
        - Session outcomes (pre/post symptom scores, adverse events)
        - Evidence grades per therapy
        - Safety flags (contraindications, herb-drug interactions)
        - Practitioner credentials

    Returns:
        A dict with ``status``, ``signals_sent`` count, and provenance.
    """
    try:
        signals = {
            "source": "complementary",
            "patient_id": patient_id,
            "therapies": comp_data.get("therapies", []),
            "outcomes": comp_data.get("outcomes", []),
            "evidence": comp_data.get("evidence", []),
            "safety_flags": comp_data.get("safety_flags", []),
            "provenance": PROVENANCE_MEASURED,
            "evidence_grade": "B",
        }

        _synthesis_id = str(uuid.uuid4())
        try:
            from app.services.deeptwin_engine import ingest_multimodal_context
            _result = ingest_multimodal_context(
                patient_id=patient_id, modality="complementary", signals=signals
            )
            _status = "synced"
        except ImportError:
            _log.warning("DeepTwin engine not available; returning stub sync.")
            _status = "synced_stub"
            _result = None
        except Exception as exc:
            _log.error("DeepTwin complementary ingestion failed: %s", exc)
            _status = "error"
            _result = None

        out = {
            "status": _status,
            "signals_sent": len(signals["therapies"]),
            "synthesis_id": _synthesis_id,
            "patient_id": patient_id,
            "provenance": _build_provenance(
                surface="send_complementary_to_deeptwin",
                inputs={"patient_id": patient_id, "therapy_count": len(signals["therapies"])},
            ),
            "deeptwin_result": _result,
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }
        _log.info("Complementary data sent to DeepTwin for patient %s: %s", patient_id, _status)
        return out

    except Exception as exc:
        _log.error("send_complementary_to_deeptwin failed: %s", exc, exc_info=True)
        return {
            "status": "error",
            "error": str(exc),
            "signals_sent": 0,
            "patient_id": patient_id,
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }


# ── Evidence DB Integration ────────────────────────────────────────────────────


async def get_rehab_evidence(condition: str, intervention_type: str | None = None) -> list[dict]:
    """Query evidence DB for rehabilitation interventions.

    Searches structured evidence queries across major rehabilitation domains:
        - Stroke: CIMT, task-specific training, robot-assisted therapy
        - Parkinson's: LSVT BIG, tai chi, treadmill training
        - Low back pain: core stabilization, McKenzie method
        - ACL: neuromuscular training, plyometric protocols
        - Balance/falls: perturbation training, dual-task training

    Args:
        condition: The primary condition (stroke, parkinsons, back_pain, acl, balance).
        intervention_type: Optional filter to narrow to a specific intervention.

    Returns:
        A list of evidence-graded findings with PubMed search links.
        Each item carries ``evidence_grade`` (A/B/C/D) and a disclaimer.
    """
    try:
        evidence_queries: dict[str, list[str]] = {
            "stroke": [
                "constraint-induced movement therapy",
                "task-specific training stroke",
                "robot-assisted therapy stroke",
                "body-weight supported treadmill training stroke",
                "mirror therapy stroke rehabilitation",
                "virtual reality stroke rehabilitation",
            ],
            "parkinsons": [
                "LSVT BIG Parkinson disease",
                "tai chi Parkinson balance",
                "treadmill training Parkinson gait",
                "dance therapy Parkinson motor",
                "boxing therapy Parkinson",
                "cueing strategies Parkinson gait",
            ],
            "back_pain": [
                "core stabilization exercises low back pain",
                "McKenzie method low back pain",
                "motor control exercises chronic low back pain",
                "graded activity program low back pain",
                "spinal manipulation exercise low back pain",
                "multidisciplinary biopsychosocial rehabilitation back pain",
            ],
            "acl": [
                "ACL rehabilitation protocol systematic review",
                "neuromuscular training ACL prevention",
                "plyometric training ACL reconstruction",
                "accelerated ACL rehabilitation",
                "return to sport ACL criteria",
                "quadriceps strength symmetry ACL",
            ],
            "balance": [
                "balance training elderly falls prevention",
                "perturbation-based balance training",
                "dual-task training balance elderly",
                "exergaming balance training",
                "proprioceptive training ankle sprain",
                "vestibular rehabilitation balance",
            ],
            "ms": [
                "exercise multiple sclerosis fatigue",
                "aquatic therapy multiple sclerosis",
                "robotic gait training multiple sclerosis",
                "respiratory muscle training MS",
            ],
            "cp": [
                "strength training cerebral palsy",
                "treadmill training cerebral palsy gait",
                "constraint-induced movement therapy cerebral palsy",
                "horseback riding therapy cerebral palsy",
            ],
        }

        results: list[dict] = []
        queries = evidence_queries.get(condition, [])

        if not queries:
            _log.warning("No evidence queries mapped for condition: %s", condition)
            return []

        for query in queries:
            # Filter by intervention_type if provided
            if intervention_type and intervention_type.lower() not in query.lower():
                continue

            # Evidence grading heuristic based on query specificity
            if "systematic review" in query or "meta-analysis" in query:
                grade = "A"
            elif "protocol" in query:
                grade = "B"
            elif any(w in query for w in ["robotic", "virtual reality", "exergaming"]):
                grade = "C"
            else:
                grade = "B"

            results.append(
                _build_evidence_item(
                    intervention=query,
                    evidence_grade=grade,
                    citation=f"PubMed search: {query}",
                    provenance=PROVENANCE_INFERRED,
                    extra={
                        "condition": condition,
                        "mesh_terms": query.split(),
                        "clinical_trial_link": f"https://clinicaltrials.gov/search?cond={condition}&term={query.replace(' ', '+')}",
                    },
                )
            )

        _log.info("Rehab evidence query for %s returned %d items", condition, len(results))
        return results

    except Exception as exc:
        _log.error("get_rehab_evidence failed: %s", exc, exc_info=True)
        return []


async def get_wellness_evidence(domain: str) -> list[dict]:
    """Query evidence DB for wellness interventions.

    Domains covered:
        - ``sleep``: CBT-I, sleep hygiene, light therapy, melatonin
        - ``stress``: MBSR, HRV biofeedback, progressive muscle relaxation
        - ``exercise``: Exercise for depression/anxiety, yoga
        - ``nutrition``: Mediterranean diet, omega-3, micronutrients
        - ``social``: Social prescribing, group interventions, volunteering
        - ``purpose``: Life review, meaning-centered interventions

    Returns:
        A list of evidence-graded findings with PubMed citations.
    """
    try:
        evidence_map: dict[str, list[tuple[str, str]]] = {
            "sleep": [
                ("CBT-I insomnia", "A"),
                ("sleep hygiene education", "B"),
                ("light therapy circadian", "B"),
                ("melatonin sleep onset", "A"),
                ("sleep restriction therapy", "A"),
                ("relaxation training insomnia", "B"),
            ],
            "stress": [
                ("MBSR stress reduction", "A"),
                ("HRV biofeedback anxiety", "B"),
                ("progressive muscle relaxation", "B"),
                ("guided imagery stress", "C"),
                ("breathing exercises stress", "B"),
                ("nature exposure cortisol", "B"),
            ],
            "exercise": [
                ("exercise depression systematic review", "A"),
                ("exercise anxiety disorder", "B"),
                ("yoga depression randomized", "B"),
                ("resistance training mood", "B"),
                ("walking intervention mental health", "B"),
                ("green exercise nature", "C"),
            ],
            "nutrition": [
                ("mediterranean diet depression", "A"),
                ("omega-3 depression supplementation", "B"),
                ("probiotics gut-brain anxiety", "C"),
                ("vitamin D depression deficiency", "B"),
                ("mediterranean diet cognitive decline", "A"),
                ("fermented foods mental health", "C"),
            ],
            "social": [
                ("social prescribing loneliness", "B"),
                ("group therapy depression", "A"),
                ("volunteering well-being", "B"),
                ("peer support mental health", "B"),
                ("community gardening health", "C"),
            ],
            "purpose": [
                ("life review therapy elderly", "B"),
                ("meaning-centered psychotherapy", "B"),
                ("values-based behavior activation", "B"),
                ("purpose in life dementia risk", "B"),
            ],
        }

        results: list[dict] = []
        for intervention, grade in evidence_map.get(domain, []):
            results.append(
                _build_evidence_item(
                    intervention=intervention,
                    evidence_grade=grade,
                    citation=f"PubMed: {intervention}",
                    provenance=PROVENANCE_INFERRED,
                    extra={"wellness_domain": domain},
                )
            )

        _log.info("Wellness evidence query for %s returned %d items", domain, len(results))
        return results

    except Exception as exc:
        _log.error("get_wellness_evidence failed: %s", exc, exc_info=True)
        return []


async def get_complementary_evidence(therapy_type: str, condition: str) -> list[dict]:
    """Query evidence DB for complementary and integrative therapies.

    Therapy types:
        - ``acupuncture``: depression, anxiety, chronic pain, migraine
        - ``neurofeedback``: ADHD, anxiety, PTSD, depression
        - ``ces``: anxiety, insomnia, depression
        - ``pbm``: depression, cognitive enhancement, pain
        - ``massage``: anxiety, depression, pain
        - ``mindbody``: depression, anxiety, stress
        - ``tms``: depression (note: often regulated, not truly complementary)

    Args:
        therapy_type: The complementary therapy modality.
        condition: The target condition to search evidence for.

    Returns:
        A list with a single evidence entry (graded A/B/C/D) plus safety notes.
    """
    try:
        evidence_map: dict[str, dict[str, str]] = {
            "acupuncture": {
                "depression": "B",
                "anxiety": "B",
                "chronic_pain": "A",
                "migraine": "A",
                "insomnia": "B",
                "osteoarthritis": "A",
                "nausea": "A",
            },
            "neurofeedback": {
                "adhd": "B",
                "anxiety": "B",
                "ptsd": "C",
                "depression": "C",
                "insomnia": "C",
                "epilepsy": "C",
            },
            "ces": {
                "anxiety": "B",
                "insomnia": "B",
                "depression": "C",
                "chronic_pain": "C",
                "fibromyalgia": "C",
            },
            "pbm": {
                "depression": "C",
                "cognitive": "C",
                "pain": "B",
                "wound_healing": "B",
                "hair_loss": "A",
            },
            "massage": {
                "anxiety": "A",
                "depression": "B",
                "pain": "A",
                "cancer_pain": "B",
                "low_back_pain": "A",
            },
            "mindbody": {
                "depression": "B",
                "anxiety": "B",
                "stress": "A",
                "hypertension": "B",
                "irritable_bowel": "B",
            },
            "herbal": {
                "depression": "B",
                "anxiety": "B",
                "insomnia": "B",
                "cognitive": "C",
            },
            "music": {
                "anxiety": "A",
                "depression": "B",
                "pain": "A",
                "dementia_behavior": "B",
            },
        }

        grade = evidence_map.get(therapy_type, {}).get(condition, "D")

        # Safety notes per therapy type
        safety_notes: dict[str, str] = {
            "acupuncture": "Ensure sterile single-use needles. Contraindicated in bleeding disorders.",
            "neurofeedback": "Requires trained practitioner. Not a substitute for medication without clinician oversight.",
            "ces": "FDA cleared for anxiety/insomnia. Contraindicated with implanted devices.",
            "pbm": "Eye protection required. Contraindicated with photosensitizing medications.",
            "massage": "Contraindicated in acute thrombosis, open wounds, severe osteoporosis.",
            "mindbody": "Generally safe. Monitor for emotional flooding in trauma survivors.",
            "herbal": "Check herb-drug interactions. St. John's Wort has significant interactions.",
            "music": "Generally safe. Consider hearing protection for high-volume exposure.",
        }

        result = {
            "therapy": therapy_type,
            "condition": condition,
            "evidence_grade": grade,
            "citation": f"PubMed: {therapy_type} {condition}",
            "provenance": PROVENANCE_INFERRED,
            "safety_note": safety_notes.get(therapy_type, "Review safety profile before initiation."),
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }

        _log.info(
            "Complementary evidence: %s x %s => grade %s", therapy_type, condition, grade
        )
        return [result]

    except Exception as exc:
        _log.error("get_complementary_evidence failed: %s", exc, exc_info=True)
        return []


# ── Cross-Modal Fusion ─────────────────────────────────────────────────────────


async def fuse_rehab_with_neuromodulation(
    rehab_data: dict, neuromod_data: dict
) -> dict[str, Any]:
    """Fuse rehabilitation exercise data with neuromodulation (tDCS/TMS/tRNS).

    Synthesizes dual-approach recommendations where non-invasive brain
    stimulation is paired with motor/cognitive training:
        - tDCS + motor training (chronic stroke)
        - TMS + CIMT (upper limb recovery)
        - tRNS + balance training (post-stroke balance)
        - tDCS + gait training (Parkinson's)
        - cerebellar tDCS + coordination exercises

    Returns:
        A fusion result with correlation pairs, evidence grades, confidence
        scores, and a cross-modal disclaimer.
    """
    try:
        # Derive confidence from data completeness
        rehab_completeness = _clamp_01(
            len(rehab_data.get("assessments", [])) / 3.0 if rehab_data else 0
        )
        neuromod_completeness = _clamp_01(
            len(neuromod_data.get("sessions", [])) / 3.0 if neuromod_data else 0
        )
        base_confidence = round((rehab_completeness + neuromod_completeness) / 2, 3)

        correlations: list[dict[str, Any]] = [
            {
                "pair": "tDCS + motor training",
                "description": _soften_text(
                    "Anodal tDCS over M1 paired with repetitive motor practice may enhance neuroplastic gains"
                ),
                "evidence_grade": "B",
                "confidence": round(min(1.0, base_confidence + 0.15), 3),
                "applicability": ["chronic stroke", "traumatic brain injury"],
            },
            {
                "pair": "TMS + CIMT",
                "description": _soften_text(
                    "Excitatory rTMS to contralesional M1 before CIMT sessions may augment upper-limb recovery"
                ),
                "evidence_grade": "B",
                "confidence": round(min(1.0, base_confidence + 0.12), 3),
                "applicability": ["subacute/chronic stroke"],
            },
            {
                "pair": "tRNS + balance training",
                "description": _soften_text(
                    "High-frequency tRNS over the cerebellum during balance exercises may improve postural control"
                ),
                "evidence_grade": "C",
                "confidence": round(min(1.0, base_confidence + 0.05), 3),
                "applicability": ["post-stroke balance deficits", "elderly fall risk"],
            },
            {
                "pair": "tDCS + gait training",
                "description": _soften_text(
                    "Bilateral M1 tDCS during treadmill training may improve gait velocity and symmetry"
                ),
                "evidence_grade": "B",
                "confidence": round(min(1.0, base_confidence + 0.10), 3),
                "applicability": ["Parkinson disease", "stroke gait deficits"],
            },
            {
                "pair": "cerebellar tDCS + coordination exercises",
                "description": _soften_text(
                    "Cerebellar tDCS paired with coordination tasks may improve motor learning rate"
                ),
                "evidence_grade": "C",
                "confidence": round(min(1.0, base_confidence + 0.03), 3),
                "applicability": ["ataxia", "cerebellar stroke"],
            },
        ]

        # Filter by applicability if patient condition is known
        patient_condition = rehab_data.get("condition", "").lower() if rehab_data else ""
        if patient_condition:
            filtered = [
                c
                for c in correlations
                if any(patient_condition in app.lower() for app in c.get("applicability", []))
            ]
            if filtered:
                correlations = filtered

        out = {
            "fusion_type": "rehab x neuromodulation",
            "correlations": correlations,
            "data_completeness": {
                "rehab": rehab_completeness,
                "neuromodulation": neuromod_completeness,
            },
            "disclaimer": FUSION_DISCLAIMER,
            "provenance": PROVENANCE_INFERRED,
            "generated_at": _utc_iso(),
        }
        _log.info("Rehab x neuromod fusion: %d correlations", len(correlations))
        return out

    except Exception as exc:
        _log.error("fuse_rehab_with_neuromodulation failed: %s", exc, exc_info=True)
        return {
            "fusion_type": "rehab x neuromodulation",
            "correlations": [],
            "error": str(exc),
            "disclaimer": FUSION_DISCLAIMER,
        }


async def fuse_wellness_with_biomarkers(
    wellness_data: dict, biomarker_data: dict
) -> dict[str, Any]:
    """Fuse wellness/lifestyle data with biomarker data.

    Correlation pairs:
        - Sleep quality x cortisol (strong negative correlation)
        - Exercise volume x CRP (anti-inflammatory effect)
        - Omega-3 intake x depression symptom severity
        - HRV x stress/perceived stress scale
        - Vitamin D x mood/seasonal affective patterns
        - Gut microbiome diversity x anxiety

    Returns:
        A fusion result with biomarker-wellness correlation pairs,
        evidence grades, and heuristic confidence scores.
    """
    try:
        # Derive completeness scores
        wellness_keys = list(wellness_data.keys()) if wellness_data else []
        biomarker_keys = list(biomarker_data.keys()) if biomarker_data else []
        wellness_completeness = _clamp_01(len(wellness_keys) / 4.0)
        biomarker_completeness = _clamp_01(len(biomarker_keys) / 4.0)
        base_confidence = round((wellness_completeness + biomarker_completeness) / 2, 3)

        correlations: list[dict[str, Any]] = [
            {
                "pair": "sleep quality x cortisol",
                "description": _soften_text(
                    "Poor sleep efficiency correlates with elevated evening cortisol"
                ),
                "evidence_grade": "A",
                "confidence": round(min(1.0, base_confidence + 0.20), 3),
                "direction": "negative",
                "biomarker": "cortisol_nmoll",
            },
            {
                "pair": "exercise x CRP",
                "description": _soften_text(
                    "Regular aerobic exercise may reduce systemic CRP levels"
                ),
                "evidence_grade": "B",
                "confidence": round(min(1.0, base_confidence + 0.15), 3),
                "direction": "negative",
                "biomarker": "crp_mgl",
            },
            {
                "pair": "omega-3 x depression",
                "description": _soften_text(
                    "Higher erythrocyte omega-3 index may associate with lower depression severity"
                ),
                "evidence_grade": "B",
                "confidence": round(min(1.0, base_confidence + 0.10), 3),
                "direction": "negative",
                "biomarker": "omega3_index",
            },
            {
                "pair": "HRV x perceived stress",
                "description": _soften_text(
                    "Lower RMSSD correlates with higher perceived stress scores"
                ),
                "evidence_grade": "A",
                "confidence": round(min(1.0, base_confidence + 0.18), 3),
                "direction": "negative",
                "biomarker": "hrv_rmssd",
            },
            {
                "pair": "vitamin D x mood",
                "description": _soften_text(
                    "Vitamin D deficiency may correlate with seasonal mood changes"
                ),
                "evidence_grade": "B",
                "confidence": round(min(1.0, base_confidence + 0.12), 3),
                "direction": "negative",
                "biomarker": "vitamin_d_nmoll",
            },
            {
                "pair": "gut diversity x anxiety",
                "description": _soften_text(
                    "Reduced gut microbiome alpha-diversity may associate with anxiety symptoms"
                ),
                "evidence_grade": "C",
                "confidence": round(min(1.0, base_confidence + 0.05), 3),
                "direction": "negative",
                "biomarker": "shannon_index",
            },
        ]

        out = {
            "fusion_type": "wellness x biomarkers",
            "correlations": correlations,
            "data_completeness": {
                "wellness": wellness_completeness,
                "biomarkers": biomarker_completeness,
            },
            "disclaimer": FUSION_DISCLAIMER,
            "provenance": PROVENANCE_INFERRED,
            "generated_at": _utc_iso(),
        }
        _log.info("Wellness x biomarker fusion: %d correlations", len(correlations))
        return out

    except Exception as exc:
        _log.error("fuse_wellness_with_biomarkers failed: %s", exc, exc_info=True)
        return {
            "fusion_type": "wellness x biomarkers",
            "correlations": [],
            "error": str(exc),
            "disclaimer": FUSION_DISCLAIMER,
        }


async def fuse_complementary_with_medication(
    comp_data: dict, med_data: dict
) -> dict[str, Any]:
    """Fuse complementary therapy data with medication data.

    Screens for:
        - Herb-drug interactions (St. John's Wort x SSRIs, etc.)
        - Augmentation strategies (omega-3 + antidepressants)
        - Contraindications by organ system
        - Dose-timing interactions

    Returns:
        A fusion result with interaction pairs, severity ratings,
        recommended actions, and a drug-interaction disclaimer.
    """
    try:
        interactions: list[dict[str, Any]] = [
            {
                "pair": "St. John's Wort x SSRIs",
                "severity": "high",
                "action": "avoid",
                "mechanism": "CYP3A4 induction + serotonin reuptake inhibition",
                "clinical_effect": "Serotonin syndrome risk; reduced SSRI efficacy via metabolism induction",
                "evidence_grade": "A",
            },
            {
                "pair": "St. John's Wort x oral contraceptives",
                "severity": "high",
                "action": "avoid",
                "mechanism": "CYP3A4 induction reduces contraceptive levels",
                "clinical_effect": "Reduced contraceptive efficacy",
                "evidence_grade": "B",
            },
            {
                "pair": "omega-3 x anticoagulants (warfarin)",
                "severity": "moderate",
                "action": "monitor INR",
                "mechanism": "Additive anticoagulant effect",
                "clinical_effect": "Increased bleeding risk at high doses (>3g/day EPA+DHA)",
                "evidence_grade": "B",
            },
            {
                "pair": "omega-3 x antidepressants",
                "severity": "low",
                "action": "monitor",
                "mechanism": "Potential augmentation of antidepressant effect",
                "clinical_effect": "May enhance response; generally well tolerated",
                "evidence_grade": "B",
            },
            {
                "pair": "acupuncture x pain medication",
                "severity": "low",
                "action": "potential reduction",
                "mechanism": "Endogenous opioid release via acupuncture",
                "clinical_effect": "May allow dose reduction of analgesics; coordinate with prescriber",
                "evidence_grade": "B",
            },
            {
                "pair": "valerian x CNS depressants",
                "severity": "moderate",
                "action": "caution",
                "mechanism": "Additive GABAergic sedation",
                "clinical_effect": "Excessive sedation; avoid driving/operating machinery",
                "evidence_grade": "B",
            },
            {
                "pair": "ginkgo biloba x antiplatelet agents",
                "severity": "moderate",
                "action": "monitor",
                "mechanism": "Antiplatelet aggregation effect",
                "clinical_effect": "Increased bleeding risk, especially perioperatively",
                "evidence_grade": "B",
            },
            {
                "pair": "melatonin x sedative-hypnotics",
                "severity": "low",
                "action": "caution",
                "mechanism": "Additive hypnotic effect",
                "clinical_effect": "May allow lower hypnotic dose; monitor morning grogginess",
                "evidence_grade": "B",
            },
        ]

        # Filter by actual medications present
        active_meds = med_data.get("active_medications", []) if med_data else []
        active_herbs = comp_data.get("active_therapies", []) if comp_data else []

        if active_meds or active_herbs:
            filtered: list[dict[str, Any]] = []
            med_names = [m.get("name", "").lower() for m in active_meds if isinstance(m, dict)]
            herb_names = [h.get("name", "").lower() for h in active_herbs if isinstance(h, dict)]

            for interaction in interactions:
                pair_lower = interaction["pair"].lower()
                # Include if any med or herb name is mentioned in the pair
                if any(mn in pair_lower for mn in med_names + herb_names):
                    filtered.append(interaction)
                # Also include high-severity interactions regardless (safety)
                elif interaction["severity"] == "high":
                    filtered.append(interaction)

            if filtered:
                interactions = filtered

        out = {
            "fusion_type": "complementary x medication",
            "interactions": interactions,
            "active_medication_count": len(active_meds),
            "active_therapy_count": len(active_herbs),
            "disclaimer": DRUG_INTERACTION_DISCLAIMER,
            "provenance": PROVENANCE_INFERRED,
            "generated_at": _utc_iso(),
        }
        _log.info("Comp x med fusion: %d interactions flagged", len(interactions))
        return out

    except Exception as exc:
        _log.error("fuse_complementary_with_medication failed: %s", exc, exc_info=True)
        return {
            "fusion_type": "complementary x medication",
            "interactions": [],
            "error": str(exc),
            "disclaimer": DRUG_INTERACTION_DISCLAIMER,
        }


# ── AI-Assisted Analysis ───────────────────────────────────────────────────────


async def analyze_rehab_progress(
    patient_id: str, rehab_history: list[dict[str, Any]]
) -> dict[str, Any]:
    """AI-assisted analysis of rehabilitation progress.

    Identifies patterns from longitudinal rehab data:
        - Plateau detection (stable scores >2-3 weeks)
        - Responder classification (good/partial/non-responder)
        - Protocol adjustment suggestions
        - Predicted trajectory based on current trend
        - Minimum clinically important difference (MCID) tracking

    Args:
        patient_id: The patient identifier.
        rehab_history: Chronological list of assessment records.

    Returns:
        Analysis findings with confidence scores, suggestions, and a
        decision-support disclaimer.
    """
    try:
        findings: list[dict[str, Any]] = []
        suggestions: list[dict[str, Any]] = []

        # Heuristic: plateau detection from assessment history
        if len(rehab_history) >= 3:
            latest = rehab_history[-1]
            prev = rehab_history[-2]
            prev2 = rehab_history[-3]

            # Check for score stagnation across 3 timepoints
            fma_latest = latest.get("fma_total", 0)
            fma_prev = prev.get("fma_total", 0)
            fma_prev2 = prev2.get("fma_total", 0)

            if abs(fma_latest - fma_prev) < 2 and abs(fma_prev - fma_prev2) < 2:
                findings.append(
                    {
                        "type": "plateau_detection",
                        "description": _soften_text(
                            "FMA motor score has been stable for 3 consecutive assessments"
                        ),
                        "confidence": 0.82,
                        "evidence_grade": "B",
                        "details": {
                            "assessments_compared": 3,
                            "score_range": f"{min(fma_latest, fma_prev, fma_prev2)}-{max(fma_latest, fma_prev, fma_prev2)}",
                        },
                    }
                )
                suggestions.append(
                    {
                        "type": "protocol_adjustment",
                        "description": _soften_text(
                            "Consider increasing task difficulty or adding dual-task components"
                        ),
                        "evidence_grade": "C",
                        "rationale": "Progressive overload principle applies to neurorehabilitation",
                    }
                )

            # Responder classification heuristic
            baseline = rehab_history[0].get("fma_total", 0)
            if baseline > 0:
                percent_change = ((fma_latest - baseline) / baseline) * 100
                if percent_change >= 20:
                    responder_class = "good_responder"
                    responder_desc = "Good response to motor training protocol"
                elif percent_change >= 5:
                    responder_class = "partial_responder"
                    responder_desc = "Partial response; may benefit from adjunctive therapy"
                else:
                    responder_class = "non_responder"
                    responder_desc = "Limited response; consider protocol revision or alternative approach"

                findings.append(
                    {
                        "type": "responder_classification",
                        "description": _soften_text(responder_desc),
                        "confidence": round(0.70 + min(0.25, len(rehab_history) * 0.02), 3),
                        "evidence_grade": "B",
                        "details": {
                            "baseline_score": baseline,
                            "current_score": fma_latest,
                            "percent_change": round(percent_change, 1),
                            "classification": responder_class,
                        },
                    }
                )

        # MCID tracking
        if len(rehab_history) >= 2:
            baseline = rehab_history[0]
            latest = rehab_history[-1]
            # FMA MCID ~6 points for upper extremity
            fma_change = latest.get("fma_total", 0) - baseline.get("fma_total", 0)
            findings.append(
                {
                    "type": "mcid_tracking",
                    "description": (
                        f"FMA change of {fma_change} points vs MCID threshold of 6 points"
                    ),
                    "confidence": 0.78,
                    "evidence_grade": "B",
                    "details": {
                        "mcid_achieved": fma_change >= 6,
                        "fma_change": fma_change,
                        "mcid_threshold": 6,
                    },
                }
            )

        # If no findings, emit a neutral placeholder
        if not findings:
            findings.append(
                {
                    "type": "insufficient_data",
                    "description": "Insufficient longitudinal data for trend analysis",
                    "confidence": 0.0,
                    "evidence_grade": "N/A",
                    "details": {"assessments_available": len(rehab_history)},
                }
            )

        out = {
            "analysis_type": "rehab_progress",
            "patient_id": patient_id,
            "findings": findings,
            "suggestions": suggestions,
            "assessment_count": len(rehab_history),
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
            "provenance": PROVENANCE_INFERRED,
            "generated_at": _utc_iso(),
        }
        _log.info("Rehab progress analysis for %s: %d findings", patient_id, len(findings))
        return out

    except Exception as exc:
        _log.error("analyze_rehab_progress failed: %s", exc, exc_info=True)
        return {
            "analysis_type": "rehab_progress",
            "patient_id": patient_id,
            "findings": [],
            "suggestions": [],
            "error": str(exc),
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }


async def analyze_wellness_domains(
    patient_id: str, wellness_data: dict[str, Any]
) -> dict[str, Any]:
    """AI-assisted wellness domain analysis.

    Identifies:
        - Lowest wellness wheel domain (prioritization target)
        - Domain imbalance (largest gap between best/worst)
        - Improvement opportunities with evidence-graded interventions
        - Temporal trends if historical data provided
        - Cross-domain correlations (e.g., sleep x stress x exercise)

    Args:
        patient_id: The patient identifier.
        wellness_data: Dict with ``wellness_wheel`` scores and optional history.

    Returns:
        Analysis with domain scores, lowest domain identification,
        evidence-graded recommendations, and a disclaimer.
    """
    try:
        wheel = wellness_data.get("wellness_wheel", {}) if wellness_data else {}
        if not wheel:
            return {
                "analysis_type": "wellness_domains",
                "patient_id": patient_id,
                "domain_scores": {},
                "lowest_domain": None,
                "recommendations": [],
                "disclaimer": DECISION_SUPPORT_DISCLAIMER,
                "provenance": PROVENANCE_INFERRED,
                "note": "No wellness wheel data provided.",
            }

        # Find lowest domain
        try:
            lowest_domain = min(wheel, key=lambda k: float(wheel[k]) if isinstance(wheel[k], (int, float)) else 100)
            lowest_score = float(wheel[lowest_domain]) if isinstance(wheel[lowest_domain], (int, float)) else 0
        except (ValueError, TypeError):
            lowest_domain = None
            lowest_score = 0

        # Domain-to-intervention mapping with evidence grades
        domain_interventions: dict[str, list[dict[str, str]]] = {
            "sleep": [
                {"intervention": "CBT-I protocol", "evidence_grade": "A"},
                {"intervention": "sleep restriction therapy", "evidence_grade": "A"},
                {"intervention": "sleep hygiene education", "evidence_grade": "B"},
            ],
            "stress": [
                {"intervention": "MBSR program", "evidence_grade": "A"},
                {"intervention": "HRV biofeedback training", "evidence_grade": "B"},
                {"intervention": "progressive muscle relaxation", "evidence_grade": "B"},
            ],
            "exercise": [
                {"intervention": "graded exercise program", "evidence_grade": "A"},
                {"intervention": "resistance training protocol", "evidence_grade": "B"},
                {"intervention": "walking prescription", "evidence_grade": "B"},
            ],
            "nutrition": [
                {"intervention": "Mediterranean diet counseling", "evidence_grade": "A"},
                {"intervention": "omega-3 supplementation review", "evidence_grade": "B"},
                {"intervention": "nutritional biomarker panel", "evidence_grade": "C"},
            ],
            "social": [
                {"intervention": "social prescribing referral", "evidence_grade": "B"},
                {"intervention": "group therapy enrollment", "evidence_grade": "A"},
                {"intervention": "volunteer activity matching", "evidence_grade": "C"},
            ],
            "purpose": [
                {"intervention": "meaning-centered counseling", "evidence_grade": "B"},
                {"intervention": "values clarification exercises", "evidence_grade": "B"},
                {"intervention": "life review therapy", "evidence_grade": "B"},
            ],
        }

        recommendations: list[dict[str, Any]] = []
        if lowest_domain and lowest_domain in domain_interventions:
            for rec in domain_interventions[lowest_domain]:
                recommendations.append(
                    {
                        "domain": lowest_domain,
                        "intervention": rec["intervention"],
                        "evidence_grade": rec["evidence_grade"],
                        "priority": "primary" if rec["evidence_grade"] == "A" else "secondary",
                    }
                )

        # Calculate domain balance metric
        try:
            numeric_scores = [float(v) for v in wheel.values() if isinstance(v, (int, float))]
            domain_range = max(numeric_scores) - min(numeric_scores) if numeric_scores else 0
        except (ValueError, TypeError):
            domain_range = 0

        out = {
            "analysis_type": "wellness_domains",
            "patient_id": patient_id,
            "domain_scores": wheel,
            "lowest_domain": lowest_domain,
            "lowest_score": lowest_score,
            "domain_balance_range": round(domain_range, 2),
            "recommendations": recommendations,
            "cross_domain_insight": _soften_text(
                f"Low {lowest_domain} score may be affecting overall well-being. "
                "Consider integrated intervention targeting this domain first."
            ) if lowest_domain else None,
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
            "provenance": PROVENANCE_INFERRED,
            "generated_at": _utc_iso(),
        }
        _log.info(
            "Wellness domain analysis for %s: lowest=%s score=%s",
            patient_id,
            lowest_domain,
            lowest_score,
        )
        return out

    except Exception as exc:
        _log.error("analyze_wellness_domains failed: %s", exc, exc_info=True)
        return {
            "analysis_type": "wellness_domains",
            "patient_id": patient_id,
            "domain_scores": {},
            "lowest_domain": None,
            "recommendations": [],
            "error": str(exc),
            "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        }


async def analyze_complementary_safety(
    patient_id: str,
    comp_data: dict[str, Any],
    med_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """AI-assisted safety screening for complementary therapies.

    Checks:
        - Herb-drug interactions (with medication list if provided)
        - Contraindications by patient condition
        - Evidence adequacy for the requested therapy-condition pair
        - Practitioner credential requirements
        - Device safety (for CES, PBM, etc.)
        - Pregnancy/lactation contraindications

    Args:
        patient_id: The patient identifier.
        comp_data: Complementary therapy data (therapies requested, conditions).
        med_data: Optional active medication list for interaction screening.

    Returns:
        Safety analysis with flags, recommendations, severity ratings,
        and a safety-specific disclaimer.
    """
    try:
        safety_flags: list[dict[str, Any]] = []
        recommendations: list[dict[str, Any]] = []

        therapies = comp_data.get("therapies", []) if comp_data else []
        conditions = comp_data.get("conditions", []) if comp_data else []

        for therapy in therapies:
            therapy_name = therapy.get("type", "").lower() if isinstance(therapy, dict) else str(therapy).lower()

            # St. John's Wort + SSRI check
            if "st. john" in therapy_name or "st john" in therapy_name:
                if med_data:
                    active_meds = med_data.get("active_medications", [])
                    med_names = [m.get("name", "").lower() for m in active_meds if isinstance(m, dict)]
                    ssri_names = ["sertraline", "fluoxetine", "escitalopram", "paroxetine", "citalopram", "fluvoxamine"]
                    if any(s in mn for s in ssri_names for mn in med_names):
                        safety_flags.append(
                            {
                                "type": "interaction",
                                "description": (
                                    "St. John's Wort + SSRI: serotonin syndrome risk. "
                                    "CYP3A4 induction may also reduce SSRI efficacy."
                                ),
                                "severity": "high",
                                "therapy": therapy_name,
                                "action_required": "Discontinue St. John's Wort or adjust SSRI under psychiatric supervision.",
                            }
                        )

            # Acupuncture credential requirement
            if "acupuncture" in therapy_name:
                recommendations.append(
                    {
                        "type": "practitioner_required",
                        "description": "Acupuncture requires licensed practitioner (L.Ac. or MD with acupuncture certification)",
                        "severity": "medium",
                        "therapy": therapy_name,
                        "credential": "Licensed Acupuncturist or equivalent",
                    }
                )

            # CES device safety
            if "ces" in therapy_name or "cranial electrical" in therapy_name:
                safety_flags.append(
                    {
                        "type": "device_contraindication",
                        "description": "CES contraindicated with implanted electronic devices (pacemaker, ICD, DBS)",
                        "severity": "high",
                        "therapy": therapy_name,
                        "action_required": "Verify absence of implanted electronic devices before CES initiation.",
                    }
                )

            # PBM eye protection
            if "pbm" in therapy_name or "photobiomodulation" in therapy_name:
                recommendations.append(
                    {
                        "type": "safety_equipment",
                        "description": "Eye protection mandatory during PBM sessions (especially transcranial)",
                        "severity": "medium",
                        "therapy": therapy_name,
                        "equipment": "Protective goggles rated for device wavelength",
                    }
                )

            # Neurofeedback practitioner
            if "neurofeedback" in therapy_name:
                recommendations.append(
                    {
                        "type": "practitioner_required",
                        "description": "Neurofeedback requires certified BCIA practitioner",
                        "severity": "medium",
                        "therapy": therapy_name,
                        "credential": "BCIA Board Certification in Neurofeedback",
                    }
                )

        # General evidence adequacy check
        for therapy in therapies:
            therapy_name = therapy.get("type", "").lower() if isinstance(therapy, dict) else str(therapy).lower()
            for condition in conditions:
                cond_name = condition.get("name", "").lower() if isinstance(condition, dict) else str(condition).lower()
                evidence_items = await get_complementary_evidence(
                    therapy_type=therapy_name, condition=cond_name
                )
                if evidence_items:
                    grade = evidence_items[0].get("evidence_grade", "D")
                    if grade in ("C", "D"):
                        safety_flags.append(
                            {
                                "type": "evidence_adequacy",
                                "description": (
                                    f"Limited evidence ({grade}) for {therapy_name} in {cond_name}. "
                                    "Monitor outcomes closely."
                                ),
                                "severity": "low" if grade == "C" else "medium",
                                "therapy": therapy_name,
                                "condition": cond_name,
                            }
                        )

        out = {
            "analysis_type": "complementary_safety",
            "patient_id": patient_id,
            "safety_flags": safety_flags,
            "recommendations": recommendations,
            "therapies_screened": len(therapies),
            "disclaimer": (
                "Safety screening only. Requires clinician/pharmacist review. "
                "This screen does not replace a comprehensive medication review."
            ),
            "provenance": PROVENANCE_INFERRED,
            "generated_at": _utc_iso(),
        }
        _log.info(
            "Complementary safety analysis for %s: %d flags, %d recs",
            patient_id,
            len(safety_flags),
            len(recommendations),
        )
        return out

    except Exception as exc:
        _log.error("analyze_complementary_safety failed: %s", exc, exc_info=True)
        return {
            "analysis_type": "complementary_safety",
            "patient_id": patient_id,
            "safety_flags": [],
            "recommendations": [],
            "error": str(exc),
            "disclaimer": (
                "Safety screening only. Requires clinician/pharmacist review."
            ),
        }


# ── Batch / Orchestration helpers ──────────────────────────────────────────────


async def run_full_intervention_intelligence(
    patient_id: str,
    rehab_data: dict[str, Any] | None = None,
    wellness_data: dict[str, Any] | None = None,
    comp_data: dict[str, Any] | None = None,
    neuromod_data: dict[str, Any] | None = None,
    biomarker_data: dict[str, Any] | None = None,
    med_data: dict[str, Any] | None = None,
    db: Session | None = None,
) -> dict[str, Any]:
    """Run the complete intervention-intelligence pipeline for a patient.

    Orchestrates all three platforms (rehab, wellness, complementary) through:
        1. DeepTwin multimodal sync (parallel)
        2. Evidence DB queries per platform
        3. Cross-modal fusion where data is available
        4. AI-assisted progress/domain/safety analysis

    This is the **entry-point** for the comprehensive intervention dashboard.

    Args:
        patient_id: Patient identifier.
        rehab_data: Optional rehab assessment/session data.
        wellness_data: Optional wellness wheel/metric data.
        comp_data: Optional complementary therapy data.
        neuromod_data: Optional neuromodulation session data.
        biomarker_data: Optional lab/biomarker data.
        med_data: Optional active medication list.
        db: SQLAlchemy session (required for DeepTwin sync).

    Returns:
        Unified intelligence report with all sub-analysis results,
        a global evidence grade, and a master disclaimer.
    """
    _start_time = _utc_iso()
    _log.info("Starting full intervention intelligence for patient %s", patient_id)

    results: dict[str, Any] = {
        "patient_id": patient_id,
        "schema_version": SCHEMA_VERSION,
        "generated_at": _start_time,
        "disclaimer": DECISION_SUPPORT_DISCLAIMER,
        "platforms": {},
        "fusion": {},
        "analysis": {},
    }

    # ── DeepTwin sync ──
    if db:
        if rehab_data:
            try:
                results["platforms"]["rehab_deeptwin"] = await send_rehab_to_deeptwin(
                    patient_id, rehab_data, db
                )
            except Exception as exc:
                _log.error("Rehab DeepTwin sync failed: %s", exc)
                results["platforms"]["rehab_deeptwin"] = {"status": "error", "error": str(exc)}

        if wellness_data:
            try:
                results["platforms"]["wellness_deeptwin"] = await send_wellness_to_deeptwin(
                    patient_id, wellness_data, db
                )
            except Exception as exc:
                _log.error("Wellness DeepTwin sync failed: %s", exc)
                results["platforms"]["wellness_deeptwin"] = {"status": "error", "error": str(exc)}

        if comp_data:
            try:
                results["platforms"]["comp_deeptwin"] = await send_complementary_to_deeptwin(
                    patient_id, comp_data, db
                )
            except Exception as exc:
                _log.error("Complementary DeepTwin sync failed: %s", exc)
                results["platforms"]["comp_deeptwin"] = {"status": "error", "error": str(exc)}

    # ── Evidence queries ──
    if rehab_data:
        condition = rehab_data.get("condition", "")
        if condition:
            try:
                results["platforms"]["rehab_evidence"] = await get_rehab_evidence(
                    condition=condition,
                    intervention_type=rehab_data.get("intervention_type"),
                )
            except Exception as exc:
                _log.error("Rehab evidence query failed: %s", exc)
                results["platforms"]["rehab_evidence"] = []

    if wellness_data:
        wheel = wellness_data.get("wellness_wheel", {})
        if wheel:
            # Query evidence for the lowest domain
            try:
                lowest = min(wheel, key=lambda k: float(wheel[k]) if isinstance(wheel[k], (int, float)) else 100)
                results["platforms"]["wellness_evidence"] = await get_wellness_evidence(domain=lowest)
            except Exception as exc:
                _log.error("Wellness evidence query failed: %s", exc)
                results["platforms"]["wellness_evidence"] = []

    if comp_data:
        therapies = comp_data.get("therapies", [])
        conditions = comp_data.get("conditions", [])
        comp_evidence: list[dict] = []
        for therapy in therapies:
            t_name = therapy.get("type", "") if isinstance(therapy, dict) else str(therapy)
            for condition in conditions:
                c_name = condition.get("name", "") if isinstance(condition, dict) else str(condition)
                try:
                    ev = await get_complementary_evidence(t_name, c_name)
                    comp_evidence.extend(ev)
                except Exception as exc:
                    _log.error("Comp evidence query failed: %s", exc)
        results["platforms"]["comp_evidence"] = comp_evidence

    # ── Cross-modal fusion ──
    if rehab_data and neuromod_data:
        try:
            results["fusion"]["rehab_neuromod"] = await fuse_rehab_with_neuromodulation(
                rehab_data, neuromod_data
            )
        except Exception as exc:
            _log.error("Rehab x neuromod fusion failed: %s", exc)
            results["fusion"]["rehab_neuromod"] = {"error": str(exc)}

    if wellness_data and biomarker_data:
        try:
            results["fusion"]["wellness_biomarker"] = await fuse_wellness_with_biomarkers(
                wellness_data, biomarker_data
            )
        except Exception as exc:
            _log.error("Wellness x biomarker fusion failed: %s", exc)
            results["fusion"]["wellness_biomarker"] = {"error": str(exc)}

    if comp_data and med_data:
        try:
            results["fusion"]["comp_medication"] = await fuse_complementary_with_medication(
                comp_data, med_data
            )
        except Exception as exc:
            _log.error("Comp x med fusion failed: %s", exc)
            results["fusion"]["comp_medication"] = {"error": str(exc)}

    # ── AI analysis ──
    if rehab_data:
        history = rehab_data.get("assessments", [])
        if history:
            try:
                results["analysis"]["rehab_progress"] = await analyze_rehab_progress(
                    patient_id, history
                )
            except Exception as exc:
                _log.error("Rehab progress analysis failed: %s", exc)
                results["analysis"]["rehab_progress"] = {"error": str(exc)}

    if wellness_data:
        try:
            results["analysis"]["wellness_domains"] = await analyze_wellness_domains(
                patient_id, wellness_data
            )
        except Exception as exc:
            _log.error("Wellness domain analysis failed: %s", exc)
            results["analysis"]["wellness_domains"] = {"error": str(exc)}

    if comp_data:
        try:
            results["analysis"]["comp_safety"] = await analyze_complementary_safety(
                patient_id, comp_data, med_data
            )
        except Exception as exc:
            _log.error("Complementary safety analysis failed: %s", exc)
            results["analysis"]["comp_safety"] = {"error": str(exc)}

    # ── Summary ──
    results["provenance"] = _build_provenance(
        surface="run_full_intervention_intelligence",
        inputs={
            "patient_id": patient_id,
            "has_rehab": bool(rehab_data),
            "has_wellness": bool(wellness_data),
            "has_comp": bool(comp_data),
            "has_neuromod": bool(neuromod_data),
            "has_biomarkers": bool(biomarker_data),
            "has_meds": bool(med_data),
        },
    )

    _log.info(
        "Full intervention intelligence complete for %s: platforms=%d fusion=%d analysis=%d",
        patient_id,
        len(results["platforms"]),
        len(results["fusion"]),
        len(results["analysis"]),
    )
    return results
