import type { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat";

import type { CustomToolService } from "../../services/custom-tool-service.js";
import { createCreateCustomTsToolDefinition } from "./groups/cc-app/tools/create-custom-ts-tool.js";

export type CcManagedToolDefinition = {
  name: string;
  description: string;
  inputSchema?: AnySchema;
  outputSchema?: AnySchema;
  execute: (args: unknown) =>
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
  customToolService: CustomToolService;
}): readonly CcManagedMcpServerDefinition[] {
  return [
    {
      name: "cc_app",
      routeSegment: "cc-app",
      description: "CommandsCenter app-managed capabilities for this agent.",
      enabledByDefault: false,
      tools: [createCreateCustomTsToolDefinition({ customToolService: options.customToolService })],
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
