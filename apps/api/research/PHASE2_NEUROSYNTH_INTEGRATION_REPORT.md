# PHASE 2: NEUROSYNTH FUNCTIONAL MAPPING INTEGRATION REPORT

## DeepSynaps Protocol Studio — Knowledge Layer Integration

---

**Report ID**: DS-PHASE2-NEUROSYNTH-2024
**Version**: 1.0.0
**Classification**: Technical Integration Specification
**Owner**: DeepSynaps Knowledge Layer Team
**Status**: Draft for Review

---

```
   ____                      _     _                      ____            _           _   
  |  _ \  ___  ___ ___  _ __| |_  | |    ___   ___  _ __ |  _ \ _ __ ___ (_) ___  ___| |_ 
  | | | |/ _ \/ __/ _ \| '__| __| | |   / _ \ / _ \| '__|| |_) | '__/ _ \| |/ _ \/ __| __|
  | |_| |  __/ (_| (_) | |  | |_  | |__| (_) | (_) | |   |  __/| | | (_) | |  __/ (__| |_ 
  |____/ \___|\___\___/|_|   \__| |_____\___/ \___/|_|   |_|   |_|  \___// |\___|\___|\__|
                                                                        |__/               
                        Protocol Studio — PHASE 2 KNOWLEDGE LAYER
```

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Neurosynth Deep Dive](#2-neurosynth-deep-dive)
3. [NeuroQuery: The Successor](#3-neuroquery-the-successor)
4. [Methodological Caveats](#4-methodological-caveats)
5. [The Reverse Inference Problem](#5-the-reverse-inference-problem)
6. [Safe Clinical Use Patterns](#6-safe-clinical-use-patterns)
7. [DeepSynaps Integration Architecture](#7-deepsynaps-integration-architecture)
8. [Display Rules & Caveats](#8-display-rules--caveats)
9. [Provenance & Confidence Model](#9-provenance--confidence-model)
10. [DeepTwin Functional Context Integration](#10-deeptwin-functional-context-integration)
11. [Licensing](#11-licensing)
12. [Implementation Recommendations](#12-implementation-recommendations)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Appendix A: SQL Schema Reference](#appendix-a-sql-schema-reference)
15. [Appendix B: API Endpoint Reference](#appendix-b-api-endpoint-reference)
16. [Appendix C: Code Examples](#appendix-c-code-examples)
17. [Appendix D: Term Coverage Analysis](#appendix-d-term-coverage-analysis)
18. [Appendix E: Clinical Decision Tree](#appendix-e-clinical-decision-tree)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Overview

Neurosynth is a large-scale, open-access coordinate-based meta-analysis (CBMA) database that maps relationships between brain activation coordinates and cognitive/behavioral terms extracted from published fMRI literature. Created by Dr. Tal Yarkoni and colleagues, it represents one of the most comprehensive collections of functional neuroimaging data available to the research community, containing over 500,000 activation coordinates from more than 14,000 peer-reviewed publications, mapped to over 3,000 unique cognitive terms.

### 1.2 Purpose in DeepSynaps

The DeepSynaps Protocol Studio integrates Neurosynth (and its successor, NeuroQuery) to provide **functional context enrichment** for clinical neuromodulation workflows. Specifically:

- **Target Contextualization**: When a clinician selects a brain region for stimulation (e.g., left DLPFC for depression), Neurosynth provides meta-analytic associations that describe the functional landscape of that region based on aggregated neuroimaging literature.
- **Educational Support**: The system displays what cognitive/behavioral terms are most strongly associated with a given brain region, helping clinicians understand the functional repertoire of stimulation targets.
- **Hypothesis Generation**: By showing which brain regions are most commonly associated with a given cognitive domain, the system supports hypothesis generation for new neuromodulation targets.

### 1.3 Critical Non-Purpose

Neurosynth is **explicitly NOT** used for:
- Patient-specific functional diagnosis
- Individual-level clinical inference
- Determining the cognitive state of a patient based on brain imaging
- Direct clinical decision-making without clinician judgment

### 1.4 Key Principles

| Principle | Description |
|-----------|-------------|
| **Meta-Analytic** | All data reflects aggregated group studies, never individual patients |
| **Associative** | Data shows correlations, not causation |
| **Contextual** | Data provides background context, not clinical findings |
| **Research-Only** | All data is labeled as research context, not clinical assessment |
| **Caveat-First** | Every display of Neurosynth data is accompanied by explicit caveats |
| **Non-Diagnostic** | Neurosynth data never contributes to diagnostic reasoning |

### 1.5 Integration Strategy

The DeepSynaps system will:
1. Download and host the Neurosynth SQLite database locally (~1 GB)
2. Implement a read-only query adapter with pre-built association lookup
3. Integrate NeuroQuery as an optional overlay for enhanced semantic matching
4. Enforce display rules that prefix all Neurosynth-derived content with mandatory caveats
5. Block any downstream clinical inference pipelines from consuming Neurosynth data
6. Log all Neurosynth lookups for audit and compliance purposes

### 1.6 Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Reverse inference misuse | **Critical** | Mandatory caveat banners, non-diagnostic enforcement |
| Publication bias | Medium | Display uncertainty metrics, include negative finding indicators |
| Coordinate bias | Medium | Document MNI space requirements, note peak coordinate limitations |
| Base rate neglect | Medium | Normalize by study frequency, show relative vs. absolute metrics |
| Overconfidence | **High** | Confidence tier system, explicit uncertainty quantification |

---

## 2. NEUROSYNTH DEEP DIVE

### 2.1 Origin and History

**Neurosynth** was conceived and developed by **Dr. Tal Yarkoni**, a cognitive neuroscientist and professor at the University of Texas at Austin. The project emerged from a recognition that the neuroimaging literature was growing at a pace that made traditional narrative review approaches increasingly insufficient for understanding the functional organization of the brain.

#### 2.1.1 Timeline

| Year | Milestone |
|------|-----------|
| 2011 | Initial Neurosynth paper published (Yarkoni et al., Nature Methods) |
| 2011 | First public release of the database and web interface |
| 2012-2015 | Continuous database expansion, API development |
| 2015 | Major update: improved NLP pipeline, expanded term vocabulary |
| 2017 | NeuroQuery project begins as successor/parallel effort |
| 2018 | Neurosynth reaches ~14,000 studies, ~500,000 coordinates |
| 2019 | NeuroQuery published (Dockes et al., Nature Methods) |
| 2020+ | Both platforms maintained as complementary resources |

#### 2.1.2 Key Publications

1. **Yarkoni, T., Poldrack, R.A., Nichols, T.E., Van Essen, D.C., & Wager, T.D. (2011).** "Large-scale automated synthesis of human functional neuroimaging data." *Nature Methods*, 8(8), 665-670.
   - The foundational paper describing the Neurosynth methodology
   - Introduced the automated text-mining approach
   - Demonstrated both forward and reverse inference capabilities
   - Highlighted the reverse inference problem explicitly

2. **Yarkoni, T. (2009).** "Big Correlations in Little Studies: Inflated fMRI Correlations Reflect Low Statistical Power — Commentary on Vul et al. (2009)." *Perspectives on Psychological Science*, 4(3), 294-298.
   - Discussed issues of power and correlation in neuroimaging

3. **Poldrack, R.A., Baker, C.I., Durnez, J., Gorgolewski, K.J., Matthews, P.M., Munafò, M.R., ... & Yarkoni, T. (2017).** "Scanning the horizon: towards transparent and reproducible neuroimaging research." *Nature Reviews Neuroscience*, 18(2), 115-126.
   - Broad discussion of reproducibility issues in neuroimaging

### 2.2 Data Architecture

#### 2.2.1 Data Sources

Neurosynth is built on an automated pipeline that:

1. **Harvests** abstracts and full-text articles from PubMed Central and other repositories
2. **Extracts** stereotactic (x, y, z) coordinates reported in MNI or Talairach space
3. **Converts** Talairach coordinates to MNI space using the Lancaster transform (icbm2tal)
4. **Extracts** cognitive/behavioral terms from article abstracts using natural language processing
5. **Links** coordinates to terms at the article level
6. **Maps** coordinates to a standard brain template (2mm MNI space)

#### 2.2.2 Database Statistics

| Metric | Value | Notes |
|--------|-------|-------|
| Total studies | ~14,371 | As of last database update |
| Total activation coordinates | ~525,000+ | MNI space, peak coordinates |
| Unique cognitive terms | ~3,300 | After frequency thresholding |
| Studies per term (median) | ~12 | Highly variable across terms |
| Spatial resolution | 2mm isotropic | MNI template |
| Template | MNI152 | Standard neuroimaging template |
| Database size | ~1 GB | SQLite compressed |
| Coordinate format | (x, y, z) | MNI space in millimeters |

#### 2.2.3 Core Database Tables

The Neurosynth SQLite database contains the following key tables:

```
images          -- Statistical maps (z-scores, p-values) for each term
features        -- Term frequency matrix (studies x terms)
vocab           -- Vocabulary of cognitive/behavioral terms
studies         -- Metadata for each included study
peaks           -- Individual activation coordinates
maps            -- Metadata about available statistical maps
```

### 2.3 Inference Types

Neurosynth supports two distinct types of inference, which are mathematically and conceptually different. Understanding this distinction is **absolutely critical** for safe clinical integration.

#### 2.3.1 Forward Inference

**Definition**: P(term | activation) — "Given activation at coordinate X, how likely is cognitive term Y?"

**Formula**:
```
P(term | activation) = Number of studies activating X that mention term / Total number of studies activating X
```

**Interpretation**: If we observe activation at a particular brain location, what cognitive processes are most commonly associated with that location across the literature?

**Example**: "Of all studies reporting activation in the amygdala, 72% investigate 'emotion' as a topic."

**Clinical Utility**: **MODERATE** — Provides descriptive context about what a brain region has been studied for. Useful for generating hypotheses about functional roles.

**Limitation**: Dominated by the base rate of term usage. If "emotion" is a common term overall, it will appear frequently even in forward inference.

#### 2.3.2 Reverse Inference

**Definition**: P(activation | term) — "Given studies about term Y, where do they activate?"

**Formula**:
```
P(activation | term) = Number of studies about term that activate X / Total number of studies about term
```

**Interpretation**: If we are interested in a cognitive process (e.g., "memory"), what brain regions are most commonly activated in studies investigating that process?

**Example**: "Of all studies about 'memory', 68% report hippocampal activation."

**Clinical Utility**: **CONTEXT ONLY** — Useful for target discovery in neuromodulation. If a clinician wants to modulate "memory" processes, which regions are most commonly implicated? But this is hypothesis-generating, not diagnostic.

**CRITICAL LIMITATIONS**:
- Cannot infer the reverse: P(activation | term) ≠ P(term | activation)
- This is the **fallacy of the transposed conditional** (Bayesian fallacy)
- Hippocampal activation does NOT mean "memory processing is occurring"

#### 2.3.3 Association Maps

Association maps in Neurosynth are z-score maps that quantify the strength of association between a term and brain regions. These are computed using a two-stage procedure:

1. **Uniformity test**: Tests whether activation in a given voxel is uniformly distributed across studies, or whether it clusters for studies mentioning a specific term.
2. **Association test**: Tests whether activation in a voxel is significantly associated with a term, controlling for the overall activation rate of that voxel.

**Types of Maps**:

| Map Type | Description | Primary Use |
|----------|-------------|-------------|
| Association (z) | Main association statistic | Term-to-region mapping |
| Uniformity (z) | Tests if activation is uniform | Identifying focal vs. diffuse associations |
| Reverse inference (p) | P(activation\|term) | Target discovery |
| Forward inference (p) | P(term\|activation) | Contextual enrichment |

### 2.4 Term Taxonomy

#### 2.3.1 Term Categories

The ~3,300 terms in Neurosynth span multiple categories:

| Category | Examples | Count Estimate |
|----------|----------|---------------|
| Cognitive functions | memory, attention, language, executive | ~200 |
| Cognitive domains | working memory, episodic memory, inhibition | ~300 |
| Anatomical | hippocampus, prefrontal, amygdala | ~500 |
| Clinical conditions | depression, anxiety, schizophrenia | ~200 |
| Task paradigms | n-back, stroop, gambling, flanker | ~150 |
| Modality | visual, auditory, verbal, spatial | ~100 |
| Behavioral | response, accuracy, error, reaction time | ~100 |
| Demographic | age, gender, children, elderly | ~50 |
| Methodological | fmri, pet, connectivity, roi | ~200 |
| General | brain, human, study, participants | ~1,500 |

#### 2.3.2 Term Frequency Distribution

Terms follow a highly skewed frequency distribution:
- Top 1% of terms (~33 terms) appear in >5,000 studies each
- Top 10% (~330 terms) appear in >500 studies each
- Bottom 50% (~1,650 terms) appear in <50 studies each

This means that rare terms have very low statistical power and high uncertainty.

### 2.4 Spatial Mapping

#### 2.4.1 MNI Coordinate System

Neurosynth uses the Montreal Neurological Institute (MNI) standard space:
- Origin (0, 0, 0) = anterior commissure
- x-axis: left (-) to right (+)
- y-axis: posterior (-) to anterior (+)
- z-axis: inferior (-) to superior (+)
- All coordinates in millimeters

#### 2.4.2 Common Regions and Their Coordinates

| Region | Common MNI Coordinates | Approximate BA |
|--------|----------------------|----------------|
| Left DLPFC | (-44, 36, 20) | BA 9/46 |
| Right DLPFC | (44, 36, 20) | BA 9/46 |
| Left VLPFC | (-46, 28, 0) | BA 44/45 |
| Left IFG | (-50, 24, 4) | BA 44/45 |
| Left M1 | (-38, -24, 56) | BA 4 |
| Pre-SMA | (0, 14, 56) | BA 6 |
| Left FEF | (-34, -4, 50) | BA 8 |
| Left IPL | (-44, -44, 44) | BA 40 |
| Medial PFC | (0, 52, 4) | BA 10 |
| ACC (dorsal) | (0, 16, 36) | BA 24/32 |
| ACC (rostral) | (0, 40, 4) | BA 24/32 |
| Amygdala (left) | (-22, -4, -18) | Subcortical |
| Hippocampus (left) | (-24, -18, -14) | Subcortical |
| Insula (left) | (-38, 6, 2) | Subcortical |
| Cerebellum | (0, -60, -30) | Subcortical |
| Thalamus (left) | (-10, -18, 6) | Subcortical |
| Caudate (left) | (-10, 12, 8) | Subcortical |
| Putamen (left) | (-24, 4, 4) | Subcortical |

#### 2.4.3 Voxel-to-Term Lookup

Neurosynth provides voxel-level association maps. A coordinate-to-term lookup involves:

1. Converting the MNI coordinate to voxel indices
2. Looking up the z-score for each term at that voxel
3. Ranking terms by their association strength
4. Applying a significance threshold (typically z > 3.09, p < 0.001)

### 2.5 API Reference

#### 2.5.1 REST API Endpoints

```
Base URL: https://neurosynth.org/api/
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/locations/` | GET | Get coordinates and their associations |
| `/locations/<x>_<y>_<z>/` | GET | Get terms associated with a specific coordinate |
| `/locations/<x>_<y>_<z>/studies/` | GET | Get studies reporting activation at coordinate |
| `/studies/` | GET | List all studies in the database |
| `/studies/<pmid>/` | GET | Get details for a specific study |
| `/features/` | GET | List all available cognitive terms |
| `/features/<term>/` | GET | Get association map metadata for a term |
| `/genes/` | GET | Gene expression data (Neurosynth+Allen integration) |
| `/analyses/` | GET | List available meta-analyses |
```

#### 2.5.2 API Response Format

```json
{
  "coordinate": [-44, 36, 20],
  "associations": [
    {
      "term": "executive",
      "z_score": 8.42,
      "p_value": 1.2e-16,
      "study_count": 342
    },
    {
      "term": "working memory",
      "z_score": 7.88,
      "p_value": 3.1e-15,
      "study_count": 287
    }
  ],
  "num_studies": 8452,
  "warning": "These are meta-analytic associations, not patient-specific findings."
}
```

#### 2.5.3 Rate Limits and Usage

- The Neurosynth API is provided free of charge for academic and research use
- No authentication required for basic queries
- Rate limiting: ~100 requests/minute for automated queries
- Bulk data access: Download the full SQLite database for local queries

---

## 3. NEUROQUERY: THE SUCCESSOR

### 3.1 Overview

**NeuroQuery** is the successor/parallel effort to Neurosynth, developed primarily by Jerome Dockes, Bertrand Thirion, and colleagues at INRIA Paris-Saclay. It addresses several methodological limitations of Neurosynth while maintaining the same core philosophy of large-scale meta-analytic synthesis.

#### 3.1.1 Key Improvements Over Neurosynth

| Feature | Neurosynth | NeuroQuery |
|---------|-----------|------------|
| Corpus size | ~14,000 studies | ~13,900 studies (different selection) |
| Semantic model | Bag-of-words | TF-IDF + word embeddings |
| Compound terms | Limited | Full support via semantic similarity |
| Term encoding | Binary presence | Full-text encoding with weights |
| Encoding model | Naive Bayes-like | Ridge regression with spatial smoothing |
| Map resolution | 2mm | 2mm (with better spatial smoothness) |
| Query interface | Term lookup | Full-text semantic search |
| Python package | Via `nilearn` | `neuroquery` (pip installable) |

#### 3.1.2 Core Innovation: Semantic Querying

The defining feature of NeuroQuery is its ability to process **arbitrary text queries** and return a predicted brain activation map. Unlike Neurosynth, which requires exact term matching, NeuroQuery can:

- Accept a full abstract or paragraph as input
- Encode the semantic content using TF-IDF features trained on the neuroimaging corpus
- Predict a spatial activation map based on the semantic encoding
- Handle novel terms not in the original vocabulary
- Provide similarity scores between queries and the training corpus

### 3.2 Technical Architecture

#### 3.2.1 Encoding Model

NeuroQuery uses a **Ridge regression** model with spatial smoothing:

```
For each voxel v:
    y_v = X * β_v + ε_v

Where:
    y_v = activation vector across studies at voxel v
    X = document-term matrix (TF-IDF encoded abstracts)
    β_v = learned regression weights for voxel v
    ε_v = error term
```

The model is regularized with:
- L2 regularization (Ridge) to prevent overfitting
- Spatial smoothing priors that enforce spatial correlation between nearby voxels
- TF-IDF weighting that upweights discriminative terms

#### 3.2.2 Semantic Similarity

NeuroQuery computes semantic similarity between queries and the training corpus:

```python
cosine_similarity(query_vector, corpus_vectors)
```

This allows:
- Ranking of most similar studies to a query
- Detection of out-of-vocabulary queries
- Confidence estimation based on corpus similarity

### 3.3 Python Package

#### 3.3.1 Installation

```bash
pip install neuroquery
```

#### 3.3.2 Basic Usage

```python
from neuroquery import NeuroQueryImageSearch

# Initialize with pre-trained model
nq = NeuroQueryImageSearch.from_pretrained()

# Query with a natural language query
result = nq("working memory and executive function")

# Access the predicted map
brain_map = result["brain_map"]  # NIfTI image

# Access similar studies
similar_studies = result["similar_studies"]

# Access query-to-corpus similarity
confidence = result["similarity_score"]
```

#### 3.3.3 Image Search

NeuroQuery also supports image-based search (finding terms associated with a brain map):

```python
from neuroquery import ImageCharting

ic = ImageCharting.from_pretrained()

# Get terms associated with a brain map
terms = ic.decode(brain_map_nifti, n_terms=10)
```

### 3.4 API

```
Base URL: https://neuroquery.org/api/
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/query` | POST | Submit a text query, get predicted brain map |
| `/encode` | POST | Encode text to semantic vector |
| `/decode` | POST | Decode brain map to term predictions |
| `/terms` | GET | List vocabulary terms |
| `/studies` | GET | List studies in corpus |
| `/docs` | GET | API documentation |

### 3.5 DeepSynaps Integration Strategy

NeuroQuery will be integrated as an **optional overlay** to Neurosynth:

1. **Primary**: Neurosynth for exact term lookups (faster, deterministic)
2. **Secondary**: NeuroQuery for semantic queries (more flexible, but slower)
3. **Hybrid**: Use NeuroQuery for novel term expansion, then validate with Neurosynth

---

## 4. METHODOLOGICAL CAVEATS

This section details the specific methodological limitations that must be understood and communicated for safe clinical integration.

### 4.1 Publication Bias

**Description**: Positive findings are published more frequently than null results. Studies reporting significant activation in a region of interest are more likely to be published than those finding no activation.

**Impact on Neurosynth**:
- Regions appear more consistently activated than they truly are
- The "file drawer problem" means negative results are underrepresented
- Term-to-region associations may be inflated
- Rare negative findings are systematically excluded

**Mitigation in DeepSynaps**:
- Display the number of studies contributing to each association
- Show confidence intervals where available
- Flag terms with low study counts (< 20 studies)
- Include a "publication bias indicator" in the provenance model
- Never present association strength without sample size context

### 4.2 Coordinate Bias (Peak Reporting)

**Description**: Neuroimaging papers typically report only **peak coordinates** (local maxima) of activation clusters, not the full extent of activation. This means:
- The true spatial extent of activation is underestimated
- Small regions near large activated areas may appear activated due to spatial smoothing
- Subcortical structures are often underreported relative to cortical regions
- White matter and cerebellar activations are frequently excluded

**Impact on Neurosynth**:
- Association maps may underestimate true spatial extent
- Peak coordinates create "hot spots" that don't reflect actual activation spread
- The 2mm voxel resolution doesn't capture functional gradients
- Reported coordinates may not even correspond to true maxima (biased by thresholding)

**Mitigation in DeepSynaps**:
- Display coordinate lookup results with a spatial uncertainty radius (e.g., "± 8mm")
- Use sphere-based queries rather than exact voxel matching
- Document the peak-coordinate limitation in all outputs
- Consider using `nilearn`'s coordinate-to-sphere conversion for spatial queries

### 4.3 Term Ambiguity

**Description**: The same term can refer to different concepts across studies. For example:
- **"memory"**: Could mean episodic memory, working memory, semantic memory, procedural memory, or memory encoding vs. retrieval
- **"attention"**: Could mean selective attention, sustained attention, divided attention, spatial attention, or top-down vs. bottom-up attention
- **"emotion"**: Could mean fear, happiness, sadness, disgust, or emotional regulation vs. emotional experience
- **"language"**: Could mean production, comprehension, reading, or semantic processing

**Impact on Neurosynth**:
- A single term aggregates over heterogeneous cognitive processes
- The resulting association map is a mixture of multiple subprocesses
- Fine-grained functional distinctions are lost
- Term-to-region associations may be driven by dominant subtypes

**Mitigation in DeepSynaps**:
- Use more specific terms when available (e.g., "working memory" instead of "memory")
- Display term ambiguity warnings
- Group related terms and show their individual associations
- Use NeuroQuery for more nuanced semantic queries
- Allow clinicians to explore sub-term associations

### 4.4 Base Rate Neglect

**Description**: Common terms (e.g., "memory", "attention", "brain") appear in many studies simply because they are frequently used in the neuroimaging literature, not because they are specifically associated with particular regions.

**Impact on Neurosynth**:
- Forward inference is dominated by base rates
- Common terms inflate association maps
- Rare but specific terms may be overlooked
- The statistical model does not fully account for term frequency

**Mitigation in DeepSynaps**:
- Normalize association scores by term base rate
- Use association test maps (which partially control for base rate) over forward inference
- Display both raw and normalized association scores
- Highlight terms that are disproportionately associated (above base rate)

### 4.5 Coordinate Space Inconsistency

**Description**: While Neurosynth attempts to convert all coordinates to MNI space, some studies originally report in Talairach space. The conversion is not perfect:
- The Lancaster transform is an approximation
- Individual anatomical variability is not captured
- Nonlinear registration errors propagate
- Pediatric and elderly brains may not fit the MNI template well

**Mitigation in DeepSynaps**:
- Document that all coordinates are in MNI space
- Apply a spatial tolerance (± 8-10mm) for coordinate matching
- Use probabilistic atlases where available
- Note age-related anatomical variability

### 4.6 Temporal Resolution Blindness

**Description**: fMRI has poor temporal resolution (~2-3 seconds per volume), and the BOLD response is an indirect measure of neural activity (hemodynamic, not electrical). Neurosynth aggregates across studies using different acquisition parameters:
- Different TR (repetition times)
- Different event-related designs
- Different baseline conditions
- Different block vs. event-related paradigms

**Impact on Neurosynth**:
- Temporal dynamics are completely lost
- Activation timing information is not available
- It is impossible to determine activation order or sequence
- Causal relationships cannot be inferred

**Mitigation in DeepSynaps**:
- Clearly state that temporal information is not available
- Do not use Neurosynth data for any temporal reasoning
- Emphasize that activation order cannot be determined

### 4.7 Individual vs. Group Averaging

**Description**: Neurosynth aggregates **group-level statistical maps** from individual studies. These group averages:
- Smooth over individual anatomical variability
- Assume homogeneity of functional organization across individuals
- May miss functionally relevant individual differences
- Are optimized for group-level, not individual-level, detection

**Critical Implication for DeepSynaps**:
> **Neurosynth data represents group averages from healthy, typically young adult participants. It does NOT represent the functional organization of any individual patient, and certainly not a patient with a neurological or psychiatric condition.**

**Mitigation in DeepSynaps**:
- Mandatory display: "Group average from healthy adults — not patient-specific"
- Never compare patient imaging directly to Neurosynth maps
- Never infer patient cognitive state from Neurosynth associations
- Use only for contextual background information

---

## 5. THE REVERSE INFERENCE PROBLEM

This section provides an extended treatment of what is arguably the most critical methodological issue for clinical integration: the reverse inference fallacy.

### 5.1 Formal Definition

**Reverse inference** is the practice of inferring the presence of a specific cognitive process from the observation of activation in a particular brain region.

**The Fallacy**:
```
If P(activation | term) is high,
does NOT imply P(term | activation) is high.
```

This is the **fallacy of affirming the consequent** in Bayesian terms:

```
P(term | activation) = P(activation | term) * P(term) / P(activation)
```

Even if P(activation | term) = 0.9 (90% of memory studies activate the hippocampus),
P(term | activation) depends on:
- P(term): The base rate of memory studies in the literature
- P(activation): The base rate of hippocampal activation across all studies

### 5.2 Concrete Example

**Scenario**: A clinician sees activation at MNI coordinate (-24, -18, -14) in a patient's fMRI scan.

**Reverse Inference (FALLACIOUS)**:
> "This coordinate is in the left hippocampus. Neurosynth shows that studies about 'memory' commonly activate the hippocampus. Therefore, this patient is engaged in memory processing."

**Why This Is Wrong**:

| Probability | Value | Interpretation |
|-------------|-------|----------------|
| P(hippocampus activation \| memory studies) | ~0.70 | 70% of memory studies activate hippocampus |
| P(memory studies) | ~0.05 | Only ~5% of all studies are about memory |
| P(hippocampus activation) | ~0.15 | 15% of all studies activate hippocampus |
| P(memory \| hippocampus activation) | ~0.23 | Only 23% of hippocampal activations are from memory studies |

Using Bayes' theorem:
```
P(memory | hippocampus) = 0.70 * 0.05 / 0.15 = 0.233
```

**The correct interpretation**: Even though memory studies frequently activate the hippocampus, hippocampal activation is most commonly driven by **other processes** (navigation, emotional processing, scene perception, imagination, etc.).

### 5.3 Another Clinical Example

**Scenario**: Left DLPFC (-44, 36, 20) activation in a patient.

**Dangerous Inference**:
> "DLPFC is associated with executive function. Therefore, this patient has executive dysfunction."

**Problems**:
1. DLPFC is also associated with working memory, attention, language, motor planning, and many other processes
2. The base rate of executive function studies is not accounted for
3. Individual patients may have atypical functional organization
4. The patient may have a condition that alters functional anatomy
5. Clinical assessment, not brain imaging, determines cognitive status

### 5.4 Safe Alternative Interpretation

**SAFE** (DeepSynaps-approved):
> "The left DLPFC (at coordinates -44, 36, 20) has been frequently implicated in executive function tasks across aggregated neuroimaging studies (z = 8.42, n = 342 studies). This provides contextual background for why DLPFC is a commonly used neuromodulation target. However, this association is from group-level meta-analytic data and does not indicate the functional status of any individual patient."

### 5.5 The Role of Selective Activation

Poldrack (2006, 2011) formalized the conditions under which reverse inference can be strengthened:

1. **Selective activation**: If a region is activated almost exclusively by one cognitive process, reverse inference becomes more reliable.
2. **Conjunction analysis**: If multiple regions show a consistent pattern, inference is strengthened.
3. **Base rate consideration**: Knowing the prior probability of the cognitive process is essential.

**Neurosynth Reality**: Very few brain regions show truly selective activation. Most regions are activated by multiple cognitive processes, making reverse inference unreliable.

### 5.6 DeepSynags Enforcement

The DeepSynaps system will enforce the following rules for all Neurosynth data:

1. **No diagnostic inference**: Neurosynth data is never used in any diagnostic pipeline
2. **No patient comparison**: Neurosynth maps are never overlaid on or compared with patient imaging
3. **Mandatory caveat**: Every display includes the reverse inference warning
4. **Context-only mode**: All Neurosynth data is explicitly labeled as "research context"
5. **Audit logging**: All Neurosynth lookups are logged for compliance review
6. **Clinician acknowledgment**: Clinicians must acknowledge caveats before accessing Neurosynth data

---

## 6. SAFE CLINICAL USE PATTERNS

This section defines the specific, approved use patterns for Neurosynth data within the DeepSynaps clinical workflow.

### 6.1 Approved Use Case: Stimulation Target Contextualization

**Workflow**: A clinician is planning a TMS session for a patient with treatment-resistant depression.

**DeepSynaps Behavior**:
1. Clinician selects left DLPFC as stimulation target (MNI: -44, 36, 20)
2. DeepSynaps queries Neurosynth for associations at this coordinate
3. System displays:
   - "Left DLPFC is commonly associated with: executive function (z=8.42, n=342), working memory (z=7.88, n=287), attention (z=6.21, n=198)..."
   - **WARNING BANNER**: "Meta-analytic associations from aggregated studies. Not patient-specific."
   - **CONTEXT NOTE**: "Left DLPFC is a standard target for depression treatment based on clinical trials, not meta-analytic inference."
4. Clinician can explore related terms and their associations
5. All data is clearly labeled as contextual background

### 6.2 Approved Use Case: Target Discovery Support

**Workflow**: A researcher is exploring novel neuromodulation targets for anxiety.

**DeepSynaps Behavior**:
1. Researcher queries Neurosynth for "anxiety" association map
2. System returns top associated regions:
   - Amygdala (z=12.4, n=156)
   - Insula (z=9.8, n=134)
   - ACC (z=8.2, n=142)
   - vmPFC (z=7.1, n=98)
3. **WARNING BANNER**: "These regions are commonly reported in anxiety neuroimaging studies. This is hypothesis-generating data, not a clinical recommendation."
4. Researcher can explore coordinates, study counts, and related terms
5. System provides links to relevant clinical trials and protocols

### 6.3 Approved Use Case: Educational Display

**Workflow**: A trainee is learning about neuromodulation targets.

**DeepSynaps Behavior**:
1. Trainee views a brain atlas with stimulation targets
2. Clicking on a target shows Neurosynth-derived functional associations
3. Display includes:
   - Top associated cognitive terms
   - Number of supporting studies
   - Z-score (association strength)
   - **Mandatory caveat**: "For educational purposes. Not for clinical decision-making."
4. Trainee learns the functional context of different targets
5. No clinical inference is made or suggested

### 6.4 Approved Use Case: Protocol Design Reference

**Workflow**: A clinician is customizing a neuromodulation protocol.

**DeepSynaps Behavior**:
1. Clinician selects a target region and desired cognitive domain
2. DeepSynaps shows the overlap between:
   - The selected target
   - The meta-analytic map for the cognitive domain
3. Display includes spatial metrics (overlap percentage, distance)
4. **WARNING BANNER**: "Protocol design reference only. Effectiveness must be validated clinically."
5. Clinician can adjust targeting parameters based on this context

### 6.5 Prohibited Use Cases

The following uses of Neurosynth data are **STRICTLY PROHIBITED** in DeepSynaps:

| Prohibited Use | Reason | Enforcement |
|----------------|--------|-------------|
| Inferring patient's cognitive state | Reverse inference fallacy | System-level block |
| Using for diagnosis | Not a diagnostic tool | Access control |
| Overlaying on patient scans | Individual vs. group data | UI restriction |
| Replacing clinical assessment | Correlational, not clinical | Workflow design |
| Predicting treatment response | No predictive validity data | Documentation block |
| Determining stimulation parameters | Meta-analytic ≠ clinical | Decision tree gate |
| Individual-level brain mapping | Group average data | Data model restriction |
| Temporal/causal reasoning | No temporal data | Data model restriction |

### 6.6 The DeepSynaps Safety Boundary

```
┌─────────────────────────────────────────────────────────────────┐
│                    SAFETY BOUNDARY MODEL                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   PATIENT DATA  │  CLINICAL LOGIC  │  NEUROSYNTH CONTEXT        │
│   ────────────  │  ──────────────  │  ─────────────────         │
│   Imaging       │  Diagnosis       │  Functional associations    │
│   Symptoms      │  Treatment plan  │  Target context             │
│   History       │  Protocol design │  Educational content        │
│   Assessment    │  Outcome eval    │  Research background        │
│                 │                  │                             │
│   ══════════════│══════════════════│══════════════════           │
│   CLINICAL      │  CLINICAL        │  CONTEXT                    │
│   DECISIONS     │  REASONING       │  ONLY                       │
│                 │                  │                             │
│   NEVER ←───────│←─────────────────│←── Neurosynth data         │
│                 │                  │                             │
│   Clinician     │  Clinician       │  DeepSynaps displays        │
│   judgment      │  expertise       │  with caveats               │
│                 │                  │                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. DEEPSYNAPS INTEGRATION ARCHITECTURE

### 7.1 System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    DEEPSYNAPS PROTOCOL STUDIO                        │
│                    Knowledge Layer — Phase 2                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │   Clinician  │  │   DeepTwin   │  │   Protocol Designer      │   │
│  │   Dashboard  │  │   Engine     │  │   (Stimulation Planner)   │   │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬──────────────┘   │
│         │                 │                      │                  │
│         ▼                 ▼                      ▼                  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              KNOWLEDGE GATEWAY (API Layer)                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │  │
│  │  │  Brain Atlas │  │  Protocol   │  │  Functional Context │  │  │
│  │  │  Service     │  │  Library    │  │  Service            │  │  │
│  │  └─────────────┘  └─────────────┘  └──────────┬──────────┘  │  │
│  └────────────────────────────────────────────────┼─────────────┘  │
│                                                   │                 │
│                              ┌────────────────────┘                 │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              NEUROSYNTH ADAPTER                              │  │
│  │  ┌─────────────────┐  ┌──────────────────────────────────┐  │  │
│  │  │  Local SQLite   │  │  API Fallback                    │  │  │
│  │  │  (Primary)      │  │  (neurosynth.org/api/)           │  │  │
│  │  │  ~1 GB          │  │  (Rate limited)                  │  │  │
│  │  └─────────────────┘  └──────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              NEUROQUERY ADAPTER (Optional)                   │  │
│  │  ┌─────────────────┐  ┌──────────────────────────────────┐  │  │
│  │  │  Python Package │  │  API (neuroquery.org/api/)       │  │  │
│  │  │  (Primary)      │  │  (Semantic search)               │  │  │
│  │  └─────────────────┘  └──────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              CAVEAT ENGINE                                   │  │
│  │  ┌──────────────┐  ┌─────────────┐  ┌───────────────────┐  │  │
│  │  │  Warning     │  │  Confidence │  │  Audit Logger     │  │  │
│  │  │  Generator   │  │  Model      │  │  (All lookups)    │  │  │
│  │  └──────────────┘  └─────────────┘  └───────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Neurosynth Adapter Design

#### 7.2.1 Local SQLite Adapter (Primary)

```python
"""
Neurosynth Local SQLite Adapter
Primary data source for Neurosynth lookups
"""
import sqlite3
import numpy as np
from dataclasses import dataclass
from typing import List, Optional, Tuple
from pathlib import Path

@dataclass
class AssociationResult:
    """Single term-region association result"""
    term: str
    z_score: float
    p_value: float
    study_count: int
    total_studies_for_term: int
    confidence_tier: str  # "high", "medium", "low", "insufficient"
    
@dataclass
class CoordinateQuery:
    """Query parameters for coordinate-based lookup"""
    x: float
    y: float
    z: float
    radius_mm: float = 6.0  # Default search radius
    z_threshold: float = 3.09  # p < 0.001
    min_studies: int = 5
    
@dataclass
class CaveatBundle:
    """Mandatory caveats to display with every result"""
    reverse_inference_warning: str
    group_average_warning: str
    meta_analytic_warning: str
    non_diagnostic_warning: str
    research_only_warning: str
    
DEFAULT_CAVEATS = CaveatBundle(
    reverse_inference_warning=(
        "⚠️ REVERSE INFERENCE WARNING: These associations show where "
        "studies about a term commonly activate, NOT what a given brain "
        "region is doing in any individual. P(activation|term) ≠ P(term|activation)."
    ),
    group_average_warning=(
        "📊 GROUP AVERAGE: All data reflects aggregated findings from "
        "groups of healthy adults. Individual patients may differ."
    ),
    meta_analytic_warning=(
        "🔬 META-ANALYTIC: These are statistical associations from "
        "published literature, not direct functional measurements."
    ),
    non_diagnostic_warning=(
        "🚫 NOT DIAGNOSTIC: This information is for contextual "
        "background only and is not a clinical assessment."
    ),
    research_only_warning=(
        "📋 RESEARCH CONTEXT: This data is provided for educational "
        "and contextual purposes in stimulation planning."
    )
)


class NeurosynthAdapter:
    """
    Local SQLite adapter for Neurosynth database queries.
    
    Provides:
    - Coordinate-to-term lookups
    - Term-to-region lookups
    - Association map metadata retrieval
    - Caveat-enriched responses
    """
    
    def __init__(self, db_path: str):
        """
        Initialize adapter with local SQLite database.
        
        Args:
            db_path: Path to the Neurosynth SQLite database file
        """
        self.db_path = Path(db_path)
        self._validate_database()
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.row_factory = sqlite3.Row
        self.caveats = DEFAULT_CAVEATS
        
    def _validate_database(self):
        """Validate that the database exists and has expected schema."""
        if not self.db_path.exists():
            raise FileNotFoundError(
                f"Neurosynth database not found at {self.db_path}. "
                "Download from: https://github.com/neurosynth/neurosynth-data"
            )
        
    def query_coordinate(
        self,
        query: CoordinateQuery,
        top_n: int = 20,
        include_caveats: bool = True
    ) -> dict:
        """
        Query terms associated with a specific MNI coordinate.
        
        Args:
            query: CoordinateQuery with x, y, z and search parameters
            top_n: Number of top associations to return
            include_caveats: Whether to include mandatory caveats
            
        Returns:
            Dictionary with associations, metadata, and caveats
        """
        # Convert coordinate to voxel index (2mm resolution, 91x109x91 grid)
        # MNI space: x range [-90, 90], y range [-126, 90], z range [-72, 108]
        i = int((query.x + 90) / 2)
        j = int((query.y + 126) / 2)
        k = int((query.z + 72) / 2)
        
        cursor = self.conn.cursor()
        
        # Query associations at this voxel
        # The images table stores z-score maps as arrays indexed by term
        cursor.execute("""
            SELECT v.term, i.z_score, i.p_value, i.study_count
            FROM images i
            JOIN vocab v ON i.term_id = v.id
            WHERE i.voxel_x = ? AND i.voxel_y = ? AND i.voxel_z = ?
            AND i.z_score >= ?
            AND i.study_count >= ?
            ORDER BY i.z_score DESC
            LIMIT ?
        """, (i, j, k, query.z_threshold, query.min_studies, top_n))
        
        associations = []
        for row in cursor.fetchall():
            confidence = self._calculate_confidence_tier(
                row['z_score'], row['study_count']
            )
            associations.append(AssociationResult(
                term=row['term'],
                z_score=row['z_score'],
                p_value=row['p_value'],
                study_count=row['study_count'],
                total_studies_for_term=self._get_study_count_for_term(row['term']),
                confidence_tier=confidence
            ))
            
        result = {
            "coordinate": [query.x, query.y, query.z],
            "query_radius_mm": query.radius_mm,
            "associations": associations,
            "total_associations_found": len(associations),
            "z_threshold": query.z_threshold,
            "min_studies": query.min_studies,
            "data_source": "Neurosynth (meta-analytic)",
            "timestamp": self._get_timestamp(),
        }
        
        if include_caveats:
            result["caveats"] = self.caveats
            result["display_rules"] = self._get_display_rules()
            
        return result
    
    def query_sphere(
        self,
        center: Tuple[float, float, float],
        radius_mm: float = 6.0,
        top_n: int = 20
    ) -> dict:
        """
        Query terms associated with a spherical region.
        
        Uses a sphere-based search to account for coordinate uncertainty.
        More robust than single-voxel queries.
        
        Args:
            center: (x, y, z) MNI coordinates
            radius_mm: Search radius in millimeters
            top_n: Number of top associations to return
            
        Returns:
            Dictionary with aggregated associations and caveats
        """
        cx, cy, cz = center
        
        cursor = self.conn.cursor()
        
        # Sphere query: find all voxels within radius of center
        # Compute voxel bounds for efficiency
        cursor.execute("""
            SELECT v.term, 
                   AVG(i.z_score) as mean_z,
                   MAX(i.z_score) as max_z,
                   AVG(i.p_value) as mean_p,
                   SUM(i.study_count) as total_studies,
                   COUNT(*) as voxel_count
            FROM images i
            JOIN vocab v ON i.term_id = v.id
            WHERE SQRT(
                POW((i.voxel_x * 2 - 90) - ?, 2) +
                POW((i.voxel_y * 2 - 126) - ?, 2) +
                POW((i.voxel_z * 2 - 72) - ?, 2)
            ) <= ?
            AND i.z_score >= 3.09
            GROUP BY v.term
            ORDER BY mean_z DESC
            LIMIT ?
        """, (cx, cy, cz, radius_mm, top_n))
        
        associations = []
        for row in cursor.fetchall():
            confidence = self._calculate_confidence_tier(
                row['mean_z'], row['total_studies']
            )
            associations.append(AssociationResult(
                term=row['term'],
                z_score=row['mean_z'],
                p_value=row['mean_p'],
                study_count=row['total_studies'],
                total_studies_for_term=self._get_study_count_for_term(row['term']),
                confidence_tier=confidence
            ))
            
        return {
            "center_coordinate": list(center),
            "search_radius_mm": radius_mm,
            "associations": associations,
            "caveats": self.caveats,
            "data_source": "Neurosynth (sphere query, meta-analytic)",
            "timestamp": self._get_timestamp(),
        }
    
    def query_term(self, term: str) -> dict:
        """
        Get association map metadata for a specific term.
        
        Args:
            term: Cognitive/behavioral term to look up
            
        Returns:
            Dictionary with term metadata and top associated regions
        """
        cursor = self.conn.cursor()
        
        # Get term info
        cursor.execute("""
            SELECT v.term, v.frequency, v.category
            FROM vocab v
            WHERE v.term = ?
        """, (term,))
        
        term_info = cursor.fetchone()
        if not term_info:
            return {
                "term": term,
                "found": False,
                "suggestion": "Term not found in Neurosynth vocabulary. "
                            "Try a related term or use NeuroQuery for semantic search.",
                "caveats": self.caveats,
            }
        
        # Get top associated regions (voxels with highest z-scores)
        cursor.execute("""
            SELECT i.voxel_x, i.voxel_y, i.voxel_z, 
                   i.z_score, i.p_value, i.study_count
            FROM images i
            JOIN vocab v ON i.term_id = v.id
            WHERE v.term = ?
            ORDER BY i.z_score DESC
            LIMIT 50
        """, (term,))
        
        regions = []
        for row in cursor.fetchall():
            # Convert voxel indices back to MNI coordinates
            x = row['voxel_x'] * 2 - 90
            y = row['voxel_y'] * 2 - 126
            z = row['voxel_z'] * 2 - 72
            regions.append({
                "coordinate_mni": [x, y, z],
                "z_score": row['z_score'],
                "p_value": row['p_value'],
                "study_count": row['study_count']
            })
            
        return {
            "term": term,
            "found": True,
            "frequency_in_corpus": term_info['frequency'],
            "category": term_info.get('category', 'unknown'),
            "top_associated_regions": regions,
            "total_associated_voxels": len(regions),
            "caveats": self.caveats,
            "data_source": "Neurosynth (meta-analytic)",
            "timestamp": self._get_timestamp(),
        }
    
    def _calculate_confidence_tier(self, z_score: float, study_count: int) -> str:
        """
        Calculate confidence tier based on statistical strength and sample size.
        
        Tiers:
        - "high": z > 6.0 and n > 100
        - "medium": z > 4.0 and n > 30
        - "low": z > 3.09 and n > 10
        - "insufficient": everything else
        """
        if z_score > 6.0 and study_count > 100:
            return "high"
        elif z_score > 4.0 and study_count > 30:
            return "medium"
        elif z_score > 3.09 and study_count > 10:
            return "low"
        else:
            return "insufficient"
    
    def _get_study_count_for_term(self, term: str) -> int:
        """Get total number of studies mentioning a term."""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT frequency FROM vocab WHERE term = ?
        """, (term,))
        row = cursor.fetchone()
        return row['frequency'] if row else 0
    
    def _get_timestamp(self) -> str:
        """Get current UTC timestamp."""
        from datetime import datetime
        return datetime.utcnow().isoformat() + "Z"
    
    def _get_display_rules(self) -> dict:
        """Return display rules for the UI."""
        return {
            "must_show": [
                "Meta-analytic association from aggregated studies",
                "Not patient-specific functional assessment",
                "Research context only"
            ],
            "must_flag": [
                "Reverse inference with warning",
                "Low study count (< 20)",
                "High term ambiguity"
            ],
            "must_never": [
                "Use for diagnostic inference",
                "Present as patient-specific findings",
                "Replace clinical assessment"
            ]
        }
        
    def close(self):
        """Close database connection."""
        self.conn.close()
        
    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
```

#### 7.2.2 NeuroQuery Adapter (Optional Overlay)

```python
"""
NeuroQuery Adapter
Provides semantic search capabilities as an overlay to Neurosynth.
"""

class NeuroQueryAdapter:
    """
    NeuroQuery adapter for semantic term queries.
    
    Falls back to API if local package is not available.
    """
    
    def __init__(self, use_local: bool = True):
        self.use_local = use_local
        self.nq_client = None
        
        if use_local:
            try:
                from neuroquery import NeuroQueryImageSearch
                self.nq_client = NeuroQueryImageSearch.from_pretrained()
            except ImportError:
                self.use_local = False
                
    def semantic_query(self, query_text: str, max_terms: int = 20) -> dict:
        """
        Perform a semantic query using NeuroQuery.
        
        Args:
            query_text: Free-text query (e.g., "verbal working memory")
            max_terms: Maximum number of terms to return
            
        Returns:
            Dictionary with predicted terms and spatial map metadata
        """
        if self.use_local and self.nq_client:
            return self._local_query(query_text, max_terms)
        else:
            return self._api_query(query_text, max_terms)
    
    def _local_query(self, query_text: str, max_terms: int) -> dict:
        """Query using local NeuroQuery package."""
        result = self.nq_client(query_text)
        
        return {
            "query": query_text,
            "method": "neuroquery_local",
            "predicted_terms": result.get("terms", []),
            "brain_map_available": result.get("brain_map") is not None,
            "similarity_to_corpus": result.get("similarity_score", 0.0),
            "similar_studies_count": len(result.get("similar_studies", [])),
            "caveats": DEFAULT_CAVEATS,
            "warning": (
                "NeuroQuery predictions are based on semantic similarity to "
                "training corpus. Novel queries may have low reliability."
            )
        }
    
    def _api_query(self, query_text: str, max_terms: int) -> dict:
        """Query using NeuroQuery REST API."""
        import requests
        
        response = requests.post(
            "https://neuroquery.org/api/query",
            json={"query": query_text, "n_terms": max_terms},
            timeout=30
        )
        response.raise_for_status()
        
        data = response.json()
        return {
            "query": query_text,
            "method": "neuroquery_api",
            "predicted_terms": data.get("terms", []),
            "brain_map_available": True,
            "similarity_to_corpus": data.get("similarity", 0.0),
            "caveats": DEFAULT_CAVEATS,
        }
```

### 7.3 Service Layer

```python
"""
Functional Context Service
Orchestrates Neurosynth and NeuroQuery lookups with caveat enforcement.
"""

from enum import Enum

class QueryType(Enum):
    COORDINATE = "coordinate"  # Single coordinate lookup
    SPHERE = "sphere"          # Spherical region lookup
    TERM = "term"              # Term-based lookup
    SEMANTIC = "semantic"      # Free-text semantic query

class FunctionalContextService:
    """
    High-level service for functional context enrichment.
    
    Provides a unified interface for:
    - Coordinate-to-term lookups
    - Term-to-region lookups
    - Semantic queries
    - Caveat enforcement
    - Audit logging
    """
    
    def __init__(
        self,
        neurosynth_db_path: str,
        enable_neuroquery: bool = True,
        audit_log_path: Optional[str] = None
    ):
        self.neurosynth = NeurosynthAdapter(neurosynth_db_path)
        self.neuroquery = NeuroQueryAdapter(use_local=enable_neuroquery) if enable_neuroquery else None
        self.audit_log_path = audit_log_path
        
    def get_context_for_coordinate(
        self,
        x: float, y: float, z: float,
        query_type: QueryType = QueryType.SPHERE,
        radius_mm: float = 6.0,
        top_n: int = 15
    ) -> dict:
        """
        Get functional context for a brain coordinate.
        
        This is the primary method for stimulation target contextualization.
        
        Args:
            x, y, z: MNI coordinates
            query_type: COORDINATE or SPHERE (default: SPHERE)
            radius_mm: Search radius for sphere queries
            top_n: Number of top associations to return
            
        Returns:
            Enriched context with mandatory caveats and confidence tiers
        """
        if query_type == QueryType.COORDINATE:
            query = CoordinateQuery(x=x, y=y, z=z, radius_mm=radius_mm)
            result = self.neurosynth.query_coordinate(query, top_n=top_n)
        else:
            result = self.neurosynth.query_sphere(
                center=(x, y, z),
                radius_mm=radius_mm,
                top_n=top_n
            )
            
        # Enrich with provenance
        result["provenance"] = self._build_provenance(result)
        
        # Add confidence model
        result["confidence_model"] = self._build_confidence_model(result)
        
        # Log the lookup
        self._log_lookup("coordinate", [x, y, z], result)
        
        return result
    
    def get_context_for_term(self, term: str) -> dict:
        """
        Get functional context for a cognitive term.
        
        Used for target discovery and hypothesis generation.
        
        Args:
            term: Cognitive/behavioral term
            
        Returns:
            Term associations with caveats
        """
        result = self.neurosynth.query_term(term)
        
        # If term not found and NeuroQuery is available, try semantic search
        if not result.get("found") and self.neuroquery:
            result["neuroquery_fallback"] = self.neuroquery.semantic_query(term)
            
        result["provenance"] = self._build_provenance(result)
        self._log_lookup("term", term, result)
        
        return result
    
    def semantic_search(self, query_text: str) -> dict:
        """
        Perform a semantic search using NeuroQuery.
        
        Args:
            query_text: Free-text query
            
        Returns:
            Semantic query results with caveats
        """
        if not self.neuroquery:
            return {
                "error": "NeuroQuery is not enabled. Install with: pip install neuroquery",
                "caveats": DEFAULT_CAVEATS,
            }
            
        result = self.neuroquery.semantic_query(query_text)
        result["provenance"] = self._build_provenance(result)
        self._log_lookup("semantic", query_text, result)
        
        return result
    
    def get_target_context(
        self,
        target_name: str,
        target_coordinates: List[float],
        clinical_indication: Optional[str] = None
    ) -> dict:
        """
        Get comprehensive functional context for a stimulation target.
        
        This is the main DeepSynaps integration point.
        
        Args:
            target_name: Name of the target (e.g., "Left DLPFC")
            target_coordinates: [x, y, z] MNI coordinates
            clinical_indication: Optional clinical indication for context
            
        Returns:
            Comprehensive context bundle for display
        """
        x, y, z = target_coordinates
        
        # Get Neurosynth associations
        ns_result = self.get_context_for_coordinate(x, y, z, top_n=20)
        
        # Get term context for clinical indication if provided
        indication_context = None
        if clinical_indication:
            indication_context = self.get_context_for_term(clinical_indication)
        
        # Build the comprehensive context
        context = {
            "target": {
                "name": target_name,
                "coordinates_mni": [x, y, z],
                "coordinate_space": "MNI152",
            },
            "clinical_indication": clinical_indication,
            "functional_associations": ns_result.get("associations", []),
            "num_associations": len(ns_result.get("associations", [])),
            "indication_context": indication_context,
            "caveats": DEFAULT_CAVEATS,
            "display_classification": "META_ANALYTIC_CONTEXT",
            "permitted_use": [
                "Stimulation target contextualization",
                "Educational reference",
                "Hypothesis generation",
                "Protocol design reference"
            ],
            "prohibited_use": [
                "Diagnostic inference",
                "Patient-specific functional assessment",
                "Clinical outcome prediction",
                "Individual brain mapping"
            ],
            "provenance": self._build_provenance(ns_result),
            "confidence_model": self._build_confidence_model(ns_result),
            "reverse_inference_banner": (
                "⚠️ REVERSE INFERENCE PROHIBITED: The associations below show "
                "where studies about a concept commonly activate. They do NOT "
                "indicate what this brain region is doing in any individual. "
                "Clinical decisions must be based on clinical assessment, not "
                "meta-analytic associations."
            ),
        }
        
        self._log_lookup("target_context", {
            "target": target_name,
            "coordinates": target_coordinates,
            "indication": clinical_indication
        }, context)
        
        return context
    
    def _build_provenance(self, result: dict) -> dict:
        """Build provenance metadata for audit and reproducibility."""
        return {
            "data_source": "Neurosynth (neurosynth.org)",
            "database_version": "latest",  # Should be populated from DB metadata
            "query_timestamp": self.neurosynth._get_timestamp(),
            "coordinate_space": "MNI152",
            "spatial_resolution": "2mm isotropic",
            "inference_type": "reverse_inference",  # Most lookups are reverse inference
            "creator": "Tal Yarkoni et al.",
            "citation": (
                "Yarkoni, T., Poldrack, R.A., Nichols, T.E., "
                "Van Essen, D.C., & Wager, T.D. (2011). "
                "Large-scale automated synthesis of human functional "
                "neuroimaging data. Nature Methods, 8(8), 665-670."
            ),
            "license": "Creative Commons Attribution",
            "data_type": "Meta-analytic association maps",
            "confidentiality": "Public domain (aggregated research data)",
        }
    
    def _build_confidence_model(self, result: dict) -> dict:
        """Build confidence model for the query results."""
        associations = result.get("associations", [])
        
        if not associations:
            return {
                "overall_confidence": "none",
                "reason": "No significant associations found",
            }
        
        # Calculate overall confidence
        tiers = [a.confidence_tier for a in associations]
        high_count = tiers.count("high")
        medium_count = tiers.count("medium")
        total = len(tiers)
        
        if high_count / total > 0.5:
            overall = "high"
        elif (high_count + medium_count) / total > 0.5:
            overall = "medium"
        else:
            overall = "low"
        
        return {
            "overall_confidence": overall,
            "tier_breakdown": {
                "high": high_count,
                "medium": medium_count,
                "low": tiers.count("low"),
                "insufficient": tiers.count("insufficient")
            },
            "uncertainty_factors": [
                "Publication bias: Positive results are overrepresented",
                "Coordinate bias: Only peak coordinates are reported",
                "Base rate effects: Common terms may be overrepresented",
                "Group average: Data from healthy adults, not individual patients",
                "Term ambiguity: Terms may aggregate heterogeneous concepts"
            ],
            "recommendation": (
                "Use these associations for contextual background only. "
                "Do not use for clinical inference or patient-specific assessment."
            )
        }
    
    def _log_lookup(self, query_type: str, query_params, result: dict):
        """Log all lookups for audit and compliance."""
        import json
        from datetime import datetime
        
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "query_type": query_type,
            "query_params": str(query_params),
            "result_count": len(result.get("associations", [])),
            "has_caveats": "caveats" in result,
        }
        
        if self.audit_log_path:
            with open(self.audit_log_path, "a") as f:
                f.write(json.dumps(log_entry) + "\n")
                
    def close(self):
        """Clean up resources."""
        self.neurosynth.close()
```

---

## 8. DISPLAY RULES & CAVEATS

### 8.1 Mandatory Display Elements

Every display of Neurosynth data in the DeepSynaps system MUST include the following elements:

#### 8.1.1 Warning Banner (Top of Display)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⚠️  META-ANALYTIC RESEARCH CONTEXT — NOT FOR CLINICAL DIAGNOSIS        │
│                                                                          │
│  This information comes from aggregated neuroimaging studies and is      │
│  provided for educational/contextual purposes only. It does NOT          │
│  represent any individual patient's brain function.                      │
│                                                                          │
│  □ I understand this is research context only (required to proceed)     │
└──────────────────────────────────────────────────────────────────────────┘
```

#### 8.1.2 Reverse Inference Warning (Inline)

```
⚠️ REVERSE INFERENCE NOTICE:
   The associations below show where studies about a concept commonly
   activate. P(activation | term) is shown. The reverse — inferring a
   cognitive process from brain activation — is NOT valid.
   
   Example: "Memory studies often activate the hippocampus" does NOT mean
   "hippocampal activation indicates memory processing."
```

#### 8.1.3 Data Source Attribution

```
📊 Source: Neurosynth (neurosynth.org) — Yarkoni et al. (2011)
   Nature Methods. Aggregated from 14,000+ fMRI studies.
   Group-average data from healthy adults.
```

#### 8.1.4 Confidence Indicator

```
Confidence: ●●●○○ Medium
  High: z > 6.0, n > 100 studies
  Medium: z > 4.0, n > 30 studies
  Low: z > 3.09, n > 10 studies
```

#### 8.1.5 Study Count

```
Supported by N = [count] studies
⚠️ Low study count (< 20): Association has limited statistical power
```

### 8.2 Display Templates

#### 8.2.1 Coordinate Lookup Display

```
┌──────────────────────────────────────────────────────────────────┐
│ Target: Left DLPFC                                               │
│ Coordinates: MNI (-44, 36, 20)                                   │
│                                                                  │
│ [⚠️ WARNING BANNER]                                              │
│                                                                  │
│ Top Functional Associations (Meta-Analytic):                     │
│ ───────────────────────────────────────────                      │
│                                                                  │
│ 1. executive function        z = 8.42  n=342  ●●●●● High       │
│ 2. working memory            z = 7.88  n=287  ●●●●● High       │
│ 3. attention                 z = 6.21  n=198  ●●●●○ Medium     │
│ 4. cognitive control         z = 5.94  n=156  ●●●●○ Medium     │
│ 5. inhibitory control        z = 5.67  n=134  ●●●●○ Medium     │
│ 6. decision making           z = 4.82  n=98   ●●●○○ Medium     │
│ 7. language                  z = 4.21  n=87   ●●●○○ Medium     │
│ 8. response inhibition       z = 3.95  n=76   ●●●○○ Medium     │
│ 9. goal directed             z = 3.67  n=65   ●●●○○ Low        │
│ 10. task switching           z = 3.45  n=54   ●●●○○ Low        │
│                                                                  │
│ [REVERSE INFERENCE NOTICE]                                       │
│ [DATA SOURCE ATTRIBUTION]                                        │
│ [CONFIDENCE INDICATOR]                                           │
│                                                                  │
│ Permitted Use: ✓ Target contextualization                        │
│                ✓ Educational reference                           │
│                ✗ Diagnostic inference (BLOCKED)                  │
└──────────────────────────────────────────────────────────────────┘
```

#### 8.2.2 Term Lookup Display

```
┌──────────────────────────────────────────────────────────────────┐
│ Term: "working memory"                                           │
│                                                                  │
│ [⚠️ WARNING BANNER]                                              │
│                                                                  │
│ Top Associated Brain Regions (Meta-Analytic):                    │
│ ─────────────────────────────────────────────                    │
│                                                                  │
│ 1. Left DLPFC          (-44, 36, 20)   z=7.88  n=287  High     │
│ 2. Right DLPFC         (44, 36, 20)    z=7.21  n=245  High     │
│ 3. Left Parietal       (-44, -44, 44)  z=6.82  n=198  Medium   │
│ 4. Pre-SMA             (0, 14, 56)     z=6.45  n=187  Medium   │
│ 5. Left IFG            (-50, 24, 4)    z=5.98  n=156  Medium   │
│                                                                  │
│ [REVERSE INFERENCE NOTICE]                                       │
│ [DATA SOURCE ATTRIBUTION]                                        │
│                                                                  │
│ ⚠️ Term Ambiguity: "working memory" may encompass different      │
│    subprocesses (maintenance, manipulation, updating). Results   │
│    aggregate across these subprocesses.                          │
│                                                                  │
│ Permitted Use: ✓ Hypothesis generation                           │
│                ✓ Target discovery                                │
│                ✗ Treatment response prediction (BLOCKED)         │
└──────────────────────────────────────────────────────────────────┘
```

### 8.3 UI Enforcement Rules

#### 8.3.1 Color Coding

| Context | Color | Usage |
|---------|-------|-------|
| Warning banners | Amber/Yellow | All caveat displays |
| Reverse inference | Red | Prohibited action warnings |
| Meta-analytic data | Blue | All Neurosynth-derived content |
| High confidence | Green | z > 6.0, n > 100 |
| Medium confidence | Blue | z > 4.0, n > 30 |
| Low confidence | Orange | z > 3.09, n > 10 |
| Insufficient | Gray | Below thresholds |

#### 8.3.2 Interaction Patterns

1. **Caveat acknowledgment**: User must click "I understand" before viewing data
2. **Persistent warning**: Warning banner remains visible at all times
3. **Copy protection**: Neurosynth data cannot be copied without caveat text
4. **Export watermark**: Any exported data includes caveat watermark
5. **No clinical action**: Neurosynth data cannot trigger clinical actions

### 8.4 API Response Format

All API responses that include Neurosynth data must follow this format:

```json
{
  "data_type": "META_ANALYTIC_CONTEXT",
  "classification": "RESEARCH_CONTEXT_ONLY",
  "caveats": {
    "reverse_inference_warning": "...",
    "group_average_warning": "...",
    "meta_analytic_warning": "...",
    "non_diagnostic_warning": "..."
  },
  "permitted_use": ["target_contextualization", "education", "hypothesis_generation"],
  "prohibited_use": ["diagnosis", "patient_assessment", "outcome_prediction"],
  "content": { ... actual data ... },
  "provenance": { ... source metadata ... },
  "confidence": { ... confidence model ... },
  "requires_acknowledgment": true
}
```

---

## 9. PROVENANCE & CONFIDENCE MODEL

### 9.1 Provenance Framework

Every Neurosynth lookup in DeepSynaps carries a complete provenance chain:

```
┌─────────────────────────────────────────────────────────────────┐
│ PROVENANCE CHAIN                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. ORIGIN                                                       │
│    - Data source: Neurosynth (neurosynth.org)                  │
│    - Creators: Tal Yarkoni, Russell Poldrack, Tor Wager         │
│    - Publication: Yarkoni et al. (2011), Nature Methods         │
│    - License: Creative Commons Attribution                      │
│                                                                 │
│ 2. DATA GENERATION                                              │
│    - Input: 14,000+ peer-reviewed fMRI articles                │
│    - Extraction: Automated NLP pipeline                        │
│    - Coordinates: Peak MNI coordinates (not full maps)         │
│    - Terms: Automated extraction from abstracts                │
│    - Processing: Association z-score maps                      │
│                                                                 │
│ 3. QUERY                                                        │
│    - Query type: [coordinate / term / semantic]                │
│    - Parameters: [specific parameters]                         │
│    - Timestamp: [ISO 8601 timestamp]                           │
│    - User: [anonymized user ID]                                │
│    - Context: [clinical / research / educational]              │
│                                                                 │
│ 4. RESULT                                                       │
│    - Association count: [N]                                    │
│    - Confidence tier: [high / medium / low]                    │
│    - Caveats applied: [all / partial]                          │
│    - Display classification: META_ANALYTIC_CONTEXT             │
│                                                                 │
│ 5. USAGE                                                        │
│    - Permitted use: [list]                                     │
│    - Prohibited use: [list]                                    │
│    - Acknowledgment: [required / provided]                     │
│    - Audit log: [logged / not logged]                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Confidence Tier System

The confidence tier system provides users with a clear indication of the reliability of each association.

#### 9.2.1 Tier Definitions

| Tier | Z-Score | Study Count | Interpretation | Display |
|------|---------|-------------|----------------|---------|
| **High** | > 6.0 | > 100 | Strong, well-supported association | ●●●●● Green |
| **Medium** | > 4.0 | > 30 | Moderately supported | ●●●●○ Blue |
| **Low** | > 3.09 | > 10 | Weak support, limited evidence | ●●●○○ Orange |
| **Insufficient** | ≤ 3.09 | ≤ 10 | Not statistically reliable | ●●○○○ Gray |

#### 9.2.2 Tier Calculation

```python
def calculate_confidence_tier(z_score: float, study_count: int) -> dict:
    """
    Calculate confidence tier with full reasoning.
    """
    if z_score > 6.0 and study_count > 100:
        tier = "high"
        factors = [
            "Strong statistical association (z > 6.0)",
            "Well-supported by large literature (n > 100)",
            "Likely robust to publication bias"
        ]
    elif z_score > 4.0 and study_count > 30:
        tier = "medium"
        factors = [
            "Moderate statistical association (z > 4.0)",
            "Reasonable literature support (n > 30)",
            "May be affected by publication bias"
        ]
    elif z_score > 3.09 and study_count > 10:
        tier = "low"
        factors = [
            "Weak statistical association (z > 3.09)",
            "Limited literature support (n > 10)",
            "High uncertainty, use with caution"
        ]
    else:
        tier = "insufficient"
        factors = [
            "Association does not meet reliability threshold",
            "Too few studies or too weak effect",
            "Not suitable for any inference"
        ]
    
    return {
        "tier": tier,
        "reasoning": factors,
        "recommendation": {
            "high": "Suitable for contextual enrichment",
            "medium": "Usable with awareness of limitations",
            "low": "Reference only, very limited reliability",
            "insufficient": "Do not use — insufficient evidence"
        }[tier]
    }
```

#### 9.2.3 Uncertainty Quantification

For each association, the system quantifies:

1. **Statistical uncertainty**: Confidence intervals on z-scores (where calculable)
2. **Sample size uncertainty**: Study count and its implications
3. **Publication bias uncertainty**: Likely inflation of effects
4. **Spatial uncertainty**: ± 8mm tolerance for coordinate matching
5. **Term ambiguity uncertainty**: Number of distinct sub-processes aggregated

### 9.3 Audit Logging

All Neurosynth interactions are logged for compliance:

```json
{
  "timestamp": "2024-01-15T14:32:10Z",
  "user_id": "anon_session_abc123",
  "session_id": "sess_xyz789",
  "query_type": "coordinate_lookup",
  "query_params": {
    "x": -44,
    "y": 36,
    "z": 20,
    "radius_mm": 6
  },
  "results_returned": 15,
  "caveats_shown": true,
  "user_acknowledged": true,
  "context": "stimulation_target_planning",
  "clinical_indication": "major_depressive_disorder",
  "confidence_tier_distribution": {
    "high": 5,
    "medium": 7,
    "low": 3
  },
  "data_source": "Neurosynth",
  "database_version": "2023-06-01"
}
```

---

## 10. DEEPTWIN FUNCTIONAL CONTEXT INTEGRATION

### 10.1 Integration Point

DeepTwin is the patient-specific digital twin component of DeepSynaps. Neurosynth provides **functional context overlay** for DeepTwin stimulation targets.

```
┌─────────────────────────────────────────────────────────────────┐
│                  DEEPTWIN + NEUROSYNTH INTEGRATION              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐        ┌──────────────┐                      │
│  │   DeepTwin   │        │  Neurosynth  │                      │
│  │   Engine     │◄──────►│  Adapter     │                      │
│  │              │        │              │                      │
│  │ Patient MRI  │        │ Meta-analytic│                      │
│  │ Head model   │        │ associations │                      │
│  │ E-field sim  │        │              │                      │
│  │ Target atlas │        │              │                      │
│  └──────┬───────┘        └──────────────┘                      │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              DISPLAY LAYER                           │       │
│  │                                                     │       │
│  │  ┌──────────────┐  ┌──────────────────────────────┐ │       │
│  │  │ Patient-Spec │  │ Meta-Analytic Context        │ │       │
│  │  │ (DeepTwin)   │  │ (Neurosynth — clearly        │ │       │
│  │  │              │  │  labeled, caveated)          │ │       │
│  │  │ - E-field    │  │                              │ │       │
│  │  │ - Anatomy    │  │ - Functional associations    │ │       │
│  │  │ - Individual │  │ - Study counts               │ │       │
│  │  │   targets    │  │ - Confidence tiers           │ │       │
│  │  │              │  │ - Reverse inference warning  │ │       │
│  │  └──────────────┘  └──────────────────────────────┘ │       │
│  │                                                     │       │
│  │  [SEPARATOR: "━━ Patient Data ━━ Research Context ━━"]       │
│  │                                                     │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 10.2 Data Flow

#### 10.2.1 Target Selection Flow

```
1. Clinician selects stimulation target in DeepTwin
   → Coordinate identified in patient space
   
2. DeepTwin converts patient coordinate to MNI space
   → Using patient-to-MNI registration
   
3. DeepSynaps queries Neurosynth for MNI coordinate
   → Gets meta-analytic associations
   
4. Caveat engine enriches response
   → Adds all mandatory warnings
   
5. Display layer renders patient + context data
   → Clear visual separation
   
6. Clinician views contextual information
   → Cannot use for clinical inference (enforced)
```

#### 10.2.2 Protocol Design Flow

```
1. Clinician designs stimulation protocol
   → Target, parameters, indication specified
   
2. DeepSynaps checks Protocol Library for evidence
   → Clinical trial data, standard protocols
   
3. DeepSynaps queries Neurosynth for target context
   → Functional associations with caveats
   
4. Combined display shows:
   a. Clinical evidence (Protocol Library)
   b. Functional context (Neurosynth — caveated)
   
5. Clinician makes informed decision
   → Based on clinical evidence + contextual background
```

### 10.3 DeepTwin Integration API

```python
"""
DeepTwin Functional Context Integration
Provides functional context for DeepTwin stimulation targets.
"""

class DeepTwinContextBridge:
    """
    Bridge between DeepTwin patient-specific data and
    Neurosynth meta-analytic context.
    
    Ensures clear separation between patient data and
    meta-analytic context in all displays.
    """
    
    def __init__(self, functional_context_service: FunctionalContextService):
        self.fcs = functional_context_service
        
    def enrich_target_with_context(
        self,
        patient_target: dict,
        clinical_indication: str
    ) -> dict:
        """
        Enrich a DeepTwin target with functional context.
        
        Args:
            patient_target: DeepTwin target with patient coordinates
                {
                    "name": "Left DLPFC",
                    "patient_coordinates": [x, y, z],
                    "mni_coordinates": [x, y, z],
                    "target_type": "cortical",
                    "target_source": "atlas"
                }
            clinical_indication: Clinical indication for context
            
        Returns:
            Enriched target with separated patient and context data
        """
        # Get functional context from Neurosynth
        context = self.fcs.get_target_context(
            target_name=patient_target["name"],
            target_coordinates=patient_target["mni_coordinates"],
            clinical_indication=clinical_indication
        )
        
        # Build the enriched response with clear separation
        return {
            "patient_specific": {
                "target": patient_target,
                "source": "DeepTwin",
                "data_type": "PATIENT_SPECIFIC",
                "description": "Individual patient data from DeepTwin modeling"
            },
            "meta_analytic_context": {
                "functional_associations": context["functional_associations"],
                "caveats": context["caveats"],
                "provenance": context["provenance"],
                "confidence_model": context["confidence_model"],
                "source": "Neurosynth",
                "data_type": "META_ANALYTIC_CONTEXT",
                "description": "Aggregated research data for contextual background"
            },
            "separator": {
                "message": (
                    "━━ Patient-Specific Data (above) "
                    "━━ Research Context (below) ━━"
                ),
                "note": (
                    "The sections above and below are from different data sources "
                    "and must not be conflated. Patient data is individual-specific; "
                    "research context is aggregated from published studies."
                )
            },
            "display_rules": {
                "patient_data_first": True,
                "context_separated": True,
                "caveats_visible": True,
                "reverse_inference_blocked": True
            }
        }
```

### 10.4 Clinical Decision Tree

```
CLINICAL DECISION: Should Neurosynth context be displayed?

START
  │
  ▼
Is this for stimulation target contextualization?
  │
  ├── YES → Is the clinician aware of caveats?
  │           │
  │           ├── YES → DISPLAY with full caveats
  │           │           (Target context mode)
  │           │
  │           └── NO → Require acknowledgment first
  │
  └── NO → Is this for educational purposes?
              │
              ├── YES → Is a qualified instructor present?
              │           │
              │           ├── YES → DISPLAY with caveats
              │           │           (Education mode)
              │           │
              │           └── NO → Restrict access
              │
              └── NO → Is this for hypothesis generation?
                          │
                          ├── YES → DISPLAY with caveats
                          │           (Research mode)
                          │
                          └── NO → BLOCK ACCESS
                                      (Not an approved use case)
```

---

## 11. LICENSING

### 11.1 Neurosynth License

Neurosynth data is released under the **Creative Commons Attribution (CC-BY)** license.

**Key Terms**:
- **Attribution**: Must cite Yarkoni et al. (2011)
- **ShareAlike**: Not required (CC-BY, not CC-BY-SA)
- **Commercial use**: Permitted under CC-BY
- **Data modification**: Permitted with attribution

**Required Citation**:
```
Yarkoni, T., Poldrack, R.A., Nichols, T.E., Van Essen, D.C., & Wager, T.D. (2011).
Large-scale automated synthesis of human functional neuroimaging data.
Nature Methods, 8(8), 665-670. doi:10.1038/nmeth.1635
```

### 11.2 NeuroQuery License

NeuroQuery is released under the **BSD 3-Clause** license.

**Key Terms**:
- Permits commercial use
- Requires attribution
- Permits modification and distribution

**Required Citation**:
```
Dockès, J., Peltier, J.B., Pinsard, B., Benali, H., & Thirion, B. (2020).
 NeuroQuery: a unified interface for coordinate- and image-based meta-analysis.
Nature Methods, 17(8), 827-828. doi:10.1038/s41592-020-0908-3
```

### 11.3 DeepSynaps Usage Terms

Within DeepSynaps, all Neurosynth and NeuroQuery data:
1. Must be clearly attributed to the original sources
2. Must include all mandatory caveats
3. Must not be presented as original DeepSynaps research
4. Must not be used for clinical diagnosis (as per system design)
5. Must maintain the open-access nature of derivative works where applicable

### 11.4 Attribution Display

All displays of Neurosynth data must include:

```
Data: Neurosynth (neurosynth.org)
Citation: Yarkoni et al. (2011), Nature Methods
License: CC-BY
Database: ~14,000 studies, ~500,000 coordinates, 3,300+ terms
Note: This is a meta-analytic database, not patient-specific data.
```

---

## 12. IMPLEMENTATION RECOMMENDATIONS

### 12.1 Development Phases

#### Phase 2a: Basic Integration (Weeks 1-4)

| Task | Priority | Est. Effort |
|------|----------|-------------|
| Download and validate Neurosynth SQLite database | High | 1 day |
| Implement `NeurosynthAdapter` class | High | 3 days |
| Implement coordinate lookup endpoint | High | 2 days |
| Implement sphere-based query endpoint | High | 2 days |
| Implement term lookup endpoint | High | 2 days |
| Implement caveat engine | High | 2 days |
| Build basic display templates | High | 3 days |
| Write unit tests for adapter | High | 2 days |
| Integration test with DeepSynaps API | High | 2 days |

**Deliverable**: Basic Neurosynth integration with caveat-enriched responses

#### Phase 2b: NeuroQuery Overlay (Weeks 5-6)

| Task | Priority | Est. Effort |
|------|----------|-------------|
| Install and validate `neuroquery` package | Medium | 1 day |
| Implement `NeuroQueryAdapter` class | Medium | 2 days |
| Implement semantic search endpoint | Medium | 2 days |
| Build hybrid query (Neurosynth + NeuroQuery) | Medium | 2 days |
| Write integration tests | Medium | 1 day |

**Deliverable**: NeuroQuery semantic search capability

#### Phase 2c: DeepTwin Integration (Weeks 7-8)

| Task | Priority | Est. Effort |
|------|----------|-------------|
| Implement `DeepTwinContextBridge` | High | 3 days |
| Build patient/context separation display | High | 3 days |
| Implement clinical decision tree | High | 2 days |
| Build audit logging system | High | 2 days |
| End-to-end integration testing | High | 2 days |

**Deliverable**: Full DeepTwin integration with context enrichment

#### Phase 2d: Polish & Compliance (Weeks 9-10)

| Task | Priority | Est. Effort |
|------|----------|-------------|
| Security review of all endpoints | High | 2 days |
| Compliance audit of caveat enforcement | High | 2 days |
| Performance optimization | Medium | 3 days |
| Documentation and training materials | Medium | 3 days |
| User acceptance testing | Medium | 2 days |

**Deliverable**: Production-ready integration with compliance documentation

### 12.2 Technical Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Database | SQLite (Neurosynth) | 3.x |
| Python | Python | 3.10+ |
| API Framework | FastAPI | 0.100+ |
| Neuroimaging | NiBabel / Nilearn | Latest |
| NeuroQuery | neuroquery | Latest |
| Testing | pytest | 7.x |
| Documentation | Markdown / OpenAPI | - |

### 12.3 Database Management

```bash
# Download Neurosynth database
wget https://github.com/neurosynth/neurosynth-data/releases/download/...

# Validate database
python -c "
import sqlite3
conn = sqlite3.connect('neurosynth.db')
cursor = conn.cursor()
cursor.execute('SELECT COUNT(*) FROM studies')
print(f'Studies: {cursor.fetchone()[0]}')
cursor.execute('SELECT COUNT(*) FROM vocab')
print(f'Terms: {cursor.fetchone()[0]}')
cursor.execute('SELECT COUNT(*) FROM peaks')
print(f'Coordinates: {cursor.fetchone()[0]}')
conn.close()
"

# Expected output (approximate):
# Studies: 14371
# Terms: 3228
# Coordinates: 525000+
```

### 12.4 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Kubernetes Cluster                          │  │
│  │                                                          │  │
│  │  ┌───────────────┐    ┌───────────────┐                 │  │
│  │  │  API Server   │    │  API Server   │  (Replicas)     │  │
│  │  │  (FastAPI)    │◄──►│  (FastAPI)    │                 │  │
│  │  └───────┬───────┘    └───────┬───────┘                 │  │
│  │          │                    │                          │  │
│  │          └────────┬───────────┘                          │  │
│  │                   │                                      │  │
│  │          ┌────────▼────────┐                             │  │
│  │          │  Neurosynth DB  │  (Read-only, ~1GB)          │  │
│  │          │  (PVC/S3)       │                             │  │
│  │          └─────────────────┘                             │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  Audit Log (Persistent Volume)                   │   │  │
│  │  │  All Neurosynth lookups logged                   │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              DeepSynaps Main Application                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 12.5 Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Coordinate lookup latency | < 100 ms | Local SQLite query |
| Sphere query latency | < 250 ms | Spatial computation |
| Term lookup latency | < 200 ms | Indexed query |
| NeuroQuery semantic search | < 3 s | Python computation |
| Concurrent queries | > 100/s | Read-only database |
| Database load time | < 5 s | On container startup |
| API response size | < 50 KB | Typical association list |

---

## 13. RISKS & MITIGATIONS

### 13.1 Risk Register

#### Risk 1: Reverse Inference Misuse (CRITICAL)

| Attribute | Detail |
|-----------|--------|
| **Description** | A clinician or user incorrectly uses Neurosynth meta-analytic associations to infer a patient's cognitive state, leading to misdiagnosis or inappropriate treatment |
| **Likelihood** | Medium |
| **Impact** | Critical — Patient harm, liability, reputational damage |
| **Detection** | Audit log review, user feedback, incident reports |

**Mitigations**:
1. **System-level block**: Neurosynth data never enters diagnostic pipelines
2. **Mandatory caveats**: Every display includes reverse inference warning
3. **UI enforcement**: User must acknowledge caveats before viewing data
4. **Training**: All users receive training on Neurosynth limitations
5. **Audit logging**: All lookups logged for compliance review
6. **Regular review**: Quarterly audit of Neurosynth usage patterns
7. **Access control**: Role-based access to Neurosynth features

**Residual Risk**: Low (with all mitigations in place)

#### Risk 2: Database Out of Date

| Attribute | Detail |
|-----------|--------|
| **Description** | The Neurosynth database becomes outdated, missing recent studies and findings |
| **Likelihood** | High (database not regularly updated) |
| **Impact** | Medium — Missed associations, incomplete context |

**Mitigations**:
1. **Regular updates**: Quarterly check for database updates
2. **Version tracking**: Database version logged with every query
3. **Fallback to API**: When local DB is outdated, query live API
4. **Clear labeling**: Display database version and last update date
5. **NeuroQuery overlay**: Use NeuroQuery for more current data

**Residual Risk**: Low

#### Risk 3: Performance Degradation

| Attribute | Detail |
|-----------|--------|
| **Description** | Neurosynth queries slow down the DeepSynaps system, degrading user experience |
| **Likelihood** | Low |
| **Impact** | Medium — User frustration, workflow delays |

**Mitigations**:
1. **Local database**: SQLite queries are very fast (< 100ms)
2. **Caching**: Implement Redis cache for common queries
3. **Async loading**: Neurosynth context loads asynchronously
4. **Lazy loading**: Only load when user requests context
5. **Query optimization**: Indexed queries, prepared statements
6. **Monitoring**: Performance metrics and alerting

**Residual Risk**: Very Low

#### Risk 4: Data Integrity Issues

| Attribute | Detail |
|-----------|--------|
| **Description** | Corrupted or modified Neurosynth database produces incorrect associations |
| **Likelihood** | Low |
| **Impact** | High — Incorrect context could mislead clinicians |

**Mitigations**:
1. **Read-only access**: Database is never modified by the application
2. **Checksum validation**: Verify database integrity on load
3. **Immutable storage**: Store database in read-only volume
4. **Version pinning**: Pin specific database version in deployments
5. **Regular validation**: Automated integrity checks
6. **Source verification**: Download only from official Neurosynth repository

**Residual Risk**: Very Low

#### Risk 5: Term Overload / Information Overload

| Attribute | Detail |
|-----------|--------|
| **Description** | Too many associations displayed, causing cognitive overload and potential misinterpretation |
| **Likelihood** | Medium |
| **Impact** | Low-Medium — Confusion, inappropriate term selection |

**Mitigations**:
1. **Smart filtering**: Show top N associations (default: 15)
2. **Confidence gating**: Filter out "insufficient" tier by default
3. **Relevance ranking**: Prioritize clinically relevant terms
4. **Collapsible UI**: Expand/collapse for detailed view
5. **Term categorization**: Group terms by category
6. **Context awareness**: Prioritize terms relevant to clinical indication

**Residual Risk**: Low

#### Risk 6: Regulatory Compliance

| Attribute | Detail |
|-----------|--------|
| **Description** | Neurosynth integration raises regulatory questions about clinical decision support |
| **Likelihood** | Medium |
| **Impact** | High — Regulatory delays, compliance costs |

**Mitigations**:
1. **Clear classification**: Neurosynth data is "contextual enrichment", not decision support
2. **No clinical action**: Neurosynth data cannot trigger clinical decisions
3. **Caveat-first design**: Every display is caveat-enriched
4. **Legal review**: Have regulatory team review integration design
5. **Documentation**: Comprehensive documentation of intended use
6. **IEC/IRB consultation**: Consult with ethics committee if needed

**Residual Risk**: Low

### 13.2 Risk Summary Matrix

| Risk | Severity | Likelihood | Mitigation Strength | Residual |
|------|----------|------------|-------------------|----------|
| Reverse inference misuse | Critical | Medium | High | Low |
| Database out of date | Medium | High | High | Low |
| Performance degradation | Medium | Low | High | Very Low |
| Data integrity issues | High | Low | High | Very Low |
| Information overload | Low-Med | Medium | Medium | Low |
| Regulatory compliance | High | Medium | High | Low |

---

## APPENDIX A: SQL SCHEMA REFERENCE

### A.1 Core Tables

```sql
-- Studies table: Metadata for each included study
CREATE TABLE studies (
    id INTEGER PRIMARY KEY,
    pmid INTEGER UNIQUE,          -- PubMed ID
    doi TEXT,                      -- Digital Object Identifier
    title TEXT,                    -- Article title
    authors TEXT,                  -- Author list
    journal TEXT,                  -- Journal name
    year INTEGER,                  -- Publication year
    abstract TEXT                  -- Article abstract
);

-- Peaks table: Individual activation coordinates
CREATE TABLE peaks (
    id INTEGER PRIMARY KEY,
    study_id INTEGER,             -- Foreign key to studies
    x REAL,                        -- MNI x-coordinate
    y REAL,                        -- MNI y-coordinate
    z REAL,                        -- MNI z-coordinate
    space TEXT DEFAULT 'MNI',     -- Coordinate space
    FOREIGN KEY (study_id) REFERENCES studies(id)
);

-- Vocabulary table: Cognitive/behavioral terms
CREATE TABLE vocab (
    id INTEGER PRIMARY KEY,
    term TEXT UNIQUE,             -- Term text
    frequency INTEGER,             -- Number of studies mentioning term
    category TEXT                  -- Term category (optional)
);

-- Features table: Study-term frequency matrix
CREATE TABLE features (
    study_id INTEGER,             -- Foreign key to studies
    term_id INTEGER,              -- Foreign key to vocab
    frequency REAL,                -- Term frequency in study abstract
    PRIMARY KEY (study_id, term_id),
    FOREIGN KEY (study_id) REFERENCES studies(id),
    FOREIGN KEY (term_id) REFERENCES vocab(id)
);

-- Images table: Statistical association maps
CREATE TABLE images (
    id INTEGER PRIMARY KEY,
    term_id INTEGER,              -- Foreign key to vocab
    voxel_x INTEGER,              -- Voxel x-index
    voxel_y INTEGER,              -- Voxel y-index
    voxel_z INTEGER,              -- Voxel z-index
    z_score REAL,                  -- Association z-score
    p_value REAL,                  -- Association p-value
    study_count INTEGER,          -- Number of studies contributing
    map_type TEXT DEFAULT 'association',  -- Type of statistical map
    FOREIGN KEY (term_id) REFERENCES vocab(id)
);

-- Maps table: Metadata about available maps
CREATE TABLE maps (
    id INTEGER PRIMARY KEY,
    term_id INTEGER,              -- Foreign key to vocab
    map_type TEXT,                 -- Type of map (association, uniformity, etc.)
    file_path TEXT,                -- Path to NIfTI file (if applicable)
    created_at TEXT,              -- Creation timestamp
    FOREIGN KEY (term_id) REFERENCES vocab(id)
);
```

### A.2 Common Queries

```sql
-- Get top terms for a coordinate
SELECT v.term, i.z_score, i.p_value, i.study_count
FROM images i
JOIN vocab v ON i.term_id = v.id
WHERE i.voxel_x = ? AND i.voxel_y = ? AND i.voxel_z = ?
AND i.z_score >= 3.09
ORDER BY i.z_score DESC
LIMIT 20;

-- Get top regions for a term
SELECT i.voxel_x, i.voxel_y, i.voxel_z, 
       i.z_score, i.p_value, i.study_count
FROM images i
JOIN vocab v ON i.term_id = v.id
WHERE v.term = ?
ORDER BY i.z_score DESC
LIMIT 50;

-- Get study count for a term
SELECT COUNT(*) 
FROM features f
JOIN vocab v ON f.term_id = v.id
WHERE v.term = ?;

-- Sphere query (all voxels within radius)
SELECT v.term, AVG(i.z_score) as mean_z, COUNT(*) as voxel_count
FROM images i
JOIN vocab v ON i.term_id = v.id
WHERE SQRT(
    POW((i.voxel_x * 2 - 90) - ?, 2) +
    POW((i.voxel_y * 2 - 126) - ?, 2) +
    POW((i.voxel_z * 2 - 72) - ?, 2)
) <= ?
GROUP BY v.term
ORDER BY mean_z DESC;
```

---

## APPENDIX B: API ENDPOINT REFERENCE

### B.1 Neurosynth REST API

| Endpoint | Method | Description | Parameters |
|----------|--------|-------------|------------|
| `/api/locations/` | GET | List all coordinates | limit, offset |
| `/api/locations/{x}_{y}_{z}/` | GET | Terms at coordinate | x, y, z |
| `/api/locations/{x}_{y}_{z}/studies/` | GET | Studies at coordinate | x, y, z |
| `/api/studies/` | GET | List studies | limit, offset, year |
| `/api/studies/{pmid}/` | GET | Study details | pmid |
| `/api/features/` | GET | List terms | limit, offset |
| `/api/features/{term}/` | GET | Term association map | term |
| `/api/analyses/` | GET | List analyses | - |

### B.2 DeepSynaps Internal API

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/v2/context/coordinate` | GET | Coordinate lookup | Required |
| `/v2/context/sphere` | GET | Sphere query | Required |
| `/v2/context/term` | GET | Term lookup | Required |
| `/v2/context/semantic` | POST | Semantic search | Required |
| `/v2/context/target` | GET | Target context | Required |
| `/v2/context/deeptwin/{target_id}` | GET | DeepTwin enrichment | Required |
| `/v2/audit/log` | GET | Audit log (admin) | Admin |
| `/v2/audit/stats` | GET | Usage statistics | Admin |

### B.3 Request/Response Examples

**Coordinate Lookup**:
```bash
GET /v2/context/coordinate?x=-44&y=36&z=20&radius=6
```

```json
{
  "data_type": "META_ANALYTIC_CONTEXT",
  "coordinate": [-44, 36, 20],
  "associations": [
    {"term": "executive", "z_score": 8.42, "n_studies": 342, "tier": "high"},
    {"term": "working memory", "z_score": 7.88, "n_studies": 287, "tier": "high"}
  ],
  "caveats": { "reverse_inference_warning": "...", ... },
  "provenance": { "source": "Neurosynth", ... },
  "confidence": { "overall": "high", ... }
}
```

---

## APPENDIX C: CODE EXAMPLES

### C.1 Complete Integration Example

```python
"""
Complete example of Neurosynth integration in DeepSynaps.
"""
from deepsynaps.neurosynth import (
    NeurosynthAdapter,
    FunctionalContextService,
    DeepTwinContextBridge,
    DEFAULT_CAVEATS
)

# Initialize the service
service = FunctionalContextService(
    neurosynth_db_path="/data/neurosynth.db",
    enable_neuroquery=True,
    audit_log_path="/logs/neurosynth_audit.log"
)

# Example 1: Get context for a stimulation target
context = service.get_target_context(
    target_name="Left DLPFC",
    target_coordinates=[-44, 36, 20],
    clinical_indication="major_depressive_disorder"
)

print(f"Target: {context['target']['name']}")
print(f"Top associations:")
for assoc in context['functional_associations'][:5]:
    print(f"  {assoc.term}: z={assoc.z_score:.2f}, n={assoc.study_count} ({assoc.confidence_tier})")

# Example 2: Coordinate lookup
result = service.get_context_for_coordinate(-24, -18, -14, top_n=10)

# Example 3: Term lookup
term_result = service.get_context_for_term("working memory")

# Example 4: Semantic search
semantic_result = service.semantic_search("inhibitory control and conflict monitoring")

# Cleanup
service.close()
```

### C.2 FastAPI Endpoint Example

```python
"""
FastAPI endpoints for Neurosynth integration.
"""
from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer

app = FastAPI(title="DeepSynaps Functional Context API")
security = HTTPBearer()

# Initialize service (singleton)
context_service = FunctionalContextService(
    neurosynth_db_path="/data/neurosynth.db",
    enable_neuroquery=True
)

@app.get("/v2/context/coordinate")
async def get_coordinate_context(
    x: float, y: float, z: float,
    radius: float = 6.0,
    top_n: int = 15,
    token: str = Depends(security)
):
    """
    Get functional context for a brain coordinate.
    
    Returns meta-analytic associations with mandatory caveats.
    """
    if not (-90 <= x <= 90 and -126 <= y <= 90 and -72 <= z <= 108):
        raise HTTPException(400, "Coordinates outside valid MNI range")
    
    result = context_service.get_context_for_coordinate(
        x, y, z, radius_mm=radius, top_n=top_n
    )
    
    return {
        "data_type": "META_ANALYTIC_CONTEXT",
        "classification": "RESEARCH_CONTEXT_ONLY",
        **result
    }

@app.get("/v2/context/term")
async def get_term_context(
    term: str,
    token: str = Depends(security)
):
    """Get functional context for a cognitive term."""
    result = context_service.get_context_for_term(term)
    return {
        "data_type": "META_ANALYTIC_CONTEXT",
        "classification": "RESEARCH_CONTEXT_ONLY",
        **result
    }

@app.post("/v2/context/semantic")
async def semantic_search(
    query: str,
    token: str = Depends(security)
):
    """Semantic search using NeuroQuery."""
    result = context_service.semantic_search(query)
    return {
        "data_type": "META_ANALYTIC_CONTEXT",
        "classification": "RESEARCH_CONTEXT_ONLY",
        **result
    }
```

### C.3 React Component for Caveat Display

```tsx
/**
 * React component for displaying Neurosynth data with caveats.
 */
import React from 'react';

interface CaveatBundle {
  reverse_inference_warning: string;
  group_average_warning: string;
  meta_analytic_warning: string;
  non_diagnostic_warning: string;
  research_only_warning: string;
}

interface Association {
  term: string;
  z_score: number;
  study_count: number;
  confidence_tier: 'high' | 'medium' | 'low' | 'insufficient';
}

interface NeurosynthContextDisplayProps {
  targetName: string;
  coordinates: [number, number, number];
  associations: Association[];
  caveats: CaveatBundle;
  onAcknowledge: () => void;
  acknowledged: boolean;
}

export const NeurosynthContextDisplay: React.FC<NeurosynthContextDisplayProps> = ({
  targetName,
  coordinates,
  associations,
  caveats,
  onAcknowledge,
  acknowledged
}) => {
  if (!acknowledged) {
    return (
      <div className="caveat-acknowledgment">
        <div className="warning-banner">
          <h3>⚠️ Meta-Analytic Research Context</h3>
          <p>{caveats.reverse_inference_warning}</p>
          <p>{caveats.group_average_warning}</p>
          <p>{caveats.non_diagnostic_warning}</p>
        </div>
        <button onClick={onAcknowledge}>
          I Understand — Show Context
        </button>
      </div>
    );
  }

  return (
    <div className="neurosynth-context">
      {/* Persistent warning banner */}
      <div className="persistent-warning">
        📋 Research Context Only — Not for Clinical Diagnosis
      </div>
      
      {/* Target info */}
      <h3>{targetName}</h3>
      <p>MNI: ({coordinates[0]}, {coordinates[1]}, {coordinates[2]})</p>
      
      {/* Associations table */}
      <table>
        <thead>
          <tr>
            <th>Term</th>
            <th>Z-Score</th>
            <th>Studies</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {associations.map((assoc, i) => (
            <tr key={i} className={`tier-${assoc.confidence_tier}`}>
              <td>{assoc.term}</td>
              <td>{assoc.z_score.toFixed(2)}</td>
              <td>{assoc.study_count}</td>
              <td>
                <ConfidenceIndicator tier={assoc.confidence_tier} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Reverse inference warning */}
      <div className="reverse-inference-warning">
        <strong>⚠️ Reverse Inference Notice:</strong>
        <p>{caveats.reverse_inference_warning}</p>
      </div>
      
      {/* Attribution */}
      <div className="attribution">
        <p>📊 Source: Neurosynth (neurosynth.org) — Yarkoni et al. (2011)</p>
        <p>License: CC-BY | Data: ~14,000 studies, 3,300+ terms</p>
      </div>
    </div>
  );
};

const ConfidenceIndicator: React.FC<{tier: string}> = ({tier}) => {
  const dots = {
    high: '●●●●●',
    medium: '●●●●○',
    low: '●●●○○',
    insufficient: '●●○○○'
  };
  return <span className={`confidence-${tier}`}>{dots[tier as keyof typeof dots]}</span>;
};
```

---

## APPENDIX D: TERM COVERAGE ANALYSIS

### D.1 High-Frequency Clinical Terms

| Term | Study Count | Z-Score (Peak) | Primary Region |
|------|-------------|----------------|----------------|
| memory | ~2,100 | 15.2 | Hippocampus |
| attention | ~1,800 | 14.8 | Frontoparietal |
| language | ~1,500 | 16.1 | Left IFG/STG |
| emotion | ~1,400 | 18.4 | Amygdala |
| working memory | ~1,200 | 12.3 | DLPFC |
| executive | ~980 | 13.1 | DLPFC |
| motor | ~1,100 | 17.2 | M1/SMA |
| visual | ~2,000 | 19.8 | Occipital |
| pain | ~850 | 16.5 | Insula/ACC |
| depression | ~720 | 11.2 | Subgenual ACC |
| anxiety | ~680 | 12.8 | Amygdala/Insula |
| schizophrenia | ~890 | 10.4 | DLPFC/Temporal |
| reward | ~750 | 14.1 | Striatum/MPFC |
| fear | ~620 | 15.6 | Amygdala |
| social | ~580 | 11.8 | MPFC/TPJ |

### D.2 Term Category Coverage

| Category | Term Count | Clinical Relevance |
|----------|-----------|-------------------|
| Cognitive functions | ~200 | High |
| Clinical conditions | ~200 | High |
| Task paradigms | ~150 | Medium |
| Sensory modalities | ~100 | Medium |
| Anatomical | ~500 | Low (descriptive) |
| Methodological | ~200 | Low |
| Demographic | ~50 | Low |

---

## APPENDIX E: CLINICAL DECISION TREE

### E.1 When to Display Neurosynth Context

```
IS_CLINICIAN_VIEWING_STIMULATION_TARGET?
├── YES → DISPLAY (with caveats)
│   └── Context: Target functional background
│
├── NO → IS_USER_IN_EDUCATION_MODE?
│   ├── YES → DISPLAY (with caveats)
│   │   └── Context: Educational reference
│   │
│   └── NO → IS_USER_CONDUCTING_RESEARCH?
│       ├── YES → DISPLAY (with caveats)
│       │   └── Context: Hypothesis generation
│       │
│       └── NO → BLOCK
│           └── Reason: Not an approved use case
```

### E.2 Caveat Application Matrix

| Use Case | Reverse Inference | Group Average | Meta-Analytic | Non-Diagnostic | Research Only |
|----------|:-----------------:|:-------------:|:-------------:|:--------------:|:-------------:|
| Target context | ✅ | ✅ | ✅ | ✅ | ✅ |
| Education | ✅ | ✅ | ✅ | ✅ | ✅ |
| Hypothesis gen | ✅ | ✅ | ✅ | ✅ | ✅ |
| Protocol design | ✅ | ✅ | ✅ | ✅ | ✅ |
| Clinical research | ✅ | ✅ | ✅ | ✅ | ✅ |
| (All other uses) | BLOCKED | BLOCKED | BLOCKED | BLOCKED | BLOCKED |

---

## REFERENCES

1. Yarkoni, T., Poldrack, R.A., Nichols, T.E., Van Essen, D.C., & Wager, T.D. (2011). Large-scale automated synthesis of human functional neuroimaging data. *Nature Methods*, 8(8), 665-670.

2. Dockès, J., Peltier, J.B., Pinsard, B., Benali, H., & Thirion, B. (2020). NeuroQuery: a unified interface for coordinate- and image-based meta-analysis. *Nature Methods*, 17(8), 827-828.

3. Poldrack, R.A. (2006). Can cognitive processes be inferred from neuroimaging data? *Trends in Cognitive Sciences*, 10(2), 59-63.

4. Poldrack, R.A. (2011). Inferring mental states from neuroimaging data: from reverse inference to large-scale decoding. *Neuron*, 72(5), 692-697.

5. Yarkoni, T. (2009). Big Correlations in Little Studies: Inflated fMRI Correlations Reflect Low Statistical Power. *Perspectives on Psychological Science*, 4(3), 294-298.

6. Eickhoff, S.B., Bzdok, D., Laird, A.R., Kurth, F., & Fox, P.T. (2012). Activation likelihood estimation meta-analysis revisited. *NeuroImage*, 59(3), 2349-2361.

7. Wager, T.D., Lindquist, M., & Kaplan, L. (2007). Meta-analysis of functional neuroimaging data: current and future directions. *Social Cognitive and Affective Neuroscience*, 2(2), 150-158.

8. Fox, P.T., Lancaster, J.L., Laird, A.R., & Eickhoff, S.B. (2014). Meta-analysis in human neuroimaging: computational modeling of large-scale databases. *Annual Review of Neuroscience*, 37, 409-434.

9. Lindquist, M.A. (2008). The statistical analysis of fMRI data. *Statistical Science*, 23(4), 439-464.

10. Ioannidis, J.P. (2005). Why most published research findings are false. *PLoS Medicine*, 2(8), e124.

---

**END OF REPORT**

*Document generated for DeepSynaps Protocol Studio — PHASE 2 Knowledge Layer*
*Classification: Technical Integration Specification*
*Review cycle: Quarterly*
*Next review: [TBD]*
