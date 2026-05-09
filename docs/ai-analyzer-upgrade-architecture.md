# AI Analyzer Upgrade Architecture
**DeepSynaps Protocol Studio — Overnight Sprint 2026-05-08**
**Agent 3: Architecture Lead**

> **Clinical disclaimer — applies to every page in this document:**
> "This is a controlled preview using synthetic or clinician-provided data where applicable.
> This page supports clinical review and decision support only. It does not diagnose,
> prescribe, triage emergencies, approve treatment, or act autonomously. All outputs
> require clinician review."

---

## Summary

This document is the integration plan that agents 4–14 execute. It covers all 12 target
AI/analyzer pages, specifying: current state, Class A safe integrations for tonight,
Class B/C deferrals, new API shapes, frontend helpers, safety gates, demo mode, and tests.

**Class definitions:**
- **A = Safe tonight:** UI wiring, route fixes, missing-state honesty, evidence link
  rendering, deterministic scoring, exports, helpers. No new heavy ML deps.
- **B = Caution / Telegram-escalate:** New ML deps, qEEG/MRI pipeline, video/audio model
  integration, RAG, DeepTwin prediction logic. Verify license + infra before touching.
- **C = Do NOT tonight:** Autonomous prescribing, fake predictions, heavy model deploy,
  unlicensed copy, paid API, any action that touches a forbidden word positively.

**Architecture pattern for all 12 pages:**
1. Thin Python adapter wrapping the open-source library (`packages/<surface>-pipeline/`)
2. `HAS_<LIBRARY>` guard at service startup (mirror of existing `HAS_MRI_PIPELINE`)
3. Demo mode fallback when library unavailable (gate: `isDemoSession()` + `VITE_ENABLE_DEMO`)
4. Structured JSON output consumed by UI
5. Full clinical disclaimer injected on every page (server-side header + UI footer)

---

## 1. DeepTwin

### Current implementation files
- `apps/web/src/pages-deeptwin.js` (740 lines) — page orchestration
- `apps/web/src/deeptwin/` — components.js, safety.js, service.js, reports.js,
  neuroai-lab.js, dashboard360.js, charts.js, sim-room.js, tribe.js, handoff.js, mockData.js
- `apps/api/app/routers/deeptwin_router.py`
- `apps/api/app/routers/deeptwin_neuroai_lab_router.py`
- `apps/api/app/services/deeptwin_decision_support.py`
- `apps/api/app/services/deeptwin_research_loop.py`

**State:** Well-structured. Has safety footer, correlation vs causation notice, evidence
grade badges, simulation-only stamps, "not a prescription" stamps. Does NOT have `isDemoSession()`
import — demo fixtures come via `shouldUseDeepTwinDemoFixtures()` in service.js (acceptable
but inconsistent with other pages). Full clinical disclaimer absent from page-level render.

### Class A integrations (tonight)

1. **Add full required disclaimer banner** to `pages-deeptwin.js` mount function. Import
   from a shared `clinical-disclaimer.js` helper (create this file — see Frontend Helpers).
2. **Add `isDemoSession()` import** to `pages-deeptwin.js` for consistency. Wire to
   `shouldUseDeepTwinDemoFixtures()` so both paths agree.
3. **Safety string audit**: scan `pages-deeptwin.js` + all `deeptwin/*.js` for forbidden
   words. `deeptwin/safety.js` is clean; `components.js` line 500 has "Clinician must review"
   (acceptable). No forbidden positive uses found.
4. **Evidence-grade badge export**: `deeptwin/safety.js::evidenceGradeBadge()` already
   exists. Ensure neuroai-lab.js renders it for every hypothesis card.
5. **Export improvements**: `reports.js` already handles JSON + Markdown. Add a helper
   to annotate every export with `generated_by: "decision-support-only"` metadata field.

### Class B deferrals (Telegram-escalate before doing)
- PyHealth patient-level ML pipeline integration (new pip dep, patient data risk)
- SimPy discrete-event simulation module (new dep, no immediate demo need)
- ClinicalBERT twin text personality (MIMIC data provenance question)
- Any expansion of the Prediction Engine beyond current demo fixture shapes

### Class C (do NOT tonight)
- Autonomous prediction with no human-in-the-loop gate
- FEniCS/OpenCMISS PDE biophysics (LGPL + complex install)
- Real patient data in mockData.js or demo-dashboard-payload.js

### New APIs needed
- None required tonight. Existing `deeptwin_router.py` + `deeptwin_neuroai_lab_router.py`
  are sufficient. No new endpoints.

### New frontend helpers/components
- `apps/web/src/clinical-disclaimer.js` — shared `renderClinicalDisclaimer()` function
  (see §Frontend Helpers Shared below)

### Safety gates required
- Full disclaimer banner at top of DeepTwin page
- Correlation/causation notice on all correlation/causal panels (already present in safety.js)
- Every prediction: "Simulation only" + "Not a prescription" stamps (already in components.js)
- Demo mode: all demo fixtures clearly labelled "Synthetic data — decision-support review only"

### Demo mode behavior
- `shouldUseDeepTwinDemoFixtures()` must return `true` when `isDemoSession()` is true
- All sections render with clearly labelled demo fixtures
- No API calls to real patient endpoints when in demo mode

### Tests needed
- Verify `renderSafetyFooter()` output in `deeptwin/safety.js`
- Verify disclaimer banner is rendered on page mount
- Verify demo mode doesn't leak real patient IDs
- Existing `deeptwin/deeptwin-safety-strings.test.js` — check it covers all 10 forbidden words

---

## 2. qEEG Analyzer

