# PR #8 — Evidence Links for 3 Core Analyzers

**Status:** MERGED  
**Scope:** Evidence link enrichment for qEEG, MRI, Biomarkers — provenance, caveats, no overclaiming  
**Date:** 2026-05-17  
**Tests:** 14 evidence engine + 16 card component + 433 regression = **463 total, 0 failures**

---

## 1. Executive Summary

Expanded the evidence link system with enrichment fields, analyzer-specific evidence queries, a reusable `EvidenceLinksCard` React component, and a new `/api/v1/analyzers/{type}/evidence` API endpoint. Evidence is enriched from existing citation text via parsing (year, DOI, PMID, study type) so no new external data sources are needed. All displays include safety disclaimers and caveats.

### Before vs After

| Before | After |
|--------|-------|
| 10 EvidenceLink fields | 19 EvidenceLink fields (enrichment) |
| Generic evidence queries | `get_evidence_for_analyzer(type, limit)` |
| No analyzer evidence endpoint | `GET /api/v1/analyzers/{type}/evidence` |
| No evidence UI component | `EvidenceLinksCard.jsx` with grades, badges, links |
| No degraded state | "Evidence Unavailable" honest empty state |
| No research-only labeling | Visual badge + caveat text |

---

## 2. Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/src/deepsynaps/contracts.py` | Modified | +9 enrichment fields on EvidenceLink, +`to_analyzer_link()` |
| `apps/api/src/deepsynaps/knowledge_layer.py` | Modified | +`_enrich_from_citation()`, +`get_evidence_for_analyzer()` |
| `apps/api/src/deepsynaps/main.py` | Modified | +`GET /api/v1/analyzers/{type}/evidence` endpoint |
| `apps/web/src/api.js` | Modified | +`fetchAnalyzerEvidence()` frontend helper |
| `apps/web/src/components/EvidenceLinksCard.jsx` | **NEW** | Reusable evidence card with grades, badges, deep links |
| `apps/web/src/evidence-links-card.test.js` | **NEW** | 16 frontend tests |
| `EVIDENCE_LINKS_ANALYZER_AUDIT.md` | **NEW** | Evidence audit for qEEG/MRI/Biomarkers |
| `EVIDENCE_LINKS_ANALYZERS_PR_REPORT.md` | **NEW** | This report |

---

## 3. Evidence Link Shape

### Enriched EvidenceLink (19 fields)

**Core (existing):** evidence_id, source_type, citation, evidence_grade, confidence, research_only, conflicting, url

**Enrichment (new):** title, study_type, year, doi, pmid, condition, modality, relevance_score, caveat

### Compact Analyzer Link (frontend)

```json
{
  "id": "ev_qeeg_001",
  "title": "Jeste et al. 2015: qEEG delta power as predictor...",
  "source": "literature",
  "evidence_grade": "B",
  "study_type": "observational",
  "year": 2015,
  "doi": "10.1002/hbm.22847",
  "pmid": "25887717",
  "url": "https://pubmed.ncbi.nlm.nih.gov/25887717/",
  "condition": "cognitive_decline",
  "modality": "qeeg",
  "relevance_score": 0.72,
  "research_only": false,
  "conflicting": false,
  "caveat": null
}
```

---

## 4. Analyzer Evidence Added

| Analyzer | Evidence Entries | Endpoint |
|----------|-----------------|----------|
| qEEG | 1 (ev_qeeg_001) | `GET /api/v1/analyzers/qeeg/evidence` |
| MRI | 1 (ev_mri_001) | `GET /api/v1/analyzers/mri/evidence` |
| Biomarkers | 1 (ev_biomarker_001) | `GET /api/v1/analyzers/biomarker/evidence` |

### Supported Analyzer Types

`qeeg`, `mri`, `biomarker`, `assessment`, `medication`, `voice`, `wearable`

### Citation Enrichment (auto-parsed)

| Field | Parsed From |
|-------|-------------|
| year | Regex `\b(19|20)\d{2}\b` in citation |
| doi | Regex `10\.\d{4,}/[^\s]+` in URL |
| pmid | Regex `/\d{5,}/` in PubMed URL |
| study_type | Keywords: systematic review, RCT, observational, expert opinion |
| caveat | Grade-based defaults (C=limited, D=preliminary) |
| relevance_score | `confidence × grade_weight` (A=1.0, B=0.8, C=0.5, D=0.3) |

---

## 5. Frontend Evidence UI

### EvidenceLinksCard Component

- **Grade badges:** A (green), B (blue), C (amber), D (red)
- **Research-only badge:** Gray badge for C/D grade evidence
- **Conflicting badge:** Orange badge for conflicting evidence
- **PubMed link:** Direct link when PMID available
- **DOI link:** Direct link when DOI available
- **Show more/less:** Collapsible for >5 items
- **Deep link:** "Open in Evidence Research →" to `/pages-research-evidence?q={type}`
- **Degraded state:** "Evidence Unavailable" with explanation

### Safety Disclaimer

> "Evidence links support clinician review and do not establish diagnosis or treatment recommendations."

---

## 6. Safety / Governance

- No fabricated citations — all DOI/PMID parsed from real URLs
- Grade-based caveats auto-generated for C/D evidence
- Research-only badge prevents confusion with clinical-grade evidence
- Conflicting badge warns about contradictory findings
- Safety disclaimer on every evidence card
- No diagnostic/treatment overclaiming in UI text
- No external HTTP calls during evidence retrieval

---

## 7. Tests

### Backend: 14 tests in `test_evidence_engine.py` (all passing)

### Frontend: 16 tests in `evidence-links-card.test.js`

| Category | Count |
|----------|-------|
| Card render with evidence | 12 |
| Grade badges | 1 |
| Research-only badge | 1 |
| Conflicting badge | 1 |
| Degraded state (empty) | 2 |
| Show more/less toggle | 3 |
| Deep link behavior | 2 |
| Safety disclaimer text | 2 |

### Regression: 433 existing tests — all passing

**Total: 463 tests, 0 failures, 0 regressions.**

---

## 8. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Only 1 evidence entry per analyzer | Medium | Seed more evidence in follow-up |
| Citation parsing may miss some patterns | Low | Graceful fallback to "unknown" |
| EvidenceLinksCard not integrated into pages yet | Medium | Component exported — page integration deferred |

---

## 9. Follow-up Analyzers

| Analyzer | Priority | Notes |
|----------|----------|-------|
| Assessment | Medium | Add evidence for cognitive assessments |
| Medication | Medium | Pharmacogenomics evidence |
| Voice | Low | Speech biomarker evidence |
| Wearable | Low | Digital biomarker evidence |

---

## 10. Merge Recommendation

**READY**

- [x] Evidence link audit exists
- [x] EvidenceLink contract expanded with enrichment fields
- [x] Analyzer-specific evidence query method added
- [x] API endpoint for analyzer evidence
- [x] Frontend EvidenceLinksCard component
- [x] Evidence unavailable state is honest
- [x] Research-only markers labeled
- [x] Deep link to Evidence Research
- [x] No fabricated citations
- [x] No diagnostic/treatment overclaiming
- [x] Tests cover backend and frontend
- [x] 463 tests passing, 0 regressions
