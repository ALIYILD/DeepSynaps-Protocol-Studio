# Weekly Beta Review Process — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Audience:** DeepSynaps product team, engineering, clinical safety, clinic admins  
**Frequency:** Weekly, 60 minutes  
**First 4 weeks: mandatory. After week 4: bi-weekly if stable.**

---

## 1. Meeting Details

| Field | Value |
|-------|-------|
| **Duration** | 60 minutes |
| **Day** | Tuesday |
| **Time** | 14:00-15:00 UTC |
| **Format** | Video call + shared doc |
| **Attendees** | Product lead, Engineering lead, Safety lead, Ops lead, Clinic rep (rotating) |
| **Optional** | Designer, Data analyst |
| **Owner** | Product lead |

---

## 2. Agenda Template

### A. Opening (5 min)
- Attendance check
- Action items from last week
- Any urgent items to raise first

### B. Usage Metrics (10 min)

**Presenter:** Ops lead

| Metric | This Week | Last Week | Target | Status |
|--------|-----------|-----------|--------|--------|
| Active clinicians | [N] | [N] | [T] | [OK/Warning] |
| Active patients | [N] | [N] | [T] | [OK/Warning] |
| Assessments completed | [N] | [N] | [T] | [OK/Warning] |
| Reports generated | [N] | [N] | [T] | [OK/Warning] |
| DeepTwin reviews | [N] | [N] | [T] | [OK/Warning] |
| Patient portal logins | [N] | [N] | [T] | [OK/Warning] |
| Evidence coverage % | [N%] | [N%] | [T%] | [OK/Warning] |

**Source:** `PILOT_SUCCESS_METRICS.md`

---

### C. Safety Incidents (10 min)

**Presenter:** Safety lead

| Incident ID | Category | Severity | Status | Days Open |
|-------------|----------|----------|--------|-----------|
| SAFETY-NNN | [Category] | [P0/P1/P2] | [Open/Resolved] | [N] |

- New incidents this week
- Open incidents status
- Post-incident reviews completed
- Risk register updates

**Source:** `BETA_SAFETY_INCIDENT_WORKFLOW.md`

---

### D. Top Bugs (10 min)

**Presenter:** Engineering lead

| Rank | Bug ID | Description | Severity | Status | Owner |
|------|--------|-------------|----------|--------|-------|
| 1 | BETA-NNN | [Description] | [High/Med] | [Open] | [Name] |

- Top 5 bugs by impact
- Bugs resolved this week
- Bugs introduced this week
- Regression tests status

---

### E. Top UX Friction (10 min)

**Presenter:** Product lead

| Rank | Issue | Module | Frequency | Action |
|------|-------|--------|-----------|--------|
| 1 | [Description] | [Module] | [N reports] | [Planned fix] |

- Top 5 UX friction points
- Feedback by module
- Feature requests summary
- Design review items

**Source:** `BETA_FEEDBACK_WORKFLOW.md`

---

### F. Support Ticket Themes (5 min)

**Presenter:** Ops lead

| Theme | Count | Trend | Action |
|-------|-------|-------|--------|
| [Theme] | [N] | [Up/Down/Stable] | [Action] |

- Ticket volume and trend
- Categories breakdown
- Response time performance
- Escalation count

---

### G. Clinician Feedback (5 min)

**Presenter:** Clinic rep (rotating)

- What's working well
- What's frustrating
- Training gaps
- Workflow integration issues
- Suggestions

---

### H. Patient Feedback (5 min)

**Presenter:** Product lead

- Patient portal feedback summary
- Check-in completion rates
- Message volume
- Any patient-reported issues

---

### I. Next PR Priorities (10 min)

**Presenter:** Product lead

| Priority | PR | Description | Effort | Safety Impact | Decision |
|----------|-----|-------------|--------|--------------|----------|
| P1 | [PR-N] | [Description] | [S/M/L] | [H/M/L] | [Sprint/Backlog] |

**Source:** `BETA_PR_PRIORITIZATION_MODEL.md`

- Review prioritization scores
- Assign to next sprint
- Cut line for this sprint

---

### J. Release Decision (5 min)

**Presenter:** Product + Engineering leads

| Question | Decision |
|----------|----------|
| Ready for patch release? | [Yes / No / Target date] |
| Any feature flags needed? | [Yes / No] |
| Rollback plan current? | [Yes / No] |
| Clinic notification ready? | [Yes / No] |

---

### K. Action Items (5 min)

| # | Action | Owner | Due | Priority |
|---|--------|-------|-----|----------|
| 1 | [Description] | [Name] | [Date] | [P0-P3] |

---

## 3. Shared Document Template

Create one shared doc per week:

```
DeepSynaps Beta Review — Week [N] — [Date]
https://docs.deepsynaps.io/beta-reviews/week-[N]

## Metrics
[Paste from Section B]

## Safety
[Paste from Section C]

## Bugs
[Paste from Section D]

## UX Friction
[Paste from Section E]

## Support
[Paste from Section F]

## Clinician Feedback
[Notes from Section G]

## Patient Feedback
[Notes from Section H]

## Next PRs
[Paste from Section I]

## Release Decision
[Paste from Section J]

## Action Items
[Paste from Section K]
```

---

## 4. Decision Escalation

If the weekly review cannot reach consensus:

| Issue | Escalate To | Timeline |
|-------|-------------|----------|
| Safety concern | L3 Safety + Product lead | 24h |
| Engineering priority | Engineering lead + Product lead | 48h |
| Clinic relationship | Ops lead + Product lead | 48h |
| Budget/resource | Executive | 1 week |

---

## 5. Meeting Outputs

| Output | Owner | Timeline |
|--------|-------|----------|
| Updated metrics | Ops | Same day |
| Updated risk register | Safety | Same day |
| Sprint assignment | Product | Same day |
| Release notes draft | Product | If releasing |
| Clinic notification | Ops | If releasing |
| Action item tracking | Product | Weekly |
