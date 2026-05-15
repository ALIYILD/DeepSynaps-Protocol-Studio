# Open Source AI Agent Stack for Clinical Applications
## Comprehensive Research Report for DeepSynaps Protocol Studio

**Document Version:** 2.0
**Date:** July 2025
**Author:** AI Research Agent
**Target:** DeepSynaps Clinical AI Agent Stack
**Word Count Target:** 1500+ lines

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [AI Receptionist / Chatbot Frameworks](#2-ai-receptionist--chatbot-frameworks)
3. [Agent Orchestration](#3-agent-orchestration)
4. [Tool Calling & Governance](#4-tool-calling--governance)
5. [Voice/Phone Agents](#5-voicephone-agents)
6. [Scheduling & Integration](#6-scheduling--integration)
7. [Monitoring & Observability](#7-monitoring--observability)
8. [Safety & Guardrails](#8-safety--guardrails)
9. [Medical AI Specific Tools](#9-medical-ai-specific-tools)
10. [Architecture Recommendations](#10-architecture-recommendations-for-deepsynaps)
11. [Compliance & Governance Matrix](#11-compliance--governance-matrix)
12. [Total Cost of Ownership Analysis](#12-total-cost-of-ownership-analysis)
13. [Appendices](#13-appendices)

---

## 1. Executive Summary

### 1.1 Overview

This report presents a comprehensive analysis of open-source tools for building clinical AI agents at DeepSynaps Protocol Studio. The clinical AI agent stack requires careful selection of components across eight categories, each with unique requirements for HIPAA compliance, data privacy, auditability, and medical accuracy.

### 1.2 Key Findings

| Category | Recommended Primary | Recommended Secondary |
|----------|--------------------|----------------------|
| Chatbot Framework | Rasa Pro (Apache 2.0) | Botpress (AGPL) |
| Agent Orchestration | LangGraph (MIT) | CrewAI (MIT) |
| Tool Calling | MCP (MIT) + Outlines (Apache) | Functionary (MIT) |
| Voice/Phone | LiveKit (Apache) + Twilio SDK | Vapi.ai (proprietary) |
| Scheduling | Cal.com (MIT) | N8N (fair-code) |
| Monitoring | Langfuse (MIT) | Helicone (Apache) |
| Safety | NeMo Guardrails (Apache) + LLM Guard (MIT) | Guardrails AI (Apache) |
| Medical AI | MONAI (Apache) + OpenEvidence | MedPaLM (research) |

### 1.3 Licensing Summary

All primary recommendations use permissive open-source licenses (Apache 2.0 or MIT) compatible with commercial clinical deployment. AGPL-licensed tools (Botpress, Cal.com legacy) require careful compliance review for network-use provisions. Fair-code tools (N8N) restrict SaaS resale but allow internal use.

### 1.4 Clinical Suitability Assessment

| Requirement | Status | Notes |
|------------|--------|-------|
| HIPAA Compliance | Achievable | All primary tools support self-hosting |
| Audit Logging | Full | Langfuse + LangSmith options |
| Data Residency | Full | Self-hosted stack ensures on-prem data |
| BAA Eligible | Partial | Requires commercial wrappers for some tools |
| FDA 510(k) Path | Available | Via MONAI Deploy + documented SDLC |

---

## 2. AI Receptionist / Chatbot Frameworks

### 2.1 Rasa

**Name:** Rasa (Rasa Pro / Rasa Open Source)
**Language:** Python
**License:** Apache 2.0 (Open Source); Commercial (Rasa Pro)
**GitHub:** https://github.com/RasaHQ/rasa
**GitHub Stars:** 20,000+ (combined ecosystem)
**Website:** https://rasa.com
**Latest Version:** 3.6+ (Open Source), 3.x (Rasa Pro with CALM)
**Active Contributors:** 500+

#### Key Features

- **CALM (Conversational AI with Language Models):** Rasa's next-generation dialogue management system that combines LLM reasoning with business logic. CALM enables natural conversations without requiring extensive NLU training data.
- **Enterprise NLU:** Intent classification, entity extraction, and context tracking with full model customization.
- **Visual Dialogue Builder:** Enterprise-grade conversation design tools.
- **Multi-channel:** Native connectors for WhatsApp, Telegram, Slack, MS Teams, web chat, voice (via Twilio), and custom channels.
- **On-premises Deployment:** Full Docker/Kubernetes support with Helm charts.
- **Analytics & Monitoring:** Built-in conversation analytics and reporting.
- **Human Handoff:** Seamless escalation to human agents.

#### Clinical Suitability

Rasa is the gold standard for healthcare chatbot deployment due to:
- **Full data control:** All patient data remains within your infrastructure
- **HIPAA-ready:** Self-hosted deployment with audit trails
- **Proven healthcare deployments:** Used by major health systems globally
- **Rasa Pro Developer Edition:** Free tier supports up to 1,000 monthly conversations
- **BAA Support:** Rasa Technologies offers Business Associate Agreements for covered entities

#### Integration Path with DeepSynaps

```python
# DeepSynaps Rasa Integration Example
# rasa/actions/actions.py

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet
import httpx

class ActionCheckAppointmentAvailability(Action):
    """DeepSynaps appointment availability check."""

    def name(self):
        return "action_check_appointment_availability"

    async def run(self, dispatcher, tracker, domain):
        specialty = tracker.get_slot("specialty")
        date_preference = tracker.get_slot("date_preference")
        patient_id = tracker.get_slot("patient_id")

        # Call DeepSynaps scheduling microservice
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "http://scheduling.deepsynaps.internal/availability",
                json={
                    "specialty": specialty,
                    "date": date_preference,
                    "patient_id": patient_id
                },
                headers={"Authorization": "Bearer ${DEEPSYNAPS_API_KEY}"}
            )
            availability = response.json()

        if availability["slots"]:
            dispatcher.utter_message(
                text=f"I found {len(availability['slots'])} available slots. "
                     f"The earliest is {availability['slots'][0]['time']}. "
                     "Would you like me to book it?"
            )
            return [SlotSet("available_slots", availability["slots"])]
        else:
            dispatcher.utter_message(
                text="I'm sorry, no slots are available for that date. "
                     "Would you like to check the next available day?"
            )
            return []

class ActionEscalateToHuman(Action):
    """Escalate to human clinical staff when confidence is low."""

    def name(self):
        return "action_escalate_to_human"

    async def run(self, dispatcher, tracker, domain):
        # Log escalation event to Langfuse for monitoring
        await log_to_langfuse({
            "event": "human_escalation",
            "conversation_id": tracker.sender_id,
            "last_intent": tracker.latest_message["intent"]["name"],
            "confidence": tracker.latest_message["intent"]["confidence"]
        })

        dispatcher.utter_message(
            text="I'm connecting you with a member of our clinical team. "
                 "Please hold while I find the best person to help you."
        )
        return []
```

#### Pricing

| Tier | Cost | Conversations | Features |
|------|------|--------------|----------|
| Open Source | Free (Apache 2.0) | Unlimited | Core NLU + dialogue |
| Developer Edition | Free | 1,000/month external; 100/month internal | Rasa Pro features |
| Enterprise | Custom pricing | Unlimited | Full security, analytics, support |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - Rasa is the premier choice for clinical chatbot deployment. Apache 2.0 license, extensive healthcare provenance, and full self-hosting capability make it ideal for HIPAA-compliant environments.

---

### 2.2 Botpress

**Name:** Botpress
**Language:** TypeScript / Node.js
**License:** AGPLv3 (v12) / Dual-licensed (AGPL + Proprietary)
**GitHub:** https://github.com/botpress/botpress
**GitHub Stars:** 14,600+ (v12); 19,000+ (combined)
**Website:** https://botpress.com
**Latest Version:** v12 (OSS) / Botpress Cloud (SaaS)

#### Key Features

- **Visual Flow Builder:** Drag-and-drop conversation designer accessible to non-technical users.
- **Built-in NLU Engine:** Intent classification and entity extraction without external dependencies.
- **Multi-channel Deployment:** Facebook, WhatsApp, Slack, MS Teams, Telegram, Webchat, SMS.
- **Code Actions:** Built-in JavaScript code editor for custom logic injection.
- **LLM Integration:** Native support for GPT-4o, Claude, Gemini, and open-source models (Llama 3).
- **RAG Support:** Built-in retrieval-augmented generation for knowledge bases.
- **Multi-Agent Router (2025):** Agent collaboration feature for complex workflows.
- **Live Database Connectors:** Direct SQL/NoSQL connections for natural language queries.

#### Clinical Suitability

Botpress offers rapid bot development with caveats:
- **AGPL License Impact:** Any modifications deployed over a network must have source code made available. This creates compliance complexity for SaaS clinical offerings.
- **Self-hosting:** Docker deployment available for v12; Botpress Cloud is NOT HIPAA-compliant without BAA.
- **NLU Quality:** Built-in NLU is less sophisticated than Rasa's for complex medical intent classification.
- **Visual Builder:** Significant advantage for clinical teams without dedicated AI engineers.

#### Integration Path with DeepSynaps

```javascript
// Botpress Code Action - DeepSynaps Appointment Booking
// hooks/before_incoming_middleware/deepsynaps_integration.js

const axios = require('axios');

async function checkAvailability(specialty, date, patientId) {
  try {
    const response = await axios.post(
      'http://scheduling.deepsynaps.internal/availability',
      { specialty, date, patient_id: patientId },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSYNAPS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    return response.data;
  } catch (error) {
    bp.logger.error('DeepSynaps scheduling error:', error.message);
    return { slots: [], error: true };
  }
}

// Register as Botpress action
const { Enterprise } = require('@botpress/enterprise');

module.exports = {
  async handler(bp, event) {
    const { specialty, date, patientId } = event.state.session;

    const availability = await checkAvailability(specialty, date, patientId);

    if (availability.error) {
      await bp.events.replyToEvent(event, {
        type: 'text',
        text: "I'm experiencing a technical issue. Please try again shortly."
      });
      return;
    }

    if (availability.slots.length > 0) {
      event.state.session.availableSlots = availability.slots;
      await bp.events.replyToEvent(event, {
        type: 'text',
        text: `I found ${availability.slots.length} available slots. ` +
              `The earliest is ${availability.slots[0].time}. ` +
              `Would you like me to book it?`
      });
    } else {
      await bp.events.replyToEvent(event, {
        type: 'text',
        text: "I'm sorry, no slots are available for that date. " +
              "Would you like to check the next available day?"
      });
    }
  }
};
```

#### Pricing

| Tier | Cost | Notes |
|------|------|-------|
| Botpress v12 OSS | Free (AGPL) | Self-hosted, community support |
| Botpress Cloud Free | $0 | Pay-as-you-go limited tier |
| Botpress Cloud Plus | $89/month | Professional tier |
| Enterprise | Custom | Full support, SLA, compliance |

#### Verdict for DeepSynaps

**CONDITIONAL RECOMMEND** - Excellent for rapid prototyping and teams with limited AI engineering resources. AGPL license requires careful legal review for clinical SaaS deployment. Recommend dual-licensing or using only as internal tooling.

---

### 2.3 Voiceflow

**Name:** Voiceflow
**Language:** TypeScript
**License:** Proprietary (various - core platform proprietary, some SDKs open)
**GitHub:** https://github.com/voiceflow
**GitHub Stars:** Various repos (primary repos have 1,000-1,500 stars)
**Website:** https://www.voiceflow.com

#### Key Features

- **Conversational AI Design Platform:** Visual design tool for voice and chat experiences.
- **Multi-modal:** Supports voice (Alexa, Google Assistant) and chat channels.
- **AI Agent Builder:** No-code/low-code AI agent construction with LLM integration.
- **Knowledge Base:** Built-in RAG for document-based responses.
- **Prototyping & Testing:** Real-time prototype testing within the platform.
- **Team Collaboration:** Version control and team workspaces.

#### Clinical Suitability

- **Proprietary Platform:** Not self-hostable; data resides on Voiceflow servers.
- **HIPAA Status:** Not HIPAA-compliant out of box; requires enterprise agreement.
- **Use Case:** Best suited for prototyping and non-PHI conversational experiences.
- **Open Source Components:** Some SDKs and adapters are open source under permissive licenses.

#### Integration Path with DeepSynaps

```typescript
// Voiceflow Custom Action - DeepSynaps Integration
// actions/deepsynaps-appointment.ts

import { ActionRequest, ActionResponse } from '@voiceflow/sdk';

interface AppointmentRequest {
  specialty: string;
  date_preference: string;
  patient_id: string;
  insurance?: string;
}

export const handleAppointmentRequest = async (
  request: ActionRequest<AppointmentRequest>
): Promise<ActionResponse> => {
  const { specialty, date_preference, patient_id, insurance } = request.payload;

  try {
    const response = await fetch(
      `${process.env.DEEPSYNAPS_API_URL}/scheduling/availability`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSYNAPS_API_KEY}`,
          'Content-Type': 'application/json',
          'X-Source': 'voiceflow'
        },
        body: JSON.stringify({
          specialty,
          date: date_preference,
          patient_id,
          insurance_verification: insurance ? true : false
        })
      }
    );

    if (!response.ok) {
      throw new Error(`DeepSynaps API error: ${response.status}`);
    }

    const availability = await response.json();

    return {
      slots: availability.slots,
      next_available: availability.next_available_date,
      requires_referral: availability.requires_referral || false
    };
  } catch (error) {
    console.error('DeepSynaps integration error:', error);
    return {
      error: 'Unable to retrieve availability. Please try again.',
      slots: []
    };
  }
};
```

#### Pricing

| Tier | Cost | Features |
|------|------|----------|
| Free | $0 | 10k interactions/month, 1 agent |
| Pro | $50/month | 50k interactions, custom domains |
| Team | $250/month | Unlimited agents, team features |
| Enterprise | Custom | HIPAA BAA, SLA, dedicated support |

#### Verdict for DeepSynaps

**NOT RECOMMENDED FOR PHI** - Excellent prototyping tool, but proprietary nature and cloud-only deployment create HIPAA compliance challenges. Consider only for non-clinical use cases (general information, wayfinding).

---

### 2.4 OpenAI Assistants API

**Name:** OpenAI Assistants API
**Language:** Python / JavaScript / REST
**License:** Proprietary (OpenAI Terms of Service) with open SDKs
**GitHub:** https://github.com/openai/openai-python
**GitHub Stars:** 25,000+
**Website:** https://platform.openai.com

#### Key Features

- **Thread Management:** Persistent conversation threads with built-in context management.
- **File Retrieval:** RAG-based document search and retrieval.
- **Code Interpreter:** Built-in Python code execution for data analysis.
- **Function Calling:** Structured tool integration with type-safe schemas.
- **Vector Store:** Managed embeddings for knowledge retrieval.
- **Multi-modal:** Image, audio, and text input support.

#### Clinical Suitability

- **HIPAA Compliance:** Available via Azure OpenAI Service with HIPAA compliance and BAA.
- **Data Privacy:** Standard API does NOT guarantee data privacy; Azure OpenAI required for PHI.
- **PHI Handling:** Never send PHI to standard OpenAI API endpoints.
- **Clinical Accuracy:** General-purpose model; not medically fine-tuned.

#### Integration Path with DeepSynaps

```python
# DeepSynaps OpenAI Assistants Integration
# assistants/clinical_assistant.py

import openai
from typing import List, Optional
import os

class DeepSynapsClinicalAssistant:
    """
    HIPAA-compliant clinical assistant using Azure OpenAI.
    NEVER use standard OpenAI API for PHI - always use Azure OpenAI.
    """

    def __init__(self):
        # Use Azure OpenAI for HIPAA compliance
        self.client = openai.AzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            api_version="2024-05-01-preview"
        )
        self.assistant_id = os.environ["AZURE_ASSISTANT_ID"]

    async def create_clinical_thread(
        self,
        patient_context: dict,
        tools_available: List[str]
    ) -> str:
        """Create a new clinical conversation thread."""

        thread = self.client.beta.threads.create(
            metadata={
                "session_type": "clinical_intake",
                "department": patient_context.get("department"),
                "anonymized_patient_id": patient_context.get("anon_id")
                # NEVER include actual PHI in metadata
            }
        )
        return thread.id

    async def send_message(
        self,
        thread_id: str,
        message: str,
        tool_outputs: Optional[List[dict]] = None
    ) -> dict:
        """Send message to assistant and get response."""

        # Add message to thread
        self.client.beta.threads.messages.create(
            thread_id=thread_id,
            role="user",
            content=message
        )

        # Run assistant with tools
        run = self.client.beta.threads.runs.create(
            thread_id=thread_id,
            assistant_id=self.assistant_id,
            tools=[
                {"type": "code_interpreter"},
                {"type": "file_search"},
                {
                    "type": "function",
                    "function": {
                        "name": "check_symptom_severity",
                        "description": "Assess symptom severity for triage",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "symptoms": {"type": "array", "items": {"type": "string"}},
                                "duration_days": {"type": "integer"},
                                "pain_level": {"type": "integer", "minimum": 1, "maximum": 10}
                            },
                            "required": ["symptoms"]
                        }
                    }
                }
            ]
        )

        return {"thread_id": thread_id, "run_id": run.id}

    async def requires_human_escalation(self, thread_id: str) -> bool:
        """Check if conversation requires human clinician."""
        messages = self.client.beta.threads.messages.list(thread_id=thread_id)
        # Implement escalation logic based on content analysis
        return False  # Placeholder
```

#### Pricing (Azure OpenAI - HIPAA Compliant)

| Model | Input | Output | Note |
|-------|-------|--------|------|
| GPT-4o | $5.00 / 1M tokens | $15.00 / 1M tokens | Best for clinical reasoning |
| GPT-4o-mini | $0.15 / 1M tokens | $0.60 / 1M tokens | Cost-effective triage |
| Assistants API | + $0.10 / GB / day (vector store) | | File storage |

#### Verdict for DeepSynaps

**RECOMMEND WITH AZURE OPENAI ONLY** - Powerful API but requires Azure deployment for HIPAA compliance. Use as LLM backend, not as primary patient-facing interface. Always route PHI through Azure OpenAI with BAA in place.

---

### 2.5 python-telegram-bot

**Name:** python-telegram-bot
**Language:** Python
**License:** LGPL-3.0
**GitHub:** https://github.com/python-telegram-bot/python-telegram-bot
**GitHub Stars:** 28,000+
**Website:** https://docs.python-telegram-bot.org

#### Key Features

- **Telegram Bot API Wrapper:** Complete, type-safe wrapper for Telegram Bot API.
- **Async Support:** Full asyncio integration for high-performance bots.
- **Type Hints:** Complete type annotation coverage.
- **Webhook & Polling:** Both deployment modes supported.
- **Rich Media:** Support for images, documents, voice messages, inline keyboards.
- **Job Queue:** Built-in scheduling for delayed tasks.
- **Extensible Handler System:** Command, message, callback query handlers.

#### Clinical Suitability

- **Telegram Privacy:** NOT HIPAA-compliant. Telegram stores messages on their servers.
- **Use Cases:** Patient engagement for non-PHI (appointment reminders without details), general health information, wellness coaching.
- **Patient Communication:** Can be used for anonymized appointment reminders, general wellness tips, facility information.
- **Limitation:** Never transmit PHI through Telegram.

#### Integration Path with DeepSynaps

```python
# DeepSynaps Telegram Bot - Non-PHI Patient Engagement
# bots/patient_engagement_bot.py

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    MessageHandler, filters, ContextTypes
)
import httpx
import os

# Store anonymized session mapping
# Maps telegram_user_id -> deepsynaps_patient_token (hashed)
SESSION_STORE = {}

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start command - verify patient identity."""
    await update.message.reply_text(
        "Welcome to DeepSynaps Health Assistant! \n\n"
        "I can help you with:\n"
        "- General health information\n"
        "- Facility hours and locations\n"
        "- Medication reminders (non-identifying)\n"
        "- Wellness tips\n\n"
        "Note: For privacy protection, I cannot discuss specific "
        "medical conditions through this channel. Please use our "
        "secure patient portal for clinical communications."
    )

async def check_appointments(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Check upcoming appointments - anonymized."""
    user_id = update.effective_user.id

    # Use anonymized token - never expose PHI
    anon_token = SESSION_STORE.get(user_id)
    if not anon_token:
        await update.message.reply_text(
            "Please authenticate through the secure patient portal first."
        )
        return

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://api.deepsynaps.internal/v1/appointments/upcoming",
            headers={"X-Anon-Token": anon_token},
            timeout=10.0
        )

        if response.status_code == 200:
            data = response.json()
            if data["appointments"]:
                keyboard = [
                    [InlineKeyboardButton(
                        "Confirm", callback_data=f"confirm_{appt['id']}"
                    ),
                    InlineKeyboardButton(
                        "Reschedule", callback_data=f"resch_{appt['id']}"
                    )]
                    for appt in data["appointments"]
                ]
                reply_markup = InlineKeyboardMarkup(keyboard)
                await update.message.reply_text(
                    f"You have {len(data['appointments'])} upcoming appointment(s).\n"
                    "Use the buttons below to manage:",
                    reply_markup=reply_markup
                )
            else:
                await update.message.reply_text(
                    "You have no upcoming appointments. "
                    "Would you like to schedule one?"
                )

def main():
    application = Application.builder().token(
        os.environ["TELEGRAM_BOT_TOKEN"]
    ).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("appointments", check_appointments))

    application.run_polling()

if __name__ == "__main__":
    main()
```

#### Pricing

| Component | Cost |
|-----------|------|
| python-telegram-bot library | Free (LGPL-3) |
| Telegram Bot API | Free |
| Hosting | Self-hosted (your infrastructure) |

#### Verdict for DeepSynaps

**RECOMMEND FOR NON-PHI USE ONLY** - Excellent for patient engagement, wellness coaching, and general health information. LGPL license is compatible with commercial use. NEVER use for PHI transmission. Ideal for reducing call volume with automated FAQ and appointment reminders.

---

## 3. Agent Orchestration

### 3.1 LangGraph

**Name:** LangGraph
**Language:** Python / JavaScript / TypeScript
**License:** MIT
**GitHub:** https://github.com/langchain-ai/langgraph
**GitHub Stars:** 15,000+ (LangGraph standalone); 95,000+ (LangChain ecosystem)
**Website:** https://langchain-ai.github.io/langgraph/
**Latest Version:** 0.2+
**PyPI Downloads:** 47M+ monthly

#### Key Features

- **Graph-based Agent Workflows:** Model agent workflows as directed graphs with nodes (functions) and edges (execution flow).
- **Stateful Execution:** Persistent state management across agent steps with checkpointing.
- **Time-travel Debugging:** Pause, inspect, and replay any point in agent execution.
- **Durable Execution:** Agents survive API failures, restarts, and long-running async operations.
- **Cycles & Branching:** Support for loops, conditional edges, and parallel execution.
- **Human-in-the-loop:** Built-in breakpoints for human approval of critical actions.
- **MCP Native Support:** Direct integration with Model Context Protocol for tool ecosystem.
- **LangSmith Integration:** End-to-end observability, tracing, and evaluation.

#### Clinical Suitability

LangGraph is the premier production agent framework for clinical AI:
- **Full control:** Explicit graph definition means every clinical decision path is auditable.
- **Human oversight:** Built-in breakpoints for clinician approval before critical actions.
- **Error recovery:** Durable execution ensures no patient request is lost mid-process.
- **State management:** Complete conversation and patient context persistence.
- **Self-hostable:** Deploy on your infrastructure; all PHI stays within network.

#### Integration Path with DeepSynaps

```python
# DeepSynaps Clinical Agent - LangGraph Implementation
# agents/clinical_intake_agent.py

from typing import TypedDict, Annotated, Literal
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage
import operator
import os

# State definition
class ClinicalIntakeState(TypedDict):
    messages: Annotated[list, operator.add]
    patient_symptoms: list
    severity_score: int
    triage_level: Literal["emergency", "urgent", "routine", "self_care"]
    department: str
    human_approval_needed: bool
    next_step: str

# Initialize model (always use Azure OpenAI for PHI)
llm = AzureChatOpenAI(
    azure_deployment="gpt-4o-clinical",
    api_version="2024-05-01-preview",
    temperature=0.1,  # Low temperature for clinical accuracy
)

# Node: Symptom Collection
def collect_symptoms(state: ClinicalIntakeState):
    """Gather patient symptoms and concerns."""
    messages = state["messages"]
    last_message = messages[-1].content if messages else ""

    # Extract symptoms using structured output
    response = llm.invoke([
        HumanMessage(content=f"""As a clinical intake assistant, analyze the following patient message
        and extract symptoms, duration, and severity. Assign a preliminary severity score (1-10).

        Patient message: {last_message}

        Respond in a structured format with:
        - symptoms: list of symptoms mentioned
        - duration: how long symptoms have been present
        - severity_score: 1-10 rating
        - follow_up_question: what to ask next""")
    ])

    return {
        "messages": [AIMessage(content=response.content)],
        "patient_symptoms": state.get("patient_symptoms", []) + [last_message],
        "severity_score": extract_severity(response.content)
    }

# Node: Triage Assessment
def triage_assessment(state: ClinicalIntakeState):
    """Determine appropriate care level based on symptoms."""
    severity = state.get("severity_score", 5)

    if severity >= 8:
        triage = "emergency"
    elif severity >= 5:
        triage = "urgent"
    elif severity >= 2:
        triage = "routine"
    else:
        triage = "self_care"

    department = route_to_department(state["patient_symptoms"])

    return {
        "triage_level": triage,
        "department": department,
        "human_approval_needed": triage in ["emergency", "urgent"]
    }

# Node: Human Escalation
def human_escalation(state: ClinicalIntakeState):
    """Escalate to human clinician for high-acuity cases."""
    return {
        "messages": [AIMessage(content=(
            "I've identified that your symptoms require prompt clinical attention. "
            "I'm connecting you with a member of our clinical team now. "
            "Please do not hang up."
        ))],
        "next_step": "human_handoff"
    }

# Node: Schedule Appointment
def schedule_routine(state: ClinicalIntakeState):
    """Offer scheduling for routine appointments."""
    return {
        "messages": [AIMessage(content=(
            f"Based on your symptoms, I recommend scheduling an appointment "
            f"with our {state['department']} department. "
            f"Would you like me to check availability?"
        ))],
        "next_step": "scheduling"
    }

# Conditional edges
def route_triage(state: ClinicalIntakeState):
    """Determine next node based on triage level."""
    if state["human_approval_needed"]:
        return "human_escalation"
    elif state["triage_level"] == "self_care":
        return "self_care_advice"
    else:
        return "schedule_routine"

# Build the graph
workflow = StateGraph(ClinicalIntakeState)

workflow.add_node("collect_symptoms", collect_symptoms)
workflow.add_node("triage_assessment", triage_assessment)
workflow.add_node("human_escalation", human_escalation)
workflow.add_node("schedule_routine", schedule_routine)
workflow.add_node("self_care_advice", lambda state: {
    "messages": [AIMessage(content="Here are some self-care recommendations...")],
    "next_step": "complete"
})

workflow.set_entry_point("collect_symptoms")
workflow.add_edge("collect_symptoms", "triage_assessment")
workflow.add_conditional_edges(
    "triage_assessment",
    route_triage,
    {
        "human_escalation": "human_escalation",
        "schedule_routine": "schedule_routine",
        "self_care_advice": "self_care_advice"
    }
)
workflow.add_edge("human_escalation", END)
workflow.add_edge("schedule_routine", END)
workflow.add_edge("self_care_advice", END)

# Compile with memory checkpointing
memory = MemorySaver()
clinical_agent = workflow.compile(checkpointer=memory)

# Usage
async def run_intake(patient_message: str, thread_id: str):
    result = await clinical_agent.ainvoke(
        {"messages": [HumanMessage(content=patient_message)]},
        config={"configurable": {"thread_id": thread_id}}
    )
    return result
```

#### Pricing

| Component | Cost | Notes |
|-----------|------|-------|
| LangGraph library | Free (MIT) | Open source |
| LangGraph Platform | Usage-based | Managed cloud deployment |
| LangSmith | Free tier + usage | Observability platform |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - LangGraph is the definitive choice for production clinical agent orchestration. Graph-based control provides the auditability, human-in-the-loop capability, and error recovery essential for clinical workflows.

---

### 3.2 LangChain

**Name:** LangChain
**Language:** Python / JavaScript / TypeScript
**License:** MIT
**GitHub:** https://github.com/langchain-ai/langchain
**GitHub Stars:** 95,000+
**Website:** https://langchain.com
**PyPI Downloads:** 47M+ monthly

#### Key Features

- **LLM Abstraction:** Unified interface for 100+ LLM providers.
- **Chains:** Compose LLM calls with prompts, tools, and memory.
- **Retrieval:** RAG pipelines with document loaders, text splitters, and vector stores.
- **Agents:** ReAct, Plan-and-Execute, and custom agent architectures.
- **Output Parsers:** Structured output parsing with Pydantic integration.
- **Memory:** Conversation history management (short-term and long-term).
- **Tool Integration:** Standardized tool calling interface.

#### Clinical Suitability

LangChain serves as the foundational layer for clinical AI:
- **Provider flexibility:** Switch between Azure OpenAI, local models, and other providers without code changes.
- **RAG for clinical knowledge:** Build retrieval systems over medical literature, clinical guidelines, and formularies.
- **Composable chains:** Build reusable clinical decision support components.
- **Mature ecosystem:** Largest community, most integrations, extensive documentation.

#### Integration Path with DeepSynaps

```python
# DeepSynaps LangChain Clinical RAG Pipeline
# rag/clinical_knowledge_base.py

from langchain_openai import AzureOpenAIEmbeddings, AzureChatOpenAI
from langchain_community.vectorstores import PGVector
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain.retrievers import MultiQueryRetriever
import os

# Initialize embeddings (use Azure for PHI)
embeddings = AzureOpenAIEmbeddings(
    azure_deployment="text-embedding-3-large",
    api_version="2024-02-01"
)

# Initialize LLM
llm = AzureChatOpenAI(
    azure_deployment="gpt-4o-clinical",
    temperature=0.1
)

# Vector store in self-hosted PostgreSQL
vectorstore = PGVector(
    connection_string=os.environ["DEEPSYNAPS_PG_VECTOR_URL"],
    embedding_function=embeddings,
    collection_name="clinical_guidelines"
)

# Multi-query retriever for better coverage
retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(search_k=5),
    llm=llm
)