### Current implementation files
- `apps/web/src/pages-qeeg-analysis.js` (7,515 lines) — largest page
- `apps/web/src/qeeg-brain-map-template.js`
- `apps/web/src/pages-qeeg-launcher.js`, `pages-qeeg-raw.js`, `pages-qeeg-raw-workbench.js`
- `apps/api/app/qeeg/routers/` — qeeg_analysis_run_router.py, catalog, results
- `apps/api/app/routers/qeeg_capabilities_router.py`
- `packages/qeeg-pipeline/`, `packages/qeeg-encoder/`

**State:** Most mature analyzer page. Has `isDemoSession()`, DEMO_FIXTURE_BANNER,
evidence citations (PubMed/DOI), disclaimer blocks, evidence-grade labelling. The
capabilities router already uses `importlib.util.find_spec()` for HAS_ checks.
BIDS export via `mne-bids` would be a natural Class B add.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — verify the existing disclaimer block at line ~3058
   matches the sprint's exact required text. Update if it differs (string comparison).
2. **Evidence links audit** — lines 1819-1855 handle PubMed/DOI links. Verify no broken
   links in demo fixtures. Replace any `pubmed.ncbi.nlm.nih.gov/<bad-pmid>` with validated
   PMID or remove.
3. **`diagnoses` field** at line 4025 — the key name is `diagnoses` which is a forbidden
   word root. Rename to `clinical_profile_notes` or `session_context_notes` to avoid
   misleading label. Change in demo fixtures only (Class A: rename a field key, not logic).
4. **capabilities endpoint** — wire the qEEG caps badge to the UI so clinicians can see
   which features are active vs. demo vs. unavailable.
5. **Empty state honesty** — if `isDemoSession()` and API unavailable, show exact offline
   demo panel (already present at line 656 pattern) — verify it renders.

### Class B deferrals
- MNE-Python backend integration (heavy Python dep, EDF real processing)
- YASA sleep staging (new dep, not in current pipeline)
- autoreject bad epoch detection (new dep)
- fooof/specparam aperiodic parameterization (new dep)
- mne-bids BIDS export (new dep but low risk — add to Class B roadmap)
- PREP pipeline via pyprep

### Class C
- Real EEG processing without validated clinical review gate
- Epilepsy determination claims
- Any label that reads "confirmed" or "diagnostic"

### New APIs needed
- None tonight. Capabilities endpoint already exists.
- Future (B): `POST /api/v1/qeeg/bids-export` using mne-bids

### New frontend helpers
- Badge component for "Capability: active / demo / unavailable" status pills
  (reusable across qEEG, MRI, Voice, Video)

### Safety gates
- Disclaimer block must match sprint required text exactly
- "Not diagnostic by itself — requires clinician review" on every AI Report tab output
- `diagnoses` field key renamed (tonight)
- Every spectral output: "Decision support indicator — not a clinical finding"

### Demo mode
- Sample recording loads with `DEMO_FIXTURE_BANNER_HTML` clearly visible
- No real patient EEG data in fixtures

### Tests needed
- `pages-qeeg-analysis-ai-upgrades.test.js` — add test: disclaimer text exact match
- `pages-qeeg-analysis-readiness.test.js` — add test: `diagnoses` key not present in output
- `pages-qeeg-decision-support.test.js` — verify no forbidden words in rendered HTML

---

## 3. MRI Analyzer

### Current implementation files
- `apps/web/src/pages-mri-analysis.js` (3,682 lines)
- `apps/api/app/routers/mri_analysis_router.py`
- `apps/api/app/services/mri_pipeline.py` (has `HAS_MRI_PIPELINE` guard)
- `apps/api/app/services/mri_claim_governance.py`
- `apps/api/app/services/mri_registration_qa.py`
- `apps/api/app/source/mri_registration.py`
- `apps/api/app/persistence/models/mri.py`
- `packages/mri-pipeline/`

**State:** Has `isDemoSession()`, evidence citations, HAS_MRI_PIPELINE guard, claim
governance service, 3-plane slice viewer placeholder, stim-target cards. Most safety
patterns are present. The claim governance service is a strong signal this was carefully
built.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — add to MRI page mount if not already matching
   sprint required text exactly.
2. **Slice viewer placeholder** — currently renders a placeholder text. Add a clearly
   labelled "Upload NIfTI to view slices" state with demo screenshot option. No JS viewer
   changes needed — just honest empty state text.
3. **Citation rendering** — `renderMRIEvidenceCitations()` at line 421 already exists.
   Verify it renders PubMed/DOI links correctly in demo mode.
4. **QC badge** — link `mri_analysis_qc.test.js` patterns to UI: show QC pass/fail badge
   on scan card (backend already computes it).
5. **HAS_MRI_PIPELINE UI** — mirror the qEEG capabilities pattern: show "Pipeline:
   active/demo" badge in MRI page header.

### Class B deferrals
- NiBabel + Nilearn full pipeline (new Python deps, large)
- ANTsPy registration (large install)
- MONAI segmentation (GPU needed for training)
- dcm2niix DICOM converter subprocess adapter
- FastSurfer cortical reconstruction (GPU + container)
- MRIQC quality metrics
- Brain age estimation tab

### Class C
- Any "age regression" claim presented as clinical fact
- Autonomous lesion classification

### New APIs needed
- None tonight. Existing 8-endpoint contract already defined.
- Future (B): `GET /api/v1/mri/capabilities` endpoint mirroring qEEG caps pattern.

### New frontend helpers
- Shared `renderPipelineStatusBadge(name, status)` component (reuse across MRI, qEEG, Voice)

