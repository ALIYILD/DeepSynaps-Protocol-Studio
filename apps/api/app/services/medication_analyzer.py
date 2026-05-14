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

# Phase 2: Pharmacogenomics panel (CPIC guidelines)
from app.services.pharmacogenomics_panel import (
    build_pharmacogenomics_panel as _build_pharmacogenomics_panel_raw,
    get_panel_stats as _get_pgx_panel_stats,
)

RULESET_VERSION = "med-analyzer-rules-v2"

# ── Medication Biomarker Confounder Matrix (referenced by washout calculator) ──
MEDICATION_BIOMARKER_CONFOUNDER_MATRIX: dict[str, dict[str, Any]] = {
    "antipsychotic": {
        "affected_biomarkers": [
            "qEEG theta/delta power",
            "qEEG alpha power",
            "P300 latency",
            "prolactin",
            "PFC cortical thickness",
            "weight/BMI",
            "fasting glucose",
            "lipids",
        ],
        "typical_washout_days": 14,
        "extended_washout_days": 30,
        "washout_notes": "D2 blockade effects on prolactin may persist beyond 2 weeks. Metabolic changes may not fully reverse.",
        "evidence_grade": "A",
    },
    "benzodiazepine": {
        "affected_biomarkers": [
            "qEEG beta power",
            "qEEG theta/delta (acute)",
            "P300 latency",
            "cognitive task performance",
            "HRV (mild reduction)",
        ],
        "typical_washout_days": 7,
        "extended_washout_days": 21,
        "washout_notes": "GABA-A receptor upregulation may persist for weeks. Cognitive effects may outlast plasma half-life.",
        "evidence_grade": "A",
    },
    "ssri": {
        "affected_biomarkers": [
            "theta/beta ratio",
            "frontal asymmetry (alpha)",
            "HRV (mild decrease)",
            "BDNF (elevation)",
            "IL-6 / TNF-alpha",
            "cortisol awakening response",
            "DMN connectivity (rs-fMRI)",
        ],
        "typical_washout_days": 14,
        "extended_washout_days": 21,
        "washout_notes": "Neuroplasticity and inflammatory effects may take 2-4 weeks to normalize. Fluoxetine has long half-life.",
        "evidence_grade": "A",
    },
    "snri": {
        "affected_biomarkers": [
            "frontal asymmetry (alpha)",
            "HRV (moderate-to-large reduction)",
        ],
        "typical_washout_days": 7,
        "extended_washout_days": 14,
        "washout_notes": "NESDA finding: HRV reduction is large for SNRIs. Noradrenergic effects may persist.",
        "evidence_grade": "B",
    },
    "tca": {
        "affected_biomarkers": [
            "qEEG alpha power",
            "HRV (large reduction)",
            "weight",
            "ECG QTc",
        ],
        "typical_washout_days": 7,
        "extended_washout_days": 14,
        "washout_notes": "Anticholinergic effects and HRV changes may persist. Cardiac effects require monitoring.",
        "evidence_grade": "A",
    },
    "stimulant": {
        "affected_biomarkers": [
            "qEEG beta/theta-beta ratio",
            "qEEG alpha power (decrease)",
            "HRV (reduction)",
            "blood pressure",
            "heart rate",
        ],
        "typical_washout_days": 2,
        "extended_washout_days": 5,
        "washout_notes": "Effects are largely task-dependent and acute. Short washout usually sufficient for qEEG.",
        "evidence_grade": "B",
    },
    "mood_stabilizer_lithium": {
        "affected_biomarkers": [
            "BDNF (elevation)",
            "TSH (elevation)",
            "hippocampal volume (increase)",
            "cortisol awakening response",
        ],
        "typical_washout_days": 7,
        "extended_washout_days": 14,
        "washout_notes": "Lithium has narrow therapeutic index. TSH changes may persist months. Volume changes may be structural.",
        "evidence_grade": "A",
    },
    "anticonvulsant_valproate": {
        "affected_biomarkers": [
            "folate (depletion)",
            "testosterone",
            "liver enzymes",
            "platelets",
        ],
        "typical_washout_days": 7,
        "extended_washout_days": 14,
        "washout_notes": "Folate depletion risk; neural tube defect risk if pregnancy. Platelet effects may persist.",
        "evidence_grade": "B",
    },
    "atypical_antipsychotic": {
        "affected_biomarkers": [
            "weight/BMI",
            "fasting glucose",
            "lipids",
            "prolactin (variable by agent)",
            "qEEG theta/delta power",
            "P300 latency",
            "PFC cortical thickness",
        ],
        "typical_washout_days": 14,
        "extended_washout_days": 30,
        "washout_notes": "Metabolic syndrome risk per ADA monitoring protocol. Olanzapine/clozapine have highest metabolic risk.",
        "evidence_grade": "A",
    },
    "nassa": {
        "affected_biomarkers": [
            "weight/BMI",
            "appetite",
            "sleep architecture",
        ],
        "typical_washout_days": 7,
        "extended_washout_days": 14,
        "washout_notes": "Mirtazapine-associated weight gain can be rapid. H1 antagonism drives appetite increase.",
        "evidence_grade": "B",
    },
}


