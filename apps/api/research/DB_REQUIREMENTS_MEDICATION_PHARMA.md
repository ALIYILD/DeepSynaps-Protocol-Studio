# DeepSynaps Protocol Studio -- Medication & Pharmacology Database Requirements

> **Research Date**: 2025  
> **Researcher**: Clinical Database Researcher  
> **Purpose**: Identify ALL medication and pharmacology databases needed for DeepSynaps Protocol Studio  
> **Platform Existing Modules**: drugbank_integration.py (1,365 lines), medication_analyzer.py (2,351 lines), medication_interactions.py (115 lines), pharmacogenomics_panel.py (758 lines), openfda_client.py (781 lines)

---

## Summary Statistics

| Category | Databases Found | Critical Priority | High Priority | Medium Priority | Low Priority |
|----------|----------------|-------------------|---------------|-----------------|--------------|
| Drug Databases | 11 | 4 | 5 | 2 | 0 |
| Pharmacogenomics | 10 | 5 | 4 | 1 | 0 |
| Adverse Events | 6 | 4 | 2 | 0 | 0 |
| Medical Coding | 7 | 3 | 3 | 1 | 0 |
| **TOTAL** | **34** | **16** | **14** | **4** | **0** |

---

## Top 10 Priority Integrations (Ranked by Criticality)

| Rank | Database | Category | Priority | Status | Rationale |
|------|----------|----------|----------|--------|-----------|
| 1 | **RxNorm (NLM)** | Drug | Critical | Needs integration | Universal drug vocabulary; essential for drug mapping and interoperability |
| 2 | **ClinPGx / PharmGKB** | PGx | Critical | Needs integration | Gold standard PGx knowledge base; CPIC guidelines integration |
| 3 | **FAERS / AEMS** | Adverse Events | Critical | Needs integration | FDA adverse events; powering `medication_interactions.py` |
| 4 | **OnSIDES** | Adverse Events | Critical | New | NLP-extracted on-label ADEs from FDA labels; 7M+ drug-ADE pairs |
| 5 | **PharmCAT** | PGx | Critical | New | Clinical annotation tool for PGx diplotype analysis |
| 6 | **SNOMED CT** | Medical Coding | Critical | Needs integration | Most comprehensive clinical terminology |
| 7 | **UMLS Metathesaurus** | Medical Coding | Critical | Needs integration | Master terminology integration hub containing RxNorm, SNOMED CT, LOINC |
| 8 | **PubChem** | Drug | Critical | Needs integration | Chemical structure data, bioactivity; 110M+ compounds |
| 9 | **PharmVar** | PGx | High | New | CYP450 allele nomenclature; star allele definitions |
| 10 | **NDC Directory** | Drug | High | Needs integration | FDA drug product identifiers; complements DrugBank |

---

# PART 1: DRUG DATABASES

---

## 1.1 RxNorm (NLM)

- **URL**: https://www.nlm.nih.gov/research/umls/rxnorm/index.html  
  API: https://rxnav.nlm.nih.gov/RxNormAPIs.html  
  Download: https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html
- **License**: Free (UMLS license required for full download; free academic use)
- **Size**: ~150 MB compressed (monthly release); Prescribable Content subset smaller
- **Format**: RRF (Rich Release Format), XML, REST API, MySQL/Oracle scripts
- **Update frequency**: Monthly
- **Key fields**: RXCUI (concept unique identifier), drug name, SAB (source abbreviation), TTY (term type), ATC codes, NDC mapping, strength, dose form, brand/generic links
- **Integration recommendation**: Build `rxnorm_client.py` to map between drug vocabularies. Use RxNorm API for real-time drug name resolution. Download monthly full release for offline matching. Critical for normalizing drug names across all platform modules.
- **Priority**: **CRITICAL**
- **Status**: Needs integration
- **Notes**: Current Prescribable Content subset requires no license. Part of UMLS Metathesaurus. Links NDC, DrugBank, ATC, and other drug vocabularies.

---

## 1.2 ATC (Anatomical Therapeutic Chemical) Classification

- **URL**: https://atcddd.fhi.no/atc_ddd_index_and_guidelines/atc_ddd_index/  
  Download portal: https://www.whocc.no/atc_ddd_index_and_guidelines/atc_ddd_index/
- **License**: Free for non-commercial use; WHO Collaborating Centre
- **Size**: ~5-10 MB (Excel/XML)
- **Format**: Excel, XML, flat files
- **Update frequency**: Annual (updated in January/February)
- **Key fields**: ATC code (5-level hierarchy), substance name, DDD (Defined Daily Dose), unit, administration route, ATC1-ATC5 hierarchy
- **Integration recommendation**: Add ATC code resolution to `medication_analyzer.py` for drug classification. Use for therapeutic class-based analysis and DDD calculations. Map from RxNorm ATC links.
- **Priority**: **HIGH**
- **Status**: Needs integration
- **Notes**: Published by WHO Collaborating Centre in Oslo. New ATC/DDD alterations published Nov/Dec. Access via ordering portal with free registration.

---

## 1.3 NDC (National Drug Code) Directory

- **URL**: https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory  
  OpenFDA API: https://api.fda.gov/drug/ndc.json  
  Download: https://www.fda.gov/drugs/drug-approvals-and-databases/national-drug-code-directory
- **License**: Free (US Government work / Open Data)
- **Size**: ~50-100 MB (full directory with all fields)
- **Format**: JSON (API), CSV/Excel (bulk download), XML (SPL)
- **Update frequency**: Daily (updated continuously)
- **Key fields**: NDC (10/11-digit), product ID, package code, proprietary name, non-proprietary name, substance name, strength, dosage form, labeler name, marketing category (NDA/ANDA/OTC), DEA schedule, product type, packaging info
- **Integration recommendation**: Extend `openfda_client.py` to query NDC data. Build NDC-to-RxNorm crosswalk for drug identification. Use for package-level drug product identification.
- **Priority**: **HIGH**
- **Status**: Needs integration (complements existing OpenFDA client)
- **Notes**: The `openfda_client.py` already queries OpenFDA. NDC bulk download files available as zip (text or Excel). Part of openFDA drug dataset.

---

## 1.4 DrugBank

- **URL**: https://go.drugbank.com/  
  Downloads: https://go.drugbank.com/releases/latest  
  Open Data: https://go.drugbank.com/releases/latest#open-data
