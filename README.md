# Thot

Thot is a self-hosted, open source relay for controlling desktop AI agents from Android.

The project is intentionally local-first and self-hostable: Android sends commands to a relay you control, and the desktop host receives them over an outbound WebSocket connection. Agents such as Hermes, OpenClaw, Agent Zero, or custom tools are integrated through desktop adapters.

## Current MVP

- Backend relay with REST APIs and WebSocket routing.
- PostgreSQL schema for users, devices, agents, conversations, commands, and audit events.
- Redis presence hook for desktop online state.
- Desktop host with a demo adapter.
- Android Kotlin app with login, desktop/agent selection, command sending, and realtime event display.
- Docker Compose for the backend stack.

## Quickstart

1. Copy the environment file:

   ```sh
   cp .env.example .env
   ```

2. Change `JWT_SECRET` in `.env`.

3. Start the self-hosted relay:

   ```sh
   docker compose up --build
   ```

4. Create an account:

   ```sh
   curl -X POST http://localhost:8080/api/auth/register \
     -H "content-type: application/json" \
     -d "{\"email\":\"you@example.com\",\"password\":\"change-me-now\"}"
   ```

5. Start the desktop host:

   ```sh
   npm install
   $env:RELAY_URL="http://localhost:8080"
   $env:RELAY_EMAIL="you@example.com"
   $env:RELAY_PASSWORD="change-me-now"
   npm run dev:desktop
   ```

6. Install/build the Android app from `android/`, log in with the same account, refresh devices, choose the demo agent, and send a command.

For the Android emulator, the default relay URL is `http://10.0.2.2:8080`. On a physical phone, use your relay machine LAN/VPS URL.

## Cloud Deployment

For a VPS deployment with HTTPS, use [docs/CLOUD_DEPLOY.md](docs/CLOUD_DEPLOY.md).

## Security Defaults

Thot treats desktop control as dangerous by default.

- Shell and file actions are marked high risk.
- The demo adapter refuses shell execution unless `ALLOW_SHELL=true` is set on the desktop host.
- Devices can be revoked with `DELETE /api/devices/:id`.
- Every command creates audit events in the database.

This MVP still uses account login for device registration. QR/coded pairing is a planned hardening step.

## Repositories And Components

- `backend/`: Fastify relay server, REST API, WebSocket broker, PostgreSQL schema.
- `desktop-host/`: local desktop process that connects to the relay and exposes agent adapters.
- `android/`: native Android Kotlin app.
- `docs/`: threat model, adapter guide, roadmap, and distribution notes.

## License

AGPL-3.0-only. See `LICENSE`.
