# QEEG AI Safety Governance Report

**Document ID**: QEEG-AI-SGR-2025
**Version**: 1.0
**Classification**: Clinical Safety & Governance Framework
**Scope**: Clinical quantitative EEG (qEEG) systems augmented with artificial intelligence

---

## 1. Executive Summary

This report establishes a comprehensive safety governance framework for clinical qEEG systems that incorporate artificial intelligence (AI) for interpretation support. qEEG -- the mathematical transformation and compression of raw EEG signals into graphical representations -- has become increasingly prevalent in critical care, neurology, psychiatry, and neurofeedback settings. When combined with AI-driven interpretation, these systems present unique safety risks that require structured governance.

**Key findings**: The convergence of qEEG analysis with AI interpretation introduces risks of diagnostic overclaiming, normative database bias, artifact misinterpretation, source localization errors, and clinical liability diffusion. This document provides evidence-based safety rules, governance structures, and implementation protocols to mitigate these risks.

---

## 2. qEEG Overclaiming Risks

### 2.1 Definition and Scope

qEEG overclaiming refers to the extrapolation of quantitative EEG findings beyond their validated evidentiary base. This includes:
- Assigning diagnostic significance to statistically deviant qEEG values without clinical correlation
- Using qEEG as a standalone diagnostic instrument rather than a supportive adjunct
- Generalizing from research populations to individual clinical presentations
- Conflating statistical deviation from normative databases with pathological significance

### 2.2 Evidence of Overclaiming Risk

Clinical literature demonstrates that qEEG findings must always be interpreted within the full clinical context:

- **Naturalistic study limitations**: A multicenter effectiveness trial of QEEG-informed neurofeedback (Arns et al.) noted that naturalistic, open-label designs without control conditions may inflate effect sizes, and that non-specific mechanisms (structured environment, regular intervals of training, coaching on sleep hygiene) may impact clinical outcomes independently of the qEEG findings themselves.

- **Medication confounds**: The majority of patients in clinical qEEG studies use concurrent medications including stimulants, sleep medications, benzodiazepines, and antidepressants. Post-hoc analyses on medication-free samples show reduced statistical significance, demonstrating that medication effects can drive apparent qEEG "abnormalities."

- **Granularity limitations**: While qEEG techniques can distinguish broad categories of EEG abnormality (epileptiform-focal, epileptiform-generalized, nonepileptiform-focal, nonepileptiform-diffuse), the clinical significance of subtle deviations remains uncertain.

### 2.3 Safety-Governance Implications

qEEG systems must be explicitly designed and labeled to prevent overclaiming:
- Output framing must use "supportive context only" language
- Systems must not generate diagnostic statements without human expert review
- Statistical deviations must be presented with confidence intervals and population-relevance disclaimers

---

## 3. Normative Database Limitations

### 3.1 Critical Constraints

Normative databases are foundational to qEEG interpretation, yet carry significant limitations:

#### 3.1.1 Sampling and Representativeness

- **Demographic balance**: Representative sampling requires balanced distribution across gender, ethnic background, socioeconomic status, and age. "Street normal" subjects that meet exclusion criteria are the practical standard, but ensuring truly representative populations remains challenging.
- **Sample size determination**: Database sample size is dictated by effect size, statistical power requirements, Gaussian distribution needs, cross-validation requirements, cost, and collection duration. These constraints often result in underpowered subgroups.
- **Database construction standards**: Split-half reliability and test-retest reliability measures should exceed 0.9 to demonstrate internal consistency and reliability of the normative database.

#### 3.1.2 Age-Related Validity Issues

- **Pediatric granularity**: In pediatric databases, sample sizes may need to differ by **months rather than years** due to dramatic developmental changes occurring over short time intervals. Growth spurts in mental development create rapid qEEG shifts that standard age-grouping cannot capture.
- **Age regression**: Age regression methods are used to adjust for age-related qEEG variations, but these statistical adjustments introduce their own modeling assumptions and potential errors.
- **Developmental trajectory**: EEG features show high-amplitude, slow-frequency delta power predominating in infants that decreases into childhood, while higher frequency power (theta and alpha) increases with age. Children demonstrate frequency admixtures similar to adults only beginning in early teenage years.
- **Maturation milestones**: EEG changes are particularly rapid in early life -- modifications appear by 2 weeks in premature babies, by 1 month in infancy, by 1 year in childhood, with adult patterns reached only between ages 8-12 years.

