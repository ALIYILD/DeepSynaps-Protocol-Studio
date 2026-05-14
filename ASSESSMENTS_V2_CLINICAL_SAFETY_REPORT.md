# ASSESSMENTS V2 — Clinical Safety Audit Report

**Audit Date:** 2025-01-15  
**Auditor:** Clinical Safety Officer (Automated)  
**Scope:** 13 assessment-related files across frontend, backend, models, and registry  
**Framework:** DeepSynaps Protocol Studio — Assessments V2  
**Classification:** Clinical Decision Support System (CDSS) — NON-DIAGNOSTIC

---

## Executive Summary

This audit examined all assessment-related source files in the DeepSynaps Protocol Studio for unsafe clinical wording, autonomous diagnosis claims, patient-facing diagnosis language, and other clinical safety violations.

**Overall Clinical Safety Verdict: CONDITIONAL PASS**

The codebase demonstrates several positive safety practices: role-based access control, explicit "advisory only" labels on the recommendation endpoint, draft labeling on AI summaries, demo-data banners, and human-in-the-loop approval workflows. However, **7 critical issues** require immediate remediation before the system can be considered clinically safe for deployment. The most significant concern is the presence of **autonomous diagnosis output** in the scoring pipeline, where the AI system emits diagnostic impressions (e.g., "Consistent with moderate depressive episode") and primary diagnosis classifications without adequate "decision support" framing.

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 7 | Must fix before deployment |
| HIGH | 14 | Must fix in first patch |
| MEDIUM | 12 | Should fix in next sprint |

---

## 🔴 CRITICAL ISSUES (Must Fix Immediately)

---

### Issue C-001: AI Produces Diagnostic Impressions Without "Decision Support" Label

```
FILE: apps/api/app/services/assessment_scoring.py
LINE: 155–160
SEVERITY: 🔴 CRITICAL
CURRENT: "- **Diagnostic impression** – the structured summary that ...\n  \"Consistent with moderate depressive episode. PHQ-9 ...\""
REQUIRED: "- **Draft diagnostic impression (decision support only — requires clinician review)** – the structured summary that ...\n  \"Score pattern is consistent with moderate depressive episode (draft — not a diagnosis). PHQ-9 ...\""
REASON: The AI system emits definitive-sounding diagnostic impressions (\"Consistent with moderate depressive episode\") without framing them as draft decision-support outputs. This creates risk that a clinician or downstream system treats AI output as a diagnosis. The scoring module is NOT a diagnostic device and must never produce output that could be mistaken for one. This violates the fundamental principle that AI outputs in healthcare must be labeled as decision support only.
```

---

### Issue C-002: AI Emits Treatment Recommendations Without "Draft" Qualifier

```
FILE: apps/api/app/services/assessment_scoring.py
LINE: 161–163
SEVERITY: 🔴 CRITICAL
CURRENT: "- **Prioritised recommendation** – the top action ranked ...\n  \"Adjunctive psychotherapy ...\""
REQUIRED: "- **Draft recommendation (requires clinician review)** – a suggested action for clinician consideration only...\n  \"Consider adjunctive psychotherapy ... (draft — not a treatment plan)\""
REASON: The AI system autonomously prioritises treatment recommendations (\"Adjunctive psychotherapy\") without labeling them as draft or requiring clinician review. This is functionally indistinguishable from autonomous prescribing/treatment planning. In a healthcare context, any AI-generated recommendation must carry an explicit "draft — requires clinician review" qualifier to avoid being acted upon without human judgment.
```

---

### Issue C-003: Scoring Pipeline Contains a "Diagnosis" Key

```
FILE: apps/api/app/services/assessment_scoring.py
LINE: 372
SEVERITY: 🔴 CRITICAL
CURRENT: SCORING["diagnosis"] = "Condition / primary indication"
REQUIRED: SCORING["clinical_context"] = "Condition / primary indication (informational only)"
REASON: The scoring dictionary uses the key name "diagnosis", which propagates through API responses, database schemas, logs, and frontend code. Even though the human-readable value is softer ("Condition / primary indication"), the structural key name "diagnosis" creates several risks: (1) API consumers may key off this field name to implement diagnostic logic, (2) logs containing this key may create compliance issues, (3) the presence of a diagnosis field in a non-diagnostic device is a regulatory red flag. The key should be renamed to a non-diagnostic term.
```

