# PHASE 3: Evidence-Linked Reasoning Design

## DeepSynaps Protocol Studio -- Design Document

**Version:** 1.0  
**Date:** 2025-07-17  
**Status:** Draft for Review  
**Authors:** DeepSynaps Architecture Team

---

## Executive Summary

This document presents the evidence-linked reasoning framework for DeepSynaps Protocol Studio, a clinical decision support system (CDSS) that grounds artificial intelligence outputs in verifiable biomedical evidence. The design addresses a critical failure mode of large language models (LLMs) in healthcare: the generation of plausible but unverified or hallucinated clinical claims. Our approach integrates retrieval-augmented generation (RAG) with structured evidence grading, uncertainty quantification, and conflict resolution to produce summaries that clinicians can trust and verify.

The framework recommends the GRADE (Grading of Recommendations Assessment, Development and Evaluation) system as the primary evidence grading methodology, supplemented by the Cochrane Risk of Bias 2 (RoB 2) tool for randomized trial assessment and the Newcastle-Ottawa Scale (NOS) for observational studies. The architecture separates evidence storage, linkage, and presentation into distinct layers, enabling automated updates while maintaining provenance trails for every clinical recommendation.

Key design decisions include: (1) a hybrid RAG architecture combining dense vector retrieval with structured knowledge graph queries; (2) explicit uncertainty decomposition into epistemic and aleatoric components; (3) automated conflict detection with human-in-the-loop resolution protocols; and (4) comprehensive research-only flagging to prevent unauthorized clinical application.

---

## 1. Evidence-Grounded AI Context

### 1.1 The Evidence Crisis in Clinical AI

Large language models have demonstrated remarkable capability in medical question-answering, yet studies indicate that over 30% of answers in medical QA tasks contain factual errors (Jin et al., 2021). In high-stakes clinical applications, these errors pose risks ranging from misinformation to life-threatening misdiagnoses. The fundamental issue is that LLMs generate text based on statistical patterns rather than verified facts, producing "hallucinations" -- confident statements unsupported by evidence (Slobodkin et al., 2023; Liu et al., 2024a).

Uncertainty quantification (UQ) emerges as a pivotal mechanism to enhance LLM trustworthiness by explicitly modeling confidence in model outputs. In clinical settings, uncertainty-aware LLMs can flag uncertain diagnoses for specialist review, potentially reducing diagnostic errors by up to 41% (Sen et al., 2024). However, uncertainty alone is insufficient: clinicians require not just confidence scores, but transparent links to the evidence underlying each recommendation.

### 1.2 Design Principles

The DeepSynaps evidence-linked reasoning system adheres to the following principles:

1. **Every claim must be traceable** to one or more primary sources
2. **Evidence quality must be explicit** through standardized grading
3. **Uncertainty must be communicated** in clinically meaningful terms
4. **Conflicting evidence must be surfaced**, not suppressed
5. **All outputs are research-only** until validated through clinical trials
6. **Human oversight is mandatory** for all recommendation pathways

---

## 2. Citation-Grounded Generation

### 2.1 Retrieval-Augmented Generation Architecture

The DeepSynaps RAG architecture, designated ClinicalRAG, follows a hybrid retrieval design that combines dense vector similarity search with structured knowledge graph traversal (Lu et al., 2024). This approach addresses the limitations of pure vector retrieval, which can miss critical logical relationships between clinical entities.

The architecture comprises four layers:

**Document Ingestion Layer.** Biomedical literature is processed through a pipeline that extracts structured metadata (study design, population, interventions, outcomes, funding sources) alongside semantic chunking that preserves contextual integrity. Each chunk is annotated with Medical Subject Headings (MeSH) terms and linked to the Unified Medical Language System (UMLS) concept unique identifiers (CUIs).

**Vector Indexing Layer.** Document chunks are embedded using a domain-specific biomedical embedding model optimized for clinical question answering. The resulting high-dimensional vectors are indexed using FAISS (Facebook AI Similarity Search) for efficient similarity retrieval (Jeong et al., 2024). Separate indices are maintained for different evidence types: randomized controlled trials, observational studies, systematic reviews, and clinical guidelines.

**Knowledge Graph Layer.** A medical knowledge graph captures relationships between diseases, symptoms, treatments, and outcomes using standardized ontologies (SNOMED CT, RxNorm, LOINC). Graph traversal enables retrieval of evidence that may not be semantically similar to the query but is logically relevant -- for example, identifying evidence about drug interactions not mentioned in the original query.

