import { exec } from "node:child_process";
import type { AgentAdapter, AgentCommand, AgentOutput } from "../types.js";

export class DemoAdapter implements AgentAdapter {
  descriptor = {
    id: "demo",
    name: "Demo Agent",
    adapter: "demo",
    capabilities: ["chat", "task", "shell"] as const,
    riskLevel: process.env.ALLOW_SHELL === "true" ? "high" as const : "low" as const,
    status: "online" as const
  };

  async run(command: AgentCommand, emit: (event: AgentOutput) => void) {
    emit({ type: "status", status: "running", message: "Demo adapter started" });

    if (command.commandType === "shell") {
      if (process.env.ALLOW_SHELL !== "true") {
        emit({ type: "status", status: "failed", message: "Shell commands are disabled. Set ALLOW_SHELL=true locally to enable them." });
        return;
      }
      await this.runShell(command.text, emit);
      return;
    }

    emit({
      type: "output",
      stream: "message",
      text: `Demo Agent received: ${command.text}`
    });
    emit({ type: "status", status: "completed", message: "Done" });
  }

  private runShell(command: string, emit: (event: AgentOutput) => void) {
    return new Promise<void>((resolve) => {
      const child = exec(command, { timeout: 30_000 });
      child.stdout?.on("data", (chunk) => emit({ type: "output", stream: "stdout", text: String(chunk) }));
      child.stderr?.on("data", (chunk) => emit({ type: "output", stream: "stderr", text: String(chunk) }));
      child.on("exit", (code) => {
        emit({ type: "status", status: code === 0 ? "completed" : "failed", message: `Process exited with code ${code}` });
        resolve();
      });
    });
  }
}
