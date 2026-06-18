export function commandRequiresApproval(commandType: string, riskLevel: string) {
  return riskLevel === "high" || commandType === "shell" || commandType === "file_action";
}
