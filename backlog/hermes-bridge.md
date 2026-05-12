# Backlog: Hermes Bridge Integration

## Overview
Integrate the DeepSynaps agent runner with the Hermes AI orchestration layer via the Agent Client Protocol (ACP). Hermes provides dynamic provider re-ranking, tool discovery, and cross-agent routing. This bridge allows DeepSynaps agents to participate in a broader orchestration ecosystem while retaining clinic-local policy enforcement.

## Hermes ACP Adapter Overview

### Agent Client Protocol (ACP)
Hermes ACP is a gRPC + JSON-RPC hybrid protocol for:
- **Capability advertisement** — agents announce tools, prompts, and resources.
- **Task delegation** — orchestrator routes sub-tasks to the most capable agent.
- **Provider abstraction** — LLM calls are proxied through Hermes, which selects the optimal provider.

### Adapter Architecture
```
┌─────────────────────────────────────────────────────────────┐
│  DeepSynaps Agent Runner                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Agent Brain  │  │ Tool Registry│  │ Provider Reg.   │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                 │                    │            │
│         └─────────────────┴────────────────────┘            │
│                           │                                 │
│                    ┌──────┴──────┐                          │
│                    │HermesBridge │  ←── new component        │
│                    └──────┬──────┘                          │
└───────────────────────────┼─────────────────────────────────┘
                            │ gRPC / HTTP2
┌───────────────────────────┼─────────────────────────────────┐
│  Hermes Orchestrator      │                                   │
│  ┌────────────────────────┴────────┐                         │
│  │  Provider Re-ranker              │                         │
│  │  Tool Discovery Engine           │                         │
│  │  Cross-Agent Router              │                         │
│  └──────────────────────────────────┘                         │
└───────────────────────────────────────────────────────────────┘
```

## Bridge Component Specification

### Module: `apps/api/app/services/agent_brain/hermes_bridge.rb`

```ruby
class AgentBrain::HermesBridge
  HERMES_HOST = ENV.fetch("HERMES_HOST", "hermes.deepsynaps.internal")
  HERMES_PORT = ENV.fetch("HERMES_PORT", "50051").to_i

  def initialize(clinic_id:, agent_id:)
    @clinic_id = clinic_id
    @agent_id = agent_id
    @stub = Hermes::ACP::Stub.new("#{HERMES_HOST}:#{HERMES_PORT}", :this_channel_is_insecure)
  end

  # --- Capability Advertisement ---
  def register_capabilities
    stub.register_agent(Hermes::RegisterAgentRequest.new(
      agent_id: @agent_id,
      clinic_id: @clinic_id,
      tools: ToolRegistry.tools_for(@agent_id).map(&:to_acp_proto),
      prompts: PromptRegistry.prompts_for(@agent_id).map(&:to_acp_proto),
      resources: ResourceRegistry.resources_for(@agent_id).map(&:to_acp_proto)
    ))
  end

  # --- Provider Re-ranking Proxy ---
  def complete(prompt:, preferred_provider: nil)
    response = stub.llm_complete(Hermes::LLMCompleteRequest.new(
      clinic_id: @clinic_id,
      agent_id: @agent_id,
      prompt: prompt,
      preferred_provider: preferred_provider,
      constraints: Hermes::Constraints.new(
        max_latency_ms: 3000,
        max_cost_per_1k_tokens: 0.02
      )
    ))

    {
      content: response.content,
      provider_used: response.provider_name,
      tokens_prompt: response.usage.prompt_tokens,
      tokens_completion: response.usage.completion_tokens,
      latency_ms: response.latency_ms
    }
  end

  # --- Tool Discovery ---
  def discover_tools(query:, limit: 5)
    response = stub.discover_tools(Hermes::DiscoverToolsRequest.new(
      clinic_id: @clinic_id,
      query: query,
      limit: limit
    ))

    response.tools.map do |t|
      {
        name: t.name,
        description: t.description,
        source_agent: t.source_agent_id,
        confidence: t.relevance_score
      }
    end
  end
end
```

## Provider Re-Ranking

### Problem
DeepSynaps currently pins each agent to a single LLM provider (e.g., GPT-4o via OpenAI). Clinic traffic is bursty; cost and latency vary by provider and time of day.