---

### Issue C-004: AI Claims to "Extract" Diagnosis Evidence

```
FILE: apps/api/app/services/assessment_scoring.py
LINE: 376–380
SEVERITY: 🔴 CRITICAL
CURRENT: {
  "label": "Diagnosis evidence",
  "type": "ai_extracted",
  "subtype": "primary",
  "description": "AI-extracted evidence for diagnosis"
}
REQUIRED: {
  "label": "Clinical context notes (decision support)",
  "type": "ai_assisted_draft",
  "subtype": "informational",
  "description": "AI-assisted draft notes for clinician review — not a diagnostic extract"
}
REASON: The type "ai_extracted" and subtype "primary" imply the AI is authoritatively extracting primary diagnosis evidence. This positions the AI as having diagnostic extraction capability, which is an autonomous clinical claim. The description "AI-extracted evidence for diagnosis" is a direct claim of diagnostic capability. Non-diagnostic CDSS software must never claim to extract, identify, or determine diagnosis evidence.
```

---

### Issue C-005: API Response Model Exposes Diagnosis Field to Consumers

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 141
SEVERITY: 🔴 CRITICAL
CURRENT: diagnosis: Optional[str] = Field(None, description="Primary diagnosis or clinical impression.")
REQUIRED: clinical_context: Optional[str] = Field(None, description="Clinical context notes (informational draft — not a diagnosis). Requires clinician review.")
REASON: The AssessmentScoringOut response model explicitly provides a "diagnosis" field to API consumers with description "Primary diagnosis or clinical impression." This is a non-diagnostic device providing diagnosis output. The field name, the description, and its presence in a public API response model all violate the principle that CDSS software must not output diagnoses. This field should be renamed and its description amended.
```

---

### Issue C-006: Score Endpoint Returns Diagnosis Data

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 264
SEVERITY: 🔴 CRITICAL
CURRENT: diagnosis=scoring.get("diagnosis", "—"),
REQUIRED: clinical_context=scoring.get("clinical_context", "—"),
REASON: The scoring endpoint reads a "diagnosis" key from the scoring module and returns it in the API response. Even though it defaults to "—" (em-dash), the field assignment itself creates a data flow where diagnosis-like information propagates from the scoring module through the API to frontend consumers. This must be renamed to break the diagnosis data flow.
```

---

### Issue C-007: PCL-5 Scoring Emits "Probable PTSD" Diagnostic Label

```
FILE: apps/web/src/assessment-forms.js
LINE: 313
SEVERITY: 🔴 CRITICAL
CURRENT: return { label: 'Probable PTSD', color: '#ff6b6b' };
REQUIRED: return { label: 'Above PTSD threshold — clinician evaluation required', color: '#ff6b6b' };
REASON: The PCL-5 severity function returns the label "Probable PTSD" when scores are ≥33. "Probable PTSD" is a diagnostic statement — it communicates to the user that post-traumatic stress disorder is probable. A screening score on a self-report scale cannot diagnose PTSD. The label should reference the threshold crossing and direct toward required clinician evaluation, not imply a diagnostic probability. This label is displayed directly to users in the assessment UI.
```

---

## 🟡 HIGH ISSUES (Must Label/Fix in First Patch)

---

### Issue H-001: AI Identified Worsening Trend Without Decision Support Frame

```
FILE: apps/api/app/services/assessment_scoring.py
LINE: 378
SEVERITY: 🟡 HIGH
CURRENT: "description": "AI-identified worsening trend"
REQUIRED: "description": "Draft trend note — requires clinician confirmation"
REASON: The phrase "AI-identified" positions the AI as having independent clinical identification capability. In a CDSS, trend detection should be framed as "assisted" or "draft" analysis, not as something the AI "identified." The current wording could lead clinicians to defer to AI judgment.
```

---

### Issue H-002: AI System Prompt Requests Clinical Action Without Decision Support Frame

```
FILE: apps/api/app/routers/assessments_router.py
LINE: 1141–1148
SEVERITY: 🟡 HIGH
CURRENT: "(4) one suggested clinical action."
REQUIRED: "(4) one suggested clinical action for clinician consideration (draft decision support only — not a directive)."
REASON: The AI system prompt asks the LLM to suggest a clinical action but does not include a "decision support only / not a directive" frame around that request. While the prompt does say "Be clinically accurate, non-diagnostic" (positive), the specific request for a "suggested clinical action" without the draft qualifier creates risk that the LLM outputs treatment directives rather than suggestions. The prompt should explicitly label the requested action as draft/decision support.
```

