# Open Medication & Pharmacology Dataset Stack Report
## For Clinical Neuromodulation Platform Integration

**Version:** 2.0  
**Date:** July 2025  
**Research Focus:** Open-source medication datasets, drug interaction APIs, adverse event databases, clinical decision support systems, and pharmacogenomics resources  
**Target Platform:** Clinical Neuromodulation Decision Support System  

---

## EXECUTIVE SUMMARY

This report catalogs 25+ major open-source medication/pharmacology datasets and APIs available for integration into a clinical neuromodulation platform. Resources are organized into five categories: Drug Information Databases, Drug-Drug Interaction Datasets, Adverse Event Databases, Clinical Decision Support APIs, and Pharmacogenomics Datasets. Each resource is evaluated across eight dimensions: URL/access point, license type, update frequency, completeness (drug coverage), API availability, clinical relevance to neuromodulation, integration complexity, and evidence quality.

### Top 5 Most Clinically Valuable Resources for Immediate Integration

1. **RxNorm/RxNav API (NLM)** — US standard drug terminology; free REST API; monthly updates; ~200K+ drug concepts. Essential medication identifier backbone.
2. **OpenFDA Drug/Adverse Event API** — Free access to FDA drug labels and FAERS adverse events; RESTful JSON; quarterly updates (daily dashboard). Critical for adverse event signal detection.
3. **PharmGKB** — CC-BY-SA 4.0 pharmacogenomics knowledge base; free REST API; 1,000+ gene-drug annotations. Directly actionable for precision neuromodulation therapy.
4. **DDInter 2.0** — Open-access curated DDI database; 302,516 DDI records covering 2,310 drugs with mechanism descriptions. Superior to DrugBank for clinical DDI screening.
5. **CPIC Guidelines + API** — Gold-standard pharmacogenetic prescribing guidelines; 34 genes, 164 drugs; 80,000+ monthly API queries. Directly integrated into Epic's genomics module.

---

## 1. DRUG INFORMATION DATABASES

### 1.1 RxNorm / RxNav (NLM)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.nlm.nih.gov/research/umls/rxnorm/ |
| **API Base** | https://rxnav.nlm.nih.gov/REST/ |
| **License** | Free; UMLS license required for full downloads. No license needed for API access to SAB=RXNORM data. |
| **Update Frequency** | Monthly releases (e.g., 02-Sep-2025) |
| **Completeness** | 200,000+ clinical drug concepts; links to NDC, ATC, SNOMED CT, USP |
| **API Format** | REST (XML/JSON); 35+ endpoints; also RxTerms and RxClass APIs |
| **Clinical Relevance** | **Critical** — US standard drug terminology required by ONC for EHR certification; medication normalization backbone |
| **Integration Complexity** | Low — Simple HTTP GET requests; Python SDK (pynorm-sdk) available; no authentication for basic queries |
| **Evidence Quality** | Authoritative — NLM-maintained since 2004; required by ONC 21st Century Cures Act |

**2024-2025 Updates:**
- FDA finalized 12-digit NDC format (6-4-2) in March 2026, effective 2033 — RxNorm adapting
- Current Prescribable Content subset freely available without license
- RxNorm-in-OWL available for semantic web applications
- Integration with USCDI v5 Medications data class (Route of Administration added)

**Neuromodulation Relevance:**
- Provides standardized medication identifiers for neuromodulation patient medication lists
- Essential for medication reconciliation in DBS/SCS/TMS patient workflows
- Links neuromodulation device-prescribed drugs (e.g., antiparkinsonian, analgesic, antidepressant) to standardized terminologies
- Supports cross-referencing with adverse event databases and DDI datasets

**Key API Endpoints:**
- `/rxcui?name={name}` — Find drug by name
- `/rxcui/{rxcui}/allProperties` — Get all drug properties
- `/rxcui/{rxcui}/allrelated` — Get all related concepts
- `/drugs?name={name}` — Get drugs related to name
- `/version` — Get current RxNorm version

---

### 1.2 DailyMed (FDA Labeling)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://dailymed.nlm.nih.gov/ |
| **API Base** | https://dailymed.nlm.nih.gov/dailymed/services/v2/ |
| **License** | Public domain — US government work |
| **Update Frequency** | Continuous; reflects current FDA-approved SPL labels |
| **Completeness** | All FDA-approved prescription and OTC drug labels in US |
| **API Format** | RESTful API v2; XML/JSON; HTTP GET only |
| **Clinical Relevance** | **High** — Official FDA-approved drug labeling; structured product labeling (SPL) |
| **Integration Complexity** | Low-Medium — REST API with standard endpoints; no authentication required |
| **Evidence Quality** | Regulatory — Direct from FDA; gold standard for drug indication, dosing, warnings |

**API Resources:**
- `/spls` — List all SPLs
- `/spls/{SETID}` — Get specific SPL document
- `/drugnames` — All drug names
- `/drugclasses` — Pharmacologic class indexing
- `/ndcs` — All NDC codes
- `/applicationnumbers` — All NDA numbers

**2024-2025 Updates:**
- API v2 is current stable version
- DailyMed continues to be primary source for FDA-structured product labeling
- Integrated with AuditMed and other open-access clinical evidence platforms

**Neuromodulation Relevance:**
- Access to full FDA labeling for neuromodulation-relevant medications (opioids, anticonvulsants, antidepressants, antiparkinsonians, muscle relaxants)
- Boxed warnings and contraindications directly relevant to patient safety screening
- Drug interaction sections in SPL provide authoritative DDI data

---

### 1.3 DrugBank