- **License**: Academic: Free (CC BY-NC 4.0); Commercial: Paid; Open Data: CC0 (public domain)
- **Size**: Full XML ~150-200 MB; Open Data CSV ~1-5 MB
- **Format**: XML (full), CSV, SDF (structures), FASTA (sequences), JSON
- **Update frequency**: Monthly (new releases)
- **Key fields**: DrugBank ID, drug name, description, synonyms, classification (CAS, ATC), groups (approved/experimental/illicit/etc), structure (SMILES/InChI), targets/enzymes/transporters/carriers, drug interactions, pharmacodynamics, mechanism of action, pharmacokinetics (absorption/distribution/metabolism/excretion), indications, dosages, food interactions
- **Integration recommendation**: The existing `drugbank_integration.py` (1,365 lines) already handles DrugBank XML integration. Verify it supports version 5.1.20+ schema. Extend to use DrugBank API for real-time queries. Monitor academic download status (temporarily paused as of 2025).
- **Priority**: **HIGH**
- **Status**: Already exists (verify/update)
- **Notes**: **As of 2025, all Academic downloads are temporarily paused** while DrugBank updates distribution. Open Data sets (vocabulary, structures) remain available via CC0 license. Version 5.1.20 is current (May 2026). Contains 15,000+ drug entries including 1,500+ FDA-approved small molecule drugs.

---

## 1.5 SIDER (Side Effect Resource)

- **URL**: http://sideeffects.embl.de/  
  Download: http://sideeffects.embl.de/download/  
  GitHub: https://github.com/dhimmel/SIDER4
- **License**: CC BY-NC-SA 4.0 (non-commercial); commercial licensing via biobyte solutions GmbH
- **Size**: ~50 MB total (all files); meddra_all_se.tsv.gz is 2.3 MB
- **Format**: TSV, text (tab-separated values)
- **Update frequency**: Irregular (last release: SIDER 4.1, October 2015; newer versions tied to STITCH releases)
- **Key fields**: STITCH compound ID, PubChem CID, drug name, side effect name (MedDRA), UMLS CUI, frequency (when available), indication flags, placebo comparison data
- **Integration recommendation**: Build `sides_client.py` to extract drug-side effect relationships. Feed into `medication_analyzer.py` for adverse event prediction. Cross-reference with OnSIDES and FAERS for comprehensive ADE coverage.
- **Priority**: **MEDIUM**
- **Status**: New
- **Notes**: SIDER 4.1 contains data on 1,430 drugs, 5,880 ADRs, and ~140,064 drug-ADR pairs. May be superseded by OnSIDES for modern data but still valuable as a benchmark/source.

---

## 1.6 OnSIDES (On-label Side Effect Resource)

- **URL**: https://onsidesdb.org/  
  GitHub: https://github.com/tatonetti-lab/onsides  
  Download: https://onsidesdb.org/download
- **License**: Free for academic research (data available as flat files)
- **Size**: ~500 MB (full database); 7.1M+ drug-ADE pairs for 4,097 ingredients
- **Format**: CSV (flat files), SQL (DDL provided), SQLite (pre-built)
- **Update frequency**: Quarterly
- **Key fields**: Drug product, ingredients (mapped to RxNorm), adverse reactions (MedDRA LLT), boxed warnings, warnings/precautions, section source (AR/BW/WP), confidence scores from PubMedBERT
- **Integration recommendation**: Create `onsides_client.py` module. Primary source for on-label adverse drug events. Integrate with `medication_analyzer.py` to provide evidence-based side effect profiles. Quarterly update pipeline with Snakemake.
- **Priority**: **CRITICAL**
- **Status**: New
- **Notes**: Extracts ADEs from FDA Structured Product Labels using fine-tuned PubMedBERT (F1=0.90, AUROC=0.92). Also provides OnSIDES-INTL (UK/EU/Japan), OnSIDES-PED (pediatric-specific), and OffSIDES/TWOSIDES. Quarterly releases. Directly supersedes and surpasses SIDER in coverage.

---

## 1.7 OffSIDES & TwoSIDES

- **URL**: https://nsides.io/  
  GitHub: https://github.com/tatonetti-lab/offsides  
  Data: https://tatonettilab.org/offsides/
- **License**: Free for academic use
- **Size**: OFFSIDES.csv.gz ~100 MB; TWOSIDES.csv.gz ~500 MB
- **Format**: CSV (compressed), MySQL database dump
- **Update frequency**: Quarterly (planned; was outdated but being updated)
- **Key fields**: (OffSIDES) drug_rxnorm_id, drug_concept_name, condition_meddra_id, condition_concept_name, A/B/C/D counts, PRR, PRR_error, mean_reporting_frequency; (TwoSIDES) drug1_concept_id, drug2_concept_id, condition_meddra_id, PRR, PRR_error
- **Integration recommendation**: Build `offsides_twosides_client.py` for off-label ADE and DDI data. Use propensity-score matched FAERS data for statistical signal detection. Integrate with `medication_interactions.py` for polypharmacy side effect prediction.
- **Priority**: **HIGH**
- **Status**: New
- **Notes**: OffSIDES: 438,801 off-label side effects for 1,332 drugs / 10,097 adverse events. TwoSIDES: 868,221 drug-drug interaction associations for 59,220 drug pairs and 1,301 adverse events. Data from FAERS with SCRUB/LSD confounding correction methods.

---

## 1.8 PubChem

- **URL**: https://pubchem.ncbi.nlm.nih.gov/  
  FTP: https://ftp.ncbi.nlm.nih.gov/pubchem  
  API: https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest
- **License**: Free / US Government public domain (most data); some source-specific licenses
- **Size**: Bulk: ~100+ GB (compound directory); individual queries via API
- **Format**: JSON (API), CSV, XML, SDF, ASN.1, RDF, VCF
- **Update frequency**: Daily (incremental); full dumps periodically
- **Key fields**: CID (compound ID), SID (substance ID), IUPAC name, molecular formula, SMILES, InChI/InChIKey, structure (2D/3D), bioassay data, pharmacological data, drug classification (MeSH), cross-references (DrugBank, ChEBI, ATC), safety/toxicology, computed properties (MW, LogP, TPSA)
- **Integration recommendation**: Create `pubchem_client.py` for chemical structure lookups and cross-references. Use PUG-REST API for batch queries. Download FTP bulk data for local compound matching. Critical for chemical identity resolution.
- **Priority**: **CRITICAL**
- **Status**: Needs integration
- **Notes**: Contains 110M+ chemical substances. Provides programmatic access via PUG-REST, E-Utilities, PUG-SOAP, PUG-View. BioAssay database links compounds to biological activities. Power User Gateway for batch operations.

