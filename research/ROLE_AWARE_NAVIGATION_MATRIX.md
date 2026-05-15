# Role-Aware Navigation Matrix

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Active |
| Last Updated | 2026-05-14 |
| Author | DeepSynaps Architecture Team |
| Reviewers | Clinical Safety Board, Information Security |
| Target Audience | Frontend Engineers, Backend Engineers, Product Managers, Security Auditors |
| Related Documents | SIDEBAR_INFORMATION_ARCHITECTURE.md, HEALTHCARE_UX_FOUNDATION_PLAN.md |

---

## Table of Contents

1. [Overview](#overview)
2. [Role Definitions](#role-definitions)
3. [Role Group Definitions](#role-group-definitions)
4. [Complete Visibility Matrix](#complete-visibility-matrix)
5. [Section-by-Section Matrices](#section-by-section-matrices)
6. [Special Rules](#special-rules)
7. [Permission Dependencies](#permission-dependencies)
8. [Feature Flag Integration](#feature-flag-integration)
9. [Beta & Preview Access Rules](#beta--preview-access-rules)
10. [Edge Cases](#edge-cases)
11. [Implementation Guide](#implementation-guide)
12. [Audit & Compliance](#audit--compliance)
13. [Appendices](#appendices)

---

## Overview

The Role-Aware Navigation Matrix defines which navigation items are visible to each user role in the DeepSynaps Clinician Operating System. This document serves as the single source of truth for access control across the entire navigation hierarchy.

### Purpose

- Define visibility rules for all 53+ navigation items across 7 sections
- Map 10 distinct user roles to navigation access
- Document special rules for beta features, preview access, and administrative overrides
- Provide implementation guidance for frontend and backend enforcement
- Support security audits and compliance reviews

### Key Principles

1. **Deny by default** - If a role is not explicitly granted access, the item is hidden
2. **Role groups reduce duplication** - Common access patterns are defined as reusable groups
3. **Super admin override** - Super_admin sees ALL items regardless of standard rules
4. **Patient isolation** - Patient role is strictly limited to patient-safe pages only
5. **Beta gating** - Beta features require explicit enrollment beyond standard role access
6. **Coming soon visibility** - Coming soon items are visible but disabled (educational)

---

## Role Definitions

### patient

| Property | Value |
|----------|-------|
| Description | Patient receiving care through the clinic |
| Context | Self-service portal access |
| Typical Usage | View own records, complete assessments, schedule appointments |
| Risk Level | Low |
| Data Access | Own data only |
| Clinical Actions | None (view only) |

**Navigation Requirements:**
- Can only see own patient record
- Can complete assigned assessments
- Can view own documents
- Can access virtual care sessions (invited)
- Can view own dashboard (patient-specific view)
- Cannot see other patients, admin tools, or clinical analysis tools

### receptionist

| Property | Value |
|----------|-------|
| Description | Front desk and administrative staff |
| Context | Clinic operations and patient intake |
| Typical Usage | Scheduling, check-in, billing, phone calls |
| Risk Level | Low-Medium |
| Data Access | Patient demographics and scheduling only |
| Clinical Actions | None |

**Navigation Requirements:**
- Full access to scheduling and calendar
- Patient list for check-in/check-out
- Inbox for communications
- Basic patient demographics view
- No access to clinical assessments, analyzers, or admin tools

### clinician

| Property | Value |
|----------|-------|
| Description | Primary care provider (physician, psychiatrist, psychologist) |
| Context | Direct patient care and treatment |
| Typical Usage | Patient care, assessments, treatment planning, analysis |
| Risk Level | High |
| Data Access | Full patient data for assigned patients |
| Clinical Actions | Full prescribing, treatment, and documentation rights |

**Navigation Requirements:**
- Full access to all clinical tools
- All analyzers for diagnostic support
- All intervention tools
- Intelligence features for decision support
- No access to admin/finance tools
- Full access to patient records

### reviewer

| Property | Value |
|----------|-------|
| Description | Clinical reviewer or supervisor |
| Context | Case review, quality assurance, protocol approval |
| Typical Usage | Review cases, approve protocols, sign off on reports |
| Risk Level | High |
| Data Access | Read access to all patient data |
| Clinical Actions | Review and approve only (no direct treatment) |

**Navigation Requirements:**
- Dashboard for review queue
- Patient records (read access)
- Assessment results review
- Analyzer outputs review
- No access to treatment execution tools
- No access to admin tools

### technician

| Property | Value |
|----------|-------|
| Description | Technical operations staff |
| Context | Equipment operation, data capture, technical procedures |
| Typical Usage | Run MRI, operate TMS, capture EEG, manage devices |
| Risk Level | Medium |
| Data Access | Technical data for procedures |
| Clinical Actions | Execute technical procedures (supervised) |

**Navigation Requirements:**
- Device management
- Analyzer execution (MRI, QEEG)
- Session management for neuromodulation
- No access to patient management or clinical decision tools
- No access to admin tools

### resident

| Property | Value |
|----------|-------|
| Description | Trainee physician or student |
| Context | Supervised clinical training |
| Typical Usage | Patient care under supervision, learning, practice |
| Risk Level | Medium-High |
| Data Access | Patient data for assigned cases (supervised) |
| Clinical Actions | Supervised treatment rights |

**Navigation Requirements:**
- Similar to clinician but with supervised indicators
- All clinical tools (with supervision flags)
- Academy access for training
- No access to admin tools
- No independent prescribing

### clinic_admin

| Property | Value |
|----------|-------|
| Description | Clinic administrator or manager |
| Context | Clinic operations, staff management, financial oversight |
| Typical Usage | Manage staff, review reports, handle billing, governance |
| Risk Level | High |
| Data Access | Aggregated clinic data (no individual patient data unless authorized) |
| Clinical Actions | Administrative only |

**Navigation Requirements:**
- Full admin section access
- Reports and analytics
- Finance and billing
- User and clinic management
- Consent and governance
- Audit trail access
- Beta feature enrollment
- No direct clinical tools (unless also has clinician role)

### researcher

| Property | Value |
|----------|-------|
| Description | Research investigator or data scientist |
| Context | Clinical research, data analysis, publication |
| Typical Usage | Analyze cohort data, export datasets, run studies |
| Risk Level | Medium |
| Data Access | De-identified research datasets, cohort data |
| Clinical Actions | None (research only) |

**Navigation Requirements:**
- Research datasets (primary workspace)
- All analyzers for research use
- Intelligence tools for analysis
- Evidence research
- No access to individual patient management (unless authorized)
- No access to admin tools

### super_admin

| Property | Value |
|----------|-------|
| Description | Platform administrator with full system access |
| Context | Platform management, cross-clinic oversight |
| Typical Usage | Manage all clinics, users, system configuration |
| Risk Level | Critical |
| Data Access | Full system access (audited) |
| Clinical Actions | None (administrative only) |

**Navigation Requirements:**
- ALL navigation items visible
- Admin monitor and system health
- Cross-clinic management
- Beta and preview features
- Internal tools and CRM
- Full audit access

### internal_admin

| Property | Value |
|----------|-------|
| Description | Internal DeepSynaps operations staff |
| Context | Internal operations, CRM, platform support |
| Typical Usage | Customer support, internal tools, platform monitoring |
| Risk Level | Critical |
| Data Access | Internal operations data only |
| Clinical Actions | None |

**Navigation Requirements:**
- ALL navigation items visible (like super_admin)
- Internal CRM tools (additional)
- Platform monitoring
- Customer support tools
- Internal analytics

---

## Role Group Definitions

### ALL_CLINICAL

| Property | Value |
|----------|-------|
| Roles | clinician, resident, reviewer, technician, clinic_admin, super_admin, internal_admin |
| Purpose | Standard clinical access to patient care tools |
| Items | All patient-facing and clinical analysis tools |
| Rationale | Anyone involved in clinical workflow needs access to clinical tools |

**Applied to:**
- Dashboard
- Schedule
- Patients
- Assessments
- Documents
- Virtual Care
- All analyzers
- All interventions (except admin-restricted)
- Intelligence tools

### CLINICIAN_PLUS

| Property | Value |
|----------|-------|
| Roles | clinician, clinic_admin, super_admin, internal_admin |
| Purpose | Clinical tools plus administrative oversight of clinical content |
| Items | Intervention design, protocol creation, handbook editing |
| Rationale | Senior clinical staff and admins can create and modify clinical protocols |

**Applied to:**
- Protocol Designer
- Handbook editing
- Evidence Research publishing
- Research Datasets (admin)

### ADMIN_ONLY

| Property | Value |
|----------|-------|
| Roles | clinic_admin, super_admin, internal_admin |
| Purpose | Governance and operations management |
| Items | All ADMIN section items, monitoring, audit |
| Rationale | Only administrative roles should access operational tools |

**Applied to:**
- Reports
- Finance
- Data Console
- Audit Trail
- Consent & Governance
- Device Management
- User & Clinic Management
- Monitor (admin)

### SUPER_ONLY

| Property | Value |
|----------|-------|
| Roles | super_admin, internal_admin |
| Purpose | Platform-wide access to sensitive system functions |
| Items | Advanced monitoring, cross-clinic management, internal tools |
| Rationale | Only platform-level admins need access to system-wide controls |

**Applied to:**
- Admin Monitor
- Internal CRM tools
- System-wide configuration
- Cross-clinic data views

### RESEARCHER

| Property | Value |
|----------|-------|
| Roles | researcher, clinician, clinic_admin, super_admin, internal_admin |
| Purpose | Research tool access |
| Items | Research datasets, evidence research, academic tools |
| Rationale | Research requires a blend of clinical and academic access |

**Applied to:**
- Research Datasets (Intelligence)
- Research Datasets (Admin)
- Evidence Research
- Research Evidence (Interventions)
- Advanced analyzers

### RECEPTIONIST

| Property | Value |
|----------|-------|
| Roles | receptionist, clinic_admin, super_admin, internal_admin |
| Purpose | Front desk workflows |
| Items | Scheduling, basic patient view, inbox |
| Rationale | Front desk needs scheduling and communication tools |

**Applied to:**
- Schedule
- Inbox
- Patient list (demographics only)
- Basic dashboard

### PATIENT_GROUP

| Property | Value |
|----------|-------|
| Roles | patient |
| Purpose | Self-service patient access |
| Items | Patient-safe pages only |
| Rationale | Patients need restricted, safe access to own information |

**Applied to:**
- Dashboard (patient view)
- Assessments (assigned only)
- Documents (own only)
- Virtual Care (invited sessions)
- Inbox (own messages)
- Schedule (own appointments)

---

## Complete Visibility Matrix

### TODAY Section

| Nav Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | super_admin |
|----------|---------|--------------|-----------|----------|------------|----------|--------------|------------|-------------|
| Dashboard | PATIENT | YES | YES | YES | YES | YES | YES | NO | YES |
| Inbox | PATIENT | YES | YES | YES | NO | YES | YES | NO | YES |
| Clinician Digest | NO | NO | YES | YES | NO | YES | YES | NO | YES |
| Schedule | PATIENT | YES | YES | YES | YES | YES | YES | NO | YES |

### PATIENTS Section

| Nav Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | super_admin |
|----------|---------|--------------|-----------|----------|------------|----------|--------------|------------|-------------|
| Patients | OWN | DEMO | YES | READ | NO | YES | YES | NO | YES |
| Assessments | ASSIGNED | NO | YES | READ | NO | YES | YES | NO | YES |
| Documents | OWN | NO | YES | READ | NO | YES | YES | NO | YES |
| Virtual Care | INVITED | NO | YES | READ | NO | YES | YES | NO | YES |

### INTERVENTIONS Section

| Nav Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | super_admin |
|----------|---------|--------------|-----------|----------|------------|----------|--------------|------------|-------------|
| Neuromodulation Studio | NO | NO | YES | NO | YES | SUPERVISED | YES | NO | YES |
| -- Protocol Designer | NO | NO | YES | NO | NO | NO | YES | NO | YES |
| -- Session Manager | NO | NO | YES | NO | YES | SUPERVISED | YES | NO | YES |
| -- Motor Threshold | NO | NO | YES | NO | YES | SUPERVISED | YES | NO | YES |
| -- Coil Positioning | NO | NO | YES | NO | YES | NO | YES | NO | YES |
| -- Treatment Course | NO | NO | YES | NO | NO | SUPERVISED | YES | NO | YES |
| -- Outcome Tracking | NO | NO | YES | READ | NO | SUPERVISED | YES | NO | YES |
| Medication Studio | NO | NO | YES | READ | NO | SUPERVISED | YES | NO | YES |
| Rehab | NO | NO | YES | READ | YES | SUPERVISED | YES | NO | YES |
| Nutrition | NO | NO | YES | READ | NO | YES | YES | NO | YES |
| Wellness | PATIENT | NO | YES | READ | NO | YES | YES | NO | YES |
| Complementary | NO | NO | YES | READ | NO | YES | YES | NO | YES |
| Handbooks | NO | NO | YES | YES | YES | YES | YES | YES | YES |
| Research Evidence | NO | NO | YES | YES | NO | YES | YES | YES | YES |

### ANALYZERS Section

| Nav Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | super_admin |
|----------|---------|--------------|-----------|----------|------------|----------|--------------|------------|-------------|
| MRI Analyzer | NO | NO | YES | READ | YES | YES | YES | YES | YES |
| QEEG Analyzer | NO | NO | YES | READ | YES | YES | YES | YES | YES |
| Video Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Voice Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Text Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Biomarker Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Genetic Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Medication Analyzer | NO | NO | YES | READ | NO | SUPERVISED | YES | YES | YES |
| Movement Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Sleep Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Cognitive Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Mood Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Intervention Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Fusion Analyzer | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Risk Analyzer | NO | NO | YES | YES | NO | YES | YES | NO | YES |
| Digital Phenotyping | NO | NO | BETA | NO | NO | NO | BETA | BETA | YES |
| Neuroinflammation | NO | NO | PREVIEW | NO | NO | NO | PREVIEW | PREVIEW | YES |

### INTELLIGENCE Section

| Nav Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | super_admin |
|----------|---------|--------------|-----------|----------|------------|----------|--------------|------------|-------------|
| DeepTwin | NO | NO | YES | NO | NO | YES | YES | YES | YES |
| Evidence Research | NO | NO | YES | YES | NO | YES | YES | YES | YES |
| Longitudinal Insights | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| AI Clinical Intelligence | NO | NO | BETA | NO | NO | NO | BETA | NO | YES |
| Multimodal Correlations | NO | NO | YES | READ | NO | YES | YES | YES | YES |
| Forecast | NO | NO | BETA | NO | NO | NO | BETA | YES | YES |
| Research Datasets | NO | NO | NO | NO | NO | NO | YES | YES | YES |

### ECOSYSTEM Section

| Nav Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | super_admin |
|----------|---------|--------------|-----------|----------|------------|----------|--------------|------------|-------------|
| AI Agents | NO | NO | YES | NO | NO | NO | YES | NO | YES |
| Marketplace | NO | YES | YES | YES | YES | YES | YES | YES | YES |
| Academy | YES | YES | YES | YES | YES | YES | YES | YES | YES |
| Monitor | NO | NO | NO | NO | NO | NO | YES | NO | YES |

### ADMIN Section

| Nav Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | super_admin |
|----------|---------|--------------|-----------|----------|------------|----------|--------------|------------|-------------|
| Reports | NO | NO | NO | NO | NO | NO | YES | NO | YES |
| Finance | NO | NO | NO | NO | NO | NO | YES | NO | YES |
| Data Console | NO | NO | NO | NO | NO | NO | YES | NO | YES |
| Audit Trail | NO | NO | NO | NO | NO | NO | YES | NO | YES |
| Consent & Governance | NO | NO | NO | NO | NO | NO | YES | NO | YES |
| Device Management | NO | NO | NO | NO | YES | NO | YES | NO | YES |
| User & Clinic Management | NO | NO | NO | NO | NO | NO | YES | NO | YES |
| Research Datasets (Admin) | NO | NO | NO | NO | NO | NO | YES | YES | YES |
| Monitor (Admin) | NO | NO | NO | NO | NO | NO | NO | NO | YES |

---

## Section-by-Section Matrices

### TODAY Section Detail

#### Dashboard

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | YES | Patient-specific view | Shows own care summary only |
| receptionist | YES | Standard dashboard | Schedule-focused, morning report |
| clinician | YES | Full clinical dashboard | Patient caseload, alerts, tasks |
| reviewer | YES | Review queue dashboard | Cases pending review, quality metrics |
| technician | YES | Technical dashboard | Equipment status, session queue |
| resident | YES | Supervised dashboard | Same as clinician with supervision indicators |
| clinic_admin | YES | Operations dashboard | Clinic metrics, staff overview |
| researcher | NO | - | Researchers use Research Datasets as primary view |
| super_admin | YES | Full dashboard | All clinics, all metrics |
| internal_admin | YES | Internal operations dashboard | Platform-wide metrics |

#### Inbox

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | YES | Patient messaging only | Secure messages with care team |
| receptionist | YES | Full inbox | Patient communications, scheduling |
| clinician | YES | Full inbox | Patient messages, team communications |
| reviewer | YES | Review notifications | Case review alerts, approval requests |
| technician | NO | - | Technicians receive alerts via device management |
| resident | YES | Supervised inbox | Messages with supervisor oversight |
| clinic_admin | YES | Admin inbox | Staff communications, system alerts |
| researcher | NO | - | Researchers do not receive clinical inbox messages |
| super_admin | YES | Priority inbox | Escalated system alerts |
| internal_admin | YES | Internal inbox | Platform support messages |

#### Clinician Digest

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Clinical summary not appropriate for patients |
| receptionist | NO | - | Clinical content, receptionists use Schedule |
| clinician | YES | Full digest | AI-generated overnight summary |
| reviewer | YES | Review-focused digest | Cases completed, pending reviews |
| technician | NO | - | Technical alerts shown in device management |
| resident | YES | Training digest | Includes learning opportunities |
| clinic_admin | YES | Operations digest | Staffing, scheduling summaries |
| researcher | NO | - | Researchers use Evidence Research |
| super_admin | YES | Platform digest | Cross-clinic summary |
| internal_admin | YES | Internal digest | Platform operations summary |

#### Schedule

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | YES | Own appointments only | View and schedule own appointments |
| receptionist | YES | Full schedule | All appointments, resource scheduling |
| clinician | YES | Personal schedule | Own appointments and sessions |
| reviewer | YES | Review schedule | Case review deadlines |
| technician | YES | Equipment schedule | Device bookings, session slots |
| resident | YES | Supervised schedule | Appointments with supervisor |
| clinic_admin | YES | Clinic schedule | All provider schedules |
| researcher | NO | - | Researchers do not manage clinical schedules |
| super_admin | YES | Cross-clinic schedule | All clinic schedules |
| internal_admin | YES | Internal schedule | Team meetings, planning |

### PATIENTS Section Detail

#### Patients

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | YES | Own record only | Strict patient isolation enforced |
| receptionist | YES | Demographics only | Name, DOB, contact, MRN - no clinical data |
| clinician | YES | Full access | Complete patient records for caseload |
| reviewer | YES | Read access | All patient records for review |
| technician | NO | - | Technicians access patients through session context |
| resident | YES | Supervised access | Patient access with supervisor assignment |
| clinic_admin | YES | List view | Patient roster without clinical details |
| researcher | NO | - | Researchers use de-identified datasets |
| super_admin | YES | Full access | All patients across all clinics |
| internal_admin | YES | Support access | Patient records for support requests only |

#### Assessments

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | YES | Assigned assessments only | Can complete, cannot view results |
| receptionist | NO | - | No clinical assessment access |
| clinician | YES | Full access | Assign, administer, review all assessments |
| reviewer | YES | Read results only | Review completed assessments |
| technician | NO | - | May administer technical assessments via device |
| resident | YES | Supervised | Can assign and review with supervisor |
| clinic_admin | YES | Read access | Review clinic assessment volume |
| researcher | NO | - | Research assessments managed via Research Datasets |
| super_admin | YES | Full access | All assessments |
| internal_admin | NO | - | No clinical access |

#### Documents

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | YES | Own documents only | View own clinical notes, lab results |
| receptionist | NO | - | No document access |
| clinician | YES | Full access | Create, edit, view patient documents |
| reviewer | YES | Read access | Review documents for quality |
| technician | NO | - | Technical reports attached to devices |
| resident | YES | Supervised | Document access with supervisor |
| clinic_admin | YES | Read access | Administrative documents only |
| researcher | NO | - | De-identified documents via research datasets |
| super_admin | YES | Full access | All documents |
| internal_admin | NO | - | No clinical document access |

#### Virtual Care

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | YES | Invited sessions only | Join scheduled video consultations |
| receptionist | NO | - | No clinical session access |
| clinician | YES | Full access | Host, schedule, manage video sessions |
| reviewer | YES | Read access | Review session recordings (with consent) |
| technician | NO | - | Technical support for virtual care |
| resident | YES | Supervised | Host sessions with supervisor |
| clinic_admin | YES | Read access | View virtual care utilization |
| researcher | NO | - | Session data de-identified for research |
| super_admin | YES | Full access | All virtual care sessions |
| internal_admin | NO | - | No clinical session access |

### INTERVENTIONS Section Detail

#### Neuromodulation Studio

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patients do not access clinical protocols |
| receptionist | NO | - | No clinical intervention access |
| clinician | YES | Full access | Design, execute, monitor all protocols |
| reviewer | NO | - | Reviewers see outcomes via Outcome Tracking |
| technician | YES | Execute only | Run sessions, cannot design protocols |
| resident | YES | Supervised | Supervised protocol access |
| clinic_admin | YES | Read access | Monitor clinic protocol utilization |
| researcher | NO | - | Protocol data via research datasets |
| super_admin | YES | Full access | All protocols |
| internal_admin | NO | - | No clinical intervention access |

#### Protocol Designer (Neuromodulation Child)

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Not applicable |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Design custom protocols |
| reviewer | NO | - | Reviewers cannot design protocols |
| technician | NO | - | Technicians execute pre-designed protocols |
| resident | NO | - | Residents use pre-approved protocols |
| clinic_admin | YES | Read only | Monitor protocol designs |
| researcher | NO | - | Research protocols via separate system |
| super_admin | YES | Full access | All protocol designs |
| internal_admin | NO | - | Not applicable |

#### Session Manager (Neuromodulation Child)

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patients are subjects, not operators |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Start, monitor, complete sessions |
| reviewer | NO | - | Reviewers see outcome reports |
| technician | YES | Execute | Operate equipment, manage session flow |
| resident | YES | Supervised | Sessions with attending oversight |
| clinic_admin | YES | Read only | Session logs and utilization |
| researcher | NO | - | Session data via research export |
| super_admin | YES | Full access | All sessions |
| internal_admin | NO | - | Not applicable |

#### Motor Threshold (Neuromodulation Child)

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patient is subject |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Determine and record MT |
| reviewer | NO | - | MT values visible in patient record |
| technician | YES | Execute | Perform MT procedures |
| resident | YES | Supervised | MT with supervision |
| clinic_admin | YES | Read only | MT records |
| researcher | NO | - | MT data via export |
| super_admin | YES | Full access | All MT records |
| internal_admin | NO | - | Not applicable |

#### Coil Positioning (Neuromodulation Child)

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patient is subject |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Neuronavigation and positioning |
| reviewer | NO | - | Positioning data in records |
| technician | YES | Execute | Position coil per protocol |
| resident | NO | - | Requires additional certification |
| clinic_admin | YES | Read only | Positioning logs |
| researcher | NO | - | Data via research export |
| super_admin | YES | Full access | All positioning data |
| internal_admin | NO | - | Not applicable |

#### Treatment Course (Neuromodulation Child)

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patient sees schedule only |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Plan and manage treatment courses |
| reviewer | NO | - | Course outcomes visible |
| technician | NO | - | Individual session execution only |
| resident | YES | Supervised | Course planning with oversight |
| clinic_admin | YES | Read only | Course scheduling and utilization |
| researcher | NO | - | Course data via research export |
| super_admin | YES | Full access | All courses |
| internal_admin | NO | - | Not applicable |

#### Outcome Tracking (Neuromodulation Child)

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patients see own progress in patient view |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | View and analyze treatment outcomes |
| reviewer | YES | Read only | Review outcome data for quality |
| technician | NO | - | Outcome data visible in session logs |
| resident | YES | Supervised | Outcome review with supervision |
| clinic_admin | YES | Read only | Clinic-wide outcome summaries |
| researcher | NO | - | Outcome data via research datasets |
| super_admin | YES | Full access | All outcome data |
| internal_admin | NO | - | Not applicable |

#### Medication Studio

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patients see medication info in patient view |
| receptionist | NO | - | No prescribing access |
| clinician | YES | Full prescribing | Full medication management |
| reviewer | YES | Read only | Review medication records |
| technician | NO | - | Not applicable |
| resident | YES | Supervised | Supervised prescribing rights |
| clinic_admin | YES | Read only | Medication utilization reports |
| researcher | NO | - | Medication data via research export |
| super_admin | YES | Full access | All medication records |
| internal_admin | NO | - | Not applicable |

#### Rehab

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patients may have rehab exercises assigned |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Design and monitor rehab protocols |
| reviewer | YES | Read only | Review rehab records |
| technician | YES | Execute | Deliver rehab sessions |
| resident | YES | Supervised | Supervised rehab management |
| clinic_admin | YES | Read only | Rehab utilization |
| researcher | NO | - | Rehab data via research export |
| super_admin | YES | Full access | All rehab data |
| internal_admin | NO | - | Not applicable |

#### Nutrition

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patients may have nutrition plans |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Nutrition protocol design |
| reviewer | YES | Read only | Review nutrition records |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Nutrition management |
| clinic_admin | YES | Read only | Nutrition program utilization |
| researcher | NO | - | Nutrition data via research |
| super_admin | YES | Full access | All nutrition data |
| internal_admin | NO | - | Not applicable |

#### Wellness

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | YES | Patient programs | Access assigned wellness programs |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Wellness protocol design |
| reviewer | YES | Read only | Review wellness participation |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Wellness management |
| clinic_admin | YES | Read only | Wellness program metrics |
| researcher | NO | - | Wellness data via research |
| super_admin | YES | Full access | All wellness data |
| internal_admin | NO | - | Not applicable |

#### Complementary

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Not directly accessible |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Complementary protocol management |
| reviewer | YES | Read only | Review complementary treatments |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Complementary management |
| clinic_admin | YES | Read only | Utilization metrics |
| researcher | NO | - | Data via research export |
| super_admin | YES | Full access | All data |
| internal_admin | NO | - | Not applicable |

#### Handbooks

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Internal clinical reference |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Read and reference all handbooks |
| reviewer | YES | Full access | Reference for quality review |
| technician | YES | Full access | Reference for procedures |
| resident | YES | Full access | Primary training resource |
| clinic_admin | YES | Read only | Administrative handbooks |
| researcher | YES | Read only | Research methodology handbooks |
| super_admin | YES | Full access | All handbooks |
| internal_admin | YES | Read only | Operational handbooks |

#### Research Evidence

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Clinical reference material |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Evidence base for clinical decisions |
| reviewer | YES | Full access | Evidence for quality review |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Learning resource |
| clinic_admin | YES | Read only | Administrative reference |
| researcher | YES | Full access | Research evidence primary workspace |
| super_admin | YES | Full access | All evidence |
| internal_admin | YES | Read only | Reference |

### ANALYZERS Section Detail

#### MRI Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results shown in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Order, view, analyze MRI data |
| reviewer | YES | Read only | Review MRI analysis outputs |
| technician | YES | Execute | Run MRI analysis pipelines |
| resident | YES | Full access | MRI analysis with supervision |
| clinic_admin | YES | Read only | Utilization metrics |
| researcher | YES | Full access | Research MRI analysis |
| super_admin | YES | Full access | All MRI data |
| internal_admin | NO | - | Not applicable |

#### QEEG Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Order, view, analyze QEEG |
| reviewer | YES | Read only | Review QEEG outputs |
| technician | YES | Execute | Run QEEG analysis |
| resident | YES | Full access | QEEG analysis |
| clinic_admin | YES | Read only | Utilization metrics |
| researcher | YES | Full access | Research QEEG analysis |
| super_admin | YES | Full access | All QEEG data |
| internal_admin | NO | - | Not applicable |

#### Video Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Video analysis for behavioral assessment |
| reviewer | YES | Read only | Review video analysis outputs |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Video analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research video analysis |
| super_admin | YES | Full access | All video data |
| internal_admin | NO | - | Not applicable |

#### Voice Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Voice analysis for clinical assessment |
| reviewer | YES | Read only | Review voice analysis outputs |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Voice analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research voice analysis |
| super_admin | YES | Full access | All voice data |
| internal_admin | NO | - | Not applicable |

#### Text Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | NLP analysis of clinical notes |
| reviewer | YES | Read only | Review text analysis outputs |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Text analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research text analysis |
| super_admin | YES | Full access | All text data |
| internal_admin | NO | - | Not applicable |

#### Biomarker Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Lab results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Blood-based biomarker analysis |
| reviewer | YES | Read only | Review biomarker reports |
| technician | NO | - | Lab results handled separately |
| resident | YES | Full access | Biomarker analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research biomarker analysis |
| super_admin | YES | Full access | All biomarker data |
| internal_admin | NO | - | Not applicable |

#### Genetic Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Genetic results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Pharmacogenomic analysis |
| reviewer | YES | Read only | Review genetic reports |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Genetic analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research genetic analysis |
| super_admin | YES | Full access | All genetic data |
| internal_admin | NO | - | Not applicable |

#### Medication Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Interaction info in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Drug interaction analysis |
| reviewer | YES | Read only | Review medication analysis |
| technician | NO | - | Not applicable |
| resident | YES | Supervised | Supervised medication analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research medication analysis |
| super_admin | YES | Full access | All medication data |
| internal_admin | NO | - | Not applicable |

#### Movement Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Movement and gait analysis |
| reviewer | YES | Read only | Review movement analysis |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Movement analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research movement analysis |
| super_admin | YES | Full access | All movement data |
| internal_admin | NO | - | Not applicable |

#### Sleep Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Sleep reports in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Sleep pattern analysis |
| reviewer | YES | Read only | Review sleep analysis |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Sleep analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research sleep analysis |
| super_admin | YES | Full access | All sleep data |
| internal_admin | NO | - | Not applicable |

#### Cognitive Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Cognitive function analysis |
| reviewer | YES | Read only | Review cognitive analysis |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Cognitive analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research cognitive analysis |
| super_admin | YES | Full access | All cognitive data |
| internal_admin | NO | - | Not applicable |

#### Mood Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Mood and affect analysis |
| reviewer | YES | Read only | Review mood analysis |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Mood analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research mood analysis |
| super_admin | YES | Full access | All mood data |
| internal_admin | NO | - | Not applicable |

#### Intervention Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Treatment outcome analysis |
| reviewer | YES | Read only | Review intervention outcomes |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Intervention analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research intervention analysis |
| super_admin | YES | Full access | All intervention data |
| internal_admin | NO | - | Not applicable |

#### Fusion Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Multimodal data fusion |
| reviewer | YES | Read only | Review fusion outputs |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Fusion analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research fusion analysis |
| super_admin | YES | Full access | All fusion data |
| internal_admin | NO | - | Not applicable |

#### Risk Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Risk indicators in patient view |
| receptionist | NO | - | No analyzer access |
| clinician | YES | Full access | Risk stratification |
| reviewer | YES | Full access | Risk review for quality |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Risk analysis |
| clinic_admin | YES | Read only | Risk analytics |
| researcher | NO | - | Risk data via research datasets |
| super_admin | YES | Full access | All risk data |
| internal_admin | NO | - | Not applicable |

#### Digital Phenotyping Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Data collection only |
| receptionist | NO | - | Not applicable |
| clinician | BETA | Requires enrollment | Beta feature, opt-in required |
| reviewer | NO | - | Not in beta program |
| technician | NO | - | Not applicable |
| resident | NO | - | Not in beta program |
| clinic_admin | BETA | Requires enrollment | Beta enrollment via admin |
| researcher | BETA | Requires enrollment | Research beta access |
| super_admin | YES | Full access | Automatic beta access |
| internal_admin | YES | Full access | Automatic beta access |

#### Neuroinflammation Analyzer

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in patient view |
| receptionist | NO | - | Not applicable |
| clinician | PREVIEW | Requires opt-in | Preview feature |
| reviewer | NO | - | Not in preview |
| technician | NO | - | Not applicable |
| resident | NO | - | Not in preview |
| clinic_admin | PREVIEW | Requires opt-in | Preview via admin |
| researcher | PREVIEW | Requires opt-in | Research preview access |
| super_admin | YES | Full access | Automatic preview access |
| internal_admin | YES | Full access | Automatic preview access |

### INTELLIGENCE Section Detail

#### DeepTwin

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patient not exposed to AI simulation |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Patient digital twin simulation |
| reviewer | NO | - | Reviewers see twin outputs in records |
| technician | NO | - | Not applicable |
| resident | YES | Full access | DeepTwin with supervision |
| clinic_admin | YES | Read only | Utilization metrics |
| researcher | YES | Full access | Research digital twin |
| super_admin | YES | Full access | All twin data |
| internal_admin | NO | - | Not applicable |

#### Evidence Research

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Clinical research tool |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | AI literature search |
| reviewer | YES | Full access | Evidence review |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Learning and research |
| clinic_admin | YES | Read only | Reference |
| researcher | YES | Full access | Primary research tool |
| super_admin | YES | Full access | All evidence |
| internal_admin | YES | Read only | Reference |

#### Longitudinal Insights

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Insights in patient view |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Patient trajectory analysis |
| reviewer | YES | Read only | Review longitudinal trends |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Longitudinal analysis |
| clinic_admin | YES | Read only | Population trends |
| researcher | YES | Full access | Research longitudinal analysis |
| super_admin | YES | Full access | All longitudinal data |
| internal_admin | NO | - | Not applicable |

#### AI Clinical Intelligence

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | AI insights reviewed by clinician first |
| receptionist | NO | - | Not applicable |
| clinician | BETA | Requires enrollment | AI clinical insights |
| reviewer | NO | - | Not in beta |
| technician | NO | - | Not applicable |
| resident | NO | - | Not in beta |
| clinic_admin | BETA | Requires enrollment | Admin beta access |
| researcher | NO | - | Not in beta |
| super_admin | YES | Full access | Automatic beta access |
| internal_admin | YES | Full access | Automatic beta access |

#### Multimodal Correlations

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Results in clinical reports |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Cross-modality correlation discovery |
| reviewer | YES | Read only | Review correlations |
| technician | NO | - | Not applicable |
| resident | YES | Full access | Correlation analysis |
| clinic_admin | YES | Read only | Utilization |
| researcher | YES | Full access | Research correlation analysis |
| super_admin | YES | Full access | All correlation data |
| internal_admin | NO | - | Not applicable |

#### Forecast

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Not exposed to predictions |
| receptionist | NO | - | Not applicable |
| clinician | BETA | Requires enrollment | Predictive analytics |
| reviewer | NO | - | Not in beta |
| technician | NO | - | Not applicable |
| resident | NO | - | Not in beta |
| clinic_admin | BETA | Requires enrollment | Clinic operations forecasting |
| researcher | YES | Full access | Research forecasting |
| super_admin | YES | Full access | All forecast data |
| internal_admin | YES | Full access | Platform forecasting |

#### Research Datasets

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | De-identified data only |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | Individual patient data via Patients |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Read only | Dataset governance |
| researcher | YES | Full access | Primary workspace |
| super_admin | YES | Full access | All datasets |
| internal_admin | YES | Full access | Dataset management |

### ECOSYSTEM Section Detail

#### AI Agents

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Patient-facing agents via patient view |
| receptionist | NO | - | Not applicable |
| clinician | YES | Full access | Clinical AI agents |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Full access | Admin agent management |
| researcher | NO | - | Research agents via research tools |
| super_admin | YES | Full access | All agent management |
| internal_admin | YES | Full access | Platform agent management |

#### Marketplace

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Not applicable |
| receptionist | YES | Browse only | View marketplace, cannot install |
| clinician | YES | Full access | Browse and install integrations |
| reviewer | YES | Browse only | View marketplace |
| technician | YES | Browse only | View marketplace |
| resident | YES | Browse only | View marketplace |
| clinic_admin | YES | Full access | Manage marketplace integrations |
| researcher | YES | Full access | Research tool integrations |
| super_admin | YES | Full access | Full marketplace management |
| internal_admin | YES | Full access | Platform marketplace management |

#### Academy

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | YES | Patient courses | Patient education content |
| receptionist | YES | Staff training | Reception training modules |
| clinician | YES | Full access | All courses and certifications |
| reviewer | YES | Full access | Reviewer training |
| technician | YES | Full access | Technical training |
| resident | YES | Full access | Primary learning resource |
| clinic_admin | YES | Full access | Admin training |
| researcher | YES | Full access | Research methodology courses |
| super_admin | YES | Full access | All academy content |
| internal_admin | YES | Full access | All academy content |

#### Monitor

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Not applicable |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | System status shown if degraded |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Read only | Clinic system health |
| researcher | NO | - | Not applicable |
| super_admin | YES | Full access | Full system monitoring |
| internal_admin | YES | Full access | Platform monitoring |

### ADMIN Section Detail

#### Reports

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Not applicable |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | Clinical reports in Dashboard |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Full access | Clinic reports and analytics |
| researcher | NO | - | Research analytics via Research Datasets |
| super_admin | YES | Full access | Cross-clinic reports |
| internal_admin | YES | Full access | Platform reports |

#### Finance

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Billing info in patient view |
| receptionist | NO | - | No financial access |
| clinician | NO | - | No financial access |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Full access | Billing, invoicing, payments |
| researcher | NO | - | Not applicable |
| super_admin | YES | Full access | All financial data |
| internal_admin | YES | Full access | Platform financials |

#### Data Console

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Own data in patient view |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | Patient data via Patients section |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Full access | Clinic data management |
| researcher | NO | - | Research data via Research Datasets |
| super_admin | YES | Full access | All data management |
| internal_admin | YES | Full access | Platform data management |

#### Audit Trail

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Own activity via patient view |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | Not applicable |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Full access | Clinic audit trail |
| researcher | NO | - | Not applicable |
| super_admin | YES | Full access | Full system audit |
| internal_admin | YES | Full access | Platform audit |

#### Consent & Governance

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Consent management in patient view |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | Consent status in patient record |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Full access | Consent management, privacy settings |
| researcher | NO | - | Research consent via research tools |
| super_admin | YES | Full access | Full governance |
| internal_admin | YES | Full access | Platform governance |

#### Device Management

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Not applicable |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | Device status in session context |
| reviewer | NO | - | Not applicable |
| technician | YES | Full access | Device operation and maintenance |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Read only | Device inventory and status |
| researcher | NO | - | Not applicable |
| super_admin | YES | Full access | All device management |
| internal_admin | YES | Full access | Platform device management |

#### User & Clinic Management

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Profile settings in patient view |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | Not applicable |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Full access | Staff management, clinic settings |
| researcher | NO | - | Not applicable |
| super_admin | YES | Full access | All user and clinic management |
| internal_admin | YES | Full access | Platform user management |

#### Research Datasets (Admin)

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Not applicable |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | Not applicable |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | YES | Governance | Dataset governance and approval |
| researcher | YES | Full access | Dataset creation and management |
| super_admin | YES | Full access | All dataset management |
| internal_admin | YES | Full access | Platform dataset management |

#### Monitor (Admin)

| Role | Visible | Access Level | Notes |
|------|---------|-------------|-------|
| patient | NO | - | Not applicable |
| receptionist | NO | - | Not applicable |
| clinician | NO | - | Not applicable |
| reviewer | NO | - | Not applicable |
| technician | NO | - | Not applicable |
| resident | NO | - | Not applicable |
| clinic_admin | NO | - | Basic monitor in ECOSYSTEM |
| researcher | NO | - | Not applicable |
| super_admin | YES | Full access | Advanced system monitoring |
| internal_admin | YES | Full access | Platform monitoring |

---

## Special Rules

### Super Admin Override

The super_admin role has visibility override that grants access to ALL navigation items regardless of standard role-based rules.

**Implementation:**
```typescript
function canSeeNavItem(item: NavItem, userRole: UserRole): boolean {
  // Super admin sees everything
  if (userRole === 'super_admin' || userRole === 'internal_admin') {
    return true;
  }

  // Check standard role requirements
  return item.requiredRoles.includes(userRole);
}
```

**Audit Requirements:**
- All super_admin navigation access is logged
- Cross-clinic data access triggers audit record
- Anomaly detection on super_admin navigation patterns
- Monthly review of super_admin access logs

### Internal Admin Override

The internal_admin role sees ALL items plus additional internal tools not shown to any other role.

**Additional Internal Tools:**
| Tool | Description | Access |
|------|-------------|--------|
| CRM Dashboard | Customer relationship management | internal_admin only |
| Support Console | Customer support tools | internal_admin only |
| Platform Analytics | Cross-tenant analytics | internal_admin only |
| Feature Flag Admin | Feature flag management | internal_admin only |
| Billing Console | Platform billing management | internal_admin only |

### Patient Isolation

Patient role is strictly limited to patient-safe pages. Patient access follows these rules:

| Rule | Description |
|------|-------------|
| Own data only | Patient can only see their own records |
| View only | No clinical actions permitted |
| Assessment completion | Can complete assigned assessments but not view results |
| Messaging | Can message care team only |
| Scheduling | Can view and book own appointments only |
| Virtual care | Can join invited sessions only |
| No analyzers | Cannot access any clinical analyzers |
| No interventions | Cannot access intervention tools |
| No admin | Cannot access any admin tools |

**Patient-visible items:**
- Dashboard (patient view)
- Inbox (own messages)
- Schedule (own appointments)
- Assessments (assigned, completion only)
- Documents (own documents)
- Virtual Care (invited sessions)
- Wellness (assigned programs)
- Academy (patient education)

### Beta Feature Gating

Beta features require enrollment beyond standard role access.

**Enrollment Rules:**
| Action | Who Can Enroll | Process |
|--------|---------------|---------|
| Enroll clinic | clinic_admin | Request via settings, approved by super_admin |
| Enroll user | clinic_admin | Assign beta flag to user |
| Automatic | super_admin, internal_admin | No enrollment needed |
| Research beta | researcher | Approved by research committee |

**Beta Feature Visibility:**
```typescript
function canAccessBeta(item: NavItem, user: User): boolean {
  // Super and internal admins have automatic access
  if (user.role === 'super_admin' || user.role === 'internal_admin') {
    return true;
  }

  // Check if clinic is enrolled in beta
  if (!user.clinic.betaEnrolled) {
    return false;
  }

  // Check if user is enrolled in beta
  if (!user.betaEnrolled) {
    return false;
  }

  // Check standard role requirements
  return item.requiredRoles.includes(user.role);
}
```

### Preview Access Gating

Preview features require opt-in but are less restrictive than beta.

**Opt-in Rules:**
| Action | Who Can Opt-in | Process |
|--------|---------------|---------|
| Self opt-in | clinician, researcher | Toggle in settings |
| Admin opt-in | clinic_admin | Enable for clinic |
| Automatic | super_admin, internal_admin | No opt-in needed |

### Coming Soon Visibility

Coming soon items are VISIBLE but DISABLED to educate users about upcoming features.

**Coming Soon Rules:**
- Item appears in sidebar with "SOON" badge
- Item is non-interactive (disabled)
- Tooltip shows expected release timeframe
- User can join waitlist
- No route registration (prevents direct navigation)

### Multi-Role Users

Users can have multiple roles. Navigation visibility is the UNION of all role permissions.

**Common Multi-Role Combinations:**
| Combination | Use Case |
|-------------|----------|
| clinician + clinic_admin | Medical director |
| clinician + researcher | Physician-scientist |
| resident + researcher | Research resident |
| technician + clinician | Advanced practice provider |

**Permission Resolution:**
```typescript
function getVisibleItems(
  items: NavItem[], 
  userRoles: UserRole[]
): NavItem[] {
  return items.filter(item => 
    userRoles.some(role => canSeeNavItem(item, role))
  );
}
```

---

## Permission Dependencies

### Hierarchy of Permissions

| Level | Permission | Implies |
|-------|------------|---------|
| 1 | super_admin | All other permissions |
| 2 | clinic_admin | ADMIN section + clinic management |
| 3 | clinician | Clinical tools + patient data |
| 4 | reviewer | Read access to clinical data |
| 5 | technician | Device operation + technical analysis |
| 6 | resident | Supervised clinical access |
| 7 | researcher | Research datasets + analyzers |
| 8 | receptionist | Scheduling + basic patient view |
| 9 | patient | Own data only |

### Cross-Dependencies

| Item | Requires |
|------|----------|
| Protocol Designer | Neuromodulation Studio + CLINICIAN_PLUS |
| Session Manager | Neuromodulation Studio + active protocol |
| Outcome Tracking | Intervention Analyzer data |
| DeepTwin | Multiple analyzer outputs |
| Fusion Analyzer | At least 2 analyzer outputs |
| Forecast | Historical data + analyzer outputs |
| Research Datasets | Cohort definition |
| AI Clinical Intelligence | Analyzer outputs |

---

## Feature Flag Integration

### Feature Flag Types

| Type | Description | Example |
|------|-------------|---------|
| Global flag | Feature enabled/disabled platform-wide | new_analyzer_enabled |
| Clinic flag | Feature enabled per clinic | clinic_beta_features |
| User flag | Feature enabled per user | user_preview_access |
| Role flag | Feature enabled per role | researcher_advanced_tools |

### Feature Flag Precedence

```
super_admin override > user flag > clinic flag > role flag > global flag
```

### Navigation Integration

```typescript
function isFeatureEnabled(
  item: NavItem, 
  user: User, 
  flags: FeatureFlags
): boolean {
  if (!item.featureFlag) return true;

  // Check user-specific flag
  if (flags.user[item.featureFlag] !== undefined) {
    return flags.user[item.featureFlag];
  }

  // Check clinic flag
  if (flags.clinic[item.featureFlag] !== undefined) {
    return flags.clinic[item.featureFlag];
  }

  // Check global flag
  if (flags.global[item.featureFlag] !== undefined) {
    return flags.global[item.featureFlag];
  }

  return false; // Default: feature disabled
}
```

---

## Beta & Preview Access Rules

### Beta Lifecycle

```
hidden -> preview (select users) -> beta (enrolled clinics) -> active (all qualified roles)
```

### Beta Enrollment States

| State | Visibility | Interaction | Badge |
|-------|------------|-------------|-------|
| hidden | Hidden | None | None |
| preview | Visible to preview list | Active (opt-in) | PREVIEW |
| beta | Visible to enrolled | Active (enrolled) | BETA |
| active | Visible to all qualified | Active | None |

### Access Control Matrix for Beta/Preview

| Role | Preview | Beta | Active |
|------|---------|------|--------|
| patient | No | No | If qualified |
| receptionist | No | No | If qualified |
| clinician | Self opt-in | Clinic enrollment | Automatic |
| reviewer | No | No | If qualified |
| technician | No | No | If qualified |
| resident | No | No | If qualified |
| clinic_admin | Clinic enable | Clinic enrollment | Automatic |
| researcher | Research approval | Research approval | Automatic |
| super_admin | Automatic | Automatic | Automatic |
| internal_admin | Automatic | Automatic | Automatic |

---

## Edge Cases

### Role Upgrade

When a user's role is upgraded (e.g., resident -> clinician):
- New navigation items appear immediately
- Section expansion state is preserved
- User may need onboarding for new tools
- Audit log records role change

### Role Downgrade

When a user's role is downgraded:
- Hidden items are immediately removed from sidebar
- Active routes to now-inaccessible pages redirect to dashboard
- Local state for hidden items is preserved (in case of re-upgrade)
- Audit log records role change

### Suspended User

When a user is suspended:
- All navigation items hidden
- Redirect to suspension notice page
- No local state changes
- Reactivation restores previous state

### Clinic Deactivation

When a clinic is deactivated:
- Admin items hidden for clinic_admin
- Clinical items remain visible (for patient care continuity)
- New patient intake disabled
- Read-only mode for existing patients

### Session Timeout

When a session times out:
- Sidebar state preserved in localStorage
- Post-reauthentication, state is restored
- Active route redirect to login, then to original route

### Cross-Role Context Switch

When a user has multiple roles and switches context:
- Navigation updates to reflect new active role
- Items not available in new role are hidden
- Items newly available are highlighted
- Role switch is logged

---

## Implementation Guide

### Frontend Implementation

```typescript
// useNavigation.ts - React hook for navigation
export function useNavigation() {
  const { user } = useAuth();
  const { flags } = useFeatureFlags();

  const visibleItems = useMemo(() => {
    return NAVIGATION_ITEMS
      .filter(item => isVisibleForRole(item, user.roles))
      .filter(item => isFeatureEnabled(item, user, flags))
      .filter(item => item.status !== 'hidden')
      .map(item => ({
        ...item,
        disabled: item.status === 'comingSoon',
        badge: getStatusBadge(item.status)
      }));
  }, [user, flags]);

  return { items: visibleItems, isLoading: false };
}

// Navigation service
class NavigationService {
  private items: NavItem[];

  constructor(items: NavItem[]) {
    this.items = items;
  }

  getVisibleItems(roles: UserRole[]): NavItem[] {
    return this.items.filter(item => this.canSee(item, roles));
  }

  private canSee(item: NavItem, roles: UserRole[]): boolean {
    // Admin override
    if (roles.includes('super_admin') || roles.includes('internal_admin')) {
      return true;
    }

    // Check role requirements
    const hasRole = item.requiredRoles.some(r => roles.includes(r));
    if (!hasRole) return false;

    // Check status
    if (item.status === 'hidden') return false;

    // Beta gating
    if (item.status === 'beta') {
      return this.hasBetaAccess(roles);
    }

    // Preview gating
    if (item.status === 'preview') {
      return this.hasPreviewAccess(roles);
    }

    return true;
  }

  private hasBetaAccess(roles: UserRole[]): boolean {
    // Implementation depends on user beta enrollment
    return false; // Placeholder
  }

  private hasPreviewAccess(roles: UserRole[]): boolean {
    // Implementation depends on user preview opt-in
    return false; // Placeholder
  }
}
```

### Backend Implementation

```python
# navigation_permissions.py - Backend validation
from enum import Enum
from typing import List, Set

class UserRole(Enum):
    PATIENT = "patient"
    RECEPTIONIST = "receptionist"
    CLINICIAN = "clinician"
    REVIEWER = "reviewer"
    TECHNICIAN = "technician"
    RESIDENT = "resident"
    CLINIC_ADMIN = "clinic_admin"
    RESEARCHER = "researcher"
    SUPER_ADMIN = "super_admin"
    INTERNAL_ADMIN = "internal_admin"

class NavigationPermissionService:
    """Backend service for navigation permission validation."""

    ADMIN_OVERRIDE_ROLES = {
        UserRole.SUPER_ADMIN, 
        UserRole.INTERNAL_ADMIN
    }

    @classmethod
    def can_access_nav_item(
        cls, 
        item_id: str, 
        user_roles: List[UserRole],
        clinic_id: str = None
    ) -> bool:
        """Check if user can access a navigation item."""

        # Admin override
        if any(r in cls.ADMIN_OVERRIDE_ROLES for r in user_roles):
            return True

        # Get item configuration
        item = NavigationConfig.get_item(item_id)
        if not item:
            return False

        # Check role requirements
        required_roles = set(item.required_roles)
        user_role_set = set(user_roles)

        if not required_roles.intersection(user_role_set):
            return False

        # Check feature flags
        if item.feature_flag:
            if not FeatureFlagService.is_enabled(
                item.feature_flag, 
                clinic_id=clinic_id
            ):
                return False

        return True

    @classmethod
    def get_visible_items(
        cls, 
        user_roles: List[UserRole],
        clinic_id: str = None
    ) -> List[dict]:
        """Get all visible navigation items for a user."""
        all_items = NavigationConfig.get_all_items()

        return [
            item for item in all_items
            if cls.can_access_nav_item(
                item["id"], 
                user_roles, 
                clinic_id
            )
        ]
```

### Route Guards

```typescript
// Route guard implementation
const navigationGuard: NavigationGuard = (to, from, next) => {
  const { user } = useAuth();
  const targetItem = findNavItemByRoute(to.path);

  if (!targetItem) {
    // Route not in navigation - allow (may be public)
    next();
    return;
  }

  if (!canSeeNavItem(targetItem, user.roles)) {
    // User cannot access this route
    next('/dashboard');
    return;
  }

  if (targetItem.status === 'comingSoon') {
    // Coming soon - redirect with notice
    next('/dashboard?notice=coming-soon');
    return;
  }

  next();
};
```

### Testing Matrix

| Test Case | Expected Result |
|-----------|----------------|
| Super admin sees all items | 59 items visible |
| Patient sees patient-safe items | 8 items visible |
| Receptionist sees scheduling items | 12 items visible |
| Clinician sees clinical items | 45 items visible |
| Researcher sees research items | 25 items visible |
| Admin sees admin items | 59 items visible |
| Beta feature without enrollment | Hidden |
| Beta feature with enrollment | Visible + active |
| Coming soon feature | Visible + disabled |
| Hidden feature | Not visible |
| Multi-role user | Union of roles |

---

## Audit & Compliance

### Audit Requirements

| Event | Logged | Retention |
|-------|--------|-----------|
| Navigation item access | Yes | 2 years |
| Role change | Yes | 7 years |
| Beta enrollment | Yes | 2 years |
| Preview opt-in | Yes | 2 years |
| Permission denied | Yes | 1 year |
| Super admin access | Yes | 7 years |
| Feature flag change | Yes | 2 years |

### Compliance Mapping

| Regulation | Requirement | Implementation |
|------------|-------------|----------------|
| HIPAA | Minimum necessary access | Role-based visibility enforced |
| HIPAA | Audit trail | All access logged |
| GDPR | Right to access | Patient role shows own data only |
| GDPR | Data minimization | Patients cannot see other patient data |
| SOC 2 | Access controls | Role-based access with regular review |
| FDA 21 CFR Part 11 | Electronic signatures | Reviewer role for approvals |

### Regular Review

| Review Type | Frequency | Responsible |
|-------------|-----------|-------------|
| Role permissions audit | Quarterly | Security team |
| Beta enrollment review | Monthly | Product team |
| Access log review | Monthly | Compliance team |
| Role definition review | Annually | Clinical advisory board |
| Navigation IA review | Semi-annually | UX team |

---

## Appendices

### Appendix A: Quick Reference Card

```
PATIENT:        Dashboard, Inbox, Schedule, Assessments, Documents, 
                Virtual Care, Wellness, Academy

RECEPTIONIST:   Dashboard, Inbox, Schedule, Patients(demo), 
                Marketplace, Academy

CLINICIAN:      ALL except Admin + Research Datasets + some Beta

REVIEWER:       Dashboard, Schedule, Patients(read), Assessments(read),
                Documents(read), Virtual Care(read), Interventions(read),
                Analyzers(read), Intelligence(read), Marketplace, Academy

TECHNICIAN:     Dashboard, Schedule, Device Management, 
                MRI/QEEG Analyzers, Neuromodulation(execute), Rehab(execute)

RESIDENT:       Same as Clinician (supervised) + Academy

CLINIC_ADMIN:   ALL Admin + Clinical read access + Beta enrollment

RESEARCHER:     ALL Analyzers + Intelligence + Research Datasets + 
                Evidence Research + Handbooks + Marketplace + Academy

SUPER_ADMIN:    EVERYTHING (full override)

INTERNAL_ADMIN: EVERYTHING + internal tools
```

### Appendix B: Item Count by Role

| Role | Visible Items | Sections |
|------|--------------|----------|
| patient | 8 | 4 (TODAY, PATIENTS, ECOSYSTEM) |
| receptionist | 12 | 5 (TODAY, PATIENTS, ECOSYSTEM) |
| clinician | 45 | 7 (all sections except ADMIN) |
| reviewer | 30 | 6 (all except ECOSYSTEM full + ADMIN) |
| technician | 18 | 5 (TODAY, ANALYZERS, select INTERVENTIONS, ECOSYSTEM) |
| resident | 42 | 7 (all except ADMIN) |
| clinic_admin | 59 | 7 (all) |
| researcher | 25 | 5 (ANALYZERS, INTELLIGENCE, ECOSYSTEM) |
| super_admin | 59 | 7 (all) |
| internal_admin | 59+ | 7 (all + internal) |

### Appendix C: Status Distribution

| Status | Count | Roles Can See |
|--------|-------|---------------|
| active | 56 | Per role matrix |
| beta | 3 | Enrolled + super_admin |
| preview | 1 | Opted-in + super_admin |
| comingSoon | 0 | N/A |
| hidden | 0 | N/A |

### Appendix D: Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-14 | Initial release with 10 roles, 59 items |

---

*Document generated by DeepSynaps Architecture Team*
*For questions or updates, contact the Platform Engineering and Security teams*