| Attribute | Detail |
|-----------|--------|
| **URL** | https://go.drugbank.com/ |
| **API Base** | https://api.drugbank.com/v1/ |
| **License** | CC0 for "Open Data" subset (vocabulary, structures); CC BY-NC 4.0 for academic full data; Commercial license required for Clinical API |
| **Update Frequency** | Version 5.1.20 (released 2026-05-06) — approximately quarterly |
| **Completeness** | 17,467 drug entries; 2,992 approved small molecules; 1,729 approved biologics; 5,463 protein sequences |
| **API Format** | REST API v1; JSON; API key required (3,000 req/month for dev keys) |
| **Clinical Relevance** | **High** — Comprehensive drug-drug and drug-target data; 200+ data fields per entry |
| **Integration Complexity** | Medium — API key required; commercial licensing for production use; academic downloads temporarily paused (as of mid-2025) |
| **Evidence Quality** | High — Curated from FDA, literature, and scientific databases; widely cited (10,000+ citations) |

**2024-2025 Updates:**
- All academic downloads temporarily paused as of 2025 — new distribution model in development
- Clinical API available for healthcare software integration
- DrugBank Open Data (CC0) includes vocabulary and structures datasets
- UniChem provides free identifier resolution pathway as alternative to paid API

**Neuromodulation Relevance:**
- Extensive drug-target data relevant to neurotransmitter systems (dopamine, serotonin, GABA, glutamate)
- Drug interaction data for medications commonly co-prescribed with neuromodulation therapy
- Pharmacokinetic data useful for patients with implanted devices who may have altered drug metabolism

**Key API Endpoints:**
- `GET /v1/drugs/{id}` — Drug details
- `GET /v1/drugs/{id}/interactions` — Drug interactions
- `GET /v1/drugs/{id}/indications` — Indications
- `GET /v1/drugs/{id}/contraindications` — Contraindications
- `GET /v1/products/{ndc}` — Product information

---

### 1.4 ChEMBL

| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.ebi.ac.uk/chembl |
| **API Base** | https://www.ebi.ac.uk/chembl/api/data/ |
| **License** | CC BY-SA 3.0 |
| **Update Frequency** | Periodic releases with DOI; latest release documented on download page |
| **Completeness** | 2+ million compounds; 18+ million activities; 15,000+ targets; comprehensive drug mechanism data |
| **API Format** | REST API; Python client (chembl_webresource_client); downloadable SQLite/MySQL/PostgreSQL |
| **Clinical Relevance** | **Medium-High** — Bioactivity data, drug mechanisms, clinical candidate tracking (max_phase=4 for approved drugs) |
| **Integration Complexity** | Low-Medium — RESTful with pagination; Python client available; bulk downloads available |
| **Evidence Quality** | High — EBI-maintained; literature-extracted bioactivity data; widely used in drug discovery |

**2024-2025 Updates:**
- Drug data accessible via `/chembl/explore/drugs`, `/chembl/explore/drug_indications`, `/chembl/explore/drug_mechanisms`, `/chembl/explore/drug_warnings`
- API supports 13+ million activity endpoints
- myChEMBL virtual machine available for local deployment
- ChEMBL-RDF available for semantic web applications

**Neuromodulation Relevance:**
- Drug mechanism data (receptor binding, enzyme inhibition) relevant to neurotransmitter targets
- Clinical candidate tracking for drugs in development for neurological conditions
- Bioactivity data for drugs affecting ion channels, neurotransmitter transporters, and receptors

---

### 1.5 PubChem

| Attribute | Detail |
|-----------|--------|
| **URL** | https://pubchem.ncbi.nlm.nih.gov/ |
| **API Access** | PUG-REST, PUG-SOAP, PUG-View, E-Utilities, PubChemRDF |
| **License** | Public domain (US government); individual data sources may have specific licenses |
| **Update Frequency** | Continuous updates |
| **Completeness** | 110+ million chemical structures; 280+ million bioactivities; largest public chemical database |
| **API Format** | Multiple: PUG-REST (primary), PUG-SOAP, E-Utilities, PubChemRDF |
| **Clinical Relevance** | **Medium** — Chemical structure repository with bioactivity links; less clinically-oriented than DrugBank/ChEMBL |
| **Integration Complexity** | Medium — Multiple access routes; rate limits enforced; ChemInformant Python client available for high-throughput access |
| **Evidence Quality** | Variable — Aggregated from 100+ data sources; provenance tracking available; quality varies by source |

**2024-2025 Updates:**
- ChemInformant Python client (2025) provides 48x performance improvement over PubChemPy
- Dynamic rate limiting requires careful request throttling
- Bulk download facilities available for full dataset mirroring

**Neuromodulation Relevance:**
- Chemical structure data for neuromodulation-relevant drugs and research compounds
- Bioassay data for neuropharmacology screening
- Cross-references to other databases (DrugBank, ChEMBL, PharmGKB)

---

### 1.6 NDF-RT / MED-RT (Veterans Health Administration)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://evs.nci.nih.gov/ftp1/MED-RT/ (MED-RT); https://bioportal.bioontology.org/ontologies/VANDF (NDF) |
| **License** | Public domain (US government work) |
| **Update Frequency** | Monthly (MED-RT releases; e.g., 2025.07.07) |
| **Completeness** | MED-RT: 3,640 concepts (767 EPC, 770 MoA, 1,873 PE, 59 PK, 66 TC); NDF: comprehensive drug file with classes |
| **API Format** | FTP downloads (flat files); BioPortal API; NDF-RT REST API deprecated in favor of MED-RT |
| **Clinical Relevance** | **Medium** — Formal ontological medication classification; mechanism of action, physiologic effect, pharmacokinetic properties |
| **Integration Complexity** | Medium — Requires UMLS Metathesaurus knowledge; flat file downloads; no active REST API for MED-RT |
| **Evidence Quality** | Authoritative — VA/NCI-maintained; used in US federal healthcare systems |