---

## 1.9 ChEBI (Chemical Entities of Biological Interest)

- **URL**: https://www.ebi.ac.uk/chebi/  
  Downloads: https://www.ebi.ac.uk/chebi/downloads
- **License**: Open data (Creative Commons Attribution 4.0); freely available
- **Size**: ~100-200 MB (full database dump); ~195,000+ entries
- **Format**: OBO, OWL, SDF, flat file (TSV), JSON, PostgreSQL dump
- **Update frequency**: Monthly releases
- **Key fields**: ChEBI ID, name, definition, synonyms, ontology (is_a, has_role, has_part), cross-references (PubChem, DrugBank, KEGG, CAS registry), chemical structure (SMILES, InChI), formula, charge, mass, charge status
- **Integration recommendation**: Build `chebi_client.py` for ontology-based chemical classification. Use for drug classification and role-based queries. ChEBI ontology useful for reasoning about drug mechanisms.
- **Priority**: **MEDIUM**
- **Status**: New
- **Notes**: Focus on "small" chemical compounds used in biological processes. Endorsed by IUPAC and NC-IUBMB. Well-structured ontology enables class-based queries (e.g., "find all beta blockers").

---

## 1.10 WHODrug Global

- **URL**: https://who-umc.org/whodrug/  
  Download: https://who-umc.org/whodrug/whodrug-global/applications/download-area/
- **License**: Paid subscription (commercial); academic pricing available
- **Size**: ~1-2 GB per release
- **Format**: C3 format, B3 format, ISO IDMP compliant data
- **Update frequency**: Biannual (March 1 and September 1)
- **Key fields**: Drug name (medicinal product), active ingredient, ATC code, Drug Code, Record ID, anatomical/therapeutic classification, ATC assignment, umbrellla records, country-specific data
- **Integration recommendation**: If subscription obtained, build `whodrug_client.py` for clinical trial drug coding and safety reporting. Cross-reference with MedDRA and ATC.
- **Priority**: **LOW** (paid, optional)
- **Status**: New
- **Notes**: International reference for medicinal product information. Used primarily in clinical trials and pharmacovigilance. Subscription required. Not essential if RxNorm + ATC + NDC are available.

---

## 1.11 DailyMed (NIH/NLM)

- **URL**: https://dailymed.nlm.nih.gov/  
  Download: https://dailymed.nlm.nih.gov/dailymed/spl/resources.cfm
- **License**: Free (US Government)
- **Size**: All SPL archives ~50 GB; individual labels ~1-10 MB
- **Format**: XML (HL7 SPL - Structured Product Labeling), zip archives
- **Update frequency**: Daily (new labels added continuously)
- **Key fields**: SPL document, set ID, version number, drug name, active ingredients, sections (adverse reactions, warnings, precautions, drug interactions, pharmacokinetics), boxed warnings, dosage/administration, pregnancy category
- **Integration recommendation**: OnSIDES already processes DailyMed labels. Use as raw source for custom NLP extraction of drug label information. Build `dailymed_client.py` for label retrieval.
- **Priority**: **MEDIUM**
- **Status**: New
- **Notes**: Source of FDA Structured Product Labels (SPL). Contains 47,000+ labels as of 2024. XML format with standard HL7 structure. OnSIDES already extracts ADEs from these labels.

---

# PART 2: PHARMACOGENOMICS DATABASES

---

## 2.1 ClinPGx (Clinical Pharmacogenetics) / PharmGKB

- **URL**: https://www.clinpgx.org/  
  Downloads: https://www.clinpgx.org/downloads  
  API: Available via ClinPGx
- **License**: CC BY-SA 4.0 (Creative Commons Attribution-ShareAlike 4.0)
- **Size**: Clinical Annotations ~1.2 MB (compressed); Full data varies
- **Format**: TSV, VCF, JSON, CSV, XML
- **Update frequency**: Continuous (weekly to monthly updates)
- **Key fields**: Gene symbol, drug name, variant (rsID/HGVS), star allele, clinical annotation level (1A/1B/2A/2B/3/4), phenotype (e.g., poor metabolizer), CPIC guideline recommendation, dosing guidance, evidence level, literature citations, allele frequency data
- **Integration recommendation**: Create `clinpgx_client.py` to query PGx annotations. Link with existing `pharmacogenomics_panel.py` to enhance CYP2D6, CYP2C19, BDNF, COMT, MTHFR analysis. Download clinical annotations for offline lookup. Primary data source for PGx knowledge.
- **Priority**: **CRITICAL**
- **Status**: Needs integration
- **Notes**: ClinPGx integrates PharmGKB + CPIC + PharmCAT. PharmGKB is managed at Stanford (NIH U24HG010615). 1,000,000+ monthly page views. 164 drugs covered in CPIC guidelines across 34 genes. Data now available in OpenTargets. Formerly "PharmGKB" -- rebranded to ClinPGx.

---

## 2.2 CPIC (Clinical Pharmacogenetics Implementation Consortium) Guidelines

- **URL**: https://cpicpgx.org/  
  Genes-Drugs: https://cpicpgx.org/genes-drugs/  
  API: https://api.cpicpgx.org/v1/ (80,000+ monthly queries)
- **License**: Creative Commons Public Domain (CC0); attribution requested
- **Size**: Guidelines ~PDF format; API returns JSON
- **Format**: PDF (guidelines), HTML, JSON (API), TSV (tables)
- **Update frequency**: Monthly teleconferences; guideline updates regularly
- **Key fields**: Gene, drug pairs, allele function assignment, phenotype (metabolizer status), therapeutic recommendations (e.g., "avoid citalopram in CYP2C19 PMs"), strength of recommendation, evidence level, dosing table
- **Integration recommendation**: Build `cpic_guidelines_client.py` to query prescribing recommendations. Use CPIC API for real-time guideline lookup. Download gene-drug pair tables for offline use. Essential for `pharmacogenomics_panel.py` to provide actionable dosing guidance.
- **Priority**: **CRITICAL**
- **Status**: Needs integration
- **Notes**: 28 active guidelines covering 34 genes and 164 drugs. Endorsed by ASHP, ASCPT, CAP. Integrated into Epic EHR. #2 cited article: CYP2D6, OPRM1, COMT + Opioids. API supports 80,000+ monthly queries.

---

## 2.3 PharmVar (Pharmacogene Variation Consortium)

