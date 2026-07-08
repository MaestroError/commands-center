import type { IncomingMessage, ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "pino";

import type { ApiTokenRecord } from "@cc/shared/schemas";

import { tokenHasCapability } from "../../services/api-token-service.js";
import type { PublicMcpToolDefinition } from "./registry.js";
import type { PublicMcpTemplateToolBuilder } from "./template-tools.js";

const SERVER_NAME = "commandscenter-public";
const SERVER_VERSION = "0.0.0";

type RouteContext = {
  rawRequest: IncomingMessage;
  rawReply: ServerResponse;
  token: ApiTokenRecord;
  body?: unknown;
};

type DrainCompatibleSocket = IncomingMessage["socket"] & {
  destroySoon?: () => void;
  destroy?: () => void;
};

export type PublicMcpService = ReturnType<typeof createPublicMcpService>;

export function createPublicMcpService(options: {
  logger: Logger;
  registry: readonly PublicMcpToolDefinition[];
  templateToolBuilder?: PublicMcpTemplateToolBuilder;
}) {
  return {
    async handlePost(context: RouteContext): Promise<void> {
      await handleRequest({ ...context, parsedBody: context.body });
    },

    async handleGet(context: RouteContext): Promise<void> {
      await handleRequest(context);
    },

    async handleDelete(context: RouteContext): Promise<void> {
      await handleRequest(context);
    },
  };

  async function handleRequest(context: RouteContext & { parsedBody?: unknown }): Promise<void> {
    try {
      ensureDrainCompatibleSocket(context.rawRequest);
      const { transport } = await createSession(context.token);
      await transport.handleRequest(context.rawRequest, context.rawReply, context.parsedBody);
    } catch (error) {
      options.logger.error({ err: error, tokenId: context.token.id }, "public MCP request failed");

      if (!context.rawReply.headersSent) {
        writeText(context.rawReply, 500, "Internal MCP server error.");
      }
    }
  }

  function ensureDrainCompatibleSocket(request: IncomingMessage): void {
    const socket = request.socket as DrainCompatibleSocket | undefined;

    if (!socket || typeof socket.destroySoon === "function") {
      return;
    }

    socket.destroySoon = () => {
      socket.destroy?.();
    };
  }

  async function createSession(
    token: ApiTokenRecord,
  ): Promise<{ transport: StreamableHTTPServerTransport; server: McpServer }> {
    // Per-token tool listing: static tools whose capability the token grants,
    // plus the per-template tools the token enables (pre-filtered by the builder).
    const staticTools = options.registry.filter((tool) =>
      tokenHasCapability(token, tool.capability),
    );
    const templateTools = (await options.templateToolBuilder?.buildForToken(token)) ?? [];
    const tools = [...staticTools, ...templateTools];

    const server = new McpServer(
      { name: SERVER_NAME, version: SERVER_VERSION },
      {
        capabilities: { tools: { listChanged: true } },
        instructions:
          "CommandsCenter public MCP server. Trigger task templates and tasks, and read their runs, results, and artifacts.",
      },
    );

    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
        },
        (args: unknown) => tool.execute(args),
      );
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    return { transport, server };
  }
}

function writeText(reply: ServerResponse, statusCode: number, message: string): void {
  reply.statusCode = statusCode;
  reply.setHeader("content-type", "text/plain; charset=utf-8");
  reply.end(message);
}
