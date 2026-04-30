# AI Feature Readiness Matrix

> Generated: 2026-04-30 | Branch: `audit/fix-fullstack-readiness`

## Endpoint

`GET /api/v1/health/ai` returns a live readiness report. This document is the
static reference.

## Feature Matrix

| Feature | Type | Status | Required Env Vars | Required Packages | Required Weights | Clinical Safety |
|---|---|---|---|---|---|---|
| `chat_copilot` | Real AI (LLM) | Depends on config | `GLM_API_KEY` or `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | openai, anthropic | - | General assistant, no clinical claims |
| `qeeg_interpreter` | Real AI (LLM) | Depends on config | Same as chat_copilot | openai, anthropic | - | Decision-support only, clinician review required |
| `medrag_retrieval` | Real AI (embeddings) | Fallback to keyword | - | pgvector, sentence_transformers, psycopg | - | Literature search, no clinical decision |
| `mri_brain_age_cnn` | Real AI (CNN) | Unavailable | - | torch | `BRAINAGE_WEIGHTS_PATH` | Research-grade, not FDA cleared |
| `qeeg_foundation_labram` | Real AI (transformer) | Unavailable/Fallback | - | torch | `FOUNDATION_WEIGHTS_DIR` | Falls back to lightweight projector |
| `risk_score_predictor` | Real AI (ML) | Unavailable/Fallback | - | torch | - | Falls back to heuristic scoring |
| `qeeg_trainer` | Real AI (DL) | Unavailable | - | torch, braindecode | - | Training pipeline, no patient-facing output |
| `qeeg_protocol_recommendations` | Rule-based | Depends on package | - | deepsynaps_qeeg | - | CSV registry lookup, not AI inference |
| `generation_engine` | Rule-based | Active | - | - | - | Protocol generation from registry |
| `safety_engine` | Rule-based | Active | - | - | - | Governance enforcement, no AI |
| `deeptwin_encoders` | Rule-based | Not Implemented | - | numpy | - | Deterministic feature engineering, no downstream model |
| `deeptwin_simulation` | Placeholder | Not Implemented | `DEEPSYNAPS_ENABLE_DEEPTWIN_SIMULATION` | - | - | Stub data for UI development only |
| `brain_twin_app` | Placeholder | Not Implemented | - | - | - | No implementation, placeholder only |
| `evidence_pipeline` | Data ETL | Active | - | - | - | PubMed/OpenAlex ingest, no AI inference |

## Clinical Safety Caveat

All AI-powered features in DeepSynaps Protocol Studio are **decision-support
tools**. They do **not** constitute medical advice, diagnosis, or prescription.
Every AI output requires clinician review before being acted upon. Features
marked "Not Implemented" or "Placeholder" return deterministic stub data and
must not be interpreted as real clinical predictions.

## Status Definitions

| Status | Meaning |
|---|---|
| `active` | Fully operational with all dependencies met |
| `degraded` | Partially operational, some capabilities reduced |
| `fallback` | Real AI unavailable, using simpler alternative |
| `unavailable` | Required dependencies missing, feature disabled |
| `not_implemented` | Feature designed but no production model connected |
| `rule_based` | Deterministic logic, no AI/ML inference |
