# DeepSynaps Regulatory Strategy Master

Complete Regulatory and Compliance Intelligence for Clinical Neuromodulation AI

7 research agents | 8 jurisdictions | 31 precedents | $2.5B graveyard analyzed | 1 unified strategy

Generated: 2026-05-19

## Executive Summary

The single most important finding is that DeepSynaps likely fails FDA CDS non-device Criterion 1 because it processes physiological signals such as EEG and fMRI. That makes DeepSynaps likely a regulated Class II medical device requiring 510(k) clearance. The pathway appears achievable: a strong predicate exists, the cost envelope is roughly $775K, and the timeline is roughly 18 months if evidence generation starts now.

At the same time, a narrower product architecture that only queries external databases and synthesizes evidence, without processing patient physiological signals, may still qualify as non-device CDS. That supports a dual-path strategy:

- Path A: launch a non-device CDS core for faster revenue.
- Path B: build the signal-processing and AI device layer toward Class II 510(k) clearance.

## Research Inventory

| # | Report | Lines | Key Finding |
| --- | --- | ---: | --- |
| R01 | FDA CDS + SaMD Pathways | 940 | Fails Criterion 1, so Class II 510(k) likely required; Q-Sub is free |
| R02 | IEC 62304 + ISO 14971 | 1,438 | Class B software; 25 hazards identified; hybrid Agile-V model |
| R03 | HIPAA + GDPR | 1,193 | Business Associate required; 2026 encryption now mandatory |
| R04 | EU MDR + International | 941 | Class IIb EU MDR; high-risk EU AI Act; dual CE marking |
| R05 | FDA Precedents | 545 | Aidoc K180647 / QAS is primary predicate; 31 TMS devices cataloged |
| R06 | Regulatory Failures | 727 | $2.5B graveyard; payer before clearance is the key lesson |
| R07 | Clinical Evidence | 1,109 | RWD studies accepted; $775K / 18 months for 510(k) |
| Master | This document | 571 | Unified 8-jurisdiction strategy |

Total regulatory intelligence: 7,393 lines.

## Regulatory Verdict At A Glance

| Jurisdiction | Classification | Pathway | Timeline | Cost | Priority |
| --- | --- | --- | --- | --- | --- |
| USA (FDA) | Class II SaMD | 510(k) via Aidoc predicate | 18 months | $775K | P0, start now |
| EU (MDR) | Class IIb | Notified Body | 24-36 months | $300-800K | P2 |
| UK (MHRA) | Class IIa / IIb | UKCA / AI Airlock | 12-24 months | $100-300K | P1 |
| Australia | Class II | TGA ARTG expedited | 3-6 months | $30-80K | P2 |
| Canada | Class II | Health Canada MDL | 6-18 months | $50-150K | P3 |
| Singapore | Class B | HSA immediate | 1-6 months | $15-50K | P4 |
| Japan | Class II | PMDA Shonin | 18-36 months | $200-500K | P3 |
| Brazil | Class II | ANVISA Registro | 3-18 months | $50-150K | P4 |

## The Dual-Path Recommendation

### Path A: Non-Device CDS Core

- Classification: not a device, if Criterion 1 is truly avoided
- Timeline: 15 months
- Cost: about $525K
- Start: immediately

Scope:

- Query external databases
- Evidence synthesis with citations
- Human-in-the-loop recommendations
- No patient physiological signal processing

### Path B: 510(k) AI Device

- Classification: Class II
- Timeline: 18 months
- Cost: about $775K
- Start: month 3

Scope:

- qEEG analysis
- MRI segmentation and target optimization
- Outcome prediction from patient data
- 510(k) clearance required

Recommendation: build both in parallel so Path A can generate revenue while Path B advances through FDA.

## FDA CDS Non-Device Analysis

FDA CDS guidance requires all four criteria to be met for non-device status.

| Criterion | Requirement | DeepSynaps Analysis | Verdict |
| --- | --- | --- | --- |
| 1 | Must not acquire, process, or analyze medical images or signals from a signal acquisition system | DeepSynaps processes EEG, fMRI, and related physiological data | Likely fails |
| 2 | Displays, analyzes, or prints patient-specific information | DeepSynaps does this | Passes |
| 3 | Supports recommendations to HCPs about prevention, diagnosis, or treatment | DeepSynaps does this | Passes |
| 4 | HCP can independently review the basis for recommendations | DeepSynaps shows citations, confidence, evidence provenance | Passes |

Conclusion: Criterion 1 is the gating issue. If signal processing remains in scope, DeepSynaps is likely regulated as a Class II medical device.

