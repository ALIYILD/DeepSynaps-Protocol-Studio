# qEEG Clinical Workbench — Demo Script

## Setup

1. Log in as clinician
2. Navigate to **qEEG Analysis** tab
3. Select a patient (or use demo mode)

## Demo Flow (10 minutes)

### 1. Upload EDF (1 min)
- Click **Upload qEEG**
- Select `.edf` file ( Eyes Closed, 19-channel, 10–20, ≥2 min )
- Observe upload progress + channel validation

### 2. Safety Cockpit (1 min)
- After analysis completes, scroll to **Clinical Safety Cockpit**
- Point out: duration check, sample rate, channel count, artifact burden
- Show status badge: `VALID_FOR_REVIEW` (green), `LIMITED_QUALITY` (amber), `REPEAT_RECOMMENDED` (red)
- Mention: "This gate runs before any AI interpretation is allowed."

### 3. Red Flags (1 min)
- Scroll to **Red Flag Detector**
- If flags exist: click into severity table, explain category + recommendation
- If no flags: "The signal quality passed all clinical safety checks."

### 4. Normative Model Card (30 sec)
- Show database version, age range compatibility, z-score method
- Point out OOD warning if present
- Mention: "Z-scores are descriptive, not diagnostic."

### 5. Generate AI Report (1 min)
- Click **Generate AI Report**
- Show loading state
- After generation, scroll to report
- Point out: executive summary, findings, band analysis, protocol recommendations

### 6. Claim Governance (1 min)
- Explain: every statement is classified (OBSERVED, COMPUTED, INFERRED, PROTOCOL_LINKED, BLOCKED)
- If BLOCKED claims exist: show they are stripped from patient-facing output
- Mention: "The AI never diagnoses. It describes pattern similarity."

### 7. Protocol Fit (1 min)
- Scroll to **Protocol Fit**
- Show candidate protocol, evidence grade, contraindications
- Point out **off-label flag** if present
- Mention: "This is a suggestion, not a prescription. Clinician review is required."

### 8. Clinician Review Workflow (2 min)
- Scroll to **Clinician Review**
- Show state badge: `DRAFT_AI`
- Click **Send to Review** → state becomes `NEEDS_REVIEW`
- Click **Approve** → state becomes `APPROVED`
- Click **Sign Report** → `signed_by` populated, timestamp set
- Show per-finding table with claim types and evidence grades

### 9. Patient-Facing Report (30 sec)
- Scroll to **Patient Report**
- Show simplified language, no technical jargon, no BLOCKED claims
- Point out disclaimer at bottom
- Mention: "Only available after clinician approval."

### 10. BIDS Export (30 sec)
- Click **Export BIDS Package**
- Show download starts (only because report is approved + signed)
- Mention: "De-identified. Includes audit trail."

### 11. Timeline (30 sec)
- Scroll to **Timeline**
- Show chronological events: qEEG baselines, symptom scales, treatments, sleep
- Point out RCI (reliable change index) arrows

### 12. Copilot 2.0 (30 sec)
- Open Copilot widget
- Ask: "What does the safety cockpit say?"
- Show structured response with clinician handoff line
- Ask: "Any red flags?"
- Show response

## Closing Line

> "The qEEG Clinical Intelligence Workbench turns raw EEG into structured, governed, reviewable clinical intelligence. Every output is decision-support only. The clinician is always in control."

## Troubleshooting

| Issue | Resolution |
|-------|-----------|
| Safety cockpit shows REPEAT_RECOMMENDED | Re-record with eyes closed, ≥2 min, minimal artifact |
| Protocol fit shows off-label flag | Review FDA/CE indications with patient consent |
| BIDS export button disabled | Approve and sign the report first |
| Patient report shows "not yet generated" | Generate AI report first, then approve |
