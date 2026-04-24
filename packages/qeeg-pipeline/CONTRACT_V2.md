# qEEG Pipeline — Contract V2 (AI Upgrades)

Extends `CONTRACT.md`. All 10 AI upgrades produce optional fields; legacy
pipelines keep working. Everything below is nullable on both sides of the
wire.

## 1. Pipeline / analysis additions

`PipelineResult.features` gains:

```python
{
  ...                 # everything from CONTRACT.md §1.1
  "embedding": [float, ...],          # 200-dim, LaBraM-Base shape
  "brain_age": {
    "predicted_years": float,
    "chronological_years": int | None,
    "gap_years": float,               # predicted - chronological
    "gap_percentile": float,          # 0–100 in normative cohort
    "confidence": "low"|"moderate"|"high",
    "electrode_importance": {"<ch>": float, ...},  # LRP saliency
  },
  "risk_scores": {                    # §6 "similarity indices", NOT "probability of disease"
    "mdd_like": {"score": 0.0..1.0, "ci95": [lo, hi]},
    "adhd_like": {"score": float, "ci95": [lo, hi]},
    "anxiety_like": {"score": float, "ci95": [lo, hi]},
    "cognitive_decline_like": {"score": float, "ci95": [lo, hi]},
    "tbi_residual_like": {"score": float, "ci95": [lo, hi]},
    "insomnia_like": {"score": float, "ci95": [lo, hi]},
  },
  "centiles": {                       # §4 GAMLSS output alongside the z-scores
    "spectral": {"bands": {"<band>": {"absolute_uv2": {"<ch>": float_0_100, ...}, "relative": {...}}}},
    "aperiodic": {"slope": {"<ch>": float_0_100, ...}},
    "norm_db_version": "gamlss-v1",
  },
  "explainability": {                 # §7 topomap attribution + OOD
    "per_risk_score": {
      "<risk_name>": {
        "channel_importance": {"<ch>": {"<band>": float}},  # gradient magnitudes
        "top_channels": [{"ch": str, "band": str, "score": float}, ...],
      }, ...
    },
    "ood_score": {"percentile": float_0_100, "distance": float, "interpretation": str},
    "adebayo_sanity_pass": bool,
    "method": "integrated_gradients",
  },
}
```

`PipelineResult` also gains:

```python
similar_cases: list[dict] = []        # §5 top-K neighbours
protocol_recommendation: dict | None  # §8 ProtocolRecommendation — see §5 below
longitudinal: dict | None             # §9 trajectory summary
```

## 2. DB migration 038 (additive)

```sql
CREATE EXTENSION IF NOT EXISTS vector;  -- wrapped in try/except; SQLite: no-op

ALTER TABLE qeeg_analyses ADD COLUMN embedding_json TEXT;            -- 200-dim JSON list (pgvector when available)
ALTER TABLE qeeg_analyses ADD COLUMN brain_age_json TEXT;            -- §1 brain_age dict
ALTER TABLE qeeg_analyses ADD COLUMN risk_scores_json TEXT;          -- §1 risk_scores dict
ALTER TABLE qeeg_analyses ADD COLUMN centiles_json TEXT;             -- §1 centiles dict
ALTER TABLE qeeg_analyses ADD COLUMN explainability_json TEXT;       -- §1 explainability dict
ALTER TABLE qeeg_analyses ADD COLUMN similar_cases_json TEXT;        -- list[dict]
ALTER TABLE qeeg_analyses ADD COLUMN protocol_recommendation_json TEXT;
ALTER TABLE qeeg_analyses ADD COLUMN longitudinal_json TEXT;
ALTER TABLE qeeg_analyses ADD COLUMN session_number INTEGER;         -- §9
ALTER TABLE qeeg_analyses ADD COLUMN days_from_baseline INTEGER;     -- §9

-- §3 hypergraph (create only if pgvector present; otherwise skip and log)
CREATE TABLE IF NOT EXISTS kg_entities (
  entity_id BIGSERIAL PRIMARY KEY,
  type VARCHAR(32),
  name TEXT,
  embedding_json TEXT
);
CREATE TABLE IF NOT EXISTS kg_hyperedges (
  edge_id BIGSERIAL PRIMARY KEY,
  relation VARCHAR(64),
  entity_ids_json TEXT,
  paper_ids_json TEXT,
  confidence REAL
);
```

Use `sa.Text()` + JSON for everything so SQLite works in dev/tests. Downgrade
drops all columns + tables (in reverse order).

## 3. `AnalysisOut` additions

```python
embedding:               Optional[list[float]] = None
brain_age:               Optional[dict] = None
risk_scores:             Optional[dict] = None
centiles:                Optional[dict] = None
explainability:          Optional[dict] = None
similar_cases:           Optional[list[dict]] = None
protocol_recommendation: Optional[dict] = None
longitudinal:            Optional[dict] = None
session_number:          Optional[int] = None
days_from_baseline:      Optional[int] = None
```

## 4. New API endpoints

All under `/api/v1/qeeg-analysis`:

