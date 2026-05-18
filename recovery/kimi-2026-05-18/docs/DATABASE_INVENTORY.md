# DEEP DATABASE INVENTORY — COMPLETE SYSTEM CATALOG

> Repository: ALIYILD/DeepSynaps-Protocol-Studio
> Last Updated: 2026-05-18
> Total Systems: ~190
> Branch: main

---

## PART 1: INTERNAL DEEP DATABASES

### 1. Primary Database — PostgreSQL (Production) / SQLite (Dev)
| Field | Value |
|-------|-------|
| System | Primary Database |
| Engine | PostgreSQL 15+ (prod), SQLite 3 (dev) |
| Count | 1 system, 231+ tables |
| Purpose | All clinical, operational, billing, research, audit data |

### 1.1 ORM Model Domains (231 tables across 23 model files)

| Domain | Tables | Model File | Key Entities |
|--------|--------|------------|-------------|
| Clinical | 53 | `clinical_models.py` | Sessions, protocols, treatments, medications, risk analysis |
| Research | 21 | `research_models.py` | IRB, literature, evidence, trials, consent forms |
| Operations | 18 | `operations_models.py` | Clinic, sales, scheduling, SLA management |
| qEEG | 18 | `qeeg_models.py` | Brain waveform analysis, montage, cleaning pipelines |
| Devices | 17 | `device_models.py` | Wearables, home monitoring, device pairing |
| Billing | 15 | `billing_models.py` | Subscriptions, payments, marketplace transactions |
| Media | 10 | `media_models.py` | Audio/video storage, transcripts, annotations |
| Auth/User | 12 | `auth_models.py` | Users, roles, permissions, API keys |
| Audit | 8 | `audit_models.py` | Audit logs, access trails, compliance events |
| Notification | 7 | `notification_models.py` | Alerts, messages, preferences |
| Reporting | 6 | `report_models.py` | Generated reports, exports, analytics |
| Configuration | 6 | `config_models.py` | Clinic settings, feature flags, integrations |
| Integrations | 6 | `integration_models.py` | External system hooks, webhooks, sync states |
| Handbooks | 4 | `handbook_models.py` | Handbook content, versions, evidence links |
| Patient Portal | 5 | `patient_portal_models.py` | Patient tasks, home programs, outcomes |
| Knowledge | 8 | `knowledge_models.py` | Adapter configs, cache entries, provenance records |
| Biomarker | 4 | `biomarker_models.py` | Biomarker readings, norms, thresholds |
| Intervention | 5 | `intervention_models.py` | Intervention plans, device configs, protocols |
| CRM | 4 | `crm_models.py` | Contacts, interactions, opportunities |
| Courses | 3 | `course_models.py` | Training modules, progress, certifications |
| Registry | 3 | `registry_models.py` | Patient registries, cohort definitions |
| Monitoring | 3 | `monitoring_models.py` | System health, alerts, metrics |
| Other | 4 | Various | Utility tables, migrations, cross-references |
| **TOTAL** | **231+** | **23 files** | |

### 1.2 Connection Management
- **Pool size**: 20 (configurable via `DB_POOL_SIZE`)
- **Max overflow**: 10
- **Timeout**: 30s
- **SSL**: Required in production (RDS)
- **Migrations**: Alembic (auto-generated from SQLAlchemy models)

---

### 2. Evidence Store — SQLite
| Field | Value |
|-------|-------|
| System | Evidence Store |
| Engine | SQLite 3 |
| Location | `/data/evidence.db` (persistent volume on Fly.io) |
| Count | 1 database |
| Purpose | Separate intelligence backbone for knowledge layer |

**Tables**:
- `evidence_entries` — Cached evidence from external databases
- `provenance_records` — Data lineage and source tracking
- `confidence_scores` — 7-dimensional confidence metrics per entry
- `adapter_metadata` — External adapter connection state
- `synthesis_results` — Multimodal synthesis outputs
- `cache_metadata` — Cache hit/miss tracking

---

### 3. Queue Systems
| Field | Value |
|-------|-------|
| System | Redis + Celery |
| Engine | Redis 7 (Fly.io Upstash), Celery 5.x |
| Count | 2 systems |
| Purpose | Async job processing, real-time events, caching |

