# qEEG + MRI Analyzer — Contract V3 (fusion, annotations, outcomes, export)

Extends `CONTRACT.md` (classical pipeline) and `CONTRACT_V2.md` (AI upgrades).
All V3 fields are optional and graceful. No existing endpoint or field shape
changes; everything is additive.

## 1. `FusionRecommendation` (multi-modal)

Returned by `POST /api/v1/fusion/recommend/{patient_id}`. The fusion service
pulls the most-recent qEEG analysis (from `qeeg_analyses`) and most-recent MRI
analysis (from `mri_analyses`) for `patient_id`. When only one modality is
available, falls back to that modality's single-modality recommendation.

```python
{
  "patient_id": str,
  "qeeg_analysis_id": str | None,
  "mri_analysis_id":  str | None,
  "modalities_used":  list[str],        # e.g. ["qeeg", "mri"] or ["qeeg"] or ["mri"]
  "generated_at":     str,              # ISO8601
  "recommendations": [                  # ProtocolRecommendation[] from CONTRACT_V2 §5, extended:
    {
      # ...all CONTRACT_V2 §5 fields...
      "qeeg_support": [                 # qEEG biomarkers that supported this target
        {"biomarker": "frontal_alpha_asymmetry_F3_F4", "value": 0.21, "z": 1.9, "weight": 0.35}
      ],
      "mri_support":  [                 # MRI biomarkers that supported this target
        {"biomarker": "sgACC_DLPFC_anticorrelation", "value": -0.37, "z": -2.6, "weight": 0.40}
      ],
      "fusion_boost":     float,        # 0.0–1.0; multiplier applied to base confidence when both modalities agree
      "agreement_score":  float,        # -1.0 (conflict) to +1.0 (full agreement)
      "conflicts": [                    # when modalities point opposite directions
        {"field": "target_laterality", "qeeg": "left", "mri": "bilateral", "resolution": str}
      ]
    }
  ],
  "summary": str,                       # ≤ 1200 chars, banned-word sanitised
  "disclaimer": "Decision-support tool. Not a medical device. Multi-modal convergent findings are research/wellness indicators only."
}
```

Fusion rules (implementation guidance, not contract):
- Both modalities flagged same target → `fusion_boost = 1.0 + min(w_qeeg + w_mri, 0.5)`.
- Only one modality flagged → `fusion_boost = 1.0`, the other's `*_support` list is `[]`.
- Conflicting directions → add to `conflicts[]`, cap `agreement_score` at 0, log warning.
- All citations must come from `qeeg_rag` or `medrag` — never hallucinate.

## 2. Server-Sent Events (SSE) — pipeline progress

Existing polling at `GET /api/v1/qeeg-analysis/{id}` / `/api/v1/mri/status/{id}`
stays unchanged. A new SSE endpoint layers on top:

```
GET /api/v1/qeeg-analysis/{id}/events
GET /api/v1/mri/status/{job_id}/events
```

Returns `text/event-stream`. Each event is JSON:

```
event: stage_update
data: {"stage": "preprocess"|"artifacts"|"features"|"source"|"normative"|"report", "status": "started"|"progress"|"done"|"failed", "progress_pct": 0..100, "message": str}

event: complete
data: {"final_state": "completed"|"failed", "analysis_id": str}

event: error
data: {"message": str}
```

Clients must call `EventSource(url)` and listen to `stage_update`, `complete`,
`error`. Server emits a `keepalive\n\n` comment every 15s. No auth cookies on
the SSE — use the existing bearer token in a query param `?token=…`.

## 3. `Annotation` (clinician pin-to-finding)

```python
{
  "id": str,
  "analysis_id": str,
  "analysis_type": "qeeg" | "mri",
  "author_id": str,                   # clinician actor_id
  "author_name": str,                 # display only
  "target": {                         # what the annotation attaches to
    "kind": "target" | "zscore_cell" | "roi" | "finding" | "section" | "free",
    "ref":  str                       # e.g. "rTMS_MDD_personalised_sgACC" | "Fz:theta" | "hippocampus_l" | "executive_summary"
  },
  "text": str,                        # clinician note, ≤ 4000 chars, XSS-escaped on render
  "created_at": str,
  "updated_at": str | None,
  "resolved": bool,                   # default false
  "resolved_by": str | None,
  "tags": list[str]                   # e.g. ["follow_up", "disagree", "clarify"]
}
```

Endpoints (role=clinician):

```
POST   /api/v1/annotations              # create
GET    /api/v1/annotations?analysis_id= # list for an analysis (order: newest first)
PATCH  /api/v1/annotations/{id}         # update text/tags/resolved
DELETE /api/v1/annotations/{id}         # soft-delete (set deleted_at)
```

Rendered in a right-rail drawer on both analyzer pages. Report PDFs include
un-resolved annotations as footnotes.

## 4. `OutcomeEvent` (protocol → session outcome loop)

```python
{
  "id": str,
  "patient_id": str,
  "source": "qeeg_recommendation" | "mri_recommendation" | "fusion_recommendation",
  "recommendation_id": str,             # FK back to the protocol recommendation row
  "protocol_modality": str,             # rtms_10hz, tps, etc.
  "target_region": str,
  "session_id":   str | None,           # link to clinical_sessions.id if a session was started
  "accepted": bool,                     # clinician accepted the suggestion
  "started_at": str | None,
  "completed_sessions": int,
  "assessment_deltas": dict,            # {"PHQ-9": {"pre": 18, "post": 8, "pct_change": -55.5}, ...}
  "adverse_events":    list[dict],
  "adherence_pct":     float | None,
  "notes": str
}
```

