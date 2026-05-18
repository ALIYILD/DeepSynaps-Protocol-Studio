# Beta Feedback Workflow — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Audience:** Clinicians, clinic admins, DeepSynaps product team  
**Goal:** Capture, triage, and act on beta feedback systematically

---

## 1. Feedback Channels

| Channel | For | Response Time |
|---------|-----|--------------|
| In-app "Send Feedback" button | Quick UI/UX notes | 48h |
| Email: beta-feedback@deepsynaps.io | Detailed feedback | 24h |
| Weekly clinic check-in call | Discussion, demos | Weekly |
| Support ticket (safety issue) | Safety concerns | 1h |
| Slack/Teams (if provided) | Real-time questions | Same day |

---

## 2. Feedback Categories

| Category | Description | Examples | Handler |
|----------|-------------|----------|---------|
| **Clinical Workflow** | How clinicians use the system | "Takes too many clicks to start an assessment" | Product |
| **UI/UX** | Visual or interaction issues | "Button is hard to find on mobile" | Design |
| **Data Accuracy** | Incorrect or missing data | "Patient count shows 5 but I have 8" | Engineering |
| **Evidence/Provenance** | Evidence link issues | "Evidence link goes to wrong PubMed article" | Clinical Safety |
| **Report Quality** | Report content issues | "Report omits recent biomarker results" | Product |
| **Patient Portal** | Patient-facing issues | "Patient can't see their check-in history" | Engineering |
| **Performance** | Speed or stability | "Dashboard takes 8 seconds to load" | Engineering |
| **Access/Role** | Permission issues | "Reviewer can't see export button" | Engineering |
| **Safety Concern** | Clinical safety | "Output says 'diagnoses' without disclaimer" | Clinical Safety |
| **Bug** | Defect | "Page crashes when I click Synthesis tab" | Engineering |
| **Feature Request** | Enhancement | "Would be great to compare two patients" | Product |

---

## 3. Feedback Form

### Quick Form (In-App)

```
Send Beta Feedback
------------------
Category: [Dropdown: Clinical Workflow / UI/UX / Data / Evidence /
                     Report / Patient Portal / Performance / Access /
                     Safety / Bug / Feature Request]
Severity: [Dropdown: Critical / High / Medium / Low]
Module:   [Dropdown: Dashboard / Patients / Assessments / qEEG /
                     MRI / Biomarkers / Medication / Protocol /
                     DeepTwin / Reports / Evidence / Portal / Admin]
Description: [Text area]

⚠ Do not include patient-identifiable information in this form.
   Use approved secure support channels for PHI.

[Submit Feedback]
```

### Detailed Form (Email)

See `PILOT_FEEDBACK_SCHEMA.md` for full field specification.

---

## 4. Triage Workflow

```
Feedback Received
       │
       ▼
┌─────────────────┐
│  Auto-triage    │  Categorize by type, severity, module
│  (24h SLA)      │  Assign ticket ID
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌──────────┐
│Safety │ │Non-safety│
│Issue? │ │Feedback  │
└───┬───┘ └─────┬────┘
    │           │
    ▼           ▼
┌────────┐ ┌──────────────┐
│L3 Safety│ │Product/Eng   │
│1h resp. │ │48h review    │
│         │ │              │
│JIRA/    │ │Backlog/      │
│P0-P1    │ │Sprint        │
└────────┘ └──────────────┘
```

---

## 5. Triage Decision Tree

### Is it a safety concern?
**YES** if any of:
- Output implies diagnostic authority
- Missing safety disclaimer
- Evidence fabricated or misrepresented
- PHI exposure suspected
- Demo/live mode confusion affecting patient care
- Consent violation

→ **Route to L3 Clinical Safety** (1h response)

### Is it a bug?
**YES** if:
- Feature not working as documented
- Crash or error
- Data incorrect or missing
- Performance issue affecting workflow

→ **Route to Engineering** (JIRA ticket, 48h acknowledgment)

### Is it UX/UI friction?
**YES** if:
- Confusing navigation
- Visual issue
- Accessibility problem
- Mobile rendering issue

→ **Route to Product/Design** (backlog, 48h acknowledgment)

### Is it a feature request?
**YES** if:
- Enhancement suggestion
- New capability request
- Integration request

→ **Route to Product** (backlog, weekly review)

---

## 6. Feedback Tracking

| Field | Description | Source |
|-------|-------------|--------|
| Ticket ID | Unique identifier | Auto-assigned |
| Category | Feedback type | Form dropdown |
| Severity | Impact level | Reporter + triage |
| Module | Affected module | Form dropdown |
| Clinic | Reporting clinic | Auto from auth |
| Reporter | User ID | Auto from auth |
| Role | Reporter role | Auto from auth |
| Description | Detailed text | Free text |
| Status | Open / In Progress / Resolved / Closed | Workflow |
| Priority | P0 (safety) / P1 / P2 / P3 | Triage |
| Sprint | Assigned sprint | Planning |
| Release | Target release | Planning |
| Notes | Internal notes | Team |

---

## 7. Response Templates

### Acknowledgment (auto)

```
Thank you for your feedback on DeepSynaps Beta.

Ticket: BETA-123
Category: [Category]
Severity: [Severity]
Status: Received

We will review your feedback and respond within [SLA].
For urgent safety concerns, contact safety@deepsynaps.io.

Do not reply to this email with patient-identifiable information.
```

### Safety Follow-up

```
Thank you for reporting a safety concern.

We take clinical safety seriously. Our safety team is reviewing
your report and will respond within 1 hour.

Ticket: BETA-123-SAFETY
Status: Under Review

In the meantime, please do not rely on the affected output
for clinical decisions without independent verification.
```

### Resolution

```
Your feedback has been addressed.

Ticket: BETA-123
Resolution: [Description]
Release: [Version or Sprint]

If you continue to experience issues, please reply to this email.
```

---

## 8. Feedback Loop to Product

```
Weekly Beta Review
       │
       ▼
Feedback Summary → Top 5 Issues → Prioritization
       │                              │
       ▼                              ▼
Sprint Planning → PR Assignment → Implementation
       │                              │
       ▼                              ▼
Release Notes → Notify Clinics → Collect More Feedback
```

See `WEEKLY_BETA_REVIEW_PROCESS.md` and `BETA_PR_PRIORITIZATION_MODEL.md`.
