# qEEG Pipeline — Shared Contract

This document is the single source of truth for the feature dict, DB schema, API
response shape, and frontend expectations. All four integration agents
(pipeline, backend, frontend, AI) must conform to this contract.

The standalone scaffold lives at:
`C:/Users/yildi/OneDrive/Desktop/deepsynaps_qeeg_analyzer/`

The DeepSynaps Protocol Studio monorepo (consumer) lives at:
`C:/Users/yildi/OneDrive/Desktop/deepsynaps_protocol_studio_ref/`

Studio installs the scaffold as an editable path dep so the pipeline is
authoritative and shared.

---

## 1. Pipeline output — `PipelineResult`

`deepsynaps_qeeg.pipeline.run_full_pipeline(...)` returns:

```python
PipelineResult(
    features: dict,          # see §1.1
    zscores: dict,           # see §1.2
    flagged_conditions: list[str],   # lowercase condition slugs, e.g. "adhd", "anxiety"
    quality: dict,           # see §1.3
    report_html: str | None, # rendered HTML (may be None if report stage skipped)
    report_pdf_path: Path | None,
)
```

### 1.1 `features` dict

```python
{
  "spectral": {
    "bands": {
      "<band>": {              # band in {delta, theta, alpha, beta, gamma}
        "absolute_uv2": {"<ch>": float, ...},   # per channel, µV²
        "relative":     {"<ch>": float, ...},   # fraction of total power
      },
      ...
    },
    "aperiodic": {
      "slope":   {"<ch>": float, ...},         # SpecParam 1/f exponent
      "offset":  {"<ch>": float, ...},
      "r_squared": {"<ch>": float, ...},
    },
    "peak_alpha_freq": {"<ch>": float | None, ...},  # Hz, 7–13 Hz window
  },
  "connectivity": {
    "wpli":       {"<band>": [[float, ...], ...]},  # N_ch x N_ch matrix
    "coherence":  {"<band>": [[float, ...], ...]},
    "channels":   ["<ch>", ...],                     # row/col order
  },
  "asymmetry": {
    "frontal_alpha_F3_F4": float,  # ln(F4) − ln(F3); positive = left hypoactivation
    "frontal_alpha_F7_F8": float,
  },
  "graph": {
    "<band>": {
      "clustering_coef": float,
      "char_path_length": float,
      "small_worldness": float,
    },
    ...
  },
  "source": {
    "roi_band_power": {
      "<band>": {"<dk_roi>": float, ...}   # 68 Desikan-Killiany ROIs
    },
    "method": "eLORETA" | "sLORETA",
  },
}
```

### 1.2 `zscores` dict

```python
{
  "spectral": {
    "bands": {
      "<band>": {
        "absolute_uv2": {"<ch>": float, ...},     # z-score
        "relative":     {"<ch>": float, ...},
      },
      ...
    }
  },
  "aperiodic": {"slope": {"<ch>": float, ...}},
  "flagged": [
    {"metric": "spectral.bands.theta.absolute_uv2", "channel": "Fz", "z": 2.81},
    ...
  ],
  "norm_db_version": "toy-0.1" | "nih-v1" | ...,
}
```

### 1.3 `quality` dict

```python
{
  "n_channels_input": int,
  "n_channels_rejected": int,
  "bad_channels": ["<ch>", ...],
  "n_epochs_total": int,
  "n_epochs_retained": int,
  "ica_components_dropped": int,
  "ica_labels_dropped": {"<label>": int, ...},  # e.g. {"eye": 2, "muscle": 1}
  "sfreq_input": float,
  "sfreq_output": float,
  "bandpass": [1.0, 45.0],
  "notch_hz": 50.0,
  "pipeline_version": "0.1.0",
}
```

---

## 2. DB schema — migration 037

