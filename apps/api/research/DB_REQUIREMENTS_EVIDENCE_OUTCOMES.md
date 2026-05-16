# DeepSynaps Protocol Studio: Clinical Evidence & Outcome Database Requirements

> **Research Date:** 2025-07-17
> **Researcher:** Clinical Evidence Database Research Agent
> **Purpose:** Comprehensive database/API inventory for Evidence RAG, Evidence Intelligence, Biomarker Evidence Bridge, and Nutrition Evidence Bridge modules

---

## EXECUTIVE SUMMARY

This document catalogs **44 databases and APIs** across 6 categories essential for DeepSynaps Protocol Studio's evidence synthesis and outcome measurement capabilities. Each entry includes API details, access methods, coverage scope, and integration recommendations.

| Category | Databases Found | Priority Tier 1 | Priority Tier 2 | Priority Tier 3 |
|----------|-----------------|-----------------|-----------------|-----------------|
| Clinical Evidence Databases | 9 | 4 | 3 | 2 |
| Clinical Trial Registries | 5 | 2 | 2 | 1 |
| Outcome Measure Databases | 10 | 4 | 3 | 3 |
| Biomarker Reference Databases | 8 | 3 | 3 | 2 |
| Wearable/Consumer Health APIs | 8 | 4 | 2 | 2 |
| Nutrition Databases | 4 | 2 | 1 | 1 |
| **TOTAL** | **44** | **19** | **14** | **11** |

---

## TOP 10 INTEGRATION PRIORITIES

| Rank | Database | Category | Rationale |
|------|----------|----------|-----------|
| 1 | **PubMed E-utilities** | Clinical Evidence | 35M+ citations; foundational for all evidence RAG; free; mature API |
| 2 | **ClinicalTrials.gov API v2** | Trial Registry | 500K+ trials; OpenAPI 3.0 REST; essential for protocol validation |
| 3 | **NIH PROMIS (Assessment Center API)** | Outcome Measures | Gold standard PROs; CAT administration; 500+ validated measures |
| 4 | **Fitbit Web API** | Wearables | Largest consumer wearable base; comprehensive health data; OAuth2 |
| 5 | **USDA FoodData Central API** | Nutrition | Foundation of nutrition evidence; 350K+ foods; free REST API |
| 6 | **LOINC/FHIR Terminology Service** | Biomarker | Universal lab test identifiers; essential for biomarker normalization |
| 7 | **Cochrane Library (CSS/CENTRAL)** | Clinical Evidence | Gold standard systematic reviews; API feeds via Cochrane |
| 8 | **Oura API v2** | Wearables | Clinical-grade sleep/HRV; widely used in research; OAuth2 |
| 9 | **Epistemonikos API** | Clinical Evidence | 300K+ systematic reviews; matrix of evidence; API with token auth |
| 10 | **NHANES Laboratory Data** | Biomarker | Population-level biomarker reference data; free download; CDC curated |

---

## SECTION 1: CLINICAL EVIDENCE DATABASES (9 databases)

---

### 1.1 PubMed / NCBI E-utilities API
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.ncbi.nlm.nih.gov/home/develop/api/ |
| **API Type** | REST (E-utilities) + Entrez Direct (command line) |
| **Documentation** | https://www.ncbi.nlm.nih.gov/books/NBK25500/ |
| **Authentication** | None required (API key recommended for high-volume) |
| **Rate Limits** | 3 requests/second without API key; 10/second with key |
| **Data Coverage** | 35+ million citations; MEDLINE, life science journals, online books |
| **Key Endpoints** | `esearch.fcgi`, `efetch.fcgi`, `esummary.fcgi`, `elink.fcgi`, `epost.fcgi` |
| **Response Format** | XML (default), JSON (optional) |

**Integration Notes:**
- Core endpoint for `evidence_rag.py` and `evidence_intelligence.py`
- Standard workflow: ESearch -> EFetch for retrieval
- Also provides PMC APIs (OA, BioC, ID Converter), BLAST API, and PubChem PUG
- Supports MeSH term queries for structured evidence retrieval
- **Status:** ACTIVE, FREE | **Priority:** P0-CRITICAL

---

### 1.2 Cochrane Library / CENTRAL
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.cochranelibrary.com/ |
| **API Type** | Centralised Search Service (CSS) - internal API; Apify scraper available |
| **Documentation** | https://apify.com/azureblue/cochrane-review-scraper/api |
| **Authentication** | Institutional access for full content; public abstract access |
| **Data Coverage** | 1.2M+ trial records in CENTRAL; 8,000+ systematic reviews |
| **Key Features** | Daily PubMed/MEDLINE/Embase/CINAHL feeds via API; Cochrane Crowd validation |
| **Access Methods** | Direct institutional login; Apify API; Cochrane Crowd for screening |

**Integration Notes:**
- CSS uses API direct feeds + machine learning + crowdsourcing for RCT identification
- PubMed/MEDLINE direct feed: daily API calls harvesting RCTs
- WHO ICTRP and ClinicalTrials.gov also feed into CENTRAL
- No public REST API; requires web scraping or institutional XML feeds
- **Status:** ACTIVE, RESTRICTED ACCESS | **Priority:** P1-HIGH

---

### 1.3 NICE Evidence Search
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.evidence.nhs.uk |
| **API Type** | Web portal search; no public REST API identified |
| **Documentation** | https://healthacademy.lancsteachinghospitals.nhs.uk/app/uploads/2021/02/Library-Guide-NICE-Evidence-Search.pdf |
| **Authentication** | Free public access for search |
| **Data Coverage** | 300,000+ resources from hundreds of accredited sources |
| **Content Types** | Guidelines, reports, policy documents, systematic reviews |

**Integration Notes:**
- Web-based portal; no direct API for bulk access
- NICE Pathways and CKS (Clinical Knowledge Summaries) available via web
- Consider web scraping or RSS feeds for integration
- **Status:** ACTIVE, NO PUBLIC API | **Priority:** P2-MEDIUM

---

### 1.4 TRIP Medical Database API
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.tripdatabase.com/ |
| **API Type** | REST API (search endpoint) |
| **Documentation** | https://support.leanlibrary.com/hc/en-gb/articles/5034683682591 |
| **Authentication** | Free tier available; Pro version requires API key |
| **Rate Limits** | Not publicly documented |
| **Data Coverage** | 125+ million clinical articles, systematic reviews, guidelines |
| **API Endpoint** | `https://www.tripdatabase.com/api/search?criteria=[query]&search_type=standard&skip=0&response_type=json` |
| **Response Format** | JSON |

