# DeepSynaps Clinical Demo Script

**Full journey:** Patient → qEEG → Raw EEG Cleaning → MRI → Brain Twin → Fusion → Candidate Protocol → Clinician Sign-off → Patient Report  
**Duration:** ~20 minutes  
**Environment:** https://deepsynaps-studio.fly.dev  
**Audience:** Clinical partners, investors, regulatory observers  
**Prerequisites:** Clinician account; demo patient seeded with qEEG + MRI

---

## Scene Setting (30 sec)

> "DeepSynaps Protocol Studio is a Clinical OS for neuromodulation clinics. Today I'll walk you through a complete patient journey — from intake to signed multimodal fusion report. Every step is governed, auditable, and decision-support only."

---

## Act 1 — Patient Intake (1 min)

**Screen:** Patient Directory → New Patient

**Steps:**
1. Click **"New Patient"**.
2. Fill in:
   - First name, last name, DOB, sex
   - Primary condition (e.g., ADHD)
   - Consent checkbox
3. Save.
4. Point out:
   - The patient list shows no full names in the URL.
   - The ID is a UUID generated server-side.

**Narrative:** "Patient data is encrypted at rest. The UUID is the only identifier that travels through the system."

---

## Act 2 — qEEG Upload & Cleaning (3 min)

**Screen:** qEEG Analysis → Upload

**Steps:**
1. From the patient profile, click **qEEG Analysis**.
2. Drag-and-drop a demo EDF file (or select from demo library).
3. The upload starts; show the progress bar.
4. Once uploaded, the system runs:
   - Artifact rejection
   - Bad-channel detection
   - Spectral band-power extraction
5. Show the **Raw EEG Cleaning Workbench**:
   - Before/after traces
   - AI-suggested cleaning actions (all marked "suggested" — require clinician confirmation)
6. Click **"Accept Suggestions"** or manually adjust.
7. Click **"Run Analysis"**.

**Narrative:** "The AI suggests cleaning steps, but nothing is applied without clinician confirmation. Every action is logged for traceability."

---

## Act 3 — qEEG Clinical Workbench (2 min)

**Screen:** qEEG Analysis → Results

**Steps:**
1. Show the **Band Powers** card (theta, alpha, beta, gamma).
2. Show the **Brain Age** card — chronological vs. estimated brain age.
3. Show the **Condition Scoring** card — ADHD confidence, depression probability.
4. Show the **Protocol Recommendation** card — target region, frequency, intensity.
5. Scroll to the **Safety Cockpit**:
   - Red flags (if any)
   - Overall status badge
6. Click **"Generate AI Report"**.
7. Show the report draft.
8. Click **"Approve Report"**.
   - State: `DRAFT_AI` → `APPROVED`

**Narrative:** "The qEEG gives us a functional fingerprint. But function without structure is incomplete. Let's add MRI."

---

## Act 4 — MRI Upload & Analysis (3 min)

**Screen:** MRI Analysis → Upload

**Steps:**
1. Navigate to **MRI Analysis** for the same patient.
2. Upload a demo structural MRI (NIfTI or DICOM).
3. The pipeline runs:
   - Registration to MNI space
   - Segmentation
   - Stimulation target planning
4. Show the **Structural Findings** card.
5. Show the **Stimulation Targets** card:
   - MNI coordinates
   - Atlas region (e.g., left dlPFC)
   - Registration confidence score
6. Show the **Radiology Review** panel:
   - If required, explain that a radiologist must clear this before fusion.
   - For demo, mark as reviewed.
7. Click **"Approve Report"**.
   - State: `MRI_DRAFT_AI` → `APPROVED`

**Narrative:** "MRI gives us millimetre-precise targets. But we only fuse when both modalities are approved and radiology-cleared."

---

## Act 5 — Brain Twin (2 min)

**Screen:** Brain Twin

**Steps:**
1. Open **Brain Twin** for the patient.
2. Show the parallel data streams loading:
   - qEEG summary
   - MRI summary
   - Assessment history
   - Treatment courses
   - **Fusion cases**
3. Point out the **Fusion Workbench** link in the unified workspace.

**Narrative:** "The Brain Twin is the clinician's control tower. Every modality, every assessment, every session — plus the new fusion layer."

---

## Act 6 — Multimodal Fusion (3 min)

**Screen:** Fusion Workbench

**Steps:**
1. Click **"Open Fusion Workbench"**.
2. The workbench loads:
   - **Modality Status Bar:** qEEG ✅, MRI ✅, Assessments ✅, Treatment History ✅
   - **Safety Cockpit:** Green — all gates clear.
