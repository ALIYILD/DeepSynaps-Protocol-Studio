# DeepSynaps Studio — Clinical Evidence Policy

## Purpose

This document defines the rules governing how clinical evidence is sourced, classified,
labeled, and reviewed within the DeepSynaps Studio platform. All generated documents are
intended for clinical use; accuracy and transparency are non-negotiable.

---

## Evidence Level Hierarchy

Evidence is classified into six levels, ordered from strongest to weakest. These levels
are defined in `core/enums.py` (`EvidenceLevel`) and the scoring rules are configured in
`config/evidence_rules.yaml`.

| Level | Enum Value | Included Study Types | Score |
|---|---|---|---|
| HIGHEST | `highest` | Clinical practice guideline, systematic review, meta-analysis, large RCT | 5 |
| HIGH | `high` | RCT, controlled trial | 4 |
| MEDIUM | `medium` | Cohort study, narrative review, consensus statement | 3 |
| LOW | `low` | Pilot study, feasibility study, case series | 2 |
| VERY_LOW | `very_low` | Case report, expert opinion, indirect evidence | 1 |
| MISSING | `missing` | No published evidence found | 0 |

The `MISSING` level is an explicit state — it is never silently omitted. When no evidence
is found for a claim, the gap is documented in `ConditionSchema.evidence_gaps`.

---

## Evidence Types and Classification

The full list of recognized evidence types (defined in `EvidenceType` enum):

| Evidence Type | Enum Value | Level |
|---|---|---|
| Clinical Practice Guideline | `clinical_practice_guideline` | HIGHEST |
| Systematic Review | `systematic_review` | HIGHEST |
| Meta-Analysis | `meta_analysis` | HIGHEST |
| Large RCT | `large_rct` | HIGHEST |
| RCT | `rct` | HIGH |
| Controlled Trial | `controlled_trial` | HIGH |
| Cohort Study | `cohort_study` | MEDIUM |
| Narrative Review | `narrative_review` | MEDIUM |
| Consensus Statement | `consensus_statement` | MEDIUM |
| Pilot Study | `pilot_study` | LOW |
| Feasibility Study | `feasibility_study` | LOW |
| Case Series | `case_series` | LOW |
| Case Report | `case_report` | VERY_LOW |
| Expert Opinion | `expert_opinion` | VERY_LOW |
| Indirect Evidence | `indirect_evidence` | VERY_LOW |
| Manual Entry | `manual_entry` | (varies — assign level explicitly) |

When classifying a reference, use the most specific applicable type. Do not use
`expert_opinion` or `indirect_evidence` unless no higher-level study exists.

---

## Core Rules

### Rule 1: Real PMIDs Only

Every reference embedded in a generated document must carry a real, verifiable PubMed ID (PMID).

- PMIDs are numerical identifiers assigned by NCBI to indexed articles.
- A PMID can be verified at `https://pubmed.ncbi.nlm.nih.gov/{PMID}/`.
- Placeholder PMIDs (e.g. `99999999`, `00000000`) are prohibited.
- If no published article supports a claim, the claim must be either removed or
  marked with the `MISSING` evidence level and flagged for review.

### Rule 2: No Fabrication

Neither the platform code nor any human contributor may fabricate:
- Citation details (authors, journal, year, title)
- PubMed IDs
- Study outcomes or statistical results
- Sample sizes or effect sizes

If the PubMed API does not return a result for a search query, the absence of evidence
is documented explicitly — it is never replaced with a constructed reference.

### Rule 3: Document Evidence Gaps

When evidence is unavailable or insufficient for a clinical claim:

1. Set `evidence_level = EvidenceLevel.MISSING` on the relevant field.
2. Add a descriptive entry to `ConditionSchema.evidence_gaps`.
3. Apply the appropriate `ReviewFlag` (see below).
4. The platform will insert a clinical review warning into the generated document.

Evidence gaps are auditable — they appear in QA reports alongside missing documents.

### Rule 4: Off-Label Use Must Be Marked

