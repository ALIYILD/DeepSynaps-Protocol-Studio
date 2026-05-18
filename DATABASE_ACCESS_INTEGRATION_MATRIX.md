# DATABASE ACCESS & INTEGRATION MATRIX

> Repository: ALIYILD/DeepSynaps-Protocol-Studio
> Last Updated: 2026-05-18
> Branch: main

---

## ACCESS LEGEND

| Symbol | Status | Meaning |
|:------:|--------|---------|
| ✅ | **OPEN / FREE** | Fully open, public API available, no registration required |
| 🟢 | **FREE API** | Free API key required, generous limits |
| 🔓 | **FREEMIUM** | Free tier available with limits |
| 📋 | **ACADEMIC** | Free for academic/research use; commercial requires license |
| 📝 | **REGISTER** | Free but requires registration/account |
| 🔒 | **LICENSED** | Requires paid license |
| 🚫 | **RESTRICTED** | Requires application approval / data use agreement |
| ⚠️ | **WEB SCRAPE** | No API; web scraping only (fragile) |
| ✅🏗️ | **BUILT** | Already implemented as live adapter |

---

## PART 1: INTERNAL SYSTEMS — ALL BUILT ✅

| # | System | Access | Status | Notes |
|---|--------|--------|--------|-------|
| 1 | PostgreSQL (Primary) | ✅ BUILT | Production | 231 tables across 23 model files |
| 2 | SQLite (Evidence Store) | ✅ BUILT | Production | `/data/evidence.db` on persistent volume |
| 3 | Redis (Queue + Cache) | ✅ BUILT | Production | Fly.io Upstash |
| 4 | 10 External Cache Tables | ✅ BUILT | Production | TTL-based eviction in PostgreSQL |
| 5 | qEEG Pipeline Store (HDF5) | ✅ BUILT | Production | Specialized waveform storage |
| 6 | MRI Pipeline Store (NIfTI) | ✅ BUILT | Production | Neuroimaging volume storage |
| 7 | Video Store (MP4/WebM) | ✅ BUILT | Production | Session recordings |
| 8 | Audio Store (WAV/FLAC) | ✅ BUILT | Production | Voice/EEG audio |

---

## PART 2: 16 LIVE ADAPTERS — ALL BUILT ✅🏗️

| # | Adapter | External DB | Organization | Access | API Type | Rate Limits |
|---|---------|------------|--------------|--------|----------|-------------|
| 1 | ✅🏗️ `rxnorm_adapter.py` | **RxNorm** | NIH/NLM | ✅ OPEN | REST/UMLS API | 20 req/s (UMLS) |
| 2 | ✅🏗️ `pharmgkb_adapter.py` | **PharmGKB** | Stanford | 📝 REGISTER | REST API | 1,000/day (free) |
| 3 | ✅🏗️ `clinvar_adapter.py` | **ClinVar** | NCBI/NIH | ✅ OPEN | E-utilities | 3 req/s |
| 4 | ✅🏗️ `loinc_adapter.py` | **LOINC** | Regenstrief | 📝 REGISTER | FHIR/Search API | Requires RELMA login |
| 5 | ✅🏗️ `openfda_adapter.py` | **openFDA** | FDA | ✅ OPEN | REST API | 240 req/min (no key), 1,000/min (key) |
| 6 | ✅🏗️ `chbmp_adapter.py` | **CHBMP** | Chinese Brain Mapping | 📋 ACADEMIC | Download | Batch downloads |
| 7 | ✅🏗️ `mni_atlas_adapter.py` | **MNI Atlas** | McGill | ✅ OPEN | Download | Free downloads |
| 8 | ✅🏗️ `promis_adapter.py` | **PROMIS** | NIH | 📝 REGISTER | Assessment Center API | Free for research |
| 9 | ✅🏗️ `simnibs_adapter.py` | **SimNIBS** | DTU | ✅ OPEN | Python API + CLI | No rate limits |
| 10 | ✅🏗️ `faers_adapter.py` | **FAERS** | FDA | ✅ OPEN | Bulk download + API | Quarterly bulk files |
| 11 | ✅🏗️ `onsides_adapter.py` | **OnSIDES** | Stanford/OHSU | ✅ OPEN | REST API (GitHub) | No limits |
| 12 | ✅🏗️ `allen_brain_adapter.py` | **Allen Brain Atlas** | Allen Institute | ✅ OPEN | REST API + SDK | 10 req/s |
| 13 | ✅🏗️ `schaefer_adapter.py` | **Schaefer Atlas** | Harvard | ✅ OPEN | Download (GitHub) | No limits |
| 14 | ✅🏗️ `neurosynth_adapter.py` | **Neurosynth** | Stanford | ✅ OPEN | Python API + REST | No limits |
| 15 | ✅🏗️ `adni_adapter.py` | **ADNI** | USC/UCSF | 🚫 RESTRICTED | Download portal | Application required |
| 16 | ✅🏗️ `abide_adapter.py` | **ABIDE** | UMich | 📝 REGISTER | NITRC download | Registration required |

