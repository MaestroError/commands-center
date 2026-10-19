export function buildCcManagedToolPermissionPattern(serverName: string, toolName: string): string {
  return `${serverName}_${toolName}`;
}