### Safety gates
- `mri_claim_governance.py` must gate all AI outputs — verify it's wired to all routes
- Every AI output: "Model-estimated indicator. Requires radiologist/neurologist review."
- No "confirmed lesion" or "brain age confirmed" language

### Demo mode
- Demo NIfTI fixture loads with banner
- Stim-target cards render from demo fixture data

### Tests needed
- `pages-mri-analysis.test.js` — add test: QC badge rendered
- `pages-mri-analysis-compare.test.js` — verify comparison view has disclaimer
- `pages-mri-analysis-brainage.test.js` — verify no "confirmed" language

---

## 4. Text / Clinical NLP Analyzer

### Current implementation files
- `apps/web/src/pages-text-analyzer.js` (734 lines)
- `apps/api/app/routers/clinical_text_router.py`
- `packages/text-pipeline/`

**State:** Has `isDemoSession()`, ANALYZER_DEMO_FIXTURES, DEMO_FIXTURE_BANNER_HTML.
API: POST analyze, extract-pii, deidentify; GET health. The router wraps an OpenMed
adapter with heuristic fallback. Has offline demo panel for unauthenticated sessions.
Presidio (P0 critical for PHI de-ID) not yet confirmed in backend.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — add to page mount.
2. **PII de-identification gate UI** — before displaying any AI NLP output, show a
   "De-identification step" badge indicating Presidio/heuristic ran. Surface from API
   response header `X-Deidentified: true/false/heuristic`.
3. **Entity extraction honest labels** — all NER entities must be labelled:
   "Extracted mention — not a confirmed diagnosis/medication. Requires clinician review."
4. **Offline demo panel** — verify the "Show offline demo panel" button at line 656
   renders properly and shows labelled placeholder output.
5. **Health endpoint badge** — call `GET /api/v1/nlp/health` on page load; show
   pipeline status badge (active/heuristic/demo).

### Class B deferrals
- spaCy + medspaCy + scispaCy full backend integration
- Presidio PHI detection endpoint wiring (Presidio is P0 but installation + configuration
  is non-trivial — needs its own sub-task and test suite)
- NegSpaCy negation detection
- MedCAT UMLS concept annotation (UMLS license gate)
- PubMedBERT semantic search

### Class C
- Autonomous medication extraction presented as active prescription list
- SNOMED coding without SNOMED content license confirmation

### New APIs needed
- `GET /api/v1/nlp/capabilities` — returns `{presidio: bool, spacy: bool, medspacy: bool,
  backend: "openmed"|"heuristic"|"unavailable"}`
- `X-Deidentified` response header on all analyze endpoints

### New frontend helpers
- `renderNLPEntityCard(entity)` — entity card with "mention only" label, confidence,
  negation flag, evidence link if available.

### Safety gates
- De-identification MUST run before any AI processing of real patient text
- Presidio P0: if not active, show prominent "PHI protection: heuristic only" warning
- All entities: "Extracted mention — not confirmed clinical finding"
- No "diagnosis confirmed" or "medication confirmed" language

### Demo mode
- Offline demo panel with clearly labelled synthetic clinical notes
- No real patient text in demo fixtures

### Tests needed
- `pages-text-analyzer.test.js` — add: PHI warning shown when Presidio unavailable
- `pages-text-analyzer.test.js` — add: entity cards have "mention only" labels
- Add `test_clinical_text_presidio_gate.py` backend test

---

## 5. Voice / Audio Analyzer

### Current implementation files
- `apps/web/src/pages-voice-analyzer.js` (1,107 lines)
- `apps/web/src/voice-decision-support.js`
- `apps/api/app/routers/audio_analysis_router.py` (has `HAS_AUDIO_PIPELINE` guard)
- `packages/voice-engine/` — biomarkers.py, audio_io.py
- `packages/audio-pipeline/`

**State:** Has `isDemoSession()`, ANALYZER_DEMO_FIXTURES, VOICE_DECISION_SUPPORT_FULL,
evidence dataset count, `HAS_AUDIO_PIPELINE` guard on backend. Pipeline-meta block renders.
Transcript textarea for cognitive/linguistic extraction present.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — add to page mount.
2. **Transcript area honest state** — the transcript textarea at line 631 should show
   "Paste session transcript (optional). Used for linguistic feature extraction only —
   not autonomous speech analysis." placeholder text update.
3. **Pipeline meta block** — `voicePipelineMetaBlock()` from voice-decision-support.js
   should display which features are active vs. demo. Verify it renders correctly.
4. **Patient ID override field** at line 592 — add "UUID format required" validation
   hint. Label must say "Optional — for linking to patient record".
5. **EVIDENCE_TOTAL_PAPERS** badge — already imported. Verify it's rendered visibly.
6. **Whisper retention notice** — if Whisper transcription is active, show:
   "Audio may be processed for transcription. Refer to your organisation's data
   retention policy before uploading identifiable recordings."

### Class B deferrals
- Whisper transcription backend (non-trivial: GPU recommendations, retention policy gate)
- openSMILE eGeMAPS feature extraction backend wiring
- Surfboard clinical speech biomarkers (jitter/shimmer/HNR)
- librosa MFCC/spectral feature extraction
- SpeechBrain emotion recognition
- pyannote speaker diarization (HF model gating)

### Class C
- parselmouth/Praat (GPL-3.0 — do not use without Telegram escalation)
- Autonomous speech disorder labelling
- "Emotion confirmed" or "mood disorder detected" language

### New APIs needed
- `GET /api/v1/audio/capabilities` — returns `{whisper: bool, opensmile: bool,
  librosa: bool, backend: str}`
- All endpoints: `X-RetentionPolicyRequired: true` header when real audio uploaded