**Integration Status of 16 Live Adapters:**
- ✅ OPEN (no key): 7 — RxNorm, ClinVar, openFDA, FAERS, OnSIDES, SimNIBS, Schaefer
- 📝 REGISTER (free key): 5 — PharmGKB, LOINC, PROMIS, ABIDE, Allen Brain
- 📋 ACADEMIC: 1 — CHBMP
- 🚫 RESTRICTED: 2 — ADNI (application), MNI Atlas (download-based)
- **ALL 16: BUILT AND INTEGRATED** ✅🏗️

---

## PART 3: INTELLIGENCE BRIDGES & SYNTHESIZER — ALL BUILT ✅🏗️

| # | Component | Input Adapters | Access | Status |
|---|-----------|---------------|--------|--------|
| 1 | ✅🏗️ `medication_analyzer_bridge.py` | RxNorm + PharmGKB + FAERS + OnSIDES | ✅ FREE (uses adapters) | BUILT |
| 2 | ✅🏗️ `genetic_analyzer_bridge.py` | ClinVar + PharmGKB | ✅ FREE (uses adapters) | BUILT |
| 3 | ✅🏗️ `qeeg_analyzer_bridge.py` | CHBMP + MNI + Neurosynth | ✅ FREE (uses adapters) | BUILT |
| 4 | ✅🏗️ `mri_analyzer_bridge.py` | MNI + Schaefer + ADNI + ABIDE | ✅ FREE (uses adapters) | BUILT |
| 5 | ✅🏗️ `multimodal_synthesizer.py` | All 16 adapters + 4 bridges | ✅ FREE (uses adapters) | BUILT |
| 6 | ✅🏗️ `deeptwin_hooks.py` | All synthesizer outputs | ✅ FREE (uses adapters) | BUILT |
| 7 | ✅🏗️ `adverse_event_bridge.py` | FAERS + OnSIDES + openFDA | ✅ FREE (uses adapters) | BUILT |

---

## PART 4: 171 RESEARCHED EXTERNAL DATABASES — LINE-BY-LINE ACCESS STATUS

### 4.1 NEUROIMAGING DATABASES (47)

