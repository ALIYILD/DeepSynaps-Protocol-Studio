# Backlog: Agent Feedback Loop (Self-Learning)

## Overview
Enable clinicians to rate and correct agent responses, creating a closed feedback loop that drives continuous prompt and tool-selection improvement. All feedback remains clinic-private by default.

## Data Model

### `agent_run_feedback`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `run_id` | `uuid` | PK, FK → `agent_runs.id` | The specific run being rated |
| `rating` | `smallint` | not null, check `rating BETWEEN 1 AND 5` | 1 = poor, 5 = excellent |
| `correction_text` | `text` | nullable | Clinician's corrected or preferred response |
| `actor_id` | `uuid` | FK → `users.id`, not null | Clinician who left feedback |
| `created_at` | `timestamptz` | default `now()` | — |

### Design Decisions
- **1:1 with `agent_runs`:** Each run receives at most one feedback record. Updates overwrite previous feedback (audit trail preserved via `agent_run_feedback_history` append-only table if needed later).
- **No `updated_at`:** Feedback is immutable after submission to prevent gaming metrics.

### Optional Extension: `agent_run_feedback_history`
If audit requirements demand immutability, create an append-only history table triggered on update/delete of `agent_run_feedback`.

## User Interface

### Inline Thumbs Widget
After every agent response in the clinician dashboard, render a compact feedback bar:

```
┌────────────────────────────────────────────────────────┐
│ Agent: Was this response helpful?                      │
│ [👍 Helpful]  [👎 Not Helpful]                         │
│                                                        │
│ [Optional: What should the agent have said instead?    │
│  ________________________________________________ ]    │
└────────────────────────────────────────────────────────┘
```

### Behaviour
- **Thumbs up (4–5):** Records `rating = 5`, no correction required.
- **Thumbs down (1–2):** Records `rating = 1`, opens optional correction textarea.
- **Neutral / no action:** No record created; runs without feedback are excluded from learning jobs.

### Accessibility
- Buttons are keyboard-focusable with `aria-label="Mark response as helpful"`.
- Correction textarea has `aria-describedby` linking to the agent response for screen-reader context.

## Nightly Analysis Job

### Job: `FeedbackAnalysisJob`
Runs at 02:00 local clinic time (staggered to distribute load).

```ruby
class FeedbackAnalysisJob
  def perform(clinic_id:)
    low_rated = AgentRunFeedback
      .where(clinic_id: clinic_id)
      .where("created_at >= ?", 24.hours.ago)
      .where("rating <= 2")
      .includes(:agent_run)

    clusters = ClusteringService.cluster(
      items: low_rated,
      vectorizer: :embedding,
      algorithm: :k_means,
      k: estimate_k(low_rated.count)
    )

    clusters.each do |cluster|
      FailureMode.create!(
        clinic_id: clinic_id,
        category: cluster.centroid_topic,
        sample_run_ids: cluster.run_ids.first(5),
        frequency: cluster.count,
        detected_at: Time.current
      )
    end
  end
end
```

### Clustering Pipeline
1. **Embedding:** Generate vector embeddings for `agent_run.input + agent_run.output + correction_text` using `text-embedding-3-small`.
2. **Clustering:** HDBSCAN or K-Means (auto-estimated `k`) to group semantically similar failures.
3. **Topic Labelling:** LLM summarises each cluster centroid into a human-readable category (e.g., "Incorrect appointment slot suggestion", "Overly verbose response", "Wrong tool selected").

## Prompt Optimisation

### Job: `PromptOptimisationJob`
Runs weekly (Sundays at 03:00) after `FeedbackAnalysisJob` has populated failure modes.

```ruby
class PromptOptimisationJob
  def perform(clinic_id:)
    top_failures = FailureMode
      .where(clinic_id: clinic_id)
      .where("frequency >= ?", threshold)
      .order(frequency: :desc)
      .limit(10)

    custom_agents = CustomAgentDefinition.where(clinic_id: clinic_id)

    custom_agents.each do |agent|
      relevant_failures = top_failures.for_agent(agent.id)
      next if relevant_failures.empty?

      suggestion = LlmPromptOptimizer.suggest(
        current_prompt: agent.system_prompt,
        failures: relevant_failures,
        model: "gpt-4o"
      )

      PromptSuggestion.create!(
        custom_agent_id: agent.id,
        proposed_prompt: suggestion.prompt,
        rationale: suggestion.rationale,
        affected_failure_modes: relevant_failures.pluck(:id),
        status: "pending_review"
      )
    end
  end
end
```

### Review Workflow
- Suggestions are **not** auto-applied.
- Clinic admin receives an in-app notification: "New prompt suggestions available for 2 agents."
- Admin reviews diff (old vs. proposed) and approves or rejects.
- On approval: update `custom_agent_definitions.system_prompt`, increment `version`, and log the change.

## Tool Selection Learning

### Tracking Schema
Extend `agent_run_feedback` with a computed `tools_used` snapshot from `agent_runs.tool_calls`.

### Correlation Analysis
```sql
SELECT
  tool_name,
  AVG(rating) AS avg_rating,
  COUNT(*) AS usage_count,
  STDDEV(rating) AS rating_variance
FROM agent_run_feedback arf
JOIN agent_run_tools art ON art.run_id = arf.run_id
WHERE arf.clinic_id = :clinic_id
  AND arf.created_at >= NOW() - INTERVAL '30 days'
GROUP BY tool_name
ORDER BY avg_rating ASC, usage_count DESC;
```

### Actions
- **Low-rated tool:** Flag for review in the admin dashboard; consider removing from `tool_allowlist`.
- **High-rated, low-usage tool:** Surface in "Suggested Tools" UI for other custom agents.
- **Tool sequence patterns:** If `lookup_emr → prescribe_medication` consistently rates poorly, suggest adding an intermediate `verify_diagnosis` tool or updating the tool description.

## Privacy Guarantees

### Clinic-Private by Design
- All `agent_run_feedback` rows are scoped to `clinic_id`.
- The nightly jobs run per-clinic; no cross-clinic aggregation occurs.
- Embeddings, cluster models, and failure modes are stored with `clinic_id` partitioning.
- Raw patient data (names, MRNs) is never sent to the LLM optimiser; inputs are anonymised or replaced with placeholders before prompt optimisation.

### Compliance
- **HIPAA:** Feedback does not contain PHI if `correction_text` is limited to agent behaviour, not patient specifics. Enforce via input validation and regex scrubbing of 18 HIPAA identifiers.
- **GDPR:** Clinicians (data subjects) can request export or deletion of their feedback via the existing GDPR data-portability endpoint.

## Estimated Effort
**5–6 days**

- Day 1: `agent_run_feedback` table, thumbs UI, API endpoint.
- Day 2: Embedding pipeline and clustering service.
- Day 3: Nightly `FeedbackAnalysisJob` and `FailureMode` model.
- Day 4: `PromptOptimisationJob` and suggestion review UI.
- Day 5: Tool correlation queries and dashboard widgets.
- Day 6: Privacy scrubbing, HIPAA validation, tests.

## Dependencies
- Vector embedding service (OpenAI or local `nomic-embed-text`).
- `agent_runs` table must persist `tool_calls` JSON for correlation analysis.
- Clinic admin notification system for prompt suggestion reviews.

## Owner
ML Platform / Agent Intelligence Squad
