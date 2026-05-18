# Support and Escalation Workflow — DeepSynaps Beta

**Date:** 2026-05-17  
**Audience:** Support team, clinic admins, clinicians  
**Response Commitments:** Business hours (Mon-Fri, 9:00-17:00 UTC)

---

## 1. Issue Categories

| Category | Examples | Severity | Handler |
|----------|----------|----------|---------|
| **Access/Login** | Can't log in, wrong role, locked account | Medium | L1 — Help Desk |
| **UI/Navigation** | Page won't load, button broken, layout issue | Low | L1 — Help Desk |
| **Performance** | Slow page load, timeout, cache issue | Medium | L2 — Technical |
| **Data** | Missing patient data, wrong counts, sync issue | High | L2 — Technical |
| **Clinical Safety** | Misleading output, missing disclaimer, wrong evidence | **Critical** | L3 — Clinical Safety |
| **Export** | Export fails, wrong format, missing fields | Medium | L2 — Technical |
| **Consent** | Consent not recorded, withdrawal issue | High | L2 — Technical |
| **Integration** | qEEG upload fails, DICOM issue, lab import | High | L2 — Technical |
| **Demo/Live Confusion** | Demo banner in live, synthetic data mixed with real | **Critical** | L3 — Clinical Safety |
| **AI Overclaiming** | Output implies diagnosis, missing "decision support" | **Critical** | L3 — Clinical Safety |

---

## 2. Escalation Levels

### L1 — Help Desk
- **Contact:** support@deepsynaps.io
- **Response time:** 24 hours
- **Handles:**
  - Account access issues
  - UI questions
  - Navigation help
  - Known issue workarounds
- **Cannot handle:**
  - Data integrity issues
  - Clinical safety concerns
  - Performance degradation
- **Escalates to:** L2 if unresolved in 24h or if data/clinical issue identified

### L2 — Technical Engineering
- **Contact:** engineering@deepsynaps.io
- **Response time:** 4 business hours
- **Handles:**
  - Bugs and defects
  - Performance issues
  - Data sync problems
  - Integration failures
  - Export issues
  - Consent system issues
- **Cannot handle:**
  - Clinical interpretation
  - Safety policy decisions
- **Escalates to:** L3 if safety concern identified

### L3 — Clinical Safety
- **Contact:** safety@deepsynaps.io
- **Response time:** 1 hour (urgent)
- **Handles:**
  - Clinical safety concerns
  - Decision-support output review
  - Evidence quality questions
  - AI overclaiming reports
  - Demo/live mode confusion
  - Missing safety disclaimers
- **Cannot handle:**
  - Technical implementation (coordinates with L2)
- **Escalates to:** L4 if critical system issue

### L4 — Engineering Lead
- **Contact:** lead-engineer@deepsynaps.io
- **Response time:** 2 hours
- **Handles:**
  - Critical system outages
  - Data integrity incidents
  - Security concerns
  - Architecture decisions
- **Coordinates with:** L3 for safety-critical fixes

---

## 3. Urgency Definitions

### Critical (1 hour)
- Any clinical safety issue
- Demo banner appearing in live mode
- Wrong patient data displayed
- System unavailability
- Data integrity concern
- AI output implying diagnosis

### High (4 hours)
- Data missing or incorrect
- Export functionality broken
- Consent system failure
- Integration failure (qEEG/MRI upload)
- Performance severely degraded

### Medium (24 hours)
- UI bug affecting workflow
- Access/role issue
- Cache not refreshing
- Evidence link broken
- Non-critical performance

### Low (48-72 hours)
- Cosmetic UI issue
- Documentation question
- Feature request
- Enhancement suggestion

---

## 4. Escalation Paths

```
Issue Reported
     │
     ▼
┌─────────────┐
│   L1 Help   │  Access, UI, known issues
│   Desk      │  → 24h response
└──────┬──────┘
       │ Unresolved or data/clinical issue
       ▼
┌─────────────┐
│   L2 Tech   │  Bugs, performance, data
│ Engineering │  → 4h response
└──────┬──────┘
       │ Safety concern identified
       ▼
┌─────────────┐
│   L3 Clin.  │  Safety, evidence, output
│   Safety    │  → 1h response
└──────┬──────┘
       │ Critical system issue
       ▼
┌─────────────┐
│   L4 Eng.   │  Outages, data integrity
│    Lead     │  → 2h response
└─────────────┘
```

---

## 5. Communication Protocol

### For Clinicians

1. **Report via:** Email to support@deepsynaps.io or in-app message
2. **Include:** Clinic ID, patient ID (if applicable), screenshot, steps to reproduce
3. **Urgent safety:** Email safety@deepsynaps.io with "URGENT" in subject
4. **Follow-up:** Reference your ticket number

### For Clinic Admins

1. **Can escalate directly to L2** for technical issues
2. **Must escalate to L3** for any safety concern
3. **Weekly check-in:** Report metrics from `PILOT_SUCCESS_METRICS.md`

### For Support Team

1. **Acknowledge within SLA** (set by severity)
2. **Triage within 30 minutes**
3. **Update ticket** at least every 24 hours
4. **Close with summary** including root cause and fix

---

## 6. Incident Response

### Clinical Safety Incident

1. **Receive report** (any channel)
2. **Acknowledge within 1 hour**
3. **Assess severity** with reporter
4. **If confirmed critical:**
   - Notify L4 Engineering Lead
   - Create incident document
   - Temporarily disable affected feature if needed
   - Deploy fix within 24 hours (target)
5. **Post-incident review** within 48 hours
6. **Update documentation**

### Data Integrity Incident

1. **Receive report**
2. **Acknowledge within 4 hours**
3. **Assess scope** (one patient, one clinic, multiple)
4. **Preserve evidence** (logs, snapshots)
5. **Fix data** (if possible) or document gap
6. **Notify affected clinic(s)**
7. **Post-incident review**

---

## 7. Contact Sheet

| Role | Name | Email | Phone | Hours |
|------|------|-------|-------|-------|
| L1 Help Desk | — | support@deepsynaps.io | — | 24h email |
| L2 Technical | — | engineering@deepsynaps.io | — | Business hours |
| L3 Clinical Safety | — | safety@deepsynaps.io | — | Urgent: 24h |
| L4 Engineering Lead | — | lead-engineer@deepsynaps.io | — | Business hours |

**Emergency (system down):** Call +1-XXX-XXX-XXXX (24/7)
**Emergency (clinical):** Call clinic emergency line — NOT DeepSynaps
