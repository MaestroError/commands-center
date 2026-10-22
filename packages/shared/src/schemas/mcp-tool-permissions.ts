import type { SpecialistCapabilitySelection } from "./specialists.js";

/** Resolves an MCP tool's default without changing its server connection. */
export function resolveMcpToolDefault(
  capabilities: Partial<SpecialistCapabilitySelection> | undefined,
  server: string,
  tool: { id: string; name: string },
): "allow" | "ask" | "deny" {
  const selection = capabilities?.mcpServers?.find((entry) => entry.name === server);
  if (selection?.enabled === false) return "deny";
  const exact = capabilities?.mcpToolPermissions?.findLast(
    (rule) => rule.server === server && rule.tool === tool.name,
  );
  if (exact) return exact.action;
  const legacy = capabilities?.toolPermissions?.findLast((rule) => {
    const pattern = rule.pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replaceAll("*", ".*")
      .replaceAll("?", ".");
    return new RegExp(`^${pattern}$`, "s").test(tool.id);
  });
  return (
    legacy?.action ??
    capabilities?.mcpServers?.find((entry) => entry.name === server)?.action ??
    "allow"
  );
}
