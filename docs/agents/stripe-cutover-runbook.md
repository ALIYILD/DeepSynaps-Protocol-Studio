# Stripe Live-Mode Cutover Runbook

DeepSynaps Studio — Agent Marketplace SKUs

**Audience:** platform operator (Dr. Ali Yildirim or delegated infrastructure lead).
**Status as of writing:** all Stripe code paths run **TEST MODE ONLY**. Live mode requires the steps below.

---

## Why this runbook exists

`apps/api/app/services/stripe_skus.py` enforces a hard guardrail:

```python
if key.startswith("sk_live_") and os.getenv("STRIPE_LIVE_MODE_ACK") != "1":
    raise RuntimeError("live key without explicit ack")
```

This is intentional. Setting `STRIPE_SECRET_KEY=sk_live_*` alone will **crash the API on import**. You must also set `STRIPE_LIVE_MODE_ACK=1` to opt in. The two-flag handshake means a leaked or copy-pasted live key cannot silently switch billing modes.

---

## Pre-cutover checklist

- [ ] All four agent SKUs have correct `monthly_price_gbp` in `apps/api/app/services/agents/registry.py`
  - clinic.reception → £99
  - clinic.reporting → £49
  - clinic.drclaw_telegram → £79
  - patient.* → locked, won't be charged anyway
- [ ] Stripe Dashboard live-mode account has Tax + UK VAT settings finalised
- [ ] Webhook endpoint registered in live Dashboard: `https://deepsynaps-studio.fly.dev/api/v1/agent-billing/webhook`
  - Events to send: `checkout.session.completed`, `customer.subscription.deleted`, `customer.subscription.updated`
- [ ] Live webhook signing secret captured (starts `whsec_`)
- [ ] DB migration `050_agent_subscriptions` applied in production
- [ ] DB migration `051_phase7_agent_infra` applied (adds webhook dedupe table — Phase 7)
- [ ] Test-mode end-to-end happy path verified at least once on the live preview
- [ ] Refund + dispute playbook agreed with finance
- [ ] T&C / privacy policy mentions per-clinic agent subscriptions

## Cutover (production deploy)

```sh
# 1. Set the live secret + the explicit acknowledgment flag.
flyctl secrets set \
  STRIPE_SECRET_KEY=sk_live_<REDACTED> \
  STRIPE_WEBHOOK_SECRET=whsec_<LIVE_REDACTED> \
  STRIPE_LIVE_MODE_ACK=1 \
  -a deepsynaps-studio

# 2. Trigger a redeploy so the API picks up the new env.
bash scripts/deploy-preview.sh --api

# 3. Confirm the boot did not raise.
flyctl logs -a deepsynaps-studio | grep -E "stripe|live"
# expect: 0 lines containing "live key without explicit ack"
# expect: at least 1 line confirming "stripe key fingerprint" with a sk_live_ tail

# 4. Verify billing endpoints up.
curl -s -o /dev/null -w "billing-subs HTTP %{http_code}\n" https://deepsynaps-studio.fly.dev/api/v1/agent-billing/subscriptions
# expect: 401 or 403 (auth gate; never 5xx)
```

## Verification — first live test purchase

Use a known clinic admin account. Real card. Small SKU first.

```sh
# 1. From the clinic admin's browser, click "Request upgrade →" on a locked tile (e.g. clinic.reporting £49).
# 2. Complete Stripe Checkout with a live card (your own test card or a £1 promo SKU is safer for the first run).
# 3. Confirm webhook received:
flyctl logs -a deepsynaps-studio | grep "checkout.session.completed"

# 4. Confirm DB row flipped to active:
flyctl postgres connect -a deepsynaps-studio
> SELECT id, clinic_id, agent_id, status, started_at FROM agent_subscription ORDER BY created_at DESC LIMIT 5;

# 5. Confirm subscription appears in the clinic's UI.
```

## Rollback

If anything goes wrong:

```sh
flyctl secrets set \
  STRIPE_SECRET_KEY=sk_test_<REDACTED> \
  STRIPE_WEBHOOK_SECRET=whsec_<TEST_REDACTED> \
  STRIPE_LIVE_MODE_ACK=0 \
  -a deepsynaps-studio
bash scripts/deploy-preview.sh --api
```

Existing live subscriptions are NOT affected — they live in Stripe's live database. The DB rows for those subscriptions stay in the `active` state. Reverting the keys just means **no new subscriptions can be charged** until you re-cut over.

To refund + cancel a live subscription you accidentally took:
1. Stripe Dashboard → Customers → find the customer → Subscriptions → Cancel
2. Refund the latest invoice from the same screen
3. Webhook fires `customer.subscription.deleted` → our DB flips to `canceled`
4. Customer email auto-sent by Stripe

## Periodic rotation

Stripe live keys should rotate every 90 days minimum. Drill:

```sh
# 1. In Stripe Dashboard, create a new live restricted key (Read+Write on Subscriptions, Customers, Prices, Checkout).
# 2. Set it on Fly:
flyctl secrets set STRIPE_SECRET_KEY=sk_live_<NEW> -a deepsynaps-studio
# 3. Trigger redeploy.
# 4. Verify boot logs (as in Cutover step 3).
# 5. After 24h with no errors, REVOKE the old key in Stripe Dashboard.
```

## Common gotchas

- **Webhook signature mismatch in logs** → the `STRIPE_WEBHOOK_SECRET` env var doesn't match the signing secret in Stripe Dashboard. Re-fetch from the Dashboard and re-set.
- **Customer collision** — `_find_or_create_customer` looks up via `metadata.clinic_id`. If a clinic was deleted + recreated, you may end up with a stale Stripe Customer pointing at the old clinic. Fix: manually merge customers in Stripe Dashboard.
- **Duplicate webhook events** — handled in `handle_subscription_webhook` via the `stripe_webhook_event` table (Phase 7). No action needed.
- **`live key without explicit ack` runtime error** → you set `STRIPE_SECRET_KEY` but forgot `STRIPE_LIVE_MODE_ACK=1`. Set both atomically: `flyctl secrets set STRIPE_SECRET_KEY=... STRIPE_LIVE_MODE_ACK=1`.

## What this runbook does NOT cover

- Tax compliance — that's finance + legal
- Direct debit / SEPA / non-card payment methods — Stripe Checkout only handles cards in the current setup
- Multi-currency — all prices are GBP; introducing USD/EUR is a separate workstream

## Audit trail

Every checkout creates a row in `agent_subscription`. Every webhook is logged to `stripe_webhook_event` (Phase 7) so duplicates are detectable and the full event history is recoverable. Every agent run is logged to `agent_run_audit` with `cost_pence` (Phase 7).
