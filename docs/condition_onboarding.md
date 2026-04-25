# DeepSynaps Studio — Condition Onboarding Guide

## Overview

This guide describes the complete process for adding a new condition to the
DeepSynaps Studio platform. Follow all steps in order. A condition is not considered
complete until it passes QA checks and generates all expected documents.

---

## Prerequisites

- Python 3.11+
- `PYTHONPATH=src` set in your shell
- All dependencies installed (see `README.md`)
- At least 3 real, verifiable PubMed IDs (PMIDs) for the condition

---

## Step-by-Step Guide

### Step 1 — Add to `data/reference/condition_list.yaml`

Open `data/reference/condition_list.yaml` and append an entry for the new condition.
This file is the authoritative condition roster; the CLI reads it for `list-conditions`
and for registry metadata.

```yaml
  - slug: "your_condition_slug"
    display_name: "Human-Readable Condition Name"
    icd10: "X00.0"
    aliases: ["common name", "abbreviation"]
    template_status: "generated"
    evidence_quality: "medium"   # high | medium | low | emerging
```

**Field rules:**
- `slug`: lowercase, underscores only, unique across all conditions
- `icd10`: use the most specific applicable ICD-10 code
- `template_status`: use `"generated"` for new conditions
- `evidence_quality`: reflects the overall strength of published evidence for
  neuromodulation in this condition; must match `EvidenceLevel` reasoning

---

### Step 2 — Create the condition generator file

Create `src/deepsynaps_studio/conditions/generators/{slug}.py`.

The file must define a single public function: `build_{slug}_condition()` that
returns a fully populated `ConditionSchema` instance.

Use the template below as a starting point:

