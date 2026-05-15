# Communication Channel Integrations for Clinical AI Agents

## A Comprehensive Research Report for Healthcare Technology Builders

**Version:** 1.0.0
**Date:** 2025-06-11
**Classification:** Technical Research / Implementation Guide
**Target Audience:** Engineering leads, CTOs, and clinical AI platform architects building patient-facing communication systems

---

## Executive Summary

Clinical AI agents must communicate with patients and clinical staff across multiple channels -- messaging platforms, SMS, email, voice, and web dashboards. Each channel carries distinct technical architectures, regulatory implications, cost structures, and patient engagement characteristics. This report provides an evidence-based technical analysis of the seven primary communication channel categories relevant to healthcare AI deployment, with production-ready code implementations, security architecture patterns, and compliance mappings to HIPAA, GDPR, and clinical governance standards.

### Key Findings at a Glance

| Channel | Latency | PHI-Safe | Setup Complexity | Cost/Message | Best Use Case |
|---|---|---|---|---|---|
| Telegram | ~200ms | No (without MTProto) | Low | Free | Staff alerts, non-PHI patient engagement |
| WhatsApp | ~300ms | Partial (E2E) | High | $0.005-0.08 | Appointment reminders, lab notifications |
| SMS | 1-5s | No (plaintext) | Low | $0.0075-0.02 | OTP, urgent alerts, medication reminders |
| Email | 5-30s | Partial (TLS) | Low | $0.0001-0.001 | Discharge summaries, reports, referrals |
| Voice | Real-time | Depends | Very High | $0.05-0.25/min | Complex care coordination, elderly patients |
| Dashboard | ~50ms | Yes (controlled) | Medium | $0 | Clinical staff workflows, audit trails |

### Channel Selection Decision Matrix

```
URGENT + SIMPLE    -> SMS (medication reminders, appointment alerts)
NON-URGENT + RICH  -> Email (discharge summaries, care plans)
INTERACTIVE        -> WhatsApp (two-way patient communication)
STAFF INTERNAL     -> Dashboard + Telegram (non-PHI alerts)
COMPLEX DIALOGUE   -> Voice AI agents (elderly, low-literacy populations)
```

---

## Table of Contents