3. Click **"Generate Fusion Case"**.
4. Show the generated case:
   - **State:** `FUSION_DRAFT_AI`
   - **Agreement Dashboard:**
     - Condition: AGREE (both modalities converge on ADHD)
     - Brain Age / Structural: PARTIAL (qEEG brain-age gap +2.5 years, no MRI atrophy data)
     - Protocol Target: AGREE (both target DLPFC)
     - Safety: AGREE (no red flags)
   - **Protocol Fusion Panel:**
     - qEEG: 10 Hz, 2 mA, 20 min
     - MRI: (-42, 36, 28) MNI, left dlPFC
     - Fusion: "Use MRI-guided coordinates with qEEG-informed parameters."
   - **AI Summary:** Dual-modality fusion narrative.
   - **Explainability:** Top modalities, missing data notes, cautions.

**Narrative:** "The agreement engine doesn't just merge — it disagrees when it should. If qEEG and MRI conflict, we flag CONFLICT and require clinician resolution."

---

## Act 7 — Clinician Review & Sign-off (3 min)

**Screen:** Fusion Workbench → Review Actions

**Steps:**
1. Show the **Review Actions** panel.
2. Click **"Send for Clinical Review"**.
   - State: `FUSION_DRAFT_AI` → `FUSION_NEEDS_CLINICAL_REVIEW`
3. (Optional) Click a finding and add a clinician note.
4. Click **"Approve"**.
   - State: `FUSION_NEEDS_CLINICAL_REVIEW` → `FUSION_APPROVED`
5. Click **"Sign Off"**.
   - State: `FUSION_APPROVED` → `FUSION_SIGNED`
   - Prompt for digital signature / PIN if configured.
6. Show the **Audit Trail**:
   - `create` → `needs_clinical_review` → `approve` → `sign`
   - Each row: actor, timestamp, previous state, new state, note.

**Narrative:** "The AI drafts. The clinician governs. No report reaches the patient without human approval and signature."

---

## Act 8 — Patient-Facing Report (2 min)

**Screen:** Fusion Workbench → Patient Report Preview

**Steps:**
1. Click **"Preview Patient Report"**.
2. Show:
   - **Patient ID Hash:** `sha256:a1b2c3d4...` — not the raw UUID.
   - **Summary:** Sanitized language.
     - No "confirms ADHD" → "is consistent with ADHD"
     - No "cures" → removed
     - No "guaranteed" → removed
   - **Disclaimer:** "This report is decision-support only and not a diagnosis or prescription."
   - **Limitations:** Partial fusion, algorithmic heuristic confidence.
3. Explain: "If the source had blocked language, the patient sees `[Language softened — requires clinician review.]`."

**Narrative:** "What the patient sees is carefully governed. No diagnostic wording, no guarantees, no promises of cure."

---

## Act 9 — Export & Archive (1 min)

**Screen:** Fusion Workbench → Export

**Steps:**
1. Click **"Export Fusion Package"**.
2. A JSON package downloads.
3. Show the payload:
   - `format: "deepsynaps-fusion-v1"`
   - `patient_id_hash` — pseudonymized
   - `signed_by` — clinician ID
   - `signed_at` — ISO timestamp
   - `decision_support_only: true`
   - Full provenance: qEEG analysis ID, MRI analysis ID, assessment count, generator version.
4. (Optional) Click **"Archive"** to move the case to `FUSION_ARCHIVED`.

**Narrative:** "The export is the legal artefact. It's signed, timestamped, and includes every input that fed the fusion."

---

## Closing (30 sec)

> "That is the complete DeepSynaps clinical journey. From a raw EEG and an MRI scan, through AI-assisted analysis, multimodal fusion, clinician governance, to a signed patient report. Every step is transparent, auditable, and decision-support only."

---

## Safety Demo Add-On (optional, 3 min)

**Red-flag blocking:**
1. Inject a demo qEEG with an unresolved `SEIZURE_RISK` (CRITICAL severity).
2. Attempt fusion → 422: "qEEG red flag 'SEIZURE_RISK' is critical and unresolved."

**Radiology-review blocking:**
1. Inject a demo MRI with `RADIOLOGY_REVIEW_REQUIRED` unresolved.
2. Attempt fusion → 422: "MRI radiology review is required and unresolved."

**Unsigned-export blocking:**
1. Create a fusion case but stop at `FUSION_APPROVED`.
2. Attempt export → 403: "Fusion case must be signed before export."

**Claim governance:**
1. Show a case where the AI summary accidentally contained "confirms ADHD".
2. Open the patient-facing preview → the phrase is replaced with "is consistent with ADHD" or removed.

---

## Checklist Before Every Demo

- [ ] Clinician account active and has access to demo clinic
- [ ] Demo patient created with UUID (no real PHI)
- [ ] Demo qEEG analysis in `APPROVED` state, no CRITICAL red flags
- [ ] Demo MRI analysis in `APPROVED` state, radiology review resolved
- [ ] Demo assessment (PHQ-9 or ISI) completed
- [ ] Browser cache cleared (or incognito mode)
- [ ] Internet connection stable (Fly.io latency < 200 ms)
- [ ] Backup plan: local dev server on `localhost:8000` if production is unreachable

---

## Contact

For demo support or technical questions:
- Engineering: `#deepsynaps-engineering` (Slack)
- On-call: Check PagerDuty rotation
