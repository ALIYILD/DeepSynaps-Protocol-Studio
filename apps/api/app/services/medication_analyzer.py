"""Medication Analyzer — deterministic decision-support payload builder.

Assembles a JSON-friendly page payload from ``PatientMedication`` rows and
in-memory interaction rules (shared logic with ``medications_router``).

Does not prescribe or optimize regimens; surfaces review prompts and confounds.
"""
from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.routers.medications_router import InteractionResult, _run_interaction_check

RULESET_VERSION = "med-analyzer-rules-v1"

# Research / CDS posture encoded for auditor-facing payloads (not clinical validation claims).
REGULATORY_DISCLOSURES = {
    "intended_use": (
        "Clinical decision-support for structured medication regimen review, adherence "
        "context, and safety/confound prompts in neuromodulation and multimodal workflows."
    ),
    "not_intended_for": [
        "Autonomous prescribing, dosing, or stopping medications.",
        "Replacement for pharmacy systems, allergy reconciliation, or FDA labeling.",
        "Validated adherence measurement or therapeutic drug monitoring.",
    ],
    "evidence_basis": (
        "Deterministic rules over curated interaction exemplars and medication-class "
        "heuristics; adherence estimates are clinic-review prompts when device/refill "
        "feeds are absent. Outputs require clinician interpretation."
    ),
    "limitations": [
        "Drug–drug screening uses a partial in-rule-set list—not exhaustive.",
        "Confound attribution is hypothesis-level (possible/plausible), not causal inference.",
        "Research deployments should version rulesets and retain audit trails.",
    ],
}


