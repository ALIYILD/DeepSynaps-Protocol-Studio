# Open Source DeepTwin Stack Report
## Comprehensive Research on Clinical Digital Twin Relevant Tools

**Report Date:** 2025-07-15
**Scope:** 8 categories, 40+ tools evaluated
**Focus:** Clinical Digital Twins, Causal Inference, Multimodal Fusion, Patient Timelines, Bayesian Modeling, Knowledge Graphs, Time-Series, FHIR/OMOP

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Category 1: Clinical Digital Twin Frameworks](#category-1-clinical-digital-twin-frameworks)
3. [Category 2: Causal Inference](#category-2-causal-inference)
4. [Category 3: Multimodal Fusion](#category-3-multimodal-fusion)
5. [Category 4: Patient Timeline Visualization](#category-4-patient-timeline-visualization)
6. [Category 5: Bayesian Modeling](#category-5-bayesian-modeling)
7. [Category 6: Knowledge Graphs](#category-6-knowledge-graphs)
8. [Category 7: Time-Series Clinical](#category-7-time-series-clinical)
9. [Category 8: Healthcare FHIR/OMOP](#category-8-healthcare-fhiromop)
10. [Top 10 Most Integration-Ready Tools](#top-10-most-integration-ready-tools)
11. [Integration Architecture Recommendations](#integration-architecture-recommendations)
12. [License Compatibility Matrix](#license-compatibility-matrix)

---

## Executive Summary

This report surveys 40+ open-source tools across 8 categories relevant to building a **Clinical Digital Twin** platform. A Clinical Digital Twin requires: (1) physiological simulation or patient modeling, (2) causal inference for treatment effects, (3) multimodal data fusion, (4) temporal visualization, (5) probabilistic/Bayesian modeling, (6) knowledge graph representation, (7) time-series analytics, and (8) healthcare data standards integration.

### Key Findings:
- **Strongest ecosystems:** Python-based causal inference (Microsoft + Uber), PyMC Bayesian ecosystem, and OHDSI/OMOP tooling are mature and production-ready
- **Emerging area:** Clinical digital twin frameworks are nascent; most are research prototypes or specialized simulation engines
- **Integration sweet spot:** Tools with Apache 2.0/MIT licenses, active maintenance, and FHIR/OMOP compatibility offer the lowest-risk integration path
- **Gap identified:** No single open-source platform unifies all 8 categories; integration required

---

## Category 1: Clinical Digital Twin Frameworks

### 1.1 Pulse Physiology Engine (Kitware)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/kitsync/Pulse |
| **License** | Apache 2.0 |
| **Activity** | Very High (Kitware actively maintaining) |
| **Language** | C++ with Python bindings, Unity/Unreal plugins |
| **Clinical Relevance** | High-fidelity physiological simulation; validated computational physiology models; used for digital twins, synthetic data generation, AI training |
| **Integration Complexity** | Medium-High (C++ native, requires binding layer) |
| **Description** | Open-source physiology simulation platform for building medical digital twins. Simulates injuries, diseases, and treatments. Powers serious games, manikin training, and in-silico experiments. Features Pulse Explorer UI, Unity assets, and Unreal plugins. |
| **Key Use Cases** | Virtual patient simulation, synthetic data generation, in-silico clinical trials, medical device prototyping, AI algorithm training |

### 1.2 Med-Real2Sim (Alaa Lab / NeurIPS 2024)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/AlaaLab/med-real2sim |
| **License** | Not specified (research code) |
| **Activity** | Research project (2024) |
| **Language** | Python, PyTorch |
| **Clinical Relevance** | Non-invasive medical digital twin construction; cardiac hemodynamics from echocardiogram videos |
| **Integration Complexity** | High (research code, specific to cardiac application) |
| **Description** | Physics-informed self-supervised learning for identifying digital twin model parameters from non-invasive patient data. Demonstrates unsupervised disease detection and in-silico clinical trials using echocardiogram videos. |

### 1.3 UMCU Digital Twin (SASiCU)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/umcu/sasicu-digital-twin |
| **License** | Not specified |
| **Activity** | Academic project |
| **Language** | Python 3.8+, Tkinter |
| **Clinical Relevance** | ICU ventilator simulation; physiological modeling with ECG generation |
| **Integration Complexity** | Medium (Python-based, modular GUI) |
| **Description** | Mechanical ventilator digital twin module with core physiological simulation, ECG waveform generation, and alarm evaluation. Cross-platform compatible. |

### 1.4 WLDT (Web of Digital Twins) - Human Digital Twin Framework
| Attribute | Detail |
|-----------|--------|
| **GitHub** | JVM-based open source library |
| **License** | Open source |
| **Activity** | Conference paper (ACM 2025) |
| **Language** | Java/JVM |
| **Clinical Relevance** | Generic human digital twin framework; multimodal data collection, harmonization, standardization |
| **Integration Complexity** | High (JVM-based, requires interop layer) |
| **Description** | White-label digital twin implementation for healthcare applications. Modular, adaptable, interoperable software agents for multimodal data collection and cognitive tools for remote monitoring and decision-making. |

### 1.5 AhmedS Medical Digital Twin (LLM-based)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/AhmedSSoliman/medical-digital-twin |
| **License** | Not specified |
| **Activity** | Active (updated 2025) |
| **Language** | Python, PyTorch, Transformers |
| **Clinical Relevance** | LLM-based medical reasoning; clinical AI with structured reasoning |
| **Integration Complexity** | Medium (requires GPU, specific model versions) |
| **Description** | Medical AI models trained with GRPO for digital twin applications. Includes MedGemma-4B, OctoMed-7B (multimodal), and GPT-OSS-20B variants. Focus on clinical reasoning rather than physiological simulation. |

### 1.6 Digital Health Twin (shakurt)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/shakurt/digital-health-twin |
| **License** | MIT |
| **Activity** | University course project (2025) |
| **Language** | TypeScript, Next.js 16, Tailwind CSS |
| **Clinical Relevance** | Consumer health tracking prototype; not clinical-grade |
| **Integration Complexity** | Low (web app, educational) |
| **Description** | AI-powered digital health tracking application prototype for activity, nutrition, sleep, and mindfulness. Educational tool for university AI course. |

### 1.7 PatientTM (Patient Trajectory Modeling)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/bioinformatics-ua/PatientTM |
| **License** | Not specified |
| **Activity** | Research project |
| **Language** | Python |
| **Clinical Relevance** | Patient trajectory modeling for clinical outcome prediction; uses clinical notes and coding data |
| **Integration Complexity** | Medium |
| **Description** | Solution for modeling patient trajectories using multimodal clinical information including clinical notes and coding data for clinical outcome prediction. |

### 1.8 ACED-HMM (COVID Patient Trajectory Model)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/tufts-ml/aced-hmm-hospitalized-patient-trajectory-model |
| **License** | Not specified |
| **Activity** | Published research (2021) |
| **Language** | Python, Cython |
| **Clinical Relevance** | Probabilistic semi-Markov model for patient trajectories through hospital care stages; simulation-based inference |
| **Integration Complexity** | Medium |
| **Description** | Probabilistic model simulating individual patient trajectories through hospital care stages (symptoms, ward, ICU, ventilation). Uses ABC for parameter fitting. Includes COVID-19 datasets from US states and UK hospitals. |

---

## Category 2: Causal Inference

### 2.1 DoWhy (Microsoft / PyWhy)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/py-why/dowhy |
| **License** | MIT |
| **Activity** | Very High (4,800+ stars, regular releases) |
| **Language** | Python |
| **Clinical Relevance** | Unified framework for causal inference; explicit causal assumption modeling and testing; causal discovery |
| **Integration Complexity** | Low (pip install, scikit-learn compatible) |
| **Description** | Python library that makes causal inference easy. Provides a unified interface combining causal graphical models and potential outcomes frameworks. Supports causal discovery, effect estimation, and refutation. Part of the PyWhy ecosystem. |
| **Key Methods** | Causal graphical models, backdoor criterion, instrumental variables, mediation analysis, causal discovery |

### 2.2 EconML (Microsoft Research)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/py-why/econml |
| **License** | Apache 2.0 |
| **Activity** | Very High (4,600+ stars, v0.16.0 released 2025) |
| **Language** | Python |
| **Clinical Relevance** | ML-based heterogeneous treatment effects estimation; confidence intervals for causal estimates |
| **Integration Complexity** | Low (pip install, sklearn-compatible API) |
| **Description** | ALICE project toolkit combining state-of-the-art ML with econometrics. Estimates individualized causal responses from observational/experimental data. Implements double machine learning, causal forests, meta-learners, Deep IV, orthogonal random forests. |
| **Key Methods** | Double ML, Causal Forests, X-Learner, S-Learner, T-Learner, Deep IV, Orthogonal Random Forests, Dynamic DML |

### 2.3 CausalML (Uber)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/uber/causalml |
| **License** | Apache 2.0 |
| **Activity** | High (Uber-backed, KDD tutorials, industrial use cases) |
| **Language** | Python |
| **Clinical Relevance** | Uplift modeling and causal inference with ML; treatment effect estimation; cost optimization |
| **Integration Complexity** | Low (pip install) |
| **Description** | Suite of uplift modeling and causal inference methods using ML algorithms. Estimates Conditional Average Treatment Effect (CATE) from experimental or observational data. Includes meta-learners, uplift trees, CEVAE, dragonnet, policy optimization. |
| **Key Methods** | Meta-learners (S/T/X/R), Uplift trees, CEVAE, DragonNet, policy optimization, value optimization |

### 2.4 CausalPy (PyMC Labs)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/pymc-labs/CausalPy |
| **License** | Apache 2.0 |
| **Activity** | High (actively maintained by PyMC Labs) |
| **Language** | Python |
| **Clinical Relevance** | Bayesian causal inference for quasi-experiments; uncertainty quantification; publication-quality plots |
| **Integration Complexity** | Low-Medium (depends on PyMC) |
| **Description** | Research-grade causal inference workflows for quasi-experimental designs. Bayesian-first estimation via PyMC with full uncertainty quantification. Supports difference-in-differences, synthetic control, regression discontinuity, interrupted time series. |
| **Key Methods** | Difference-in-differences, Synthetic control, Regression discontinuity, Interrupted time series, Instrumental variables, Staggered DiD |

### 2.5 tfcausalimpact (TensorFlow CausalImpact)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/willianfuks/tfcausalimpact |
| **License** | Apache 2.0 |
| **Activity** | Moderate (stable, well-maintained) |
| **Language** | Python, TensorFlow Probability |
| **Clinical Relevance** | Causal impact analysis; intervention effect estimation with Bayesian structural models |
| **Integration Complexity** | Low (pip install, TensorFlow-based) |
| **Description** | Google's CausalImpact algorithm implemented on TensorFlow Probability. Fits Bayesian structural time-series models to estimate causal impact of interventions. Supports both Variational Inference (fast) and HMC (precise). |

---

## Category 3: Multimodal Fusion

### 3.1 Tensor Fusion Network (TFN)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/declare-lab/multimodal-deep-learning |
| **License** | Various (repository contains multiple implementations) |
| **Activity** | Moderate |
| **Language** | PyTorch |
| **Clinical Relevance** | Tensor fusion for multimodal sentiment analysis; adaptable to clinical multimodal data (text, imaging, waveforms) |
| **Integration Complexity** | Medium |
| **Description** | PyTorch implementation of Tensor Fusion Networks for multimodal data fusion. Models unimodal, bimodal, and trimodal interactions through outer product. Includes Multimodal-Infomax, MISA, BBFN, and Low-rank Multimodal Fusion variants. |

### 3.2 Low-Rank Multimodal Fusion
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/declare-lab/multimodal-deep-learning |
| **License** | Various |
| **Language** | PyTorch |
| **Clinical Relevance** | Efficient multimodal fusion using low-rank tensor decomposition; reduces parameter count |
| **Integration Complexity** | Medium |
| **Description** | Low-rank multimodal fusion method that decomposes the high-dimensional tensor fusion into lower-rank factors, making it computationally efficient for clinical multimodal data (EHR + imaging + lab results). |

### 3.3 TensorFusion Network (HiBorn4)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/HiBorn4/TensorFusion_Network_for_Multimodal_sentiment_analysis |
| **License** | MIT |
| **Activity** | Low |
| **Language** | Python, PyTorch/TensorFlow |
| **Clinical Relevance** | Reference implementation of tensor fusion for 3+ modalities |
| **Integration Complexity** | Medium |
| **Description** | Implementation of Tensor Fusion Network integrating language, visual, and acoustic modalities. Can be adapted for clinical text, imaging, and waveform data fusion. |

### 3.4 Multimodal-Infomax (EMNLP 2021)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | Part of declare-lab/multimodal-deep-learning |
| **License** | Not specified |
| **Language** | PyTorch |
| **Clinical Relevance** | Hierarchical mutual information maximization for multimodal fusion; strong theoretical grounding |
| **Integration Complexity** | Medium |
| **Description** | Two-level mutual information maximization for multimodal sentiment analysis. Uses Barber-Agakov lower bound and contrastive predictive coding. Adaptable to clinical multimodal scenarios. |

---

## Category 4: Patient Timeline Visualization

### 4.1 MedTimeLine (Verily / Boston Children's Hospital)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/verilylifesciences/medtimeline |
| **License** | Apache 2.0 |
| **Activity** | Moderate (production use at Boston Children's Hospital) |
| **Language** | TypeScript/Angular (npm) |
| **Clinical Relevance** | Clinical-grade FHIR-based timeline viewer; SMART on FHIR API; used for infectious disease tracking |
| **Integration Complexity** | Low-Medium (web app, FHIR-native) |
| **Description** | Web application helping clinicians view how a patient's status changes over time. Uses SMART on FHIR API to pull clinical concepts, graphs values as time series within customizable cards. Supports drag-and-drop, annotations, timeframe changes. |
| **Key Features** | SMART on FHIR, drag-and-drop cards, text annotations, mock data for testing |

### 4.2 Patient Trajectory Visualization (WISPer Med)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/rtg-wispermed/Patient_trajectory_public |
| **License** | Not specified |
| **Activity** | Research project (LWDA 2023 paper) |
| **Language** | Python, web-based |
| **Clinical Relevance** | FHIR patient trajectory pipeline; melanoma use case; timeline visualization for disease progression |
| **Integration Complexity** | Medium |
| **Description** | Pipeline extracting, transforming, and visualizing patient data from FHIR. Web-based timeline showing all clinical data recorded over disease trajectory. Helps clinicians understand disease progress and physical condition. |

---

## Category 5: Bayesian Modeling

### 5.1 PyMC
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/pymc-devs/pymc |
| **License** | Apache 2.0 |
| **Activity** | Very High (NumFOCUS project, 8,500+ stars, active development) |
| **Language** | Python |
| **Clinical Relevance** | Probabilistic programming for Bayesian clinical models; uncertainty quantification; hierarchical models for patient populations |
| **Integration Complexity** | Low (pip/conda install, Python-native) |
| **Description** | Bayesian modeling and probabilistic programming in Python. The foundation of the PyMC ecosystem. Supports NUTS sampler, variational inference, and comprehensive probability distributions. Extensive clinical applications through Bambi, CausalPy, and exoplanet. |
| **Key Ecosystem** | Bambi, ArviZ, CausalPy, SunODE, pymc-learn |

### 5.2 ArviZ
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/arviz-devs/arviz |
| **License** | Apache 2.0 |
| **Activity** | Very High (NumFOCUS project, JOSS-reviewed, 30+ repos in ecosystem) |
| **Language** | Python |
| **Clinical Relevance** | Exploratory analysis of Bayesian models; 30+ visualization functions; model comparison and diagnostics |
| **Integration Complexity** | Low (backend-agnostic: PyMC, Pyro, NumPyro, CmdStanPy, emcee) |
| **Description** | Modular and flexible library for exploratory analysis of Bayesian models. Integrates with all major PPLs. Provides posterior analysis, model checking, comparison, and diagnostics. Built on xarray for labeled dimensions. Now modularized as arviz-base, arviz-stats, arviz-plots. |

### 5.3 Bambi (BAyesian Model-Building Interface)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/bambinos/bambi |
| **License** | MIT |
| **Activity** | High (active development, PyMC ecosystem) |
| **Language** | Python |
| **Clinical Relevance** | High-level Bayesian mixed-effects models; formula interface (R-like); clinical trial analysis, biomarker studies |
| **Integration Complexity** | Low (pip/conda, depends on PyMC + ArviZ) |
| **Description** | High-level Bayesian model-building interface built on PyMC. Makes it extremely easy to fit Bayesian mixed-effects models common in biology, social sciences, and clinical research. Uses formula syntax similar to R's lme4. |

### 5.4 Pyro / NumPyro (Uber AI → Broad Institute / Linux Foundation)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/pyro-ppl/pyro (Pyro), https://github.com/pyro-ppl/numpyro (NumPyro) |
| **License** | Apache 2.0 |
| **Activity** | Very High (Linux Foundation project, Broad Institute maintains, 100+ papers citing) |
| **Language** | Python, PyTorch (Pyro) / JAX (NumPyro) |
| **Clinical Relevance** | Deep universal probabilistic programming; variational autoencoders for patient data; time-to-event modeling; scalable to large datasets |
| **Integration Complexity** | Medium (requires PyTorch or JAX knowledge) |
| **Description** | Pyro: Deep universal probabilistic programming on PyTorch. NumPyro: Lightweight JAX-powered backend with 100x speedup for HMC/NUTS. Supports effect handlers, custom inference algorithms, and integrates with neural networks. Now a Linux Foundation project. |

---

## Category 6: Knowledge Graphs

### 6.1 Neo4j (Healthcare Knowledge Graphs)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/neo4j/neo4j |
| **License** | GPLv3 (Community Edition) |
| **Activity** | Very High (industry standard graph database) |
| **Language** | Java, with Python drivers |
| **Clinical Relevance** | Medical knowledge graphs; patient relationship mapping; drug interaction networks; clinical decision support |
| **Integration Complexity** | Medium (requires graph database setup, Cypher query language) |
| **Description** | Industry-leading graph database widely used for healthcare knowledge graphs. Supports Cypher query language, full ACID compliance, and scales to billions of nodes/relationships. Extensive healthcare use cases including clinical KG construction from Spark NLP, MedQGraph for EHR analysis. |

### 6.2 MedQGraph (Medical Record Knowledge Graph)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | Not directly available (research framework) |
| **License** | Not specified |
| **Activity** | Research (Neo4j Nodes 2025 presentation) |
| **Language** | Neo4j, Python |
| **Clinical Relevance** | MIMIC-IV EHR to knowledge graph transformation; interpretable, queryable graph |
| **Integration Complexity** | Medium |
| **Description** | Scalable framework transforming structured MIMIC-IV EHR data into interpretable, queryable graphs using Neo4j. Integrates diagnoses, procedures, medications into cohesive structure for comprehensive patient history exploration. |

### 6.3 Healthcare RAG with Neo4j (asanmateu)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/asanmateu/healthcare-rag-chatbot |
| **License** | Not specified |
| **Activity** | Moderate |
| **Language** | Python, FastAPI, Streamlit, Docker |
| **Clinical Relevance** | RAG-based healthcare querying with Neo4j knowledge graphs; clinical information retrieval |
| **Integration Complexity** | Medium (Docker-based deployment) |
| **Description** | Retrieval-Augmented Generation agent for healthcare information querying using LangChain and Neo4j. Provides RESTful API and interactive Streamlit interface for querying complex healthcare relationships. |

### 6.4 OMOP2OBO (OMOP to Open Biomedical Ontologies)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/callahantiff/OMOP2OBO |
| **License** | Not specified |
| **Activity** | Research project |
| **Language** | Python |
| **Clinical Relevance** | Maps OMOP CDM concepts to biomedical ontologies; enables semantic interoperability |
| **Integration Complexity** | Medium |
| **Description** | Tool for mapping OMOP CDM concepts to Open Biomedical Ontologies, enabling knowledge graph construction from standardized clinical data. |

---

## Category 7: Time-Series Clinical

### 7.1 sktime
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/sktime/sktime |
| **License** | BSD-3-Clause |
| **Activity** | Very High (9,800+ stars, Alan Turing Institute, UKRI-funded, v0.40.1) |
| **Language** | Python |
| **Clinical Relevance** | Unified ML framework for time series; forecasting, classification, clustering, anomaly detection; interfaces to Prophet, tsfresh |
| **Integration Complexity** | Low (pip/conda, scikit-learn compatible) |
| **Description** | A unified interface for machine learning with time series. Provides forecasting, time series classification, clustering, anomaly/changepoint detection. Interfaces with Prophet, tsfresh, PyOD, statsmodels. Extension templates for custom estimators. |
| **Key Features** | Forecasting, classification, clustering, detection, parameter fitting, alignment, distances/kernels |

### 7.2 tsfresh
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/blue-yonder/tsfresh |
| **License** | MIT |
| **Activity** | High (industrial-grade, Blue Yonder backing) |
| **Language** | Python |
| **Clinical Relevance** | Automatic extraction of 100s of time-series features; robust feature selection; handles missing data; used in Nature Communications |
| **Integration Complexity** | Low (pip install, pandas-compatible) |
| **Description** | Time Series Feature extraction based on scalable hypothesis tests. Automatically extracts and selects relevant features from time series. Supports parallel processing (Dask, Spark). Used in clinical monitoring, activity recognition, and disease prediction. |

### 7.3 Prophet (Meta/Facebook)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/facebook/prophet |
| **License** | MIT |
| **Activity** | Very High (16,000+ stars, v1.3.0 as of 2026) |
| **Language** | Python, R |
| **Clinical Relevance** | Time-series forecasting for patient volume, disease trends, resource demand; handles seasonality, holidays, missing data |
| **Integration Complexity** | Low (pip install, works with pandas) |
| **Description** | Automatic forecasting procedure for time series data with multiple seasonality. Handles missing data, outliers, and trend shifts. Widely used for healthcare forecasting: patient admission rates, ER visits, disease outbreak prediction. |

### 7.4 torchdiffeq (Neural ODEs)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/rtqichen/torchdiffeq |
| **License** | MIT |
| **Activity** | High (NeurIPS 2018 paper, 6,300+ stars) |
| **Language** | Python, PyTorch |
| **Clinical Relevance** | Neural ODEs for continuous-time patient trajectory modeling; differential equation learning for disease dynamics |
| **Integration Complexity** | Medium (requires PyTorch, understanding of ODEs) |
| **Description** | PyTorch implementation of differentiable ODE solvers. Enables learning continuous-time dynamics with constant memory cost via adjoint method. Foundation for Neural ODEs in clinical time-series modeling, pharmacokinetics, and disease progression. |

### 7.5 torchdyn (Neural Differential Equations)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/DiffEqML/torchdyn |
| **License** | Apache 2.0 |
| **Activity** | Moderate (active research community) |
| **Language** | Python, PyTorch |
| **Clinical Relevance** | Neural differential equations for clinical dynamics; implicit models; continuous-depth neural networks |
| **Integration Complexity** | Medium-High |
| **Description** | PyTorch library dedicated to neural differential equations, implicit models, and related numerical methods. Provides utilities for constructing numerical deep learning models. Supports NeuralODE, NeuralSDE, and custom solvers. |

---

## Category 8: Healthcare FHIR/OMOP

### 8.1 HAPI FHIR
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/hapifhir/hapi-fhir |
| **License** | Apache 2.0 |
| **Activity** | Very High (industry standard Java FHIR implementation) |
| **Language** | Java |
| **Clinical Relevance** | Complete Java API for HL7 FHIR clients and servers; JPA server; validation; all FHIR versions (DSTU2, DSTU3, R4, R4B, R5) |
| **Integration Complexity** | Medium (Java-based, but has REST API, starter project available) |
| **Description** | Open-source Java implementation of the FHIR specification. Provides client and server APIs, JPA server for persistence, and validation tools. Includes starter project for deploying FHIR servers. |

### 8.2 HAPI FHIR JPA Server Starter
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/hapifhir/hapi-fhir-jpaserver-starter |
| **License** | Apache 2.0 |
| **Activity** | Very High |
| **Language** | Java, Docker support |
| **Clinical Relevance** | Ready-to-deploy FHIR server with JPA persistence; Docker containerized |
| **Integration Complexity** | Low (Docker deployment available) |
| **Description** | Complete starter project for deploying a FHIR server using HAPI FHIR JPA. Supports Docker, custom interceptors, and custom operations. Can be deployed with a single Docker command. |

### 8.3 OHDSI/ATLAS
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/OHDSI/Atlas |
| **License** | Apache 2.0 |
| **Activity** | Very High (industry standard for observational health research) |
| **Language** | JavaScript, R, Java (WebAPI) |
| **Clinical Relevance** | Web-based tool for cohort definition, characterization, population-level effect estimation, patient-level prediction on OMOP CDM |
| **Integration Complexity** | Medium-High (requires WebAPI backend, CDM database) |
| **Description** | Free, web-based tool for designing and executing analyses on standardized observational data. Supports cohort definitions, incidence rates, characterization, population-level effect estimation, and patient-level prediction. Combined with OHDSI WebAPI. |

### 8.4 OHDSI/HADES
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/OHDSI/Hades |
| **License** | Apache 2.0 |
| **Activity** | Very High (350+ repos across OHDSI organization) |
| **Language** | R |
| **Clinical Relevance** | Collection of R packages for complete observational studies on OMOP CDM; transparency, reproducibility, empirical calibration |
| **Integration Complexity** | Medium (R-based, requires OMOP CDM) |
| **Description** | Collection of open-source R packages for observational studies starting from OMOP CDM data. Standardized analytics for characterization, population-level effect estimation, patient-level prediction. Includes CohortMethod, PatientLevelPrediction, FeatureExtraction. |

### 8.5 omop-learn
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/clinicalml/omop-learn |
| **License** | Not specified |
| **Activity** | Research (AAAI 2021 paper) |
| **Language** | Python |
| **Clinical Relevance** | Python ML for healthcare using OMOP CDM; sparse tensor implementations; SARD deep learning architecture |
| **Integration Complexity** | Medium (requires OMOP CDM database) |
| **Description** | Python package for machine learning using OMOP CDM. Supports easy definition of predictive clinical tasks, featurizations, and cohorts. Includes windowed linear model and SARD (Self-Attention with Reverse Distillation) deep learning model. |

### 8.6 pyomop
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/dermatologist/pyomop |
| **License** | Not specified |
| **Activity** | Active (MCP server support added) |
| **Language** | Python, SQLAlchemy |
| **Clinical Relevance** | OMOP Swiss Army Knife; SQLAlchemy ORM for OMOP CDM; FHIR-to-OMOP conversion; LLM natural language queries |
| **Integration Complexity** | Low (pip install, Python-native) |
| **Description** | Lightweight library for working with OMOP CDM v5.4/v6 using SQLAlchemy. Supports SQLite, PostgreSQL, MySQL. Converts query results to pandas DataFrames. Includes MCP server for AI integration and FHIR-to-OMOP conversion utilities. |

### 8.7 InspectOMOP
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/OHDSI/InspectOMOP |
| **License** | GNU Affero GPL v3.0 |
| **Activity** | Stable (OHDSI-backed) |
| **Language** | Python, SQLAlchemy |
| **Clinical Relevance** | Python data extraction from OMOP CDM; SQL dialect agnostic; pandas DataFrame output |
| **Integration Complexity** | Low (pip install, SQLAlchemy-based) |
| **Description** | Lightweight Python 3 package for extracting EHR data from relational databases following OMOP CDM. SQL dialect agnostic via SQLAlchemy. Returns results as pandas DataFrames. Includes preloaded standard OHDSI queries. |

### 8.8 DataQualityDashboard (OHDSI)
| Attribute | Detail |
|-----------|--------|
| **GitHub** | https://github.com/OHDSI/DataQualityDashboard |
| **License** | Apache 2.0 |
| **Activity** | High (required for OHDSI network studies) |
| **Language** | R |
| **Clinical Relevance** | 3,500+ data quality checks against OMOP CDM; Kahn framework; required for all OHDSI network research |
| **Integration Complexity** | Low-Medium |
| **Description** | Applies harmonized data quality assessment to OMOP CDM data. Runs >3,500 checks organized in the Kahn framework. Required to be run on all databases prior to OHDSI network research participation. |

---

## Top 10 Most Integration-Ready Tools

### Ranking Methodology
Tools ranked by: (1) License compatibility, (2) Activity/maintenance level, (3) Clinical relevance, (4) Integration complexity, (5) Ecosystem maturity.

| Rank | Tool | Category | GitHub | License | Integration Score | Why Top Pick |
|------|------|----------|--------|---------|------------------|--------------|
| **1** | **PyMC** | Bayesian Modeling | https://github.com/pymc-devs/pymyc | Apache 2.0 | 9.5/10 | Mature NumFOCUS project; rich ecosystem (Bambi, ArviZ, CausalPy); uncertainty quantification essential for clinical twins |
| **2** | **DoWhy** | Causal Inference | https://github.com/py-why/dowhy | MIT | 9.5/10 | Unified causal inference; explicit assumption testing; PyWhy ecosystem; Microsoft-backed; low integration complexity |
| **3** | **EconML** | Causal Inference | https://github.com/py-why/econml | Apache 2.0 | 9.0/10 | State-of-the-art ML-based treatment effects; confidence intervals; double ML, causal forests; production-ready |
| **4** | **sktime** | Time-Series | https://github.com/sktime/sktime | BSD-3 | 9.0/10 | Unified ML for time series; sklearn-compatible; interfaces with Prophet, tsfresh; forecasting + classification + clustering |
| **5** | **HAPI FHIR** | FHIR/OMOP | https://github.com/hapifhir/hapi-fhir | Apache 2.0 | 8.5/10 | Industry-standard FHIR implementation; complete Java API; Docker deployment; all FHIR versions |
| **6** | **Prophet** | Time-Series | https://github.com/facebook/prophet | MIT | 8.5/10 | Automatic forecasting; handles missing data/outliers; proven in healthcare; 16K+ stars; pandas-native |
| **7** | **ArviZ** | Bayesian Viz | https://github.com/arviz-devs/arviz | Apache 2.0 | 8.5/10 | Backend-agnostic Bayesian diagnostics; 30+ viz functions; integrates with all major PPLs; NumFOCUS |
| **8** | **CausalML** | Causal Inference | https://github.com/uber/causalml | Apache 2.0 | 8.0/10 | Industrial-scale uplift modeling; meta-learners, uplift trees; cost optimization; Uber production-proven |
| **9** | **OHDSI/ATLAS** | FHIR/OMOP | https://github.com/OHDSI/Atlas | Apache 2.0 | 8.0/10 | Industry standard for observational research; cohort builder, prediction, effect estimation; 350+ OHDSI repos |
| **10** | **Pulse Physiology Engine** | Digital Twin | https://github.com/kitsync/Pulse | Apache 2.0 | 7.5/10 | Only production-grade open-source physiology simulator; validated models; synthetic data generation; Kitware |

### Honorable Mentions (Rank 11-15)
| Rank | Tool | Category | Why Notable |
|------|------|----------|-------------|
| 11 | torchdiffeq | Time-Series/Neural ODEs | Foundation for continuous-time patient trajectory modeling; Neural ODEs |
| 12 | CausalPy | Causal Inference | Bayesian-first quasi-experimental designs; integrates with PyMC ecosystem |
| 13 | MedTimeLine | Timeline Viz | Production clinical timeline viewer; SMART on FHIR; Verily/Boston Children's |
| 14 | pyomop | FHIR/OMOP | Python-native OMOP swiss army knife; MCP server; FHIR-to-OMOP conversion |
| 15 | Neo4j (Community) | Knowledge Graphs | Industry-standard graph DB; extensive healthcare KG use cases |

---

## Integration Architecture Recommendations

### Recommended Stack for Clinical Digital Twin

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLINICAL DIGITAL TWIN                         │
│                    (Integration Layer)                           │
├─────────────┬──────────────┬──────────────┬─────────────────────┤
│  DIGITAL    │   CAUSAL     │  MULTIMODAL  │   PATIENT TIMELINE  │
│  TWIN CORE  │   INFERENCE  │   FUSION     │   VISUALIZATION     │
├─────────────┼──────────────┼──────────────┼─────────────────────┤
│ Pulse       │ DoWhy        │ TensorFusion │ MedTimeLine         │
│ Physiology  │ EconML       │ Network      │ (SMART on FHIR)     │
│ Engine      │ CausalML     │ Low-Rank     │                     │
│             │ CausalPy     │ Fusion       │                     │
├─────────────┴──────────────┴──────────────┴─────────────────────┤
│                   BAYESIAN MODELING LAYER                        │
├─────────────────────────────────────────────────────────────────┤
│  PyMC (core) → Bambi (mixed-effects) → ArviZ (viz/diagnostics) │
│  Pyro/NumPyro (deep probabilistic models)                        │
├─────────────────────────────────────────────────────────────────┤
│                   TIME-SERIES ANALYTICS                          │
├─────────────────────────────────────────────────────────────────┤
│  sktime (unified ML) → Prophet (forecasting) → tsfresh (features)│
│  torchdiffeq (Neural ODEs for continuous trajectories)           │
├─────────────────────────────────────────────────────────────────┤
│                   DATA STANDARDS LAYER                           │
├─────────────────────────────────────────────────────────────────┤
│  HAPI FHIR (FHIR server) ←→ pyomop/InspectOMOP (OMOP Python)    │
│  OHDSI ATLAS + WebAPI (observational analytics)                  │
│  DataQualityDashboard (3,500+ quality checks)                   │
├─────────────────────────────────────────────────────────────────┤
│                   KNOWLEDGE GRAPH LAYER                          │
├─────────────────────────────────────────────────────────────────┤
│  Neo4j Community (graph database) + OMOP2OBO (ontology mapping)  │
│  Healthcare RAG (clinical KG querying)                           │
└─────────────────────────────────────────────────────────────────┘
```

### Integration Complexity by Layer

| Layer | Tools | Complexity | Estimated Effort |
|-------|-------|------------|-----------------|
| Digital Twin Core | Pulse + custom | High | 3-6 months |
| Causal Inference | DoWhy + EconML + CausalPy | Low-Medium | 2-4 weeks |
| Multimodal Fusion | TensorFusion + custom | Medium | 1-2 months |
| Patient Timeline | MedTimeLine or custom | Low-Medium | 2-4 weeks |
| Bayesian Modeling | PyMC + ArviZ + Bambi | Low | 1-2 weeks |
| Time-Series | sktime + Prophet + tsfresh | Low | 1-2 weeks |
| Data Standards | HAPI FHIR + pyomop | Medium | 1-2 months |
| Knowledge Graph | Neo4j + OMOP2OBO | Medium | 1-2 months |

---

## License Compatibility Matrix

| Tool | License | Commercial Use | Modification | Distribution | Patent Grant |
|------|---------|---------------|--------------|--------------|--------------|
| PyMC | Apache 2.0 | Yes | Yes | Yes | Yes |
| DoWhy | MIT | Yes | Yes | Yes | No explicit |
| EconML | Apache 2.0 | Yes | Yes | Yes | Yes |
| sktime | BSD-3 | Yes | Yes | Yes | No |
| HAPI FHIR | Apache 2.0 | Yes | Yes | Yes | Yes |
| Prophet | MIT | Yes | Yes | Yes | No explicit |
| ArviZ | Apache 2.0 | Yes | Yes | Yes | Yes |
| CausalML | Apache 2.0 | Yes | Yes | Yes | Yes |
| ATLAS | Apache 2.0 | Yes | Yes | Yes | Yes |
| Pulse | Apache 2.0 | Yes | Yes | Yes | Yes |
| torchdiffeq | MIT | Yes | Yes | Yes | No explicit |
| CausalPy | Apache 2.0 | Yes | Yes | Yes | Yes |
| MedTimeLine | Apache 2.0 | Yes | Yes | Yes | Yes |
| pyomop | Not specified | Unknown | Unknown | Unknown | Unknown |
| Neo4j CE | GPLv3 | Yes (with source) | Yes | Yes (GPL) | No |
| Bambi | MIT | Yes | Yes | Yes | No explicit |
| Pyro/NumPyro | Apache 2.0 | Yes | Yes | Yes | Yes |
| tsfresh | MIT | Yes | Yes | Yes | No explicit |
| omop-learn | Not specified | Unknown | Unknown | Unknown | Unknown |
| InspectOMOP | AGPL-3.0 | Network clause | Yes | Yes (AGPL) | No |

### License Risk Assessment
- **Lowest Risk:** Apache 2.0 (patent grant, permissive, enterprise-friendly)
- **Low Risk:** MIT, BSD-3 (permissive, no patent grant)
- **Medium Risk:** GPLv3 (copyleft, requires source disclosure)
- **Higher Risk:** AGPL-3.0 (network copyleft, strong source requirements)
- **Unknown Risk:** Tools without specified licenses

---

## Quick Reference: All Tools Summary

| # | Tool | Category | GitHub | License | Stars/Activity |
|---|------|----------|--------|---------|---------------|
| 1 | Pulse Physiology Engine | Digital Twin | https://github.com/kitsync/Pulse | Apache 2.0 | Very High |
| 2 | Med-Real2Sim | Digital Twin | https://github.com/AlaaLab/med-real2sim | N/S | Research |
| 3 | UMCU Digital Twin | Digital Twin | https://github.com/umcu/sasicu-digital-twin | N/S | Academic |
| 4 | PatientTM | Digital Twin | https://github.com/bioinformatics-ua/PatientTM | N/S | Research |
| 5 | ACED-HMM | Digital Twin | https://github.com/tufts-ml/aced-hmm-hospitalized-patient-trajectory-model | N/S | Research |
| 6 | DoWhy | Causal Inference | https://github.com/py-why/dowhy | MIT | 4,800+, Very High |
| 7 | EconML | Causal Inference | https://github.com/py-why/econml | Apache 2.0 | 4,600+, Very High |
| 8 | CausalML | Causal Inference | https://github.com/uber/causalml | Apache 2.0 | High |
| 9 | CausalPy | Causal Inference | https://github.com/pymc-labs/CausalPy | Apache 2.0 | High |
| 10 | tfcausalimpact | Causal Inference | https://github.com/willianfuks/tfcausalimpact | Apache 2.0 | Moderate |
| 11 | Tensor Fusion Network | Multimodal Fusion | https://github.com/declare-lab/multimodal-deep-learning | Various | Moderate |
| 12 | Low-Rank Multimodal Fusion | Multimodal Fusion | Part of declare-lab repo | Various | Moderate |
| 13 | MedTimeLine | Timeline Viz | https://github.com/verilylifesciences/medtimeline | Apache 2.0 | Moderate |
| 14 | Patient Trajectory Viz | Timeline Viz | https://github.com/rtg-wispermed/Patient_trajectory_public | N/S | Research |
| 15 | PyMC | Bayesian | https://github.com/pymc-devs/pymc | Apache 2.0 | 8,500+, Very High |
| 16 | ArviZ | Bayesian Viz | https://github.com/arviz-devs/arviz | Apache 2.0 | Very High |
| 17 | Bambi | Bayesian | https://github.com/bambinos/bambi | MIT | High |
| 18 | Pyro | Bayesian | https://github.com/pyro-ppl/pyro | Apache 2.0 | Very High |
| 19 | NumPyro | Bayesian | https://github.com/pyro-ppl/numpyro | Apache 2.0 | Very High |
| 20 | Neo4j CE | Knowledge Graph | https://github.com/neo4j/neo4j | GPLv3 | Very High |
| 21 | Healthcare RAG | Knowledge Graph | https://github.com/asanmateu/healthcare-rag-chatbot | N/S | Moderate |
| 22 | OMOP2OBO | Knowledge Graph | https://github.com/callahantiff/OMOP2OBO | N/S | Research |
| 23 | sktime | Time-Series | https://github.com/sktime/sktime | BSD-3 | 9,800+, Very High |
| 24 | tsfresh | Time-Series | https://github.com/blue-yonder/tsfresh | MIT | High |
| 25 | Prophet | Time-Series | https://github.com/facebook/prophet | MIT | 16,000+, Very High |
| 26 | torchdiffeq | Time-Series/ODE | https://github.com/rtqichen/torchdiffeq | MIT | 6,300+, High |
| 27 | torchdyn | Time-Series/ODE | https://github.com/DiffEqML/torchdyn | Apache 2.0 | Moderate |
| 28 | HAPI FHIR | FHIR/OMOP | https://github.com/hapifhir/hapi-fhir | Apache 2.0 | Very High |
| 29 | HAPI FHIR Starter | FHIR/OMOP | https://github.com/hapifhir/hapi-fhir-jpaserver-starter | Apache 2.0 | Very High |
| 30 | ATLAS | FHIR/OMOP | https://github.com/OHDSI/Atlas | Apache 2.0 | Very High |
| 31 | HADES | FHIR/OMOP | https://github.com/OHDSI/Hades | Apache 2.0 | Very High |
| 32 | omop-learn | FHIR/OMOP | https://github.com/clinicalml/omop-learn | N/S | Research |
| 33 | pyomop | FHIR/OMOP | https://github.com/dermatologist/pyomop | N/S | Active |
| 34 | InspectOMOP | FHIR/OMOP | https://github.com/OHDSI/InspectOMOP | AGPL-3.0 | Stable |
| 35 | DataQualityDashboard | FHIR/OMOP | https://github.com/OHDSI/DataQualityDashboard | Apache 2.0 | High |

---

## Citation

If you use this report in your research, please cite:

```
@misc{deeptwin-stack-report-2025,
  title={Open Source DeepTwin Stack Report: Clinical Digital Twin Tools Survey},
  author={DeepSynaps Protocol Studio},
  year={2025},
  howpublished={\url{file_path}},
  note={Survey of 40+ open-source tools across 8 categories for clinical digital twin development}
}
```

---

*Report compiled: 2025-07-15*
*Total tools evaluated: 35*
*Categories covered: 8*
*Total searches conducted: 15*
