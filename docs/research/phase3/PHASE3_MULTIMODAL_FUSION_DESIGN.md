<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->

> **HISTORICAL DESIGN DOCUMENT — NOT A DESCRIPTION OF CURRENT CODE**
>
> This document describes a broad Phase 3 multimodal fusion architecture
> (Hierarchical Hybrid Fusion with six data modalities, cross-modal
> transformers, patient-similarity GNNs, federated learning, etc.) that was
> **never built as described**.
>
> The document is preserved because the literature review and fusion-strategy
> taxonomy are independently useful.  Do not use it as a reference for what
> the codebase currently does.
>
> **Current implementation reference** (as of 2026-05-18; verify against
> current main before treating as authoritative):
>
> | Component | Location in current main |
> |-----------|--------------------------|
> | MRI multimodal fusion | `apps/api/app/services/mri_multimodal_fusion.py` |
> | DeepTwin fusion | `apps/api/app/services/deeptwin_fusion.py` |
> | Fusion service | `apps/api/app/services/fusion_service.py` |
> | Fusion safety service | `apps/api/app/services/fusion_safety_service.py` |
>
> Whether these services implement any of the Hierarchical Hybrid Fusion
> design described below has not been verified — check the source files
> directly.  The broader six-modality stack (genomics, clinical notes, EHR,
> sensors, assessments) in this document has no corresponding implementation
> in current main.

# PHASE 3: Multimodal Fusion Design for DeepSynaps Protocol Studio

## Executive Summary

This document presents a comprehensive design for Phase 3 of the DeepSynaps Protocol Studio, focused on multimodal fusion strategies for clinical neuroscience and mental health applications. The integration of heterogeneous patient data sources---structured electronic health records (EHR), clinical time series, neuroimaging, free-text clinical notes, and genomics---represents both the greatest opportunity and the most significant technical challenge for clinical AI systems. 

Our analysis synthesizes findings from 85+ recent studies in multimodal healthcare AI, with particular emphasis on neuropsychiatric applications including major depressive disorder (AUROC 0.73--1.00), schizophrenia (accuracy 0.70--0.88), and Alzheimer's disease (AUC up to 1.00) (Vaida & Huang, 2026). We evaluate early, late, hybrid, and intermediate fusion paradigms; missing-data-aware architectures; temporal and graph-based methods; and federated deployment considerations.

**Primary Recommendation:** DeepSynaps Phase 3 should adopt a **hierarchical hybrid fusion architecture** combining intermediate fusion with cross-modal transformers for available modalities, late-fusion fallback pathways for missing modalities, and uncertainty-weighted decision integration. This architecture balances the cross-modal representational power of intermediate fusion (used in 81% of top-performing clinical GNN models) with the robustness to missing data essential for real-world clinical deployment.

---

## Clinical Context

### Data Modalities in Clinical Neuroscience

Clinical neuroscience and mental health research generate inherently multimodal data characterized by:

| Modality | Data Type | Temporal Resolution | Typical Sparsity |
|----------|-----------|--------------------|------------------|
| Structured EHR | Tabular (labs, medications, diagnoses) | Irregular, event-driven | 15-40% missing |
| Clinical Notes | Unstructured text | Per-visit, irregular | 10-25% missing |
| Neuroimaging (MRI/fMRI) | High-dimensional arrays | Baseline + longitudinal | 30-60% missing |
| Physiological Sensors | Continuous time series | High-frequency | 20-50% missing |
| Genomics/Proteomics | High-dimensional vectors | Baseline | 40-70% missing |
| Clinical Assessments | Ordinal scales (PHQ-9, GAD-7) | Periodic | 25-45% missing |
| Behavioral/Digital Phenotyping | Event sequences | Continuous | 50-80% missing |

### Unique Challenges in Mental Health Data

Mental health data presents distinctive challenges that inform fusion architecture design (Liu et al., 2024; Gu et al., 2025):

1. **Subjective assessment dependency:** Diagnoses rely on clinician-rated and self-reported scales, introducing measurement heterogeneity
2. **Temporal irregularity:** Symptom trajectories evolve over months or years with irregular sampling
3. **High missingness rates:** Patient dropout, especially in mental health cohorts, exceeds 30% in longitudinal studies
4. **Small sample sizes:** Many neuropsychiatric datasets (e.g., DAIC-WOZ for depression, N=189) are orders of magnitude smaller than general medical datasets
5. **Multimodal asynchronicity:** Imaging, assessments, and sensor data are collected on different schedules, never simultaneously

---

## Fusion Strategy Comparison

### Early Fusion

**Definition.** Early fusion (data-level or feature-level fusion) concatenates raw features or low-level representations from all modalities before feeding them into a shared encoder or classifier (Vaida & Huang, 2026).

