# DeepSynaps Clinical Intelligence UX Rules

## Document Information

| Field | Value |
|---|---|
| Version | 1.0.0 |
| Status | Draft |
| Author | Clinical UX Architecture Team |
| Date | 2026-05-16 |
| Classification | Clinical Decision Support — Safety Critical |
| Review Cycle | Quarterly |

---

## 1. Philosophy and Core Principles

### 1.1 Design Philosophy

DeepSynaps presents AI-generated clinical intelligence as **decision support only**.
The system never delivers verdicts, diagnoses, or treatment recommendations
as finalized conclusions. Every output is framed as evidence to be reviewed,
interpreted, and acted upon (or dismissed) by a qualified clinician.

### 1.2 Core Principles

| Principle | Rule | Enforcement |
|---|---|---|
| **Transparency** | No black-box outputs. Every finding must expose its evidence chain. | Hard block on export if violated |
| **Uncertainty Visibility** | Uncertainty is never hidden, collapsed, or deprioritized. | Always visible by default |
| **Evidence Provenance** | Every claim must link to retrievable sources. | Validation gate before display |
| **Conflict Equality** | Conflicting evidence receives equal visual prominence. | Layout enforcement |
| **Clinician Sovereignty** | AI informs; clinicians decide. Review is mandatory, not optional. | Workflow gate |
| **Research-Only Clarity** | Investigational outputs are clearly segregated from validated guidance. | Banner + acknowledgment gate |

### 1.3 Safety-First Hierarchy

```
CLINICIAN DECISION  ←  Always the final authority
       ▲
EVIDENCE REVIEW      ←  Mandatory before any action
       ▲
AI SYNTHESIS         ←  Labeled as "Decision Support Only"
       ▲
MULTIMODAL FUSION    ←  Shows per-modality confidence
       ▲
RAW DATA INGESTION   ←  Validated, timestamped, auditable
```

---

## 2. Evidence Display Rules

### 2.1 Evidence Panel Structure

Every clinical finding displayed in DeepSynaps must use the standardized
Evidence Panel layout. No finding may be displayed without this panel or
an approved variant.

```
┌─────────────────────────────────────────────────────────────┐
│  Evidence Panel                                              │
│                                                              │
│  Finding: [Concise clinical statement]                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Evidence Grade: [Grade] (Level Name)                │    │
│  │  ├─ [Study count and types with sample sizes]        │    │
│  │  └─ Confidence: [0.00–1.00 numerical score]          │    │
│  └─────────────────────────────────────────────────────┘    │
│  Sources:                                                    │
│  • [Database]: [Accession ID] ([Year])  [🔗 External Link] │
│  • [Database]: [Accession ID] ([Year])  [🔗 External Link] │
│  ⚠️  Uncertainty:                                           │
│  [Specific, actionable uncertainty statements]              │
│  🔬 Research-Only Note: [If investigational]                │
│  ❗ Conflicting Evidence: [If contradictions exist]         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ✅  Clinician Review Required — Not yet reviewed     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Evidence Grade System

| Grade | Color | Definition | Confidence Range |
|---|---|---|---|
| **A** | `#1B7A2A` (dark green) | High — Multiple RCTs or strong meta-analyses | 0.85 – 1.00 |
| **B** | `#5CB85C` (light green) | Moderate — Limited RCTs or observational studies | 0.65 – 0.84 |
| **C** | `#F0AD4E` (orange) | Low — Expert opinion, small studies | 0.40 – 0.64 |
| **D** | `#D9534F` (red) | Very Low — Anecdotal or preliminary | 0.00 – 0.39 |

**Rendering rules:** Grade badge appears top-left of every panel. Color is never
sole indicator — letter + text label always present. Badge min 16px font.
Tooltip on hover explains the definition. White text on colored background
(WCAG AA contrast).

### 2.3 Confidence Score Display

Dual representation required: numerical value (0.00–1.00, two decimals) + visual bar.