#### 3.1.3 Acquisition Duration Reliability

- qEEG sampling at 20 seconds achieves only 82% reliability
- 40 seconds achieves 90% reliability
- 60 seconds achieves 92% reliability
- Current standards recommend **at least 60 seconds, preferably 2-5 minutes** of artifact-free EEG recordings for clinical evaluation

#### 3.1.4 Ethnicity and Socioeconomic Bias

Normative databases may systematically underrepresent certain ethnic and socioeconomic groups, creating risk of:
- Misclassification of normal variant patterns as pathological
- Algorithmic bias in AI models trained on non-representative data
- Health equity disparities in automated interpretation systems

---

## 4. Pediatric Interpretation Risks

### 4.1 Unique Vulnerabilities

Pediatric qEEG interpretation carries elevated risk due to:

#### 4.1.1 Rapid Developmental Change
The two major determinants of pediatric EEG features are vigilance level and age. Standard examination includes spontaneous sleep until age 5, hyperventilation and intermittent light stimulation in older children. Hyperventilation may modify the tracing physiologically until adolescence. These age-dependent variables create unique normative challenges.

#### 4.1.2 Limited Normative Data

- **Critical gap**: There is a **lack of normative data in critically ill children**, which limits qEEG validity in pediatric ICU settings.
- **Medication effects**: Children in ICUs rarely have completely normal electrographic brain function. Sedating medications commonly contribute to EEG abnormalities. By altering the electrophysiologic profile, these medications may impact qEEG interpretation in acute neurological injuries.
- **Age-specific values**: A recent study reported qEEG features from 1,289 healthy volunteers including more than 500 pediatric patients (ages 4.5-20 years), but substantial gaps remain for infants and toddlers.

#### 4.1.3 Validation Status

- qEEG is **not yet ready to be used as an independent tool in pediatric neurocritical care**
- Findings should **always be verified with review of raw EEG**
- There are **no guidelines for standardized reviewing and reporting of qEEG** in pediatrics
- Many patterns have **not been studied extensively or validated in children**
- **Formal training in qEEG interpretation is not widely available** for pediatric populations

### 4.2 Safety Requirements for Pediatric qEEG

- Enhanced informed consent procedures for pediatric subjects
- Age-specific normative database validation with monthly granularity for infants
- Mandatory raw EEG verification by pediatric neurophysiologist
- Explicit medication-effect documentation
- Conservative interpretation thresholds

---

## 5. Artifact Confounds

### 5.1 Artifact Categories

EEG signals are measured in microvolts and are extremely sensitive to contamination. Artifacts are any signal components that do not originate from the brain:

#### 5.1.1 Physiological Artifacts

| Artifact Type | Origin | Frequency Range | Impact |
|---|---|---|---|
| Ocular (blinks/movement) | Corneo-retinal dipole reorientation | Low-frequency, high-amplitude | Can exceed EEG signals of interest |
| Muscle activity | Facial/neck muscle contractions | Broadband 20-300 Hz | Overlaps key EEG frequencies |
| Cardiac (ECG/BCG) | Pulsatile heart signals | Rhythmic | Particularly problematic in EEG-fMRI |
| Respiration/perspiration | Breathing, sweat | Slow drifts | Alters electrode impedance |

#### 5.1.2 Non-Physiological (Technical) Artifacts

| Artifact Type | Origin | Characteristic |
|---|---|---|
| Electrode pop/cable movement | Sudden impedance changes | Transient spikes |
| Poor contact/reference error | Incorrect placement | Baseline shifts, exaggerated noise |
| AC power interference | Ambient 50/60 Hz coupling | Non-shielded environments |
| Subject motion | Head/body movements | Large, non-linear noise bursts |