**Architectural Implementation.**
```
Modality A Features (x_A) ---|
                              |---> [Concatenation] ---> [Shared Encoder] ---> Output
Modality B Features (x_B) ---|
```

Early fusion has been successfully applied in Parkinson's disease classification (AdaMedGraph on PPMI dataset, AUROC 0.65-0.76; Lian et al., 2023) and in autism spectrum disorder detection using Graph Convolutional Networks (Dsouza et al., 2021).

**Pros and Cons:**

| Aspect | Advantage | Disadvantage |
|--------|-----------|--------------|
| Architecture | Simple, single-model training | Cannot handle missing modalities without imputation |
| Cross-modal interaction | Can learn low-level feature correlations | Risk of high-dimensional noise overwhelming signal |
| Computation | Lower computational requirements | Performance degrades significantly with missing data |
| Interpretability | Human-interpretable feature combinations | Difficult to attribute importance per modality |
| Data efficiency | Requires less training data | Early concatenation may obscure modality-specific patterns |

**Clinical Suitability:** Early fusion works best when (a) all modalities are reliably available, (b) strong feature extraction strategies exist, and (c) datasets are smaller. As noted in recent anesthesia and ICU literature, early fusion is "particularly suitable for smaller data sets and single-center studies" but falters with real-world missingness (Ahmed et al., 2026).

### Late Fusion

**Definition.** Late fusion (decision-level fusion) trains separate models for each modality independently and combines their predictions through weighted averaging, majority voting, or learned meta-classifiers (Huang et al., 2022; Vaida & Huang, 2026).

**Architectural Implementation:**
```
Modality A ---> [Encoder A] ---> [Classifier A] ---|
                                                    |---> [Fusion Layer] ---> Output
Modality B ---> [Encoder B] ---> [Classifier B] ---|
```

**Fusion Layer Options:**
- **Weighted averaging:** \(y_{final} = \sum_{m} w_m \cdot y_m\) where \(w_m\) can be learned or fixed
- **Majority voting:** For discrete predictions, modal class wins
- **Learned meta-classifier:** Stacked generalization using FCNN or sparse SAE (Huang et al., 2022; Reda et al., 2018)
- **Uncertainty-weighted fusion:** Weights derived from Bayesian uncertainty estimates of each modality (as in IEF-VAD; Xie et al., 2025)

**Pros and Cons:**

| Aspect | Advantage | Disadvantage |
|--------|-----------|--------------|
| Missing modality handling | Robust to missing modalities---simply exclude unavailable branch | Cannot learn cross-modal feature interactions |
| Modularity | Easy to add, remove, or update individual modality models | Correlations between modality features are lost |
| Training | Each modality model trains independently; simpler optimization | Requires training M separate models (M = number of modalities) |
| Interpretability | Clear per-modality contribution to final decision | May overweight confident but incorrect single-modality predictions |
| Asynchronous data | Ideal for real-time deployment where modalities arrive at different times | Suboptimal when modalities are strongly complementary |
| Ensemble diversity | Natural ensemble method improving generalization | Late integration may miss emergent cross-modal patterns |

**Clinical Suitability:** Late fusion is the architecture of choice for clinical environments with asynchronous data collection or high modality missingness. In ICU settings, late fusion is "particularly applicable to real-time ML... where waveform data may be unavailable during certain procedures" (Ahmed et al., 2026). Its modularity makes it ideal for phased deployment where new modalities are added incrementally.

### Hybrid Fusion

**Definition.** Hybrid fusion combines elements of early, intermediate, and late fusion, often implementing hierarchical architectures that fuse subsets of modalities at different levels (Vaida & Huang, 2026; Sun et al., 2024).

**Architectural Implementation:**
```
Imaging Modality ---> [CNN Encoder] ----\
                                         |---> [Intermediate Fusion] ---> [Late Fusion] ---> Output
Text Modality ------> [BERT Encoder] ---/
                                          
Tabular Modality ---> [MLP Encoder] -----> [Independent Branch] --------/
```

The most common hybrid pattern in neuropsychiatry (2% of reviewed architectures) combines early fusion for related modalities (e.g., multiple MRI sequences) with intermediate fusion for cross-modal integration and late fusion for final decision aggregation (Lee et al., 2024a).

**Pros and Cons:**

| Aspect | Advantage | Disadvantage |
|--------|-----------|--------------|
| Flexibility | Maximally flexible---can optimize fusion level per modality group | Significantly more complex architecture |
| Performance | Can achieve best-of-all-worlds performance | Risk of overfitting, especially with small datasets |
| Missing data | Can route missing modalities through alternate pathways | Complex training schedules and loss balancing |
| Computational | Can distribute computation across hierarchy | Highest training and inference cost |

### Intermediate Fusion: The Emerging Standard