**Queues**:
| Queue | Purpose | Workers |
|-------|---------|---------|
| `qeeg-processing` | qEEG analysis pipelines | 4 workers |
| `default` | General async tasks | 2 workers |
| `notifications` | Push/email/SMS delivery | 2 workers |
| `exports` | PDF/bundle generation | 2 workers |
| `research` | Literature search, evidence queries | 2 workers |
| `knowledge-etl` | External database sync | 2 workers |
| `mri-processing` | MRI analysis pipelines | 2 workers |

---

### 4. External Cache DBs (10 tables)
| # | Cache Table | Source Data | Refresh Interval |
|---|------------|-------------|-----------------|
| 1 | `drug_reference_cache` | RxNorm + openFDA + FAERS | 24h |
| 2 | `genetic_variant_cache` | ClinVar + PharmGKB | 48h |
| 3 | `evidence_summary_cache` | PubMed + Cochrane | 12h |
| 4 | `biomarker_norm_cache` | MNI Atlas + Schaefer | Weekly |
| 5 | `food_drug_interaction_cache` | Custom + external | 24h |
| 6 | `medical_code_cache` | LOINC + ICD-10/11 | Weekly |
| 7 | `neuroimaging_reference_cache` | ADNI + ABIDE | Weekly |
| 8 | `adverse_event_cache` | FAERS + OnSIDES | 12h |
| 9 | `brain_atlas_cache` | Allen Brain + Schaefer | Weekly |
| 10 | `outcome_measure_cache` | PROMIS + custom | 48h |

**Storage**: PostgreSQL `cache_*` tables with TTL-based eviction
**Hit rate target**: >85%
**Max TTL**: 7 days

---

### 5. Pipeline Stores (3-4 specialized)
| # | Store | Data Type | Engine |
|---|-------|-----------|--------|
| 1 | qEEG Store | Brain waveform recordings | HDF5 + PostgreSQL metadata |
| 2 | MRI Store | Neuroimaging volumes | NIfTI/ANALYZE + PostgreSQL metadata |
| 3 | Video Store | Session recordings | MP4/WebM + PostgreSQL metadata |
| 4 | Audio Store | Voice/EEG audio | WAV/FLAC + PostgreSQL metadata |

---

## PART 2: EXTERNAL DATABASE ADAPTERS (LIVE — 16 Systems)

These are production adapters connecting to external clinical/scientific databases.
All implement `BaseAdapter` with canonical schema mapping, provenance tracking,
and confidence scoring.

### 2.1 Phase 1 — P0 Adapters (9 adapters)

| # | Adapter | External Database | Organization | Domain | Live Status | File |
|---|---------|------------------|--------------|--------|-------------|------|
| 1 | RxNorm Adapter | **RxNorm** | NIH/NLM | Medication codes | ✅ | `rxnorm_adapter.py` |
| 2 | PharmGKB Adapter | **PharmGKB** | Stanford | Pharmacogenomics | ✅ | `pharmgkb_adapter.py` |
| 3 | ClinVar Adapter | **ClinVar** | NCBI/NIH | Genetic variants | ✅ | `clinvar_adapter.py` |
| 4 | LOINC Adapter | **LOINC** | Regenstrief | Lab codes | ✅ | `loinc_adapter.py` |
| 5 | openFDA Adapter | **openFDA** | FDA | Drug adverse events | ✅ | `openfda_adapter.py` |
| 6 | CHBMP Adapter | **CHBMP** | Chinese Brain Mapping | Brain mapping | ✅ | `chbmp_adapter.py` |
| 7 | MNI Atlas Adapter | **MNI Atlas** | McGill | Neuroimaging atlas | ✅ | `mni_atlas_adapter.py` |
| 8 | PROMIS Adapter | **PROMIS** | NIH | Patient outcomes | ✅ | `promis_adapter.py` |
| 9 | SimNIBS Adapter | **SimNIBS** | Technical Univ. Denmark | tDCS/TMS simulation | ✅ | `simnibs_adapter.py` |

### 2.2 Phase 2 — P1 Adapters (7 adapters)