```python
"""
{Condition Display Name} condition schema builder.
"""
from ...conditions.shared_condition_schema import (
    make_network, make_tdcs_target, make_tps_target,
    make_safety, SHARED_ABSOLUTE_CONTRAINDICATIONS, SHARED_SAFETY_NOTES,
    SHARED_GOVERNANCE_RULES,
)
from ...schemas.condition import (
    ConditionSchema, PhenotypeSubtype, AssessmentTool, ProtocolEntry,
)
from ...core.enums import (
    NetworkKey, NetworkDysfunction, Modality, EvidenceLevel,
)
from ...core.utils import current_date_str


def build_{slug}_condition() -> ConditionSchema:
    """Build and return the ConditionSchema for {Condition Display Name}."""

    network_profiles = [
        make_network(
            network=NetworkKey.CEN,
            dysfunction=NetworkDysfunction.HYPO,
            relevance="...",
            primary=True,
            severity="moderate",
            evidence_note="PMID: 12345678",
        ),
        # Add more networks as needed
    ]

    phenotypes = [
        PhenotypeSubtype(
            slug="phenotype_a",
            label="Phenotype A",
            description="...",
            key_features=["feature 1", "feature 2"],
            primary_networks=[NetworkKey.CEN],
            preferred_modalities=[Modality.TDCS],
        ),
    ]

    assessment_tools = [
        AssessmentTool(
            scale_key="scale_key_here",
            name="Full Scale Name",
            abbreviation="FSN",
            domains=["domain 1"],
            timing="baseline",
            evidence_pmid="12345678",
        ),
    ]

    stimulation_targets = [
        make_tdcs_target(
            region="Left Dorsolateral Prefrontal Cortex",
            abbr="L-DLPFC",
            laterality="left",
            rationale="...",
            protocol_label="Protocol A",
            evidence_level=EvidenceLevel.MEDIUM,
            off_label=True,
        ),
    ]

    protocols = [
        ProtocolEntry(
            protocol_id="{slug}_protocol_a",
            label="Protocol A — {Phenotype}",
            modality=Modality.TDCS,
            target_region="Left Dorsolateral Prefrontal Cortex",
            target_abbreviation="L-DLPFC",
            phenotype_slugs=["phenotype_a"],
            network_targets=[NetworkKey.CEN],
            parameters={
                "intensity_ma": 2,
                "duration_min": 20,
                "sessions": 20,
                "frequency": "5x/week for 4 weeks",
            },
            rationale="...",
            evidence_level=EvidenceLevel.MEDIUM,
            off_label=True,
            session_count=20,
        ),
    ]

    references = [
        {
            "pmid": "12345678",
            "title": "First reference title",
            "authors": "Last FM, et al.",
            "journal": "Journal Name",
            "year": 2022,
            "evidence_type": "rct",
            "evidence_level": "high",
            "claim_categories": ["stimulation_targets"],
        },
        {
            "pmid": "23456789",
            "title": "Second reference title",
            "authors": "Last FM, et al.",
            "journal": "Journal Name",
            "year": 2021,
            "evidence_type": "systematic_review",
            "evidence_level": "highest",
            "claim_categories": ["pathophysiology"],
        },
        {
            "pmid": "34567890",
            "title": "Third reference title",
            "authors": "Last FM, et al.",
            "journal": "Journal Name",
            "year": 2020,
            "evidence_type": "cohort_study",
            "evidence_level": "medium",
            "claim_categories": ["responder_criteria"],
        },
    ]

    return ConditionSchema(
        slug="{slug}",
        display_name="{Condition Display Name}",
        icd10="X00.0",
        aliases=["alias1", "alias2"],
        version="1.0",
        generated_at=current_date_str(),

        overview="...",
        pathophysiology="...",
        core_symptoms=["symptom 1", "symptom 2"],
        non_motor_symptoms=["symptom 1"],

        key_brain_regions=["Region 1", "Region 2"],
        brain_region_descriptions={
            "Region 1": "...",
        },

        network_profiles=network_profiles,
        primary_network=NetworkKey.CEN,
        network_rationale="...",

        phenotypes=phenotypes,
        assessment_tools=assessment_tools,

        baseline_measures=["Scale Name (Abbreviation)"],
        followup_measures=["Scale Name (Abbreviation)"],

        inclusion_criteria=["criterion 1", "criterion 2"],
        exclusion_criteria=["criterion 1", "criterion 2"],
        contraindications=SHARED_ABSOLUTE_CONTRAINDICATIONS + [
            "Condition-specific contraindication",
        ],
        safety_notes=SHARED_SAFETY_NOTES + [
            make_safety(
                category="precaution",
                description="Condition-specific safety note",
                severity="moderate",
            ),
        ],

        stimulation_targets=stimulation_targets,
        protocols=protocols,

        responder_criteria=["criterion 1", "criterion 2"],
        non_responder_pathway="...",

        evidence_summary="...",
        evidence_gaps=["gap 1"],
        review_flags=[],
        references=references,
        overall_evidence_quality=EvidenceLevel.MEDIUM,

        patient_journey_notes={
            "intake": "...",
            "baseline": "...",
            "treatment": "...",
            "checkpoint": "...",
            "endpoint": "...",
        },
        decision_tree_notes=["note 1"],
        clinical_tips=["tip 1"],
        governance_rules=SHARED_GOVERNANCE_RULES,
    )
```

**Minimum requirements before moving on:**
- At least 3 real PubMed references in `references`
- At least 1 `NetworkProfile` with `primary=True`
- At least 1 `PhenotypeSubtype`
- At least 1 `AssessmentTool` with a validated `scale_key`
- At least 1 `ProtocolEntry` with linked `phenotype_slugs`
- All off-label targets have `off_label=True` and `consent_required=True`
- `SHARED_ABSOLUTE_CONTRAINDICATIONS` included in `contraindications`

---

### Step 3 — Register in `CONDITION_BUILDERS`

Open `src/deepsynaps_studio/conditions/generators/__init__.py`.

Add an import for the new builder function:

```python
from .{slug} import build_{slug}_condition
```

Add the builder to `__all__`:

```python
__all__ = [
    # ... existing entries ...
    "build_{slug}_condition",
]
```

Add an entry to `CONDITION_BUILDERS`:

```python
CONDITION_BUILDERS = {
    # ... existing entries ...
    "{slug}": build_{slug}_condition,
}
```

The key must exactly match the `slug` value used in `condition_list.yaml` and
`ConditionSchema.slug`. The registry uses this dict to resolve `registry.get(slug)`.

---

### Step 4 — ConditionSchema Field Reference

The following table lists required and important optional fields. All field names
must be used exactly as shown (they are Pydantic model attributes).