**Generation Layer.** Retrieved evidence chunks are concatenated with the clinical query and input to a fine-tuned language model. The model generates responses grounded exclusively in the provided context, with explicit citations to source documents. Prompt engineering incorporates chain-of-thought reasoning to improve the logical coherence of clinical summaries (Wu et al., 2025).

### 2.2 Citation Accuracy Requirements

Citation accuracy in DeepSynaps is measured across three dimensions:

| Dimension | Target | Measurement Method |
|-----------|--------|-------------------|
| Citation presence | 100% of claims | Automated claim-citation pairing verification |
| Citation relevance | >95% precision | Human evaluation of citation-claim alignment |
| Citation correctness | >98% accuracy | Automated verification against source abstracts |
| Citation completeness | >90% recall | Coverage assessment against systematic review gold standards |

These targets exceed typical RAG system benchmarks because clinical applications demand higher reliability. The system employs a self-consistency check where multiple retrieval paths must converge on the same evidence before a claim is considered well-supported.

### 2.3 Evidence Retrieval from Structured Databases

Beyond unstructured literature, DeepSynaps interfaces with structured clinical evidence databases:

- **ClinicalTrials.gov** for trial registration and outcome data
- **Cochrane Library** for systematic review summaries
- **PubMed/MEDLINE** for primary literature indexing
- **FDA Drug Labels** for approved indication and safety information
- **Institutional guideline repositories** for local practice standards

Each database connection uses authenticated APIs with rate limiting and caching to ensure reliable access. Retrieved evidence is temporally filtered to exclude outdated studies, with default windows of 5 years for therapeutic interventions and 10 years for diagnostic accuracy studies.

---

## 3. Evidence-Linked Summaries

### 3.1 Linking Insights to Supporting Evidence

Every clinical insight generated by DeepSynaps is accompanied by an evidence trail that specifies:

- **Primary evidence**: The highest-quality study or studies supporting the claim
- **Supporting evidence**: Additional studies providing corroboration
- **Contradicting evidence**: Studies with conflicting findings
- **Evidence gaps**: Areas where no relevant evidence exists

The evidence trail is presented as a structured JSON object that can be rendered in multiple formats: inline citations for quick reading, expandable evidence cards for detailed review, and complete bibliography for documentation.

### 3.2 Confidence Calibration

Confidence calibration ensures that the system's stated confidence matches the actual probability of correctness. Poorly calibrated models may be overconfident (stating high confidence for incorrect answers) or underconfident (expressing doubt about correct answers).

DeepSynaps employs temperature scaling on the output logits to calibrate confidence scores against a held-out validation set of clinical questions with known answers (Guo et al., 2017). Calibration is evaluated using the Expected Calibration Error (ECE) and Brier Score, with target ECE below 0.05 for high-stakes clinical recommendations.

The calibration pipeline includes:

1. **Platt scaling** to transform raw confidence scores into well-calibrated probabilities
2. **Isotonic regression** for non-parametric calibration when the data distribution is unknown
3. **Ensemble agreement** across multiple model outputs to estimate consensus confidence
4. **Human feedback integration** to continuously improve calibration over time

### 3.3 Uncertainty Quantification Framework

The system decomposes uncertainty along two classical dimensions (Kendall & Gal, 2017):

**Aleatoric uncertainty** (data uncertainty) arises from inherent randomness in biological processes and measurement noise. It cannot be reduced by collecting more data. In clinical practice, aleatoric uncertainty manifests as unpredictable patient responses to treatment or variability in disease progression.

**Epistemic uncertainty** (model uncertainty) reflects gaps in the system's knowledge -- cases where training data is insufficient or the input differs from previously seen examples. Unlike aleatoric uncertainty, epistemic uncertainty can be reduced by acquiring additional evidence.

For each prediction, DeepSynaps reports both components separately:

```
Uncertainty Report:
- Overall confidence: 0.72
- Aleatoric uncertainty: 0.15 (irreducible biological variability)
- Epistemic uncertainty: 0.13 (knowledge gap -- limited evidence for this patient population)
- Recommendation: Consult specialist due to elevated epistemic uncertainty
```

This decomposition enables clinicians to make informed decisions about when to trust the system and when to seek additional expertise.

---

## 4. Uncertainty-Aware Output