| # | Adapter | External Database | Organization | Domain | Live Status | File |
|---|---------|------------------|--------------|--------|-------------|------|
| 10 | FAERS Adapter | **FAERS** | FDA | Adverse event reports | ✅ | `faers_adapter.py` |
| 11 | OnSIDES Adapter | **OnSIDES** | Stanford/OHSU | Drug side effects | ✅ | `onsides_adapter.py` |
| 12 | Allen Brain Adapter | **Allen Brain Atlas** | Allen Institute | Gene expression | ✅ | `allen_brain_adapter.py` |
| 13 | Schaefer Adapter | **Schaefer Atlas** | Harvard | Brain parcellation | ✅ | `schaefer_adapter.py` |
| 14 | Neurosynth Adapter | **Neurosynth** | Stanford | Meta-analysis maps | ✅ | `neurosynth_adapter.py` |
| 15 | ADNI Adapter | **ADNI** | USC/UCSF | Alzheimer's imaging | ✅ | `adni_adapter.py` |
| 16 | ABIDE Adapter | **ABIDE** | UMich | Autism brain imaging | ✅ | `abide_adapter.py` |

### 2.3 Adapter Architecture

```
External Database → Adapter → Canonical Schema → Provenance Layer → Evidence Store
                      ↑                            ↓
                 BaseAdapter              Confidence Scoring (7D)
                 - validate()             - data_quality
                 - transform()            - evidence_strength
                 - cache()                - sample_size
                 - provenance()           - replication
                                          - consistency
                                          - temporal_relevance
                                          - population_match
```

---

## PART 3: INTELLIGENCE BRIDGES & SYNTHESIZER (4 bridges + 1 synthesizer)

These components **synthesize** data across multiple external databases.

| # | Component | Type | Input Adapters | Output | File |
|---|-----------|------|----------------|--------|------|
| 1 | Medication Analyzer Bridge | Bridge | RxNorm, PharmGKB, FAERS, OnSIDES | Drug recommendations | `medication_analyzer_bridge.py` |
| 2 | Genetic Analyzer Bridge | Bridge | ClinVar, PharmGKB | Genetic risk profiles | `genetic_analyzer_bridge.py` |
| 3 | qEEG Analyzer Bridge | Bridge | CHBMP, MNI, Neurosynth | Normative comparisons | `qeeg_analyzer_bridge.py` |
| 4 | MRI Analyzer Bridge | Bridge | MNI, Schaefer, ADNI, ABIDE | Structural analysis | `mri_analyzer_bridge.py` |
| 5 | Multimodal Synthesizer | Synthesizer | All 16 adapters + 4 bridges | Unified clinical insights | `multimodal_synthesizer.py` |

---

## PART 4: RESEARCHED EXTERNAL DATABASES (171 Systems)

These databases were catalogued by the Database Research Army and are available
for future integration. Source: 5 research reports.

### 4.1 Neuroimaging Databases (47)

