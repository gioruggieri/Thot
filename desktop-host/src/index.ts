import WebSocket from "ws";
import { DemoAdapter } from "./adapters/demo.js";
import type { AgentAdapter, AgentCommand, AgentOutput } from "./types.js";

const relayUrl = process.env.RELAY_URL ?? "http://localhost:8080";
const email = process.env.RELAY_EMAIL;
const password = process.env.RELAY_PASSWORD;
const desktopName = process.env.DESKTOP_NAME ?? `${process.platform}-${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "desktop"}`;
let deviceId = process.env.DEVICE_ID;

if (!email || !password) {
  throw new Error("Set RELAY_EMAIL and RELAY_PASSWORD before starting the desktop host.");
}

const adapters: AgentAdapter[] = [new DemoAdapter()];
const adapterMap = new Map(adapters.map((adapter) => [adapter.descriptor.id, adapter]));

async function api<T>(path: string, token: string | undefined, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${relayUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function login() {
  const result = await api<{ token: string }>("/api/auth/login", undefined, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  return result.token;
}

async function ensureDevice(token: string) {
  if (deviceId) return deviceId;
  const result = await api<{ id: string }>("/api/devices", token, {
    method: "POST",
    body: JSON.stringify({ name: desktopName, kind: "desktop" })
  });
  deviceId = result.id;
  console.log(`Registered desktop device ${deviceId}. Persist it as DEVICE_ID for future runs.`);
  return deviceId;
}

function wsUrl(token: string, id: string) {
  const base = relayUrl.replace(/^http/, "ws");
  return `${base}/ws/desktop?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(id)}`;
}

function emitToRelay(socket: WebSocket, commandId: string, event: AgentOutput) {
  if (event.type === "output") {
    socket.send(JSON.stringify({ type: "command.output", commandId, stream: event.stream, text: event.text }));
    return;
  }
  if (event.status === "completed" || event.status === "failed" || event.status === "cancelled") {
    socket.send(JSON.stringify({ type: "command.complete", commandId, status: event.status, message: event.message }));
    return;
  }
  socket.send(JSON.stringify({ type: "command.status", commandId, status: event.status, message: event.message }));
}

async function connect() {
  const token = await login();
  const id = await ensureDevice(token);
  const socket = new WebSocket(wsUrl(token, id));

  socket.on("open", () => {
    console.log(`Connected to relay as ${desktopName}`);
    socket.send(JSON.stringify({
      type: "agents.upsert",
      agents: adapters.map((adapter) => adapter.descriptor)
    }));
  });

  socket.on("message", async (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type !== "command.run") return;

    const command = message as AgentCommand;
    const adapter = adapterMap.get(command.agentId);
    if (!adapter) {
      socket.send(JSON.stringify({ type: "command.complete", commandId: command.commandId, status: "failed", message: "Unknown agent" }));
      return;
    }

    try {
      await adapter.run(command, (event) => emitToRelay(socket, command.commandId, event));
    } catch (error) {
      socket.send(JSON.stringify({
        type: "command.complete",
        commandId: command.commandId,
        status: "failed",
        message: error instanceof Error ? error.message : "Unknown adapter error"
      }));
    }
  });

  socket.on("close", () => {
    console.log("Disconnected from relay. Reconnecting in 3 seconds...");
    setTimeout(() => connect().catch(console.error), 3000);
  });
}

connect().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
