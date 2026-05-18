# Evidence Links Analyzer Audit — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Auditor:** Automated Architecture Audit  
**Scope:** qEEG, MRI, Biomarkers — evidence link coverage

---

## 1. Current Evidence Infrastructure

### Evidence Database

| Field | Type | Content |
|-------|------|---------|
| evidence_id | TEXT PK | ev_qeeg_001, ev_mri_001, etc. |
| source_type | TEXT | "literature" |
| citation | TEXT | Author Year: Title summary |
| evidence_grade | TEXT | A, B, C, D (GRADE) |
| confidence | REAL | 0.0–1.0 |
| research_only | INTEGER | 0 or 1 |
| conflicting | INTEGER | 0 or 1 |
| url | TEXT | PubMed or DOI URL |
| modality_scope | TEXT | qeeg, mri, biomarker, etc. |
| clinical_tags | TEXT | cognitive_decline, neurodegeneration, etc. |

### Seeded Evidence (8 entries)

| ID | Modality | Grade | Research Only |
|----|----------|-------|---------------|
| ev_qeeg_001 | qeeg | B | Yes |
| ev_biomarker_001 | biomarker | B | Yes |
| ev_sleep_001 | wearable | A | No |
| ev_medication_001 | medication | B | Yes |
| ev_mri_001 | mri | A | No |
| ev_adherence_001 | medication | A | No |
| ev_voice_001 | voice | C | Yes (conflicting) |
| ev_assessment_001 | assessment | B | Yes (conflicting) |

---

## 2. Analyzer Coverage

| Analyzer | Evidence Entries | Grade Range | Gap |
|----------|-----------------|-------------|-----|
| **qEEG** | 1 (ev_qeeg_001) | B | Needs 2-4 more entries |
| **MRI** | 1 (ev_mri_001) | A | Needs 2-4 more entries |
| **Biomarkers** | 1 (ev_biomarker_001) | B | Needs 2-4 more entries |

### Evidence Available Per Analyzer

**qEEG:**
- ev_qeeg_001: Jeste et al. 2015 — delta power as predictor of cognitive decline (Grade B)

**MRI:**
- ev_mri_001: Frisoni et al. 2010 — Hippocampal atrophy as AD biomarker (Grade A)

**Biomarkers:**
- ev_biomarker_001: Jack et al. 2018 — NfL as biomarker for neurodegeneration (Grade B)

---

## 3. Missing Evidence Fields (Schema v1 → v2)

| Field | v1 | v2 (this PR) | Populated From |
|-------|-----|-------------|----------------|
| title | ❌ | ✅ | First 80 chars of citation |
| study_type | ❌ | ✅ | Parsed from citation text |
| year | ❌ | ✅ | Regex from citation |
| doi | ❌ | ✅ | Regex from URL |
| pmid | ❌ | ✅ | Regex from PubMed URL |
| condition | ❌ | ✅ | clinical_tags |
| modality | ❌ | ✅ | modality_scope |
| relevance_score | ❌ | ✅ | confidence × grade_weight |
| caveat | ❌ | ✅ | Grade-based defaults |

---

## 4. Recommended Minimal Patch

1. **Expand EvidenceLink contract** with enrichment fields (done)
2. **Add _enrich_from_citation()** parser (done)
3. **Add get_evidence_for_analyzer()** query method (done)
4. **Add /api/v1/analyzers/{type}/evidence endpoint** (done)
5. **Create EvidenceLinksCard.jsx** component (done)
6. **Add frontend tests** (done)
7. **Future: Seed additional evidence** for qEEG, MRI, biomarkers

---

## 5. Degraded State Behavior

| Scenario | Behavior |
|----------|----------|
| No evidence for analyzer | Empty list + "Evidence Unavailable" card |
| Evidence DB unavailable | Graceful return (try/except) |
| Grade C/D | Research-only badge + caveat |
| Conflicting evidence | Conflicting badge |
| Missing URL/PMID/DOI | Link omitted (no broken links) |

---

## 6. Safety

All evidence panels include:
> "Evidence links support clinician review and do not establish diagnosis or treatment recommendations."

No fabricated citations. All DOI/PMID parsed from real URLs.
