# OPEN_SOURCE_PHASE3_MULTIMODAL_INTELLIGENCE_STACK.md

# DeepSynaps Phase 3: Multimodal Clinical Intelligence Stack -- Open Source Landscape Report

**Date:** 2026-05-16
**Purpose:** Identify and evaluate open-source tools for building the DeepSynaps multimodal clinical intelligence engine
**Scope:** Longitudinal timelines, clinical dashboards, multimodal fusion, causal inference, evidence retrieval, graph analytics, and temporal analytics

---

## Executive Summary

This report surveys the open-source ecosystem across seven critical technology domains required to build the DeepSynaps Phase 3 Multimodal Clinical Intelligence Engine. We evaluated **35+ tools**, prioritizing actively maintained projects with permissive licenses (Apache 2.0, MIT, BSD).

### Key Findings

| Category | Tools Found | Top Recommendation |
|----------|-------------|-------------------|
| Longitudinal Timeline Engines | 4 | MedTimeLine (Verily) |
| Clinical Dashboards | 4 | FHIRboard |
| Multimodal Fusion Libraries | 6 | TorchMultimodal (Meta) |
| Causal Inference Libraries | 7 | DoWhy + EconML (PyWhy) |
| Evidence Retrieval Systems | 5 | scispacy + PyMed |
| Graph Analytics Tools | 7 | PyKEEN + PyG |
| Temporal Analytics Tools | 8 | PyHealth + PyPOTS |

**Overall Assessment:** The open-source ecosystem is mature and ready for integration. The PyWhy ecosystem (DoWhy, EconML, causal-learn) provides world-class causal inference capabilities. PyHealth and PyPOTS offer comprehensive healthcare-specific deep learning and time-series analysis. For multimodal fusion, Meta's TorchMultimodal and the fusilli library provide strong foundations.

---

## Longitudinal Timeline Engines

Tools for visualizing and navigating patient clinical timelines, essential for the DeepSynaps Phase 3 chronological patient journey view.

### 1. MedTimeLine
- **Repository:** https://github.com/verilylifesciences/medtimeline
- **License:** Apache 2.0
- **Stars:** ~200 | **Last Updated:** 2025-03-18
- **Description:** Web application built by Verily in collaboration with Boston Children's Hospital to help clinicians view how a patient's status changes over time using SMART on FHIR API. Features draggable clinical concept cards, time series graphs within cards, text annotations, and customizable timeframes.
- **Relevance:** **HIGH** -- Purpose-built clinical timeline viewer with FHIR integration, directly applicable to DeepSynaps timeline visualization requirements.
- **Use Case:** Core timeline visualization component for patient journey mapping.
- **Integration Complexity:** Medium -- Angular-based frontend requires adaptation to DeepSynaps architecture.

### 2. Medical Care Timeline
- **Repository:** https://github.com/diegomarzaa/medical-care-timeline
- **License:** MIT
- **Stars:** ~150 | **Last Updated:** 2026-01-21
- **Description:** Visual tool for exploring patients' hospital episodes in a clear, interactive timeline. Supports multiple case IDs simultaneously, numeric evolution charts, event table views, and configuration import/export. Works with PostgreSQL, CSV files, or bundled synthetic demo data.
- **Relevance:** **HIGH** -- Excellent for visualizing hospital episodes and patient journeys with minimal configuration.
- **Use Case:** Episode-based timeline visualization for inpatient journey tracking.
- **Integration Complexity:** Easy -- Python backend (FastAPI) with npm frontend, well-documented setup.

### 3. Clinical Timelines (Rho Inc.)
- **Repository:** https://github.com/RhoInc/clinical-timelines
- **License:** MIT
- **Stars:** ~50 | **Last Updated:** 2017-09-18
- **Description:** JavaScript library visualizing clinical events over time via faceted, interactive timeline charts. Designed for clinical trial research but works with any longitudinal data. Features drill-down to individual timelines, small multiples for event types, and detailed data listings.
- **Relevance:** **Medium** -- Less actively maintained but proven in clinical trial contexts; good reference architecture.
- **Use Case:** Clinical trial timeline visualization; population-level event pattern analysis.
- **Integration Complexity:** Medium -- D3.js-based, requires JavaScript integration work.

### 4. FHIR Server Dashboard
- **Repository:** https://github.com/smart-on-fhir/fhir-server-dashboard
- **License:** Apache 2.0
- **Stars:** ~100 | **Last Updated:** 2025-07-02
- **Description:** Standalone app presenting human-readable representations of FHIR server data. Built with Node.js, D3, and Plotly. Consists of a backend analysis process and static web page renderer. Particularly useful for analyzing FHIR sandbox data.
- **Relevance:** **Medium** -- Useful for FHIR data exploration but not patient-specific timelines.
- **Use Case:** FHIR data quality assessment and server content overview.
- **Integration Complexity:** Easy -- Standalone app with clear separation of concerns.

---

## Clinical Dashboards

Frameworks and tools for building clinical data dashboards and visualization interfaces.

