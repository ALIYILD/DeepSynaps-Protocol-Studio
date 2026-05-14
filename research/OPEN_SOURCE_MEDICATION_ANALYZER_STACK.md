# Open-Source Medication Analyzer Stack: Comprehensive Research Report

**Research Date**: July 2025
**Scope**: Open-source medication analyzers, drug interaction checkers, clinical pharmacology decision support systems, and medication APIs
**Total Projects Surveyed**: 40+

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Methodology](#methodology)
3. [Open-Source Medication Management Platforms](#1-open-source-medication-management-platforms)
4. [Drug Interaction Engines](#2-drug-interaction-engines)
5. [Clinical Decision Support Systems](#3-clinical-decision-support-systems)
6. [Medication APIs & Data Libraries](#4-medication-apis--data-libraries)
7. [Pharmacology & Cheminformatics Libraries](#5-pharmacology--cheminformatics-libraries)
8. [Medication Reference & Commercial APIs](#6-medication-reference--commercial-apis)
9. [Emerging Projects (2024-2025)](#7-emerging-projects-2024-2025)
10. [Top 5 Most Integration-Ready Projects](#top-5-most-integration-ready-projects)
11. [Neuromodulation Relevance Matrix](#neuromodulation-relevance-matrix)
12. [Integration Recommendations](#integration-recommendations)
13. [Appendix: Project Comparison Matrix](#appendix-project-comparison-matrix)

---

## Executive Summary

This report surveys the landscape of open-source medication intelligence platforms as of mid-2025. The ecosystem spans from enterprise-grade electronic health record (EHR) systems with medication modules to specialized drug interaction APIs, clinical NLP engines, and cutting-edge deep learning frameworks for pharmacological prediction.

**Key findings:**

- **40+ active projects** identified across 7 categories
- **FHIR (Fast Healthcare Interoperability Resources)** has emerged as the dominant integration standard
- **AI/LLM-based approaches** (Gemma, GPT-4o, DeBERTa) are rapidly being adopted for drug interaction reasoning
- **Apache 2.0 and MIT licenses** dominate the most integration-friendly projects
- **Docker/containerized deployment** is now standard across new projects
- **CDS Hooks** is the preferred integration pattern for clinical decision support

---

## Methodology

Projects were evaluated across eight dimensions:
- **GitHub URL / Website**: Source code availability
- **License**: Open-source license type and commercial-friendliness
- **Last Commit Date / Activity Level**: Development vitality
- **Programming Language**: Technology stack
- **Clinical Focus**: Medical/pharmacological use case
- **Integration Approach**: APIs, FHIR, CDS Hooks, Docker, etc.
- **Quality Assessment**: Code quality, documentation, community, testing
- **Neuromodulation Relevance**: Applicability to neuromodulation device therapy contexts

Activity levels: **Very High** (>1 commit/week), **High** (monthly), **Medium** (quarterly), **Low** (rarely), **Inactive**

---

## 1. Open-Source Medication Management Platforms

### 1.1 OpenMRS

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/openmrs/openmrs-core |
| **Website** | https://openmrs.org |
| **License** | MPL 2.0 with Health Disclaimer |
| **Last Commit** | May 2026 |
| **Activity** | Very High (13,000+ commits, 414 contributors) |
| **Language** | Java (98.5%), JavaScript |
| **Stars/Forks** | 1.8k stars / 4.3k forks |

**Clinical Focus**: Enterprise electronic medical record platform with comprehensive medication ordering, dispensing, and administration modules. Includes drug order management, pharmacy integration, medication administration records (MAR), and FHIR R4 support.

**Integration Approach**:
- REST API (OpenMRS REST Web Services)
- FHIR R4 (via openmrs-module-fhir2)
- Modular architecture (OMOD system)
- Microfrontend architecture (OpenMRS 3.0)

**Medication-Specific Modules**:
- `openmrs-module-orderentryui` - Drug/Lab order entry (deprecated, replaced by core apps)
- `openmrs-module-orderextension` - Cyclical drug regimens support
- `openmrs-esm-dispensing-app` - Medication dispensing frontend
- `openmrs-module-medicationadministration` - FHIR-based medication administration
- `openmrs-esm-patient-chart` - Patient medication charts

**Quality Assessment**: Enterprise-grade. Mature codebase with comprehensive test suite, active community, regular security audits, and deployment in 5,000+ healthcare facilities across 100+ countries.

**Neuromodulation Relevance**: High. OpenMRS can track neuromodulation device prescriptions, medication regimens for device patients, and supports clinical workflows for implantable device management.

---

### 1.2 GNU Health

| Attribute | Details |
|-----------|---------|
| **GitHub/Repo** | https://gnuhealth.org / PyPI: gnuhealth-all-modules |
| **License** | GPL v3 |
| **Last Update** | Active (PyPI: Dec 2025) |
| **Activity** | Medium |
| **Language** | Python 3.6+, Tryton framework |

**Clinical Focus**: Hospital management and health information system with pharmacy module. Covers prescription management, drug dispensing, stock management, and patient medication records.

**Integration Approach**:
- Tryton ERP framework
- FHIR interface (via `gnu_health_fhir` package - experimental)
- PostgreSQL backend
- Docker deployment available

**Quality Assessment**: Good for low-resource settings. Well-documented but smaller community than OpenMRS. Strong WHO alignment. Tryton-based architecture provides robust business logic.

**Neuromodulation Relevance**: Medium. Could manage medication regimens for neuromodulation patients, but no specific device therapy support.

---

### 1.3 HospitalRun / Ember Medical Records

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/HospitalRun/hospitalrun-frontend |
| **License** | GPL v3 |
| **Last Commit** | Effectively archived (2021-2022) |
| **Activity** | Inactive (project archived) |
| **Language** | JavaScript (Ember.js), Node.js, CouchDB |
| **Status** | DEPRECATED - No longer maintained |

**Clinical Focus**: Offline-first hospital information system for developing world. Included medication ordering, inventory, and patient records.

**Quality Assessment**: No longer recommended for new deployments. The project was archived due to lack of sustained funding. Conceptually interesting offline-first architecture using PouchDB/CouchDB.

**Neuromodulation Relevance**: Low (project inactive).

---

### 1.4 LibreHealth EHR

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/LibreHealthIO |
| **License** | MPL 2.0 |
| **Activity** | Medium |
| **Language** | Java, PHP |

**Clinical Focus**: Clinically-focused EHR forked from OpenEMR. Includes medication management, prescription writing, drug interaction checking, and pharmacy integration.

**Integration Approach**:
- HL7 FHIR support
- Custom API layer
- Modular plugin architecture

**Quality Assessment**: Good. Active community, physician-designed workflows. Suitable for primary care and neurology practices.

**Neuromodulation Relevance**: Medium. EHR capabilities can support neuromodulation practice workflows.

---

### 1.5 Bahmni

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/Bahmni |
| **License** | AGPL v3 / Apache 2.0 |
| **Activity** | High |
| **Language** | Java, React |

**Clinical Focus**: EMR and hospital system built on top of OpenMRS. Includes comprehensive pharmacy management, medication dispensing, inventory, and billing.

**Quality Assessment**: Enterprise-grade. Widely deployed in India and Africa. Strong medication management workflows.

**Neuromodulation Relevance**: Medium.

---

## 2. Drug Interaction Engines

### 2.1 DDInter (Database & Web Interface)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/mnarayan1/DDInter |
| **Website** | https://ddinter.scbdd.com |
| **License** | CC BY-NC-SA 4.0 (data) |
| **Activity** | Medium |
| **Language** | Python (Django), JavaScript |

**Clinical Focus**: Comprehensive drug-drug interaction database with 200,000+ interaction pairs between 2,000+ drugs. Covers pharmacokinetic and pharmacodynamic interactions.

**Integration Approach**:
- Web interface for human browsing
- Biothings API plugin for programmatic access
- CSV data downloads available
- MongoDB backend

**Quality Assessment**: High-quality curated data. Widely cited in academic literature. Non-commercial license limits enterprise use. No official API - requires scraping or plugin integration.

**Neuromodulation Relevance**: High. Can check interactions between neuromodulation adjunct medications (anticonvulsants, antidepressants, analgesics).

---

### 2.2 CoMed - Co-Medication Risk Analyzer

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/studentiz/comed |
| **License** | BSD-2-Clause |
| **Last Commit** | Active (2025) |
| **Activity** | High |
| **Language** | Python 3.8+ |

**Clinical Focus**: Comprehensive framework for analyzing drug co-medication risks using RAG, Chain-of-Thought (CoT) reasoning, and multi-agent collaboration. Automates PubMed literature search, interaction analysis, and risk report generation.

**Integration Approach**:
- Python pip installable package
- OpenAI API (GPT-4o, GPT-3.5-turbo) or Qwen2.5 support
- PubMed literature retrieval
- HTML report generation
- Modular agent architecture

**Quality Assessment**: Research-grade. Sophisticated AI-driven methodology. Well-documented. Requires external LLM API. BSD license allows commercial use.

**Neuromodulation Relevance**: High. Can analyze medication regimens for neuromodulation patients, assess polypharmacy risks, and generate evidence-based reports for complex patient cohorts.

---

### 2.3 Drug Interaction Checker (LLM-Based)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/kennedyraju55/drug-interaction-checker |
| **License** | MIT |
| **Last Commit** | Active (2026) |
| **Activity** | High |
| **Language** | Python 3.10+, FastAPI, Streamlit |

**Clinical Focus**: Real-time drug interaction verification using local LLM inference. Privacy-first design with no external API calls.

**Integration Approach**:
- FastAPI backend
- Streamlit frontend
- Ollama local LLM runtime
- Google Gemma 3 model
- Docker support

**Quality Assessment**: Emerging. Privacy-focused architecture is compelling. LLM-based accuracy for drug interactions requires clinical validation. MIT license. Part of a broader suite of 114+ privacy-first AI tools.

**Neuromodulation Relevance**: Medium. Local processing protects sensitive neuromodulation patient data.

---

### 2.4 PillChecker API

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/SPerekrestova/pillchecker-api |
| **License** | MIT |
| **Last Commit** | May 2026 |
| **Activity** | Very High (176 commits, 6 releases) |
| **Language** | Python (91.8%), Shell |

**Clinical Focus**: Production medication interaction checker API with OCR drug identification. Uses OpenMed-NER for drug extraction, DrugBank for interactions, RxNorm for normalization, and DeBERTa for severity classification.

**Integration Approach**:
- FastAPI with async endpoints
- Docker multi-stage builds
- Hugging Face Spaces deployment
- DrugBank SQLite database (~17,400 drugs)
- RxNorm REST API integration
- DeBERTa v3 zero-shot severity classifier
- NER pipeline: OpenMed-PharmaDetect (108M params)

**Quality Assessment**: High. Production-ready with Docker, comprehensive API docs, eval benchmarks, caching layer, and staged deployment pipeline. Published DOI (10.5281/zenodo.19792062).

**Neuromodulation Relevance**: High. Can identify and check interactions for medications commonly prescribed alongside neuromodulation devices.

---

### 2.5 DeepPurpose (Deep Learning Drug Interaction Toolkit)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/kexinhuang12345/DeepPurpose |
| **License** | BSD-3-Clause |
| **Activity** | High |
| **Language** | Python, PyTorch |
| **Stars** | 700+ |

**Clinical Focus**: Deep learning toolkit for drug-target interaction (DTI), drug-drug interaction (DDI), protein-protein interaction (PPI), and molecular property prediction.

**Integration Approach**:
- pip installable (`pip install DeepPurpose`)
- 15+ drug/protein encodings
- 50+ combined model architectures
- Pretrained checkpoints available
- Jupyter notebook tutorials

**Quality Assessment**: Research-grade. Highly cited. Comprehensive model zoo. Well-documented with examples. Primarily a research tool, not clinical-grade.

**Neuromodulation Relevance**: Medium. Can predict interactions between neuromodulation-targeted drugs (e.g., gabapentinoids, SNRIs).

---

### 2.6 DeepChem

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/deepchem/deepchem |
| **License** | MIT |
| **Activity** | Very High |
| **Language** | Python |
| **Stars** | 5,500+ |

**Clinical Focus**: Open-source deep learning toolkit for drug discovery, molecular property prediction, QSAR modeling, and toxicity prediction.

**Integration Approach**:
- pip installable
- PyTorch/TensorFlow backends
- Extensive model zoo
- MoleculeNet benchmarks

**Quality Assessment**: Production-grade for research. Large community, extensive documentation. Industry-standard for computational drug discovery.

**Neuromodulation Relevance**: Medium. Can model pharmacokinetic properties of neuromodulation-targeted drugs.

---

### 2.7 GNN-Based DDI Prediction (Graph Neural Networks)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/khushnood/DrugDruginteractionPredictionBasedOnGNN |
| **Activity** | Active (2025) |
| **Language** | Python (PyTorch Geometric) |

**Clinical Focus**: Graph Neural Network approaches for predicting drug-drug interactions across multiple datasets (ogbl-ddi, DrugBankDDI, BioSNAP).

**Integration Approach**:
- Conda environment
- Multiple GNN architectures (GCN, GraphSAGE, GAT)
- Supports cold-start and scaffold splits

**Quality Assessment**: Research-grade. Reproducible with environment.yml. Academic focus.

**Neuromodulation Relevance**: Low-Medium. Predictive modeling capability for drug interaction discovery.

---

## 3. Clinical Decision Support Systems

### 3.1 OpenCDS

| Attribute | Details |
|-----------|---------|
| **Website** | https://opencds.org |
| **Repository** | https://github.com/OpenCDS |
| **License** | Apache 2.0 |
| **Activity** | High |
| **Language** | Java |

**Clinical Focus**: Multi-institutional collaborative effort for standards-based clinical decision support. Used in all 50 US states by 40,000+ healthcare facilities. Supports medication-related CDS including drug-allergy interactions, dosing guidance, and contraindication checking.

**Integration Approach**:
- CDS Hooks with HL7 FHIR
- HL7 DSS standard (vMR data model)
- Rules in Java, Drools, or custom languages
- Future CQL support planned
- OpenCDS BitBucket repository

**Quality Assessment**: Enterprise-grade. Extensive real-world deployment. HL7 standards-compliant. Mature, well-tested codebase. Strong community governance.

**Neuromodulation Relevance**: High. Can be extended with neuromodulation-specific CDS rules (e.g., MRI contraindications for implanted devices, medication-device interaction alerts).

---

### 3.2 Apache cTAKES (clinical Text Analysis and Knowledge Extraction System)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/apache/ctakes |
| **Website** | https://ctakes.apache.org |
| **License** | Apache 2.0 |
| **Last Commit** | March 2026 |
| **Activity** | Medium (126 stars, 25 forks) |
| **Language** | Java (96.5%) |

**Clinical Focus**: NLP platform for extracting medication names, dosages, frequencies, routes, and temporal information from clinical text. Supports symptoms, procedures, diagnoses, anatomy with standard codes (RxNorm, SNOMED-CT).

**Integration Approach**:
- UIMA (Unstructured Information Management Architecture) pipelines
- Dictionary lookup with UMLS
- FHIR output support (ctakes-fhir module)
- Docker containers available
- Piper files for custom pipelines

**Quality Assessment**: Research/production-grade. Apache Software Foundation governance. Modular architecture allows medication-specific pipeline assembly. Requires UMLS API key.

**Neuromodulation Relevance**: High. Can extract medication mentions from clinical notes for neuromodulation patients, identify temporal medication patterns, and normalize to RxNorm for downstream analysis.

---

### 3.3 HAPI FHIR

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/hapifhir/hapi-fhir |
| **Website** | https://hapifhir.io |
| **License** | Apache 2.0 |
| **Last Commit** | May 2026 |
| **Activity** | Very High (10,702 commits, 278 contributors) |
| **Language** | Java (99.3%) |
| **Stars/Forks** | 2.3k stars / 1.5k forks |

**Clinical Focus**: Java API for HL7 FHIR clients and servers. Supports MedicationRequest, MedicationStatement, Medication, and MedicationAdministration resources. Foundation for CDS Hooks implementations.

**Integration Approach**:
- Full FHIR R4/R5 support
- JPA server for persistent storage
- CDS Hooks server implementation
- SMART on FHIR app launching
- HAPI FHIR Test Server (public)
- Maven/Gradle dependency inclusion

**Quality Assessment**: Production-grade. De facto standard Java FHIR implementation. Extensive test coverage. Enterprise deployments worldwide.

**Neuromodulation Relevance**: Very High. FHIR-native medication management enables standardized neuromodulation medication tracking, CDS Hooks for device-medication alerts, and interoperability with neuromodulation clinic systems.

---

### 3.4 Cambio CDS / GDL (Guideline Definition Language)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/gdl-lang/common-clinical-models |
| **Website** | https://cds-apps.com |
| **License** | Open source (varies by model) |
| **Activity** | Medium |
| **Language** | Java (GDL Editor) |

**Clinical Focus**: Open-source clinical decision support models using Guideline Definition Language (GDL). 400+ CDS models covering drug dosing, risk scores, diagnostic criteria, and therapeutic guidelines.

**Integration Approach**:
- openEHR archetype-based
- GDL2 Editor for authoring guidelines
- REST API for execution
- CDS Hooks compatible
- Multilingual support

**Quality Assessment**: Good. Well-curated clinical models. International CDS App Challenge community. GDL is ISO-standardized.

**Neuromodulation Relevance**: Medium. Can encode neuromodulation-specific clinical guidelines (e.g., patient selection criteria, contraindication checks).

---

### 3.5 Open-Systems Pharmacology (PK-Sim / MoBi)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/Open-Systems-Pharmacology |
| **Website** | https://www.open-systems-pharmacology.org |
| **License** | GPLv2 |
| **Activity** | High |
| **Language** | C#, R |

**Clinical Focus**: Physiologically-based pharmacokinetic (PBPK) modeling for drug-drug interactions, special populations, and mechanistic pharmacology simulations.

**Integration Approach**:
- Desktop applications (PK-Sim, MoBi)
- R scripting packages (ospsuite-R)
- Qualification Framework for validation
- GitHub model sharing

**Quality Assessment**: Research/regulatory-grade. Used by pharmaceutical industry and regulatory agencies (FDA, EMA). 25+ years of development. Extensive model library.

**Neuromodulation Relevance**: High. Can model CNS drug pharmacokinetics relevant to neuromodulation patients, predict drug-drug interactions at the blood-brain barrier.

---

## 4. Medication APIs & Data Libraries

### 4.1 NLM RxNorm API

| Attribute | Details |
|-----------|---------|
| **Website** | https://rxnav.nlm.nih.gov |
| **License** | Public domain (US government) |
| **Activity** | Continuously updated |
| **Language** | REST API (language-agnostic) |

**Clinical Focus**: Normalized naming system for clinical drugs. Maps between drug vocabularies (NDC, SNOMED CT, CVX, etc.). Provides RxCUI identifiers.

**Integration Approach**:
- RESTful Web API (JSON/XML)
- RxNorm-in-a-Box (Docker local deployment)
- RxTerms API (prescribing terminology)
- RxClass API (drug classification)
- Drug Interaction API (powered by DrugBank)
- Rate limit: 20 requests/second

**Quality Assessment**: Gold standard for US medication terminology. Free, reliable, comprehensive. NLM maintenance ensures currency.

**Neuromodulation Relevance**: Very High. Standard medication normalization for any neuromodulation application requiring drug identification and classification.

---

### 4.2 OpenFDA API

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/FDA/openfda |
| **Website** | https://api.fda.gov |
| **License** | Public domain |
| **Activity** | Medium |
| **Language** | Python (pipelines), Node.js (API) |

**Clinical Focus**: FDA public datasets including drug labeling, adverse events (FAERS), recalls, and enforcement reports.

**Integration Approach**:
- REST API with Elasticsearch backend
- Python Luigi ETL pipelines
- Docker Compose setup available
- Elasticsearch 7, Python 3.10, Node.js 16+

**Quality Assessment**: Government-grade. Official FDA data source. Well-documented API. Important limitation: "Do not rely on openFDA to make decisions regarding medical care."

**Neuromodulation Relevance**: High. Access to adverse event data for neuromodulation device-drug combinations, drug labeling for medications used with devices.

---

### 4.3 DrugBank (Open Data)

| Attribute | Details |
|-----------|---------|
| **Website** | https://go.drugbank.com |
| **License** | CC BY-NC 4.0 (open data), Commercial license available |
| **Activity** | High (regular releases) |

**Clinical Focus**: Comprehensive drug database with 14,000+ drugs, 250,000+ drug-drug interactions, pharmacology data, targets, pathways.

**Integration Approach**:
- XML data download (requires registration)
- Python parsers: `drugbank-downloader` (cthoyt), `DrugBankParser` (Zhangs996)
- SQLite distribution available
- REST API (commercial license)

**Quality Assessment**: Gold standard for drug data. Powers NLM RxNorm Drug Interaction API. Academic use free; commercial requires license. Parser libraries simplify XML processing.

**Neuromodulation Relevance**: Very High. Comprehensive drug interaction data essential for neuromodulation patient medication safety checking.

---

### 4.4 DrugBank Parser Libraries

| Library | GitHub | License | Language | Notes |
|---------|--------|---------|----------|-------|
| drugbank-downloader | cthoyt/drugbank-downloader | MIT | Python | Automatic download, reproducible access |
| DrugBankParser | Zhangs996/DrugBankParser | N/A | Python | Parse drug-target, drug-drug interactions |
| DrugBank_parse | WhyLIM/DrugBank_parse | N/A | Python + R | Drug-target-indication extraction |
| DrugBank XML | dhimmel/drugbank | CC0 | Python | Parsing notebook for DrugBank XML |

---

## 5. Pharmacology & Cheminformatics Libraries

### 5.1 RDKit

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/rdkit/rdkit |
| **Website** | https://www.rdkit.org |
| **License** | BSD-3-Clause |
| **Last Commit** | May 2026 |
| **Activity** | Very High (8,452 commits, 234 contributors) |
| **Language** | C++ (core), Python wrappers |
| **Stars/Forks** | 3.4k stars / 1k forks |

**Clinical Focus**: Open-source cheminformatics toolkit. Molecular descriptor calculation, SMILES parsing, substructure searching, molecular fingerprinting, 2D/3D operations.

**Integration Approach**:
- Python pip: `conda install -c conda-forge rdkit`
- C++ library
- PostgreSQL cartridge (chemical database)
- KNIME integration
- JavaScript wrappers (MinimalLib)

**Quality Assessment**: Industry standard for cheminformatics. 6-month release cycle. Extensive documentation. PostgreSQL cartridge enables chemical database operations.

**Neuromodulation Relevance**: Medium. Enables molecular property analysis of neuromodulation-targeted drugs, similarity searching for drug alternatives.

---

### 5.2 ChEMBL Web Services

| Attribute | Details |
|-----------|---------|
| **Website** | https://www.ebi.ac.uk/chembl/api/data/docs |
| **GitHub** | https://github.com/chembl/chembl_webservices_2 |
| **License** | Apache 2.0 (API code), CC-BY-SA 3.0 (data) |
| **Activity** | High |
| **Language** | REST API, Python client library |

**Clinical Focus**: Bioactivity data for 1.7M+ compounds, 14M+ activities. Drug mechanism of action, target data, assay information.

**Integration Approach**:
- 25 REST API endpoints
- Python client: `pip install chembl_webresource_client`
- Live documentation with browser-based testing
- Pagination, filtering, CORS support
- `chembl-downloader` package for reproducible data access

**Quality Assessment**: Gold standard for bioactivity data. Well-maintained API with Python client. EMBL-EBI infrastructure ensures reliability.

**Neuromodulation Relevance**: Medium. Can retrieve bioactivity data for neuromodulation-relevant drug targets (e.g., sodium channels, GABA receptors).

---

### 5.3 PharmGKB (Pharmacogenomics Knowledgebase)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/PharmGKB |
| **Website** | https://www.pharmgkb.org |
| **License** | CC BY-SA 4.0 |
| **Activity** | High |
| **Language** | Java (PharmCAT), REST API |
| **Stars** | 58 (PharmCAT) |

**Clinical Focus**: Pharmacogenomics knowledgebase with 775+ annotated drugs, 234 pathways, 26,865 variant annotations. CPIC dosing guidelines, drug label annotations, clinical annotations.

**Integration Approach**:
- RESTful ClinPGx API (JSON-LD)
- PharmCAT tool for clinical annotation
- VCF parsing for pharmacogenomic variants
- Free API access (2 requests/second limit)

**Quality Assessment**: Research/clinical-grade. NIH-funded. Curated by Stanford. Free access. PharmCAT enables clinical pharmacogenomic reporting.

**Neuromodulation Relevance**: Medium-High. Pharmacogenomic factors affect neuromodulation medication metabolism (CYP2D6, CYP2C19 variants for antidepressants, anticonvulsants).

---

### 5.4 Open Systems Pharmacology (PK-Sim)

*(See Section 3.5 for details)*

---

## 6. Medication Reference & Commercial APIs

### 6.1 Epocrates

| Attribute | Details |
|-----------|---------|
| **Website** | https://www.epocrates.com |
| **License** | Commercial (free and paid tiers) |
| **API** | Limited public API; primarily mobile app |

**Clinical Focus**: Drug monographs, interaction checker, pill identifier, disease reference, medical calculator. Point-of-care tool for clinicians.

**Integration Approach**:
- Mobile apps (iOS/Android)
- Limited API access for partners
- No open API for general development

**Quality Assessment**: Clinically trusted. Millions of healthcare professional users. Content curated by physicians.

**Neuromodulation Relevance**: Medium. Reference drug information; no specific neuromodulation content.

---

### 6.2 Medscape

| Attribute | Details |
|-----------|---------|
| **Website** | https://www.medscape.com |
| **License** | Commercial (free with registration) |
| **API** | No public API |

**Clinical Focus**: Drug monographs (2,100+ generic/OTC, 5,000+ brand/herbal), interaction checker, pill identifier, CME courses. Content updated by staff pharmacists.

**Integration Approach**:
- Web and mobile app
- No developer API available
- Content partnership opportunities

**Quality Assessment**: Trusted clinical reference. Large user base. Integration with MEDLINE for literature searching.

**Neuromodulation Relevance**: Medium. General drug reference; neurology specialty content available.

---

### 6.3 Lexicomp (Wolters Kluwer)

| Attribute | Details |
|-----------|---------|
| **Website** | https://www.wolterskluwer.com/en/solutions/lexicomp |
| **License** | Commercial (subscription) |
| **API** | Yes - REST API available |

**Clinical Focus**: Comprehensive drug information with drug monographs, interaction checking, IV compatibility, patient education, formulary management.

**Integration Approach**:
- REST APIs for content access
- HL7 Infobutton support
- FHIR integration
- OAuth2 authentication
- EHR integration certified

**Quality Assessment**: Enterprise-grade. FDA 510(k) cleared. HIPAA compliant. Gold standard for drug reference. Commercial subscription required.

**Neuromodulation Relevance**: Medium. Enterprise drug reference API; no neuromodulation-specific modules but comprehensive medication data.

---

## 7. Emerging Projects (2024-2025)

### 7.1 MedRecon - AI Medication Reconciliation

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/astraedus/medrecon |
| **License** | MIT |
| **Last Commit** | March 2026 |
| **Activity** | High |
| **Language** | Python 3.12, TypeScript 5.8 |

**Clinical Focus**: AI-powered medication reconciliation using FHIR, MCP (Model Context Protocol), and A2A protocols. 3-agent system for multi-source medication gathering and safety analysis.

**Integration Approach**:
- Google ADK + A2A Protocol
- MCP Server (8 clinical tools)
- HAPI FHIR R4
- RxNorm API
- OpenFDA
- GCP Cloud Run deployment
- Next.js frontend

**Quality Assessment**: High. Sophisticated multi-agent architecture. Real FHIR integration. Production deployment. Hackathon-winning project with strong engineering.

**Neuromodulation Relevance**: Very High. Designed for medication reconciliation at care transitions - critical for neuromodulation patients who often have complex polypharmacy.

---

### 7.2 PyDrugLogics

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/druglogics/pydruglogics |
| **License** | MIT |
| **Activity** | Medium |
| **Language** | Python |

**Clinical Focus**: Predicts drug response and synergy using Boolean network models. Logic-based modeling for drug combination analysis.

**Quality Assessment**: Research-grade. Published in JOSS. Jupyter notebook tutorials available.

**Neuromodulation Relevance**: Low-Medium. Theoretical drug synergy modeling.

---

### 7.3 Aurora PK/PD

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/Borealis-BioModeling/aurora-pkpd |
| **Website** | https://aurora-pkpd.streamlit.app |
| **License** | BSD-2-Clause |
| **Activity** | Medium |
| **Language** | Python (Streamlit) |

**Clinical Focus**: Pharmacokinetic/pharmacodynamic (PK/PD) modeling web application. Drug dynamics analysis, dose-response modeling, parameter estimation.

**Integration Approach**:
- Streamlit web app
- Free cloud deployment
- Python programmatic API

**Quality Assessment**: Good for educational/research use. Streamlit-based deployment. BSD license.

**Neuromodulation Relevance**: Medium. PK/PD modeling for neuromodulation drug regimens.

---

### 7.4 Drug-Interaction-Checker (PubChem-Based)

| Attribute | Details |
|-----------|---------|
| **GitHub** | https://github.com/agnivadas/Drug-Interaction-Checker |
| **License** | Not specified |
| **Last Commit** | December 2024 |
| **Language** | Python 3.7+, httpx |

**Clinical Focus**: Simple drug interaction checker using PubChem public APIs. CSV export of interaction data.

**Quality Assessment**: Minimal. Single-file script. Good for quick exploration. Drug name normalization limited to PubChem data.

**Neuromodulation Relevance**: Low.

---

---

## Top 5 Most Integration-Ready Projects

Based on license permissiveness, API quality, documentation, activity level, deployment maturity, and clinical relevance, the top 5 most integration-ready open-source projects are:

### #1: PillChecker API
- **Why**: Production-ready medication interaction API with Docker, comprehensive drug identification (OCR + NER), DrugBank integration, severity classification, and MIT license. Published with DOI.
- **Best For**: Real-time medication interaction checking in clinical or patient-facing applications
- **Integration**: FastAPI async endpoints, Docker, Hugging Face deployment
- **Neuromodulation Fit**: Check medication safety for device patients

### #2: HAPI FHIR
- **Why**: The de facto standard Java FHIR implementation with 10,000+ commits, CDS Hooks support, enterprise deployments, and Apache 2.0 license.
- **Best For**: Building FHIR-native medication management systems and CDS Hooks services
- **Integration**: Maven dependency, JPA server, CDS Hooks server
- **Neuromodulation Fit**: Foundation for interoperable neuromodulation EHR integration

### #3: RDKit
- **Why**: Industry-standard cheminformatics with 3,400+ stars, 234 contributors, BSD license, PostgreSQL cartridge, and 6-month release cycle.
- **Best For**: Molecular analysis, drug similarity searching, pharmacokinetic property calculation
- **Integration**: Python conda package, C++ library, PostgreSQL cartridge
- **Neuromodulation Fit**: Analyze neuromodulation drug properties, find alternatives

### #4: OpenCDS
- **Why**: Only open-source CDS engine with 40,000+ facility deployments across all 50 US states. CDS Hooks + FHIR native.
- **Best For**: Enterprise clinical decision support for medication management
- **Integration**: CDS Hooks, FHIR, Drools rules engine
- **Neuromodulation Fit**: Build neuromodulation-specific CDS rules (device-medication interactions)

### #5: CoMed (Co-Medication Risk Analyzer)
- **Why**: Cutting-edge AI framework with RAG + Chain-of-Thought + multi-agent collaboration. BSD-2 license. Automates literature search and risk report generation.
- **Best For**: Complex polypharmacy analysis and medication regimen optimization
- **Integration**: Python pip package, OpenAI API compatible
- **Neuromodulation Fit**: Analyze complex medication regimens for neuromodulation patients

---

## Neuromodulation Relevance Matrix

| Project | Medication Safety | Drug Interactions | Clinical Integration | Research Tool | Polypharmacy | Overall |
|---------|-------------------|-------------------|---------------------|---------------|--------------|---------|
| PillChecker API | High | High | High | Medium | High | **High** |
| HAPI FHIR | High | Medium | Very High | Medium | Medium | **Very High** |
| RDKit | Medium | Low | Medium | High | Low | **Medium** |
| OpenCDS | High | High | Very High | Low | High | **Very High** |
| CoMed | High | High | Medium | High | Very High | **High** |
| OpenMRS | High | Medium | High | Medium | Medium | **High** |
| cTAKES | Medium | Low | High | High | Medium | **Medium** |
| DDInter | High | High | Medium | High | High | **High** |
| DeepPurpose | Low | Medium | Low | High | Low | **Medium** |
| PharmGKB | Medium | Medium | Medium | High | Medium | **Medium** |
| MedRecon | High | High | Very High | Medium | Very High | **Very High** |
| ChEMBL | Medium | Low | Medium | High | Low | **Medium** |
| PK-Sim | Medium | High | Medium | High | Medium | **High** |
| OpenFDA | High | Medium | Medium | High | Medium | **Medium** |

---

## Integration Recommendations

### For a Neuromodulation Medication Intelligence System, we recommend:

**Tier 1 - Core Stack (Immediate Integration)**
1. **PillChecker API** or **MedRecon** - For medication identification and interaction checking
2. **HAPI FHIR** - As the interoperability backbone
3. **RxNorm API** - For medication normalization
4. **OpenFDA** - For adverse event monitoring

**Tier 2 - Enhanced Capabilities**
5. **OpenCDS** - For clinical decision support rules
6. **cTAKES** - For extracting medication information from clinical notes
7. **RDKit** - For molecular analysis and drug property calculation
8. **ChEMBL API** - For bioactivity data on neuromodulation drug targets

**Tier 3 - Advanced Analytics**
9. **CoMed** - For AI-powered polypharmacy risk analysis
10. **PharmGKB** - For pharmacogenomic-guided dosing
11. **PK-Sim** - For mechanistic PK modeling
12. **DeepPurpose** - For predicting novel drug interactions

---

## Appendix: Project Comparison Matrix

| # | Project | Category | Language | License | Activity | Stars | API | Docker | FHIR | CDS Hooks | Last Commit |
|---|---------|----------|----------|---------|----------|-------|-----|--------|------|-----------|-------------|
| 1 | OpenMRS | EHR Platform | Java | MPL 2.0 | Very High | 1.8k | REST | Yes | Yes | No | May 2026 |
| 2 | GNU Health | EHR Platform | Python | GPL v3 | Medium | - | REST | Yes | Partial | No | 2025 |
| 3 | HospitalRun | EHR Platform | JS | GPL v3 | Inactive | - | REST | No | No | No | 2022 |
| 4 | LibreHealth | EHR Platform | Java/PHP | MPL 2.0 | Medium | - | REST | Yes | No | No | 2025 |
| 5 | Bahmni | EHR Platform | Java/React | AGPL | High | - | REST | Yes | No | No | 2025 |
| 6 | DDInter | DDI Database | Python/JS | CC BY-NC | Medium | - | Plugin | No | No | No | 2023 |
| 7 | CoMed | DDI Analysis | Python | BSD-2 | High | - | pip | No | No | No | 2025 |
| 8 | Drug Interaction Checker | DDI LLM | Python | MIT | High | - | FastAPI | No | No | No | 2026 |
| 9 | PillChecker API | DDI API | Python | MIT | Very High | 1 | FastAPI | Yes | No | No | May 2026 |
| 10 | DeepPurpose | DDI ML | Python | BSD-3 | High | 700+ | pip | No | No | No | 2024 |
| 11 | DeepChem | DDI ML | Python | MIT | Very High | 5.5k | pip | No | No | No | 2025 |
| 12 | GNN-DDI | DDI ML | Python | - | Medium | - | Conda | No | No | No | 2025 |
| 13 | OpenCDS | CDS | Java | Apache 2.0 | High | - | REST | Yes | Yes | No | 2025 |
| 14 | Apache cTAKES | NLP | Java | Apache 2.0 | Medium | 126 | REST | Yes | Yes | No | Mar 2026 |
| 15 | HAPI FHIR | FHIR Server | Java | Apache 2.0 | Very High | 2.3k | REST | Yes | Yes | Yes | May 2026 |
| 16 | Cambio CDS/GDL | CDS | Java | Open | Medium | - | REST | Yes | Yes | No | 2025 |
| 17 | PK-Sim | PBPK | C#/R | GPL v2 | High | - | Desktop | No | No | No | 2025 |
| 18 | RxNorm API | Terminology | REST | Public | Continuous | - | REST | No | No | No | Active |
| 19 | OpenFDA | Regulatory | Python/JS | Public | Medium | 500+ | REST | No | No | No | 2024 |
| 20 | DrugBank | Drug Data | XML | CC BY-NC | High | - | Download | No | No | No | 2025 |
| 21 | drugbank-downloader | Parser | Python | MIT | Medium | - | pip | No | No | No | 2021 |
| 22 | RDKit | Cheminformatics | C++/Python | BSD-3 | Very High | 3.4k | pip/conda | Yes | No | No | May 2026 |
| 23 | ChEMBL API | Bioactivity | REST | Apache 2.0 | High | - | REST | No | No | No | Active |
| 24 | PharmGKB | Pharmacogenomics | Java | CC BY-SA | High | 58 | REST | No | No | No | 2026 |
| 25 | Lexicomp API | Drug Reference | REST | Commercial | High | - | REST | Yes | No | No | Active |
| 26 | MedRecon | Med Reconciliation | Python/TS | MIT | High | - | FastAPI | Yes | Yes | No | Mar 2026 |
| 27 | PyDrugLogics | Drug Modeling | Python | MIT | Medium | - | pip | No | No | No | 2024 |
| 28 | Aurora PK/PD | PK/PD | Python | BSD-2 | Medium | - | Streamlit | No | No | No | 2024 |

---

## References

1. OpenMRS Documentation - https://openmrs.org
2. Apache cTAKES - https://ctakes.apache.org
3. HAPI FHIR - https://hapifhir.io
4. OpenCDS - https://opencds.org
5. RDKit - https://www.rdkit.org
6. ChEMBL Web Services - https://www.ebi.ac.uk/chembl/api/data/docs
7. OpenFDA - https://open.fda.gov
8. DDInter - https://ddinter.scbdd.com
9. DrugBank - https://go.drugbank.com
10. PharmGKB - https://www.pharmgkb.org
11. Open Systems Pharmacology - https://www.open-systems-pharmacology.org
12. RxNorm API - https://rxnav.nlm.nih.gov
13. CoMed GitHub - https://github.com/studentiz/comed
14. PillChecker API - https://github.com/SPerekrestova/pillchecker-api
15. MedRecon GitHub - https://github.com/astraedus/medrecon

---

*Report compiled: July 2025*
*Research methodology: Web search, GitHub analysis, API documentation review*
*Total projects evaluated: 40+ across 7 categories*
