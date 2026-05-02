import type { RuntimeConfig } from "../../lib/runtime-config.js";
import type { AgentCapabilitySelection } from "../../schemas/agents.js";
import type { CcManagedMcpAuthTokenService } from "./auth-token-service.js";
import { listCcManagedMcpServers, type CcManagedMcpServerDefinition } from "./server-registry.js";
import type { CcManagedMcpToolAccessService } from "./tool-access-service.js";

export function createCcManagedMcpWorkspaceEntryService(options: {
  config: RuntimeConfig;
  authTokenService: CcManagedMcpAuthTokenService;
  toolAccessService: CcManagedMcpToolAccessService;
  registry: readonly CcManagedMcpServerDefinition[];
}) {
  return {
    async buildEntries(agent: { slug: string; capabilities: AgentCapabilitySelection }): Promise<
      Record<
        string,
        {
          type: "remote";
          url: string;
          enabled: boolean;
          oauth: false;
          headers: Record<string, string>;
        }
      >
    > {
      const entries = await Promise.all(
        listCcManagedMcpServers(options.registry).map(async (server) => {
          const token = await options.authTokenService.issueToken(agent.slug, server.name);

          return [
            server.name,
            {
              type: "remote" as const,
              url: buildServerUrl(options.config, server.routeSegment, agent.slug),
              enabled: options.toolAccessService.isServerEnabled(agent.capabilities, server),
              oauth: false as const,
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          ] as const;
        }),
      );

      return Object.fromEntries(entries);
    },
  };
}

function buildServerUrl(config: RuntimeConfig, routeSegment: string, agentSlug: string): string {
  return `http://127.0.0.1:${String(config.server.port)}/api/mcp/cc/${routeSegment}/agents/${encodeURIComponent(agentSlug)}`;
}

export type CcManagedMcpWorkspaceEntryService = ReturnType<
  typeof createCcManagedMcpWorkspaceEntryService
>;
