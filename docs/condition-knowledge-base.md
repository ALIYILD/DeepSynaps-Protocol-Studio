# Condition Knowledge Base

This repo now includes research-derived condition knowledge snapshots under `data/conditions/research-kb/`.

Purpose:
- Provide a compact, condition-specific evidence layer for retrieval, ranking, and protocol-personalization pipelines.
- Bridge the large neuromodulation research bundle into repo-native JSON that can be loaded alongside the authoritative condition packages in `data/conditions/*.json`.
- Keep raw literature exports separate from the curated condition packages so editors can refresh evidence snapshots without rewriting clinical copy by hand.

Current priority conditions:
- `major-depressive-disorder`
- `ptsd`
- `chronic-pain-fibromyalgia`
- `parkinsons-disease`
- `obsessive-compulsive-disorder`
- `drug-resistant-epilepsy`
- `stroke-rehabilitation`

Each knowledge file contains:
- corpus-level research stats for the mapped indication tag
- modality-level evidence summaries
- target-level evidence summaries
- ranked protocol template candidates
- safety and contraindication signal counts
- representative high-signal papers
- provenance back to the Desktop neuromodulation bundle assets used to generate the snapshot

Authoritative boundaries:
- `data/conditions/*.json` remains the source of truth for protocol governance, patient-facing wording, and clinical exports.
- `data/conditions/research-kb/*.json` is a research/ranking layer only. It must not be used as a stand-alone prescribing source.

Regeneration:

```bash
python3 data/conditions/generate_priority_condition_knowledge.py \
  --bundle-dir ~/Desktop/neuromodulation_research_bundle_2026-04-22 \
  --output-dir data/conditions/research-kb
```

The generator expects these bundle files:
- `neuromodulation_ai_ingestion_dataset.csv`
- `neuromodulation_evidence_graph.csv`
- `neuromodulation_protocol_template_candidates.csv`
- `neuromodulation_safety_contraindication_signals.csv`

Runtime access:
- `deepsynaps_condition_registry.get_condition_knowledge(slug)`
- `deepsynaps_condition_registry.list_condition_knowledge()`
- `deepsynaps_condition_registry.list_condition_knowledge_slugs()`

Schema:
- `packages/core-schema/src/deepsynaps_core_schema/condition_knowledge.py`

Validation path used for this update:

```bash
uv run --python 3.11 --no-project \
  --with-editable packages/core-schema \
  --with-editable packages/condition-registry \
  --with pydantic \
  python - <<'PY'
from deepsynaps_condition_registry import get_condition_knowledge
kb = get_condition_knowledge("ptsd")
print(kb.condition_name, kb.research_stats.total_papers)
PY
```
