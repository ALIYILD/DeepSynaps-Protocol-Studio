# Backlog: Custom Agent Builder

## Overview
Allow clinic administrators to create and manage bespoke AI agents tailored to their specific workflows, without writing code. Custom agents extend the base agent taxonomy (e.g., `AppointmentAgent`, `TriageAgent`) with clinic-specific prompts, tool allowlists, and branding.

## Database Model

### `custom_agent_definitions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Unique identifier |
| `clinic_id` | `uuid` | FK → `clinics.id`, not null, index | Owning clinic |
| `name` | `varchar(128)` | not null | Display name of the agent |
| `tagline` | `varchar(255)` | nullable | Short description shown in the agent selector |
| `system_prompt` | `text` | not null | Custom system prompt injected at run time |
| `tool_allowlist` | `jsonb` | not null, default `[]` | Array of tool names the agent is permitted to call |
| `base_agent_id` | `varchar(64)` | not null | Inherits configuration from base agent (e.g., `AppointmentAgent`) |
| `created_by` | `uuid` | FK → `users.id`, not null | Admin who created the custom agent |
| `created_at` | `timestamptz` | default `now()` | — |
| `updated_at` | `timestamptz` | default `now()` | — |

### Indexes
- `idx_custom_agents_clinic_id` on `clinic_id` (list queries)
- `idx_custom_agents_base_agent` on `base_agent_id` (inheritance lookups)

### JSON Schema for `tool_allowlist`
```json
{
  "type": "array",
  "items": {
    "type": "string",
    "enum": [
      "check_availability",
      "book_appointment",
      "cancel_appointment",
      "search_patients",
      "send_reminder",
      "lookup_emr",
      "request_lab",
      "prescribe_medication"
    ]
  },
  "minItems": 1
}
```

## CRUD API Endpoints

### `POST /api/v1/agents/custom`
Create a new custom agent.

**Request Body**
```json
{
  "name": "Dr. Smith's Intake Bot",
  "tagline": "Handles new-patient registration questions",
  "system_prompt": "You are a friendly intake assistant for Dr. Smith's cardiology practice. ...",
  "tool_allowlist": ["search_patients", "book_appointment", "send_reminder"],
  "base_agent_id": "TriageAgent"
}
```

**Validation Rules**
- `name` — unique per `clinic_id`, max 128 chars.
- `system_prompt` — max 8,000 tokens (estimated via tiktoken). Must pass safety scan (see below).
- `tool_allowlist` — at least one tool; each tool must exist in the base agent's available set.
- `base_agent_id` — must reference a registered base agent.

**Response**
```json
{
  "id": "a1b2c3d4-...",
  "name": "Dr. Smith's Intake Bot",
  "tagline": "Handles new-patient registration questions",
  "system_prompt": "You are a friendly intake assistant...",
  "tool_allowlist": ["search_patients", "book_appointment", "send_reminder"],
  "base_agent_id": "TriageAgent",
  "created_by": "user-uuid",
  "created_at": "2026-05-11T12:00:00Z",
  "updated_at": "2026-05-11T12:00:00Z"
}
```

### `GET /api/v1/agents/custom`
List custom agents for the current clinic.

**Query Params**
- `base_agent_id` — optional filter
- `page`, `per_page` — pagination (default 20)

**Response**
```json
{
  "data": [ /* array of agent objects */ ],
  "meta": { "total": 5, "page": 1, "per_page": 20 }
}
```

### `GET /api/v1/agents/custom/{id}`
Retrieve a single custom agent. Returns 404 if `id` does not belong to the requesting clinic.

### `PUT /api/v1/agents/custom/{id}`
Update an existing custom agent. Same validation rules as `POST`.

**Soft-lock on edit:** If the agent has active runs in the last 5 minutes, return `409 Conflict` with a `retry_after` hint to prevent mid-conversation prompt drift.

### `DELETE /api/v1/agents/custom/{id}`
Soft-delete by setting `deleted_at` timestamp. Hard delete is prohibited to preserve audit trails and historical run references.

**Guard:** Cannot delete if there are pending runs assigned to this agent.

