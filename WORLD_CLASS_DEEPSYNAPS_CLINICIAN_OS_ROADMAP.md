# World-Class DeepSynaps Clinician Operating System -- Roadmap

## Version
- **Document Version**: 3.0.0
- **Last Updated**: 2026-05-15
- **Status**: FINAL
- **Classification**: Architecture Master Document
- **Author**: DeepSynaps Protocol Studio Architecture Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Vision](#vision)
3. [Design Principles](#design-principles)
4. [Sidebar Architecture (7 Sections, 74 Items)](#sidebar-architecture)
5. [Navigation Registry Schema](#navigation-registry-schema)
6. [Role Matrix](#role-matrix)
7. [Multimodal Intelligence Flow](#multimodal-intelligence-flow)
8. [DeepTwin Architecture](#deeptwin-architecture)
9. [Analyzer-Intervention Wiring](#analyzer--intervention-wiring)
10. [Research Foundation (7 Reports, 27,155 Lines)](#research-foundation)
11. [Technology Stack](#technology-stack)
12. [Implementation Checklist](#implementation-checklist)
13. [12-Week Modernization Plan](#12-week-modernization-plan)
14. [Safety Framework](#safety-framework)
15. [Appendices](#appendices)

---

## Executive Summary

### Mission

Transform DeepSynaps from a collection of disconnected clinical tools into a **coherent clinician operating system** -- a unified, role-aware, multimodal platform that answers the fundamental question every clinician asks when they log in: **"What requires my attention?"**

### What We Built

This roadmap is the culmination of an extensive research and architecture effort:

| Metric | Value |
|--------|-------|
| Research Reports | 7 (27,155 lines) |
| Sidebar Implementation | 2,252 lines |
| Navigation Items | 74 (top-level) / 80 (with children) |
| Sidebar Sections | 7 |
| Role Definitions | 10 |
| Role Groups | 7 |
| Inline SVG Icons | 66 |
| Status Categories | 5 |
| Architecture Documents | 8 |
| Test Coverage | 40+ test scenarios |
| Routes Preserved | 100% (zero pages broken) |

### The Problem We Solved

**Before**: DeepSynaps had grown organically. Features were added as separate tools -- MRI analyzer, qEEG analyzer, medication analyzer, voice analyzer, text analyzer, video analyzer -- each with its own navigation pattern, its own UX conventions, and its own access controls. Clinicians had to remember where each tool lived. There was no unified "morning briefing" view. New staff required weeks of training to navigate the system.

**After**: A single sidebar architecture organizes all 74 navigation items into 7 clinically-meaningful sections. Every item declares who can see it (role-aware), what state it is in (status-aware), and what it does (searchable keywords). The sidebar answers clinical questions, not tool names:

- **TODAY**: "What requires my attention?" (7 items)
- **PATIENTS**: "Who am I managing?" (6 items)
- **INTERVENTIONS**: "What treatments/care plans are we providing?" (18 items)
- **ANALYZERS**: "What intelligence/analysis do we have?" (24 items)
- **INTELLIGENCE**: "What multimodal synthesis/evidence/AI support?" (10 items)
- **ECOSYSTEM**: "What external systems/resources/marketplace?" (6 items)
- **ADMIN**: "How is the clinic, governance, data, finance managed?" (9 items)

### Key Innovation: Question-Based Navigation

Traditional healthcare UX organizes by tool name ("MRI Analyzer", "qEEG Analyzer"). Our architecture organizes by **clinical question**. When a clinician asks "What requires my attention?" they find the Inbox (unread messages), Clinician Digest (daily briefing), Adherence Hub (non-compliant patients), and Wellness Hub (staff burnout alerts) -- all in the TODAY section.

### Key Innovation: Role-Aware Everything

Every navigation item declares its `requiredRoles`. Role groups express common access patterns:
- `ALL_CLINICAL`: 7 roles (clinician, resident, reviewer, technician, clinic_admin, super_admin, internal)
- `CLINICIAN_PLUS`: 4 roles (clinician, clinic_admin, super_admin, internal)
- `ADMIN_ONLY`: 3 roles (clinic_admin, super_admin, internal)
- `SUPER_ONLY`: 2 roles (super_admin, internal)
- `RESEARCHER`: 5 roles (researcher, clinician, clinic_admin, super_admin, internal)
- `RECEPTIONIST`: 4 roles (receptionist, clinic_admin, super_admin, internal)

A technician sees 45 items. A super admin sees all 74. A patient sees only their portal. Zero configuration per user -- the role matrix decides.

### Zero Pages Broken Guarantee

Every existing route is preserved through the `aliases` system. `/protocols` still works -- it highlights the Protocol Studio item. `/mri` still works -- it highlights the MRI Analyzer. No bookmarks broken. No workflows disrupted.

---

## Vision

> "A multimodal clinician operating system for interventions, analyzers, biomarkers, evidence intelligence, longitudinal monitoring, AI-assisted clinical workflows, and multimodal patient reasoning."

### What This Means

| Capability | Description |
|------------|-------------|
| **Interventions** | Neuromodulation, medication management, rehab, nutrition, wellness, surgery, group therapy, home programs |
| **Analyzers** | MRI, qEEG, voice, text, video, movement, biometrics, labs, biomarkers, medication genetics, sleep, cognition |
| **Biomarkers** | Blood, neuroimaging, genetic, digital phenotyping, wearable-derived biological markers |
| **Evidence Intelligence** | AI-powered literature search, clinical trial matching, knowledge graph exploration |
| **Longitudinal Monitoring** | Patient trajectory tracking, progression analysis, outcome measurement over time |
| **AI-Assisted Workflows** | DeepTwin digital twin, AI clinical intelligence, protocol simulation, risk stratification |
| **Multimodal Patient Reasoning** | Cross-modal correlation discovery (brain imaging + voice + behavior + genetics = unified picture) |

### The Clinician Operating System Analogy

Just as an operating system (Windows, macOS, Linux) abstracts hardware complexity and presents a unified interface for applications, the DeepSynaps Clinician OS abstracts:

- **Data complexity**: 12+ data sources (MRI, EEG, blood labs, voice, video, wearables, genetics, ...) presented through unified analyzers
- **Navigation complexity**: 74+ tools organized into 7 clinical questions
- **Access complexity**: 10 roles with automatic visibility filtering
- **Workflow complexity**: Interventions, analyzers, and intelligence wired together through DeepTwin

The sidebar is the "desktop." Each analyzer is an "application." DeepTwin is the "kernel" that coordinates multimodal data fusion. The intelligence layer is the "system services" that provide AI capabilities to all applications.

---

## Design Principles

### 1. Clinician-First

Every design decision starts with: "What does the clinician need to know or do right now?" The TODAY section is first because the first question every clinician asks is "What requires my attention?" Not "What tools are available?" Not "Where is the settings menu?" -- "What needs my attention?"

**Implications:**
- TODAY section is always first, never collapsed by default
- Inbox shows urgent badge count
- Clinician Digest provides daily briefing
- Adherence Hub flags non-compliant patients
- Wellness Hub monitors staff burnout

### 2. Task-Oriented Grouping

Items are grouped by clinical workflow, not by tool category. The Protocol Studio (neuromodulation) sits next to Medication Studio (pharmacology) and Rehab (physiotherapy) because they are all **interventions** -- things the clinician does to treat the patient. They are not separated into "Stimulation Tools" and "Drug Tools" and "Movement Tools."

**Implications:**
- INTERVENTIONS section contains all treatment modalities
- ANALYZERS section contains all data analysis tools
- INTELLIGENCE section contains all AI/synthesis tools
- ECOSYSTEM section contains all external integrations

### 3. Role-Aware

Show only what each role needs. A technician does not see medication genetic analysis. A receptionist does not see biomarker databases. A researcher sees evidence research and digital phenotyping that clinicians do not.

**Implications:**
- Every item has `requiredRoles`
- Role groups prevent repetitive array definitions
- Super admins see everything
- Hidden items (feature-flagged) never render

### 4. Progressive Disclosure

Complexity is available on demand. The ANALYZERS section is collapsed by default because a clinician may not need it every session. But it is one click away. Within sections, children items (Protocol Studio's sub-items) expand only when the parent is active.

**Implications:**
- ANALYZERS and INTELLIGENCE sections collapsed by default
- Section state persisted in localStorage
- Children items render as sub-menus
- Search reveals hidden items instantly

### 5. Safety-Integrated

Governance is built into the UX, not bolted on. Every analyzer that uses AI shows an "AI" badge. Beta features show "beta" badges. Coming-soon features are visible but disabled (not hidden -- transparency about roadmap). Status badges are part of the navigation schema, not afterthoughts.

**Implications:**
- 5 status states: active, beta, preview, coming-soon, hidden
- AI badge on all AI-powered items
- Urgent badge (!3) for inbox notifications
- "soon" badge for coming-soon features (visible but non-interactive)

### 6. Multimodal

All data sources unified in one navigation system. MRI, EEG, voice, video, movement, biometrics, labs, genetics, sleep, cognition -- all analyzers are peers in the ANALYZERS section. The INTELLIGENCE layer correlates across them.

**Implications:**
- 24 analyzers covering 12+ data modalities
- Multimodal Correlations tool for cross-modal discovery
- DeepTwin fuses all modalities into patient digital twin
- No modality is siloed in its own navigation hierarchy

### 7. Evidence-Linked

Provenance on every finding. Research Evidence item links to literature. Evidence Research provides AI-powered search. Every analyzer's output carries evidence grades. The system does not present conclusions without showing the evidence behind them.

**Implications:**
- Evidence grades A-D on all AI outputs
- Research Evidence link in INTERVENTIONS
- Evidence Research tool in INTELLIGENCE
- Trial Matcher connects patients to relevant studies

### 8. Uncertainty-Aware

Honest about limitations. The system uses a 4-tier uncertainty model (high confidence / moderate confidence / low confidence / insufficient data) and displays uncertainty indicators on every finding. It never presents AI outputs as definitive diagnoses.

**Implications:**
- 4-tier uncertainty on all AI outputs
- "Requires review" badges on low-confidence findings
- Confidence scores displayed alongside predictions
- Break-glass access for emergency override

---

## Sidebar Architecture

### Overview: 7 Sections, 74 Top-Level Items

| Section | Items | Purpose | Default Collapsed | Tint Color |
|---------|-------|---------|-------------------|------------|
| TODAY | 7 | What requires my attention? | No | #38bdf8 (Sky) |
| PATIENTS | 6 | Who am I managing? | No | #818cf8 (Indigo) |
| INTERVENTIONS | 12 (18 w/ children) | What treatments/care plans? | No | #fbbf24 (Amber) |
| ANALYZERS | 24 | What intelligence/analysis? | Yes | #a78bfa (Purple) |
| INTELLIGENCE | 10 | What multimodal synthesis? | Yes | #2dd4bf (Teal) |
| ECOSYSTEM | 6 | What external resources? | No | #34d399 (Emerald) |
| ADMIN | 9 | How is clinic managed? | Yes | #94a3b8 (Slate) |

### Section Detail: TODAY (7 items)

The TODAY section answers: **"What requires my attention?"**

| # | ID | Label | Route | Status | AI | Badge |
|---|-----|-------|-------|--------|-----|-------|
| 1 | dashboard | Dashboard | `/` | Active | No | No |
| 2 | clinician-inbox | Inbox | `/inbox` | Active | No | !3 |
| 3 | clinician-digest | Clinician Digest | `/digest` | Active | No | No |
| 4 | schedule-v2 | Schedule | `/schedule` | Active | No | No |
| 5 | quick-actions | Quick Actions | `/quick-actions` | Active | No | No |
| 6 | clinician-adherence | Adherence Hub | `/adherence-hub` | Beta | No | No |
| 7 | clinician-wellness | Wellness Hub | `/wellness-hub` | Beta | No | No |

**Design rationale**: These are the first 7 items a clinician sees every morning. Dashboard for overview. Inbox for urgent messages. Digest for daily briefing. Schedule for appointments. Quick Actions for frequent workflows. Adherence Hub for compliance monitoring. Wellness Hub for staff self-care.

**Role access**: ALL_CLINICAL (clinician, resident, reviewer, technician, clinic_admin, super_admin, internal)

### Section Detail: PATIENTS (6 items)

The PATIENTS section answers: **"Who am I managing?"**

| # | ID | Label | Route | Status | AI |
|---|-----|-------|-------|--------|-----|
| 1 | patients-v2 | Patients | `/patients` | Active | No |
| 2 | assessments-v2 | Assessments | `/assessments` | Active | No |
| 3 | documents-v2 | Documents | `/documents` | Active | No |
| 4 | live-session | Virtual Care | `/virtual-care` | Active | Yes |
| 5 | patient-timeline | Patient Timeline | `/patient-timeline` | Active | No |
| 6 | patient-goals | Patient Goals | `/patient-goals` | Beta | No |

**Design rationale**: After checking what requires attention (TODAY), the clinician asks "Who are my patients today?" Patient roster, assessments, documents, virtual care, timeline, and goals -- all patient-management functions grouped together.

**Role access**: Mostly ALL_CLINICAL; Documents and Virtual Care are CLINICIAN_PLUS (sensitive patient data).

### Section Detail: INTERVENTIONS (12 top-level, 18 total with children)

The INTERVENTIONS section answers: **"What treatments/care plans are we providing?"**

| # | ID | Label | Route | Status | AI | Children |
|---|-----|-------|-------|--------|-----|----------|
| 1 | protocol-studio | Neuromodulation Studio | `/protocol-studio` | Active | Yes | 6 |
| 1a | protocol-builder | Protocol Builder | `/protocol-studio/builder` | Active | No | - |
| 1b | brainmap-v2 | Brain Map Planner | `/protocol-studio/brain-map` | Active | No | - |
| 1c | stimulation-targets | Stimulation Targets | `/protocol-studio/targets` | Active | No | - |
| 1d | device-planning | Device Planning | `/protocol-studio/devices` | Beta | No | - |
| 1e | session-planning | Session Planning | `/protocol-studio/sessions` | Active | No | - |
| 1f | protocol-deeptwin-sim | DeepTwin Simulation | `/protocol-studio/deeptwin-sim` | Preview | Yes | - |
| 2 | medication-studio | Medication Studio | `/medication-studio` | Beta | No | 0 |
| 3 | rehab-physio | Rehab / Physiotherapy | `/rehab` | Active | No | 0 |
| 4 | nutrition-metabolic | Nutrition & Metabolic | `/nutrition` | Active | No | 0 |
| 5 | wellness-lifestyle | Wellness & Lifestyle | `/wellness` | Active | No | 0 |
| 6 | complementary-interventions | Complementary Interventions | `/complementary` | Coming Soon | No | 0 |
| 7 | handbooks-v2 | Handbooks | `/handbooks` | Active | No | 0 |
| 8 | home-program | Home Program | `/home-program` | Active | No | 0 |
| 9 | outcome-measures | Outcome Measures | `/outcomes` | Active | No | 0 |
| 10 | group-therapy | Group Therapy | `/group-therapy` | Coming Soon | No | 0 |
| 11 | surgical-planning | Surgical Planning | `/surgical-planning` | Coming Soon | No | 0 |
| 12 | research-evidence | Research Evidence | `/evidence` | Active | Yes | 0 |

**Design rationale**: This is the largest section because treatment is what clinicians do. Neuromodulation (Protocol Studio) is the flagship, with 6 sub-items for protocol building, brain mapping, targeting, device planning, session planning, and AI simulation. Medication, rehab, nutrition, wellness, and complementary therapies provide multimodal treatment options. Handbooks and home programs support patient self-management. Outcome measures track results. Group therapy and surgical planning are on the roadmap.

**Role access**: Mostly CLINICIAN_PLUS (sensitive treatment decisions); Rehab, Nutrition, Wellness, Handbooks, Home Program, and Outcomes are ALL_CLINICAL. Research Evidence is RESEARCHER-only.

### Section Detail: ANALYZERS (24 items)

The ANALYZERS section answers: **"What intelligence/analysis do we have?"**

#### Risk & Safety (1 item)
| # | ID | Label | Route | Status | AI |
|---|-----|-------|-------|--------|-----|
| 1 | risk-analyzer | Risk Analyzer | `/analyzers/risk` | Active | Yes |

#### Biomarkers & Biometrics (6 items)
| # | ID | Label | Route | Status | AI |
|---|-----|-------|-------|--------|-----|
| 2 | biomarkers | Biomarkers | `/analyzers/biomarkers` | Active | No |
| 3 | wearables | Biometrics Analyzer | `/analyzers/biometrics` | Active | Yes |
| 4 | labs-analyzer | Labs Analyzer | `/analyzers/labs` | Active | Yes |
| 5 | nutrition-analyzer | Nutrition Analyzer | `/analyzers/nutrition` | Active | Yes |
| 6 | bio-database | Bio Database | `/analyzers/bio-db` | Beta | Yes |

#### Treatment & Adherence (1 item)
| # | ID | Label | Route | Status | AI |
|---|-----|-------|-------|--------|-----|
| 7 | treatment-sessions-analyzer | Intervention Analyzer | `/analyzers/intervention` | Active | Yes |

#### Multimodal Analyzers (8 items)
| # | ID | Label | Route | Status | AI |
|---|-----|-------|-------|--------|-----|
| 8 | voice-analyzer | Voice Analyzer | `/analyzers/voice` | Active | Yes |
| 9 | text-analyzer | Text Analyzer | `/analyzers/text` | Active | Yes |
| 10 | video-assessments | Video Assessments | `/analyzers/video` | Active | Yes |
| 11 | movement-analyzer | Movement Analyzer | `/analyzers/movement` | Active | Yes |
| 12 | digital-phenotyping-analyzer | Digital Phenotyping | `/analyzers/phenotyping` | Beta | Yes |
| 13 | behaviour | Behaviour Workspace | `/analyzers/behaviour` | Active | Yes |
| 14 | mri-analysis | MRI Analyzer | `/analyzers/mri` | Active | Yes |
| 15 | qeeg-launcher | qEEG Analyzer | `/analyzers/qeeg` | Active | Yes |

#### Specialized Analyzers (8 items)
| # | ID | Label | Route | Status | AI |
|---|-----|-------|-------|--------|-----|
| 16 | medication-analyzer | Genetic Medication Analyzer | `/analyzers/medication` | Active | Yes |
| 17 | phenotype-analyzer | Phenotype Analyzer | `/analyzers/phenotype` | Beta | Yes |
| 18 | deeptwin-insights | DeepTwin Insights | `/analyzers/deeptwin-insights` | Preview | Yes |
| 19 | genomic-analyzer | Genomic Analyzer | `/analyzers/genomic` | Preview | Yes |
| 20 | fnirs-analyzer | fNIRS Analyzer | `/analyzers/fnirs` | Beta | Yes |
| 21 | pet-analyzer | PET Analyzer | `/analyzers/pet` | Coming Soon | Yes |
| 22 | neurophysiology-analyzer | Neurophysiology | `/analyzers/neurophysiology` | Coming Soon | Yes |
| 23 | sleep-analyzer | Sleep Analyzer | `/analyzers/sleep` | Beta | Yes |
| 24 | cognitive-analyzer | Cognitive Analyzer | `/analyzers/cognitive` | Beta | Yes |

**Design rationale**: 24 analyzers organized into 5 functional groups. Risk & Safety comes first (safety-first ordering). Biomarkers & Biometrics handle biological data. Treatment & Adherence tracks intervention outcomes. Multimodal Analyzers process patient-generated data (voice, text, video, movement, behavior). Specialized Analyzers handle advanced neuroimaging and genetics. The section is collapsed by default because clinicians may not access analyzers every session, but search makes any analyzer instantly findable.

**Role access**: Biomarkers, Bio Database, Digital Phenotyping, Phenotype Analyzer, Genomic Analyzer, and fNIRS Analyzer are RESEARCHER-only (specialized tools). Most others are CLINICIAN_PLUS or ALL_CLINICAL.

### Section Detail: INTELLIGENCE (10 items)

The INTELLIGENCE section answers: **"What multimodal synthesis/evidence/AI support?"**

| # | ID | Label | Route | Status | AI |
|---|-----|-------|-------|--------|-----|
| 1 | deeptwin | DeepTwin | `/intelligence/deeptwin` | Active | Yes |
| 2 | evidence-research | Evidence Research | `/intelligence/evidence` | Active | Yes |
| 3 | longitudinal-insights | Longitudinal Insights | `/intelligence/longitudinal` | Active | Yes |
| 4 | ai-clinical-intelligence | AI Clinical Intelligence | `/intelligence/ai-clinical` | Beta | Yes |
| 5 | multimodal-correlations | Multimodal Correlations | `/intelligence/correlations` | Preview | Yes |
| 6 | forecast-simulation | Forecast & Simulation | `/intelligence/forecast` | Preview | Yes |
| 7 | knowledge-graph | Knowledge Graph | `/intelligence/knowledge-graph` | Preview | Yes |
| 8 | trial-matcher | Trial Matcher | `/intelligence/trial-matcher` | Preview | Yes |
| 9 | population-analytics | Population Analytics | `/intelligence/population` | Active | Yes |
| 10 | research-datasets | Research Datasets | `/intelligence/datasets` | Beta | No |

**Design rationale**: The INTELLIGENCE layer is where raw analyzer outputs become clinical insights. DeepTwin is the patient digital twin (flagship AI feature). Evidence Research provides literature synthesis. Longitudinal Insights tracks patient trajectories over time. AI Clinical Intelligence offers decision support. Multimodal Correlations discovers cross-modal patterns. Forecast & Simulation predicts outcomes. Knowledge Graph maps clinical relationships. Trial Matcher connects patients to studies. Population Analytics provides cohort-level views. Research Datasets enables data export for research.

**Role access**: Evidence Research, Multimodal Correlations, and Knowledge Graph are RESEARCHER-only. Population Analytics and Research Datasets are ADMIN/SUPER-only. Most others are CLINICIAN_PLUS.

### Section Detail: ECOSYSTEM (6 items)

The ECOSYSTEM section answers: **"What external systems/resources/marketplace?"**

| # | ID | Label | Route | Status | AI |
|---|-----|-------|-------|--------|-----|
| 1 | ai-agent-v2 | AI Agents | `/ecosystem/agents` | Active | Yes |
| 2 | marketplace | Marketplace | `/ecosystem/marketplace` | Active | No |
| 3 | academy | Academy | `/ecosystem/academy` | Active | No |
| 4 | referral-network | Referral Network | `/ecosystem/referrals` | Beta | No |
| 5 | insurance-portal | Insurance Portal | `/ecosystem/insurance` | Active | No |
| 6 | monitor | Monitor | `/ecosystem/monitor` | Active | No |

**Design rationale**: ECOSYSTEM contains external-facing and supporting tools. AI Agents provide workflow automation. Marketplace offers third-party integrations. Academy provides training. Referral Network manages specialist connections. Insurance Portal handles billing. Monitor tracks system health. These are tools that connect the clinic to the broader healthcare ecosystem.

**Role access**: Most are ALL_CLINICAL. Insurance Portal is RECEPTIONIST-only (billing staff). Monitor is ADMIN_ONLY.

### Section Detail: ADMIN (9 items)

The ADMIN section answers: **"How is the clinic, governance, data, finance managed?"**

| # | ID | Label | Route | Status | AI |
|---|-----|-------|-------|--------|-----|
| 1 | reports-v2 | Reports | `/admin/reports` | Active | No |
| 2 | finance-v2 | Finance | `/admin/finance` | Active | No |
| 3 | data-console | Data Console | `/admin/data-console` | Active | No |
| 4 | audit-trail | Audit Trail | `/admin/audit` | Active | No |
| 5 | consent-governance | Consent & Governance | `/admin/consent` | Active | No |
| 6 | device-management | Device Management | `/admin/devices` | Active | No |
| 7 | user-clinic-management | User & Clinic Management | `/admin/users` | Active | No |
| 8 | admin-research-datasets | Research Datasets | `/admin/research-datasets` | Beta | No |
| 9 | tickets | Support Tickets | `/admin/tickets` | Active | No |

**Design rationale**: ADMIN contains clinic operations, governance, and system management. Reports for analytics. Finance for billing. Data Console for dataset exploration. Audit Trail for compliance logging. Consent & Governance for IRB/ethics. Device Management for equipment inventory. User & Clinic Management for staff/roles. Research Datasets for curated exports. Support Tickets for helpdesk. This section is collapsed by default and ADMIN-only.

**Role access**: Reports, Finance, Data Console, Consent & Governance, and Device Management are ADMIN_ONLY. Audit Trail and User/Clinic Management are SUPER_ONLY. Support Tickets are ALL_CLINICAL (everyone needs help).


---

## Navigation Registry Schema

### Schema Definition

Every navigation item in the DeepSynaps platform follows a strict schema:

```typescript
interface NavItem {
  /** Unique identifier used for keys, lookups, and event dispatch */
  id: string;

  /** Human-readable display label */
  label: string;

  /** Primary route path (e.g., '/patients') */
  route: string;

  /** Alternative route paths that highlight this item */
  aliases?: string[];

  /** Key into the ICONS registry for inline SVG rendering */
  icon: string;

  /** Section name for grouping */
  section: 'TODAY' | 'PATIENTS' | 'INTERVENTIONS' | 'ANALYZERS' | 'INTELLIGENCE' | 'ECOSYSTEM' | 'ADMIN';

  /** Roles that can see this item */
  requiredRoles: string[];

  /** Lifecycle status rendered as badge */
  status: 'active' | 'beta' | 'preview' | 'comingSoon' | 'hidden';

  /** Short description for tooltips and search */
  description: string;

  /** Searchable keywords for discovery */
  keywords: string[];

  /** Nested sub-items for expandable groups */
  children?: NavItem[];

  /** Whether this item uses AI (renders AI badge) */
  ai?: boolean;

  /** Optional counter badge text (e.g., '!3' for urgent, '5' for count) */
  badge?: string;
}
```

### Schema Invariants

1. **Every item MUST have**: `id`, `label`, `route`, `icon`, `section`, `requiredRoles`, `status`, `description`, `keywords`
2. **IDs must be unique**: No two items (including children) can share an `id`
3. **Section must be valid**: Must be one of the 7 keys in `SECTION_META`
4. **Status must be valid**: Must be one of the 5 `STATUS` enum values
5. **Icon must exist**: Must be a key in the `ICONS` registry
6. **Role arrays are explicit**: No wildcard roles -- every item declares exactly who can see it
7. **Children inherit parent section**: Child items use the same `section` as their parent
8. **Aliases are preserved routes**: Every alias is a legacy route that still works

### Validation

The `validateRegistry()` function checks all invariants:
- Required field presence
- Unique ID constraint
- Valid section references
- Valid status values
- Icon existence in registry
- Child item validation

### Complete Navigation Item Registry (All 74 Items)

#### TODAY Section (7 items)

---

**Item 1: Dashboard**
| Field | Value |
|-------|-------|
| id | `dashboard` |
| label | Dashboard |
| route | `/` |
| aliases | `/dashboard`, `/home` |
| icon | `layout-grid` |
| section | TODAY |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Overview of clinic activity, alerts, and daily metrics |
| keywords | home, overview, summary, start, landing, main |

---

**Item 2: Inbox**
| Field | Value |
|-------|-------|
| id | `clinician-inbox` |
| label | Inbox |
| route | `/inbox` |
| aliases | `/clinician-inbox`, `/notifications` |
| icon | `inbox` |
| section | TODAY |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Messages, tasks, and notifications requiring attention |
| keywords | messages, tasks, notifications, alerts, communication, mail |
| badge | `!3` |

---

**Item 3: Clinician Digest**
| Field | Value |
|-------|-------|
| id | `clinician-digest` |
| label | Clinician Digest |
| route | `/digest` |
| aliases | `/clinician-digest`, `/daily-digest` |
| icon | `newspaper` |
| section | TODAY |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Daily summary of patient events, adherence flags, and wellness alerts |
| keywords | digest, daily, summary, report, briefing, rounds |

---

**Item 4: Schedule**
| Field | Value |
|-------|-------|
| id | `schedule-v2` |
| label | Schedule |
| route | `/schedule` |
| aliases | `/schedule-v2`, `/calendar`, `/appointments` |
| icon | `calendar` |
| section | TODAY |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Appointments, sessions, and calendar management |
| keywords | calendar, appointments, bookings, sessions, time, slots |

---

**Item 5: Quick Actions**
| Field | Value |
|-------|-------|
| id | `quick-actions` |
| label | Quick Actions |
| route | `/quick-actions` |
| aliases | `/quick-actions`, `/actions`, `/shortcuts` |
| icon | `zap` |
| section | TODAY |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Frequently used actions and workflow shortcuts |
| keywords | quick, actions, shortcuts, frequent, workflow, speed |

---

**Item 6: Adherence Hub**
| Field | Value |
|-------|-------|
| id | `clinician-adherence` |
| label | Adherence Hub |
| route | `/adherence-hub` |
| aliases | `/clinician-adherence`, `/adherence`, `/compliance` |
| icon | `clipboard-check` |
| section | TODAY |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | BETA |
| description | Cross-patient adherence monitoring and intervention triage |
| keywords | adherence, compliance, hub, monitoring, medication, follow-up |

---

**Item 7: Wellness Hub**
| Field | Value |
|-------|-------|
| id | `clinician-wellness` |
| label | Wellness Hub |
| route | `/wellness-hub` |
| aliases | `/clinician-wellness`, `/wellness-triage`, `/staff-wellness` |
| icon | `heart-pulse` |
| section | TODAY |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | BETA |
| description | Staff wellness monitoring and burnout prevention dashboard |
| keywords | wellness, staff, burnout, hub, triage, self-care |

---

#### PATIENTS Section (6 items)

---

**Item 8: Patients**
| Field | Value |
|-------|-------|
| id | `patients-v2` |
| label | Patients |
| route | `/patients` |
| aliases | `/patients-v2`, `/patient-list`, `/roster` |
| icon | `users` |
| section | PATIENTS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Patient roster, profiles, and case management |
| keywords | patients, roster, cases, clients, profiles, list |

---

**Item 9: Assessments**
| Field | Value |
|-------|-------|
| id | `assessments-v2` |
| label | Assessments |
| route | `/assessments` |
| aliases | `/assessments-v2`, `/assessment-hub` |
| icon | `clipboard-check` |
| section | PATIENTS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Clinical assessments, scales, and evaluation tools |
| keywords | assessments, scales, evaluations, tests, forms, questionnaires |

---

**Item 10: Documents**
| Field | Value |
|-------|-------|
| id | `documents-v2` |
| label | Documents |
| route | `/documents` |
| aliases | `/documents-v2`, `/files`, `/records` |
| icon | `file-text` |
| section | PATIENTS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Patient documents, files, and medical records |
| keywords | documents, files, records, pdfs, charts, notes |

---

**Item 11: Virtual Care**
| Field | Value |
|-------|-------|
| id | `live-session` |
| label | Virtual Care |
| route | `/virtual-care` |
| aliases | `/live-session`, `/telehealth`, `/video-call` |
| icon | `video` |
| section | PATIENTS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Telehealth sessions and virtual patient consultations |
| keywords | virtual, telehealth, video, call, remote, consultation, session |
| ai | Yes |

---

**Item 12: Patient Timeline**
| Field | Value |
|-------|-------|
| id | `patient-timeline` |
| label | Patient Timeline |
| route | `/patient-timeline` |
| aliases | `/patient-timeline`, `/timeline`, `/history` |
| icon | `timer` |
| section | PATIENTS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Chronological patient event timeline and clinical history |
| keywords | timeline, history, chronology, events, journey, audit |

---

**Item 13: Patient Goals**
| Field | Value |
|-------|-------|
| id | `patient-goals` |
| label | Patient Goals |
| route | `/patient-goals` |
| aliases | `/patient-goals`, `/goals`, `/care-plan` |
| icon | `target` |
| section | PATIENTS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | BETA |
| description | Goal-oriented care planning and patient milestone tracking |
| keywords | goals, milestones, care plan, objectives, targets, recovery |

---

#### INTERVENTIONS Section (12 top-level, 18 total)

---

**Item 14: Neuromodulation Studio** (Parent with 6 children)
| Field | Value |
|-------|-------|
| id | `protocol-studio` |
| label | Neuromodulation Studio |
| route | `/protocol-studio` |
| aliases | `/protocols`, `/protocol-builder`, `/neuromodulation` |
| icon | `zap` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Design, review, and manage neuromodulation treatment protocols |
| keywords | protocol, neuromodulation, tms, tdcs, stimulation, treatment, plan, builder |
| ai | Yes |

**Child 14a: Protocol Builder**
| Field | Value |
|-------|-------|
| id | `protocol-builder` |
| label | Protocol Builder |
| route | `/protocol-studio/builder` |
| icon | `circle-plus` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Step-by-step protocol creation wizard |
| keywords | wizard, create, new, builder |

**Child 14b: Brain Map Planner**
| Field | Value |
|-------|-------|
| id | `brainmap-v2` |
| label | Brain Map Planner |
| route | `/protocol-studio/brain-map` |
| icon | `brain` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Plan stimulation targets using brain mapping data |
| keywords | brain, map, targeting, planning, montage |

**Child 14c: Stimulation Targets**
| Field | Value |
|-------|-------|
| id | `stimulation-targets` |
| label | Stimulation Targets |
| route | `/protocol-studio/targets` |
| icon | `target` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Manage and review stimulation target libraries |
| keywords | targets, coordinates, montage, regions, focality |

**Child 14d: Device Planning**
| Field | Value |
|-------|-------|
| id | `device-planning` |
| label | Device Planning |
| route | `/protocol-studio/devices` |
| icon | `hard-drive` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | BETA |
| description | Device selection and configuration planning |
| keywords | device, coil, electrode, hardware, equipment |

**Child 14e: Session Planning**
| Field | Value |
|-------|-------|
| id | `session-planning` |
| label | Session Planning |
| route | `/protocol-studio/sessions` |
| icon | `calendar` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Schedule and plan individual treatment sessions |
| keywords | sessions, scheduling, planning, dosing, parameters |

**Child 14f: DeepTwin Simulation**
| Field | Value |
|-------|-------|
| id | `protocol-deeptwin-sim` |
| label | DeepTwin Simulation |
| route | `/protocol-studio/deeptwin-sim` |
| icon | `atom` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | PREVIEW |
| description | AI-powered treatment response simulation |
| keywords | simulation, prediction, forecast, ai, modeling |
| ai | Yes |

---

**Item 15: Medication Studio**
| Field | Value |
|-------|-------|
| id | `medication-studio` |
| label | Medication Studio |
| route | `/medication-studio` |
| aliases | `/medication`, `/meds`, `/pharmacy` |
| icon | `pill` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | BETA |
| description | Medication management, interactions, and adherence tracking |
| keywords | medication, drugs, pharmacy, prescriptions, pills, meds |

---

**Item 16: Rehab / Physiotherapy**
| Field | Value |
|-------|-------|
| id | `rehab-physio` |
| label | Rehab / Physiotherapy |
| route | `/rehab` |
| aliases | `/physiotherapy`, `/physical-therapy`, `/rehabilitation` |
| icon | ` Accessibility` |
| section | INTERVENTIONS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Physical rehabilitation programs and physiotherapy plans |
| keywords | rehab, physiotherapy, physical, therapy, exercise, movement, pt |

---

**Item 17: Nutrition & Metabolic**
| Field | Value |
|-------|-------|
| id | `nutrition-metabolic` |
| label | Nutrition & Metabolic |
| route | `/nutrition` |
| aliases | `/nutrition-metabolic`, `/diet`, `/metabolic` |
| icon | `heart-pulse` |
| section | INTERVENTIONS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Nutritional assessment and metabolic intervention planning |
| keywords | nutrition, diet, metabolic, food, supplements, wellness |

---

**Item 18: Wellness & Lifestyle**
| Field | Value |
|-------|-------|
| id | `wellness-lifestyle` |
| label | Wellness & Lifestyle |
| route | `/wellness` |
| aliases | `/lifestyle`, `/wellness-hub` |
| icon | `heart` |
| section | INTERVENTIONS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Holistic wellness, lifestyle interventions, and self-management |
| keywords | wellness, lifestyle, holistic, self-care, mindfulness, stress |

---

**Item 19: Complementary Interventions**
| Field | Value |
|-------|-------|
| id | `complementary-interventions` |
| label | Complementary Interventions |
| route | `/complementary` |
| aliases | `/complementary`, `/integrative`, `/alternative` |
| icon | `sparkles` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | COMING_SOON |
| description | Integrative and complementary therapy options |
| keywords | complementary, integrative, alternative, holistic, cam |

---

**Item 20: Handbooks**
| Field | Value |
|-------|-------|
| id | `handbooks-v2` |
| label | Handbooks |
| route | `/handbooks` |
| aliases | `/handbooks-v2`, `/clinical-guides`, `/reference` |
| icon | `book-open` |
| section | INTERVENTIONS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Clinical handbooks, reference guides, and protocols |
| keywords | handbooks, guides, reference, clinical, manuals, sop |

---

**Item 21: Home Program**
| Field | Value |
|-------|-------|
| id | `home-program` |
| label | Home Program |
| route | `/home-program` |
| aliases | `/home-program`, `/home-tasks`, `/remote-program` |
| icon | `scroll-text` |
| section | INTERVENTIONS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Remote patient home programs, exercises, and task assignments |
| keywords | home, remote, exercises, tasks, program, assignments, distance |

---

**Item 22: Outcome Measures**
| Field | Value |
|-------|-------|
| id | `outcome-measures` |
| label | Outcome Measures |
| route | `/outcomes` |
| aliases | `/outcome-measures`, `/results`, `/measures` |
| icon | `bar-chart-2` |
| section | INTERVENTIONS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Track patient-reported outcomes and clinical response metrics |
| keywords | outcomes, results, measures, response, progress, tracking, proms |

---

**Item 23: Group Therapy**
| Field | Value |
|-------|-------|
| id | `group-therapy` |
| label | Group Therapy |
| route | `/group-therapy` |
| aliases | `/group-therapy`, `/groups`, `/cohort-sessions` |
| icon | `users` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | COMING_SOON |
| description | Group therapy session planning, scheduling, and cohort management |
| keywords | group, therapy, cohort, sessions, collective, peer |

---

**Item 24: Surgical Planning**
| Field | Value |
|-------|-------|
| id | `surgical-planning` |
| label | Surgical Planning |
| route | `/surgical-planning` |
| aliases | `/surgical-planning`, `/surgery`, `/operative` |
| icon | `cone` |
| section | INTERVENTIONS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | COMING_SOON |
| description | Pre-operative planning and surgical intervention workflows |
| keywords | surgical, surgery, operative, planning, pre-op, invasive |

---

**Item 25: Research Evidence**
| Field | Value |
|-------|-------|
| id | `research-evidence` |
| label | Research Evidence |
| route | `/evidence` |
| aliases | `/research-evidence`, `/evidence-base`, `/literature` |
| icon | `microscope` |
| section | INTERVENTIONS |
| requiredRoles | RESEARCHER (5 roles) |
| status | ACTIVE |
| description | Evidence-based research, literature reviews, and clinical trials |
| keywords | research, evidence, literature, trials, studies, papers |
| ai | Yes |

---

#### ANALYZERS Section (24 items)

---

**Item 26: Risk Analyzer**
| Field | Value |
|-------|-------|
| id | `risk-analyzer` |
| label | Risk Analyzer |
| route | `/analyzers/risk` |
| aliases | `/risk-analyzer`, `/risk-triage`, `/safety` |
| icon | `shield-alert` |
| section | ANALYZERS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Clinical risk stratification and safety triage |
| keywords | risk, safety, triage, stratification, screening, flags |
| ai | Yes |

---

**Item 27: Biomarkers**
| Field | Value |
|-------|-------|
| id | `biomarkers` |
| label | Biomarkers |
| route | `/analyzers/biomarkers` |
| aliases | `/biomarkers`, `/bio-markers` |
| icon | `dna` |
| section | ANALYZERS |
| requiredRoles | RESEARCHER (5 roles) |
| status | ACTIVE |
| description | Biomarker analysis and reference ranges |
| keywords | biomarkers, biological, markers, lab, blood, genetic |

---

**Item 28: Biometrics Analyzer**
| Field | Value |
|-------|-------|
| id | `wearables` |
| label | Biometrics Analyzer |
| route | `/analyzers/biometrics` |
| aliases | `/wearables`, `/biometrics`, `/wearable-data` |
| icon | `activity` |
| section | ANALYZERS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Wearable device data analysis (HRV, sleep, activity) |
| keywords | wearables, biometrics, hrv, sleep, activity, fitness, tracker |
| ai | Yes |

---

**Item 29: Labs Analyzer**
| Field | Value |
|-------|-------|
| id | `labs-analyzer` |
| label | Labs Analyzer |
| route | `/analyzers/labs` |
| aliases | `/labs-analyzer`, `/lab-results`, `/laboratory` |
| icon | `flask-conical` |
| section | ANALYZERS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Laboratory result analysis and trend visualization |
| keywords | labs, laboratory, bloodwork, results, panel, cbc, metabolic |
| ai | Yes |

---

**Item 30: Nutrition Analyzer**
| Field | Value |
|-------|-------|
| id | `nutrition-analyzer` |
| label | Nutrition Analyzer |
| route | `/analyzers/nutrition` |
| aliases | `/nutrition-analyzer`, `/diet-analysis` |
| icon | `heart-pulse` |
| section | ANALYZERS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Nutritional intake analysis and dietary pattern detection |
| keywords | nutrition, diet, food, intake, analysis, dietary |
| ai | Yes |

---

**Item 31: Bio Database**
| Field | Value |
|-------|-------|
| id | `bio-database` |
| label | Bio Database |
| route | `/analyzers/bio-db` |
| aliases | `/bio-database`, `/bio-db`, `/biological-data` |
| icon | `database` |
| section | ANALYZERS |
| requiredRoles | RESEARCHER (5 roles) |
| status | BETA |
| description | Biological reference database and normative data |
| keywords | database, reference, normative, biological, catalog |
| ai | Yes |

---

**Item 32: Intervention Analyzer**
| Field | Value |
|-------|-------|
| id | `treatment-sessions-analyzer` |
| label | Intervention Analyzer |
| route | `/analyzers/intervention` |
| aliases | `/treatment-sessions-analyzer`, `/sessions-analyzer`, `/intervention` |
| icon | `bar-chart-3` |
| section | ANALYZERS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Treatment session analysis and outcome tracking |
| keywords | sessions, intervention, treatment, outcomes, response, analysis |
| ai | Yes |

---

**Item 33: Voice Analyzer**
| Field | Value |
|-------|-------|
| id | `voice-analyzer` |
| label | Voice Analyzer |
| route | `/analyzers/voice` |
| aliases | `/voice-analyzer`, `/speech`, `/audio` |
| icon | `mic` |
| section | ANALYZERS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Voice biomarker analysis for mood and cognitive assessment |
| keywords | voice, speech, audio, acoustic, prosody, vocal |
| ai | Yes |

---

**Item 34: Text Analyzer**
| Field | Value |
|-------|-------|
| id | `text-analyzer` |
| label | Text Analyzer |
| route | `/analyzers/text` |
| aliases | `/text-analyzer`, `/nlp`, `/clinical-text` |
| icon | `align-left` |
| section | ANALYZERS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Clinical text analysis and NLP processing |
| keywords | text, nlp, language, clinical, notes, documentation |
| ai | Yes |

---

**Item 35: Video Assessments**
| Field | Value |
|-------|-------|
| id | `video-assessments` |
| label | Video Assessments |
| route | `/analyzers/video` |
| aliases | `/video-assessments`, `/video-analysis` |
| icon | `scan-eye` |
| section | ANALYZERS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Video-based behavioral and motor assessment analysis |
| keywords | video, assessment, behavioral, motor, observation, camera |
| ai | Yes |

---

**Item 36: Movement Analyzer**
| Field | Value |
|-------|-------|
| id | `movement-analyzer` |
| label | Movement Analyzer |
| route | `/analyzers/movement` |
| aliases | `/movement-analyzer`, `/motion`, `/gait` |
| icon | `move` |
| section | ANALYZERS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Movement pattern analysis and motor assessment |
| keywords | movement, motion, gait, motor, kinematics, walk |
| ai | Yes |

---

**Item 37: Digital Phenotyping**
| Field | Value |
|-------|-------|
| id | `digital-phenotyping-analyzer` |
| label | Digital Phenotyping |
| route | `/analyzers/phenotyping` |
| aliases | `/digital-phenotyping-analyzer`, `/phenotyping`, `/digital-behavior` |
| icon | `smartphone` |
| section | ANALYZERS |
| requiredRoles | RESEARCHER (5 roles) |
| status | BETA |
| description | Digital behavior pattern analysis from smartphone sensors |
| keywords | phenotyping, digital, behavior, smartphone, passive, sensing |
| ai | Yes |

---

**Item 38: Behaviour Workspace**
| Field | Value |
|-------|-------|
| id | `behaviour` |
| label | Behaviour Workspace |
| route | `/analyzers/behaviour` |
| aliases | `/behaviour`, `/behavior`, `/behavioral-analysis` |
| icon | `puzzle` |
| section | ANALYZERS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Comprehensive behavioral analysis workspace |
| keywords | behavior, behaviour, analysis, workspace, patterns, actions |
| ai | Yes |

---

**Item 39: MRI Analyzer**
| Field | Value |
|-------|-------|
| id | `mri-analysis` |
| label | MRI Analyzer |
| route | `/analyzers/mri` |
| aliases | `/mri-analysis`, `/mri`, `/neuroimaging` |
| icon | `scan` |
| section | ANALYZERS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | MRI neuroimaging analysis and structural assessment |
| keywords | mri, neuroimaging, brain, structural, imaging, scan |
| ai | Yes |

---

**Item 40: qEEG Analyzer**
| Field | Value |
|-------|-------|
| id | `qeeg-launcher` |
| label | qEEG Analyzer |
| route | `/analyzers/qeeg` |
| aliases | `/qeeg-launcher`, `/qeeg`, `/eeg`, `/quantitative-eeg` |
| icon | `activity-pulse` |
| section | ANALYZERS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Quantitative EEG analysis and brain mapping |
| keywords | qeeg, eeg, brainwaves, electroencephalography, quantitative |
| ai | Yes |

---

**Item 41: Genetic Medication Analyzer**
| Field | Value |
|-------|-------|
| id | `medication-analyzer` |
| label | Genetic Medication Analyzer |
| route | `/analyzers/medication` |
| aliases | `/medication-analyzer`, `/pharmacogenomics`, `/drug-analysis` |
| icon | `pill` |
| section | ANALYZERS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Medication response analysis and pharmacogenomic insights |
| keywords | medication, pharmacogenomics, drug, response, genetic, pharma |
| ai | Yes |

---

**Item 42: Phenotype Analyzer**
| Field | Value |
|-------|-------|
| id | `phenotype-analyzer` |
| label | Phenotype Analyzer |
| route | `/analyzers/phenotype` |
| aliases | `/phenotype-analyzer`, `/clinical-phenotype` |
| icon | `git-branch` |
| section | ANALYZERS |
| requiredRoles | RESEARCHER (5 roles) |
| status | BETA |
| description | Clinical phenotype classification and subtype analysis |
| keywords | phenotype, subtype, classification, clustering, profile |
| ai | Yes |

---

**Item 43: DeepTwin Insights**
| Field | Value |
|-------|-------|
| id | `deeptwin-insights` |
| label | DeepTwin Insights |
| route | `/analyzers/deeptwin-insights` |
| aliases | `/deeptwin-insights`, `/twin-analyzer` |
| icon | `atom` |
| section | ANALYZERS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | PREVIEW |
| description | DeepTwin digital twin analysis and patient-specific insights |
| keywords | deeptwin, digital twin, simulation, model, patient-specific |
| ai | Yes |

---

**Item 44: Genomic Analyzer**
| Field | Value |
|-------|-------|
| id | `genomic-analyzer` |
| label | Genomic Analyzer |
| route | `/analyzers/genomic` |
| aliases | `/genomic-analyzer`, `/genomics`, `/genetics` |
| icon | `dna` |
| section | ANALYZERS |
| requiredRoles | RESEARCHER (5 roles) |
| status | PREVIEW |
| description | Genomic variant analysis and polygenic risk scoring |
| keywords | genomic, genetics, dna, variants, polygenic, sequencing |
| ai | Yes |

---

**Item 45: fNIRS Analyzer**
| Field | Value |
|-------|-------|
| id | `fnirs-analyzer` |
| label | fNIRS Analyzer |
| route | `/analyzers/fnirs` |
| aliases | `/fnirs-analyzer`, `/fnirs`, `/nirs` |
| icon | `radar` |
| section | ANALYZERS |
| requiredRoles | RESEARCHER (5 roles) |
| status | BETA |
| description | Functional near-infrared spectroscopy analysis |
| keywords | fnirs, nirs, spectroscopy, hemodynamic, cortex, oxygenation |
| ai | Yes |

---

**Item 46: PET Analyzer**
| Field | Value |
|-------|-------|
| id | `pet-analyzer` |
| label | PET Analyzer |
| route | `/analyzers/pet` |
| aliases | `/pet-analyzer`, `/pet`, `/positron` |
| icon | `atom` |
| section | ANALYZERS |
| requiredRoles | RESEARCHER (5 roles) |
| status | COMING_SOON |
| description | PET imaging analysis and metabolic tracer assessment |
| keywords | pet, positron, metabolic, tracer, neuroimaging, glucose |
| ai | Yes |

---

**Item 47: Neurophysiology**
| Field | Value |
|-------|-------|
| id | `neurophysiology-analyzer` |
| label | Neurophysiology |
| route | `/analyzers/neurophysiology` |
| aliases | `/neurophysiology-analyzer`, `/neurophysiology`, `/ephys` |
| icon | `activity-pulse` |
| section | ANALYZERS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | COMING_SOON |
| description | Electrophysiology analysis including ERP and evoked potentials |
| keywords | neurophysiology, ephys, erp, potentials, evoked, electrical |
| ai | Yes |

---

**Item 48: Sleep Analyzer**
| Field | Value |
|-------|-------|
| id | `sleep-analyzer` |
| label | Sleep Analyzer |
| route | `/analyzers/sleep` |
| aliases | `/sleep-analyzer`, `/sleep`, `/polysomnography` |
| icon | `timer` |
| section | ANALYZERS |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | BETA |
| description | Sleep architecture analysis and polysomnography review |
| keywords | sleep, polysomnography, psg, architecture, rem, stages |
| ai | Yes |

---

**Item 49: Cognitive Analyzer**
| Field | Value |
|-------|-------|
| id | `cognitive-analyzer` |
| label | Cognitive Analyzer |
| route | `/analyzers/cognitive` |
| aliases | `/cognitive-analyzer`, `/cognition`, `/neuropsych` |
| icon | `brain` |
| section | ANALYZERS |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | BETA |
| description | Cognitive assessment analysis and neuropsychological profiling |
| keywords | cognitive, cognition, neuropsych, memory, attention, executive |
| ai | Yes |


---

#### INTELLIGENCE Section (10 items)

---

**Item 50: DeepTwin**
| Field | Value |
|-------|-------|
| id | `deeptwin` |
| label | DeepTwin |
| route | `/intelligence/deeptwin` |
| aliases | `/deeptwin`, `/digital-twin`, `/brain-twin` |
| icon | `atom` |
| section | INTELLIGENCE |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Patient digital twin for multimodal data synthesis and simulation |
| keywords | deeptwin, digital twin, synthesis, simulation, multimodal, ai |
| ai | Yes |

---

**Item 51: Evidence Research**
| Field | Value |
|-------|-------|
| id | `evidence-research` |
| label | Evidence Research |
| route | `/intelligence/evidence` |
| aliases | `/evidence-research`, `/evidence-search`, `/literature-review` |
| icon | `microscope` |
| section | INTELLIGENCE |
| requiredRoles | RESEARCHER (5 roles) |
| status | ACTIVE |
| description | AI-powered evidence search and literature synthesis |
| keywords | evidence, research, literature, search, synthesis, review |
| ai | Yes |

---

**Item 52: Longitudinal Insights**
| Field | Value |
|-------|-------|
| id | `longitudinal-insights` |
| label | Longitudinal Insights |
| route | `/intelligence/longitudinal` |
| aliases | `/longitudinal-insights`, `/trajectory`, `/progress` |
| icon | `trending-up` |
| section | INTELLIGENCE |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | ACTIVE |
| description | Long-term patient trajectory analysis and progression tracking |
| keywords | longitudinal, trajectory, progression, timeline, history, trends |
| ai | Yes |

---

**Item 53: AI Clinical Intelligence**
| Field | Value |
|-------|-------|
| id | `ai-clinical-intelligence` |
| label | AI Clinical Intelligence |
| route | `/intelligence/ai-clinical` |
| aliases | `/ai-clinical-intelligence`, `/clinical-ai`, `/decision-support` |
| icon | `brain` |
| section | INTELLIGENCE |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | BETA |
| description | AI-powered clinical decision support and differential analysis |
| keywords | ai, clinical, intelligence, decision, support, differential |
| ai | Yes |

---

**Item 54: Multimodal Correlations**
| Field | Value |
|-------|-------|
| id | `multimodal-correlations` |
| label | Multimodal Correlations |
| route | `/intelligence/correlations` |
| aliases | `/multimodal-correlations`, `/correlation`, `/fusion` |
| icon | `network` |
| section | INTELLIGENCE |
| requiredRoles | RESEARCHER (5 roles) |
| status | PREVIEW |
| description | Cross-modality correlation discovery and data fusion |
| keywords | multimodal, correlation, fusion, cross-modal, integration |
| ai | Yes |

---

**Item 55: Forecast & Simulation**
| Field | Value |
|-------|-------|
| id | `forecast-simulation` |
| label | Forecast & Simulation |
| route | `/intelligence/forecast` |
| aliases | `/forecast-simulation`, `/prediction`, `/simulation` |
| icon | `radar` |
| section | INTELLIGENCE |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | PREVIEW |
| description | Predictive forecasting and clinical scenario simulation |
| keywords | forecast, prediction, simulation, modeling, scenario, future |
| ai | Yes |

---

**Item 56: Knowledge Graph**
| Field | Value |
|-------|-------|
| id | `knowledge-graph` |
| label | Knowledge Graph |
| route | `/intelligence/knowledge-graph` |
| aliases | `/knowledge-graph`, `/kg`, `/ontology-graph` |
| icon | `network` |
| section | INTELLIGENCE |
| requiredRoles | RESEARCHER (5 roles) |
| status | PREVIEW |
| description | Clinical knowledge graph exploration and relationship mapping |
| keywords | knowledge, graph, ontology, relationships, entities, connected |
| ai | Yes |

---

**Item 57: Trial Matcher**
| Field | Value |
|-------|-------|
| id | `trial-matcher` |
| label | Trial Matcher |
| route | `/intelligence/trial-matcher` |
| aliases | `/trial-matcher`, `/clinical-trials`, `/matching` |
| icon | `microscope` |
| section | INTELLIGENCE |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | PREVIEW |
| description | AI-powered clinical trial matching for patients |
| keywords | trials, clinical, matching, enrollment, eligibility, recruitment |
| ai | Yes |

---

**Item 58: Population Analytics**
| Field | Value |
|-------|-------|
| id | `population-analytics` |
| label | Population Analytics |
| route | `/intelligence/population` |
| aliases | `/population-analytics`, `/population`, `/cohort` |
| icon | `bar-chart-2` |
| section | INTELLIGENCE |
| requiredRoles | ADMIN_ONLY (3 roles) |
| status | ACTIVE |
| description | Population-level analytics and cohort comparison studies |
| keywords | population, cohort, analytics, epidemiology, public health |
| ai | Yes |

---

**Item 59: Research Datasets**
| Field | Value |
|-------|-------|
| id | `research-datasets` |
| label | Research Datasets |
| route | `/intelligence/datasets` |
| aliases | `/research-datasets`, `/datasets`, `/data-repository` |
| icon | `database` |
| section | INTELLIGENCE |
| requiredRoles | SUPER_ONLY (2 roles) |
| status | BETA |
| description | Curated research datasets and data export tools |
| keywords | datasets, research, data, export, repository, download |

---

#### ECOSYSTEM Section (6 items)

---

**Item 60: AI Agents**
| Field | Value |
|-------|-------|
| id | `ai-agent-v2` |
| label | AI Agents |
| route | `/ecosystem/agents` |
| aliases | `/ai-agent-v2`, `/agents`, `/ai-assistants` |
| icon | `bot` |
| section | ECOSYSTEM |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | AI agents and assistants for clinical workflow automation |
| keywords | ai, agents, assistants, automation, workflow, bot |
| ai | Yes |

---

**Item 61: Marketplace**
| Field | Value |
|-------|-------|
| id | `marketplace` |
| label | Marketplace |
| route | `/ecosystem/marketplace` |
| aliases | `/marketplace`, `/store`, `/apps` |
| icon | `shopping-cart` |
| section | ECOSYSTEM |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Clinical apps, integrations, and third-party tools |
| keywords | marketplace, store, apps, integrations, tools, plugins |

---

**Item 62: Academy**
| Field | Value |
|-------|-------|
| id | `academy` |
| label | Academy |
| route | `/ecosystem/academy` |
| aliases | `/academy`, `/training`, `/courses`, `/learning` |
| icon | `graduation-cap` |
| section | ECOSYSTEM |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Training courses, certifications, and clinical education |
| keywords | academy, training, courses, learning, education, certification |

---

**Item 63: Referral Network**
| Field | Value |
|-------|-------|
| id | `referral-network` |
| label | Referral Network |
| route | `/ecosystem/referrals` |
| aliases | `/referral-network`, `/referrals`, `/network` |
| icon | `network` |
| section | ECOSYSTEM |
| requiredRoles | CLINICIAN_PLUS (4 roles) |
| status | BETA |
| description | External referral network and specialist consultation hub |
| keywords | referral, network, specialist, consultation, external, partners |

---

**Item 64: Insurance Portal**
| Field | Value |
|-------|-------|
| id | `insurance-portal` |
| label | Insurance Portal |
| route | `/ecosystem/insurance` |
| aliases | `/insurance-portal`, `/insurance`, `/billing-portal` |
| icon | `umbrella` |
| section | ECOSYSTEM |
| requiredRoles | RECEPTIONIST (4 roles) |
| status | ACTIVE |
| description | Insurance verification, prior authorization, and claims portal |
| keywords | insurance, claims, verification, authorization, coverage, billing |

---

**Item 65: Monitor**
| Field | Value |
|-------|-------|
| id | `monitor` |
| label | Monitor |
| route | `/ecosystem/monitor` |
| aliases | `/monitor`, `/system-health`, `/status` |
| icon | `activity-pulse` |
| section | ECOSYSTEM |
| requiredRoles | ADMIN_ONLY (3 roles) |
| status | ACTIVE |
| description | System health monitoring and operational dashboards |
| keywords | monitor, health, status, system, operations, uptime |

---

#### ADMIN Section (9 items)

---

**Item 66: Reports**
| Field | Value |
|-------|-------|
| id | `reports-v2` |
| label | Reports |
| route | `/admin/reports` |
| aliases | `/reports-v2`, `/reporting`, `/analytics` |
| icon | `bar-chart-2` |
| section | ADMIN |
| requiredRoles | ADMIN_ONLY (3 roles) |
| status | ACTIVE |
| description | Clinical reports, analytics, and population insights |
| keywords | reports, analytics, population, insights, metrics, dashboards |

---

**Item 67: Finance**
| Field | Value |
|-------|-------|
| id | `finance-v2` |
| label | Finance |
| route | `/admin/finance` |
| aliases | `/finance-v2`, `/billing`, `/revenue` |
| icon | `coins` |
| section | ADMIN |
| requiredRoles | ADMIN_ONLY (3 roles) |
| status | ACTIVE |
| description | Financial management, billing, and revenue tracking |
| keywords | finance, billing, revenue, payments, invoicing, money |

---

**Item 68: Data Console**
| Field | Value |
|-------|-------|
| id | `data-console` |
| label | Data Console |
| route | `/admin/data-console` |
| aliases | `/data-console`, `/data`, `/tables` |
| icon | `table-2` |
| section | ADMIN |
| requiredRoles | ADMIN_ONLY (3 roles) |
| status | ACTIVE |
| description | Data exploration console for clinical datasets |
| keywords | data, console, tables, exploration, query, database |

---

**Item 69: Audit Trail**
| Field | Value |
|-------|-------|
| id | `audit-trail` |
| label | Audit Trail |
| route | `/admin/audit` |
| aliases | `/audit-trail`, `/audit`, `/logs` |
| icon | `clipboard-list` |
| section | ADMIN |
| requiredRoles | SUPER_ONLY (2 roles) |
| status | ACTIVE |
| description | Comprehensive audit trail of all system activities |
| keywords | audit, trail, logs, compliance, history, activity |

---

**Item 70: Consent & Governance**
| Field | Value |
|-------|-------|
| id | `consent-governance` |
| label | Consent & Governance |
| route | `/admin/consent` |
| aliases | `/consent-governance`, `/consent`, `/governance`, `/irb` |
| icon | `lock` |
| section | ADMIN |
| requiredRoles | ADMIN_ONLY (3 roles) |
| status | ACTIVE |
| description | Patient consent management and research governance |
| keywords | consent, governance, compliance, irb, ethics, privacy |

---

**Item 71: Device Management**
| Field | Value |
|-------|-------|
| id | `device-management` |
| label | Device Management |
| route | `/admin/devices` |
| aliases | `/device-management`, `/devices`, `/equipment` |
| icon | `cpu` |
| section | ADMIN |
| requiredRoles | ADMIN_ONLY (3 roles) |
| status | ACTIVE |
| description | Medical device inventory, maintenance, and calibration |
| keywords | devices, equipment, inventory, calibration, maintenance, hardware |

---

**Item 72: User & Clinic Management**
| Field | Value |
|-------|-------|
| id | `user-clinic-management` |
| label | User & Clinic Management |
| route | `/admin/users` |
| aliases | `/user-clinic-management`, `/users`, `/clinic`, `/staff` |
| icon | `users-cog` |
| section | ADMIN |
| requiredRoles | SUPER_ONLY (2 roles) |
| status | ACTIVE |
| description | User accounts, roles, clinic configuration, and staff management |
| keywords | users, clinic, staff, management, roles, permissions, admin |

---

**Item 73: Research Datasets (Admin)**
| Field | Value |
|-------|-------|
| id | `admin-research-datasets` |
| label | Research Datasets |
| route | `/admin/research-datasets` |
| aliases | `/admin-research-datasets`, `/admin-datasets` |
| icon | `database` |
| section | ADMIN |
| requiredRoles | SUPER_ONLY (2 roles) |
| status | BETA |
| description | Research dataset curation, export, and governance |
| keywords | datasets, research, export, curation, data, repository |

---

**Item 74: Support Tickets**
| Field | Value |
|-------|-------|
| id | `tickets` |
| label | Support Tickets |
| route | `/admin/tickets` |
| aliases | `/tickets`, `/support`, `/helpdesk` |
| icon | `ticket` |
| section | ADMIN |
| requiredRoles | ALL_CLINICAL (7 roles) |
| status | ACTIVE |
| description | Support tickets, helpdesk, and technical issue tracking |
| keywords | tickets, support, helpdesk, issues, bugs, requests |

---

## Role Matrix

### Role Definitions

| # | Role ID | Display Name | Description |
|---|---------|-------------|-------------|
| 1 | `patient` | Patient | Patient portal access only |
| 2 | `receptionist` | Receptionist | Scheduling, billing, front-desk |
| 3 | `clinician` | Clinician | Primary clinical staff |
| 4 | `reviewer` | Reviewer | Clinical review and QA |
| 5 | `technician` | Technician | Equipment and data acquisition |
| 6 | `resident` | Resident | Training clinical staff |
| 7 | `clinic_admin` | Clinic Admin | Clinic operations and management |
| 8 | `researcher` | Researcher | Research and evidence analysis |
| 9 | `supervisor` | Super Admin | System-level administration |
| 10 | `admin` | Internal | DeepSynaps internal staff |

### Role Groups

| Group | Roles | Description |
|-------|-------|-------------|
| ALL_CLINICAL | clinician, resident, reviewer, technician, clinic_admin, supervisor, admin | All clinical staff |
| CLINICIAN_PLUS | clinician, clinic_admin, supervisor, admin | Clinical decision-makers |
| ADMIN_ONLY | clinic_admin, supervisor, admin | Clinic operations |
| SUPER_ONLY | supervisor, admin | System administration |
| PATIENT | patient | Patient portal |
| RECEPTIONIST | receptionist, clinic_admin, supervisor, admin | Front-desk staff |
| RESEARCHER | researcher, clinician, clinic_admin, supervisor, admin | Research collaborators |

### Complete Visibility Matrix: 10 Roles x 74 Items

#### TODAY Section Visibility

| Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | supervisor | admin |
|------|---------|-------------|-----------|----------|------------|----------|-------------|------------|------------|-------|
| dashboard | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| inbox | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| clinician-digest | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| schedule-v2 | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| quick-actions | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| adherence-hub | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| wellness-hub | - | - | Y | Y | Y | Y | Y | - | Y | Y |

**Visible count per role**: Clinician/Reviewer/Technician/Resident = 7 | Clinic Admin/Super Admin/Internal = 7 | Researcher = 0 | Receptionist = 0 | Patient = 0

#### PATIENTS Section Visibility

| Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | supervisor | admin |
|------|---------|-------------|-----------|----------|------------|----------|-------------|------------|------------|-------|
| patients-v2 | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| assessments-v2 | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| documents-v2 | - | - | - | - | - | - | Y | - | Y | Y |
| live-session | - | - | - | - | - | - | Y | - | Y | Y |
| patient-timeline | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| patient-goals | - | - | Y | Y | Y | Y | Y | - | Y | Y |

**Visible count per role**: Clinician/Reviewer/Technician/Resident = 5 | Clinic Admin/Super Admin/Internal = 6 | Researcher = 0 | Receptionist = 0 | Patient = 0

#### INTERVENTIONS Section Visibility

| Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | supervisor | admin |
|------|---------|-------------|-----------|----------|------------|----------|-------------|------------|------------|-------|
| protocol-studio | - | - | - | - | - | - | Y | - | Y | Y |
| protocol-builder | - | - | - | - | - | - | Y | - | Y | Y |
| brainmap-v2 | - | - | - | - | - | - | Y | - | Y | Y |
| stimulation-targets | - | - | - | - | - | - | Y | - | Y | Y |
| device-planning | - | - | - | - | - | - | Y | - | Y | Y |
| session-planning | - | - | - | - | - | - | Y | - | Y | Y |
| protocol-deeptwin-sim | - | - | - | - | - | - | Y | - | Y | Y |
| medication-studio | - | - | - | - | - | - | Y | - | Y | Y |
| rehab-physio | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| nutrition-metabolic | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| wellness-lifestyle | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| complementary-interventions | - | - | - | - | - | - | Y | - | Y | Y |
| handbooks-v2 | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| home-program | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| outcome-measures | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| group-therapy | - | - | - | - | - | - | Y | - | Y | Y |
| surgical-planning | - | - | - | - | - | - | Y | - | Y | Y |
| research-evidence | - | - | - | - | - | - | Y | Y | Y | Y |

**Visible count per role**: Clinician/Reviewer/Technician/Resident = 6 | Clinic Admin/Super Admin/Internal = 18 | Researcher = 1

#### ANALYZERS Section Visibility

| Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | supervisor | admin |
|------|---------|-------------|-----------|----------|------------|----------|-------------|------------|------------|-------|
| risk-analyzer | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| biomarkers | - | - | - | - | - | - | Y | Y | Y | Y |
| wearables | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| labs-analyzer | - | - | - | - | - | - | Y | - | Y | Y |
| nutrition-analyzer | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| bio-database | - | - | - | - | - | - | Y | Y | Y | Y |
| intervention-analyzer | - | - | - | - | - | - | Y | - | Y | Y |
| voice-analyzer | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| text-analyzer | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| video-assessments | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| movement-analyzer | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| digital-phenotyping | - | - | - | - | - | - | Y | Y | Y | Y |
| behaviour | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| mri-analysis | - | - | - | - | - | - | Y | - | Y | Y |
| qeeg-launcher | - | - | - | - | - | - | Y | - | Y | Y |
| medication-analyzer | - | - | - | - | - | - | Y | - | Y | Y |
| phenotype-analyzer | - | - | - | - | - | - | Y | Y | Y | Y |
| deeptwin-insights | - | - | - | - | - | - | Y | - | Y | Y |
| genomic-analyzer | - | - | - | - | - | - | Y | Y | Y | Y |
| fnirs-analyzer | - | - | - | - | - | - | Y | Y | Y | Y |
| pet-analyzer | - | - | - | - | - | - | Y | Y | Y | Y |
| neurophysiology | - | - | - | - | - | - | Y | - | Y | Y |
| sleep-analyzer | - | - | - | - | - | - | Y | - | Y | Y |
| cognitive-analyzer | - | - | Y | Y | Y | Y | Y | - | Y | Y |

**Visible count per role**: Clinician/Reviewer/Technician/Resident = 9 | Clinic Admin/Super Admin/Internal = 24 | Researcher = 9

#### INTELLIGENCE Section Visibility

| Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | supervisor | admin |
|------|---------|-------------|-----------|----------|------------|----------|-------------|------------|------------|-------|
| deeptwin | - | - | - | - | - | - | Y | - | Y | Y |
| evidence-research | - | - | - | - | - | - | Y | Y | Y | Y |
| longitudinal-insights | - | - | - | - | - | - | Y | - | Y | Y |
| ai-clinical-intelligence | - | - | - | - | - | - | Y | - | Y | Y |
| multimodal-correlations | - | - | - | - | - | - | Y | Y | Y | Y |
| forecast-simulation | - | - | - | - | - | - | Y | - | Y | Y |
| knowledge-graph | - | - | - | - | - | - | Y | Y | Y | Y |
| trial-matcher | - | - | - | - | - | - | Y | - | Y | Y |
| population-analytics | - | - | - | - | - | - | Y | - | Y | Y |
| research-datasets | - | - | - | - | - | - | - | - | Y | Y |

**Visible count per role**: Clinic Admin = 8 | Super Admin/Internal = 10 | Researcher = 3 | Others = 0

#### ECOSYSTEM Section Visibility

| Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | supervisor | admin |
|------|---------|-------------|-----------|----------|------------|----------|-------------|------------|------------|-------|
| ai-agent-v2 | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| marketplace | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| academy | - | - | Y | Y | Y | Y | Y | - | Y | Y |
| referral-network | - | - | - | - | - | - | Y | - | Y | Y |
| insurance-portal | - | Y | - | - | - | - | Y | - | Y | Y |
| monitor | - | - | - | - | - | - | Y | - | Y | Y |

**Visible count per role**: Clinician/Reviewer/Technician/Resident = 3 | Clinic Admin/Super Admin/Internal = 6 | Receptionist = 1 | Researcher = 0

#### ADMIN Section Visibility

| Item | patient | receptionist | clinician | reviewer | technician | resident | clinic_admin | researcher | supervisor | admin |
|------|---------|-------------|-----------|----------|------------|----------|-------------|------------|------------|-------|
| reports-v2 | - | - | - | - | - | - | Y | - | Y | Y |
| finance-v2 | - | - | - | - | - | - | Y | - | Y | Y |
| data-console | - | - | - | - | - | - | Y | - | Y | Y |
| audit-trail | - | - | - | - | - | - | - | - | Y | Y |
| consent-governance | - | - | - | - | - | - | Y | - | Y | Y |
| device-management | - | - | - | - | - | - | Y | - | Y | Y |
| user-clinic-management | - | - | - | - | - | - | - | - | Y | Y |
| admin-research-datasets | - | - | - | - | - | - | - | - | Y | Y |
| tickets | - | - | Y | Y | Y | Y | Y | - | Y | Y |

**Visible count per role**: Clinic Admin = 6 | Super Admin/Internal = 9 | Clinician/Reviewer/Technician/Resident = 1 | Others = 0

### Summary: Total Visible Items Per Role

| Role | TODAY | PATIENTS | INTERVENTIONS | ANALYZERS | INTELLIGENCE | ECOSYSTEM | ADMIN | TOTAL |
|------|-------|----------|---------------|-----------|-------------|-----------|-------|-------|
| Patient | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Receptionist | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 1 |
| Clinician | 7 | 5 | 6 | 9 | 0 | 3 | 1 | 31 |
| Reviewer | 7 | 5 | 6 | 9 | 0 | 3 | 1 | 31 |
| Technician | 7 | 5 | 6 | 9 | 0 | 3 | 1 | 31 |
| Resident | 7 | 5 | 6 | 9 | 0 | 3 | 1 | 31 |
| Clinic Admin | 7 | 6 | 18 | 24 | 8 | 6 | 6 | 75 |
| Researcher | 0 | 0 | 1 | 9 | 3 | 0 | 0 | 13 |
| Super Admin | 7 | 6 | 18 | 24 | 10 | 6 | 9 | 80 |
| Internal | 7 | 6 | 18 | 24 | 10 | 6 | 9 | 80 |

**Key insight**: The role system creates a graduated access model. Front-line clinical staff (clinician, reviewer, technician, resident) see 31 items -- enough for daily work without overwhelming. Clinic admins see 75 items (all top-level items) for full operational oversight. Researchers see 13 specialized items. Super admins see all 80 items (including children). Receptionists see only insurance portal. Patients see nothing (patient portal is separate).

---

## Multimodal Intelligence Flow

### Architecture Overview

```
DATA SOURCES (12 modalities)
         |
         v
   ANALYZERS (24 tools)
         |
         v
   DEEPREVIEW (fusion layer)
         |
         v
   INTERVENTIONS (18 pathways)
         |
         v
    REPORTS (documentation)
         ^
         |
    DEEPDYN (intelligence layer)
         |
    INTELLIGENCE (10 tools)
```

### Data Sources (12 Modalities)

| # | Modality | Analyzer | Data Type | Clinical Signal |
|---|----------|----------|-----------|-----------------|
| 1 | Structural MRI | MRI Analyzer | 3D brain volumes | Anatomy, lesions, atrophy |
| 2 | Quantitative EEG | qEEG Analyzer | Time-series electrical | Brainwave patterns, connectivity |
| 3 | Voice | Voice Analyzer | Audio recordings | Mood, cognition, stress via prosody |
| 4 | Clinical Text | Text Analyzer | Free-text notes | Symptoms, history, observations |
| 5 | Video | Video Assessments | Video recordings | Motor, behavioral, facial markers |
| 6 | Movement | Movement Analyzer | Motion capture | Gait, tremor, coordination |
| 7 | Wearables | Biometrics Analyzer | Continuous streaming | HRV, sleep, activity, SpO2 |
| 8 | Blood Labs | Labs Analyzer | Lab panels | Inflammation, hormones, metabolic |
| 9 | Genetics | Genetic Medication Analyzer | Genetic variants | Drug metabolism, risk scores |
| 10 | Genomics | Genomic Analyzer | Sequencing data | Polygenic risk, variants |
| 11 | fNIRS | fNIRS Analyzer | Hemodynamic response | Cortical oxygenation |
| 12 | Sleep | Sleep Analyzer | Polysomnography | Sleep architecture, disturbances |

### Analyzer Outputs (24 Tools -> Structured Insights)

Each analyzer produces structured output with:
- **Findings**: Clinical observations with confidence scores
- **Trends**: Change over time with direction indicators
- **Alerts**: Anomalous values requiring attention
- **Evidence links**: References to supporting literature
- **Uncertainty tier**: High / Moderate / Low / Insufficient

### DeepReview: The Fusion Layer

DeepReview is the multimodal correlation engine that:

1. **Ingests** outputs from all 24 analyzers
2. **Normalizes** findings into a common semantic representation
3. **Correlates** cross-modal signals (e.g., elevated HRV + qEEG frontal asymmetry + voice prosody changes)
4. **Resolves** conflicts between modalities (e.g., MRI shows no lesion but qEEG shows abnormality)
5. **Generates** unified patient summary with confidence-weighted conclusions

### DeepDyn: The Intelligence Layer

DeepDyn provides continuous intelligence:
- **Hypothesis generation**: Suggests clinical hypotheses from multimodal patterns
- **Contradiction detection**: Flags inconsistent findings across modalities
- **Confidence calibration**: Adjusts confidence based on data quality and agreement
- **Trend prediction**: Forecasts trajectory based on longitudinal patterns

### Intervention Pathways (18 Pathways)

Fused intelligence drives 18 intervention pathways:

| Intervention | Triggering Analyzers | Decision Support |
|-------------|---------------------|-----------------|
| Neuromodulation Protocol | MRI, qEEG, Risk | Target selection, parameter optimization |
| Medication Adjustment | Genetics, Labs, Biomarkers | Pharmacogenomic guidance, monitoring |
| Rehabilitation Program | Movement, Video, Outcomes | Exercise prescription, progress tracking |
| Nutritional Intervention | Nutrition, Labs, Metabolic | Diet planning, supplement guidance |
| Wellness Program | Wearables, Cognitive, Risk | Stress management, sleep hygiene |
| Home Program | All modalities | Remote monitoring, task assignment |
| Group Therapy | Risk, Cognitive, Outcomes | Cohort matching, session planning |
| Surgical Planning | MRI, PET, fNIRS | Pre-operative assessment, target confirmation |

### Evidence Loop

Every intervention recommendation carries:
1. **Evidence grade**: A (systematic review), B (RCT), C (cohort), D (expert opinion)
2. **Uncertainty tier**: High / Moderate / Low / Insufficient confidence
3. **Contradictions**: Flagged disagreements between data sources
4. **Audit trail**: Links to raw data, analysis parameters, and model versions

---

## DeepTwin Architecture

### Overview

DeepTwin is the patient digital twin -- a computational model that synthesizes multimodal patient data into a unified representation. It is the "kernel" of the Clinician OS, sitting between analyzers and interventions.

### 12 Data Sources

DeepTwin ingests from 12 data sources across biological, behavioral, and environmental domains:

| Domain | Sources | Frequency |
|--------|---------|-----------|
| **Neuroimaging** | MRI, qEEG, fNIRS, PET | Per-session / periodic |
| **Physiological** | Wearables (HRV, sleep, activity), Labs, Biomarkers | Continuous / periodic |
| **Behavioral** | Voice, Text, Video, Movement, Digital phenotyping | Per-session / continuous |
| **Genetic** | Pharmacogenomics, Genomic sequencing | Baseline |
| **Clinical** | Assessments, Outcomes, Medication history | Per-session |

### 6 Correlation Methods

DeepTwin uses 6 statistical and ML methods to discover cross-modal relationships:

| # | Method | Purpose | Example |
|---|--------|---------|---------|
| 1 | Pearson/Spearman correlation | Linear monotonic relationships | HRV vs. sleep quality |
| 2 | Canonical correlation analysis (CCA) | Cross-modal pattern matching | qEEG bands vs. voice features |
| 3 | Dynamic time warping (DTW) | Temporal alignment | Medication timing vs. symptom onset |
| 4 | Granger causality | Directional influence | Sleep quality -> next-day HRV |
| 5 | Bayesian network inference | Probabilistic dependency | Biomarker -> cognitive -> functional |
| 6 | Deep multimodal embedding | Nonlinear fusion | All modalities -> patient state vector |

### 7 Hypothesis Patterns

DeepTwin recognizes 7 recurring clinical hypothesis patterns:

| # | Pattern | Description | Modality Combination |
|---|---------|-------------|---------------------|
| 1 | Biological marker -> symptom | Lab/biomarker predicts clinical presentation | Labs + Assessments |
| 2 | Brain state -> behavior | Neuroimaging predicts behavioral output | qEEG/MRI + Voice/Video |
| 3 | Treatment -> response | Intervention causes measurable change | Any pre/post pair |
| 4 | Lifestyle -> clinical | Daily behavior affects clinical outcomes | Wearables + Assessments |
| 5 | Genetic -> treatment response | Genetics predict drug efficacy | Pharmacogenomics + Outcomes |
| 6 | Temporal progression | Condition evolves predictably over time | Longitudinal across all |
| 7 | Multi-domain convergence | Independent modalities agree on finding | Any 3+ modalities |

### 4-Tier Uncertainty Model

Every DeepTwin output carries an uncertainty tier:

| Tier | Confidence | Display | Action |
|------|-----------|---------|--------|
| High | >80% agreement, high data quality | Green indicator | Proceed with confidence |
| Moderate | 50-80% agreement, adequate data | Yellow indicator | Standard clinical review |
| Low | <50% agreement or limited data | Orange indicator | Requires careful review |
| Insufficient | Missing key modalities or data quality issues | Red indicator | Do not rely on; collect more data |

Uncertainty propagation: When combining multiple modalities, uncertainty tiers compound using Bayesian belief updating. A finding supported by High-confidence MRI and Moderate-confidence qEEG results in Moderate overall confidence.

### 5 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/deeptwin/{patientId}` | GET | Retrieve current digital twin state |
| `/api/deeptwin/{patientId}/correlate` | POST | Run cross-modal correlation analysis |
| `/api/deeptwin/{patientId}/hypotheses` | GET | Retrieve active clinical hypotheses |
| `/api/deeptwin/{patientId}/simulate` | POST | Run treatment simulation |
| `/api/deeptwin/{patientId}/timeline` | GET | Retrieve longitudinal trajectory |

### Safety Architecture

| Layer | Mechanism | Description |
|-------|-----------|-------------|
| Input validation | Schema enforcement | All data validated against modality-specific schemas |
| Quality gating | Data completeness checks | Incomplete datasets flagged before analysis |
| Model versioning | Semantic versioning | All models versioned; rollback capability |
| Human-in-the-loop | Clinician review required | All intervention suggestions require clinician approval |
| Audit logging | Immutable audit trail | Every inference logged with inputs, outputs, and model version |
| Override capability | Break-glass access | Emergency override for critical situations |

---

## Analyzer -- Intervention Wiring

### Complete Wiring Map

The wiring map defines which analyzers feed which interventions. This is the clinical decision support graph.

#### Neuromodulation Studio Wiring

| Analyzer | Output Used By | Clinical Decision |
|----------|---------------|-------------------|
| MRI Analyzer | Brain Map Planner | Stimulation target selection |
| qEEG Analyzer | Brain Map Planner | Protocol parameter optimization |
| Risk Analyzer | Protocol Builder | Contraindication screening |
| DeepTwin Insights | DeepTwin Simulation | Response prediction |
| Genetic Medication Analyzer | Protocol Builder | Interaction checking |

#### Medication Studio Wiring

| Analyzer | Output Used By | Clinical Decision |
|----------|---------------|-------------------|
| Genetic Medication Analyzer | Medication Studio | Drug selection, dosing |
| Labs Analyzer | Medication Studio | Monitoring, toxicity screening |
| Biomarkers | Medication Studio | Biological response tracking |
| Intervention Analyzer | Medication Studio | Outcome measurement |

#### Rehab / Physiotherapy Wiring

| Analyzer | Output Used By | Clinical Decision |
|----------|---------------|-------------------|
| Movement Analyzer | Rehab Programs | Exercise prescription |
| Video Assessments | Rehab Programs | Form assessment |
| Biometrics Analyzer | Rehab Programs | Recovery monitoring |
| Outcome Measures | Rehab Programs | Progress tracking |

#### Nutrition & Metabolic Wiring

| Analyzer | Output Used By | Clinical Decision |
|----------|---------------|-------------------|
| Nutrition Analyzer | Nutrition Planning | Dietary recommendations |
| Labs Analyzer | Nutrition Planning | Deficiency identification |
| Biomarkers | Nutrition Planning | Metabolic state assessment |

#### Wellness & Lifestyle Wiring

| Analyzer | Output Used By | Clinical Decision |
|----------|---------------|-------------------|
| Biometrics Analyzer | Wellness Programs | Stress, sleep, activity baselines |
| Cognitive Analyzer | Wellness Programs | Cognitive training targeting |
| Risk Analyzer | Wellness Programs | Risk factor identification |
| Voice Analyzer | Wellness Programs | Stress indicator tracking |

#### Surgical Planning Wiring

| Analyzer | Output Used By | Clinical Decision |
|----------|---------------|-------------------|
| MRI Analyzer | Surgical Planning | Anatomical targeting |
| PET Analyzer | Surgical Planning | Metabolic target confirmation |
| fNIRS Analyzer | Surgical Planning | Functional mapping |
| Risk Analyzer | Surgical Planning | Pre-operative risk assessment |

#### Group Therapy Wiring

| Analyzer | Output Used By | Clinical Decision |
|----------|---------------|-------------------|
| Risk Analyzer | Group Matching | Risk stratification for cohort |
| Cognitive Analyzer | Group Matching | Cognitive profile matching |
| Outcome Measures | Group Therapy | Group-level outcome tracking |

### Cross-Cutting Analyzers

Some analyzers support all interventions:

| Analyzer | Universal Role |
|----------|---------------|
| Risk Analyzer | Safety screening for ALL interventions |
| DeepTwin | Response prediction for ALL interventions |
| Outcome Measures | Progress tracking for ALL interventions |
| Longitudinal Insights | Trajectory analysis for ALL interventions |
| Evidence Research | Literature support for ALL interventions |

### Evidence-Linked Decision Support

Every wiring connection carries:
1. **Evidence grade**: Quality of supporting evidence for the analyzer-intervention link
2. **Confidence threshold**: Minimum analyzer confidence required to trigger intervention suggestion
3. **Override requirement**: Whether clinician approval is required (always "yes" for interventions)
4. **Audit requirement**: Whether the decision is logged (always "yes")


---

## Research Foundation

### Overview: 7 Reports, 27,155 Lines

The Clinician OS architecture is built on a foundation of 7 comprehensive research reports spanning UX benchmarking, analyzer-intervention architecture, multimodal wiring, DeepTwin planning, healthcare safety, enterprise IA, and open-source clinical systems. These reports represent approximately 27,155 lines of research, analysis, and documentation.

| # | Report | Lines | Domain | Key Findings |
|---|--------|-------|--------|-------------|
| 1 | DEEPSYNAPS_CLINICIAN_OS_UX_BENCHMARK | 3,005 | UX Research | 12 EHR systems benchmarked; question-based navigation outperforms tool-based by 40% |
| 2 | DEEPSYNAPS_ANALYZER_INTERVENTION_ARCHITECTURE | 3,976 | System Architecture | 24 analyzers mapped to 18 interventions; wiring graph with evidence grades |
| 3 | DEEPSYNAPS_MULTIMODAL_WIRING_MAP | 3,632 | Data Integration | 12 modalities, 6 correlation methods, 7 hypothesis patterns defined |
| 4 | DEEPSYNAPS_DEEPTWIN_ARCHITECTURE_PLAN | 5,115 | AI Architecture | Digital twin with 4-tier uncertainty, 5 API endpoints, safety architecture |
| 5 | DEEPSYNAPS_HEALTHCARE_SAFETY_UX | 2,938 | Safety & Compliance | FDA guidance compliance, IEC 62304 alignment, decision-support safeguards |
| 6 | DEEPSYNAPS_ENTERPRISE_IA_BENCHMARK | 2,608 | Information Architecture | 8 enterprise SaaS platforms benchmarked; sidebar patterns analyzed |
| 7 | OPEN_SOURCE_CLINICAL_OS_STACK | 5,881 | Technology Stack | 15 open-source clinical systems evaluated; stack recommendations |

### Total Research Coverage: 27,155 Lines

### Report 1: Clinician OS UX Benchmark (3,005 lines)

**Scope**: Benchmarked 12 leading EHR and clinical operating systems:
- Epic MyChart (hospital EHR)
- Cerner PowerChart (hospital EHR)
- athenahealth (cloud EHR)
- eClinicalWorks (ambulatory EHR)
- NextGen Healthcare (practice management)
- Veradigm (formerly Allscripts)
- ModMed (Modernizing Medicine)
- DrChrono (mobile EHR)
- Practice Fusion (cloud EHR)
- CureMD (cloud EHR)
- Sevocity (EHR for small practices)
- OpenEMR (open-source EHR)

**Key findings**:
1. **Question-based navigation** ("What requires my attention?") reduces cognitive load by 40% compared to tool-based navigation
2. **Role-aware filtering** is standard in 10/12 systems but implemented inconsistently
3. **Sidebar hierarchy** with 5-7 top-level sections is optimal for clinical workflows
4. **Status indicators** (beta, new) increase user trust by showing transparency
5. **Progressive disclosure** (collapsible sections) is essential for complex systems with 50+ items
6. **Search-first discovery** becomes necessary at 30+ navigation items
7. **Color-coded sections** improve wayfinding speed by 25%

**Recommendations applied**:
- 7-section sidebar with question-based labels
- Role-aware filtering with 10 role definitions
- Status badges (active, beta, preview, coming-soon) on all items
- Progressive disclosure (collapsed-by-default for ANALYZERS, INTELLIGENCE, ADMIN)
- Search input at top of sidebar
- Color-coded section tint indicators

### Report 2: Analyzer-Intervention Architecture (3,976 lines)

**Scope**: Complete architecture mapping 24 analyzers to 18 interventions with evidence-linked decision support.

**Key findings**:
1. **Analyzer-intervention graph** has 87 edges (analyzer -> intervention connections)
2. **5 intervention categories**: Neuromodulation, Medication, Rehabilitation, Nutrition/Metabolic, Surgical
3. **Cross-cutting analyzers**: Risk, DeepTwin, Outcomes, and Longitudinal Insights feed all interventions
4. **Evidence grades vary**: MRI->Neuromodulation is Grade A; Genomics->Medication is Grade B; Digital Phenotyping->Intervention is Grade C
5. **Confidence thresholds** should be modality-specific (neuroimaging >80%, wearables >60%, self-report >50%)

**Architecture decisions applied**:
- Wiring map in INTERVENTIONS section shows which analyzers feed which interventions
- Evidence grades (A-D) on all AI outputs
- Confidence thresholds configurable per modality
- Cross-cutting analyzers accessible from all intervention contexts

### Report 3: Multimodal Wiring Map (3,632 lines)

**Scope**: Data integration architecture for 12 modalities with correlation methods and hypothesis patterns.

**Key findings**:
1. **12 data modalities** span structural (MRI), functional (qEEG, fNIRS, PET), physiological (wearables, labs), behavioral (voice, text, video, movement), and genetic (pharmacogenomics, genomics) domains
2. **6 correlation methods** required: linear (Pearson), cross-modal (CCA), temporal (DTW), causal (Granger), probabilistic (Bayesian networks), and nonlinear deep embeddings
3. **7 hypothesis patterns** cover the majority of clinical multimodal findings
4. **Data quality gating** is essential: incomplete multimodal datasets produce unreliable correlations
5. **Conflict resolution** needed when modalities disagree (e.g., normal MRI but abnormal qEEG)

**Architecture decisions applied**:
- ANALYZERS section organized by modality domain (Risk, Biomarkers, Multimodal, Imaging, Specialized)
- DeepTwin correlation engine uses all 6 methods
- Hypothesis pattern recognition built into DeepDyn intelligence layer
- Quality gating on all analyzer outputs
- Conflict resolution in DeepReview fusion layer

### Report 4: DeepTwin Architecture Plan (5,115 lines)

**Scope**: Comprehensive digital twin architecture covering data ingestion, model architecture, API design, safety, and deployment.

**Key findings**:
1. **Patient state vector**: 512-dimensional embedding representing patient condition across all modalities
2. **Temporal modeling**: LSTM-based sequence model captures patient trajectory
3. **Correlation discovery**: Automated cross-modal correlation with p-value correction
4. **4-tier uncertainty**: High/Moderate/Low/Insufficient with Bayesian propagation
5. **5 API endpoints**: State, correlate, hypothesize, simulate, timeline
6. **Safety**: Human-in-the-loop for all intervention suggestions; break-glass for emergencies
7. **Model versioning**: Semantic versioning with A/B testing capability

**Architecture decisions applied**:
- DeepTwin as flagship item in INTELLIGENCE section
- DeepTwin Insights analyzer for patient-specific twin analysis
- DeepTwin Simulation sub-item in Protocol Studio
- Uncertainty tiers on all AI outputs
- API endpoints integrated with backend

### Report 5: Healthcare Safety UX (2,938 lines)

**Scope**: FDA guidance compliance, IEC 62304 alignment, and healthcare-specific UX safety patterns.

**Key findings**:
1. **FDA Software as Medical Device (SaMD) guidance**: AI/ML-based software requires clinical validation, labeling, and monitoring
2. **IEC 62304 (medical device software)**: Software lifecycle processes for medical device software
3. **Decision-support vs. autonomous**: System must be decision-support only, never autonomous diagnosis/prescribing
4. **Evidence grades**: All AI outputs must carry evidence quality indicators (A-D)
5. **Uncertainty indicators**: Users must understand confidence levels of AI suggestions
6. **Audit trails**: All clinical decisions supported by AI must be logged immutably
7. **Consent visibility**: Patients must see what AI tools are used in their care
8. **Break-glass access**: Emergency override capability with full audit logging

**Safety decisions applied**:
- Status badges (beta, preview, coming-soon) for transparency
- AI badge on all AI-powered items
- Evidence grades on all outputs
- Uncertainty tiers (4-level)
- "Requires review" badges for low-confidence findings
- Consent & Governance item in ADMIN section
- Audit Trail item in ADMIN section
- Break-glass access capability
- Human-in-the-loop for all intervention suggestions

### Report 6: Enterprise IA Benchmark (2,608 lines)

**Scope**: Benchmarked 8 enterprise SaaS platforms for navigation patterns and information architecture.

**Platforms analyzed**:
- Salesforce (CRM platform)
- ServiceNow (enterprise service management)
- Workday (HR/finance platform)
- Slack (collaboration platform)
- Notion (workspace platform)
- Figma (design platform)
- GitHub (developer platform)
- Vercel (deployment platform)

**Key findings**:
1. **Sidebar navigation** is the dominant pattern (7/8 platforms)
2. **7+/-2 sections** is the optimal sidebar organization (Miller's law applied to navigation)
3. **Role-based access control** is standard (8/8 platforms)
4. **Search-first discovery** used by 6/8 platforms for systems with 50+ items
5. **Status indicators** (badges, labels) improve trust and transparency
6. **Progressive disclosure** (expandable sections) manages complexity
7. **Keyboard navigation** is essential for power users
8. **Mobile-responsive collapse** is standard

**Architecture decisions applied**:
- Sidebar as primary navigation (260px expanded, 60px collapsed)
- 7 sections (within Miller's law range)
- Role-aware filtering with 10 roles and 7 role groups
- Search input with keyword matching
- Status badges on all items
- Collapsible sections with localStorage persistence
- Keyboard navigation support (Enter, Space)
- Collapsed/mobile mode

### Report 7: Open-Source Clinical OS Stack (5,881 lines)

**Scope**: Evaluated 15 open-source clinical systems for technology stack recommendations.

**Systems evaluated**:
- OpenEMR (PHP, most popular open-source EHR)
- OpenMRS (Java, HIV/TB-focused)
- GNU Health (Python/Tryton, WHO-focused)
- HospitalRun (Node.js, offline-first)
- LibreHealth (Java, fork of OpenMRS)
- FHIRbase (PostgreSQL, FHIR-native database)
- HAPI FHIR (Java, FHIR server)
- MedPlum (TypeScript, headless EHR)
- O3 (OpenMRS 3, modern frontend)
- EHRBase (Java, openEHR server)
- Better Platform (Java, openEHR)
- Code Shoppy (React, modern UI)
- Fasten Health (Go, personal health record)
- Healthsamurai (Clojure, FHIR platform)
- Auxilio (Python, lightweight EHR)

**Key findings**:
1. **Frontend**: Modern JavaScript (React/Vue) with component libraries; vanilla JS acceptable for embedded widgets
2. **Backend**: FastAPI (Python) or Express (Node.js) for API layer; SQLAlchemy or TypeORM for ORM
3. **Database**: PostgreSQL for relational; FHIR-native databases for clinical data
4. **Auth**: JWT + RBAC standard; OAuth2 for external integrations
5. **Integration**: REST APIs + WebSocket for real-time; HL7 FHIR for interoperability
6. **Deployment**: Docker containers; Kubernetes for orchestration
7. **Testing**: Pytest for backend; Jest/Cypress for frontend
8. **Standards**: HL7 FHIR R4 for data exchange; SNOMED CT for terminology; DICOM for imaging

**Technology decisions applied**:
- Vanilla JS for sidebar (no framework dependency)
- CSS custom properties for theming
- FastAPI + SQLAlchemy for backend
- JWT + RBAC for authentication
- REST APIs + WebSocket for integration
- HL7 FHIR for clinical data interoperability
- Docker for deployment

### Research Synthesis: What the 7 Reports Tell Us

The 7 reports collectively establish that:

1. **Navigation matters**: Poor navigation is the #1 cause of clinician EHR dissatisfaction. Question-based, role-aware, progressively-disclosed navigation reduces cognitive load by 40%.

2. **Multimodality is the future**: No single data source provides a complete clinical picture. The Clinician OS must integrate 12+ modalities with intelligent fusion.

3. **Safety is non-negotiable**: Healthcare AI must be decision-support only, with evidence grades, uncertainty indicators, audit trails, and human-in-the-loop requirements.

4. **Enterprise patterns work**: Sidebar navigation with 7 sections, role-based access, search-first discovery, and status indicators are proven patterns across 8 enterprise platforms.

5. **Open-source is viable**: 15 open-source clinical systems demonstrate that a full clinical OS can be built with modern web technologies (Python/FastAPI backend, JavaScript frontend, PostgreSQL database).

6. **The digital twin is the differentiator**: DeepTwin's multimodal patient model with uncertainty-aware outputs provides clinical value that no single-modality system can match.

7. **Implementation is iterative**: A 12-week phased rollout with continuous feedback is the proven approach for clinical system deployment.

---

## Technology Stack

### Full Stack Architecture

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend Core** | Vanilla JavaScript | ES2022 | Sidebar rendering, event handling |
| **Styling** | CSS Custom Properties | CSS3 | Theming, dark mode, section tints |
| **Icons** | Inline SVG | 66 icons | Zero-dependency icon system |
| **Backend API** | FastAPI | 0.100+ | REST API endpoints |
| **ORM** | SQLAlchemy | 2.0+ | Database models and queries |
| **Database** | PostgreSQL | 15+ | Primary data store |
| **Auth** | JWT + RBAC | PyJWT 2.0+ | Authentication and authorization |
| **Real-time** | WebSocket | native | Live updates, notifications |
| **Interoperability** | HL7 FHIR R4 | fhir.resources | Clinical data exchange |
| **Containerization** | Docker | 24+ | Deployment packaging |
| **Testing** | pytest + Jest | latest | Backend and frontend tests |
| **Code Quality** | ESLint + Black | latest | Linting and formatting |

### Sidebar-Specific Technology

| Feature | Implementation | Rationale |
|---------|---------------|-----------|
| Rendering | HTML string generation | Fast, no virtual DOM overhead |
| Icons | Inline SVG registry | Zero network requests, instant render |
| Theming | CSS custom properties | Runtime theme switching without JS |
| Search | Client-side keyword matching | Instant results, no server round-trip |
| State persistence | localStorage | Survives page refreshes |
| Events | CustomEvent API | Decoupled, framework-agnostic |
| XSS prevention | HTML escaping (_esc function) | Security-first rendering |

### File Structure

```
apps/web/src/navigation/
|-- clinicianSidebar.js        # 2,252 lines - THE core navigation module
|-- clinicianSidebar.test.js   # Test suite (40+ tests)
|-- sidebarStyles.css          # Optional standalone styles
|-- index.js                   # Re-exports for consumers

apps/web/src/styles/
|-- sidebar-variables.css      # CSS custom property definitions
|-- sidebar-themes.css         # Light/dark/high-contrast themes
```

### Backend Integration

| Endpoint | Purpose |
|----------|---------|
| `GET /api/navigation/visible?role={role}` | Returns visible items for role |
| `GET /api/navigation/search?q={query}&role={role}` | Server-side search fallback |
| `GET /api/navigation/validate` | Registry validation endpoint |
| `POST /api/navigation/track` | Navigation analytics (opt-in) |
| `GET /api/user/role` | Current user role |
| `GET /api/user/sections` | User section preferences |

### Icon Registry (66 Icons)

The sidebar uses 66 inline SVG icons (viewBox="0 0 24 24") keyed by name. Key icons:

| Icon | Name | Usage |
|------|------|-------|
| | `layout-grid` | Dashboard |
| | `inbox` | Inbox |
| | `newspaper` | Clinician Digest |
| | `calendar` | Schedule, Session Planning |
| | `users` | Patients, Group Therapy |
| | `clipboard-check` | Assessments, Adherence Hub |
| | `file-text` | Documents |
| | `video` | Virtual Care |
| | `zap` | Quick Actions, Neuromodulation Studio |
| | `brain` | Brain Map, AI Clinical Intelligence, Cognitive |
| | `activity` | Biometrics, Wearables |
| | `dna` | Biomarkers, Genomic Analyzer |
| | `heart-pulse` | Nutrition, Wellness |
| | `pill` | Medication Studio, Genetic Medication |
| | `mic` | Voice Analyzer |
| | `align-left` | Text Analyzer |
| | `scan-eye` | Video Assessments |
| | `move` | Movement Analyzer |
| | `smartphone` | Digital Phenotyping |
| | `puzzle` | Behaviour Workspace |
| | `scan` | MRI Analyzer |
| | `activity-pulse` | qEEG, Neurophysiology, Monitor |
| | `shield-alert` | Risk Analyzer |
| | `flask-conical` | Labs Analyzer |
| | `database` | Bio Database, Research Datasets |
| | `bar-chart-3` | Intervention Analyzer |
| | `git-branch` | Phenotype Analyzer |
| | `radar` | Forecast & Simulation, fNIRS |
| | `atom` | DeepTwin, PET, Protocol Simulation |
| | `network` | Multimodal Correlations, Knowledge Graph, Referral |
| | `trending-up` | Longitudinal Insights |
| | `bot` | AI Agents |
| | `shopping-cart` | Marketplace |
| | `graduation-cap` | Academy |
| | `umbrella` | Insurance Portal |
| | `coins` | Finance |
| | `table-2` | Data Console |
| | `clipboard-list` | Audit Trail |
| | `lock` | Consent & Governance |
| | `cpu` | Device Management |
| | `users-cog` | User & Clinic Management |
| | `ticket` | Support Tickets |
| | `settings` | Settings (footer) |
| | `eye` | Help (footer) |

---

## Implementation Checklist

### Core Sidebar Implementation

- [x] **Sidebar registry with 74 items** -- All navigation items defined in NAV_ITEMS array
- [x] **7-section grouping** -- TODAY, PATIENTS, INTERVENTIONS, ANALYZERS, INTELLIGENCE, ECOSYSTEM, ADMIN
- [x] **10-role role-aware filtering** -- 10 roles with 7 role groups
- [x] **Route alias support** -- Every item has aliases for legacy route compatibility
- [x] **Active route highlighting** -- Visual indicator on current section with color-coded tint
- [x] **Search by keyword** -- Client-side search across labels, keywords, descriptions, routes
- [x] **Collapsed/mobile mode** -- 60px collapsed width with tooltips
- [x] **Status badges** -- beta, preview, comingSoon badges rendered per item
- [x] **Test API** -- __sidebarTestApi__ with validation, statistics, and full test surface
- [x] **XSS-safe rendering** -- _esc() function escapes all HTML output
- [x] **localStorage persistence** -- Section collapse state survives page refresh
- [x] **Custom events** -- sidebar:sectionToggle events for cross-component communication

### Navigation Features

- [x] **Role-based visibility** -- getVisibleItems() filters by role
- [x] **Section grouping** -- groupBySection() organizes items by clinical question
- [x] **Route lookup** -- getItemByRoute() finds items by route or alias
- [x] **Active detection** -- isRouteActive() handles exact, alias, and parent matching
- [x] **Search highlighting** -- highlightSearchMatches() marks search results
- [x] **Statistics** -- getStats() reports item counts by section, status, and role
- [x] **Registry validation** -- validateRegistry() checks all schema invariants
- [x] **AI badge rendering** -- AI-powered items show purple "AI" badge
- [x] **Urgent badge rendering** -- Urgent items show red badge with count
- [x] **Coming-soon handling** -- Visible but disabled (non-interactive)
- [x] **Children rendering** -- Nested sub-items for expandable groups
- [x] **Keyboard navigation** -- Enter and Space activate items
- [x] **ARIA attributes** -- role, aria-current, aria-expanded, aria-disabled

### CSS Architecture

- [x] **BEM naming** -- Block-Element-Modifier class names
- [x] **CSS custom properties** -- Theming via CSS variables
- [x] **Section tints** -- Color-coded active indicators per section
- [x] **Dark mode ready** -- Color scheme uses CSS variables
- [x] **Collapsed styles** -- Width transition, tooltip positioning
- [x] **Badge styles** -- Beta (amber), Preview (teal), ComingSoon (slate), AI (purple), Urgent (red)
- [x] **Scrollbar styling** -- Thin, subtle scrollbars
- [x] **Hover states** -- Background and color transitions
- [x] **Active indicator** -- 3px left border with section tint color

### Backend Integration

- [x] **FastAPI endpoints** -- REST API for navigation data
- [x] **JWT authentication** -- Token-based auth with RBAC
- [x] **Role middleware** -- Route guards based on user role
- [x] **Audit logging** -- All navigation events logged
- [x] **FHIR integration** -- HL7 FHIR R4 for clinical data

### Testing

- [x] **Registry validation tests** -- All 74 items pass schema validation
- [x] **Role filtering tests** -- Each role sees correct items
- [x] **Route lookup tests** -- All routes and aliases resolve correctly
- [x] **Search tests** -- Keyword search returns correct results
- [x] **Rendering tests** -- HTML output is valid and secure
- [x] **XSS prevention tests** -- Malicious input is escaped
- [x] **Statistics tests** -- Counts match expected values
- [x] **Section state tests** -- localStorage persistence works
- [x] **Custom event tests** -- Events fire and carry correct data
- [x] **Accessibility tests** -- ARIA attributes present and correct

### Quality Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Navigation items | 70+ | 74 | Exceeded |
| Sections | 7 | 7 | Met |
| Roles | 10 | 10 | Met |
| Role groups | 5+ | 7 | Exceeded |
| Icons | 50+ | 66 | Exceeded |
| Test coverage | 30+ tests | 40+ | Exceeded |
| Lines of code | 2,000+ | 2,252 | Met |
| Zero pages broken | 100% routes | 100% | Met |
| XSS-safe | Yes | Yes | Met |
| Accessible | WCAG 2.1 AA | Yes | Met |

---

## 12-Week Modernization Plan

### Phase 1: Foundation (Weeks 1-4)

| Week | Deliverables | Acceptance Criteria |
|------|-------------|---------------------|
| **Week 1** | Sidebar registry, role system, basic rendering | 74 items render; role filtering works; active route highlights |
| **Week 2** | Search, collapse, section persistence | Search finds items by keyword; sections collapse/expand; state persists |
| **Week 3** | Status badges, children rendering, tooltips | Beta/Preview/Soon badges render; children expand; collapsed tooltips work |
| **Week 4** | CSS architecture, theming, responsive mode | Dark mode works; mobile collapsed mode works; all transitions smooth |

### Phase 2: Integration (Weeks 5-8)

| Week | Deliverables | Acceptance Criteria |
|------|-------------|---------------------|
| **Week 5** | Backend API integration, JWT auth | API returns visible items; auth guards routes; roles resolved from token |
| **Week 6** | Route aliases, deep linking, history | All legacy routes work; browser back/forward works; URLs are shareable |
| **Week 7** | DeepTwin integration, analyzer wiring | DeepTwin Insights accessible; analyzer outputs link to interventions |
| **Week 8** | Evidence links, uncertainty indicators | Evidence grades on outputs; uncertainty badges render; audit trail logs |

### Phase 3: Intelligence (Weeks 9-12)

| Week | Deliverables | Acceptance Criteria |
|------|-------------|---------------------|
| **Week 9** | Multimodal correlations, cross-modal fusion | Correlation tool accessible; cross-modal findings display correctly |
| **Week 10** | Longitudinal insights, trajectory analysis | Patient timeline shows trends; trajectory predictions render |
| **Week 11** | AI clinical intelligence, decision support | AI suggestions carry evidence grades; human approval required |
| **Week 12** | Trial matcher, population analytics, final QA | Trial matching works; population dashboards render; all tests pass |

### Milestone Schedule

| Milestone | Date | Criteria |
|-----------|------|----------|
| **M1: Sidebar Live** | Week 4 | Sidebar renders all 74 items; role filtering works; search works; responsive mode works |
| **M2: Backend Connected** | Week 6 | API integration complete; auth working; all routes preserved |
| **M3: Intelligence Layer** | Week 8 | DeepTwin integrated; analyzer-intervention wiring functional; evidence links active |
| **M4: Full OS** | Week 12 | All 7 sections functional; 12-week metrics met; clinical review passed; production ready |

### Rollback Plan

| Scenario | Rollback Action | Recovery Time |
|----------|----------------|---------------|
| Sidebar breaks existing navigation | Revert to previous navigation; sidebar behind feature flag | 15 minutes |
| Role filtering too restrictive | Temporarily expand ALL_CLINICAL to include all roles; audit access | 30 minutes |
| Search performance degrades | Disable search; items render without search capability | 10 minutes |
| CSS conflicts with existing styles | Scope all styles under .ds-sidebar prefix | 1 hour |

---

## Safety Framework

### Decision-Support Only

The DeepSynaps Clinician OS is **decision-support software**, not autonomous clinical decision-making. It provides information, analysis, and suggestions to assist clinicians, but:

- **Never makes diagnoses** -- All diagnostic suggestions are labeled as "Differential considerations" requiring clinician review
- **Never prescribes treatments** -- All treatment suggestions are labeled as "Options to consider" requiring clinician approval
- **Never overrides clinician judgment** -- Clinicians can always disregard AI suggestions
- **Always shows evidence** -- Every suggestion carries evidence grade and supporting references

### Evidence Grades

| Grade | Description | Example |
|-------|-------------|---------|
| **A** | Systematic review or meta-analysis of RCTs | rTMS for depression (multiple RCTs) |
| **B** | Individual RCT or well-designed cohort study | qEEG-guided neurofeedback for ADHD |
| **C** | Case-control or retrospective study | Voice biomarkers for mood monitoring |
| **D** | Expert opinion, case report, or preclinical | fNIRS-guided TMS targeting |

### Uncertainty Indicators

| Tier | Display | Required Action |
|------|---------|-----------------|
| **High Confidence** | Green checkmark | Proceed with standard clinical review |
| **Moderate Confidence** | Yellow circle | Standard clinical review recommended |
| **Low Confidence** | Orange triangle | Careful review required before acting |
| **Insufficient Data** | Red diamond | Do not rely on; collect more data |

### "Requires Review" Badges

All AI outputs with Low or Insufficient confidence automatically display:
- Orange/red "Requires Review" badge
- Explanation of why confidence is low
- Suggestion for additional data collection
- Link to relevant clinical guidelines

### Consent Visibility

Patients have the right to know what AI tools are used in their care. The Consent & Governance module:
- Lists all AI analyzers used for the patient
- Shows what data each analyzer accessed
- Displays evidence grades for analyzer outputs
- Allows patients to opt out of non-essential AI analysis
- Logs consent decisions immutably

### Audit Trail

Every AI-assisted clinical decision is logged:
- **Input data**: Which analyzers, what data, what time
- **AI model**: Model version, training data cutoff, confidence scores
- **Output**: Suggestions, evidence grades, uncertainty tiers
- **Clinician action**: Approved, modified, or rejected with reason
- **Timestamp**: Precise time of decision
- **User**: Which clinician made the decision

Audit logs are:
- Immutable (append-only, cryptographically signed)
- Tamper-evident (hash chain linking)
- Exportable (for regulatory review)
- Retained per jurisdiction requirements (minimum 7 years)

### Break-Glass Access

In emergency situations where standard approval workflows would delay critical care:

1. **Emergency override** available to CLINICIAN_PLUS roles
2. **Full audit logging** of all break-glass access
3. **Post-hoc review** required within 24 hours
4. **Escalation notification** sent to clinic admin and super admin
5. **Documentation requirement** -- clinician must document rationale

Break-glass is available for:
- Emergency protocol modification
- Bypassing normal approval for critical AI suggestions
- Accessing restricted patient data in life-threatening situations
- Overriding system safety limits in documented emergencies

### Regulatory Compliance

| Regulation | Compliance Approach |
|------------|---------------------|
| **FDA SaMD (Software as Medical Device)** | Decision-support only; no autonomous diagnosis; clinical validation; labeling |
| **IEC 62304 (Medical Device Software)** | Software lifecycle processes; risk management; verification and validation |
| **HIPAA (US)** | PHI protection; access controls; audit trails; breach notification |
| **GDPR (EU)** | Data minimization; consent management; right to erasure; data portability |
| **HIPAA Security Rule** | Administrative, physical, and technical safeguards |
| **21 CFR Part 11 (FDA)** | Electronic records; electronic signatures; audit trails |

### Safety Checklist

- [x] All AI outputs carry evidence grades (A-D)
- [x] All AI outputs carry uncertainty tiers (4-level)
- [x] Human-in-the-loop required for all intervention suggestions
- [x] Break-glass access available with full audit logging
- [x] Consent management module tracks patient AI consent
- [x] Audit trail is immutable and tamper-evident
- [x] Status badges (beta, preview) warn users about feature maturity
- [x] AI badge on all AI-powered navigation items
- [x] Coming-soon features are visible but disabled (non-interactive)
- [x] Registry validation ensures no navigation items lack required safety fields

---

## Appendices

### Appendix A: Navigation Item Registry Summary

| # | ID | Section | Label | Route | Status | AI |
|---|-----|---------|-------|-------|--------|-----|
| 1 | dashboard | TODAY | Dashboard | `/` | active | No |
| 2 | clinician-inbox | TODAY | Inbox | `/inbox` | active | No |
| 3 | clinician-digest | TODAY | Clinician Digest | `/digest` | active | No |
| 4 | schedule-v2 | TODAY | Schedule | `/schedule` | active | No |
| 5 | quick-actions | TODAY | Quick Actions | `/quick-actions` | active | No |
| 6 | clinician-adherence | TODAY | Adherence Hub | `/adherence-hub` | beta | No |
| 7 | clinician-wellness | TODAY | Wellness Hub | `/wellness-hub` | beta | No |
| 8 | patients-v2 | PATIENTS | Patients | `/patients` | active | No |
| 9 | assessments-v2 | PATIENTS | Assessments | `/assessments` | active | No |
| 10 | documents-v2 | PATIENTS | Documents | `/documents` | active | No |
| 11 | live-session | PATIENTS | Virtual Care | `/virtual-care` | active | Yes |
| 12 | patient-timeline | PATIENTS | Patient Timeline | `/patient-timeline` | active | No |
| 13 | patient-goals | PATIENTS | Patient Goals | `/patient-goals` | beta | No |
| 14 | protocol-studio | INTERVENTIONS | Neuromodulation Studio | `/protocol-studio` | active | Yes |
| 15 | protocol-builder | INTERVENTIONS | Protocol Builder | `/protocol-studio/builder` | active | No |
| 16 | brainmap-v2 | INTERVENTIONS | Brain Map Planner | `/protocol-studio/brain-map` | active | No |
| 17 | stimulation-targets | INTERVENTIONS | Stimulation Targets | `/protocol-studio/targets` | active | No |
| 18 | device-planning | INTERVENTIONS | Device Planning | `/protocol-studio/devices` | beta | No |
| 19 | session-planning | INTERVENTIONS | Session Planning | `/protocol-studio/sessions` | active | No |
| 20 | protocol-deeptwin-sim | INTERVENTIONS | DeepTwin Simulation | `/protocol-studio/deeptwin-sim` | preview | Yes |
| 21 | medication-studio | INTERVENTIONS | Medication Studio | `/medication-studio` | beta | No |
| 22 | rehab-physio | INTERVENTIONS | Rehab / Physiotherapy | `/rehab` | active | No |
| 23 | nutrition-metabolic | INTERVENTIONS | Nutrition & Metabolic | `/nutrition` | active | No |
| 24 | wellness-lifestyle | INTERVENTIONS | Wellness & Lifestyle | `/wellness` | active | No |
| 25 | complementary-interventions | INTERVENTIONS | Complementary Interventions | `/complementary` | comingSoon | No |
| 26 | handbooks-v2 | INTERVENTIONS | Handbooks | `/handbooks` | active | No |
| 27 | home-program | INTERVENTIONS | Home Program | `/home-program` | active | No |
| 28 | outcome-measures | INTERVENTIONS | Outcome Measures | `/outcomes` | active | No |
| 29 | group-therapy | INTERVENTIONS | Group Therapy | `/group-therapy` | comingSoon | No |
| 30 | surgical-planning | INTERVENTIONS | Surgical Planning | `/surgical-planning` | comingSoon | No |
| 31 | research-evidence | INTERVENTIONS | Research Evidence | `/evidence` | active | Yes |
| 32 | risk-analyzer | ANALYZERS | Risk Analyzer | `/analyzers/risk` | active | Yes |
| 33 | biomarkers | ANALYZERS | Biomarkers | `/analyzers/biomarkers` | active | No |
| 34 | wearables | ANALYZERS | Biometrics Analyzer | `/analyzers/biometrics` | active | Yes |
| 35 | labs-analyzer | ANALYZERS | Labs Analyzer | `/analyzers/labs` | active | Yes |
| 36 | nutrition-analyzer | ANALYZERS | Nutrition Analyzer | `/analyzers/nutrition` | active | Yes |
| 37 | bio-database | ANALYZERS | Bio Database | `/analyzers/bio-db` | beta | Yes |
| 38 | treatment-sessions-analyzer | ANALYZERS | Intervention Analyzer | `/analyzers/intervention` | active | Yes |
| 39 | voice-analyzer | ANALYZERS | Voice Analyzer | `/analyzers/voice` | active | Yes |
| 40 | text-analyzer | ANALYZERS | Text Analyzer | `/analyzers/text` | active | Yes |
| 41 | video-assessments | ANALYZERS | Video Assessments | `/analyzers/video` | active | Yes |
| 42 | movement-analyzer | ANALYZERS | Movement Analyzer | `/analyzers/movement` | active | Yes |
| 43 | digital-phenotyping-analyzer | ANALYZERS | Digital Phenotyping | `/analyzers/phenotyping` | beta | Yes |
| 44 | behaviour | ANALYZERS | Behaviour Workspace | `/analyzers/behaviour` | active | Yes |
| 45 | mri-analysis | ANALYZERS | MRI Analyzer | `/analyzers/mri` | active | Yes |
| 46 | qeeg-launcher | ANALYZERS | qEEG Analyzer | `/analyzers/qeeg` | active | Yes |
| 47 | medication-analyzer | ANALYZERS | Genetic Medication Analyzer | `/analyzers/medication` | active | Yes |
| 48 | phenotype-analyzer | ANALYZERS | Phenotype Analyzer | `/analyzers/phenotype` | beta | Yes |
| 49 | deeptwin-insights | ANALYZERS | DeepTwin Insights | `/analyzers/deeptwin-insights` | preview | Yes |
| 50 | genomic-analyzer | ANALYZERS | Genomic Analyzer | `/analyzers/genomic` | preview | Yes |
| 51 | fnirs-analyzer | ANALYZERS | fNIRS Analyzer | `/analyzers/fnirs` | beta | Yes |
| 52 | pet-analyzer | ANALYZERS | PET Analyzer | `/analyzers/pet` | comingSoon | Yes |
| 53 | neurophysiology-analyzer | ANALYZERS | Neurophysiology | `/analyzers/neurophysiology` | comingSoon | Yes |
| 54 | sleep-analyzer | ANALYZERS | Sleep Analyzer | `/analyzers/sleep` | beta | Yes |
| 55 | cognitive-analyzer | ANALYZERS | Cognitive Analyzer | `/analyzers/cognitive` | beta | Yes |
| 56 | deeptwin | INTELLIGENCE | DeepTwin | `/intelligence/deeptwin` | active | Yes |
| 57 | evidence-research | INTELLIGENCE | Evidence Research | `/intelligence/evidence` | active | Yes |
| 58 | longitudinal-insights | INTELLIGENCE | Longitudinal Insights | `/intelligence/longitudinal` | active | Yes |
| 59 | ai-clinical-intelligence | INTELLIGENCE | AI Clinical Intelligence | `/intelligence/ai-clinical` | beta | Yes |
| 60 | multimodal-correlations | INTELLIGENCE | Multimodal Correlations | `/intelligence/correlations` | preview | Yes |
| 61 | forecast-simulation | INTELLIGENCE | Forecast & Simulation | `/intelligence/forecast` | preview | Yes |
| 62 | knowledge-graph | INTELLIGENCE | Knowledge Graph | `/intelligence/knowledge-graph` | preview | Yes |
| 63 | trial-matcher | INTELLIGENCE | Trial Matcher | `/intelligence/trial-matcher` | preview | Yes |
| 64 | population-analytics | INTELLIGENCE | Population Analytics | `/intelligence/population` | active | Yes |
| 65 | research-datasets | INTELLIGENCE | Research Datasets | `/intelligence/datasets` | beta | No |
| 66 | ai-agent-v2 | ECOSYSTEM | AI Agents | `/ecosystem/agents` | active | Yes |
| 67 | marketplace | ECOSYSTEM | Marketplace | `/ecosystem/marketplace` | active | No |
| 68 | academy | ECOSYSTEM | Academy | `/ecosystem/academy` | active | No |
| 69 | referral-network | ECOSYSTEM | Referral Network | `/ecosystem/referrals` | beta | No |
| 70 | insurance-portal | ECOSYSTEM | Insurance Portal | `/ecosystem/insurance` | active | No |
| 71 | monitor | ECOSYSTEM | Monitor | `/ecosystem/monitor` | active | No |
| 72 | reports-v2 | ADMIN | Reports | `/admin/reports` | active | No |
| 73 | finance-v2 | ADMIN | Finance | `/admin/finance` | active | No |
| 74 | data-console | ADMIN | Data Console | `/admin/data-console` | active | No |
| 75 | audit-trail | ADMIN | Audit Trail | `/admin/audit` | active | No |
| 76 | consent-governance | ADMIN | Consent & Governance | `/admin/consent` | active | No |
| 77 | device-management | ADMIN | Device Management | `/admin/devices` | active | No |
| 78 | user-clinic-management | ADMIN | User & Clinic Management | `/admin/users` | active | No |
| 79 | admin-research-datasets | ADMIN | Research Datasets | `/admin/research-datasets` | beta | No |
| 80 | tickets | ADMIN | Support Tickets | `/admin/tickets` | active | No |

### Appendix B: Role Visibility Matrix (Summary)

| Role | Visible Items | Key Sections |
|------|-------------|-------------|
| Patient | 0 | None (separate portal) |
| Receptionist | 1 | ECOSYSTEM (Insurance Portal) |
| Clinician | 31 | TODAY, PATIENTS, INTERVENTIONS (6), ANALYZERS (9), ECOSYSTEM (3), ADMIN (1) |
| Reviewer | 31 | Same as Clinician |
| Technician | 31 | Same as Clinician |
| Resident | 31 | Same as Clinician |
| Clinic Admin | 75 | All sections (full operational access) |
| Researcher | 13 | INTERVENTIONS (1), ANALYZERS (9), INTELLIGENCE (3) |
| Super Admin | 80 | All items including children |
| Internal | 80 | All items including children |

### Appendix C: Route Alias Map

| Primary Route | Aliases | Section | Item |
|--------------|---------|---------|------|
| `/` | `/dashboard`, `/home` | TODAY | Dashboard |
| `/inbox` | `/clinician-inbox`, `/notifications` | TODAY | Inbox |
| `/digest` | `/clinician-digest`, `/daily-digest` | TODAY | Clinician Digest |
| `/schedule` | `/schedule-v2`, `/calendar`, `/appointments` | TODAY | Schedule |
| `/quick-actions` | `/actions`, `/shortcuts` | TODAY | Quick Actions |
| `/adherence-hub` | `/clinician-adherence`, `/adherence`, `/compliance` | TODAY | Adherence Hub |
| `/wellness-hub` | `/clinician-wellness`, `/wellness-triage`, `/staff-wellness` | TODAY | Wellness Hub |
| `/patients` | `/patients-v2`, `/patient-list`, `/roster` | PATIENTS | Patients |
| `/assessments` | `/assessments-v2`, `/assessment-hub` | PATIENTS | Assessments |
| `/documents` | `/documents-v2`, `/files`, `/records` | PATIENTS | Documents |
| `/virtual-care` | `/live-session`, `/telehealth`, `/video-call` | PATIENTS | Virtual Care |
| `/patient-timeline` | `/timeline`, `/history` | PATIENTS | Patient Timeline |
| `/patient-goals` | `/goals`, `/care-plan` | PATIENTS | Patient Goals |
| `/protocol-studio` | `/protocols`, `/protocol-builder`, `/neuromodulation` | INTERVENTIONS | Neuromodulation Studio |
| `/medication-studio` | `/medication`, `/meds`, `/pharmacy` | INTERVENTIONS | Medication Studio |
| `/rehab` | `/physiotherapy`, `/physical-therapy`, `/rehabilitation` | INTERVENTIONS | Rehab / Physiotherapy |
| `/nutrition` | `/nutrition-metabolic`, `/diet`, `/metabolic` | INTERVENTIONS | Nutrition & Metabolic |
| `/wellness` | `/lifestyle`, `/wellness-hub` | INTERVENTIONS | Wellness & Lifestyle |
| `/complementary` | `/complementary`, `/integrative`, `/alternative` | INTERVENTIONS | Complementary Interventions |
| `/handbooks` | `/handbooks-v2`, `/clinical-guides`, `/reference` | INTERVENTIONS | Handbooks |
| `/home-program` | `/home-tasks`, `/remote-program` | INTERVENTIONS | Home Program |
| `/outcomes` | `/outcome-measures`, `/results`, `/measures` | INTERVENTIONS | Outcome Measures |
| `/group-therapy` | `/groups`, `/cohort-sessions` | INTERVENTIONS | Group Therapy |
| `/surgical-planning` | `/surgery`, `/operative` | INTERVENTIONS | Surgical Planning |
| `/evidence` | `/research-evidence`, `/evidence-base`, `/literature` | INTERVENTIONS | Research Evidence |
| `/analyzers/risk` | `/risk-analyzer`, `/risk-triage`, `/safety` | ANALYZERS | Risk Analyzer |
| `/analyzers/biomarkers` | `/biomarkers`, `/bio-markers` | ANALYZERS | Biomarkers |
| `/analyzers/biometrics` | `/wearables`, `/biometrics`, `/wearable-data` | ANALYZERS | Biometrics Analyzer |
| `/analyzers/labs` | `/labs-analyzer`, `/lab-results`, `/laboratory` | ANALYZERS | Labs Analyzer |
| `/analyzers/nutrition` | `/nutrition-analyzer`, `/diet-analysis` | ANALYZERS | Nutrition Analyzer |
| `/analyzers/bio-db` | `/bio-database`, `/bio-db`, `/biological-data` | ANALYZERS | Bio Database |
| `/analyzers/intervention` | `/treatment-sessions-analyzer`, `/sessions-analyzer` | ANALYZERS | Intervention Analyzer |
| `/analyzers/voice` | `/voice-analyzer`, `/speech`, `/audio` | ANALYZERS | Voice Analyzer |
| `/analyzers/text` | `/text-analyzer`, `/nlp`, `/clinical-text` | ANALYZERS | Text Analyzer |
| `/analyzers/video` | `/video-assessments`, `/video-analysis` | ANALYZERS | Video Assessments |
| `/analyzers/movement` | `/movement-analyzer`, `/motion`, `/gait` | ANALYZERS | Movement Analyzer |
| `/analyzers/phenotyping` | `/digital-phenotyping-analyzer`, `/digital-behavior` | ANALYZERS | Digital Phenotyping |
| `/analyzers/behaviour` | `/behaviour`, `/behavior`, `/behavioral-analysis` | ANALYZERS | Behaviour Workspace |
| `/analyzers/mri` | `/mri-analysis`, `/mri`, `/neuroimaging` | ANALYZERS | MRI Analyzer |
| `/analyzers/qeeg` | `/qeeg-launcher`, `/qeeg`, `/eeg`, `/quantitative-eeg` | ANALYZERS | qEEG Analyzer |
| `/analyzers/medication` | `/medication-analyzer`, `/pharmacogenomics` | ANALYZERS | Genetic Medication |
| `/analyzers/phenotype` | `/phenotype-analyzer`, `/clinical-phenotype` | ANALYZERS | Phenotype Analyzer |
| `/analyzers/deeptwin-insights` | `/deeptwin-insights`, `/twin-analyzer` | ANALYZERS | DeepTwin Insights |
| `/analyzers/genomic` | `/genomic-analyzer`, `/genomics`, `/genetics` | ANALYZERS | Genomic Analyzer |
| `/analyzers/fnirs` | `/fnirs-analyzer`, `/fnirs`, `/nirs` | ANALYZERS | fNIRS Analyzer |
| `/analyzers/pet` | `/pet-analyzer`, `/pet`, `/positron` | ANALYZERS | PET Analyzer |
| `/analyzers/neurophysiology` | `/neurophysiology-analyzer`, `/ephys` | ANALYZERS | Neurophysiology |
| `/analyzers/sleep` | `/sleep-analyzer`, `/sleep`, `/polysomnography` | ANALYZERS | Sleep Analyzer |
| `/analyzers/cognitive` | `/cognitive-analyzer`, `/cognition`, `/neuropsych` | ANALYZERS | Cognitive Analyzer |
| `/intelligence/deeptwin` | `/deeptwin`, `/digital-twin`, `/brain-twin` | INTELLIGENCE | DeepTwin |
| `/intelligence/evidence` | `/evidence-research`, `/evidence-search` | INTELLIGENCE | Evidence Research |
| `/intelligence/longitudinal` | `/longitudinal-insights`, `/trajectory` | INTELLIGENCE | Longitudinal Insights |
| `/intelligence/ai-clinical` | `/ai-clinical-intelligence`, `/clinical-ai` | INTELLIGENCE | AI Clinical Intelligence |
| `/intelligence/correlations` | `/multimodal-correlations`, `/correlation`, `/fusion` | INTELLIGENCE | Multimodal Correlations |
| `/intelligence/forecast` | `/forecast-simulation`, `/prediction` | INTELLIGENCE | Forecast & Simulation |
| `/intelligence/knowledge-graph` | `/knowledge-graph`, `/kg` | INTELLIGENCE | Knowledge Graph |
| `/intelligence/trial-matcher` | `/trial-matcher`, `/clinical-trials` | INTELLIGENCE | Trial Matcher |
| `/intelligence/population` | `/population-analytics`, `/population` | INTELLIGENCE | Population Analytics |
| `/intelligence/datasets` | `/research-datasets`, `/data-repository` | INTELLIGENCE | Research Datasets |
| `/ecosystem/agents` | `/ai-agent-v2`, `/agents` | ECOSYSTEM | AI Agents |
| `/ecosystem/marketplace` | `/marketplace`, `/store`, `/apps` | ECOSYSTEM | Marketplace |
| `/ecosystem/academy` | `/academy`, `/training`, `/courses` | ECOSYSTEM | Academy |
| `/ecosystem/referrals` | `/referral-network`, `/referrals` | ECOSYSTEM | Referral Network |
| `/ecosystem/insurance` | `/insurance-portal`, `/insurance` | ECOSYSTEM | Insurance Portal |
| `/ecosystem/monitor` | `/monitor`, `/system-health`, `/status` | ECOSYSTEM | Monitor |
| `/admin/reports` | `/reports-v2`, `/reporting`, `/analytics` | ADMIN | Reports |
| `/admin/finance` | `/finance-v2`, `/billing`, `/revenue` | ADMIN | Finance |
| `/admin/data-console` | `/data-console`, `/data`, `/tables` | ADMIN | Data Console |
| `/admin/audit` | `/audit-trail`, `/audit`, `/logs` | ADMIN | Audit Trail |
| `/admin/consent` | `/consent-governance`, `/consent`, `/governance`, `/irb` | ADMIN | Consent & Governance |
| `/admin/devices` | `/device-management`, `/devices`, `/equipment` | ADMIN | Device Management |
| `/admin/users` | `/user-clinic-management`, `/users`, `/clinic`, `/staff` | ADMIN | User & Clinic Management |
| `/admin/research-datasets` | `/admin-research-datasets` | ADMIN | Research Datasets |
| `/admin/tickets` | `/tickets`, `/support`, `/helpdesk` | ADMIN | Support Tickets |

**Total preserved routes**: 100+ primary routes + 150+ aliases = 250+ working routes

### Appendix D: Icon Reference (66 Icons)

| # | Icon Key | Description | Used By |
|---|----------|-------------|---------|
| 1 | `layout-grid` | Grid/dashboard | Dashboard |
| 2 | `inbox` | Inbox tray | Inbox |
| 3 | `newspaper` | Newspaper | Clinician Digest |
| 4 | `calendar` | Calendar | Schedule, Session Planning |
| 5 | `users` | Multiple users | Patients, Group Therapy |
| 6 | `clipboard-check` | Checked clipboard | Assessments, Adherence Hub |
| 7 | `file-text` | Document | Documents |
| 8 | `video` | Video camera | Virtual Care |
| 9 | `zap` | Lightning bolt | Quick Actions, Neuromodulation Studio |
| 10 | `brain` | Brain | Brain Map, AI Clinical Intelligence, Cognitive |
| 11 | `activity` | Pulse line | Biometrics Analyzer |
| 12 | `map-pin` | Map pin | Stimulation Targets |
| 13 | `hard-drive` | Hard drive | Device Planning |
| 14 | `book-open` | Open book | Handbooks |
| 15 | `microscope` | Microscope | Research Evidence, Evidence Research, Trial Matcher |
| 16 | `shield-alert` | Shield with alert | Risk Analyzer |
| 17 | `dna` | DNA helix | Biomarkers, Genomic Analyzer |
| 18 | `heart-pulse` | Heart with pulse | Nutrition, Wellness Hub, Nutrition Analyzer |
| 19 | `pill` | Pill capsule | Medication Studio, Genetic Medication Analyzer |
| 20 | ` Accessibility` | Accessibility | Rehab / Physiotherapy |
| 21 | `heart` | Heart | Wellness & Lifestyle |
| 22 | `sparkles` | Sparkles | Complementary Interventions |
| 23 | `mic` | Microphone | Voice Analyzer |
| 24 | `align-left` | Text alignment | Text Analyzer |
| 25 | `scan-eye` | Eye scanning | Video Assessments |
| 26 | `move` | Movement arrows | Movement Analyzer |
| 27 | `smartphone` | Smartphone | Digital Phenotyping |
| 28 | `puzzle` | Puzzle piece | Behaviour Workspace |
| 29 | `scan` | Scanner frame | MRI Analyzer |
| 30 | `database` | Database cylinder | Bio Database, Research Datasets |
| 31 | `bar-chart-3` | Bar chart | Intervention Analyzer |
| 32 | `cpu` | CPU chip | Device Management |
| 33 | `git-branch` | Git branch | Phenotype Analyzer |
| 34 | `binary` | Binary code | (Reserved) |
| 35 | `bot` | Robot | AI Agents |
| 36 | `bot-message-square` | Bot message | (Reserved) |
| 37 | `shopping-cart` | Shopping cart | Marketplace |
| 38 | `graduation-cap` | Graduation cap | Academy |
| 39 | `activity-pulse` | Activity pulse | qEEG, Neurophysiology, Monitor |
| 40 | `bar-chart-2` | Bar chart alt | Outcome Measures, Reports, Population Analytics |
| 41 | `coins` | Coins | Finance |
| 42 | `table-2` | Table grid | Data Console |
| 43 | `clipboard-list` | Clipboard list | Audit Trail |
| 44 | `settings` | Settings gear | Settings (footer) |
| 45 | `users-cog` | Users with cog | User & Clinic Management |
| 46 | `file-bar-chart` | File with chart | (Reserved) |
| 47 | `layers` | Layers stack | (Reserved) |
| 48 | `radar` | Radar scan | Forecast & Simulation, fNIRS |
| 49 | `atom` | Atom | DeepTwin, DeepTwin Simulation, PET |
| 50 | `search` | Magnifying glass | Search icon |
| 51 | `bell` | Bell | (Reserved for notifications) |
| 52 | `lock` | Lock | Consent & Governance |
| 53 | `ticket` | Ticket | Support Tickets |
| 54 | `flask-conical` | Flask | Labs Analyzer |
| 55 | `wand-2` | Magic wand | (Reserved) |
| 56 | `scroll-text` | Scroll | Home Program |
| 57 | `user-check` | User checked | (Reserved) |
| 58 | `circle-dot` | Circle with dot | Fallback icon |
| 59 | `trending-up` | Trending up | Longitudinal Insights |
| 60 | `network` | Network graph | Multimodal Correlations, Knowledge Graph, Referral Network |
| 61 | `timer` | Timer/stopwatch | Patient Timeline, Sleep Analyzer |
| 62 | `circle-plus` | Plus in circle | Protocol Builder |
| 63 | `cone` | Cone | Surgical Planning |
| 64 | `target` | Target | Patient Goals |
| 65 | `umbrella` | Umbrella | Insurance Portal |
| 66 | `eye` | Eye | Help (footer) |

### Appendix E: CSS Class Reference

#### Container
| Class | Description |
|-------|-------------|
| `.ds-sidebar` | Main sidebar container (260px width) |
| `.ds-sidebar--collapsed` | Collapsed state (60px width) |

#### Search
| Class | Description |
|-------|-------------|
| `.ds-sidebar__search` | Search container |
| `.ds-sidebar__search--collapsed` | Collapsed search (icon only) |
| `.ds-sidebar__search-icon` | Search SVG icon |
| `.ds-sidebar__search-input` | Search text input |

#### Sections
| Class | Description |
|-------|-------------|
| `.ds-sidebar__section` | Section container |
| `.ds-sidebar__section-header` | Clickable section header |
| `.ds-sidebar__section-label` | Section name text |
| `.ds-sidebar__section-chevron` | Expand/collapse chevron |
| `.ds-sidebar__section-chevron--collapsed` | Collapsed chevron state |
| `.ds-sidebar__section-items` | Section items container |

#### Items
| Class | Description |
|-------|-------------|
| `.ds-sidebar__item` | Navigation item |
| `.ds-sidebar__item--active` | Currently active item |
| `.ds-sidebar__item--beta` | Beta status item |
| `.ds-sidebar__item--preview` | Preview status item |
| `.ds-sidebar__item--coming-soon` | Coming soon item (disabled) |
| `.ds-sidebar__item--search-match` | Search result match |
| `.ds-sidebar__icon` | Item icon container |
| `.ds-sidebar__label` | Item label text |
| `.ds-sidebar__tooltip` | Collapsed mode tooltip |
| `.ds-sidebar__subitems` | Child items container |

#### Badges
| Class | Description |
|-------|-------------|
| `.ds-sidebar__badge` | Base badge |
| `.ds-sidebar__badge--beta` | Beta badge (amber) |
| `.ds-sidebar__badge--preview` | Preview badge (teal) |
| `.ds-sidebar__badge--comingSoon` | Coming soon badge (slate) |
| `.ds-sidebar__badge--ai` | AI badge (purple) |
| `.ds-sidebar__badge--urgent` | Urgent badge (red) |

#### Footer
| Class | Description |
|-------|-------------|
| `.ds-sidebar__footer` | Footer container |

#### CSS Custom Properties (Variables)
| Variable | Default | Description |
|----------|---------|-------------|
| `--sidebar-bg` | `#0b1120` | Sidebar background |
| `--border` | `rgba(255,255,255,0.08)` | Border color |
| `--text-primary` | `#e2e8f0` | Primary text |
| `--text-secondary` | `#94a3b8` | Secondary text |
| `--text-tertiary` | `#64748b` | Tertiary/muted text |
| `--teal` | `#00d4bc` | Accent/teal color |
| `--bg-card` | `#1e293b` | Card background |
| `--nav-section-clinical` | `#38bdf8` | TODAY section tint (sky) |
| `--nav-section-patients` | `#818cf8` | PATIENTS section tint (indigo) |
| `--nav-section-protocol` | `#fbbf24` | INTERVENTIONS section tint (amber) |
| `--nav-section-analyzers` | `#a78bfa` | ANALYZERS section tint (purple) |
| `--nav-section-intelligence` | `#2dd4bf` | INTELLIGENCE section tint (teal) |
| `--nav-section-marketplace` | `#34d399` | ECOSYSTEM section tint (emerald) |
| `--nav-section-admin` | `#94a3b8` | ADMIN section tint (slate) |

### Appendix F: Test Coverage Matrix

#### Unit Tests

| Test Category | Count | Test Cases |
|---------------|-------|------------|
| **Registry validation** | 8 | Required fields, unique IDs, valid sections, valid status, icon existence, child validation, full validation pass, error reporting |
| **Role filtering** | 10 | Each of 10 roles sees correct items; super admin sees all; hidden items excluded; children filtered |
| **Route lookup** | 8 | Exact route match, alias match, parent route match, root fallback, nested children, null for unknown route, case sensitivity, trailing slash |
| **Active route detection** | 6 | Exact match, child route prefix, alias match, alias prefix, root handling, no match |
| **Search** | 6 | Label match, keyword match, description match, route match, case insensitivity, empty query |
| **Rendering** | 8 | HTML output, XSS escaping, badge rendering, AI badge, section structure, collapsed mode, children rendering, footer |
| **Section state** | 4 | Toggle, persist, retrieve, default values |
| **Custom events** | 2 | Event fires, event detail correct |
| **Statistics** | 4 | Item count, section counts, status counts, role counts |
| **Accessibility** | 4 | ARIA attributes, roles, keyboard handlers, focus management |

#### Integration Tests

| Test Category | Count | Test Cases |
|---------------|-------|------------|
| **End-to-end rendering** | 4 | Full sidebar renders for each major role; sections in correct order |
| **Search integration** | 2 | Search input filters items; clear restores all |
| **Section toggle** | 2 | Click toggles section; state persists across renders |
| **Route change** | 2 | Active item updates on route change; highlight correct |

#### Total: 40+ Tests

| Test Type | Count |
|-----------|-------|
| Unit tests | 60 |
| Integration tests | 10 |
| **Total** | **70** |

### Appendix G: Glossary

| Term | Definition |
|------|------------|
| **Analyzer** | A tool that processes clinical data (voice, text, video, imaging) to extract insights |
| **Break-glass** | Emergency override that bypasses normal access controls, with full audit logging |
| **CCA** | Canonical Correlation Analysis -- statistical method for finding cross-modal relationships |
| **Clinician OS** | Clinician Operating System -- unified platform for clinical workflows |
| **COMING_SOON** | Status indicating a feature is on the roadmap but not yet functional |
| **DeepDyn** | Intelligence layer providing hypothesis generation and confidence calibration |
| **DeepReview** | Multimodal fusion engine that correlates outputs from multiple analyzers |
| **DeepTwin** | Patient digital twin -- computational model synthesizing multimodal patient data |
| **DTW** | Dynamic Time Warping -- algorithm for aligning temporal sequences |
| **EHR** | Electronic Health Record |
| **Evidence Grade** | Quality rating (A-D) for clinical evidence supporting a finding |
| **FHIR** | Fast Healthcare Interoperability Resources -- HL7 standard for clinical data exchange |
| **Granger Causality** | Statistical method for determining if one time series predicts another |
| **Hidden** | Status indicating a feature is feature-flagged off and not rendered |
| **HRV** | Heart Rate Variability -- physiological measure from wearables |
| **Multimodal** | Involving multiple data types (imaging, voice, text, physiological, genetic) |
| **NAV_ITEMS** | The source-of-truth array containing all 74 navigation item definitions |
| **PHI** | Protected Health Information -- patient data requiring privacy protection |
| **Progressive Disclosure** | UI pattern showing essential information first, details on demand |
| **qEEG** | Quantitative EEG -- computational analysis of electroencephalography |
| **RBAC** | Role-Based Access Control -- permissions based on user roles |
| **Role Group** | Named collection of roles for convenient access assignment |
| **SaMD** | Software as Medical Device -- FDA classification for clinical software |
| **Sidebar** | Primary navigation component organizing all platform features |
| **Status Badge** | Visual indicator showing feature lifecycle state (beta, preview, coming-soon) |
| **Uncertainty Tier** | Confidence level (High/Moderate/Low/Insufficient) for AI outputs |
| **XSS** | Cross-Site Scripting -- web security vulnerability prevented by output escaping |

### Appendix H: Change Log

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0.0 | 2026-04-01 | Initial sidebar with 40 items, 5 sections | DeepSynaps Architecture Team |
| 1.1.0 | 2026-04-15 | Added ANALYZERS section with 12 analyzers; role system expanded | DeepSynaps Architecture Team |
| 1.2.0 | 2026-04-22 | Added INTELLIGENCE section with DeepTwin; search functionality | DeepSynaps Architecture Team |
| 1.3.0 | 2026-04-29 | Added ECOSYSTEM section; admin items consolidated | DeepSynaps Architecture Team |
| 2.0.0 | 2026-05-06 | Complete rewrite: 74 items, 7 sections, 10 roles, question-based navigation, full schema | DeepSynaps Architecture Team |
| 2.0.1 | 2026-05-08 | Added 6 children to Protocol Studio; alias system expanded | DeepSynaps Architecture Team |
| 2.0.2 | 2026-05-10 | CSS architecture complete; dark mode; responsive collapse | DeepSynaps Architecture Team |
| 2.0.3 | 2026-05-12 | Test API complete; 40+ tests; registry validation | DeepSynaps Architecture Team |
| 3.0.0 | 2026-05-15 | FINAL: Master roadmap document; 7 research reports integrated; complete architecture documentation | DeepSynaps Architecture Team |

### Document Statistics

| Metric | Value |
|--------|-------|
| Total lines | 3,000+ |
| Sections | 15 major sections |
| Appendices | 8 (A through H) |
| Navigation items documented | 74 (80 with children) |
| Roles documented | 10 |
| Research reports referenced | 7 (27,155 lines) |
| Icons documented | 66 |
| CSS classes documented | 30+ |
| Test cases documented | 70 |
| Routes documented | 100+ primary + 150+ aliases |
| Tables | 100+ |

### End of Document

---

> "The best clinician interface is one that answers questions before they are asked."
> -- DeepSynaps Design Philosophy

**This document is the authoritative reference for the DeepSynaps Clinician Operating System architecture. All implementation decisions should trace back to the principles, patterns, and specifications documented here.**

**Copyright 2026 DeepSynaps Protocol Studio. All rights reserved.**

---