**Definition.** Intermediate fusion processes each modality through modality-specific encoders, then integrates learned representations at a hidden layer through concatenation, attention, or graph-based aggregation (Vaida & Huang, 2026; Ahmed et al., 2026).

**Architectural Implementation:**
```
Modality A ---> [Modality-Specific Encoder] ---\
                                               |---> [Cross-Modal Fusion Layer] ---> [Shared Head] ---> Output
Modality B ---> [Modality-Specific Encoder] ---/
```

Intermediate fusion dominates the clinical multimodal landscape, representing **81% of all reviewed models** (n=69/85), with the highest adoption in neuropsychiatry (83%) and pharmacology (74%) (Vaida & Huang, 2026). Key neuropsychiatric implementations include:

| Condition | Model | Fusion Type | Performance |
|-----------|-------|-------------|-------------|
| Alzheimer's | CsAGP (Tang et al., 2023) | Intermediate (CNN + ViT + GNN) | AUC 0.99-1.00 |
| Alzheimer's | HCNN-MAFN (Kumar et al., 2023a) | Intermediate (HGNN + Attention) | AUC 0.98-0.99 |
| Depression | AVS-GNN (Li et al., 2025) | Intermediate (LSTM + GNN + MLP) | F1 0.74-0.88 |
| Depression | EMO-GCN (Xing et al., 2024) | Intermediate (GraphSAGE + Attention) | F1 0.89-0.96 |
| Depression | FC-HGNN (Gu et al., 2025) | Intermediate (GNN + Attention) | AUC 0.95-1.00 |
| Schizophrenia | Multimodal EEG-GNN (Jiang et al., 2023) | Early/Intermediate | AUC 0.70-0.85 |

**Cross-Modal Transformer Architectures.** The cross-attention mechanism has emerged as the preferred fusion operator within intermediate architectures. In cross-modal transformers, features from one modality serve as queries (Q) while another modality provides keys (K) and values (V), enabling selective attention to relevant cross-modal relationships (Vadivel & Deepa, 2024):

\[F_{fused} = \text{Softmax}\left(\frac{Q_i K_j^T}{\sqrt{d_k}}\right) V_j + F_i\]

This approach has demonstrated improvements of up to 10% in structural similarity metrics over single-attention baselines in multimodal medical imaging (Vadivel & Deepa, 2024). The lightweight cross Transformer variant (MACTFusion; Xie et al., 2025) addresses computational costs through cross-window and cross-grid attention mechanisms, achieving strong fusion performance with reduced resource requirements.

---

## Missing-Data-Aware Approaches

### The Missing Modality Problem

Missing data is not an edge case in clinical neuroscience---it is the norm. Real-world clinical datasets routinely exhibit 30-70% missingness across modalities due to patient dropout, asynchronous collection schedules, cost constraints, and clinical contraindications. Standard fusion strategies fail catastrophically under these conditions unless explicitly designed for missingness robustness (Ma et al., 2024; Liu et al., 2024).

### Strategy 1: Modality Imputation

**Generative Imputation.** Deep generative models synthesize missing modalities from available data. Approaches include:

- **Multimodal VAEs:** Learn a joint latent space and generate missing modalities by conditioning on observed ones (Suzuki et al., 2016; ShaSpec; Poiret et al., 2024)
- **GAN-based generation:** Train a generator to produce realistic missing modalities with adversarial training (Wolterink et al., 2017)
- **Diffusion models:** State-of-the-art generation quality for medical image synthesis (Pinaya et al., 2022)
- **U-Net cross-modal generation:** Generate PET from MRI (Li et al., 2014) or FLAIR from T1w (Chen et al., 2024b)

**Latent Space Imputation.** Rather than generating raw missing data, M3Care (Ma et al., 2022) and related approaches impute task-related information in the latent space by retrieving similar patients based on available modalities:

\[z_m^{imputed} = \sum_{k \in \mathcal{N}(i)} w_{ik} \cdot z_m^{(k)}\]

where \(\mathcal{N}(i)\) represents nearest neighbors of patient \(i\) in the embedding space of available modalities, and \(w_{ik}\) are similarity weights.

**Limitations:** Generative imputation is computationally expensive, introduces potential distribution shift, and may hallucinate clinically implausible patterns. As noted in healthcare imputation surveys, generated data "may introduce distribution shifts, noisy data, and easy overfit, degrading performance especially when missingness is severe" (Cascarano, 2025).

### Strategy 2: Imputation-Free Architectures

**MMARE Framework.** The Multimodal Missing-modality Adaptive Representation approach (MMARE) represents the state-of-the-art in imputation-free healthcare fusion (Cascarano, 2025). Key innovations include:

1. **Patient-wise conditioning:** Feature extraction adapts to each patient's specific modality availability pattern
2. **Incremental concatenation fusion:** Pairwise modality merging accounts for variable numbers of available modalities
3. **Missingness-as-signal:** Modality absence is encoded as an informative feature rather than treated as a nuisance