**Integration Notes:**
- Free API endpoint for basic search
- Premium features (TRIP Pro) require institutional subscription
- Searches 150+ resources including Cochrane, DARE, guidelines, MEDLINE
- Supports UMLS matching, synonym addition, misspelling recognition
- **Status:** ACTIVE, FREE/PRO TIERS | **Priority:** P1-HIGH

---

### 1.5 Epistemonikos Evidence Database API
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.epistemonikos.org |
| **API Base** | https://api.epistemonikos.org/v1/ |
| **API Documentation** | https://api.epistemonikos.org/ |
| **Authentication** | Token-based (register at dev@epistemonikos.org) |
| **Data Coverage** | 300,000+ systematic reviews; 1.4M+ records screened |
| **Key Endpoints** | `/documents/{id}`, `/documents/search`, `/documents/advanced_search`, `/studies_threads/{id}` |
| **Response Format** | JSON |

**Integration Notes:**
- Largest systematic review database
- Supports boolean queries, faceted search, classification filtering
- "Studification" combines multiple references for same study
- "Matrices of evidence" link systematic reviews to included studies
- Rate limiting not publicly documented
- **Status:** ACTIVE, FREE REGISTRATION | **Priority:** P1-HIGH

---

### 1.6 PEDro (Physiotherapy Evidence Database)
| Attribute | Details |
|-----------|---------|
| **URL** | https://pedro.org.au/ |
| **API Type** | Web search interface; no REST API identified |
| **Documentation** | https://pedro.org.au/english/resources/search-help/ |
| **Authentication** | Free, no registration required |
| **Data Coverage** | 68,000+ trials, reviews, and guidelines evaluating physiotherapy |
| **Key Features** | PEDro scale quality ratings; 17 language sections; free full text for ~60% |
| **Search Types** | Advanced (13 fields), Simple, Consumer |

**Integration Notes:**
- Web scraping or form-based POST for programmatic access
- Quality ratings pre-applied using PEDro scale (11-item checklist)
- Covers all physiotherapy interventions; no restriction by language
- Free full text access available for ~60% of indexed articles
- **Status:** ACTIVE, FREE | **Priority:** P1-HIGH (for rehab protocols)

---

### 1.7 OTseeker (Occupational Therapy)
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.otseeker.com/ |
| **API Type** | Web search interface only |
| **Authentication** | Free |
| **Data Coverage** | Systematic reviews, RCTs, and resources relevant to OT (pre-2016 comprehensive) |
| **Key Features** | Critically appraised trials for validity and interpretability |

**Integration Notes:**
- No API; web-based search only
- Content from 2016+ is not comprehensive (lack of funding)
- Recommend supplementing with PubMed/PEDro searches for recent evidence
- **Status:** ACTIVE, LIMITED UPDATES | **Priority:** P3-LOW

---

### 1.8 SpeechBITE (Speech Pathology)
| Attribute | Details |
|-----------|---------|
| **URL** | http://speechbite.com.au/ |
| **API Type** | Web database only |
| **Authentication** | Free |
| **Data Coverage** | Systematic reviews, RCTs, non-RCTs, case series, single case designs |
| **Key Features** | Methodological ratings included; modelled on PsycBITE/PEDro |

**Integration Notes:**
- No API available; manual search interface
- Evidence-based practice initiative between University of Sydney and Speech Pathology Australia
- **Status:** ACTIVE, FREE | **Priority:** P3-LOW (specialty-specific)

---

### 1.9 PsycBITE (Psychology Evidence)
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.psycbite.com/ (integrated with speechbite) |
| **API Type** | Web database only |
| **Authentication** | Free |
| **Data Coverage** | Psychologically-based therapies for acquired brain injury rehabilitation |
| **Key Features** | Treatment studies with empirical data on intervention effectiveness |

**Integration Notes:**
- No API available
- Model for SpeechBITE; focuses on ABI rehabilitation
- **Status:** ACTIVE, FREE | **Priority:** P3-LOW (specialty-specific)

---

## SECTION 2: CLINICAL TRIAL REGISTRIES (5 registries)

---

### 2.1 ClinicalTrials.gov API v2
| Attribute | Details |
|-----------|---------|
| **URL** | https://clinicaltrials.gov/ |
| **API Base** | `https://clinicaltrials.gov/api/v2/` |
| **Documentation** | https://clinicaltrials.gov/api/ (About the API) |
| **Authentication** | None required |
| **Rate Limits** | Not publicly documented; be considerate with request frequency |
| **Data Coverage** | 500,000+ registered clinical trials from 220 countries |
| **API Spec** | OpenAPI 3.0 Specification |
| **Key Endpoints** | `/studies` (full studies), `/studies?fields=` (select fields), `/version` |
| **Response Format** | JSON (primary), CSV available |

**Integration Notes:**
- REST API using OpenAPI 3.0; supports third-party library integration
- Standardized enumerated values, ISO 8601 dates, CommonMark Markdown
- Search expression syntax documented; supports fielded queries
- Python client `pytrials` available: `ClinicalTrials._BASE_URL = "https://clinicaltrials.gov/api/v2/"`
- Legacy API retired June 2024; migrate to v2
- **Status:** ACTIVE, FREE | **Priority:** P0-CRITICAL

---

### 2.2 EU Clinical Trials Register / CTIS
| Attribute | Details |
|-----------|---------|
| **URL** | https://euclinicaltrials.eu/ |
| **API Type** | No public REST API (EU member state API only) |
| **Alternative** | Web scraping via `euclinicaltrials.py` Python package |
| **Authentication** | N/A for public access |
| **Data Coverage** | Interventional clinical trials in EU/EEA since 2004 |
| **Python Package** | `pip install -e git+https://github.com/JulHeg/euclinicaltrials.py.git` |

**Integration Notes:**
- CTIS (Clinical Trial Information System) launched January 2022
- No public machine-readable interface; web scraping required
- `euclinicaltrials.py` package provides lazy evaluation for trial data
- Also accessible via WHO ICTRP search portal
- **Status:** ACTIVE, NO PUBLIC API | **Priority:** P2-MEDIUM

---

### 2.3 WHO International Clinical Trials Registry Platform (ICTRP)
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.who.int/tools/clinical-trials-registry-platform |
| **Search Portal** | https://trialsearch.who.int |
| **API Type** | Search portal; REST API (OAI-PMH); bulk download |
| **Authentication** | Free |
| **Data Coverage** | 18+ primary registries aggregated; largest global trial platform |
| **Registries Included** | ClinicalTrials.gov, EU-CTR, ISRCTN, ANZCTR, ChiCTR, DRKS, IRCT, ReBec, JPRN, and more |

**Integration Notes:**
- Aggregates data from 18+ primary registries worldwide
- Universal Trial Number (UTN) for unique identification
- WHO Trial Registration Data Set as minimum standard
- Searchable via web portal; bulk data available
- **Status:** ACTIVE, FREE | **Priority:** P1-HIGH

