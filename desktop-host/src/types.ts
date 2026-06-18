export type RiskLevel = "low" | "medium" | "high";

export type AgentCapability = "chat" | "task" | "shell" | "file_action" | "automation";

export type AgentDescriptor = {
  id: string;
  name: string;
  adapter: string;
  capabilities: readonly AgentCapability[];
  riskLevel: RiskLevel;
  status: "online" | "busy" | "error" | "offline";
};

export type AgentCommand = {
  commandId: string;
  agentId: string;
  commandType: AgentCapability;
  riskLevel: RiskLevel;
  text: string;
};

export type AgentOutput =
  | { type: "status"; status: "running" | "completed" | "failed" | "cancelled"; message?: string }
  | { type: "output"; stream: "stdout" | "stderr" | "message"; text: string };

export interface AgentAdapter {
  descriptor: AgentDescriptor;
  run(command: AgentCommand, emit: (event: AgentOutput) => void): Promise<void>;
}
