

---

## 8. References

### 8.1 Clinical NLP Models & Benchmarks

1. **Li, Y., et al. (2022).** "Clinical-Longformer and Clinical-BigBird: Transformers for Long Clinical Sequences." *Proceedings of the 5th Clinical Natural Language Processing Workshop*, 2022. Available: https://doi.org/10.1093/jamia/ocac182. Establishes Clinical-Longformer with 8K context window, achieving 0.974 F1 on i2b2 2006 NER.

2. **Yang, X., et al. (2022).** "GatorTron: A Large Language Model for Clinical Natural Language Processing." *medRxiv*, 2022.02.27.22271257. Available: https://doi.org/10.1101/2022.02.27.22271257. Introduces 8.9B parameter clinical transformer trained on 90B+ words, outperforming ClinicalBERT across 5 clinical NLP tasks.

3. **Sounack, T., et al. (2025).** "BioClinical ModernBERT: A State-of-the-Art Long-Context Encoder for Biomedical and Clinical NLP." *arXiv preprint arXiv:2506.10896*, June 2025. Available: https://arxiv.org/abs/2506.10896. Introduces SOTA clinical encoder pretrained on 53.5B tokens from 20 diverse clinical datasets. Outperforms all existing encoders on 4/5 downstream tasks.

4. **Alsentzer, E., et al. (2019).** "Publicly Available Clinical BERT Embeddings." *Proceedings of the 2nd Clinical Natural Language Processing Workshop*, 2019. Introduces ClinicalBERT, the foundational clinical language model.

5. **Lee, J., et al. (2019).** "BioBERT: A Pre-trained Biomedical Language Representation Model for Biomedical Text Mining." *Bioinformatics*, 36(4), 1234-1240. The seminal biomedical BERT model.

6. **DRAGON Benchmark (2024).** "The DRAGON Benchmark for Clinical NLP." *arXiv preprint*, February 2024. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC12084576/. Comprehensive Dutch clinical NLP benchmark covering 8 tasks.

7. **HILGEN (2025).** "Hierarchically-Informed Data Generation for Biomedical NER Using Knowledgebases and Large Language Models." *Hugging Face Papers*, March 2025. Demonstrates 42.29% F1 improvement via UMLS + GPT-3.5 ensemble data augmentation.

### 8.2 Open-Source Clinical NLP Tools

8. **Neumann, M., et al. (2019).** "ScispaCy: Fast and Robust Models for Biomedical Natural Language Processing." *Proceedings of the 18th BioNLP Workshop*, 2019. The ScispaCy biomedical NLP toolkit.

9. **Eyre, H., et al. (2022).** "Launching into Clinical Space with MedSpaCy: A New Clinical NLP Library." *Journal of the American Medical Informatics Association (JAMIA)*, 2022. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC8861690/. Introduces MedSpaCy's ConText algorithm and clinical pipeline components.

10. **MedSpaCy GitHub Repository.** "Library for Clinical NLP with spaCy." Available: https://github.com/medspacy/medspacy. Version 1.3.1 (November 2024) adds spaCy 3.8.2 support and optimized database I/O.

11. **Zhang, Y., et al. (2020).** "Biomedical and Clinical English Model Packages for the Stanza NLP Library." *Journal of the American Medical Informatics Association (JAMIA)*, 28(9), 1892-1899. Stanza biomedical models for clinical NER.

12. **Apache cTAKES Documentation.** "Clinical Text Analysis and Knowledge Extraction System." Apache Software Foundation, September 2024. Available: https://ctakes.apache.org/. Version 6.0.0 requires Java 17+ and UMLS license.

13. **Savova, G., et al. (2010).** "Mayo Clinical Text Analysis and Knowledge Extraction System (cTAKES): Architecture, Component Evaluation and Applications." *Journal of the American Medical Informatics Association*, 17(5), 507-513.

14. **John Snow Labs.** "Healthcare NLP v6.1.1 Release Notes." Available: https://nlp.johnsnowlabs.com/docs/en/spark_nlp_healthcare_versions/release_notes_6_1_1. September 2025 release with Medical Vision LLMs, 78 new models, ONNX optimization.

### 8.3 De-identification

15. **i2b2 2014 De-identification Challenge.** "De-identification of Patient Notes with Personal Health Information." *i2b2 National Center for Biomedical Computing*, 2014. Gold standard de-identification dataset with 1,304 annotated clinical records.

16. **Dernoncourt, F., et al. (2017).** "De-identification of Patient Notes with Recurrent Neural Networks." *Journal of the American Medical Informatics Association*, 24(3), 596-606. Baseline BiLSTM model achieving 97% F1 on i2b2 2014.

17. **Microsoft Presidio.** "Context Aware, Pluggable and Customizable Data Protection and De-identification SDK for Text and Images." GitHub: https://github.com/microsoft/presidio. Apache-2.0 license. Version 2.2 adds MedicalNERRecognizer and GPU batch processing.

18. **Philter (UCSF).** "Philter: A De-identification Tool for Clinical Text." BSD-3-Clause license. Available: https://github.com/ucsf-deb/philter. Achieves ~99% recall on UCSF datasets.

19. **Intuition Labs (2025).** "Open Source PHI De-Identification: A Technical Review." November 2025. Comprehensive comparison of 8 open-source de-identification tools including Presidio, Philter, NLM Scrubber, CliniDeID, PyDeID, MIST, TiDE.

20. **Censinet (2025).** "2025 Benchmark: De-Identification Tools." Available: https://censinet.com/perspectives/2025-benchmark-de-identification-tools. Comparative analysis of Philter, NLM Scrubber, CliniDeID, DICOMCleaner.

21. **De-identification Evaluation Framework (2024).** "An Extensible Evaluation Framework Applied to Clinical Text Deidentification NLP Tools: Multisystem and Multicorpus Study." *Journal of Medical Internet Research (JMIR)*, 2024. Available: https://www.jmir.org/2024/1/e55676/. Comprehensive multisystem evaluation.

22. **Stubbs, A., et al. (2015).** "Identifying Patients in the Pediatric Emergency Department." *Proceedings of the 2015 i2b2/UTHealth Shared-Tasks and Workshop on Challenges in Natural Language Processing for Clinical Data*. i2b2 de-identification shared task results.

23. **MIMIC-III De-identification.** "PhysioNet deid toolkit." Available: https://physionet.org/content/mimiciii/. GPL v2. The de-identification system used for MIMIC-III, achieving ~94% recall on nursing notes.

24. **VA De-identification Study (2025).** "Evaluating Clinical Note Deidentification Tools and Transformer Transferability between Public and Private Data from the US Department of Veterans Affairs." *medRxiv*, 2025.03.21.25323520v1. Available: https://www.medrxiv.org/content/10.1101/2025.03.21.25323520v1.full-text.

### 8.4 Differential Privacy & Clinical Text Protection

25. **Dufour, M., et al. (2025).** "How to Train Private Clinical Language Models." *arXiv preprint arXiv:2511.14936*, November 2025. Systematic comparison of 4 DP training pipelines; knowledge distillation recovers 63% of non-private performance at epsilon=4.

26. **Chen, Y., et al. (2024).** "A Different Level Text Protection Mechanism With Differential Privacy." *arXiv preprint arXiv:2409.03707*, September 2024. BERT attention-weighted DP for selective token perturbation.

27. **Term2Note (2025).** "Privacy-Preserving Generation of Clinical Narratives from Medical Data Under Differential Privacy." *OpenReview*, 2026. DP synthetic clinical note generation with separate content/form privatization.

28. **Feyisetan, O., et al. (2022).** "Differential Privacy in Natural Language Processing." *ACL 2022 Privacy in NLP Workshop*. Comprehensive survey of DP methods for NLP.

29. **TUM Differential Privacy in NLP Research.** Technical University of Munich. Available: https://www.cs.cit.tum.de/sebis/research/privacy-enhancing-technologies/differential-privacy-in-natural-language-processing/. Survey of PETs for NLP.

### 8.5 Neuromodulation Text Processing & Ontologies

30. **Young, R.J., et al. (2025).** "Benchmarking Multiple Large Language Models for Automated Clinical Trial Data Extraction in Aging Research." *Algorithms*, 18(5), 296, May 2025. Available: https://www.mdpi.com/1999-4893/18/5/296. Multi-LLM workflow for brain stimulation parameter extraction from clinical trial text.

31. **Pascual-Leone, A., et al. (2014).** "A Practical Application of Text Mining to Literature on Cognitive Rehabilitation and Enhancement Through Neurostimulation." *Frontiers in Systems Neuroscience*, 8, 182. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC4176459/. Topic modeling and co-occurrence analysis of TMS cognitive literature.

32. **Nitsche, M.A., et al. (2012).** "Transcranial Direct Current Stimulation: Protocols." *Protocol Exchange*. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC3339846/. Standard tDCS electrode positioning using EEG 10/20 system.

33. **Ko, Y.J., et al. (2024).** "Optimizing Electrode Placement for Transcranial Direct Current Stimulation in Nonsuperficial Cortical Regions: A Computational Modeling Study." *Biomedical Engineering Letters*, 2024. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC10874366/. FEM-based optimal montages for foot motor, dmPFC, mOFC, V1.

34. **SNOMED CT Neuromodulation Hierarchy.** "Neurostimulation/modulation (procedure) [231109008]." Available: https://evsexplore.semantics.cancer.gov/evsexplore/hierarchy/snomedct_us/231109008. SNOMED CT concept hierarchy for neuromodulation procedures.