### 5.2 Clinical Impact of Artifacts

Artifacts can closely resemble abnormal EEG patterns:
- Epileptiform discharges
- Rhythmic slowing
- Sharp waves or spikes

**Critical risk**: Misinterpreting artifact as pathology can lead to:
- Incorrect diagnoses
- Unnecessary treatments
- Missed true abnormalities hidden beneath noise

### 5.3 De-Artifacting Challenges

- **Manual de-artifacting**: Subjective, with suboptimal inter- and intra-rater reliability
- **Semi-automatic methods**: Require human oversight, introducing variability
- **Fully automatic methods**: Eliminate inter-/intra-rater variability but may fail to detect subtle artifacts
- **Artifact correction vs. rejection**: Correction methods (e.g., blind source separation) attempt to remove artifacts without losing underlying EEG signal; rejection methods remove entire contaminated segments

### 5.4 AI-Specific Artifact Vulnerabilities

AI-based EEG systems face unique artifact challenges:
- **Noise and artifacts from external/internal sources** significantly impede EEG signal quality and AI interpretation fidelity
- **Human variability** (skull thickness, scalp conductivity, cognitive states) creates inter- and intra-individual differences that AI may misattribute to pathology
- **Data acquisition instability** (electrode-skin resistance changes, broken/disconnected channels, malfunctioning devices) leads to data degradation
- AI systems may learn to classify artifact patterns rather than neural signals, creating spurious "accuracy"
- Recent studies show AI EEG model performance **diminishes in recordings with high artifact content** or subtle abnormalities

---

## 6. Source Localization Caveats

### 6.1 Fundamental Limitations

EEG source localization reconstructs brain electrical activity from scalp measurements by solving the EEG "inverse problem." This process is mathematically ill-posed and subject to multiple sources of error.

### 6.2 Conductivity Uncertainty

The **brain-to-skull conductivity ratio (BSCR)** is the most sensitive parameter in EEG source localization:

| BSCR Value | Source | Implication |
|---|---|---|
| 80:1 | Rush & Driscoll (electrolytic tank) | Historical standard, now questioned |
| 15:1 | Oostendorp et al. (in vivo/in vitro) | Much lower ratio, substantially different localization |
| 24.8 +/- 6.6 | Lai et al. | Intermediate estimate |
| 18.7 +/- 2.1 | Zhang et al. | Simultaneous intra-/extra-cranial recordings |

**Localization errors from misspecified BSCR**:
- Noise-free measurements: 2-16 mm error with incorrect BSCR
- Noise-contaminated measurements: 8-18 mm error regardless of BSCR used
- Even with correct BSCR, noise alone causes ~9 mm localization error
- Skull conductivity mis-estimation can produce errors up to **31 mm** for superficial sources

### 6.3 Head Model Limitations

| Factor | Impact on Localization |
|---|---|
| Template MRI vs. individual MRI | Template MRI produces less precise localization |
| Electrode co-registration error (5-7 mm shift) | Up to 12 mm error for superficial sources |
| Missing white matter layer | Up to 18.6 mm error for basal dipoles |
| Insufficient channel density (31 vs. 128 electrodes) | Significantly higher errors for all dipole sources |
| CSF layer omission | Significant error increase; CSF is critical for accuracy |
| Skull anisotropy | Additional error source not captured by most models |

### 6.4 Clinical Implications

- EEG source localization is **increasingly used in epilepsy** for focus localization and functional mapping
- Accuracy is validated against intracranial recordings and surgical outcomes as "gold standard"
- However, **low-density EEGs with template MRIs show limited accuracy**
- Distributed source models (e.g., LORETA, sLORETA, eLORETA) are preferred for multifocal epilepsy but still subject to fundamental inverse problem constraints

### 6.5 AI-Augmented Localization Risks

When AI is applied to source localization:
- AI may present localization results with false precision
- Deep learning models may not propagate uncertainty estimates
- Automated interpretation may obscure the ill-posed nature of the inverse problem