### New frontend helpers
- `renderAudioFeatureCard(feature, value, unit, evidenceLink)` — with "research indicator,
  not a clinical biomarker" label.

### Safety gates
- `HAS_AUDIO_PIPELINE` check must gate real processing
- Whisper recording retention notice required before upload
- No "vocal biomarker confirms diagnosis" language

### Demo mode
- ANALYZER_DEMO_FIXTURES.voice with sample waveform + feature table
- Transcript demo text labelled "Synthetic session — not real patient data"

### Tests needed
- `pages-voice-analyzer.test.js` — add: disclaimer present
- `pages-voice-analyzer.test.js` — add: retention notice appears on real upload
- Backend: add `test_audio_analysis_has_guard.py`

---

## 6. Video Analyzer

### Current implementation files
- `apps/web/src/pages-video-assessments.js` (2,754 lines)
- `apps/web/src/video-assessment-protocol.js`
- `apps/api/app/routers/video_assessment_router.py`
- `packages/video-pipeline/`

**State:** Has `isDemoSession()`, `VIDEO_ASSESSMENT_PROTOCOL`, `VIDEO_ASSESSMENT_TASKS`,
guided camera tasks + clinician structured review. Has `future_ai_metrics_placeholder`
in session data at line 1471, `va-demo-placeholder` at line 1361, video placeholder at
line 1663. Good pattern but heavy placeholder presence signals incomplete state.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — add to page mount.
2. **Placeholder honest labelling** — `va-video-placeholder` and `va-demo-placeholder`
   must clearly say "Video analysis coming soon — currently showing structured
   observation framework only."
3. **`future_ai_metrics_placeholder` removal** — rename to `ai_metrics` with empty object
   default. If empty, show "AI metrics not yet available for this session."
4. **Structured observation export** — add "Export session notes" button (JSON + printable)
   using existing `summarizeSession()` helper.
5. **Clinician structured review** — add validation that all required fields are filled
   before session can be marked "complete by clinician".

### Class B deferrals
- MediaPipe pose estimation integration (large binary, backend infra)
- rtmlib lightweight RTMPose (CPU-capable but needs backend adapter)
- mmpose full skeleton-based analysis (GPU recommended)
- Pyskl action recognition

### Class C
- OpenPose (non-commercial — do not use)
- DeepLabCut (LGPL — escalation required)
- Autonomous motor disorder classification
- "Gait confirmed normal/abnormal" language

### New APIs needed
- `GET /api/v1/video-assessments/capabilities` — what's active vs. placeholder
- `POST /api/v1/video-assessments/sessions/{id}/export` — JSON/PDF session export

### New frontend helpers
- `renderObservationField(label, value, required)` — for structured clinician review form

### Safety gates
- Every AI metric: "Exploratory indicator — clinician structured observation required"
- No autonomous motor scoring presented as clinical fact
- Placeholder sections must say "not yet available" not simulate fake data

### Demo mode
- `isDemoSession()` loads pre-filled demo session with labelled synthetic data
- Demo tasks show completed example with "DEMO" banner

### Tests needed
- `pages-video-assessments.test.js` — add: disclaimer present
- `pages-video-assessments.test.js` — add: placeholder sections labelled correctly
- Add export functionality test

---

## 7. Biomarkers / Wearables

### Current implementation files
- `apps/web/src/pages-biomarkers.js` (986 lines)
- `apps/api/app/routers/biometrics_router.py`
- `packages/biometrics-pipeline/`

**State:** Has `isDemoSession()`, ANALYZER_DEMO_FIXTURES, NEURO_BIOMARKER_REFERENCE
catalog, `renderBrainMap10_20()` 10-20 placement visualisation. Two tabs: Reference and
Patient Workspace. Reference search at line 482.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — add to page mount.
2. **Reference catalog honest labels** — each biomarker entry should show evidence grade
   (high/moderate/low/research-only). Use shared `evidenceGradeBadge()` from
   deeptwin/safety.js or a new shared helper.
3. **Patient workspace empty state** — if no patient wearable data, show clear message:
   "No wearable data connected. Connect a wearable device or upload a data file to
   begin clinician review."
4. **Search result honest state** — search at line 482 returns biomarker references.
   Each result must include: "Reference only — values are population norms, not
   individual targets."
5. **Brain map 10-20 overlay** — `renderBrainMap10_20()` already exists. Ensure channel
   selection highlights are labelled "EEG site reference — not a clinical finding."

### Class B deferrals
- NeuroKit2 ECG/PPG/EDA processing backend
- HeartPy HRV analysis
- FLIRT wearable feature extraction
- py-ecg-detectors QRS detection
- pylsl real-time stream ingestion

### Class C
- Autonomous arrhythmia detection labelled as clinical fact
- "Normal HRV" or "abnormal HRV" as standalone clinical conclusion

### New APIs needed
- `GET /api/v1/biomarkers/capabilities` — active vs. reference-only features
- Future (B): `POST /api/v1/biomarkers/compute` — NeuroKit2-backed feature computation

### New frontend helpers
- `renderBiomarkerCard(marker, value, evidenceGrade, norm, disclaimer)` with evidence badge

### Safety gates
- All biomarker values: "Population reference norm — not an individual clinical target"
- HRV/ECG features: "Exploratory indicator — requires cardiologist/neurologist review"