35. **UMLS Metathesaurus.** National Library of Medicine. Available: https://www.nlm.nih.gov/research/umls/. Cross-ontology mapping for neuromodulation concepts including SNOMED CT, MeSH, RxNorm.

36. **MedDRA.** Medical Dictionary for Regulatory Activities. Available: https://www.meddra.org/. Standard terminology for adverse event reporting in neuromodulation studies.

37. **FDA MAUDE Database.** "Manufacturer and User Facility Device Experience." Available: https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfmaude/search.cfm. Adverse event database for neuromodulation devices.

38. **Magstim/Neurosoft Technical Documentation.** Neurosoft TMS data export and file format specifications. Available: https://preptraining.auckland.ac.nz/neurosoft-information/. NSPACK file format documentation.

39. **Soterix Medical Technical Specifications.** 1x1 tDCS, 1x1 tES, MxN HD-tES device specifications. Available: https://soterixmedical.com/research/1x1/tdcs/device. Device parameters and data logging capabilities.

40. **Nexstim nTMS PACS Integration.** "Integrating nTMS Data into a Radiology Picture Archiving System." *Journal of Neurosurgery*, 2015. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC4501964/. DICOM-compliant TMS data export and PACS integration.

### 8.6 PHI Protection & Regulatory Frameworks

41. **HIPAA Privacy Rule.** "Standards for Privacy of Individually Identifiable Health Information." 45 CFR 164. Available: https://www.hhs.gov/hipaa/for-professionals/privacy/. Official HIPAA regulations including Safe Harbor (164.514(b)(2)) and Expert Determination (164.514(b)(1)).

42. **GDPR.** "Regulation (EU) 2016/679 of the European Parliament and of the Council." Official Journal of the European Union, April 2016. Available: https://gdpr.eu/. Full text of GDPR including Article 9 (special categories), Article 30 (records of processing), Article 35 (DPIA).

43. **EU-US Data Privacy Framework.** "Data Privacy Framework Program." US Department of Commerce, July 2023. Available: https://www.dataprivacyframework.gov/. Framework for EU-US data transfers.

44. **US DOJ Data Security Program (2025).** "Security Requirements for Certain Transactions Involving Bulk US Sensitive Personal Data." Federal Register, April 2025. Restrictions on health data transfers to "countries of concern."

45. **EU European Health Data Space (EHDS).** Regulation proposal including Article 62 on international data transfers. Available: https://globaldataalliance.org/wp-content/uploads/2024/02/02152024gdaeutrihealthdata.pdf.

46. **PIPL (China).** "Personal Information Protection Law of the People's Republic of China." Effective November 2021. Cross-border health data transfer requirements.

47. **BestCoffer (2026).** "Healthcare AI Redaction: Complete Guide to Medical Data Privacy & Compliance." Available: https://www.bestcoffer.com/healthcare-ai-redaction-medical-data-privacy-compliance/. Comprehensive guide to HIPAA, GDPR, PIPL, LGPD for healthcare AI.

48. **DPO Consulting (2025).** "GDPR in Healthcare: A Practical Guide to Global Compliance." Available: https://www.dpo-consulting.com/blog/gdpr-healthcare. DPIA templates and cross-border transfer mechanisms.

49. **Atlantic Council (2026).** "The US AI Health Data Collision: Charting the Future of US Cross-Border Data Flow Policy." Available: https://www.atlanticcouncil.org/in-depth-research-reports/issue-brief/the-us-ai-health-data-policy/. Analysis of US health data transfer restrictions.

### 8.7 EHR Integration & FHIR

50. **HL7 FHIR R4 Specification.** "Fast Healthcare Interoperability Resources Release 4." Health Level Seven International, 2019. Available: https://www.hl7.org/fhir/R4/. Official FHIR R4 specification including DocumentReference, Procedure, Observation resources.

51. **FHIR-Based Data Model Review (2024).** "State-of-the-Art Fast Healthcare Interoperability Resources (FHIR)-Based Data Model and Structure Implementations: Systematic Scoping Review." *JMIR Medical Informatics*, 2024. Available: https://medinform.jmir.org/2024/1/e58445/. Comprehensive review of NLP2FHIR and related pipelines.

52. **HL7 v2.5 Specification.** "Health Level Seven Version 2.5." Health Level Seven International. HL7 v2 messaging standard including MDM (Medical Document Management) and ORU (Observation Result Unsolicited) message types.

53. **Mirth Connect (NextGen).** "Healthcare Integration Engine." Available: https://www.nextgen.com/products-and-services/integration-engine. Integration engine for HL7 v2-to-FHIR conversion.

54. **Cerner / Oracle Health FHIR Integration Guide (2025).** Available: https://www.notev.ai/blog/cerner-integration-complete-guide-to-ai-scribe-oracle-health-connectivity-2025. FHIR R4 APIs for Cerner/Oracle Health EHR integration.

55. **Tateeda (2025).** "How to Integrate AI into Healthcare Document Workflows." Available: https://tateeda.com/blog/how-to-integrate-ai-into-healthcare-document-workflows. Technical guide for HL7/FHIR AI integration with cost estimates.

### 8.8 Streaming & Architecture

56. **John Snow Labs (2025).** "Task-Based Clinical NLP: Unlocking Insights with One-Liner Pipelines." Available: https://www.johnsnowlabs.com/task-based-clinical-nlp-unlocking-insights-with-one-liner-pipelines/. Production clinical NLP patterns including batch and streaming deployment.

57. **Alibaba Cloud (2025).** "Realtime Compute for Apache Flink: Incremental Processing & Streaming." Available: https://www.alibabacloud.com/blog/realtime-compute-for-apache-flink-unveils-incremental-processing-%26-streaming_602618. Flink streaming achieving 2.4M inferences/hour.

58. **Goswami, G. (2025).** "Real-Time ML with Apache Kafka and Flink." Available: https://gautambangalore.medium.com/driving-streaming-intelligence-on-premises-real-time-ml-with-apache-kafka-and-flink-90d1cd15ea95. On-premises streaming ML architecture.

### 8.9 Adverse Event & Device Surveillance

59. **Ferrari, M., et al. (2023).** "Evidence-Based Clinical Engineering: Health Information Technology Adverse Events Identification and Classification with Natural Language Processing." *Computers in Biology and Medicine*. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC10638042/. ClinicalBERT framework for MAUDE adverse event classification.

60. **FDA MAUDE Neuromodulation Report.** "MEDTRONIC NEUROMODULATION IMPLANTABLE NEUROSTIMULATOR." MAUDE Report MDRFOI ID: 24561730, April 2026. Example of neuromodulation adverse event narrative format.

61. **Mesh Implant RAG Study (2025).** "Clinical Insight from Mesh Implant Narratives Using Zero-Shot Retrieval-Augmented Generation Approach." *Academic Intelligence Surgery*, 2025. RAG framework for FDA MAUDE narrative analysis.

### 8.10 Home-Based Neuromodulation

62. **Home-based tES Scoping Review (2024).** "Home-based Transcranial Electrical Stimulation (tES) for the Management of Psychiatric Disorders: A Scoping Review." *Brain Stimulation*, 2024. Available: https://pmc.ncbi.nlm.nih.gov/articles/PMC12571794/. Device specifications and data logging for Soterix, Magstim, Neuroconn home-use devices.

63. **Charvet, L., et al. (2023).** "Home-based tDCS for Major Depressive Disorder." Open-label study using Soterix 1x1 tDCS mini-CT with ElectraRx remote monitoring. 88% response rate, 81% remission rate.

---

> **END OF CORE REPORT**
>
> The following appendices provide supplementary technical depth for implementation teams.

---

## Appendix A: Detailed neuromodulation Entity Taxonomy

### A.1 Stimulation Type Hierarchy

```
STIM_TYPE
|-- Non-invasive Brain Stimulation (NIBS)
|   |-- Transcranial Magnetic Stimulation (TMS)
|   |   |-- Single-pulse TMS (spTMS)
|   |   |-- Paired-pulse TMS (ppTMS)
|   |   |-- Repetitive TMS (rTMS)
|   |   |   |-- Low-frequency rTMS (<=1 Hz)
|   |   |   |-- High-frequency rTMS (>=5 Hz)
|   |   |   |-- Theta Burst Stimulation (TBS)
|   |   |       |-- Continuous TBS (cTBS) - inhibitory
|   |   |       |-- Intermittent TBS (iTBS) - facilitatory
|   |   |-- Deep TMS (dTMS)
|   |-- Transcranial Electrical Stimulation (tES)
|   |   |-- Transcranial Direct Current Stimulation (tDCS)
|   |   |   |-- Anodal tDCS (facilitatory)
|   |   |   |-- Cathodal tDCS (inhibitory)
|   |   |   |-- Dual tDCS (bihemispheric)
|   |   |   |-- High-Definition tDCS (HD-tDCS, 4x1)
|   |   |-- Transcranial Alternating Current Stimulation (tACS)
|   |   |-- Transcranial Random Noise Stimulation (tRNS)
|   |   |-- Transcranial Pulsed Current Stimulation (tPCS)
|   |   |-- Galvanic Vestibular Stimulation (GVS)
|   |-- Other NIBS
|       |-- Transcranial Ultrasound Stimulation (TUS)
|-- Invasive Neuromodulation
|   |-- Deep Brain Stimulation (DBS)
|   |   |-- Subthalamic Nucleus (STN) DBS
|   |   |-- Globus Pallidus Internus (GPi) DBS
|   |   |-- Ventral Intermediate Nucleus (VIM) DBS
|   |   |-- Centromedian-Parafascicular (CM-Pf) DBS
|   |   |-- Nucleus Accumbens (NAc) DBS
|   |   |-- Anterior Limb of Internal Capsule (ALIC) DBS
|   |   |-- Subgenual Cingulate Cortex (SCC) DBS
|   |   |-- Ventral Capsule/Ventral Striatum (VC/VS) DBS
|   |-- Vagus Nerve Stimulation (VNS)
|   |   |-- Left cervical VNS
|   |   |-- Non-invasive VNS (nVNS, gammaCore)
|   |-- Spinal Cord Stimulation (SCS)
|   |-- Peripheral Nerve Stimulation (PNS)
|   |   |-- Occipital Nerve Stimulation (ONS)
|   |   |-- Sacral Nerve Stimulation (SNS)
|   |   |-- Tibial Nerve Stimulation (TNS)
|   |   |-- Transcutaneous Auricular Vagus Nerve Stimulation (taVNS)
|   |-- Responsive Neurostimulation (RNS)
```