---

### 2.4 ISRCTN Registry API
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.isrctn.com/ |
| **API Base** | `https://www.isrctn.com/api/` |
| **Documentation** | https://www.isrctn.com/page/help |
| **Authentication** | Public API (no key required) |
| **Data Coverage** | 26,889+ registered studies |
| **API Format** | XML (4 formats: default, who, ukctg, internal) |
| **Endpoint Pattern** | `/api/trial/{isrctn}/format/{format}` |

**Integration Notes:**
- Recognized by WHO and ICMJE as primary registry
- Accepts all clinical research studies (proposed, ongoing, completed)
- XML API publicly available; be considerate with large queries
- Returns metadata including trial design, interventions, outcomes
- **Status:** ACTIVE, FREE | **Priority:** P1-HIGH

---

### 2.5 ANZCTR (Australia New Zealand Clinical Trials Registry)
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.anzctr.org.au/ |
| **API Type** | Web search; Excel download; no REST API identified |
| **Authentication** | Free public search |
| **Data Coverage** | Australian, New Zealand, and international clinical trials |
| **Key Features** | WHO Primary Registry; accepts interventional and observational studies |

**Integration Notes:**
- WHO Primary Registry since 2007
- Free download of trial data in Excel format
- Prioritizes Australia/NZ trials; accepts international submissions
- **Status:** ACTIVE, FREE | **Priority:** P2-MEDIUM

---

## SECTION 3: OUTCOME MEASURE DATABASES (10 databases)

---

### 3.1 NIH PROMIS (Patient-Reported Outcomes Measurement Information System)
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.healthmeasures.net |
| **API** | Assessment Center API |
| **Documentation** | https://www.healthmeasures.net/explore-measurement-systems/promis/obtain-administer-measures |
| **Authentication** | API license required; contact api@assessmentcenter.net |
| **Data Coverage** | 500+ validated measures across physical, mental, and social health domains |
| **Key Features** | Computer Adaptive Tests (CATs); short forms; profiles; T-score metrication |
| **Platforms** | REDCap, Epic, Assessment Center API, NIH Toolbox iPad App |
| **Translations** | 100+ languages available |

**Integration Notes:**
- Gold standard for patient-reported outcomes in clinical research
- CATs require digital administration via API
- HEAP (HealthMeasures Electronic Administration Permission) required for commercial platforms
- Free for single research studies by non-commercial users
- API connects administration platform with full library including CATs
- **Status:** ACTIVE, LICENSED API | **Priority:** P0-CRITICAL

---

### 3.2 Neuro-QOL (Quality of Life in Neurology)
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.neuroqol.org/ |
| **Administration** | Via Assessment Center or REDCap |
| **Documentation** | https://pmc.ncbi.nlm.nih.gov/articles/PMC3369516/ |
| **Data Coverage** | 13 adult QOL domain item banks; 8-9 item short forms |
| **Key Domains** | Anxiety, depression, fatigue, upper/lower extremity function, cognition, sleep, social participation, stigma |
| **Scoring** | T scores (mean=50, SD=10); calibrated to US general population or clinical populations |

**Integration Notes:**
- Developed for neurologic conditions using IRT-based item banks
- Short forms take <2 minutes each; 6-domain profile ~10 minutes
- Available as CAT or static short forms
- Administered via same platforms as PROMIS (Assessment Center API)
- **Status:** ACTIVE, FREE (via Assessment Center) | **Priority:** P1-HIGH

---

### 3.3 Fugl-Meyer Assessment (FMA) Norms
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.gu.se/en/neuroscience-physiology/fugl-meyer-assessment |
| **Protocol Source** | University of Gothenburg |
| **Max Score** | UE: 66 points; LE: 34 points; Total: 100 points |
| **Key Features** | Standardized International Manual available; 20+ language translations |
| **Norms** | Recommended as core measure in all stroke recovery/rehabilitation trials |

**Integration Notes:**
- No central database; norms published in journal articles
- 22 versions identified in literature; FMA-UE (full 50-item version) most psychometrically validated
- Protocols free for non-commercial clinical/research use
- Requires permission for official translations
- **Status:** ACTIVE, FREE PROTOCOLS | **Priority:** P1-HIGH (stroke/neurorehab)

---

### 3.4 MoCA (Montreal Cognitive Assessment) Norms
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.mocatest.org/ |
| **Administration** | Paper-based; 10-15 minutes |
| **Score Range** | 0-30; >=26 normal; education correction (+1 point if <=12 years) |
| **Norm Sources** | Country-specific normative studies (Italy, Mexico, Netherlands, Arab countries, etc.) |

**Integration Notes:**
- Normative data varies by country, age, education, language
- Norms available for: healthy aging, depression, Parkinson's, stroke, etc.
- Training and certification required for administration (mocatest.org)
- Multiple validated translations available
- **Status:** ACTIVE, CERTIFICATION REQUIRED | **Priority:** P1-HIGH

---

### 3.5 GAD-7 / PHQ-9 Normative Data
| Attribute | Details |
|-----------|---------|
| **GAD-7 Source** | Spitzer et al. (2006) - Anxiety screening |
| **PHQ-9 Source** | Kroenke et al. (2001) - Depression screening |
| **Score Ranges** | GAD-7: 0-21 (0-4 minimal, 5-9 mild, 10-14 moderate, 15-21 severe) |
| | PHQ-9: 0-27 (0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe) |
| **Norms** | Population norms from primary care, general population, and clinical samples |

**Integration Notes:**
- Both are public domain; no licensing fees
- Validated in 20+ languages each
- Cutoff scores validated for clinical screening
- Available via PROMIS Assessment Center as part of emotional distress item bank
- **Status:** FREE, PUBLIC DOMAIN | **Priority:** P0-CRITICAL (mental health)

---

### 3.6 Berg Balance Scale (BBS) Norms
| Attribute | Details |
|-----------|---------|
| **Items** | 14 items, scored 0-4 |
| **Max Score** | 56 |
| **Score Interpretation** | <45 = greater fall risk; 41-56 = low fall risk; 21-40 = medium fall risk; 0-20 = high fall risk |
| **Normative Data** | Age/gender/assistive device stratified norms available (Lusardi, 2004) |

**Integration Notes:**
- Cronbach's alpha >0.83 (stroke), >0.97 (elderly)
- Age-specific norms by decade (60-69, 70-79, 80-89, 90-101)
- No central database; norms published in rehabilitation literature
- **Status:** FREE, PUBLISHED NORMS | **Priority:** P2-MEDIUM

---