### 5. FHIRboard
- **Repository:** https://github.com/the-momentum/fhirboard
- **License:** MIT
- **Stars:** ~200 | **Last Updated:** 2024-11-20
- **Description:** Open-source tool for FHIR data analysis and visualization with containerized environment. Features ViewDefinition playground, DuckDB analytics engine, Apache Superset integration, and AI-powered ViewDefinition generation from natural language. Enables SQL-on-FHIR analytics with single-command Docker deployment.
- **Relevance:** **HIGH** -- Complete FHIR analytics platform with visualization, directly aligned with DeepSynaps FHIR integration goals.
- **Use Case:** Primary clinical analytics dashboard backend with FHIR ViewDefinition support.
- **Integration Complexity:** Medium -- Docker Compose-based, requires Rails/DuckDB/Superset stack.

### 6. Real-Time FHIR
- **Repository:** https://github.com/aehrc/real-time-fhir
- **License:** CSIRO Open Source License
- **Stars:** ~30 | **Last Updated:** 2022-02-11
- **Description:** Simulated FHIR data source that writes resources into remote FHIR servers in real time. Features simulation interface with resource type specification, timeline duration controls, event tables, and fetch capabilities. Supports custom NDJSON FHIR resource files.
- **Relevance:** **Medium** -- Useful for testing and simulation but not a production dashboard.
- **Use Case:** Synthetic data generation and FHIR server load testing for development.
- **Integration Complexity:** Easy -- Simulation tool with clear API.

---

## Multimodal Fusion Libraries

Libraries for combining multiple data modalities (text, imaging, tabular clinical data, time series) into unified representations.

### 7. TorchMultimodal (Meta)
- **Repository:** https://github.com/facebookresearch/multimodal
- **License:** BSD-3-Clause
- **Stars:** ~3,200 | **Last Updated:** Active (2022-2025)
- **Description:** PyTorch library for training state-of-the-art multimodal multi-task models at scale. Provides modular components for vision-language tasks, cross-modal attention, and multimodal transformers. Built on PyTorch with CUDA support. Powers research at Meta FAIR.
- **Relevance:** **HIGH** -- Most mature PyTorch-native multimodal library; provides foundational modules for combining clinical imaging, text notes, and tabular EHR data.
- **Use Case:** Core multimodal fusion architecture for combining imaging + clinical text + structured EHR.
- **Integration Complexity:** Medium -- Requires PyTorch expertise; modular design enables incremental adoption.

### 8. fusilli
- **Repository:** https://github.com/florencejt/fusilli
- **License:** AGPL-3.0
- **Stars:** ~200 | **Last Updated:** 2023-08-16
- **Description:** Python package for deep-learning multimodal data fusion with PyTorch Lightning. Supports tabular-tabular fusion, tabular-image fusion (2D/3D), regression, binary classification, and multi-class classification. Built-in training, evaluation, and visualization pipelines.
- **Relevance:** **HIGH** -- Specifically designed for multimodal medical data fusion (e.g., combining brain MRI with cognitive assessments). Excellent for DeepSynaps tabular + imaging fusion needs.
- **Use Case:** Fusion of imaging and tabular clinical data for diagnostic prediction tasks.
- **Integration Complexity:** Easy -- pip-installable, PyTorch Lightning-based, well-documented.

### 9. PyHealth
- **Repository:** https://github.com/sunlabuiuc/PyHealth
- **License:** Apache 2.0
- **Stars:** ~2,000 | **Last Updated:** 2026-04-01 (Active)
- **Description:** Comprehensive deep learning toolkit for healthcare with 33+ pre-built models, 10+ tasks, and support for MIMIC-III, MIMIC-IV, eICU, OMOP-CDM datasets. Features modular 5-stage pipeline (dataset -> task -> model -> trainer -> metrics), medical code mapping (ICD, ATC, NDC), and multimodal dataloaders.
- **Relevance:** **HIGH** -- Healthcare-first toolkit with built-in multimodal support, medical code systems, and production-ready training infrastructure.
- **Use Case:** Primary ML pipeline framework for diagnosis prediction, drug recommendation, mortality prediction, and readmission forecasting.
- **Integration Complexity:** Easy -- `pip install pyhealth`, comprehensive documentation, active community.

### 10. MONAI
- **Repository:** https://github.com/Project-MONAI/MONAI
- **License:** Apache 2.0
- **Stars:** ~6,000 | **Last Updated:** 2026-05-15 (Very Active)
- **Description:** PyTorch-driven library for deep learning in medical imaging with domain-optimized capabilities. Features AutoML, Smart Caching, GPU-accelerated I/O, and medical image transforms. Includes MONAI Label for AI-assisted annotation, MONAI Deploy for clinical production deployment, and Model Zoo with pre-trained bundles.
- **Relevance:** **HIGH** -- The gold standard for medical imaging AI; provides imaging modality handling for DeepSynaps multimodal pipeline.
- **Use Case:** Medical image preprocessing, segmentation, and feature extraction for fusion with clinical data.
- **Integration Complexity:** Medium -- Imaging-specific; requires integration with clinical data pipeline.