# Clinical prompt template
clinical_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a clinical decision support assistant. Use the provided
    context from verified medical guidelines to answer the clinician's question.

    Important constraints:
    - Always cite the source guideline for each recommendation
    - If evidence is insufficient, clearly state this
    - Never provide definitive diagnoses
    - Include confidence levels for recommendations
    - Flag any contraindications mentioned in the context

    Context: {context}"""),
    ("human", "{question}")
])

# Build the RAG chain
rag_chain = (
    {"context": retriever | format_docs, "question": RunnablePassthrough()}
    | clinical_prompt
    | llm
)

async def query_clinical_knowledge(question: str) -> dict:
    """Query the clinical knowledge base with full provenance."""

    # Use invoke for structured output
    response = await rag_chain.ainvoke(question)

    # Retrieve sources for citation
    sources = await retriever.aget_relevant_documents(question)

    return {
        "answer": response.content,
        "sources": [
            {
                "title": doc.metadata.get("title"),
                "guideline_body": doc.metadata.get("organization"),
                "relevance_score": doc.metadata.get("score"),
                "publication_date": doc.metadata.get("date")
            }
            for doc in sources
        ],
        "disclaimer": "This information is for decision support only. "
                      "Always apply clinical judgment."
    }

def format_docs(docs):
    return "\n\n".join([
        f"Source: {d.metadata.get('title', 'Unknown')}\n{d.page_content}"
        for d in docs
    ])
```

#### Pricing

| Component | Cost |
|-----------|------|
| LangChain library | Free (MIT) |
| LangSmith observability | Free tier + usage-based |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - Essential foundation layer. Use as the abstraction layer for LLM interactions, RAG pipelines, and tool management. Combine with LangGraph for agent orchestration.

---

### 3.3 CrewAI

**Name:** CrewAI
**Language:** Python
**License:** MIT
**GitHub:** https://github.com/joaomdmoura/crewAI
**GitHub Stars:** 25,000+
**Website:** https://crewai.io

#### Key Features

- **Role-based Multi-Agent Teams:** Define agents by expertise, goals, and expected behavior.
- **Task Delegation:** Built-in task assignment and handoff between agents.
- **Sequential/Parallel Execution:** Flexible process orchestration.
- **Memory System:** Short-term, long-term, and entity memory for agents.
- **Human Input:** Configurable human-in-the-loop checkpoints.
- **Tool Sharing:** Agents can share tools and collaborate on outcomes.

#### Clinical Suitability

CrewAI excels for multi-disciplinary clinical workflows:
- **Care team simulation:** Create virtual care teams (intake nurse, specialist, care coordinator).
- **Research synthesis:** Multi-agent literature review and evidence synthesis.
- **Case review:** Parallel specialist consultation simulation.
- **Documentation:** Collaborative note generation and review.

#### Integration Path with DeepSynaps

```python
# DeepSynaps CrewAI Clinical Team
# agents/clinical_crew.py

from crewai import Agent, Task, Crew, Process
from crewai.tools import tool
from langchain_openai import AzureChatOpenAI
import httpx

# Shared LLM
llm = AzureChatOpenAI(
    azure_deployment="gpt-4o-clinical",
    temperature=0.2
)

# Custom tools for clinical agents
@tool
def search_clinical_guidelines(query: str) -> str:
    """Search clinical guidelines for evidence-based recommendations."""
    # Implementation calls DeepSynaps RAG service
    return "Guideline results..."

@tool
def check_drug_interactions(medication_list: str) -> str:
    """Check for drug-drug interactions."""
    # Implementation calls DeepSynaps pharmacy service
    return "Interaction check results..."

@tool
def schedule_consultation(specialty: str, urgency: str) -> str:
    """Schedule specialist consultation."""
    # Implementation calls DeepSynaps scheduling service
    return "Scheduling result..."

# Define clinical agents
intake_nurse = Agent(
    role="Intake Nurse",
    goal="Conduct thorough patient intake and symptom assessment",
    backstory="Experienced registered nurse specializing in patient intake. "
              "Skilled at eliciting comprehensive symptom histories and "
              "identifying red flags requiring urgent attention.",
    llm=llm,
    tools=[search_clinical_guidelines],
    verbose=True,
    allow_delegation=True
)

triage_physician = Agent(
    role="Triage Physician",
    goal="Assess clinical urgency and determine appropriate care pathway",
    backstory="Board-certified emergency medicine physician with expertise "
              "in clinical triage. Responsible for determining appropriate "
              "level of care based on presenting symptoms.",
    llm=llm,
    tools=[search_clinical_guidelines, check_drug_interactions],
    verbose=True,
    allow_delegation=True
)

care_coordinator = Agent(
    role="Care Coordinator",
    goal="Ensure smooth patient care transitions and follow-up",
    backstory="Experienced care coordinator specializing in patient navigation. "
              "Ensures patients receive appropriate follow-up care and "
              "coordinates between different care teams.",
    llm=llm,
    tools=[schedule_consultation],
    verbose=True,
    allow_delegation=False
)

# Define tasks
intake_task = Task(
    description="""Conduct initial patient intake for: {patient_presenting_complaint}

    Gather:
    1. Chief complaint and HPI
    2. Relevant medical history
    3. Current medications
    4. Allergies
    5. Social determinants of health

    Output a structured intake summary.""",
    agent=intake_nurse,
    expected_output="Structured patient intake summary with all relevant clinical information"
)

triage_task = Task(
    description="""Based on the intake summary, determine:
    1. Appropriate triage level (emergency/urgent/routine/self-care)
    2. Recommended department/specialty
    3. Any immediate red flags requiring escalation
    4. Suggested diagnostic workup

    Consider drug interactions and comorbidities.""",
    agent=triage_physician,
    expected_output="Clinical triage decision with rationale and recommendations",
    context=[intake_task]
)

coordination_task = Task(
    description="""Based on the triage decision:
    1. Schedule appropriate appointments
    2. Coordinate referrals if needed
    3. Ensure patient receives preparation instructions
    4. Arrange follow-up care

    Provide complete care coordination plan.""",
    agent=care_coordinator,
    expected_output="Complete care coordination plan with scheduled appointments",
    context=[triage_task]
)

# Create the clinical crew
clinical_crew = Crew(
    agents=[intake_nurse, triage_physician, care_coordinator],
    tasks=[intake_task, triage_task, coordination_task],
    process=Process.sequential,
    memory=True,
    verbose=True
)

# Execute
async def run_clinical_crew(patient_complaint: str):
    result = await clinical_crew.kickoff_async(
        inputs={"patient_presenting_complaint": patient_complaint}
    )
    return result
```

#### Pricing

| Component | Cost |
|-----------|------|
| CrewAI library | Free (MIT) |
| CrewAI+ (managed) | Usage-based |
| LLM costs | Provider-dependent |

#### Verdict for DeepSynaps

**RECOMMEND** - Excellent for complex multi-disciplinary clinical workflows. Role-based architecture naturally maps to clinical team structures. MIT license is fully compatible. Higher token consumption than LangGraph should be factored into cost estimates.

---

### 3.4 AutoGen / Microsoft Agent Framework

**Name:** AutoGen (merging into Microsoft Agent Framework)
**Maintainer:** Microsoft Research
**Language:** Python / .NET (C#)
**License:** MIT
**GitHub:** https://github.com/microsoft/autogen
**GitHub Stars:** 50,400+
**Website:** https://microsoft.github.io/autogen/

#### Key Features

- **Multi-Agent Conversation:** Agents converse with each other to solve complex tasks.
- **Conversable Agents:** Both human and AI participants in conversations.
- **Code Execution:** Built-in secure code execution environments.
- **AutoGen Studio:** Visual interface for building agent workflows.
- **Microsoft Ecosystem Integration:** Deep Azure, Teams, Dynamics integration.
- **Unified Agent Framework:** AutoGen + Semantic Kernel merger (2025-2026).

#### Clinical Suitability

- **Research powerhouse:** Strong academic backing, extensive research papers.
- **Microsoft ecosystem:** Ideal for organizations already using Azure, Teams, M365.
- **Magentic-One:** Multi-agent architecture for complex task solving.
- **Note:** Project is transitioning to Microsoft Agent Framework; expect API changes.

#### Integration Path with DeepSynaps

```python
# DeepSynaps AutoGen Clinical Multi-Agent System
# agents/autogen_clinical_team.py

import autogen
from autogen import AssistantAgent, UserProxyAgent, GroupChat
import os

# LLM configuration - use Azure OpenAI
config_list = [{
    "model": "gpt-4o-clinical",
    "base_url": os.environ["AZURE_OPENAI_ENDPOINT"],
    "api_key": os.environ["AZURE_OPENAI_API_KEY"],
    "api_type": "azure",
    "api_version": "2024-05-01-preview"
}]

llm_config = {
    "config_list": config_list,
    "temperature": 0.1,
    "timeout": 120
}

# Clinical specialist agents
intake_agent = AssistantAgent(
    name="IntakeSpecialist",
    llm_config=llm_config,
    system_message="""You are a clinical intake specialist. Your role is to:
    1. Gather comprehensive symptom information
    2. Collect relevant medical history
    3. Identify red flags requiring urgent attention
    4. Create structured intake summaries

    Always be thorough, empathetic, and professional.
    If you detect emergency symptoms, immediately recommend escalation."""
)

triage_agent = AssistantAgent(
    name="TriagePhysician",
    llm_config=llm_config,
    system_message="""You are a triage physician. Your role is to:
    1. Review intake summaries
    2. Determine appropriate triage level
    3. Recommend care pathway
    4. Suggest initial diagnostic workup

    Base decisions on clinical guidelines and evidence-based medicine.
    Always consider patient safety first."""
)

care_coordinator_agent = AssistantAgent(
    name="CareCoordinator",
    llm_config=llm_config,
    system_message="""You are a care coordinator. Your role is to:
    1. Schedule appropriate appointments
    2. Coordinate specialist referrals
    3. Ensure care continuity
    4. Provide patient education materials

    Focus on patient experience and care quality."""
)

# Human proxy for oversight
user_proxy = UserProxyAgent(
    name="ClinicalOversight",
    human_input_mode="ALWAYS",  # Require human approval
    max_consecutive_auto_reply=2,
    code_execution_config={"work_dir": "clinical_workspace"}
)

# Group chat for clinical team collaboration
groupchat = GroupChat(
    agents=[user_proxy, intake_agent, triage_agent, care_coordinator_agent],
    messages=[],
    max_round=15,
    speaker_selection_method="round_robin"
)

manager = autogen.GroupChatManager(
    groupchat=groupchat,
    llm_config=llm_config
)

# Execute clinical consultation
async def run_clinical_consultation(patient_case: str):
    await user_proxy.a_initiate_chat(
        manager,
        message=f"""New patient case requires clinical team consultation:

{patient_case}

Please work through this case systematically:
1. Intake: Gather all relevant clinical information
2. Triage: Determine appropriate care level
3. Coordination: Plan follow-up care

Report final recommendations to ClinicalOversight for approval."""
    )
```

#### Pricing

| Component | Cost |
|-----------|------|
| AutoGen library | Free (MIT) |
| Azure OpenAI | Usage-based |
| AutoGen Studio | Free |

#### Verdict for DeepSynaps

**RECOMMEND FOR MICROSOFT ECOSYSTEMS** - Strong choice for Azure-native deployments. 50K+ stars indicate massive community support. Note the transition to Microsoft Agent Framework; plan for migration. Best when combined with Azure's compliance infrastructure.

---

### 3.5 OpenHands

**Name:** OpenHands (formerly OpenDevin)
**Maintainer:** All-Hands AI
**Language:** Python
**License:** MIT
**GitHub:** https://github.com/OpenHands/OpenHands
**GitHub Stars:** 70,000+
**Website:** https://openhands.dev
**Funding:** $18.8M Series A

#### Key Features

- **AI Software Engineering Agent:** Autonomous code writing, testing, and deployment.
- **Sandboxed Execution:** Docker-based secure code execution.
- **Multi-model Support:** Works with any LLM (Claude, GPT, local models via Ollama).
- **Web Browsing:** Built-in browser automation for research.
- **SDK & CLI:** Programmatic access and command-line interface.
- **Multi-agent Delegation:** Internal task decomposition and agent delegation.

#### Clinical Suitability

OpenHands is NOT a clinical AI tool but serves critical infrastructure roles:
- **Development acceleration:** Automate clinical integration code generation.
- **Testing:** Automated test generation for clinical decision support systems.
- **DevOps:** Infrastructure automation for clinical AI deployment.
- **Documentation:** Automated documentation generation for clinical APIs.
- **SWE-bench:** 77.6% performance on verified benchmarks.

#### Integration Path with DeepSynaps

```python
# OpenHands for Clinical AI Development Acceleration
# dev/clinical_code_generator.py

"""
Use OpenHands SDK to automate clinical integration code generation.
This is a development tool, not a clinical-facing agent.
"""

from openhands import OpenHandsClient
import os

# Initialize OpenHands for development tasks
client = OpenHandsClient(
    llm_provider="azure",  # Use Azure OpenAI
    llm_config={
        "deployment": "gpt-4o",
        "endpoint": os.environ["AZURE_OPENAI_ENDPOINT"],
        "api_key": os.environ["AZURE_OPENAI_API_KEY"]
    },
    workspace="/workspace/deepsynaps"
)

async def generate_fhir_integration(resource_type: str):
    """Generate FHIR integration code for a specific resource type."""

    task = f"""Create a Python module for FHIR {resource_type} resource integration
    with the following requirements:

    1. Read and write {resource_type} resources to a FHIR R4 server
    2. Validate resources against FHIR profiles
    3. Handle pagination for search results
    4. Implement audit logging for all operations
    5. Include comprehensive unit tests
    6. Follow HIPAA security best practices
    7. Use pydantic for data validation
    8. Include type hints throughout

    Save the code to src/deepsynaps/fhir/{resource_type.lower()}_service.py
    """

    result = await client.run_task(task)
    return result

async def generate_clinical_tests():
    """Generate comprehensive test suite for clinical decision support."""

    task = """Generate a comprehensive test suite for the clinical
    decision support module with:

    1. Unit tests for all triage logic
    2. Integration tests for LLM interactions
    3. Property-based tests for symptom parsing
    4. Mock FHIR server for testing
    5. Performance tests for response time SLA
    6. Security tests for PHI handling
    7. Concurrency tests for multi-patient scenarios

    Use pytest, hypothesis, and factory_boy.
    Save to tests/clinical/ directory.
    """

    result = await client.run_task(task)
    return result
```

#### Pricing

| Component | Cost |
|-----------|------|
| OpenHands core | Free (MIT) |
| LLM API costs | Provider-dependent |
| OpenHands Cloud | Free tier available |

#### Verdict for DeepSynaps

**RECOMMEND FOR DEVELOPMENT ACCELERATION** - Outstanding tool for accelerating clinical AI development. 70K stars, MIT license, and model-agnostic design make it ideal for building DeepSynaps infrastructure. NOT for clinical-facing use.

---

## 4. Tool Calling & Governance

### 4.1 MCP (Model Context Protocol)

**Name:** Model Context Protocol (MCP)
**Creator:** Anthropic
**Language:** TypeScript / Python
**License:** MIT
**GitHub:** https://github.com/modelcontextprotocol
**GitHub Stars:** 8,100+ (specification); rapidly growing ecosystem
**Website:** https://modelcontextprotocol.io

#### Key Features

- **Universal Tool Interface:** Standard protocol connecting AI models to external tools.
- **JSON-RPC 2.0 Based:** Built on proven communication standard.
- **Three Primitives:** Tools (actions), Resources (data), Prompts (templates).
- **Transport Flexibility:** stdio (local) and SSE/HTTP (remote) transports.
- **Ecosystem:** 50+ official integrations (GitHub, Slack, PostgreSQL, etc.).
- **Provider Agnostic:** Works with any LLM that supports function calling.

#### Clinical Suitability

MCP is transformative for clinical AI governance:
- **Standardized tool access:** Single protocol for all clinical tools (scheduling, EHR, lab systems).
- **Auditability:** Every tool call is logged through standardized interface.
- **Access control:** Centralized permission management for clinical tool access.
- **Vendor independence:** Switch LLM providers without changing tool integrations.

#### Integration Path with DeepSynaps

```python
# DeepSynaps MCP Server - Clinical Tool Gateway
# mcp/clinical_mcp_server.py

from mcp.server import Server
from mcp.types import Tool, TextContent
import httpx
import os

# Create MCP server for clinical tools
app = Server("deepsynaps-clinical-gateway")

@app.list_tools()
async def list_tools():
    """Define available clinical tools."""
    return [
        Tool(
            name="check_appointment_availability",
            description="Check available appointment slots for a specialty",
            inputSchema={
                "type": "object",
                "properties": {
                    "specialty": {
                        "type": "string",
                        "enum": ["cardiology", "dermatology", "endocrinology",
                                "neurology", "orthopedics", "primary_care"]
                    },
                    "date_range_start": {"type": "string", "format": "date"},
                    "date_range_end": {"type": "string", "format": "date"},
                    "provider_id": {"type": "string", "optional": True}
                },
                "required": ["specialty", "date_range_start"]
            }
        ),
        Tool(
            name="schedule_appointment",
            description="Schedule a patient appointment",
            inputSchema={
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "provider_id": {"type": "string"},
                    "datetime": {"type": "string", "format": "date-time"},
                    "appointment_type": {
                        "type": "string",
                        "enum": ["new_patient", "follow_up", "urgent", "telehealth"]
                    },
                    "reason": {"type": "string"}
                },
                "required": ["patient_id", "provider_id", "datetime"]
            }
        ),
        Tool(
            name="lookup_patient_summary",
            description="Retrieve anonymized patient summary for clinical context",
            inputSchema={
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "include_medications": {"type": "boolean", "default": False},
                    "include_allergies": {"type": "boolean", "default": True},
                    "include_recent_visits": {"type": "boolean", "default": True}
                },
                "required": ["patient_id"]
            }
        ),
        Tool(
            name="send_patient_message",
            description="Send secure message to patient via portal",
            inputSchema={
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "message": {"type": "string"},
                    "priority": {"type": "string", "enum": ["low", "normal", "high"]},
                    "message_type": {"type": "string", "enum": ["clinical", "administrative", "reminder"]}
                },
                "required": ["patient_id", "message"]
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict):
    """Execute clinical tool with full audit logging."""

    # Log tool call for audit
    await audit_log({
        "tool": name,
        "arguments": anonymize_for_log(arguments),
        "timestamp": "iso-format",
        "source": "mcp_client"
    })

    # Route to appropriate handler
    if name == "check_appointment_availability":
        return await handle_check_availability(arguments)
    elif name == "schedule_appointment":
        return await handle_schedule_appointment(arguments)
    elif name == "lookup_patient_summary":
        return await handle_patient_lookup(arguments)
    elif name == "send_patient_message":
        return await handle_send_message(arguments)
    else:
        raise ValueError(f"Unknown tool: {name}")

async def handle_check_availability(args: dict):
    """Check appointment availability via DeepSynaps scheduling service."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://scheduling.deepsynaps.internal/api/v1/availability",
            json=args,
            headers={"Authorization": f"Bearer {os.environ['DEEPSYNAPS_API_KEY']}"},
            timeout=10.0
        )
        data = response.json()

    return [TextContent(
        type="text",
        text=f"Available slots: {len(data['slots'])}\n" +
             "\n".join([f"- {s['datetime']} with Dr. {s['provider_name']}"
                       for s in data['slots'][:5]])
    )]

async def audit_log(entry: dict):
    """Write audit log entry for compliance."""
    # Implementation writes to secure audit log store
    pass

async def anonymize_for_log(arguments: dict) -> dict:
    """Remove PHI from log entries."""
    # Implementation anonymizes sensitive fields
    return arguments

# Start server
if __name__ == "__main__":
    import asyncio
    from mcp.server.stdio import stdio_server

    async def main():
        async with stdio_server() as (read_stream, write_stream):
            await app.run(
                read_stream,
                write_stream,
                app.create_initialization_options()
            )

    asyncio.run(main())
```

#### Pricing

| Component | Cost |
|-----------|------|
| MCP specification | Free (MIT) |
| MCP servers | Free (various licenses) |
| MCP SDKs | Free |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - MCP is the emerging standard for clinical AI tool governance. MIT license, Anthropic backing, and rapid ecosystem growth make it essential for DeepSynaps. Implement as the standard tool gateway for all clinical agent interactions.

---

### 4.2 Functionary (MeetKai)

**Name:** Functionary
**Maintainer:** MeetKai
**Language:** Python
**License:** MIT
**GitHub:** https://github.com/MeetKai/functionary
**GitHub Stars:** 3,500+

#### Key Features

- **Function-calling LLMs:** Models specifically trained for tool use.
- **Parallel Function Execution:** Intelligent parallel vs. serial tool determination.
- **OpenAI-compatible API:** Drop-in replacement for OpenAI function calling.
- **Multiple Model Sizes:** Small (7B), Medium (70B) variants.
- **vLLM/SGLang Support:** High-throughput inference servers.
- **GGUF Quantization:** Runs on consumer hardware via llama.cpp.

#### Clinical Suitability

- **On-premise deployment:** Run function-calling models locally - no PHI leaves network.
- **Cost effective:** No per-token API costs after initial hardware investment.
- **Functionary V4:** Newest version with reasoning before tool use.
- **Performance:** 2nd place on Berkeley Function-Calling Leaderboard.

#### Integration Path with DeepSynaps

```python
# Functionary for On-Premise Clinical Tool Calling
# inference/functionary_server.py

from vllm import LLM
from vllm.sampling_params import SamplingParams
from transformers import AutoTokenizer
import json

# Load Functionary model locally
model = LLM(
    model="meetkai/functionary-small-v4.0",
    tensor_parallel_size=1,  # Adjust based on GPU count
    max_model_len=8192
)
tokenizer = AutoTokenizer.from_pretrained("meetkai/functionary-small-v4.0")

# Define clinical tools
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_patient_vitals",
            "description": "Retrieve latest patient vital signs",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "vital_types": {
                        "type": "array",
                        "items": {"enum": ["bp", "hr", "temp", "spo2", "weight"]}
                    }
                },
                "required": ["patient_id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_lab_results",
            "description": "Check recent laboratory results",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "test_types": {
                        "type": "array",
                        "items": {"enum": ["cbc", "bmp", "lipid", "a1c", "tsh"]}
                    }
                },
                "required": ["patient_id"]
            }
        }
    }
]

async def clinical_function_call(patient_query: str, patient_context: dict):
    """Process clinical query with local function-calling model."""

    messages = [
        {"role": "system", "content": "You are a clinical assistant. Use available tools to retrieve patient information."},
        {"role": "user", "content": patient_query}
    ]

    # Generate tool call
    outputs = model.chat(
        messages=messages,
        tools=tools,
        sampling_params=SamplingParams(temperature=0.1, max_tokens=500)
    )

    response = outputs[0].outputs[0].text

    # Parse tool calls and execute
    tool_calls = parse_tool_calls(response)
    results = []
    for call in tool_calls:
        result = await execute_clinical_tool(call)
        results.append(result)

    # Generate final response with tool results
    final_messages = messages + [
        {"role": "assistant", "content": response},
        {"role": "tool", "content": json.dumps(results)}
    ]

    final_output = model.chat(
        messages=final_messages,
        sampling_params=SamplingParams(temperature=0.1)
    )

    return final_output[0].outputs[0].text