### 3.7 6-Minute Walk Test (6MWT) Norms
| Attribute | Details |
|-----------|---------|
| **Reference Equations** | Enright & Sherrill (most commonly used) |
| | Men: 6MWD = (7.57 x height cm) - (5.02 x age) - (1.76 x weight kg) - 309 |
| | Women: 6MWD = (2.11 x height cm) - (2.29 x weight kg) - (5.78 x age) + 667 |
| **Age-Specific Norms** | 20-30: Men 640-680m, Women 580-620m; 80+: Men 460-520m, Women 420-470m |
| **Disease-Specific** | COPD (GOLD), Heart Failure (NYHA), Pulmonary Hypertension reference values available |

**Integration Notes:**
- Meta-analysis of 72 studies compiled reference values for adults 60+
- Distance decreases ~10.25m per year of age
- ATS/ERS protocol standardization recommended
- **Status:** FREE, PUBLISHED EQUATIONS | **Priority:** P1-HIGH

---

### 3.8 RehaCom Cognitive Assessment
| Attribute | Details |
|-----------|---------|
| **Type** | Computer-based cognitive rehabilitation and assessment software |
| **Developer** | Hasomed/RehaCom GmbH |
| **Assessment Areas** | Attention, memory, executive function, processing speed, visuospatial skills |
| **Norms** | Age- and education-adjusted norms built into software |

**Integration Notes:**
- Commercial software; not a freely accessible database
- Used in combination with standard neuropsych tests (DSF/DSB, SDMT, RAVLT, BVMT-R, CDT, CFT)
- Normative data proprietary to RehaCom system
- **Status:** COMMERCIAL SOFTWARE | **Priority:** P3-LOW

---

### 3.9 CANTAB (Cambridge Neuropsychological Test Automated Battery)
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.cambridgecognition.com/cantab/ |
| **Type** | Computerized cognitive assessment battery |
| **Key Domains** | Executive function, working memory, episodic memory, attention, processing speed |
| **Norms** | Extensive normative database by age, gender, education |

**Integration Notes:**
- Commercial product by Cambridge Cognition
- Age- and education-stratified norms available
- Research license required for use
- No public API for normative data access
- **Status:** COMMERCIAL, LICENSED | **Priority:** P3-LOW

---

### 3.10 PROMs (Patient Reported Outcomes) General Resources
| Attribute | Details |
|-----------|---------|
| **NHS PROMs Programme** | https://www.england.nhs.uk/statistics/statistical-work-areas/proms/ |
| **CIHI PROMs** | https://www.cihi.ca/en/patient-reported-outcome-measures-proms-metadata |
| **AAOS PROMs** | https://www.aaos.org/registries/current-participant-resources/proms/ |
| **PROM-Select App** | https://prom-select.eu/ (PROM selection tool) |
| **HL7 PRO Standard** | https://github.com/HL7/patient-reported-outcomes |

**Integration Notes:**
- NHS PROMs: hip/knee replacement, groin hernia, varicose vein surgery outcomes
- CIHI PROMs: hip and knee arthroplasty (Oxford Hip/Knee Score)
- PROM-Select: web app for selecting appropriate PROMs by condition
- HL7 developing standards for PRO administration via FHIR/SMART on FHIR
- **Status:** VARIES BY SOURCE | **Priority:** P2-MEDIUM

---

## SECTION 4: BIOMARKER REFERENCE DATABASES (8 databases)

---

### 4.1 LOINC (Logical Observation Identifiers Names and Codes)
| Attribute | Details |
|-----------|---------|
| **URL** | https://loinc.org/ |
| **FHIR API** | https://fhir.loinc.org/ |
| **API Type** | FHIR Terminology Service (CodeSystem $lookup, ValueSet $expand) |
| **Authentication** | Free LOINC username/password required for API |
| **Data Coverage** | 86,000+ lab test and clinical measurement identifiers |
| **Key Features** | Universal standard for lab test identification; FHIR-native integration |
| **API Endpoints** | `$lookup`, `$expand`, ValueSet definition, CodeSystem operations |

**Integration Notes:**
- Essential for normalizing lab test names across different sources
- FHIR integration enables mapping to HPO (Human Phenotype Ontology) terms
- Critical for `biomarker_evidence_bridge.py`
- LOINC to HPO annotations available for 2,923 commonly used lab tests
- **Status:** ACTIVE, FREE REGISTRATION | **Priority:** P0-CRITICAL

---

### 4.2 Laboratory Reference Ranges (General)
| Attribute | Details |
|-----------|---------|
| **NBME Reference Values** | https://www.nbme.org/sites/default/files/2025-03/NBME_Laboratory_Reference_Values.pdf |
| **Cleveland Clinic** | https://my.clevelandclinic.org/health/articles/9653-common-blood-tests |
| **Mayo Clinic Labs** | https://www.mayocliniclabs.com/test-catalog |
| **Sources** | NBME, individual laboratory references, clinical textbooks |
| **Parameters** | CBC, electrolytes, renal function, liver function, lipids, glucose, immunoglobulins |

**Integration Notes:**
- No single unified API for all reference ranges
- NBME provides standardized reference values for USMLE
- Mayo Clinic Labs offers test catalog with reference ranges
- Critical to use age/gender-specific reference ranges where available
- **Status:** FREE, PUBLISHED REFERENCES | **Priority:** P1-HIGH

---

### 4.3 NHANES (National Health and Nutrition Examination Survey)
| Attribute | Details |
|-----------|---------|
| **URL** | https://wwwn.cdc.gov/nchs/nhanes |
| **Data Download** | https://wwwn.cdc.gov/nchs/nhanes/search/datapage.aspx |
| **API Type** | Direct data download (SAS XPT format); nhanesA R package |
| **Authentication** | Free (public domain US government data) |
| **Data Coverage** | Continuous since 1999; 1999-2023 available; 500,000+ participant records |
| **Laboratory Data** | 400+ biomarker datasets across all survey cycles |
| **R Package** | `nhanesA` - direct interface to NHANES API |

**Integration Notes:**
- Gold standard for US population-level biomarker reference data
- Laboratory data categories: biochemistry, hematology, environmental chemicals, infectious disease serology, nutritional status
- Complex survey design requires proper weighting for analysis
- `nhanesdata` R package provides curated parquet files via Cloudflare
- **Status:** ACTIVE, FREE PUBLIC DOMAIN | **Priority:** P1-HIGH

---

### 4.4 UK Biobank Biomarker Data
| Attribute | Details |
|-----------|---------|
| **URL** | https://www.ukbiobank.ac.uk/ |
| **Data Browser** | https://biobank.ndph.ox.ac.uk/ukb/exinfo.cgi?src=AccessingData |
| **Access Method** | UK Biobank Research Analysis Platform (UKB-RAP) |
| **Authentication** | Application-based access; £3,000-£6,000 fee for full data |
| **Data Coverage** | 500,000 participants; 34+ biochemistry markers; metabolomics; proteomics |
| **Biomarker Types** | Lipids, HbA1c, renal/liver function, sex hormones, rheumatoid factor, hematology |
| **Access Model** | Cloud-based only (UKB-RAP); downloadable data being phased out |