### 4.1 Communicating Uncertainty to Clinicians

Effective uncertainty communication requires translating statistical measures into clinically actionable language. DeepSynaps employs a tiered communication strategy based on the International Patient Decision Aid Standards (IPDAS):

**High Confidence (>90%)**: "Multiple high-quality studies consistently support this recommendation."
**Moderate Confidence (70-90%)**: "Available evidence supports this recommendation, but additional research may change the conclusion."
**Low Confidence (50-70%)**: "Evidence is limited or inconsistent. Consider alternative approaches and clinical judgment."
**Very Low Confidence (<50%)**: "Insufficient evidence to make a recommendation. Specialist consultation strongly advised."

Visual indicators accompany each tier: solid green for high confidence, striped yellow for moderate, striped orange for low, and dotted red for very low. These indicators are designed to be interpretable across cultures and accessible to color-blind users.

### 4.2 Confidence Intervals for Predictions

When numerical predictions are provided (e.g., risk scores, probability of diagnosis), DeepSynaps reports 95% confidence intervals derived from bootstrap resampling of the training data. The intervals account for both sampling variability and model uncertainty.

For example:

```
Predicted 30-day readmission risk: 23.4% (95% CI: 15.2% - 34.7%)
- Based on pooled analysis of 12 cohort studies (n=45,230)
- Heterogeneity: I^2 = 62% (moderate)
- Prediction interval: 12.1% - 41.3% (accounts for between-study variation)
```

The inclusion of prediction intervals (rather than just confidence intervals) helps clinicians understand the range of effects they might expect in their specific patient population, accounting for differences between study settings and local practice.

### 4.3 Ambiguity Visualization

Complex clinical scenarios often involve multiple valid interpretations. The ambiguity visualization component presents alternative hypotheses alongside the primary recommendation, with evidence supporting each:

```
Differential Diagnosis Evidence Map:
1. Community-acquired pneumonia [confidence: 0.68]
   - Supporting: Fever, cough, infiltrate on CXR [Ref: 12, 15, 19]
   - Against: Normal procalcitonin [Ref: 8]
   
2. Acute heart failure exacerbation [confidence: 0.22]
   - Supporting: Elevated BNP, bilateral crackles [Ref: 23, 27]
   - Against: No orthopnea, normal JVP [Ref: 25]
   
3. COVID-19 [confidence: 0.10]
   - Supporting: Similar presentation in local outbreak [Ref: 31]
   - Against: Negative PCR, no exposure history [Ref: 33]
```

This format makes the reasoning process transparent and encourages clinicians to consider alternatives they might otherwise overlook.

---

## 5. Evidence Grading Framework

### 5.1 GRADE (Grading of Recommendations Assessment, Development and Evaluation)

GRADE is a transparent framework for grading the quality of evidence and strength of recommendations in healthcare (Guyatt et al., 2008). Over 100 organizations globally, including the World Health Organization, the Cochrane Collaboration, and NICE, have adopted GRADE principles.

The GRADE framework evaluates evidence across five domains that can lead to rating down the certainty:

1. **Risk of bias**: Study limitations that reduce confidence in results
2. **Inconsistency**: Unexplained heterogeneity in study results
3. **Indirectness**: Differences between the available evidence and the clinical question
4. **Imprecision**: Wide confidence intervals or small sample sizes
5. **Publication bias**: Selective publication of positive results

Conversely, three domains can lead to rating up:

1. **Large magnitude of effect**
2. **Dose-response relationship**
3. **Residual confounders that would reduce the observed effect**

The final certainty rating is expressed on a four-point scale:

| Rating | Symbol | Interpretation |
|--------|--------|---------------|
| High | @@@@@ | Very confident that the true effect lies close to the estimate |
| Moderate | @@@@O | Moderately confident; true effect is likely close to the estimate |
| Low | @@@OO | Limited confidence; true effect may be substantially different |
| Very Low | @@OOO | Very little confidence; true effect is likely substantially different |

GRADE also distinguishes between the *quality of evidence* and the *strength of recommendation*. Strong recommendations are made when benefits clearly outweigh harms (or vice versa), while conditional recommendations indicate closer balance or greater uncertainty.

The Evidence to Decision (EtD) framework extends GRADE by structuring the deliberation process, ensuring that panels consider all relevant criteria: problem priority, desirable and undesirable effects, certainty of evidence, values and preferences, resource use, equity, acceptability, and feasibility (Alonso-Coello et al., 2016).