```
Confidence: 0.72
[████████████████████░░░░░░░░░░░░░░░░] 72%
```

**Bar specs:** Min width 200px (desktop) / 120px (mobile). Height 12px / 10px.
Fill color matches grade. Background `#E8E8E8` with 1px `#CCCCCC` border.
Smooth fill animation on open (300ms ease-out). Numerical value left of bar.

### 2.4 Source Citation Requirements

Every source must include: database name, accession ID, publication year,
direct link (required); study type and sample size (recommended).

| Field | Format Example |
|---|---|
| Database | `PubMed`, `Cochrane`, `PharmGKB`, `ClinicalTrials.gov` |
| Accession ID | `PMID 12345678`, `CD012345`, `NCT12345678` |
| Year | `(2023)` |
| Link | Opens new tab (`target="_blank"`, `rel="noopener noreferrer"`) |

Link colors: `#0066CC` (unvisited), `#551A8B` (visited). Hover: underline + 10% darker.
External link icon (↗) on all citations.

### 2.5 Uncertainty Display Rules

Uncertainty is **always visible** and follows these strict rules:

1. **Visibility**: Expanded by default on every evidence panel
2. **Collapsibility**: User may collapse; re-expands on next panel open
3. **Content**: Specific, actionable statements — never generic phrases
4. **Icon**: Yellow triangle (⚠️) always present
5. **Position**: Below sources, above research-only notes

**Prohibited phrases:** ~~"More research is needed"~~, ~~"Results may vary"~~, ~~"Further studies warranted"~~

**Required format (specific):**
> "Small sample sizes (largest RCT n=62). Long-term effects beyond 12 weeks unknown.
> Population primarily young adults (mean age 28); generalizability to older adults unverified."

### 2.6 Research-Only Flag Rules

Applies to preclinical studies, single-center investigations, unvalidated
biomarker correlations, and investigator-initiated trial parameters.

- Yellow banner (`#FFF3CD` bg, `#856404` text) at top of panel — **not dismissible**
- 🔬 icon + "RESEARCH-ONLY FINDING" in bold
- Requires explicit clinician acknowledgment before any associated action
- Acknowledgment logged with timestamp and clinician ID (irreversible)
- Without acknowledgment, action buttons are disabled

```
┌─────────────────────────────────────────────────────────────┐
│  🔬  RESEARCH-ONLY FINDING — Not for clinical decision-     │
│      making without independent validation.    [Acknowledge]│
└─────────────────────────────────────────────────────────────┘
```

### 2.7 Conflicting Evidence Display

Conflicting evidence receives **equal prominence** to supporting evidence.

- Red exclamation icon (❗) — draws attention without alarming
- Same hierarchy level as supporting evidence
- Expandable details with full citation format matching sources
- No finding may be displayed without its known conflicts
- Red tint background `#FFEBEE`, left border 3px solid `#D9534F`

```
❗ Conflicting Evidence:
One study (PMID 87654321, 2024, RCT n=88) found no significant effect
in adults over 65 years (p=0.42). → [View full study details]
```

---

## 3. DeepTwin Synthesis Display

### 3.1 Synthesis Panel Structure

