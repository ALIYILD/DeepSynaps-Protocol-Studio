# Agent canary smoke tests

These tests are **structural canaries**, not semantic evaluations. For
every agent registered in `app.services.agents.registry.AGENT_REGISTRY`,
one parametrised test row drives `run_agent` with a deliberately banal
prompt, with the LLM call stubbed out to return a deterministic reply.
The assertions are limited to the runner's response envelope: the
correct `agent_id`, the documented `schema_id`
(`deepsynaps.agents.run/v1`), the documented `safety_footer`
(`decision-support, not autonomous diagnosis`), and the presence of a
string `reply` field. The crisis agent gets one extra check — its
reply must contain at least one of the escalation tokens hard-coded in
the system prompt (`999`, `911`, `emergency`).

This is intentionally distinct from a **semantic evaluation harness**.
A semantic eval would route the canary to a real LLM and grade the
quality of the reply against a ground-truth rubric — necessary for
clinical sign-off, but slow, expensive, non-deterministic, and out of
scope for CI. The canary suite stays cheap (sub-second, no network) so
it can run on every pull request and catch the cheap-to-catch bugs:
someone refactors the runner envelope, renames a schema field, edits a
prompt and accidentally strips an escalation keyword, or registers a
new agent without registering a smoke test for it.

## Running

```bash
cd apps/api
pytest -o addopts="--tb=short" tests/canaries/ -q
```

## Adding a new canary when you ship a new agent

1. Add the new `(agent_id, canary_message)` tuple to `CANARY_INPUTS`
   in `fixtures.py`.
2. If the new agent is expected to short-circuit into a hard-coded
   safety script (similar to `patient.crisis`), add its id to
   `CRISIS_AGENT_IDS` and extend `_smart_llm_stub` in
   `test_agent_canaries.py` with a sentinel substring from its system
   prompt. Otherwise the default `"canary reply"` stub will do.
3. Run the suite. The `test_canary_fixture_covers_every_registered_agent`
   guard will fail loudly until your fixture row is in place, so the
   new agent can't ship without a smoke test.
