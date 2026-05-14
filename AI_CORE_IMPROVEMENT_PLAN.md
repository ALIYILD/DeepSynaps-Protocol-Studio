# AI Core Pages Improvement Plan
## DeepSynaps Protocol Studio — Pre-Production Polish

**Date:** 2026-05-14  
**Objective:** Bring the AI-driven clinical pages to production quality before infrastructure deployment.

---

## Current State Analysis

### What's Excellent ✅
- **Backend AI Engine**: `protocol_studio_generation.py` — sophisticated multi-mode protocol generation (evidence_search, qeeg_guided, mri_guided, deeptwin_personalized, multimodal)
- **AI State Store**: `studio/stores/ai.ts` — comprehensive Zustand store tracking 12 clinical context types (viewport, montage, filters, patient, artifacts, spectra, ERP, source localization, spikes, report drafts)
- **Clinical Studio**: 94 files covering EEG viewer, ERP analysis, source localization (LORETA/dipole), spike detection, montage editing, event labeling
- **Safety Architecture**: Decision-support messaging, off-label warnings, clinician review requirements, PHI-safe audit events
- **Test Coverage**: 482 backend test files, protocol studio has router + repository + consent helper tests

### What Needs Work 🔧

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 1 | **No Protocol Studio page components** — Only route tests exist, no actual React UI for generation/evidence/simulation | 🔴 Critical | 3-4 days |
| 2 | **AI Copilot not visible in EEG Studio** — `ai.ts` store exists but no chat panel or suggestion UI in the studio | 🔴 Critical | 2-3 days |
| 3 | **No Protocol Review/Approval UI** — Generated protocols can't be reviewed, edited, or approved by clinicians | 🟡 High | 2-3 days |
| 4 | **No Evidence Display Components** — Evidence RAG results have no frontend visualization | 🟡 High | 1-2 days |
| 5 | **Missing Clinical Dashboard** — No unified patient view with AI insights, pending protocols, alerts | 🟡 High | 2-3 days |
| 6 | **Frontend coverage 25-30%** — Well below the 90% target | 🟡 High | 3-4 days |

---

## Improvement Strategy

### Guiding Principles
1. **Clinical Safety First** — Every AI feature must have human-in-the-loop review
2. **Incremental Delivery** — Each improvement is a standalone PR
3. **Test-Driven** — Every new component has tests before implementation
4. **Evidence-Based** — All AI outputs must show supporting evidence
5. **PHI-Safe** — No patient data in AI prompt logs or error messages

---

## Sprint 1: Protocol Studio Frontend (Priority: 🔴 Critical)

### Deliverables

#### 1.1 Protocol Studio Hub Page
**File:** `apps/web/src/studio/protocol/ProtocolStudioPage.tsx`  
**Purpose:** Main entry point for protocol generation workflow

**Features:**
- Tabbed interface (7 tabs matching test expectations):
  - **Conditions** — Browse condition registry, select target condition
  - **Generate** — AI protocol generation wizard with mode selection
  - **Browse** — Protocol catalog with search/filter
  - **Evidence** — Evidence RAG search results with grades
  - **Compare** — Side-by-side protocol comparison
  - **Simulation** — Parameter simulation with preview
  - **Drafts** — Saved drafts with review/approval workflow
- Safety banner: "Decision-support only — requires clinician review"
- Patient context panel (PHI-minimized)
- `data-testid` hooks for all interactive elements

**API Integration:**
```typescript
// From api.js (already exists)
protocolStudioEvidenceHealth()
protocolStudioEvidenceSearch(query, filters)
protocolStudioProtocols(condition, modality)
protocolStudioGenerate(request)
protocolStudioRecommend(request)
protocolStudioSimulate(request)
protocolStudioPatientContext(patientId)
```

#### 1.2 Protocol Generation Wizard
**File:** `apps/web/src/studio/protocol/GenerationWizard.tsx`  

**Step 1: Mode Selection**
- Evidence Search (literature-based)
- qEEG Guided (requires qEEG data)
- MRI Guided (requires MRI analysis)
- DeepTwin Personalized (requires patient history)
- Multimodal (combines all available data)

**Step 2: Parameters**
- Condition selector (from registry)
- Modality selector (tDCS, tACS, tRNS, etc.)
- Target region/symptom
- Constraint settings (intensity range, session duration)
- Off-label toggle with warning

**Step 3: Review & Generate**
- Summary of inputs
- Missing data warnings
- Generate button with loading state
- Error handling with retry

**Step 4: Results**
- Protocol summary card
- Parameter table (editable)
- Evidence links with grades
- Rationale bullet points
- Contraindications list
- Uncertainty disclaimer
- Save / Discard / Modify actions

#### 1.3 Evidence Display Components
**Files:**
- `apps/web/src/studio/protocol/EvidenceCard.tsx` — Individual evidence item
- `apps/web/src/studio/protocol/EvidencePanel.tsx` — Searchable evidence list
- `apps/web/src/studio/protocol/EvidenceGrade.tsx` — Visual grade indicator (A/B/C/D)