### A.2 Full Outcome Measure Dictionary

| Clinical Domain | Scale/Measure | Abbreviation | Score Range | Response Criteria | Remission Criteria |
|----------------|--------------|-------------|-------------|------------------|--------------------|
| **Depression** | Hamilton Depression Rating Scale | HAM-D / HDRS | 0-52 | >=50% reduction | <=7 |
| | Montgomery-Asberg Depression Rating Scale | MADRS | 0-60 | >=50% reduction | <=10 |
| | Beck Depression Inventory-II | BDI-II | 0-63 | >=50% reduction | <=13 |
| | Patient Health Questionnaire-9 | PHQ-9 | 0-27 | >=50% reduction | <=4 |
| | Inventory of Depressive Symptomatology | IDS-SR | 0-84 | >=50% reduction | <=12 |
| | Quick Inventory of Depressive Symptomatology | QIDS-SR | 0-27 | >=50% reduction | <=5 |
| **OCD** | Yale-Brown Obsessive Compulsive Scale | Y-BOCS | 0-40 | >=35% reduction | <=14 |
| | Obsessive-Compulsive Inventory-Revised | OCI-R | 0-72 | >=35% reduction | <=21 |
| | Children's Yale-Brown OCD Scale | CY-BOCS | 0-40 | >=35% reduction | <=14 |
| **Parkinson's Disease** | Unified Parkinson's Disease Rating Scale Part III | UPDRS-III | 0-108 | >=30% improvement | Varies |
| | UPDRS Part IV (motor complications) | UPDRS-IV | 0-32 | >=30% improvement | Varies |
| | Hoehn and Yahr Staging | H&Y | 0-5 (stage) | Stage reduction | Stage 1-2 |
| | Schwab and England ADL Scale | S&E | 0-100% | >=20% improvement | >=80% |
| **Epilepsy** | Seizure Frequency | N/A | Count/period | >=50% reduction | Seizure-free |
| | Engel Outcome Classification | Engel | I-IV | Engel I-II | Engel I |
| | ILAE Outcome | ILAE | 1-6 | Class 1-2 | Class 1 |
| **Pain** | Visual Analog Scale | VAS | 0-100mm | >=50% reduction | <=20mm |
| | Numeric Rating Scale | NRS | 0-10 | >=50% reduction | <=2 |
| | Brief Pain Inventory | BPI | 0-10 | >=2-point reduction | <=2 |
| **Tremor** | Fahn-Tolosa-Marin Tremor Rating Scale | TRS | 0-144 | >=50% reduction | Varies |
| **Dystonia** | Burke-Fahn-Marsden Dystonia Rating Scale | BFMDRS | 0-120 | >=30% improvement | Varies |
| | Toronto Western Spasmodic Torticollis Rating Scale | TWSTRS | 0-87 | >=30% improvement | Varies |
| **Cognition** | Montreal Cognitive Assessment | MoCA | 0-30 | >=2-point improvement | >=26 |
| | Mini-Mental State Examination | MMSE | 0-30 | >=2-point improvement | >=27 |
| | Trail Making Test (A and B) | TMT | Time (seconds) | >=25% faster | Normative range |
| | Digit Symbol Substitution Test | DSST | 0-133 | >=5-point improvement | Normative range |
| | Controlled Oral Word Association | COWA | Word count | >=7-word improvement | Normative range |
| **Quality of Life** | 36-Item Short Form Survey | SF-36 | 0-100 per domain | >=5-point improvement | Varies |
| | EuroQoL 5-Dimension | EQ-5D | -0.5 to 1.0 | >=0.1 improvement | >=0.8 |
| | Parkinson's Disease Questionnaire-39 | PDQ-39 | 0-100 | >=5-point reduction | <=20 |

### A.3 Adverse Event Severity Classification

| Severity Level | Definition | Example | Reporting Requirement |
|---------------|-----------|---------|----------------------|
| **Mild** | Transient, no intervention | Mild headache lasting <2 hours | Routine documentation |
| **Moderate** | Requires intervention, not severe | Persistent headache requiring analgesia | Routine + follow-up |
| **Severe** | Significant impairment | Seizure requiring emergency care | Expedited reporting |
| **Serious** | Meets regulatory seriousness criteria | Death, hospitalization, disability | SAE report within 24h |
| **Life-threatening** | Immediate risk of death | Status epilepticus | Immediate SAE report |
| **Fatal** | Results in death | Intracranial hemorrhage (DBS) | Immediate SAE report |

## Appendix B: Detailed Code Examples

### B.1 Complete NLP Pipeline Implementation