**Integration Notes:**
- Tiered access: Core data (£3,000), Enhanced (£6,000), Large datasets (£6,000+)
- 34 NMR metabolomics biomarkers measured in all 500K participants
- Nightingale Health NMR metabolomics: 200+ metabolites for 170K+ participants
- Access via DNAnexus cloud platform (AWS hosted in London)
- **Status:** ACTIVE, PAID APPLICATION | **Priority:** P2-MEDIUM

---

### 4.5 Inflammatory Marker Reference Ranges
| Attribute | Details |
|-----------|---------|
| **CRP Reference** | <5 mg/L (standard); <3 mg/L (AHA cardiovascular risk) |
| **IL-6 Reference** | <7 pg/mL (Roche Elecsys); <6.4 pg/mL (non-parametric 95%) |
| **TNF-alpha Reference** | Varies by assay; typically <8.1 pg/mL |
| **Key Sources** | Manufacturer package inserts, clinical laboratory standards, published studies |

**Integration Notes:**
- Reference ranges vary by assay manufacturer and method
- CRP: immunoturbidimetric vs latex immunoassay differences
- IL-6: chemiluminescent immunoassay; sandwich method
- Clinical context matters (infection vs cardiovascular vs autoimmune)
- **Status:** PUBLISHED REFERENCES | **Priority:** P1-HIGH

---

### 4.6 BDNF (Brain-Derived Neurotrophic Factor) Reference Ranges
| Attribute | Details |
|-----------|---------|
| **Assay** | Quantikine ELISA (R&D Systems DBD00) |
| **Assay Range** | 62.5-4000 pg/mL |
| **Sample Types** | Cell culture supernates, serum, EDTA plasma, platelet-poor heparin plasma, citrate plasma |
| **Reference Ranges** | Vary significantly by sample type, processing, and population |

**Integration Notes:**
- No standardized universal reference range
- Sample collection/processing significantly affects levels
- Age, exercise, stress, and clinical conditions affect BDNF levels
- Research context: typically compare within-study rather than to absolute norms
- **Status:** ASSAY-SPECIFIC | **Priority:** P2-MEDIUM

---

### 4.7 CIRCORT (Salivary Cortisol Reference Database)
| Attribute | Details |
|-----------|---------|
| **Publication** | PMID: 27448524; PMCID: PMC5108362 |
| **Data Coverage** | 104,623 samples from 18,698 individuals; ages 0.5-98.5 years |
| **Reference Values** | Age- and sex-specific percentiles (5th, 50th, 95th) for 8 time points |
| **Key Features** | LC-MS/MS calibrated; seasonal variation documented; diurnal profiles |
| **Typical Ranges** | 1-hour post-awakening: ~4.7-8.8 nmol/L (varies by age/sex) |

**Integration Notes:**
- Largest salivary cortisol normative dataset
- Accounts for circannual variation (highest in spring, lowest in autumn)
- Age-specific increases after 50 (~2% per decade)
- Males ~3% higher than females
- **Status:** PUBLISHED DATASET | **Priority:** P1-HIGH (stress/neuro)

---

### 4.8 HRV (Heart Rate Variability) Normative Values
| Attribute | Details |
|-----------|---------|
| **Time Domain** | RMSSD, pRR50, SDRR, average RR |
| **Frequency Domain** | Total power, LF, HF, LF/HF ratio |
| **Age Effect** | RMSSD and pRR50 decline with age; parasympathetic tone decreases |
| **Gender Effect** | Females generally higher RMSSD, pRR50 than males |
| **Population Variation** | High-altitude populations show different norms vs sea level |

**Integration Notes:**
- Norms vary by measurement device, protocol, and population
- Common reference: RMSSD >20ms generally considered healthy adult range
- Age-adjusted percentiles needed for clinical interpretation
- Wearable devices (Oura, Whoop, Garmin) provide their own normative comparisons
- **Status:** PUBLISHED LITERATURE | **Priority:** P2-MEDIUM

---

## SECTION 5: WEARABLE/CONSUMER HEALTH APIs (8 APIs)

---

### 5.1 Fitbit Web API
| Attribute | Details |
|-----------|---------|
| **Developer Portal** | https://www.fitbit.com/dev |
| **API Base** | `https://api.fitbit.com/1/user/-/` |
| **Data Dictionary** | https://assets.ctfassets.net/.../Fitbit-Web-API-Data-Dictionary.pdf |
| **Authentication** | OAuth 2.0 (authorization code flow) |
| **Rate Limits** | Documented per endpoint; standard 150 API calls/hour for most endpoints |
| **Data Coverage** | Steps, heart rate, sleep, activity, SpO2, HRV, stress, skin temperature, ECG, breathing rate |
| **Intraday Data** | 1-second to 15-minute granularity available |
| **Response Format** | JSON |
| **Python Library** | `fitbit-web-api` (allenporter), `python-fitbit` |

**Integration Notes:**
- Most mature consumer wearable API
- OAuth2 flow: authorization URL -> consent -> redirect -> token exchange
- Separate tokens per user; refresh tokens for long-term access
- Intraday data requires special permission (research/study agreement)
- Supports webhooks for real-time data updates
- **Status:** ACTIVE, FREE (research tier) | **Priority:** P0-CRITICAL

---

### 5.2 Apple HealthKit
| Attribute | Details |
|-----------|---------|
| **Developer Portal** | https://developer.apple.com/documentation/healthkit |
| **HIG Guidelines** | https://developer.apple.com/design/human-interface-guidelines/healthkit |
| **API Type** | iOS native framework (Swift/Objective-C); local data store |
| **Authentication** | User permission per data type; no cloud API |
| **Data Coverage** | 150+ data types: activity, heart rate, sleep, nutrition, body measurements, lab results, vitals |
| **Key Classes** | `HKHealthStore`, `HKQuery`, `HKObserverQuery`, `HKAnchoredObjectQuery` |
| **Architecture** | Local device storage; no direct backend/server API |

**Integration Notes:**
- **CRITICAL LIMITATION:** No public cloud API; data stays on user's iPhone
- Requires native iOS app or Flutter/iOS bridge to access data
- Background delivery via `HKObserverQuery` + `enableBackgroundDelivery`
- HealthKit data encrypted when device is locked (may affect background access)
- For backend sync: app must read HealthKit data and send to server
- **Status:** ACTIVE, iOS-ONLY, NO CLOUD API | **Priority:** P1-HIGH

---