| # | Database | Org | Access | API Type | Integration Priority | Notes |
|---|----------|-----|--------|----------|---------------------|-------|
| 1 | NeuroVault | NeuroVault.org | ✅ OPEN | REST API | **P0** | Statistical brain maps, 200K+ images |
| 2 | Brain-CODE | Ontario Brain Institute | 🚫 RESTRICTED | Application | P2 | Canadian clinical + imaging data |
| 3 | Human Connectome Project | WashU/UMinn | 📝 REGISTER | ConnectomeDB | **P0** | 1,200+ subjects, massive dataset |
| 4 | UK Biobank | UK Biobank | 🚫 RESTRICTED | Application | P2 | 500K participants, genetic + imaging |
| 5 | OpenNeuro | Stanford | ✅ OPEN | Web/CLI | **P0** | 500+ datasets, raw neuroimaging |
| 6 | 1000 Functional Connectomes | FCON1000 | ✅ OPEN | Download | **P1** | Resting-state fMRI from 35 sites |
| 7 | fMRIDC | fMRIDC.org | ✅ OPEN | Download | P3 | Legacy fMRI datasets |
| 8 | NITRC | Indiana Univ. | ✅ OPEN | Web + Download | **P1** | Neuroimaging tools + data registry |
| 9 | Brain Imaging Library | BIL | ✅ OPEN | Download | P3 | Image data repository |
| 10 | Schaefer Atlas | Harvard | ✅ OPEN | GitHub | ✅🏗️ BUILT | 400-1000 region parcellation |
| 11 | AAL Atlas | ResearchGate | ✅ OPEN | Download | P3 | Anatomical Automatic Labeling |
| 12 | Harvard-Oxford Atlas | Harvard | ✅ OPEN | FSL bundled | P3 | Included in FSL package |
| 13 | Brodmann Atlas | Various | ✅ OPEN | Download | P3 | Cytoarchitectonic areas (historical) |
| 14 | Destrieux Atlas | INRIA | ✅ OPEN | FreeSurfer | P3 | Sulcal/gyral parcellation |
| 15 | Craddock 2012 Atlas | Georgia Tech | ✅ OPEN | Download | P3 | Functional parcellation |
| 16 | Glasser 2016 Atlas | WashU | ✅ OPEN | Download | **P1** | HCP multi-modal parcellation |
| 17 | Brainnetome Atlas | Chinese Academy | ✅ OPEN | Download | **P1** | Connectivity-based parcellation |
| 18 | ICA 100 Atlas | Various | ✅ OPEN | Download | P2 | Independent component analysis |
| 19 | Power 2011 Atlas | WashU | ✅ OPEN | Download | P2 | 264 functional network nodes |
| 20 | Yeo 2011 Atlas | Harvard | ✅ OPEN | Download | **P1** | 7/17 functional networks |
| 21 | Dosenbach 2010 Atlas | WashU | ✅ OPEN | Download | P2 | 160 functional ROIs |
| 22 | Fan 2016 Atlas | CSHL | ✅ OPEN | Download | P2 | 358 functional regions |
| 23 | Gordon 2014 Atlas | WashU | ✅ OPEN | Download | **P1** | 333 cortical areas |
| 24 | Klein 2012 Mindboggle | MIT | ✅ OPEN | Download | P3 | Cortical labeling + shape analysis |
| 25 | Neuromorphometrics | Various | ✅ OPEN | Download | P3 | MRI brain atlases |
| 26 | OASIS | WashU | ✅ OPEN | Download | **P0** | 1,000+ aging + dementia scans |
| 27 | IXI Dataset | King's College | ✅ OPEN | Download | **P1** | 600 healthy brain MRIs |
| 28 | ADHD-200 | ADHD-200 | ✅ OPEN | Download | **P1** | ADHD resting-state fMRI |
| 29 | ABIDE I/II | UMich | 📝 REGISTER | NITRC | ✅🏗️ BUILT | Autism brain imaging 2,000+ |
| 30 | ADNI | USC/UCSF | 🚫 RESTRICTED | Application | ✅🏗️ BUILT | Alzheimer's Disease 2,000+ |
| 31 | AIBL | CSIRO | 🚫 RESTRICTED | Application | P2 | Australian imaging biomarkers |
| 32 | ARIBS | Various | ⚠️ WEB SCRAPE | None | P3 | Autism structural MRI |
| 33 | ASRB | Various | 🚫 RESTRICTED | Application | P2 | Aggression/trauma imaging |
| 34 | BIOBD | Various | 🚫 RESTRICTED | Application | P2 | Bipolar disorder imaging |
| 35 | BLSA | NIA | 📝 REGISTER | Request | **P1** | Baltimore Longitudinal Aging Study |
| 36 | BRC | Various | ✅ OPEN | Download | P3 | Brainomics project |
| 37 | Caltech Conte Center | Caltech | 🚫 RESTRICTED | Application | P2 | Schizophrenia imaging |
| 38 | CAMCAN | MRC | 📝 REGISTER | Request | **P1** | Cambridge ageing neuroscience |
| 39 | CCNA | CIHR | 🚫 RESTRICTED | Application | P2 | Canadian neurodegeneration |
| 40 | C-MIND | Cincinnati Children's | 🚫 RESTRICTED | Application | P2 | Reading development MRI |
| 41 | COBRE | MRN | ✅ OPEN | Download | **P1** | Schizophrenia 72 subjects |
| 42 | CORR | INDI | ✅ OPEN | Download | **P1** | Reliability/reproducibility |
| 43 | DLBS | WashU | 📝 REGISTER | Request | P2 | Dalhousie brain study |
| 44 | DS030 | UCLA | ✅ OPEN | Download | **P1** | Phenomics 272 subjects |
| 45 | EFIGA | Various | 🚫 RESTRICTED | Application | P3 | Extended pedigree genetic |
| 46 | GSP | Harvard | 📝 REGISTER | Request | **P1** | Brain Genomics Superstruct 1,500+ |
| 47 | HCP Aging | WashU/UMinn | 📝 REGISTER | ConnectomeDB | **P0** | Lifespan aging connectome |

**Neuroimaging Summary:**
- ✅ OPEN (free download): 22 — NeuroVault, OpenNeuro, OASIS, Yeo, Gordon, etc.
- 📝 REGISTER (free): 6 — HCP, ABIDE, BLSA, CAMCAN, DLBS, GSP, HCP Aging
- 🚫 RESTRICTED: 10 — Brain-CODE, UK Biobank, ADNI, AIBL, ASRB, BIOBD, CCNA, C-MIND, Caltech, EFIGA
- ⚠️ WEB SCRAPE: 1 — ARIBS
- ✅🏗️ BUILT: 3 — Schaefer, ABIDE, ADNI

---

### 4.2 MEDICATION / PHARMACEUTICAL DATABASES (34)

