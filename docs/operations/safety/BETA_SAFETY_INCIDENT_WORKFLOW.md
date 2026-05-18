# Beta Safety Incident Workflow — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Audience:** Clinical safety team, engineers, clinic admins  
**Goal:** Rapid, systematic response to clinical safety incidents during beta

---

## 1. Safety Incident Categories

| Category | Description | Example | Severity |
|----------|-------------|---------|----------|
| **Unsafe AI Wording** | Output uses diagnostic language without disclaimer | "Patient has ADHD" instead of "Signals consistent with ADHD" | Critical |
| **Incorrect Patient Context** | Wrong patient data in output | Dashboard shows data from patient A in patient B's view | Critical |
| **Export/Access Issue** | Unauthorized data export or access | Technician can export full patient reports | High |
| **Missing Consent** | AI analysis on non-consented patient | DeepTwin synthesis runs without `ai_analysis_consent` | High |
| **Demo/Live Confusion** | Demo data mixed with live data | Demo banner missing in live clinic, or synthetic data shown as real | Critical |
| **Clinical Overclaiming** | Output exceeds decision-support scope | "Recommends medication X" without clinician review | Critical |
| **Suspected PHI Issue** | Potential PHI exposure | Cache log shows patient name, or export contains unencrypted PHI | Critical |
| **Evidence Misrepresentation** | Evidence cited incorrectly | Grade A evidence linked to weak study, or DOI points to wrong paper | High |
| **Correlation Misread** | Correlation presented as causation | "qEEG delta causes cognitive decline" | High |
| **Confounder Omission** | Important confounder not flagged | Age not noted as confounder in brain-age analysis | Medium |

---

## 2. Severity Levels

### Critical (P0)
- **Response:** 1 hour
- **Communication:** PagerDuty + phone + email
- **Actions:**
  - Acknowledge within 30 minutes
  - Assess immediate patient risk
  - If patient risk exists: advise clinic to disregard affected output
  - Disable affected feature if necessary
  - Fix within 24 hours (target)
  - Post-incident review within 48 hours

### High (P1)
- **Response:** 4 hours
- **Communication:** Email + Slack
- **Actions:**
  - Acknowledge within 1 hour
  - Assess scope (one patient, one clinic, all)
  - Fix within 72 hours (target)
  - Post-incident review within 1 week

### Medium (P2)
- **Response:** 24 hours
- **Communication:** Email
- **Actions:**
  - Acknowledge within 4 hours
  - Schedule fix in next sprint
  - Document in risk register

---

## 3. Response Process

### Step 1: Receive (T+0)

- Report received via any channel (support, email, in-app, check-in)
- Auto-assign ticket ID: `SAFETY-YYYY-[NNN]`
- Acknowledge to reporter within SLA
- Log in incident tracking system

### Step 2: Triage (T+30min)

| Question | Action |
|----------|--------|
| Is a patient at immediate risk? | Advise clinic to disregard output, call clinic |
| Is this a known issue? | Reference existing ticket, expedite fix |
| Is this a new issue? | Begin investigation |
| What is the scope? | One patient / one clinic / all clinics |
| Is a feature disable warranted? | Decision: L3 + L4 |

### Step 3: Investigate (T+1-4h)

- Reproduce the issue
- Review logs (`audit_log`, `deeptwin_reviews`)
- Check affected patients/clinics
- Document evidence (screenshots, API responses)
- Identify root cause

### Step 4: Contain (if Critical)

- Temporarily disable affected feature (if L3 + L4 agree)
- Notify affected clinics
- Update dashboard with incident status
- Preserve all evidence

### Step 5: Fix (P0: T+24h, P1: T+72h)

- Implement fix
- Add/update safety tests
- Code review by L3 + L4
- Deploy to staging
- Verify fix
- Deploy to production

### Step 6: Verify (Post-deploy)

- Confirm fix works
- Confirm no regression
- Monitor for 24 hours
- Update incident status

### Step 7: Post-Incident Review (P0: T+48h, P1: T+1w)

| Question | Document |
|----------|----------|
| What happened? | Timeline |
| Why did it happen? | Root cause |
| How was it detected? | Detection method |
| How was it resolved? | Fix description |
| What could have prevented it? | Preventive measure |
| What should we do differently? | Process improvement |

### Step 8: Close

- Update risk register
- Update documentation
- Communicate resolution to reporter
- Publish to release notes (if applicable)

---

## 4. Escalation Tree

```
Reporter (clinician/admin)
    │
    ▼
L1 Help Desk (support@deepsynaps.io)
    │ Safety flag detected
    ▼
L3 Clinical Safety (safety@deepsynaps.io)
    │ P0 confirmed or uncertain
    ▼
L4 Engineering Lead (lead-engineer@deepsynaps.io)
    │ Feature disable decision
    ▼
DeepSynaps Executive (if regulatory/media risk)
```

---

## 5. Communication Templates

### Initial Report Acknowledgment

```
Subject: [SAFETY-2026-001] Acknowledged — [Brief description]

We have received your safety report and are treating it as [Severity].

Incident: SAFETY-2026-001
Category: [Category]
Severity: [Critical/High/Medium]
Reporter: [Name]
Clinic: [Clinic ID]

Until resolved, please:
- Do not rely on [affected output] for clinical decisions
- Verify any findings independently
- Contact us at safety@deepsynaps.io for updates

We will update you within [1h/4h/24h].
```

### Feature Disable Notice

```
Subject: [SAFETY-2026-001] Feature temporarily disabled

Due to safety incident SAFETY-2026-001, the [feature] has been
temporarily disabled for all clinics.

This is a precautionary measure. No patient data has been lost.

We expect to restore the feature within [timeframe].
We will notify you when it is safe to use again.
```

### Resolution Notice

```
Subject: [SAFETY-2026-001] Resolved — [Description]

Safety incident SAFETY-2026-001 has been resolved.

Root cause: [Description]
Fix: [Description]
Tests added: [Yes/No]
Release: [Version]

The affected feature is now safe to use.
Post-incident review: [Date/link]
```

---

## 6. Prevention Checklist

Before every release:

- [ ] E2E safety tests pass (disclaimer, no AI diagnosis, no causal certainty)
- [ ] Evidence links verified (real DOI/PMID, correct grade)
- [ ] Demo mode banner visible when enabled
- [ ] Clinic isolation tests pass
- [ ] Consent check tested
- [ ] Role-based access tested
- [ ] No PHI in logs (spot check)
- [ ] Risk register reviewed
- [ ] Safety team sign-off obtained

---

## 7. Incident Log Template

| Field | Value |
|-------|-------|
| Incident ID | SAFETY-YYYY-NNN |
| Date | YYYY-MM-DD HH:MM UTC |
| Category | [Category] |
| Severity | [Critical/High/Medium] |
| Reporter | [Name, Role, Clinic] |
| Affected Patients | [Count or IDs] |
| Affected Clinics | [Count or IDs] |
| Root Cause | [Description] |
| Fix | [Description + PR link] |
| Tests Added | [Yes/No + description] |
| Time to Detect | [HH:MM] |
| Time to Acknowledge | [HH:MM] |
| Time to Resolve | [HH:MM] |
| Feature Disabled | [Yes/No, duration] |
| Post-Incident Review | [Date, attendees, link] |
| Status | [Open/Resolved/Closed] |
