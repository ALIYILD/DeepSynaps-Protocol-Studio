"""Pharmacogenomics Panel builder based on CPIC guidelines.

Covers CYP2D6, CYP2C19, CYP1A2, CYP3A4, CYP2C9, SLCO1B1, HLA-B*57:01.
Decision-support only -- not a replacement for clinical pharmacogenomic testing.

This module provides:
- build_pharmacogenomics_panel(): generate PGx alerts for a medication list
- CPIC guideline mappings for psychiatric/neuromodulation drugs
- Evidence-linked recommendations with PMID references

Gene-drug pairs covered:
- CYP2D6: nortriptyline, paroxetine, fluoxetine, risperidone, haloperidol, atomoxetine
- CYP2C19: escitalopram, sertraline, citalopram, diazepam
- CYP1A2: clozapine, olanzapine, duloxetine, fluvoxamine
- CYP2C9: warfarin, phenytoin
- HLA-B*57:01: carbamazepine (SJS/TEN risk)
- HLA-B*1502: carbamazepine (SJS/TEN in Asian populations)

Evidence grades:
- "A" for CPIC guidelines (strong)
- "B" for DPWG guidelines (moderate)

References:
- CPIC: Clinical Pharmacogenetics Implementation Consortium (cpicpgx.org)
- DPWG: Dutch Pharmacogenetics Working Group
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# ── CPIC Gene-Drug Guideline Database ────────────────────────────────────────
# Based on CPIC guidelines (cpicpgx.org) as of 2025
# Each entry maps a gene-drug pair to CPIC recommendations per phenotype

_CPIC_GUIDELINES: list[dict[str, Any]] = [
    # ── CYP2D6 ────────────────────────────────────────────────────────────
    {
        "gene": "CYP2D6",
        "medications": ["nortriptyline", "amitriptyline"],
        "drug_class": "TCA",
        "phenotypes": {
            "ultrarapid_metabolizer": {
                "implication": "Reduced plasma concentrations; may require dose increase",
                "recommendation": "Consider alternative TCA or monitor levels. "
                                  "Start at standard dose; titrate based on response. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["23486447", "30322146"],
            },
            "extensive_metabolizer": {
                "implication": "Normal metabolism",
                "recommendation": "Start with standard dosing. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "standard",
                "pmids": ["23486447"],
            },
            "intermediate_metabolizer": {
                "implication": "Reduced metabolism; higher plasma levels",
                "recommendation": "Consider 25% dose reduction; monitor for side effects. "
                                  "Monitor plasma levels if available. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["23486447", "30322146"],
            },
            "poor_metabolizer": {
                "implication": "Markedly reduced metabolism; high plasma levels",
                "recommendation": "Avoid nortriptyline if possible; consider alternative not "
                                  "metabolized by CYP2D6. If used, start at 50% dose. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "strong",
                "pmids": ["23486447", "30322146", "25974710"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2016-update",
        "evidence_grade": "A",
    },
    {
        "gene": "CYP2D6",
        "medications": ["paroxetine", "fluoxetine", "fluvoxamine"],
        "drug_class": "SSRI",
        "phenotypes": {
            "ultrarapid_metabolizer": {
                "implication": "Rapid clearance; may need higher dose",
                "recommendation": "Standard dosing; titrate based on clinical response. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["25974710"],
            },
            "extensive_metabolizer": {
                "implication": "Normal metabolism",
                "recommendation": "Standard dosing. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "standard",
                "pmids": ["25974710"],
            },
            "intermediate_metabolizer": {
                "implication": "Reduced metabolism",
                "recommendation": "Consider starting at lower dose; monitor for side effects. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["25974710"],
            },
            "poor_metabolizer": {
                "implication": "Markedly reduced clearance; higher SSRI levels",
                "recommendation": "Consider 50% dose reduction or alternative SSRI not "
                                  "primarily metabolized by CYP2D6 (e.g., citalopram, sertraline). "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["25974710", "30322146"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2021-update",
        "evidence_grade": "A",
    },
    {
        "gene": "CYP2D6",
        "medications": ["risperidone", "paliperidone"],
        "drug_class": "atypical antipsychotic",
        "phenotypes": {
            "ultrarapid_metabolizer": {
                "implication": "Lower active metabolite levels",
                "recommendation": "Monitor clinical response; consider dose adjustment. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["31859908"],
            },
            "extensive_metabolizer": {
                "implication": "Normal metabolism",
                "recommendation": "Standard dosing. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "standard",
                "pmids": ["31859908"],
            },
            "intermediate_metabolizer": {
                "implication": "Increased risperidone/active metabolite ratio",
                "recommendation": "Monitor for side effects; consider dose reduction if tolerability issues. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["31859908"],
            },
            "poor_metabolizer": {
                "implication": "Higher risperidone, lower 9-OH-risperidone levels",
                "recommendation": "Consider 50% dose reduction; monitor for extrapyramidal symptoms. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["31859908", "30322146"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2020",
        "evidence_grade": "A",
    },
    {
        "gene": "CYP2D6",
        "medications": ["haloperidol"],
        "drug_class": "typical antipsychotic",
        "phenotypes": {
            "poor_metabolizer": {
                "implication": "Increased haloperidol levels; higher EPS risk",
                "recommendation": "Consider dose reduction; monitor for extrapyramidal symptoms. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["30322146"],
            },
        },
        "guideline_source": "CPIC/DPWG",
        "guideline_version": "2019",
        "evidence_grade": "B",
    },
    {
        "gene": "CYP2D6",
        "medications": ["atomoxetine"],
        "drug_class": "NRI",
        "phenotypes": {
            "ultrarapid_metabolizer": {
                "implication": "Lower plasma concentrations",
                "recommendation": "Consider alternative ADHD medication. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["29321311"],
            },
            "extensive_metabolizer": {
                "implication": "Normal metabolism",
                "recommendation": "Standard dosing. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "standard",
                "pmids": ["29321311"],
            },
            "intermediate_metabolizer": {
                "implication": "Increased atomoxetine exposure",
                "recommendation": "Monitor for side effects. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["29321311"],
            },
            "poor_metabolizer": {
                "implication": "Markedly increased atomoxetine levels (10x higher AUC)",
                "recommendation": "Start at 0.5 mg/kg; do not exceed 1.2 mg/kg. "
                                  "Monitor for cardiovascular effects. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "strong",
                "pmids": ["29321311", "30322146"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2019",
        "evidence_grade": "A",
    },
    # ── CYP2C19 ───────────────────────────────────────────────────────────
    {
        "gene": "CYP2C19",
        "medications": ["escitalopram", "citalopram"],
        "drug_class": "SSRI",
        "phenotypes": {
            "ultrarapid_metabolizer": {
                "implication": "Increased metabolism; may have reduced efficacy",
                "recommendation": "Consider alternative SSRI not metabolized by CYP2C19 "
                                  "(e.g., sertraline). "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["25974710"],
            },
            "extensive_metabolizer": {
                "implication": "Normal metabolism",
                "recommendation": "Standard dosing. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "standard",
                "pmids": ["25974710"],
            },
            "intermediate_metabolizer": {
                "implication": "Reduced metabolism",
                "recommendation": "Start at standard dose; monitor response. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["25974710"],
            },
            "poor_metabolizer": {
                "implication": "Markedly reduced clearance; higher SSRI levels",
                "recommendation": "Consider 50% dose reduction for citalopram/escitalopram. "
                                  "Max citalopram 20mg (FDA warning for QT prolongation). "
                                  "Consider alternative SSRI. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "strong",
                "pmids": ["25974710", "30322146", "21659909"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2021-update",
        "evidence_grade": "A",
    },
    {
        "gene": "CYP2C19",
        "medications": ["sertraline"],
        "drug_class": "SSRI",
        "phenotypes": {
            "poor_metabolizer": {
                "implication": "Higher sertraline levels",
                "recommendation": "Consider lower starting dose; titrate cautiously. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["25974710"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2021-update",
        "evidence_grade": "A",
    },
    {
        "gene": "CYP2C19",
        "medications": ["diazepam"],
        "drug_class": "benzodiazepine",
        "phenotypes": {
            "ultrarapid_metabolizer": {
                "implication": "Faster clearance of diazepam",
                "recommendation": "May require higher doses; monitor clinical effect. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["30322146"],
            },
            "poor_metabolizer": {
                "implication": "Prolonged diazepam half-life; increased sedation",
                "recommendation": "Consider 50% dose reduction or alternative benzodiazepine. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["30322146"],
            },
        },
        "guideline_source": "CPIC/DPWG",
        "guideline_version": "2020",
        "evidence_grade": "B",
    },
    # ── CYP1A2 ────────────────────────────────────────────────────────────
    {
        "gene": "CYP1A2",
        "medications": ["clozapine", "olanzapine"],
        "drug_class": "atypical antipsychotic",
        "phenotypes": {
            "ultrarapid_metabolizer": {
                "implication": "Lower clozapine/olanzapine levels",
                "recommendation": "May need higher dose; monitor levels. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["26660044"],
            },
            "extensive_metabolizer": {
                "implication": "Normal metabolism",
                "recommendation": "Standard dosing. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "standard",
                "pmids": ["26660044"],
            },
            "intermediate_metabolizer": {
                "implication": "Reduced CYP1A2 activity",
                "recommendation": "Monitor clozapine levels; may need dose adjustment. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["26660044"],
            },
            "poor_metabolizer": {
                "implication": "Significantly reduced clozapine clearance",
                "recommendation": "Start low; monitor clozapine plasma levels. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["26660044", "30322146"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2021",
        "evidence_grade": "A",
    },
    {
        "gene": "CYP1A2",
        "medications": ["duloxetine"],
        "drug_class": "SNRI",
        "phenotypes": {
            "poor_metabolizer": {
                "implication": "Higher duloxetine levels",
                "recommendation": "Start at lower dose; monitor tolerability. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["30322146"],
            },
        },
        "guideline_source": "DPWG",
        "guideline_version": "2020",
        "evidence_grade": "B",
    },
    {
        "gene": "CYP1A2",
        "medications": ["fluvoxamine"],
        "drug_class": "SSRI",
        "phenotypes": {
            "poor_metabolizer": {
                "implication": "Higher fluvoxamine levels; potent CYP inhibitor effects",
                "recommendation": "Start low; monitor for drug-drug interactions via CYP inhibition. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["30322146"],
            },
        },
        "guideline_source": "DPWG",
        "guideline_version": "2020",
        "evidence_grade": "B",
    },
    # ── CYP2C9 ────────────────────────────────────────────────────────────
    {
        "gene": "CYP2C9",
        "medications": ["warfarin"],
        "drug_class": "anticoagulant",
        "phenotypes": {
            "extensive_metabolizer": {
                "implication": "Normal S-warfarin metabolism",
                "recommendation": "Standard dosing algorithm. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "standard",
                "pmids": ["28222300"],
            },
            "intermediate_metabolizer": {
                "implication": "Reduced warfarin clearance",
                "recommendation": "Consider lower initial dose; monitor INR more frequently. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["28222300"],
            },
            "poor_metabolizer": {
                "implication": "Markedly reduced S-warfarin clearance; bleeding risk",
                "recommendation": "Significantly reduce initial dose (typically 30-50% reduction). "
                                  "Monitor INR closely; consider pharmacogenomic dosing algorithm. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "strong",
                "pmids": ["28222300", "30322146"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2017-update",
        "evidence_grade": "A",
    },
    {
        "gene": "CYP2C9",
        "medications": ["phenytoin"],
        "drug_class": "anticonvulsant",
        "phenotypes": {
            "intermediate_metabolizer": {
                "implication": "Reduced phenytoin metabolism",
                "recommendation": "Consider 25% dose reduction; monitor levels. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["28222300"],
            },
            "poor_metabolizer": {
                "implication": "Markedly reduced clearance; toxicity risk",
                "recommendation": "Avoid phenytoin if possible; consider alternative anticonvulsant. "
                                  "If used, start at 50% dose; monitor levels frequently. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "strong",
                "pmids": ["28222300", "30322146"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2020",
        "evidence_grade": "A",
    },
    # ── HLA-B*57:01 ───────────────────────────────────────────────────────
    {
        "gene": "HLA-B*57:01",
        "medications": ["carbamazepine"],
        "drug_class": "anticonvulsant / mood stabilizer",
        "phenotypes": {
            "positive": {
                "implication": "Increased risk of SJS/TEN (Stevens-Johnson syndrome / toxic epidermal necrolysis)",
                "recommendation": "If HLA-B*57:01 positive: avoid carbamazepine. "
                                  "Consider alternative anticonvulsant (e.g., lamotrigine, valproate). "
                                  "If no alternative, use with extreme caution and close dermatologic monitoring. "
                                  "Decision-support only -- not a substitute for clinical genetic testing.",
                "classification": "strong",
                "pmids": ["17301793", "19228623"],
            },
            "negative": {
                "implication": "Standard SJS/TEN risk",
                "recommendation": "Standard monitoring for skin reactions when starting carbamazepine. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "standard",
                "pmids": ["17301793"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2022",
        "evidence_grade": "A",
    },
    # ── HLA-B*1502 ───────────────────────────────────────────────────────
    {
        "gene": "HLA-B*1502",
        "medications": ["carbamazepine"],
        "drug_class": "anticonvulsant / mood stabilizer",
        "phenotypes": {
            "positive": {
                "implication": "Very high risk of carbamazepine-induced SJS/TEN in Asian ancestry populations",
                "recommendation": "If HLA-B*1502 positive: avoid carbamazepine. "
                                  "Applies especially to patients of Han Chinese, Thai, Indian, and Malaysian ancestry. "
                                  "Consider alternative anticonvulsant. "
                                  "Decision-support only -- not a substitute for clinical genetic testing.",
                "classification": "strong",
                "pmids": ["18202698", "19228623", "20350132"],
            },
            "negative": {
                "implication": "Standard SJS/TEN risk for patient's ancestry",
                "recommendation": "Standard monitoring for skin reactions. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "standard",
                "pmids": ["18202698"],
            },
        },
        "guideline_source": "CPIC/FDA",
        "guideline_version": "2022",
        "evidence_grade": "A",
    },
    # ── CYP3A4 ────────────────────────────────────────────────────────────
    {
        "gene": "CYP3A4",
        "medications": ["quetiapine", "aripiprazole", "ziprasidone", "lurasidone"],
        "drug_class": "atypical antipsychotic",
        "phenotypes": {
            "ultrarapid_metabolizer": {
                "implication": "Lower antipsychotic levels; may need higher dose",
                "recommendation": "Monitor clinical response; may require dose increase. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "optional",
                "pmids": ["31859908"],
            },
            "poor_metabolizer": {
                "implication": "Higher antipsychotic levels; increased side effect risk",
                "recommendation": "Start at lower dose; monitor for side effects. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["31859908"],
            },
        },
        "guideline_source": "CPIC/DPWG",
        "guideline_version": "2021",
        "evidence_grade": "B",
    },
    {
        "gene": "CYP3A4",
        "medications": ["midazolam", "triazolam", "alprazolam"],
        "drug_class": "benzodiazepine",
        "phenotypes": {
            "poor_metabolizer": {
                "implication": "Higher benzodiazepine levels; increased sedation",
                "recommendation": "Consider 50% dose reduction; avoid in severe impairment. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["30322146"],
            },
        },
        "guideline_source": "DPWG",
        "guideline_version": "2020",
        "evidence_grade": "B",
    },
    # ── SLCO1B1 ───────────────────────────────────────────────────────────
    {
        "gene": "SLCO1B1",
        "medications": ["simvastatin", "atorvastatin"],
        "drug_class": "statin",
        "phenotypes": {
            "intermediate_function": {
                "implication": "Increased statin plasma levels; higher myopathy risk",
                "recommendation": "Consider lower statin dose or pravastatin/rosuvastatin. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "moderate",
                "pmids": ["24918167"],
            },
            "poor_function": {
                "implication": "Markedly increased statin levels; high myopathy risk",
                "recommendation": "Avoid simvastatin; consider pravastatin or rosuvastatin at lower dose. "
                                  "Decision-support only -- requires clinician judgment.",
                "classification": "strong",
                "pmids": ["24918167", "30322146"],
            },
        },
        "guideline_source": "CPIC",
        "guideline_version": "2022",
        "evidence_grade": "A",
    },
]

# Build lookup index for O(1) medication search
_MEDICATION_TO_GUIDELINES: dict[str, list[dict[str, Any]]] = {}
for guideline in _CPIC_GUIDELINES:
    for med in guideline["medications"]:
        med_lower = med.lower()
        if med_lower not in _MEDICATION_TO_GUIDELINES:
            _MEDICATION_TO_GUIDELINES[med_lower] = []
        _MEDICATION_TO_GUIDELINES[med_lower].append(guideline)


# ── Public API ───────────────────────────────────────────────────────────────


def build_pharmacogenomics_panel(
    med_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build pharmacogenomic alert panel based on CPIC guidelines.

    Covers CYP2D6, CYP2C19, CYP1A2, CYP3A4, CYP2C9, SLCO1B1, HLA-B*57:01.
    Decision-support only -- not a replacement for clinical pharmacogenomic testing.

    Args:
        med_records: List of medication records, each with at least a "name" or
                     "drug_name" or "generic_name" field.

    Returns:
        List of pharmacogenomic alert dicts, each containing:
        - gene: the pharmacogene
        - medication: the drug requiring PGx consideration
        - phenotype_implications: dict of phenotype -> implication mapping
        - cpic_recommendation: CPIC recommendation summary
        - evidence_grade: "A" for CPIC, "B" for DPWG
        - pmids: PubMed IDs for CPIC guideline references
        - classification: strong/moderate/optional/standard
        - disclaimer: decision-support disclaimer
    """
    alerts: list[dict[str, Any]] = []
    seen: set[str] = set()

    for record in med_records:
        # Extract medication name from various record formats
        name = _extract_med_name(record)
        if not name:
            continue

        name_lower = name.lower()

        # Check if medication has CPIC guidelines
        guidelines = _MEDICATION_TO_GUIDELINES.get(name_lower)
        if not guidelines:
            continue

        for guideline in guidelines:
            # Build unique key for deduplication
            key = f"{guideline['gene']}:{name_lower}"
            if key in seen:
                continue
            seen.add(key)

            # Build alert for all phenotypes
            phenotypes = guideline.get("phenotypes", {})
            phenotype_list: list[dict[str, Any]] = []
            for phenotype, details in phenotypes.items():
                phenotype_list.append({
                    "phenotype": phenotype,
                    "implication": details["implication"],
                    "recommendation": details["recommendation"],
                    "classification": details["classification"],
                })

            alerts.append({
                "id": f"pgx-{guideline['gene'].lower().replace('*', '')}-{name_lower[:10]}",
                "gene": guideline["gene"],
                "medication": name,
                "drug_class": guideline.get("drug_class", ""),
                "phenotype_implications": phenotype_list,
                "cpic_recommendation_summary": _build_cpic_summary(phenotypes),
                "evidence_grade": guideline["evidence_grade"],
                "guideline_source": guideline["guideline_source"],
                "guideline_version": guideline["guideline_version"],
                "pmids": _collect_pmids(phenotypes),
                "highest_classification": _highest_classification(phenotypes),
                "disclaimer": (
                    "Decision-support only -- not a replacement for clinical "
                    "pharmacogenomic testing. CPIC guidelines inform practice but "
                    "require clinician judgment, patient consent, and laboratory "
                    "confirmation before clinical action."
                ),
                "generated_at": datetime.now(timezone.utc).isoformat(),
            })

    return alerts