| # | Database | Org | Access | API Type | Integration Priority | Notes |
|---|----------|-----|--------|----------|---------------------|-------|
| 1 | **RxNorm** | NIH/NLM | ✅ OPEN | UMLS REST | ✅🏗️ BUILT | Normalized drug names |
| 2 | **PharmGKB** | Stanford | 📝 REGISTER | REST API | ✅🏗️ BUILT | Pharmacogenomics |
| 3 | **openFDA** | FDA | ✅ OPEN | REST API | ✅🏗️ BUILT | Drug adverse events |
| 4 | **FAERS** | FDA | ✅ OPEN | Bulk + API | ✅🏗️ BUILT | Adverse event reports |
| 5 | **OnSIDES** | Stanford/OHSU | ✅ OPEN | GitHub REST | ✅🏗️ BUILT | Side effect frequency |
| 6 | **LOINC** | Regenstrief | 📝 REGISTER | FHIR/Search | ✅🏗️ BUILT | Lab observation codes |
| 7 | DrugBank | Univ. Alberta | 📋 ACADEMIC | XML/CSV | **P0** | Drug targets, interactions |
| 8 | ChEMBL | EMBL-EBI | ✅ OPEN | REST API | **P0** | 2M+ bioactivity records |
| 9 | PubChem | NCBI | ✅ OPEN | PUG REST | **P0** | 110M+ chemical structures |
| 10 | ChemSpider | Royal Society | 🔓 FREEMIUM | REST API | **P1** | Chemical database |
| 11 | DailyMed | NLM | ✅ OPEN | REST/SPL | **P0** | FDA-approved labels |
| 12 | Orange Book | FDA | ✅ OPEN | Download/API | **P1** | Approved drug products |
| 13 | NDC Directory | FDA | ✅ OPEN | REST API | **P1** | National Drug Codes |
| 14 | Drugs.com | Various | ⚠️ WEB SCRAPE | None | P3 | Consumer drug info |
| 15 | Pillbox | NLM | ✅ OPEN | REST API | P2 | Pill identification |
| 16 | SPL (Structured Labels) | FDA | ✅ OPEN | XML | **P1** | Structured product labels |
| 17 | ICH M5 MedDRA | ICH | 🔒 LICENSED | API | P3 | Medical terminology |
| 18 | MedDRA | MSSO | 🔒 LICENSED | API | P3 | Adverse event terminology |
| 19 | WHO-DD | WHO | 🔒 LICENSED | API | P3 | WHO Drug Dictionary |
| 20 | SNOMED CT | IHTSDO | 📋 ACADEMIC | FHIR API | **P0** | Clinical terminology |
| 21 | ICD-10-CM | WHO/CDC | ✅ OPEN | REST/FHIR | **P0** | Diagnosis codes |
| 22 | ICD-11 | WHO | ✅ OPEN | REST API | **P0** | Next-gen diagnosis codes |
| 23 | CPT | AMA | 🔒 LICENSED | API | P3 | Procedure codes |
| 24 | HCPCS | CMS | ✅ OPEN | Download | **P1** | Healthcare procedure coding |
| 25 | GPI (Medi-Span) | Medi-Span | 🔒 LICENSED | API | P3 | Drug classification |
| 26 | AHFS DIC | ASHP | 🔒 LICENSED | API | P3 | Drug information |
| 27 | Natural Medicines | TRC | 🔒 LICENSED | API | P2 | Supplement interactions |
| 28 | Lexicomp | Wolters Kluwer | 🔒 LICENSED | API | P2 | Drug reference |
| 29 | Clinical Pharmacology | Elsevier | 🔒 LICENSED | API | P2 | Drug monographs |
| 30 | Martindale | Pharm. Press | 🔒 LICENSED | API | P2 | International drugs |
| 31 | USP-NF | USP | 🔒 LICENSED | API | P2 | Drug standards |
| 32 | DailyMed SPL | NLM | ✅ OPEN | Download | **P1** | Structured labeling |
| 33 | WHO Drug Dictionary | WHO | 🔒 LICENSED | API | P2 | Global drug codes |
| 34 | UNII | FDA | ✅ OPEN | REST API | **P1** | Substance identifiers |

**Medication Summary:**
- ✅ OPEN: 10 — RxNorm, openFDA, FAERS, OnSIDES, PubChem, DailyMed, Orange Book, NDC, ICD-10/11, HCPCS, UNII
- 📝 REGISTER: 2 — PharmGKB, LOINC
- 📋 ACADEMIC: 2 — DrugBank, SNOMED CT
- 🔓 FREEMIUM: 1 — ChemSpider
- 🔒 LICENSED: 13 — MedDRA, WHO-DD, SNOMED (commercial), CPT, GPI, AHFS, Lexicomp, etc.
- ⚠️ WEB SCRAPE: 1 — Drugs.com
- ✅🏗️ BUILT: 6 — RxNorm, PharmGKB, openFDA, FAERS, OnSIDES, LOINC

---

### 4.3 EVIDENCE / OUTCOME DATABASES (44)

