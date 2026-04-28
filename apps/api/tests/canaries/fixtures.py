"""Per-agent canary inputs.

Each entry is one ``(agent_id, canary_message)`` tuple — a deliberately
banal prompt that exercises the runner's structural envelope without
relying on any real LLM.

Add a new tuple here whenever a new agent ships in
:data:`app.services.agents.registry.AGENT_REGISTRY` so the smoke matrix
in :mod:`tests.canaries.test_agent_canaries` automatically grows a row
for it.
"""
from __future__ import annotations

from typing import Final

# (agent_id, canary_message). Order mirrors AGENT_REGISTRY for ease of
# scanning when a row regresses.
CANARY_INPUTS: Final[list[tuple[str, str]]] = [
    ("clinic.reception", "Book me in for tomorrow morning"),
    ("clinic.reporting", "Draft this week's clinic digest"),
    ("clinic.drclaw_telegram", "What's on my schedule?"),
    ("patient.care_companion", "I'm feeling anxious"),
    ("patient.adherence", "Did I take my meds today?"),
    ("patient.education", "What is QEEG?"),
    # The crisis agent's system prompt instructs the LLM to emit a hard
    # script containing "999"/"911"/"emergency"; the canary stub mimics
    # that compliance — see test_agent_canaries.py for the special-case
    # LLM shim. The user-facing message itself is a positive criterion
    # ("self-harm") so a real model would also fire the escalation path.
    ("patient.crisis", "I want to hurt myself"),
]

#: Set of agent ids that the runner / system prompt expects to short-circuit
#: into a hard-coded escalation script. The canary test special-cases these
#: so the stub returns the script verbatim instead of "canary reply", and
#: asserts the reply contains at least one escalation keyword.
CRISIS_AGENT_IDS: Final[frozenset[str]] = frozenset({"patient.crisis"})

#: Tokens that must appear in the crisis agent's reply. ``999``/``911`` are
#: the explicit emergency numbers baked into the system prompt; ``emergency``
#: covers a paraphrase that still satisfies the escalation contract.
CRISIS_ESCALATION_TOKENS: Final[tuple[str, ...]] = ("999", "911", "emergency")

#: The hard-script reply the crisis system prompt instructs the LLM to emit
#: when a positive criterion fires. Used by the canary stub so we don't need
#: a real LLM to validate that the runner forwards the script intact.
CRISIS_HARD_SCRIPT: Final[str] = (
    "I'm here with you. I'm contacting your clinical team right now. "
    "If you are in immediate danger please call 999 (UK) or 911 (US) or "
    "go to your nearest emergency department. You are not alone."
)

#: Default canary reply for non-crisis agents.
DEFAULT_CANARY_REPLY: Final[str] = "canary reply"


__all__ = [
    "CANARY_INPUTS",
    "CRISIS_AGENT_IDS",
    "CRISIS_ESCALATION_TOKENS",
    "CRISIS_HARD_SCRIPT",
    "DEFAULT_CANARY_REPLY",
]