**2024-2025 Updates:**
- MED-RT (version 2025.07.07): 3,640 total concepts; 21 new concepts added in July 2025
- Sourced from FDA SPL, RxNorm, MeSH, SNOMED CT US Edition, UMLS Metathesaurus
- NDF continues as VANDF (Veterans Health Administration National Drug File) on BioPortal

**Neuromodulation Relevance:**
- Mechanism of Action (MoA) hierarchy useful for understanding drug action on neural pathways
- Physiologic Effect (PE) classifications relevant to neuromodulation outcomes
- Established Pharmacologic Classes (EPC) for drug categorization in clinical protocols

---

### 1.7 ChEBI (Chemical Entities of Biological Interest)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.ebi.ac.uk/chebi/ |
| **API Base** | https://www.ebi.ac.uk/chebi/backend/api/docs/ (REST) |
| **License** | CC BY 4.0 |
| **Update Frequency** | Regular releases; legacy SOAP deprecated September 2025 |
| **Completeness** | 60,000+ chemical entities; fully classified chemical ontology |
| **API Format** | REST API (new, stable); formerly SOAP; FTP data products |
| **Clinical Relevance** | **Medium** — Chemical classification and ontology; less clinical than RxNorm/DrugBank |
| **Integration Complexity** | Low-Medium — New REST API with Swagger documentation; old SOAP endpoints being retired |
| **Evidence Quality** | High — EBI-curated chemical ontology; manually annotated |

**2024-2025 Updates:**
- Full ChEBI 2.0 redevelopment completed (2025)
- New REST API replaces deprecated SOAP services
- PostgreSQL schema with Elasticsearch + RDKit search
- New data products: ontology, TSV, SDF, PostgreSQL dump

**Neuromodulation Relevance:**
- Chemical entity classification for research compounds used in neuromodulation studies
- Ontological relationships for understanding drug chemical properties

---

## 2. DRUG-DRUG INTERACTION DATASETS

### 2.1 DDInter 2.0

| Attribute | Detail |
|-----------|--------|
| **URL** | https://ddinter2.scbdd.com/ |
| **License** | Free/open-access academic database |
| **Update Frequency** | Last updated 2024-05-14 |
| **Completeness** | 2,310 drugs; 302,516 DDI records; 8,398 mechanism descriptions; 857 drug-food interactions; 8,359 drug-disease interactions; 6,033 therapeutic duplications |
| **API Format** | Web interface; downloadable data (inferred from NAR publication) |
| **Clinical Relevance** | **Very High** — Curated by pharmacists; mechanism descriptions; risk levels; management recommendations; alternative medications |
| **Integration Complexity** | Low-Medium — Web-based API; data downloadable |
| **Evidence Quality** | High — Published in Nucleic Acids Research (2025); professionally curated |

**2024-2025 Updates:**
- DDInter 2.0 major release: significantly expanded coverage
- Added drug-food interactions (DFIs), drug-disease interactions (DDSIs), and therapeutic duplications
- Enhanced user interface with advanced filtering
- 8,398 distinct, high-quality mechanism descriptions with management recommendations

**Neuromodulation Relevance:**
- Comprehensive DDI screening for polypharmacy patients undergoing neuromodulation
- Drug-disease interactions particularly relevant for patients with comorbid epilepsy, Parkinson's, depression, chronic pain
- Alternative medication suggestions useful for medication optimization alongside device therapy

---

### 2.2 CredibleMeds (QTdrugs Lists)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.crediblemeds.org/ |
| **API Base** | https://api.crediblemeds.org/ |
| **License** | Free registration required; subscription for API license |
| **Update Frequency** | Dynamic — changes regularly (e.g., updates in Nov 2025, May 2025, Dec 2024, Apr 2024) |
| **Completeness** | 190+ drugs with QT prolongation risk categorized into Known Risk, Possible Risk, Conditional Risk |
| **API Format** | REST API available for licensed organizations; mobile apps (free Basic, subscription Standard/Pro) |
| **Clinical Relevance** | **Very High** — Gold standard for QT prolongation/TdP risk assessment; essential for cardiac safety |
| **Integration Complexity** | Medium — Free registration for web access; commercial API license required for system integration |
| **Evidence Quality** | High — Evidence-based with Scientific Review Committee; publications in peer-reviewed literature |

**2024-2025 Updates:**
- November 2025: Dordaviprine (anti-cancer) added to Possible Risk; Cinacalcet added to Conditional Risk
- May 2025: Bilastine and Gepotidacin added to Possible Risk
- December 2024: Opipramol, Revumenib, Sitafloxacin added
- April 2024: Moclobemide, Gepirone, Motixafortide, Givinostat, Isoflurane added
- Enhanced CredibleMeds mobile app launched April 2025
- MedSafetyScan clinical decision support tool validated in psychiatric inpatient population (2025)

**Neuromodulation Relevance:**
- **Critical** for neuromodulation patients receiving drugs that affect cardiac conduction
- Many antidepressants (SSRIs, TCAs), anticonvulsants, and antipsychotics used in neuromodution are on QTdrugs list
- DBS for Parkinson's patients often on multiple QT-risk medications
- Cardiac safety screening before device implantation

---

### 2.3 ONC High-Priority DDI List