## SaMD And Software Safety Classification

| Framework | Classification | Rationale |
| --- | --- | --- |
| IMDRF SaMD | Category III | Drives clinical management for serious conditions |
| FDA | Class II | Moderate risk, special controls sufficient |
| IEC 62304 | Class B overall | Non-serious injury possible |

Suggested breakdown:

- Class A: outcomes tracking and administrative layers
- Class B: protocol selector, drug safety, qEEG, and clinically meaningful recommendation layers

## Predicate Device Strategy

### Recommended Predicate Chain

| Role | Predicate | K-Number | Rationale |
| --- | --- | --- | --- |
| Primary | Aidoc BriefCase-Triage | K180647 / QAS | Same AI clinical workflow and triage product-code family |
| Reference | NeuroStar TrakStar | K213543 | Neuromodulation-domain precedent |

Recommended result: Class II traditional 510(k), using Aidoc / QAS as the primary anchor.

### 510(k) Versus De Novo

| Aspect | 510(k) | De Novo |
| --- | --- | --- |
| Timeline | 18 months | 30 months |
| Cost | $775K | $1.8M |
| Evidence | RWD plus prospective study | Full RCT likely required |
| Predicate needed | Yes | No |

Verdict: 510(k) is the preferred path unless predicate strategy collapses.

## Q-Submission Strategy

Q-Sub meetings are free. The paid FDA pathway often confused with this is the 513(g) request.

| Phase | Timeline | Cost | Activities |
| --- | --- | --- | --- |
| Preparation | Months 1-2 | $25K consultant | Device description, intended use, questions |
| FDA feedback | Month 3 | $0 | Written feedback or teleconference |
| Integration | Month 4 | $10K | Update plan based on FDA feedback |

Key Q-Sub questions:

1. Is Aidoc K180647 / QAS an acceptable primary predicate?
2. What clinical evidence is required for substantial equivalence?
3. Is retrospective RWD acceptable?
4. Can a PCCP be included for AI model updates?
5. What human factors validation is needed?
6. What cybersecurity package is required?
7. What intended use wording is acceptable?
8. Can analytical validation substitute for parts of clinical validation?
9. What post-market surveillance burden is expected?
10. Is Breakthrough Device Designation worth pursuing?

## Breakthrough Device Designation

Preliminary assessment:

- Serious condition: yes
- Meaningful improvement potential: yes
- No existing alternative: no
- Significant advantage over alternatives: possibly yes

Verdict: worth exploring, but not core to the main plan.

## PCCP

Predetermined Change Control Plan should be designed into the initial 510(k) package to support model retraining and controlled algorithm evolution without repeated full submissions.

## Software Lifecycle And Risk Management

### IEC 62304 Class B Documentation

| Document | Status |
| --- | --- |
| Software Development Plan | Not started |
| Software Requirements Specification | Partial |
| Architecture Design | Not started |
| Detailed Design | Not started |
| Unit Implementation | In progress |
| Unit Testing | Not started |
| Integration Testing | Not started |
| System Testing | Not started |
| Risk Management File | Not started |
| Traceability Matrix | Not started |

Recommended model: hybrid Agile-V guided by AAMI TIR45, with traceability from risk to requirement to design to test to release.

### Preliminary Hazard Table

| # | Hazard | Cause | Risk | Key Control |
| --- | --- | --- | --- | --- |
| 1 | Wrong TMS protocol recommended | Algorithm error, outdated evidence | Medium | Human review, confidence scores, citations |
| 2 | Missed drug-device interaction | Incomplete source coverage | Medium | Multi-database cross-check, clinician override |
| 3 | Incorrect qEEG interpretation | Artifact misclassification | Low | Expert review, automated quality checks |
| 4 | Patient data breach | Security vulnerability | Medium | AES-256, TLS 1.3, RBAC, audit logs |
| 5 | AI model drift | Population shift | Medium | Monitoring, retraining, PCCP |
| 6 | Algorithmic bias | Training data underrepresentation | Medium | Fairness testing, diverse data |
| 7 | System unavailability | Outage, dependency failure | Low | Circuit breakers, redundancy |
| 8 | Outdated evidence | Refresh failure | Medium | Automated refresh and staleness alerts |
| 9 | LLM hallucination | Unsupported generative output | Medium | RAG, citations, human review |
| 10 | Regulatory non-compliance | Process failure | Medium | Audits, monitoring, legal review |

## Cybersecurity Requirements