All neuromodulation modalities supported by this platform (tDCS, TPS, taVNS, CES) are
used off-label for most psychiatric and neurological indications. Requirements for every
`StimulationTarget` and `ProtocolEntry` involving off-label use:

- Set `off_label = True`.
- Set `consent_required = True`.
- Include a rationale string that references the evidence basis.
- Ensure the condition generator's `safety_notes` includes an appropriate off-label consent note.

The QA system raises `ReviewFlag.OFF_LABEL_NOT_FLAGGED` if an off-label target lacks
these fields.

---

## Confidence Labeling System

Each clinical claim is assigned a `ConfidenceLabel` based on the strongest evidence level
supporting it:

| Evidence Level | Confidence Label | Document Language |
|---|---|---|
| HIGHEST or HIGH | `high_confidence` | "Evidence-based:" |
| MEDIUM | `medium_confidence` | "Supported by emerging evidence:" |
| LOW | `low_confidence` | "Consensus-informed (limited evidence):" |
| VERY_LOW or MISSING | `insufficient` | "REQUIRES CLINICAL REVIEW — Evidence insufficient:" |

Confidence thresholds (from `config/evidence_rules.yaml`):

| Confidence Label | Minimum Evidence Score |
|---|---|
| `high_confidence` | 4 |
| `medium_confidence` | 3 |
| `low_confidence` | 2 |
| `insufficient` | 1 |

Confidence labels are applied per claim category (e.g. pathophysiology, stimulation targets,
responder criteria). A condition may have HIGH confidence for pathophysiology and LOW confidence
for responder criteria — these are tracked independently.

---

## Review Flag Triggers

Review flags (defined in `ReviewFlag` enum, `core/enums.py`) are raised automatically or
manually when evidence quality conditions are met. Flagged documents must not be released
for clinical use without human review.

| Flag | Enum Value | Trigger Condition |
|---|---|---|
| Missing Primary Source | `missing_primary_source` | A claim has no directly supporting PMID |
| Contradicting Sources | `contradicting_sources` | Two or more sources make conflicting claims |
| Indirect Evidence Only | `indirect_evidence_only` | Only indirect/analogical evidence available |
| Pilot Data Only | `pilot_data_only` | Highest available evidence is pilot or feasibility study |
| Off-Label Not Flagged | `off_label_not_flagged` | Off-label target missing `off_label=True` |
| Template Carryover | `template_carryover` | Content appears copied from another condition without adaptation |
| Incomplete Safety | `incomplete_safety` | Safety notes section is missing or empty |
| No Validated Scale | `no_validated_scale` | Assessment tool lacks a validated psychometric reference |
| Placeholder Text | `placeholder_text` | Document contains unreplaced template placeholder text |
| Missing Section | `missing_section` | A required document section is absent |

Flags are stored in `ConditionSchema.review_flags` (as string values) and surfaced in:
- QA reports (`qa report --format markdown`)
- Document footers / review notice blocks in generated DOCX files

---

## Claim Categories

Evidence is tracked per claim category. Each category maps to a set of PubMed search terms
used during evidence ingestion. Categories are defined in `ClaimCategory` enum:

| Category | Enum Value | Scope |
|---|---|---|
| Pathophysiology | `pathophysiology` | Disease mechanism and etiology |
| Brain Regions | `brain_regions` | Neuroanatomical involvement |
| Network Involvement | `network_involvement` | Functional network dysfunction |
| Clinical Phenotypes | `clinical_phenotypes` | Subtype classification |
| Assessment Tools | `assessment_tools` | Validated measurement scales |
| Stimulation Targets | `stimulation_targets` | Electrode/coil placement rationale |
| Stimulation Parameters | `stimulation_parameters` | Intensity, frequency, duration, session count |
| Modality Rationale | `modality_rationale` | Why a given modality is appropriate |
| Safety | `safety` | Adverse effects, stopping rules |
| Contraindications | `contraindications` | Absolute and relative contraindications |
| Responder Criteria | `responder_criteria` | Outcome thresholds for treatment response |
| Inclusion Criteria | `inclusion_criteria` | Patient eligibility |
| Exclusion Criteria | `exclusion_criteria` | Patient ineligibility |