---

## 7. AI Interpretation Safety Framework

### 7.1 Robust AI in EEG Systems

Research on robust AI in EEG systems identifies critical factors impacting safety:

#### 7.1.1 Noise and Artifacts
External (electromagnetic interference, muscle movements) and internal (heart rhythms, eye movements) noise sources compromise signal-to-noise ratio, making analysis difficult. Mitigation requires stringent protocols and robust signal processing algorithms.

#### 7.1.2 Human Variability
Inter-individual differences in skull thickness, scalp conductivity, cognitive states, and temporal variations (fatigue, mental state changes) impact EEG signals. AI systems must generalize across these differences or implement adaptive algorithms.

#### 7.1.3 Data Acquisition Instability
Technical issues including electrode-skin resistance changes, disconnected channels, and malfunctioning devices lead to data loss or degradation. Solutions require hardware improvements and error detection/correction algorithms.

#### 7.1.4 Adversarial Vulnerabilities
AI systems may be vulnerable to adversarial inputs that exploit model weaknesses, though this is less studied in clinical EEG than in imaging applications.

### 7.2 Clinical Validation Requirements

The **SCORE-AI model** (Standardized Computer-based Organized Reporting of EEG-Artificial Intelligence) provides a benchmark for clinical validation:

| Validation Element | SCORE-AI Implementation | Safety Requirement |
|---|---|---|
| Development dataset | 30,493 EEGs from multiple centers | Large, representative, multi-site |
| Annotation standardization | SCORE-EEG standardized tool with 17 experts | Standardized, multi-expert consensus |
| Test independence | Independent test datasets; fixed/frozen model | No post-hoc model adjustment |
| Human reference standard | 11 independent experts for multicenter test | Independent from development |
| Cross-equipment validation | Different EEG equipment in test sets | Generalization across hardware |
| Clinical validation metrics | Accuracy, sensitivity, specificity, calibration | Full diagnostic accuracy reporting |

### 7.3 AI Performance Benchmarks

| Application | Minimum Performance Standard | Notes |
|---|---|---|
| Epilepsy screening | Sensitivity >=90%, FAR <=0.67/24h | ILAE/IFCN Phase 3 standard |
| Sleep staging | Cohen's kappa >=0.76 | Within human-human agreement |
| Abnormality detection | Sensitivity >=75%, Specificity >=90% | For clinical utility |
| AD detection (research) | AUROC >=0.85 | Multi-site external validation required |
| AI-expert agreement | Cohen's kappa >=0.80 | "Almost perfect" concordance |

---

## 8. FDA Guidance on EEG AI / Clinical Decision Support

### 8.1 Clinical Decision Support Software (CDS) Framework

The FDA's Clinical Decision Support Software Guidance (September 2022, updated January 2026) establishes four criteria for non-device CDS:

| Criterion | Requirement | EEG AI Implication |
|---|---|---|
| **Criterion 1** | Not intended to acquire, process, or analyze medical image or signal | Many EEG AI functions **FAIL** this -- they analyze EEG signals |
| **Criterion 2** | Intended to display, analyze, or print patient-specific information | EEG AI may meet this if it displays existing EEG data |
| **Criterion 3** | Intended to support or provide recommendations (not direct diagnosis/treatment) | EEG AI must frame output as **supportive only**, not directive |
| **Criterion 4** | Enable HCP to independently review basis for recommendations | Must include plain-language algorithm description, validation data, logic/methods summary |

### 8.2 Critical FDA Determinants

- **Time-critical decisions**: Software for critical, time-sensitive tasks is **less likely** to qualify as non-device CDS because HCPs lack time for independent review
- **AI/LLM-enabled CDS**: May meet Criterion 4 if it enables independent review of recommendation basis
- **Single risk score output**: FDA may exercise enforcement discretion if clinically appropriate
- **Alerts and alarms**: Not explicitly carved out; must enable independent review of recommendation basis

### 8.3 Transparency Requirements (Criterion 4)