### 11. FuseMix
- **Repository:** https://github.com/layer6ai-labs/fusemix
- **License:** MIT
- **Stars:** ~100 | **Last Updated:** 2023-12-14
- **Description:** Data-efficient multimodal fusion on a single GPU (CVPR 2024 Highlight). Image-text fusion with MLP contrastive learning, feature extraction with DINOv2 and BGE, and LAVIS-based implementation.
- **Relevance:** **Medium** -- Research-oriented; provides useful fusion methodology but less mature for clinical use.
- **Use Case:** Reference architecture for efficient multimodal fusion strategies.
- **Integration Complexity:** Hard -- Research code requiring adaptation.

### 12. Multimodal-GPT (OpenMMLab)
- **Repository:** https://github.com/open-mmlab/Multimodal-GPT
- **License:** Apache 2.0
- **Stars:** ~1,500 | **Last Updated:** 2023-04-26
- **Description:** Train a multimodal chatbot with visual and language instructions based on OpenFlamingo. Supports visual instruction data (VQA, Image Captioning, Visual Reasoning, Text OCR, Visual Dialogue) with joint training of visual and language instructions.
- **Relevance:** **Medium** -- Interesting for clinical conversational AI but not directly applicable to structured clinical fusion.
- **Use Case:** Clinical question-answering with visual inputs (e.g., radiology report generation).
- **Integration Complexity:** Hard -- Requires significant adaptation for clinical domain.

---

## Causal Inference Libraries

Tools for discovering causal relationships, estimating treatment effects, and validating causal assumptions in clinical data.

### 13. DoWhy (PyWhy / Microsoft)
- **Repository:** https://github.com/py-why/dowhy
- **License:** MIT
- **Stars:** ~8,100 | **Last Updated:** 2026-05-16 (Very Active)
- **Description:** Python library for causal inference supporting explicit modeling and testing of causal assumptions. Combines causal graphical models and potential outcomes frameworks. Provides unified API for causal estimation with automatic assumption testing.
- **Relevance:** **HIGH** -- The flagship causal inference library; essential for DeepSynaps causal reasoning layer. Integrates seamlessly with EconML and causal-learn.
- **Use Case:** Causal effect estimation, assumption validation, and sensitivity analysis for treatment effect discovery.
- **Integration Complexity:** Easy -- `pip install dowhy`, excellent documentation, PyWhy ecosystem integration.

### 14. EconML (PyWhy / Microsoft Research)
- **Repository:** https:///py-why/EconML
- **License:** MIT
- **Stars:** ~4,600 | **Last Updated:** 2025-07-14 (Active)
- **Description:** Python package for estimating heterogeneous treatment effects from observational data via machine learning. Implements double machine learning, causal forests, deep instrumental variables, and meta-learners. Provides confidence intervals and policy learning.
- **Relevance:** **HIGH** -- State-of-the-art heterogeneous treatment effect estimation; critical for personalized treatment recommendations.
- **Use Case:** Heterogeneous treatment effect estimation for personalized clinical decision support.
- **Integration Complexity:** Medium -- Requires understanding of causal inference concepts; well-documented.

### 15. CausalML (Uber)
- **Repository:** https://github.com/uber/causalml
- **License:** Apache 2.0
- **Stars:** ~4,100 | **Last Updated:** 2023-08-28
- **Description:** Python package for uplift modeling and causal inference with ML. Provides meta-learners (S-Learner, T-Learner, X-Learner), causal trees, causal random forests, and DragonNet. Includes simulation data generation, model visualization, and evaluation tools.
- **Relevance:** **HIGH** -- Industry-proven at Uber; comprehensive uplift modeling toolkit for clinical intervention optimization.
- **Use Case:** Uplift modeling for treatment effect estimation and patient targeting.
- **Integration Complexity:** Easy -- `pip install causalml`, scikit-learn-compatible API.

### 16. causal-learn (PyWhy)
- **Repository:** https://github.com/py-why/causal-learn
- **License:** MIT
- **Stars:** ~1,600 | **Last Updated:** 2026-05-07 (Very Active)
- **Description:** Open-source platform for causal discovery with constraint-based methods (PC, FCI), score-based methods (GES), permutation-based methods, Granger causality, and hidden causal representation learning. Python-native implementation with comprehensive algorithm coverage.
- **Relevance:** **HIGH** -- Comprehensive causal discovery from observational data; essential for discovering causal relationships in clinical datasets without interventions.
- **Use Case:** Causal graph discovery from EHR data; identifying causal pathways between treatments and outcomes.
- **Integration Complexity:** Medium -- Multiple algorithms require expertise to select appropriately.

### 17. Tigramite
- **Repository:** https://github.com/jakobrunge/tigramite
- **License:** GPL-3.0
- **Stars:** ~700 | **Last Updated:** 2025 (Active)
- **Description:** Causal time series analysis Python package. Implements PCMCI and PCMCI+ algorithms for causal discovery in time series. Supports linear and non-parametric conditional independence tests, causal mediation analysis, and prediction. Handles missing values and parallel computing.
- **Relevance:** **HIGH** -- Purpose-built for temporal causal discovery; directly applicable to clinical time series causality analysis.
- **Use Case:** Causal discovery from patient vital sign time series and clinical event sequences.
- **Integration Complexity:** Medium -- Time series specific; requires understanding of PCMCI methodology.

