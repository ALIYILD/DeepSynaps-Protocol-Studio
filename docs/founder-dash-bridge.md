# Founder Dash Bridge

This is the control-plane bridge for external runtimes that should report into DeepSynaps Founder Dash without using a browser JWT session.

Use it for:
- `AliSlave AI` personal tasks
- `Perfflux HQ` company tasks
- `Hermes` DeepSynaps execution updates
- `Paperclip` governance / approval updates

## Env

Set these on the DeepSynaps API deployment:

- `FOUNDER_DASH_BRIDGE_KEY`
- `FOUNDER_DASH_BRIDGE_ACTOR_ID`
- `FOUNDER_DASH_BRIDGE_ACTOR_ROLE=admin`

Set these on any caller runtime that will post into Founder Dash:

- `DEEPSYNAPS_FOUNDER_DASH_URL=https://deepsynaps-studio.fly.dev`
- `DEEPSYNAPS_FOUNDER_DASH_BRIDGE_KEY=...same secret...`
- `DEEPSYNAPS_FOUNDER_DASH_ACTOR_ID=...founder actor id...`
- `DEEPSYNAPS_FOUNDER_DASH_ACTOR_ROLE=admin`

## Endpoints

- `POST /api/v1/hermes/bridge/intake`
- `POST /api/v1/hermes/bridge/system-events`

Both require:

- header `X-Founder-Dash-Bridge-Key`

## CLI

Use the repo helper:

```bash
python scripts/founder_dash_bridge.py intake \
  --source hermes \
  --source-channel hermes \
  --source-agent-or-bot hermes-gateway \
  --priority P0 \
  --title "Run release candidate check" \
  --notes "Triggered from Hermes coordinator"
```

```bash
python scripts/founder_dash_bridge.py event \
  --event-kind task_started \
  --related-task-id task_123 \
  --title "Hermes picked up release check" \
  --detail "backend-engineer started verification"
```

## Source Routing

Preferred task sources:

- `openclaw-personal` -> `personal`
- `openclaw-perfflux` -> `perfflux`
- `hermes` -> `deepsynaps`
- `paperclip` -> `governance`
- `bridge` -> keyword-based fallback routing

Telegram-origin tasks should use the explicit Telegram sources:

- `telegram-personal`
- `telegram-perfflux`
- `telegram-deepsynaps`
- `telegram-governance`

## Important behavior change

Bridge intake now feeds the Hermes runtime, not the legacy founder-dash task table.

That means:

- every task is created in `global-inbox` first
- routing is auditable
- unclear tasks remain in `global-inbox`
- system events append audit entries to an existing runtime task
