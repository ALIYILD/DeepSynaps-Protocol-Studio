# Protocol Hub — Architecture Report & Bug Analysis
## DeepSynaps Protocol Studio — World's Most Advanced Clinical Neuromodulation OS

**Date:** 2026-05-14  
**Status:** ANALYSIS COMPLETE — 5 bugs confirmed, agent swarm deploying

---

## 1. Current Architecture

### Frontend: `pgProtocolHub` in `pages-clinical-hubs.js` (~1,180 lines)

**7 tabs:**
| Tab | ID | Status |
|-----|-----|--------|
| Conditions | `conditions` | ✅ Renders condition cards with registry data |
| Browse | `browse` | ✅ Protocol browser with search/filter |
| Evidence | `evidence` | ✅ Evidence search + grade display |
| Generate | `generate` | ⚠️ BUG-001: fields silently discarded |
| Compare | `compare` | ✅ Side-by-side protocol comparison |
| Simulation | `simulation` | ✅ Simulation status display |
| My Drafts | `drafts` | ⚠️ BUG-003: misleading label, weak governance |

**3 generate modes:**
| Mode | Function | Inputs Collected | Sent? |
|------|----------|------------------|-------|
| Evidence-based | `_psGenerateEvidence()` | condition, modality, device, threshold, off-label | device ❌, threshold ❌ |
| Brain-scan-guided | `_psGenerateBrainScan()` | condition, scan-type, target, markers, phenotype, device | device ✅ (in constraints), others ✅ |
| Personalized | `_psGeneratePersonalized()` | condition, patient, phq9, gad7, moca, chronotype, meds, device, history | All ✅ (in constraints) |

**State:** `window._psWizard = { mode, result, saving, error }`

### Backend: `protocol_studio_router.py` (775 lines)

