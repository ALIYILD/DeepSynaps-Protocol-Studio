# Billing Integration Notes

## Current State

DeepSynaps Studio implements **package and entitlement infrastructure only**.
No billing provider (Stripe, Paddle, etc.) is integrated. This is intentional
for the current stage — the commercial model is defined and enforced, but
checkout and subscription management are not yet built.

## What Is Implemented

- Canonical package definitions (backend: `packages.py`, frontend: `lib/packages.ts`)
- Feature entitlement checking (`entitlements.py`, `PackageGate` component)
- Demo tokens for all five package tiers
- Package-aware `AuthenticatedActor` (backend)
- Package state in `AppState` (frontend)
- Pricing page with accurate plan comparison
- Upgrade prompts throughout the UI

## What Is Not Implemented

- Checkout flow (no Stripe/Paddle integration)
- User accounts or authentication (demo tokens only)
- Subscription database tables (no `users`, `subscriptions`, `seats` tables)
- Trial periods or free-to-paid conversion
- Seat provisioning and user invitations
- Invoice management
- Plan upgrade/downgrade webhooks

## Recommended Integration Path

### Phase 1 — User accounts
Add `users` and `subscriptions` tables to the database:
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TEXT
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  package_id TEXT NOT NULL,  -- maps to PACKAGES dict
  status TEXT,               -- active, trialing, cancelled
  seat_limit INTEGER,
  created_at TEXT,
  expires_at TEXT
);
```

### Phase 2 — Stripe integration
- Map `PACKAGES` pricing to Stripe Price IDs
- Use Stripe Checkout for plan selection
- Use Stripe webhooks to update `subscriptions` table
- Replace demo token auth with JWT-based auth

### Phase 3 — Seat management
- Add `team_memberships` table for Clinic Team and Enterprise seats
- Implement admin seat invitation flows
- Enforce `seat_limit` from the `Package` definition

### Phase 4 — Add-ons
- Phenotype mapping add-on for Clinician Pro is modeled via `addon_eligible`
- Implement a separate Stripe subscription item for add-ons
- Gate via `Package.can_add_on()` + active add-on subscription check

## Package ID Mapping

When integrating a billing provider, map the `package_id` strings to product IDs:

| Package ID | Display Name | Monthly USD |
|---|---|---|
| `explorer` | Explorer | 0 |
| `resident` | Resident / Fellow | 99 |
| `clinician_pro` | Clinician Pro | 199 |
| `clinic_team` | Clinic Team | 699 |
| `enterprise` | Enterprise | Custom |

## Governance Isolation

The billing system must never affect governance rule enforcement.
Features like `PROTOCOL_EVC_OVERRIDE` grant access to a clinician override flow,
but governance checks (`_find_governance_rule`, EV-D filtering) run independently
in `clinical_data.py` and must not be conditionally skipped based on package tier.

A future billing integration should be reviewed against this constraint before release.