```

#### Pricing

| Component | Cost |
|-----------|------|
| Functionary model | Free (MIT) |
| Inference hardware | GPU required (24GB VRAM for small, 80GB for medium) |
| vLLM/SGLang | Free |

#### Verdict for DeepSynaps

**RECOMMEND FOR ON-PREMISE DEPLOYMENTS** - Excellent choice when PHI must never leave the network. MIT license, strong function-calling performance, and local execution make it ideal for air-gapped clinical environments.

---

### 4.3 Outlines

**Name:** Outlines
**Maintainer:** .txt (formerly Normal Computing)
**Language:** Python
**License:** Apache 2.0
**GitHub:** https://github.com/dottxt-ai/outlines
**GitHub Stars:** 10,000+
**Website:** https://dottxt-ai.github.io/outlines/

#### Key Features

- **Structured Generation:** Guarantee valid JSON, regex, grammar-constrained outputs.
- **Provider Agnostic:** Works with OpenAI, vLLM, Transformers, llama.cpp, Ollama, SGLang.
- **Zero Overhead:** Compiled generation constraints add microseconds of latency.
- **JSON Schema:** Full JSON Schema compliance during generation.
- **Context-free Grammars:** Define custom output grammars.
- **Trusted by Major Players:** NVIDIA, Cohere, HuggingFace, vLLM all use Outlines.

#### Clinical Suitability

- **Structured clinical output:** Ensure FHIR-compliant JSON output every time.
- **No parsing failures:** Eliminate broken JSON in clinical API responses.
- **Schema validation:** Enforce HL7 FHIR, CDA, and custom clinical schemas at generation time.
- **Safety:** Prevent model from generating invalid medication orders or malformed diagnoses.

#### Integration Path with DeepSynaps

```python
# Outlines for Structured Clinical Output Generation
# generation/clinical_structured_output.py

import outlines
from pydantic import BaseModel, Field
from typing import Literal, List, Optional
from langchain_openai import AzureChatOpenAI

# Define clinical output schemas
class TriageAssessment(BaseModel):
    triage_level: Literal["emergency", "urgent", "routine", "self_care"] = Field(
        description="Appropriate triage level for patient presentation"
    )
    chief_complaint: str = Field(description="Primary reason for visit")
    differential_diagnosis: List[str] = Field(
        description="Possible conditions to consider",
        max_length=5
    )
    recommended_department: Literal[
        "emergency", "primary_care", "cardiology", "neurology",
        "orthopedics", "dermatology", "endocrinology", "other"
    ] = Field(description="Recommended department for care")
    red_flags: List[str] = Field(
        description="Identified red flag symptoms requiring attention",
        default=[]
    )
    confidence: float = Field(
        description="Confidence in assessment (0.0-1.0)",
        ge=0.0, le=1.0
    )
    requires_human_review: bool = Field(
        description="Whether case requires human clinician review"
    )
    rationale: str = Field(description="Reasoning behind triage decision")

class MedicationOrder(BaseModel):
    medication_name: str = Field(description="Name of medication")
    dosage: str = Field(description="Dosage amount and units")
    route: Literal["oral", "iv", "im", "subcutaneous", "topical", "inhalation"] = Field(
        description="Administration route"
    )
    frequency: str = Field(description="Dosing frequency")
    duration: Optional[str] = Field(description="Treatment duration", default=None)
    indications: List[str] = Field(description="Clinical indications for medication")
    contraindications_checked: bool = Field(
        description="Whether contraindications have been verified"
    )
    patient_education: str = Field(description="Education points for patient")

# Initialize Outlines with Azure OpenAI
from outlines.models import OpenAIChatCompletionModel

model = outlines.from_openai(
    AzureChatOpenAI(
        azure_deployment="gpt-4o-clinical",
        temperature=0.1
    ),
    "gpt-4o-clinical"
)

# Generate structured triage assessment
generator = outlines.generate.json(model, TriageAssessment)

def generate_triage_assessment(patient_description: str) -> TriageAssessment:
    """Generate structured triage assessment with guaranteed schema compliance."""

    prompt = f"""As a clinical triage assistant, assess the following patient presentation:

Patient Description: {patient_description}

Provide a structured triage assessment following clinical guidelines.
Always consider patient safety and err on the side of caution.
If emergency symptoms are present, always triage as emergency."""

    # Outlines guarantees valid TriageAssessment output
    assessment = generator(prompt)
    return assessment

# Generate medication order
med_generator = outlines.generate.json(model, MedicationOrder)

def generate_medication_order(
    diagnosis: str,
    patient_medications: List[str],
    allergies: List[str]
) -> MedicationOrder:
    """Generate structured medication order with safety checks."""

    prompt = f"""Generate a medication order for:
Diagnosis: {diagnosis}
Current medications: {', '.join(patient_medications)}
Known allergies: {', '.join(allergies)}

Ensure:
1. No medications patient is allergic to
2. Check for drug-drug interactions
3. Include patient education points
4. Verify contraindications"""

    # Guaranteed MedicationOrder output - no parsing needed
    order = med_generator(prompt)
    return order
```

#### Pricing

| Component | Cost |
|-----------|------|
| Outlines library | Free (Apache 2.0) |
| .txt API (managed) | Usage-based (early access) |
| Inference costs | Provider-dependent |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - Essential for clinical safety. Structured generation guarantees eliminate an entire class of failures (malformed outputs). Apache 2.0 license, trusted by major AI infrastructure projects. Use for ALL clinical output generation.

---

### 4.4 OpenClaw (Proposed)

**Name:** OpenClaw (proposed governed tool gateway)
**Status:** Conceptual/Community Proposal
**License:** MIT (proposed)

#### Concept

OpenClaw represents the emerging concept of a governed tool gateway for AI agents - a centralized, auditable, policy-enforced gateway through which all clinical AI tool calls must pass. While not yet a single unified project, the ecosystem is converging around MCP + governance layers.

#### Components

| Component | Implementation | Status |
|-----------|---------------|--------|
| Tool Registry | MCP server catalog | Active |
| Policy Engine | OPA (Open Policy Agent) | Available |
| Audit Logging | Langfuse/Helicone | Available |
| Access Control | RBAC via API gateway | Available |
| Rate Limiting | Kong/envoy | Available |

#### DeepSynaps Implementation

```yaml
# OpenClaw-style governance for DeepSynaps
# config/tool_gateway.yaml

tool_gateway:
  name: deepsynaps-clinical-gateway

  # All clinical tools must be registered
  registry:
    - name: appointment_scheduling
      endpoint: http://scheduling.internal:8080
      allowed_agents: ["intake_agent", "care_coordinator"]
      requires_approval: false
      phi_access: true

    - name: ehr_read
      endpoint: http://ehr.internal:8080
      allowed_agents: ["clinical_physician", "triage_nurse"]
      requires_approval: true  # Human approval required
      phi_access: true
      audit_level: full

    - name: prescription_write
      endpoint: http://pharmacy.internal:8080
      allowed_agents: ["attending_physician"]
      requires_approval: true
      phi_access: true
      audit_level: full
      mfa_required: true

  # Policy enforcement
  policies:
    - name: no_unauthorized_phi
      rule: |
        package deepsynaps.phi
        default allow = false
        allow if {
          input.agent.role in input.tool.allowed_roles
          input.patient_consent == true
        }

    - name: business_hours_only
      rule: |
        package deepsynaps.scheduling
        allow if {
          tod := time.now()
          tod >= 08:00
          tod <= 18:00
        }

  # Audit configuration
  audit:
    sink: langfuse
    retention_days: 2555  # 7 years for HIPAA
    encrypt: true
    pii_masking: true
```

#### Verdict for DeepSynaps

**ARCHITECTURAL PATTERN TO ADOPT** - While OpenClaw as a named project is nascent, the pattern of governed tool gateways is critical for clinical AI. Implement using MCP + OPA + Langfuse as described above.

---

## 5. Voice/Phone Agents

### 5.1 Twilio

**Name:** Twilio
**Language:** Python / JavaScript / REST
**License:** Proprietary (open SDKs under MIT)
**GitHub:** https://github.com/twilio
**GitHub Stars:** Various repos (twilio-python: 1,800+)
**Website:** https://www.twilio.com
**HIPAA Status:** Available via Business Associate Agreement

#### Key Features

- **Programmable Voice:** Inbound/outbound calling with full control.
- **Programmable SMS:** Text messaging for appointment reminders.
- **Twilio Flex:** Cloud contact center platform.
- **Media Streams:** Real-time audio streaming for AI integration.
- **Conference:** Multi-party calling for care team coordination.
- **Recording:** Call recording with HIPAA-compliant storage.
- **Open SDKs:** Python, JavaScript, C#, Java, Ruby SDKs (MIT licensed).

#### Clinical Suitability

- **HIPAA Compliant:** Available with signed BAA.
- **HITRUST Certified:** Meets healthcare security standards.
- **Phone-based AI:** Stream audio to LLM for real-time voice agents.
- **Appointment reminders:** Automated SMS/voice reminders (non-PHI or encrypted).
- **Telehealth integration:** Video via Twilio Programmable Video.

#### Integration Path with DeepSynaps

```python
# DeepSynaps Twilio Voice AI Agent
# voice/twilio_voice_agent.py

from flask import Flask, request, Response
from twilio.twiml.voice_response import VoiceResponse, Connect, Stream
import os
import websocket
import json

app = Flask(__name__)

# Configuration
TWILIO_ACCOUNT_SID = os.environ["TWILIO_ACCOUNT_SID"]
TWILIO_AUTH_TOKEN = os.environ["TWILIO_AUTH_TOKEN"]
STREAM_URL = os.environ["DEEPSYNAPS_VOICE_STREAM_URL"]

@app.route("/voice/inbound", methods=["POST"])
def handle_inbound_call():
    """Handle incoming patient calls."""
    response = VoiceResponse()

    # Greeting with DeepSynaps branding
    response.say(
        "Thank you for calling DeepSynaps Health. "
        "I'm your AI health assistant. How can I help you today?",
        voice="Polly.Joanna"
    )

    # Start media stream to AI agent
    connect = Connect()
    connect.stream(url=f"wss://{STREAM_URL}/voice-stream")
    response.append(connect)

    return Response(str(response), mimetype="application/xml")

@app.route("/voice/appointment-reminder", methods=["POST"])
def appointment_reminder():
    """Make outbound appointment reminder call."""
    from twilio.rest import Client

    client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

    # Anonymized reminder - no PHI in message
    call = client.calls.create(
        twiml=f"""<Response>
            <Say voice="Polly.Joanna">
                This is an appointment reminder from DeepSynaps Health.
                You have an appointment scheduled for tomorrow.
                Please press 1 to confirm, 2 to reschedule, or 3 to speak with someone.
            </Say>
            <Gather numDigits="1" action="/voice/handle-reminder-response">
                <Say>Please make your selection now.</Say>
            </Gather>
        </Response>""",
        to=request.form["patient_phone"],
        from_=os.environ["TWILIO_PHONE_NUMBER"]
    )

    return {"call_sid": call.sid, "status": call.status}

@app.route("/voice/handle-reminder-response", methods=["POST"])
def handle_reminder_response():
    """Process patient response to reminder."""
    digit = request.form["Digits"]
    response = VoiceResponse()

    if digit == "1":
        # Confirm appointment
        response.say("Thank you for confirming. We look forward to seeing you.")
        # Update appointment status in DeepSynaps
        confirm_appointment(request.form["call_sid"])
    elif digit == "2":
        # Reschedule - transfer to scheduling
        response.say("I'll connect you with our scheduling team.")
        response.dial(os.environ["SCHEDULING_PHONE_NUMBER"])
    elif digit == "3":
        # Transfer to human
        response.say("Please hold while I connect you.")
        response.dial(os.environ["RECEPTION_PHONE_NUMBER"])

    return Response(str(response), mimetype="application/xml")

# WebSocket handler for real-time AI voice
class VoiceStreamHandler:
    """Handle real-time audio streaming to/from LLM."""

    def __init__(self):
        self.audio_buffer = []
        self.conversation_history = []

    def on_audio_chunk(self, chunk: bytes):
        """Process incoming audio chunk from patient."""
        # Convert audio to text via speech-to-text
        text = self.speech_to_text(chunk)

        # Send to clinical AI agent
        response_text = self.process_with_ai_agent(text)

        # Convert response to speech
        audio_response = self.text_to_speech(response_text)

        return audio_response

    def process_with_ai_agent(self, text: str) -> str:
        """Send patient speech to clinical LangGraph agent."""
        # Implementation calls DeepSynaps agent orchestrator
        # with appropriate safety guardrails
        return "AI response..."
```

#### Pricing (Voice)

| Service | Cost | Notes |
|---------|------|-------|
| Inbound calls | $0.0085/min | Local numbers |
| Outbound calls | $0.013/min | Domestic US |
| Text-to-Speech | $4.00 / 1M chars | Amazon Polly via Twilio |
| Speech Recognition | $0.020/min | Real-time streaming |
| HIPAA BAA | Included | Enterprise plan |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - Twilio is the industry standard for healthcare communication. HIPAA BAA available, HITRUST certified, extensive healthcare deployment history. Open SDKs (MIT) enable flexible integration.

---

### 5.2 Vapi.ai

**Name:** Vapi.ai
**Language:** REST API / WebSocket
**License:** Proprietary (closed source)
**Website:** https://vapi.ai

#### Key Features

- **Voice AI Infrastructure:** Purpose-built platform for voice AI agents.
- **Low Latency:** Sub-second response times for natural conversation.
- **Multi-provider LLM:** Support for OpenAI, Anthropic, Google models.
- **Speech-to-Text:** Whisper, Deepgram, Azure Speech integration.
- **Text-to-Speech:** ElevenLabs, Play.ht, Azure TTS.
- **Function Calling:** Tool use within voice conversations.
- **Call Transfer:** Seamless handoff to human agents.

#### Clinical Suitability

- **Proprietary platform:** Data flows through Vapi.ai servers.
- **HIPAA Status:** Enterprise plan offers HIPAA compliance with BAA.
- **Speed:** Purpose-built for voice means lower latency than self-built solutions.
- **Trade-off:** Convenience vs. data control.

#### Pricing

| Tier | Cost | Minutes |
|------|------|---------|
| Free | $0 | 100 test minutes |
| Pay-as-you-go | ~$0.05/min | Usage-based |
| Enterprise | Custom | Unlimited + HIPAA BAA |

#### Verdict for DeepSynaps

**EVALUATE FOR NON-PHI USE** - Fastest path to voice AI deployment. Consider for general information hotlines, appointment scheduling (without PHI), and wellness coaching. Enterprise plan required for any PHI handling.

---

### 5.3 LiveKit

**Name:** LiveKit
**Language:** Go (server) / Python / JavaScript / Swift SDKs
**License:** Apache 2.0
**GitHub:** https://github.com/livekit/livekit
**GitHub Stars:** 12,000+
**Website:** https://livekit.io

#### Key Features

- **Real-time Audio/Video:** WebRTC-based real-time communication.
- **LiveKit Agents:** AI agent framework for real-time voice/video.
- **Self-hosted:** Full on-premises deployment option.
- **Low Latency:** Sub-300ms end-to-end latency.
- **Multi-platform SDKs:** Python, JavaScript, Swift, Android, Flutter.
- **SIP Integration:** Connect to PSTN phone networks.
- **Egress:** Recording and streaming capabilities.

#### Clinical Suitability

- **Fully self-hosted:** All data remains on your infrastructure - maximum HIPAA compliance.
- **Telehealth platform:** Purpose-built for real-time video/voice.
- **LiveKit Agents:** Build voice AI agents that run entirely on-premise.
- **SIP support:** Connect to phone networks without third-party services.
- **Recording:** Built-in call recording with local storage.

#### Integration Path with DeepSynaps

```python
# DeepSynaps LiveKit Voice Agent
# voice/livekit_clinical_agent.py

from livekit import rtc
from livekit.agents import Agent, JobContext, WorkerOptions, cli
from livekit.agents.voice import VoiceAgent
from livekit.plugins import openai, silero, deepgram
import os

class DeepSynapsClinicalVoiceAgent(Agent):
    """Real-time voice AI agent for clinical use."""

    def __init__(self):
        super().__init__()
        self.stt = deepgram.STT(
            api_key=os.environ["DEEPGRAM_API_KEY"]
        )
        self.llm = openai.LLM(
            model="gpt-4o-realtime-preview",
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            base_url=os.environ["AZURE_OPENAI_ENDPOINT"]
        )
        self.tts = openai.TTS(
            model="tts-1",
            voice="alloy"
        )

    async def on_enter(self):
        """Called when agent joins a room."""
        await self.say(
            "Hello, this is the DeepSynaps Health virtual assistant. "
            "How can I help you today?"
        )

    async def on_user_speech(self, transcript: str):
        """Process patient speech and generate response."""

        # Safety check: scan for emergency keywords
        emergency_keywords = ["chest pain", "can't breathe", "unconscious",
                            "severe bleeding", "suicide", "overdose"]

        if any(kw in transcript.lower() for kw in emergency_keywords):
            await self.say(
                "I'm detecting what may be an emergency. If this is a life-threatening "
                "emergency, please hang up and call 911 immediately. "
                "I'm connecting you with our emergency team now."
            )
            await self.transfer_to_emergency()
            return

        # Process through clinical LangGraph agent
        response = await self.clinical_agent.process(transcript)

        # Apply output guardrails before speaking
        safe_response = await self.guardrails.check(response)

        await self.say(safe_response)

    async def transfer_to_human(self):
        """Transfer call to human clinician."""
        await self.say("I'm connecting you with a member of our care team.")
        # Implement transfer via LiveKit SIP

    async def transfer_to_emergency(self):
        """Emergency transfer protocol."""
        # Immediate transfer to emergency department
        pass

