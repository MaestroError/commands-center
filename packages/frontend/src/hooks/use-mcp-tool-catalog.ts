import { useQuery } from "@tanstack/react-query";
import { mcpToolCatalogSchema } from "@cc/shared/schemas";
import { requestJson } from "@/lib/api/client";

export function useMcpToolCatalog(agentId?: string, enabled = true) {
  return useQuery({
    queryKey: ["mcp-tool-catalog", agentId ?? "global"],
    queryFn: async () =>
      requestJson(
        `/api/specialists/${agentId ? `${encodeURIComponent(agentId)}/` : ""}mcp-tools`,
        mcpToolCatalogSchema,
      ),
    enabled,
    refetchInterval: 10_000,
  });
}
