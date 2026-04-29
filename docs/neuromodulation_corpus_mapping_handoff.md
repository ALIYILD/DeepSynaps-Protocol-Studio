# Neuromodulation Corpus Mapping Handoff

## Scope

This handoff maps the staged enriched neuromodulation literature corpus into
product-usable fields and identifies the minimum bundle assets required for
ingestion into the app evidence database.

Primary inspected sources:

- [data/research/neuromodulation/neuromodulation_master_database_enriched.csv](/Users/aliyildirim/DeepSynaps-Protocol-Studio/data/research/neuromodulation/neuromodulation_master_database_enriched.csv)
- [data/research/neuromodulation/manifest.json](/Users/aliyildirim/DeepSynaps-Protocol-Studio/data/research/neuromodulation/manifest.json)
- [apps/api/app/services/neuromodulation_research.py](/Users/aliyildirim/DeepSynaps-Protocol-Studio/apps/api/app/services/neuromodulation_research.py)
- [services/evidence-pipeline/import_neuromodulation_bundle.py](/Users/aliyildirim/DeepSynaps-Protocol-Studio/services/evidence-pipeline/import_neuromodulation_bundle.py)

## Important distinction

There are two different consumers of this corpus in the repo:

1. CSV-bundle service consumer
   - `apps/api/app/services/neuromodulation_research.py`
   - Reads staged files directly from `data/research/neuromodulation`
   - Expects a research bundle layout and several required CSV/JSON assets

2. App database ingestion consumer
   - `services/evidence-pipeline/import_neuromodulation_bundle.py --import-db`
   - Imports staged bundle assets into SQLite tables such as `papers`,
     `neuromodulation_paper_profiles`, `neuromodulation_safety_signals`,
     `trials`, `devices`, and aggregate evidence tables

The enriched master CSV is a useful superset for analysis and mapping, but the
current DB importer does not ingest that file directly. It ingests the raw and
derived bundle assets.

## Enriched master CSV: product-usable field mapping

The staged enriched paper file currently exposes these columns:

- Identity and provenance
  - `paper_key`
  - `source`
  - `id`
  - `pmid`
  - `pmcid`
  - `doi`
  - `record_url`
  - `source_exports`
  - Product use:
    - stable cross-file join key: `paper_key`
    - citation lookup and deep links: `pmid`, `pmcid`, `doi`, `record_url`
    - provenance/audit: `source`, `id`, `source_exports`

- Bibliographic display
  - `title`
  - `journal`
  - `journal_normalized`
  - `journal_quality_flag`
  - `authors`
  - `authors_normalized`
  - `first_author_normalized`
  - `author_groups`
  - `author_count`
  - `year`
  - `first_publication_date`
  - `first_index_date`
  - Product use:
    - research UI list cards
    - citation formatting
    - sorting and freshness
    - author/institution heuristics

- Study design and evidence strength
  - `pub_type`
  - `study_type_normalized`
  - `evidence_tier`
  - `paper_confidence_score`
  - `priority_score`
  - Product use:
    - ranking and reviewer triage
    - evidence-grade summaries
    - protocol governance support
    - downstream research RAG scoring

- Modality and protocol relevance
  - `primary_modality`
  - `canonical_modalities`
  - `invasiveness`
  - `target_tags`
  - `parameter_signal_tags`
  - `protocol_relevance_score`
  - `matched_query_terms`
  - Product use:
    - protocol suggestion candidate generation
    - modality-specific filtering
    - target/parameter extraction and review workflows

- Condition and population mapping
  - `indication_tags`
  - `condition_mentions_top`
  - `population_tags`
  - Product use:
    - indication-level search
    - condition evidence rollups
    - cohort-specific filtering

- Abstract, summary, and AI retrieval text
  - `abstract`
  - `abstract_status`
  - `research_summary`
  - `ai_ingestion_text`
  - Product use:
    - search/RAG retrieval body
    - research preview cards
    - abstract completeness diagnostics

- Outcomes and real-world evidence
  - `outcome_snippet_count`
  - `outcome_categories`
  - `real_world_evidence_flag`
  - Product use:
    - patient-outcome rollups
    - clinician-facing “real-world evidence” filters
    - endpoint category surfacing

- Safety and contraindications
  - `safety_signal_tags`
  - `contraindication_signal_tags`
  - Product use:
    - safety review panels
    - contraindication schema generation
    - protocol guardrails

- Regulatory and trial overlays
  - `trial_match_count`
  - `trial_top_nct_ids`
  - `trial_summary`
  - `trial_protocol_parameter_summary`
  - `fda_match_count`
  - `fda_top_clearances`
  - `fda_summary`
  - `regulatory_clinical_signal`
  - `trial_signal_score`
  - `fda_signal_score`
  - Product use:
    - evidence-plus-regulatory ranking
    - protocol template support
    - device/trial provenance links

- Access and citation velocity
  - `is_open_access`
  - `cited_by_count`
  - Product use:
    - open-access filtering
    - citation-based ranking
    - review prioritization

## Recommended normalized mapping into app DB tables

Current importer behavior already suggests this practical split:

- `papers`
  - source file: `raw/neuromodulation_all_papers_master.csv`
  - core fields:
    - `pmid`, `pmcid`, `doi`, `europepmc_id`
    - `title`, `abstract`, `year`, `journal`
    - `authors_json`, `pub_types_json`
    - `cited_by_count`, `is_oa`, `oa_url`
    - `sources_json`, `last_ingested`
  - product role:
    - canonical paper identity row
    - FTS/search baseline