# Run the agent
async def entrypoint(ctx: JobContext):
    agent = DeepSynapsClinicalVoiceAgent()
    await ctx.connect()
    await agent.start(ctx.room)

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
```

#### Pricing

| Component | Cost | Notes |
|-----------|------|-------|
| LiveKit server (self-hosted) | Free (Apache 2.0) | Your infrastructure |
| LiveKit Cloud | Usage-based | Managed service |
| LiveKit Agents SDK | Free | Open source |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - LiveKit is the premier choice for self-hosted voice AI. Apache 2.0 license, full on-premise deployment, and purpose-built agent framework make it ideal for HIPAA-compliant voice agents. Combine with Twilio SIP for phone network connectivity.

---

### 5.4 Daily.co

**Name:** Daily.co
**Language:** JavaScript / REST
**License:** Proprietary
**Website:** https://www.daily.co

#### Key Features

- **Video/Voice API:** Real-time communication platform.
- **AI Integration:** Purpose-built for AI-powered video/voice experiences.
- **Pre-built UI Components:** Drop-in video call interfaces.
- **Recording:** Cloud and local recording options.
- **Transcription:** Built-in speech-to-text.

#### Clinical Suitability

- **HIPAA:** Available with BAA on enterprise plan.
- **Use case:** Telehealth video consultations.
- **Limitation:** Less suitable for AI phone agents than LiveKit/Twilio.

#### Pricing

| Tier | Cost | Features |
|------|------|----------|
| Free | $0 | 2,000 minutes/month |
| Pay-as-you-go | $0.004/min | Additional minutes |
| Enterprise | Custom | HIPAA BAA, dedicated support |

#### Verdict for DeepSynaps

**EVALUATE FOR VIDEO CONSULTATIONS** - Strong for telehealth video. Consider alongside LiveKit for video-specific use cases.

---

## 6. Scheduling & Integration

### 6.1 Cal.com

**Name:** Cal.com (formerly Calendly open-source alternative)
**Language:** TypeScript
**License:** MIT (Cal.diy as of 2025); AGPL (legacy Cal.com)
**GitHub:** https://github.com/calcom/cal.diy (MIT) / https://github.com/calcom/cal.com (AGPL)
**GitHub Stars:** 35,000+ (combined)
**Website:** https://cal.com

#### Key Features

- **Open Scheduling:** Share availability and let patients book appointments.
- **Self-hosted:** Full on-premises deployment.
- **API:** REST API for integration with existing systems.
- **Workflows:** Automated reminders, follow-ups, notifications.
- **Team Scheduling:** Round-robin, collective, and managed events.
- **Customizable:** White-label with your branding.
- **Cal.diy:** New MIT-licensed community fork (2025).

#### Clinical Suitability

- **HIPAA:** Self-hosted = full data control for PHI scheduling.
- **Patient booking:** Direct patient self-scheduling.
- **Reminder system:** Automated SMS/email reminders.
- **Workflows:** Pre-visit questionnaires, insurance verification triggers.
- **License note:** Cal.diy (MIT) recommended over legacy AGPL version.

#### Integration Path with DeepSynaps

```typescript
// DeepSynaps Cal.com Integration
// scheduling/calcom-integration.ts

import { createHandler } from '@calcom/api';
import { z } from 'zod';

// Webhook handler for appointment events
export const calcomWebhookHandler = createHandler({
  // Verify webhook signature
  verifySignature: (payload, signature) => {
    const expected = crypto
      .createHmac('sha256', process.env.CALCOM_WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  },

  handlers: {
    // New booking created
    BOOKING_CREATED: async (event) => {
      const booking = event.payload;

      // Validate booking data
      const bookingSchema = z.object({
        uid: z.string(),
        title: z.string(),
        description: z.string().optional(),
        startTime: z.string().datetime(),
        endTime: z.string().datetime(),
        attendees: z.array(z.object({
          email: z.string().email(),
          name: z.string(),
          timeZone: z.string()
        })),
        metadata: z.record(z.string()).optional()
      });

      const validated = bookingSchema.parse(booking);

      // Sync to DeepSynaps EHR
      await syncToDeepSynaps({
        appointment_id: validated.uid,
        patient_email: validated.attendees[0]?.email,
        start_time: validated.startTime,
        end_time: validated.endTime,
        appointment_type: validated.title,
        notes: validated.description,
        timezone: validated.attendees[0]?.timeZone
      });

      // Send confirmation via Twilio
      await sendAppointmentConfirmation({
        phone: validated.metadata?.patient_phone,
        appointment_time: validated.startTime,
        provider: validated.title
      });

      return { status: 'synced' };
    },

    // Booking rescheduled
    BOOKING_RESCHEDULED: async (event) => {
      await updateDeepSynapsAppointment({
        appointment_id: event.payload.uid,
        new_start_time: event.payload.startTime,
        new_end_time: event.payload.endTime
      });

      return { status: 'updated' };
    },

    // Booking cancelled
    BOOKING_CANCELLED: async (event) => {
      await cancelDeepSynapsAppointment({
        appointment_id: event.payload.uid,
        reason: event.payload.cancellationReason
      });

      return { status: 'cancelled' };
    }
  }
});

// Create appointment via API
export async function createClinicalAppointment(params: {
  patient_id: string;
  provider_id: string;
  start_time: Date;
  duration_minutes: number;
  appointment_type: string;
  reason?: string;
}): Promise<string> {
  const response = await fetch(
    `${process.env.CALCOM_API_URL}/v2/bookings`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CALCOM_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventTypeId: params.appointment_type,
        start: params.start_time.toISOString(),
        end: new Date(
          params.start_time.getTime() + params.duration_minutes * 60000
        ).toISOString(),
        metadata: {
          patient_id: params.patient_id,  // Anonymized
          reason: params.reason
        }
      })
    }
  );

  const data = await response.json();
  return data.data?.bookingUid || data.bookingId;
}
```

#### Pricing

| Tier | Cost | Notes |
|------|------|-------|
| Cal.diy (self-hosted) | Free (MIT) | Community maintained |
| Cal.com Free | $0 | Limited features |
| Cal.com Pro | $15/user/month | Full features |
| Cal.com Enterprise | Custom | HIPAA BAA, dedicated support |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - Best open-source scheduling solution. MIT license (Cal.diy), full self-hosting, proven at scale. Implement Cal.diy for maximum licensing flexibility.

---

### 6.2 N8N

**Name:** N8N
**Language:** TypeScript / Node.js
**License:** Sustainable Use License (fair-code)
**GitHub:** https://github.com/n8n-io/n8n
**GitHub Stars:** 108,000+
**Website:** https://n8n.io

#### Key Features

- **Visual Workflow Builder:** Drag-and-drop automation design.
- **400+ Integrations:** Native nodes for virtually every service.
- **Self-hosted:** Full on-premises deployment.
- **Code when needed:** JavaScript/Python code nodes for custom logic.
- **AI Workflows:** Built-in LangChain integration for AI agents.
- **Error Handling:** Retry logic, error branches, fallback workflows.
- **Webhooks:** HTTP triggers for event-driven workflows.
- **Credentials Management:** Secure storage for API keys.

#### Clinical Suitability

- **Data control:** Self-hosted = full HIPAA compliance capability.
- **Workflow automation:** Automate clinical workflows (prior auth, lab routing).
- **Integration hub:** Connect EHR, lab systems, scheduling, billing.
- **Fair-code note:** Cannot resell as SaaS without enterprise license.
- **Internal use:** Fully allowed for internal clinical automation.

#### Integration Path with DeepSynaps

```javascript
// N8N Workflow for Clinical Lab Results Routing
// workflows/lab-results-routing.json (conceptual)

{
  "name": "Clinical Lab Results Processing",
  "nodes": [
    {
      "type": "n8n-nodes-base.webhook",
      "name": "Lab Result Webhook",
      "webhookUri": "lab-results",
      "responseMode": "responseNode"
    },
    {
      "type": "n8n-nodes-base.code",
      "name": "Validate HL7 Message",
      "code": "// Validate incoming HL7 message\nconst hl7 = require('simple-hl7');\nconst message = items[0].json.body;\n\ntry {\n  const parsed = hl7.createMessage(message);\n  return [{json: {valid: true, data: parsed}}];\n} catch (e) {\n  return [{json: {valid: false, error: e.message}}];\n}"
    },
    {
      "type": "n8n-nodes-base.postgres",
      "name": "Store in Clinical DB",
      "operation": "insert",
      "table": "lab_results",
      "columns": "patient_id, test_type, result, reference_range, abnormal_flag, received_at"
    },
    {
      "type": "n8n-nodes-base.if",
      "name": "Critical Value Check",
      "conditions": {
        "options": {
          "caseSensitive": true,
          "leftValue": "={{ $json.abnormal_flag }}",
          "operator": {
            "type": "string",
            "operation": "equals"
          },
          "rightValue": "CRITICAL"
        }
      }
    },
    {
      "type": "n8n-nodes-base.httpRequest",
      "name": "Alert Provider",
      "method": "POST",
      "url": "http://notifications.deepsynaps.internal/critical-alert",
      "body": {
        "patient_id": "={{ $json.patient_id }}",
        "test": "={{ $json.test_type }}",
        "result": "={{ $json.result }}",
        "urgency": "CRITICAL"
      }
    },
    {
      "type": "n8n-nodes-base.twilio",
      "name": "SMS Alert to Provider",
      "operation": "send",
      "to": "={{ $json.provider_phone }}",
      "message": "CRITICAL LAB: Patient {{ $json.patient_anon_id }} - {{ $json.test_type }}: {{ $json.result }}"
    }
  ],
  "connections": {
    "Lab Result Webhook": { "main": [[{"node": "Validate HL7 Message"}]] },
    "Validate HL7 Message": {
      "main": [
        [{"node": "Store in Clinical DB"}],
        [{"node": "Error Handler"}]
      ]
    },
    "Store in Clinical DB": { "main": [[{"node": "Critical Value Check"}]] },
    "Critical Value Check": {
      "main": [
        [{"node": "Alert Provider"}],
        [{"node": "Normal Result Handler"}]
      ]
    },
    "Alert Provider": { "main": [[{"node": "SMS Alert to Provider"}]] }
  }
}
```

#### Pricing

| Tier | Cost | Notes |
|------|------|-------|
| Self-hosted | Free (fair-code) | Unlimited internal use |
| N8N Cloud | $24/user/month | Managed hosting |
| Enterprise | Custom | SSO, audit log, support |

#### Verdict for DeepSynaps

**RECOMMEND FOR INTERNAL AUTOMATION** - Excellent for clinical workflow automation. Fair-code license allows internal use. 108K stars indicate massive community. Use for lab routing, prior auth, claims processing, and non-patient-facing automation.

---

### 6.3 Apache Airflow

**Name:** Apache Airflow
**Maintainer:** Apache Software Foundation
**Language:** Python
**License:** Apache 2.0
**GitHub:** https://github.com/apache/airflow
**GitHub Stars:** 40,000+
**Website:** https://airflow.apache.org

#### Key Features

- **Workflow as Code:** Define workflows in Python for version control and testing.
- **DAG-based:** Directed Acyclic Graphs for complex dependency management.
- **Scheduling:** Cron-like scheduling with backfill support.
- **Monitoring:** Rich UI for workflow visualization and troubleshooting.
- **Operators:** 100+ built-in operators for external systems.
- **Extensible:** Custom operators and plugins.
- **Scalable:** CeleryExecutor and KubernetesExecutor for scale.

#### Clinical Suitability

- **Batch processing:** Ideal for ETL pipelines, claims processing, reporting.
- **Data pipelines:** Population health analytics, quality measure calculation.
- **Auditability:** Full execution history and lineage tracking.
- **Self-hosted:** Complete infrastructure control for HIPAA compliance.
- **Mature:** Battle-tested at scale across healthcare organizations.

#### Integration Path with DeepSynaps

```python
# DeepSynaps Airflow DAG for Clinical Data Pipeline
# dags/clinical_etl_pipeline.py

from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.providers.http.operators.http import SimpleHttpOperator
from airflow.utils.dates import days_ago
from datetime import datetime, timedelta
import pendulum

default_args = {
    'owner': 'deepsynaps-data-engineering',
    'depends_on_past': False,
    'email': ['data-ops@deepsynaps.health'],
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 3,
    'retry_delay': timedelta(minutes=5)
}

with DAG(
    'clinical_quality_measures_daily',
    default_args=default_args,
    description='Calculate daily clinical quality measures for reporting',
    schedule_interval='0 6 * * *',  # Daily at 6 AM
    start_date=days_ago(1),
    catchup=False,
    tags=['clinical', 'quality', 'reporting'],
    max_active_runs=1
) as dag:

    # Task 1: Extract patient data from EHR
    extract_patient_data = PostgresOperator(
        task_id='extract_active_patients',
        postgres_conn_id='ehr_prod',
        sql="""
            CREATE TEMP TABLE active_patients AS
            SELECT
                patient_id,
                date_of_birth,
                gender,
                primary_care_provider,
                last_visit_date,
                diagnoses
            FROM patients
            WHERE status = 'active'
            AND last_visit_date >= CURRENT_DATE - INTERVAL '2 years';
        """
    )

    # Task 2: Extract quality measure data
    extract_quality_data = PostgresOperator(
        task_id='extract_quality_data',
        postgres_conn_id='ehr_prod',
        sql="""
            CREATE TEMP TABLE quality_data AS
            SELECT
                p.patient_id,
                COUNT(DISTINCT m.encounter_id) as hba1c_tests_last_year,
                MAX(m.result_value::numeric) as latest_hba1c,
                MAX(m.result_date) as latest_hba1c_date
            FROM active_patients p
            LEFT JOIN lab_results m ON p.patient_id = m.patient_id
                AND m.test_code = '4548-4'  -- HbA1c LOINC code
                AND m.result_date >= CURRENT_DATE - INTERVAL '1 year'
            WHERE 'E11' = ANY(p.diagnoses)  -- Type 2 diabetes
            GROUP BY p.patient_id;
        """
    )

    # Task 3: Calculate HEDIS measures
    def calculate_hedis_measures(**context):
        """Calculate HEDIS diabetes care measures."""
        from deepsynaps.quality.hedis import DiabetesCareCalculator

        calculator = DiabetesCareCalculator(
            measure_year=context['execution_date'].year
        )

        results = calculator.calculate_cdc_metrics(
            db_connection='ehr_prod',
            as_of_date=context['execution_date']
        )

        # Store results
        calculator.store_results(
            results,
            target_table='quality_measures.daily_hedis_cdc'
        )

        return f"Calculated measures for {len(results)} patients"

    calculate_measures = PythonOperator(
        task_id='calculate_hedis_measures',
        python_callable=calculate_hedis_measures,
        provide_context=True
    )

    # Task 4: Generate quality report
    generate_report = PythonOperator(
        task_id='generate_quality_report',
        python_callable=lambda **ctx: generate_daily_report(ctx['execution_date'])
    )

    # Task 5: Send report to quality team
    send_report = SimpleHttpOperator(
        task_id='send_quality_report',
        http_conn_id='deepsynaps_api',
        endpoint='/v1/quality/reports/distribute',
        method='POST',
        json={
            'report_type': 'daily_hedis_cdc',
            'recipients': ['quality@deepsynaps.health']
        }
    )

    # Define task dependencies
    extract_patient_data >> extract_quality_data >> calculate_measures >> generate_report >> send_report
```

#### Pricing

| Component | Cost |
|-----------|------|
| Apache Airflow | Free (Apache 2.0) |
| Astronomer (managed) | Usage-based |
| Self-hosted infrastructure | Your infrastructure cost |

#### Verdict for DeepSynaps

**STRONG RECOMMEND FOR BATCH PIPELINES** - Industry standard for workflow orchestration. Apache 2.0 license, proven healthcare deployments. Use for all batch clinical data processing, quality measure calculation, and reporting pipelines.

---

## 7. Monitoring & Observability

### 7.1 LangSmith

**Name:** LangSmith
**Maintainer:** LangChain
**Language:** Python / JavaScript
**License:** Proprietary (closed source)
**Website:** https://smith.langchain.com

#### Key Features

- **Tracing:** End-to-end tracing of LLM application execution.
- **Evaluation:** Built-in evaluation framework for LLM outputs.
- **Prompt Management:** Version-controlled prompt deployment.
- **Datasets:** Test dataset creation and management.
- **Feedback Collection:** Human feedback on LLM outputs.
- **Performance Metrics:** Latency, token usage, cost tracking.

#### Clinical Suitability

- **Proprietary:** Cloud-hosted; data flows to LangChain servers.
- **HIPAA:** Not HIPAA-compliant without enterprise agreement.
- **Use case:** Development and staging environments.
- **Production:** Recommend Langfuse for production PHI environments.

#### Pricing

| Tier | Cost | Traces |
|------|------|--------|
| Developer | Free | 5,000/month |
| Plus | $39/user/month | 10,000/user/month |
| Enterprise | Custom | Unlimited + HIPAA |

#### Verdict for DeepSynaps

**RECOMMEND FOR NON-PHI ENVIRONMENTS** - Best-in-class LLM observability during development. Use LangSmith for development/staging. Switch to Langfuse for production PHI.

---

### 7.2 Langfuse

**Name:** Langfuse
**Maintainer:** ClickHouse (acquired January 2026)
**Language:** TypeScript / Python
**License:** MIT (open core)
**GitHub:** https://github.com/langfuse/langfuse
**GitHub Stars:** 10,000+
**Website:** https://langfuse.com

#### Key Features

- **LLM Observability:** Production tracing, metrics, and analytics.
- **Prompt Management:** Version control and deployment with monitoring.
- **Evaluations:** LLM-as-a-Judge, datasets, structured evaluation.
- **OpenTelemetry:** Native OTel integration for vendor neutrality.
- **Self-hosted:** Full on-premises deployment.
- **Open Source Core:** MIT-licensed core features.
- **Cost Tracking:** Per-request cost analysis across providers.

#### Clinical Suitability

- **MIT License:** Fully permissive open-source license.
- **Self-hosted:** All clinical trace data stays on your infrastructure.
- **HIPAA:** Self-hosted deployment with proper security controls.
- **Audit trails:** Complete execution history for compliance.
- **Prompt versioning:** Track all prompt changes for clinical validation.
- **ClickHouse backing:** Scalable to billions of traces.

#### Integration Path with DeepSynaps

```python
# DeepSynaps Langfuse Integration
# observability/langfuse_integration.py