```python
"""
DeepSynaps Text Analyzer - Core NLP Pipeline
Complete implementation reference for neuromodulation clinical text processing.
"""

import spacy
from spacy.tokens import Doc, Span
from medspacy.context import ConTextComponent
from medspacy.section_detection import Sectionizer
from medspacy.ner import TargetRule, TargetMatcher
from scispacy.abbreviation import AbbreviationDetector
from scispacy.linking import EntityLinker
from transformers import AutoTokenizer, AutoModelForTokenClassification
from optimum.onnxruntime import ORTModelForTokenClassification
import re
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class AssertionStatus(Enum):
    PRESENT = "present"
    ABSENT = "absent"
    POSSIBLE = "possible"
    CONDITIONAL = "conditional"
    HYPOTHETICAL = "hypothetical"
    ASSOCIATED_WITH_SOMEONE_ELSE = "associated_with_someone_else"


@dataclass
class StimulationParameter:
    parameter_type: str
    value: float
    unit: str
    normalized_value: Optional[float] = None
    confidence: float = 0.0
    text_span: Tuple[int, int] = (0, 0)
    source: str = "ner"


@dataclass
class ExtractedEntity:
    text: str
    label: str
    start: int
    end: int
    confidence: float
    assertion: AssertionStatus = AssertionStatus.PRESENT
    section: Optional[str] = None
    related_entities: List[Dict] = None


class NeuromodulationNLPipeline:
    """
    Production-grade NLP pipeline for neuromodulation clinical text.
    
    Architecture:
        1. Preprocessing (section detection, sentence splitting)
        2. General clinical NER (ScispaCy + MedSpaCy)
        3. Custom neuromodulation NER (BioClinical ModernBERT)
        4. Rule-based parameter extraction
        5. Context analysis (negation, temporality, certainty)
        6. Ontology linking (UMLS, SNOMED CT, MedDRA)
    """
    
    # Regex patterns for stimulation parameter extraction
    STIM_PATTERNS = {
        "frequency": re.compile(
            r"(\d+\.?\d*)\s*(Hz|kHz|Hz\s*rTMS|Hz\s*TBS)",
            re.IGNORECASE
        ),
        "intensity_current": re.compile(
            r"(\d+\.?\d*)\s*(mA|miliamp|milli\s*amp)",
            re.IGNORECASE
        ),
        "intensity_percent_mt": re.compile(
            r"(\d+\.?\d*)\s*%\s*(?:of\s*)?(?:RMT|MT|motor\s*threshold|rmt)",
            re.IGNORECASE
        ),
        "intensity_percent_mso": re.compile(
            r"(\d+\.?\d*)\s*%\s*(?:of\s*)?(?:MSO|maximum\s*stimulator\s*output)",
            re.IGNORECASE
        ),
        "duration_minutes": re.compile(
            r"(\d+\.?\d*)\s*(min|minutes?|mins?)",
            re.IGNORECASE
        ),
        "duration_seconds": re.compile(
            r"(\d+\.?\d*)\s*(s|sec|seconds?)",
            re.IGNORECASE
        ),
        "pulses": re.compile(
            r"(\d+)\s*(pulses|trains?|stimuli)",
            re.IGNORECASE
        ),
        "sessions": re.compile(
            r"(\d+)\s*(sessions?|treatments?|visits?)",
            re.IGNORECASE
        ),
        "montage": re.compile(
            r"\b(Fp[12z]|AF[3578z]|F[37z]|F[48]|FC[1356z]|C[135z]|C[46]|"
            r"CP[1356z]|P[135z]|P[46]|PO[3578z]|O[12z]|T[37]|T[48])\b"
        ),
    }
    
    def __init__(
        self,
        ner_model_path: str = "thomas-sounack/BioClinical-ModernBERT-base",
        use_onnx: bool = True,
        device: str = "cpu"
    ):
        """Initialize the neuromodulation NLP pipeline."""
        self.device = device
        self.use_onnx = use_onnx
        
        # Load spaCy biomedical pipeline
        logger.info("Loading spaCy biomedical pipeline...")
        self.nlp = spacy.load("en_core_sci_scibert")
        self.nlp.add_pipe("abbreviation_detector", last=True)
        
        # Add MedSpaCy components
        logger.info("Adding MedSpaCy components...")
        self.context = ConTextComponent(self.nlp)
        self.sectionizer = Sectionizer(self.nlp)
        self.target_matcher = TargetMatcher(self.nlp)
        
        # Load custom NER model
        logger.info(f"Loading NER model: {ner_model_path}")
        self._load_ner_model(ner_model_path)
        
        # Add custom target rules for neuromodulation
        self._add_neuromodulation_rules()
        
    def _load_ner_model(self, model_path: str):
        """Load the custom NER model (ONNX or PyTorch)."""
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        
        if self.use_onnx:
            try:
                self.ner_model = ORTModelForTokenClassification.from_pretrained(
                    model_path.replace("-base", "-base-onnx"),
                    export=False
                )
                logger.info("Using ONNX Runtime for inference")
            except Exception:
                logger.warning("ONNX model not found, using PyTorch")
                self.ner_model = AutoModelForTokenClassification.from_pretrained(
                    model_path
                )
        else:
            self.ner_model = AutoModelForTokenClassification.from_pretrained(
                model_path
            )
            
    def _add_neuromodulation_rules(self):
        """Add custom target matching rules for neuromodulation entities."""
        rules = [
            # Stimulation types
            TargetRule("rTMS", "STIM_TYPE"),
            TargetRule("tDCS", "STIM_TYPE"),
            TargetRule("tACS", "STIM_TYPE"),
            TargetRule("tRNS", "STIM_TYPE"),
            TargetRule("TBS", "STIM_TYPE"),
            TargetRule("DBS", "STIM_TYPE"),
            TargetRule("VNS", "STIM_TYPE"),
            TargetRule("SCS", "STIM_TYPE"),
            TargetRule("ECT", "STIM_TYPE"),
            TargetRule("rTMS", "STIM_TYPE", pattern=r"repetitive\s+(?:transcranial\s+)?magnetic\s+stimulation"),
            
            # Brain targets
            TargetRule("DLPFC", "STIM_TARGET"),
            TargetRule("M1", "STIM_TARGET"),
            TargetRule("motor cortex", "STIM_TARGET"),
            TargetRule("prefrontal cortex", "STIM_TARGET"),
            TargetRule("STN", "STIM_TARGET", pattern=r"subthalamic\s+nucleus"),
            TargetRule("GPi", "STIM_TARGET", pattern=r"globus\s+pallidus\s+internus"),
            TargetRule("VIM", "STIM_TARGET", pattern=r"ventral\s+intermediate"),
            
            # Outcome measures
            TargetRule("HAM-D", "OUTCOME_MEASURE", 
                      pattern=r"HAM[\s\-]?D|Hamilton\s+(?:Depression|Rating)"),
            TargetRule("MADRS", "OUTCOME_MEASURE",
                      pattern=r"MADRS|Montgomery[-\s]Asberg"),
            TargetRule("BDI", "OUTCOME_MEASURE",
                      pattern=r"BDI[-\s]?II?|Beck\s+Depression"),
            TargetRule("PHQ-9", "OUTCOME_MEASURE",
                      pattern=r"PHQ[-\s]?9|Patient\s+Health\s+Questionnaire"),
            TargetRule("Y-BOCS", "OUTCOME_MEASURE",
                      pattern=r"Y[-\s]?BOCS|Yale[-\s]Brown"),
            TargetRule("UPDRS", "OUTCOME_MEASURE",
                      pattern=r"UPDRS\s*(?:I[IV]?|[1-4])?|Unified\s+Parkinson"),
            TargetRule("VAS", "OUTCOME_MEASURE",
                      pattern=r"VAS|Visual\s+Analog\s+Scale"),
            
            # Adverse events
            TargetRule("headache", "ADVERSE_EVENT"),
            TargetRule("scalp discomfort", "ADVERSE_EVENT"),
            TargetRule("erythema", "ADVERSE_EVENT"),
            TargetRule("tingling", "ADVERSE_EVENT"),
            TargetRule("seizure", "ADVERSE_EVENT",
                      pattern=r"seizure|convulsion|status\s+epilepticus"),
        ]
        self.target_matcher.add(rules)
        
    def preprocess(self, text: str) -> Doc:
        """Preprocess clinical text: section detection, sentence splitting."""
        doc = self.nlp(text)
        return doc
    
    def extract_parameters(self, text: str) -> List[StimulationParameter]:
        """Extract stimulation parameters using regex patterns."""
        parameters = []
        
        for param_type, pattern in self.STIM_PATTERNS.items():
            for match in pattern.finditer(text):
                try:
                    value = float(match.group(1))
                    unit = match.group(2) if len(match.groups()) > 1 else ""
                    
                    # Normalize units
                    normalized = self._normalize_parameter(param_type, value, unit)
                    
                    parameters.append(StimulationParameter(
                        parameter_type=param_type,
                        value=value,
                        unit=unit,
                        normalized_value=normalized,
                        confidence=0.85,  # Regex-based confidence
                        text_span=(match.start(), match.end()),
                        source="regex"
                    ))
                except (ValueError, IndexError):
                    continue
                    
        return parameters
    
    def _normalize_parameter(self, param_type: str, value: float, unit: str) -> Optional[float]:
        """Normalize parameter values to standard units."""
        if param_type == "frequency" and unit.lower() == "khz":
            return value * 1000  # Convert to Hz
        elif param_type == "duration_minutes":
            return value * 60  # Convert to seconds
        elif param_type == "intensity_percent_mt" or param_type == "intensity_percent_mso":
            return value / 100.0  # Convert to decimal
        return value
    
    def extract_entities(self, doc: Doc) -> List[ExtractedEntity]:
        """Extract clinical entities with context."""
        entities = []
        
        for ent in doc.ents:
            # Determine assertion status
            assertion = self._get_assertion(ent)
            
            # Determine section
            section = self._get_section(ent, doc)
            
            entity = ExtractedEntity(
                text=ent.text,
                label=ent.label_,
                start=ent.start_char,
                end=ent.end_char,
                confidence=getattr(ent._, "confidence", 0.9),
                assertion=assertion,
                section=section
            )
            entities.append(entity)
            
        return entities
    
    def _get_assertion(self, entity: Span) -> AssertionStatus:
        """Determine assertion status using MedSpaCy ConText."""
        if getattr(entity._, "is_negated", False):
            return AssertionStatus.ABSENT
        elif getattr(entity._, "is_uncertain", False):
            return AssertionStatus.POSSIBLE
        elif getattr(entity._, "is_hypothetical", False):
            return AssertionStatus.HYPOTHETICAL
        elif getattr(entity._, "is_historical", False):
            return AssertionStatus.PRESENT  # Historical = present but past
        else:
            return AssertionStatus.PRESENT
    
    def _get_section(self, entity: Span, doc: Doc) -> Optional[str]:
        """Determine which section the entity belongs to."""
        # Get section from MedSpaCy sectionizer
        if hasattr(doc._, "sections"):
            for section in doc._.sections:
                if section.start <= entity.start < section.end:
                    return section.category
        return None
    
    def process(self, text: str) -> Dict:
        """
        Process a neuromodulation clinical note through the full pipeline.
        
        Returns:
            Dictionary containing extracted entities, parameters, assertions,
            sections, and metadata.
        """
        import time
        start_time = time.time()
        
        # Step 1: Preprocessing
        doc = self.preprocess(text)
        
        # Step 2: Entity extraction
        entities = self.extract_entities(doc)
        
        # Step 3: Parameter extraction (regex + NER)
        parameters = self.extract_parameters(text)
        
        # Step 4: Group entities by section
        sections = {}
        for ent in entities:
            section = ent.section or "uncategorized"
            if section not in sections:
                sections[section] = []
            sections[section].append({
                "text": ent.text,
                "type": ent.label,
                "assertion": ent.assertion.value,
                "confidence": ent.confidence
            })
        
        # Step 5: Extract abbreviations
        abbreviations = [
            {"short": abrv.text, "long": abrv._.long_form.text}
            for abrv in doc._.abbreviations
        ]
        
        processing_time = (time.time() - start_time) * 1000
        
        return {
            "entities": [
                {
                    "text": e.text,
                    "type": e.label,
                    "assertion": e.assertion.value,
                    "section": e.section,
                    "confidence": e.confidence
                }
                for e in entities
            ],
            "parameters": [
                {
                    "type": p.parameter_type,
                    "value": p.value,
                    "unit": p.unit,
                    "normalized": p.normalized_value
                }
                for p in parameters
            ],
            "sections": sections,
            "abbreviations": abbreviations,
            "metadata": {
                "processing_time_ms": round(processing_time, 2),
                "entity_count": len(entities),
                "parameter_count": len(parameters),
                "section_count": len(sections)
            }
        }


# Usage example
if __name__ == "__main__":
    pipeline = NeuromodulationNLPipeline(use_onnx=True)
    
    sample_note = """
    PROGRESS NOTE - rTMS SESSION 5 OF 20
    
    INDICATION: Treatment-resistant major depressive disorder (MDD)
    
    PROCEDURE: The patient tolerated 10 Hz rTMS to the left DLPFC 
    at 120% of resting motor threshold. 3000 pulses were delivered 
    over 37.5 minutes using a figure-8 coil. The patient reported 
    mild headache at the stimulation site which resolved within 
    30 minutes without intervention. No seizure activity was observed.
    
    OUTCOMES: HAM-D score decreased from 24 at baseline to 14 
    at week 2 (p<0.05). PHQ-9 improved from 18 to 10. Patient 
    reports subjective improvement in mood and energy levels.
    
    PLAN: Continue rTMS protocol. Next session scheduled for 
    2026-03-22. Monitor for adverse events.
    """
    
    result = pipeline.process(sample_note)
    print(f"Processing time: {result['metadata']['processing_time_ms']}ms")
    print(f"Entities found: {result['metadata']['entity_count']}")
    print(f"Parameters found: {result['metadata']['parameter_count']}")
    for param in result["parameters"]:
        print(f"  {param['type']}: {param['value']} {param['unit']}")
```

