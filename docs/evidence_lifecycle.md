# Evidence Lifecycle

## Overview

Every clinical claim in the DeepSynaps Studio platform must be traceable to evidence. The evidence lifecycle manages the full chain from PubMed query to document citation.

## Stages

### 1. Query Planning (`evidence/query_planner.py`)

`QueryPlanner.plan_condition()` generates PubMed search queries for all 13 `ClaimCategory` values:
- Pathophysiology, brain regions, network involvement
- Stimulation targets, parameters, modality rationale
- Safety, contraindications, responder criteria
- Assessment tools, inclusion/exclusion, clinical phenotypes

### 2. Evidence Retrieval (`evidence/pubmed_client.py`)

`PubMedClient.search()` executes queries against NCBI Entrez:
- Respects rate limits (0.34s with API key, 1.0s without)
- Caches results in `EvidenceCache` (30-day TTL)
- Returns `ArticleMetadata` with PMID, evidence type, evidence level

### 3. Deduplication (`evidence/deduper.py`)

`deduplicate_evidence_items()` merges duplicate PMIDs:
- Keeps the record with the higher relevance score
- Fills missing fields from the duplicate
- Returns `DeduplicationResult` with merge log

### 4. Ranking (`evidence/ranker.py`)

`rank_evidence_items()` scores by:
- Evidence level weight (systematic review = 5, case report = 1)
- Recency bonus (current year = +2, 1 year = +1.5)
- Relation bonus (supporting = +1)
- Key finding richness bonus
- Population match bonus

### 5. Clustering (`evidence/clusterer.py`)

`cluster_into_bundles()` groups items by `ClaimCategory`:
- Each bundle gets a confidence label based on item count and evidence levels
- Contradictions within bundles are flagged

### 6. Contradiction Detection (`evidence/contradiction.py`)

`detect_contradictions()` finds conflicting evidence:
- Relation-based: SUPPORTS vs CONTRADICTS in same bundle
- Keyword-based: "effective" vs "no effect" / "ineffective"
- Results exposed in bundle metadata and QA reports

### 7. Snapshot (`evidence/snapshots.py`)

`SnapshotManager.create_snapshot()` freezes evidence state:
- Snapshot ID: `snap-{condition}-{timestamp}`
- Content hash for regression detection
- Stored as JSON, linked to build manifests

## Evidence-to-Claim Chain

```
PubMed → ArticleMetadata → EvidenceItem → EvidenceBundle → SectionClaim → DocumentSpec
```

Every `SectionClaim` in a document section contains:
- `supporting_pmids` — PMIDs that back the claim
- `contradicting_pmids` — PMIDs that contradict
- `confidence` — high/medium/low/insufficient
- `requires_review` — True if insufficient or contradicted

## Insufficient Evidence Policy

When evidence is insufficient for a claim:
1. `SectionClaim.insufficient_evidence = True`
2. `SectionClaim.requires_review = True`
3. Confidence label set to `INSUFFICIENT`
4. Clinical language prefix: "⚠ Requires clinical review — evidence insufficient:"
5. QA engine flags as `WARNING` (not BLOCK, since absence of evidence is not a safety issue per se)

**Never fabricate evidence to fill gaps. Always emit explicit insufficient-evidence markers.**