## Frontend Form Specification

### Layout
```
┌──────────────────────────────────────────────┐
│ Create Custom Agent                          │
├──────────────────────────────────────────────┤
│ Base Template    [Dropdown ▼]                │
│ Agent Name       [________________]          │
│ Tagline          [________________]          │
│                                                │
│ System Prompt    [                            │
│                   | Multi-line textarea       │
│                   | with token counter        │
│                   | and safety preview        │
│                   ]                           │
│ Token count: 1,247 / 8,000                    │
│                                                │
│ Tools Allowed    [☑] check_availability      │
│                  [☑] book_appointment        │
│                  [ ] cancel_appointment      │
│                  [☑] search_patients         │
│                  [ ] lookup_emr              │
│                  [ ] prescribe_medication    │
│                                                │
│ [   Save Custom Agent   ]                     │
└──────────────────────────────────────────────┘
```

### Components
1. **Base Template Dropdown** — populated from `BaseAgentRegistry.all()`. Selecting a template pre-fills a suggested `system_prompt` and default `tool_allowlist`.
2. **Prompt Textarea** — Monaco or CodeMirror-lite with token counter (tiktoken wasm). Real-time safety scan indicator (see below).
3. **Tool Multi-Select** — checkbox grid filtered to tools available on the selected base agent.
4. **Safety Banner** — inline warning if the safety scan detects blocked terms.

## Safety Validation

### Scan Pipeline
Runs synchronously on every `POST` and `PUT` before persistence.

```ruby
class CustomAgentSafetyScan
  BLOCKED_TERMS = [
    /\bdiagnos(?:e|is|tic)\b/i,
    /\bprescrib(?:e|ing|tion)\b/i,
    /\bmedication\s+dosage\b/i,
    /\btreatment\s+plan\b/i,
    /\byou\s+have\s+(?:cancer|diabetes|hypertension)\b/i
  ]

  def self.scan(prompt)
    violations = BLOCKED_TERMS.select { |re| prompt.match?(re) }
    violations.any? ? Result.fail(violations) : Result.ok
  end
end
```

### Behaviour
- **Violation detected:** return `422 Unprocessable Entity` with:
  ```json
  {
    "error": "SAFETY_VIOLATION",
    "message": "Custom prompts must not contain diagnosis or prescription language.",
    "details": ["Matched pattern: /\\bprescrib(?:e|ing|tion)\\b/i"]
  }
  ```
- **No violation:** proceed to save.

### Future Enhancement
Integrate an LLM-based secondary classifier (`gpt-4o-mini` or local `Llama-Guard`) for semantic detection of disallowed medical advice beyond regex.

## Billing & Pricing

- Custom agents **do not** incur an additional per-agent fee.
- Usage is billed under the parent `base_agent_id` pricing tier.
- If the base agent is free (e.g., `GeneralFAQAgent`), the custom derivative is also free.
- If the base agent is premium (e.g., `TriageAgent`), all custom instances consume the same premium quota.

## Run-Time Integration

When a custom agent is invoked:

1. Load `base_agent_id` configuration (temperature, max_tokens, default tools).
2. Override `system_prompt` with the custom definition.
3. Filter `available_tools` to the intersection of base agent tools and `tool_allowlist`.
4. Inject `agent_metadata` into the run context:
   ```json
   {
     "agent_type": "custom",
     "custom_agent_id": "a1b2c3d4-...",
     "base_agent_id": "TriageAgent",
     "clinic_id": "clinic-uuid"
   }
   ```

## Estimated Effort
**4–5 days**

- Day 1: Migration, model, and validation logic.
- Day 2: CRUD API endpoints and tests.
- Day 3: Frontend form components.
- Day 4: Safety scan integration and edge cases.
- Day 5: Run-time wiring, end-to-end tests, documentation.

## Dependencies
- Base agent registry must expose `available_tools_for(base_agent_id)`.
- Token counting utility (tiktoken or equivalent) must be available in the API layer.
- Clinic admin RBAC must permit `agents:custom:create` scope.

## Owner
Agent Platform / API Squad
