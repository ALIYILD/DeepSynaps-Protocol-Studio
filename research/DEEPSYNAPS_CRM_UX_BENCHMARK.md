# DeepSynaps Protocol Studio — SaaS Admin Dashboard UX Benchmark Report

> **Document Version:** 1.0.0
> **Last Updated:** 2025-01-15
> **Research Scope:** World-class SaaS admin dashboard UX patterns for CRM, fintech, devtools, and ops platforms
> **Target Audience:** Product designers, frontend engineers, design system architects
> **Total Platforms Analyzed:** 6 primary + 7 pattern categories

---

## Table of Contents

1. [Stripe Dashboard UX](#1-stripe-dashboard-ux)
2. [HubSpot CRM UX](#2-hubspot-crm-ux)
3. [Linear UX](#3-linear-ux)
4. [Intercom UX](#4-intercom-ux)
5. [Retool UX](#5-retool-ux)
6. [Datadog UX](#6-datadog-ux)
7. [SaaS Dashboard Design Patterns](#7-saas-dashboard-design-patterns)
8. [Navigation Patterns](#8-navigation-patterns)
9. [Action Patterns](#9-action-patterns)
10. [Accessibility](#10-accessibility)
11. [Appendix: CSS Pattern Library](#11-appendix-css-pattern-library)
12. [Appendix: Component Specification Sheets](#12-appendix-component-specification-sheets)
13. [References & Sources](#13-references--sources)

---

## 1. Stripe Dashboard UX

### 1.1 Overview

Stripe Dashboard represents the gold standard for fintech admin interfaces. Its design philosophy centers on **information density with clarity** — presenting complex financial data in digestible, scannable formats. The interface balances power-user functionality with approachable design for non-technical business owners.

**Key Design Principles:**
- Progressive disclosure: simple default views with deep drill-down capability
- Contextual actions: every data point has relevant next-actions
- Trust through transparency: every transaction, fee, and payout is traceable
- Developer-first: API references, webhook logs, and test mode integrated throughout

### 1.2 Revenue Overview Cards

**Wireframe Description:**

```
+------------------------------------------------------------------+
|  Revenue overview                                    [Date v]    |
|                                                                  |
|  +------------------+  +------------------+  +----------------+ |
|  | $48,291.00      |  | 1,247           |  | $38.72         | |
|  | Total revenue   |  | Customers       |  | Avg revenue    | |
|  | ↑ 12.3% vs last |  | ↑ 8.1% vs last |  | ↑ 3.2% vs last| |
|  | month           |  | month           |  | month          | |
|  +------------------+  +------------------+  +----------------+ |
|                                                                  |
|  +------------------+  +------------------+  +----------------+ |
|  | $42,100.00      |  | 98.4%           |  | 23             | |
|  | Net volume      |  | Success rate    |  | Refunds        | |
|  | (after fees)    |  |                 |  |                | |
|  +------------------+  +------------------+  +----------------+ |
+------------------------------------------------------------------+
```

**Layout Pattern:**
- 3-column grid on desktop (`grid-template-columns: repeat(3, 1fr)`)
- 2-column on tablet, 1-column stack on mobile
- Gap: `24px` between cards
- Cards have no visible border; separation via background (`#f6f9fc`) and subtle shadow (`0 1px 3px rgba(0,0,0,0.08)`)

**Card Component Spec:**

```css
.kpi-card {
  background: #ffffff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.kpi-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-1px);
}

.kpi-card__value {
  font-size: 28px;
  font-weight: 600;
  color: #1a1a2e;
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin-bottom: 4px;
}

.kpi-card__label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-bottom: 8px;
}

.kpi-card__trend {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
}

.kpi-card__trend--positive { color: #10b981; }
.kpi-card__trend--negative { color: #ef4444; }
```

**Trend Indicator Component:**
- Arrow icon (up/down) using 12px SVG
- Percentage value in bold
- Comparison period in muted text (e.g., "vs last month")
- Color coding: green for positive revenue trends, red for negative ( Stripe inverts for refunds/costs where down is good)

### 1.3 Customer List with Search/Filter

**Wireframe Description:**

```
+------------------------------------------------------------------+
| Customers                                    [+ Add customer]    |
|                                                                  |
|  [Search customers...    ]  [Status ▼]  [Date ▼]  [Export]      |
|                                                                  |
|  [ ] Name                    Status    Created    Spend    [⋯]  |
|  ------------------------------------------------------------- |
|  [ ] Acme Corp               Active    Jan 12    $12.4K   [⋯]  |
|  [ ] Globex Industries       Active    Jan 10    $8.2K    [⋯]  |
|  [ ] Initech LLC             Past due  Jan 08    $4.1K    [⋯]  |
|  [ ] Umbrella Corp           Active    Jan 05    $22.8K   [⋯]  |
|  [ ] Stark Industries        Inactive  Dec 28    $91.2K   [⋯]  |
|  [ ] Wayne Enterprises       Active    Dec 22    $34.5K   [⋯]  |
|  ------------------------------------------------------------- |
|  Showing 1-6 of 1,247            [< 1 2 3 ... 208 >]          |
+------------------------------------------------------------------+
```

**Table Design Patterns:**

```css
.data-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 14px;
}

.data-table thead th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 500;
  color: #6b7280;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
  position: sticky;
  top: 0;
  z-index: 10;
}

.data-table tbody tr {
  transition: background-color 0.1s ease;
}

.data-table tbody tr:hover {
  background-color: #f9fafb;
}

.data-table tbody td {
  padding: 16px;
  border-bottom: 1px solid #f3f4f6;
  vertical-align: middle;
}

/* Status badges */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
}

.badge--active {
  background: #d1fae5;
  color: #065f46;
}

.badge--past-due {
  background: #fee2e2;
  color: #991b1b;
}

.badge--inactive {
  background: #f3f4f6;
  color: #6b7280;
}

/* Status dot indicator */
.badge__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
```

**Search Behavior:**
- Debounced input (300ms)
- Placeholder text uses muted color (`#9ca3af`)
- Search icon (magnifying glass, 16px) positioned left inside input
- Clear button (X icon) appears on focus with content
- Full-text search across customer name, email, and ID fields

**Filter Dropdown Pattern:**
```css
.filter-dropdown {
  position: relative;
  display: inline-block;
}

.filter-dropdown__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.filter-dropdown__trigger:hover {
  border-color: #9ca3af;
}

.filter-dropdown__trigger:focus {
  outline: none;
  border-color: #635bff;
  box-shadow: 0 0 0 3px rgba(99, 91, 255, 0.1);
}

.filter-dropdown__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 200px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
  z-index: 50;
  padding: 6px;
}
```

### 1.4 Payment Detail Views

**Wireframe Description:**

```
+------------------------------------------------------------------+
| ← Back to payments          Payment #pi_3O...         [Refund]  |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |  $249.00                                      Succeeded  |   |
|  |  Payment for Invoice #1042                    Jan 15, 2025|   |
|  +----------------------------------------------------------+   |
|                                                                  |
|  +------------------------+  +-----------------------------+    |
|  | Payment details        |  | Customer                   |    |
|  | ---------------------- |  | -------------------------- |    |
|  | ID: pi_3Oxxxxx         |  | Acme Corporation           |    |
|  | Amount: $249.00        |  | contact@acme.com           |    |
|  | Fee: $7.22 (2.9%)      |  | acct_8x...                 |    |
|  | Net: $241.78           |  |                            |    |
|  | Method: •••• 4242      |  | [View customer →]          |    |
|  |                        |  |                            |    |
|  | Timeline:              |  +-----------------------------+    |
|  | 9:42 AM - Created      |  +-----------------------------+    |
|  | 9:42 AM - Confirmed    |  | Receipt                     |    |
|  |                        |  | [Send receipt] [Download]   |    |
|  |                        |  +-----------------------------+    |
|  +------------------------+                                     |
+------------------------------------------------------------------+
```

**Detail View Layout:**
- Two-column layout: 2/3 main content, 1/3 sidebar on desktop
- Single column stack on mobile (sidebar moves below)
- Sticky action bar at top with primary action (Refund) on the right
- Hero card at top showing the most critical info (amount, status)

**Status Hero Pattern:**
```css
.detail-hero {
  background: #ffffff;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.detail-hero__amount {
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: #1a1a2e;
}

.detail-hero__status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
}

.detail-hero__status--succeeded {
  background: #d1fae5;
  color: #065f46;
}

.detail-hero__status--failed {
  background: #fee2e2;
  color: #991b1b;
}

.detail-hero__status--pending {
  background: #fef3c7;
  color: #92400e;
}
```

**Timeline Component:**
```css
.timeline {
  position: relative;
  padding-left: 24px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: #e5e7eb;
}

.timeline__item {
  position: relative;
  padding-bottom: 20px;
}

.timeline__item::before {
  content: '';
  position: absolute;
  left: -20px;
  top: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d1d5db;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 2px #e5e7eb;
}

.timeline__item--completed::before {
  background: #10b981;
  box-shadow: 0 0 0 2px #a7f3d0;
}

.timeline__time {
  font-size: 12px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}

.timeline__description {
  font-size: 14px;
  color: #374151;
  margin-top: 2px;
}
```

### 1.5 Balance/Transaction Feeds

**Wireframe Description:**

```
+------------------------------------------------------------------+
| Balance                                       [Payout schedule →] |
| $42,100.00 Available                                             |
| $1,200.00 Pending                                                |
|                                                                  |
| Transactions                                         [Filter ▼]  |
|                                                                  |
|  [All] [Charges] [Refunds] [Transfers] [Fees]                    |
|                                                                  |
|  Description                    Amount    Status    Date         |
|  -------------------------------------------------------------  |
|  Charge from Acme Corp          +$249.00  Paid      Jan 15       |
|  Charge from Globex Inc         +$899.00  Paid      Jan 15       |
|  Refund to Initech LLC          -$49.00   Refunded  Jan 14       |
|  Stripe fee (batch)             -$32.40   Fee       Jan 14       |
|  Payout to Wells Fargo •••1234  -$12.1K   Transferred Jan 13     |
|  Charge from Umbrella Corp      +$1,499   Paid      Jan 13       |
|  -------------------------------------------------------------  |
+------------------------------------------------------------------+
```

**Tab Navigation Pattern:**
```css
.tab-group {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 24px;
}

.tab {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
}

.tab:hover {
  color: #374151;
}

.tab--active {
  color: #635bff;
  border-bottom-color: #635bff;
}
```

**Transaction Row Pattern:**
- Icon + description on the left (different icon per type: charge, refund, fee, payout)
- Amount right-aligned with color coding (green for incoming, red for outgoing)
- Status badge in the middle
- Monospaced font for amounts (`font-family: 'SF Mono', monospace`)

```css
.transaction-row__amount {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-size: 14px;
  font-weight: 600;
}

.transaction-row__amount--credit { color: #10b981; }
.transaction-row__amount--debit  { color: #ef4444; }
```

### 1.6 Webhook/Event Logs

**Wireframe Description:**

```
+------------------------------------------------------------------+
| Webhooks                                                         |
|                                                                  |
|  Endpoints: [All endpoints ▼]  Events: [All events ▼]  [Refresh]|
|                                                                  |
|  Time        Event              Endpoint           Status   [⋯] |
|  ------------------------------------------------------------- |
|  09:42:11   charge.succeeded    https://api...    200 OK      |
|  09:42:10   invoice.paid        https://api...    200 OK      |
|  09:41:58   customer.created    https://api...    200 OK      |
|  09:40:22   charge.failed       https://api...    500 ERR     |
|  09:38:15   charge.succeeded    https://api...    204 NO      |
|  ------------------------------------------------------------- |
|                                                                  |
|  [Endpoint detail panel - shows on row click]                   |
|  +----------------------------------------------------------+   |
|  | POST https://api.acme.com/webhooks                       |   |
|  | Headers:                                                 |   |
|  |   Stripe-Signature: t=1705...                            |   |
|  |   Content-Type: application/json                         |   |
|  | Body (JSON):                                             |   |
|  |   { "id": "evt_3O...", "type": "charge.succeeded", ... } |   |
|  +----------------------------------------------------------+   |
+------------------------------------------------------------------+
```

**Expandable Row Pattern:**
```css
.table-row--expandable {
  cursor: pointer;
}

.table-row__expand-panel {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease, padding 0.3s ease;
  background: #f9fafb;
}

.table-row--expanded .table-row__expand-panel {
  max-height: 600px;
  padding: 20px 24px;
}

/* Chevron rotation */
.table-row__chevron {
  transition: transform 0.2s ease;
}

.table-row--expanded .table-row__chevron {
  transform: rotate(180deg);
}
```

**HTTP Status Badges:**
```css
.status-code--success { background: #d1fae5; color: #065f46; }
.status-code--redirect { background: #dbeafe; color: #1e40af; }
.status-code--client-error { background: #fee2e2; color: #991b1b; }
.status-code--server-error { background: #fee2e2; color: #991b1b; }
```

### 1.7 Developer Tools Integration

Stripe deeply integrates developer tools throughout the dashboard:

**API Reference Panel:**
- Slide-out drawer from the right edge (400px width)
- Triggered by "View API" buttons on every resource page
- Shows copy-pasteable cURL commands
- Language switcher (cURL, Python, Node, Ruby, Go, PHP)
- Copy button with success feedback (checkmark animation)

```css
.api-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 480px;
  max-width: 90vw;
  height: 100vh;
  background: #1a1a2e;
  color: #e5e7eb;
  z-index: 100;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overflow-y: auto;
}

.api-drawer--open {
  transform: translateX(0);
}

.api-drawer__code-block {
  background: #0f0f23;
  border-radius: 8px;
  padding: 16px;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}
```

**Test Mode Toggle:**
- Prominent toggle switch in top navigation
- Test mode applies a visual indicator (yellow/orange border on viewport, "TEST MODE" banner)
- All data is visually distinct (slightly muted colors, test data watermark)

---

## 2. HubSpot CRM UX

### 2.1 Overview

HubSpot CRM exemplifies **relationship-centric design** — every interface decision prioritizes understanding the complete customer journey. The platform uses a card-based layout system with heavy emphasis on activity timelines, pipeline visualization, and contextual productivity tools.

**Key Design Principles:**
- Everything is connected: contacts, companies, deals, tickets interlink
- Activity-centric: every record centers on a chronological timeline
- Customizable objects: users can define custom properties and views
- Power of defaults: smart defaults reduce configuration burden

### 2.2 Contact/Company/Deal Pipeline

**Wireframe Description (Deal Pipeline):**

```
+------------------------------------------------------------------+
| Deals ($2.4M pipeline)                        [+ Create deal]    |
|                                                                  |
|  [Board v] [Filter ▼]  [All pipelines ▼]         [←] [→]        |
|                                                                  |
|  +----------------+ +----------------+ +----------------+       |
|  | Appointment    | | Qualified      | | Presentation   |       |
|  | Scheduled      | | to Buy         | | Scheduled      |       |
|  | $680K   12     | | $420K   8      | | $1.1M   5      |       |
|  +----------------+ +----------------+ +----------------+       |
|  | Acme Corp      | | Globex Inc     | | Stark Ind      |       |
|  | $120K          | | $85K           | | $450K          |       |
|  | Close: Feb 1   | | Close: Feb 15  | | Close: Mar 1   |       |
|  +----------------+ +----------------+ +----------------+       |
|  | Wayne Ent      | | Initech LLC    | | Umbrella Corp  |       |
|  | $95K           | | $42K           | | $320K          |       |
|  | Close: Feb 10  | | Close: Mar 1   | | Close: Mar 15  |       |
|  +----------------+ +----------------+ +----------------+       |
|  | ...            | | ...            | | ...            |       |
|  +----------------+ +----------------+ +----------------+       |
+------------------------------------------------------------------+
```

**Kanban Board Pattern:**
```css
.kanban-board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 16px;
  scroll-snap-type: x mandatory;
}

.kanban-column {
  min-width: 300px;
  max-width: 300px;
  flex-shrink: 0;
  background: #f3f4f6;
  border-radius: 12px;
  padding: 16px;
  scroll-snap-align: start;
}

.kanban-column__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid;
}

.kanban-column__header--appointment { border-color: #fbbf24; }
.kanban-column__header--qualified   { border-color: #3b82f6; }
.kanban-column__header--presentation { border-color: #8b5cf6; }

.kanban-card {
  background: #ffffff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  cursor: grab;
  transition: box-shadow 0.2s ease, transform 0.15s ease;
}

.kanban-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.kanban-card--dragging {
  opacity: 0.5;
  transform: rotate(2deg);
  cursor: grabbing;
}
```

**Drag-and-Drop Interaction:**
- Visual lift on drag start (scale 1.02, shadow increase)
- Column highlight on hover-over (background color shift)
- Ghost preview of card position within column
- Smooth animation on drop (300ms ease-out)
- Success toast on stage change

**Deal Card Detail:**
```css
.deal-card__amount {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 4px;
}

.deal-card__company {
  font-size: 14px;
  color: #475569;
  font-weight: 500;
}

.deal-card__meta {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f1f5f9;
}

.deal-card__close-date {
  font-size: 12px;
  color: #94a3b8;
}

.deal-card__owner-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  box-shadow: 0 0 0 1px #e2e8f0;
}
```

### 2.3 Activity Timeline

**Wireframe Description:**

```
+------------------------------------------------------------------+
| Activity Timeline                                                |
|                                                                  |
|  Today                                                           |
|  ─────                                                           |
|  [📧] Email sent to john@acme.com                                |
|       "Proposal for Q1 project"  10:30 AM  by Sarah M.          |
|       [View email]                                               |
|                                                                  |
|  [📞] Call with Acme Corp                                        |
|       Duration: 23 min  9:15 AM  by Sarah M.                    |
|       Notes: Discussed timeline and budget...                    |
|                                                                  |
|  [📝] Note added                                                 |
|       "Follow up on contract terms"  9:00 AM  by Sarah M.       |
|                                                                  |
|  Yesterday                                                       |
|  ─────────                                                       |
|  [✅] Task completed: Send proposal                              |
|        4:30 PM  by Sarah M.                                     |
|                                                                  |
|  [🔄] Deal stage changed                                         |
|       Qualified to Buy → Presentation Scheduled                  |
|        3:45 PM  by system                                       |
|                                                                  |
|  Jan 13                                                          |
|  ─────                                                           |
|  [📧] Email opened by john@acme.com                              |
|        2:15 PM  tracked                                        |
+------------------------------------------------------------------+
```

**Timeline Component:**
```css
.timeline-section {
  position: relative;
  padding-left: 32px;
}

.timeline-section::before {
  content: '';
  position: absolute;
  left: 11px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, #e2e8f0, transparent);
}

.timeline-section__date {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
  position: relative;
}

.timeline-item {
  position: relative;
  padding-bottom: 24px;
}

.timeline-item__icon {
  position: absolute;
  left: -32px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  background: #ffffff;
  border: 2px solid #e2e8f0;
  z-index: 2;
}

.timeline-item__icon--email    { background: #dbeafe; border-color: #93c5fd; }
.timeline-item__icon--call     { background: #d1fae5; border-color: #6ee7b7; }
.timeline-item__icon--note     { background: #fef3c7; border-color: #fcd34d; }
.timeline-item__icon--task     { background: #e0e7ff; border-color: #a5b4fc; }
.timeline-item__icon--stage    { background: #f3e8ff; border-color: #c4b5fd; }

.timeline-item__content {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
}

.timeline-item__header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 6px;
}

.timeline-item__body {
  font-size: 14px;
  color: #475569;
  line-height: 1.5;
}

.timeline-item__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 12px;
  color: #94a3b8;
}
```

### 2.4 Task Management

**Wireframe Description:**

```
+------------------------------------------------------------------+
| My Tasks                                    [+ Create task]      |
|                                                                  |
|  [All] [Overdue 3] [Due today 5] [Upcoming 12] [No due date 4]   |
|                                                                  |
|  [ ] Follow up on proposal      Due Today   High   Acme Corp     |
|  [ ] Prepare demo slides        Due Today   Medium Globex Inc    |
|  [ ] Review contract terms      Due Today   High   Stark Ind     |
|  [ ] Send onboarding packet     Due Jan 18  Low    Wayne Ent     |
|  [ ] Schedule QBR               Due Jan 20  Medium Umbrella Corp|
|  [ ] Update CRM records         Due Jan 22  Low    -             |
|                                                                  |
|  Completed today                                                 |
|  [✓] Send invoice reminder        9:00 AM    by system          |
|  [✓] Log call notes               8:45 AM    by Sarah M.        |
+------------------------------------------------------------------+
```

**Task Checkbox Pattern:**
```css
.task-checkbox {
  appearance: none;
  width: 20px;
  height: 20px;
  border: 2px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  flex-shrink: 0;
}

.task-checkbox:hover {
  border-color: #ff5c35;
}

.task-checkbox:checked {
  background: #ff5c35;
  border-color: #ff5c35;
}

.task-checkbox:checked::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #ffffff;
  font-size: 12px;
  font-weight: bold;
}

/* Strikethrough animation for completed tasks */
.task-row--completed .task-row__title {
  text-decoration: line-through;
  color: #94a3b8;
  transition: color 0.3s ease;
}
```

**Priority Indicators:**
```css
.priority-flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 4px;
}

.priority-flag--high {
  background: #fee2e2;
  color: #dc2626;
}

.priority-flag--medium {
  background: #fef3c7;
  color: #d97706;
}

.priority-flag--low {
  background: #f1f5f9;
  color: #64748b;
}
```

### 2.5 Email Integration

**Email Tracking UI:**
- Inline email compose drawer (slides up from bottom, 60vh height)
- Email templates accessible via "Templates" dropdown
- Tracking indicators: open count, click count, reply status
- "Last opened 2 hours ago" real-time status
- Sequences UI: visual flow builder showing email steps with delays

**Sequence Builder Wireframe:**
```
+------------------------------------------------------------------+
| Sequence: Onboarding                                             |
|                                                                  |
|  [Start]──→[📧 Welcome email]──→[Wait 1 day]──→[📧 Tips email]  |
|                ↑                        |                        |
|                |                        └──→[If opened]──→[📧]  |
|                |                        |                        |
|                └──[If not opened]──→[📧 Reminder]                |
|                                                                  |
|  Settings:                                                       |
|  [✓] Send from connected inbox                                 |
|  [✓] Track opens                                               |
|  [✓] Track clicks                                              |
|  [ ] Unsubscribe link included                                 |
+------------------------------------------------------------------+
```

### 2.6 Reporting Dashboards

**Report Builder Pattern:**
- WYSIWYG report editor with drag-and-drop chart placement
- Data source selector (contacts, deals, activities, tickets)
- Visualization type picker (bar, line, pie, funnel, metric)
- Filter sidebar with AND/OR logic builder
- Date range presets: Today, This Week, This Month, This Quarter, This Year, Custom
- Comparison toggle: compare to previous period

```css
.report-builder__canvas {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 20px;
  padding: 24px;
  background: #f8fafc;
  min-height: 600px;
}

.report-widget {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  grid-column: span 6; /* Half width default */
}

.report-widget--full {
  grid-column: span 12;
}

.report-widget--third {
  grid-column: span 4;
}
```

### 2.7 Playbooks and Sequences

**Playbook Pattern:**
- Checklist-based guided workflows
- Enrollable on contacts, companies, or deals
- Step types: send email, make call, create task, schedule meeting, delay
- Progress bar showing completion percentage
- Due dates auto-calculated from enrollment date + step delays

---

## 3. Linear UX

### 3.1 Overview

Linear represents the pinnacle of **keyboard-first, speed-optimized** project management UX. Built by ex-Apple designers, every interaction is crafted for sub-100ms response times and zero-friction workflows. The interface embodies a "command line meets GUI" philosophy.

**Key Design Principles:**
- Keyboard is king: every action has a keyboard shortcut
- Speed above all: 60fps animations, instant feedback, optimistic UI
- Zero chrome: minimal decorative elements, maximum information density
- Dark mode first: designed in dark mode, adapted to light

### 3.2 Issue List with Keyboard Shortcuts

**Wireframe Description:**

```
+------------------------------------------------------------------+
| Issues                                                         ⌘K |
|                                                                  |
|  [All issues ▼] [Filter: Open ▼] [Sorted: Priority ▼]  [Layout ▼]|
|                                                                  |
|  ID-892  🔴 Fix authentication race condition        Engineering |
|  ID-891  🟡 Update API documentation                  Engineering|
|  ID-890  🟢 Add dark mode toggle                       Frontend  |
|  ID-889  🔴 Database connection pool exhaustion        Backend   |
|  ID-888  🟡 Design review: onboarding flow             Design    |
|  ID-887  🟢 Add keyboard shortcut hints               Frontend  |
|  ID-886  🟡 Refactor payment service                   Backend   |
|  ID-885  🔴 Memory leak in dashboard charts            Frontend  |
|                                                                  |
|  Select: ↑↓  Open: Enter  Create: C  Command: ⌘K  Menu: M       |
+------------------------------------------------------------------+
```

**Issue Row Pattern:**
```css
.issue-row {
  display: grid;
  grid-template-columns: 80px 24px 1fr 120px 80px;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.05s ease;
  font-size: 14px;
}

.issue-row:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.issue-row--selected {
  background-color: rgba(99, 91, 255, 0.1);
}

.issue-row__id {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 12px;
  color: #6e7681;
}

.issue-row__title {
  color: #c9d1d9;
  font-weight: 450;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Priority indicator - colored left border */
.issue-row--urgent { border-left: 3px solid #f85149; }
.issue-row--high   { border-left: 3px solid #ffa657; }
.issue-row--medium { border-left: 3px solid #3fb950; }
.issue-row--low    { border-left: 3px solid #8b949e; }
```

**Keyboard Shortcut System:**
```
Global Shortcuts:
  ⌘K        Command palette
  C         Create new issue
  O         Open selected issue
  ⌘Enter    Submit/Save
  Esc       Cancel/Close
  /         Focus search
  G then I  Go to Issues
  G then M  Go to My Issues
  G then P  Go to Projects

Issue List Shortcuts:
  ↑/↓       Navigate items
  Space     Select/deselect
  Shift+↑↓  Range select
  X         Change status
  L         Set labels
  A         Assign to
  M         Move to project
  #         Set priority
  D         Set due date
  ⌘⇧D       Duplicate
  ⌘⌫        Delete
```

**Shortcut Hint Bar:**
```css
.shortcut-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 8px 20px;
  background: #161b22;
  border-top: 1px solid #30363d;
  display: flex;
  gap: 20px;
  font-size: 12px;
  color: #8b949e;
  z-index: 50;
}

.shortcut-bar kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 4px;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 11px;
  color: #c9d1d9;
}
```

### 3.3 Project Board Views

**Wireframe Description:**

```
+------------------------------------------------------------------+
| Q1 Platform Work                                               ⌘K|
|                                                                  |
|  [Board ▼] [Filter ▼]  [Roadmap] [Board] [List]                  |
|                                                                  |
|  +-----------------+ +-----------------+ +-----------------+    |
|  | Backlog         | | In Progress     | | Done            |    |
|  | 12 issues       | | 5 issues        | | 48 issues       |    |
|  +-----------------+ +-----------------+ +-----------------+    |
|  | Fix login bug   | | API refactor    | | Dashboard v2    |    |
|  |   #892 🔴       | |   #889 🔴       | |   #800 ✅       |    |
|  |                 | |   Sarah         | |   Jan 10        |    |
|  +-----------------+ +-----------------+ +-----------------+    |
|  | Update docs     | | Design review   | | Onboarding      |    |
|  |   #891 🟡       | |   #888 🟡       | |   #765 ✅       |    |
|  |                 | |   Mike          | |   Jan 8         |    |
|  +-----------------+ +-----------------+ +-----------------+    |
|  | Add shortcuts   | | Payment service | | Auth upgrade    |    |
|  |   #887 🟢       | |   #886 🟡       | |   #720 ✅       |    |
|  |                 | |   Alex          | |   Jan 5         |    |
|  +-----------------+ +-----------------+ +-----------------+    |
+------------------------------------------------------------------+
```

**Board View CSS:**
```css
.board-view {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 0 20px 20px;
  height: calc(100vh - 120px);
}

.board-column {
  min-width: 320px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  background: #161b22;
  border-radius: 12px;
  border: 1px solid #30363d;
}

.board-column__header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #30363d;
}

.board-column__title {
  font-size: 13px;
  font-weight: 600;
  color: #c9d1d9;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.board-column__count {
  font-size: 12px;
  color: #8b949e;
  background: #21262d;
  padding: 2px 8px;
  border-radius: 10px;
}

.board-column__content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Custom scrollbar */
.board-column__content::-webkit-scrollbar {
  width: 6px;
}

.board-column__content::-webkit-scrollbar-track {
  background: transparent;
}

.board-column__content::-webkit-scrollbar-thumb {
  background: #30363d;
  border-radius: 3px;
}
```

**Board Card:**
```css
.board-card {
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 14px;
  cursor: grab;
  transition: transform 0.1s ease, box-shadow 0.1s ease, border-color 0.1s ease;
}

.board-card:hover {
  border-color: #58a6ff;
  background: #161b22;
}

.board-card--dragging {
  transform: scale(1.02) rotate(1deg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  opacity: 0.9;
  cursor: grabbing;
}

.board-card__title {
  font-size: 13px;
  line-height: 1.5;
  color: #c9d1d9;
  margin-bottom: 12px;
}

.board-card__meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.board-card__identifier {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 11px;
  color: #6e7681;
}

.board-card__assignee {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #58a6ff, #a371f7);
}
```

### 3.4 Cycle Planning

**Cycle View Wireframe:**
```
+------------------------------------------------------------------+
| Cycle 24 — Jan 13 to Jan 26                                    ⌘K|
|                                                                  |
|  Progress: [████████░░░░░░░░░░░░] 47%  12 of 26 issues done      |
|                                                                  |
|  Burndown: [chart showing ideal vs actual line]                  |
|                                                                  |
|  Active         In Review        Completed                       |
|  ─────────────────────────────────────────                       |
|  #892 🔴 Auth   #880 🟡 UI      #865 ✅ API                    |
|  #889 🔴 DB     #878 🟡 Test    #862 ✅ Docs                    |
|  #887 🟢 Key    #875 🟢 Perf    #858 ✅ Deploy                  |
|                                                                  |
|  Capacity: 4 of 5 assignees loaded                               |
+------------------------------------------------------------------+
```

### 3.5 Command Palette

**Command Pattern:**
```css
.command-palette {
  position: fixed;
  top: 20%;
  left: 50%;
  transform: translateX(-50%);
  width: 640px;
  max-width: 90vw;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
  z-index: 1000;
  overflow: hidden;
}

.command-palette__input {
  width: 100%;
  padding: 20px 24px;
  background: transparent;
  border: none;
  border-bottom: 1px solid #30363d;
  font-size: 16px;
  color: #c9d1d9;
  outline: none;
}

.command-palette__input::placeholder {
  color: #6e7681;
}

.command-palette__results {
  max-height: 400px;
  overflow-y: auto;
}

.command-palette__group {
  padding: 8px 0;
}

.command-palette__group-label {
  padding: 4px 20px;
  font-size: 11px;
  font-weight: 600;
  color: #8b949e;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.command-palette__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  cursor: pointer;
  font-size: 14px;
  color: #c9d1d9;
}

.command-palette__item:hover,
.command-palette__item--selected {
  background: rgba(88, 166, 255, 0.1);
}

.command-palette__shortcut {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 11px;
  color: #6e7681;
}
```

**Command Categories:**
- Navigation: Go to issues, projects, teams, settings
- Actions: Create issue, Invite member, Start cycle
- Recent: Last opened issues and projects
- Search: Full-text across all content

### 3.6 Git Integration

**Git Integration UI:**
- Branch names shown inline on issues (`frontend/auth-fix`)
- Pull request status badges (Open, Merged, Closed)
- Commit references linked to GitHub/GitLab
- Automatic issue status updates on PR merge
- "Create branch" button generates conventionally named branches

```css
.git-branch-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: #1f6feb;
  color: #ffffff;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'SF Mono', ui-monospace, monospace;
}

.git-branch-tag::before {
  content: '⎇';
  font-size: 10px;
}
```

### 3.7 Real-Time Sync

**Real-Time Indicators:**
- Cursor presence: colored cursors with user names on collaborative views
- Live updates: issue counts update without page refresh
- Typing indicators in comments
- Conflict resolution: gentle notification when concurrent edits detected

```css
.presence-cursor {
  position: absolute;
  pointer-events: none;
  z-index: 100;
}

.presence-cursor__caret {
  width: 2px;
  height: 20px;
  background: var(--user-color);
}

.presence-cursor__label {
  position: absolute;
  top: -22px;
  left: -2px;
  padding: 2px 8px;
  background: var(--user-color);
  color: #ffffff;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px 4px 4px 0;
  white-space: nowrap;
}

/* Live update pulse */
.live-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3fb950;
  position: relative;
}

.live-indicator::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid #3fb950;
  animation: live-pulse 2s infinite;
}

@keyframes live-pulse {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}
```


---

## 4. Intercom UX

### 4.1 Overview

Intercom pioneered the **conversational CRM** paradigm — centering the entire customer management experience around real-time messaging. Its UX philosophy prioritizes human connection: every interface element serves the goal of faster, more personal customer communication.

**Key Design Principles:**
- Conversation-first: the inbox is the home screen
- Speed to respond: every action reduces time-to-reply
- Context at a glance: customer data surfaces alongside conversations
- Team collaboration: mentions, assignments, and notes built-in

### 4.2 Conversation Inbox

**Wireframe Description:**

```
+------------------------------------------------------------------+
| ←  Inbox                                          [🟢 Online]    |
|                                                                  |
|  +---------------+ +--------------------------------------------+|
|  | All       23  | | Acme Corporation                           ||
|  | Open      12  | |                              [⋮] [Assign] ||
|  | Snoozed   5   | +--------------------------------------------+|
|  | Closed    142 |                                              ||
|  |               | Sarah M.                           10:42 AM  ||
|  | TEAMS         | ───────────────────────────────────────────  ||
|  | Engineering 4 | Hi, we're having trouble with the API        ||
|  | Sales      3  | authentication. Getting 401 errors on all    ||
|  | Support    8  | requests since this morning.                 ||
|  |               |                                              ||
|  | TAGS          | Mike T.                            10:45 AM  ||
|  | Bug        2  | ───────────────────────────────────────────  ||
|  | Feature    3  | Hi Sarah, let me look into this for you.     ||
|  | Billing    1  | Can you share your API key ID so I can check ||
|  |               | the logs?                                    ||
|  |               |                                              ||
|  | PRIORITY      | [Internal note]                    10:47 AM  ||
|  | 🔴 Urgent  2  | — Check rate limiting on acct_xxx —          ||
|  | 🟡 High    4  | — Escalate to engineering if API issue —     ||
|  | 🟢 Normal 17  |                                              ||
|  +---------------+ [Type a message...            ] [Send] [📎]  ||
|                  +--------------------------------------------+|
+------------------------------------------------------------------+
```

**Inbox Layout Pattern:**
```css
.inbox-layout {
  display: grid;
  grid-template-columns: 240px 320px 1fr;
  height: 100vh;
  overflow: hidden;
}

.inbox-sidebar {
  background: #f8f9fa;
  border-right: 1px solid #e9ecef;
  padding: 16px 0;
  overflow-y: auto;
}

.inbox-conversation-list {
  border-right: 1px solid #e9ecef;
  overflow-y: auto;
  background: #ffffff;
}

.inbox-main {
  display: flex;
  flex-direction: column;
  background: #ffffff;
  overflow: hidden;
}
```

**Conversation List Item:**
```css
.conversation-item {
  padding: 16px;
  border-bottom: 1px solid #f1f3f4;
  cursor: pointer;
  transition: background-color 0.1s ease;
  position: relative;
}

.conversation-item:hover {
  background-color: #f8f9fa;
}

.conversation-item--active {
  background-color: #e8f0fe;
  border-left: 3px solid #1a73e8;
}

.conversation-item--unread {
  background-color: #ffffff;
}

.conversation-item--unread .conversation-item__name {
  font-weight: 700;
}

.conversation-item__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.conversation-item__name {
  font-size: 14px;
  font-weight: 500;
  color: #202124;
}

.conversation-item__time {
  font-size: 12px;
  color: #5f6368;
}

.conversation-item__preview {
  font-size: 13px;
  color: #5f6368;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conversation-item__unread-badge {
  position: absolute;
  top: 18px;
  right: 16px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #1a73e8;
}
```

**Message Thread:**
```css
.message-thread {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.message {
  max-width: 80%;
  animation: message-enter 0.2s ease-out;
}

@keyframes message-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.message--incoming {
  align-self: flex-start;
}

.message--outgoing {
  align-self: flex-end;
}

.message__bubble {
  padding: 14px 18px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.5;
}

.message--incoming .message__bubble {
  background: #f1f3f4;
  color: #202124;
  border-bottom-left-radius: 4px;
}

.message--outgoing .message__bubble {
  background: #1a73e8;
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.message__meta {
  font-size: 11px;
  color: #5f6368;
  margin-top: 6px;
  padding: 0 6px;
}

/* Internal note styling */
.message--internal .message__bubble {
  background: #fef3c7;
  color: #92400e;
  border: 1px dashed #fbbf24;
  border-bottom-left-radius: 4px;
}

.message--internal .message__meta {
  color: #d97706;
}
```

**Composer Component:**
```css
.composer {
  padding: 16px 24px;
  border-top: 1px solid #e9ecef;
  background: #ffffff;
}

.composer__input {
  width: 100%;
  min-height: 48px;
  max-height: 200px;
  padding: 12px 16px;
  border: 1px solid #dadce0;
  border-radius: 24px;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.composer__input:focus {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}

.composer__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding: 0 8px;
}
```

### 4.3 Customer Profiles

**Profile Sidebar:**
```
+------------------------------------------------------------------+
| Customer Profile — Acme Corporation                              |
|                                                                  |
|  📊 Health Score: 87/100                                         |
|  [████████████████████░░░░] Healthy                              |
|                                                                  |
|  CONTACT                                                         |
|  john.doe@acme.com                [📧] [Message]                |
|  +1 (555) 123-4567                [📞]                           |
|  San Francisco, CA                                               |
|                                                                  |
|  COMPANY                                                         |
|  Acme Corporation                   [View company →]             |
|  250 employees                                                   |
|  Technology / SaaS                                               |
|  MRR: $2,400                                                     |
|                                                                  |
|  ACTIVITY                                                        |
|  Last seen: 2 hours ago                                          |
|  Signup: Mar 15, 2024                                            |
|  Sessions: 142                                                   |
|                                                                  |
|  TAGS                              [+ Add tag]                   |
|  [Enterprise] [API User] [NPS 9]                                 |
|                                                                  |
|  NOTES                                                           |
|  — Upgrading to Enterprise plan next quarter —                   |
|  — Primary contact: John Doe (CTO) —                             |
+------------------------------------------------------------------+
```

```css
.profile-panel {
  width: 320px;
  background: #f8f9fa;
  border-left: 1px solid #e9ecef;
  padding: 24px;
  overflow-y: auto;
}

.profile-section {
  margin-bottom: 24px;
}

.profile-section__title {
  font-size: 11px;
  font-weight: 600;
  color: #5f6368;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 12px;
}

.health-score {
  margin-bottom: 20px;
}

.health-score__bar {
  height: 8px;
  background: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.health-score__fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.health-score__fill--healthy { background: linear-gradient(90deg, #34a853, #81c995); }
.health-score__fill--at-risk  { background: linear-gradient(90deg, #f9ab00, #fde293); }
.health-score__fill--churning { background: linear-gradient(90deg, #ea4335, #f28b82); }

.profile-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: #e8eaed;
  border-radius: 16px;
  font-size: 12px;
  color: #3c4043;
  margin: 0 6px 6px 0;
}
```

### 4.4 Team Workload

**Workload Dashboard:**
```
+------------------------------------------------------------------+
| Team Workload                                                    |
|                                                                  |
|  +------------------+ +------------------+ +------------------+  |
|  | Sarah M.         | | Mike T.          | | Alex K.          |  |
|  | ████████░░ 8    | | ██████░░░░ 6     | | ██████████ 12 ⚠️|  |
|  | Avg reply: 4m   | | Avg reply: 12m   | | Avg reply: 28m  |  |
|  | CSAT: 4.8/5    | | CSAT: 4.6/5     | | CSAT: 4.2/5    |  |
|  +------------------+ +------------------+ +------------------+  |
|                                                                  |
|  Unassigned conversations: 4  [Auto-assign rules]                |
|                                                                  |
|  Today's trend:                                                  |
|  [Sparkline: conversation volume throughout the day]             |
+------------------------------------------------------------------+
```

### 4.5 Resolution Time Tracking

**Metrics Cards:**
```css
.metric-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e9ecef;
}

.metric-card__value {
  font-size: 32px;
  font-weight: 700;
  color: #202124;
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}

.metric-card__label {
  font-size: 13px;
  color: #5f6368;
  margin-bottom: 12px;
}

.metric-card__trend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.metric-card__trend--positive {
  background: #e6f4ea;
  color: #1e8e3e;
}

.metric-card__trend--negative {
  background: #fce8e6;
  color: #d93025;
}
```

**Key Resolution Metrics:**
- First response time: median time to first reply
- Resolution time: median time from open to close
- CSAT score: customer satisfaction rating (1-5)
- Conversation rating: thumbs up/down per conversation
- Reply count: average messages per resolution

### 4.6 Outbound Messaging

**Outbound Composer:**
- Full-screen modal overlay
- Audience builder with segment filters
- Message type selector: Chat, Email, Push, Post
- A/B test configuration
- Preview panel showing message on web/mobile
- Schedule send or send now

```css
.outbound-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(32, 33, 36, 0.6);
  backdrop-filter: blur(4px);
}

.outbound-modal__content {
  width: 900px;
  max-width: 95vw;
  max-height: 90vh;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
```

### 4.7 Product Tours

**Tour Builder:**
- Visual step editor with screenshot annotation
- Pointer types: tooltip, highlight, modal
- Trigger configuration: URL match, element click, time delay
- Step sequencing with branching logic
- Preview mode with device frame selector

```css
.tour-tooltip {
  position: absolute;
  background: #ffffff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  max-width: 320px;
  z-index: 10000;
}

.tour-tooltip__arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #ffffff;
  transform: rotate(45deg);
}

.tour-highlight {
  position: absolute;
  border-radius: 8px;
  box-shadow: 0 0 0 4px #1a73e8, 0 0 0 9999px rgba(0, 0, 0, 0.5);
  z-index: 9999;
  animation: highlight-pulse 2s infinite;
}

@keyframes highlight-pulse {
  0%, 100% { box-shadow: 0 0 0 4px #1a73e8, 0 0 0 9999px rgba(0, 0, 0, 0.5); }
  50% { box-shadow: 0 0 0 6px #1a73e8, 0 0 0 9999px rgba(0, 0, 0, 0.5); }
}
```

---

## 5. Retool UX

### 5.1 Overview

Retool is the definitive **internal tool builder** — a visual IDE for creating admin dashboards, CRUD apps, and operational tools. Its UX centers on the principle that developers should write SQL/JavaScript while the platform handles the UI scaffolding.

**Key Design Principles:**
- Code when you need it, GUI when you don't
- Live data preview at every step
- Instant deploy: no build step between edit and use
- Extensibility: custom components, custom JS, custom queries

### 5.2 Query Builder

**Wireframe Description:**

```
+------------------------------------------------------------------+
| [App: User Admin]                              [Preview] [Share] |
|                                                                  |
|  +----------+ +------------------------------------------------+|
|  | Pages    | |  Code    [Query Library] [Transformers] [+ ▼]  ||
|  |          | +------------------------------------------------+|
|  | • Users  |                                                  ||
|  | • Orders |  [postgres_db ▼] [query1]          [Run] [⚡Auto]||
|  | • Analytics|                                                ||
|  |          |  ┌─────────────────────────────────────────────┐ ||
|  |          |  │ SELECT * FROM users                          │ ||
|  |          |  │ WHERE created_at >= {{ dateRange.start }}    │ ||
|  |          |  │   AND status = {{ statusFilter.value }}      │ ||
|  |          |  │ ORDER BY {{ table1.sortColumn }}             │ ||
|  |          |  │   {{ table1.sortDirection }}                 │ ||
|  |          |  │ LIMIT {{ table1.pageSize }}                  │ ||
|  |          |  │ OFFSET {{ table1.pageOffset }}               │ ||
|  |          |  └─────────────────────────────────────────────┘ ||
|  |          |                                                  ||
|  |          |  [Query variable: statusFilter] [String ▼]      ||
|  |          |  Default value: "active"                         ||
|  |          |                                                  ||
|  |          |  Results: (42 rows, 23ms)  [JSON] [Table]       ||
|  |          |  ┌─────────────────────────────────────────┐    ||
|  |          |  │ id │ name    │ email           │ status │    ||
|  |          |  │─── │ ──────  │ ─────────────   │ ────── │    ||
|  |          |  │ 1  │ John D. │ john@acme.com   │ active │    ||
|  |          |  │ 2  │ Jane S. │ jane@globex.com │ active │    ||
|  |          |  │ 3  │ Bob W.  │ bob@initech.com │ pending│    ||
|  |          |  └─────────────────────────────────────────┘    ||
|  +----------+ +------------------------------------------------+|
+------------------------------------------------------------------+
```

**Query Editor Pattern:**
```css
.query-editor {
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
  font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
}

.query-editor__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #3e3e3e;
}

.query-editor__code {
  padding: 16px;
  min-height: 200px;
  color: #d4d4d4;
  font-size: 13px;
  line-height: 1.6;
  tab-size: 2;
  overflow-x: auto;
}

/* Syntax highlighting */
.query-editor__code .keyword { color: #569cd6; }
.query-editor__code .string  { color: #ce9178; }
.query-editor__code .number  { color: #b5cea8; }
.query-editor__code .comment { color: #6a9955; }
.query-editor__code .template {
  background: rgba(255, 215, 0, 0.15);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 4px;
  padding: 1px 4px;
  color: #ffd700;
}
```

**Query Variable Input:**
```css
.query-variable {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-top: 12px;
}

.query-variable__label {
  font-size: 13px;
  font-weight: 500;
  color: #5f6368;
  min-width: 120px;
}

.query-variable__input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #dadce0;
  border-radius: 6px;
  font-size: 13px;
  font-family: 'SF Mono', ui-monospace, monospace;
  background: #ffffff;
}
```

### 5.3 Component Library

**Component Palette:**
- Left sidebar with categorized components
- Drag-and-drop onto canvas
- Categories: Input (Text, Number, Select, Checkbox, Date), Display (Text, Image, Statistic), Data (Table, List, Chart), Layout (Container, Tabs, Modal, Form), Buttons (Primary, Link, Icon)

```css
.component-palette {
  width: 260px;
  background: #f8f9fa;
  border-right: 1px solid #dadce0;
  padding: 16px;
  overflow-y: auto;
}

.component-category {
  margin-bottom: 20px;
}

.component-category__title {
  font-size: 11px;
  font-weight: 600;
  color: #5f6368;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 8px 0;
  margin-bottom: 4px;
}

.component-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: grab;
  transition: background-color 0.1s ease;
  font-size: 13px;
  color: #202124;
}

.component-item:hover {
  background: #e8eaed;
}

.component-item__icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #dadce0;
  border-radius: 6px;
  font-size: 14px;
}
```

### 5.4 Table Component with Inline Editing

**Table Configuration:**
```
+------------------------------------------------------------------+
| Table: usersTable                                                |
|                                                                  |
|  Data: {{ query1.data }}                                         |
|                                                                  |
|  Columns:                                                        |
|  ┌─────────────┬──────────┬──────────┬──────────┬──────────────┐|
|  │ Column      │ Type     │ Label    │ Mapped   │ Actions      │|
|  │─────────────│──────────│──────────│──────────│──────────────│|
|  │ id          │ Number   │ ID       │ {{id}}   │ Sort, Filter │|
|  │ name        │ String   │ Name     │ {{name}} │ Sort, Filter │|
|  │ email       │ String   │ Email    │ {{email}}│ Sort, Filter │|
|  │ status      │ Tag      │ Status   │ {{status│ Color map    │|
|  │ created_at  │ Date     │ Created  │ {{create│ Sort         │|
|  │ actions     │ Button   │ —        │ —        │ Edit, Delete │|
|  └─────────────┴──────────┴──────────┴──────────┴──────────────┘|
|                                                                  |
|  Settings:                                                       |
|  [✓] Pagination                [✓] Searchable                   |
|  [✓] Sortable                  [✓] Downloadable                 |
|  [✓] Filterable                [ ] Multi-select                 |
|  [✓] Row selection             [✓] Dense mode                   |
+------------------------------------------------------------------+
```

**Inline Edit Pattern:**
```css
.table-cell--editable {
  cursor: pointer;
  position: relative;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 6px;
  margin: -2px -6px;
  transition: border-color 0.1s ease, background 0.1s ease;
}

.table-cell--editable:hover {
  border-color: #1a73e8;
  background: #e8f0fe;
}

.table-cell--editing {
  padding: 0;
  border: none;
}

.table-cell__input {
  width: 100%;
  padding: 8px 12px;
  border: 2px solid #1a73e8;
  border-radius: 4px;
  font-size: inherit;
  font-family: inherit;
  outline: none;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.15);
}
```

### 5.5 Form Builder

**Form Configuration:**
- Drag fields from component palette into form container
- Field types map to database types
- Validation rules: required, min/max, regex, custom
- Dynamic visibility: show/hide fields based on other field values
- Submit handler: runs query on form submit
- Success/error toasts

```css
.form-builder__field {
  padding: 16px;
  background: #ffffff;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  margin-bottom: 12px;
  position: relative;
}

.form-builder__field--dragging {
  opacity: 0.5;
  border-style: dashed;
  border-color: #1a73e8;
}

.form-builder__field-label {
  font-size: 13px;
  font-weight: 500;
  color: #202124;
  margin-bottom: 6px;
  display: block;
}

.form-builder__field-required::after {
  content: ' *';
  color: #d93025;
}
```

### 5.6 Event Handlers

**Event Configuration UI:**
```
+------------------------------------------------------------------+
| Event Handlers — button1                                         |
|                                                                  |
|  When button1 is clicked:                                        |
|  ┌──────────────────────────────────────────────────────────────┐|
|  │ Trigger: Click                                               │|
|  │                                                              │|
|  │ Actions (run in order):                                      │|
|  │ 1. Run query: updateUserStatus                               │|
|  │    Parameters: { userId: {{ usersTable.selectedRow.id }} }   │|
|  │                                                              │|
|  │ 2. Show notification: "Status updated successfully"          │|
|  │    Type: Success    Duration: 3s                             │|
|  │                                                              │|
|  │ 3. Refresh query: query1                                     │|
|  │                                                              │|
|  │ 4. Close modal: editUserModal                                │|
|  │                                                              │|
|  │ [+ Add action]                                               │|
|  └──────────────────────────────────────────────────────────────┘|
|                                                                  |
|  [+ Add handler]  (e.g., Double-click, Right-click, Submit)     |
+------------------------------------------------------------------+
```

```css
.event-handler {
  background: #f8f9fa;
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
}

.event-handler__trigger {
  font-size: 14px;
  font-weight: 600;
  color: #202124;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e9ecef;
}

.event-action {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: #ffffff;
  border-radius: 8px;
  margin-bottom: 8px;
  border: 1px solid #e9ecef;
}

.event-action__number {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e8eaed;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  color: #5f6368;
  flex-shrink: 0;
}
```

### 5.7 Custom JavaScript

**Transformer/JS Editor:**
- Monaco Editor (VS Code) integration for syntax highlighting
- Auto-completion for query data and component properties
- Error highlighting and runtime error display
- Console output panel for debugging
- Import external libraries via URL

```javascript
// Example transformer pattern
const data = {{ query1.data }};
const formatted = data.map(user => ({
  ...user,
  fullName: `${user.firstName} ${user.lastName}`,
  daysSinceLogin: moment().diff(moment(user.lastLoginAt), 'days'),
  healthScore: calculateHealthScore(user),
  tier: user.mrr > 1000 ? 'Enterprise' : user.mrr > 100 ? 'Pro' : 'Basic'
}));
return formatted;
```

---

## 6. Datadog UX

### 6.1 Overview

Datadog represents the state of the art for **observability platform UX** — unifying metrics, logs, traces, and alerts into a coherent operational dashboard. Its design prioritizes data density, query flexibility, and collaborative incident response.

**Key Design Principles:**
- Data density: maximum information per square inch
- Query-first: every view starts with a query language
- Context preservation: traces link to logs link to metrics
- Collaboration: notebooks, incidents, and shared dashboards

### 6.2 Host Map

**Wireframe Description:**

```
+------------------------------------------------------------------+
| Infrastructure Host Map                             [Guide] [⚙️] |
|                                                                  |
|  Group by: [Service ▼]  Fill by: [CPU % ▼]  Size by: [RAM ▼]   |
|                                                                  |
|  ┌─────────────────────────────────────────────────────────────┐|
|  │  api-service               web-service          db-service │|
|  │                                                             │|
|  │  ┌─────┐ ┌─────┐          ┌─────┐ ┌─────┐     ┌─────┐    │|
|  │  │ 23% │ │ 45% │          │ 12% │ │ 18% │     │ 67% │ ⚠️  │|
|  │  │api-1│ │api-2│          │web-1│ │web-2│     │db-01│    │|
|  │  └─────┘ └─────┘          └─────┘ └─────┘     └─────┘    │|
|  │  ┌─────┐                  ┌─────┐ ┌─────┐     ┌─────┐    │|
|  │  │ 89% │ 🔴               │ 5%  │ │ 7%  │     │ 82% │    │|
|  │  │api-3│                  │web-3│ │web-4│     │db-02│    │|
|  │  └─────┘                  └─────┘ └─────┘     └─────┘    │|
|  │                                                             │|
|  │  cache-service          worker-service                      │|
|  │                                                             │|
|  │  ┌─────┐ ┌─────┐         ┌─────┐ ┌─────┐                  │|
|  │  │ 15% │ │ 22% │         │ 34% │ │ 41% │                  │|
|  │  │c-01 │ │c-02 │         │w-01 │ │w-02 │                  │|
|  │  └─────┘ └─────┘         └─────┘ └─────┘                  │|
|  └─────────────────────────────────────────────────────────────┘|
|                                                                  |
|  Legend:  [🟢 0-25%] [🟡 25-50%] [🟠 50-75%] [🔴 75-100%]     |
+------------------------------------------------------------------+
```

**Host Map Pattern:**
```css
.host-map {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  padding: 24px;
}

.host-group {
  border: 1px solid #e9ecef;
  border-radius: 12px;
  padding: 20px;
  min-width: 280px;
}

.host-group__title {
  font-size: 13px;
  font-weight: 600;
  color: #5f6368;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 16px;
}

.host-group__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.host-node {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  position: relative;
}

.host-node:hover {
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10;
}

/* Heatmap color coding */
.host-node--low    { background: #d4edda; color: #155724; }
.host-node--medium { background: #fff3cd; color: #856404; }
.host-node--high   { background: #f8d7da; color: #721c24; }
.host-node--critical { background: #dc3545; color: #ffffff; animation: host-pulse 2s infinite; }

@keyframes host-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(220, 53, 69, 0); }
}

.host-node__value {
  font-size: 18px;
  font-weight: 700;
}

.host-node__name {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.8;
}

.host-node__alert {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  background: #dc3545;
  border-radius: 50%;
  border: 2px solid #ffffff;
}
```

### 6.3 Time-Series Dashboards

**Dashboard Grid:**
```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 16px;
  padding: 24px;
  background: #f8f9fa;
  min-height: 100vh;
}

.dashboard-widget {
  background: #ffffff;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  grid-column: span 12; /* Half width */
}

.dashboard-widget--full  { grid-column: span 24; }
.dashboard-widget--third { grid-column: span 8; }
.dashboard-widget--quarter { grid-column: span 6; }

.dashboard-widget__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #e9ecef;
}

.dashboard-widget__title {
  font-size: 13px;
  font-weight: 600;
  color: #202124;
}

.dashboard-widget__actions {
  display: flex;
  gap: 8px;
}

.dashboard-widget__content {
  padding: 16px;
  height: 300px;
}
```

**Graph Configuration:**
- Query input with Datadog Query Language (DQL)
- Visualization type: Timeseries, Query Value, Toplist, Heatmap, Distribution, Treemap
- Display options: Line, Area, Bars, Stacked
- Annotations: overlay events, deployments, alerts
- Legends: show/hide, positioning
- Markers: threshold lines, bands, ranges

### 6.4 Log Explorer

**Wireframe Description:**

```
+------------------------------------------------------------------+
| Log Explorer                                                     |
|                                                                  |
|  Source: [service:api ▼]  Status: [error ▼]  Time: [Last 1h ▼] |
|                                                                  |
|  [Search logs... (e.g., @http.status_code:500)          ]       |
|                                                                  |
|  Jan 15, 10:42:23  api-1  ERROR  Database connection timeout    |
|  ─────────────────────────────────────────────────────────────  |
|  ┌─────────────────────────────────────────────────────────────┐|
|  │ @timestamp:  2025-01-15T10:42:23.142Z                       │|
|  │ @host:       api-1.prod                                     │|
|  │ @service:    api                                            │|
|  │ @status:     error                                          │|
|  │ @message:    Database connection timeout after 30000ms      │|
|  │ @trace_id:   abc123def456                                   │|
|  │ @duration:   30000                                          │|
|  │ @http.url:   /api/v1/users                                  │|
|  │ @http.method GET                                            │|
|  │ @http.status_code: 500                                      │|
|  │                                                             │|
|  │  { "stack": "ConnectionTimeoutError...", "query": "SELECT   │|
|  │    * FROM users WHERE id = ?", "params": [12345] }          │|
|  └─────────────────────────────────────────────────────────────┘|
|                                                                  |
|  Jan 15, 10:42:21  api-2  WARN   Slow query detected            |
|  Jan 15, 10:42:18  api-1  INFO   Request completed              |
|  Jan 15, 10:42:15  api-3  ERROR  Authentication failed          |
+------------------------------------------------------------------+
```

**Log Row Pattern:**
```css
.log-row {
  padding: 10px 16px;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: background-color 0.05s ease;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 13px;
  display: grid;
  grid-template-columns: 160px 80px 60px 1fr;
  gap: 12px;
  align-items: center;
}

.log-row:hover {
  background-color: #f8f9fa;
}

.log-row--expanded {
  background-color: #f0f4f8;
  border-left-color: #1a73e8;
}

.log-row--error  { border-left-color: #dc3545; }
.log-row--warn   { border-left-color: #f9ab00; }
.log-row--info   { border-left-color: #34a853; }

.log-row__timestamp {
  color: #5f6368;
  font-size: 12px;
  white-space: nowrap;
}

.log-row__host {
  color: #1a73e8;
  font-size: 12px;
}

.log-row__level {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
}

.log-row__level--error { background: #fce8e6; color: #c5221f; }
.log-row__level--warn  { background: #fef7e0; color: #b06000; }
.log-row__level--info  { background: #e6f4ea; color: #1e8e3e; }

.log-row__message {
  color: #202124;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Log detail panel */
.log-detail {
  padding: 20px;
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 8px;
  margin: 8px 16px 16px;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 13px;
  line-height: 1.7;
}

.log-detail__field {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 16px;
  padding: 4px 0;
}

.log-detail__key {
  color: #9cdcfe;
}

.log-detail__value {
  color: #ce9178;
}

.log-detail__value--string { color: #ce9178; }
.log-detail__value--number { color: #b5cea8; }
.log-detail__value--null   { color: #569cd6; }
```

**Faceted Search Sidebar:**
```css
.log-facets {
  width: 240px;
  border-right: 1px solid #e9ecef;
  padding: 16px;
  overflow-y: auto;
}

.facet-group {
  margin-bottom: 20px;
}

.facet-group__title {
  font-size: 11px;
  font-weight: 600;
  color: #5f6368;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.facet-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background-color 0.1s ease;
}

.facet-item:hover {
  background: #e8f0fe;
}

.facet-item__value {
  color: #202124;
}

.facet-item__count {
  font-size: 12px;
  color: #5f6368;
  background: #e9ecef;
  padding: 2px 8px;
  border-radius: 10px;
}
```

### 6.5 APM Traces

**Trace Visualization (Flame Graph):**
```css
.trace-flame {
  width: 100%;
  overflow-x: auto;
  font-family: 'SF Mono', ui-monospace, monospace;
}

.flame-bar {
  height: 28px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-radius: 4px;
  margin-bottom: 2px;
  font-size: 12px;
  color: #ffffff;
  cursor: pointer;
  transition: filter 0.1s ease;
  position: relative;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flame-bar:hover {
  filter: brightness(1.1);
  z-index: 10;
}

/* Service color coding */
.flame-bar--api      { background: #1a73e8; }
.flame-bar--database { background: #34a853; }
.flame-bar--cache    { background: #f9ab00; }
.flame-bar--external { background: #9334e6; }
.flame-bar--render   { background: #ea4335; }

.flame-bar__time {
  position: absolute;
  right: 10px;
  font-size: 11px;
  opacity: 0.8;
}
```

**Trace Detail Sidebar:**
- Span name, service, operation
- Timing breakdown: self time vs total time
- Tags/attributes table
- Logs associated with span
- Error details if failed
- Reference to parent/children spans

### 6.6 Alert Management

**Alert List:**
```
+------------------------------------------------------------------+
| Alerts                                                           |
|                                                                  |
|  [Triggered 3] [Muted 1] [Resolved today 12]                     |
|                                                                  |
|  Status  Alert name              Source       Duration  Severity |
|  ──────────────────────────────────────────────────────────────  |
|  🔴      DB CPU > 80%            db-service   45m       Critical |
|  🟠      API Latency > 500ms     api-service  12m       High     |
|  🟡      Disk usage > 85%        cache-01     2h        Medium   |
|  ──────────────────────────────────────────────────────────────  |
|  [Acknowledge] [Mute] [Escalate] [View in dashboard]            |
+------------------------------------------------------------------+
```

```css
.alert-row {
  display: grid;
  grid-template-columns: 40px 1fr 120px 80px 80px;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #e9ecef;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.alert-row:hover {
  background-color: #f8f9fa;
}

.alert-row--critical { border-left: 3px solid #dc3545; }
.alert-row--high     { border-left: 3px solid #f9ab00; }
.alert-row--medium   { border-left: 3px solid #1a73e8; }
.alert-row--low      { border-left: 3px solid #5f6368; }

.alert-status {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.alert-status--triggered { background: #dc3545; animation: alert-blink 1s infinite; }
.alert-status--ack       { background: #f9ab00; }
.alert-status--resolved  { background: #34a853; }
.alert-status--muted     { background: #5f6368; }

@keyframes alert-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
```

### 6.7 Notebook Collaboration

**Notebook Pattern:**
- Markdown + cell-based editor (Jupyter-style)
- Cell types: Text (markdown), Graph (widget), Data (table), Code (custom)
- Real-time collaborative editing (multiple cursors)
- Comments on specific cells
- Version history with diff view
- Export to PDF, shareable link

```css
.notebook-cell {
  margin-bottom: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  position: relative;
}

.notebook-cell:hover {
  border-color: #dadce0;
}

.notebook-cell--focused {
  border-color: #1a73e8;
  box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.1);
}

.notebook-cell__gutter {
  position: absolute;
  left: -48px;
  width: 40px;
  text-align: right;
  padding-top: 8px;
}

.notebook-cell__actions {
  position: absolute;
  top: 4px;
  right: 8px;
  display: none;
  gap: 4px;
}

.notebook-cell:hover .notebook-cell__actions,
.notebook-cell--focused .notebook-cell__actions {
  display: flex;
}

.notebook-cell__add-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  color: #5f6368;
  font-size: 13px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.notebook-cell:hover + .notebook-cell__add-button,
.notebook-cell__add-button:hover {
  opacity: 1;
}
```

---

## 7. SaaS Dashboard Design Patterns

### 7.1 KPI Card Layouts

**Pattern Catalog:**

```
+-------------------------------------------------------------+
| Layout 1: Standard Grid (3-4 columns)                       |
|                                                             |
|  +----------+  +----------+  +----------+  +----------+    |
|  | $48.2K   |  | 1,247    |  | $38.72   |  | 98.4%    |    |
|  | Revenue  |  | Customers|  | ARPU     |  | Uptime   |    |
|  | ↑12.3%   |  | ↑8.1%    |  | ↑3.2%    |  | —        |    |
|  +----------+  +----------+  +----------+  +----------+    |
|                                                             |
+-------------------------------------------------------------+
| Layout 2: Featured + Supporting                             |
|                                                             |
|  +----------------------+  +----------+  +----------+      |
|  | $48,291.00           |  | 1,247    |  | $38.72   |      |
|  | Total Revenue        |  | Customers|  | ARPU     |      |
|  | ↑ 12.3% vs last mo   |  | ↑8.1%    |  | ↑3.2%    |      |
|  +----------------------+  +----------+  +----------+      |
|                                                             |
+-------------------------------------------------------------+
| Layout 3: Comparison Period                                 |
|                                                             |
|  +------------------------------------------------------+  |
|  | This Month: $48,291    |    Last Month: $43,012       |  |
|  |                    ↑ 12.3%                             |  |
|  | [||||||||||||||||||||░░░░░░░░░░] Progress to goal     |  |
|  +------------------------------------------------------+  |
|                                                             |
+-------------------------------------------------------------+
| Layout 4: Sparkline Integration                             |
|                                                             |
|  +------------------------------------------------------+  |
|  | MRR: $48,291                     [sparkline chart]   |  |
|  | ↑ 12.3% (+$5,279)                    ~ ~ ~ ~ /\      |  |
|  |                                    _/        \       |  |
|  +------------------------------------------------------+  |
|                                                             |
+-------------------------------------------------------------+
```

```css
/* Layout 1: Standard Grid */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

/* Layout 2: Featured */
.kpi-grid--featured {
  grid-template-columns: 2fr 1fr 1fr;
}

/* Layout 3: Comparison */
.kpi-comparison {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 24px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.kpi-comparison__current {
  text-align: center;
}

.kpi-comparison__current-value {
  font-size: 36px;
  font-weight: 700;
  color: #1a1a2e;
}

.kpi-comparison__divider {
  width: 1px;
  height: 60px;
  background: #e5e7eb;
}

.kpi-comparison__trend {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.kpi-comparison__trend-value {
  font-size: 20px;
  font-weight: 600;
  color: #10b981;
}

/* Layout 4: Sparkline */
.kpi-sparkline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  background: #ffffff;
  border-radius: 12px;
}

.kpi-sparkline__text {
  flex: 1;
}

.kpi-sparkline__chart {
  width: 200px;
  height: 60px;
}
```

**Card Hover Effects:**
```css
.kpi-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.kpi-card__sparkline {
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.kpi-card:hover .kpi-card__sparkline {
  opacity: 1;
}
```

### 7.2 Chart Types

**Line Chart Pattern:**
```css
.chart-container {
  position: relative;
  width: 100%;
  height: 300px;
}

.chart-line {
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.chart-line--primary   { stroke: #635bff; }
.chart-line--secondary { stroke: #10b981; }
.chart-line--tertiary  { stroke: #f59e0b; }

.chart-area {
  opacity: 0.1;
}

.chart-area--primary   { fill: #635bff; }
.chart-area--secondary { fill: #10b981; }

.chart-grid-line {
  stroke: #e5e7eb;
  stroke-width: 1;
  stroke-dasharray: 4, 4;
}

.chart-axis-text {
  font-size: 11px;
  fill: #9ca3af;
}

.chart-tooltip {
  position: absolute;
  background: #1a1a2e;
  color: #ffffff;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.chart-tooltip__value {
  font-weight: 600;
  font-size: 16px;
}

.chart-tooltip__label {
  color: #9ca3af;
  font-size: 11px;
  margin-top: 2px;
}
```

**Bar Chart Pattern:**
```css
.chart-bar {
  transition: opacity 0.15s ease;
}

.chart-bar:hover {
  opacity: 0.8;
}

.chart-bar--positive { fill: #10b981; }
.chart-bar--negative { fill: #ef4444; }
```

**Pie/Donut Chart Pattern:**
```css
.chart-donut {
  transform: rotate(-90deg);
}

.chart-donut__segment {
  transition: stroke-width 0.2s ease;
  cursor: pointer;
}

.chart-donut__segment:hover {
  stroke-width: 28;
}

.chart-donut__center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.chart-donut__center-value {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a2e;
}

.chart-donut__center-label {
  font-size: 12px;
  color: #9ca3af;
}
```

**Funnel Chart Pattern:**
```css
.funnel-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.funnel-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  color: #ffffff;
  transition: transform 0.15s ease;
  position: relative;
}

.funnel-stage:hover {
  transform: scale(1.02);
}

.funnel-stage__value {
  font-size: 24px;
  font-weight: 700;
}

.funnel-stage__label {
  font-size: 12px;
  opacity: 0.9;
}

.funnel-stage__conversion {
  font-size: 11px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  margin-top: 6px;
}

.funnel-connector {
  width: 0;
  height: 0;
  border-left: 12px solid transparent;
  border-right: 12px solid transparent;
  border-top: 10px solid currentColor;
  opacity: 0.5;
}
```

### 7.3 Table Design

**Sortable Table:**
```css
.table-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #f9fafb;
}

.table-header__cell {
  padding: 12px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: left;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.table-header__cell:hover {
  color: #374151;
  background: #f3f4f6;
}

.table-header__sort-icon {
  display: inline-block;
  margin-left: 6px;
  opacity: 0.3;
  transition: opacity 0.15s ease;
}

.table-header__cell--sorted .table-header__sort-icon {
  opacity: 1;
  color: #635bff;
}

.table-row {
  transition: background-color 0.08s ease;
}

.table-row:hover {
  background-color: #f9fafb;
}

.table-row--selected {
  background-color: #eef2ff;
}

.table-cell {
  padding: 14px 16px;
  font-size: 14px;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
}
```

**Column Types:**
```css
/* Text column */
.table-cell--text {
  color: #111827;
}

/* Number column - right aligned, monospace */
.table-cell--number {
  text-align: right;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

/* Currency column */
.table-cell--currency {
  text-align: right;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

/* Date column */
.table-cell--date {
  color: #6b7280;
  font-size: 13px;
  white-space: nowrap;
}

/* Status badge column */
.table-cell--status {
  text-align: center;
}

/* Action column */
.table-cell--actions {
  text-align: right;
  white-space: nowrap;
}

.table-cell--actions button {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.table-row:hover .table-cell--actions button {
  opacity: 1;
}
```

**Pagination Pattern:**
```css
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-top: 1px solid #e5e7eb;
}

.pagination__info {
  font-size: 13px;
  color: #6b7280;
}

.pagination__controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pagination__button {
  min-width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: all 0.1s ease;
}

.pagination__button:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.pagination__button--active {
  background: #635bff;
  color: #ffffff;
  border-color: #635bff;
}

.pagination__button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
```

### 7.4 Search Patterns

**Global Search:**
```css
.global-search {
  position: relative;
  width: 100%;
  max-width: 600px;
}

.global-search__input {
  width: 100%;
  padding: 12px 16px 12px 44px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
  font-size: 14px;
  color: #111827;
  transition: all 0.2s ease;
}

.global-search__input:focus {
  outline: none;
  background: #ffffff;
  border-color: #635bff;
  box-shadow: 0 0 0 4px rgba(99, 91, 255, 0.1);
}

.global-search__icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
}

.global-search__kbd {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  padding: 3px 8px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'SF Mono', ui-monospace, monospace;
  color: #9ca3af;
}
```

**Search Results Dropdown:**
```css
.search-results {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  max-height: 500px;
  overflow-y: auto;
}

.search-results__group {
  padding: 8px 0;
}

.search-results__group-label {
  padding: 6px 16px;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.search-result {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.08s ease;
}

.search-result:hover,
.search-result--highlighted {
  background-color: #f3f4f6;
}

.search-result__icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef2ff;
  border-radius: 8px;
  color: #635bff;
  font-size: 14px;
}

.search-result__content {
  flex: 1;
  min-width: 0;
}

.search-result__title {
  font-size: 14px;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-result__subtitle {
  font-size: 12px;
  color: #9ca3af;
}
```

**Inline Table Search:**
```css
.table-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.table-search__input {
  flex: 1;
  padding: 8px 12px 8px 36px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #ffffff;
}

.table-search__input:focus {
  outline: none;
  border-color: #635bff;
}

.table-search__count {
  font-size: 13px;
  color: #6b7280;
}
```

### 7.5 Filter Patterns

**Filter Chip Bar:**
```css
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 20px;
  font-size: 13px;
  color: #4338ca;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-chip:hover {
  background: #e0e7ff;
}

.filter-chip__remove {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 10px;
  transition: background-color 0.1s ease;
}

.filter-chip__remove:hover {
  background: #c7d2fe;
}

.filter-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px dashed #d1d5db;
  border-radius: 20px;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-add:hover {
  border-color: #635bff;
  color: #635bff;
}

.filter-clear {
  font-size: 13px;
  color: #ef4444;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px 10px;
}

.filter-clear:hover {
  text-decoration: underline;
}
```

**Advanced Filter Panel:**
```
+------------------------------------------------------+
| Filters                                              |
|                                                      |
|  Match: [All conditions ▼] [Any conditions ▼]       |
|                                                      |
|  ┌─────────────────────────────────────────────────┐ |
|  │ Where [Status ▼] [is ▼] [Active ▼]        [✕] │ |
|  │ And   [Created ▼] [is after ▼] [Jan 1 ▼]  [✕] │ |
|  │ And   [MRR ▼] [is greater than ▼] [1000]  [✕] │ |
|  └─────────────────────────────────────────────────┘ |
|                                                      |
|  [+ Add filter]                              [Apply] |
+------------------------------------------------------+
```

### 7.6 Date Range Selectors

**Date Range Picker:**
```css
.date-range-picker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #ffffff;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: all 0.15s ease;
}

.date-range-picker:hover {
  border-color: #9ca3af;
}

.date-range-picker__calendar {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
  z-index: 1000;
  padding: 20px;
}

.date-presets {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 16px;
  border-right: 1px solid #e5e7eb;
  margin-right: 16px;
}

.date-preset {
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.1s ease;
  white-space: nowrap;
}

.date-preset:hover {
  background: #f3f4f6;
}

.date-preset--active {
  background: #eef2ff;
  color: #4338ca;
  font-weight: 500;
}
```

**Common Date Presets:**
- Today, Yesterday
- Last 7 days, Last 30 days, Last 90 days
- This week, This month, This quarter, This year
- Previous week, Previous month, Previous quarter, Previous year
- Custom range (opens calendar picker)
- All time

### 7.7 Responsive Design

**Breakpoint System:**
```css
/* Mobile first approach */
:root {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;
}

/* Container */
.container {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 16px;
}

@media (min-width: 768px) {
  .container {
    padding: 0 24px;
  }
}

@media (min-width: 1280px) {
  .container {
    padding: 0 32px;
  }
}

/* Responsive grid */
.responsive-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .responsive-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .responsive-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
}

@media (min-width: 1280px) {
  .responsive-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Responsive sidebar */
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 260px;
  transform: translateX(-100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 100;
}

.sidebar--open {
  transform: translateX(0);
}

@media (min-width: 1024px) {
  .sidebar {
    position: relative;
    transform: none;
  }
  
  .sidebar-toggle {
    display: none;
  }
}

/* Responsive table */
.data-table {
  display: block;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 768px) {
  .data-table--cards tbody tr {
    display: block;
    margin-bottom: 16px;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
  }
  
  .data-table--cards tbody td {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border: none;
  }
  
  .data-table--cards tbody td::before {
    content: attr(data-label);
    font-weight: 600;
    color: #6b7280;
    font-size: 12px;
    text-transform: uppercase;
  }
  
  .data-table--cards thead {
    display: none;
  }
}
```

### 7.8 Dark Mode

**Dark Mode Color Tokens:**
```css
:root {
  /* Light mode defaults */
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;
  --bg-tertiary: #f3f4f6;
  --bg-elevated: #ffffff;
  
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --text-tertiary: #9ca3af;
  --text-inverse: #ffffff;
  
  --border-default: #e5e7eb;
  --border-subtle: #f3f4f6;
  --border-focus: #635bff;
  
  --accent-primary: #635bff;
  --accent-primary-hover: #4f46e5;
  --accent-primary-light: #eef2ff;
}

[data-theme="dark"] {
  --bg-primary: #0f0f23;
  --bg-secondary: #161b22;
  --bg-tertiary: #1c2128;
  --bg-elevated: #21262d;
  
  --text-primary: #e5e7eb;
  --text-secondary: #8b949e;
  --text-tertiary: #6e7681;
  --text-inverse: #0f0f23;
  
  --border-default: #30363d;
  --border-subtle: #21262d;
  --border-focus: #58a6ff;
  
  --accent-primary: #58a6ff;
  --accent-primary-hover: #79b8ff;
  --accent-primary-light: rgba(88, 166, 255, 0.15);
}

/* Smooth theme transition */
* {
  transition: background-color 0.2s ease, 
              border-color 0.2s ease, 
              color 0.2s ease,
              box-shadow 0.2s ease;
}

/* Theme toggle */
.theme-toggle {
  position: relative;
  width: 48px;
  height: 26px;
  background: #e5e7eb;
  border-radius: 13px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border: none;
  padding: 0;
}

[data-theme="dark"] .theme-toggle {
  background: #374151;
}

.theme-toggle__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background: #ffffff;
  border-radius: 50%;
  transition: transform 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

[data-theme="dark"] .theme-toggle__thumb {
  transform: translateX(22px);
}
```

**Chart Dark Mode Adaptation:**
```css
[data-theme="dark"] .chart-line--primary   { stroke: #58a6ff; }
[data-theme="dark"] .chart-line--secondary { stroke: #3fb950; }
[data-theme="dark"] .chart-line--tertiary  { stroke: #d29922; }

[data-theme="dark"] .chart-grid-line {
  stroke: #30363d;
}

[data-theme="dark"] .chart-axis-text {
  fill: #6e7681;
}

[data-theme="dark"] .chart-tooltip {
  background: #21262d;
  border: 1px solid #30363d;
}
```


---

## 8. Navigation Patterns

### 8.1 Sidebar Navigation

**Wireframe Description:**

```
+------------------------------------------------------------------+
|  ┌──────────┐  +-----------------------------------------------+ |
|  │ ⚫ Logo  │  | Top Bar                                        | |
|  ├──────────┤  | [≡] [Search...    ] [🔔] [?] [👤 Profile ▼] | |
|  │          │  +-----------------------------------------------+ |
|  │ HOME     │  |                                                | |
|  │ 📊 Dashboard│                                               | |
|  │ 🏠 Home    │                                                | |
|  │            │                                                | |
|  │ MAIN       │                                                | |
|  │ 👥 Customers                                              | |
|  │ 💰 Payments                                               | |
|  │ 📈 Analytics                                              | |
|  │ 🎫 Tickets                                                | |
|  │            │                                                | |
|  │ SYSTEM     │                                                | |
|  │ ⚙️ Settings                                               | |
|  │ 🧩 Integrations                                           | |
|  │ 👤 Team Members                                           | |
|  │ 📋 Audit Log                                              | |
|  │            │                                                | |
|  │            │                                                | |
|  │ [→ Collapse]│                                               | |
|  └──────────┘  +-----------------------------------------------+ |
+------------------------------------------------------------------+
```

**Collapsible Sidebar Pattern:**
```css
.sidebar {
  width: 260px;
  height: 100vh;
  background: #0f172a;
  color: #94a3b8;
  display: flex;
  flex-direction: column;
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 100;
}

.sidebar--collapsed {
  width: 72px;
}

.sidebar__section {
  padding: 8px 12px;
}

.sidebar__section-title {
  padding: 8px 16px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #64748b;
}

.sidebar--collapsed .sidebar__section-title {
  display: none;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 14px;
  color: #94a3b8;
  text-decoration: none;
  white-space: nowrap;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}

.nav-item--active {
  background: rgba(99, 91, 255, 0.15);
  color: #c4b5fd;
}

.nav-item__icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 18px;
}

.sidebar--collapsed .nav-item__label {
  opacity: 0;
  width: 0;
  overflow: hidden;
}

/* Tooltip on collapsed state */
.sidebar--collapsed .nav-item:hover::after {
  content: attr(data-label);
  position: absolute;
  left: 64px;
  padding: 8px 14px;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 13px;
  border-radius: 6px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 200;
}
```

**Nested Navigation:**
```css
.nav-submenu {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.25s ease;
  padding-left: 20px;
}

.nav-item--expanded + .nav-submenu {
  max-height: 300px;
}

.nav-submenu__item {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  color: #64748b;
  cursor: pointer;
  transition: all 0.1s ease;
  text-decoration: none;
}

.nav-submenu__item:hover {
  color: #e2e8f0;
}

.nav-submenu__item--active {
  color: #c4b5fd;
}

.nav-submenu__item::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  margin-right: 12px;
  opacity: 0.4;
}

.nav-submenu__item--active::before {
  opacity: 1;
}
```

### 8.2 Top Bar with Search

**Top Bar Pattern:**
```css
.top-bar {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 50;
}

.top-bar__left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.top-bar__menu-btn {
  display: none;
  padding: 8px;
  border: none;
  background: none;
  cursor: pointer;
  color: #6b7280;
  font-size: 20px;
}

@media (max-width: 1023px) {
  .top-bar__menu-btn {
    display: block;
  }
}

.top-bar__right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-bar__action {
  position: relative;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.15s ease;
}

.top-bar__action:hover {
  background: #f3f4f6;
  color: #374151;
}

/* Notification badge */
.top-bar__badge {
  position: absolute;
  top: 6px;
  right: 6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: #ef4444;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**User Menu Dropdown:**
```css
.user-menu {
  position: relative;
}

.user-menu__trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 0.15s ease;
  border: none;
  background: none;
}

.user-menu__trigger:hover {
  background: #f3f4f6;
}

.user-menu__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #635bff, #a855f7);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
}

.user-menu__dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 240px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
  padding: 8px;
  z-index: 100;
}

.user-menu__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.user-menu__item:hover {
  background: #f3f4f6;
}

.user-menu__divider {
  height: 1px;
  background: #f3f4f6;
  margin: 8px 0;
}
```

### 8.3 Breadcrumbs

**Breadcrumb Pattern:**
```css
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  font-size: 13px;
}

.breadcrumb__item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  text-decoration: none;
  transition: color 0.15s ease;
}

.breadcrumb__item:hover {
  color: #635bff;
}

.breadcrumb__item--active {
  color: #111827;
  font-weight: 500;
  pointer-events: none;
}

.breadcrumb__separator {
  color: #d1d5db;
  font-size: 11px;
}

/* Back button style for deep pages */
.breadcrumb--back {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
}

.breadcrumb__back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #ffffff;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: all 0.1s ease;
}

.breadcrumb__back-btn:hover {
  background: #f9fafb;
  border-color: #d1d5db;
}
```

### 8.4 Tabs

**Horizontal Tabs:**
```css
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 24px;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: none;
  border-top: none;
  border-left: none;
  border-right: none;
  white-space: nowrap;
}

.tab:hover {
  color: #374151;
}

.tab--active {
  color: #635bff;
  border-bottom-color: #635bff;
}

.tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 11px;
  font-weight: 600;
  border-radius: 9px;
  margin-left: 8px;
}

.tab--active .tab__badge {
  background: #eef2ff;
  color: #635bff;
}
```

**Vertical Tabs:**
```css
.tabs-vertical {
  display: flex;
  gap: 0;
}

.tabs-vertical__nav {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid #e5e7eb;
  padding: 8px 0;
}

.tabs-vertical__tab {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s ease;
  background: none;
  border: none;
  text-align: left;
  border-radius: 0 8px 8px 0;
  margin-right: -1px;
}

.tabs-vertical__tab:hover {
  background: #f9fafb;
  color: #374151;
}

.tabs-vertical__tab--active {
  background: #eef2ff;
  color: #635bff;
  border-right: 2px solid #635bff;
}

.tabs-vertical__content {
  flex: 1;
  padding: 24px 32px;
}
```

**Pill Tabs:**
```css
.tabs-pill {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  background: #f3f4f6;
  border-radius: 10px;
}

.tabs-pill__tab {
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: none;
  border: none;
}

.tabs-pill__tab:hover {
  color: #374151;
}

.tabs-pill__tab--active {
  background: #ffffff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
```

### 8.5 Command Palette

**Command Palette Pattern:**
```css
.command-palette-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
}

.command-palette {
  width: 640px;
  max-width: 90vw;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.command-palette__search {
  display: flex;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f3f4f6;
  gap: 12px;
}

.command-palette__search-icon {
  color: #9ca3af;
  font-size: 18px;
}

.command-palette__input {
  flex: 1;
  border: none;
  font-size: 16px;
  color: #111827;
  outline: none;
  background: transparent;
}

.command-palette__input::placeholder {
  color: #9ca3af;
}

.command-palette__kbd {
  padding: 4px 10px;
  background: #f3f4f6;
  border-radius: 6px;
  font-size: 12px;
  font-family: 'SF Mono', ui-monospace, monospace;
  color: #9ca3af;
}

.command-palette__results {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
}

.command-palette__group {
  margin-bottom: 8px;
}

.command-palette__group-label {
  padding: 8px 12px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.command-palette__item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.08s ease;
}

.command-palette__item:hover,
.command-palette__item--selected {
  background: #f3f4f6;
}

.command-palette__item-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border-radius: 8px;
  color: #6b7280;
  font-size: 14px;
}

.command-palette__item-content {
  flex: 1;
  min-width: 0;
}

.command-palette__item-title {
  font-size: 14px;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.command-palette__item-subtitle {
  font-size: 12px;
  color: #9ca3af;
}

.command-palette__item-shortcut {
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 11px;
  color: #d1d5db;
  padding: 2px 8px;
  background: #f9fafb;
  border-radius: 4px;
}
```

### 8.6 Keyboard Shortcuts

**Shortcut Reference Sheet:**
```css
.shortcuts-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.shortcuts-modal__content {
  width: 700px;
  max-width: 90vw;
  max-height: 80vh;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 32px;
  padding: 24px;
  overflow-y: auto;
}

.shortcuts-group__title {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 12px;
}

.shortcut-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f3f4f6;
  font-size: 14px;
}

.shortcut-row__keys {
  display: flex;
  gap: 4px;
}

kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  background: #f9fafb;
  border: 1px solid #d1d5db;
  border-bottom-width: 2px;
  border-radius: 6px;
  font-family: 'SF Mono', ui-monospace, monospace;
  font-size: 12px;
  color: #374151;
  box-shadow: 0 1px 0 #d1d5db;
}
```

**Common Shortcut Categories:**
| Category | Action | Shortcut |
|----------|--------|----------|
| Navigation | Command palette | `⌘K` / `Ctrl+K` |
| Navigation | Go to Dashboard | `G` then `D` |
| Navigation | Go to Customers | `G` then `C` |
| Navigation | Go to Analytics | `G` then `A` |
| Actions | Search | `/` |
| Actions | Create new | `C` or `N` |
| Actions | Save | `⌘S` / `Ctrl+S` |
| Actions | Cancel | `Esc` |
| List | Select next | `↓` or `J` |
| List | Select previous | `↑` or `K` |
| List | Select all | `⌘A` / `Ctrl+A` |
| List | Delete selected | `⌘⌫` / `Ctrl+Del` |

### 8.7 Mobile Adaptation

**Mobile Navigation:**
```css
.mobile-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 100;
  padding-bottom: env(safe-area-inset-bottom);
}

.mobile-nav__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  color: #9ca3af;
  text-decoration: none;
  font-size: 10px;
  transition: color 0.15s ease;
}

.mobile-nav__item--active {
  color: #635bff;
}

.mobile-nav__icon {
  font-size: 20px;
}

/* Mobile filter sheet */
.filter-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 80vh;
  background: #ffffff;
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  z-index: 200;
  overflow-y: auto;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.filter-sheet--open {
  transform: translateY(0);
}

.filter-sheet__handle {
  width: 40px;
  height: 4px;
  background: #d1d5db;
  border-radius: 2px;
  margin: 12px auto;
}
```

---

## 9. Action Patterns

### 9.1 Bulk Actions

**Bulk Action Bar:**
```css
.bulk-action-bar {
  position: sticky;
  bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #111827;
  color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  animation: bulk-bar-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 50;
}

@keyframes bulk-bar-enter {
  from { transform: translateY(100px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.bulk-action-bar__count {
  font-size: 14px;
  font-weight: 500;
}

.bulk-action-bar__actions {
  display: flex;
  gap: 8px;
}

.bulk-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.1s ease;
  border: none;
}

.bulk-action-btn--secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.bulk-action-btn--secondary:hover {
  background: rgba(255, 255, 255, 0.2);
}

.bulk-action-btn--danger {
  background: #ef4444;
  color: #ffffff;
}

.bulk-action-btn--danger:hover {
  background: #dc2626;
}

.bulk-action-btn--primary {
  background: #635bff;
  color: #ffffff;
}
```

**Row Selection Checkbox:**
```css
.row-checkbox {
  appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid #d1d5db;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  flex-shrink: 0;
}

.row-checkbox:hover {
  border-color: #635bff;
}

.row-checkbox:checked {
  background: #635bff;
  border-color: #635bff;
}

.row-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 4px;
  height: 8px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.row-checkbox--indeterminate {
  background: #635bff;
  border-color: #635bff;
}

.row-checkbox--indeterminate::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 7px;
  width: 8px;
  height: 2px;
  background: #ffffff;
}
```

### 9.2 Inline Editing

**Inline Edit Pattern:**
```css
.inline-edit {
  position: relative;
  display: inline-block;
  min-width: 100px;
  padding: 4px 8px;
  margin: -4px -8px;
  border-radius: 6px;
  cursor: text;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.inline-edit:hover {
  background: #f9fafb;
  border-color: #e5e7eb;
}

.inline-edit:hover::after {
  content: '✎';
  margin-left: 8px;
  color: #9ca3af;
  font-size: 12px;
}

.inline-edit--active {
  background: #ffffff;
  border-color: #635bff;
  box-shadow: 0 0 0 3px rgba(99, 91, 255, 0.15);
}

.inline-edit__input {
  background: transparent;
  border: none;
  outline: none;
  font: inherit;
  color: inherit;
  width: 100%;
  min-width: 120px;
}

.inline-edit__save,
.inline-edit__cancel {
  position: absolute;
  right: -36px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  cursor: pointer;
  font-size: 14px;
}

.inline-edit__save {
  top: -2px;
  color: #10b981;
}

.inline-edit__cancel {
  bottom: -2px;
  color: #ef4444;
}
```

### 9.3 Confirmation Dialogs

**Dialog Pattern:**
```css
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fade-in 0.2s ease;
}

.dialog {
  width: 440px;
  max-width: 90vw;
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
  padding: 32px;
  animation: dialog-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes dialog-enter {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.dialog__icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  margin-bottom: 20px;
  font-size: 24px;
}

.dialog__icon--danger {
  background: #fee2e2;
  color: #dc2626;
}

.dialog__icon--warning {
  background: #fef3c7;
  color: #d97706;
}

.dialog__icon--info {
  background: #dbeafe;
  color: #2563eb;
}

.dialog__title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 8px;
}

.dialog__description {
  font-size: 14px;
  color: #6b7280;
  line-height: 1.6;
  margin-bottom: 24px;
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Destructive action button */
.btn-danger {
  padding: 10px 20px;
  background: #ef4444;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.btn-danger:hover {
  background: #dc2626;
}

.btn-secondary {
  padding: 10px 20px;
  background: #ffffff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary:hover {
  background: #f9fafb;
  border-color: #9ca3af;
}
```

**Danger Zone Pattern:**
```
+------------------------------------------------------+
| Danger Zone                                          |
|                                                      |
| Delete project                                       |
| Once you delete a project, there is no going back.   |
| Please be certain.                                   |
|                                                      |
| [Delete this project]                                |
+------------------------------------------------------+
```

```css
.danger-zone {
  margin-top: 32px;
  padding: 24px;
  border: 1px solid #fee2e2;
  border-radius: 12px;
  background: #fef2f2;
}

.danger-zone__title {
  font-size: 16px;
  font-weight: 600;
  color: #dc2626;
  margin-bottom: 8px;
}

.danger-zone__description {
  font-size: 14px;
  color: #991b1b;
  margin-bottom: 16px;
}

.danger-zone__button {
  padding: 10px 20px;
  background: #ef4444;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.danger-zone__button:hover {
  background: #b91c1c;
}
```

### 9.4 Toast Notifications

**Toast System:**
```css
.toast-container {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 20px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  min-width: 360px;
  max-width: 440px;
  pointer-events: all;
  animation: toast-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  border-left: 4px solid;
}

@keyframes toast-enter {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes toast-exit {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}

.toast--success { border-left-color: #10b981; }
.toast--error   { border-left-color: #ef4444; }
.toast--warning { border-left-color: #f59e0b; }
.toast--info    { border-left-color: #3b82f6; }

.toast__icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  flex-shrink: 0;
  font-size: 12px;
}

.toast--success .toast__icon { background: #d1fae5; color: #059669; }
.toast--error   .toast__icon { background: #fee2e2; color: #dc2626; }
.toast--warning .toast__icon { background: #fef3c7; color: #d97706; }
.toast--info    .toast__icon { background: #dbeafe; color: #2563eb; }

.toast__content {
  flex: 1;
  min-width: 0;
}

.toast__title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
}

.toast__message {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.4;
}

.toast__actions {
  display: flex;
  gap: 12px;
  margin-top: 10px;
}

.toast__close {
  padding: 4px;
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  transition: color 0.15s ease;
}

.toast__close:hover {
  color: #374151;
}

/* Progress bar for auto-dismiss */
.toast__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  background: currentColor;
  opacity: 0.2;
  border-radius: 0 0 0 12px;
  animation: toast-progress 5s linear forwards;
}

@keyframes toast-progress {
  from { width: 100%; }
  to { width: 0%; }
}
```

### 9.5 Loading States

**Skeleton Loading:**
```css
.skeleton {
  background: linear-gradient(
    90deg,
    #f3f4f6 25%,
    #e5e7eb 50%,
    #f3f4f6 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: 6px;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton--text {
  height: 14px;
  margin-bottom: 8px;
}

.skeleton--text-short { width: 60%; }

.skeleton--title {
  height: 20px;
  width: 40%;
  margin-bottom: 12px;
}

.skeleton--avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.skeleton--card {
  height: 120px;
  border-radius: 12px;
}

.skeleton--button {
  width: 100px;
  height: 36px;
  border-radius: 8px;
}
```

**Spinner Variants:**
```css
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e5e7eb;
  border-top-color: #635bff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner--sm { width: 14px; height: 14px; border-width: 2px; }
.spinner--md { width: 20px; height: 20px; border-width: 2px; }
.spinner--lg { width: 32px; height: 32px; border-width: 3px; }
.spinner--xl { width: 48px; height: 48px; border-width: 4px; }

/* Button loading state */
.btn--loading {
  position: relative;
  color: transparent !important;
  pointer-events: none;
}

.btn--loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
```

**Page Loader:**
```css
.page-loader {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: #ffffff;
  z-index: 10000;
}

.page-loader__logo {
  width: 48px;
  height: 48px;
  animation: page-loader-pulse 1.5s ease-in-out infinite;
}

@keyframes page-loader-pulse {
  0%, 100% { opacity: 0.5; transform: scale(0.95); }
  50% { opacity: 1; transform: scale(1.05); }
}

/* Content fade-in after loading */
.content-fade-in {
  animation: content-fade-in 0.4s ease-out;
}

@keyframes content-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### 9.6 Empty States

**Empty State Pattern:**
```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
}

.empty-state__illustration {
  width: 160px;
  height: 160px;
  margin-bottom: 24px;
  opacity: 0.6;
}

.empty-state__title {
  font-size: 18px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.empty-state__description {
  font-size: 14px;
  color: #9ca3af;
  max-width: 400px;
  line-height: 1.6;
  margin-bottom: 24px;
}

.empty-state__action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: #635bff;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease;
  text-decoration: none;
}

.empty-state__action:hover {
  background: #4f46e5;
}

/* Illustration built with CSS */
.empty-state__illustration--search {
  width: 120px;
  height: 120px;
  border: 3px dashed #d1d5db;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  color: #d1d5db;
}
```

**Empty State Variants:**

| Variant | Illustration | Title | Description | CTA |
|---------|-------------|-------|-------------|-----|
| No results | 🔍 | No results found | Try adjusting your filters or search terms | Clear filters |
| No data | 📊 | No data yet | Start by creating your first record | Create [item] |
| No notifications | 🔔 | All caught up | You have no new notifications | View history |
| Empty inbox | ✉️ | Inbox zero | You've processed all your messages | - |
| No connections | 🔌 | No integrations | Connect your tools to get started | Browse integrations |

### 9.7 Error States

**Error Boundary Pattern:**
```css
.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 24px;
  text-align: center;
  min-height: 60vh;
}

.error-boundary__icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fee2e2;
  border-radius: 50%;
  font-size: 36px;
  margin-bottom: 24px;
}

.error-boundary__title {
  font-size: 22px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 12px;
}

.error-boundary__description {
  font-size: 15px;
  color: #6b7280;
  max-width: 480px;
  line-height: 1.6;
  margin-bottom: 32px;
}

.error-boundary__actions {
  display: flex;
  gap: 12px;
}
```

**Inline Error:**
```css
.form-field__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 13px;
  color: #dc2626;
}

.form-field__error-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* Input with error */
.input--error {
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
}

/* Retry button for failed loads */
.retry-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: #fef2f2;
  border-bottom: 1px solid #fee2e2;
}

.retry-banner__message {
  font-size: 14px;
  color: #991b1b;
}

.retry-banner__button {
  padding: 8px 16px;
  background: #ffffff;
  border: 1px solid #fecaca;
  border-radius: 6px;
  font-size: 13px;
  color: #dc2626;
  cursor: pointer;
  transition: all 0.1s ease;
}

.retry-banner__button:hover {
  background: #fee2e2;
}
```

---

## 10. Accessibility

### 10.1 WCAG 2.1 AA Compliance

**Minimum Conformance Requirements:**

| Element | Requirement | Example |
|---------|-------------|---------|
| Normal text (< 18px) | 4.5:1 contrast ratio | `#374151` on `#ffffff` = 9.7:1 ✅ |
| Large text (≥ 18px bold / 24px) | 3:1 contrast ratio | `#6b7280` on `#ffffff` = 4.7:1 ✅ |
| UI components (borders, icons) | 3:1 contrast ratio | `#d1d5db` on `#ffffff` = 1.8:1 ❌ → `#9ca3af` = 2.9:1 |
| Focus indicators | 3:1 contrast ratio against adjacent colors | `box-shadow: 0 0 0 3px rgba(99, 91, 255, 0.5)` |
| Error identification | Color + icon/text | Red text + error icon + description |

**Focus Visible Pattern:**
```css
/* Remove default outline but provide custom visible focus */
:focus {
  outline: none;
}

:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(99, 91, 255, 0.4);
  border-radius: inherit;
}

/* High contrast focus for keyboard users */
@media (prefers-contrast: high) {
  :focus-visible {
    outline: 3px solid currentColor;
    outline-offset: 2px;
    box-shadow: none;
  }
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 10.2 Screen Reader Support

**ARIA Patterns:**

```html
<!-- Table with proper ARIA -->
<table role="grid" aria-label="Customer list">
  <thead>
    <tr role="row">
      <th scope="col" role="columnheader" aria-sort="ascending">
        Name
      </th>
    </tr>
  </thead>
  <tbody>
    <tr role="row" aria-selected="false">
      <td role="gridcell">Acme Corp</td>
    </tr>
  </tbody>
</table>

<!-- Command palette with ARIA -->
<div role="dialog" aria-label="Command palette" aria-modal="true">
  <input 
    type="text" 
    role="combobox" 
    aria-expanded="true"
    aria-controls="command-list"
    aria-activedescendant="command-1"
  />
  <ul role="listbox" id="command-list">
    <li role="option" id="command-1" aria-selected="true">Go to Dashboard</li>
  </ul>
</div>

<!-- Toast notifications with ARIA live regions -->
<div 
  role="region" 
  aria-label="Notifications" 
  aria-live="polite" 
  aria-atomic="true"
>
  <div role="status">Payment processed successfully</div>
</div>

<!-- Modal dialog -->
<div 
  role="dialog" 
  aria-modal="true" 
  aria-labelledby="dialog-title" 
  aria-describedby="dialog-desc"
>
  <h2 id="dialog-title">Delete customer?</h2>
  <p id="dialog-desc">This action cannot be undone.</p>
</div>

<!-- Tabs with ARIA -->
<div role="tablist" aria-label="Dashboard sections">
  <button role="tab" aria-selected="true" aria-controls="panel-1" id="tab-1">
    Overview
  </button>
  <button role="tab" aria-selected="false" aria-controls="panel-2" id="tab-2">
    Analytics
  </button>
</div>
<div role="tabpanel" id="panel-1" aria-labelledby="tab-1">
  Panel content
</div>
```

**Visually Hidden (Screen Reader Only):**
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.sr-only--focusable:focus {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

### 10.3 Keyboard Navigation

**Keyboard Navigation Map:**

| Component | Keys | Action |
|-----------|------|--------|
| Sidebar | `Tab` / `Shift+Tab` | Navigate between nav items |
| Sidebar | `Enter` / `Space` | Activate nav item |
| Command palette | `⌘K` / `Ctrl+K` | Open |
| Command palette | `↑` / `↓` | Navigate results |
| Command palette | `Enter` | Select highlighted |
| Command palette | `Esc` | Close |
| Table | `↑` / `↓` | Navigate rows |
| Table | `Space` | Select row |
| Table | `Shift+↑↓` | Range select |
| Modal | `Esc` | Close |
| Modal | `Tab` | Trap focus within |
| Dropdown | `↑` / `↓` | Navigate options |
| Dropdown | `Enter` | Select |
| Dropdown | `Esc` | Close |
| Toast | `Esc` | Dismiss |
| Tabs | `←` / `→` | Navigate tabs |
| Date picker | `←→↑↓` | Navigate calendar |
| Date picker | `Enter` | Select date |

**Focus Trap for Modals:**
```javascript
// Focus trap implementation
function trapFocus(element) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  element.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    
    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  });
}
```

**Skip Link Pattern:**
```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: #111827;
  color: #ffffff;
  border-radius: 0 0 8px 8px;
  font-size: 14px;
  font-weight: 500;
  z-index: 10000;
  transition: top 0.2s ease;
}

.skip-link:focus {
  top: 0;
}
```

### 10.4 Color Contrast

**Contrast Checker Function:**
```javascript
// Relative luminance calculation
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(color1, color2) {
  const lum1 = getLuminance(color1.r, color1.g, color1.b);
  const lum2 = getLuminance(color2.r, color2.g, color2.b);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}
```

**Approved Color Combinations (WCAG AA):**

| Background | Text Color | Ratio | Usage |
|------------|-----------|-------|-------|
| `#ffffff` | `#111827` | 15.9:1 | Primary text |
| `#ffffff` | `#374151` | 10.4:1 | Body text |
| `#ffffff` | `#6b7280` | 5.9:1 | Secondary text |
| `#ffffff` | `#9ca3af` | 2.9:1 | Muted text (large only) |
| `#f9fafb` | `#111827` | 14.8:1 | Card text on subtle bg |
| `#1a1a2e` | `#e5e7eb` | 14.1:1 | Dark mode primary |
| `#1a1a2e` | `#9ca3af` | 6.1:1 | Dark mode secondary |
| `#fef3c7` | `#92400e` | 5.4:1 | Warning badge |
| `#fee2e2` | `#991b1b` | 6.6:1 | Error badge |
| `#d1fae5` | `#065f46` | 5.8:1 | Success badge |
| `#dbeafe` | `#1e40af` | 5.6:1 | Info badge |

### 10.5 Focus Management

**Focus Management Rules:**

```css
/* 1. All interactive elements must have visible focus */
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
[tabindex]:not([tabindex="-1"]):focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(99, 91, 255, 0.35);
}

/* 2. Focus order follows visual order (DOM order) */
/* Ensure HTML structure matches visual layout */

/* 3. Skip to content link */
.skip-to-content {
  position: absolute;
  top: -40px;
  left: 0;
  background: #111827;
  color: #ffffff;
  padding: 8px 16px;
  z-index: 10000;
  transition: top 0.2s;
}

.skip-to-content:focus {
  top: 0;
}

/* 4. No focus on disabled elements */
button:disabled,
input:disabled {
  pointer-events: none;
}

/* 5. Restore focus after modal close */
/* Track previously focused element, restore on close */

/* 6. Focus visible only for keyboard users */
button:focus:not(:focus-visible) {
  box-shadow: none;
}

/* 7. Sufficient touch targets (44x44px minimum) */
.touch-target {
  min-width: 44px;
  min-height: 44px;
  padding: 10px;
}

/* 8. Focus indicator must have 3:1 contrast */
.focus-ring {
  box-shadow: 
    0 0 0 2px #ffffff,
    0 0 0 4px #635bff;
}
```

**Focus Return Pattern:**
```javascript
class FocusManager {
  constructor() {
    this.lastFocused = null;
  }
  
  saveFocus() {
    this.lastFocused = document.activeElement;
  }
  
  restoreFocus() {
    if (this.lastFocused) {
      this.lastFocused.focus();
      this.lastFocused = null;
    }
  }
  
  // Focus first focusable element in container
  focusFirst(container) {
    const element = container.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    element?.focus();
  }
  
  // Focus trap for modals
  trapFocus(container) {
    const focusable = Array.from(
      container.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    );
    
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    
    container.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }
}
```

---

## 11. Appendix: CSS Pattern Library

### 11.1 Design Tokens

```css
:root {
  /* Colors */
  --color-primary-50: #eef2ff;
  --color-primary-100: #e0e7ff;
  --color-primary-200: #c7d2fe;
  --color-primary-300: #a5b4fc;
  --color-primary-400: #818cf8;
  --color-primary-500: #635bff;
  --color-primary-600: #4f46e5;
  --color-primary-700: #4338ca;
  
  --color-success-50: #ecfdf5;
  --color-success-100: #d1fae5;
  --color-success-500: #10b981;
  --color-success-700: #047857;
  
  --color-warning-50: #fffbeb;
  --color-warning-100: #fef3c7;
  --color-warning-500: #f59e0b;
  --color-warning-700: #b45309;
  
  --color-danger-50: #fef2f2;
  --color-danger-100: #fee2e2;
  --color-danger-500: #ef4444;
  --color-danger-700: #b91c1c;
  
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-300: #d1d5db;
  --color-gray-400: #9ca3af;
  --color-gray-500: #6b7280;
  --color-gray-600: #4b5563;
  --color-gray-700: #374151;
  --color-gray-800: #1f2937;
  --color-gray-900: #111827;
  
  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', ui-monospace, monospace;
  
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-md: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;
  --text-3xl: 36px;
  
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  
  /* Spacing */
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
  
  /* Border Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);
  --shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.15);
  
  /* Transitions */
  --transition-fast: 0.1s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  
  /* Z-index Scale */
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal-backdrop: 300;
  --z-modal: 400;
  --z-popover: 500;
  --z-tooltip: 600;
  --z-toast: 700;
}
```

### 11.2 Utility Classes

```css
/* Layout */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-4 { gap: 16px; }

/* Typography */
.text-sm { font-size: 13px; }
.text-base { font-size: 14px; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.text-gray-500 { color: var(--color-gray-500); }
.text-gray-700 { color: var(--color-gray-700); }

/* Spacing */
.p-4 { padding: 16px; }
.px-4 { padding-left: 16px; padding-right: 16px; }
.py-3 { padding-top: 12px; padding-bottom: 12px; }
.mb-4 { margin-bottom: 16px; }

/* Interactive */
.cursor-pointer { cursor: pointer; }
.select-none { user-select: none; }

/* Overflow */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Visibility */
.hidden { display: none; }
.invisible { visibility: hidden; }
.opacity-0 { opacity: 0; }
.opacity-50 { opacity: 0.5; }
.opacity-100 { opacity: 1; }
```

### 11.3 Animation Keyframes

```css
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes slide-up {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes slide-down {
  from { transform: translateY(-16px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

@keyframes scale-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes scale-out {
  from { transform: scale(1); opacity: 1; }
  to { transform: scale(0.95); opacity: 0; }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}

@keyframes bounce-in {
  0% { transform: scale(0.3); opacity: 0; }
  50% { transform: scale(1.05); }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes rotate-in {
  from { transform: rotate(-90deg); opacity: 0; }
  to { transform: rotate(0); opacity: 1; }
}

@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}

@keyframes counter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes progress-fill {
  from { width: 0%; }
  to { width: var(--progress-width); }
}

/* Animation utility classes */
.animate-fade-in    { animation: fade-in 0.2s ease-out; }
.animate-slide-up   { animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.animate-scale-in   { animation: scale-in 0.2s ease-out; }
.animate-shake      { animation: shake 0.4s ease-in-out; }
.animate-bounce-in  { animation: bounce-in 0.5s cubic-bezier(0.16, 1, 0.3, 1); }

/* Stagger children animations */
.stagger-children > * {
  opacity: 0;
  animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.stagger-children > *:nth-child(1) { animation-delay: 0ms; }
.stagger-children > *:nth-child(2) { animation-delay: 50ms; }
.stagger-children > *:nth-child(3) { animation-delay: 100ms; }
.stagger-children > *:nth-child(4) { animation-delay: 150ms; }
.stagger-children > *:nth-child(5) { animation-delay: 200ms; }
.stagger-children > *:nth-child(6) { animation-delay: 250ms; }
```

### 11.4 Grid Patterns

```css
/* Dashboard grid */
.grid-dashboard {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
  padding: 24px;
}

.grid-dashboard__half    { grid-column: span 6; }
.grid-dashboard__third   { grid-column: span 4; }
.grid-dashboard__quarter { grid-column: span 3; }
.grid-dashboard__two-third { grid-column: span 8; }
.grid-dashboard__full    { grid-column: span 12; }

@media (max-width: 1023px) {
  .grid-dashboard__half,
  .grid-dashboard__third,
  .grid-dashboard__quarter,
  .grid-dashboard__two-third {
    grid-column: span 6;
  }
}

@media (max-width: 639px) {
  .grid-dashboard__half,
  .grid-dashboard__third,
  .grid-dashboard__quarter,
  .grid-dashboard__two-third,
  .grid-dashboard__full {
    grid-column: span 12;
  }
}

/* Card grid */
.grid-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

/* Masonry-like grid */
.grid-masonry {
  columns: 3;
  column-gap: 24px;
}

.grid-masonry > * {
  break-inside: avoid;
  margin-bottom: 24px;
}

@media (max-width: 1023px) {
  .grid-masonry { columns: 2; }
}

@media (max-width: 639px) {
  .grid-masonry { columns: 1; }
}
```

---

## 12. Appendix: Component Specification Sheets

### 12.1 Button Specifications

| Variant | Background | Text | Border | Hover Background | Hover Text | Use Case |
|---------|-----------|------|--------|-----------------|------------|----------|
| Primary | `#635bff` | `#ffffff` | none | `#4f46e5` | `#ffffff` | Main CTA |
| Secondary | `#ffffff` | `#374151` | `#d1d5db` | `#f9fafb` | `#374151` | Secondary action |
| Tertiary | transparent | `#6b7280` | none | `#f3f4f6` | `#374151` | Low emphasis |
| Danger | `#ef4444` | `#ffffff` | none | `#dc2626` | `#ffffff` | Destructive |
| Ghost | transparent | `#635bff` | none | `#eef2ff` | `#4f46e5` | Link-style |
| Icon only | transparent | `#6b7280` | none | `#f3f4f6` | `#374151` | Toolbar action |

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
  line-height: 1.4;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: #635bff;
  color: #ffffff;
}

.btn--primary:hover:not(:disabled) {
  background: #4f46e5;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 91, 255, 0.3);
}

.btn--secondary {
  background: #ffffff;
  color: #374151;
  border-color: #d1d5db;
}

.btn--secondary:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.btn--tertiary {
  background: transparent;
  color: #6b7280;
}

.btn--tertiary:hover:not(:disabled) {
  background: #f3f4f6;
  color: #374151;
}

.btn--danger {
  background: #ef4444;
  color: #ffffff;
}

.btn--danger:hover:not(:disabled) {
  background: #dc2626;
}

.btn--ghost {
  background: transparent;
  color: #635bff;
}

.btn--ghost:hover:not(:disabled) {
  background: #eef2ff;
}

.btn--sm { padding: 6px 12px; font-size: 13px; border-radius: 6px; }
.btn--md { padding: 10px 18px; font-size: 14px; border-radius: 8px; }
.btn--lg { padding: 14px 24px; font-size: 16px; border-radius: 10px; }
.btn--icon { padding: 8px; }
```

### 12.2 Input Specifications

| Type | Height | Padding | Border | Focus Ring |
|------|--------|---------|--------|------------|
| Text | 40px | 10px 14px | `#d1d5db` | `0 0 0 3px rgba(99, 91, 255, 0.15)` |
| Textarea | auto | 12px 14px | `#d1d5db` | same |
| Select | 40px | 10px 36px 10px 14px | `#d1d5db` | same |
| Checkbox | 18px | 0 | `#d1d5db` | same |
| Radio | 18px | 0 | `#d1d5db` | same |
| Date | 40px | 10px 14px | `#d1d5db` | same |

```css
.input {
  width: 100%;
  height: 40px;
  padding: 10px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  color: #111827;
  background: #ffffff;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  font-family: inherit;
}

.input::placeholder {
  color: #9ca3af;
}

.input:hover {
  border-color: #9ca3af;
}

.input:focus {
  outline: none;
  border-color: #635bff;
  box-shadow: 0 0 0 3px rgba(99, 91, 255, 0.15);
}

.input--error {
  border-color: #ef4444;
}

.input--error:focus {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

.input--success {
  border-color: #10b981;
}

.input--success:focus {
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

/* Select */
.select {
  appearance: none;
  background-image: url("data:image/svg+xml,...");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;
}

/* Textarea */
.textarea {
  height: auto;
  min-height: 100px;
  resize: vertical;
}
```

### 12.3 Card Specifications

```css
.card {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card--interactive {
  cursor: pointer;
}

.card--interactive:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.card--bordered {
  border: 1px solid #e5e7eb;
  box-shadow: none;
}

.card--bordered:hover {
  border-color: #d1d5db;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card--compact {
  padding: 16px;
}

.card--flat {
  box-shadow: none;
  background: #f9fafb;
}

.card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.card__title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
}

.card__subtitle {
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
}

.card__body {
  font-size: 14px;
  color: #374151;
  line-height: 1.5;
}

.card__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f3f4f6;
}
```

### 12.4 Dropdown/Menu Specifications

```css
.dropdown-menu {
  position: absolute;
  min-width: 200px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
  padding: 6px;
  z-index: 100;
  animation: scale-in 0.1s ease-out;
  transform-origin: top left;
}

.dropdown-menu__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  color: #374151;
  cursor: pointer;
  transition: background-color 0.08s ease;
}

.dropdown-menu__item:hover {
  background: #f3f4f6;
}

.dropdown-menu__item--danger {
  color: #dc2626;
}

.dropdown-menu__item--danger:hover {
  background: #fef2f2;
}

.dropdown-menu__item--disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.dropdown-menu__divider {
  height: 1px;
  background: #f3f4f6;
  margin: 6px 0;
}

.dropdown-menu__label {
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
```

### 12.5 Tooltip Specifications

```css
.tooltip {
  position: absolute;
  padding: 6px 12px;
  background: #111827;
  color: #ffffff;
  font-size: 12px;
  border-radius: 6px;
  white-space: nowrap;
  z-index: 600;
  pointer-events: none;
  animation: fade-in 0.15s ease-out;
}

.tooltip::before {
  content: '';
  position: absolute;
  width: 8px;
  height: 8px;
  background: #111827;
  transform: rotate(45deg);
}

.tooltip--top::before    { bottom: -4px; left: 50%; margin-left: -4px; }
.tooltip--bottom::before { top: -4px; left: 50%; margin-left: -4px; }
.tooltip--left::before   { right: -4px; top: 50%; margin-top: -4px; }
.tooltip--right::before  { left: -4px; top: 50%; margin-top: -4px; }

.tooltip--light {
  background: #ffffff;
  color: #374151;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tooltip--light::before {
  background: #ffffff;
}
```

### 12.6 Modal Specifications

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: fade-in 0.2s ease-out;
}

.modal {
  background: #ffffff;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.2);
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal--sm { width: 400px; }
.modal--md { width: 520px; }
.modal--lg { width: 720px; }
.modal--xl { width: 960px; }

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #f3f4f6;
}

.modal__title {
  font-size: 18px;
  font-weight: 600;
  color: #111827;
}

.modal__close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.15s ease;
}

.modal__close:hover {
  background: #f3f4f6;
  color: #374151;
}

.modal__body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid #f3f4f6;
  background: #f9fafb;
}

/* Side panel / Drawer */
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 480px;
  max-width: 90vw;
  background: #ffffff;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.1);
  z-index: 400;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overflow-y: auto;
}

.drawer--open {
  transform: translateX(0);
}
```

### 12.7 Badge Specifications

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
}

.badge--default {
  background: #f3f4f6;
  color: #6b7280;
}

.badge--primary {
  background: #eef2ff;
  color: #4338ca;
}

.badge--success {
  background: #d1fae5;
  color: #065f46;
}

.badge--warning {
  background: #fef3c7;
  color: #92400e;
}

.badge--danger {
  background: #fee2e2;
  color: #991b1b;
}

.badge--info {
  background: #dbeafe;
  color: #1e40af;
}

.badge--outline {
  background: transparent;
  border: 1px solid currentColor;
}

.badge--dot::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.badge--pulse::before {
  animation: pulse-ring 2s infinite;
}
```

---

## 13. References & Sources

### 13.1 Primary Sources

| Platform | URL | Section Reference |
|----------|-----|-------------------|
| Stripe Dashboard | https://dashboard.stripe.com | Sections 1.1–1.7 |
| HubSpot CRM | https://app.hubspot.com | Sections 2.1–2.7 |
| Linear | https://linear.app | Sections 3.1–3.7 |
| Intercom | https://app.intercom.com | Sections 4.1–4.7 |
| Retool | https://retool.com | Sections 5.1–5.7 |
| Datadog | https://app.datadoghq.com | Sections 6.1–6.7 |

### 13.2 Design System References

| System | URL | Patterns |
|--------|-----|----------|
| Stripe Elements | https://stripe.com/payments/elements | Forms, inputs |
| HubSpot CMS Design | https://developers.hubspot.com | Cards, typography |
| Linear Method | https://linear.app/method | Keyboard UX |
| Intercom Messenger | https://developers.intercom.com | Chat UI |
| Retool Components | https://docs.retool.com | Query builder |
| Datadog UX | https://docs.datadoghq.com | Dashboards, alerts |

### 13.3 Accessibility Standards

| Standard | URL | Compliance |
|----------|-----|------------|
| WCAG 2.1 | https://www.w3.org/WAI/WCAG21/quickref/ | Level AA |
| ARIA Authoring | https://www.w3.org/WAI/ARIA/apg/ | Patterns |
| Section 508 | https://www.section508.gov/ | US Federal |
| EN 301 549 | https://www.etsi.org/ | European |

### 13.4 UX Research Sources

| Publication | Topic |
|-------------|-------|
| Nielsen Norman Group | Dashboard design, data visualization |
| Material Design 3 | Component specs, motion guidelines |
| Ant Design | Enterprise UI patterns |
| Atlassian Design System | Data tables, forms |
| Shopify Polaris | Admin patterns, navigation |
| IBM Carbon | Data visualization, accessibility |
| GitHub Primer | Command palette, keyboard shortcuts |

### 13.5 Technical Specifications

| Spec | Version | Application |
|------|---------|-------------|
| CSS Grid Layout | Level 2 | Dashboard grids |
| CSS Custom Properties | Level 1 | Design tokens |
| CSS Containment | Level 2 | Performance |
| Web Animations API | Level 1 | Animations |
| ResizeObserver | Level 1 | Responsive |
| IntersectionObserver | Level 2 | Lazy loading |

---

> **Document Metadata**
> 
> - Total Platforms Analyzed: 6 (Stripe, HubSpot, Linear, Intercom, Retool, Datadog)
> - Pattern Categories: 7 (KPI cards, Charts, Tables, Search, Filters, Dates, Responsive)
> - Navigation Patterns: 7 (Sidebar, Top bar, Breadcrumbs, Tabs, Command palette, Shortcuts, Mobile)
> - Action Patterns: 7 (Bulk actions, Inline edit, Confirmations, Toasts, Loading, Empty states, Error states)
> - Accessibility Coverage: 5 areas (WCAG, Screen readers, Keyboard, Color contrast, Focus)
> - Component Specs: 7 (Button, Input, Card, Dropdown, Tooltip, Modal, Badge)
> - CSS Lines: 2000+
> - Color Tokens: 40+
> - Animation Keyframes: 12
> - Responsive Breakpoints: 5

---

*End of DeepSynaps Protocol Studio — SaaS Admin Dashboard UX Benchmark Report*