- **URL**: https://www.pharmvar.org/  
  Downloads: https://www.pharmvar.org/download  
  API: https://www.pharmvar.org/resources/api-services
- **License**: Free for academic research; terms and conditions apply
- **Size**: Full database ~50-100 MB; per-gene downloads smaller
- **Format**: FASTA, VCF, TSV, JSON
- **Update frequency**: Regular (versioned releases)
- **Key fields**: Gene name, haplotype/star allele identifier, variant positions (HGVS), reference sequence (RefSeqGene/LRG), functional annotation, PharmVar version, population frequency, cross-references (dbSNP, ClinVar, PharmGKB)
- **Integration recommendation**: Build `pharmvar_client.py` for star allele definitions. Use for CYP450 allele nomenclature in `pharmacogenomics_panel.py`. Download CYP2D6, CYP2C19, CYP2C9, CYP3A4/5 allele definitions.
- **Priority**: **HIGH**
- **Status**: New
- **Notes**: Central repository for pharmacogene variation. Focus on haplotype structure and allelic variation. Synchronizes with PharmGKB and CPIC. Contains allele definitions for all major pharmacogenes. Version 6.1.3 used in BCyrius validation study.

---

## 2.4 ClinVar

- **URL**: https://www.ncbi.nlm.nih.gov/clinvar/  
  Downloads: https://www.ncbi.nlm.nih.gov/clinvar/docs/downloads/
- **License**: Free (US Government / NIH)
- **Size**: XML files ~5-10 GB; VCF ~2-3 GB; TSV summary files ~500 MB
- **Format**: XML (VCV/RCV), VCF (GRCh37/GRCh38), TSV, JSON (via E-utilities)
- **Update frequency**: Weekly (monthly archived releases)
- **Key fields**: Variant ID (VCV/RCV), HGVS expression, gene, clinical significance (pathogenic/likely pathogenic/benign/VUS), review status, star rating, conditions (MedGen/OMIM), submitter, pharmacogenomic assertion, allele frequencies, citations
- **Integration recommendation**: Create `clinvar_pgx_client.py` to extract pharmacogenomic variants. Filter for PGx genes (CYP2D6, CYP2C19, etc.). Use VCF files for variant annotation. Cross-reference with PharmGKB clinical annotations.
- **Priority**: **HIGH**
- **Status**: Needs integration
- **Notes**: Freely available at NIH. XML and VCF formats updated weekly. Supports VCV (variant-centric) and RCV (variant-condition pair) accessions. ~74,531 CNV entries in browser tracks. Contains pharmacogenomic variant interpretations from clinical testing labs.

---

## 2.5 dbSNP (Build 157)

- **URL**: https://www.ncbi.nlm.nih.gov/snp/  
  FTP: https://ftp.ncbi.nlm.nih.gov/snp/  
  API: NCBI E-utilities / Variation Service
- **License**: Free (US Government / NIH public domain)
- **Size**: Build 157: 1.17 billion RS records; FTP downloads in VCF/JSON
- **Format**: VCF, JSON, XML, ASN.1
- **Update frequency**: Periodic builds (Build 157 released March 2025)
- **Key fields**: rsID (Reference SNP), HGVS, genomic position (GRCh37/GRCh38), allele frequencies (1000Genomes, TOPMed, gnomAD, ALFA), clinical significance, gene association, submitter handles, validation status
- **Integration recommendation**: Build `dbsnp_client.py` for variant lookup by rsID. Use as reference for PGx variant positions and allele frequencies. Essential for translating between variant identifiers.
- **Priority**: **HIGH**
- **Status**: New
- **Notes**: Build 157 (March 2025): 1,172,689,405 live RS records. Includes expanded allele frequency data from 1000Genomes, TOPMed, gnomAD, NCBI ALFA release 3. Available via FTP, API, and web search.

---

## 2.6 PharmCAT (Pharmacogenomics Clinical Annotation Tool)

- **URL**: https://pharmcat.clinpgx.org/  
  GitHub: https://github.com/PharmGKB/PharmCAT  
  DockerHub: Available
- **License**: Mozilla Public License 2.0 (MPL-2.0) -- Open Source
- **Size**: Software package; reference data ~100-500 MB
- **Format**: VCF (input), JSON/HTML (output report), TSV
- **Update frequency**: Regular releases (v3.2.0 current as of 2025)
- **Key fields**: (Input) VCF with pharmacogene variants; (Output) diplotype calls, star alleles, phenotype predictions (metabolizer status), CPIC prescribing recommendations, DPWG guideline annotations, FDA label annotations
- **Integration recommendation**: Deploy PharmCAT as a microservice (Docker container) in DeepSynaps. Process VCF outputs from sequencing pipelines. Integrate results with `pharmacogenomics_panel.py` for clinical reporting. Generate HTML/JSON reports for EHR integration.
- **Priority**: **CRITICAL**
- **Status**: New
- **Notes**: Developed by PharmGKB/ClinPGx + PGRN. Version 2.12.0 validated for pediatric oncology (100% sensitivity/specificity for CYP3A5, CYP2C9, CYP2C19, TPMT, NUDT15, DPYD, UGT1A1). Supports CYP2D6 via external tool integration (e.g., Cyrius/BCyrius). Provides CPIC + DPWG + FDA label annotations. FAIR principles compliant.

---

## 2.7 Stargazer

- **URL**: https://stargazer.gs.washington.edu/stargazerweb/  
  GitHub: Available  
  Documentation: https://stargazer.gs.washington.edu/stargazerweb/res/documentation.html
- **License**: Open source (academic)
- **Size**: Software package ~50-100 MB
- **Format**: Input: BAM/CRAM + VCF; Output: HTML, TXT, GDF
- **Update frequency**: Periodic updates (v2.0 documented)
- **Key fields**: (Input) NGS data; (Output) star allele calls, copy number variants, structural variants (deletions/duplications/conversions), genotype data file (GDF), diplotype, phenotype
- **Integration recommendation**: Integrate Stargazer for CYP2D6 and other pharmacogene genotyping from NGS data. Use as upstream of PharmCAT -- Stargazer calls diplotypes, PharmCAT provides recommendations. Supports SNP array and NGS data.
- **Priority**: **HIGH**
- **Status**: New
- **Notes**: 99.0% concordant with orthogonal methods (TaqMan, Sanger, etc.). Detects structural variation (gene deletions, duplications, CYP2D6/CYP2D7 conversions). 28.1% of samples showed structural variation. Output in GDF format for downstream analysis.

---

## 2.8 Cyrius / BCyrius (CYP2D6 Caller)

