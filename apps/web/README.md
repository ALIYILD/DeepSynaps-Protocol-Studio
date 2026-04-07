# DeepSynaps Studio Web

React + TypeScript + Vite frontend for DeepSynaps Studio. The app keeps role, theme, and notification state in memory, but now prefers backend-backed evidence, device, protocol, handbook, upload-review, review-action, and audit-trail flows where those endpoints exist.

## Features
- React Router workspace navigation
- left sidebar and top bar application shell
- in-memory role simulation for Guest, Verified Clinician, and Admin
- light and dark mode toggle without persistence
- backend-backed evidence library and device registry
- deterministic protocol generation through FastAPI
- deterministic handbook generation through FastAPI
- clinician-gated upload review with backend case summary
- persisted review action logging and admin audit trail preview
- top-level error boundary and graceful API/network errors

## Demo auth behavior
The frontend maps the in-memory role switcher to demo Bearer tokens:
- `Guest` -> `guest-demo-token`
- `Verified Clinician` -> `clinician-demo-token`
- `Admin` -> `admin-demo-token`

Protected frontend service adapters send `Authorization: Bearer <token>` automatically for:
- `POST /api/v1/uploads/case-summary`
- `POST /api/v1/protocols/generate-draft`
- `POST /api/v1/handbooks/generate`
- `POST /api/v1/review-actions`
- `GET /api/v1/audit-trail`

Role is not sent in sensitive request bodies.

## Local setup
From the repository root:

```bash
npm install
```

Run the frontend:

```bash
npm run dev:web
```

Run frontend tests:

```bash
npm run test:web
```

Run the production build:

```bash
npm run build:web
```

PowerShell note:
- use `npm.cmd install`
- use `npm.cmd run dev:web`
- use `npm.cmd run test:web`
- use `npm.cmd run build:web`

## Preferred full local dev workflow
1. Start the backend in one terminal:

```bash
uv run --python 3.11 --no-project --with-editable packages/core-schema --with-editable packages/condition-registry --with-editable packages/modality-registry --with-editable packages/device-registry --with-editable packages/safety-engine --with-editable packages/generation-engine --with-editable packages/render-engine --with fastapi --with sqlalchemy --with pydantic --with uvicorn --with httpx python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --app-dir apps/api
```

2. Start the frontend in a second terminal:

```bash
npm run dev:web
```

3. Optionally run verification:

```bash
npm run test:web
npm run build:web
```

Optional frontend API override:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8000
```

## Workspace routes
- `/` dashboard
- `/evidence-library`
- `/device-registry`
- `/assessment-builder`
- `/protocols`
- `/handbooks`
- `/upload-review`
- `/governance-safety`
- `/pricing-access`

## Notes
- evidence and devices load from real API endpoints
- protocol and handbook generation run through backend deterministic services
- upload review uses backend case-summary generation and persists review actions
- governance view reads the admin audit trail from the backend
- assessment builder, pricing, and some dashboard content remain in-memory demo surfaces
- frontend tests and production build were verified in this environment