### 5.3 Google Fit API / Health Connect
| Attribute | Details |
|-----------|---------|
| **Migration Guide** | https://developer.android.com/health-and-fitness/health-connect/migration/fit |
| **API Status** | Google Fit APIs deprecated; migrating to Health Connect |
| **Health Connect** | Android-native health data hub (Android 14+) |
| **Data Coverage** | Exercise, sleep, nutrition, heart rate, steps, distance, calories |
| **Architecture** | On-device data store; permission-based access |

**Integration Notes:**
- Google Fit APIs being deprecated in favor of Health Connect
- Health Connect provides unified Android health data access
- On-device (no cloud); similar architecture to Apple HealthKit
- For backend sync: Android app reads data and sends to server
- Sensor API, Sessions API, History API all migrating to Health Connect
- **Status:** MIGRATING (Fit -> Health Connect) | **Priority:** P1-HIGH

---

### 5.4 Garmin Health API
| Attribute | Details |
|-----------|---------|
| **Developer Portal** | https://developer.garmin.com/gc-developer-program/ |
| **Health API** | https://developer.garmin.com/gc-developer-program/health-api/ |
| **API Type** | REST; cloud-to-cloud integration |
| **Authentication** | OAuth 2.0 |
| **Data Coverage** | Steps, intensity minutes, sleep, calories, heart rate, stress, Pulse Ox, Body Battery, body composition, respiration, blood pressure, enhanced beat-to-beat |
| **Push/Pull** | Supports push notifications and pull requests |
| **Response Format** | JSON |

**Integration Notes:**
- Enterprise-focused (wellness, population health, patient monitoring)
- Cloud-to-cloud: user syncs Garmin device -> Garmin Connect -> your platform
- Ping/Pull or Push architecture options
- Beat-to-beat interval data requires commercial license
- Women's Health API for menstrual cycle and pregnancy data
- **Status:** ACTIVE, FREE/COMMERCIAL TIERS | **Priority:** P1-HIGH

---

### 5.5 Oura API v2
| Attribute | Details |
|-----------|---------|
| **API Documentation** | https://api.ouraring.com/docs/ |
| **API Base** | `https://api.ouraring.com/v2` |
| **Authentication** | OAuth 2.0 (token-based; PATs deprecated January 2024) |
| **Rate Limits** | 5,000 requests per 5 minutes |
| **Data Coverage** | Sleep, daily readiness, daily activity, HRV, heart rate, workouts, sessions, tags, SpO2, stress, resilience, cardiovascular age, VO2 max |
| **Key Endpoints** | `/usercollection/daily_sleep`, `/usercollection/daily_activity`, `/usercollection/daily_readiness`, `/usercollection/heart_rate`, `/usercollection/sleep` |
| **Response Format** | JSON |
| **Python Libraries** | `oura_api` (Pinta365/JSR), `ouraring` (dlt) |

**Integration Notes:**
- Clinical-grade sleep and HRV tracking; widely used in research
- V2 includes significantly more data types than V1
- Sandbox environment available for testing without real data
- Webhooks supported for near real-time data updates
- x-oura-signature webhook verification using client secret
- Pagination via `next_token` cursor
- **Status:** ACTIVE, OAUTH2 REQUIRED | **Priority:** P1-HIGH

---

### 5.6 WHOOP API
| Attribute | Details |
|-----------|---------|
| **Developer Portal** | https://developer.whoop.com/ |
| **API Documentation** | https://developer.whoop.com/api/ |
| **API Base** | `https://api.prod.whoop.com` |
| **Authentication** | OAuth 2.0 (authorization code flow) |
| **Data Coverage** | Recovery (score, HRV, RHR), sleep (stages, duration, performance), workouts (strain, HR), cycles (day strain), body measurements, profile |
| **Key Scopes** | `read:recovery`, `read:cycles`, `read:workout`, `read:sleep`, `read:profile`, `read:body_measurement` |
| **Rate Limits** | Documented; token refresh every hour recommended |
| **Response Format** | JSON |

**Integration Notes:**
- Recovery-focused wearable; strong in fitness/research communities
- V2 API now available (v1 webhooks removed)
- ~4KB data per day per user (1 workout, 1 sleep, 1 recovery)
- Requires WHOOP device + membership for API access
- No sandbox environment; must have WHOOP device for development
- **Status:** ACTIVE, MEMBERSHIP REQUIRED | **Priority:** P2-MEDIUM

---

### 5.7 Withings API
| Attribute | Details |
|-----------|---------|
| **Developer Portal** | https://developer.withings.com/api-reference/ |
| **API Version** | 2.0 |
| **Authentication** | OAuth 2.0 |
| **Data Coverage** | Activity, sleep, body composition (scales), blood pressure, heart rate, ECG, SpO2, temperature |
| **Device Types** | Scales, blood pressure monitors, sleep mats, watches, thermometers |
| **Response Format** | JSON |

**Integration Notes:**
- Strong in clinical-grade home health devices (scales, BP monitors)
- OAuth2 authentication; callback URL registration required
- Activity data includes steps, distance, elevation, swimming, calories
- Sleep data from Sleep Mat device (contactless under-mattress sensor)
- Heart data from ScanWatch (including ECG, AFib detection)
- **Status:** ACTIVE, FREE | **Priority:** P2-MEDIUM

---

### 5.8 Polar Accesslink API
| Attribute | Details |
|-----------|---------|
| **Developer Portal** | https://www.polar.com/polar-api-v4 |
| **API Base** | `https://www.polaraccesslink.com/v4/data` |
| **Authentication** | OAuth 2.0 |
| **Rate Limits** | 3,000 requests/15min; 100,000 requests/24h per client ID |
| **Data Coverage** | Training sessions, daily activity, physical info, heart rate zones, GPS, speed/pace, running power, nightly Recharge, sleep, continuous HR |
| **API Versions** | v3 (legacy), v4 (current) |
| **Response Format** | JSON, XML (v3) |
| **Python Library** | `polar-flow` (StuMason) - async Python client |

**Integration Notes:**
- Strong in sports medicine and cardiac rehabilitation
- Nightly Recharge (recovery metric) and Sleep Plus Stages
- Training Load Pro for cardiovascular and muscular load
- Read-only API (cannot write data to Polar Flow)
- Event-driven push notifications available
- **Status:** ACTIVE, FREE | **Priority:** P2-MEDIUM

---

## SECTION 6: NUTRITION DATABASES (4 databases)

---