---

### Issue H-003: Rationale Cites Evidence as If AI Makes Evidence-Based Claims

```
FILE: apps/api/app/services/assessment_scoring.py
LINE: 165–167
SEVERITY: 🟡 HIGH
CURRENT: "PHQ-9 ≥ 10 has pooled sensitivity 0.88 and specificity 0.85 for MDD at primary-care threshold (Kroenke 2001)."
REQUIRED: "PHQ-9 ≥ 10 has pooled sensitivity 0.88 and specificity 0.85 for MDD at primary-care threshold per published literature (Kroenke 2001) — this scale does not diagnose; clinician evaluation is required."
REASON: The rationale section cites sensitivity/specificity evidence in a way that implies the AI is making evidence-based diagnostic determinations. While the evidence citation is factually correct, the framing lacks the necessary "this screening tool does not diagnose" disclaimer. The cited statistics are about screening accuracy, not diagnostic certainty. The text should explicitly separate screening from diagnosis.
```

---

### Issue H-004: Recommendation Endpoint Docstring Claims "Clinical Recommendation"

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 499
SEVERITY: 🟡 HIGH
CURRENT: "AI-generated clinical recommendation derived from the most recent assessment scores."
REQUIRED: "AI-generated draft recommendation for clinician review (decision support only) derived from the most recent assessment scores."
REASON: While the endpoint implementation correctly includes an "advisory only" comment (good practice), the docstring that generates API documentation describes the output as a "clinical recommendation" without the draft qualifier. API documentation is often the primary source of truth for integration engineers; if it says "clinical recommendation," consumers may implement it as authoritative clinical guidance.
```

---

### Issue H-005: C-SSRS Risk Stratification Lacks Protocol Reference

```
FILE: apps/web/src/assessment-forms.js
LINE: 379–381
SEVERITY: 🟡 HIGH
CURRENT:
  { label: 'HIGH risk — immediate safety plan required', color: '#ff6b6b' }
  { label: 'MODERATE risk — clinician review', color: 'var(--amber)' }
  { label: 'LOW risk — passive ideation', color: 'var(--teal)' }
REQUIRED:
  { label: 'HIGH risk screen — follow clinic safety protocol immediately', color: '#ff6b6b' }
  { label: 'MODERATE risk screen — clinician review required', color: 'var(--amber)' }
  { label: 'LOW risk screen — passive ideation noted', color: 'var(--teal)' }
