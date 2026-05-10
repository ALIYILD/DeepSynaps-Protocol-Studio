# Neuromodulation Evidence Terminal

## Product Goal

Turn the existing `research-evidence` workspace into a serious neuromodulation evidence intelligence surface backed by the canonical evidence SQLite database. The terminal must use real database records only, expose provenance clearly, and degrade honestly when the local evidence DB is unavailable.

The product posture is decision support for clinicians and researchers, not autonomous clinical action.

## Backend Endpoints

Planned terminal namespace:
- `GET /api/v1/evidence/terminal/status`
- `GET /api/v1/evidence/terminal/overview`
- `GET /api/v1/evidence/terminal/indications`
- `GET /api/v1/evidence/terminal/indications/{indication_id}`
- `GET /api/v1/evidence/terminal/papers/search`
- `GET /api/v1/evidence/terminal/papers/{paper_id}`
- `GET /api/v1/evidence/terminal/trials/search`
- `GET /api/v1/evidence/terminal/protocols/search`
- `GET /api/v1/evidence/terminal/network`
- `GET /api/v1/evidence/terminal/grade-distribution`

Design intent:
- keep existing `/api/v1/evidence/*` routes for compatibility
- expose a terminal-specific contract for dashboard/search consumers
- use a dedicated service layer so router growth stays controlled

## Frontend Layout

Primary route:
- `research-evidence`

Terminal direction:
- keep the existing workspace route and safety framing
- make the terminal the primary dense dashboard/search experience
- preserve older tabs and deep links where useful

Planned terminal sections:
- title and DB status strip
- metric cards
- grade and modality distributions
- top indications panels
- corpus relationship panels
- paper search panel with filters and pagination
- indication explorer
- paper detail panel
- optional local evidence basket

Charting approach:
- use lightweight HTML/CSS/SVG charts first
- avoid adding a new charting dependency for v1

## Data Model Mapping

Canonical DB core:
- `papers`
- `indications`
- `paper_indications`
- `trials`
- `trial_indications`
- `protocols`
- `paper_trial_links`
- `devices`
- `device_indications`

Important live columns:
- `papers.pmid`
- `papers.doi`
- `papers.title`
- `papers.abstract`
- `papers.year`
- `papers.journal`
- `papers.authors_json`
- `papers.sources_json`
- `papers.abstract_source`
- `indications.evidence_grade`
- `indications.computed_evidence_grade`
- `protocols.confidence`
- `paper_trial_links.nct_id`
- `paper_trial_links.source`

Constraint:
- the live DB does not include every planned enrichment column from older assumptions, so terminal queries must stay aligned to confirmed schema only

## DB Query Strategy

Read strategy:
- safe SQLite reads only
- bounded query size
- pagination everywhere relevant
- FTS via `papers_fts` and `trials_fts` when supported
- no full-table materialization of the paper corpus

Query patterns:
- status/overview from aggregate counts
- indications from `indications` plus grouped counts from junction tables
- paper search from `papers` plus optional `papers_fts`
- paper detail from one paper row plus joined indication/trial/protocol projections
- trial search from `trials` plus optional `trials_fts`
- protocol search from `protocols` joined to `indications`
- network from bounded indication-scoped joins across paper/trial/protocol links

Future index recommendations should be documented separately if not safely added in this implementation.

## Safety Model

Required positioning:
- evidence intelligence is decision support only
- no diagnosis or prescribing claims
- no invented citations, abstracts, grades, or protocol parameters

Required labels:
- database-derived evidence support
- computed evidence grade, review required
- extracted protocol relationship, verify before clinical use
- abstract not available in local database
- missing DOI/PMID as not available

Required caveats:
- clinician/researcher review remains necessary
- protocol links are extracted relationships, not validated treatment instructions
- computed grades are support signals derived from available DB records

## Limitations

Known implementation constraints:
- canonical DB is SQLite and can be lock-sensitive during concurrent maintenance
- search relevance will be limited to the current FTS/basic query capabilities
- modality inference should use actual indication modality and related links, not fabricated paper-level modality tags that do not exist in this DB
- the existing `research-evidence` page is large and already carries legacy UI concerns

## Future Upgrades

Future-proofing directions:
- evidence basket export and Protocol Studio handoff
- richer FTS5 ranking and synonym support
- graph visualization beyond bounded node sets
- DeepTwin hypothesis-context integration
- report generator insertion flows with explicit review state
- admin evidence-health dashboard for freshness, coverage, orphan counts, and failed enrichments
