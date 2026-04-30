# MedRAG & pgvector Readiness

## Current State (Preview/Dev)

MedRAG retrieval operates in **keyword-fallback mode**. The full dense
retrieval pipeline requires three optional dependencies that are not
installed in the preview environment:

| Dependency              | Purpose                       | Installed |
|-------------------------|-------------------------------|-----------|
| `pgvector`              | PostgreSQL vector similarity  | No        |
| `sentence-transformers` | Abstract embedding generation | No        |
| `psycopg`               | PostgreSQL wire protocol      | No        |

When any dependency is missing, MedRAG falls back to a deterministic
keyword-overlap ranker over a bundled `toy_papers.json` fixture. This
is tested and verified (6 tests in `test_medrag.py`).

## Health Endpoint

`GET /api/v1/health/ai` reports MedRAG as:

- **`fallback`** when pgvector/sentence-transformers/psycopg are missing
- **`active`** when all three are installed and a Postgres database is
  available with the `papers.embedding` column populated

## Upgrade Path to Production

1. Install `pgvector` PostgreSQL extension on the production database
2. Add `pgvector`, `sentence-transformers`, `psycopg` to the API
   container's Python requirements
3. Run `python scripts/embed_papers.py` to populate the
   `papers.embedding` column
4. Seed knowledge-graph entities via the MedRAG `build_kg()` method
5. Verify via `GET /api/v1/health/ai` that `medrag_retrieval` shows
   status `active`

## Feature Store (Optional)

The feature store (`packages/feature-store`) provides Redis-backed
real-time feature serving for ML inference. It is **not required** for
preview/launch and follows the same graceful fallback pattern:

- `RedisFeatureStoreClient` lazily imports `deepsynaps_features`
- On import failure, `build_feature_store_client()` returns
  `NullFeatureStoreClient` which yields empty features with
  `empty_reason: "feature_store_disabled"` metadata
- Configurable via `settings.feature_store_backend` (`"feast"`,
  `"in_memory"`, or default null)
