# DeepSynaps Clinician Sidebar IA (Information Architecture)
**Status:** PROPOSAL  
**Date:** May 14, 2026  
**Goal:** Replace tool-list navigation with clinician workflow navigation  

---

## CLINICIAN SIDEBAR STRUCTURE

### Top Level Grouping (Collapsible Groups)

```
┌─────────────────────────────────────────────────┐
│         DEEPSYNAPS PROTOCOL STUDIO              │
│         Clinician Dashboard                     │
├─────────────────────────────────────────────────┤
│  TODAY (red dot if unread)                      │
│  ├─ Dashboard                                   │
│  ├─ Inbox                                       │
│  ├─ Clinician Digest                            │
│  └─ Schedule / Calendar                         │
│                                                 │
│  PATIENTS (count badge)                         │
│  ├─ Patients Hub                                │
│  ├─ Assessments                                 │
│  ├─ Documents                                   │
│  ├─ Virtual Care                                │
│  └─ Patient Timeline                            │
│                                                 │
│  INTERVENTIONS (grouped by modality)            │
│  ├─ Neuromodulation Studio                      │
│  │  ├─ Protocol Builder                         │
│  │  ├─ Brain Map Planner                        │
│  │  ├─ Stimulation Targets                      │
│  │  ├─ Device Planning                          │
│  │  └─ Session Planning                         │
│  ├─ Medication Studio                           │
│  ├─ Rehab & Physiotherapy                       │
│  ├─ Nutrition & Metabolic                       │
│  ├─ Wellness & Lifestyle                        │
│  ├─ Complementary Interventions                 │
│  ├─ Handbooks                                   │
│  └─ Research Evidence                           │
│                                                 │
│  ANALYZERS (multimodal intelligence)            │
│  ├─ Risk Triage                                 │
│  ├─ Biomarkers                                  │
│  │  ├─ Labs Analyzer                            │
│  │  ├─ qEEG Analyzer                            │
│  │  ├─ MRI Analyzer                             │
│  │  └─ Neuro Biomarkers                         │
│  ├─ Biometrics Analyzer                         │
│  ├─ Nutrition Analyzer                          │
│  ├─ Digital Phenotyping                         │
│  ├─ Voice Analyzer                              │
│  ├─ Text Analyzer                               │
│  ├─ Video Assessments                           │
│  ├─ Movement Analyzer                           │
│  ├─ Sessions Analyzer                           │
│  ├─ Behaviour Workspace                         │
│  └─ DeepTwin Insights                           │
│                                                 │
│  ECOSYSTEM (external systems)                   │
│  ├─ AI Agents                                   │
│  ├─ Marketplace                                 │
│  ├─ Academy                                     │
│  ├─ Research Datasets                           │
│  └─ Monitor                                     │
│                                                 │
│  ADMIN (clinic operations)                      │
│  ├─ Reports                                     │
│  ├─ Finance                                     │
│  ├─ Data Console                                │
│  ├─ Audit Trail                                 │
│  ├─ Consent & Governance                        │
│  ├─ Device Management                           │
│  ├─ User & Clinic Management                    │
│  └─ Advanced Settings                           │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## NAVIGATION LAYER SEMANTICS

### TODAY
**Purpose:** "What requires my attention?"  
**Clinical Intent:** Status/alerts/pending actions for clinician's current shift  
**Persistence:** Session-based collapse state

| Route ID | Label | Intent |
|----------|-------|--------|
| `dashboard` | Dashboard | High-level patient overview + alerts |
| `inbox` / `clinician-inbox` | Inbox | Messages, tasks, pending reviews |
| `clinician-digest` | Daily Digest | Automated summary of workflows |
| `scheduling-hub` | Schedule | Calendar, appointments, session planning |

---

### PATIENTS
**Purpose:** "Who am I managing?"  
**Clinical Intent:** Patient discovery, records review, session management, longitudinal care  
**Persistence:** Last viewed patient ID, expanded state

| Route ID | Label | Intent |
|----------|-------|--------|
| `patients-hub` | Patients Hub | Patient search + mini roster |
| `patient-profile` | Patient Profile | Complete patient record (context-driven) |
| `assessments-hub` | Assessments | Patient battery history, pending assessments |
| `documents` | Documents | Medical records, consent docs, reports |
| `virtual-care` | Virtual Care | Telemedicine sessions, recordings |
| `patient-timeline` | Timeline | Longitudinal workflow visualization |
| `live-session` | Live Session | Active virtual care monitoring |

---

### INTERVENTIONS
**Purpose:** "What treatments/care plans are we providing?"  
**Clinical Intent:** Treatment authoring, protocol selection, care coordination  
**Persistence:** Last selected protocol, expanded state

#### Neuromodulation Studio (nested group)
- **Protocol Builder** — Design stimulation protocols
- **Brain Map Planner** — Interactive brain mapping + target selection
- **Stimulation Targets** — Registry of approved targets
- **Device Planning** — Hardware specification
- **Session Planning** — Treatment scheduling + adherence tracking
- **DeepTwin Simulation** — AI-assisted outcome prediction

#### Other Interventions
- **Medication Studio** — Pharmacological management
- **Rehab & Physiotherapy** — Motor plan authoring
- **Nutrition & Metabolic** — Dietary planning
- **Wellness & Lifestyle** — Behavioral interventions
- **Complementary Interventions** — Adjunctive modalities
- **Handbooks** — Patient education + adherence support
- **Research Evidence** — EBM links to interventions

---

### ANALYZERS
**Purpose:** "What intelligence/analysis do we have?"  
**Clinical Intent:** Multimodal data interpretation, AI-assisted insights, longitudinal monitoring  
**Persistence:** Last viewed analyzer, filter state

#### Biomarkers (nested group — biological markers from multiple modalities)
- **Labs Analyzer** — Blood labs, hormones, inflammatory markers
- **qEEG Analyzer** — Neurophysiology, spectral analysis, normative deviation
- **MRI Analyzer** — Structural imaging, volumetry, lesions
- **Neuro Biomarkers** — Composite neurological markers

#### Other Analyzers
- **Risk Triage** — Safety signals, adverse event prediction
- **Biometrics Analyzer** — Wearables, HRV, sleep, activity, stress
- **Nutrition Analyzer** — Metabolic insights from labs + intake
- **Digital Phenotyping** — Passive sensing patterns, behavioral summaries
- **Voice Analyzer** — Vocal biomarkers, transcripts
- **Text Analyzer** — NLP on notes, entity extraction
- **Video Assessments** — Movement tasks, guided assessments
- **Movement Analyzer** — Gait, posture, motor biomarkers
- **Sessions Analyzer** — Treatment response tracking, adherence
- **Behaviour Workspace** — Behavioral summaries, mood trends
- **DeepTwin Insights** — Unified patient digital twin + multimodal synthesis

---

### ECOSYSTEM
**Purpose:** "What external systems/resources exist?"  
**Clinical Intent:** Knowledge leverage, system expansion, community practice  
**Persistence:** Last accessed resource type

| Route ID | Label | Intent |
|----------|-------|--------|
| `ai-agents` | AI Agents | Care team digital assistants |
| `marketplace` | Marketplace | Protocol bundles, integrations, apps |
| `academy` | Academy | Training, certifications, courses |
| `research-datasets` | Research Datasets | De-identified population data |
| `monitor` | Monitor | Device status, system health |

---

### ADMIN
**Purpose:** "How is the clinic/platform managed?"  
**Clinical Intent:** Governance, operations, compliance, audit  
**Persistence:** Last viewed section

| Route ID | Label | Intent |
|----------|-------|--------|
| `reports` | Reports | Clinical outcomes, population analytics |
| `finance-v2` | Finance | Billing, insurance, revenue cycle |
| `data-console` | Data Console | SQL query builder, data exports |
| `audittrail` | Audit Trail | Compliance events, access logs |
| `consent-management` | Consent & Governance | Consent enforcement, IRB workflows |
| `device-management` | Device Management | Hardware inventory, firmware updates |
| `clinic-settings` | User & Clinic Management | Roles, permissions, team setup |
| `settings-v2` | Advanced Settings | Feature flags, integrations, webhooks |

---

## UX PATTERNS

### Collapsible Groups
- **Default state:** TODAY, PATIENTS, INTERVENTIONS expanded; others collapsed
- **Persist:** localStorage `sidebar_collapsed_groups` (JSON)
- **Mobile:** Auto-collapse all except current page group

### Active Highlighting
- Current route highlighted with accent color (brand blue)
- Parent group auto-expands if child route active
- Indent level 2: +4px, level 3: +8px

### Badges & Alerts
- **Inbox:** red dot if unread
- **Patients:** count of active patients
- **Analyzers:** yellow triangle if new insight available
- **Admin:** orange if compliance review pending

### Keyboard Navigation
- `Tab` / `Shift+Tab` → move between items
- `Enter` / `Space` → activate link
- `Ctrl/Cmd+K` → global search (search sidebar + quick nav)

### Responsive Behavior
- **Desktop (>1024px):** Sidebar always visible, width 240-280px
- **Tablet (768-1024px):** Collapsible sidebar, toggle in header
- **Mobile (<768px):** Bottom nav with TODAY/PATIENTS/INTERVENTIONS/ANALYZERS only

---

## ROLE-AWARE VISIBILITY

### Clinician (Default)
- ✅ All sections visible
- 🔒 Admin section limited (no user management, finance limited)

### Clinic Admin
- ✅ All sections with full access
- 🔒 Patient-specific tools (Assessments, Virtual Care) read-only

### Supervisor / QA
- ✅ TODAY, PATIENTS, INTERVENTIONS, ANALYZERS
- 🔒 ADMIN section for audit/compliance only

### Patient (Future, Divergent UI)
- ✅ Overview, Appointments, Assessments, Biometrics, Labs, Reports, Handbooks, Messages
- 🔒 NO: Risk Triage, DeepTwin, Research Evidence, Admin

---

## ARCHITECTURAL IMPLICATIONS

### State Management
```javascript
// Sidebar collapse state persistence
const sidebarState = {
  collapsedGroups: ['ECOSYSTEM', 'ADMIN'], // default
  lastPageGroup: 'TODAY',
  patientContextId: null,
  filterPresets: {}
};