| Standard Or Area | Requirement | Status |
| --- | --- | --- |
| IEC 81001-5-1 | Threat modeling | Not started |
| FDA Cybersecurity Guidance | eSTAR cybersecurity package | Not started |
| SBOM | SPDX or CycloneDX | Not started |
| SAST / DAST | Static and dynamic testing | Not started |
| Penetration testing | Annual third-party test | Not started |
| Vulnerability management | CVE monitoring and patching | Not started |
| Encryption | AES-256 at rest, TLS 1.3 in transit | Partial |

## Privacy And Data Protection

### HIPAA

DeepSynaps is likely a Business Associate when handling PHI for covered entities.

| Requirement | Status | Action |
| --- | --- | --- |
| BAAs | Not started | Execute with customers and cloud provider |
| Risk analysis | Not started | Perform HIPAA security risk analysis |
| Encryption | Partial | Enforce AES-256 and TLS 1.3 |
| Access controls | Partial | Implement RBAC |
| Audit logging | Partial | Full PHI access logging |
| Workforce training | Not started | HIPAA training |
| Breach procedures | Not started | 60-day notice workflow |
| Backup and recovery | Partial | HIPAA-aligned backup posture |

2026 highlights noted in the research:

- Encryption becomes mandatory
- MFA required for remote access
- 24-hour reporting for certain incidents
- Annual penetration testing
- Network segmentation expectations

### GDPR

| Requirement | Status | Action |
| --- | --- | --- |
| Article 9 lawful basis | Not started | Establish health-care processing basis |
| DPAs | Not started | Execute with processors |
| DPIA | Not started | Required for high-risk health AI |
| Cross-border transfers | Not started | EU-US transfer mechanism |
| Right to explanation | Not started | Human oversight and explainability |
| DPO | Not started | Appoint for health data at scale |
| EU representative | Not started | Appoint EU representative |

## International Pathways

### EU MDR

- Classification: Class IIb under Rule 11
- Notified Body likely required
- Clinical Evaluation Report required
- PMS, PSUR, PMCF, SSCP, and EUDAMED registration required
- Timeline: 24-36 months
- Cost: about $300K-800K

### EU AI Act

- Classification: high-risk AI
- Enforcement date called out in research: 2027-08-02
- Needs data governance, human oversight, logging, transparency, and dual regulatory coordination

### UK

- UKCA or AI Airlock route
- Timeline: 12-24 months
- Cost: about $100K-300K

### Australia

- Recommended as the best second market after the US
- Timeline: 3-6 months
- Cost: about $30K-80K

## Clinical Evidence Strategy

### Three Evidence Pillars

| Pillar | Question | DeepSynaps Approach |
| --- | --- | --- |
| Valid clinical association | Is the output associated with the condition? | Literature plus expert consensus |
| Analytical validation | Does software process input and output correctly? | Software testing and benchmark validation |
| Clinical validation | Is the output clinically meaningful? | Retrospective plus prospective study plan |

### Evidence Plans

#### Scenario A: Non-Device CDS

| Phase | Study Type | Timeline | Cost |
| --- | --- | --- | --- |
| 1 | Internal validation | 3 months | $50K |
| 2 | Retrospective chart review | 6 months | $100K |
| 3 | Prospective observational | 6 months | $250K |
| 4 | Usability testing | 2 months | $75K |
| 5 | Marketing substantiation | 3 months | $50K |

Total: 15 months, about $525K.

#### Scenario B: 510(k)

| Phase | Study Type | Timeline | Cost |
| --- | --- | --- | --- |
| 1 | Q-Sub | 3 months | $0 |
| 2 | Retrospective RWD | 6 months | $200K |
| 3 | Prospective study | 6 months | $350K |
| 4 | Usability validation | 2 months | $75K |
| 5 | Software documentation | 3 months | $50K |
| 6 | Submission and review | 3-6 months | $22K fee plus about $80K consultant |

Total: 18 months, about $775K.

Recommendation: run Scenario A and B in parallel.

## Lessons From The Regulatory Graveyard

### Top 10 Lessons

| # | Lesson | Example |
| --- | --- | --- |
| 1 | Payer reimbursement before FDA clearance | Pear Therapeutics |
| 2 | De Novo is a death trap for undercapitalized startups | Kintsugi |
| 3 | Build QSR infrastructure before launch | SeniorLife |
| 4 | Never claim medical-grade without clearance | Whoop |
| 5 | Wellness disclaimers do not override diagnostic function | FDA doctrine |
| 6 | Software bugs in clinical devices can be lethal | Abbott Liberta |
| 7 | Clearance does not equal revenue | Better Therapeutics |
| 8 | Unvalidated AI claims destroy trust | Mindstrong |
| 9 | Plan for algorithm evolution | Woebot |
| 10 | Raise 5-year runway capital | Cross-company pattern |