### 5.2 Oxford CEBM Levels of Evidence

The Oxford Centre for Evidence-Based Medicine (OCEBM) Levels of Evidence provide a hierarchy of study designs organized by the clinical question type: therapy, diagnosis, differential diagnosis, prognosis, and economic analysis (Howick et al., 2011).

For treatment benefits, the hierarchy is:

- **Level 1**: Systematic review of randomized trials or n-of-1 trials
- **Level 2**: Randomized trial or observational study with dramatic effect
- **Level 3**: Non-randomized controlled cohort/follow-up study
- **Level 4**: Case-series, case-control studies, or historically controlled studies
- **Level 5**: Mechanism-based reasoning or expert opinion

Unlike GRADE, OCEBM levels are based primarily on study design rather than a comprehensive quality assessment. The system is designed as a "shortcut for busy clinicians" to find the likely best evidence quickly, but explicitly refrains from making definitive recommendations.

### 5.3 Cochrane Risk of Bias 2 (RoB 2)

The Cochrane RoB 2 tool is the recommended instrument for assessing risk of bias in randomized controlled trials (Sterne et al., 2019). It evaluates five bias domains:

1. **Bias arising from the randomization process**
2. **Bias due to deviations from intended interventions**
3. **Bias due to missing outcome data**
4. **Bias in measurement of the outcome**
5. **Bias in selection of the reported result**

Each domain contains signaling questions that map to risk-of-bias judgments through predefined algorithms. The overall risk of bias for a study result is classified as "low risk," "some concerns," or "high risk." DeepSynaps integrates RoB 2 assessments into its evidence database, enabling automated filtering of evidence quality.

### 5.4 Newcastle-Ottawa Scale (NOS)

For observational studies (cohort and case-control), the Newcastle-Ottawa Scale provides quality assessment across three domains (Wells et al., 2000):

1. **Selection** (0-4 stars): Representativeness of exposed cohort, selection of non-exposed cohort, ascertainment of exposure, demonstration that outcome was not present at start
2. **Comparability** (0-2 stars): Control for confounding factors, comparability of groups
3. **Outcome** (0-3 stars): Assessment of outcome, sufficient follow-up duration, adequacy of follow-up

Total scores range from 0 to 9 stars, with thresholds for quality categories:
- Good quality: >= 3 stars in selection AND >= 1 star in comparability AND >= 2 stars in outcome
- Fair quality: 2 stars in selection AND >= 1 star in comparability AND >= 2 stars in outcome
- Poor quality: All other combinations

### 5.5 Recommendation for DeepSynaps

**DeepSynaps adopts GRADE as the primary evidence grading framework** for the following reasons:

1. **Widespread adoption**: GRADE is used by over 100 organizations worldwide, including WHO, Cochrane, and NICE. This alignment ensures that DeepSynaps outputs can be integrated into existing clinical workflows and guideline development processes.

2. **Comprehensive quality assessment**: Unlike OCEBM levels, which focus primarily on study design, GRADE evaluates multiple domains that affect evidence quality. This multifactorial assessment better captures the nuances of real-world evidence.

3. **Explicit decision framework**: The EtD framework provides a transparent structure for moving from evidence to recommendations, ensuring that all relevant criteria are considered.

4. **Separation of evidence quality and recommendation strength**: GRADE's distinction between these concepts allows for nuanced recommendations even when evidence quality is low -- for example, strong recommendations based on large observed effects despite limited trial data.

5. **Dynamic updating**: GRADE assessments can be revised as new evidence emerges, supporting the continuous learning architecture of DeepSynaps.

**Supplementary tools**: DeepSynaps uses RoB 2 for randomized trial assessment, NOS for observational studies, and ROBINS-I for non-randomized intervention studies. These specialized tools provide granular quality data that feeds into the overall GRADE assessment.

**Automated grading pipeline**: The system implements a semi-automated GRADE assessment workflow:

1. Automated extraction of study design, sample size, and effect estimates from literature
2. Machine learning classifiers (trained on labeled systematic reviews) to flag potential risk of bias
3. Human expert verification of automated assessments
4. Periodic recalibration of classifiers against expert judgments

---

## 6. Conflicting Evidence Handling

### 6.1 Conflict Detection

The conflict detection module identifies when retrieved evidence presents contradictory findings. A conflict is flagged when:

- Two or more studies of similar design report effect estimates in opposite directions with non-overlapping confidence intervals
- A meta-analysis shows significant heterogeneity (I^2 > 50%) without identifiable subgroup explanations
- Subsequent trials contradict the findings of earlier influential studies

The system classifies conflicts by type:

| Conflict Type | Description | Resolution Strategy |
|--------------|-------------|-------------------|
| Methodological | Differences in study design or quality | Weight higher-quality evidence per GRADE |
| Population | Different patient populations | Stratify by subgroup; flag applicability |
| Outcome | Different outcome measures | Compare effect sizes on common scales |
| Temporal | New evidence contradicts old | Prioritize recent evidence unless historically pivotal |
| Fundamental | Genuine scientific disagreement | Present all perspectives with uncertainty quantification |

### 6.2 Resolution Protocols

When conflicting evidence is detected, DeepSynaps follows a structured resolution protocol:

**Step 1: Automated analysis.** The system attempts to explain the conflict through subgroup analysis, meta-regression, or quality weighting. If heterogeneity is explained by identifiable factors (e.g., dose, population, follow-up duration), the conflict is downgraded to a moderated finding.

**Step 2: Human expert notification.** Unresolved conflicts are escalated to clinical domain experts through the review dashboard. Experts can adjudicate conflicts, propose additional analyses, or recommend presentation strategies.

**Step 3: Structured presentation.** Conflicts are presented to end-users with:
- Summary of the conflicting findings
- Assessment of evidence quality on each side
- Potential explanations for the disagreement
- Implications for clinical decision-making
- Recommendation for monitoring or additional research

### 6.3 Evidence Synthesis

When multiple studies address the same clinical question, DeepSynaps employs evidence synthesis methods:

- **Meta-analysis**: When studies are sufficiently homogeneous, random-effects meta-analysis pools estimates using restricted maximum likelihood (REML). The prediction interval is reported alongside the confidence interval to convey between-study heterogeneity.
- **Narrative synthesis**: When quantitative pooling is inappropriate, structured narrative synthesis describes patterns across studies, organized by study characteristics and outcomes.
- **Evidence maps**: Visual representations show the distribution of evidence across interventions, outcomes, and study designs, highlighting areas of consensus and controversy.

---

## 7. Safety Considerations

### 7.1 Avoiding Evidence Cherry-Picking

Cherry-picking -- selectively citing evidence that supports a preferred conclusion while ignoring contradictory findings -- is a critical safety risk for AI clinical systems. DeepSynaps mitigates this risk through:

**Mandated comprehensive retrieval.** The RAG system is configured to retrieve all relevant evidence meeting predefined quality thresholds, not just the top-k most similar chunks. Retrieved evidence is deduplicated and ranked by quality rather than semantic similarity alone.

**Adversarial checking.** A separate "devil's advocate" module is tasked with finding evidence contradicting the primary recommendation. If contradictory evidence exists above quality thresholds, it must be included in the output.

**Citation diversity metrics.** The system tracks metrics including the ratio of supporting to contradicting citations, the distribution across study designs, and the temporal span of cited evidence. Anomalies trigger automatic review.

**Transparency requirements.** All reasoning steps, including evidence retrieval queries and ranking decisions, are logged and auditable.

### 7.2 Balancing Sensitivity and Specificity

Clinical decision support must balance the detection of true positives (sensitivity) against false alarms (specificity). DeepSynaps addresses this through:

- **Configurable alerting thresholds** calibrated to clinical context (screening vs. diagnosis vs. treatment monitoring)
- **Receiver operating characteristic (ROC) curve analysis** for all predictive outputs
- **Expected value of perfect information (EVPI)** calculations to identify scenarios where additional testing is warranted
- **Harm-benefit analysis** following GRADE EtD frameworks

### 7.3 Research-Only Flagging

**DeepSynaps outputs are explicitly labeled as "RESEARCH ONLY -- NOT FOR CLINICAL USE"** until the system has completed prospective clinical validation. This labeling:

- Appears in the header and footer of every generated summary
- Requires acknowledgment before accessing detailed recommendations
- Is embedded in metadata to prevent downstream integration into clinical workflows
- Is reviewed quarterly by the ethics oversight board

The research-only status is not removed until:
1. Prospective validation demonstrates non-inferiority to standard care
2. Regulatory approval is obtained (FDA 510(k) or equivalent)
3. Institutional review board (IRB) approval is granted for clinical deployment
4. Liability and malpractice coverage is confirmed