### Demo mode
- ANALYZER_DEMO_FIXTURES.biomarkers with labelled synthetic biosignal data
- Reference catalog always available (no demo gate needed — it's static reference data)

### Tests needed
- `pages-biomarkers.test.js` — add: evidence grade badges present
- `pages-biomarkers.test.js` — add: patient workspace empty state correct
- Add `test_biometrics_capabilities.py`

---

## 8. Evidence Research

### Current implementation files
- `apps/web/src/pages-research-evidence.js` (3,258 lines)
- `apps/api/app/routers/evidence_router.py`
- `packages/evidence/`

**State:** Has `isDemoSession()`, live corpus metrics from API (not hardcoded — correct),
bundled registry rollups, brokered search. Evidence status from `GET /api/v1/evidence/status`.
The pattern of never hardcoding totals and always reading from API is exactly right.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — verify sprint text present.
2. **Search placeholders** — search inputs at lines 360, 2545, 2575 already have
   `placeholder=` text. Ensure placeholders use real example queries, not generic text.
   Update to: "e.g. rTMS depression meta-analysis, tDCS ADHD randomised trial"
3. **Evidence links** — all paper cards must have clickable PubMed/DOI links. Verify
   `habanero`/`pymed` API output includes `doi` or `pmid` fields and UI renders them.
4. **Offline/unavailable state** — if evidence DB unavailable, show:
   "Evidence corpus offline. Showing bundled registry summary only. Live search unavailable."
5. **Paper card labels** — every paper: "Peer-reviewed source — clinician interpretation
   required. Not a treatment recommendation."

### Class B deferrals
- pymed PubMed API live search wiring
- semanticscholar citation graph overlay
- habanero CrossRef DOI resolution
- PubMedBERT semantic embedding search
- LangGraph multi-step evidence RAG pipeline

### Class C
- Evidence synthesis presented as treatment recommendation
- Automated protocol generation from evidence without clinician review gate

### New APIs needed
- `GET /api/v1/evidence/capabilities` — `{live_search: bool, corpus_size: int,
  semantic_search: bool, ragraph: bool}`
- Already have `GET /api/v1/evidence/status` — extend with capabilities fields

### New frontend helpers
- `renderEvidencePaperCard(paper)` — standard card with PMID/DOI link, grade badge,
  "source only" label

### Safety gates
- No evidence synthesis → treatment recommendation without explicit clinician review step
- All search results: "Research source — not a clinical recommendation"
- Evidence corpus offline state handled gracefully (no silent failure)

### Demo mode
- isDemoSession() loads bundled registry rollup
- Clearly labelled: "Showing bundled evidence registry — live PubMed search unavailable in demo"

### Tests needed
- `pages-research-evidence.test.js` — add: offline state shown when API down
- `pages-research-evidence.test.js` — add: paper cards have DOI/PMID links
- Backend: `test_evidence_router_offline.py`

---

## 9. Protocol Studio

### Current implementation files
- `apps/web/src/pages-protocols.js` (1,583 lines)
- `apps/api/app/routers/protocol_studio_router.py`
- `apps/api/app/routers/protocols_generate_router.py`
- `apps/api/app/routers/protocols_saved_router.py`
- `packages/core-schema/`, `packages/neuro-engine/`, `packages/generation-engine/`

**State:** Uses `CONDITIONS`, `DEVICES`, `PROTOCOL_TYPES`, `GOVERNANCE_LABELS`,
`EVIDENCE_GRADES` from protocols-data.js. Has search, protocol builder v2 with
parameter fields. Well-structured but no explicit `isDemoSession()` or demo gate.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — add to page mount (currently missing demo gate).
2. **Add `isDemoSession()` import** — gate protocol generation suggestions to demo
   fixture output when not authenticated against live API.
3. **Evidence grade labels** — `EVIDENCE_GRADES` already imported. Ensure every protocol
   card renders its evidence grade badge.
4. **Parameter field validation** — `field()` helper at line 1186 generates number inputs.
   Add `min`/`max` validation attributes matching clinical parameter bounds (no guessing —
   only add bounds that come from existing data model, not invented).
5. **Protocol builder honest state** — if no evidence linked to a generated protocol,
   show: "No evidence citations found. Review clinical literature before applying."
6. **Governance labels** — `GOVERNANCE_LABELS` must render on all protocol cards with
   tooltips explaining each label.

### Class B deferrals
- fhir.resources FHIR R4 schema validation for protocols
- fhirclient SMART on FHIR auth integration
- LangGraph stateful protocol execution graph
- CPG-on-FHIR encoding

### Class C
- Automated protocol prescription without dual clinician approval gate
- Any "approved" label without governance workflow

### New APIs needed
- `GET /api/v1/protocol-studio/capabilities`
- Future (B): `POST /api/v1/protocol-studio/validate-fhir` using fhir.resources

### New frontend helpers
- `renderProtocolCard(protocol, evidenceGrade, govLabels)` — standard protocol card

### Safety gates
- No protocol presented as "treatment approved" without governance workflow
- Every generated protocol: "Draft — requires dual clinician review before clinical use"
- Parameter bounds must be clinically validated before any frontend enforcement

### Demo mode
- Demo protocols from existing `PROTOCOL_LIBRARY`
- Clearly labelled "Demo protocol — synthetic data"

### Tests needed
- Add `test_protocol_studio_router.py` — verify demo flag in response
- `pages-protocols.js` — add test: evidence grade badge rendered
- Add test: governance labels present on all protocol cards

---

## 10. Handbooks

### Current implementation files
- `apps/web/src/pages-handbooks.js` (1,951 lines)
- `apps/web/src/handbooks-data.js`
- `packages/render-engine/`
- `packages/generation-engine/`

**State:** Has `HANDBOOK_DATA`, `CONDITION_REGISTRY`, `PROTOCOL_REGISTRY`,
`DEVICE_REGISTRY`. Three-pane layout. Static Safety/Ops + Training stubs at line 828
("This handbook is being authored. Contact the clinical director for the latest signed
copy."). No `isDemoSession()` import — stubs are always shown.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — add to page mount.
2. **Add `isDemoSession()` import** — in demo mode, show "demo edition" label on all
   handbook sections.
3. **Stub sections honest state** — the stub message at line 829 is good. Ensure it's
   visually distinct (different styling from live content) so clinicians know which
   sections are authored vs. pending.
4. **Export link** — add "Export to PDF" placeholder button that links to
   `render-engine` export endpoint. If unavailable, show "Export coming soon."
5. **Evidence links in handbooks** — protocol/condition entries should link to evidence
   page. Use `renderEvidencePaperCard()` helper for inline citations.

### Class B deferrals
- WeasyPrint HTML→PDF rendering (backend dep)
- pypandoc Markdown→DOCX export
- python-docx Word export
- Jinja2 template-based handbook generation
- Full content authoring pipeline

### Class C
- Publishing unreviewed AI-generated handbook content to production
- DOCX exports with unchecked clinical content

### New APIs needed
- `GET /api/v1/handbooks/capabilities` — `{pdf_export: bool, docx_export: bool}`
- Future (B): `POST /api/v1/handbooks/{id}/export` using WeasyPrint/pypandoc

### New frontend helpers
- `renderHandbookStubSection(message)` — visually distinct stub section component

### Safety gates
- Stub sections must never be shown to patients as final clinical content
- All handbook content: "Clinical reference material — review with supervising clinician"
- Export disabled until handbook is marked "reviewed" by clinical director

### Demo mode
- isDemoSession() adds "DEMO EDITION" watermark to all handbook views
- Export button shows "Export disabled in demo mode"

### Tests needed
- `pages-handbooks.test.js` — add: stub sections visually distinct
- `test_export_handbook_bundle.py` — verify export only available with auth
- Add: demo mode renders "DEMO EDITION" label

---

## 11. Brain Map Planner

### Current implementation files
- `apps/web/src/pages-brainmap.js` (1,791 lines)
- `apps/web/src/brain-map-svg.js`
- `apps/api/app/templates/qeeg_brain_map_report.html`

**State:** Has placeholder panel at line 588 ("Roadmap · early prototype available in
Research"). Three tabs: Clinical, Montage, Research. Uses `renderBrainMap10_20()` from
brain-map-svg.js. No `isDemoSession()` import — no demo gating.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — add to page mount.
2. **Add `isDemoSession()` import** — wire to demo fixture channel selection.
3. **Placeholder panel honest state** — update text at line 589-591 to:
   "Brain connectivity visualization — early prototype. Standard 10-20 electrode
   placement shown. Extended connectivity mapping on roadmap."
4. **Region search** — search at line 481 ("Region, function, condition…") — add
   at least a static response for 10-20 standard sites (can use `SITES_10_20` data).
5. **Montage tab** — for each montage, show evidence grade badge and "Review required
   before clinical application" label.
6. **Research tab** — clearly label all research-mode features as
   "Exploratory — not validated for clinical use."

### Class B deferrals
- Nilearn brain atlas overlay (Python dep, heavy)
- plotly 3D brain mesh rendering
- NiMARE neuroimaging meta-analysis coordinates
- BCT-py graph theory connectivity metrics
- MNI↔Talairach coordinate conversion

### Class C
- LeadDBS (GPL + MATLAB — do not use)
- Any autonomous DBS targeting without neurosurgeon gate
- "Optimal electrode placement confirmed" language

### New APIs needed
- `GET /api/v1/brainmap/sites` — return 10-20 site metadata (already have SITES_10_20 frontend)
- `GET /api/v1/brainmap/capabilities` — active features vs. roadmap
- Future (B): `POST /api/v1/brainmap/nilearn-render` — Nilearn glass brain image

### New frontend helpers
- `renderSiteInfoCard(site)` — for region info panel
- `renderPipelineStatusBadge(name, status)` — reuse from MRI

### Safety gates
- All region/electrode suggestions: "Stimulation parameters require clinician review"
- Research tab: "Not validated for clinical use — exploratory only"
- No "optimal" claims without evidence grade citation

### Demo mode
- isDemoSession() loads pre-selected demo montage with labelled synthetic channel data
- 3D viewer placeholder clearly states "3D visualization coming soon"

### Tests needed
- `pages-brainmap-qeeg-overlay.test.js` — verify disclaimer present
- Add: research tab labelled "exploratory only"
- Add: montage cards have evidence grade badges

---

## 12. Risk Analyzer

### Current implementation files
- `apps/web/src/pages-risk-analyzer.js` (932 lines)
- `apps/api/app/routers/risk_analyzer_router.py`
- `apps/api/app/routers/risk_stratification_router.py`

**State:** Has `isDemoSession()`, `ANALYZER_DEMO_FIXTURES.risk`, demo labelling.
Endpoints: GET analyzer/patient/{id}, POST recompute, POST override (override reason
textarea at line 327 — audited). Sample data placeholder at line 140, normalise/dedupe
logic at line 166. Calm placeholder on failure at line 641.

### Class A integrations (tonight)
1. **Full required disclaimer banner** — add to page mount.
2. **Override reason field** — textarea at line 327 already has "overrides are audited"
   label — good. Add validation: minimum 20 characters for override reason.
3. **Sample data placeholder** — rename "Sample data placeholder" at line 140 to
   "Demo sample — not a clinical risk assessment".
4. **Risk level labels** — all risk level values should include level + "indicator for
   review" suffix. E.g. "High" → "High — requires clinician review".
5. **Recompute button** — add confirmation dialog: "Recomputing will update the risk
   indicator. Clinician review required before any care changes."
6. **Failure state** — line 641 "calm placeholder" — verify it shows
   "Risk indicator unavailable — contact clinical team" not a silent blank.

### Class B deferrals
- clinical-risk-scores validated implementations (PHQ-9, GAD-7, AUDIT-C)
- openFDA adverse event lookup
- medspaCy risk flag extraction from notes
- scikit-learn calibrated probability estimates (careful: must not be labelled "clinical prediction")
- pyomop OMOP CDM patient risk modeling

### Class C
- Autonomous risk-based care decisions without clinician override gate
- "Risk score confirms treatment needed" language
- Unlicensed copy of validated clinical scales (PHQ-9, GAD-7 are in public domain — but
  verify before implementing)

### New APIs needed
- `GET /api/v1/risk/analyzer/capabilities`
- All risk endpoints: response must include `disclaimer: "decision-support indicator, not a clinical prediction"`

### New frontend helpers
- `renderRiskLevelBadge(level, requiresReview)` — badge with "indicator for review" label

### Safety gates
- Override gate: minimum character validation, audit trail confirmed
- Recompute confirmation dialog
- All risk outputs: "Decision-support indicator — requires clinician review and clinical context"
- Failure state: graceful, no silent blank

### Demo mode
- ANALYZER_DEMO_FIXTURES.risk with labelled demo patient risk profile
- All demo risk levels clearly labelled "DEMO — synthetic data"

### Tests needed
- `pages-risk-analyzer.test.js` — add: disclaimer present
- `pages-risk-analyzer.test.js` — add: override reason minimum length validated
- `pages-risk-analyzer.test.js` — add: risk levels have "indicator for review" labels
- Backend: `test_risk_analyzer_disclaimer_field.py`

---

## Shared Frontend Helpers (create tonight)

### `apps/web/src/clinical-disclaimer.js`

Create this shared module to make the standard disclaimer reusable across all 12 pages.

```javascript
// clinical-disclaimer.js — Shared clinical disclaimer helpers.
// Required on every AI/analyzer page.

export const CLINICAL_DISCLAIMER_TEXT =
  'This is a controlled preview using synthetic or clinician-provided data where applicable. ' +
  'This page supports clinical review and decision support only. It does not diagnose, ' +
  'prescribe, triage emergencies, approve treatment, or act autonomously. ' +
  'All outputs require clinician review.';

export function renderClinicalDisclaimer(additionalNote = '') {
  return `<div class="ds-clinical-disclaimer" role="note" aria-label="Clinical disclaimer">
    <span class="ds-clinical-disclaimer__icon" aria-hidden="true">⚕</span>
    <span class="ds-clinical-disclaimer__text">${CLINICAL_DISCLAIMER_TEXT}${additionalNote ? ' ' + additionalNote : ''}</span>
  </div>`;
}

export function renderPipelineStatusBadge(name, status) {
  // status: 'active' | 'demo' | 'unavailable' | 'heuristic'
  const labels = {
    active: { text: 'Active', cls: 'ds-badge--active' },
    demo: { text: 'Demo mode', cls: 'ds-badge--demo' },
    unavailable: { text: 'Unavailable', cls: 'ds-badge--off' },
    heuristic: { text: 'Heuristic fallback', cls: 'ds-badge--warn' },
  };
  const b = labels[status] || labels.unavailable;
  return `<span class="ds-pipeline-badge ${b.cls}">${name}: ${b.text}</span>`;
}

export function renderCapabilitiesSummary(capabilities) {
  if (!capabilities || !Object.keys(capabilities).length) return '';
  return Object.entries(capabilities)
    .map(([k, v]) => renderPipelineStatusBadge(k, v === true ? 'active' : v === false ? 'unavailable' : String(v)))
    .join(' ');
}
```

### `apps/web/src/evidence-link.js`

Standard evidence link renderer (some pages already have ad-hoc versions).

```javascript
// evidence-link.js — Render PubMed/DOI links consistently.

export function renderEvidenceLink(ref) {
  if (!ref) return '';
  let url = '';
  if (ref.pmid) url = 'https://pubmed.ncbi.nlm.nih.gov/' + encodeURIComponent(ref.pmid) + '/';
  else if (ref.doi) url = 'https://doi.org/' + encodeURIComponent(ref.doi);
  if (!url) return '';
  const label = ref.title ? ref.title.slice(0, 80) : (ref.pmid ? 'PMID ' + ref.pmid : ref.doi);
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="ds-evidence-link"
    aria-label="Open evidence source">${label}</a>`;
}

export function renderEvidenceGradeBadge(grade) {
  const g = (grade || 'low').toLowerCase();
  const map = {
    high: 'ds-grade--high',
    moderate: 'ds-grade--moderate',
    low: 'ds-grade--low',
  };
  const cls = map[g] || map.low;
  return `<span class="ds-evidence-grade ${cls}" title="Evidence grade: ${g}">Evidence: ${g}</span>`;
}
```

---

## Shared API Capabilities Pattern

All 12 pages should have a `GET /api/v1/<surface>/capabilities` endpoint.
Template response shape:

```json
{
  "surface": "qeeg",
  "backend": "active | heuristic | demo | unavailable",
  "features": {
    "mne_python": true,
    "bids_export": false,
    "fooof": false
  },
  "disclaimer": "Decision-support only. All outputs require clinician review.",
  "timestamp": "2026-05-08T23:00:00Z"
}
```

Pages that already have this pattern: qEEG (qeeg_capabilities_router.py), MRI (HAS_MRI_PIPELINE).
Pages that need it added: DeepTwin, Text NLP, Voice, Video, Biomarkers, Evidence, Protocol Studio,
Handbooks, Brain Map, Risk Analyzer.

---

## Demo Mode Rules (all 12 pages)

| Rule | Notes |
|---|---|
| `isDemoSession()` must gate all demo fixtures | DeepTwin, BrainMap, Protocols, Handbooks need this added |
| `VITE_ENABLE_DEMO=1` only for dev/test | Never silently in prod |
| Demo fixtures labelled "DEMO — synthetic data" | Visible banner, not just console |
| No real patient IDs in demo fixtures | Scan all demo fixture files |
| API calls return demo-shaped responses | Backend must not hit real patient DB in demo mode |

---

## Safety Sweep Checklist (for Agent 15)

Run this after agents 4-14 complete. For each of the 12 pages, verify:

- [ ] Full required disclaimer banner present at page mount
- [ ] No forbidden positive use of: diagnose, prescribe, treatment approved, guaranteed
      improvement, predicts cure, all clear, emergency triage, AI knows best, confirmed
      outcome, clinical prediction
- [ ] `isDemoSession()` or `shouldUseDeepTwinDemoFixtures()` gates demo content
- [ ] Demo fixtures labelled as synthetic/demo data
- [ ] All AI output cards have "decision-support only / clinician review required" labels
- [ ] Evidence links render (PubMed/DOI) and open correct URLs
- [ ] Pipeline status badge shows active/demo/unavailable
- [ ] Empty state (no patient selected, API down, demo mode) handled gracefully
- [ ] Override/audit mechanisms present where applicable (Risk, DeepTwin)

---

## Agent Assignment: Surface → Kanban Task

Each surface agent (4–14) should read the relevant section above before starting.

| Agent | Surface | Task ID | Section |
|---|---|---|---|
| 4 — DeepTwin Upgrade | patient-portal | t_11e21045 | §1 DeepTwin |
| 5 — qEEG Analyzer | clinical-hub | t_3085bb01 | §2 qEEG |
| 6 — MRI Analyzer | clinical-hub | t_4288cc57 | §3 MRI |
| 7 — Text/Clinical NLP | documents-reports | t_462b7940 | §4 Text NLP |
| 8 — Voice/Audio Analyzer | monitoring-care | t_503fef82 | §5 Voice |
| 9 — Video Analyzer | monitoring-care | t_a2224c01 | §6 Video |
| 10 — Biomarkers/Wearables | monitoring-care | t_ad374ff3 | §7 Biomarkers |
| 11 — Evidence Research | protocol-studio | t_dc03e693 | §8 Evidence |
| 12 — Protocol Studio | protocol-studio | t_dd982f69 | §9 Protocol Studio |
| 13 — Handbooks | documents-reports | t_e8d963bc | §10 Handbooks |
| 14 — Brain Map Planner | protocol-studio | t_facf1511 | §11 Brain Map |
| (Risk Analyzer) | (coordinator) | — | §12 Risk |

---

## Priority Execution Order for Tonight

**Execute in this order to avoid conflicts:**

1. Create `clinical-disclaimer.js` and `evidence-link.js` shared helpers (Class A, no conflict risk)
2. Pages 4-14: add disclaimer banner + isDemoSession() to missing pages (Class A, parallel)
3. Forbidden word fixes: rename `diagnoses` field in qEEG, fix any other occurrences (Class A)
4. Pipeline status badges: wire capabilities endpoints to UI (Class A)
5. Placeholder honest labels: video ai_metrics, handbook stubs, brainmap placeholder (Class A)
6. Risk Analyzer overrides: character validation, confirmation dialog (Class A)
7. Tests: one test per page verifying disclaimer + no forbidden words (Class A)

**Do not start tonight:**
- Any new ML dependency installation
- Whisper transcription backend
- FHIR schema validation
- LangGraph RAG pipeline
- Any GPU-dependent feature

---

## License Summary for Tonight

All Class A integrations are pure JS/UI work with no new dependencies.
Open-source libraries to be added in Class B phases:

| Library | Surface | License | Next step |
|---|---|---|---|
| MNE-Python | qEEG | BSD-3 | Backend adapter, sub-task |
| NiBabel + Nilearn | MRI, BrainMap | MIT/BSD | Backend adapter, sub-task |
| spaCy + medspaCy + Presidio | Text NLP | MIT | P0 — backend sub-task |
| NeuroKit2 | Biomarkers | MIT | Backend adapter, sub-task |
| Whisper + openSMILE | Voice | MIT | Retention policy gate first |
| MediaPipe | Video | Apache-2.0 | Backend adapter, sub-task |
| pymed + habanero | Evidence | MIT | Backend adapter, sub-task |
| fhir.resources | Protocol Studio | MIT | Backend adapter, sub-task |
| WeasyPrint + Jinja2 | Handbooks | BSD/MIT | Backend adapter, sub-task |
| plotly + Nilearn | Brain Map | MIT/BSD | Backend adapter, sub-task |

**Escalation required before any code from:** parselmouth (GPL-3), OpenPose (non-commercial),
DeepLabCut (LGPL-3), LeadDBS (GPL-3+MATLAB), FEniCS (LGPL).

---

*Architecture document produced by Agent 3 — Architecture Lead*
*For DeepSynaps overnight sprint 2026-05-08*
*Source: scout report (agent/coordinator/t_6c8af546), license review (agent/coordinator/t_4b93fd33)*
*All integrations are Class A (UI/frontend) unless explicitly marked Class B/C.*