# ── Curated medication search catalog (decision-support lookup, not a formulary) ──
_MEDICATION_CATALOG: list[dict[str, Any]] = [
    # SSRIs
    {"name": "Sertraline", "generic_name": "sertraline", "drug_class": "SSRI", "common_indications": ["MDD", "OCD", "PTSD", "panic disorder", "social anxiety"]},
    {"name": "Fluoxetine", "generic_name": "fluoxetine", "drug_class": "SSRI", "common_indications": ["MDD", "OCD", "bulimia nervosa", "panic disorder"]},
    {"name": "Paroxetine", "generic_name": "paroxetine", "drug_class": "SSRI", "common_indications": ["MDD", "OCD", "panic disorder", "social anxiety", "PTSD", "GAD"]},
    {"name": "Citalopram", "generic_name": "citalopram", "drug_class": "SSRI", "common_indications": ["MDD", "anxiety disorders"]},
    {"name": "Escitalopram", "generic_name": "escitalopram", "drug_class": "SSRI", "common_indications": ["MDD", "GAD"]},
    {"name": "Fluvoxamine", "generic_name": "fluvoxamine", "drug_class": "SSRI", "common_indications": ["OCD", "social anxiety"]},
    # SNRIs
    {"name": "Venlafaxine", "generic_name": "venlafaxine", "drug_class": "SNRI", "common_indications": ["MDD", "GAD", "panic disorder", "social anxiety"]},
    {"name": "Desvenlafaxine", "generic_name": "desvenlafaxine", "drug_class": "SNRI", "common_indications": ["MDD"]},
    {"name": "Duloxetine", "generic_name": "duloxetine", "drug_class": "SNRI", "common_indications": ["MDD", "GAD", "neuropathic pain", "fibromyalgia"]},
    {"name": "Levomilnacipran", "generic_name": "levomilnacipran", "drug_class": "SNRI", "common_indications": ["MDD"]},
    # Atypical antidepressants
    {"name": "Bupropion", "generic_name": "bupropion", "drug_class": "NDRI", "common_indications": ["MDD", "SAD", "smoking cessation"]},
    {"name": "Mirtazapine", "generic_name": "mirtazapine", "drug_class": "NaSSA", "common_indications": ["MDD", "insomnia", "anorexia/cachexia"]},
    {"name": "Trazodone", "generic_name": "trazodone", "drug_class": "SARI", "common_indications": ["MDD", "insomnia"]},
    {"name": "Vortioxetine", "generic_name": "vortioxetine", "drug_class": "multimodal antidepressant", "common_indications": ["MDD", "cognitive impairment in depression"]},
    # Tricyclics
    {"name": "Amitriptyline", "generic_name": "amitriptyline", "drug_class": "TCA", "common_indications": ["MDD", "neuropathic pain", "migraine prophylaxis", "fibromyalgia"]},
    {"name": "Nortriptyline", "generic_name": "nortriptyline", "drug_class": "TCA", "common_indications": ["MDD", "neuropathic pain", "smoking cessation"]},
    {"name": "Imipramine", "generic_name": "imipramine", "drug_class": "TCA", "common_indications": ["MDD", "panic disorder", "enuresis"]},
    {"name": "Clomipramine", "generic_name": "clomipramine", "drug_class": "TCA", "common_indications": ["OCD", "MDD", "panic disorder"]},
    # MAOIs
    {"name": "Phenelzine", "generic_name": "phenelzine", "drug_class": "MAOI", "common_indications": ["MDD", "social anxiety", "PTSD"]},
    {"name": "Tranylcypromine", "generic_name": "tranylcypromine", "drug_class": "MAOI", "common_indications": ["MDD", "atypical depression"]},
    {"name": "Isocarboxazid", "generic_name": "isocarboxazid", "drug_class": "MAOI", "common_indications": ["MDD"]},
    {"name": "Selegiline", "generic_name": "selegiline", "drug_class": "MAOI", "common_indications": ["MDD", "Parkinson's disease"]},
    # Mood stabilizers
    {"name": "Lithium", "generic_name": "lithium carbonate", "drug_class": "mood stabilizer", "common_indications": ["bipolar disorder", "MDD augmentation", "suicide prevention"]},
    {"name": "Lamotrigine", "generic_name": "lamotrigine", "drug_class": "anticonvulsant / mood stabilizer", "common_indications": ["bipolar depression", "epilepsy"]},
    {"name": "Valproate", "generic_name": "valproate", "drug_class": "anticonvulsant / mood stabilizer", "common_indications": ["bipolar mania", "epilepsy", "migraine prophylaxis"]},
    {"name": "Carbamazepine", "generic_name": "carbamazepine", "drug_class": "anticonvulsant / mood stabilizer", "common_indications": ["bipolar disorder", "epilepsy", "neuropathic pain"]},
    {"name": "Oxcarbazepine", "generic_name": "oxcarbazepine", "drug_class": "anticonvulsant / mood stabilizer", "common_indications": ["bipolar disorder", "epilepsy"]},
    # Second-generation antipsychotics
    {"name": "Aripiprazole", "generic_name": "aripiprazole", "drug_class": "atypical antipsychotic", "common_indications": ["schizophrenia", "bipolar disorder", "MDD augmentation", "autism irritability"]},
    {"name": "Olanzapine", "generic_name": "olanzapine", "drug_class": "atypical antipsychotic", "common_indications": ["schizophrenia", "bipolar disorder", "treatment-resistant depression"]},
    {"name": "Quetiapine", "generic_name": "quetiapine", "drug_class": "atypical antipsychotic", "common_indications": ["schizophrenia", "bipolar disorder", "MDD augmentation", "insomnia"]},
    {"name": "Risperidone", "generic_name": "risperidone", "drug_class": "atypical antipsychotic", "common_indications": ["schizophrenia", "bipolar mania", "autism irritability"]},
    {"name": "Clozapine", "generic_name": "clozapine", "drug_class": "atypical antipsychotic", "common_indications": ["treatment-resistant schizophrenia", "suicide risk in schizophrenia"]},
    {"name": "Lurasidone", "generic_name": "lurasidone", "drug_class": "atypical antipsychotic", "common_indications": ["schizophrenia", "bipolar depression"]},
    {"name": "Ziprasidone", "generic_name": "ziprasidone", "drug_class": "atypical antipsychotic", "common_indications": ["schizophrenia", "bipolar disorder"]},
    {"name": "Asenapine", "generic_name": "asenapine", "drug_class": "atypical antipsychotic", "common_indications": ["bipolar disorder", "schizophrenia"]},
    {"name": "Cariprazine", "generic_name": "cariprazine", "drug_class": "atypical antipsychotic", "common_indications": ["schizophrenia", "bipolar disorder"]},
    {"name": "Brexpiprazole", "generic_name": "brexpiprazole", "drug_class": "atypical antipsychotic", "common_indications": ["schizophrenia", "MDD augmentation"]},
    # Benzodiazepines
    {"name": "Lorazepam", "generic_name": "lorazepam", "drug_class": "benzodiazepine", "common_indications": ["anxiety", "insomnia", "alcohol withdrawal", "agitation"]},
    {"name": "Clonazepam", "generic_name": "clonazepam", "drug_class": "benzodiazepine", "common_indications": ["anxiety", "panic disorder", "seizure disorders", "akathisia"]},
    {"name": "Alprazolam", "generic_name": "alprazolam", "drug_class": "benzodiazepine", "common_indications": ["anxiety", "panic disorder"]},
    {"name": "Diazepam", "generic_name": "diazepam", "drug_class": "benzodiazepine", "common_indications": ["anxiety", "muscle spasm", "alcohol withdrawal", "seizures"]},
    # Stimulants
    {"name": "Methylphenidate", "generic_name": "methylphenidate", "drug_class": "stimulant", "common_indications": ["ADHD", "narcolepsy"]},
    {"name": "Lisdexamfetamine", "generic_name": "lisdexamfetamine", "drug_class": "stimulant", "common_indications": ["ADHD", "binge eating disorder"]},
    {"name": "Amphetamine / Dextroamphetamine", "generic_name": "mixed amphetamine salts", "drug_class": "stimulant", "common_indications": ["ADHD", "narcolepsy"]},
    {"name": "Atomoxetine", "generic_name": "atomoxetine", "drug_class": "NRI", "common_indications": ["ADHD"]},
    {"name": "Modafinil", "generic_name": "modafinil", "drug_class": "wakefulness-promoting agent", "common_indications": ["narcolepsy", "shift work sleep disorder", "OSA-related sleepiness"]},
    # Other neuromodulation-relevant medications
    {"name": "Pregabalin", "generic_name": "pregabalin", "drug_class": "gabapentinoid", "common_indications": ["neuropathic pain", "fibromyalgia", "GAD", "epilepsy"]},
    {"name": "Gabapentin", "generic_name": "gabapentin", "drug_class": "gabapentinoid", "common_indications": ["neuropathic pain", "epilepsy", "anxiety (off-label)", "insomnia (off-label)"]},
    {"name": "Topiramate", "generic_name": "topiramate", "drug_class": "anticonvulsant", "common_indications": ["epilepsy", "migraine prophylaxis", "bipolar disorder (off-label)", "weight management"]},
    {"name": "Tramadol", "generic_name": "tramadol", "drug_class": "opioid analgesic / SNRI", "common_indications": ["moderate pain", "chronic pain", "neuropathic pain"]},
    {"name": "Warfarin", "generic_name": "warfarin", "drug_class": "anticoagulant", "common_indications": ["AFib", "DVT/PE prevention", "mechanical heart valves"]},
    {"name": "Apixaban", "generic_name": "apixaban", "drug_class": "DOAC", "common_indications": ["AFib stroke prevention", "DVT/PE treatment and prevention"]},
    {"name": "Hydroxyzine", "generic_name": "hydroxyzine", "drug_class": "antihistamine / anxiolytic", "common_indications": ["anxiety", "pruritus", "insomnia"]},
    {"name": "Buspirone", "generic_name": "buspirone", "drug_class": "5-HT1A partial agonist", "common_indications": ["GAD", "anxiety augmentation"]},
    {"name": "Zolpidem", "generic_name": "zolpidem", "drug_class": "Z-drug / hypnotic", "common_indications": ["short-term insomnia management"]},
]