```
┌─────────────────────────────────────────────────────────────┐
│  DeepTwin Synthesis — Patient #[ID]                          │
│  Generated: [ISO 8601 timestamp]                             │
│  Modalities Fused: qEEG | Biomarker | Meds                   │
│  Fusion Confidence: [0.00–1.00]                              │
│  ─────────────────────────────────────────────────────────  │
│  Key Findings (Ranked by Evidence Strength):                │
│  1. [Finding title]                                          │
│     Evidence: [Grade] | Confidence: [0.XX]                  │
│     Sources: [N] studies, n=[total]                         │
│     ↗ Correlates with: [Related finding]                    │
│     [Uncertainty note if applicable]                        │
│  2. [Finding title] ...                                      │
│  ─────────────────────────────────────────────────────────  │
│  Uncertainty Summary:                                        │
│  • Missing: [Data not available]                           │
│  • Limited: [Data insufficient]                            │
│  • Confound: [Confounding factor]                          │
│  ⚠️  DECISION SUPPORT ONLY                                   │
│  Review Status: ☐ Pending  ☑ Reviewed by [Name] ([Date])   │
│  [View Full Evidence] [Export Synthesis] [Share]            │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Fusion Confidence Display

Show per-modality confidence + aggregated fusion confidence:

```
Modalities Fused:
qEEG       [██████████████░░░░] 0.78
Biomarker  [████████████░░░░░░] 0.65
Meds       [██████████████████] 0.91
────────────────────────────────
Fusion     [█████████████░░░░░] 0.78
```

### 3.3 Finding Ranking

Ranked by: **Primary** — Evidence grade (A→D); **Secondary** — Confidence score
(highest first); **Tertiary** — Clinical relevance score. All three criteria visible
in the finding header.

### 3.4 Cross-Reference Arrows

Directional arrows with correlation metrics:
```
↗ Correlates with: BDNF levels (r=0.45, p<0.01)
↗ Correlates with: Medication non-response (OR=2.3, 95% CI: 1.4–3.8)
```
Arrow color `#0066CC` (correlation present), `#999999` (weak). Click navigates to
correlated finding's evidence panel.

### 3.5 Uncertainty Summary Section

| Type | Icon | Definition | Example |
|---|---|---|---|
| **Missing** | ○ | Data not available | "MRI structural data not available" |
| **Limited** | ◐ | Data available but insufficient | "Wearable data: only 3 of 14 required days" |
| **Confound** | ● | Potential confounding factor | "Patient started new medication 5 days ago" |

Each item must be actionable — clinician should understand what would reduce uncertainty.

### 3.6 Review Workflow Integration

Two-step review process enforced before export:

**Step 1:** ☐ I understand this synthesis is decision support only and does not replace clinical judgment.

**Step 2:** ☐ I have reviewed all findings, evidence, uncertainties, and conflicts.
[Reviewer Name: ________] [Date/Time: auto-filled] [Submit Review]

- Both checkboxes required before export
- Attestation logged immutably with clinician ID and timestamp
- Unreviewed syntheses: persistent yellow banner
- Reviewed syntheses: green checkmark + reviewer name and date
- Once reviewed, synthesis is locked from AI modification

---

## 4. Visualization Rules

### 4.1 Evidence Grade Color System

| Context | Grade A | Grade B | Grade C | Grade D |
|---|---|---|---|---|
| Badge bg | `#1B7A2A` | `#5CB85C` | `#F0AD4E` | `#D9534F` |
| Badge text | `#FFFFFF` | `#FFFFFF` | `#212529` | `#FFFFFF` |
| Bar fill | `#1B7A2A` | `#5CB85C` | `#F0AD4E` | `#D9534F` |
| Border | `#146A22` | `#4CA84C` | `#E09A3E` | `#C9443F` |
| Tooltip bg | `#E8F5E9` | `#E8F5E9` | `#FFF8E1` | `#FFEBEE` |

### 4.2 Confidence Bar Specifications

- Always visible — never behind tooltip or expandable section
- Dual display: numerical value + visual bar together
- Positioned immediately adjacent to evidence grade badge
- Smooth animation on confidence value changes
- Vertical threshold markers at 0.50 and 0.80

### 4.3 Uncertainty Visualization

- Left border: warning yellow (`#F0AD4E`, 3px)
- Background: `#FFFDF5` (subtle warm tint)
- Warning icon (⚠️) 20px, left-aligned, vertically centered
- Text color: `#856404`
- Never collapses automatically

### 4.4 Research-Only Banner