Add to `qeeg_analyses` (Studio's existing table):

| column | type | notes |
|---|---|---|
| `aperiodic_json`         | TEXT | `{"slope": {...}, "offset": {...}, "r_squared": {...}}` |
| `peak_alpha_freq_json`   | TEXT | `{"<ch>": float, ...}` |
| `connectivity_json`      | TEXT | `{"wpli": {...}, "coherence": {...}, "channels": [...]}` |
| `asymmetry_json`         | TEXT | `{"frontal_alpha_F3_F4": float, "frontal_alpha_F7_F8": float}` |
| `graph_metrics_json`     | TEXT | per-band graph metrics |
| `source_roi_json`        | TEXT | `{"<band>": {"<dk_roi>": float}}` |
| `normative_zscores_json` | TEXT | full zscores dict from §1.2 |
| `flagged_conditions`     | TEXT | JSON array of lowercase slugs |
| `quality_metrics_json`   | TEXT | quality dict from §1.3 |
| `pipeline_version`       | VARCHAR(16) | e.g. `"0.1.0"` |
| `norm_db_version`        | VARCHAR(16) | e.g. `"toy-0.1"` |

All columns are nullable. The existing `band_powers_json` /
`artifact_rejection_json` / `advanced_analyses_json` columns remain and are
populated in parallel (backward compatibility).

---

## 3. API — `AnalysisOut` additions

`apps/api/app/routers/qeeg_analysis_router.py :: AnalysisOut` gains:

```python
aperiodic:          Optional[dict] = None
peak_alpha_freq:    Optional[dict] = None
connectivity:       Optional[dict] = None
asymmetry:          Optional[dict] = None
graph_metrics:      Optional[dict] = None
source_roi:         Optional[dict] = None
normative_zscores:  Optional[dict] = None
flagged_conditions: Optional[list[str]] = None
quality_metrics:    Optional[dict] = None
pipeline_version:   Optional[str] = None
norm_db_version:    Optional[str] = None
```

Each is loaded from the corresponding `*_json` column (or plain column for
`pipeline_version` / `norm_db_version` / `flagged_conditions`).

`AIReportOut` stays unchanged except `literature_refs` now carries the RAG
citations (see §5).

---

## 4. Frontend contract

`apps/web/src/pages-qeeg-analysis.js` consumes the analysis object from
`GET /api/v1/qeeg-analysis/{id}` and renders new sections when the
corresponding fields are non-null:

1. **Pipeline quality strip** — from `quality_metrics`: rejected channels,
   dropped ICs by label, retained epochs, resampled sfreq. Also show
   `pipeline_version` + `norm_db_version` footer badge.
2. **SpecParam panel** — from `aperiodic` + `peak_alpha_freq`: per-channel
   slope and PAF in a compact table, with colour on slope extremes.
3. **eLORETA ROI panel** — from `source_roi`: 68 Desikan-Killiany ROIs grouped
   by lobe (frontal, parietal, temporal, occipital, cingulate, insular),
   per-band power.
4. **Normative z-score heatmap** — from `normative_zscores`: channel × band
   grid, colour scale diverging red/blue, red flag ≥|1.96|, dark red ≥|2.58|.
   Tooltip shows exact metric path from `flagged[*].metric`.
5. **Asymmetry + graph strip** — from `asymmetry` + `graph_metrics`.
6. **AI narrative + citations** — from `AIReportOut.ai_narrative` +
   `literature_refs`: each citation [1][2]… links to its PMID / DOI.

Add tests in `apps/web/src/pages-qeeg-analysis.test.js` (create if missing)
that exercise the new render paths with fixture payloads.

---

## 5. AI / RAG contract

`qeeg_ai_interpreter.generate_ai_report(...)` accepts the new feature dict
(signature change: kwargs `features`, `zscores`, `flagged_conditions`,
`quality`). Legacy `band_powers` kwarg remains accepted for backward
compatibility and is synthesised from `features.spectral.bands` if missing.

Inside, it:

1. Calls `deepsynaps_qeeg.report.rag.query_literature(...)` with
   `flagged_conditions` + the top 3 modalities implied by the findings
   (modalities are a fixed mapping, see scaffold `report/rag.py`).
2. RAG returns `list[dict]` with keys: `pmid`, `doi`, `title`, `authors`,
   `year`, `journal`, `abstract`, `relevance_score`.
3. LLM prompt embeds top 10 abstracts with numbered citation anchors
   `[1] ... [10]`.
4. Output:
   ```python
   {
     "data": {
       "executive_summary": str,          # ≤ 1200 chars, no "diagnose" / "treatment recommendation"
       "findings": [{"region": str, "band": str, "observation": str, "citations": [int]}, ...],
       "protocol_recommendations": [...],  # unchanged shape
       "confidence_level": "low" | "moderate" | "high",
     },
     "literature_refs": [
       {"n": 1, "pmid": "...", "doi": "...", "title": "...", "year": 2024, "url": "..."},
       ...
     ],
     "model_used": str,
     "prompt_hash": str,
   }
   ```
5. Router persists `report_result["literature_refs"]` into
   `QEEGAIReport.literature_refs_json`.
6. `AiSummaryAudit.sources_used` includes `"qeeg_rag_literature"`.

---

## 6. Cross-cutting rules (from scaffold CLAUDE.md)

- Never use the words "diagnosis", "diagnostic", "treatment recommendation" in
  user-facing strings.
- Label outputs "research/wellness use".
- Always log `pipeline_version` + `norm_db_version` into every persisted
  analysis.
- No MATLAB deps, no proprietary readers, all I/O via MNE.
- The pipeline must guard heavy scientific imports behind try/except with a
  clear "dependency missing" error returned via `PipelineResult.quality` —
  never crash the API worker.

---

## 7. What each agent owns

| Agent | Directory | Files |
|---|---|---|
| A (pipeline) | `deepsynaps_qeeg_analyzer/` | `src/deepsynaps_qeeg/{preprocess,artifacts,cli}.py`, `features/*`, `source/*`, `normative/*`, `report/*`, `pipeline.py`, `tests/*` |
| B (backend) | `deepsynaps_protocol_studio_ref/` | `apps/api/pyproject.toml`, `apps/api/app/services/spectral_analysis.py`, `apps/api/app/services/analyses/*`, `apps/api/alembic/versions/037_qeeg_mne_pipeline_fields.py`, `apps/api/app/persistence/models.py` (new columns), `apps/api/app/routers/qeeg_analysis_router.py` (AnalysisOut + persistence), `apps/worker/app/jobs.py` |
| C (frontend) | `deepsynaps_protocol_studio_ref/apps/web/` | `src/pages-qeeg-analysis.js`, `src/pages-qeeg-analysis.test.js`, `src/styles.css` (new sections) |
| D (AI+RAG) | `deepsynaps_protocol_studio_ref/` | `apps/api/app/services/qeeg_ai_interpreter.py`, `apps/api/app/routers/qeeg_analysis_router.py` (generate_ai_report_endpoint plumbing ONLY — B owns AnalysisOut) |

**File collision matrix**: B and D both touch `qeeg_analysis_router.py` —
B edits `AnalysisOut` (top of file), D edits `generate_ai_report_endpoint`
(~line 511). Non-overlapping line ranges.

---

## 8. Constraints for agents

- Do NOT run `git commit` or `git push`. Leave the tree dirty for user review.
- Do NOT run `pip install` or any package manager that mutates the global env
  — the user does not have MNE-Python installed locally; write code that is
  graceful when deps are missing.
- Do NOT run destructive commands (no `git reset --hard`, no `rm -rf`).
- Write real tests, even if they have to skip when deps are missing
  (`@pytest.mark.skipif(...)`).
- Keep type hints + NumPy-style docstrings on public functions.
- Log via `logging.getLogger(__name__)` — no `print`.
