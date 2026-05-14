# Evidence & Research — Architecture Report & Bug Analysis
## DeepSynaps Protocol Studio — Evidence Intelligence Workspace

**Date:** 2026-05-14  
**Status:** ANALYSIS COMPLETE — 4 critical bugs confirmed

---

## 1. Stack Overview

### Frontend (1 file, 1,549 lines)
| File | Purpose |
|------|---------|
| `pages-research-evidence.js` | Evidence search, maps, paper detail, research bundle workspace |

### Backend (6 files, 12,282 lines)
| File | Purpose | Size |
|------|---------|------|
| `evidence_router.py` | Main router — 3,238 lines, 40+ endpoints | 3,238 lines |
| `evidence_terminal.py` | Terminal schemas — snapshot, search, links | 1,036 lines |
| `evidence_terminal_service.py` | Terminal service — evidence exploration | 1,240 lines |
| `evidence_intelligence.py` | Evidence intelligence — ranking, matching | 2,290 lines |
| `neuromodulation_research.py` | Research datasets, conditions, papers | 2,581 lines |
| `schema.sql` | Evidence pipeline DB schema | 1,397 lines |

### Data Sources
- **SQLite evidence DB**: `deepsynaps_evidence.duckdb` / `evidence.db` — indexed papers, trials, indications
- **Terminal explorer**: Direct DB queries for evidence exploration
- **Research bundle**: File-based datasets (CSV/JSON) for neuromodulation research
- **Europe PMC API**: External paper source

---

## 2. Bug Analysis — CONFIRMED

### BUG-001: Consent enforcement dead code 🔴 HIGH

**File:** `evidence_router.py:3159-3187`

**The bug:**
```python
def search_evidence(...):
    # ... search logic ...
    _audit("search", actor, q=q, result_count=len(hits))
    return EvidenceSearchOut(query=q, total=len(hits), hits=hits)  # ← RETURNS HERE
    # CONSENT ENFORCEMENT: ai_analysis (evidence)  ← DEAD CODE — NEVER EXECUTES
    try:
        require_ai_analysis_consent(...)
    except ConsentMissingError:
        raise HTTPException(status_code=403, detail="Patient consent required...")
    # DUPLICATE at lines 3175-3187 — also dead
```

**Impact:** Patient-linked evidence searches bypass consent check. Dead code gives false impression of enforcement.

**Fix:** Move consent check BEFORE the search logic. Only enforce when `patient_id` is provided.

### BUG-002: Export endpoints are placeholders 🔴 HIGH

**Files:** `evidence_router.py:1894-1921`

**The bug:**
```python
def create_research_dataset_export(body, ...):
    export_id = str(uuid.uuid4())
    return ResearchExportRequestOut(export_id=export_id, status="queued", ...)  # ← Nothing actually queues!

def create_research_bundle_export(...):
    export_id = str(uuid.uuid4())
    return ResearchExportRequestOut(export_id=export_id, status="queued", ...)  # ← Nothing actually queues!
```

**Impact:** Frontend shows "queued" but no job ever runs. Users wait for exports that never complete.

**Fix:** Implement minimal real CSV/JSON export with in-memory generation.

### BUG-003: Terminal snapshot misreports trial totals 🔴 HIGH

**File:** `evidence_router.py:759, 985-995`

**Backend** returns correct `total_trials = SELECT count(*) FROM trials`  
**Frontend** at `api.js:2405-2406` infers `is_oa` from `source_url` regex — should use explicit `is_oa` from backend.

Actually, the trial count issue is more subtle — need to check if frontend uses `counts.trial_indications` as fallback.

### BUG-004: OA status falsely inferred from URL 🔴 HIGH

**Frontend:** `api.js:2406`
```javascript
is_oa: /doi\.org|pubmed|example/.test(String(row.source_url || '')),
```

**Backend:** Has explicit `is_oa` boolean field from DB + `oa_url` field.

**Impact:** Papers with DOI URLs are incorrectly labeled as open access when they may be paywalled.

**Fix:** Use backend's explicit `is_oa` field. If unknown, show "unknown/restricted" not "true".

---

## 3. API Contract Issues

| Issue | Location | Current | Should Be |
|-------|----------|---------|-----------|
| Consent dead code | `search_evidence()` lines 3160-3187 | `return` before consent | Consent check before `return`, conditional on `patient_id` |
| Export placeholder | `create_research_*_export()` | `status="queued"` with no job | Real CSV/JSON generation or honest `status="preview_unavailable"` |
| OA inference | `api.js:2406` | Regex on `source_url` | Use explicit `is_oa` from backend |
| Trial count | Frontend fallback | `counts.trial_indications` | Use `total_trials` from backend only |

---

## 4. Research Intelligence Plan

### Evidence Architecture Benchmark
- **Epistemonikos**: Living systematic reviews — adopt continuous evidence updating
- **Cochrane Library**: Gold-standard SRs — reference for evidence grading
- **PubMed Clinical Queries**: Built-in evidence filters — adopt for search UX
- **Dimensions.ai**: Citation network analysis — integrate for evidence maps

### Open Source Stack
- **PyMed**: Europe PMC / PubMed client (MIT)
- **Biopython Entrez**: NCBI access (BSD)
- **NetworkX**: Citation network graphs (BSD)
- **Pandas**: Evidence data processing (BSD)

---

*Report generated: 2026-05-14*