### 6.1 USDA FoodData Central API
| Attribute | Details |
|-----------|---------|
| **URL** | https://fdc.nal.usda.gov/ |
| **API Guide** | https://fdc.nal.usda.gov/api-guide |
| **API Base** | `https://api.nal.usda.gov/fdc/v1/` |
| **Authentication** | API key from data.gov (free); DEMO_KEY for exploration |
| **Rate Limits** | 1,000 requests/hour per IP; 10,000/hour with API key |
| **Data Coverage** | 350,000+ foods across 5 data types |
| **Data Types** | Foundation Foods, Branded Foods, FNDDS, SR Legacy, Experimental Foods |
| **Key Endpoints** | `/food/{fdcId}`, `/foods`, `/foods/list`, `/foods/search` |
| **Response Format** | JSON |
| **License** | Public Domain (CC0 1.0) |

**Integration Notes:**
- Primary data source for `nutrition_evidence_bridge.py`
- Foundation Foods: analytically derived nutrient values
- FNDDS: Food and Nutrient Database for Dietary Studies (linked to NHANES)
- Branded Foods: monthly updates from manufacturer labels
- Search endpoint supports filtering by dataType, nutrients, brandOwner
- **Status:** ACTIVE, FREE | **Priority:** P0-CRITICAL

---

### 6.2 Dietary Supplement Label Database (DSLD) API
| Attribute | Details |
|-----------|---------|
| **URL** | https://dsld.od.nih.gov/ |
| **API Guide** | https://dsld.od.nih.gov/api-guide |
| **API Base** | `https://api.ods.od.nih.gov/dsld/v9/` |
| **Authentication** | None required; API key increases rate limit |
| **Rate Limits** | 1,000/hour (no key); 10,000/hour (with API key) |
| **Data Coverage** | 200,000+ dietary supplement labels |
| **Key Endpoints** | `/label/{dsldId}`, `/brand-products`, `/browse-products`, `/search-filter`, `/ingredient-groups` |
| **Response Format** | JSON |
| **License** | Public Domain (CC0 1.0) |

**Integration Notes:**
- All label information from products marketed in US
- Images of package labels, ingredient names, amounts, label statements
- Supports barcode/UPC search for product identification
- Ingredient groups for checking supplement-drug interactions
- Factsheets available for common ingredients
- **Status:** ACTIVE, FREE | **Priority:** P1-HIGH

---

### 6.3 Mediterranean Diet Score Database
| Attribute | Details |
|-----------|---------|
| **Trichopoulou Score** | 9-point scale (0-9): vegetables, legumes, fruits/nuts, cereals, fish, olive oil, meat, dairy, wine |
| **Rush MAP Score** | 0-55 scale: 11 components scored 0-5 each |
| **FAOSTAT** | https://www.fao.org/faostat/ - food supply data for population-level scoring |
| **Key References** | Trichopoulou et al. (2003, 2005); Panagiotakos et al. (2006) |

**Integration Notes:**
- No single API; scoring uses food frequency questionnaire data
- Population-level: FAOSTAT database for food supply per capita
- Individual-level: FFQ responses scored against Mediterranean diet components
- MDS tools: https://www.radc.rush.edu/docs/var/detail.htm (MAP variables)
- **Status:** SCORING METHODOLOGY | **Priority:** P2-MEDIUM

---

### 6.4 MIND Diet Score Database
| Attribute | Details |
|-----------|---------|
| **Score Range** | 0-15 points (15 components scored 0, 0.5, or 1) |
| **Healthy Components** | Green leafy vegetables, other vegetables, nuts, berries, beans, whole grains, fish, poultry, olive oil, wine |
| **Unhealthy Components** | Red/processed meats, butter/margarine, cheese, pastries/sweets, fried/fast foods |
| **Key Reference** | Morris et al. (2015); Rush Memory and Aging Project |
| **Screener** | 15-question MIND diet screener validated (2025) |

**Integration Notes:**
- No central database; scoring from FFQ data
- MIND diet screener: 15 questions, validated against full FFQ
- VioScreen FFQ to MIND score conversion available on GitHub
- Scoring code: https://github.com/desdemps/VioScreen-MIND-scoring-R
- Rush MAP variable details: https://www.radc.rush.edu/docs/var/detail.htm
- **Status:** SCORING METHODOLOGY | **Priority:** P2-MEDIUM

---

## INTEGRATION ARCHITECTURE RECOMMENDATIONS

### Evidence Pipeline Architecture

```
                    +------------------+
                    |  PubMed/E-util  | <--+ Primary evidence
                    +--------+---------+    source (35M+ citations)
                             |
                    +--------v---------+
                    |  ClinicalTrials  | <--+ Protocol validation
                    |    .gov API v2   |    (500K+ trials)
                    +--------+---------+
                             |
                    +--------v---------+
                    |   Cochrane/CSS   | <--+ Gold standard
                    |   Epistemonikos  |    systematic reviews
                    |     TRIP DB      |
                    +--------+---------+
                             |
                    +--------v---------+
                    |  evidence_rag.py | <--+ RAG processing
                    +--------+---------+    (352 lines)
                             |
                    +--------v---------+
                    |evidence_intellig | <--+ Intelligence
                    |     ence.py      |    analysis (1596 lines)
                    +--------+---------+
                             |
                    +--------v---------+
                    |  Protocol Studio | <--+ Synthesized output
                    +------------------+
```

### Outcome Measurement Pipeline

```
+---------------+ +---------------+ +---------------+ +---------------+
|  NIH PROMIS   | |   Neuro-QOL   | |  MoCA/GAD-7   | |   6MWT/BBS    |
| Assessment    | |  (via AC API) | |   PHQ-9       | |   Norms       |
| Center API    | |               | |   (Public)    | |   (Published) |
+-------+-------+ +-------+-------+ +-------+-------+ +-------+-------+
        |                 |                 |                 |
        +-----------------+-----------------+-----------------+
                          |
                    +-----v------+
                    |  Outcome   |
                    |  Score DB  |
                    +-----+------+
                          |
                    +-----v------+
                    | Protocol   |
                    | Templates  |
                    +------------+
```

### Biomarker Reference Pipeline

```
+----------------+ +----------------+ +----------------+ +----------------+
|     LOINC      | |    NHANES      | |   CIRCORT      | |   Reference    |
|    FHIR API    | |  Lab Data      | |   (Cortisol)   | |   Ranges       |
|                | |  (CDC)         | |                | |   (Published)  |
+-------+--------+ +-------+--------+ +-------+--------+ +-------+--------+
        |                  |                  |                  |
        +------------------+------------------+------------------+
                           |
                     +-----v------+
                     | biomarker_ |
                     | evidence_  |
                     | bridge.py  |
                     +------------+
```

### Wearable Data Pipeline

