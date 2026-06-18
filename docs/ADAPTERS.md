# Adapter Development

Adapters let Agent Relay support Hermes, OpenClaw, Agent Zero, and other desktop agents without changing the Android app.

Each adapter implements:

- `descriptor`: identity, display name, adapter type, capabilities, risk level, and status.
- `run(command, emit)`: receives a normalized command and streams status/output events.

The normalized command fields are:

- `commandId`
- `agentId`
- `commandType`: `chat`, `task`, `shell`, `file_action`, or `automation`
- `riskLevel`: `low`, `medium`, or `high`
- `text`

Adapter rules:

- Declare only capabilities that are actually supported.
- Refuse high-risk operations unless local policy allows them.
- Stream long output instead of buffering huge logs.
- Return a final status: `completed`, `failed`, or `cancelled`.

Start from `desktop-host/src/adapters/demo.ts`.
