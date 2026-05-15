# DeepSynaps Protocol Studio — Healthcare Safety UX Research

## Clinical AI Safety Patterns, Uncertainty Communication & Trust Architecture

**Document Version:** 1.0
**Date:** 2025-01
**Classification:** Research Report — Enterprise Healthcare SaaS Architecture
**Target Audience:** Frontend Architects, Clinical UX Designers, AI Safety Engineers, Healthcare Product Leads

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Uncertainty Display Patterns](#2-uncertainty-display-patterns)
3. [Provenance Display](#3-provenance-display)
4. [AI Limitation Callouts](#4-ai-limitation-callouts)
5. [Audit Visibility](#5-audit-visibility)
6. [Consent Visibility](#6-consent-visibility)
7. [Warning Systems](#7-warning-systems)
8. ["Requires Review" Patterns](#8-requires-review-patterns)
9. [Safe Wording Templates](#9-safe-wording-templates)
10. [Error State Handling](#10-error-state-handling)
11. [International Regulatory Patterns](#11-international-regulatory-patterns)
12. [Implementation Reference Architecture](#12-implementation-reference-architecture)
13. [Appendices](#13-appendices)

---

## 1. Executive Summary

### 1.1 Purpose of This Document

Healthcare AI systems occupy a uniquely sensitive position in the enterprise software landscape. Unlike recommendation engines or content platforms where a wrong suggestion carries minimal risk, clinical AI systems directly influence decisions that affect human lives. The interface between machine intelligence and clinical judgment must therefore be designed with an uncompromising focus on safety, transparency, and trust.

This document provides a comprehensive reference for designing safety-first user experiences in clinical AI systems. It synthesizes patterns from regulatory guidance (FDA, NHS, EU AI Act), academic research on human-AI interaction, and real-world implementations across major healthcare technology platforms.

### 1.2 Core Principles

| Principle | Description | Implementation |
|---|---|---|
| **Radical Transparency** | Every AI output must reveal its limitations, uncertainty, and provenance | Confidence displays, source attribution, audit trails |
| **Human-in-the-Loop** | Clinical judgment is never replaced; AI augments, never decides alone | Review workflows, acknowledgment requirements, override capabilities |
| **Progressive Disclosure** | Safety-critical information is visible at a glance; details are one click away | Severity indicators, expandable panels, contextual tooltips |
| **Fail-Safe Design** | When the system fails, it fails transparently — never silently or deceptively | Honest error states, graceful degradation, no synthetic results |
| **Contextual Awareness** | Safety patterns adapt to clinical context, user role, and patient acuity | Role-aware displays, urgency-weighted notifications, workflow integration |

### 1.3 The Trust Equation for Clinical AI

Trust in clinical AI follows a modified version of the sociological trust equation:

```
Clinical Trust = (Transparency x Accuracy x Consistency) / (Perceived Risk x Uncertainty)
```

Every pattern in this document is designed to maximize the numerator (transparency, demonstrated accuracy, consistent behavior) while minimizing the denominator (perceived risk through safety affordances, uncertainty through clear communication).

### 1.4 Research Methodology

This document synthesizes:
- **Regulatory guidance** from FDA, NHS England, EU AI Act, TGA Australia, Health Canada
- **Peer-reviewed literature** on clinical decision support systems (CDSS), human-AI interaction, and healthcare information visualization
- **Industry benchmarks** from Epic, Cerner, Philips, GE HealthCare, and emerging AI-native clinical platforms
- **Safety engineering principles** from aviation, nuclear, and other high-reliability industries adapted for healthcare

---

## 2. Uncertainty Display Patterns

### 2.1 Introduction: Why Uncertainty Matters

Clinical decisions are made under uncertainty. Physicians routinely weigh probabilities, consider differential diagnoses, and factor in incomplete information. However, humans are notoriously poor at interpreting statistical information — a phenomenon extensively documented by Kahneman and Tversky's research on cognitive biases.

AI systems compound this challenge. Machine learning models produce outputs that carry varying degrees of uncertainty, but this uncertainty is often invisible to end users. Research by Beede et al. (2020) at Google Health demonstrated that even experienced clinicians may over-trust AI predictions when confidence levels are not clearly displayed.

The goal of uncertainty display patterns is to make model confidence **visible, interpretable, and actionable** without overwhelming the clinician or causing alarm fatigue.

### 2.2 Confidence Intervals (Visual Ranges)

Confidence intervals represent the statistical range within which the true value is expected to fall. In clinical AI, they communicate the precision of quantitative predictions.

#### Visual Range Pattern: Slider Bar with Confidence Bounds

```
Predicted Risk Score: 72%
[████████████░░░░░░░░] 95% CI: [64% — 80%]
 ^primary prediction   ^lower bound      ^upper bound
```

**Best Practices:**
- Always pair the point estimate (single number) with the interval range
- Use darker fills for higher-density regions and lighter fills for tails
- When the confidence interval spans a clinically significant threshold (e.g., crosses from low-risk to high-risk), add a **threshold-crossing alert**
- Color the confidence range based on clinical significance, not just confidence width
- Example: A 95% CI of [3% — 12%] for malignancy risk is reassuringly below the 20% biopsy threshold, even though the interval is wide

#### Confidence Ribbon Pattern for Time-Series Predictions

For predictions over time (e.g., glucose forecasting, deterioration risk):

```
Risk Over Next 24 Hours:
100%|
 75%|    /-------
     |   / ~ ~ ~ ~\
 50%|  /  ~ 75%  ~ \
     | /   CI ribbon \
 25%|/               \
  0%+------------------
    0h    6h    12h   24h
```

The central line shows the predicted trajectory. The shaded ribbon represents the confidence interval. Wider ribbons indicate higher uncertainty.

**Key Design Decisions:**
- Ribbon opacity should be 20-30% to avoid overwhelming the central prediction line
- When the ribbon crosses an action threshold, trigger a visual alert (color change, icon)
- Allow clinicians to toggle between different confidence levels (80%, 90%, 95%)
- Always label what the confidence interval means in plain language: "We are 95% confident the true value falls in this range"

#### Confidence Interval Severity Matrix

| Confidence Width | Below Threshold | Near Threshold | Above Threshold |
|---|---|---|---|
| Narrow (tight) | Green — reliable reassurance | Yellow — reliable caution | Red — reliable concern |
| Wide (loose) | Yellow — uncertain reassurance | Orange — uncertain, monitor | Red + uncertainty flag — concern with low confidence |

When predictions are both high-risk AND low-confidence, this is a **critical pattern** requiring special handling — see Section 7.

### 2.3 Probability Bars (0-100%)

Probability bars translate numerical confidence into an intuitive visual format. They are most effective when showing the model's confidence across multiple possible outcomes.

#### Multi-Class Probability Bar Pattern

For differential diagnosis or multi-class classification:

```
Differential Diagnosis (AI-assisted):

Community-Acquired Pneumonia    [████████████████░░░░] 78%
Congestive Heart Failure         [██████░░░░░░░░░░░░░░] 24%
Acute Bronchitis                 [███░░░░░░░░░░░░░░░░░] 12%
Pulmonary Embolism               [█░░░░░░░░░░░░░░░░░░░]  4%
                                 ----------------------
                                 0%        50%       100%

AI Confidence: Medium (trained on 12,000+ similar cases)
```

**Critical Implementation Notes:**
- **Always sort by probability** — highest confidence first
- **Use distinct colors** for each condition to aid scanning, but ensure colorblind-safe palettes
- **Show the confidence value numerically** — never rely on bar length alone
- **Add an explicit statement about what the percentages mean**: "These percentages represent the AI model's estimated probability for each condition based on available data"
- **Highlight if probabilities sum to more than 100%** (indicating non-mutually exclusive conditions) with an explanatory note

#### Binary Probability Pattern

For binary predictions (e.g., sepsis risk, readmission risk):

```
+------------------ Sepsis Risk Assessment ------------------+
|                                                           |
|  Risk Probability: 73%                                    |
|  [████████████████████░░░░░░░░░░░░░░░░░░]                 |
|  0%          25%          50%          75%         100%    |
|                            ^                              |
|                    Action threshold (60%)                 |
|                                                           |
|  ┌─ Status: HIGH RISK ─ Above action threshold ─────────┐ |
|  │ Recommended action: Consider sepsis bundle initiation │ |
|  └──────────────────────────────────────────────────────┘ |
+-----------------------------------------------------------+
```

**Color Coding for Probability Bars:**

| Range | Color | Label | Clinical Meaning |
|---|---|---|---|
| 0% — 30% | Green | Low | Not likely — routine care |
| 31% — 60% | Yellow | Moderate | Possible — monitor closely |
| 61% — 80% | Orange | High | Likely — consider intervention |
| 81% — 100% | Red | Critical | Very likely — initiate protocol |

**Anti-Patterns to Avoid:**
- Never use probability bars without numeric labels
- Never use only red/green without intermediate states
- Never show probability bars without context about what they represent
- Never round probabilities to extremes (0% or 100%) — always show the nuance

### 2.4 Evidence Grade Badges (A/B/C/D)

Evidence grades communicate the methodological rigor underlying an AI recommendation. This pattern adapts the GRADE (Grading of Recommendations Assessment, Development and Evaluation) framework used in evidence-based medicine.

#### Evidence Grade Badge Pattern

```
+------------------------------------------------+
|  AI Recommendation                              |
|                                                 |
|  Consider initiating insulin protocol          |
|  ┌─────────┐                                   |
|  │Grade: B │ Evidence quality: Moderate        |
|  └─────────┘                                   |
|                                                 |
|  Based on: 3 randomized controlled trials,      |
|  2 prospective cohort studies (n=4,200)         |
+------------------------------------------------+
```

#### Evidence Grade Definitions

| Grade | Badge Color | Evidence Quality | Description | Example Sources |
|---|---|---|---|---|
| **A** | Dark Green + checkmark | High | Multiple RCTs or meta-analyses with consistent results | Cochrane reviews, large RCTs |
| **B** | Light Green + checkmark | Moderate | Limited RCTs, high-quality observational studies | Single RCT, well-designed cohort |
| **C** | Yellow + caution icon | Low | Observational studies, expert consensus | Retrospective studies, case series |
| **D** | Orange + warning icon | Very Low | Expert opinion, limited data, AI inference without direct evidence | Model-based predictions, theoretical |
| **X** | Gray + question icon | Insufficient | No evidence available, purely AI-generated hypothesis | Novel correlations, research-only |

**Implementation Guidelines:**
- Display the badge prominently near the recommendation it applies to
- Make the badge clickable to reveal the detailed evidence breakdown
- Use consistent badge sizing across all UI contexts
- When multiple recommendations appear, allow filtering by evidence grade
- Grade X should trigger an automatic "Research-only" disclaimer

#### Evidence Grade Aggregation

When an AI output combines multiple evidence sources:

```
┌──────────────────────────────────────────────┐
│  Treatment Recommendation Summary             │
│                                               │
│  ┌───────────┬─────────────────────────────┐ │
│  │ Component │ Evidence Grade              │ │
│  ├───────────┼─────────────────────────────┤ │
│  │ Drug A    │ [A] High — 8 RCTs           │ │
│  │ Dosing    │ [B] Moderate — 2 RCTs       │ │
│  │ Duration  │ [C] Low — cohort data       │ │
│  │ Monitor   │ [D] Very Low — AI inference │ │
│  └───────────┴─────────────────────────────┘ │
│                                               │
│  Overall Grade: [B] Moderate                  │
│  (Weighted by clinical impact of component)   │
└──────────────────────────────────────────────┘
```

### 2.5 Sample Size Indicators

Sample size directly affects confidence in statistical estimates. AI models trained or validated on small sample sizes should communicate this limitation transparently.

#### Sample Size Badge Pattern

```
+--------------------------------------------------+
|  Predicted Outcome: 85% survival probability      |
|                                                   |
|  ┌─ Sample Size Indicator ──────────────────────┐ │
|  │ Based on 147 similar patient profiles         │ │
|  │ [████████████░░░░] Moderate confidence        │ │
|  │                                               │ │
|  │ Strength: Moderate (n = 100-500)              │ │
|  └──────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

#### Sample Size Confidence Scale

| Category | Range | Badge | Visual Indicator | Recommendation |
|---|---|---|---|---|
| Very Small | n < 30 | Red warning | `[██░░░░░░░░]` | Use with extreme caution; flag for review |
| Small | 30 <= n < 100 | Orange caution | `[████░░░░░░]` | Limited reliability; consider additional evidence |
| Moderate | 100 <= n < 500 | Yellow | `[████████░░]` | Reasonable confidence; standard monitoring |
| Large | 500 <= n < 2000 | Green | `[██████████░]` | High confidence |
| Very Large | n >= 2000 | Dark green + star | `[████████████]` | Very high confidence; well-validated |

#### Cohort Matching Transparency

```
+--------------------------------------------------+
|  Similar Patient Cohort                           |
|                                                   |
|  ┌─ Cohort Match Quality ──────────────────────┐ │
|  │ Total similar cases found: 23                 │ │
|  │                                               │ │
|  │ Match breakdown:                              │ │
|  │ - Age: 23/23 matched (100%)                   │ │
|  │ - Diagnosis: 23/23 matched (100%)             │ │
|  │ - Comorbidities: 18/23 matched (78%)          │ │
|  │ - Medications: 12/23 matched (52%)            │ │
|  │                                               │ │
|  │ Overall match: [████████░░░░] 82%            │ │
|  │                                               │ │
|  │ ⚠ Limited medication history overlap          │ │
|  └──────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

**Key Principle:** Always show how many similar cases the recommendation is based on. A prediction based on 3 similar cases is fundamentally different from one based on 3,000 — even if the predicted probability is identical.

### 2.6 "Preliminary" / "Research-Only" Labels

Certain AI outputs are generated in contexts where clinical validation has not been completed. These must be clearly distinguished from validated clinical recommendations.

#### Preliminary Label Pattern

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ⚠ PRELIMINARY FINDING — RESEARCH USE ONLY          │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │                                               │  │
│  │  This analysis is part of an ongoing research │  │
│  │  study and has not been clinically validated. │  │
│  │                                               │  │
│  │  Do not use for clinical decision-making      │  │
│  │  without expert review.                       │  │
│  │                                               │  │
│  │  [ I Understand — Show Analysis ]             │  │
│  │  [ Request Clinical Validation ]              │  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  IRB Protocol #: 2024-0847                          │
│  Principal Investigator: Dr. Jane Smith              │
│  Contact: j.smith@institution.edu                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Research-Only Badge System

| Context | Badge | Required Actions |
|---|---|---|
| IRB-approved research | Purple "RESEARCH" badge | Consent verification required, audit logging mandatory |
| Pre-clinical validation | Yellow "VALIDATION" badge | Parallel expert review required, no direct clinical use |
| Experimental feature | Gray "BETA" badge | Explicit opt-in required, enhanced monitoring |
| Retrospective analysis | Blue "RETROSPECTIVE" badge | Clearly labeled as backward-looking, not prospective |
| Simulator/training | Green "SIMULATION" badge | Must be clearly separated from live patient data |

### 2.7 Graying Out Low-Confidence Findings

Visual de-emphasis of low-confidence findings reduces cognitive load while maintaining transparency.

#### Confidence-Based Opacity Pattern

```
+--------------------------------------------------+
|  AI-Detected Findings                             |
|                                                   |
|  [HIGH CONFIDENCE]                                |
|  • Pleural effusion, right base                   |
|  • Cardiomegaly                                   |
|                                                   |
|  [MODERATE CONFIDENCE]                            |
|  • Possible pulmonary nodule, left upper lobe     |
|                                                   |
|  [LOW CONFIDENCE — Dimmed]                        |
|  • Possible subtle infiltrate, left base          |
|  • Possible small pericardial effusion            |
|                                                   |
|  ┌─ Why are some findings dimmed? ─────────────┐  |
|  │ Low-confidence findings have >30% chance of   │  |
|  │ being incorrect. They are shown for           │  │
|  │ completeness but require expert verification.  │  |
|  └──────────────────────────────────────────────┘  |
+--------------------------------------------------+
```

**Implementation Specifications:**
- High confidence (>80%): Full opacity (100%), standard text weight
- Moderate confidence (50-80%): 85% opacity, standard text weight
- Low confidence (20-50%): 60% opacity, lighter text weight
- Very low confidence (<20%): 40% opacity, italicized, collapsible section
- Always provide a "Show all findings" toggle so clinicians can expand low-confidence items
- Never hide low-confidence findings entirely — they may contain critical signals

### 2.8 Question Mark Icons with Tooltips

Question mark icons provide contextual explanation without cluttering the primary interface.

#### Tooltip Pattern for Uncertainty Explanation

```
Predicted Readmission Risk: 42% [?]
                                 ^
                                 Click for explanation

--- On Click ---

┌─ About This Prediction ───────────────────────────┐
│                                                   │
│  What this number means:                          │
│  This is the AI model's estimated probability     │
│  that this patient will be readmitted within      │
│  30 days of discharge.                            │
│                                                   │
│  How it was calculated:                           │
│  • Model type: Gradient-boosted ensemble          │
│  • Features used: 47 clinical variables           │
│  • Training data: 45,000 discharges (2020-2024)   │
│  • Validation AUC: 0.84                           │
│                                                   │
│  Limitations:                                     │
│  • Does not account for social determinants       │
│  • May be less accurate for rare conditions       │
│  • Updated quarterly; last update: Jan 2025       │
│                                                   │
│  [ View Full Model Documentation ]                │
│  [ Report Concern About This Output ]             │
│                                                   │
└───────────────────────────────────────────────────┘
```

#### Tooltip Content Standards

Every uncertainty tooltip should contain:
1. **What the number means** (plain language, no jargon)
2. **How it was calculated** (model type, key features, data sources)
3. **Known limitations** (what the model cannot account for)
4. **When it was last updated** (model freshness)
5. **Actions the clinician can take** (view documentation, report concerns)

### 2.9 Explanatory Text: "Based on Limited Evidence"

Inline explanatory text provides immediate context without requiring interaction.

#### Inline Explanation Pattern

```
+--------------------------------------------------+
|  Drug Interaction Alert (AI-detected)             |
|                                                   |
|  Potential interaction detected between:          |
|  • Warfarin (current medication)                  |
|  • Amoxicillin (newly prescribed)                 |
|                                                   |
|  ┌─ Evidence Summary ──────────────────────────┐  │
|  │ ⚠ Based on limited evidence                 │  │
|  │                                             │  │
|  │ Detected in 3 of 1,200 similar cases.       │  │
|  │ This is an exploratory finding and has      │  │
|  │ not been validated in controlled studies.   │  │
|  │                                             │  │
|  │ Confidence: 34% — Low                       │  │
|  │ Evidence Grade: D (Very Low)                │  │
|  └──────────────────────────────────────────────┘  │
+--------------------------------------------------+
```

#### Standard Explanatory Text Templates

| Confidence Level | Explanatory Text |
|---|---|
| Very High (>95%) | "Based on strong evidence. High confidence in this prediction." |
| High (80-95%) | "Based on substantial evidence. Review recommended for confirmation." |
| Moderate (60-80%) | "Based on moderate evidence. Please verify against clinical assessment." |
| Low (40-60%) | "Based on limited evidence. This prediction should be interpreted cautiously." |
| Very Low (<40%) | "Based on very limited evidence. This is an exploratory finding only." |

### 2.10 Uncertainty Display Integration Matrix

The following matrix shows which uncertainty patterns to combine in different clinical contexts:

| Context | Confidence Interval | Probability Bar | Evidence Grade | Sample Size | Preliminary Label | Grayed Out |
|---|---|---|---|---|---|---|
| Diagnosis support | Yes | Yes (multi-class) | Yes | Yes | If needed | Yes |
| Risk prediction | Yes | Yes (binary) | Yes | Yes | If research | No |
| Treatment recommendation | No | No | Yes | Yes | If research | No |
| Drug interaction | No | No | Yes | Yes | If exploratory | No |
| Imaging finding | No | Yes (binary) | No | Yes | If research | Yes |
| Lab result interpretation | Yes | No | Yes | Yes | No | No |
| Protocol suggestion | No | No | Yes | Yes | If experimental | No |
| Discharge planning | Yes | Yes | Yes | Yes | No | No |

---

## 3. Provenance Display

### 3.1 Introduction: The Importance of Source Transparency

Provenance — the documented history of where information comes from — is foundational to clinical trust. In healthcare, the source of information directly affects its credibility:
- A recommendation from a Cochrane systematic review carries different weight than one from a single case report
- An internally validated prediction carries different weight than one from a third-party API
- Data from an EHR with documented quality issues requires different handling than data from a gold-standard registry

The provenance display patterns ensure that clinicians can always trace information back to its origin and assess its reliability.

### 3.2 Source Icons

Source icons provide immediate visual identification of information origins.

#### Source Icon Library

| Source Type | Icon | Color | Hover Text | Example |
|---|---|---|---|---|
| PubMed/Peer-reviewed | Document with checkmark | Blue | "Peer-reviewed publication" | Clinical trial result |
| Internal Database | Database cylinder | Purple | "Internal validated dataset" | Historical patient cohort |
| Clinical Guideline | Book/gavel | Green | "Published clinical guideline" | ACC/AHA guideline |
| FDA Label | Shield with FDA | Orange | "FDA-approved product label" | Drug dosing information |
| AI Model Prediction | Brain with circuit | Teal | "AI-generated prediction" | Risk score, predicted outcome |
| External API | Cloud with arrow | Gray | "External data service" | Third-party drug database |
| User/Clinician Input | Person icon | Blue-gray | "Clinician-entered data" | Manual assessment entry |
| Device/IoT | Heartbeat monitor | Red | "Connected device data" | Continuous glucose monitor |
| Patient-Reported | Speech bubble | Yellow | "Patient-reported information" | Symptom questionnaire |
| Research/Experimental | Flask | Pink | "Research or experimental data" | Trial protocol data |

#### Source Icon Implementation

```
+--------------------------------------------------+
|  Medication Recommendation                        |
|                                                   |
|  Recommend: Empagliflozin 10mg daily              |
|                                                   |
|  Sources:                                         |
|  [📄] ADA Standards of Care 2024 — Guideline      |
|  [🛡️] FDA Label — Empagliflozin (Jardiance)      |
|  [🧠] Internal ML Model — Outcome prediction      |
|  [☁️] IBM Micromedex — Drug interaction check     |
|                                                   |
|  [ View Full Evidence Chain ]                     |
+--------------------------------------------------+
```

### 3.3 Last Updated Timestamps

Clinical information decays in value over time. Provenance must include freshness indicators.

#### Timestamp Pattern

```
+--------------------------------------------------+
|  Clinical Decision Support Alert                  |
|                                                   |
|  Recommendation: Initiate DVT prophylaxis         |
|                                                   |
|  ┌─ Provenance ─────────────────────────────────┐ │
|  │                                               │ │
|  │  Guideline source: CHEST 2021 Guidelines      │ │
|  │  Last reviewed: December 15, 2024             │ │
|  │  Next scheduled review: June 15, 2025         │ │
|  │  Status: Current ✓                            │ │
|  │                                               │ │
|  │  Model prediction: DVT risk score 7.2         │ │
|  │  Model version: v3.2.1                        │ │
|  │  Last trained: November 1, 2024               │ │
|  │  Next training cycle: February 1, 2025        │ │
|  │  Status: Current ✓                            │ │
|  │                                               │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

#### Freshness Indicators

| Age | Badge | Color | Action Required |
|---|---|---|---|
| < 30 days | "Current" | Green | None |
| 30-90 days | "Recent" | Light green | None, routine review |
| 90-180 days | "Review due" | Yellow | Schedule review |
| 180-365 days | "Stale" | Orange | Priority review |
| > 365 days | "Outdated" | Red | Immediate review, consider deprecation |

### 3.4 Author/Curator Attribution

Human accountability for AI-generated content is essential. Every recommendation should trace back to a responsible human or organization.

#### Attribution Pattern

```
+--------------------------------------------------+
|  AI-Generated Care Plan Summary                   |
|                                                   |
|  Generated by: ClinicalAI Assistant v2.4          |
|  Model: CarePlan-Llama-70B (fine-tuned)           |
|  Institution: Memorial Hospital System            |
|                                                   |
|  ┌─ Human Oversight ───────────────────────────┐ │
|  │                                             │ │
|  │  Clinical review by:                        │ │
|  │  • Dr. Michael Chen, MD — Attending         │ │
|  │    Reviewed: Jan 15, 2025 at 14:32          │ │
|  │    Status: Approved with modifications      │ │
|  │                                             │ │
|  │  • Sarah Johnson, PharmD — Pharmacist       │ │
|  │    Reviewed: Jan 15, 2025 at 15:01          │ │
|  │    Status: Approved                         │ │
|  │                                             │ │
|  │  [ View Full Review Chain ]                 │ │
|  └─────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

#### Attribution Standards

Every clinical AI output must include:
1. **AI system identification**: Model name, version, training date
2. **Institutional accountability**: Organization responsible for deployment
3. **Human reviewers**: Names, credentials, review dates, decisions
4. **Chain of custody**: Full trace of who has reviewed and approved

### 3.5 Evidence Trail Links

Clinicians must be able to drill down from a recommendation to the underlying evidence.

#### Evidence Chain Pattern

```
+--------------------------------------------------+
|  Evidence Trail                                   |
|                                                   |
|  Recommendation: Start insulin glargine 10 units  |
|                                                   |
|  ┌─ Evidence Chain ────────────────────────────┐  │
|  │                                             │  │
|  │  Step 1: AI Risk Assessment                 │  │
|  │  └── HbA1c: 9.2%, fasting glucose: 186    │  │
|  │      [View source data →]                   │  │
|  │                                             │  │
|  │  Step 2: Guideline Match                    │  │
|  │  └── ADA 2024: "If HbA1c >8.5%, consider   │  │
|  │      basal insulin"                         │  │
|  │      [View guideline →]                     │  │
|  │                                             │  │
|  │  Step 3: Dosing Calculation                 │  │
|  │  └── 0.2 units/kg x 50kg = 10 units        │  │
|  │      [View calculation →]                   │  │
|  │                                             │  │
|  │  Step 4: Safety Check                       │  │
|  │  └── No contraindications found             │  │
|  │      [View safety analysis →]               │  │
|  │                                             │  │
|  └─────────────────────────────────────────────┘  │
+--------------------------------------------------+
```

### 3.6 "Verified by" Badges

Third-party verification badges add credibility to AI-generated content.

#### Verification Badge Pattern

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  Treatment Recommendation                             │
│                                                       │
│  ┌─ Verification Status ─────────────────────────┐   │
│  │                                               │   │
│  │  [✓] Verified by clinical pharmacy           │   │
│  │      Reviewer: Sarah Johnson, PharmD          │   │
│  │      Date: Jan 15, 2025                       │   │
│  │                                               │   │
│  │  [✓] Verified against institutional protocol  │   │
│  │      Protocol ID: CHF-2024-v3                 │   │
│  │      Date: Jan 15, 2025                       │   │
│  │                                               │   │
│  │  [⏳] Awaiting attending physician review     │   │
│  │      Assigned to: Dr. Michael Chen            │   │
│  │      Due: Jan 15, 2025 18:00                  │   │
│  │                                               │   │
│  │  [ ] Not verified by specialty board          │   │
│  │      (Not applicable — general medicine)      │   │
│  │                                               │   │
│  └───────────────────────────────────────────────┘   │
│                                                       │
│  AI Confidence: 87% (High)                            │
│                                                       │
└──────────────────────────────────────────────────────┘
```

#### Verification States

| State | Badge | Icon | Meaning |
|---|---|---|---|
| Verified | Green | Checkmark | Reviewed and approved by qualified human |
| Pending | Yellow | Clock | Awaiting human review |
| Partial | Orange | Exclamation | Some verifications complete, others pending |
| Overridden | Blue | Person | Clinician has overridden AI recommendation |
| Disputed | Red | Cross | Reviewer disagrees with AI output |
| N/A | Gray | Minus | This verification type doesn't apply |

### 3.7 Version Numbers

Version tracking ensures reproducibility and supports rollback when issues are discovered.

#### Version Display Pattern

```
+--------------------------------------------------+
|  System Information Footer                          |
|                                                   |
|  AI Model: ClinicalDecision-v3.2.1               |
|  Knowledge Base: MedKB-2024-Q4-v2.1               |
|  Guidelines: ADA2024, CHEST2021, ACCAHA2022       |
|  UI Version: 4.5.0                                |
|                                                   |
|  [ View Changelog ]  [ Report Issue ]             |
+--------------------------------------------------+
```

#### Semantic Versioning for Clinical AI

Use semantic versioning with clinical extensions:
- **Major (X.0.0)**: Model architecture change, new training paradigm, new output format
- **Minor (x.Y.0)**: New features, additional guideline integration, new prediction types
- **Patch (x.y.Z)**: Bug fixes, data corrections, safety improvements
- **Date suffix** (x.y.Z-YYYYMMDD): Training data cutoff date

Example: `ClinicalDecision-v3.2.1-20241101` — Major version 3, minor version 2, patch 1, trained on data through November 1, 2024.

### 3.8 Chain of Custody Indicators

Chain of custody documents how data has been handled from its origin to the current display.

#### Chain of Custody Pattern

```
+--------------------------------------------------+
|  Data Chain of Custody                            |
|                                                   |
|  Current Display: Lab Result Interpretation       |
|                                                   |
|  ┌─ Custody Timeline ─────────────────────────┐  │
|  │                                            │  │
|  │  [1] Jan 14, 2025 08:30                    │  │
|  │      Patient blood sample collected        │  │
|  │      By: Lab technician #472               │  │
|  │      Location: Main Lab, Station 3         │  │
|  │      [View chain of custody record →]      │  │
|  │                                            │  │
|  │  [2] Jan 14, 2025 09:15                    │  │
|  │      Sample analyzed — Automated CBC       │  │
|  │      Device: Sysmex XN-1000                │  │
|  │      QC Status: Passed                     │  │
|  │      [View instrument QC →]                │  │
|  │                                            │  │
|  │  [3] Jan 14, 2025 09:22                    │  │
|  │      Results entered into EHR              │  │
|  │      System: Epic Beaker                   │  │
|  │      Entered by: Automated interface       │  │
|  │      [View HL7 message →]                  │  │
|  │                                            │  │
|  │  [4] Jan 14, 2025 09:25                    │  │
|  │      AI interpretation generated            │  │
|  │      Model: LabInterpreter-v2.1            │  │
|  │      Confidence: 92%                       │  │
|  │      [View model input →]                  │  │
|  │                                            │  │
|  │  [5] Jan 14, 2025 10:00                    │  │
|  │      Displayed to clinician (current view) │  │
|  │      Viewed by: Dr. Michael Chen           │  │
|  │      [View access log →]                   │  │
|  │                                            │  │
|  └────────────────────────────────────────────┘  │
+--------------------------------------------------+
```

---

## 4. AI Limitation Callouts

### 4.1 Introduction: Managing Expectations

AI limitation callouts are the safety labels of clinical AI. Just as medication packaging includes warnings about side effects and contraindications, AI-generated clinical content must include clear statements about its limitations.

The goal is not to discourage use of AI — it is to ensure that clinicians use AI appropriately, with full awareness of its capabilities and boundaries.

### 4.2 Banner at Top: "AI-Assisted Analysis. Requires Clinician Review."

The persistent top banner is the most visible limitation callout. It appears on every page where AI-generated content is displayed.

#### Persistent Banner Pattern

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔷 AI-ASSISTED ANALYSIS — All outputs require clinician review     │
│  before use in clinical decision-making. [Learn more] [Dismiss]     │
└─────────────────────────────────────────────────────────────────────┘
```

#### Banner Variations by Context

| Context | Banner Text | Color | Dismissible? |
|---|---|---|---|
| General AI assistance | "AI-assisted analysis. Requires clinician review." | Blue | No |
| High-stakes decision support | "AI-GENERATED RECOMMENDATION — Clinical review required before action" | Yellow | No |
| Experimental/research feature | "RESEARCH FEATURE — Not for clinical use without validation" | Purple | No |
| Image analysis | "AI-detected finding — Verification by qualified clinician required" | Orange | No |
| Risk prediction | "AI risk estimation — For informational purposes; clinical judgment prevails" | Blue | No |
| Automated documentation | "AI-generated draft — Review and edit before signing" | Yellow | Yes (after acknowledgment) |

#### Implementation Notes
- The banner must appear **above the fold** — visible without scrolling
- The banner must persist across page navigation within the AI-assisted workflow
- The banner must use a distinct color not used for other UI elements
- "Dismiss" should only be available for lower-risk contexts and should require explicit acknowledgment
- On mobile, the banner may collapse to an icon that expands on tap

### 4.3 Inline Labels: "AI-Generated Draft"

Inline labels identify specific pieces of content as AI-generated within a larger document.

#### Inline Label Pattern

```
+--------------------------------------------------+
|  Clinical Note — Discharge Summary                |
|                                                   |
|  [AI-Generated Draft — Review Required]           |
|                                                   |
|  ---                                              |
|                                                   |
|  Patient: [Name], [MRN]                           |
|  Admission Date: January 10, 2025                 |
|  Discharge Date: January 15, 2025                 |
|                                                   |
|  Chief Complaint:                                 |
|  [AI] Shortness of breath and chest pain [✏️]    │
|                                                   |
|  Hospital Course:                                 |
|  [AI] Patient admitted with acute onset          │
|  dyspnea. Workup revealed... [✏️]                │
|                                                   |
|  [AI] labels indicate AI-generated text          │
|  that requires clinician review and editing.     │
+--------------------------------------------------+
```

#### Inline Label Design
- Use a subtle but distinct background highlight (e.g., light yellow or light blue)
- Include an "AI" label or icon at the start of each AI-generated section
- Provide an edit button (pencil icon) adjacent to each AI-generated section
- Show the label on hover even if it fades after initial display
- Never make inline labels dismissible — they must persist until edited

### 4.4 Footer Disclaimers on Every Output

Footer disclaimers provide a persistent, standardized statement on every AI-generated output.

#### Footer Disclaimer Pattern

```
+--------------------------------------------------+
|                                                   |
|  [AI-generated content ends here]                 |
|                                                   |
|  ┌─ Disclaimer ─────────────────────────────────┐ │
|  │ This content was generated by an artificial   │ │
|  │ intelligence system and is provided for       │ │
|  │ informational purposes only. It does not      │ │
|  │ constitute medical advice, diagnosis, or      │ │
|  │ treatment recommendations. Always use         │ │
|  │ clinical judgment and consult relevant        │ │
|  │ guidelines. The institution is not liable     │ │
|  │ for decisions made based on this content      │ │
|  │ without appropriate clinical review.          │ │
|  │                                               │ │
|  │ AI System: ClinicalAssistant v3.2.1          │ │
|  │ Generated: January 15, 2025 at 14:32 UTC     │ │
|  │ [View audit log] [Report issue]               │ │
|  └──────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

#### Disclaimer Content Standards

Every AI output footer should include:
1. **Nature statement**: "Generated by artificial intelligence"
2. **Purpose limitation**: "For informational purposes only"
3. **Non-diagnostic statement**: "Not a diagnosis or treatment recommendation"
4. **Clinical judgment reminder**: "Clinical judgment prevails"
5. **Liability statement**: Institution's standard disclaimer
6. **System identification**: Model name and version
7. **Generation timestamp**: When the output was created
8. **Action links**: Audit log, issue reporting

### 4.5 Modal Confirmations for Important Actions

High-stakes actions triggered by AI recommendations require explicit confirmation.

#### Confirmation Modal Pattern

```
┌──────────────────────────────────────────────────────┐
│                                                       │
│  ⚠ Confirm Action: Accept AI Recommendation?         │
│                                                       │
│  You are about to:                                    │
│  • Add "Metformin 500mg BID" to active medications   │
│                                                       │
│  AI recommendation details:                           │
│  • Confidence: 87% (High)                             │
│  • Evidence grade: B (Moderate)                       │
│  • Based on: ADA 2024 Guidelines, patient HbA1c 8.2% │
│                                                       │
│  ┌─ Required Acknowledgment ──────────────────────┐  │
│  │                                                 │  │
│  │  [ ] I have reviewed this recommendation        │  │
│  │      and confirm it is appropriate for this     │  │
│  │      patient.                                   │  │
│  │                                                 │  │
│  │  [ ] I understand this was AI-generated and     │  │
│  │      have applied my clinical judgment.         │  │
│  │                                                 │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  [Cancel]          [Accept — Sign and Proceed]        │
│                                                       │
│  Note: This action will be logged in the audit trail. │
│                                                       │
└──────────────────────────────────────────────────────┘
```

#### Actions Requiring Confirmation Modal

| Action | Required Checkboxes | Additional Context |
|---|---|---|
| Accept AI treatment recommendation | 2 (reviewed + AI awareness) | Show evidence summary |
| Override AI safety alert | 3 + free-text reason | Require override reason |
| Export AI-generated report | 1 (reviewed) | Add disclaimer to export |
| Share AI output externally | 2 (approved + disclaimer) | Confirm recipient authorized |
| Archive AI-generated content | 1 (reviewed) | Confirm retention policy |
| Apply AI protocol suggestion | 2 (reviewed + verified) | Show protocol parameters |

### 4.6 "This Is Not a Diagnosis" Reminders

Diagnostic statements carry special legal and clinical weight. AI systems must never present outputs as definitive diagnoses.

#### Non-Diagnosis Pattern

```
+--------------------------------------------------+
|  AI-Assisted Assessment                            |
|                                                   |
|  ┌─ Important Notice ──────────────────────────┐  │
|  │ ⚠ THIS IS NOT A DIAGNOSIS                    │  │
|  │                                              │  │
|  │ The following is an AI-assisted analysis     │  │
|  │ of available clinical data. It is intended   │  │
|  │ to support, not replace, clinical judgment.  │  │
|  │                                              │  │
|  │ A formal diagnosis requires:                 │  │
|  │ • Comprehensive clinical evaluation          │  │
|  │ • Relevant diagnostic testing                │  │
|  │ • Qualified clinician assessment             │  │
|  │                                              │  │
|  │ [ I Understand — View Analysis ]             │  │
|  └──────────────────────────────────────────────┘  │
+--------------------------------------------------+
```

#### Standard Non-Diagnosis Statements

| Context | Statement |
|---|---|
| Symptom analysis | "This analysis identifies possible conditions based on reported symptoms. It is not a diagnosis." |
| Lab interpretation | "This interpretation suggests possible clinical significance. Final interpretation requires qualified laboratory review." |
| Imaging analysis | "AI-detected findings require confirmation by a qualified radiologist. This is not a radiology report." |
| Risk prediction | "This risk estimate is based on statistical modeling. Individual patient risk may differ." |
| Treatment suggestion | "This is a suggested treatment approach. Final treatment decisions require clinical evaluation." |

### 4.7 Education Tooltips: "Why Am I Seeing This?"

Educational tooltips help clinicians understand why specific AI outputs are being shown to them.

#### "Why Am I Seeing This?" Tooltip Pattern

```
+--------------------------------------------------+
|  AI Alert: Elevated Sepsis Risk                    |
|                                                   |
|  [? Why am I seeing this?]                        |
|     ^                                              |
|     Click to expand                                |
|                                                   |
|  --- On Click ---                                 |
|                                                   |
|  ┌─ Why This Alert Appeared ───────────────────┐  │
|  │                                              │  │
|  │  This alert appeared because:                │  │
|  │                                              │  │
|  │  1. Patient vitals triggered sepsis criteria │  │
|  │     • Heart rate: 112 (threshold: >100)      │  │
|  │     • Temperature: 38.6C (threshold: >38.3)  │  │
|  │     • WBC: 14,200 (threshold: >12,000)       │  │
|  │                                              │  │
|  │  2. AI risk model score: 78/100              │  │
|  │     (Above action threshold of 60)           │  │
|  │                                              │  │
|  │  3. No sepsis protocol currently active      │  │
|  │     for this patient                         │  │
|  │                                              │  │
|  │  This alert fires for ~15% of patients       │  │
|  │  meeting these criteria.                     │  │
|  │                                              │  │
|  │  [View similar cases] [Alert settings]       │  │
|  └──────────────────────────────────────────────┘  │
+--------------------------------------------------+
```

#### "Why Am I Seeing This?" Content Template

Every tooltip should answer:
1. **What triggered this**: Specific data points or conditions
2. **The threshold**: What value/rule was crossed
3. **The model**: Which AI system generated this
4. **Frequency**: How often this alert fires (to calibrate clinician response)
5. **Actions available**: What the clinician can do next

---

## 5. Audit Visibility

### 5.1 Introduction: Accountability Through Transparency

Audit visibility is the technical implementation of clinical accountability. Every access to patient data, every AI-generated recommendation, and every clinician action must be logged, accessible, and reviewable.

Regulatory frameworks (HIPAA, GDPR, 21 CFR Part 11) require comprehensive audit trails. Beyond compliance, audit visibility builds trust by demonstrating that the system operates transparently and accountably.

### 5.2 "View Audit Log" Link on Every Page

The audit log must be accessible from every page that displays patient data or AI-generated content.

#### Audit Log Access Pattern

```
+--------------------------------------------------+
|  Patient: John Doe | MRN: 12345678    [🔍 Audit] │
|                                                   |
|  [Overview] [Labs] [Imaging] [AI Insights]        |
|                                                   |
|  [Content area...]                                |
+--------------------------------------------------+
```

The audit icon/button should be:
- Positioned consistently (top-right of patient context)
- Visible but non-intrusive
- Accessible with a single click
- Available to authorized users only (role-based access)
- Color-coded: gray normally, red if anomalies detected

#### Audit Log Modal

```
┌──────────────────────────────────────────────────────────────┐
│  Audit Log — Patient: John Doe (MRN: 12345678)              │
│                                                              │
│  Filter: [All Actions ▼] [All Users ▼] [Last 24h ▼]        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Time      User          Action           Source      AI │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ 14:32   Dr. Chen      Viewed record      Direct       │ │
│  │ 14:30   AI System     Generated risk     Automated   ✓ │ │
│  │ 14:28   Dr. Lee       Viewed labs        Direct       │ │
│  │ 14:25   Nurse Patel   Updated vitals     EHR         │ │
│  │ 14:20   Dr. Chen      Viewed AI alert    Direct       │ │
│  │ 14:18   AI System     Flagged sepsis     Automated   ✓ │ │
│  │ 14:15   Dr. Smith     Viewed imaging     Direct       │ │
│  │ 14:10   Resident Kim  Viewed note        Direct       │ │
│  │ 14:05   AI System     Suggested protocol Automated   ✓ │ │
│  │ 14:00   Dr. Chen      Accessed patient   Direct       │ │
│  ├────────────────────────────────────────────────────────┤ │
│  │ Showing 10 of 47 entries  [< 1 2 3 4 5 >]             │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  [Export CSV] [Export PDF] [Print]                           │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Activity Timeline Per Patient

The activity timeline provides a chronological view of all interactions with a patient's data.

#### Activity Timeline Pattern

```
+--------------------------------------------------+
|  Patient Activity Timeline                        |
|  John Doe | MRN: 12345678 | Jan 10-15, 2025      |
|                                                   |
|  ┌─ January 15, 2025 ──────────────────────────┐ │
|  │                                             │ │
|  │  14:32  👤 Dr. Chen                         │ │
|  │         Viewed patient record               │ │
|  │         [Details]                           │ │
|  │                                             │ │
|  │  14:30  🤖 AI System                        │ │
|  │         Generated readmission risk: 42%     │ │
|  │         Model: ReadmitPredictor-v3.1        │ │
|  │         [View output] [View model details]  │ │
|  │                                             │ │
│  │  14:18  🤖 AI System                        │ │
|  │         Flagged: Elevated sepsis risk       │ │
|  │         Risk score: 78/100                  │ │
|  │         [View alert] [Acknowledge]          │ │
|  │                                             │ │
|  │  14:15  👤 Dr. Smith                        │ │
|  │         Viewed chest X-ray                  │ │
|  │         [View image]                        │ │
|  │                                             │ │
|  └─────────────────────────────────────────────┘ │
|                                                   |
|  ┌─ January 14, 2025 ──────────────────────────┐ │
|  │                                             │ │
|  │  [Collapsed — 12 entries] [Expand ▼]        │ │
|  └─────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 5.4 Who Accessed What, When

Granular access logging records every data access with full context.

#### Access Log Entry Schema

```
{
  "timestamp": "2025-01-15T14:32:00Z",
  "user": {
    "id": "user_48291",
    "name": "Dr. Michael Chen",
    "role": "Attending Physician",
    "department": "Internal Medicine",
    "credentials": "MD"
  },
  "patient": {
    "mrn": "12345678",
    "name": "John Doe"
  },
  "action": {
    "type": "view",
    "resource": "patient_record",
    "resource_id": "rec_789123",
    "data_elements_accessed": [
      "demographics",
      "vitals",
      "lab_results",
      "ai_risk_score"
    ]
  },
  "context": {
    "session_id": "sess_284719",
    "ip_address": "10.0.1.45",
    "device": "workstation",
    "location": "Main Hospital, Floor 3"
  },
  "ai_interaction": {
    "model_accessed": "ReadmitPredictor-v3.1",
    "recommendation_viewed": true,
    "recommendation_accepted": false,
    "override_reason": null
  },
  "compliance": {
    "hipaa_audit": true,
    "gdpr_logged": true,
    "retention_years": 7
  }
}
```

### 5.5 Export Access Summaries

Users must be able to export their own access summaries for compliance and transparency.

#### Export Pattern

```
+--------------------------------------------------+
|  Export Access Summary                            |
|                                                   |
|  Patient: John Doe (MRN: 12345678)                |
|  Date range: [Jan 10, 2025] to [Jan 15, 2025]     |
|                                                   |
|  Export format:                                   |
|  (•) PDF — Human-readable summary                 |
|  ( ) CSV — Raw data for analysis                  |
|  ( ) JSON — Structured data                       |
|                                                   |
|  Include:                                         |
|  [x] All user access                              |
|  [x] AI-generated outputs                         |
|  [x] Data modifications                           |
|  [ ] System events                                |
|                                                   |
|  [Generate Export]                                |
|                                                   |
|  Note: This export is for transparency purposes   |
|  and is also logged in the audit trail.            |
+--------------------------------------------------+
```

### 5.6 Real-Time Access Notifications

Real-time notifications alert patients or authorized monitors when their data is accessed.

#### Real-Time Notification Pattern

```
+--------------------------------------------------+
|  Real-Time Access Monitor                         |
|                                                   |
|  ┌─ Live Activity ─────────────────────────────┐ │
|  │                                             │ │
|  │  🔵 14:32:15 — Dr. Chen accessed record    │ │
|  │     Internal Medicine — IP: 10.0.1.45      │ │
|  │                                             │ │
|  │  🟢 14:30:01 — AI risk calculation         │ │
|  │     Model: ReadmitPredictor-v3.1           │ │
|  │                                             │ │
|  │  🔵 14:28:33 — Dr. Lee accessed labs       │ │
|  │     Emergency Medicine — IP: 10.0.2.12     │ │
|  │                                             │ │
|  │  [Pause Notifications] [Settings]           │ │
|  └─────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 5.7 Anomaly Alerts

Anomaly detection identifies unusual access patterns that may indicate security issues or compliance violations.

#### Anomaly Detection Rules

| Anomaly Type | Detection Rule | Alert Level |
|---|---|---|
| Off-hours access | Access between 22:00-06:00 | Medium |
| Bulk access | >50 records in 1 hour | High |
| Unusual location | Access from unknown IP/geo | Critical |
| Role mismatch | Nurse accessing MD-only data | Critical |
| Repeated AI overrides | >3 overrides in 1 session | Medium |
| No-justification access | Patient record without context | High |
| External sharing | Export to non-institutional email | Critical |

#### Anomaly Alert UI

```
┌──────────────────────────────────────────────────────┐
│  ⚠ ANOMALY DETECTED — Immediate Review Required     │
│                                                       │
│  Type: Bulk patient record access                     │
│  Severity: HIGH                                       │
│                                                       │
│  Details:                                             │
│  • User: Dr. Sarah Johnson                            │
│  • Records accessed: 73 in 45 minutes                 │
│  • Time: January 15, 2025 02:15-03:00                 │
│  • Normal pattern: 8-12 records per hour              │
│  • Deviation: 6x above normal                         │
│                                                       │
│  Possible explanations:                               │
│  • Research batch review                              │
│  • Quality audit activity                             │
│  • Unauthorized access                                │
│                                                       │
│  [Acknowledge] [Investigate] [Escalate to Security]   │
│                                                       │
│  This alert was generated by the AI anomaly detection  │
│  system and has been logged in the security audit.     │
└──────────────────────────────────────────────────────┘
```

---

## 6. Consent Visibility

### 6.1 Introduction: Consent as a First-Class UX Concern

Informed consent is both a legal requirement and an ethical imperative in healthcare AI. GDPR Article 9 classifies health data as a "special category" requiring explicit consent. The EU AI Act classifies clinical AI as "high-risk," mandating transparency about data usage.

Consent visibility means making consent status transparent, actionable, and auditable within the user interface.

### 6.2 Consent Indicator Per Data Source

Every data source should display its consent status individually.

#### Consent Indicator Pattern

```
+--------------------------------------------------+
|  Data Sources for AI Analysis                     |
|  Patient: John Doe (MRN: 12345678)                |
|                                                   |
|  ┌─ EHR Data ──────────────────────────────────┐ │
|  │ Status: ✅ Consented                         │ │
|  │ Date: Jan 10, 2025                           │ │
|  │ Type: Broad consent for clinical AI          │ │
|  │ Expires: Jan 10, 2028                        │ │
|  │ [View consent form]                          │ │
|  └───────────────────────────────────────────────┘ │
|                                                   |
|  ┌─ Genetic Data ───────────────────────────────┐ │
|  │ Status: ⚠️ Consent required                  │ │
|  │ This data source is blocked until consent    │ │
|  │ is obtained.                                 │ │
|  │ [Request consent] [View requirements]        │ │
|  └───────────────────────────────────────────────┘ │
|                                                   |
|  ┌─ Wearable Device Data ───────────────────────┐ │
|  │ Status: ❌ Consent declined                  │ │
|  │ Date: Jan 12, 2025                           │ │
|  │ This data source is excluded from analysis.  │ │
|  │ [Request re-consent] [View details]          │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 6.3 Green/Amber/Red Consent Status

Standardized color coding for consent states provides immediate visual comprehension.

#### Consent Status Color System

| Status | Color | Icon | Meaning | Data Available? |
|---|---|---|---|---|
| **Consented** | Green (#28A745) | Checkmark | Valid consent on file | Yes — full access |
| **Partial** | Light Green | Checkmark with minus | Consented with restrictions | Yes — limited access |
| **Pending** | Amber (#FFC107) | Clock | Consent requested, awaiting response | No — blocked |
| **Required** | Orange (#FD7E14) | Exclamation | Consent needed before use | No — blocked |
| **Declined** | Red (#DC3545) | X mark | Patient declined consent | No — excluded |
| **Expired** | Gray (#6C757D) | Clock with X | Previous consent has expired | No — renewal needed |
| **Withdrawn** | Dark Red (#721C24) | X with circle | Consent was given then withdrawn | No — permanently excluded |
| **Not Applicable** | Blue (#007BFF) | Minus | Consent not required for this use | Yes — no consent needed |

### 6.4 "Consent Required" Blocking UI

When consent is required but not obtained, the UI must clearly block access while providing a path to resolution.

#### Consent Block Pattern

```
┌──────────────────────────────────────────────────────┐
│                                                       │
│  🔒 CONSENT REQUIRED                                  │
│                                                       │
│  AI analysis cannot include genetic data for this     │
│  patient because consent has not been obtained.       │
│                                                       │
│  ┌─ Required Actions ─────────────────────────────┐  │
│  │                                                │  │
│  │  1. Request consent from patient or guardian   │  │
│  │     [Generate consent form]                    │  │
│  │                                                │  │
│  │  2. Upload signed consent form                 │  │
│  │     [Upload document]                          │  │
│  │                                                │  │
│  │  3. Verify consent (requires witness)          │  │
│  │     [Mark as verified]                         │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  Without this consent, genetic data will be excluded  │
│  from all AI analyses. Clinical care is unaffected.   │
│                                                       │
│  [Proceed without genetic data]                       │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 6.5 Consent History Timeline

Consent is not a one-time event. Patients may grant, modify, or withdraw consent over time. A complete history must be maintained.

#### Consent Timeline Pattern

```
+--------------------------------------------------+
|  Consent History                                  |
|  Patient: John Doe (MRN: 12345678)                |
|                                                   |
|  ┌─ EHR Clinical AI Consent ────────────────────┐ │
|  │                                             │ │
|  │  Jan 10, 2025  10:30                        │ │
|  │  ✅ Consent granted (broad)                 │ │
|  │  By: Patient (in-person)                    │ │
|  │  Witness: Dr. Michael Chen                  │ │
|  │  Document ID: CON-2025-001247               │ │
|  │                                             │ │
|  │  [Current — Valid until Jan 10, 2028]       │ │
|  │                                             │ │
|  ├─────────────────────────────────────────────┤ │
|  │                                             │ │
|  │  Jan 8, 2025  14:15                         │ │
|  │  📝 Consent form generated                  │ │
|  │  By: System (auto-generated)                │ │
|  │  Type: Broad clinical AI consent            │ │
|  │                                             │ │
|  ├─────────────────────────────────────────────┤ │
|  │                                             │ │
|  │  Jan 5, 2025  09:00                         │ │
|  │  🔵 Patient admitted — consent assessment   │ │
|  │  triggered                                  │ │
|  │                                             │ │
|  └─────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 6.6 Re-Consent Prompts

Consent expires, and patients must be periodically re-consented. The system should proactively prompt for re-consent.

#### Re-Consent Prompt Pattern

```
┌──────────────────────────────────────────────────────┐
│  ⏰ CONSENT EXPIRING SOON                            │
│                                                       │
│  Clinical AI consent for patient John Doe expires     │
│  in 30 days (February 14, 2025).                      │
│                                                       │
│  Current consent:                                     │
│  • Type: Broad clinical AI consent                    │
│  • Granted: January 15, 2024                          │
│  • Expires: February 14, 2025                         │
│  • Status: Active (expiring soon)                     │
│                                                       │
│  ┌─ Options ──────────────────────────────────────┐  │
│  │                                                │  │
│  │  [Renew consent — same terms]                  │  │
│  │  [Modify consent — change scope]               │  │
│  │  [Let expire — no AI analysis after expiry]    │  │
│  │  [Remind me in 7 days]                         │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  If consent expires, AI-assisted features will be     │
│  disabled for this patient. Clinical care continues   │
│  unaffected.                                          │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### 6.7 Granular Consent Breakdown

Modern consent systems allow patients to consent to specific uses of their data rather than blanket consent.

#### Granular Consent Pattern

```
+--------------------------------------------------+
|  Granular Consent Settings                        |
|  Patient: John Doe (MRN: 12345678)                |
|                                                   |
|  ┌─ Data Use Permissions ──────────────────────┐ │
|  │                                             │ │
|  │  Clinical Care & Treatment                  │ │
|  │  [✓] Allow AI-assisted diagnosis support    │ │
|  │  [✓] Allow AI-assisted treatment planning   │ │
|  │  [✓] Allow AI risk prediction               │ │
|  │                                             │ │
|  │  Research & Quality Improvement             │ │
|  │  [✓] Allow use in quality metrics           │ │
|  │  [ ] Allow use in clinical research         │ │
|  │  [✓] Allow use in AI model improvement      │ │
|  │                                             │ │
|  │  Data Sharing                               │ │
|  │  [✓] Allow sharing within institution       │ │
|  │  [ ] Allow sharing with external researchers │ │
|  │  [ ] Allow sharing with commercial partners │ │
|  │                                             │ │
|  │  [Save Changes] [Reset to Defaults]         │ │
|  │                                             │ │
|  └─────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

---

## 7. Warning Systems

### 7.1 Introduction: The Challenge of Clinical Alerts

Clinical warning systems face a fundamental tension: they must be visible enough to prevent harm, but not so intrusive that they cause alert fatigue. A seminal study by van der Sijs et al. (2006) found that clinicians override 49-96% of clinical decision support alerts, with override rates increasing with alert frequency.

Effective warning systems follow the "boy who cried wolf" principle: if everything is an emergency, nothing is. Severity levels must be carefully calibrated to ensure that critical alerts receive immediate attention while lower-priority alerts provide useful context without overwhelming the clinician.

### 7.2 Severity Level Definitions

#### Critical (Red) — Immediate Action Needed

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔴 CRITICAL ALERT — IMMEDIATE ACTION REQUIRED                       │
│                                                                      │
│  SEVERE DRUG INTERACTION DETECTED                                    │
│                                                                      │
│  Warfarin + Amiodarone: Significant INR elevation risk               │
│  Patient current INR: 3.8 (therapeutic range: 2.0-3.0)               │
│                                                                      │
│  ┌─ Required Action ──────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  [ ] Hold next warfarin dose                                   │ │
│  │  [ ] Order STAT INR                                            │ │
│  │  [ ] Notify prescriber                                         │ │
│  │  [ ] Document override reason (if applicable)                  │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  This alert CANNOT be dismissed without action or documented reason. │
│                                                                      │
│  [Acknowledge All]          [Override with Reason]                   │
│                                                                      │
│  Alert ID: CRT-2025-0115-143022    Triggered: 14:30:22              │
│  Protocol: DrugInteraction-Severe-v2.1                               │
└─────────────────────────────────────────────────────────────────────┘
```

**Critical Alert Characteristics:**
- **Color:** Red (#DC3545) with pulsing animation
- **Icon:** Emergency symbol (circle with exclamation)
- **Persistence:** Cannot be dismissed without action or documented override
- **Sound:** Optional auditory alert (configurable)
- **Notification:** Pushed to mobile/pager if enabled
- **Escalation:** Auto-escalates to supervisor if not acknowledged within 5 minutes
- **Frequency:** Use sparingly — should represent <5% of all alerts

#### High (Orange) — Clinician Review Needed Soon

```
┌─────────────────────────────────────────────────────────────────────┐
│  🟠 HIGH PRIORITY — Review Needed Within 1 Hour                     │
│                                                                      │
│  ABNORMAL LAB RESULT: Potassium 6.2 mEq/L                          │
│                                                                      │
│  Patient: John Doe (MRN: 12345678)                                   │
│  Previous K+: 4.1 mEq/L (Jan 14)                                    │
│  Trend: ↑ Significant increase                                      │
│                                                                      │
│  Recommended actions:                                                │
│  • Verify result (possible hemolysis)                               │
│  • Consider ECG if confirmed                                        │
│  • Review medications                                               │
│                                                                      │
│  [Acknowledge]  [View Full Result]  [Order Repeat Lab]              │
│                                                                      │
│  Acknowledgment required. Alert will re-appear in 1 hour if not    │
│  addressed.                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

**High Alert Characteristics:**
- **Color:** Orange (#FD7E14) with subtle border animation
- **Icon:** Triangle with exclamation mark
- **Persistence:** Dismissible with acknowledgment; re-appears after 1 hour
- **Sound:** Optional soft alert tone
- **Notification:** In-app notification; optional email
- **Escalation:** Escalates to supervisor after 2 hours unacknowledged
- **Frequency:** Should represent 10-15% of all alerts

#### Medium (Amber) — Monitor, Review at Next Visit

```
┌─────────────────────────────────────────────────────────────────────┐
│  🟡 MONITOR — Review at Next Encounter                              │
│                                                                      │
│  Medication Adherence Alert                                          │
│                                                                      │
│  Patient has not picked up prescribed Metformin in 21 days.         │
│                                                                      │
│  Prescription: Metformin 500mg BID (prescribed Jan 1, 2025)         │
│  Last pickup: December 25, 2024                                     │
│                                                                      │
│  Suggested: Discuss adherence at next visit.                        │
│                                                                      │
│  [Acknowledge]  [View Medication History]  [Send Reminder]          │
└─────────────────────────────────────────────────────────────────────┘
```

**Medium Alert Characteristics:**
- **Color:** Amber/Yellow (#FFC107) with static display
- **Icon:** Circle with information symbol
- **Persistence:** Dismissible; appears in summary panel
- **Sound:** None
- **Notification:** Summary-level, not immediate
- **Escalation:** None
- **Frequency:** Should represent 25-30% of all alerts

#### Low (Yellow) — Informational, No Action Needed

```
┌─────────────────────────────────────────────────────────────────────┐
│  🟡 INFORMATIONAL                                                   │
│                                                                      │
│  Vaccination Reminder                                               │
│                                                                      │
│  Patient due for annual influenza vaccination.                      │
│                                                                      │
│  Last flu vaccine: October 15, 2024                                 │
│                                                                      │
│  [Acknowledge]  [Order Vaccine]  [Remind Me Later]                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Low Alert Characteristics:**
- **Color:** Light yellow (#FFF3CD) with subtle border
- **Icon:** Info circle
- **Persistence:** Dismissible; logged but not re-displayed
- **Sound:** None
- **Notification:** Appears in information panel only
- **Escalation:** None
- **Frequency:** Should represent 30-40% of all alerts

#### Info (Blue) — Contextual Information

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔵 CONTEXTUAL INFORMATION                                          │
│                                                                      │
│  Clinical Note                                                      │
│                                                                      │
│  This patient's insurance plan has a prior authorization            │
│  requirement for the medication you are prescribing.                │
│                                                                      │
│  Medication: Ozempic (semaglutide)                                  │
│  Prior auth required: Yes                                           │
│  Typical approval time: 2-3 business days                           │
│                                                                      │
│  [View Requirements]  [Start Prior Auth]  [Dismiss]                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Info Alert Characteristics:**
- **Color:** Blue (#007BFF) with minimal styling
- **Icon:** Info letter 'i'
- **Persistence:** Dismissible; non-intrusive
- **Sound:** None
- **Notification:** None (contextual only)
- **Escalation:** None
- **Frequency:** As needed for context

### 7.3 Visual Patterns Summary

#### Severity Level Visual Reference

| Level | Color Code | Background | Border | Icon | Animation |
|---|---|---|---|---|---|
| Critical | #DC3545 | #F8D7DA | 2px solid #DC3545 | Circle-exclamation | Pulsing glow, 1s cycle |
| High | #FD7E14 | #FFE5CC | 2px solid #FD7E14 | Triangle-exclamation | Subtle border pulse |
| Medium | #FFC107 | #FFF3CD | 1px solid #FFC107 | Circle-info | Static |
| Low | #FFF3CD | #FFFBE6 | 1px solid #FFEAA7 | Info-circle | Static |
| Info | #007BFF | #E7F3FF | 1px solid #B8DAFF | Info-letter | Static |

#### Color Blindness Considerations

Approximately 8% of males and 0.5% of females have some form of color blindness. Warning systems must not rely on color alone:

- **Always pair color with icon** — each severity level has a distinct icon shape
- **Use text labels** — "CRITICAL", "HIGH", etc. are always visible
- **Vary border thickness** — Critical has 2px borders, others have 1px
- **Use hatching/patterns** for additional differentiation
- **Test with simulation tools** (e.g., Stark, Color Oracle) during development

### 7.4 Dismissible vs. Persistent

#### Dismissibility Matrix

| Severity | Dismissible Without Action | Requires Acknowledgment | Re-appears | Override Requires Reason |
|---|---|---|---|---|
| Critical | Never | Yes | Every 5 min until resolved | Yes |
| High | No | Yes | After 1 hour if unaddressed | Yes |
| Medium | Yes | Yes | In summary panel only | No |
| Low | Yes | Optional | No | No |
| Info | Yes | No | No | No |

### 7.5 Acknowledgment Required Patterns

For alerts requiring acknowledgment, the system must log who acknowledged, when, and what action was taken.

#### Acknowledgment Log Pattern

```
Alert: Severe Drug Interaction (ID: CRT-2025-0115-143022)

Acknowledgment Log:
┌────────────────────────────────────────────────────────┐
│ Time      User         Action          Reason         │
├────────────────────────────────────────────────────────┤
│ 14:35   Dr. Chen      Acknowledged     Reviewed and  │
│                                    held warfarin      │
│                                                       │
│ 14:40   PharmD Lee    Verified         Confirmed      │
│                                    interaction valid  │
└────────────────────────────────────────────────────────┘
```

### 7.6 Alert Fatigue Mitigation

Alert fatigue is one of the most significant challenges in clinical decision support. Mitigation strategies include:

1. **Tiered alerting**: Only critical and high alerts interrupt workflow
2. **Smart suppression**: Suppress alerts that have been overridden for the same patient within 24 hours
3. **Dose-range checking**: Only alert when dose exceeds established safe ranges, not for any non-standard dose
4. **Indication-based filtering**: Don't alert for known/intentional off-label use if documented
5. **Override reason tracking**: Track override reasons to identify alerts that are frequently inappropriately triggered
6. **Alert analytics dashboard**: Monitor override rates by alert type; deprecate alerts with >90% override rates
7. **User-configurable thresholds**: Allow experienced clinicians to adjust alert sensitivity within safe bounds
8. **Contextual awareness**: Don't alert for interactions that have been stable for months

---

## 8. "Requires Review" Patterns

### 8.1 Introduction: Making Review Workload Visible

Clinical AI systems generate outputs that require human review. Making this workload visible helps clinicians prioritize, supervisors allocate resources, and administrators monitor system performance.

### 8.2 Badge on Navigation Items

Navigation badges communicate the volume of pending reviews at a glance.

#### Navigation Badge Pattern

```
+--------------------------------------------------+
|  NAVIGATION                                       |
|                                                   |
|  [🏠 Dashboard]                                   |
|  [👥 Patients]              [12]  ← pending reviews│
|  [📋 AI Insights]           [5]   ← new analyses  │
|  [📝 Reports]               [3]   ← drafts to review│
|  [⚠ Alerts]                [2]   ← unacknowledged │
|  [📊 Analytics]                                   |
|  [⚙ Settings]                                     |
|                                                   |
|  [🔍 Audit]               [1]   ← anomaly flagged │
+--------------------------------------------------+
```

**Badge Design Specifications:**
- Use red badges for critical/high priority items
- Use orange badges for medium priority
- Use gray badges for informational counts
- Badge number should reflect the count of items needing action
- Badge should update in real-time (WebSocket or polling)
- Badge should disappear when count reaches zero
- Maximum displayed: "99+" for counts over 99

### 8.3 Dot Indicators

Dot indicators provide a subtle visual cue that something requires attention without the cognitive load of numbers.

#### Dot Indicator Pattern

```
+--------------------------------------------------+
|  Patient Record: John Doe                         |
|                                                   |
|  Tabs:                                            |
|  [Overview]  [Labs ●]  [Imaging]  [AI Insights ●]│
|                      ^              ^              │
|                      New results   AI findings     │
|                      available     need review     │
|                                                   |
|  [Medications]  [Notes ●]  [Orders]               |
|                 ^                                  │
|                 New note requires co-signature     │
+--------------------------------------------------+
```

**Dot Color Meanings:**
- **Red dot**: Critical item requiring immediate attention
- **Orange dot**: Item requiring review within the shift
- **Blue dot**: New content available (informational)
- **Green dot**: Item has been updated since last view

### 8.4 Counter Badges

Counter badges show specific numbers of pending items.

#### Counter Badge Variations

```
+--------------------------------------------------+
|  AI-Generated Content                             |
|                                                   |
|  ┌─ Review Queue ──────────────────────────────┐ │
|  │                                             │ │
│  │  Draft Reports        [Pending: 3]  [Urgent: 1]│ │
|  │  Risk Predictions     [Pending: 7]            │ │
|  │  Alert Overrrides     [Pending: 2]  [Overdue: 1]│ │
|  │  Protocol Suggestions [Pending: 5]            │ │
|  │                                             │ │
|  │  Total pending review: 17                   │ │
|  │  [Go to Review Queue]                       │ │
|  └─────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 8.5 Highlighted List Items

Items requiring review should be visually distinguished in lists.

#### Highlighted List Pattern

```
+--------------------------------------------------+
|  AI-Generated Reports — Review Queue              |
|                                                   |
|  ┌─ Requires Immediate Review ─────────────────┐ │
|  │                                             │ │
|  │ 🔴 Report #4821 — Chest X-ray Analysis      │ │
|  │    Patient: Smith, Mary (MRN: 87654321)     │ │
|  │    Generated: Jan 15, 2025 14:30            │ │
|  │    Confidence: 92% — CRITICAL FINDING       │ │
|  │    [Review Now] [Assign to Colleague]       │ │
|  │                                             │ │
|  └─────────────────────────────────────────────┘ │
|                                                   |
|  ┌─ Pending Review ────────────────────────────┐ │
|  │                                             │ │
|  │ 🟡 Report #4819 — Discharge Summary Draft   │ │
|  │    Patient: Johnson, Tom (MRN: 56789012)    │ │
|  │    Generated: Jan 15, 2025 13:15            │ │
|  │    Waiting for: Attending review            │ │
|  │    [Review Now] [Remind in 1 hour]          │ │
|  │                                             │ │
|  │ 🟡 Report #4818 — Risk Assessment           │ │
|  │    Patient: Williams, Sue (MRN: 34567890)   │ │
|  │    Generated: Jan 15, 2025 12:45            │ │
|  │    [Review Now] [Mark as Reviewed]          │ │
|  │                                             │ │
|  └─────────────────────────────────────────────┘ │
|                                                   |
|  ┌─ Reviewed ──────────────────────────────────┐ │
|  │                                             │ │
|  │ ✓ Report #4817 — Care Plan (Reviewed by     │ │
|  │   Dr. Chen, Jan 15 2025 14:00)              │ │
|  │   [View Details]                            │ │
|  │                                             │ │
|  └─────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 8.6 Priority Sorting

Items in review queues should be sorted by priority, not just chronologically.

#### Priority Sorting Algorithm

```
Priority Score = (Severity Weight x Time Factor) / Reviewer Availability

Where:
- Severity Weight: Critical=100, High=50, Medium=25, Low=10, Info=1
- Time Factor: Increases as time since generation increases
- Reviewer Availability: Decreases priority if assigned reviewer is unavailable

Default sort: Priority Score (descending)
Alternative sorts: Time (oldest first), Patient (alphabetical), Type
```

### 8.7 Filter by Review Status

Clinicians must be able to filter content by review status.

#### Filter Pattern

```
+--------------------------------------------------+
|  AI Insights Filter                               |
|                                                   |
|  Status: [All ▼]  Type: [All ▼]  Priority: [All ▼]│
|                                                   |
|  Status options:                                  |
|  • All (default)                                  │
|  • Pending review                                 │
|  • Under review (assigned)                        │
|  • Reviewed — approved                            │
|  • Reviewed — modified                            │
|  • Reviewed — rejected                            │
|  • Overdue (past SLA)                             │
|  • Escalated                                      │
|                                                   |
|  Type options:                                    │
|  • All                                            │
|  • Diagnosis support                              │
|  • Risk prediction                                │
|  • Treatment recommendation                       │
|  • Documentation draft                            │
|  • Alert override                                 │
|                                                   |
|  Priority options:                                │
|  • All                                            │
|  • Critical                                       │
|  • High                                           │
|  • Medium                                         │
|  • Low                                            │
+--------------------------------------------------+
```

### 8.8 Review SLA Indicators

Service Level Agreements (SLAs) define how quickly different types of AI outputs must be reviewed.

#### SLA Indicator Pattern

```
+--------------------------------------------------+
|  Review SLA Status                                |
|                                                   |
|  ┌─ Within SLA ────────────────────────────────┐ │
|  │ ✅ Risk Assessment — 12 min remaining        │ │
|  │    (SLA: 1 hour)                             │ │
|  └───────────────────────────────────────────────┘ │
|                                                   |
|  ┌─ Approaching SLA ───────────────────────────┐ │
|  │ ⚠️ Discharge Summary — 8 min remaining       │ │
|  │    (SLA: 2 hours)                            │ │
|  └───────────────────────────────────────────────┘ │
|                                                   |
|  ┌─ SLA Breached ──────────────────────────────┐ │
|  │ 🔴 Chest X-ray Analysis — 23 min overdue     │ │
|  │    (SLA: 30 minutes, elapsed: 53 min)        │ │
|  │    Escalated to: Dr. Williams (Radiology)    │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

#### Default SLA Guidelines

| Content Type | Critical | High | Medium | Low |
|---|---|---|---|---|
| Imaging findings | 30 min | 2 hours | 4 hours | 24 hours |
| Risk predictions | 1 hour | 4 hours | 24 hours | 48 hours |
| Treatment recommendations | 1 hour | 2 hours | 8 hours | 24 hours |
| Documentation drafts | 4 hours | 8 hours | 24 hours | 72 hours |
| Alert overrides | Immediate | 30 min | 2 hours | 4 hours |

---

## 9. Safe Wording Templates

### 9.1 Introduction: Language as a Safety Tool

The language used in clinical AI interfaces is not merely a matter of style — it is a safety-critical design element. Words create mental models. When an AI system says "The diagnosis is pneumonia," it implies certainty and authority that may not be warranted. When it says "AI-assisted analysis suggests findings consistent with pneumonia," it appropriately frames the output as a suggestion requiring clinical validation.

### 9.2 Analysis Results Wording

#### Template: AI-Assisted Analysis Findings

```
+--------------------------------------------------+
|  AI-Assisted Analysis                             |
|                                                   |
|  ┌─ Chest X-ray Analysis ──────────────────────┐ │
|  │                                             │ │
|  │  AI-assisted analysis identified the        │ │
|  │  following findings for clinical review:    │ │
|  │                                             │ │
|  │  1. Opacity in the right lower lobe         │ │
|  │     (confidence: 87%)                       │ │
|  │     Suggested correlation: Possible          │ │
|  │     pneumonia — requires clinical            │ │
|  │     correlation with symptoms and labs       │ │
|  │                                             │ │
|  │  2. Mild cardiomegaly                       │ │
|  │     (confidence: 72%)                       │ │
|  │     Note: Comparison with prior imaging      │ │
|  │     recommended if available                 │ │
|  │                                             │ │
|  │  This analysis is intended to assist, not   │ │
|  │  replace, radiologist interpretation.       │ │
|  │                                             │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

**Key Principles for Analysis Results:**
- Always use "AI-assisted" or "AI-generated" as a prefix
- Use "suggests," "indicates," or "identified" — never "diagnoses" or "confirms"
- Include confidence levels for each finding
- Explicitly state that clinical correlation is required
- Never present AI findings as definitive conclusions

### 9.3 Hypotheses Wording

#### Template: Exploratory Correlation Detected

```
+--------------------------------------------------+
|  Exploratory Analysis                             |
|                                                   |
|  ┌─ AI-Detected Pattern ───────────────────────┐ │
|  │                                             │ │
|  │  ⚠️ Exploratory correlation detected        │ │
|  │                                             │ │
|  │  The AI system has identified a statistical │ │
|  │  association that may be clinically         │ │
|  │  relevant but requires further              │ │
|  │  investigation:                             │ │
|  │                                             │ │
|  │  Observation: Patients with [Condition A]   │ │
|  │  and [Biomarker X > threshold] in this      │ │
|  │  cohort showed a 23% higher rate of         │ │
|  │  [Outcome Y].                               │ │
|  │                                             │ │
|  │  Important: This is a hypothesis-generating │ │
|  │  finding, not an established clinical       │ │
|  │  association. It should not be used to      │ │
|  │  guide patient care without validation      │ │
|  │  through appropriate research methods.      │ │
|  │                                             │ │
|  │  Evidence grade: D (Very Low)               │ │
|  │  Sample size: 47 patients                   │ │
|  │  Confidence: 34%                            │ │
|  │                                             │ │
|  │  [View Statistical Analysis]                │ │
|  │  [Flag for Research Team]                   │ │
|  │  [Dismiss — Not Clinically Relevant]        │ │
|  │                                             │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

**Key Principles for Hypotheses:**
- Use "exploratory," "hypothesis-generating," or "preliminary"
- Include the word "correlation" — never imply causation
- Clearly state that the finding should not guide patient care
- Provide evidence grade and sample size prominently
- Offer a path to research validation
- Provide an explicit "dismiss" option for irrelevant findings

### 9.4 Reports Wording

#### Template: Draft Report — Clinician Review Required

```
+--------------------------------------------------+
|  📄 DRAFT REPORT — CLINICIAN REVIEW REQUIRED      │
|                                                   │
|  This is an AI-generated draft that requires      │
|  clinical review, editing, and signature before   │
|  it becomes part of the official medical record.  │
|                                                   │
|  ┌─ Draft Discharge Summary ───────────────────┐ │
|  │                                             │ │
|  │  [AI-generated content...]                  │ │
|  │                                             │ │
|  │  ---                                        │ │
|  │                                             │ │
|  │  AI-generated sections are highlighted in   │ │
|  │  yellow. Please review each section and     │ │
|  │  either confirm, edit, or delete.           │ │
|  │                                             │ │
|  │  Sections requiring special attention:      │ │
|  │  • Medication reconciliation (3 changes)    │ │
|  │  • Follow-up appointments (verify dates)    │ │
|  │  • Patient instructions (verify clarity)    │ │
|  │                                             │ │
|  │  [Edit Report] [Accept as Draft] [Discard]  │ │
|  │                                             │ │
|  │  □ I have reviewed this draft and confirm   │ │
|  │    it accurately reflects the patient's     │ │
|  │    clinical course. (Required before        │ │
|  │    signature)                               │ │
|  │                                             │ │
|  │  [Sign and Finalize]                        │ │
|  │                                             │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 9.5 Protocols Wording

#### Template: Suggested Protocol Parameters — Verify Before Use

```
+--------------------------------------------------+
|  Suggested Protocol Parameters                    |
|                                                   |
|  ┌─ Sepsis Bundle Protocol ────────────────────┐ │
|  │                                             │ │
|  │  ⚠️ VERIFY BEFORE USE                       │ │
|  │                                             │ │
|  │  The AI system suggests the following       │ │
|  │  protocol parameters based on current       │ │
|  │  patient data. These are suggestions only   │ │
|  │  and must be verified by a qualified        │ │
|  │  clinician before implementation:           │ │
|  │                                             │ │
|  │  ┌─ Suggested Parameters ─────────────────┐ │ │
|  │  │                                        │ │ │
|  │  │ Blood cultures: Within 1 hour          │ │ │
|  │  │ Lactate: STAT                          │ │ │
|  │  │ Antibiotics: Broad-spectrum within 1 hr│ │ │
|  │  │ IV fluids: 30ml/kg crystalloid         │ │ │
|  │  │ Vasopressors: If MAP <65 after fluids  │ │ │
|  │  │                                        │ │ │
|  │  │ Source: Surviving Sepsis Campaign 2021 │ │ │
|  │  │ AI match confidence: 94%               │ │ │
|  │  │                                        │ │ │
|  │  └────────────────────────────────────────┘ │ │
|  │                                             │ │
|  │  [Accept Suggestion] [Modify Parameters]    │ │
|  │  [View Full Protocol] [Override]            │ │
|  │                                             │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 9.6 Alerts Wording

#### Template: Flag for Clinician Attention — Not an Emergency Diagnosis

```
+--------------------------------------------------+
|  Flag for Clinician Attention                     |
|                                                   |
|  ┌─ AI Alert ──────────────────────────────────┐ │
|  │                                             │ │
|  │  🟡 This is a flag for clinician attention, │ │
|  │  not an emergency diagnosis or urgent       │ │
|  │  notification.                              │ │
|  │                                             │ │
|  │  Alert: Potential medication interaction    │ │
|  │                                             │ │
|  │  Current medication: Warfarin 5mg daily     │ │
|  │  New medication: Metronidazole 500mg TID    │ │
|  │                                             │ │
|  │  AI-assessed risk: Moderate                 │ │
|  │  Evidence: Drug interaction database        │ │
|  │  Recommended action: Monitor INR in 3-5     │ │
|  │  days; consider temporary warfarin dose     │ │
|  │  adjustment if clinically appropriate.      │ │
|  │                                             │ │
|  │  This alert does not replace clinical       │ │
|  │  judgment or pharmacist consultation.       │ │
|  │                                             │ │
|  │  [Acknowledge] [View Details] [Consult      │ │
|  │  Pharmacy]                                  │ │
|  │                                             │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 9.7 Safe Wording Quick Reference

| Context | Never Say | Always Say |
|---|---|---|
| Diagnosis | "The diagnosis is..." | "AI-assisted analysis suggests findings consistent with..." |
| Risk | "The patient will..." | "AI risk model estimates a X% probability of..." |
| Treatment | "The treatment should be..." | "AI-assisted analysis suggests considering..." |
| Prognosis | "The patient will recover in..." | "Based on similar cases, typical recovery time is..." |
| Drug dosing | "The dose should be X mg" | "Suggested starting dose is X mg — verify per protocol" |
| Imaging | "The scan shows..." | "AI-detected findings include... radiologist review required" |
| Labs | "The result indicates..." | "AI interpretation suggests possible significance of..." |
| Urgency | "This is an emergency" | "This finding requires prompt clinical review" |
| Correlation | "This causes..." | "This is associated with..." / "A correlation was detected..." |
| Certainty | "100% certain" / "Definitely" | "High confidence" / "Based on available evidence" |

### 9.8 Prohibited Language in Clinical AI

The following language patterns should be strictly prohibited in clinical AI outputs:

| Prohibited Pattern | Reason | Replacement |
|---|---|---|
| "The AI diagnoses..." | AI cannot diagnose; only clinicians can | "AI-assisted analysis identifies findings for review" |
| "You should..." (directive to clinician) | Undermines clinical autonomy | "Consider..." / "The AI suggests reviewing..." |
| "100% certain" / "Definite" | No clinical prediction is 100% certain | "High confidence" with percentage |
| "Ignore this if..." | Encourages dismissal of safety alerts | "Override available with documented reason" |
| "Standard treatment is..." | May not apply to this patient | "Common approach includes... verify applicability" |
| "No risk detected" | False reassurance; implies certainty | "No elevated risk factors identified by this analysis" |
| "Replace [current treatment] with..." | Prescriptive without context | "Alternative to consider:... verify against current plan" |

---

## 10. Error State Handling

### 10.1 Introduction: The Ethics of Error Disclosure

When clinical AI systems fail, the response must be immediate, transparent, and honest. A failed analysis is not a blank space — it is a potential patient safety event. The clinician must know that the AI has failed, why it has failed, and what the implications are for patient care.

The golden rule of error handling: **Never synthesize, fabricate, or approximate results to cover a failure.** A missing result is safer than a fabricated one.

### 10.2 "Analysis Failed — [Reason]"

#### Specific Failure Communication

```
┌─────────────────────────────────────────────────────────────────────┐
│  ❌ ANALYSIS FAILED                                                  │
│                                                                      │
│  The AI analysis could not be completed.                             │
│                                                                      │
│  ┌─ Failure Details ──────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Analysis type: Sepsis risk prediction                          │ │
│  │  Status: FAILED                                                 │ │
│  │                                                                 │ │
│  │  Reason: Model inference timeout                                │ │
│  │  Details: The prediction model did not return a result within   │ │
│  │  the expected time limit (30 seconds).                          │ │
│  │                                                                 │ │
│  │  Impact on patient care:                                        │ │
│  │  • No AI-generated sepsis risk score is available               │ │
│  │  • Clinical sepsis screening protocols should still be followed │ │
│  │  • This failure does not affect other AI features               │ │
│  │                                                                 │ │
│  │  Technical reference: Error ID ERR-2025-0115-143045             │ │
│  │  [Copy error ID for support]                                    │ │
│  │                                                                 │ │
│  │  [Retry Analysis]  [Report Issue]  [Contact Support]            │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  This failure has been automatically logged and the AI engineering   │
│  team has been notified.                                             │
└─────────────────────────────────────────────────────────────────────┘
```

#### Common Failure Reasons

| Failure Type | Reason Displayed | Patient Impact Statement | Recommended Action |
|---|---|---|---|
| Model timeout | "Analysis took longer than expected" | "No AI result available; follow standard protocols" | Retry |
| Model error | "Internal processing error" | "No AI result available; this is a system issue, not a clinical one" | Report + retry |
| Invalid input | "Patient data did not meet analysis requirements" | "Cannot analyze with current data; verify data completeness" | Check inputs |
| Data quality | "Data quality insufficient for reliable analysis" | "Results would be unreliable; review flagged data issues" | Review data |
| Service unavailable | "Analysis service temporarily unavailable" | "AI features are offline; all clinical systems unaffected" | Try later |
| Version mismatch | "Model version incompatible with current data format" | "AI analysis blocked until system update completes" | Contact support |
| Rate limit | "Analysis limit reached for this time period" | "AI analysis delayed; will automatically retry" | Wait |
| Security block | "Analysis blocked by security policy" | "Access or processing restricted; contact administrator" | Contact admin |

### 10.3 "Insufficient Data for [Analysis]"

#### Insufficient Data Communication

```
┌─────────────────────────────────────────────────────────────────────┐
│  📊 INSUFFICIENT DATA FOR ANALYSIS                                   │
│                                                                      │
│  Analysis type: Readmission risk prediction                          │
│                                                                      │
│  ┌─ Data Requirements ────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Required data elements:           Available:                   │ │
│  │                                                                 │ │
│  │  [✓] Age                          Yes — 67 years               │ │
│  │  [✓] Primary diagnosis            Yes — Heart failure          │ │
│  │  [✓] Length of stay               Yes — 5 days                │ │
│  │  [✗] Discharge medications        No — not documented         │ │
│  │  [✗] Social support assessment    No — not completed          │ │
│  │  [✓] Prior admissions             Yes — 2 in past year        │ │
│  │  [✗] Follow-up appointment status No — not scheduled          │ │
│  │                                                                 │ │
│  │  4 of 7 required elements are missing.                          │ │
│  │  Analysis requires at least 5 of 7 elements.                    │ │
│  │                                                                 │ │
│  │  [Complete Missing Data]  [Run Partial Analysis]                │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.4 "Service Temporarily Unavailable"

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔧 SERVICE TEMPORARILY UNAVAILABLE                                  │
│                                                                      │
│  AI-assisted features are currently offline for maintenance.         │
│                                                                      │
│  ┌─ Service Status ───────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Service               Status       ETA                         │ │
│  │  ─────────────────────────────────────────────                  │ │
│  │  Risk prediction       🔴 Offline   ~30 minutes                 │ │
│  │  Diagnosis support     🟡 Degraded  Intermittent                │ │
│  │  Documentation         🟢 Online    —                           │ │
│  │  Drug interaction      🟢 Online    —                           │ │
│  │                                                                 │ │
│  │  [Refresh Status]  [View System Status Page]                    │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Clinical workflows continue normally. All EHR functions are         │
│  fully operational. AI-assisted features will resume automatically.  │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.5 "Results May Be Incomplete"

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⚠️ PARTIAL RESULTS — SOME ANALYSES COULD NOT COMPLETE             │
│                                                                      │
│  The analysis completed partially. Some components are available;    │
│  others encountered errors.                                          │
│                                                                      │
│  ┌─ Result Status ────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Component            Status    Result                          │ │
│  │  ───────────────────────────────────────────                    │ │
│  │  Risk assessment      ✅ Complete  Moderate risk (62%)          │ │
│  │  Drug interactions    ✅ Complete  No significant interactions  │ │
│  │  Comorbidity analysis ⚠️ Partial   3 of 5 comorbidities scored  │ │
│  │  Lab trend analysis   ❌ Failed    Timeout — retry available    │ │
│  │  Discharge readiness  ✅ Complete  Not ready — needs PT eval    │ │
│  │                                                                 │ │
│  │  [Retry Failed Components]  [View Available Results]            │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.6 "Please Try Again Later"

```
┌─────────────────────────────────────────────────────────────────────┐
│  ⏳ ANALYSIS QUEUED                                                  │
│                                                                      │
│  Your analysis request has been queued due to high system load.      │
│                                                                      │
│  ┌─ Queue Status ─────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  Your position in queue: 12 of 34                               │ │
│  │  Estimated wait time: ~8 minutes                                │ │
│  │                                                                 │ │
│  │  [Leave page — notification when ready]                         │ │
│  │  [Wait on this page]                                            │ │
│  │  [Cancel request]                                               │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  You can continue working. You'll be notified when the analysis      │
│  is complete.                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.7 Never Fake/Synthesize Results

#### The Anti-Pattern: Fabricated Results

```
❌ NEVER DO THIS:

+--------------------------------------------------+
|  Analysis Result                                  |
|                                                   |
|  [System error — showing cached estimate]         │
|  Risk score: ~45% (estimated from partial data)   │
|                                                   |
|  Note: This is an approximation.                  │
+--------------------------------------------------+
```

This is dangerous because:
1. The "~" and "estimated" qualifiers are easily missed
2. Clinicians may act on the 45% figure without realizing it's fabricated
3. There is no clear distinction between real and estimated results
4. The system is being dishonest about its capabilities

#### The Correct Pattern: Transparent Failure

```
✅ CORRECT APPROACH:

+--------------------------------------------------+
|  ❌ Analysis Not Available                        |
|                                                   |
|  The risk score analysis could not be completed   |
|  due to a system error.                           |
|                                                   |
|  No risk score is available for this patient.     │
|                                                   |
|  Clinical action: Continue with standard          │
|  risk assessment protocols.                       │
|                                                   |
|  [Retry] [Report Issue]                           │
+--------------------------------------------------+
```

**Fundamental Principle:** When in doubt, show nothing rather than show something unreliable. A missing AI result simply returns the clinician to the pre-AI baseline of clinical judgment. A fabricated result introduces new risks.

### 10.8 Error State Design Checklist

Every error state must include:
- [ ] Clear failure identification (what failed)
- [ ] Specific reason (why it failed)
- [ ] Patient impact statement (what this means for care)
- [ ] Recommended action (what to do next)
- [ ] Retry option (when appropriate)
- [ ] Support contact (for persistent failures)
- [ ] Error reference ID (for support tracking)
- [ ] Automatic logging confirmation
- [ ] **Never** include approximated, synthesized, or cached results presented as current

---

## 11. International Regulatory Patterns

### 11.1 Introduction: The Global Regulatory Landscape

Clinical AI is subject to a complex web of international regulations. This section summarizes the key regulatory frameworks and their implications for UX design.

### 11.2 NHS England AI Safety Guidelines

#### Overview
The NHS England AI Lab has published comprehensive guidance on AI deployment in healthcare, emphasizing transparency, human oversight, and patient safety.

#### Key UX Requirements

| Requirement | UX Implementation |
|---|---|
| Algorithm Impact Assessment | Document AI system capabilities and limitations in the UI |
| Human-in-the-loop | Every AI output must have a clear review workflow |
| Transparency | Show how AI arrived at its conclusion (explainability) |
| Fairness monitoring | Display demographic performance metrics when relevant |
| Safety monitoring | Real-time alert for AI system performance degradation |
| Patient communication | Provide patient-facing explanations of AI involvement |

#### NHS AI Ethics Framework — UX Mapping

```
NHS AI Ethics Principle          UX Implementation
─────────────────────────────────────────────────────────
1. Transparency          →     Provenance display (Section 3)
                               Uncertainty indicators (Section 2)
                               "Why am I seeing this?" tooltips

2. Accountability        →     Audit visibility (Section 5)
                               Attribution patterns (Section 3.4)
                               Version tracking (Section 3.7)

3. Fairness              →     Population-specific confidence indicators
                               Known bias warnings
                               Demographic performance disclosure

4. Safety                →     Warning systems (Section 7)
                               Error handling (Section 10)
                               Limitation callouts (Section 4)

5. Human Oversight       →     "Requires review" patterns (Section 8)
                               Override capabilities
                               Review workflows
```

#### NHS-Required Disclaimers

The NHS mandates specific disclaimer language:
- "This tool uses artificial intelligence to support clinical decision-making"
- "It does not replace clinical judgment"
- "Always verify outputs against patient-specific context"
- "Report any concerns about AI outputs through local governance structures"

### 11.3 FDA AI/ML-Based SaMD Guidance

#### Overview
The FDA's guidance on Software as a Medical Device (SaMD) using AI/ML establishes a risk-based framework for clinical AI systems.

#### Risk Classification System

| SaMD Category | Risk Level | UX Implications |
|---|---|---|
| I (Inform) | Low | Standard uncertainty display, optional review |
| II (Drive) | Moderate | Required review workflow, acknowledgment needed |
| III (Treat/Diagnose) | High | Mandatory human-in-the-loop, override with reason, enhanced audit |
| IV (Critical treatment) | Critical | Lock-step workflow, no autonomous action, real-time monitoring |

#### FDA Predetermined Change Control Plans (PCCP)

The FDA's PCCP framework requires that AI systems document expected changes over time:

```
┌─ FDA Predetermined Change Control Plan ──────────────┐
│                                                     │
│  Model: ClinicalDecision-v3.2.1                     │
│  SaMD Classification: Class II (Drive)              │
│                                                     │
│  ┌─ Approved Modifications ───────────────────────┐ │
│  │                                                 │ │
│  │  ✓ Retraining with new data (quarterly)        │ │
│  │  ✓ Hyperparameter tuning                       │ │
│  │  ✓ Feature engineering improvements            │ │
│  │  ✗ Architecture changes (require new submission)│ │
│  │  ✗ New output types (require new submission)   │ │
│  │                                                 │ │
│  │  [View Full PCCP] [Modification History]       │ │
│  │                                                 │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  Current model version is within approved           │
│  modification scope.                                │
└─────────────────────────────────────────────────────┘
```

#### FDA-Required Transparency Elements

1. **Intended use statement**: Clearly displayed description of what the AI does
2. **Indications for use**: Patient populations and conditions the AI is validated for
3. **Performance metrics**: Sensitivity, specificity, AUC displayed in the UI
4. **Known limitations**: Explicit statement of what the AI cannot do
5. **Update history**: Log of all model changes with dates

### 11.4 EU AI Act Healthcare Provisions

#### Overview
The EU AI Act classifies clinical AI as "high-risk" (Annex III), imposing strict requirements on transparency, human oversight, and accuracy.

#### High-Risk AI System Requirements (Healthcare)

| EU AI Act Requirement | UX Implementation |
|---|---|
| Transparency (Art. 13) | Users must be informed they are interacting with AI |
| Human oversight (Art. 14) | Natural persons must be able to override AI decisions |
| Accuracy (Art. 15) | Performance metrics must be displayed and monitored |
| Robustness (Art. 15) | Error states must be clearly communicated |
| Record-keeping (Art. 12) | Automatic logging of all AI interactions |
| Conformity marking (Art. 48) | CE marking displayed for compliant systems |

#### EU AI Act UX Compliance Checklist

```
□ AI identification: Every AI output clearly labeled as AI-generated
□ Human override: Clear mechanism to override any AI recommendation
□ Explanation: User can access explanation of any AI decision
□ Performance disclosure: Current accuracy metrics visible on request
□ Error communication: All failures communicated transparently
□ Audit trail: Complete log of all AI interactions maintained
□ Data governance: Consent status visible for all data sources
□ Bias disclosure: Known biases and limitations communicated
□ Update notification: Users informed of model updates
□ Conformity marking: CE mark displayed (for EU-deployed systems)
```

### 11.5 TGA Australia AI Guidance

#### Overview
The Therapeutic Goods Administration (TGA) of Australia regulates AI-based medical devices under the Therapeutic Goods Act 1989.

#### TGA Key Requirements

| Requirement | Description | UX Impact |
|---|---|---|
| Inclusion in ARTG | All medical AI must be listed in the Australian Register of Therapeutic Goods | Display ARTG number in UI |
| Essential Principles | Must meet safety and performance principles | Safety warning systems |
| Clinical evidence | Must have clinical evidence supporting claims | Evidence grade display |
| Post-market monitoring | Ongoing safety monitoring after deployment | Adverse event reporting UI |
| Sponsor responsibility | Australian sponsor must be identified | Sponsor attribution in UI |

#### TGA-Specific UI Elements

```
+--------------------------------------------------+
|  TGA Regulatory Information                       |
|                                                   |
|  ARTG Number: 394821                              |
|  Sponsor: MedTech Australia Pty Ltd               |
|  Classification: Class IIa Medical Device         |
|                                                   |
|  ┌─ Clinical Evidence Summary ──────────────────┐ │
|  │                                             │ │
|  │  Clinical validation: Completed             │ │
|  │  Study type: Prospective cohort (n=2,400)   │ │
|  │  Primary endpoint: Non-inferiority          │ │
|  │  Result: Achieved (p<0.001)                 │ │
|  │                                             │ │
|  │  [View Clinical Evidence]                   │ │
|  │  [Report Adverse Event]                     │ │
|  │                                             │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 11.6 Health Canada AI Guidance

#### Overview
Health Canada's guidance on AI/Machine Learning-enabled medical devices emphasizes risk-based regulation, transparency, and ongoing monitoring.

#### Health Canada Action Plan for AI

| Theme | Key Element | UX Requirement |
|---|---|---|
| Trust | Transparency | Clear AI labeling, explainability features |
| Trust | Oversight | Human-in-the-loop verification workflows |
| Fairness | Equity | Bias detection alerts, demographic performance |
| Safety | Risk management | Safety alert integration, error handling |
| Accountability | Governance | Audit trails, version control, change logging |
| Growth | Innovation | Clear modification plans, performance tracking |

#### Health Canada-Specific Requirements

```
+--------------------------------------------------+
|  Health Canada AI Device Information              |
|                                                   |
|  Medical Device License: MDL-2024-XXXXX           │
|  Class: Class II                                  │
|  Manufacturer: [Company Name]                     │
|                                                   │
|  ┌─ Quality Management ─────────────────────────┐ │
|  │                                             │ │
|  │  ISO 13485 certified: Yes                   │ │
|  │  ISO 14971 risk management: Yes             │ │
|  │  IEC 62304 software lifecycle: Yes          │ │
|  │                                             │ │
|  │  Last quality audit: November 2024          │ │
|  │  Next audit: May 2025                       │ │
|  │                                             │ │
|  │  [View Quality Certificate]                 │ │
|  │  [Report Quality Concern]                   │ │
|  │                                             │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

### 11.7 International Regulatory Comparison Matrix

| Feature | FDA (US) | EU AI Act | NHS (UK) | TGA (Australia) | Health Canada |
|---|---|---|---|---|---|
| AI Classification | SaMD risk classes | High-risk (Annex III) | Context-dependent | Medical device class | Risk-based |
| Human oversight | Required for II+ | Mandatory (Art. 14) | Strong emphasis | Required | Required |
| Transparency | Predetermined Change Control Plan | Extensive (Art. 13) | Algorithm Impact Assessment | ARTG listing | QMS required |
| Audit trail | 21 CFR Part 11 | Automatic logging | IG requirements | Post-market monitoring | Required |
| Performance monitoring | Real-world performance | Ongoing accuracy | Safety monitoring | Post-market | Vigilance |
| Consent management | HIPAA | GDPR Art. 9 | Common Law + GDPR | Privacy Act | PIPEDA/PHIPA |
| Explainability | Recommended | Required | Expected | Expected | Recommended |
| CE/FDA marking | FDA clearance | CE marking | NHS approval | ARTG inclusion | MDL |

### 11.8 Multi-Jurisdiction Compliance UI

For systems deployed across multiple jurisdictions:

```
+--------------------------------------------------+
|  Regulatory Compliance Status                     |
|                                                   |
|  ┌─ Jurisdiction Status ───────────────────────┐ │
|  │                                             │ │
|  │  🇺🇸 United States     ✅ FDA Cleared       │ │
|  │  🇪🇺 European Union    ✅ CE Marked         │ │
|  │  🇬🇧 United Kingdom    ✅ NHS Approved      │ │
|  │  🇦🇺 Australia         ✅ ARTG Listed       │ │
|  │  🇨🇦 Canada            ✅ MDL Issued        │ │
|  │                                             │ │
|  │  Current jurisdiction: 🇺🇸 United States    │ │
|  │  [View jurisdiction-specific requirements] │ │
|  │                                             │ │
|  └───────────────────────────────────────────────┘ │
+--------------------------------------------------+
```

---

## 12. Implementation Reference Architecture

### 12.1 Component Inventory

Based on the patterns described in this document, the following component inventory is recommended for clinical AI safety UX:

#### Core Safety Components

| Component | Type | Priority | Section Reference |
|---|---|---|---|
| `SafetyBanner` | Persistent banner | P0 | Section 4.2 |
| `ConfidenceBar` | Probability visualization | P0 | Section 2.3 |
| `ConfidenceInterval` | Range visualization | P0 | Section 2.2 |
| `EvidenceBadge` | Grade indicator | P0 | Section 2.4 |
| `SampleSizeIndicator` | N-size display | P0 | Section 2.5 |
| `PreliminaryLabel` | Research warning | P0 | Section 2.6 |
| `SourceIcon` | Provenance icon | P0 | Section 3.2 |
| `AttributionBlock` | Author display | P0 | Section 3.4 |
| `VersionBadge` | Version indicator | P1 | Section 3.7 |
| `AuditLogViewer` | Audit interface | P0 | Section 5.2 |
| `ActivityTimeline` | Chronological view | P1 | Section 5.3 |
| `ConsentIndicator` | Consent status | P0 | Section 6.2 |
| `ConsentBlocker` | Blocking UI | P0 | Section 6.4 |
| `ConsentTimeline` | Consent history | P1 | Section 6.5 |
| `AlertBanner` | Warning display | P0 | Section 7.2 |
| `SeverityBadge` | Severity indicator | P0 | Section 7.2 |
| `ReviewBadge` | Navigation badge | P1 | Section 8.2 |
| `DotIndicator` | Subtle alert | P1 | Section 8.3 |
| `ReviewQueue` | Queue interface | P1 | Section 8.5 |
| `SLAIndicator` | SLA status | P2 | Section 8.8 |
| `ErrorState` | Failure display | P0 | Section 10.2 |
| `PartialResult` | Partial data | P0 | Section 10.5 |
| `DisclaimerFooter` | Legal footer | P0 | Section 4.4 |
| `OverrideModal` | Override workflow | P0 | Section 4.5 |
| `ExplanationTooltip` | "Why am I seeing this?" | P1 | Section 4.7 |
| `RegulatoryBadge` | Jurisdiction status | P2 | Section 11.7 |

### 12.2 State Machine for AI Output Display

```
[Data Received]
     │
     ▼
[Validate Input Quality]
     │
     ├─► [Insufficient Data] ──► Show Insufficient Data State (Section 10.3)
     │                            (End)
     │
     ▼
[Run AI Analysis]
     │
     ├─► [Analysis Failed] ───► Show Error State (Section 10.2)
     │                           (End)
     │
     ▼
[Check Confidence Threshold]
     │
     ├─► [Below Display Threshold] ──► Log silently, do not display
     │                                  (End)
     │
     ├─► [Low Confidence] ──► Show grayed out with uncertainty label
     │                         (Section 2.7)
     │                         (Continue)
     │
     ├─► [Medium Confidence] ──► Show with standard uncertainty
     │                            (Section 2.3)
     │                            (Continue)
     │
     └─► [High Confidence] ──► Show prominently with confidence badge
                                (Section 2.3)
                                (Continue)
     │
     ▼
[Check Consent Status]
     │
     ├─► [Consent Required] ──► Show Consent Blocker (Section 6.4)
     │                           (End)
     │
     └─► [Consented] ──► (Continue)
     │
     ▼
[Check Regulatory Approval]
     │
     ├─► [Not Approved] ──► Show Preliminary Label (Section 2.6)
     │                       (Continue)
     │
     └─► [Approved] ──► (Continue)
     │
     ▼
[Determine Severity]
     │
     ├─► [Critical] ──► Show Critical Alert Banner (Section 7.2)
     │                   + Require acknowledgment
     │
     ├─► [High] ──► Show High Priority Banner (Section 7.2)
     │               + Require acknowledgment
     │
     ├─► [Medium] ──► Show Medium Banner (Section 7.2)
     │
     ├─► [Low] ──► Show Low Banner (Section 7.2)
     │
     └─► [Info] ──► Show Info Banner (Section 7.2)
     │
     ▼
[Display Output with Safety Wrapper]
     │
     ├─► Safety Banner (Section 4.2)
     ├─► Provenance Block (Section 3)
     ├─► Uncertainty Indicators (Section 2)
     ├─► Disclaimer Footer (Section 4.4)
     ├─► Audit Logging (Section 5)
     └─► Review Queue Entry (Section 8)
```

### 12.3 Accessibility Requirements

All safety UX components must meet WCAG 2.1 AA standards:

| Requirement | Implementation |
|---|---|
| Color contrast | All text meets 4.5:1 ratio; large text 3:1 |
| Non-color indicators | Icons + text + patterns, never color alone |
| Screen reader support | All alerts announced with ARIA live regions |
| Keyboard navigation | All safety actions accessible via keyboard |
| Focus management | Focus moves to critical alerts automatically |
| Motion preferences | Respect `prefers-reduced-motion`; no pulsing |
| Cognitive load | Progressive disclosure; plain language |
| Touch targets | Minimum 44x44px for all interactive elements |

### 12.4 Responsive Behavior

| Breakpoint | Safety Banner | Alert Modal | Review Queue |
|---|---|---|---|
| Desktop (>1200px) | Full banner, top | Center modal, 600px | Full sidebar |
| Tablet (768-1200px) | Collapsible banner | Center modal, 90% width | Bottom sheet |
| Mobile (<768px) | Icon-only, expandable | Full-screen modal | Full-screen |

---

## 13. Appendices

### Appendix A: Evidence Sources

This document synthesizes evidence from the following sources:

1. **FDA Guidance Documents**
   - "Artificial Intelligence/Machine Learning (AI/ML)-Based Software as a Medical Device (SaMD) Action Plan" (2021)
   - "Predetermined Change Control Plans for Machine Learning-Enabled Medical Devices: Guiding Principles" (2023)

2. **NHS England Publications**
   - "A Buyer's Guide to AI in Health and Care" (2021)
   - "The NHS AI Ethics Framework" (2021)
   - "Piloting the Multi-Agency Advisory Service for AI" (2023)

3. **EU Regulatory**
   - "Regulation (EU) 2024/1689 — Artificial Intelligence Act"
   - "GDPR Regulation (EU) 2016/679, Article 9 (Special Categories)"

4. **Academic Literature**
   - Beede et al. (2020). "A Human-Centered Evaluation of a Deep Learning System Deployed in Clinics for the Detection of Diabetic Retinopathy." CHI 2020.
   - van der Sijs et al. (2006). "Overriding of drug safety alerts in computerized physician order entry." JAMIA.
   - Sendak et al. (2020). "A Real-World Application of Machine Learning to Predict Diabetes Risk." NEJM Catalyst.
   - Price, W.N. & Cohen, I.G. (2019). "Privacy in the age of medical big data." Nature Medicine.
   - Amershi et al. (2019). "Guidelines for Human-AI Interaction." CHI 2019.

5. **International Regulators**
   - TGA: "Software as a Medical Device (including AI/ML)" guidance
   - Health Canada: "Action Plan for AI and Machine Learning"
   - WHO: "Ethics and Governance of Artificial Intelligence for Health" (2021)

### Appendix B: Glossary

| Term | Definition |
|---|---|
| **AI/ML** | Artificial Intelligence / Machine Learning |
| **ARRT** | Acknowledgment, Review, Reason, Track (safety workflow) |
| **CDS** | Clinical Decision Support |
| **CDSS** | Clinical Decision Support System |
| **CE Mark** | Conformite Europeenne marking for EU market access |
| **EHR** | Electronic Health Record |
| **FDA** | Food and Drug Administration (US) |
| **GDPR** | General Data Protection Regulation (EU) |
| **GRADE** | Grading of Recommendations Assessment, Development and Evaluation |
| **HIPAA** | Health Insurance Portability and Accountability Act (US) |
| **Ig** | Information Governance |
| **IRB** | Institutional Review Board |
| **ML** | Machine Learning |
| **MRN** | Medical Record Number |
| **PCCP** | Predetermined Change Control Plan (FDA) |
| **SaMD** | Software as a Medical Device |
| **SLA** | Service Level Agreement |
| **TGA** | Therapeutic Goods Administration (Australia) |
| **WCAG** | Web Content Accessibility Guidelines |
| **WHO** | World Health Organization |

### Appendix C: Checklist for Clinical AI Safety UX Review

Use this checklist before releasing any clinical AI feature:

#### Uncertainty Communication
- [ ] Every AI output displays a confidence level
- [ ] Confidence is shown visually (bar, interval, or badge)
- [ ] Confidence is shown numerically (never visual-only)
- [ ] Low-confidence findings are visually de-emphasized
- [ ] Evidence grade is displayed for all recommendations
- [ ] Sample size is shown for all statistical predictions

#### Provenance & Transparency
- [ ] Every output identifies its AI system (name, version)
- [ ] Every output shows when it was generated
- [ ] Source data is traceable (one-click to source)
- [ ] Human reviewers are identified (when applicable)
- [ ] Evidence trail is accessible (one-click to evidence)

#### Safety Wrappers
- [ ] Safety banner appears on every AI page
- [ ] Footer disclaimer appears on every AI output
- [ ] Limitation callouts are contextual (not generic)
- [ ] "Why am I seeing this?" explanation is available

#### Human Oversight
- [ ] Every AI recommendation can be overridden
- [ ] Override requires a reason
- [ ] Overrides are logged
- [ ] Review queue is accessible
- [ ] SLA indicators show review deadlines

#### Audit & Accountability
- [ ] Audit log is accessible from every page
- [ ] Activity timeline is available per patient
- [ ] Anomaly detection is active
- [ ] All actions are logged with user, time, and context

#### Consent
- [ ] Consent status is visible per data source
- [ ] Consent blocks access when not obtained
- [ ] Consent history is maintained
- [ ] Re-consent prompts are automatic

#### Error Handling
- [ ] All failures are communicated transparently
- [ ] No results are ever synthesized or approximated
- [ ] Error states include: what, why, impact, and action
- [ ] Retry is available for transient failures

#### Wording
- [ ] No AI output claims to diagnose
- [ ] No AI output uses directive language to clinicians
- [ ] No AI output implies 100% certainty
- [ ] All AI outputs are framed as "assisted" or "suggested"

#### Accessibility
- [ ] All severity levels use icons, not just color
- [ ] All alerts are screen-reader accessible
- [ ] Keyboard navigation works for all safety actions
- [ ] Motion preferences are respected

#### Regulatory
- [ ] Jurisdiction-specific requirements are met
- [ ] Required disclaimers are displayed
- [ ] Regulatory markings are visible (FDA, CE, ARTG, MDL)
- [ ] Adverse event reporting is accessible

### Appendix D: File Reference

```
/mnt/agents/DeepSynaps-Protocol-Studio/research/
└── DEEPSYNAPS_HEALTHCARE_SAFETY_UX.md    (this file)
```

---

## Document Information

- **Title:** DeepSynaps Protocol Studio — Healthcare Safety UX Research
- **Version:** 1.0
- **Classification:** Research Report — Enterprise Healthcare SaaS Architecture
- **Sections:** 13 (with 4 appendices)
- **Primary Topics:** Uncertainty display, provenance, AI limitation callouts, audit visibility, consent visibility, warning systems, review patterns, safe wording, error handling, international regulations
- **Target Length:** 1,500+ lines
- **Jurisdictions Covered:** US (FDA), EU (AI Act + GDPR), UK (NHS), Australia (TGA), Canada (Health Canada)

*This document is a living reference. Patterns should be validated against specific regulatory requirements for each deployment jurisdiction and clinical use case. All examples are illustrative and should be adapted to institutional standards, clinical workflows, and regulatory requirements.*

---

*End of Document*