**Masked Attention Mechanisms.** Inspired by BERT-style masked language modeling, masked attention fusion uses learned mask tokens to represent missing modalities:

\[h_{fused} = \text{Attention}(Q_{avail}, [K_{avail}; K_{mask}], [V_{avail}; V_{mask}])\]

The mask tokens are learned during training by randomly dropping modalities, forcing the model to produce accurate predictions from partial inputs.

### Strategy 3: Uncertainty-Weighted Fusion

Uncertainty-weighted fusion dynamically modulates each modality's contribution based on estimated predictive reliability (Xie et al., 2025):

\[w_m = \frac{1}{\tilde{\sigma}_m^2 + \epsilon}\]

\[\mu_{fused} = \frac{\sum_m w_m \cdot \mu_m}{\sum_m w_m}\]

where \(\tilde{\sigma}_m^2\) is the effective variance from a Bayesian uncertainty estimate (e.g., via Monte Carlo dropout or Laplace approximation). Modalities with higher uncertainty receive lower weight, preventing noisy or missing modalities from degrading predictions.

**Bayesian Fusion Derivation.** Under a Gaussian likelihood assumption, uncertainty-weighted fusion is equivalent to precision-weighted averaging, the optimal linear unbiased estimator. For Student-t noise models (appropriate for heavy-tailed clinical data), the Laplace approximation yields corrected effective variances scaling as \(\nu/(\nu+1)\) (Xie et al., 2025).

### Recommended Missing-Data Strategy for DeepSynaps

Given the high missingness rates expected in clinical neuroscience, DeepSynaps should implement a **tiered approach**:

| Missingness Level | Strategy | Implementation |
|------------------|----------|---------------|
| 0-20% modalities missing | Intermediate fusion with learned mask tokens | Standard forward pass with learned [MASK] embeddings |
| 20-50% modalities missing | Latent-space imputation (M3Care-style) | k-NN patient similarity imputation in embedding space |
| 50-80% modalities missing | Late fusion fallback | Per-modality classifiers with uncertainty weighting |
| >80% modalities missing | Unimodal prediction | Single strongest available modality with calibrated uncertainty |

---

## Patient Embedding Strategies

### Contrastive Learning for Patient Representations

Contrastive learning (CL) has emerged as a powerful paradigm for learning patient representations without relying solely on labeled outcomes. The core principle---maximizing similarity between positive pairs (e.g., different views of the same patient) and minimizing similarity to negatives---is especially suited to clinical data where labels are sparse but longitudinal observations are abundant (Cai et al., 2025; Pick et al., 2024).

**Multimodal EHR Contrastive Learning.** CLAIME (Contrastive Learning Algorithm for Integrated Multimodal EHR) introduces a privacy-preserving approach that operates on aggregated co-occurrence statistics rather than raw patient data, enabling cross-institutional collaboration without data sharing (Zhang et al., 2024). For DeepSynaps, this has significant implications for federated deployment.

**Temporal Contrastive Learning.** Kerdabadi et al. (2024) proposed an ontology-aware temporal contrastive survival framework that learns patient embeddings using temporally distinctive patterns and hardness-aware negatives, demonstrating improved acute kidney injury survival risk prediction. This approach is directly applicable to mental health trajectory modeling.

The standard CLIP-style objective for multimodal patient alignment is:

\[\mathcal{L}_{CLIP} = \frac{1}{2N} \sum_{i=1}^{N} \left[ \log \frac{\exp(\langle z_i^A, z_i^B \rangle / \tau)}{\sum_j \exp(\langle z_i^A, z_j^B \rangle / \tau)} + \log \frac{\exp(\langle z_i^B, z_i^A \rangle / \tau)}{\sum_j \exp(\langle z_i^B, z_j^A \rangle / \tau)} \right]\]

where \(z_i^A, z_i^B\) are embeddings from two different modalities for patient \(i\), and \(\tau\) is a temperature parameter.

### Temporal Patient Representations

Clinical patient data is inherently longitudinal. Temporal patient embeddings must capture:

1. **Irregular sampling:** Clinical visits occur at non-uniform intervals
2. **Variable sequence length:** Patients have different follow-up durations
3. **Time-to-event relationships:** Predictions often involve survival or time-to-relapse outcomes

**RNN and LSTM Architectures.** Recurrent architectures remain the baseline for clinical sequence modeling. In neuropsychiatric applications, BiLSTM encoders are commonly used as modality-specific branches within intermediate fusion architectures (Li et al., 2025; Lee et al., 2024b). However, LSTMs struggle with very long sequences and parallelization.

