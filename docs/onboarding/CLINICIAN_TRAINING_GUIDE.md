<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# Clinician Training Guide — DeepSynaps Protocol Studio

**Version:** 4.0.0-BETA  
**Audience:** Users with `clinician`, `reviewer`, or `admin` role  
**Duration:** 60 minutes (guided) + self-paced reference

---

## Module 1: Dashboard (10 min)

### What You See
- **Active patients:** Total patients in your clinic
- **Modality breakdown:** Event counts per modality (qEEG, MRI, biomarker, etc.)
- **Quality flags:** Data quality summary (high / low / missing)
- **Recent activity:** Events in the last 30 days
- **Evidence coverage:** Percentage of modalities with evidence entries
- **High-risk patients:** Patients with risk_signal events

### How to Use
1. Dashboard loads automatically on login
2. Filter by date range (if available)
3. Click a patient to open their Patient Hub
4. Review quality flags to identify data gaps

### Safety Note
> "Decision support only. Requires clinician review."
> Dashboard shows aggregate counts, not diagnoses.

---

## Module 2: Patient Hub (10 min)

### What You See
- Patient list with search
- Patient profile with context
- Quick links to patient-specific tools

### How to Use
1. Navigate to Patients in the sidebar
2. Search by patient ID or name
3. Click patient to open Patient Hub
4. See: demographics (minimal), latest assessment, active medications
5. Access: Assessments, Analyzers, DeepTwin, Reports

### Patient Context
- All patient data is scoped to your clinic
- You cannot see patients from other clinics
- Patient access is logged in the audit trail

---

## Module 3: Assessments (10 min)

### What You See
- Assessment queue (pending assessments)
- Assessment library (templates)
- Completed assessments with scores

### How to Use
1. Open Assessments from Patient Hub or sidebar
2. Select patient
3. Choose assessment type
4. Complete assessment form
5. Review scoring and flags

### Evidence Links
- Assessment results may link to supporting evidence
- Evidence shows: grade (A-D), study type, year, source
- Research-only evidence is labeled with a badge

### Safety Note
> Assessment scores are decision-support only. Clinical judgment is required.

---

## Module 4: qEEG Analyzer (10 min)

### What You See
- qEEG workbench with band power analysis
- Connectivity markers
- Protocol-fit findings
- Evidence links for key findings

### How to Use
1. Navigate to qEEG Analyzer
2. Select patient
3. Upload or view existing qEEG data
4. Review band power deviations from normative data
5. Check evidence links for each finding
6. Add clinician notes

### Evidence Panel
- Shows 3-5 evidence links per finding
- Grade A = strong evidence, Grade D = preliminary
- Research-only badge = not yet clinical-grade
- Click "Open in Evidence Research" for full citation

### Safety Note
> qEEG findings support clinical review. They do not diagnose neurological conditions.

---

## Module 5: MRI Analyzer (10 min)

### What You See
- MRI viewer/workbench
- Atlas/region markers
- Neuromarkers
- Red flags
- Brain-age / atrophy indicators (if present)

### How to Use
1. Navigate to MRI Analyzer
2. Select patient
3. Upload DICOM or view existing analysis
4. Review region markers and neuromarkers
5. Check evidence links
6. Note any red flags

### Safety Note
> MRI markers support radiological review. They supplement, not replace, radiologist interpretation.

---

## Module 6: Biomarkers (5 min)

### What You See
- Blood/lab markers
- Neuroinflammation markers
- Hormones/endocrine markers
- Metabolic/nutritional markers
- Wearable biomarker summaries

### How to Use
1. Navigate to Biomarkers
2. Select patient
3. Review lab results and biomarker panels
4. Check evidence links for abnormal values
5. Identify missing data gaps

---

## Module 7: Medication Analyzer (5 min)

### What You See
- Medication list
- Interaction flags
- Pharmacogenomics indicators (if available)
- Decision-support recommendations

### How to Use
1. Navigate to Medication Analyzer
2. Select patient
3. Review current medications
4. Check interaction flags
5. Review evidence links

### Safety Note
> Medication analysis supports pharmacist/clinician review. It does not replace prescribing authority.

---

## Module 8: Protocol Studio (10 min)

### What You See
- Handbooks (clinical guidelines)
- Protocol generator
- Export tools

### How to Use
1. Navigate to Protocol Studio
2. Browse handbooks for clinical context
3. Generate protocol draft from patient data
4. Review and edit generated protocol
5. Export as PDF or hand off to clinical team

---

## Module 9: DeepTwin — Patient Intelligence (15 min)

### What You See
- **Overview:** Patient snapshot with key signals
- **Modalities:** Per-modality status and counts
- **Correlations:** Cross-modality correlations
- **Confounders:** Identified confounding factors
- **Hypotheses:** Evidence-linked hypotheses
- **Evidence:** Supporting citations
- **Clinician Review:** Review, accept, reject, or note
- **Export / Handoff:** Export synthesis
- **Forecast:** Trend projections (if available)

### How to Use
1. Open DeepTwin from Patient Hub
2. Review the Overview tab for patient snapshot
3. Check Correlations for cross-modal patterns
4. Review Confounders for factors that may explain patterns
5. Examine Hypotheses and their evidence links
6. Navigate to Clinician Review
7. Accept, reject, or add notes to each hypothesis
8. Export or hand off the reviewed synthesis

### Review Workflow
```
Hypothesis presented → Clinician reviews → Action:
  ✓ Accept  — hypothesis is clinically relevant
  ✗ Reject  — hypothesis is not supported
  📝 Note    — add clinical context or caveat
```

### Safety Note
> "DeepTwin does not diagnose. It synthesizes cross-modal signals for your review."

---

## Module 10: Reports (5 min)

### What You See
- Report list (draft, pending review, signed)
- Report viewer
- Signing interface
- Export tools

### How to Use
1. Navigate to Reports
2. Select report to review
3. Review content and evidence
4. Sign (if `reviewer` or `clinician` role) or request review
5. Export signed report

---

## Module 11: Evidence Research (5 min)

### What You See
- Evidence database search
- Citation details
- Evidence grades and study types
- Deep links from analyzer findings

### How to Use
1. Navigate to Evidence Research
2. Search by condition, modality, or keyword
3. Review evidence grade and study type
4. Access PubMed/DOI links
5. Check for conflicting evidence

---

## Module 12: Audit and Consent Basics (5 min)

### What You See
- Audit log (read-only)
- Consent status per patient
- Access history

### How to Use
1. Navigate to Audit (requires `admin` role; `clinic_admin` is not a valid role — use `admin`)
2. Search by patient, clinician, or date
3. Review all system actions
4. Check consent status per patient

### What Is Logged
- Every event insert
- Every audit entry
- Every consent change
- Every report sign/reject
- Every data access
- Every export

---

## Quick Reference

| Shortcut | Action |
|----------|--------|
| `?` | Show keyboard shortcuts |
| `Ctrl+K` | Search patients |
| `Ctrl+D` | Open Dashboard |
| `Ctrl+P` | Open Patient Hub |
| `Ctrl+R` | Open Reports |
| `Esc` | Close modal / go back |

---

## Safety Checklist

Before using any DeepSynaps output clinically:

- [ ] Reviewed the safety disclaimer
- [ ] Checked evidence grade (A=strong, D=preliminary)
- [ ] Noted research-only badges
- [ ] Verified patient identity
- [ ] Confirmed consent is active
- [ ] Added clinical context if needed
- [ ] Documented decision rationale