from langfuse import Langfuse
from langfuse.decorators import observe, langfuse_context
from typing import Dict, Any
import os

# Initialize Langfuse (self-hosted)
langfuse = Langfuse(
    public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
    secret_key=os.environ["LANGFUSE_SECRET_KEY"],
    host="http://langfuse.deepsynaps.internal",  # Self-hosted instance
    enabled=True
)

@observe(as_type="generation")
async def clinical_llm_generation(
    prompt: str,
    patient_context: Dict[str, Any],
    model_config: Dict[str, Any]
) -> str:
    """Generate clinical response with full observability."""

    # Update trace with clinical context (anonymized)
    langfuse_context.update_current_trace(
        session_id=patient_context.get("session_id"),
        user_id=patient_context.get("anon_patient_id"),
        metadata={
            "department": patient_context.get("department"),
            "triage_level": patient_context.get("triage_level"),
            "model": model_config.get("model_name"),
            # NEVER include actual PHI
        }
    )

    # Log the generation
    langfuse_context.update_current_observation(
        input=prompt,
        model=model_config.get("model_name"),
        model_parameters={
            "temperature": model_config.get("temperature", 0.1),
            "max_tokens": model_config.get("max_tokens"),
        }
    )

    # Call LLM (Azure OpenAI for HIPAA compliance)
    response = await call_azure_openai(prompt, model_config)

    # Log output and token usage
    langfuse_context.update_current_observation(
        output=response.content,
        usage={
            "input": response.usage.prompt_tokens,
            "output": response.usage.completion_tokens,
            "total": response.usage.total_tokens
        },
        cost=calculate_cost(
            model_config["model_name"],
            response.usage.prompt_tokens,
            response.usage.completion_tokens
        )
    )

    return response.content

@observe(as_type="span")
async def clinical_intake_workflow(patient_message: str) -> Dict:
    """Complete intake workflow with full tracing."""

    # Step 1: Symptom extraction
    symptoms = await extract_symptoms(patient_message)

    # Step 2: Triage assessment
    triage = await assess_triage(symptoms)

    # Step 3: Routing decision
    routing = await determine_routing(triage)

    # Log structured output
    langfuse_context.update_current_observation(
        output={
            "triage_level": triage.level,
            "department": routing.department,
            "confidence": triage.confidence
        }
    )

    return {
        "symptoms": symptoms,
        "triage": triage,
        "routing": routing
    }

# Score clinical output quality
async def score_clinical_output(trace_id: str, output: str, expected: str):
    """Use LLM-as-a-Judge for clinical quality scoring."""

    score = await langfuse.score(
        trace_id=trace_id,
        name="clinical_accuracy",
        value=calculate_accuracy(output, expected),
        comment="Automated clinical accuracy assessment"
    )

    return score
```

#### Pricing

| Tier | Cost | Notes |
|------|------|-------|
| Open Source (self-hosted) | Free (MIT) | Full observability |
| Langfuse Cloud | $29/month (core) | Managed service |
| Enterprise (self-hosted) | Custom | SSO, SCIM, audit logs |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - Best open-source LLM observability platform. MIT license, ClickHouse backing for scale, full self-hosting. Essential for production clinical AI monitoring and compliance auditing.

---

### 7.3 Promptlayer

**Name:** Promptlayer
**Language:** Python / JavaScript
**License:** Proprietary
**Website:** https://promptlayer.com

#### Key Features

- **Prompt Management:** Version control and A/B testing.
- **Request Tracking:** Log all LLM requests with metadata.
- **Evaluation:** Built-in prompt evaluation tools.
- **Collaboration:** Team prompt management.

#### Clinical Suitability

- **Proprietary:** Cloud-hosted service.
- **Use case:** Development environment prompt management.
- **Production:** Use Langfuse for PHI environments.

#### Pricing

| Tier | Cost | Requests |
|------|------|----------|
| Free | $0 | 1,000/month |
| Pro | $40/month | 10,000/month |
| Enterprise | Custom | Unlimited |

#### Verdict for DeepSynaps

**NOT RECOMMENDED FOR PRODUCTION** - Proprietary cloud service. Use Langfuse instead for both development and production.

---

### 7.4 Helicone

**Name:** Helicone
**Language:** TypeScript / Rust
**License:** Apache 2.0
**GitHub:** https://github.com/Helicone/helicone
**GitHub Stars:** 4,000+
**Website:** https://helicone.ai

#### Key Features

- **LLM Gateway:** Proxy all LLM requests through a single endpoint.
- **Zero-code Instrumentation:** Change base URL, no SDK needed.
- **Observability:** Automatic request logging and analytics.
- **Caching:** Request caching for cost reduction.
- **Rate Limiting:** Built-in rate limiting and quota management.
- **Self-hosted:** Full on-premises deployment option.
- **Built in Rust:** High performance (1-5ms P95 latency overhead).

#### Clinical Suitability

- **Apache 2.0 License:** Fully permissive.
- **Self-hosted:** All request data stays internal.
- **Zero-code:** Minimal integration effort.
- **Gateway pattern:** Centralized control point for all LLM access.
- **HIPAA:** Self-hosted with appropriate security controls.

#### Integration Path with DeepSynaps

```python
# Helicone Integration - Zero-code approach
# Simply change the base URL and add headers

import openai

client = openai.OpenAI(
    # Route through Helicone gateway
    base_url="http://helicone.deepsynaps.internal/v1",
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    default_headers={
        # Route to actual provider
        "Helicone-Target-Url": os.environ["AZURE_OPENAI_ENDPOINT"],
        # Add clinical metadata for tracking
        "Helicone-Property-Department": "emergency",
        "Helicone-Property-Triage-Level": "urgent",
        "Helicone-Property-Agent-Version": "2.1.0",
        # Session tracking
        "Helicone-Session-Id": session_id,
        "Helicone-User-Id": anon_patient_id,
    }
)

# All requests are automatically logged through Helicone
response = client.chat.completions.create(
    model="gpt-4o-clinical",
    messages=[{"role": "user", "content": patient_query}]
)

# Access analytics via Helicone API
async def get_clinical_usage_analytics(date_range: str):
    """Get LLM usage analytics for clinical operations."""

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://helicone.deepsynaps.internal/v1/stats/usage",
            headers={"Authorization": f"Bearer {os.environ['HELICONE_API_KEY']}"},
            params={
                "time_range": date_range,
                "group_by": "department",
                "properties": "triage_level,agent_version"
            }
        )

        return response.json()
```

#### Pricing

| Tier | Cost | Logs | Notes |
|------|------|------|-------|
| Self-hosted | Free (Apache 2.0) | Unlimited | Your infrastructure |
| Helicone Cloud Free | $0 | 10K/month | 7-day retention |
| Helicone Cloud Pro | $79/month | 100K/month | 1-month retention |
| Enterprise | Custom | Unlimited | Self-host + support |

#### Verdict for DeepSynaps

**RECOMMEND AS LLM GATEWAY** - Apache 2.0 license, self-hosted option, minimal integration overhead. Use as the LLM gateway layer for centralized cost control, caching, and observability. Complements Langfuse (Helicone for gateway, Langfuse for tracing).

---

## 8. Safety & Guardrails

### 8.1 NeMo Guardrails (NVIDIA)

**Name:** NeMo Guardrails
**Maintainer:** NVIDIA
**Language:** Python
**License:** Apache 2.0
**GitHub:** https://github.com/NVIDIA/NeMo-Guardrails
**GitHub Stars:** 6,100+
**Website:** https://github.com/NVIDIA/NeMo-Guardrails

#### Key Features

- **Colang DSL:** Domain-specific language for conversation flow definition.
- **Five Rail Types:** Input, dialog, retrieval, execution, and output rails.
- **Dialog Management:** Full conversation flow control (unique feature).
- **LLM Agnostic:** Works with OpenAI, Azure, Anthropic, HuggingFace, NVIDIA NIM.
- **LangChain/LlamaIndex Integration:** Drop-in integration with existing frameworks.
- **Content Safety:** Built-in safety models (Nemotron-Content-Safety).
- **PII Detection:** GLiNER integration for open-source PII detection.

#### Clinical Suitability

- **Apache 2.0:** Fully permissive license.
- **Dialog management:** Critical for clinical conversations - maintain topic control.
- **Topic restrictions:** Prevent clinical AI from discussing non-medical topics.
- **Input validation:** Block prompt injection attempts.
- **Output verification:** Ensure responses meet clinical standards.
- **NVIDIA backing:** Enterprise support available.

#### Integration Path with DeepSynaps

```python
# DeepSynaps NeMo Guardrails Configuration
# guardrails/clinical_guardrails/config/config.yml

# config.yml
models:
  - type: main
    engine: azure
    model: gpt-4o-clinical
    api_base: ${AZURE_OPENAI_ENDPOINT}
    api_key: ${AZURE_OPENAI_API_KEY}

  - type: content_safety
    engine: azure
    model: nemotron-content-safety

instructions:
  - type: general
    content: |
      You are a clinical AI assistant for DeepSynaps Health. Your role is to:
      1. Help patients with appointment scheduling and general health information
      2. Gather symptom information for clinical intake
      3. Provide evidence-based health education
      4. Assist care teams with clinical decision support

      You must NOT:
      1. Provide definitive diagnoses
      2. Prescribe medications
      3. Replace human clinical judgment
      4. Discuss topics unrelated to healthcare

      Always encourage patients to consult with their healthcare provider
      for personalized medical advice.

guardrails:
  # Input rails
  input:
    flows:
      - self check input
      - active fence moderation
      - check prompt injection
      - check jailbreak attempt
      - check pii exposure

  # Output rails
  output:
    flows:
      - self check output
      - check facts
      - check hallucination
      - active fence output moderation

  # Dialog rails
  dialog:
    single_call:
      enabled: True
    flows:
      - track conversation topic
      - check conversation coherence

  # Retrieval rails
  retrieval:
    flows:
      - check retrieval relevance
      - check source credibility

# flows.clinical.co - Colang dialog flows

# Define allowed topics
define user asks about scheduling
  "I want to schedule an appointment"
  "Can I book a visit"
  "When is the next available slot"

define user asks about symptoms
  "I have a headache"
  "I've been feeling dizzy"
  "I have chest pain"

define user asks non_clinical
  "What's the weather"
  "Tell me a joke"
  "Help me with my taxes"

# Define responses
define bot redirects to healthcare
  "I'm here to help with your healthcare needs. Is there something about your health or appointments I can assist with?"

define bot provides_emergency_guidance
  "That sounds concerning. If you're experiencing a medical emergency, please call 911 immediately. Otherwise, I can help you schedule an urgent appointment."

# Topic management
define flow manage conversation topics
  user asks non_clinical
  bot redirects to healthcare

# Emergency escalation
define flow handle emergency symptoms
  user asks about symptoms
  if $symptoms contains "chest pain" or $symptoms contains "can't breathe"
    bot provides_emergency_guidance
    $requires_immediate_attention = True
  else
    bot asks for more details

# PII protection
define flow protect_phi
  user provides phi
  if $contains_name or $contains_ssn or $contains_mrn
    bot acknowledges_without_storing
    bot reminds_about_privacy
"""

# Python integration
from nemoguardrails import RailsConfig, LLMRails

config = RailsConfig.from_path("./guardrails/clinical_guardrails")
rails = LLMRails(config)

async def safe_clinical_response(patient_message: str) -> dict:
    """Process patient message with full guardrail protection."""

    response = await rails.generate_async(
        messages=[{"role": "user", "content": patient_message}]
    )

    # Check if guardrails were triggered
    info = rails.explain()

    return {
        "response": response["content"],
        "guardrails_triggered": len(info.guardrails) > 0,
        "blocked_input": info.blocked_input,
        "blocked_output": info.blocked_output,
        "rails_info": info
    }
```

#### Pricing

| Component | Cost |
|-----------|------|
| NeMo Guardrails | Free (Apache 2.0) |
| NVIDIA AI Enterprise | Paid (per GPU/node) |
| LLM inference | Provider-dependent |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - Best comprehensive guardrail framework. Colang DSL enables precise clinical conversation control. Apache 2.0 license, NVIDIA backing, dialog management unique among guardrail tools. Essential layer for clinical AI safety.

---

### 8.2 Guardrails AI

**Name:** Guardrails AI
**Language:** Python
**License:** Apache 2.0
**GitHub:** https://github.com/guardrails-ai/guardrails
**GitHub Stars:** 6,800+
**Website:** https://www.guardrailsai.com

#### Key Features

- **Guard Framework:** Declarative input/output validation framework.
- **Guardrails Hub:** Ecosystem of 50+ pre-built validators.
- **PII Detection:** Presidio + GLiNER for PII detection and anonymization.
- **Custom Validators:** Easy creation of custom validation rules.
- **OnFail Actions:** Reask, exception, fix, filter, or no-op on validation failure.
- **Integration:** Works with any LLM via Python.

#### Clinical Suitability

- **Apache 2.0:** Fully permissive license.
- **PII protection:** Built-in validators for HIPAA compliance.
- **Structured output:** Validate clinical outputs against schemas.
- **Hub ecosystem:** Growing library of clinical validators.
- **Alert integration:** Trigger alerts on validation failures.

#### Integration Path with DeepSynaps

```python
# Guardrails AI for Clinical Output Validation
# guardrails/clinical_validators.py

from guardrails import Guard, OnFailAction
from guardrails.hub import (
    RegexMatch,
    ToxicLanguage,
    CompetitorCheck,
    SecretsPresent,
    DetectPII
)
from pydantic import BaseModel, Field
from typing import Literal, List
import guardrails as gd

# Define clinical output schema
class ClinicalNote(BaseModel):
    chief_complaint: str = Field(
        description="Primary reason for patient visit",
        min_length=5,
        max_length=200
    )
    history_of_present_illness: str = Field(
        description="Detailed symptom description",
        max_length=2000
    )
    assessment: str = Field(
        description="Clinical assessment - must not contain definitive diagnosis",
        max_length=1000
    )
    plan: str = Field(
        description="Treatment plan and follow-up",
        max_length=1000
    )
    disposition: Literal[
        "home",
        "observation",
        "admission",
        "transfer",
        "discharge"
    ] = Field(description="Patient disposition")

# Create guard with clinical validators
clinical_note_guard = Guard.for_pydantic(ClinicalNote)

# Add validators
clinical_note_guard.use(
    DetectPII(
        on_fail=OnFailAction.EXCEPTION,  # Block any PII in output
        entities=["PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS", "SSN", "MEDICAL_RECORD_NUMBER"]
    )
)

clinical_note_guard.use(
    ToxicLanguage(
        on_fail=OnFailAction.EXCEPTION  # Block toxic language
    )
)

clinical_note_guard.use(
    SecretsPresent(
        on_fail=OnFailAction.EXCEPTION  # Block API keys/credentials
    )
)

# Custom clinical validator
def validate_no_definitive_diagnosis(value: str) -> bool:
    """Ensure note doesn't claim definitive diagnosis."""
    forbidden_terms = [
        "definitive diagnosis is",
        "the patient has",  # when followed by condition
        "confirmed diagnosis"
    ]
    return not any(term in value.lower() for term in forbidden_terms)

clinical_note_guard.use(
    gd.validators.CustomValidator(
        validation_function=validate_no_definitive_diagnosis,
        on_fail=OnFailAction.REASK,
        error_message="Clinical notes must not include definitive diagnoses"
    )
)

# Validate clinical output
def validate_clinical_note(raw_output: str) -> ClinicalNote:
    """Validate raw LLM output against clinical schema."""
    try:
        result = clinical_note_guard.validate(raw_output)
        return result
    except gd.errors.ValidationError as e:
        # Log validation failure for quality monitoring
        log_validation_failure(e)
        raise
```

#### Pricing

| Component | Cost |
|-----------|------|
| Guardrails AI core | Free (Apache 2.0) |
| Guardrails Hub validators | Free |
| Enterprise platform | Custom |

#### Verdict for DeepSynaps

**RECOMMEND** - Excellent for structured clinical output validation. Hub ecosystem provides ready-made validators. Apache 2.0 license. Use alongside NeMo Guardrails for comprehensive protection (NeMo for dialog control, Guardrails AI for output validation).

---

### 8.3 LLM Guard

**Name:** LLM Guard
**Maintainer:** Protect AI
**Language:** Python
**License:** MIT
**GitHub:** https://github.com/protectai/llm-guard
**GitHub Stars:** 2,500+
**Website:** https://llm-guard.com

#### Key Features

- **15 Input Scanners:** Prompt injection, PII, toxicity, secrets, banned topics.
- **20 Output Scanners:** Bias, malicious URLs, factual consistency, data leakage.
- **Modular Design:** Activate only needed scanners.
- **Offline Operation:** Runs locally - no data leaves infrastructure.
- **API Server:** Deploy as standalone HTTP service.
- **ML-based Detection:** Trained models for prompt injection detection.

#### Clinical Suitability

- **MIT License:** Fully permissive.
- **Self-hosted:** All scanning happens locally - no PHI exposure.
- **Input protection:** Block prompt injection before clinical LLM processing.
- **Output protection:** Prevent PHI leakage in LLM responses.
- **API server:** Deploy as centralized gateway for all clinical LLM requests.

#### Integration Path with DeepSynaps

```python
# LLM Guard as Centralized Clinical AI Security Gateway
# security/llm_guard_gateway.py

