# Voice Analyzer — Architecture Report & Bug Analysis
## DeepSynaps Protocol Studio — Clinical Voice Biomarker Intelligence

**Date:** 2026-05-14  
**Status:** ANALYSIS COMPLETE — 5 bugs confirmed

---

## 1. Stack Overview

### Frontend (2 files, 1,186 lines)
| File | Purpose | Size |
|------|---------|------|
| `pages-voice-analyzer.js` | Main voice analyzer page — upload, record, results, patient context | 1,110 lines |
| `voice-decision-support.js` | Clinical disclaimers, evidence packs, pipeline metadata | 76 lines |

### Backend (4 files, 694 lines)
| File | Purpose | Size |
|------|---------|------|
| `audio_analysis_router.py` | Router — 3 endpoints (analyze, analyze-upload, analyze-recording) | 402 lines |
| `audio_pipeline.py` | Pipeline runner | 87 lines |
| `audio_voice_evidence.py` | Evidence pack builder | 133 lines |
| `audio_voice_persistence.py` | DB persistence — **BUG-001 here** | 72 lines |

### 3 Input Methods
| Method | Endpoint | Status |
|--------|----------|--------|
| Browser recording | Upload blob to `/analyze-upload` | ✅ Working |
| File upload | Upload file to `/analyze-upload` | ✅ Working |
| Stored clinic recording | `/analyze-recording/{recording_id}` | ⚠️ Backend exists, **frontend missing** (BUG-003) |

---

## 2. Bug Analysis — CONFIRMED

### BUG-001: Persisted status always "completed" 🔴 HIGH

**File:** `audio_analysis_router.py:133-146` + `audio_voice_persistence.py:28`

**Current broken code:**
```python
# Router calls persist without status:
persist_voice_analysis(
    db,
    analysis_id=analysis_id,
    voice_report=report,
    run_context={...},
    # ... other params ...
    # status is NOT passed! Defaults to "completed"
)

# Persistence has hardcoded default:
def persist_voice_analysis(..., status: str = "completed"):
```

**The pipeline returns:** `run.status` which can be `completed`, `warning`, `failed`, `partial`  
**But persistence always saves:** `status="completed"`

**Fix:** Pass `status=run.status` from router to persistence.

### BUG-002: Patient switch doesn't clear prior report 🔴 HIGH

**File:** `pages-voice-analyzer.js:901-906`

**Current broken code:**
```javascript
document.getElementById('va-patient-select')?.addEventListener('change', (e) => {
    const v = e.target?.value?.trim() || '';
    _persistPatientSelection(v);
    refreshAnalysisList(v);
    _refreshVoiceDrHero(v);
    // ❌ Does NOT clear va-result-wrap or va-result!
});
```

**Impact:** Old patient's voice analysis remains visible when switching to new patient.

**Fix:** Add `resultWrap().style.display = 'none'; resultEl().innerHTML = '';` to patient change handler.

### BUG-003: No UI for stored clinic recording analysis 🟡 MEDIUM

**File:** Frontend missing — backend exists at `audio_analysis_router.py:280-347`

**Backend has:** `POST /analyze-recording/{recording_id}` — full implementation  
**Frontend has:** Only upload and browser recording — no "Analyze existing clinic recording" section

**Fix:** Add UI section with recording list + analyze button.

### BUG-004: Backend persists absolute paths/raw context 🟡 MEDIUM

**File:** `audio_voice_persistence.py:41-45`

**Current code:**
```python
row = AudioAnalysis(
    input_path=input_path,  # ← May contain absolute filesystem path
    voice_report_json=json.dumps(voice_report, default=str),
    run_context_json=json.dumps(ctx_out, default=str),  # ← May contain sensitive context
    # ...
)
```

**Fix:** Strip/redact sensitive fields before persistence. Store safe storage reference instead of absolute path.

### BUG-005: Test coverage too narrow 🟡 MEDIUM

**Current tests:** 4 backend test files but no frontend runtime tests for patient switch or status display.

**Fix:** Add frontend runtime tests for all 5 bugs.

---

*Report generated: 2026-05-14*
