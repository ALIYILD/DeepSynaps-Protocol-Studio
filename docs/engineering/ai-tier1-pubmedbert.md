# Tier 1 — PubMedBERT Clinical Entity Extractor

Extracts clinical entities (conditions, medications, procedures, anatomy)
from free clinical text using a biomedical BERT model. Feeds structured
entities into downstream consumers (MedRAG citations filter, Tier 1 LLM
context tagging, audit highlights).

## Status: stub

- Service: `apps/api/app/services/ai/tier1_pubmedbert/`
- Router: `/api/v1/ai/pubmedbert/*`
- 5 tests, all pass locally
- No transformer loaded, no entities fabricated

## Endpoints

| Method | Path                          | Role        |
|--------|-------------------------------|-------------|
| GET    | `/api/v1/ai/pubmedbert/health`  | any auth    |
| POST   | `/api/v1/ai/pubmedbert/extract` | clinician+  |

## Configuration

| Variable                | Default | Purpose                                 |
|-------------------------|---------|-----------------------------------------|
| `PUBMEDBERT_MODEL_PATH` | unset   | HF model id or local path to weights.   |

## Follow-up

1. Load HF model (`microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract`
   or a NER-fine-tuned variant).
2. Tokenise input, run NER head, return offset-aligned `PubmedbertEntity` list.
3. Add `transformers` / `torch` to optional dependency extra.
4. Promote env var to `AppSettings`.

## Upstream

- PubMedBERT: <https://huggingface.co/microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract>

Phase 3 — Phase B Month 2-3.
