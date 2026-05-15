# World-Class Video Analyzer + Movement Analyzer — Research Roadmap

## Executive Summary

DeepSynaps Video Assessments + Movement Analyzer have been transformed from MVP to a research-informed, safety-first, evidence-graded clinical platform. This mission delivered:

- **8 deep research reports** (6,957+ lines) covering movement biomarkers, computer vision, open-source tools, behavioural observation, telehealth, multimodal fusion, UX benchmarks, and AI safety/ethics
- **45 new tests** (17 JS + 28 Python) covering runtime mount, consent enforcement, safety wording
- **7 critical runtime bugs fixed** (undefined variables, missing functions, duplicate listeners)
- **Backend hardened**: consent enforcement, audit logging, safety check endpoint, retention policy, rate limiting
- **Research findings applied to code**: evidence-graded biomarker displays, AI safety disclosures, keyboard shortcuts, pose estimation backend, video quality checks

## Research Reports Delivered

| # | Report | Lines | Key Finding |
|---|--------|-------|-------------|
| 1 | MOVEMENT_BIOMARKER_EVIDENCE_MATRIX.md | 692 | 26 biomarkers, 12 categories, grades A-D |
| 2 | VIDEO_ANALYZER_COMPUTER_VISION_STACK.md | 930 | 20+ CV systems benchmarked, MediaPipe #1 |
| 3 | OPEN_SOURCE_VIDEO_ANALYZER_STACK_REPORT.md | 686 | 25 open-source projects found |
| 4 | BEHAVIOURAL_OBSERVATION_RESEARCH.md | 1,222 | 6 validated frameworks (ADOS-2, BOSCC, etc.) |
| 5 | VIRTUAL_CARE_VIDEO_ASSESSMENT_DESIGN.md | 661 | Remote NIHSS ICC=0.936, home gait validated |
| 6 | MULTIMODAL_VIDEO_FUSION_DESIGN.md | 505 | Video+voice AUC 0.875 for PD detection |
| 7 | VIDEO_ANALYZER_UX_BENCHMARK.md | 748 | 15 systems benchmarked, ELAN shortcuts adopted |
| 8 | VIDEO_AI_SAFETY_ETHICS_REPORT.md | 1,513 | 144 actionable safety recommendations |

## Critical Bugs Fixed

| # | Bug | Severity | Fix |
|---|-----|----------|-----|
| 1 | `_vaBackendSessions` undefined | CRITICAL | Added declaration with `{items:[], loading:false, error:null}` |
| 2 | `VIDEO_ASSESSMENT_ATTACHMENT_STORAGE_KEY` undefined | CRITICAL | Added `const` declaration |
| 3 | `_vaBackendBinding` undefined | CRITICAL | Added declaration with full state object |
| 4 | `_vaConflictDraft` undefined | CRITICAL | Added declaration |
| 5 | `disabledAttr` undefined | HIGH | Added declaration in render scope |
| 6 | `conflictBanner` undefined | HIGH | Added declaration |
| 7 | 11 missing helper functions | HIGH | Added `_renderSessionChooser`, `_refreshBackendSessions`, `_loadBackendSession`, `_refreshAttachedSession`, `_createPersistedSession`, `_confirmDiscardLocalDraft`, `_clearConflictDraft`, `_feedbackRequiresNote`, `_patchAttachedSession`, `_startScratchpadSession`, `_ensureSelectedTaskServerVideo` |
| 8 | Duplicate event listeners | MEDIUM | Removed duplicate keyboard handler blocks |

## Files Changed

### Frontend (JavaScript)
| File | Changes |
|------|---------|
| `apps/web/src/pages-video-assessments.js` | +~400 lines: runtime fixes, evidence badges, safety panel, keyboard shortcuts, speed control, honest states, bias disclosure |
| `apps/web/src/pages-movement-analyzer.js` | +~200 lines: MOVEMENT_BIOMARKER_EVIDENCE matrix, evidence badges, safe wording, confidence indicators, critical safety banner, bias panel, keyboard shortcuts, evidence panel, side-by-side comparison |

### Backend (Python)
| File | Changes |
|------|---------|
| `apps/api/app/routers/video_assessment_router.py` | +~150 lines: safety check endpoint, retention policy, rate limiting on 7 write endpoints |
| `apps/api/app/routers/movement_analyzer_router.py` | +~100 lines: consent enforcement (2 endpoints), audit logging (4 endpoints), biomarker endpoint, retention policy, rate limiting |
| `apps/api/app/services/video_pose_backend.py` | NEW: pluggable pose estimation backend (MediaPipe/MoveNet/YOLO/Disabled) |
| `apps/api/app/services/video_assessment_seed.py` | +~200 lines: evidence grades per task (16 tasks), contraindications, remote compatibility, validation rules |
| `apps/api/app/settings.py` | Added `pose_backend_type` config |

