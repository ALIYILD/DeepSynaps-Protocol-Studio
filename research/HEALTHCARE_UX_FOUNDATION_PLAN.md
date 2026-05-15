# Healthcare UX Foundation Plan

## Document Metadata

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Status | Active |
| Last Updated | 2026-05-14 |
| Author | DeepSynaps UX Architecture Team |
| Reviewers | Clinical Safety Board, Accessibility Committee |
| Target Audience | Frontend Engineers, UX Designers, Product Managers, QA Engineers |
| Related Documents | SIDEBAR_INFORMATION_ARCHITECTURE.md, ROLE_AWARE_NAVIGATION_MATRIX.md |

---

## Table of Contents

1. [Design System](#design-system)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing System](#spacing-system)
5. [Component Library](#component-library)
6. [Safety UX Layer](#safety-ux-layer)
7. [Responsive Breakpoints](#responsive-breakpoints)
8. [Accessibility](#accessibility)
9. [Animation & Motion](#animation--motion)
10. [Icons](#icons)
11. [Data Visualization](#data-visualization)
12. [Forms & Inputs](#forms--inputs)
13. [Feedback & Notifications](#feedback--notifications)
14. [Tables & Data Grids](#tables--data-grids)
15. [Modals & Overlays](#modals--overlays)
16. [Navigation Patterns](#navigation-patterns)
17. [Loading States](#loading-states)
18. [Empty States](#empty-states)
19. [Error Handling](#error-handling)
20. [Print Styles](#print-styles)
21. [Dark Mode](#dark-mode)
22. [Appendices](#appendices)

---

## Design System

### Philosophy

The DeepSynaps Healthcare UX Foundation is built on the principle that clinical software must be simultaneously powerful and invisible. The design system prioritizes:

1. **Clinical efficiency** - Minimize clicks to complete common tasks
2. **Cognitive ergonomics** - Reduce mental load through consistent patterns
3. **Safety prominence** - Safety-critical information is always visible
4. **Accessibility first** - WCAG 2.1 AA compliance is mandatory, not optional
5. **Calm confidence** - The interface feels stable, reliable, and trustworthy

### Design Tokens

Design tokens are the atomic values that define the visual language of the platform. They ensure consistency across all components and enable theming.

| Token Category | Count | Usage |
|---------------|-------|-------|
| Colors | 45+ | All visual elements |
| Typography | 20+ | Text hierarchy |
| Spacing | 25+ | Layout and component spacing |
| Shadows | 8 | Elevation and depth |
| Borders | 6 | Component boundaries |
| Radii | 6 | Corner rounding |
| Transitions | 12 | Animation timing |
| Z-index | 10 | Layer management |

### Token Naming Convention

```
{category}-{property}-{variant}-{state}

Examples:
--color-primary-default
--color-primary-hover
--color-primary-active
--color-primary-disabled
--spacing-component-medium
--typography-heading-large
```

---

## Color System

### Primary Palette

| Name | Hex | RGB | Usage | Contrast on White |
|------|-----|-----|-------|-------------------|
| Primary (Teal) | #007a7a | rgb(0,122,122) | Primary actions, active states, links | 4.6:1 (AA) |
| Primary Dark | #005f5f | rgb(0,95,95) | Hover states, emphasis | 5.8:1 (AA) |
| Primary Light | #e6f3f3 | rgb(230,243,243) | Backgrounds, highlights | - |
| Primary Muted | #4a9d9d | rgb(74,157,157) | Secondary accents | 3.8:1 (Large) |

### Neutral Palette

| Name | Hex | Usage |
|------|-----|-------|
| Dark | #1a1a1a | Primary text, headings |
| Grey 800 | #333333 | Secondary text |
| Grey 700 | #555555 | Body text |
| Grey 600 | #777777 | Placeholder text |
| Grey 500 | #999999 | Disabled text, borders |
| Grey 400 | #bbbbbb | Light borders, dividers |
| Grey 300 | #dddddd | Separators |
| Grey 200 | #eeeeee | Subtle backgrounds |
| Grey 100 | #f5f5f5 | Background tints |
| White | #ffffff | Card backgrounds, inputs |

### Semantic Colors

| Name | Hex | RGB | Usage | Contrast on White |
|------|-----|-----|-------|-------------------|
| Success | #2d8a4e | rgb(45,138,78) | Success states, positive results | 4.5:1 (AA) |
| Success Light | #e8f5ed | rgb(232,245,237) | Success backgrounds | - |
| Danger | #c0392b | rgb(192,57,43) | Errors, critical alerts, abnormal results | 5.2:1 (AA) |
| Danger Light | #fceeee | rgb(252,238,238) | Error backgrounds | - |
| Warning | #e67e22 | rgb(230,126,34) | Warnings, caution, pending | 3.1:1 (Large) |
| Warning Light | #fef5e8 | rgb(254,245,232) | Warning backgrounds | - |
| Info | #3498db | rgb(52,152,219) | Information, notices | 3.6:1 (Large) |
| Info Light | #eaf2fa | rgb(234,242,250) | Info backgrounds | - |

### Accent Colors

| Name | Hex | Usage |
|------|-----|-------|
| Amber | #c9a227 | Beta badges, premium features |
| Amber Light | #fdf8e8 | Beta backgrounds |
| Purple | #7b68ee | AI features, intelligence tools |
| Purple Light | #f0edfc | AI feature backgrounds |
| Rose | #e11d48 | Urgent alerts, high priority |
| Rose Light | #fef1f2 | Urgent backgrounds |

### Background Colors

| Name | Hex | Usage |
|------|-----|-------|
| Page Background | #f5f5f0 | Main application background (warm grey) |
| Card Background | #ffffff | Card and panel backgrounds |
| Sidebar Background | #ffffff | Sidebar background |
| Header Background | #ffffff | Top navigation background |
| Overlay Background | rgba(0,0,0,0.5) | Modal and overlay backdrops |
| Elevated Background | #fafaf8 | Elevated surfaces |

### Safety Color Coding

Safety colors are used consistently across the platform to indicate clinical states:

| State | Color | Icon | Pattern |
|-------|-------|------|---------|
| Normal | Success green | check-circle | Solid fill |
| Abnormal | Danger red | alert-circle | Solid fill |
| Borderline | Warning amber | alert-triangle | Outline |
| Critical | Danger red + pulse | alert-octagon | Pulsing animation |
| Pending | Info blue | clock | Outline |
| Requires Review | Purple | eye | Dashed border |
| Not Available | Grey 500 | minus-circle | Muted |

### Color Usage Rules

| Rule | Description |
|------|-------------|
| 60-30-10 | 60% neutrals, 30% primary, 10% accent |
| Color for meaning | Color always conveys information, never decoration |
| Minimum contrast | 4.5:1 for text, 3:1 for large text and UI components |
| Red for critical | Red (#c0392b) reserved for safety-critical alerts only |
| Amber for beta | Amber (#c9a227) exclusively for beta/preview indicators |
| Purple for AI | Purple (#7b68ee) exclusively for AI-generated content |

### CSS Variables

```css
:root {
  /* Primary */
  --color-primary: #007a7a;
  --color-primary-dark: #005f5f;
  --color-primary-light: #e6f3f3;
  --color-primary-muted: #4a9d9d;

  /* Neutral */
  --color-dark: #1a1a1a;
  --color-grey-800: #333333;
  --color-grey-700: #555555;
  --color-grey-600: #777777;
  --color-grey-500: #999999;
  --color-grey-400: #bbbbbb;
  --color-grey-300: #dddddd;
  --color-grey-200: #eeeeee;
  --color-grey-100: #f5f5f5;
  --color-white: #ffffff;

  /* Semantic */
  --color-success: #2d8a4e;
  --color-success-light: #e8f5ed;
  --color-danger: #c0392b;
  --color-danger-light: #fceeee;
  --color-warning: #e67e22;
  --color-warning-light: #fef5e8;
  --color-info: #3498db;
  --color-info-light: #eaf2fa;

  /* Accent */
  --color-amber: #c9a227;
  --color-amber-light: #fdf8e8;
  --color-purple: #7b68ee;
  --color-purple-light: #f0edfc;
  --color-rose: #e11d48;
  --color-rose-light: #fef1f2;

  /* Backgrounds */
  --color-bg-page: #f5f5f0;
  --color-bg-card: #ffffff;
  --color-bg-sidebar: #ffffff;
  --color-bg-elevated: #fafaf8;

  /* Sidebar */
  --sidebar-active-bg: rgba(0, 122, 122, 0.1);
  --sidebar-active-border: #007a7a;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.08);
  --shadow-lg: 0 4px 16px rgba(0,0,0,0.1);
  --shadow-xl: 0 8px 32px rgba(0,0,0,0.12);

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;
}
```

---

## Typography

### Font Stack

| Purpose | Stack | Fallback |
|---------|-------|----------|
| Body | system-ui, -apple-system, sans-serif | sans-serif |
| Headings | system-ui, -apple-system, sans-serif | sans-serif |
| Mono (data) | "SF Mono", Monaco, monospace | monospace |
| Mono (code) | "Fira Code", "Source Code Pro", monospace | monospace |

### Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| display | 32px | 700 | 1.2 | -0.5px | Page titles, major headings |
| heading-xl | 24px | 600 | 1.3 | -0.3px | Section headers |
| heading-lg | 20px | 600 | 1.3 | -0.2px | Card titles |
| heading-md | 18px | 600 | 1.4 | -0.1px | Subsection headers |
| heading-sm | 16px | 600 | 1.4 | 0 | Panel titles |
| heading-xs | 14px | 600 | 1.4 | 0 | Small headings |
| body-lg | 16px | 400 | 1.6 | 0 | Primary body text |
| body-md | 14px | 400 | 1.5 | 0 | Standard body text |
| body-sm | 13px | 400 | 1.5 | 0 | Secondary text |
| body-xs | 12px | 400 | 1.4 | 0 | Captions, metadata |
| label | 12px | 500 | 1.4 | 0.3px | Form labels (uppercase) |
| button | 14px | 500 | 1 | 0.2px | Button text |
| badge | 11px | 600 | 1 | 0.3px | Badge text (uppercase) |
| mono-lg | 15px | 400 | 1.5 | 0 | Data values |
| mono-md | 13px | 400 | 1.4 | 0 | Data labels |
| mono-sm | 12px | 400 | 1.4 | 0 | Small data values |

### Typography Usage

```css
.text-display {
  font-size: 32px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.5px;
  color: var(--color-dark);
}

.text-heading-xl {
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.3px;
  color: var(--color-dark);
}

.text-body-lg {
  font-size: 16px;
  font-weight: 400;
  line-height: 1.6;
  color: var(--color-grey-700);
}

.text-mono-lg {
  font-family: "SF Mono", Monaco, monospace;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-dark);
}
```

### Text Contrast Requirements

| Context | Minimum Ratio | Target |
|---------|--------------|--------|
| Body text (< 18px) | 4.5:1 | 7:1 (AAA) |
| Large text (>= 18px) | 3:1 | 4.5:1 (AA) |
| UI components | 3:1 | 4.5:1 (AA) |
| Disabled text | No minimum | 3:1 (informative) |

---

## Spacing System

### Base Unit

The base spacing unit is **4px**. All spacing values are multiples of this unit.

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| space-0 | 0 | 0px | None |
| space-1 | 0.25 | 4px | Tightest spacing |
| space-2 | 0.5 | 8px | Tight spacing |
| space-3 | 0.75 | 12px | Small spacing |
| space-4 | 1 | 16px | Default spacing |
| space-5 | 1.25 | 20px | Medium spacing |
| space-6 | 1.5 | 24px | Large spacing |
| space-8 | 2 | 32px | Section spacing |
| space-10 | 2.5 | 40px | Large section spacing |
| space-12 | 3 | 48px | Extra large spacing |
| space-16 | 4 | 64px | Page-level spacing |
| space-20 | 5 | 80px | Major section spacing |
| space-24 | 6 | 96px | Maximum spacing |

### Layout Dimensions

| Component | Width | Notes |
|-----------|-------|-------|
| Sidebar (expanded) | 240px | Full navigation |
| Sidebar (collapsed) | 56px | Icon only |
| Sidebar (mobile) | 280px | Touch-optimized |
| Top navigation | 100% | Full width |
| Content max-width | 1440px | Centered layout |
| Content padding | 24px | Horizontal page padding |

### Component Spacing

| Component | Padding | Gap |
|-----------|---------|-----|
| Card | 16px | - |
| Card section | - | 16px |
| Button (default) | 8px 16px | - |
| Button (large) | 12px 24px | - |
| Button (small) | 6px 12px | - |
| Input | 10px 12px | - |
| Badge | 2px 8px | - |
| Table cell | 12px 16px | - |
| List item | 8px 0 | - |
| Section divider | - | 8px |
| Form group | - | 16px |
| Modal padding | 24px | - |

### Sidebar Item Dimensions

| Element | Height | Padding | Notes |
|---------|--------|---------|-------|
| Section header | 32px | 0 16px | Uppercase, letter-spaced |
| Nav item | 40px | 10px 16px | Comfortable click target |
| Nav item (mobile) | 48px | 12px 16px | Touch-optimized |
| Child item | 36px | 8px 16px 8px 40px | Indented |
| Sidebar search | 40px | 0 12px | Compact search input |
| Sidebar footer | 56px | 12px 16px | User profile area |

---

## Component Library

### Card

```css
.card {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg); /* 8px */
  box-shadow: var(--shadow-sm); /* 0 1px 2px rgba(0,0,0,0.05) */
  padding: var(--space-4); /* 16px */
  border: 1px solid var(--color-grey-200);
  transition: box-shadow 0.2s ease;
}

.card:hover {
  box-shadow: var(--shadow-md); /* 0 2px 8px rgba(0,0,0,0.08) */
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-grey-200);
}

.card-title {
  font-size: var(--text-heading-sm);
  font-weight: 600;
  color: var(--color-dark);
}
```

**Card Variants:**
| Variant | Additional Styles | Usage |
|---------|-------------------|-------|
| Default | shadow-sm, border | Standard content |
| Elevated | shadow-md | Highlighted content |
| Flat | no shadow, border only | Dense layouts |
| Safety | left border semantic color | Safety-critical content |
| Info | background semantic light | Information panels |

### Button

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: var(--radius-md); /* 6px */
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.2px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.btn-primary:hover {
  background: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
}

.btn-secondary {
  background: white;
  color: var(--color-grey-700);
  border-color: var(--color-grey-300);
}

.btn-secondary:hover {
  background: var(--color-grey-100);
  border-color: var(--color-grey-400);
}

.btn-danger {
  background: var(--color-danger);
  color: white;
  border-color: var(--color-danger);
}

.btn-ghost {
  background: transparent;
  color: var(--color-grey-700);
  border-color: transparent;
}

.btn-ghost:hover {
  background: var(--color-grey-100);
}
```

**Button Sizes:**
| Size | Padding | Font | Height | Usage |
|------|---------|------|--------|-------|
| Small | 6px 12px | 12px | 28px | Table actions, compact |
| Default | 8px 16px | 14px | 36px | Standard actions |
| Large | 12px 24px | 16px | 44px | Primary CTAs |

**Button States:**
| State | Visual |
|-------|--------|
| Default | Base styles |
| Hover | Darkened 10%, cursor pointer |
| Active | Darkened 15%, inset shadow |
| Focus | 2px outline, offset 2px |
| Disabled | Opacity 0.5, no pointer events |
| Loading | Spinner replaces icon, disabled |

### Badge

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-full); /* 12px */
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  line-height: 1.4;
}

.badge-beta {
  background: var(--color-amber-light);
  color: var(--color-amber);
}

.badge-preview {
  background: var(--color-info-light);
  color: var(--color-info);
}

.badge-coming-soon {
  background: var(--color-grey-100);
  color: var(--color-grey-500);
}

.badge-status-active {
  background: var(--color-success-light);
  color: var(--color-success);
}

.badge-status-warning {
  background: var(--color-warning-light);
  color: var(--color-warning);
}

.badge-status-danger {
  background: var(--color-danger-light);
  color: var(--color-danger);
}
```

### Input

```css
.input {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-md); /* 6px */
  border: 1px solid var(--color-grey-300);
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-dark);
  background: var(--color-white);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input:hover {
  border-color: var(--color-grey-400);
}

.input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(0, 122, 122, 0.15);
  outline: none;
}

.input::placeholder {
  color: var(--color-grey-500);
}

.input:disabled {
  background: var(--color-grey-100);
  color: var(--color-grey-500);
  cursor: not-allowed;
}

.input-error {
  border-color: var(--color-danger);
  background: var(--color-danger-light);
}

.input-error:focus {
  box-shadow: 0 0 0 3px rgba(192, 57, 43, 0.15);
}
```

### Select

```css
.select {
  appearance: none;
  background-image: url("data:image/svg+xml,..."); /* Chevron down */
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}
```

### Checkbox & Radio

```css
.checkbox {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  border: 2px solid var(--color-grey-400);
  cursor: pointer;
  transition: all 0.15s ease;
}

.checkbox:checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox:focus {
  box-shadow: 0 0 0 3px rgba(0, 122, 122, 0.15);
}
```

### Toggle Switch

```css
.toggle {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: var(--color-grey-300);
  position: relative;
  cursor: pointer;
  transition: background 0.2s ease;
}

.toggle:checked {
  background: var(--color-primary);
}

.toggle::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  top: 2px;
  left: 2px;
  transition: transform 0.2s ease;
}

.toggle:checked::after {
  transform: translateX(18px);
}
```

### Tooltip

```css
.tooltip {
  position: absolute;
  padding: 6px 10px;
  background: var(--color-dark);
  color: white;
  font-size: 12px;
  border-radius: var(--radius-md);
  white-space: nowrap;
  z-index: 1000;
  pointer-events: none;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.tooltip.visible {
  opacity: 1;
  transform: translateY(0);
}

.tooltip::before {
  content: '';
  position: absolute;
  border: 5px solid transparent;
}
```

### Divider

```css
.divider {
  height: 1px;
  background: var(--color-grey-200);
  margin: var(--space-4) 0;
}

.divider-vertical {
  width: 1px;
  height: 100%;
  background: var(--color-grey-200);
}
```

---

## Safety UX Layer

### Safety Banner

A persistent safety banner at the top of the application displays critical safety information.

```css
.safety-banner {
  width: 100%;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.safety-banner-critical {
  background: var(--color-danger);
  color: white;
}

.safety-banner-warning {
  background: var(--color-warning-light);
  color: var(--color-warning);
  border-bottom: 1px solid var(--color-warning);
}

.safety-banner-info {
  background: var(--color-info-light);
  color: var(--color-info);
  border-bottom: 1px solid var(--color-info);
}
```

**Safety Banner Types:**
| Type | Trigger | Dismissible | Persistence |
|------|---------|-------------|-------------|
| Critical | System emergency | No | Until resolved |
| Warning | Safety concern | Yes (snoozable) | 24 hours |
| Info | Safety notice | Yes | Session |
| Reminder | Action required | Yes | Until action taken |

### Evidence Badges

Every clinical finding displays an evidence badge indicating the strength of supporting evidence.

| Level | Badge | Color | Definition |
|-------|-------|-------|------------|
| Level A | Strong | Success | Multiple RCTs, meta-analysis |
| Level B | Moderate | Info | Limited RCTs, cohort studies |
| Level C | Limited | Warning | Expert opinion, case studies |
| Level D | Insufficient | Danger | Anecdotal, theoretical |

```css
.evidence-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
}

.evidence-level-a {
  background: var(--color-success-light);
  color: var(--color-success);
}

.evidence-level-b {
  background: var(--color-info-light);
  color: var(--color-info);
}

.evidence-level-c {
  background: var(--color-warning-light);
  color: var(--color-warning);
}

.evidence-level-d {
  background: var(--color-danger-light);
  color: var(--color-danger);
}
```

### Uncertainty Indicators

Confidence intervals and uncertainty ranges are displayed alongside all AI-generated predictions.

```css
.uncertainty-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--color-grey-200);
  position: relative;
  overflow: hidden;
}

.uncertainty-range {
  position: absolute;
  height: 100%;
  border-radius: 2px;
  background: var(--color-primary);
  opacity: 0.6;
}

.uncertainty-point {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
  top: 50%;
  transform: translate(-50%, -50%);
}
```

### "Requires Review" Badge

```css
.requires-review-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--color-purple-light);
  color: var(--color-purple);
  border: 1px dashed var(--color-purple);
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
}

.requires-review-badge::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-purple);
  animation: pulse 2s infinite;
}
```

### Consent Status Indicators

| Status | Icon | Color | Label |
|--------|------|-------|-------|
| Granted | check-circle | Success | Consented |
| Pending | clock | Warning | Pending |
| Expired | alert-circle | Danger | Expired |
| Revoked | x-circle | Danger | Revoked |
| Not Required | minus-circle | Grey | N/A |

---

## Responsive Breakpoints

### Breakpoint Definitions

| Name | Min Width | Max Width | Target Devices |
|------|-----------|-----------|----------------|
| xs | 0 | 479px | Small phones |
| sm | 480px | 767px | Large phones |
| md | 768px | 1023px | Tablets |
| lg | 1024px | 1279px | Small laptops |
| xl | 1280px | 1535px | Desktops |
| 2xl | 1536px | - | Large monitors |

### Breakpoint Usage

```css
/* Mobile-first approach */
.container {
  padding: 16px; /* xs default */
}

@media (min-width: 768px) {
  .container {
    padding: 24px; /* md+ */
  }
}

@media (min-width: 1024px) {
  .container {
    padding: 32px; /* lg+ */
  }
}
```

### Component Responsive Behavior

| Component | xs | sm | md | lg | xl |
|-----------|----|----|----|----|----|
| Sidebar | Hidden | Hidden | Collapsed | Expanded | Expanded |
| Content padding | 16px | 16px | 24px | 32px | 32px |
| Card grid | 1 col | 1 col | 2 col | 3 col | 4 col |
| Table | Horizontal scroll | Horizontal scroll | Full | Full | Full |
| Filter bar | Stacked | Stacked | Inline | Inline | Inline |

### Sidebar Responsive Behavior

| Breakpoint | Behavior | Width |
|------------|----------|-------|
| < 768px (sm) | Overlay with backdrop | 280px |
| 768-1023px (md) | Collapsible, default collapsed | 56px / 240px |
| >= 1024px (lg) | Collapsible, default expanded | 56px / 240px |

### Mobile-Specific Adjustments

| Element | Mobile (< 768px) | Desktop |
|---------|-----------------|---------|
| Touch targets | >= 44px height | 36px default |
| Font sizes | 16px minimum (prevents zoom) | 14px default |
| Button sizes | Large (44px height) | Default (36px) |
| Card padding | 12px | 16px |
| Section gaps | 16px | 24px |
| Modal | Full screen | Centered overlay |
| Tables | Horizontal scroll / cards | Standard table |

---

## Accessibility

### WCAG 2.1 AA Compliance

#### Perceivable

| Criterion | Level | Implementation |
|-----------|-------|----------------|
| 1.1.1 Non-text Content | A | Alt text for all images, aria-label for icons |
| 1.3.1 Info and Relationships | A | Semantic HTML, ARIA where needed |
| 1.3.2 Meaningful Sequence | A | Logical DOM order |
| 1.4.1 Use of Color | A | Color never sole indicator, always paired with icon/text |
| 1.4.3 Contrast (Minimum) | AA | 4.5:1 for text, 3:1 for large text |
| 1.4.4 Resize Text | AA | Support up to 200% zoom |
| 1.4.10 Reflow | AA | Content reflows at 320px equivalent |
| 1.4.11 Non-text Contrast | AA | 3:1 for UI components and graphics |
| 1.4.12 Text Spacing | AA | Support increased spacing |
| 1.4.13 Content on Hover | AA | Hover content is dismissible, hoverable, persistent |

#### Operable

| Criterion | Level | Implementation |
|-----------|-------|----------------|
| 2.1.1 Keyboard | A | All functionality available via keyboard |
| 2.1.2 No Keyboard Trap | A | User can navigate away from any element |
| 2.4.3 Focus Order | A | Logical focus order |
| 2.4.4 Link Purpose | A | Link text describes destination |
| 2.4.6 Headings and Labels | AA | Descriptive headings and labels |
| 2.4.7 Focus Visible | AA | Visible focus indicator (2px outline) |
| 2.5.5 Target Size | AAA | Touch targets minimum 44x44px |

#### Understandable

| Criterion | Level | Implementation |
|-----------|-------|----------------|
| 3.1.1 Language of Page | A | Lang attribute set |
| 3.2.3 Consistent Navigation | AA | Navigation consistent across pages |
| 3.2.4 Consistent Identification | AA | Same function identified consistently |
| 3.3.1 Error Identification | A | Clear error messages |
| 3.3.2 Labels or Instructions | A | All inputs have labels |

#### Robust

| Criterion | Level | Implementation |
|-----------|-------|----------------|
| 4.1.1 Parsing | A | Valid HTML markup |
| 4.1.2 Name, Role, Value | A | ARIA attributes for custom components |
| 4.1.3 Status Messages | AA | Status messages announced to screen readers |

### Focus Management

```css
/* Visible focus indicator */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Remove default focus for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}

/* Focus trap for modals */
.modal:focus-within {
  /* Ensure focus stays within modal */
}

/* Skip link */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  padding: 8px 16px;
  background: var(--color-primary);
  color: white;
  z-index: 10000;
  transition: top 0.2s;
}

.skip-link:focus {
  top: 0;
}
```

### Screen Reader Support

```html
<!-- Navigation landmarks -->
<nav aria-label="Main navigation">
  <section aria-labelledby="section-today">
    <h2 id="section-today">TODAY</h2>
    <ul role="list">
      <li>
        <a href="/dashboard" aria-current="page">
          <span aria-hidden="true">[icon]</span>
          <span>Dashboard</span>
        </a>
      </li>
    </ul>
  </section>
</nav>

<!-- Live regions for dynamic content -->
<div role="status" aria-live="polite" aria-atomic="true">
  5 new notifications
</div>

<!-- Alert for critical messages -->
<div role="alert" aria-live="assertive">
  Critical patient alert requires immediate attention
</div>
```

### Color-Blind Safe Patterns

| Pattern | Normal Vision | Deuteranopia | Protanopia | Tritanopia |
|---------|--------------|--------------|------------|------------|
| Success | Green + check icon | Pattern + icon | Pattern + icon | Pattern + icon |
| Danger | Red + X icon | Pattern + icon | Pattern + icon | Pattern + icon |
| Warning | Amber + triangle | Pattern + icon | Pattern + icon | Pattern + icon |

**Rules:**
- Never use color alone to convey meaning
- Always pair color with an icon or text
- Use distinct patterns (solid, dashed, dotted)
- Use distinct shapes for status indicators

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  .pulse-animation {
    animation: none;
    opacity: 1;
  }

  .loading-spinner {
    animation: none;
    /* Show static loading indicator */
  }
}
```

---

## Animation & Motion

### Animation Principles

1. **Purposeful** - Every animation serves a functional purpose (feedback, orientation, guidance)
2. **Subtle** - Animations should be barely noticeable, not distracting
3. **Fast** - Animations complete quickly (under 300ms)
4. **Respectful** - Honor prefers-reduced-motion

### Timing Tokens

| Token | Duration | Usage |
|-------|----------|-------|
| instant | 0ms | No animation |
| fast | 100ms | Hover states, tooltips |
| normal | 150ms | Button states, color changes |
| medium | 200ms | Dropdowns, accordions |
| slow | 300ms | Sidebar, modal transitions |
| slower | 400ms | Page transitions |

### Easing Tokens

| Token | Curve | Usage |
|-------|-------|-------|
| ease-default | ease | General transitions |
| ease-in | cubic-bezier(0.4, 0, 1, 1) | Exit animations |
| ease-out | cubic-bezier(0, 0, 0.2, 1) | Enter animations |
| ease-in-out | cubic-bezier(0.4, 0, 0.2, 1) | Symmetric transitions |
| spring | cubic-bezier(0.34, 1.56, 0.64, 1) | Playful bounces |

### Common Animations

**Fade In:**
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.fade-in { animation: fadeIn 0.2s ease-out; }
```

**Slide In:**
```css
@keyframes slideInRight {
  from { transform: translateX(10px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.slide-in { animation: slideInRight 0.2s ease-out; }
```

**Pulse (for alerts):**
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.pulse { animation: pulse 2s ease-in-out infinite; }
```

**Spinner:**
```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spinner { animation: spin 1s linear infinite; }
```

**Shake (for errors):**
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
.shake { animation: shake 0.3s ease-in-out; }
```

### Performance Guidelines

- Animate only `transform` and `opacity` (GPU accelerated)
- Use `will-change` sparingly
- Avoid animating layout properties (width, height, top, left)
- Use `requestAnimationFrame` for JavaScript animations
- Test on low-end devices

---

## Icons

### Icon Library

The platform uses **Lucide React** as the primary icon library.

### Icon Sizes

| Size | Dimensions | Usage |
|------|-----------|-------|
| xs | 12px | Inline with text, badges |
| sm | 16px | Buttons, form elements |
| md | 20px | Navigation items |
| lg | 24px | Feature icons, empty states |
| xl | 32px | Hero icons, illustrations |

### Icon Colors

| Context | Color | Example |
|---------|-------|---------|
| Default | var(--color-grey-600) | Standard icons |
| Active | var(--color-primary) | Selected navigation |
| Success | var(--color-success) | Success states |
| Danger | var(--color-danger) | Error states |
| Warning | var(--color-warning) | Warning states |
| Muted | var(--color-grey-400) | Disabled/inactive |

### Accessibility

```html
<!-- Decorative icon (hidden from screen readers) -->
<svg aria-hidden="true">...</svg>

<!-- Functional icon (has aria-label) -->
<svg aria-label="Close dialog">...</svg>

<!-- Icon button -->
<button aria-label="Close">
  <svg aria-hidden="true">...</svg>
</button>
```

---

## Data Visualization

### Chart Colors

| Index | Color | Usage |
|-------|-------|-------|
| 0 | #007a7a | Primary series |
| 1 | #3498db | Secondary series |
| 2 | #2d8a4e | Tertiary series |
| 3 | #e67e22 | Quaternary series |
| 4 | #9b59b6 | Additional series |
| 5 | #c0392b | Alert series |
| 6 | #1abc9c | Additional series |
| 7 | #f39c12 | Additional series |

### Chart Typography

| Element | Size | Weight |
|---------|------|--------|
| Chart title | 16px | 600 |
| Axis labels | 12px | 400 |
| Axis values | 11px | 400 |
| Legend | 12px | 500 |
| Tooltip | 13px | 400 |
| Data labels | 11px | 600 |

### Chart Spacing

| Element | Value |
|---------|-------|
| Chart padding | 16px |
| Axis label offset | 8px |
| Grid line dash | 4px dash, 4px gap |
| Grid line color | var(--color-grey-200) |
| Tooltip padding | 8px 12px |
| Legend gap | 16px |

---

## Forms & Inputs

### Form Layout

| Layout | Gap | Usage |
|--------|-----|-------|
| Vertical | 16px between fields | Default, mobile |
| Horizontal | 16px label to input, 24px between rows | Desktop, simple forms |
| Grid | 16px gap | Complex forms, settings |

### Form Validation

| State | Border | Background | Icon |
|-------|--------|------------|------|
| Default | var(--color-grey-300) | White | None |
| Focus | var(--color-primary) | White | None |
| Valid | var(--color-success) | var(--color-success-light) | check-circle |
| Invalid | var(--color-danger) | var(--color-danger-light) | alert-circle |
| Disabled | var(--color-grey-200) | var(--color-grey-100) | None |

### Error Messages

```css
.error-message {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-danger);
  font-size: 12px;
  margin-top: 4px;
}
```

### Clinical Input Patterns

| Input Type | Validation | Format |
|------------|------------|--------|
| Patient ID | Required, alphanumeric | MRN format |
| Date of birth | Required, past date | MM/DD/YYYY |
| Phone | Required, valid format | (XXX) XXX-XXXX |
| Dosage | Required, numeric, range | X.X mg |
| Blood pressure | Numeric, range | XXX/XX mmHg |
| Heart rate | Numeric, range | XX bpm |
| PHQ-9 score | Integer, 0-27 | Whole number |

---

## Feedback & Notifications

### Toast Notifications

```css
.toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-width: 400px;
}

.toast-success {
  background: var(--color-success-light);
  border-left: 4px solid var(--color-success);
}

.toast-error {
  background: var(--color-danger-light);
  border-left: 4px solid var(--color-danger);
}

.toast-warning {
  background: var(--color-warning-light);
  border-left: 4px solid var(--color-warning);
}

.toast-info {
  background: var(--color-info-light);
  border-left: 4px solid var(--color-info);
}
```

**Toast Behavior:**
| Type | Duration | Dismissible | Auto-close |
|------|----------|-------------|------------|
| Success | 3000ms | Yes | Yes |
| Error | 0 (persistent) | Yes | No |
| Warning | 5000ms | Yes | Yes |
| Info | 4000ms | Yes | Yes |

### Alert Boxes

```css
.alert {
  padding: 12px 16px;
  border-radius: var(--radius-md);
  border: 1px solid;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.alert-success {
  background: var(--color-success-light);
  border-color: var(--color-success);
  color: var(--color-success);
}

.alert-error {
  background: var(--color-danger-light);
  border-color: var(--color-danger);
  color: var(--color-dark);
}

.alert-warning {
  background: var(--color-warning-light);
  border-color: var(--color-warning);
  color: var(--color-dark);
}

.alert-info {
  background: var(--color-info-light);
  border-color: var(--color-info);
  color: var(--color-dark);
}
```

---

## Tables & Data Grids

### Table Styles

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--color-grey-600);
  background: var(--color-grey-100);
  border-bottom: 2px solid var(--color-grey-200);
}

.table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-grey-200);
  color: var(--color-grey-700);
}

.table tr:hover td {
  background: var(--color-grey-100);
}

.table tr.selected td {
  background: var(--color-primary-light);
}
```

### Table States

| State | Style |
|-------|-------|
| Default | Standard row |
| Hover | Light background tint |
| Selected | Primary light background |
| Sorted | Bold header with arrow icon |
| Loading | Skeleton rows |
| Empty | Centered empty state illustration |

### Responsive Tables

**Approach:** Horizontal scroll with sticky first column

```css
.table-responsive {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.table-responsive th:first-child,
.table-responsive td:first-child {
  position: sticky;
  left: 0;
  background: var(--color-white);
  z-index: 1;
}
```

---

## Modals & Overlays

### Modal Styles

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease-out;
}

.modal {
  background: var(--color-white);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  max-width: 560px;
  width: 90%;
  max-height: 90vh;
  overflow: auto;
  animation: slideInUp 0.3s ease-out;
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-grey-200);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-body {
  padding: 24px;
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--color-grey-200);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

### Modal Sizes

| Size | Max Width | Usage |
|------|-----------|-------|
| Small | 400px | Confirmations, alerts |
| Default | 560px | Standard dialogs |
| Large | 720px | Forms, detailed content |
| Full | 90vw | Complex workflows |
| Full-screen (mobile) | 100vw | Mobile modals |

### Modal Behavior

| Action | Behavior |
|--------|----------|
| Click outside | Close (configurable) |
| Escape key | Close |
| Focus trap | Yes, focus cycles within modal |
| Return focus | Yes, to trigger element on close |
| Body scroll | Locked while modal open |

---

## Navigation Patterns

### Breadcrumbs

```css
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-grey-600);
}

.breadcrumb a {
  color: var(--color-primary);
  text-decoration: none;
}

.breadcrumb a:hover {
  text-decoration: underline;
}

.breadcrumb-separator {
  color: var(--color-grey-400);
}

.breadcrumb-current {
  color: var(--color-grey-700);
  font-weight: 500;
}
```

### Tabs

```css
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-grey-200);
}

.tab {
  padding: 12px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-grey-600);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s ease;
}

.tab:hover {
  color: var(--color-grey-700);
}

.tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.tab:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### Pagination

```css
.pagination {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-button {
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border-radius: var(--radius-md);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}

.page-button:hover {
  background: var(--color-grey-100);
}

.page-button.active {
  background: var(--color-primary);
  color: white;
}

.page-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

---

## Loading States

### Skeleton Loading

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-grey-200) 25%,
    var(--color-grey-300) 50%,
    var(--color-grey-200) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: var(--radius-sm);
}

@keyframes skeleton-loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-text {
  height: 14px;
  margin-bottom: 8px;
}

.skeleton-title {
  height: 20px;
  width: 60%;
  margin-bottom: 12px;
}

.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}
```

### Spinner

```css
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-grey-200);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-sm { width: 16px; height: 16px; border-width: 1.5px; }
.spinner-lg { width: 32px; height: 32px; border-width: 3px; }
```

### Loading States by Context

| Context | Loading Pattern | Duration |
|---------|----------------|----------|
| Page load | Skeleton screen | Until data loaded |
| Table data | Skeleton rows | Until data loaded |
| Button action | Spinner in button | Until action completes |
| Form submission | Full button loading state | Until response |
| Image | Blur placeholder + fade in | Until image loaded |
| Async search | Inline spinner | Until results |

---

## Empty States

### Empty State Pattern

```
+-----------------------------------+
|                                   |
|          [Illustration]           |
|                                   |
|         Empty State Title         |
|                                   |
|    Description of what would      |
|    appear here and how to         |
|    add content.                   |
|                                   |
|        [Primary Action]           |
|                                   |
+-----------------------------------+
```

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-state-icon {
  width: 64px;
  height: 64px;
  color: var(--color-grey-400);
  margin-bottom: 16px;
}

.empty-state-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-dark);
  margin-bottom: 8px;
}

.empty-state-description {
  font-size: 14px;
  color: var(--color-grey-600);
  max-width: 400px;
  margin-bottom: 24px;
  line-height: 1.5;
}
```

### Empty State Examples

| Context | Title | Description | Action |
|---------|-------|-------------|--------|
| Patient list | No patients yet | Add your first patient to get started | Add Patient |
| Inbox | No messages | Your inbox is empty. New messages will appear here. | - |
| Assessments | No assessments | No assessments have been assigned yet | Assign Assessment |
| Reports | No reports | Generate your first report to see it here | Generate Report |
| Search results | No results found | Try adjusting your search terms | Clear Filters |
| Notifications | All caught up | You have no new notifications | - |

---

## Error Handling

### Error Page Patterns

**404 Not Found:**
```
+-----------------------------------+
|                                   |
|            404                    |
|                                   |
|      Page not found               |
|                                   |
|   The page you are looking for    |
|   does not exist or has moved.    |
|                                   |
|     [Go to Dashboard]             |
|                                   |
+-----------------------------------+
```

**500 Server Error:**
```
+-----------------------------------+
|                                   |
|            500                    |
|                                   |
|    Something went wrong           |
|                                   |
|   We are experiencing technical   |
|   difficulties. Please try again  |
|   later or contact support.       |
|                                   |
|     [Retry]  [Contact Support]    |
|                                   |
+-----------------------------------+
```

### Inline Errors

```css
.inline-error {
  padding: 12px 16px;
  background: var(--color-danger-light);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  color: var(--color-dark);
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 0;
}
```

### Error Recovery Patterns

| Error Type | Pattern | Action |
|------------|---------|--------|
| Network error | Inline retry button | Retry request |
| Validation error | Field-level error message | Correct input |
| Permission error | Redirect to dashboard | Request access |
| Timeout error | Auto-retry with backoff | Manual retry |
| Data corruption | Error boundary fallback | Refresh page |

---

## Print Styles

```css
@media print {
  .sidebar,
  .top-nav,
  .action-buttons,
  .no-print {
    display: none !important;
  }

  .content {
    margin-left: 0 !important;
    padding: 0 !important;
  }

  body {
    background: white !important;
  }

  .card {
    box-shadow: none !important;
    border: 1px solid #ddd !important;
    break-inside: avoid;
  }

  a[href]::after {
    content: " (" attr(href) ")";
    font-size: 11px;
    color: #666;
  }
}
```

---

## Dark Mode

### Dark Mode Color Mapping

| Light Mode | Dark Mode |
|------------|-----------|
| #ffffff | #1a1a1a |
| #f5f5f0 | #242424 |
| #f5f5f5 | #2a2a2a |
| #eeeeee | #333333 |
| #dddddd | #444444 |
| #1a1a1a | #f5f5f5 |
| #333333 | #dddddd |
| #555555 | #bbbbbb |
| #777777 | #999999 |

### Dark Mode Implementation

```css
[data-theme="dark"] {
  --color-bg-page: #1a1a1a;
  --color-bg-card: #242424;
  --color-bg-sidebar: #1a1a1a;
  --color-bg-elevated: #2a2a2a;

  --color-dark: #f5f5f5;
  --color-grey-800: #dddddd;
  --color-grey-700: #bbbbbb;
  --color-grey-600: #999999;

  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.4);

  --sidebar-active-bg: rgba(0, 122, 122, 0.2);
}
```

**Note:** Dark mode is planned for a future release and is not included in the initial implementation.

---

## Appendices

### Appendix A: CSS Variable Reference

```css
:root {
  /* === COLORS === */
  /* Primary */
  --color-primary: #007a7a;
  --color-primary-dark: #005f5f;
  --color-primary-light: #e6f3f3;
  --color-primary-muted: #4a9d9d;

  /* Neutral */
  --color-dark: #1a1a1a;
  --color-grey-800: #333333;
  --color-grey-700: #555555;
  --color-grey-600: #777777;
  --color-grey-500: #999999;
  --color-grey-400: #bbbbbb;
  --color-grey-300: #dddddd;
  --color-grey-200: #eeeeee;
  --color-grey-100: #f5f5f5;
  --color-white: #ffffff;

  /* Semantic */
  --color-success: #2d8a4e;
  --color-success-light: #e8f5ed;
  --color-danger: #c0392b;
  --color-danger-light: #fceeee;
  --color-warning: #e67e22;
  --color-warning-light: #fef5e8;
  --color-info: #3498db;
  --color-info-light: #eaf2fa;

  /* Accent */
  --color-amber: #c9a227;
  --color-amber-light: #fdf8e8;
  --color-purple: #7b68ee;
  --color-purple-light: #f0edfc;
  --color-rose: #e11d48;
  --color-rose-light: #fef1f2;

  /* Backgrounds */
  --color-bg-page: #f5f5f0;
  --color-bg-card: #ffffff;
  --color-bg-sidebar: #ffffff;
  --color-bg-elevated: #fafaf8;

  /* === TYPOGRAPHY === */
  --font-body: system-ui, -apple-system, sans-serif;
  --font-mono: "SF Mono", Monaco, monospace;

  /* === SPACING === */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* === SHADOWS === */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 2px 8px rgba(0,0,0,0.08);
  --shadow-lg: 0 4px 16px rgba(0,0,0,0.1);
  --shadow-xl: 0 8px 32px rgba(0,0,0,0.12);

  /* === RADII === */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* === TRANSITIONS === */
  --transition-fast: 100ms ease;
  --transition-normal: 150ms ease;
  --transition-medium: 200ms ease;
  --transition-slow: 300ms ease;

  /* === Z-INDEX === */
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal-backdrop: 500;
  --z-modal: 600;
  --z-popover: 700;
  --z-tooltip: 800;
  --z-toast: 900;
}
```

### Appendix B: Z-Index Hierarchy

| Layer | Z-Index | Elements |
|-------|---------|----------|
| Base | 0 | Page content |
| Sticky | 100 | Sticky headers, sidebar |
| Dropdown | 200 | Select menus, dropdowns |
| Modal Backdrop | 500 | Modal overlays |
| Modal | 600 | Modal content |
| Popover | 700 | Popovers, date pickers |
| Tooltip | 800 | Tooltips |
| Toast | 900 | Toast notifications |

### Appendix C: Token Usage by Component

| Component | Colors | Spacing | Typography | Shadows |
|-----------|--------|---------|------------|---------|
| Card | bg-card, grey-200 | 16px padding | heading-sm | shadow-sm |
| Button (primary) | primary, white | 8px 16px | button | none |
| Button (secondary) | white, grey-700 | 8px 16px | button | none |
| Input | white, grey-300 | 10px 12px | body-md | focus shadow |
| Badge | semantic + light | 2px 8px | badge | none |
| Modal | white | 24px | heading-md | shadow-xl |
| Tooltip | dark, white | 6px 10px | body-xs | none |
| Toast | semantic light | 12px 16px | body-sm | shadow-lg |

### Appendix D: Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-14 | Initial release with complete design system |

---

*Document generated by DeepSynaps UX Architecture Team*
*For questions or updates, contact the UX Engineering team*