### 18. CausalDiscoveryToolbox
- **Repository:** https://github.com/FenTechSolutions/CausalDiscoveryToolbox
- **License:** MIT
- **Stars:** ~800 | **Last Updated:** Ongoing
- **Description:** Package for causal inference in graphs and pairwise settings. Implements algorithms from bnlearn and pcalg packages for graph structure recovery. Based on NumPy, scikit-learn, PyTorch, and R.
- **Relevance:** **Medium** -- Broad algorithm coverage but some dependencies on R reduce portability.
- **Use Case:** Pairwise causal discovery and graph structure recovery.
- **Integration Complexity:** Medium -- Mixed Python/R dependencies.

### 19. dodiscover (PyWhy)
- **Repository:** https://github.com/py-why/dodiscover
- **License:** MIT
- **Stars:** ~250 | **Last Updated:** 2024
- **Description:** Unified API for global causal discovery algorithms. Provides guide rails for causal discovery without deep knowledge of individual algorithms. Wraps discovery algorithms from causal-learn with cohesive, user-friendly API.
- **Relevance:** **Medium** -- Good entry point for causal discovery; experimental status.
- **Use Case:** Simplified causal discovery pipeline integration.
- **Integration Complexity:** Easy -- Wrapper around causal-learn with cleaner API.

---

## Evidence Retrieval Systems

Tools for retrieving medical literature, clinical guidelines, and evidence from PubMed and other biomedical knowledge sources.

### 20. scispaCy (Allen AI)
- **Repository:** https://github.com/allenai/scispacy
- **License:** Apache 2.0
- **Stars:** ~1,500 | **Last Updated:** 2025 (Active)
- **Description:** Fast and robust models for biomedical NLP built on spaCy. Features custom tokenizer for scientific documents, sentence segmenter, Named Entity Recognition (NER) for diseases, chemicals, genes, and UMLS concept linking. Models: en_ner_bc5cdr_md, en_core_sci_sm/lg.
- **Relevance:** **HIGH** -- Essential biomedical NLP toolkit for extracting entities from clinical text and medical literature.
- **Use Case:** Clinical text entity extraction, biomedical literature parsing, concept normalization.
- **Integration Complexity:** Easy -- `pip install scispacy`, spaCy-compatible API.

### 21. medspaCy
- **Repository:** https://github.com/medspacy/medspacy
- **License:** Apache 2.0
- **Stars:** ~400 | **Last Updated:** 2025 (Active)
- **Description:** Clinical NLP toolkit built on spaCy with visual interface (medspacyV). Provides clinical section detection, assertion/negation detection, UMLS concept mapping, and context analysis. Developed by Mayo Clinic's CCaTS Informatics Team.
- **Relevance:** **HIGH** -- Clinical-domain NLP with negation detection and context awareness; critical for accurate clinical concept extraction.
- **Use Case:** Clinical note processing with negation detection, section segmentation, and UMLS linking.
- **Integration Complexity:** Easy -- spaCy extension with clinical-specific rules.

### 22. PyMed
- **Repository:** https://github.com/jannisborn/pymed
- **License:** MIT (fork)
- **Stars:** ~300 | **Last Updated:** 2024-10-13
- **Description:** Python library providing access to PubMed through the PubMed API. Features querying with PubMed query language, request batching for performance, article parsing and cleaning, automatic retries, and bug fixes over original pymed. Installable via `pip install pymed-paperscraper`.
- **Relevance:** **HIGH** -- Direct PubMed access for evidence retrieval; essential for medical literature search integration.
- **Use Case:** Automated PubMed literature retrieval for evidence-based clinical decision support.
- **Integration Complexity:** Easy -- pip installable, clean Python API.

### 23. PubMed Client
- **Repository:** https://github.com/grll/pubmedclient
- **License:** MIT
- **Stars:** ~50 | **Last Updated:** 2025-01-01
- **Description:** Simple open-source Python SDK for the NCBI PubMed E-Utilities API. Async client with EInfo, ESearch, EFetch operations. Type-safe request/response models.
- **Relevance:** **Medium** -- Modern async client for PubMed API access.
- **Use Case:** Asynchronous PubMed queries for real-time evidence lookup.
- **Integration Complexity:** Easy -- Lightweight SDK with clear API.

---

## Graph Analytics Tools

Libraries for knowledge graph construction, graph neural networks, and patient similarity analysis.

### 24. PyKEEN
- **Repository:** https://github.com/pykeen/pykeen
- **License:** MIT
- **Stars:** ~1,800 | **Last Updated:** 2025-04-24
- **Description:** Python package for training and evaluating knowledge graph embedding models. Supports 40+ models, 37 datasets, inductive reasoning, and multi-modal information incorporation. PyTorch-based with modular architecture.
- **Relevance:** **HIGH** -- State-of-the-art knowledge graph embeddings; essential for DeepSynaps clinical knowledge graph construction and reasoning.
- **Use Case:** Drug-disease interaction prediction, medical ontology embedding, clinical knowledge graph construction.
- **Integration Complexity:** Medium -- Requires knowledge graph construction pipeline first.

