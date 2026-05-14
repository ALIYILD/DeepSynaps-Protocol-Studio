# DeepSynaps Lab Biomarker Master Matrix

**Version:** 1.0.0 | **Total Biomarkers:** 118 | **Categories:** 6 | **Last Updated:** 2025-01-15

---

## Table of Contents

- [Category Summary](#category-summary)
- [Evidence & Clinical Status Legend](#legend)
- [Blood Labs (28)](#blood-labs)
- [Neuroinflammation (20)](#neuroinflammation)
- [Hormones (23)](#hormones)
- [Immune & Inflammation (14)](#immune--inflammation)
- [Nutritional & Metabolic (18)](#nutritional--metabolic)
- [Research Only (15)](#research-only)
- [Statistical Summary](#statistical-summary)

---

## Category Summary

| Category | Count | Clinical Status Distribution |
|----------|-------|------------------------------|
| Blood Labs | 28 | 28 routine_lab |
| Neuroinflammation | 20 | 5 specialist, 3 clinical_adjunct, 12 research_only |
| Hormones | 23 | 20 routine_lab, 3 clinical_adjunct |
| Immune & Inflammation | 14 | 11 routine_lab, 3 specialist |
| Nutritional & Metabolic | 18 | 5 routine_lab, 6 clinical_adjunct, 7 specialist/research |
| Research Only | 15 | 15 research_only |

---

## Legend

### Evidence Strength Grades

| Grade | Description |
|-------|-------------|
| **A** | Systematic review / meta-analysis / multiple RCTs / established clinical guidelines |
| **B** | Cohort studies / limited RCTs / clinical consensus / specialty guidelines |
| **C** | Case-control / cross-sectional / emerging evidence / expert opinion |
| **D** | Preclinical / theoretical / early discovery |

### Clinical Use Status

| Status | Description |
|--------|-------------|
| **routine_lab** | Standard of care, widely available, insurance-covered |
| **specialist** | Specialist or referral laboratory required |
| **clinical_adjunct** | Emerging clinical utility, not yet standard of care |
| **research_only** | Research context only, limited clinical availability |

---

## Blood Labs

### Complete Blood Count

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Hemoglobin | blood_labs | Hb, Hgb | g/dL | M: 13.5-17.5, F: 12.0-16.0 | Depression, Fatigue, Cognitive Impairment | B | routine_lab | N | Dehydration, pregnancy, altitude, smoking | Hemoglobin assesses oxygen-carrying capacity; low levels may contribute to fatigue and mood changes | Whole blood (EDTA) | No |
| Mean Corpuscular Volume | blood_labs | MCV | fL | 80-100 | Depression, Cognitive Impairment, B12/Folate Deficiency, Alcohol Use Disorder | B | routine_lab | N | Reticulocytosis, hyperlipidemia, cold agglutinins | MCV classifies anemia; low suggests iron deficiency, high suggests B12/folate deficiency or alcohol use | Whole blood (EDTA) | No |
| Mean Corpuscular Hemoglobin | blood_labs | MCH | pg | 27-33 | Iron Deficiency, Depression, Fatigue | B | routine_lab | N | Hemoglobinopathy, thalassemia, anemia of chronic disease | MCH reflects hemoglobin content per RBC; low values indicate iron deficiency contributing to fatigue | Whole blood (EDTA) | No |
| White Blood Cell Count | blood_labs | WBC | x10^9/L | 4.0-11.0 | Infection, Psychosis (NMDA), Autoimmune Encephalitis, Drug-induced leukopenia | B | routine_lab | N | Stress, infection, corticosteroids, race/ethnicity | WBC assesses immune status; abnormal values indicate infection, inflammation, or medication effects | Whole blood (EDTA) | No |
| Platelet Count | blood_labs | PLT | x10^9/L | 150-400 | Drug-induced thrombocytopenia, Inflammation | B | routine_lab | N | Platelet clumping, splenomegaly, active inflammation | Platelet count assesses clotting function; abnormal values indicate medication toxicity or marrow suppression | Whole blood (EDTA) | No |

### Iron Studies

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Ferritin | blood_labs | Ferritin, SF | ng/mL | M: 30-400, F: 15-150 | Depression, Restless Legs Syndrome, ADHD, Fatigue | B | routine_lab | N | Inflammation, acute phase reactant, liver disease, hemochromatosis | Ferritin provides supportive context for iron status; low ferritin associated with fatigue and restless legs | Serum | No |
| Serum Iron | blood_labs | SI, Fe | ug/dL | M: 60-170, F: 60-140 | Iron Deficiency Anemia, Fatigue, RLS, Depression | B | routine_lab | N | Diurnal variation, oral contraceptives, acute phase response | Serum iron reflects circulating iron and varies throughout the day; interpret with TIBC and ferritin | Serum | Yes |
| Total Iron Binding Capacity | blood_labs | TIBC | ug/dL | 250-400 | Iron Deficiency Anemia, Hemochromatosis, Fatigue | B | routine_lab | N | Pregnancy elevates, oral contraceptives, acute phase response | TIBC reflects transferrin levels; elevated TIBC suggests iron deficiency | Serum | No |

### Vitamins

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Vitamin B12 | blood_labs | B12, Cobalamin | pg/mL | 200-900 | Depression, Cognitive Impairment, Dementia, Neuropathy, Fatigue | B | routine_lab | N | Pregnancy, oral contraceptives, metformin, PPIs, vegan diet | B12 is essential for neurological function; low levels associated with depression, cognitive impairment, and neuropathy | Serum | No |
| Folate | blood_labs | Folate, B9 | ng/mL | 3.0-20.0 | Depression, Cognitive Impairment, Neural Tube Defects, Megaloblastic Anemia | B | routine_lab | N | Pregnancy elevates, alcohol lowers, anticonvulsants lower | Folate is essential for neurotransmitter synthesis; low folate associated with depression and cognitive impairment | Serum (RBC preferred) | No |
| Vitamin D (25-OH) | blood_labs | 25(OH)D | ng/mL | 30-100 | Depression, SAD, Cognitive Decline, Fatigue, Autoimmune | B | routine_lab | N | Seasonal variation, skin pigmentation, sunscreen, malabsorption, obesity | Vitamin D plays a role in neuroimmune regulation; low levels associated with depression and seasonal mood changes | Serum | No |

### Minerals

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Magnesium | blood_labs | Mg, Mg2+ | mg/dL | 1.7-2.2 | Depression, Anxiety, Insomnia, Migraine, Muscle cramps, Tremor | B | routine_lab | N | Diuretics, PPIs, alcoholism, chronic diarrhea, diabetes | Magnesium is essential for neuronal function and GABA regulation; low levels associated with anxiety, depression, and insomnia | Serum (RBC preferred) | No |
| Zinc | blood_labs | Zn, Zn2+ | ug/dL | 70-120 | Depression, ADHD, Anorexia Nervosa, Dysgeusia | B | routine_lab | N | Acute phase response, pregnancy, oral contraceptives, vegetarian diet | Zinc is a cofactor for neurotransmitter synthesis; low zinc associated with depression and ADHD | Serum | Yes |

### Liver Function

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Alanine Aminotransferase | blood_labs | ALT, SGPT | U/L | 7-56 | Hepatotoxicity, NAFLD, Metabolic Syndrome, Alcohol Use Disorder | B | routine_lab | N | Exercise, muscle injury, obesity, pregnancy | ALT assesses hepatocellular integrity; elevated levels may indicate medication-related liver effects | Serum | No |
| Aspartate Aminotransferase | blood_labs | AST, SGOT | U/L | 10-40 | Hepatotoxicity, Alcohol Use Disorder, Muscle injury, NAFLD | B | routine_lab | N | Muscle injury, strenuous exercise, hemolysis, AST/ALT ratio | AST assesses hepatocellular and muscle integrity; AST/ALT ratio helps distinguish alcohol-related liver disease | Serum | No |
| Alkaline Phosphatase | blood_labs | ALP, ALKP | U/L | 44-147 | Cholestasis, Biliary obstruction, Bone disorders, Liver disease | B | routine_lab | N | Pregnancy elevates, bone growth, blood group B/O, age >50 | ALP assesses biliary and bone metabolism; elevated levels may indicate biliary obstruction or bone disease | Serum | No |
| Gamma-Glutamyl Transferase | blood_labs | GGT, gamma-GT | U/L | M: higher range, F: 9-48 | Alcohol Use Disorder, Hepatotoxicity, NAFLD, Biliary disease | B | routine_lab | N | Alcohol elevates, obesity elevates, smoking elevates, phenytoin | GGT is sensitive for alcohol use and biliary pathology; useful for medication safety monitoring | Serum | No |
| Bilirubin (Total) | blood_labs | TBIL, Bili | mg/dL | 0.1-1.2 | Gilbert Syndrome, Hemolysis, Hepatotoxicity, Biliary obstruction | B | routine_lab | N | Fasting elevates (Gilbert), hemolysis elevates, certain medications | Bilirubin assesses hepatobiliary function; mild isolated elevation may indicate benign Gilbert syndrome | Serum | No |

### Renal Function

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Creatinine | blood_labs | Cr, Creat | mg/dL | M: 0.7-1.3, F: 0.6-1.1 | Renal impairment, Medication dosing, Lithium monitoring, Dehydration | A | routine_lab | N | Muscle mass, meat consumption, age, amputations | Creatinine assesses kidney function and guides medication dosing for renally-cleared psychotropics | Serum | No |
| Estimated GFR | blood_labs | eGFR | mL/min/1.73m2 | >90 normal; 60-90 mildly reduced; <60 CKD | CKD, Medication dosing, Lithium nephrotoxicity, Hypertension | A | routine_lab | N | CKD-EPI 2021 race-free equation, muscle mass extremes, age | eGFR estimates kidney filtration function; reduced eGFR requires dose adjustment for renally-cleared medications | Calculated | No |
| Blood Urea Nitrogen | blood_labs | BUN, Urea | mg/dL | 7-20 | Dehydration, Renal impairment, High protein intake, GI bleeding | B | routine_lab | N | High protein diet, dehydration, liver disease lowers, corticosteroids | BUN reflects urea metabolism; elevated BUN:creatinine ratio may indicate dehydration | Serum | No |

### Glucose Metabolism

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Hemoglobin A1c | blood_labs | HbA1c, A1c | % | <5.7% normal; 5.7-6.4% prediabetes; >=6.5% diabetes | Diabetes, Metabolic Syndrome, Antipsychotic metabolic monitoring, Cognitive Impairment | A | routine_lab | N | Anemia affects accuracy, hemoglobinopathies, CKD elevates, pregnancy | HbA1c reflects 2-3 month average glucose; essential for metabolic monitoring with antipsychotics | Whole blood (EDTA) | No |
| Fasting Glucose | blood_labs | FBG, FPG | mg/dL | <100 normal; 100-125 prediabetes; >=126 diabetes | Diabetes, Metabolic Syndrome, Hypoglycemia, Antipsychotic monitoring | A | routine_lab | N | Recent illness, stress, corticosteroids, time since last meal | Fasting glucose assesses glycemic status; elevated levels indicate metabolic effects of psychiatric medications | Serum/plasma | Yes |
| Fasting Insulin | blood_labs | Fasting Insulin | uIU/mL | 2.6-24.9 (<12 optimal) | Insulin Resistance, Metabolic Syndrome, PCOS, Prediabetes | B | routine_lab | N | Time since last meal, obesity, acute illness | Fasting insulin identifies insulin resistance before glucose abnormalities appear | Serum | Yes |
| HOMA-IR | blood_labs | HOMA-IR | unitless | <2.5 normal; >=2.5 insulin resistant | Insulin Resistance, Metabolic Syndrome, T2DM risk, NAFLD | B | routine_lab | N | Population-specific cutoffs, BMI, age, assay variability | HOMA-IR is a calculated index of insulin resistance; values above 2.5 suggest insulin resistance | Calculated | Yes |

### Lipid Panel

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Total Cholesterol | blood_labs | TC | mg/dL | Desirable <200; High >=240 | Cardiovascular Risk, Metabolic Syndrome, Antipsychotic monitoring | A | routine_lab | N | Acute illness transiently lowers, pregnancy elevates, familial | Total cholesterol is a component of cardiovascular risk assessment; abnormal levels indicate metabolic effects | Serum | No |
| LDL Cholesterol | blood_labs | LDL-C, LDL | mg/dL | Optimal <100; Very high >=160 | Cardiovascular Risk, Atherosclerosis, Stroke Risk | A | routine_lab | N | Friedewald calculation inaccurate if TG>400, acute illness | LDL cholesterol is the primary target for cardiovascular risk reduction; elevated levels increase vascular risk | Serum | No |
| HDL Cholesterol | blood_labs | HDL-C, HDL | mg/dL | M: >40, F: >50 | Cardiovascular Risk, Metabolic Syndrome, Antipsychotic metabolic effects | A | routine_lab | N | Exercise elevates, alcohol elevates, smoking lowers, menopause | HDL is inversely associated with cardiovascular risk; low levels indicate metabolic syndrome | Serum | No |
| Triglycerides | blood_labs | TG, TRIG | mg/dL | <150 normal; >=500 very high | Metabolic Syndrome, Pancreatitis risk, NAFLD, Antipsychotic effects | A | routine_lab | N | Recent meal elevates, alcohol elevates, obesity, uncontrolled diabetes, estrogen | Triglycerides reflect lipid metabolism; elevated levels increase cardiovascular and pancreatitis risk | Serum | Yes |

---

## Neuroinflammation

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Neurofilament Light Chain | neuroinflammation | NfL, NFL | pg/mL | <15 age-dependent; higher thresholds for elderly | MS, Alzheimer Disease, ALS, TBI, Huntington, FTD, PD, Cognitive Decline | B | specialist | N | Age elevates, BMI affects, renal function affects, acute trauma | NfL is a marker of axonal injury; elevated levels indicate active neurodegeneration; increasingly used for disease monitoring | Serum (CSF available) | No |
| Glial Fibrillary Acidic Protein | neuroinflammation | GFAP | pg/mL | <120 age-dependent | Astrocyte Activation, TBI, Alzheimer Disease, MS, MDD | B | specialist | N | Age elevates, trauma elevates, sample hemolysis | GFAP reflects astrocyte activation and blood-brain barrier disruption; elevated in TBI and neurodegeneration | Serum | No |
| S100 Calcium-Binding Protein B | neuroinflammation | S100B | pg/mL | <100 | TBI, Blood-Brain Barrier Integrity, Mood Disorders, Schizophrenia | B | specialist | N | Exercise elevates, melanoma, sample handling, extracranial sources | S100B indicates blood-brain barrier disruption and astrocytic damage; elevated in acute brain injury and some psychiatric conditions | Serum | No |
| Total Tau | neuroinflammation | t-Tau, Tau | pg/mL | <300 (CSF) | Alzheimer Disease, CJD, TBI, FTD | B | specialist | N | Renal function (serum), age, trauma | Total tau reflects neuronal injury; elevated levels indicate active neurodegeneration; CSF established, serum emerging | CSF (serum emerging) | No |
| Phosphorylated Tau (p-tau181) | neuroinflammation | p-Tau181 | pg/mL | <25 assay-dependent | Alzheimer Disease, MCI, AD vs. other dementia | B | specialist | N | Age mildly elevates, renal function, assay variability | p-Tau181 is specific for AD pathology; elevated levels strongly suggest Alzheimer-related neurodegeneration | Plasma or CSF | No |
| Phosphorylated Tau (p-tau217) | neuroinflammation | p-Tau217 | pg/mL | <0.4 assay-dependent | Alzheimer Disease, Preclinical AD, MCI, AD risk stratification | B | clinical_adjunct | N | Age, kidney function, assay platform | p-Tau217 demonstrates high accuracy for detecting AD pathology; emerging clinical utility for early detection | Plasma | No |
| Phosphorylated Tau (p-tau231) | neuroinflammation | p-Tau231 | pg/mL | <15 emerging | Alzheimer Disease, Preclinical AD, MCI differentiation | C | research_only | Y | Age, assay variability, limited availability | p-Tau231 is an emerging phosphorylated tau biomarker that may detect AD pathology earlier than p-tau181 | Plasma or CSF | No |
| Beta-Amyloid 42/40 Ratio | neuroinflammation | Ab42/40 | ratio | 0.07-0.15; lower ratio indicates amyloid pathology | Alzheimer Disease, MCI, Preclinical AD, Cerebral Amyloid Angiopathy | B | clinical_adjunct | N | Age mildly affects, assay platform, sample handling | A decreased Ab42/40 ratio indicates amyloid pathology characteristic of Alzheimer disease | Plasma or CSF | No |
| Myelin Basic Protein | neuroinflammation | MBP | pg/mL | <200 (CSF) | Multiple Sclerosis, Demyelinating Disease, TBI, White Matter Injury | C | specialist | N | CSF-specific, limited serum availability, active demyelination elevates | MBP reflects myelin integrity; elevated levels indicate active myelin breakdown in demyelinating disorders | CSF (serum limited) | No |
| YKL-40 | neuroinflammation | YKL-40, CHI3L1 | pg/mL | Wide range age-dependent | Astrocytosis, Alzheimer Disease, Glioblastoma, Bipolar Disorder | C | research_only | Y | Age elevates, peripheral inflammation elevates, glioma, trauma | YKL-40 is a marker of astrocytic activation and neuroinflammation; currently primarily a research biomarker | CSF or Serum | No |
| Complement C3 | neuroinflammation | C3 | mg/dL | 83-193 | Autoimmune Encephalitis, Neuroinflammation, Infection | C | specialist | N | Acute phase reactant, age affects, complement consumption | Complement C3 participates in neuroinflammatory pathways; altered levels may indicate complement-mediated neuroinflammation | Serum | No |
| Complement C4 | neuroinflammation | C4 | mg/dL | 15-57 | Autoimmune Encephalitis, SLE with CNS involvement, Complement deficiency | C | specialist | N | Acute phase reactant, C4 null alleles common, consumptive in active disease | Complement C4 is part of the classical pathway; low levels may indicate complement consumption in autoimmune CNS disease | Serum | No |
| Soluble TREM2 | neuroinflammation | sTREM2 | pg/mL | <5000 assay-dependent | Alzheimer Disease, Microglial Activation, FTD | C | research_only | Y | CSF vs. serum differences, age, TREM2 R47H variant | sTREM2 is a marker of microglial activation; elevated in AD and other neurodegenerative conditions | CSF (serum emerging) | No |
| Monocyte Chemoattractant Protein-1 | neuroinflammation | MCP-1, CCL2 | pg/mL | <300 (wide variability) | Neuroinflammation, HIV-associated neurocognitive disorder, MS, Depression | C | research_only | Y | Peripheral inflammation, obesity, age, cardiovascular disease | MCP-1 is involved in monocyte recruitment to the CNS; elevated levels suggest neuroinflammatory processes | CSF or Serum | No |
| Interleukin-6 (CNS) | neuroinflammation | IL-6 (CNS) | pg/mL | <5 (CSF) | Neuroinflammation, Depression, Cognitive Impairment, Autoimmune Encephalitis | C | research_only | Y | Blood-brain barrier integrity, peripheral contamination of CSF | CSF IL-6 reflects intrathecal inflammation; elevated levels indicate CNS-specific inflammatory processes | CSF | No |
| TNF-alpha (CNS) | neuroinflammation | TNF-alpha (CNS) | pg/mL | <5 (CSF; typically very low) | Neuroinflammation, Depression, MS, Autoimmune Encephalitis | C | research_only | Y | Blood-brain barrier, sample handling, assay sensitivity | CSF TNF-alpha indicates central neuroinflammatory activity; currently used primarily in research | CSF | No |
| Interleukin-1beta (CNS) | neuroinflammation | IL-1beta (CNS) | pg/mL | <2 (CSF; normally very low) | Neuroinflammation, Autoimmune Encephalitis, Meningoencephalitis, Depression | C | research_only | Y | Blood-brain barrier, sample handling (labile), assay sensitivity | CSF IL-1beta indicates innate immune activation in the CNS; primarily a research and specialized clinical marker | CSF | No |
| Interleukin-10 (CNS) | neuroinflammation | IL-10 (CNS) | pg/mL | <10 (CSF) | Neuroinflammation, Autoimmune Encephalitis, Regulatory immune response | C | research_only | Y | Blood-brain barrier, peripheral inflammation, sample handling | CSF IL-10 reflects anti-inflammatory regulatory responses in the CNS; balance with pro-inflammatory markers is key | CSF | No |
| CXCL13 | neuroinflammation | CXCL13, BCA-1 | pg/mL | <10 (CSF; very low in healthy) | Lyme Neuroborreliosis, Neurosyphilis, Autoimmune Encephalitis | B | specialist | N | Blood contamination of CSF, intrathecal synthesis vs. diffusion | CXCL13 is elevated in CNS infections and autoimmune conditions with B-cell involvement; highly sensitive for Lyme neuroborreliosis | CSF | No |
| Oligoclonal Bands | neuroinflammation | OCB, IgG Oligoclonal Bands | present/absent | Type 2 (CSF only) indicates intrathecal synthesis | Multiple Sclerosis, Neuroinflammation, CNS Infection, Autoimmune Encephalitis | A | specialist | N | Blood contamination causes false positive, age-related low-level bands | Oligoclonal bands indicate intrathecal IgG synthesis; two or more CSF-restricted bands support MS diagnosis | Paired CSF and Serum | No |

---

## Hormones

### Thyroid

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Thyroid Stimulating Hormone | hormones | TSH | mIU/L | 0.4-4.0 (some guidelines 0.4-3.0) | Depression, Bipolar Disorder, Cognitive Impairment, Fatigue, Hashimoto | A | routine_lab | N | Diurnal variation, biotin interference, pregnancy, age, psychiatric medications | TSH is the primary thyroid screening test; both hypo- and hyperthyroidism can present with psychiatric symptoms | Serum | No |
| Free Thyroxine | hormones | FT4, Free T4 | ng/dL | 0.8-1.8 | Hypothyroidism, Hyperthyroidism, Depression, Bipolar Disorder | A | routine_lab | N | Biotin interference, protein binding, pregnancy elevates TBG, medications | Free T4 measures biologically active thyroid hormone; essential for confirming thyroid dysfunction when TSH is abnormal | Serum | No |
| Free Triiodothyronine | hormones | FT3, Free T3 | pg/mL | 2.3-4.2 | Hyperthyroidism, T3 Toxicosis, Conversion issues, Euthyroid Sick Syndrome | B | routine_lab | N | Acute illness lowers (euthyroid sick), amiodarone, selenium deficiency | Free T3 is the biologically active thyroid hormone; some advocate T3 supplementation in refractory depression | Serum | No |
| Anti-Thyroid Peroxidase Antibodies | hormones | Anti-TPO, TPOAb | IU/mL | <34 negative | Hashimoto Thyroiditis, Subclinical Hypothyroidism, Depression, Postpartum Thyroiditis | B | routine_lab | N | Present in 10-15% of general population, titer does not correlate with severity | Anti-TPO antibodies indicate autoimmune thyroiditis; positive antibodies increase hypothyroidism risk and are associated with depression | Serum | No |
| Anti-Thyroglobulin Antibodies | hormones | Anti-Tg, TgAb | IU/mL | <40 assay-dependent | Hashimoto Thyroiditis, Graves Disease, Postpartum Thyroiditis | B | routine_lab | N | Less sensitive than anti-TPO, interferes with thyroglobulin measurement | Anti-thyroglobulin antibodies support autoimmune thyroiditis diagnosis; often measured with anti-TPO | Serum | No |

### Adrenal & Stress

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Morning Cortisol | hormones | Cortisol AM, 8am | ug/dL | 10-20 (8-9 AM peak) | Adrenal Insufficiency, Cushing Syndrome, Depression, PTSD, Chronic Fatigue | B | routine_lab | N | Diurnal rhythm essential, stress elevates, exogenous steroids suppress, pregnancy | Morning cortisol reflects peak HPA axis activity; low levels may indicate adrenal insufficiency; elevated patterns in depression | Serum | No |
| Evening Cortisol | hormones | Cortisol PM, 4pm | ug/dL | 3-10 (lower than AM) | HPA Axis Dysregulation, Cushing Syndrome, Insomnia, Depression, PTSD | B | routine_lab | N | Diurnal variation, stress elevates, shift work, meal timing | Evening cortisol assesses HPA axis diurnal rhythm; failure to suppress suggests HPA hyperactivity in depression | Serum | No |
| Salivary Cortisol | hormones | Salivary Cortisol | ng/mL | AM: 1-3, PM nadir <0.5 | HPA Axis Dysfunction, Cushing Syndrome, Chronic Stress, Depression, Insomnia | B | clinical_adjunct | N | Food/drink before collection, smoking elevates, blood contamination, stress | Salivary cortisol provides non-invasive assessment of HPA axis activity and diurnal rhythm; useful for monitoring stress response | Saliva | No |
| Dehydroepiandrosterone Sulfate | hormones | DHEA-S | ug/dL | M: 80-560, F: 35-430 (age-dependent) | Depression, Fatigue, Cognitive Decline, Adrenal Insufficiency, Aging | C | clinical_adjunct | N | Age declines after 30, DHEA supplements elevate, pregnancy, oral contraceptives | DHEA-S is the most abundant circulating adrenal steroid; low levels associated with depression and cognitive decline | Serum | No |

### Sex Hormones

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Testosterone (Male) | hormones | TT (M), Total T | ng/dL | 300-1000 (morning) | Depression, Fatigue, Low Libido, ED, Cognitive Decline, Hypogonadism | B | routine_lab | N | Diurnal variation (morning peak), age declines, obesity lowers, opioids lower | Testosterone in males affects mood, energy, cognition, and libido; low levels associated with depression and fatigue | Serum | No |
| Testosterone (Female) | hormones | TT (F) | ng/dL | 15-70 (much lower than male) | Low Libido, Fatigue, Depression, PCOS (elevated), HSDD | B | routine_lab | N | Menstrual cycle, oral contraceptives suppress, DHEA supplements, PCOS | Testosterone in females is important for mood, energy, and sexual function; both deficiency and excess affect mental health | Serum | No |
| Free Testosterone | hormones | FT, Free T | pg/mL | M: 9-30, F: 0.2-3.0 | Hypogonadism, Depression, Low Libido, SHBG Abnormalities, PCOS | B | routine_lab | N | SHBG levels (elevated SHBG lowers free T), obesity lowers SHBG, aging | Free testosterone is the biologically active fraction; more clinically relevant than total T when SHBG is abnormal | Serum | No |
| Estradiol (Premenopausal) | hormones | E2 (pre) | pg/mL | Follicular 30-100; Ovulatory 200-400; Luteal 70-300 | PMDD, Depression, Perimenopause, Fertility | B | routine_lab | N | Menstrual cycle phase critical, oral contraceptives suppress, pregnancy elevates | Estradiol in premenopausal women varies across the cycle; low levels may contribute to mood symptoms | Serum | No |
| Estradiol (Postmenopausal) | hormones | E2 (post) | pg/mL | <20-30 | Postmenopausal Depression, Cognitive Decline, Osteoporosis, Vasomotor Symptoms | B | routine_lab | N | Hormone therapy elevates, body fat produces estrone, time since menopause | Postmenopausal estradiol is typically low; low estrogen associated with mood changes and cognitive effects | Serum | No |
| Estradiol (Male) | hormones | E2 (M) | pg/mL | 10-40 | Gynecomastia, Hypogonadism, Obesity (elevated), Depression | C | routine_lab | N | Obesity elevates (adipose aromatase), aging, liver disease, testosterone therapy | Estradiol in males is produced via aromatization; imbalance between testosterone and estradiol affects mood and body composition | Serum | No |
| Progesterone | hormones | P4, Prog | ng/mL | Follicular <1; Luteal 5-25; Pregnancy much higher | PMDD, Perimenopause, Anxiety, Sleep Disturbance | C | clinical_adjunct | N | Menstrual cycle phase, pregnancy, progesterone supplementation | Progesterone has neuroactive metabolites that modulate GABA receptors; fluctuations contribute to PMDD and anxiety | Serum | No |
| Prolactin | hormones | PRL | ng/mL | M: 3-15, F: 4-23 | Antipsychotic Side Effects, Hypogonadism, Galactorrhea, Pituitary Adenoma | A | routine_lab | N | Stress, sleep, chest wall stimulation, dopamine antagonists, macroprolactin | Prolactin requires monitoring with dopamine-blocking medications; elevated levels cause sexual dysfunction and menstrual irregularities | Serum | No |
| Luteinizing Hormone | hormones | LH | mIU/mL | M: 1-10; F varies by cycle phase | Hypogonadism, PCOS, Menopause, Pituitary Dysfunction, Infertility | B | routine_lab | N | Menstrual cycle phase, menopause elevates, oral contraceptives suppress | LH assesses gonadal and pituitary function; elevated with primary gonadal failure; low with pituitary dysfunction | Serum | No |
| Follicle Stimulating Hormone | hormones | FSH | mIU/mL | M: 1-12; F varies by cycle phase; >25 menopause | Menopause, Hypogonadism, PCOS, Primary Ovarian Insufficiency | B | routine_lab | N | Menstrual cycle phase, menopause elevates, oral contraceptives suppress | FSH is essential for menopause confirmation and hypogonadism evaluation | Serum | No |

### Other Hormones

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Melatonin | hormones | MT, Melatonin | pg/mL | Daytime <10; Nighttime peak 50-200+ | Insomnia, Circadian Rhythm Disorders, Depression, SAD, Jet Lag | B | clinical_adjunct | N | Light exposure suppresses, age reduces, beta-blockers suppress, caffeine | Melatonin regulates sleep-wake cycles; low nighttime levels associated with insomnia and circadian disruption | Serum or Saliva | No |
| Insulin (Endocrine) | hormones | Insulin | uIU/mL | 2-19 (<12 optimal) | Insulin Resistance, Metabolic Syndrome, T2DM, PCOS | A | routine_lab | N | Time since last meal, obesity, acute illness | Insulin levels assess beta-cell function and insulin resistance; elevated fasting insulin precedes glucose abnormalities | Serum | Yes |
| C-Peptide | hormones | C-Peptide | ng/mL | 0.8-4.0 (fasting) | T1 vs T2 Diabetes, Insulinoma, Hypoglycemia, Beta-cell function | A | routine_lab | N | Not affected by exogenous insulin, renal function clears, insulin antibodies do not interfere | C-peptide indicates endogenous insulin production and distinguishes Type 1 from Type 2 diabetes | Serum | No |
| Sex Hormone Binding Globulin | hormones | SHBG | nmol/L | M: 10-57, F: 18-114 | PCOS (low), Hypogonadism, Thyroid dysfunction, Insulin Resistance | B | routine_lab | N | Estrogens elevate, androgens lower, insulin lowers, liver disease, thyroid | SHBG regulates hormone bioavailability; essential for calculated free testosterone interpretation | Serum | No |

---

## Immune & Inflammation

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| C-Reactive Protein | immune_inflammation | CRP | mg/L | <10 | Infection, Inflammation, Autoimmune Disease, Cardiovascular Risk, Depression | A | routine_lab | N | Acute infection elevates dramatically, obesity mildly elevates, smoking, estrogens | CRP is an acute phase reactant; markedly elevated suggests acute infection; mild elevation associated with depression and cardiovascular risk | Serum | No |
| High-Sensitivity CRP | immune_inflammation | hs-CRP | mg/L | <1.0 low risk; 1.0-3.0 moderate; >3.0 high risk | Cardiovascular Risk, Metabolic Syndrome, Depression, Inflammation, Atherosclerosis | A | routine_lab | N | Acute illness elevates, obesity, smoking, minor infections invalidate | hs-CRP measures low-grade inflammation; persistent elevation >3 mg/L indicates increased vascular and depression risk | Serum | No |
| Erythrocyte Sedimentation Rate | immune_inflammation | ESR, Sed Rate | mm/hr | M: 0-15, F: 0-20 (age-adjusted) | Autoimmune Disease, Infection, Temporal Arteritis, Polymyalgia Rheumatica | B | routine_lab | N | Age elevates, anemia elevates, pregnancy, obesity, hypofibrinogenemia lowers | ESR is a non-specific inflammation marker; useful for monitoring autoimmune conditions and screening for giant cell arteritis | Whole blood | No |
| Interleukin-6 | immune_inflammation | IL-6 | pg/mL | <7 | Systemic Inflammation, Depression, Autoimmune Disease, Cytokine Release Syndrome | B | specialist | N | Acute infection dramatically elevates, exercise transiently elevates, obesity elevates baseline | IL-6 is a key pro-inflammatory cytokine elevated in depression and autoimmune disease; central to cytokine theory of depression | Serum/Plasma | No |
| TNF-alpha | immune_inflammation | TNF-alpha | pg/mL | <8 | Autoimmune Disease, Depression, Chronic Inflammation, Psoriasis, IBD, RA | B | specialist | N | Acute infection, exercise transiently elevates, TNF inhibitors affect measurement | TNF-alpha is a master pro-inflammatory cytokine elevated in autoimmune diseases and associated with depression | Serum/Plasma | No |
| Interleukin-1beta | immune_inflammation | IL-1beta | pg/mL | <5 (very low normally) | Autoimmune Disease, Inflammasome Activation, Depression, Gout, Neuroinflammation | C | specialist | N | Extremely labile, sample handling critical, circadian variation, acute illness | IL-1beta indicates innate immune activation and NLRP3 inflammasome activity; associated with depression and neuroinflammation | Serum/Plasma | No |
| Interleukin-10 | immune_inflammation | IL-10 | pg/mL | <10 | Immune Regulation, Autoimmune Disease, Chronic Inflammation, Depression | C | specialist | N | Compensatory elevation with inflammation, sample handling, assay variability | IL-10 is a key anti-inflammatory cytokine; low IL-10 relative to IL-6/TNF suggests inadequate regulatory response | Serum/Plasma | No |
| Interleukin-8 | immune_inflammation | IL-8, CXCL8 | pg/mL | <20 | Acute Inflammation, Infection, Depression, Bipolar, Schizophrenia | C | specialist | N | Acute infection dramatically elevates, tissue injury, sample handling | IL-8 is a neutrophil chemoattractant elevated in acute inflammation; research suggests elevation in some psychiatric conditions | Serum/Plasma | No |
| Interferon-gamma | immune_inflammation | IFN-gamma | pg/mL | <10 | Th1 Immunity, Autoimmune Disease, Chronic Infection, Treatment-Resistant Depression | C | specialist | N | Acute viral infection elevates, autoimmune disease elevates, assay variability | IFN-gamma is a Th1 cytokine; IFN-gamma-mediated inflammation is associated with depression and autoimmune conditions | Serum/Plasma | No |
| Antinuclear Antibodies | immune_inflammation | ANA | titer | <1:40 or <1:80 negative | SLE, Autoimmune Thyroiditis, Sjogren, Autoimmune Encephalitis, Drug-Induced Lupus | A | routine_lab | N | Low titer positive in 5-20% healthy, age increases prevalence, medications, infection | ANA screens for autoimmune conditions presenting with psychiatric symptoms; low-titer positives are common and not diagnostic | Serum | No |
| Anti-dsDNA Antibodies | immune_inflammation | Anti-dsDNA | IU/mL | <100 negative | Systemic Lupus Erythematosus, Lupus Nephritis, Neuropsychiatric Lupus | A | routine_lab | N | Drug-induced lupus rarely positive, titer correlates with activity | Anti-dsDNA is highly specific for SLE; positive results support SLE diagnosis including neuropsychiatric manifestations | Serum | No |
| ENA Panel | immune_inflammation | ENA Panel | qualitative | All negative | Mixed Connective Tissue Disease, Sjogren, Systemic Sclerosis, Polymyositis, SLE | A | routine_lab | N | Tests ordered based on ANA pattern, individual antibody specificity varies | ENA panel identifies specific autoantibodies to subtype autoimmune conditions with neuropsychiatric features | Serum | No |
| Rheumatoid Factor | immune_inflammation | RF | IU/mL | <14 | Rheumatoid Arthritis, Sjogren, Chronic Infection, Autoimmune Disease | A | routine_lab | N | Positive in 5-10% healthy elderly, chronic infections, other autoimmune diseases | RF screens for rheumatoid arthritis; low-titer positivity is non-specific; high titers are more significant | Serum | No |
| Anti-Cyclic Citrullinated Peptide | immune_inflammation | Anti-CCP, ACPA | U/mL | <20 negative; >=40 moderate-strong positive | Rheumatoid Arthritis, Inflammatory Arthritis, Early RA Detection | A | routine_lab | N | More specific than RF, can precede RA by years, smoking increases risk | Anti-CCP is highly specific for RA and often present before symptoms; strongly positive results predict erosive disease | Serum | No |

---

## Nutritional & Metabolic

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| Homocysteine | nutritional_metabolic | Hcy | umol/L | 5-15 (optimal <10) | Depression, Cognitive Impairment, Dementia Risk, CVD, B12/Folate Deficiency | B | routine_lab | N | B12/folate status, kidney function, MTHFR polymorphism, smoking, age | Homocysteine is neurotoxic and elevated in B12/folate deficiency; high levels associated with depression and cognitive decline | Plasma | Yes |
| Omega-3 Index | nutritional_metabolic | O3I, EPA+DHA | % | Target >=8% (most adults <4%) | Depression, Bipolar, ADHD, Cardiovascular Risk, Cognitive Decline | B | clinical_adjunct | N | Fish intake, supplementation, omega-6 intake, genetics | Omega-3 Index reflects RBC EPA+DHA content; levels below 4% associated with depression and cardiovascular risk | RBC | No |
| Vitamin B6 (Pyridoxal Phosphate) | nutritional_metabolic | B6, PLP | ng/mL | 5-50 (PLP) | Depression, Peripheral Neuropathy, Homocysteine, Carpal Tunnel | C | routine_lab | N | Isoniazid depletes, oral contraceptives increase need, alcoholism | Vitamin B6 is a cofactor for neurotransmitter synthesis; deficiency contributes to depression and neuropathy | Serum | No |
| Vitamin B1 (Thiamine) | nutritional_metabolic | B1, Thiamine | nmol/L | 70-180 (whole blood TPP) | Wernicke Encephalopathy, Korsakoff Syndrome, Alcohol Use Disorder, Beriberi | B | routine_lab | N | Alcoholism depletes, diuretics deplete, dialysis, bariatric surgery, malabsorption | Thiamine is essential for brain energy metabolism; deficiency causes Wernicke-Korsakoff syndrome in alcohol use disorder | Whole blood | No |
| Vitamin B3 (Niacin) | nutritional_metabolic | B3, Niacin | ug/dL | 2.5-8.0 | Pellagra, Depression, Psychosis (3 Ds with dermatitis, diarrhea, dementia) | C | clinical_adjunct | N | Tryptophan conversion, Hartnup disease, carcinoid syndrome depletes | Niacin deficiency causes pellagra with neuropsychiatric symptoms including depression and psychosis | Serum | No |
| Vitamin E | nutritional_metabolic | Vitamin E, alpha-Tocopherol | mg/L | 5.5-18 | Neuropathy, Myopathy, Cognitive Decline, Fat Malabsorption | C | clinical_adjunct | N | Total lipid levels, fat malabsorption, prematurity, alpha-TTP variants | Vitamin E is a lipid-soluble antioxidant; deficiency causes neuropathy and myopathy in fat malabsorption | Serum | No |
| Vitamin K | nutritional_metabolic | Vitamin K, Phylloquinone | ng/mL | 0.1-2.2 | Coagulopathy, Osteoporosis, Vascular Calcification, Cognitive Decline (emerging) | C | clinical_adjunct | N | Warfarin affects, antibiotics deplete, fat malabsorption | Vitamin K is essential for coagulation and bone health; emerging research suggests roles in brain health | Serum | No |
| Selenium | nutritional_metabolic | Se | ug/L | 70-150 | Depression, Thyroid Dysfunction, Cognitive Decline, Immune Dysfunction | C | clinical_adjunct | N | Soil content varies geographically, dialysis depletes, supplementation elevates | Selenium is essential for thyroid hormone conversion and antioxidant defense; deficiency associated with depression | Serum/Plasma | No |
| Copper | nutritional_metabolic | Cu | ug/dL | 70-140 | Wilson Disease, Menkes, Copper Deficiency (myeloneuropathy), Anemia | B | routine_lab | N | Oral contraceptives elevate, pregnancy elevates, inflammation elevates, zinc excess depletes | Copper is essential for dopamine metabolism; both deficiency and excess (Wilson disease) are clinically relevant | Serum | No |
| Manganese | nutritional_metabolic | Mn | ug/L | 4-15 (whole blood) | Manganism (toxicity), Parkinsonism, Cognitive Impairment | C | clinical_adjunct | N | TPN affects, iron status affects absorption, hepatobiliary dysfunction, welding exposure | Manganese is essential but neurotoxic in excess; chronic elevation causes manganism with parkinsonian features | Whole blood/RBC | No |
| Coenzyme Q10 | nutritional_metabolic | CoQ10, Ubiquinone | ug/mL | 0.5-1.7 (age-dependent) | Statin-Induced Myopathy, Fatigue, Migraine, Depression, CVD | B | clinical_adjunct | N | Statin therapy depletes, age lowers, absorption varies | CoQ10 is essential for mitochondrial ATP production; depleted by statins and associated with fatigue and myopathy | Serum/Plasma | No |
| Glutathione | nutritional_metabolic | GSH, Reduced GSH | umol/L | 300-700 (whole blood GSH:GSSG ratio) | Oxidative Stress, Depression, Neurodegeneration, Detoxification, Aging | C | clinical_adjunct | N | Sample handling critical (oxidizes easily), dietary intake, NAC elevates, age declines | Glutathione is the master intracellular antioxidant; low levels indicate oxidative stress and are associated with depression | Whole blood | No |
| Malondialdehyde | nutritional_metabolic | MDA | umol/L | <2.0 (varies by assay) | Oxidative Stress, Depression, Bipolar, Schizophrenia, Neurodegeneration | C | research_only | Y | Sample handling sensitive, dietary lipid peroxidation products, storage | MDA is a marker of lipid peroxidation; elevated in psychiatric conditions with oxidative stress features | Plasma/Serum | No |
| 8-Hydroxy-2-deoxyguanosine | nutritional_metabolic | 8-OHdG, 8-oxo-dG | ng/mg creatinine | <30 (urine) | Oxidative DNA Damage, Depression, Bipolar, Schizophrenia, Aging | C | research_only | Y | Renal function affects clearance, dietary intake, time of collection | 8-OHdG is a marker of oxidative DNA damage; elevated in psychiatric conditions with increased oxidative stress | Urine | No |
| Lactate | nutritional_metabolic | Lactate, Lactic Acid | mmol/L | 0.5-2.2 | Mitochondrial Dysfunction, Hypoperfusion, Sepsis, Metformin-associated, Valproate | B | routine_lab | N | Tourniquet time elevates, exercise elevates, sample glycolysis, metformin elevates | Lactate reflects tissue oxygenation and mitochondrial function; elevated levels indicate anaerobic metabolism | Plasma (fluoride tube) | No |
| Pyruvate | nutritional_metabolic | Pyruvate | mg/dL | 0.3-1.5 | Mitochondrial Disorders, Thiamine Deficiency, Lactic Acidosis | C | specialist | N | Extremely labile sample, exercise elevates, sample handling critical | Pyruvate assesses glycolytic and mitochondrial function; elevated lactate:pyruvate ratio suggests mitochondrial dysfunction | Plasma (special collection) | Yes |
| Ammonia | nutritional_metabolic | NH3, Ammonia | ug/dL | 15-45 | Hepatic Encephalopathy, Urea Cycle Disorders, Valproate Toxicity, Delirium | A | routine_lab | N | Tourniquet falsely elevates, exercise elevates, smoking elevates, must be on ice immediately | Ammonia is essential for altered mental status assessment; elevated ammonia causes confusion and encephalopathy | Plasma (EDTA, ice) | No |
| Lactate/Pyruvate Ratio | nutritional_metabolic | L:P Ratio | ratio | 10-20:1 normal; >20 suggests mitochondrial dysfunction | Mitochondrial Disorders, Oxidative Phosphorylation Defects, Thiamine Deficiency | C | specialist | N | Sample collection critical for both analytes, exercise before collection | Lactate:pyruvate ratio distinguishes mitochondrial dysfunction; elevated ratio suggests impaired oxidative phosphorylation | Calculated | Yes |

---

## Research Only

| Biomarker | Category | Abbreviation | Unit | Reference Range | Conditions | Evidence | Clinical Status | Research-Only | Key Confounders | Safe Clinical Wording | Sample Type | Fasting |
|-----------|----------|--------------|------|-----------------|------------|----------|----------------|---------------|-----------------|----------------------|-------------|---------|
| NfL (Research Context) | research_only | NfL, sNfL | pg/mL | Age-adjusted; <15 adults <50 | AD Research, MS Disease Activity, TBI Research, ALS Research, Neurodegeneration Trials | B | research_only | Y | Age elevates, renal function, BMI, assay standardization evolving | NfL enables large-scale neurodegeneration studies, clinical trial stratification, and population-level screening | Serum | No |
| p-Tau217 (Research) | research_only | p-Tau217 | pg/mL | Assay-specific; research grade | AD Research, Preclinical AD Detection, Clinical Trial Screening | B | research_only | Y | Assay platform-specific, age, kidney function | p-Tau217 is the most accurate plasma AD biomarker for research in preclinical detection and trial enrichment | Plasma | No |
| Beta-Amyloid (Research) | research_only | Ab, Amyloid | pg/mL | Ab42/40 ratio most informative | AD Research, Amyloid PET Correlation, Trial Enrichment, Preclinical AD | B | research_only | Y | Assay platform critical, pre-analytical handling, blood-brain barrier | Plasma amyloid measures are research tools for AD detection and trial enrichment | Plasma | No |
| sTREM2 (Research) | research_only | sTREM2 | pg/mL | <5000 assay-dependent | Microglial Activation Research, AD Immunotherapy Monitoring, FTD Research | C | research_only | Y | CSF primarily, TREM2 R47H variant, microglial state specificity | sTREM2 reflects microglial activation and is a target engagement biomarker for microglial-modulating therapies | CSF | No |
| Neurogranin | research_only | Ng, SNEN | pg/mL | <500 emerging (CSF) | Synaptic Degeneration, AD Research, Cognitive Decline, Neuroplasticity | C | research_only | Y | CSF-specific, assay variability, limited availability | Neurogranin is a postsynaptic protein reflecting synaptic degeneration; elevated in CSF in Alzheimer disease | CSF | No |
| SNAP-25 | research_only | SNAP-25 | pg/mL | Research only; no established ranges | Synaptic Function Research, AD, Schizophrenia Research | D | research_only | Y | Limited data, assay development stage, sample type dependent | SNAP-25 is a presynaptic protein involved in vesicle fusion; research explores its utility as a synaptic function biomarker | CSF or EVs | No |
| VILIP-1 | research_only | VILIP-1, VSNL1 | pg/mL | Research only; assay-specific | Neuronal Injury Research, AD, Calcium Signaling Research | D | research_only | Y | Limited availability, research assays only, limited normative data | VILIP-1 is a neuronal calcium sensor being investigated as a biomarker of neuronal injury in Alzheimer disease | CSF | No |
| Clusterin (ApoJ) | research_only | Clusterin, ApoJ, CLU | ug/mL | Research only | AD Research, Apolipoprotein Biology, Neuroprotection Research, Atherosclerosis | C | research_only | Y | Peripheral sources, age, assay variability, multiple isoforms | Clusterin is a chaperone protein involved in amyloid clearance; associated with AD risk in GWAS studies | Plasma or CSF | No |
| Alpha-Synuclein | research_only | alpha-Synuclein | pg/mL | Total decreases in PD; oligomeric increases | Parkinson Disease Research, Dementia with Lewy Bodies, MSA, Synucleinopathies | C | research_only | Y | RBC contamination, CSF total decreases while oligomeric increases, assay standardization | Alpha-synuclein is the pathological protein in PD and Lewy body dementia; CSF total levels decrease in synucleinopathies | CSF | No |
| DJ-1 | research_only | DJ-1, PARK7 | ng/mL | Research only | Parkinson Disease Research, Oxidative Stress Research, Parkinson Genetics | D | research_only | Y | RBC contamination, oxidative modifications, assay variability | DJ-1 is involved in oxidative stress response and rare genetic cause of PD; being investigated as oxidative stress biomarker | CSF | No |
| UCH-L1 | research_only | UCH-L1, PGP9.5 | ng/mL | Research only (TBI) | TBI Research, Neurodegeneration, Axonal Injury | D | research_only | Y | Peripheral expression, RBC sources, assay specificity | UCH-L1 is being investigated as a TBI biomarker alongside GFAP; research explores neuronal injury detection | Serum or CSF | No |
| FABP7 | research_only | FABP7, BLBP | pg/mL | Research only | Astrocyte Biology Research, Bipolar Disorder Research, Schizophrenia Research | D | research_only | Y | Limited data, assay availability, peripheral sources | FABP7 is a glial fatty acid binding protein; emerging research explores associations with bipolar and schizophrenia | CSF or Serum | No |
| Contactin-2 | research_only | Contactin-2, CNTN2, TAG-1 | pg/mL | Research only | Axonal Guidance Research, MS Pathology, Neurodevelopment Research | D | research_only | Y | Very limited data, research context only | Contactin-2 is an axonal adhesion molecule; early-stage research explores its role in MS and neurodevelopment | CSF or Serum | No |
| Cathepsin D | research_only | Cathepsin D, CTSD | ng/mL | Research only | Lysosomal Dysfunction Research, Alzheimer Disease, Neurodegeneration, FTD | D | research_only | Y | Lysosomal enzyme, peripheral sources, assay variability | Cathepsin D is a lysosomal protease implicated in protein degradation pathways relevant to neurodegeneration | CSF | No |
| P-tau/Ab42 Ratio (Research) | research_only | p-tau/Ab42 | ratio | Assay-specific; research context | AD Research, Clinical Trial Enrichment, Biomarker Panel Optimization | C | research_only | Y | Assay platform dependent, combination of two variable measures | The p-tau/Ab42 ratio combines tau pathology and amyloid markers into a single composite measure for AD research | Plasma or CSF | No |

---

## Statistical Summary

### Counts by Category

| Category | Count | Percentage |
|----------|-------|------------|
| Blood Labs | 28 | 23.7% |
| Neuroinflammation | 20 | 16.9% |
| Hormones | 23 | 19.5% |
| Immune & Inflammation | 14 | 11.9% |
| Nutritional & Metabolic | 18 | 15.3% |
| Research Only | 15 | 12.7% |
| **Total** | **118** | **100%** |

### Counts by Clinical Status

| Clinical Status | Count | Percentage |
|-----------------|-------|------------|
| routine_lab | 69 | 58.5% |
| specialist | 14 | 11.9% |
| clinical_adjunct | 10 | 8.5% |
| research_only | 25 | 21.2% |

### Counts by Evidence Grade

| Evidence Grade | Count | Percentage |
|----------------|-------|------------|
| A (Strongest) | 16 | 13.6% |
| B (Moderate) | 56 | 47.5% |
| C (Limited) | 34 | 28.8% |
| D (Emerging) | 12 | 10.2% |

### Counts by Fasting Requirement

| Fasting Required | Count | Percentage |
|------------------|-------|------------|
| Yes | 12 | 10.2% |
| No | 106 | 89.8% |

### Sex-Specific Reference Ranges

| Sex-Specific Ranges | Count | Percentage |
|---------------------|-------|------------|
| Yes | 18 | 15.3% |
| No | 100 | 84.7% |

---

## Evidence Reference Index

Key references cited across biomarker entries:

### Depression & Psychiatry
- Hidese S et al. 2022 (Ferritin & Depression)
- Lachner C et al. 2012 (B12, Folate & Depression)
- Calderon-Guzman D et al. 2022 (Folate & Neuropsychiatry)
- Serefko A et al. 2013 (Magnesium & Depression)
- Tarleton EK et al. 2017 (Magnesium Supplementation)
- Bottiglieri T et al. 2000 (Homocysteine & Depression)
- Miller AL 2003 (Methylation & Depression)
- Pariante CM, Lightman SL 2008 (HPA Axis & Depression)
- Felger JC et al. 2016 (Inflammation & Depression)
- Khandaker GM et al. 2014/2018 (Cytokines & Depression)
- Howren MB et al. 2009 (Depression & Inflammation)

### Neurodegeneration & Biomarkers
- Khalil M et al. 2018 (NfL in Neurology)
- Palmqvist S et al. 2020 (p-Tau217 in AD)
- Karikari TK et al. 2020 (p-Tau181)
- Schindler SE et al. 2019 (Ab42/40)
- Zetterberg H et al. 2019 (GFAP)
- Thompson AJ et al. 2018 (McDonald Criteria)

### Endocrinology
- Bunevicius R, Prange AJ 2006 (Thyroid & Psychiatric Disorders)
- Bhasin S et al. 2018 (Testosterone Guidelines)
- Molitch ME 2005 (Prolactin Guidelines)
- Davis SR et al. 2008 (Testosterone in Women)
- Garber JR et al. 2012 (Hypothyroidism Guidelines)

### Metabolic & Cardiovascular
- ACC/AHA 2018 (Cholesterol Guidelines)
- ADA Standards of Care 2024
- KDIGO 2024 (Kidney Disease Guidelines)
- Inker LA et al. 2021 (eGFR Race-Free Equation)
- Matthews DR et al. 1985 (HOMA-IR)

---

*This matrix is intended for clinical decision support and educational purposes. Biomarker interpretation should always occur within the context of the full clinical picture, patient history, and corroborating diagnostic findings. Reference ranges may vary by laboratory and assay methodology.*

*Copyright (c) 2025 DeepSynaps Protocol Studio*