REASON: The C-SSRS severity labels present risk classifications as definitive clinical assessments (\"HIGH risk — immediate safety plan required\") rather than as screening results that trigger protocol follow-up. The phrase \"immediate safety plan required\" is an autonomous clinical directive. While C-SSRS is a validated tool, the software should present results as "screen" outputs that reference the clinic's protocol, not as autonomous determinations of risk level requiring specific actions.
```

---

### Issue H-006: Dashboard "All Clear" Message Could Be Clinically Misinterpreted

```
FILE: apps/web/src/pages-clinical-tools.js
LINE: 6256
SEVERITY: 🟡 HIGH
CURRENT: "All clear — no urgent items"
REQUIRED: "No assessment items require attention at this time (system view only — clinical judgment required)"
REASON: "All clear" is a reassuring clinical phrase that could be interpreted by patients or junior staff as a clinical all-clear statement about the patient's condition. The dashboard is a system view of assessment workflow status, not a clinical assessment of patient status. The message should clarify that this is a system view and does not replace clinical judgment.
```

---

### Issue H-007: Score Interpretation Bands Lack Clinician Review Labels

```
FILE: apps/web/src/pages-clinical-tools.js
LINE: 5784–5799 (EXTRA_SCALES interpretation arrays)
SEVERITY: 🟡 HIGH
CURRENT:
  interpretation:[{max:5,label:'None'},{max:10,label:'Mild'},...]
REQUIRED:
  interpretation:[{max:5,label:'None (screening result — not a diagnosis)'},{max:10,label:'Mild (clinician review required)'},...]
REASON: The EXTRA_SCALES array defines severity interpretation bands (None, Mild, Moderate, Severe, Very Severe) that are displayed directly to users. These labels are presented as definitive severity classifications without any "requires clinician review" or "screening result" qualifier. For clinical scales like PANSS, BPRS, MMSE, and MoCA — all of which require trained administration and interpretation — the software should label all severity bands as requiring clinician review.
```

---

### Issue H-008: Escalation Endpoint Docstring Claims Crisis Protocol Capability

```
FILE: apps/api/app/routers/assessments_router.py
LINE: 1089–1094
SEVERITY: 🟡 HIGH
CURRENT: """Flag an assessment as clinically escalated (crisis protocol).

Appends an audit event line to `clinician_notes` and stamps
`escalated=true`, `escalated_at`, `escalated_by`, and `escalation_reason`.
"""
REQUIRED: """Flag an assessment for clinician review (crisis protocol support).

Appends an audit event line to `clinician_notes` and stamps
`escalated=true`, `escalated_at`, `escalated_by`, and `escalation_reason`.
This endpoint supports but does not replace clinical crisis judgment.
"""
REASON: The docstring describes the endpoint as performing clinical escalation for crisis protocol. While the endpoint does require a clinician role (`require_minimum_role(actor, "clinician")`), the docstring frames the software as having crisis protocol capability. The software should be framed as supporting crisis workflows, not as implementing them. The phrase "clinically escalated" implies the software is performing the clinical escalation.
```

---

### Issue H-009: Autonomous Risk Recompute Triggered on Assessment Update

```
FILE: apps/api/app/routers/assessments_router.py
LINE: 1036–1043
SEVERITY: 🟡 HIGH
CURRENT:
    _trigger_risk_recompute(
        record.patient_id,
        ["suicide_risk", "self_harm", "mental_crisis"],
        "assessment_updated",
        actor.actor_id,
        session,
    )
REQUIRED:
    # Risk recompute is triggered as a background task for clinician awareness only.
    # The output is a draft flag for review, not an autonomous clinical determination.
    _trigger_risk_recompute(
        record.patient_id,
        ["suicide_risk", "self_harm", "mental_crisis"],
        "assessment_updated",
        actor.actor_id,
        session,
        draft_decision_support=True,  # Flag output as draft only
    )
REASON: On every assessment update, the system autonomously triggers a risk recompute for suicide risk, self-harm, and mental crisis categories without explicit clinician initiation. While this is a background process, the risk scores it produces could be consumed by downstream systems as authoritative risk assessments. The trigger should be explicitly labeled as producing draft decision-support output only.
```

---

### Issue H-010: Red Flag Detection Function Operates Autonomously

```
FILE: apps/api/app/routers/assessments_router.py
LINE: 930–948
SEVERITY: 🟡 HIGH
CURRENT: def detect_red_flags(template_id: str, items: Optional[dict], score: Optional[float]) -> list[str]:
REQUIRED: def detect_red_flags(template_id: str, items: Optional[dict], score: Optional[float]) -> list[str]:
  """Draft red-flag screening notes for clinician review only. Not a substitute for clinical judgment."""
REASON: The `detect_red_flags` function autonomously detects clinical red flags from assessment data without requiring explicit clinician initiation. While red flag detection is a valuable safety feature, the function's output should be explicitly labeled as draft screening notes. The function lacks a docstring entirely, meaning consumers of its output have no indication that these are draft screening notes rather than clinical determinations.
```

---

### Issue H-011: Confidence Check Can Emit Clinical Uncertainty Without Full Context

```
FILE: apps/api/app/services/assessment_scoring.py
LINE: 229–234
SEVERITY: 🟡 HIGH
CURRENT:
  {
    "confidence_level": "low",
    "explanation": "Only 3/7 PHQ-9 items answered; severity estimate is unreliable ..."
  }
REQUIRED:
  {
    "confidence_level": "low",
    "explanation": "Only 3/7 PHQ-9 items answered; severity estimate is unreliable ... (draft — clinician judgment required)",
    "requires_clinician_review": true
  }
REASON: The confidence check module produces structured confidence assessments that are stored in the database and potentially consumed by downstream systems. While the explanations appropriately flag uncertainty, they should explicitly carry a `requires_clinician_review` boolean flag so that downstream consumers can programmatically enforce human review for low-confidence outputs. Without this flag, low-confidence AI output could be consumed as if it were reliable.
```

---

### Issue H-012: Module Docstring Lacks Decision-Support-Only Warning

```
FILE: apps/api/app/services/assessment_scoring.py
LINE: 1–21
SEVERITY: 🟡 HIGH
CURRENT: """Deterministic severity mapper and clinical-red-flag catalog ...

Typical return (assessment_scoring_v2):
{
  "severity": "moderate",
  "score": 12,
  "confidence": 0.92,
  ...
}"""
REQUIRED: """Deterministic severity mapper and clinical-red-flag catalog (DECISION SUPPORT ONLY — NOT A DIAGNOSTIC DEVICE).

IMPORTANT: All outputs from this module are draft decision-support notes
that require review by a licensed clinician before any clinical action.
This module does not diagnose, prescribe, or replace clinical judgment.

Typical return (assessment_scoring_v2):
{
  "severity": "moderate (screening result — not a diagnosis)",
  "score": 12,
  "confidence": 0.92,
  "requires_clinician_review": true,
  ...
}"""
REASON: The module-level docstring is the primary source of truth for developers integrating with this module. It currently describes the module as a "clinical-red-flag catalog" without any decision-support-only framing. The example return value in the docstring shows a bare severity string without clinician review requirements. This creates risk that integration engineers treat outputs as authoritative clinical determinations.
```

---

### Issue H-013: Video Assessments Description Uses "Evidence-Linked Literature" Without Qualifier

```
FILE: apps/web/src/pages-clinical-tools.js
LINE: 6118–6119
SEVERITY: 🟡 HIGH
CURRENT: "Remote guided movement tasks with API-backed sessions and evidence-linked literature in the review summary."
REQUIRED: "Remote guided movement tasks with API-backed sessions and literature references for clinician review (informational only — not clinical recommendations)."
REASON: The phrase "evidence-linked literature" could be interpreted as implying that the software provides evidence-based clinical recommendations. The term "evidence-linked" is close to "evidence-based," which is a clinical quality claim. The description should clarify that literature references are informational only and not clinical recommendations.
```

---

### Issue H-014: AI Extracted Source Type in Evidence Model

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 144
SEVERITY: 🟡 HIGH
CURRENT: confidence_source: Optional[str] = Field(None, description="Source of confidence: ai_extracted, rule_based, manual, unknown.")
REQUIRED: confidence_source: Optional[str] = Field(None, description="Source of confidence: ai_assisted_draft, rule_based, manual, unknown. ai_assisted_draft indicates AI-generated notes requiring clinician review.")
REASON: The `ai_extracted` source type implies the AI is extracting clinical evidence authoritatively. In a CDSS, AI assistance should be described as "assisted" or "draft," not as "extracted." The term "extracted" suggests the AI is pulling out factual clinical evidence, which positions it as having authoritative clinical extraction capability.
```

---

## 🟢 MEDIUM ISSUES (Improve Wording in Next Sprint)

---

### Issue M-001: Trend Analysis Output Lacks "Draft" Qualifier

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 132–134
SEVERITY: 🟢 MEDIUM
CURRENT:
  trend_direction: Optional[str] = None  # "improving", "worsening", "stable"
  trend_summary: Optional[str] = None
REQUIRED:
  trend_direction: Optional[str] = None  # "improving", "worsening", "stable" (draft — requires clinician review)
  trend_summary: Optional[str] = None  # Draft trend note — not a clinical determination
REASON: The trend direction and summary fields carry AI-generated trend analysis without an explicit "draft" qualifier in their descriptions. While the field names are neutral, the descriptions should clarify that these are draft analyses requiring clinician confirmation.
```

---

### Issue M-002: Severity Class Field Includes "Critical" Without Context

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 135
SEVERITY: 🟢 MEDIUM
CURRENT: severity_class: Optional[str] = Field(None, description="Severity class: minimal, mild, moderate, severe, critical.")
REQUIRED: severity_class: Optional[str] = Field(None, description="Severity class (screening result — not a diagnosis): minimal, mild, moderate, severe, critical. Requires clinician review.")
REASON: The severity_class field presents a severity classification without framing it as a screening result or noting that clinician review is required. The inclusion of "critical" as a class is particularly concerning since it could trigger automated downstream responses (alerts, escalation) without human review.
```

---

### Issue M-003: Clinical Significance Statement Generated by AI

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 81–85
SEVERITY: 🟢 MEDIUM
CURRENT: clinical_significance: str = Field(..., description="Clinical significance statement for the matched trial.")
REQUIRED: clinical_significance: str = Field(..., description="Draft clinical significance note for the matched trial (informational — requires clinician review).")
REASON: The AssessmentEvidenceOut model includes a clinical_significance field that stores AI-generated clinical significance statements. Without a draft qualifier, these statements could be treated as authoritative clinical assessments of trial relevance.
```

---

### Issue M-004: Relevance Score is Unvalidated

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 80
SEVERITY: 🟢 MEDIUM
CURRENT: relevance_score: float = Field(..., ge=0.0, le=1.0, description="0.0–1.0 relevance score for the matched evidence.")
REQUIRED: relevance_score: float = Field(..., ge=0.0, le=1.0, description="0.0–1.0 AI-generated relevance score for the matched evidence (draft — not clinically validated).")
REASON: The relevance score is an AI-generated numeric value that could be used to rank or filter evidence. Without noting that it is not clinically validated, consumers may use it as an objective quality measure rather than as a rough AI-assisted estimate.
```

---

### Issue M-005: Differential Field in Scoring Output

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 103–109
SEVERITY: 🟢 MEDIUM
CURRENT:
  differential: Optional[str] = Field(
      None,
      description="Short differential or clarification (e.g. 'Distinguish from bipolar depression').",
  )
REQUIRED:
  differential: Optional[str] = Field(
      None,
      description="Draft differential considerations for clinician review (e.g. 'Consider distinguishing from bipolar depression'). Not a differential diagnosis.",
  )
REASON: The field name "differential" and its description reference "differential" — a clinical diagnostic process. While the example text is relatively soft, the field should be explicitly labeled as a draft consideration, not a differential diagnosis.
```

---

### Issue M-006: Scale Library Displays Severity Bands Without Context

```
FILE: apps/web/src/pages-clinical-tools.js
LINE: 6334
SEVERITY: 🟢 MEDIUM
CURRENT: s.interpretation.map(r => r.label + ' (≤' + r.max + ')').join(' · ')
REQUIRED: s.interpretation.map(r => r.label + ' (≤' + r.max + ' — screening result, not a diagnosis)').join(' · ')
REASON: The scale library page displays severity interpretation bands directly to users without any "screening result" or "requires clinician review" framing. Users browsing the scale library may interpret these bands as definitive clinical classifications.
```

---

### Issue M-007: AI Summary Confidence Field Not Clinically Validated

```
FILE: apps/api/app/routers/assessments_v2_router.py
LINE: 131
SEVERITY: 🟢 MEDIUM
CURRENT: confidence: float = Field(0.5, ge=0.0, le=1.0, description="Confidence (0.0–1.0). Low confidence should not be shown to patients.")
REQUIRED: confidence: float = Field(0.5, ge=0.0, le=1.0, description="AI confidence score (0.0–1.0, not clinically validated). Low confidence output should not be shown to patients and requires clinician review.")
REASON: The confidence field description notes that low confidence "should not be shown to patients" (good) but does not indicate that the confidence score itself is not clinically validated. The score is an internal AI metric, not a validated clinical measure of output reliability.
```

---

### Issue M-008: Assessment Forms Registry Notes Contain Treatment Advice

```
FILE: apps/web/src/registries/assessments.js (multiple entries)
LINE: 31, 80, 130, 157, 182, 285, 310, 335, etc.
SEVERITY: 🟢 MEDIUM
CURRENT (examples):
  notes: 'Primary outcome measure for MDD TMS trials. PHQ-9 ≥10 = moderate depression threshold commonly used for treatment eligibility.'
  notes: 'Gold-standard clinician-rated depression measure for clinical trials. Remission defined as ≤7.'
  notes: 'Highly sensitive to change; preferred for antidepressant and TMS trials. Remission ≤10; response = 50% reduction.'
REQUIRED: Add "(informational reference only — not treatment guidance)" suffix to all notes fields.
REASON: The notes fields in the assessment registry contain clinical context that could be interpreted as treatment guidance (\"treatment eligibility,\" \"remission defined as\"). While these notes are primarily for clinician reference, they should carry a disclaimer that they are informational references, not treatment guidance from the software.
```

---

### Issue M-009: PCL-C Legacy Scale Uses "Probable PTSD"

```
FILE: apps/web/src/registries/assessments.js
LINE: 554
SEVERITY: 🟢 MEDIUM
CURRENT: { range: [45, 85], label: 'Probable PTSD', color: 'var(--red)' }
REQUIRED: { range: [45, 85], label: 'Above threshold — clinician evaluation required', color: 'var(--red)' }
REASON: Same issue as C-007 but in the registry data rather than the live scoring function. The PCL-C scoring band uses "Probable PTSD" as a label. This is a diagnostic statement from a screening tool.
```

---

### Issue M-010: EDE-Q Scale Uses "Clinically Significant ED"

```
FILE: apps/web/src/registries/assessments.js
LINE: 1525
SEVERITY: 🟢 MEDIUM
CURRENT: { range: [3.5, 6], label: 'Clinically significant ED', color: 'var(--red)' }
REQUIRED: { range: [3.5, 6], label: 'Above clinical threshold — evaluation required', color: 'var(--red)' }
REASON: "Clinically significant ED" (eating disorder) is a diagnostic-sounding label from a self-report screening tool. It should reference the threshold crossing rather than imply clinical significance determination.
```

---

### Issue M-011: PDQ Scale Uses "Neuropathic Component Likely"

```
FILE: apps/web/src/registries/assessments.js
LINE: 1093
SEVERITY: 🟢 MEDIUM
CURRENT: { range: [19, 38], label: 'Neuropathic component likely', color: 'var(--red)' }
REQUIRED: { range: [19, 38], label: 'Neuropathic component screen positive — specialist evaluation required', color: 'var(--red)' }
REASON: "Neuropathic component likely" is a diagnostic probability statement. The Pain Detect Questionnaire is a screening tool, not a diagnostic device for neuropathic pain.
```

---

### Issue M-012: DEMO Banner Uses Word "Fictional" — Should Also Say "Not Clinical Data"

```
FILE: apps/web/src/assessments-hub-mapping.js
LINE: 7–8
SEVERITY: 🟢 MEDIUM
CURRENT: 'Demo assessment data — not real patient data'
REQUIRED: 'Demo assessment data — not real patient data and not for clinical use'
REASON: While the existing banner correctly identifies demo data as not real patient data, it should also explicitly state that demo data is not for clinical use. This prevents any possibility of demo data being used in a clinical context during testing or demonstration.
```

---

## Positive Safety Practices Identified

The following safety practices were observed and should be maintained:

| Practice | Location | Assessment |
|----------|----------|------------|
| **"Draft — requires review" on AI summaries** | assessments_v2_router.py:117 | ✅ `ai_summary` field explicitly says "draft — requires review" |
| **"Advisory only" endpoint comment** | assessments_v2_router.py:504–512 | ✅ Recommendation endpoint documented as advisory only |
| **Role-based access control** | All router endpoints | ✅ `require_minimum_role(actor, "clinician")` on sensitive endpoints |
| **Demo data banner** | assessments-hub-mapping.js:7–8 | ✅ Demo data clearly labeled as fictional |
| **Human-in-the-loop approval** | assessments_router.py:1047–1065 | ✅ Assessment approval requires clinician role and records reviewer |
| **"Not medical advice" disclaimer** | pages-clinical-tools.js:6849 | ✅ Educational links section includes medical advice disclaimer |
| **"Scale list is suggestive" disclaimer** | pages-clinical-tools.js:6798 | ✅ Condition info modal notes scale lists are suggestive |
| **Limitation admission** | assessment_scoring.py:192 | ✅ Software admits when it cannot produce reliable interpretation |
| **Non-diagnostic prompt framing** | assessments_router.py:1146 | ✅ AI prompt includes "Be clinically accurate, non-diagnostic" |
| **PHI-safe demo build** | pages-clinical-tools.js:5957–5967 | ✅ Demo mode prevents PHI leakage on auth failure |
| **Licensed instrument warning** | pages-clinical-tools.js:6409–6411 | ✅ Licensed instruments flagged with appropriate warnings |

---

## Top 5 Most Critical Fixes (Priority Order)

### 1. Remove/renamed the `diagnosis` field in scoring pipeline (C-003, C-005, C-006)
**Files:** `assessment_scoring.py:372`, `assessments_v2_router.py:141,264`  
**Impact:** HIGH — This is the most structurally significant issue. A field named `diagnosis` in a non-diagnostic device's API creates regulatory, compliance, and safety risk. Rename to `clinical_context` throughout the data flow.

### 2. Remove diagnostic impression from AI guidance (C-001)
**File:** `assessment_scoring.py:155–160`  
**Impact:** HIGH — The AI is producing diagnostic impressions. Add "draft — decision support only — not a diagnosis" framing to all diagnostic impression content.

### 3. Remove treatment recommendations without draft qualifier (C-002)
**File:** `assessment_scoring.py:161–163`  
**Impact:** HIGH — AI is autonomously prioritising treatment. Add "draft recommendation — requires clinician review" framing.

### 4. Remove "ai_extracted" diagnosis evidence type (C-004)
**File:** `assessment_scoring.py:376–380`  
**Impact:** HIGH — The AI claims to extract diagnosis evidence. Change to `ai_assisted_draft` / `informational`.

### 5. Fix PCL-5 "Probable PTSD" diagnostic label (C-007)
**File:** `assessment_forms.js:313`  
**Impact:** MEDIUM-HIGH — This label is displayed directly to users in the assessment UI and constitutes a diagnostic statement from a screening tool.

---

## Regulatory Considerations

### FDA Software as Medical Device (SaMD)
The current implementation risks classification as **Class II diagnostic device software** due to:
- Presence of `diagnosis` fields in API responses (C-003, C-005, C-006)
- AI-generated diagnostic impressions (C-001)
- Autonomous red flag detection for suicide/self-harm (H-010)
- Autonomous risk recompute triggering (H-009)

**Recommendation:** The system should be explicitly architected as **Clinical Decision Support (CDS)** under the FDA's CDS guidance (September 2022), which requires:
1. Intent that the software supports, not replaces, clinician judgment
2. The clinician independently reviews the basis for the recommendations
3. The clinician retains ultimate decision-making authority

Issues C-001 through C-007 all violate requirement #1 by producing outputs that do not clearly support (rather than replace) clinician judgment.

### HIPAA Concerns
- No direct PHI leakage in error messages was found ✅
- The `patient_initials` field in AI summary prompts (assessments_router.py:1206) uses proper initialisation format ✅
- The `_resolve_patient_initials_and_condition` function properly guards against null patient IDs ✅

### State Medical Board Considerations
The autonomous treatment recommendation (C-002) and diagnostic impression (C-001) outputs could raise concerns under state unauthorized practice of medicine statutes if the system is deployed without adequate clinician oversight mechanisms.

---

## Recommended Remediation Timeline

| Phase | Timeline | Issues | Effort |
|-------|----------|--------|--------|
| **Hotfix** | 24–48 hours | C-001, C-002, C-007 | 4–6 hours |
| **Patch 1** | 1 week | C-003, C-004, C-005, C-006, H-001, H-005 | 8–12 hours |
| **Patch 2** | 2 weeks | H-002, H-003, H-004, H-006, H-007, H-008, H-009, H-010 | 12–16 hours |
| **Sprint** | 4 weeks | H-011, H-012, H-013, H-014, M-001 through M-012 | 16–20 hours |

---

## Conclusion

The DeepSynaps Protocol Studio Assessments V2 module contains significant clinical safety concerns centered around **autonomous diagnosis output** and **unframed treatment recommendations**. The scoring pipeline, API response models, and frontend severity labels all contain elements that position the AI as having diagnostic and prescriptive authority rather than decision-support capability.

The most critical fixes (renaming the `diagnosis` field, removing diagnostic impressions, and framing all recommendations as draft) must be completed before the system can be considered safe for clinical deployment. The existing positive safety practices (role-based access, draft labeling on AI summaries, advisory-only endpoint comments) provide a foundation that can be built upon.

**Verdict: CONDITIONAL PASS** — Safe for deployment ONLY after all 7 critical issues are resolved. The system should undergo a follow-up audit after remediation.

---

*Report generated by Clinical Safety Audit System*  
*DeepSynaps Protocol Studio — Assessments V2*