| # | Database | Organization | Data Type | Access |
|---|----------|-------------|-----------|--------|
| 1 | NeuroVault | GitHub/NeuroVault.org | Statistical brain maps | Open API |
| 2 | Brain-CODE | Ontario Brain Institute | Clinical + imaging | Restricted |
| 3 | Human Connectome Project | WashU/UMinn | Structural + functional MRI | Open |
| 4 | UK Biobank | UK Biobank | Multi-modal imaging | Restricted |
| 5 | OpenNeuro | Stanford | Raw neuroimaging datasets | Open |
| 6 | 1000 Functional Connectomes | FCON1000 | Resting-state fMRI | Open |
| 7 | fMRIDC | fMRIDC.org | fMRI datasets | Open |
| 8 | NITRC | Indiana Univ. | Neuroimaging tools + data | Open |
| 9 | Brain Imaging Library | BIL | Brain imaging data | Open |
| 10 | Schaefer Atlas | Harvard | Brain parcellation (400-1000 regions) | Open |
| 11 | AAL Atlas | ResearchGate | Anatomical labeling | Open |
| 12 | Harvard-Oxford Atlas | Harvard | Cortical/subcortical | FSL bundled |
| 13 | Brodmann Atlas | Various | Cytoarchitectonic areas | Open |
| 14 | Destrieux Atlas | INRIA | Sulcal/gyral parcellation | FreeSurfer |
| 15 | Craddock 2012 Atlas | Georgia Tech | Functional parcellation | Open |
| 16 | Glasser 2016 Atlas | WashU | HCP Multi-modal parcellation | Open |
| 17 | Brainnetome Atlas | Chinese Academy | Connectivity-based | Open |
| 18 | ICA 100 Atlas | Various | Independent component | Open |
| 19 | Power 2011 Atlas | WashU | Functional network nodes | Open |
| 20 | Yeo 2011 Atlas | Harvard | 7/17 functional networks | Open |
| 21 | Dosenbach 2010 Atlas | WashU | Functional ROIs | Open |
| 22 | Fan 2016 Atlas | CSHL | Brain-wide connectivity | Open |
| 23 | Gordon 2014 Atlas | WashU | Functional parcellation | Open |
| 24 | Klein 2012 Mindboggle | MIT | Cortical labeling | Open |
| 25 | Neuromorphometrics | Various | MRI brain atlases | Open |
| 26 | OASIS | WashU | Aging + dementia imaging | Open |
| 27 | IXI Dataset | King's College | Healthy brain MRI | Open |
| 28 | ADHD-200 | ADHD-200 | ADHD resting-state fMRI | Open |
| 29 | ABIDE I/II | UMich | Autism brain imaging | ✅ Integrated |
| 30 | ADNI | USC/UCSF | Alzheimer's Disease Neuroimaging | ✅ Integrated |
| 31 | AIBL | CSIRO | Australian Imaging Biomarkers | Restricted |
| 32 | ARIBS | Various | Autism structural MRI | Open |
| 33 | ASRB | Various | Aggression/trauma imaging | Restricted |
| 34 | BIOBD | Various | Bipolar disorder | Restricted |
| 35 | BLSA | NIA | Baltimore Longitudinal Study of Aging | Open |
| 36 | BRC | Various | Brainomics | Open |
| 37 | Caltech Conte Center | Caltech | Schizophrenia imaging | Restricted |
| 38 | CAMCAN | MRC | Cambridge Centre for Ageing Neuroscience | Open |
| 39 | CCNA | CIHR | Canadian Consortium on Neurodegeneration | Restricted |
| 40 | C-MIND | Cincinnati Children's | Reading development MRI | Restricted |
| 41 | COBRE | MRN | Center for Biomedical Research Excellence | Open |
| 42 | CORR | INDI | Consortium for Reliability and Reproducibility | Open |
| 43 | DLBS | WashU | DLBS | Open |
| 44 | DS030 | Various | UCLA Consortium for Neuropsychiatric Phenomics | Open |
| 45 | EFIGA | Various | Extended Pedigrees for Genetic Studies | Restricted |
| 46 | GSP | Harvard | Brain Genomics Superstruct Project | Open |
| 47 | HCP Aging | WashU/UMinn | Lifespan aging connectome | Open |

### 4.2 Medication / Pharmaceutical Databases (34)

| # | Database | Organization | Data Type | Access |
|---|----------|-------------|-----------|--------|
| 1 | **RxNorm** | NIH/NLM | Normalized drug names | ✅ Integrated |
| 2 | **PharmGKB** | Stanford | Pharmacogenomics | ✅ Integrated |
| 3 | **openFDA** | FDA | Drug adverse events, recalls | ✅ Integrated |
| 4 | **FAERS** | FDA | Adverse event reporting system | ✅ Integrated |
| 5 | **OnSIDES** | Stanford/OHSU | Side effect frequency | ✅ Integrated |
| 6 | **LOINC** | Regenstrief | Lab observation codes | ✅ Integrated |
| 7 | DrugBank | Univ. of Alberta | Drug targets, interactions | Open (academic) |
| 8 | ChEMBL | EMBL-EBI | Bioactivity data | Open API |
| 9 | PubChem | NCBI | Chemical structures | Open |
| 10 | ChemSpider | Royal Society of Chemistry | Chemical database | Free API |
| 11 | DailyMed | NLM | FDA-approved labels | Open |
| 12 | Orange Book | FDA | Approved drug products | Open |
| 13 | National Drug Code (NDC) | FDA | Product identifiers | Open |
| 14 | Drugs.com | Various | Consumer drug info | Web scrape |
| 15 | Pillbox | NLM | Pill identification | Open |
| 16 | SPL (Structured Product Labels) | FDA | XML drug labels | Open |
| 17 | ICH M5 | ICH | MedDRA terminology | Licensed |
| 18 | MedDRA | MSSO | Medical terminology | Licensed |
| 19 | WHO-DD | WHO | Drug Dictionary | Licensed |
| 20 | SNOMED CT | IHTSDO | Clinical terminology | Licensed |
| 21 | ICD-10-CM | WHO/CDC | Diagnosis codes | Open |
| 22 | ICD-11 | WHO | Next-gen diagnosis codes | Open |
| 23 | CPT | AMA | Procedure codes | Licensed |
| 24 | HCPCS | CMS | Healthcare procedure coding | Open |
| 25 | GPI (Generic Product Identifier) | Medi-Span | Drug classification | Licensed |
| 26 | AHFS DIC | ASHP | Drug information | Licensed |
| 27 | Natural Medicines Database | TRC | Supplement interactions | Licensed |
| 28 | Lexicomp | Wolters Kluwer | Drug reference | Licensed |
| 29 | Clinical Pharmacology | Elsevier | Drug monographs | Licensed |
| 30 | Martindale | Pharmaceutical Press | International drug reference | Licensed |
| 31 | USP-NF | USP | Drug standards | Licensed |
| 32 | DailyMed SPL | NLM | Structured labeling | Open |
| 33 | WHO Drug Dictionary | WHO | Global drug codes | Licensed |
| 34 | UNII (Unique Ingredient Identifier) | FDA | Substance identifiers | Open |

