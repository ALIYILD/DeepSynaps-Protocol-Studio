# AI Safety & Governance for Pharmacogenomics (PGx) Platforms
## Comprehensive Research Report

**Version:** 1.0  
**Classification:** Research & Governance Framework  
**Scope:** Pharmacogenomic analysis, clinical decision-support, AI-mediated interpretation  
**Target Audience:** Platform architects, clinicians, bioinformaticians, compliance officers, AI safety reviewers  

---

## Table of Contents

1. [Pharmacogenomics Overclaiming Risks](#1-pharmacogenomics-overclaiming-risks)
2. [Ethnicity & Population Limitations](#2-ethnicity--population-limitations)
3. [Probabilistic Interpretation Framework](#3-probabilistic-interpretation-framework)
4. [Clinician & Pharmacist Oversight](#4-clinician--pharmacist-oversight)
5. [Uncertain Variants (VUS)](#5-uncertain-variants-vus)
6. [Evidence Limitations & Grading](#6-evidence-limitations--grading)
7. [Regulatory Landscape](#7-regulatory-landscape)
8. [Informed Consent for Genetics](#8-informed-consent-for-genetics)
9. [Safe Wording Templates](#9-safe-wording-templates)
10. [Governance Framework](#10-governance-framework)
11. [Decision-Support Principles](#11-decision-support-principles)
12. [Quality Assurance](#12-quality-assurance)

---

## 1. Pharmacogenomics Overclaiming Risks

### 1.1 Gene-Drug Interactions Are Probabilistic, Not Deterministic

The single most critical safety principle for any AI-powered pharmacogenomics platform is this: **genetic variants modify probabilities; they do not determine outcomes.** A CYP2D6 poor metabolizer genotype does not guarantee toxicity with codeine -- it increases the probability of adverse effects. An SLC6A4 long/long genotype does not guarantee SSRI response -- it shifts the likelihood.

| Principle | Correct Framing | Dangerous Overclaim |
|---|---|---|
| CYP2D6 PM + codeine | "Increased risk of morphine underexposure and reduced analgesia" | "Do not prescribe codeine" |
| HLA-B*57:01 + abacavir | "Significantly elevated risk of hypersensitivity reaction; testing recommended before initiation" | "Patient will have allergic reaction" |
| CYP2C19 PM + clopidogrel | "Reduced active metabolite formation; consider alternative antiplatelet" | "Clopidogrel will not work" |
| SLC6A4 s/s + SSRIs | "May have slower or reduced response; monitor closely" | "Will not respond to SSRIs" |
| CYP2D6 UM + nortriptyline | "May require higher dose to achieve therapeutic levels" | "Standard dose will cause toxicity" |
| HLA-B*15:02 + carbamazepine | "Elevated population risk of severe skin reaction; testing recommended in applicable populations" | "Patient will develop Stevens-Johnson syndrome" |
| TPMT low + thiopurines | "Increased risk of myelosuppression; dose reduction recommended" | "Will develop bone marrow failure" |
| CYP2C19 PM + diazepam | "Reduced clearance; monitor for excessive sedation" | "Diazepam is contraindicated" |

**Why this matters:** Deterministic language creates a false sense of certainty that may lead clinicians to either withhold beneficial treatments unnecessarily or prescribe with unwarranted confidence. AI systems must be explicitly programmed to use probabilistic language in every output. A patient labeled as a CYP2D6 poor metabolizer may still metabolize some CYP2D6 substrates adequately due to compensatory pathways, substrate-specific kinetics, and individual phenotypic variation.

### 1.2 Population vs. Individual Variability

Genetic associations are derived from population-level studies. When a study reports that "CYP2D6 poor metabolizers have 3x increased risk of side effects," this describes a group-level phenomenon. It does not mean that every individual poor metabolizer will experience those side effects.

The translation from population odds ratio to individual probability involves:

1. **Baseline risk** in the general population (e.g., 10% develop side effect X)
2. **Odds ratio** for the genotype (e.g., OR = 3.0)
3. **Absolute risk** for the genotype carrier: approximately 25-30% (not 100%)

Any AI system must clearly distinguish between population-level associations and individual predictions. The ecological fallacy -- applying group statistics to individuals -- is pervasive in pharmacogenomics and represents a critical AI safety concern.

### 1.3 Penetrance and Expressivity in Pharmacogenomics

| Concept | Definition | PGx Example |
|---|---|---|
| **Complete penetrance** | All individuals with genotype show phenotype | HLA-B*57:01 + abacavir (~50% still do not develop HSR) |
| **Incomplete penetrance** | Not all individuals with genotype show phenotype | CYP2D6 PM + codeine toxicity (~30-40% experience significant adverse effects) |
| **Variable expressivity** | Genotype produces different severity across individuals | CYP2C19 PM + clopidogrel (some have major events, others minor) |
| **Age-dependent penetrance** | Phenotype manifests differently at different ages | CYP enzymes in neonates vs. adults |
| **Sex-dependent expression** | Phenotype differs by biological sex | CYP3A4 activity is generally higher in females |

### 1.4 Environmental Factors Modulate Genetic Effects

Genetic predictions exist within a complex environmental context. The same genotype can produce markedly different phenotypic outcomes depending on:

| Environmental Factor | Impact on PGx Predictions | Magnitude of Effect |
|---|---|---|
| **Smoking** | CYP1A2 induction can override genetic predictions; heavy smokers may metabolize clozapine 2-3x faster regardless of genotype | Can change effective phenotype by one full category |
| **Diet** | Grapefruit juice (CYP3A4 inhibition), cruciferous vegetables (CYP1A2 induction), charred meat (CYP1A2 induction) | Variable; 20-50% change in clearance possible |
| **Alcohol** | Chronic use induces CYP2E1; acute use inhibits CYP2C19 | Moderate; may shift phenotype one category |
| **Comorbidities** | Hepatic impairment reduces all CYP activity; renal impairment affects drug excretion independent of metabolism | Severe; may dominate genetic predictions |
| **Concomitant medications** | Drug-drug interactions often have larger magnitude effects than gene-drug interactions | Often 2-10x larger effect than genetic variation |
| **Age** | CYP enzyme activity changes across lifespan; neonates and elderly have reduced clearance | Neonates may have 30-50% adult activity |
| **Weight/BMI** | Distribution volume changes affect concentration profiles | Affects loading doses and steady-state concentrations |
| **Pregnancy** | Increased CYP3A4, CYP2D6, CYP2C9 activity; decreased CYP1A2, CYP2C19 activity | May shift effective phenotype by one category |
| **Physical activity** | Can alter hepatic blood flow and enzyme expression | Minor to moderate |
| **Time of day** | Circadian regulation of some CYP enzymes | Minor; mostly research interest |
| **Gut microbiome** | Microbial metabolism affects drug bioavailability | Emerging area; may be significant for some drugs |
| **Inflammation/infection** | Cytokine-mediated downregulation of multiple CYP enzymes | Can reduce activity 20-50% acutely |

**Clinical implication:** A CYP2D6 extensive metabolizer who is also taking fluoxetine (strong CYP2D6 inhibitor) or bupropion will effectively function as a poor metabolizer. The drug-drug interaction overrides the genetic prediction. In some cases, the interaction effect is 5-10x larger than the genetic effect.

### 1.5 Polygenic vs. Single-Gene Effects

Most medication responses are polygenic. A single CYP2D6 variant rarely explains more than 10-30% of pharmacokinetic variability. Other genes, transporters, receptors, and downstream signaling pathways all contribute.

| Drug Class | Primary Gene | Contributing Genes | Heritability Explained | Remaining Variance |
|---|---|---|---|---|
| Antidepressants (SSRIs) | SLC6A4, CYP2D6 | HTR2A, GRIK4, BDNF, COMT, ABCB1, HTR1A, TPH2 | 20-40% | 60-80% environmental |
| Antipsychotics | CYP2D6, DRD2 | ANK3, HTR2A, CYP3A4, CYP1A2, HTR2C, LEP | 25-50% | 50-75% environmental |
| Mood stabilizers (lithium) | GADL1 (preliminary) | BDNF, IMPA2, SLC6A4 | 30-60% | 40-70% unknown |
| Mood stabilizers (valproate) | CYP2C9, CYP2C19 | GABA receptors, SCN channels, mitochondrial genes | 30-50% | 50-70% unknown |
| ADHD stimulants | CYP2D6 | ADRA2A, DAT1 (SLC6A3), NET (SLC6A2), DRD4 | 15-30% | 70-85% unknown |
| Opioids | CYP2D6, OPRM1 | COMT, ABCB1, DRD2, KCNJ6 | 30-50% | 50-70% unknown |
| Benzodiazepines | CYP3A4, CYP2C19 | GABA receptor subunits | 20-35% | 65-80% unknown |
| Anticonvulsants | CYP2C9, CYP2C19, SCN1A | HLA genes, ALDH genes | 30-50% | 50-70% unknown |

Focusing on a single gene gives an incomplete picture. AI systems should:
- Acknowledge polygenic architecture explicitly
- Quantify the proportion of variance explained when possible
- Present genetic findings as one piece of a multi-factorial puzzle
- Report pharmacodynamic genes alongside pharmacokinetic genes
- Recognize that for many medications, the "missing heritability" dwarfs the genetic contribution

### 1.6 The "Genetic Determinism" Fallacy

Genetic determinism -- the belief that genotype rigidly determines phenotype -- is the most dangerous conceptual error in pharmacogenomics. Evidence demonstrates:

- **Incomplete penetrance:** Many pathogenic variants never manifest clinically
- **Variable expressivity:** The same variant produces different severity across individuals
- **Epistasis:** Gene-gene interactions modify individual effects (e.g., CYP2D6 poor metabolizer who is also CYP3A4 poor metabolizer may have unexpectedly different phenotypes)
- **Genotype-phenotype discordance:** CYP enzyme activity assays (phenotyping) frequently disagree with genotype predictions due to copy number variations, rare alleles, regulatory variants, and environmental factors
- **Copy number variation:** CYP2D6 can exist in 0-13 copies, dramatically affecting activity beyond what single SNP testing reveals
- **Rare and novel variants:** Standard panels test only known star alleles; rare variants may dramatically alter function

**AI safety requirement:** Every pharmacogenomic output must include a disclaimer that genetic findings are probabilistic modifiers of risk, not deterministic predictors of outcome.

### 1.7 The "Precision Medicine" Overclaim

The marketing of pharmacogenomics as "precision medicine" creates unrealistic expectations:

| Overclaim | Reality |
|---|---|
| "Personalized medicine" | Testing predicts population-level probabilities, not individual outcomes |
| "Right drug, right dose, first time" | Testing may improve odds but cannot guarantee optimal outcomes |
| "Eliminates trial and error" | Significant trial and error often still required |
| "Predicts who will respond" | Predicts modified probability of response, not response itself |
| "Prevents all side effects" | Predicts increased risk for some side effects; many side effects are not genetically predicted |
| "Replaces clinical judgment" | Provides one data point among many; clinical judgment remains essential |

### 1.8 How to Present Uncertainty Honestly

| Element | Recommended Approach | Example |
|---|---|---|
| Point estimates | Always pair with confidence intervals | "OR = 2.3 (95% CI: 1.4-3.8)" |
| Risk language | Use "may increase risk" rather than "causes" or "predicts" | "May increase the risk of..." |
| Effect sizes | Report absolute risk differences, not just relative risks | "Risk increases from 5% to 11% (absolute increase: 6%)" |
| Evidence strength | Grade every claim (A/B/C/D/R) | "Evidence Grade: B (Moderate)" |
| Population applicability | Always specify the studied population | "Evidence primarily from European populations" |
| Limitations | List known limitations explicitly | "Does not account for drug-drug interactions" |
| Confidence calibration | Match language certainty to evidence grade | Grade A: "Evidence supports"; Grade C: "Some evidence suggests" |
| Null findings | Report negative results transparently | "This variant was NOT associated with response in meta-analysis (p=0.45)" |

### 1.9 AI-Specific Overclaiming Risks

AI systems face unique overclaiming risks beyond general pharmacogenomics:

| Risk | Description | Mitigation |
|---|---|---|
| **Algorithmic certainty** | ML models output confidence scores that may appear more certain than warranted | Always pair predictions with uncertainty quantification; use Bayesian approaches |
| **Training data bias** | Models trained on biased data reproduce and amplify biases | Audit training data for population representation; test on diverse cohorts |
| **Black box interpretations** | AI may "hallucinate" gene-drug associations not supported by evidence | Constrain outputs to evidence-backed claims only; citation requirements |
| **Overfitting** | Models may perform well on training data but fail in real-world diverse populations | Extensive external validation; ongoing performance monitoring |
| **Automation bias** | Clinicians may defer to AI recommendations without critical evaluation | Design system to require active clinician engagement; never auto-approve |
| **Presentation bias** | Visual hierarchy may inadvertently emphasize weaker evidence | Standardized evidence presentation; research findings visually de-emphasized |

---

## 2. Ethnicity & Population Limitations

### 2.1 The European Bias in Pharmacogenomics

The overwhelming majority of pharmacogenomic discovery studies have been conducted in populations of European ancestry. This creates systematic biases:

- **~80%** of genome-wide association studies (GWAS) participants are of European descent
- **~78%** of CPIC guideline evidence derives primarily from European populations
- Many pharmacogenetic variants have **different frequencies** across populations
- Some clinically important variants are **population-specific** (e.g., HLA-B*15:02)
- **Copy number variation** detection and interpretation varies across populations
- **Linkage disequilibrium patterns** differ, meaning tag SNPs may not capture the same variation

This bias means that pharmacogenomic predictions may be less accurate, less applicable, or completely irrelevant for non-European populations. An AI system that ignores this limitation is providing clinically suboptimal and potentially harmful care.

### 2.2 Allele Frequency Differences Across Populations

| Gene/Variant | European Freq | East Asian Freq | African Freq | South Asian Freq | Latino Freq | Clinical Relevance |
|---|---|---|---|---|---|---|
| **CYP2D6*3** (non-functional) | 1-2% | 0% | 0% | 0% | 0-1% | European-specific non-functional |
| **CYP2D6*4** (non-functional) | 12-21% | 0-1% | 2-6% | 5-8% | 5-8% | Major PM allele in Europeans; absent in East Asians |
| **CYP2D6*5** (gene deletion) | 2-6% | 4-6% | 4-8% | 3-5% | 3-5% | Similar across populations |
| **CYP2D6*6** (non-functional) | 1-2% | 0% | 0% | 0% | 0-1% | European-specific |
| **CYP2D6*9** (reduced function) | 1-2% | 0% | 0% | 0% | 0% | European-specific reduced-function |
| **CYP2D6*10** (reduced function) | 1-2% | 50-70% | 3-6% | 20-30% | 5-10% | Major IM allele in East/South Asians |
| **CYP2D6*14** (non-functional) | 0% | 0% | 0% | 0% | 0% | Japanese-specific |
| **CYP2D6*17** (reduced function) | 0% | 0% | 15-25% | 0% | 0% | African-specific reduced-function allele |
| **CYP2D6*29** (reduced function) | 0% | 0% | 5-10% | 0% | 0% | African-specific |
| **CYP2D6*41** (reduced function) | 5-10% | 0% | 5-8% | 3-5% | 3-5% | Reduced function; European/African |
| **CYP2D6xN** (duplication/multiplication) | 1-5% | 0-1% | 2-5% | 1-3% | 2-4% | Ultrarapid metabolizer cause; varies |
| **CYP2C19*2** (reduced function) | 12-15% | 29-35% | 13-17% | 28-33% | 15-20% | Higher PM rate in East/South Asians |
| **CYP2C19*3** (reduced function) | 0-1% | 7-10% | 0-1% | 5-8% | 1-2% | Major PM allele in East Asians |
| **CYP2C19*4** (non-functional) | 0% | 0% | 0% | 0% | 0% | Rare; Asian-specific |
| **CYP2C19*8** (reduced function) | 0% | 0% | 0-1% | 0% | 0% | African-specific |
| **CYP2C19*17** (increased function) | 18-25% | 3-5% | 15-20% | 15-20% | 15-20% | UM phenotype; varies 5-fold across populations |
| **CYP2C9*2** (reduced function) | 8-12% | 0% | 0-1% | 3-5% | 2-4% | Major reduced-function allele in Europeans |
| **CYP2C9*3** (reduced function) | 5-8% | 2-4% | 0-1% | 4-6% | 2-3% | Affects warfarin, phenytoin |
| **CYP2C9*5** (reduced function) | 0% | 0% | 2-3% | 0% | 0% | African-specific |
| **CYP2C9*8** (reduced function) | 0% | 0% | 2-4% | 0% | 0% | African-specific |
| **CYP2C9*11** (reduced function) | 0-1% | 0% | 2-3% | 1-2% | 0-1% | African/Latino |
| **CYP3A4*2** (reduced function) | 0% | 0% | 0% | 0% | 0% | Rare European |
| **CYP3A4*22** (reduced function) | 3-8% | 0% | 0% | 0% | 0% | European-specific; affects statins |
| **CYP3A5*3** (non-expressor) | 85-95% | 65-75% | 40-50% | 65-75% | 70-80% | "Extensive" metabolizers mostly African |
| **CYP3A5*6** (non-expressor) | 0% | 0% | 10-15% | 0% | 2-4% | African-specific |
| **CYP3A5*7** (non-expressor) | 0% | 0% | 5-10% | 0% | 0% | African-specific |
| **CYP1A2*1F** (-163C>A, increased) | 45-55% | 55-65% | 15-25% | 40-50% | 30-40% | Inducibility; varies across populations |
| **CYP2B6*6** (reduced function) | 10-20% | 15-25% | 25-40% | 15-25% | 15-20% | Efavirenz, methadone metabolism |
| **CYP2B6*18** (reduced function) | 0% | 0% | 5-10% | 0% | 0% | African-specific |
| **SLCO1B1*5 (rs4149056)** | 8-15% | 1-3% | 1-2% | 5-8% | 5-8% | Statin myopathy risk |
| **SLCO1B1*15** | 1-2% | 5-8% | 1-2% | 3-5% | 2-4% | East Asian-specific statin risk |
| **HLA-B*15:02** | <0.1% | 5-10% | 0% | 2-5% | 0% | Carbamazepine SJS/TEN; East/South Asian |
| **HLA-B*57:01** | 5-8% | 0-1% | 2-3% | 1-3% | 2-3% | Abacavir hypersensitivity |
| **HLA-A*31:01** | 2-5% | 5-10% | 2-4% | 5-8% | 3-5% | Carbamazepine hypersensitivity |
| **HLA-B*58:01** | 5-8% | 5-10% | 5-10% | 5-8% | 3-5% | Allopurinol hypersensitivity |
| **TPMT*2** (reduced) | 2-4% | 0-1% | 0-1% | 1-2% | 1-2% | Thiopurine toxicity |
| **TPMT*3A** (reduced) | 2-4% | 1-2% | 1-2% | 1-2% | 1-2% | Most common non-functional allele |
| **TPMT*3C** (reduced) | 0-1% | 1-3% | 2-4% | 1-3% | 1-2% | More common in Africans |
| **NAT2 slow acetylator** | 50-60% | 10-20% | 40-50% | 50-60% | 45-55% | Isoniazid toxicity |
| **G6PD variants** | 0-2% males | 5-20% males | 5-25% males | 2-10% males | 0-5% males | Dapsone, primaquine, rasburicase |
| **UGT1A1*28** | 30-40% | 0-1% | 15-25% | 10-20% | 20-30% | Irinotecan toxicity; atazanavir |
| **VKORC1** (-1639G>A) | 35-45% | 80-90% | 5-10% | 15-25% | 20-30% | Warfarin sensitivity; East Asian |
| **DPYD*2A (HapB3)** | 1-3% | 0-1% | 0% | 0-1% | 1-2% | Fluoropyrimidine toxicity |

### 2.3 Metabolizer Phenotype Prevalence by Population

#### CYP2D6 Metabolizer Status

| Population | Poor Metabolizer (PM) | Intermediate Metabolizer (IM) | Extensive Metabolizer (EM) | Ultrarapid Metabolizer (UM) |
|---|---|---|---|---|
| European (Caucasian) | 5-10% | 10-15% | 65-80% | 3-10% |
| East Asian (Chinese, Japanese, Korean) | 1-2% | 40-50% | 40-50% | 1-2% |
| Southeast Asian | 1-2% | 35-45% | 45-55% | 1-3% |
| South Asian (Indian, Pakistani) | 2-5% | 25-35% | 50-60% | 2-5% |
| African (Sub-Saharan) | 3-7% | 15-25% | 50-65% | 5-15% |
| African American | 3-5% | 15-20% | 60-70% | 3-8% |
| Middle Eastern | 1-3% | 15-25% | 55-70% | 5-15% |
| Latino/Hispanic | 3-6% | 15-25% | 60-70% | 3-8% |
| Oceanian | 0-1% | 15-25% | 55-70% | 5-15% |
| Ashkenazi Jewish | 5-10% | 10-15% | 65-75% | 3-8% |

#### CYP2C19 Metabolizer Status

| Population | Poor Metabolizer (PM) | Intermediate Metabolizer (IM) | Extensive Metabolizer (EM) | Ultrarapid Metabolizer (UM) |
|---|---|---|---|---|
| European | 2-5% | 15-20% | 60-70% | 15-25% |
| East Asian | 13-18% | 35-45% | 30-40% | 3-5% |
| Southeast Asian | 10-15% | 30-40% | 35-45% | 3-5% |
| South Asian | 8-15% | 30-40% | 35-45% | 5-10% |
| African | 4-8% | 15-25% | 55-65% | 10-20% |
| African American | 3-5% | 13-20% | 55-65% | 12-20% |
| Middle Eastern | 3-8% | 15-25% | 55-65% | 10-20% |
| Latino/Hispanic | 3-6% | 15-25% | 55-65% | 12-20% |
| Ashkenazi Jewish | 2-5% | 15-20% | 55-65% | 15-25% |

### 2.4 Population-Specific Clinical Considerations

| Scenario | Implication | Action Required |
|---|---|---|
| CYP2D6 testing in East Asians | *10 allele must be included; *4 is largely irrelevant; CNV testing critical | Use population-appropriate star allele panel |
| CYP2D6 testing in Africans | Must include *17 and *29; standard commercial panels miss major variants | Supplement with extended African allele panel |
| CYP2C19 testing in East Asians | *3 allele is critical; PM rate is 3-4x European | Always include *2, *3, *17 in panel |
| CYP2C19 testing in Africans | *8, *9 alleles may be relevant | Use expanded panel if available |
| CYP2C9 testing in Africans | *5, *8, *11 alleles significantly contribute to reduced function | Use expanded African panel for warfarin dosing |
| HLA-B*15:02 testing | Essential for East/South Asian patients before carbamazepine, oxcarbazepine, phenytoin | Must be ordered if patient of Asian ancestry |
| HLA-B*57:01 testing | Essential for all patients before abacavir; lower yield in East Asians but still required | Required regardless of ancestry |
| CYP3A5 testing | Most non-African patients are *3/*3 non-expressors | Reference allele matters; label "expressor" vs "non-expressor" |
| CYP2B6 testing in Africans | *6, *18 alleles at higher frequency | Important for efavirenz, methadone dosing |
| G6PD testing | Critical in African, Mediterranean, Asian males before dapsone, primaquine, rasburicase | Screen in all males from high-prevalence populations |
| VKORC1 testing for warfarin | -1639G>A frequency varies 10-fold; East Asian patients much more likely to be sensitive | Critical for Asian warfarin dosing |

### 2.5 Reference Population Bias

Most PGx algorithms are trained on reference populations, creating potential failures:

- **Rare variants in non-European populations** may be misclassified as benign
- **Population-specific haplotypes** may not be captured by standard panels
- **Copy number variations** (especially CYP2D6 gene deletions/duplications) detection varies by platform
- **Admixed individuals** may have ancestry-specific variants on only one haplotype
- **Structural variation** may be missed in populations not well-represented in reference genomes

**Example:** A patient of mixed African and European ancestry may carry CYP2D6*17 on the African haplotype and CYP2D6*4 on the European haplotype. Standard algorithms that call *4/*17 may underestimate activity because they don't account for the combined effect of these ancestry-specific alleles.

### 2.6 Ancestry-Specific Recommendations

**AI platform requirements:**
1. **Always ask/report patient ancestry/self-identified ethnicity**
2. **Flag when allele frequency data is unavailable for the patient's population**
3. **Use population-specific reference databases** (gnomAD, ALFA)
4. **Report the reference population** for every recommendation
5. **Highlight population-specific variants** (e.g., HLA-B*15:02 for Asian patients)
6. **Flag when standard panels may miss relevant variants** for the patient's ancestry
7. **Consider admixture** in reporting and interpretation
8. **Allow free-text ethnicity** in addition to pre-set categories
9. **Warn when evidence base is sparse** for patient's population
10. **Recommend expanded testing** when standard panels are insufficient

### 2.7 Labeling Population Limitations

Every pharmacogenomic finding must include population context:

> "This analysis is based on evidence primarily derived from populations of [European/East Asian/African/multi-ethnic] ancestry. The applicability of these findings to patients of [patient's] ancestry may be limited. Different allele frequencies, linkage disequilibrium patterns, and effect sizes may apply. CYP2D6 copy number variants and rare population-specific alleles may not be captured by this assay. The gene-drug interaction described may have different effect sizes or even different directions in populations not well-represented in the current evidence base. Clinical interpretation should consider the patient's specific ancestry and whether the tested variants are relevant in that population."

### 2.8 Population-Based Risk Stratification

| Drug | Gene/Variant | High-Risk Population | Risk Action |
|---|---|---|---|
| Carbamazepine | HLA-B*15:02 | Han Chinese, Thai, Indian | Mandatory testing before first dose |
| Carbamazepine | HLA-A*31:01 | European, Japanese | Testing recommended |
| Abacavir | HLA-B*57:01 | All populations | Mandatory testing before first dose |
| Allopurinol | HLA-B*58:01 | Han Chinese, Thai, Korean | Testing recommended |
| Phenytoin | HLA-B*15:02 | East/South Asian | Testing recommended |
| Codeine (pediatrics) | CYP2D6 UM | All (1-2% EA, 5-10% ME, 5-15% African) | Avoid in children; especially UM |
| Clopidogrel | CYP2C19 PM | East Asian (13-18%), South Asian (8-15%) | Higher PM rates; testing more valuable |
| Warfarin | CYP2C9 + VKORC1 | African (lower predictive value) | Algorithms less accurate in African ancestry |
| Efavirenz | CYP2B6 PM | African (higher *6 frequency) | More toxicity risk in African populations |
| Thiopurines | TPMT/NUDT15 low | East Asian (NUDT15) | NUDT15 testing important in East Asians |
| Fluoropyrimidines | DPYD deficient | European | Testing more validated in Europeans |

---

## 3. Probabilistic Interpretation Framework

### 3.1 Odds Ratios vs. Absolute Risk

The most common statistical error in pharmacogenomics communication is presenting odds ratios without baseline risk. A drug-gene association with OR = 2.0 sounds impressive but means very different things depending on baseline risk:

| Baseline Risk | Odds Ratio | Absolute Risk | Risk Difference | NNH | Clinical Significance |
|---|---|---|---|---|---|
| 0.1% | 2.0 | 0.2% | +0.1% | 1000 | Negligible |
| 0.5% | 2.0 | 1.0% | +0.5% | 200 | Low |
| 1% | 2.0 | 2% | +1% | 100 | Low-moderate |
| 2% | 2.0 | 4% | +2% | 50 | Moderate |
| 5% | 2.0 | 9.5% | +4.5% | 22 | Moderate |
| 10% | 2.0 | 18% | +8% | 13 | Substantial |
| 20% | 2.0 | 33% | +13% | 8 | High |
| 50% | 2.0 | 67% | +17% | 6 | Very high |

**AI requirement:** Always convert odds ratios to absolute risk differences when possible. Present both numbers. If baseline risk is unknown, state this explicitly.

### 3.2 Number Needed to Treat (NNT) and Number Needed to Harm (NNH)

| Gene-Drug Pair | Effect | NNT/NNH | Interpretation | Cost-Effectiveness |
|---|---|---|---|---|
| CYP2C19 PM + clopidogrel | Major CV event prevention | NNT ~200 to prevent one event with alternative | Weak pharmacogenetic indication; cost-effectiveness marginal | Expensive per event prevented |
| HLA-B*57:01 + abacavir | Hypersensitivity prevention | NNT ~15 to prevent one HSR | Strong pharmacogenetic indication | Highly cost-effective |
| CYP2D6 PM + codeine | Toxicity prevention (pediatric) | NNH ~50 for serious toxicity | Moderate indication; severity high when it occurs | Cost-effective given severity |
| TPMT low activity + thiopurines | Myelosuppression prevention | NNT ~10 to prevent one severe event | Strong indication | Highly cost-effective |
| HLA-B*15:02 + carbamazepine | SJS/TEN prevention | NNT ~1,000-2,000 to prevent one case | Moderate at population level; severe at individual level | Cost-effective given severity of SJS/TEN |
| CYP2C19 + PPIs | H. pylori eradication | NNT ~8 for improved eradication in PM | Moderate indication | May be cost-effective |
| CYP2D6 + tamoxifen | Breast cancer recurrence | NNT ~50-100 for PM on tamoxifen | Controversial; evidence mixed | Debated |
| SLCO1B1 + high-dose simvastatin | Myopathy prevention | NNT ~100-200 | Weak indication; monitoring may suffice | Questionable |
| DPYD + fluoropyrimidines | Severe toxicity prevention | NNT ~5-10 for reduced function carriers | Strong indication | Highly cost-effective |
| CYP3A5 + tacrolimus | Rejection prevention | NNT ~20-30 for expressors with adjusted dosing | Moderate indication | Cost-effective in transplant setting |

### 3.3 Confidence Intervals

Every point estimate must include confidence intervals. Wide CIs indicate uncertainty:

| Finding | Point Estimate | 95% CI | p-value | Interpretation |
|---|---|---|---|---|
| CYP2D6 PM: TCA side effects | HR = 2.5 | 1.8 - 3.4 | < 0.001 | Reliable; narrow CI; highly significant |
| SLC6A4 s/s: SSRI non-response | OR = 1.3 | 0.9 - 1.9 | 0.15 | Unreliable; crosses 1.0; not significant |
| HTR2A T/T: antipsychotic response | OR = 1.4 | 1.1 - 1.8 | 0.009 | Moderately reliable |
| COMT Val/Val: cognitive side effects | OR = 1.2 | 0.7 - 2.1 | 0.48 | Highly uncertain; not significant |
| CYP2C19 PM: clopidogrel MACE | HR = 1.5 | 1.2 - 1.9 | < 0.001 | Reliable; consistent meta-analyses |
| BDNF Val66Met: antidepressant response | OR = 1.1 | 0.95 - 1.3 | 0.20 | Not significant; likely no effect |
| HLA-B*57:01: abacavir HSR | LR+ = 100+ | Very high | < 0.0001 | Extremely reliable; nearly diagnostic |
| HLA-B*15:02: carbamazepine SJS/TEN | OR = 50-100 | Very wide | < 0.001 | Very strong but with wide CI due to rarity of outcome |
| FKBP5: antidepressant response | OR = 1.25 | 1.05 - 1.5 | 0.01 | Marginally significant |
| ABCB1: antidepressant response | OR = 1.0 | 0.85 - 1.2 | 0.90 | Null result; no effect |

**AI requirement:** Flag findings where the 95% CI crosses the null (1.0 for OR/HR). These are not statistically significant and must be labeled as uncertain. Flag findings with wide CIs (ratio of upper to lower bound > 4) as imprecise.

### 3.4 Bayesian Updating

Clinicians should update their prior probability of outcome based on genetic findings:

```
Posterior Odds = Prior Odds x Likelihood Ratio

Where: Prior Odds = Prior Probability / (1 - Prior Probability)
       Likelihood Ratio = Sensitivity / (1 - Specificity)
```

| Scenario | Prior Probability | Genetic LR | Posterior Probability | Clinical Impact |
|---|---|---|---|---|
| Clopidogrel failure (general) | 15% | CYP2C19 PM: LR = 2.5 | 31% | Moderate update; consider alternative |
| Abacavir HSR (HLA-B*57:01 negative) | 0.5% | Negative test: LR = 0.01 | 0.005% | Near exclusion of risk |
| Carbamazepine SJS (HLA-B*15:02 positive) | 0.1% | Positive test: LR = 50 | 4.8% | Major risk increase; avoid drug |
| Carbamazepine SJS (HLA-B*15:02 negative) | 0.1% | Negative test: LR = 0.5 | 0.05% | Partial reassurance; risk not zero |
| SSRI non-response (SLC6A4 s/s) | 30% | s/s genotype: LR = 1.2 | 34% | Minimal update; not clinically useful |
| Thiopurine myelosuppression (TPMT low) | 5% | Low activity: LR = 10 | 34% | Major update; mandatory dose reduction |
| Thiopurine myelosuppression (TPMT normal) | 5% | Normal activity: LR = 0.5 | 2.6% | Partial reassurance |
| Codeine toxicity in children (CYP2D6 UM) | 1% | UM genotype: LR = 5 | 4.8% | Significant update; avoid in pediatrics |

### 3.5 Prior Probability Matters

Rare outcomes require stronger evidence to change clinical management. A genetic variant with OR = 2.0 for an outcome that occurs in 0.1% of patients still leaves the patient with only 0.2% risk.

| Prior Risk | Genetic Modifier | Post-Test Risk | Decision Impact |
|---|---|---|---|
| Very rare (0.01%) | OR = 10 | 0.1% | Still extremely rare; testing may not change management |
| Rare (0.1%) | OR = 10 | 1% | May change management if severity is high |
| Low (1%) | OR = 3 | 3% | May inform monitoring intensity |
| Moderate (10%) | OR = 2 | 18% | Likely to influence clinical decision |
| High (30%) | OR = 1.5 | 39% | May influence decision but other factors likely dominate |

### 3.6 Communicating Uncertainty to Clinicians

| Evidence Level | Wording | Color Code | Visual Indicator |
|---|---|---|---|
| Strong (Grade A) | "Evidence strongly supports..." | Green | Solid green indicator |
| Moderate (Grade B) | "Evidence supports..." | Blue | Solid blue indicator |
| Optional (Grade C) | "Evidence suggests..." | Yellow | Yellow indicator |
| Insufficient (Grade D) | "Evidence is limited/inconclusive..." | Orange | Orange indicator |
| No evidence | "No evidence available..." | Gray | Gray indicator |
| Conflicting | "Evidence is conflicting..." | Red-Yellow | Striped red-yellow indicator |
| Research only | "Research-grade finding only..." | Purple | Purple indicator with "R" badge |

### 3.7 Uncertainty Communication Framework

The platform should implement a tiered uncertainty communication framework:

**Tier 1: Quantitative Uncertainty (when data permits)**
- "The risk of [outcome] in patients with this genotype is approximately [X%] (95% CI: [Y%-Z%]) compared to [baseline]% in the general population."

**Tier 2: Qualitative Uncertainty (when quantitative data is limited)**
- "This genotype is associated with [increased/decreased] [outcome]. The magnitude of effect is [small/moderate/large] based on [N] studies."

**Tier 3: Directional Uncertainty (when even qualitative evidence is limited)**
- "Limited evidence suggests this genotype may affect [outcome]. Clinical significance is uncertain."

**Tier 4: Complete Uncertainty**
- "No evidence is available regarding the effect of this genotype on [medication] response."

---

## 4. Clinician & Pharmacist Oversight

### 4.1 PGx Findings Are Supportive Context Only

**The fundamental governance principle:** Pharmacogenomic findings never replace clinical judgment. They provide one layer of information to integrate with the full clinical picture.

| Clinical Factor | Why It May Override Genetics | Magnitude |
|---|---|---|
| **Drug-drug interactions** | Fluoxetine + CYP2D6 EM = effective PM; phenobarbital + CYP2C19 IM = effective EM | Often larger than genetic effect |
| **Organ function** | Hepatic impairment reduces all CYP activity regardless of genotype | Can dominate in severe impairment |
| **Age** | Neonates and elderly have reduced CYP expression independent of genetics | 30-50% change possible |
| **Weight/BMI** | Affects volume of distribution and loading doses | Clinically significant |
| **Pregnancy** | Hormonal changes alter CYP expression patterns | May shift phenotype by one category |
| **Smoking status** | Induces CYP1A2; affects clozapine, olanzapine dosing | 50-100% change in clearance |
| **Alcohol use** | Induces CYP2E1; chronic use alters multiple enzymes | Moderate |
| **Diet** | Grapefruit (CYP3A4), cruciferous vegetables (CYP1A2) | 20-50% change |
| **Adherence** | The best pharmacogenomic prediction is irrelevant if the patient doesn't take the medication | Complete negation |
| **Comorbidities** | Renal failure, hepatic disease, cardiac failure all modify pharmacokinetics | Variable; often significant |
| **Inflammatory state** | Cytokines downregulate CYP enzymes | 20-50% reduction possible |
| **Genetic modifiers** | Other genes (transporters, receptors) modify the effect | May add or subtract |

### 4.2 Drug-Drug Interactions May Override Gene-Drug

| Genetic Status | Drug Interaction | Effective Phenotype | Clinical Example | Clinical Action |
|---|---|---|---|---|
| CYP2D6 Extensive | + Fluoxetine (strong inhibitor) | Poor metabolizer | May need dose reduction for CYP2D6 substrates | Reduce dose or use non-CYP2D6 alternative |
| CYP2D6 Extensive | + Paroxetine (strong inhibitor) | Poor metabolizer | Dramatic CYP2D6 inhibition | Avoid combination if possible |
| CYP2D6 Extensive | + Bupropion (inhibitor) | Intermediate/poor | Moderate CYP2D6 inhibition | Monitor or reduce dose |
| CYP2D6 Poor | + Bupropion (indirect effect) | Still poor | Additive risk; limited further effect | Minimal additional change needed |
| CYP2C19 Extensive | + Omeprazole (inhibitor) | Intermediate | Affects clopidogrel activation if both used | Avoid concurrent use |
| CYP2C19 Extensive | + Fluconazole (inhibitor) | Intermediate/poor | Moderate CYP2C19 inhibition | Dose reduction or monitoring |
| CYP2C19 Poor | + Fluconazole (inhibitor) | Still poor | Minimal additional effect | No additional action needed |
| CYP3A4 Extensive | + Ketoconazole (strong inhibitor) | Poor metabolizer | Major drug interaction | Avoid or major dose reduction |
| CYP3A4 Extensive | + Clarithromycin (inhibitor) | Poor metabolizer | Significant interaction | Dose reduction or alternative |
| CYP3A4 Poor | + Rifampin (strong inducer) | Extensive/UM | May overcome genetic limitation | Monitor for reduced efficacy |
| CYP1A2 Extensive | + Smoking (inducer) | Ultrarapid | May need dose increase for clozapine | Dose increase; TDM recommended |
| CYP1A2 Poor | + Ciprofloxacin (inhibitor) | Very poor | Double CYP1A2 inhibition | Avoid if possible; significant toxicity risk |
| CYP2B6 Extensive | + Ticlopidine (inhibitor) | Reduced | Moderate inhibition | Monitor |
| CYP2D6 Extensive | + Quinidine (potent inhibitor) | Poor metabolizer | Gold standard phenotyping inhibitor | Complete phenotype conversion |

### 4.3 Therapeutic Drug Monitoring (TDM) Still Important

TDM measures the actual drug concentration, integrating all genetic, environmental, and clinical factors. It is the gold standard when available.

| Drug Class | TDM Available? | Genetic Testing Complement | TDM Priority |
|---|---|---|---|
| Lithium | Yes | Limited PGx value; TDM is primary guide | Mandatory |
| Clozapine | Yes | CYP1A2/CYP2D6 guide initial dosing; TDM confirms | Strongly recommended |
| Valproic acid | Yes | Limited PGx value; TDM is primary guide | Mandatory |
| Carbamazepine | Yes | HLA-B testing before start; TDM for maintenance | Strongly recommended |
| TCA antidepressants (nortriptyline, imipramine) | Yes | CYP2D6/CYP2C19 guide initial dosing; TDM confirms | Recommended |
| Antipsychotics (clozapine, olanzapine, haloperidol) | Limited | CYP2D6/CYP1A2/CYP3A4 guide initial dosing | Clozapine: mandatory; Others: when available |
| SSRIs (citalopram, escitalopram, sertraline) | Limited | CYP2C19/CYP2D6 guide initial dosing | Rarely available; genetics more useful |
| Methadone | Limited | CYP2B6 guides dosing | Recommended in maintenance |
| Anticonvulsants (phenytoin) | Yes | CYP2C9/CYP2C19 guide initial dosing; TDM essential | Mandatory |
| Immunosuppressants (tacrolimus, cyclosporine) | Yes | CYP3A5 guides initial dosing | Mandatory |

### 4.4 Pharmacist Consultation Recommended

Pharmacists with pharmacogenomics training provide:
- Drug-drug-gene interaction assessment
- Dose adjustment calculations
- Monitoring plan development
- Patient education on genetic findings
- Integration with clinical pharmacy services
- Identification of off-label or unusual dosing requirements
- Coordination with prescribers on medication changes
- Documentation of PGx-informed interventions

**AI platform requirement:** Flag when pharmacist consultation is recommended (always for initial interpretation, and especially for complex cases with multiple interacting factors).

### 4.5 Patient-Specific Factors Checklist

Before applying any pharmacogenomic finding, the clinician should consider:

- [ ] Age and developmental stage (pediatric, adult, geriatric)
- [ ] Weight and body composition (obesity affects volume of distribution)
- [ ] Renal function (eGFR, creatinine clearance)
- [ ] Hepatic function (LFTs, albumin, Child-Pugh if applicable)
- [ ] Current medications (drug-drug interactions; use interaction checker)
- [ ] Substance use (tobacco, alcohol, cannabis, opioids)
- [ ] Dietary patterns (grapefruit, cruciferous vegetables, charred meat)
- [ ] Pregnancy or lactation status
- [ ] Adherence history (previous missed doses, refill patterns)
- [ ] Previous medication trials and responses (personal history is often the best predictor)
- [ ] Comorbid medical conditions (especially liver, kidney, cardiac, endocrine)
- [ ] Ancestry/ethnicity (affects allele frequencies and evidence applicability)
- [ ] Inflammatory state (acute infection, autoimmune flare)
- [ ] Physical activity level
- [ ] Genetic testing method (panel vs. whole-genome; coverage and limitations)

### 4.6 Clinical Decision Integration Workflow

```
PHARMACOGENOMIC FINDING RECEIVED
          |
          v
+------------------ Clinician Review Required ------------------+
| 1. Verify patient identity matches specimen                    |
| 2. Review all actionable, research, and uncertain findings     |
| 3. Cross-reference with current medication list                |
| 4. Check for drug-drug-gene interactions                       |
| 5. Check for drug-drug interactions that override genetic     |
| 6. Review patient organ function (liver, kidney)               |
| 7. Consider age, weight, pregnancy status                      |
| 8. Consider prior medication response history                  |
| 9. Consider patient ancestry and evidence applicability        |
| 10. Evaluate need for pharmacist consultation                  |
| 11. Evaluate need for TDM                                      |
| 12. Integrate PGx findings with overall clinical picture       |
+---------------------------------------------------------------+
          |
          v
+----- CLINICAL DECISION: Modify / Monitor / No Change ----+
| All genetic findings are ONE input among many clinical      |
| factors. Final prescribing decisions rest with the           |
| treating clinician. PGx never overrides clinical judgment.  |
+------------------------------------------------------------+
```

---

## 5. Uncertain Variants (VUS)

### 5.1 Variant of Uncertain Significance (VUS)

A VUS is a genetic variant where the available evidence is insufficient to determine whether it is pathogenic/benign or functionally significant/neutral for drug response.

| VUS Category | Definition | Clinical Action | Reporting Strategy |
|---|---|---|---|
| **CYP enzyme VUS** | Variant in coding region with unknown functional impact | Do not use for dosing guidance; monitor TDM | Include in report with "uncertain significance" label |
| **Regulatory VUS** | Variant in promoter/enhancer with unknown expression impact | Do not use for phenotype prediction | Include with explanation |
| **Rare novel variant** | Not found in population databases; no functional studies | Report as "insufficient evidence" | Include with population frequency if available |
| **Conflicting interpretation** | Different databases classify differently | Flag conflict; default to no action | Report all conflicting classifications |
| **Low-penetrance variant** | Associated with effect in some studies but not others | Label as preliminary evidence only | Grade as D or R |
| **Splice region VUS** | Near splice site; impact on splicing uncertain | Conservative interpretation | In silico analysis only; not actionable |
| **Synonymous VUS** | Does not change amino acid; may affect splicing or expression | Usually benign; may be functional | Report only if suspected functional |

### 5.2 How to Handle Novel Variants

1. **Sequence verification:** Confirm the variant call is not a sequencing artifact
2. **Population frequency check:** Query gnomAD, dbSNP, ExAC for allele frequency; ultra-rare may be pathogenic
3. **In silico prediction:** Use SIFT, PolyPhen, CADD, REVEL scores as supplementary evidence only
4. **Literature search:** Check PubMed, PharmGKB, ClinVar for functional studies
5. **Functional classification:** Determine if the variant is likely to alter protein function
6. **Conservative interpretation:** If uncertain, classify as VUS and provide no clinical guidance
7. **Literature monitoring:** Set up alerts for new publications on this variant
8. **Database updates:** Re-check classification with each database update
9. **Clinical correlation:** Consider whether the patient's medication response phenotype matches
10. **Expert consultation:** Consider molecular genetics consultation for novel CYP variants

### 5.3 Evidence Accumulation Over Time

Pharmacogenomic knowledge is dynamic. A VUS today may become actionable in 2-5 years:

| Timeline | Action | Responsible Party |
|---|---|---|
| Initial testing | Classify VUS; provide no clinical guidance | Lab director |
| 3 months | Re-query ClinVar, PharmGKB for new annotations | Bioinformatics team |
| 6 months | Re-query databases for new evidence | Bioinformatics team |
| 1 year | Re-analyze if new CPIC guidelines published | Medical director |
| 1 year | Literature review for functional studies | Medical director |
| 2-3 years | Consider re-testing if panel has expanded | Clinician request |
| Ongoing | Subscribe to PharmGKB updates; re-analyze periodically | Platform automated |
| Per significant update | Notify ordering clinician of reclassification | Platform automated |

### 5.4 Transparency About Limitations

Every pharmacogenomic report must include:

> "This analysis examines the following genes: [LIST]. It does not assess all possible genetic variants that may affect medication response. Variants not tested, rare variants, copy number variations (especially in CYP2D6), regulatory variants (promoter, enhancer, intronic), and epistatic interactions may all influence drug response. The phenotype predictions are based on known star alleles and may not capture the full complexity of an individual's pharmacogenomic profile. Pharmacogenomic testing provides probabilities, not certainties. Results should be interpreted in the context of the patient's complete clinical picture including current medications, organ function, age, and comorbidities."

### 5.5 VUS Classification Framework

| Evidence Type | Weight | Sources | Reliability |
|---|---|---|---|
| Functional studies (in vitro enzyme assays) | High | Academic labs, PharmVar | High |
| Functional studies (in vivo, human) | Very High | Clinical pharmacology studies | Very high |
| Case reports of drug response | Medium | Clinical journals, PharmGKB | Medium |
| Population association studies | Medium | GWAS, candidate gene studies | Medium (subject to bias) |
| In silico predictions (SIFT, PolyPhen, CADD) | Low | Computational tools | Low; supplementary only |
| Database annotations (ClinVar) | Low | Curated databases | Low-moderate; may conflict |
| Computational modeling | Very low | Homology modeling | Very low |
| Allele frequency data | Medium | gnomAD | Medium; extreme frequencies suggestive |

### 5.6 VUS Reporting Template

```
VARIANT OF UNCERTAIN SIGNIFICANCE
==================================
Gene: [GENE]
Variant: [cDNA change] / [Protein change] / [rsID if available]
Position: [Chromosome:Position]
Zygosity: [Heterozygous / Homozygous / Hemizygous]

Classification: VARIANT OF UNCERTAIN SIGNIFICANCE (VUS)
Classification Date: [DATE]
Classification Version: [VERSION]

Evidence Summary:
- Population frequency: [X%] in [population]
- In silico predictions: [SIFT: X] [PolyPhen: X] [CADD: X]
- Functional studies: [None / Limited / In vitro only]
- Clinical studies: [None / Case reports / Association studies]
- Database classifications: [ClinVar: X] [PharmGKB: X]

Clinical Significance: UNCERTAIN
Actionable: NO
No clinical action should be based on this variant.

Next Review Date: [DATE + 6 months]
Notification: You will be notified if this variant is reclassified.
```

---

## 6. Evidence Limitations & Grading

### 6.1 Evidence Grading System

This platform uses a modified GRADE/CPIC evidence framework:

| Grade | Label | Definition | Clinical Action | Platform Behavior |
|---|---|---|---|---|
| **A** | Strong | Multiple well-powered RCTs or meta-analyses; consistent direction; CPIC Level 1A/1B | Actionable; incorporate into clinical decision-making | Include in clinical summary; highlight |
| **B** | Moderate | At least one well-powered study; consistent direction; CPIC Level 2A | Actionable; consider in clinical context | Include in clinical summary |
| **C** | Optional | Limited studies; small sample; some inconsistency; CPIC Level 2B | May be considered; not primary basis for decisions | Include in full report; note limitations |
| **D** | Insufficient | Case reports only; conflicting results; very small samples; CPIC Level 3 | Not actionable; for informational purposes only | Include but clearly labeled as insufficient |
| **R** | Research Only | Preliminary evidence only; no clinical validation; not in CPIC | Do not use for clinical decisions | Separate section; purple badge; no clinical summary |

### 6.2 CPIC Guideline Levels

| CPIC Level | Definition | Example | Evidence Requirement |
|---|---|---|---|
| **1A** | Strong evidence; clinical validity AND utility established; action recommended | HLA-B*57:01 before abacavir | Multiple RCTs or meta-analyses; clinical utility demonstrated |
| **1B** | Strong evidence; clinical validity established; action recommended | CYP2C19 PM + clopidogrel | Strong observational data; clinical validity clear |
| **2A** | Moderate evidence; clinical validity; action may be considered | CYP2D6 PM + codeine | Consistent evidence from multiple studies |
| **2B** | Moderate evidence; optional action | CYP2C19 + PPI dosing | Some evidence but less consistent |
| **3** | Limited evidence; insufficient for recommendation | Many pharmacodynamic variants | Small studies; conflicting results |
| **No recommendation** | Insufficient evidence to make any recommendation | Emerging variants | No adequate studies |

### 6.3 FDA Pharmacogenomic Labels

| FDA Label Category | Description | Examples |
|---|---|---|
| **Required testing** | FDA mandates testing before prescribing | HLA-B*57:01 (abacavir); BCR-ABL1 (imatinib) |
| **Recommended testing** | FDA recommends testing | CYP2C19 (clopidogrel), TPMT (thiopurines), HLA-B*15:02 (carbamazepine) |
| **Information only** | PGx information in label; no testing required | CYP2D6 (many drugs); CYP2C19 (diazepam) |
| **Boxed warning** | Serious adverse event risk with genetic association | HLA-B*15:02 (carbamazepine); HLA-B*57:01 (abacavir) |
| **Companion diagnostic** | Required test for specific targeted therapy | EGFR (osimertinib); ALK (crizotinib) |
| **None** | No PGx information in FDA label | Most drugs; most pharmacodynamic variants |

### 6.4 Replication Failures in Pharmacogenomics

Many initially promising pharmacogenetic associations have failed replication:

| Gene | Initial Claim | Initial Study | Replication Status | Current Status | Notes |
|---|---|---|---|---|---|
| **SLC6A4** (5-HTTLPR) | Predicts SSRI response | Multiple early studies | Mixed; large meta-analyses largely negative | Grade C/D; not clinically actionable | Serotonin transporter promoter variant; most studied PGx marker; disappointing replication |
| **HTR2A** T102C | Predicts antipsychotic response | Multiple candidate gene studies | Partially replicated | Grade C; limited clinical utility | Some signal for antipsychotic response; inconsistent |
| **HTR2A** C135T | Predicts antidepressant response | Early positive studies | Failed replication | Grade D | Initial positive findings not replicated |
| **COMT** Val158Met | Predicts antipsychotic side effects | Several studies | Inconsistent replication | Grade C | Effect may be small and context-dependent |
| **5-HTR1A** C1019G | Predicts antidepressant response | Multiple studies | Failed replication | Grade D | Initial promise not borne out |
| **ABCB1** (MDR1) C3435T | Predicts antidepressant response | Multiple studies | Largely failed replication | Grade D | Transporter variants less predictive than hoped |
| **GNB3** C825T | Predicts antidepressant response | Several studies | Failed replication | Grade D | G-protein variant; no consistent effect |
| **BDNF** Val66Met | Predicts antidepressant response | Multiple studies | Meta-analysis negative | Grade D/R | Large meta-analyses show no effect |
| **FKBP5** | Predicts antidepressant response | Several studies | Partially replicated | Grade C | Some signal; limited clinical utility |
| **GNB3** | Predicts antipsychotic response | Few studies | Failed replication | Grade D | No consistent evidence |
| **HTR2C** Cys23Ser | Predicts antipsychotic weight gain | Multiple studies | Partially replicated | Grade C | Some signal; gene-environment interaction |
| **CYP2D6** | Predicts antidepressant response | Multiple studies | Mixed; overall weak | Grade C | PK effects clearer than PD effects |
| **MC4R** | Predicts antipsychotic weight gain | GWAS studies | Partially replicated | Grade C | GWAS findings emerging |
| **LEP** | Predicts antipsychotic metabolic effects | Multiple studies | Inconsistent | Grade D | Leptin pathway; complex regulation |

### 6.5 Publication Bias in Pharmacogenomics

Pharmacogenomics is particularly susceptible to publication bias:
- Positive findings are 3-5x more likely to be published than negative findings
- Initial studies often overestimate effect sizes (winner's curse)
- Industry-sponsored studies may favor proprietary tests
- Negative results are underrepresented in literature
- Candidate gene studies (pre-GWAS era) had high false positive rates
- Multiple testing was rarely corrected adequately in early studies

**Mitigation strategy:** Systematically review meta-analyses, examine funnel plots for asymmetry, prioritize evidence from independent research groups, require pre-registered study protocols, and be skeptical of findings that have not been replicated by independent groups.

### 6.6 Industry-Sponsored Studies

| Concern | Description | Mitigation Strategy |
|---|---|---|
| **Selective reporting** | Favorable outcomes reported; unfavorable outcomes not reported | Require pre-registered study protocols |
| **Proprietary panel bias** | Studies funded by testing companies favor their specific panels | Compare findings across multiple platforms |
| **Marketing influence** | Clinical content influenced by commercial considerations | Separate commercial content from clinical evidence |
| **Publication control** | Industry sponsors control whether and when results are published | Prioritize peer-reviewed, independent research |
| **Ghostwriting** | Industry-sponsored articles written by medical writers | Require author transparency declarations |
| **Endpoint selection** | Primary endpoints chosen to favor proprietary test | Examine endpoint selection critically |

### 6.7 Evidence Grading Checklist

For every pharmacogenomic claim, the AI must document:

- [ ] **Study design:** RCT, cohort, case-control, GWAS, or case series
- [ ] **Sample size:** Total N and N per genotype group; power calculation if available
- [ ] **Population studied:** Ethnicity, demographics, geographic origin
- [ ] **Replication status:** Number of independent studies; replication success/failure
- [ ] **Effect size:** OR/HR/RR with confidence intervals; absolute risk when available
- [ ] **Publication bias assessment:** Funnel plot if meta-analysis; Egger test if available
- [ ] **Industry sponsorship disclosure:** Funding source declared
- [ ] **CPIC guideline level:** 1A/1B/2A/2B/3/None
- [ ] **FDA label status:** Required/Recommended/Information/Boxed warning/None
- [ ] **DPWG guideline status:** If applicable (Dutch)
- [ ] **Grade assignment:** A/B/C/D/R based on rubric
- [ ] **Population applicability to current patient:** Match or mismatch
- [ ] **Clinical context:** Is this finding relevant to the patient's current medications?

### 6.8 Example Evidence Grading for Common Gene-Drug Pairs

| Gene-Drug Pair | Effect | OR (95% CI) | CPIC Level | Grade | Population | Notes |
|---|---|---|---|---|---|---|
| CYP2D6 PM + codeine | Reduced analgesia, toxicity | OR 3-5 for reduced analgesia | 2A/1A | A | Multi-ethnic | Strong pediatric safety data |
| CYP2C19 PM + clopidogrel | Reduced antiplatelet effect | HR 1.5-2.0 for MACE | 1A | A | Multi-ethnic | Multiple large RCTs |
| HLA-B*57:01 + abacavir | Hypersensitivity | LR > 100 | 1A | A | Multi-ethnic | Required testing |
| HLA-B*15:02 + carbamazepine | SJS/TEN | OR 50-100 | 1A | A | East/South Asian | Required in Asian populations |
| TPMT low + thiopurines | Myelosuppression | OR 5-10 | 1A | A | Multi-ethnic | Required testing |
| CYP2D6 PM + tamoxifen | Reduced active metabolite | HR 1.2-1.5 for recurrence | 2A | B | European | Controversial; some negative studies |
| CYP3A5 expressor + tacrolimus | Higher dose requirement | Dose difference 30-50% | 1A | A | Multi-ethnic | Clear PK effect |
| SLCO1B1*5 + simvastatin myopathy | Increased myopathy risk | OR 2-4 | 1A | A | European | SEARCH GWAS |
| CYP2C19 PM + diazepam | Increased sedation | AUC increase 2-3x | 2B | C | European | Limited clinical outcome data |
| SLC6A4 + SSRI response | Response prediction | OR 0.8-1.3 (inconsistent) | None | D/R | Mixed | Failed meta-analyses |
| COMT Val158Met + antipsychotic SE | Cognitive side effects | OR 1.2-1.5 (inconsistent) | None | C | European | Limited replication |
| BDNF Val66Met + antidepressant response | Response prediction | OR 1.0-1.2 (meta-analysis NS) | None | D/R | Mixed | Large meta-analysis negative |

---

## 7. Regulatory Landscape

### 7.1 FDA Oversight of Pharmacogenomic Testing

| Regulatory Pathway | Description | Examples | Timeline |
|---|---|---|---|
| **510(k) clearance** | Premarket notification; substantial equivalence to predicate device | Some PGx panels (e.g., AmpliChip CYP450) | 3-6 months |
| **PMA (Pre-Market Approval)** | Full review for high-risk devices | Companion diagnostics (e.g., EGFR for osimertinib) | 12-18 months |
| **De novo classification** | Novel devices of low-moderate risk | Some new PGx platforms | 6-12 months |
| **CLIA certification** | Laboratory quality standards; NOT clinical validity assessment | All clinical labs performing PGx | Ongoing compliance |
| **LDT (Laboratory Developed Test)** | Exempt from FDA premarket review; CLIA only | Most current PGx panels | No premarket review |
| **Emergency Use Authorization (EUA)** | Expedited pathway for emergencies | COVID-19-related PGx applications | Days to weeks |
| **HUD/HDE** | Humanitarian device exemption | Rare disease PGx applications | Variable |

### 7.2 CLIA Certification Requirements

| CLIA Aspect | Requirement | Inspection Frequency |
|---|---|---|
| **Personnel qualifications** | Qualified director (MD/PhD), technical supervisor, clinical consultant | Credential verification |
| **Proficiency testing** | Participate in available PT programs (CAP, external) | Ongoing enrollment |
| **Quality control** | Daily, weekly, monthly QC procedures with documentation | Continuous |
| **Quality assurance** | Monitor and document analytical validity; track errors and corrective actions | Continuous |
| **Analytical validation** | All tests validated before clinical use; LOD, LOQ, accuracy, precision documented | Per assay launch |
| **Standardized reporting** | Standardized result reporting with interpretation | Per protocol |
| **Specimen handling** | Chain of custody; proper collection, transport, storage | Continuous |
| **Equipment maintenance** | Regular calibration and maintenance documentation | Per manufacturer schedule |
| **Records retention** | Patient results retained per regulatory requirements | Per policy |
| **Complaint handling** | Documented complaint resolution procedures | Per event |

### 7.3 Laboratory-Developed Tests (LDTs)

Most pharmacogenomic testing currently operates as LDTs:

| Aspect | Current Status | Future Direction |
|---|---|---|
| **Regulatory oversight** | CLIA only; FDA does not review premarket | FDA has proposed increased oversight; regulatory landscape changing |
| **Clinical validity** | Not assessed by CLIA | Proposed FDA oversight would require clinical validity evidence |
| **Analytical validity** | Assessed by CLIA | Strengthened requirements likely |
| **Label claims** | Labs make their own claims | Proposed FDA oversight would review claims |
| **Evidence requirements** | Minimal evidence required | Proposed FDA oversight would require evidence of clinical utility |
| **Quality standards** | CLIA standards apply | May align with IVD regulations |

**Key legislation to monitor:** VALID Act (Verifying Accurate Leading-edge IVCT Development) - proposed legislation to reform LDT oversight.

### 7.4 International Regulations

| Region | Regulatory Body | Key Requirements | Status |
|---|---|---|---|
| **European Union** | IVDR 2017/746 (In Vitro Diagnostic Regulation) | Class C devices for PGx; notified body conformity assessment required; CE-IVDR marking | Fully effective May 2022; transition period through 2028 |
| **European Union** | EMA (European Medicines Agency) | Companion diagnostic co-development requirements for new drugs | Active |
| **United Kingdom** | MHRA (Medicines and Healthcare products Regulatory Agency) | Post-Brexit IVDR alignment; UKCA marking | Active; evolving from EU alignment |
| **Canada** | Health Canada | Class III medical device license required; ISO 13485 quality system | Active |
| **Australia** | TGA (Therapeutic Goods Administration) | Class 3 IVD; inclusion in Australian Register of Therapeutic Goods (ARTG) | Active |
| **Japan** | PMDA (Pharmaceuticals and Medical Devices Agency) | Approval required; companion diagnostic framework established | Active |
| **South Korea** | MFDS (Ministry of Food and Drug Safety) | Class 3/4 IVD approval; Korean Good Manufacturing Practice | Active |
| **China** | NMPA (National Medical Products Administration) | Class III medical device registration; clinical trials in China often required | Active; increasingly stringent |
| **Singapore** | HSA (Health Sciences Authority) | Class C/D IVD; ASEAN harmonization efforts | Active |
| **Brazil** | ANVISA | Class III IVD; requires INMETRO certification | Active |
| **India** | CDSCO (Central Drugs Standard Control Organization) | Class C/D IVD; import license for foreign manufacturers | Evolving |

### 7.5 Direct-to-Consumer (DTC) Genetic Testing

| Aspect | Current Status | Safety Concern |
|---|---|---|
| **DTC pharmacogenomic testing** | Available in US; 23andMe, OneOme, GeneSight, etc. | Risk of self-interpretation without clinical context; results may be incomplete |
| **FDA clearance for DTC PGx** | 23andMe has 510(k) clearance for some PGx reports | Clearance means test is accurate; does NOT mean clinical utility proven |
| **State regulations** | Vary significantly by state; some require clinician ordering | Inconsistent access, quality, and oversight |
| **International restrictions** | Many countries prohibit or restrict DTC genetic testing | Germany, France have significant restrictions |
| **AI platform policy** | Should not accept DTC results as primary source without confirmation | Analytical validity may not match clinical-grade testing; different variant calling standards |
| **Patient self-action** | Patients may change medications based on DTC results without clinician input | Dangerous; can lead to discontinuation of necessary medications |

### 7.6 Regulatory Compliance Checklist

- [ ] CLIA-certified laboratory for all clinical testing (or contracted CLIA lab)
- [ ] State laboratory licenses as required (varies by state)
- [ ] CAP accreditation (recommended; not required)
- [ ] FDA compliance strategy documented (510(k), LDT, or other pathway)
- [ ] IVDR compliance if serving EU market (Class C IVD)
- [ ] Quality management system implemented (ISO 15189 or equivalent)
- [ ] Data security compliance (HIPAA, state privacy laws)
- [ ] GDPR compliance if serving EU patients
- [ ] Regular proficiency testing participation (CAP or equivalent)
- [ ] Documented analytical validation for all reported variants
- [ ] Documented clinical validation for claimed indications (where available)
- [ ] Adverse event reporting system in place
- [ ] Recall/withdrawal procedures documented
- [ ] International regulatory requirements mapped (per market)
- [ ] State-specific requirements reviewed and documented
- [ ] Regular regulatory compliance audits (quarterly recommended)

### 7.7 AI-Specific Regulatory Considerations

| Consideration | Description | Regulatory Approach |
|---|---|---|
| **AI/ML as Software as Medical Device (SaMD)** | FDA framework for AI-enabled medical devices | Risk-based classification; premarket submission for high-risk |
| **Predetermined change control plan** | FDA allows planned algorithm updates with pre-approved protocols | Document update protocols before deployment |
| **Algorithm bias** | AI may systematically perform worse in underrepresented populations | Validation in diverse populations required |
| **Explainability** | Black-box AI decisions are harder to validate | Prefer interpretable models for clinical decisions |
| **Continuous learning systems** | AI that updates in real-time creates regulatory challenges | Lock algorithms until validated; controlled update cycles |
| **Clinical decision support (CDS)** | Software that provides recommendations to clinicians | FDA CDS guidance; may be exempt if clinician can independently review |
| **Intended use claims** | What the AI claims to do determines regulatory pathway | Carefully scope intended use to match evidence |

---

## 8. Informed Consent for Genetics

### 8.1 Required Disclosures

Every patient undergoing pharmacogenomic testing must be informed of:

| Disclosure Element | What to Explain | Why It Matters |
|---|---|---|
| **Purpose** | Why testing is being performed; what genes are being analyzed | Sets appropriate expectations |
| **Benefits** | How results may inform medication selection or dosing | Patient understanding of value |
| **Limitations** | What the test cannot predict; which medications are not covered | Prevents over-reliance on results |
| **Uncertainties** | VUS may be found; some findings may have unclear significance | Prepares patient for inconclusive results |
| **Privacy** | How data will be stored, protected, and shared | Genetic data is uniquely sensitive |
| **Secondary findings** | Whether incidental findings will be reported | Patient autonomy in receiving unexpected information |
| **Family implications** | Genetic information may reveal family-related health risks | Shared inheritance patterns |
| **Discrimination protections** | GINA protections (in US) and limitations | Patients may fear genetic discrimination |
| **Right not to know** | Patient may decline testing or decline specific results | Respects patient autonomy |
| **Withdrawal** | How to withdraw consent and data | Ongoing right to revoke |
| **Data retention** | How long data will be stored and destruction policies | Transparency about data lifecycle |
| **Re-analysis** | Whether data will be re-analyzed as knowledge evolves | Benefit of updated interpretations |
| **Cost** | Whether testing is covered by insurance; out-of-pocket costs | Financial informed consent |
| **Limitations of ancestry** | Self-identified ethnicity may not match genetic ancestry | Relevant for evidence applicability |
| **Platform limitations** | AI-assisted interpretation has its own limitations | Specific to AI-powered platforms |

### 8.2 Incidental Findings

Incidental findings are genetic variants unrelated to the pharmacogenomic purpose of testing that may have health implications.

| Type | Example | Frequency | Disclosure Policy |
|---|---|---|---|
| **Pathogenic cancer variant** | BRCA1/2 mutation detected on WGS panel | Rare | Patient should be informed; referral to genetics |
| **Carrier status** | Cystic fibrosis carrier | Variable | Optional disclosure; pre-test preference should be documented |
| **Pharmacogenomic variant unrelated to indication** | CYP2C19 PM found when testing CYP2D6 | Common | Should be reported if clinically relevant |
| **Unexpected ancestry** | Non-paternity or donor conception | Rare | Requires genetic counseling referral; sensitive handling |
| **Highly penetrant disease variant** | Huntington's disease CAG repeat | Rare | Requires pre-test counseling about disclosure policy |
| **Cardiac risk variant** | Long QT syndrome gene variant | Rare | Important for psychotropic QT-prolonging drugs |
| **Pharmacogenomic variant with no current relevance** | Future medication may be affected | Common | Include in report for future reference |

### 8.3 Secondary Findings (ACMG)

The American College of Medical Genetics and Genomics (ACMG) recommends reporting a specific list of secondary findings from clinical sequencing:

| Category | Gene Examples | Condition | Relevance to PGx Platform |
|---|---|---|---|
| **Cancer susceptibility** | BRCA1, BRCA2, TP53, Lynch syndrome genes (MLH1, MSH2, MSH6, PMS2) | Hereditary cancer syndromes | May be detected on broad panels; requires disclosure |
| **Cardiac conditions** | KCNQ1, KCNH2, SCN5A (long QT syndrome); MYBPC3, MYH7 (HCM) | Arrhythmia, cardiomyopathy | Important for psychotropic QT-prolonging drugs |
| **Malignant hyperthermia** | RYR1, CACNA1S | Anesthesia reaction | Relevant for anesthesia history |
| **Aortopathies** | FBN1, TGFBR1, TGFBR2, SMAD3, ACTA2 | Marfan, Loeys-Dietz | May affect medication choices |
| **Endocrine** | MEN1, RET (MEN2) | Multiple endocrine neoplasia | Incidental finding relevance |
| **Renal** | PKD1, PKD2 | Polycystic kidney disease | Drug dosing implications |

**Policy decision:** Pure pharmacogenomic panels focused on CYP/drug-response genes are unlikely to detect ACMG secondary findings. Whole-exome or whole-genome approaches require explicit secondary findings policies documented in consent.

### 8.4 Data Storage and Privacy

| Element | Requirement | Standard |
|---|---|---|
| **HIPAA compliance** | All genetic data is Protected Health Information (PHI) | 45 CFR Parts 160, 164 |
| **Encryption at rest** | AES-256 minimum | NIST guidelines |
| **Encryption in transit** | TLS 1.3 minimum | NIST guidelines |
| **Access logging** | All data access logged and auditable | HIPAA Security Rule |
| **Minimum necessary** | Only authorized clinicians access relevant results | HIPAA Privacy Rule |
| **Data retention** | Defined retention period; secure destruction after | State law + institutional policy |
| **Cross-border transfers** | GDPR compliance if EU patients; data localization requirements | GDPR Articles 44-49 |
| **Breach notification** | 60-day notification to HHS; 60-day to patients | HIPAA Breach Notification Rule |
| **De-identification** | Safe Harbor (18 identifiers removed) or Expert Determination | HIPAA 164.514(b) |
| **Business associate agreements** | Required for all vendors handling PHI | HIPAA 164.504(e) |
| **Patient access rights** | Patients have right to access their genetic data within 30 days | HIPAA 164.524 |
| **Right to amendment** | Patients may request amendment of their genetic data | HIPAA 164.526 |
| **Accounting of disclosures** | Track all disclosures of genetic data | HIPAA 164.528 |
| **Genetic data special protections** | Some states have additional genetic-specific privacy laws | State law (e.g., California Genetic Information Privacy Act) |

### 8.5 Genetic Discrimination (GINA)

The Genetic Information Nondiscrimination Act (GINA) of 2008 provides important but limited protections:

| Protected Area | Coverage | Limitation |
|---|---|---|
| **Health insurance (individual and group)** | Prohibits use of genetic information for eligibility, coverage, or premiums | Does not apply to military TRICARE; limited Medicare/Medicaid provisions |
| **Employment** | Prohibits employers from using genetic information for hiring, firing, promotion, or benefits | Applies to employers with 15+ employees; enforcement through EEOC |
| **Life insurance** | **NOT protected** | Insurers may request and use genetic information; many states have no protections |
| **Disability insurance** | **NOT protected** | Insurers may request and use genetic information |
| **Long-term care insurance** | **NOT protected** | Insurers may request and use genetic information |
| **Military** | Exemptions exist for military applications | Department of Defense has separate policies |
| **Companies with <15 employees** | Exempt from GINA employment provisions | Small businesses not covered |
| **Federal employees** | Covered by GINA | Through FEHB and EEOC |

**State-level protections:** Some states have enacted laws that extend GINA protections to life insurance, disability insurance, and long-term care insurance. These vary significantly.

**Patient counseling point:** "Your genetic information is protected for health insurance and employment purposes under federal law (GINA). However, it is NOT protected for life insurance, disability insurance, or long-term care insurance. Some states have additional protections. If you are applying for life or disability insurance, you may want to consider whether to undergo testing now or after your application is complete."

### 8.6 Family Implications

Genetic findings may have implications for family members:

| Consideration | Impact | Communication Guidance |
|---|---|---|
| **HLA associations** | Family members share HLA haplotypes; may have similar drug hypersensitivity risks | Encourage family members to share relevant drug allergy history |
| **CYP variants** | First-degree relatives have 50% chance of sharing CYP phenotypes | Family members may benefit from preemptive testing |
| **Cascading testing** | Family members may want testing based on proband results | Offer family testing referral if indicated |
| **Psychological impact** | Family members may experience anxiety about shared genetic risks | Provide genetic counseling resources |
| **Reproductive decisions** | PGx variants are typically not inherited disease risks, but some patients conflate PGx with diagnostic genetic testing | Clarify that PGx results are not predictive of disease |
| **Privacy within families** | Patient has right not to disclose to family; clinician cannot disclose without consent | Respect patient autonomy; encourage but don't require family sharing |
| **Pediatric testing** | PGx testing in children has special considerations; results may be relevant throughout life | Consider preemptive PGx testing in pediatrics for future medication use |

### 8.7 Informed Consent Template

```
PHARMACOGENOMIC TESTING INFORMED CONSENT
=========================================

1. PURPOSE
You are being offered pharmacogenomic (PGx) testing. This test analyzes specific 
genes that may affect how your body processes certain medications. The results may 
help your doctor choose medications and doses that are more appropriate for you.

2. WHAT WILL BE TESTED
The test will analyze the following genes: [LIST GENES]
These genes are involved in processing the following types of medications: [LIST]

3. BENEFITS
- Results may help guide medication selection and dosing
- May reduce trial-and-error in finding effective medications
- May help identify risk of certain side effects
- Results remain relevant throughout life and may inform future medication decisions

4. LIMITATIONS
- This test does not predict whether a medication will definitely work or cause 
  side effects for you personally
- Results provide population-based probabilities, not individual predictions
- The test does not analyze all genes that may affect medication response
- Many factors besides genetics affect medication response (other medications, 
  diet, age, organ function, etc.)
- Scientific understanding of gene-medication interactions is still growing
- Some results may be uncertain or inconclusive

5. RISKS
- Discovering uncertain results that may cause anxiety
- Potential insurance implications (see below)
- Family implications (genetic information may be relevant to relatives)
- Privacy risks (though we employ strong security measures)

6. GENETIC DISCRIMINATION
Federal law (GINA) protects you from genetic discrimination in health insurance 
and employment. However, GINA does NOT protect against genetic discrimination 
in life insurance, disability insurance, or long-term care insurance.

7. YOUR RIGHTS
- You have the right to decline testing
- You have the right to decline to receive certain types of results (e.g., 
  incidental findings)
- You have the right to withdraw from testing at any time
- You have the right to access your results

8. DATA STORAGE AND PRIVACY
Your genetic data will be stored securely and protected under HIPAA. We will 
not share your genetic data with third parties without your consent, except 
as required by law.

9. SECONDARY FINDINGS
[ ] I DO want to be informed of secondary findings (unrelated genetic findings 
    that may have health significance)
[ ] I DO NOT want to be informed of secondary findings

10. RE-ANALYSIS
[ ] I consent to having my genetic data re-analyzed as scientific knowledge 
    advances
[ ] I DO NOT consent to re-analysis

Patient Signature: _________________________ Date: ___________
Clinician Signature: _______________________ Date: ___________
Witness Signature: _________________________ Date: ___________
```

---

## 9. Safe Wording Templates

### 9.1 Metabolizer Status Template

> "Based on genetic testing, this patient is predicted to be a **[GENE] [extensive/intermediate/poor/ultrarapid] metabolizer**. This may affect the metabolism of the following medications: [LIST RELEVANT DRUGS].
>
> **Evidence level:** [GRADE]. **Population basis:** [ANCESTRY]. **CPIC Level:** [LEVEL].
>
> **Clinical implications:** [BRIEF DESCRIPTION OF EFFECT ON RELEVANT MEDICATIONS, e.g., "Poor metabolizers may have reduced clearance of CYP2D6 substrates, leading to higher drug concentrations and potentially increased side effects at standard doses."]
>
> **Important limitations:** This prediction is based on genotype-to-phenotype algorithms and may not reflect actual enzyme activity. Drug-drug interactions, organ function, age, and other factors also significantly affect drug metabolism. Copy number variations and rare variants not tested may affect the accuracy of this prediction. The patient may metabolize some substrates normally despite the predicted phenotype.
>
> **Pharmacogenomic findings are supportive context only and require clinician/pharmacist review. They do not replace clinical judgment or therapeutic drug monitoring when available."

### 9.2 Drug Interaction (Gene-Drug) Template

> **[GENE] [variant/rsID] has been associated with [increased/decreased/altered] [pharmacokinetic/pharmacodynamic] effects of [drug/drug class].**
>
> | Attribute | Detail |
> |---|---|
> | **Gene** | [GENE] |
> | **Variant** | [VARIANT/RSID] |
> | **Drug(s)** | [DRUG NAME(S)] |
> | **Effect** | [DESCRIPTION OF EFFECT] |
> | **Odds Ratio / Effect Size** | [OR/HR WITH 95% CI] |
> | **Absolute Risk** | [X%] vs. baseline [Y%] |
> | **Evidence Level** | [A/B/C/D/R] |
> | **CPIC Level** | [1A/1B/2A/2B/3/None] |
> | **FDA Label** | [Required/Recommended/Information/None] |
> | **Studied Population** | [ANCESTRY] |
> | **Clinical Action** | [CONSIDER ALTERNATIVE / ADJUST DOSE / MONITOR CLOSELY / NO ACTION] |
> | **Key References** | [PMID / DOI] |
>
> **This finding does not constitute a prescription recommendation. Clinical judgment and patient-specific factors must always be considered. A pharmacist consultation is recommended for complex medication regimens."

### 9.3 Side Effect Risk Template

> **[Gene variant] is associated with [increased/moderate/slightly increased] risk of [side effect/adverse event] when taking [medication].**
>
> | Risk Parameter | Value |
> |---|---|
> | **Baseline risk (general population)** | [X%] |
> | **Risk with variant** | [Y%] |
> | **Absolute risk increase** | [Y-X%] |
> | **Relative risk increase** | [RR (95% CI)] |
> | **Odds Ratio** | [OR (95% CI)] |
> | **Evidence Level** | [GRADE] |
> | **Population** | [STUDIED ANCESTRY] |
> | **Time to onset** | [If known: typically X days/weeks] |
> | **Severity** | [Mild / Moderate / Severe / Life-threatening] |
>
> **This risk estimate is population-based and may not reflect individual risk. Other factors including concomitant medications, organ function, age, and comorbidities also affect risk. Most patients with this variant will NOT experience this side effect. Monitor [specific parameter] accordingly.**
>
> **Recommended monitoring:** [MONITORING PLAN, e.g., "Monitor CBC weekly for first month, then monthly"]."

### 9.4 Research-Only Marker Template

> **[Gene] [variant] has preliminary evidence for association with [medication response/side effect].**
>
> | Attribute | Detail |
> |---|---|
> | **Evidence Status** | Research-grade only |
> | **Replication** | [Not replicated / Partially replicated / Conflicting results] |
> | **Sample Size** | [N = X] |
> | **Study Design** | [GWAS / Candidate gene / Case-control / Cohort] |
> | **P-value** | [P = X] |
> | **Effect Size** | [OR/HR (95% CI)] |
> | **Population** | [STUDIED ANCESTRY] |
> | **Biological Plausibility** | [Plausible / Uncertain / Unknown] |
>
> ![RESEARCH ONLY - NOT FOR CLINICAL ACTION]
>
> **This is a research-grade finding only. Clinical action should NOT be based solely on this marker. This finding is provided for informational purposes and may inform future research directions. No medication changes should be made based on this finding alone. This finding should not be included in clinical summaries or used to justify treatment decisions.**

### 9.5 Uncertainty Template

> "The clinical significance of [variant] in [gene] for [medication] response is currently **uncertain**.
>
> **Reasons for uncertainty:**
> - [ ] Limited or no published evidence
> - [ ] Conflicting study results
> - [ ] Small sample sizes (N < 200)
> - [ ] Wide confidence intervals crossing null
> - [ ] No replication studies
> - [ ] Population not studied in patient's ancestry
> - [ ] Variant classified as VUS in ClinVar/PharmGKB
> - [ ] In silico predictions are inconsistent
> - [ ] No functional studies available
>
> **Evidence is insufficient to guide clinical decision-making. This finding should not be used to support medication selection, dosing, or monitoring decisions.**
>
> **This variant will be flagged for re-analysis as new evidence becomes available. The patient and/or clinician will be notified if the classification changes.**

### 9.6 Multi-Gene Risk Score Template

> **This analysis combines variants across [N] genes to estimate [polygenic risk score / metabolizer composite phenotype].**
>
> | Component | Weight | Evidence Grade | CPIC Level |
> |---|---|---|---|
> | [Gene 1] | [Weight] | [Grade] | [Level] |
> | [Gene 2] | [Weight] | [Grade] | [Level] |
> | [Gene N] | [Weight] | [Grade] | [Level] |
>
> **Overall variance explained:** [X%] of known pharmacokinetic/pharmacodynamic variability.
> **Model ancestry:** Developed and validated primarily in populations of [ancestry].
>
> **Important caveats:** Polygenic scores explain only a fraction of medication response variability. Environmental factors, drug-drug interactions, organ function, and unmeasured genetic variants account for the majority of inter-individual differences. This score should not be used as a sole basis for clinical decisions. The model may have different predictive accuracy in populations of [patient's] ancestry.
>
> **Population calibration:** This score was developed and validated primarily in populations of [ancestry] and may have different predictive accuracy in populations of [patient's] ancestry. Performance metrics (AUC, R-squared) are reported for the development population only."

### 9.7 Ancestry Mismatch Warning Template

> **POPULATION LIMITATION WARNING**
>
> The available evidence for [gene-drug pair] is derived primarily from populations of [European/East Asian] ancestry. The patient's self-identified ancestry is [X].
>
> **Potential limitations:**
> - Allele frequencies may differ significantly in the patient's population
> - Effect sizes may not be generalizable to the patient's population
> - Population-specific variants may not be included in this analysis
> - The genotype-to-phenotype algorithm may be less accurate
> - Different linkage disequilibrium patterns may affect imputation accuracy
> - Reference allele definitions may be population-biased
>
> **Recommendation:** Interpret findings with additional caution. Consider population-specific variant testing if available. Pharmacist or clinical genetics consultation recommended. Clinical monitoring is especially important when applying population-mismatched evidence."

### 9.8 Drug-Drug-Gene Interaction Template

> **COMBINED GENE-DRUG AND DRUG-DRUG INTERACTION DETECTED**
>
> | Factor | Status | Predicted Effect |
> |---|---|---|
> | Genetic: [Gene] | [Phenotype] | [Genetic effect on clearance] |
> | Drug interaction: [Drug A] + [Drug B] | [Inhibitor/Inducer/Substrate] | [Interaction effect on clearance] |
> | Net predicted phenotype | | [Combined effect] |
>
> **Interaction magnitude:** The drug-drug interaction is expected to [overwhelm/mask/partially offset/add to] the genetic effect.
>
> **Effective phenotype:** The patient's effective metabolizer phenotype, considering both genetics and drug interactions, is predicted to be [X].
>
> **Clinical action:** Consider [dose adjustment / alternative medication / increased monitoring] based on the combined phenotype. TDM is recommended if available to confirm the effective phenotype.
>
> **When the drug-drug interaction resolves, the genetic phenotype will again become relevant. Plan for medication interaction reassessment.**

### 9.9 Pediatric Considerations Template

> **PEDIATRIC PHARMACOGENOMIC FINDING**
>
> The following finding applies to a patient under 18 years of age. Special considerations apply:
>
> **Developmental factors:**
> - CYP enzyme activity changes rapidly during development
> - Neonates have 30-50% of adult CYP activity regardless of genotype
> - CYP activity reaches adult levels at varying ages by isoform
> - Genotype-phenotype correlations may be less reliable in children
>
> **Specific pediatric concerns:**
> - CYP2D6: Codeine is CONTRAINDICATED in children who are UM regardless of indication
> - CYP2C19: Pediatric clopidogrel data limited; extrapolate from adult evidence with caution
> - TPMT: Dose reduction is MORE critical in children due to higher proliferative rate
> - Growth and development may affect drug distribution
>
> **Evidence limitation:** Most pharmacogenomic evidence is derived from adult populations. Pediatric-specific evidence is limited. These findings should be interpreted with heightened caution in pediatric patients.
>
> **Recommendation:** Pediatric pharmacology consultation recommended. Dosing adjustments should follow pediatric-specific guidelines where available."

### 9.10 Pregnancy Considerations Template

> **PREGNANCY-RELATED PHARMACOGENOMIC CONSIDERATIONS**
>
> The patient is currently [pregnant/planning pregnancy/breastfeeding]. Pregnancy alters drug metabolism independent of genotype:
>
> | CYP Enzyme | Pregnancy Effect | Interaction with Genetic Phenotype |
|---|---|---|
> | CYP1A2 | Decreased activity (up to 70% reduction) | PM effect may be amplified |
> | CYP2C9 | Increased activity | May partially offset reduced function alleles |
> | CYP2C19 | Decreased activity | PM effect may be amplified |
> | CYP2D6 | Increased activity (up to 50% increase) | May partially offset PM; EM may become UM-like |
> | CYP3A4 | Increased activity (up to 100% increase) | May mask reduced function alleles |
> | CYP3A5 | Variable | May be affected by hormonal changes |
>
> **Clinical implication:** Pregnancy-induced enzyme changes may modify the effective metabolizer phenotype. Postpartum, enzyme activity returns toward the genetically predicted baseline. Medication doses may need adjustment both during pregnancy and postpartum.
>
> **Recommendation:** Obstetric pharmacology consultation recommended. TDM preferred when available. Dose adjustments should be guided by clinical response and, where available, drug levels."

### 9.11 Geriatric Considerations Template

> **GERIATRIC PHARMACOGENOMIC CONSIDERATIONS**
>
> The patient is [age] years old. Age-related changes in drug metabolism may interact with genetic predictions:
>
> **Age-related changes:**
> - Hepatic blood flow decreases ~40% by age 90
> - CYP enzyme activity generally decreases with age (10-30% reduction)
> - Renal clearance decreases with age (affects renally cleared drugs)
> - Albumin levels may decrease (affects protein binding)
> - Body composition changes (increased fat, decreased muscle)
> - Polypharmacy increases drug-drug interaction risk
>
> **Clinical implication:** Age-related reductions in metabolism may amplify genetic poor metabolizer effects. An elderly patient who is a CYP2D6 poor metabolizer may have even greater reduction in clearance than predicted by genetics alone. The combination of genetic PM + age-related reduction + polypharmacy creates cumulative risk.
>
> **Recommendation:** Start low, go slow regardless of genetic predictions. TDM recommended when available. Comprehensive medication review with pharmacist recommended."

---

## 10. Governance Framework

### 10.1 Role-Based Access Control (RBAC)

| Role | Access Level | Permissions | Restrictions |
|---|---|---|---|
| **Patient** | Limited | View own final report only after clinician review | Cannot view raw genetic data; cannot view evidence grades; cannot view research findings |
| **Ordering clinician** | Full clinical | View all PGx results, interpretations, evidence; acknowledge and act on findings; generate reports | Cannot modify genetic data; cannot export raw data without approval |
| **Consulting clinician** | Full clinical (for their patients) | Same as ordering clinician | Same as ordering clinician |
| **Pharmacist** | Full clinical | View all results; add consultation notes; flag drug interactions; recommend dose adjustments | Cannot modify genetic data; cannot prescribe |
| **Genetic counselor** | Full clinical | View all results; add counseling notes; discuss findings with patients; document consent | Cannot modify genetic data; cannot prescribe |
| **Lab director** | Administrative | Quality control data; variant classification; platform analytics; override classifications | Cannot access patient-identifying information without clinical reason |
| **Medical director** | Administrative | Evidence database management; guideline updates; policy decisions | Oversight role; no direct patient care |
| **System administrator** | Technical | User management; system configuration; audit log access | No clinical data access without break-glass |
| **Researcher** | De-identified only | Aggregated data; no individual patient identifiers; IRB required | No individual patient data; re-identification prohibited |
| **AI/Algorithm** | Processing only | Cannot generate prescriptions; cannot communicate directly with patients; outputs require human review | All outputs flagged as "requires clinician review" |

### 10.2 Audit Trail Requirements

Every action on genetic data must be logged:

| Event Type | Required Log Fields | Retention |
|---|---|---|
| **Data upload** | User ID, timestamp, source, data hash, specimen ID | 7 years |
| **Variant calling** | Pipeline version, parameters, QC metrics, reference genome | 7 years |
| **Interpretation generation** | Algorithm version, evidence versions, all outputs | 7 years |
| **Clinician review** | Reviewer ID, timestamp, acknowledgment status, notes | 7 years |
| **Report generation** | Generator ID, template version, all included findings | 7 years |
| **Report viewing** | Viewer ID, timestamp, patient identifier, IP address | 7 years |
| **Report export** | Exporter ID, timestamp, destination, authorization, encryption status | 7 years |
| **Data modification** | Modifier ID, timestamp, before/after values, reason | 7 years |
| **Data deletion** | Deleter ID, timestamp, reason, confirmation, destruction certificate | 7 years |
| **Emergency access** | Accessor ID, timestamp, justification, approver, scope | 7 years |
| **Consent verification** | Verifier ID, timestamp, consent version, patient acknowledgment | Duration of retention + 7 years |
| **Evidence update** | Updater ID, timestamp, evidence version, changes made | 7 years |
| **Algorithm update** | Updater ID, timestamp, version change, validation results | 7 years |
| **Access denial** | Attemptor ID, timestamp, resource requested, reason for denial | 7 years |

### 10.3 Consent Verification Workflow

```
SPECIMEN RECEIVED
      |
      v
+----------------------- Consent Verification -----------------------+
| 1. Query consent management system for patient consent record      |
| 2. Verify informed consent is on file and not expired              |
| 3. Confirm consent covers the specific genes being tested          |
| 4. Check consent for secondary findings preferences                |
| 5. Verify patient identity matches specimen (2 identifiers)        |
| 6. Document consent verification timestamp and verifier            |
+--------------------------------------------------------------------+
      |
      v
+----------------------- Verification Outcome -----------------------+
| IF consent VALID:                                                   |
|   - Proceed with testing                                            |
|   - Log verification                                                |
|                                                                      |
| IF consent INVALID / EXPIRED / NOT FOUND:                           |
|   - HOLD testing                                                    |
|   - Notify ordering clinician                                       |
|   - Request consent renewal                                         |
|   - Do NOT proceed until valid consent obtained                     |
|                                                                      |
| IF consent WITHDRAWN:                                               |
|   - STOP testing immediately                                        |
|   - Quarantine specimen                                             |
|   - Notify ordering clinician and patient                           |
|   - Initiate data destruction per policy                            |
+--------------------------------------------------------------------+
```

### 10.4 No Autonomous Prescribing

**Absolute prohibition:** The AI system must NEVER:
- Generate prescription orders or e-prescriptions
- Recommend specific doses without explicit clinician review and approval
- Present findings as definitive treatment directives
- Bypass clinician review before presenting results to patients
- Suggest medication discontinuation without clinician involvement
- Generate patient-facing recommendations without clinician approval
- Override clinician-entered medication decisions
- Autonomously flag medications as "contraindicated" without nuance

**Enforcement mechanisms:**
- System architecture prevents direct connection to prescribing systems
- All outputs require explicit clinician acknowledgment
- No API endpoints for autonomous prescribing
- Audit logging of all output generation
- Regular audits for any prescribing attempts

### 10.5 No Direct-to-Patient Prescribing Language

All AI-generated content must:
- Use conditional language ("may," "might," "consider") rather than imperative language
- Require clinician intermediate review before any patient-facing communication
- Never include medication names in isolation as recommendations
- Always pair genetic findings with "consult your clinician/pharmacist"
- Avoid imperative language directed at patients ("you should," "you must")
- Present findings as information, not instructions
- Include prominent disclaimer about need for clinical review

### 10.6 Export Governance

| Export Type | Authorization Required | Encryption | Retention | Watermark |
|---|---|---|---|---|
| **Full report (PDF)** | Ordering clinician approval | Password-protected AES-256 | Per policy | "Confidential - PGx Report" |
| **Raw genetic data (VCF/BAM)** | Lab director + patient consent | Full encryption, secure transfer | Per policy | "Raw data - professional interpretation required" |
| **Summary for EMR** | Ordering clinician approval | TLS transport | EMR retention | None |
| **Research dataset** | IRB approval + de-identification per Safe Harbor | Full encryption | Study-specific | "De-identified research data" |
| **Inter-facility transfer** | Patient consent + receiving facility verification | Full encryption | Receiving facility policy | "Inter-facility transfer" |
| **Patient request** | Patient identity verification | Password-protected or patient portal | Per HIPAA access rights | "Patient copy - clinical interpretation recommended" |
| **Legal/regulatory request** | Legal review + minimum necessary determination | Secure method per request | Per legal hold | "Legal/regulatory disclosure" |

### 10.7 Break-Glass Emergency Access

Emergency access to genetic data without normal authorization:

| Element | Requirement | Documentation |
|---|---|---|
| **Trigger conditions** | Life-threatening emergency; normal authorization not feasible due to time or system unavailability | Documented clinical emergency |
| **Approver** | On-call administrator, CMO, or designated medical director | Real-time approval required |
| **Justification** | Documented clinical reason for emergency access | Free-text justification required |
| **Scope** | Minimum necessary data only; full access not permitted in break-glass | Specify exact data elements needed |
| **Time limit** | Access expires after 72 hours unless formally extended | Auto-expiry enforced |
| **Patient notification** | Patient (or representative) notified within 24 hours | Email/mail notification logged |
| **Compliance review** | All break-glass events reviewed by compliance committee within 72 hours | Committee minutes required |
| **Escalation** | Events exceeding threshold trigger executive review | Threshold: >2 per month per role |
| **Safeguard** | All break-glass events automatically flagged for audit | Cannot be deleted or modified |
| **Training** | All potential break-glass users trained on appropriate use | Annual training required |

### 10.8 Data Retention Policies

| Data Type | Retention Period | Destruction Method | Post-Destruction |
|---|---|---|---|
| **Raw sequencing data (FASTQ)** | 30 days to 2 years (lab policy) | Secure deletion with certificate | Not recoverable |
| **Aligned reads (BAM)** | 1-2 years | Secure deletion with certificate | Not recoverable |
| **Variant call files (VCF)** | 10 years minimum | Secure deletion after retention | Permanent genetic record kept as summary |
| **Clinical reports** | 10 years minimum; 25 years for minors | Secure deletion after retention | Summary may be retained per policy |
| **Interpretation records** | 10 years minimum | Secure deletion after retention | Linked to report retention |
| **Audit logs** | 7 years minimum | Secure deletion after retention | Compliance records may be longer |
| **Consent records** | Duration of retention + 7 years | Secure deletion after retention | Legal protection |
| **Quality control records** | 7 years minimum | Secure deletion after retention | Per CLIA requirements |
| **Proficiency testing records** | 7 years minimum | Secure deletion after retention | Per CAP requirements |
| **Research data (de-identified)** | Per IRB protocol | Per IRB protocol | IRB determines retention |
| **Deleted data** | N/A (destroyed immediately per request) | NIST 800-88 compliant destruction | Certificate of destruction issued |

### 10.9 Governance Checklist

| # | Checklist Item | Frequency | Owner | Evidence |
|---|---|---|---|---|
| 1 | All user access reviewed and authorized | Quarterly | IT Security | Access review log |
| 2 | Audit logs reviewed for anomalies | Monthly | Compliance Officer | Audit review report |
| 3 | Consent forms verified current | Per test | Lab Staff | Consent verification log |
| 4 | Algorithm updates validated before deployment | Per release | Medical Director | Validation report |
| 5 | Evidence database updated | Continuous (Quarterly review) | Medical Director | Update log |
| 6 | Variant classification reviewed | Monthly | Lab Director | Classification review |
| 7 | Security penetration testing | Annually | IT Security | Pen test report |
| 8 | Disaster recovery drill | Annually | IT Operations | DR test report |
| 9 | Staff training on governance policies | Annually | HR/Compliance | Training records |
| 10 | Compliance with GINA/HIPAA/GDPR | Continuous | Compliance Officer | Compliance assessment |
| 11 | Break-glass access reviewed | Per event + quarterly | Compliance Committee | Meeting minutes |
| 12 | Data retention policy compliance | Quarterly | Data Governance | Retention audit |
| 13 | Third-party integration security review | Per integration | IT Security | Security assessment |
| 14 | Patient data requests fulfilled | Within 30 days | Privacy Officer | Request log |
| 15 | Adverse event reporting | Per event | Medical Director | Event report |
| 16 | Incident response plan tested | Annually | IT Security | IR test report |
| 17 | Business continuity plan tested | Annually | Operations | BC test report |
| 18 | Vendor risk assessment | Annually | Procurement/Security | Risk assessment |
| 19 | Genetic data access audit | Quarterly | Compliance Officer | Access audit report |
| 20 | Consent withdrawal processing | Per event | Privacy Officer | Processing log |

### 10.10 AI Governance Specifics

| Governance Element | Requirement | Implementation |
|---|---|---|
| **Algorithm versioning** | All algorithms versioned; no unversioned deployments | Git-based versioning with release tags |
| **Model card** | Every model has documented intended use, limitations, training data, performance metrics | Model card template; mandatory before deployment |
| **Human-in-the-loop** | All clinical outputs require human review; no fully autonomous clinical decisions | Workflow enforced at system level |
| **Bias auditing** | Regular audits for performance disparities across demographic groups | Quarterly bias reports; action plans for disparities |
| **Explainability** | Clinical outputs must be interpretable; citations required | Rule-based interpretation preferred over black-box for clinical claims |
| **Update governance** | Controlled update cycles; validation before deployment; rollback capability | Staged deployment; canary releases |
| **Training data governance** | Training data documented; consent verified; population composition audited | Data provenance documentation |
| **Performance monitoring** | Continuous monitoring of prediction accuracy; alerts for degradation | Automated monitoring dashboard |
| **Adversarial robustness** | Testing against adversarial inputs; input validation | Security testing per release |
| **Fallback procedures** | Clear procedures when AI fails or produces uncertain outputs | Default to conservative interpretation; escalate to human |

---

## 11. Decision-Support Principles

### 11.1 Present Evidence, Not Recommendations

| Principle | Implementation | Example |
|---|---|---|
| **State the finding** | Report genotype and predicted phenotype clearly | "CYP2D6 *4/*4 (poor metabolizer) detected" |
| **State the association** | Report the gene-drug association without prescribing language | "Poor metabolizers have reduced clearance of venlafaxine" |
| **State the evidence** | Always include grade and source | "CPIC Level 2A; Grade B evidence; PMID: 12345678" |
| **Present options** | List options without selecting one | "Consider dose reduction OR alternative not metabolized by CYP2D6" |
| **State uncertainty** | Always include uncertainty statement | "Individual response may vary; TDM recommended" |
| **Require clinician decision** | Final decision box requires clinician input | "[ ] I have reviewed and integrated this finding into clinical care" |

### 11.2 Always Include Uncertainty

Every output must include uncertainty quantification:
- Confidence intervals for all effect estimates
- Evidence grade for every claim
- Population applicability statement
- Known limitations of the analysis
- Factors that may modify the genetic prediction
- Statement that genetic predictions are probabilistic

### 11.3 Cite Sources

Every claim must be traceable to its source:

| Claim Type | Required Citation | Format |
|---|---|---|
| **CPIC guideline recommendation** | CPIC guideline reference, version, date | "CPIC Guideline: [Gene]-[Drug], [Year], [PMID]" |
| **Association finding** | Primary study PMID or DOI | "PMID: [ID]" |
| **Meta-analysis result** | Meta-analysis PMID or DOI | "Meta-analysis: PMID: [ID]" |
| **FDA label** | FDA label section, version date | "FDA Label [Drug], Section [X], [Date]" |
| **Population frequency** | gnomAD or ALFA database version | "gnomAD v[X], [Population]" |
| **Variant classification** | ClinVar accession, PharmGKB ID | "ClinVar: [RCV]; PharmGKB: [PAID]" |
| **DPWG guideline** | DPWG reference, date | "DPWG: [Gene]-[Drug], [Year]" |

### 11.4 Include Population Context

Every finding must specify:
- The population in which the evidence was generated
- The patient's ancestry/self-identified ethnicity
- Whether there is evidence in the patient's population
- Flag when evidence is not generalizable

### 11.5 Flag Research-Only Findings

Research-grade findings must be:
- Visually distinct (gray background, "RESEARCH" badge)
- Excluded from clinical summary reports
- Labeled with evidence grade "R"
- Accompanied by explicit "not for clinical action" disclaimer
- Separated from actionable findings in the UI
- Not included in any automated alerts or reminders

### 11.6 Require Clinician Review

The platform must enforce:
- Genetic results cannot be directly transmitted to patients
- Clinician must review and acknowledge each actionable finding
- Pharmacist consultation required for complex interactions
- System records timestamp of clinician review
- Unreviewed findings trigger alerts but do not auto-generate actions
- Research findings do not trigger alerts
- Uncertain findings trigger informational notices only

### 11.7 Never Claim Efficacy Prediction

Prohibited language patterns:

| Prohibited | Permitted Alternative |
|---|---|
| "This medication will work for this patient" | "This variant is associated with [increased/decreased] likelihood of response" |
| "Predicted response: 85%" | "Evidence for this gene-drug pair is [Grade X]; population response rate is [Y%]" |
| "Genetic profile indicates high likelihood of efficacy" | "No genetic information / Limited genetic information is available to predict efficacy" |
| "Optimal medication identified" | "Based on pharmacokinetic profile, [medication] may be metabolized [faster/slower] than average" |
| "This patient is a good candidate for [drug]" | "CYP profile suggests standard metabolism of [drug]; other factors also determine response" |
| "Will respond to treatment" | "Genetic factors may influence response; clinical monitoring essential" |

### 11.8 Never Claim Diagnosis

Pharmacogenomics does not diagnose disease:
- PGx variants are not diagnostic of psychiatric conditions
- PGx results do not confirm or exclude any diagnosis
- PGx results inform medication selection for existing diagnoses only
- The platform must not suggest diagnoses based on genetic findings
- Risk variants for psychiatric conditions (e.g., CACNA1C for bipolar disorder) are not part of pharmacogenomic testing scope
- If detected incidentally, psychiatric risk variants must not be reported as diagnostic

### 11.9 Decision-Support Output Template

```
=================================================================
PHARMACOGENOMIC DECISION SUPPORT SUMMARY
=================================================================
Patient: [ID] | Date: [DATE] | Ordering Clinician: [NAME]
Interpreter: [AI SYSTEM NAME vX.X] | Evidence Database: [vX.X]

GENES ANALYZED: [LIST OF GENES]
OVERALL ASSESSMENT: [N actionable / N research-grade / N uncertain]

-----------------------------------------------------------------
ACTIONABLE FINDINGS (Grade A-C)
-----------------------------------------------------------------
1. [GENE] - [PHENOTYPE] - Grade [X] - CPIC Level [Y]
   Associated medications: [LIST]
   Clinical implication: [DESCRIPTION]
   Evidence population: [ANCESTRY]
   Patient population match: [YES / NO / PARTIAL]
   Recommended consideration: [CONSIDER / MONITOR / NO ACTION]
   Drug-drug interaction check: [CLEAR / FLAGGED - see below]
   [CLINICIAN ACKNOWLEDGMENT REQUIRED]

2. [REPEAT FOR EACH ACTIONABLE FINDING]

-----------------------------------------------------------------
DRUG-DRUG-GENE INTERACTIONS
-----------------------------------------------------------------
[LIST ANY DETECTED INTERACTIONS THAT MODIFY GENETIC PREDICTIONS]

-----------------------------------------------------------------
RESEARCH-GRADE FINDINGS (Grade R) - NOT FOR CLINICAL ACTION
-----------------------------------------------------------------
1. [GENE] - [ASSOCIATION] - Grade R
   [NOT FOR CLINICAL ACTION - INFORMATIONAL ONLY]
   [DO NOT ACKNOWLEDGE - NO ACTION REQUIRED]

-----------------------------------------------------------------
UNCERTAIN FINDINGS (Grade D)
-----------------------------------------------------------------
1. [GENE] - [VUS] - Grade D
   [INSUFFICIENT EVIDENCE - NO CLINICAL ACTION]
   Next review: [DATE]

-----------------------------------------------------------------
POPULATION APPLICABILITY SUMMARY
-----------------------------------------------------------------
Patient reported ancestry: [X]
Evidence basis by ancestry: [SUMMARY TABLE]
Population limitations flagged: [Y/N]

-----------------------------------------------------------------
CURRENT MEDICATIONS CROSS-REFERENCE
-----------------------------------------------------------------
[LIST CURRENT MEDICATIONS WITH ANY PGx RELEVANCE]
[FLAG ANY KNOWN DRUG-DRUG INTERACTIONS]
[FLAG ANY KNOWN DRUG-GENE INTERACTIONS]

-----------------------------------------------------------------
CLINICIAN ACKNOWLEDGMENT
I have reviewed all pharmacogenomic findings and integrated them
with the patient's clinical context, including current medications,
organ function, age, and comorbidities.

[ ] I acknowledge that PGx findings are supportive context only
[ ] I have considered drug-drug interactions that may modify genetic predictions
[ ] I have considered patient-specific factors (age, weight, organ function)
[ ] I have reviewed population applicability for this patient
[ ] I have identified which findings require clinical action

Acknowledged by: [NAME] [DATE] [ELECTRONIC SIGNATURE]

PHARMACIST CONSULTATION: [RECOMMENDED / REQUIRED / NOT REQUIRED]
TDM RECOMMENDED: [YES / NO - LIST INDICATIONS]

=================================================================
```

### 11.10 Alert Design Principles

| Alert Type | Trigger | Presentation | Escalation |
|---|---|---|---|
| **Critical (CPIC 1A)** | Required genetic testing not performed before prescribing | Red alert; blocks or strongly warns | Requires acknowledgment; notification to prescriber and pharmacist |
| **High (CPIC 1B/2A)** | Significant gene-drug interaction with actionable evidence | Orange alert; requires acknowledgment | Clinician acknowledgment required |
| **Moderate (CPIC 2B)** | Gene-drug association with optional action | Yellow alert; informational | Acknowledgment recommended |
| **Low (Research)** | Research-grade finding | Gray informational; no alert | No action required |
| **Population mismatch** | Evidence population doesn't match patient ancestry | Yellow warning banner | Clinician awareness; heightened caution |
| **Drug-drug-gene** | Drug interaction modifies genetic prediction | Orange alert | Requires acknowledgment; pharmacist involvement recommended |
| **VUS detected** | Uncertain variant found | Gray informational | No action; flagged for re-analysis |

---

## 12. Quality Assurance

### 12.1 Variant Calling Quality Control

| QC Metric | Threshold | Action if Below Threshold | Frequency |
|---|---|---|---|
| **Coverage depth** | >= 30x for targeted regions | Re-sequence or flag as low confidence | Per sample |
| **Q score (Phred)** | >= 30 (99.9% accuracy) | Re-call or exclude variant | Per variant |
| **Variant quality score (GQ)** | >= 20 | Manual review or exclude | Per variant |
| **Allele balance** | 0.3-0.7 for heterozygotes | Flag for potential mosaicism or CNV | Per variant |
| **Read depth per variant** | >= 10 reads | Flag as low confidence | Per variant |
| **Strand bias (FS)** | < 60 | Manual review if exceeded | Per variant |
| **RMS mapping quality (MQ)** | >= 40 | Investigate mapping issues | Per sample |
| **Contamination estimate** | < 3% | Re-extract DNA or re-sequence | Per sample |
| **Ti/Tv ratio** | 2.0-2.2 for WGS; varies for panels | Investigate systematic errors | Per sample |
| **Heterozygous/homozygous ratio** | Within expected range for panel | Investigate if abnormal | Per sample |
| **GC content bias** | < 10% deviation from expected | Investigate library prep | Per batch |
| **Duplicate read rate** | < 20% | Investigate library prep or sequencing | Per sample |

### 12.2 Coverage Thresholds by Gene

| Gene | Minimum Coverage | Target Coverage | Critical Regions | Special Notes |
|---|---|---|---|---|
| CYP2D6 | 50x | 100x | Exons 1-9; CNV region (gene deletion/duplication) | CNV critical; false negatives common at low coverage |
| CYP2C19 | 30x | 50x | *2 (Exon 5), *3 (Exon 4), *17 (promoter) | Multiple key variants across gene |
| CYP2C9 | 30x | 50x | *2 (Exon 3), *3 (Exon 7) | Warfarin dosing critical |
| CYP2B6 | 30x | 50x | *6 (Exons 4, 5); *18 (Exon 5) | Important for HIV and pain management |
| CYP3A4 | 30x | 50x | *22 (intron 6); key exonic variants | *22 is intronic; requires targeted calling |
| CYP3A5 | 30x | 50x | *3 (intron 3); *6, *7 (exonic) | Reference allele matters for reporting |
| CYP1A2 | 20x | 30x | *1F (-163C>A promoter variant) | Inducibility prediction |
| CYP2A6 | 30x | 50x | Key variants for nicotine metabolism | May be relevant for smoking cessation |
| TPMT | 30x | 50x | *2 (Exon 5); *3A (Exons 7, 10); *3C (Exon 10) | Thiopurine toxicity prevention |
| NUDT15 | 30x | 50x | *2, *3, *4 (Exons 1-3) | Important in East Asians |
| DPYD | 30x | 50x | *2A (intron); HapB3 (intron); *13 (Exon 13) | Fluoropyrimidine toxicity |
| HLA-B | 100x | 200x | Full gene; exons 2 and 3 critical for typing | Long-range PCR or alternative approach needed |
| HLA-A | 100x | 200x | Full gene; exons 2 and 3 critical | For HLA-A*31:01 testing |
| SLCO1B1 | 30x | 50x | *5 (rs4149056, Exon 6) | Statin myopathy risk |
| VKORC1 | 30x | 50x | -1639G>A (promoter) | Warfarin sensitivity |
| UGT1A1 | 30x | 50x | *28 (promoter TA repeat) | Irinotecan toxicity; atazanavir |

### 12.3 Population Frequency Checks

Every called variant must be checked against population databases:

| Database | URL | Purpose | Update Frequency | Key Metrics |
|---|---|---|---|---|
| **gnomAD** | gnomad.broadinstitute.org | Population allele frequencies; flag ultra-rare variants | Quarterly releases | Allele frequency by population; constraint metrics |
| **dbSNP** | www.ncbi.nlm.nih.gov/snp | Variant annotation; rsID assignment | Per build | rsID mapping; validation status |
| **ClinVar** | www.ncbi.nlm.nih.gov/clinvar | Clinical significance; pathogenicity | Weekly | Star rating; review status |
| **PharmGKB** | www.pharmgkb.org | Pharmacogenomic annotations; CPIC guidelines | Continuous | Clinical annotations; variant annotations |
| **PharmVar** | www.pharmvar.org | Pharmacogene variation; star allele definitions | Continuous | Official star allele definitions |
| **ALFA** | www.ncbi.nlm.nih.gov/snp/docs/gps_freq | Allele frequency aggregator (dbGaP) | Per release | Large US population sample |
| **ClinGen** | www.clinicalgenome.org | Gene-disease validity; variant curation | Continuous | Expert curation; gene validity |
| **1000 Genomes** | www.internationalgenome.org | Global population reference | Legacy | Phase 3 data; super-populations |

Variants with population frequency > 5% that are annotated as pathogenic require manual review (may be benign in certain populations or may represent benign haplotype backgrounds).

### 12.4 Concordance with Known Controls

| Control Type | Purpose | Expected Concordance | Frequency |
|---|---|---|---|
| **NA12878 (Coriell)** | Reference sample with extensively characterized genotype | > 99.5% | Every run |
| **NA24385 (Ashkenazi son)** | Reference trio member | > 99.5% | Per batch |
| **Platinum Genomes (NA12878)** | High-confidence truth set from multiple platforms | > 99.9% | Per batch |
| **In-house positive controls** | Known variant carrier samples (one per major gene) | 100% for known variants | Every run |
| **In-house negative controls** | Known wild-type samples | 100% for tested variants | Every run |
| **Inter-laboratory comparison** | Cross-lab concordance testing | > 99% | Quarterly |
| **CAP proficiency testing** | External quality assessment | Score per CAP criteria | Per CAP schedule (3x/year) |
| **EMQN proficiency testing** | European external quality assessment | Score per EMQN criteria | Per EMQN schedule |

Minimum concordance requirement: **> 99.5%** with known controls for all called variants.

### 12.5 False Positive and False Negative Rates

| Metric | Target | Measurement Method | Reporting |
|---|---|---|---|
| **Analytical false positive rate** | < 0.1% | Comparison with orthogonal methods (Sanger sequencing, ddPCR) | Per batch |
| **Analytical false negative rate** | < 0.1% | Spike-in experiments with known variants at low frequency | Per validation |
| **Clinical false positive rate** | < 5% | Correlation with phenotype (where measurable); clinician feedback | Quarterly review |
| **Clinical false negative rate** | < 5% | Correlation with phenotype (where measurable); clinician feedback | Quarterly review |
| **CYP2D6 star allele concordance** | > 98% | Concordance with orthogonal method (MLPA, TaqMan CNV assay, long-range PCR) | Per batch |
| **HLA typing concordance** | > 99% | Concordance with SSO/SSP typing or Sanger | Per batch |
| **Copy number accuracy** | > 98% | CYP2D6 gene copy number concordance with qPCR or MLPA | Per batch |
| **Phasing accuracy** | > 95% | Concordance of cis/trans assignments with long-read sequencing | Per validation |

### 12.6 Reproducibility

| Reproducibility Check | Method | Frequency | Acceptance Criteria |
|---|---|---|---|
| **Intra-run reproducibility** | Duplicate samples within same run | Daily | 100% concordance for called variants |
| **Inter-run reproducibility** | Same sample across multiple runs | Weekly | > 99.5% concordance |
| **Inter-operator reproducibility** | Different technicians, same protocol | Monthly | > 99.5% concordance |
| **Inter-instrument reproducibility** | Same sample on different sequencers | Quarterly | > 99% concordance |
| **Inter-lot reproducibility** | Same sample with different reagent lots | Per new lot | > 99% concordance |
| **Long-term stability** | Same sample across 6-12 months | Annually | > 99% concordance |
| **Inter-laboratory reproducibility** | Split samples sent to reference labs | Annually | > 98% concordance |

### 12.7 Quality Assurance Checklist

| # | QA Check | Responsible | Frequency | Documentation |
|---|---|---|---|---|
| 1 | Verify all positive/negative controls passed | Lab tech | Every run | Control log |
| 2 | Check coverage depth across all target regions | Bioinformatician | Every run | Coverage report |
| 3 | Review variants with low quality scores (< GQ 20) | Lab director | Daily | QC review log |
| 4 | Flag novel or ultra-rare variants for manual review | Bioinformatician | Daily | Variant review log |
| 5 | Check population frequency consistency (gnomAD) | Bioinformatician | Daily | Frequency check log |
| 6 | Verify CYP2D6 star allele calling accuracy | Lab director | Weekly | Star allele QC |
| 7 | Review CYP2D6 CNV calls against orthogonal method | Lab director | Weekly | CNV concordance log |
| 8 | Monitor batch-level QC metrics for drift | QA manager | Weekly | Batch QC trending |
| 9 | Participate in external proficiency testing (CAP/EMQN) | Lab director | Per schedule | PT results |
| 10 | Review inter-laboratory concordance | QA manager | Annually | Concordance report |
| 11 | Validate pipeline updates against reference set | Bioinformatician | Per update | Validation report |
| 12 | Review false positive/negative trending | QA manager | Quarterly | Trend analysis |
| 13 | Audit all result modifications | Compliance officer | Monthly | Modification audit |
| 14 | Review VUS classification updates | Lab director | Monthly | Reclassification log |
| 15 | Validate evidence database updates | Medical director | Quarterly | Evidence validation |
| 16 | Review clinician feedback on discordant results | Medical director | Quarterly | Feedback analysis |
| 17 | Verify reagent lot performance | Lab tech | Per new lot | Lot validation |
| 18 | Calibrate instruments per schedule | Lab tech | Per manufacturer | Calibration log |
| 19 | Review no-call rate and reasons | Bioinformatician | Monthly | No-call analysis |
| 20 | Assess genotype-phenotype discordance rate | Medical director | Quarterly | Discordance review |

### 12.8 Quality Metrics Dashboard

The platform should maintain a real-time quality dashboard tracking:

| Metric | Current Target | Alert Threshold | Critical Threshold | Trending |
|---|---|---|---|---|
| Mean coverage depth | >= 50x | < 30x | < 20x | Weekly review |
| % target regions at >30x | >= 95% | < 90% | < 80% | Per batch |
| Variant call concordance (controls) | >= 99.5% | < 99% | < 98% | Per run |
| Contamination rate | < 3% | > 3% | > 5% | Per sample |
| CNV call accuracy (CYP2D6) | >= 98% | < 95% | < 90% | Per batch |
| Turnaround time | <= 10 business days | > 14 days | > 21 days | Weekly |
| VUS rate | <= 5% | > 10% | > 15% | Monthly |
| Control concordance | >= 99.5% | < 99% | < 98% | Per run |
| Reproducibility (inter-run) | >= 99.5% | < 99% | < 98% | Weekly |
| Proficiency testing scores | Pass | Borderline | Fail | Per PT event |
| Clinician-reported discordance | < 2% | > 5% | > 10% | Quarterly |
| False positive rate | < 0.1% | > 0.5% | > 1% | Quarterly |
| False negative rate | < 0.1% | > 0.5% | > 1% | Quarterly |
| Evidence database currency | < 30 days stale | > 60 days | > 90 days | Continuous |
| Algorithm version currency | Latest stable | > 1 version behind | > 2 versions behind | Per release |

### 12.9 Error Investigation and Corrective Action

When quality issues are identified:

```
QUALITY ISSUE DETECTED
         |
         v
+---------------------- Investigation ----------------------+
| 1. Identify scope: How many samples/patients affected?   |
| 2. Determine root cause: Technical? Algorithmic? Process?|
| 3. Assess patient impact: Any incorrect clinical results?|
| 4. Quarantine affected samples/reports                    |
+-----------------------------------------------------------+
         |
         v
+---------------------- Corrective Action ------------------+
| 1. Fix root cause                                        |
| 2. Re-process affected samples if needed                 |
| 3. Issue corrected reports if clinical impact            |
| 4. Notify affected clinicians if patient care affected   |
| 5. Document in CAPA (Corrective and Preventive Action)   |
| 6. Update SOPs if process issue                          |
| 7. Retrain staff if human error                          |
| 8. Verify fix with validation testing                    |
+-----------------------------------------------------------+
         |
         v
+---------------------- Follow-Up --------------------------+
| 1. Monitor metric for sustained improvement              |
| 2. Present at quality meeting                            |
| 3. Update risk register if applicable                    |
| 4. Report to regulatory authorities if required          |
+-----------------------------------------------------------+
```

### 12.10 Proficiency Testing and External Quality Assessment

| Program | Organization | Frequency | Scope |
|---|---|---|---|
| **Molecular Genetics PT** | CAP (College of American Pathologists) | 3x/year | Variant calling; interpretation |
| **Pharmacogenetics EQA** | EMQN (European Molecular Genetics Quality Network) | 2x/year | PGx-specific testing |
| **CYP2D6 Genotyping EQA** | Various academic centers | Annual | CYP2D6 star allele calling |
| **HLA Typing PT** | CAP, EFI (European Federation for Immunogenetics) | 3x/year | HLA genotyping accuracy |
| **Inter-laboratory comparison** | In-house or consortium | Quarterly | Cross-lab concordance |

### 12.11 Post-Market Surveillance

| Surveillance Element | Method | Frequency | Action Trigger |
|---|---|---|---|
| **Clinician feedback** | Survey, feedback form, case reports | Continuous | Discordance reports trigger investigation |
| **Genotype-phenotype discordance** | Systematic tracking of cases where genetic prediction didn't match clinical outcome | Quarterly | Rate > 5% triggers review |
| **Adverse event reports** | FDA MedWatch, internal reporting | Per event | All events investigated |
| **Literature monitoring** | Automated alerts for new publications on tested variants | Continuous | New evidence triggers re-analysis |
| **Database update impact** | Assess impact of ClinVar/PharmGKB updates on existing classifications | Monthly | Reclassifications trigger notification |
| **Patient outcomes tracking** | Where ethically and legally permissible, track outcomes of PGx-informed care | Per study | Outcomes data informs evidence updates |

---

## Appendices

### Appendix A: CPIC Gene-Drug Pairs with Strong Evidence (Level 1A/1B)

| Gene | Drug(s) | CPIC Level | Clinical Action | Population Considerations |
|---|---|---|---|---|
| CYP2D6 | Codeine | 1A | Avoid in PM (adults); avoid in UM and PM (children) | Pediatric critical; CNV testing essential |
| CYP2D6 | Tramadol | 1B | Consider alternative in PM; monitor in UM | Less critical than codeine |
| CYP2D6 | Atomoxetine | 1B | Consider dose adjustment in PM/UM | Pediatric ADHD population |
| CYP2C19 | Clopidogrel | 1A | Alternative antiplatelet (prasugrel, ticagrelor) for PM/IM | Higher PM rate in Asians; more impactful |
| CYP2C19 | Voriconazole | 2A | Adjust dose based on metabolizer status | Critical for immunocompromised |
| TPMT | Thiopurines (azathioprine, 6-MP) | 1A | Dose reduction (30-70%) or alternative for low activity | Essential before first dose |
| NUDT15 | Thiopurines | 1A | Dose reduction for variant carriers | Especially important in East Asians |
| HLA-B*57:01 | Abacavir | 1A | Required testing; contraindicated if positive | Required regardless of ancestry |
| HLA-B*15:02 | Carbamazepine | 1A | Strongly recommended testing in Asian populations | Primarily East/South Asian |
| HLA-B*15:02 | Phenytoin | 1A | Recommended testing in Asian populations | Primarily East/South Asian |
| HLA-A*31:01 | Carbamazepine | 1B | Recommended testing | European and Japanese populations |
| HLA-B*58:01 | Allopurinol | 1B | Recommended testing in high-risk populations | Han Chinese, Thai, Korean |
| CYP2C9 + VKORC1 | Warfarin | 1A | Consider genotype-guided dosing algorithm | Less predictive in African ancestry |
| CYP3A5 | Tacrolimus | 1A | Higher starting dose for expressors | Expressors mostly African ancestry |
| SLCO1B1 | Simvastatin | 1A | Lower dose or alternative for rs4149056 CT/TT | Avoid high-dose simvastatin in risk genotypes |
| DPYD | Fluoropyrimidines (5-FU, capecitabine) | 1A | Dose reduction or avoidance for reduced function | Critical; life-threatening toxicity |
| CYP2B6 | Efavirenz | 1A | Reduced dose (400mg) for slow metabolizers | Higher PM rates in Africans |
| G6PD | Rasburicase | 1B | Contraindicated in G6PD deficient | Screen males from high-prevalence populations |
| G6PD | Dapsone | 2A | Avoid or use with caution in G6PD deficient | Screen in at-risk populations |
| G6PD | Primaquine | 1A | Avoid in G6PD deficient | Screen in at-risk populations |
| IFNL3/IFNL4 | Peginterferon alfa (HCV) | 2A | Consider for HCV treatment decisions | Declining relevance with DAA therapies |
| CYP2C19 | PPIs (omeprazole, etc.) | 2B | May consider dose adjustment for H. pylori | Optional action |
| CYP2D6 | Ondansetron | 3 | Limited evidence for action | Emerging |

### Appendix B: FDA Table of Pharmacogenomic Biomarkers

| Biomarker | Drug(s) | FDA Label Section | Action Type |
|---|---|---|---|
| CYP2D6 metabolizer status | Atomoxetine, codeine, pimozide, tamoxifen, many TCAs, many antipsychotics | Dosage and Administration; Warnings | Information/Recommended |
| CYP2C19 metabolizer status | Clopidogrel, citalopram, escitalopram, voriconazole, diazepam, omeprazole | Dosage and Administration; Warnings | Recommended/Information |
| CYP2C9 genotype | Warfarin, phenytoin, celecoxib | Dosage and Administration | Recommended/Information |
| CYP2B6 genotype | Efavirenz | Dosage and Administration | Recommended |
| CYP3A5 genotype | Tacrolimus | Dosage and Administration | Recommended |
| TPMT activity | Azathioprine, 6-mercaptopurine, thioguanine | Dosage and Administration; Warnings | Required/Recommended |
| DPYD deficiency | Capecitabine, 5-FU | Contraindications; Warnings | Recommended |
| UGT1A1*28 | Irinotecan, atazanavir | Dosage and Administration | Recommended/Information |
| G6PD deficiency | Rasburicase, dapsone, primaquine | Contraindications | Required |
| HLA-B*57:01 | Abacavir | Boxed Warning; Contraindications | Required |
| HLA-B*15:02 | Carbamazepine, oxcarbazepine | Warnings; Precautions | Recommended |
| HLA-A*31:01 | Carbamazepine | Warnings | Recommended |
| HLA-B*58:01 | Allopurinol | Warnings | Recommended |
| SLCO1B1 | Simvastatin | Warnings | Recommended |
| CYP2C19 + CYP2D6 | Amitriptyline, nortriptyline | Dosage and Administration | Information |
| CYP4F2 | Warfarin | Dosage and Administration | Information |
| CYP2C9 + CYP4F2 + VKORC1 | Warfarin | Dosage and Administration | Recommended |
| BCR-ABL1 | Imatinib, dasatinib, nilotinib | Indications (companion diagnostic) | Required |
| EGFR | Osimertinib, erlotinib, gefitinib | Indications (companion diagnostic) | Required |
| ALK | Crizotinib, alectinib, brigatinib | Indications (companion diagnostic) | Required |
| ROS1 | Crizotinib, entrectinib | Indications (companion diagnostic) | Required |
| BRAF V600E | Dabrafenib, vemurafenib, encorafenib | Indications (companion diagnostic) | Required |
| NTRK | Larotrectinib, entrectinib | Indications (companion diagnostic) | Required |
| MSI-H/dMMR | Pembrolizumab | Indications (companion diagnostic) | Required |
| TMB-H | Pembrolizumab | Indications (companion diagnostic) | Required |
| PD-L1 | Atezolizumab, pembrolizumab, nivolumab | Indications (companion diagnostic) | Required |

### Appendix C: Key Reference Databases

| Database | URL | Content | Update Frequency | Access |
|---|---|---|---|---|
| **PharmGKB** | www.pharmgkb.org | PGx annotations, CPIC guidelines, variant annotations, clinical annotations | Continuous | Free; registration required |
| **CPIC** | cpicpgx.org | Clinical practice guidelines for gene-drug pairs | Quarterly | Free |
| **ClinVar** | www.ncbi.nlm.nih.gov/clinvar | Variant clinical significance; expert and submitter classifications | Weekly | Free |
| **gnomAD** | gnomad.broadinstitute.org | Population allele frequencies from large sequencing cohorts | Quarterly | Free |
| **dbSNP** | www.ncbi.nlm.nih.gov/snp | Variant catalog; rsID assignment | Per build | Free |
| **PharmVar** | www.pharmvar.org | Pharmacogene variation; official star allele definitions | Continuous | Free; registration required |
| **FDA PGx Table** | www.fda.gov/medical-devices/precision-medicine/table-pharmacogenetic-associations | FDA-recognized pharmacogenetic associations | Periodic | Free |
| **DPWG** | www.knmp.nl | Dutch Pharmacogenetics Working Group guidelines | Periodic | Free |
| **PubMed** | pubmed.ncbi.nlm.nih.gov | Primary biomedical literature | Continuous | Free search; some full-text requires subscription |
| **OMIM** | www.omim.org | Gene-disease relationships; genetic disorders | Continuous | Free search; full access requires subscription |
| **ClinGen** | www.clinicalgenome.org | Gene-disease validity; expert variant curation | Continuous | Free |
| **GeneCards** | www.genecards.org | Gene-centric database with multiple annotations | Continuous | Free |
| **GWAS Catalog** | www.ebi.ac.uk/gwas | Genome-wide association study results | Quarterly | Free |
| **ALFA** | www.ncbi.nlm.nih.gov/snp/docs/gps_freq | Allele frequency aggregator from dbGaP | Per release | Free |
| **DrugBank** | go.drugbank.com | Drug information including pharmacogenomic data | Periodic | Free; commercial license available |
| **DailyMed** | dailymed.nlm.nih.gov | FDA-approved drug labels | Continuous | Free |

### Appendix D: Evidence Grading Rubric (Detailed)

| Criterion | Weight | Scoring Rubric | Evidence Required |
|---|---|---|---|
| **Study design quality** | 25% | RCT (4) > Prospective cohort (3) > Retrospective cohort (2) > Case-control (1) > Case series (0.5) | Clear description of study methodology |
| **Sample size** | 20% | >1000 (4) > 500 (3) > 200 (2) > 100 (1) < 100 (0.5) | Per genotype group; total N |
| **Replication** | 20% | Multiple independent replications (4) > One replication (3) > Single study (1) > Failed replication (-1) | List of independent studies |
| **Effect size** | 15% | Large (OR>3) (4) > Moderate (OR 2-3) (3) > Small (OR 1.5-2) (2) > Very small (OR<1.5) (1) | OR/HR with 95% CI |
| **Precision** | 10% | Narrow CI (4) > Moderate CI (3) > Wide CI (2) > CI crosses null (0) | 95% CI reported |
| **Bias risk** | 10% | Low (4) > Some concerns (2) > High (0) | ROB assessment tool used |

**Composite Score Interpretation:**
- 15-20: **Grade A (Strong)** - Multiple high-quality studies; consistent replication; precise estimates; low bias risk
- 10-14: **Grade B (Moderate)** - At least one well-designed study; some replication; moderate precision
- 5-9: **Grade C (Optional)** - Limited studies; small samples; some inconsistency; wide CIs
- < 5: **Grade D (Insufficient)** - Case reports only; conflicting results; very small samples; high bias risk
- No clinical studies: **Grade R (Research only)** - Preclinical or preliminary evidence only

### Appendix E: Governance Audit Log Template

```
AUDIT LOG ENTRY
===============
Timestamp: [ISO 8601 format]
Event ID: [UUID v4]
Event Type: [ACCESS / MODIFY / EXPORT / DELETE / BREAK-GLASS / CONSENT / SYSTEM]
Event Severity: [INFO / WARNING / ERROR / CRITICAL]
User ID: [System user identifier]
User Role: [ROLE from RBAC matrix]
Patient ID: [Hashed/de-identified patient identifier]
Data Accessed: [GENES / FULL_REPORT / RAW_DATA / SUMMARY / CONSENT / AUDIT_LOG]
Action Taken: [VIEW / ACKNOWLEDGE / MODIFY / EXPORT / DELETE / GRANT_ACCESS / REVOKE_ACCESS]
Authorization Method: [NORMAL_AUTH / BREAK_GLASS / EMERGENCY / SYSTEM / API]
Authorization Reference: [Ticket number / Break-glass ID / API key hash]
IP Address: [Source IP]
Session ID: [Session identifier]
User Agent: [Browser/client information]
Success Status: [SUCCESS / FAILURE / DENIED / TIMEOUT]
Details: [Human-readable description of action]
Compliance Flags: [NONE / POPULATION_MISMATCH / VUS_DETECTED / EVIDENCE_INSUFFICIENT / CONSENT_EXPIRED / DDG_INTERACTION]
Data Hash: [SHA-256 hash of accessed data for integrity verification]
Previous Hash: [Hash of previous audit entry for chain verification]
```

### Appendix F: Patient-Facing Summary Template (Clinician-Approved Only)

> **Your Pharmacogenomic Test Results**
>
> Your doctor ordered a pharmacogenomic test to learn how your genes may affect your response to certain medications. This information may help your doctor choose medications and doses that are better suited to you.
>
> **What we found:**
> - Your body may process certain medications [faster/slower/differently] than average.
> - This may affect medications including: [LIST IN PLAIN LANGUAGE]
>
> **What this means:**
> - This is one piece of information your doctor will use, along with your symptoms, health history, and other factors.
> - Your genes do not determine whether a medication will work. They are one factor among many.
> - Your doctor will discuss what this means for your specific situation.
>
> **Important limitations:**
> - This test looks at specific genes. It does not test all genes that may affect medication response.
> - Your diet, other medications, and health conditions also affect how you respond to medications.
> - Scientific understanding of gene-medication interactions is still growing.
> - The test results are based on population-level data and may not perfectly predict your individual response.
>
> **Privacy:**
> - Your genetic information is protected by federal privacy laws.
> - It is protected for health insurance and employment purposes.
> - It is NOT protected for life insurance, disability insurance, or long-term care insurance in most states.
>
> **Questions?** Talk to your doctor or pharmacist. You may also speak with a genetic counselor.

### Appendix G: AI Safety Checklist for PGx Platforms

| # | Safety Check | Priority | Verification Method |
|---|---|---|---|
| 1 | All clinical outputs use probabilistic language (not deterministic) | Critical | Automated NLP check + manual review |
| 2 | All findings include evidence grade | Critical | System-enforced field |
| 3 | Research findings cannot trigger clinical alerts | Critical | System architecture enforcement |
| 4 | No autonomous prescribing capability exists | Critical | Architecture review; penetration testing |
| 5 | Clinician review required before patient-facing output | Critical | Workflow enforcement |
| 6 | Population context included for all findings | Critical | Template enforcement |
| 7 | Drug-drug-gene interactions flagged | High | Cross-reference medication list |
| 8 | VUS handled with transparent uncertainty language | High | Template enforcement |
| 9 | Confidence intervals included for all effect estimates | High | System-enforced |
| 10 | Sources cited for all claims | High | System-enforced citation field |
| 11 | Algorithm bias audited across populations | High | Quarterly bias reports |
| 12 | Break-glass access logged and reviewed | High | Automated logging + compliance review |
| 13 | Consent verified before any result display | Critical | System workflow gate |
| 14 | Data access fully audited | Critical | Immutable audit log |
| 15 | Patient data encrypted at rest and in transit | Critical | Encryption verification |
| 16 | Role-based access control enforced | Critical | RBAC system + access reviews |
| 17 | Algorithm updates validated before deployment | High | Staged validation pipeline |
| 18 | Fallback procedures exist for AI failure | High | Documented procedures; tested |
| 19 | Adverse event reporting system in place | High | Event tracking; regulatory reporting |
| 20 | Staff trained on AI governance policies | High | Training records; competency checks |
| 21 | No direct-to-patient prescribing language | Critical | Output review; automated filtering |
| 22 | No diagnosis claims from genetic data | Critical | Content filtering |
| 23 | Uncertainty tier system implemented | High | System-enforced templates |
| 24 | Ancestry mismatch warnings generated | High | Automated population matching |
| 25 | Pediatric-specific considerations included | High | Age-based template selection |
| 26 | Pregnancy-specific considerations included | Medium | Pregnancy status template selection |
| 27 | Geriatric-specific considerations included | Medium | Age-based template selection |
| 28 | Quality control metrics monitored continuously | Critical | Real-time dashboard |
| 29 | Proficiency testing participation verified | Critical | PT enrollment and results |
| 30 | Evidence database currency monitored | High | Automated staleness checks |

### Appendix H: Abbreviations and Definitions

| Abbreviation | Definition |
|---|---|
| **PGx** | Pharmacogenomics |
| **CYP** | Cytochrome P450 (enzyme superfamily) |
| **CPIC** | Clinical Pharmacogenetics Implementation Consortium |
| **DPWG** | Dutch Pharmacogenetics Working Group |
| **FDA** | Food and Drug Administration |
| **GINA** | Genetic Information Nondiscrimination Act |
| **HIPAA** | Health Insurance Portability and Accountability Act |
| **GDPR** | General Data Protection Regulation |
| **VUS** | Variant of Uncertain Significance |
| **GWAS** | Genome-Wide Association Study |
| **TDM** | Therapeutic Drug Monitoring |
| **EMR/EHR** | Electronic Medical/Health Record |
| **CLIA** | Clinical Laboratory Improvement Amendments |
| **CAP** | College of American Pathologists |
| **LDT** | Laboratory Developed Test |
| **IVD** | In Vitro Diagnostic |
| **IVDR** | In Vitro Diagnostic Regulation (EU) |
| **ACMG** | American College of Medical Genetics and Genomics |
| **NNT** | Number Needed to Treat |
| **NNH** | Number Needed to Harm |
| **OR** | Odds Ratio |
| **HR** | Hazard Ratio |
| **CI** | Confidence Interval |
| **AUC** | Area Under the Curve (pharmacokinetic) |
| **SJS/TEN** | Stevens-Johnson Syndrome / Toxic Epidermal Necrolysis |
| **HSR** | Hypersensitivity Reaction |
| **MACE** | Major Adverse Cardiac Event |
| **CNV** | Copy Number Variation |
| **SNP** | Single Nucleotide Polymorphism |
| **HLA** | Human Leukocyte Antigen |
| **EMQN** | European Molecular Genetics Quality Network |
| **SaMD** | Software as Medical Device |
| **CDS** | Clinical Decision Support |
| **IRB** | Institutional Review Board |
| **PHI** | Protected Health Information |
| **QC** | Quality Control |
| **QA** | Quality Assurance |
| **SOP** | Standard Operating Procedure |
| **CAPA** | Corrective and Preventive Action |
| **PM** | Poor Metabolizer |
| **IM** | Intermediate Metabolizer |
| **EM** | Extensive Metabolizer |
| **UM** | Ultrarapid Metabolizer |
| **SSRIs** | Selective Serotonin Reuptake Inhibitors |
| **TCAs** | Tricyclic Antidepressants |

---

## Document Control

| Version | Date | Author | Changes | Reviewed By |
|---|---|---|---|---|
| 1.0 | [Date] | DeepSynaps Research | Initial comprehensive framework | Medical Director, Compliance Officer |

**Review Schedule:** Quarterly  
**Next Review Date:** [Date + 3 months]  
**Approving Authority:** Medical Director / Chief Scientific Officer / AI Safety Committee  
**Distribution:** Platform architects, clinical team, bioinformaticians, compliance officers, AI safety reviewers, legal counsel

**Document Classification:** Internal - Research & Governance  
**Retention Period:** Duration of platform operation + 7 years  
**Related Documents:** Clinical SOPs, Quality Manual, Privacy Policy, Security Policy, AI Governance Policy

---

*This document represents the current state of evidence and regulatory requirements as of its creation date. Pharmacogenomics is a rapidly evolving field. All recommendations should be verified against current CPIC guidelines, FDA labels, and primary literature before clinical application. This document is intended for research and governance framework purposes and does not constitute clinical guidance. The safe wording templates must be reviewed and approved by legal counsel before implementation. Regulatory requirements vary by jurisdiction; compliance with all applicable local, state, federal, and international regulations is the responsibility of the implementing organization.*
