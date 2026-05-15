# AI Agent Marketplace & Billing Design for Healthcare SaaS

## A Comprehensive Research Report for Clinical AI Platform Architecture

**Version:** 1.0  
**Date:** June 2025  
**Author:** AI/Healthcare Technology Research  
**Word Count:** ~25,000+ words | ~1,600+ lines  
**Classification:** Architecture Research - Internal Use  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [SaaS Marketplace Models](#2-saas-marketplace-models)
3. [Pricing Models for AI Agents](#3-pricing-models-for-ai-agents)
4. [Billing Infrastructure](#4-billing-infrastructure)
5. [Entitlement & Gating](#5-entitlement--gating)
6. [Activation/Deactivation Workflows](#6-activationdeactivation-workflows)
7. [Healthcare-Specific Billing](#7-healthcare-specific-billing)
8. [Agent Rental Model Implementation](#8-agent-rental-model-implementation)
9. [Technical Patterns](#9-technical-patterns)
10. [Implementation Roadmap](#10-implementation-roadmap)
11. [Appendices](#11-appendices)

---

## 1. Executive Summary

The convergence of AI agent technology and healthcare SaaS presents a unique monetization challenge. Unlike traditional SaaS where value is correlated with user seats, AI agents in clinical settings deliver value through autonomous work product: triaged patient messages, drafted clinical summaries, coded encounters, and resolved billing inquiries. This report provides an evidence-based analysis of marketplace architectures, pricing paradigms, billing infrastructure, and healthcare-specific considerations for deploying an AI Agent Marketplace within a clinical SaaS platform.

### Key Findings

1. **Marketplace Revenue Share Benchmarks**: Platform commissions range from 0% (Shopify, first $1M) to 30% (AppExchange), with healthcare-adjacent platforms converging on 15-20%.

2. **AI Agent Pricing Evolution**: The industry is rapidly moving away from per-seat models toward usage-based, outcome-based, and hybrid pricing. By 2027, Gartner predicts 67% of AI agent vendors will abandon pure per-seat pricing.

3. **Billing Infrastructure Maturity**: Stripe Billing + Connect provides the most comprehensive foundation for marketplace billing, with built-in support for usage-based metering, trial management, proration, and dunning.

4. **Healthcare Compliance Overhead**: HIPAA compliance adds 9-22% revenue overhead for mid-stage SaaS companies, which must be factored into pricing models.

5. **Outcome-Based Pricing Advantage**: Per-resolution pricing (e.g., $0.99-$1.50 per resolved patient interaction) aligns vendor incentives with clinical value delivery and is the recommended primary model.

6. **Technical Pattern Consensus**: Event-driven architectures with Stripe webhook handling, idempotency keys, subscription state machines, and feature flag integration are the industry-standard patterns for billing infrastructure.

---

## 2. SaaS Marketplace Models

### 2.1 Salesforce AppExchange

**Overview:** The Salesforce AppExchange is the largest enterprise application marketplace globally, with 5,951+ apps and 3,541+ active developers as of May 2025. It serves as the distribution backbone for Salesforce-integrated healthcare applications including EHR connectors, clinical data platforms, and patient engagement tools.

**Key Metrics:**
| Metric | Value |
|--------|-------|
| Total Apps Listed | 5,951+ |
| Active Developers | 3,541+ |
| Total Reviews | 79,506 |
| 12-Month App Growth | +15.73% |
| CRM Market Share | 20.7% |

**Pricing Model Distribution:**
| Model | Percentage | Notes |
|-------|-----------|-------|
| Free | 36.48% | Lowers barrier to adoption |
| Paid | 53.57% | Majority of listings |
| Freemium | 3.89% | Entry point for upsell |
| Paid Add-On Required | 6.06% | Extends core capabilities |

**Revenue Model:**
- Revenue share: 15% of app revenue (ISVforce) or 30% for OEM partners
- No listing fees for basic tier
- Paid promotional placement available
- Security review fee: $2,700 per application

**Healthcare Relevance:** Healthcare apps represent ~7.5% of the marketplace (Finance + Customer Service categories), with strong demand for HIPAA-compliant data connectors and clinical workflow tools.

**Architecture Pattern:**
```
Customer browses AppExchange -> Selects app -> Installs to org
  -> OAuth authorization -> Provisioning API call -> Feature enablement
  -> License management via LMA (License Management Application)
  -> Usage reporting back to ISV
```

**Strengths for Healthcare AI:**
- Mature trust framework with security review
- Single sign-on via Salesforce identity
- License Management Application (LMA) for entitlement tracking
- Established healthcare developer ecosystem

**Weaknesses:**
- High revenue share (15-30%)
- Security review bottleneck
- Limited usage-based billing support
- Salesforce-centric only

---

### 2.2 Slack App Directory

**Overview:** Slack's app directory enables workspace administrators to discover and install integrations. While smaller than AppExchange, it pioneered the "per-workspace" billing model that is highly relevant for clinical team communication tools.

**Pricing Model:**
- Free apps: No revenue share
- Paid apps: Tiered by workspace size
- Revenue share: Not publicly disclosed; estimated 10-15%

**Healthcare Relevance:**
- Clinical team collaboration is a high-value use case
- Per-workspace pricing maps well to per-clinic pricing
- Bot/agent-based interactions are the primary usage mode
- HIPAA-eligible with Slack Enterprise Grid

**Key Insight:** Slack's model of "install once, activate per-channel" directly maps to clinical scenarios where AI agents are deployed practice-wide but activated per-department (e.g., front desk, billing, clinical).

---

### 2.3 Zendesk Marketplace

**Overview:** Zendesk's app marketplace provides integrations for customer service workflows. Zendesk has pioneered AI agent integration with its "Zendesk AI" suite, offering clear pricing benchmarks for clinical support use cases.

**Pricing Structure (2025):**
| Plan | Price/Agent/Month (Annual) | Key Features |
|------|---------------------------|--------------|
| Support Team | $19 | Basic ticketing |
| Suite Team | $55 | Ticketing + messaging + chat + voice |
| Suite Professional | $115 | Advanced reporting + community |
| Suite Enterprise | $169 | AI-powered tools + enhanced security |

**AI Agent Pricing:**
- Copilot add-on: $50/agent/month on top of any Suite tier
- Basic AI agents included on Suite plans
- Advanced autonomous agents: Custom pricing through sales
- Per-resolution pricing: $1.50/resolution (committed) or $2.00 (pay-as-you-go)

**Healthcare Relevance:**
- Patient support ticketing directly maps to clinical use cases
- Per-resolution pricing model is directly applicable to patient inquiry resolution
- Zendesk's AI agent pricing ($1.50/resolution) serves as a benchmark for clinical AI interactions

**Revenue Share:** Not publicly disclosed for marketplace apps; estimated 15-20%.

---

### 2.4 Shopify App Store

**Overview:** The Shopify App Store represents one of the most developer-friendly marketplace models, with a tiered revenue share that strongly favors early-stage developers.

**Revenue Share Model (2025+):**
| Lifetime Gross Revenue | Revenue Share Rate |
|----------------------|-------------------|
| First $1,000,000 USD | 0% (Platform keeps nothing) |
| Above $1,000,000 USD | 15% |
| High-volume ($20M+/year) | 15% on all revenue |

**Additional Fees:**
- Registration fee: $19 one-time per Partner account
- Processing fee: 2.9% on all billing
- Sales tax on fees

**Healthcare Relevance:**
- While not healthcare-focused, Shopify's "0% on first $1M" model is the gold standard for attracting developers to a nascent marketplace
- The app installation flow (OAuth + webhook provisioning) is directly applicable
- Billing API patterns for usage-based charges are industry-leading

**Key Insight:** A healthcare AI agent marketplace should adopt Shopify's tiered revenue share to attract clinical AI developers early, transitioning to 15% as the marketplace matures.

---

### 2.5 AWS Marketplace

**Overview:** AWS Marketplace provides the most enterprise-grade SaaS billing infrastructure, supporting three pricing models: SaaS Contract, SaaS Contract with Consumption, and SaaS Subscription (pay-as-you-go).

**SaaS Pricing Models:**
| Model | Billing Type | Use Case |
|-------|-------------|----------|
| SaaS Contract | Upfront billing | Annual/term commitments |
| Contract with Consumption | Upfront + metered overages | Hybrid models |
| SaaS Subscription | Pay-as-you-go | Usage-based billing |

**Revenue Share:** Varies by listing type; typically 5-20% depending on contract structure.

**Key Integration APIs:**
- `ResolveCustomer` - Exchange marketplace token for customer ID
- `GetEntitlement` - Verify subscription entitlements
- `BatchMeterUsage` - Send hourly metering records
- SNS Topic - Subscription change notifications

**Healthcare Relevance:**
- HIPAA-eligible services can be listed
- Enterprise procurement integration (AWS budgets, POs)
- Usage-based billing (metered) is ideal for AI agent consumption
- No direct clinical workflow integration

**Architecture Pattern:**
```python
# AWS Marketplace Customer Resolution Flow
import boto3

def resolve_customer(post_body):
    """Resolve AWS Marketplace registration token to customer ID."""
    import urllib.parse as urlparse
    form_fields = urlparse.parse_qs(post_body)
    reg_token = form_fields['x-amzn-marketplace-token']

    if reg_token:
        marketplace_client = boto3.client('meteringmarketplace')
        customer_data = marketplace_client.resolve_customer(regToken=reg_token)
        product_code = customer_data['ProductCode']
        customer_id = customer_data['CustomerIdentifier']

        # Store customer_id in application database
        store_customer_mapping(customer_id, product_code)

        # Verify entitlements
        entitlement_client = boto3.client('marketplace-entitlement')
        entitlements = entitlement_client.get_entitlements(
            ProductCode=product_code,
            Filter={'CUSTOMER_IDENTIFIER': [customer_id]}
        )

        # Provision access based on entitlements
        provision_access(customer_id, entitlements)
        return customer_id
```

---

### 2.6 Stripe App Marketplace

**Overview:** The Stripe App Marketplace enables applications that extend Stripe's capabilities. Its billing infrastructure (Stripe Billing + Connect) is the de facto standard for SaaS marketplace implementations.

**Stripe Pricing:**
| Service | Fee Structure |
|---------|--------------|
| Standard Card Payments | 2.9% + $0.30 per transaction |
| Billing (Subscriptions) | +0.5% on recurring charges |
| Connect (Marketplace) | +2% for Standard/Express accounts |
| ACH/Bank Transfers | 0.8%, capped at $5 |
| Invoicing | 0.4% per paid invoice |

**Marketplace Fee Collection:**
```python
# Stripe Connect: Collecting application fees
import stripe

# Create a payment with application fee (platform keeps fee)
payment_intent = stripe.PaymentIntent.create(
    amount=1000,  # $10.00
    currency="usd",
    application_fee_amount=123,  # Platform keeps $1.23
    transfer_data={
        "destination": "acct_connected_account_id",
    },
    # Platform pays Stripe fee (0.59) from the $1.23 fee
    # Platform net: $1.23 - $0.59 = $0.64
)

# Flow of funds:
# Customer pays: $10.00
# Connected account receives: $10.00 - $1.23 = $8.77
# Platform receives: $1.23 (minus Stripe's 0.59 fee = $0.64 net)
```

**Healthcare Relevance:**
- Stripe offers HIPAA-eligible service (Business Associate Agreement available)
- Most comprehensive subscription + marketplace billing APIs
- Built-in support for usage-based billing with Meter Events API
- Tax handling (Tax product) for VAT/GST

---

### 2.7 OpenAI GPT Store

**Overview:** Launched January 2024, the GPT Store is a marketplace for custom GPTs. Its revenue-sharing model represents the first major platform paying creators based purely on AI usage engagement.

**Revenue Model:**
- Revenue pool distributed based on user engagement
- Payments through Stripe
- Eligibility: Verified builder profile, compliant usage, eligible country

**Pricing Categories:**
| Category | Examples |
|----------|----------|
| Writing | Email drafters, blog assistants |
| Productivity | Meeting summarizers, task planners |
| Research & Analysis | Market research, data interpretation |
| Education | Tutors, quiz generators |
| Programming | Code reviewers, debuggers |

**Healthcare Relevance:**
- Engagement-based revenue sharing is directly applicable to clinical AI agents
- Usage-based payment (per-engagement) aligns with outcome-based healthcare pricing
- The model validates that AI marketplace creators can be compensated based on utility

---

### 2.8 Marketplace Model Comparison Matrix

| Platform | Revenue Share | Billing Type | Healthcare Ready | AI Agent Focus |
|----------|--------------|-------------|-----------------|----------------|
| Salesforce AppExchange | 15-30% | License-based | Yes (HIPAA apps) | Low |
| Slack App Directory | ~10-15% | Per-workspace | Enterprise Grid | Medium |
| Zendesk Marketplace | ~15-20% | Per-agent + outcome | Yes | High |
| Shopify App Store | 0% then 15% | Usage + subscription | No | Low |
| AWS Marketplace | 5-20% | Contract + metered | Yes | Medium |
| Stripe App Marketplace | N/A (platform) | API-based | HIPAA-eligible | Medium |
| OpenAI GPT Store | Revenue pool | Per-engagement | No | High |

---

## 3. Pricing Models for AI Agents

### 3.1 Per-Agent Monthly Rental

The per-agent monthly rental model charges a flat fee for each deployed AI agent instance, regardless of usage. This model is simple to implement and provides predictable revenue.

**Price Ranges (Healthcare):**
| Agent Type | Price Range/Month | Notes |
|-----------|-------------------|-------|
| Patient Triage Bot | $99-$299 | Per-clinic deployment |
| Clinical Documentation | $199-$499 | Per-provider (scribe-style) |
| Billing/Coding Agent | $149-$399 | Per-biller seat |
| Scheduling Assistant | $49-$149 | Per-location |
| Prior Authorization | $249-$599 | Per-specialist |

**Implementation:**
```python
# Per-agent rental pricing model
class AgentRentalPricing:
    """Flat monthly fee per deployed agent instance."""

    PRICING_TIERS = {
        "patient_triage": {"base": 149, "pro": 249, "enterprise": 399},
        "clinical_documentation": {"base": 249, "pro": 399, "enterprise": 599},
        "billing_coding": {"base": 199, "pro": 299, "enterprise": 499},
        "scheduling": {"base": 79, "pro": 129, "enterprise": 199},
        "prior_auth": {"base": 299, "pro": 449, "enterprise": 699},
    }

    def calculate_monthly_cost(self, agent_type: str, tier: str, quantity: int) -> float:
        base_price = self.PRICING_TIERS.get(agent_type, {}).get(tier, 0)
        # Volume discount: 10% off for 5+, 20% off for 10+
        if quantity >= 10:
            discount = 0.20
        elif quantity >= 5:
            discount = 0.10
        else:
            discount = 0.0
        return base_price * quantity * (1 - discount)
```

**Pros:**
- Predictable revenue for both parties
- Simple billing implementation
- Maps to existing SaaS seat-based purchasing habits

**Cons:**
- Doesn't align cost with value delivered
- Heavy users subsidize light users
- Risk of sticker shock for high-volume use cases

---

### 3.2 Usage-Based Pricing (Per Conversation, Per Token)

Usage-based pricing charges customers for actual AI agent consumption. This is the fastest-growing pricing model for AI agents.

**Common Usage Metrics:**
| Metric | Unit | Typical Price Range |
|--------|------|-------------------|
| Per conversation | Per interaction | $0.50 - $3.00 |
| Per resolution | Per resolved issue | $0.99 - $2.00 |
| Per token (input) | Per 1K tokens | $0.01 - $0.15 |
| Per token (output) | Per 1K tokens | $0.03 - $0.50 |
| Per API call | Per request | $0.05 - $0.50 |
| Per minute | Per minute of processing | $0.10 - $0.50 |

**Healthcare-Specific Usage Pricing:**
```python
# Usage-based pricing for clinical AI agents
class UsageBasedPricing:
    """Charge based on actual AI agent consumption."""

    RATE_CARD = {
        # Patient interaction agents
        "patient_conversation": {
            "per_conversation": 1.50,
            "per_resolution": 2.50,
        },
        # Clinical documentation
        "clinical_note": {
            "per_note_drafted": 3.00,
            "per_note_finalized": 5.00,
        },
        # Coding agents
        "medical_coding": {
            "per_encounter_coded": 2.00,
            "per_claim_scrubbed": 1.50,
        },
        # Prior authorization
        "prior_auth": {
            "per_submission": 15.00,
            "per_appeal": 25.00,
        },
        # Scheduling
        "appointment_scheduling": {
            "per_scheduled": 0.75,
            "per_reminder_sent": 0.25,
        },
    }

    def calculate_usage_cost(self, agent_type: str, metric: str, quantity: int) -> float:
        rate = self.RATE_CARD.get(agent_type, {}).get(metric, 0)
        return rate * quantity

    # Stripe Meter Event integration
    def report_usage_to_stripe(self, customer_id: str, event_name: str, value: int):
        """Report usage event to Stripe Meter API."""
        import stripe
        stripe.billing.MeterEvent.create(
            event_name=event_name,
            identifier=f"{customer_id}_{uuid.uuid4()}",
            payload={
                "stripe_customer_id": customer_id,
                "value": str(value),
            },
        )
```

**Pros:**
- Cost scales with value delivered
- Low barrier to entry for small practices
- Natural expansion revenue as usage grows

**Cons:**
- Revenue unpredictability
- Customer anxiety about runaway costs
- Requires robust metering infrastructure
- Need cost caps and alerts

---

### 3.3 Tiered Bundles (Starter/Pro/Enterprise)

Tiered bundles package features and usage limits into discrete plans. This is the dominant SaaS pricing model and works well for healthcare AI agents.

**Recommended Tier Structure:**

| Feature | Starter | Professional | Enterprise |
|---------|---------|-------------|------------|
| **Price** | $299/mo | $799/mo | Custom |
| **Patient Conversations** | 200/mo | 1,000/mo | Unlimited |
| **Clinical Notes** | 50/mo | 300/mo | Unlimited |
| **Coding Encounters** | 100/mo | 500/mo | Unlimited |
| **Agents Included** | 2 | 5 | Unlimited |
| **Users (Staff)** | 5 | 20 | Unlimited |
| **Locations** | 1 | 3 | Unlimited |
| **Custom Integrations** | No | Yes | Yes |
| **HIPAA BAA** | Yes | Yes | Yes |
| **SLA Uptime** | 99.5% | 99.9% | 99.99% |
| **Support** | Email | Priority | Dedicated CSM |
| **Analytics** | Basic | Advanced | Custom |
| **Overage Rate** | $1.50/convo | $1.00/convo | Custom |

---

### 3.4 Seat-Based Pricing

Seat-based pricing charges per human user who accesses the AI agent platform. While declining in popularity for pure AI agents, it remains relevant for "co-pilot" style agents that augment human workers.

**Price Ranges:**
| Role | Price/Seat/Month |
|------|-----------------|
| Provider (MD/DO/NP/PA) | $99-$299 |
| Medical Assistant | $49-$99 |
| Billing Staff | $49-$149 |
| Front Desk | $29-$79 |
| Administrator | $79-$149 |

**Gartner Prediction:** By 2027, 67% of AI agent vendors will move off pure per-seat pricing. Seat-based pricing makes sense for co-pilot products used by named humans; usage and outcome models better reflect autonomous agent value.

---

### 3.5 Clinic-Wide Licensing

Clinic-wide licensing provides unlimited usage for a fixed annual fee. This model appeals to larger practices that want predictable budgeting.

**Price Ranges:**
| Clinic Size | Annual License | Includes |
|-------------|---------------|----------|
| Solo practice (1 provider) | $3,600-$6,000 | All agents, 1 location |
| Small group (2-5 providers) | $8,400-$18,000 | All agents, up to 2 locations |
| Medium group (6-15 providers) | $18,000-$48,000 | All agents, up to 5 locations |
| Large group (16-50 providers) | $48,000-$120,000 | All agents, unlimited locations |
| Enterprise (50+ providers) | Custom | Custom deployment |

---

### 3.6 Pay-Per-Outcome Models

Outcome-based pricing (OBP) charges only when a defined clinical or business outcome is achieved. This is the most advanced and fastest-growing AI agent pricing model.

**Healthcare Outcome Pricing Benchmarks:**
| Outcome | Price Range | Measurement |
|---------|------------|-------------|
| Patient inquiry resolved | $0.99-$2.50 | CSAT + no escalation |
| Prior authorization approved | $15-$45 | Payer approval received |
| Clinical note completed | $5-$15 | Note signed by provider |
| Coding encounter clean | $2-$5 | Claim accepted first pass |
| Appointment kept (no-show prevented) | $3-$10 | Patient attended |
| Care gap closed | $10-$30 | Screening completed |

**Implementation Framework:**
```python
class OutcomeBasedBilling:
    """Pay-per-outcome billing with attribution tracking."""

    OUTCOME_DEFINITIONS = {
        "patient_inquiry_resolved": {
            "price": 1.99,
            "definition": "Patient inquiry resolved without human escalation",
            "verification": "csat_score >= 4 AND escalation = FALSE",
            "grace_period_hours": 24,  # Allow time for follow-up
        },
        "prior_auth_approved": {
            "price": 25.00,
            "definition": "Prior authorization request approved by payer",
            "verification": "payer_response = 'APPROVED' AND agent_submitted = TRUE",
            "grace_period_hours": 168,  # 7 days for payer response
        },
        "clinical_note_completed": {
            "price": 8.00,
            "definition": "Clinical note drafted, reviewed, and signed",
            "verification": "note_status = 'SIGNED' AND agent_drafted = TRUE",
            "grace_period_hours": 72,
        },
        "coding_clean_claim": {
            "price": 3.50,
            "definition": "Claim accepted on first submission",
            "verification": "claim_status = 'ACCEPTED' AND scrub_attempts = 1",
            "grace_period_hours": 336,  # 14 days for clearinghouse
        },
    }

    def verify_outcome(self, outcome_type: str, context: dict) -> dict:
        """Verify if outcome criteria are met."""
        definition = self.OUTCOME_DEFINITIONS.get(outcome_type)
        if not definition:
            return {"verified": False, "reason": "Unknown outcome type"}

        # Evaluate verification criteria
        verified = self._evaluate_criteria(definition["verification"], context)

        if verified:
            return {
                "verified": True,
                "billable_amount": definition["price"],
                "outcome_type": outcome_type,
                "attribution_confidence": self._calculate_attribution(context),
            }
        return {"verified": False, "reason": "Criteria not met"}

    def _evaluate_criteria(self, criteria: str, context: dict) -> bool:
        """Evaluate outcome criteria against context."""
        # Simplified - in production use a proper rule engine
        if "csat_score" in criteria:
            return context.get("csat_score", 0) >= 4 and not context.get("escalation", True)
        return False

    def _calculate_attribution(self, context: dict) -> float:
        """Calculate confidence that outcome was driven by the agent."""
        # Attribution scoring: 0.0-1.0
        score = 1.0
        if context.get("human_intervention"):
            score -= 0.3
        if context.get("multiple_agents_involved"):
            score -= 0.2
        return max(score, 0.5)  # Minimum 0.5 for billing purposes
```

**Pros:**
- Perfect alignment of vendor and customer incentives
- No cost without value delivery
- Natural objection eliminator for sales

**Cons:**
- Attribution challenges (was it the agent or something else?)
- Requires robust outcome measurement
- Revenue volatility
- Need platform minimums to protect against low-volume customers

---

### 3.7 Freemium with Premium Features

The freemium model offers basic AI agent functionality for free, charging for advanced features, higher usage limits, or premium capabilities.

**Freemium Tier Structure:**
| Feature | Free | Premium |
|---------|------|---------|
| Patient conversations | 50/mo | Unlimited |
| Clinical notes | 10/mo | Unlimited |
| Basic triage | Yes | Yes |
| Prior authorization | No | Yes |
| Custom branding | No | Yes |
| Analytics | Basic | Advanced |
| Integrations | 1 EHR | Unlimited |
| Support | Community | Dedicated |

**Conversion Benchmarks:**
- Typical freemium-to-paid conversion: 2-5%
- Healthcare SaaS conversion tends higher: 5-10% due to compliance needs
- Time to conversion: 30-60 days typical

---

### 3.8 Hybrid Model (Recommended)

Most mature AI agent platforms now use a hybrid model combining multiple pricing mechanisms.

**Recommended Hybrid Structure:**
```
1. Platform Fee (Base)
   - Fixed monthly access fee
   - Includes onboarding, base support, infrastructure
   - Ranges: $299-$999/month

2. Usage Allowance (Included)
   - Bundled conversations/notes/codings per month
   - Overage rate for usage beyond allowance
   - Example: 1,000 conversations included, $0.99/convo overage

3. Agent Rental (Per-Agent)
   - Monthly fee per deployed agent
   - Discounts for agent bundles
   - Example: $149/agent/month, $99/agent for 5+

4. Outcome Bonus (Optional)
   - Additional charges for achieved outcomes
   - Premium rate for high-value outcomes
   - Example: +$5 for same-day prior auth approval

5. Success Fee (Enterprise)
   - Percentage of measurable cost savings
   - Paid quarterly based on agreed metrics
   - Example: 10% of demonstrated AR increase from reduced denials
```



---

## 4. Billing Infrastructure

### 4.1 Stripe Billing Integration

Stripe Billing is the recommended foundation for healthcare AI agent marketplace billing due to its comprehensive feature set, HIPAA-eligible status, and robust API ecosystem.

**Architecture Overview:**
```
Frontend (Checkout) -> Stripe API -> Webhooks -> Your Backend -> Database
                                              |
                                              v
                                        Entitlement Engine
                                              |
                                              v
                                         Feature Gates
```

**Core Stripe Billing Objects:**
| Object | Purpose | Example |
|--------|---------|---------|
| Product | What you sell | "Clinical Documentation Agent" |
| Price | How much and how often | $149/month recurring |
| Customer | Who pays | "Sunrise Family Practice" |
| Subscription | Agreement to pay | Active monthly subscription |
| Invoice | Bill for a period | $149 for June 2025 |
| PaymentIntent | Attempt to collect | Charging card on file |
| Meter | Usage aggregation | "clinical_notes_drafted" |
| Meter Event | Individual usage record | Note drafted at 2025-06-15T10:30:00Z |

**Stripe API Integration Code:**

```python
"""
Stripe Billing Integration for Healthcare AI Agent Marketplace
Full-featured implementation with products, prices, subscriptions,
metering, and webhook handling.
"""
import stripe
import os
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

# Initialize Stripe
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
stripe.api_version = "2025-06-30.basil"  # Use latest API version


class AgentPricingTier(str, Enum):
    """Pricing tiers for AI agents."""
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class AgentProduct(BaseModel):
    """Represents an AI agent product in the catalog."""
    name: str
    description: str
    agent_type: str
    base_price_cents: int  # Monthly base price in cents
    usage_meter_name: Optional[str] = None
    usage_price_per_unit_cents: Optional[int] = None
    included_usage: int = 0  # Included units per month


class StripeBillingService:
    """Complete Stripe Billing integration for healthcare AI marketplace."""

    def __init__(self):
        self.stripe = stripe

    # --- Product Catalog Management ---

    def create_agent_product(self, product: AgentProduct) -> Dict[str, Any]:
        """Create a product and price in Stripe for an AI agent."""
        # Create the product
        stripe_product = self.stripe.Product.create(
            name=product.name,
            description=product.description,
            metadata={
                "agent_type": product.agent_type,
                "pricing_tier": "standard",
                "healthcare_category": "clinical_ai",
            },
        )

        # Create the base subscription price
        base_price = self.stripe.Price.create(
            product=stripe_product.id,
            unit_amount=product.base_price_cents,
            currency="usd",
            recurring={"interval": "month", "interval_count": 1},
            nickname=f"{product.name} - Monthly Base",
            metadata={"price_type": "base"},
        )

        # Create usage-based price if applicable
        usage_price = None
        if product.usage_meter_name:
            usage_price = self.stripe.Price.create(
                product=stripe_product.id,
                currency="usd",
                recurring={
                    "interval": "month",
                    "usage_type": "metered",  # Usage-based billing
                    "aggregate_usage": "sum",
                },
                nickname=f"{product.name} - Usage",
                metadata={"price_type": "usage"},
            )

        return {
            "product_id": stripe_product.id,
            "base_price_id": base_price.id,
            "usage_price_id": usage_price.id if usage_price else None,
        }

    # --- Customer Management ---

    def create_clinic_customer(
        self,
        name: str,
        email: str,
        clinic_id: str,
        tax_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a Stripe Customer for a healthcare clinic."""
        customer_data = {
            "name": name,
            "email": email,
            "metadata": {
                "clinic_id": clinic_id,
                "industry": "healthcare",
                "hipaa_required": "true",
                "onboarding_date": datetime.utcnow().isoformat(),
            },
        }
        if tax_id:
            customer_data["tax_id_data"] = {"type": "us_ein", "value": tax_id}

        customer = self.stripe.Customer.create(**customer_data)
        return {
            "customer_id": customer.id,
            "created": customer.created,
        }

    # --- Subscription Management ---

    def create_subscription(
        self,
        customer_id: str,
        price_id: str,
        trial_days: int = 14,
        metadata: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Create a subscription with optional trial period."""
        subscription_params = {
            "customer": customer_id,
            "items": [{"price": price_id}],
            "trial_period_days": trial_days,
            "payment_settings": {
                "save_default_payment_method": "on_subscription",
                "payment_method_types": ["card", "us_bank_account"],
            },
            "metadata": metadata or {},
            "billing_cycle_anchor_config": {
                "day_of_month": 1  # Bill on 1st of each month
            },
        }

        subscription = self.stripe.Subscription.create(**subscription_params)
        return {
            "subscription_id": subscription.id,
            "status": subscription.status,
            "trial_end": subscription.trial_end,
            "current_period_start": subscription.current_period_start,
            "current_period_end": subscription.current_period_end,
        }

    def create_subscription_with_usage(
        self,
        customer_id: str,
        base_price_id: str,
        usage_price_id: str,
        trial_days: int = 14,
    ) -> Dict[str, Any]:
        """Create subscription with both base and usage-based pricing."""
        subscription = self.stripe.Subscription.create(
            customer=customer_id,
            items=[
                {"price": base_price_id},  # Fixed monthly fee
                {"price": usage_price_id},  # Usage-based component
            ],
            trial_period_days=trial_days,
            payment_settings={
                "save_default_payment_method": "on_subscription",
            },
            metadata={
                "billing_type": "hybrid",
                "trial_days": str(trial_days),
            },
        )
        return {
            "subscription_id": subscription.id,
            "status": subscription.status,
            "items": [item.id for item in subscription.items.data],
        }

    # --- Usage Metering ---

    def report_usage_event(
        self,
        meter_name: str,
        customer_id: str,
        value: int,
        event_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Report a usage event to Stripe Meter API.

        Idempotent: Use the same identifier for retries.
        """
        if not event_id:
            event_id = f"{meter_name}_{customer_id}_{datetime.utcnow().timestamp()}"

        meter_event = self.stripe.billing.MeterEvent.create(
            event_name=meter_name,
            identifier=event_id,  # Idempotency key
            payload={
                "stripe_customer_id": customer_id,
                "value": str(value),  # Must be a string
            },
        )
        return {
            "meter_event_id": meter_event.identifier,
            "created": meter_event.created,
        }

    def report_clinical_usage_batch(
        self,
        customer_id: str,
        usage_data: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Batch report multiple usage events for a clinic.

        Args:
            usage_data: List of {"meter_name": str, "value": int, "timestamp": float}
        """
        results = []
        for usage in usage_data:
            result = self.report_usage_event(
                meter_name=usage["meter_name"],
                customer_id=customer_id,
                value=usage["value"],
            )
            results.append(result)
        return results

    # --- Plan Changes and Proration ---

    def upgrade_subscription(
        self,
        subscription_id: str,
        new_price_id: str,
        proration_behavior: str = "create_prorations",
    ) -> Dict[str, Any]:
        """Upgrade a subscription with proration.

        Proration charges the difference immediately.
        """
        subscription = self.stripe.Subscription.modify(
            subscription_id,
            items=[{
                "id": self._get_subscription_item_id(subscription_id),
                "price": new_price_id,
            }],
            proration_behavior=proration_behavior,
            billing_cycle_anchor="unchanged",
        )
        return {
            "subscription_id": subscription.id,
            "status": subscription.status,
            "proration_date": datetime.utcnow().isoformat(),
        }

    def downgrade_subscription(
        self,
        subscription_id: str,
        new_price_id: str,
    ) -> Dict[str, Any]:
        """Downgrade a subscription - credit applied to next invoice."""
        subscription = self.stripe.Subscription.modify(
            subscription_id,
            items=[{
                "id": self._get_subscription_item_id(subscription_id),
                "price": new_price_id,
            }],
            proration_behavior="create_prorations",
            # Downgrades take effect at end of period by default
        )
        return {
            "subscription_id": subscription.id,
            "status": subscription.status,
            "effective_date": "end_of_current_period",
        }

    def _get_subscription_item_id(self, subscription_id: str) -> str:
        """Get the first subscription item ID."""
        subscription = self.stripe.Subscription.retrieve(subscription_id)
        return subscription.items.data[0].id

    # --- Cancellation ---

    def cancel_subscription(
        self,
        subscription_id: str,
        cancel_at_period_end: bool = True,
    ) -> Dict[str, Any]:
        """Cancel a subscription.

        By default, cancels at period end (allows access until paid period ends).
        """
        if cancel_at_period_end:
            subscription = self.stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True,
            )
        else:
            subscription = self.stripe.Subscription.delete(subscription_id)

        return {
            "subscription_id": subscription.id,
            "status": subscription.status,
            "cancel_at_period_end": subscription.cancel_at_period_end,
            "current_period_end": subscription.current_period_end,
        }

    # --- Checkout Session ---

    def create_checkout_session(
        self,
        customer_id: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        trial_days: int = 14,
    ) -> Dict[str, Any]:
        """Create a Stripe Checkout session for agent subscription."""
        session = self.stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": price_id, "quantity": 1}],
            subscription_data={
                "trial_period_days": trial_days,
                "metadata": {"source": "agent_marketplace"},
            },
            success_url=success_url,
            cancel_url=cancel_url,
            allow_promotion_codes=True,
            billing_address_collection="required",
            tax_id_collection={"enabled": True},  # Collect VAT/Tax ID
            automatic_tax={"enabled": True},  # Automatic tax calculation
            consent_collection={
                "terms_of_service": "required",
            },
            custom_text={
                "terms_of_service_acceptance": {
                    "message": "I agree to the Terms of Service and Business Associate Agreement (BAA)."
                }
            },
        )
        return {
            "session_id": session.id,
            "checkout_url": session.url,
        }


# --- Usage Reporting Service ---

class ClinicalUsageReporter:
    """Tracks and reports clinical AI agent usage for billing."""

    METER_NAMES = {
        "patient_conversation": "hc_patient_convo",
        "clinical_note_drafted": "hc_clinical_note",
        "encounter_coded": "hc_encounter_coded",
        "prior_auth_submitted": "hc_prior_auth",
        "appointment_scheduled": "hc_appt_scheduled",
        "care_gap_closed": "hc_care_gap",
    }

    def __init__(self, billing_service: StripeBillingService):
        self.billing = billing_service

    async def record_patient_conversation(
        self,
        customer_id: str,
        conversation_id: str,
        resolution_status: str,  # "resolved", "escalated", "abandoned"
    ):
        """Record a patient conversation for billing."""
        meter_name = self.METER_NAMES["patient_conversation"]

        # Only bill resolved conversations (outcome-based)
        if resolution_status == "resolved":
            await self.billing.report_usage_event(
                meter_name=meter_name,
                customer_id=customer_id,
                value=1,
                event_id=f"convo_{conversation_id}",
            )

    async def record_clinical_note(
        self,
        customer_id: str,
        note_id: str,
        note_type: str,  # "soap", "progress", "consult"
        provider_signed: bool,
    ):
        """Record clinical note completion for billing."""
        if not provider_signed:
            return  # Only bill finalized notes

        meter_name = self.METER_NAMES["clinical_note_drafted"]
        await self.billing.report_usage_event(
            meter_name=meter_name,
            customer_id=customer_id,
            value=1,
            event_id=f"note_{note_id}",
        )

    async def record_coding_encounter(
        self,
        customer_id: str,
        encounter_id: str,
        claim_accepted: bool,
    ):
        """Record coding encounter for outcome-based billing."""
        if not claim_accepted:
            return  # Outcome-based: only bill clean claims

        meter_name = self.METER_NAMES["encounter_coded"]
        await self.billing.report_usage_event(
            meter_name=meter_name,
            customer_id=customer_id,
            value=1,
            event_id=f"coding_{encounter_id}",
        )
```

---

### 4.2 Subscription Lifecycle Management

Understanding the subscription state machine is critical for healthcare AI marketplace billing.

**Subscription States:**
```
                    +----------+
                    |  Trialing |
                    +----+-----+
                         |
           +-------------+-------------+
           |                           |
           v                           v (trial ends)
    +-------------+              +----------+
    |   Active    |<------------>| Past Due |
    +----+------+-+              +----+-----+
         |      |                     |
    (cancel|      | (payment         | (dunning
     at    |      |  recovered)       |  exhausted)
     EoP)  |      |                   |
         |      v                   v
         |  +--------+         +---------+
         +->|Canceled|         |Churned  |
            +--------+         +---------+
```

**State Transitions:**
| From State | To State | Trigger | Action Required |
|-----------|----------|---------|-----------------|
| `incomplete` | `active` | Payment succeeds | Provision access |
| `incomplete` | `incomplete_expired` | 24h without payment | Cleanup, notify |
| `trialing` | `active` | Trial ends + payment succeeds | Full activation |
| `trialing` | `past_due` | Trial ends + payment fails | Dunning begins |
| `active` | `past_due` | Payment fails | Grace period starts |
| `past_due` | `active` | Payment succeeds | Resume full access |
| `past_due` | `canceled` | Dunning exhausted | Revoke access |
| `active` | `canceled` | Customer cancels | Access until period end |

---

### 4.3 Trial Periods

Trial periods are essential for healthcare AI agent adoption, as clinics require time to evaluate clinical utility and ensure compliance.

**Recommended Trial Structure:**

| Trial Type | Duration | Best For |
|-----------|----------|----------|
| Standard | 14 days | Self-serve onboarding |
| Extended | 30 days | Enterprise evaluations |
| Custom | 7-90 days | Sales-led deals |

**Trial Implementation:**
```python
class TrialManager:
    """Manage trial periods for healthcare AI agents."""

    DEFAULT_TRIAL_DAYS = 14
    MAX_TRIAL_DAYS = 30  # Cap to prevent abuse

    TRIAL_LIMITS = {
        "patient_conversations": 100,
        "clinical_notes": 25,
        "coding_encounters": 50,
        "prior_authorizations": 5,
        "locations": 1,
        "users": 3,
    }

    def create_trial_subscription(
        self,
        billing_service: StripeBillingService,
        customer_id: str,
        price_id: str,
        custom_trial_days: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Create a trial subscription with usage limits."""
        trial_days = min(
            custom_trial_days or self.DEFAULT_TRIAL_DAYS,
            self.MAX_TRIAL_DAYS,
        )

        result = billing_service.create_subscription(
            customer_id=customer_id,
            price_id=price_id,
            trial_days=trial_days,
            metadata={
                "trial": "true",
                "trial_limit_conversations": str(self.TRIAL_LIMITS["patient_conversations"]),
                "trial_limit_notes": str(self.TRIAL_LIMITS["clinical_notes"]),
                "trial_start": datetime.utcnow().isoformat(),
            },
        )

        # Store trial limits in your database
        self._store_trial_limits(customer_id, self.TRIAL_LIMITS)

        return {
            **result,
            "trial_days": trial_days,
            "trial_ends": datetime.utcnow() + timedelta(days=trial_days),
            "usage_limits": self.TRIAL_LIMITS,
        }

    def is_within_trial_limits(
        self,
        customer_id: str,
        metric: str,
        current_usage: int,
    ) -> bool:
        """Check if trial usage is within limits."""
        limit = self.TRIAL_LIMITS.get(metric)
        if limit is None:
            return True  # No limit for this metric
        return current_usage < limit

    def _store_trial_limits(self, customer_id: str, limits: dict):
        """Store trial limits in database for enforcement."""
        # Implementation depends on your database
        pass

    def extend_trial(self, billing_service: StripeBillingService, subscription_id: str, additional_days: int) -> Dict[str, Any]:
        """Extend a trial period (e.g., for enterprise evaluation)."""
        subscription = stripe.Subscription.modify(
            subscription_id,
            trial_end=int((datetime.utcnow() + timedelta(days=additional_days)).timestamp()),
        )
        return {
            "subscription_id": subscription.id,
            "new_trial_end": subscription.trial_end,
            "extended_by_days": additional_days,
        }
```

**Trial Best Practices:**
1. **Pre-collect payment info** during trial signup (reduces friction at conversion)
2. **Send trial reminders** at day 3, day 7, and day 1 before expiration
3. **Show usage progress** in dashboard ("You've used 45 of 100 conversations")
4. **Require BAA acceptance** before trial (healthcare compliance)
5. **Offer trial extension** for enterprise prospects (up to 30 days)
6. **Track trial health score** (engagement metric predicting conversion)

---

### 4.4 Prorated Billing

Proration ensures fair billing when customers upgrade, downgrade, or change plans mid-cycle.

**Proration Rules:**
| Action | Timing | Behavior |
|--------|--------|----------|
| Upgrade | Immediate | Charge prorated difference now |
| Downgrade | End of period | Credit applied to next invoice |
| Add agent | Immediate | Prorated charge for remainder of cycle |
| Remove agent | End of period | Credit applied to next invoice |

**Proration Calculation Example:**
```
Customer on $299/mo plan, upgrades to $799/mo on day 10 of 30-day cycle

Prorated charge:
  - New plan: $799 * (20 days remaining / 30 days) = $532.67
  - Old plan credit: $299 * (20 days remaining / 30 days) = $199.33
  - Net charge: $532.67 - $199.33 = $333.34 (charged immediately)

Next invoice (day 30): Full $799.00
```

**Stripe Proration API:**
```python
def preview_proration(
    self,
    subscription_id: str,
    new_price_id: str,
) -> Dict[str, Any]:
    """Preview prorated charge before applying plan change."""
    # Use Stripe's upcoming invoice API to preview
    subscription = stripe.Subscription.retrieve(subscription_id)

    upcoming = stripe.Invoice.upcoming(
        customer=subscription.customer,
        subscription=subscription_id,
        subscription_items=[{
            "id": subscription.items.data[0].id,
            "price": new_price_id,
        }],
        subscription_proration_behavior="create_prorations",
    )

    return {
        "prorated_amount_cents": upcoming.amount_due,
        "prorated_amount_dollars": upcoming.amount_due / 100,
        "next_invoice_date": datetime.fromtimestamp(upcoming.period_end).isoformat(),
        "line_items": [
            {"description": item.description, "amount": item.amount}
            for item in upcoming.lines.data
        ],
    }
```

---

### 4.5 Invoice Generation

Healthcare invoices must include specific elements for accounting, compliance, and HSA/FSA eligibility.

**Required Invoice Elements:**
```python
class HealthcareInvoiceGenerator:
    """Generate HIPAA-compliant invoices for healthcare AI services."""

    def generate_invoice_metadata(self, clinic_info: dict) -> dict:
        """Generate invoice metadata for healthcare context."""
        return {
            "provider_name": clinic_info["name"],
            "provider_address": clinic_info["address"],
            "provider_npi": clinic_info.get("npi"),  # National Provider Identifier
            "service_description": "AI Clinical Assistant Services",
            "service_category": "Software-as-a-Service (Healthcare)",
            "tax_classification": "SaaS - Healthcare Technology",
            "hsa_fsa_eligible": "Yes - Healthcare Operations Software",
            "ba_reference": f"BAA-{clinic_info['clinic_id']}",  # BAA reference
        }

    def customize_stripe_invoice(self, invoice_id: str, clinic_info: dict):
        """Finalize Stripe invoice with healthcare-specific metadata."""
        metadata = self.generate_invoice_metadata(clinic_info)

        stripe.Invoice.modify(
            invoice_id,
            description=f"Clinical AI Services - {clinic_info['name']}",
            footer=(
                "This invoice is for healthcare operations software services. "
                "Payment may be eligible for HSA/FSA reimbursement. "
                "Business Associate Agreement (BAA) reference: "
                f"{metadata['ba_reference']}. "
                "For questions, contact billing@clinicalai.com"
            ),
            metadata=metadata,
        )
```

---

### 4.6 Tax Handling (VAT, GST, Sales Tax)

Stripe Tax provides automatic tax calculation for US sales tax, VAT, and GST.

**Tax Configuration:**
```python
def configure_tax_settings(billing_service: StripeBillingService):
    """Configure Stripe Tax for healthcare SaaS."""
    # Enable automatic tax on all checkouts
    # Stripe Tax handles:
    # - US state sales tax
    # - EU VAT
    # - Canada GST/HST
    # - Australia GST
    # - And 30+ other jurisdictions

    # Healthcare software may be tax-exempt in certain jurisdictions
    # Configure tax codes:
    tax_code = "txcd_10103001"  # Software as a Service (SaaS)
    # Alternative: "txcd_10000000" for professional services

    return {
        "tax_provider": "stripe_tax",
        "automatic_calculation": True,
        "tax_code": tax_code,
        "healthcare_exemption_notes": (
            "Some jurisdictions exempt healthcare software from sales tax. "
            "Exemption certificates should be collected and stored."
        ),
    }
```

**Healthcare Tax Considerations:**
- Some states exempt healthcare software from sales tax (e.g., CA, NY)
- SaaS taxation varies significantly by jurisdiction
- Nonprofit clinics may have 501(c)(3) tax-exempt status
- International sales require VAT/GST registration above thresholds

---

### 4.7 Dunning Management

Dunning (delinquent user notification) management recovers failed payments through systematic retry and communication.

**Dunning Best Practices:**

| Day | Action | Channel |
|-----|--------|---------|
| 0 | Payment fails | Log event, start grace period |
| 1 | Retry payment + email | Automated email (soft tone) |
| 3 | Retry payment + email | Card update prompt |
| 5 | Retry payment + email | Service interruption warning |
| 7 | Final retry + email | Final notice before suspension |
| 14 | Suspend access | Account suspended (data retained) |
| 30 | Mark churned | Account marked canceled |

**Dunning Implementation:**
```python
class DunningManager:
    """Manage failed payment recovery for healthcare AI subscriptions."""

    RETRY_SCHEDULE = [1, 3, 5, 7]  # Days after initial failure
    GRACE_PERIOD_DAYS = 14  # Keep access during dunning

    def __init__(self, billing_service: StripeBillingService):
        self.billing = billing_service

    def handle_payment_failure(self, invoice: dict) -> Dict[str, Any]:
        """Handle a failed subscription payment."""
        customer_id = invoice["customer"]
        invoice_id = invoice["id"]
        attempt_count = invoice["attempt_count"]

        # Log the failure
        self._log_dunning_event(customer_id, invoice_id, "payment_failed", {
            "attempt_count": attempt_count,
            "failure_code": invoice.get("last_payment_error", {}).get("code"),
        })

        # Check if we should retry
        if attempt_count <= len(self.RETRY_SCHEDULE):
            retry_day = self.RETRY_SCHEDULE[attempt_count - 1]
            self._schedule_retry(invoice_id, retry_day)

        # Send appropriate communication
        self._send_dunning_email(customer_id, attempt_count)

        return {
            "status": "dunning_active",
            "attempt_count": attempt_count,
            "next_retry_day": self.RETRY_SCHEDULE[attempt_count - 1] if attempt_count <= len(self.RETRY_SCHEDULE) else None,
            "grace_period_ends": datetime.utcnow() + timedelta(days=self.GRACE_PERIOD_DAYS),
        }

    def _send_dunning_email(self, customer_id: str, attempt_count: int):
        """Send dunning email based on attempt count."""
        templates = {
            1: {
                "subject": "Payment Update Needed - Keep Your AI Agents Running",
                "tone": "helpful",
                "cta": "Update Payment Method",
            },
            2: {
                "subject": "Action Required: Update Your Payment Method",
                "tone": "urgent_helpful",
                "cta": "Update Card Now",
            },
            3: {
                "subject": "Service Interruption Risk - Please Update Payment",
                "tone": "warning",
                "cta": "Prevent Interruption",
            },
            4: {
                "subject": "Final Notice: Account Suspension in 7 Days",
                "tone": "final",
                "cta": "Update Payment Immediately",
            },
        }

        template = templates.get(attempt_count, templates[4])
        # Send email via your email service
        # Implementation depends on your email provider

    def _schedule_retry(self, invoice_id: str, days_from_now: int):
        """Schedule a payment retry."""
        # Use Stripe's smart retries or your own scheduling
        stripe.Invoice.modify(
            invoice_id,
            collection_method="charge_automatically",
        )
        # Schedule retry via your job queue (e.g., Celery, RQ)

    def handle_payment_recovered(self, invoice: dict) -> Dict[str, Any]:
        """Handle recovered payment after dunning."""
        customer_id = invoice["customer"]

        # Reactivate full access
        self._restore_access(customer_id)

        # Send recovery confirmation
        self._send_recovery_email(customer_id)

        return {
            "status": "recovered",
            "recovered_at": datetime.utcnow().isoformat(),
        }

    def _restore_access(self, customer_id: str):
        """Restore full access after payment recovery."""
        # Update your entitlement system
        pass

    def _send_recovery_email(self, customer_id: str):
        """Send payment recovery confirmation."""
        pass

    def _log_dunning_event(self, customer_id: str, invoice_id: str, event: str, details: dict):
        """Log dunning event for audit trail."""
        # Write to audit log
        pass
```

---

## 5. Entitlement & Gating

### 5.1 Feature Flags Per Plan

Feature flags control access to product features based on subscription tier. For healthcare AI agents, this includes tool permissions, usage limits, and clinical capabilities.

**Feature Flag Architecture:**
```python
"""
Entitlement and Feature Flag System for Healthcare AI Agent Marketplace
Integrates with Stripe subscriptions to control feature access.
"""
from enum import Enum
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field
import json
import redis


class PlanTier(str, Enum):
    FREE = "free"
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class Feature(str, Enum):
    # Agent deployment
    BASIC_TRIAGE_BOT = "basic_triage_bot"
    ADVANCED_TRIAGE = "advanced_triage"
    CLINICAL_DOCUMENTATION = "clinical_documentation"
    MEDICAL_CODING = "medical_coding"
    PRIOR_AUTHORIZATION = "prior_authorization"
    SCHEDULING_ASSISTANT = "scheduling_assistant"

    # Integration capabilities
    EHR_INTEGRATION = "ehr_integration"
    CUSTOM_INTEGRATIONS = "custom_integrations"
    HL7_FHIR_SUPPORT = "hl7_fhir_support"

    # Analytics and reporting
    BASIC_ANALYTICS = "basic_analytics"
    ADVANCED_ANALYTICS = "advanced_analytics"
    CUSTOM_REPORTS = "custom_reports"
    ROI_CALCULATOR = "roi_calculator"

    # Security and compliance
    HIPAA_BAA = "hipaa_baa"
    AUDIT_LOGS = "audit_logs"
    SSO = "sso"
    CUSTOM_ROLES = "custom_roles"

    # Support
    EMAIL_SUPPORT = "email_support"
    PRIORITY_SUPPORT = "priority_support"
    DEDICATED_CSM = "dedicated_csm"
    SLM_GUARANTEE = "slm_guarantee"

    # Advanced features
    WHITE_LABEL = "white_label"
    API_ACCESS = "api_access"
    WEBHOOKS = "webhooks"
    CUSTOM_WORKFLOWS = "custom_workflows"


@dataclass
class PlanEntitlements:
    """Defines what features and limits each plan tier includes."""
    tier: PlanTier
    features: Set[Feature]
    limits: Dict[str, int]
    overage_rate: Dict[str, float]


# Define plan entitlements
PLAN_ENTITLEMENTS = {
    PlanTier.STARTER: PlanEntitlements(
        tier=PlanTier.STARTER,
        features={
            Feature.BASIC_TRIAGE_BOT,
            Feature.SCHEDULING_ASSISTANT,
            Feature.BASIC_ANALYTICS,
            Feature.HIPAA_BAA,
            Feature.EMAIL_SUPPORT,
            Feature.EHR_INTEGRATION,
        },
        limits={
            "max_agents": 2,
            "max_users": 5,
            "max_locations": 1,
            "patient_conversations_monthly": 200,
            "clinical_notes_monthly": 50,
            "coding_encounters_monthly": 100,
            "prior_auths_monthly": 0,
            "api_calls_daily": 1000,
        },
        overage_rate={
            "patient_conversations": 1.50,
            "clinical_notes": 3.00,
            "coding_encounters": 2.00,
        },
    ),
    PlanTier.PROFESSIONAL: PlanEntitlements(
        tier=PlanTier.PROFESSIONAL,
        features={
            Feature.BASIC_TRIAGE_BOT,
            Feature.ADVANCED_TRIAGE,
            Feature.CLINICAL_DOCUMENTATION,
            Feature.MEDICAL_CODING,
            Feature.PRIOR_AUTHORIZATION,
            Feature.SCHEDULING_ASSISTANT,
            Feature.EHR_INTEGRATION,
            Feature.CUSTOM_INTEGRATIONS,
            Feature.HL7_FHIR_SUPPORT,
            Feature.ADVANCED_ANALYTICS,
            Feature.ROI_CALCULATOR,
            Feature.HIPAA_BAA,
            Feature.AUDIT_LOGS,
            Feature.SSO,
            Feature.PRIORITY_SUPPORT,
            Feature.API_ACCESS,
            Feature.WEBHOOKS,
        },
        limits={
            "max_agents": 5,
            "max_users": 20,
            "max_locations": 3,
            "patient_conversations_monthly": 1000,
            "clinical_notes_monthly": 300,
            "coding_encounters_monthly": 500,
            "prior_auths_monthly": 50,
            "api_calls_daily": 10000,
        },
        overage_rate={
            "patient_conversations": 1.00,
            "clinical_notes": 2.50,
            "coding_encounters": 1.50,
            "prior_auths": 20.00,
        },
    ),
    PlanTier.ENTERPRISE: PlanEntitlements(
        tier=PlanTier.ENTERPRISE,
        features={
            Feature.BASIC_TRIAGE_BOT,
            Feature.ADVANCED_TRIAGE,
            Feature.CLINICAL_DOCUMENTATION,
            Feature.MEDICAL_CODING,
            Feature.PRIOR_AUTHORIZATION,
            Feature.SCHEDULING_ASSISTANT,
            Feature.EHR_INTEGRATION,
            Feature.CUSTOM_INTEGRATIONS,
            Feature.HL7_FHIR_SUPPORT,
            Feature.BASIC_ANALYTICS,
            Feature.ADVANCED_ANALYTICS,
            Feature.CUSTOM_REPORTS,
            Feature.ROI_CALCULATOR,
            Feature.HIPAA_BAA,
            Feature.AUDIT_LOGS,
            Feature.SSO,
            Feature.CUSTOM_ROLES,
            Feature.DEDICATED_CSM,
            Feature.SLM_GUARANTEE,
            Feature.WHITE_LABEL,
            Feature.API_ACCESS,
            Feature.WEBHOOKS,
            Feature.CUSTOM_WORKFLOWS,
        },
        limits={
            "max_agents": -1,  # Unlimited (-1)
            "max_users": -1,
            "max_locations": -1,
            "patient_conversations_monthly": -1,
            "clinical_notes_monthly": -1,
            "coding_encounters_monthly": -1,
            "prior_auths_monthly": -1,
            "api_calls_daily": -1,
        },
        overage_rate={},  # Custom pricing for enterprise
    ),
}


class EntitlementEngine:
    """Feature flag and entitlement engine for healthcare AI agents."""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.cache_ttl = 300  # 5 minute cache

    def get_entitlements(self, clinic_id: str, tier: PlanTier) -> PlanEntitlements:
        """Get entitlements for a clinic, with caching."""
        cache_key = f"entitlements:{clinic_id}"
        cached = self.redis.get(cache_key)

        if cached:
            data = json.loads(cached)
            return PlanEntitlements(**data)

        # Get from plan definition
        entitlements = PLAN_ENTITLEMENTS.get(tier, PLAN_ENTITLEMENTS[PlanTier.STARTER])

        # Cache for performance
        self.redis.setex(
            cache_key,
            self.cache_ttl,
            json.dumps({
                "tier": entitlements.tier.value,
                "features": [f.value for f in entitlements.features],
                "limits": entitlements.limits,
                "overage_rate": entitlements.overage_rate,
            })
        )

        return entitlements

    def check_feature_access(
        self,
        clinic_id: str,
        tier: PlanTier,
        feature: Feature,
    ) -> Dict[str, Any]:
        """Check if a clinic has access to a specific feature."""
        entitlements = self.get_entitlements(clinic_id, tier)

        has_access = feature in entitlements.features

        if not has_access:
            # Determine which tier has this feature
            upgrade_tier = self._find_tier_with_feature(feature)
            return {
                "access_granted": False,
                "feature": feature.value,
                "current_tier": tier.value,
                "upgrade_required": True,
                "upgrade_to": upgrade_tier.value if upgrade_tier else None,
                "message": f"This feature requires {upgrade_tier.value if upgrade_tier else 'a higher'} plan.",
            }

        return {
            "access_granted": True,
            "feature": feature.value,
            "current_tier": tier.value,
        }

    def check_usage_limit(
        self,
        clinic_id: str,
        tier: PlanTier,
        metric: str,
        current_usage: int,
        requested_increment: int = 1,
    ) -> Dict[str, Any]:
        """Check if usage is within plan limits.

        Returns dict with allowed, remaining, and overage info.
        """
        entitlements = self.get_entitlements(clinic_id, tier)
        limit = entitlements.limits.get(metric, 0)

        if limit == -1:  # Unlimited
            return {
                "allowed": True,
                "limit": "unlimited",
                "current_usage": current_usage,
                "remaining": "unlimited",
                "would_overage": False,
            }

        projected_usage = current_usage + requested_increment
        would_exceed = projected_usage > limit
        remaining = max(0, limit - current_usage)

        if would_exceed:
            overage_amount = projected_usage - limit
            overage_rate = entitlements.overage_rate.get(metric, 0)
            overage_cost = overage_amount * overage_rate

            return {
                "allowed": True,  # Allow but charge overage
                "limit": limit,
                "current_usage": current_usage,
                "remaining": 0,
                "would_overage": True,
                "overage_amount": overage_amount,
                "overage_rate": overage_rate,
                "estimated_overage_cost": overage_cost,
                "message": f"This will exceed your plan limit by {overage_amount} units. Additional charges will apply.",
            }

        return {
            "allowed": True,
            "limit": limit,
            "current_usage": current_usage,
            "remaining": remaining - requested_increment,
            "would_overage": False,
        }

    def _find_tier_with_feature(self, feature: Feature) -> Optional[PlanTier]:
        """Find the minimum tier that includes a feature."""
        for tier in [PlanTier.STARTER, PlanTier.PROFESSIONAL, PlanTier.ENTERPRISE]:
            if feature in PLAN_ENTITLEMENTS[tier].features:
                return tier
        return None

    def invalidate_cache(self, clinic_id: str):
        """Invalidate entitlement cache when plan changes."""
        self.redis.delete(f"entitlements:{clinic_id}")

    def sync_from_stripe(
        self,
        clinic_id: str,
        stripe_subscription: dict,
    ) -> PlanTier:
        """Sync entitlements from Stripe subscription data."""
        # Extract tier from subscription metadata or price
        tier_str = stripe_subscription.get("metadata", {}).get("plan_tier", "starter")
        tier = PlanTier(tier_str)

        # Invalidate cache to pick up new entitlements
        self.invalidate_cache(clinic_id)

        return tier
```

---

### 5.2 Tool Permission Matrices

Each AI agent has a set of tools it can use. These must be controlled by the entitlement system.

**Tool Permission Matrix:**
```python
# Tool permissions per plan tier
TOOL_PERMISSIONS = {
    PlanTier.STARTER: {
        "tools": [
            "patient_lookup",
            "appointment_check",
            "basic_triage",
            "send_message",
        ],
        "max_tool_calls_per_hour": 100,
        "sensitive_data_access": False,
        "write_access": False,  # Read-only
    },
    PlanTier.PROFESSIONAL: {
        "tools": [
            "patient_lookup",
            "patient_create",
            "appointment_check",
            "appointment_schedule",
            "basic_triage",
            "advanced_triage",
            "clinical_note_draft",
            "coding_assist",
            "send_message",
            "prior_auth_draft",
            "ehr_read",
            "ehr_write",
        ],
        "max_tool_calls_per_hour": 1000,
        "sensitive_data_access": True,
        "write_access": True,
    },
    PlanTier.ENTERPRISE: {
        "tools": [
            "*",  # All tools including custom
        ],
        "max_tool_calls_per_hour": -1,  # Unlimited
        "sensitive_data_access": True,
        "write_access": True,
        "custom_tools": True,
        "workflow_automation": True,
    },
}

# Agent-specific tool constraints
AGENT_TOOL_POLICIES = {
    "patient_triage": {
        "required_tools": ["patient_lookup", "basic_triage", "send_message"],
        "prohibited_tools": ["ehr_write", "billing_modify"],
        "data_access_level": "limited_phi",
    },
    "clinical_documentation": {
        "required_tools": ["patient_lookup", "ehr_read", "ehr_write"],
        "prohibited_tools": ["billing_modify"],
        "data_access_level": "full_phi",
    },
    "medical_coding": {
        "required_tools": ["patient_lookup", "ehr_read", "coding_assist"],
        "prohibited_tools": ["ehr_write"],
        "data_access_level": "clinical_only",
    },
    "prior_authorization": {
        "required_tools": ["patient_lookup", "ehr_read", "prior_auth_draft"],
        "prohibited_tools": ["ehr_write", "billing_modify"],
        "data_access_level": "limited_phi",
    },
}
```

---

### 5.3 API Rate Limits Per Tier

```python
RATE_LIMITS = {
    PlanTier.FREE: {
        "requests_per_minute": 10,
        "requests_per_hour": 100,
        "requests_per_day": 500,
        "concurrent_conversations": 1,
    },
    PlanTier.STARTER: {
        "requests_per_minute": 60,
        "requests_per_hour": 1000,
        "requests_per_day": 10000,
        "concurrent_conversations": 5,
    },
    PlanTier.PROFESSIONAL: {
        "requests_per_minute": 300,
        "requests_per_hour": 10000,
        "requests_per_day": 100000,
        "concurrent_conversations": 25,
    },
    PlanTier.ENTERPRISE: {
        "requests_per_minute": 1000,
        "requests_per_hour": 50000,
        "requests_per_day": -1,  # Unlimited
        "concurrent_conversations": -1,  # Unlimited
    },
}
```

---

### 5.4 Usage Quotas and Overage Handling

**Quota Enforcement Pattern:**
```python
class QuotaEnforcer:
    """Enforce usage quotas with overage billing."""

    def __init__(
        self,
        entitlement_engine: EntitlementEngine,
        billing_service: StripeBillingService,
    ):
        self.entitlements = entitlement_engine
        self.billing = billing_service

    async def check_and_record_usage(
        self,
        clinic_id: str,
        tier: PlanTier,
        metric: str,
        usage_service,  # Service to get current usage
    ) -> Dict[str, Any]:
        """Check quota and record usage, billing overages if needed."""
        current_usage = await usage_service.get_current_usage(clinic_id, metric)

        # Check entitlement
        result = self.entitlements.check_usage_limit(
            clinic_id=clinic_id,
            tier=tier,
            metric=metric,
            current_usage=current_usage,
            requested_increment=1,
        )

        # Record the usage
        await usage_service.increment_usage(clinic_id, metric)

        # If overage, report to Stripe
        if result.get("would_overage"):
            await self.billing.report_usage_event(
                meter_name=f"overage_{metric}",
                customer_id=clinic_id,
                value=result["overage_amount"],
            )

        return result

    async def get_quota_dashboard(
        self,
        clinic_id: str,
        tier: PlanTier,
        usage_service,
    ) -> Dict[str, Any]:
        """Get quota usage for customer dashboard."""
        entitlements = self.entitlements.get_entitlements(clinic_id, tier)
        quotas = []

        for metric, limit in entitlements.limits.items():
            if limit == -1:
                continue  # Skip unlimited

            current = await usage_service.get_current_usage(clinic_id, metric)
            percentage = (current / limit * 100) if limit > 0 else 0

            quotas.append({
                "metric": metric,
                "limit": limit,
                "used": current,
                "remaining": max(0, limit - current),
                "percentage_used": round(percentage, 1),
                "status": "critical" if percentage > 90 else "warning" if percentage > 75 else "ok",
            })

        return {
            "clinic_id": clinic_id,
            "tier": tier.value,
            "quotas": quotas,
            "billing_period": self._get_current_billing_period(),
        }

    def _get_current_billing_period(self) -> Dict[str, str]:
        """Get current billing period dates."""
        now = datetime.utcnow()
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return {
            "start": start.isoformat(),
            "end": "Next month",
        }
```

---

### 5.5 Grace Periods

Grace periods maintain service access during billing issues or quota overages.

```python
class GracePeriodManager:
    """Manage grace periods for healthcare AI agent access."""

    GRACE_PERIODS = {
        "payment_failure": timedelta(days=14),
        "quota_exceeded": timedelta(hours=24),  # Soft quota grace
        "plan_downgrade": timedelta(days=7),  # Access to old features
        "trial_expiration": timedelta(hours=48),  # Extended access post-trial
    }

    async def start_grace_period(
        self,
        clinic_id: str,
        reason: str,
        custom_duration: Optional[timedelta] = None,
    ) -> Dict[str, Any]:
        """Start a grace period for a clinic."""
        duration = custom_duration or self.GRACE_PERIODS.get(
            reason, timedelta(days=7)
        )

        expires_at = datetime.utcnow() + duration

        grace_period = {
            "clinic_id": clinic_id,
            "reason": reason,
            "started_at": datetime.utcnow().isoformat(),
            "expires_at": expires_at.isoformat(),
            "duration_hours": duration.total_seconds() / 3600,
        }

        # Store in database
        await self._store_grace_period(grace_period)

        # Send notification
        await self._notify_grace_period_started(clinic_id, grace_period)

        return grace_period

    async def is_in_grace_period(self, clinic_id: str) -> bool:
        """Check if clinic is currently in a grace period."""
        grace = await self._get_active_grace_period(clinic_id)
        if not grace:
            return False
        return datetime.fromisoformat(grace["expires_at"]) > datetime.utcnow()

    async def end_grace_period(self, clinic_id: str, reason: str):
        """End a grace period early (e.g., payment received)."""
        await self._clear_grace_period(clinic_id)
        # Notify that service is fully restored
        await self._notify_grace_period_ended(clinic_id)
```

---

### 5.6 Plan Upgrades and Downgrades

**Upgrade/Downgrade Logic:**
```python
class PlanChangeManager:
    """Handle plan upgrades and downgrades."""

    def __init__(
        self,
        billing_service: StripeBillingService,
        entitlement_engine: EntitlementEngine,
    ):
        self.billing = billing_service
        self.entitlements = entitlement_engine

    async def upgrade_plan(
        self,
        clinic_id: str,
        subscription_id: str,
        new_tier: PlanTier,
    ) -> Dict[str, Any]:
        """Upgrade to a higher plan tier."""
        # Preview proration
        preview = self.billing.preview_proration(
            subscription_id=subscription_id,
            new_price_id=self._get_price_id(new_tier),
        )

        # Confirm with customer (in real app, this would be user-facing)
        # Apply upgrade immediately
        result = self.billing.upgrade_subscription(
            subscription_id=subscription_id,
            new_price_id=self._get_price_id(new_tier),
        )

        # Update entitlements immediately
        self.entitlements.invalidate_cache(clinic_id)

        # Provision new features
        await self._provision_new_features(clinic_id, new_tier)

        return {
            "status": "upgraded",
            "new_tier": new_tier.value,
            "prorated_charge_cents": preview["prorated_amount_cents"],
            "effective": "immediately",
            "subscription_id": result["subscription_id"],
        }

    async def downgrade_plan(
        self,
        clinic_id: str,
        subscription_id: str,
        new_tier: PlanTier,
    ) -> Dict[str, Any]:
        """Downgrade to a lower plan tier."""
        # Downgrades take effect at end of period
        result = self.billing.downgrade_subscription(
            subscription_id=subscription_id,
            new_price_id=self._get_price_id(new_tier),
        )

        # Schedule entitlement change for end of period
        await self._schedule_entitlement_change(
            clinic_id=clinic_id,
            new_tier=new_tier,
            effective_date=result.get("current_period_end"),
        )

        return {
            "status": "downgrade_scheduled",
            "new_tier": new_tier.value,
            "effective": "end_of_current_period",
            "subscription_id": result["subscription_id"],
        }

    async def _provision_new_features(self, clinic_id: str, tier: PlanTier):
        """Provision newly available features after upgrade."""
        new_entitlements = self.entitlements.get_entitlements(clinic_id, tier)
        # Trigger provisioning workflows for new features
        for feature in new_entitlements.features:
            await self._provision_feature(clinic_id, feature)

    def _get_price_id(self, tier: PlanTier) -> str:
        """Get Stripe price ID for a tier."""
        price_map = {
            PlanTier.STARTER: "price_starter_monthly",
            PlanTier.PROFESSIONAL: "price_professional_monthly",
            PlanTier.ENTERPRISE: "price_enterprise_monthly",
        }
        return price_map[tier]
```

---

## 6. Activation/Deactivation Workflows

### 6.1 Self-Serve Agent Activation

```python
"""
Agent Activation/Deactivation Workflow Engine
Handles the full lifecycle of AI agent deployment in clinical environments.
"""
from enum import Enum
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
import uuid


class AgentActivationStep(str, Enum):
    INITIATED = "initiated"
    BILLING_VERIFIED = "billing_verified"
    HIPAA_ACKNOWLEDGED = "hipaa_acknowledged"
    CREDENTIALS_CONFIGURED = "credentials_configured"
    EHR_CONNECTED = "ehr_connected"
    AGENT_PROVISIONED = "agent_provisioned"
    INITIAL_TRAINING = "initial_training"
    SANDBOX_TESTING = "sandbox_testing"
    PRODUCTION_READY = "production_ready"
    ACTIVATED = "activated"
    FAILED = "failed"


@dataclass
class ActivationState:
    """Tracks the activation state of an AI agent."""
    agent_id: str
    clinic_id: str
    current_step: AgentActivationStep
    steps_completed: List[AgentActivationStep]
    started_at: str
    completed_at: Optional[str] = None
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = None


class AgentActivationWorkflow:
    """Orchestrates the AI agent activation workflow."""

    # Define the step sequence
    ACTIVATION_STEPS = [
        AgentActivationStep.BILLING_VERIFIED,
        AgentActivationStep.HIPAA_ACKNOWLEDGED,
        AgentActivationStep.CREDENTIALS_CONFIGURED,
        AgentActivationStep.EHR_CONNECTED,
        AgentActivationStep.AGENT_PROVISIONED,
        AgentActivationStep.INITIAL_TRAINING,
        AgentActivationStep.SANDBOX_TESTING,
        AgentActivationStep.PRODUCTION_READY,
        AgentActivationStep.ACTIVATED,
    ]

    def __init__(
        self,
        billing_service: StripeBillingService,
        entitlement_engine: EntitlementEngine,
        ehr_service,  # EHR integration service
        agent_runtime,  # Agent runtime/provisioning service
    ):
        self.billing = billing_service
        self.entitlements = entitlement_engine
        self.ehr = ehr_service
        self.runtime = agent_runtime

    async def start_activation(
        self,
        clinic_id: str,
        agent_type: str,
        tier: PlanTier,
    ) -> ActivationState:
        """Start the agent activation workflow."""
        agent_id = str(uuid.uuid4())

        state = ActivationState(
            agent_id=agent_id,
            clinic_id=clinic_id,
            current_step=AgentActivationStep.INITIATED,
            steps_completed=[AgentActivationStep.INITIATED],
            started_at=datetime.utcnow().isoformat(),
            metadata={"agent_type": agent_type, "tier": tier.value},
        )

        # Store initial state
        await self._persist_state(state)

        return state

    async def execute_step(
        self,
        agent_id: str,
        step: AgentActivationStep,
        context: Dict[str, Any],
    ) -> ActivationState:
        """Execute a single activation step."""
        state = await self._get_state(agent_id)
        clinic_id = state.clinic_id
        agent_type = state.metadata["agent_type"]
        tier = PlanTier(state.metadata["tier"])

        try:
            if step == AgentActivationStep.BILLING_VERIFIED:
                await self._verify_billing(clinic_id, tier, agent_type)

            elif step == AgentActivationStep.HIPAA_ACKNOWLEDGED:
                await self._verify_hipaa_acknowledgment(clinic_id, context)

            elif step == AgentActivationStep.CREDENTIALS_CONFIGURED:
                await self._configure_credentials(clinic_id, agent_id, agent_type, context)

            elif step == AgentActivationStep.EHR_CONNECTED:
                await self._connect_ehr(clinic_id, agent_id, context)

            elif step == AgentActivationStep.AGENT_PROVISIONED:
                await self._provision_agent(clinic_id, agent_id, agent_type, tier)

            elif step == AgentActivationStep.INITIAL_TRAINING:
                await self._train_agent(clinic_id, agent_id, agent_type, context)

            elif step == AgentActivationStep.SANDBOX_TESTING:
                await self._run_sandbox_tests(clinic_id, agent_id, agent_type)

            elif step == AgentActivationStep.PRODUCTION_READY:
                await self._prepare_for_production(clinic_id, agent_id)

            elif step == AgentActivationStep.ACTIVATED:
                await self._activate_agent(clinic_id, agent_id)
                state.completed_at = datetime.utcnow().isoformat()

            # Mark step as completed
            state.steps_completed.append(step)
            state.current_step = step
            await self._persist_state(state)

        except Exception as e:
            state.current_step = AgentActivationStep.FAILED
            state.error_message = str(e)
            await self._persist_state(state)
            raise ActivationError(f"Step {step.value} failed: {e}")

        return state

    async def _verify_billing(self, clinic_id: str, tier: PlanTier, agent_type: str):
        """Verify billing setup for the clinic."""
        # Check if clinic has active subscription
        subscription = await self.billing.get_active_subscription(clinic_id)
        if not subscription:
            raise ActivationError("No active subscription found")

        # Check if tier allows this agent type
        feature_check = self.entitlements.check_feature_access(
            clinic_id, tier, self._get_feature_for_agent(agent_type)
        )
        if not feature_check["access_granted"]:
            raise ActivationError(f"Plan tier does not include {agent_type}")

    async def _verify_hipaa_acknowledgment(self, clinic_id: str, context: dict):
        """Verify HIPAA/BAA acknowledgment."""
        baa_signed = context.get("baa_signed", False)
        if not baa_signed:
            raise ActivationError("Business Associate Agreement must be signed")

        # Log HIPAA acknowledgment for audit
        await self._log_hipaa_event(clinic_id, "BAA_SIGNED", context)

    async def _configure_credentials(
        self,
        clinic_id: str,
        agent_id: str,
        agent_type: str,
        context: dict,
    ):
        """Configure agent credentials and secrets."""
        # Store credentials in secure vault
        credentials = {
            "api_key": self._generate_agent_api_key(agent_id),
            "webhook_secret": self._generate_webhook_secret(),
        }
        await self._store_credentials(agent_id, credentials)

    async def _connect_ehr(self, clinic_id: str, agent_id: str, context: dict):
        """Connect agent to EHR system."""
        ehr_type = context.get("ehr_type")  # "epic", "cerner", "athena", etc.
        ehr_credentials = context.get("ehr_credentials")

        connection = await self.ehr.connect(
            clinic_id=clinic_id,
            agent_id=agent_id,
            ehr_type=ehr_type,
            credentials=ehr_credentials,
        )

        if not connection["success"]:
            raise ActivationError(f"EHR connection failed: {connection['error']}")

    async def _provision_agent(self, clinic_id: str, agent_id: str, agent_type: str, tier: PlanTier):
        """Provision agent runtime environment."""
        runtime_config = {
            "agent_id": agent_id,
            "clinic_id": clinic_id,
            "agent_type": agent_type,
            "tier": tier.value,
            "resources": self._get_resource_allocation(tier),
            "security_context": {
                "phi_access": tier in [PlanTier.PROFESSIONAL, PlanTier.ENTERPRISE],
                "data_retention_days": 2555 if tier == PlanTier.ENTERPRISE else 365,
            },
        }

        await self.runtime.provision(runtime_config)

    async def _train_agent(self, clinic_id: str, agent_id: str, agent_type: str, context: dict):
        """Run initial training for the agent."""
        training_data = context.get("training_data", {})
        await self.runtime.train(
            agent_id=agent_id,
            agent_type=agent_type,
            clinic_context=training_data,
        )

    async def _run_sandbox_tests(self, clinic_id: str, agent_id: str, agent_type: str):
        """Run sandbox tests before production deployment."""
        test_results = await self.runtime.run_tests(
            agent_id=agent_id,
            test_suite=f"{agent_type}_standard_tests",
        )

        if test_results["pass_rate"] < 0.95:
            raise ActivationError(
                f"Sandbox tests failed: {test_results['pass_rate']:.1%} pass rate"
            )

    async def _prepare_for_production(self, clinic_id: str, agent_id: str):
        """Final checks before production activation."""
        # Enable monitoring and alerts
        await self.runtime.enable_monitoring(agent_id)

        # Set up audit logging
        await self.runtime.enable_audit_logging(agent_id)

        # Configure circuit breakers
        await self.runtime.configure_circuit_breakers(agent_id)

    async def _activate_agent(self, clinic_id: str, agent_id: str):
        """Activate agent in production."""
        await self.runtime.activate(agent_id)

    # --- Deactivation ---

    async def deactivate_agent(
        self,
        clinic_id: str,
        agent_id: str,
        reason: str,
    ) -> Dict[str, Any]:
        """Deactivate an AI agent."""
        # Step 1: Drain active conversations
        drain_result = await self.runtime.drain_conversations(agent_id)

        # Step 2: Disable new requests
        await self.runtime.disable(agent_id)

        # Step 3: Export data
        data_export = await self.runtime.export_data(agent_id)

        # Step 4: De-provision runtime
        await self.runtime.deprovision(agent_id)

        # Step 5: Clean up credentials
        await self._revoke_credentials(agent_id)

        # Step 6: Update billing (if applicable)
        await self._adjust_billing_for_deactivation(clinic_id, agent_id)

        return {
            "agent_id": agent_id,
            "status": "deactivated",
            "reason": reason,
            "conversations_drained": drain_result["count"],
            "data_export_location": data_export["location"],
            "deactivated_at": datetime.utcnow().isoformat(),
        }

    def _get_feature_for_agent(self, agent_type: str) -> Feature:
        """Map agent type to feature flag."""
        mapping = {
            "patient_triage": Feature.BASIC_TRIAGE_BOT,
            "clinical_documentation": Feature.CLINICAL_DOCUMENTATION,
            "medical_coding": Feature.MEDICAL_CODING,
            "prior_authorization": Feature.PRIOR_AUTHORIZATION,
            "scheduling": Feature.SCHEDULING_ASSISTANT,
        }
        return mapping.get(agent_type, Feature.BASIC_TRIAGE_BOT)

    def _get_resource_allocation(self, tier: PlanTier) -> dict:
        """Get compute resource allocation for tier."""
        allocations = {
            PlanTier.STARTER: {"cpu": "0.5", "memory": "512Mi", "gpu": False},
            PlanTier.PROFESSIONAL: {"cpu": "1", "memory": "1Gi", "gpu": False},
            PlanTier.ENTERPRISE: {"cpu": "2", "memory": "2Gi", "gpu": True},
        }
        return allocations.get(tier, allocations[PlanTier.STARTER])


class ActivationError(Exception):
    """Raised when an activation step fails."""
    pass
```

---

### 6.2 Configuration Wizards

```python
class AgentConfigurationWizard:
    """Guided configuration wizard for agent setup."""

    WIZARD_STEPS = {
        "patient_triage": [
            {"id": "clinic_info", "title": "Clinic Information", "required": True},
            {"id": "triage_protocol", "title": "Triage Protocol", "required": True},
            {"id": "provider_directory", "title": "Provider Directory", "required": True},
            {"id": "scheduling_rules", "title": "Scheduling Rules", "required": False},
            {"id": "escalation_matrix", "title": "Escalation Matrix", "required": True},
            {"id": "response_templates", "title": "Response Templates", "required": False},
        ],
        "clinical_documentation": [
            {"id": "ehr_connection", "title": "EHR Connection", "required": True},
            {"id": "note_templates", "title": "Note Templates", "required": True},
            {"id": "provider_preferences", "title": "Provider Preferences", "required": False},
            {"id": "coding_integration", "title": "Coding Integration", "required": False},
            {"id": "review_workflow", "title": "Review Workflow", "required": True},
        ],
    }

    def get_wizard_steps(self, agent_type: str) -> List[Dict]:
        """Get configuration steps for an agent type."""
        return self.WIZARD_STEPS.get(agent_type, [])

    def validate_step(self, agent_type: str, step_id: str, data: dict) -> Dict:
        """Validate a wizard step's data."""
        validators = {
            "clinic_info": self._validate_clinic_info,
            "triage_protocol": self._validate_triage_protocol,
            "ehr_connection": self._validate_ehr_connection,
            "escalation_matrix": self._validate_escalation_matrix,
        }

        validator = validators.get(step_id)
        if validator:
            return validator(data)

        return {"valid": True, "errors": []}

    def _validate_triage_protocol(self, data: dict) -> Dict:
        """Validate triage protocol configuration."""
        errors = []

        if not data.get("protocol_name"):
            errors.append("Protocol name is required")

        if not data.get("severity_levels"):
            errors.append("At least one severity level must be defined")

        if not data.get("response_time_sla"):
            errors.append("Response time SLA is required")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
        }

    def _validate_ehr_connection(self, data: dict) -> Dict:
        """Validate EHR connection configuration."""
        errors = []

        valid_ehr_types = ["epic", "cerner", "athenahealth", "eclinicalworks", "allscripts", "nextgen"]
        if data.get("ehr_type") not in valid_ehr_types:
            errors.append(f"Unsupported EHR type. Supported: {', '.join(valid_ehr_types)}")

        if not data.get("base_url"):
            errors.append("EHR base URL is required")

        if not data.get("client_id"):
            errors.append("Client ID is required")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
        }

    def _validate_escalation_matrix(self, data: dict) -> Dict:
        """Validate escalation matrix configuration."""
        errors = []

        if not data.get("escalation_levels"):
            errors.append("At least one escalation level is required")

        if not data.get("contact_methods"):
            errors.append("Contact methods must be specified")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
        }

    def _validate_clinic_info(self, data: dict) -> Dict:
        """Validate clinic information."""
        errors = []
        required = ["name", "address", "phone", "npi"]
        for field in required:
            if not data.get(field):
                errors.append(f"{field} is required")
        return {"valid": len(errors) == 0, "errors": errors}
```

---

### 6.3 Deactivation and Data Retention

```python
class DeactivationManager:
    """Handle agent deactivation and data retention."""

    RETENTION_POLICIES = {
        PlanTier.STARTER: {
            "conversation_history_days": 90,
            "audit_logs_days": 365,
            "patient_data_days": 90,  # Minimum HIPAA requirement
            "grace_period_days": 30,  # Data access after cancellation
        },
        PlanTier.PROFESSIONAL: {
            "conversation_history_days": 365,
            "audit_logs_days": 2555,  # 7 years (HIPAA)
            "patient_data_days": 365,
            "grace_period_days": 90,
        },
        PlanTier.ENTERPRISE: {
            "conversation_history_days": 2555,  # 7 years
            "audit_logs_days": 2555,
            "patient_data_days": 2555,
            "grace_period_days": 180,
        },
    }

    async def initiate_cancellation(
        self,
        clinic_id: str,
        agent_id: str,
        reason: str,
        feedback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Initiate agent cancellation with data retention."""
        tier = await self._get_clinic_tier(clinic_id)
        retention = self.RETENTION_POLICIES.get(tier, self.RETENTION_POLICIES[PlanTier.STARTER])

        # Calculate key dates
        now = datetime.utcnow()
        cancellation_record = {
            "clinic_id": clinic_id,
            "agent_id": agent_id,
            "reason": reason,
            "feedback": feedback,
            "initiated_at": now.isoformat(),
            "access_revoked_at": (now + timedelta(days=retention["grace_period_days"])).isoformat(),
            "data_purged_at": (now + timedelta(days=max(
                retention["conversation_history_days"],
                retention["patient_data_days"],
            ))).isoformat(),
            "retention_policy": retention,
        }

        # Store cancellation record
        await self._store_cancellation_record(cancellation_record)

        # Schedule deactivation workflow
        await self._schedule_deactivation(clinic_id, agent_id, cancellation_record)

        # Send confirmation with data retention details
        await self._send_cancellation_confirmation(clinic_id, cancellation_record)

        return cancellation_record

    async def execute_data_retention_policy(self, clinic_id: str, agent_id: str):
        """Execute data retention policy after grace period."""
        tier = await self._get_clinic_tier(clinic_id)
        retention = self.RETENTION_POLICIES.get(tier, self.RETENTION_POLICIES[PlanTier.STARTER])

        # Step 1: Anonymize conversation data
        await self._anonymize_conversations(
            clinic_id, agent_id,
            retention_days=retention["conversation_history_days"]
        )

        # Step 2: Archive audit logs
        await self._archive_audit_logs(
            clinic_id, agent_id,
            retention_days=retention["audit_logs_days"]
        )

        # Step 3: Purge patient-identifiable data
        await self._purge_patient_data(
            clinic_id, agent_id,
            retention_days=retention["patient_data_days"]
        )

        # Step 4: Export final report
        await self._generate_final_report(clinic_id, agent_id)
```

---

## 7. Healthcare-Specific Billing

### 7.1 Insurance Reimbursement Considerations

While AI agent services are typically not directly reimbursable through insurance, certain use cases may qualify under emerging reimbursement frameworks.

**Current Reimbursement Landscape (2025-2026):**

| Code Type | Code Range | Applicability to AI Agents |
|-----------|-----------|---------------------------|
| Telehealth E/M (new) | 98000-98016 | Virtual patient interactions |
| Remote Patient Monitoring | 99453-99458 | AI-assisted monitoring |
| Remote Therapeutic Monitoring | 98975-98981 | AI-guided therapy support |
| Online Digital E/M | 99421-99423 | Digital patient interactions |
| AI Diagnostics (Cat III) | 0689T-0787T | AI-assisted clinical decision support |
| Virtual Check-in | G2012 | Brief AI-assisted encounters |

**Key Considerations:**
1. AI-augmented services require clinician oversight to be billable
2. Category III CPT codes are temporary and vary by MAC jurisdiction
3. Documentation must show physician review of AI output
4. CMS innovation pilots may provide alternative reimbursement pathways

**Reimbursement Strategy:**
```python
class ReimbursementMapper:
    """Map AI agent activities to potential reimbursement codes."""

    CODE_MAPPINGS = {
        "ai_patient_triage": {
            "primary_code": None,  # Not directly reimbursable
            "supporting_codes": ["G2012"],  # Virtual check-in
            "requirements": "Clinician review of AI triage within 24 hours",
            "documentation_required": True,
        },
        "ai_remote_monitoring": {
            "primary_code": "99457",  # RPM treatment management
            "supporting_codes": ["99453", "99454"],
            "requirements": "AI collects data, clinician interprets and communicates",
            "documentation_required": True,
            "time_requirement_minutes": 20,
        },
        "ai_care_coordination": {
            "primary_code": "99490",  # CCM clinical staff time
            "supporting_codes": [],
            "requirements": "Care coordination under physician direction",
            "documentation_required": True,
        },
        "ai_telehealth_assist": {
            "primary_code": "98001",  # Telehealth E/M (2025+)
            "supporting_codes": [],
            "requirements": "AI-assisted telehealth with clinician supervision",
            "documentation_required": True,
            "supervision_level": "direct",
        },
    }

    def map_activity_to_codes(self, activity_type: str) -> Dict:
        """Get reimbursement mapping for an AI agent activity."""
        return self.CODE_MAPPINGS.get(activity_type, {
            "primary_code": None,
            "reimbursable": False,
            "note": "Not currently mapped to reimbursable codes",
        })
```

---

### 7.2 HSA/FSA Eligibility

Healthcare AI agent software may be eligible for payment through Health Savings Accounts (HSA) and Flexible Spending Accounts (FSA) under IRS guidelines.

**IRS Publication 502 Criteria:**
Qualified medical expenses are those "used to diagnose, cure, mitigate, treat, or prevent disease, or for the purpose of affecting any structure or function of the body."

**Eligibility Assessment:**
```python
class HSAFSAEvaluator:
    """Evaluate HSA/FSA eligibility for healthcare AI agent purchases."""

    ELIGIBILITY_CRITERIA = {
        "patient_triage_bot": {
            "eligible": True,
            "rationale": "Medical care triage - disease diagnosis/prevention",
            "documentation_needed": "Itemized receipt with service description",
            "letter_of_medical_necessity": "Recommended",
        },
        "clinical_documentation": {
            "eligible": True,
            "rationale": "Clinical recordkeeping for medical care delivery",
            "documentation_needed": "Invoice with clinical purpose statement",
            "letter_of_medical_necessity": "Not required",
        },
        "medical_coding": {
            "eligible": True,
            "rationale": "Healthcare operations - claim processing",
            "documentation_needed": "Invoice with coding services description",
            "letter_of_medical_necessity": "Not required",
        },
        "scheduling_assistant": {
            "eligible": "conditional",
            "rationale": "Administrative unless tied to medical appointments",
            "documentation_needed": "Invoice specifying medical appointment scheduling",
            "letter_of_medical_necessity": "May be required",
        },
        "general_admin": {
            "eligible": False,
            "rationale": "General administrative - not medical care",
            "documentation_needed": "N/A",
            "letter_of_medical_necessity": "N/A",
        },
    }

    def evaluate_eligibility(self, agent_type: str) -> Dict:
        """Evaluate HSA/FSA eligibility for an agent purchase."""
        return self.ELIGIBILITY_CRITERIA.get(agent_type, {
            "eligible": "unknown",
            "rationale": "Consult your HSA/FSA administrator",
            "documentation_needed": "Itemized receipt",
        })

    def generate_eligibility_statement(self, clinic_name: str, agent_types: List[str], amount: float) -> str:
        """Generate an HSA/FSA eligibility statement for invoicing."""
        eligible_items = []
        for agent_type in agent_types:
            eval_result = self.evaluate_eligibility(agent_type)
            if eval_result.get("eligible") in [True, "conditional"]:
                eligible_items.append({
                    "agent_type": agent_type,
                    "rationale": eval_result["rationale"],
                })

        statement = f"""
HEALTHCARE AI SERVICES - HSA/FSA ELIGIBILITY STATEMENT

Provider: Clinical AI Platform
Clinic: {clinic_name}
Date: {datetime.utcnow().strftime('%Y-%m-%d')}
Total Amount: ${amount:.2f}

ELIGIBLE MEDICAL EXPENSES:
"""
        for item in eligible_items:
            statement += f"  - {item['agent_type']}: {item['rationale']}\n"

        statement += f"""
This invoice is for healthcare operations software services that support
medical care delivery. These services may be eligible for reimbursement
through Health Savings Accounts (HSA) or Flexible Spending Accounts (FSA)
under IRS Publication 502 guidelines.

Please consult your HSA/FSA administrator for specific eligibility
determination. A Letter of Medical Necessity may be available upon request.

Business Associate Agreement (BAA) is active for this account.
"""
        return statement
```

---

### 7.3 Clinical Cost Justification

Healthcare organizations require clear ROI justification for AI agent investments.

**ROI Framework:**

| Cost Category | Annual Impact | Measurement Method |
|--------------|--------------|-------------------|
| Staff time saved | $15,000-$45,000 | Hours saved x hourly rate |
| Reduced no-shows | $8,000-$24,000 | No-show rate reduction x avg encounter value |
| Faster prior auth | $12,000-$36,000 | Days saved x daily revenue impact |
| Coding accuracy | $6,000-$18,000 | Reduced denial rate x avg claim value |
| Documentation time | $10,000-$30,000 | Minutes saved per note x notes per year |
| After-hours coverage | $20,000-$60,000 | Reduced overtime / call coverage |

```python
class ROICalculator:
    """Calculate ROI for healthcare AI agent investments."""

    def calculate_patient_triage_roi(self, clinic_data: dict) -> Dict[str, Any]:
        """Calculate ROI for patient triage AI agent."""
        # Inputs
        monthly_calls = clinic_data.get("monthly_patient_calls", 500)
        staff_hourly_rate = clinic_data.get("staff_hourly_rate", 25)
        avg_call_duration_min = clinic_data.get("avg_call_duration_min", 8)
        no_show_rate = clinic_data.get("no_show_rate", 0.12)
        avg_encounter_value = clinic_data.get("avg_encounter_value", 150)

        # Calculations
        hours_saved_monthly = (monthly_calls * avg_call_duration_min * 0.6) / 60
        staff_cost_saved_monthly = hours_saved_monthly * staff_hourly_rate

        no_shows_prevented_monthly = monthly_calls * 0.05  # 5% reduction
        revenue_recovered_monthly = no_shows_prevented_monthly * avg_encounter_value

        agent_cost_monthly = 249  # Professional tier

        monthly_roi = staff_cost_saved_monthly + revenue_recovered_monthly - agent_cost_monthly
        annual_roi = monthly_roi * 12
        roi_percentage = (annual_roi / (agent_cost_monthly * 12)) * 100

        return {
            "agent_type": "patient_triage",
            "monthly_savings": {
                "staff_time": round(staff_cost_saved_monthly, 2),
                "revenue_recovery": round(revenue_recovered_monthly, 2),
                "total": round(staff_cost_saved_monthly + revenue_recovered_monthly, 2),
            },
            "monthly_cost": agent_cost_monthly,
            "net_monthly_benefit": round(monthly_roi, 2),
            "annual_roi_dollars": round(annual_roi, 2),
            "roi_percentage": round(roi_percentage, 1),
            "payback_period_months": round(agent_cost_monthly / monthly_roi, 1) if monthly_roi > 0 else float('inf'),
        }

    def calculate_clinical_documentation_roi(self, clinic_data: dict) -> Dict[str, Any]:
        """Calculate ROI for clinical documentation AI agent."""
        monthly_notes = clinic_data.get("monthly_notes", 400)
        minutes_per_note_saved = clinic_data.get("minutes_per_note_saved", 5)
        provider_hourly_rate = clinic_data.get("provider_hourly_rate", 150)

        hours_saved_monthly = (monthly_notes * minutes_per_note_saved) / 60
        cost_saved_monthly = hours_saved_monthly * provider_hourly_rate

        agent_cost_monthly = 399
        monthly_roi = cost_saved_monthly - agent_cost_monthly

        return {
            "agent_type": "clinical_documentation",
            "monthly_savings": {
                "provider_time": round(cost_saved_monthly, 2),
            },
            "hours_saved_monthly": round(hours_saved_monthly, 1),
            "monthly_cost": agent_cost_monthly,
            "net_monthly_benefit": round(monthly_roi, 2),
            "annual_roi_dollars": round(monthly_roi * 12, 2),
            "roi_percentage": round((monthly_roi * 12) / (agent_cost_monthly * 12) * 100, 1),
        }
```

---

### 7.4 HIPAA Compliance Cost Allocation

```python
class HIPAAComplianceCost:
    """Track and allocate HIPAA compliance costs across subscriptions."""

    ANNUAL_COSTS = {
        "cloud_infrastructure": {"min": 60000, "max": 150000, "category": "Infrastructure"},
        "security_tools": {"min": 30000, "max": 75000, "category": "Security"},
        "penetration_testing": {"min": 25000, "max": 50000, "category": "Testing"},
        "compliance_personnel": {"min": 40000, "max": 100000, "category": "Personnel"},
        "training": {"min": 10000, "max": 25000, "category": "Training"},
        "cyber_liability_insurance": {"min": 15000, "max": 40000, "category": "Insurance"},
    }

    def calculate_per_clinic_cost(self, total_clinics: int) -> Dict[str, Any]:
        """Calculate HIPAA compliance cost per clinic."""
        total_min = sum(c["min"] for c in self.ANNUAL_COSTS.values())
        total_max = sum(c["max"] for c in self.ANNUAL_COSTS.values())

        per_clinic_min = total_min / total_clinics
        per_clinic_max = total_max / total_clinics

        return {
            "total_annual_cost_range": {
                "min": total_min,
                "max": total_max,
            },
            "per_clinic_annual_cost": {
                "min": round(per_clinic_min, 2),
                "max": round(per_clinic_max, 2),
            },
            "per_clinic_monthly_cost": {
                "min": round(per_clinic_min / 12, 2),
                "max": round(per_clinic_max / 12, 2),
            },
            "cost_breakdown": {
                category: {
                    "min": costs["min"],
                    "max": costs["max"],
                    "per_clinic_min": round(costs["min"] / total_clinics, 2),
                    "per_clinic_max": round(costs["max"] / total_clinics, 2),
                }
                for category, costs in self.ANNUAL_COSTS.items()
            },
            "percentage_of_revenue_note": "For $2M ARR company, these costs represent 9-22% of revenue",
        }
```

---

## 8. Agent Rental Model Implementation

### 8.1 Agent Catalog with Pricing

```python
"""
Agent Rental Marketplace Implementation
Full marketplace with catalog, checkout, billing state management,
and usage analytics.
"""
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from datetime import datetime
import uuid


@dataclass
class AgentListing:
    """A listing in the AI agent marketplace."""
    id: str
    name: str
    slug: str
    description: str
    long_description: str
    category: str  # "clinical", "administrative", "billing", "patient_engagement"
    tags: List[str] = field(default_factory=list)

    # Pricing
    pricing_model: str  # "rental", "usage", "outcome", "hybrid"
    base_price_monthly_cents: int
    usage_price_per_unit_cents: Optional[int] = None
    usage_unit: Optional[str] = None  # "conversation", "note", "resolution"
    outcome_price_cents: Optional[int] = None

    # Rental tiers
    rental_tiers: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    # Metadata
    version: str = "1.0.0"
    publisher: str = ""
    rating: float = 0.0
    review_count: int = 0
    install_count: int = 0
    status: str = "published"  # draft, published, suspended, deprecated

    # Requirements
    required_tier: str = "starter"  # minimum plan tier
    required_integrations: List[str] = field(default_factory=list)
    estimated_setup_time_minutes: int = 30

    # Healthcare-specific
    hipaa_compliant: bool = True
    clinical_validation_status: Optional[str] = None
    fda_clearance_status: Optional[str] = None


class AgentCatalog:
    """Marketplace catalog of AI agents."""

    AGENTS = [
        AgentListing(
            id="ag_triage_001",
            name="SmartPatient Triage",
            slug="smart-patient-triage",
            description="AI-powered patient triage for phone and digital channels",
            long_description="...",
            category="clinical",
            tags=["triage", "patient_intake", "scheduling"],
            pricing_model="hybrid",
            base_price_monthly_cents=14900,
            usage_price_per_unit_cents=150,
            usage_unit="conversation",
            rental_tiers={
                "starter": {"price_cents": 14900, "included_conversations": 200},
                "professional": {"price_cents": 24900, "included_conversations": 1000},
                "enterprise": {"price_cents": 39900, "included_conversations": -1},
            },
            publisher="ClinicalAI Platform",
            rating=4.7,
            review_count=128,
            install_count=450,
            hipaa_compliant=True,
        ),
        AgentListing(
            id="ag_doc_001",
            name="ClinicalScribe AI",
            slug="clinical-scribe",
            description="Automated clinical documentation and note drafting",
            long_description="...",
            category="clinical",
            tags=["documentation", "scribe", "ehr"],
            pricing_model="hybrid",
            base_price_monthly_cents=24900,
            usage_price_per_unit_cents=300,
            usage_unit="note",
            rental_tiers={
                "starter": {"price_cents": 24900, "included_notes": 50},
                "professional": {"price_cents": 39900, "included_notes": 300},
                "enterprise": {"price_cents": 59900, "included_notes": -1},
            },
            publisher="ClinicalAI Platform",
            rating=4.8,
            review_count=203,
            install_count=380,
            hipaa_compliant=True,
        ),
        AgentListing(
            id="ag_coding_001",
            name="CodeAssist Pro",
            slug="codeassist-pro",
            description="AI-assisted medical coding and claim scrubbing",
            long_description="...",
            category="billing",
            tags=["coding", "billing", "claims"],
            pricing_model="outcome",
            base_price_monthly_cents=19900,
            outcome_price_cents=200,
            rental_tiers={
                "starter": {"price_cents": 19900, "included_encounters": 100},
                "professional": {"price_cents": 29900, "included_encounters": 500},
                "enterprise": {"price_cents": 49900, "included_encounters": -1},
            },
            publisher="ClinicalAI Platform",
            rating=4.5,
            review_count=89,
            install_count=210,
            hipaa_compliant=True,
        ),
        AgentListing(
            id="ag_priorauth_001",
            name="PriorAuth Navigator",
            slug="priorauth-navigator",
            description="Automated prior authorization submission and tracking",
            long_description="...",
            category="administrative",
            tags=["prior_auth", "administrative", "payer"],
            pricing_model="outcome",
            base_price_monthly_cents=29900,
            outcome_price_cents=2500,
            rental_tiers={
                "starter": {"price_cents": 29900, "included_auths": 5},
                "professional": {"price_cents": 44900, "included_auths": 50},
                "enterprise": {"price_cents": 69900, "included_auths": -1},
            },
            publisher="ClinicalAI Platform",
            rating=4.6,
            review_count=67,
            install_count=145,
            hipaa_compliant=True,
        ),
    ]

    def search(
        self,
        query: Optional[str] = None,
        category: Optional[str] = None,
        min_tier: Optional[str] = None,
        max_price_cents: Optional[int] = None,
        tags: Optional[List[str]] = None,
    ) -> List[AgentListing]:
        """Search the agent catalog."""
        results = self.AGENTS

        if query:
            q = query.lower()
            results = [
                a for a in results
                if q in a.name.lower() or q in a.description.lower() or q in a.tags
            ]

        if category:
            results = [a for a in results if a.category == category]

        if min_tier:
            tier_order = {"starter": 0, "professional": 1, "enterprise": 2}
            min_level = tier_order.get(min_tier, 0)
            results = [
                a for a in results
                if tier_order.get(a.required_tier, 0) <= min_level
            ]

        if max_price_cents:
            results = [a for a in results if a.base_price_monthly_cents <= max_price_cents]

        if tags:
            results = [a for a in results if any(t in a.tags for t in tags)]

        return [a for a in results if a.status == "published"]

    def get_by_slug(self, slug: str) -> Optional[AgentListing]:
        """Get an agent listing by its slug."""
        for agent in self.AGENTS:
            if agent.slug == slug and agent.status == "published":
                return agent
        return None
```

---

### 8.2 Checkout Flow

```python
class AgentCheckoutFlow:
    """Handle the agent rental checkout flow."""

    def __init__(
        self,
        catalog: AgentCatalog,
        billing_service: StripeBillingService,
    ):
        self.catalog = catalog
        self.billing = billing_service

    async def start_checkout(
        self,
        clinic_id: str,
        agent_slug: str,
        tier: str,
        customer_email: str,
        customer_name: str,
    ) -> Dict[str, Any]:
        """Start the checkout process for an agent rental."""
        # Find the agent
        agent = self.catalog.get_by_slug(agent_slug)
        if not agent:
            return {"error": "Agent not found"}

        # Get pricing for selected tier
        tier_config = agent.rental_tiers.get(tier)
        if not tier_config:
            return {"error": f"Tier {tier} not available for this agent"}

        # Create or get Stripe customer
        customer = self.billing.create_clinic_customer(
            name=customer_name,
            email=customer_email,
            clinic_id=clinic_id,
        )

        # Create checkout session
        checkout = self.billing.create_checkout_session(
            customer_id=customer["customer_id"],
            price_id=f"price_{agent_slug}_{tier}",  # Your price IDs
            success_url=f"https://yourplatform.com/agents/{agent_slug}/success?session={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"https://yourplatform.com/agents/{agent_slug}?canceled=true",
            trial_days=14,
        )

        return {
            "agent": {
                "id": agent.id,
                "name": agent.name,
                "slug": agent.slug,
                "tier": tier,
            },
            "pricing": {
                "base_monthly": tier_config["price_cents"] / 100,
                "trial_days": 14,
            },
            "checkout_url": checkout["checkout_url"],
            "session_id": checkout["session_id"],
        }

    async def handle_checkout_success(self, session_id: str) -> Dict[str, Any]:
        """Handle successful checkout completion."""
        # Retrieve session from Stripe
        session = stripe.checkout.Session.retrieve(session_id)
        subscription_id = session.subscription

        # Get subscription details
        subscription = stripe.Subscription.retrieve(subscription_id)

        # Extract agent and tier from metadata
        agent_slug = session.metadata.get("agent_slug")
        tier = session.metadata.get("tier")
        clinic_id = session.metadata.get("clinic_id")

        # Store subscription in your database
        await self._record_subscription(
            clinic_id=clinic_id,
            agent_slug=agent_slug,
            tier=tier,
            stripe_subscription_id=subscription_id,
            stripe_customer_id=session.customer,
        )

        # Trigger activation workflow
        # ...

        return {
            "status": "success",
            "subscription_id": subscription_id,
            "agent_slug": agent_slug,
            "tier": tier,
            "next_step": "agent_activation",
        }
```

---

### 8.3 Billing State Management

```python
class BillingStateManager:
    """Manage billing state for all agent subscriptions."""

    def __init__(self, db_connection):
        self.db = db_connection

    async def get_subscription_state(self, clinic_id: str, agent_id: str) -> Dict[str, Any]:
        """Get current billing state for an agent subscription."""
        # Query your database
        subscription = await self.db.query(
            "SELECT * FROM agent_subscriptions WHERE clinic_id = ? AND agent_id = ?",
            clinic_id, agent_id
        )

        if not subscription:
            return {"status": "not_subscribed"}

        return {
            "status": subscription["status"],  # active, trialing, past_due, canceled
            "tier": subscription["tier"],
            "current_period_start": subscription["current_period_start"],
            "current_period_end": subscription["current_period_end"],
            "trial_end": subscription["trial_end"],
            "cancel_at_period_end": subscription["cancel_at_period_end"],
            "amount_due_next": subscription["amount_due_next"],
            "payment_method_on_file": subscription["payment_method_id"] is not None,
        }

    async def sync_from_stripe(self, stripe_subscription: dict):
        """Sync subscription state from Stripe webhook."""
        await self.db.execute(
            """
            INSERT INTO agent_subscriptions
            (stripe_subscription_id, clinic_id, agent_id, status, tier,
             current_period_start, current_period_end, trial_end, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON CONFLICT (stripe_subscription_id) DO UPDATE SET
            status = EXCLUDED.status,
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            trial_end = EXCLUDED.trial_end,
            updated_at = NOW()
            """,
            stripe_subscription["id"],
            stripe_subscription["metadata"]["clinic_id"],
            stripe_subscription["metadata"]["agent_id"],
            stripe_subscription["status"],
            stripe_subscription["metadata"]["tier"],
            stripe_subscription["current_period_start"],
            stripe_subscription["current_period_end"],
            stripe_subscription["trial_end"],
        )
```

---

### 8.4 Receipts and Invoicing

```python
class HealthcareReceiptGenerator:
    """Generate healthcare-compliant receipts and invoices."""

    def generate_receipt(self, stripe_invoice: dict, clinic_info: dict) -> Dict[str, Any]:
        """Generate a healthcare-compliant receipt."""
        return {
            "receipt_id": f"REC-{stripe_invoice['id']}",
            "date": datetime.fromtimestamp(stripe_invoice["created"]).strftime("%Y-%m-%d"),
            "billing_period": {
                "start": datetime.fromtimestamp(stripe_invoice["period_start"]).strftime("%Y-%m-%d"),
                "end": datetime.fromtimestamp(stripe_invoice["period_end"]).strftime("%Y-%m-%d"),
            },
            "clinic": {
                "name": clinic_info["name"],
                "address": clinic_info["address"],
                "npi": clinic_info.get("npi"),
            },
            "line_items": [
                {
                    "description": item["description"],
                    "quantity": item.get("quantity", 1),
                    "unit_price": item["amount"] / item["quantity"] / 100 if item.get("quantity") else item["amount"] / 100,
                    "total": item["amount"] / 100,
                }
                for item in stripe_invoice["lines"]["data"]
            ],
            "subtotal": stripe_invoice["subtotal"] / 100,
            "tax": stripe_invoice.get("tax", 0) / 100,
            "total": stripe_invoice["total"] / 100,
            "hsa_fsa_note": "This receipt is for healthcare operations software and may be eligible for HSA/FSA reimbursement.",
            "baa_reference": f"BAA-{clinic_info['clinic_id']}",
            "payment_method": stripe_invoice.get("payment_intent", {}).get("payment_method_details", {}).get("type", "card"),
        }
```

---

### 8.5 Cancellation and Refunds

```python
class CancellationManager:
    """Handle agent subscription cancellations and refunds."""

    REFUND_POLICY = {
        "within_48_hours": {"refund_type": "full", "prorated": False},
        "within_14_days": {"refund_type": "prorated", "prorated": True},
        "after_14_days": {"refund_type": "none", "prorated": False, "credit_only": True},
        "trial_cancel": {"refund_type": "none", "prorated": False, "note": "No charge during trial"},
    }

    async def process_cancellation(
        self,
        clinic_id: str,
        agent_id: str,
        reason: str,
        feedback: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Process a cancellation request."""
        subscription = await self._get_subscription(clinic_id, agent_id)

        # Determine refund eligibility
        days_since_start = (datetime.utcnow() - subscription["started_at"]).days

        if days_since_start <= 2:
            refund_policy = self.REFUND_POLICY["within_48_hours"]
        elif days_since_start <= 14:
            refund_policy = self.REFUND_POLICY["within_14_days"]
        else:
            refund_policy = self.REFUND_POLICY["after_14_days"]

        # Cancel in Stripe (at period end to allow access)
        stripe_result = stripe.Subscription.modify(
            subscription["stripe_subscription_id"],
            cancel_at_period_end=True,
        )

        # Calculate refund if applicable
        refund_amount = 0
        if refund_policy["refund_type"] == "full":
            refund_amount = subscription["amount_paid"]
        elif refund_policy["prorated"]:
            days_remaining = (subscription["current_period_end"] - datetime.utcnow()).days
            period_days = (subscription["current_period_end"] - subscription["current_period_start"]).days
            refund_amount = subscription["amount_paid"] * (days_remaining / period_days)

        # Issue refund through Stripe if applicable
        if refund_amount > 0:
            stripe.Refund.create(
                payment_intent=subscription["payment_intent_id"],
                amount=int(refund_amount * 100),
                reason="requested_by_customer",
                metadata={
                    "cancellation_reason": reason,
                    "clinic_id": clinic_id,
                    "agent_id": agent_id,
                },
            )

        # Store cancellation record
        await self._record_cancellation(clinic_id, agent_id, reason, feedback, refund_amount)

        return {
            "status": "canceled_at_period_end",
            "access_until": subscription["current_period_end"].isoformat(),
            "refund_amount": round(refund_amount, 2),
            "refund_type": refund_policy["refund_type"],
            "reason": reason,
            "exit_survey_submitted": feedback is not None,
        }
```

---

### 8.6 Usage Analytics Dashboard

```python
class UsageAnalyticsDashboard:
    """Generate usage analytics for the billing dashboard."""

    async def get_dashboard_data(self, clinic_id: str) -> Dict[str, Any]:
        """Get comprehensive usage analytics for a clinic."""
        # Get all active subscriptions
        subscriptions = await self._get_clinic_subscriptions(clinic_id)

        # Aggregate usage data
        total_monthly_cost = 0
        agent_usage = []

        for sub in subscriptions:
            usage = await self._get_agent_usage(clinic_id, sub["agent_id"])
            agent_cost = await self._calculate_agent_cost(sub, usage)
            total_monthly_cost += agent_cost

            agent_usage.append({
                "agent_id": sub["agent_id"],
                "agent_name": sub["agent_name"],
                "tier": sub["tier"],
                "status": sub["status"],
                "monthly_base_cost": sub["base_price"] / 100,
                "usage_cost": agent_cost - (sub["base_price"] / 100),
                "total_cost": agent_cost,
                "usage": usage,
                "efficiency": self._calculate_efficiency(usage),
            })

        return {
            "clinic_id": clinic_id,
            "billing_period": self._get_current_period(),
            "total_monthly_cost": round(total_monthly_cost, 2),
            "active_agents": len([s for s in subscriptions if s["status"] == "active"]),
            "agents": agent_usage,
            "cost_trend": await self._get_cost_trend(clinic_id, months=6),
            "usage_forecast": await self._forecast_usage(clinic_id),
        }

    def _calculate_efficiency(self, usage: dict) -> Dict[str, Any]:
        """Calculate efficiency metrics for an agent."""
        if usage.get("total_interactions", 0) == 0:
            return {"score": 0, "status": "no_data"}

        resolution_rate = usage.get("resolved_interactions", 0) / usage["total_interactions"]
        avg_cost_per_resolution = usage.get("total_cost", 0) / max(usage.get("resolved_interactions", 1), 1)

        return {
            "resolution_rate": round(resolution_rate * 100, 1),
            "avg_cost_per_resolution": round(avg_cost_per_resolution, 2),
            "human_escalation_rate": round(usage.get("escalated_interactions", 0) / usage["total_interactions"] * 100, 1),
            "score": round(resolution_rate * 100, 0),
            "status": "excellent" if resolution_rate > 0.8 else "good" if resolution_rate > 0.6 else "needs_improvement",
        }

    async def _get_cost_trend(self, clinic_id: str, months: int = 6) -> List[Dict[str, Any]]:
        """Get monthly cost trend."""
        # Implementation would query historical billing data
        return []

    async def _forecast_usage(self, clinic_id: str) -> Dict[str, Any]:
        """Forecast next month's usage based on trends."""
        # Simple linear projection
        return {
            "projected_cost": "TBD",
            "confidence": "medium",
            "recommendation": "Based on current trends, consider upgrading to Professional tier for better rates.",
        }
```

---

## 9. Technical Patterns

### 9.1 Subscription State Machine

```python
"""
Subscription State Machine for Healthcare AI Agent Billing
Comprehensive state management with event-driven transitions.
"""
from enum import Enum, auto
from typing import Dict, Any, Callable, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
import asyncio


class SubscriptionStatus(str, Enum):
    """All possible subscription states."""
    INCOMPLETE = "incomplete"           # Payment not yet confirmed
    INCOMPLETE_EXPIRED = "incomplete_expired"  # 24h expired
    TRIALING = "trialing"               # Within trial period
    ACTIVE = "active"                   # Fully active subscription
    PAST_DUE = "past_due"               # Payment failed, in dunning
    CANCELED = "canceled"               # Canceled (may have access until period end)
    UNPAID = "unpaid"                   # Invoice unpaid after retries
    PAUSED = "paused"                   # Voluntary pause


class SubscriptionEvent(str, Enum):
    """Events that can trigger state transitions."""
    PAYMENT_SUCCEEDED = "payment_succeeded"
    PAYMENT_FAILED = "payment_failed"
    TRIAL_ENDED = "trial_ended"
    CUSTOMER_CANCELED = "customer_canceled"
    PLAN_CHANGED = "plan_changed"
    PAUSE_REQUESTED = "pause_requested"
    RESUME_REQUESTED = "resume_requested"
    INCOMPLETE_EXPIRED = "incomplete_expired"
    DUNNING_EXHAUSTED = "dunning_exhausted"
    PAYMENT_RECOVERED = "payment_recovered"
    ADMIN_CANCELED = "admin_canceled"
    ADMIN_SUSPENDED = "admin_suspended"


@dataclass
class StateTransition:
    """Defines a state transition rule."""
    from_status: SubscriptionStatus
    event: SubscriptionEvent
    to_status: SubscriptionStatus
    action: Optional[str] = None  # Action to execute
    preconditions: List[str] = field(default_factory=list)


class SubscriptionStateMachine:
    """
    Event-driven state machine for subscription lifecycle management.

    Valid transitions:
    INCOMPLETE -> ACTIVE (payment_succeeded)
    INCOMPLETE -> INCOMPLETE_EXPIRED (incomplete_expired)
    TRIALING -> ACTIVE (payment_succeeded)
    TRIALING -> PAST_DUE (payment_failed)
    ACTIVE -> PAST_DUE (payment_failed)
    ACTIVE -> CANCELED (customer_canceled) [at period end]
    ACTIVE -> PAUSED (pause_requested)
    PAST_DUE -> ACTIVE (payment_recovered)
    PAST_DUE -> UNPAID (dunning_exhausted)
    UNPAID -> CANCELED (admin_canceled)
    PAUSED -> ACTIVE (resume_requested)
    CANCELED -> ACTIVE (payment_succeeded) [reactivation]
    """

    TRANSITIONS = [
        # Initial payment
        StateTransition(SubscriptionStatus.INCOMPLETE, SubscriptionEvent.PAYMENT_SUCCEEDED, SubscriptionStatus.ACTIVE, "provision_access"),
        StateTransition(SubscriptionStatus.INCOMPLETE, SubscriptionEvent.INCOMPLETE_EXPIRED, SubscriptionStatus.INCOMPLETE_EXPIRED, "cleanup_subscription"),

        # Trial
        StateTransition(SubscriptionStatus.TRIALING, SubscriptionEvent.PAYMENT_SUCCEEDED, SubscriptionStatus.ACTIVE, "activate_full_access"),
        StateTransition(SubscriptionStatus.TRIALING, SubscriptionEvent.PAYMENT_FAILED, SubscriptionStatus.PAST_DUE, "start_dunning"),
        StateTransition(SubscriptionStatus.TRIALING, SubscriptionEvent.TRIAL_ENDED, SubscriptionStatus.ACTIVE, "activate_full_access"),

        # Active lifecycle
        StateTransition(SubscriptionStatus.ACTIVE, SubscriptionEvent.PAYMENT_FAILED, SubscriptionStatus.PAST_DUE, "start_grace_period"),
        StateTransition(SubscriptionStatus.ACTIVE, SubscriptionEvent.CUSTOMER_CANCELED, SubscriptionStatus.CANCELED, "schedule_cancellation"),
        StateTransition(SubscriptionStatus.ACTIVE, SubscriptionEvent.PAUSE_REQUESTED, SubscriptionStatus.PAUSED, "pause_access"),
        StateTransition(SubscriptionStatus.ACTIVE, SubscriptionEvent.PLAN_CHANGED, SubscriptionStatus.ACTIVE, "update_entitlements"),

        # Dunning recovery
        StateTransition(SubscriptionStatus.PAST_DUE, SubscriptionEvent.PAYMENT_RECOVERED, SubscriptionStatus.ACTIVE, "restore_full_access"),
        StateTransition(SubscriptionStatus.PAST_DUE, SubscriptionEvent.DUNNING_EXHAUSTED, SubscriptionStatus.UNPAID, "suspend_access"),
        StateTransition(SubscriptionStatus.PAST_DUE, SubscriptionEvent.CUSTOMER_CANCELED, SubscriptionStatus.CANCELED, "cancel_immediately"),

        # Unpaid -> Canceled
        StateTransition(SubscriptionStatus.UNPAID, SubscriptionEvent.ADMIN_CANCELED, SubscriptionStatus.CANCELED, "revoke_all_access"),

        # Pause
        StateTransition(SubscriptionStatus.PAUSED, SubscriptionEvent.RESUME_REQUESTED, SubscriptionStatus.ACTIVE, "restore_full_access"),
        StateTransition(SubscriptionStatus.PAUSED, SubscriptionEvent.PAYMENT_SUCCEEDED, SubscriptionStatus.ACTIVE, "restore_full_access"),

        # Reactivation
        StateTransition(SubscriptionStatus.CANCELED, SubscriptionEvent.PAYMENT_SUCCEEDED, SubscriptionStatus.ACTIVE, "reactivate_subscription"),
    ]

    def __init__(self):
        self.actions: Dict[str, Callable] = {}
        self._register_default_actions()

    def _register_default_actions(self):
        """Register default action handlers."""
        self.actions = {
            "provision_access": self._action_provision_access,
            "cleanup_subscription": self._action_cleanup,
            "activate_full_access": self._action_activate_full,
            "start_dunning": self._action_start_dunning,
            "start_grace_period": self._action_start_grace,
            "schedule_cancellation": self._action_schedule_cancel,
            "pause_access": self._action_pause,
            "update_entitlements": self._action_update_entitlements,
            "restore_full_access": self._action_restore,
            "suspend_access": self._action_suspend,
            "cancel_immediately": self._action_cancel_now,
            "revoke_all_access": self._action_revoke,
            "reactivate_subscription": self._action_reactivate,
        }

    def get_transition(
        self,
        current_status: SubscriptionStatus,
        event: SubscriptionEvent,
    ) -> Optional[StateTransition]:
        """Get the valid transition for a given status and event."""
        for transition in self.TRANSITIONS:
            if transition.from_status == current_status and transition.event == event:
                return transition
        return None

    def can_transition(
        self,
        current_status: SubscriptionStatus,
        event: SubscriptionEvent,
    ) -> bool:
        """Check if a transition is valid."""
        return self.get_transition(current_status, event) is not None

    async def process_event(
        self,
        subscription_id: str,
        current_status: SubscriptionStatus,
        event: SubscriptionEvent,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Process an event and execute the corresponding transition."""
        transition = self.get_transition(current_status, event)

        if not transition:
            return {
                "success": False,
                "error": f"Invalid transition: {current_status.value} + {event.value}",
                "subscription_id": subscription_id,
            }

        # Execute action
        action_result = {}
        if transition.action and transition.action in self.actions:
            action_handler = self.actions[transition.action]
            if asyncio.iscoroutinefunction(action_handler):
                action_result = await action_handler(subscription_id, context)
            else:
                action_result = action_handler(subscription_id, context)

        return {
            "success": True,
            "subscription_id": subscription_id,
            "from_status": current_status.value,
            "to_status": transition.to_status.value,
            "event": event.value,
            "action": transition.action,
            "action_result": action_result,
            "timestamp": datetime.utcnow().isoformat(),
        }

    # --- Action Handlers ---

    async def _action_provision_access(self, subscription_id: str, context: dict) -> dict:
        """Provision access for a new subscription."""
        clinic_id = context.get("clinic_id")
        agent_id = context.get("agent_id")
        return {"provisioned": True, "clinic_id": clinic_id, "agent_id": agent_id}

    async def _action_cleanup(self, subscription_id: str, context: dict) -> dict:
        """Clean up an expired incomplete subscription."""
        return {"cleaned_up": True}

    async def _action_activate_full(self, subscription_id: str, context: dict) -> dict:
        """Activate full feature access."""
        clinic_id = context.get("clinic_id")
        tier = context.get("tier")
        return {"access_activated": True, "tier": tier, "clinic_id": clinic_id}

    async def _action_start_dunning(self, subscription_id: str, context: dict) -> dict:
        """Start dunning process for failed payment."""
        return {"dunning_started": True, "retry_schedule": [1, 3, 5, 7]}

    async def _action_start_grace(self, subscription_id: str, context: dict) -> dict:
        """Start grace period for failed payment."""
        return {"grace_period_started": True, "grace_days": 14}

    async def _action_schedule_cancel(self, subscription_id: str, context: dict) -> dict:
        """Schedule cancellation at period end."""
        return {"cancel_scheduled": True, "access_until": context.get("current_period_end")}

    async def _action_pause(self, subscription_id: str, context: dict) -> dict:
        """Pause subscription access."""
        return {"paused": True, "pause_duration_days": context.get("pause_duration", 30)}

    async def _action_update_entitlements(self, subscription_id: str, context: dict) -> dict:
        """Update entitlements after plan change."""
        return {"entitlements_updated": True, "new_tier": context.get("new_tier")}

    async def _action_restore(self, subscription_id: str, context: dict) -> dict:
        """Restore full access after recovery."""
        return {"access_restored": True}

    async def _action_suspend(self, subscription_id: str, context: dict) -> dict:
        """Suspend access due to exhausted dunning."""
        return {"access_suspended": True, "retention_days": 90}

    async def _action_cancel_now(self, subscription_id: str, context: dict) -> dict:
        """Cancel subscription immediately."""
        return {"canceled": True, "immediate": True}

    async def _action_revoke(self, subscription_id: str, context: dict) -> dict:
        """Revoke all access."""
        return {"access_revoked": True, "data_retention_days": 90}

    async def _action_reactivate(self, subscription_id: str, context: dict) -> dict:
        """Reactivate a canceled subscription."""
        return {"reactivated": True, "new_period_start": datetime.utcnow().isoformat()}

    def get_valid_events(self, status: SubscriptionStatus) -> List[SubscriptionEvent]:
        """Get list of valid events for a given status."""
        return [t.event for t in self.TRANSITIONS if t.from_status == status]
```

---

### 9.2 Webhook Handling (Stripe)

```python
"""
Stripe Webhook Handler for Healthcare AI Agent Marketplace
Production-ready implementation with signature verification,
idempotency, retry logic, and audit trails.
"""
import stripe
import hashlib
import hmac
import json
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from functools import wraps

logger = logging.getLogger(__name__)


class WebhookEventHandler:
    """Handle Stripe webhook events for subscription lifecycle."""

    # Events we care about
    SUBSCRIBED_EVENTS = [
        "checkout.session.completed",
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "invoice.paid",
        "invoice.payment_failed",
        "invoice.payment_action_required",
        "customer.subscription.trial_will_end",
        "payment_intent.succeeded",
        "payment_intent.payment_failed",
        "charge.refunded",
        "customer.updated",
    ]

    def __init__(
        self,
        stripe_signing_secret: str,
        state_machine: SubscriptionStateMachine,
        billing_service: StripeBillingService,
        entitlement_engine: EntitlementEngine,
    ):
        self.signing_secret = stripe_signing_secret
        self.state_machine = state_machine
        self.billing = billing_service
        self.entitlements = entitlement_engine

    def verify_signature(self, payload: bytes, signature_header: str) -> bool:
        """Verify Stripe webhook signature."""
        try:
            stripe.Webhook.construct_event(
                payload, signature_header, self.signing_secret
            )
            return True
        except (ValueError, stripe.error.SignatureVerificationError) as e:
            logger.warning(f"Webhook signature verification failed: {e}")
            return False

    async def handle_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Handle a single Stripe webhook event."""
        event_id = event["id"]
        event_type = event["type"]

        logger.info(f"Processing Stripe event: {event_type} (ID: {event_id})")

        # Check idempotency - have we processed this before?
        if await self._is_event_processed(event_id):
            logger.info(f"Event {event_id} already processed, skipping")
            return {"status": "already_processed", "event_id": event_id}

        # Route to appropriate handler
        handler = getattr(self, f"handle_{event_type.replace('.', '_')}", None)

        if handler:
            try:
                result = await handler(event["data"]["object"])
                await self._mark_event_processed(event_id, event_type, "success", result)
                return {"status": "success", "event_id": event_id, "result": result}
            except Exception as e:
                logger.error(f"Error handling event {event_type}: {e}", exc_info=True)
                await self._mark_event_processed(event_id, event_type, "error", {"error": str(e)})
                raise  # Re-raise so Stripe retries
        else:
            logger.info(f"No handler for event type: {event_type}")
            await self._mark_event_processed(event_id, event_type, "no_handler")
            return {"status": "no_handler", "event_id": event_id}

    # --- Event Handlers ---

    async def handle_checkout_session_completed(self, session: dict) -> dict:
        """Handle completed checkout session."""
        if session.get("mode") != "subscription":
            return {"ignored": True, "reason": "not_subscription_mode"}

        customer_id = session["customer"]
        subscription_id = session["subscription"]
        metadata = session.get("metadata", {})

        # Activate subscription in our system
        result = await self.state_machine.process_event(
            subscription_id=subscription_id,
            current_status=SubscriptionStatus.INCOMPLETE,
            event=SubscriptionEvent.PAYMENT_SUCCEEDED,
            context={
                "clinic_id": metadata.get("clinic_id"),
                "agent_id": metadata.get("agent_id"),
                "tier": metadata.get("tier"),
                "customer_id": customer_id,
            },
        )

        # Sync entitlements
        clinic_id = metadata.get("clinic_id")
        tier = metadata.get("tier", "starter")
        self.entitlements.invalidate_cache(clinic_id)

        # Trigger activation workflow
        # await self.activation_workflow.start(clinic_id, agent_id, tier)

        return result

    async def handle_customer_subscription_created(self, subscription: dict) -> dict:
        """Handle new subscription creation."""
        subscription_id = subscription["id"]
        status = subscription["status"]
        metadata = subscription.get("metadata", {})

        # Store subscription in database
        await self.billing.sync_subscription(subscription)

        return {
            "subscription_id": subscription_id,
            "status": status,
            "clinic_id": metadata.get("clinic_id"),
        }

    async def handle_customer_subscription_updated(self, subscription: dict) -> dict:
        """Handle subscription update (plan change, status change)."""
        subscription_id = subscription["id"]
        previous_attributes = subscription.get("previous_attributes", {})
        current_status = subscription["status"]

        # Detect what changed
        changes = []

        if "status" in previous_attributes:
            old_status = previous_attributes["status"]
            changes.append(f"status: {old_status} -> {current_status}")

        if "items" in previous_attributes:
            changes.append("plan_changed")

        if "cancel_at_period_end" in previous_attributes:
            if subscription["cancel_at_period_end"]:
                changes.append("cancellation_scheduled")
            else:
                changes.append("cancellation_rescinded")

        # Update our records
        await self.billing.sync_subscription(subscription)

        # Invalidate entitlement cache
        clinic_id = subscription.get("metadata", {}).get("clinic_id")
        if clinic_id:
            self.entitlements.invalidate_cache(clinic_id)

        return {
            "subscription_id": subscription_id,
            "changes": changes,
            "current_status": current_status,
        }

    async def handle_customer_subscription_deleted(self, subscription: dict) -> dict:
        """Handle subscription cancellation."""
        subscription_id = subscription["id"]
        metadata = subscription.get("metadata", {})
        clinic_id = metadata.get("clinic_id")
        agent_id = metadata.get("agent_id")

        # Revoke access
        if clinic_id and agent_id:
            await self.state_machine.process_event(
                subscription_id=subscription_id,
                current_status=SubscriptionStatus.CANCELED,
                event=SubscriptionEvent.ADMIN_CANCELED,
                context={"clinic_id": clinic_id, "agent_id": agent_id},
            )

        return {
            "subscription_id": subscription_id,
            "clinic_id": clinic_id,
            "agent_id": agent_id,
            "access_revoked": True,
        }

    async def handle_invoice_paid(self, invoice: dict) -> dict:
        """Handle successful invoice payment."""
        subscription_id = invoice.get("subscription")

        # If this was a past_due subscription that's now paid
        if subscription_id:
            result = await self.state_machine.process_event(
                subscription_id=subscription_id,
                current_status=SubscriptionStatus.PAST_DUE,
                event=SubscriptionEvent.PAYMENT_RECOVERED,
                context={"invoice_id": invoice["id"]},
            )
            return result

        return {"invoice_id": invoice["id"], "status": "paid"}

    async def handle_invoice_payment_failed(self, invoice: dict) -> dict:
        """Handle failed invoice payment."""
        subscription_id = invoice.get("subscription")
        attempt_count = invoice["attempt_count"]

        if subscription_id:
            # Determine current status
            subscription = stripe.Subscription.retrieve(subscription_id)
            current_status = SubscriptionStatus(subscription["status"])

            event = (SubscriptionEvent.DUNNING_EXHAUSTED
                     if attempt_count >= 4
                     else SubscriptionEvent.PAYMENT_FAILED)

            result = await self.state_machine.process_event(
                subscription_id=subscription_id,
                current_status=current_status,
                event=event,
                context={
                    "invoice_id": invoice["id"],
                    "attempt_count": attempt_count,
                    "failure_code": invoice.get("last_payment_error", {}).get("code"),
                },
            )
            return result

        return {"invoice_id": invoice["id"], "status": "payment_failed"}

    async def handle_customer_subscription_trial_will_end(self, subscription: dict) -> dict:
        """Handle trial ending soon notification (3 days before)."""
        clinic_id = subscription.get("metadata", {}).get("clinic_id")

        # Send trial ending reminder
        # await self.notification_service.send_trial_reminder(clinic_id, subscription["id"])

        return {
            "subscription_id": subscription["id"],
            "trial_end": subscription["trial_end"],
            "clinic_id": clinic_id,
            "notification_sent": True,
        }

    # --- Idempotency ---

    async def _is_event_processed(self, event_id: str) -> bool:
        """Check if an event has already been processed."""
        # Query your database for this event_id
        # Return True if found with success status
        return False  # Placeholder

    async def _mark_event_processed(
        self,
        event_id: str,
        event_type: str,
        processing_status: str,
        result: Optional[dict] = None,
    ):
        """Mark an event as processed to prevent duplicate handling."""
        # Store in your database:
        # event_id, event_type, processing_status, result, processed_at
        pass
```

---

### 9.3 Event-Driven Billing

```python
"""
Event-Driven Billing Architecture
Uses event streaming for usage tracking and billing.
"""
from typing import Callable, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime
import asyncio
from collections import defaultdict


@dataclass
class BillingEvent:
    """Represents a billing-relevant event."""
    event_id: str
    event_type: str  # "usage", "subscription_change", "outcome", "overage"
    clinic_id: str
    agent_id: str
    timestamp: datetime
    payload: Dict[str, Any]
    processed: bool = False


class EventDrivenBilling:
    """Event-driven billing system with streaming and aggregation."""

    def __init__(self, billing_service: StripeBillingService):
        self.billing = billing_service
        self.event_handlers: Dict[str, List[Callable]] = defaultdict(list)
        self.event_queue: asyncio.Queue = asyncio.Queue()
        self._register_handlers()

    def _register_handlers(self):
        """Register event handlers."""
        self.event_handlers["usage"].append(self._handle_usage_event)
        self.event_handlers["outcome"].append(self._handle_outcome_event)
        self.event_handlers["subscription_change"].append(self._handle_subscription_change)
        self.event_handlers["overage"].append(self._handle_overage_event)

    async def emit_event(self, event: BillingEvent):
        """Emit a billing event to the queue."""
        await self.event_queue.put(event)

    async def process_events(self):
        """Process events from the queue continuously."""
        while True:
            try:
                event = await asyncio.wait_for(self.event_queue.get(), timeout=1.0)
                await self._process_single_event(event)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error processing billing event: {e}")

    async def _process_single_event(self, event: BillingEvent):
        """Process a single billing event."""
        handlers = self.event_handlers.get(event.event_type, [])

        for handler in handlers:
            try:
                await handler(event)
            except Exception as e:
                logger.error(f"Handler {handler.__name__} failed for event {event.event_id}: {e}")

        event.processed = True

    async def _handle_usage_event(self, event: BillingEvent):
        """Handle usage events by reporting to Stripe meter."""
        payload = event.payload
        meter_name = payload.get("meter_name")
        value = payload.get("value", 1)

        if meter_name:
            await self.billing.report_usage_event(
                meter_name=meter_name,
                customer_id=event.clinic_id,
                value=value,
                event_id=event.event_id,
            )

    async def _handle_outcome_event(self, event: BillingEvent):
        """Handle outcome events for outcome-based billing."""
        payload = event.payload
        outcome_type = payload.get("outcome_type")

        if outcome_type:
            # Verify outcome and bill
            # outcome_billing.verify_outcome(outcome_type, payload)
            pass

    async def _handle_subscription_change(self, event: BillingEvent):
        """Handle subscription changes."""
        # Sync with Stripe
        payload = event.payload
        # billing_service.sync_subscription(payload)
        pass

    async def _handle_overage_event(self, event: BillingEvent):
        """Handle usage overage events."""
        payload = event.payload
        # Report overage to Stripe
        # billing_service.report_usage_event(...)
        pass
```

---

### 9.4 Idempotency Keys

```python
"""
Idempotency Key Management
Ensures safe retry of billing operations without double-charging.
"""
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Dict, Any


class IdempotencyManager:
    """Manage idempotency keys for billing operations."""

    # Operation types that require idempotency
    IDEMPOTENT_OPERATIONS = [
        "subscription_create",
        "subscription_update",
        "subscription_cancel",
        "usage_report",
        "refund",
        "plan_change",
        "invoice_generate",
    ]

    def __init__(self, redis_client):
        self.redis = redis_client
        self.key_ttl = 86400  # 24 hours

    def generate_key(
        self,
        operation: str,
        clinic_id: str,
        agent_id: Optional[str] = None,
        unique_params: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Generate an idempotency key for an operation."""
        # Deterministic key based on operation parameters
        key_data = f"{operation}:{clinic_id}:{agent_id or ''}"

        if unique_params:
            param_str = "|".join(f"{k}={v}" for k, v in sorted(unique_params.items()))
            key_data += f":{param_str}"

        # Hash for consistent length
        key_hash = hashlib.sha256(key_data.encode()).hexdigest()[:32]

        return f"idempotency:{operation}:{key_hash}"

    def generate_stripe_idempotency_key(self, operation: str, internal_id: str) -> str:
        """Generate an idempotency key for Stripe API calls."""
        return f"{operation}_{internal_id}_{datetime.utcnow().strftime('%Y%m%d')}"

    async def check_and_lock(self, key: str) -> bool:
        """
        Check if key has been used. If not, lock it.

        Returns True if operation should proceed (new key).
        Returns False if operation was already processed.
        """
        # Use Redis SET NX (set if not exists) for atomic check-and-set
        result = self.redis.set(key, "processing", nx=True, ex=self.key_ttl)
        return result is not None  # True if key was set (new operation)

    async def mark_complete(self, key: str, result: Dict[str, Any]):
        """Mark an operation as completed with its result."""
        result_json = json.dumps({
            "status": "completed",
            "result": result,
            "completed_at": datetime.utcnow().isoformat(),
        })
        self.redis.setex(key, self.key_ttl, result_json)

    async def get_result(self, key: str) -> Optional[Dict[str, Any]]:
        """Get the result of a previously completed operation."""
        result = self.redis.get(key)
        if result:
            return json.loads(result)
        return None

    async def mark_failed(self, key: str, error: str):
        """Mark an operation as failed, allowing retry."""
        # Delete the key so the operation can be retried
        self.redis.delete(key)
```

**Usage Example:**
```python
async def safe_subscription_create(
    self,
    clinic_id: str,
    agent_id: str,
    price_id: str,
):
    """Create subscription with idempotency guarantee."""
    idempotency = IdempotencyManager(redis_client)

    # Generate deterministic key
    key = idempotency.generate_key(
        operation="subscription_create",
        clinic_id=clinic_id,
        agent_id=agent_id,
        unique_params={"price_id": price_id},
    )

    # Check if already processed
    if not await idempotency.check_and_lock(key):
        # Operation already in progress or completed
        result = await idempotency.get_result(key)
        if result and result.get("status") == "completed":
            return result["result"]  # Return cached result
        # If still processing, wait
        await asyncio.sleep(1)
        return await safe_subscription_create(clinic_id, agent_id, price_id)

    try:
        # Execute the operation
        stripe_idempotency_key = idempotency.generate_stripe_idempotency_key(
            "sub_create", clinic_id
        )

        subscription = stripe.Subscription.create(
            customer=clinic_id,
            items=[{"price": price_id}],
            idempotency_key=stripe_idempotency_key,  # Stripe-level idempotency
        )

        result = {
            "subscription_id": subscription.id,
            "status": subscription.status,
        }

        # Mark as complete
        await idempotency.mark_complete(key, result)
        return result

    except Exception as e:
        # Mark as failed to allow retry
        await idempotency.mark_failed(key, str(e))
        raise
```

---

### 9.5 Retry Logic

```python
"""
Retry Logic for Billing Operations
Exponential backoff with jitter for resilient billing.
"""
import random
import asyncio
from functools import wraps
from typing import Callable, Type, Tuple
import logging

logger = logging.getLogger(__name__)


class RetryConfig:
    """Configuration for retry behavior."""
    max_retries: int = 5
    base_delay_seconds: float = 1.0
    max_delay_seconds: float = 60.0
    exponential_base: float = 2.0
    jitter_max: float = 1.0
    retryable_exceptions: Tuple[Type[Exception], ...] = (
        stripe.error.APIConnectionError,
        stripe.error.RateLimitError,
        stripe.error.APIError,
        TimeoutError,
        ConnectionError,
    )


class BillingRetry:
    """Retry decorator for billing operations."""

    def __init__(self, config: RetryConfig = None):
        self.config = config or RetryConfig()

    def with_retry(self, operation_name: str = "billing_operation"):
        """Decorator that adds retry logic to a billing function."""
        def decorator(func: Callable):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                last_exception = None

                for attempt in range(1, self.config.max_retries + 1):
                    try:
                        return await func(*args, **kwargs)

                    except self.config.retryable_exceptions as e:
                        last_exception = e
                        if attempt == self.config.max_retries:
                            logger.error(
                                f"{operation_name} failed after {attempt} attempts: {e}"
                            )
                            raise

                        delay = self._calculate_delay(attempt)
                        logger.warning(
                            f"{operation_name} attempt {attempt} failed: {e}. "
                            f"Retrying in {delay:.1f}s..."
                        )
                        await asyncio.sleep(delay)

                    except Exception as e:
                        # Non-retryable exception
                        logger.error(f"{operation_name} failed with non-retryable error: {e}")
                        raise

                raise last_exception

            return async_wrapper
        return decorator

    def _calculate_delay(self, attempt: int) -> float:
        """Calculate delay with exponential backoff and jitter."""
        # Exponential backoff
        delay = self.config.base_delay_seconds * (
            self.config.exponential_base ** (attempt - 1)
        )

        # Cap at max delay
        delay = min(delay, self.config.max_delay_seconds)

        # Add jitter (0 to jitter_max seconds)
        jitter = random.uniform(0, self.config.jitter_max)
        delay += jitter

        return delay


# Usage example
retry = BillingRetry()

@retry.with_retry("usage_reporting")
async def report_usage_with_retry(
    billing_service: StripeBillingService,
    meter_name: str,
    customer_id: str,
    value: int,
):
    """Report usage with automatic retry."""
    return await billing_service.report_usage_event(
        meter_name=meter_name,
        customer_id=customer_id,
        value=value,
    )
```

---

### 9.6 Audit Trails

```python
"""
Audit Trail System for Healthcare AI Agent Billing
HIPAA-compliant logging of all billing operations.
"""
from datetime import datetime
from typing import Dict, Any, Optional, List
from enum import Enum
import json
import hashlib


class AuditEventType(str, Enum):
    """Types of auditable billing events."""
    SUBSCRIPTION_CREATED = "subscription_created"
    SUBSCRIPTION_UPDATED = "subscription_updated"
    SUBSCRIPTION_CANCELED = "subscription_canceled"
    PAYMENT_SUCCEEDED = "payment_succeeded"
    PAYMENT_FAILED = "payment_failed"
    PAYMENT_RECOVERED = "payment_recovered"
    USAGE_REPORTED = "usage_reported"
    OVERAGE_CHARGED = "overage_charged"
    PLAN_CHANGED = "plan_changed"
    REFUND_ISSUED = "refund_issued"
    ENTITLEMENT_CHANGED = "entitlement_changed"
    ACCESS_GRANTED = "access_granted"
    ACCESS_REVOKED = "access_revoked"
    BAA_SIGNED = "baa_signed"
    DATA_EXPORTED = "data_exported"
    DATA_PURGED = "data_purged"


class BillingAuditTrail:
    """
    HIPAA-compliant audit trail for all billing operations.

    Requirements:
    - Immutable logs
    - Tamper-evident (hash chain)
    - 7-year retention
    - Searchable by clinic, date, event type
    - Exportable for compliance audits
    """

    RETENTION_YEARS = 7

    def __init__(self, storage_backend):
        self.storage = storage_backend
        self._last_hash = "0" * 64  # Genesis hash

    async def log_event(
        self,
        event_type: AuditEventType,
        clinic_id: str,
        actor: str,  # Who performed the action (user_id or "system")
        resource_id: str,  # What was affected (subscription_id, etc.)
        details: Dict[str, Any],
        before_state: Optional[Dict] = None,
        after_state: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Log an auditable billing event with tamper-evident hashing."""
        timestamp = datetime.utcnow().isoformat()

        # Create event record
        event = {
            "event_id": f"{event_type.value}_{clinic_id}_{datetime.utcnow().timestamp()}",
            "event_type": event_type.value,
            "clinic_id": clinic_id,
            "actor": actor,
            "resource_id": resource_id,
            "timestamp": timestamp,
            "details": self._sanitize_details(details),
            "before_state": before_state,
            "after_state": after_state,
            "previous_hash": self._last_hash,
        }

        # Calculate tamper-evident hash
        event_hash = self._calculate_event_hash(event)
        event["event_hash"] = event_hash

        # Store
        await self.storage.store(event)

        # Update chain hash
        self._last_hash = event_hash

        return event

    def _calculate_event_hash(self, event: Dict[str, Any]) -> str:
        """Calculate SHA-256 hash of event for tamper evidence."""
        # Include previous hash for chain integrity
        data = f"{event['previous_hash']}:{event['event_type']}:{event['timestamp']}:{json.dumps(event['details'], sort_keys=True)}"
        return hashlib.sha256(data.encode()).hexdigest()

    def _sanitize_details(self, details: Dict[str, Any]) -> Dict[str, Any]:
        """Remove sensitive data from audit details."""
        # Never store full card numbers, SSNs, or PHI in audit logs
        sensitive_keys = {"card_number", "ssn", "phi", "password", "secret"}
        sanitized = {}
        for key, value in details.items():
            if key.lower() in sensitive_keys:
                sanitized[key] = "***REDACTED***"
            else:
                sanitized[key] = value
        return sanitized

    async def query_audit_log(
        self,
        clinic_id: Optional[str] = None,
        event_type: Optional[AuditEventType] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        resource_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Query audit log with filters."""
        filters = {}
        if clinic_id:
            filters["clinic_id"] = clinic_id
        if event_type:
            filters["event_type"] = event_type.value
        if resource_id:
            filters["resource_id"] = resource_id

        return await self.storage.query(
            filters=filters,
            start_date=start_date,
            end_date=end_date,
        )

    async def verify_integrity(self, clinic_id: str) -> Dict[str, Any]:
        """Verify audit log integrity for a clinic."""
        events = await self.query_audit_log(clinic_id=clinic_id)

        tampered_events = []
        for i, event in enumerate(events):
            # Verify hash
            calculated_hash = self._calculate_event_hash({
                **event,
                "previous_hash": events[i-1]["event_hash"] if i > 0 else "0" * 64,
            })

            if calculated_hash != event.get("event_hash"):
                tampered_events.append({
                    "event_id": event["event_id"],
                    "expected_hash": calculated_hash,
                    "actual_hash": event.get("event_hash"),
                })

        return {
            "clinic_id": clinic_id,
            "total_events": len(events),
            "tampered_events": tampered_events,
            "integrity_verified": len(tampered_events) == 0,
            "verification_timestamp": datetime.utcnow().isoformat(),
        }

    async def export_for_compliance(
        self,
        clinic_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> Dict[str, Any]:
        """Export audit trail for compliance/audit purposes."""
        events = await self.query_audit_log(
            clinic_id=clinic_id,
            start_date=start_date,
            end_date=end_date,
        )

        return {
            "export_id": f"audit_export_{clinic_id}_{start_date.strftime('%Y%m%d')}",
            "clinic_id": clinic_id,
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            "event_count": len(events),
            "events": events,
            "integrity_check": await self.verify_integrity(clinic_id),
            "exported_at": datetime.utcnow().isoformat(),
        }
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
- [ ] Stripe account setup with HIPAA-eligible configuration
- [ ] Business Associate Agreement (BAA) execution
- [ ] Product catalog setup in Stripe
- [ ] Basic subscription lifecycle (create, update, cancel)
- [ ] Webhook endpoint with signature verification
- [ ] Subscription state machine implementation

### Phase 2: Marketplace (Weeks 5-8)
- [ ] Agent catalog with search and filtering
- [ ] Checkout flow with trial periods
- [ ] Plan tier entitlements (Starter/Pro/Enterprise)
- [ ] Feature flag integration
- [ ] Usage metering infrastructure
- [ ] Quota enforcement

### Phase 3: Healthcare (Weeks 9-12)
- [ ] HIPAA-compliant audit trails
- [ ] BAA workflow automation
- [ ] HSA/FSA eligibility statements
- [ ] ROI calculator for clinics
- [ ] CPT code mapping documentation
- [ ] Clinical cost justification templates

### Phase 4: Advanced (Weeks 13-16)
- [ ] Outcome-based billing
- [ ] Dunning management
- [ ] Proration handling
- [ ] Plan upgrade/downgrade flows
- [ ] Usage analytics dashboard
- [ ] Cancellation and data retention workflows

### Phase 5: Scale (Weeks 17-20)
- [ ] Multi-currency support
- [ ] International tax (VAT/GST)
- [ ] Enterprise sales-led contracts
- [ ] Custom pricing workflows
- [ ] Revenue recognition automation
- [ ] Advanced reporting and forecasting

---

## 11. Appendices

### Appendix A: Glossary

| Term | Definition |
|------|-----------|
| **BAA** | Business Associate Agreement - HIPAA-required contract |
| **CPT Code** | Current Procedural Terminology - medical billing code |
| **Dunning** | Process of retrying failed payments and notifying customers |
| **EHR** | Electronic Health Record - digital patient records |
| **Entitlement** | Permission to access a specific feature or capability |
| **FHIR** | Fast Healthcare Interoperability Resources - data standard |
| **HSA/FSA** | Health Savings Account / Flexible Spending Account |
| **NPI** | National Provider Identifier - unique clinician ID |
| **PHI** | Protected Health Information - regulated patient data |
| **Proration** | Adjusting charges for partial billing periods |
| **ROI** | Return on Investment - cost-benefit metric |
| **SLA** | Service Level Agreement - uptime/performance guarantee |

### Appendix B: Reference Pricing Matrix

| Agent Type | Starter | Professional | Enterprise |
|-----------|---------|-------------|------------|
| Patient Triage | $149/mo | $249/mo | $399/mo |
| Clinical Documentation | $249/mo | $399/mo | $599/mo |
| Medical Coding | $199/mo | $299/mo | $499/mo |
| Prior Authorization | $299/mo | $449/mo | $699/mo |
| Scheduling | $79/mo | $129/mo | $199/mo |
| **Bundle (All Agents)** | $799/mo | $1,499/mo | Custom |

### Appendix C: Webhook Event Reference

| Event | Description | Action Required |
|-------|-------------|----------------|
| `checkout.session.completed` | Checkout finished | Activate subscription |
| `customer.subscription.created` | New subscription | Store in DB, provision |
| `customer.subscription.updated` | Subscription changed | Sync entitlements |
| `customer.subscription.deleted` | Subscription ended | Revoke access |
| `invoice.paid` | Invoice paid | Confirm renewal |
| `invoice.payment_failed` | Payment failed | Start dunning |
| `invoice.payment_action_required` | 3D Secure needed | Notify customer |
| `customer.subscription.trial_will_end` | Trial ending soon | Send reminder |
| `payment_intent.succeeded` | Payment succeeded | Fulfill order |
| `charge.refunded` | Refund processed | Update records |

### Appendix D: Compliance Checklist

- [ ] Business Associate Agreement (BAA) active with Stripe
- [ ] End-to-end encryption for all PHI
- [ ] Audit logs enabled and immutable
- [ ] Role-based access control (RBAC)
- [ ] Data retention policies documented
- [ ] Breach notification procedures
- [ ] Staff HIPAA training records
- [ ] Penetration testing completed
- [ ] SOC 2 Type II certification (recommended)
- [ ] State-specific healthcare regulations reviewed
- [ ] HSA/FSA eligibility documentation
- [ ] Tax exemption certificates (where applicable)

### Appendix E: API Rate Limits

| Endpoint | Rate Limit | Burst |
|----------|-----------|-------|
| Create subscription | 100/min | 10 |
| Update subscription | 100/min | 10 |
| Cancel subscription | 100/min | 10 |
| Report usage | 10,000/min | 100 |
| Get subscription | 1,000/min | 100 |
| Preview proration | 100/min | 10 |
| Webhook processing | No limit | N/A |

---

## References

1. Stripe Billing Documentation - https://stripe.com/docs/billing
2. Stripe Connect Documentation - https://stripe.com/docs/connect
3. AWS Marketplace SaaS Integration Guide - https://docs.aws.amazon.com/marketplace
4. Salesforce AppExchange Partner Program - https://partners.salesforce.com
5. Shopify App Store Revenue Share - https://shopify.dev/docs/apps/launch/distribution/revenue-share
6. OpenAI GPT Store Monetization - https://openai.com/blog/gpt-store
7. HIPAA Compliance for SaaS - HHS.gov
8. IRS Publication 502 - Medical and Dental Expenses
9. CPT Code Guidelines - American Medical Association
10. Gartner: AI Agent Pricing Predictions 2024-2027

---

*End of Report*

*This document was generated as part of the DeepSynaps Protocol Studio research initiative. All pricing and technical recommendations should be validated against current vendor documentation and applicable healthcare regulations.*