### 25. Hetionet
- **Repository:** https://github.com/hetio/hetionet
- **License:** CC0 1.0 Universal
- **Stars:** ~500 | **Last Updated:** Ongoing
- **Description:** Integrative network of biomedical knowledge combining 47,031 nodes (compounds, diseases, genes, anatomies, pathways) and 2,250,197 relationships. Proven framework for drug repurposing and disease-gene association.
- **Relevance:** **HIGH** -- Ready-made biomedical knowledge graph for drug repurposing and disease association analysis.
- **Use Case:** Drug repurposing candidate identification, disease mechanism investigation.
- **Integration Complexity:** Easy -- Available as Neo4j dump or JSON/TSV files.

### 26. PyTorch Geometric (PyG)
- **Repository:** https://github.com/pyg-team/pytorch_geometric
- **License:** MIT
- **Stars:** ~22,000 | **Last Updated:** 2026-05-16 (Very Active)
- **Description:** Library for deep learning on graphs and other irregular structures. Provides graph neural network implementations (GCN, GAT, GraphSAGE, GIN), scalability to large graphs, and mini-batch handling. PyTorch-native with GPU acceleration.
- **Relevance:** **HIGH** -- The standard for graph neural networks; essential for patient similarity graphs and knowledge graph neural network learning.
- **Use Case:** Patient similarity network construction, clinical knowledge graph neural network learning.
- **Integration Complexity:** Medium -- Requires graph data preparation; well-documented.

### 27. StellarGraph
- **Repository:** https://github.com/stellargraph/stellargraph
- **License:** Apache 2.0
- **Stars:** ~3,000 | **Last Updated:** 2022
- **Description:** Machine learning library for graph-structured data with graph neural network algorithms, graph classification, link prediction, and representation learning. Supports heterogeneous graphs.
- **Relevance:** **Medium** -- Good for heterogeneous graph learning but less actively maintained than PyG.
- **Use Case:** Heterogeneous clinical graph learning with multiple node and edge types.
- **Integration Complexity:** Medium -- pip installable but reduced activity.

### 28. PheKnowLator
- **Repository:** https://github.com/callahantiff/PheKnowLator
- **License:** MIT
- **Stars:** ~200 | **Last Updated:** 2021
- **Description:** Framework for automated construction of heterogeneous large-scale biomedical knowledge graphs. Supports 14 ontologies, multiple construction approaches, and comprehensive evaluation benchmarks.
- **Relevance:** **Medium** -- Powerful KG construction but complex setup; good reference for custom KG construction.
- **Use Case:** Automated clinical knowledge graph construction from biomedical ontologies.
- **Integration Complexity:** Hard -- Complex multi-step pipeline with many dependencies.

### 29. Deep Graph Library (DGL)
- **Repository:** https://github.com/dmlc/dgl
- **License:** Apache 2.0
- **Stars:** ~13,000 | **Last Updated:** 2026 (Active)
- **Description:** Easy-to-use, high-performance, scalable Python package for deep learning on graphs. Framework agnostic (PyTorch, MXNet, TensorFlow). Features message passing APIs, graph sampling, and heterogeneous graph support.
- **Relevance:** **HIGH** -- Major alternative to PyG; excellent for large-scale graph learning with multi-GPU support.
- **Use Case:** Large-scale patient similarity graph neural network training.
- **Integration Complexity:** Medium -- Framework-agnostic design adds flexibility.

### 30. Medaka (Biomedical KG Construction)
- **Repository:** https://github.com/medakakg/medaka
- **License:** Not specified
- **Stars:** ~100 | **Last Updated:** 2025
- **Description:** End-to-end pipeline for constructing biomedical knowledge graphs from unstructured online content using web scrapers and LLMs. Curated dataset of drug leaflets with side effects, warnings, contraindications, ingredients, dosage guidelines.
- **Relevance:** **Medium** -- Novel LLM-based KG construction approach; useful for drug safety KG construction.
- **Use Case:** Drug safety knowledge graph construction from unstructured text.
- **Integration Complexity:** Medium -- LLM-based pipeline requires API keys and processing.

---

## Temporal Analytics Tools

Libraries for time series analysis, survival analysis, event sequence mining, and temporal pattern detection in healthcare data.

### 31. PyPOTS
- **Repository:** https://github.com/WenjieDu/PyPOTS
- **License:** BSD-3-Clause
- **Stars:** ~1,500 | **Last Updated:** 2026-05-05 (Very Active)
- **Description:** Python toolkit for machine learning on Partially-Observed Time Series. Supports 50+ neural network models for imputation, forecasting, classification, clustering, and anomaly detection. Handles incomplete, irregularly-sampled, multivariate time series with NaN missing values.
- **Relevance:** **HIGH** -- Specifically designed for incomplete clinical time series (which is the norm in real-world EHR data). SAITS, TimesNet, PatchTST, and many cutting-edge models included.
- **Use Case:** Vital sign imputation, clinical time series forecasting, patient trajectory classification, anomaly detection in monitoring data.
- **Integration Complexity:** Easy -- `pip install pypots`, PyTorch-based, comprehensive documentation.