# ── Nutrition-Drug Interactions ──
NUTRITION_INTERACTIONS: list[dict[str, Any]] = [
    {
        "id": "ni-lithium-sodium",
        "drug_classes": ["mood stabilizer"],
        "drug_names": ["lithium", "lithium carbonate", "lithium citrate"],
        "nutrient": "sodium",
        "interaction_type": "pharmacokinetic",
        "severity": "critical",
        "mechanism": (
            "Lithium is filtered at the glomerulus and 60-80% reabsorbed by the proximal tubule "
            "alongside sodium. Sodium restriction increases lithium reabsorption; sodium loading "
            "or diuretic-induced sodium depletion can cause acute lithium toxicity. Consistent "
            "daily sodium intake is required for stable serum levels."
        ),
        "clinical_action": (
            "Counsel patient on maintaining consistent daily sodium intake. Review diuretic use. "
            "Monitor serum lithium per schedule and when dietary sodium changes significantly."
        ),
        "evidence_grade": "A",
        "references": [
            {"pmid": "17620072", "title": "Lithium and sodium balance in clinical practice"},
        ],
    },
    {
        "id": "ni-valproate-folate",
        "drug_classes": ["anticonvulsant / mood stabilizer"],
        "drug_names": ["valproate", "valproic acid", "divalproex"],
        "nutrient": "folate",
        "interaction_type": "pharmacodynamic",
        "severity": "moderate",
        "mechanism": (
            "Valproate impairs folate metabolism and absorption. Chronic use depletes folate stores. "
            "Folate deficiency in pregnancy is associated with neural tube defects; valproate itself "
            "is a known teratogen with dose-dependent neural tube defect risk (~6-11% at therapeutic doses)."
        ),
        "clinical_action": (
            "Baseline and periodic folate supplementation (0.4-5 mg daily) recommended. "
            "Mandatory pregnancy screening and contraception counseling. Annual folate level assessment."
        ),
        "evidence_grade": "A",
        "references": [
            {"pmid": "16445450", "title": "Folate supplementation in women treated with valproic acid"},
        ],
    },
    {
        "id": "ni-carbamazepine-vitd",
        "drug_classes": ["anticonvulsant / mood stabilizer"],
        "drug_names": ["carbamazepine"],
        "nutrient": "vitamin D",
        "interaction_type": "pharmacokinetic",
        "severity": "moderate",
        "mechanism": (
            "Carbamazepine is a potent CYP450 enzyme inducer that accelerates vitamin D catabolism, "
            "leading to secondary hypoparathyroidism and reduced bone mineral density. Long-term use "
            "is associated with increased fracture risk."
        ),
        "clinical_action": (
            "Baseline and annual 25-OH vitamin D measurement. Supplement with vitamin D3 (800-2000 IU/day) "
            "and calcium (1000-1200 mg/day) if deficient. Consider DEXA scan for patients on long-term therapy."
        ),
        "evidence_grade": "B",
        "references": [
            {"pmid": "19126268", "title": "Effects of enzyme-inducing AEDs on bone metabolism"},
        ],
    },
    {
        "id": "ni-metformin-b12",
        "drug_classes": ["antidiabetic"],
        "drug_names": ["metformin"],
        "nutrient": "vitamin B12",
        "interaction_type": "pharmacokinetic",
        "severity": "moderate",
        "mechanism": (
            "Metformin reduces intestinal absorption of vitamin B12 via effects on calcium-dependent "
            "ileal membrane receptors. Depletion develops insidiously over months to years and can cause "
            "irreversible neuropathy if undetected."
        ),
        "clinical_action": (
            "Annual B12 level measurement for all patients on metformin >4 months. Consider baseline "
            "B12 at initiation. Replete with oral B12 (1000 mcg/day) or IM B12 if severely deficient."
        ),
        "evidence_grade": "A",
        "references": [
            {"pmid": "20424228", "title": "Metformin and vitamin B12 deficiency: a review"},
        ],
    },
    {
        "id": "ni-statin-coenzymeq10",
        "drug_classes": ["lipid-lowering"],
        "drug_names": ["atorvastatin", "simvastatin", "rosuvastatin", "pravastatin"],
        "nutrient": "coenzyme Q10 (CoQ10)",
        "interaction_type": "pharmacodynamic",
        "severity": "mild",
        "mechanism": (
            "Statins inhibit HMG-CoA reductase, the rate-limiting step in cholesterol synthesis. "
            "This shared pathway also produces CoQ10 (ubiquinone), and statin therapy reduces CoQ10 "
            "levels in a dose-dependent manner. May contribute to myalgia/myopathy symptoms."
        ),
        "clinical_action": (
            "Consider CoQ10 supplementation (100-200 mg daily) if patient reports myalgia or is on high-dose statin. "
            "Not routinely required for all patients. Monitor CK if symptomatic."
        ),
        "evidence_grade": "C",
        "references": [
            {"pmid": "19104045", "title": "CoQ10 supplementation in statin-associated myopathy"},
        ],
    },
    {
        "id": "ni-antipsychotic-metabolic",
        "drug_classes": ["atypical antipsychotic", "antipsychotic"],
        "drug_names": ["olanzapine", "clozapine", "quetiapine", "risperidone", "aripiprazole"],
        "nutrient": "metabolic syndrome / diet",
        "interaction_type": "pharmacodynamic",
        "severity": "critical",
        "mechanism": (
            "Antipsychotics, particularly clozapine and olanzapine, are associated with significant weight gain, "
            "insulin resistance, dyslipidemia, and type 2 diabetes via H1, 5-HT2C, and M3 receptor effects. "
            "The ADA/APA consensus statement recommends structured metabolic monitoring."
        ),
        "clinical_action": (
            "ADA monitoring protocol: baseline weight, BMI, waist circumference, fasting glucose or HbA1c, "
            "and lipid panel. Monitor at 4 weeks, 8 weeks, 12 weeks, then quarterly x 1 year, then annually. "
            "Dietary counseling and structured exercise program recommended at initiation."
        ),
        "evidence_grade": "A",
        "references": [
            {"pmid": "16452568", "title": "ADA consensus statement on metabolic monitoring for antipsychotics"},
        ],
    },
    {
        "id": "ni-ssri-omega3",
        "drug_classes": ["SSRI"],
        "drug_names": ["sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram", "fluvoxamine"],
        "nutrient": "omega-3 fatty acids (fish oil)",
        "interaction_type": "pharmacodynamic",
        "severity": "moderate",
        "mechanism": (
            "Omega-3 fatty acids, especially EPA, have antiplatelet effects. Combined with SSRIs, which impair "
            "platelet serotonin uptake (platelets lack serotonin transporters independently), the bleeding risk "
            "may be additive. Risk is greatest with high-dose EPA/DHA (>3 g/day)."
        ),
        "clinical_action": (
            "Assess baseline bleeding risk and concurrent anticoagulant/antiplatelet use. If patient is on "
            "warfarin, aspirin, or NSAIDs, monitor for signs of bleeding. Typical dietary omega-3 doses (1-2 g EPA+DHA) "
            "are generally safe."
        ),
        "evidence_grade": "B",
        "references": [
            {"pmid": "21219857", "title": "Omega-3 fatty acid and SSRI antiplatelet interaction"},
        ],
    },
    {
        "id": "ni-warfarin-vitamink",
        "drug_classes": ["anticoagulant"],
        "drug_names": ["warfarin"],
        "nutrient": "vitamin K",
        "interaction_type": "pharmacokinetic",
        "severity": "critical",
        "mechanism": (
            "Warfarin inhibits vitamin K epoxide reductase (VKORC1). Dietary vitamin K is required for synthesis "
            "of clotting factors II, VII, IX, and X. Variable vitamin K intake causes INR instability; high intake "
            "antagonizes warfarin, low intake potentiates anticoagulation."
        ),
        "clinical_action": (
            "Counsel patient to maintain consistent daily vitamin K intake. Monitor INR weekly when dietary "
            "changes occur. Consider pharmacogenomic testing (CYP2C9/VKORC1) for dosing guidance."
        ),
        "evidence_grade": "A",
        "references": [
            {"pmid": "18544660", "title": "Warfarin-vitamin K interaction: a systematic review"},
        ],
    },
    {
        "id": "ni-ppi-b12-mg-ca",
        "drug_classes": ["proton pump inhibitor"],
        "drug_names": ["omeprazole", "esomeprazole", "lansoprazole", "pantoprazole", "rabeprazole"],
        "nutrient": "vitamin B12, magnesium, calcium",
        "interaction_type": "pharmacokinetic",
        "severity": "moderate",
        "mechanism": (
            "Chronic PPI use (>12 months) increases gastric pH, reducing release and absorption of B12 from food proteins, "
            "and impairing calcium and magnesium absorption. Hypomagnesemia can be clinically significant and refractory "
            "to oral magnesium replacement until PPI is discontinued."
        ),
        "clinical_action": (
            "Annual B12 and magnesium monitoring for patients on PPI >1 year. If magnesium <0.7 mmol/L, consider "
            "switching to H2-blocker or intermittent PPI dosing. Calcium supplementation with meals may partially offset loss."
        ),
        "evidence_grade": "B",
        "references": [
            {"pmid": "21680946", "title": "Proton pump inhibitors and nutrient depletion: a review"},
        ],
    },
    {
        "id": "ni-thiazide-lithium",
        "drug_classes": ["diuretic"],
        "drug_names": ["hydrochlorothiazide", "chlorthalidone", "indapamide"],
        "nutrient": "lithium clearance",
        "interaction_type": "pharmacokinetic",
        "severity": "severe",
        "mechanism": (
            "Thiazide diuretics reduce lithium renal clearance by increasing proximal tubular sodium and lithium reabsorption. "
            "This can increase serum lithium levels 25-40% and precipitate toxicity. Loop diuretics have less effect but "
            "still require monitoring."
        ),
        "clinical_action": (
            "Avoid thiazide diuretics in patients on lithium if possible. If co-prescribing is unavoidable, reduce lithium "
            "dose by 50% initially and check lithium level within 1 week, then weekly until stable. Monitor sodium simultaneously."
        ),
        "evidence_grade": "A",
        "references": [
            {"pmid": "17620072", "title": "Lithium interactions with diuretics and ACE inhibitors"},
        ],
    },
    {
        "id": "ni-caffeine-clozapine",
        "drug_classes": ["atypical antipsychotic"],
        "drug_names": ["clozapine"],
        "nutrient": "caffeine (CYP1A2 substrate/inhibitor)",
        "interaction_type": "pharmacokinetic",
        "severity": "moderate",
        "mechanism": (
            "Clozapine is primarily metabolized by CYP1A2. Caffeine is a competing CYP1A2 substrate that can inhibit "
            "clozapine metabolism. Smoking cessation (which induces CYP1A2) combined with caffeine intake can cause "
            "clozapine levels to rise unpredictably when a patient quits smoking."
        ),
        "clinical_action": (
            "Monitor clozapine levels when patient changes caffeine intake or smoking status. If patient stops smoking, "
            "expect clozapine levels to increase 50-75% and adjust dose accordingly. Coordinate with pharmacy for level checks."
        ),
        "evidence_grade": "B",
        "references": [
            {"pmid": "11772082", "title": "Caffeine and clozapine: CYP1A2 interaction in clinical practice"},
        ],
    },
    {
        "id": "ni-grapefruit-cyp3a4",
        "drug_classes": ["multiple"],
        "drug_names": ["quetiapine", "lurasidone", "buspirone", "carbamazepine", "simvastatin"],
        "nutrient": "grapefruit / grapefruit juice",
        "interaction_type": "pharmacokinetic",
        "severity": "moderate",
        "mechanism": (
            "Grapefruit contains furanocoumarins that irreversibly inhibit intestinal CYP3A4, increasing bioavailability "
            "of CYP3A4 substrates by 30-400% depending on substrate and juice concentration. Effect persists 24-72 hours. "
            "Notable psychiatric substrates include quetiapine, lurasidone, and buspirone."
        ),
        "clinical_action": (
            "Advise patients to avoid grapefruit and grapefruit juice entirely while on CYP3A4 substrate medications. "
            "If accidental consumption occurs, monitor for increased side effects and hold next dose per prescriber guidance."
        ),
        "evidence_grade": "A",
        "references": [
            {"pmid": "16372910", "title": "Grapefruit-drug interactions: a systematic review"},
        ],
    },
]


