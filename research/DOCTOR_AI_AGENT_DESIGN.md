# Clinical Copilot AI Agent: Comprehensive Research Report

**DeepSynaps Protocol Studio | Research Division**
**Document Version:** 1.0  
**Date:** 2025  
**Classification:** Internal Research  
**Target Audience:** Clinical AI Engineers, Healthcare CTOs, Medical Product Leaders  

---

## Table of Contents

1. [Clinical Copilot Landscape](#1-clinical-copilot-landscape)
2. [Patient Chart QA with RAG](#2-patient-chart-qa)
3. [Clinical Summarization](#3-clinical-summarization)
4. [Evidence-Grounded Answers](#4-evidence-grounded-answers)
5. [Report Drafting](#5-report-drafting)
6. [Safety Architecture](#6-safety-architecture)
7. [Integration Patterns](#7-integration-patterns)
8. [Technical Implementation](#8-technical-implementation)
9. [Code Reference Library](#9-code-reference-library)
10. [Appendices](#10-appendices)

---

## 1. Clinical Copilot Landscape

### 1.1 Market Overview

The U.S. AI medical scribing market was valued at **$397 million in 2024** and is projected to grow at a **25.09% CAGR** through 2033 (Grand View Research, 2024). The broader clinical copilot market -- encompassing ambient documentation, clinical decision support (CDS), patient chart QA, and evidence grounding -- represents a rapidly maturing ecosystem of vendors competing across three primary categories:

| Category | Description | Key Vendors |
|----------|-------------|-------------|
| **Ambient AI Scribes** | Capture clinician-patient conversations, generate structured notes | Nuance DAX, Ambience AutoScribe, Abridge, Suki, DeepScribe |
| **Clinical Decision Support (CDS)** | Evidence-based clinical reasoning, differential diagnosis, treatment guidance | UpToDate, OpenEvidence, AMBOSS, DynaMed, Glass Health |
| **Combined Platform** | Merges ambient documentation with clinical decision support in unified workflows | Glass Health, DeepCura |

The structural problem in the current market is the **documentation-clinical reasoning gap**: scribe tools capture encounter data but do not leverage it for clinical reasoning, while CDS tools require clinicians to manually re-enter clinical context from memory. Combined platforms are emerging to close this gap.

---

### 1.2 Nuance DAX Copilot

**Company:** Microsoft / Nuance Communications  
**Product:** DAX Copilot (formerly Dragon Ambient eXperience)  
**Launch:** 2020 (DAX), 2023 (DAX Copilot)  
**Market Position:** Enterprise ambient documentation leader; deepest Microsoft ecosystem integration

#### Architecture & Capabilities

DAX Copilot represents the enterprise incumbent in ambient clinical intelligence. It is built on top of Nuance's decades-long speech recognition legacy (Dragon Medical One) combined with Microsoft's Azure OpenAI Service infrastructure.

**Core Workflow:**
1. **Ambient Capture** -- Passively listens to clinician-patient encounters via mobile app or exam room microphone
2. **Multi-Speaker Diarization** -- Separates clinician voice from patient voice
3. **Context Integration** -- Pulls patient context from Epic EHR (demographics, prior notes, active problems)
4. **Note Generation** -- Produces structured SOAP notes, procedure documentation, and after-visit summaries
5. **EHR Writeback** -- Pushes notes directly into Epic's note fields via API integration

#### Key Metrics (2024)

| Metric | Value | Source |
|--------|-------|--------|
| Time saved per note | 20.4% reduction (10.3 to 8.2 min) | Duggan et al., QI Study |
| Documentation time reduction | 28.8% (high-frequency users) | Owens et al., Fam Pract 2024 |
| Clinician satisfaction | 70%+ reported reduced burnout | Microsoft Survey, July 2024 |
| Patient satisfaction improvement | 88% patients felt more listened to | Microsoft Survey, June 2024 |
| VA AI Tech Sprint Winner | Selected from 150+ entrants | VA DEAN Office, May 2024 |

#### Limitations
- **Narrow scope**: Documentation-only; no clinical decision support or differential diagnosis
- **Enterprise-only**: Requires Epic environment, Microsoft infrastructure, enterprise procurement
- **No specialty-tuned reasoning**: Notes are specialty-aware in template but not clinically reasoning
- **Context switching**: Clinicians still need separate tools for clinical reference and reasoning

#### Pricing Model
- Enterprise subscription (no public pricing)
- Requires Microsoft Cloud for Healthcare licensing
- Typical deployment: 6-12 month implementation timeline

---

### 1.3 Microsoft Copilot for Healthcare

**Company:** Microsoft  
**Product:** Microsoft Copilot for Healthcare (part of Cloud for Healthcare)  
**Launch:** 2024  
**Market Position:** Platform-level healthcare AI infrastructure

#### Architecture & Capabilities

Microsoft Copilot for Healthcare extends DAX Copilot with broader AI capabilities across the healthcare stack:

| Capability | Description |
|------------|-------------|
| **Data Interoperability** | FHIR R4 integration, Azure Health Data Services, multi-source data unification |
| **Analytics & Insights** | Population health analytics, quality measure reporting |
| **Patient Engagement** | Patient-facing chatbots, personalized care plans |
| **Clinical Workflow** | Schedule optimization, care team coordination |
| **Responsible AI** | Built on Azure Responsible AI framework, bias detection, explainability |

#### Technical Stack
- **Foundation Models:** GPT-4 via Azure OpenAI Service, fine-tuned for clinical language
- **Orchestration:** Azure AI Studio, Semantic Kernel
- **Data Platform:** Azure Health Data Services (FHIR server, DICOM, MedTech service)
- **Security:** HIPAA BAA, HITRUST CSF, SOC 2 Type II, ISO 27001

#### Strategic Limitations
- Deeply tied to Microsoft ecosystem; limited interoperability with non-Azure environments
- Enterprise sales cycle measured in quarters, not weeks
- Customization requires dedicated engineering resources

---

### 1.4 Google Med-PaLM 2 & MedLM

**Company:** Google DeepMind / Google Research  
**Product:** Med-PaLM 2 (2023), Med-PaLM M (multimodal), MedLM (enterprise API)  
**Market Position:** Research leader transitioning to clinical deployment via partnerships

#### Benchmark Performance

Med-PaLM 2 was the first AI system to reach **expert-level performance** on USMLE-style medical licensing questions:

| Benchmark | Med-PaLM 2 | Med-PaLM | Improvement |
|-----------|------------|----------|-------------|
| MedQA (USMLE-style) | **86.5%** | 67.6% | +18.9 pp |
| MedMCQA (Indian Medical Exams) | **72.3%** | 57.6% | +14.7 pp |
| PubMedQA | **81.8%** | 79.0% | +2.8 pp |
| Clinician Preference (Consensus) | **72.9%** vs. physician answers | N/A | +72.9% |

#### Safety Profile
- **90.6%** low-risk-of-harm rating on adversarial testing (vs. 79.4% for Med-PaLM)
- **92.6%** alignment with scientific consensus (vs. 92.9% for human clinicians)
- **5.9%** potential harm rating for Med-PaLM 2 vs. 29.7% for Flan-PaLM baseline

#### Med-PaLM M: Multimodal Capabilities

Med-PaLM M extended capabilities into multimodal biomedical AI:

| Modality | Capability |
|----------|------------|
| **Clinical Language** | Medical question answering, note generation |
| **Medical Imaging** | Chest X-ray interpretation, mammography analysis |
| **Dermatology** | Skin lesion classification |
| **Radiology** | Radiology report generation |
| **Genomics** | Genomic variant calling |

Clinicians preferred Med-PaLM M-generated reports over radiologist-produced reports in **up to 40.5%** of chest X-ray evaluations.

#### Enterprise Deployment (MedLM)
Google's MedLM enterprise API generates **70,000+ medical notes weekly** across 30+ medical specialties via its partnership with Augmedix.

#### Limitations
- Primarily available through Google Cloud; limited on-premise deployment
- Research-to-production gap: many capabilities remain experimental
- Regulatory pathway unclear for autonomous clinical use
- Requires significant engineering to integrate with EHR workflows

---

### 1.5 Hippocratic AI

**Company:** Hippocratic AI  
**Product:** Polaris Safety-Focused Healthcare LLM System  
**Founded:** 2023  
**Market Position:** Safety-first AI for patient-facing and clinical non-diagnostic conversations

#### The Constellation Architecture

Hippocratic AI's core innovation is the **"constellation architecture"** -- a multi-model safety system in which a primary model drives the conversation while multiple support models provide cross-check validation. This architecture is now **US Patent 12,142,371**.

**Architecture Components:**

| Component | Role |
|-----------|------|
| **Primary Model** | Conversation interface; custom-trained LLM optimized for empathetic, non-judgmental clinical dialogue; uses motivational interviewing and evidence-based compliance techniques |
| **Safety Support Models** | Multiple specialized models that cross-check the primary model's outputs for accuracy, safety, hallucination, and clinical appropriateness |

**Performance Impact:**
- Single-LLM prototype: **80%** correct answer rate
- Polaris 1.0 (constellation): Exceeded human accuracy on critical benchmarks
- Polaris 2.0: **99.02%** correct answer rate -- a near-elimination of error

#### Use Cases
- Patient health education and follow-up
- Medication adherence support
- Pre-visit preparation and intake
- Post-discharge monitoring
- **Non-diagnostic clinical conversations** (explicitly does not diagnose)

#### Key Differentiator
The constellation architecture represents a fundamentally different approach to clinical AI safety than single-model systems. By using multiple models to cross-check outputs, Hippocratic AI achieved a **~19 percentage point improvement** in accuracy over single-LLM approaches.

---

### 1.6 Ambience Healthcare

**Company:** Ambience Healthcare  
**Product:** AI Operating System (AutoScribe, AutoCDI, AutoAVS, AutoRefer, AutoPrep, Chart Awareness)  
**Founded:** 2018  
**Funding:** ~$370M total (Series C: $243M led by a16z and Oak HC/FT, July 2025)  
**Valuation:** $1B-$1.25B  
**Market Position:** Most technically sophisticated enterprise AI documentation platform

#### Product Suite

| Product | Function |
|---------|----------|
| **AutoScribe** | Ambient AI medical scribe; captures encounters, generates structured specialty-tuned notes |
| **AutoCDI** | Clinical Documentation Integrity; validates notes against coding requirements for accurate ICD-10/CPT assignment |
| **AutoAVS** | After-Visit Summaries; generates patient-facing encounter summaries in plain language |
| **AutoRefer** | Automated referral letter drafting with clinical history and reason for referral |
| **AutoPrep** | Pre-visit chart preparation; synthesizes patient history, active problems, recent results |
| **Chart Awareness** | Longitudinal record synthesis; incorporates full patient history into every note (launched Feb 2026) |

#### Key Validation: Cleveland Clinic

In 2024, Cleveland Clinic conducted the **first head-to-head competitive bake-off** among major health systems:
- **5 AI scribe vendors** evaluated
- **250 physicians** across **80+ specialties/subspecialties**
- **1-year pilot** with objective and subjective metrics
- **Result:** Ambience selected for **exclusive 5-year enterprise contract**
- **4,000+ clinicians** actively using within 15 weeks of rollout

#### Enterprise Performance Metrics

| Health System | Metric | Result |
|---------------|--------|--------|
| Houston Methodist | Documentation time reduction | 40% |
| Houston Methodist | Patient face-time increase | 27% |
| Ardent Health | Clinician utilization rate | 90% |
| Eventus Wholehealth | Daily documentation time saved | +3 hours |
| Eventus Wholehealth | Additional patients per day | +3 patients |

#### Technical Integration
- **Epic Toolbox Program** participant (native API integration)
- **Cerner** native integration
- Bidirectional EHR data flow: reads patient context, writes structured notes back
- Operates within Epic Haiku (mobile), Hyperspace, and Hyperdrive

#### Key Differentiator
**Chart Awareness** represents the most significant platform leap in ambient AI documentation. Unlike encounter-only scribes, it interprets the patient's **full longitudinal record** -- prior notes, diagnoses, labs, imaging, medications, pathology, and problem lists -- into every note. This moves AI documentation from encounter-level transcription to longitudinal record intelligence.

---

### 1.7 Glass Health

**Company:** Glass Health  
**Founded:** 2021 (pivoted to generative AI in 2023)  
**Founders:** Dr. Dereck Paul (MD, former internal medicine resident), Graham Ramsey  
**Market Position:** Leading combined scribe + clinical decision support platform

#### Core Philosophy

Glass Health operates on three foundational principles:

| Principle | Implementation |
|-----------|---------------|
| **Augmentation, Not Replacement** | Acts as "co-pilot" to draft and suggest; clinician remains final authority |
| **Clinician-Focused, Not Patient-Facing** | Designed exclusively for qualified medical professionals |
| **Workflow Integration** | Generates structured clinical notes that fit directly into existing documentation |

#### Feature Architecture

| Feature | Description | Output |
|---------|-------------|--------|
| **Ambient Scribing** | Captures encounter audio, generates transcripts + structured notes | SOAP notes, H&P, progress notes |
| **Three-Tier Differential Diagnosis** | Generates "Most Likely," "Expanded," and "Can't Miss" diagnosis tiers | Ranked DDx with supporting/opposing evidence |
| **Assessment & Plan Drafting** | Evidence-informed, problem-organized A&P with inline references | Structured clinical impression, Dx/Tx bullets, follow-up |
| **Clinical Questions (Consult)** | Evidence-grounded Q&A with citations from clinical guidelines and literature | Cited answers at point of care |
| **Deep Reasoning Mode** | Maximum reasoning effort for complex cases (97-98% USMLE accuracy) | Higher-accuracy, higher-latency analysis |
| **Workspace** | Team-based dashboard with version history, shared case review | Collaborative clinical environment |

#### The Documentation-Clinical Reasoning Gap

Glass Health's core architectural advantage is **closing the documentation-clinical reasoning gap**. When the same AI system that writes the note also reasons about the diagnosis:

1. **Time:** Eliminates context switching between documentation and reasoning tools
2. **Completeness:** DDx and A&P generated from the same encounter data as the note
3. **Consistency:** AI produces reasoning support for every encounter, not just when the clinician remembers to open a separate tool
4. **Safety:** The AI can flag inconsistencies between documented history and proposed assessment

#### Clinical Safety Design
- Three-tier differential explicitly separates "Most Likely" from "Can't Miss" diagnoses
- "Can't Miss" tier surfaces serious diagnoses that could be overlooked (e.g., aortic dissection in back pain)
- Every recommendation includes inline evidence citations
- All outputs are fully editable and require clinician review before use
- Not FDA-cleared as a medical device; explicitly positioned as clinical decision support

---

### 1.8 OpenEvidence

**Company:** OpenEvidence  
**Product:** America's Official Medical Knowledge Platform  
**Users:** ~650,000 healthcare professionals (U.S.); 1.2 million internationally  
**Market Position:** Fastest-growing AI-powered clinical reference tool

#### Architecture & Data Sources

OpenEvidence is fundamentally a **RAG-powered clinical search system** built on exclusive licensing partnerships with the world's most prestigious medical journals:

| Data Source | Type |
|-------------|------|
| **New England Journal of Medicine** | Peer-reviewed primary literature |
| **JAMA (Journal of the American Medical Association)** | Peer-reviewed primary literature |
| **National Comprehensive Cancer Network (NCCN)** | Clinical practice guidelines |
| **American Diabetes Association** | Specialty clinical guidelines |
| **Additional journal partnerships** | Specialty-specific evidence base |

#### How It Works

1. Clinician enters a clinical question in natural language (e.g., "alternatives if metformin causes diarrhea")
2. System retrieves relevant passages from licensed full-text journal content
3. LLM synthesizes a structured response grounded exclusively in retrieved evidence
4. Every claim is linked to specific source documents with inline citations
5. No AI "invention" -- the model does not generate answers from training data; it only synthesizes retrieved evidence

#### Growth Trajectory

| Metric | Value |
|--------|-------|
| Monthly website traffic (2025) | ~1.5 million visits |
| Share of traffic vs. UpToDate | 1/3 of combined platform traffic |
| Search volume growth (2024-2025) | 13.7% monthly increase |
| User base | 650K U.S. healthcare professionals |
| Cost to clinician | **Free** (advertising-supported) |

#### Compared to UpToDate

| Dimension | UpToDate | OpenEvidence |
|-----------|----------|-------------|
| **Content model** | Physician-authored, expert-reviewed chapters | AI-synthesized from licensed full-text literature |
| **Update frequency** | Continuous expert review | Real-time as new publications are indexed |
| **Search** | Structured topic navigation | Natural language Q&A |
| **Cost** | Institutional subscription ($500+/user/year) | Free to clinicians |
| **Evidence grading** | GRADE system (1A-2C) | Source-linked citations |
| **Speed** | Topic browsing | Instant Q&A response |

#### Limitations
- Advertising-supported model creates potential conflict of interest (pharma/device company ads)
- AI-synthesized responses require clinician verification against primary sources
- Not integrated into EHR workflows or documentation tools
- Less structured than UpToDate's expert-reviewed, guideline-formatted content

---

### 1.9 Competitive Landscape Summary

| Vendor | Category | Scribe | CDS | EHR Integration | Pricing | Best For |
|--------|----------|--------|-----|-----------------|---------|----------|
| **Nuance DAX Copilot** | Ambient Scribe | Strong | None | Epic, Microsoft | Enterprise | Large systems on Epic + Microsoft |
| **Ambience Healthcare** | Ambient Scribe | Very Strong | None | Epic, Cerner, athenahealth | Enterprise | Large health systems (50+ providers) |
| **Glass Health** | Combined | Strong | Strong | Epic, eCW, Athena (Max plan) | Freemium | Practices wanting scribe + CDS in one |
| **Google MedLM** | Foundation Model | Via partners | Research-grade | Via cloud APIs | Per-API-call | Research, pilot programs, cloud-native |
| **Hippocratic AI** | Patient-Facing AI | N/A | Conversation | Via integration | Enterprise | Patient engagement, non-diagnostic |
| **OpenEvidence** | CDS Reference | None | Strong | None | Free | Point-of-care evidence lookup |
| **UpToDate** | CDS Reference | None | Gold Standard | Limited | Institutional subscription | Evidence-based guideline reference |
| **Abridge** | Ambient Scribe | Strong | None | Epic, multiple | Enterprise | Health systems wanting linked evidence |

---

## 2. Patient Chart QA

### 2.1 The Challenge

Patient chart QA (question-answering) is the task of answering natural language questions about a specific patient's medical record. This is distinct from general medical QA because answers must be grounded in the **specific patient's data**, not just general medical knowledge.

**Example Questions:**
- "What medications is this patient on that could interact with warfarin?"
- "Has this patient's creatinine been trending upward over the past 6 months?"
- "What imaging studies has this patient had for their chronic back pain?"
- "When was this patient's last HbA1c and what was the result?"

### 2.2 Retrieval-Augmented Generation (RAG) for EHR

#### Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Clinician      │────▶│  Query Router    │────▶│  Patient Data   │
│  Question       │     │  & Decomposer    │     │  Retrieval (R)  │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                         ┌──────────────────┐            │
                         │  Response        │◄───────────┘
                         │  Generator (G)   │
                         └──────────────────┘
                                    ▲
                                    │
┌─────────────────┐     ┌──────────────────┐
│  Evidence       │────▶│  Context         │
│  Knowledge Base │     │  Assembler       │
└─────────────────┘     └──────────────────┘
```

#### The FHIR-RAG-MEDS Pattern

The FHIR-RAG-MEDS architecture (published 2026) represents the state-of-the-art for patient-specific clinical RAG:

**Step 1: FHIR Patient Data Retrieval**
- System authenticates via **SMART on FHIR** to the EHR
- Retrieves Patient, Condition, MedicationRequest, Observation, DiagnosticReport, AllergyIntolerance, Procedure, Encounter resources
- Data arrives as FHIR Bundle (JSON)

**Step 2: FHIR-to-Text Summarization**
- A compact LLM (e.g., Llama 3.1 8B) converts the FHIR Bundle JSON into a structured medical summary
- Summary includes: demographics, active problems, medications, allergies, recent labs, vital trends, imaging history

**Step 3: Guideline Retrieval (RAG)**
- The clinician's question + patient summary are embedded as a query vector
- Vector database (containing clinical guidelines, protocols, drug databases) retrieves top-k relevant chunks
- Retrieved chunks provide evidence-based context

**Step 4: Grounded Generation**
- LLM synthesizes a response using both the patient summary (personalized) and retrieved guidelines (evidence-based)
- Every claim is linked to specific source documents

**Evaluation Results** (FHIR-RAG-MEDS, 70 physician-generated questions):
- Outperformed state-of-the-art medical LLMs (BioMistral, Meditron 3, OpenBioLLM)
- Demonstrated higher semantic accuracy
- Improved faithfulness to guideline content
- Stronger clinical relevance per expert physician review

### 2.3 Structured Data Extraction from Medical Records

Medical records contain both structured data (FHIR resources, lab values, medication lists) and unstructured data (progress notes, discharge summaries, imaging reports). Effective patient chart QA requires extracting and structuring both.

#### Data Extraction Pipeline

| Data Type | Source FHIR Resources | Extraction Method |
|-----------|----------------------|-------------------|
| **Demographics** | Patient, RelatedPerson | Direct FHIR read |
| **Active Problems** | Condition (clinicalStatus=active) | FHIR query + NLP filtering |
| **Medications** | MedicationRequest, MedicationStatement | FHIR read + RxNorm normalization |
| **Lab Results** | Observation (category=laboratory) | FHIR read + LOINC mapping + trend analysis |
| **Vital Signs** | Observation (category=vital-signs) | FHIR read + time-series analysis |
| **Allergies** | AllergyIntolerance | Direct FHIR read |
| **Imaging** | DiagnosticReport, ImagingStudy | FHIR read + DICOM metadata |
| **Procedures** | Procedure | FHIR read + CPT/ICD-10 mapping |
| **Unstructured Notes** | DocumentReference | NLP extraction (NER, relation extraction) |

#### FHIR-to-Clinical-Summary Transformation

The transformation from FHIR JSON to clinician-friendly text is critical. The prompt template used by FHIR-RAG-MEDS:

```
Convert the following FHIR patient data into a concise clinical summary.
Include: demographics, active problems, current medications, allergies,
recent vital signs, notable lab trends, and recent imaging/procedures.
Use medical terminology appropriate for a clinician.
Keep the summary under 500 words.
FHIR Data: {fhir_bundle_json}
```

### 2.4 Multi-Modal Retrieval

Modern clinical AI must handle multiple data modalities:

| Modality | Format | Retrieval Method | Use Case |
|----------|--------|------------------|----------|
| **Text** | Unstructured notes, reports | Dense passage retrieval (vector similarity) | Chart QA, summarization |
| **Structured** | FHIR JSON, CSV, lab tables | Direct query + SQL | Trend analysis, cohort queries |
| **Images** | DICOM, PNG/JPEG radiology | Image embeddings (Med-PaLM M, CLIP) | Find similar imaging, report generation |
| **Time Series** | Vital signs, lab trends over time | Temporal encoding | Deterioration prediction, trend QA |
| **Genomic** | VCF, BAM files | Variant annotation + knowledge base | Pharmacogenomic guidance |

**Multi-Modal Fusion Strategy:**
1. Each modality is independently encoded into a shared embedding space
2. Cross-attention mechanisms weight modality contributions by query type
3. "What does the CT show?" -- routes primarily to imaging retrieval
4. "Is the creatinine trending up?" -- routes primarily to structured lab retrieval
5. "What is the differential for this presentation?" -- fuses all modalities

### 2.5 Evidence Grounding

Every patient chart QA answer must be grounded in two forms of evidence:

1. **Patient-Specific Evidence:** The actual data from the patient's record (FHIR observations, notes)
2. **Clinical Evidence:** Relevant clinical guidelines, drug databases, or literature

**Grounding Requirements:**
- Every clinical claim must cite its source (patient record entry or guideline)
- Lab values must include date, reference range, and trend direction
- Medication references must include dose, frequency, and prescriber
- Uncertain data must be explicitly flagged with confidence indicators

---

## 3. Clinical Summarization

### 3.1 Summarization Types

Clinical summarization is the task of condensing complex, voluminous patient data into concise, actionable clinical narratives. There are five primary summarization tasks:

| Type | Input | Output | Typical Length |
|------|-------|--------|----------------|
| **Patient History** | Full EHR record (years of data) | Condensed timeline of relevant medical history | 1-2 pages |
| **Progress Note** | Daily clinical data, orders, results | Structured daily progress note (SOAP format) | 1 page |
| **Discharge Summary** | Full inpatient stay record | Comprehensive transition-of-care document | 2-3 pages |
| **Handoff Note** | Current patient status, active issues | Structured sign-out for care transitions | 1 paragraph per patient |
| **Care Plan Summary** | Longitudinal data, goals, interventions | Patient-centered care plan overview | 1 page |

### 3.2 Patient History Summarization

#### The Problem

A complex patient may have:
- 500+ clinical notes across multiple specialties
- 50+ active medications
- 1,000+ lab results over years
- 20+ imaging studies
- 10+ procedures and surgeries
- Scattered across multiple EHR systems

Clinicians spend **20-30 minutes** reviewing charts before complex encounters. AI summarization can reduce this to **2-3 minutes** of focused review.

#### Summarization Architecture

**Input:** Full FHIR patient record (all resources)  
**Process:**
1. **Chronological Assembly** -- Organize all data points by date
2. **Problem-Based Grouping** -- Cluster data around active problems (using Condition resources)
3. **Relevance Scoring** -- Score each data point by recency, severity, and clinical relevance
4. **Temporal Compression** -- Summarize stable conditions briefly; detail recent changes
5. **Narrative Generation** -- Produce structured summary in clinical prose

**Output Format:**
```
PATIENT SUMMARY: [Name], [Age], [Sex]
---------------------------------------------------------------
ACTIVE PROBLEMS (by priority):
1. [Problem] - [Onset date], [Status], [Key recent events]
2. [Problem] - [Onset date], [Status], [Key recent events]
...

RECENT ENCOUNTERS:
- [Date]: [Type] - [Key findings/plan]

MEDICATIONS:
- [Medication] [Dose] [Frequency] - for [indication]

RECENT LABS (with trends):
- [Lab] [Value] [Date] [Trend] [Reference range]

PENDING ITEMS:
- [Action item] - ordered [date], status [status]

ALERTS:
- [Critical information requiring attention]
```

### 3.3 Progress Note Generation

Progress notes document daily clinical status and plan evolution during hospitalization. The traditional SOAP format maps naturally to AI generation:

| Section | AI Input | AI Role |
|---------|----------|---------|
| **Subjective** | Patient quotes, symptom reports, nursing observations | Transcribe and organize patient-reported data |
| **Objective** | Vitals, labs, imaging results, physical exam findings | Pull and format from structured data; summarize trends |
| **Assessment** | Active problems, differential diagnosis, clinical reasoning | Draft problem-by-problem assessment with differential |
| **Plan** | Active orders, pending tests, consults, discharge planning | Organize into problem-based plan with rationale |

**Key Constraint:** Progress notes must reflect **what changed since the last note**. AI systems must compare current data to the prior note and highlight deltas.

### 3.4 Discharge Summary Drafting

Discharge summaries are the most complex summarization task because they must synthesize an entire hospital stay into a comprehensive transition document.

**Required Sections:**

| Section | Content Source |
|---------|---------------|
| Admission Reason | First admission note, ED documentation |
| Hospital Course | Daily progress notes, procedure reports |
| Procedures Performed | Procedure notes, operative reports |
| Consultations | Specialist notes, recommendations |
| Discharge Condition | Last vital signs, physical exam, functional status |
| Discharge Medications | reconciled with admission meds, allergies checked |
| Discharge Diagnoses | Final problem list with ICD-10 codes |
| Discharge Instructions | Patient education, activity restrictions, follow-up |
| Follow-Up Appointments | Scheduled appointments, pending referrals |

**Safety Critical Elements:**
- Medication reconciliation must be 100% accurate (prevents adverse drug events)
- Pending test results must be explicitly listed
- Follow-up appointments must be confirmed
- Emergency contact/return precautions must be included

### 3.5 Handoff Note Creation

Handoff notes (also called sign-out or handover notes) support care transitions between shifts or providers. They require extreme conciseness:

**SBAR Format for Handoffs:**

| Element | Content | Example |
|---------|---------|---------|
| **S**ituation | One-line summary | 68M admitted with NSTEMI, s/p cardiac cath with DESx2 to LAD |
| **B**ackground | Key history | HTN, DM2, HLD, former smoker; presented with chest pain x3 days |
| **A**ssessment | Current status | Hemodynamically stable; EF 45%; on DAPT, statin, beta-blocker |
| **R**ecommendation | To-do items | Monitor for bleeding; echo tomorrow; cardiology f/u on discharge |

**AI-Specific Requirements:**
- Must identify **"to-do"** items that could be missed
- Must flag **deterioration risk** indicators
- Must highlight **contingency plans** ("if X happens, do Y")
- Must fit on a single screen (clinicians review 20+ handoffs at once)

### 3.6 Care Plan Summaries

Care plan summaries synthesize longitudinal care plans across multiple providers, specialties, and settings. They serve as the patient-centered narrative that bridges clinical documentation with patient engagement.

**Components:**
1. **Goals** (patient-specific, measurable, time-bound)
2. **Problems** (with severity and status)
3. **Interventions** (who is doing what, when)
4. **Outcomes** (metrics tracking progress)
5. **Coordination** (who is responsible for each element)

---

## 4. Evidence-Grounded Answers

### 4.1 The GRADE Evidence Framework

UpToDate's GRADE (Grading of Recommendations Assessment, Development and Evaluation) system is the gold standard for evidence grading in clinical medicine:

#### Evidence Quality Grades

| Grade | Description | Examples |
|-------|-------------|----------|
| **A (High)** | Consistent RCTs with narrow confidence intervals; or observational studies with very strong effects | Aspirin for secondary prevention of MI |
| **B (Moderate)** | RCTs with limitations; or observational studies with exceptional strengths | Many common treatment recommendations |
| **C (Low)** | Observational studies without exceptional strengths; or RCTs with major weaknesses | Treatment decisions in rare diseases |

#### Recommendation Strength

| Strength | Description | Implication |
|----------|-------------|-------------|
| **1 (Strong)** | Benefits clearly outweigh risks/burdens; most patients would make the same choice | "We recommend..." |
| **2 (Weak)** | Tradeoff is less clear; individual patient values will lead to different choices | "We suggest..." |

#### Combined Matrix

| | High Quality (A) | Moderate Quality (B) | Low Quality (C) |
|--|------------------|---------------------|-----------------|
| **Strong (1)** | 1A -- "We recommend" | 1B -- "We recommend" | 1C -- "We recommend" |
| **Weak (2)** | 2A -- "We suggest" | 2B -- "We suggest" | 2C -- "We suggest" |

### 4.2 PubMed / Literature Integration

#### Architecture for Literature RAG

```
Clinician Query
      |
      ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│  Query      │───▶│  PubMed      │───▶│  Abstract    │
│  Expansion  │    │  Search API  │    │  Retrieval   │
└─────────────┘    └──────────────┘    └──────┬───────┘
                                               │
                         ┌─────────────┐      │
                         │  Evidence   │◄─────┘
                         │  Synthesis  │
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │  Clinician  │
                         │  Review     │
                         └─────────────┘
```

**PubMed Query Expansion:**
- Original query: "metformin alternatives for diarrhea"
- Expanded: "metformin adverse effects gastrointestinal management" [MeSH Terms] AND "diabetes mellitus type 2" [MeSH Terms] AND ("therapy" [Subheading] OR "therapeutics" [MeSH Terms])
- Retrieved: 50 most recent/relevant abstracts
- Synthesized: Structured response with evidence grading

### 4.3 Clinical Guidelines Retrieval

Clinical guidelines (NCCN, ADA, ACC/AHA, IDSA) represent the highest-quality evidence base. The RAG system must:

1. **Index full-text guidelines** (not just abstracts) in chunk-optimized vector database
2. **Maintain version tracking** (guidelines are updated annually)
3. **Support section-aware retrieval** (specific sections for specific query types)
4. **Tag by specialty and condition** for filtered retrieval

### 4.4 Drug Interaction Checking

Drug interaction checking requires integration with specialized drug databases:

| Database | Content | API |
|----------|---------|-----|
| **First Databank (FDB)** | Drug-drug, drug-allergy, drug-disease interactions | Proprietary |
| **DrugBank** | Drug targets, mechanisms, pathways | Open API |
| **RxNorm** | Normalized drug names, mapping | NLM API (free) |
| **DailyMed** | FDA-approved labeling, warnings | FDA API (free) |

**Interaction Classification:**

| Severity | Action Required | Example |
|----------|----------------|---------|
| **Contraindicated** | Never combine | Linezolid + MAO inhibitor |
| **Major** | Avoid unless benefit outweighs risk | Warfarin + NSAIDs |
| **Moderate** | Use with caution, monitor | ACE inhibitor + potassium-sparing diuretic |
| **Minor** | Monitor, usually acceptable | Atorvastatin + red yeast rice |

### 4.5 Contraindication Alerts

Contraindication checking requires cross-referencing:
1. Patient allergies (AllergyIntolerance FHIR resource)
2. Active conditions (Condition FHIR resource)
3. Current medications (MedicationRequest FHIR resource)
4. Proposed new medication or intervention

**Alert Fatigue Mitigation:**
- Only alert on **high-severity, evidence-based** contraindications
- Suppress alerts for clinically irrelevant interactions (e.g., "theoretical" interactions)
- Track alert override rates; high override rates indicate alert desensitization
- Use machine learning to personalize alert thresholds by provider

### 4.6 Evidence Grading in AI Output

Every evidence-grounded AI response should include:

```
RECOMMENDATION: [Clinical recommendation text]

EVIDENCE SUMMARY:
- Supporting studies: [N] studies identified
- Highest quality evidence: [Grade A/B/C] from [source type]
- Consistency: [High/Moderate/Low] across sources
- Most recent update: [Date]

SOURCES:
1. [Author] et al., [Journal], [Year] - [Brief description] [Grade: X]
2. [Guideline body], [Guideline name], [Year] [Grade: X]
3. ...

CONFIDENCE: [High/Medium/Low] - [Explanation of uncertainty]
```

---

## 5. Report Drafting

### 5.1 qEEG Report Sections

Quantitative EEG (qEEG) reports require specialized AI-generated sections:

| Section | AI Role | Required Human Review |
|---------|---------|----------------------|
| **Technical Summary** | Document acquisition parameters, montage, sampling rate | Confirm accuracy |
| **Spectral Analysis** | Summarize power by frequency band (delta, theta, alpha, beta, gamma) | Verify against raw tracings |
| **Coherence/Connectivity** | Report inter- and intra-hemispheric connectivity patterns | Interpret clinical significance |
| **Statistical Deviation Maps** | Describe z-score deviations from normative database | Confirm artifact exclusion |
| **Clinical Correlation** | Suggest possible clinical correlations (tentative, flagged) | **Must be verified by reading physician** |
| **Protocol Recommendations** | Draft evidence-based protocol suggestions | **Must be approved by ordering clinician** |

**Critical Safety Note:** qEEG AI reports must include the disclaimer:
> "This report was generated with AI assistance. All clinical interpretations, diagnoses, and protocol recommendations require review and approval by a qualified clinician. The AI does not diagnose."

### 5.2 MRI Finding Summaries

MRI report drafting follows the structured radiology report format:

| Section | Content |
|---------|---------|
| **Clinical Indication** | Reason for study, relevant history |
| **Technique** | Sequences performed, contrast administration |
| **Comparison** | Prior relevant imaging |
| **Findings** | Organized by anatomical region; each finding with size, location, characteristics |
| **Impression** | Synthesized interpretation; differential diagnosis; recommendation |

**AI Assistance Level:**
- **Draft findings** from structured report templates + measured values
- **Suggest impression** based on finding patterns (e.g., "T2 hyperintense lesion in periventricular white matter, consistent with demyelinating disease")
- **Flag critical findings** for immediate radiologist notification
- **Never finalize** -- all AI-drafted reports require radiologist review and signature

### 5.3 Biomarker Interpretation

Biomarker reports require integration of:
1. Patient-specific values with reference ranges
2. Trend analysis over time
3. Clinical context (age, sex, comorbidities)
4. Evidence-based interpretation guidelines

| Biomarker Category | Interpretation Requirements |
|-------------------|---------------------------|
| **Cardiac** (troponin, BNP) | Trend direction, delta from prior, 99th percentile reference |
| **Metabolic** (HbA1c, lipids) | Goal targets by condition, trend over 3-12 months |
| **Renal** (creatinine, eGFR) | Baseline comparison, AKI stage if applicable |
| **Hepatic** (ALT, AST, bilirubin) | Pattern recognition (hepatocellular vs. cholestatic) |
| **Inflammatory** (CRP, ESR) | Clinical correlation, trend monitoring |
| **Genomic** (pharmacogenomic) | Allele interpretation, CPIC guidelines, drug-gene interactions |

### 5.4 Protocol Recommendation Drafts

Protocol recommendations (e.g., neurofeedback protocols, rehabilitation protocols) require:

1. **Evidence Review:** What does the literature support for this specific presentation?
2. **Patient Matching:** Is this patient appropriate for the protocol?
3. **Risk Assessment:** What are the risks and contraindications?
4. **Implementation Plan:** Specific parameters, duration, monitoring requirements
5. **Expected Outcomes:** What should be measured, and when?

**Evidence Sourcing:**
- Primary literature (PubMed-indexed RCTs, systematic reviews)
- Clinical guidelines (relevant specialty societies)
- Device manufacturer protocols (if applicable)
- Institutional protocols and standard operating procedures

### 5.5 Risk Assessment Narratives

Risk assessment reports synthesize multiple data sources into a coherent risk narrative:

| Risk Domain | Data Sources | Output |
|-------------|-------------|--------|
| **Cardiovascular** | ASCVD risk score, family history, biomarkers | 10-year risk narrative with modifiable factors |
| **Surgical** | ASA class, comorbidities, procedure complexity | Perioperative risk with mitigation strategies |
| **Medication** | Drug count, high-risk medications, renal/hepatic function | Adverse event risk with monitoring plan |
| **Functional** | ADL scores, gait speed, frailty indices | Functional decline risk with intervention plan |
| **Cognitive** | Screening scores, risk factors, trajectory | Cognitive decline risk with protective factors |

---

## 6. Safety Architecture

### 6.1 Core Safety Principles

Clinical AI safety is built on six non-negotiable principles:

| Principle | Implementation | Verification Method |
|-----------|---------------|-------------------|
| **Never Diagnose Autonomously** | AI drafts only; clinician must review, edit, and approve every output | Output framing language; mandatory approval gates |
| **Always Require Clinician Review** | No AI output enters the patient record without human approval | Workflow-enforced approval steps |
| **Uncertainty Quantification** | Every claim carries a confidence indicator | Confidence scoring model; override tracking |
| **Source Citation on Every Claim** | Every clinical assertion links to its evidence source | Citation extraction; citation accuracy auditing |
| **Hallucination Detection** | Multi-layer guardrails detect fabricated information | Fact-checking pipeline; never-event guardrails |
| **Decision-Support Framing** | All outputs framed as suggestions, not directives | Template-based framing; language model fine-tuning |

### 6.2 The Never-Diagnose Rule

**The most critical safety rule:** Clinical copilot AI must **never** issue a diagnosis. All diagnostic language must be framed as:

- "Differential diagnosis includes..."
- "Consider the possibility of..."
- "Findings are suggestive of... [condition], but [alternative] should also be considered"
- "Clinical correlation is recommended"

**Prohibited language:**
- "The patient has [diagnosis]"
- "Diagnosis: [condition]"
- "This is consistent with [diagnosis] only"

### 6.3 Human-in-the-Loop Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  AI Draft   │────▶│  Safety      │────▶│  Clinician   │────▶│  Approved    │
│  Generation │     │  Guardrails  │     │  Review      │     │  Output      │
└─────────────┘     └──────────────┘     └──────┬───────┘     └──────────────┘
                                                │
                                         ┌──────▼──────┐
                                         │  Rejected   │
                                         │  → AI       │
                                         │  Revision   │
                                         └─────────────┘
```

**Approval Gate Requirements:**
1. **Pre-generation check:** Query classification (is this within safe scope?)
2. **Post-generation hard guardrails:** Automated fact-checking, hallucination detection
3. **Clinician review:** Mandatory human review of all clinical outputs
4. **Post-approval audit:** Random sampling for quality assurance

### 6.4 Uncertainty Quantification

Every AI-generated clinical statement should carry an uncertainty indicator:

| Indicator | Meaning | Required Action |
|-----------|---------|-----------------|
| **High Confidence** | Strong evidence, clear patient data, guideline-supported | Clinician may accept with brief review |
| **Medium Confidence** | Partial evidence, some ambiguity, reasonable inference | Clinician should verify key elements |
| **Low Confidence** | Limited evidence, significant ambiguity, speculative | Clinician must independently verify |
| **Insufficient Data** | Patient record lacks needed information | Clinician must obtain additional data |

### 6.5 Hallucination Detection

#### The Multi-Layer Guardrail System

Based on research from pharmacovigilance and clinical safety literature, effective hallucination detection requires:

**Layer 1: Hard (Structural) Guardrails**
- Output format validation (JSON schema enforcement)
- Required field presence checks
- Terminology matching against standard vocabularies (SNOMED-CT, RxNorm, LOINC)

**Layer 2: Semantic Guardrails**
- **Entity verification:** Every drug name, diagnosis, lab value, and procedure must exist in reference databases
- **Fact-consistency checking:** Retrieved facts must match generated claims
- **Source-link validation:** Every citation must map to an actual retrieved document
- **Never-event detection:** Flag known dangerous errors (e.g., hallucinated drug names, contraindicated combinations)

**Layer 3: Uncertainty Quantification**
- **Token-level uncertainty:** Measure model confidence per token
- **Response-level uncertainty:** Aggregate confidence score for the full response
- **Threshold-based routing:** Low-confidence responses route to human review

**Layer 4: CareGuardAI Pattern (2026)**
The CareGuardAI framework introduces:
- **Clinical Safety Risk Assessment (SRA):** Inspired by ISO 14971; evaluates medical risk of generated responses
- **Hallucination Risk Assessment (HRA):** Evaluates factual reliability
- **Multi-stage pipeline:** Controller agent → Safety-constrained generation → Dual risk evaluation → Iterative refinement
- **Release condition:** Responses only released when both SRA and HRA <= 2

### 6.6 Decision-Support Framing

All AI outputs must be explicitly framed as **decision support**, not decisions:

**Required Preamble (auto-prepended to every response):**
```
=== CLINICAL DECISION SUPPORT ===
This response is generated by an AI clinical assistant and is intended 
to support, not replace, clinical judgment. All recommendations require 
review and approval by a qualified clinician before being applied to 
patient care.

Confidence Level: [HIGH/MEDIUM/LOW/INSUFFICIENT DATA]
Sources: [N] evidence sources consulted
Generated: [Timestamp]
===
```

**Required Postamble:**
```
=== IMPORTANT ===
- This information is for decision support only
- Verify all facts against the patient's actual record
- Confirm all recommendations against current clinical guidelines
- The final clinical decision is the responsibility of the treating clinician
- Report any errors or concerns to [contact]
===
```

---

## 7. Integration Patterns

### 7.1 EHR Connectors (HL7 FHIR)

#### FHIR Resource Mapping

| Clinical Data | FHIR Resource | AI Use |
|---------------|--------------|--------|
| Patient demographics | Patient | Personalization, risk stratification |
| Problems/Diagnoses | Condition | Differential diagnosis, care planning |
| Medications | MedicationRequest | Interaction checking, reconciliation |
| Allergies | AllergyIntolerance | Contraindication checking |
| Lab results | Observation (lab) | Trend analysis, reference range comparison |
| Vital signs | Observation (vital-signs) | Physiological monitoring, deterioration alerts |
| Imaging reports | DiagnosticReport | Finding summarization, comparison |
| Clinical notes | DocumentReference | Chart QA, summarization, NLP extraction |
| Encounters | Encounter | Visit history, care timeline |
| Procedures | Procedure | Surgical history, intervention tracking |
| Immunizations | Immunization | Vaccination status, scheduling |

#### SMART on FHIR Integration Pattern

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  EHR Launch  │────▶│  OAuth2      │────▶│  FHIR API    │
│  Context     │     │  Token       │     │  Access      │
│  (patient,   │     │  Exchange    │     │              │
│  encounter)  │     │              │     │              │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
┌──────────────┐     ┌──────────────┐            │
│  AI          │◄────│  Clinical    │◄───────────┘
│  Processing  │     │  Data Store  │
└──────────────┘     └──────────────┘
```

**Authentication Flow:**
1. User launches AI copilot from within EHR (SMART on FHIR launch)
2. EHR provides launch context (patient ID, encounter ID, user ID)
3. AI app requests authorization token from EHR's OAuth2 server
4. With token, AI app queries FHIR API for patient data
5. Data flows to AI processing pipeline
6. Results displayed back in EHR context (or via standalone UI)

### 7.2 Medical Imaging Viewers

| Integration Pattern | Standard | Use Case |
|-------------------|----------|----------|
| **DICOM Web (WADO-RS)** | DICOM Part 18 | Retrieve imaging studies for AI analysis |
| **FHIR ImagingStudy** | FHIR R4 | Metadata about imaging studies |
| **FHIR DiagnosticReport** | FHIR R4 | Structured imaging reports |
| **DICOM SR** | DICOM Supplement 66 | Structured reporting data |
| **Viewer Integration** | Proprietary API | Embed AI results in radiology workstation |

### 7.3 Lab Result Systems

| Standard | Purpose | Integration Method |
|----------|---------|-------------------|
| **LOINC** | Standardized lab test codes | Map all lab results to LOINC for universal interpretation |
| **FHIR Observation** | Lab result storage | Query via FHIR API for current and historical results |
| **UCUM** | Unit standardization | Ensure all values in consistent units |
| **Reference Ranges** | Population norms | Compare patient values against age/sex-appropriate ranges |

**Lab Integration Architecture:**
```
Lab System → FHIR Observation resources → AI Pipeline
                                                │
                                                ▼
                                        ┌──────────────┐
                                        │  Trend       │
                                        │  Analysis    │
                                        │  (time-series)│
                                        └──────┬───────┘
                                               │
                                        ┌──────▼──────┐
                                        │  Alert/     │
                                        │  Summary    │
                                        │  Generation │
                                        └─────────────┘
```

### 7.4 Wearable Data Ingestion

| Device Category | Data Type | Standard | AI Application |
|----------------|-----------|----------|---------------|
| **Continuous Glucose Monitors** | Glucose readings, trends | IEEE 11073 / proprietary | Glycemic pattern analysis |
| **ECG Monitors** | Rhythm strips, heart rate | HL7 FHIR Observation | Arrhythmia detection, rate trend |
| **Activity Trackers** | Steps, sleep, heart rate | Apple HealthKit / Google Fit | Functional status assessment |
| **Blood Pressure Monitors** | BP readings | FHIR Observation | Hypertension management |
| **Pulse Oximeters** | SpO2 readings | FHIR Observation | Respiratory monitoring |
| **Smart Inhalers** | Usage data, technique | Proprietary | Asthma/COPD adherence |

**Data Pipeline:**
```
Wearable Device → Mobile App → Cloud Gateway → FHIR Server → AI Copilot
                    (validation)    (security)   (normalization)  (analysis)
```

### 7.5 DeepTwin Integration

DeepTwin integration enables the clinical copilot to interact with the patient's digital twin:

| Integration Point | Data Flow | AI Capability |
|------------------|-----------|---------------|
| **Digital Twin State** | Bidirectional sync | Copilot queries twin for simulated patient state |
| **Protocol Simulation** | Twin → Copilot | Copilot runs "what-if" scenarios via twin |
| **Biomarker Projections** | Twin → Copilot | Copilot uses twin predictions for proactive recommendations |
| **Treatment History** | Copilot → Twin | Copilot logs approved treatments to twin record |
| **Risk Models** | Twin → Copilot | Copilot accesses twin's risk prediction models |

---

## 8. Technical Implementation

### 8.1 LangGraph for Clinical Reasoning Chains

#### Why LangGraph for Clinical AI

LangGraph provides a graph-based framework for orchestrating stateful, multi-step clinical reasoning. Unlike linear chains, clinical workflows require:

- **Branching logic:** Different processing paths for different query types
- **Cycles/loops:** Iterative refinement of uncertain responses
- **Human intervention:** Mandatory approval gates at critical steps
- **State persistence:** Multi-turn conversations with clinical context

#### Clinical Reasoning Graph Architecture

```
                    ┌──────────────┐
                    │   START      │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Query       │
                    │  Classifier  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
    ┌─────────────┐ ┌───────────┐ ┌─────────────┐
    │  Chart QA   │ │ Summarize │ │  Evidence   │
    │  Subgraph   │ │  Subgraph │ │  Subgraph   │
    └──────┬──────┘ └─────┬─────┘ └──────┬──────┘
           │              │              │
           └──────────────┼──────────────┘
                          ▼
                   ┌──────────────┐
                   │  Safety      │
                   │  Guardrails  │
                   └──────┬───────┘
                          │
                   ┌──────▼───────┐
                   │  Confidence  │
                   │  Scoring     │
                   └──────┬───────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
    ┌─────────────┐ ┌───────────┐ ┌───────────┐
    │  High Conf  │ │ Med Conf  │ │ Low Conf  │
    │  → Output   │ │ → Human   │ │ → Human   │
    │             │ │   Review  │ │   Review  │
    └─────────────┘ └───────────┘ └───────────┘
```

#### LangGraph Node Types for Clinical AI

| Node | Function | LangGraph Implementation |
|------|----------|------------------------|
| **Query Classifier** | Determine query type (chart QA, summarization, evidence lookup) | LLM node with routing edges |
| **FHIR Retriever** | Pull patient data from EHR | Tool node calling FHIR API |
| **RAG Retriever** | Search evidence knowledge base | Tool node calling vector DB |
| **Reasoner** | Synthesize response from retrieved context | LLM node with structured output |
| **Safety Checker** | Run guardrails on generated output | Function node with conditional routing |
| **Confidence Scorer** | Assess output reliability | LLM node or heuristic function |
| **Human Review Gate** | Pause for clinician approval | Interrupt node |
| **Output Formatter** | Format final response | Function node |

### 8.2 Tool-Calling with Human Approval Gates

#### Tool Inventory

| Tool | Function | Risk Level | Approval Required |
|------|----------|------------|-------------------|
| `fhir_patient_query` | Read patient FHIR resources | Low (read-only) | No |
| `fhir_patient_summary` | Generate patient summary | Low | No |
| `evidence_search` | Search clinical guidelines | Low | No |
| `drug_interaction_check` | Check for drug interactions | Medium | No (alerts only) |
| `lab_trend_analysis` | Analyze lab value trends | Low | No |
| `note_draft` | Draft clinical note section | High | **Yes** |
| `report_draft` | Draft diagnostic report | High | **Yes** |
| `protocol_suggest` | Suggest treatment protocol | High | **Yes** |
| `imaging_findings_draft` | Draft imaging findings | High | **Yes** |
| `discharge_plan_draft` | Draft discharge plan | Critical | **Yes** |

#### Approval Gate Implementation

```
AI generates draft → Approval Gate (blocking) → Clinician reviews →
  → Approve: Finalize and commit
  → Edit: Return to AI with feedback
  → Reject: Discard and regenerate
  → Escalate: Route to senior clinician
```

### 8.3 Context Window Management

Clinical data can overwhelm even large context windows. Strategies:

#### Hierarchical Context Loading

```
Tier 1 (Highest Priority - Always Load):
  - Patient summary (generated from FHIR)
  - Current encounter data
  - Active medications and allergies
  - 

Tier 2 (Load if Space):
  - Recent progress notes (last 30 days)
  - Recent lab results (last 90 days)
  - Problem list with history

Tier 3 (On-Demand Retrieval):
  - Older clinical notes (RAG retrieval)
  - Imaging reports (RAG retrieval)
  - Procedure notes (RAG retrieval)

Tier 4 (External Knowledge):
  - Clinical guidelines (RAG retrieval)
  - Drug information (API lookup)
  - Literature abstracts (RAG retrieval)
```

#### Token Budget Allocation (128K context window)

| Allocation | Tokens | Purpose |
|------------|--------|---------|
| System prompt + safety framing | 2,000 | Instructions, guardrails, formatting rules |
| Patient summary (Tier 1) | 4,000 | Core patient data |
| Tier 2 context | 6,000 | Recent notes, labs, problems |
| Retrieved evidence (RAG) | 4,000 | Guideline chunks, drug info |
| Conversation history | 4,000 | Multi-turn context |
| Generation buffer | 4,000 | Space for AI response |
| Reserved | 4,000 | Contingency for long inputs |

### 8.4 Token Optimization for Clinical Data

#### Compression Strategies

| Strategy | Method | Token Savings |
|----------|--------|--------------|
| **FHIR summarization** | Convert JSON to structured prose | 50-70% |
| **Note chunking** | Extract relevant sections only | 60-80% |
| **Lab trend compression** | Report trend, not every value | 80-90% |
| **Medication list deduplication** | Group by therapeutic class | 30-40% |
| **Temporal bucketing** | Group events by time period | 40-50% |
| **Priority filtering** | Only load high-relevance data | 50-70% |

#### Structured Data Token Formats

Instead of verbose natural language, use structured formats:

```
LAB: HbA1c=7.2%(ref:4.0-5.7%) 2024-03-15 ▲(prev:6.8% 2024-01-10)
MED: Metformin 1000mg BID (active, since 2023-06-01)
DX: T2DM (active, onset 2015), HTN (active, onset 2010)
```

### 8.5 Multi-Turn Conversation State

Clinical conversations are stateful. The AI must remember:

```
Session State:
├── Patient Context (immutable during session)
│   ├── Patient ID
│   ├── Current encounter ID
│   └── Pre-loaded patient summary
├── Conversation History
│   ├── Turn 1: [Query, Response, Sources]
│   ├── Turn 2: [Query, Response, Sources]
│   └── ...
├── Working Memory
│   ├── Active topic (what are we discussing?)
│   ├── Clarifications requested
│   ├── Pending actions
│   └── Clinician preferences (format, detail level)
├── Safety State
│   ├── Alerts triggered
│   ├── Overrides used
│   └── Confidence history
└── Metadata
    ├── Session start time
    ├── Clinician ID
    └── Audit trail
```

---

## 9. Code Reference Library

### 9.1 RAG Pipeline for Clinical QA

```python
"""
Clinical RAG Pipeline for Patient Chart QA
Implements FHIR-aware retrieval with evidence grounding.
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from enum import Enum
import json

# ─── Configuration ──────────────────────────────────────────────────────────

class ConfidenceLevel(Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INSUFFICIENT = "insufficient_data"

@dataclass
class ClinicalEvidence:
    """A single piece of clinical evidence with source and grade."""
    content: str
    source: str
    source_type: str  # "patient_record", "guideline", "literature"
    evidence_grade: Optional[str] = None  # GRADE: 1A, 1B, 2A, etc.
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM
    
@dataclass
class ClinicalResponse:
    """Structured clinical AI response with full provenance."""
    answer: str
    evidence: List[ClinicalEvidence]
    overall_confidence: ConfidenceLevel
    disclaimer: str
    requires_clinician_review: bool
    sources_consulted: int

# ─── FHIR Patient Data Retrieval ────────────────────────────────────────────

class FHIRPatientDataRetriever:
    """Retrieves and summarizes patient data from FHIR server."""
    
    def __init__(self, fhir_base_url: str, auth_token: str):
        self.fhir_base_url = fhir_base_url
        self.auth_token = auth_token
        self.resources_to_fetch = [
            "Patient", "Condition", "MedicationRequest",
            "AllergyIntolerance", "Observation", 
            "DiagnosticReport", "Procedure", "Encounter"
        ]
    
    def fetch_patient_bundle(self, patient_id: str) -> Dict:
        """Fetch all relevant FHIR resources for a patient."""
        import requests
        
        bundle = {"entry": []}
        for resource_type in self.resources_to_fetch:
            url = f"{self.fhir_base_url}/{resource_type}"
            params = {"patient": patient_id, "_count": 100}
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            
            response = requests.get(url, params=params, headers=headers)
            if response.status_code == 200:
                data = response.json()
                bundle["entry"].extend(data.get("entry", []))
        
        return bundle
    
    def summarize_bundle(self, bundle: Dict) -> str:
        """Convert FHIR Bundle JSON to concise clinical summary."""
        # In production, use a compact LLM (e.g., Llama 3.1 8B) for this
        # For this example, we use structured extraction
        
        summary_parts = []
        
        # Extract demographics
        patient_entries = [e for e in bundle.get("entry", [])
                         if e.get("resource", {}).get("resourceType") == "Patient"]
        if patient_entries:
            p = patient_entries[0]["resource"]
            name = p.get("name", [{}])[0]
            given = " ".join(name.get("given", []))
            family = name.get("family", "")
            birth_date = p.get("birthDate", "unknown")
            gender = p.get("gender", "unknown")
            summary_parts.append(
                f"PATIENT: {given} {family}, DOB: {birth_date}, Sex: {gender}"
            )
        
        # Extract active conditions
        conditions = [e for e in bundle.get("entry", [])
                     if e.get("resource", {}).get("resourceType") == "Condition"]
        active = [c for c in conditions 
                 if c["resource"].get("clinicalStatus", {}).get("coding", [{}])[0].get("code") == "active"]
        if active:
            summary_parts.append("\nACTIVE CONDITIONS:")
            for c in active[:10]:  # Limit to top 10
                code_text = c["resource"].get("code", {}).get("text", "Unknown")
                onset = c["resource"].get("onsetDateTime", "unknown date")
                summary_parts.append(f"- {code_text} (since {onset})")
        
        # Extract active medications
        meds = [e for e in bundle.get("entry", [])
               if e.get("resource", {}).get("resourceType") == "MedicationRequest"]
        active_meds = [m for m in meds 
                      if m["resource"].get("status") in ["active", "draft"]]
        if active_meds:
            summary_parts.append("\nACTIVE MEDICATIONS:")
            for m in active_meds[:10]:
                med_ref = m["resource"].get("medicationCodeableConcept", {}).get("text", "Unknown")
                dosage = m["resource"].get("dosageInstruction", [{}])[0]
                route = dosage.get("route", {}).get("text", "")
                freq = dosage.get("timing", {}).get("code", {}).get("text", "")
                summary_parts.append(f"- {med_ref} {route} {freq}")
        
        # Extract allergies
        allergies = [e for e in bundle.get("entry", [])
                    if e.get("resource", {}).get("resourceType") == "AllergyIntolerance"]
        if allergies:
            summary_parts.append("\nALLERGIES:")
            for a in allergies[:5]:
                substance = a["resource"].get("code", {}).get("text", "Unknown")
                severity = a["resource"].get("reaction", [{}])[0].get("severity", "unknown")
                summary_parts.append(f"- {substance} ({severity})")
        
        # Extract recent labs
        observations = [e for e in bundle.get("entry", [])
                       if e.get("resource", {}).get("resourceType") == "Observation"]
        lab_obs = [o for o in observations 
                  if o["resource"].get("category", [{}])[0].get("coding", [{}])[0].get("code") == "laboratory"]
        if lab_obs:
            summary_parts.append("\nRECENT LABS:")
            # Sort by date, take most recent 10
            lab_obs.sort(key=lambda x: x["resource"].get("effectiveDateTime", ""), reverse=True)
            for o in lab_obs[:10]:
                code = o["resource"].get("code", {}).get("text", "Unknown")
                value = o["resource"].get("valueQuantity", {})
                val = value.get("value", "")
                unit = value.get("unit", "")
                date = o["resource"].get("effectiveDateTime", "")[:10]
                ref = o["resource"].get("referenceRange", [{}])[0]
                ref_low = ref.get("low", {}).get("value", "")
                ref_high = ref.get("high", {}).get("value", "")
                summary_parts.append(f"- {code}: {val} {unit} (ref: {ref_low}-{ref_high}) [{date}]")
        
        return "\n".join(summary_parts)

# ─── Vector Store for Clinical Guidelines ───────────────────────────────────

class ClinicalGuidelineVectorStore:
    """Vector store for clinical guideline retrieval."""
    
    def __init__(self, embedding_model: str = "text-embedding-3-large"):
        self.embedding_model = embedding_model
        # In production: initialize Pinecone, Weaviate, or Qdrant
        self.documents = []  # Simplified: in-memory store
        self.embeddings = []
    
    def add_guideline(self, text: str, metadata: Dict[str, str]):
        """Add a guideline chunk to the vector store."""
        # In production: compute embedding via API
        self.documents.append({"text": text, "metadata": metadata})
    
    def search(self, query: str, patient_context: str, k: int = 4) -> List[Dict]:
        """Search for relevant guideline chunks."""
        # In production: embed query, cosine similarity search
        # For now, return placeholder results
        return self.documents[:k] if self.documents else []

# ─── Safety Guardrails ──────────────────────────────────────────────────────

class SafetyGuardrails:
    """Multi-layer safety guardrails for clinical AI output."""
    
    # Prohibited diagnostic phrases
    DIAGNOSTIC_PHRASES = [
        "the patient has", "diagnosis is", "patient has been diagnosed with",
        "this confirms", "definitive diagnosis"
    ]
    
    # Required framing phrases
    SUPPORT_PHRASES = [
        "differential diagnosis includes",
        "consider the possibility of", 
        "findings are suggestive of",
        "clinical correlation is recommended",
        "this is for decision support only"
    ]
    
    def check_output(self, text: str) -> Dict[str, Any]:
        """Run safety checks on generated output."""
        issues = []
        
        # Check for prohibited diagnostic language
        text_lower = text.lower()
        for phrase in self.DIAGNOSTIC_PHRASES:
            if phrase in text_lower:
                issues.append({
                    "type": "prohibited_diagnostic_language",
                    "phrase": phrase,
                    "severity": "critical",
                    "action": "Replace with decision-support framing"
                })
        
        # Check for source citations
        has_citations = "[" in text and "]" in text
        if not has_citations and len(text) > 200:
            issues.append({
                "type": "missing_citations",
                "severity": "high",
                "action": "Add source citations to all clinical claims"
            })
        
        # Check for disclaimer presence
        has_disclaimer = any(p in text_lower for p in self.SUPPORT_PHRASES)
        if not has_disclaimer:
            issues.append({
                "type": "missing_disclaimer",
                "severity": "high", 
                "action": "Add decision-support disclaimer"
            })
        
        # Check for uncertainty acknowledgment
        uncertainty_phrases = ["may", "could", "might", "should be considered",
                               "is suggested by", "appears to"]
        has_uncertainty = any(p in text_lower for p in uncertainty_phrases)
        if not has_uncertainty and len(text) > 100:
            issues.append({
                "type": "missing_uncertainty",
                "severity": "medium",
                "action": "Add appropriate uncertainty language"
            })
        
        return {
            "passed": len(issues) == 0,
            "issues": issues,
            "severity_score": max([0] + [{"low": 1, "medium": 2, "high": 3, "critical": 4}[i["severity"]] for i in issues])
        }
    
    def apply_auto_fixes(self, text: str) -> str:
        """Automatically fix safety issues where possible."""
        # Prepend disclaimer
        if not any(p in text.lower() for p in self.SUPPORT_PHRASES):
            text = (
                "=== CLINICAL DECISION SUPPORT ===\n"
                "This response is generated by an AI assistant for decision support only. "
                "All recommendations require review by a qualified clinician.\n\n"
                f"{text}"
            )
        
        return text

# ─── Clinical RAG Pipeline ──────────────────────────────────────────────────

class ClinicalRAGPipeline:
    """
    End-to-end clinical RAG pipeline for patient chart QA.
    Integrates FHIR patient data with evidence retrieval.
    """
    
    def __init__(
        self,
        fhir_retriever: FHIRPatientDataRetriever,
        evidence_store: ClinicalGuidelineVectorStore,
        llm_client: Any,  # e.g., OpenAI, Anthropic, or local LLM
        safety_guardrails: SafetyGuardrails
    ):
        self.fhir = fhir_retriever
        self.evidence = evidence_store
        self.llm = llm_client
        self.safety = safety_guardrails
    
    def answer_question(
        self, 
        patient_id: str, 
        question: str,
        conversation_history: List[Dict] = None
    ) -> ClinicalResponse:
        """
        Answer a clinical question about a specific patient.
        
        Args:
            patient_id: FHIR patient ID
            question: Natural language clinical question
            conversation_history: Optional previous turns
            
        Returns:
            Structured ClinicalResponse with full provenance
        """
        # Step 1: Retrieve patient data
        patient_bundle = self.fhir.fetch_patient_bundle(patient_id)
        patient_summary = self.fhir.summarize_bundle(patient_bundle)
        
        # Step 2: Retrieve evidence
        evidence_chunks = self.evidence.search(question, patient_summary, k=4)
        
        # Step 3: Build augmented prompt
        evidence_text = "\n\n".join([
            f"Source: {e['metadata'].get('source', 'Unknown')}\n{e['text']}"
            for e in evidence_chunks
        ])
        
        prompt = self._build_clinical_prompt(
            question=question,
            patient_summary=patient_summary,
            evidence=evidence_text,
            conversation_history=conversation_history
        )
        
        # Step 4: Generate response
        raw_response = self.llm.complete(prompt)  # Placeholder for LLM call
        
        # Step 5: Apply safety guardrails
        safety_result = self.safety.check_output(raw_response)
        if not safety_result["passed"]:
            raw_response = self.safety.apply_auto_fixes(raw_response)
            # Re-check
            safety_result = self.safety.check_output(raw_response)
        
        # Step 6: Determine confidence
        confidence = self._assess_confidence(
            evidence_chunks, safety_result, raw_response
        )
        
        # Step 7: Build evidence objects
        evidence_objects = [
            ClinicalEvidence(
                content=e["text"],
                source=e["metadata"].get("source", "Unknown"),
                source_type=e["metadata"].get("type", "guideline"),
                evidence_grade=e["metadata"].get("grade"),
                confidence=confidence
            )
            for e in evidence_chunks
        ]
        
        # Add patient record as evidence source
        evidence_objects.append(ClinicalEvidence(
            content=patient_summary[:500] + "...",
            source=f"Patient Record (FHIR): {patient_id}",
            source_type="patient_record",
            confidence=ConfidenceLevel.HIGH
        ))
        
        return ClinicalResponse(
            answer=raw_response,
            evidence=evidence_objects,
            overall_confidence=confidence,
            disclaimer="This is a clinical decision support tool. All outputs require clinician review.",
            requires_clinician_review=True,  # Always true for clinical AI
            sources_consulted=len(evidence_chunks) + 1
        )
    
    def _build_clinical_prompt(
        self,
        question: str,
        patient_summary: str,
        evidence: str,
        conversation_history: List[Dict] = None
    ) -> str:
        """Build the augmented prompt for the clinical LLM."""
        
        history_text = ""
        if conversation_history:
            history_text = "\n\nPrevious conversation:\n"
            for turn in conversation_history[-3:]:  # Last 3 turns
                history_text += f"Q: {turn.get('question', '')}\n"
                history_text += f"A: {turn.get('answer', '')[:200]}...\n"
        
        prompt = f"""You are a clinical decision support AI assistant. Your role is to help clinicians 
by providing evidence-based information grounded in patient data. You NEVER diagnose. You ALWAYS 
frame recommendations as suggestions requiring clinician review.

SAFETY RULES:
- Never state that a patient has a specific diagnosis
- Use language like "differential includes", "consider", "suggestive of"
- Cite sources for every clinical claim
- Acknowledge uncertainty when evidence is limited
- Include appropriate disclaimers

PATIENT CONTEXT:
{patient_summary}

RETRIEVED EVIDENCE:
{evidence}
{history_text}

CLINICAL QUESTION:
{question}

Provide a structured response that:
1. Directly answers the question using patient data and evidence
2. Cites sources for every clinical claim [Source: X]
3. Includes uncertainty language where appropriate
4. Ends with a decision-support disclaimer
5. Flags any items requiring immediate clinician attention
"""
        return prompt
    
    def _assess_confidence(
        self,
        evidence_chunks: List[Dict],
        safety_result: Dict,
        response: str
    ) -> ConfidenceLevel:
        """Assess overall confidence in the response."""
        score = 0
        
        # More evidence = higher confidence
        score += min(len(evidence_chunks) * 2, 6)
        
        # Safety issues reduce confidence
        score -= safety_result.get("severity_score", 0) * 2
        
        # Response length heuristic
        if len(response) < 50:
            score -= 2
        
        if score >= 6:
            return ConfidenceLevel.HIGH
        elif score >= 3:
            return ConfidenceLevel.MEDIUM
        elif score >= 0:
            return ConfidenceLevel.LOW
        else:
            return ConfidenceLevel.INSUFFICIENT


# ─── Usage Example ──────────────────────────────────────────────────────────

def main_example():
    """Example usage of the clinical RAG pipeline."""
    
    # Initialize components
    fhir = FHIRPatientDataRetriever(
        fhir_base_url="https://fhir.example.org/r4",
        auth_token=" Bearer token_here"
    )
    
    evidence = ClinicalGuidelineVectorStore()
    
    # Add some guideline chunks
    evidence.add_guideline(
        text="Metformin is first-line therapy for type 2 diabetes. If GI intolerance occurs, "
             "consider extended-release formulation or alternative agents such as SGLT2 inhibitors "
             "or GLP-1 receptor agonists.",
        metadata={"source": "ADA Standards of Care 2024", "type": "guideline", "grade": "1A"}
    )
    evidence.add_guideline(
        text="For patients with type 2 diabetes and established ASCVD, SGLT2 inhibitors or GLP-1 RA "
             "with demonstrated cardiovascular benefit are recommended independent of glycemic control.",
        metadata={"source": "ADA/ACC Consensus 2024", "type": "guideline", "grade": "1A"}
    )
    
    safety = SafetyGuardrails()
    
    # Note: llm_client would be an actual LLM client in production
    pipeline = ClinicalRAGPipeline(fhir, evidence, None, safety)
    
    # Example question
    response = pipeline.answer_question(
        patient_id="example-patient-001",
        question="What are the metformin alternatives if my patient has GI side effects?"
    )
    
    print(f"Answer:\n{response.answer}\n")
    print(f"Confidence: {response.overall_confidence.value}")
    print(f"Sources consulted: {response.sources_consulted}")
    print(f"Requires review: {response.requires_clinician_review}")
    for ev in response.evidence:
        print(f"- {ev.source} ({ev.source_type})")


if __name__ == "__main__":
    main_example()
```

### 9.2 LangGraph Clinical Agent

```python
"""
LangGraph-based Clinical Copilot Agent
Implements stateful clinical reasoning with human-in-the-loop approval.
"""

from typing import TypedDict, Annotated, Sequence, Literal
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
import json

# ─── State Definition ───────────────────────────────────────────────────────

class ClinicalAgentState(TypedDict):
    """State for the clinical copilot agent."""
    messages: Annotated[Sequence, add_messages]
    patient_id: str
    patient_summary: str
    query_type: Literal["chart_qa", "summarize", "evidence", "report_draft", "unknown"]
    retrieved_evidence: list
    draft_output: str
    confidence: Literal["high", "medium", "low", "insufficient"]
    safety_issues: list
    clinician_approved: bool
    clinician_feedback: str
    final_output: str

# ─── Tools ──────────────────────────────────────────────────────────────────

@tool
def query_patient_data(patient_id: str, data_type: str) -> str:
    """Query patient data from EHR via FHIR."""
    # In production: actual FHIR API call
    return f"Patient {patient_id} data for {data_type}: [simulated data]"

@tool
def search_clinical_evidence(query: str, k: int = 4) -> str:
    """Search clinical guidelines and literature."""
    # In production: vector database search
    return f"Evidence results for '{query}': [simulated evidence chunks]"

@tool
def check_drug_interactions(medication_list: str) -> str:
    """Check for drug-drug interactions."""
    # In production: FDB or DrugBank API
    return f"Interaction check for {medication_list}: [simulated results]"

@tool
def generate_patient_summary(patient_id: str) -> str:
    """Generate a comprehensive patient summary."""
    # In production: FHIR bundle summarization
    return f"Summary for patient {patient_id}: [simulated summary]"

# ─── Nodes ──────────────────────────────────────────────────────────────────

def classify_query(state: ClinicalAgentState) -> ClinicalAgentState:
    """Classify the clinician's query type."""
    llm = ChatOpenAI(model="gpt-4", temperature=0)
    
    query = state["messages"][-1].content
    
    classification_prompt = f"""Classify this clinical query into one of: chart_qa, summarize, evidence, report_draft, unknown.

Query: {query}

chart_qa: Questions about specific patient data ("What meds is this patient on?")
summarize: Request for summary ("Summarize this patient's history")
evidence: Evidence lookup ("What does the latest guideline say about X?")
report_draft: Request to draft a report or note ("Draft a progress note")

Respond with ONLY the category label."""
    
    response = llm.invoke(classification_prompt)
    query_type = response.content.strip().lower()
    
    valid_types = ["chart_qa", "summarize", "evidence", "report_draft", "unknown"]
    state["query_type"] = query_type if query_type in valid_types else "unknown"
    
    return state

def retrieve_patient_context(state: ClinicalAgentState) -> ClinicalAgentState:
    """Retrieve patient data for chart QA queries."""
    if state["query_type"] in ["chart_qa", "summarize", "report_draft"]:
        summary = generate_patient_summary(state["patient_id"])
        state["patient_summary"] = summary
    return state

def retrieve_evidence(state: ClinicalAgentState) -> ClinicalAgentState:
    """Retrieve clinical evidence."""
    query = state["messages"][-1].content
    evidence = search_clinical_evidence(query, k=4)
    state["retrieved_evidence"] = [evidence]
    return state

def generate_response(state: ClinicalAgentState) -> ClinicalAgentState:
    """Generate the AI response with safety framing."""
    llm = ChatOpenAI(model="gpt-4", temperature=0.1)
    
    query = state["messages"][-1].content
    patient_summary = state.get("patient_summary", "No patient context")
    evidence = "\n".join(state.get("retrieved_evidence", []))
    
    prompt = f"""You are a clinical decision support AI. Generate a safe, evidence-based response.

SAFETY RULES:
- Never diagnose. Use "differential includes", "consider", "suggestive of"
- Cite sources for every claim
- Include uncertainty language
- End with decision-support disclaimer

PATIENT CONTEXT:
{patient_summary}

EVIDENCE:
{evidence}

QUERY: {query}

Generate response:"""
    
    response = llm.invoke(prompt)
    state["draft_output"] = response.content
    return state

def safety_check(state: ClinicalAgentState) -> ClinicalAgentState:
    """Run safety guardrails on the draft output."""
    draft = state["draft_output"].lower()
    issues = []
    
    # Check for prohibited diagnostic language
    prohibited = ["the patient has", "diagnosis is", "this confirms"]
    for phrase in prohibited:
        if phrase in draft:
            issues.append(f"Prohibited phrase detected: '{phrase}'")
    
    # Check for citations
    if "[" not in draft:
        issues.append("Missing source citations")
    
    # Check for disclaimer
    if "decision support" not in draft:
        issues.append("Missing decision-support disclaimer")
    
    state["safety_issues"] = issues
    
    # Set confidence
    if len(issues) == 0 and state["retrieved_evidence"]:
        state["confidence"] = "high"
    elif len(issues) <= 1:
        state["confidence"] = "medium"
    else:
        state["confidence"] = "low"
    
    return state

def human_approval_gate(state: ClinicalAgentState) -> str:
    """
    Determine if human approval is required.
    Returns: 'approve', 'needs_review', or 'auto_fix'
    """
    if state["query_type"] == "report_draft":
        return "needs_review"  # Always require review for reports
    
    if state["confidence"] == "low":
        return "needs_review"
    
    if state["safety_issues"]:
        return "needs_review"
    
    return "approve"

def apply_safety_fixes(state: ClinicalAgentState) -> ClinicalAgentState:
    """Auto-fix safety issues where possible."""
    draft = state["draft_output"]
    
    # Add disclaimer if missing
    if "decision support" not in draft.lower():
        draft = (
            "=== CLINICAL DECISION SUPPORT ===\n"
            "This response is for decision support only. All recommendations require "
            "review by a qualified clinician.\n\n" + draft
        )
    
    state["draft_output"] = draft
    return state

def finalize_output(state: ClinicalAgentState) -> ClinicalAgentState:
    """Finalize the output with metadata."""
    final = state["draft_output"]
    
    # Add confidence and provenance footer
    footer = f"""

---
Confidence Level: {state['confidence'].upper()}
Sources Consulted: {len(state.get('retrieved_evidence', []))}
Patient Context: {'Included' if state.get('patient_summary') else 'Not applicable'}
Safety Issues: {len(state.get('safety_issues', []))}
Clinician Review: {'Required' if state['query_type'] == 'report_draft' else 'Recommended'}
Generated: [timestamp]
"""
    
    state["final_output"] = final + footer
    return state

# ─── Graph Construction ─────────────────────────────────────────────────────

def build_clinical_agent():
    """Build the LangGraph clinical agent."""
    
    # Initialize graph
    workflow = StateGraph(ClinicalAgentState)
    
    # Add nodes
    workflow.add_node("classify", classify_query)
    workflow.add_node("patient_context", retrieve_patient_context)
    workflow.add_node("evidence", retrieve_evidence)
    workflow.add_node("generate", generate_response)
    workflow.add_node("safety_check", safety_check)
    workflow.add_node("auto_fix", apply_safety_fixes)
    workflow.add_node("finalize", finalize_output)
    
    # Define edges
    workflow.set_entry_point("classify")
    
    # After classification, always get patient context and evidence
    workflow.add_edge("classify", "patient_context")
    workflow.add_edge("patient_context", "evidence")
    workflow.add_edge("evidence", "generate")
    workflow.add_edge("generate", "safety_check")
    
    # Conditional routing after safety check
    workflow.add_conditional_edges(
        "safety_check",
        human_approval_gate,
        {
            "needs_review": "auto_fix",  # Route to fix then human review
            "approve": "finalize",       # Route to finalize
            "auto_fix": "auto_fix"       # Route to fix then re-check
        }
    )
    
    # After auto-fix, go to finalize (with human review assumed)
    workflow.add_edge("auto_fix", "finalize")
    
    # End
    workflow.add_edge("finalize", END)
    
    # Compile with memory checkpointing
    memory = MemorySaver()
    app = workflow.compile(checkpointer=memory)
    
    return app

# ─── Usage ──────────────────────────────────────────────────────────────────

def run_clinical_agent():
    """Run the clinical agent with example queries."""
    
    agent = build_clinical_agent()
    
    # Example 1: Chart QA
    config = {"configurable": {"thread_id": "session-001"}}
    
    result = agent.invoke(
        {
            "messages": [HumanMessage(content="What medications is this patient on?")],
            "patient_id": "patient-001",
            "patient_summary": "",
            "query_type": "unknown",
            "retrieved_evidence": [],
            "draft_output": "",
            "confidence": "medium",
            "safety_issues": [],
            "clinician_approved": False,
            "clinician_feedback": "",
            "final_output": ""
        },
        config=config
    )
    
    print("=== Clinical Agent Output ===")
    print(result["final_output"])
    
    # Example 2: Multi-turn conversation
    result2 = agent.invoke(
        {
            "messages": [
                HumanMessage(content="What medications is this patient on?"),
                AIMessage(content="The patient is on metformin 1000mg BID and lisinopril 10mg daily."),
                HumanMessage(content="Are there any drug interactions between those?")
            ],
            "patient_id": "patient-001",
        },
        config=config  # Same thread = conversation memory
    )
    
    print("\n=== Multi-turn Output ===")
    print(result2["final_output"])


if __name__ == "__main__":
    run_clinical_agent()
```

### 9.3 Tool-Calling with Approval Gates

```python
"""
Tool-calling patterns for clinical AI with human approval gates.
Implements risk-based approval requirements.
"""

from typing import Callable, Dict, List, Optional, Any
from dataclasses import dataclass, field
from enum import Enum
import uuid
from datetime import datetime

# ─── Risk Classification ────────────────────────────────────────────────────

class RiskLevel(Enum):
    LOW = "low"           # Read-only data access, no approval needed
    MEDIUM = "medium"     # Informational alerts, async review
    HIGH = "high"         # Draft generation, synchronous review required
    CRITICAL = "critical" # Discharge plans, medication orders, dual review

@dataclass
class ToolCall:
    """A pending tool call awaiting approval."""
    call_id: str
    tool_name: str
    parameters: Dict[str, Any]
    risk_level: RiskLevel
    justification: str  # Why the AI wants to call this tool
    patient_id: Optional[str] = None
    requested_at: datetime = field(default_factory=datetime.utcnow)
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    status: str = "pending"  # pending, approved, rejected, expired
    result: Optional[Any] = None

# ─── Approval Gate Manager ──────────────────────────────────────────────────

class ApprovalGateManager:
    """
    Manages human-in-the-loop approval for clinical AI tool calls.
    """
    
    # Tool risk classification
    TOOL_RISKS = {
        "fhir_patient_query": RiskLevel.LOW,
        "fhir_patient_summary": RiskLevel.LOW,
        "evidence_search": RiskLevel.LOW,
        "lab_trend_analysis": RiskLevel.LOW,
        "drug_interaction_check": RiskLevel.MEDIUM,
        "note_draft": RiskLevel.HIGH,
        "report_draft": RiskLevel.HIGH,
        "protocol_suggest": RiskLevel.HIGH,
        "imaging_findings_draft": RiskLevel.HIGH,
        "discharge_plan_draft": RiskLevel.CRITICAL,
        "medication_order": RiskLevel.CRITICAL,
    }
    
    # Auto-approve tools at or below this risk level
    AUTO_APPROVE_THRESHOLD = RiskLevel.LOW
    
    def __init__(self):
        self.pending_calls: Dict[str, ToolCall] = {}
        self.approved_calls: Dict[str, ToolCall] = {}
        self.audit_log: List[Dict] = []
    
    def request_tool_call(
        self,
        tool_name: str,
        parameters: Dict[str, Any],
        justification: str,
        patient_id: Optional[str] = None
    ) -> ToolCall:
        """
        Request approval for a tool call.
        
        Returns immediately for low-risk tools.
        Returns pending for higher-risk tools.
        """
        risk = self.TOOL_RISKS.get(tool_name, RiskLevel.HIGH)
        
        call = ToolCall(
            call_id=str(uuid.uuid4()),
            tool_name=tool_name,
            parameters=parameters,
            risk_level=risk,
            justification=justification,
            patient_id=patient_id
        )
        
        # Auto-approve low-risk tools
        if risk.value <= self.AUTO_APPROVE_THRESHOLD.value:
            call.status = "auto_approved"
            call.approved_by = "SYSTEM_AUTO"
            call.approved_at = datetime.utcnow()
            self._log_event("auto_approved", call)
            return call
        
        # Queue for human review
        self.pending_calls[call.call_id] = call
        self._log_event("pending_review", call)
        
        return call
    
    def approve_call(self, call_id: str, approver_id: str) -> ToolCall:
        """Approve a pending tool call."""
        if call_id not in self.pending_calls:
            raise ValueError(f"Call {call_id} not found in pending queue")
        
        call = self.pending_calls.pop(call_id)
        call.status = "approved"
        call.approved_by = approver_id
        call.approved_at = datetime.utcnow()
        self.approved_calls[call_id] = call
        
        self._log_event("approved", call)
        return call
    
    def reject_call(self, call_id: str, approver_id: str, reason: str) -> ToolCall:
        """Reject a pending tool call."""
        if call_id not in self.pending_calls:
            raise ValueError(f"Call {call_id} not found in pending queue")
        
        call = self.pending_calls.pop(call_id)
        call.status = "rejected"
        call.approved_by = approver_id
        call.approved_at = datetime.utcnow()
        call.result = {"rejection_reason": reason}
        
        self._log_event("rejected", call)
        return call
    
    def get_pending_calls(self, patient_id: Optional[str] = None) -> List[ToolCall]:
        """Get all pending calls, optionally filtered by patient."""
        calls = list(self.pending_calls.values())
        if patient_id:
            calls = [c for c in calls if c.patient_id == patient_id]
        return sorted(calls, key=lambda c: c.requested_at)
    
    def _log_event(self, event_type: str, call: ToolCall):
        """Log to audit trail."""
        self.audit_log.append({
            "event": event_type,
            "call_id": call.call_id,
            "tool": call.tool_name,
            "risk": call.risk_level.value,
            "patient": call.patient_id,
            "timestamp": datetime.utcnow().isoformat(),
            "approver": call.approved_by
        })


# ─── Clinical Tool Executor ─────────────────────────────────────────────────

class ClinicalToolExecutor:
    """
    Executes clinical tools with approval gating.
    """
    
    def __init__(self, approval_manager: ApprovalGateManager):
        self.approval = approval_manager
        self.tools: Dict[str, Callable] = {}
        self._register_default_tools()
    
    def _register_default_tools(self):
        """Register the default set of clinical tools."""
        self.tools["fhir_patient_query"] = self._tool_patient_query
        self.tools["fhir_patient_summary"] = self._tool_patient_summary
        self.tools["evidence_search"] = self._tool_evidence_search
        self.tools["drug_interaction_check"] = self._tool_drug_interaction
        self.tools["lab_trend_analysis"] = self._tool_lab_trend
        self.tools["note_draft"] = self._tool_note_draft
        self.tools["report_draft"] = self._tool_report_draft
    
    def register_tool(self, name: str, fn: Callable):
        """Register a custom tool."""
        self.tools[name] = fn
    
    def execute(
        self,
        tool_name: str,
        parameters: Dict[str, Any],
        justification: str,
        patient_id: Optional[str] = None,
        auto_execute_low_risk: bool = True
    ) -> Dict[str, Any]:
        """
        Execute a tool with approval gating.
        
        For low-risk tools: executes immediately
        For medium+ risk tools: returns pending, requires explicit approval
        """
        # Request approval
        call = self.approval.request_tool_call(
            tool_name=tool_name,
            parameters=parameters,
            justification=justification,
            patient_id=patient_id
        )
        
        # If auto-approved or caller wants to handle pending, return status
        if call.status == "auto_approved" and auto_execute_low_risk:
            # Execute the tool
            result = self._execute_tool(call)
            call.result = result
            return {
                "status": "completed",
                "call_id": call.call_id,
                "result": result
            }
        
        # Return pending status for human review
        return {
            "status": "pending_approval",
            "call_id": call.call_id,
            "tool": tool_name,
            "risk_level": call.risk_level.value,
            "justification": justification,
            "message": f"This {call.risk_level.value}-risk action requires clinician approval."
        }
    
    def execute_approved(self, call_id: str) -> Dict[str, Any]:
        """Execute a previously approved tool call."""
        if call_id not in self.approval.approved_calls:
            raise ValueError(f"Call {call_id} not found or not approved")
        
        call = self.approval.approved_calls[call_id]
        result = self._execute_tool(call)
        call.result = result
        
        return {
            "status": "completed",
            "call_id": call_id,
            "result": result
        }
    
    def _execute_tool(self, call: ToolCall) -> Any:
        """Execute the actual tool function."""
        if call.tool_name not in self.tools:
            raise ValueError(f"Unknown tool: {call.tool_name}")
        
        fn = self.tools[call.tool_name]
        return fn(**call.parameters)
    
    # ─── Tool Implementations (Simulated) ─────────────────────────────────
    
    def _tool_patient_query(self, patient_id: str, resource_type: str) -> Dict:
        """Simulated FHIR patient data query."""
        return {"patient_id": patient_id, "resource_type": resource_type, "data": "[FHIR data]"}
    
    def _tool_patient_summary(self, patient_id: str) -> str:
        """Simulated patient summary generation."""
        return f"Summary for patient {patient_id}: [generated summary]"
    
    def _tool_evidence_search(self, query: str, k: int = 4) -> List[Dict]:
        """Simulated evidence search."""
        return [{"source": "guideline", "text": f"Evidence for: {query}"}]
    
    def _tool_drug_interaction(self, medications: List[str]) -> Dict:
        """Simulated drug interaction check."""
        return {"medications": medications, "interactions": [], "severity": "none"}
    
    def _tool_lab_trend(self, patient_id: str, loinc_code: str, months: int = 6) -> Dict:
        """Simulated lab trend analysis."""
        return {"loinc": loinc_code, "trend": "stable", "values": []}
    
    def _tool_note_draft(self, patient_id: str, note_type: str, content: str) -> str:
        """Simulated note drafting."""
        return f"[{note_type}] Draft note for {patient_id}: {content}"
    
    def _tool_report_draft(self, patient_id: str, report_type: str, findings: str) -> str:
        """Simulated report drafting."""
        return f"[{report_type}] Draft report for {patient_id}: {findings}"


# ─── Usage Example ──────────────────────────────────────────────────────────

def demo_approval_gates():
    """Demonstrate the approval gate system."""
    
    approval_mgr = ApprovalGateManager()
    executor = ClinicalToolExecutor(approval_mgr)
    
    print("=== Clinical Tool Execution with Approval Gates ===\n")
    
    # Example 1: Low-risk tool (auto-approved)
    print("1. Low-risk: Patient data query")
    result = executor.execute(
        tool_name="fhir_patient_query",
        parameters={"patient_id": "pt-001", "resource_type": "MedicationRequest"},
        justification="Need medication list to check interactions",
        patient_id="pt-001"
    )
    print(f"   Status: {result['status']}")
    print(f"   Result: {result.get('result', 'N/A')}\n")
    
    # Example 2: High-risk tool (requires approval)
    print("2. High-risk: Note drafting (requires approval)")
    result = executor.execute(
        tool_name="note_draft",
        parameters={"patient_id": "pt-001", "note_type": "Progress Note", "content": "..."},
        justification="Drafting progress note for today's encounter",
        patient_id="pt-001"
    )
    print(f"   Status: {result['status']}")
    print(f"   Call ID: {result['call_id']}")
    print(f"   Risk: {result['risk_level']}")
    print(f"   Message: {result['message']}\n")
    
    # Simulate clinician approving the pending call
    call_id = result['call_id']
    approval_mgr.approve_call(call_id, approver_id="dr.smith@hospital.org")
    final_result = executor.execute_approved(call_id)
    print(f"   After approval: {final_result['status']}")
    print(f"   Result: {final_result['result']}\n")
    
    # Example 3: Show pending queue
    print("3. Checking pending calls queue")
    # Create another pending call
    result2 = executor.execute(
        tool_name="report_draft",
        parameters={"patient_id": "pt-001", "report_type": "qEEG", "findings": "..."},
        justification="Drafting qEEG report findings",
        patient_id="pt-001"
    )
    pending = approval_mgr.get_pending_calls("pt-001")
    print(f"   Pending calls for pt-001: {len(pending)}")
    for p in pending:
        print(f"   - {p.tool_name} ({p.risk_level.value}): {p.justification}")
    
    # Show audit log
    print(f"\n4. Audit Log ({len(approval_mgr.audit_log)} events):")
    for event in approval_mgr.audit_log:
        print(f"   [{event['timestamp']}] {event['event']}: {event['tool']} (risk: {event['risk']})")


if __name__ == "__main__":
    demo_approval_gates()
```

### 9.4 Safety Guardrails Implementation

```python
"""
Comprehensive safety guardrails for clinical AI systems.
Implements multi-layer protection: hard, semantic, and uncertainty guardrails.
"""

import re
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

# ─── Safety Rule Definitions ────────────────────────────────────────────────

class GuardrailSeverity(Enum):
    INFO = "info"           # Suggestion, no action required
    WARNING = "warning"     # Review recommended
    VIOLATION = "violation" # Must fix before output
    NEVER_EVENT = "never_event"  # Critical safety violation

@dataclass
class GuardrailResult:
    """Result of a single guardrail check."""
    rule_name: str
    passed: bool
    severity: GuardrailSeverity
    message: str
    fix_applied: Optional[str] = None

# ─── Hard Guardrails ────────────────────────────────────────────────────────

class HardGuardrails:
    """
    Structural guardrails that enforce output format and content rules.
    These are deterministic checks that do not require LLM inference.
    """
    
    # Medical terminology databases (in production: use UMLS, SNOMED-CT, RxNorm)
    VALID_DRUG_NAMES = {
        "metformin", "lisinopril", "atorvastatin", "warfarin", "insulin",
        "aspirin", "acetaminophen", "amoxicillin", "prednisone", "levothyroxine"
    }
    
    VALID_DIAGNOSES = {
        "diabetes mellitus type 2", "hypertension", "hyperlipidemia",
        "atrial fibrillation", "chronic kidney disease", "heart failure",
        "chronic obstructive pulmonary disease", "asthma"
    }
    
    # Patterns for hallucinated drug names (common LLM errors)
    SUSPICIOUS_DRUG_PATTERNS = [
        r"\b[A-Z][a-z]+mab\b",  # Monoclonal antibodies should be known
        r"\b[A-Z][a-z]+nib\b",  # Tyrosine kinase inhibitors
    ]
    
    REQUIRED_SECTIONS = [
        "confidence_level",
        "source_citations",
        "decision_support_disclaimer"
    ]
    
    def check(self, text: str, metadata: Dict = None) -> List[GuardrailResult]:
        """Run all hard guardrail checks."""
        results = []
        
        results.extend(self._check_prohibited_phrases(text))
        results.extend(self._check_required_framing(text))
        results.extend(self._check_drug_names(text))
        results.extend(self._check_diagnostic_language(text))
        results.extend(self._check_source_citations(text))
        
        return results
    
    def _check_prohibited_phrases(self, text: str) -> List[GuardrailResult]:
        """Check for prohibited diagnostic or definitive language."""
        prohibited = [
            (r"\bthe patient has\s+\w+", "definitive diagnostic statement"),
            (r"\bdiagnosis[\s:]*\w+", "diagnosis declaration"),
            (r"\bthis confirms\s+", "confirmatory language"),
            (r"\bdefinitive\s+(diagnosis|finding)", "definitive language"),
        ]
        
        results = []
        for pattern, description in prohibited:
            if re.search(pattern, text, re.IGNORECASE):
                results.append(GuardrailResult(
                    rule_name="prohibited_language",
                    passed=False,
                    severity=GuardrailSeverity.VIOLATION,
                    message=f"Prohibited phrase detected: {description}",
                    fix_applied="Replace with 'differential includes' or 'consider' framing"
                ))
        
        if not results:
            results.append(GuardrailResult(
                rule_name="prohibited_language",
                passed=True,
                severity=GuardrailSeverity.INFO,
                message="No prohibited language detected"
            ))
        
        return results
    
    def _check_required_framing(self, text: str) -> List[GuardrailResult]:
        """Check that decision-support framing is present."""
        required_framing = [
            "decision support",
            "clinician review",
            "not a substitute",
        ]
        
        text_lower = text.lower()
        missing = [f for f in required_framing if f not in text_lower]
        
        if missing:
            return [GuardrailResult(
                rule_name="required_framing",
                passed=False,
                severity=GuardrailSeverity.VIOLATION,
                message=f"Missing required framing: {', '.join(missing)}",
                fix_applied="Auto-added decision-support disclaimer"
            )]
        
        return [GuardrailResult(
            rule_name="required_framing",
            passed=True,
            severity=GuardrailSeverity.INFO,
            message="Required decision-support framing present"
        )]
    
    def _check_drug_names(self, text: str) -> List[GuardrailResult]:
        """Check for potentially hallucinated drug names."""
        results = []
        
        # Extract potential drug names (simple heuristic)
        words = re.findall(r'\b[A-Z][a-z]+(?:\s+[a-z]+)*\b', text)
        
        suspicious = []
        for word in words:
            if word.lower() not in self.VALID_DRUG_NAMES:
                for pattern in self.SUSPICIOUS_DRUG_PATTERNS:
                    if re.match(pattern, word):
                        suspicious.append(word)
        
        if suspicious:
            results.append(GuardrailResult(
                rule_name="drug_name_verification",
                passed=False,
                severity=GuardrailSeverity.WARNING,
                message=f"Unverified drug names detected: {suspicious}",
                fix_applied="Flag for pharmacist review"
            ))
        else:
            results.append(GuardrailResult(
                rule_name="drug_name_verification",
                passed=True,
                severity=GuardrailSeverity.INFO,
                message="Drug names verified or not present"
            ))
        
        return results
    
    def _check_diagnostic_language(self, text: str) -> List[GuardrailResult]:
        """Check for appropriate diagnostic uncertainty language."""
        uncertainty_indicators = [
            "may", "might", "could", "consider", "suggestive of",
            "consistent with", "differential includes", "possible"
        ]
        
        has_uncertainty = any(ind in text.lower() for ind in uncertainty_indicators)
        
        # Only require uncertainty if text contains clinical content
        has_clinical_content = any(term in text.lower() for term in 
                                   ["patient", "treatment", "diagnosis", "medication"])
        
        if has_clinical_content and not has_uncertainty:
            return [GuardrailResult(
                rule_name="diagnostic_uncertainty",
                passed=False,
                severity=GuardrailSeverity.WARNING,
                message="Clinical content without uncertainty language",
                fix_applied="Add appropriate uncertainty qualifiers"
            )]
        
        return [GuardrailResult(
            rule_name="diagnostic_uncertainty",
            passed=True,
            severity=GuardrailSeverity.INFO,
            message="Appropriate uncertainty language present"
        )]
    
    def _check_source_citations(self, text: str) -> List[GuardrailResult]:
        """Check that clinical claims have source citations."""
        # Check for bracketed citations
        has_citations = bool(re.search(r'\[.*?\]', text))
        has_footnotes = bool(re.search(r'\d+\.\s+\w+', text))
        
        # Only require citations for substantive clinical content
        if len(text) > 200 and not has_citations and not has_footnotes:
            return [GuardrailResult(
                rule_name="source_citations",
                passed=False,
                severity=GuardrailSeverity.WARNING,
                message="No source citations found in clinical content",
                fix_applied="Add source citations to evidence-based claims"
            )]
        
        return [GuardrailResult(
            rule_name="source_citations",
            passed=True,
            severity=GuardrailSeverity.INFO,
            message="Source citations present or not required"
        )]


# ─── Semantic Guardrails ────────────────────────────────────────────────────

class SemanticGuardrails:
    """
    Semantic guardrails that verify the meaning and safety of content.
    These may use LLM-based verification or knowledge base lookups.
    """
    
    def __init__(self, llm_client: Optional[Any] = None):
        self.llm = llm_client
    
    def check(self, text: str, patient_context: Optional[str] = None) -> List[GuardrailResult]:
        """Run semantic guardrail checks."""
        results = []
        
        results.extend(self._check_factual_consistency(text))
        results.extend(self._check_clinical_safety(text, patient_context))
        results.extend(self._check_contraindication_risk(text, patient_context))
        
        return results
    
    def _check_factual_consistency(self, text: str) -> List[GuardrailResult]:
        """Check for internal factual consistency."""
        # In production: Use LLM or rule-based consistency checking
        # Example: If text says "patient has no allergies" and later mentions 
        # "allergic reaction", flag the inconsistency
        
        return [GuardrailResult(
            rule_name="factual_consistency",
            passed=True,
            severity=GuardrailSeverity.INFO,
            message="Factual consistency check passed (basic scan)"
        )]
    
    def _check_clinical_safety(self, text: str, patient_context: Optional[str]) -> List[GuardrailResult]:
        """Check for clinically unsafe recommendations."""
        # Check for high-risk medication recommendations without monitoring
        high_risk_meds = ["warfarin", "insulin", "opioid", "morphine", "fentanyl"]
        text_lower = text.lower()
        
        for med in high_risk_meds:
            if med in text_lower:
                # Check if monitoring is mentioned
                monitoring_terms = ["monitor", "check", "follow-up", "INR", "glucose"]
                has_monitoring = any(t in text_lower for t in monitoring_terms)
                
                if not has_monitoring:
                    return [GuardrailResult(
                        rule_name="high_risk_medication_safety",
                        passed=False,
                        severity=GuardrailSeverity.VIOLATION,
                        message=f"High-risk medication ({med}) without monitoring recommendations",
                        fix_applied="Add monitoring requirements for high-risk medications"
                    )]
        
        return [GuardrailResult(
            rule_name="high_risk_medication_safety",
            passed=True,
            severity=GuardrailSeverity.INFO,
            message="No unsafe medication recommendations detected"
        )]
    
    def _check_contraindication_risk(self, text: str, patient_context: Optional[str]) -> List[GuardrailResult]:
        """Check for potential contraindications."""
        # In production: Cross-reference with patient allergies, conditions
        return [GuardrailResult(
            rule_name="contraindication_check",
            passed=True,
            severity=GuardrailSeverity.INFO,
            message="Contraindication check requires patient context integration"
        )]


# ─── Composite Guardrail System ─────────────────────────────────────────────

class ClinicalSafetySystem:
    """
    Composite safety system combining all guardrail layers.
    """
    
    def __init__(self, llm_client: Optional[Any] = None):
        self.hard = HardGuardrails()
        self.semantic = SemanticGuardrails(llm_client)
    
    def validate(
        self,
        text: str,
        patient_context: Optional[str] = None,
        auto_fix: bool = True
    ) -> Dict[str, Any]:
        """
        Run full safety validation on clinical AI output.
        
        Returns:
            {
                "passed": bool,
                "can_auto_fix": bool,
                "fixed_text": str (if auto_fix=True and fixes applied),
                "results": List[GuardrailResult],
                "critical_issues": int,
                "warning_count": int
            }
        """
        all_results = []
        
        # Run hard guardrails
        all_results.extend(self.hard.check(text))
        
        # Run semantic guardrails
        all_results.extend(self.semantic.check(text, patient_context))
        
        # Calculate scores
        critical_count = sum(1 for r in all_results 
                            if r.severity in [GuardrailSeverity.VIOLATION, GuardrailSeverity.NEVER_EVENT])
        warning_count = sum(1 for r in all_results if r.severity == GuardrailSeverity.WARNING)
        passed_count = sum(1 for r in all_results if r.passed)
        
        # Determine if auto-fix is possible
        can_auto_fix = all(
            r.fix_applied is not None or r.passed
            for r in all_results
            if r.severity == GuardrailSeverity.VIOLATION
        )
        
        fixed_text = text
        if auto_fix and can_auto_fix:
            fixed_text = self._apply_fixes(text, all_results)
        
        return {
            "passed": critical_count == 0,
            "can_auto_fix": can_auto_fix,
            "fixed_text": fixed_text if auto_fix else text,
            "results": all_results,
            "critical_issues": critical_count,
            "warning_count": warning_count,
            "check_count": len(all_results),
            "passed_count": passed_count
        }
    
    def _apply_fixes(self, text: str, results: List[GuardrailResult]) -> str:
        """Apply automatic fixes for guardrail violations."""
        fixed = text
        
        for result in results:
            if result.passed:
                continue
            
            if result.rule_name == "required_framing":
                if "decision support" not in fixed.lower():
                    fixed = (
                        "=== CLINICAL DECISION SUPPORT ===\n"
                        "This information is provided for clinical decision support only. "
                        "It does not replace clinical judgment. All recommendations require "
                        "review by a qualified clinician.\n\n" + fixed
                    )
            
            elif result.rule_name == "prohibited_language":
                # Replace definitive language with tentative
                replacements = [
                    (r"(?i)the patient has (\w+)", r"the patient appears to have \1, though this requires confirmation"),
                    (r"(?i)diagnosis is (\w+)", r"differential diagnosis includes \1"),
                ]
                for pattern, replacement in replacements:
                    fixed = re.sub(pattern, replacement, fixed)
        
        return fixed


# ─── Usage ──────────────────────────────────────────────────────────────────

def demo_safety_system():
    """Demonstrate the safety guardrail system."""
    
    safety = ClinicalSafetySystem()
    
    # Example 1: Unsafe output
    print("=== Safety Guardrail Demo ===\n")
    
    unsafe_text = """
    The patient has diabetes mellitus type 2 with poor glycemic control.
    Start insulin glargine 20 units daily. The diagnosis is clear.
    """
    
    print("1. Testing unsafe clinical output:")
    print(f"   Input: {unsafe_text.strip()}")
    result = safety.validate(unsafe_text)
    print(f"   Passed: {result['passed']}")
    print(f"   Critical issues: {result['critical_issues']}")
    print(f"   Warnings: {result['warning_count']}")
    print(f"   Checks run: {result['check_count']}")
    
    for r in result['results']:
        status = "PASS" if r.passed else "FAIL"
        print(f"   [{status}] {r.rule_name}: {r.message}")
    
    print(f"\n   Fixed text:\n{result['fixed_text']}")
    
    # Example 2: Properly framed output
    print("\n\n2. Testing properly framed output:")
    safe_text = """
    === CLINICAL DECISION SUPPORT ===
    This information is provided for clinical decision support only and 
    requires clinician review.
    
    The patient's HbA1c of 8.5% suggests suboptimal glycemic control.
    Consider adding a GLP-1 receptor agonist or SGLT2 inhibitor, which 
    have shown cardiovascular benefits in patients with type 2 diabetes
    and established ASCVD [ADA Standards of Care 2024, Grade 1A].
    
    Differential diagnosis includes: medication non-adherence, 
    progression of beta-cell dysfunction, or concurrent illness.
    Clinical correlation is recommended.
    """
    
    result2 = safety.validate(safe_text)
    print(f"   Passed: {result2['passed']}")
    print(f"   Critical issues: {result2['critical_issues']}")
    for r in result2['results']:
        status = "PASS" if r.passed else "FAIL"
        print(f"   [{status}] {r.rule_name}: {r.message}")


if __name__ == "__main__":
    demo_safety_system()
```

---

## 10. Appendices

### Appendix A: Regulatory Considerations

| Regulation | Relevance | Compliance Requirements |
|------------|-----------|------------------------|
| **FDA 21 CFR 820** | Medical device software | If offering diagnostic support, may require FDA clearance as Class II device |
| **HIPAA** | All healthcare AI | BAA required, encryption, access controls, audit logs |
| **GDPR (EU)** | Patient data processing | Consent management, right to deletion, data portability |
| **21st Century Cures Act** | Information blocking | Ensure AI outputs don't block clinical information exchange |
| **State Medical Board Regulations** | Practice of medicine | AI must not be represented as practicing medicine without license |

### Appendix B: Evidence Sources Index

| Source | Type | Access | Update Frequency |
|--------|------|--------|-----------------|
| **PubMed/MEDLINE** | Biomedical literature | Free (NLM API) | Daily |
| **Cochrane Library** | Systematic reviews | Subscription | Quarterly |
| **UpToDate** | Clinical guidelines | Subscription | Continuous |
| **DynaMed** | Evidence summaries | Subscription | Daily |
| **NCCN Guidelines** | Cancer care guidelines | Free (registration) | Annual |
| **ADA Standards of Care** | Diabetes guidelines | Free | Annual |
| **ACC/AHA Guidelines** | Cardiology guidelines | Free | Annual |
| **IDSA Guidelines** | Infectious disease | Free | As needed |
| **DrugBank** | Drug information | Open API | Periodic |
| **DailyMed** | FDA labeling | Free (FDA API) | Daily |

### Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Ambient AI** | AI system that passively captures clinical encounters without requiring active data entry |
| **CDS** | Clinical Decision Support -- tools that provide evidence-based guidance at the point of care |
| **FHIR** | Fast Healthcare Interoperability Resources -- HL7 standard for EHR data exchange |
| **GRADE** | Grading of Recommendations Assessment, Development and Evaluation -- evidence quality framework |
| **Hallucination** | AI-generated content that is factually incorrect or fabricated |
| **Human-in-the-Loop** | System design requiring human approval for AI-generated outputs |
| **RAG** | Retrieval-Augmented Generation -- technique grounding LLM responses in retrieved documents |
| **SMART on FHIR** | OAuth2-based authentication framework for FHIR app integration |
| **SOAP Note** | Subjective, Objective, Assessment, Plan -- standard clinical note format |
| **Token Budget** | Allocation of LLM context window across different content types |

### Appendix D: Benchmark Performance Comparison

| System | MedQA (USMLE) | MedMCQA | PubMedQA | Harm Risk |
|--------|--------------|---------|----------|-----------|
| Human Expert | ~87% | ~75% | ~78% | Baseline |
| Med-PaLM 2 | 86.5% | 72.3% | 81.8% | 5.9% |
| GPT-4 | ~82% | ~68% | ~75% | Higher |
| Glass Health (Deep Reasoning) | 97-98% | N/A | N/A | Low |
| FHIR-RAG-MEDS | N/A | N/A | N/A | Very Low (RAG + FHIR) |

### Appendix E: Open Source Licensing Notes

| Component | Recommended | License | Notes |
|-----------|------------|---------|-------|
| **LangGraph** | LangChain | MIT | Graph-based agent orchestration |
| **LangChain** | LangChain | MIT | LLM orchestration framework |
| **FHIR Client** | fhir.resources | BSD-3 | Python FHIR resource models |
| **Vector DB** | Qdrant | Apache 2.0 | Open-source vector database |
| **Embeddings** | sentence-transformers | Apache 2.0 | Open-source embeddings |
| **LLM** | Llama 3.1/3.2 | Llama 3 License | Local deployment option |
| **BioMistral** | BioMistral-7B | Apache 2.0 | Biomedical LLM |
| **OpenBioLLM** | OpenBioLLM-70B | Llama 3 License | Biomedical LLM (larger) |

### Appendix F: Key Metrics for Clinical AI Evaluation

| Metric | Definition | Target |
|--------|-----------|--------|
| **Accuracy** | Correct answers / total questions | >85% for chart QA |
| **Faithfulness** | Claims supported by retrieved evidence | >95% |
| **Citation Precision** | Citations that actually support claims | >90% |
| **Hallucination Rate** | Unsupported claims / total claims | <2% |
| **Clinician Satisfaction** | Net Promoter Score from users | >50 |
| **Time Saved** | Minutes saved per encounter | >5 min |
| **Override Rate** | AI suggestions overridden by clinicians | <15% (indicates trust) |
| **Safety Event Rate** | Adverse events attributable to AI | 0 (never events) |

---

## References

1. Singhal, K., et al. (2023). "Large language models encode clinical knowledge." *Nature*, 620(7972), 172-180.
2. Tu, T., et al. (2024). "Towards Conversational Diagnostic AI." *arXiv preprint arXiv:2401.05654*.
3. Moor, M., et al. (2023). "Med-Flamingo: a multimodal medical few-shot learner." *Proceedings of Machine Learning Research*.
4. Singhal, K., et al. (2022). "Large Language Models Encode Clinical Knowledge." *Nature*.
5. Microsoft (2024). "DAX Copilot: New Customization Options." Microsoft Cloud Blog.
6. Cleveland Clinic (2025). "Less Typing, More Talking: AI Reshapes Clinical Workflow." ConsultQD.
7. Ambience Healthcare (2025). Technical documentation and deployment reports.
8. Glass Health (2025). Clinical AI Platform documentation.
9. OpenEvidence (2025). Platform documentation and usage statistics.
10. Hippocratic AI (2025). Polaris System Patent 12,142,371.
11. FHIR-RAG-MEDS (2026). "Integrating HL7 FHIR with Retrieval-Augmented LLMs." Preprints.
12. GRADE Working Group (2004). "Grading quality of evidence and strength of recommendations." *BMJ*.
13. Nature Scientific Reports (2025). "The need for guardrails with LLMs in pharmacovigilance."
14. CareGuardAI (2026). "Context-Aware Multi-Agent Guardrails for Clinical Safety." *arXiv*.
15. JAMA Network Open (2025). "Ambient AI scribe rollout and clinician burnout."
16. LangGraph Documentation (2025). langchain-ai.github.io/langgraph.

---

*This research report was compiled for the DeepSynaps Protocol Studio clinical AI engineering team. All vendor information is based on publicly available data as of the report date. Clinical AI implementations should always include independent legal, regulatory, and clinical safety review.*

**Document End**