- `POST /{id}/compute-embedding` — run LaBraM encoder, store `embedding_json`.
- `POST /{id}/predict-brain-age` — fill `brain_age_json`.
- `POST /{id}/score-conditions` — fill `risk_scores_json`.
- `POST /{id}/fit-centiles` — recompute `centiles_json` via GAMLSS.
- `POST /{id}/explain` — fill `explainability_json`.
- `GET  /{id}/similar-cases?k=10` — returns `similar_cases_json`.
- `POST /{id}/recommend-protocol` — fill `protocol_recommendation_json`.
- `GET  /patients/{patient_id}/trajectory` — longitudinal dashboard payload.
- `WS   /copilot/{id}` — §10 WebSocket chat with tool use.

Every endpoint is `require_minimum_role("clinician")`. Every handler MUST
return a graceful error envelope (no 500s) when the underlying module can't
run (missing model checkpoint, missing DB extension, etc.).

## 5. `ProtocolRecommendation` shape (§8)

```python
{
  "primary_modality": str,           # e.g. "rtms_10hz"
  "target_region": str,              # e.g. "L_DLPFC"
  "dose": {"sessions": int, "intensity": str, "duration_min": int, "frequency": str},
  "session_plan": {
    "induction":   {"sessions": int, "notes": str},
    "consolidation": {"sessions": int, "notes": str},
    "maintenance": {"sessions": int, "notes": str},
  },
  "contraindications": [str, ...],
  "expected_response_window_weeks": [int, int],
  "citations": [{"n": int, "pmid": str|None, "doi": str|None, "title": str, "url": str}, ...],
  "confidence": "low"|"moderate"|"high",
  "alternative_protocols": [ { ...same shape... } ],
  "rationale": str,                  # ≤ 1200 chars, banned-word sanitised
}
```

## 6. Frontend contract

New panels (each null-guarded — render empty when field absent):

1. **Brain-age card** — `analysis.brain_age`. Shows predicted / chronological / gap with a gauge, a small topomap of `electrode_importance`.
2. **Risk-score bars** — `analysis.risk_scores`. 6 horizontal bars with CI whiskers. Label = "Similarity index (research only)".
3. **Centile curves** — `analysis.centiles`. Per-feature centile pill (alongside z-score).
4. **Explainability overlay** — `analysis.explainability`. Topomap of top-channel-per-band per risk score. OOD badge + Adebayo pass/fail footer.
5. **Similar cases** — `analysis.similar_cases`. Horizontal card rack (top-K), each showing age/sex/condition/outcome/de-identified summary.
6. **Protocol recommendation** — `analysis.protocol_recommendation`. Full card with modality, S-O-Z-O session plan, dose, citations, alternatives, confidence badge.
7. **Longitudinal dashboard** — `analysis.longitudinal` plus a separate page at `?page=qeeg-analysis&tab=trajectory`. Sparklines per feature across sessions.
8. **Copilot chat** — floating widget, WS to `/copilot/{id}`. Auto-opens with a welcome message.

## 7. Cross-cutting rules (inherit from CONTRACT.md §6 + add)

- **Never** use words "diagnose", "diagnostic", "treatment recommendation".
- Risk scores are **"similarity indices"** or **"neurophysiological risk indicators"**, never "depression probability", "MDD score", etc.
- Every narrative must cite its papers — no hallucinated citations.
- Explainability panel must display OOD percentile + Adebayo sanity check result. If Adebayo fails, disable the topomap and show "attribution disabled (sanity check failed)".
- All heavy deps (`torch`, `sentence_transformers`, `pgvector`, `pcntoolkit`, `captum`, `networkx`) are import-guarded at module top with clear `HAS_<DEP>` flags. Missing dep → stub returns deterministic demo data + logged warning.

## 8. Ownership

| Agent | Upgrades | Files |
|---|---|---|
| **E** (ML primitives) | 1, 2, 4, 7 | `packages/qeeg-pipeline/src/deepsynaps_qeeg/ml/{foundation_embedding,brain_age}.py`, `normative/gamlss.py`, `ai/explainability.py`, tests |
| **F** (Retrieval + risk + recommender) | 3, 5, 6, 8 | `ai/{medrag,similar_cases,risk_scores,protocol_recommender}.py`, tests |
| **G** (Longitudinal + copilot + API) | 9, 10 + API wiring | `ai/longitudinal.py`, `apps/api/app/routers/qeeg_copilot_router.py`, extensions to `qeeg_analysis_router.py` (new endpoints only — existing endpoints untouched), `services/qeeg_ai_bridge.py`, extended `persistence/models.py`, extended `AnalysisOut` pydantic. Alembic migration 038 edits allowed. |
| **H** (Frontend) | Visibility for all 10 | `apps/web/src/pages-qeeg-analysis.js` (new panels + demo data), `apps/web/src/qeeg-ai-panels.js` (new helper), `apps/web/src/styles.css` additions, new WS client helper. |

## 9. Constraints

- Do NOT run `git commit`, `git push`, `alembic upgrade`, `pip install`, `pytest`.
- Do NOT download model checkpoints (LaBraM, sentence-transformers) — writes that fetches the checkpoint are fine, but the actual download must not execute in this env.
- Do NOT touch files outside your ownership list.
- Everything must be additive. Legacy `/analyze`, `/analyze-mne`, `/ai-report` endpoints stay fully functional.
- Tests that need heavy deps: `pytest.importorskip`.
- Deterministic demo stubs: seeded with a hash of the analysis id so UI looks stable across reloads.