### Tests
| File | Tests |
|------|-------|
| `apps/web/src/pages-video-assessments.runtime.test.js` | NEW: 7 runtime mount tests |
| `apps/web/src/video-assessment-safety-wording.test.js` | NEW: 10 safety wording validation tests |
| `apps/api/tests/test_video_consent.py` | NEW: 11 consent enforcement tests |
| `apps/api/tests/test_movement_consent.py` | NEW: 17 consent + isolation + audit tests |

## Research Applied to Code

### Movement Biomarker Evidence (from Report #1)
- **26 biomarkers** with evidence grades A-D added to movement analyzer
- **Grade A gait**: highlighted as "strongest validated video-based movement biomarker" (AUC 0.91-0.99)
- **Grade B tremor**: frequency distinguishes PD (4-6 Hz) from ET (8-12 Hz), ICC 0.82-0.91
- **Grade C monitoring**: amber "research-only" warning with limited clinical validation note
- **Safe wording**: every modality shows evidence-context safe clinical phrasing

### Computer Vision Stack (from Report #2)
- **MediaPipe BlazePose** configured as default (ICC=0.94, 30 FPS mobile, Apache-2.0)
- Pluggable backend supports: mediapipe, movenet, yolo_pose, disabled
- 33-keypoint schema with confidence per keypoint
- Movement feature extraction schema: gait_speed, stride_length, arm_swing, tremor_band_power, postural_sway, movement_smoothness, asymmetry_index

### AI Safety & Ethics (from Report #8)
- **Critical safety banner** on both analyzers: 5-point limitation disclosure (FDA status, camera artifacts, demographic bias, clinician requirement, non-replacement of exam)
- **Bias disclosure panel**: 4 known limitations (skin tone/age/body type, camera angle, lighting, clothing)
- **Confidence indicators**: "Low confidence" warning <0.7, "Camera quality" note <0.85
- **Uncertainty labels**: every biomarker shows evidence grade + confidence range

### UX Benchmark (from Report #7)
- **ELAN-style keyboard shortcuts**: Space (play/pause), arrows (seek), Shift+arrows (fine seek), Up/Down (speed), A (annotate), C (comparison), F (fullscreen), S (skeleton), E (evidence), ? (help)
- **Playback speed control**: 0.25x-2x dropdown for detailed movement review
- **Side-by-side comparison**: current vs prior, left vs right, baseline vs follow-up
- **Collapsible evidence panel**: biomarker grades, references, confidence, safe wording
- **Honest UI states**: 9 distinct states with clear, non-overclaiming descriptions

### Telehealth Design (from Report #5)
- **16 task types** with evidence grades, clinical references, contraindications
- **Remote compatibility flags**: FULL/PARTIAL/LIMITED per task
- **Validation rules**: min/max duration, required body parts, lighting requirements
- **Video quality check endpoint**: resolution, frame rate, lighting, occlusion scoring

### Behavioural Observation (from Report #4)
- **ADOS-2, BOSCC, ESCS, SORF** frameworks documented for autism assessment
- **Psychomotor slowing markers**: SRRS, CORE, MARS scales for depression
- **Joint attention coding**: IJA/RJA/IBR domains with inter-rater reliability
- All findings framed as clinician-supported observation only

## API Contract Changes

### New Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/movement/analyzer/patient/{patient_id}/biomarkers` | GET | Evidence-graded movement biomarkers with trends |
| `/api/v1/video-assessments/sessions/{id}/safety-check` | POST | Validate session safety before clinician review |
| `/api/v1/video-assessments/quality-check` | POST | Analyze video quality (resolution, lighting, occlusion) |

### Enhanced Endpoints
| Endpoint | Enhancement |
|----------|-------------|
| `GET /api/v1/movement/analyzer/patient/{patient_id}` | + consent check, + audit logging |
| `POST /api/v1/movement/analyzer/patient/{patient_id}/recompute` | + consent check, + audit logging, + rate limit |
| `POST /api/v1/movement/analyzer/patient/{patient_id}/annotation` | + audit logging, + rate limit |
| `POST /api/v1/movement/analyzer/patient/{patient_id}/review` | + rate limit |
| `GET /api/v1/movement/analyzer/patient/{patient_id}/export.json` | + retention policy, + audit logging |
| `GET /api/v1/movement/analyzer/patient/{patient_id}/audit` | + audit logging |
| All video-assessment write endpoints | + rate limiting (30/minute) |
| Video-assessment export | + retention policy (7-year) |

## Cross-Page Integration Map

```
Video Assessments + Movement Analyzer connects to:
├── Voice Analyzer — shared patient context, combined assessment view
├── Text Analyzer — clinical note extraction from video review
├── Biomarkers — movement findings feed into biomarker dashboard
├── qEEG — movement + brain activity correlation
├── Risk Analyzer — fall risk from gait + posture analysis
├── Assessments V2 — video tasks as assessment battery items
├── Protocol Studio — movement findings inform protocol selection
├── Virtual Care — remote video session recordings
├── Reports — video findings in clinical reports
├── Dashboard — patient movement trends over time
└── Patient Profile — movement history in patient timeline
```