# ── Lab Monitoring Schedules ──
LAB_MONITORING_SCHEDULES: dict[str, dict[str, Any]] = {
    "lithium": {
        "medication_names": ["lithium", "lithium carbonate", "lithium citrate"],
        "baseline_labs": [
            {"test": "CBC with differential", "rationale": "Baseline blood counts"},
            {"test": "Comprehensive metabolic panel (CMP)", "rationale": "Renal function, electrolytes, calcium"},
            {"test": "TSH", "rationale": "Screen for subclinical hypothyroidism"},
            {"test": "EKG", "rationale": "If cardiac risk factors or age >50"},
            {"test": "Pregnancy test", "rationale": "If applicable"},
        ],
        "ongoing_labs": [
            {"test": "TSH", "frequency": "every 6 months", "rationale": "Lithium-induced hypothyroidism risk 10-30%"},
            {"test": "Serum lithium level", "frequency": "every 3 months (stable)", "rationale": "Therapeutic window 0.6-1.2 mEq/L; toxicity >1.5"},
            {"test": "Creatinine/eGFR", "frequency": "every 3-6 months", "rationale": "Nephrogenic diabetes insipidus risk"},
            {"test": "Calcium", "frequency": "every 6 months", "rationale": "Hyperparathyroidism risk"},
        ],
        "special": [
            {"scenario": "Pre-ECT", "test": "Serum lithium level", "timing": "within 48 hours", "rationale": "Reduced seizure threshold and delirium risk"},
            {"scenario": "Dehydration/illness", "test": "Serum lithium level", "timing": "within 24-48 hours", "rationale": "Acute toxicity risk with reduced GFR"},
            {"scenario": "Thiazide diuretic added", "test": "Serum lithium level", "timing": "within 1 week", "rationale": "Reduced lithium clearance 25-40%"},
        ],
        "evidence_grade": "A",
    },
    "clozapine": {
        "medication_names": ["clozapine"],
        "baseline_labs": [
            {"test": "Absolute neutrophil count (ANC)", "rationale": "REMS requirement: baseline ANC >= 1500/uL"},
            {"test": "WBC with differential", "rationale": "REMS requirement"},
            {"test": "CMP", "rationale": "Metabolic baseline"},
            {"test": "Fasting glucose or HbA1c", "rationale": "Metabolic syndrome risk"},
            {"test": "Fasting lipid panel", "rationale": "Dyslipidemia risk"},
        ],
        "ongoing_labs": [
            {"test": "ANC + WBC", "frequency": "weekly x 6 months", "rationale": "REMS: highest neutropenia risk in first 6 months"},
            {"test": "ANC + WBC", "frequency": "every 2 weeks x 6 months", "rationale": "REMS: months 7-12"},
            {"test": "ANC + WBC", "frequency": "monthly thereafter", "rationale": "REMS ongoing requirement"},
            {"test": "Metabolic panel (weight, glucose, lipids)", "frequency": "quarterly x 1 year, then annually", "rationale": "ADA metabolic monitoring protocol"},
        ],
        "special": [
            {"scenario": "ANC 1000-1499", "action": "Interrupt therapy, monitor ANC 3x weekly until >= 1500"},
            {"scenario": "ANC 500-999", "action": "Stop clozapine, monitor daily, do not rechallenge"},
            {"scenario": "ANC <500", "action": "Urgent hematology consult, protective isolation"},
        ],
        "evidence_grade": "A",
    },
    "valproate": {
        "medication_names": ["valproate", "valproic acid", "divalproex"],
        "baseline_labs": [
            {"test": "Liver function tests (AST/ALT/bilirubin)", "rationale": "Hepatotoxicity risk"},
            {"test": "CBC with platelets", "rationale": "Thrombocytopenia and platelet dysfunction risk"},
            {"test": "Folate level", "rationale": "Baseline before supplementation"},
            {"test": "Pregnancy test", "rationale": "Category X, neural tube defect risk"},
        ],
        "ongoing_labs": [
            {"test": "LFTs + CBC", "frequency": "every 6 months (stable)", "rationale": "Hepatotoxicity and thrombocytopenia"},
            {"test": "Valproate level", "frequency": "prn (toxicity symptoms, non-adherence, dose change)", "rationale": "Therapeutic range 50-100 mcg/mL"},
            {"test": "Ammonia", "frequency": "if encephalopathy suspected", "rationale": "Hyperammonemia can occur with normal LFTs"},
        ],
        "special": [
            {"scenario": "Pregnancy planning", "action": "Transition to alternative agent if possible"},
        ],
        "evidence_grade": "A",
    },
    "carbamazepine": {
        "medication_names": ["carbamazepine"],
        "baseline_labs": [
            {"test": "CBC with differential", "rationale": "Agranulocytosis and aplastic anemia risk"},
            {"test": "Liver function tests", "rationale": "Hepatotoxicity risk"},
            {"test": "Serum sodium", "rationale": "SIADH/hyponatremia risk (up to 40%)"},
            {"test": "25-OH vitamin D", "rationale": "Enzyme induction depletes vitamin D"},
            {"test": "HLA-B*1502", "rationale": "Stevens-Johnson syndrome risk in Asian ancestry", "optional": True},
        ],
        "ongoing_labs": [
            {"test": "CBC + LFTs + sodium", "frequency": "every 3 months x 1 year, then every 6 months", "rationale": "Bone marrow suppression, hepatotoxicity, hyponatremia"},
            {"test": "25-OH vitamin D", "frequency": "annually", "rationale": "Enzyme induction effect"},
            {"test": "Carbamazepine level", "frequency": "prn", "rationale": "Therapeutic range 4-12 mcg/mL"},
        ],
        "special": [
            {"scenario": "Rash develops", "action": "Stop immediately, evaluate for SJS/TEN"},
        ],
        "evidence_grade": "A",
    },
    "olanzapine": {
        "medication_names": ["olanzapine"],
        "baseline_labs": [
            {"test": "Weight and BMI", "rationale": "Expected gain 5-10 kg in first year"},
            {"test": "Fasting glucose or HbA1c", "rationale": "Diabetes risk"},
            {"test": "Fasting lipid panel", "rationale": "Dyslipidemia risk"},
            {"test": "Prolactin (optional)", "rationale": "If galactorrhea/amenorrhea symptoms"},
        ],
        "ongoing_labs": [
            {"test": "Weight, glucose, lipids", "frequency": "every 3 months x 1 year, then annually", "rationale": "ADA monitoring protocol for SGAs"},
        ],
        "special": [
            {"scenario": "Weight gain >7% baseline", "action": "Dietary intervention, consider switch to lower-risk agent"},
        ],
        "evidence_grade": "A",
    },
    "lamotrigine": {
        "medication_names": ["lamotrigine"],
        "baseline_labs": [
            {"test": "CBC", "rationale": "Rare blood dyscrasias"},
        ],
        "ongoing_labs": [
            {"test": "CBC + LFTs", "frequency": "prn (rash, infection, bruising)", "rationale": "Rare but serious skin reactions"},
            {"test": "Lamotrigine level", "frequency": "prn", "rationale": "Therapeutic range 3-14 mcg/mL; check with OCP or valproate changes"},
        ],
        "special": [
            {"scenario": "Rash develops", "action": "Stop immediately, evaluate for SJS/TEN"},
        ],
        "evidence_grade": "B",
    },
    "general_psychiatric": {
        "medication_names": ["_all_psychiatric_patients"],
        "baseline_labs": [
            {"test": "Vitamin B12", "rationale": "Deficiency linked to depression, cognitive impairment; masked by folate fortification"},
            {"test": "25-OH vitamin D", "rationale": "Deficiency linked to depression, seasonal affective disorder"},
            {"test": "Folate", "rationale": "Deficiency linked to depression and poor antidepressant response"},
            {"test": "TSH", "rationale": "Subclinical hypothyroidism can present as depression or cognitive slowing"},
        ],
        "ongoing_labs": [],
        "special": [],
        "evidence_grade": "B",
    },
}


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
    """Detect biomarker confounds from active medications — 18 confound types.

    Each confound maps a medication class to one or more measurable biomarker
    domains, with hypothesis strength, temporal alignment, evidence grade, and
    recommended minimum washout period. These are hypothesis-level flags for
    clinician interpretation, not causal inferences.
    """
    out: list[dict[str, Any]] = []
    for m in med_records:
        mid = m["id"]
        cls_ = (m.get("medication_class") or "").lower()
        name = (m.get("drug_name") or "").lower()
        joined = f"{cls_} {name}"

        # ── 1. qEEG theta/delta increase → antipsychotics (LARGE effect) ──
        if any(x in joined for x in ("antipsychotic", "olanzapine", "clozapine", "quetiapine", "risperidone", "aripiprazole", "lurasidone", "ziprasidone", "asenapine", "cariprazine", "brexpiprazole", "haloperidol")):
            out.append(_make_confound(mid, m, "qEEG theta/delta power increase", "qEEG", "large", "acute", 0.82, f"{m.get('drug_name')} (antipsychotic) produces marked increases in theta and delta power via anticholinergic and antihistaminic properties. Effect magnitude is LARGE — can obscure interpretation of baseline qEEG slow-wave abnormalities in depression or cognitive impairment.", "A", 14))

        # ── 2. qEEG beta increase → benzodiazepines (LARGE effect) ──
        if any(x in joined for x in ("benzodiazepine", "lorazepam", "clonazepam", "alprazolam", "diazepam", "z-drug", "zolpidem")):
            out.append(_make_confound(mid, m, "qEEG beta power increase", "qEEG", "large", "acute", 0.88, f"{m.get('drug_name')} (benzodiazepine/Z-drug) produces robust beta power increase on qEEG via GABA-A receptor positive allosteric modulation. Effect magnitude is LARGE and dose-dependent — may mask or mimic anxiety-related beta elevation.", "A", 7))

        # ── 3. qEEG beta/theta-beta ratio → stimulants (LARGE, task-dependent) ──
        if any(x in joined for x in ("stimulant", "methylphenidate", "amphetamine", "lisdexamfetamine", "atomoxetine", "modafinil")):
            out.append(_make_confound(mid, m, "qEEG beta/theta-beta ratio increase", "qEEG", "large", "task-dependent", 0.75, f"{m.get('drug_name')} (stimulant/wakefulness agent) increases beta power and theta-beta ratio. Effect is LARGE but task-dependent and state-dependent — interpret qEEG in context of dosing time and cognitive load.", "B", 2))

        # ── 4. Theta/beta ratio decrease → SSRIs (moderate) ──
        if any(x in joined for x in ("ssri", "sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram", "fluvoxamine")):
            out.append(_make_confound(mid, m, "theta/beta ratio decrease", "qEEG", "moderate", "subacute", 0.68, f"{m.get('drug_name')} (SSRI) reduces theta/beta ratio after 4-6 weeks of treatment via serotonergic modulation of prefrontal cortex. Effect is moderate — may confound ADHD qEEG markers.", "B", 14))

        # ── 5. Alpha power decrease → TCAs, antipsychotics ──
        if any(x in joined for x in ("tricyclic", "tca", "amitriptyline", "nortriptyline", "imipramine", "clomipramine", "antipsychotic", "olanzapine", "clozapine", "quetiapine")):
            out.append(_make_confound(mid, m, "alpha power decrease", "qEEG", "moderate", "acute", 0.72, f"{m.get('drug_name')} reduces posterior alpha power via anticholinergic and/or dopaminergic blockade. Effect is moderate — TCA reduction is larger than antipsychotic. May confound interpretation of alpha asymmetry in depression.", "A", 7))

        # ── 6. Frontal asymmetry change → SSRIs, SNRIs ──
        if any(x in joined for x in ("ssri", "snri", "sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram", "venlafaxine", "desvenlafaxine", "duloxetine", "levomilnacipran")):
            out.append(_make_confound(mid, m, "frontal alpha asymmetry change", "qEEG", "moderate", "subacute", 0.65, f"{m.get('drug_name')} (antidepressant) shifts frontal alpha asymmetry over 4-8 weeks via monoaminergic modulation. Effect may be therapeutic rather than artifactual — requires pre-treatment baseline for interpretation.", "B", 14))

        # ── 7. P300 latency increase → antipsychotics, benzodiazepines ──
        if any(x in joined for x in ("antipsychotic", "benzodiazepine", "olanzapine", "clozapine", "quetiapine", "risperidone", "lorazepam", "clonazepam", "alprazolam", "diazepam", "zolpidem")):
            out.append(_make_confound(mid, m, "P300 latency increase", "ERP", "large", "acute", 0.80, f"{m.get('drug_name')} increases P300 latency — benzodiazepines via slowed stimulus evaluation, antipsychotics via dopamine D2 antagonism affecting attentional resources. Effect is LARGE for single-dose benzodiazepines; moderate-to-large for chronic antipsychotics.", "A", 7))

        # ── 8. HRV reduction → TCAs/SNRIs (LARGE, NESDA finding) ──
        if any(x in joined for x in ("tricyclic", "tca", "amitriptyline", "nortriptyline", "imipramine", "snri", "venlafaxine", "desvenlafaxine", "duloxetine", "levomilnacipran")):
            out.append(_make_confound(mid, m, "HRV reduction (large)", "autonomic", "large", "subacute", 0.85, f"{m.get('drug_name')} produces large HRV reduction — NESDA study found noradrenergic agents (SNRIs, TCAs) show the largest effect on RMSSD and HF-HRV. This confounds HRV-based stress/resilience biomarkers.", "A", 7))

        # ── 9. HRV mild decrease → SSRIs ──
        if any(x in joined for x in ("ssri", "sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram", "fluvoxamine")):
            out.append(_make_confound(mid, m, "HRV mild decrease", "autonomic", "moderate", "subacute", 0.62, f"{m.get('drug_name')} (SSRI) produces mild-to-moderate HRV decrease via serotonergic modulation of vagal tone. Effect is smaller than SNRIs/TCAs but consistent across agents. May reduce HRV-derived treatment response markers.", "B", 14))

        # ── 10. BDNF elevation → SSRIs, lithium (confounds neuromod outcomes) ──
        if any(x in joined for x in ("ssri", "sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram", "lithium", "lithium carbonate")):
            out.append(_make_confound(mid, m, "BDNF elevation", "neuroplasticity", "moderate", "subacute", 0.70, f"{m.get('drug_name')} elevates serum BDNF after 2-4 weeks of treatment. Since BDNF is a proposed mechanism for both antidepressant response and neuromodulation efficacy, this confounds BDNF-based outcome prediction for rTMS/tDCS trials.", "A", 21))

        # ── 11. IL-6/TNF-alpha reduction → SSRIs (SMD 1.32/1.29) ──
        if any(x in joined for x in ("ssri", "sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram", "fluvoxamine")):
            out.append(_make_confound(mid, m, "IL-6 / TNF-alpha reduction", "inflammatory", "moderate", "subacute", 0.72, f"{m.get('drug_name')} (SSRI) reduces peripheral inflammatory markers: meta-analysis SMD -1.32 for IL-6, -1.29 for TNF-alpha (Kohler et al., JAMA Psychiatry). This confounds neuroinflammation-based treatment selection biomarkers.", "A", 14))

        # ── 12. Cortisol awakening response → SSRIs ──
        if any(x in joined for x in ("ssri", "sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram", "fluvoxamine")):
            out.append(_make_confound(mid, m, "cortisol awakening response alteration", "HPA axis", "moderate", "subacute", 0.65, f"{m.get('drug_name')} (SSRI) blunts the cortisol awakening response (CAR) after 4-8 weeks via normalization of HPA axis hyperactivity. May confound CAR-based depression severity and relapse prediction.", "B", 14))

        # ── 13. Prolactin elevation → antipsychotics (D2 blockers) ──
        if any(x in joined for x in ("antipsychotic", "risperidone", "paliperidone", "haloperidol", "olanzapine", "clozapine", "quetiapine")):
            out.append(_make_confound(mid, m, "prolactin elevation", "endocrine", "large", "acute", 0.90, f"{m.get('drug_name')} elevates prolactin via D2 receptor antagonism in the tuberoinfundibular pathway. Effect is dose-dependent and agent-specific (risperidone/paliperidone highest; aripiprazole lowest). Hyperprolactinemia confounds stress hormone panels.", "A", 14))

        # ── 14. TSH elevation → lithium (subclinical hypothyroidism) ──
        if any(x in joined for x in ("lithium", "lithium carbonate", "lithium citrate")):
            out.append(_make_confound(mid, m, "TSH elevation (subclinical hypothyroidism)", "endocrine", "moderate", "chronic", 0.80, f"{m.get('drug_name')} inhibits thyroid hormone release and may cause subclinical (10-20%) or overt (5-10%) hypothyroidism. TSH elevation may confound fatigue, cognitive slowing, and depression symptom interpretation.", "A", 30))

        # ── 15. Hippocampal volume increase → lithium (confounds neuroplasticity) ──
        if any(x in joined for x in ("lithium", "lithium carbonate", "lithium citrate")):
            out.append(_make_confound(mid, m, "hippocampal volume increase", "structural MRI", "moderate", "chronic", 0.72, f"{m.get('drug_name')} is associated with hippocampal volume increase in MRI studies, thought to reflect enhanced neuroplasticity and neurogenesis. This confounds volumetric interpretation of treatment response in neuromodulation trials.", "B", 30))

        # ── 16. DMN connectivity change → SSRIs ──
        if any(x in joined for x in ("ssri", "sertraline", "fluoxetine", "paroxetine", "citalopram", "escitalopram", "fluvoxamine")):
            out.append(_make_confound(mid, m, "DMN connectivity change", "rs-fMRI", "moderate", "subacute", 0.65, f"{m.get('drug_name')} (SSRI) alters default mode network (DMN) connectivity after 6-8 weeks, reducing DMN hyperconnectivity associated with rumination. This confounds rs-fMRI treatment response markers.", "B", 21))

        # ── 17. PFC thickness change → antipsychotics ──
        if any(x in joined for x in ("antipsychotic", "olanzapine", "clozapine", "quetiapine", "risperidone", "haloperidol")):
            out.append(_make_confound(mid, m, "prefrontal cortical thickness change", "structural MRI", "moderate", "chronic", 0.60, f"{m.get('drug_name')} (antipsychotic) may be associated with prefrontal cortical thinning over years of treatment, though separation from illness progression remains debated. Confounds longitudinal cortical thickness trajectory analysis.", "C", 30))

        # ── 18. Weight gain/metabolic → olanzapine, clozapine, quetiapine, mirtazapine ──
        if any(x in joined for x in ("olanzapine", "clozapine", "quetiapine", "mirtazapine")):
            out.append(_make_confound(mid, m, "weight gain / metabolic syndrome", "metabolic", "large", "chronic", 0.92, f"{m.get('drug_name')} is associated with large weight gain (olanzapine 5-10 kg, clozapine 4-8 kg, quetiapine 2-5 kg, mirtazapine 3-7 kg in first year) and metabolic syndrome risk. Confounds weight-related biomarkers, inflammatory markers, and treatment adherence.", "A", 30))

    return out


