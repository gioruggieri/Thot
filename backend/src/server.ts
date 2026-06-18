import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import bcrypt from "bcryptjs";
import Fastify from "fastify";
import { Redis } from "ioredis";
import { z } from "zod";
import { migrate, query } from "./db.js";
import { commandRequiresApproval } from "./security.js";
import type { CommandEnvelope, DesktopEnvelope, MobileEnvelope } from "./types.js";

const jwtSecret = process.env.JWT_SECRET ?? "dev-only-change-me";
const port = Number(process.env.PORT ?? 8080);

const app = Fastify({ logger: true });
const desktopSockets = new Map<string, any>();
const mobileSockets = new Map<string, Set<any>>();
const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

await app.register(cors, { origin: true });
await app.register(jwt, { secret: jwtSecret });
await app.register(websocket);

app.decorate("authenticate", async (request: any) => {
  await request.jwtVerify();
});

function mobileSet(userId: string) {
  let set = mobileSockets.get(userId);
  if (!set) {
    set = new Set();
    mobileSockets.set(userId, set);
  }
  return set;
}

function sendJson(socket: any, payload: unknown) {
  if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function broadcastMobile(userId: string, payload: MobileEnvelope) {
  for (const socket of mobileSet(userId)) sendJson(socket, payload);
}

async function requireOwnedDevice(userId: string, deviceId: string, kind?: "android" | "desktop") {
  const params: unknown[] = [deviceId, userId];
  const kindClause = kind ? "AND kind = $3" : "";
  if (kind) params.push(kind);
  const result = await query("SELECT * FROM devices WHERE id = $1 AND user_id = $2 AND revoked = false " + kindClause, params);
  if (!result.rowCount) {
    const error = new Error("Device not found") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  return result.rows[0];
}

async function recordEvent(commandId: string, eventType: string, payload: unknown) {
  await query("INSERT INTO command_events (command_id, event_type, payload) VALUES ($1, $2, $3)", [
    commandId,
    eventType,
    JSON.stringify(payload)
  ]);
}

app.get("/health", async () => ({ ok: true }));

app.post("/api/auth/register", async (request, reply) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(8) }).parse(request.body);
  const passwordHash = await bcrypt.hash(body.password, 12);
  const result = await query("INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email", [
    body.email.toLowerCase(),
    passwordHash
  ]);
  const token = app.jwt.sign({ sub: result.rows[0].id, email: result.rows[0].email });
  return reply.code(201).send({ token, user: result.rows[0] });
});

app.post("/api/auth/login", async (request, reply) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
  const result = await query("SELECT id, email, password_hash FROM users WHERE email = $1", [body.email.toLowerCase()]);
  if (!result.rowCount || !(await bcrypt.compare(body.password, result.rows[0].password_hash))) {
    return reply.code(401).send({ error: "Invalid credentials" });
  }
  const token = app.jwt.sign({ sub: result.rows[0].id, email: result.rows[0].email });
  return { token, user: { id: result.rows[0].id, email: result.rows[0].email } };
});

app.post("/api/devices", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
  const body = z.object({ name: z.string().min(1), kind: z.enum(["android", "desktop"]) }).parse(request.body);
  const result = await query(
    "INSERT INTO devices (user_id, name, kind) VALUES ($1, $2, $3) RETURNING id, name, kind, created_at",
    [request.user.sub, body.name, body.kind]
  );
  return reply.code(201).send(result.rows[0]);
});

app.get("/api/devices", { preHandler: (app as any).authenticate }, async (request: any) => {
  const result = await query(
    "SELECT id, name, kind, revoked, last_seen_at, created_at FROM devices WHERE user_id = $1 ORDER BY created_at DESC",
    [request.user.sub]
  );
  return { devices: result.rows };
});

app.delete("/api/devices/:id", { preHandler: (app as any).authenticate }, async (request: any) => {
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  await requireOwnedDevice(request.user.sub, params.id);
  await query("UPDATE devices SET revoked = true WHERE id = $1", [params.id]);
  desktopSockets.get(params.id)?.close();
  desktopSockets.delete(params.id);
  return { ok: true };
});

app.get("/api/devices/:id/agents", { preHandler: (app as any).authenticate }, async (request: any) => {
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  await requireOwnedDevice(request.user.sub, params.id, "desktop");
  const result = await query("SELECT id, name, adapter, capabilities, risk_level, status FROM agents WHERE device_id = $1 ORDER BY name", [
    params.id
  ]);
  return { agents: result.rows };
});

app.post("/api/conversations", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
  const body = z.object({ desktopDeviceId: z.string().uuid(), agentId: z.string().min(1) }).parse(request.body);
  await requireOwnedDevice(request.user.sub, body.desktopDeviceId, "desktop");
  const result = await query(
    "INSERT INTO conversations (user_id, desktop_device_id, agent_id) VALUES ($1, $2, $3) RETURNING *",
    [request.user.sub, body.desktopDeviceId, body.agentId]
  );
  return reply.code(201).send(result.rows[0]);
});