### Hermes Solution
Hermes maintains a real-time provider scorecard:

| Metric | Weight | Source |
|--------|--------|--------|
| Latency p99 | 30% | Hermes telemetry |
| Cost per 1k tokens | 25% | Provider rate cards |
| Quality score (eval benchmark) | 25% | Weekly automated evals |
| Error rate | 20% | Hermes circuit-breaker |

### Integration Point
`apps/api/app/services/agent_brain/provider_registry.rb` already abstracts provider selection. Extend it with a `HermesProviderAdapter` that delegates the `select_provider` decision to Hermes when `HERMES_BRIDGE_ENABLED=true`.

```ruby
class ProviderRegistry
  def select_provider(clinic_id:, agent_id:, constraints:)
    if Features.enabled?(:hermes_bridge, clinic_id)
      HermesBridge.new(clinic_id: clinic_id, agent_id: agent_id)
        .complete(prompt: constraints[:prompt])
    else
      legacy_select(constraints)
    end
  end
end
```

### Fallback
If Hermes is unreachable or returns no valid provider within 500 ms, fall back to the clinic's default provider (existing behaviour).

## Tool Discovery

### Problem
Clinic admins building custom agents may not know the full inventory of available tools across the platform.

### Hermes Solution
Hermes indexes all tools from all registered agents and exposes semantic search. The bridge queries Hermes when:
- An admin opens the custom agent builder.
- An agent fails to find a tool for a user request (Hermes suggests a cross-agent tool).

### Integration Point
Add a `suggested_tools` endpoint in the custom agent builder API:

```ruby
# GET /api/v1/agents/custom/suggested_tools?q=appointment+reminder
suggestions = HermesBridge.new(clinic_id: current_clinic.id, agent_id: params[:base_agent_id])
  .discover_tools(query: params[:q], limit: 5)

render json: { data: suggestions }
```

### Policy Enforcement
Even if Hermes suggests a tool, DeepSynaps enforces the clinic's `tool_allowlist` and RBAC before execution. Hermes never bypasses local policy.

## Integration Points

| DeepSynaps Component | Hermes Bridge Hook | Purpose |
|----------------------|--------------------|---------|
| `AgentBrain::Runner#run` | `HermesBridge#complete` | Proxy LLM completion through Hermes |
| `AgentBrain::ProviderRegistry` | `HermesProviderAdapter` | Dynamic provider selection |
| `CustomAgentBuilderController` | `HermesBridge#discover_tools` | Suggest tools during agent creation |
| `AgentLifecycleService` | `HermesBridge#register_capabilities` | Advertise agent on startup |
| `ToolExecutor` | `HermesBridge#execute_remote_tool` | Call tools from other Hermes-registered agents |

## Configuration

```yaml
# config/hermes.yml
production:
  enabled: true
  host: hermes.deepsynaps.internal
  port: 50051
  tls:
    enabled: true
    cert_path: /etc/deepsynaps/certs/hermes-client.crt
    key_path: /etc/deepsynaps/certs/hermes-client.key
  timeout_ms: 3000
  fallback_on_error: true
  capabilities_refresh_interval: 300 # seconds
```

## Security & Policy

- **mTLS:** All gRPC channels require mutual TLS. Certificates rotated via the existing Vault integration.
- **Clinic Isolation:** Hermes must never route a tool call or LLM request for clinic A through clinic B's provider credentials.
- **Audit:** Every Hermes proxied call is logged to `hermes_bridge_audit_log` with `request_id`, `provider_used`, `latency_ms`, and `clinic_id`.

## Estimated Effort
**1 week (5 days)**

- Day 1: Protobuf definitions, gRPC client setup, TLS configuration.
- Day 2: `HermesBridge` core adapter, capability registration.
- Day 3: Provider re-ranking integration in `ProviderRegistry`.
- Day 4: Tool discovery API, custom agent builder UI wiring.
- Day 5: Fallback logic, audit logging, integration tests, docs.

## Dependencies
- Hermes orchestrator deployed and reachable from the API VPC.
- gRPC Ruby gem (`grpc`) added to `Gemfile`.
- Protobuf definitions published by the Hermes team (versioned artefact).
- mTLS certificates provisioned for the API service account.

## Owner
Platform Engineering / Integrations Squad