def _make_confound(
    med_id: str,
    med_record: dict[str, Any],
    confound_type: str,
    domain: str,
    hypothesis_strength: str,
    temporal_alignment: str,
    confidence: float,
    explanation: str,
    evidence_grade: str,
    washout_days_min: int,
) -> dict[str, Any]:
    """Factory for a single confound flag entry."""
    slug = confound_type.lower().replace(" ", "_").replace("/", "_")[:40]
    return {
        "id": f"cf-{slug}-{med_id[:8]}",
        "confound_type": confound_type,
        "domain": domain,
        "hypothesis": "possible confound",
        "linked_medications": [med_id],
        "temporal_alignment": temporal_alignment,
        "strength": hypothesis_strength,
        "confidence": confidence,
        "explanation": explanation,
        "evidence_grade": evidence_grade,
        "washout_days_min": washout_days_min,
        "counterevidence": [],
        "generated_at": _iso_now(),
        "source": "rules",
    }


def generate_nutrition_lab_panel(
    med_records: list[dict[str, Any]],
) -> dict[str, Any]:
    """Generate nutrition interactions and lab monitoring recommendations from medication records.

    Cross-references active medications against NUTRITION_INTERACTIONS and
    LAB_MONITORING_SCHEDULES to produce actionable monitoring panels.
    """
    active_meds = [m for m in med_records if m.get("status") == "active"]
    active_names_lower: list[str] = []
    active_classes_lower: list[str] = []
    for m in active_meds:
        name = (m.get("drug_name") or "").lower()
        cls_ = (m.get("medication_class") or "").lower()
        active_names_lower.append(name)
        active_classes_lower.append(cls_)

    # Find matching nutrition interactions
    matched_nutrition: list[dict[str, Any]] = []
    for ni in NUTRITION_INTERACTIONS:
        matched = False
        for drug_name in ni.get("drug_names", []):
            if any(drug_name in n for n in active_names_lower):
                matched = True
                break
        if not matched:
            for drug_class in ni.get("drug_classes", []):
                if any(drug_class in c for c in active_classes_lower):
                    matched = True
                    break
        if matched:
            matched_nutrition.append({
                "id": ni["id"],
                "severity": ni["severity"],
                "nutrient": ni["nutrient"],
                "mechanism": ni["mechanism"],
                "clinical_action": ni["clinical_action"],
                "evidence_grade": ni["evidence_grade"],
            })

    # Find matching lab monitoring schedules
    matched_labs: list[dict[str, Any]] = []
    for schedule_key, schedule in LAB_MONITORING_SCHEDULES.items():
        if schedule_key == "general_psychiatric":
            # Apply to all psychiatric patients
            matched_labs.append({
                "schedule_key": schedule_key,
                "baseline_labs": schedule["baseline_labs"],
                "ongoing_labs": schedule["ongoing_labs"],
                "special": schedule["special"],
                "evidence_grade": schedule["evidence_grade"],
            })
            continue
        matched = False
        for med_name in schedule.get("medication_names", []):
            if any(med_name in n for n in active_names_lower):
                matched = True
                break
        if matched:
            matched_labs.append({
                "schedule_key": schedule_key,
                "baseline_labs": schedule["baseline_labs"],
                "ongoing_labs": schedule["ongoing_labs"],
                "special": schedule.get("special", []),
                "evidence_grade": schedule["evidence_grade"],
            })

    # Compute summary stats
    critical_count = sum(1 for n in matched_nutrition if n["severity"] == "critical")
    severe_count = sum(1 for n in matched_nutrition if n["severity"] == "severe")

    return {
        "generated_at": _iso_now(),
        "ruleset_version": RULESET_VERSION,
        "active_medication_count": len(active_meds),
        "nutrition_interactions_found": len(matched_nutrition),
        "critical_nutrition_count": critical_count,
        "severe_nutrition_count": severe_count,
        "nutrition_interactions": matched_nutrition,
        "lab_monitoring_schedules": matched_labs,
        "schedules_matched": len(matched_labs),
        "disclaimer": (
            "Nutrient and lab monitoring recommendations are decision-support prompts only. "
            "They do not replace individual clinical judgment, pharmacy review, or laboratory protocol. "
            "Evidence grades reflect the quality of supporting literature, not the certainty of individual patient risk."
        ),
    }


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

    # ══ Phase 4: Composite risk scores ══
    composite_risk_scores = compute_composite_risk_scores(
        med_records=normalized,
        interaction_alerts=interaction_alerts,
        neuromod_matches=[],
        patient_age=None,
    )

    # ══ Phase 4: Adherence prediction ══
    adherence_prediction = compute_adherence_prediction(
        active_count=len(active),
        med_complexity_score=0.0,
        side_effect_burden=0,
        has_cognitive_impairment=False,
        age=None,
    )

    # ══ Phase 4: Deprescribing suggestions ══
    deprescribing_suggestions = generate_deprescribing_suggestions(
        med_records=normalized,
    )

    confounds = _confound_flags_for_meds(normalized)
    recommendations = generate_medication_review_actions(
        interaction_alerts, confounds, poly
    )
    nutrition_lab_panel = generate_nutrition_lab_panel(normalized)

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
        "composite_risk_scores": composite_risk_scores,
        "adherence_prediction": adherence_prediction,
        "deprescribing_suggestions": deprescribing_suggestions,
        "audit_entries": [],
        "persisted_review_notes": [],
        "nutrition_lab_panel": nutrition_lab_panel,
        "confound_metadata": {
            "total_confounds_detected": len(confounds),
            "unique_confound_types": len({c.get("confound_type") for c in confounds}),
            "unique_domains": sorted({c.get("domain") for c in confounds}),
            "max_confidence": max((c.get("confidence") for c in confounds), default=None),
            "evidence_grades_present": sorted({c.get("evidence_grade") for c in confounds}),
        },
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


