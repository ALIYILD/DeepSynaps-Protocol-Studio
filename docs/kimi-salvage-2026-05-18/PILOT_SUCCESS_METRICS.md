# Pilot Success Metrics — DeepSynaps Beta

**Date:** 2026-05-17  
**Audience:** DeepSynaps operations, clinic administrators  
**Frequency:** Weekly for first 4 weeks, then bi-weekly

---

## 1. Overview

Track these metrics during the beta pilot to measure success, identify issues, and guide improvements.

| Metric Category | Count | Target |
|----------------|-------|--------|
| Adoption | 3 | Defined below |
| Clinical Activity | 5 | Defined below |
| Quality | 3 | Defined below |
| Support | 2 | Defined below |
| Satisfaction | 1 | Survey-based |

---

## 2. Adoption Metrics

### Active Clinicians

| Week | Target | Measurement |
|------|--------|-------------|
| 1 | 2-3 clinicians | Count of unique clinician_ids in audit log |
| 2 | 3-5 clinicians | Same |
| 4 | 5+ clinicians | Same |

**Source:** `audit_log` table — count unique `clinician_id` where `clinic_id = pilot_clinic`

### Patient Records Created

| Week | Target | Measurement |
|------|--------|-------------|
| 1 | 5-10 patients | `patient_access` table count per clinic |
| 2 | 10-20 patients | Same |
| 4 | 20+ patients | Same |

### Patient Portal Usage

| Metric | Target | Measurement |
|--------|--------|-------------|
| Portal logins | 50% of patients | Count of patient portal sessions |
| Check-in completion | 70% of assigned check-ins | Tasks completed vs assigned |
| Message sends | 1+ per patient per week | Messages table count |

---

## 3. Clinical Activity Metrics

### Assessments Completed

| Week | Target | Measurement |
|------|--------|-------------|
| 1 | 5-10 assessments | `multimodal_events` where `modality = 'assessment'` |
| 2 | 15-25 assessments | Same |
| 4 | 40+ assessments | Same |

### Reports Generated

| Week | Target | Measurement |
|------|--------|-------------|
| 1 | 2-3 reports | `multimodal_events` where `modality = 'report'` |
| 2 | 5-8 reports | Same |
| 4 | 15+ reports | Same |

### Protocol Drafts Created

| Week | Target | Measurement |
|------|--------|-------------|
| 1 | 1-2 drafts | `deeptwin_reviews` where `action = 'note'` or synthesis events |
| 2 | 3-5 drafts | Same |
| 4 | 10+ drafts | Same |

### qEEG/MRI Analyses Reviewed

| Week | Target | Measurement |
|------|--------|-------------|
| 1 | 2-3 analyses | `multimodal_events` where modality in ('qeeg', 'mri') |
| 2 | 5-10 analyses | Same |
| 4 | 15+ analyses | Same |

### DeepTwin Syntheses Reviewed

| Week | Target | Measurement |
|------|--------|-------------|
| 1 | 1-2 syntheses | `deeptwin_reviews` table activity |
| 2 | 3-5 syntheses | Same |
| 4 | 8+ syntheses | Same |

---

## 4. Quality Metrics

### Data Quality Score

| Grade | Target | Measurement |
|-------|--------|-------------|
| High-quality events | >80% | `multimodal_events` where `data_quality = 'high'` |
| Low-quality events | <15% | Same table, `data_quality = 'low'` |
| Missing quality | <5% | Same table, `data_quality IS NULL` |

### Evidence Coverage

| Target | Measurement |
|--------|-------------|
| >60% | `/api/v1/summary/clinic-dashboard` → `evidence_coverage.coverage_percent` |

### Safety Issues

| Severity | Target | Definition |
|----------|--------|------------|
| Critical | 0 | Any safety-related incident (AI overclaiming, wrong diagnosis suggestion) |
| Warning | <3 | Minor safety concerns (wording, disclaimer visibility) |

---

## 5. Support Metrics

### Support Tickets

| Category | Target | Measurement |
|----------|--------|-------------|
| Technical issues | <5 per week | Ticket tracking system |
| Clinical questions | <5 per week | Ticket tracking system |
| Access/role issues | <2 per week | Ticket tracking system |

### Response Time

| Level | Target |
|-------|--------|
| Acknowledgment | <4 hours (business) |
| Resolution (L1) | <24 hours |
| Resolution (L2) | <4 business days |
| Clinical safety | <1 hour |

---

## 6. Satisfaction Metrics

### Clinician Satisfaction Survey

**Timing:** End of week 2 and week 4

| Question | Scale | Target |
|----------|-------|--------|
| "DeepSynaps improved my workflow" | 1-5 | >=4 |
| "Dashboard is useful" | 1-5 | >=4 |
| "Evidence links are helpful" | 1-5 | >=4 |
| "DeepTwin synthesis is relevant" | 1-5 | >=3.5 |
| "I trust the output" | 1-5 | >=4 |
| "Safety disclaimers are clear" | 1-5 | >=4 |
| "I would recommend to colleagues" | 1-5 | >=4 |
| "Performance is acceptable" | 1-5 | >=3.5 |
| "Patient portal is useful" | 1-5 | >=3.5 |
| "Support was responsive" | 1-5 | >=4 |

---

## 7. Weekly Report Template

```
WEEK [N] — DeepSynaps Beta Pilot Report
Clinic: [clinic_id]
Period: [start] — [end]

ADOPTION
- Active clinicians: [N] (target: [T])
- Patient records: [N] (target: [T])
- Portal logins: [N]

CLINICAL ACTIVITY
- Assessments completed: [N] (target: [T])
- Reports generated: [N] (target: [T])
- Protocol drafts: [N] (target: [T])
- qEEG/MRI reviewed: [N] (target: [T])
- DeepTwin reviews: [N] (target: [T])

QUALITY
- High-quality events: [N] ([P]%)
- Evidence coverage: [P]%
- Safety issues: [N critical, N warning]

SUPPORT
- Tickets: [N] (target: <[T])
- Avg response time: [H] hours

SATISFACTION
- Survey responses: [N]
- Avg score: [X]/5

ISSUES
1. [Issue description] — [Status] — [Owner]
2. ...

NEXT WEEK
- Focus areas:
- Blockers:
- Support needs:
```

---

## 8. Go/No-Go Criteria

### Continue to Full Deployment (Go)

- [ ] 5+ active clinicians by week 4
- [ ] 20+ patient records
- [ ] 40+ assessments completed
- [ ] 0 critical safety issues
- [ ] Clinician satisfaction >=4/5 average
- [ ] <5 support tickets per week
- [ ] All known limitations documented

### Extend Pilot (Conditional)

- [ ] 3-5 active clinicians
- [ ] 10-20 patient records
- [ ] Satisfaction 3-4/5
- [ ] <8 support tickets per week
- [ ] 1-2 warning-level safety issues resolved

### Pause and Address (No-Go)

- [ ] <3 active clinicians
- [ ] Any critical safety issue
- [ ] Satisfaction <3/5
- [ ] >10 support tickets per week
- [ ] Performance issues affecting workflow