| # | Database | Org | Access | API Type | Integration Priority | Notes |
|---|----------|-----|--------|----------|---------------------|-------|
| 1 | **PROMIS** | NIH | 📝 REGISTER | Assessment Center | ✅🏗️ BUILT | Patient-reported outcomes |
| 2 | **SimNIBS** | DTU | ✅ OPEN | Python API | ✅🏗️ BUILT | tDCS/TMS simulation |
| 3 | PubMed/MEDLINE | NLM | ✅ OPEN | E-utilities | **P0** | 35M+ biomedical citations |
| 4 | Cochrane Library | Cochrane | ✅ OPEN | REST | **P0** | Systematic reviews gold standard |
| 5 | ClinicalTrials.gov | NIH | ✅ OPEN | REST API | **P0** | 400K+ clinical trials |
| 6 | EMBASE | Elsevier | 🔒 LICENSED | API | P2 | Biomedical literature |
| 7 | Web of Science | Clarivate | 🔒 LICENSED | API | P2 | Citation index |
| 8 | Scopus | Elsevier | 🔒 LICENSED | API | P2 | Abstract/citation |
| 9 | PsycINFO | APA | 🔒 LICENSED | API | P2 | Psychology literature |
| 10 | CINAHL | EBSCO | 🔒 LICENSED | API | P2 | Nursing/allied health |
| 11 | OTseeker | Various | ✅ OPEN | Web | **P1** | Occupational therapy evidence |
| 12 | PEDro | USYD | ✅ OPEN | Web | **P1** | Physiotherapy evidence |
| 13 | NICE Evidence | NICE | ✅ OPEN | Web/API | **P0** | UK clinical guidelines |
| 14 | AHRQ ePSS | AHRQ | ✅ OPEN | Web | **P1** | Preventive services |
| 15 | DynaMed | EBSCO | 🔒 LICENSED | API | P2 | Evidence summaries |
| 16 | UpToDate | Wolters Kluwer | 🔒 LICENSED | API | P2 | Clinical decision support |
| 17 | BMJ Best Practice | BMJ | 🔒 LICENSED | API | P2 | Clinical guidelines |
| 18 | JBI EVIDENCE | JBI | 🔓 FREEMIUM | Web | P2 | Healthcare evidence |
| 19 | TRIP Database | TRIP | 🔓 FREEMIUM | Web | **P1** | Clinical search engine |
| 20 | Epistemonikos | Various | ✅ OPEN | Web | **P1** | Evidence in health |
| 21 | Cochrane Central Register | Cochrane | ✅ OPEN | Web | **P1** | Controlled trials |
| 22 | PROSPERO | York Univ. | ✅ OPEN | Web | **P1** | Review protocols |
| 23 | OSF | COS | ✅ OPEN | REST API | P2 | Research data sharing |
| 24 | OSF Registries | COS | ✅ OPEN | Web | P2 | Study registration |
| 25 | NIH RePORTER | NIH | ✅ OPEN | REST API | **P1** | Funded research projects |
| 26 | Dimensions | Digital Science | 🔓 FREEMIUM | API | P2 | Research analytics |
| 27 | Altmetric | Digital Science | 🔓 FREEMIUM | API | P2 | Research attention metrics |
| 28 | CORE | Open Univ. | ✅ OPEN | REST API | **P1** | Open access research |
| 29 | Europe PMC | EMBL-EBI | ✅ OPEN | REST API | **P0** | 40M+ biomedical articles |
| 30 | bioRxiv/medRxiv | CSHL | ✅ OPEN | RSS/API | **P1** | Preprint servers |
| 31 | arXiv (q-bio) | Cornell | ✅ OPEN | REST API | **P1** | Biology preprints |
| 32 | Google Scholar | Google | ⚠️ WEB SCRAPE | None (unofficial) | P3 | Citation tracking |
| 33 | Semantic Scholar | AI2 | ✅ OPEN | REST API | **P0** | AI-powered literature |
| 34 | Crossref | Crossref | ✅ OPEN | REST API | **P1** | DOI metadata |
| 35 | DataCite | DataCite | ✅ OPEN | REST API | **P1** | Research data DOIs |
| 36 | Health Evidence Canada | McMaster | ✅ OPEN | Web | **P1** | Public health evidence |
| 37 | Community Preventive Services | CDC | ✅ OPEN | Web | **P1** | Community interventions |
| 38 | Campbell Collaboration | Campbell | ✅ OPEN | Web | P2 | Social science evidence |
| 39 | SIDER | EMBL-EBI | ✅ OPEN | Download | **P1** | Drug side effects |
| 40 | OFFSIDES/TWOSIDES | Columbia | ✅ OPEN | Download | **P1** | Drug interactions |
| 41 | AEOLUS | NLM | ✅ OPEN | Download | **P0** | Adverse event open data |
| 42 | EU PAS Register | EMA | ✅ OPEN | Web | P2 | Post-authorization studies |
| 43 | VigiBase | WHO | 🚫 RESTRICTED | Application | P2 | Global adverse reactions |
| 44 | CDRH (Device recalls) | FDA | ✅ OPEN | REST API | **P1** | Medical device reports |