| Attribute | Detail |
|-----------|--------|
| **URL** | https://healthit.gov/ (ONC Standards Bulletin) |
| **License** | Public domain (US government) |
| **Update Frequency** | Periodic updates through ONC Standards Bulletin |
| **Completeness** | Core set of high-severity DDIs recommended for clinical decision support |
| **API Format** | Published lists/guidance documents; no dedicated API |
| **Clinical Relevance** | **High** — ONC-recommended DDI list for EHR certification; severity-classified |
| **Integration Complexity** | Medium — Requires manual integration from published documents |
| **Evidence Quality** | Authoritative — Expert panel-reviewed; ONC-endorsed for clinical decision support |

**Neuromodulation Relevance:**
- Standard reference for DDI alerting in clinical decision support systems
- High-priority interactions (Category X: avoid combination) particularly relevant for neuromodulation medication management
- Used as benchmark for evaluating DDI prediction systems

---

### 2.4 DIKB (Drug Interaction Knowledge Base)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://bioportal.bioontology.org/ontologies/DIKB |
| **License** | Open (academic) |
| **Update Frequency** | Last updated 2015; limited recent activity |
| **Completeness** | 161 classes; evidence taxonomy for pharmacologic studies |
| **API Format** | OWL ontology via BioPortal; downloadable in OWL, CSV, RDF/XML |
| **Clinical Relevance** | **Low-Medium** — Evidence taxonomy framework; not actively maintained as a primary DDI database |
| **Integration Complexity** | Medium — OWL ontology; requires semantic web tooling |
| **Evidence Quality** | Academic — Framework for confidence assignment in drug mechanism assertions; limited recent updates |

**Neuromodulation Relevance:**
- Evidence taxonomy useful for structuring confidence levels in drug interaction assessments
- Limited practical utility due to lack of active maintenance

---

### 2.5 TWOSIDES / NSIDES

| Attribute | Detail |
|-----------|--------|
| **URL** | https://tatonettilab.org/resources/nsides/ |
| **License** | CC BY 4.0 |
| **Update Frequency** | Dataset published 2012; derivatives used in ML benchmarks |
| **Completeness** | 645 drugs; 963 interaction types; 4,649,441 DDI pairs (4,576,287 positive instances) |
| **API Format** | Downloadable dataset (CSV); used as benchmark in Therapeutic Data Commons (TDC) |
| **Clinical Relevance** | **Medium** — Data-driven DDI predictions from adverse event reports; not clinically curated |
| **Integration Complexity** | Low — Flat file download |
| **Evidence Quality** | Medium — Computational predictions validated against FAERS data; useful for research but not primary clinical decision-making |

**Neuromodulation Relevance:**
- Large-scale polypharmacy side effect data useful for hypothesis generation
- Machine learning applications for predicting novel DDIs in neuromodulation patients

---

### 2.6 Open-Source DDI Datasets on GitHub / ML Benchmarks

| Dataset | Description | Size | Access |
|---------|-------------|------|--------|
| **DrugBank DDI** | Curated from DrugBank | 1,710 drugs; 192,284 interactions; 86 types | https://bitbucket.org/kaistsystemsbiology/deepddi/src/master/data/ |
| **TWOSIDES** | FAERS-derived polypharmacy side effects | 645 drugs; 4.6M+ pairs | https://tatonettilab.org/resources/nsides/ |
| **ZhangDDI** | Binary DDI labels | Multiple splits | GitHub: HTCL-DDI |
| **DeepDDI** | 86 DDI types from DrugBank | 1,706 drugs | GitHub: Drug-InteractionResearch |
| **AIChemist** | Clinician-curated 750 DDI scenarios with LexiDrug severity | 750 scenarios | https://github.com/sikora07/AIChemist |

---

## 3. ADVERSE EVENT DATABASES

### 3.1 FAERS (FDA Adverse Event Reporting System) / AEMS

| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.fda.gov/drugs/surveillance/fda-adverse-event-monitoring-system-aems |
| **Public Dashboard** | https://fis.fda.gov/extensions/FPD-QDE-FAERS/FPD-QDE-FAERS.html |
| **License** | Public domain (de-identified data) |
| **Update Frequency** | **Daily real-time updates as of August 2025** (previously quarterly); 31+ million total reports |
| **Completeness** | 28+ million reports as of Dec 2023; 31+ million as of 2025; 2+ million new reports annually |
| **API Format** | OpenFDA API (JSON); quarterly bulk data downloads (ASCII/XML); FAERS Public Dashboard |
| **Clinical Relevance** | **Critical** — Primary US post-marketing drug safety surveillance; signal detection |
| **Integration Complexity** | Medium — OpenFDA API for programmatic access; bulk files require processing; MedDRA coding used |
| **Evidence Quality** | Regulatory — Authoritative FDA data; limitations include under-reporting, duplicates, voluntary reporting bias |

**2024-2025 Updates:**
- **Major: FDA began real-time daily updates in August 2025** (radical transparency initiative)
- FAERS being consolidated into unified AEMS (Adverse Event Monitoring System) across all FDA-regulated products
- E2B(R3) implementation deadline: April 2026
- FAERS Public Dashboard for Cosmetic Products launched September 2025
- Oracle Empirica Signal used internally for disproportionality analysis
- New de-duplication algorithms using NLP (2022-2024 publications)

**Neuromodulation Relevance:**
- Signal detection for adverse events associated with neuromodulation-relevant drugs
- Monitoring for adverse events in patients with implanted devices
- Post-marketing surveillance for drugs commonly co-prescribed with neuromodulation therapy
- Detection of rare adverse events not captured in clinical trials

---

### 3.2 WHO VigiBase / VigiAccess

| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.vigiaccess.org/ (public); https://who-umc.org/vigibase-data-access/ (full access) |
| **API Base** | https://who-umc.org/vigibase/vigibase-services/vigibase-custom-searches/ |
| **License** | VigiBase Data Access Conditions; VigiAccess is free public resource; API fees on cost-recovery basis |
| **Update Frequency** | Continuous; 35+ million reports as of July 2023; growing |
| **Completeness** | World's largest pharmacovigilance database; 161 full PIDM members; 99% world population coverage |
| **API Format** | VigiAccess API (substance + adverse event search); VigiLyze for members; VigiBase Search Services for custom queries |
| **Clinical Relevance** | **Critical** — Global pharmacovigilance reference; WHO standard |
| **Integration Complexity** | Medium — VigiAccess API available for vendors; full VigiBase requires data access agreement |
| **Evidence Quality** | Regulatory — Gold standard global pharmacovigilance; IC (Information Component) disproportionality analysis; vigiRank signal detection |

**2024-2025 Updates:**
- Updated VigiBase Data Access Conditions (March 2025) with clarified access levels
- VigiBase planning upgrade of all reports to E2B(R3) format in 2026
- vigiMatch duplicate detection algorithm
- vigiGrade documentation quality assessment tool
- VigiBase pregnancy algorithm for pregnancy exposure detection

**Neuromodulation Relevance:**
- Global adverse event data for neuromodulation-relevant drugs
- International perspective complementary to FAERS
- Signal detection for rare adverse events in diverse populations

---

### 3.3 OpenFDA Adverse Events API

| Attribute | Detail |
|-----------|--------|
| **URL** | https://open.fda.gov/apis/drug/event/ |
| **API Base** | https://api.fda.gov/drug/event.json |
| **License** | Public domain |
| **Update Frequency** | Quarterly (OpenFDA); daily (FAERS Public Dashboard) |
| **Completeness** | FAERS data from 2004-present |
| **API Format** | RESTful JSON API; query-based |
| **Clinical Relevance** | **High** — Programmatic access to FAERS data; enables third-party app development |
| **Integration Complexity** | Low — Simple REST API with query parameters; no authentication required |
| **Evidence Quality** | Same as FAERS — regulatory source with inherent reporting limitations |

**Key Query Parameters:**
- `search` — Full-text search
- `count` — Aggregate counts
- `limit` — Results per page
- `skip` — Pagination offset

**Neuromodulation Relevance:**
- Direct API access for adverse event queries on neuromodulation-relevant drugs
- Integration into clinical decision support for real-time adverse event checking
- Data source for pharmacovigilance analytics

---

## 4. CLINICAL DECISION SUPPORT APIs