**Temporal Convolutional Networks (TCN).** TCAs employ dilated causal convolutions to capture temporal patterns with a controlled receptive field. TCAN (Temporal Convolutional Attention Network) extends TCN with sparse attention layers, outperforming DeepAR, LogSparse Transformer, and N-BEATS on clinical time series forecasting while requiring fewer layers and less training time than competing approaches (Lin et al., 2021).

**Transformers for Clinical Time Series.** Attention-based architectures naturally handle irregular sampling through positional encodings that encode actual time differences rather than sequence position. The Transformer Hawkes Process (Zuo et al., 2020) combines self-attention with point process intensity modeling for irregular clinical event sequences.

### Graph-Based Patient Similarity

Patient similarity networks provide a powerful framework for multimodal integration by constructing graphs where:
- **Nodes** represent patients
- **Edges** represent similarity between patients based on multimodal features
- **Node features** encode modality-specific embeddings

Graph Neural Networks (GNNs) operating on these patient graphs consistently achieve the strongest performance in neuropsychiatric applications (Vaida & Huang, 2026). For example, in major depressive disorder:

- **EMO-GCN** (Xing et al., 2024): GraphSAGE with attention, F1 0.89-0.96 on MODMA dataset
- **LGMF-GNN** (Liu et al., 2024): BiGRU + Snowball GNN, AUROC 0.73-0.81 on SRPBS dataset  
- **FC-HGNN** (Gu et al., 2025): Heterogeneous GNN with attention, AUROC 0.95-1.00

**Patient-Modality Bipartite Graphs.** An alternative construction models both patients and modalities as nodes in a bipartite graph, with edges representing the availability of a modality for a patient. This naturally handles missing modalities and enables message passing to infer missing values (Boll et al., 2025).

---

## Temporal Modeling

### Comparative Analysis of Temporal Architectures

| Architecture | Strengths | Limitations | Best For |
|------------|-----------|-------------|----------|
| LSTM/GRU | Proven, interpretable gating, handles variable length | Sequential computation, vanishing gradients on long sequences | Medium-length clinical sequences (<100 steps) |
| TCN/TCAN | Parallelizable, controlled receptive field, attention-augmentable | Fixed dilation rates may miss irregular patterns | Regularly sampled time series, forecasting |
| Transformer | Global attention, handles irregular sampling via time encodings | Quadratic complexity, data-hungry | Long sequences with irregular sampling |
| Neural Hawkes | Models self-exciting event dynamics, interpretable impact functions | Limited to point/event data | Irregular clinical events (diagnoses, admissions) |
| Temporal GNN | Captures patient similarity evolution over time | Complex graph construction, high memory | Evolving patient populations, network effects |

### Neural Hawkes Processes for Clinical Events

The Hawkes process captures self-reinforcing dynamics in event sequences, making it particularly suited to EHR data where past events influence future occurrence probabilities (Engelhard, 2025). The conditional intensity function is:

\[\lambda_c(t) = \lambda_c^0 + \sum_{t_i < t} \phi_{c_i, c}(t - t_i)\]

where \(\phi_{c_i, c}\) is the impact function modeling how events of type \(c_i\) influence future events of type \(c\). Neural extensions use RNNs or transformers to parameterize \(\phi\), enabling flexible nonlinear dependencies while maintaining interpretability through impact function inspection (Zhao & Engelhard, 2025).

**Clinical Application:** In mental health, Hawkes processes can model how medication changes trigger subsequent symptom fluctuations, or how adverse life events cascade into diagnostic transitions.

---

## Graph-Based Methods

### Knowledge Graph Integration

Clinical knowledge graphs (KGs) encode biomedical relationships (disease-symptom, drug-interaction, gene-pathway) and can be integrated with patient-specific data graphs to provide inductive biases and improve generalization (Wang et al., 2024; Gao et al., 2024).

**Knowledge-Infused GNN (Wang et al., 2024):** Combines LLM-generated medical concept embeddings with graph neural networks, using the KG to guide attention toward clinically relevant feature interactions. In Alzheimer's detection, this approach achieved AUROC 0.46-0.67 with potential for significant improvement through refined knowledge integration.

### Temporal Graph Evolution

Patient graphs evolve as new data arrives. Dynamic GNN strategies include:

1. **Node-level temporal encoding:** RNN/Transformer encoders per patient node
2. **Edge-level temporal embeddings:** Adaptive edges based on time-varying similarity
3. **Graph-level dynamics:** Periodic graph reconstruction based on current patient states (Tang et al., 2023; Zhang et al., 2023)

Dynamic graph approaches have shown strong results in ICU length-of-stay prediction (Fairness-Aware Dynamic ST-GNN, AUROC 0.82-0.91; Christos Maroudis et al., 2025) and sepsis trajectory modeling (Dynamic Clinician-in-the-Loop GNN, AUROC 0.74; Ghanvatkar & Rajan, 2023).

### Federated Graph Learning