# ═══════════════════════════════════════════════════════════════════════════════
# Phase 4 — Advanced Features
# ═══════════════════════════════════════════════════════════════════════════════

# ── Explainable factor maps (which drugs contribute to each score) ───────────
EXPLAINABLE_FACTORS: dict[str, dict[str, Any]] = {
    "seizure_risk": {
        "label": "Seizure threshold risk",
        "description": "Weighted sum of seizure-lowering medications, neuromodulation protocol intensity, and age.",
        "drug_weights": {
            "clozapine": 25,
            "bupropion": 20,
            "amitriptyline": 15,
            "nortriptyline": 15,
            "imipramine": 15,
            "clomipramine": 15,
            "methylphenidate": 10,
            "amphetamine": 10,
            "lisdexamfetamine": 10,
            "sertraline": -5,
            "fluoxetine": -5,
            "paroxetine": -5,
            "citalopram": -5,
            "escitalopram": -5,
            "fluvoxamine": -5,
        },
        "class_weights": {
            "tca": 15,
            "stimulant": 10,
            "ssri": -5,
        },
    },
    "serotonin_syndrome_risk": {
        "label": "Serotonin syndrome risk",
        "description": "Cumulative risk from serotonergic agents; combination bonus when >2 agents.",
        "drug_weights": {
            "sertraline": 20,
            "fluoxetine": 20,
            "paroxetine": 20,
            "citalopram": 20,
            "escitalopram": 20,
            "fluvoxamine": 20,
            "venlafaxine": 15,
            "desvenlafaxine": 15,
            "duloxetine": 15,
            "levomilnacipran": 15,
            "phenelzine": 30,
            "tranylcypromine": 30,
            "isocarboxazid": 30,
            "selegiline": 30,
            "tramadol": 15,
            "mirtazapine": 10,
            "linezolid": 25,
        },
        "class_weights": {
            "ssri": 20,
            "snri": 15,
            "maoi": 30,
        },
        "combination_bonus": 20,
    },
    "bleeding_risk": {
        "label": "Bleeding risk",
        "description": "Anticoagulant count + combination bonus for overlapping agents.",
        "drug_weights": {
            "warfarin": 30,
            "apixaban": 25,
            "aspirin": 15,
            "ibuprofen": 15,
            "sertraline": 10,
            "fluoxetine": 10,
            "paroxetine": 10,
            "citalopram": 10,
            "escitalopram": 10,
            "fluvoxamine": 10,
        },
        "class_weights": {
            "ssri": 10,
            "nsaid": 15,
        },
        "combination_bonus": 15,
    },
    "qt_prolongation_risk": {
        "label": "QT prolongation risk",
        "description": "QT-prolonging agents by drug and class.",
        "drug_weights": {
            "amitriptyline": 20,
            "nortriptyline": 20,
            "imipramine": 20,
            "clomipramine": 20,
            "methadone": 25,
            "erythromycin": 15,
        },
        "class_weights": {
            "tca": 20,
            "antipsychotic": 15,
        },
    },
    "polypharmacy_risk": {
        "label": "Polypharmacy risk",
        "description": "Stepped scale based on active medication count.",
        "thresholds": [
            (5, 25),
            (8, 50),
            (12, 75),
            (15, 100),
        ],
    },
}


def _risk_band(score: int) -> str:
    """Return risk band label for a 0-100 score."""
    if score <= 30:
        return "low"
    if score <= 60:
        return "moderate"
    if score <= 80:
        return "high"
    return "critical"


def _risk_color(score: int) -> str:
    """Return CSS color token for a 0-100 score."""
    if score <= 30:
        return "var(--green)"
    if score <= 60:
        return "var(--amber)"
    if score <= 80:
        return "var(--orange)"
    return "var(--red)"


def _clamp_score(value: int | float) -> int:
    """Clamp score to 0-100 integer range."""
    return max(0, min(100, int(round(value))))


def _class_matches(med_class: str, target_classes: dict[str, int]) -> list[tuple[str, int]]:
    """Return (class_key, weight) tuples for classes present in med_class."""
    cls_lower = med_class.lower()
    matches: list[tuple[str, int]] = []
    for cls_key, weight in target_classes.items():
        if cls_key.lower() in cls_lower:
            matches.append((cls_key, weight))
    return matches


def _med_name_matches(name: str, drug_weights: dict[str, int]) -> list[tuple[str, int]]:
    """Return (drug_key, weight) tuples for drugs present in name."""
    n_lower = name.lower()
    matches: list[tuple[str, int]] = []
    for drug_key, weight in drug_weights.items():
        if drug_key.lower() in n_lower:
            matches.append((drug_key, weight))
    return matches