from llm_guard import scan_prompt, scan_output
from llm_guard.input_scanners import (
    PromptInjection,
    Anonymize,
    Toxicity,
    TokenLimit,
    BanTopics
)
from llm_guard.output_scanners import (
    Deanonymize,
    NoRefusal,
    Relevance,
    Sensitive,
    FactualConsistency
)
import os

# Configure input scanners for clinical use
input_scanners = [
    PromptInjection(
        threshold=0.9,  # High threshold for clinical safety
        use_onnx=True   # Accelerated inference
    ),
    Anonymize(
        # Use Presidio for PII detection
        vault=Vault(),  # Store mappings for deanonymization
        hidden_names=["patient_name", "mrn", "ssn", "dob"],
        recognizer_confidence_threshold=0.7
    ),
    Toxicity(
        threshold=0.5
    ),
    BanTopics(
        topics=["politics", "religion", "gambling", "adult_content"]
    ),
    TokenLimit(
        limit=4000,  # Prevent token abuse
        limit_type="max"
    )
]

# Configure output scanners
output_scanners = [
    NoRefusal(),  # Ensure model didn't refuse legitimate request
    Relevance(),  # Ensure output is relevant to input
    Sensitive(),  # Detect sensitive information
    FactualConsistency()  # Check against provided context
]

class ClinicalLLMGuardGateway:
    """Centralized security gateway for all clinical LLM requests."""

    def __init__(self):
        self.input_scanners = input_scanners
        self.output_scanners = output_scanners
        self.vault = Vault()

    async def process_clinical_request(
        self,
        patient_input: str,
        clinical_context: dict
    ) -> dict:
        """Process patient input through security scanners."""

        # Phase 1: Input scanning
        sanitized_prompt, results_valid, risk_score = scan_prompt(
            self.input_scanners,
            patient_input
        )

        if not results_valid:
            await self.log_security_event({
                "event": "blocked_input",
                "original_input": patient_input,  # Already anonymized
                "risk_score": risk_score,
                "scanners_triggered": [r.scanner for r in results_valid]
            })
            return {
                "blocked": True,
                "reason": "Input failed security checks",
                "risk_score": risk_score
            }

        # Phase 2: Call clinical LLM
        llm_response = await call_clinical_llm(
            sanitized_prompt,
            clinical_context
        )

        # Phase 3: Output scanning
        sanitized_output, output_valid, output_risk = scan_output(
            self.output_scanners,
            sanitized_prompt,
            llm_response
        )

        # Phase 4: Deanonymize for authorized clinical staff
        final_output = self.vault.deanonymize(sanitized_output)

        return {
            "blocked": False,
            "response": final_output,
            "input_risk_score": risk_score,
            "output_risk_score": output_risk,
            "scanned": True
        }

    async def log_security_event(self, event: dict):
        """Log security events for compliance auditing."""
        # Write to secure audit log
        pass

# Deploy as FastAPI service
from fastapi import FastAPI, HTTPException

app = FastAPI(title="DeepSynaps Clinical LLM Guard")
gateway = ClinicalLLMGuardGateway()

@app.post("/v1/guard/clinical")
async def guard_clinical_request(request: ClinicalRequest):
    """Main endpoint for clinical LLM security scanning."""
    result = await gateway.process_clinical_request(
        request.patient_input,
        request.context
    )

    if result["blocked"]:
        raise HTTPException(
            status_code=400,
            detail=result["reason"]
        )

    return result
```

#### Pricing

| Component | Cost |
|-----------|------|
| LLM Guard library | Free (MIT) |
| Protect AI Guardian | Paid (enterprise) |
| Protect AI ModelScan | Paid |
| Inference | Local (your hardware) |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - Best dedicated input/output scanning library. MIT license, fully offline operation, comprehensive scanner set. Deploy as API gateway for ALL clinical LLM interactions. Essential defense-in-depth layer.

---

### 8.4 Rebuff

**Name:** Rebuff
**Maintainer:** Protect AI
**Language:** Python / TypeScript
**License:** MIT
**GitHub:** https://github.com/protectai/rebuff
**GitHub Stars:** 1,400+
**Website:** https://rebuff.ai

#### Key Features

- **4-layer Defense:** Heuristics, LLM-based detection, vector DB, canary tokens.
- **Self-hardening:** Learns from detected attacks via vector database.
- **Canary Tokens:** Detect prompt leakage through unique token injection.
- **Multi-language SDK:** Python and TypeScript/JavaScript support.
- **LangChain Integration:** Drop-in integration with LangChain.

#### Clinical Suitability

- **MIT License:** Permissive open source.
- **Prompt injection detection:** Critical for clinical AI security.
- **Canary tokens:** Unique feature for detecting prompt information leakage.
- **Note:** Project activity has decreased; consider as reference implementation.
- **Alternative:** LLM Guard provides more comprehensive and actively maintained protection.

#### Integration Path with DeepSynaps

```python
# Rebuff Integration for Prompt Injection Detection
# security/rebuff_integration.py

from rebuff import Rebuff
import os

# Initialize Rebuff (self-hosted)
rb = Rebuff(
    api_token=os.environ["REBUFF_API_TOKEN"],
    api_url="http://rebuff.deepsynaps.internal"  # Self-hosted
)

async def detect_prompt_injection(user_input: str) -> dict:
    """Check patient input for prompt injection attempts."""

    detection_metrics, is_injection = rb.detect_injection(user_input)

    return {
        "is_injection": is_injection,
        "heuristic_score": detection_metrics.heuristic_score,
        "model_score": detection_metrics.model_score,
        "vector_score": detection_metrics.vector_score,
        "total_score": (
            detection_metrics.heuristic_score +
            detection_metrics.model_score +
            detection_metrics.vector_score
        ) / 3
    }

async def protect_clinical_prompt(
    system_prompt: str,
    user_input: str
) -> dict:
    """Add canary token protection to clinical prompts."""

    # Add canary token to detect leakage
    buffed_prompt, canary_word = rb.add_canary_word(system_prompt)

    # Send to LLM
    llm_response = await call_clinical_llm(buffed_prompt, user_input)

    # Check if canary leaked in response
    is_leaked = rb.is_canary_word_leaked(user_input, llm_response, canary_word)

    if is_leaked:
        # Log attack and block response
        await log_security_alert({
            "type": "prompt_leakage",
            "canary_detected": True
        })
        return {
            "safe": False,
            "response": None,
            "alert": "Potential prompt injection detected"
        }

    return {
        "safe": True,
        "response": llm_response
    }
```

#### Pricing

| Component | Cost |
|-----------|------|
| Rebuff library | Free (MIT) |
| Self-hosted | Free (infrastructure cost) |
| Managed service | Usage-based |

#### Verdict for DeepSynaps

**REFERENCE IMPLEMENTATION** - Innovative 4-layer defense concept. Canary token approach is valuable. However, project activity has decreased. Recommend LLM Guard for primary protection, consider Rebuff's canary token approach as supplementary layer.

---

## 9. Medical AI Specific Tools

### 9.1 MedPaLM (Google)

**Name:** MedPaLM / MedPaLM 2
**Maintainer:** Google DeepMind / Google Health
**Type:** Research Model (not open source)
**License:** Proprietary - not publicly released
**Paper:** Nature, 2023; MedPaLM 2, 2023
**Access:** Google Cloud MedLM API (approved healthcare partners only)

#### Key Features

- **USMLE Performance:** 86.5% accuracy on US Medical Licensing Examination questions.
- **Medical QA:** Expert-level medical question answering.
- **Long-form Answers:** Physician-preferred responses in 8 of 9 evaluation axes.
- **Multi-modal:** MedPaLM M supports text, imaging, and genomics.
- **Chain of Retrieval:** Search-based answer grounding.
- **MedLM API:** Production access via Google Cloud Vertex AI.

#### Clinical Performance

| Benchmark | Score | Comparison |
|-----------|-------|------------|
| MedQA (USMLE) | 86.5% | Expert-level |
| MedMCQA | 72.3% | Competitive |
| PubMedQA | 79.7% | Strong |
| MMLU Medical | 91.1% | Excellent |

#### Clinical Suitability

- **NOT open source:** Model weights not publicly available.
- **Research only:** Not approved for direct clinical use without validation.
- **MedLM API:** Production access requires Google Cloud approval.
- **HIPAA:** Available via Google Cloud with BAA.
- **Evidence-based:** Answers grounded in peer-reviewed sources.

#### Access Path

```python
# MedPaLM via Google Cloud MedLM API
# Requires approved healthcare partner agreement

from google.cloud import aiplatform
import vertexai
from vertexai.preview.language_models import TextGenerationModel

# Initialize Vertex AI (HIPAA-compliant with BAA)
vertexai.init(
    project="deepsynaps-clinical",
    location="us-central1"
)

# Access MedLM model (requires approval)
model = TextGenerationModel.from_pretrained("medlm-large")

def query_medpalm(clinical_question: str) -> dict:
    """Query MedPaLM for clinical decision support."""

    parameters = {
        "temperature": 0.1,
        "max_output_tokens": 1024,
        "top_p": 0.8,
        "top_k": 40
    }

    response = model.predict(
        f"""Provide evidence-based clinical guidance for the following question.
        Cite relevant guidelines and studies.
        Include confidence level and limitations.

        Question: {clinical_question}

        Response:""",
        **parameters
    )

    return {
        "answer": response.text,
        "model": "medlm-large",
        "disclaimer": "For decision support only. Verify with current guidelines."
    }
```

#### Pricing

| Model | Cost | Access |
|-------|------|--------|
| MedLM via Vertex AI | Usage-based | Approved partners only |
| MedPaLM 2 API | Google Cloud pricing | Application required |

#### Verdict for DeepSynaps

**EVALUATE FOR DECISION SUPPORT** - State-of-the-art medical QA performance. Not open source but accessible via Google Cloud. Use as supplementary clinical knowledge source, not as primary diagnostic tool. Requires BAA and approval.

---

### 9.2 OpenEvidence

**Name:** OpenEvidence
**Type:** Clinical AI Platform (proprietary)
**License:** Proprietary
**Website:** https://openevidence.com
**Users:** 650,000+ US physicians (65% of practicing physicians)

#### Key Features

- **Evidence-based Search:** AI-powered medical literature search.
- **Journal Partnerships:** Licensed content from NEJM, JAMA, NCCN, ADA.
- **Clinical Decision Support:** Point-of-care treatment recommendations.
- **USMLE Performance:** 100% on USMLE (per company claims).
- **Free for Clinicians:** Free with NPI verification.
- **Mobile App:** iOS and Android apps.

#### Clinical Performance

| Study | Finding | Note |
|-------|---------|------|
| USMLE | 100% (per company) | Self-reported |
| Complex questions | <45% accuracy | Independent study (not peer-reviewed) |
| Physician satisfaction | High | Used by 65% of US physicians |

#### Clinical Suitability

- **Proprietary platform:** Not self-hostable.
- **HIPAA:** Claims HIPAA compliance with privacy protocols.
- **Usage:** Decision support, not diagnostic tool.
- **Caution:** Some health systems restrict PHI input.
- **Integration:** API access may be available for enterprise customers.

#### Verdict for DeepSynaps

**EVALUATE AS KNOWLEDGE SOURCE** - Massive physician adoption validates utility. Use as external knowledge reference for clinical AI responses. Do not route PHI through the platform. Consider licensing content for internal RAG pipeline.

---

### 9.3 MONAI

**Name:** MONAI (Medical Open Network for AI)
**Maintainer:** NVIDIA + King's College London + Community
**Language:** Python (PyTorch)
**License:** Apache 2.0
**GitHub:** https://github.com/Project-MONAI
**GitHub Stars:** 6,000+
**Website:** https://monai.io

#### Key Features

- **Medical Imaging Deep Learning:** PyTorch-based framework for medical AI.
- **MONAI Core:** Training workflows with domain-optimized transforms.
- **MONAI Label:** AI-assisted medical image annotation.
- **MONAI Deploy:** Production deployment of medical AI models.
- **DICOM Support:** Native DICOM, NIfTI, and medical image format support.
- **3D Slicer Integration:** Plugin for the leading medical image viewer.
- **AutoML:** Automated machine learning for medical imaging.
- **GPU Acceleration:** Optimized for NVIDIA GPUs.

#### Clinical Suitability

- **Apache 2.0:** Fully permissive for commercial medical device development.
- **FDA pathway:** MONAI Deploy provides structured deployment for regulatory submissions.
- **DICOM native:** Works directly with clinical imaging workflows.
- **Production deployment:** MONAI Deploy App SDK for clinical integration.
- **Annotation:** MONAI Label reduces annotation effort by 75%.

#### Integration Path with DeepSynaps

```python
# MONAI Integration for Medical Imaging AI
# imaging/monai_integration.py

import monai
from monai.transforms import (
    Compose, LoadImaged, EnsureChannelFirstd,
    ScaleIntensityRanged, RandRotated, RandFlipd,
    ToTensord
)
from monai.networks.nets import UNet
from monai.losses import DiceLoss
from monai.metrics import DiceMetric
from monai.data import DataLoader, Dataset
import torch

# Define clinical imaging pipeline
def create_segmentation_pipeline():
    """Create MONAI pipeline for organ segmentation."""

    # Transforms for CT imaging
    transforms = Compose([
        LoadImaged(keys=["image", "label"]),
        EnsureChannelFirstd(keys=["image", "label"]),
        ScaleIntensityRanged(
            keys=["image"],
            a_min=-1000,  # HU for CT
            a_max=1000,
            b_min=0.0,
            b_max=1.0,
            clip=True
        ),
        RandRotated(keys=["image", "label"], range_x=0.1, prob=0.5),
        RandFlipd(keys=["image", "label"], spatial_axis=0, prob=0.5),
        ToTensord(keys=["image", "label"])
    ])

    return transforms

# Define UNet for organ segmentation
def create_segmentation_model(num_classes: int = 14) -> UNet:
    """Create UNet model for multi-organ segmentation."""

    model = UNet(
        spatial_dims=3,
        in_channels=1,
        out_channels=num_classes,
        channels=(16, 32, 64, 128, 256),
        strides=(2, 2, 2, 2),
        num_res_units=2,
    )
    return model

# MONAI Deploy for clinical production
from monai.deploy.core import Application, resource

@resource(cpu=4, gpu=1, memory="16Gi")
class OrganSegmentationApp(Application):
    """MONAI Deploy application for clinical organ segmentation."""

    def compose(self):
        from monai.deploy.core import DataPath

        # Define pipeline
        dicom_loader = DicomDataLoader(
            expects=[DataPath("dicom_series")],
            produces=[Image("preprocessed_volume")]
        )

        segmentor = MonaiSegmentationOperator(
            model_path="/models/unet_organ_seg.pt",
            expects=[Image("preprocessed_volume")],
            produces=[Segmentation("organ_segmentation")]
        )

        dicom_seg_writer = DicomSegWriter(
            expects=[Segmentation("organ_segmentation")],
            produces=[DataPath("dicom_seg_output")]
        )

        # Connect pipeline
        self.add_flow(dicom_loader, segmentor)
        self.add_flow(segmentor, dicom_seg_writer)

# Deploy with MONAI Deploy
if __name__ == "__main__":
    OrganSegmentationApp(do_run=True)
```

#### Pricing

| Component | Cost |
|-----------|------|
| MONAI Core | Free (Apache 2.0) |
| MONAI Label | Free |
| MONAI Deploy | Free |
| GPU infrastructure | Your hardware/cloud cost |

#### Verdict for DeepSynaps

**STRONG RECOMMEND** - Premier open-source medical imaging framework. Apache 2.0 license, NVIDIA backing, FDA-aligned deployment path. Essential for any imaging AI components. MONAI Deploy provides production deployment scaffolding for regulatory submissions.

---

### 9.4 MNE-Python

**Name:** MNE-Python
**Maintainer:** MNE-Python Contributors
**Language:** Python
**License:** BSD-3-Clause
**GitHub:** https://github.com/mne-tools/mne-python
**GitHub Stars:** 3,400+
**Website:** https://mne.tools

#### Key Features

- **Neurophysiological Data Analysis:** MEG, EEG, sEEG, ECoG processing.
- **Preprocessing:** Filtering, artifact rejection, ICA, Maxwell filtering.
- **Source Estimation:** MNE, dSPM, sLORETA, eLORETA.
- **Time-frequency Analysis:** Spectral decomposition, connectivity.
- **Visualization:** Topographic maps, source estimates, time series.
- **Statistics:** Permutation tests, cluster-based statistics.
- **Machine Learning:** Scikit-learn integration for neurophysiology.
- **Real-time:** mne-lsl for real-time brain signal streaming.

#### Clinical Suitability

- **BSD-3-Clause:** Permissive license for research and commercial use.
- **FDA-cleared devices:** Used in FDA-cleared MEG/EEG analysis pipelines.
- **Clinical MEG/EEG:** Standard tool for pre-surgical epilepsy evaluation.
- **Research:** Extensive use in neuroscience and clinical research.
- **Data formats:** Native support for all major MEG/EEG formats.

#### Integration Path with DeepSynaps

```python
# MNE-Python for Clinical EEG Analysis
# neurophysiology/eeg_analysis.py

import mne
import numpy as np
from typing import Dict, List

