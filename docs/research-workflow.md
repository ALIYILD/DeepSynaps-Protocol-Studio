# DeepSynaps Studio — Research Workflow Architecture

**Document version:** 1.0  
**System:** DeepSynaps Studio Master Clinical Database  
**Architecture type:** 10-Agent Sequential Pipeline with Parallel Verification Lanes  
**Baseline database:** 201 records / 9 tables

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Flow Diagram](#data-flow-diagram)
3. [Agent Specifications](#agent-specifications)
   - [Agent 1: INTAKE AGENT](#agent-1-intake-agent)
   - [Agent 2: SOURCE DISCOVERY AGENT](#agent-2-source-discovery-agent)
   - [Agent 3: EXTRACTION AGENT](#agent-3-extraction-agent)
   - [Agent 4: EVIDENCE GRADING AGENT](#agent-4-evidence-grading-agent)
   - [Agent 5: REGULATORY VERIFICATION AGENT](#agent-5-regulatory-verification-agent)
   - [Agent 6: NORMALIZATION AGENT](#agent-6-normalization-agent)
   - [Agent 7: CONFLICT CHECK AGENT](#agent-7-conflict-check-agent)
   - [Agent 8: SAFETY/GOVERNANCE AGENT](#agent-8-safetygovernance-agent)
   - [Agent 9: HUMAN REVIEW QUEUE](#agent-9-human-review-queue)
   - [Agent 10: PUBLISHING AGENT](#agent-10-publishing-agent)
4. [Error Handling & Rollback Procedures](#error-handling--rollback-procedures)
5. [Source Monitoring](#source-monitoring)
6. [Confidence Scoring Reference](#confidence-scoring-reference)
7. [Governance Rules Reference](#governance-rules-reference)

---

## Architecture Overview

The research workflow processes new clinical data — device discoveries, guideline publications, meta-analyses, adverse event reports — through a sequential 10-agent pipeline. Each agent has a defined input contract, output contract, and escalation path. Agents 4 and 5 run in parallel after Agent 3 completes. Agent 6 waits for both to finish. Agents with insufficient confidence scores route to the Human Review Queue (Agent 9) rather than proceeding automatically.

**Pipeline states:**

| State | Meaning |
|-------|---------|
| `PENDING` | Record entered queue, not yet processed |
| `IN_PROGRESS` | Actively being processed by an agent |
| `FLAGGED` | Routed to Human Review Queue |
| `APPROVED` | Cleared by all agents and/or human reviewer |
| `REJECTED` | Rejected at any stage; reason logged |
| `PUBLISHED` | Committed to live database |
| `ROLLED_BACK` | Published then reverted; reason and rollback timestamp logged |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DEEPSYNAPS RESEARCH PIPELINE                         │
│                                                                         │
│  EXTERNAL SOURCES                                                       │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │FDA 510k/│  │ PubMed / │  │EUDAMED / │  │ Clinical │  │ Adverse  │  │
│  │  PMA   │  │ Cochrane │  │TGA/PMDA  │  │Guidelines│  │  Events  │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       └────────────┴─────────────┴──────────────┴─────────────┘        │
│                                   │                                     │
│                                   ▼                                     │
│                    ┌──────────────────────────┐                         │
│                    │   [1] INTAKE AGENT       │                         │
│                    │   • Validate format      │                         │
│                    │   • Deduplicate          │                         │
│                    │   • Assign priority      │                         │
│                    │   • Route to pipeline    │                         │
│                    └──────────────┬───────────┘                         │
│                                   │                                     │
│                     ┌─────────────┴──────────────┐                     │
│                     │  DUPLICATE? → REJECT+LOG   │                     │
│                     │  FORMAT ERROR? → REJECT    │                     │
│                     └─────────────┬──────────────┘                     │
│                                   │ VALID                               │
│                                   ▼                                     │
│                    ┌──────────────────────────┐                         │
│                    │ [2] SOURCE DISCOVERY     │                         │
│                    │   • FDA databases        │                         │
│                    │   • PubMed/Cochrane      │                         │
│                    │   • EUDAMED/TGA/PMDA     │                         │
│                    │   • Guideline databases  │                         │
│                    └──────────────┬───────────┘                         │
│                                   │                                     │
│                     ┌─────────────┴──────────────┐                     │
│                     │ SOURCE CONF < 0.5? → FLAG  │                     │
│                     └─────────────┬──────────────┘                     │
│                                   │ SOURCE CONF ≥ 0.5                   │
│                                   ▼                                     │
│                    ┌──────────────────────────┐                         │
│                    │  [3] EXTRACTION AGENT    │                         │
│                    │   • Parse documents      │                         │
│                    │   • Structured fields    │                         │
│                    │   • Schema mapping       │                         │
│                    └──────────────┬───────────┘                         │
│                                   │                                     │
│               ┌───────────────────┴───────────────────┐                 │
│               │ PARALLEL VERIFICATION                 │                 │
│               ▼                                       ▼                 │
│  ┌────────────────────────┐         ┌─────────────────────────────┐    │
│  │ [4] EVIDENCE GRADING   │         │ [5] REGULATORY VERIFICATION │    │
│  │ • Map to EV-A–EV-D     │         │ • Cross-ref FDA databases   │    │
│  │ • Blinding assessment  │         │ • GOV-008 terminology check │    │
│  │ • Conflict resolution  │         │ • 510k vs PMA vs De Novo    │    │
│  └────────────┬───────────┘         └──────────────┬──────────────┘    │
│               │                                    │                    │
│               └──────────────────┬─────────────────┘                    │
│                                  │ BOTH COMPLETE                        │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                          │
│                    │  [6] NORMALIZATION       │                          │
│                    │   • Field name mapping   │                          │
│                    │   • Vocabulary control   │                          │
│                    │   • ID generation        │                          │
│                    │   • Synonym resolution   │                          │
│                    └──────────────┬───────────┘                         │
│                                   │                                     │
│                                   ▼                                     │
│                    ┌─────────────────────────┐                          │
│                    │  [7] CONFLICT CHECK      │                          │
│                    │   • Compare existing DB  │                          │
│                    │   • Detect contradictions│                          │
│                    │   • Regulatory changes   │                          │
│                    └──────────────┬───────────┘                         │
│                                   │                                     │
│               ┌───────────────────┴──────────────┐                      │
│               │ CONFLICT FOUND?                  │                      │
│               ▼                                  ▼                      │
│    ┌──────────────────┐                ┌─────────────────┐              │
│    │ → HUMAN REVIEW   │                │ NO CONFLICT     │              │
│    │   QUEUE [9]      │                └────────┬────────┘              │
│    └──────────────────┘                         │                       │
│                                                  ▼                      │
│                                   ┌─────────────────────────┐           │
│                                   │ [8] SAFETY/GOVERNANCE    │           │
│                                   │   • All 12 GOV rules    │           │
│                                   │   • Contraindications   │           │
│                                   │   • GOV-012 high-risk   │           │
│                                   └──────────────┬───────────┘          │
│                                                  │                      │
│               ┌──────────────────────────────────┤                      │
│               │ GOV FAIL?                        │ GOV PASS             │
│               ▼                                  ▼                      │
│    ┌──────────────────┐              ┌───────────────────────┐          │
│    │ → HUMAN REVIEW   │              │  AUTO-APPROVE PATH    │          │
│    │   QUEUE [9]      │              │  (conf ≥ 0.85)        │          │
│    │                  │              │  OR HUMAN REVIEW [9]  │          │
│    │  [9] HUMAN       │              │  (conf 0.7–0.84)      │          │
│    │  REVIEW QUEUE    │              └──────────┬────────────┘          │
│    │   • Package      │                         │                       │
│    │   • Present diff │                         │                       │
│    │   • Track decision│                        │                       │
│    └──────────┬───────┘                         │                       │
│               │ APPROVED                        │                       │
│               └──────────────────┬──────────────┘                       │
│                                  │                                      │
│                                  ▼                                      │
│                    ┌─────────────────────────┐                          │
│                    │  [10] PUBLISHING AGENT   │                         │
│                    │   • Apply changes        │                         │
│                    │   • Generate changelog   │                         │
│                    │   • Update CSV exports   │                         │
│                    │   • Post-publish QA      │                         │
│                    └──────────────┬───────────┘                         │
│                                   │                                     │
│               ┌───────────────────┴──────────────┐                      │
│               │ QA FAIL?                         │ QA PASS              │
│               ▼                                  ▼                      │
│    ┌──────────────────┐              ┌───────────────────────┐          │
│    │ ROLLBACK         │              │   PUBLISHED           │          │
│    │ + ALERT          │              │   RECORD LIVE         │          │
│    └──────────────────┘              └───────────────────────┘          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Specifications

---

### Agent 1: INTAKE AGENT

**Role:** First point of entry for all new data requests. Acts as the system's gatekeeper — validates format, prevents duplicate work, and routes records to the correct processing lane.

---

**Inputs:**

| Input Type | Format | Example |
|-----------|--------|---------|
| New device found | JSON or structured form | `{"type": "device", "name": "Magstim Horizon 3.0", "source": "FDA 510(k) K213023", "submitted_by": "researcher_A"}` |
| New guideline published | URL + metadata | APA guideline URL, publication date, guideline body |
| New meta-analysis | DOI + title + abstract | PubMed DOI, journal, authors, PICO summary |
| Adverse event signal | MAUDE report ID or narrative | FDA MAUDE reference |
| Manual data entry | Admin form submission | Database form with required fields |

**Required intake fields:**

```
intake_id:          UUID (auto-generated)
request_type:       ENUM [device, protocol, condition, assessment, source, guideline]
submitted_by:       STRING (user ID or system ID)
submission_date:    ISO8601 datetime
priority:           ENUM [P1_URGENT, P2_HIGH, P3_STANDARD, P4_LOW]
primary_source_url: STRING (URL or DOI — required)
notes:              STRING (optional)
```

---

**Outputs:**

| Output | Destination | Description |
|--------|------------|-------------|
| `intake_record` | Pipeline queue | Validated, deduplicated, prioritized record |
| `rejection_notice` | Submitter | Reason code + guidance for resubmission |
| `duplicate_alert` | Admin log | Pointer to existing record that conflicts |

---

**Tools and Sources:**

- Internal database query: check `Sources` table for existing DOIs, `Devices` table for device name matches, `Protocols` table for parameter combinations
- UUID generator for `intake_id`
- Priority scoring matrix (see below)
- Format validator (JSON schema enforcement)

---

**Decision Rules:**

| Condition | Action |
|-----------|--------|
| `primary_source_url` is missing | REJECT with code `MISSING_SOURCE` |
| `request_type` is not in ENUM | REJECT with code `INVALID_TYPE` |
| Exact DOI match found in `Sources` table | REJECT with code `DUPLICATE_SOURCE`; log pointer to existing record |
| Device name + manufacturer exact match in `Devices` table | REJECT with code `DUPLICATE_DEVICE`; suggest checking if update is intended |
| Device name + manufacturer near-match (fuzzy, >85% similarity) | FLAG with code `POSSIBLE_DUPLICATE`; route to human review before proceeding |
| All fields valid, no duplicate | APPROVE; assign intake_id; assign priority; route to Agent 2 |

**Priority Assignment Matrix:**

| Trigger | Priority Level |
|---------|---------------|
| New FDA PMA approval or supplement | P1_URGENT |
| New guideline from APA/NICE/CANMAT/EAN | P1_URGENT |
| Adverse event signal affecting existing device | P1_URGENT |
| New 510(k) clearance for neuromodulation device | P2_HIGH |
| New meta-analysis (published < 30 days ago) | P2_HIGH |
| Systematic review (published < 90 days ago) | P3_STANDARD |
| Single RCT | P3_STANDARD |
| Case series / open-label study | P4_LOW |
| Older literature being back-filled | P4_LOW |

---

**Confidence Scoring:**

- Intake does not produce a confidence score; it is a binary pass/fail gate.

---

**Error Handling:**

| Error | Response |
|-------|----------|
| Database unavailable during deduplication check | Queue record in `PENDING_DEDUP` state; retry after 15 minutes; alert admin if 3 retries fail |
| UUID generation failure | Retry 3 times; if still failing, log error and halt intake for that record |
| Form parsing error | REJECT with code `PARSE_ERROR`; return raw input with error line number |

---

### Agent 2: SOURCE DISCOVERY AGENT

**Role:** Given an intake record (which may contain only a partial source or a claimed device), systematically searches official regulatory databases, academic literature databases, and clinical guideline repositories to collect all available primary sources. Builds the evidentiary foundation for downstream agents.

---

**Inputs:**

| Field | Source |
|-------|--------|
| `intake_id` | From Agent 1 |
| `request_type` | From Agent 1 |
| `primary_source_url` or DOI | From Agent 1 |
| `priority` | From Agent 1 |
| Device name / condition name (if known) | From intake form |

---

**Outputs:**

| Output | Description |
|--------|-------------|
| `source_bundle` | Structured collection of ≥1 primary sources with URLs, access dates, source types |
| `source_confidence_score` | Float 0.0–1.0; based on source quality and completeness |
| `missing_source_flags` | List of source types that should exist but could not be found |

**Source bundle schema:**

```json
{
  "intake_id": "uuid",
  "sources_found": [
    {
      "source_type": "ENUM [regulatory, meta_analysis, guideline, RCT, review, case_series]",
      "url": "string",
      "doi": "string or null",
      "access_date": "ISO8601",
      "title": "string",
      "authors": "string",
      "publication_year": "integer",
      "relevant_pages_or_sections": "string",
      "raw_text_excerpt": "string (max 2000 chars)"
    }
  ],
  "source_confidence_score": 0.0,
  "missing_source_flags": []
}
```

---

**Tools and Sources:**

**Regulatory Databases:**
- FDA 510(k) database: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm`
- FDA PMA database: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm`
- FDA De Novo database: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/denovo.cfm`
- FDA MAUDE adverse events: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfmaude/search.cfm`
- FDA device classification: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfPCD/classification.cfm`
- EUDAMED: `https://ec.europa.eu/tools/eudamed`
- TGA ARTG: `https://www.tga.gov.au/resources/artg`
- PMDA Japan: `https://www.pmda.go.jp/english/review-services/reviews/approved-information/devices/0001.html`

**Academic Literature:**
- PubMed: `https://pubmed.ncbi.nlm.nih.gov/` — search via NCBI E-utilities API
- Cochrane Library: `https://www.cochranelibrary.com/` — systematic reviews and meta-analyses
- ClinicalTrials.gov: `https://clinicaltrials.gov/` — ongoing and completed trials

**Clinical Guidelines:**
- APA Practice Guidelines: `https://www.psychiatry.org/psychiatrists/practice/clinical-practice-guidelines`
- CANMAT: `https://www.canmat.org/publications/`
- NICE: `https://www.nice.org.uk/guidance`
- EAN: `https://www.ean.org/science-research/guidelines`
- RANZCP: `https://www.ranzcp.org/clinical-guidelines-publications`
- AAN: `https://www.aan.com/Guidelines/`
- WFSBP: `https://www.wfsbp.org/guidelines/`

---

**Decision Rules:**

| Condition | Action |
|-----------|--------|
| `source_confidence_score` ≥ 0.7 | Proceed to Agent 3 |
| `source_confidence_score` 0.5–0.69 | Proceed to Agent 3 with `LOW_SOURCE_CONFIDENCE` flag; Agent 3 must not produce high-confidence extraction |
| `source_confidence_score` < 0.5 | FLAG to Human Review Queue (Agent 9) with reason; do not proceed to Agent 3 automatically |
| Regulatory source found but text not extractable (paywalled PDF) | Log as `SOURCE_INACCESSIBLE`; attempt alternate access paths; if still blocked, flag to admin |
| Device claimed to be FDA approved but no PMA found | Add `REGULATORY_CLAIM_UNVERIFIED` to missing_source_flags |

**Source confidence scoring rules:**

| Evidence Level | Base Score |
|----------------|------------|
| PMA approval document found | +0.30 |
| 510(k) summary document found | +0.20 |
| Guideline with explicit recommendation found | +0.25 |
| Meta-analysis or systematic review found | +0.20 |
| RCT found | +0.15 |
| Review article found | +0.10 |
| Case series or open-label only | +0.05 |
| No primary source found | 0.00 |
| Source is manufacturer website only | -0.20 |
| Source is news article or press release only | -0.30 |
| Score cap | 1.00 |

---

**Error Handling:**

| Error | Response |
|-------|----------|
| FDA API rate limit exceeded | Exponential backoff (30s, 60s, 120s); alert if all 3 retries fail |
| PubMed API unavailable | Log `PUBMED_UNAVAILABLE`; attempt manual URL fetch as fallback |
| EUDAMED returns empty results | Log `EUDAMED_NO_RESULT`; note in missing_source_flags; do not treat as evidence device is not CE-marked |
| SSL certificate error on regulatory site | Log `SSL_ERROR`; flag for manual verification; do not proceed with unverified source |

---

### Agent 3: EXTRACTION AGENT

**Role:** Parses source documents collected by the Source Discovery Agent and extracts structured data fields that map to the database schema. Handles three distinct document categories: regulatory documents, clinical research papers, and clinical guidelines. Each category has different structure and extraction logic.

---

**Inputs:**

| Field | Source |
|-------|--------|
| `source_bundle` | From Agent 2 |
| `source_confidence_score` | From Agent 2 |
| `request_type` | From Agent 1 |
| `missing_source_flags` | From Agent 2 |

---

**Outputs:**

| Output | Description |
|--------|-------------|
| `extracted_record` | Structured data matching target table schema |
| `extraction_confidence_score` | Float 0.0–1.0 per extracted field |
| `extraction_notes` | Human-readable notes on parsing difficulties, ambiguities |
| `unresolved_fields` | List of required fields that could not be extracted |

---

**Extraction Schema by Document Type:**

**Regulatory Documents (510(k) summaries, PMA approvals):**

```
device_name:              from CDRH device name field
manufacturer:             from CDRH applicant/sponsor field
regulatory_pathway:       "510(k)" | "PMA" | "De Novo" | "CE" | "TGA"
clearance_number:         K-number, P-number, or DEN-number
clearance_date:           ISO8601 date
cleared_indications:      verbatim text from intended use section
predicate_device:         (510(k) only) from predicate identification section
substantial_equivalence:  (510(k) only) yes/no + basis
conditions_of_use:        from special conditions or limitations section
```

> Verbatim extraction of "Indications for Use" is mandatory. Paraphrasing is not permitted. Any deviation from verbatim text must be flagged.

**Clinical Research Papers (RCTs, meta-analyses, systematic reviews):**

```
study_design:             RCT | meta-analysis | systematic_review | open_label | case_series
population:               condition + n + inclusion/exclusion criteria summary
intervention:             modality + parameters (frequency, intensity, sessions)
comparator:               sham | active_comparator | waitlist | null
primary_outcome:          measure + result + effect size if reported
secondary_outcomes:       list of measures + results
blinding:                 double | single | unblinded | sham-controlled (specify)
jadad_score_or_rob:       if reported or assessable
conclusion_text:          verbatim author conclusion
effect_size:              Cohen's d, Hedges' g, or reported metric
confidence_intervals:     as reported
p_values:                 as reported
limitations:              as stated by authors
```

**Clinical Guidelines (APA, CANMAT, NICE, EAN, etc.):**

```
guideline_body:           organization name
guideline_title:          full title
publication_year:         year
version_number:           if versioned
recommendation_text:      verbatim recommendation text
recommendation_grade:     as graded by guideline body (e.g., Level 1, Grade A, Strong recommendation)
target_population:        from scope section
intervention_addressed:   modality and/or device
evidence_reviewed:        summary of evidence considered
dissenting_opinions:      if noted in guideline
supersedes:               previous guideline version (if applicable)
```

---

**Tools and Sources:**

- PDF text extraction (pdfplumber, pdfminer, or equivalent)
- HTML parser for web-based documents
- Table extraction for clinical paper results sections
- Named entity recognition for condition names, device names, parameter values
- Regular expressions for parameter extraction (e.g., `\d+\s*Hz`, `\d+\s*mA`, `\d+\s*%\s*MT`)

---

**Decision Rules:**

| Condition | Action |
|-----------|--------|
| All required fields extracted with confidence ≥ 0.8 | Mark extraction complete; proceed to Agents 4+5 |
| Required field extracted with confidence 0.5–0.79 | Mark field as `LOW_CONFIDENCE`; include in extraction_notes |
| Required field cannot be extracted (unresolved_field) | If ≥ 1 critical field unresolved, FLAG to Human Review Queue |
| Source is 510(k) summary and "Indications for Use" section not found | BLOCK proceeding; log `INDICATIONS_MISSING`; escalate |
| Protocol parameters are ranges rather than fixed values | Extract range; flag for clinical expert review |
| Contradictory values within same document | Flag as `INTRA_DOCUMENT_CONFLICT`; route to Human Review Queue |

**Critical required fields by table:**

| Table | Critical Fields |
|-------|----------------|
| Devices | device_name, manufacturer, regulatory_pathway, cleared_indications |
| Protocols | modality, condition, frequency_hz, intensity, session_count, evidence_source |
| Conditions | condition_name, icd_code_or_equivalent, category |
| Assessments | assessment_name, assessment_type, validated_population |
| Sources | doi_or_url, source_type, publication_year, title |

---

**Error Handling:**

| Error | Response |
|-------|----------|
| PDF encrypted or DRM-protected | Log `PDF_INACCESSIBLE`; try HTML version; if none, flag to admin for manual extraction |
| Document in non-English language | Pass to translation layer if available; if not, flag with `NON_ENGLISH_SOURCE` and route to human |
| Parameter values in non-standard units | Convert to standard units (mA, Hz, cm², min) with conversion note; flag for clinical review |
| Document is a retraction | IMMEDIATELY halt extraction; issue `SOURCE_RETRACTED` alert; check if retracted paper is already cited in database |

---

### Agent 4: EVIDENCE GRADING AGENT

**Role:** Maps extracted evidence to the EV-A through EV-D evidence hierarchy. Applies the full grading ruleset, with special handling for neurofeedback blinding quality, conflicting grades across sources, and pediatric populations.

---

**Inputs:**

| Field | Source |
|-------|--------|
| `extracted_record` | From Agent 3 |
| `source_bundle` | From Agent 2 |
| `request_type` | From Agent 1 |
| Existing evidence grade (if updating existing record) | From live database |

---

**Outputs:**

| Output | Description |
|--------|-------------|
| `proposed_evidence_grade` | EV-A, EV-B, EV-C, or EV-D |
| `grade_justification` | Structured reasoning with source references |
| `grade_confidence_score` | Float 0.0–1.0 |
| `conflicting_grades` | List of other sources with different grades and their basis |
| `grade_flags` | Special flags (e.g., `NFB_BLINDING_CONCERN`, `PEDIATRIC_POPULATION`, `GUIDELINE_DISCORDANCE`) |

---

**Evidence Grade Rules:**

| Grade | Criteria |
|-------|----------|
| **EV-A** | Explicit positive recommendation in ≥1 international clinical guideline from recognized body (APA, CANMAT, NICE, EAN, RANZCP, WFSBP, AAN) based on meta-analytic evidence |
| **EV-B** | Meta-analysis or systematic review with positive results AND ≥2 RCTs; or strong recommendation from a single high-quality guideline without full international endorsement |
| **EV-C** | Single RCT or open-label controlled trial with positive results; or weak/conditional guideline recommendation |
| **EV-D** | Case reports, preclinical evidence, theoretical basis, anecdotal reports, or open-label uncontrolled studies only |

**Grade ceiling rules (take the lower grade if any ceiling condition applies):**

| Ceiling Condition | Maximum Grade |
|------------------|--------------|
| Only one RCT available (n < 50 per arm) | EV-C |
| Meta-analysis with I² > 75% (high heterogeneity) | EV-C |
| All studies from single research group | EV-C |
| Only animal or computational models | EV-D |
| Guideline recommendation is "insufficient evidence to recommend" | EV-D |
| All studies unblinded with no sham condition | EV-D |
| Pediatric population, adult evidence only | Cannot inherit adult grade; must be graded from pediatric evidence separately |

---

**Special Handling: Neurofeedback**

The neurofeedback evidence grading module applies additional scrutiny beyond standard rules.

```
NEUROFEEDBACK_GRADING_PROCEDURE:

1. Identify all sources in source_bundle with modality = "Neurofeedback"
2. For each source:
   a. Check blinding quality:
      - Is sham neurofeedback used?
      - Are participants naive to NFB?
      - Is assessor blinded?
      - What is the sham condition?
   b. Check for non-specific effects:
      - Is there active control?
      - Is therapist contact time matched?
   c. Apply Cortese 2024 adjustment:
      - If condition = ADHD and modality = Neurofeedback:
        → OVERRIDE grade to EV-D regardless of other evidence
        → Cite: Cortese S et al. (2024). Neuropsychopharmacology.
        → This override requires senior reviewer approval to modify.
3. For non-ADHD NFB conditions:
   - Apply standard grading rules
   - Flag all NFB grades with NFB_BLINDING_CONCERN unless sham-controlled
```

---

**Conflict Resolution Rules:**

When two sources produce different evidence grades for the same condition-modality pair:

```
CONFLICT_RESOLUTION_PROCEDURE:

1. Higher-quality source wins:
   - International guideline > national guideline > meta-analysis > single RCT > open-label
   
2. More recent source wins (within same source type):
   - Use publication year; if same year, use specific publication date
   
3. Conservative rule (apply when quality is equal):
   - Assign the LOWER grade when sources are of equal quality but disagree
   
4. Guideline discordance (when two recognized guidelines disagree):
   - Assign grade of the MORE conservative guideline
   - Flag as GUIDELINE_DISCORDANCE
   - Route to Human Review Queue with both sources presented side-by-side
   
5. Locked grades (cannot be changed without explicit override):
   - Neurofeedback / ADHD = EV-D (Cortese 2024) — requires senior reviewer to override
   - Any grade change from EV-A requires two independent senior reviewers
```

---

**Decision Rules:**

| Condition | Action |
|-----------|--------|
| Grade confidence ≥ 0.85, no conflicts | Proceed; grade assigned |
| Grade confidence 0.7–0.84 | Proceed with `LOW_GRADE_CONFIDENCE` flag; includes Human Review Queue notification |
| Grade confidence < 0.7 | Route to Human Review Queue; do not proceed automatically |
| GUIDELINE_DISCORDANCE flag triggered | Always route to Human Review Queue |
| Attempt to assign EV-A for tACS modality | BLOCK; tACS has no guideline-endorsed EV-A indications as of 2025; flag for review |
| Attempt to upgrade NFB/ADHD above EV-D | BLOCK; require senior reviewer override |

---

**Confidence Scoring:**

| Basis | Score |
|-------|-------|
| International guideline with explicit grade | 0.95 |
| Multiple concordant meta-analyses | 0.85 |
| Single meta-analysis, low heterogeneity | 0.80 |
| Single meta-analysis, high heterogeneity | 0.65 |
| Single large RCT (n > 100 per arm) | 0.75 |
| Single small RCT (n < 50 per arm) | 0.55 |
| Open-label study | 0.40 |
| Case reports only | 0.20 |

---

**Error Handling:**

| Error | Response |
|-------|----------|
| Source document does not report study design | Assign lowest plausible grade; flag `STUDY_DESIGN_UNCLEAR`; route to human |
| Multiple publications from same trial (duplication) | Identify as same trial; count as single RCT, not multiple |
| Guideline uses non-standard grading system | Map to EV-A–EV-D using best-fit translation; document mapping in grade_justification |
| Source is a retracted paper | Immediately lower grade; check if database has other records citing same retracted paper |

---

### Agent 5: REGULATORY VERIFICATION AGENT

**Runs in parallel with Agent 4 after Agent 3 completes.**

**Role:** Cross-references all device-related claims against official regulatory databases. Enforces GOV-008 terminology precision. The single most critical function is ensuring that "cleared," "approved," "authorized," and "registered" are used correctly and never conflated.

---

**Inputs:**

| Field | Source |
|-------|--------|
| `extracted_record` | From Agent 3 |
| `source_bundle` | From Agent 2 |
| `request_type` | From Agent 1 |

---

**Outputs:**

| Output | Description |
|--------|-------------|
| `regulatory_status_record` | Verified regulatory pathway, official indication text |
| `terminology_flags` | Any GOV-008 violations found |
| `regulatory_confidence_score` | Float 0.0–1.0 |
| `indication_mismatch_flags` | Cases where claimed indication ≠ official cleared indication |
| `marketing_overreach_flags` | Cases where device claim exceeds official scope |

---

**GOV-008 Terminology Enforcement Rules:**

```
TERM_ENFORCEMENT_RULES:

"FDA approved"     → ONLY valid for PMA-approved devices
                    → 510(k)-cleared devices must be called "FDA cleared" or "510(k) cleared"
                    → De Novo devices must be called "FDA authorized" or "De Novo authorized"
                    → Listing in FDA device database ≠ any approval

"FDA cleared"      → ONLY valid for 510(k)-cleared devices
                    → PMA-approved devices are NOT "cleared" — they are "approved"
                    → Do not use for devices only registered or listed

"CE marked"        → Valid for devices with current CE Mark
                    → MDR transition devices: note whether under MDD or MDR
                    → CE Mark is not equivalent to FDA clearance or approval

"TGA approved"     → Valid for devices in ARTG
                    → Requires ARTG entry number as evidence

"Research use only"→ Required for any device with no regulatory clearance in the
                    specified market, or for off-label use beyond cleared indications

SPECIAL CASES:
Flow FL-100 (tDCS) → FDA PMA-approved ONLY; unique among tDCS devices; must be labeled
                    "PMA-approved" not merely "FDA cleared"
BrainsWay H-coil   → 510(k)-cleared for MDD, OCD, smoking cessation; NOT PMA-approved;
                    must not be labeled "FDA approved"
```

---

**Tools and Sources:**

- FDA 510(k) search by applicant, device name, or product code
- FDA PMA search by applicant or device name
- FDA De Novo authorization database
- EUDAMED (EU device registry)
- TGA ARTG lookup (`https://www.tga.gov.au/resources/artg`)
- Health Canada device search (`https://health-products.canada.ca/mdall-limh/`)
- PMDA Japan device search
- Device manufacturer websites (for cross-reference ONLY; manufacturer claims not authoritative)

---

**Verification Procedure:**

```
REGULATORY_VERIFICATION_STEPS:

1. IDENTIFY CLAIMED REGULATORY STATUS
   → Extract all regulatory claims from extracted_record
   → Examples: "FDA cleared for MDD", "CE marked", "PMA approved for epilepsy"

2. QUERY OFFICIAL DATABASE
   → For each FDA claim: query 510(k) or PMA database by clearance number or device name
   → For EU claims: query EUDAMED or request CE certificate
   → For TGA: query ARTG by device name or ARTG number
   → Document query date and database state

3. COMPARE CLAIMED vs. OFFICIAL
   → Compare claimed indication with official "Indications for Use" from regulatory document
   → Flag any expansion of indication scope beyond official text
   → Flag any use of approval language for a cleared device

4. CHECK FOR UPDATES
   → Search for supplements to original PMA/510(k) (may have added or removed indications)
   → Check FDA recall database for safety notices
   → Check MAUDE for adverse event signals relevant to proposed indication

5. ASSIGN REGULATORY CONFIDENCE SCORE
   → See scoring table below

6. OUTPUT VERIFIED STATUS STRING
   → Format: "[Regulatory body] [pathway] [clearance/approval number] [(indication)] [date]"
   → Example: "FDA 510(k) K213023 (MDD, 18+ years) cleared [date]"
   → Example: "FDA PMA P170010 (MDD, OCD, smoking cessation) approved [date]"
```

---

**Decision Rules:**

| Condition | Action |
|-----------|--------|
| Official clearance/approval found, indication matches | PASS; regulatory_confidence_score ≥ 0.9 |
| Official clearance found, indication is broader in claim than official text | FLAG `INDICATION_OVERREACH`; route to Human Review Queue |
| Device claimed "FDA approved" but only 510(k) found | FLAG `WRONG_APPROVAL_TYPE`; correct to "FDA cleared"; GOV-008 violation |
| No FDA record found for US-marketed device | FLAG `REGULATORY_NOT_FOUND`; route to Human Review Queue immediately |
| Device found in MAUDE with active safety notice | FLAG `ADVERSE_EVENT_SIGNAL`; route to Safety/Governance Agent (Agent 8) AND Human Review Queue |
| tDCS device record states PMA approval without Flow FL-100 identifier | FLAG `INVALID_PMA_CLAIM`; block; escalate immediately |

---

**Confidence Scoring:**

| Basis | Score |
|-------|-------|
| PMA found, indication matches verbatim | 0.98 |
| 510(k) found, indication matches verbatim | 0.95 |
| 510(k) found, indication partially matches | 0.75 |
| CE certificate confirmed directly | 0.90 |
| EUDAMED record found (MDR) | 0.85 |
| EUDAMED record found (MDD, transitional) | 0.70 |
| No regulatory record found | 0.00 |
| Manufacturer-only claim | 0.10 |

---

**Error Handling:**

| Error | Response |
|-------|----------|
| FDA database returns 503 | Retry with exponential backoff; log timestamp; if unavailable > 2 hours, flag to admin |
| 510(k) number format invalid | Try alternate search by device name and manufacturer |
| EUDAMED search returns inconsistent data | Document inconsistency; do not take as confirmation of CE status; flag for manual verification |
| Device appears in multiple regulatory jurisdictions with conflicting status | Document each jurisdiction separately; do not merge conflicting statuses |

---

### Agent 6: NORMALIZATION AGENT

**Role:** Waits for both Agents 4 and 5 to complete. Maps extracted data to the exact field names, controlled vocabularies, and ID systems used in the DeepSynaps database. Generates stable record IDs. Resolves synonyms and non-standard terminology.

---

**Inputs:**

| Field | Source |
|-------|--------|
| `extracted_record` | From Agent 3 |
| `proposed_evidence_grade` | From Agent 4 |
| `grade_flags` | From Agent 4 |
| `regulatory_status_record` | From Agent 5 |
| `terminology_flags` | From Agent 5 |
| Existing database vocabulary tables | From live database |

---

**Outputs:**

| Output | Description |
|--------|-------------|
| `normalized_record` | Record with all fields mapped to database schema |
| `id_assignments` | Proposed stable IDs for all new entities |
| `synonym_mappings` | Documentation of how non-standard terms were resolved |
| `normalization_confidence_score` | Float 0.0–1.0 |
| `unmapped_fields` | Fields that could not be normalized |

---

**Normalization Rules:**

**Modality Names (controlled vocabulary — exact strings required):**

```
ACCEPTED_MODALITY_NAMES = [
  "rTMS",
  "iTBS",
  "tDCS",
  "tACS",
  "CES",
  "taVNS",
  "VNS",
  "DBS",
  "TPS",
  "Neurofeedback",
  "HRV Biofeedback",
  "PBM"
]

SYNONYM_MAP = {
  "Transcranial Magnetic Stimulation": "rTMS",
  "repetitive TMS": "rTMS",
  "TMS": "rTMS",  # context-dependent; flag for review if ambiguous
  "Intermittent Theta Burst Stimulation": "iTBS",
  "theta burst": "iTBS",  # flag if could be cTBS
  "transcranial direct current stimulation": "tDCS",
  "transcranial alternating current stimulation": "tACS",
  "cranial electrotherapy stimulation": "CES",
  "transcutaneous auricular vagus nerve stimulation": "taVNS",
  "auricular VNS": "taVNS",
  "vagus nerve stimulation": "VNS",  # implanted VNS
  "deep brain stimulation": "DBS",
  "temporal interference stimulation": "TPS",  # NOTE: review; TPS may also mean Transcranial Pulse Stimulation
  "neurofeedback": "Neurofeedback",
  "EEG biofeedback": "Neurofeedback",
  "heart rate variability biofeedback": "HRV Biofeedback",
  "photobiomodulation": "PBM",
  "low-level laser therapy": "PBM",  # verify context
  "transcranial photobiomodulation": "PBM"
}
```

**Evidence Grade Codes:**

```
ACCEPTED_EVIDENCE_GRADES = ["EV-A", "EV-B", "EV-C", "EV-D"]
# No synonyms accepted; must be exact
```

**Condition Names:** Map to controlled vocabulary in Conditions table. If no match, create candidate new condition record and flag for review before linking.

**ID Generation Rules:**

```
ID_FORMAT = {
  "Devices":     "DEV-{zero_padded_sequential_int:04d}",  # DEV-0020, DEV-0021, ...
  "Conditions":  "CON-{zero_padded:04d}",
  "Protocols":   "PROT-{zero_padded:04d}",
  "Assessments": "ASSESS-{zero_padded:04d}",
  "Sources":     "SRC-{zero_padded:04d}"
}
# IDs are assigned sequentially, never reused
# Deleted records retain their IDs with DELETED status
```

---

**Decision Rules:**

| Condition | Action |
|-----------|--------|
| All fields map cleanly to controlled vocabulary | PASS; normalization_confidence_score ≥ 0.9 |
| Synonym resolution is ambiguous (e.g., "TMS" alone without context) | Flag `AMBIGUOUS_SYNONYM`; require human disambiguation |
| Condition name does not match any controlled vocabulary term | Create `CANDIDATE_CONDITION` sub-record; route to Human Review Queue |
| Two fields contain the same modality under different names (data entry error) | Log `DUPLICATE_FIELD`; take the more specific version; flag for review |
| ID space exhausted (unlikely but possible in future) | Alert admin to extend ID schema |

---

**Error Handling:**

| Error | Response |
|-------|----------|
| Database vocabulary table unavailable | Pause normalization; retry after 5 minutes; do not proceed with unvalidated vocabulary |
| Sequential ID conflict (race condition in parallel imports) | Lock ID table during assignment; retry if lock fails; do not assign duplicate IDs |
| Unicode/encoding issues in source text | Normalize to UTF-8; log original encoding; flag if normalization changes meaning |

---

### Agent 7: CONFLICT CHECK AGENT

**Role:** Compares the normalized proposed record against all existing database records to detect contradictions, redundancies, and cases where existing records may need to be updated as a consequence of new information.

---

**Inputs:**

| Field | Source |
|-------|--------|
| `normalized_record` | From Agent 6 |
| Full current database snapshot | From live database |

---

**Outputs:**

| Output | Description |
|--------|-------------|
| `conflict_report` | Structured list of conflicts found, with severity levels |
| `records_needing_update` | Existing records that may need revision based on new information |
| `conflict_severity` | ENUM [NONE, LOW, MEDIUM, HIGH, CRITICAL] |

---

**Conflict Detection Rules:**

```
CONFLICT_CHECKS:

1. EVIDENCE GRADE CONTRADICTION
   Trigger: New source assigns different grade than existing database record for same modality-condition pair
   Check: proposed_grade ≠ existing_grade
   Severity: HIGH if downgrade; MEDIUM if upgrade
   Action: Flag both records; present side-by-side in Human Review Queue

2. REGULATORY STATUS CONFLICT
   Trigger: New record claims different clearance status than existing record for same device
   Severity: CRITICAL
   Action: Immediately route to Regulatory Verification Agent for re-check; then Human Review Queue

3. PROTOCOL PARAMETER CONFLICT
   Trigger: New protocol for same modality-condition pair has materially different parameters
   (> 20% difference in frequency, intensity, or pulse count)
   Severity: MEDIUM
   Action: Flag both; note in Human Review Queue; do not auto-resolve

4. GUIDELINE SUPERSESSION
   Trigger: New guideline supersedes an existing guideline already in Sources table
   Action: Flag old source record for archival; propose update to all records citing old guideline

5. RETRACTION PROPAGATION
   Trigger: New information reveals a source already in database has been retracted
   Severity: CRITICAL
   Action: Immediately flag all records citing retracted source; lower evidence grades as needed;
           route to Human Review Queue with full propagation list

6. DUPLICATE RECORD DETECTION
   Trigger: New record appears substantively equivalent to existing record
   (same device name + same manufacturer + same regulatory pathway)
   Action: Block; return to Intake Agent with pointer to existing record

7. DEVICE RECLASSIFICATION
   Trigger: Regulatory status for an existing device has changed
   (e.g., a 510(k)-cleared device receives PMA supplement with additional indication)
   Action: Propose update to existing record; flag for Human Review Queue
```

---

**Decision Rules:**

| Condition | Action |
|-----------|--------|
| `conflict_severity = NONE` | Proceed directly to Agent 8 |
| `conflict_severity = LOW` | Proceed to Agent 8 with flag; include in Human Review notification |
| `conflict_severity = MEDIUM` | Route to Human Review Queue before proceeding to Agent 8 |
| `conflict_severity = HIGH` | Route to Human Review Queue; halt pipeline |
| `conflict_severity = CRITICAL` | Alert admin immediately; halt pipeline; do not proceed without explicit human authorization |

---

**Error Handling:**

| Error | Response |
|-------|----------|
| Database lock prevents conflict check | Retry after 2 minutes; if still locked, alert admin |
| Inconsistent database state detected during check | Log `DATABASE_INCONSISTENCY`; halt pipeline for this record; alert admin |
| Retraction check service unavailable | Log `RETRACTION_CHECK_SKIPPED`; add `RETRACTION_UNVERIFIED` flag to record; proceed but notify reviewer |

---

### Agent 8: SAFETY/GOVERNANCE AGENT

**Role:** The final automated gate before human review or publishing. Runs all 12 governance rules against proposed records. Validates contraindication completeness. Enforces special protections for high-risk populations. Blocks any record that fails governance.

---

**Inputs:**

| Field | Source |
|-------|--------|
| `normalized_record` | From Agent 6 |
| `conflict_report` | From Agent 7 |
| All 12 governance rules | From Governance_Rules table |
| High-risk population definitions | From governance configuration |

---

**Outputs:**

| Output | Description |
|--------|-------------|
| `governance_check_result` | PASS or FAIL with rule-by-rule breakdown |
| `failed_rules` | List of governance rules that were not satisfied |
| `contraindication_completeness_score` | Float 0.0–1.0 |
| `governance_flags` | Any special flags triggered |

---

**Governance Rule Enforcement (all 12 rules):**

```
GOVERNANCE_RULES_ENFORCEMENT:

GOV-001: All device records must include regulatory pathway
         Check: regulatory_pathway field is not null
         Fail action: BLOCK

GOV-002: Evidence grade must be documented for all protocol records
         Check: evidence_grade field is in [EV-A, EV-B, EV-C, EV-D]
         Fail action: BLOCK

GOV-003: Source citation required for all protocol parameter values
         Check: At least one source_id linked to protocol record
         Fail action: BLOCK

GOV-004: Adverse event data must reference MAUDE or equivalent
         Check: If device has known MAUDE reports, at least one source_id must link to adverse event data
         Fail action: FLAG for review

GOV-005: Contraindications must be listed for all active protocols
         Check: contraindications field is not empty string
         Fail action: BLOCK

GOV-006: Protocol intensity parameters must be within published safety limits
         Check: rTMS ≤ 110% MT (standard); tDCS ≤ 2 mA (standard clinical); validate against safety tables
         Fail action: BLOCK if exceeded without explicit justification source

GOV-007: Device commercial availability must be noted
         Check: availability_status field present and in controlled vocabulary
         Fail action: FLAG

GOV-008: Regulatory terminology must be precise
         Check: No "approved" applied to 510(k)-only device; no "cleared" applied to PMA device
         Fail action: BLOCK; return to Agent 5 for correction

GOV-009: Indication for off-label use must be explicitly flagged
         Check: If protocol target condition ≠ cleared indication, off_label flag must be TRUE
         Fail action: BLOCK

GOV-010: Sources older than 10 years must include notation of current relevance
         Check: If source publication_year < (current_year - 10), currency_note field must be present
         Fail action: FLAG

GOV-011: Assessment tools must include validated population note
         Check: validated_population field present in all Assessment records
         Fail action: BLOCK

GOV-012: Pediatric or high-risk population protocols require dual senior review
         Check: If population includes age < 18, OR pregnant women, OR active psychosis,
                OR active suicidality: dual_review_required flag must be TRUE
         Fail action: BLOCK; route directly to Human Review Queue with DUAL_REVIEW tag

GOV-013: [New — tACS specific] tACS protocols must carry research-only designation
         Check: If modality = "tACS": research_only_flag must be TRUE AND
                no_fda_clearance_disclaimer must be present
         Fail action: BLOCK
```

---

**Contraindication Completeness Validation:**

For each protocol record, the following contraindication categories must be addressed (explicitly stated as present or explicitly stated as not applicable):

| Category | Required for |
|----------|-------------|
| Active implanted devices (pacemakers, cochlear implants) | All modalities |
| Pregnancy | All modalities |
| Epilepsy / seizure history | rTMS, tDCS, tACS, CES |
| Metallic implants in/near target area | rTMS, TMS |
| Active psychosis | rTMS (for psychiatric indications) |
| Active suicidality with plan | All psychiatric protocols |
| Skin conditions at electrode site | tDCS, tACS, CES |
| Cardiac arrhythmia | taVNS, VNS |
| Surgical exclusion criteria | DBS, VNS (implanted) |

---

**Decision Rules:**

| Condition | Action |
|-----------|--------|
| All 12 (13 with GOV-013) governance rules pass | Route to Agent 9 (if confidence 0.7–0.84) or direct to Agent 10 (if confidence ≥ 0.85) |
| Any BLOCK-level governance rule fails | Block record; route to Human Review Queue; do not proceed |
| GOV-012 triggered (high-risk population) | Always route to Human Review Queue with DUAL_REVIEW tag regardless of confidence score |
| GOV-008 violation (terminology) | Block; automatically return record to Agent 5 for re-normalization |
| Contraindication completeness score < 0.8 | FLAG; route to Human Review Queue |

---

**Error Handling:**

| Error | Response |
|-------|----------|
| Governance rules table unavailable | HALT pipeline; do not proceed without governance check; alert admin |
| New protocol type not covered by existing governance rules | FLAG `GOVERNANCE_RULE_MISSING`; route to admin for rule creation before proceeding |
| Safety parameter lookup table out of date | FLAG `SAFETY_TABLE_OUTDATED`; use conservative fallback limits; alert admin |

---

### Agent 9: HUMAN REVIEW QUEUE

**Role:** Packages all flagged records into a structured review interface for human decision-making. This is not an automated agent — it is the interface between the automated pipeline and human reviewers. Its function is to present flagged content clearly, track decisions, and pass approved records to Agent 10 or rejected records to the appropriate disposition.

---

**Inputs:**

| Input | Possible Sources |
|-------|-----------------|
| Records flagged by any upstream agent (1–8) | Any agent via FLAG or BLOCK outcome |
| Conflict reports | Agent 7 |
| Governance failures | Agent 8 |
| Low-confidence scores | Agents 2, 3, 4, 5, 6 |

---

**Outputs:**

| Output | Description |
|--------|-------------|
| Reviewer decision package | Structured display of current vs. proposed values |
| `review_decision` | APPROVE, APPROVE_WITH_MODIFICATION, REJECT, ESCALATE |
| `review_timestamp` | ISO8601 datetime |
| `reviewer_id` | Logged reviewer identity |
| `reviewer_notes` | Free-text justification for decision |

---

**Review Package Format:**

Each review item presented to a human reviewer contains the following sections:

```
REVIEW PACKAGE STRUCTURE:

1. RECORD SUMMARY
   ├── record_type: [Device | Protocol | Condition | Assessment | Source]
   ├── intake_id: [UUID]
   ├── priority: [P1_URGENT | P2_HIGH | P3_STANDARD | P4_LOW]
   ├── submitted_by: [user/system ID]
   └── submission_date: [ISO8601]

2. FLAG REASONS
   └── List of all flags triggered, with flag code and originating agent

3. CURRENT DATABASE VALUE (if updating existing record)
   └── Full current record with all field values highlighted

4. PROPOSED NEW VALUE
   └── Full proposed record with changed fields highlighted
   └── Diff view showing exact field-level changes

5. SOURCE EVIDENCE LINKS
   ├── Primary source: [URL or DOI with full citation]
   ├── Supporting sources: [list of additional sources]
   └── Source confidence score: [float]

6. EVIDENCE GRADE
   ├── Proposed grade: [EV-A | EV-B | EV-C | EV-D]
   ├── Grade justification: [Agent 4 reasoning]
   └── Grade confidence: [float]

7. REGULATORY STATUS
   ├── Claimed status: [as extracted]
   ├── Verified status: [Agent 5 verification result]
   └── Discrepancies: [if any]

8. GOVERNANCE NOTES
   └── Which rules passed, which failed, which triggered flags

9. CONFLICT NOTES (if applicable)
   ├── Conflicting records: [pointers to existing database records]
   └── Conflict severity: [NONE | LOW | MEDIUM | HIGH | CRITICAL]

10. REVIEWER DECISION OPTIONS
    ├── [APPROVE] — Accept record as proposed
    ├── [APPROVE WITH MODIFICATION] — Reviewer edits specific fields before approving
    ├── [REJECT] — Reject with required rejection reason code
    └── [ESCALATE] — Send to senior reviewer (required for GOV-012 DUAL_REVIEW cases)
```

---

**Decision Rules:**

| Condition | Required Reviewer |
|-----------|-----------------|
| Standard FLAG (low confidence, minor conflict) | Standard reviewer |
| GOV-012 DUAL_REVIEW | Two independent senior reviewers required; both must APPROVE |
| CRITICAL conflict severity | Senior reviewer minimum |
| Evidence grade change from EV-A or EV-B | Senior reviewer minimum |
| NFB/ADHD grade change from EV-D | Two senior reviewers + documentation |
| Regulatory claim conflict | Regulatory specialist reviewer |

**SLA by priority:**

| Priority | Target Review Time |
|----------|-------------------|
| P1_URGENT | 4 business hours |
| P2_HIGH | 1 business day |
| P3_STANDARD | 3 business days |
| P4_LOW | 5 business days |

---

**Tracking:**

All review decisions are logged with immutable audit trail:
- `intake_id`
- `reviewer_id`
- `decision`
- `decision_timestamp`
- `reviewer_notes`
- `field_modifications` (if APPROVE_WITH_MODIFICATION)

---

**Error Handling:**

| Error | Response |
|-------|----------|
| Review SLA breached | Escalate automatically to next reviewer tier; send alert |
| Reviewer unavailable (out of office) | Re-assign to backup reviewer; log re-assignment |
| Reviewer attempts to change locked field (e.g., NFB/ADHD grade) | BLOCK modification; display lock reason; require senior override workflow |

---

### Agent 10: PUBLISHING AGENT

**Role:** Applies approved changes to the live database. Generates changelog entries. Updates all downstream exports (CSV files, API endpoints). Runs post-publish QA validation. Initiates rollback if post-publish validation fails.

---

**Inputs:**

| Field | Source |
|-------|--------|
| `normalized_record` | From Agent 6 (via approval chain) |
| `review_decision` | From Agent 9 (or auto-approve from Agent 8 for high-confidence records) |
| `reviewer_id` | From Agent 9 |
| `field_modifications` | From Agent 9 (if APPROVE_WITH_MODIFICATION) |

---

**Outputs:**

| Output | Description |
|--------|-------------|
| Published database record | Live in production database |
| `changelog_entry` | Structured record of what changed, when, by whom |
| Updated CSV exports | All affected table exports refreshed |
| `post_publish_qa_report` | Pass/fail for each QA check |
| Rollback package (if needed) | Complete record snapshot for rollback |

---

**Publishing Procedure:**

```
PUBLISH_PROCEDURE:

1. PRE-PUBLISH SNAPSHOT
   → Create immutable snapshot of current database state
   → Store as rollback_snapshot_{intake_id}_{timestamp}
   → This snapshot is retained for minimum 90 days

2. APPLY FIELD MODIFICATIONS
   → If APPROVE_WITH_MODIFICATION: apply reviewer changes before writing
   → Log all field-level modifications with reviewer_id

3. WRITE TO DATABASE
   → Execute INSERT (new record) or UPDATE (existing record)
   → Use database transaction; do not commit until all fields written successfully
   → If transaction fails at any point: automatic rollback to snapshot

4. GENERATE CHANGELOG ENTRY
   → Format: {
       "changelog_id": "CHG-{sequential}",
       "intake_id": uuid,
       "action": "INSERT | UPDATE | DEPRECATE",
       "table": "Devices | Protocols | ...",
       "record_id": "DEV-xxxx | ...",
       "changed_fields": [{"field": "...", "old_value": "...", "new_value": "..."}],
       "published_by": "reviewer_id or SYSTEM",
       "published_at": "ISO8601",
       "source_ids": ["SRC-xxxx", ...],
       "notes": "string"
     }

5. UPDATE CSV EXPORTS
   → Regenerate CSV for all affected tables
   → Timestamp export file names
   → Verify row count matches expected count

6. UPDATE RECORD COUNT SUMMARY
   → Refresh total record count dashboard
   → Alert if count changes by more than expected batch size

7. RUN POST-PUBLISH QA
   → See QA checklist below
```

---

**Post-Publish QA Checklist:**

```
POST_PUBLISH_QA:

□ Record is readable from database (SELECT confirms insert)
□ All required fields are non-null
□ Evidence grade is in [EV-A, EV-B, EV-C, EV-D]
□ Regulatory pathway field uses controlled vocabulary
□ Source foreign key resolves to valid Source record
□ Protocol-Device foreign key resolves to valid Device record
□ Protocol-Condition foreign key resolves to valid Condition record
□ No orphaned records created
□ CSV export row count = pre-publish count + expected_additions
□ Changelog entry is written and accessible
□ No governance rule violations in final published record
□ tACS records carry research_only_flag = TRUE
□ Pediatric records carry dual_review_required = TRUE
□ NFB/ADHD records carry evidence_grade = EV-D
```

---

**Rollback Procedure:**

```
ROLLBACK_PROCEDURE:

TRIGGER CONDITIONS:
- Post-publish QA check fails on ≥1 BLOCK-level item
- Data corruption detected post-write
- Manual rollback initiated by admin or senior reviewer

STEPS:
1. Pause all pending pipeline operations (other records queue but do not publish)
2. Restore pre-publish snapshot to production database
3. Mark published record as ROLLED_BACK with timestamp and reason
4. Log rollback event in changelog with action = "ROLLBACK"
5. Return record to Human Review Queue with rollback reason
6. Alert admin and original reviewer
7. Resume paused pipeline operations after rollback confirmed complete

ROLLBACK RETENTION:
- Snapshots retained minimum 90 days
- Changelog entries are permanent; rollback is logged, not erased
- Rolled-back records retain their IDs in ROLLED_BACK state

CANNOT ROLLBACK:
- Changelog entries (permanent, immutable)
- Reviewer decision logs (permanent, immutable)
- Intake logs (permanent, immutable)
```

---

**Error Handling:**

| Error | Response |
|-------|----------|
| Database write transaction fails | Automatic rollback to snapshot; alert admin; re-queue record |
| CSV export fails | Database change still committed; flag `EXPORT_FAILURE`; retry export separately |
| Post-publish QA detects critical error | Initiate rollback procedure above |
| Changelog write fails | Do not consider publish complete; retry changelog write before proceeding |
| Record count anomaly (unexpected count change) | Alert admin; pause further publishing until count reconciled |

---

## Error Handling & Rollback Procedures

### Pipeline-Level Error States

| State | Meaning | Recovery |
|-------|---------|---------|
| `AGENT_TIMEOUT` | An agent exceeded its processing time limit (default: 5 min for automated; 15 min for DB queries) | Retry once; if still timing out, alert admin and move to manual queue |
| `PIPELINE_BREAK` | Any CRITICAL-severity condition | Full pipeline halt for affected record; all other records continue |
| `DATA_CORRUPTION` | Database inconsistency detected | Immediate admin alert; halt all publishing until resolved |
| `REGULATORY_DB_UNAVAILABLE` | FDA/EUDAMED/TGA databases unreachable | Queue regulatory checks for retry when available; do not proceed past Agent 5 without verification |
| `RETRACTION_DETECTED` | Source already in database is retracted | Halt all records citing that source; trigger propagation review |

### Error Escalation Matrix

| Severity | First Responder | Escalation Path | Time to Respond |
|----------|----------------|-----------------|-----------------|
| LOW | System log only | Review in weekly report | 7 days |
| MEDIUM | Pipeline FLAG | Standard reviewer | 3 business days |
| HIGH | Human Review Queue | Senior reviewer | 1 business day |
| CRITICAL | Admin alert | Admin + senior reviewer | 4 hours |

---

## Source Monitoring

Source monitoring operates as a background process independent of the main pipeline. It generates new intake records when qualifying updates are found.

---

### Weekly FDA Monitoring

**Frequency:** Weekly (recommended day: Monday)

**Databases and Procedures:**

| Database | URL | Search Strategy |
|----------|-----|----------------|
| 510(k) Premarket Notifications | `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm` | Filter by product code: QNO (TMS), QEB (tDCS/electrical brain stimulation), GWC (vagus nerve), OLY (deep brain stimulator), LGX (EEG/biofeedback), IYO (PBM). Date filter: last 7 days |
| PMA Approvals & Supplements | `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpma/pma.cfm` | Filter by generic name: "neurostimulator", "magnetic stimulator", "brain stimulator". Date filter: last 7 days. Include PMA Supplements (indications may change) |
| De Novo Authorizations | `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/denovo.cfm` | Filter by device name/generic name. Date filter: last 7 days |
| MAUDE Adverse Events | `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfmaude/search.cfm` | Search by existing device names in database. Look for: death, serious injury, device malfunction |
| FDA Recalls | `https://www.fda.gov/medical-devices/medical-device-recalls` | Filter Class I and Class II recalls; device category: neurological |

**Key Product Codes for Neuromodulation:**

```
QNO  — Transcranial Magnetic Stimulator
QEB  — Electrical Brain Stimulator (tDCS category)
GWC  — Vagus Nerve Stimulator
OLY  — Deep Brain Stimulator
LGX  — Electroencephalograph (neurofeedback context)
IYO  — Photobiomodulation device
IDZ  — Nerve stimulator, transcutaneous (CES/taVNS adjacent)
```

**Trigger for intake:** Any new 510(k) clearance, PMA approval, or De Novo authorization matching above product codes → automatic P2_HIGH intake record with FDA database URL as primary source.

**Trigger for database update:** Any MAUDE adverse event signal for a device already in the database → P1_URGENT intake record flagged for Safety/Governance review.

---

### Monthly EUDAMED Check

**Frequency:** Monthly (first business day of each month)

**URL:** `https://ec.europa.eu/tools/eudamed`

**Search Terms:**
- "neuromodulation"
- "neurostimulation"
- "transcranial magnetic"
- "deep brain stimulator"
- "vagus nerve"
- "transcranial direct current"
- "photobiomodulation"

**What to look for:**
- New MDR registrations for device categories already in the database
- Devices transitioning from MDD to MDR certification (may have changed indications)
- Devices with suspended or withdrawn CE Marks
- New manufacturers registering neuromodulation devices

**Note on EUDAMED limitations:** EUDAMED full implementation is phased. Not all devices are fully registered even if CE-marked. Absence from EUDAMED does not confirm absence of CE Mark. Cross-check against manufacturer's Declaration of Conformity when EUDAMED entry is absent or incomplete.

---

### Monthly PubMed Search

**Frequency:** Monthly (run on first business day)

**Primary search string:**

```
(systematic review[pt] OR meta-analysis[pt]) AND 
(
  TMS[tiab] OR rTMS[tiab] OR "transcranial magnetic stimulation"[tiab] OR
  tDCS[tiab] OR "transcranial direct current stimulation"[tiab] OR
  tACS[tiab] OR "transcranial alternating current stimulation"[tiab] OR
  "neurofeedback"[tiab] OR "EEG biofeedback"[tiab] OR
  "vagus nerve stimulation"[tiab] OR VNS[tiab] OR taVNS[tiab] OR
  "deep brain stimulation"[tiab] OR DBS[tiab] OR
  "transcranial pulse stimulation"[tiab] OR TPS[tiab] OR
  "photobiomodulation"[tiab] OR PBM[tiab] OR
  "cranial electrotherapy stimulation"[tiab] OR CES[tiab] OR
  "closed-loop neurostimulation"[tiab] OR
  "focused ultrasound"[tiab] OR
  "neurostimulation"[tiab]
) AND
("last 30 days"[dp])
```

**Secondary search — guideline publications:**

```
(practice guideline[pt] OR guideline[pt]) AND 
(
  TMS[tiab] OR rTMS[tiab] OR tDCS[tiab] OR
  neurostimulation[tiab] OR neuromodulation[tiab] OR
  VNS[tiab] OR DBS[tiab] OR neurofeedback[tiab]
) AND
("last 30 days"[dp])
```

**Alert triggers:**

| Finding | Action |
|---------|--------|
| Meta-analysis challenging an EV-A or EV-B grade in the database | P1_URGENT intake; immediate review |
| Meta-analysis for currently EV-D condition showing positive results | P2_HIGH intake; evidence grading review |
| New guideline publication from recognized body | P1_URGENT intake |
| Systematic review on neurofeedback for ADHD | P1_URGENT; compare to Cortese 2024; check for grade lock implications |
| Retraction notice for paper already in database | CRITICAL intake; propagation review |

---

### Quarterly Guideline Check

**Frequency:** Quarterly (Q1: January, Q2: April, Q3: July, Q4: October)

| Organization | URL | Focus Areas |
|-------------|-----|------------|
| American Psychiatric Association (APA) | `https://www.psychiatry.org/psychiatrists/practice/clinical-practice-guidelines` | MDD, OCD, bipolar disorder, PTSD, anxiety, addiction |
| CANMAT | `https://www.canmat.org/publications/` | TMS for MDD; bipolar disorder; anxiety; adjunct treatments |
| NICE | `https://www.nice.org.uk/guidance` | Interventional procedures (check IP series); technology appraisals; clinical guidelines |
| EAN | `https://www.ean.org/science-research/guidelines` | TMS, DBS, VNS in neurology; Parkinson's; epilepsy; pain |
| RANZCP | `https://www.ranzcp.org/clinical-guidelines-publications` | Australasian TMS evidence grading |
| WFSBP | `https://www.wfsbp.org/guidelines/` | International biological psychiatry guidelines |
| AAN | `https://www.aan.com/Guidelines/` | DBS for Parkinson's and movement disorders; VNS for epilepsy; pain |
| AAP (American Academy of Pediatrics) | `https://www.aap.org/en/patient-care/` | Pediatric protocols; ADHD (check for NFB recommendations) |

**Procedure:**
1. Check each organization's "recently published" or "new guidelines" section
2. Search for updates to guidelines already listed in the Sources table
3. Any new or updated guideline addressing a modality-condition pair in the database → P2_HIGH intake
4. Superseded guidelines → flag existing Source records for archival; update protocol records citing them

---

## Confidence Scoring Reference

### Composite Record Confidence Score

Each published record carries a composite confidence score derived from individual agent scores:

```
COMPOSITE_CONFIDENCE = weighted_average(
  source_confidence         * 0.20,
  extraction_confidence     * 0.15,
  evidence_grade_confidence * 0.30,
  regulatory_confidence     * 0.25,
  normalization_confidence  * 0.10
)

THRESHOLDS:
≥ 0.85  → Auto-approve eligible (still GOV-012 route if flagged)
0.70 – 0.84  → Standard human review required
0.50 – 0.69  → Senior reviewer required
< 0.50  → Reject; require resubmission with stronger sources
```

---

## Governance Rules Reference

The 12 active governance rules enforced by Agent 8:

| Code | Rule Summary | Fail Level |
|------|-------------|-----------|
| GOV-001 | All device records must include regulatory pathway | BLOCK |
| GOV-002 | Evidence grade required for all protocol records | BLOCK |
| GOV-003 | Source citation required for all protocol parameters | BLOCK |
| GOV-004 | Adverse event data must reference MAUDE or equivalent | FLAG |
| GOV-005 | Contraindications must be listed for all active protocols | BLOCK |
| GOV-006 | Protocol parameters must be within published safety limits | BLOCK |
| GOV-007 | Device commercial availability must be noted | FLAG |
| GOV-008 | Regulatory terminology must be precise (cleared ≠ approved) | BLOCK |
| GOV-009 | Off-label use must be explicitly flagged | BLOCK |
| GOV-010 | Sources older than 10 years must include currency note | FLAG |
| GOV-011 | Assessment tools must include validated population note | BLOCK |
| GOV-012 | Pediatric/high-risk population protocols require dual senior review | BLOCK + DUAL_REVIEW |
| GOV-013 | tACS protocols must carry research-only designation | BLOCK |

---

*Document prepared for DeepSynaps Studio internal use. This workflow architecture should be reviewed and updated quarterly or whenever significant changes are made to the database schema, governance rules, or evidence grading criteria.*