Stored in new `outcome_events` table (migration 042). Exposed at:

```
POST /api/v1/outcomes                             # clinician records acceptance
GET  /api/v1/outcomes?patient_id=                 # fetch for a patient
GET  /api/v1/outcomes/cohort/summary              # aggregate: responder_rate, mean_delta per protocol
```

The cohort summary endpoint feeds a loop where `protocol_recommender` bumps
confidence on protocols with strong historical response.

## 5. Export formats

### 5.1 FHIR DiagnosticReport bundle

`GET /api/v1/qeeg-analysis/{id}/export/fhir` and
`GET /api/v1/mri/report/{id}/export/fhir` return a FHIR R4 `Bundle` of
`DiagnosticReport` + `Observation` resources with LOINC codes where possible.

Minimum resources emitted:
- 1 × `DiagnosticReport` (category: NEU)
- N × `Observation` per flagged finding (code, value, reference-range, interpretation)
- 1 × `Patient` (reference only; no PHI in the export itself)
- N × `DocumentReference` for attached artifacts (report PDF, NIfTI paths)

### 5.2 BIDS derivatives

`GET /api/v1/mri/report/{id}/export/bids` returns a zipped derivative directory:

```
sub-{patient_id}/
  ses-{analysis_id}/
    anat/
      sub-..._desc-preproc_T1w.nii.gz
      sub-..._label-structural.json        # volumetry, thickness, z-scores
    func/
      sub-..._task-rest_desc-confounds.tsv
      sub-..._desc-fcMatrix.tsv
    dwi/
      sub-..._desc-FA.nii.gz
    stim/
      sub-..._targets.json                 # our StimTarget schema
  dataset_description.json
```

Same for qEEG: `/api/v1/qeeg-analysis/{id}/export/bids` → BIDS-EEG derivative.

## 6. Timeline view

New page at `?page=patient-timeline&patient_id=…`. Aggregates from
`qeeg_analyses`, `mri_analyses`, `assessment_records`, `clinical_sessions`,
`outcome_events` for that patient. Rendered as a vertical timeline with 4
swim-lanes (qEEG / MRI / Assessments / Sessions) and cross-lane arrows
connecting recommendations to sessions.

Backed by a single endpoint: `GET /api/v1/patient-timeline/{patient_id}`
returning `{"events": [{"type": str, "at": iso, "summary": str, "ref_id": str, "lane": str, "connects_to": [str]}]}`.

## 7. Command palette

New global frontend widget `apps/web/src/command-palette.js`. Keybinding
`Cmd/Ctrl+K`. Fuzzy-matches across:
- All analyses (qEEG + MRI) — shows `Modality · Patient · Date · click to open`
- All patients
- Nav routes
- Recent actions (last 10 visited pages from localStorage)

No backend change — consumes existing list endpoints.

## 8. Shared constraints

- Banned-word rule (`diagnos*`, `treatment recommendation`) sanitised on every
  LLM-produced string in this contract.
- Fusion service NEVER invents a finding — every `qeeg_support` / `mri_support`
  entry must exist in the underlying analysis row.
- Annotations are soft-delete only.
- Outcome event insertion requires `recommendation_id` FK validation.
- Export endpoints require `clinician` or `neurotech_admin` role.
- Patient-facing view (§9) requires `patient` role bound to the same
  `patient_id`.

## 9. Patient-facing read-only view

New page at `?portalPage=qeeg-summary&analysis_id=…` (inside the existing
patient portal shell). Simplified, jargon-free. Contract:

```python
{
  "analysis_id": str,
  "recorded_on": str,
  "findings_plain_language": [         # LLM-rewritten, no jargon, ≤ 200 chars each
    {"title": str, "body": str, "severity_hint": "gentle" | "moderate" | "discuss_with_clinician"}
  ],
  "next_steps_generic":        list[str],    # "Discuss with your clinician", never protocol specifics
  "clinician_note_public":     str | None,   # only annotations tagged `patient_facing` are exposed
  "regulatory_footer":         "Research/wellness use — not diagnostic."
}
```

Backend: `GET /api/v1/patient-portal/qeeg-summary/{id}` — same shape for MRI.
Enforces patient==analysis.patient_id match + filters every field through
the banned-word sanitiser.

## 10. Ownership

| Agent | Scope |
|---|---|
| **O** | §1 Fusion + §2 SSE |
| **P** | NiiVue 3-plane viewer, real overlay endpoint, §6 Timeline |
| **Q** | Pre/post Compare tabs (qEEG + MRI), §3 Annotations, §9 Patient-facing view |
| **R** | §5.1 FHIR, §5.2 BIDS, §4 Outcomes, §7 Command palette, migration 042 |

All ownership files are additive. Frontend edits to `pages-qeeg-analysis.js`
and `pages-mri-analysis.js` must be **scoped to specific insertion anchors**
each agent identifies by grep — never modify existing functions outside
their own new sections.

## 11. Constraints (same as prior contracts)

- No git/pip/pytest/alembic runs.
- Heavy deps (nilearn, pydicom, reportlab for FHIR PDFs) import-guarded.
- SQLite-compat for every new migration.
- Type hints + NumPy docstrings on every public function.
- Logging via `logging.getLogger(__name__)`.