### 32. Darts (unit8co)
- **Repository:** https://github.com/unit8co/darts
- **License:** Apache 2.0
- **Stars:** ~9,000 | **Last Updated:** 2026-05-05 (Very Active)
- **Description:** User-friendly Python library for forecasting and anomaly detection on time series. Contains models from ARIMA to deep neural networks (N-BEATS, N-HiTS, TFT, TCN, Transformer). Supports multivariate series, probabilistic forecasting, conformal prediction, and past/future covariates. PyTorch Lightning backend.
- **Relevance:** **HIGH** -- Comprehensive time series toolkit with deep learning models, anomaly detection, and uncertainty quantification.
- **Use Case:** Clinical time series forecasting (e.g., length of stay prediction, resource planning), vital sign anomaly detection.
- **Integration Complexity:** Easy -- `pip install darts`, scikit-learn-like API.

### 33. sktime
- **Repository:** https://github.com/sktime/sktime
- **License:** BSD-3-Clause
- **Stars:** ~9,800 | **Last Updated:** 2025-11-25 (Very Active)
- **Description:** Unified framework for machine learning with time series. Provides interfaces for forecasting, time series classification, clustering, anomaly detection, and transformation. Compatible with scikit-learn, statsmodels, tsfresh, PyOD, and Prophet.
- **Relevance:** **HIGH** -- The scikit-learn of time series; essential for temporal ML pipeline construction.
- **Use Case:** Time series classification of patient trajectories, forecasting, and transformation pipelines.
- **Integration Complexity:** Easy -- `pip install sktime`, scikit-learn-compatible API.

### 34. tsfresh
- **Repository:** https://github.com/blue-yonder/tsfresh
- **License:** MIT
- **Stars:** ~8,000 | **Last Updated:** 2026 (Active)
- **Description:** Automatic extraction of relevant features from time series. Extracts 100+ features (statistical, temporal, frequency-domain) with built-in feature selection using hypothesis testing. Compatible with pandas and scikit-learn.
- **Relevance:** **HIGH** -- Automated feature engineering for time series; critical for transforming raw clinical time series into ML-ready features.
- **Use Case:** Clinical time series feature extraction for downstream classification and regression tasks.
- **Integration Complexity:** Easy -- `pip install tsfresh`, pandas-compatible.

### 35. MIRA (Microsoft)
- **Repository:** https://github.com/microsoft/MIRA
- **License:** MIT
- **Stars:** ~500 | **Last Updated:** 2025
- **Description:** Medical Time Series Foundation Model (NeurIPS 2025). Pretrained on 454B time points from ICU physiological signals and hospital EHR. Features Continuous-Time Rotary Positional Encoding, frequency-specialized Mixture-of-Experts, and Neural ODE extrapolation.
- **Relevance:** **HIGH** -- State-of-the-art medical time series foundation model with zero-shot forecasting capability.
- **Use Case:** Foundation model backbone for clinical time series representation and forecasting.
- **Integration Complexity:** Medium -- Foundation model requires GPU resources and fine-tuning pipeline.

### 36. CausalFlow
- **Repository:** https://github.com/lcastri/causalflow
- **License:** Not specified
- **Stars:** ~100 | **Last Updated:** 2025-05-27
- **Description:** Python library for causal analysis from time-series data. Implements F-PCMCI and CAnDOIT algorithms. Integrates multiple causal discovery methods: DYNOTEARS, PCMCI, PCMCI+, LPCMCI, TCDF, tsFCI, VarLiNGAM.
- **Relevance:** **Medium** -- Wraps multiple temporal causal discovery methods in unified framework.
- **Use Case:** Temporal causal discovery benchmarking and analysis.
- **Integration Complexity:** Medium -- Aggregates multiple packages with unified interface.

### 37. GSP-Py (Sequence Pattern Mining)
- **Repository:** https://github.com/jacksonpradolima/gsp-py
- **License:** MIT
- **Stars:** ~150 | **Last Updated:** 2026-02-22
- **Description:** Generalized Sequence Pattern (GSP) algorithm in Python. Sequence pattern mining with CLI and programmatic interfaces. Supports temporal constraints (mingap, maxgap, maxspan). Exports to Parquet, CSV, and JSON.
- **Relevance:** **Medium** -- Clinical event sequence mining for treatment pattern discovery.
- **Use Case:** Mining frequent clinical event sequences and treatment pathways.
- **Integration Complexity:** Easy -- pip-installable with CLI interface.

---

## Recommended Integration Stack

Based on the evaluation, we recommend the following integration architecture for DeepSynaps Phase 3:

```
+-------------------------------------------------------------+
|                    DEEPSYNAPS PHASE 3                        |
|              MULTIMODAL INTELLIGENCE ENGINE                  |
+-------------------------------------------------------------+
                                                              |
  +------------------+  +------------------+  +--------------+
  |  DATA LAYER      |  |  FUSION LAYER    |  |  REASONING   |
  +------------------+  +------------------+  +--------------+
  | PyHealth (EHR)   |  | TorchMultimodal  |  | DoWhy        |
  | MONAI (Imaging)  |  | fusilli          |  | EconML       |
  | scispacy (Text)  |  | PyHealth         |  | causal-learn |
  | PyPOTS (TS)      |  | MONAI            |  | Tigramite    |
  +------------------+  +------------------+  +--------------+
                                                              |
  +------------------+  +------------------+  +--------------+
  |  KNOWLEDGE GRAPH |  |  TEMPORAL        |  |  EVIDENCE    |
  +------------------+  +------------------+  +--------------+
  | PyKEEN           |  | Darts            |  | scispacy     |
  | Hetionet         |  | sktime           |  | PyMed        |
  | PyG / DGL        |  | PyPOTS           |  | medspaCy     |
  | PheKnowLator     |  | MIRA (FM)        |  | PubMed API   |
  +------------------+  +------------------+  +--------------+
                                                              |
  +------------------+  +------------------+
  |  VISUALIZATION   |  |  CAUSAL DISCOVERY|
  +------------------+  +------------------+
  | MedTimeLine      |  | causal-learn     |
  | FHIRboard        |  | Tigramite        |
  | Medical Care     |  | DoDiscover       |
  |   Timeline       |  | CausalFlow       |
  +------------------+  +------------------+
```

### Priority Integration Tiers

| Tier | Tools | Timeline |
|------|-------|----------|
| Tier 1 (Immediate) | PyHealth, DoWhy, EconML, scispacy, PyMed, Darts, PyKEEN | Weeks 1-4 |
| Tier 2 (Short-term) | MONAI, fusilli, PyPOTS, sktime, causal-learn, PyG | Weeks 4-8 |
| Tier 3 (Medium-term) | MIRA, medspaCy, FHIRboard, MedTimeLine, Hetionet | Weeks 8-12 |

---

## Quick-Win Opportunities

1. **Clinical NLP Pipeline** -- Integrate scispacy + medspaCy for entity extraction from clinical notes. Can be operational in < 1 week.

2. **Causal Effect Estimation** -- Deploy DoWhy + EconML for treatment effect analysis on existing EHR datasets. Prototype possible in 2 weeks.

3. **Time Series Imputation** -- Use PyPOTS SAITS model to handle missing values in clinical time series. Immediate impact on data quality.

4. **Knowledge Graph Embeddings** -- Load Hetionet into PyKEEN for drug repurposing predictions. Quick start for knowledge graph analytics.

5. **FHIR Analytics Dashboard** -- Deploy FHIRboard for FHIR data visualization and SQL-on-FHIR analytics. Standalone Docker deployment.

6. **Temporal Forecasting** -- Implement Darts Temporal Fusion Transformer (TFT) for clinical outcome forecasting. Production-ready models.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| **License incompatibility** | HIGH | All recommended Tier 1 tools use Apache 2.0/MIT/BSD; audit before commercial use |
| **Maintenance decay** | MEDIUM | Prefer PyWhy ecosystem (Microsoft-backed), PyHealth (UIUC active), MONAI (NVIDIA-backed) |
| **Scale limitations** | MEDIUM | PyG/DGL for large-scale graphs; MIRA requires GPU resources |
| **Clinical validation** | HIGH | All ML outputs require clinical expert validation; DoWhy helps with assumption testing |
| **Data privacy** | CRITICAL | All tools process de-identified data; ensure HIPAA compliance in deployment |
| **Integration complexity** | MEDIUM | Start with Tier 1 tools; PyHealth provides unified API reducing integration burden |

### License Summary of Recommended Stack

| Tool | License | Commercial Use |
|------|---------|----------------|
| PyHealth | Apache 2.0 | Yes |
| DoWhy | MIT | Yes |
| EconML | MIT | Yes |
| CausalML | Apache 2.0 | Yes |
| causal-learn | MIT | Yes |
| scispacy | Apache 2.0 | Yes |
| medspaCy | Apache 2.0 | Yes |
| PyMed | MIT | Yes |
| MONAI | Apache 2.0 | Yes |
| TorchMultimodal | BSD-3 | Yes |
| fusilli | AGPL-3.0 | Requires review |
| PyKEEN | MIT | Yes |
| PyG | MIT | Yes |
| Darts | Apache 2.0 | Yes |
| sktime | BSD-3 | Yes |
| PyPOTS | BSD-3 | Yes |
| tsfresh | MIT | Yes |
| Tigramite | GPL-3.0 | Copyleft considerations |

---

## Appendix: Full Tool Inventory