localStorage.setItem('ds_sidebar_state', JSON.stringify(sidebarState));
```

### Route Grouping (Backend)
```javascript
// Each route has group metadata
const routes = {
  dashboard: { group: 'TODAY', label: 'Dashboard', icon: 'grid' },
  'patients-hub': { group: 'PATIENTS', label: 'Patients Hub', icon: 'users' },
  'risk-analyzer': { group: 'ANALYZERS', label: 'Risk Triage', icon: 'alert' },
  // ...
};
```

### Cross-Page Wiring (New)
- Analyzers can be launched from Patients/Interventions context
- Interventions can reference biomarker findings
- Today digest aggregates signals from all groups

---

## MIGRATION PLAN

### Phase 1: Sidebar Component (Week 1)
- Build enterprise-grade collapsible sidebar component
- Implement route grouping logic in constants.js
- Add collapse state persistence

### Phase 2: Navigation Wiring (Week 2)
- Update app.js route dispatcher to use grouped sidebar
- Add badge rendering (unread, alerts, counts)
- Test route activation & deep linking

### Phase 3: Analytics & Telemetry (Week 3)
- Log sidebar navigation patterns
- Track collapse/expand events per role
- Measure time-to-action improvements

### Phase 4: Patient Sidebar (Week 4)
- Build separate patient-safe route set
- Create patient dashboard navigation
- Role-based UI switching

---

## EXISTING ROUTE MAPPING

**Current state:** 235 routes  
**Categorized:** TODAY (11), PATIENTS (46), INTERVENTIONS (22), ANALYZERS (20), ECOSYSTEM (11), ADMIN (40)  
**Uncategorized:** 85 routes (to be reviewed and placed)

**Key Mergers:**
- `patients-hub` + `patients-full` → one "Patients" entry point
- `protocol-hub` + `protocol-builder` + `protocol-registry` → "Interventions > Protocol Studio"
- All `*-analyzer` routes → "ANALYZERS" group
- `brain-map-planner` + related → "INTERVENTIONS > Neuromodulation Studio"

---

## SUCCESS CRITERIA

- ✅ Sidebar feels clinician-first (workflow-oriented, not tool-list)
- ✅ <2 clicks to any major function from top level
- ✅ Collapsible groups reduce cognitive load
- ✅ Role-aware visibility enforced
- ✅ Mobile responsive <768px
- ✅ No route breaks; all existing bookmarks still work
- ✅ Keyboard navigation fully accessible
- ✅ Collapse state persists across sessions

