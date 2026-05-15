# DeepSynaps Handbooks — Handbook Generator UX Benchmark
## Document Builder, Patient Education Portal & Medical Documentation Platform Design Standards

**Version:** 1.0  
**Date:** 2026-05-19  
**Classification:** Research Synthesis — UX Design & Interaction Patterns  
**Scope:** Notion-style block editor, clinical document builders, patient education portals, neuromodulation information leaflets

---

## Table of Contents

1. [Block-Based Document Editor Patterns](#1-block-based-document-editor-patterns)
2. [Collaborative Editing & Review Workflows](#2-collaborative-editing--review-workflows)
3. [Clinical Document Builder UX](#3-clinical-document-builder-ux)
4. [Patient Education Portal UX](#4-patient-education-portal-ux)
5. [Medical Documentation Platform Design](#5-medical-documentation-platform-design)
6. [Readability & Health Literacy UX](#6-readability--health-literacy-ux)
7. [Accessibility & Inclusive Design](#7-accessibility--inclusive-design)
8. [Trust, Transparency & Safety UX](#8-trust-transparency--safety-ux)
9. [Neuromodulation Leaflet Standards](#9-neuromodulation-leaflet-standards)
10. [DeepSynaps-Specific UX Recommendations](#10-deepsynaps-specific-ux-recommendations)

---

## 1. Block-Based Document Editor Patterns

### 1.1 The Block Model Architecture

Notion-style block editors represent documents as **typed, hierarchical block trees** rather than flat text. This is fundamentally different from traditional word processors (Google Docs = continuous flowing text).

#### Core Data Model

```javascript
// Flat block-tree representation (Notion's actual approach)
const document = {
  'block-1': { 
    type: 'heading_1', 
    text: 'Treatment Overview', 
    children: ['block-2', 'block-3'],
    properties: { color: 'default', align: 'left' }
  },
  'block-2': { 
    type: 'paragraph', 
    text: 'Your clinician has recommended external neuromodulation (ENM) to help manage your pain.', 
    children: [],
    properties: { bold: false, italic: false }
  },
  'block-3': { 
    type: 'callout', 
    text: 'ENM targets the nerves responsible for your pain and changes how they behave.', 
    children: ['block-4'],
    properties: { icon: 'lightbulb', color: 'blue' }
  },
  'block-4': { 
    type: 'bulleted_list', 
    children: ['block-5', 'block-6'],
    properties: {}
  },
  'block-5': { 
    type: 'list_item', 
    text: 'Non-invasive treatment', 
    children: []
  },
  'block-6': { 
    type: 'list_item', 
    text: 'Battery-operated device', 
    children: []
  }
}
```

#### Key Characteristics

| Attribute | Description | UX Benefit |
|-----------|-------------|------------|
| Unique ID (UUID) | Every block has persistent identifier | Enables drag-reorder, cross-references, sync |
| Typed Blocks | Paragraph, heading, list, callout, image, embed | Rich structured content without complexity |
| Hierarchical Nesting | Children/parent references | Semantic document structure |
| Flat Storage Map | ID-to-block lookup | O(1) insert, delete, move operations |
| Properties Object | Type-specific styling and behavior | Flexible, extensible schema |

### 1.2 Critical Implementation Decisions

#### Decision 1: Rendering Approach — Hybrid Model

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| Pure contenteditable | Free undo/redo, IME support, copy/paste | Cross-browser bugs, hard to control | **Avoid at scale** |
| Custom rendering (React) | Full control over every interaction | Enormous engineering effort for text editing | **Avoid full implementation** |
| **Hybrid** (contenteditable per block + custom structure) | Best of both worlds; manageable complexity | Requires careful boundary handling | **Recommended** |

Notion's approach: contenteditable on individual blocks for text editing; custom-rendered block structure for layout.

#### Decision 2: Real-Time Synchronization — CRDT-Based

For collaborative editing, use **CRDTs (Conflict-free Replicated Data Types)**:
- Separate operations for **text-level** (within a block) and **block-level** (structure changes)
- Each user maintains independent undo stack
- Offline support: local copy stays consistent, syncs on reconnection
- Reference implementations: Yjs, Automerge

#### Decision 3: Slash Commands — Extensible Insertion

```
User types "/" → Command palette appears
  → "/heading 1" → Creates H1 block
  → "/callout" → Creates callout block
  → "/warning" → Creates warning callout block
  → "/procedure" → Creates numbered procedure list
  → "/citation" → Creates citation block with grounding
  → "/image" → Opens image upload dialog
  → "/video" → Embeds video content
  → "/consent" → Inserts consent form block
```

Design requirements:
- **Cursor-positioned palette** — appears at caret location
- **Fuzzy search** — "hdg" matches "heading"
- **Keyboard navigation** — arrow keys + Enter selection
- **Visual preview** — icon + description + usage example
- **Extensibility** — third-party block types via plugin API

#### Decision 4: Block Transformation

```
User types "##" + Space → Paragraph transforms to Heading 2
User types "-" + Space → Paragraph transforms to Bulleted List
User types "1." + Space → Paragraph transforms to Numbered List
User types ">" + Space → Paragraph transforms to Blockquote
```

#### Decision 5: Drag-and-Drop Reordering

- Visual drag handle on hover (six-dot grip icon)
- Drop indicator line between blocks
- Supports multi-block selection and group drag
- Keyboard alternative: Cut + paste at position
- Animated transitions for spatial awareness

### 1.3 Performance at Scale

| Document Size | Technique | Implementation |
|---------------|-----------|---------------|
| 10+ blocks | Normal rendering | Full DOM |
| 100+ blocks | Lightweight virtualization | TanStack Virtual or equivalent |
| 1,000+ blocks | Windowed virtualization | Render only visible blocks + buffer |
| 10,000+ blocks | Variable-height virtualization | Measure and cache block heights; dynamic window |

### 1.4 Block Types for Clinical Handbooks

| Block Type | Clinical Use | Patient Use |
|-----------|-------------|-------------|
| `heading_1` | Section titles | Major topic headings |
| `heading_2` | Subsection titles | Subtopic headings |
| `heading_3` | Detail titles | Specific instruction headings |
| `paragraph` | Body text, explanations | Core educational content |
| `callout_info` | Important notes | "Did you know?" tips |
| `callout_warning` | Risk alerts | Side effect warnings |
| `numbered_list` | Procedure steps | Step-by-step instructions |
| `bulleted_list` | Feature lists | Benefits, expectations |
| `checklist` | Pre-procedure requirements | Self-assessment items |
| `citation_block` | Evidence references | "Learn more" links |
| `image` | Diagrams, anatomical illustrations | Visual explanations |
| `video_embed` | Procedure demonstrations | Treatment walkthroughs |
| `consent_block` | Consent language | Acknowledgment checkboxes |
| `contact_block` | Clinic information | Emergency contacts |
| `divider` | Section separation | Visual breathing room |

### 1.5 Common Implementation Mistakes

| Mistake | Consequence | Solution |
|---------|-------------|----------|
| Treating document as one big string | Loses block semantics, structure, and modularity | Always use block-tree model |
| Pure contenteditable approach | Cross-browser inconsistencies, broken at scale | Use hybrid approach |
| Rendering all blocks to DOM | Performance failure at 10,000+ blocks | Implement virtualization |
| Hardcoded slash command list | No extensibility, rigid product | Plugin architecture from day one |
| No real-time consideration | Cannot support collaborative review | CRDT-based sync |
| Ignoring undo/redo with collaboration | Users lose work during concurrent edits | Per-user undo stacks + CRDTs |
| No offline support | Data loss on network interruption | Local-first architecture |

---

## 2. Collaborative Editing & Review Workflows

### 2.1 Collaborative Review Pattern

```
Draft (Author)
  → Peer Review (Reviewer adds inline comments)
    → Author addresses comments (marks resolved/unresolved)
      → Clinical Review (Medical SME approves content accuracy)
        → QA Review (Compliance officer checks standards)
          → Final Approval (Authorized signatory)
            → Published → Archived
```

### 2.2 Inline Commenting System

| Feature | Implementation |
|---------|---------------|
| Comment anchoring | Attached to specific text range within a block |
| Threaded replies | Nested conversation under each comment |
| Status states | Open → In Progress → Resolved → Reopened |
| @mentions | Notify specific team members |
| Suggestion mode | Proposed edits shown as diff; accept/reject |
| Comment sidebar | Chronological list with block references |
| Notification system | Email/push alerts for mentions and status changes |

### 2.3 Role-Based Permissions

| Role | View | Edit | Comment | Approve | Admin |
|------|------|------|---------|---------|-------|
| **Author** | Yes | Own drafts | On any document | No | No |
| **Reviewer** | Assigned docs | No (suggestions) | Yes | No | No |
| **Medical SME** | All clinical docs | No (suggestions) | Yes | Clinical accuracy | No |
| **Compliance Officer** | All docs | No | Yes | Regulatory compliance | No |
| **Approver** | All docs | No | No | Final sign-off | No |
| **Administrator** | All | Yes | Yes | Override | Yes |

### 2.4 Audit Trail Visualization

```
Timeline View:
[10:15] Dr. Smith created "ENM Patient Handbook v1"
[10:47] Dr. Smith added "Side Effects" section
[14:22] Jane Lee (Medical Writer) added inline comment: "Should we include headache frequency?"
[14:45] Dr. Smith resolved comment: "Added — 15% of patients"
[16:03] Prof. Chen (Clinical Director) approved content accuracy
[09:15] M. Williams (QA) approved for publication
[09:30] Dr. Smith published v1.0
```

### 2.5 Version Control

- Automatic versioning on every save
- Semantic versioning (major.minor.patch)
- Version comparison (diff view)
- Branching for document variants (e.g., adult vs. pediatric versions)
- Rollback capability with full audit trail

---

## 3. Clinical Document Builder UX

### 3.1 EHR Interface Design Principles

#### 14 Principles of User-Friendly EMR/EHR Design

1. **Prioritize critical information** — allergies, urgent results, medication alerts above the fold
2. **Use plain language** — "shortness of breath" not "dyspnea"; "high blood pressure" not "hypertension"
3. **Chunk information** — Break content into short, scannable sections
4. **Progressive disclosure** — Show summary first; detail on demand
5. **Consistent layout** — Same structure across all documents and pages
6. **Dashboard overview** — Summary of key info: upcoming appointments, unread messages, recent results
7. **Contextual actions** — Actions available where the user is working, not buried in menus
8. **Real-time validation** — Flag invalid inputs immediately (e.g., "600" for heart rate)
9. **Clear warnings for critical actions** — Confirmation dialogs for deletion, prescription changes
10. **Easy undo/correction** — Simple correction without starting over
11. **Visual risk indicators** — Color/icons for allergies, interactions, critical results
12. **Inline instructions** — Reduce reliance on memory; show procedural steps
13. **User feedback channel** — Report bugs or suggest improvements directly
14. **Responsive design** — Desktop, tablet, mobile adaptation

### 3.2 Clinical Document Builder Interface

#### Three-Pane Layout

```
+---------------------------------------------------------------+
| HEADER: Document Title | Status | Version | Actions           |
+-------------+------------------------+------------------------+
| LEFT PANEL  |      CENTER EDITOR     |    RIGHT PANEL         |
|             |                        |                        |
| BLOCK LIB   |  [Document Content]    |  PROPERTIES            |
| - Headings  |                        |  - Block type          |
| - Paragraphs|  [Heading]             |  - Styling             |
| - Lists     |  [Paragraph]           |  - Citation            |
| - Callouts  |  [Callout: Warning]    |  - Visibility          |
| - Images    |  [Numbered List]       |                        |
| - Citations |  [Cited evidence]      |  COMMENTS              |
| - Consent   |  [Consent block]       |  - Inline threads      |
|             |                        |  - @mentions           |
| NAVIGATION  |                        |                        |
| - Sections  |                        |  REVIEW STATUS         |
| - Bookmarks |                        |  - Reviewer comments   |
| - Search    |                        |  - Approval chain       |
+-------------+------------------------+------------------------+
| FOOTER: Auto-save status | Readability score | Word count       |
+---------------------------------------------------------------+
```

#### Toolbar Design

| Section | Elements |
|---------|----------|
| Block Insertion | + button, slash command, drag-and-drop library |
| Text Styling | Bold, italic, underline, color, alignment |
| Block Actions | Duplicate, delete, move up/down, indent |
| Clinical Tools | Insert citation, insert warning box, insert consent |
| AI Tools | Simplify text (readability), expand acronyms, generate summary |
| View Controls | Preview mode, review mode, patient view |

### 3.3 Role-Based Interface Adaptation

| Role | Dashboard View | Editor View | Review View |
|------|---------------|-------------|-------------|
| **Author (Clinician)** | My drafts, assigned reviews, recent edits | Full editing with AI assistance | Inline comments, suggestion mode |
| **Medical SME** | Pending clinical reviews | Read-only with comment capability | Clinical accuracy checklist |
| **Compliance** | Pending regulatory reviews | Read-only with regulatory annotations | Compliance checklist (21 CFR Part 11, ICH) |
| **Approver** | Pending approvals | Read-only | Approve/reject with signature |
| **Administrator** | System-wide metrics | Override editing | Full audit trail access |

### 3.4 Error Prevention Patterns

| Pattern | Implementation |
|---------|---------------|
| Input validation | Real-time checking of medical terms, dosages, unit formats |
| Warning confirmations | "This drug interaction is severe. Confirm you want to include it?" |
| Required field indicators | Clear marking of mandatory blocks before approval |
| Template validation | Check that all required sections present before finalization |
| Unsaved changes alert | Warn when navigating away from unsaved work |
| Version conflict detection | Alert when concurrent edits detected; merge options |

---

## 4. Patient Education Portal UX

### 4.1 Core UX Principles for Patient Portals

#### Principle 1: Keep Navigation Simple
- Clear menus with easily labeled sections
- Consistent layout across all pages
- Dashboard overview: upcoming appointments, unread messages, recent results
- Reduce cognitive load: patients use portals under stress or with limited technical knowledge

#### Principle 2: Prioritize Mobile Responsiveness
- Mobile-optimized design with touch-friendly interfaces
- Responsive layouts adapting to different screen sizes
- No hiding of critical information on smaller screens
- Thumb-zone placement for primary actions

#### Principle 3: Make Messaging Clear and Actionable
- Use plain language; avoid medical jargon
- Highlight next steps for each task
- Visual cues: progress bars, icons, step indicators
- Action-oriented headings: "What to do before your appointment"

#### Principle 4: Implement Secure but Seamless Login
- Single sign-on or simplified multi-factor authentication
- Remember devices safely for returning users
- Visual confirmation of secure session
- Biometric options (fingerprint, face recognition) where available

#### Principle 5: Provide Accessible Educational Resources
- Contextual resources linked to test results or conditions
- Multiple formats: text, video, infographic, audio
- Search functionality with predictive suggestions
- Download/print options for offline reference

#### Principle 6: Collect Feedback and Iterate
- In-app quick feedback buttons
- Usage analytics to identify bottlenecks
- Regular updates based on user feedback
- A/B testing for content presentation

### 4.2 Patient Education Document Viewer

#### Layout

```
+-----------------------------------------------------------+
| [Logo]  Document Title                          [Print]   |
+-----------------------------------------------------------+
| Breadcrumb: Home > Neuromodulation > Patient Handbook     |
+------+----------------------------------------------------+
| TOC  |                                                [A] |
|      |  SECTION CONTENT                                  |
| - What|                                                [A] |
| - What|  [Heading: What is ENM Treatment?]               |
| - Side|                                                [A] |
| - Risk|  [Paragraph with plain language]                  |
| - Prep|                                                [A] |
| - What|  [Callout: Important Safety Information]          |
| - Cont|                                                [A] |
|      |  [Numbered List: Procedure Steps]                 |
|      |                                                [A] |
|      |  [Video: What to Expect at Your Appointment]      |
|      |                                                [A] |
|      |  [Citation: Source: NHS Pain Clinic Guidelines]   |
|      |                                                [A] |
+------+----------------------------------------------------+
| Footer: Last updated: [Date] | Version: [x.x] | Feedback |
+-----------------------------------------------------------+
```

#### Accessibility Toolbar `[A]`
- **Text size** (A- / A / A+) — three size options
- **Read aloud** — Text-to-speech for section content
- **Translate** — Language selection dropdown
- **Simplify** — Reduce reading level further (LLM simplification)
- **Print/PDF** — Generate printable version
- **Share** — Secure sharing with caregiver/family

### 4.3 Progressive Disclosure for Medical Content

```
Level 1 (Preview): "ENM uses a small device to send gentle electrical 
pulses to nerves that cause pain."

Level 2 (Summary): [Expand] → 3-4 sentence overview of procedure

Level 3 (Full Detail): [Expand] → Complete explanation including 
duration, sensation, equipment, clinical staff involved

Level 4 (Clinical): [For clinicians — expand] → Technical specifications, 
ICD-10 codes, billing information, protocol variations
```

### 4.4 Interactive Elements for Engagement

| Element | Purpose | Implementation |
|---------|---------|---------------|
| Progress indicator | Show reading position | Top bar or sidebar progress |
| Checklist blocks | Self-assessment | "Have you completed these prep steps?" |
| FAQ accordion | Q&A organization | Expandable question cards |
| Symptom tracker | Patient-reported outcomes | Simple rating scales |
| Appointment prep | Guided preparation | Step-by-step walkthrough |
| Contact quick-access | Easy provider communication | Floating action button |

---

## 5. Medical Documentation Platform Design

### 5.1 Workflow-Centric Design

**Critical insight:** In healthcare, tasks are rarely completed on a single screen. Real value comes from designing **entire workflows** — step-by-step journeys users follow across screens, actions, and contexts.

#### Example: Handbook Creation Workflow

```
Intake: Select handbook template
  → Define: Patient population, device type, language
    → Draft: AI-assisted content generation with SME input
      → Review: Sequential clinical, regulatory, QA review
        → Revise: Author addresses comments
          → Approve: Electronic signature
            → Publish: Distribute to patient portal
              → Monitor: Collect feedback, track comprehension
```

### 5.2 Design for Safety

| Principle | Example Implementation |
|-----------|----------------------|
| Validate inputs in real-time | Flag "600" as invalid heart rate entry |
| Clear warnings for critical actions | Confirm dialog before deleting signed document |
| Prevent errors step-by-step | Highlight required fields; prevent submission if incomplete |
| Easy undo/correction | One-click restore previous version |
| Visually highlight risks | Red banner for allergy alerts; amber for interactions |
| Reduce memory load | Inline instructions and checklists during workflows |

### 5.3 Trust & Transparency Patterns

| Pattern | Implementation |
|---------|---------------|
| Clear data use explanation | "This information is used only to provide personalized care and will never be shared without your consent." |
| Visible privacy controls | Toggle sharing permissions for doctors, nurses, family members |
| Secure authentication | Two-factor auth; fingerprint login; visual confirmation of security |
| Transparent error handling | "Your data is safe. We are fixing this error now." |
| Consistent trust cues | Padlock icons for confidential areas; clear labels for sensitive content |
| AI disclosure | "This content was created with AI assistance and reviewed by your clinical team." |
| Version transparency | Last updated date; version number; changelog link |

### 5.4 Patient-Centric Dashboard Design

```
+---------------------------------------------------------------+
|  Good morning, [Patient Name]        [Notifications] [Profile] |
+---------------------------------------------------------------+
|                                                               |
|  YOUR UPCOMING                                                |
|  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           |
|  | Appointment |  | Appointment |  | Prep Tasks  |           |
|  | May 22      |  | May 29      |  | 3 pending   |           |
|  | 10:00 AM    |  | 10:00 AM    |  |             |           |
|  | ENM Session |  | ENM Session |  | [View all]  |           |
|  └─────────────┘  └─────────────┘  └─────────────┘           |
|                                                               |
|  YOUR EDUCATIONAL MATERIALS                                   |
|  ┌─────────────────────────────────────────────────────┐     |
|  | [Progress: 60%] ENM Patient Handbook                |     |
|  | Continue reading: "What happens during treatment?"  |     |
|  | [Resume reading]  [Mark complete]                   |     |
|  └─────────────────────────────────────────────────────┘     |
|                                                               |
|  QUICK ACTIONS                                                |
|  [View handbook]  [Message clinic]  [Prep checklist]         |
|  [Side effects log]  [Emergency contacts]  [Print PDF]       |
|                                                               |
+---------------------------------------------------------------+
```

---

## 6. Readability & Health Literacy UX

### 6.1 Real-Time Readability Feedback

```
+---------------------------------------------------------------+
| EDITOR                        | READABILITY PANEL              |
|                               |                                |
| What is ENM?                  | FK Grade Level: 5.2  [GREEN]   |
|                               | Flesch Ease: 75      [GREEN]   |
| ENM uses a small device to    | Sentence Length: 12    [GREEN] |
| send gentle electrical        | Medical Terms: 1       [AMBER] |
| pulses to your nerves.        | Active Voice: 95%      [GREEN] |
|                               |                                |
| [This is good! Keep it up.]   | ⚠️ 1 undefined term:           |
|                               | "neuromodulation"              |
|                               | [Add definition] [Replace]     |
+---------------------------------------------------------------+
```

### 6.2 Color-Coded Readability Indicators

| Metric | Green | Amber | Red |
|--------|-------|-------|-----|
| FK Grade Level | <= 6 | 7-8 | > 8 |
| Flesch Reading Ease | >= 70 | 50-69 | < 50 |
| Sentence Length (words) | <= 15 | 16-20 | > 20 |
| Paragraph Length (sentences) | <= 4 | 5-6 | > 6 |
| Active Voice % | >= 80% | 60-79% | < 60% |
| Undefined Medical Terms | 0 | 1-2 | > 2 |

### 6.3 AI Simplification Interface

```
[Original]                                                     
"External neuromodulation (ENM) targets the afferent nerve      
fibres responsible for nociceptive transmission, modifying      
their conductance through the application of transcutaneous     
electrical stimulus."                                           
                                                                 
[Simplify] →                                                    
                                                                 
[Simplified]                                                    
"External neuromodulation (ENM) works on the nerves that        
carry pain signals. It changes how these nerves work by         
putting a small electrical current on your skin."               
                                                                 
Grade: 4.2  |  Flesch Ease: 82  |  All terms defined  [APPLY]  
```

### 6.4 Health Literacy Checklist (Pre-Publication)

- [ ] Purpose of document evident in first paragraph
- [ ] Common, everyday language used throughout
- [ ] All medical terms defined at first use (inline or glossary)
- [ ] Active voice used in > 90% of sentences
- [ ] Information chunked into short sections
- [ ] Informative section headers for scannability
- [ ] Logical sequence of information
- [ ] Summary provided at end
- [ ] Visual cues (bullets, bold, boxes) for key points
- [ ] Large, legible font (minimum 14px for patient materials)
- [ ] Adequate line spacing (1.5x minimum)
- [ ] Sufficient contrast (WCAG AA minimum)
- [ ] Clear action steps identified
- [ ] Barriers to action addressed
- [ ] When to seek help clearly explained
- [ ] Reading level verified at 6th grade or below

---

## 7. Accessibility & Inclusive Design

### 7.1 WCAG 2.1 AA Compliance Requirements

| Principle | Requirement | Implementation |
|-----------|-------------|---------------|
| **Perceivable** | Text alternatives for images | Alt text for all diagrams; aria-labels for icons |
| | Captions/transcripts for media | Video subtitles; audio transcripts |
| | Color not sole information carrier | Icons + color + text for all status indicators |
| | Resizable text to 200% | Relative units (rem, em); no fixed pixel breakpoints |
| | Contrast ratio 4.5:1 minimum | Automated contrast checking in design system |
| **Operable** | Full keyboard navigation | Tab order logical; focus indicators visible |
| | No time limits without control | Save drafts automatically; extendable timeouts |
| | Seizure prevention | No flashing content > 3Hz |
| | Navigable by assistive tech | ARIA landmarks; heading hierarchy correct |
| **Understandable** | Readable text | Plain language; reading level 6th grade |
| | Predictable behavior | Consistent navigation, layout, and labeling |
| | Input assistance | Error identification, suggestions, prevention |
| **Robust** | Compatible with assistive tech | Valid HTML; ARIA roles correct |
| | Screen reader support | All interactive elements labeled |

### 7.2 Screen Reader Optimization

```html
<!-- Proper heading hierarchy -->
<h1>External Neuromodulation Patient Handbook</h1>
<h2>What is ENM Treatment?</h2>
<h3>During Your Appointment</h3>

<!-- Accessible callout block -->
<div role="note" aria-label="Warning: Side Effects">
  <span aria-hidden="true">⚠️</span>
  <strong>Warning:</strong> Some patients may experience 
  temporary mild discomfort.
</div>

<!-- Citation link with accessible label -->
<a href="#source-1" aria-label="View source: NHS Pain Clinic 
   Guidelines, 2024">
  [1]
</a>
```

### 7.3 Multi-Device Adaptation

| Device | Key UX Considerations |
|--------|----------------------|
| **Desktop (1920px+)** | Three-pane layout; full toolbar; drag-and-drop reordering |
| **Laptop (1366px)** | Collapsible side panels; condensed toolbar |
| **Tablet (768px)** | Touch-optimized block handles; simplified navigation |
| **Mobile (375px)** | Single-column; bottom sheet for block insertion; swipe gestures |

### 7.4 Language & Cultural Adaptation

- Right-to-left (RTL) language support (Arabic, Hebrew)
- Multi-language interface (toggle, not auto-detect)
- Culturally appropriate imagery and examples
- Date, time, and unit localization
- Gender-inclusive language options

---

## 8. Trust, Transparency & Safety UX

### 8.1 AI Disclosure Pattern

```
+---------------------------------------------------------------+
|  AI-Assisted Content Indicator                                |
|  ┌─────────────────────────────────────────────────────┐     |
|  | 🤖  This document was created with AI assistance      |     |
|  |     and reviewed by your clinical team.               |     |
|  |                                                     |     |
|  |     [View human reviewers] [Report an issue]         |     |
|  |                                                     |     |
|  |     Reviewed by: Dr. Smith (Pain Specialist)        |     |
|  |     Last reviewed: May 15, 2026                     |     |
|  |     Version: 2.1                                    |     |
|  └─────────────────────────────────────────────────────┘     |
+---------------------------------------------------------------+
```

### 8.2 Confidence & Evidence Transparency

```
[Generated Content]
"ENM treatment typically lasts 5 minutes per area."

[Citation Bar]
📎 Source: NHS Pain Clinic Protocol v3.2 (2025)
✅ Verified against 3 independent sources
🕐 Last verified: May 10, 2026

[Confidence: HIGH] [View evidence] [Dispute claim]
```

### 8.3 Patient Consent UX

```
+---------------------------------------------------------------+
|  Consent for AI-Generated Information                         |
|                                                               |
|  Before viewing this AI-assisted patient handbook:            |
|                                                               |
|  ☐ I understand this content was created with AI             |
|    assistance and has been reviewed by clinical staff         |
|                                                               |
|  ☐ I understand I should discuss any questions with my       |
|    healthcare provider                                        |
|                                                               |
|  ☐ I know I can request a fully human-created version        |
|                                                               |
|  [I consent and continue]  [Request human-only version]      |
|                                                               |
|  Your consent is saved in your record and can be updated     |
|  at any time in your profile settings.                        |
+---------------------------------------------------------------+
```

### 8.4 Emergency & Safety UX

| Scenario | UX Pattern |
|----------|-----------|
| Emergency contact needed | Always-visible floating button; one-tap dial |
| Adverse event reporting | Prominent "Report a problem" link in footer |
| Content accuracy concern | "Flag for review" on every block; simple form |
| Suicidal ideation detection | Immediate crisis resources overlay |
| Data breach concern | Clear incident reporting pathway; transparent communication |

---

## 9. Neuromodulation Leaflet Standards

### 9.1 NHS Patient Information Leaflet Structure

Based on analysis of NHS neuromodulation leaflets (rTMS, Sacral Neuromodulation, External Neuromodulation):

#### Standard Section Order

1. **Welcome/Introduction**
   - Purpose of the leaflet
   - "You are welcome to bring a family member or friend"
   - Invitation to ask questions

2. **What is [Treatment]?**
   - Definition in plain language
   - How it works at a high level
   - What condition it treats
   - NICE/FDA approval status

3. **What happens during treatment?**
   - Step-by-step procedure description
   - Duration of each session
   - Sensations to expect
   - Who performs the treatment

4. **Safety & Side Effects**
   - Common side effects (with frequency if known)
   - Rare but serious risks
   - Precautions (metalwork, pacemakers, pregnancy)
   - When to contact clinic

5. **What to expect after treatment**
   - Immediate aftercare
   - Activity restrictions (if any)
   - Timeline for results
   - Follow-up schedule

6. **Alternatives**
   - Other treatment options available
   - Option to do nothing
   - Risk/benefit context

7. **Consent**
   - Right to withdraw at any time
   - Consent checking before every session
   - Alternative treatments discussion

8. **Contact Information**
   - Clinic phone number
   - Email (with out-of-hours warning)
   - Emergency contacts (NHS 111, A&E)
   - Website links

9. **Format Options**
   - Alternative formats statement
   - Language translation availability
   - Large print options

### 9.2 NHS Neuromodulation Leaflet Analysis

#### Caldicott Guardian & Governance
- CQC registration statement
- NHS governance policies compliance
- Data protection transparency

#### Content Characteristics
- A4 format, 2-page standard (front and back)
- Version number and review date on every page
- Trust logo and branding
- Multi-language availability statement
- Smoke-free trust statement (where applicable)

#### Tone & Language
- Calm, reassuring, authoritative
- Second person ("you") throughout
- Conditional reassurance ("most people report...")
- Clear distinction between common and rare side effects
- Honest about uncertainty ("tends to vary from person to person")

### 9.3 Specific Content Requirements

#### For rTMS (Repetitive Transcranial Magnetic Stimulation)
- Seizure risk quantification (1:30,000)
- Headache as most common side effect
- No anesthesia requirement
- Ability to drive and eat/drink normally
- Number of sessions (20-30 typical)
- Duration per session (under 40 minutes)
- What to do in mental health crisis

#### For Sacral Neuromodulation (SNM)
- Two-phase process (test phase + permanent implant)
- Device company information (Medtronic, Axonics)
- Battery life (15-20 years rechargeable, 10 years non-rechargeable)
- Controller usage instructions
- Device handling restrictions (driving, bending, lifting)
- Dressing care (do not get wet)
- Diary completion requirement
- Bladder/bowel diary importance

#### For External Neuromodulation (ENM)
- Non-invasive nature emphasized
- Initial course (2 or 4 appointments)
- 5 minutes per area treated
- Skin reaction screening
- Minor side effects (burning, temporary numbness, mild weakness)
- Pain relief duration (hours to weeks)
- Continuation of usual pain medication

### 9.4 DeepSynaps Neuromodulation Handbook UX Specification

#### Document Template Structure

```
Cover Page
├── Device name + image
├── Patient population
├── Version + date
├── Clinic branding
├── "AI-assisted, clinician-reviewed" badge

Section 1: About Your Treatment
├── What is [Device]?
├── How does it work? (visual diagram)
├── Is it right for me? (eligibility)
└── Approval status (NICE/FDA)

Section 2: Before Your Treatment
├── Pre-appointment checklist
├── What to bring
├── Medication instructions
├── Travel/driving guidance
└── Questions to ask your clinician

Section 3: During Your Treatment
├── Step-by-step walkthrough
├── What you will feel
├── Duration
├── Who will be there
└── [Video embed: procedure walkthrough]

Section 4: Safety Information
├── Common side effects (with % if known)
├── Rare/serious risks
├── Precautions & contraindications
├── When to contact clinic
├── When to seek emergency care
└── [Warning callout for serious risks]

Section 5: After Your Treatment
├── Immediate aftercare
├── Activity guidelines
├── Pain relief expectations
├── Follow-up schedule
├── Device maintenance (if applicable)
└── [Checklist: post-treatment self-care]

Section 6: Living With Your Device (for implants)
├── Device management
├── Battery/charging instructions
├── Activity restrictions
├── MRI compatibility
├── Travel considerations
├── [Contact block for device support]

Section 7: Frequently Asked Questions
├── Organized by topic
├── Expandable accordion format
└── [Feedback: "Was this helpful?"]

Section 8: Your Rights & Consent
├── Right to withdraw
├── Consent process
├── Alternative treatments
├── Data use explanation
├── AI disclosure
└── [Consent acknowledgment block]

Section 9: Contact & Support
├── Clinic contact details
├── Device manufacturer support
├── Emergency contacts
├── Support groups
├── Further reading
└── [Print/PDF download button]

Appendix
├── Glossary of terms
├── References & citations
├── Version history
├── Accessibility statement
└── Feedback form
```

---

## 10. DeepSynaps-Specific UX Recommendations

### 10.1 Editor UX Benchmark Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first block insertion | < 3 seconds | From page load to first content |
| Block insertion speed | < 200ms | Slash command to rendered block |
| Document load (100 blocks) | < 1 second | Time to interactive |
| Collaborative sync latency | < 150ms | Remote edit to local display |
| Readability score update | Real-time (< 100ms) | After every edit |
| Undo/redo response | < 50ms | Immediate feedback |
| Mobile editor usability | > 85 SUS score | System Usability Scale |
| Accessibility score | 100% Lighthouse | Automated a11y testing |

### 10.2 Block Editor Interaction Patterns

#### Pattern: Smart Block Creation
```
User types: "Side effects of ENM include headache and skin irritation"

[AI Assistant Suggestion]
┌──────────────────────────────────────────────────────────┐
| I can structure this as:                                  |
|                                                          |
| [Heading: Side Effects]                                   |
| [Paragraph: Side effects of ENM include...]              |
| [Bulleted List:                                           |
|   • Headache                                              |
|   • Skin irritation]                                      |
|                                                          |
| [Apply] [Modify] [Dismiss]                                |
└──────────────────────────────────────────────────────────┘
```

#### Pattern: Citation-Aware Editing
```
User edits a cited sentence → System highlights:
┌──────────────────────────────────────────────────────────┐
| ⚠️ This edit affects a statement with 2 citations.       |
|    Citations will be detached unless verified.            |
|                                                          |
| [Keep citations — will flag for re-verification]          |
| [Remove citations — statement no longer sourced]          |
| [Cancel edit]                                             |
└──────────────────────────────────────────────────────────┘
```

#### Pattern: Readability Guardrails
```
User types a complex medical sentence:
"Neuromodulation therapeutics effectuate nociceptive pathway 
modulation via afferent fiber depolarization."

[System Response]
┌──────────────────────────────────────────────────────────┐
| 🔴 Grade Level: 18.4 | Flesch Ease: 2 (Very Difficult)   |
|                                                          |
| [Simplify for patients] →                                |
| "The treatment works on the nerves that carry pain       |
|  signals, changing how they send messages."              |
|                                                          |
| [Simplify for clinicians] →                              |
| "ENM modulates afferent nociceptive pathways."           |
|                                                          |
| [Keep original — add definition]                         |
└──────────────────────────────────────────────────────────┘
```

### 10.3 Patient-Facing Handbook Viewer

#### Key UX Features

| Feature | Description | Priority |
|---------|-------------|----------|
| Progress tracking | Visual progress bar; bookmark position | P0 |
| Audio narration | TTS for entire handbook or per section | P1 |
| Interactive glossary | Tap/click any medical term for definition | P0 |
| Print-optimized layout | Clean, ink-friendly formatting | P1 |
| Offline access | PWA with service worker caching | P2 |
| Font customization | Size, line spacing, font family | P1 |
| Color themes | Light, dark, high-contrast | P1 |
| Section sharing | Generate shareable link to specific section | P2 |
| Feedback per section | "Was this helpful?" thumbs up/down | P0 |
| Personal notes | Allow patients to add private annotations | P2 |
| Checklist tracking | Interactive completion for prep steps | P1 |
| Emergency quick-access | Always-visible emergency button | P0 |

### 10.4 Design System Tokens

#### Typography (Health-Optimized)

| Token | Value | Usage |
|-------|-------|-------|
| `font-family-body` | system-ui, -apple-system, sans-serif | Body text |
| `font-size-base` | 16px (1rem) | Minimum body text |
| `font-size-large` | 18px (1.125rem) | Large text option |
| `font-size-xlarge` | 20px (1.25rem) | Accessibility large |
| `line-height-body` | 1.6 | Body paragraphs |
| `line-height-heading` | 1.2 | Headings |
| `font-weight-normal` | 400 | Body |
| `font-weight-semibold` | 600 | Emphasis, labels |
| `font-weight-bold` | 700 | Headings, warnings |

#### Color System

| Token | Value | Usage |
|-------|-------|-------|
| `color-primary` | #0066CC | Primary actions, links |
| `color-success` | #2E7D32 | Positive feedback, verified |
| `color-warning` | #ED6C02 | Caution, needs review |
| `color-error` | #D32F2F | Errors, serious risks |
| `color-info` | #0288D1 | Informational callouts |
| `color-bg-paper` | #FFFFFF | Content background |
| `color-bg-surface` | #F5F5F5 | Cards, sidebars |
| `color-text-primary` | #212121 | Primary text |
| `color-text-secondary` | #616161 | Secondary text |

#### Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `space-xs` | 4px | Tight gaps |
| `space-sm` | 8px | Related elements |
| `space-md` | 16px | Standard padding |
| `space-lg` | 24px | Section separation |
| `space-xl` | 32px | Major sections |
| `space-xxl` | 48px | Page-level spacing |

#### Shadows & Elevation

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-card` | 0 1px 3px rgba(0,0,0,0.12) | Cards, blocks |
| `shadow-elevated` | 0 4px 6px rgba(0,0,0,0.1) | Modals, popovers |
| `shadow-focus` | 0 0 0 3px rgba(0,102,204,0.3) | Focus states |

### 10.5 Implementation Priorities

| Phase | Feature | Timeline | Regulatory Driver |
|-------|---------|----------|-------------------|
| **MVP** | Block editor with core types (heading, paragraph, list, callout) | Week 1-2 | Core functionality |
| **MVP** | Sequential review workflow (Author → SME → Approver) | Week 3-4 | 21 CFR Part 11, ICH E6 |
| **MVP** | Audit trail with electronic signatures | Week 3-4 | 21 CFR Part 11 |
| **MVP** | Real-time readability scoring | Week 2 | AMA/NIH standards |
| **MVP** | Patient viewer with accessibility toolbar | Week 4 | WCAG 2.1 AA, EAA |
| **V1.1** | AI-assisted content generation with citation grounding | Week 5-6 | GMLP, EU AI Act |
| **V1.1** | Collaborative inline commenting | Week 5-6 | GCP workflow |
| **V1.1** | Video embed and interactive glossary | Week 6 | Patient engagement |
| **V1.2** | Mobile-responsive editor | Week 7-8 | Mobile access |
| **V1.2** | Multi-language support | Week 7-8 | NHS standards |
| **V1.3** | Patient progress tracking & feedback | Week 9-10 | Quality improvement |
| **V1.3** | Offline PWA support | Week 9-10 | Reliability |
| **V2.0** | Advanced AI features (simplification, translation) | Month 3+ | Health literacy |
| **V2.0** | Analytics dashboard | Month 3+ | Continuous improvement |

---

## Appendices

### Appendix A: Reference Implementations

| Project | Type | Relevance |
|---------|------|-----------|
| ProseMirror | Rich text editor framework | Influenced Notion's design; extensible |
| Slate.js | Rich text editor framework | Customizable, React-based |
| Yjs | CRDT library | Real-time collaborative editing |
| Automerge | CRDT library | Local-first data synchronization |
| TanStack Virtual | Virtualization | Performance at scale |
| TipTap | Headless editor | Block-based editing on ProseMirror |

### Appendix B: Accessibility Checklist

- [ ] WCAG 2.1 AA compliance (all principles)
- [ ] Screen reader navigation (headings, landmarks, labels)
- [ ] Keyboard-only operation (tab, arrow, enter, escape)
- [ ] Color contrast 4.5:1 minimum (automated testing)
- [ ] Text resizing to 200% without loss
- [ ] Focus indicators visible and logical
- [ ] Alt text for all images and diagrams
- [ ] Captions for all video content
- [ ] ARIA roles correct and complete
- [ ] Form labels associated with inputs
- [ ] Error messages clear and actionable
- [ ] Skip navigation links
- [ ] Consistent navigation and identification
- [ ] Time limits can be extended
- [ ] No content that flashes > 3Hz

### Appendix C: Patient Education Material Assessment Tools

| Tool | Purpose | Domains |
|------|---------|---------|
| PEMAT-P | Printable materials | Understandability (13 items), Actionability (4 items) |
| PEMAT-A/V | Audiovisual materials | Understandability (13 items), Actionability (4 items) |
| SAM | Suitability assessment | Content, Literacy, Graphics, Layout, Learning, Culture |
| DISCERN | Quality/credibility | Reliability, Treatment choices (16 items) |
| FKGL | Reading level | Grade level (automated) |
| AHRQ | Health literacy | Comprehensive assessment suite |

---

*This handbook is a living document. Update quarterly based on user feedback, regulatory changes, and emerging UX research.*
