# Text Analyzer — Architecture Audit & Bug Report

## File Inventory (6 source files, 1,580+ lines)

| File | Lines | Role |
|------|-------|------|
| `apps/web/src/pages-text-analyzer.js` | 756 | Frontend UI, event wiring, result rendering |
| `apps/api/app/routers/clinical_text_router.py` | 171 | FastAPI router, auth gates, consent enforcement |
| `apps/api/app/services/openmed/schemas.py` | 155 | Pydantic models — SourceType, entities, responses |
| `apps/api/app/services/openmed/adapter.py` | 50 | Backend facade — selects HTTP vs heuristic |
| `apps/api/app/services/openmed/backends/http.py` | 196 | HTTP backend calling real OpenMed service |
| `apps/api/app/services/openmed/backends/heuristic.py` | 751 | Regex fallback — comprehensive med patterns |

## Bug Report

### BUG-001 — Frontend source_type options invalid (SEVERITY: HIGH)
**Root cause:** Frontend offers 4 neuromodulation-specific source types (`stimulation_log`, `device_interrogation`, `programming_note`, `session_note`) that are NOT in the backend `SourceType` enum.

**Frontend options (line 470-473):**
```javascript
<option value="stimulation_log">Stimulation log</option>
<option value="device_interrogation">Device interrogation report</option>
<option value="programming_note">Programming note</option>
<option value="session_note">Session note</option>
```

**Backend accepted values (schemas.py line 14-22):**
```python
SourceType = Literal[
    "clinician_note", "patient_note", "referral",
    "intake_form", "transcript", "document_text", "free_text",
]
```

**Impact:** Any user selecting these neuromod options gets a FastAPI 422 validation error. The `toApiSourceType()` function passes them through unchanged (line 126-129), so they'll hit the backend as-is.

**Fix:** Add neuromodulation-specific source types to backend SourceType enum + map them in `toApiSourceType()`.

---

### BUG-002 — Invalid patient_id silently bypasses consent (SEVERITY: MEDIUM)
**Root cause:** `_gate_patient_context()` returns `False` for nonexistent patient_id instead of raising HTTPException(404). The caller then skips consent enforcement entirely, running analysis in "generic mode" without any audit trail.

**Current behavior (clinical_text_router.py line 85-89):**
```python
exists, clinic_id = resolve_patient_clinic_id(db, patient_id)
if not exists:
    return False  # Silently skips consent enforcement
```

**Impact:** A malformed or forged patient_id doesn't get flagged. The analysis runs without consent checks and without any error to the user. This is intentional per the docstring ("no real patient data to gate") but creates a silent degradation path.

**Fix:** Return 404 for non-empty but non-existent patient_ids. Only return False (skip consent) when patient_id is truly empty/null.

---

### BUG-003 — Heuristic fallback not prominent enough (SEVERITY: MEDIUM)
**Root cause:** When the OpenMed HTTP backend is unreachable, the system falls back to regex-based heuristic extraction. The backend indicator in the status area is subtle — a small text line showing "heuristic backend".

**Current behavior:**
- `refreshBackendStatus()` shows backend info in small gray text
- `renderPHIWarningBadge()` shows amber "heuristic only" badge
- No prominent banner explaining degraded capabilities

**Impact:** Users may not realize they're getting regex-extracted entities (lower quality) vs. model-based extraction. Clinical decisions based on incomplete extraction are risky.

**Fix:** Add a persistent, visually prominent degraded-mode banner when backend != "openmed_http".

---

### BUG-004 — Frontend role gate narrower than backend (SEVERITY: LOW)
**Root cause:** Frontend allows only `['clinician', 'admin']` while backend `require_minimum_role(actor, "clinician")` typically also allows superuser and other elevated roles.

**Fix:** Align frontend role check with backend — use the same role resolution or make it more permissive.

---

### BUG-005 — No runtime or integration tests (SEVERITY: MEDIUM)
**Root cause:** No test files exist for clinical text router, adapter, or frontend.

**Fix:** Add pytest tests for the router endpoints and adapter behavior.

---

## Cross-Page Integration Gaps

The Text Analyzer is an island — it should be wired into:
1. **Documents** — "Send to Text Analyzer" from document viewer
2. **Voice Analyzer** — Transcribed text → Text Analyzer for entity extraction
3. **Virtual Care** — Session notes → Text Analyzer for clinical entity capture
4. **Protocol Studio** — Extracted neuromod entities → Protocol generation hints
5. **Risk Analyzer** — Extracted risk factors → Risk scoring
6. **Patient Reports** — Deidentified text → Export-safe reports

## UI/UX Improvements Needed
1. Degraded-mode banner (BUG-003)
2. History of recent analyses per patient
3. Export extracted entities to CSV/JSON
4. Compare mode: before/after text analysis for same patient
5. Confidence threshold filter
6. Quick-copy deidentified text

## Research Roadmap Topics
1. Clinical NLP evidence landscape (2024-2026)
2. De-identification standards & open-source tools
3. Neuromodulation text extraction benchmarks
4. PHI protection frameworks for clinical text
5. Integration patterns with EHR/note systems