def compute_composite_risk_scores(
    med_records: list[dict[str, Any]],
    interaction_alerts: list[dict[str, Any]],
    neuromod_matches: list[dict[str, Any]],
    patient_age: Optional[int] = None,
) -> dict[str, Any]:
    """Compute composite risk scores for medication safety.

    Returns scores for:
    - seizure_risk (0-100)
    - serotonin_syndrome_risk (0-100)
    - bleeding_risk (0-100)
    - qt_prolongation_risk (0-100)
    - polypharmacy_risk (0-100)

    Decision-support only — scores are model-assisted, not definitive.
    Requires clinician review before any clinical action.
    """
    active_meds = [m for m in med_records if m.get("status") == "active"]
    active_count = len(active_meds)
    med_names_lower = [m.get("drug_name", "").lower() for m in active_meds]
    med_classes = [m.get("medication_class", "").lower() for m in active_meds]

    # ══ Seizure risk ══
    seizure_score = 0
    seizure_factors: list[dict[str, Any]] = []
    config = EXPLAINABLE_FACTORS["seizure_risk"]
    for i, name in enumerate(med_names_lower):
        cls = med_classes[i]
        # Drug-level matching
        for drug_key, weight in config["drug_weights"].items():
            if drug_key.lower() in name:
                seizure_score += weight
                label = config["drug_weights"][drug_key]
                direction = "protective" if weight < 0 else "risk"
                seizure_factors.append(
                    {
                        "drug": name,
                        "drug_key": drug_key,
                        "weight": weight,
                        "direction": direction,
                        "source": "drug_match",
                    }
                )
        # Class-level matching (if no drug-level hit)
        for cls_key, weight in config["class_weights"].items():
            if cls_key.lower() in cls and not any(dk.lower() in name for dk in config["drug_weights"]):
                seizure_score += weight
                direction = "protective" if weight < 0 else "risk"
                seizure_factors.append(
                    {
                        "drug": name,
                        "class_key": cls_key,
                        "weight": weight,
                        "direction": direction,
                        "source": "class_match",
                    }
                )
    # Neuromod protocol intensity factor
    neuromod_intensity = 0
    for match in neuromod_matches:
        sev = str(match.get("severity", "")).lower()
        if sev == "critical":
            neuromod_intensity += 15
        elif sev == "major":
            neuromod_intensity += 10
        elif sev == "moderate":
            neuromod_intensity += 5
        elif sev == "mild":
            neuromod_intensity += 2
    if neuromod_intensity:
        seizure_score += neuromod_intensity
        seizure_factors.append(
            {
                "source": "neuromod_protocol",
                "weight": neuromod_intensity,
                "details": f"{len(neuromod_matches)} neuromodulation match(es)",
                "direction": "risk",
            }
        )
    # Age factor (very young or elderly = higher risk)
    age_factor = 0
    if patient_age is not None:
        if patient_age < 12:
            age_factor = 5
        elif patient_age > 75:
            age_factor = 10
    if age_factor:
        seizure_score += age_factor
        seizure_factors.append(
            {
                "source": "age_factor",
                "weight": age_factor,
                "age": patient_age,
                "direction": "risk",
            }
        )

    # ══ Serotonin syndrome risk ══
    serotonin_score = 0
    serotonin_factors: list[dict[str, Any]] = []
    config = EXPLAINABLE_FACTORS["serotonin_syndrome_risk"]
    serotonergic_count = 0
    for i, name in enumerate(med_names_lower):
        cls = med_classes[i]
        matched = False
        for drug_key, weight in config["drug_weights"].items():
            if drug_key.lower() in name:
                serotonin_score += weight
                serotonergic_count += 1
                matched = True
                serotonin_factors.append(
                    {
                        "drug": name,
                        "drug_key": drug_key,
                        "weight": weight,
                        "source": "drug_match",
                    }
                )
        if not matched:
            for cls_key, weight in config["class_weights"].items():
                if cls_key.lower() in cls:
                    serotonin_score += weight
                    serotonergic_count += 1
                    serotonin_factors.append(
                        {
                            "drug": name,
                            "class_key": cls_key,
                            "weight": weight,
                            "source": "class_match",
                        }
                    )
    if serotonergic_count > 2:
        bonus = config.get("combination_bonus", 20)
        serotonin_score += bonus
        serotonin_factors.append(
            {
                "source": "combination_bonus",
                "count": serotonergic_count,
                "weight": bonus,
                "detail": f"{serotonergic_count} serotonergic agents > 2 threshold",
            }
        )

    # ══ Bleeding risk ══
    bleeding_score = 0
    bleeding_factors: list[dict[str, Any]] = []
    config = EXPLAINABLE_FACTORS["bleeding_risk"]
    anticoagulant_count = 0
    for i, name in enumerate(med_names_lower):
        cls = med_classes[i]
        matched = False
        for drug_key, weight in config["drug_weights"].items():
            if drug_key.lower() in name:
                bleeding_score += weight
                anticoagulant_count += 1
                matched = True
                bleeding_factors.append(
                    {
                        "drug": name,
                        "drug_key": drug_key,
                        "weight": weight,
                        "source": "drug_match",
                    }
                )
        if not matched:
            for cls_key, weight in config["class_weights"].items():
                if cls_key.lower() in cls:
                    bleeding_score += weight
                    anticoagulant_count += 1
                    bleeding_factors.append(
                        {
                            "drug": name,
                            "class_key": cls_key,
                            "weight": weight,
                            "source": "class_match",
                        }
                    )
    if anticoagulant_count > 1:
        bonus = config.get("combination_bonus", 15)
        bleeding_score += bonus
        bleeding_factors.append(
            {
                "source": "combination_bonus",
                "count": anticoagulant_count,
                "weight": bonus,
            }
        )

    # ══ QT prolongation risk ══
    qt_score = 0
    qt_factors: list[dict[str, Any]] = []
    config = EXPLAINABLE_FACTORS["qt_prolongation_risk"]
    for i, name in enumerate(med_names_lower):
        cls = med_classes[i]
        matched = False
        for drug_key, weight in config["drug_weights"].items():
            if drug_key.lower() in name:
                qt_score += weight
                matched = True
                qt_factors.append(
                    {
                        "drug": name,
                        "drug_key": drug_key,
                        "weight": weight,
                        "source": "drug_match",
                    }
                )
        if not matched:
            for cls_key, weight in config["class_weights"].items():
                if cls_key.lower() in cls:
                    qt_score += weight
                    qt_factors.append(
                        {
                            "drug": name,
                            "class_key": cls_key,
                            "weight": weight,
                            "source": "class_match",
                        }
                    )

    # ══ Polypharmacy risk ══
    poly_config = EXPLAINABLE_FACTORS["polypharmacy_risk"]
    poly_score = 0
    poly_factors: list[dict[str, Any]] = []
    for threshold, points in poly_config["thresholds"]:
        if active_count >= threshold:
            poly_score = points
        else:
            break
    poly_factors.append(
        {
            "source": "active_medication_count",
            "count": active_count,
            "weight": poly_score,
        }
    )

    # Clamp all scores
    seizure_score = _clamp_score(seizure_score)
    serotonin_score = _clamp_score(serotonin_score)
    bleeding_score = _clamp_score(bleeding_score)
    qt_score = _clamp_score(qt_score)
    poly_score = _clamp_score(poly_score)

    scores = {
        "seizure_risk": {
            "score": seizure_score,
            "band": _risk_band(seizure_score),
            "color": _risk_color(seizure_score),
            "factors": seizure_factors,
        },
        "serotonin_syndrome_risk": {
            "score": serotonin_score,
            "band": _risk_band(serotonin_score),
            "color": _risk_color(serotonin_score),
            "factors": serotonin_factors,
        },
        "bleeding_risk": {
            "score": bleeding_score,
            "band": _risk_band(bleeding_score),
            "color": _risk_color(bleeding_score),
            "factors": bleeding_factors,
        },
        "qt_prolongation_risk": {
            "score": qt_score,
            "band": _risk_band(qt_score),
            "color": _risk_color(qt_score),
            "factors": qt_factors,
        },
        "polypharmacy_risk": {
            "score": poly_score,
            "band": _risk_band(poly_score),
            "color": _risk_color(poly_score),
            "factors": poly_factors,
        },
    }

    # Aggregate explainable factors
    top_contributors: dict[str, list[dict[str, Any]]] = {}
    for dimension, data in scores.items():
        sorted_factors = sorted(
            [f for f in data["factors"] if f.get("weight", 0) > 0],
            key=lambda x: x.get("weight", 0),
            reverse=True,
        )
        top_contributors[dimension] = sorted_factors[:5]

    return {
        "scores": scores,
        "highest_risk": max(scores, key=lambda k: scores[k]["score"]),
        "highest_score": max(s["score"] for s in scores.values()),
        "explainable_factors": top_contributors,
        "total_active_medications": active_count,
        "serotonergic_agent_count": serotonergic_count,
        "anticoagulant_agent_count": anticoagulant_count,
        "computed_at": _iso_now(),
        "disclaimer": (
            "Scores are model-assisted, not definitive. "
            "Requires clinician review before any clinical action."
        ),
    }