**Evidence Summary:**
- ✅ OPEN: 24 — PubMed, Cochrane, ClinicalTrials.gov, NICE, Europe PMC, Semantic Scholar, SIDER, AEOLUS, etc.
- 📝 REGISTER: 1 — PROMIS
- 🔓 FREEMIUM: 3 — JBI EVIDENCE, TRIP, Dimensions, Altmetric
- 🔒 LICENSED: 9 — EMBASE, Web of Science, Scopus, PsycINFO, CINAHL, DynaMed, UpToDate, BMJ BP
- ⚠️ WEB SCRAPE: 1 — Google Scholar
- 🚫 RESTRICTED: 1 — VigiBase
- ✅🏗️ BUILT: 2 — PROMIS, SimNIBS

---

### 4.4 GENETICS / PROTOCOLS / SAFETY DATABASES (46)

| # | Database | Org | Access | API Type | Integration Priority | Notes |
|---|----------|-----|--------|----------|---------------------|-------|
| 1 | **ClinVar** | NCBI | ✅ OPEN | E-utilities | ✅🏗️ BUILT | Genetic variant significance |
| 2 | **PharmGKB** | Stanford | 📝 REGISTER | REST API | ✅🏗️ BUILT | Pharmacogenomics |
| 3 | GWAS Catalog | EMBL-EBI | ✅ OPEN | REST API | **P0** | Genome-wide associations |
| 4 | dbSNP | NCBI | ✅ OPEN | E-utilities | **P0** | Short genetic variations |
| 5 | OMIM | Johns Hopkins | 📋 ACADEMIC | Download/API | **P0** | Mendelian disorders |
| 6 | GeneCards | Weizmann | 🔓 FREEMIUM | API | **P1** | Gene-centric information |
| 7 | Ensembl | EMBL-EBI | ✅ OPEN | REST API | **P0** | Genome browser/annotation |
| 8 | UCSC Genome Browser | UCSC | ✅ OPEN | REST API | **P1** | Genome visualization |
| 9 | GTeX | Broad Institute | ✅ OPEN | REST API | **P0** | Expression QTLs |
| 10 | ExAC/gnomAD | Broad Institute | ✅ OPEN | REST API | **P0** | Population allele frequencies |
| 11 | 1000 Genomes | ICG | ✅ OPEN | Download | **P1** | Human genetic variation |
| 12 | UniProt | UniProt Consortium | ✅ OPEN | REST API | **P0** | Protein sequences |
| 13 | KEGG | KEGG | 🔓 FREEMIUM | API | **P1** | Pathway maps |
| 14 | Reactome | CSHL/NYU/EBI | ✅ OPEN | REST API | **P1** | Biological pathways |
| 15 | STRING | STRING-db | ✅ OPEN | REST API | **P0** | Protein-protein interactions |
| 16 | BioGRID | BioGRID | ✅ OPEN | REST API | **P1** | Genetic interactions |
| 17 | Human Protein Atlas | KTH | ✅ OPEN | REST API | **P1** | Protein expression maps |
| 18 | COSMIC | Sanger | 🔒 LICENSED | API | P2 | Cancer mutations |
| 19 | OncoKB | MSKCC | ✅ OPEN | REST API | **P1** | Cancer variant interpretations |
| 20 | CIViC | WashU | ✅ OPEN | REST API | **P1** | Clinical variant interpretations |
| 21 | MyVariant.info | UCSF | ✅ OPEN | REST API | **P0** | Variant annotation aggregator |
| 22 | dbVar | NCBI | ✅ OPEN | E-utilities | P2 | Structural variants |
| 23 | DGV | Toronto | ✅ OPEN | Download | P2 | Genomic variants |
| 24 | DECIPHER | Sanger | ✅ OPEN | Web | **P1** | Developmental disorders |
| 25 | LOVD | LUMC | ✅ OPEN | Web | P2 | Locus-specific databases |
| 26 | ClinGen | ClinGen | ✅ OPEN | Web/API | **P1** | Clinical genome resource |
| 27 | Monarch Initiative | OSU | ✅ OPEN | REST API | **P1** | Cross-species disease biology |
| 28 | Orphanet | INSERM | ✅ OPEN | REST API | **P1** | Rare diseases |
| 29 | GenCC | GenCC | ✅ OPEN | REST API | **P1** | Gene-disease validity |
| 30 | MedGen | NCBI | ✅ OPEN | E-utilities | **P1** | Medical genetics |
| 31 | PubMed Health | NLM | ✅ OPEN | Web | P2 | Clinical effectiveness |
| 32 | TRIPLL | Various | ✅ OPEN | Web | P2 | Research translation |
| 33 | PEDro | USYD | ✅ OPEN | Web | **P1** | Physiotherapy trials |
| 34 | ICH GCP | ICH | ✅ OPEN | Download | P3 | Good Clinical Practice |
| 35 | ISRCTN | BioMed Central | ✅ OPEN | Web | P2 | Clinical trial registry |
| 36 | EU Clinical Trials Register | EMA | ✅ OPEN | Web | **P1** | EU trial registry |
| 37 | ANZCTR | NHMRC | ✅ OPEN | Web | P2 | Australian trial registry |
| 38 | JPRN | JST | ✅ OPEN | Web | P3 | Japan trial registry |
| 39 | ChiCTR | MoH China | ✅ OPEN | Web | P2 | China trial registry |
| 40 | CTRI | ICMR | ✅ OPEN | Web | P2 | India trial registry |
| 41 | REPEC | Stata | ✅ OPEN | Web | P3 | Economics methods |
| 42 | Nuremberg Code | Various | ✅ OPEN | Web | P3 | Research ethics |
| 43 | Declaration of Helsinki | WMA | ✅ OPEN | Web | P3 | Medical research ethics |
| 44 | CIOMS Guidelines | CIOMS | ✅ OPEN | Web | P3 | Epidemiological ethics |
| 45 | FDA 21 CFR Part 11 | FDA | ✅ OPEN | Web | P2 | Electronic records |
| 46 | HIPAA Research | HHS | ✅ OPEN | Web | P2 | Health data privacy |

