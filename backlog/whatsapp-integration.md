# Backlog: WhatsApp Business API Integration

## Status
**Deferred** — Telegram integration is live and covers the primary messaging channel for the AI Agents expansion.

## Why Deferred
- Telegram bot integration is already operational with webhook infrastructure, inline keyboards, and message routing.
- WhatsApp introduces significant vendor complexity (Meta Business Verification, template approvals, pricing tiers) that does not align with the current sprint goals.
- Clinic feedback indicates Telegram satisfies the immediate multi-channel need; WhatsApp is a "nice-to-have" for patient demographics that prefer it.

## API Options

### Option A: WhatsApp Business API (On-Premises / BSP-hosted)
- Hosted by a Business Solution Provider (BSP) such as 360dialog, WATI, or MessageBird.
- Pros: Faster onboarding, BSP handles infrastructure.
- Cons: Additional per-message cost, dependency on third-party uptime, limited feature parity with Cloud API.

### Option B: WhatsApp Cloud API (Meta-hosted)
- Direct integration with Meta's Graph API v18.0+.
- Pros: Lower latency, native Meta support, no BSP markup, best long-term alignment.
- Cons: Requires Meta Business Verification (see below).

**Recommendation:** Plan for **WhatsApp Cloud API** to avoid BSP lock-in and reduce ongoing costs.

## Meta Business Verification Requirements
1. **Meta Business Account** — must be created and associated with the app.
2. **Business Verification** — Meta validates:
   - Legal business name, address, phone, and website.
   - Matching documentation (business licence, articles of incorporation).
   - Turnaround: 1–5 business days; can be rejected for mismatched details.
3. **Display Name Approval** — the WhatsApp display name must reflect the registered business name.
4. **Phone Number Verification** — a valid, non-VoIP phone number must be owned and verified via OTP.

## Webhook Structure Differences from Telegram

| Dimension | Telegram | WhatsApp Cloud API |
|-----------|----------|-------------------|
| Webhook payload | `Update` object with `message`, `callback_query`, etc. | JSON object with `entry[].changes[].value.messages[]` |
| Message ID | `message.message_id` (integer) | `messages[].id` (string) |
| Sender ID | `message.chat.id` or `from.id` | `messages[].from` (E.164 phone number string) |
| Media handling | `file_id` references for direct download | Media ID + URL expiry; must fetch via Graph API |
| Delivery receipts | Optional `ChatMemberUpdated` | Native `statuses` array (sent, delivered, read, failed) |
| Webhook verification | `X-Telegram-Bot-Api-Secret-Token` | `hub.verify_token` query param + `hub.challenge` echo |

### Proposed Adapter Design
```
apps/api/app/services/channels/whatsapp_webhook_handler.rb
apps/api/app/services/channels/whatsapp_sender.rb
```

The adapter should normalise incoming messages into the internal `ChannelMessage` struct so the agent brain remains channel-agnostic.

## Message Template Requirements

WhatsApp **requires** pre-approved templates for any outbound message initiated by the clinic (proactive messages, reminders, follow-ups). Patient-initiated conversations operate within a 24-hour session window and allow free-form text.

### Template Categories
1. **Utility** — appointment reminders, lab results ready.
2. **Authentication** — OTP, verification codes.
3. **Marketing** — newsletters, promotions (requires opt-in).

### Approval Workflow
1. Create template via Graph API `POST /{whatsapp-business-account-id}/message_templates`.
2. Meta reviews for spam, policy compliance, and formatting.
3. Typical SLA: up to 24 hours.
4. Templates can include variables (`{{1}}`, `{{2}}`) injected at send time.

## Inline Approval Keyboard Equivalent

WhatsApp does not support inline keyboards in the Telegram sense. The equivalent is **Interactive Messages**.

### Interactive Message Types
1. **Reply Buttons** — up to 3 buttons below a text message (`type: button`).
2. **List Messages** — a clickable menu with up to 10 options (`type: list`).
3. **CTA URL** — single button linking to an external URL.

### Mapping from Telegram
| Telegram Element | WhatsApp Equivalent |
|------------------|---------------------|
| Inline keyboard (2–3 buttons) | Reply Buttons message |
| Inline keyboard (4+ buttons) | List Message |
| Callback data | Button `id` payload (max 256 chars) |
| Deep-link buttons | CTA URL button |

### Example Normalised Flow
```
AgentBrain → ChannelDispatcher → (Telegram|WhatsApp)Adapter
                                     → renders Reply Buttons or Inline Keyboard
```

## Estimated Effort
**3–5 days**

### Breakdown
- Day 1: Meta app setup, webhook verification, Cloud API SDK integration.
- Day 2: Message normalisation adapter, incoming handler.
- Day 3: Outgoing sender, media download/upload mapping.
- Day 4: Interactive message rendering (reply buttons, list messages).
- Day 5: Template management API, testing, edge-case handling.

## Dependencies
- [ ] Meta developer account with Business Manager
- [ ] Meta Business Verification completed and approved
- [ ] Verified phone number allocated to the WhatsApp Business Account
- [ ] Display name approved by Meta
- [ ] At least one message template submitted and approved for proactive outreach
- [ ] Billing: WhatsApp conversation-based pricing model enabled (per-country rates)

## Risks
- Meta Business Verification can be rejected, causing indefinite delays.
- Template approval SLA is outside our control; clinic onboarding may stall.
- Conversation-based pricing is significantly higher than Telegram (free) for high-volume clinics.

## Owner
Platform Engineering / Channels Squad