class ClinicalEEGAnalyzer:
    """Clinical EEG analysis using MNE-Python."""

    def __init__(self):
        self.montage = mne.channels.make_standard_montage('standard_1020')

    def load_eeg_recording(self, file_path: str) -> mne.io.Raw:
        """Load clinical EEG recording."""

        # Support multiple EEG formats
        raw = mne.io.read_raw(file_path, preload=True)
        raw.set_montage(self.montage)

        return raw

    def preprocess_clinical_eeg(self, raw: mne.io.Raw) -> mne.io.Raw:
        """Standard clinical EEG preprocessing pipeline."""

        # 1. Bandpass filter (clinical standard: 0.5-70 Hz)
        raw.filter(l_freq=0.5, h_freq=70.0)

        # 2. Notch filter at 60 Hz (US) or 50 Hz (EU)
        raw.notch_filter(freqs=60.0)

        # 3. Re-reference to average
        raw.set_eeg_reference('average', projection=True)

        # 4. ICA for artifact removal
        ica = mne.preprocessing.ICA(
            n_components=20,
            random_state=42,
            method='infomax'
        )
        ica.fit(raw)

        # Remove EOG and ECG components
        eog_indices, eog_scores = ica.find_bads_eog(raw)
        ecg_indices, ecg_scores = ica.find_bads_ecg(raw)
        ica.exclude = eog_indices + ecg_indices

        ica.apply(raw)

        return raw

    def detect_epileptiform_activity(
        self,
        raw: mne.io.Raw
    ) -> List[Dict]:
        """Detect epileptiform activity in EEG."""

        # Create epochs for analysis
        epochs = mne.make_fixed_length_epochs(raw, duration=2.0)

        # Compute time-frequency representation
        freqs = np.arange(2, 80, 1)
        power = mne.time_frequency.tfr_morlet(
            epochs,
            freqs=freqs,
            n_cycles=freqs / 2,
            return_itc=False
        )

        # Detect spikes/sharp waves
        spike_detections = []
        for ch_idx, ch_name in enumerate(raw.ch_names):
            ch_data = raw.get_data(picks=ch_idx)[0]

            # Simple spike detection (threshold-based)
            threshold = 3 * np.std(ch_data)
            spike_times = np.where(np.abs(ch_data) > threshold)[0]

            if len(spike_times) > 0:
                spike_detections.append({
                    'channel': ch_name,
                    'spike_count': len(spike_times),
                    'mean_amplitude': np.mean(np.abs(ch_data[spike_times])),
                    'times': raw.times[spike_times]
                })

        return spike_detections

    def generate_clinical_report(
        self,
        raw: mne.io.Raw,
        detections: List[Dict]
    ) -> str:
        """Generate structured clinical EEG report."""

        report = f"""CLINICAL EEG REPORT
        ===================
        Recording Duration: {raw.times[-1]:.1f} seconds
        Channels: {len(raw.ch_names)}
        Sampling Rate: {raw.info['sfreq']} Hz

        PREPROCESSING:
        - Bandpass filter: 0.5-70 Hz
        - Notch filter: 60 Hz
        - Reference: Average
        - ICA artifact removal: Applied

        FINDINGS:
        Epileptiform Activity: {"Detected" if detections else "None detected"}
        """

        for det in detections:
            report += f"""
        - {det['channel']}: {det['spike_count']} events
          Mean amplitude: {det['mean_amplitude']:.2f} uV
        """

        return report
```

#### Pricing

| Component | Cost |
|-----------|------|
| MNE-Python | Free (BSD-3) |
| MNE-CPP | Free (BSD-3) |
| Hosting | Your infrastructure |

#### Verdict for DeepSynaps

**RECOMMEND FOR NEUROPHYSIOLOGY** - Gold standard for EEG/MEG analysis. BSD-3 license, extensive clinical validation. Essential if DeepSynaps includes neurology or neurosurgery use cases.

---

## 10. Architecture Recommendations for DeepSynaps

### 10.1 Recommended Stack Architecture

```
+---------------------+  +---------------------+  +---------------------+
|   Patient Interface  |  |  Clinician Portal   |  |   Admin Dashboard   |
|  (Rasa + Telegram)  |  |   (React/Vue Web)   |  |    (React/Web)      |
+---------+-----------+  +----------+----------+  +----------+----------+
          |                         |                        |
          v                         v                        v
+---------+-----------+-------------------------------------+
|              DeepSynaps API Gateway (Kong/Envoy)           |
|  - Authentication/Authorization (OAuth 2.0 + mTLS)         |
|  - Rate Limiting                                           |
|  - Request Logging (HIPAA audit trail)                     |
+---------+-----------+------------------+------------------+
          |                                  |
          v                                  v
+---------+-----------+          +-------------------------+
|  Clinical Agent      |          |  Non-clinical Services   |
|  Orchestrator        |          |  (Info, Scheduling)      |
|  (LangGraph)         |          |                          |
|                      |          |  - Cal.com (scheduling)  |
|  - Intake Agent      |          |  - N8N (workflows)       |
|  - Triage Agent      |          |  - Rasa (chatbot)        |
|  - Care Coordination |          |                          |
+---------+-----------+          +-----------+--------------+
          |                                    |
          v                                    v
+---------+-----------+            +---------+---------+
|  Tool Gateway (MCP)  |            |  Observability    |
|  + Governance        |            |  (Langfuse)       |
|                      |            |  + Helicone       |
|  - EHR integration   |            |  + Prometheus     |
|  - Scheduling API    |            +---------+---------+
|  - Lab systems       |                      |
|  - Billing           |                      v
+----------------------+            +---------+---------+
          |                           |  Alerting         |
          v                           |  (PagerDuty)      |
+---------+-----------+             +-------------------+
|  Safety Layer        |
|  (Defense in Depth)  |
|                      |
|  1. LLM Guard        |  <- Input/output scanning
|  2. NeMo Guardrails  |  <- Dialog management
|  3. Guardrails AI    |  <- Output validation
|  4. Outlines         |  <- Structured generation
+----------------------+
          |
          v
+----------------------+
|  LLM Layer           |
|                      |
|  Primary: Azure      |
|  OpenAI (HIPAA)      |
|                      |
|  Fallback: Local     |
|  Functionary (on-prem|
|  for sensitive cases)|
+----------------------+
```

### 10.2 Technology Selection Rationale

| Layer | Primary Choice | Rationale |
|-------|---------------|-----------|
| Chatbot | Rasa Pro | Healthcare-native, Apache 2.0, full control |
| Orchestration | LangGraph | Production-grade, auditable, MIT license |
| LLM | Azure OpenAI | HIPAA BAA, GPT-4o clinical reasoning |
| Fallback LLM | Functionary | On-premise, no data leaves network |
| Tools | MCP | Standard protocol, vendor independence |
| Scheduling | Cal.com (diy) | MIT license, self-hosted |
| Workflows | N8N + Airflow | Visual + code-based automation |
| Voice | LiveKit + Twilio | Self-hosted + phone network |
| Observability | Langfuse | MIT license, self-hosted, OTel |
| Safety | NeMo + LLM Guard | Defense in depth, Apache 2.0 |
| Imaging | MONAI | Medical imaging standard, Apache 2.0 |

### 10.3 Deployment Architecture

```yaml
# kubernetes/deepsynaps-deployment.yaml

# Namespace for clinical AI services
apiVersion: v1
kind: Namespace
metadata:
  name: deepsynaps-clinical
  labels:
    app.kubernetes.io/part-of: deepsynaps
    compliance.hipaa: "true"

---
# Rasa deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rasa-pro
  namespace: deepsynaps-clinical
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rasa-pro
  template:
    metadata:
      labels:
        app: rasa-pro
    spec:
      containers:
      - name: rasa
        image: rasa/rasa-pro:latest
        ports:
        - containerPort: 5005
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: rasa-db-credentials
              key: url
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"

---
# LangGraph agent deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clinical-agent
  namespace: deepsynaps-clinical
spec:
  replicas: 2
  selector:
    matchLabels:
      app: clinical-agent
  template:
    metadata:
      labels:
        app: clinical-agent
    spec:
      containers:
      - name: agent
        image: deepsynaps/clinical-agent:latest
        env:
        - name: AZURE_OPENAI_ENDPOINT
          valueFrom:
            secretKeyRef:
              name: azure-openai
              key: endpoint
        - name: REDIS_URL
          value: "redis://redis.deepsynaps-clinical:6379"
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"

---
# Langfuse observability
apiVersion: apps/v1
kind: Deployment
metadata:
  name: langfuse
  namespace: deepsynaps-clinical
spec:
  replicas: 2
  selector:
    matchLabels:
      app: langfuse
  template:
    metadata:
      labels:
        app: langfuse
    spec:
      containers:
      - name: langfuse
        image: langfuse/langfuse:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: langfuse-db
              key: url
        - name: CLICKHOUSE_URL
          valueFrom:
            secretKeyRef:
              name: clickhouse
              key: url
        - name: NEXTAUTH_SECRET
          valueFrom:
            secretKeyRef:
              name: langfuse-auth
              key: secret

---
# LLM Guard security gateway
apiVersion: apps/v1
kind: Deployment
metadata:
  name: llm-guard
  namespace: deepsynaps-clinical
spec:
  replicas: 2
  selector:
    matchLabels:
      app: llm-guard
  template:
    metadata:
      labels:
        app: llm-guard
    spec:
      containers:
      - name: guard
        image: deepsynaps/llm-guard:latest
        ports:
        - containerPort: 8000
        resources:
          requests:
            memory: "4Gi"
            cpu: "2000m"
          limits:
            memory: "8Gi"
            cpu: "4000m"
```

---

## 11. Compliance & Governance Matrix

### 11.1 HIPAA Compliance Mapping

| Tool | Self-hosted | BAA Available | PHI Safe | Audit Log | Recommendation |
|------|------------|---------------|----------|-----------|----------------|
| Rasa | Yes | Yes (Enterprise) | Yes | Yes | PRIMARY |
| Botpress | Yes | No | Partial | Partial | LEGAL REVIEW |
| LangGraph | Yes | N/A (library) | Yes | Via Langfuse | PRIMARY |
| Azure OpenAI | Via Azure | Yes | Yes | Yes | PRIMARY LLM |
| Functionary | Yes | N/A (local) | Yes | Manual | FALLBACK LLM |
| LiveKit | Yes | N/A (self-host) | Yes | Yes | PRIMARY VOICE |
| Twilio | No | Yes | Yes | Yes | PHONE NETWORK |
| Cal.com | Yes | N/A (self-host) | Yes | Yes | PRIMARY SCHED |
| Langfuse | Yes | N/A (self-host) | Yes | Yes | PRIMARY OBS |
| NeMo Guardrails | Yes | N/A (library) | Yes | Yes | PRIMARY SAFETY |
| LLM Guard | Yes | N/A (library) | Yes | Yes | PRIMARY SECURITY |
| MONAI | Yes | N/A (library) | Yes | Via logging | PRIMARY IMAGING |

### 11.2 GDPR Compliance Notes

All primary recommendations support GDPR compliance through:
- Self-hosting for data residency control
- Full audit logging for accountability
- Configurable data retention policies
- Right to erasure via database operations
- Data portability via standard export formats

### 11.3 FDA Regulatory Pathway

For clinical AI devices requiring FDA clearance:

| Component | Pathway | Timeline |
|-----------|---------|----------|
| Decision Support | 510(k) - CADx | 6-12 months |
| Imaging AI (MONAI) | 510(k) - De Novo | 12-18 months |
| Administrative AI | Not regulated | N/A |
| SaMD Class II | 510(k) | 6-12 months |

---

## 12. Total Cost of Ownership Analysis

### 12.1 Monthly Cost Estimate (Small Deployment: 10K patients/month)

| Component | License | Infrastructure | Total/Month |
|-----------|---------|---------------|-------------|
| Rasa Pro Developer | Free | $200 (2 vCPU, 4GB) | $200 |
| LangGraph | Free | $100 (1 vCPU, 2GB) | $100 |
| Azure OpenAI | $500 (API calls) | N/A | $500 |
| LiveKit | Free | $150 (2 vCPU, 4GB) | $150 |
| Twilio | $300 (voice/SMS) | N/A | $300 |
| Cal.com (diy) | Free | $100 (1 vCPU, 2GB) | $100 |
| Langfuse | Free | $200 (2 vCPU, 8GB + ClickHouse) | $200 |
| NeMo Guardrails | Free | $100 (1 vCPU, 2GB) | $100 |
| LLM Guard | Free | $200 (GPU for scanners) | $200 |
| N8N | Free | $100 (1 vCPU, 2GB) | $100 |
| Airflow | Free | $100 (1 vCPU, 2GB) | $100 |
| Kubernetes (GKE/EKS) | N/A | $500 | $500 |
| **TOTAL** | **$500** | **$1,950** | **$2,450/month** |

### 12.2 Monthly Cost Estimate (Large Deployment: 1M patients/month)

| Component | License | Infrastructure | Total/Month |
|-----------|---------|---------------|-------------|
| Rasa Pro Enterprise | $5,000 | $3,000 | $8,000 |
| LangGraph | Free | $1,000 | $1,000 |
| Azure OpenAI | $25,000 | N/A | $25,000 |
| LiveKit | Free | $2,000 | $2,000 |
| Twilio | $8,000 | N/A | $8,000 |
| Cal.com Enterprise | $2,000 | $1,000 | $3,000 |
| Langfuse Enterprise | $2,000 | $3,000 | $5,000 |
| NeMo Guardrails | Free | $1,000 | $1,000 |
| LLM Guard | Free | $2,000 | $2,000 |
| N8N Enterprise | $1,000 | $500 | $1,500 |
| Airflow | Free | $1,000 | $1,000 |
| Kubernetes Cluster | N/A | $5,000 | $5,000 |
| **TOTAL** | **$43,000** | **$19,500** | **$62,500/month** |

---

## 13. Appendices

### Appendix A: Complete License Summary

| Tool | License | Commercial Use | SaaS Use | Modify | Distribute |
|------|---------|---------------|----------|--------|------------|
| Rasa | Apache 2.0 | Yes | Yes | Yes | Yes |
| Botpress v12 | AGPL-3.0 | Yes | Source required | Yes | Yes (same license) |
| python-telegram-bot | LGPL-3 | Yes | Yes | Yes | Yes (library changes) |
| LangGraph | MIT | Yes | Yes | Yes | Yes |
| LangChain | MIT | Yes | Yes | Yes | Yes |
| CrewAI | MIT | Yes | Yes | Yes | Yes |
| AutoGen | MIT | Yes | Yes | Yes | Yes |
| OpenHands | MIT | Yes | Yes | Yes | Yes |
| MCP | MIT | Yes | Yes | Yes | Yes |
| Functionary | MIT | Yes | Yes | Yes | Yes |
| Outlines | Apache 2.0 | Yes | Yes | Yes | Yes |
| LiveKit | Apache 2.0 | Yes | Yes | Yes | Yes |
| Cal.com/diy | MIT | Yes | Yes | Yes | Yes |
| N8N | Sustainable Use License | Yes (internal) | No (resale) | Yes | Source available |
| Airflow | Apache 2.0 | Yes | Yes | Yes | Yes |
| Langfuse | MIT | Yes | Yes | Yes | Yes |
| Helicone | Apache 2.0 | Yes | Yes | Yes | Yes |
| NeMo Guardrails | Apache 2.0 | Yes | Yes | Yes | Yes |
| Guardrails AI | Apache 2.0 | Yes | Yes | Yes | Yes |
| LLM Guard | MIT | Yes | Yes | Yes | Yes |
| Rebuff | MIT | Yes | Yes | Yes | Yes |
| MONAI | Apache 2.0 | Yes | Yes | Yes | Yes |
| MNE-Python | BSD-3 | Yes | Yes | Yes | Yes |

### Appendix B: GitHub Stars Summary (May 2025)

| Tool | Stars | Trend |
|------|-------|-------|
| LangChain | 95,000+ | Stable |
| N8N | 108,000+ | Growing |
| OpenHands | 70,000+ | Rapid growth |
| AutoGen | 50,400+ | Transitioning |
| Apache Airflow | 40,000+ | Stable |
| Rasa | 20,000+ | Stable |
| Botpress | 19,000+ | Stable |
| CrewAI | 25,000+ | Growing |
| python-telegram-bot | 28,000+ | Stable |
| Langfuse | 10,000+ | Growing |
| LiveKit | 12,000+ | Growing |
| Outlines | 10,000+ | Growing |
| NeMo Guardrails | 6,100+ | Stable |
| Guardrails AI | 6,800+ | Growing |
| MONAI | 6,000+ | Stable |
| MNE-Python | 3,400+ | Stable |
| Functionary | 3,500+ | Stable |
| MCP (specification) | 8,100+ | Rapid growth |
| LLM Guard | 2,500+ | Growing |
| Rebuff | 1,400+ | Slowing |

### Appendix C: Security Checklist

```
[X] All PHI stays within network boundary
[X] Self-hosted LLM available for sensitive cases
[X] Input scanning (prompt injection detection)
[X] Output scanning (PII leakage prevention)
[X] Dialog management (topic control)
[X] Structured output generation (schema validation)
[X] Audit logging for all clinical interactions
[X] Human-in-the-loop for critical decisions
[X] Emergency escalation pathways
[X] Rate limiting and abuse prevention
[X] mTLS for service-to-service communication
[X] Encryption at rest and in transit
[X] Role-based access control
[X] Prompt versioning and approval workflow
[X] Model performance monitoring
[X] Bias detection and mitigation
[X] Fallback to human agents
[X] 7-year audit log retention
```

### Appendix D: Recommended Implementation Roadmap

| Phase | Timeline | Components |
|-------|----------|------------|
| Phase 1: Foundation | Month 1-2 | Rasa, LangGraph, Azure OpenAI, Langfuse |
| Phase 2: Safety | Month 2-3 | NeMo Guardrails, LLM Guard, Outlines |
| Phase 3: Voice | Month 3-4 | LiveKit, Twilio integration |
| Phase 4: Scheduling | Month 4-5 | Cal.com, N8N workflows |
| Phase 5: Advanced | Month 5-6 | MCP tools, CrewAI multi-agent, MONAI |
| Phase 6: Scale | Month 6-12 | Full production, monitoring, optimization |

---

## Disclaimer

This report is for informational and research purposes only. Clinical AI systems must comply with applicable regulations (FDA, HIPAA, GDPR) and undergo appropriate validation before deployment. All clinical decisions should involve qualified healthcare professionals. The tools and recommendations in this report do not constitute medical advice or endorsement.

**Document Generated:** July 2025
**Version:** 2.0
**For:** DeepSynaps Protocol Studio