- **URL**: https://github.com/Illumina/Cyrius (Cyrius)  
  BCyrius: Available via academic distribution
- **License**: Open source (Cyrius); Academic (BCyrius)
- **Size**: Software package ~10-50 MB
- **Format**: Input: BAM/CRAM (WGS); Output: JSON/TSV with genotype calls
- **Update frequency**: Cyrius: infrequently updated; BCyrius: actively maintained
- **Key fields**: CYP2D6 star alleles, copy number, structural variants, predicted phenotype (UM/NM/IM/PM), population frequency info, confidence scores
- **Integration recommendation**: Use BCyrius as the primary CYP2D6 genotyping tool. Feed diplotype output into PharmCAT for phenotype translation and dosing recommendations. Handles complex structural variation.
- **Priority**: **HIGH**
- **Status**: New
- **Notes**: Cyrius integrated into Illumina DRAGEN Bio-IT Platform (v3.7+). BCyrius upgrade: 100% identification of currently defined minor star alleles vs 85.6% for original Cyrius. Outperforms Aldy (92.2%) and StellarPGx (87.8%) on simulated data. Uses PharmVar v6.1.3 for allele definitions.

---

## 2.9 gnomAD (Genome Aggregation Database)

- **URL**: https://gnomad.broadinstitute.org/  
  Downloads: https://gnomad.broadinstitute.org/data
- **License**: Open data (free to use without restrictions)
- **Size**: v2.1.1: ~200 GB (all data); gene-specific subset much smaller
- **Format**: VCF, Hail Table, TSV, JSON (API)
- **Update frequency**: Major releases periodically (v4 available)
- **Key fields**: Variant position (GRCh37/GRCh38), allele count/frequency by population (AFR/AMR/EAS/EUR/SAS), functional annotation (VEP), constraint metrics (pLI, LOEUF), quality metrics
- **Integration recommendation**: Build `gnomad_client.py` to query allele frequencies for PGx variants. Use for population-specific allele frequency filtering. Cross-reference with ClinVar and PharmGKB variant annotations.
- **Priority**: **HIGH**
- **Status**: New
- **Notes**: v2.1: 125,748 exome + 15,708 genome sequences. Subsets available: Non-cancer, Non-neuro, Non-TOPMed, Controls-only. Provides sub-continental population allele frequencies. Critical for population-specific PGx analysis.

---

## 2.10 PharmFreq

- **URL**: Available as interactive dashboard  
  Publication: https://pubmed.ncbi.nlm.nih.gov/39505639/
- **License**: Free (data available for download via dashboard)
- **Size**: Database of 658 alleles from >10 million individuals across 144 countries
- **Format**: R Shiny dashboard; tab-delimited text files (downloadable)
- **Update frequency**: As of publication (June 2024 data)
- **Key fields**: Pharmacogene, allele, frequency by country/geographic group, population, cohort size, functional status, drug associations, CPIC guideline links, metabolizer status distribution
- **Integration recommendation**: Use PharmFreq as reference data for population-specific allele frequency expectations. Download aggregated data for offline lookup. Valuable for interpreting PGx test results in diverse populations.
- **Priority**: **MEDIUM**
- **Status**: New
- **Notes**: Integrates data from >1,200 studies. Covers 21 CPIC Level A pharmacogenes, 658 alleles, 150 gene-drug pairs. Tools: High-risk genotype frequency, frequency comparison, intra-biogeographic variability, country data, metabolizer status calculation.

---

# PART 3: ADVERSE EVENTS DATABASES

---

## 3.1 FAERS / AEMS (FDA Adverse Event Reporting System / Adverse Event Monitoring System)

- **URL**: https://www.fda.gov/drugs/surveillance/fda-adverse-event-monitoring-system-aems  
  Public Dashboard: https://www.fda.gov/drugs/drug-approvals-and-databases/fda-adverse-event-reporting-system-faers-public-dashboard  
  Data Downloads: https://fis.fda.gov/extensions/FPD-QDE-FAERS/FPD-QDE-FAERS.html
- **License**: Free (US Government / Open Data)
- **Size**: Quarterly ASCII/SGML files ~100-500 MB each; cumulative multi-GB
- **Format**: ASCII (flat files), SGML/XML, JSON (via openFDA API)
- **Update frequency**: Quarterly data file releases; real-time via API
- **Key fields**: Primary ID, case ID, drug name (trade/generic), indication, adverse event (MedDRA PT), event date, reporter type (consumer/health professional), patient age/sex, drug characterisation (suspect/concomitant/interacting), outcome (death/disability/hospitalization), report source
- **Integration recommendation**: Extend `openfda_client.py` to query FAERS data via openFDA API. Download quarterly bulk files for offline signal detection analysis. Core data source for `medication_interactions.py` and adverse event monitoring.
- **Priority**: **CRITICAL**
- **Status**: Needs integration
- **Notes**: FDA transitioning FAERS to AEMS (unified platform for all FDA-regulated products). Quarterly data files available in ASCII/SGML since 2004. Contains 20M+ adverse event reports. MedDRA-coded. ICH E2B compliant. Public Dashboard launched 2025 for real-time queries.

---

## 3.2 WHO VigiBase

- **URL**: https://who-umc.org/vigibase/  
  VigiAccess (public): https://www.vigiaccess.org/  
  Data access: https://who-umc.org/vigibase-data-access/
- **License**: VigiAccess: Free (public); VigiBase Extract: Paid subscription; Academic accommodations available
- **Size**: World's largest pharmacovigilance database (30M+ reports); Extract size varies by license
- **Format**: Custom (WHODrug + MedDRA coded); VigiAccess: web/API
- **Update frequency**: Continuous
- **Key fields**: ICSRs (Individual Case Safety Reports), drug information (WHODrug coded), reactions (MedDRA coded), demographics, reporter info, outcome, seriousness criteria, causality assessment, country/region
- **Integration recommendation**: Use VigiAccess API for high-level signal queries. If academic license obtained, use VigiBase Extract for research. Integrate with FAERS for global pharmacovigilance coverage.
- **Priority**: **HIGH**
- **Status**: New
- **Notes**: Maintained by Uppsala Monitoring Centre (UMC). 99% world population coverage from national pharmacovigilance centres. 18% data from low/middle-income countries. Analysis tools: VigiLyze, vigiMatch, vigiGrade, vigiRank. R package `vigicaen` available for analysis.

---

## 3.3 MedWatch