#### Identity Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | `str` | Yes | Lowercase, underscores only. Must match `CONDITION_BUILDERS` key. |
| `display_name` | `str` | Yes | Human-readable name shown in documents and CLI output |
| `icd10` | `str` | Yes | ICD-10 code string (e.g. `"G20"`, `"F32"`) |
| `aliases` | `list[str]` | Recommended | Common names and abbreviations |
| `version` | `str` | No | Schema version string (default `"1.0"`) |
| `generated_at` | `str` | No | ISO date string; use `current_date_str()` |

#### Clinical Content Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `overview` | `str` | Yes | 2–4 sentence clinical overview |
| `pathophysiology` | `str` | Yes | Neurobiological mechanism summary |
| `core_symptoms` | `list[str]` | Yes | Primary symptom list |
| `non_motor_symptoms` | `list[str]` | No | Non-motor / comorbid symptoms |

#### Anatomy Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `key_brain_regions` | `list[str]` | Yes | Brain regions central to the condition |
| `brain_region_descriptions` | `dict[str, str]` | No | Region → description mapping |

#### Network Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `network_profiles` | `list[NetworkProfile]` | Yes | Functional network dysfunction profiles |
| `primary_network` | `NetworkKey \| None` | Yes | The most clinically relevant network |
| `network_rationale` | `str` | Recommended | Why the network model applies to this condition |

#### `NetworkProfile` Sub-Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `network` | `NetworkKey` | Yes | `DMN`, `CEN`, `SN`, `SMN`, `LIMBIC`, or `ATTENTION` |
| `dysfunction` | `NetworkDysfunction` | Yes | `HYPO`, `NORMAL`, or `HYPER` |
| `relevance` | `str` | Yes | Clinical explanation of network involvement |
| `primary` | `bool` | No | `True` for the single most important network |
| `severity` | `str` | No | `"mild"`, `"moderate"`, or `"severe"` |
| `evidence_note` | `str \| None` | No | Reference PMID or evidence note |

#### Phenotype Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `phenotypes` | `list[PhenotypeSubtype]` | Yes | Clinical subtypes |

#### `PhenotypeSubtype` Sub-Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `slug` | `str` | Yes | Unique within the condition; referenced by `ProtocolEntry.phenotype_slugs` |
| `label` | `str` | Yes | Display name for the phenotype |
| `description` | `str` | Yes | Clinical description |
| `key_features` | `list[str]` | Yes | Distinguishing clinical features |
| `primary_networks` | `list[NetworkKey]` | No | Networks most relevant to this subtype |
| `preferred_modalities` | `list[Modality]` | No | Recommended stimulation modalities |

#### Assessment Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `assessment_tools` | `list[AssessmentTool]` | Yes | Validated outcome measures |

#### `AssessmentTool` Sub-Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `scale_key` | `str` | Yes | Key matching `data/reference/scales_catalog.yaml` |
| `name` | `str` | Yes | Full scale name |
| `abbreviation` | `str` | Yes | Standard abbreviation |
| `domains` | `list[str]` | No | Domains measured |
| `timing` | `str` | No | `"baseline"`, `"weekly"`, `"monthly"`, or `"endpoint"` |
| `evidence_pmid` | `str \| None` | Recommended | PMID for scale validation study |

#### Protocol Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `stimulation_targets` | `list[StimulationTarget]` | Yes | Electrode/coil targets |
| `protocols` | `list[ProtocolEntry]` | Yes | Full treatment protocols |

#### `ProtocolEntry` Sub-Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `protocol_id` | `str` | Yes | Unique ID (e.g. `"parkinsons_tdcs_a"`) |
| `label` | `str` | Yes | Human-readable protocol label |
| `modality` | `Modality` | Yes | `TDCS`, `TPS`, `TAVNS`, `CES`, or `MULTIMODAL` |
| `target_region` | `str` | Yes | Full anatomical name of target |
| `target_abbreviation` | `str` | Yes | Standard abbreviation |
| `phenotype_slugs` | `list[str]` | Yes | Links protocol to one or more phenotype slugs |
| `network_targets` | `list[NetworkKey]` | No | Networks addressed by this protocol |
| `parameters` | `dict` | Yes | Key stimulation parameters (intensity, duration, sessions, etc.) |
| `rationale` | `str` | Yes | Evidence-based justification |
| `evidence_level` | `EvidenceLevel` | Yes | Strength of supporting evidence |
| `off_label` | `bool` | Yes | `True` for all off-label use |
| `session_count` | `int \| None` | No | Total sessions in the protocol block |
| `notes` | `str \| None` | No | Additional clinical notes |