def compute_adherence_prediction(
    active_count: int,
    med_complexity_score: float,
    side_effect_burden: int,
    has_cognitive_impairment: bool = False,
    age: Optional[int] = None,
) -> dict[str, Any]:
    """Predict medication adherence probability.

    Literature-based heuristic model:
    - Base adherence: 85% (1 med), drops ~10% per additional med
    - Pill burden adjustment: >5 meds = -15%, >10 meds = -25%
    - Complexity penalty: high-frequency dosing = -10%
    - Side effect burden: each reported AE = -5% (max -20%)
    - Cognitive impairment: -15%
    - Age >75: -10%
    - Age <18: -10%

    Decision-support only — not a validated adherence prediction tool.
    """
    contributing_factors: list[dict[str, Any]] = []
    penalties: list[float] = []

    # Base adherence: 85% for 1 med, ~10% drop per additional med
    base_adherence = max(0.20, 0.85 - ((active_count - 1) * 0.10))
    contributing_factors.append(
        {
            "factor": "base_medication_count",
            "active_count": active_count,
            "adjustment": round(base_adherence - 0.85, 3),
            "note": f"Base ~85% for 1 med, ~-10% per additional med",
        }
    )

    # Pill burden adjustment
    if active_count > 10:
        penalties.append(-0.25)
        contributing_factors.append(
            {
                "factor": "pill_burden",
                "threshold": ">10 meds",
                "adjustment": -0.25,
                "note": "High pill burden (>10 medications)",
            }
        )
    elif active_count > 5:
        penalties.append(-0.15)
        contributing_factors.append(
            {
                "factor": "pill_burden",
                "threshold": ">5 meds",
                "adjustment": -0.15,
                "note": "Elevated pill burden (>5 medications)",
            }
        )

    # Complexity penalty
    if med_complexity_score >= 0.7:
        penalties.append(-0.10)
        contributing_factors.append(
            {
                "factor": "dosing_complexity",
                "complexity_score": med_complexity_score,
                "adjustment": -0.10,
                "note": "High-frequency or complex dosing regimen",
            }
        )
    elif med_complexity_score >= 0.4:
        penalties.append(-0.05)
        contributing_factors.append(
            {
                "factor": "dosing_complexity",
                "complexity_score": med_complexity_score,
                "adjustment": -0.05,
                "note": "Moderate dosing complexity",
            }
        )

    # Side effect burden (each AE = -5%, max -20%)
    se_penalty = min(0.20, side_effect_burden * 0.05)
    if se_penalty > 0:
        penalties.append(-se_penalty)
        contributing_factors.append(
            {
                "factor": "side_effect_burden",
                "reported_ae_count": side_effect_burden,
                "adjustment": round(-se_penalty, 3),
                "note": f"{side_effect_burden} reported adverse event(s), -5% each (max -20%)",
            }
        )

    # Cognitive impairment
    if has_cognitive_impairment:
        penalties.append(-0.15)
        contributing_factors.append(
            {
                "factor": "cognitive_impairment",
                "adjustment": -0.15,
                "note": "Documented cognitive impairment affects medication management",
            }
        )

    # Age extremes
    if age is not None:
        if age > 75:
            penalties.append(-0.10)
            contributing_factors.append(
                {
                    "factor": "advanced_age",
                    "age": age,
                    "adjustment": -0.10,
                    "note": "Age >75 years — additional adherence risk",
                }
            )
        elif age < 18:
            penalties.append(-0.10)
            contributing_factors.append(
                {
                    "factor": "pediatric_age",
                    "age": age,
                    "adjustment": -0.10,
                    "note": "Age <18 years — caregiver-dependent adherence",
                }
            )

    # Calculate predicted adherence
    total_penalty = sum(penalties)
    predicted = round(max(0.05, min(1.0, base_adherence + total_penalty)), 3)

    # Risk band
    pct = predicted * 100
    if pct >= 80:
        risk_band = "good"
    elif pct >= 60:
        risk_band = "moderate"
    else:
        risk_band = "poor"

    # Confidence (more factors known = higher confidence)
    known_factors = sum([
        active_count > 0,
        med_complexity_score > 0,
        side_effect_burden >= 0,
        age is not None,
        True,  # cognitive impairment always known (bool)
    ])
    confidence = round(0.40 + (known_factors * 0.12), 2)

    # Intervention triggers if predicted <70%
    intervention_triggers: list[dict[str, Any]] = []
    if predicted < 0.70:
        intervention_triggers.append(
            {
                "trigger": "low_predicted_adherence",
                "threshold": "<70%",
                "suggested_actions": [
                    "Simplify regimen (reduce dosing frequency if clinically appropriate)",
                    "Pill organizer or blister packaging",
                    "Pharmacist-led medication reconciliation",
                    "Consider caregiver involvement for complex regimens",
                    "Schedule follow-up within 2-4 weeks",
                ],
            }
        )
    if active_count > 10:
        intervention_triggers.append(
            {
                "trigger": "high_pill_burden",
                "threshold": ">10 active medications",
                "suggested_actions": [
                    "Comprehensive medication review for deprescribing opportunities",
                    "Prioritize medications by indication and time-to-benefit",
                ],
            }
        )
    if has_cognitive_impairment and active_count > 3:
        intervention_triggers.append(
            {
                "trigger": "cognitive_impairment_polypharmacy",
                "note": "Cognitive impairment + multiple medications",
                "suggested_actions": [
                    "Involve caregiver or pharmacy support",
                    "Simplify to once-daily regimens where possible",
                    "Visual aids and labeled containers",
                ],
            }
        )

    return {
        "predicted_adherence": predicted,
        "risk_band": risk_band,
        "confidence": confidence,
        "contributing_factors": contributing_factors,
        "intervention_triggers": intervention_triggers,
        "limitations": [
            "Not a validated adherence prediction tool — literature-based heuristic only.",
            "Does not integrate pharmacy refill data, electronic monitoring, or smart-pill devices.",
            "Individual patient factors (health literacy, social support, cost barriers) not captured.",
            "Requires clinician interpretation; do not use as sole basis for adherence interventions.",
        ],
        "computed_at": _iso_now(),
    }