**Features:**
- Evidence title + authors + year
- Retrieval source badge (PubMed, Cochrane, etc.)
- Evidence grade with color coding
- Expandable abstract
- Link to full paper
- "Used in protocol" indicator

#### 1.4 Protocol Draft Manager
**File:** `apps/web/src/studio/protocol/DraftManager.tsx`

**Features:**
- List of saved drafts with status
- Status badges: draft_requires_review, insufficient_evidence, needs_more_data, blocked_requires_review, research_only_not_prescribable
- Edit draft (modify parameters)
- Submit for approval workflow
- Compare drafts side-by-side
- Export draft to PDF

### Tests
- `apps/web/src/__tests__/studio/protocol/ProtocolStudioPage.test.tsx`
- `apps/web/src/__tests__/studio/protocol/GenerationWizard.test.tsx`
- `apps/web/src/__tests__/studio/protocol/EvidenceCard.test.tsx`
- `apps/web/src/__tests__/studio/protocol/DraftManager.test.tsx`

---

## Sprint 2: AI Clinical Copilot (Priority: 🔴 Critical)

### Deliverables

#### 2.1 Clinical Copilot Panel
**File:** `apps/web/src/studio/copilot/CopilotPanel.tsx`  
**Integration:** Slide-out panel in EEG Studio (right side)

**Features:**
- Chat interface with AI assistant
- Context-aware suggestions based on:
  - Current viewport (what the clinician is viewing)
  - Selected montage and filters
  - Patient diagnosis and history
  - Computed analyses (spectra, ERP, source localization)
- Pre-built suggestion chips:
  - "Interpret this qEEG"
  - "Suggest montage for [condition]"
  - "Generate protocol for this patient"
  - "Explain this spike pattern"
- Citations for every AI response
- "Copy to report" button

#### 2.2 Suggestion Chips Bar
**File:** `apps/web/src/studio/copilot/SuggestionChips.tsx`

Context-aware chips that appear based on studio state:
- When viewing spectra: "Interpret spectral findings", "Compare to normative"
- When ERP computed: "Explain P300 latency", "Clinical significance"
- When spike detected: "Classify spike type", "Suggest follow-up"
- When patient opened: "Review patient history", "Generate protocol"

#### 2.3 Citations Footer
**File:** `apps/web/src/studio/copilot/CitationsFooter.tsx`

- Shows evidence sources for current AI response
- Expandable citation list
- Links to evidence database
- "View all evidence" link

### Tests
- `apps/web/src/__tests__/studio/copilot/CopilotPanel.test.tsx`
- `apps/web/src/__tests__/studio/copilot/SuggestionChips.test.tsx`

---

## Sprint 3: Protocol Review & Approval (Priority: 🟡 High)

### Deliverables

#### 3.1 Protocol Review Page
**File:** `apps/web/src/studio/protocol/ProtocolReviewPage.tsx`

**Features:**
- Side-by-side: AI draft vs. clinician edits
- Parameter editing with validation
- Evidence re-review
- Off-label acknowledgement checkbox
- Contraindication check
- Safety checklist:
  - [ ] I have reviewed the evidence
  - [ ] I have checked for contraindications
  - [ ] I have verified patient identity
  - [ ] I understand this is off-label (if applicable)
  - [ ] I have documented my rationale
- Digital signature / approval button
- Audit trail display

#### 3.2 Approval Workflow
**File:** `apps/web/src/studio/protocol/ApprovalWorkflow.tsx`

States: Draft → Under Review → Approved → Prescribed → Completed
- Role-based approval (clinician → senior clinician → prescriber)
- Comments and notes at each stage
- Rejection with reason
- Version history

### Tests
- `apps/web/src/__tests__/studio/protocol/ProtocolReviewPage.test.tsx`
- `apps/web/src/__tests__/studio/protocol/ApprovalWorkflow.test.tsx`

---

## Sprint 4: Clinical Dashboard & Evidence (Priority: 🟡 High)

### Deliverables

#### 4.1 Clinical Dashboard
**File:** `apps/web/src/studio/dashboard/ClinicalDashboard.tsx`

**Widgets:**
- **Pending Protocols** — Drafts awaiting review
- **Active Treatments** — Currently prescribed protocols with progress
- **Recent Analyses** — Latest qEEG/MRI/ERP results
- **AI Alerts** — Anomalies, contraindications, follow-up reminders
- **Evidence Updates** — New literature relevant to patient cohort
- **Quick Actions** — Generate protocol, Schedule session, View reports

#### 4.2 Evidence Viewer Enhancement
- Grade filter (A/B/C/D)
- Source filter (PubMed, Cochrane, ClinicalTrials)
- Date range filter
- "Add to protocol" button
- Evidence comparison

### Tests
- `apps/web/src/__tests__/studio/dashboard/ClinicalDashboard.test.tsx`