def search_medication_candidates(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Return candidate medication names matching query from a curated list.

    Searches across generic names, brand names, and drug classes.
    Returns candidates with name, generic_name, drug_class, and common_indications.

    This is a decision-support lookup aid, not a complete formulary or prescribing tool.
    Results require clinician verification against the patient chart and pharmacy record.
    """
    if not query or not str(query).strip():
        return []
    q = str(query).strip().lower()
    matches: list[dict[str, Any]] = []
    for med in _MEDICATION_CATALOG:
        score = 0
        name_lower = med["name"].lower()
        generic_lower = med["generic_name"].lower()
        class_lower = med["drug_class"].lower()
        indications_lower = " ".join(med["common_indications"]).lower()
        if q == name_lower or q == generic_lower:
            score = 100  # exact match
        elif q in name_lower or q in generic_lower:
            score = 80  # substring match in name
        elif q in class_lower:
            score = 60  # class match
        elif q in indications_lower:
            score = 40  # indication match
        elif _fuzzy_prefix(q, name_lower) or _fuzzy_prefix(q, generic_lower):
            score = 30  # prefix/fuzzy match
        if score > 0:
            matches.append({"score": score, **med})
    matches.sort(key=lambda x: x["score"], reverse=True)
    return matches[:limit]


def _fuzzy_prefix(query: str, target: str, min_prefix_len: int = 3) -> bool:
    """True if query is a prefix of any word in target (case-insensitive)."""
    if len(query) < min_prefix_len:
        return False
    words = target.split()
    return any(word.startswith(query) for word in words)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dose_hint(dose: Optional[str]) -> dict[str, Any]:
    if not dose or not str(dose).strip():
        return {"value": None, "unit": None}
    m = re.match(r"^\s*([\d.]+)\s*([a-zA-Zµμ]+)?", str(dose).strip())
    if m:
        try:
            val = float(m.group(1))
        except ValueError:
            val = None
        unit = (m.group(2) or "").lower() or None
        return {"value": val, "unit": unit}
    return {"value": None, "unit": None}


def _severity_to_levels(severity: str) -> tuple[str, str]:
    """Map legacy interaction severity to alert severity + urgency."""
    s = (severity or "").lower()
    if s == "severe":
        return "high", "soon"
    if s == "moderate":
        return "moderate", "routine"
    if s == "mild":
        return "low", "routine"
    return "info", "routine"


def _interaction_to_alert(
    idx: int, patient_id: str, r: InteractionResult
) -> dict[str, Any]:
    sev, urgency = _severity_to_levels(r.severity)
    return {
        "id": f"ia-{patient_id[:8]}-{idx}",
        "category": "drug_drug",
        "severity": sev,
        "urgency": urgency,
        "title": f"Interaction: {r.drugs[0]} + {r.drugs[1]}",
        "detail": r.description,
        "medications_involved": [],
        "conditions_involved": [],
        "detected_at": _iso_now(),
        "ruleset_id": "in_memory_pairs",
        "ruleset_version": RULESET_VERSION,
        "confidence": 1.0,
        "management_hints": [
            r.recommendation,
            "Verify with the patient chart and pharmacy; this check is not exhaustive.",
        ],
    }


def normalize_medication_list(
    med_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return canonical medication records from DB/API-shaped dicts."""
    out: list[dict[str, Any]] = []
    for r in med_rows:
        dose_hint = _parse_dose_hint(r.get("dose"))
        status = "active" if r.get("active") else "inactive"
        src = r.get("source") or "clinician_entry"
        conf = 0.95 if src == "clinician_entry" else 0.75
        out.append(
            {
                "id": r.get("id") or str(uuid.uuid4()),
                "drug_name": (r.get("name") or "").strip() or "Unknown",
                "medication_class": (r.get("drug_class") or "unspecified").strip(),
                "dose": dose_hint,
                "route": (r.get("route") or "oral") or "oral",
                "frequency": {
                    "code": "custom",
                    "times_per_day": None,
                    "free_text": r.get("frequency"),
                },
                "indication": r.get("indication"),
                "status": status,
                "start_date": r.get("started_at"),
                "end_date": r.get("stopped_at"),
                "source": {
                    "origin": src,
                    "recorded_at": r.get("updated_at") or _iso_now(),
                    "confidence": conf,
                },
            }
        )
    return out


def build_medication_timeline(
    med_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Derive timeline events from medication rows (no separate event store in MVP)."""
    events: list[dict[str, Any]] = []
    for r in med_rows:
        mid = r.get("id")
        if r.get("started_at"):
            events.append(
                {
                    "id": f"ev-start-{mid}",
                    "patient_id": r.get("patient_id", ""),
                    "event_type": "start",
                    "occurred_at": r["started_at"],
                    "medication_id": mid,
                    "payload": {"dose": r.get("dose")},
                    "source": {
                        "origin": "clinician_entry",
                        "recorded_at": r.get("created_at") or _iso_now(),
                        "confidence": 0.9,
                    },
                    "confidence": 0.9,
                }
            )
        if r.get("stopped_at"):
            events.append(
                {
                    "id": f"ev-stop-{mid}",
                    "patient_id": r.get("patient_id", ""),
                    "event_type": "stop",
                    "occurred_at": r["stopped_at"],
                    "medication_id": mid,
                    "payload": {},
                    "source": {
                        "origin": "clinician_entry",
                        "recorded_at": r.get("updated_at") or _iso_now(),
                        "confidence": 0.9,
                    },
                    "confidence": 0.9,
                }
            )
        if r.get("updated_at") and r.get("created_at") and r["updated_at"] != r["created_at"]:
            events.append(
                {
                    "id": f"ev-chg-{mid}",
                    "patient_id": r.get("patient_id", ""),
                    "event_type": "dose_change",
                    "occurred_at": r["updated_at"],
                    "medication_id": mid,
                    "payload": {
                        "note": "Record updated; exact field diff not stored in MVP.",
                    },
                    "source": {
                        "origin": "clinician_entry",
                        "recorded_at": r["updated_at"],
                        "confidence": 0.7,
                    },
                    "confidence": 0.7,
                }
            )
    events.sort(key=lambda e: e.get("occurred_at") or "")
    return events


def estimate_medication_adherence(
    med_count: int,
    has_self_report: bool = False,
) -> dict[str, Any]:
    """Heuristic adherence estimate when no device/refill feed is present."""
    base = 0.72 if med_count > 4 else 0.82
    if has_self_report:
        base = min(0.95, base + 0.05)
    return {
        "as_of": _iso_now(),
        "window_days": 30,
        "estimate_type": "proportion",
        "value": round(base, 2),
        "trend": "stable",
        "evidence_sources": [
            {
                "type": "clinician_entry",
                "weight": 0.6,
                "coverage": 0.4,
            },
            {"type": "self_report", "weight": 0.2, "coverage": 0.3 if has_self_report else 0.0},
        ],
        "confidence": 0.55 if med_count > 5 else 0.65,
        "limitations": [
            "No smart-pill or refill integration in this deployment.",
            "Estimate is a clinic-review prompt only—not a validated adherence score.",
        ],
    }


def compute_polypharmacy_risk(active_count: int) -> dict[str, Any]:
    label = "lower"
    if active_count >= 10:
        label = "high"
    elif active_count >= 5:
        label = "elevated"
    return {"active_count": active_count, "risk_band": label}


def detect_neuromodulation_cautions(
    med_names_lower: list[str],
    drug_classes: list[str],
) -> list[dict[str, Any]]:
    """Flag meds/classes relevant to TMS/tDCS seizure threshold / excitability."""
    flags: list[dict[str, Any]] = []
    cls_l = " ".join(drug_classes).lower()
    joined = " ".join(med_names_lower)

    if "tricyclic" in cls_l or any(x in joined for x in ("amitriptyline", "nortriptyline")):
        flags.append(
            {
                "id": f"nmc-{uuid.uuid4().hex[:10]}",
                "category": "neuromodulation_caution",
                "severity": "moderate",
                "urgency": "routine",
                "title": "Seizure threshold / TMS",
                "detail": "Tricyclic antidepressants may lower seizure threshold; "
                "review TMS parameters per institutional protocol.",
                "medications_involved": [],
                "conditions_involved": [],
                "detected_at": _iso_now(),
                "ruleset_id": "neuromod_policy_v1",
                "ruleset_version": RULESET_VERSION,
                "confidence": 0.85,
                "management_hints": [
                    "Cross-check with Treatment Sessions and Risk Analyzer before intensity changes.",
                ],
            }
        )
    if any(x in joined for x in ("methylphenidate", "amphetamine", "adderall")):
        flags.append(
            {
                "id": f"nmc-{uuid.uuid4().hex[:10]}",
                "category": "neuromodulation_caution",
                "severity": "low",
                "urgency": "routine",
                "title": "CNS stimulant / excitability",
                "detail": "Stimulants may interact with plasticity / excitability "
                "interpretation for neurophysiology and neuromodulation studies.",
                "medications_involved": [],
                "conditions_involved": [],
                "detected_at": _iso_now(),
                "ruleset_id": "neuromod_policy_v1",
                "ruleset_version": RULESET_VERSION,
                "confidence": 0.75,
                "management_hints": [
                    "Note timing of stimulant dose relative to EEG, HRV, and session windows.",
                ],
            }
        )
    return flags


def _confound_flags_for_meds(
    med_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for m in med_records:
        mid = m["id"]
        cls_ = (m.get("medication_class") or "").lower()
        name = (m.get("drug_name") or "").lower()
        if any(
            x in cls_ or x in name
            for x in ("ssri", "escitalopram", "sertraline", "fluoxetine", "antidepressant")
        ):
            out.append(
                {
                    "id": f"cf-mood-{mid[:8]}",
                    "domain": "mood",
                    "hypothesis": "possible confound",
                    "linked_medications": [mid],
                    "temporal_alignment": "unclear",
                    "strength": "possible",
                    "confidence": 0.5,
                    "explanation": f"{m.get('drug_name')} may contribute to mood and sleep "
                    f"symptom reports; separate from disease activity without a med-free baseline.",
                    "counterevidence": [],
                    "generated_at": _iso_now(),
                    "source": "rules",
                }
            )
        if any(
            x in cls_ or x in name
            for x in ("benzodiazepine", "lorazepam", "clonazepam", "diazepam", "z-drug", "zolpidem")
        ):
            out.append(
                {
                    "id": f"cf-cog-{mid[:8]}",
                    "domain": "cognition",
                    "hypothesis": "possible confound",
                    "linked_medications": [mid],
                    "temporal_alignment": "unclear",
                    "strength": "plausible",
                    "confidence": 0.55,
                    "explanation": "Sedative/hypnotic agents may slow reaction time and affect "
                    "voice, video, and cognitive task metrics.",
                    "counterevidence": [],
                    "generated_at": _iso_now(),
                    "source": "rules",
                }
            )
        if "beta" in cls_ or "propranolol" in name or "metoprolol" in name:
            out.append(
                {
                    "id": f"cf-hrv-{mid[:8]}",
                    "domain": "cardiovascular",
                    "hypothesis": "possible confound",
                    "linked_medications": [mid],
                    "temporal_alignment": "unclear",
                    "strength": "possible",
                    "confidence": 0.5,
                    "explanation": "Beta-blockers directly affect heart rate and may reduce HRV; "
                    "interpret biometrics alongside medication timing.",
                    "counterevidence": [],
                    "generated_at": _iso_now(),
                    "source": "rules",
                }
            )
    return out


def generate_medication_review_actions(
    interaction_alerts: list[dict[str, Any]],
    confounds: list[dict[str, Any]],
    poly: dict[str, Any],
) -> list[dict[str, Any]]:
    recs: list[dict[str, Any]] = []
    if any(a.get("severity") in ("high", "moderate") for a in interaction_alerts):
        recs.append(
            {
                "id": f"rec-{uuid.uuid4().hex[:8]}",
                "type": "pharmacist_consult",
                "priority": "high",
                "title": "Pharmacist or prescriber review",
                "rationale": "Interaction or safety flags require manual verification against the full chart.",
                "due_by": None,
                "linked_alert_ids": [a["id"] for a in interaction_alerts[:5]],
                "linked_confound_ids": [],
                "created_at": _iso_now(),
                "status": "open",
            }
        )
    if poly.get("risk_band") == "high":
        recs.append(
            {
                "id": f"rec-{uuid.uuid4().hex[:8]}",
                "type": "med_review",
                "priority": "medium",
                "title": "Polypharmacy review",
                "rationale": f"Active medication count is {poly.get('active_count', 0)}; "
                "consider deprescribing and indication review per clinic policy.",
                "due_by": None,
                "linked_alert_ids": [],
                "linked_confound_ids": [],
                "created_at": _iso_now(),
                "status": "open",
            }
        )
    if confounds:
        recs.append(
            {
                "id": f"rec-{uuid.uuid4().hex[:8]}",
                "type": "interpretation_caution",
                "priority": "medium",
                "title": "Caution interpreting biomarker shifts",
                "rationale": "Medication-related confounds may explain part of qEEG, HRV, voice, or video changes.",
                "due_by": None,
                "linked_alert_ids": [],
                "linked_confound_ids": [c["id"] for c in confounds[:8]],
                "created_at": _iso_now(),
                "status": "open",
            }
        )
    recs.append(
        {
            "id": f"rec-{uuid.uuid4().hex[:8]}",
            "type": "adherence_barrier",
            "priority": "low",
            "title": "Adherence context",
            "rationale": "If adherence evidence is weak, trend interpretation for symptoms and "
            "biomarkers should stay conservative.",
            "due_by": None,
            "linked_alert_ids": [],
            "linked_confound_ids": [],
            "created_at": _iso_now(),
            "status": "open",
        }
    )
    return recs


def build_page_payload(
    patient_id: str,
    med_rows: list[dict[str, Any]],
    *,
    extra_timeline_events: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Full ``MedicationAnalyzerPagePayload``-shaped object."""
    for r in med_rows:
        r["patient_id"] = patient_id

    active = [r for r in med_rows if r.get("active")]
    names = [r.get("name") or "" for r in active if (r.get("name") or "").strip()]
    names_lower = [n.lower() for n in names]
    classes = [str(r.get("drug_class") or "") for r in active]

    interaction_results, sev_summary = _run_interaction_check(names)
    interaction_alerts = [
        _interaction_to_alert(i, patient_id, x)
        for i, x in enumerate(interaction_results)
    ]
    interaction_alerts.extend(
        detect_neuromodulation_cautions(names_lower, classes)
    )

    poly = compute_polypharmacy_risk(len(active))
    normalized = normalize_medication_list(med_rows)
    timeline = build_medication_timeline(med_rows)
    if extra_timeline_events:
        timeline = sorted(
            timeline + extra_timeline_events,
            key=lambda e: e.get("occurred_at") or "",
        )
    adherence = estimate_medication_adherence(len(active))
    confounds = _confound_flags_for_meds(normalized)
    recommendations = generate_medication_review_actions(
        interaction_alerts, confounds, poly
    )

    recent_changes = sum(
        1
        for r in med_rows
        if r.get("updated_at") and r.get("created_at") and r["updated_at"] != r["created_at"]
    )

    content_hash = hashlib.sha256(
        json_dump_stable(
            {
                "patient_id": patient_id,
                "med_ids": sorted([r.get("id") for r in med_rows if r.get("id")]),
                "rules": RULESET_VERSION,
            }
        ).encode()
    ).hexdigest()[:16]

    return {
        "schema_version": "1.0",
        "generated_at": _iso_now(),
        "patient_id": patient_id,
        "provenance": {
            "source_systems": ["patient_medications", "in_memory_interaction_rules"],
            "computed_by": "medication_analyzer_service",
            "ruleset_versions": {RULESET_VERSION: "1"},
            "model_versions": {},
        },
        "regulatory_disclosures": REGULATORY_DISCLOSURES,
        "snapshot": {
            "active_medications": [m for m in normalized if m.get("status") == "active"],
            "recent_change_count_30d": recent_changes,
            "polypharmacy": poly,
            "high_risk_med_count": sum(
                1
                for m in normalized
                if m.get("status") == "active"
                and any(
                    w in (m.get("medication_class") or "").lower()
                    for w in ("opioid", "benzodiazepine", "anticoagulant", "lithium")
                )
            ),
            "adherence": adherence,
            "interaction_flag_count": len(interaction_alerts),
            "neuromodulation_flag_count": sum(
                1 for a in interaction_alerts if a.get("category") == "neuromodulation_caution"
            ),
            "interaction_severity_summary": sev_summary,
        },
        "timeline": timeline,
        "adherence": adherence,
        "safety_alerts": interaction_alerts,
        "confounds": confounds,
        "recommendations": recommendations,
        "evidence_links": [
            {
                "id": "ev-001",
                "label": "FDA drug labeling — consult current prescribing information",
                "url": None,
                "citation": "Institutional drug information resources",
                "quality": "label",
                "pertains_to": None,
            }
        ],
        "audit_ref": f"med-analyzer-{patient_id[:8]}-{content_hash}",
    }


def json_dump_stable(obj: Any) -> str:
    import json

    return json.dumps(obj, sort_keys=True, default=str)