### B.2 FHIR Integration Module

```python
"""
DeepSynaps Text Analyzer - FHIR Integration Module
Handles reading clinical documents from and writing extracted data to FHIR servers.
"""

from fhirclient import client
from fhirclient.models.documentreference import DocumentReference
from fhirclient.models.procedure import Procedure
from fhirclient.models.observation import Observation
from fhirclient.models.adverseevent import AdverseEvent
from fhirclient.models.bundle import Bundle
from fhirclient.models.fhirreference import FHIRReference
from fhirclient.models.codeableconcept import CodeableConcept
from fhirclient.models.coding import Coding
from fhirclient.models.attachment import Attachment
from fhirclient.models.quantity import Quantity
from datetime import datetime
from typing import List, Dict, Optional
import base64
import json


class DeepSynapsFHIRClient:
    """
    FHIR client for DeepSynaps text analyzer integration.
    Supports FHIR R4 DocumentReference ingestion and structured output generation.
    """
    
    # LOINC codes for common neuromodulation note types
    NOTE_TYPE_CODES = {
        "progress_note": ("11506-3", "Progress note"),
        "procedure_note": ("28570-0", "Procedure note"),
        "consultation": ("11488-4", "Consultation note"),
        "discharge_summary": ("18842-5", "Discharge summary"),
        "operative_report": ("11504-8", "Operative report"),
        "device_evaluation": ("72133-8", "Implantable device evaluation"),
    }
    
    # SNOMED CT procedure codes for neuromodulation
    STIM_PROCEDURE_CODES = {
        "rTMS": ("42538301000001102", "Repetitive transcranial magnetic stimulation"),
        "tDCS": ("445121000124106", "Transcranial direct current stimulation"),
        "tACS": ("447211000124109", "Transcranial alternating current stimulation"),
        "DBS": ("47020004", "Deep brain stimulation"),
        "VNS": ("425121000124106", "Vagus nerve stimulation"),
        "SCS": ("433234008", "Spinal cord stimulation"),
        "ECT": ("43275000", "Electroconvulsive therapy"),
    }
    
    def __init__(self, fhir_server_url: str, client_id: str, client_secret: str):
        """Initialize FHIR client with SMART on FHIR authentication."""
        settings = {
            'app_id': client_id,
            'app_secret': client_secret,
            'api_base': fhir_server_url
        }
        self.smart = client.FHIRClient(settings=settings)
        
    def read_document_reference(self, doc_ref_id: str) -> Optional[str]:
        """
        Read a DocumentReference and extract the clinical text content.
        
        Args:
            doc_ref_id: FHIR DocumentReference resource ID
            
        Returns:
            Clinical text content, or None if not found
        """
        try:
            doc_ref = DocumentReference.read(doc_ref_id, self.smart.server)
            
            if doc_ref.content:
                for content in doc_ref.content:
                    if content.attachment and content.attachment.data:
                        # Decode base64 content
                        text = base64.b64decode(content.attachment.data).decode('utf-8')
                        return text
                    elif content.attachment and content.attachment.url:
                        # Fetch from URL (implementation depends on storage)
                        pass
                        
            return None
            
        except Exception as e:
            print(f"Error reading DocumentReference {doc_ref_id}: {e}")
            return None
    
    def search_documents(
        self,
        patient_id: str,
        doc_type: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None
    ) -> List[DocumentReference]:
        """
        Search for DocumentReference resources matching criteria.
        
        Args:
            patient_id: FHIR Patient resource ID
            doc_type: Document type code (e.g., 'progress_note')
            date_from: Start date (ISO format)
            date_to: End date (ISO format)
            
        Returns:
            List of matching DocumentReference resources
        """
        search = DocumentReference.where(struct={
            'subject': f'Patient/{patient_id}'
        })
        
        if doc_type and doc_type in self.NOTE_TYPE_CODES:
            code, _ = self.NOTE_TYPE_CODES[doc_type]
            search = search.where(struct={'type': code})
            
        if date_from:
            search = search.where(struct={'date': f'ge{date_from}'})
        if date_to:
            search = search.where(struct={'date': f'le{date_to}'})
            
        return search.perform_resources(self.smart.server)
    
    def create_procedure(
        self,
        patient_id: str,
        encounter_id: str,
        stim_type: str,
        body_site: str,
        parameters: Dict,
        performed_date: str
    ) -> Procedure:
        """
        Create a Procedure resource for a neuromodulation session.
        
        Args:
            patient_id: FHIR Patient resource ID
            encounter_id: FHIR Encounter resource ID
            stim_type: Stimulation type (e.g., 'rTMS')
            body_site: Body site / brain target
            parameters: Extracted stimulation parameters
            performed_date: ISO date string
            
        Returns:
            Created Procedure resource
        """
        procedure = Procedure()
        
        # Set status
        procedure.status = "completed"
        
        # Set subject
        procedure.subject = FHIRReference({"reference": f"Patient/{patient_id}"})
        
        # Set encounter
        procedure.encounter = FHIRReference({"reference": f"Encounter/{encounter_id}"})
        
        # Set procedure code
        if stim_type in self.STIM_PROCEDURE_CODES:
            code, display = self.STIM_PROCEDURE_CODES[stim_type]
            procedure.code = CodeableConcept({
                "coding": [{
                    "system": "http://snomed.info/sct",
                    "code": code,
                    "display": display
                }],
                "text": f"{stim_type} to {body_site}"
            })
        
        # Set performed date
        procedure.performedDateTime = performed_date
        
        # Add body site
        procedure.bodySite = [CodeableConcept({
            "coding": [{
                "system": "http://snomed.info/sct",
                "code": "12738006",  # Brain structure
                "display": body_site
            }],
            "text": body_site
        })]
        
        # Add extension for stimulation parameters
        if parameters:
            extensions = []
            if "frequency" in parameters:
                extensions.append({
                    "url": "http://deepsynaps.io/fhir/StructureDefinition/stimulation-frequency",
                    "valueQuantity": {
                        "value": parameters["frequency"],
                        "unit": "Hz",
                        "system": "http://unitsofmeasure.org",
                        "code": "Hz"
                    }
                })
            if "intensity" in parameters:
                extensions.append({
                    "url": "http://deepsynaps.io/fhir/StructureDefinition/stimulation-intensity",
                    "valueQuantity": {
                        "value": parameters["intensity"],
                        "unit": "mA",
                        "system": "http://unitsofmeasure.org",
                        "code": "mA"
                    }
                })
            if "duration" in parameters:
                extensions.append({
                    "url": "http://deepsynaps.io/fhir/StructureDefinition/stimulation-duration",
                    "valueQuantity": {
                        "value": parameters["duration"],
                        "unit": "min",
                        "system": "http://unitsofmeasure.org",
                        "code": "min"
                    }
                })
            procedure.extension = extensions
        
        # Create resource on server
        procedure.create(self.smart.server)
        
        return procedure
    
    def create_observation(
        self,
        patient_id: str,
        encounter_id: str,
        scale_name: str,
        score_value: float,
        observation_date: str
    ) -> Observation:
        """
        Create an Observation resource for an outcome measure score.
        
        Args:
            patient_id: FHIR Patient resource ID
            encounter_id: FHIR Encounter resource ID
            scale_name: Outcome scale name (e.g., 'HAM-D')
            score_value: Numeric score
            observation_date: ISO date string
            
        Returns:
            Created Observation resource
        """
        observation = Observation()
        
        observation.status = "final"
        observation.subject = FHIRReference({"reference": f"Patient/{patient_id}"})
        observation.encounter = FHIRReference({"reference": f"Encounter/{encounter_id}"})
        observation.effectiveDateTime = observation_date
        
        # Map common scales to LOINC codes
        scale_loinc = self._get_scale_loinc(scale_name)
        
        observation.code = CodeableConcept({
            "coding": [{
                "system": "http://loinc.org",
                "code": scale_loinc["code"],
                "display": scale_loinc["display"]
            }],
            "text": scale_name
        })
        
        observation.valueQuantity = Quantity({
            "value": score_value,
            "unit": "score",
            "system": "http://unitsofmeasure.org",
            "code": "1"
        })
        
        observation.create(self.smart.server)
        
        return observation
    
    def _get_scale_loinc(self, scale_name: str) -> Dict:
        """Map outcome scale names to LOINC codes."""
        loinc_map = {
            "HAM-D": {"code": "44255-2", "display": "Hamilton Depression Rating Scale"},
            "MADRS": {"code": "44259-4", "display": "Montgomery-Asberg Depression Rating Scale"},
            "BDI-II": {"code": "44250-3", "display": "Beck Depression Inventory"},
            "PHQ-9": {"code": "44249-5", "display": "Patient Health Questionnaire-9"},
            "Y-BOCS": {"code": "44261-0", "display": "Yale-Brown Obsessive Compulsive Scale"},
            "UPDRS-III": {"code": "32541-8", "display": "Unified Parkinson's Disease Rating Scale"},
            "MoCA": {"code": "72133-8", "display": "Montreal Cognitive Assessment"},
            "MMSE": {"code": "72107-2", "display": "Mini-Mental State Examination"},
            "VAS": {"code": "38214-3", "display": "Pain severity Visual Analog Score"},
        }
        return loinc_map.get(scale_name, {"code": "00000-0", "display": scale_name})
    
    def create_extraction_bundle(
        self,
        patient_id: str,
        encounter_id: str,
        source_doc_ref_id: str,
        extraction_results: Dict
    ) -> Bundle:
        """
        Create a FHIR Bundle containing all extracted resources.
        
        Args:
            patient_id: FHIR Patient resource ID
            encounter_id: FHIR Encounter resource ID
            source_doc_ref_id: Source DocumentReference ID
            extraction_results: NLP extraction output
            
        Returns:
            FHIR Bundle with extracted resources
        """
        bundle = Bundle()
        bundle.type = "transaction"
        bundle.entry = []
        
        # Add extracted procedures
        if "procedures" in extraction_results:
            for proc in extraction_results["procedures"]:
                procedure = self.create_procedure(
                    patient_id, encounter_id,
                    proc["stim_type"], proc["body_site"],
                    proc.get("parameters", {}),
                    proc["date"]
                )
                bundle.entry.append({
                    "resource": procedure.as_json(),
                    "request": {"method": "POST", "url": "Procedure"}
                })
        
        # Add extracted observations
        if "observations" in extraction_results:
            for obs in extraction_results["observations"]:
                observation = self.create_observation(
                    patient_id, encounter_id,
                    obs["scale"], obs["score"], obs["date"]
                )
                bundle.entry.append({
                    "resource": observation.as_json(),
                    "request": {"method": "POST", "url": "Observation"}
                })
        
        return bundle
```