### 4.3 Evidence / Outcome Databases (44)

| # | Database | Organization | Data Type | Access |
|---|----------|-------------|-----------|--------|
| 1 | **PROMIS** | NIH | Patient-reported outcomes | ✅ Integrated |
| 2 | **SimNIBS** | DTU | tDCS/TMS simulation | ✅ Integrated |
| 3 | PubMed/MEDLINE | NLM | 35M+ biomedical citations | Open API |
| 4 | Cochrane Library | Cochrane | Systematic reviews | Open abstracts |
| 5 | ClinicalTrials.gov | NIH | 400K+ clinical trials | Open API |
| 6 | EMBASE | Elsevier | Biomedical literature | Licensed |
| 7 | Web of Science | Clarivate | Citation index | Licensed |
| 8 | Scopus | Elsevier | Abstract/citation database | Licensed |
| 9 | PsycINFO | APA | Psychology literature | Licensed |
| 10 | CINAHL | EBSCO | Nursing/allied health | Licensed |
| 11 | OTseeker | Various | Occupational therapy evidence | Open |
| 12 | PEDro | USYD | Physiotherapy evidence | Open |
| 13 | NICE Evidence | NICE | UK clinical guidelines | Open |
| 14 | AHRQ ePSS | AHRQ | Preventive services | Open |
| 15 | DynaMed | EBSCO | Evidence summaries | Licensed |
| 16 | UpToDate | Wolters Kluwer | Clinical decision support | Licensed |
| 17 | BMJ Best Practice | BMJ | Clinical guidelines | Licensed |
| 18 | JBI EVIDENCE | JBI | Healthcare evidence | Open/Licensed |
| 19 | TRIP Database | TRIP | Clinical search engine | Freemium |
| 20 | Epistemonikos | Various | Evidence in health | Open |
| 21 | Cochrane Central Register | Cochrane | Controlled trials | Open |
| 22 | PROSPERO | York Univ. | Systematic review protocols | Open |
| 23 | Open Science Framework | COS | Research data sharing | Open |
| 24 | OSF Registries | COS | Study registration | Open |
| 25 | NIH RePORTER | NIH | Funded research projects | Open API |
| 26 | Dimensions | Digital Science | Research analytics | Freemium API |
| 27 | Altmetric | Digital Science | Research attention metrics | API |
| 28 | CORE | Open University | Open access research | Open API |
| 29 | Europe PMC | EMBL-EBI | 40M+ biomedical articles | Open API |
| 30 | bioRxiv/medRxiv | CSHL | Preprint servers | Open |
| 31 | arXiv (q-bio) | Cornell | Biology preprints | Open |
| 32 | Google Scholar | Google | Citation tracking | Free (no API) |
| 33 | Semantic Scholar | AI2 | AI-powered literature search | Open API |
| 34 | Crossref | Crossref | DOI metadata | Open API |
| 35 | DataCite | DataCite | Research data DOIs | Open API |
| 36 | Health Evidence Canada | McMaster | Public health evidence | Open |
| 37 | Guide to Community Preventive Services | CDC | Community interventions | Open |
| 38 | Campbell Collaboration | Campbell | Social science evidence | Open |
| 39 | SIDER | EMBL-EBI | Drug side effects | Open |
| 40 | OFFSIDES/TWOSIDES | Columbia | Drug interactions | Open |
| 41 | AEOLUS | NLM | Adverse event open data | Open |
| 42 | EU PAS Register | EMA | Post-authorization studies | Open |
| 43 | VigiBase | WHO | Global adverse reactions | Restricted |
| 44 | CDRH (Device recalls) | FDA | Medical device reports | Open |