#### Evidence Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `references` | `list[dict]` | Yes | Minimum 3 real PubMed references |
| `evidence_summary` | `str` | Yes | Narrative summary of evidence base |
| `evidence_gaps` | `list[str]` | Yes | Explicit list of evidence gaps |
| `review_flags` | `list[str]` | No | `ReviewFlag` values for items needing review |
| `overall_evidence_quality` | `EvidenceLevel` | Yes | Overall evidence quality for the condition |

---

### Step 5 — Include at Least 3 Real PubMed References

Before building documents, verify that all PMIDs in `references` are real:

```bash
# Verify a PMID manually
# Open in browser: https://pubmed.ncbi.nlm.nih.gov/{PMID}/

# Or use the ingest-evidence command to pull PubMed data
deepsynaps-studio ingest-evidence ingest --condition {slug} --max-results 20
```

The `ingest-evidence` command fetches and caches PubMed articles for each claim
category. Review the cached results in `data/raw/pubmed_cache/` to find candidate
PMIDs to add to your condition generator.

---

### Step 6 — Run the Smoke Test

Verify that the builder function runs without errors and returns a valid schema:

```bash
python -c "
from deepsynaps_studio.conditions.generators.{slug} import build_{slug}_condition
c = build_{slug}_condition()
print(c.display_name)
print(f'Networks: {len(c.network_profiles)}')
print(f'Phenotypes: {len(c.phenotypes)}')
print(f'Protocols: {len(c.protocols)}')
print(f'References: {len(c.references)}')
"
```

Expected output (values will vary):

```
Your Condition Name
Networks: 3
Phenotypes: 2
Protocols: 2
References: 5
```

If this raises an error, fix the issue before proceeding.

---

### Step 7 — Build All Documents and Run QA

Build all documents for both tiers:

```bash
deepsynaps-studio build condition --condition {slug} --tier both --doc-type all
```

Then run QA:

```bash
deepsynaps-studio qa report --condition {slug} --format markdown
```

A passing condition should show:

```
## Your Condition Name ({slug}) — PASS
- Documents: 15/15 passed
- Completeness: 100%
- Ready for clinical review: True
```

If any documents are missing or fail the size check, review the build output
for errors and re-run after fixing.

---

### Step 8 — Generate Visuals

```bash
deepsynaps-studio visuals render --condition {slug} --force
```

Verify that the following files are created in `outputs/visuals/{slug}/`:
- `{slug}_brain_map.png`
- `{slug}_network_diagram.png`
- `{slug}_symptom_flow.png`
- `{slug}_patient_journey.png`

---

## Evidence Intake and Sweep

Before building documents, perform an evidence sweep to ensure the condition has adequate
published support:

1. **Intake query**: Run `ingest-evidence ingest --condition {slug}` to pull PubMed
   results for all 13 claim categories.
2. **Review cached results**: Inspect `data/raw/pubmed_cache/` to identify candidate PMIDs.
3. **Manual verification**: Confirm each candidate PMID at `https://pubmed.ncbi.nlm.nih.gov/{PMID}/`.
4. **Draft references list**: Add verified PMIDs to the condition generator with correct
   `evidence_type` and `evidence_level` values.
5. **Clinical review**: Submit the draft condition to the Clinical Lead for sign-off before
   building final documents (required for all new conditions — see `docs/review_workflow.md`).
6. **Sign-off and export**: Once approved, the condition may be built and exported for
   clinical distribution.

---

## Common Errors

| Error | Likely Cause | Fix |
|---|---|---|
| `KeyError: '{slug}'` in registry | Not added to `CONDITION_BUILDERS` | Add import and entry to `__init__.py` |
| `ValidationError: field required` | Missing required ConditionSchema field | Add the missing field |
| `phenotype_slugs` mismatch | `ProtocolEntry.phenotype_slugs` references a non-existent phenotype slug | Check `PhenotypeSubtype.slug` values |
| Documents 0/15 passed in QA | Build failed silently | Re-run `build condition` and check for errors |
| `off_label_not_flagged` review flag | Off-label target missing `off_label=True` | Set `off_label=True` on all off-label targets |
| PMID not found | Fabricated or incorrect PMID | Verify at `https://pubmed.ncbi.nlm.nih.gov/{PMID}/` |