For qEEG AI systems to meet FDA guidance:

a) **Purpose statement**: Include intended use, intended HCP user, intended patient population
b) **Input specification**: Identify required input data with instructions on acquisition, relevance, and quality requirements
c) **Algorithm transparency**: Provide plain-language description including:
   - Summary of logic/methods (statistical modeling, AI/ML techniques)
   - Description of training/validation data representativeness
   - Clinical validation results with sub-population performance
d) **Output design**: Provide patient-specific information, knowns/unknowns, missing/corrupted/unexpected data flags

### 8.4 Healthcare AI Governance Standard (HAIGS) Requirements

The Healthcare AI Governance Standard establishes seven core principles:

1. **Patient Safety**: Prevention of harm during AI system use
2. **Transparency**: Clarity regarding how AI functions and makes decisions
3. **Accountability**: Stakeholder responsibility for ethical deployment
4. **Privacy**: Protection of patient data from unauthorized access
5. **Fairness**: Equitable treatment avoiding biases and discrimination
6. **Informed Consent**: Ensuring patients understand and agree to AI use
7. **Equity**: Ensuring AI does not exacerbate health disparities

### 8.5 Organizational Governance Requirements

Per HAIGS and clinical AI governance frameworks:

- **Establish Oversight**: Governance committee with legal, medical, regulatory, and ethics representatives
- **Define Roles and Responsibilities**: Clear accountability from governance to operational staff
- **Data Governance**: Authoritative sources, lineage, stewardship; HIPAA-aligned access rules
- **Risk Management**: AI risk taxonomy covering clinical safety, privacy, security, bias, reliability
- **Ethical Oversight**: Multidisciplinary review including clinicians, patients/advocates, data scientists
- **Model Cards**: Plain-language summaries for clinicians and patients including benefits, limitations, monitoring plans

---

## 9. Never-Diagnose Framing

### 9.1 Principle

qEEG AI systems must be architecturally and linguistically designed to **never diagnose**. This is a fundamental safety constraint, not merely a labeling choice.

### 9.2 Implementation Requirements

| Element | Never-Diagnose Implementation |
|---|---|
| **Output language** | Use "pattern observed," "deviation from expected range," "correlation with [condition] in [X]% of published cases" |
| **Prohibited language** | Never use "diagnoses," "confirms," "rules out," "pathognomonic for" |
| **Confidence framing** | Express findings as probability ranges with explicit uncertainty quantification |
| **Clinical correlation** | Every output must include mandatory "clinical correlation required" statement |
| **Human review gate** | No diagnostic conclusion may be generated without human expert review |

### 9.3 Linguistic Architecture

The system must use **conditional, probabilistic language**:
- "The observed [pattern] has been associated with [condition] in [X]% of cases in [specific population]"
- "This finding should be interpreted in the context of clinical presentation and other diagnostic data"
- "qEEG findings alone are insufficient for diagnostic determination"

---

## 10. "Supportive Context Only" Language

### 10.1 Definition

"Supportive context only" is the governing interpretive paradigm for qEEG AI output. It means:

- qEEG AI provides **contextual information** that may support or inform clinical reasoning
- It does **not replace** clinical judgment, history-taking, physical examination, or other diagnostic testing
- It is **one data point among many** in the clinical assessment
- Its value lies in **pattern quantification and trend monitoring**, not diagnostic determination

### 10.2 Mandatory Disclaimers

Every qEEG AI report must include:

> **"This qEEG analysis is provided for supportive context only. It is not a diagnostic tool. These findings must be interpreted by a qualified clinician in conjunction with the full clinical picture, including patient history, physical examination, and other diagnostic testing. qEEG findings alone cannot confirm or exclude any medical condition."**

### 10.3 Clinical Workflow Integration

- qEEG AI output should be presented alongside raw EEG traces for expert review
- Systems should highlight epochs of interest for efficient human verification
- Automated analysis should be adjustable by human experts
- Discrepancies between AI output and expert interpretation should be logged for quality improvement

