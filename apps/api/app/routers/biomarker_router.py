"""Biomarker Backend Router — clinical biomarker catalog, patient value storage,
trending, and AI-assisted interpretation (decision-support only).

Endpoints
---------
GET  /api/v1/biomarkers                          — all categories with counts
GET  /api/v1/biomarkers/{category}                — biomarkers in category (filterable, paginated)
GET  /api/v1/biomarkers/{category}/{biomarker_id} — full biomarker detail
POST /api/v1/biomarkers/patient/{patient_id}/values   — store a patient biomarker value
GET  /api/v1/biomarkers/patient/{patient_id}/values   — list stored values for patient
GET  /api/v1/biomarkers/patient/{patient_id}/trends/{biomarker_id} — time series
POST /api/v1/biomarkers/patient/{patient_id}/interpret — AI-assisted interpretation

Chain position: Biomarkers Workspace (frontend) ←→ THIS ROUTER → PatientLabResult
                ↓                                 ↓
         Clinician Inbox          consent_enforcement + audit
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import (
    AuthenticatedActor,
    get_authenticated_actor,
    require_minimum_role,
    require_patient_owner,
)
from app.database import get_db_session
from app.errors import ApiServiceError
from app.persistence.models import AuditEventRecord, ConsentRecord, PatientLabResult
from app.repositories.audit import create_audit_event
from app.repositories.patients import resolve_patient_clinic_id
from app.services.consent_enforcement import (
    ConsentMissingError,
    require_ai_analysis_consent,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/biomarkers", tags=["Biomarkers"])


# ── Embedded Biomarker Reference Data ─────────────────────────────────────────
# Ported from apps/web/src/neuro-biomarker-data.js + clinical lab categories.
# Kept in-router so the backend is self-contained for the catalog endpoints.

_BIOMARKER_CATEGORIES: list[dict[str, Any]] = [
    {
        "id": "blood_labs",
        "label": "Blood & Labs",
        "description": (
            "Routine and specialist hematology, metabolic, endocrine, "
            "nutritional, and inflammatory laboratory analytes commonly "
            "ordered in neuromodulation and psychiatric workflows."
        ),
        "biomarkers": [
            {
                "id": "ferritin",
                "name": "Ferritin",
                "notation": "Ferritin · serum",
                "measures": "Iron storage protein; primary indicator of iron deficiency.",
                "category": "blood_labs",
                "subcategory": "iron",
                "site": "Serum",
                "refRange": "30 to 300 ng/mL (men); 15 to 150 ng/mL (women)",
                "unit_default": "ng/mL",
                "acquisition": "Fasting morning serum draw.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Hemochromatosis, inflammatory states.",
                "reduced": "Iron deficiency anemia, restless legs syndrome, fatigue.",
                "conditions": ["Iron deficiency anemia", "RLS", "Fatigue"],
                "interventions": ["Iron supplementation", "Dietary iron"],
                "caveats": ["Acute phase reactant — elevated in inflammation.", "TSAT needed for full iron assessment."],
            },
            {
                "id": "vitamin_d",
                "name": "25-OH Vitamin D",
                "notation": "25(OH)D · serum",
                "measures": "Storage form of vitamin D; associated with mood, cognition, inflammation, and bone health.",
                "category": "blood_labs",
                "subcategory": "nutritional",
                "site": "Serum",
                "refRange": "30 to 60 ng/mL adequate; below 20 deficient",
                "unit_default": "ng/mL",
                "acquisition": "Single serum draw; non-fasting acceptable.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Toxicity risk above 100 ng/mL.",
                "reduced": "Deficiency linked to MDD, cognitive decline, fatigue, immune dysfunction.",
                "conditions": ["MDD", "MCI", "Fatigue", "Immune dysfunction"],
                "interventions": ["Vitamin D3 supplementation", "Sun exposure", "Vitamin K2 co-factor"],
                "caveats": ["Toxicity risk above 100 ng/mL.", "Magnesium required for activation.", "VDR genotype affects response."],
            },
            {
                "id": "b12",
                "name": "Vitamin B12",
                "notation": "B12 · serum",
                "measures": "Essential for myelination and neurotransmitter synthesis; deficiency can mimic neuropsychiatric symptoms.",
                "category": "blood_labs",
                "subcategory": "nutritional",
                "site": "Serum",
                "refRange": "300 to 900 pg/mL",
                "unit_default": "pg/mL",
                "acquisition": "Fasting morning serum draw.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Rare; may indicate supplementation excess or liver disease.",
                "reduced": "Cognitive impairment, depression, neuropathy, megaloblastic anemia.",
                "conditions": ["MDD", "Cognitive decline", "Neuropathy", "Anemia"],
                "interventions": ["Methylcobalamin supplementation", "Dietary B12"],
                "caveats": ["Methylmalonic acid (MMA) is more sensitive for functional deficiency.", "Metformin lowers B12."],
            },
            {
                "id": "folate",
                "name": "Folate (Vitamin B9)",
                "notation": "Folate · serum or RBC",
                "measures": "Cofactor for methylation and neurotransmitter synthesis.",
                "category": "blood_labs",
                "subcategory": "nutritional",
                "site": "Serum or RBC",
                "refRange": "Serum >4.0 ng/mL; RBC >305 ng/mL",
                "unit_default": "ng/mL",
                "acquisition": "Fasting morning serum draw; RBC folate reflects long-term status.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Rare; may mask B12 deficiency if supplemented without B12.",
                "reduced": "Depression, cognitive impairment, neural tube defects risk, anemia.",
                "conditions": ["MDD", "Cognitive decline", "Anemia"],
                "interventions": ["5-MTHF supplementation", "Folate-rich diet"],
                "caveats": ["MTHFR genotype affects folate metabolism.", "Always check B12 alongside folate."],
            },
            {
                "id": "tsh",
                "name": "TSH",
                "notation": "TSH · serum",
                "measures": "Thyroid-stimulating hormone; primary screen for thyroid dysfunction.",
                "category": "blood_labs",
                "subcategory": "thyroid",
                "site": "Serum",
                "refRange": "0.4 to 4.0 mIU/L",
                "unit_default": "mIU/L",
                "acquisition": "Morning serum draw; fasting not required.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Primary hypothyroidism; associated with depression, fatigue, cognitive slowing.",
                "reduced": "Hyperthyroidism; associated with anxiety, irritability, insomnia.",
                "conditions": ["MDD", "Anxiety", "Fatigue", "Cognitive impairment"],
                "interventions": ["Levothyroxine", "Antithyroid agents"],
                "caveats": ["TSH alone does not distinguish subclinical from overt disease.", "Free T4 needed for full assessment."],
            },
            {
                "id": "free_t4",
                "name": "Free T4",
                "notation": "fT4 · serum",
                "measures": "Unbound thyroxine; biologically active thyroid hormone.",
                "category": "blood_labs",
                "subcategory": "thyroid",
                "site": "Serum",
                "refRange": "0.8 to 1.8 ng/dL",
                "unit_default": "ng/dL",
                "acquisition": "Morning serum draw with TSH.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Hyperthyroidism.",
                "reduced": "Hypothyroidism.",
                "conditions": ["MDD", "Anxiety", "Fatigue"],
                "interventions": ["Levothyroxine adjustment"],
                "caveats": ["Interpret with TSH for complete picture."],
            },
            {
                "id": "free_t3",
                "name": "Free T3",
                "notation": "fT3 · serum",
                "measures": "Unbound triiodothyronine; most metabolically active thyroid hormone.",
                "category": "blood_labs",
                "subcategory": "thyroid",
                "site": "Serum",
                "refRange": "2.3 to 4.2 pg/mL",
                "unit_default": "pg/mL",
                "acquisition": "Morning serum draw.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Hyperthyroidism, T3-toxicosis.",
                "reduced": "Hypothyroidism, non-thyroidal illness syndrome.",
                "conditions": ["MDD", "Fatigue", "Cognitive impairment"],
                "interventions": ["Liothyronine (specialist)"],
                "caveats": ["Less stable than TSH/T4; use for specific clinical scenarios."],
            },
            {
                "id": "hba1c",
                "name": "HbA1c",
                "notation": "HbA1c · whole blood",
                "measures": "3-month average glucose; metabolic health indicator.",
                "category": "blood_labs",
                "subcategory": "glycemic",
                "site": "Whole blood (EDTA)",
                "refRange": "Below 5.7% normal; 5.7-6.4% prediabetic",
                "unit_default": "%",
                "acquisition": "Non-fasting whole blood draw.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Diabetes, metabolic syndrome; linked to cognitive decline.",
                "reduced": "Improved glycemic control or hypoglycemia risk.",
                "conditions": ["Diabetes", "Metabolic syndrome", "MCI"],
                "interventions": ["Lifestyle modification", "Metformin", "Dietary intervention"],
                "caveats": ["Inaccurate in hemoglobinopathies or anemia.", "Not for acute glucose monitoring."],
            },
            {
                "id": "crp",
                "name": "CRP",
                "notation": "CRP · serum",
                "measures": "Acute-phase protein; marker of systemic inflammation.",
                "category": "blood_labs",
                "subcategory": "inflammation",
                "site": "Serum",
                "refRange": "Below 10.0 mg/L",
                "unit_default": "mg/L",
                "acquisition": "Non-fasting serum draw.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Acute infection, chronic inflammation, cardiovascular risk.",
                "reduced": "Normal or well-controlled inflammation.",
                "conditions": ["Inflammation", "Cardiovascular risk", "MDD"],
                "interventions": ["Anti-inflammatory diet", "Exercise", "Statins"],
                "caveats": ["Non-specific; use hs-CRP for cardiovascular risk stratification."],
            },
            {
                "id": "hs_crp",
                "name": "High-Sensitivity CRP",
                "notation": "hs-CRP · serum",
                "measures": "Low-grade systemic inflammation marker.",
                "category": "blood_labs",
                "subcategory": "inflammation",
                "site": "Serum",
                "refRange": "Below 1.0 mg/L low risk; 1.0-3.0 moderate risk",
                "unit_default": "mg/L",
                "acquisition": "Fasting morning serum; avoid acute illness.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Cardiovascular risk, metabolic syndrome, depression.",
                "reduced": "Lower inflammation-related disease risk.",
                "conditions": ["MDD", "Cardiovascular risk", "Metabolic syndrome"],
                "interventions": ["Mediterranean diet", "Exercise", "Statins", "Weight loss"],
                "caveats": ["Acute infection can cause large spikes.", "Trend over time more useful than single value."],
            },
            {
                "id": "magnesium",
                "name": "Magnesium",
                "notation": "Mg · serum",
                "measures": "Essential mineral for neuromuscular function and neurotransmission.",
                "category": "blood_labs",
                "subcategory": "electrolyte",
                "site": "Serum",
                "refRange": "1.7 to 2.2 mg/dL",
                "unit_default": "mg/dL",
                "acquisition": "Fasting morning serum draw.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Renal impairment; rare.",
                "reduced": "Migraine, anxiety, depression, muscle cramps, arrhythmia risk.",
                "conditions": ["Migraine", "Anxiety", "Depression", "Arrhythmia"],
                "interventions": ["Magnesium supplementation", "Dietary magnesium"],
                "caveats": ["Serum magnesium is a poor body status indicator; RBC Mg is better."],
            },
            {
                "id": "cortisol_am",
                "name": "Morning Cortisol",
                "notation": "Cortisol · 7-9 am serum/saliva",
                "measures": "Peak diurnal HPA-axis output; stress and mood marker.",
                "category": "blood_labs",
                "subcategory": "stress",
                "site": "Serum or saliva",
                "refRange": "Serum 10-20 ug/dL; saliva 0.27-1.5 ug/dL",
                "unit_default": "ug/dL",
                "acquisition": "Sample 30-60 minutes after waking with consistent timing.",
                "evidence": "A",
                "clinical_status": "specialist",
                "elevated": "HPA hyperactivity, stress, melancholic depression.",
                "reduced": "Adrenal insufficiency, burnout, atypical depression, chronic PTSD.",
                "conditions": ["MDD", "PTSD", "Burnout", "Adrenal disorders"],
                "interventions": ["Stress reduction", "HRV biofeedback", "Mindfulness"],
                "caveats": ["Pulsatile secretion limits single samples.", "Steroid medications are major confounds."],
            },
            {
                "id": "testosterone",
                "name": "Total Testosterone",
                "notation": "T · serum",
                "measures": "Primary androgen; affects mood, energy, and cognition.",
                "category": "blood_labs",
                "subcategory": "endocrine",
                "site": "Serum",
                "refRange": "300 to 1000 ng/dL (men); 15 to 70 ng/dL (women)",
                "unit_default": "ng/dL",
                "acquisition": "Morning fasting serum draw (8-10 am preferred).",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Polycystic ovary syndrome, androgen-secreting tumors.",
                "reduced": "Hypogonadism, depression, fatigue, cognitive decline, low libido.",
                "conditions": ["MDD", "Fatigue", "Cognitive decline", "Hypogonadism"],
                "interventions": ["Testosterone replacement (specialist)", "Lifestyle optimization"],
                "caveats": ["Free testosterone and SHBG needed for full assessment in women."],
            },
            {
                "id": "estradiol",
                "name": "Estradiol",
                "notation": "E2 · serum",
                "measures": "Primary estrogen; affects mood, cognition, and neuroprotection.",
                "category": "blood_labs",
                "subcategory": "endocrine",
                "site": "Serum",
                "refRange": "Varies by sex and age; 10-40 pg/mL (men); 30-400 pg/mL (women, follicular)",
                "unit_default": "pg/mL",
                "acquisition": "Morning fasting serum draw; cycle day matters for women.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Estrogen dominance, gynecomastia (men).",
                "reduced": "Menopausal symptoms, depression, cognitive decline, osteoporosis risk.",
                "conditions": ["MDD", "Menopause", "Cognitive decline"],
                "interventions": ["HRT (specialist)", "Phytoestrogens"],
                "caveats": ["Reference ranges vary significantly by sex, age, and menstrual phase."],
            },
            {
                "id": "cbc",
                "name": "Complete Blood Count",
                "notation": "CBC · whole blood",
                "measures": "Full blood count including hemoglobin, hematocrit, WBC, platelets.",
                "category": "blood_labs",
                "subcategory": "hematology",
                "site": "Whole blood (EDTA)",
                "refRange": "Hb 13.5-17.5 g/dL (men); 12.0-16.0 g/dL (women)",
                "unit_default": "g/dL",
                "acquisition": "Non-fasting whole blood draw.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Polycythemia, dehydration, chronic hypoxia.",
                "reduced": "Anemia, bleeding, nutritional deficiency, chronic disease.",
                "conditions": ["Anemia", "Infection", "Bleeding disorders"],
                "interventions": ["Iron supplementation", "B12/folate", "EPO (specialist)"],
                "caveats": ["Comprehensive panel — interpret individual components."],
            },
            {
                "id": "cmp",
                "name": "Comprehensive Metabolic Panel",
                "notation": "CMP · serum",
                "measures": "Electrolytes, glucose, kidney function, liver enzymes.",
                "category": "blood_labs",
                "subcategory": "metabolic",
                "site": "Serum",
                "refRange": "Component-specific",
                "unit_default": "varies",
                "acquisition": "Fasting serum draw preferred.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Component-specific elevations (e.g., elevated AST/ALT, creatinine).",
                "reduced": "Component-specific reductions (e.g., hyponatremia, hypokalemia).",
                "conditions": ["Metabolic syndrome", "Renal disease", "Hepatic disease"],
                "interventions": ["Component-specific interventions"],
                "caveats": ["Broad panel — each analyte has its own clinical context."],
            },
            {
                "id": "omega3_index",
                "name": "Omega-3 Index",
                "notation": "O3I · RBC membrane",
                "measures": "Percentage of EPA+DHA in red blood cell membranes; cardiovascular and brain health marker.",
                "category": "blood_labs",
                "subcategory": "nutritional",
                "site": "RBC (dried blood spot or whole blood)",
                "refRange": "Above 8% cardioprotective; below 4% at risk",
                "unit_default": "%",
                "acquisition": "Non-fasting dried blood spot or whole blood.",
                "evidence": "A",
                "clinical_status": "specialist",
                "elevated": "Adequate omega-3 intake.",
                "reduced": "Increased cardiovascular and cognitive risk, depression.",
                "conditions": ["MDD", "Cardiovascular risk", "Cognitive decline"],
                "interventions": ["Omega-3 supplementation (EPA/DHA)", "Fatty fish intake"],
                "caveats": ["Reflects intake over ~4 months.", "Omega-6:3 ratio also informative."],
            },
        ],
    },
    {
        "id": "neuroinflammation",
        "label": "Neuroinflammation",
        "description": (
            "Cytokines, acute-phase reactants, and neurotrophic factors "
            "relevant to neuroinflammatory processes in psychiatric and "
            "neurodegenerative conditions."
        ),
        "biomarkers": [
            {
                "id": "bdnf",
                "name": "Brain-Derived Neurotrophic Factor",
                "notation": "BDNF · serum",
                "measures": "Neurotrophin essential for neuroplasticity and synaptic function.",
                "category": "neuroinflammation",
                "subcategory": "neurotrophic",
                "site": "Serum preferred; plasma lower",
                "refRange": "18 to 32 ng/mL serum",
                "unit_default": "ng/mL",
                "acquisition": "Fasting morning serum with prompt centrifugation.",
                "evidence": "B",
                "clinical_status": "research",
                "elevated": "Preserved plasticity; may rise with antidepressant response.",
                "reduced": "MDD, schizophrenia, Alzheimer's, post-TBI.",
                "conditions": ["MDD", "Schizophrenia", "Alzheimer's", "TBI"],
                "interventions": ["rTMS", "Aerobic exercise", "SSRIs/ketamine"],
                "caveats": ["Serum and plasma not interchangeable.", "Diurnal variation.", "Platelet handling matters."],
            },
            {
                "id": "il6",
                "name": "Interleukin-6",
                "notation": "IL-6 · serum",
                "measures": "Pro-inflammatory cytokine elevated in chronic inflammation and stress.",
                "category": "neuroinflammation",
                "subcategory": "cytokine",
                "site": "Serum",
                "refRange": "Below 3.0 pg/mL",
                "unit_default": "pg/mL",
                "acquisition": "Morning fasting serum; avoid acute illness or exercise within 48h.",
                "evidence": "B",
                "clinical_status": "research",
                "elevated": "Chronic inflammation, depression, Long COVID, autoimmune disease.",
                "reduced": "Within normal range.",
                "conditions": ["MDD", "Long COVID", "Autoimmune disease"],
                "interventions": ["Anti-inflammatory diet", "Omega-3", "Exercise", "VNS/taVNS"],
                "caveats": ["Reactive to acute stressors.", "Sex differences.", "Obesity/diabetes confound."],
            },
            {
                "id": "tnf_alpha",
                "name": "TNF-alpha",
                "notation": "TNF-alpha · serum",
                "measures": "Pro-inflammatory cytokine linked to depression and neurodegeneration.",
                "category": "neuroinflammation",
                "subcategory": "cytokine",
                "site": "Serum",
                "refRange": "Below 2.5 pg/mL",
                "unit_default": "pg/mL",
                "acquisition": "Fasting morning serum.",
                "evidence": "B",
                "clinical_status": "research",
                "elevated": "Chronic inflammation, treatment-resistant depression, RA, IBD.",
                "reduced": "Within normal range.",
                "conditions": ["Treatment-resistant depression", "RA", "IBD"],
                "interventions": ["Anti-inflammatory interventions", "TNF-alpha blockers (specialist)"],
                "caveats": ["Often very low in healthy individuals.", "Acute infections cause spikes."],
            },
            {
                "id": "homocysteine",
                "name": "Homocysteine",
                "notation": "Hcy · serum",
                "measures": "Sulfur amino acid linked to vascular dementia and depression.",
                "category": "neuroinflammation",
                "subcategory": "vascular",
                "site": "Serum fasting",
                "refRange": "Below 12 umol/L",
                "unit_default": "umol/L",
                "acquisition": "Fasting morning serum with B12 and folate.",
                "evidence": "A",
                "clinical_status": "specialist",
                "elevated": "Vascular dementia risk, MDD, MCI, B-vitamin deficiency.",
                "reduced": "Unusual; review B6, B12, folate metabolism.",
                "conditions": ["Vascular dementia", "MCI", "MDD"],
                "interventions": ["5-MTHF", "Methylcobalamin", "B6 supplementation"],
                "caveats": ["MTHFR genotype changes processing.", "Renal function affects clearance."],
            },
            {
                "id": "car",
                "name": "Cortisol Awakening Response",
                "notation": "CAR · AUCi saliva",
                "measures": "Dynamic HPA reactivity index; cortisol rise within 30-45 min of waking.",
                "category": "neuroinflammation",
                "subcategory": "stress",
                "site": "Saliva at 0, 15, 30, 45 min post-waking",
                "refRange": "AUCi 5 to 12 (lab-dependent units)",
                "unit_default": "nmol/L·min",
                "acquisition": "Strict waking protocol; no eating or brushing teeth before samples.",
                "evidence": "B",
                "clinical_status": "research",
                "elevated": "HPA hyper-reactivity, anticipatory stress, early burnout.",
                "reduced": "Late-phase chronic stress, PTSD, atypical depression, fatigue.",
                "conditions": ["PTSD", "Burnout", "MDD", "CFS/ME"],
                "interventions": ["Stress management", "Sleep optimization", "CBT"],
                "caveats": ["Protocol compliance is critical.", "Weekday-weekend variability."],
            },
            {
                "id": "dhea_s",
                "name": "DHEA-S",
                "notation": "DHEA-S · serum",
                "measures": "Adrenal androgen precursor; assessed alongside cortisol for HPA evaluation.",
                "category": "neuroinflammation",
                "subcategory": "endocrine",
                "site": "Serum",
                "refRange": "100 to 380 ug/dL adult; sex-specific",
                "unit_default": "ug/dL",
                "acquisition": "Single morning serum draw; stable through the day.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Adrenal hyperactivity, PCOS.",
                "reduced": "Aging, adrenal insufficiency, chronic stress, depression.",
                "conditions": ["MDD", "Aging", "Adrenal insufficiency"],
                "interventions": ["DHEA supplementation under monitoring", "Exercise"],
                "caveats": ["Strongly age-dependent.", "Cortisol:DHEA ratio often more informative."],
            },
            {
                "id": "neopterin",
                "name": "Neopterin",
                "notation": "Neopterin · serum",
                "measures": "Marker of cellular immune activation and macrophage activity.",
                "category": "neuroinflammation",
                "subcategory": "immune",
                "site": "Serum",
                "refRange": "Below 10 nmol/L",
                "unit_default": "nmol/L",
                "acquisition": "Fasting morning serum.",
                "evidence": "C",
                "clinical_status": "research",
                "elevated": "Immune activation, viral infections, autoimmune disease, depression.",
                "reduced": "Normal immune status.",
                "conditions": ["Depression", "Autoimmune disease", "Viral infection"],
                "interventions": ["Target underlying condition"],
                "caveats": ["Non-specific immune activation marker."],
            },
            {
                "id": "qua",
                "name": "Quinolinic Acid",
                "notation": "QUIN · CSF/plasma",
                "measures": "Neurotoxic kynurenine pathway metabolite; NMDA agonist.",
                "category": "neuroinflammation",
                "subcategory": "kynurenine",
                "site": "CSF or plasma",
                "refRange": "Lab-specific",
                "unit_default": "nmol/L",
                "acquisition": "Specialized lab; CSF requires lumbar puncture.",
                "evidence": "C",
                "clinical_status": "research",
                "elevated": "Depression, suicidal ideation, neurodegeneration, HIV-associated neurocognitive disorder.",
                "reduced": "Normal kynurenine pathway activity.",
                "conditions": ["MDD", "Suicidality", "Alzheimer's", "HIV"],
                "interventions": ["Targeted immunomodulation (research)"],
                "caveats": ["Specialized testing; not widely available.", "CSF more informative than plasma."],
            },
            {
                "id": "kyn_aaa_ratio",
                "name": "Kynurenine/Tryptophan Ratio",
                "notation": "Kyn/Trp · plasma",
                "measures": "Index of tryptophan metabolism shunting away from serotonin toward kynurenine.",
                "category": "neuroinflammation",
                "subcategory": "kynurenine",
                "site": "Plasma",
                "refRange": "Below 50 umol/mmol",
                "unit_default": "umol/mmol",
                "acquisition": "Fasting morning plasma.",
                "evidence": "C",
                "clinical_status": "research",
                "elevated": "IDO activation, inflammation-driven depression.",
                "reduced": "Normal tryptophan metabolism.",
                "conditions": ["MDD", "Inflammation-driven depression"],
                "interventions": ["Anti-inflammatory interventions"],
                "caveats": ["IDO upregulated by pro-inflammatory cytokines."],
            },
            {
                "id": "gfap",
                "name": "GFAP",
                "notation": "GFAP · serum (ultrasensitive)",
                "measures": "Glial fibrillary acidic protein; astrocyte activation marker.",
                "category": "neuroinflammation",
                "subcategory": "glial",
                "site": "Serum (Simoa/ultrasensitive assay)",
                "refRange": "Below 100 pg/mL (assay-dependent)",
                "unit_default": "pg/mL",
                "acquisition": "Specialized ultrasensitive assay.",
                "evidence": "C",
                "clinical_status": "research",
                "elevated": "Astrocyte activation, TBI, neurodegeneration, depression.",
                "reduced": "Normal astrocyte status.",
                "conditions": ["TBI", "Alzheimer's", "MDD"],
                "interventions": ["Neuroprotection research"],
                "caveats": ["Requires ultrasensitive detection platforms.", "Still research-stage for psychiatry."],
            },
        ],
    },
    {
        "id": "neurophysiology",
        "label": "Neurophysiology",
        "description": (
            "qEEG spectral markers, connectivity indices, event-related potentials, "
            "and TMS-EEG cortical excitability measures."
        ),
        "biomarkers": [
            {
                "id": "faa",
                "name": "Frontal Alpha Asymmetry",
                "notation": "FAA · log(F4 a) - log(F3 a)",
                "measures": "Hemispheric balance of frontal alpha; reflects withdrawal vs approach motivation.",
                "category": "neurophysiology",
                "subcategory": "spectral",
                "site": "F3, F4",
                "refRange": "-0.10 to +0.20 log(uV2)",
                "unit_default": "log(uV2)",
                "acquisition": "4+ min eyes-closed resting EEG, 19-channel, 256+ Hz sampling.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Right > left frontal alpha (left hypoactivity); withdrawal motivation, depression risk.",
                "reduced": "Left > right alpha (left hyperactivity); approach motivation, lower depression risk.",
                "conditions": ["MDD", "Anxiety", "Social withdrawal"],
                "interventions": ["rTMS L-DLPFC", "tDCS L-DLPFC anodal", "Neurofeedback"],
                "caveats": ["Reference montage shifts values.", "Trait vs state needs baseline averaging."],
            },
            {
                "id": "tbr",
                "name": "Theta/Beta Ratio",
                "notation": "TBR · theta(4-7) / beta(13-21) at Cz",
                "measures": "Ratio of slow theta to fast beta at central midline; ADHD adjunctive marker.",
                "category": "neurophysiology",
                "subcategory": "spectral",
                "site": "Cz; also Fz",
                "refRange": "1.5 to 3.0 in adults",
                "unit_default": "ratio",
                "acquisition": "Eyes-open resting EEG, 3+ min, Cz referenced to linked mastoids.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Lower vigilance, inattentive ADHD presentations.",
                "reduced": "Higher arousal states; interpret with symptoms and medications.",
                "conditions": ["ADHD", "Cognitive slowing", "Drowsiness"],
                "interventions": ["SMR/Beta neurofeedback", "Stimulants", "tDCS DLPFC"],
                "caveats": ["Only ~30-40% of ADHD cases show elevated TBR.", "Vigilance strongly modulates."],
            },
            {
                "id": "paf",
                "name": "Peak Alpha Frequency",
                "notation": "PAF · O1/O2 dominant alpha",
                "measures": "Frequency of posterior alpha peak; index of cortical processing speed.",
                "category": "neurophysiology",
                "subcategory": "spectral",
                "site": "O1, O2, Pz",
                "refRange": "9.5 to 11.0 Hz adult",
                "unit_default": "Hz",
                "acquisition": "Eyes-closed resting EEG; parabolic interpolation around alpha peak.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Faster cognitive processing, better working memory.",
                "reduced": "Below 8.5 Hz suggests cognitive decline, MCI, post-concussive impairment.",
                "conditions": ["MCI", "Alzheimer's", "TBI", "Cognitive aging"],
                "interventions": ["gamma-tACS (40 Hz)", "alpha-tACS at IAF", "Photobiomodulation"],
                "caveats": ["~10% of adults lack clear peak.", "Caffeine and time of day affect PAF."],
            },
            {
                "id": "p300_amp",
                "name": "P300 Amplitude",
                "notation": "P300 · Pz (oddball target)",
                "measures": "Positive deflection ~300 ms post-target; attention allocation and working memory.",
                "category": "neurophysiology",
                "subcategory": "erp",
                "site": "Pz for P3b; Fz for P3a",
                "refRange": "6 to 14 uV in adults",
                "unit_default": "uV",
                "acquisition": "Auditory/visual oddball, 30+ target trials, 0.1-30 Hz bandpass.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Preserved attentional capacity.",
                "reduced": "MCI, Alzheimer's, schizophrenia, ADHD, TBI.",
                "conditions": ["MCI", "Alzheimer's", "Schizophrenia", "ADHD", "TBI"],
                "interventions": ["Cognitive training", "rTMS DLPFC", "Cholinesterase inhibitors"],
                "caveats": ["Highly task-dependent.", "Task engagement must be verified."],
            },
            {
                "id": "p300_lat",
                "name": "P300 Latency",
                "notation": "P300 latency · Pz",
                "measures": "Time from stimulus to P300 peak; processing speed index.",
                "category": "neurophysiology",
                "subcategory": "erp",
                "site": "Pz",
                "refRange": "Below 380 ms in healthy adults",
                "unit_default": "ms",
                "acquisition": "Same paradigm as P300 amplitude; peak in 250-500 ms window.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Cognitive slowing, dementia spectrum, TBI sequelae.",
                "reduced": "Preserved cognitive speed.",
                "conditions": ["Alzheimer's", "MCI", "TBI"],
                "interventions": ["Cognitive training", "Cholinergic agents"],
                "caveats": ["Stimulus discriminability affects latency.", "Compare with age-matched norms."],
            },
            {
                "id": "mmn",
                "name": "Mismatch Negativity",
                "notation": "MMN · Fz (deviant - standard)",
                "measures": "Pre-attentive auditory change detection; sensory memory index.",
                "category": "neurophysiology",
                "subcategory": "erp",
                "site": "Fz, FCz",
                "refRange": "-2 to -5 uV",
                "unit_default": "uV",
                "acquisition": "Passive auditory oddball while subject ignores stimuli.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Intact pre-attentive sensory memory.",
                "reduced": "Schizophrenia, psychosis risk, severe TBI, ASD.",
                "conditions": ["Schizophrenia", "Psychosis risk", "TBI", "ASD"],
                "interventions": ["Auditory training", "NMDA modulators (research)"],
                "caveats": ["Linked to NMDA function; affected by ketamine.", "Stimulus parameters crucial."],
            },
            {
                "id": "dmn_coherence",
                "name": "DMN Coherence",
                "notation": "DMN · PCC <-> mPFC alpha-band",
                "measures": "Functional connectivity between Default Mode Network hubs.",
                "category": "neurophysiology",
                "subcategory": "connectivity",
                "site": "Pz/POz (PCC) and Fpz/AFz (mPFC); source-space preferred",
                "refRange": "0.30 to 0.55 wPLI",
                "unit_default": "wPLI",
                "acquisition": "Eyes-closed resting EEG; wPLI between source ROIs, 2+ min epochs.",
                "evidence": "B",
                "clinical_status": "research",
                "elevated": "Hyperconnectivity with rumination, anxiety, self-referential processing.",
                "reduced": "Hypoconnectivity in MCI, Alzheimer's, TBI.",
                "conditions": ["MDD", "Alzheimer's", "MCI", "Anxiety"],
                "interventions": ["rTMS DLPFC", "Mindfulness", "tDCS mPFC"],
                "caveats": ["EEG-derived DMN is a proxy; fMRI remains gold standard.", "Use phase-based metrics."],
            },
            {
                "id": "theta_gamma_pac",
                "name": "Theta-Gamma PAC",
                "notation": "PAC · theta-phase / gamma-amp",
                "measures": "Phase-amplitude coupling; neural code for working memory.",
                "category": "neurophysiology",
                "subcategory": "connectivity",
                "site": "Hippocampal-PFC axis (source) or Fz/Cz/Pz (surface)",
                "refRange": "0.08 to 0.18 modulation index",
                "unit_default": "MI",
                "acquisition": "Eyes-open or task EEG; Tort MI with theta 4-8 Hz and gamma 30-80 Hz.",
                "evidence": "C",
                "clinical_status": "research",
                "elevated": "Intact memory encoding and hippocampal-cortical communication.",
                "reduced": "MCI, Alzheimer's, working memory deficits.",
                "conditions": ["MCI", "Alzheimer's", "Working memory deficit"],
                "interventions": ["gamma-tACS (40 Hz)", "Memory training"],
                "caveats": ["Sensitive to artifact.", "Multiple PAC algorithms exist."],
            },
            {
                "id": "rmt",
                "name": "Resting Motor Threshold",
                "notation": "RMT · %MSO",
                "measures": "Minimum TMS intensity to elicit 50 uV MEP in 5/10 trials.",
                "category": "neurophysiology",
                "subcategory": "tms_eeg",
                "site": "M1 hand area (FDI muscle)",
                "refRange": "45 to 75% MSO",
                "unit_default": "% MSO",
                "acquisition": "Single-pulse TMS with hotspot localization; staircase or Mills-Nithi method.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Low cortical excitability or poor coil-cortex coupling (>75%).",
                "reduced": "Higher cortical excitability (<45%); may indicate seizure risk.",
                "conditions": ["TMS dosing", "Epilepsy risk", "Parkinson's"],
                "interventions": ["Used to dose all rTMS protocols"],
                "caveats": ["Active and resting thresholds differ.", "Caffeine, sleep, anticonvulsants modulate."],
            },
            {
                "id": "csp",
                "name": "Cortical Silent Period",
                "notation": "CSP · ms",
                "measures": "EMG silence duration after TMS pulse during contraction; GABA-B inhibition index.",
                "category": "neurophysiology",
                "subcategory": "tms_eeg",
                "site": "M1 stimulation with EMG from contralateral muscle",
                "refRange": "120 to 200 ms",
                "unit_default": "ms",
                "acquisition": "TMS at 120% RMT during ~20% MVC; measure from MEP onset to EMG return.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Strong GABA-B inhibition.",
                "reduced": "Reduced inhibition in PD off medication, MDD, dystonia.",
                "conditions": ["Parkinson's", "MDD", "Dystonia", "Epilepsy"],
                "interventions": ["Dopaminergic medication", "rTMS", "GABAergic drugs"],
                "caveats": ["Needs consistent muscle contraction.", "Average at least ~10 trials."],
            },
        ],
    },
    {
        "id": "sleep_cardiac",
        "label": "Sleep & Cardiac",
        "description": (
            "Polysomnographic sleep architecture metrics and heart rate variability "
            "indices relevant to neuropsychiatric assessment."
        ),
        "biomarkers": [
            {
                "id": "rmssd",
                "name": "HRV · RMSSD",
                "notation": "RMSSD",
                "measures": "Root mean square of successive RR interval differences; parasympathetic marker.",
                "category": "sleep_cardiac",
                "subcategory": "hrv",
                "site": "ECG lead II or PPG",
                "refRange": "30 to 60 ms in adults",
                "unit_default": "ms",
                "acquisition": "5+ min seated rest; paced breathing at 6 breaths/min ideal.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Strong parasympathetic tone, recovery capacity, stress resilience.",
                "reduced": "Chronic stress, depression, PTSD, cardiovascular risk, poor recovery.",
                "conditions": ["MDD", "PTSD", "Anxiety", "Burnout"],
                "interventions": ["HRV biofeedback", "taVNS", "Yoga/pranayama", "Aerobic exercise"],
                "caveats": ["Respiration rate strongly affects RMSSD.", "Body position changes values."],
            },
            {
                "id": "sdnn",
                "name": "HRV · SDNN",
                "notation": "SDNN",
                "measures": "Standard deviation of NN intervals; overall HRV index.",
                "category": "sleep_cardiac",
                "subcategory": "hrv",
                "site": "ECG/PPG",
                "refRange": "50 to 100 ms (5 min); above 100 ms (24h Holter)",
                "unit_default": "ms",
                "acquisition": "5 min seated rest minimum; 24h Holter gold standard.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Robust autonomic flexibility.",
                "reduced": "All-cause mortality risk, autonomic dysfunction.",
                "conditions": ["Cardiovascular risk", "PTSD", "MDD"],
                "interventions": ["Aerobic exercise", "HRV biofeedback", "Mindfulness"],
                "caveats": ["5 min and 24h SDNN not interchangeable.", "Strongly age-dependent."],
            },
            {
                "id": "lf_hf_ratio",
                "name": "LF/HF Ratio",
                "notation": "LF(0.04-0.15) / HF(0.15-0.4)",
                "measures": "Ratio of low- to high-frequency HRV power; sympathovagal balance.",
                "category": "sleep_cardiac",
                "subcategory": "hrv",
                "site": "ECG frequency-domain HRV",
                "refRange": "1.0 to 2.0 in resting adults",
                "unit_default": "ratio",
                "acquisition": "5+ min seated rest with controlled breathing.",
                "evidence": "A",
                "clinical_status": "specialist",
                "elevated": "Sympathetic dominance; stress, anxiety, PTSD.",
                "reduced": "Parasympathetic dominance; can be abnormal in severe vagal disease.",
                "conditions": ["Anxiety", "PTSD", "Stress", "Insomnia"],
                "interventions": ["HRV biofeedback", "taVNS", "Beta-blockers"],
                "caveats": ["Sympathovagal interpretation is oversimplified.", "Respiration affects HF."],
            },
            {
                "id": "sleep_efficiency",
                "name": "Sleep Efficiency",
                "notation": "SE · TST/TIB",
                "measures": "Percentage of time in bed actually spent asleep.",
                "category": "sleep_cardiac",
                "subcategory": "sleep",
                "site": "PSG / actigraphy / validated wearables",
                "refRange": "Above 85% in adults",
                "unit_default": "%",
                "acquisition": "PSG gold standard; multi-night actigraphy acceptable.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Consolidated restorative sleep.",
                "reduced": "Insomnia, fragmented sleep, depression, sleep apnea.",
                "conditions": ["Insomnia", "MDD", "Sleep apnea", "Anxiety"],
                "interventions": ["CBT-I", "Sleep restriction", "Stimulus control"],
                "caveats": ["Single-night efficiency not very reliable.", "Wearables often overestimate."],
            },
            {
                "id": "rem_latency",
                "name": "REM Latency",
                "notation": "REM latency",
                "measures": "Time from sleep onset to first REM episode; often shortened in depression.",
                "category": "sleep_cardiac",
                "subcategory": "sleep",
                "site": "Full PSG",
                "refRange": "70 to 110 minutes in healthy adults",
                "unit_default": "min",
                "acquisition": "In-lab or ambulatory PSG with AASM criteria.",
                "evidence": "A",
                "clinical_status": "specialist",
                "elevated": "REM suppression (medication or insomnia).",
                "reduced": "Below 60 min suggests MDD, narcolepsy, or REM rebound.",
                "conditions": ["MDD", "Narcolepsy", "PTSD"],
                "interventions": ["SSRIs", "Stimulants", "CPAP for OSA"],
                "caveats": ["Most antidepressants suppress REM.", "First-night effect can prolong."],
            },
            {
                "id": "sws",
                "name": "Slow Wave Sleep %",
                "notation": "SWS / N3",
                "measures": "Percentage of sleep in deep N3; restorative function marker.",
                "category": "sleep_cardiac",
                "subcategory": "sleep",
                "site": "PSG with frontal EEG",
                "refRange": "15 to 25% in young/middle-aged adults",
                "unit_default": "%",
                "acquisition": "PSG with AASM staging; 20%+ delta = N3.",
                "evidence": "A",
                "clinical_status": "specialist",
                "elevated": "Strong memory consolidation, glymphatic clearance.",
                "reduced": "Aging, MCI, insomnia, depression, fragmented sleep.",
                "conditions": ["MCI", "Insomnia", "Aging", "MDD"],
                "interventions": ["Slow-wave enhancement", "Sleep hygiene", "Exercise"],
                "caveats": ["Frontal EEG more sensitive.", "Decreases ~2% per decade after 30."],
            },
            {
                "id": "waso",
                "name": "WASO",
                "notation": "WASO",
                "measures": "Total wake time after initial sleep onset until final awakening.",
                "category": "sleep_cardiac",
                "subcategory": "sleep",
                "site": "PSG / actigraphy",
                "refRange": "Below 30 minutes in healthy adults",
                "unit_default": "min",
                "acquisition": "PSG or validated actigraphy; sum all wake epochs after sleep onset.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Sleep fragmentation, insomnia, sleep apnea, depression.",
                "reduced": "Consolidated sleep.",
                "conditions": ["Insomnia", "Sleep apnea", "MDD", "Aging"],
                "interventions": ["CBT-I", "Treat underlying cause", "Sleep restriction"],
                "caveats": ["Increases with normal aging.", "Wearables may underestimate WASO."],
            },
            {
                "id": "spindle_density",
                "name": "Sleep Spindle Density",
                "notation": "Spindles/min N2",
                "measures": "Sleep spindles per minute of N2; memory consolidation and plasticity index.",
                "category": "sleep_cardiac",
                "subcategory": "sleep",
                "site": "C3/C4/Cz",
                "refRange": "3 to 8 spindles/min in N2",
                "unit_default": "spindles/min",
                "acquisition": "PSG with automated spindle detection.",
                "evidence": "B",
                "clinical_status": "research",
                "elevated": "Robust memory consolidation, healthy thalamocortical loop.",
                "reduced": "Schizophrenia, MCI, aging.",
                "conditions": ["Schizophrenia", "MCI", "Aging"],
                "interventions": ["Closed-loop tACS (research)", "Sleep optimization"],
                "caveats": ["Slow and fast spindles have different functions.", "Algorithm choice matters."],
            },
            {
                "id": "sol",
                "name": "Sleep Onset Latency",
                "notation": "SOL",
                "measures": "Time from lights out to first epoch of sleep.",
                "category": "sleep_cardiac",
                "subcategory": "sleep",
                "site": "PSG / sleep diary / actigraphy",
                "refRange": "Below 20 minutes in healthy adults",
                "unit_default": "min",
                "acquisition": "PSG to first N1 epoch; sleep diary for chronic monitoring.",
                "evidence": "A",
                "clinical_status": "routine",
                "elevated": "Sleep-onset insomnia, anxiety, hyperarousal.",
                "reduced": "Below 5 min suggests sleep deprivation or narcolepsy.",
                "conditions": ["Insomnia", "Anxiety", "Narcolepsy"],
                "interventions": ["CBT-I", "Stimulus control", "Melatonin"],
                "caveats": ["Self-reported SOL usually overestimated.", "First-night effect prolongs SOL."],
            },
        ],
    },
    {
        "id": "cognitive_behavioral",
        "label": "Cognitive & Behavioral",
                "description": (
            "Computerized cognitive testing and behavioral measures used as "
            "biomarkers of executive function, attention, and processing speed."
        ),
        "biomarkers": [
            {
                "id": "cpt_dprime",
                "name": "CPT-3 d-prime",
                "notation": "CPT · d-prime",
                "measures": "Signal detection sensitivity from continuous performance test.",
                "category": "cognitive_behavioral",
                "subcategory": "attention",
                "site": "Computerized testing (Conners CPT-3, TOVA, IVA)",
                "refRange": "Above 3.0 d-prime in healthy adults",
                "unit_default": "d-prime",
                "acquisition": "14-22 min CPT; compute d-prime from hits and false alarms.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Strong sustained attention and target discrimination.",
                "reduced": "Inattention, TBI, fatigue, ADHD.",
                "conditions": ["ADHD", "TBI", "Cognitive fatigue", "MCI"],
                "interventions": ["Stimulants", "Attention neurofeedback", "Cognitive training"],
                "caveats": ["Practice effects on repeated testing.", "Motivation strongly affects performance."],
            },
            {
                "id": "stroop_interference",
                "name": "Stroop Interference",
                "notation": "Stroop · ms (incongruent - congruent)",
                "measures": "Reaction-time cost for naming incongruent color words; cognitive control index.",
                "category": "cognitive_behavioral",
                "subcategory": "executive",
                "site": "Computerized or paper-pencil Stroop",
                "refRange": "Below 110 ms in healthy adults",
                "unit_default": "ms",
                "acquisition": "40+ trials per condition; subtract incongruent minus congruent RT.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Poor cognitive control, frontal dysfunction, MCI, depression.",
                "reduced": "Strong inhibitory control.",
                "conditions": ["MDD", "MCI", "TBI", "ADHD"],
                "interventions": ["Cognitive training", "tDCS L-DLPFC", "Mindfulness"],
                "caveats": ["Practice effects significant.", "Reading ability required."],
            },
            {
                "id": "nback_3back",
                "name": "N-back 3-back Accuracy",
                "notation": "3-back · % correct",
                "measures": "Accuracy on 3-back working memory task.",
                "category": "cognitive_behavioral",
                "subcategory": "working_memory",
                "site": "Computerized testing",
                "refRange": "Above 70% in healthy adults",
                "unit_default": "%",
                "acquisition": "Standard n-back with 3+ blocks of 3-back.",
                "evidence": "B",
                "clinical_status": "specialist",
                "elevated": "Strong working memory and intact DLPFC function.",
                "reduced": "Working memory deficits in ADHD, MDD, schizophrenia, MCI.",
                "conditions": ["MDD", "ADHD", "Schizophrenia", "MCI"],
                "interventions": ["Cognitive training", "tDCS L-DLPFC", "Aerobic exercise"],
                "caveats": ["Far transfer debated.", "Dual n-back harder than single."],
            },
            {
                "id": "rtcv",
                "name": "Reaction Time Variability",
                "notation": "RT-CV",
                "measures": "Coefficient of variation of RT across trials; attentional fluctuation marker.",
                "category": "cognitive_behavioral",
                "subcategory": "attention",
                "site": "Any RT-based task (CPT, choice RT, n-back)",
                "refRange": "Below 0.25 in adults",
                "unit_default": "CV",
                "acquisition": "SD divided by mean RT across 40+ correct trials.",
                "evidence": "B",
                "clinical_status": "research",
                "elevated": "Attentional lapses, drowsiness, ADHD, TBI, white-matter disease.",
                "reduced": "Consistent attentional engagement.",
                "conditions": ["ADHD", "TBI", "MCI"],
                "interventions": ["Stimulants", "Sleep optimization", "Cognitive training"],
                "caveats": ["Outlier RT trials can distort metric.", "Ex-Gaussian tau can isolate lapses."],
            },
        ],
    },
]


# ── Helpers ──────────────────────────────────────────────────────────────────


def _all_biomarkers_flat() -> list[dict[str, Any]]:
    """Return all biomarkers across all categories as a flat list."""
    out: list[dict[str, Any]] = []
    for cat in _BIOMARKER_CATEGORIES:
        for bm in cat.get("biomarkers", []):
            bm_copy = dict(bm)
            bm_copy["category"] = cat["id"]
            out.append(bm_copy)
    return out


def _biomarker_by_id(biomarker_id: str) -> Optional[dict[str, Any]]:
    for bm in _all_biomarkers_flat():
        if bm["id"] == biomarker_id:
            return bm
    return None


def _category_by_id(category_id: str) -> Optional[dict[str, Any]]:
    for cat in _BIOMARKER_CATEGORIES:
        if cat["id"] == category_id:
            return cat
    return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_iso_date(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        d = date.fromisoformat(raw)
        return d.isoformat()
    except ValueError as exc:
        raise ApiServiceError(
            code="invalid_request",
            message=f"Invalid date: {value}. Use ISO format (YYYY-MM-DD).",
            status_code=422,
        ) from exc


def _parse_optional_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _gate_patient_access(actor: AuthenticatedActor, patient_id: str, db: Session) -> None:
    require_minimum_role(actor, "clinician")
    exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
    if not exists:
        raise ApiServiceError(
            code="not_found",
            message="Patient not found.",
            status_code=404,
        )
    require_patient_owner(actor, clinic_id)


def _log_biomarker_event(
    db: Session,
    actor: AuthenticatedActor,
    *,
    event: str,
    patient_id: str,
    note: str = "",
) -> None:
    """Best-effort clinical audit logging for biomarker operations."""
    now = datetime.now(timezone.utc)
    event_id = (
        f"biomarker-{event}-{actor.actor_id}"
        f"-{patient_id}-{int(now.timestamp())}-{uuid.uuid4().hex[:6]}"
    )
    try:
        create_audit_event(
            db,
            event_id=event_id,
            target_id=patient_id,
            target_type="biomarker",
            action=f"biomarker.{event}",
            role=actor.role,
            actor_id=actor.actor_id,
            note=note[:1024] or event,
            created_at=now.isoformat(),
        )
    except Exception:
        logger.exception("biomarker audit logging failed (non-blocking)")


# ── Pydantic Schemas ─────────────────────────────────────────────────────────


class BiomarkerCategoryOut(BaseModel):
    id: str
    label: str
    count: int
    description: str


class BiomarkerCategoriesResponse(BaseModel):
    categories: list[BiomarkerCategoryOut]
    total_biomarkers: int
    last_updated: str


class BiomarkerItemOut(BaseModel):
    id: str
    name: str
    notation: str
    measures: str
    category: str
    subcategory: str | None = None
    site: str | None = None
    refRange: str | None = None
    unit_default: str | None = None
    acquisition: str | None = None
    evidence: str | None = None
    clinical_status: str | None = None
    elevated: str | None = None
    reduced: str | None = None
    conditions: list[str] = Field(default_factory=list)
    interventions: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class BiomarkerListResponse(BaseModel):
    items: list[BiomarkerItemOut]
    total: int
    page: int = 1
    page_size: int = 50


class BiomarkerDetailResponse(BiomarkerItemOut):
    pass


class BiomarkerValueCreate(BaseModel):
    biomarker_id: str = Field(..., min_length=1, max_length=64)
    value: float
    unit: str = Field(..., min_length=1, max_length=40)
    sample_date: str = Field(..., min_length=1, max_length=16)
    source_lab: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)
    fasting: bool = False
    time_of_day: str | None = Field(default=None, max_length=8)


class BiomarkerValueOut(BaseModel):
    id: str
    patient_id: str
    biomarker_id: str
    biomarker_name: str | None = None
    value: float
    unit: str
    sample_date: str | None = None
    source_lab: str | None = None
    notes: str | None = None
    fasting: bool = False
    time_of_day: str | None = None
    abnormal_flag: str | None = None
    ref_range_low: float | None = None
    ref_range_high: float | None = None
    recorded_by: str | None = None
    recorded_at: str | None = None


class BiomarkerValuesResponse(BaseModel):
    items: list[BiomarkerValueOut]
    total: int
    patient_id: str


class BiomarkerTrendPoint(BaseModel):
    sample_date: str
    value: float
    unit: str
    abnormal_flag: str | None = None
    notes: str | None = None


class BiomarkerTrendResponse(BaseModel):
    biomarker_id: str
    biomarker_name: str | None = None
    patient_id: str
    points: list[BiomarkerTrendPoint]
    unit: str | None = None
    ref_low: float | None = None
    ref_high: float | None = None


class BiomarkerInterpretRequest(BaseModel):
    biomarker_ids: list[str] = Field(..., min_length=1, max_length=20)
    context: str | None = Field(default=None, max_length=2000)


class EvidenceLinkOut(BaseModel):
    title: str
    url: str | None = None
    evidence_level: str | None = None


class BiomarkerInterpretResponse(BaseModel):
    interpretation: str
    safety_note: str
    evidence_links: list[EvidenceLinkOut] = Field(default_factory=list)
    confidence: float
    suggested_follow_up: list[str] = Field(default_factory=list)


# ── Evidence link stubs for interpretation endpoint ──────────────────────────

_EVIDENCE_LINKS: dict[str, list[EvidenceLinkOut]] = {
    "ferritin": [
        EvidenceLinkOut(title="Iron deficiency and fatigue: systematic review", evidence_level="A"),
        EvidenceLinkOut(title="RLS and ferritin <50 ng/mL: practice guideline", evidence_level="A"),
    ],
    "vitamin_d": [
        EvidenceLinkOut(title="Vitamin D and depression: meta-analysis (2024)", evidence_level="A"),
        EvidenceLinkOut(title="25(OH)D <20 ng/mL: clinical practice guideline", evidence_level="A"),
    ],
    "tsh": [
        EvidenceLinkOut(title="Subclinical thyroid dysfunction: ATA guidelines", evidence_level="A"),
        EvidenceLinkOut(title="Thyroid and mood: systematic review", evidence_level="B"),
    ],
    "b12": [
        EvidenceLinkOut(title="B12 deficiency and neuropsychiatric symptoms: review", evidence_level="A"),
        EvidenceLinkOut(title="Methylcobalamin vs cyanocobalamin: RCT", evidence_level="B"),
    ],
    "bdnf": [
        EvidenceLinkOut(title="BDNF and antidepressant response: meta-analysis", evidence_level="B"),
        EvidenceLinkOut(title="Serum BDNF as depression biomarker: systematic review", evidence_level="B"),
    ],
    "il6": [
        EvidenceLinkOut(title="IL-6 and treatment-resistant depression", evidence_level="B"),
        EvidenceLinkOut(title="Cytokine hypothesis of depression: review", evidence_level="B"),
    ],
    "crp": [
        EvidenceLinkOut(title="hs-CRP and cardiovascular risk: AHA/ACC guidelines", evidence_level="A"),
        EvidenceLinkOut(title="Inflammation and depression: Lancet review", evidence_level="A"),
    ],
    "hba1c": [
        EvidenceLinkOut(title="HbA1c and cognitive decline: longitudinal cohort", evidence_level="A"),
        EvidenceLinkOut(title="Diabetes and depression: bidirectional meta-analysis", evidence_level="A"),
    ],
    "magnesium": [
        EvidenceLinkOut(title="Magnesium and migraine prevention: AAN guideline", evidence_level="A"),
        EvidenceLinkOut(title="Mg and anxiety: systematic review", evidence_level="B"),
    ],
    "rmssd": [
        EvidenceLinkOut(title="HRV and mental health: systematic review", evidence_level="A"),
        EvidenceLinkOut(title="HRV biofeedback for anxiety/depression: meta-analysis", evidence_level="A"),
    ],
    "homocysteine": [
        EvidenceLinkOut(title="Hcy and vascular dementia: prospective cohort", evidence_level="A"),
        EvidenceLinkOut(title="MTHFR and homocysteine: clinical implications", evidence_level="B"),
    ],
    "cortisol_am": [
        EvidenceLinkOut(title="HPA axis and depression: comprehensive review", evidence_level="A"),
        EvidenceLinkOut(title="CAR protocol: standardized methodology", evidence_level="B"),
    ],
}


# ── Interpretation engine (decision-support only) ────────────────────────────


def _build_interpretation(
    biomarker_ids: list[str],
    values: list[BiomarkerValueOut],
    context: str | None,
) -> BiomarkerInterpretResponse:
    """Build a draft interpretation from stored biomarker values.

    This is decision-support scaffolding — NOT a clinical diagnosis.
    Every output is labelled as draft for clinician review.
    """
    parts: list[str] = []
    follow_up: list[str] = []
    all_evidence: list[EvidenceLinkOut] = []
    confidence_inputs: list[float] = []

    for bm_id in biomarker_ids:
        bm_def = _biomarker_by_id(bm_id)
        bm_name = bm_def["name"] if bm_def else bm_id
        val = next((v for v in values if v.biomarker_id == bm_id), None)
        if val is None:
            parts.append(f"{bm_name}: no stored value found for this patient.")
            confidence_inputs.append(0.3)
            continue

        val_str = f"{val.value} {val.unit}"
        flag = val.abnormal_flag
        if flag == "low":
            status = "below reference range"
            confidence_inputs.append(0.75)
        elif flag == "high":
            status = "above reference range"
            confidence_inputs.append(0.75)
        else:
            status = "within reference range"
            confidence_inputs.append(0.85)

        parts.append(f"{bm_name} {val_str} ({status}).")

        # Follow-up suggestions
        if bm_id == "ferritin" and flag in ("low", None) and val.value < 30:
            follow_up.append("Iron studies (TSAT, serum iron, TIBC)")
            follow_up.append("Consider iron supplementation if TSAT <20%")
        elif bm_id == "vitamin_d" and flag in ("low", None) and val.value < 30:
            follow_up.append("Vitamin D3 supplementation review")
            follow_up.append("Recheck 25(OH)D in 8-12 weeks")
        elif bm_id == "tsh" and flag in ("high", None) and val.value > 4.0:
            follow_up.append("Free T4 and thyroid antibody panel")
            follow_up.append("Endocrinology referral if TSH >10 or symptomatic")
        elif bm_id == "b12" and flag in ("low", None) and val.value < 300:
            follow_up.append("MMA and homocysteine for functional B12 status")
            follow_up.append("B12 supplementation (methylcobalamin)")
        elif bm_id == "hba1c" and flag in ("high", None) and val.value > 5.7:
            follow_up.append("Glucose monitoring and diabetes screening")
            follow_up.append("Lifestyle intervention review")
        elif bm_id == "hs_crp" and flag in ("high", None) and val.value > 3.0:
            follow_up.append("Cardiovascular risk assessment")
            follow_up.append("Anti-inflammatory lifestyle review")

        # Evidence links
        all_evidence.extend(_EVIDENCE_LINKS.get(bm_id, []))

    # Deduplicate follow-ups
    seen: set[str] = set()
    follow_up_deduped: list[str] = []
    for fu in follow_up:
        if fu.lower() not in seen:
            seen.add(fu.lower())
            follow_up_deduped.append(fu)

    # Build narrative
    interpretation_text = " ".join(parts)
    if context:
        interpretation_text += (
            f" Clinical context: {context} "
            "These biomarker findings should be integrated with the full clinical picture."
        )

    if not interpretation_text.endswith("."):
        interpretation_text += "."

    interpretation_text += (
        " These findings may support clinical assessment of the presenting concerns. "
        "Requires clinician review."
    )

    confidence = round(sum(confidence_inputs) / len(confidence_inputs), 2) if confidence_inputs else 0.5

    return BiomarkerInterpretResponse(
        interpretation=interpretation_text,
        safety_note=(
            "Draft for clinician review. "
            "Biomarkers are supportive context only — not diagnostic. "
            "Do not use for autonomous clinical decision-making."
        ),
        evidence_links=all_evidence[:10],
        confidence=confidence,
        suggested_follow_up=follow_up_deduped,
    )


def _compute_abnormal_flag(value: float, ref_low: float | None, ref_high: float | None) -> str | None:
    if ref_low is not None and value < ref_low:
        return "low"
    if ref_high is not None and value > ref_high:
        return "high"
    return None


def _extract_ref_range(bm_def: dict[str, Any] | None) -> tuple[float | None, float | None]:
    """Best-effort extraction of numeric ref range from text like '30 to 300 ng/mL'."""
    if bm_def is None:
        return None, None
    ref_text = bm_def.get("refRange", "")
    if not ref_text:
        return None, None
    import re
    nums = re.findall(r"[\d.]+", ref_text)
    if len(nums) >= 2:
        try:
            return float(nums[0]), float(nums[1])
        except ValueError:
            pass
    return None, None


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("", response_model=BiomarkerCategoriesResponse)
def list_biomarker_categories(
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BiomarkerCategoriesResponse:
    """Return all biomarker categories with counts."""
    require_minimum_role(actor, "clinician")
    categories = [
        BiomarkerCategoryOut(
            id=cat["id"],
            label=cat["label"],
            count=len(cat.get("biomarkers", [])),
            description=cat.get("description", ""),
        )
        for cat in _BIOMARKER_CATEGORIES
    ]
    total = sum(c.count for c in categories)
    return BiomarkerCategoriesResponse(
        categories=categories,
        total_biomarkers=total,
        last_updated="2026-05-15",
    )


@router.get("/{category}", response_model=BiomarkerListResponse)
def list_biomarkers_in_category(
    category: str,
    evidence: str | None = Query(default=None, max_length=4),
    clinical_status: str | None = Query(default=None, max_length=16),
    search: str | None = Query(default=None, max_length=120),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BiomarkerListResponse:
    """Return biomarkers in a category with optional filtering and pagination."""
    require_minimum_role(actor, "clinician")
    cat = _category_by_id(category)
    if cat is None:
        raise ApiServiceError(
            code="not_found",
            message=f"Category '{category}' not found.",
            status_code=404,
        )

    items = cat.get("biomarkers", [])

    # Filter by evidence level
    if evidence:
        ev = evidence.strip().upper()
        items = [bm for bm in items if (bm.get("evidence") or "").upper().startswith(ev)]

    # Filter by clinical status
    if clinical_status:
        cs = clinical_status.strip().lower()
        items = [bm for bm in items if (bm.get("clinical_status") or "").lower() == cs]

    # Text search
    if search:
        q = search.strip().lower()
        items = [
            bm for bm in items
            if q in bm.get("name", "").lower()
            or q in bm.get("notation", "").lower()
            or q in bm.get("measures", "").lower()
            or q in " ".join(bm.get("conditions", [])).lower()
            or q in bm.get("subcategory", "").lower()
        ]

    total = len(items)
    start = (page - 1) * page_size
    end = start + page_size
    paginated = items[start:end]

    return BiomarkerListResponse(
        items=[
            BiomarkerItemOut(
                id=bm["id"],
                name=bm["name"],
                notation=bm["notation"],
                measures=bm["measures"],
                category=category,
                subcategory=bm.get("subcategory"),
                site=bm.get("site"),
                refRange=bm.get("refRange"),
                unit_default=bm.get("unit_default"),
                acquisition=bm.get("acquisition"),
                evidence=bm.get("evidence"),
                clinical_status=bm.get("clinical_status"),
                elevated=bm.get("elevated"),
                reduced=bm.get("reduced"),
                conditions=bm.get("conditions", []),
                interventions=bm.get("interventions", []),
                caveats=bm.get("caveats", []),
            )
            for bm in paginated
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{category}/{biomarker_id}", response_model=BiomarkerDetailResponse)
def get_biomarker_detail(
    category: str,
    biomarker_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
) -> BiomarkerDetailResponse:
    """Return full details for a specific biomarker."""
    require_minimum_role(actor, "clinician")
    cat = _category_by_id(category)
    if cat is None:
        raise ApiServiceError(
            code="not_found",
            message=f"Category '{category}' not found.",
            status_code=404,
        )
    bm = next((b for b in cat.get("biomarkers", []) if b["id"] == biomarker_id), None)
    if bm is None:
        raise ApiServiceError(
            code="not_found",
            message=f"Biomarker '{biomarker_id}' not found in category '{category}'.",
            status_code=404,
        )
    return BiomarkerDetailResponse(
        id=bm["id"],
        name=bm["name"],
        notation=bm["notation"],
        measures=bm["measures"],
        category=category,
        subcategory=bm.get("subcategory"),
        site=bm.get("site"),
        refRange=bm.get("refRange"),
        unit_default=bm.get("unit_default"),
        acquisition=bm.get("acquisition"),
        evidence=bm.get("evidence"),
        clinical_status=bm.get("clinical_status"),
        elevated=bm.get("elevated"),
        reduced=bm.get("reduced"),
        conditions=bm.get("conditions", []),
        interventions=bm.get("interventions", []),
        caveats=bm.get("caveats", []),
    )


@router.post("/patient/{patient_id}/values", response_model=BiomarkerValueOut, status_code=201)
def store_patient_biomarker_value(
    patient_id: str,
    body: BiomarkerValueCreate,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> BiomarkerValueOut:
    """Store a patient biomarker value. Requires ai_analysis consent + patient ownership."""
    _gate_patient_access(actor, patient_id, db)

    # Require AI analysis consent
    try:
        require_ai_analysis_consent(db, patient_id, actor, ai_modality="biomarker")
    except ConsentMissingError as exc:
        raise ApiServiceError(
            code="consent_missing",
            message=str(exc),
            status_code=403,
            warnings=["ai_analysis consent is required to store biomarker values."],
        ) from exc

    # Validate biomarker exists
    bm_def = _biomarker_by_id(body.biomarker_id)
    if bm_def is None:
        raise ApiServiceError(
            code="not_found",
            message=f"Biomarker '{body.biomarker_id}' not found in reference catalog.",
            status_code=404,
        )

    sample_date = _parse_iso_date(body.sample_date)
    ref_low, ref_high = _extract_ref_range(bm_def)
    abnormal = _compute_abnormal_flag(body.value, ref_low, ref_high)

    row = PatientLabResult(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        clinician_id=actor.actor_id,
        analyte_code=body.biomarker_id,
        analyte_display_name=bm_def["name"],
        panel_name=bm_def.get("subcategory"),
        value_numeric=body.value,
        unit_ucum=body.unit,
        ref_low=ref_low,
        ref_high=ref_high,
        sample_collected_at=(
            datetime.fromisoformat(sample_date).replace(tzinfo=timezone.utc)
            if sample_date else datetime.now(timezone.utc)
        ),
        source=(body.source_lab or "manual")[:32],
        is_demo=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    # Audit log
    _log_biomarker_event(
        db,
        actor,
        event="value_stored",
        patient_id=patient_id,
        note=(
            f"biomarker={body.biomarker_id} "
            f"value={body.value} {body.unit} "
            f"sample_date={sample_date} "
            f"fasting={body.fasting}"
        ),
    )

    return BiomarkerValueOut(
        id=row.id,
        patient_id=row.patient_id,
        biomarker_id=body.biomarker_id,
        biomarker_name=bm_def["name"],
        value=body.value,
        unit=body.unit,
        sample_date=sample_date,
        source_lab=body.source_lab,
        notes=body.notes,
        fasting=body.fasting,
        time_of_day=body.time_of_day,
        abnormal_flag=abnormal,
        ref_range_low=ref_low,
        ref_range_high=ref_high,
        recorded_by=actor.actor_id,
        recorded_at=_now_iso(),
    )


@router.get("/patient/{patient_id}/values", response_model=BiomarkerValuesResponse)
def list_patient_biomarker_values(
    patient_id: str,
    category: str | None = Query(default=None, max_length=64),
    from_date: str | None = Query(default=None, max_length=16),
    to_date: str | None = Query(default=None, max_length=16),
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> BiomarkerValuesResponse:
    """Return all stored biomarker values for a patient with optional filtering."""
    _gate_patient_access(actor, patient_id, db)

    query = db.query(PatientLabResult).filter(PatientLabResult.patient_id == patient_id)

    # Date range filter
    from_dt = _parse_optional_date(from_date)
    to_dt = _parse_optional_date(to_date)
    if from_dt:
        query = query.filter(PatientLabResult.sample_collected_at >= from_dt.isoformat())
    if to_dt:
        query = query.filter(PatientLabResult.sample_collected_at <= to_dt.isoformat())

    rows = query.order_by(
        PatientLabResult.sample_collected_at.desc(),
        PatientLabResult.created_at.desc(),
    ).all()

    items: list[BiomarkerValueOut] = []
    for row in rows:
        bm_def = _biomarker_by_id(row.analyte_code or "")
        bm_name = bm_def["name"] if bm_def else (row.analyte_display_name or row.analyte_code)
        abnormal = _compute_abnormal_flag(
            row.value_numeric, row.ref_low, row.ref_high
        ) if row.value_numeric is not None else None

        val_out = BiomarkerValueOut(
            id=row.id,
            patient_id=row.patient_id,
            biomarker_id=row.analyte_code or "",
            biomarker_name=bm_name,
            value=row.value_numeric or 0.0,
            unit=row.unit_ucum or "",
            sample_date=(
                row.sample_collected_at.date().isoformat()
                if row.sample_collected_at else None
            ),
            source_lab=row.source,
            notes=None,
            fasting=False,
            time_of_day=None,
            abnormal_flag=abnormal,
            ref_range_low=row.ref_low,
            ref_range_high=row.ref_high,
            recorded_by=row.clinician_id,
            recorded_at=(
                row.created_at.isoformat().replace("+00:00", "Z")
                if row.created_at else None
            ),
        )

        # Category filter (post-query since it's embedded data)
        if category:
            if bm_def and bm_def.get("category") == category:
                items.append(val_out)
        else:
            items.append(val_out)

    return BiomarkerValuesResponse(
        items=items,
        total=len(items),
        patient_id=patient_id,
    )


@router.get("/patient/{patient_id}/trends/{biomarker_id}", response_model=BiomarkerTrendResponse)
def get_biomarker_trends(
    patient_id: str,
    biomarker_id: str,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> BiomarkerTrendResponse:
    """Return time series for a specific biomarker — for charting longitudinal trends."""
    _gate_patient_access(actor, patient_id, db)

    bm_def = _biomarker_by_id(biomarker_id)
    bm_name = bm_def["name"] if bm_def else biomarker_id

    rows = (
        db.query(PatientLabResult)
        .filter(
            PatientLabResult.patient_id == patient_id,
            PatientLabResult.analyte_code == biomarker_id,
        )
        .order_by(PatientLabResult.sample_collected_at.asc())
        .all()
    )

    points: list[BiomarkerTrendPoint] = []
    for row in rows:
        if row.value_numeric is None:
            continue
        abnormal = _compute_abnormal_flag(row.value_numeric, row.ref_low, row.ref_high)
        points.append(
            BiomarkerTrendPoint(
                sample_date=(
                    row.sample_collected_at.date().isoformat()
                    if row.sample_collected_at else ""
                ),
                value=row.value_numeric,
                unit=row.unit_ucum or "",
                abnormal_flag=abnormal,
                notes=None,
            )
        )

    ref_low, ref_high = _extract_ref_range(bm_def) if bm_def else (None, None)

    return BiomarkerTrendResponse(
        biomarker_id=biomarker_id,
        biomarker_name=bm_name,
        patient_id=patient_id,
        points=points,
        unit=bm_def.get("unit_default") if bm_def else None,
        ref_low=ref_low,
        ref_high=ref_high,
    )


@router.post("/patient/{patient_id}/interpret", response_model=BiomarkerInterpretResponse)
def interpret_patient_biomarkers(
    patient_id: str,
    body: BiomarkerInterpretRequest,
    actor: AuthenticatedActor = Depends(get_authenticated_actor),
    db: Session = Depends(get_db_session),
) -> BiomarkerInterpretResponse:
    """AI-assisted biomarker interpretation (decision-support only).

    Requires ai_analysis consent. Returns a draft interpretation with safety
    disclaimers for clinician review. Not a clinical diagnosis.
    """
    _gate_patient_access(actor, patient_id, db)

    # Require AI analysis consent
    try:
        require_ai_analysis_consent(db, patient_id, actor, ai_modality="biomarker_interpret")
    except ConsentMissingError as exc:
        raise ApiServiceError(
            code="consent_missing",
            message=str(exc),
            status_code=403,
            warnings=["ai_analysis consent is required for biomarker interpretation."],
        ) from exc

    # Validate biomarker IDs
    for bm_id in body.biomarker_ids:
        if _biomarker_by_id(bm_id) is None:
            raise ApiServiceError(
                code="not_found",
                message=f"Biomarker '{bm_id}' not found in reference catalog.",
                status_code=404,
            )

    # Fetch stored values for the requested biomarkers
    rows = (
        db.query(PatientLabResult)
        .filter(
            PatientLabResult.patient_id == patient_id,
            PatientLabResult.analyte_code.in_(body.biomarker_ids),
        )
        .order_by(PatientLabResult.sample_collected_at.desc())
        .all()
    )

    # Build value objects for interpretation engine
    values: list[BiomarkerValueOut] = []
    seen_ids: set[str] = set()
    for row in rows:
        bm_id = row.analyte_code or ""
        if bm_id in seen_ids:
            continue  # Use most recent value only
        seen_ids.add(bm_id)
        bm_def = _biomarker_by_id(bm_id)
        bm_name = bm_def["name"] if bm_def else (row.analyte_display_name or bm_id)
        abnormal = _compute_abnormal_flag(
            row.value_numeric, row.ref_low, row.ref_high
        ) if row.value_numeric is not None else None
        values.append(
            BiomarkerValueOut(
                id=row.id,
                patient_id=row.patient_id,
                biomarker_id=bm_id,
                biomarker_name=bm_name,
                value=row.value_numeric or 0.0,
                unit=row.unit_ucum or "",
                sample_date=(
                    row.sample_collected_at.date().isoformat()
                    if row.sample_collected_at else None
                ),
                source_lab=row.source,
                notes=None,
                fasting=False,
                time_of_day=None,
                abnormal_flag=abnormal,
                ref_range_low=row.ref_low,
                ref_range_high=row.ref_high,
                recorded_by=row.clinician_id,
                recorded_at=None,
            )
        )

    # Build interpretation
    result = _build_interpretation(body.biomarker_ids, values, body.context)

    # Audit log
    _log_biomarker_event(
        db,
        actor,
        event="interpretation_requested",
        patient_id=patient_id,
        note=(
            f"biomarkers={','.join(body.biomarker_ids)} "
            f"confidence={result.confidence}"
        ),
    )

    return result