def generate_deprescribing_suggestions(
    med_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Identify medications for deprescribing review per Beers Criteria / STOPP-START.

    Flags:
    - Duplicate therapy (2+ SSRIs, 2+ benzodiazepines)
    - Long-term benzodiazepine use (>4 weeks)
    - Anticholinergic burden (TCAs + antipsychotics + antihistamines)
    - Proton pump inhibitor >8 weeks without indication
    - No clear indication recorded
    - Duration >12 months without review

    Decision-support only — not a deprescribing directive.
    Requires clinician review before any medication changes.
    """
    suggestions: list[dict[str, Any]] = []
    active_meds = [m for m in med_records if m.get("status") == "active"]
    med_names_lower = [m.get("drug_name", "").lower() for m in active_meds]
    med_classes = [m.get("medication_class", "").lower() for m in active_meds]

    # ══ Duplicate therapy checks ══
    # 2+ SSRIs
    ssri_count = sum(1 for cls in med_classes if "ssri" in cls)
    ssri_meds = [m for m in active_meds if "ssri" in m.get("medication_class", "").lower()]
    if ssri_count >= 2:
        suggestions.append(
            {
                "id": f"dep-{uuid.uuid4().hex[:8]}",
                "category": "duplicate_therapy",
                "subcategory": "multiple_ssris",
                "severity": "moderate",
                "title": f"Duplicate SSRI therapy ({ssri_count} agents)",
                "detail": (
                    f"Patient is on {ssri_count} SSRIs simultaneously. "
                    "Combination rarely justified; increases serotonin syndrome and side-effect risk. "
                    "Review against Beers Criteria — consider switching to single-agent therapy."
                ),
                "medications_involved": [m.get("id") for m in ssri_meds],
                "drug_names": [m.get("drug_name") for m in ssri_meds],
                "suggested_action": "Review rationale for dual SSRI use; consider taper to single agent.",
                "evidence_basis": "Beers Criteria 2023 — avoid concurrent use of >1 SSRI unless clear indication.",
                "confidence": 0.80,
                "generated_at": _iso_now(),
                "disclaimer": "Requires clinician review before any medication changes.",
            }
        )

    # 2+ benzodiazepines
    benzo_meds = [
        m for m in active_meds
        if "benzodiazepine" in m.get("medication_class", "").lower()
        or any(b in m.get("drug_name", "").lower() for b in ("lorazepam", "clonazepam", "alprazolam", "diazepam"))
    ]
    if len(benzo_meds) >= 2:
        suggestions.append(
            {
                "id": f"dep-{uuid.uuid4().hex[:8]}",
                "category": "duplicate_therapy",
                "subcategory": "multiple_benzodiazepines",
                "severity": "high",
                "title": f"Multiple benzodiazepines ({len(benzo_meds)} agents)",
                "detail": (
                    f"Patient is on {len(benzo_meds)} benzodiazepines. "
                    "Combination increases sedation, falls, and cognitive impairment risk. "
                    "Per Beers Criteria — avoid concurrent benzodiazepines in older adults."
                ),
                "medications_involved": [m.get("id") for m in benzo_meds],
                "drug_names": [m.get("drug_name") for m in benzo_meds],
                "suggested_action": "Consolidate to single benzodiazepine or taper off per withdrawal protocol.",
                "evidence_basis": "Beers Criteria 2023 — avoid concurrent benzodiazepines; STOPP-START B1.",
                "confidence": 0.85,
                "generated_at": _iso_now(),
                "disclaimer": "Requires clinician review before any medication changes.",
            }
        )

    # ══ Long-term benzodiazepine use ══
    for m in active_meds:
        name = m.get("drug_name", "").lower()
        cls = m.get("medication_class", "").lower()
        is_benzo = "benzodiazepine" in cls or any(b in name for b in ("lorazepam", "clonazepam", "alprazolam", "diazepam"))
        if is_benzo:
            start = m.get("start_date")
            duration_weeks = None
            if start:
                try:
                    start_dt = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
                    duration_weeks = (datetime.now(timezone.utc) - start_dt).days / 7
                except (ValueError, TypeError):
                    pass
            if duration_weeks is None:
                # Flag if no start date (cannot verify duration)
                suggestions.append(
                    {
                        "id": f"dep-{uuid.uuid4().hex[:8]}",
                        "category": "long_term_use",
                        "subcategory": "benzodiazepine_unknown_duration",
                        "severity": "moderate",
                        "title": f"Benzodiazepine — duration unknown: {m.get('drug_name')}",
                        "detail": (
                            "No start date recorded; cannot verify duration of benzodiazepine use. "
                            "Long-term use (>4 weeks) associated with dependence, falls, and cognitive decline."
                        ),
                        "medications_involved": [m.get("id")],
                        "drug_names": [m.get("drug_name")],
                        "suggested_action": "Verify duration; if >4 weeks, plan gradual taper per clinic protocol.",
                        "evidence_basis": "Beers Criteria 2023 — avoid benzodiazepines >4 weeks without review.",
                        "confidence": 0.70,
                        "generated_at": _iso_now(),
                        "disclaimer": "Requires clinician review before any medication changes.",
                    }
                )
            elif duration_weeks > 4:
                suggestions.append(
                    {
                        "id": f"dep-{uuid.uuid4().hex[:8]}",
                        "category": "long_term_use",
                        "subcategory": "benzodiazepine_prolonged",
                        "severity": "moderate",
                        "title": f"Long-term benzodiazepine use: {m.get('drug_name')}",
                        "detail": (
                            f"Benzodiazepine use for ~{int(duration_weeks)} weeks. "
                            "Prolonged use increases risk of dependence, falls, confusion, and impaired driving. "
                            "Per Beers Criteria, limit to short-term use with regular review."
                        ),
                        "medications_involved": [m.get("id")],
                        "drug_names": [m.get("drug_name")],
                        "suggested_action": "Assess ongoing need; if appropriate, initiate gradual taper plan.",
                        "evidence_basis": "Beers Criteria 2023 — limit benzodiazepine duration; review necessity regularly.",
                        "confidence": 0.80,
                        "generated_at": _iso_now(),
                        "disclaimer": "Requires clinician review before any medication changes.",
                    }
                )

    # ══ Anticholinergic burden ══
    anticholinergic_classes = ["tca", "antipsychotic", "antihistamine"]
    ach_meds = [
        m for m in active_meds
        if any(cls in m.get("medication_class", "").lower() for cls in anticholinergic_classes)
        or any(d in m.get("drug_name", "").lower() for d in ("amitriptyline", "nortriptyline", "imipramine", "clomipramine",
                                                              "hydroxyzine", "diphenhydramine", "olanzapine", "quetiapine"))
    ]
    if len(ach_meds) >= 2:
        suggestions.append(
            {
                "id": f"dep-{uuid.uuid4().hex[:8]}",
                "category": "anticholinergic_burden",
                "subcategory": "cumulative_anticholinergic_load",
                "severity": "high",
                "title": f"Anticholinergic burden ({len(ach_meds)} agents)",
                "detail": (
                    f"Patient is on {len(ach_meds)} medications with anticholinergic properties. "
                    "Cumulative burden increases risk of confusion, constipation, urinary retention, falls, "
                    "and mortality. Consider Anticholinergic Cognitive Burden Scale review."
                ),
                "medications_involved": [m.get("id") for m in ach_meds],
                "drug_names": [m.get("drug_name") for m in ach_meds],
                "suggested_action": "Review necessity of each anticholinergic; prioritize taper of highest-burden agents.",
                "evidence_basis": "Beers Criteria 2023 — minimize anticholinergic burden; STOPP-START D2.",
                "confidence": 0.80,
                "generated_at": _iso_now(),
                "disclaimer": "Requires clinician review before any medication changes.",
            }
        )

    # ══ Proton pump inhibitor >8 weeks ══
    for m in active_meds:
        name = m.get("drug_name", "").lower()
        if "pantoprazole" in name or "omeprazole" in name or "esomeprazole" in name or "lansoprazole" in name or "rabeprazole" in name:
            start = m.get("start_date")
            duration_weeks = None
            if start:
                try:
                    start_dt = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
                    duration_weeks = (datetime.now(timezone.utc) - start_dt).days / 7
                except (ValueError, TypeError):
                    pass
            has_indication = bool(m.get("indication"))
            if duration_weeks is not None and duration_weeks > 8 and not has_indication:
                suggestions.append(
                    {
                        "id": f"dep-{uuid.uuid4().hex[:8]}",
                        "category": "ppi_long_term",
                        "subcategory": "prolonged_ppi_no_indication",
                        "severity": "moderate",
                        "title": f"Long-term PPI without documented indication: {m.get('drug_name')}",
                        "detail": (
                            f"PPI use for ~{int(duration_weeks)} weeks without recorded indication. "
                            "Long-term PPI use increases risk of C. difficile, fracture, B12 deficiency, "
                            "and hypomagnesemia. Per Beers Criteria, reassess ongoing need."
                        ),
                        "medications_involved": [m.get("id")],
                        "drug_names": [m.get("drug_name")],
                        "suggested_action": "Review indication; if no ongoing need, taper to lowest effective dose or stop.",
                        "evidence_basis": "Beers Criteria 2023 — avoid PPI >8 weeks without clear indication.",
                        "confidence": 0.75,
                        "generated_at": _iso_now(),
                        "disclaimer": "Requires clinician review before any medication changes.",
                    }
                )

    # ══ No clear indication ══
    for m in active_meds:
        if not m.get("indication"):
            suggestions.append(
                {
                    "id": f"dep-{uuid.uuid4().hex[:8]}",
                    "category": "missing_indication",
                    "subcategory": "no_documented_indication",
                    "severity": "low",
                    "title": f"No documented indication: {m.get('drug_name', 'Unknown')}",
                    "detail": (
                        "No indication recorded for this medication. "
                        "Medications without documented indication should be reviewed for ongoing necessity."
                    ),
                    "medications_involved": [m.get("id")],
                    "drug_names": [m.get("drug_name")],
                    "suggested_action": "Document indication or review necessity at next medication review.",
                    "evidence_basis": "STOPP-START — each medication should have a clear documented indication.",
                    "confidence": 0.60,
                    "generated_at": _iso_now(),
                    "disclaimer": "Requires clinician review before any medication changes.",
                }
            )

    # ══ Duration >12 months without review ══
    for m in active_meds:
        start = m.get("start_date")
        if start:
            try:
                start_dt = datetime.fromisoformat(str(start).replace("Z", "+00:00"))
                duration_months = (datetime.now(timezone.utc) - start_dt).days / 30
                if duration_months > 12:
                    suggestions.append(
                        {
                            "id": f"dep-{uuid.uuid4().hex[:8]}",
                            "category": "long_duration_no_review",
                            "subcategory": "medication_unreviewed_12m",
                            "severity": "low",
                            "title": f"Medication unreviewed >12 months: {m.get('drug_name')}",
                            "detail": (
                                f"Medication started ~{int(duration_months)} months ago with no recorded review. "
                                "Long-term medications should be periodically reassessed for ongoing benefit vs. harm."
                            ),
                            "medications_involved": [m.get("id")],
                            "drug_names": [m.get("drug_name")],
                            "suggested_action": "Schedule medication review; reassess indication, effectiveness, and adverse effects.",
                            "evidence_basis": "STOPP-START — periodic review of long-term medications recommended.",
                            "confidence": 0.65,
                            "generated_at": _iso_now(),
                            "disclaimer": "Requires clinician review before any medication changes.",
                        }
                    )
            except (ValueError, TypeError):
                pass

    return suggestions


def build_pharmacogenomics_panel(
    med_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build pharmacogenomic alert panel based on CPIC guidelines.

    Covers CYP2D6, CYP2C19, CYP1A2, CYP3A4, CYP2C9, SLCO1B1, HLA-B*57:01.
    Decision-support only -- not a replacement for clinical pharmacogenomic testing.

    Args:
        med_records: List of medication records. Each record should have
                     "name" or "drug_name" or "generic_name" field.

    Returns:
        List of pharmacogenomic alert dicts with:
        - gene: the pharmacogene (e.g., CYP2D6)
        - medication: the drug requiring PGx consideration
        - phenotype_implications: dict per phenotype with recommendations
        - cpic_recommendation_summary: human-readable summary
        - evidence_grade: "A" for CPIC, "B" for DPWG
        - pmids: PubMed references to CPIC guidelines
        - disclaimer: decision-support framing

    Gene-drug pairs covered:
    - CYP2D6 + nortriptyline, paroxetine, fluoxetine, risperidone, haloperidol, atomoxetine
    - CYP2C19 + escitalopram, sertraline, citalopram, diazepam
    - CYP1A2 + clozapine, olanzapine, duloxetine, fluvoxamine
    - CYP2C9 + warfarin, phenytoin
    - HLA-B*57:01 + carbamazepine (SJS/TEN risk)
    - HLA-B*1502 + carbamazepine (SJS/TEN in Asian populations)
    """
    if not med_records:
        return []

    # Normalize records to ensure name field exists
    normalized_records: list[dict[str, Any]] = []
    for record in med_records:
        normalized = dict(record)
        # Ensure at least one name field exists
        if not normalized.get("name") and normalized.get("drug_name"):
            normalized["name"] = normalized["drug_name"]
        if not normalized.get("name") and normalized.get("generic_name"):
            normalized["name"] = normalized["generic_name"]
        normalized_records.append(normalized)

    # Delegate to the pharmacogenomics panel module
    alerts = _build_pharmacogenomics_panel_raw(normalized_records)

    # Add metadata wrapper
    if alerts:
        stats = _get_pgx_panel_stats()
        for alert in alerts:
            alert["panel_metadata"] = {
                "genes_covered": stats["genes_covered"],
                "guideline_count": stats["guideline_count"],
                "generated_at": _iso_now(),
            }

    return alerts


def get_pharmacogenomics_panel_stats() -> dict[str, Any]:
    """Return statistics about the pharmacogenomics panel coverage."""
    return _get_pgx_panel_stats()


def json_dump_stable(obj: Any) -> str:
    import json

    return json.dumps(obj, sort_keys=True, default=str)