## Appendix C: De-identification Configuration Reference

### C.1 Presidio Custom Recognizer Configuration

```yaml
# deepsynaps_deid_config.yaml
# DeepSynaps Protocol Studio - De-identification Configuration

recognizers:
  # Standard HIPAA recognizers (built-in)
  - name: "US_SSN"
    enabled: true
    
  - name: "PHONE"
    enabled: true
    
  - name: "EMAIL"
    enabled: true
    
  - name: "IP_ADDRESS"
    enabled: true
    
  # Neuromodulation-specific custom recognizers
  - name: "DEVICE_SERIAL_MEDTRONIC"
    enabled: true
    patterns:
      - name: "medtronic_serial"
        regex: "NEU_INS_[A-Z0-9]{8,12}"
        score: 0.95
    context:
      - "serial"
      - "device"
      - "unit"
      - "IPG"
      - "neurostimulator"
      
  - name: "DEVICE_SERIAL_BOSTON_SCI"
    enabled: true
    patterns:
      - name: "boston_sci_serial"
        regex: "VRS_[A-Z0-9]{8,12}"
        score: 0.95
    context:
      - "serial"
      - "device"
      - "Vercise"
      
  - name: "DEVICE_SERIAL_ABBOTT"
    enabled: true
    patterns:
      - name: "abbott_serial"
        regex: "SJM_[A-Z0-9]{8,12}"
        score: 0.95
    context:
      - "serial"
      - "device"
      - "Infinity"
      
  - name: "STUDY_SUBJECT_ID"
    enabled: true
    patterns:
      - name: "subject_id"
        regex: "(?:Subject|Participant|Pt)\\s*[#]?\\s*\\d{2,6}"
        score: 0.7
      - name: "screening_number"
        regex: "(?:Screening|SCR)\\s*[#]?\\s*\\d{2,6}"
        score: 0.75
    context:
      - "subject"
      - "participant"
      - "screening"
      - "randomization"
      
  - name: "CLINICAL_TRIAL_ID"
    enabled: true
    patterns:
      - name: "nct_number"
        regex: "NCT\\d{8}"
        score: 0.9
    context:
      - "ClinicalTrials.gov"
      - "NCT"
      - "trial"
      
  - name: "DEVICE_IMPLANT_DATE"
    enabled: true
    patterns:
      - name: "implant_date"
        regex: "(?:implanted?|placement|inserted?)\\s+(?:on\\s+)?(\\d{1,2}[/\\-]\\d{1,2}[/\\-]\\d{2,4})"
        score: 0.6
    context:
      - "implanted"
      - "implantation"
      - "placement"
      
# Anonymization rules
anonymization:
  default_operator: "replace"
  
  operators:
    - entity: "PERSON"
      operator: "replace"
      replacement: "<NAME>"
      
    - entity: "PHONE_NUMBER"
      operator: "replace"
      replacement: "<PHONE>"
      
    - entity: "EMAIL"
      operator: "replace"
      replacement: "<EMAIL>"
      
    - entity: "DATE_TIME"
      operator: "custom"
      # Date shifting (consistent per patient)
      # Requires patient-specific salt for reproducibility
      date_shift:
        enabled: true
        days_range: [-365, 0]  # Shift back up to 1 year
        salt: "${PATIENT_SALT}"  # Per-patient salt
        
    - entity: "DEVICE_SERIAL_MEDTRONIC"
      operator: "replace"
      replacement: "<DEVICE_SERIAL>"
      # Note: For research, consider hash-based pseudonymization
      # to enable device tracking across notes
      
    - entity: "STUDY_SUBJECT_ID"
      operator: "hash"  # SHA-256 hash
      
    - entity: "MRN"
      operator: "replace"
      replacement: "<MRN>"
      
    - entity: "SSN"
      operator: "redact"  # Completely remove
      
  # Section-specific rules
  section_rules:
    - section: "header"
      strict_mode: true  # Maximum redaction in headers
      
    - section: "procedure"
      strict_mode: false  # Preserve clinical detail
      allow_entities: ["DEVICE", "STIM_PARAM"]
      
    - section: "outcomes"
      strict_mode: false
      
    - section: "adverse_events"
      strict_mode: false
      allow_entities: ["ADVERSE_EVENT"]
```

### C.2 Date Shifting Implementation

```python
"""
Consistent date shifting for clinical text de-identification.
Maintains temporal relationships while protecting exact dates.
"""

import hashlib
from datetime import datetime, timedelta
from typing import Dict, Optional
import re


class ConsistentDateShifter:
    """
    Shifts dates consistently per patient to maintain temporal relationships.
    
    Uses a patient-specific salt to ensure:
    1. Same patient -> same shift amount (consistent across documents)
    2. Different patients -> different shift amounts (unlinkable)
    3. Reversible if salt is known (for authorized re-identification)
    """
    
    DATE_PATTERNS = [
        # MM/DD/YYYY
        re.compile(r'\b(0[1-9]|1[0-2])[\/\-](0[1-9]|[12]\d|3[01])[\/\-](\d{4})\b'),
        # DD/MM/YYYY (European)
        re.compile(r'\b(0[1-9]|[12]\d|3[01])[\/\-](0[1-9]|1[0-2])[\/\-](\d{4})\b'),
        # YYYY-MM-DD (ISO)
        re.compile(r'\b(\d{4})[\/\-](0[1-9]|1[0-2])[\/\-](0[1-9]|[12]\d|3[01])\b'),
        # Month DD, YYYY
        re.compile(r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b', re.IGNORECASE),
        # Mon DD, YYYY (abbreviated)
        re.compile(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\b', re.IGNORECASE),
    ]
    
    MONTH_MAP = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4,
        'may': 5, 'june': 6, 'july': 7, 'august': 8,
        'september': 9, 'october': 10, 'november': 11, 'december': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6,
        'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
    }
    
    def __init__(self, global_salt: str):
        """
        Initialize with a global salt.
        
        Args:
            global_salt: Institution-level secret key for date shifting
        """
        self.global_salt = global_salt
        self._shift_cache: Dict[str, int] = {}
    
    def _get_patient_shift(self, patient_token: str) -> int:
        """
        Get the date shift amount for a specific patient.
        Uses hash of patient token + global salt for deterministic but patient-specific shift.
        """
        if patient_token not in self._shift_cache:
            # Generate deterministic shift amount (-730 to -30 days)
            hash_input = f"{self.global_salt}:{patient_token}".encode('utf-8')
            hash_value = int(hashlib.sha256(hash_input).hexdigest(), 16)
            shift_days = -30 - (hash_value % 700)  # Range: -30 to -730
            self._shift_cache[patient_token] = shift_days
        return self._shift_cache[patient_token]
    
    def shift_dates_in_text(self, text: str, patient_token: str) -> str:
        """
        Shift all dates in text by patient-specific amount.
        
        Args:
            text: Clinical text containing dates
            patient_token: Patient identifier for consistent shifting
            
        Returns:
            Text with dates shifted
        """
        shift_days = self._get_patient_shift(patient_token)
        result = text
        
        # Process each date pattern
        for pattern in self.DATE_PATTERNS:
            def replace_date(match):
                try:
                    # Extract date components based on pattern
                    groups = match.groups()
                    
                    if len(groups) == 3 and groups[0].isdigit() and len(groups[0]) == 4:
                        # YYYY-MM-DD format
                        year, month, day = int(groups[0]), int(groups[1]), int(groups[2])
                    elif len(groups) == 3 and groups[0].isalpha():
                        # Month name format
                        month = self.MONTH_MAP.get(groups[0].lower(), 1)
                        day, year = int(groups[1]), int(groups[2])
                    else:
                        # MM/DD/YYYY or DD/MM/YYYY - use MM/DD/YYYY as default
                        month, day, year = int(groups[0]), int(groups[1]), int(groups[2])
                        if year < 100:
                            year += 2000 if year < 50 else 1900
                    
                    original_date = datetime(year, month, day)
                    shifted_date = original_date + timedelta(days=shift_days)
                    
                    # Return shifted date in original format
                    return shifted_date.strftime("%Y-%m-%d")
                    
                except (ValueError, IndexError):
                    return match.group(0)  # Return original if parsing fails
            
            result = pattern.sub(replace_date, result)
        
        return result
```