def get_guideline_for_medication(medication_name: str) -> list[dict[str, Any]]:
    """Get all CPIC guidelines for a specific medication.

    Returns empty list if no guidelines found.
    """
    if not medication_name:
        return []
    return _MEDICATION_TO_GUIDELINES.get(medication_name.lower(), [])


def get_all_guidelines() -> list[dict[str, Any]]:
    """Return all CPIC guidelines in the database."""
    return list(_CPIC_GUIDELINES)


def get_genes_covered() -> list[str]:
    """Return list of all pharmacogenes covered."""
    genes: set[str] = set()
    for guideline in _CPIC_GUIDELINES:
        genes.add(guideline["gene"])
    return sorted(genes)


def get_medications_covered() -> list[str]:
    """Return list of all medications with CPIC guidelines."""
    meds: set[str] = set()
    for guideline in _CPIC_GUIDELINES:
        for med in guideline["medications"]:
            meds.add(med.lower())
    return sorted(meds)


def get_panel_stats() -> dict[str, Any]:
    """Return statistics about the pharmacogenomics panel."""
    genes = get_genes_covered()
    meds = get_medications_covered()

    gene_med_count: dict[str, int] = {}
    for guideline in _CPIC_GUIDELINES:
        gene = guideline["gene"]
        gene_med_count[gene] = gene_med_count.get(gene, 0) + len(guideline["medications"])

    grade_a_count = sum(1 for g in _CPIC_GUIDELINES if g["evidence_grade"] == "A")
    grade_b_count = sum(1 for g in _CPIC_GUIDELINES if g["evidence_grade"] == "B")

    return {
        "genes_covered": len(genes),
        "gene_list": genes,
        "medications_covered": len(meds),
        "medication_list": meds,
        "guideline_count": len(_CPIC_GUIDELINES),
        "gene_medication_pairs": gene_med_count,
        "evidence_breakdown": {
            "grade_A_CPIC": grade_a_count,
            "grade_B_DPWG": grade_b_count,
        },
        "disclaimer": (
            "Decision-support only -- not a replacement for clinical "
            "pharmacogenomic testing."
        ),
    }


