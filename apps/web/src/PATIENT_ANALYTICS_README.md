# Patient Analytics Dashboard

## Overview

The Patient Analytics Dashboard (`pages-patient-analytics.js`) is a comprehensive read-only analytics interface for reviewing patient data, activity timelines, risk flags, and audit logs.

**Route:** `/patients/:patientId/analytics`

## Features

### 1. Summary Cards
- **AI Analysis:** Total, completed, pending review, and failed analysis runs
- **Safety Flags:** Active flags grouped by severity (critical, high, warning, info)
- **Consent Status:** Active, withdrawn, and expired consent records
- **Data Assets:** Total assets and breakdown by type

### 2. Activity Timeline
- **Last 90 days of events** sorted by date (descending)
- **Event types:** AI analysis runs, data uploads, safety flags, consent changes
- **Details:** Event timestamps, status, and type-specific information
- **Empty state:** Graceful message when no activity is recorded

### 3. Risk Dashboard
- **Active flags** grouped by severity level
- **Color-coded** by risk level (critical=red, high=orange, warning=yellow, info=blue)
- **Flag details:** Type, message, and creation timestamp
- **Empty state:** Message when no active flags exist

### 4. Audit Log Table
- **Read-only access trail** of PHI (Protected Health Information) access
- **Last 30 days** of audit events (limit: 50 events)
- **Columns:** User ID, action, resource type, result (allowed/denied), timestamp
- **Timestamps:** Relative time display (e.g., "2h ago")

### 5. Security Banner
- **Compliance notice:** "Data shown is masked and audit-logged. Clinic-scoped access only."
- **Blue banner** at top of page for visibility
- **Reinforces** clinic-scoped access and audit logging

## API Integration

The component uses four GET endpoints from the Patient Analytics API:

### `GET /api/v1/patients/{patientId}/analytics/summary`
Returns comprehensive analytics summary with:
- AI analysis metrics (total, pending, completed, failed, pending_review)
- Data asset counts by type
- Consent status breakdown
- Risk flags grouped by severity

### `GET /api/v1/patients/{patientId}/analytics/timeline`
Returns recent activity events (last 90 days by default):
- Query params: `days` (default 90), `limit` (default 100)
- Returns events sorted by date descending
- Event types: `ai_analysis`, `data_upload`, `safety_flag`, `consent_change`

### `GET /api/v1/patients/{patientId}/analytics/audit-log`
Returns PHI access audit trail:
- Query params: `days` (default 30), `limit` (default 50)
- Returns audit events with user, action, resource, result, timestamp
- All access is logged for compliance

### `GET /api/v1/patients/{patientId}/analytics/signals`
Returns current active signals/alerts for the patient (not used in v1 but available for future expansion)

## Usage

### Basic Import and Call
```javascript
import { pgPatientAnalytics } from './pages-patient-analytics.js';

// In your page router
await pgPatientAnalytics('patient-123');
```

### Alternative (with topbar callback)
```javascript
import { pgPatientAnalyticsDetail } from './pages-patient-analytics.js';

// With topbar update
await pgPatientAnalyticsDetail((title, actions) => {
  // Update page title and actions
  updateTopbar(title, actions);
}, 'patient-123');
```

## Component Structure

### Data Loading
- Module state tracks loading and error status for each section
- Data fetched in parallel for better performance
- Graceful error handling with user-friendly messages

### Rendering
- Uses existing helper functions (`spinner()`, `emptyState()`)
- Responsive grid layout using CSS Grid
- Color-coded status indicators
- Accessible HTML structure with semantic elements

### Styling
- Follows existing DeepSynaps design patterns
- Uses CSS variables (--surface-primary, --border, --text-secondary, etc.)
- Responsive for mobile and desktop
- No external dependencies required

## Error Handling

Each section independently handles loading and errors:
- **Loading state:** Shows spinner during data fetch
- **Error state:** Shows error message with explanation
- **Empty state:** Shows friendly message when no data available
- **Graceful degradation:** One section's error doesn't break others

## Access Control

All endpoints enforce access control via `access_control_service.require_patient_access()`:
- Returns 403 Forbidden if user cannot access patient
- Returns 404 Not Found if patient doesn't exist
- Returns 500 for internal errors

All PHI access is logged automatically via `access_control_service.log_phi_access()`.

## Security Considerations

1. **Read-only:** No write operations or delete buttons
2. **Audit-logged:** All access tracked and logged for compliance
3. **Clinic-scoped:** Access limited to users with patient access
4. **Data masked:** Sensitive data is masked in responses
5. **Security banner:** Visible reminder of compliance requirements

## Testing

The component includes exports for testing:
- `pgPatientAnalyticsDetail` — main test entry point
- `_analyticsData` — data state
- `_errors` — error state
- `_loading` — loading state
- `_patientId` — current patient ID

Example test:
```javascript
const { pgPatientAnalyticsDetail } = await import('./pages-patient-analytics.js');

await pgPatientAnalyticsDetail((title, actions) => {
  console.log('Topbar updated:', title);
}, 'test-patient-id');

// Assert on DOM state or data
const html = document.getElementById('content')?.innerHTML || '';
assert.match(html, /Activity Timeline/);
```

## Performance

- Bundle size: ~12 KB (gzipped ~3.2 KB)
- Minimal dependencies (only `api.js` and `helpers.js`)
- Parallel data fetching for all sections
- Efficient HTML rendering with template literals
- No complex state management

## Future Enhancements

1. **Signals/Alerts Section:** Use `getPatientAnalyticsSignals()` endpoint
2. **Export:** Add CSV/JSON export for audit logs
3. **Filtering:** Filter timeline by event type or date range
4. **Pagination:** Paginate audit log and timeline events
5. **Drill-down:** Click events to view more details
6. **Real-time updates:** SSE/WebSocket for live event streaming