### Highest-Signal Commercial Lesson

FDA clearance without reimbursement is not enough. Payer evidence must be built in parallel with regulatory evidence.

## 30-Day Immediate Action Plan

| Week | Action | Cost | Owner |
| --- | --- | --- | --- |
| 1 | Hire FDA regulatory consultant | $25K | CEO |
| 1 | File FDA Q-Submission | $0 | Consultant |
| 1-2 | Begin HIPAA risk analysis and BAAs | $10K | Compliance |
| 2 | Start IEC 62304 Software Development Plan | $15K | Engineering |
| 2-3 | Begin ISO 14971 risk management file | $15K | Quality |
| 3 | Start cybersecurity STRIDE threat model | $10K | Security |

Total month-1 spend: about $75K.

## Implementation Roadmap

### Phase 1: Foundation, Months 1-3

| Activity | Cost |
| --- | --- |
| Regulatory consultant | $25K |
| Q-Sub filing | $0 |
| IEC 62304 starter package | $15K |
| HIPAA risk analysis and BAAs | $10K |
| ISO 14971 draft risk file | $15K |
| STRIDE threat model | $10K |

### Phase 2: Evidence Generation, Months 3-9

| Activity | Cost |
| --- | --- |
| Q-Sub response integration | $10K |
| Retrospective RWD study | $100K |
| Analytical validation | $75K |
| Formative usability | $25K |
| Prospective observational study | $150K |
| Summative human factors validation | $40K |

### Phase 3: Submission, Months 9-15

| Activity | Cost |
| --- | --- |
| Complete software documentation | $50K |
| Complete clinical evidence package | $100K |
| 510(k) submission prep | $80K |
| FDA fee | $22K |
| Review response work | $50K |

Total to clearance: about $775K.

## Compliance Checklists

### FDA 510(k)

- Device description
- Indications for use
- Predicate comparison
- IEC 62304 software package
- ISO 14971 risk file
- Clinical evidence report
- Analytical validation report
- Usability validation report
- Cybersecurity package
- Labeling and IFU
- 510(k) summary
- eSTAR submission format

### HIPAA

- BAAs
- Security risk analysis
- AES-256 at rest
- TLS 1.3 in transit
- MFA
- RBAC
- Audit logs
- Workforce training
- Breach procedures
- Backup and recovery

### GDPR

- Article 9 lawful basis
- DPAs
- DPIA
- EU-US transfer mechanism
- DPO
- EU representative
- Privacy notice
- Data subject rights procedures
- Retention and deletion policy

## Risk Matrix

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| FDA reclassifies upward | Low | Critical | Confirm with Q-Sub and predicate strategy |
| FDA requires RCT | Medium | High | Keep De Novo / expanded evidence as backup |
| 510(k) denied | Low | Critical | Iterate on FDA concerns and resubmit |
| EU AI Act complexity | High | High | Start planning now, hire EU counsel |
| Cybersecurity event | Medium | Critical | Threat modeling, pen testing, monitoring |
| Payer non-coverage | High | Critical | Build payer evidence from month 1 |
| Capital runway shortfall | Medium | Critical | Plan for 5-year financing horizon |

## Source Inventory

Generated reports noted in the research set:

- `DeepSynaps_Regulatory_Strategy_Master.md`
- `R01_FDA_CDS_SaMD.md`
- `R02_IEC62304_ISO14971.md`
- `R03_HIPAA_GDPR.md`
- `R04_EU_MDR_International.md`
- `R05_FDA_PRECEDENTS.md`
- `R06_REGULATORY_FAILURES.md`
- `R07_CLINICAL_EVIDENCE.md`

Original generated-library path cited in the research:

```text
/mnt/agents/output/regulatory/
```

## Practical Recommendation

If DeepSynaps wants the fastest credible path:

1. Start the FDA Q-Sub process immediately.
2. Split the product architecture into a non-device CDS core and a regulated signal-processing device layer.
3. Begin IEC 62304, ISO 14971, cybersecurity, HIPAA, and payer-evidence work in parallel.
4. Treat reimbursement evidence as co-equal with regulatory evidence.
5. Use the Aidoc predicate strategy unless FDA pushes the product outside the QAS-like framing.

## Caveat

This document preserves research conclusions provided on 2026-05-19. It is not legal advice. Validate all jurisdiction-specific claims, classifications, and fee assumptions with qualified regulatory counsel before acting on them.