---

## 11. Urgent Findings Governance

### 11.1 Definition of Urgent qEEG Findings

Urgent findings in qEEG monitoring require immediate clinical attention:

| Category | qEEG Signature | Clinical Context |
|---|---|---|
| Status epilepticus | Persistent rhythmic/periodic discharges | ICU, altered mental status |
| Cerebral ischemia | Focal loss of faster frequencies, delta increase | Stroke, vasospasm |
| Severe encephalopathy | Global alpha attenuation, burst suppression | Hypoxic injury, sedation |
| Hemispheric asymmetry | Persistent asymmetry spectrogram changes | Mass lesion, subdural hemorrhage |
| Cerebral herniation patterns | Triphasic morphology progression | Elevated ICP |

### 11.2 Escalation Protocol

```
URGENT FINDING DETECTED
         |
    [AI flags finding]
         |
    vvvvvvvvvvvvvvv
[Immediate raw EEG alert]
         |
    vvvvvvvvvvvvvvv
[Notify on-call neurophysiologist]
         |
    vvvvvvvvvvvvvvv
[Alert primary clinical team]
         |
    vvvvvvvvvvvvvvv
[Document timestamp & response]
         |
    vvvvvvvvvvvvvvv
[Verify with raw EEG within 15 min]
```

### 11.3 Governance Requirements

- **Response time standards**: Raw EEG verification within 15 minutes of qEEG alert
- **Escalation pathway**: Clear chain of command for urgent finding communication
- **False positive tracking**: Monitor and trend false positive rates to prevent alarm fatigue
- **Documentation**: Every urgent finding alert and response must be documented
- **Quality review**: Periodic audit of urgent finding detection accuracy

### 11.4 Alarm Fatigue Mitigation

qEEG seizure detection algorithms demonstrate variable false positive rates:
- Stellate Harmonie: 126.3 false positive events/day (92% sensitivity)
- Persyst: 5.1 false positive events/day (76% sensitivity)

Excessive false positives lead to alarm fatigue, medication overuse, and staff desensitization. Governance must:
- Set institutional false positive rate thresholds
- Require algorithm performance validation before deployment
- Implement tiered alert systems (warning vs. critical)
- Monitor alert response times and override rates

---

## 12. Medical Liability Framework

### 12.1 Liability Distribution

When AI is applied to qEEG interpretation, liability may be distributed across multiple parties:

| Scenario | Primary Liability | Basis |
|---|---|---|
| Assistive AI (human review retained) | Clinician bears liability | Independent evaluation possible; standard negligence principles |
| Autonomous AI (no specialist oversight) | AI developer/company | Physician lacks specialized knowledge; product liability |
| Workflow integration failure | Healthcare institution | Vicarious liability ("respondeat superior") |
| Algorithm defect | AI developer | Product liability claim |
| Failure to train clinicians | Healthcare institution | Corporate negligence |

### 12.2 Risk Mitigation

- **Clinicians must remain final decision-makers**
- Documentation must reflect **independent clinical reasoning**
- AI influence should be **contextualized**, not blindly adopted
- Vendors should clearly provide indications and possible adverse effects
- Developers should investigate and report adverse events/system failures

### 12.3 Legal Oversight Checklist

Risk assessment must include:
- Regulatory classification and clearance status
- Intended use versus actual deployment
- Documentation standards for AI-assisted decisions
- Training protocols for clinicians
- Data governance and model update transparency

---

## 13. Data Governance and Quality

### 13.1 Training Data Requirements

Per FDA AI credibility assessment framework:

- Development datasets must be **representative of target patient population**
- Data must include relevant subgroups, disease conditions, collection sites
- Independent development and validation datasets required
- Labels/annotations must be established with validated reference methods
- Data collection, processing, annotation, storage, and control must be documented

### 13.2 Bias Mitigation

- Evaluate algorithm performance across demographic subgroups
- Monitor for amplification of racial and demographic disparities
- Assess confounding variables (medication, comorbidity, acquisition conditions)
- Implement fairness metrics in model evaluation
- Regular bias audits with transparent reporting

