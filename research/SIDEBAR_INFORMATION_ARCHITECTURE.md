# Sidebar Information Architecture

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Active |
| Last Updated | 2026-05-14 |
| Author | DeepSynaps Architecture Team |
| Reviewers | Clinical UX Board, Safety Committee |
| Target Audience | Frontend Engineers, UX Designers, Product Managers |
| Related Documents | ROLE_AWARE_NAVIGATION_MATRIX.md, ANALYZER_INTERVENTION_ARCHITECTURE.md, DEEPSYNAPS_MULTIMODAL_WIRING_MAP.md |

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Section Hierarchy](#section-hierarchy)
3. [Section 1: TODAY](#section-1-today)
4. [Section 2: PATIENTS](#section-2-patients)
5. [Section 3: INTERVENTIONS](#section-3-interventions)
6. [Section 4: ANALYZERS](#section-4-analyzers)
7. [Section 5: INTELLIGENCE](#section-5-intelligence)
8. [Section 6: ECOSYSTEM](#section-6-ecosystem)
9. [Section 7: ADMIN](#section-7-admin)
10. [Navigation Item Schema](#navigation-item-schema)
11. [Active Route Highlighting](#active-route-highlighting)
12. [Status Badges](#status-badges)
13. [Search](#search)
14. [Mobile Behavior](#mobile-behavior)
15. [Keyboard Navigation](#keyboard-navigation)
16. [Animation & Transitions](#animation--transitions)
17. [State Management](#state-management)
18. [Performance](#performance)
19. [Accessibility](#accessibility)
20. [Implementation Notes](#implementation-notes)
21. [Appendices](#appendices)

---

## Design Principles

### 1. Clinician-First Organization

The sidebar is organized around the clinician's daily workflow, not the system's technical architecture. Every section, label, and grouping decision prioritizes the mental model of a healthcare provider managing patient care.

**Rationale:** Clinicians think in terms of "What requires my attention?" not "Which module should I navigate to?" The information architecture must map to clinical workflow stages: attention, assessment, intervention, analysis, intelligence, and administration.

**Implementation:**
- Section ordering follows the clinical day: TODAY first (urgent), PATIENTS second (context), INTERVENTIONS third (actions)
- Labels use clinical terminology (e.g., "Neuromodulation Studio" not "TMS Configuration Tool")
- Grouping reflects care team collaboration patterns
- Priority indicators surface time-sensitive items

**Anti-patterns to avoid:**
- Technical module names (e.g., "User Management" instead of "My Team")
- Alphabetical ordering of unrelated items
- Deep nesting that hides commonly used tools
- System-oriented categories (e.g., "Settings" as a top-level section)

### 2. Task-Oriented Grouping

Navigation items are grouped by the clinical task they support, not by the underlying data model or technical component.

**Task Categories:**
| Task Type | Description | Example Items |
|-----------|-------------|---------------|
| Attention | Requires immediate action | Inbox alerts, urgent reviews |
| Review | Information consumption | Dashboard, Digest, Reports |
| Assessment | Data collection | Assessments, Biomarkers, Imaging |
| Intervention | Treatment execution | Protocols, Medication adjustments |
| Analysis | Intelligence extraction | Analyzers, Correlations |
| Administration | Operational management | Billing, User management |

**Benefits:**
- Reduces cognitive load by matching clinical mental models
- Accelerates wayfinding for experienced users
- Supports muscle memory through consistent positioning
- Enables role-based filtering by task relevance

### 3. Role-Aware Visibility

Every navigation item has a defined visibility rule based on user role. The sidebar dynamically adjusts to show only relevant items for the authenticated user's role.

**Roles:**
| Role | Description | Typical Workflow |
|------|-------------|------------------|
| patient | Patient self-service | View own data, schedule appointments |
| receptionist | Front desk operations | Scheduling, billing, patient check-in |
| clinician | Primary care provider | Patient care, assessments, treatment |
| reviewer | Clinical reviewer | Review cases, approve protocols |
| technician | Technical operations | Run equipment, capture data |
| resident | Trainee physician | Supervised patient care |
| clinic_admin | Clinic administrator | Operations, billing, staff management |
| researcher | Research investigator | Data analysis, research datasets |
| super_admin | Platform administrator | Full system access |
| internal_admin | Internal operations | CRM, internal tools |

**Visibility Rules:**
- Items visible to ALL roles (common utilities)
- Items visible to specific role groups (clinical, admin, research)
- Items visible only with specific permissions
- Items conditionally visible based on feature flags

### 4. Progressive Disclosure

The sidebar uses progressive disclosure to manage complexity:

**Level 1 - Sections:** Always visible, collapsed to icon-only in compact mode
**Level 2 - Items:** Visible within expanded sections
**Level 3 - Children:** Visible on hover/click of parent items with children
**Level 4 - Actions:** Contextual actions within selected pages

**Disclosure Strategy:**
| Context | Disclosure Level | Rationale |
|---------|-----------------|-----------|
| New user | Expand all sections | Orientation and discovery |
| Regular user | Remember last state | Efficiency and muscle memory |
| Mobile | Collapse all initially | Screen real estate |
| Onboarding | Highlight relevant sections | Guided experience |

### 5. Safety-Integrated UX

Safety indicators are embedded directly in the navigation, not as an afterthought.

**Safety Elements:**
- Status badges on items requiring attention
- Alert counts on Inbox and Dashboard
- "Requires review" indicators on flagged items
- Evidence strength indicators on analytical tools
- Consent status on patient-facing features

**Safety Principles:**
- Never hide safety-critical information behind navigation
- Always surface urgent items in TODAY section
- Use color coding consistently for safety states
- Provide clear visual hierarchy for alert severity

---

## Section Hierarchy

### Overview

The sidebar is organized into 7 top-level sections, each addressing a distinct domain of clinical workflow:

```
Sidebar
├── TODAY           "What requires my attention?"
├── PATIENTS        "Who am I managing?"
├── INTERVENTIONS   "What treatments/care plans?"
├── ANALYZERS       "What intelligence/analysis?"
├── INTELLIGENCE    "What multimodal synthesis?"
├── ECOSYSTEM       "What external resources?"
└── ADMIN           "How is clinic managed?"
```

### Section Ordering Rationale

| Priority | Section | Clinical Rationale |
|----------|---------|-------------------|
| 1 | TODAY | Clinicians start their day with attention management |
| 2 | PATIENTS | After attention, clinicians need patient context |
| 3 | INTERVENTIONS | With patient context, clinicians plan treatments |
| 4 | ANALYZERS | To inform treatments, clinicians need data analysis |
| 5 | INTELLIGENCE | Synthesized insights support decision-making |
| 6 | ECOSYSTEM | External resources supplement clinical workflows |
| 7 | ADMIN | Operational tasks are lowest priority in clinical flow |

### Section Expansion Rules

| Rule | Behavior | Default |
|------|----------|---------|
| Single expand | Only one section expanded at a time | False (multiple allowed) |
| Auto-expand | Auto-expand section containing active route | True |
| Persist state | Remember expanded/collapsed state | True (localStorage) |
| Scroll to active | Auto-scroll to keep active item visible | True |

---

## Section 1: TODAY

### Purpose

"What requires my attention?"

The TODAY section surfaces time-sensitive, actionable items that demand the clinician's immediate attention. This section is always positioned at the top of the sidebar because it represents the start of the clinical workflow.

### Clinical Context

The TODAY section maps to the clinician's morning routine: check messages, review overnight alerts, scan the day's schedule, and read the clinical digest summarizing everything that happened since last login.

### Items

#### 1.1 Dashboard

| Field | Value |
|-------|-------|
| ID | dashboard |
| Label | Dashboard |
| Route | /dashboard |
| Aliases | /home, /main |
| Icon | layout-dashboard |
| Section | today |
| Required Roles | ALL (except patient) |
| Status | active |
| Description | Overview of clinic operations and patient status |
| Keywords | home, overview, summary, main, landing |
| Children | None |

**Dashboard Sub-components:**
- Morning report summary
- Alert widget (critical + warning counts)
- Today's schedule preview
- Recent patient activity
- Task list
- Performance metrics

#### 1.2 Inbox

| Field | Value |
|-------|-------|
| ID | inbox |
| Label | Inbox |
| Route | /inbox |
| Aliases | /messages, /notifications, /alerts |
| Icon | inbox |
| Section | today |
| Required Roles | receptionist, clinician, reviewer, resident, clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Secure messages, alerts, and notifications requiring action |
| Keywords | messages, notifications, alerts, communications, secure messaging |
| Children | None |

**Inbox Features:**
- Unread message count badge
- Priority filtering (urgent, normal, low)
- Message threading
- Attachment support
- @mentions system
- Integration with patient records

#### 1.3 Clinician Digest

| Field | Value |
|-------|-------|
| ID | clinician-digest |
| Label | Clinician Digest |
| Route | /digest |
| Aliases | /daily-digest, /morning-report, /briefing |
| Icon | newspaper |
| Section | today |
| Required Roles | clinician, reviewer, resident, clinic_admin, super_admin |
| Status | active |
| Description | AI-generated summary of overnight patient events and care team updates |
| Keywords | digest, briefing, report, summary, daily, morning |
| Children | None |

**Digest Content:**
- New patient admissions
- Overnight biomarker alerts
- Medication adherence updates
- Assessment completions
- Protocol deviations
- Team communications summary

#### 1.4 Schedule

| Field | Value |
|-------|-------|
| ID | schedule |
| Label | Schedule |
| Route | /schedule |
| Aliases | /calendar, /appointments, /agenda |
| Icon | calendar |
| Section | today |
| Required Roles | ALL |
| Status | active |
| Description | Calendar view of appointments, sessions, and deadlines |
| Keywords | calendar, appointments, agenda, timeline, bookings |
| Children | None |

**Schedule Views:**
- Day view (default)
- Week view
- Month view
- Agenda view
- Resource scheduling
- Availability management

### TODAY Section State Management

| State | Behavior |
|-------|----------|
| Empty inbox | No badge, inbox icon normal |
| Unread messages | Badge with count, inbox icon accent |
| Urgent alerts | Badge with count + pulse animation |
| Digest unread | Dot indicator on digest icon |
| Upcoming appointments | Subtle indicator on schedule icon |

---

## Section 2: PATIENTS

### Purpose

"Who am I managing?"

The PATIENTS section provides access to patient records, assessments, documents, and virtual care tools. This is the primary workspace for clinical data access.

### Clinical Context

After checking what requires attention (TODAY), clinicians need to access patient information to provide care. This section is the gateway to all patient-centric functionality.

### Items

#### 2.1 Patients

| Field | Value |
|-------|-------|
| ID | patients |
| Label | Patients |
| Route | /patients |
| Aliases | /patient-list, /patient-directory, /cases |
| Icon | users |
| Section | patients |
| Required Roles | ALL (patient sees own record only) |
| Status | active |
| Description | Patient directory with search, filter, and quick access to records |
| Keywords | patients, cases, directory, list, roster, caseload |
| Children | None |

**Patient List Features:**
- Advanced search (name, DOB, MRN, condition)
- Filter by status (active, pending, discharged)
- Sort by last activity, priority, name
- Quick actions (view, message, schedule)
- Caseload assignment indicators
- Risk stratification badges

#### 2.2 Assessments

| Field | Value |
|-------|-------|
| ID | assessments |
| Label | Assessments |
| Route | /assessments |
| Aliases | /evaluations, /screening, /measures |
| Icon | clipboard-list |
| Section | patients |
| Required Roles | ALL |
| Status | active |
| Description | Clinical assessments, scales, questionnaires, and outcome measures |
| Keywords | assessments, evaluations, scales, questionnaires, screening, measures, outcomes |
| Children | None |

**Assessment Types:**
- PHQ-9 (Depression)
- GAD-7 (Anxiety)
- MoCA (Cognitive)
- Custom clinic protocols
- Biometric assessments
- Self-reported measures
- Clinician-rated scales

#### 2.3 Documents

| Field | Value |
|-------|-------|
| ID | documents |
| Label | Documents |
| Route | /documents |
| Aliases | /files, /records, /documentation |
| Icon | file-text |
| Section | patients |
| Required Roles | ALL |
| Status | active |
| Description | Patient documents, clinical notes, reports, and file management |
| Keywords | documents, files, notes, reports, records, documentation |
| Children | None |

**Document Types:**
- Clinical notes (progress notes, session notes)
- Lab reports
- Imaging reports
- Consent forms
- Discharge summaries
- Referral letters
- Uploaded files

#### 2.4 Virtual Care

| Field | Value |
|-------|-------|
| ID | virtual-care |
| Label | Virtual Care |
| Route | /virtual-care |
| Aliases | /telehealth, /video-consult, /remote-care |
| Icon | video |
| Section | patients |
| Required Roles | clinician, reviewer, resident, clinic_admin, super_admin |
| Status | active |
| Description | Telehealth sessions, video consultations, and remote monitoring |
| Keywords | telehealth, video, consultation, remote, virtual visit |
| Children | None |

**Virtual Care Features:**
- Video consultation interface
- Screen sharing
- Session recording (with consent)
- Real-time chat
- Virtual waiting room
- Session notes integration

### PATIENTS Section Integration

| Feature | Integration Point |
|---------|------------------|
| Patient search | Global search bar |
| Quick patient switch | Recent patients dropdown |
| Patient context | Persisted across sidebar navigation |
| Demographics bar | Sticky patient header |
| Risk indicators | Color-coded patient avatars |

---

## Section 3: INTERVENTIONS

### Purpose

"What treatments and care plans am I managing?"

The INTERVENTIONS section contains all treatment planning, protocol management, and therapeutic tools. This is the largest section and includes the Protocol Studio (Neuromodulation) with its 6 child items.

### Clinical Context

Interventions represent the active treatment phase of clinical workflow. This section connects patient assessments to treatment plans and enables monitoring of intervention outcomes.

### Items

#### 3.1 Neuromodulation Studio

| Field | Value |
|-------|-------|
| ID | neuromodulation-studio |
| Label | Neuromodulation Studio |
| Route | /interventions/neuromodulation |
| Aliases | /protocol-studio, /tms, /neurostim |
| Icon | brain-circuit |
| Section | interventions |
| Required Roles | clinician, technician, resident, clinic_admin, super_admin |
| Status | active |
| Description | Comprehensive neuromodulation protocol design, management, and monitoring |
| Keywords | neuromodulation, TMS, tDCS, protocol, stimulation, neurostimulation |
| Children | 6 child items |

**Child Items:**

##### 3.1.1 Protocol Designer

| Field | Value |
|-------|-------|
| ID | protocol-designer |
| Label | Protocol Designer |
| Route | /interventions/neuromodulation/designer |
| Aliases | /protocol-builder, /tms-designer |
| Icon | pen-tool |
| Parent | neuromodulation-studio |
| Required Roles | clinician, clinic_admin, super_admin |
| Status | active |
| Description | Design custom neuromodulation protocols with parameter optimization |
| Keywords | design, builder, protocol, parameters, customize |

##### 3.1.2 Session Manager

| Field | Value |
|-------|-------|
| ID | session-manager |
| Label | Session Manager |
| Route | /interventions/neuromodulation/sessions |
| Aliases | /tms-sessions, /session-log |
| Icon | play-circle |
| Parent | neuromodulation-studio |
| Required Roles | clinician, technician, resident, clinic_admin, super_admin |
| Status | active |
| Description | Execute, monitor, and log neuromodulation sessions |
| Keywords | sessions, execute, run, monitor, log |

##### 3.1.3 Motor Threshold

| Field | Value |
|-------|-------|
| ID | motor-threshold |
| Label | Motor Threshold |
| Route | /interventions/neuromodulation/motor-threshold |
| Aliases | /mt, /rmt, /amt |
| Icon | activity |
| Parent | neuromodulation-studio |
| Required Roles | clinician, technician, resident, clinic_admin, super_admin |
| Status | active |
| Description | Motor threshold determination and tracking |
| Keywords | motor threshold, RMT, AMT, MT, mapping |

##### 3.1.4 Coil Positioning

| Field | Value |
|-------|-------|
| ID | coil-positioning |
| Label | Coil Positioning |
| Route | /interventions/neuromodulation/positioning |
| Aliases | /neuronavigation, /coil-nav |
| Icon | crosshair |
| Parent | neuromodulation-studio |
| Required Roles | clinician, technician, clinic_admin, super_admin |
| Status | active |
| Description | Neuronavigation and coil positioning guidance |
| Keywords | positioning, navigation, coil, targeting, stereotactic |

##### 3.1.5 Treatment Course

| Field | Value |
|-------|-------|
| ID | treatment-course |
| Label | Treatment Course |
| Route | /interventions/neuromodulation/course |
| Aliases | /treatment-plan, /protocol-schedule |
| Icon | calendar-days |
| Parent | neuromodulation-studio |
| Required Roles | clinician, resident, clinic_admin, super_admin |
| Status | active |
| Description | Multi-session treatment course planning and progress tracking |
| Keywords | course, plan, schedule, series, progression |

##### 3.1.6 Outcome Tracking

| Field | Value |
|-------|-------|
| ID | outcome-tracking |
| Label | Outcome Tracking |
| Route | /interventions/neuromodulation/outcomes |
| Aliases | /results, /efficacy, /response |
| Icon | trending-up |
| Parent | neuromodulation-studio |
| Required Roles | clinician, reviewer, resident, clinic_admin, super_admin |
| Status | active |
| Description | Track treatment outcomes, response rates, and efficacy metrics |
| Keywords | outcomes, results, efficacy, response, tracking, metrics |

#### 3.2 Medication Studio

| Field | Value |
|-------|-------|
| ID | medication-studio |
| Label | Medication Studio |
| Route | /interventions/medication |
| Aliases | /pharmacy, /meds, /prescribing |
| Icon | pill |
| Section | interventions |
| Required Roles | clinician, resident, clinic_admin, super_admin |
| Status | active |
| Description | Medication management, prescribing, and pharmacogenomic guidance |
| Keywords | medication, prescribing, pharmacy, drugs, pharmacogenomics |
| Children | None |

**Medication Studio Features:**
- Prescription management
- Drug interaction checking
- Pharmacogenomic alerts
- Dosing calculators
- Medication reconciliation
- Adherence tracking
- Side effect reporting

#### 3.3 Rehab

| Field | Value |
|-------|-------|
| ID | rehab |
| Label | Rehab |
| Route | /interventions/rehab |
| Aliases | /rehabilitation, /physical-therapy, /pt |
| Icon | dumbbell |
| Section | interventions |
| Required Roles | clinician, technician, resident, clinic_admin, super_admin |
| Status | active |
| Description | Rehabilitation protocols, exercise programs, and physical therapy tracking |
| Keywords | rehabilitation, physical therapy, exercise, rehab, PT |
| Children | None |

#### 3.4 Nutrition

| Field | Value |
|-------|-------|
| ID | nutrition |
| Label | Nutrition |
| Route | /interventions/nutrition |
| Aliases | /diet, /nutritional, /supplements |
| Icon | apple |
| Section | interventions |
| Required Roles | clinician, resident, clinic_admin, super_admin |
| Status | active |
| Description | Nutritional protocols, dietary planning, and supplement management |
| Keywords | nutrition, diet, supplements, dietary, food, micronutrients |
| Children | None |

#### 3.5 Wellness

| Field | Value |
|-------|-------|
| ID | wellness |
| Label | Wellness |
| Route | /interventions/wellness |
| Aliases | /lifestyle, /wellbeing, /self-care |
| Icon | heart-pulse |
| Section | interventions |
| Required Roles | clinician, patient, resident, clinic_admin, super_admin |
| Status | active |
| Description | Wellness protocols, lifestyle interventions, and self-care programs |
| Keywords | wellness, lifestyle, wellbeing, self-care, mindfulness |
| Children | None |

#### 3.6 Complementary

| Field | Value |
|-------|-------|
| ID | complementary |
| Label | Complementary |
| Route | /interventions/complementary |
| Aliases | /integrative, /alternative, /cam |
| Icon | leaf |
| Section | interventions |
| Required Roles | clinician, clinic_admin, super_admin |
| Status | active |
| Description | Complementary and integrative medicine protocols |
| Keywords | complementary, integrative, alternative, CAM, holistic |
| Children | None |

#### 3.7 Handbooks

| Field | Value |
|-------|-------|
| ID | handbooks |
| Label | Handbooks |
| Route | /interventions/handbooks |
| Aliases | /guides, /manuals, /sops |
| Icon | book-open |
| Section | interventions |
| Required Roles | ALL (except patient) |
| Status | active |
| Description | Clinical handbooks, standard operating procedures, and reference guides |
| Keywords | handbooks, guides, manuals, SOPs, protocols, reference |
| Children | None |

**Handbook Types:**
- Neuromodulation protocols reference
- Medication guidelines
- Assessment administration guides
- Safety procedures
- Equipment operation manuals
- Emergency protocols

#### 3.8 Research Evidence

| Field | Value |
|-------|-------|
| ID | research-evidence |
| Label | Research Evidence |
| Route | /interventions/evidence |
| Aliases | /evidence-base, /literature, /studies |
| Icon | flask-conical |
| Section | interventions |
| Required Roles | clinician, researcher, clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Evidence base for interventions with study summaries and meta-analyses |
| Keywords | evidence, research, studies, literature, meta-analysis, clinical trials |
| Children | None |

### INTERVENTIONS Section Layout

```
INTERVENTIONS
├── Neuromodulation Studio [expandable]
│   ├── Protocol Designer
│   ├── Session Manager
│   ├── Motor Threshold
│   ├── Coil Positioning
│   ├── Treatment Course
│   └── Outcome Tracking
├── Medication Studio
├── Rehab
├── Nutrition
├── Wellness
├── Complementary
├── Handbooks
└── Research Evidence
```

---

## Section 4: ANALYZERS

### Purpose

"What intelligence and analysis tools are available?"

The ANALYZERS section provides access to all 17 clinical analyzers that process patient data and generate insights. These are the core analytical engines of the DeepSynaps platform.

### Clinical Context

Analyzers transform raw clinical data into actionable insights. They are grouped by modality (imaging, electrophysiology, behavioral, etc.) to match clinical specialization patterns.

### Items

#### 4.1 MRI Analyzer

| Field | Value |
|-------|-------|
| ID | mri-analyzer |
| Label | MRI Analyzer |
| Route | /analyzers/mri |
| Aliases | /mri, /neuroimaging, /structural |
| Icon | scan |
| Section | analyzers |
| Required Roles | clinician, technician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Structural MRI analysis with segmentation, volumetrics, and pathology detection |
| Keywords | MRI, neuroimaging, structural, segmentation, volumetrics, brain |
| Children | None |

**MRI Analyzer Capabilities:**
- Brain segmentation (grey matter, white matter, CSF)
- Volumetric analysis
- Lesion detection
- Atlas registration
- Brain age estimation
- Pathology findings
- Report generation

#### 4.2 QEEG Analyzer

| Field | Value |
|-------|-------|
| ID | qeeg-analyzer |
| Label | QEEG Analyzer |
| Route | /analyzers/qeeg |
| Aliases | /qeeg, /eeg, /quantitative-eeg |
| Icon | waveform |
| Section | analyzers |
| Required Roles | clinician, technician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Quantitative EEG analysis with spectral power, connectivity, and neuromarkers |
| Keywords | QEEG, EEG, quantitative, spectral, connectivity, brainwaves |
| Children | None |

**QEEG Analyzer Capabilities:**
- Spectral power analysis
- Connectivity mapping
- Source localization
- Neuromarker extraction
- Artifact cleaning
- Normative comparison
- Topographic mapping

#### 4.3 Video Analyzer

| Field | Value |
|-------|-------|
| ID | video-analyzer |
| Label | Video Analyzer |
| Route | /analyzers/video |
| Aliases | /video, /computer-vision, /movement |
| Icon | video |
| Section | analyzers |
| Required Roles | clinician, technician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Video-based behavioral analysis with movement tracking and facial analysis |
| Keywords | video, behavioral, movement, facial, computer vision, digital phenotyping |
| Children | None |

#### 4.4 Voice Analyzer

| Field | Value |
|-------|-------|
| ID | voice-analyzer |
| Label | Voice Analyzer |
| Route | /analyzers/voice |
| Aliases | /voice, /speech, /audio, /acoustic |
| Icon | mic |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Voice and speech analysis for acoustic biomarkers and linguistic patterns |
| Keywords | voice, speech, acoustic, audio, linguistic, prosody |
| Children | None |

#### 4.5 Text Analyzer

| Field | Value |
|-------|-------|
| ID | text-analyzer |
| Label | Text Analyzer |
| Route | /analyzers/text |
| Aliases | /text, /nlp, /language, /notes-analysis |
| Icon | type |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Natural language processing for clinical notes and unstructured text |
| Keywords | text, NLP, language, notes, unstructured, clinical text |
| Children | None |

#### 4.6 Biomarker Analyzer

| Field | Value |
|-------|-------|
| ID | biomarker-analyzer |
| Label | Biomarker Analyzer |
| Route | /analyzers/biomarker |
| Aliases | /biomarkers, /lab, /blood |
| Icon | test-tube |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Blood-based biomarker analysis including neuroinflammatory, hormonal, and metabolic panels |
| Keywords | biomarkers, blood, lab, neuroinflammation, hormones, metabolic |
| Children | None |

#### 4.7 Genetic Analyzer

| Field | Value |
|-------|-------|
| ID | genetic-analyzer |
| Label | Genetic Analyzer |
| Route | /analyzers/genetic |
| Aliases | /genetics, /pgx, /pharmacogenomics, /dna |
| Icon | dna |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Pharmacogenomic analysis and genetic variant interpretation |
| Keywords | genetic, pharmacogenomics, PGx, DNA, variants, CYP |
| Children | None |

#### 4.8 Medication Analyzer

| Field | Value |
|-------|-------|
| ID | medication-analyzer |
| Label | Medication Analyzer |
| Route | /analyzers/medication |
| Aliases | /med-analysis, /drug-interactions, /polypharmacy |
| Icon | pill |
| Section | analyzers |
| Required Roles | clinician, resident, clinic_admin, super_admin |
| Status | active |
| Description | Medication interaction analysis, polypharmacy review, and adverse effect prediction |
| Keywords | medication, drugs, interactions, polypharmacy, adverse effects |
| Children | None |

#### 4.9 Movement Analyzer

| Field | Value |
|-------|-------|
| ID | movement-analyzer |
| Label | Movement Analyzer |
| Route | /analyzers/movement |
| Aliases | /gait, /motor, /kinematics |
| Icon | person-standing |
| Section | analyzers |
| Required Roles | clinician, technician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Movement and gait analysis for motor function assessment |
| Keywords | movement, gait, motor, kinematics, balance, coordination |
| Children | None |

#### 4.10 Sleep Analyzer

| Field | Value |
|-------|-------|
| ID | sleep-analyzer |
| Label | Sleep Analyzer |
| Route | /analyzers/sleep |
| Aliases | /sleep, /polysomnography, /actigraphy |
| Icon | moon |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Sleep pattern analysis from polysomnography, actigraphy, and wearable data |
| Keywords | sleep, polysomnography, actigraphy, circadian, REM, sleep stages |
| Children | None |

#### 4.11 Cognitive Analyzer

| Field | Value |
|-------|-------|
| ID | cognitive-analyzer |
| Label | Cognitive Analyzer |
| Route | /analyzers/cognitive |
| Aliases | /cognition, /neuropsych, /cognitive-testing |
| Icon | brain |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Cognitive function analysis from neuropsychological test batteries |
| Keywords | cognitive, neuropsych, testing, memory, attention, executive |
| Children | None |

#### 4.12 Mood Analyzer

| Field | Value |
|-------|-------|
| ID | mood-analyzer |
| Label | Mood Analyzer |
| Route | /analyzers/mood |
| Aliases | /mood, /affect, /emotion |
| Icon | smile |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Mood and affect analysis from multimodal inputs (text, voice, video, self-report) |
| Keywords | mood, affect, emotion, depression, anxiety, sentiment |
| Children | None |

#### 4.13 Intervention Analyzer

| Field | Value |
|-------|-------|
| ID | intervention-analyzer |
| Label | Intervention Analyzer |
| Route | /analyzers/intervention |
| Aliases | /intervention-efficacy, /treatment-analysis, /outcome |
| Icon | activity |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Treatment outcome analysis with efficacy metrics and response prediction |
| Keywords | intervention, efficacy, outcome, treatment, response, prediction |
| Children | None |

#### 4.14 Fusion Analyzer

| Field | Value |
|-------|-------|
| ID | fusion-analyzer |
| Label | Fusion Analyzer |
| Route | /analyzers/fusion |
| Aliases | /multimodal, /fusion, /data-integration |
| Icon | git-merge |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Multimodal data fusion combining outputs from multiple analyzers |
| Keywords | fusion, multimodal, integration, combined, synthesis |
| Children | None |

#### 4.15 Risk Analyzer

| Field | Value |
|-------|-------|
| ID | risk-analyzer |
| Label | Risk Analyzer |
| Route | /analyzers/risk |
| Aliases | /risk, /prediction, /prognosis |
| Icon | shield-alert |
| Section | analyzers |
| Required Roles | clinician, reviewer, clinic_admin, super_admin |
| Status | active |
| Description | Risk stratification and clinical prediction models |
| Keywords | risk, prediction, prognosis, stratification, safety |
| Children | None |

#### 4.16 Digital Phenotyping Analyzer

| Field | Value |
|-------|-------|
| ID | digital-phenotyping-analyzer |
| Label | Digital Phenotyping |
| Route | /analyzers/digital-phenotyping |
| Aliases | /digital-phenotype, /passive-sensing, /behavioral |
| Icon | smartphone |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | beta |
| Description | Passive digital phenotyping from smartphone sensors and usage patterns |
| Keywords | digital phenotyping, passive sensing, smartphone, behavioral, digital biomarkers |
| Children | None |

#### 4.17 Neuroinflammation Analyzer

| Field | Value |
|-------|-------|
| ID | neuroinflammation-analyzer |
| Label | Neuroinflammation Analyzer |
| Route | /analyzers/neuroinflammation |
| Aliases | /neuroinflammatory, /inflammation, /immune |
| Icon | microchip |
| Section | analyzers |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | preview |
| Description | Neuroinflammatory marker analysis and immune-brain axis assessment |
| Keywords | neuroinflammation, immune, cytokines, inflammation, neuroimmune |
| Children | None |

### ANALYZERS Section Organization

**Grouping by Modality:**
| Group | Analyzers | Clinical Domain |
|-------|-----------|-----------------|
| Imaging | MRI Analyzer | Structural neuroimaging |
| Electrophysiology | QEEG Analyzer | Brain electrical activity |
| Behavioral | Video Analyzer, Movement Analyzer | Observable behavior |
| Language | Voice Analyzer, Text Analyzer | Communication |
| Biological | Biomarker Analyzer, Genetic Analyzer, Neuroinflammation Analyzer | Biological systems |
| Pharmacological | Medication Analyzer | Drug therapy |
| Functional | Sleep Analyzer, Cognitive Analyzer, Mood Analyzer | Function domains |
| Outcome | Intervention Analyzer, Risk Analyzer | Results and predictions |
| Multimodal | Fusion Analyzer, Digital Phenotyping Analyzer | Cross-modal integration |

---

## Section 5: INTELLIGENCE

### Purpose

"What multimodal synthesis and AI intelligence is available?"

The INTELLIGENCE section contains advanced AI-powered tools that synthesize across multiple analyzers and data sources to provide clinical decision support.

### Clinical Context

While analyzers process individual modalities, INTELLIGENCE tools synthesize across modalities to generate holistic insights that no single analyzer can produce.

### Items

#### 5.1 DeepTwin

| Field | Value |
|-------|-------|
| ID | deeptwin |
| Label | DeepTwin |
| Route | /intelligence/deeptwin |
| Aliases | /digital-twin, /patient-twin, /simulation |
| Icon | cpu |
| Section | intelligence |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | AI-powered digital twin for patient simulation and treatment optimization |
| Keywords | digital twin, simulation, prediction, modeling, virtual patient |
| Children | None |

**DeepTwin Features:**
- Patient-specific computational models
- Treatment response simulation
- What-if scenario analysis
- Causal inference engine
- Multimodal data integration
- Predictive trajectory modeling

#### 5.2 Evidence Research

| Field | Value |
|-------|-------|
| ID | evidence-research |
| Label | Evidence Research |
| Route | /intelligence/evidence |
| Aliases | /literature-review, /evidence-synthesis, /research-search |
| Icon | search |
| Section | intelligence |
| Required Roles | clinician, researcher, clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | AI-powered literature search and evidence synthesis across medical databases |
| Keywords | evidence, research, literature, PubMed, synthesis, systematic review |
| Children | None |

#### 5.3 Longitudinal Insights

| Field | Value |
|-------|-------|
| ID | longitudinal-insights |
| Label | Longitudinal Insights |
| Route | /intelligence/longitudinal |
| Aliases | /trajectory, /progress, /trends, /history |
| Icon | line-chart |
| Section | intelligence |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Longitudinal patient trajectory analysis with trend detection and change point analysis |
| Keywords | longitudinal, trajectory, trends, progress, history, change |
| Children | None |

#### 5.4 AI Clinical Intelligence

| Field | Value |
|-------|-------|
| ID | ai-clinical-intelligence |
| Label | AI Clinical Intelligence |
| Route | /intelligence/ai-clinical |
| Aliases | /clinical-ai, /decision-support, /ai-insights |
| Icon | sparkles |
| Section | intelligence |
| Required Roles | clinician, clinic_admin, super_admin |
| Status | beta |
| Description | AI-generated clinical insights and decision support recommendations |
| Keywords | AI, clinical intelligence, decision support, insights, recommendations |
| Children | None |

#### 5.5 Multimodal Correlations

| Field | Value |
|-------|-------|
| ID | multimodal-correlations |
| Label | Multimodal Correlations |
| Route | /intelligence/correlations |
| Aliases | /correlations, /cross-modal, /associations |
| Icon | link |
| Section | intelligence |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | active |
| Description | Cross-modality correlation discovery and pattern analysis |
| Keywords | correlations, multimodal, cross-modal, associations, patterns |
| Children | None |

#### 5.6 Forecast

| Field | Value |
|-------|-------|
| ID | forecast |
| Label | Forecast |
| Route | /intelligence/forecast |
| Aliases | /prediction, /prognosis, /future |
| Icon | telescope |
| Section | intelligence |
| Required Roles | clinician, researcher, clinic_admin, super_admin |
| Status | beta |
| Description | Predictive analytics for patient outcomes and clinic operations |
| Keywords | forecast, prediction, prognosis, predictive, future |
| Children | None |

#### 5.7 Research Datasets

| Field | Value |
|-------|-------|
| ID | research-datasets |
| Label | Research Datasets |
| Route | /intelligence/datasets |
| Aliases | /datasets, /data-repository, /cohorts |
| Icon | database |
| Section | intelligence |
| Required Roles | researcher, clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Curated research datasets, cohort definitions, and data export tools |
| Keywords | datasets, research, cohorts, repository, data export |
| Children | None |

---

## Section 6: ECOSYSTEM

### Purpose

"What external resources and integrations are available?"

The ECOSYSTEM section connects to external tools, AI agents, educational content, and marketplace resources.

### Items

#### 6.1 AI Agents

| Field | Value |
|-------|-------|
| ID | ai-agents |
| Label | AI Agents |
| Route | /ecosystem/ai-agents |
| Aliases | /agents, /ai-tools, /agent-marketplace |
| Icon | bot |
| Section | ecosystem |
| Required Roles | clinician, clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | AI agent marketplace and management for clinical workflow automation |
| Keywords | AI agents, bots, automation, agents, workflows |
| Children | None |

**AI Agent Types:**
- Clinical assistant agents
- Documentation agents
- Scheduling agents
- Patient communication agents
- Research assistant agents
- Quality assurance agents

#### 6.2 Marketplace

| Field | Value |
|-------|-------|
| ID | marketplace |
| Label | Marketplace |
| Route | /ecosystem/marketplace |
| Aliases | /store, /apps, /integrations |
| Icon | store |
| Section | ecosystem |
| Required Roles | ALL (except patient) |
| Status | active |
| Description | Third-party integrations, apps, and extensions for the DeepSynaps platform |
| Keywords | marketplace, store, apps, integrations, extensions, plugins |
| Children | None |

#### 6.3 Academy

| Field | Value |
|-------|-------|
| ID | academy |
| Label | Academy |
| Route | /ecosystem/academy |
| Aliases | /training, /education, /learning, /courses |
| Icon | graduation-cap |
| Section | ecosystem |
| Required Roles | ALL |
| Status | active |
| Description | Educational resources, training materials, and certification programs |
| Keywords | academy, training, education, learning, courses, certification |
| Children | None |

**Academy Content:**
- Neuromodulation certification
- Assessment administration training
- Platform onboarding
- Clinical best practices
- Research methodology
- Safety and compliance training

#### 6.4 Monitor

| Field | Value |
|-------|-------|
| ID | monitor |
| Label | Monitor |
| Route | /ecosystem/monitor |
| Aliases | /status, /system-health, /uptime |
| Icon | monitor |
| Section | ecosystem |
| Required Roles | clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | System monitoring, health checks, and operational dashboards |
| Keywords | monitor, status, health, uptime, system, operations |
| Children | None |

---

## Section 7: ADMIN

### Purpose

"How is the clinic managed?"

The ADMIN section contains operational and governance tools for clinic administration, financial management, data governance, and user management.

### Items

#### 7.1 Reports

| Field | Value |
|-------|-------|
| ID | reports |
| Label | Reports |
| Route | /admin/reports |
| Aliases | /reporting, /analytics, /clinic-reports |
| Icon | bar-chart-3 |
| Section | admin |
| Required Roles | clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Clinic reporting, analytics dashboards, and operational metrics |
| Keywords | reports, analytics, metrics, KPIs, dashboards, operations |
| Children | None |

**Report Types:**
- Patient volume reports
- Treatment outcome summaries
- Financial performance
- Staff productivity
- Quality metrics
- Compliance reports
- Custom report builder

#### 7.2 Finance

| Field | Value |
|-------|-------|
| ID | finance |
| Label | Finance |
| Route | /admin/finance |
| Aliases | /billing, /payments, /invoicing, /revenue |
| Icon | banknote |
| Section | admin |
| Required Roles | clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Financial management including billing, invoicing, payments, and revenue tracking |
| Keywords | finance, billing, payments, invoicing, revenue, accounting |
| Children | None |

#### 7.3 Data Console

| Field | Value |
|-------|-------|
| ID | data-console |
| Label | Data Console |
| Route | /admin/data-console |
| Aliases | /data, /data-management, /database |
| Icon | table-2 |
| Section | admin |
| Required Roles | clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Clinic data management console with exploration, export, and governance tools |
| Keywords | data, console, database, export, exploration, governance |
| Children | None |

#### 7.4 Audit Trail

| Field | Value |
|-------|-------|
| ID | audit-trail |
| Label | Audit Trail |
| Route | /admin/audit |
| Aliases | /audit, /logs, /activity, /history |
| Icon | scroll-text |
| Section | admin |
| Required Roles | clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Comprehensive audit trail of all system activities, access logs, and data changes |
| Keywords | audit, logs, activity, trail, compliance, history |
| Children | None |

#### 7.5 Consent & Governance

| Field | Value |
|-------|-------|
| ID | consent-governance |
| Label | Consent & Governance |
| Route | /admin/consent |
| Aliases | /consent, /governance, /privacy, /compliance |
| Icon | shield-check |
| Section | admin |
| Required Roles | clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Patient consent management, data governance policies, and compliance controls |
| Keywords | consent, governance, privacy, compliance, GDPR, HIPAA |
| Children | None |

**Consent Management Features:**
- Consent template management
- Patient consent status tracking
- Consent version history
- Withdrawal handling
- Data retention policies
- Privacy settings management
- Regulatory compliance (GDPR, HIPAA)

#### 7.6 Device Management

| Field | Value |
|-------|-------|
| ID | device-management |
| Label | Device Management |
| Route | /admin/devices |
| Aliases | /devices, /equipment, /hardware |
| Icon | monitor-smartphone |
| Section | admin |
| Required Roles | technician, clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Medical device management, calibration tracking, and maintenance scheduling |
| Keywords | devices, equipment, hardware, calibration, maintenance, TMS, EEG |
| Children | None |

#### 7.7 User & Clinic Management

| Field | Value |
|-------|-------|
| ID | user-clinic-management |
| Label | User & Clinic Management |
| Route | /admin/users |
| Aliases | /users, /staff, /team, /clinic-settings |
| Icon | users-2 |
| Section | admin |
| Required Roles | clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | User account management, role assignment, clinic configuration, and team settings |
| Keywords | users, staff, team, roles, clinic, settings, administration |
| Children | None |

#### 7.8 Research Datasets (Admin)

| Field | Value |
|-------|-------|
| ID | admin-research-datasets |
| Label | Research Datasets |
| Route | /admin/research-datasets |
| Aliases | /admin-datasets, /data-governance, /cohort-management |
| Icon | database |
| Section | admin |
| Required Roles | researcher, clinic_admin, super_admin, internal_admin |
| Status | active |
| Description | Research dataset administration, cohort management, and data governance |
| Keywords | research, datasets, cohorts, governance, data management |
| Children | None |

#### 7.9 Monitor (Admin)

| Field | Value |
|-------|-------|
| ID | admin-monitor |
| Label | Monitor |
| Route | /admin/monitor |
| Aliases | /admin-monitoring, /system-admin |
| Icon | activity |
| Section | admin |
| Required Roles | super_admin, internal_admin |
| Status | active |
| Description | Advanced system monitoring, performance metrics, and infrastructure health |
| Keywords | monitor, system, performance, infrastructure, health |
| Children | None |

---

## Navigation Item Schema

### Complete Schema Definition

```typescript
interface NavItem {
  /** Unique identifier for the navigation item */
  id: string;

  /** Display label shown in the sidebar */
  label: string;

  /** Primary route path */
  route: string;

  /** Alternative route paths that should highlight this item */
  aliases: string[];

  /** Icon name from the icon library */
  icon: string;

  /** Parent section identifier */
  section: Section;

  /** Roles that can see this item */
  requiredRoles: UserRole[];

  /** Feature availability status */
  status: 'active' | 'beta' | 'preview' | 'comingSoon' | 'hidden';

  /** Tooltip description text */
  description: string;

  /** Search keywords for discovery */
  keywords: string[];

  /** Child navigation items */
  children?: NavItem[];

  /** Badge text or count */
  badge?: string | number;

  /** Whether the item is disabled */
  disabled?: boolean;

  /** Custom CSS class */
  className?: string;

  /** Feature flag required for visibility */
  featureFlag?: string;

  /** Whether this item requires a specific license */
  licenseRequired?: string;

  /** Whether this item is visible in collapsed mode */
  visibleWhenCollapsed?: boolean;

  /** Priority for ordering within section */
  priority?: number;
}

type Section = 
  | 'today' 
  | 'patients' 
  | 'interventions' 
  | 'analyzers' 
  | 'intelligence' 
  | 'ecosystem' 
  | 'admin';

type UserRole = 
  | 'patient'
  | 'receptionist' 
  | 'clinician' 
  | 'reviewer' 
  | 'technician' 
  | 'resident' 
  | 'clinic_admin' 
  | 'researcher' 
  | 'super_admin' 
  | 'internal_admin';
```

### Schema Validation Rules

| Rule | Description | Error Level |
|------|-------------|-------------|
| Unique ID | All IDs must be unique across the entire navigation tree | Error |
| Route format | Routes must start with / and use kebab-case | Warning |
| Icon exists | Icon name must exist in the icon library | Error |
| Valid section | Section must be one of the defined section values | Error |
| Valid roles | All roles in requiredRoles must be defined | Error |
| Valid status | Status must be one of the defined status values | Error |
| Keywords length | At least 3 keywords recommended | Warning |
| Description length | Description should be 50-150 characters | Warning |
| Children depth | Maximum nesting depth is 2 levels | Error |

---

## Active Route Highlighting

### Visual Specification

When a navigation item matches the current route (primary route or alias), it receives the active state styling:

| Property | Value | CSS Variable |
|----------|-------|--------------|
| Background | rgba(0, 122, 122, 0.1) | --active-bg |
| Left border | 3px solid #007a7a | --teal |
| Icon color | #007a7a | --teal |
| Text weight | 600 (semi-bold) | --font-weight-semibold |
| Text color | #007a7a | --teal |
| Border radius | 0 6px 6px 0 | --radius-right |

### CSS Implementation

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  margin: 2px 0;
  border-left: 3px solid transparent;
  border-radius: 0 6px 6px 0;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-item:hover {
  background: rgba(0, 122, 122, 0.05);
  color: var(--text-primary);
}

.nav-item.active {
  background: rgba(0, 122, 122, 0.1);
  border-left-color: var(--teal);
  color: var(--teal);
  font-weight: 600;
}

.nav-item.active .nav-icon {
  color: var(--teal);
}

.nav-item .nav-icon {
  width: 20px;
  height: 20px;
  color: var(--text-secondary);
  transition: color 0.2s ease;
}
```

### Route Matching Logic

```typescript
function isRouteActive(item: NavItem, currentRoute: string): boolean {
  // Check primary route
  if (currentRoute === item.route) return true;

  // Check aliases
  if (item.aliases?.some(alias => currentRoute === alias)) return true;

  // Check prefix match for nested routes
  if (currentRoute.startsWith(item.route + '/')) return true;

  // Check alias prefix matches
  if (item.aliases?.some(alias => currentRoute.startsWith(alias + '/'))) return true;

  return false;
}
```

### Matching Behavior by Context

| Context | Match Strategy | Example |
|---------|---------------|---------|
| Exact | Full path equality | /dashboard matches /dashboard |
| Alias | Alias equality | /home matches Dashboard item (alias) |
| Prefix | Child route prefix | /analyzers/mri matches MRI Analyzer |
| Parameter | Route with params | /patients/123 matches /patients |
| Query | Ignores query string | /patients?filter=active matches /patients |

---

## Status Badges

### Badge Types

#### Beta Badge

| Property | Value |
|----------|-------|
| Indicator | Amber dot (8px circle) |
| Label | "BETA" |
| Label color | #c9a227 (amber) |
| Background | rgba(201, 162, 39, 0.1) |
| Border radius | 12px |
| Font size | 10px |
| Font weight | 600 |

**Behavior:**
- Visible on items with status: 'beta'
- Tooltip on hover: "This feature is in beta. Report issues via feedback."
- Clickable badge opens feedback dialog

#### Preview Badge

| Property | Value |
|----------|-------|
| Indicator | Blue dot (8px circle) |
| Label | "PREVIEW" |
| Label color | #3498db (blue) |
| Background | rgba(52, 152, 219, 0.1) |
| Border radius | 12px |
| Font size | 10px |
| Font weight | 600 |

**Behavior:**
- Visible on items with status: 'preview'
- Tooltip on hover: "Preview feature. Limited availability."
- May require opt-in to access

#### Coming Soon Badge

| Property | Value |
|----------|-------|
| Indicator | Grey lock icon (12px) |
| Label | "SOON" |
| Label color | #999999 (grey) |
| Background | rgba(153, 153, 153, 0.1) |
| Border radius | 12px |
| Font size | 10px |
| Font weight | 600 |

**Behavior:**
- Visible on items with status: 'comingSoon'
- Item is disabled (non-interactive)
- Tooltip on hover: "Coming soon. Join waitlist for early access."
- Shows lock icon to indicate inaccessibility

### Badge Positioning

Badges are positioned to the right of the navigation item label, aligned to the right edge of the sidebar:

```
[icon] Label Text              [BADGE]
```

### Badge State Transitions

| From | To | Trigger |
|------|-----|---------|
| comingSoon | preview | Feature enters limited release |
| preview | beta | Feature enters broader testing |
| beta | active | Feature graduates to GA |
| hidden | preview | Feature revealed to select users |

---

## Search

### Search Architecture

The sidebar search enables rapid navigation discovery through a command-palette-style interface.

### Searchable Fields

| Field | Weight | Match Type |
|-------|--------|------------|
| Label | 10 | Prefix + substring |
| Keywords | 8 | Exact + substring |
| Description | 5 | Substring |
| Route | 3 | Prefix |
| Section | 2 | Exact |

### Search Behavior

**Input Processing:**
1. Normalize: lowercase, trim whitespace
2. Tokenize: split on spaces for multi-term search
3. Filter: remove items not visible to current role
4. Score: rank by weighted field matches
5. Sort: highest score first, then alphabetical

**Result Display:**
- Maximum 10 results shown
- Highlight matching text
- Show section context
- Keyboard navigation (arrow keys + Enter)

### Keyboard Shortcut

| Shortcut | Action |
|----------|--------|
| Cmd+K (Mac) / Ctrl+K (Win) | Open search palette |
| Escape | Close search palette |
| Arrow Up/Down | Navigate results |
| Enter | Select highlighted result |
| Tab | Cycle through sections |

### Search Implementation

```typescript
interface SearchResult {
  item: NavItem;
  score: number;
  matches: SearchMatch[];
}

interface SearchMatch {
  field: 'label' | 'keywords' | 'description' | 'route' | 'section';
  indices: [number, number][];
}

function searchNavItems(
  query: string, 
  items: NavItem[], 
  userRole: UserRole
): SearchResult[] {
  const normalizedQuery = query.toLowerCase().trim();
  const tokens = normalizedQuery.split(/\s+/);

  return items
    .filter(item => isVisibleForRole(item, userRole))
    .map(item => ({
      item,
      score: calculateSearchScore(item, tokens),
      matches: findMatches(item, tokens)
    }))
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
```

### Search UI States

| State | Visual |
|-------|--------|
| Empty | Placeholder text: "Search navigation..." |
| Typing | Live results update |
| No results | "No results found for 'query'" |
| Loading | Skeleton loader (if async) |
| Error | Error message with retry |

---

## Mobile Behavior

### Breakpoint Strategy

| Breakpoint | Width | Sidebar Behavior |
|------------|-------|-----------------|
| Mobile | < 768px | Overlay mode |
| Tablet | 768-1024px | Collapsible (default collapsed) |
| Desktop | > 1024px | Expanded (default expanded) |

### Mobile Overlay Mode

**Trigger:** Hamburger menu button in app header

**Behavior:**
- Sidebar slides in from left as overlay
- Dark backdrop behind sidebar (rgba(0,0,0,0.5))
- Sidebar width: 280px (wider for touch)
- Swipe left on sidebar to close
- Tap backdrop to close
- Backdrop click closes sidebar

**Mobile-Specific Adjustments:**
| Element | Desktop | Mobile |
|---------|---------|--------|
| Sidebar width | 240px | 280px |
| Item height | 40px | 48px (touch target) |
| Icon size | 20px | 24px |
| Font size | 14px | 16px (prevents zoom) |
| Section header | 12px uppercase | 14px uppercase |
| Touch feedback | Hover | Ripple effect |

### Collapsed State (56px)

**Visual:**
- Only icons visible, no text labels
- Icons centered in 56px width container
- Tooltip on hover showing label
- Active state: teal background tint + icon color

**Interaction:**
- Hover to expand individual section
- Click icon to navigate directly
- Long-press for context menu (mobile)
- Expand/collapse toggle button at bottom

### Expanded State (240px)

**Visual:**
- Full labels visible next to icons
- Section headers visible
- Status badges visible
- Search bar visible
- Footer with user profile visible

### State Transitions

```css
.sidebar {
  width: 240px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar.collapsed {
  width: 56px;
}

.sidebar.mobile {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  z-index: 1000;
  transform: translateX(-100%);
  transition: transform 0.3s ease;
}

.sidebar.mobile.open {
  transform: translateX(0);
}
```

### Swipe Gestures

| Gesture | Action |
|---------|--------|
| Swipe right from left edge | Open sidebar (mobile) |
| Swipe left on sidebar | Close sidebar (mobile) |
| Swipe left on content (sidebar open) | Close sidebar |

---

## Keyboard Navigation

### Global Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| Cmd+K / Ctrl+K | Open search | Global |
| Cmd+B / Ctrl+B | Toggle sidebar | Global |
| Escape | Close sidebar / search | Global |
| Alt+1 | Focus TODAY section | Sidebar focused |
| Alt+2 | Focus PATIENTS section | Sidebar focused |
| Alt+3 | Focus INTERVENTIONS section | Sidebar focused |
| Alt+4 | Focus ANALYZERS section | Sidebar focused |
| Alt+5 | Focus INTELLIGENCE section | Sidebar focused |
| Alt+6 | Focus ECOSYSTEM section | Sidebar focused |
| Alt+7 | Focus ADMIN section | Sidebar focused |

### Sidebar-Specific Navigation

| Key | Action |
|-----|--------|
| Arrow Down | Next item |
| Arrow Up | Previous item |
| Arrow Right | Expand section / Enter child items |
| Arrow Left | Collapse section / Exit to parent |
| Enter | Navigate to item |
| Home | First item |
| End | Last visible item |
| Space | Toggle section expand/collapse |
| Tab | Next focusable element |
| Shift+Tab | Previous focusable element |

### Focus Management

```typescript
interface FocusState {
  /** Currently focused section index */
  sectionIndex: number;

  /** Currently focused item index within section */
  itemIndex: number;

  /** Whether focus is on a child item */
  childIndex: number | null;

  /** Whether sidebar has keyboard focus */
  hasFocus: boolean;
}

function handleKeyNavigation(
  event: KeyboardEvent,
  state: FocusState,
  sections: NavSection[]
): FocusState {
  switch (event.key) {
    case 'ArrowDown':
      return moveFocusDown(state, sections);
    case 'ArrowUp':
      return moveFocusUp(state, sections);
    case 'ArrowRight':
      return expandOrEnter(state, sections);
    case 'ArrowLeft':
      return collapseOrExit(state);
    case 'Enter':
      navigateToFocused(state, sections);
      return state;
    default:
      return state;
  }
}
```

### Focus Visual Indicator

| State | Style |
|-------|-------|
| Keyboard focused | 2px outline (offset 2px), teal color |
| Mouse hover | Background tint |
| Active route | Left border + background |
| Selected (keyboard) | Outline + background tint |

---

## Animation & Transitions

### Transition Definitions

| Animation | Duration | Easing | Property |
|-----------|----------|--------|----------|
| Sidebar expand/collapse | 300ms | cubic-bezier(0.4, 0, 0.2, 1) | width |
| Section expand/collapse | 200ms | ease-out | height, opacity |
| Mobile slide in/out | 300ms | ease | transform |
| Item hover | 150ms | ease | background, color |
| Active indicator | 200ms | ease | border-left, background |
| Badge appear | 150ms | ease-out | opacity, transform |
| Search open | 200ms | ease | opacity, transform |
| Tooltip show | 100ms | ease | opacity |

### Performance Guidelines

- Use `transform` and `opacity` for animations (GPU accelerated)
- Avoid animating `width`, `height`, `top`, `left`
- Use `will-change` sparingly on frequently animated elements
- Respect `prefers-reduced-motion` media query
- Debounce resize handlers

### Reduced Motion Support

```css
@media (prefers-reduced-motion: reduce) {
  .sidebar,
  .nav-item,
  .section-content {
    transition: none !important;
    animation: none !important;
  }
}
```

---

## State Management

### Sidebar State

```typescript
interface SidebarState {
  /** Whether sidebar is expanded or collapsed */
  isExpanded: boolean;

  /** IDs of expanded sections */
  expandedSections: string[];

  /** Currently active route */
  activeRoute: string;

  /** Whether mobile overlay is open */
  isMobileOpen: boolean;

  /** Whether search palette is open */
  isSearchOpen: boolean;

  /** Current search query */
  searchQuery: string;

  /** Filtered navigation items */
  filteredItems: NavItem[];

  /** Keyboard focus state */
  focusState: FocusState;

  /** User's last visited routes per section */
  recentRoutes: Record<string, string>;
}
```

### Persistence

| State | Storage | Key | TTL |
|-------|---------|-----|-----|
| Expanded/collapsed | localStorage | ds_sidebar_expanded | Indefinite |
| Expanded sections | localStorage | ds_sidebar_sections | Indefinite |
| Recent routes | localStorage | ds_sidebar_recent | 30 days |
| Search history | localStorage | ds_sidebar_search | 7 days |
| Mobile preference | localStorage | ds_sidebar_mobile | Indefinite |

### State Actions

```typescript
type SidebarAction =
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_EXPANDED'; payload: boolean }
  | { type: 'TOGGLE_SECTION'; payload: string }
  | { type: 'SET_ACTIVE_ROUTE'; payload: string }
  | { type: 'OPEN_MOBILE' }
  | { type: 'CLOSE_MOBILE' }
  | { type: 'OPEN_SEARCH' }
  | { type: 'CLOSE_SEARCH' }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'NAVIGATE'; payload: string }
  | { type: 'SET_FOCUS'; payload: FocusState };
```

---

## Performance

### Optimization Strategies

**Virtualization:**
- Sidebar items are not virtualized (typically < 100 items)
- Analyzer list may benefit from virtualization if expanded

**Lazy Loading:**
- Section content lazy-loaded on first expand
- Icons lazy-loaded via dynamic imports
- Search index built on first search interaction

**Memoization:**
- Navigation tree memoized per role
- Search results memoized by query
- Active state computed once per route change
- Visibility filter cached per role

### Loading Strategy

| Component | Loading Approach |
|-----------|-----------------|
| Sidebar shell | Eager (critical path) |
| Section items | Eager (above fold) |
| Icons | Dynamic import on first use |
| Search index | Web Worker (background) |
| Badges | Async after initial render |
| Tooltips | On-demand |

### Performance Budget

| Metric | Target |
|--------|--------|
| First paint | < 100ms |
| Interactive | < 200ms |
| Search response | < 50ms |
| Animation frame | 60fps |
| Memory footprint | < 10MB |

---

## Accessibility

### WCAG 2.1 AA Compliance

**1. Perceivable**
- All icons have text labels (visible or aria-label)
- Color is not the sole indicator of state (active has border + background)
- Text meets minimum contrast ratios (4.5:1 for body, 3:1 for large text)

**2. Operable**
- All functionality available via keyboard
- No time limits on navigation
- Focus order follows visual order
- Focus visible on all interactive elements

**3. Understandable**
- Consistent navigation labeling
- Predictable behavior across sessions
- Error prevention for destructive actions
- Section headers describe content

**4. Robust**
- Valid HTML semantics
- ARIA labels where needed
- Screen reader tested
- Works with browser zoom up to 200%

### ARIA Attributes

```html
<nav aria-label="Main navigation">
  <section aria-labelledby="section-today">
    <h2 id="section-today">TODAY</h2>
    <ul role="list">
      <li>
        <a 
          href="/dashboard" 
          aria-current="page"
          aria-label="Dashboard"
        >
          <span aria-hidden="true">[icon]</span>
          Dashboard
        </a>
      </li>
    </ul>
  </section>
</nav>
```

### Screen Reader Behavior

| Element | Screen Reader Output |
|---------|---------------------|
| Section header | "TODAY, section heading, level 2" |
| Nav item | "Dashboard, link, current page" |
| Item with badge | "Inbox, 5 unread, link" |
| Beta item | "AI Clinical Intelligence, beta, link" |
| Disabled item | "Monitor, coming soon, unavailable" |
| Expanded section | "ANALYZERS, expanded, section" |
| Collapsed section | "PATIENTS, collapsed, section" |

### Color Contrast Compliance

| Element | Foreground | Background | Ratio | Pass |
|---------|------------|------------|-------|------|
| Nav item text | #666666 | #ffffff | 5.74:1 | AA |
| Nav item active | #007a7a | rgba(0,122,122,0.1) | 4.6:1 | AA |
| Section header | #999999 | #ffffff | 2.84:1 | Large text only |
| Badge text | #c9a227 | rgba(201,162,39,0.1) | 3.2:1 | AA (large) |
| Search placeholder | #999999 | #f5f5f0 | 2.84:1 | N/A (placeholder) |

### Keyboard Accessibility

- All interactive elements reachable via Tab
- Logical focus order (top to bottom, left to right)
- Focus trap in mobile overlay
- Escape closes overlays and returns focus
- Skip link to main content

---

## Implementation Notes

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18+ |
| Styling | CSS Modules + CSS Variables |
| Icons | Lucide React |
| State | React Context + useReducer |
| Routing | React Router v6 |
| Animation | CSS transitions + Framer Motion (mobile) |
| Search | Fuse.js or custom implementation |

### Component Hierarchy

```
Sidebar
├── SidebarHeader (logo + toggle)
├── SidebarSearch (search bar + command palette)
├── SidebarSections
│   ├── NavSection (TODAY, PATIENTS, etc.)
│   │   ├── SectionHeader (collapsible)
│   │   └── NavItemList
│   │       ├── NavItem
│   │       │   ├── NavIcon
│   │       │   ├── NavLabel
│   │       │   ├── NavBadge (optional)
│   │       │   └── NavChildren (optional)
│   │       └── NavItem (child)
│   └── NavSection (next)
├── SidebarFooter (user profile + settings)
└── MobileOverlay (backdrop)
```

### Data Flow

```
User Interaction
    |
    v
Sidebar Context (useReducer)
    |
    +---> Navigation Service (filter by role)
    |         |
    |         v
    |   Filtered Nav Tree
    |         |
    +---> Router Integration
    |         |
    |         v
    |   Active Route Highlight
    |
    +---> Persistence Layer
              |
              v
         localStorage
```

### Testing Strategy

| Test Type | Coverage |
|-----------|----------|
| Unit | Reducer logic, utility functions |
| Integration | Component interactions, state changes |
| E2E | Full navigation flows, keyboard nav |
| Accessibility | axe-core, screen reader testing |
| Performance | Lighthouse, animation frame rates |
| Cross-browser | Chrome, Firefox, Safari, Edge |
| Mobile | Touch interactions, swipe gestures |

### Common Pitfalls

1. **Route matching on aliases** - Always check both route and aliases for active state
2. **Role filtering on search** - Search must respect role visibility
3. **Deep linking with collapsed sections** - Auto-expand section for deep links
4. **Mobile focus management** - Return focus to trigger button after closing
5. **Badge count updates** - Badge counts must update without full re-render
6. **Animation performance** - Use transform/opacity only, avoid layout thrashing

---

## Appendices

### Appendix A: Navigation Item Count by Section

| Section | Items | Children | Total Entries |
|---------|-------|----------|---------------|
| TODAY | 4 | 0 | 4 |
| PATIENTS | 4 | 0 | 4 |
| INTERVENTIONS | 8 | 6 | 14 |
| ANALYZERS | 17 | 0 | 17 |
| INTELLIGENCE | 7 | 0 | 7 |
| ECOSYSTEM | 4 | 0 | 4 |
| ADMIN | 9 | 0 | 9 |
| **TOTAL** | **53** | **6** | **59** |

### Appendix B: Icon Reference

| Item | Icon | Library Name |
|------|------|-------------|
| Dashboard | layout-dashboard | lucide-react |
| Inbox | inbox | lucide-react |
| Clinician Digest | newspaper | lucide-react |
| Schedule | calendar | lucide-react |
| Patients | users | lucide-react |
| Assessments | clipboard-list | lucide-react |
| Documents | file-text | lucide-react |
| Virtual Care | video | lucide-react |
| Neuromodulation Studio | brain-circuit | lucide-react |
| Protocol Designer | pen-tool | lucide-react |
| Session Manager | play-circle | lucide-react |
| Motor Threshold | activity | lucide-react |
| Coil Positioning | crosshair | lucide-react |
| Treatment Course | calendar-days | lucide-react |
| Outcome Tracking | trending-up | lucide-react |
| Medication Studio | pill | lucide-react |
| Rehab | dumbbell | lucide-react |
| Nutrition | apple | lucide-react |
| Wellness | heart-pulse | lucide-react |
| Complementary | leaf | lucide-react |
| Handbooks | book-open | lucide-react |
| Research Evidence | flask-conical | lucide-react |
| MRI Analyzer | scan | lucide-react |
| QEEG Analyzer | waveform | lucide-react |
| Video Analyzer | video | lucide-react |
| Voice Analyzer | mic | lucide-react |
| Text Analyzer | type | lucide-react |
| Biomarker Analyzer | test-tube | lucide-react |
| Genetic Analyzer | dna | lucide-react |
| Medication Analyzer | pill | lucide-react |
| Movement Analyzer | person-standing | lucide-react |
| Sleep Analyzer | moon | lucide-react |
| Cognitive Analyzer | brain | lucide-react |
| Mood Analyzer | smile | lucide-react |
| Intervention Analyzer | activity | lucide-react |
| Fusion Analyzer | git-merge | lucide-react |
| Risk Analyzer | shield-alert | lucide-react |
| Digital Phenotyping | smartphone | lucide-react |
| Neuroinflammation | microchip | lucide-react |
| DeepTwin | cpu | lucide-react |
| Evidence Research | search | lucide-react |
| Longitudinal Insights | line-chart | lucide-react |
| AI Clinical Intelligence | sparkles | lucide-react |
| Multimodal Correlations | link | lucide-react |
| Forecast | telescope | lucide-react |
| Research Datasets | database | lucide-react |
| AI Agents | bot | lucide-react |
| Marketplace | store | lucide-react |
| Academy | graduation-cap | lucide-react |
| Monitor | monitor | lucide-react |
| Reports | bar-chart-3 | lucide-react |
| Finance | banknote | lucide-react |
| Data Console | table-2 | lucide-react |
| Audit Trail | scroll-text | lucide-react |
| Consent & Governance | shield-check | lucide-react |
| Device Management | monitor-smartphone | lucide-react |
| User & Clinic Management | users-2 | lucide-react |
| Research Datasets (Admin) | database | lucide-react |
| Monitor (Admin) | activity | lucide-react |

### Appendix C: Route Reference

| Item | Primary Route | Aliases |
|------|--------------|---------|
| Dashboard | /dashboard | /home, /main |
| Inbox | /inbox | /messages, /notifications |
| Clinician Digest | /digest | /daily-digest, /morning-report |
| Schedule | /schedule | /calendar, /appointments |
| Patients | /patients | /patient-list, /patient-directory |
| Assessments | /assessments | /evaluations, /screening |
| Documents | /documents | /files, /records |
| Virtual Care | /virtual-care | /telehealth, /video-consult |
| Neuromodulation Studio | /interventions/neuromodulation | /protocol-studio, /tms |
| Protocol Designer | /interventions/neuromodulation/designer | /protocol-builder |
| Session Manager | /interventions/neuromodulation/sessions | /tms-sessions |
| Motor Threshold | /interventions/neuromodulation/motor-threshold | /mt, /rmt |
| Coil Positioning | /interventions/neuromodulation/positioning | /neuronavigation |
| Treatment Course | /interventions/neuromodulation/course | /treatment-plan |
| Outcome Tracking | /interventions/neuromodulation/outcomes | /results, /efficacy |
| Medication Studio | /interventions/medication | /pharmacy, /meds |
| Rehab | /interventions/rehab | /rehabilitation, /pt |
| Nutrition | /interventions/nutrition | /diet, /nutritional |
| Wellness | /interventions/wellness | /lifestyle, /wellbeing |
| Complementary | /interventions/complementary | /integrative, /cam |
| Handbooks | /interventions/handbooks | /guides, /manuals |
| Research Evidence | /interventions/evidence | /evidence-base, /literature |
| MRI Analyzer | /analyzers/mri | /mri, /neuroimaging |
| QEEG Analyzer | /analyzers/qeeg | /qeeg, /eeg |
| Video Analyzer | /analyzers/video | /video, /computer-vision |
| Voice Analyzer | /analyzers/voice | /voice, /speech |
| Text Analyzer | /analyzers/text | /text, /nlp |
| Biomarker Analyzer | /analyzers/biomarker | /biomarkers, /lab |
| Genetic Analyzer | /analyzers/genetic | /genetics, /pgx |
| Medication Analyzer | /analyzers/medication | /med-analysis |
| Movement Analyzer | /analyzers/movement | /gait, /motor |
| Sleep Analyzer | /analyzers/sleep | /sleep, /polysomnography |
| Cognitive Analyzer | /analyzers/cognitive | /cognition, /neuropsych |
| Mood Analyzer | /analyzers/mood | /mood, /affect |
| Intervention Analyzer | /analyzers/intervention | /intervention-efficacy |
| Fusion Analyzer | /analyzers/fusion | /multimodal, /data-integration |
| Risk Analyzer | /analyzers/risk | /risk, /prediction |
| Digital Phenotyping | /analyzers/digital-phenotyping | /digital-phenotype |
| Neuroinflammation | /analyzers/neuroinflammation | /neuroinflammatory |
| DeepTwin | /intelligence/deeptwin | /digital-twin, /simulation |
| Evidence Research | /intelligence/evidence | /literature-review |
| Longitudinal Insights | /intelligence/longitudinal | /trajectory, /progress |
| AI Clinical Intelligence | /intelligence/ai-clinical | /clinical-ai |
| Multimodal Correlations | /intelligence/correlations | /cross-modal |
| Forecast | /intelligence/forecast | /prediction, /prognosis |
| Research Datasets | /intelligence/datasets | /datasets, /cohorts |
| AI Agents | /ecosystem/ai-agents | /agents, /ai-tools |
| Marketplace | /ecosystem/marketplace | /store, /apps |
| Academy | /ecosystem/academy | /training, /education |
| Monitor | /ecosystem/monitor | /status, /system-health |
| Reports | /admin/reports | /reporting, /analytics |
| Finance | /admin/finance | /billing, /payments |
| Data Console | /admin/data-console | /data, /database |
| Audit Trail | /admin/audit | /audit, /logs |
| Consent & Governance | /admin/consent | /consent, /governance |
| Device Management | /admin/devices | /devices, /equipment |
| User & Clinic Management | /admin/users | /users, /staff |
| Research Datasets (Admin) | /admin/research-datasets | /admin-datasets |
| Monitor (Admin) | /admin/monitor | /admin-monitoring |

### Appendix D: Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-14 | Initial release with 7 sections, 53 items |

---

*Document generated by DeepSynaps Architecture Team*
*For questions or updates, contact the Platform Engineering team*
