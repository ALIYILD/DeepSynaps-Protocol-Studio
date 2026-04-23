"""Static mapping: risk categories → evidence keywords, condition-package paths, modality relevance.

Each entry tells the risk engine *where* to look in the condition-package JSON
and *what keywords* to use when querying the evidence pipeline for supporting
literature.  The engine iterates this map per category to build evidence_refs.
"""
from __future__ import annotations

# ── 8 risk categories ─────────────────────────────────────────────────────────

RISK_CATEGORIES = [
    "allergy",
    "suicide_risk",
    "mental_crisis",
    "self_harm",
    "harm_to_others",
    "seizure_risk",
    "implant_risk",
    "medication_interaction",
]

RISK_CATEGORY_LABELS = {
    "allergy": "Allergy",
    "suicide_risk": "Suicide Risk",
    "mental_crisis": "Mental Crisis",
    "self_harm": "Self-Harm",
    "harm_to_others": "Harm to Others",
    "seizure_risk": "Epilepsy / Seizure",
    "implant_risk": "Piercing / Implants",
    "medication_interaction": "Medication",
}

# ── Evidence map per category ─────────────────────────────────────────────────

RISK_EVIDENCE_MAP: dict[str, dict] = {
    "allergy": {
        "condition_package_paths": [
            "contraindications.modality_specific",
        ],
        "keyword_filters": ["allergy", "allergic", "skin condition", "contact dermatitis", "scalp", "eczema"],
        "modality_relevance": ["tdcs", "tacs", "ces"],
        "safety_flag_ids": [],
    },
    "suicide_risk": {
        "condition_package_paths": [
            "contraindications.absolute",
        ],
        "keyword_filters": ["suicid", "suicidal ideation", "self-harm", "crisis", "safety plan"],
        "modality_relevance": [],  # all modalities
        "safety_flag_ids": ["unstable_psych"],
    },
    "mental_crisis": {
        "condition_package_paths": [
            "contraindications.absolute",
        ],
        "keyword_filters": ["psychosis", "manic", "psychiatric emergency", "acute", "crisis"],
        "modality_relevance": [],
        "safety_flag_ids": ["unstable_psych"],
    },
    "self_harm": {
        "condition_package_paths": [
            "contraindications.absolute",
        ],
        "keyword_filters": ["self-harm", "self-injury", "NSSI", "cutting", "suicid"],
        "modality_relevance": [],
        "safety_flag_ids": ["unstable_psych"],
    },
    "harm_to_others": {
        "condition_package_paths": [],
        "keyword_filters": ["violence", "aggression", "homicid", "harm to others"],
        "modality_relevance": [],
        "safety_flag_ids": [],
    },
    "seizure_risk": {
        "condition_package_paths": [
            "contraindications.absolute",
            "contraindications.relative",
        ],
        "keyword_filters": ["seizure", "epilepsy", "convulsion", "threshold", "seizure-free"],
        "modality_relevance": ["rtms", "dtms", "itbs", "tdcs", "tacs"],
        "safety_flag_ids": ["seizure_history", "lower_threshold_meds"],
    },
    "implant_risk": {
        "condition_package_paths": [
            "contraindications.absolute",
            "contraindications.modality_specific",
        ],
        "keyword_filters": ["implant", "metal", "ferromagnetic", "pacemaker", "cochlear", "DBS", "VNS", "aneurysm clip", "stent"],
        "modality_relevance": ["rtms", "dtms", "itbs", "mrgfus", "tms"],
        "safety_flag_ids": ["implanted_device", "intracranial_metal"],
    },
    "medication_interaction": {
        "condition_package_paths": [
            "contraindications.relative",
        ],
        "keyword_filters": ["seizure threshold", "bupropion", "clozapine", "tricyclic", "serotonin syndrome", "MAOI"],
        "modality_relevance": ["rtms", "dtms", "itbs", "tdcs"],
        "safety_flag_ids": ["lower_threshold_meds"],
    },
}

# ── Seizure-threshold-lowering drug classes / names ───────────────────────────
# Used by the seizure_risk and medication_interaction evaluators.

SEIZURE_THRESHOLD_DRUGS = [
    "bupropion",
    "clozapine",
    "chlorpromazine",
    "maprotiline",
    "tramadol",
    "amitriptyline",
    "nortriptyline",
    "imipramine",
    "desipramine",
    "doxepin",
    "clomipramine",
]

# ── Magnetic modalities (contraindicated with metallic implants) ──────────────

MAGNETIC_MODALITIES = {"rtms", "dtms", "itbs", "tms", "mrgfus"}