---

## How to Add New References to a Condition Generator

1. Verify the PMID is valid by visiting `https://pubmed.ncbi.nlm.nih.gov/{PMID}/`.

2. Add the reference to the `references` list in the condition's `build_{slug}_condition()`
   function. Each reference is a dict with at minimum:

   ```python
   {
       "pmid": "12345678",
       "title": "Full article title as it appears on PubMed",
       "authors": "Last FM, Last FM, et al.",
       "journal": "Journal Name",
       "year": 2023,
       "evidence_type": "rct",       # use EvidenceType enum value
       "evidence_level": "high",     # use EvidenceLevel enum value
       "claim_categories": ["stimulation_targets", "stimulation_parameters"],
   }
   ```

3. Update the `overall_evidence_quality` field if the new reference elevates the
   condition's overall evidence level.

4. If the reference resolves a previously flagged evidence gap, remove the corresponding
   entry from `evidence_gaps` and the associated `ReviewFlag`.

5. Run QA to confirm the condition still passes:

   ```bash
   deepsynaps-studio qa report --condition {slug} --format markdown
   ```

---

## PubMed Evidence Ingestion

The `ingest-evidence ingest` command automates evidence retrieval. It queries PubMed
for each `ClaimCategory` and caches results locally.

Preferred publication types (configured in `config/evidence_rules.yaml`):
- Systematic Review
- Meta-Analysis
- Practice Guideline
- Randomized Controlled Trial
- Review
- Clinical Trial

Search parameters:
- `years_back: 10` — only returns articles published within the past 10 years
- `max_results_per_query: 50` — configurable via `--max-results`
- `min_abstract_length: 100` — filters out stubs without substantive abstracts

Cached results are stored in `data/raw/pubmed_cache/` as JSON files. Use
`--force-refresh` to bypass the cache and re-query PubMed.

---

## Off-Label Use Marking Requirements

All neuromodulation treatments managed in DeepSynaps Studio are used off-label unless
explicitly cleared by a regulatory body for the specific indication.

**Required fields for every off-label `StimulationTarget`:**

```python
StimulationTarget(
    modality=Modality.TDCS,
    target_region="Left Dorsolateral Prefrontal Cortex",
    target_abbreviation="L-DLPFC",
    laterality="left",
    rationale="...",           # must reference supporting evidence
    evidence_level=EvidenceLevel.HIGH,
    off_label=True,            # REQUIRED
    consent_required=True,     # REQUIRED
)
```

**Required fields for every off-label `ProtocolEntry`:**

```python
ProtocolEntry(
    protocol_id="...",
    label="...",
    modality=Modality.TPS,
    ...
    off_label=True,            # REQUIRED
    notes="Off-label use: written informed consent required before first session.",
)
```

**Required safety note in `ConditionSchema.safety_notes`:**

```python
SafetyNote(
    category="contraindication",
    description="All TPS applications require explicit off-label informed consent "
                "and Doctor authorization prior to first session.",
    severity="absolute",
    source="DeepSynaps Studio Governance Protocol",
)
```

The QA system raises `ReviewFlag.OFF_LABEL_NOT_FLAGGED` if a stimulation target
with `off_label=True` is present in the schema but the condition's safety notes
do not contain an off-label consent note.

---

## Shared Absolute Contraindications

The following contraindications apply to all conditions and modalities. They are
defined in `conditions/shared_condition_schema.py` as `SHARED_ABSOLUTE_CONTRAINDICATIONS`
and must be included in every condition's `contraindications` list:

- Active implanted devices (cochlear implants, deep brain stimulators, cardiac pacemakers/defibrillators) unless explicitly cleared by device manufacturer
- Metallic implants in the head or neck region within the stimulation field
- Active epilepsy with uncontrolled seizures (relative contraindication — requires neurologist clearance)
- Skull defects or craniectomy at stimulation sites
- Skin lesions, wounds, or dermatological conditions at electrode placement sites
- Active malignancy of the central nervous system
- Pregnancy (precautionary contraindication — insufficient safety data)
- Severe psychiatric crisis requiring immediate hospitalization