- Background: `#FFF3CD`, border: 1px solid `#FFEEBA`, text: `#856404`
- 🔬 icon 20px, bold "RESEARCH-ONLY FINDING" text
- Min height 48px, acknowledgment button right-aligned
- **Not dismissible** by Escape or click-outside

### 4.5 Conflicting Evidence Iconography

- Red exclamation (❗) 20px at section start
- Background tint `#FFEBEE`, left border 3px `#D9534F`
- Expand/collapse chevron, same citation format as sources

### 4.6 Provenance Links

- Clickable blue links `#0066CC` with external icon (↗)
- Hover: underline, color `#004C99`. Active: `#003D7A`. Visited: `#551A8B`
- All open in new tab with security attributes

### 4.7 Temporal Display

| Location | Format | Visibility |
|---|---|---|
| Synthesis header | `YYYY-MM-DD HH:mm UTC` | Always |
| Evidence panel | Relative ("2 hours ago") | Always |
| Source citation | Publication year `(2023)` | Always |
| Review attestation | Full timestamp + timezone | Always |

- Hover over relative time shows absolute timestamp
- Stale data (>24h) triggers amber banner: "Data may be outdated. Refresh recommended."

---

## 5. Interaction Patterns

### 5.1 Clickable Findings

| Gesture | Action |
|---|---|
| **Click/Tap** | Opens full Evidence Panel |
| **Hover (desktop)** | Tooltip showing grade + confidence |
| **Long press (mobile)** | Context menu: View Evidence / Add Note / Flag |

Panel opens as slide-out drawer from right (desktop) or full-screen modal (mobile).
Transition: 300ms ease-in-out.

### 5.2 Citation Link Behavior

| State | Behavior |
|---|---|
| **Default** | Blue link with external icon |
| **Hover** | Underline, darker blue, full citation tooltip |
| **Click** | Opens new tab; logs click |
| **Unavailable** | Grayed out, "(source unavailable)" |

### 5.3 Uncertainty Expand/Collapse

- Default: **Expanded**
- Collapse via chevron or "Hide" button
- Collapsed: warning icon + first 50 chars + "..."
- Collapse state **not persisted** — re-expands on panel reopen

### 5.4 Conflicting Evidence Interaction

- Default: **Collapsed** showing icon + one-line summary
- Expanded: full citation, study details, contradiction explanation
- 200ms height transition
- Same visual weight as supporting evidence

### 5.5 Research-Only Acknowledgment Flow

```
[Banner Displayed] → [Clinician clicks Acknowledge] →
[Confirmation Modal: "This finding is research-only and has not been
clinically validated. This will be recorded."] →
[Clinician confirms] → [Banner: "✓ Acknowledged by [Name] at [Timestamp]"] →
[Associated actions enabled]
```

Acknowledgment is **irreversible**, logged permanently, per-finding (not global).

### 5.6 Clinician Review Gate

No synthesis may be exported, shared, or printed without review:

```
[User clicks Export] → [System checks review status]
  ├─ Reviewed → Export proceeds with reviewer attribution
  └─ Not Reviewed → Modal: "Clinician review required before export."
                     [Go to Review] [Cancel]
```

### 5.7 State Transitions

| Transition | Duration | Easing |
|---|---|---|
| Panel open/close | 300ms | `ease-in-out` |
| Confidence bar fill | 300ms | `ease-out` |
| Expand/collapse | 200ms | `ease-in-out` |
| Hover feedback | 150ms | `ease` |
| Page transitions | 400ms | `ease-in-out` |

---

## 6. Mobile UX

### 6.1 Layout Principles

- **Single column**: All cards stack vertically
- **Touch targets**: Minimum 44px × 44px
- **Font sizes**: Minimum 16px body text
- **Spacing**: 16px between cards; 8px between related items
- **Safe areas**: Respect device safe area insets

### 6.2 Card Stacking