### 13.3 Model Life Cycle Maintenance

- Performance metrics with risk-based monitoring frequency
- Triggers for model retesting defined prospectively
- Version control for all model changes
- Change reporting to regulatory bodies when performance is impacted
- Established conditions for post-approval change management

---

## 14. Top 20 Safety Rules

The following safety rules govern all clinical qEEG AI systems. These rules are non-negotiable requirements for safe deployment.

### Rule 1: Never-Diagnose Architecture
**qEEG AI systems must be architecturally incapable of generating diagnostic statements.** System design must prevent any output that could be interpreted as a definitive diagnosis, regardless of confidence level.

### Rule 2: Supportive Context Only Framing
**All qEEG AI output must be explicitly framed as "supportive context only."** Every report, display, and communication must include this designation and explain that qEEG findings alone are insufficient for diagnostic determination.

### Rule 3: Mandatory Raw EEG Verification
**All qEEG findings must be verified by review of raw EEG traces by a qualified neurophysiologist.** qEEG trends are summaries that may miss small-magnitude changes, short-duration events, or focal abnormalities limited to few electrodes.

### Rule 4: Normative Database Transparency
**The normative database used for comparison must be fully documented, including:** sample size, demographic distribution, age groupings, exclusion criteria, acquisition protocol, reliability statistics, and last update date.

### Rule 5: Pediatric Age Granularity
**Pediatric qEEG interpretation must use age-specific normative data with monthly granularity for children under 2 years and at minimum yearly granularity through adolescence.** Standard adult normative databases must never be applied to pediatric patients.

### Rule 6: Medication Effect Documentation
**All neuroactive medications must be documented and considered in qEEG interpretation.** Systems must flag when medication effects may confound qEEG findings.

### Rule 7: Artifact Detection and Reporting
**All qEEG AI systems must include automated artifact detection with transparent reporting of artifact burden.** Outputs must be suppressed or flagged when artifact burden exceeds validated thresholds.

### Rule 8: Source Localization Uncertainty Quantification
**All source localization results must include uncertainty estimates.** Reports must state the head model used (individual vs. template MRI), electrode count, BSCR assumption, and expected localization error range.

### Rule 9: Ethnicity and Demographic Bias Audit
**qEEG AI systems must undergo regular bias audits evaluating performance across ethnic, gender, age, and socioeconomic subgroups.** Disparities in performance must be documented and mitigated.

### Rule 10: Urgent Finding Escalation Protocol
**All qEEG AI systems must have a defined urgent finding escalation protocol with:** response time standards, notification chain, documentation requirements, and raw EEG verification within 15 minutes.

### Rule 11: False Positive Rate Monitoring
**False positive rates must be continuously monitored and trended.** Systems exceeding institutional false positive thresholds must be recalibrated or suspended.

### Rule 12: Algorithm Validation Documentation
**All qEEG AI algorithms must have published validation data including:** sensitivity, specificity, PPV, NPV, calibration curves, and sub-group performance metrics across clinical contexts.

### Rule 13: Human-in-the-Loop Requirement
**A qualified human expert must review all qEEG AI output before it informs clinical decisions.** No autonomous clinical action may be taken based solely on qEEG AI output.

### Rule 14: Informed Consent for AI-Assisted Analysis
**Patients must be informed when AI-assisted qEEG analysis is used in their care,** including the system's purpose, limitations, and the role of human expert review.

### Rule 15: Model Version Control and Change Management
**All qEEG AI models must have version control with documented change logs.** Performance impact of any model update must be evaluated before deployment.

### Rule 16: Acquisition Quality Assurance
**EEG acquisition must meet minimum quality standards** (at least 60 seconds, preferably 2-5 minutes of artifact-free recording) before qEEG AI analysis. Low-quality recordings must be rejected or flagged.

### Rule 17: Clinical Correlation Mandate
**Every qEEG AI report must include a mandatory "clinical correlation required" statement** with guidance on what clinical information is needed for proper interpretation.