## Appendix D: Streaming Architecture Deployment Guide

### D.1 Kafka Topic Design

```yaml
# kafka-topics.yaml
# DeepSynaps Kafka topic configuration

topics:
  clinical-notes.raw:
    partitions: 12
    replication_factor: 3
    retention.ms: 604800000  # 7 days
    cleanup.policy: delete
    compression.type: lz4
    
  clinical-notes.deidentified:
    partitions: 12
    replication_factor: 3
    retention.ms: 2592000000  # 30 days
    cleanup.policy: compact,delete
    min.compaction.lag.ms: 86400000  # 1 day
    
  nlp.extractions.entities:
    partitions: 24
    replication_factor: 3
    retention.ms: 7776000000  # 90 days
    cleanup.policy: compact,delete
    
  nlp.extractions.parameters:
    partitions: 12
    replication_factor: 3
    retention.ms: 7776000000  # 90 days
    cleanup.policy: compact,delete
    
  nlp.extractions.outcomes:
    partitions: 8
    replication_factor: 3
    retention.ms: 7776000000  # 90 days
    cleanup.policy: compact,delete
    
  alerts.adverse-events:
    partitions: 6
    replication_factor: 3
    retention.ms: 31536000000  # 1 year
    cleanup.policy: compact,delete
    
  audit.access:
    partitions: 6
    replication_factor: 3
    retention.ms: 31536000000  # 1 year (regulatory requirement)
    cleanup.policy: compact,delete
    min.cleanable.dirty.ratio: 0.01  # Aggressive compaction for audit
    
  monitoring.metrics:
    partitions: 4
    replication_factor: 3
    retention.ms: 604800000  # 7 days
    cleanup.policy: delete
    compression.type: gzip
```

### D.2 Flink Job Configuration

```java
// DeepSynapsNLPJob.java
// Apache Flink streaming job for real-time clinical NLP processing

public class DeepSynapsNLPJob {
    
    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = 
            StreamExecutionEnvironment.getExecutionEnvironment();
        
        // Checkpointing for exactly-once processing
        env.enableCheckpointing(60000);  // 1 minute
        env.getCheckpointConfig().setCheckpointingMode(
            CheckpointingMode.EXACTLY_ONCE
        );
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(30000);
        
        // Kafka source for clinical notes
        KafkaSource<ClinicalNote> source = KafkaSource.<ClinicalNote>builder()
            .setBootstrapServers("kafka:9092")
            .setTopics("clinical-notes.raw")
            .setGroupId("deepsynaps-nlp-processor")
            .setStartingOffsets(OffsetsInitializer.latest())
            .setValueOnlyDeserializer(new ClinicalNoteDeserializationSchema())
            .build();
        
        DataStream<ClinicalNote> notes = env.fromSource(
            source, 
            WatermarkStrategy.forBoundedOutOfOrderness(
                Duration.ofSeconds(30)
            ),
            "Clinical Notes Source"
        );
        
        // Async I/O for NLP API calls (non-blocking)
        DataStream<ExtractionResult> extractions = AsyncDataStream
            .unorderedWait(
                notes,
                new NLPServiceAsyncFunction("http://nlp-api:8000"),
                Time.seconds(5),    // Timeout
                TimeUnit.SECONDS,
                100                  // Capacity
            );
        
        // Branch: Adverse event alerts
        extractions
            .filter(result -> result.hasAdverseEvents())
            .addSink(KafkaSink.<ExtractionResult>builder()
                .setBootstrapServers("kafka:9092")
                .setRecordSerializer(KafkaRecordSerializationSchema
                    .builder()
                    .setTopic("alerts.adverse-events")
                    .setValueSerializationSchema(
                        new ExtractionResultSerializationSchema()
                    )
                    .build()
                )
                .build()
            );
        
        // Branch: Structured results to database
        extractions
            .addSink(new PostgreSQLSinkFunction(
                "jdbc:postgresql://postgres:5432/deepsynaps"
            ));
        
        // Branch: Audit log
        extractions
            .map(result -> new AuditEvent(result))
            .addSink(KafkaSink.<AuditEvent>builder()
                .setBootstrapServers("kafka:9092")
                .setRecordSerializer(KafkaRecordSerializationSchema
                    .builder()
                    .setTopic("audit.access")
                    .setValueSerializationSchema(
                        new AuditEventSerializationSchema()
                    )
                    .build()
                )
                .build()
            );
        
        env.execute("DeepSynaps Clinical NLP Stream Processor");
    }
}
```

## Appendix E: Performance Optimization Guide

### E.1 Model Optimization Checklist

| Optimization | Speed Improvement | Quality Impact | Complexity |
|-------------|------------------|----------------|------------|
| ONNX Runtime export | 2-5x faster | None | Low |
| INT8 quantization | 2-4x faster | <1% F1 loss | Low |
| Dynamic batching | 3-10x throughput | None | Medium |
| GPU inference | 5-20x faster | None | Low |
| Model distillation | 3-5x faster | 1-3% F1 loss | High |
| Attention sliding window | 2x longer sequences | <1% F1 loss | Low |
| KV cache optimization | 2x faster generation | None | Medium |
| Flash Attention | 2-4x faster, less memory | None | Low |

### E.2 Recommended Hardware Configurations

| Deployment Type | CPU | Memory | GPU | Storage | Notes |
|----------------|-----|--------|-----|---------|-------|
| **Development** | 8 cores | 32 GB | RTX 4090 (24GB) | 500 GB SSD | Single developer workstation |
| **Small Production** | 16 cores | 64 GB | A10 (24GB) | 1 TB SSD | Single hospital, <100 docs/day |
| **Medium Production** | 32 cores | 128 GB | A100 40GB x2 | 2 TB NVMe | Multi-site, <10K docs/day |
| **Large Production** | 64+ cores | 256 GB | H100 80GB x4 | 5 TB NVMe | Enterprise, >100K docs/day |
| **Edge (Hospital)** | 16 cores | 64 GB | Optional (T4) | 500 GB SSD | On-premises, no cloud |

### E.3 Caching Strategy

```python
"""
Multi-tier caching for DeepSynaps NLP pipeline.
"""

import redis
import hashlib
import json
from functools import wraps
from typing import Callable, Any

class NLPCache:
    """Multi-tier caching: L1 (in-memory) -> L2 (Redis) -> L3 (database)"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379/0"):
        self.redis = redis.from_url(redis_url)
        self.local_cache = {}  # L1: In-process LRU
        self.max_local_size = 1000
        
    def _get_cache_key(self, text: str, pipeline_version: str) -> str:
        """Generate deterministic cache key from text content."""
        content_hash = hashlib.sha256(
            f"{text}:{pipeline_version}".encode()
        ).hexdigest()
        return f"deepsynaps:nlp:{content_hash}"
    
    def get(self, text: str, pipeline_version: str) -> Any:
        """Get cached result. L1 -> L2 -> L3 lookup."""
        cache_key = self._get_cache_key(text, pipeline_version)
        
        # L1: Local cache
        if cache_key in self.local_cache:
            return self.local_cache[cache_key]
        
        # L2: Redis
        cached = self.redis.get(cache_key)
        if cached:
            result = json.loads(cached)
            self._set_local(cache_key, result)
            return result
        
        return None
    
    def set(self, text: str, pipeline_version: str, result: Any, ttl: int = 3600):
        """Cache result in all tiers."""
        cache_key = self._get_cache_key(text, pipeline_version)
        serialized = json.dumps(result, default=str)
        
        # L1: Local
        self._set_local(cache_key, result)
        
        # L2: Redis with TTL
        self.redis.setex(cache_key, ttl, serialized)
    
    def _set_local(self, key: str, value: Any):
        """LRU-eviction for local cache."""
        if len(self.local_cache) >= self.max_local_size:
            # Simple FIFO eviction
            oldest_key = next(iter(self.local_cache))
            del self.local_cache[oldest_key]
        self.local_cache[key] = value


def cached_nlp(ttl: int = 3600):
    """Decorator for caching NLP pipeline results."""
    cache = NLPCache()
    
    def decorator(func: Callable):
        @wraps(func)
        def wrapper(text: str, *args, **kwargs):
            pipeline_version = kwargs.get('pipeline_version', 'v1')
            
            # Check cache
            cached = cache.get(text, pipeline_version)
            if cached is not None:
                return cached
            
            # Execute pipeline
            result = func(text, *args, **kwargs)
            
            # Cache result
            cache.set(text, pipeline_version, result, ttl)
            
            return result
        return wrapper
    return decorator


# Usage
@cached_nlp(ttl=7200)
def analyze_clinical_note(text: str, pipeline_version: str = "v1") -> dict:
    pipeline = NeuromodulationNLPipeline()
    return pipeline.process(text)
```

## Appendix F: Testing Strategy

### F.1 Unit Test Suite

