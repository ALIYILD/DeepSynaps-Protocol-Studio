<!-- Edited 2026-05-18 from kimi-salvage; original audit verdict EDIT. -->
# Patient Portal Onboarding Guide — DeepSynaps Beta

**Version:** 4.0.0-BETA  
**Audience:** Patients, patient advocates, clinic staff  
**Goal:** Help patients use the DeepSynaps patient portal safely and effectively

> **Access model:** The patient portal is not a separate user type in the system role hierarchy. Patient access is provided via the `patient` role on a user account, with all portal endpoints enforced in `apps/api/app/routers/patient_portal_router.py`. Patients log in via standard JWT auth; the portal endpoints reject any role other than `patient` (or `admin`).

---

## 1. Getting Started

### First Login

1. Your clinic will provide:
   - Patient portal URL
   - Your login credentials (email + password set via clinic invite)

2. Visit the portal URL
3. Enter your email and password
4. You may be asked to agree to digital access terms

### Dashboard Overview

After login, you'll see:
- **Your name** (top of page)
- **Upcoming sessions** and session progress
- **Unread messages** from your care team
- **Wellness streak** (consecutive days with a check-in logged)
- **Quick actions:** Message, Check-in, View reports

---

## 2. Sessions

### View Sessions
- Open the Sessions section from the sidebar
- See upcoming scheduled sessions and past delivered sessions
- Details: date, time, modality, session number

### What You Can Do
- View session details
- See next scheduled session date
- No self-scheduling in beta — contact clinic to schedule

---

## 3. Home Program Tasks

### What Are Home Program Tasks?
Activities your clinician has assigned between sessions:
- Exercises or practices
- Reflections or journaling prompts
- Wellness surveys

### Completing a Task
1. Open Home Program from the menu
2. Click on a pending task
3. Follow the instructions
4. Submit your completion (with optional rating 1–5 and feedback)
5. Confirmation will appear

---

## 4. Messages

### Sending a Message
1. Open Messages
2. Click "New Message"
3. Write your message (routed to your assigned clinician)
4. Click Send

> A clinician must be assigned to your account before you can send messages. If messaging is unavailable, contact your clinic.

### What to Message About
- Questions about your care plan
- Symptom updates between visits
- Technical issues with the portal
- Appointment questions

### What NOT to Message About
- Emergency symptoms — call emergency services
- Urgent medical concerns — call your clinic directly
- Prescription changes — discuss at appointment

### Response Time
- Messages are typically answered within 1-2 business days
- Urgent messages should be followed by a phone call

---

## 5. Wellness Check-Ins

### What Are Wellness Check-Ins?
Brief daily logs your care team uses to monitor your progress:
- Mood rating (1–10)
- Sleep quality (1–10)
- Energy level (1–10)
- Side effects note
- Free-text notes

### How to Check In
1. Open Wellness from the menu (or follow a notification link)
2. Answer each question honestly
3. Submit
4. Your responses are sent to your care team

### Frequency
- Daily, as instructed by your clinician
- Takes 1–2 minutes
- One log per day (re-submitting the same day updates the record)

---

## 6. Shared Reports

### What Reports Can You See?
Reports your clinician has chosen to share:
- Assessment summaries
- Analysis results (qEEG, MRI summaries — patient-safe language)
- Outcome measurements

### How to View
1. Open Reports section
2. Click on a report to view
3. Reports are read-only

### Safety Note
> These reports are shared for your information and discussion with your clinician. They are not for self-diagnosis. Always discuss findings with your care team.

---

## 7. Wearable Data

### Connecting a Device
Supported sources: Apple Health, Android Health, Fitbit, Oura, Garmin Connect

1. Open Wearables from the menu
2. Click "Connect Device"
3. Select your device/app
4. Consent to data sharing (required)

### Daily Sync
You can submit a daily health summary (heart rate, sleep, steps, mood, etc.) manually or via the SDK bridge. Consumer-grade data is stored as `patient_reported` quality for informational trend purposes only.

---

## 8. Your Privacy and Safety

### Data Privacy
- Your data is stored securely and encrypted
- Only your clinic's authorized staff can access your data
- Your data is never shared with other clinics
- <!-- TODO: verify current contract; original claim could not be substantiated --> You can request a copy of your data at any time (per clinic policy)
- <!-- TODO: verify current contract; original claim could not be substantiated --> You can request deletion of your data (per clinic policy)

### Consent
- <!-- TODO: verify current contract; original claim could not be substantiated --> Consent handling for AI-assisted analysis should be confirmed with your clinic

### Demo vs Live
- If you see a **DEMO BUILD** banner, this is a demonstration environment
- Demo mode is controlled by the `VITE_ENABLE_DEMO` env var (frontend) and `MRI_DEMO_MODE` (backend)
- In demo mode, no real patient data is used

### Emergency
- The patient portal is NOT for emergencies
- For emergency symptoms, call emergency services immediately
- For urgent concerns, call your clinic directly

---

## 9. Technical Support

| Issue | What to Do |
|-------|-----------|
| Can't log in | Contact your clinic admin |
| Portal not loading | Refresh page, check internet |
| Task won't submit | Try again, then contact clinic |
| Message not sending | Check that a clinician is assigned; contact clinic if not |
| Data looks wrong | Contact your clinician |
| Emergency | Call emergency services — NOT the portal |

---

## 10. Getting Help

- **Portal questions:** Ask your clinic admin or clinician
- **Technical issues:** Contact clinic IT support
- **Clinical questions:** Message your clinician (non-urgent) or call (urgent)
- **Emergency:** Call emergency services
- **Privacy concerns:** Contact your clinic's privacy officer