- **URL**: https://www.fda.gov/safety/medwatch-fda-safety-information-and-adverse-event-reporting-program  
  Forms: https://www.fda.gov/safety/medical-product-safety-information/medwatch-forms-fda-safety-reporting
- **License**: Free (US Government)
- **Size**: N/A (reporting system, not a downloadable database)
- **Format**: Online forms (3500, 3500A, 3500B), XML (E2B electronic submissions), PDF
- **Update frequency**: Real-time (reports submitted continuously)
- **Key fields**: Patient demographics, suspect product, adverse event, reporter info, outcome, medical history, concomitant medications, lab results, dechallenge/rechallenge info
- **Integration recommendation**: Not a data source per se but the reporting channel. Build MedWatch-compatible reporting capability in DeepSynaps for adverse event submission. Use FAERS data (which feeds from MedWatch) for analysis.
- **Priority**: **LOW** (reporting channel, not database)
- **Status**: New (reporting integration)
- **Notes**: Voluntary reporting (Form 3500/3500B for consumers/health professionals). Mandatory reporting (Form 3500A for industry). ~90% of reports via ICH E2B electronic standard. Est. 40 min average per report. Data flows into FAERS/AEMS.

---

## 3.4 VigiAccess (WHO Public Portal)

- **URL**: https://www.vigiaccess.org/
- **License**: Free public access
- **Size**: Summary-level data from VigiBase
- **Format**: Web interface, API
- **Update frequency**: Regular updates from VigiBase
- **Key fields**: Drug adverse event summaries by active ingredient, country, age group, sex, reporter type, year, MedDRA SOC/PT counts
- **Integration recommendation**: Build `vigiaccess_client.py` for public pharmacovigilance queries. Use for signal validation against global data.
- **Priority**: **MEDIUM**
- **Status**: New

---

## 3.5 AwareDX (Sex-Specific Adverse Drug Effects)

- **URL**: https://nsides.io/ (under AwareDX section)  
  Data: Available via download links  
  GitHub: sex_risks repository
- **License**: Free for academic research
- **Size**: 20,817 adverse drug effects with sex-specific risks
- **Format**: CSV/flat files
- **Update frequency**: As part of nSIDES quarterly updates
- **Key fields**: Drug, adverse event, sex risk differential (male vs female), ML-adjusted risk ratio, pharmacogenetic validation genes
- **Integration recommendation**: Integrate for sex-aware adverse event prediction. Use in `medication_analyzer.py` to flag sex-specific risks.
- **Priority**: **MEDIUM**
- **Status**: New
- **Notes**: Machine learning algorithm (SCRUB-based) mitigates confounding. Validated against known sex-differentially expressed pharmacogenes. Women experience 2x ADR risk -- this resource quantifies differential risk.

---

# PART 4: MEDICAL CODING DATABASES

---

## 4.1 SNOMED CT

- **URL**: https://www.nlm.nih.gov/healthit/snomedct/index.html  
  Download: https://www.nlm.nih.gov/healthit/snomedct/us_edition.html  
  International: https://www.snomed.org/
- **License**: Free (via NLM/UMLS for US users); SNOMED International member countries free; otherwise fees may apply
- **Size**: US Edition: ~300,000+ active concepts; Full: ~500 MB - 1 GB
- **Format**: RF2 (Release Format 2), OWL, XML, tab-delimited files
- **Update frequency**: International: Jan/July; US Edition: Sept + updates
- **Key fields**: Concept ID (SCTID), Fully Specified Name (FSN), preferred term, synonyms, parent/child relationships (IS A), attribute relationships, reference sets, subsets, maps to ICD-10/ICD-9
- **Integration recommendation**: Build `snomed_client.py` for clinical concept resolution. Use for disease/condition terminology. Enable cross-mapping between ICD-10, LOINC, and RxNorm via UMLS. September 2025 US Edition: 328 new active concepts.
- **Priority**: **CRITICAL**
- **Status**: Needs integration
- **Notes**: Most comprehensive clinical terminology. FSN character limit increasing to 4096 chars (July 2026). Available via UMLS Metathesaurus. Download requires UMLS Terminology Services account. Pharmaceutical/biologic product hierarchy driving changes.

---

## 4.2 LOINC (Logical Observation Identifiers Names and Codes)

- **URL**: https://loinc.org/  
  Download: https://loinc.org/downloads/  
  Search: https://loinc.org/search/
- **License**: Free (registration required)
- **Size**: ~100,000+ codes; ~50-100 MB
- **Format**: CSV, Access database, HL7 FHIR, API
- **Update frequency**: Biannual releases (June/December)
- **Key fields**: LOINC code, component, property, time aspect, system, scale type, method, short name, long common name, status, class, units, related names
- **Integration recommendation**: Build `loinc_client.py` for laboratory and clinical observation coding. Use for mapping lab results (e.g., drug levels, genetic tests) to standard codes. Enable FHIR-compatible observation reporting.
- **Priority**: **HIGH**
- **Status**: Needs integration
- **Notes**: Universal code system for clinical and laboratory observations. Regenstrief Institute. Free LOINC login required for search and download. LOINC-SNOMED CT collaboration provides ontology interoperability solution.

---

## 4.3 ICD-10-CM (International Classification of Diseases, 10th Revision, Clinical Modification)

- **URL**: https://www.cdc.gov/nchs/icd/icd-10-cm/index.html  
  Files: https://www.cdc.gov/nchs/icd/icd-10-cm/files.html  
  CMS: https://www.cms.gov/medicare/coding-billing/icd-10-codes
- **License**: Free (US Government)
- **Size**: ~100-200 KB (code files); full documentation ~10-20 MB
- **Format**: XML, PDF, Excel, tab-delimited text, zip archives
- **Update frequency**: Annual (fiscal year releases: October 1 and April 1 updates)
- **Key fields**: ICD-10-CM code (3-7 characters), code description, category, billable/non-billable indicator, POA (Present on Admission) exempt status, coding guidelines, effective date
- **Integration recommendation**: Build `icd10_client.py` for diagnosis coding. Download FY2026 files (current). Use for patient condition classification, medication indication mapping, and outcome tracking.
- **Priority**: **HIGH**
- **Status**: Needs integration
- **Notes**: FY2026 files available. Federal fiscal year runs Oct 1 - Sept 30. 2025 update: 252 new codes, 36 deletions, 13 revisions. CMS maintains separate ICD-10 files for Medicare reporting.

---

## 4.4 CPT (Current Procedural Terminology)