### Rule 18: Adverse Event Reporting
**All adverse events or near-misses involving qEEG AI systems must be reported** through institutional patient safety systems and to relevant regulatory bodies.

### Rule 19: Training and Competency Verification
**All clinicians using qEEG AI systems must complete training** on system capabilities, limitations, and proper interpretation. Competency must be verified before system access is granted.

### Rule 20: Continuous Performance Monitoring
**qEEG AI systems must undergo continuous performance monitoring** with periodic re-evaluation against reference standards, trending of key metrics, and defined criteria for system suspension or recalibration.

---

## 15. Implementation Checklist

| Phase | Action Item | Responsible Party | Timeline |
|---|---|---|---|
| Pre-deployment | Algorithm validation review | Data Science + Clinical Lead | Week 1-2 |
| Pre-deployment | Normative database audit | Clinical Neurophysiologist | Week 1-2 |
| Pre-deployment | Bias assessment across subgroups | AI Ethics Committee | Week 2-3 |
| Pre-deployment | Urgent finding protocol design | Clinical Operations | Week 2-3 |
| Pre-deployment | Staff training program development | Education Department | Week 3-4 |
| Pre-deployment | Informed consent language review | Legal + Ethics | Week 3-4 |
| Deployment | Pilot with limited patient population | Clinical Lead | Month 2 |
| Deployment | Raw EEG verification compliance audit | Quality Improvement | Ongoing |
| Deployment | False positive rate monitoring | Clinical Engineering | Ongoing |
| Post-deployment | Monthly performance review | Governance Committee | Monthly |
| Post-deployment | Quarterly bias audit | AI Ethics Committee | Quarterly |
| Post-deployment | Annual comprehensive safety review | Governance Committee | Annually |

---

## 16. References and Sources

### Key Sources Consulted

1. FDA Guidance for Industry: Clinical Decision Support Software (September 2022, Updated January 2026)
2. FDA: Considerations for the Use of AI to Support Regulatory Decision Making (2025)
3. Healthcare AI Governance Standard (HAIGS) 2024
4. JAMA Neurology: SCORE-AI -- Automated Interpretation of Clinical EEGs Using AI (2023)
5. Frontiers in Digital Health: Governance of Clinical AI Applications (2022)
6. PMC: Review of Noninvasive Neuromonitoring in Critical Care -- qEEG Limitations
7. PMC: EEG Source Localization -- Conductivity Uncertainty and Accuracy
8. PMC: AI Governance Framework for Safe and Equitable Healthcare (2025)
9. PMC: Defining Medical Liability When AI is Applied on Diagnostic Algorithms (2023)
10. arXiv: Interpretable and Robust AI in EEG Systems -- A Survey (2024)
11. Frontiers in Neurology: EEG Source Imaging -- A Practical Review (2019)
12. PMC: Multicenter Effectiveness Trial of QEEG-Informed Neurofeedback
13. Integris Neuro: Artifacts in EEG -- How to Recognize and Reduce Common Recording Pitfalls
14. Bitbrain: EEG Artifacts -- Types, Detection, and Removal Techniques
15. Primer Scientific: Validation of qEEG -- Technical and Statistical Milestones
16. PMC: Utility of Quantitative EEG in Neurological Emergencies
17. Handbook of Clinical Neurology: Developmental Aspects of Normal EEG (Plouin et al.)
18. PMC: Recent Applications of qEEG in Adult ICUs -- Comprehensive Review
19. medRxiv: Evaluating and Validating an AI Model for Automated EEG Analysis (2025)
20. Frontiers in Human Neuroscience: Deep Learning Approaches for EEG-based Healthcare Applications (2025)

---

## 17. Document Control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2025 | DeepSynaps Protocol Studio | Initial release |

---

*This document was prepared as a safety governance framework for clinical qEEG AI systems. It synthesizes regulatory guidance, peer-reviewed evidence, and established clinical standards. All rules and recommendations should be adapted to local institutional policies and applicable regulatory requirements.*