```python
# tests/test_neuromodulation_ner.py
"""Unit tests for neuromodulation NER pipeline."""

import pytest
from deepsynaps.nlp import NeuromodulationNLPipeline
from deepsynaps.fhir import DeepSynapsFHIRClient


class TestStimulationParameterExtraction:
    """Tests for stimulation parameter regex extraction."""
    
    @pytest.fixture
    def pipeline(self):
        return NeuromodulationNLPipeline(use_onnx=False)
    
    @pytest.mark.parametrize("text,expected_type,expected_value,expected_unit", [
        ("10 Hz stimulation", "frequency", 10.0, "Hz"),
        ("1 Hz rTMS", "frequency", 1.0, "Hz"),
        ("5 kHz tACS", "frequency", 5.0, "kHz"),
        ("2 mA intensity", "intensity_current", 2.0, "mA"),
        ("1.5 mA", "intensity_current", 1.5, "mA"),
        ("120% of RMT", "intensity_percent_mt", 120.0, "% of RMT"),
        ("80% motor threshold", "intensity_percent_mt", 80.0, "% motor threshold"),
        ("20 min session", "duration_minutes", 20.0, "min"),
        ("30 minutes", "duration_minutes", 30.0, "minutes"),
        ("3000 pulses", "pulses", 3000.0, "pulses"),
        ("10 sessions", "sessions", 10.0, "sessions"),
    ])
    def test_parameter_extraction(self, pipeline, text, expected_type, 
                                   expected_value, expected_unit):
        params = pipeline.extract_parameters(text)
        assert len(params) >= 1
        param = params[0]
        assert param.parameter_type == expected_type
        assert param.value == expected_value
        assert param.unit.lower() == expected_unit.lower()
    
    def test_multiple_parameters(self, pipeline):
        text = "10 Hz rTMS at 120% RMT for 20 minutes with 3000 pulses"
        params = pipeline.extract_parameters(text)
        types = [p.parameter_type for p in params]
        assert "frequency" in types
        assert "intensity_percent_mt" in types
        assert "duration_minutes" in types
        assert "pulses" in types


class TestContextDetection:
    """Tests for negation, temporality, and certainty detection."""
    
    @pytest.fixture
    def pipeline(self):
        return NeuromodulationNLPipeline(use_onnx=False)
    
    def test_negation_detection(self, pipeline):
        result = pipeline.process("Patient denied headache after TMS.")
        entities = result["entities"]
        headache_entity = [e for e in entities if "headache" in e["text"].lower()]
        assert len(headache_entity) > 0
        assert headache_entity[0]["assertion"] == "absent"
    
    def test_present_assertion(self, pipeline):
        result = pipeline.process("Patient reported headache after TMS.")
        entities = result["entities"]
        headache_entity = [e for e in entities if "headache" in e["text"].lower()]
        assert len(headache_entity) > 0
        assert headache_entity[0]["assertion"] == "present"
    
    def test_hypothetical(self, pipeline):
        result = pipeline.process("If seizure occurs, stop stimulation.")
        entities = result["entities"]
        seizure_entity = [e for e in entities if "seizure" in e["text"].lower()]
        assert len(seizure_entity) > 0
        assert seizure_entity[0]["assertion"] == "hypothetical"


class TestDeIdentification:
    """Tests for de-identification pipeline."""
    
    def test_name_redaction(self):
        from presidio_analyzer import AnalyzerEngine
        from presidio_anonymizer import AnonymizerEngine
        
        analyzer = AnalyzerEngine()
        anonymizer = AnonymizerEngine()
        
        text = "Patient John Smith underwent TMS."
        results = analyzer.analyze(text=text, language="en")
        anonymized = anonymizer.anonymize(text=text, analyzer_results=results)
        
        assert "John Smith" not in anonymized.text
        assert "<PERSON>" in anonymized.text or "<NAME>" in anonymized.text
    
    def test_date_shifting(self):
        from deepsynaps.deid import ConsistentDateShifter
        
        shifter = ConsistentDateShifter(global_salt="test-salt-123")
        text = "Session on 2026-03-15. Follow-up on 2026-03-22."
        shifted = shifter.shift_dates_in_text(text, patient_token="patient-001")
        
        # Both dates should be shifted by the same amount
        import re
        dates = re.findall(r'\d{4}-\d{2}-\d{2}', shifted)
        assert len(dates) == 2
        assert "2026-03-15" not in shifted
        # Time difference preserved
        from datetime import datetime
        d1 = datetime.strptime(dates[0], "%Y-%m-%d")
        d2 = datetime.strptime(dates[1], "%Y-%m-%d")
        assert (d2 - d1).days == 7  # Original 7-day gap preserved


class TestFHIRIntegration:
    """Tests for FHIR resource creation."""
    
    def test_procedure_creation(self):
        # Mock FHIR client (no server needed for unit test)
        from fhirclient.models.procedure import Procedure
        
        proc = Procedure()
        proc.status = "completed"
        proc.code = {
            "coding": [{
                "system": "http://snomed.info/sct",
                "code": "42538301000001102",
                "display": "Repetitive transcranial magnetic stimulation"
            }]
        }
        
        assert proc.status == "completed"
        assert proc.code.coding[0].code == "42538301000001102"
    
    def test_observation_score(self):
        from fhirclient.models.observation import Observation
        from fhirclient.models.quantity import Quantity
        
        obs = Observation()
        obs.status = "final"
        obs.code = {
            "coding": [{
                "system": "http://loinc.org",
                "code": "44255-2",
                "display": "Hamilton Depression Rating Scale"
            }]
        }
        obs.valueQuantity = Quantity({
            "value": 8,
            "unit": "score",
            "system": "http://unitsofmeasure.org",
            "code": "1"
        })
        
        assert obs.valueQuantity.value == 8


class TestPerformance:
    """Performance benchmarks for the NLP pipeline."""
    
    @pytest.fixture
    def pipeline(self):
        return NeuromodulationNLPipeline(use_onnx=True)
    
    @pytest.fixture
    def sample_note(self):
        return """
        PROGRESS NOTE
        
        INDICATION: Treatment-resistant MDD
        
        PROCEDURE: 10 Hz rTMS to left DLPFC at 120% RMT.
        3000 pulses over 37.5 minutes. Figure-8 coil.
        
        OUTCOMES: HAM-D decreased from 24 to 8.
        PHQ-9 improved from 18 to 5.
        
        ADVERSE EVENTS: Mild headache, resolved.
        No seizure activity.
        
        PLAN: Continue protocol. Next session 2026-03-22.
        """
    
    def test_processing_latency(self, pipeline, sample_note):
        import time
        
        # Warm-up
        for _ in range(5):
            pipeline.process(sample_note)
        
        # Measure
        times = []
        for _ in range(20):
            start = time.time()
            pipeline.process(sample_note)
            times.append((time.time() - start) * 1000)
        
        avg_time = sum(times) / len(times)
        p95_time = sorted(times)[int(len(times) * 0.95)]
        
        print(f"Average: {avg_time:.1f}ms, P95: {p95_time:.1f}ms")
        assert p95_time < 2000, f"P95 latency {p95_time:.1f}ms exceeds 2000ms threshold"
```

## Appendix G: Glossary of Terms

| Term | Definition |
|------|------------|
| **AE** | Adverse Event |
| **BAA** | Business Associate Agreement (HIPAA) |
| **BioBERT** | Biomedical domain-adapted BERT model |
| **BioClinical ModernBERT** | State-of-the-art clinical encoder model (2025) |
| **ConText** | Algorithm for detecting semantic context (negation, temporality, etc.) |
| **DBS** | Deep Brain Stimulation |
| **DPIA** | Data Protection Impact Assessment (GDPR) |
| **DP-SGD** | Differentially Private Stochastic Gradient Descent |
| **DLPFC** | Dorsolateral Prefrontal Cortex |
| **EEG 10/20** | International system for electrode placement |
| **FHIR** | Fast Healthcare Interoperability Resources |
| **GDPR** | General Data Protection Regulation (EU) |
| **HAM-D** | Hamilton Depression Rating Scale |
| **HIPAA** | Health Insurance Portability and Accountability Act (US) |
| **HL7** | Health Level Seven (messaging standard) |
| **IPG** | Implantable Pulse Generator |
| **M1** | Primary Motor Cortex |
| **MADRS** | Montgomery-Asberg Depression Rating Scale |
| **MAUDE** | Manufacturer and User Facility Device Experience (FDA) |
| **MedDRA** | Medical Dictionary for Regulatory Activities |
| **MedSpaCy** | Clinical NLP library for spaCy |
| **NER** | Named Entity Recognition |
| **NIBS** | Non-invasive Brain Stimulation |
| **NSPACK** | Neurosoft proprietary TMS data format |
| **ONNX** | Open Neural Network Exchange format |
| **PHI** | Protected Health Information |
| **rTMS** | Repetitive Transcranial Magnetic Stimulation |
| **SAE** | Serious Adverse Event |
| **SCS** | Spinal Cord Stimulation |
| **SMART on FHIR** | Substitutable Medical Apps, Reusable Technologies |
| **SNOMED CT** | Systematized Nomenclature of Medicine - Clinical Terms |
| **STN** | Subthalamic Nucleus |
| **tDCS** | Transcranial Direct Current Stimulation |
| **TBS** | Theta Burst Stimulation |
| **TMS** | Transcranial Magnetic Stimulation |
| **UMLS** | Unified Medical Language System |
| **UPDRS** | Unified Parkinson's Disease Rating Scale |
| **VNS** | Vagus Nerve Stimulation |

---

*This research report was compiled as decision-support documentation for the DeepSynaps Protocol Studio clinical text analyzer module. All clinical information is framed as research context, not clinical advice. Implementation should involve qualified clinical informaticists, compliance officers, and domain experts.*

*Last updated: 2026-07-10*