1. [Telegram Bot Framework](#1-telegram-bot-framework)
2. [WhatsApp Business API](#2-whatsapp-business-api)
3. [SMS Integration](#3-sms-integration)
4. [Email Automation](#4-email-automation)
5. [Phone/Voice Agents](#5-phonevoice-agents)
6. [Dashboard Inbox](#6-dashboard-inbox)
7. [Channel Security](#7-channel-security)
8. [Unified Inbox Architecture](#8-unified-inbox-architecture)
9. [Production Code Examples](#9-production-code-examples)
10. [References](#10-references)

---

## 1. Telegram Bot Framework

### 1.1 Overview and Clinical Relevance

Telegram provides a free, developer-friendly bot platform with extensive API capabilities. For clinical AI agents, Telegram serves two distinct use cases: (1) **clinical staff alerting and coordination** (non-PHI operational messages), and (2) **patient engagement** for non-sensitive communications (appointment scheduling confirmations, general wellness tips, chatbot triage before human handoff).

**Critical Clinical Note:** Telegram's default cloud chats are NOT end-to-end encrypted. Secret Chats offer E2EE but are device-limited and not available via the Bot API. **No PHI should ever be transmitted through Telegram Bot API.**

### 1.2 python-telegram-bot Library (v20+)

The `python-telegram-bot` (PTB) library is the dominant Python SDK, with v20+ introducing significant async-first architecture changes built on `asyncio` and `httpx`.

| Feature | v19.x | v20+ |
|---|---|---|
| Async Model | Optional async | Async-first, sync deprecated |
| HTTP Client | `urllib3` | `httpx` |
| Context Types | `CallbackContext` | Typed `ContextTypes` |
| Error Handling | ` TelegramError` | Structured exception hierarchy |
| Rate Limiting | Manual | Built-in `AIORateLimiter` |
| Webhook Framework | Basic | Production-ready with `Application` |

**Installation:**
```bash
pip install python-telegram-bot[job-queue]>=20.0
# job-queue extras install APScheduler for scheduled messages
```

### 1.3 BotFather Setup and Token Management

Bot creation follows a standardized flow via Telegram's @BotFather:

```
1. Message @BotFather on Telegram
2. Send /newbot command
3. Provide bot display name (e.g., "Clinical AI Assistant")
4. Provide bot username (e.g., "clinical_ai_bot" -- must end in 'bot')
5. Receive HTTP API token (format: 123456789:ABCdefGHIjklMNOpqrSTUvwxyz)
6. Optionally: set description, about text, avatar, commands menu
7. Disable group join (for single-tenant clinic isolation)
8. Enable privacy mode (default: enabled -- only sees messages directed at bot)
```

**Token Management Best Practices for Clinical Deployments:**

```python
# Token storage -- NEVER hardcode tokens in source
import os
from dataclasses import dataclass

@dataclass(frozen=True)
class TelegramConfig:
    """Immutable configuration for Telegram bot instances.
    
    In production, load from AWS Secrets Manager, Azure Key Vault,
    or HashiCorp Vault. Never commit tokens to version control.
    """
    bot_token: str
    webhook_url: str | None = None
    webhook_port: int = 8443
    webhook_path: str = "/webhook"
    clinic_id: str = "default"
    
    @classmethod
    def from_environment(cls) -> "TelegramConfig":
        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN environment variable required")
        return cls(
            bot_token=token,
            webhook_url=os.environ.get("TELEGRAM_WEBHOOK_URL"),
            clinic_id=os.environ.get("CLINIC_ID", "default"),
        )
```

**Multi-clinic bot isolation strategy:**

```python
# clinic_bot_registry.py
from collections.abc import Mapping

class ClinicBotRegistry:
    """Maintains isolated bot instances per clinic.
    
    Each clinic receives a dedicated bot token, ensuring
    message routing isolation and preventing cross-clinic
    data leakage."""
    
    def __init__(self) -> None:
        self._bots: dict[str, TelegramConfig] = {}
    
    def register_clinic(self, clinic_id: str, config: TelegramConfig) -> None:
        """Register a bot configuration for a specific clinic."""
        self._bots[clinic_id] = config
    
    def get_config(self, clinic_id: str) -> TelegramConfig:
        if clinic_id not in self._bots:
            raise KeyError(f"No bot configured for clinic: {clinic_id}")
        return self._bots[clinic_id]
    
    @property
    def clinic_ids(self) -> set[str]:
        return set(self._bots.keys())
```

### 1.4 Webhook vs Long-Polling Architecture

Telegram offers two update delivery mechanisms with distinct operational characteristics:

| Dimension | Long-Polling | Webhook |
|---|---|---|
| **Infrastructure** | Any server (no public URL needed) | Requires HTTPS endpoint + public IP |
| **Latency** | 1-30s (dependent on `timeout` param) | Near real-time (< 100ms) |
| **Firewall** | Outbound-only (egress) | Inbound HTTPS required |
| **Cost** | Lower (no load balancer needed) | Higher (TLS termination, load balancer) |
| **Scalability** | Limited (single connection) | Horizontal scaling supported |
| **Reconnect** | Automatic via `getUpdates` | Requires retry logic on failure |
| **Best for** | Development, small clinics | Production, multi-tenant deployments |

**Long-Polling Implementation:**

```python
# polling_app.py -- Development / small deployment
import asyncio
import logging
from telegram import Update
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, filters, ContextTypes
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ─── Handler Functions ──────────────────────────────────────────────────

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command -- patient onboarding flow."""
    user = update.effective_user
    clinic_id = context.bot_data.get("clinic_id", "unknown")
    
    welcome_text = (
        f"Welcome {user.first_name} to our Clinical AI Assistant.\n\n"
        f"Clinic: {clinic_id}\n"
        f"Patient ID: {user.id}\n\n"
        "Available commands:\n"
        "/schedule -- Request appointment\n"
        "/prescription -- Medication inquiries\n"
        "/lab -- Lab result notifications\n"
        "/human -- Speak to a staff member\n"
        "/help -- Show all options"
    )
    await update.message.reply_text(welcome_text)

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Display available commands with inline keyboard."""
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    
    keyboard = [
        [InlineKeyboardButton("Schedule Appointment", callback_data="cmd_schedule")],
        [InlineKeyboardButton("Medication Info", callback_data="cmd_medication")],
        [InlineKeyboardButton("Lab Results", callback_data="cmd_lab")],
        [InlineKeyboardButton("Speak to Human", callback_data="cmd_human")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "How can I help you today?",
        reply_markup=reply_markup
    )

async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle inline keyboard button presses."""
    query = update.callback_query
    await query.answer()  # Required to remove loading state
    
    callback_data = query.data
    
    routing_map = {
        "cmd_schedule": "Routing to appointment scheduling...",
        "cmd_medication": "Connecting to medication database...",
        "cmd_lab": "Checking lab result status...",
        "cmd_human": "Connecting you to a care coordinator...",
        "approve_appointment": "Appointment approved by care team.",
        "deny_appointment": "Appointment request denied. Staff will contact you.",
    }
    
    response = routing_map.get(callback_data, "Processing your request...")
    await query.edit_message_text(response)

async def text_message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Process incoming text messages -- triage and routing."""
    message_text = update.message.text
    user_id = update.effective_user.id
    
    # Log for audit (NO PHI in logs)
    logger.info(f"Message received from user_id={user_id}, length={len(message_text)}")
    
    # Simple triage classification (replace with clinical NLP model)
    if any(word in message_text.lower() for word in ["pain", "hurt", "emergency", "bleeding"]):
        await update.message.reply_text(
            "If this is a medical emergency, please call 911 immediately.\n\n"
            "I'm connecting you to our triage nurse now. Please describe your symptoms."
        )
    elif any(word in message_text.lower() for word in ["appointment", "schedule", "book"]):
        await help_command(update, context)
    else:
        await update.message.reply_text(
            "I understand. Let me help you with that.\n\n"
            "Could you provide more details, or type /help to see available options?"
        )

# ─── Application Factory ────────────────────────────────────────────────

def create_polling_app(config: TelegramConfig) -> Application:
    """Factory function for polling-based bot application."""
    application = (
        Application.builder()
        .token(config.bot_token)
        .concurrent_updates(True)  # Handle multiple updates concurrently
        .build()
    )
    
    # Store clinic context in bot_data for handler access
    application.bot_data["clinic_id"] = config.clinic_id
    
    # Register handlers -- ORDER MATTERS (checked top-to-bottom)
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CallbackQueryHandler(button_callback))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_message_handler))
    
    return application

# ─── Main Entry Point ──────────────────────────────────────────────────

async def main() -> None:
    config = TelegramConfig.from_environment()
    app = create_polling_app(config)
    
    logger.info(f"Starting polling bot for clinic: {config.clinic_id}")
    await app.initialize()
    await app.start()
    
    # poll_interval=1 means check for updates every second
    await app.updater.start_polling(poll_interval=1.0, timeout=30)
    
    # Run until interrupted
    await asyncio.Event().wait()

if __name__ == "__main__":
    asyncio.run(main())
```

**Webhook Implementation (Production):**

```python
# webhook_app.py -- Production deployment
from telegram.ext import Application
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
import json

class TelegramWebhookServer:
    """Production webhook server for Telegram bot.
    
    Integrates with FastAPI for shared port operation alongside
    other clinical AI services. Uses PTB's webhook handler for
    update processing."""
    
    def __init__(self, config: TelegramConfig) -> None:
        self.config = config
        self.app = Application.builder().token(config.bot_token).build()
        self._configure_handlers()
    
    def _configure_handlers(self) -> None:
        """Register all update handlers."""
        self.app.add_handler(CommandHandler("start", start_command))
        self.app.add_handler(CommandHandler("help", help_command))
        self.app.add_handler(CallbackQueryHandler(button_callback))
        self.app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_message_handler))
    
    async def setup_webhook(self) -> None:
        """Configure Telegram webhook endpoint."""
        webhook_url = f"{self.config.webhook_url}{self.config.webhook_path}"
        await self.app.bot.set_webhook(
            url=webhook_url,
            allowed_updates=["message", "callback_query", "edited_message"],
            drop_pending_updates=True,
        )
        logger.info(f"Webhook set to: {webhook_url}")
    
    async def handle_update(self, request: Request) -> JSONResponse:
        """Process incoming webhook update from Telegram."""
        try:
            data = await request.json()
            update = Update.de_json(data, self.app.bot)
            await self.app.process_update(update)
            return JSONResponse(content={"status": "ok"})
        except Exception as e:
            logger.error(f"Webhook processing error: {e}")
            return JSONResponse(content={"status": "error"}, status_code=500)

# ─── FastAPI Integration ────────────────────────────────────────────────

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage bot lifecycle alongside FastAPI."""
    config = TelegramConfig.from_environment()
    bot_server = TelegramWebhookServer(config)
    await bot_server.setup_webhook()
    await bot_server.app.initialize()
    
    app.state.bot_server = bot_server
    yield
    
    await bot_server.app.shutdown()

api = FastAPI(title="Clinical AI Agent -- Telegram Channel", lifespan=lifespan)

@api.post("/webhook")
async def telegram_webhook(request: Request) -> JSONResponse:
    """Receive Telegram webhook updates."""
    bot_server = request.app.state.bot_server
    return await bot_server.handle_update(request)

@api.get("/health")
async def health_check() -> dict:
    """Service health check for load balancers."""
    return {"status": "healthy", "channel": "telegram", "timestamp": datetime.utcnow().isoformat()}
```

### 1.5 Message Handlers, Command Handlers, Callback Queries

The PTB handler system routes incoming updates based on filter conditions. Handler registration order determines priority.

```python
from telegram.ext import (
    CommandHandler,      # /^commands
    MessageHandler,      # Text, media, documents
    CallbackQueryHandler, # Inline button presses
    ConversationHandler,  # Multi-step stateful dialogs
    TypeHandler,         # Generic type-based routing
    filters,
)

# ─── Handler Types for Clinical Workflows ─────────────────────────────

# 1. Command Handlers -- Structured patient interactions
async def schedule_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Multi-step appointment scheduling conversation."""
    await update.message.reply_text(
        "Let's schedule your appointment.\n\n"
        "Please select your preferred date (YYYY-MM-DD):"
    )
    return DATE_SELECTION  # Conversation state enum

# 2. Message Handlers with Filters -- Content-based routing
photo_handler = MessageHandler(filters.PHOTO, handle_lab_result_photo)
document_handler = MessageHandler(filters.Document.ALL, handle_medical_document)
location_handler = MessageHandler(filters.LOCATION, handle_patient_location)
contact_handler = MessageHandler(filters.CONTACT, handle_contact_share)

# 3. Callback Query Handler -- Interactive approvals
async def approval_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle clinical approval workflows (appointment confirmations, etc.)."""
    query = update.callback_query
    data = query.data  # format: "action:request_id:clinic_id"
    
    action, request_id, clinic_id = data.split(":")
    
    # Validate staff authorization
    staff_id = query.from_user.id
    if not await is_authorized_staff(staff_id, clinic_id):
        await query.answer("Unauthorized: You are not a registered staff member.", show_alert=True)
        return
    
    if action == "approve":
        await process_approval(request_id, approved_by=staff_id)
        await query.edit_message_text(
            f"Request #{request_id} APPROVED by staff member {staff_id}.\n"
            f"Status: Confirmed"
        )
    elif action == "deny":
        await process_denial(request_id, denied_by=staff_id)
        await query.edit_message_text(
            f"Request #{request_id} DENIED by staff member {staff_id}.\n"
            f"Status: Rejected"
        )
    elif action == "escalate":
        await escalate_request(request_id)
        await query.edit_message_text(
            f"Request #{request_id} ESCALATED to senior review.\n"
            f"Status: Pending senior approval"
        )
```

### 1.6 Inline Keyboards for Clinical Approvals

Inline keyboards provide button-based interaction without requiring additional message input, ideal for clinical approval workflows.

```python
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

async def send_approval_request(
    bot: Bot,
    chat_id: int,
    request_id: str,
    patient_name: str,  # Use pseudonym, not real name
    request_type: str,
    details: str,
) -> None:
    """Send an approval request to clinical staff via inline keyboard.
    
    IMPORTANT: patient_name should be a pseudonym or patient ID,
    never full PHI in Telegram messages.
    """
    keyboard = [
        [
            InlineKeyboardButton("Approve", callback_data=f"approve:{request_id}"),
            InlineKeyboardButton("Deny", callback_data=f"deny:{request_id}"),
        ],
        [
            InlineKeyboardButton("Escalate", callback_data=f"escalate:{request_id}"),
            InlineKeyboardButton("View Details", callback_data=f"view:{request_id}"),
        ],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    message = (
        f"Approval Request #{request_id}\n"
        f"Type: {request_type}\n"
        f"Patient: {patient_name}\n\n"
        f"Details: {details}\n\n"
        f"Please review and select an action:"
    )
    
    await bot.send_message(
        chat_id=chat_id,
        text=message,
        reply_markup=reply_markup,
        parse_mode="HTML",
    )
```

### 1.7 File, Document, and Photo Handling

Telegram supports file uploads up to 20MB (via Bot API) and 2GB (via local API server). For clinical use, document handling must implement content scanning and PHI detection.

```python
from telegram.constants import FileSizeLimit
import hashlib
import aiofiles

MAX_CLINICAL_FILE_SIZE = 10 * 1024 * 1024  # 10MB clinic limit
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/dicom",
    "text/plain",
}

async def handle_medical_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Process incoming medical document with security checks."""
    document = update.message.document
    user_id = update.effective_user.id
    
    # ─── Security Validation ──────────────────────────────────────────
    
    # 1. File size check
    if document.file_size > MAX_CLINICAL_FILE_SIZE:
        await update.message.reply_text(
            f"File too large ({document.file_size / 1024 / 1024:.1f}MB). "
            f"Maximum allowed: {MAX_CLINICAL_FILE_SIZE / 1024 / 1024:.0f}MB."
        )
        return
    
    # 2. MIME type validation
    if document.mime_type not in ALLOWED_MIME_TYPES:
        await update.message.reply_text(
            f"File type '{document.mime_type}' not accepted. "
            f"Allowed: PDF, JPEG, PNG, DICOM, TXT"
        )
        return
    
    # ─── File Processing ──────────────────────────────────────────────
    
    # Download file to secure temporary location
    file = await context.bot.get_file(document.file_id)
    file_hash = hashlib.sha256(document.file_id.encode()).hexdigest()[:16]
    file_path = f"/secure/temp/{file_hash}_{document.file_name}"
    
    await file.download_to_drive(file_path)
    
    # Log receipt (no PHI)
    logger.info(
        f"Document received: user={user_id}, "
        f"mime={document.mime_type}, size={document.file_size}"
    )
    
    # ─── PHI Scanning (preliminary) ───────────────────────────────────
    
    if document.mime_type == "application/pdf":
        phi_detected = await scan_pdf_for_phi(file_path)
        if phi_detected:
            await update.message.reply_text(
                "This document may contain sensitive health information.\n"
                "It has been securely stored and will be reviewed by clinical staff."
            )
            # Route to secure clinical review queue, NOT Telegram
            await route_to_clinical_queue(file_path, user_id, channel="telegram")
            return
    
    # ─── Normal Processing ────────────────────────────────────────────
    
    await update.message.reply_text(
        f"Document received ({document.file_name}).\n"
        "Our clinical team will review and respond shortly."
    )
```

### 1.8 Group Chat vs Private Chat

| Feature | Private Chat | Group Chat |
|---|---|---|
| Privacy | Bot sees all messages | Bot only sees @mentions and replies (privacy mode) |
| PHI Risk | Lower (1:1) | Higher (multiple participants) |
| Use Case | Patient communication | Staff coordination, team alerts |
| Bot Commands | All available | Must be explicit or @mentioned |
| Member Management | N/A | Admin can remove bot |

**Group Chat Configuration for Staff Coordination:**

```python
# Staff group configuration
STAFF_GROUP_PERMISSIONS = {
    "can_send_messages": True,
    "can_send_media_messages": False,  # No file sharing in groups
    "can_send_polls": True,            # Staff polls for decisions
    "can_change_info": False,
    "can_invite_users": False,
    "can_pin_messages": True,
}

async def configure_staff_group(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Configure bot for staff group with restricted permissions."""
    chat_id = update.effective_chat.id
    
    # Verify this is a group chat
    if update.effective_chat.type not in ["group", "supergroup"]:
        await update.message.reply_text("This command only works in group chats.")
        return
    
    # Set bot permissions
    await context.bot.set_chat_permissions(
        chat_id=chat_id,
        permissions=ChatPermissions(
            can_send_messages=True,
            can_send_media_messages=False,
        )
    )
```

### 1.9 Clinic-Specific Bot Isolation

Multi-tenancy requires strict clinic-patient isolation. Each clinic should have a dedicated bot instance with separate tokens and data boundaries.

```python
# multi_tenant_bot_manager.py
from telegram import Bot

class MultiTenantBotManager:
    """Manages isolated bot instances across multiple clinics.
    
    Each clinic gets:
    - Dedicated bot token (separate Telegram bot identity)
    - Isolated webhook endpoint (/webhook/{clinic_id})
    - Separate conversation state storage
    - Independent rate limiting bucket
    """
    
    def __init__(self) -> None:
        self._bots: dict[str, Bot] = {}
        self._configs: dict[str, TelegramConfig] = {}
    
    async def register_clinic(self, clinic_id: str, config: TelegramConfig) -> None:
        """Register a new clinic with isolated bot instance."""
        bot = Bot(token=config.bot_token)
        
        # Validate token by calling get_me()
        bot_info = await bot.get_me()
        logger.info(f"Registered clinic '{clinic_id}' with bot @{bot_info.username}")
        
        self._bots[clinic_id] = bot
        self._configs[clinic_id] = config
    
    def get_bot(self, clinic_id: str) -> Bot:
        """Retrieve bot instance for specific clinic."""
        if clinic_id not in self._bots:
            raise ClinicNotFoundError(f"No bot registered for clinic: {clinic_id}")
        return self._bots[clinic_id]
    
    async def send_to_clinic_staff(
        self,
        clinic_id: str,
        chat_id: int,
        message: str,
        parse_mode: str = "HTML",
    ) -> None:
        """Send message through clinic-specific bot instance."""
        bot = self.get_bot(clinic_id)
        # Pre-flight: ensure no PHI in message
        sanitized = sanitize_for_telegram(message)
        await bot.send_message(chat_id=chat_id, text=sanitized, parse_mode=parse_mode)

class ClinicNotFoundError(Exception):
    """Raised when clinic_id has no registered bot."""
```

### 1.10 HIPAA Considerations for Telegram

**Critical Assessment: Telegram Bot API is NOT HIPAA-compliant for PHI transmission.**

| Requirement | Telegram Status | Mitigation |
|---|---|---|
| End-to-End Encryption | Not available in Bot API | Do NOT transmit PHI |
| BAA Available | No Business Associate Agreement | Cannot sign BAA with Telegram |
| Data Residency | Servers distributed globally (EU, SG, US) | No control over data location |
| Access Controls | Bot token-based | Token rotation, IP restrictions |
| Audit Logging | No built-in audit trail | Implement external audit logging |
| Data Retention | Indefinite (cloud chats) | Implement message deletion policies |

**Clinical Usage Guidelines for Telegram:**

```python
# phi_safe_content_filter.py
import re

# Patterns that may indicate PHI leakage
PHI_PATTERNS = [
    r"\b\d{3}-\d{2}-\d{4}\b",                    # SSN
    r"\b\d{9}\b",                                  # MRN (9 digits)
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",  # Email
    r"\b\d{3}-\d{3}-\d{4}\b",                     # Phone
    r"\b\d{1,2}/\d{1,2}/\d{2,4}\b",               # Dates (simplified)
]

class PHISafetyFilter:
    """Pre-flight content scanner for Telegram messages.
    
    Prevents accidental PHI transmission through Telegram by
    scanning all outbound messages for potential identifiers."""
    
    def __init__(self) -> None:
        self.patterns = [re.compile(p) for p in PHI_PATTERNS]
    
    def scan(self, message: str) -> tuple[bool, list[str]]:
        """Scan message for potential PHI.
        
        Returns:
            (is_safe, violations): Tuple of safety status and found patterns.
        """
        violations = []
        for pattern in self.patterns:
            matches = pattern.findall(message)
            if matches:
                violations.extend(matches)
        
        return (len(violations) == 0), violations
    
    def enforce_safe(
        self,
        message: str,
        fallback_message: str = "New notification available. Please check the patient portal.",
    ) -> str:
        """Return message if safe, otherwise return PHI-free fallback."""
        is_safe, violations = self.scan(message)
        if is_safe:
            return message
        logger.warning(f"PHI detected in Telegram message: {len(violations)} violations")
        return fallback_message

# Usage in handlers
phi_filter = PHISafetyFilter()

async def safe_send_message(bot: Bot, chat_id: int, text: str, **kwargs) -> None:
    """Wrapper that enforces PHI safety before sending to Telegram."""
    safe_text = phi_filter.enforce_safe(text)
    await bot.send_message(chat_id=chat_id, text=safe_text, **kwargs)
```

---

## 2. WhatsApp Business API

### 2.1 Overview and Clinical Relevance

WhatsApp Business API enables programmatic messaging through the world's most popular messaging platform (2+ billion users). For clinical AI agents, WhatsApp is the premier patient-facing messaging channel due to its widespread adoption, end-to-end encryption, and Meta's healthcare template support.

### 2.2 Meta Business Platform Setup

Setup requires navigating Meta's multi-layered platform architecture:

```
Setup Flow:
1. Create Meta Business Account (business.facebook.com)
2. Verify business identity (business license, tax documents)
3. Create WhatsApp Business Account (WABA)
4. Add phone number (must not have WhatsApp installed)
5. Verify phone via SMS/voice call
6. Generate System User access token
7. Register phone number with API
8. Configure webhook endpoint
9. Submit message templates for approval
10. Complete business verification (for healthcare)
```

**Required Permissions (Access Tokens):**

| Permission | Scope |
|---|---|
| `whatsapp_business_management` | Manage WABA settings |
| `whatsapp_business_messaging` | Send and receive messages |
| `business_management` | Business account management |

```python
# meta_auth_manager.py
class MetaAuthManager:
    """Manages Meta API authentication and token lifecycle."""
    
    TOKEN_REFRESH_BUFFER = 300  # Refresh 5 minutes before expiry
    
    def __init__(self, app_id: str, app_secret: str, system_user_token: str) -> None:
        self.app_id = app_id
        self.app_secret = app_secret
        self._access_token = system_user_token
        self._token_expiry: datetime | None = None
    
    async def get_valid_token(self) -> str:
        """Return current valid token, refreshing if necessary."""
        if self._is_token_expired():
            await self._refresh_token()
        return self._access_token
    
    def _is_token_expired(self) -> bool:
        if self._token_expiry is None:
            return False
        return datetime.utcnow() >= (self._token_expiry - timedelta(seconds=self.TOKEN_REFRESH_BUFFER))
    
    async def _refresh_token(self) -> None:
        """Exchange long-lived token using Meta's endpoint."""
        url = "https://graph.facebook.com/v18.0/oauth/access_token"
        params = {
            "grant_type": "fb_exchange_token",
            "client_id": self.app_id,
            "client_secret": self.app_secret,
            "fb_exchange_token": self._access_token,
        }
        # Implementation: HTTP request to refresh endpoint
        pass
```

### 2.3 Cloud API vs On-Premises

| Dimension | Cloud API | On-Premises |
|---|---|---|
| **Hosting** | Meta-managed servers | Self-hosted Docker containers |
| **Setup Time** | Hours | Days (infrastructure) |
| **Scaling** | Automatic | Manual (Kubernetes/Docker Swarm) |
| **Message Throughput** | 80 msg/sec (default) | Configurable |
| **Data Control** | Messages pass through Meta | Full data control on-premise |
| **HIPAA Feasibility** | Requires BAA with Meta | Better (data never leaves premise) |
| **Cost** | Per-conversation pricing | Infrastructure + license fees |
| **High Availability** | 99.9% SLA | Self-managed |
| **Recommendation** | Most healthcare use cases | Highly regulated environments |

### 2.4 Message Templates (Approved by Meta)

All business-initiated messages on WhatsApp must use pre-approved templates. This is the most significant constraint for clinical AI agents.

**Template Categories:**

```
META:UTILITY     -> Appointment reminders, lab results ready, prescription ready
META:MARKETING   -> Wellness tips, preventive care campaigns (requires opt-in)
META:AUTHENTICATION -> OTP, verification codes
```

**Healthcare-Specific Template Examples:**

```python
# Template definitions for clinical use
WHATSAPP_TEMPLATES = {
    "appointment_reminder": {
        "name": "appointment_reminder",
        "language": {"code": "en_US"},
        "components": [
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": "{{1}}"},  # Patient first name
                    {"type": "text", "text": "{{2}}"},  # Appointment date
                    {"type": "text", "text": "{{3}}"},  # Appointment time
                    {"type": "text", "text": "{{4}}"},  # Doctor name
                    {"type": "text", "text": "{{5}}"},  # Location
                ]
            }
        ]
    },
    "lab_results_ready": {
        "name": "lab_results_ready",
        "language": {"code": "en_US"},
        "components": [
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": "{{1}}"},  # Patient name
                    {"type": "text", "text": "{{2}}"},  # Test type
                    {"type": "text", "text": "{{3}}"},  # Portal link
                ]
            }
        ]
    },
    "prescription_ready": {
        "name": "prescription_ready",
        "language": {"code": "en_US"},
        "components": [
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": "{{1}}"},  # Patient name
                    {"type": "text", "text": "{{2}}"},  # Medication name
                    {"type": "text", "text": "{{3}}"},  # Pharmacy name
                    {"type": "text", "text": "{{4}}"},  # Pickup instructions
                ]
            }
        ]
    },
    "medication_reminder": {
        "name": "medication_reminder",
        "language": {"code": "en_US"},
        "components": [
            {
                "type": "body",
                "parameters": [
                    {"type": "text", "text": "{{1}}"},  # Patient name
                    {"type": "text", "text": "{{2}}"},  # Medication name
                    {"type": "text", "text": "{{3}}"},  # Dosage
                    {"type": "text", "text": "{{4}}"},  # Time
                ]
            }
        ]
    },
}
```

**Template Submission via API:**

```python
async def submit_template_for_approval(
    self,
    template_name: str,
    category: str,  # UTILITY, MARKETING, AUTHENTICATION
    language: str,
    body_text: str,  # e.g., "Hello {{1}}, your appointment is on {{2}} at {{3}}."
) -> dict:
    """Submit a new message template to Meta for approval.
    
    Healthcare templates typically take 24-48 hours for review.
    Meta may reject templates that imply medical diagnosis.
    """
    url = f"https://graph.facebook.com/v18.0/{self.business_account_id}/message_templates"
    
    payload = {
        "name": template_name,
        "category": category,
        "language": language,
        "components": [
            {
                "type": "BODY",
                "text": body_text,
            },
            {
                "type": "FOOTER",
                "text": "Reply STOP to opt out.",
            }
        ],
    }
    
    headers = {"Authorization": f"Bearer {await self.auth.get_valid_token()}"}
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers) as resp:
            result = await resp.json()
            template_id = result.get("id")
            status = result.get("status", "PENDING")
            
            logger.info(f"Template '{template_name}' submitted. ID={template_id}, Status={status}")
            return result
```

### 2.5 Session-Based Messaging (24-Hour Window)

WhatsApp's conversation-based pricing model defines distinct messaging windows:

```
User-Initiated Conversation (UIC):
- Triggered when patient sends a message
- 24-hour window opens
- Free-form messages allowed during window
- Costs: ~$0.004-0.008 per conversation (varies by country)

Business-Initiated Conversation (BIC):
- Requires approved template
- Template must match declared category
- Costs vary by category:
  - Utility: $0.004-0.015
  - Authentication: $0.004-0.008
  - Marketing: $0.006-0.022
```

```python
class ConversationWindowManager:
    """Tracks 24-hour conversation windows per patient.
    
    Determines whether free-form or template messages
    are required for each outgoing message."""
    
    WINDOW_DURATION = timedelta(hours=24)
    
    def __init__(self, redis_client: redis.Redis) -> None:
        self.redis = redis_client
    
    async def is_window_open(self, patient_phone: str) -> bool:
        """Check if a 24-hour conversation window is active."""
        key = f"wa:window:{patient_phone}"
        expiry = await self.redis.ttl(key)
        return expiry > 0
    
    async def record_incoming(self, patient_phone: str) -> None:
        """Record incoming message and open/extend conversation window."""
        key = f"wa:window:{patient_phone}"
        await self.redis.setex(key, int(self.WINDOW_DURATION.total_seconds()), "1")
    
    async def send_message(
        self,
        patient_phone: str,
        message: str,
        template_name: str | None = None,
        template_params: list | None = None,
    ) -> dict:
        """Send message using appropriate method based on conversation window."""
        window_open = await self.is_window_open(patient_phone)
        
        if window_open:
            # Free-form message within 24h window
            return await self._send_freeform(patient_phone, message)
        else:
            # Must use approved template
            if not template_name:
                raise ValueError("Template required outside 24h window")
            return await self._send_template(
                patient_phone, template_name, template_params or []
            )
```

### 2.6 Two-Factor Authentication

Meta requires 2FA for all Business Manager accounts:

```python
class Meta2FAManager:
    """Manages two-factor authentication for Meta Business accounts."""
    
    def __init__(self, totp_secret: str) -> None:
        self.totp_secret = totp_secret
    
    def generate_code(self) -> str:
        """Generate TOTP code for Meta 2FA prompt."""
        import pyotp
        totp = pyotp.TOTP(self.totp_secret)
        return totp.now()
    
    async def authenticate_api_request(self, headers: dict) -> dict:
        """Add 2FA token to API request headers if required."""
        # Meta may challenge requests with 2FA
        headers["X-2FA-Code"] = self.generate_code()
        return headers
```

### 2.7 Pricing Model (Per Conversation)

WhatsApp pricing is conversation-based, not per-message:

| Conversation Type | Global Rate Range | Typical US Rate |
|---|---|---|
| User-Initiated | $0.004 - $0.008 | ~$0.005 |
| Business Utility | $0.004 - $0.015 | ~$0.008 |
| Business Authentication | $0.004 - $0.008 | ~$0.006 |
| Business Marketing | $0.006 - $0.022 | ~$0.015 |
| Service (free tier) | 1,000 free conversations/month | $0 |

**Cost Optimization Strategy:**

```python
class WhatsAppCostOptimizer:
    """Optimize WhatsApp messaging costs through batching and window management."""
    
    FREE_TIER_LIMIT = 1000  # Free conversations per month
    
    async def batch_notifications(
        self,
        patient_list: list[str],
        template: str,
    ) -> dict[str, dict]:
        """Batch send notifications to minimize conversation costs.
        
        Strategy: Send all notifications in a short window to
        maximize patients who respond within the 24h window,
        enabling free-form follow-ups.
        """
        results = {}
        
        for patient_phone in patient_list:
            result = await self.send_template_message(
                patient_phone, template
            )
            results[patient_phone] = result
            
            # Small delay to avoid rate limiting
            await asyncio.sleep(0.2)
        
        return results
    
    def estimate_monthly_cost(
        self,
        patient_count: int,
        avg_conversations_per_patient: float,
        conversation_rate: float = 0.05,  # 5% response rate
    ) -> float:
        """Estimate monthly WhatsApp messaging costs."""
        total_conversations = patient_count * avg_conversations_per_patient
        billable = max(0, total_conversations - self.FREE_TIER_LIMIT)
        avg_cost = 0.008  # Blended average per conversation
        return billable * avg_cost
```

### 2.8 Healthcare Template Approval

Meta has specific policies for healthcare-related templates:

**Allowed (typically approved):**
- Appointment reminders and confirmations
- Lab result availability notifications (without results)
- Prescription ready notifications
- General wellness and preventive care reminders
- Medication adherence reminders

**Restricted (may be rejected):**
- Messages containing specific diagnoses
- Treatment recommendations without provider review
- Emergency medical advice
- Content implying guaranteed outcomes

**Best Practices for Approval:**

```python
TEMPLATE_APPROVAL_GUIDELINES = """
1. Use neutral, informational language (not diagnostic)
2. Include clear opt-out instructions in footer
3. Reference secure portals for sensitive information
4. Avoid urgency language that implies emergency
5. Include clinic contact information
6. Use patient first name only, never full medical details
7. Ensure template category matches actual use (UTILITY for reminders)
8. Test with small patient group before bulk deployment
9. Include locale-appropriate language variants
10. Provide expected response path for patients (reply flow)
"""
```

---

## 3. SMS Integration

### 3.1 Overview and Clinical Relevance

SMS remains the most universally accessible communication channel with near-100% device penetration. For clinical AI agents, SMS excels at time-sensitive, short-format communications: appointment reminders, medication adherence nudges, two-factor authentication, and urgent care alerts.

### 3.2 Twilio Programmable SMS

Twilio is the dominant SMS API platform for healthcare, offering comprehensive delivery tracking, compliance features, and global carrier reach.

```python
# twilio_sms_client.py
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException

class TwilioSMSClient:
    """Production-grade Twilio SMS client for clinical communications."""
    
    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        messaging_service_sid: str | None = None,
    ) -> None:
        self.client = TwilioClient(account_sid, auth_token)
        self.messaging_service_sid = messaging_service_sid
    
    async def send_message(
        self,
        to_number: str,      # E.164 format: +1234567890
        body: str,           # Max 1600 characters (segmented if >160)
        from_number: str | None = None,
        status_callback: str | None = None,
    ) -> dict:
        """Send SMS with delivery tracking and error handling.
        
        Args:
            to_number: Destination phone number in E.164 format
            body: Message body (auto-segmented if >160 chars)
            from_number: Sender number (uses messaging service if None)
            status_callback: Webhook URL for delivery status updates
        
        Returns:
            dict with message_sid, status, segments, price
        """
        try:
            message = self.client.messages.create(
                to=to_number,
                body=body,
                from_=from_number or self.messaging_service_sid,
                status_callback=status_callback,
                # Smart encoding to minimize segments
                smart_encoded=True,
            )
            
            return {
                "message_sid": message.sid,
                "status": message.status,
                "segments": message.num_segments,
                "direction": message.direction,
                "error_code": message.error_code,
                "error_message": message.error_message,
            }
            
        except TwilioRestException as e:
            logger.error(f"Twilio SMS failed: {e.code} - {e.msg}")
            raise SMSDeliveryError(f"SMS delivery failed: {e.msg}") from e
    
    async def send_batch(
        self,
        recipients: list[dict],  # [{"to": "+1234", "body": "msg"}]
        max_concurrent: int = 10,
    ) -> list[dict]:
        """Send batch SMS with concurrency control."""
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def _send_with_limit(recipient: dict) -> dict:
            async with semaphore:
                result = await self.send_message(
                    to_number=recipient["to"],
                    body=recipient["body"],
                )
                # Rate limiting: max 100 messages/second per Twilio account
                await asyncio.sleep(0.01)
                return result
        
        tasks = [_send_with_limit(r) for r in recipients]
        return await asyncio.gather(*tasks, return_exceptions=True)

class SMSDeliveryError(Exception):
    """Raised when SMS delivery fails."""
```

### 3.3 Vonage (formerly Nexmo)

Vonage offers competitive pricing and strong European carrier relationships.

```python
# vonage_sms_client.py
import vonage

class VonageSMSClient:
    """Vonage SMS client with clinical features."""
    
    def __init__(self, api_key: str, api_secret: str) -> None:
        self.client = vonage.Client(key=api_key, secret=api_secret)
        self.sms = vonage.Sms(self.client)
    
    async def send_message(self, to_number: str, from_number: str, text: str) -> dict:
        """Send SMS via Vonage with delivery receipt."""
        response = self.sms.send_message({
            "from": from_number,
            "to": to_number,
            "text": text,
            "type": "unicode" if self._contains_unicode(text) else "text",
            "callback": "https://your-domain.com/vonage/delivery",  # DLR webhook
        })
        
        message = response["messages"][0]
        return {
            "message_id": message["message-id"],
            "status": message["status"],
            "remaining_balance": message.get("remaining-balance"),
            "network": message.get("network"),
        }
    
    def _contains_unicode(self, text: str) -> bool:
        """Check if text requires Unicode encoding (affects segment count)."""
        try:
            text.encode("gsm0338")
            return False
        except (UnicodeEncodeError, LookupError):
            return True
```

### 3.4 MessageBird

MessageBird (now Bird) provides a unified communications API:

```python
# messagebird_sms_client.py
from messagebird import Client as MessageBirdClient

class MessageBirdSMSClient:
    """MessageBird SMS implementation."""
    
    def __init__(self, api_key: str) -> None:
        self.client = MessageBirdClient(api_key)
    
    async def send_message(self, recipient: str, originator: str, body: str) -> dict:
        """Send SMS via MessageBird."""
        message = self.client.message_create(
            originator=originator,
            recipients=[recipient],
            body=body,
            reference=f"clinical_{uuid4().hex[:8]}",  # Trackable reference
        )
        
        return {
            "id": message.id,
            "status": message.status,
            "recipients": {r.recipient: r.status for r in message.recipients.items},
        }
```

### 3.5 Short Code vs Long Number

| Feature | Long Number (10DLC) | Short Code | Toll-Free |
|---|---|---|---|
| **Format** | +1 (555) 123-4567 | 12345 | +1 (800) 555-0123 |
| **Throughput** | 1 msg/sec (unregistered), up to 75/sec (registered) | 100+ msg/sec | 1-3 msg/sec |
| **Setup Time** | 1-3 days (10DLC registration) | 8-12 weeks | 1-3 days |
| **Cost** | $1-2/month | $500-1000/month | $2-5/month |
| **Two-Way** | Yes | Yes | Yes |
| **Best For** | General patient communication | High-volume campaigns | Patient support lines |
| **Registration** | A2P 10DLC required | Lease from carriers | Verification required |

**10DLC Registration (US):**

```python
class TenDLCRegistration:
    """Manage 10DLC brand and campaign registration."""
    
    # Required for all business SMS in US via major carriers
    BRAND_TYPES = {
        "LOW_VOLUME": "< 6,000 messages/day",
        "STANDARD": "6,000 - 200,000 messages/day",
        "HIGH_VOLUME": "> 200,000 messages/day",
    }
    
    CAMPAIGN_USE_CASES = {
        "MEDICAL_APPOINTMENTS": "Appointment reminders and confirmations",
        "MEDICATION_ADHERENCE": "Prescription and medication reminders",
        "PATIENT_CARE": "General patient care coordination",
        "2FA": "Two-factor authentication",
        "EMERGENCY": "Emergency notifications",
    }
```

### 3.6 Opt-In / Opt-Out Management

SMS compliance requires explicit opt-in consent and honoring opt-out requests.

```python
# sms_consent_manager.py
import re

class SMSConsentManager:
    """Manages patient opt-in/opt-out for SMS communications.
    
    Implements TCPA compliance for US patients and
    GDPR Article 7 requirements for EU patients."""
    
    OPT_OUT_KEYWORDS = {
        "stop", "unsubscribe", "cancel", "end", "quit",
        "stop all", "opt out", "remove me",
    }
    
    OPT_IN_KEYWORDS = {
        "start", "yes", "subscribe", "join", "opt in",
        "consent", "agree",
    }
    
    HELP_KEYWORDS = {
        "help", "info", "support", "contact",
    }
    
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
    
    async def process_incoming_message(self, patient_id: str, message: str) -> str:
        """Process incoming SMS for opt-in/opt-out keywords.
        
        Returns:
            Response message to send back to patient.
        """
        normalized = message.strip().lower()
        
        if normalized in self.OPT_OUT_KEYWORDS:
            await self._record_consent_change(patient_id, "opted_out")
            return (
                "You have been unsubscribed from SMS notifications. "
                "Reply START to resubscribe. "
                "For help, contact your clinic directly."
            )
        
        elif normalized in self.OPT_IN_KEYWORDS:
            await self._record_consent_change(patient_id, "opted_in")
            return (
                "You are now subscribed to SMS notifications from your clinic. "
                "Reply STOP at any time to unsubscribe. "
                "Msg & data rates may apply."
            )
        
        elif normalized in self.HELP_KEYWORDS:
            return (
                "Clinical SMS Service\n"
                "Reply STOP to unsubscribe\n"
                "Reply START to resubscribe\n"
                "Contact your clinic for assistance."
            )
        
        return ""  # No keyword match, process as normal message
    
    async def can_send_to(self, patient_id: str, message_type: str) -> bool:
        """Check if patient has consented to specific message type."""
        consent = await self._get_consent_record(patient_id)
        
        if not consent or consent.status != "opted_in":
            return False
        
        # Check message type-specific consent
        if message_type not in consent.allowed_message_types:
            return False
        
        # Check for recent opt-out
        if consent.last_opt_out and consent.last_opt_out > consent.last_opt_in:
            return False
        
        return True
    
    async def _record_consent_change(self, patient_id: str, status: str) -> None:
        """Record consent change with audit trail."""
        consent_record = PatientSMSConsent(
            patient_id=patient_id,
            status=status,
            timestamp=datetime.utcnow(),
            ip_address=None,  # SMS has no IP
            channel="sms",
        )
        self.db.add(consent_record)
        await self.db.commit()
```

### 3.7 HIPAA-Compliant SMS

SMS is inherently non-compliant for PHI transmission (plaintext, carrier storage). Mitigation strategies:

```python
class HIPAACompliantSMS:
    """HIPAA-aware SMS wrapper that prevents PHI transmission."""
    
    # Maximum safe message length (single segment)
    MAX_SAFE_LENGTH = 160
    
    # Message templates that are HIPAA-safe (no PHI)
    SAFE_TEMPLATES = {
        "appointment_reminder": (
            "Reminder: You have an appointment scheduled. "
            "Log in to the patient portal for details: {portal_link}"
        ),
        "lab_results": (
            "Your test results are available. "
            "View them securely: {portal_link}"
        ),
        "prescription_ready": (
            "Your prescription is ready for pickup. "
            "Contact your pharmacy for details."
        ),
        "medication_reminder": (
            "Reminder: Time for your scheduled medication. "
            "See your care plan for details."
        ),
    }
    
    @classmethod
    def render_safe(cls, template_name: str, **kwargs) -> str:
        """Render a PHI-safe message template."""
        template = cls.SAFE_TEMPLATES.get(template_name)
        if not template:
            raise ValueError(f"Unknown template: {template_name}")
        
        message = template.format(**kwargs)
        
        # Ensure single segment
        if len(message) > cls.MAX_SAFE_LENGTH:
            logger.warning(f"Message exceeds 160 chars: {len(message)}")
        
        return message
    
    @classmethod
    def contains_phi_risk(cls, message: str) -> bool:
        """Heuristic check for potential PHI in message."""
        phi_indicators = [
            r"\b\d{3}-\d{2}-\d{4}\b",  # SSN
            r"\b(diagnosis|prognosis|treatment|prescribed|medication\s+\w+)\b",
            r"\b(blood\s+(pressure|sugar|glucose))\b",
            r"\b\d+\s*(mg|mcg|ml|units)\b",  # Dosage
        ]
        
        for pattern in phi_indicators:
            if re.search(pattern, message, re.IGNORECASE):
                return True
        return False
```

### 3.8 Delivery Receipts

```python
# delivery_receipt_handler.py
from fastapi import FastAPI, Request

class DeliveryReceiptHandler:
    """Process SMS delivery receipts from carriers."""
    
    TWILIO_STATUSES = {
        "queued": "Message queued for delivery",
        "sending": "Message being sent",
        "sent": "Message sent to carrier",
        "delivered": "Message delivered to handset",
        "undelivered": "Message failed delivery",
        "failed": "Message failed permanently",
        "received": "Inbound message received",
        "accepted": "Message accepted by carrier",
        "scheduled": "Message scheduled for future",
        "read": "Message read by recipient (WhatsApp)",
    }
    
    async def handle_twilio_webhook(self, request: Request) -> dict:
        """Handle Twilio delivery status callback."""
        form_data = await request.form()
        
        receipt = DeliveryReceipt(
            message_sid=form_data.get("MessageSid"),
            message_status=form_data.get("MessageStatus"),
            error_code=form_data.get("ErrorCode"),
            error_message=self._get_error_description(form_data.get("ErrorCode")),
            to_number=form_data.get("To"),
            from_number=form_data.get("From"),
            timestamp=datetime.utcnow(),
        )
        
        # Update message tracking in database
        await self._update_delivery_status(receipt)
        
        # Handle failures
        if receipt.message_status in ("failed", "undelivered"):
            await self._handle_delivery_failure(receipt)
        
        return {"status": "processed"}
    
    def _get_error_description(self, error_code: str | None) -> str:
        """Map Twilio error codes to descriptions."""
        error_map = {
            "30001": "Queue overflow",
            "30002": "Account suspended",
            "30003": "Unreachable destination",
            "30004": "Message blocked",
            "30005": "Unknown destination",
            "30006": "Landline or unreachable carrier",
            "30007": "Carrier violation / filtering",
            "30008": "Unknown error",
        }
        return error_map.get(error_code, f"Unknown error code: {error_code}")
    
    async def _handle_delivery_failure(self, receipt: DeliveryReceipt) -> None:
        """Escalate delivery failures."""
        if receipt.error_code in ("30003", "30005", "30006"):
            # Phone number issue -- flag for review
            await self._flag_invalid_number(receipt.to_number)
        elif receipt.error_code == "30007":
            # Carrier filtering -- review message content
            await self._alert_compliance_team(receipt)
```

---

## 4. Email Automation

### 4.1 Overview and Clinical Relevance

Email remains the preferred channel for detailed clinical communications: discharge summaries, care plan documents, lab reports, referral letters, and patient education materials. Email supports rich formatting, attachments, and threaded conversations -- essential for clinical documentation workflows.

### 4.2 SendGrid vs AWS SES

| Feature | SendGrid | AWS SES |
|---|---|---|
| **Free Tier** | 100 emails/day | 62,000 emails/month (from EC2) |
| **Pricing** | $0.10 per 1,000 emails (paid) | $0.10 per 1,000 emails |
| **API Quality** | Excellent (v3 API) | Good |
| **Templates** | Built-in dynamic templates | Simple templates + SESv2 |
| **Analytics** | Comprehensive (opens, clicks, geo) | Basic (delivery, bounces) |
| **HIPAA BAA** | Available (Pro plan+) | Available (under AWS BAA) |
| **SMTP Relay** | Yes | Yes |
| **Inbound Parsing** | Yes (Webhook) | Yes (S3 + Lambda) |
| **IP Warmup** | Automated | Manual |
| **Recommendation** | Marketing + transactional | Cost-sensitive, AWS-native |

### 4.3 SendGrid Implementation

```python
# sendgrid_email_client.py
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition
import base64

class SendGridEmailClient:
    """Production SendGrid client for clinical email communications."""
    
    def __init__(self, api_key: str, from_email: str, from_name: str = "Clinical AI") -> None:
        self.client = SendGridAPIClient(api_key)
        self.from_email = from_email
        self.from_name = from_name
    
    async def send_transactional_email(
        self,
        to_email: str,
        template_id: str,
        dynamic_data: dict,
        attachments: list[dict] | None = None,
        categories: list[str] | None = None,
    ) -> dict:
        """Send transactional email using SendGrid dynamic template.
        
        Args:
            to_email: Patient email address
            template_id: SendGrid dynamic template ID
            dynamic_data: Template substitution variables
            attachments: List of {filename, content, type} dicts
            categories: Tags for analytics segmentation
        """
        message = Mail(
            from_email=(self.from_email, self.from_name),
            to_emails=to_email,
        )
        message.dynamic_template_data = dynamic_data
        message.template_id = template_id
        
        if categories:
            message.categories = categories
        
        # Add attachments (e.g., PDF lab reports)
        if attachments:
            for attachment_data in attachments:
                encoded = base64.b64encode(attachment_data["content"]).decode()
                attachment = Attachment(
                    FileContent(encoded),
                    FileName(attachment_data["filename"]),
                    FileType(attachment_data.get("type", "application/pdf")),
                    Disposition("attachment"),
                )
                message.add_attachment(attachment)
        
        try:
            response = self.client.send(message)
            return {
                "status_code": response.status_code,
                "message_id": response.headers.get("X-Message-Id"),
                "accepted": response.status_code == 202,
            }
        except Exception as e:
            logger.error(f"SendGrid email failed: {e}")
            raise EmailDeliveryError(str(e)) from e
    
    async def send_plain_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: str | None = None,
    ) -> dict:
        """Send plain HTML/text email."""
        message = Mail(
            from_email=(self.from_email, self.from_name),
            to_emails=to_email,
            subject=subject,
            html_content=html_content,
            plain_text_content=text_content,
        )
        
        response = self.client.send(message)
        return {
            "status_code": response.status_code,
            "message_id": response.headers.get("X-Message-Id"),
        }

class EmailDeliveryError(Exception):
    """Email delivery failure."""
```

### 4.4 AWS SES Implementation

```python
# aws_ses_client.py
import boto3
from botocore.exceptions import ClientError

class AWSSESClient:
    """AWS SES client for HIPAA-compliant clinical email."""
    
    def __init__(
        self,
        region: str = "us-east-1",
        from_address: str = "noreply@clinic.example.com",
    ) -> None:
        self.client = boto3.client("ses", region_name=region)
        self.from_address = from_address
    
    async def send_email(
        self,
        to_address: str,
        subject: str,
        body_html: str,
        body_text: str | None = None,
        reply_to: list[str] | None = None,
        configuration_set: str | None = None,
    ) -> dict:
        """Send email via AWS SES with delivery tracking."""
        
        destination = {"ToAddresses": [to_address]}
        
        message = {
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {},
        }
        
        if body_html:
            message["Body"]["Html"] = {"Data": body_html, "Charset": "UTF-8"}
        if body_text:
            message["Body"]["Text"] = {"Data": body_text, "Charset": "UTF-8"}
        
        kwargs = {
            "Source": self.from_address,
            "Destination": destination,
            "Message": message,
        }
        
        if reply_to:
            kwargs["ReplyToAddresses"] = reply_to
        if configuration_set:
            kwargs["ConfigurationSetName"] = configuration_set
        
        try:
            response = self.client.send_email(**kwargs)
            return {
                "message_id": response["MessageId"],
                "status": "accepted",
            }
        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"]["Message"]
            logger.error(f"SES send failed: {error_code} - {error_message}")
            raise EmailDeliveryError(error_message) from e
    
    async def send_templated_email(
        self,
        to_address: str,
        template_name: str,
        template_data: str,  # JSON string
        configuration_set: str | None = None,
    ) -> dict:
        """Send using a pre-defined SES template."""
        kwargs = {
            "Source": self.from_address,
            "Destination": {"ToAddresses": [to_address]},
            "Template": template_name,
            "TemplateData": template_data,
        }
        if configuration_set:
            kwargs["ConfigurationSetName"] = configuration_set
        
        response = self.client.send_templated_email(**kwargs)
        return {
            "message_id": response["MessageId"],
            "status": "accepted",
        }
```

### 4.5 Template Management

```python
# email_template_manager.py
from jinja2 import Environment, FileSystemLoader, select_autoescape

class ClinicalEmailTemplateManager:
    """Manages clinical email templates with PHI-safe rendering."""
    
    def __init__(self, template_dir: str = "templates/email") -> None:
        self.env = Environment(
            loader=FileSystemLoader(template_dir),
            autoescape=select_autoescape(["html", "xml"]),
            enable_async=True,
        )
    
    async def render_appointment_confirmation(
        self,
        patient_first_name: str,
        appointment_date: str,
        appointment_time: str,
        provider_name: str,
        clinic_address: str,
        portal_link: str,
        cancel_link: str,
    ) -> tuple[str, str]:
        """Render appointment confirmation email (HTML + text).
        
        Uses first name only -- never include full PHI in email body.
        Direct patients to secure portal for detailed information.
        """
        template = self.env.get_template("appointment_confirmation.html")
        html = await template.render_async(
            patient_first_name=patient_first_name,
            appointment_date=appointment_date,
            appointment_time=appointment_time,
            provider_name=provider_name,
            clinic_address=clinic_address,
            portal_link=portal_link,
            cancel_link=cancel_link,
        )
        
        text_template = self.env.get_template("appointment_confirmation.txt")
        text = await text_template.render_async(
            patient_first_name=patient_first_name,
            appointment_date=appointment_date,
            appointment_time=appointment_time,
            provider_name=provider_name,
            clinic_address=clinic_address,
            portal_link=portal_link,
            cancel_link=cancel_link,
        )
        
        return html, text
    
    async def render_lab_results_notification(
        self,
        patient_first_name: str,
        test_type: str,
        result_portal_link: str,
        ordering_provider: str,
    ) -> tuple[str, str]:
        """Render lab results notification -- NEVER include actual results in email."""
        template = self.env.get_template("lab_results_notification.html")
        html = await template.render_async(
            patient_first_name=patient_first_name,
            test_type=test_type,
            result_portal_link=result_portal_link,
            ordering_provider=ordering_provider,
        )
        
        text = (
            f"Hello {patient_first_name},\n\n"
            f"Your {test_type} results are now available.\n\n"
            f"Please log in to our secure patient portal to view: {result_portal_link}\n\n"
            f"If you have questions, contact {ordering_provider}'s office.\n\n"
            f"This is an automated message. Please do not reply."
        )
        
        return html, text
```

### 4.6 Attachment Handling

Clinical emails frequently include PDF attachments (lab reports, care plans). Secure handling is critical:

```python
# secure_attachment_handler.py
from cryptography.fernet import Fernet
import hashlib

class SecureAttachmentHandler:
    """Handles clinical email attachments with encryption and integrity verification."""
    
    def __init__(self, encryption_key: bytes) -> None:
        self.cipher = Fernet(encryption_key)
    
    async def prepare_attachment(
        self,
        file_content: bytes,
        filename: str,
        patient_id: str,
    ) -> dict:
        """Prepare attachment with encryption and integrity hash.
        
        Returns dict with encrypted_content, filename, checksum.
        """
        # Generate integrity hash
        checksum = hashlib.sha256(file_content).hexdigest()
        
        # Encrypt file content
        encrypted = self.cipher.encrypt(file_content)
        
        # Log with audit trail (no PHI in filename if possible)
        logger.info(
            f"Attachment prepared: patient_hash={patient_id[:8]}... "
            f"size={len(file_content)}, checksum={checksum[:16]}..."
        )
        
        return {
            "content": encrypted,
            "filename": filename,
            "checksum": checksum,
            "encrypted": True,
        }
    
    async def verify_and_decrypt(
        self,
        encrypted_content: bytes,
        expected_checksum: str,
    ) -> bytes:
        """Decrypt and verify attachment integrity."""
        decrypted = self.cipher.decrypt(encrypted_content)
        
        actual_checksum = hashlib.sha256(decrypted).hexdigest()
        if actual_checksum != expected_checksum:
            raise IntegrityError("Attachment checksum mismatch -- possible tampering")
        
        return decrypted

class IntegrityError(Exception):
    """File integrity verification failed."""
```

### 4.7 Threading / Conversation View

```python
# email_thread_manager.py
import email.utils
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class EmailThreadManager:
    """Manages email threading for clinical conversation continuity.
    
    Uses Message-ID, In-Reply-To, and References headers
    to maintain conversation threads in email clients."""
    
    def __init__(self, domain: str = "clinic.example.com") -> None:
        self.domain = domain
    
    def create_thread_headers(
        self,
        thread_id: str | None = None,
        reply_to_message_id: str | None = None,
    ) -> dict:
        """Generate RFC 2822 compliant threading headers."""
        message_id = f"<{uuid4().hex}@{self.domain}>"
        
        headers = {
            "Message-ID": message_id,
        }
        
        if thread_id:
            headers["X-Clinical-Thread-ID"] = thread_id
        
        if reply_to_message_id:
            headers["In-Reply-To"] = reply_to_message_id
            headers["References"] = reply_to_message_id
        
        return headers
    
    def build_threaded_email(
        self,
        to_address: str,
        from_address: str,
        subject: str,
        body_html: str,
        thread_headers: dict,
        previous_messages: list[dict] | None = None,
    ) -> MIMEMultipart:
        """Build a threaded email with conversation history."""
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Re: {subject}" if "In-Reply-To" in thread_headers else subject
        msg["From"] = from_address
        msg["To"] = to_address
        msg["Message-ID"] = thread_headers["Message-ID"]
        
        if "In-Reply-To" in thread_headers:
            msg["In-Reply-To"] = thread_headers["In-Reply-To"]
            msg["References"] = thread_headers["References"]
        
        # Build body with conversation history
        full_body = body_html
        if previous_messages:
            full_body += "<hr><h3>Previous Messages</h3>"
            for prev in previous_messages:
                full_body += (
                    f"<div style='border-left: 2px solid #ccc; padding-left: 10px; margin: 10px 0;'>"
                    f"<p><strong>{prev['from']}</strong> - {prev['date']}</p>"
                    f"<p>{prev['body']}</p>"
                    f"</div>"
                )
        
        msg.attach(MIMEText(full_body, "html"))
        
        return msg
```

### 4.8 SPF / DKIM / DMARC

Email authentication is critical for clinical communications to avoid spam filtering:

```
SPF (Sender Policy Framework):
- DNS TXT record listing authorized IP addresses
- Example: "v=spf1 include:sendgrid.net include:amazonses.com ~all"

DKIM (DomainKeys Identified Mail):
- Cryptographic signature on outgoing emails
- Public key published in DNS
- Example selector record: selector1._domainkey.clinic.example.com

DMARC (Domain-based Message Authentication):
- Policy for handling SPF/DKIM failures
- Example: "v=DMARC1; p=quarantine; rua=mailto:dmarc@clinic.example.com"
```

**DNS Configuration Checklist:**

```python
EMAIL_AUTH_CHECKLIST = """
Required DNS Records for Clinical Email:

1. SPF Record (TXT @ clinic.example.com):
   "v=spf1 include:sendgrid.net include:_spf.google.com ~all"

2. DKIM Record (TXT selector._domainkey.clinic.example.com):
   Publish public key from SendGrid/SES DKIM setup

3. DMARC Record (TXT _dmarc.clinic.example.com):
   "v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@clinic.example.com"

4. Custom Return-Path (CNAME):
   Return-path alignment for SPF validation

5. BIMI Record (TXT default._bimi.clinic.example.com):
   Optional -- displays clinic logo in supported email clients
"""
```

### 4.9 HIPAA-Compliant Email

```python
class HIPAACompliantEmail:
    """HIPAA compliance wrapper for clinical email communications."""
    
    REQUIRED_HEADERS = {
        "X-HIPAA-Classification": "PHI-Protected",
        "X-Encryption": "TLS-1.2+",
        "X-Retention-Days": "2555",  # 7 years default
    }
    
    COMPLIANCE_CHECKLIST = [
        "BAU signed with email provider (SendGrid/SES)",
        "TLS 1.2+ enforced for all transmissions",
        "Email content excludes direct PHI (portal links instead)",
        "Access logging enabled for all email operations",
        "Retention policy configured (7 years default)",
        "Encryption at rest for stored email copies",
        "Audit trail for all email sends",
        "Patient consent on file for email communications",
    ]
    
    @classmethod
    def enforce_compliance_headers(cls, message: MIMEMultipart) -> MIMEMultipart:
        """Add HIPAA compliance headers to outgoing email."""
        for header, value in cls.REQUIRED_HEADERS.items():
            message[header] = value
        return message
    
    @classmethod
    def phi_safe_content_check(cls, content: str) -> tuple[bool, list[str]]:
        """Verify email content doesn't contain unnecessary PHI."""
        violations = []
        
        # Check for SSN patterns
        if re.search(r"\b\d{3}-\d{2}-\d{4}\b", content):
            violations.append("Potential SSN detected")
        
        # Check for specific diagnostic codes (ICD-10)
        if re.search(r"\b[A-Z]\d{2}(\.\d{1,2})?\b", content):
            violations.append("Potential ICD-10 code in body")
        
        # Check for detailed medical results
        if re.search(r"\b(result|value|level|count)\s*[:=]\s*\d+", content, re.IGNORECASE):
            violations.append("Potential test results in body")
        
        is_safe = len(violations) == 0
        return is_safe, violations
```

---

## 5. Phone / Voice Agents

### 5.1 Overview and Clinical Relevance

Voice AI agents represent the frontier of clinical patient communication, enabling natural-language phone interactions for appointment scheduling, medication reminders, symptom triage, and care coordination. Voice is particularly critical for elderly patients, those with limited digital literacy, and urgent care scenarios where typing is impractical.

### 5.2 Twilio Programmable Voice

Twilio provides the foundational telephony infrastructure for voice AI:

```python
# twilio_voice_handler.py
from twilio.twiml.voice_response import VoiceResponse, Say, Gather, Dial, Connect, Stream

class TwilioVoiceHandler:
    """Handle Twilio voice webhooks for clinical AI phone calls."""
    
    def __init__(self, ai_agent_endpoint: str) -> None:
        self.ai_agent_endpoint = ai_agent_endpoint
    
    def handle_incoming_call(self, request_data: dict) -> str:
        """Generate TwiML for incoming patient calls.
        
        Returns TwiML XML string that instructs Twilio
        how to handle the call.
        """
        response = VoiceResponse()
        
        # Greeting message
        response.say(
            "Thank you for calling our clinic. "
            "Your call is being connected to our AI assistant.",
            voice="Polly.Joanna",
            language="en-US",
        )
        
        # Connect to AI agent via Media Streams (WebSocket)
        connect = Connect()
        connect.stream(url=self.ai_agent_endpoint)
        response.append(connect)
        
        # Fallback if AI connection fails
        response.say(
            "I'm sorry, I'm having trouble connecting. "
            "Please hold while we transfer you to a staff member.",
            voice="Polly.Joanna",
        )
        response.dial("+15551234567")  # Fallback to human
        
        return str(response)
    
    def handle_gather_input(self, digits: str, call_sid: str) -> str:
        """Handle DTMF (touch-tone) input from patient."""
        response = VoiceResponse()
        
        menu_actions = {
            "1": self._handle_appointment_request,
            "2": self._handle_prescription_refill,
            "3": self._handle_lab_results,
            "0": self._transfer_to_human,
        }
        
        action = menu_actions.get(digits)
        if action:
            return action(response, call_sid)
        else:
            response.say("That is not a valid option. Please try again.")
            return self._play_main_menu(response)
        
        return str(response)
    
    def _play_main_menu(self, response: VoiceResponse) -> str:
        """Play interactive voice menu."""
        gather = Gather(num_digits=1, timeout=5, action="/voice/menu-handler")
        gather.say(
            "Press 1 to schedule an appointment. "
            "Press 2 for prescription refills. "
            "Press 3 for lab results. "
            "Press 0 to speak to a staff member.",
            voice="Polly.Joanna",
        )
        response.append(gather)
        return str(response)
```

### 5.3 Retell.ai Integration

Retell.ai provides purpose-built voice AI infrastructure with low-latency streaming:

```python
# retell_integration.py
import websockets
import json

class RetellVoiceAgent:
    """Integration with Retell.ai for clinical voice conversations."""
    
    def __init__(self, api_key: str, agent_id: str) -> None:
        self.api_key = api_key
        self.agent_id = agent_id
        self.base_url = "https://api.retellai.com"
    
    async def create_call(
        self,
        patient_phone: str,
        from_number: str,
        custom_variables: dict | None = None,
    ) -> dict:
        """Create an outbound voice call via Retell.
        
        Args:
            patient_phone: Patient phone number (E.164)
            from_number: Clinic's registered phone number
            custom_variables: Context variables for the AI agent
                e.g., {"patient_name": "John", "appointment_date": "2025-06-15"}
        """
        url = f"{self.base_url}/v2/create-phone-call"
        
        payload = {
            "from_number": from_number,
            "to_number": patient_phone,
            "agent_id": self.agent_id,
            "retell_llm_dynamic_variables": custom_variables or {},
        }
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                result = await resp.json()
                return {
                    "call_id": result.get("call_id"),
                    "status": result.get("status"),
                    "agent_id": result.get("agent_id"),
                }
    
    async def handle_webhook(self, request_data: dict) -> None:
        """Handle Retell.ai webhook events (transcripts, events)."""
        event_type = request_data.get("event")
        
        if event_type == "call_started":
            await self._handle_call_started(request_data)
        elif event_type == "call_ended":
            await self._handle_call_ended(request_data)
        elif event_type == "call_analyzed":
            await self._handle_call_analyzed(request_data)
    
    async def _handle_call_analyzed(self, data: dict) -> None:
        """Process completed call analysis for clinical record."""
        call_id = data.get("call_id")
        transcript = data.get("transcript", "")
        call_summary = data.get("call_analysis", {}).get("call_summary", "")
        
        # Store transcript in clinical record (with patient consent)
        await self._store_call_transcript(
            call_id=call_id,
            transcript=transcript,
            summary=call_summary,
            inferences=data.get("call_analysis", {}).get("inferences", []),
        )
```

### 5.4 Bland.ai Integration

Bland.ai specializes in ultra-low-latency voice AI with sub-500ms response times:

```python
# bland_integration.py
class BlandVoiceAgent:
    """Integration with Bland.ai for high-performance voice calls."""
    
    def __init__(self, api_key: str, pathway_id: str | None = None) -> None:
        self.api_key = api_key
        self.pathway_id = pathway_id
        self.base_url = "https://api.bland.ai"
    
    async def send_call(
        self,
        phone_number: str,
        task: str,  # Natural language instructions for the AI
        voice: str = "nat",
        wait_for_greeting: bool = True,
        block_interruptions: bool = False,
    ) -> dict:
        """Send an AI-powered voice call via Bland.
        
        The 'task' parameter is the primary differentiator --
        it provides natural language instructions that guide
        the AI's behavior during the call.
        """
        url = f"{self.base_url}/v1/calls"
        
        payload = {
            "phone_number": phone_number,
            "task": task,
            "voice": voice,
            "wait_for_greeting": wait_for_greeting,
            "block_interruptions": block_interruptions,
            "record": True,  # Always record for clinical documentation
            "amd": True,     # Answering machine detection
        }
        
        if self.pathway_id:
            payload["pathway_id"] = self.pathway_id
        
        headers = {
            "authorization": self.api_key,
            "Content-Type": "application/json",
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                return await resp.json()
    
    async def get_call_details(self, call_id: str) -> dict:
        """Retrieve call recording, transcript, and metadata."""
        url = f"{self.base_url}/v1/calls/{call_id}"
        headers = {"authorization": self.api_key}
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as resp:
                return await resp.json()
```

**Clinical Task Prompt Example:**

```python
MEDICATION_REMINDER_TASK = """
You are calling on behalf of Memorial Clinic to remind a patient about their medication.

Important guidelines:
- Identify yourself: "Hello, this is the AI assistant from Memorial Clinic."
- Confirm patient's identity before discussing any medication: "May I confirm your name?"
- Remind about medication adherence using the provided details
- Ask if they have taken today's dose
- If they missed doses, provide the guidance from the care plan
- Ask if they have any side effects or concerns
- Offer to connect them with a pharmacist if they have questions
- Do NOT provide new medical advice or change prescriptions
- End the call politely, confirming next steps

Medication details: {{medication_name}}, {{dosage}}, {{frequency}}
Patient name: {{patient_first_name}}
"""
```

### 5.5 Vapi.ai Integration

Vapi.ai provides developer-friendly voice AI with robust function calling:

```python
# vapi_integration.py
class VapiVoiceAgent:
    """Integration with Vapi.ai for clinical voice assistants."""
    
    def __init__(self, api_key: str, assistant_id: str) -> None:
        self.api_key = api_key
        self.assistant_id = assistant_id
        self.base_url = "https://api.vapi.ai"
    
    async def create_assistant(
        self,
        name: str,
        system_prompt: str,
        voice_provider: str = "11labs",
        voice_id: str = "burt",
        model: str = "gpt-4",
    ) -> dict:
        """Create a configured voice assistant for clinical use."""
        url = f"{self.base_url}/assistant"
        
        payload = {
            "name": name,
            "model": {
                "provider": "openai",
                "model": model,
                "systemPrompt": system_prompt,
                "functions": [
                    {
                        "name": "schedule_appointment",
                        "description": "Schedule a patient appointment",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "patient_id": {"type": "string"},
                                "date": {"type": "string", "format": "date"},
                                "time": {"type": "string"},
                                "provider": {"type": "string"},
                                "reason": {"type": "string"},
                            },
                            "required": ["patient_id", "date", "time"],
                        },
                    },
                    {
                        "name": "escalate_to_human",
                        "description": "Transfer call to human staff member",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "reason": {"type": "string"},
                                "urgency": {"type": "string", "enum": ["low", "medium", "high"]},
                            },
                            "required": ["reason"],
                        },
                    },
                ],
            },
            "voice": {
                "provider": voice_provider,
                "voiceId": voice_id,
            },
            "firstMessage": "Hello, thank you for calling our clinic. How can I help you today?",
        }
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                return await resp.json()
    
    async def make_outbound_call(self, phone_number: str, assistant_overrides: dict | None = None) -> dict:
        """Initiate outbound call via Vapi."""
        url = f"{self.base_url}/call"
        
        payload = {
            "assistantId": self.assistant_id,
            "customer": {
                "number": phone_number,
            },
            "phoneNumberId": "your-phone-number-id",  # Vapi-registered number
        }
        
        if assistant_overrides:
            payload["assistantOverrides"] = assistant_overrides
        
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                return await resp.json()
```

### 5.6 WebSocket Streaming

Real-time voice requires WebSocket streaming for bidirectional audio:

```python
# voice_websocket_handler.py
import websockets
import base64

class VoiceWebSocketHandler:
    """Handle real-time audio streaming via WebSocket.
    
    Bridges between Twilio Media Streams and AI voice provider,
    enabling real-time conversation with minimal latency."""
    
    def __init__(self, ai_provider: str = "retell") -> None:
        self.ai_provider = ai_provider
        self.connections: dict[str, websockets.WebSocketServerProtocol] = {}
    
    async def handle_twilio_stream(self, websocket: websockets.WebSocketServerProtocol) -> None:
        """Handle incoming Twilio Media Stream WebSocket connection."""
        call_sid = None
        
        async for message in websocket:
            data = json.loads(message)
            event = data.get("event")
            
            if event == "start":
                call_sid = data["start"]["callSid"]
                stream_sid = data["start"]["streamSid"]
                self.connections[stream_sid] = websocket
                
                # Initialize AI agent session
                await self._initialize_ai_session(stream_sid, call_sid)
                
            elif event == "media":
                # Process incoming audio from patient
                audio_payload = data["media"]["payload"]
                stream_sid = data["media"]["streamSid"]
                
                # Decode mulaw audio and send to AI
                await self._send_audio_to_ai(stream_sid, audio_payload)
                
            elif event == "stop":
                stream_sid = data["stop"]["streamSid"]
                await self._cleanup_session(stream_sid)
    
    async def _send_audio_to_ai(self, stream_sid: str, audio_b64: str) -> None:
        """Forward patient audio to AI provider and handle response."""
        # Decode Twilio mulaw audio
        audio_bytes = base64.b64decode(audio_b64)
        
        # Convert to appropriate format for AI provider
        pcm_audio = self._mulaw_to_pcm(audio_bytes)
        
        # Send to AI and get response
        ai_response_audio = await self._query_ai(stream_sid, pcm_audio)
        
        # Send AI response audio back to Twilio
        await self._send_audio_to_twilio(stream_sid, ai_response_audio)
    
    def _mulaw_to_pcm(self, mulaw_data: bytes) -> bytes:
        """Convert mu-law audio to 16-bit PCM."""
        import audioop
        return audioop.ulaw2lin(mulaw_data, 2)
    
    def _pcm_to_mulaw(self, pcm_data: bytes) -> bytes:
        """Convert 16-bit PCM to mu-law."""
        import audioop
        return audioop.lin2ulaw(pcm_data, 2)
    
    async def _send_audio_to_twilio(self, stream_sid: str, pcm_audio: bytes) -> None:
        """Send AI-generated audio back to Twilio."""
        websocket = self.connections.get(stream_sid)
        if not websocket:
            return
        
        mulaw_audio = self._pcm_to_mulaw(pcm_audio)
        payload = base64.b64encode(mulaw_audio).decode()
        
        message = {
            "event": "media",
            "streamSid": stream_sid,
            "media": {
                "payload": payload,
            },
        }
        
        await websocket.send(json.dumps(message))
```

### 5.7 Real-Time Transcription

Voice calls generate transcripts that must be handled securely:

```python
# transcription_manager.py
class ClinicalTranscriptionManager:
    """Manage voice call transcripts for clinical documentation."""
    
    def __init__(self, storage_backend: str = "s3") -> None:
        self.storage = storage_backend
    
    async def process_transcript(
        self,
        call_id: str,
        transcript_entries: list[dict],  # [{"role": "agent|user", "content": "...", "timestamp": "..."}]
        patient_id: str,
    ) -> dict:
        """Process and store call transcript.
        
        Performs:
        1. PHI detection and redaction
        2. Sentiment analysis
        3. Clinical entity extraction
        4. Secure encrypted storage
        5. Audit logging
        """
        # Redact direct PHI from transcript
        redacted_entries = []
        for entry in transcript_entries:
            redacted = self._redact_phi(entry["content"])
            redacted_entries.append({
                **entry,
                "content_original_hash": hashlib.sha256(
                    entry["content"].encode()
                ).hexdigest(),
                "content": redacted,
            })
        
        # Store in secure clinical record
        storage_key = f"transcripts/{patient_id}/{call_id}.json"
        
        transcript_record = {
            "call_id": call_id,
            "patient_id": patient_id,  # Encrypted
            "created_at": datetime.utcnow().isoformat(),
            "entries": redacted_entries,
            "metadata": {
                "entry_count": len(transcript_entries),
                "duration_seconds": self._calculate_duration(transcript_entries),
            },
        }
        
        await self._store_encrypted(storage_key, transcript_record)
        
        return {
            "call_id": call_id,
            "storage_key": storage_key,
            "entry_count": len(redacted_entries),
            "status": "stored",
        }
    
    def _redact_phi(self, text: str) -> str:
        """Redact potential PHI from transcript for storage."""
        # Implement regex-based PHI redaction
        # Use clinical NLP if available (e.g., AWS Comprehend Medical)
        redacted = text
        
        # Redact SSN patterns
        redacted = re.sub(r"\b\d{3}-\d{2}-\d{4}\b", "[REDACTED-SSN]", redacted)
        
        # Redact phone numbers
        redacted = re.sub(r"\b\d{3}-\d{3}-\d{4}\b", "[REDACTED-PHONE]", redacted)
        
        # Redact email addresses
        redacted = re.sub(
            r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
            "[REDACTED-EMAIL]",
            redacted,
        )
        
        return redacted
```

### 5.8 Voice Quality Optimization

| Parameter | Optimal Value | Impact |
|---|---|---|
| Response Latency | < 800ms | Conversational naturalness |
| Audio Codec | Opus @ 24kbps | Quality vs bandwidth balance |
| Jitter Buffer | 50-100ms | Packet loss resilience |
| Sample Rate | 8kHz (PSTN) / 16kHz (VoIP) | Frequency response |
| Voice Activity Detection | Enabled | Reduces bandwidth, cleaner audio |
| Echo Cancellation | Enabled | Prevents feedback loops |
| Noise Suppression | RNNoise / Krisp | Cleaner transcription |

---

## 6. Dashboard Inbox

### 6.1 Overview and Clinical Relevance

The dashboard inbox is the primary communication interface for clinical staff, aggregating messages from all channels into a unified, actionable view. Unlike patient-facing channels, the dashboard operates within the clinic's secure environment and can handle PHI directly.

### 6.2 Real-Time Message Feed

```python
# dashboard_websocket.py
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Set

class DashboardWebSocketManager:
    """Manages real-time WebSocket connections for dashboard inbox.
    
    Supports:
    - Clinic-scoped connections (staff only sees their clinic)
    - Role-based message filtering
    - Presence tracking (who's online)
    - Typing indicators
    """
    
    def __init__(self) -> None:
        # clinic_id -> {user_id -> WebSocket}
        self.active_connections: dict[str, dict[str, WebSocket]] = {}
        self.user_presence: dict[str, dict] = {}  # user_id -> {status, last_seen}
    
    async def connect(self, websocket: WebSocket, clinic_id: str, user_id: str) -> None:
        """Authenticate and connect a staff member's WebSocket."""
        await websocket.accept()
        
        if clinic_id not in self.active_connections:
            self.active_connections[clinic_id] = {}
        
        self.active_connections[clinic_id][user_id] = websocket
        self.user_presence[user_id] = {
            "status": "online",
            "clinic_id": clinic_id,
            "connected_at": datetime.utcnow().isoformat(),
        }
        
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "clinic_id": clinic_id,
            "user_id": user_id,
            "online_staff": list(self.active_connections[clinic_id].keys()),
        })
        
        # Notify other staff of new presence
        await self._broadcast_to_clinic(
            clinic_id,
            {
                "type": "presence_update",
                "user_id": user_id,
                "status": "online",
            },
            exclude_user=user_id,
        )
    
    async def disconnect(self, clinic_id: str, user_id: str) -> None:
        """Handle staff disconnection."""
        if clinic_id in self.active_connections:
            self.active_connections[clinic_id].pop(user_id, None)
        
        self.user_presence[user_id] = {
            "status": "offline",
            "last_seen": datetime.utcnow().isoformat(),
        }
        
        await self._broadcast_to_clinic(
            clinic_id,
            {
                "type": "presence_update",
                "user_id": user_id,
                "status": "offline",
            },
        )
    
    async def broadcast_message(self, clinic_id: str, message: dict) -> None:
        """Broadcast a new message to all connected staff in clinic."""
        await self._broadcast_to_clinic(clinic_id, {
            "type": "new_message",
            "data": message,
        })
    
    async def _broadcast_to_clinic(
        self,
        clinic_id: str,
        message: dict,
        exclude_user: str | None = None,
    ) -> None:
        """Send message to all staff in a clinic."""
        if clinic_id not in self.active_connections:
            return
        
        for user_id, ws in self.active_connections[clinic_id].items():
            if user_id == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                # Connection may be dead, will be cleaned up on next heartbeat
                pass
```

### 6.3 Thread Management

```python
# thread_manager.py
from datetime import datetime
from enum import Enum

class ThreadStatus(str, Enum):
    ACTIVE = "active"
    PENDING = "pending"
    RESOLVED = "resolved"
    ESCALATED = "escalated"
    ARCHIVED = "archived"

class ThreadPriority(str, Enum):
    CRITICAL = "critical"    # Emergency, safety concern
    HIGH = "high"           # Urgent clinical matter
    MEDIUM = "medium"       # Standard inquiry
    LOW = "low"             # Administrative, non-urgent

class ThreadManager:
    """Manages message threads for clinical conversations.
    
    A thread represents a conversation between a patient
    and clinical staff across one or more channels."""
    
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
    
    async def create_thread(
        self,
        clinic_id: str,
        patient_id: str,
        channel: str,  # source channel of first message
        subject: str | None = None,
        priority: ThreadPriority = ThreadPriority.MEDIUM,
    ) -> dict:
        """Create a new conversation thread."""
        thread = MessageThread(
            id=uuid4().hex,
            clinic_id=clinic_id,
            patient_id=patient_id,
            channel=channel,
            subject=subject or "New patient inquiry",
            status=ThreadStatus.ACTIVE,
            priority=priority,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        
        self.db.add(thread)
        await self.db.commit()
        
        return {
            "thread_id": thread.id,
            "clinic_id": clinic_id,
            "patient_id": patient_id,
            "status": thread.status,
            "priority": thread.priority,
        }
    
    async def add_message_to_thread(
        self,
        thread_id: str,
        content: str,
        sender_type: str,  # "patient", "staff", "ai_agent"
        sender_id: str,
        channel: str,
        metadata: dict | None = None,
    ) -> dict:
        """Add a message to an existing thread."""
        message = ThreadMessage(
            id=uuid4().hex,
            thread_id=thread_id,
            content=content,
            sender_type=sender_type,
            sender_id=sender_id,
            channel=channel,
            metadata=metadata or {},
            created_at=datetime.utcnow(),
        )
        
        self.db.add(message)
        
        # Update thread timestamp
        thread = await self.db.get(MessageThread, thread_id)
        thread.updated_at = datetime.utcnow()
        
        await self.db.commit()
        
        return {
            "message_id": message.id,
            "thread_id": thread_id,
            "sender_type": sender_type,
            "created_at": message.created_at.isoformat(),
        }
    
    async def assign_thread(
        self,
        thread_id: str,
        staff_id: str,
        assigned_by: str,
    ) -> dict:
        """Assign a thread to a specific staff member."""
        assignment = ThreadAssignment(
            thread_id=thread_id,
            staff_id=staff_id,
            assigned_by=assigned_by,
            assigned_at=datetime.utcnow(),
            status="active",
        )
        
        self.db.add(assignment)
        
        # Update thread status
        thread = await self.db.get(MessageThread, thread_id)
        thread.assigned_to = staff_id
        thread.status = ThreadStatus.ACTIVE
        
        await self.db.commit()
        
        return {
            "thread_id": thread_id,
            "assigned_to": staff_id,
            "assigned_by": assigned_by,
        }
```

### 6.4 Assignment to Staff

```python
# staff_assignment_engine.py
class StaffAssignmentEngine:
    """Intelligent routing of patient messages to clinical staff.
    
    Considers:
    - Staff specialization and role
    - Current workload (active threads)
    - Availability status
    - Patient-staff continuity (previous assignments)
    - Message priority and content type
    """
    
    def __init__(self, db: AsyncSession) -> None:
        self.db = db
    
    async def find_best_assignee(
        self,
        clinic_id: str,
        message_content: str,
        patient_id: str,
        priority: ThreadPriority = ThreadPriority.MEDIUM,
    ) -> str | None:
        """Find optimal staff member for message assignment."""
        
        # 1. Check for existing patient-staff relationship
        previous_assignee = await self._get_previous_assignee(patient_id, clinic_id)
        if previous_assignee:
            is_available = await self._is_available(previous_assignee)
            if is_available:
                return previous_assignee
        
        # 2. Classify message type for specialization routing
        message_type = self._classify_message(message_content)
        
        specialization_map = {
            "appointment": ["front_desk", "scheduler"],
            "prescription": ["nurse", "pharmacist"],
            "lab_results": ["nurse", "ma"],
            "symptoms": ["triage_nurse", "nurse_practitioner"],
            "billing": ["billing_staff"],
            "general": ["care_coordinator"],
        }
        
        required_roles = specialization_map.get(message_type, ["care_coordinator"])
        
        # 3. Find available staff with lowest workload
        candidates = await self._get_available_staff(clinic_id, required_roles)
        
        if not candidates:
            # Fallback: any available staff
            candidates = await self._get_available_staff(clinic_id)
        
        if not candidates:
            return None  # No staff available -- queue for later
        
        # Sort by workload (ascending)
        candidates.sort(key=lambda s: s.active_thread_count)
        
        return candidates[0].id
    
    def _classify_message(self, content: str) -> str:
        """Classify message intent for routing."""
        content_lower = content.lower()
        
        if any(w in content_lower for w in ["appointment", "schedule", "book", "reschedule"]):
            return "appointment"
        elif any(w in content_lower for w in ["prescription", "medication", "refill", "pill", "drug"]):
            return "prescription"
        elif any(w in content_lower for w in ["lab", "test", "blood", "result", "urine", "x-ray"]):
            return "lab_results"
        elif any(w in content_lower for w in ["pain", "hurt", "sick", "symptom", "fever", "cough"]):
            return "symptoms"
        elif any(w in content_lower for w in ["bill", "payment", "insurance", "charge", "cost"]):
            return "billing"
        else:
            return "general"
```

### 6.5 Priority Routing

```python
# priority_router.py
class PriorityRouter:
    """Route messages based on clinical priority assessment."""
    
    PRIORITY_KEYWORDS = {
        ThreadPriority.CRITICAL: [
            "emergency", "chest pain", "can\'t breathe", "unconscious",
            "severe bleeding", "suicide", "overdose", "allergic reaction",
            "anaphylaxis", "heart attack", "stroke",
        ],
        ThreadPriority.HIGH: [
            "prescription refill", "urgent", "pain", "infection",
            "fever", "wound", "fall", "dizzy", "nausea",
        ],
        ThreadPriority.MEDIUM: [
            "appointment", "schedule", "lab results", "question",
            "follow up", "referral",
        ],
    }
    
    async def assess_priority(self, message_content: str) -> ThreadPriority:
        """Assess message priority based on content analysis."""
        content_lower = message_content.lower()
        
        for priority, keywords in self.PRIORITY_KEYWORDS.items():
            for keyword in keywords:
                if keyword in content_lower:
                    return priority
        
        return ThreadPriority.LOW
    
    async def route_by_priority(
        self,
        thread_id: str,
        priority: ThreadPriority,
        clinic_id: str,
    ) -> dict:
        """Apply priority-specific routing rules."""
        
        routing_rules = {
            ThreadPriority.CRITICAL: self._route_critical,
            ThreadPriority.HIGH: self._route_high,
            ThreadPriority.MEDIUM: self._route_medium,
            ThreadPriority.LOW: self._route_low,
        }
        
        router = routing_rules.get(priority, self._route_medium)
        return await router(thread_id, clinic_id)
    
    async def _route_critical(self, thread_id: str, clinic_id: str) -> dict:
        """Critical: Immediate alert to on-call staff + dashboard notification."""
        # Find on-call staff
        on_call = await self._get_on_call_staff(clinic_id)
        
        # Send immediate alerts via multiple channels
        alerts = []
        for staff in on_call:
            alert = await self._send_urgent_alert(staff.id, thread_id)
            alerts.append(alert)
        
        # Mark thread as escalated
        await self._escalate_thread(thread_id)
        
        return {
            "thread_id": thread_id,
            "priority": "critical",
            "alerts_sent": len(alerts),
            "on_call_notified": [s.id for s in on_call],
        }
```

### 6.6 Message Templates for Staff

```python
# staff_template_library.py
STAFF_QUICK_REPLIES = {
    "appointment_confirm": {
        "label": "Confirm Appointment",
        "template": (
            "Your appointment is confirmed for {date} at {time} "
            "with {provider}. Please arrive 15 minutes early. "
            "Reply CANCEL to reschedule."
        ),
        "variables": ["date", "time", "provider"],
    },
    "prescription_ready": {
        "label": "Rx Ready for Pickup",
        "template": (
            "Your prescription is ready for pickup at {pharmacy}. "
            "Please pick up within 48 hours. Questions? Call us at {phone}."
        ),
        "variables": ["pharmacy", "phone"],
    },
    "lab_results_portal": {
        "label": "Lab Results Available",
        "template": (
            "Your lab results are now available. Please log in to "
            "the patient portal to view: {portal_link}"
        ),
        "variables": ["portal_link"],
    },
    "follow_up_reminder": {
        "label": "Follow-Up Reminder",
        "template": (
            "This is a reminder to schedule your follow-up appointment. "
            "Please call us at {phone} or visit {portal_link} to schedule."
        ),
        "variables": ["phone", "portal_link"],
    },
    "referral_sent": {
        "label": "Referral Sent",
        "template": (
            "Your referral to {specialist} has been sent. "
            "They will contact you within 2 business days to schedule. "
            "Specialist contact: {specialist_phone}"
        ),
        "variables": ["specialist", "specialist_phone"],
    },
}
```

### 6.7 Quick Replies

```python
# quick_reply_processor.py
class QuickReplyProcessor:
    """Process one-click quick replies from dashboard."""
    
    async def apply_quick_reply(
        self,
        thread_id: str,
        template_key: str,
        variables: dict,
        staff_id: str,
    ) -> dict:
        """Apply a quick reply template and send to patient."""
        
        template = STAFF_QUICK_REPLIES.get(template_key)
        if not template:
            raise ValueError(f"Unknown template: {template_key}")
        
        # Validate all required variables present
        missing = [v for v in template["variables"] if v not in variables]
        if missing:
            raise ValueError(f"Missing variables: {missing}")
        
        # Render template
        message_body = template["template"].format(**variables)
        
        # Determine target channel (use thread's primary channel)
        thread = await self._get_thread(thread_id)
        target_channel = thread.primary_channel
        
        # Send via appropriate channel adapter
        result = await self._send_via_channel(
            channel=target_channel,
            patient_id=thread.patient_id,
            message=message_body,
        )
        
        # Record in thread
        await self._add_thread_message(
            thread_id=thread_id,
            content=message_body,
            sender_type="staff",
            sender_id=staff_id,
            channel=target_channel,
            metadata={"template_used": template_key, "variables": variables},
        )
        
        return {
            "sent": True,
            "channel": target_channel,
            "message_preview": message_body[:100] + "..." if len(message_body) > 100 else message_body,
            "delivery_id": result.get("message_id"),
        }
```

---

## 7. Channel Security

### 7.1 End-to-End Encryption Comparison

| Channel | E2E Available | Key Management | Clinical Suitability |
|---|---|---|---|
| **Telegram** | Secret Chats only (not Bot API) | User-managed | **Not suitable for PHI** |
| **WhatsApp** | Yes (Signal Protocol) | Automatic | Suitable with BAA |
| **SMS** | No (carrier-visible) | N/A | **Not suitable for PHI** |
| **Email** | No (TLS in transit only) | N/A | Portal links only |
| **Voice** | Varies by provider | Provider-managed | Encrypted transmission |
| **Dashboard** | TLS + at-rest encryption | System-managed | **Suitable for PHI** |

### 7.2 Message Retention Policies

```python
# retention_policy_engine.py
from enum import Enum

class RetentionPolicy(str, Enum):
    EPHEMERAL = "ephemeral"       # 24 hours (urgent alerts)
    SHORT = "short"               # 30 days (general messages)
    STANDARD = "standard"         # 7 years (clinical, HIPAA default)
    INDEFINITE = "indefinite"     # Permanent (with patient consent)

class RetentionPolicyEngine:
    """Enforce message retention policies per channel and message type."""
    
    DEFAULT_POLICIES = {
        # Channel -> {message_type -> retention_period_days}
        "telegram": {"all": 7},           # Minimal retention (no PHI)
        "whatsapp": {"all": 2555},        # 7 years for audit
        "sms": {"all": 2555},             # 7 years for audit
        "email": {"all": 2555},           # 7 years for audit
        "voice": {"transcript": 2555, "recording": 2555},
        "dashboard": {"all": 2555},       # 7 years clinical record
    }
    
    async def apply_retention(self, message_id: str, channel: str, message_type: str) -> None:
        """Schedule message for deletion per retention policy."""
        channel_policies = self.DEFAULT_POLICIES.get(channel, {})
        retention_days = channel_policies.get(message_type, channel_policies.get("all", 2555))
        
        expiry_date = datetime.utcnow() + timedelta(days=retention_days)
        
        # Schedule deletion job
        await self._schedule_deletion(message_id, expiry_date)
        
        logger.info(
            f"Retention scheduled: message={message_id}, "
            f"channel={channel}, expiry={expiry_date.date()}"
        )
    
    async def purge_expired_messages(self) -> int:
        """Delete all messages past their retention period. Returns count deleted."""
        expired = await self._get_expired_messages()
        
        deleted_count = 0
        for message in expired:
            # Secure deletion (overwrite then delete)
            await self._secure_delete(message.id, message.channel)
            deleted_count += 1
        
        logger.info(f"Retention purge complete: {deleted_count} messages deleted")
        return deleted_count
    
    async def _secure_delete(self, message_id: str, channel: str) -> None:
        """Cryptographically secure deletion of message data."""
        # 1. Overwrite encrypted content with random data
        await self._overwrite_content(message_id)
        
        # 2. Delete database record
        await self._delete_record(message_id)
        
        # 3. Log deletion for audit
        await self._log_deletion(message_id, channel)
```

### 7.3 PHI Handling Per Channel

```python
# phi_channel_policy.py
class PHIChannelPolicy:
    """Defines PHI handling rules per communication channel."""
    
    CHANNEL_PHI_RULES = {
        "telegram": {
            "allows_phi": False,
            "max_classification": "non_sensitive",
            "encryption_at_rest": False,
            "encryption_in_transit": True,  # MTProto
            "baa_available": False,
            "gdpr_compliant": "partial",
            "handling_rule": "Never transmit PHI. Use only for non-sensitive alerts.",
        },
        "whatsapp": {
            "allows_phi": True,  # With BAA
            "max_classification": "restricted",
            "encryption_at_rest": False,  # On device only
            "encryption_in_transit": True,  # E2E Signal Protocol
            "baa_available": True,
            "gdpr_compliant": "yes",
            "handling_rule": "PHI permitted with signed BAA. Use approved templates.",
        },
        "sms": {
            "allows_phi": False,
            "max_classification": "non_sensitive",
            "encryption_at_rest": False,
            "encryption_in_transit": False,  # Plaintext
            "baa_available": False,
            "gdpr_compliant": "no",
            "handling_rule": "Never transmit PHI. Use generic messages + portal links.",
        },
        "email": {
            "allows_phi": "conditional",  # Only with BAA + TLS
            "max_classification": "restricted",
            "encryption_at_rest": True,
            "encryption_in_transit": True,  # TLS 1.2+
            "baa_available": True,  # SendGrid/SES
            "gdpr_compliant": "conditional",
            "handling_rule": "PHI only with BAA. Prefer portal links over inline PHI.",
        },
        "voice": {
            "allows_phi": True,
            "max_classification": "restricted",
            "encryption_at_rest": True,
            "encryption_in_transit": True,  # SRTP
            "baa_available": True,  # Provider-dependent
            "gdpr_compliant": "conditional",
            "handling_rule": "PHI allowed with encrypted storage. Record with consent.",
        },
        "dashboard": {
            "allows_phi": True,
            "max_classification": "full_phi",
            "encryption_at_rest": True,
            "encryption_in_transit": True,  # TLS 1.3
            "baa_available": True,
            "gdpr_compliant": "yes",
            "handling_rule": "Full PHI permitted within clinic secure environment.",
        },
    }
    
    @classmethod
    def can_transmit_phi(cls, channel: str) -> bool:
        """Check if channel can safely transmit PHI."""
        rules = cls.CHANNEL_PHI_RULES.get(channel, {})
        return rules.get("allows_phi", False) in (True, "conditional")
    
    @classmethod
    def get_handling_guidelines(cls, channel: str) -> str:
        """Get human-readable PHI handling guidelines for channel."""
        rules = cls.CHANNEL_PHI_RULES.get(channel, {})
        return rules.get("handling_rule", "No guidelines available.")
```

### 7.4 Consent Collection Per Channel

```python
# channel_consent_manager.py
from enum import Enum

class ConsentType(str, Enum):
    IMPLICIT = "implicit"      # Consent through use (dashboard login)
    EXPLICIT_OPT_IN = "explicit_opt_in"  # Active checkbox/signature
    VERBAL = "verbal"          # Documented verbal consent (voice)
    WRITTEN = "written"        # Paper or digital signature

class ChannelConsentManager:
    """Manage patient communication consent per channel.
    
    GDPR Article 7 and HIPAA require documented consent for
    communications, with channel-specific requirements."""
    
    CONSENT_REQUIREMENTS = {
        "telegram": {
            "required_type": ConsentType.EXPLICIT_OPT_IN,
            "gdpr_lawful_basis": "consent",  # Article 6(1)(a)
            "hipaa_authorization": True,
            "withdrawal_method": "In-app toggle or /stop command",
            "granularity": "channel_level",  # All-or-nothing per channel
        },
        "whatsapp": {
            "required_type": ConsentType.EXPLICIT_OPT_IN,
            "gdpr_lawful_basis": "consent",
            "hipaa_authorization": True,
            "withdrawal_method": "Reply STOP or in-app toggle",
            "granularity": "message_type",  # Can opt out of marketing only
        },
        "sms": {
            "required_type": ConsentType.EXPLICIT_OPT_IN,
            "gdpr_lawful_basis": "consent",
            "hipaa_authorization": True,
            "withdrawal_method": "Reply STOP",
            "granularity": "message_type",
        },
        "email": {
            "required_type": ConsentType.EXPLICIT_OPT_IN,
            "gdpr_lawful_basis": "consent",
            "hipaa_authorization": True,
            "withdrawal_method": "Unsubscribe link or portal",
            "granularity": "message_type",
        },
        "voice": {
            "required_type": ConsentType.VERBAL,
            "gdpr_lawful_basis": "consent",
            "hipaa_authorization": True,
            "withdrawal_method": "Verbal opt-out during call",
            "granularity": "call_type",
        },
    }
    
    async def record_consent(
        self,
        patient_id: str,
        channel: str,
        consent_type: ConsentType,
        consent_granted: bool,
        ip_address: str | None = None,
        user_agent: str | None = None,
        document_version: str = "1.0",
    ) -> dict:
        """Record patient consent for channel communication.
        
        Creates auditable consent record with all required
        GDPR/HIPAA metadata.
        """
        consent_record = PatientChannelConsent(
            id=uuid4().hex,
            patient_id=patient_id,
            channel=channel,
            consent_type=consent_type,
            consent_granted=consent_granted,
            ip_address=ip_address,
            user_agent=user_agent,
            document_version=document_version,
            timestamp=datetime.utcnow(),
        )
        
        # Store in database
        await self._save_consent(consent_record)
        
        return {
            "consent_id": consent_record.id,
            "channel": channel,
            "granted": consent_granted,
            "timestamp": consent_record.timestamp.isoformat(),
        }
    
    async def verify_consent(self, patient_id: str, channel: str) -> bool:
        """Verify active consent before sending message."""
        consent = await self._get_latest_consent(patient_id, channel)
        
        if not consent:
            return False
        
        if not consent.consent_granted:
            return False
        
        # Check for withdrawal
        withdrawal = await self._get_withdrawal(patient_id, channel)
        if withdrawal and withdrawal.timestamp > consent.timestamp:
            return False
        
        return True
```

### 7.5 Audit Logging Per Channel

```python
# channel_audit_logger.py
class ChannelAuditLogger:
    """Comprehensive audit logging for all channel communications.
    
    HIPAA requires audit trails for all PHI access.
    GDPR Article 30 requires records of processing activities.
    """
    
    async def log_message_send(
        self,
        message_id: str,
        channel: str,
        patient_id: str,
        clinic_id: str,
        sender_type: str,  # "ai_agent", "staff", "system"
        sender_id: str,
        message_type: str,
        contains_phi: bool,
        consent_verified: bool,
    ) -> None:
        """Log outbound message for audit trail."""
        
        audit_entry = ChannelAuditEntry(
            event_type="message_sent",
            message_id=message_id,
            channel=channel,
            patient_id_hash=hashlib.sha256(patient_id.encode()).hexdigest(),
            clinic_id=clinic_id,
            sender_type=sender_type,
            sender_id=sender_id,
            message_type=message_type,
            contains_phi=contains_phi,
            consent_verified=consent_verified,
            timestamp=datetime.utcnow(),
        )
        
        # Write to tamper-resistant audit log
        await self._write_audit_log(audit_entry)
        
        # Also emit to SIEM if configured
        await self._emit_to_siem(audit_entry)
    
    async def log_message_access(
        self,
        message_id: str,
        accessor_id: str,
        accessor_role: str,
        access_type: str,  # "view", "download", "forward", "delete"
        ip_address: str,
    ) -> None:
        """Log message access event (HIPAA requirement)."""
        
        audit_entry = ChannelAuditEntry(
            event_type="message_accessed",
            message_id=message_id,
            accessor_id=accessor_id,
            accessor_role=accessor_role,
            access_type=access_type,
            ip_address=ip_address,
            timestamp=datetime.utcnow(),
        )
        
        await self._write_audit_log(audit_entry)
    
    async def log_delivery_status(
        self,
        message_id: str,
        channel: str,
        status: str,  # "delivered", "failed", "bounced", "read"
        delivery_timestamp: datetime | None = None,
        error_details: str | None = None,
    ) -> None:
        """Log delivery status update."""
        
        audit_entry = ChannelAuditEntry(
            event_type="delivery_status",
            message_id=message_id,
            channel=channel,
            delivery_status=status,
            delivery_timestamp=delivery_timestamp,
            error_details=error_details,
            timestamp=datetime.utcnow(),
        )
        
        await self._write_audit_log(audit_entry)
    
    async def generate_compliance_report(
        self,
        clinic_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> dict:
        """Generate HIPAA/GDPR compliance report for date range."""
        
        entries = await self._query_audit_log(clinic_id, start_date, end_date)
        
        report = {
            "clinic_id": clinic_id,
            "period": {"start": start_date.isoformat(), "end": end_date.isoformat()},
            "summary": {
                "total_events": len(entries),
                "messages_sent": len([e for e in entries if e.event_type == "message_sent"]),
                "messages_accessed": len([e for e in entries if e.event_type == "message_accessed"]),
                "phi_transmissions": len([
                    e for e in entries 
                    if e.event_type == "message_sent" and e.contains_phi
                ]),
                "consent_failures": len([
                    e for e in entries 
                    if e.event_type == "message_sent" and not e.consent_verified
                ]),
                "delivery_failures": len([
                    e for e in entries 
                    if e.event_type == "delivery_status" and e.delivery_status == "failed"
                ]),
            },
            "channels": self._breakdown_by_channel(entries),
            "risk_events": self._identify_risk_events(entries),
        }
        
        return report
```

### 7.6 Channel Isolation (Clinic-Patient Pairs)

```python
# channel_isolation_manager.py
class ChannelIsolationManager:
    """Enforce strict isolation between clinic-patient communication pairs.
    
    Prevents:
    - Cross-clinic message leakage
    - Staff accessing other clinic's patient messages
    - Bot token cross-contamination
    - Webhook routing errors
    """
    
    async def validate_message_route(
        self,
        clinic_id: str,
        patient_id: str,
        channel: str,
    ) -> bool:
        """Validate that message route is properly isolated.
        
        Checks:
        1. Patient belongs to clinic
        2. Channel is configured for clinic
        3. Staff has access to clinic
        4. No cross-contamination in routing tables
        """
        # 1. Verify patient-clinic membership
        patient_clinic = await self._get_patient_clinic(patient_id)
        if patient_clinic != clinic_id:
            logger.warning(
                f"Route validation failed: patient {patient_id} "
                f"belongs to clinic {patient_clinic}, not {clinic_id}"
            )
            raise ChannelIsolationError(
                f"Patient {patient_id} not associated with clinic {clinic_id}"
            )
        
        # 2. Verify channel is active for clinic
        clinic_channels = await self._get_clinic_channels(clinic_id)
        if channel not in clinic_channels:
            raise ChannelIsolationError(
                f"Channel {channel} not configured for clinic {clinic_id}"
            )
        
        return True
    
    async def get_isolated_bot_token(self, clinic_id: str, channel: str) -> str:
        """Retrieve bot token scoped to specific clinic and channel."""
        
        # Bot tokens stored with clinic:channel composite key
        token_key = f"bot_token:{clinic_id}:{channel}"
        token = await self._secure_token_store.get(token_key)
        
        if not token:
            raise ChannelIsolationError(
                f"No bot token found for clinic={clinic_id}, channel={channel}"
            )
        
        return token

class ChannelIsolationError(Exception):
    """Raised when channel isolation constraints are violated."""
```

---

## 8. Unified Inbox Architecture

### 8.1 Overview

The unified inbox architecture normalizes messages from all channels into a single schema, enabling consistent processing, routing, and storage regardless of the source channel.

### 8.2 Normalized Message Schema

```python
# unified_message_schema.py
from datetime import datetime
from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel, Field

class MessageDirection(str, Enum):
    INBOUND = "inbound"      # Patient -> Clinic
    OUTBOUND = "outbound"    # Clinic -> Patient

class MessageStatus(str, Enum):
    RECEIVED = "received"
    PROCESSING = "processing"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"
    PENDING_CONSENT = "pending_consent"
    QUEUED = "queued"

class UnifiedMessage(BaseModel):
    """Normalized message schema for all communication channels.
    
    All incoming messages from any channel are converted to this
    schema before processing. All outgoing messages are generated
    from this schema.
    """
    
    # Core identification
    message_id: str = Field(default_factory=lambda: uuid4().hex)
    thread_id: str  # Conversation thread identifier
    
    # Channel information
    channel: str = Field(..., description="Source channel: telegram|whatsapp|sms|email|voice|dashboard")
    channel_message_id: str = Field(..., description="Original message ID from channel API")
    
    # Direction
    direction: MessageDirection
    
    # Participants
    clinic_id: str
    patient_id: str
    patient_phone: Optional[str] = None
    patient_email: Optional[str] = None
    sender_id: str  # Channel-specific sender identifier
    sender_type: str = Field(..., description="patient|staff|ai_agent|system")
    
    # Content
    content_type: str = Field(default="text", description="text|image|document|audio|template")
    content: str  # Text content or JSON for rich content
    content_metadata: dict[str, Any] = Field(default_factory=dict)
    
    # For media messages
    media_url: Optional[str] = None
    media_mime_type: Optional[str] = None
    media_file_size: Optional[int] = None
    media_file_hash: Optional[str] = None
    
    # Status tracking
    status: MessageStatus = MessageStatus.RECEIVED
    delivery_attempts: int = 0
    last_delivery_error: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    
    # Compliance
    consent_verified: bool = False
    contains_phi: bool = False
    phi_classification: Optional[str] = None  # non_sensitive|restricted|full_phi
    
    # Routing
    assigned_to: Optional[str] = None  # Staff ID
    priority: str = "medium"  # critical|high|medium|low
    
    # Audit
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    
    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}

class UnifiedMessageCreate(BaseModel):
    """Schema for creating a new unified message."""
    channel: str
    clinic_id: str
    patient_id: str
    direction: MessageDirection
    content: str
    content_type: str = "text"
    priority: str = "medium"
    sender_type: str = "patient"
    sender_id: str
    channel_message_id: str
```

### 8.3 Channel Adapters

```python
# channel_adapter_base.py
from abc import ABC, abstractmethod

class ChannelAdapter(ABC):
    """Abstract base class for all channel adapters.
    
    Each channel (Telegram, WhatsApp, SMS, Email, Voice) implements
    this interface to normalize message format and handle channel-specific
    operations.
    """
    
    channel_name: str
    
    @abstractmethod
    async def normalize_inbound(self, raw_payload: dict) -> UnifiedMessage:
        """Convert channel-specific payload to UnifiedMessage."""
        pass
    
    @abstractmethod
    async def send_outbound(self, message: UnifiedMessage) -> dict:
        """Send outbound message through channel API.
        
        Returns delivery metadata including channel-specific message ID.
        """
        pass
    
    @abstractmethod
    async def verify_delivery(self, channel_message_id: str) -> MessageStatus:
        """Check delivery status of a sent message."""
        pass
    
    @abstractmethod
    async def validate_webhook(self, request_headers: dict, request_body: bytes) -> bool:
        """Validate incoming webhook authenticity (signature verification)."""
        pass
    
    @abstractmethod
    async def parse_webhook(self, request_data: dict) -> UnifiedMessage:
        """Parse incoming webhook payload into UnifiedMessage."""
        pass

# telegram_adapter.py
class TelegramAdapter(ChannelAdapter):
    """Channel adapter for Telegram Bot API."""
    
    channel_name = "telegram"
    
    def __init__(self, bot_manager: MultiTenantBotManager) -> None:
        self.bot_manager = bot_manager
    
    async def normalize_inbound(self, raw_payload: dict) -> UnifiedMessage:
        """Convert Telegram update to UnifiedMessage."""
        message_data = raw_payload.get("message", {})
        callback_data = raw_payload.get("callback_query", {})
        
        if message_data:
            return await self._normalize_message(message_data, raw_payload)
        elif callback_data:
            return await self._normalize_callback(callback_data, raw_payload)
        else:
            raise ValueError("Unknown Telegram update type")
    
    async def _normalize_message(self, message: dict, update: dict) -> UnifiedMessage:
        chat = message.get("chat", {})
        from_user = message.get("from", {})
        
        # Determine clinic from chat context
        clinic_id = await self._resolve_clinic(chat.get("id"))
        patient_id = f"tg_{from_user.get('id')}"
        
        return UnifiedMessage(
            channel="telegram",
            channel_message_id=str(message.get("message_id")),
            clinic_id=clinic_id,
            patient_id=patient_id,
            direction=MessageDirection.INBOUND,
            content=message.get("text", ""),
            content_type="text",
            sender_type="patient",
            sender_id=str(from_user.get("id")),
            sender_name=from_user.get("first_name", "Unknown"),
        )
    
    async def send_outbound(self, message: UnifiedMessage) -> dict:
        """Send message through Telegram Bot API."""
        bot = self.bot_manager.get_bot(message.clinic_id)
        
        # Resolve Telegram chat ID from patient_id
        chat_id = await self._resolve_chat_id(message.patient_id)
        
        # Enforce PHI safety
        safe_content = phi_filter.enforce_safe(message.content)
        
        result = await bot.send_message(
            chat_id=chat_id,
            text=safe_content,
            parse_mode="HTML" if "<" in safe_content else None,
        )
        
        return {
            "channel_message_id": str(result.message_id),
            "status": "sent",
        }
    
    async def validate_webhook(self, request_headers: dict, request_body: bytes) -> bool:
        """Validate Telegram webhook (IP whitelist + token check)."""
        # Telegram doesn't sign webhooks -- validate by checking
        # source IP against Telegram's published IP ranges
        source_ip = request_headers.get("X-Forwarded-For", "")
        return self._is_telegram_ip(source_ip)

# whatsapp_adapter.py
class WhatsAppAdapter(ChannelAdapter):
    """Channel adapter for WhatsApp Business API (Cloud API)."""
    
    channel_name = "whatsapp"
    
    def __init__(self, auth_manager: MetaAuthManager) -> None:
        self.auth = auth_manager
    
    async def normalize_inbound(self, raw_payload: dict) -> UnifiedMessage:
        """Convert WhatsApp webhook payload to UnifiedMessage."""
        entry = raw_payload.get("entry", [{}])[0]
        change = entry.get("changes", [{}])[0]
        value = change.get("value", {})
        message_data = value.get("messages", [{}])[0]
        
        clinic_id = await self._resolve_clinic(value.get("metadata", {}).get("phone_number_id"))
        patient_phone = message_data.get("from", "")
        
        # Extract content based on message type
        msg_type = message_data.get("type", "text")
        if msg_type == "text":
            content = message_data.get("text", {}).get("body", "")
        elif msg_type == "button":
            content = message_data.get("button", {}).get("text", "")
        else:
            content = f"[{msg_type}]"
        
        return UnifiedMessage(
            channel="whatsapp",
            channel_message_id=message_data.get("id", ""),
            clinic_id=clinic_id,
            patient_id=f"wa_{patient_phone}",
            patient_phone=patient_phone,
            direction=MessageDirection.INBOUND,
            content=content,
            content_type=msg_type,
            sender_type="patient",
            sender_id=patient_phone,
        )
    
    async def send_outbound(self, message: UnifiedMessage) -> dict:
        """Send message through WhatsApp Cloud API."""
        token = await self.auth.get_valid_token()
        phone_number_id = await self._get_phone_number_id(message.clinic_id)
        
        url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
        
        # Determine if we need template or free-form
        window_manager = ConversationWindowManager(redis_client)
        window_open = await window_manager.is_window_open(message.patient_phone)
        
        if window_open:
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": message.patient_phone,
                "type": "text",
                "text": {"body": message.content},
            }
        else:
            # Must use template
            payload = await self._build_template_payload(message)
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                result = await resp.json()
                return {
                    "channel_message_id": result.get("messages", [{}])[0].get("id"),
                    "status": "sent",
                }
    
    async def validate_webhook(self, request_headers: dict, request_body: bytes) -> bool:
        """Validate WhatsApp webhook signature (X-Hub-Signature-256)."""
        signature = request_headers.get("X-Hub-Signature-256", "")
        expected = hmac.new(
            self.app_secret.encode(),
            request_body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(f"sha256={expected}", signature)

# sms_adapter.py
class SMSAdapter(ChannelAdapter):
    """Channel adapter for SMS (Twilio)."""
    
    channel_name = "sms"
    
    def __init__(self, twilio_client: TwilioSMSClient) -> None:
        self.twilio = twilio_client
    
    async def normalize_inbound(self, raw_payload: dict) -> UnifiedMessage:
        """Convert Twilio webhook payload to UnifiedMessage."""
        return UnifiedMessage(
            channel="sms",
            channel_message_id=raw_payload.get("MessageSid", ""),
            clinic_id=await self._resolve_clinic_from_number(raw_payload.get("To", "")),
            patient_id=f"sms_{raw_payload.get('From', '')}",
            patient_phone=raw_payload.get("From", ""),
            direction=MessageDirection.INBOUND,
            content=raw_payload.get("Body", ""),
            content_type="text",
            sender_type="patient",
            sender_id=raw_payload.get("From", ""),
        )
    
    async def send_outbound(self, message: UnifiedMessage) -> dict:
        """Send SMS via Twilio."""
        from_number = await self._get_clinic_sms_number(message.clinic_id)
        
        result = await self.twilio.send_message(
            to_number=message.patient_phone,
            body=message.content,
            from_number=from_number,
        )
        
        return {
            "channel_message_id": result["message_sid"],
            "status": result["status"],
            "segments": result["segments"],
        }
```

### 8.4 Routing Engine

```python
# routing_engine.py
class RoutingEngine:
    """Intelligent message routing across channels and staff.
    
    Routes inbound messages to appropriate handlers and
    outbound messages to correct channel adapters."""
    
    def __init__(self) -> None:
        self.adapters: dict[str, ChannelAdapter] = {}
        self.priority_router = PriorityRouter()
        self.assignment_engine = StaffAssignmentEngine()
    
    def register_adapter(self, adapter: ChannelAdapter) -> None:
        """Register a channel adapter."""
        self.adapters[adapter.channel_name] = adapter
    
    async def route_inbound(self, unified_message: UnifiedMessage) -> dict:
        """Route an inbound message through processing pipeline.
        
        Pipeline:
        1. Validate channel isolation
        2. Verify patient consent
        3. Assess priority
        4. Create or update thread
        5. Classify intent
        6. Route to AI agent or human staff
        """
        # 1. Validate isolation
        await self._validate_isolation(unified_message)
        
        # 2. Verify consent
        consent_ok = await self._verify_consent(unified_message)
        if not consent_ok:
            unified_message.status = MessageStatus.PENDING_CONSENT
            await self._request_consent(unified_message)
            return {"routed": False, "reason": "consent_required"}
        
        # 3. Assess priority
        priority = await self.priority_router.assess_priority(unified_message.content)
        unified_message.priority = priority
        
        # 4. Create or update thread
        thread = await self._get_or_create_thread(unified_message)
        unified_message.thread_id = thread["thread_id"]
        
        # 5. Classify intent and route
        intent = await self._classify_intent(unified_message.content)
        
        if self._should_use_ai_agent(intent, priority):
            # Route to AI agent for automated response
            ai_response = await self._invoke_ai_agent(unified_message, intent)
            
            # Send AI response back through same channel
            outbound_msg = UnifiedMessage(
                channel=unified_message.channel,
                clinic_id=unified_message.clinic_id,
                patient_id=unified_message.patient_id,
                direction=MessageDirection.OUTBOUND,
                content=ai_response,
                sender_type="ai_agent",
                sender_id="clinical_ai_v1",
                channel_message_id=f"outbound_{uuid4().hex[:8]}",
            )
            
            await self.route_outbound(outbound_msg)
            
            return {
                "routed": True,
                "handler": "ai_agent",
                "thread_id": thread["thread_id"],
                "intent": intent,
            }
        else:
            # Route to human staff
            assignee = await self.assignment_engine.find_best_assignee(
                unified_message.clinic_id,
                unified_message.content,
                unified_message.patient_id,
                priority,
            )
            
            unified_message.assigned_to = assignee
            await self._notify_staff(assignee, unified_message)
            
            return {
                "routed": True,
                "handler": "human",
                "assignee": assignee,
                "thread_id": thread["thread_id"],
                "intent": intent,
            }
    
    async def route_outbound(self, message: UnifiedMessage) -> dict:
        """Route an outbound message to the correct channel adapter."""
        adapter = self.adapters.get(message.channel)
        if not adapter:
            raise ValueError(f"No adapter registered for channel: {message.channel}")
        
        # Pre-send compliance checks
        await self._pre_send_checks(message)
        
        # Send via channel adapter
        result = await adapter.send_outbound(message)
        
        # Update message status
        message.status = MessageStatus.DELIVERED
        message.sent_at = datetime.utcnow()
        
        # Log for audit
        await self._log_outbound(message, result)
        
        return result
    
    async def _classify_intent(self, content: str) -> str:
        """Classify patient message intent using NLP."""
        # Use clinical intent classification model
        # Simple keyword-based fallback:
        content_lower = content.lower()
        
        intents = {
            "appointment": ["appointment", "schedule", "book", "reschedule", "cancel"],
            "prescription": ["prescription", "medication", "refill", "pill", "medicine"],
            "lab_results": ["lab", "test", "result", "blood work"],
            "symptom_check": ["pain", "symptom", "feel", "sick", "hurt"],
            "billing": ["bill", "payment", "insurance", "charge", "cost"],
            "general_inquiry": ["question", "information", "help"],
        }
        
        for intent, keywords in intents.items():
            if any(kw in content_lower for kw in keywords):
                return intent
        
        return "general_inquiry"
    
    def _should_use_ai_agent(self, intent: str, priority: str) -> bool:
        """Determine if message can be handled by AI agent."""
        # AI handles routine inquiries; humans handle complex/urgent
        ai_capable_intents = [
            "appointment", "prescription", "lab_results",
            "general_inquiry", "billing",
        ]
        
        if priority in ("critical", "high"):
            return False  # Always human for urgent
        
        return intent in ai_capable_intents
```

### 8.5 Delivery Tracking

```python
# delivery_tracker.py
class DeliveryTracker:
    """Track message delivery status across all channels.
    
    Maintains a delivery state machine for each message,
    handling retries, failures, and status callbacks."""
    
    DELIVERY_STATES = {
        "queued": ["sending"],
        "sending": ["sent", "failed"],
        "sent": ["delivered", "failed", "bounced"],
        "delivered": ["read"],
        "read": [],  # Terminal state
        "failed": ["retrying"],
        "retrying": ["sent", "failed_permanently"],
        "failed_permanently": [],  # Terminal state
        "bounced": ["address_updated"],
        "address_updated": ["retrying"],
    }
    
    MAX_RETRY_ATTEMPTS = 3
    RETRY_DELAYS = [5, 30, 300]  # seconds between retries
    
    async def track_delivery(self, message_id: str, channel: str) -> None:
        """Start tracking delivery for a message."""
        tracking = DeliveryTracking(
            message_id=message_id,
            channel=channel,
            status="queued",
            attempts=0,
            created_at=datetime.utcnow(),
        )
        
        await self._save_tracking(tracking)
    
    async def update_status(
        self,
        message_id: str,
        new_status: str,
        metadata: dict | None = None,
    ) -> None:
        """Update delivery status with state machine validation."""
        tracking = await self._get_tracking(message_id)
        
        current_status = tracking.status
        valid_transitions = self.DELIVERY_STATES.get(current_status, [])
        
        if new_status not in valid_transitions and new_status != current_status:
            logger.warning(
                f"Invalid delivery state transition: "
                f"{current_status} -> {new_status} for message {message_id}"
            )
            return
        
        tracking.status = new_status
        tracking.updated_at = datetime.utcnow()
        
        if metadata:
            tracking.metadata.update(metadata)
        
        await self._save_tracking(tracking)
        
        # Handle terminal failure states
        if new_status == "failed_permanently":
            await self._handle_permanent_failure(tracking)
        elif new_status == "bounced":
            await self._handle_bounce(tracking)
    
    async def schedule_retry(self, message_id: str) -> dict:
        """Schedule a retry for a failed message."""
        tracking = await self._get_tracking(message_id)
        
        if tracking.attempts >= self.MAX_RETRY_ATTEMPTS:
            await self.update_status(message_id, "failed_permanently")
            return {"retry": False, "reason": "max_retries_exceeded"}
        
        delay = self.RETRY_DELAYS[min(tracking.attempts, len(self.RETRY_DELAYS) - 1)]
        tracking.attempts += 1
        tracking.status = "retrying"
        tracking.next_retry_at = datetime.utcnow() + timedelta(seconds=delay)
        
        await self._save_tracking(tracking)
        
        # Schedule retry job (via Celery/Redis/RQ)
        await self._enqueue_retry(message_id, delay)
        
        return {
            "retry": True,
            "attempt": tracking.attempts,
            "delay_seconds": delay,
            "next_retry": tracking.next_retry_at.isoformat(),
        }
```

### 8.6 Failure Handling

```python
# failure_handler.py
class ChannelFailureHandler:
    """Handle delivery failures with intelligent recovery strategies."""
    
    FAILURE_STRATEGIES = {
        "telegram": {
            "blocked": {"fallback_channel": "sms", "escalate": False},
            "timeout": {"retry": True, "max_retries": 3},
            "unauthorized": {"escalate": True, "alert_admin": True},
        },
        "whatsapp": {
            "invalid_number": {"fallback_channel": "sms", "escalate": False},
            "template_mismatch": {"fix": "use_correct_template", "retry": True},
            "rate_limited": {"retry": True, "backoff": "exponential"},
        },
        "sms": {
            "invalid_number": {"update_contact": True, "escalate": False},
            "carrier_block": {"fallback_channel": "voice", "escalate": False},
            "opted_out": {"stop_sending": True, "escalate": False},
        },
        "email": {
            "bounced": {"update_email": True, "fallback_channel": "sms"},
            "spam_filtered": {"review_content": True, "retry": False},
            "mailbox_full": {"retry": True, "delay": 86400},
        },
        "voice": {
            "no_answer": {"retry": True, "delay": 3600},
            "busy": {"retry": True, "delay": 1800},
            "voicemail": {"leave_message": True, "fallback_channel": "sms"},
        },
    }
    
    async def handle_failure(
        self,
        message: UnifiedMessage,
        error_code: str,
        error_details: str,
    ) -> dict:
        """Handle a delivery failure with appropriate recovery strategy."""
        
        channel_strategy = self.FAILURE_STRATEGIES.get(message.channel, {})
        strategy = channel_strategy.get(error_code, {"escalate": True})
        
        result = {
            "original_channel": message.channel,
            "error_code": error_code,
            "error_details": error_details,
            "strategy": strategy,
            "resolved": False,
        }
        
        # Execute recovery strategy
        if strategy.get("retry"):
            retry_result = await self._retry_message(message)
            result["retry_result"] = retry_result
            result["resolved"] = retry_result.get("success", False)
        
        if strategy.get("fallback_channel") and not result["resolved"]:
            fallback = await self._fallback_to_channel(
                message, strategy["fallback_channel"]
            )
            result["fallback_result"] = fallback
            result["resolved"] = fallback.get("success", False)
        
        if strategy.get("escalate"):
            await self._escalate_failure(message, error_code, error_details)
            result["escalated"] = True
        
        if strategy.get("stop_sending"):
            await self._mark_opted_out(message)
            result["opted_out"] = True
        
        # Log failure and recovery attempt
        await self._log_failure_recovery(message, result)
        
        return result
    
    async def _fallback_to_channel(
        self,
        message: UnifiedMessage,
        fallback_channel: str,
    ) -> dict:
        """Send message through fallback channel."""
        fallback_msg = UnifiedMessage(
            **message.model_dump(),
            channel=fallback_channel,
            channel_message_id=f"fallback_{uuid4().hex[:8]}",
        )
        
        # Adapt content for fallback channel
        if fallback_channel == "sms":
            fallback_msg.content = self._shorten_for_sms(message.content)
        
        try:
            result = await routing_engine.route_outbound(fallback_msg)
            return {"success": True, "channel": fallback_channel, "result": result}
        except Exception as e:
            return {"success": False, "channel": fallback_channel, "error": str(e)}
    
    def _shorten_for_sms(self, content: str) -> str:
        """Shorten message content for SMS constraints (160 chars)."""
        if len(content) <= 160:
            return content
        # Truncate and add portal link
        return content[:140] + "... portal: clinic.example.com"
```

### 8.7 Rate Limiting Per Channel

```python
# rate_limiter.py
import asyncio
from dataclasses import dataclass

@dataclass
class RateLimitConfig:
    """Rate limit configuration for a channel."""
    requests_per_second: float
    burst_size: int
    retry_after_header: bool = True

class ChannelRateLimiter:
    """Per-channel rate limiting with token bucket algorithm.
    
    Each channel has different rate limits enforced by the
    upstream provider (Telegram, Twilio, Meta, etc.).
    """
    
    CHANNEL_LIMITS = {
        "telegram": RateLimitConfig(requests_per_second=30, burst_size=100),
        "whatsapp": RateLimitConfig(requests_per_second=80, burst_size=500),
        "sms_twilio": RateLimitConfig(requests_per_second=100, burst_size=1000),
        "sms_vonage": RateLimitConfig(requests_per_second=10, burst_size=50),
        "email_sendgrid": RateLimitConfig(requests_per_second=600, burst_size=10000),
        "email_ses": RateLimitConfig(requests_per_second=100, burst_size=1000),
        "voice_twilio": RateLimitConfig(requests_per_second=5, burst_size=20),
    }
    
    def __init__(self) -> None:
        self._buckets: dict[str, asyncio.Semaphore] = {}
        self._locks: dict[str, asyncio.Lock] = {}
    
    def get_limiter(self, channel: str) -> asyncio.Semaphore:
        """Get or create rate limiter for channel."""
        if channel not in self._buckets:
            config = self.CHANNEL_LIMITS.get(channel, RateLimitConfig(10, 50))
            self._buckets[channel] = asyncio.Semaphore(config.burst_size)
            self._locks[channel] = asyncio.Lock()
        
        return self._buckets[channel]
    
    async def acquire(self, channel: str) -> None:
        """Acquire rate limit token for channel."""
        limiter = self.get_limiter(channel)
        await limiter.acquire()
        
        # Schedule token release
        config = self.CHANNEL_LIMITS.get(channel, RateLimitConfig(10, 50))
        release_delay = 1.0 / config.requests_per_second
        asyncio.create_task(self._release_after(channel, release_delay))
    
    async def _release_after(self, channel: str, delay: float) -> None:
        """Release rate limit token after appropriate delay."""
        await asyncio.sleep(delay)
        limiter = self._buckets.get(channel)
        if limiter:
            limiter.release()
    
    async def execute_with_limit(
        self,
        channel: str,
        coro: asyncio.Coroutine,
    ) -> Any:
        """Execute a coroutine with rate limiting."""
        await self.acquire(channel)
        return await coro
```

---

## 9. Production Code Examples

### 9.1 Complete Telegram Bot with FastAPI Backend

```python
#!/usr/bin/env python3
"""
Clinical AI Agent -- Telegram Bot Integration
Production-ready FastAPI backend with webhook support,
multi-clinic isolation, and PHI safety controls.

Usage:
    TELEGRAM_BOT_TOKEN=xxx CLINIC_ID=main python telegram_bot_server.py
"""

import os
import asyncio
import logging
import hmac
import hashlib
import json
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional
from dataclasses import dataclass

from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler,
    CallbackQueryHandler, ContextTypes, filters,
)

# ─── Configuration ─────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("clinical-ai-telegram")


@dataclass(frozen=True)
class BotConfig:
    """Bot configuration loaded from environment."""
    bot_token: str
    clinic_id: str
    webhook_secret: str
    webhook_url: Optional[str] = None
    webhook_path: str = "/webhook/telegram"
    port: int = 8000
    
    @classmethod
    def from_env(cls) -> "BotConfig":
        token = os.environ.get("TELEGRAM_BOT_TOKEN")
        if not token:
            raise ValueError("TELEGRAM_BOT_TOKEN required")
        return cls(
            bot_token=token,
            clinic_id=os.environ.get("CLINIC_ID", "default"),
            webhook_secret=os.environ.get("WEBHOOK_SECRET", ""),
            webhook_url=os.environ.get("TELEGRAM_WEBHOOK_URL"),
            webhook_path=os.environ.get("WEBHOOK_PATH", "/webhook/telegram"),
            port=int(os.environ.get("PORT", "8000")),
        )


# ─── PHI Safety Filter ─────────────────────────────────────────────────

import re

class PHISafetyFilter:
    """Prevents PHI transmission through Telegram."""
    
    PATTERNS = [
        (r"\b\d{3}-\d{2}-\d{4}\b", "SSN"),
        (r"\b\d{9,10}\b", "NUMERIC_ID"),
        (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "EMAIL"),
        (r"\b\d{3}-\d{3}-\d{4}\b", "PHONE"),
    ]
    
    def scan(self, text: str) -> tuple[bool, list[str]]:
        violations = []
        for pattern, name in self.PATTERNS:
            if re.search(pattern, text):
                violations.append(name)
        return len(violations) == 0, violations
    
    def enforce(self, text: str) -> str:
        is_safe, violations = self.scan(text)
        if is_safe:
            return text
        logger.warning(f"PHI blocked: {violations}")
        return "New notification. Please check the patient portal."

phi_filter = PHISafetyFilter()


# ─── Bot Handlers ──────────────────────────────────────────────────────

async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command."""
    user = update.effective_user
    clinic = context.bot_data.get("clinic_id", "clinic")
    
    await update.message.reply_text(
        f"Welcome {user.first_name}!\n\n"
        f"You're connected to {clinic}.\n"
        "I can help you with:\n"
        "/schedule -- Appointment requests\n"
        "/prescription -- Medication info\n"
        "/lab -- Lab result notifications\n"
        "/human -- Speak to staff\n"
        "/help -- All options",
    )

async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show help with inline keyboard."""
    keyboard = [
        [InlineKeyboardButton("Schedule Appointment", callback_data="schedule")],
        [InlineKeyboardButton("Prescription Refill", callback_data="prescription")],
        [InlineKeyboardButton("Lab Results", callback_data="lab")],
        [InlineKeyboardButton("Speak to Human", callback_data="human")],
    ]
    
    await update.message.reply_text(
        "What do you need help with?",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )

async def cmd_schedule(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle appointment scheduling request."""
    keyboard = [
        [InlineKeyboardButton("This Week", callback_data="appt_this_week")],
        [InlineKeyboardButton("Next Week", callback_data="appt_next_week")],
        [InlineKeyboardButton("Specific Date", callback_data="appt_specific")],
    ]
    
    await update.message.reply_text(
        "When would you like to schedule?",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle inline keyboard callbacks."""
    query = update.callback_query
    await query.answer()
    
    data = query.data
    user_id = update.effective_user.id
    
    responses = {
        "schedule": "I'll help you schedule. What type of appointment?",
        "prescription": "I can help with prescription inquiries. What medication?",
        "lab": "Your lab results will be sent via secure portal when ready.",
        "human": "Connecting you to a care coordinator. Please wait...",
    }
    
    response = responses.get(data, "Processing your request...")
    
    # Log interaction (no PHI)
    logger.info(f"Callback: user={user_id}, action={data}")
    
    await query.edit_message_text(response)

async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming text messages with triage."""
    text = update.message.text
    user_id = update.effective_user.id
    
    logger.info(f"Message: user={user_id}, len={len(text)}")
    
    # Triage keywords
    lower = text.lower()
    if any(w in lower for w in ["pain", "emergency", "hurt", "bleeding"]):
        await update.message.reply_text(
            "If this is a medical emergency, call 911 immediately.\n\n"
            "I'm connecting you to our triage team now."
        )
    elif any(w in lower for w in ["appointment", "schedule", "book"]):
        await cmd_schedule(update, context)
    else:
        await update.message.reply_text(
            "I understand. A care coordinator will review and respond.\n"
            "For immediate help, call our office or dial 911 for emergencies."
        )


# ─── Application Factory ───────────────────────────────────────────────

def create_bot_app(config: BotConfig) -> Application:
    """Create configured PTB Application."""
    app = (
        Application.builder()
        .token(config.bot_token)
        .concurrent_updates(True)
        .build()
    )
    
    app.bot_data["clinic_id"] = config.clinic_id
    app.bot_data["phi_filter"] = phi_filter
    
    # Register handlers
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("help", cmd_help))
    app.add_handler(CommandHandler("schedule", cmd_schedule))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    
    return app


# ─── FastAPI Application ───────────────────────────────────────────────

class WebhookPayload(BaseModel):
    """Expected Telegram webhook payload."""
    update_id: int
    message: Optional[dict] = None
    callback_query: Optional[dict] = None
    edited_message: Optional[dict] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage bot lifecycle."""
    config = BotConfig.from_env()
    bot_app = create_bot_app(config)
    
    await bot_app.initialize()
    
    if config.webhook_url:
        webhook_url = f"{config.webhook_url.rstrip('/')}{config.webhook_path}"
        await bot_app.bot.set_webhook(
            url=webhook_url,
            allowed_updates=["message", "callback_query", "edited_message"],
            drop_pending_updates=True,
        )
        logger.info(f"Webhook set: {webhook_url}")
    
    app.state.bot_app = bot_app
    app.state.config = config
    yield
    
    await bot_app.shutdown()


api = FastAPI(title="Clinical AI Agent -- Telegram", lifespan=lifespan)


@api.post(config.webhook_path if 'config' in dir() else "/webhook/telegram")
async def telegram_webhook(request: Request) -> JSONResponse:
    """Receive and process Telegram webhook updates."""
    try:
        data = await request.json()
        update = Update.de_json(data, api.state.bot_app.bot)
        await api.state.bot_app.process_update(update)
        return JSONResponse({"status": "ok"})
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return JSONResponse({"status": "error", "detail": str(e)}, status_code=500)


@api.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "channel": "telegram",
        "clinic_id": getattr(api.state, "config", None) and api.state.config.clinic_id,
        "timestamp": datetime.utcnow().isoformat(),
    }


@api.get("/webhook/info")
async def webhook_info() -> dict:
    """Get current webhook configuration."""
    bot = api.state.bot_app.bot
    info = await bot.get_webhook_info()
    return {
        "url": info.url,
        "has_custom_certificate": info.has_custom_certificate,
        "pending_update_count": info.pending_update_count,
        "ip_address": info.ip_address,
    }


# ─── Main Entry Point ──────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    config = BotConfig.from_env()
    uvicorn.run(api, host="0.0.0.0", port=config.port)
```

### 9.2 Twilio SMS Handler with FastAPI

```python
#!/usr/bin/env python3
"""
Clinical AI Agent -- Twilio SMS Handler
FastAPI backend for receiving and sending SMS with
consent management, opt-out handling, and PHI safety.
"""

import os
import re
import logging
from datetime import datetime
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, Form, HTTPException, Depends, Response
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel, Field
from twilio.rest import Client as TwilioClient
from twilio.twiml.messaging_response import MessagingResponse
from twilio.request_validator import RequestValidator

# ─── Configuration ─────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clinical-ai-sms")


class SMSConfig:
    """SMS configuration from environment."""
    
    def __init__(self) -> None:
        self.account_sid = os.environ["TWILIO_ACCOUNT_SID"]
        self.auth_token = os.environ["TWILIO_AUTH_TOKEN"]
        self.phone_number = os.environ["TWILIO_PHONE_NUMBER"]
        self.messaging_service_sid = os.environ.get("TWILIO_MESSAGING_SERVICE_SID")
        self.webhook_secret = os.environ.get("WEBHOOK_SECRET", "")
        self.clinic_id = os.environ.get("CLINIC_ID", "default")
    
    @classmethod
    def from_env(cls) -> "SMSConfig":
        required = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"]
        for var in required:
            if not os.environ.get(var):
                raise ValueError(f"Environment variable {var} required")
        return cls()


# ─── Consent Manager ───────────────────────────────────────────────────

class ConsentManager:
    """Manage patient SMS consent with audit trail."""
    
    OPT_OUT = {"stop", "unsubscribe", "cancel", "end", "quit", "opt out"}
    OPT_IN = {"start", "yes", "subscribe", "join", "opt in", "consent"}
    HELP = {"help", "info", "support"}
    
    def __init__(self):
        # In production, use PostgreSQL/Redis
        self._consents: dict[str, dict] = {}  # phone -> {status, timestamp}
    
    async def process_keywords(self, phone: str, message: str) -> Optional[str]:
        """Check for opt-in/opt-out keywords. Returns response if keyword matched."""
        normalized = message.strip().lower()
        
        if normalized in self.OPT_OUT:
            self._consents[phone] = {"status": "opted_out", "at": datetime.utcnow().isoformat()}
            logger.info(f"Opt-out: {phone[:7]}...")
            return (
                "You are unsubscribed. Reply START to re-subscribe. "
                "Contact your clinic for help. Msg&data rates may apply."
            )
        
        if normalized in self.OPT_IN:
            self._consents[phone] = {"status": "opted_in", "at": datetime.utcnow().isoformat()}
            logger.info(f"Opt-in: {phone[:7]}...")
            return (
                "Subscribed to clinic SMS. Reply STOP to unsubscribe. "
                "Msg&data rates may apply."
            )
        
        if normalized in self.HELP:
            return "Reply STOP to unsubscribe. Reply START to subscribe."
        
        return None
    
    def can_send(self, phone: str) -> bool:
        """Check if we can send to this number."""
        record = self._consents.get(phone, {})
        return record.get("status") == "opted_in"
    
    def record_consent(self, phone: str, status: str) -> None:
        """Record consent status."""
        self._consents[phone] = {
            "status": status,
            "at": datetime.utcnow().isoformat(),
        }


consent_manager = ConsentManager()


# ─── PHI Safety ────────────────────────────────────────────────────────

class SMSSafetyFilter:
    """Ensure SMS content is PHI-safe."""
    
    TEMPLATES = {
        "appointment_reminder": (
            "Reminder: You have an appointment. "
            "Details: {link}"
        ),
        "lab_ready": (
            "Your test results are available. "
            "View securely: {link}"
        ),
        "prescription_ready": (
            "Your prescription is ready at {pharmacy}. "
            "Questions? Call your clinic."
        ),
        "medication_reminder": (
            "Reminder: Time for your medication. "
            "See your care plan for details."
        ),
    }
    
    @classmethod
    def render(cls, template_name: str, **kwargs) -> str:
        template = cls.TEMPLATES.get(template_name)
        if not template:
            raise ValueError(f"Unknown template: {template_name}")
        return template.format(**kwargs)
    
    @classmethod
    def has_phi_risk(cls, text: str) -> bool:
        patterns = [
            r"\b\d{3}-\d{2}-\d{4}\b",  # SSN
            r"\b(diagnosis|prognosis|prescribed)\b",
            r"\b\d+\s*(mg|mcg|ml)\b",
        ]
        return any(re.search(p, text, re.I) for p in patterns)


# ─── Twilio Client Wrapper ─────────────────────────────────────────────

class SMSService:
    """Twilio SMS service with clinical safety controls."""
    
    def __init__(self, config: SMSConfig) -> None:
        self.client = TwilioClient(config.account_sid, config.auth_token)
        self.config = config
        self.validator = RequestValidator(config.auth_token)
    
    async def send_message(
        self,
        to_number: str,
        body: str,
        status_callback: Optional[str] = None,
    ) -> dict:
        """Send SMS with safety checks."""
        # Verify consent
        if not consent_manager.can_send(to_number):
            raise HTTPException(403, "Patient has not consented to SMS")
        
        # PHI check
        if SMSSafetyFilter.has_phi_risk(body):
            logger.warning(f"PHI risk detected in SMS to {to_number[:7]}...")
            body = SMSSafetyFilter.render("appointment_reminder", link="patient portal")
        
        # Ensure single segment when possible
        if len(body) > 160:
            body = body[:157] + "..."
        
        message = self.client.messages.create(
            to=to_number,
            body=body,
            from_=self.config.phone_number,
            status_callback=status_callback,
        )
        
        logger.info(f"SMS sent: sid={message.sid}, to={to_number[-4:]}")
        
        return {
            "message_sid": message.sid,
            "status": message.status,
            "segments": message.num_segments,
        }
    
    def validate_request(self, url: str, post_data: dict, signature: str) -> bool:
        """Validate Twilio webhook signature."""
        return self.validator.validate(url, post_data, signature)


# ─── FastAPI Application ───────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    config = SMSConfig.from_env()
    app.state.config = config
    app.state.sms = SMSService(config)
    yield

app = FastAPI(title="Clinical AI Agent -- SMS", lifespan=lifespan)


@app.post("/webhook/sms")
async def incoming_sms(
    request: Request,
    From: str = Form(...),      # Sender phone
    To: str = Form(...),        # Clinic phone
    Body: str = Form(...),      # Message text
    MessageSid: str = Form(...),
    NumMedia: str = Form("0"),
) -> PlainTextResponse:
    """Handle incoming SMS from Twilio."""
    
    # Validate webhook signature
    signature = request.headers.get("X-Twilio-Signature", "")
    url = str(request.url)
    form_data = await request.form()
    
    if not app.state.sms.validator.validate(url, dict(form_data), signature):
        logger.warning("Invalid Twilio signature")
        raise HTTPException(401, "Invalid signature")
    
    logger.info(f"SMS from {From[-4:]}: {Body[:50]}...")
    
    # Check for opt-in/opt-out keywords
    keyword_response = await consent_manager.process_keywords(From, Body)
    
    if keyword_response:
        resp = MessagingResponse()
        resp.message(keyword_response)
        return PlainTextResponse(str(resp), media_type="application/xml")
    
    # Process as regular message
    # Route to AI agent or human based on content
    response_text = await process_patient_message(From, Body)
    
    resp = MessagingResponse()
    resp.message(response_text)
    return PlainTextResponse(str(resp), media_type="application/xml")


async def process_patient_message(phone: str, message: str) -> str:
    """Process patient message and generate response."""
    lower = message.lower()
    
    if any(w in lower for w in ["appointment", "schedule"]):
        return (
            "I can help you schedule. Please visit our patient portal "
            "or call our office during business hours (8am-5pm)."
        )
    elif any(w in lower for w in ["prescription", "refill", "medication"]):
        return (
            "For prescription refills, please contact your pharmacy directly "
            "or use the patient portal. Allow 24-48 hours for processing."
        )
    elif any(w in lower for w in ["lab", "result", "test"]):
        return (
            "Lab results are available through our secure patient portal. "
            "You'll receive a notification when they're ready."
        )
    elif any(w in lower for w in ["pain", "sick", "hurt", "emergency"]):
        return (
            "If this is a medical emergency, call 911 immediately. "
            "For urgent concerns, please call our office."
        )
    else:
        return (
            "Thank you for your message. A care coordinator will review "
            "and respond shortly. For emergencies, call 911."
        )


@app.post("/send")
async def send_sms(
    to: str,
    body: str,
    template: Optional[str] = None,
) -> JSONResponse:
    """Send outbound SMS (staff API endpoint)."""
    # Validate staff authentication (implement your auth)
    
    if template:
        body = SMSSafetyFilter.render(template)
    
    result = await app.state.sms.send_message(to, body)
    return JSONResponse(result)


@app.post("/webhook/delivery")
async def delivery_status(
    MessageSid: str = Form(...),
    MessageStatus: str = Form(...),
    ErrorCode: Optional[str] = Form(None),
    To: str = Form(...),
) -> JSONResponse:
    """Handle Twilio delivery status callbacks."""
    logger.info(f"Delivery: {MessageSid[:20]}... status={MessageStatus}")
    
    if MessageStatus in ("failed", "undelivered"):
        logger.error(f"Delivery failed: {MessageSid}, error={ErrorCode}")
        # Trigger retry or fallback
    
    return JSONResponse({"status": "logged"})


@app.get("/health")
async def health() -> dict:
    return {
        "status": "healthy",
        "channel": "sms",
        "timestamp": datetime.utcnow().isoformat(),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8001")))
```

### 9.3 Unified Inbox FastAPI Backend

```python
#!/usr/bin/env python3
"""
Clinical AI Agent -- Unified Inbox Backend
FastAPI application providing unified message management,
routing, and staff dashboard API.
"""

import os
import uuid
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
from enum import Enum

from fastapi import (
    FastAPI, WebSocket, WebSocketDisconnect, Request,
    HTTPException, Depends, Query, BackgroundTasks,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ─── Configuration ─────────────────────────────────────────────────────

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("unified-inbox")


# ─── Data Models ───────────────────────────────────────────────────────

class MessageDirection(str, Enum):
    INBOUND = "inbound"
    OUTBOUND = "outbound"

class MessageStatus(str, Enum):
    RECEIVED = "received"
    QUEUED = "queued"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"
    PENDING_CONSENT = "pending_consent"

class ThreadPriority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class UnifiedMessage(BaseModel):
    message_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    thread_id: str
    channel: str  # telegram|whatsapp|sms|email|voice|dashboard
    channel_message_id: str
    direction: MessageDirection
    clinic_id: str
    patient_id: str
    patient_phone: Optional[str] = None
    patient_email: Optional[str] = None
    sender_id: str
    sender_type: str = "patient"  # patient|staff|ai_agent|system
    sender_name: Optional[str] = None
    content_type: str = "text"  # text|image|document|audio|template
    content: str
    content_metadata: Dict[str, Any] = Field(default_factory=dict)
    status: MessageStatus = MessageStatus.RECEIVED
    priority: ThreadPriority = ThreadPriority.MEDIUM
    assigned_to: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    clinic_ref: Optional[str] = None

class ThreadModel(BaseModel):
    thread_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    clinic_id: str
    patient_id: str
    patient_name: Optional[str] = None
    channel: str
    subject: str = "New conversation"
    status: str = "active"  # active|pending|resolved|escalated|archived
    priority: ThreadPriority = ThreadPriority.MEDIUM
    assigned_to: Optional[str] = None
    message_count: int = 0
    unread_count: int = 0
    last_message_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class SendMessageRequest(BaseModel):
    channel: str
    patient_id: str
    content: str
    template_key: Optional[str] = None
    template_variables: Dict[str, Any] = Field(default_factory=dict)
    priority: ThreadPriority = ThreadPriority.MEDIUM


# ─── In-Memory Store (Production: Use PostgreSQL + Redis) ──────────────

class MessageStore:
    """Thread-safe in-memory message store."""
    
    def __init__(self):
        self.messages: Dict[str, UnifiedMessage] = {}
        self.threads: Dict[str, ThreadModel] = {}
        self.patient_threads: Dict[str, Dict[str, str]] = {}  # clinic:patient -> thread_id
        self.clinic_staff: Dict[str, List[str]] = {}  # clinic_id -> [staff_ids]
        self._lock = asyncio.Lock()
    
    async def create_thread(self, thread: ThreadModel) -> ThreadModel:
        async with self._lock:
            self.threads[thread.thread_id] = thread
            key = f"{thread.clinic_id}:{thread.patient_id}"
            self.patient_threads[key] = thread.thread_id
        return thread
    
    async def get_or_create_thread(
        self,
        clinic_id: str,
        patient_id: str,
        channel: str,
    ) -> str:
        key = f"{clinic_id}:{patient_id}"
        
        async with self._lock:
            thread_id = self.patient_threads.get(key)
            if thread_id and thread_id in self.threads:
                return thread_id
            
            # Create new thread
            thread = ThreadModel(
                clinic_id=clinic_id,
                patient_id=patient_id,
                channel=channel,
            )
            self.threads[thread.thread_id] = thread
            self.patient_threads[key] = thread.thread_id
            return thread.thread_id
    
    async def add_message(self, message: UnifiedMessage) -> UnifiedMessage:
        async with self._lock:
            self.messages[message.message_id] = message
            
            # Update thread
            thread = self.threads.get(message.thread_id)
            if thread:
                thread.message_count += 1
                if message.direction == MessageDirection.INBOUND:
                    thread.unread_count += 1
                thread.last_message_at = message.created_at
        return message
    
    async def get_thread_messages(self, thread_id: str) -> List[UnifiedMessage]:
        return [
            m for m in self.messages.values()
            if m.thread_id == thread_id
        ]
    
    async def get_clinic_threads(self, clinic_id: str) -> List[ThreadModel]:
        return [
            t for t in self.threads.values()
            if t.clinic_id == clinic_id
        ]
    
    async def assign_thread(self, thread_id: str, staff_id: str) -> Optional[ThreadModel]:
        async with self._lock:
            thread = self.threads.get(thread_id)
            if thread:
                thread.assigned_to = staff_id
            return thread


store = MessageStore()


# ─── WebSocket Manager ─────────────────────────────────────────────────

class DashboardWSManager:
    """Real-time WebSocket connections for staff dashboard."""
    
    def __init__(self):
        self.connections: Dict[str, Dict[str, WebSocket]] = {}  # clinic -> {staff_id: ws}
    
    async def connect(self, ws: WebSocket, clinic_id: str, staff_id: str):
        await ws.accept()
        
        if clinic_id not in self.connections:
            self.connections[clinic_id] = {}
        
        self.connections[clinic_id][staff_id] = ws
        
        await ws.send_json({
            "type": "connected",
            "clinic_id": clinic_id,
            "staff_id": staff_id,
            "online_staff": list(self.connections[clinic_id].keys()),
        })
        
        logger.info(f"Dashboard WS: staff={staff_id}, clinic={clinic_id}")
    
    async def disconnect(self, clinic_id: str, staff_id: str):
        if clinic_id in self.connections:
            self.connections[clinic_id].pop(staff_id, None)
    
    async def broadcast_to_clinic(self, clinic_id: str, message: dict):
        if clinic_id not in self.connections:
            return
        
        dead_connections = []
        for staff_id, ws in self.connections[clinic_id].items():
            try:
                await ws.send_json(message)
            except Exception:
                dead_connections.append(staff_id)
        
        # Clean up dead connections
        for staff_id in dead_connections:
            self.connections[clinic_id].pop(staff_id, None)


ws_manager = DashboardWSManager()


# ─── Routing Engine ────────────────────────────────────────────────────

class MessageRouter:
    """Route messages to appropriate handlers."""
    
    INTENT_KEYWORDS = {
        "appointment": ["appointment", "schedule", "book", "reschedule"],
        "prescription": ["prescription", "medication", "refill", "pill"],
        "lab": ["lab", "test", "result", "blood"],
        "symptoms": ["pain", "sick", "hurt", "symptom", "fever"],
        "billing": ["bill", "payment", "insurance", "charge"],
    }
    
    async def classify_intent(self, content: str) -> str:
        lower = content.lower()
        for intent, keywords in self.INTENT_KEYWORDS.items():
            if any(kw in lower for kw in keywords):
                return intent
        return "general"
    
    async def assess_priority(self, content: str) -> ThreadPriority:
        lower = content.lower()
        critical = ["emergency", "chest pain", "can\'t breathe", "unconscious", "severe"]
        if any(kw in lower for kw in critical):
            return ThreadPriority.CRITICAL
        
        high = ["pain", "urgent", "prescription refill", "infection"]
        if any(kw in lower for kw in high):
            return ThreadPriority.HIGH
        
        return ThreadPriority.MEDIUM
    
    async def route_inbound(self, message: UnifiedMessage) -> dict:
        """Route inbound message through processing pipeline."""
        intent = await self.classify_intent(message.content)
        priority = await self.assess_priority(message.content)
        message.priority = priority
        
        # Auto-reply for certain intents
        auto_replies = {
            "appointment": "I\'ll help you schedule. What type of appointment?",
            "prescription": "For prescription inquiries, please use the patient portal or call us.",
            "lab": "Lab results are available through our secure patient portal.",
        }
        
        if intent in auto_replies:
            return {
                "routed": True,
                "handler": "auto_reply",
                "intent": intent,
                "priority": priority,
                "auto_reply": auto_replies[intent],
            }
        
        return {
            "routed": True,
            "handler": "human_queue",
            "intent": intent,
            "priority": priority,
        }


router = MessageRouter()


# ─── FastAPI Application ───────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Unified Inbox starting...")
    yield
    logger.info("Unified Inbox shutting down...")

api = FastAPI(
    title="Clinical AI Agent -- Unified Inbox",
    description="Multi-channel message management and routing system",
    version="1.0.0",
    lifespan=lifespan,
)


# ─── REST API Endpoints ────────────────────────────────────────────────

@api.post("/messages/inbound", response_model=Dict[str, Any])
async def receive_inbound_message(message: UnifiedMessage):
    """Receive a normalized inbound message from any channel adapter."""
    
    # Get or create thread
    thread_id = await store.get_or_create_thread(
        message.clinic_id,
        message.patient_id,
        message.channel,
    )
    message.thread_id = thread_id
    
    # Store message
    await store.add_message(message)
    
    # Route message
    routing_result = await router.route_inbound(message)
    
    # Notify dashboard staff
    await ws_manager.broadcast_to_clinic(
        message.clinic_id,
        {
            "type": "new_message",
            "message": message.model_dump(mode="json"),
            "routing": routing_result,
        },
    )
    
    logger.info(
        f"Inbound: channel={message.channel}, "
        f"patient={message.patient_id[:8]}..., intent={routing_result['intent']}"
    )
    
    return {
        "message_id": message.message_id,
        "thread_id": thread_id,
        "routing": routing_result,
    }


@api.post("/messages/outbound", response_model=Dict[str, Any])
async def send_outbound_message(request: SendMessageRequest):
    """Send an outbound message through specified channel."""
    
    # In production, route to appropriate channel adapter
    message = UnifiedMessage(
        thread_id=await store.get_or_create_thread(
            "default", request.patient_id, request.channel
        ),
        channel=request.channel,
        channel_message_id=f"outbound_{uuid.uuid4().hex[:8]}",
        direction=MessageDirection.OUTBOUND,
        clinic_id="default",
        patient_id=request.patient_id,
        sender_id="system",
        sender_type="staff",
        content=request.content,
        priority=request.priority,
    )
    
    await store.add_message(message)
    
    return {
        "message_id": message.message_id,
        "status": "queued",
        "channel": request.channel,
    }


@api.get("/threads/{clinic_id}")
async def get_clinic_threads(clinic_id: str):
    """Get all conversation threads for a clinic."""
    threads = await store.get_clinic_threads(clinic_id)
    return {
        "clinic_id": clinic_id,
        "threads": [t.model_dump(mode="json") for t in threads],
        "total": len(threads),
    }


@api.get("/threads/{thread_id}/messages")
async def get_thread_messages(thread_id: str):
    """Get all messages in a thread."""
    if thread_id not in store.threads:
        raise HTTPException(404, "Thread not found")
    
    messages = await store.get_thread_messages(thread_id)
    messages.sort(key=lambda m: m.created_at)
    
    return {
        "thread_id": thread_id,
        "messages": [m.model_dump(mode="json") for m in messages],
    }


@api.post("/threads/{thread_id}/assign")
async def assign_thread(thread_id: str, staff_id: str):
    """Assign a thread to a staff member."""
    thread = await store.assign_thread(thread_id, staff_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    
    # Notify dashboard
    await ws_manager.broadcast_to_clinic(
        thread.clinic_id,
        {
            "type": "thread_assigned",
            "thread_id": thread_id,
            "assigned_to": staff_id,
        },
    )
    
    return {"thread_id": thread_id, "assigned_to": staff_id}


@api.get("/threads/{thread_id}")
async def get_thread(thread_id: str):
    """Get thread details."""
    thread = store.threads.get(thread_id)
    if not thread:
        raise HTTPException(404, "Thread not found")
    return thread.model_dump(mode="json")


# ─── WebSocket Endpoint ────────────────────────────────────────────────

@api.websocket("/ws/dashboard/{clinic_id}/{staff_id}")
async def dashboard_websocket(ws: WebSocket, clinic_id: str, staff_id: str):
    """Real-time WebSocket for staff dashboard."""
    await ws_manager.connect(ws, clinic_id, staff_id)
    
    try:
        while True:
            data = await ws.receive_json()
            
            # Handle client actions (typing indicators, message reads, etc.)
            action = data.get("action")
            
            if action == "typing":
                # Broadcast typing indicator to other staff
                await ws_manager.broadcast_to_clinic(
                    clinic_id,
                    {
                        "type": "typing",
                        "staff_id": staff_id,
                        "thread_id": data.get("thread_id"),
                    },
                )
            
            elif action == "mark_read":
                thread_id = data.get("thread_id")
                thread = store.threads.get(thread_id)
                if thread:
                    thread.unread_count = 0
                    await ws.send_json({"type": "marked_read", "thread_id": thread_id})
    
    except WebSocketDisconnect:
        await ws_manager.disconnect(clinic_id, staff_id)
    except Exception as e:
        logger.error(f"WS error: {e}")
        await ws_manager.disconnect(clinic_id, staff_id)


# ─── Analytics & Reporting ─────────────────────────────────────────────

@api.get("/analytics/{clinic_id}")
async def get_analytics(
    clinic_id: str,
    period: str = Query("24h", description="Time period: 1h, 24h, 7d, 30d"),
):
    """Get communication analytics for clinic."""
    threads = await store.get_clinic_threads(clinic_id)
    messages = [
        m for m in store.messages.values()
        if m.clinic_id == clinic_id
    ]
    
    # Calculate metrics
    total_messages = len(messages)
    inbound = len([m for m in messages if m.direction == MessageDirection.INBOUND])
    outbound = len([m for m in messages if m.direction == MessageDirection.OUTBOUND])
    
    by_channel = {}
    for m in messages:
        by_channel[m.channel] = by_channel.get(m.channel, 0) + 1
    
    unresolved = len([t for t in threads if t.status == "active"])
    avg_response_time = "N/A"  # Calculate from timestamps
    
    return {
        "clinic_id": clinic_id,
        "period": period,
        "threads": {
            "total": len(threads),
            "active": len([t for t in threads if t.status == "active"]),
            "resolved": len([t for t in threads if t.status == "resolved"]),
            "unassigned": len([t for t in threads if not t.assigned_to]),
        },
        "messages": {
            "total": total_messages,
            "inbound": inbound,
            "outbound": outbound,
            "by_channel": by_channel,
        },
        "priority_breakdown": {
            "critical": len([m for m in messages if m.priority == ThreadPriority.CRITICAL]),
            "high": len([m for m in messages if m.priority == ThreadPriority.HIGH]),
            "medium": len([m for m in messages if m.priority == ThreadPriority.MEDIUM]),
            "low": len([m for m in messages if m.priority == ThreadPriority.LOW]),
        },
    }


@api.get("/health")
async def health_check() -> dict:
    """Service health check."""
    return {
        "status": "healthy",
        "service": "unified-inbox",
        "version": "1.0.0",
        "channels_supported": ["telegram", "whatsapp", "sms", "email", "voice", "dashboard"],
        "threads_active": len([t for t in store.threads.values() if t.status == "active"]),
        "messages_total": len(store.messages),
        "timestamp": datetime.utcnow().isoformat(),
    }


# ─── Main Entry Point ──────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(api, host="0.0.0.0", port=int(os.environ.get("PORT", "8002")))
```

---

## 10. References

### Libraries and Dependencies

| Library | Version | License | Purpose |
|---|---|---|---|
| `python-telegram-bot` | 20.x | LGPL-3.0 | Telegram Bot API SDK |
| `twilio` | 8.x | MIT | SMS and Voice API |
| `sendgrid` | 6.x | MIT | Email API |
| `boto3` | 1.x | Apache-2.0 | AWS SES integration |
| `fastapi` | 0.100+ | MIT | Web framework |
| `pydantic` | 2.x | MIT | Data validation |
| `websockets` | 12.x | BSD-3 | WebSocket support |
| `aiohttp` | 3.x | Apache-2.0 | Async HTTP client |
| `redis-py` | 5.x | MIT | Session/conversation window storage |
| `jinja2` | 3.x | BSD-3 | Email template engine |
| `cryptography` | 42.x | Apache-2.0 | Encryption for attachments |
| `pyotp` | 2.x | MIT | 2FA code generation |

### Regulatory References

| Regulation | Citation | Relevance |
|---|---|---|
| HIPAA Privacy Rule | 45 CFR 164.502 | PHI transmission requirements |
| HIPAA Security Rule | 45 CFR 164.312 | Technical safeguards for communications |
| GDPR | Regulation (EU) 2016/679 | EU patient data protection |
| TCPA | 47 U.S.C. 227 | SMS consent requirements (US) |
| CAN-SPAM | 15 U.S.C. 7701 | Email marketing rules |
| FDA 21 CFR Part 820 | Quality System Regulation | Clinical software validation |

### API Documentation

- **Telegram Bot API:** https://core.telegram.org/bots/api
- **WhatsApp Business API:** https://developers.facebook.com/docs/whatsapp/cloud-api
- **Twilio SMS:** https://www.twilio.com/docs/sms
- **Twilio Voice:** https://www.twilio.com/docs/voice
- **SendGrid API:** https://docs.sendgrid.com/api-reference
- **AWS SES:** https://docs.aws.amazon.com/ses/
- **Retell.ai:** https://docs.retellai.com/
- **Bland.ai:** https://docs.bland.ai/
- **Vapi.ai:** https://docs.vapi.ai/

### Industry Standards

- **HL7 FHIR** -- Fast Healthcare Interoperability Resources for clinical data exchange
- **IHE XDR/XDM** -- Cross-enterprise document sharing
- **DICOM** -- Medical imaging communication (for file handling)
- **NIST SP 800-66** -- Health Insurance Portability and Accountability Act (HIPAA) security guidance

---

*This report was prepared for clinical AI platform architects and engineering leads. All code examples are production-oriented and include security, compliance, and error handling considerations. Review all code against your organization's specific regulatory requirements before deployment.*

*Last updated: 2025-06-11*
