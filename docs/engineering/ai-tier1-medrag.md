# Tier 1 — MedRAG Evidence Retrieval

MedRAG is the retrieval-augmented evidence layer that sits between the
Tier 1 clinical-reasoning LLM and the existing DeepSynaps evidence DB.
For any clinician question, MedRAG retrieves ranked citations (papers,
trials, FDA records) and returns them as structured `MedragCitation`
objects. Downstream callers feed the citations into
`ClinicalReasoningRequest.context` for evidence grounding.

## Status: stub

This PR ships the contract only:

- Service package `apps/api/app/services/ai/tier1_medrag/`
- Router `apps/api/app/routers/ai_tier1_medrag_router.py` mounted at `/api/v1/ai/medrag`
- Schemas, canonical disclaimer
- Stub `MedragRetriever` that returns `stub: True, answer: None, citations: []`
- 7 tests covering health, role gating, schema validation, OpenAPI registration

**No embedding model loaded, no DB connection opened, no fabricated
citations.** The citations list is always empty in stub mode.

## Endpoints

| Method | Path                          | Role        | Notes                                |
|--------|-------------------------------|-------------|--------------------------------------|
| GET    | `/api/v1/ai/medrag/health`    | any auth    | Reports stub status.                 |
| POST   | `/api/v1/ai/medrag/query`     | clinician+  | Returns stub envelope.               |

Every query response carries
`disclaimer = "Evidence-grounded summary. Citations must be reviewed for clinical relevance. Not a clinical recommendation."`

## Configuration

Read from environment at process start:

| Variable                   | Default | Purpose                                              |
|----------------------------|---------|------------------------------------------------------|
| `MEDRAG_EMBEDDING_MODEL`   | unset   | Name of the embedding model (e.g. `pubmedbert-mini`).|
| `MEDRAG_EVIDENCE_DB_URI`   | unset   | Pointer to the evidence DB.                          |
| `MEDRAG_TOP_K_DEFAULT`     | `5`     | Default `top_k` if the request omits it.             |

While the embedding model or DB pointer is unset, every `/query` call
returns stub.

## Pairing with Tier 1 LLM

Typical caller flow once both adapters are real:

1. `POST /api/v1/ai/medrag/query` with the clinician question →
   structured `citations`.
2. Map each citation to a context line (e.g. `f"[{c.year}] {c.title} — {c.evidence_grade}"`).
3. `POST /api/v1/ai/tier1/complete` with the question as `prompt` and
   the context lines as `context: list[str]`.

This keeps the LLM grounded in retrievable evidence and prevents the
"confident-but-uncited" failure mode.

## Follow-up work (not in this PR)

1. **Wire an embedding model.** Suggested first target: PubMedBERT (or
   `pubmedbert-base-embeddings-matryoshka` for compact deploys). Add
   `sentence-transformers` to the dependency surface in the follow-up.
2. **Plug into the existing evidence DB.** Use the existing
   `evidence_router` / pgvector tables (see `admin_pgvector_router`).
3. **OpenAlex / PubMed fallback.** When the local DB has no matching
   record, fall back to external retrieval with explicit rate limits.
4. **Citation ranking.** Combine cosine similarity, evidence grade, and
   recency. Surface `relevance_score` in `MedragCitation`.
5. **Promote env vars to `AppSettings`** once the contract is settled.

## Upstream references

- MedRAG benchmark: <https://github.com/Teddy-XiongGZ/MedRAG>
- PubMedBERT: <https://huggingface.co/microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract>
- OpenAlex: <https://docs.openalex.org/>

## Phase 3 context

Week 6-8 P1 in the DeepSynaps AI roadmap. Pairs with Tier 1 LLM (the
consumer of MedRAG citations) and the existing evidence DB (the data
source).
