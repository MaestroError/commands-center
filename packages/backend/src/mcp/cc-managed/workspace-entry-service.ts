import type { RuntimeConfig } from "../../lib/runtime-config.js";
import type { SpecialistCapabilitySelection } from "@cc/shared/schemas";
import type { CcManagedMcpAuthTokenService } from "./auth-token-service.js";
import { listCcManagedMcpServers, type CcManagedMcpServerDefinition } from "./server-registry.js";
import type { CcManagedMcpToolAccessService } from "./tool-access-service.js";

// opencode's MCP client falls back to the SDK's 60s tool-call timeout when none is
// configured. The CommandsCenter app tools include human-in-the-loop tools
// (add_secret, the draft_* review tools) that intentionally block while waiting for
// the operator, so we give the client a generous timeout that matches the
// live-request window.
const CC_MANAGED_MCP_TIMEOUT_MS = 30 * 60 * 1000;

export function createCcManagedMcpWorkspaceEntryService(options: {
  config: RuntimeConfig;
  authTokenService: CcManagedMcpAuthTokenService;
  toolAccessService: CcManagedMcpToolAccessService;
  registry: readonly CcManagedMcpServerDefinition[];
}) {
  return {
    // Build the specialist's app-MCP config entries. A single token per
    // agent/server is minted here; it is context-agnostic (the same token is
    // used for chat and task-run sessions), so this config never needs to be
    // rewritten when a task run starts or ends.
    async buildEntries(agent: {
      slug: string;
      capabilities: SpecialistCapabilitySelection;
    }): Promise<
      Record<
        string,
        {
          type: "remote";
          url: string;
          enabled: boolean;
          oauth: false;
          headers: Record<string, string>;
          timeout?: number;
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
              // An explicit per-group timeout wins. Otherwise interactive groups
              // (which block on operator input) get the long live-request window,
              // and quick request/response groups keep opencode's own default.
              ...resolveTimeout(server),
            },
          ] as const;
        }),
      );

      return Object.fromEntries(entries);
    },
  };
}

function resolveTimeout(server: CcManagedMcpServerDefinition): { timeout?: number } {
  if (server.toolCallTimeoutMs !== undefined) {
    return { timeout: server.toolCallTimeoutMs };
  }

  if (server.interactive) {
    return { timeout: CC_MANAGED_MCP_TIMEOUT_MS };
  }

  return {};
}

function buildServerUrl(config: RuntimeConfig, routeSegment: string, agentSlug: string): string {
  return `http://127.0.0.1:${String(config.server.port)}/api/mcp/cc/${routeSegment}/specialists/${encodeURIComponent(agentSlug)}`;
}

export type CcManagedMcpWorkspaceEntryService = ReturnType<
  typeof createCcManagedMcpWorkspaceEntryService
>;
