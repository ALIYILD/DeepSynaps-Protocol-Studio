# Data Console — Read-Only Clinical Data Browser

**Version:** 1.0  
**Status:** Clinical Review & Pilot Phase  
**Access Level:** Admin-only (platform_admin, clinic_admin, authorized clinician)

---

## Overview

The Data Console is a **read-only clinical data browser** providing secure, auditable access to patient clinical data. All access is:
- ✅ Non-destructive (read-only, no modifications)
- ✅ Audit-logged (all access recorded with timestamps, user, data accessed)
- ✅ Role-gated (admin/clinic_admin/authorized clinician only)
- ✅ PHI-masked (sensitive fields marked with `***MASKED***`)
- ✅ Compliance-badged (HIPAA, GDPR alignment markers)

---

## Access & Routes

### Correct Route
```
/app?page=data-console
```

### Direct URL Redirect
```
/data-console → /auth/login?return=/app?page=data-console
```

### API Endpoints
```
GET /api/v1/data-console/sources
  Returns available data sources (tables) user can query

GET /api/v1/data-console/patients/{patient_id}/tables/{table_name}/rows
  Query parameters:
    - offset: pagination offset (default 0)
    - limit: rows per page (default 50)
  Returns paginated clinical data rows (read-only)

GET /api/v1/data-console/patients/{patient_id}/audit
  Query parameters:
    - offset: pagination offset
    - limit: rows per page
  Returns audit trail for patient record access
```

---

## Access Policy

### Allowed Roles
- ✅ `platform_admin` — Full access to all patient data + audit logs
- ✅ `clinic_admin` — Access to clinic's patient data + audit logs
- ✅ `clinician` (authorized) — Access per clinic assignment + audit logs

### Blocked Roles
- ❌ `patient` — Cannot access data console
- ❌ `guest` — Cannot access data console
- ❌ `technician` — Cannot access data console
- ❌ `reviewer` — Cannot access data console

### Enforcement
1. **Sidebar visibility:** Hidden for patient/guest/technician/reviewer via `ROLE_NAV_HIDE`
2. **URL access:** Role-gating in app.js soft-redirects unauthorized users to home
3. **API access:** Backend enforces authentication on all `/api/v1/data-console/*` endpoints

---

## Features

### 1. Patient Search
- Optional dropdown for patient selection
- Autocomplete search by name, ID, or email
- Displays selected patient name and ID

### 2. Data Source Browser
- Shows available tables (qEEG, MRI, biometrics, devices, assessments, etc.)
- Click to select table for browsing
- Displays row count and last-updated timestamp

### 3. Row Viewer
- Paginated table display (50 rows per page)
- Click-to-expand row detail view
- Full cell content display with escape/close

### 4. Masking & Safety Badges
- **Masked fields:** Sensitive columns (SSN, full DOB, payment data) show `***MASKED***`
- **Safety banners:** Read-only notice + audit-logged notice at top
- **Compliance badges:** HIPAA, GDPR alignment markers in UI

### 5. Audit Trail View
- Separate audit log viewer
- Shows all access to patient records
- Timestamp, user, data accessed, IP address (if available)
- Filterable by date range and access type

---

## Security & Compliance

### Data Access Logging
Every access to patient data in the Data Console is logged with:
- Timestamp (UTC)
- User identity (ID, name, role)
- Patient ID
- Table accessed
- Number of rows retrieved
- IP address (if available)

### No Data Modification
- Read-only queries only
- No UPDATE, DELETE, or INSERT operations
- No bulk export (row-level access only)

### PHI Handling
- Sensitive fields automatically masked
- Audit trail shows masked fields as `***MASKED***`
- No raw PHI export via Data Console
- Use dedicated export endpoints for approved exports

### Role-Based Isolation
- `clinic_admin` cannot see other clinics' patient data
- `clinician` cannot see patients outside assigned clinic
- `platform_admin` sees all (use with caution; logged)

---

## Deployment & Staging

**Staging URL:**
```
https://deepsynaps-studio.fly.dev/app?page=data-console
```

**Testing:**
1. Sign in as platform_admin or clinic_admin
2. Navigate to sidebar → Admin → Data Console
3. Select a test patient
4. Browse available data sources
5. View rows and audit trail
6. Verify masking and role isolation

---

## Known Limitations

1. **No bulk export:** Download individual rows only (use export endpoints for reports)
2. **No data modification:** Read-only view (use dedicated admin tools for edits)
3. **No custom queries:** Pre-defined data sources only (SQL not exposed)
4. **Pagination max 100 rows:** Large datasets must be queried in pages

---

## Troubleshooting

### "Data Console requires authenticated clinician/admin access"
- Sign in as clinician, admin, or clinic_admin
- Check your user role in settings

### "Access Denied" when clicking Data Console
- Your role (patient, guest, technician) does not have access
- Contact clinic admin for role upgrade

### "No data sources available"
- Patient may have no clinical records yet
- Check that patient exists in the system

### Data appears masked
- Sensitive fields are intentionally masked for security
- Contact platform admin if you need unmasked access for compliance

---

## FAQ

**Q: Can patients access the Data Console?**  
A: No. Data Console is admin-only. Patients access their own data via Patient Portal.

**Q: Are accesses logged?**  
A: Yes. All Data Console access is logged with timestamp, user, and data accessed.

**Q: Can I export data from Data Console?**  
A: Row-level viewing only. Use dedicated export endpoints for bulk exports or reports.

**Q: Who can see my Data Console access?**  
A: Only platform_admin and compliance team can audit Data Console access logs.

**Q: What if I accidentally accessed wrong patient?**  
A: Access is logged. Contact compliance team; accidental access is documented in audit trail.

---

## Documentation

- **Deployment:** See `STAGING_DEPLOYMENT_REPORT.md` for health checks
- **Clinical Review:** See `CLINICAL_REVIEW_BRIEFING.md` for safety assessment
- **Pilot Plan:** See `CONTROLLED_PILOT_PLAN.md` for access validation scenarios