```
+------------+ +------------+ +------------+ +------------+ +------------+
|   Fitbit   | |    Oura    | |   Garmin   | |   Apple    | |  Google    |
|  Web API   | |  API v2    | | Health API | | HealthKit  | |  Health    |
| (OAuth2)   | |  (OAuth2)  | |  (OAuth2)  | | (iOS SDK)  | |  Connect   |
+-----+------+ +-----+------+ +-----+------+ +-----+------+ +-----+------+
      |              |              |              |              |
      +--------------+--------------+--------------+--------------+
                           |
                     +-----v------+
                     | Wearable   |
                     | Aggregator |
                     +-----+------+
                           |
                     +-----v------+
                     | Protocol   |
                     |  Engine    |
                     +------------+
```

### Nutrition Data Pipeline

```
+------------------+ +------------------+ +------------------+
|  USDA FoodData   | |      DSLD        | |   Diet Scoring   |
|  Central API     | |   (NIH ODS)      | |   (MIND/Med)     |
|                  | |                  | |                  |
+--------+---------+ +--------+---------+ +--------+---------+
         |                    |                    |
         +--------------------+--------------------+
                              |
                       +------v------+
                       | nutrition_  |
                       | evidence_   |
                       | bridge.py   |
                       +-------------+
```

---

## IMPLEMENTATION PRIORITY MATRIX

| Priority | Database | Effort | Impact | Dependencies |
|----------|----------|--------|--------|--------------|
| P0 | PubMed E-utilities | Medium | Critical | None |
| P0 | ClinicalTrials.gov v2 | Low | Critical | None |
| P0 | NIH PROMIS API | Medium | Critical | API license |
| P0 | USDA FoodData Central | Low | Critical | API key |
| P0 | LOINC FHIR API | Medium | Critical | LOINC account |
| P0 | GAD-7/PHQ-9 norms | Low | High | None |
| P1 | Fitbit Web API | Medium | High | OAuth2 setup |
| P1 | Oura API v2 | Medium | High | OAuth2 setup |
| P1 | Cochrane Library | High | High | Institutional access |
| P1 | Epistemonikos API | Low | High | Token registration |
| P1 | TRIP Database API | Low | High | None (free tier) |
| P1 | PEDro | Low | High | Web scraping |
| P1 | NHANES Lab Data | Medium | High | None |
| P1 | CIRCORT (Cortisol) | Low | Medium | None |
| P1 | Garmin Health API | Medium | High | Commercial agreement |
| P1 | Google Health Connect | Medium | High | Android app |
| P1 | Apple HealthKit | High | High | iOS app |
| P1 | Fugl-Meyer Assessment | Low | Medium | Published norms |
| P1 | MoCA norms | Low | Medium | Certification |
| P1 | 6MWT norms | Low | Medium | None |
| P1 | DSLD API | Low | High | None |
| P2 | WHO ICTRP | Low | Medium | None |
| P2 | ISRCTN API | Low | Medium | None |
| P2 | EU CTIS | High | Medium | Web scraping |
| P2 | Neuro-QOL | Medium | Medium | Assessment Center |
| P2 | Berg Balance Scale | Low | Medium | Published norms |
| P2 | BDNF reference ranges | Low | Low | Assay-specific |
| P2 | HRV normative values | Low | Medium | Literature |
| P2 | UK Biobank | High | High | Application + fee |
| P2 | WHOOP API | Medium | Medium | Device + membership |
| P2 | Withings API | Medium | Medium | OAuth2 setup |
| P2 | Polar Accesslink | Medium | Medium | OAuth2 setup |
| P2 | Mediterranean Diet Score | Medium | Medium | FFQ data |
| P2 | MIND Diet Score | Medium | Medium | FFQ data |
| P3 | NICE Evidence Search | High | Low | No API |
| P3 | OTseeker | Low | Low | No API, limited updates |
| P3 | SpeechBITE | Low | Low | No API |
| P3 | PsycBITE | Low | Low | No API |
| P3 | ANZCTR | Low | Low | No API |
| P3 | RehaCom | High | Low | Commercial license |
| P3 | CANTAB | High | Low | Commercial license |
| P3 | General PROMs resources | Medium | Medium | Various sources |

---

## DATA QUALITY & COMPLIANCE CONSIDERATIONS

### Evidence Databases
- **PubMed/PMC**: US government public domain; citation required
- **Cochrane**: Subscription for full text; abstracts freely available
- **ClinicalTrials.gov**: US government data; public domain
- **Epistemonikos**: Free for academic use; API token registration

### Outcome Measures
- **PROMIS/Neuro-QOL**: Free for research; HEAP license for commercial platforms
- **MoCA**: Free for clinical use; training/certification required
- **GAD-7/PHQ-9**: Public domain; free to use
- **Fugl-Meyer**: Free for non-commercial research

### Biomarker Data
- **NHANES**: US government public domain
- **UK Biobank**: Research application; MTA required; cloud-only access
- **LOINC**: Free for non-commercial use; license fees for commercial applications

### Wearable APIs
- All require explicit user consent via OAuth2
- GDPR/CCPA compliance required for health data handling
- Data minimization: request only scopes needed
- All APIs support data export for user portability requirements

### Nutrition Databases
- **USDA FDC**: Public domain (CC0)
- **DSLD**: Public domain (CC0)

---

## EXISTING MODULE INTEGRATION NOTES

### `evidence_rag.py` (352 lines) - Evidence RAG System
- **Primary feeds:** PubMed E-utilities, ClinicalTrials.gov v2, Epistemonikos API
- **Secondary feeds:** Cochrane Library, TRIP Database
- **Recommended:** Implement ESearch -> EFetch pipeline for PubMed; use ClinicalTrials.gov v2 OpenAPI spec for trial retrieval

### `evidence_intelligence.py` (1,596 lines) - Evidence Intelligence
- **Primary feeds:** All clinical evidence databases (Section 1)
- **Trial registries:** ClinicalTrials.gov v2, WHO ICTRP, ISRCTN
- **Recommended:** Build evidence aggregator that normalizes across PubMed, Cochrane, Epistemonikos, and PEDro for intervention-specific queries

### `biomarker_evidence_bridge.py` (117 lines) - Biomarker Evidence
- **Primary feeds:** LOINC FHIR API, NHANES laboratory data, CIRCORT (cortisol)
- **Reference ranges:** NBME values, published literature
- **Recommended:** Implement LOINC code resolution for all biomarkers; use NHANES for population-level reference distributions

### `nutrition_evidence_bridge.py` (222 lines) - Nutrition Evidence
- **Primary feeds:** USDA FoodData Central API, DSLD API
- **Diet scoring:** Mediterranean Diet Score (FAOSTAT), MIND Diet Score (FFQ-based)
- **Recommended:** Build FDC search wrapper for food identification; implement DSLD lookup for supplement verification

---

*End of Report - 44 databases cataloged across 6 categories*
*Next step: Prioritize P0 and P1 integrations for implementation sprint planning*