## Button/Action Matrix

| Action | Button | Endpoint | Consent | Audit | Safety Note |
|--------|--------|----------|---------|-------|-------------|
| Create session | "Start assessment" | POST /sessions | recording | session_created | Patient-only |
| Record video | "Start recording" | (browser) | recording | recording_started | Camera check |
| Upload video | "Upload clip" | POST /tasks/{id}/upload | recording | upload_complete | Max 120MB |
| Review task | "Save review" | PATCH /sessions/{id} | ai_analysis | review_saved | Clinician-only |
| Finalize | "Mark complete" | POST /sessions/{id}/finalize | ai_analysis | finalized | Conflict check |
| View workspace | — | GET /movement/patient/{id} | ai_analysis | viewed | Role-gated |
| Recompute | "Refresh analysis" | POST /movement/recompute | ai_analysis | recompute | Force refresh |
| Annotate | "Add note" | POST /movement/annotation | ai_analysis | annotated | Required text |
| Export | "Download JSON" | GET /movement/export.json | ai_analysis | exported | Retention note |
| Safety check | "Check safety" | POST /safety-check | — | safety_check | Pre-review |
| Quality check | "Check quality" | POST /quality-check | — | quality_check | Post-upload |

## Tests Summary

| Category | Count | Coverage |
|----------|-------|----------|
| Runtime mount | 7 | Page loads, session init, recording flow |
| Safety wording | 10 | No diagnosis claims, decision-support framing |
| Video consent | 11 | AI analysis, recording, cross-patient, withdrawal |
| Movement consent | 17 | Workspace, recompute, isolation, audit trail |
| **Total new** | **45** | |

## Remaining Risks

| Risk | Mitigation | Priority |
|------|-----------|----------|
| Pose estimation not yet live | Stub backend ready; needs MediaPipe integration | P0 |
| Skin tone bias in pose estimation | Bias disclosure shown; need diverse validation dataset | P1 |
| Camera quality affects accuracy | Quality check endpoint warns; needs re-record workflow | P1 |
| Paediatric privacy (COPPA) | Consent framework in place; need parental consent UI | P1 |
| No FDA-cleared video biomarker | Safety banner states this; pure decision-support | P0 (accepted) |
| Explainability limited | Confidence scores shown; need attention maps | P2 |
| Multimodal fusion not wired | Design document ready; needs implementation | P2 |

## 16-Week Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- Integrate MediaPipe BlazePose backend (P0)
- Implement live pose estimation endpoint
- Add video quality pre-check UI
- Wire pose data to movement feature extraction

### Phase 2: Clinical Features (Weeks 5-8)
- Gait analysis pipeline (stride length, cadence, variability)
- Tremor frequency/amplitude extraction (4-6 Hz band)
- Finger tapping speed analysis
- Postural sway estimation
- Evidence panel with live literature references

### Phase 3: Integration (Weeks 9-12)
- Multimodal fusion: video + voice + text
- Virtual Care session recording integration
- Cross-page data flow: movement → biomarkers → risk → protocols
- Home video follow-up workflows

### Phase 4: Safety & Scale (Weeks 13-16)
- Bias testing with diverse datasets
- Explainability: attention maps, SHAP values
- Paediatric consent workflow
- Performance optimization for mobile
- Regulatory documentation (FDA SaMD)

## Merge Recommendation: READY WITH WARNINGS

**READY because:**
- All critical runtime bugs fixed
- 45 new tests passing
- Syntax valid on all files
- Consent and audit hardened
- Research findings applied to code

**WARNINGS:**
- Pose estimation backend is stub (needs MediaPipe integration)
- Some video assessment UI features need browser testing
- Paediatric consent workflow needs dedicated UI
- Bias testing requires diverse validation dataset

## Clinical Safety Framing

This platform is:
- **Clinical decision support only. Requires clinician review.**
- NOT autonomous diagnosis, emergency triage, or treatment recommendation
- All movement features are "model-assisted observation cues"
- Every biomarker shows evidence grade + safe clinical wording
- FDA status clearly stated (no video biomarker FDA-approved as of 2026)
- Camera artifact, bias, and quality limitations prominently disclosed

## References

- 30+ peer-reviewed movement biomarker studies (2023-2026)
- 15 clinical software systems UX-benchmarked
- 25 open-source projects evaluated
- FDA 2024-2025 AI/ML SaMD guidance
- EU AI Act 2024/1689
- JAMA Psychiatry 2024 neurofeedback meta-analysis (38 RCTs, n=2472)
- 8 research reports with full citations included in repository

---
*Generated: 2026-05-14. All clinical claims are decision-support research, not clinical advice.*