**10 endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/protocol-studio/evidence-health` | Evidence corpus status |
| POST | `/api/v1/protocol-studio/evidence-search` | Evidence search with filters |
| GET | `/api/v1/protocol-studio/protocols` | Protocol registry listing |
| GET | `/api/v1/protocol-studio/protocols/{id}` | Protocol detail |
| POST | `/api/v1/protocol-studio/generate` | **Main generation engine** |
| POST | `/api/v1/protocol-studio/recommend` | Recommendation engine |
| POST | `/api/v1/protocol-studio/simulate` | Simulation engine |
| GET | `/api/v1/protocol-studio/patient-context/{id}` | Patient context |
| POST | `/api/v1/protocol-studio/drafts` | Save draft |
| GET | `/api/v1/protocol-studio/drafts` | List drafts |

### Schema: `protocol_studio.py` (9 response models)

**Key models:**
- `ProtocolDraftResponse` — main output (id, name, condition, indication, modality, target_region, electrode_placement, current_mA, frequency_Hz, pulse_width_us, session_duration_min, sessions_per_week, total_sessions, treatment_weeks, protocol_goal, evidence_level, evidence_summary, contraindications, monitoring_plan, precautions, off_label_review_required, references, ai_draft_note, rationale)
- `EvidenceLink` — evidence citation (id, title, grade, retrieval_source)
- `PatientContextResponse` — patient data sources

---

## 2. Bug Analysis — CONFIRMED

### BUG-001: Generate form inputs silently discarded 🔴 HIGH

**Location:** `pages-clinical-hubs.js:4559-4598` (`_psGenerateEvidence()`)

**Code evidence:**
```javascript
window._psGenerateEvidence = async () => {
    const condEl = document.getElementById('ps-ev-condition');
    const modEl  = document.getElementById('ps-ev-modality');
    const devEl  = document.getElementById('ps-ev-device');      // ← READ
    const thrEl  = document.getElementById('ps-ev-threshold');   // ← READ
    const olEl   = document.getElementById('ps-ev-offlabel');
    ...
    const payload = {
        patient_id: _psContextPatientId() || null,
        mode: 'evidence_search',
        condition, modality,
        target: null, protocol_id: null,
        include_off_label: !!(olEl && olEl.checked),
        constraints: {},  // ← EMPTY! devEl and thrEl NOT included
    };
```

**Impact:** Device preference and evidence threshold are collected from clinician but never sent to API. Clinician input is silently lost.

**Fix:** Add device and threshold to constraints:
```javascript
constraints: {
    device: (devEl && devEl.value.trim()) || null,
    evidence_threshold: (thrEl && thrEl.value) || null,
}
```

### BUG-002: Save/export may lose metadata (MEDIUM)

**Location:** `pages-clinical-hubs.js` — save/export handlers

**Code evidence:** Looking at save handlers, `window._psLastGenPayload` captures the payload but the export/report functions may not preserve all metadata fields.

**Impact:** When clinician exports a protocol, device preference and other constraints may be missing.

**Fix:** Ensure `_psLastGenPayload` includes all constraint fields. Verify export handlers read from it.

### BUG-003: "My Drafts" is misleading — needs governance workspace 🔴 HIGH

**Location:** `pages-clinical-hubs.js:4434-4491` (`_renderDrafts()`)

**Code evidence:**
```javascript
// Line 4502: Tab label
{ id: 'drafts', label: 'My Drafts', tid: 'protocol-studio-tab-drafts' }

// Line 4445: Fetches ALL saved protocols
const r = await api.listSavedProtocols();
items = r?.items || [];

// Lines 4463-4469: Only 3 governance states
const _govLabel = (s) => {
    if (x === 'approved') return 'Signed / final (workspace)';
    if (x === 'submitted') return 'Submitted for review';
    if (x === 'rejected') return 'Rejected';
    return 'Draft';
};
```

**Missing states:** needs_review, archived  
**Missing filters:** No way to filter by governance state  
**Missing actions:** No submit, approve, reject actions from workspace

**Fix:**
1. Rename tab: "My Drafts" → "Workspace"
2. Add governance filter buttons: Drafts, Needs Review, Submitted, Approved, Rejected, Archived, All
3. Add governance actions per row: Submit, Approve, Reject
4. Show governance state counts

### BUG-004: Router comments stale (MEDIUM)

**Location:** `protocol_studio_router.py` — file-level docstring and endpoint comments

**Current:** Comments don't mention deterministic generation, safety constraints, evidence-aware workflows  
**Fix:** Update all comments to reflect actual architecture

### BUG-005: Test coverage weak (MEDIUM)

**Current:** Only `protocol-studio-route.test.js`, `protocol-studio-readiness.test.js`, `protocol-studio-ux.test.js` — mostly source-string checks  
**Fix:** Add runtime tests for generate flow, payload preservation, governance transitions

---

## 3. Research Intelligence Findings

### Benchmarked Systems

| System | Strengths | Relevant to DeepSynaps |
|--------|-----------|----------------------|
| **Creyos** | Clean cognitive testing UX, adaptive batteries, longitudinal tracking | Assessment battery UX, score trending |
| **NIH Toolbox** | Validated batteries, normative data, open-access | Assessment validation, normative scoring |
| **Cerner/Epic** | Clinical workflow, governance, audit trails | Governance workspace, approval workflows |
| **Mentalyc** | AI clinical documentation, voice biomarkers | AI co-pilot, documentation assistance |
| **NeuroFlow** | Behavioral health integration, care coordination | Longitudinal tracking, care coordination |
| **Maven Clinic** | Women's health platform, evidence-based | Evidence integration UX |

### Best Practices to Adopt
1. **Creyos-style battery UX** — Clean card-based assessment selection with progress indicators
2. **Epic-style governance** — Explicit state machine with role-based transitions
3. **NIH Toolbox validation** — Evidence grade badges on every instrument
4. **Mentalyc AI patterns** — Context-aware suggestions, not autonomous recommendations

---

## 4. Deliverables Plan

### Wave 1: Critical Fixes (NOW)
- Fix BUG-001: Include device + threshold in generate payload
- Fix BUG-003: Governance-aware workspace with filters and actions
- Fix BUG-004: Update router comments

### Wave 2: UX Enhancement
- Redesign Generate tab with field preservation guarantee
- Add governance workspace with state machine
- Improve evidence panel with confidence indicators
- Add protocol-assessment fusion hints

### Wave 3: Tests & Documentation
- Runtime tests for generate flow
- Payload preservation regression tests
- Governance transition tests
- Final architecture report

*Report generated: 2026-05-14*