### 4.4 Genetics / Protocols / Safety Databases (46)

| # | Database | Organization | Data Type | Access |
|---|----------|-------------|-----------|--------|
| 1 | **ClinVar** | NCBI | Genetic variant significance | ✅ Integrated |
| 2 | **PharmGKB** | Stanford | PGx annotations | ✅ Integrated |
| 3 | GWAS Catalog | EMBL-EBI | Genome-wide associations | Open API |
| 4 | dbSNP | NCBI | Short genetic variations | Open |
| 5 | OMIM | Johns Hopkins | Mendelian disorders | Open (academic) |
| 6 | GeneCards | Weizmann | Gene-centric information | Free API |
| 7 | Ensembl | EMBL-EBI | Genome browser + annotation | Open API |
| 8 | UCSC Genome Browser | UCSC | Genome visualization | Open |
| 9 | GTeX | Broad Institute | Expression QTLs | Open |
| 10 | ExAC/gnomAD | Broad Institute | Population allele frequencies | Open |
| 11 | 1000 Genomes | ICG | Human genetic variation | Open |
| 12 | UniProt | UniProt Consortium | Protein sequences/functions | Open API |
| 13 | KEGG | KEGG | Pathway maps | Freemium |
| 14 | Reactome | CSHL/NYU/EBI | Biological pathways | Open API |
| 15 | STRING | STRING-db | Protein-protein interactions | Open API |
| 16 | BioGRID | BioGRID | Genetic interactions | Open |
| 17 | Human Protein Atlas | KTH | Protein expression maps | Open |
| 18 | COSMIC | Sanger | Cancer mutations | Licensed |
| 19 | OncoKB | MSKCC | Cancer variant interpretations | Open |
| 20 | CIViC | WashU | Clinical interpretations of variants | Open API |
| 21 | MyVariant.info | UCSF | Variant annotation aggregator | Open API |
| 22 | dbVar | NCBI | Structural variants | Open |
| 23 | DGV | Toronto Database of Genomic Variants | Structural variants | Open |
| 24 | DECIPHER | Sanger | Developmental disorder genes | Open |
| 25 | LOVD | LUMC | Locus-specific databases | Open |
| 26 | ClinGen | ClinGen | Clinical genome resource | Open |
| 27 | Monarch Initiative | OSU | Cross-species disease biology | Open API |
| 28 | Orphanet | INSERM | Rare diseases | Open API |
| 29 | GenCC | GenCC | Gene-disease validity | Open API |
| 30 | MedGen | NCBI | Medical genetics | Open |
| 31 | PubMed Health | NLM | Clinical effectiveness | Open |
| 32 | TRIPLL | Various | Translating research into practice | Open |
| 33 | PEDro | USYD | Physiotherapy trials | Open |
| 34 | ICH GCP | ICH | Good Clinical Practice | Open |
| 35 | ISRCTN | BioMed Central | Clinical trial registry | Open |
| 36 | EU Clinical Trials Register | EMA | EU trial registry | Open |
| 37 | ANZCTR | NHMRC | Australian trial registry | Open |
| 38 | JPRN | JST | Japan trial registry | Open |
| 39 | ChiCTR | MoH China | Chinese trial registry | Open |
| 40 | CTRI | ICMR | Indian trial registry | Open |
| 41 | REPEC | Stata | Economics/research methods | Open |
| 42 | Nuremberg Code | Various | Research ethics foundation | Open |
| 43 | Declaration of Helsinki | WMA | Medical research ethics | Open |
| 44 | CIOMS Guidelines | CIOMS | Epidemiological ethics | Open |
| 45 | FDA 21 CFR Part 11 | FDA | Electronic records | Open |
| 46 | HIPAA Research | HHS | Health data privacy | Open |

---

## PART 5: RESEARCH REPORTS

These reports document the external database integration research:

