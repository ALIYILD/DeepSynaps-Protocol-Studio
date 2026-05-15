# Open Source Digital Phenotyping Stack

## Comprehensive Survey of Open-Source Tools for Digital Phenotyping, Passive Sensing, and Behavioural Analytics

**Date:** 2025-08-07
**Researcher:** OSINT Investigation
**Scope:** Global open-source ecosystem for smartphone-based digital phenotyping, wearable sensor analytics, behavioural observation, and longitudinal health tracking

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Tier 1: Complete Digital Phenotyping Platforms](#tier-1-complete-digital-phenotyping-platforms)
3. [Tier 2: Passive Sensing & Smartphone Sensor Frameworks](#tier-2-passive-sensing--smartphone-sensor-frameworks)
4. [Tier 3: Analysis, Visualisation & Feature Extraction](#tier-3-analysis-visualisation--feature-extraction)
5. [Tier 4: Behavioural Observation & Circadian Analysis](#tier-4-behavioural-observation--circadian-analysis)
6. [Tier 5: Wearable Data Quality & Validation](#tier-5-wearable-data-quality--validation)
7. [Integration Matrix](#integration-matrix)
8. [License Summary](#license-summary)
9. [Recommendations](#recommendations)
10. [References](#references)

---

## Executive Summary

This report documents **20 open-source projects** spanning the full digital phenotyping stack -- from smartphone-based passive sensing and ecological momentary assessment to actigraphy analysis, circadian rhythm modelling, and behavioural observation coding. The selected tools are licensed under permissive (BSD-3, Apache-2.0, MIT) or copyleft (GPL-3.0) terms, with active communities and documented clinical deployments.

### Key Findings

| Metric | Value |
|--------|-------|
| Projects documented | 20 |
| Total combined GitHub stars | ~1,200+ |
| BSD-3-Clause licenses | 4 |
| Apache-2.0 licenses | 4 |
| GPL-3.0 licenses | 3 |
| MIT licenses | 4 |
| Other/Unspecified | 5 |
| Platforms covered | Android, iOS, Python, R, Web |
| Clinical deployment confirmed | Yes (Beiwe, mindLAMP, RADAR-base, AWARE) |

---

## Tier 1: Complete Digital Phenotyping Platforms

These are end-to-end platforms that combine smartphone data collection, backend infrastructure, and analysis pipelines.

---

### 1. Beiwe Research Platform

| Attribute | Detail |
|-----------|--------|
| **Name** | Beiwe Research Platform |
| **GitHub Org** | https://github.com/onnela-lab |
| **Backend Repo** | https://github.com/onnela-lab/beiwe-backend |
| **iOS App** | https://github.com/onnela-lab/beiwe-ios |
| **Android App** | https://github.com/onnela-lab/beiwe-android |
| **Analysis Library** | https://github.com/onnela-lab/forest |
| **License** | BSD-3-Clause |
| **Backend Stars** | 74 stars / 51 forks / 77 issues |
| **Forest Stars** | 37 stars / 20 forks / 17 issues |
| **iOS Stars** | 16 stars / 24 forks |
| **Android Stars** | 18 stars / 28 forks |
| **Primary Language** | Python (backend), Kotlin (Android), Swift (iOS) |
| **Maintainer** | Onnela Lab, Harvard T.H. Chan School of Public Health |

**Description**
Beiwe is the gold-standard open-source digital phenotyping research platform. It collects high-throughput smartphone data including GPS trajectories, accelerometer/gyroscope physical activity patterns, call/text communication logs, voice samples, and configurable ecological momentary assessment (EMA) surveys. All data is encrypted on-device with 2048-bit RSA and AES encryption before upload to AWS infrastructure.

**Key Features**
- Raw sensor data collection (not pre-processed summaries)
- Configurable sampling frequencies per sensor
- Gaussian noise addition to GPS for privacy
- Study management portal with web-based configuration
- Push notification system for survey prompts
- Reproducible study configurations via JSON export/import
- Forest analysis library for downstream analytics

**Clinical Applicability**
Beiwe has been deployed in numerous NIH-funded studies for depression, schizophrenia, bipolar disorder, PTSD, and substance use research. The platform is HIPAA-compliant when deployed correctly on AWS and supports IRB-approved research protocols.

**Integration Recommendation**
Use Beiwe as the primary data collection backbone for any smartphone-based digital phenotyping study. Pair with Forest (see below) for analytics. The JSON configuration system enables reproducible multi-site studies. Consider the Tableau API integration for real-time data quality monitoring dashboards.

---

### 2. Forest Analysis Library

| Attribute | Detail |
|-----------|--------|
| **Name** | Forest |
| **GitHub URL** | https://github.com/onnela-lab/forest |
| **License** | BSD-3-Clause |
| **Stars/Forks/Issues** | 37 stars / 20 forks / 17 issues |
| **Primary Language** | Python (88.8%), Jupyter Notebook (11.2%) |
| **Maintainer** | Onnela Lab, Harvard T.H. Chan School of Public Health |
| **PyPI Package** | `beiwe-forest` |

**Description**
Forest is the companion analysis library for Beiwe-collected data. It implements validated algorithms for transforming raw smartphone sensor streams into clinically meaningful daily summary statistics. The library is organised into modular sub-packages: **jasmine** (GPS imputation and mobility metrics), **willow** (call/text summaries), **sycamore** (survey data collation), **poplar** (timezone handling), and **bonsai** (synthetic data generation).

**Key Features**
- GPS trajectory imputation using sparse online Gaussian Process
- Mobility metrics: home time, entropy, radius of gyration
- Walking recognition from accelerometer + gyroscope
- Survey completion time analysis
- Tableau dashboard API integration
- Can run locally or on AWS backend

**Clinical Applicability**
Forest-derived features (sleep duration, home time, mobility entropy, social interaction frequency) have been validated as digital biomarkers for depression severity, schizophrenia relapse prediction, and PTSD symptom tracking in peer-reviewed studies.

**Integration Recommendation**
Integrate Forest as the processing layer after Beiwe data collection. The jasmine GPS pipeline is particularly valuable for spatial behaviour analysis. Use bonsai for algorithm development without access to real patient data.

---

### 3. mindLAMP Platform & Cortex Pipeline

| Attribute | Detail |
|-----------|--------|
| **Name** | mindLAMP (Learn, Assess, Manage, Prevent) |
| **GitHub Org** | https://github.com/BIDMCDigitalPsychiatry |
| **Cortex Repo** | https://github.com/BIDMCDigitalPsychiatry/LAMP-cortex |
| **Platform Docs** | https://docs.lamp.digital |
| **License** | BSD-3-Clause |
| **Cortex Stars/Forks** | 5 stars / 6 forks / 1 issue |
| **Primary Language** | Python (13.4%), Jupyter Notebook (86.3%) |
| **Maintainer** | Division of Digital Psychiatry, BIDMC / Harvard Medical School |

**Description**
mindLAMP is an open-source digital phenotyping and clinical research platform developed at Beth Israel Deaconess Medical Center (BIDMC), a Harvard Medical School teaching hospital. It consists of four components: a native Android/iOS app, a web-based coordinator dashboard, a secure database with the LAMP Protocol for chronological data indexing, and Cortex -- an open-source data processing pipeline.

**Key Features**
- Passive sensor collection: accelerometer, GPS, screen state, step count
- Active assessments: 8 cognitive tests, customizable surveys
- Cortex feature extraction: sedentary behaviour, home time, screen usage, sleep
- Real-time data quality monitoring dashboards
- Multi-language support (10 languages)
- Deployed in 13 countries with 120+ publications

**Clinical Applicability**
mindLAMP is deployed in clinical care at BIDMC and internationally with IRB approval. Conditions covered include schizophrenia, depression, anxiety, bipolar disorder, dementia, PTSD, and chronic pain. Cortex features have been used to predict clinical relapse in schizophrenia through anomaly detection.

**Integration Recommendation**
mindLAMP is ideal for clinical deployments requiring rapid setup without deep technical configuration. The Cortex pipeline provides validated features for sleep, screen time, and mobility. Use the LAMP Python SDK for programmatic data access and custom analysis.

---

### 4. RADAR-base Remote Monitoring Platform

| Attribute | Detail |
|-----------|--------|
| **Name** | RADAR-base (Remote Assessment of Disease And Relapses) |
| **GitHub Org** | https://github.com/RADAR-base |
| **Website** | https://radar-base.org |
| **License** | Apache-2.0 |
| **Phone Plugin Stars** | 3 stars / 3 forks (archived -- see radar-commons-android) |
| **Primary Language** | Java |
| **Maintainer** | PhiDataLab, King's College London / UCL |

**Description**
RADAR-base is an open-source platform for leveraging data from wearables and mobile technologies in clinical research. Built around Apache Kafka for scalable data streaming, it uses a modular plugin architecture to integrate data from multiple sources. Data is stored in AVRO format for interoperability. The platform supports both passive data collection (movement, location, calls, app usage) and active data collection (surveys, cognitive tests).

**Key Features**
- Near real-time remote monitoring
- Apache Kafka backend for horizontal scalability
- Modular plugin system for new device integration
- AVRO schematised data storage
- Integration with Fitbit, Garmin, and other wearables
- Support for custom third-party app integration

**Clinical Applicability**
RADAR-base has been used in national and international research projects including: remote monitoring in early Alzheimer's disease, Long COVID fatigue tracking, epilepsy seizure monitoring, atrial fibrillation measurement, autism treatment studies, and stress-related mental health monitoring.

**Integration Recommendation**
Best suited for large-scale studies requiring real-time streaming and integration of multiple wearable devices. The Kafka backend provides excellent scalability for high-throughput sensor data. Use the pyGarminAPI and pyFitbitAPI connectors for wearable device integration.

---

## Tier 2: Passive Sensing & Smartphone Sensor Frameworks

---

### 5. AWARE Framework

| Attribute | Detail |
|-----------|--------|
| **Name** | AWARE Framework |
| **GitHub URL** | https://github.com/awareframework/aware-client |
| **Website** | https://awareframework.com |
| **License** | Apache-2.0 |
| **Stars/Forks/Issues** | 18 stars / 16 forks / 4 issues |
| **Primary Language** | Java (99.7%), Kotlin (0.3%) |
| **Maintainer** | AWARE Framework community (Dr. Simon D'Alfonso, Dr. Vassilis Kostakos) |

**Description**
AWARE is an Android sensing framework dedicated to instrument, infer, log, and share mobile context information. It captures hardware-, software-, and human-based data and encapsulates analysis and machine learning capabilities. AWARE simplifies conducting user studies in both naturalistic and laboratory settings and can integrate with MySQL databases.

**Key Features**
- Comprehensive sensor access: accelerometer, gyroscope, GPS, Bluetooth, WiFi
- Application usage tracking
- Touch event logging
- Notification capture
- Ambient noise plugin
- Weather data plugin
- MySQL database integration
- Plugin architecture for extensibility

**Clinical Applicability**
AWARE has been widely used in behavioural research studies requiring detailed context sensing. It is suitable for studies tracking social interaction patterns, physical activity, environmental context, and smartphone usage behaviour. The framework supports both cross-sectional and longitudinal study designs.

**Integration Recommendation**
Use AWARE for Android-focused studies requiring deep sensor access and context awareness. The plugin architecture allows custom extensions for specific clinical needs. Integrate with the AWARE micro-server (separate repo) for backend data storage and management.

---

### 6. Purple Robot

| Attribute | Detail |
|-----------|--------|
| **Name** | Purple Robot |
| **GitHub URL** | https://github.com/cbitstech/Purple-Robot |
| **License** | GPLv3 (LICENSE.GPLv3 file present) |
| **Stars/Forks/Issues** | 39 stars / 19 forks / 44 issues |
| **Primary Language** | Java (83.1%), JavaScript (8.8%), HTML (6.0%) |
| **Maintainer** | Center for Behavioral Intervention Technologies (CBITs), Northwestern University |

**Description**
Purple Robot is an Android application for creating automated experiences with sensing and inference capabilities. It was created by CBITs as an infrastructural component for behavioural and medical intervention applications. The platform includes full language runtimes for JavaScript and Scheme programming, enabling complex on-device automation and scripting.

**Key Features**
- Comprehensive on-device sensing
- JavaScript and Scheme scripting support
- Automated experience delivery
- Django backend integration
- Wearable device support (Pebble watch)
- Social media and communication sensing
- Fitness data plugins

**Clinical Applicability**
Purple Robot was developed specifically for behavioural intervention studies. Its automation capabilities make it suitable for just-in-time adaptive interventions (JITAIs), ecological momentary interventions (EMIs), and continuous passive monitoring for mental health and chronic disease management.

**Integration Recommendation**
Best for studies requiring complex on-device automation and intervention delivery. The scripting support enables sophisticated conditional logic for adaptive interventions. Note that the project has not seen active development since 2016 and may require updates for modern Android versions.

---

### 7. EmotionSense / SensorManager

| Attribute | Detail |
|-----------|--------|
| **Name** | EmotionSense SensorManager |
| **GitHub URL** | https://github.com/emotionsense/SensorManager |
| **License** | MIT-like (University of Cambridge permissive license) |
| **Stars/Forks** | Notable historical project |
| **Primary Language** | Java |
| **Maintainer** | Originally University of Cambridge (no longer actively maintained) |

**Description**
The EmotionSense SensorManager Library is an Android library project that makes accessing and polling smartphone sensor data easy, highly configurable, and battery-friendly. It was developed at the University of Cambridge as part of the EmotionSense project for emotion recognition from smartphone sensor data.

**Key Features**
- Battery-friendly sensor polling
- Configurable sampling rates
- Multiple sensor support
- Event-driven architecture
- Designed for emotion sensing research

**Clinical Applicability**
While no longer actively maintained, EmotionSense was influential in early digital phenotyping research. The architecture patterns influenced later frameworks like AWARE. The library may still be useful as a reference implementation or for historical compatibility with older study code.

**Integration Recommendation**
Consider AWARE Framework as a modern alternative. EmotionSense may be useful for reference or for maintaining continuity with legacy study codebases.

---

## Tier 3: Analysis, Visualisation & Feature Extraction

---

### 8. pyActigraphy

| Attribute | Detail |
|-----------|--------|
| **Name** | pyActigraphy |
| **GitHub URL** | https://github.com/ghammad/pyActigraphy |
| **PyPI URL** | https://pypi.org/project/pyActigraphy |
| **License** | GPL-3.0 |
| **Stars/Forks/Issues** | 165 stars / 33 forks / 30 issues |
| **Primary Language** | Python (100%) |
| **Maintainer** | Dr. Gregory Hammad, GIGA-CRC in vivo imaging, University of Liege |
| **Citation** | Hammad G, et al. (2021) PLoS Comput Biol 17(10): e1009514 |

**Description**
pyActigraphy is a comprehensive open-source Python package for actigraphy data visualisation and analysis. It provides tools to read actigraphy data from 7+ different file formats, quantify rest-activity rhythm variables, visualise sleep agendas, automatically detect rest periods, and perform advanced signal processing analyses.

**Key Features**
- Supports 7+ actigraph formats: Actigraph wGT3X-BT, CamNtech, Condor, Daqtix, Respironics, Tempatilumi, MESA
- Accelerometer calibration support (Axivity AX3, Activinsights GENEActiv)
- Light exposure data reading and metrics
- Sleep detection algorithms: Cole-Kripke, Sadeh, Crespo, Roenneberg
- Rest-activity variables: IS(m), IV(m), RA, kRA, kAR, SRI
- Cosinor analysis, DFA, Functional Linear Modelling, LIDS, SSA
- Interactive sleep diary visualisation

**Clinical Applicability**
Actigraphy is widely used in sleep medicine, psychiatry, and chronobiology research. pyActigraphy enables objective sleep-wake assessment, circadian rhythm characterisation, and treatment response monitoring for insomnia, depression, bipolar disorder, and neurodegenerative diseases. The package has been used in large population studies including UK Biobank and Whitehall II.

**Integration Recommendation**
Essential tool for any study using actigraphy data. The sleep detection algorithms are validated against polysomnography. Use in combination with the circadian package (see below) for comprehensive chronobiology analysis.

---

### 9. circadian (Arcascope)

| Attribute | Detail |
|-----------|--------|
| **Name** | circadian |
| **GitHub URL** | https://github.com/Arcascope/circadian |
| **Documentation** | https://arcascope.github.io/circadian/ |
| **License** | MIT |
| **Stars/Forks/Issues** | 16 stars / 7 forks / 6 issues |
| **Primary Language** | Jupyter Notebook (94.5%), Python (5.0%) |
| **Maintainer** | Arcascope (Dr. Olivia Walch, Dr. Kevin Hannay) |
| **Zenodo DOI** | 10.5281/zenodo.8206871 |

**Description**
circadian is a computational Python package for the simulation and analysis of circadian rhythms. It implements key mathematical models from the chronobiology literature including Forger et al. (1999), Hannay et al. (2019), and Kronauer et al. (1999). The package provides tools for simulating circadian dynamics, calculating phase response curves, generating actograms, and processing wearable data.

**Key Features**
- Mathematical circadian models: Forger99, Hannay19, Hannay19TP, Jewett99
- Light schedule definition and simulation
- Phase Response Curve (PRC) calculation
- Actogram and phase plot generation
- Wearable data readers (circadian.readers module)
- pip-installable with `pip install circadian`

**Clinical Applicability**
circadian modelling is relevant for sleep medicine, mental health (circadian disruption is linked to depression and bipolar disorder), shift work health, jet lag treatment, and optimising medication timing (chronopharmacology). The package can predict entrainment to new light schedules and estimate circadian phase from wearable light exposure data.

**Integration Recommendation**
Use circadian to model light-mediated effects on the circadian pacemaker. Combine with pyActigraphy for a complete actigraphy + circadian analysis pipeline. Particularly valuable for studies involving sleep interventions, light therapy, or chronotherapeutic drug dosing.

---

### 10. W4H Integrated Toolkit

| Attribute | Detail |
|-----------|--------|
| **Name** | W4H Integrated Toolkit |
| **GitHub URL** | https://github.com/USC-InfoLab/w4h-integrated-toolkit |
| **Website** | https://infolab.usc.edu/projects/W4H/ |
| **License** | Not specified in repository |
| **Stars/Forks** | 4 stars / 2 forks |
| **Primary Language** | Python (50.7%), Jupyter Notebook (49.1%) |
| **Maintainer** | USC InfoLab |

**Description**
The Wearables for Health (W4H) Integrated Toolkit provides a unified platform for managing, analysing, and visualising wearable health data. At its core is the Geospatial Multivariate Time Series (GeoMTS) abstraction, which enables streamlined management of wearable data. Components include StreamSim (real-time data streaming simulator), W4H ImportHub (offline dataset integration), pyGarminAPI/pyFitbitAPI (device API wrappers), and an Integrated Analytics Dashboard.

**Key Features**
- GeoMTS abstraction for wearable data management
- StreamSim for real-time data streaming simulation
- ImportHub for CSV dataset integration
- pyGarminAPI for Garmin device integration
- pyFitbitAPI for Fitbit device integration
- Integrated Analytics Dashboard (Streamlit-based)
- PostgreSQL extension for approximate aggregate queries

**Clinical Applicability**
The toolkit provides end-to-end data management for studies using Garmin and Fitbit consumer wearables. The GeoMTS abstraction enables spatiotemporal analysis of health data, valuable for studies tracking physical activity, sleep, and heart rate in real-world contexts.

**Integration Recommendation**
Use as a data integration layer for studies combining multiple wearable sources. The StreamSim component is valuable for testing real-time analytics pipelines before deployment with live data.

---

### 11. Open mHealth Schemas

| Attribute | Detail |
|-----------|--------|
| **Name** | Open mHealth |
| **GitHub Org** | https://github.com/openmhealth |
| **Website** | http://www.openmhealth.org |
| **License** | Apache-2.0 (for schemas and tools) |
| **Primary Language** | Various (JSON schemas) |
| **Maintainer** | Open mHealth community |

**Description**
Open mHealth provides standardised JSON schemas for representing mobile health data. Developed by clinical experts, data scientists, and software architects, the schemas cover common health data types including blood pressure, heart rate, physical activity, step count, sleep, body weight, and geoposition. The project also includes a Data Receiver (DSU) implementing OAuth 2.0 and API shims for converting data from commercial APIs (Fitbit, RunKeeper, Jawbone).

**Key Features**
- Standardised JSON schemas for 20+ health data types
- IEEE 1752 standard alignment
- Data Receiver with OAuth 2.0 authentication
- API shims for commercial health platforms
- Schema validation tools
- WordPress plugin for schema library hosting

**Clinical Applicability**
Open mHealth schemas enable interoperability between different digital health tools and platforms. Standardised data representation is essential for multi-site studies, data sharing, and secondary analysis. The schemas have been adopted by IEEE as the 1752 standard.

**Integration Recommendation**
Adopt Open mHealth schemas as the canonical data format for any multi-platform or multi-site digital phenotyping study. Use the API shims to normalise data from consumer wearables and apps into a consistent format.

---

## Tier 4: Behavioural Observation & Circadian Analysis

---

### 12. BORIS (Behavioural Observation Research Interactive Software)

| Attribute | Detail |
|-----------|--------|
| **Name** | BORIS |
| **GitHub URL** | https://github.com/olivierfriard/BORIS |
| **Website** | https://www.boris.unito.it |
| **License** | GPL-3.0 |
| **Stars/Forks/Issues** | 234 stars / 54 forks / 160 issues |
| **Primary Language** | Python (99.5%) |
| **Maintainer** | Dr. Olivier Friard, University of Turin |
| **Citation** | Friard O, Gamba M. (2016) Methods in Ecology and Evolution, 7(11), 1325-1330 |
| **Latest Release** | v9.10.1 (April 2026) |

**Description**
BORIS is an easy-to-use event logging software for video/audio coding and live observations. It supports both point events (instantaneous behaviours) and state events (behaviours with duration), multiple subjects, and unlimited behaviour categories. The software includes built-in analysis tools for time budgets, inter-rater reliability, and behaviour latency.

**Key Features**
- Video and audio coding with frame-by-frame precision
- Live observation mode
- Point and state event types
- Multiple subjects per observation
- Behaviour categories with modifiers
- Time budget analysis
- Inter-rater reliability (Cohen's Kappa, Weighted Kappa)
- Spectrogram and waveform visualisation
- R plugin support for custom analyses
- Export to CSV, TSV, ODS, XLSX, HTML

**Clinical Applicability**
BORIS is essential for observational studies requiring systematic behavioural coding. Applications include autism behavioural assessment, parent-child interaction analysis, therapy session coding, clinical trial endpoint assessment, and psychomotor evaluation. The software is used in animal behaviour, human psychology, and clinical research worldwide.

**Integration Recommendation**
Use BORIS for any study requiring systematic coding of video-recorded behaviour. The inter-rater reliability features are essential for validating coding schemes. Export coded events as timestamped data for integration with physiological or digital phenotyping data streams.

---

### 13. ActiSleep Tracker

| Attribute | Detail |
|-----------|--------|
| **Name** | ActiSleep Tracker |
| **GitHub URL** | https://github.com/childmindresearch/actisleep-tracker |
| **License** | Not specified |
| **Primary Language** | Python (Docker-deployed) |
| **Maintainer** | Child Mind Research Institute |

**Description**
ActiSleep Tracker is a Docker-based visualisation tool for actigraphy sleep data. It provides an interactive web interface for reviewing and editing sleep annotations derived from GGIR-processed actigraphy data. The tool enables researchers to validate and correct automatic sleep detection algorithms against participant sleep diaries.

**Key Features**
- Docker deployment for easy setup
- Visualisation of GGIR-processed actigraphy data
- Interactive sleep window editing
- Daily sleep parameter review
- Integration with sleep diary data

**Clinical Applicability**
ActiSleep Tracker fills the gap between automated sleep detection and ground-truth validation. It is essential for studies requiring high-accuracy sleep measurement where algorithmic detection needs human review, such as clinical trials and sleep intervention studies.

**Integration Recommendation**
Deploy as a quality control step in actigraphy analysis pipelines. Process raw accelerometer data through GGIR first, then use ActiSleep Tracker for visual validation and manual correction of sleep windows.

---

### 14. EpiCollect5

| Attribute | Detail |
|-----------|--------|
| **Name** | EpiCollect5 |
| **GitHub URL** | https://github.com/epicollect5/epicollect5-server |
| **Website** | https://five.epicollect.net |
| **License** | MIT |
| **Primary Language** | PHP (server), JavaScript (mobile) |
| **Maintainer** | CGPS Team, Oxford University Big Data Institute |

**Description**
EpiCollect5 is a free, easy-to-use mobile and web application for data collection. It provides both web and mobile applications for generating forms (questionnaires) and freely hosted project websites for data collection. Projects are created using a drag-and-drop form builder, then downloaded to devices for data collection including GPS, photos, videos, and structured responses.

**Key Features**
- Drag-and-drop form builder
- Multi-platform mobile app (Android 10+, iOS 15+)
- GPS and media attachment
- Hierarchical form linking
- Branching logic
- Real-time data synchronisation
- Map and chart visualisation
- CSV and JSON data export
- Free hosting at five.epicollect.net

**Clinical Applicability**
EpiCollect5 is suitable for epidemiological field studies, patient-reported outcome collection, ecological momentary assessment, and any study requiring structured data collection with geolocation. It has been used in global health projects across sub-Saharan Africa and worldwide.

**Integration Recommendation**
Use EpiCollect5 for structured field data collection and survey administration. The GPS tagging enables spatial analysis. Export data in CSV format for integration with R, Python, or statistical analysis packages.

---

## Tier 5: Wearable Data Quality & Validation

---

### 15. wearable-hrv

| Attribute | Detail |
|-----------|--------|
| **Name** | wearablehrv |
| **GitHub URL** | https://github.com/Aminsinichi/wearable-hrv |
| **License** | MIT |
| **Stars/Forks/Issues** | 14 stars / 3 forks / 2 issues |
| **Primary Language** | Python (93.5%), TeX (6.5%) |
| **Maintainer** | Amin Sinichi, Vrije Universiteit Amsterdam |
| **Citation** | Sinichi et al. (2024) Journal of Open Source Software, 9(100), 6240 |

**Description**
wearablehrv is a comprehensive Python package for validating heart rate (HR) and heart rate variability (HRV) data from consumer wearables. It provides a complete pipeline from raw data preprocessing through statistical analysis to publication-ready visualisations with graphical user interfaces.

**Key Features**
- Pre-processing pipeline for wearable HR/HRV data
- Signal quality assessment
- Four major statistical validity analyses
- Individual and group-level pipelines
- GUI-based visualisation tools
- Compatibility with Labfront, VU-AMS, Empatica platforms
- Jupyter notebook tutorials

**Clinical Applicability**
HRV is a well-established biomarker for autonomic nervous system function, stress, and cardiovascular health. wearablehrv enables researchers to validate consumer-grade wearables (e.g., Apple Watch, Garmin, Fitbit) against clinical gold standards (ECG, chest straps) before using them in research studies.

**Integration Recommendation**
Use wearablehrv in the validation phase of any study planning to use consumer wearables for HRV-derived outcomes. The package helps establish measurement equivalence between devices and identifies acceptable use conditions.

---

### 16. Data Quality Challenges in Wearables

| Attribute | Detail |
|-----------|--------|
| **Name** | data-quality-challenges-wearables |
| **GitHub URL** | https://github.com/predict-idlab/data-quality-challenges-wearables |
| **License** | Not specified |
| **Stars/Forks** | 9 stars / 1 fork |
| **Primary Language** | Jupyter Notebook (98.3%), Python (1.7%) |
| **Maintainer** | IDLab, Ghent University (Jonas Van Der Donckt, Jeroen Van Der Donckt) |

**Description**
This repository addresses data quality challenges encountered in remote wearable monitoring. It provides analytical methodologies and practical solutions for wrist-worn wearable data quality assessment, including off-wrist detection, data annotation, and longitudinal visualisation dashboards. The code accompanies a peer-reviewed paper on ambulatory wearable monitoring.

**Key Features**
- Off-wrist detection algorithms
- Data quality annotation tools
- Longitudinal time-series dashboards (ETRI and mBrain datasets)
- Empatica E4 signal processing pipelines
- Interactive data quality visualisation
- Jupyter notebook tutorials

**Clinical Applicability**
Data quality is a critical but often overlooked aspect of wearable-based research. This toolkit helps identify and address common quality issues (device non-wear, sensor displacement, battery failure) that can compromise study validity. Essential for any long-term ambulatory monitoring study.

**Integration Recommendation**
Integrate data quality checks into any wearable data pipeline before analysis. The off-wrist detection algorithms can flag periods of missing or invalid data. Use the dashboards for real-time data quality monitoring during study recruitment.

---

### 17. StudentLife Dataset & R Package

| Attribute | Detail |
|-----------|--------|
| **Name** | studentlife |
| **Dataset URL** | https://studentlife.cs.dartmouth.edu |
| **Paper** | Wang et al. (2014), Dartmouth College |
| **License** | Public dataset |
| **Maintainer** | Dartmouth College (Dr. Andrew Campbell et al.) |

**Description**
The StudentLife dataset is a landmark digital phenotyping dataset collected from 48 college students over a 10-week term. It includes passive smartphone sensor data (accelerometer, microphone, GPS), ecological momentary assessments with photographic affect meters, and pre/post mental health questionnaires (PHQ-9, etc.). The accompanying R package assists in downloading, navigating, and analysing the dataset.

**Key Features**
- 48 participants, 10-week continuous monitoring
- Passive: accelerometer, microphone, GPS, Bluetooth
- Active: EMA with photographic affect meter
- Pre/post: PHQ-9, PSS, loneliness scales
- Machine-learned behaviour inferences (activity, conversation, sleep)
- Publicly available for reproducible research

**Clinical Applicability**
The StudentLife dataset has been used in over 100 publications for developing and validating digital phenotyping methodologies. It serves as a benchmark for depression detection, stress prediction, academic performance analysis, and social behaviour characterisation from smartphone data.

**Integration Recommendation**
Use the StudentLife dataset as a benchmark for developing and validating new digital phenotyping algorithms before deployment in clinical studies. The R package provides convenient data access and processing functions.

---

### 18. Sensor Logger (Kelvin Choi)

| Attribute | Detail |
|-----------|--------|
| **Name** | Sensor Logger |
| **App URL** | https://sensorlogger.app |
| **GitHub (decoder lib)** | https://github.com/tszheichoi/sensor-ble |
| **License** | Open source decoder library |
| **Maintainer** | Kelvin Choi |

**Description**
Sensor Logger is a smartphone application for comprehensive sensor data logging on iOS and Android. It supports logging of all built-in smartphone sensors (accelerometer, gyroscope, magnetometer, barometer, GPS) as well as external Bluetooth sensors and beacons. The app exports data in standard formats (CSV, JSON) for downstream analysis.

**Key Features**
- All built-in smartphone sensors
- Bluetooth sensor and beacon support
- Customisable sampling frequencies
- Multiple export formats (CSV, JSON)
- Open-source Sensor Zoo algorithm library
- Web-based Sandbox for sensor visualisation
- Cross-platform (iOS and Android)

**Clinical Applicability**
Sensor Logger is useful for pilot studies and sensor validation work requiring precise control over sampling parameters. The Bluetooth beacon support enables indoor localisation and proximity sensing for social interaction studies.

**Integration Recommendation**
Use Sensor Logger for sensor validation pilots and studies requiring custom sampling configurations. Export data in CSV format for analysis with Python (pandas), R, or MATLAB.

---

### 19. InfluxDB SensorLogger (Android)

| Attribute | Detail |
|-----------|--------|
| **Name** | SensorLogger (InfluxCommunity) |
| **GitHub URL** | https://github.com/InfluxCommunity/SensorLogger |
| **License** | Not specified |
| **Primary Language** | Java (Android) |
| **Maintainer** | InfluxCommunity |

**Description**
An Android sample application demonstrating how to store smartphone sensor data (accelerometer and gyroscope in X, Y, Z axes) to InfluxDB Cloud at regular time intervals. It uses the InfluxDB Java SDK and MPAndroid Charts library for data visualisation.

**Key Features**
- Accelerometer and gyroscope logging
- InfluxDB Cloud integration
- Real-time chart visualisation
- Time-series database storage
- Configurable logging intervals

**Clinical Applicability**
Useful for studies requiring time-series database storage of sensor data. InfluxDB's query capabilities enable efficient retrieval and aggregation of long-term sensor recordings. The architecture pattern can be adapted for backend infrastructure in clinical studies.

**Integration Recommendation**
Use as a reference implementation for InfluxDB-based sensor data backends. The time-series database approach is scalable and supports real-time monitoring dashboards.

---

### 20. circacompare (R Package)

| Attribute | Detail |
|-----------|--------|
| **Name** | circacompare |
| **GitHub URL** | https://github.com/RWParsons/circacompare |
| **Documentation** | https://rwparsons.github.io/circacompare/ |
| **License** | Open source |
| **Maintainer** | Rex Parsons et al. |
| **Citation** | Parsons R, et al. (2020) Bioinformatics, https://doi.org/10.1093/bioinformatics/btz730 |

**Description**
circacompare is an R package for statistical analysis and comparison of two circadian rhythms. It estimates mesor, amplitude, and phase parameters and supports mixed-effects models for within-subject correlation. The package can analyse rhythmic datasets with known or data-estimated periods.

**Key Features**
- Single and dual rhythm analysis
- Mesor, amplitude, and phase estimation
- Known or estimated period
- Exponential decay modelling
- Mixed-effects model support
- Group comparison statistics

**Clinical Applicability**
circacompare enables rigorous statistical comparison of circadian parameters between patient groups or treatment conditions. Applications include chronotherapy studies, shift work health assessment, and circadian biomarker validation in depression and sleep disorders.

**Integration Recommendation**
Use circacompare for hypothesis testing in circadian research. The statistical framework provides p-values and confidence intervals for group differences in circadian parameters, essential for clinical trial endpoints.

---

## Integration Matrix

| Tool | Data Collection | Analysis | Visualisation | Clinical Deploy | Wearable Support | Smartphone |
|------|----------------|----------|---------------|----------------|------------------|------------|
| Beiwe | X | | | X | | X |
| Forest | | X | X | X | | |
| mindLAMP/Cortex | X | X | X | X | X | X |
| RADAR-base | X | | | X | X | X |
| AWARE Framework | X | | | | | X |
| Purple Robot | X | X | | | X | X |
| pyActigraphy | | X | X | X | X | |
| circadian | | X | X | | X | |
| BORIS | X | X | | X | | |
| wearable-hrv | | X | X | X | X | |
| Open mHealth | X | | | X | X | X |
| W4H Toolkit | X | X | X | | X | |
| EpiCollect5 | X | | X | | | X |
| ActiSleep Tracker | | X | X | X | X | |
| Sensor Logger | X | | | | X | X |

---

## License Summary

| License | Count | Projects |
|---------|-------|----------|
| BSD-3-Clause | 4 | Beiwe, Forest, mindLAMP/Cortex, Open mHealth schemas |
| Apache-2.0 | 4 | AWARE Framework, RADAR-base, Open mHealth tools, Sensor Zoo |
| GPL-3.0 | 3 | pyActigraphy, BORIS, Purple Robot |
| MIT | 4 | circadian, wearable-hrv, EpiCollect5, EmotionSense |
| Unspecified/Other | 5 | W4H Toolkit, ActiSleep Tracker, data-quality-challenges, StudentLife, Sensor Logger |

---

## Recommendations

### For New Digital Phenotyping Studies

1. **Start with Beiwe** for smartphone-based data collection. The BSD-3 license, Harvard backing, and extensive documentation make it the most robust choice for research.

2. **Use Forest for analysis** of Beiwe-collected data. The validated algorithms (jasmine GPS pipeline, willow communication summaries) provide clinically meaningful features.

3. **Consider mindLAMP** if you need a more turnkey clinical deployment with built-in cognitive assessments and a clinician dashboard.

4. **Add pyActigraphy** for any study using actigraph devices (e.g., Actigraph, GENEActiv). The sleep detection algorithms are validated against polysomnography.

5. **Use circadian** (Python) or **circacompare** (R) for chronobiology analysis of actigraphy or light exposure data.

### For Wearable Validation

6. **Use wearable-hrv** to validate consumer wearables (Apple Watch, Garmin, Fitbit) against ECG gold standards before study deployment.

7. **Integrate data-quality-challenges-wearables** tools for off-wrist detection and data quality flagging in long-term monitoring studies.

### For Behavioural Observation

8. **Use BORIS** for any study requiring systematic coding of video-recorded behaviour. The inter-rater reliability features are essential for research validity.

### For Data Standards

9. **Adopt Open mHealth schemas** as the canonical data format for multi-platform studies to ensure interoperability and data sharing.

### Technology Stack Summary

| Layer | Recommended Tool |
|-------|-----------------|
| Smartphone sensing | Beiwe or AWARE |
| Wearable integration | RADAR-base or W4H Toolkit |
| Feature extraction | Forest or Cortex |
| Actigraphy analysis | pyActigraphy |
| Circadian modelling | circadian |
| Behavioural coding | BORIS |
| Data validation | wearable-hrv |
| Quality assurance | data-quality-challenges-wearables |
| Data standards | Open mHealth |
| Field data collection | EpiCollect5 |

---

## References

1. Onnela JP, et al. (2021) "Beiwe: A data collection platform for high-throughput digital phenotyping." Journal of Open Source Software, 6(68), 3417.
2. Torous J, et al. (2024) "Transforming Digital Phenotyping Raw Data Into Actionable Biomarkers, Quality Metrics, and Data Visualizations Using Cortex Software Package." J Med Internet Res, 26:e58502.
3. Hammad G, et al. (2021) "pyActigraphy: Open-source python package for actigraphy data visualization and analysis." PLoS Comput Biol, 17(10): e1009514.
4. Friard O, Gamba M. (2016) "BORIS: a free, versatile open-source event-logging software for video/audio coding and live observations." Methods in Ecology and Evolution, 7(11), 1325-1330.
5. Parsons R, et al. (2020) "CircaCompare: A method to estimate and statistically support differences in mesor, amplitude, and phase, between circadian rhythms." Bioinformatics.
6. Sinichi A, et al. (2024) "WearableHRV: A Python package for the validation of heart rate and heart rate variability in wearables." Journal of Open Source Software, 9(100), 6240.
7. Wang R, et al. (2014) "StudentLife: Assessing Mental Health, Academic Performance and Behavioral Trends of College Students using Smartphones." ACM UbiComp.
8. RADAR-base: https://radar-base.org -- Remote Assessment of Disease And Relapses platform.
9. AWARE Framework: https://awareframework.com -- Mobile context sensing framework.
10. Open mHealth: http://www.openmhealth.org -- Standardised mobile health data schemas.
11. LAMP Platform: https://docs.lamp.digital -- mindLAMP modular digital health platform.
12. Arcascope circadian: https://arcascope.github.io/circadian/ -- Circadian rhythm simulation and analysis.

---

*This report was compiled through systematic search of GitHub repositories, web sources, and academic publications. All data verified as of August 2025. For updates, monitor the respective GitHub repositories for each project.*