---

## Sprint 5: Frontend Coverage Improvement (Priority: 🟡 High)

### Deliverables
- Component tests for all new pages (using React Testing Library)
- Integration tests for protocol generation flow
- Mock API responses for all protocol studio endpoints
- Accessibility tests (keyboard navigation, screen readers)
- Mobile responsiveness tests

**Target:** Frontend coverage from 25-30% → 90%

---

## File Structure

```
apps/web/src/studio/
├── protocol/                          # NEW — Protocol Studio pages
│   ├── ProtocolStudioPage.tsx         # Main hub with 7 tabs
│   ├── GenerationWizard.tsx           # 4-step generation flow
│   ├── ProtocolCard.tsx               # Protocol display card
│   ├── ProtocolTable.tsx              # Protocol list/table
│   ├── EvidenceCard.tsx               # Evidence item display
│   ├── EvidencePanel.tsx              # Searchable evidence list
│   ├── EvidenceGrade.tsx              # Grade visual indicator
│   ├── DraftManager.tsx               # Draft CRUD + workflow
│   ├── ProtocolReviewPage.tsx         # Review + approval
│   ├── ApprovalWorkflow.tsx           # State machine UI
│   ├── SimulationPanel.tsx            # Parameter simulation
│   ├── ComparePanel.tsx               # Side-by-side compare
│   ├── PatientContextPanel.tsx        # PHI-minimized context
│   ├── SafetyBanner.tsx               # Decision-support banner
│   ├── protocolApi.ts                 # API helpers
│   ├── protocolTypes.ts               # TypeScript types
│   └── index.ts                       # Barrel export
│
├── copilot/                           # NEW — AI Clinical Copilot
│   ├── CopilotPanel.tsx               # Slide-out chat panel
│   ├── SuggestionChips.tsx            # Context-aware chips
│   ├── CitationsFooter.tsx            # Evidence citations
│   ├── ChatMessage.tsx                # Individual message
│   ├── ChatInput.tsx                  # Input with suggestions
│   └── index.ts
│
├── dashboard/                         # NEW — Clinical Dashboard
│   ├── ClinicalDashboard.tsx          # Main dashboard
│   ├── PendingProtocolsWidget.tsx     # Pending review
│   ├── ActiveTreatmentsWidget.tsx     # Active protocols
│   ├── RecentAnalysesWidget.tsx       # Recent results
│   ├── AiAlertsWidget.tsx             # AI anomaly alerts
│   ├── QuickActionsWidget.tsx         # Shortcut buttons
│   └── index.ts
│
└── __tests__/                         # NEW — Test directories
    ├── protocol/
    ├── copilot/
    └── dashboard/
```

---

## API Requirements (Already Exist ✅)

All API endpoints are already implemented:

| Endpoint | File | Status |
|----------|------|--------|
| `GET /api/v1/protocol-studio/evidence-health` | `protocol_studio_router.py` | ✅ |
| `POST /api/v1/protocol-studio/evidence-search` | `protocol_studio_router.py` | ✅ |
| `GET /api/v1/protocol-studio/protocols` | `protocol_studio_router.py` | ✅ |
| `GET /api/v1/protocol-studio/protocols/{id}` | `protocol_studio_router.py` | ✅ |
| `POST /api/v1/protocol-studio/generate` | `protocol_studio_router.py` | ✅ |
| `POST /api/v1/protocol-studio/recommend` | `protocol_studio_router.py` | ✅ |
| `POST /api/v1/protocol-studio/simulate` | `protocol_studio_router.py` | ✅ |
| `GET /api/v1/protocol-studio/patient-context/{id}` | `protocol_studio_router.py` | ✅ |
| `POST /api/v1/protocol-studio/drafts` | `protocol_studio_router.py` | ✅ |
| `GET /api/v1/protocol-studio/drafts` | `protocol_studio_router.py` | ✅ |

---

## Implementation Order

**Week 1:** Sprint 1 — Protocol Studio Frontend (hub + generation + evidence)  
**Week 2:** Sprint 2 — AI Clinical Copilot (panel + suggestions + citations)  
**Week 3:** Sprint 3 — Protocol Review & Approval (review page + workflow)  
**Week 4:** Sprint 4 + 5 — Dashboard + Coverage Improvement

**After Week 4:** Deploy to production with Phase 2D

---

## Clinical Safety Checklist for Each Sprint

- [ ] All AI outputs have "decision-support only" disclaimer
- [ ] No autonomous prescribing claims
- [ ] Every protocol requires clinician review
- [ ] Off-label protocols have explicit warnings
- [ ] Evidence grades displayed for all recommendations
- [ ] Contraindications visible before approval
- [ ] PHI not exposed in AI prompts or logs
- [ ] Audit trail for all AI interactions
- [ ] Emergency override available
- [ ] Accessibility compliant (WCAG 2.1 AA)

---

*Generated: 2026-05-14 | AI Core Pages Improvement Plan*
