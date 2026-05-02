import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat";

import type { AppDb } from "../../db/client.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";
import type { ConversationService } from "../../services/conversation-service.js";
import type { CustomToolActionService } from "../../services/custom-tool-action-service.js";
import type { CustomToolService } from "../../services/custom-tool-service.js";
import type { LiveRequestService } from "../../services/live-request-service.js";
import type { OpenCodeService } from "../../services/opencode-service.js";
import type { SecretService } from "../../services/secret-service.js";
import type { OpenCodeOrchestrator } from "../../orchestrator/opencode-orchestrator.js";
import { createAddSecretDefinition } from "./groups/cc-app/tools/add-secret.js";
import { createCopyCustomToolToAgentDefinition } from "./groups/cc-tool-management/tools/copy-custom-tool-to-agent.js";
import { createCreateCustomToolDefinition } from "./groups/cc-tool-management/tools/create-custom-tool.js";

export type CcManagedToolContext = {
  agentSlug: string;
};

export type CcManagedToolDefinition = {
  name: string;
  description: string;
  inputSchema?: AnySchema;
  outputSchema?: AnySchema;
  execute: (
    args: unknown,
    context: CcManagedToolContext,
  ) =>
    | {
        content: Array<{ type: "text"; text: string }>;
        structuredContent?: Record<string, unknown>;
        isError?: boolean;
      }
    | Promise<{
        content: Array<{ type: "text"; text: string }>;
        structuredContent?: Record<string, unknown>;
        isError?: boolean;
      }>;
};

export type CcManagedMcpServerDefinition = {
  name: string;
  routeSegment: string;
  description: string;
  enabledByDefault: boolean;
  tools: readonly CcManagedToolDefinition[];
};

export function createCcManagedMcpServerRegistry(options: {
  db?: AppDb;
  config?: RuntimeConfig;
  opencodeService?: OpenCodeService;
  customToolService: CustomToolService;
  customToolActionService?: CustomToolActionService;
  conversationService?: ConversationService;
  liveRequestService?: LiveRequestService;
  secretService?: SecretService;
  orchestrator?: OpenCodeOrchestrator;
}): readonly CcManagedMcpServerDefinition[] {
  const ccAppTools: CcManagedToolDefinition[] = [];

  if (
    options.db &&
    options.config &&
    options.opencodeService &&
    options.liveRequestService &&
    options.secretService &&
    options.orchestrator
  ) {
    ccAppTools.push(
      createAddSecretDefinition({
        db: options.db,
        config: options.config,
        opencodeService: options.opencodeService,
        liveRequestService: options.liveRequestService,
        secretService: options.secretService,
        orchestrator: options.orchestrator,
      }),
    );
  }

  const toolManagementTools: CcManagedToolDefinition[] = [
    createCreateCustomToolDefinition({ customToolService: options.customToolService }),
  ];

  if (options.customToolActionService) {
    toolManagementTools.push(
      createCopyCustomToolToAgentDefinition({
        customToolActionService: options.customToolActionService,
        conversationService: options.conversationService,
        liveRequestService: options.liveRequestService,
      }),
    );
  }

  return [
    {
      name: "cc_app",
      routeSegment: "cc-app",
      description: "CommandsCenter app-managed capabilities for this agent.",
      enabledByDefault: false,
      tools: ccAppTools,
    },
    {
      name: "cc_tool_management",
      routeSegment: "cc-tool-management",
      description: "CommandsCenter-managed tool creation and library maintenance for this agent.",
      enabledByDefault: false,
      tools: toolManagementTools,
    },
  ] as const satisfies readonly CcManagedMcpServerDefinition[];
}

export function listCcManagedMcpServers(
  registry: readonly CcManagedMcpServerDefinition[],
): readonly CcManagedMcpServerDefinition[] {
  return registry;
}

export function getCcManagedMcpServer(
  registry: readonly CcManagedMcpServerDefinition[],
  name: string,
): CcManagedMcpServerDefinition | undefined {
  return registry.find((server) => server.name === name);
}

export function getCcManagedMcpServerByRouteSegment(
  registry: readonly CcManagedMcpServerDefinition[],
  routeSegment: string,
): CcManagedMcpServerDefinition | undefined {
  return registry.find((server) => server.routeSegment === routeSegment);
}
