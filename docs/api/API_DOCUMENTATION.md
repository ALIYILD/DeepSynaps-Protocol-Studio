<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# DeepSynaps Protocol Studio — API Documentation

> **API Base (production):** `https://deepsynaps-studio.fly.dev`  
> **API Base (local dev):** `http://localhost:8000`  
>
> **Safety Notice:** All clinical endpoints return a `safety_disclaimer` field. Outputs are decision support only — clinician review required. Does not diagnose, prescribe, or prove causality.

---

## Scope of this document

The canonical endpoint inventory lives in `apps/api/app/routers/` (~178 routers). This document does **not** attempt to cover all 178. It documents only the well-known stable surface:

- `/health` — system health
- `/api/v1/knowledge/status` — knowledge base status
- `/api/v1/auth/me` — current authenticated actor
- `/api/v1/patient-portal/*` — patient self-service endpoints

For the full router inventory, browse `apps/api/app/routers/` directly.

---

## Table of Contents

1. [Authentication & Authorization](#1-authentication--authorization)
2. [System Endpoints](#2-system-endpoints)
3. [Auth Endpoints](#3-auth-endpoints)
4. [Patient Portal Endpoints](#4-patient-portal-endpoints)
5. [Error Response Formats](#5-error-response-formats)

---

## 1. Authentication & Authorization

### JWT Bearer Auth

All protected endpoints require:

```
Authorization: Bearer <jwt_token>
```

Unauthenticated requests are treated as `guest` role.

### Role Model

Roles are defined in `apps/api/app/auth.py` (`ROLE_ORDER`):

| Role | Level | Notes |
|------|-------|-------|
| `guest` | 0 | Unauthenticated / anonymous |
| `patient` | 1 | Patient portal access only |
| `technician` | 2 | Data ingestion |
| `reviewer` | 3 | Read-only review |
| `clinician` | 4 | Standard patient care |
| `admin` | 5 | Cross-clinic, platform operators |

Access control uses `require_minimum_role(actor, minimum_role)` from `apps/api/app/auth.py`. There is no `require_any_role` pattern in current main.

### Patient Portal Access

Patient portal endpoints (`/api/v1/patient-portal/*`) accept the `patient` role only (plus `admin`). Patient accounts authenticate with standard JWT; they are linked to a `Patient` DB row via email match. There is no separate patient-portal token system.

### Clinic Isolation

Patient-scoped endpoints enforce `require_patient_owner()` — actors may only access patients from their own clinic. `admin` role bypasses this gate. Cross-clinic access returns `403`.

---

## 2. System Endpoints

### GET `/health`

Unauthenticated. Used by load balancer and monitoring.

```bash
curl https://deepsynaps-studio.fly.dev/health
```

**Response:**
```json
{"status": "ok"}
```

Health check is also the post-deploy smoke test: `curl -sf https://deepsynaps-studio.fly.dev/health`

---

### GET `/api/v1/knowledge/status`

Returns knowledge base / evidence index status.

**Auth:** None or `guest`+

```bash
curl https://deepsynaps-studio.fly.dev/api/v1/knowledge/status
```

> <!-- TODO: verify current contract; original claim could not be substantiated --> Confirm response schema against `apps/api/app/routers/knowledge_router.py`.

---

## 3. Auth Endpoints

### GET `/api/v1/auth/me`

Returns the currently authenticated actor's identity and role.

**Auth:** Bearer token required

```bash
curl https://deepsynaps-studio.fly.dev/api/v1/auth/me \
  -H "Authorization: Bearer <token>"
```

**Response (example):**
```json
{
  "actor_id": "user-abc123",
  "display_name": "Dr. Jane Smith",
  "role": "clinician",
  "clinic_id": "clinic-001"
}
```

> <!-- TODO: verify current contract; original claim could not be substantiated --> Confirm exact response shape against `apps/api/app/routers/auth_router.py`.

---

## 4. Patient Portal Endpoints

All patient portal endpoints are in `apps/api/app/routers/patient_portal_router.py` under prefix `/api/v1/patient-portal`. All require `patient` role (or `admin`).

### Quick Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/patient-portal/me` | Authenticated patient's own record |
| GET | `/api/v1/patient-portal/dashboard` | Dashboard aggregates (sessions, progress, streak) |
| GET | `/api/v1/patient-portal/courses` | Treatment courses for the patient |
| GET | `/api/v1/patient-portal/sessions` | Delivered + scheduled sessions |
| GET | `/api/v1/patient-portal/assessments` | Assessment records |
| POST | `/api/v1/patient-portal/self-assessments` | Patient-initiated assessment submission |
| GET | `/api/v1/patient-portal/outcomes` | Outcome measurements |
| GET | `/api/v1/patient-portal/summary` | Patient-safe qEEG/MRI/outcome summary |
| GET | `/api/v1/patient-portal/reports` | Reports shared with the patient |
| GET | `/api/v1/patient-portal/messages` | Messages (sent and received) |
| POST | `/api/v1/patient-portal/messages` | Send a message to the care team |
| PATCH | `/api/v1/patient-portal/messages/{id}/read` | Mark a message as read |
| GET | `/api/v1/patient-portal/wearables` | Device connections + recent alerts |
| GET | `/api/v1/patient-portal/wearable-summary` | Daily health summary (default 7 days) |
| POST | `/api/v1/patient-portal/wearable-connect` | Register/update a device connection |
| DELETE | `/api/v1/patient-portal/wearable-connect/{id}` | Disconnect a device |
| POST | `/api/v1/patient-portal/wearable-sync` | Submit a daily health summary |
| GET | `/api/v1/patient-portal/home-program-tasks` | Home program tasks assigned by clinician |
| POST | `/api/v1/patient-portal/home-program-tasks/{id}/complete` | Mark a task complete |
| GET | `/api/v1/patient-portal/home-program-tasks/{id}/completion` | Get completion record |
| GET | `/api/v1/patient-portal/wellness-logs` | Wellness check-in history |
| POST | `/api/v1/patient-portal/wellness-logs` | Submit a wellness check-in |
| GET | `/api/v1/patient-portal/notifications` | Notifications (messages, reminders, assessments) |
| PATCH | `/api/v1/patient-portal/notifications/{id}/read` | Mark notification as read |
| GET | `/api/v1/patient-portal/learn-progress` | Read article IDs |
| POST | `/api/v1/patient-portal/learn-progress` | Mark an article as read |

### Example — GET `/api/v1/patient-portal/me`

```bash
curl https://deepsynaps-studio.fly.dev/api/v1/patient-portal/me \
  -H "Authorization: Bearer <patient_token>"
```

**Response:**
```json
{
  "patient_id": "patient-abc123",
  "first_name": "Jane",
  "last_name": "Doe",
  "dob": "1985-03-15",
  "gender": "female",
  "primary_condition": "MDD",
  "status": "active",
  "user_id": "user-abc123",
  "user_email": "jane@example.com",
  "user_display_name": "Jane Doe"
}
```

### Example — POST `/api/v1/patient-portal/messages`

```bash
curl -X POST https://deepsynaps-studio.fly.dev/api/v1/patient-portal/messages \
  -H "Authorization: Bearer <patient_token>" \
  -H "Content-Type: application/json" \
  -d '{"body": "I had a question about my last session.", "subject": "Session question"}'
```

**Response (201):**
```json
{
  "id": "msg-uuid",
  "sender_id": "user-abc123",
  "recipient_id": "clinician-001",
  "patient_id": "patient-abc123",
  "body": "I had a question about my last session.",
  "subject": "Session question",
  "thread_id": "msg-uuid",
  "sender_type": "patient",
  "created_at": "2026-05-18T10:00:00+00:00",
  "is_read": false
}
```

---

## 5. Error Response Formats

### Standard HTTP Status Codes

| Code | When |
|------|------|
| `200 OK` | Successful GET |
| `201 Created` | Successful POST that creates a resource |
| `400 Bad Request` | Invalid parameters or validation failure |
| `401 Unauthorized` | Missing or invalid JWT |
| `403 Forbidden` | Role insufficient, clinic isolation violation, or consent missing |
| `404 Not Found` | Resource does not exist or is not linked to the actor |
| `422 Unprocessable Entity` | Pydantic validation error |
| `500 Internal Server Error` | Unexpected server error |

### Error Body Shape

```json
{
  "code": "insufficient_role",
  "message": "Clinician access is required for this action.",
  "warnings": []
}
```

Errors are raised via `ApiServiceError` in `apps/api/app/errors.py`.

### Common 403 Cases

| `code` | Cause |
|--------|-------|
| `insufficient_role` | Role below the minimum required |
| `cross_clinic_access_denied` | Actor's clinic does not match patient's clinic |
| `patient_role_required` | Non-patient tried to access a portal endpoint |
| `forbidden` | Generic portal-level role rejection |