```
┌─────────────────────────────┐
│  Synthesis Header Card      │
├─────────────────────────────┤
│  Modality Fusion Card       │
├─────────────────────────────┤
│  Finding #1 (Collapsed)     │
├─────────────────────────────┤
│  Finding #2 (Collapsed)     │
├─────────────────────────────┤
│  Uncertainty Summary Card   │
├─────────────────────────────┤
│  Review & Actions Card      │
└─────────────────────────────┘
```

Cards: 8px rounded corners, shadow `0 2px 8px rgba(0,0,0,0.08)`.
Active press: scale 0.98 + shadow reduction.

### 6.3 Evidence Panel (Mobile)

- Full-screen modal, slides up from bottom (400ms ease-out)
- Sticky header on scroll (title + grade badge)
- Close (X) top-right always visible, back button for nested nav
- Scrollable content with overscroll bounce

### 6.4 Swipe Gestures

| Gesture | Target | Action |
|---|---|---|
| Swipe left/right | Non-critical alert | Reveal Dismiss/Snooze |
| Swipe down | Full-screen panel | Close panel |
| Swipe up | Collapsed finding | Expand |
| Pinch/spread | Brain visualization | Zoom in/out |
| Double tap | Brain visualization | Reset zoom |

Critical alerts (safety warnings, review requirements) cannot be swipe-dismissed.

### 6.5 Brain Visualization (Mobile)

- Default: fit-to-screen with 16px padding
- Pinch-to-zoom: 1× to 4×, pan when zoomed, double-tap smart zoom
- All touch gestures have button equivalents for accessibility

### 6.6 One-Handed Operation

- Primary actions in bottom 50% of screen
- Review/Acknowledge buttons at thumb-reachable positions
- FAB bottom-right for primary action
- Tab bar at bottom (not top)
- Pull-to-refresh for data updates

---

## 7. Accessibility

### 7.1 WCAG 2.1 AA Compliance

| Criterion | Requirement | Implementation |
|---|---|---|
| 1.4.3 Contrast | Min 4.5:1 for text | All text verified |
| 1.4.11 Non-text Contrast | 3:1 for UI components | Badges, bars, icons |
| 1.4.4 Resize Text | 200% zoom without loss | Responsive layouts |
| 2.1.1 Keyboard | All functionality via keyboard | Tab order, Enter/Space |
| 2.4.3 Focus Order | Logical tab sequence | Top-to-bottom |
| 2.4.7 Focus Visible | Visible focus indicators | 2px `#0066CC` outline, 2px offset |

### 7.2 Screen Reader Compatibility

Evidence Panels must include:
- `role="region"` with `aria-label="Evidence Panel"`
- Grade announced: "Evidence Grade B, Moderate confidence"
- Confidence announced: "Confidence 72 percent"
- Uncertainty: `aria-expanded` with live region updates
- Research-Only banner: `role="alert"` on first appearance
- Conflicts: Announced after supporting evidence with "Conflicting:" prefix
- Source links: `aria-label` includes full citation text

**Example screen reader output:**
```
"Finding: tDCS improves working memory. Evidence Grade B, Moderate.
Confidence 72 percent. Two RCTs, sample sizes 45 and 62. One
meta-analysis of 8 studies, 312 participants. Uncertainty: Small
sample sizes. Long-term effects unknown."
```

### 7.3 Keyboard Navigation

| Key | Action |
|---|---|
| Tab / Shift+Tab | Next/previous interactive element |
| Enter / Space | Activate focused element |
| Escape | Close panel or modal |
| Arrow Up/Down | Navigate within lists |
| Home / End | Jump to first/last item |

Focus trap: Tab cycles within open modals only. Focus returns to trigger on close.

### 7.4 High Contrast Mode

When `prefers-contrast: high`:
- Grade badges: solid borders (2px) + fill
- Confidence bars: border outline around fill
- Focus indicators: thickened to 3px
- Icons: outlined versions, text min 4.5:1 contrast

