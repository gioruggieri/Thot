import assert from "node:assert/strict";
import test from "node:test";
import { DemoAdapter } from "./adapters/demo.js";
import type { AgentOutput } from "./types.js";

test("demo adapter echoes chat commands", async () => {
  const adapter = new DemoAdapter();
  const events: AgentOutput[] = [];

  await adapter.run(
    { commandId: "cmd-1", agentId: "demo", commandType: "chat", riskLevel: "low", text: "hello" },
    (event) => events.push(event)
  );

  assert.equal(events.some((event) => event.type === "output" && event.text.includes("hello")), true);
  assert.equal(events.at(-1)?.type, "status");
});

test("demo adapter blocks shell unless explicitly enabled", async () => {
  const previous = process.env.ALLOW_SHELL;
  delete process.env.ALLOW_SHELL;
  const adapter = new DemoAdapter();
  const events: AgentOutput[] = [];

  await adapter.run(
    { commandId: "cmd-2", agentId: "demo", commandType: "shell", riskLevel: "high", text: "echo blocked" },
    (event) => events.push(event)
  );

  process.env.ALLOW_SHELL = previous;
  assert.equal(events.some((event) => event.type === "status" && event.status === "failed"), true);
});
