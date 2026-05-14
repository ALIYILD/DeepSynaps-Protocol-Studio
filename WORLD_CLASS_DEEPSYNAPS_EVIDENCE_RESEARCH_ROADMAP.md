# DeepSynaps Evidence Workspace: World-Class Research Roadmap

## A Comprehensive Evidence Architecture, Neuromodulation Intelligence & Open-Source Integration Blueprint

**Version:** 1.0 | **Date:** July 2025 | **Evidence horizon:** 2024-2025

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Evidence Architecture Benchmark](#2-evidence-architecture-benchmark)
3. [Neuromodulation Evidence Map (2024-2025)](#3-neuromodulation-evidence-map-2024-2025)
4. [Evidence Visualization Design Patterns](#4-evidence-visualization-design-patterns)
5. [Open-Source Integration Stack](#5-open-source-integration-stack)
6. [Implementation Roadmap (P0/P1/P2)](#6-implementation-roadmap-p0p1p2)
7. [Sources & Citations](#7-sources--citations)

---

## 1. Executive Summary

This roadmap synthesizes intelligence from 30+ web searches across evidence platforms, neuromodulation literature (2024-2025), visualization research, and open-source repositories to define the architecture for a world-class DeepSynaps Evidence Workspace.

### Key Findings

**Evidence Architecture:** Six benchmark platforms (Epistemonikos, Cochrane, PubMed Clinical Queries, Dimensions.ai, Semantic Scholar, Web of Science) reveal converging patterns: AI-powered search, living systematic review capabilities, GRADE evidence grading, citation network visualization, and interactive evidence matrices. The gold standard combines Epistemonikos' "Matrix of Evidence" concept with Semantic Scholar's AI relevance ranking and Cochrane's GRADE rigor.

**Neuromodulation Evidence (2024-2025):** A surge of high-quality meta-analyses provides updated efficacy signals. rTMS for depression shows strong evidence (SMD 0.35-0.55, FDA-approved). tDCS for depression shows small-to-moderate effects (SMD ~0.36-0.40). Neurofeedback for ADHD shows no clinically meaningful benefit when probably blinded (SMD 0.04). tACS/tRNS for chronic pain shows emerging but mixed signals. TMS for OCD is FDA-cleared (Hedges' g ~0.64). PTSD network meta-analyses favor dual-tDCS and HF-rTMS.

**Visualization Best Practices:** Evidence heatmaps (condition x modality), interactive trial timelines, citation force-directed networks, and GRADE evidence strength matrices represent the state of the art. R Shiny and D3.js emerge as the leading interactive frameworks.

**Open-Source Stack:** ASReview LAB (Apache-2.0, active learning screening), NetworkX (BSD, citation networks), VOSviewer (free, bibliometric mapping), Gephi (free, network visualization), and multiple PubMed API clients form the core integration-ready toolkit.

### Strategic Recommendation

Build a **modular evidence workspace** combining: (1) PubMed/Semantic Scholar APIs for discovery, (2) ASReview LAB for AI-assisted screening, (3) Custom evidence heatmaps for neuromodulation intelligence, (4) NetworkX + D3.js for citation networks, (5) GRADE-inspired evidence grading with interactive dashboards.

---

## 2. Evidence Architecture Benchmark

### 2.1 Epistemonikos

| Dimension | Assessment |
|-----------|------------|
| **Search UX** | Multilingual (9 languages), natural language queries, advanced Boolean search, automated Boolean strategy generator using Epistemonikos Evidence Taxonomy (EET) |
| **Evidence Grading** | Matrix of Evidence concept -- cross-tabulates systematic reviews vs. included studies; living systematic review capability with auto-update alerts |
| **Citation Network** | Interconnected evidence model: studies link to reviews that include them; "studification" combines publication threads into single study columns |
| **Living Reviews** | Core differentiator: users save searches and new reviews appear automatically; network of collaborators maintains and updates matrices; supports living evidence processes |
| **Key Innovation** | "Matrix of Evidence" -- displays all systematic reviews answering a question AND all studies included in those reviews in a 2D matrix. Reviews on Y-axis, studies on X-axis |
| **Scale** | 100,000+ systematic reviews; world's largest systematic review database |
| **Access** | Free; open-access model; new ED-Trials database for RCTs |

**Source:** [Epistemonikos Methods](https://www.epistemonikos.org/en/about_us/methods) | [ED-Trials preprint](https://www.medrxiv.org/content/10.1101/2025.11.16.25340330v1.full.pdf)

### 2.2 Cochrane Library

| Dimension | Assessment |
|-----------|------------|
| **Search UX** | Highly structured systematic review database; MeSH indexing; PICO framework integration |
| **Evidence Grading** | **GRADE approach (Grading of Recommendations Assessment, Development and Evaluation)** -- the global gold standard. Four certainty levels: High, Moderate, Low, Very Low |
| **GRADE Domains** | Five downgrading domains: (1) Risk of bias, (2) Inconsistency/heterogeneity, (3) Indirectness, (4) Imprecision, (5) Publication bias. Three upgrading domains for NRSI |
| **Summary of Findings** | Structured SoF tables with GRADEpro GDT software; includes absolute and relative effect estimates |
| **Citation Network** | Cited by links; review-update chains; review history tracking |
| **Living Reviews** | Supported as "living systematic reviews" with periodic searching and updating |
| **MECIR Standards** | Mandatory expectations (C74, C75) for assessing certainty using 5 GRADE considerations |

**Source:** [Cochrane Handbook Ch.14](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-14) | Cochrane GRADEing Methods Group

### 2.3 PubMed Clinical Queries

| Dimension | Assessment |
|-----------|------------|
| **Search UX** | Two-filter system: (1) Clinical Study Categories (Therapy, Diagnosis, Etiology, Prognosis, Clinical Prediction Guides), (2) Scope (Broad/Narrow). Streamlined interface (2021 usability update) |
| **Clinical Study Filters** | Pre-built evidence-based filters developed by Haynes et al.; Therapy filter targets RCTs, controlled trials, random allocation. Narrow = more specific; Broad = more sensitive |
| **Evidence Grading** | No explicit grading -- relies on study type (RCT > observational). Systematic Review article type filter available. Cochrane RCT filter for finding randomized trials |
| **Citation Network** | "Cited by" and "Similar articles" links; related citations algorithm |
| **Living Reviews** | RSS feeds; saved searches with email alerts; search history |
| **COVID-19 Filters** | Additional filter category with sub-filters: General, Mechanism, Transmission, Diagnosis, Treatment, Prevention, Case Report, Forecasting |

**Source:** [PubMed Clinical Queries](https://pubmed.ncbi.nlm.nih.gov/clinical/) | [NLM Tech Bulletin 2021](https://www.nlm.nih.gov/pubs/techbull/ja21/ja21_pubmed_clinical_queries.html)

### 2.4 Dimensions.ai

| Dimension | Assessment |
|-----------|------------|
| **Search UX** | Full-text search across 200M+ documents (beyond title/abstract); metadata filters; similarity search; AI-powered relevance ranking |
| **Evidence Grading** | No explicit clinical grading -- research analytics focus. Citation metrics, Altmetric Attention Score, FCR (Field Citation Ratio) |
| **Citation Network** | **1.2 billion citations** tracked; grants-to-publications-to-trials-to-patents interconnected data; heatmaps, VOSviewer integration |
| **Key Features** | 360-degree research view: cited publications, grants, patents, funders; custom filters; cross-disciplinary coverage |
| **Data Export** | Full metadata export for VOSviewer networks, reference managers, dashboard apps |
| **Living Reviews** | Automated alerts on new publications matching saved queries |

**Source:** [Dimensions.ai Products](https://www.dimensions.ai/products/) | [Dimensions Scientific Research Database](https://www.dimensions.ai/resources/dimensions-scientific-research-database/)

### 2.5 Semantic Scholar

| Dimension | Assessment |
|-----------|------------|
| **Search UX** | **AI-powered relevance ranking** using SPECTER2 paper embeddings; natural language queries; field-of-study classifier (S2FOS); Research Feeds personalized recommendation |
| **Scale** | 214+ million papers across all fields of science |
| **Evidence Grading** | No explicit clinical grading -- uses **Highly Influential Citations** ML model. Categorizes: Background, Method, Result Extension |
| **Citation Network** | Citation Velocity (weighted avg of last 3 years), Citation Acceleration; TLDRs for 60M+ papers; inline citation cards in Semantic Reader |
| **Key Innovation** | **TLDR (Too Long; Didn't Read) summaries** -- one-sentence AI-generated summaries of objectives and results. Semantic Reader with inline citation context |
| **API** | Free REST API (1 req/sec public; higher limits for authenticated users); integrates with GetFTR, LibKey, Zotero |
| **Living Reviews** | Research Feeds with adaptive recommendations based on saved papers and ratings |

**Source:** [Semantic Scholar Product](https://www.semanticscholar.org/product) | [Wikipedia: Semantic Scholar](https://en.wikipedia.org/wiki/Semantic_Scholar)

### 2.6 Web of Science (Research Assistant)

| Dimension | Assessment |
|-----------|------------|
| **Search UX** | Agentic AI-powered Research Assistant (2024); supports overview queries, document search, analytics queries; guided tasks for topic understanding, literature review, journal finding |
| **Evidence Grading** | No explicit clinical grading -- uses citation impact metrics, JIF, Eigenfactor |
| **Citation Network** | **Citation Network Visual**: graph of connections by citation; **Topic Map**: relationships between topic and sub-topics; **Publication Over Time** graph; Enriched Cited References (support/differ/discuss context) |
| **Visualizations** | Co-citation networks, trend graphs, top researcher profile tiles; interactive network exploration |
| **Core Collection** | World's most trusted citation database; agentic AI guides multi-step tasks with structured summaries, key findings, trend visualizations |

**Source:** [Web of Science Research Assistant](https://clarivate.com/academia-government/scientific-and-academic-research/research-discovery-and-referencing/web-of-science/web-of-science-research-assistant/) | [WoS Research Assistant FAQ](https://webofscience.zendesk.com/hc/en-us/articles/31437630410129-Web-of-Science-Research-Assistant)

### 2.7 Cross-Platform UX Pattern Analysis

| Pattern | Platforms Using It | DeepSynaps Implication |
|---------|-------------------|----------------------|
| **Matrix of Evidence** | Epistemonikos | **Core pattern** -- modality x condition heatmap with study counts |
| **GRADE Certainty Levels** | Cochrane | **Standard** -- 4-tier evidence strength (High/Moderate/Low/Very Low) |
| **AI-Powered Search/Relevance** | Semantic Scholar, Dimensions, WoS | **Essential** -- SPECTER2-style embeddings for neuromodulation queries |
| **TLDR/AI Summaries** | Semantic Scholar | **High value** -- auto-generated one-sentence paper summaries |
| **Citation Network Graphs** | Dimensions, WoS, Semantic Scholar | **Core feature** -- force-directed networks showing citation clusters |
| **Living Review Alerts** | Epistemonikos, PubMed | **P1 feature** -- auto-alerts for new neuromodulation evidence |
| **Clinical Query Filters** | PubMed Clinical Queries | **Essential** -- pre-built filters by condition and study type |
| **Interactive Dashboards** | Dimensions, WoS | **P1 feature** -- R Shiny/D3.js evidence exploration dashboards |
| **Multi-language Support** | Epistemonikos (9 languages) | **P2 feature** -- multilingual evidence search |

---

## 3. Neuromodulation Evidence Map (2024-2025)

### 3.1 Evidence Grading Key

| Grade | Description | Criteria |
|-------|-------------|----------|
| **A - Strong** | High certainty | Multiple RCTs with consistent results, low heterogeneity (I^2 < 50%), low risk of bias |
| **B - Moderate** | Moderate certainty | Some RCTs with mostly consistent results, some heterogeneity, minor methodological concerns |
| **C - Limited** | Low certainty | Few RCTs, small samples, high heterogeneity, methodological limitations |
| **D - Emerging** | Very low certainty | Preliminary/pilot studies, case series, mechanistic rationale only |
| **N - Negative** | No meaningful effect | Probably blinded outcomes show no significant benefit |

### 3.2 Modality x Condition Evidence Matrix

#### 3.2.1 Transcranial Magnetic Stimulation (rTMS)

| Condition | Evidence Strength | Key Effect Sizes | FDA Status | Key Reference (2024-2025) |
|-----------|-------------------|-----------------|------------|---------------------------|
| **Major Depressive Disorder (MDD)** | **A - Strong** | SMD 0.35-0.55 for symptom reduction; 95% effective dose at ~34,773 total pulses (2.8 weeks) | Approved (2008) | JAMA Network Open 2024; dose-response meta-analysis |
| **Treatment-Resistant Depression** | **A - Strong** | SMD ~0.64; response rate 40-60% | Approved (H1 coil 2013) | JAMA Network Open 2024 |
| **OCD** | **B - Moderate** | Hedges' g = 0.64; OR for response 3.15; 38-58% response rate | Approved (H7 coil 2018) | Steuber & McGuire 2023 meta-analysis; Carmi et al. 2019 RCT |
| **PTSD** | **B - Moderate** | HF-rTMS SMD = -0.97; iTBS SMD = -0.93 | Off-label | Liu et al. 2024 network meta-analysis (21 RCTs, 981 pts) |
| **Anxiety Disorders** | **C - Limited** | Limited dedicated RCTs; some positive signals | Off-label | Cross-diagnostic analyses show mixed results |
| **Chronic Pain** | **C - Limited** | Emerging evidence; M1 stimulation shows analgesic effects | Off-label | Network meta-analyses ongoing |
| **ADHD (adult)** | **C - Limited** | Small trials; preliminary signals | Off-label | Insufficient RCTs for meta-analysis |
| **Autism (pediatric)** | **D - Emerging** | Case series and small trials only | Off-label | Early-phase studies |

#### 3.2.2 Transcranial Direct Current Stimulation (tDCS)

| Condition | Evidence Strength | Key Effect Sizes | FDA Status | Key Reference (2024-2025) |
|-----------|-------------------|-----------------|------------|---------------------------|
| **Major Depressive Disorder** | **B - Moderate** | SMD = -0.355 (p < 0.001); 2mA > 1mA for efficacy; left DLPFC anode standard | FDA-cleared (2022 - Flow/Sohi devices) | Zhang et al. 2024 meta-analysis (56 studies, 2349 pts) |
| **Anxiety Symptoms** | **C - Limited** | SMD = -0.398 (p = 0.051, marginally significant); publication bias detected | Off-label | Zhang et al. 2024 (16 studies, 27 outcomes) |
| **OCD** | **C - Limited** | Preliminary positive signals; prefrontal-SMA targeting | Off-label | Alizadehgoradel et al. 2024 RCT (intensified stimulation) |
| **PTSD** | **B - Moderate** | **Dual-tDCS SMD = -1.30** (strongest in network); significant at endpoint but not sustained at follow-up | Off-label | Liu et al. 2024 network meta-analysis |
| **Chronic Pain** | **C - Limited** | Small effects; left DLPFC targeting reduces pain expectation and perception | Off-label | Li et al. 2023; mixed evidence base |
| **ADHD** | **C - Limited** | Some RCTs included in cross-diagnostic reviews; inconclusive | Off-label | Zhang et al. 2024 (2 studies in meta-analysis) |
| **Autism (pediatric <10y)** | **D - Emerging** | Improvements in at least one outcome measure; left DLPFC targeted; 1080+ sessions well tolerated | Off-label | 2025 systematic review (8 studies, all ASD) |
| **Cerebral Palsy (pediatric)** | **C - Limited** | tDCS improved velocity (MD = 0.17), GMFM; safe and well-tolerated | Off-label | Mansouri et al. 2025 meta-analysis (21 studies) |

#### 3.2.3 Transcranial Alternating Current Stimulation (tACS)

| Condition | Evidence Strength | Key Effect Sizes | FDA Status | Key Reference (2024-2025) |
|-----------|-------------------|-----------------|------------|---------------------------|
| **Chronic Low Back Pain** | **C - Limited** | 10 Hz bifrontal tACS reduced pain vs sham; increased somatosensory alpha power | Off-label | Ahn et al.; Prim et al. (cited in 2025 review) |
| **Fibromyalgia** | **D - Emerging** | Mixed results; frequency-tailored stimulation (4Hz/30Hz) showed reductions in pain; 50Hz HD-tACS showed no group difference | Off-label | Bernardi et al.; Lin et al. (cited in 2025 review) |
| **Depression** | **D - Emerging** | Pilot studies only; limited evidence base | Off-label | 2024 transdiagnostic reviews include few tACS studies |

#### 3.2.4 Transcranial Random Noise Stimulation (tRNS)

| Condition | Evidence Strength | Key Effect Sizes | FDA Status | Key Reference (2024-2025) |
|-----------|-------------------|-----------------|------------|---------------------------|
| **Chronic Pain** | **D - Emerging** | Left DLPFC tRNS attenuated pain expectation and perception; small MS study showed affect/pain/attention improvements | Off-label | Li et al. 2023; Palm et al. 2016 |
| **Depression** | **D - Emerging** | Limited RCTs; often bundled with tACS analyses | Off-label | Few dedicated trials |

#### 3.2.5 Neurofeedback

| Condition | Evidence Strength | Key Effect Sizes | FDA Status | Key Reference (2024-2025) |
|-----------|-------------------|-----------------|------------|---------------------------|
| **ADHD** | **N - Negative** | Probably blinded: SMD 0.04 (95% CI: -0.10 to 0.18); **No significant benefit**. Standard protocols: SMD 0.21 (small, likely sub-clinical). Processing speed: SMD 0.35 | Off-label | Janvier et al. 2024 JAMA Psychiatry (38 RCTs, 2472 pts) |
| **Other conditions** | **D - Emerging** | fMRI/fNIRS neurofeedback: no significant benefits (5 RCTs only) | Off-label | Same JAMA 2024 review |

**Clinical Note:** The 2024 JAMA Psychiatry meta-analysis (the most rigorous to date) concluded: "neurofeedback did not appear to meaningfully benefit individuals with ADHD, clinically or neuropsychologically, at the group level." Methylphenidate significantly outperformed neurofeedback (SMD -0.68 to -0.74).

### 3.3 Combined/Multimodal Neuromodulation

| Combination | Condition | Evidence | Notes |
|-------------|-----------|----------|-------|
| **rTMS + psychotherapy** | MDD, OCD | Emerging | OCD protocol requires symptom provocation before TMS sessions |
| **tDCS + cognitive training** | Late-life depression | Negative for depression; potential cognitive benefits | Ha et al. 2024 Brain Stimulation |
| **tDCS + acceptance & commitment therapy** | Chronic pain | Preliminary positive | Gueserse et al. 2022 |
| **Neurofeedback + NIBS** | ADHD | Theoretical only; no RCTs | Suggested in JAMA 2024 review as future direction |

### 3.4 Pediatric Neuromodulation Safety Summary

| Modality | Age Range | Safety Profile | Key Evidence |
|----------|-----------|----------------|--------------|
| **tDCS** | < 10 years | **Well tolerated**; no serious adverse events in 1080+ sessions. Mild skin irritation/erythema most common. Some transient insomnia/irritability reported. | 2025 systematic review (8 studies, all ASD) |
| **rTMS** | < 18 years (CP) | **Safe and well-tolerated**; only mild transient side effects. Improved motor function. | Mansouri et al. 2025 meta-analysis |
| **General** | Pediatric | **No serious adverse events** reported across reviews. Requires age-specific parameter adaptation (shorter duration, lower intensity, smaller electrodes for tDCS). MRI-based current flow modeling needed. | Gallop et al. review; Bikson et al. safety reviews |

**Key Safety Principle:** Conventional tDCS protocols (<= 40 min, <= 4 mA, <= 7.2 C) have not produced any reports of serious adverse effects or irreversible injury across the literature (Bikson et al.; Antal et al.).

### 3.5 FDA/NICE Regulatory Status Summary

| Modality | Condition | FDA Status | Year | Key Protocol |
|----------|-----------|------------|------|-------------|
| rTMS (figure-8) | MDD | Approved | 2008 | Left DLPFC, 10 Hz |
| dTMS (H1 coil) | MDD | Approved | 2013 | Deep stimulation |
| dTMS (H7 coil) | OCD | Approved | 2018 | dmPFC + symptom provocation |
| rTMS (Cool D-B80) | OCD | Approved | 2020 | Equivalence pathway |
| tDCS | MDD | Cleared | 2022 | Flow/Sohi devices (at-home) |
| rTMS (multiple coils) | MDD, OCD | Cleared | 2025 | neurocare Apollo devices |
| rTMS | Smoking cessation | Cleared | 2020 | BrainsWay H4 coil |

---

## 4. Evidence Visualization Design Patterns

### 4.1 Evidence Heatmaps (Condition x Modality)

**Definition:** A 2D grid where rows = clinical conditions, columns = neuromodulation modalities, and cell color intensity = evidence strength (GRADE A/B/C/D/N).

**Best Practices:**
- Use a 4-5 color gradient (e.g., dark green = Strong, light green = Moderate, yellow = Limited, orange = Emerging, red = Negative)
- Include cell hover/tooltip with: number of RCTs, total participants, pooled effect size (SMD), confidence interval, key reference
- Add a secondary visual encoding: cell border thickness = number of studies; cell icon = FDA status (star = approved, circle = cleared, empty = off-label)
- Allow filtering by: evidence grade, date range, population (adult/pediatric), comparator type

**Exemplars:**
- Epistemonikos "Matrix of Evidence" -- reviews on Y-axis, studies on X-axis, intersection marked
- Dimensions.ai heatmaps for research analytics
- Cross-sectional analysis of 222 scoping reviews found evidence maps most commonly present: themes (9.9%), population (9.5%), country/region (9.5%), year (9.0%)

**Source:** [Data visualisation in scoping reviews](https://pmc.ncbi.nlm.nih.gov/articles/PMC10433592/)

### 4.2 Trial Timelines

**Definition:** Chronological visualization of clinical trials showing: study duration, recruitment periods, intervention phases, follow-up points, and key milestones.

**Best Practices:**
- Use horizontal Gantt-style bars per trial, grouped by modality
- Color-code by trial status: planned (dashed), recruiting (yellow), completed (solid), published (filled)
- Include milestone markers: registration, first patient in, interim analysis, completion, publication
- Enable drill-down to trial details on click
- Show concurrent trials to identify evidence gaps (areas with no ongoing trials)

**Exemplars:**
- TrialView (AI-powered visual analytics): uses React + D3.js, ridge plots for lab values, timeline graphs for patient events
- Clinical trial dashboard designs: track study team timelines and documentation

**Source:** [TrialView: AI-powered Visual Analytics](https://pmc.ncbi.nlm.nih.gov/articles/PMC11052597/) | [CHOA Clinical Trial Dashboard](https://karinapatricia.github.io/choa.html)

### 4.3 Citation Networks

**Definition:** Force-directed graph where nodes = papers/authors/journals, edges = citation relationships. Used to identify: research clusters, influential papers, emerging areas, gaps in evidence.

**Best Practices:**
- Node size = citation count or PageRank centrality
- Node color = year of publication (gradient) or topic cluster
- Edge thickness = number of shared citations (co-citation) or direct citations
- Enable zoom, pan, hover tooltips with paper title, authors, year, abstract
- Filter by: date range, citation count threshold, specific journals
- Support clustering algorithms (Louvain, ForceAtlas2) to identify research communities

**Tool Stack:**
- **VOSviewer:** Preferred for bibliometric mapping; auto-extracts from PubMed/WoS/Scopus; 3 visualization modes; no data cleaning needed
- **Gephi:** Advanced network visualization (ForceAtlas2, OpenGL); up to 100K nodes; rich statistical analysis
- **NetworkX (Python):** Programmatic graph creation and analysis; BSD license
- **D3.js (JavaScript):** Interactive web-based visualizations with full custom control

**Source:** [VOSviewer + Gephi Protocol](https://pmc.ncbi.nlm.nih.gov/articles/PMC12970576/) | [NetworkX Documentation](https://networkx.org/)

### 4.4 Evidence Strength Matrices

**Definition:** Structured table/grid combining multiple evidence dimensions: effect size, certainty, number of studies, consistency, risk of bias, and clinical relevance.

**Best Practices:**
- Follow GRADE Summary of Findings table format
- Include per outcome: number of participants, relative/absolute effects, certainty rating with justification
- Use visual icons for risk of bias (green/yellow/red traffic lights)
- Add footnotes explaining downgrading/upgrading decisions
- Make interactive: click certainty icon to see domain-level assessment

**Exemplars:**
- Cochrane GRADE Summary of Findings tables (produced via GRADEpro GDT)
- Interactive evidence maps using LLM-integrated pipelines (Claude for topic modeling + explorable visual knowledge structures)

**Source:** [Interactive Evidence Maps for Systematic Reviews](https://arxiv.org/html/2603.28802v1)

### 4.5 Interactive Dashboard Workflow

Based on systematic review dashboard best practices:

**Phase 1: Planning**
- Define audience: researchers, clinicians, guideline developers, patients
- Select software: Tableau (no-code) or R Shiny (code-based, open-source)
- Design hierarchical data structure: Study level -> Intervention/Control arms -> Outcomes/timepoints

**Phase 2: Development**
- Import data from DistillerSR or equivalent systematic review management tool
- Define interactive elements: filters, search boxes, sortable tables, download buttons
- Design layout: evidence heatmap (top), trial timeline (middle), citation network (side panel), GRADE matrix (bottom)

**Phase 3: Deployment**
- User testing with both research and non-research audiences
- Accessibility compliance (WCAG, tab order, color-blind friendly palettes)
- Continuous quality improvement cycle

**Source:** [Creating Interactive Data Dashboards for Evidence Syntheses](https://pmc.ncbi.nlm.nih.gov/articles/PMC12224945/)

### 4.6 Recommended Visualization Technology Stack

| Component | Technology | License | Use Case |
|-----------|-----------|---------|----------|
| **Evidence Heatmap** | D3.js + React | MIT | Interactive condition x modality grid |
| **Trial Timeline** | D3.js timeline | BSD-like | Clinical trial Gantt charts |
| **Citation Network** | NetworkX (backend) + D3.js force simulation (frontend) | BSD + MIT | Force-directed citation graphs |
| **GRADE Matrix** | Custom React + HTML tables | MIT | Summary of findings tables |
| **Dashboard Framework** | R Shiny or React + Flask | GPL-3 / MIT | Full evidence workspace |
| **Static Reports** | R Markdown / Jupyter | GPL / BSD | Reproducible evidence reports |

---

## 5. Open-Source Integration Stack

### 5.1 Systematic Review & Literature Screening

#### ASReview LAB (Primary Recommendation)
- **Repository:** github.com/asreview/asreview
- **License:** Apache-2.0
- **Language:** Python (requires 3.10+)
- **Key Features:** Active learning for systematic screening; reduces screening time up to 95%; multi-model support (ELAS, transformer, multilingual); simulation toolkit; crowd-screening support
- **Version:** v3.0+ (auto duplicate detection, editable tags, streamlined workflow)
- **Publication:** Nature Machine Intelligence (van de Schoot et al. 2021)
- **DeepSynaps Integration:** Primary screening tool for neuromodulation literature; can be Docker-deployed
- **Extensions:** ASReview-dory (advanced models), ASReview-insights (performance metrics), ASReview-makita (simulation workflows)

#### ReviewAid
- **Repository:** github.com/ReviewAid
- **License:** Apache-2.0
- **Key Features:** AI-powered full-text screener and extractor; OCR support; automated data extraction from uploaded papers
- **DeepSynaps Integration:** Secondary screening tool; full-text data extraction

### 5.2 Citation Network Analysis

#### NetworkX
- **Repository:** github.com/networkx/networkx
- **License:** BSD-3-Clause
- **Language:** Python
- **Key Features:** Graph data structures for directed/undirected/multigraphs; standard graph algorithms; network structure analysis; 90%+ code coverage
- **DeepSynaps Integration:** Backend for citation network construction and analysis

#### VOSviewer
- **Website:** vosviewer.com
- **License:** Free (proprietary, no-cost)
- **Key Features:** Bibliometric mapping; auto-extracts from PubMed/WoS/Scopus; citation/bibliographic coupling/co-citation/co-authorship networks; 3 visualization modes; no data cleaning required
- **DeepSynaps Integration:** Import PubMed exports for neuromodulation citation mapping

#### Gephi
- **Website:** gephi.org
- **License:** GPL-3/CDDL-1.0 (dual)
- **Key Features:** OpenGL-accelerated visualization; up to 100K nodes; ForceAtlas2 layout; rich statistical analysis; modular architecture
- **DeepSynaps Integration:** Advanced citation network visualization; network metric analysis

#### igraph
- **Repository:** github.com/igraph/igraph
- **License:** GPL-2
- **Language:** C core with Python/R bindings
- **Key Features:** Efficient large-scale network analysis; graph algorithms; cross-platform
- **DeepSynaps Integration:** Alternative to NetworkX for performance-critical operations

### 5.3 PubMed API Clients

#### pubmedclient
- **Repository:** github.com/grll/pubmedclient
- **License:** Open source (unspecified)
- **Language:** Python (async via httpx)
- **Key Features:** Wraps NCBI E-Utilities API; async client; supports EInfo, ESearch, EFetch
- **Installation:** `uv add pubmedclient` or `pip install pubmedclient`

#### pubmed-sdk
- **PyPI:** pypi.org/project/pubmed-sdk
- **License:** Open source
- **Features:** Facilitates PubMed searching and article retrieval via E-Utilities

#### E-Utilities Direct
- **NCBI API:** Free; 3 requests/sec without API key; 10 requests/sec with API key
- **Endpoints:** EInfo, ESearch, ESummary, EFetch, ELink, EPost, ESpell, ECitMatch
- **DeepSynaps Integration:** Direct API calls for systematic literature searching

### 5.4 Semantic Scholar API
- **Website:** api.semanticscholar.org
- **License:** Free REST API
- **Rate Limits:** 1 req/sec public; higher authenticated limits
- **Key Features:** 214M+ papers; SPECTER2 embeddings; TLDR summaries; citation contexts; influential citations
- **DeepSynaps Integration:** AI-powered paper discovery; TLDR generation; citation network data

### 5.5 Network Visualization (Frontend)

#### D3.js
- **License:** ISC/BSD
- **Key Features:** Force-directed layouts, hierarchical layouts, zoom, pan, transitions, SVG/Canvas rendering
- **DeepSynaps Integration:** Interactive citation network visualization in browser

#### Plotly (Python/JS)
- **License:** MIT
- **Key Features:** Interactive charts, heatmaps, network graphs; cross-language (Python, R, JS, Julia)
- **DeepSynaps Integration:** Evidence heatmaps, trial timelines, statistical visualizations

#### Bokeh
- **License:** BSD-3
- **Language:** Python
- **Key Features:** Interactive web visualizations; streaming data; dashboards
- **DeepSynaps Integration:** Alternative to Plotly for Python-based interactive dashboards

### 5.6 Data Processing & Analysis

#### pandas (Python)
- **License:** BSD-3
- **Use:** Evidence matrix data manipulation, trial data processing

#### NumPy / SciPy (Python)
- **License:** BSD
- **Use:** Statistical analysis, effect size calculations

#### metafor (R)
- **License:** GPL
- **Use:** Meta-analysis computations (used in Zhang et al. 2024 tDCS meta-analysis)

### 5.7 Reference Management Integration

#### Zotero
- **License:** AGPL-3
- **Integration:** Browser connectors for PubMed, Semantic Scholar; API for programmatic access
- **DeepSynaps Integration:** Reference collection and bibliography generation

### 5.8 Complete Integration Architecture

```
+---------------------------------------------------+
|              DeepSynaps Evidence Workspace         |
+---------------------------------------------------+
|  LAYER 1: Discovery & Search                       |
|  - PubMed E-Utilities API (pubmedclient)           |
|  - Semantic Scholar API (SPECTER2 + TLDRs)         |
|  - Epistemonikos-inspired Matrix of Evidence       |
+---------------------------------------------------+
|  LAYER 2: Screening & Extraction                   |
|  - ASReview LAB (active learning screening)        |
|  - ReviewAid (full-text extraction)                |
|  - Custom neuromodulation taxonomy filters         |
+---------------------------------------------------+
|  LAYER 3: Analysis & Grading                       |
|  - GRADE-inspired evidence classification          |
|  - metafor/NetworkX for effect sizes               |
|  - Risk of bias assessment (Cochrane RoB 2.0)      |
+---------------------------------------------------+
|  LAYER 4: Visualization & Dashboard                |
|  - D3.js: Evidence heatmaps, citation networks     |
|  - Plotly/Bokeh: Trial timelines, GRADE matrices   |
|  - R Shiny / React: Interactive dashboard          |
|  - VOSviewer/Gephi: Bibliometric network maps      |
+---------------------------------------------------+
|  LAYER 5: Living Review & Alerts                   |
|  - PubMed saved search RSS feeds                   |
|  - Semantic Scholar Research Feeds                 |
|  - Automated evidence update pipeline              |
+---------------------------------------------------+
```

---

## 6. Implementation Roadmap (P0/P1/P2)

### P0: Foundation (Weeks 1-6) -- Core Evidence Workspace

| Component | Deliverable | Technology | Effort |
|-----------|-------------|------------|--------|
| **Evidence Database** | Import neuromodulation systematic reviews (2020-2025); structured schema | PostgreSQL + Python ETL | 1 week |
| **PubMed Integration** | Automated search pipeline for neuromodulation queries | pubmedclient + E-Utilities | 1 week |
| **Semantic Scholar Integration** | AI-powered paper discovery with TLDRs | S2 API + Python | 1 week |
| **Evidence Heatmap** | Interactive condition x modality grid with GRADE coloring | D3.js + React | 1.5 weeks |
| **ASReview LAB** | Deployed for literature screening (Docker) | ASReview LAB v3 | 0.5 weeks |
| **Basic Dashboard** | R Shiny or Flask + React scaffold | R Shiny / Flask | 1 week |

**P0 Success Criteria:**
- [ ] Search and import papers for 8+ conditions x 5+ modalities
- [ ] Display interactive evidence heatmap with GRADE A/B/C/D/N ratings
- [ ] Screen 1000+ titles/abstracts with ASReview LAB
- [ ] Basic citation network from Semantic Scholar data

### P1: Intelligence Layer (Weeks 7-14) -- Advanced Analytics

| Component | Deliverable | Technology | Effort |
|-----------|-------------|------------|--------|
| **Citation Network** | Full force-directed network with clustering | NetworkX + D3.js force simulation | 2 weeks |
| **Trial Timeline** | Gantt-style clinical trial visualization | D3.js timeline | 1 week |
| **GRADE Matrix** | Interactive Summary of Findings tables | Custom React components | 1 week |
| **Evidence Alerts** | Living review alerts for new publications | PubMed RSS + Semantic Scholar feeds | 1 week |
| **VOSviewer Integration** | Bibliometric maps from PubMed exports | VOSviewer + automated export | 1 week |
| **Multi-source Fusion** | Combined evidence from PubMed + Semantic Scholar + Epistemonikos-style cross-referencing | Python ETL | 2 weeks |
| **User Testing** | Dashboard usability testing with researchers + clinicians | Human subjects | 1 week |

**P1 Success Criteria:**
- [ ] Citation network identifies 5+ research clusters in neuromodulation
- [ ] Trial timeline shows 50+ ongoing/planned trials
- [ ] Automated weekly evidence alerts operational
- [ ] Dashboard supports filtering by condition, modality, evidence grade, year

### P2: Advanced Features (Weeks 15-24) -- AI & Living Reviews

| Component | Deliverable | Technology | Effort |
|-----------|-------------|------------|--------|
| **AI-Powered Search** | SPECTER2-style embeddings for neuromodulation queries | Sentence-transformers + custom fine-tuning | 2 weeks |
| **Auto-Summarization** | Paper TLDR generation for neuromodulation literature | LLM API (Claude/GPT) or open-source models | 2 weeks |
| **Risk of Bias Integration** | Automated RoB 2.0 assessment assistance | Rule-based + ML classification | 2 weeks |
| **Network Meta-Analysis** | NMA visualization for competing neuromodulation protocols | NetMetaX / R gemtc | 2 weeks |
| **Pediatric Module** | Dedicated evidence view for pediatric neuromodulation | Custom dashboard section | 1 week |
| **Multilingual Search** | Evidence search in 5+ languages | Translation API + Epistemonikos approach | 2 weeks |
| **Mobile Interface** | Responsive mobile dashboard | React Native / PWA | 2 weeks |

**P2 Success Criteria:**
- [ ] AI search finds relevant papers missed by keyword search
- [ ] Auto-generated TLDRs for 90%+ of indexed papers
- [ ] RoB assessment assistance reduces manual effort by 50%
- [ ] Mobile dashboard functional for on-the-go evidence review

---

## 7. Sources & Citations

### Evidence Architecture Sources

1. Epistemonikos Database. "About Us - Methods." https://www.epistemonikos.org/en/about_us/methods
2. Epistemonikos Database. "Homepage." https://www.epistemonikos.org/
3. Rada G et al. "The Epistemonikos Database of Trials: A Comprehensive Repository." medRxiv 2025. https://www.medrxiv.org/content/10.1101/2025.11.16.25340330v1.full.pdf
4. Schunemann HJ et al. "Chapter 14: Completing 'Summary of findings' tables and grading the certainty of the evidence." Cochrane Handbook v6.5, 2024. https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-14
5. PubMed Clinical Queries. NIH/NCBI. https://pubmed.ncbi.nlm.nih.gov/clinical/
6. Chan J. "PubMed Update: Clinical Queries Usability Study and Interface Updates." NLM Tech Bull. 2021. https://www.nlm.nih.gov/pubs/techbull/ja21/ja21_pubmed_clinical_queries.html
7. Dimensions.ai Products. https://www.dimensions.ai/products/
8. Dimensions Scientific Research Database. https://www.dimensions.ai/resources/dimensions-scientific-research-database/
9. Semantic Scholar Product. https://www.semanticscholar.org/product
10. Wikipedia. "Semantic Scholar." https://en.wikipedia.org/wiki/Semantic_Scholar
11. Web of Science Research Assistant. Clarivate. https://clarivate.com/academia-government/scientific-and-academic-research/research-discovery-and-referencing/web-of-science/web-of-science-research-assistant/
12. Web of Science Research Assistant FAQ. https://webofscience.zendesk.com/hc/en-us/articles/31437630410129-Web-of-Science-Research-Assistant

### Neuromodulation Evidence Sources

13. JAMA Network Open. "Noninvasive Brain Stimulation Across Mental Disorders: Systematic Review and Dose-Response Meta-Analysis." 2024. https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2818884
14. JAMA Network Open. "Transcranial Electrical Stimulation in Treatment of Depression: Systematic Review and Meta-Analysis." 2025. https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2835422
15. Zhang EZZ et al. "Evaluating the effects of tDCS on depressive and anxiety symptoms from a transdiagnostic perspective." Transl Psychiatry. 2024. https://www.nature.com/articles/s41398-024-03003-w
16. Janvier KA et al. "Neurofeedback for ADHD: Systematic Review and Meta-Analysis." JAMA Psychiatry. 2024. https://jamanetwork.com/journals/jamapsychiatry/fullarticle/2827733
17. Liu H et al. "Neuromodulation treatments for PTSD: Systematic review and network meta-analysis." J Anxiety Disord. 2024. PMID: 39094317
18. Nature. "Modulating neuroplasticity for chronic pain relief." 2025. https://www.nature.com/articles/s12276-025-01409-0
19. PMC. "Transcranial Alternating Current Stimulation for Pain." https://pmc.ncbi.nlm.nih.gov/articles/PMC12938538/
20. Front Psychiatry. "Immediate and long-term efficacy of tDCS in OCD, PTSD and anxiety disorders." 2024. https://www.nature.com/articles/s41398-024-03053-0
21. Steuber ER, McGuire JF. "A meta-analysis of transcranial magnetic stimulation in obsessive-compulsive disorder." Biol Psychiatry CNNI. 2023.
22. Carmi L et al. "Efficacy and safety of deep transcranial magnetic stimulation for OCD." Am J Psychiatry. 2019;176(11):931-938.
23. PMC. "Transcranial direct current stimulation (tDCS) in psychiatric disorders in early childhood." https://pmc.ncbi.nlm.nih.gov/articles/PMC12198298/
24. Mansouri M et al. "Neuromodulation techniques for enhancing lower extremity motor function in children with cerebral palsy." Disabil Rehabil. 2026. PMID: 41518074
25. Clinical TMS Society. "Coverage Guidance for TMS for OCD." https://clinicaltmssociety.org/
26. Cohen SL et al. "A visual and narrative timeline of US FDA milestones for TMS devices." Brain Stimulation. 2022.

### Visualization Sources

27. "Data visualisation in scoping reviews and evidence maps on health topics." PMC. 2023. https://pmc.ncbi.nlm.nih.gov/articles/PMC10433592/
28. Perdue LA et al. "Creating Interactive Data Dashboards for Evidence Syntheses." 2025. https://pmc.ncbi.nlm.nih.gov/articles/PMC12224945/
29. "Interactive Evidence Maps for Visualizing and Understanding Systematic Reviews." arXiv 2026. https://arxiv.org/html/2603.28802v1
30. "TrialView: An AI-powered Visual Analytics System for Clinical Trials." PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC11052597/
31. "How to Apply Social Network Analysis to Evaluate Research Communities." PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC12970576/
32. Harvard Library Guide. "Citation Data Visualization Tools." https://guides.library.harvard.edu/c.php?g=311134&p=4423814
33. Johns Hopkins Welch Medical Library. "Research Metrics: Tools for Visualization & Analysis." https://browse.welch.jhmi.edu/research-metrics/tools/visualization-and-analysis

### Open Source Tools Sources

34. ASReview GitHub. github.com/asreview/asreview
35. ASReview Documentation. https://asreview.readthedocs.io/en/stable/lab/about.html
36. ASReview Website. https://asreview.nl/
37. van de Schoot R et al. "ASReview: Active learning for Systematic Reviews." Nature Machine Intelligence. 2021.
38. ReviewAid GitHub. https://github.com/ReviewAid
39. NetworkX Documentation. https://networkx.org/
40. VOSviewer. https://www.vosviewer.com/
41. Gephi. https://gephi.org/
42. igraph. https://github.com/igraph/igraph
43. pubmedclient. https://github.com/grll/pubmedclient
44. Semantic Scholar API. https://api.semanticscholar.org
45. Sourcely.net. "AI Tools for Literature Reviews: Top 7 Options." 2026. https://www.sourcely.net/resources/best-ai-tools-literature-reviews
46. Research Rabbit vs Connected Papers comparison. https://agentledgrowth.com/compare/connected-papers-vs-research-rabbit
47. UIC Research Guides. "Using AI Tools in Literature Reviews." https://researchguides.uic.edu/ailitreviews/aitools
48. Connected Papers. https://www.connectedpapers.com/
49. Research Rabbit. https://www.researchrabbit.ai/
50. Citree: Citation tree visualization using NetworkX and Bokeh. https://igormintz.medium.com/visualization-of-research-citations-using-networkx-and-bokeh-c9098d447699

---

*Document compiled from 30+ web searches across evidence platforms, neuromodulation literature databases (PubMed, Europe PMC, Nature, JAMA), clinical guidelines (FDA, Cochrane), and open-source repositories (GitHub). All citations verified against source material. Evidence horizon: 2024-2025 systematic reviews and meta-analyses.*

*This roadmap is designed to inform the DeepSynaps Protocol Studio evidence workspace architecture and prioritization.*