| # | Tool | Category | URL | License | Stars | Activity | Relevance |
|---|------|----------|-----|---------|-------|----------|-----------|
| 1 | MedTimeLine | Timeline | https://github.com/verilylifesciences/medtimeline | Apache 2.0 | ~200 | 2025 | HIGH |
| 2 | Medical Care Timeline | Timeline | https://github.com/diegomarzaa/medical-care-timeline | MIT | ~150 | 2026 | HIGH |
| 3 | Clinical Timelines | Timeline | https://github.com/RhoInc/clinical-timelines | MIT | ~50 | 2017 | Medium |
| 4 | FHIR Server Dashboard | Dashboard | https://github.com/smart-on-fhir/fhir-server-dashboard | Apache 2.0 | ~100 | 2025 | Medium |
| 5 | FHIRboard | Dashboard | https://github.com/the-momentum/fhirboard | MIT | ~200 | 2024 | HIGH |
| 6 | Real-Time FHIR | Dashboard | https://github.com/aehrc/real-time-fhir | CSIRO | ~30 | 2022 | Medium |
| 7 | TorchMultimodal | Fusion | https://github.com/facebookresearch/multimodal | BSD-3 | ~3,200 | Active | HIGH |
| 8 | fusilli | Fusion | https://github.com/florencejt/fusilli | AGPL-3.0 | ~200 | 2023 | HIGH |
| 9 | PyHealth | Fusion/Temporal | https://github.com/sunlabuiuc/PyHealth | Apache 2.0 | ~2,000 | 2026 | HIGH |
| 10 | MONAI | Fusion (Imaging) | https://github.com/Project-MONAI/MONAI | Apache 2.0 | ~6,000 | 2026 | HIGH |
| 11 | FuseMix | Fusion | https://github.com/layer6ai-labs/fusemix | MIT | ~100 | 2023 | Medium |
| 12 | Multimodal-GPT | Fusion | https://github.com/open-mmlab/Multimodal-GPT | Apache 2.0 | ~1,500 | 2023 | Medium |
| 13 | DoWhy | Causal | https://github.com/py-why/dowhy | MIT | ~8,100 | 2026 | HIGH |
| 14 | EconML | Causal | https://github.com/py-why/EconML | MIT | ~4,600 | 2025 | HIGH |
| 15 | CausalML | Causal | https://github.com/uber/causalml | Apache 2.0 | ~4,100 | 2023 | HIGH |
| 16 | causal-learn | Causal | https://github.com/py-why/causal-learn | MIT | ~1,600 | 2026 | HIGH |
| 17 | Tigramite | Causal/Temporal | https://github.com/jakobrunge/tigramite | GPL-3.0 | ~700 | 2025 | HIGH |
| 18 | CausalDiscoveryToolbox | Causal | https://github.com/FenTechSolutions/CausalDiscoveryToolbox | MIT | ~800 | Ongoing | Medium |
| 19 | dodiscover | Causal | https://github.com/py-why/dodiscover | MIT | ~250 | 2024 | Medium |
| 20 | scispaCy | Evidence | https://github.com/allenai/scispacy | Apache 2.0 | ~1,500 | 2025 | HIGH |
| 21 | medspaCy | Evidence | https://github.com/medspacy/medspacy | Apache 2.0 | ~400 | 2025 | HIGH |
| 22 | PyMed | Evidence | https://github.com/jannisborn/pymed | MIT | ~300 | 2024 | HIGH |
| 23 | PubMed Client | Evidence | https://github.com/grll/pubmedclient | MIT | ~50 | 2025 | Medium |
| 24 | PyKEEN | Graph | https://github.com/pykeen/pykeen | MIT | ~1,800 | 2025 | HIGH |
| 25 | Hetionet | Graph | https://github.com/hetio/hetionet | CC0 | ~500 | Ongoing | HIGH |
| 26 | PyTorch Geometric | Graph | https://github.com/pyg-team/pytorch_geometric | MIT | ~22,000 | 2026 | HIGH |
| 27 | StellarGraph | Graph | https://github.com/stellargraph/stellargraph | Apache 2.0 | ~3,000 | 2022 | Medium |
| 28 | PheKnowLator | Graph | https://github.com/callahantiff/PheKnowLator | MIT | ~200 | 2021 | Medium |
| 29 | DGL | Graph | https://github.com/dmlc/dgl | Apache 2.0 | ~13,000 | 2026 | HIGH |
| 30 | Medaka | Graph | https://github.com/medakakg/medaka | -- | ~100 | 2025 | Medium |
| 31 | PyPOTS | Temporal | https://github.com/WenjieDu/PyPOTS | BSD-3 | ~1,500 | 2026 | HIGH |
| 32 | Darts | Temporal | https://github.com/unit8co/darts | Apache 2.0 | ~9,000 | 2026 | HIGH |
| 33 | sktime | Temporal | https://github.com/sktime/sktime | BSD-3 | ~9,800 | 2025 | HIGH |
| 34 | tsfresh | Temporal | https://github.com/blue-yonder/tsfresh | MIT | ~8,000 | 2026 | HIGH |
| 35 | MIRA | Temporal | https://github.com/microsoft/MIRA | MIT | ~500 | 2025 | HIGH |
| 36 | CausalFlow | Temporal/Causal | https://github.com/lcastri/causalflow | -- | ~100 | 2025 | Medium |
| 37 | GSP-Py | Temporal | https://github.com/jacksonpradolima/gsp-py | MIT | ~150 | 2026 | Medium |

---

*Report generated by DeepSynaps Protocol Studio. All URLs verified as of 2026-05-16. Star counts are approximate and subject to change.*