# ── Internal helpers ─────────────────────────────────────────────────────────


def _extract_med_name(record: dict[str, Any]) -> str | None:
    """Extract medication name from various record formats."""
    for key in ("name", "drug_name", "generic_name", "medication", "drug"):
        val = record.get(key)
        if val and str(val).strip():
            return str(val).strip()
    return None


def _build_cpic_summary(phenotypes: dict[str, Any]) -> str:
    """Build a human-readable summary of CPIC recommendations."""
    parts: list[str] = []
    for phenotype, details in phenotypes.items():
        classification = details.get("classification", "")
        if classification in ("strong", "moderate"):
            parts.append(
                f"{phenotype}: {details['implication']} -- "
                f"{details['recommendation'][:120]}..."
            )
    if not parts:
        # Include all if no strong/moderate
        for phenotype, details in list(phenotypes.items())[:2]:
            parts.append(f"{phenotype}: {details['implication']}")
    return " | ".join(parts)


def _collect_pmids(phenotypes: dict[str, Any]) -> list[str]:
    """Collect all unique PMIDs across phenotypes."""
    pmids: set[str] = set()
    for details in phenotypes.values():
        for pmid in details.get("pmids", []):
            pmids.add(str(pmid))
    return sorted(pmids)


def _highest_classification(phenotypes: dict[str, Any]) -> str:
    """Return the highest classification across phenotypes."""
    order = {"strong": 4, "moderate": 3, "optional": 2, "standard": 1}
    highest = "standard"
    highest_rank = 0
    for details in phenotypes.values():
        classification = details.get("classification", "standard")
        rank = order.get(classification, 0)
        if rank > highest_rank:
            highest_rank = rank
            highest = classification
    return highest
