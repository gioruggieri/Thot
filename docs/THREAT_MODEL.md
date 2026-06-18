# Threat Model

Thot can instruct a desktop machine to act on behalf of a remote Android user. That makes authentication, device revocation, command approval, and audit logs core safety features.

## Assets

- Desktop filesystem and applications.
- Agent credentials and local secrets.
- Relay account credentials.
- Command history and output logs.

## Primary Risks

- Stolen Android token sends commands to a desktop.
- Revoked desktop continues receiving commands.
- Adapter exposes shell/file access without explicit policy.
- Replay of an old high-risk command.
- Relay operator or compromised server reads sensitive command content.

## MVP Mitigations

- JWT-authenticated APIs and WebSockets.
- Revocable devices.
- High-risk command classification.
- Demo shell execution disabled unless explicitly enabled.
- Command and event audit log.

## Planned Hardening

- QR/coded device pairing instead of password reuse on every device.
- End-to-end encryption between Android and desktop.
- Idempotency keys and replay windows.
- Local desktop confirmation for destructive actions.
- Per-adapter permission profiles.