**Genetics Summary:**
- ✅ OPEN: 33 — GWAS Catalog, dbSNP, Ensembl, UniProt, STRING, gnomAD, CIViC, MyVariant, etc.
- 📝 REGISTER: 1 — PharmGKB
- 📋 ACADEMIC: 1 — OMIM
- 🔓 FREEMIUM: 2 — GeneCards, KEGG
- 🔒 LICENSED: 1 — COSMIC
- ✅🏗️ BUILT: 2 — ClinVar, PharmGKB

---

## PART 5: INTEGRATION PRIORITY SUMMARY

### P0 — IMMEDIATE (Free/Open, High Clinical Value) — 26 Databases

| # | Database | Type | Why P0 |
|---|----------|------|--------|
| 1 | NeuroVault | Neuroimaging | 200K+ statistical maps, open API |
| 2 | Human Connectome Project | Neuroimaging | Gold standard connectome data |
| 3 | OpenNeuro | Neuroimaging | 500+ datasets, raw data |
| 4 | OASIS | Neuroimaging | 1,000+ aging/dementia scans |
| 5 | HCP Aging | Neuroimaging | Lifespan connectome |
| 6 | DrugBank | Pharma | Drug targets/interactions (academic free) |
| 7 | ChEMBL | Pharma | 2M+ bioactivity records, open API |
| 8 | PubChem | Pharma | 110M+ chemical structures |
| 9 | DailyMed | Pharma | FDA-approved labels |
| 10 | SNOMED CT | Terminology | Clinical terminology (academic) |
| 11 | ICD-10-CM | Terminology | Diagnosis codes |
| 12 | ICD-11 | Terminology | Next-gen diagnosis codes |
| 13 | PubMed/MEDLINE | Evidence | 35M+ citations |
| 14 | Cochrane Library | Evidence | Systematic reviews gold standard |
| 15 | ClinicalTrials.gov | Evidence | 400K+ trials |
| 16 | NICE Evidence | Evidence | UK clinical guidelines |
| 17 | Europe PMC | Evidence | 40M+ articles |
| 18 | Semantic Scholar | Evidence | AI-powered literature |
| 19 | AEOLUS | Evidence | Adverse event open data |
| 20 | GWAS Catalog | Genetics | Genome-wide associations |
| 21 | dbSNP | Genetics | Genetic variations |
| 22 | Ensembl | Genetics | Genome browser |
| 23 | GTeX | Genetics | Expression QTLs |
| 24 | ExAC/gnomAD | Genetics | Population allele frequencies |
| 25 | UniProt | Genetics | Protein sequences |
| 26 | STRING | Genetics | Protein-protein interactions |
| 27 | MyVariant.info | Genetics | Variant annotation aggregator |
| 28 | Yeo 2011 Atlas | Neuroimaging | 7/17 functional networks (citation classic) |
| 29 | Gordon 2014 Atlas | Neuroimaging | 333 cortical areas |

### P1 — HIGH (Free/Open, Good Value) — 22 Databases