```css
@media (prefers-contrast: high) {
  .grade-badge { border: 2px solid currentColor; }
  .confidence-bar { border: 1px solid CanvasText; }
  .focus-indicator { outline: 3px solid Highlight; outline-offset: 3px; }
}
```

### 7.5 Alternative Text for Visualizations

| Visualization | Alternative |
|---|---|
| Brain heatmap | Structured text describing regions and confidence |
| Confidence bar | Screen reader announces numerical value |
| Network graph | Adjacency list with node labels and edge weights |
| Time series | Summary statistics + trend description |
| Grade badge | Text label read aloud (not just color) |
| Correlation arrows | "Correlates with [name], correlation coefficient 0.45" |

### 7.6 Reduced Motion

When `prefers-reduced-motion: reduce`:
- All animations disabled (instant transitions)
- No parallax or scroll-driven animations
- Hover: color change only (no transform)

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 7.7 Color Independence

No information conveyed by color alone:
- Grades: letter + color + label (3 channels)
- Confidence: number + bar length + color (3 channels)
- Uncertainty: icon + text + border (3 channels)
- Research-Only: banner + icon + text + acknowledgment gate (4 channels)

---

## 8. Component Library Quick Reference

```typescript
// Evidence Panel Component
interface EvidencePanelProps {
  finding: string;
  evidenceGrade: 'A' | 'B' | 'C' | 'D';
  confidence: number;          // 0.00 – 1.00
  studies: Study[];
  sources: Source[];
  uncertainty: string[];
  researchOnly?: boolean;
  researchOnlyNote?: string;
  conflictingEvidence?: Conflict[];
  onReview: (reviewer: string) => void;
  onAcknowledge?: () => void;
}

// Synthesis Panel Component
interface SynthesisPanelProps {
  patientId: string;
  generatedAt: string;         // ISO 8601
  modalities: Modality[];
  fusionConfidence: number;
  findings: Finding[];
  uncertaintySummary: UncertaintyItem[];
  reviewStatus: 'pending' | 'reviewed';
  reviewedBy?: string;
  reviewedAt?: string;
  onExport: () => void;
  onShare: () => void;
}

// Grade Badge Component
interface GradeBadgeProps {
  grade: 'A' | 'B' | 'C' | 'D';
  showLabel?: boolean;         // default: true
  size?: 'sm' | 'md' | 'lg';   // default: 'md'
  tooltip?: boolean;           // default: true
}
```

---

## 9. Audit and Compliance

### 9.1 UX Audit Checklist

Before any release, verify:

- [ ] Every finding displays an Evidence Panel with all required fields
- [ ] No finding presented without its evidence grade
- [ ] Confidence scores visible as number + bar on every panel
- [ ] Uncertainty sections expanded by default
- [ ] Research-Only findings display non-dismissible yellow banner
- [ ] Conflicting evidence panels present where applicable
- [ ] All source citations link to external databases
- [ ] Clinician review gated before export
- [ ] Timestamps visible on all panels and syntheses
- [ ] All interactive elements meet 44px minimum touch target
- [ ] Keyboard navigation works for all features
- [ ] Screen reader output sensible for all components
- [ ] Color never the sole information channel
- [ ] High contrast mode renders all elements legibly
- [ ] Reduced motion mode disables all animations
- [ ] Mobile layouts stack vertically without horizontal scroll

### 9.2 Violation Severity Levels

| Level | Description | Example | Response |
|---|---|---|---|
| **Critical** | Safety risk; clinical harm | Black-box verdict without evidence | Block release |
| **High** | Compliance/regulatory risk | Missing research-only flag | Block release |
| **Medium** | Degraded UX; trust erosion | Missing timestamp | Fix in sprint |
| **Low** | Polish; non-blocking | Animation timing | Backlog |

---

## 10. Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | 2026-05-16 | Clinical UX Architecture Team | Initial document |

---

*This document is a living specification. All changes require review by the
Clinical Safety Board and the UX Architecture Team.*

*Contact: deepsynaps-ux@protocol.studio*