---

## 8. Implementation Architecture

### 8.1 Evidence Database Schema

The evidence database uses a hybrid architecture combining a relational database for structured metadata with a vector database for semantic search.

**Relational Schema (PostgreSQL):**

```sql
-- Core studies table
CREATE TABLE studies (
    study_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pmid INTEGER UNIQUE,
    doi VARCHAR(255) UNIQUE,
    title TEXT NOT NULL,
    abstract TEXT,
    publication_date DATE,
    journal VARCHAR(500),
    study_design VARCHAR(50) CHECK (study_design IN 
        ('RCT', 'SYSTEMATIC_REVIEW', 'META_ANALYSIS', 'COHORT', 
         'CASE_CONTROL', 'CROSS_SECTIONAL', 'CASE_SERIES', 
         'EXPERT_OPINION', 'N_OF_1_TRIAL', 'CROSSOVER_TRIAL')),
    funding_source VARCHAR(100),
    conflicts_of_interest TEXT,
    sample_size INTEGER,
    follow_up_months INTEGER,
    country VARCHAR(100),
    language VARCHAR(50) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INTEGER DEFAULT 1
);

-- GRADE quality assessment
CREATE TABLE grade_assessments (
    assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID REFERENCES studies(study_id),
    outcome VARCHAR(255),
    overall_rating VARCHAR(20) CHECK (overall_rating IN 
        ('HIGH', 'MODERATE', 'LOW', 'VERY_LOW')),
    risk_of_bias VARCHAR(20) CHECK (risk_of_bias IN 
        ('NOT_SERIOUS', 'SERIOUS', 'VERY_SERIOUS')),
    inconsistency VARCHAR(20),
    indirectness VARCHAR(20),
    imprecision VARCHAR(20),
    publication_bias VARCHAR(20),
    large_effect BOOLEAN DEFAULT FALSE,
    dose_response BOOLEAN DEFAULT FALSE,
    residual_confounders BOOLEAN DEFAULT FALSE,
    assessed_by VARCHAR(255),
    assessment_date DATE,
    FOREIGN KEY (study_id) REFERENCES studies(study_id)
);

-- RoB 2 assessment for RCTs
CREATE TABLE rob2_assessments (
    assessment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID REFERENCES studies(study_id),
    result_specified TEXT,
    d1_randomization VARCHAR(20),
    d2_deviations VARCHAR(20),
    d3_missing_data VARCHAR(20),
    d4_measurement VARCHAR(20),
    d5_reported_result VARCHAR(20),
    overall_risk VARCHAR(20),
    assessed_by VARCHAR(255),
    assessment_date DATE,
    FOREIGN KEY (study_id) REFERENCES studies(study_id)
);

-- Evidence links to recommendations
CREATE TABLE evidence_links (
    link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID REFERENCES recommendations(recommendation_id),
    study_id UUID REFERENCES studies(study_id),
    link_type VARCHAR(20) CHECK (link_type IN 
        ('PRIMARY', 'SUPPORTING', 'CONTRADICTING', 'BACKGROUND')),
    relevance_score DECIMAL(3,2),
    extracted_quote TEXT,
    page_number INTEGER,
    confidence_interval VARCHAR(100),
    effect_estimate DECIMAL(10,4),
    FOREIGN KEY (study_id) REFERENCES studies(study_id)
);

-- Recommendations registry
CREATE TABLE recommendations (
    recommendation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinical_question TEXT NOT NULL,
    population TEXT,
    intervention TEXT,
    comparator TEXT,
    outcome TEXT,
    recommendation_text TEXT,
    strength VARCHAR(20) CHECK (strength IN 
        ('STRONG_FOR', 'CONDITIONAL_FOR', 'CONDITIONAL_AGAINST', 
         'STRONG_AGAINST', 'NO_RECOMMENDATION')),
    certainty_of_evidence VARCHAR(20),
    etd_framework JSONB,
    status VARCHAR(20) DEFAULT 'DRAFT',
    review_cycle_months INTEGER DEFAULT 12,
    last_reviewed DATE,
    next_review DATE,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conflict log
CREATE TABLE evidence_conflicts (
    conflict_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID REFERENCES recommendations(recommendation_id),
    conflict_type VARCHAR(50),
    description TEXT,
    studies_involved UUID[],
    resolution_status VARCHAR(20) DEFAULT 'OPEN',
    resolution_notes TEXT,
    escalated_to VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail for all evidence access
CREATE TABLE evidence_audit_log (
    log_id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    action VARCHAR(50),
    table_name VARCHAR(50),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Vector Database (FAISS + Metadata Store):**

The vector store maintains dense embeddings for semantic retrieval:

```
Index Structure:
- Primary index: All clinical literature (768-dim embeddings)
- Sub-indices by study design: RCTs, observational, reviews
- Sub-indices by specialty: Cardiology, oncology, infectious disease, etc.
- Sub-indices by recency: Last 2 years, 2-5 years, 5-10 years
```

### 8.2 Linkage Mechanisms

Evidence-to-recommendation linkage is established through:

1. **Automated extraction**: NLP pipelines extract population, intervention, comparator, and outcome (PICO) elements from studies and match them to clinical questions
2. **Citation graph analysis**: Backward and forward citation tracing identifies supporting and challenging evidence
3. **Manual curation**: Clinical experts verify and supplement automated links
4. **Continuous monitoring**: Alert systems notify when new evidence may affect existing recommendations

### 8.3 Update Procedures

Evidence updates follow a scheduled review cycle:

| Update Type | Trigger | Timeline | Reviewer |
|-------------|---------|----------|----------|
| Continuous | New high-impact publication | 48 hours | Automated screening + expert triage |
| Scheduled | Time-based review cycle | Every 6-12 months | Domain expert panel |
| Urgent | Safety signal or practice-changing trial | 24 hours | Rapid response team |
| On-demand | User request | 5 business days | Assigned evidence reviewer |

The update pipeline:

1. **Literature monitoring**: Automated PubMed/MEDLINE searches run daily using saved search strategies
2. **Relevance screening**: ML classifiers score new abstracts for relevance to active clinical questions
3. **Full-text retrieval**: Relevant articles are retrieved and processed through the ingestion pipeline
4. **Quality assessment**: Automated + human quality assessment generates GRADE and RoB 2 ratings
5. **Impact analysis**: Changes to existing recommendations are identified and quantified
6. **Expert review**: Affected recommendations are queued for expert review
7. **Approval and deployment**: Approved updates are deployed with version control

### 8.4 Version Control for Evidence

All evidence and recommendations are version-controlled using an append-only log structure:

- **Immutable history**: Previous versions of assessments are never modified; updates create new versions
- **Differential views**: Users can compare any two versions to see what changed
- **Temporal queries**: The system can answer "What was the evidence on this date?"
- **Provenance tracking**: Every data point can be traced to its source, extraction method, and reviewer
- **Rollback capability**: If errors are discovered, previous versions can be reinstated

The version control system integrates with Git for code-level changes and database triggers for data-level changes, providing a unified audit trail.

---

## 9. Risk Assessment

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Retrieval failure misses critical evidence | Medium | High | Multiple retrieval strategies; human verification for high-stakes decisions |
| Embedding model degradation over time | Medium | High | Continuous evaluation against labeled datasets; quarterly model updates |
| Evidence database becomes stale | High | High | Automated monitoring with daily literature scans; scheduled review cycles |
| LLM hallucination despite RAG | Medium | Critical | Constraint generation to retrieved context only; self-consistency checks; human review |
| System latency impacts clinical workflow | Medium | Medium | Caching; pre-computation for common queries; async processing |

### 9.2 Clinical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Over-reliance on system recommendations | High | Critical | Research-only labeling; explicit human decision-maker requirement; training programs |
| Misinterpretation of uncertainty indicators | Medium | High | User testing with clinicians; iterative design; standardized visual language |
| Cherry-picking by users seeking justification | Medium | High | Comprehensive evidence display; mandatory presentation of contradicting evidence |
| Delayed adoption of new evidence | Medium | Medium | Rapid update pipeline for practice-changing trials; alert system |
| Equity bias from underrepresented populations | Medium | High | Stratified evidence assessment; subgroup analysis; equity considerations in EtD |

### 9.3 Organizational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Liability from incorrect recommendations | Low | Critical | Research-only status; malpractice insurance; legal review; disclaimer protocols |
| Regulatory non-compliance | Medium | High | FDA pre-submission meetings; compliance monitoring; regulatory affairs team |
| Loss of clinician trust | Medium | High | Transparency in methods; error reporting; continuous improvement based on feedback |
| Evidence vendor lock-in | Low | Medium | Open data standards; multiple database connections; local caching |

---

## 10. References

Alonso-Coello, P., Oxman, A. D., Moberg, J., et al. (2016). GRADE Evidence to Decision (EtD) frameworks: adoption to clinical and public health recommendations and decisions. *Health Research Policy and Systems*, 14(1), 1-7.

Chen, Z., Cano, A. H., Romanou, A., et al. (2023). Meditron-70b: Scaling medical pretraining for large language models. *arXiv preprint arXiv:2311.16079*.

Gal, Y., & Ghahramani, Z. (2016). Dropout as a Bayesian approximation: Representing model uncertainty in deep learning. *International Conference on Machine Learning*, 1050-1059.

Gao, Y., Xiong, Y., Wang, M., & Wang, H. (2024). Modular RAG: Transforming RAG systems into LEGO-like reconfigurable frameworks. *arXiv preprint arXiv:2407.21059*.

Guyatt, G. H., Oxman, A. D., Vist, G. E., et al. (2008). GRADE: An emerging consensus on rating quality of evidence and strength of recommendations. *BMJ*, 336(7650), 924-926.

Guo, C., Pleiss, G., Sun, Y., & Weinberger, K. Q. (2017). On calibration of modern neural networks. *International Conference on Machine Learning*, 1321-1330.

Han, S., Kwon, S., & Kim, S. (2025). Integrating explainability and uncertainty estimation in medical AI. *arXiv preprint arXiv:2509.18132*.

Howick, J., Chalmers, I., Glasziou, P., et al. (2011). The 2011 Oxford CEBM Levels of Evidence. *Oxford Centre for Evidence-Based Medicine*.

Jeong, M., Sohn, J., Sung, M., & Kang, J. (2024). Improving medical reasoning through retrieval and self-reflection with retrieval-augmented large language models. *Bioinformatics*, 40(Suppl 1), i119-i129.

Jin, D., Pan, E., Oufattole, N., Weng, W. H., Fang, H., & Szolovits, P. (2021). What disease does this patient have? A large-scale open domain question answering dataset from medical exams. *Applied Sciences*, 11(14), 6421.

Kendall, A., & Gal, Y. (2017). What uncertainties do we need in Bayesian deep learning for computer vision? *Advances in Neural Information Processing Systems*, 30.

Liu, Y., Li, S., Zhang, J., et al. (2024). Uncertainty quantification for clinical tasks with (large) language models. *arXiv preprint arXiv:2411.03497*.

Lu, Y., Zhao, X., & Wang, J. (2024). ClinicalRAG: Enhancing clinical decision support through heterogeneous knowledge retrieval. *Proceedings of the 1st Workshop on Towards Knowledgeable Language Models (KnowLLM 2024)*, 64-68.

Savage, T., Nayak, A., Gallo, R., Rangan, E., & Chen, J. H. (2024). Quantifying uncertainty in medical AI through confidence scores. *JAMA Network Open*.

Sen, R., Vulik, I., & Yu, T. (2024). Diagnostic error reduction using uncertainty-aware AI. *Nature Medicine*.

Slobodkin, A., Ronen, M., Kalkstein, N., et al. (2023). Uncertainty estimation for computational molecular biology with deep learning. *Journal of the American Medical Informatics Association*.

Sterne, J. A., Savovic, J., Page, M. J., et al. (2019). RoB 2: A revised tool for assessing risk of bias in randomised trials. *BMJ*, 366, l4898.

Ullah, E., Parwani, A., Baig, M. M., & Singh, R. (2024). Challenges and barriers of using large language models (LLM) such as ChatGPT for diagnostic medicine with a focus on digital pathology. *Diagnostic Pathology*, 19(1), 43.

Wells, G. A., Shea, B., O'Connell, D., et al. (2000). The Newcastle-Ottawa Scale (NOS) for assessing the quality of nonrandomised studies in meta-analyses. *Ottawa Hospital Research Institute*.

Wu, J., Zhu, J., Qi, Y., et al. (2025). Medical graph RAG: Evidence-based medical large language model via graph retrieval-augmented generation. *Proceedings of the 63rd Annual Meeting of the Association for Computational Linguistics*, 28443-28467.

---

*This document is part of the DeepSynaps Protocol Studio design specification. All recommendations are provisional and subject to clinical validation. For internal research and development use only.*
