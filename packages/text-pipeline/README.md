# deepsynaps-text

Clinical text ingestion, de-identification, and NLP for DeepSynaps Studio.

## Development

```bash
cd packages/text-pipeline
pip install -e .
pytest
```

## Pilot / audit configuration

See `docs/CLINICAL_READINESS.md` for supervised-clinician use framing.

| Variable | Effect |
|----------|--------|
| `DEEPSYNAPS_TEXT_PERSIST_RUNS=1` | Persist each `TextPipelineRun` as JSON (requires `DEEPSYNAPS_TEXT_RUN_STORE_DIR`) |
| `DEEPSYNAPS_TEXT_RUN_STORE_DIR` | Directory for run JSON files |
| `DEEPSYNAPS_TEXT_RULES_ONLY_NLP=1` | Force rule-based NER backend for reproducible pilots |
| `DEEPSYNAPS_TEXT_DISABLE_LLM=1` | Reserved for future LLM pipeline stages |
