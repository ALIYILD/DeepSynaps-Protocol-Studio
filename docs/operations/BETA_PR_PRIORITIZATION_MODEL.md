# Beta PR Prioritization Model — DeepSynaps Protocol Studio

**Date:** 2026-05-17  
**Audience:** Product team, engineering, safety team  
**Goal:** Score and prioritize PRs for beta iteration sprints

---

## 1. Scoring Dimensions

Each PR is scored on 7 dimensions (1-5 scale). Final score is weighted average.

| Dimension | Weight | 1 (Low) | 3 (Medium) | 5 (High) |
|-----------|--------|---------|-----------|----------|
| **Safety Impact** | 30% | No safety relevance | Indirect safety | Direct patient safety risk |
| **Clinical Workflow Impact** | 25% | Cosmetic/nice-to-have | Workflow friction | Blocks critical workflow |
| **Frequency** | 15% | Rare (<1/week) | Occasional (1-5/week) | Daily or constant |
| **Affected Clinics** | 10% | 1 clinic | 2-3 clinics | All clinics |
| **Regulatory/Compliance** | 10% | No compliance risk | Documentation gap | Regulatory requirement |
| **Pilot Success Blocker** | 10% | No impact on pilot | Moderate impact | Blocks go/no-go decision |

---

## 2. Priority Thresholds

| Score Range | Priority | Sprint | SLA |
|-------------|----------|--------|-----|
| 4.5 - 5.0 | P0 — Critical | Current sprint | 24h |
| 3.5 - 4.4 | P1 — High | Next sprint | 1 week |
| 2.5 - 3.4 | P2 — Medium | Within 2 sprints | 2 weeks |
| 1.5 - 2.4 | P3 — Low | Backlog | Next quarter |
| 1.0 - 1.4 | P4 — Trivial | Icebox | As needed |

---

## 3. Score Calculation

```
Final Score =
  (Safety Impact × 0.30) +
  (Clinical Workflow × 0.25) +
  (Frequency × 0.15) +
  (Affected Clinics × 0.10) +
  (Regulatory × 0.10) +
  (Pilot Blocker × 0.10)
```

### Example Scores

| PR | Safety | Workflow | Freq | Clinics | Reg | Pilot | **Score** | Priority |
|----|--------|----------|------|---------|-----|-------|-----------|----------|
| Fix missing safety disclaimer | 5 | 4 | 5 | 5 | 5 | 5 | **4.85** | **P0** |
| Add evidence for biomarkers | 3 | 4 | 3 | 3 | 2 | 3 | **3.25** | **P2** |
| Dashboard mobile layout fix | 1 | 3 | 2 | 2 | 1 | 2 | **1.85** | **P3** |
| Cache refresh on write | 2 | 3 | 4 | 4 | 1 | 3 | **2.90** | **P2** |
| Patient portal dark mode | 1 | 1 | 1 | 1 | 1 | 1 | **1.00** | **P4** |

---

## 4. PR Categories

### Safety PRs (Auto P0 or P1)

Any PR that:
- Fixes missing safety disclaimer
- Addresses AI overclaiming
- Fixes consent check bypass
- Resolves cross-clinic isolation bug
- Fixes PHI exposure risk

→ **Minimum P1, typically P0**

### Clinical Workflow PRs

| Type | Typical Priority | Examples |
|------|-----------------|----------|
| Critical workflow blocker | P0-P1 | DeepTwin won't load, export fails |
| Workflow friction | P1-P2 | Too many clicks, confusing navigation |
| Enhancement | P2-P3 | New filter, better sorting |

### Evidence PRs

| Type | Typical Priority | Examples |
|------|-----------------|----------|
| Evidence fabrication | P0 | Wrong citation, fabricated DOI |
| Missing evidence | P2 | Add evidence for new modality |
| Evidence UX | P2-P3 | Better evidence card layout |

### Performance PRs

| Type | Typical Priority | Examples |
|------|-----------------|----------|
| System unavailability | P0 | Server crash, DB connection failure |
| Major slowdown | P1 | Dashboard >10s for all clinics |
| Minor slowdown | P2-P3 | Single clinic slowdown, cache miss |

---

## 5. Sprint Planning

### Sprint Size

| Parameter | Value |
|-----------|-------|
| Sprint duration | 1 week (beta phase) |
| Engineering capacity | [N] story points |
| Safety buffer | 20% of capacity reserved for P0 |
| Max P0s per sprint | 2 |
| Max P1s per sprint | 3 |

### Sprint Composition

```
Sprint Capacity = [N] points

Allocation:
  P0 (safety/critical):    20-30%  [must fit]
  P1 (high):               30-40%
  P2 (medium):             20-30%
  P3 (low):                0-10%   [if capacity allows]
  Buffer:                  10-20%  [unplanned P0]
```

---

## 6. Backlog Categories

| Backlog | PRs | Review Frequency |
|---------|-----|-----------------|
| **Current Sprint** | Active work | Daily standup |
| **Next Sprint** | P0-P1 queued | Weekly review |
| **Short-term** | P2 | Bi-weekly review |
| **Long-term** | P3-P4 | Monthly review |
| **Icebox** | P4, speculative | Quarterly review |

---

## 7. Decision Rules

### When to escalate to P0
- Any patient safety risk
- Any data integrity issue
- Any compliance violation
- Any feature that blocks go/no-go decision
- More than 2 clinics report the same blocking issue

### When to de-prioritize
- Issue has viable workaround
- Affected clinic is in demo mode
- Frequency is decreasing
- Similar PR already in backlog

### When to fast-track
- Safety team flags as urgent
- Clinic threatens to withdraw from pilot
- Regulatory deadline approaching
- Competitive requirement

---

## 8. PR Review Checklist

Before scoring:

- [ ] Issue clearly described
- [ ] Reproduction steps documented (for bugs)
- [ ] Affected clinics identified
- [ ] Safety impact assessed
- [ ] Workaround documented (if exists)
- [ ] Effort estimated (S/M/L)
- [ ] Tests identified (what needs testing)
- [ ] Rollback plan considered

---

## 9. Example Sprint

### Sprint: Week 3 of Beta

| Priority | PR | Description | Effort | Score | Status |
|----------|-----|-------------|--------|-------|--------|
| P0 | PR-NNN | Fix missing disclaimer on DeepTwin | S | 4.85 | In progress |
| P1 | PR-NNN | Add biomarker evidence entries | M | 3.45 | Queued |
| P1 | PR-NNN | Cache invalidation on event write | S | 3.20 | Queued |
| P2 | PR-NNN | Evidence card show-more animation | S | 2.10 | Backlog |
| P2 | PR-NNN | Dashboard filter by date range | M | 2.80 | Queued |
| P3 | PR-NNN | Patient portal dark mode | L | 1.20 | Icebox |

**Capacity:** 8 points  
**Allocated:** 7.5 points  
**Buffer:** 0.5 points (for unplanned P0)