### 4.1 CDS Hooks (HL7)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://cds-hooks.org/ |
| **Specification** | https://cds-hooks.hl7.org/ |
| **License** | Open standard (HL7) — free to implement |
| **Update Frequency** | Continuous improvement build; stable releases published |
| **Completeness** | Hook definitions: patient-view, order-select, order-sign, encounter-start, etc. |
| **API Format** | RESTful hooks specification; JSON-based CDS Cards; OpenAPI/Swagger available |
| **Clinical Relevance** | **Critical** — Standard for embedding decision support in EHR workflows; medication-related hooks directly applicable |
| **Integration Complexity** | Medium — Requires CDS service development; EHR client support needed; 500ms response requirement |
| **Evidence Quality** | Standard — HL7-published specification; proven implementations (96-100% accuracy in Brigham & Women's 2025 study) |

**2024-2025 Updates:**
- Brigham & Women's 2025 study: 96-100% accuracy across three CDS Hooks radiology applications
- OpenAPI Specification available for code generation
- Sandbox at http://sandbox.cds-hooks.org for testing
- Integration with SMART on FHIR for app launching

**Neuromodulation Relevance:**
- `order-select` and `order-sign` hooks for medication ordering in neuromodulation patients
- `patient-view` hooks for medication review at neuromodulation clinic visits
- Drug interaction alerts, QT prolongation screening, pharmacogenomic guidance
- Integration with PDMP (Prescription Drug Monitoring Program) workflows

---

### 4.2 SMART on FHIR

| Attribute | Detail |
|-----------|--------|
| **URL** | https://docs.smarthealthit.org/ |
| **App Gallery** | https://apps.smarthealthit.org/ |
| **License** | Open standard — free to implement |
| **Update Frequency** | Active development; OAuth2-based; FHIR R4/R5 support |
| **Completeness** | 1,000+ SMART apps in EHR galleries by 2026; market estimated at $1.2B (2024), projected $7.8B (2033) |
| **API Format** | OAuth2 + FHIR; supports R4, R5; launch contexts: EHR launch, standalone launch |
| **Clinical Relevance** | **Critical** — Required by ONC for EHR certification; enables third-party app integration |
| **Integration Complexity** | Medium — OAuth2 flow implementation; FHIR resource knowledge; scope management |
| **Evidence Quality** | Standard — ONC-required for EHR certification; 90%+ US hospital adoption by 2025 |

**2024-2025 Updates:**
- ONC requires 100% of certified EHRs to implement SMART APIs
- TEFCA (Trusted Exchange Framework): 75,000+ participant locations, 474M+ documents shared
- CMS Interoperability Final Rule mandates FHIR-based APIs by January 2027
- Epic, Oracle Health, Allscripts, Allscripts all support SMART on FHIR

**Neuromodulation Relevance:**
- Access patient medication lists (MedicationRequest, MedicationStatement) from EHR
- Launch neuromodulation-specific apps within EHR workflow
- Medication reconciliation across care settings
- Integration with neuromodulation device data

---

### 4.3 Medication-Related FHIR Resources

| FHIR Resource | Purpose | Status |
|---------------|---------|--------|
| **MedicationRequest** | Prescription/ordering of medications | R4 stable |
| **MedicationStatement** | Patient's medication history/report | R4 stable |
| **MedicationAdministration** | Recording of medication administration | R4 stable |
| **MedicationDispense** | Dispensing from pharmacy | R4 stable |
| **Medication** | Drug product details (reference) | R4 stable |
| **MedicationKnowledge** | Medication formulary/knowledge base | R4 stable |
| **Substance** | Substance specification | R4 stable |

**2024-2025 Updates:**
- USCDI v5 added Route of Administration to Medications data class
- USCDI v6 submission cycle active (2024); Medication Order, Laboratory Order, etc. added
- Breaking change: MedicationRequest.dispenseRequest.initialFill.quantity.value changed from string to decimal (January 2025)
- NLLMedicationRequest extensions now Sweden-only (January 2025)

**Neuromodulation Relevance:**
- MedicationRequest supports medication ordering with neuromodulation-specific constraints
- MedicationKnowledge enables integration of formulary and drug interaction data
- MedicationStatement for comprehensive medication history capture
- Supports USCDI medication data exchange requirements

---

## 5. PHARMACOGENOMICS DATASETS

### 5.1 PharmGKB

| Attribute | Detail |
|-----------|--------|
| **URL** | https://www.pharmgkb.org/ |
| **API Base** | https://api.pharmgkb.org/ (JSON-LD) |
| **License** | CC BY-SA 4.0 International — free; no registration required |
| **Update Frequency** | Continuously curated; regular data updates |
| **Completeness** | 1,000+ clinical annotations; 500+ drug labels annotated; 200+ dosing guidelines; 17,000+ variant annotations |
| **API Format** | JSON-LD API; bulk data downloads; no registration required |
| **Clinical Relevance** | **Critical** — Primary pharmacogenomics knowledge base; gene-drug pair annotations; clinical guideline integration |
| **Integration Complexity** | Low — Open API; JSON-LD format; no authentication; FAIR principles compliant |
| **Evidence Quality** | High — NIH-funded (Stanford); manually curated from primary literature, drug labels, and clinical guidelines; 10,000+ citations |

**2024-2025 Updates:**
- PharmGKB API and data remain freely available under CC BY-SA 4.0
- Data annotated with standard vocabularies: MeSH, RxNorm, HGNC, dbSNP, gnomAD
- JSON-LD format for Linked Data interoperability
- PharmCAT (Pharmacogenomic Clinical Annotation Tool) available on GitHub (Mozilla Public License 2.0)
- 385 clinical guideline annotations used in LLM evaluation studies (2024)

**Neuromodulation Relevance:**
- Gene-drug interactions for antidepressants, anticonvulsants, analgesics, antiparkinsonians used with neuromodulation
- CYP2D6/CYP2C19 genotyping guides antidepressant selection for depression neuromodulation patients
- SLCO1B1 genotyping for statin therapy in cardiovascular disease patients with SCS
- Pharmacogenomic-guided dosing reduces adverse events in polypharmacy neuromodulation patients

---

### 5.2 CPIC (Clinical Pharmacogenetics Implementation Consortium)

| Attribute | Detail |
|-----------|--------|
| **URL** | https://cpicpgx.org/ |
| **API** | Available; 80,000+ monthly queries |
| **License** | Free; NIH-funded (U24HG013077); openly available |
| **Update Frequency** | Active guideline development; 28 active guidelines |
| **Completeness** | 34 genes; 164 drugs; 28 active evidence-based guidelines |
| **API Format** | CPIC API; gene-drug pair data tables; downloadable guideline documents |
| **Clinical Relevance** | **Critical** — Gold standard pharmacogenetic prescribing guidelines; global standard |
| **Integration Complexity** | Low-Medium — Free API; guideline data tables; JSON/XML available |
| **Evidence Quality** | Highest — Evidence-based guidelines; peer-reviewed; 10,000+ citations; 1.4 million views; 85% of implementation studies reference CPIC |

**2024-2025 Updates:**
- CPIC API supports 80,000+ monthly queries
- Integrated into Epic's foundational genomics module
- 128 healthcare institutions and 40 commercial laboratories using CPIC content
- Covers CYP2C19, CYP2D6, CYP3A4/5, SLCO1B1, TPMT, NUDT15, DPYD, and many more genes
- Member surveys (2024) show shift from evidence concerns to EHR integration barriers

**Neuromodulation Relevance:**
- CYP2D6 guidelines for antidepressants (amitriptyline, nortriptyline) — directly relevant to depression neuromodulation
- CYP2C19 guidelines for antidepressants and anticonvulsants — relevant for VNS, DBS patients
- DPYD guidelines for 5-FU/capecitabine — relevant for cancer pain SCS patients
- SLCO1B1 guidelines for simvastatin — relevant for cardiovascular comorbidities

---

### 5.3 DPWG (Dutch Pharmacogenetics Working Group)

| Attribute | Detail |
|-----------|--------|
| **URL** | Guidelines published in European Journal of Human Genetics |
| **License** | Published in peer-reviewed journals; freely accessible |
| **Update Frequency** | Periodic guideline updates |
| **Completeness** | 108+ drug-gene pairs with clinical guidelines (as of PREPARE study); 12-gene panel with 50 variants |
| **API Format** | No dedicated API; guidelines published in literature; PharmGKB integrates DPWG content |
| **Clinical Relevance** | **High** — European complement to CPIC; broader gene coverage in some areas |
| **Integration Complexity** | Medium — Guidelines must be manually extracted from publications; PharmGKB provides some integration |
| **Evidence Quality** | High — Evidence-based guidelines from Dutch Royal Pharmacists Association; peer-reviewed publications |

**2024-2025 Updates:**
- New DPWG guideline: SLCO1B1-statins and CYP2C9-sulfonylureas (2025)
- PREPARE study implementation: panel-based pharmacogenetic testing in clinical practice
- 58 genetic variants in 14 genes (initial panel); evolved to 12-gene panel with 50 variants
- DPWG guidelines integrated with PharmGKB for cross-referencing

**Neuromodulation Relevance:**
- Similar gene-drug coverage to CPIC; European perspective valuable for international platforms
- CYP2D6, CYP2C19, CYP3A4/5 guidelines for neuromodulation-relevant drugs
- SLCO1B1 guidelines for statins in patients with cardiovascular indications for neuromodulation

---

## 6. INTEGRATION RECOMMENDATIONS FOR NEUROMODULATION PLATFORM

### Priority Tier 1: Core Medication Data Layer (Immediate Integration)

| Priority | Resource | Use Case | Integration Effort |
|----------|----------|----------|-------------------|
| 1 | **RxNorm API** | Standard drug identifiers, NDC mapping, ATC classification | Low (REST API, no auth) |
| 2 | **OpenFDA Drug/Label API** | FDA-approved labeling, adverse events, drug enforcement reports | Low (REST API, no auth) |
| 3 | **PharmGKB API** | Pharmacogenomic annotations, gene-drug interactions, dosing guidelines | Low (REST API, no auth, CC BY-SA) |
| 4 | **DDInter 2.0** | Comprehensive DDI screening with mechanisms and management | Low-Medium (Web API/data download) |
| 5 | **CPIC Guidelines** | Evidence-based pharmacogenetic prescribing recommendations | Low-Medium (Free API, downloadable tables) |

### Priority Tier 2: Clinical Decision Support Layer (Near-term Integration)

| Priority | Resource | Use Case | Integration Effort |
|----------|----------|----------|-------------------|
| 6 | **CDS Hooks** | Real-time medication decision support in EHR workflow | Medium (requires CDS service development) |
| 7 | **SMART on FHIR** | EHR-integrated neuromodulation medication apps | Medium (requires app development) |
| 8 | **CredibleMeds API** | QT prolongation screening for cardiac safety | Medium (requires license) |
| 9 | **DailyMed API** | Current FDA SPL labeling for medication reference | Low (REST API, no auth) |
| 10 | **MED-RT** | Medication mechanism classification for clinical reasoning | Medium (flat file processing) |

### Priority Tier 3: Advanced Analytics Layer (Long-term Integration)

| Priority | Resource | Use Case | Integration Effort |
|----------|----------|----------|-------------------|
| 11 | **FAERS/AEMS (OpenFDA)** | Adverse event signal detection for neuromodulation drugs | Medium (bulk data processing) |
| 12 | **WHO VigiAccess API** | Global adverse event perspective | Medium (requires API agreement) |
| 13 | **DrugBank Open Data** | Drug-target interactions for research | Low-Medium (CC0 subset available) |
| 14 | **ChEMBL API** | Bioactivity data for neuromodulation drug mechanisms | Low-Medium (REST API) |
| 15 | **ChEBI** | Chemical entity classification and ontology | Low-Medium (REST API) |

---

## 7. TECHNICAL INTEGRATION ARCHITECTURE

### Recommended Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                    NEUROMODULATION PLATFORM                      │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  CDS Layer  │  │ Medication  │  │  Pharmacogenomics       │ │
│  │             │  │  Safety     │  │  Decision Support       │ │
│  │ • CDS Hooks │  │  Screening  │  │                         │ │
│  │ • SMART on  │  │ • DDInter   │  │ • PharmGKB              │ │
│  │   FHIR Apps │  │ • Credible  │  │ • CPIC Guidelines       │ │
│  │             │  │   Meds      │  │ • DPWG Guidelines       │ │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │
│         │                │                      │               │
│  ┌──────┴────────────────┴──────────────────────┴─────────────┐│
│  │              MEDICATION DATA NORMALIZATION LAYER             ││
│  │                                                             ││
│  │  • RxNorm (primary identifiers)                             ││
│  │  • NDC ↔ RxCUI mapping                                      ││
│  │  • ATC classification                                       ││
│  │  • DailyMed SPL reference                                   ││
│  │  • MED-RT mechanism classification                          ││
│  └──────────────────────────┬──────────────────────────────────┘│
│                             │                                   │
│  ┌──────────────────────────┴──────────────────────────────────┐│
│  │              PHARMACOVIGILANCE & ANALYTICS LAYER             ││
│  │                                                             ││
│  │  • OpenFDA Adverse Events (FAERS)                          ││
│  │  • WHO VigiAccess                                          ││
│  │  • DrugBank Open Data (drug-target)                        ││
│  │  • ChEMBL (bioactivity)                                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Architecture

1. **Medication Ingestion:** Patient medication lists are normalized using RxNorm (RxCUI identifiers)
2. **Safety Screening:** DDInter 2.0 + CredibleMeds screen for DDIs and QT prolongation risks
3. **Pharmacogenomic Guidance:** PharmGKB + CPIC provide gene-based dosing recommendations
4. **Adverse Event Surveillance:** OpenFDA FAERS data enables population-level safety monitoring
5. **Clinical Decision Support:** CDS Hooks deliver alerts within EHR workflow via SMART on FHIR

---

## 8. LICENSING SUMMARY

| Resource | License | Commercial Use | Attribution Required |
|----------|---------|---------------|---------------------|
| RxNorm/RxNav | Free/UMLS | Yes | No (for API) |
| DailyMed | Public Domain | Yes | No |
| DrugBank Open | CC0 | Yes | No |
| DrugBank Full | CC BY-NC 4.0 / Commercial | Full requires license | Yes |
| ChEMBL | CC BY-SA 3.0 | Yes | Yes |
| PubChem | Public Domain | Yes | No |
| MED-RT/NDF-RT | Public Domain | Yes | No |
| ChEBI | CC BY 4.0 | Yes | Yes |
| DDInter 2.0 | Open-access | Academic | Cite NAR paper |
| CredibleMeds | Free reg/API license | API requires license | Yes |
| FAERS/OpenFDA | Public Domain | Yes | No |
| VigiBase | Data Access Conditions | API fees | Yes |
| CDS Hooks | Open Standard (HL7) | Yes | No |
| SMART on FHIR | Open Standard | Yes | No |
| PharmGKB | CC BY-SA 4.0 | Yes | Yes |
| CPIC | Free/NIH-funded | Yes | Yes |
| DPWG | Published guidelines | Yes | Cite |

---

## 9. EVIDENCE QUALITY ASSESSMENT

| Resource | Evidence Level | Curation Type | Clinical Validation |
|----------|---------------|---------------|-------------------|
| RxNorm | Authoritative | Expert manual | ONC-required |
| DailyMed | Regulatory | FDA official | Gold standard |
| DrugBank | High | Expert curated | 10,000+ citations |
| ChEMBL | High | Literature-extracted | Widely validated |
| PubChem | Variable | Mixed manual/auto | Source-dependent |
| MED-RT | Authoritative | VA/NCI expert | Federal systems |
| DDInter 2.0 | High | Pharmacist curated | NAR 2025 |
| CredibleMeds | High | Scientific committee | Peer-reviewed |
| FAERS | Regulatory | Report aggregation | Signal detection only |
| VigiBase | Regulatory | WHO standard | Global standard |
| PharmGKB | High | Manual curation | 10,000+ citations |
| CPIC | Highest | Evidence-based guidelines | Clinical implementation |
| CDS Hooks | Standard | HL7 specification | Published trials |
| SMART on FHIR | Standard | ONC-required | 90%+ hospital adoption |

---

## 10. CONCLUSIONS AND RECOMMENDATIONS

### Key Findings

1. **Exceptional Open Data Availability:** The medication/pharmacology domain has outstanding open data resources, with most critical databases offering free APIs under permissive licenses.

2. **Standards Alignment:** ONC's interoperability requirements (USCDI, SMART on FHIR, CDS Hooks) ensure these resources are designed for integration.

3. **Real-time Safety Data:** FDA's 2025 shift to daily FAERS updates represents a paradigm shift in pharmacovigilance timeliness.

4. **Pharmacogenomics Maturity:** CPIC and PharmGKB provide clinically validated, API-accessible pharmacogenomic guidance ready for EHR integration.

5. **DDI Data Richness:** DDInter 2.0 offers the most comprehensive open DDI dataset with clinical-grade curation, surpassing DrugBank for practical DDI screening.

### Top 5 Resources for Immediate Integration (Detailed)

#### 1. RxNorm/RxNav API (NLM)
- **Why #1:** The universal drug identifier backbone. Without RxNorm, no medication system can interoperate with US healthcare. Free, monthly-updated, 200K+ concepts, 35+ REST endpoints.
- **Integration:** 1-2 weeks for basic NDC/RxCUI resolution; ongoing for full ATC/classification integration.
- **Neuromodulation Value:** Every medication in your platform gets a standard identifier, enabling cross-referencing with all other datasets.

#### 2. OpenFDA Drug & Adverse Event API
- **Why #2:** Single API providing access to FDA labels, adverse events, and drug enforcement data. No authentication. Public domain.
- **Integration:** 2-3 weeks for label retrieval and adverse event queries.
- **Neuromodulation Value:** Real-time adverse event signal detection for neuromodulation-relevant drugs; regulatory-grade labeling reference.

#### 3. PharmGKB
- **Why #3:** The world's premier pharmacogenomics knowledge base. CC-BY-SA. No registration. JSON-LD API. 1,000+ gene-drug annotations.
- **Integration:** 2-4 weeks for gene-drug annotation lookup; longer for full pharmacogenomic decision support.
- **Neuromodulation Value:** Directly actionable dosing guidance for CYP2D6 (antidepressants), CYP2C19 (anticonvulsants), SLCO1B1 (statins) — all highly relevant to neuromodulation patients.

#### 4. DDInter 2.0
- **Why #4:** 302,516 curated DDIs covering 2,310 drugs with mechanism descriptions and management recommendations. Published in NAR 2025.
- **Integration:** 1-2 weeks for web API integration.
- **Neuromodulation Value:** Comprehensive polypharmacy screening for DBS, SCS, VNS, TMS patients who are typically on multiple medications.

#### 5. CPIC Guidelines + API
- **Why #5:** Gold-standard pharmacogenetic prescribing guidelines. 34 genes, 164 drugs. 80,000+ monthly API queries. Integrated into Epic.
- **Integration:** 2-3 weeks for guideline lookup API.
- **Neuromodulation Value:** Evidence-based prescribing recommendations that reduce adverse events and optimize medication therapy alongside neuromodulation devices.

---

*Report compiled from web research conducted July 2025. URLs, API endpoints, and licensing terms are current as of research date but should be verified before integration.*

*For questions or updates, consult the respective resource documentation and API references.*