app.post("/api/commands", { preHandler: (app as any).authenticate }, async (request: any, reply) => {
  const body = z.object({
    conversationId: z.string().uuid(),
    commandType: z.enum(["chat", "task", "shell", "file_action", "automation"]).default("chat"),
    riskLevel: z.enum(["low", "medium", "high"]).default("low"),
    text: z.string().min(1),
    approved: z.boolean().default(false)
  }).parse(request.body);

  const conversation = await query(
    "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
    [body.conversationId, request.user.sub]
  );
  if (!conversation.rowCount) return reply.code(404).send({ error: "Conversation not found" });
  const convo = conversation.rows[0];
  const requiresApproval = commandRequiresApproval(body.commandType, body.riskLevel);
  if (requiresApproval && !body.approved) {
    return reply.code(409).send({ error: "Command requires explicit approval", requiresApproval: true });
  }

  const result = await query(
    `INSERT INTO commands
      (conversation_id, user_id, desktop_device_id, agent_id, command_type, risk_level, text, requires_approval, approved_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $8 THEN now() ELSE NULL END)
     RETURNING *`,
    [
      body.conversationId,
      request.user.sub,
      convo.desktop_device_id,
      convo.agent_id,
      body.commandType,
      body.riskLevel,
      body.text,
      requiresApproval
    ]
  );
  const command = result.rows[0];
  await recordEvent(command.id, "queued", { text: body.text, commandType: body.commandType, riskLevel: body.riskLevel });

  const socket = desktopSockets.get(convo.desktop_device_id);
  if (!socket) {
    await query("UPDATE commands SET status = 'blocked' WHERE id = $1", [command.id]);
    return reply.code(202).send({ command, delivery: "desktop_offline" });
  }

  const envelope: CommandEnvelope = {
    type: "command.run",
    commandId: command.id,
    agentId: convo.agent_id,
    commandType: body.commandType,
    riskLevel: body.riskLevel,
    text: body.text
  };
  sendJson(socket, envelope);
  return reply.code(202).send({ command, delivery: "sent" });
});

app.get("/api/conversations/:id/events", { preHandler: (app as any).authenticate }, async (request: any) => {
  const params = z.object({ id: z.string().uuid() }).parse(request.params);
  const result = await query(
    `SELECT e.* FROM command_events e
     JOIN commands c ON c.id = e.command_id
     WHERE c.conversation_id = $1 AND c.user_id = $2
     ORDER BY e.created_at ASC`,
    [params.id, request.user.sub]
  );
  return { events: result.rows };
});

app.get("/ws/mobile", { websocket: true }, async (connection, request) => {
  const token = new URL(request.url ?? "", "http://localhost").searchParams.get("token");
  if (!token) return connection.close();
  try {
    const decoded = app.jwt.verify<{ sub: string }>(token);
    mobileSet(decoded.sub).add(connection);
    connection.on("close", () => mobileSet(decoded.sub).delete(connection));
  } catch {
    connection.close();
  }
});

app.get("/ws/desktop", { websocket: true }, async (connection, request) => {
  const url = new URL(request.url ?? "", "http://localhost");
  const token = url.searchParams.get("token");
  const deviceId = url.searchParams.get("deviceId");
  if (!token || !deviceId) return connection.close();

  let userId: string;
  try {
    const decoded = app.jwt.verify<{ sub: string }>(token);
    userId = decoded.sub;
    await requireOwnedDevice(userId, deviceId, "desktop");
  } catch {
    return connection.close();
  }

  desktopSockets.set(deviceId, connection);
  await query("UPDATE devices SET last_seen_at = now() WHERE id = $1", [deviceId]);
  await redis?.set(`presence:desktop:${deviceId}`, "online", "EX", 60);
  broadcastMobile(userId, { type: "device.status", deviceId, status: "online" });

  connection.on("message", async (raw: Buffer) => {
    try {
      const message = JSON.parse(raw.toString()) as DesktopEnvelope;
      if (message.type === "agents.upsert") {
        for (const agent of message.agents) {
          await query(
            `INSERT INTO agents (id, device_id, name, adapter, capabilities, risk_level, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (device_id, id)
             DO UPDATE SET name = EXCLUDED.name, adapter = EXCLUDED.adapter, capabilities = EXCLUDED.capabilities,
               risk_level = EXCLUDED.risk_level, status = EXCLUDED.status, updated_at = now()`,
            [agent.id, deviceId, agent.name, agent.adapter, JSON.stringify(agent.capabilities), agent.riskLevel, agent.status]
          );
        }
        broadcastMobile(userId, { type: "agents.updated", deviceId });
      }
      if (message.type === "command.status" || message.type === "command.complete") {
        await query("UPDATE commands SET status = $1, completed_at = CASE WHEN $1 IN ('completed','failed','cancelled') THEN now() ELSE completed_at END WHERE id = $2", [
          message.status,
          message.commandId
        ]);
        await recordEvent(message.commandId, "status", message);
        broadcastMobile(userId, { type: "command.event", commandId: message.commandId, eventType: "status", payload: message });
      }
      if (message.type === "command.output") {
        await recordEvent(message.commandId, "output", message);
        broadcastMobile(userId, { type: "command.event", commandId: message.commandId, eventType: "output", payload: message });
      }
    } catch (error) {
      app.log.error(error);
    }
  });

  connection.on("close", async () => {
    desktopSockets.delete(deviceId);
    await redis?.del(`presence:desktop:${deviceId}`);
    broadcastMobile(userId, { type: "device.status", deviceId, status: "offline" });
  });
});

await migrate();
await app.listen({ host: "0.0.0.0", port });