- **URL**: https://www.ama-assn.org/practice-management/cpt  
  Store: https://commerce.ama-assn.org/store/
- **License**: Paid (AMA copyright); Data file license available; CPT Assistant subscription also paid
- **Size**: 11,000+ codes; data file ~1-5 MB
- **Format**: Proprietary data files, PDF, XML, API
- **Update frequency**: Annual (January 1 effective date); quarterly updates for PLA codes
- **Key fields**: CPT code (5-digit numeric/modified), descriptor, category (I/II/III), section (E/M/surgery/radiology/lab/medicine), modifiers, relative value units (RVU), geographic practice cost index
- **Integration recommendation**: If AMA license obtained, build `cpt_client.py` for procedure coding. Use for billing and procedure tracking integration. Evaluate need vs. cost for DeepSynaps use cases.
- **Priority**: **MEDIUM** (paid, optional)
- **Status**: New (optional)
- **Notes**: AMA-authored and maintained. 2025 code set: 420 updates (270 new, 112 deleted, 38 revised). Proprietary laboratory analyses (PLA) codes added quarterly. CPT QuickRef app available. Copyright protected -- requires license for integration.

---

## 4.5 UMLS Metathesaurus

- **URL**: https://www.nlm.nih.gov/research/umls/index.html  
  Download: https://www.nlm.nih.gov/research/umls/licensedcontent/umlsknowledgesources.html  
  API: https://documentation.uts.nlm.nih.gov/rest/home.html
- **License**: Free (UMLS Metathesaurus License required; no charge from NLM)
- **Size**: Full: 5.4 GB compressed / 38 GB uncompressed; Level 0: 1.9 GB / 10.5 GB; MRCONSO.RRF: 492 MB / 2.2 GB
- **Format**: RRF (Rich Release Format), Oracle/MySQL scripts, precomputed subsets, JSON (API)
- **Update frequency**: Biannual (2025AA: May; 2025AB: November)
- **Key fields**: CUI (concept unique identifier), AUI (atom unique identifier), source vocabularies (200+), term strings, source-specific codes, semantic types, relations, mappings between vocabularies, history files
- **Integration recommendation**: Build `umls_client.py` as a terminology gateway. Use for cross-mapping between RxNorm, SNOMED CT, LOINC, ICD-10-CM, MedDRA, and other vocabularies. The UTS API enables real-time terminology queries. Precomputed subsets allow local deployment without MetamorphoSys.
- **Priority**: **CRITICAL**
- **Status**: Needs integration
- **Notes**: 2026AA released May 2026. Contains 200+ source vocabularies including RxNorm, SNOMED CT, LOINC, ICD-10-CM, MedDRA, MeSH, OMIM. Precomputed subsets now available (no installation needed). API key required for UTS access. Level 0 subset includes only unrestricted vocabularies.

---

## 4.6 MedDRA (Medical Dictionary for Regulatory Activities)

- **URL**: https://www.meddra.org/  
  Download: https://www.meddra.org/software-packages (requires subscription)  
  MSSO: https://www.mssoauth.com/
- **License**: Subscription required (fees apply); free for ICH regulatory authorities; academic pricing available
- **Size**: ~50-100 MB (full hierarchy files)
- **Format**: ASCII text files, API (JSON/XML), desktop browser (MDB), web-based browser (WBB)
- **Update frequency**: Biannual (March and September releases); English + 15+ language versions
- **Key fields**: MedDRA code (SOC/HLG/HLGT/PT/LLT hierarchy), term name, primary SOC, LLT/PT current status, code hierarchy, SMQ (Standardised MedDRA Query), version history
- **Integration recommendation**: Build `meddra_client.py` for adverse event coding. Essential for FAERS data interpretation and adverse event reporting. Use API if available via subscription. Lower priority if UMLS Metathesaurus (which includes MedDRA) is available.
- **Priority**: **MEDIUM** (included in UMLS; direct access via subscription)
- **Status**: Needs integration
- **Notes**: ICH standardized medical terminology. 5-level hierarchy (SOC > HLGT > HLT > PT > LLT). Used in FAERS, VigiBase, clinical trials for AE coding. Desktop Browser (MDB), Web-Based Browser (WBB), and Mobile App (MMA) available. API services: Data Impact Report, Hierarchy Analysis, Download, GetTop, History, etc.

---

## 4.7 WHO Drug Dictionary (WHODrug)

- **URL**: https://who-umc.org/whodrug/  
  Access: https://who-umc.org/whodrug/access-to-applications-services/
- **License**: Paid subscription (annual fee); different models for end users and vendors
- **Size**: ~1-2 GB per release
- **Format**: C3 format, B3 format, API (v3.0)
- **Update frequency**: Biannual (March and September)
- **Key fields**: Drug name, active ingredient, ATC code, record ID, medicinal product identifier (MPID), pharmaceutical product identifier (PhPID), ISO IDMP data, country-specific info
- **Integration recommendation**: If subscription obtained, use for clinical trial medication coding and cross-referencing with MedDRA. Optional -- RxNorm + NDC may provide sufficient coverage.
- **Priority**: **LOW** (paid, optional)
- **Status**: New (optional)
- **Notes**: International reference for medicinal product information. Used with MedDRA in pharmacovigilance and clinical trials. Download API v3.0 available. WHODrug Insight (35,000 daily searches). Customised Drug Groupings (CDGs) for standardized groupings.

---

# PART 5: INTEGRATION ARCHITECTURE RECOMMENDATIONS

---

## 5.1 Priority Integration Order

### Phase 1: Core Drug & Safety (Months 1-3)
1. **RxNorm** -- Drug vocabulary backbone
2. **ClinPGx / PharmGKB** -- PGx knowledge base
3. **FAERS / AEMS** -- Adverse event data (extend openfda_client.py)
4. **OnSIDES** -- On-label ADEs
5. **UMLS Metathesaurus** -- Terminology gateway

### Phase 2: PGx Clinical Tools (Months 2-4)
6. **PharmCAT** -- Clinical PGx annotation
7. **PharmVar** -- Allele nomenclature
8. **CPIC Guidelines** -- Prescribing recommendations
9. **ClinVar** -- Variant annotations

### Phase 3: Chemical & Reference (Months 3-5)
10. **PubChem** -- Chemical structures
11. **dbSNP** -- Variant lookup
12. **ChEBI** -- Chemical ontology
13. **NDC Directory** -- Drug product identifiers

### Phase 4: Medical Coding (Months 4-6)
14. **SNOMED CT** -- Clinical terminology
15. **LOINC** -- Lab observation codes
16. **ICD-10-CM** -- Diagnosis coding
17. **MedDRA** -- AE terminology

