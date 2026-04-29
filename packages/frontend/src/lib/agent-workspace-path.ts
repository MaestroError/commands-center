export function resolveAgentWorkspacePath(agentSlug: string, path: string): string {
  const normalizedPath = path.replace(/^\/+/, "");
  return normalizedPath.length === 0
    ? `agents/${agentSlug}`
    : `agents/${agentSlug}/${normalizedPath}`;
}
