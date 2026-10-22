import type { McpToolCatalog } from "@cc/shared/schemas";
import type { EmbeddedOpenCodeHost } from "./embedded-host.js";

export async function discoverEmbeddedMcpCatalog(
  host: Pick<EmbeddedOpenCodeHost, "mcp" | "readTools" | "listTools">,
  directory: string,
): Promise<McpToolCatalog> {
  await host.listTools(directory);
  return readEmbeddedMcpCatalog(host, directory);
}

export async function readEmbeddedMcpCatalog(
  host: Pick<EmbeddedOpenCodeHost, "mcp" | "readTools">,
  directory: string,
): Promise<McpToolCatalog> {
  const tools = await host.readTools(directory);
  if (!tools) return [];
  const { data: servers } = await host.mcp.list({ location: { directory } });
  return servers.map((server) => {
    const namespace = server.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    const ambiguous = servers.some(
      (other) =>
        other.name !== server.name && other.name.replace(/[^a-zA-Z0-9_-]/g, "_") === namespace,
    );
    const available = server.status.status === "connected" && !ambiguous;
    return {
      server: server.name,
      available,
      tools: available
        ? tools
            .filter((tool) => tool.namespace === namespace)
            .map((tool) => ({
              id: tool.id,
              name: tool.name,
              description: tool.description,
            }))
        : [],
    };
  });
}