### Phase 5: Advanced & Optional (Months 5-8)
18. **OffSIDES / TwoSIDES** -- Off-label ADEs / DDIs
19. **Stargazer / Cyrius** -- NGS-based PGx genotyping
20. **gnomAD / PharmFreq** -- Population allele frequencies
21. **CPT** -- Procedure coding (if licensed)

## 5.2 New Modules to Create

| Module | Database(s) | Lines Est. | Purpose |
|--------|-------------|------------|---------|
| `rxnorm_client.py` | RxNorm API | 500-800 | Drug name normalization |
| `clinpgx_client.py` | ClinPGx / PharmGKB | 600-1000 | PGx annotations |
| `onsides_client.py` | OnSIDES | 400-600 | On-label ADE lookup |
| `pubchem_client.py` | PubChem API | 500-800 | Chemical structure queries |
| `faers_analyzer.py` | FAERS/AEMS | 800-1200 | Signal detection analysis |
| `clinvar_pgx_client.py` | ClinVar | 400-600 | PGx variant annotations |
| `snomed_client.py` | SNOMED CT | 500-800 | Clinical terminology |
| `loinc_client.py` | LOINC | 300-500 | Lab code lookup |
| `icd10_client.py` | ICD-10-CM | 300-500 | Diagnosis coding |
| `meddra_client.py` | MedDRA | 400-600 | AE terminology |
| `pharmcat_service.py` | PharmCAT (Docker) | 300-500 | PGx diplotype calling |
| `pharmvar_client.py` | PharmVar | 300-500 | Allele definitions |
| `dbsnp_client.py` | dbSNP | 300-500 | Variant lookup |
| `cpic_guidelines_client.py` | CPIC API | 400-600 | Prescribing guidance |

## 5.3 Existing Module Updates

| Module | Current Lines | Update Action |
|--------|--------------|---------------|
| `drugbank_integration.py` | 1,365 | Verify v5.1.20 schema compatibility; add API mode |
| `medication_analyzer.py` | 2,351 | Integrate RxNorm, OnSIDES, PubChem lookups |
| `medication_interactions.py` | 115 | Significantly expand with FAERS, OffSIDES, TwoSIDES |
| `pharmacogenomics_panel.py` | 758 | Integrate ClinPGx, CPIC, PharmCAT, ClinVar |
| `openfda_client.py` | 781 | Extend FAERS queries; add NDC, drug labeling |

---

# PART 6: LICENSE SUMMARY

---

| Database | License Type | Cost | Restriction |
|----------|-------------|------|-------------|
| RxNorm | Free (UMLS) | $0 | Academic/non-commercial |
| ATC | Free (WHO) | $0 | Non-commercial |
| NDC | Open Data | $0 | None (US Govt) |
| DrugBank | CC BY-NC / CC0 (Open Data) | $0 academic / Paid commercial | Academic downloads paused 2025 |
| SIDER | CC BY-NC-SA 4.0 | $0 | Non-commercial |
| OnSIDES | Academic Free | $0 | Research only |
| OffSIDES/TwoSIDES | Academic Free | $0 | Research only |
| PubChem | Public Domain | $0 | None (US Govt) |
| ChEBI | CC BY 4.0 | $0 | Attribution |
| WHODrug | Paid | $$$ | Subscription |
| DailyMed | Open Data | $0 | None (US Govt) |
| **ClinPGx / PharmGKB** | **CC BY-SA 4.0** | **$0** | **Attribution-ShareAlike** |
| CPIC | CC0 (Public Domain) | $0 | Attribution requested |
| PharmVar | Free Academic | $0 | Terms apply |
| ClinVar | Public Domain | $0 | None (US Govt) |
| dbSNP | Public Domain | $0 | None (US Govt) |
| PharmCAT | MPL 2.0 | $0 | Open Source |
| Stargazer | Open Source | $0 | Academic |
| Cyrius | Open Source | $0 | Academic |
| gnomAD | Open Data | $0 | None |
| PharmFreq | Free | $0 | Attribution |
| FAERS/AEMS | Open Data | $0 | None (US Govt) |
| VigiBase | Paid / Academic | $$ | Subscription; VigiAccess free |
| MedWatch | N/A | $0 | Reporting channel |
| SNOMED CT | Free (US via NLM) | $0 | UMLS account required |
| LOINC | Free | $0 | Registration required |
| ICD-10-CM | Open Data | $0 | None (US Govt) |
| CPT | Paid (AMA) | $$ | Copyright protected |
| UMLS | Free | $0 | License agreement |
| MedDRA | Subscription | $$ | MSSO license |
| WHODrug | Paid | $$$ | Subscription |

---

# PART 7: DATA QUALITY & UPDATE CONSIDERATIONS

---

| Database | Update Freq | Automated Download | API Available | Bulk Download |
|----------|------------|-------------------|---------------|---------------|
| RxNorm | Monthly | Yes (with UTS) | Yes (REST) | Yes (zip) |
| ATC | Annual | No | No | Yes (Excel/XML) |
| NDC | Daily | Yes | Yes (openFDA) | Yes (zip) |
| DrugBank | Monthly | Paused | Yes (REST) | Yes (paused) |
| PubChem | Daily | Yes (FTP) | Yes (PUG-REST) | Yes (FTP) |
| OnSIDES | Quarterly | Yes (GitHub) | Partial | Yes (CSV/SQL) |
| FAERS | Quarterly | Yes (FDA) | Yes (openFDA) | Yes (ASCII) |
| ClinPGx | Weekly | Yes | Yes | Yes (TSV) |
| CPIC | Continuous | No | Yes (REST) | Yes (TSV) |
| ClinVar | Weekly | Yes (FTP) | Yes (E-utilities) | Yes (VCF/XML) |
| dbSNP | Build-based | Yes (FTP) | Yes | Yes (VCF) |
| PharmCAT | Periodic | Yes (Docker) | No | Yes (GitHub) |
| SNOMED CT | Semi-annual | Yes (with UTS) | No | Yes (RF2) |
| LOINC | Biannual | No | Yes | Yes (CSV) |
| ICD-10-CM | Annual | Yes (CDC FTP) | No | Yes (zip) |
| UMLS | Biannual | Yes (with UTS) | Yes (UTS) | Yes (RRF) |

---

*Report compiled from web research conducted 2025. All URLs and licenses subject to change. Verify current status before integration.*
