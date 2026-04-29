# Fusion Workbench — Demo Script

**Audience:** Clinical stakeholders, product reviewers, regulatory observers  
**Duration:** ~10 minutes  
**Environment:** https://deepsynaps-studio.fly.dev  
**Prerequisites:** Clinician login, demo patient with qEEG + MRI data

---

## Setup (before demo starts)

1. Open Chrome / Edge in incognito.
2. Navigate to `https://deepsynaps-studio.fly.dev`.
3. Log in with clinician credentials.
4. Ensure demo patient has:
   - One **completed** qEEG analysis (APPROVED report state)
   - One **SUCCESS** MRI analysis (APPROVED report state, no unresolved radiology review)
   - At least one assessment (PHQ-9, ISI, or C-SSRS)

---

## Act 1 — Patient Context (1 min)

**Narrative:** "We start from the patient profile. Every fusion case is anchored to a real person — but you'll notice no patient names appear in URLs, page titles, or audit logs."

**Steps:**
1. Open **Patient Directory**.
2. Click the demo patient card.
3. Point out:
   - Patient ID is a UUID — no MRN or name in the URL.
   - Browser tab title stays "DeepSynaps Studio".

---

## Act 2 — qEEG Clinical Workbench (2 min)

**Narrative:** "The qEEG workbench gives us spectral power, brain-age estimates, and protocol recommendations. But it's one modality. Let's see what it says."

**Steps:**
1. From the patient profile, click **qEEG Analysis**.
2. Show the **Band Powers** and **Brain Age** cards.
3. Scroll to the **Fusion Summary** card.
4. Point out the link: **"Open Fusion Workbench →"**.
5. *Do not click yet.* Explain: "Before we fuse, we need the MRI perspective."

---

## Act 3 — MRI Clinical Workbench (2 min)

**Narrative:** "MRI adds structural and functional targets. Here's where we confirm the stimulation coordinate — but only after radiology review."

**Steps:**
1. Navigate to **MRI Analysis** for the same patient.
2. Show the **Stimulation Targets** card (MNI coordinates, atlas region).
3. Show the **Safety Cockpit** — green badge means no unresolved red flags.
4. Point out the **Fusion Summary** card with the same workbench link.

---

## Act 4 — Brain Twin (1 min)

**Narrative:** "The Brain Twin is the unified workspace. It pulls qEEG, MRI, assessments, and treatment history in parallel."

**Steps:**
1. Open **Brain Twin** for the patient.
2. Scroll to the **Fusion Workbench** section.
3. Explain: "This is the 13th data stream — fusion cases load alongside everything else."

---

## Act 5 — Create Fusion Case (2 min)

**Narrative:** "Now we create the fusion case. The system runs safety gates first — red flags, radiology review, report state, recency. If anything blocks, we get a 422 with explicit reasons."

**Steps:**
1. Click **"Open Fusion Workbench"** from any of the three pages.
2. The workbench loads with:
   - **Case Selector** (empty if first case)
   - **Modality Status Bar** (qEEG ✅, MRI ✅, Assessments ✅)
3. Click **"Generate Fusion Case"**.
4. The case is created in `FUSION_DRAFT_AI` state.

**Show on screen:**
- Safety Cockpit — green "safe" badge.
- Agreement Dashboard — AGREE / PARTIAL / CONFLICT pills.
- Protocol Fusion Panel — qEEG card, MRI card, merged result card.

---

## Act 6 — Agreement & Protocol (1 min)

**Narrative:** "The agreement engine compares four topics: condition, brain age, protocol target, and safety. If there's a conflict — say qEEG says DLPFC and MRI says F3 — we flag it as CONFLICT and require clinician resolution."

**Steps:**
1. Click the **Agreement** tab or expand the Agreement Dashboard.
2. Show the table:
   - Topic | qEEG Position | MRI Position | Status | Severity
3. Click the **Protocol Fusion** tab.
4. Show:
   - qEEG protocol parameters (frequency, intensity)
   - MRI target coordinates (x, y, z)
   - Fusion recommendation

---

## Act 7 — Clinician Review & Sign-off (2 min)

**Narrative:** "The AI generates the draft, but a clinician must review, approve, and sign before the report reaches the patient or can be exported."

**Steps:**
1. In the **Review Actions** panel, click **"Send for Clinical Review"**.
   - State transitions: `FUSION_DRAFT_AI` → `FUSION_NEEDS_CLINICAL_REVIEW`
2. Click **"Approve"**.
   - State transitions: `FUSION_NEEDS_CLINICAL_REVIEW` → `FUSION_APPROVED`
3. Click **"Sign Off"**.
   - State transitions: `FUSION_APPROVED` → `FUSION_SIGNED`
4. Show the **Audit Trail** — each transition is logged with actor, timestamp, and note.

---

## Act 8 — Patient-Facing Report (1 min)

**Narrative:** "Only after sign-off do we generate the patient-facing report. It strips BLOCKED claims, softens INFERRED language, and pseudonymizes the patient ID."

**Steps:**
1. Click **"Preview Patient Report"**.
2. Show:
   - Patient ID is a SHA256 hash prefix — not the raw UUID.
   - Disclaimer at the top: "decision-support only and not a diagnosis."
   - No words like "confirms", "cures", "guaranteed", or "safe to treat".
3. Explain: "If the source summary had blocked language, it's replaced with `[Language softened — requires clinician review.]`."

---

## Act 9 — Export (1 min)

**Narrative:** "Export is gated on the SIGNED state. An unsigned case returns 403. Once signed, we get a JSON package with full provenance."

**Steps:**
1. Click **"Export Fusion Package"**.
2. A JSON download starts (or a data-URI is shown in the API response).
3. Show the export payload includes:
   - `decision_support_only: true`
   - `patient_id_hash` (not raw ID)
   - `signed_by` and `signed_at`
   - Full provenance chain

---

## Safety Demonstration (optional, 2 min)

**Block by red flags:**
1. Create a qEEG analysis with an unresolved CRITICAL red flag.
2. Attempt to create a fusion case.
3. Show the 422 response: "qEEG red flag 'SEIZURE_RISK' is critical and unresolved. Resolve before fusion."

**Block by radiology review:**
1. Create an MRI analysis with `RADIOLOGY_REVIEW_REQUIRED` unresolved.
2. Attempt to create a fusion case.
3. Show the 422 response: "MRI radiology review is required and unresolved."

**Block export by unsigned state:**
1. Create a case but do not sign it.
2. Attempt export.
3. Show 403: "Fusion case must be signed before export."

---

## Talking Points for Stakeholders

| Stakeholder | Key Message |
|-------------|-------------|
| **Clinician** | "You remain in control. AI drafts, you review, approve, and sign. Every step is auditable." |
| **Regulatory / QA** | "All outputs are decision-support only. Evidence grade is capped at heuristic. BLOCKED claims never reach patients." |
| **IT / Security** | "No PHI in URLs, titles, logs, or exports. Patient IDs are SHA256-hashed in patient-facing artifacts." |
| **Executive** | "This is the first persistent, review-governed multimodal fusion layer in the product. It closes the gap between raw analysis and clinical decision." |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Safety gate blocked" | Check qEEG/MRI report state is APPROVED; check no unresolved CRITICAL red flags; check MRI radiology review resolved. |
| "Patient report not available" | Case must be in FUSION_APPROVED or FUSION_SIGNED state. |
| "Export not allowed" | Case must be in FUSION_SIGNED state. |
| Workbench link missing | Ensure `patientId` is passed to the qEEG/MRI/Brain Twin page. |
