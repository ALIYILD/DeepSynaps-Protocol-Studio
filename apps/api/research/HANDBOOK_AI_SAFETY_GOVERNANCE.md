# DeepSynaps Handbooks — AI Safety & Governance Handbook
## Clinical Patient Education & Medical Document Generation

**Version:** 1.0  
**Date:** 2026-05-19  
**Classification:** Research Synthesis — Regulatory & Safety Framework  
**Scope:** AI-generated clinical patient education materials, neuromodulation device handbooks, and medical document workflows

---

## Table of Contents

1. [Regulatory Landscape](#1-regulatory-landscape)
2. [AI Hallucination Prevention](#2-ai-hallucination-prevention)
3. [Citation Grounding & Verification](#3-citation-grounding--verification)
4. [Clinical Document Review Workflows](#4-clinical-document-review-workflows)
5. [Health Literacy & Readability Standards](#5-health-literacy--readability-standards)
6. [Data Governance & Privacy](#6-data-governance--privacy)
7. [Human-in-the-Loop Requirements](#7-human-in-the-loop-requirements)
8. [Technical Implementation Standards](#8-technical-implementation-standards)
9. [Governance Framework](#9-governance-framework)
10. [Appendices](#10-appendices)

---

## 1. Regulatory Landscape

### 1.1 FDA (U.S. Food and Drug Administration)

#### Total Product Life Cycle (TPLC) Approach
The FDA evaluates AI/ML-enabled medical devices across their entire lifespan: design, development, deployment, and postmarket monitoring. This is critical for adaptive or generative models that evolve after authorization.

#### Good Machine Learning Practice (GMLP) — 10 Guiding Principles
Developed jointly with Health Canada and the UK MHRA:

| Principle | Requirement |
|-----------|-------------|
| 1. Multi-Disciplinary Expertise | Leverage diverse expertise throughout product lifecycle |
| 2. Good Software Engineering | Apply established software engineering practices |
| 3. Clinical Study Participants & Data Sets | Data representative of intended population |
| 4. Reference Standard Independence | Independent, high-quality reference standards |
| 5. Selected ML Model | Appropriate model architecture for task |
| 6. Model Training & Tuning | Sound training and hyperparameter tuning |
| 7. Model Validation | Independent test sets, clinically meaningful performance |
| 8. Human-AI Interaction | Accounting for human factors and usability |
| 9. Testing for Bias | Evaluating performance across demographic subgroups |
| 10. Transparency | Clear, user-accessible information about device operation |

#### Predetermined Change Control Plan (PCCP)
A PCCP allows manufacturers to make modifications to AI-enabled devices without additional FDA review if changes stay within pre-authorized scope. Three core elements:

1. **Description of Modifications** — Detailed account of planned changes, type, frequency, affected components
2. **Modification Protocol** — Methods for implementation: data practices, retraining, testing, user communication
3. **Impact Assessment** — Evaluation of benefits, risks, and mitigation strategies

#### Key FDA Guidance Documents (2024-2025)

| Document | Date | Key Requirements |
|----------|------|-----------------|
| Transparency for ML-Enabled Medical Devices | June 2024 | Plain-language disclosure of AI use, inputs/outputs, performance measures, known risks, bias sources |
| AI-Enabled Device Software Functions: Lifecycle Management | Jan 2025 | Comprehensive lifecycle management recommendations, bias control, transparency requirements |
| Predetermined Change Control Plans (Final) | Dec 2024 | PCCP structure for post-market modifications |
| AI & Medical Products: Coordinated Approach | March 2024 | Cross-center alignment (CBER, CDER, CDRH, OCP) |

#### Labeling Requirements for AI-Enabled Devices
- Clear statement that device uses AI with plain-language description
- Details on model inputs/outputs, data collection methods, system interactions
- Performance measures with known risks and potential bias sources
- PCCP monitoring and update policies
- Patient/caregiver-facing instructions at accessible reading level

### 1.2 EU AI Act (Regulation EU 2024/1689)

#### Classification: High-Risk AI Medical Devices
AI systems embedded in or acting as medical devices under MDR/IVDR are automatically classified as **high-risk** under the EU AI Act (Article 6, Annex II). Effective dates:

| Category | Enforcement Date |
|----------|---------------|
| Annex III (healthcare access services) | August 2, 2026 |
| Annex I (AI as medical device/safety component) | August 2, 2027 |

#### Core Obligations for High-Risk Medical AI

| Article | Requirement | Implementation |
|---------|-------------|---------------|
| Art. 9 | Risk Management System | Continuous identification, evaluation, mitigation of foreseeable risks; integrated with ISO 14971 |
| Art. 10 | Data Governance | Training/validation data quality, bias assessment, representativeness, metadata documentation |
| Art. 11 | Technical Documentation | Annex IV dossier: design spec, architecture, training methods, validation procedures |
| Art. 12 | Record-Keeping & Logging | Automatic logs over system lifetime; functional traceability |
| Art. 13 | Transparency | Clear user information; disclosure of AI interaction, performance metrics, limitations |
| Art. 14 | Human Oversight | Competent human operator can monitor, intervene, override AI decisions |
| Art. 15 | Accuracy, Robustness, Cybersecurity | Validation on large datasets; adversarial noise checks; unauthorized change prevention |
| Art. 17 | Quality Management System | Integrated with existing ISO 13485 QMS; AI lifecycle governance |
| Art. 61 | Post-Market Monitoring | Ongoing performance tracking; drift detection; incident reporting |

#### Dual Compliance Model
Medical device manufacturers must comply with **both** the EU AI Act AND existing MDR/IVDR simultaneously. The AI Act does not replace MDR/IVDR — it adds AI-specific requirements for data governance, transparency, and human oversight. Integration into existing QMS is explicitly encouraged (Art. 11(2)).

### 1.3 Joint Commission RUAIH Framework

The Responsible Use of AI in Healthcare (RUAIH) identifies **seven essential elements**:

1. AI policies and governance structures
2. Patient privacy and transparency
3. Data security
4. Ongoing quality monitoring
5. Voluntary reporting of AI safety events
6. Risk and bias assessment
7. Education and training

### 1.4 ISO Standards

| Standard | Scope |
|----------|-------|
| ISO/IEC 62304 | Software lifecycle processes for medical device software |
| ISO 13485 | Medical device quality management systems |
| ISO/IEC 42001 | Artificial intelligence management systems |
| ISO 14971 | Risk management for medical devices |
| ISO/IEC 27001 | Information security management |

---

## 2. AI Hallucination Prevention

### 2.1 Definition & Clinical Risk

AI hallucination — the generation of plausible but fabricated or ungrounded content — poses severe risks in clinical contexts:

- **Patient Safety**: Incorrect diagnoses or treatment recommendations
- **Trust Erosion**: Repeated errors degrade clinician and patient trust
- **Legal/Ethical**: Malpractice liability; regulatory scrutiny
- **Cascade Effects**: Hallucinated content propagates through interconnected systems (EHR, insurance, specialist referrals)

### 2.2 Multi-Layered Prevention Architecture

#### Layer 1: Training Data & Model Selection
- Use diverse, high-quality, representative datasets
- Select LLMs with demonstrated strong long-form factuality performance
- Regularly update models with new clinical data
- Configure temperature settings low (0.0-0.3) for clinical content generation

#### Layer 2: Retrieval-Augmented Generation (RAG)
- Build domain-specific knowledge bases from verified clinical sources
- Retrieve relevant evidence before generation
- Reformulate complex medical queries into search-optimized synthetic queries
- Implement retrieval from authoritative databases (PubMed, Cochrane, clinical guidelines)

#### Layer 3: Prompt Engineering & Context Tuning
- Contextual prompt tuning with built-in self-awareness prompts
- Provide explicit grounding instructions ("Only use the provided context")
- Structure prompts with constrained output formats
- Include few-shot examples of correct, grounded responses

#### Layer 4: Output Verification & Fact-Checking
- Automated fact-checking tools (Med-HALT, FActScore)
- Cross-reference generated claims against source material
- Unsupported Sentence Ratio (USR) calculation — flag sentences below similarity threshold
- Dual-query verification: generate answer then independently verify against sources

#### Layer 5: Human-in-the-Loop (HITL)
- Mandatory clinical expert review before publication
- Structured verification checkpoints at document generation stages
- Clear accountability chains (author, reviewer, approver)
- Feedback loops to improve model performance

### 2.3 Pre-Deployment Testing
- Extensive testing in simulated environments
- Hallucination scenario identification via red teaming
- Performance evaluation across demographic subgroups
- Bias detection in training and validation data

### 2.4 Temperature Configuration Guide

| Use Case | Temperature | Reasoning |
|----------|-------------|-----------|
| Clinical facts & protocols | 0.0 | Maximum accuracy; no creativity |
| Patient education draft | 0.1-0.2 | Minimal variation; high consistency |
| Explaining side effects | 0.1 | Precise, reproducible language |
| FAQ generation | 0.2-0.3 | Slight variation for readability |
| Marketing/adjacent content | 0.5-0.7 | Higher creativity acceptable |

---

## 3. Citation Grounding & Verification

### 3.1 Architecture Patterns

#### Pattern 1: RAG with Inline Citations
Vector databases for retrieval + LLM for composition. Use when human-readable evidence is required.

```
User Query → Query Preprocessing → Vector Search + Lexical Search → 
Evidence Scoring (relevance, trust, license) → LLM Composition with 
Retrieved Passages → Inline Citations + Provenance Metadata → 
Post-processing → User Output with "View Source" capability
```

#### Pattern 2: Dual-Query Verification
Generate candidate answer, then issue independent verification queries to authoritative sources. Use for high-assurance clinical scenarios.

#### Pattern 3: Split-Model Pipeline
Lightweight model for routing; heavy model for grounded composition. Reduces cost under load while maintaining accuracy.

#### Pattern 4: Hybrid KB + Retrieval
Canonical knowledge base for established facts + retrieval for fresh/variable content. Best for combining stable medical knowledge with emerging evidence.

### 3.2 Deterministic Grounding Assessment (D-RAG Evaluator)

Four-dimensional verification framework:

| Dimension | Method | Threshold |
|-----------|--------|-----------|
| Accuracy | Regex extraction against ground truth | 100% match |
| Faithfulness | Mean cosine similarity (TF-IDF + char n-grams) between answer sentences and cited chunks | > 25% |
| Unsupported Sentence Ratio (USR) | Cross-reference each sentence against full retrieved context; flag if max similarity < threshold | < 0.22 (clinical threshold) |
| Knowledge Override (OVR) | Identify cases where answer is correct but reasoning lacks contextual grounding | Flag for review |

### 3.3 Citation Quality Metrics (SLOs)

| Metric | Definition | Target |
|--------|-----------|--------|
| Citation Coverage | Fraction of responses with citation | > 95% for critical flows |
| Verifiability Rate | Fraction of citations matching source | > 98% for regulated domains |
| Citation Latency (p95) | Time to attach citation | < 500ms for web UX |
| Evidence Relevance Score | Mean relevance for top citation | >= 0.8 normalized |
| Staleness Rate | Citations older than TTL | < 1% |
| Dispute Rate | User disputes per 1k responses | < 2 for mature systems |

### 3.4 Verification Pipeline Steps

1. **Ingest & Index** — Crawl authoritative sources; store content with embeddings, hashes, metadata
2. **Query Preprocessing** — Normalize query; apply context filters and user permission filters
3. **Retrieval** — Fetch candidate documents via vector + traditional search
4. **Evidence Scoring** — Rank by relevance, freshness, trust score, license eligibility
5. **Verification** — Check content hashes, access controls; re-query authoritative sources if needed
6. **Composition** — LLM synthesizes answer using retrieved passages with inline citations
7. **Post-processing** — Redact sensitive excerpts; compute confidence scores
8. **Logging & Telemetry** — Emit traces linking outputs to evidence and verification outcomes
9. **User Interaction** — Enable "View Source," "Dispute," and feedback loops

---

## 4. Clinical Document Review Workflows

### 4.1 Role-Based Workflow Architecture

Every clinical document workflow requires three minimum roles:

| Role | Responsibilities | Regulatory Requirements |
|------|-----------------|------------------------|
| **Author** | Creates initial draft; integrates feedback; drives document through workflow | Qualified and trained on SOPs/templates; identity captured in audit trail |
| **Reviewer** | SME verification of accuracy, clarity, compliance within specific domain | Delegation of authority log showing reviewer qualifications; documented expertise area |
| **Approver** | Final binding sign-off confirming completeness, accuracy, readiness | Electronic signature compliant with 21 CFR Part 11 or equivalent |

### 4.2 Review Gate Design

#### Sequential Review (Recommended for High-Risk Documents)
```
Draft → Medical/Clinical Review → Statistical Review → 
Regulatory/QA Review → Final Approval → Publication
```

Advantage: Establishes foundational agreement before finer details are examined. Prevents downstream reviewers from spending time on sections still undergoing significant changes.

#### Parallel Review (Appropriate for Low-Risk Documents)
All reviewers examine simultaneously. Risk: contradictory feedback, version control challenges.

### 4.3 Risk-Based Workflow Tiers

| Document Tier | Examples | Workflow |
|---------------|----------|----------|
| High-Impact | Protocols, Investigator's Brochures, Clinical Study Reports | Formal sequential: Medical → Statistics → Regulatory → QA |
| Medium-Impact | Statistical Analysis Plans, Pharmacy Manuals | Focused workflow: Key SMEs → Regulatory |
| Low-Impact | Training guides, Administrative logs | Streamlined 2-step: Review + Approval |

### 4.4 Regulatory Alignment

#### ICH E6(R3) — Good Clinical Practice
- Risk-based approach to trial management
- Quality-by-design principles applied to document workflows
- Level of scrutiny matches document's potential impact on patient safety

#### 21 CFR Part 11 (Electronic Records & Signatures)
- Complete, immutable audit trail
- Cryptographically linked electronic signatures
- Tamper-proof timestamping of all actions
- Ability to reconstruct complete document history for inspection

#### ICH E3 — Clinical Study Reports
- Structure and content requirements for regulatory submissions
- QA verification of alignment with guidelines before final approval

### 4.5 Audit Trail Requirements

Every interaction with a document must be captured:
- Authorship with timestamps
- Review comments and resolutions
- All edits and revisions with attribution
- Approval signatures linked to specific document versions
- Complete chain of evidence for regulatory inspection

---

## 5. Health Literacy & Readability Standards

### 5.1 Universal Plain Language Requirements

#### AMA/NIH Readability Standard
Patient education materials should not exceed **6th grade reading level** (Flesch-Kincaid Grade Level).

#### Current State Assessment
Research consistently shows that patient education materials far exceed recommended levels:

| Source | Mean Grade Level | % Above 6th Grade |
|--------|-----------------|-------------------|
| AAST Website Materials | 10.9 | 93.8% |
| American Heart Association | 10.7 | ~95% |
| American Cancer Society | 10.0 | ~90% |
| American Stroke Association | 9.6 | ~85% |
| High-Impact Medical Journals (20-year analysis) | 10+ | >90% |

#### SLP Graduate Student PEMs (Baseline Study)
- Only **7%** passed understandability domain
- **0%** passed actionability domain
- Median readability above 11th grade
- Gap: training in health literacy and plain language is critical

### 5.2 Readability Formulas (Multi-Metric Approach)

Use multiple validated metrics to minimize individual formula bias:

| Formula | Measures | Notes |
|---------|----------|-------|
| Flesch-Kincaid Grade Level | Sentence length, syllables per word | Most commonly used; may underestimate difficulty of short, unfamiliar words |
| Flesch Reading Ease | Sentence length, syllables per word | Higher score = easier to read |
| Gunning Fog Index | Complex words (3+ syllables) | Emphasizes polysyllabic vocabulary |
| FORCAST Index | Single-syllable word count | Focuses on vocabulary difficulty |
| Simple Measure of Gobbledygook (SMOG) | Polysyllabic words in sample | Strong predictor of comprehension |
| New Dale-Chall | Familiar vs. difficult words | Accounts for word familiarity |

### 5.3 PEMAT — Patient Education Materials Assessment Tool

#### Understandability Domain (13 items)
1. Purpose completely evident
2. Common, everyday language used
3. Medical terms defined when used
4. Active voice used
5. Information chunked into short sections
6. Informative section headers
7. Logical sequence of information
8. Summary provided
9. Visual cues draw attention to key points (arrows, boxes, bullets, bold)
10. Text easy to read
11. Audio/narration clear and understandable
12. No distracting content
13. Visual aids reinforce understanding

#### Actionability Domain (4 items)
1. Clearly explains what actions to take
2. Addresses barriers to action
3. Provides clear follow-up steps
4. Explains when to seek help

### 5.4 Suitability Assessment of Materials (SAM)

Six evaluation dimensions: Content, Literacy Demand, Graphics, Layout & Typography, Learning Stimulation & Motivation, Cultural Appropriateness.

### 5.5 DISCERN Instrument
Quality and credibility assessment for health information:
- Explicit aims
- Achievement of aims
- Relevance to patients
- Sources of information cited
- Currency of information
- Balance and unbiased presentation
- Additional sources of information provided
- Uncertainty acknowledged

### 5.6 DeepSynaps Readability Target

| Parameter | Target | Maximum |
|-----------|--------|---------|
| Flesch-Kincaid Grade Level | 5-6 | 7 |
| Flesch Reading Ease | 70-80 | 60 |
| Sentence Length | < 15 words | 20 words |
| Paragraph Length | < 4 sentences | 6 sentences |
| Medical Terms | Defined inline at first use | — |
| Active Voice | > 90% | — |

### 5.7 Readability Optimization via LLMs

Validated approach: LLM-simplified patient education materials:
- ChatGPT: improved grade level from 10.1 to 7.6 (p < 0.001)
- Gemini: improved to 6.6 (p < 0.001)
- Claude: improved to 5.6 (p < 0.001)
- Word count reduced by ~50%
- Baseline understandability (PEMAT-U) preserved across all models
- Inaccuracy rate: 0% ChatGPT, 3.3% Gemini, 3.3% Claude

> **Safety Requirement:** All LLM-simplified content must undergo clinical expert review before publication. Inaccuracy rate > 0% necessitates HITL verification.

---

## 6. Data Governance & Privacy

### 6.1 Privacy-Preserving Mechanisms

| Mechanism | Purpose | Application |
|-----------|---------|-------------|
| Federated Learning | Model training across decentralized institutions without raw data sharing | Multi-site clinical validation |
| Differential Privacy | Add controlled noise to outputs to prevent re-identification | Model inference protection |
| Homomorphic Encryption | Computation on encrypted data without decryption | Third-party processing |
| Secure Multiparty Computation | Collaborative training with local data isolation | Cross-institutional research |
| Zero-Trust Architecture | Secure computation, encrypted communication, decentralized governance | System-wide security posture |

### 6.2 GDPR & HIPAA Compliance
- No identifiable patient data exposed or transferred
- Explicit consent for AI-assisted documentation documented
- Audit logging of all data access and processing
- Right to explanation and data deletion
- Data minimization: only collect necessary information

### 6.3 AI Consent Requirements
- Patient consent obtained before AI-generated documentation
- Consent covers: AI tool description, data handling, accuracy verification by clinician
- Patient right to decline without affecting care quality
- Annual review of consent forms; update when vendor practices change
- Quarterly audit spot-checks verifying consent documentation

---

## 7. Human-in-the-Loop Requirements

### 7.1 EU AI Art. 14 — Human Oversight Mandate
- High-risk AI systems must enable competent human operators to:
  - Monitor AI operation in real-time
  - Intervene and override AI outputs
  - Understand AI capabilities and limitations
- Systems must provide explanations of outputs
- Clear user instructions for oversight processes

### 7.2 HITL Integration Points

| Stage | HITL Action | Accountability |
|-------|-------------|---------------|
| Content Generation | Review AI draft for accuracy | Author (Clinician) |
| Citation Verification | Validate all citations against sources | SME Reviewer |
| Readability Check | Confirm appropriate grade level | Medical Writer |
| Clinical Accuracy | Verify medical facts, dosages, procedures | Subject Expert |
| Patient Safety Review | Flag risks, side effects, contraindications | Safety Officer |
| Final Approval | Binding sign-off for publication | Authorized Approver |

### 7.3 Training Requirements
- Healthcare professionals trained on AI capabilities and limitations
- Understanding of when to trust vs. override AI outputs
- Competency validation before autonomous use
- Ongoing education as models evolve

---

## 8. Technical Implementation Standards

### 8.1 Model Configuration

| Parameter | Clinical Content | Rationale |
|-----------|-----------------|-----------|
| Temperature | 0.0 - 0.2 | Maximum factuality |
| Top-p | 0.9 - 1.0 | Controlled diversity |
| Max tokens | Context-appropriate | Prevent truncation of critical info |
| Frequency penalty | 0.0 | Avoid altering clinical terms |
| Presence penalty | 0.0 - 0.2 | Minimal variation for consistency |

### 8.2 RAG System Architecture

```
[User Query] 
    → [Query Preprocessing: normalization, filtering]
    → [Retrieval: Vector DB + Lexical Search]
    → [Evidence Scoring: relevance, trust, freshness, license]
    → [Context Assembly: top-k chunks with metadata]
    → [LLM Generation: grounded composition with inline citations]
    → [Post-Processing: redaction, confidence scoring]
    → [Verification: citation validation against sources]
    → [Output: response + citation links + dispute option]
```

### 8.3 Quality Gates

```
Generation → Auto-Fact-Check → Human Review → 
Citation Verify → Readability Check → Clinical Sign-off → Publish
```

### 8.4 Error Handling

| Scenario | System Response |
|----------|----------------|
| Missing source | Refuse generation or indicate uncertainty |
| Contradictory sources | Surface conflicts; show confidence levels |
| Stale evidence | Mark as outdated; request re-fetch |
| Low confidence | Escalate to human reviewer |
| Private data detected | Enforce redaction; log access attempt |

### 8.5 Monitoring & Observability
- End-to-end tracing linking model calls to retrieval evidence
- Metrics dashboard: citation coverage, verifiability, latency, staleness
- Alert thresholds for SLO violations
- Monthly review of index freshness and license health
- Automated dispute tracking and retraining pipeline

---

## 9. Governance Framework

### 9.1 AI Governance Board Structure

Cross-functional council with minimum representation:
- Executive leadership
- Clinical experts (medical, nursing)
- Compliance officer
- IT/security professionals
- Data scientists
- Patient advocates
- Legal counsel

### 9.2 Policy Lifecycle Coverage

Policies must address every stage:
1. **Implementation** — AI approval, validation requirements
2. **Operation** — Monitoring, human oversight, incident response
3. **Maintenance** — Model updates, retraining, PCCP management
4. **Decommissioning** — Data archival, transition planning

### 9.3 Risk Management Integration

Extend ISO 14971 to include AI-specific hazards:
- Data drift
- Model degradation
- Adversarial attacks
- Algorithmic bias
- Hallucination/factual errors
- Integration failures with EHR/other systems

### 9.4 Post-Market Surveillance (AI-Specific)

- Track model performance metrics in real-world use
- Monitor for accuracy drift over time
- Collect user feedback and dispute reports
- Periodic re-evaluation against reference datasets
- Incident reporting for serious errors

### 9.5 Documentation Requirements

| Document | Purpose | Retention |
|----------|---------|-----------|
| Technical Documentation (Annex IV) | Regulatory compliance | Lifetime of system + 10 years |
| Risk Management File | ISO 14971 alignment | Lifetime + 10 years |
| Validation Test Reports | Performance evidence | Lifetime + 10 years |
| Training Records | Competency evidence | 7 years |
| Audit Logs | Operational traceability | 7 years |
| Incident Reports | Safety surveillance | 10 years |
| PCCP Documentation | Change control | Lifetime + 10 years |

---

## 10. Appendices

### Appendix A: DeepSynaps-Specific Safety Checklist

- [ ] All patient-facing content reviewed by licensed clinician
- [ ] Citations verified against authoritative sources
- [ ] Readability score verified at 6th grade or below
- [ ] All medical terms defined at first use
- [ ] Patient consent for AI-generated content documented
- [ ] Disclaimers included ("AI-assisted; verified by your clinician")
- [ ] Side effects and risks comprehensively listed
- [ ] Emergency contact information provided
- [ ] Multi-language availability assessed
- [ ] Accessibility standards (WCAG 2.1 AA) met
- [ ] Audit trail complete for document lifecycle
- [ ] Bias assessment performed across demographic groups
- [ ] Data governance log maintained
- [ ] Human oversight capability confirmed
- [ ] Version control and PCCP documentation current

### Appendix B: Reference Standards Summary

| Standard/Guideline | Authority | Key Application |
|-------------------|-----------|----------------|
| GMLP Principles | FDA/Health Canada/MHRA | ML model development |
| TPLC Framework | FDA | Device lifecycle management |
| EU AI Act | European Commission | High-risk AI compliance |
| ICH E6(R3) | ICH | GCP and clinical trial documents |
| 21 CFR Part 11 | FDA | Electronic records and signatures |
| ISO 13485 | ISO | Medical device QMS |
| ISO/IEC 62304 | ISO | Software lifecycle processes |
| PEMAT | AHRQ | Patient education assessment |
| DISCERN | NHS/University of Oxford | Health information quality |
| SAM | Doak, Doak & Root | Material suitability assessment |

### Appendix C: Key Definitions

| Term | Definition |
|------|-----------|
| AI Hallucination | Generation of plausible but fabricated or ungrounded content |
| Citation Grounding | Linking AI outputs to specific, verifiable source evidence |
| CRDT | Conflict-free Replicated Data Type; enables real-time collaborative editing |
| D-RAG Evaluator | Deterministic RAG evaluation framework using algorithmic verification |
| GMLP | Good Machine Learning Practice; FDA's guiding principles |
| HITL | Human-in-the-Loop; human oversight integrated into AI workflows |
| PCCP | Predetermined Change Control Plan for post-market AI modifications |
| RAG | Retrieval-Augmented Generation; retrieval before generation |
| RUAIH | Responsible Use of AI in Healthcare; Joint Commission framework |
| SaMD | Software as a Medical Device |
| TPLC | Total Product Life Cycle; FDA's lifecycle oversight approach |
| USR | Unsupported Sentence Ratio; metric for grounding quality |

---

*This handbook is a living document. It should be reviewed quarterly and updated in response to regulatory changes, emerging safety evidence, and operational learnings.*