| # | Database | Type | Why P1 |
|---|----------|------|--------|
| 1 | 1000 Functional Connectomes | Neuroimaging | Multi-site resting-state |
| 2 | NITRC | Neuroimaging | Tools + data registry |
| 3 | Glasser 2016 Atlas | Neuroimaging | HCP parcellation |
| 4 | Brainnetome Atlas | Neuroimaging | Connectivity parcellation |
| 5 | ADHD-200 | Neuroimaging | ADHD dataset |
| 6 | IXI Dataset | Neuroimaging | Healthy aging |
| 7 | COBRE | Neuroimaging | Schizophrenia |
| 8 | CORR | Neuroimaging | Reproducibility |
| 9 | DS030 | Neuroimaging | Phenomics |
| 10 | GSP | Neuroimaging | Brain genomics 1,500+ |
| 11 | Orange Book | Pharma | Approved products |
| 12 | NDC Directory | Pharma | Drug codes |
| 13 | UNII | Pharma | Substance identifiers |
| 14 | OTseeker | Evidence | OT evidence |
| 15 | PEDro | Evidence | Physiotherapy |
| 16 | AHRQ ePSS | Evidence | Preventive services |
| 17 | TRIP Database | Evidence | Clinical search |
| 18 | Epistemonikos | Evidence | Health evidence |
| 19 | NIH RePORTER | Evidence | Funded research |
| 20 | CORE | Evidence | Open access |
| 21 | bioRxiv/medRxiv | Evidence | Preprints |
| 22 | arXiv (q-bio) | Evidence | Biology preprints |
| 23 | SIDER | Pharma | Drug side effects |
| 24 | OFFSIDES/TWOSIDES | Pharma | Drug interactions |
| 25 | ChemSpider | Pharma | Chemical DB (freemium) |
| 26 | GeneCards | Genetics | Gene info (freemium) |
| 27 | KEGG | Genetics | Pathways (freemium) |
| 28 | Reactome | Genetics | Pathways |
| 29 | BioGRID | Genetics | Interactions |
| 30 | Human Protein Atlas | Genetics | Protein expression |
| 31 | OncoKB | Genetics | Cancer variants |
| 32 | CIViC | Genetics | Variant interpretations |
| 33 | DECIPHER | Genetics | Developmental disorders |
| 34 | ClinGen | Genetics | Clinical genomics |
| 35 | Monarch Initiative | Genetics | Cross-species biology |
| 36 | Orphanet | Genetics | Rare diseases |
| 37 | GenCC | Genetics | Gene-disease validity |
| 38 | MedGen | Genetics | Medical genetics |
| 39 | Crossref | Evidence | DOI metadata |
| 40 | DataCite | Evidence | Research data DOIs |

### P2 — MEDIUM (Restricted/Freemium/Licensed but valuable)

| # | Database | Type | Access | Why P2 |
|---|----------|------|--------|--------|
| 1 | UK Biobank | Neuroimaging | 🚫 RESTRICTED | 500K participants |
| 2 | ADNI | Neuroimaging | ✅🏗️ BUILT | Alzheimer's gold standard |
| 3 | ABIDE | Neuroimaging | ✅🏗️ BUILT | Autism imaging |
| 4 | AIBL | Neuroimaging | 🚫 RESTRICTED | Australian biomarkers |
| 5 | CAMCAN | Neuroimaging | 📝 REGISTER | Aging neuroscience |
| 6 | Dimensions | Evidence | 🔓 FREEMIUM | Research analytics |
| 7 | Altmetric | Evidence | 🔓 FREEMIUM | Attention metrics |
| 8 | JBI EVIDENCE | Evidence | 🔓 FREEMIUM | Healthcare evidence |
| 9 | VigiBase | Evidence | 🚫 RESTRICTED | WHO adverse reactions |
| 10 | OMIM | Genetics | 📋 ACADEMIC | Mendelian disorders |
| 11 | COSMIC | Genetics | 🔒 LICENSED | Cancer mutations |
| 12 | Lexicomp | Pharma | 🔒 LICENSED | Drug reference |
| 13 | UpToDate | Evidence | 🔒 LICENSED | Clinical decision support |
| 14 | Natural Medicines | Pharma | 🔒 LICENSED | Supplement interactions |

### P3 — LOW (Specialized/niche)

All remaining databases — specialized atlases, legacy datasets, ethics guidelines,
and web-scrape-only sources. Integration deferred unless specific clinical need arises.

---

## PART 6: ACCESS COUNTS SUMMARY

### Across All 171 Researched External Databases:

| Access Type | Count | Percentage |
|:---|---:|---:|
| ✅ OPEN / FREE | **88** | **51.5%** |
| 📝 REGISTER (free) | **11** | **6.4%** |
| 📋 ACADEMIC (free for research) | **2** | **1.2%** |
| 🔓 FREEMIUM | **7** | **4.1%** |
| 🔒 LICENSED | **13** | **7.6%** |
| 🚫 RESTRICTED | **14** | **8.2%** |
| ⚠️ WEB SCRAPE | **3** | **1.8%** |
| ✅🏗️ BUILT | **16** | **9.4%** |
| **TOTAL FREE-TO-ACCESS** | **101** | **59.1%** |
| **TOTAL REQUIRING LICENSE/RESTRICTION** | **30** | **17.5%** |

### Key Insight:
> **101 of 171 external databases (59.1%) are FREE to access** — either fully open,
> requiring only free registration, or free for academic/research use.
> This represents the immediately addressable integration surface.

### Integration Recommendation:
1. **Phase A (Next sprint)**: Build P0 adapters (29 databases) — all free/open
2. **Phase B (Sprint 2)**: Build P1 adapters (40 databases) — all free/open
3. **Phase C (Sprint 3+)**: Apply for restricted access + license evaluation
4. **Phase D (Ongoing)**: Web scrapers as fallback for critical gaps

---

*This matrix is maintained alongside the codebase. Update when new databases*
*are researched, adapters built, or access status changes.*
