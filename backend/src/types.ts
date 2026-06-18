export type RiskLevel = "low" | "medium" | "high";
export type CommandStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "blocked";

export type AgentRecord = {
  id: string;
  deviceId: string;
  name: string;
  adapter: string;
  capabilities: string[];
  riskLevel: RiskLevel;
  status: string;
};

export type DesktopEnvelope =
  | { type: "hello"; deviceId: string; name: string }
  | { type: "agents.upsert"; agents: Omit<AgentRecord, "deviceId">[] }
  | { type: "command.status"; commandId: string; status: CommandStatus; message?: string }
  | { type: "command.output"; commandId: string; stream: "stdout" | "stderr" | "message"; text: string }
  | { type: "command.complete"; commandId: string; status: "completed" | "failed" | "cancelled"; message?: string };

export type MobileEnvelope =
  | { type: "device.status"; deviceId: string; status: "online" | "offline" }
  | { type: "agents.updated"; deviceId: string }
  | { type: "command.event"; commandId: string; eventType: string; payload: unknown };

export type CommandEnvelope = {
  type: "command.run";
  commandId: string;
  agentId: string;
  commandType: string;
  riskLevel: RiskLevel;
  text: string;
};