- `neuromodulation_paper_profiles`
  - source file: `derived/neuromodulation_ai_ingestion_dataset.csv`
  - fields:
    - `paper_key`
    - `title_normalized`, `source`
    - `study_type_normalized`, `evidence_tier`
    - `canonical_modalities`, `primary_modality`, `invasiveness`
    - `indication_tags`, `population_tags`, `target_tags`
    - `parameter_signal_tags`
    - `protocol_relevance_score`
    - `matched_query_terms`, `source_exports`, `record_url`
    - `ai_ingestion_text`
    - `open_access_flag`, `citation_count`
  - product role:
    - main neuromodulation research search/filter profile
    - protocol parameter review input

- `neuromodulation_safety_signals`
  - source file: `derived/neuromodulation_safety_contraindication_signals.csv`
  - product role:
    - fast safety/contraindication panel by paper

- `neuromodulation_abstracts`
  - source file: `derived/neuromodulation_europepmc_abstracts.csv`
  - product role:
    - abstract backfill and retrieval audit

- `neuromodulation_evidence_graph`
  - source file: `derived/neuromodulation_evidence_graph.csv`
  - product role:
    - indication → modality → target aggregate edges

- `neuromodulation_protocol_templates`
  - source file: `derived/neuromodulation_protocol_template_candidates.csv`
  - product role:
    - pre-ranked protocol template suggestions

- `neuromodulation_indication_modality_summary`
  - source file: `derived/neuromodulation_indication_modality_summary.csv`
  - product role:
    - fast condition/modality evidence summary cards

- `neuromodulation_modality_summary`
  - source file: `derived/neuromodulation_modalities_summary.csv`
  - product role:
    - top-level modality counts

- `trials` and `neuromodulation_trial_metadata`
  - source file: `derived/neuromodulation_clinical_trials.csv`
  - product role:
    - trial context and protocol parameter support

- `devices` and `neuromodulation_fda_510k_records`
  - source file: `derived/neuromodulation_fda_510k_devices.csv`
  - product role:
    - device/regulatory support context

- `neuromodulation_condition_mentions`
  - source file: `derived/neuromodulation_condition_mentions.csv`
  - product role:
    - condition mention normalization beyond top tags

- `neuromodulation_patient_outcomes`
  - source file: `derived/neuromodulation_patient_outcomes.csv`
  - product role:
    - outcome snippets and endpoint extraction

## Minimum files required for DB ingestion

For `services/evidence-pipeline/import_neuromodulation_bundle.py --import-db`,
the practical minimum bundle is:

- `manifest.json`
- `raw/neuromodulation_all_papers_master.csv`
- `derived/neuromodulation_ai_ingestion_dataset.csv`
- `derived/neuromodulation_safety_contraindication_signals.csv`
- `derived/neuromodulation_evidence_graph.csv`
- `derived/neuromodulation_protocol_template_candidates.csv`
- `derived/neuromodulation_indication_modality_summary.csv`
- `derived/neuromodulation_modalities_summary.csv`

These are the files the importer treats as core and uses unconditionally in the
transaction.

Optional but strongly recommended:

- `derived/neuromodulation_europepmc_abstracts.csv`
- `derived/neuromodulation_clinical_trials.csv`
- `derived/neuromodulation_fda_510k_devices.csv`
- `derived/neuromodulation_condition_mentions.csv`
- `derived/neuromodulation_patient_outcomes.csv`

Without the optional set, ingestion still succeeds, but you lose:

- abstract enrichment completeness
- trial/device overlays
- condition mention normalization
- patient outcome snippets

## Minimum files required for the CSV-bundle API service

This is a different contract from DB ingestion. `apps/api/app/services/neuromodulation_research.py`
expects these required assets to exist in the staged bundle root:

- `raw/neuromodulation_all_papers_master.csv`
- `derived/neuromodulation_ai_ingestion_dataset.csv`
- `derived/neuromodulation_evidence_graph.csv`
- `derived/neuromodulation_protocol_template_candidates.csv`
- `derived/neuromodulation_safety_contraindication_signals.csv`
- `derived/neuromodulation_indication_modality_summary.csv`
- `top_condition_knowledge_base.json`
- `top_condition_exact_protocols.csv`
- `protocol_parameter_candidates.csv`
- `contraindication_safety_schema.csv`

So:

- minimum for DB import != minimum for API bundle browsing
- the enriched master CSV is not the runtime contract by itself

## Practical ingestion recommendation

If the target is app DB import, do not build a new importer around
`neuromodulation_master_database_enriched.csv` alone. Use the current importer
path and stage/import the bundle as designed:

```bash
python3 services/evidence-pipeline/import_neuromodulation_bundle.py --stage
python3 services/evidence-pipeline/import_neuromodulation_bundle.py --import-db
```

Use the enriched master CSV as:

- analyst review source
- reconciliation layer across raw + derived assets
- candidate source for future denormalized export endpoints

## Low-risk next step if productization continues

If a single product-facing paper API is needed later, add a read model or SQL
view that joins:

- `papers`
- `neuromodulation_paper_profiles`
- `neuromodulation_safety_signals`
- `neuromodulation_abstracts`

That would reproduce most of the enriched master CSV behavior inside the app DB
without changing the existing ingestion contract.