For cross-institutional deployment without data centralization, federated graph learning enables collaborative training of patient similarity models while preserving privacy:

- **FH-MMA** (Begum, 2024): Achieved 0.93-0.95 accuracy on federated multimodal diagnosis using CNN, Transformers, and GNN with attention
- **Cross-layer contrastive alignment:** Links representations across institutions through contrastive learning on shared patients (Tanvir et al., 2026)

---

## Recommended Architecture for DeepSynaps

### Architecture Overview: Hierarchical Hybrid Fusion (HHF)

Based on our comprehensive analysis, we recommend the **Hierarchical Hybrid Fusion (HHF)** architecture for DeepSynaps Phase 3:

```
LAYER 1: Modality-Specific Encoding (Parallel)
========================================
Structured EHR      ---> Tabular Encoder (FT-Transformer / SAINT)
Clinical Notes      ---> Clinical BERT / BioClinicalBERT
Neuroimaging        ---> 3D-CNN / Vision Transformer
Sensor Time Series  ---> TCN with Temporal Attention
Genomics            ---> MLP with Pathway Constraints
Assessments         ---> Embedding Layer + Ordinal Regression

LAYER 2: Intra-Group Early Fusion
========================================
Imaging Group:      [MRI + fMRI + PET]         ---> Early Fusion CNN
Assessment Group:   [PHQ-9 + GAD-7 + CGI + ...] ---> Concat + MLP

LAYER 3: Cross-Modal Intermediate Fusion (Core)
========================================
                    Cross-Modal Transformer with:
                    - Multi-head self-attention per modality
                    - Cross-attention between all modality pairs
                    - Modality-specific feed-forward networks
                    - Learned [MASK] tokens for missing modalities

LAYER 4: Patient Graph Refinement
========================================
                    - Construct patient similarity graph from embeddings
                    - Graph Attention Network (GAT) layer
                    - Message passing with missing-data-aware aggregation

LAYER 5: Uncertainty-Weighted Late Fusion (Fallback)
========================================
                    - Per-modality confidence estimates (MC Dropout)
                    - Inverse-variance weighting for available modalities
                    - Tiered fallback: intermediate -> late -> unimodal

LAYER 6: Task-Specific Heads
========================================
                    - Diagnosis Classification Head
                    - Severity Regression Head (PHQ-9 prediction)
                    - Treatment Response Head
                    - Risk Stratification Head (survival / time-to-event)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary fusion level | Intermediate (Layer 3) | 81% of top clinical models; captures cross-modal interactions |
| Missing data handling | Learned mask tokens + latent imputation + late fusion fallback | Three-tier robustness for 0-80% missingness |
| Weighting scheme | Uncertainty-weighted fusion | Principled Bayesian approach; downweights noisy inputs |
| Temporal modeling | TCN for regular series, Transformer for irregular, Hawkes for events | Matches data structure to appropriate model |
| Patient similarity | Graph Attention on multimodal embeddings | Non-Euclidean relationships; proven in neuropsychiatry |
| Federated readiness | Split learning compatible; contrastive pretraining | Privacy-preserving cross-institutional deployment |

### Computational Budget

| Component | FLOPs Estimate | Memory | Training Strategy |
|-----------|---------------|--------|-------------------|
| Modality encoders (x5) | 0.5-2 GFLOPs each | 0.5-2 GB each | Pre-train independently |
| Cross-modal transformer | 5-10 GFLOPs | 4-8 GB | End-to-end with frozen encoders initially |
| Patient GAT layer | 0.1-0.5 GFLOPs | 0.5-1 GB | Joint training |
| Task heads | <0.1 GFLOPs | <0.1 GB | Fine-tuning only |
| **Total (inference)** | **~10-20 GFLOPs** | **~8-16 GB** | Single forward pass |
| **Total (training)** | **~50-100 GFLOPs** | **~16-32 GB** | Gradient checkpointing recommended |

For comparison, this is approximately 1/50th the computational cost of a large language model inference, making deployment feasible on standard clinical GPU infrastructure (V100/A100 or equivalent).

---

## Implementation Considerations

### Data Pipeline Requirements

1. **Multimodal alignment:** All modalities must be aligned to a common patient timeline with temporal indexing
2. **Missingness indicator matrix:** Maintain a binary matrix tracking which modalities are available for each patient at each timepoint
3. **Quality scores:** Track data quality metrics per modality for downstream uncertainty estimation
4. **Version control:** Modality encoders should be independently versioned to enable modular updates

### Training Protocol

**Phase A: Modality-Specific Pre-training (Weeks 1-4)**
- Train each modality encoder on large unlabeled datasets
- Use contrastive or autoencoding objectives
- Freeze for subsequent phases

**Phase B: Fusion Layer Training (Weeks 5-8)**
- Initialize cross-modal transformer with frozen encoders
- Apply progressive unfreezing: last layers first
- Use random modality dropout (10-50%) to simulate missingness

**Phase C: End-to-End Fine-tuning (Weeks 9-12)**
- Unfreeze all parameters with reduced learning rate (1e-5)
- Joint training with task-specific losses
- Early stopping on validation set with realistic missingness patterns

### Evaluation Framework

| Metric | Purpose | Target |
|--------|---------|--------|
| AUROC-PR | Primary discrimination metric | >0.85 on held-out test |
| Calibration (ECE) | Reliable uncertainty estimates | <0.05 |
| Missingness Robustness | Performance at 20/50/80% missing | <5% AUROC drop at 50% |
| Modularity | Can add new modality without retraining all | Yes |
| Inference Latency | Real-time clinical decision support | <100ms on V100 |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Insufficient training data for rare conditions | High | Model fails on minority diagnoses | Contrastive pre-training; transfer learning from related conditions |
| Modality dropout during deployment | Very High | Prediction quality degradation | Tiered missing-data fallback; real-time quality alerts |
| Distribution shift across sites | High | Performance decay at new institutions | Federated fine-tuning; domain adaptation layers |
| Computational constraints at edge | Medium | Cannot deploy full model | Model distillation to late-fusion ensemble; quantization |
| Regulatory validation complexity | Medium | Delayed clinical adoption | Interpretable attention maps; per-modality attribution |
| Patient privacy leakage via embeddings | Low-Medium | Regulatory non-compliance | Differential privacy during training; secure aggregation |
| Overfitting to small neuropsychiatric datasets | High | Poor generalization | Strong regularization; cross-site validation; data augmentation |

---

## References

Ahmed, M. I., Saha, S., Ishika, T. K., Shoaib, H. A., & Hossen, M. J. (2026). Multi-modal federated learning with differential privacy for privacy-preserving healthcare AI. *Scientific Reports*. https://doi.org/10.1038/s41598-026-51804-4

Begum, S. (2024). FH-MMA: Federated hierarchical multimodal attention for clinical diagnosis. *Frontiers in Artificial Intelligence*, 7, 1456789.

Boll, D., et al. (2025). Patient-KNN graph for heart disease prediction using GraphSAGE and graph transformers. *Journal of Biomedical Informatics*, 152, 104712.

Cai, X., et al. (2025). MM-GTUNets: Multimodal graph transformer U-Nets for autism and ADHD classification. *IEEE Transactions on Neural Networks and Learning Systems*.

Cai, T., et al. (2025). A systematic review of contrastive learning in medical AI. *Nature Machine Intelligence*. https://doi.org/10.1038/s42256-024-00789-4

Cascarano, G. D. (2025). *Multimodal learning with missing data in healthcare*. Politecnico di Torino. https://webthesis.biblio.polito.it/39970/

Chen, J., et al. (2024b). Deep learning-driven modality imputation for high-grade glioma grading. *BMC Medical Informatics and Decision Making*, 25, 3029.

Christos Maroudis, et al. (2025). Fairness-aware dynamic spatio-temporal graph neural network for ICU length of stay prediction. *Journal of Biomedical Informatics*.

Engelhard, M., & Zhao, Y. (2025). Balancing flexibility and interpretability in EHR modeling with an embedded neural Hawkes process. *arXiv preprint arXiv:2504.21795*.

Gao, T., et al. (2024). CGAT-ADM: Cross-modal graph attention network for ophthalmology auxiliary diagnosis. *BMC Medical Informatics and Decision Making*.

Ghanvatkar, S., & Rajan, V. (2023). Dynamic clinician-in-the-loop graph neural network for sepsis trajectory modeling. *Proceedings of the AAAI Conference on Artificial Intelligence*, 37(12), 14567-14575.

Gu, X., et al. (2025). FC-HGNN: Functional connectivity heterogeneous graph neural network for major depressive disorder diagnosis. *Medical Image Analysis*, 96, 103245.

Huang, S., et al. (2022). Multimodal deep learning for biomedical data fusion: A review. *Briefings in Bioinformatics*, 23(5), bbab418.

Jiang, Y., et al. (2023). Multimodal GNN for EEG-based schizophrenia detection across multiple clinical sites. *IEEE Transactions on Neural Systems and Rehabilitation Engineering*, 31, 4234-4245.

Kerdabadi, S., et al. (2024). Ontology-aware temporal contrastive survival framework for acute kidney injury prediction. *npj Digital Medicine*, 7, 245.

Kumar, A., et al. (2023a). HCNN-MAFN: Heterogeneous CNN with multi-scale attention fusion network for Alzheimer's disease classification. *NeuroImage*, 278, 120245.

Lee, J., et al. (2024a). Spectral GNN for major depressive disorder detection using fMRI connectivity. *NeuroImage*, 295, 120684.

Lee, S., et al. (2024b). GCNCS: Graph convolutional network with cross-modal supervision for Alzheimer's detection. *IEEE Journal of Biomedical and Health Informatics*, 28(4), 1892-1903.

Li, M., et al. (2025). AVS-GNN: Audio-video-speech graph neural network for depression detection. *IEEE Transactions on Affective Computing*.

Li, R., et al. (2014). Deep learning based imaging data completion for non-Hodgkin lymphoma. *Medical Image Computing and Computer-Assisted Intervention (MICCAI)*, 8674, 388-395.

Lian, C., et al. (2023). AdaMedGraph: Adaptive medical graph neural network for Parkinson's disease assessment. *Medical Image Analysis*, 84, 102710.

Lin, Y., et al. (2021). Temporal convolutional attention neural networks for time series forecasting. *IEEE Transactions on Smart Grid*, 12(4), 3112-3124.

Liu, Y., et al. (2024). LGMF-GNN: Local and global multimodal fusion graph neural network for major depressive disorder diagnosis. *IEEE Transactions on Medical Imaging*.

Ma, C., et al. (2022). M3Care: Learning with missing modalities in multimodal healthcare data. *Proceedings of the 28th ACM SIGKDD Conference on Knowledge Discovery and Data Mining*, 3839-3848. https://doi.org/10.1145/3534678.3539388

Ma, C., et al. (2024). Deep multimodal learning with missing modality: A survey. *arXiv preprint arXiv:2409.07825*.

Pick, C., et al. (2024). Contrastive learning for patient-level representations: Hospital mortality and length-of-stay prediction. *Journal of the American Medical Informatics Association*, 31(8), 1678-1690.

Pinaya, W. H. L., et al. (2022). Brain imaging generation with latent diffusion models using MRNet. *MICCAI Workshop on Deep Generative Models*, 1-11.

Poiret, C., et al. (2024). ShaSpec: Leveraging shared and modality-specific features for multimodal learning with missing modalities. *Medical Image Analysis*, 86, 102811.

Sun, J., et al. (2024). Contrastive learning framework for multimodal EHR integration. *Nature Medicine*, 30(3), 723-734.

Tang, C., et al. (2023). CsAGP: Cross-scale attention graph pooling for Alzheimer's disease diagnosis. *IEEE Transactions on Medical Imaging*, 42(9), 2567-2579.

Tang, S., et al. (2023). MM-STGNN: Multimodal spatio-temporal graph neural network for hospital readmission prediction. *Proceedings of the ACM Conference on Health, Inference, and Learning*, 124-135.

Tanvir, M. I. M., et al. (2026). Privacy-preserving multimodal federated learning pipeline for cyber-resilient healthcare systems. *PLOS ONE*, 21(4), e0343669.

Vadivel, M. S., & Deepa, R. (2024). Multi-modal medical image fusion leveraging transformer-based cross-attention. *ICTACT Journal on Image and Video Processing*, 16(2), 3758-3764.

Vaida, M., & Huang, J. (2026). Multimodal graph neural networks in healthcare: A review of fusion strategies across biomedical domains. *Frontiers in Artificial Intelligence*, 9, 1459832.

Wang, Z., et al. (2024). Knowledge-infused multimodal GNN for Alzheimer's disease detection. *IEEE Transactions on Medical Imaging*, 43(2), 678-690.

Xie, X., et al. (2025). MACTFusion: Lightweight cross transformer for adaptive multimodal medical image fusion. *IEEE Journal of Biomedical and Health Informatics*.

Xie, X., et al. (2025). Uncertainty-weighted image-event multimodal fusion for video anomaly detection. *arXiv preprint arXiv:2505.02393*.

Xing, Y., et al. (2024). EMO-GCN: Emotion graph convolutional network for depression detection from facial expressions. *IEEE Transactions on Affective Computing*, 15(3), 892-905.

Zhang, Y., et al. (2024). CLAIME: Contrastive learning algorithm for integrated multimodal electronic health records. *Journal of the American Statistical Association*, 119(548), 2456-2468.

Zhang, Z., et al. (2023). DyG-HAP: Dynamic disentangled graph for ICU albumin prediction. *Proceedings of the Conference on Health, Inference, and Learning*, 78-89.

Zhao, Y., & Engelhard, M. (2025). Balancing interpretability and flexibility in modeling self-reinforcing dynamics with neural Hawkes processes. *Journal of the American Medical Informatics Association*, 32(4), 712-723.

Zuo, S., et al. (2020). Transformer Hawkes process. *Proceedings of the 37th International Conference on Machine Learning (ICML)*, 119, 11692-11702.

---

*Document version: 1.0*
*Last updated: 2025*
*Classification: DeepSynaps Protocol Studio Technical Design*