| # | Report | Adapter(s) | Lines |
|---|--------|-----------|-------|
| 1 | `DEEPSYNAPS_PHASE1_DATABASE_INTEGRATION_REPORT.md` | All P0 adapters | ~500 |
| 2 | `RXNORM_INTEGRATION_REPORT.md` | RxNorm | ~200 |
| 3 | `PGX_INTEGRATION_REPORT.md` | PharmGKB, ClinVar | ~200 |
| 4 | `EEG_NORMATIVE_INTEGRATION_REPORT.md` | CHBMP, MNI | ~200 |
| 5 | `MRI_ATLAS_INTEGRATION_REPORT.md` | MNI, Schaefer | ~200 |
| 6 | `PROMIS_OUTCOMES_INTEGRATION_REPORT.md` | PROMIS | ~200 |
| 7 | `SIMNIBS_INTEGRATION_REPORT.md` | SimNIBS | ~200 |
| 8 | `OPEN_SOURCE_PHASE1_STACK_REPORT.md` | All P0 | ~300 |
| 9 | `PHASE2_ADVERSE_EVENT_INTELLIGENCE.md` | FAERS, OnSIDES | ~200 |
| 10 | `PHASE2_BRAIN_ATLAS_NETWORK_REPORT.md` | Allen Brain, Schaefer | ~200 |
| 11 | `PHASE2_NEUROIMAGING_COHORT_REPORT.md` | ADNI, ABIDE | ~200 |
| 12 | `PHASE2_NEUROSYNTH_INTEGRATION_REPORT.md` | Neurosynth | ~200 |
| 13 | `OPEN_SOURCE_PHASE2_STACK_REPORT.md` | All P1 | ~300 |

---

## PART 6: INFRASTRUCTURE & MONITORING

### 6.1 Deployment Databases

| System | Platform | Purpose |
|--------|----------|---------|
| Fly.io PostgreSQL | Fly.io | Production database cluster |
| Fly.io Redis (Upstash) | Fly.io | Cache + queue |
| Fly.io Volume | Fly.io | Persistent storage (`/data/evidence.db`) |

### 6.2 Monitoring Stack

| System | Type | Purpose |
|--------|------|---------|
| Prometheus | Time-series DB | Metrics collection |
| Grafana | Visualization | Dashboards |
| AlertManager | Alert routing | PagerDuty/email/Slack |
| Loki | Log aggregation | Centralized logging |

### 6.3 Build/CI Databases

| System | Type | Purpose |
|--------|------|---------|
| GitHub Actions | CI/CD | Test + build pipelines |
| Codecov | Coverage DB | Test coverage tracking |
| Dependabot | Dependency DB | Vulnerability alerts |

---

## SUMMARY

| Category | Count |
|----------|-------|
| **Internal Primary (PostgreSQL)** | 1 system, 231 tables |
| **Evidence Store (SQLite)** | 1 system |
| **Queue (Redis)** | 1 system |
| **External Cache Tables** | 10 tables |
| **Pipeline Stores** | 4 stores |
| **Live External Adapters** | **16 databases** |
| **Intelligence Bridges** | 4 bridges |
| **Multimodal Synthesizer** | 1 synthesizer |
| **Researched External DBs** | **171 databases** |
| **GRAND TOTAL** | **~190 database systems** |

---

## FILES REFERENCED

### Adapter Files (all in `apps/api/app/knowledge/`)
- `base_adapter.py` — Abstract base class
- `adapter_registry.py` — Discovery + metadata
- `etl_pipeline.py` — ETL orchestration
- `knowledge_cache.py` — Caching layer
- `knowledge_router.py` — API endpoints

### Phase 1 Adapters
- `rxnorm_adapter.py`, `pharmgkb_adapter.py`, `clinvar_adapter.py`, `loinc_adapter.py`
- `openfda_adapter.py`, `chbmp_adapter.py`, `mni_atlas_adapter.py`
- `promis_adapter.py`, `simnibs_adapter.py`

### Phase 2 Adapters
- `faers_adapter.py`, `onsides_adapter.py`, `allen_brain_adapter.py`
- `schaefer_adapter.py`, `neurosynth_adapter.py`, `adni_adapter.py`, `abide_adapter.py`

### Bridges
- `medication_analyzer_bridge.py`, `genetic_analyzer_bridge.py`
- `qeeg_analyzer_bridge.py`, `mri_analyzer_bridge.py`

### Synthesizer
- `multimodal_synthesizer.py`

### DeepTwin Hooks
- `deeptwin_hooks.py`

### Adverse Event Bridge
- `adverse_event_bridge.py`

---

*This inventory is maintained alongside the codebase. Updates should be made*
*whenever new adapters, databases, or storage systems are added.*
