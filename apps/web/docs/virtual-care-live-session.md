# Virtual Care — Live Session (`pgLiveSession`)

Clinician-facing surface under `?page=live-session` (opens the **Live Session** tab in the unified Virtual Care shell).

## Session notes

- **Session notes are local/export-only until saved to the clinical record/EHR.**  
  This UI does not call a server-backed clinician notes endpoint; persistence is browser `localStorage` plus optional `.txt` export.

## Video

- Uses `POST /api/v1/sessions/{id}/video/start` to obtain a **clinic-generated room name**.
- The iframe loads **Jitsi Meet** — a third-party meeting stack, **not** an appliance-grade private telehealth product unless your clinic contracts one separately.
- Do **not** include PHI in room names or URLs.

## Demo mode

- Offline demo fixture (`demo-vc-fixture`) appears only when `isDemoSession()` is true (`VITE_ENABLE_DEMO` + `-demo-token`).
- Banner: **Demo session — not real patient data.**

## API boundaries

- Patient-scoped `/api/v1/virtual-care/sessions` CRUD and submits are **not** invoked from `pgLiveSession` (patient auth required).
