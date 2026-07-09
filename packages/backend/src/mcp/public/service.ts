import type { IncomingMessage, ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "pino";

import type { ApiTokenRecord } from "@cc/shared/schemas";

import { tokenHasCapability } from "../../services/api-token-service.js";
import type { TokenAuditService } from "../../services/token-audit-service.js";
import {
  GET_TASK_RESULT_CAPABILITY,
  type PublicMcpToolResult,
  type RegisterableMcpTool,
  type PublicMcpToolDefinition,
} from "./registry.js";
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
  auditService?: TokenAuditService;
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
    // Async siblings of the session-creating tools, exposed only when the token
    // also grants the result-polling capability (so the returned id is pollable).
    const asyncTools = tokenHasCapability(token, GET_TASK_RESULT_CAPABILITY)
      ? staticTools.flatMap((tool) => (tool.asyncVariant ? [tool.asyncVariant] : []))
      : [];
    const templateTools = (await options.templateToolBuilder?.buildForToken(token)) ?? [];
    const tools = [...staticTools, ...asyncTools, ...templateTools];

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
        (args: unknown) => auditedExecute(tool, args, token),
      );
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    return { transport, server };
  }

  // Run a tool and record the call in the per-token audit log (best-effort).
  async function auditedExecute(
    tool: RegisterableMcpTool | PublicMcpToolDefinition,
    args: unknown,
    token: ApiTokenRecord,
  ): Promise<PublicMcpToolResult> {
    const result = await tool.execute(args);
    const target = deriveMcpTarget(args);

    void options.auditService?.record({
      tokenId: token.id,
      tokenName: token.name,
      surface: "mcp",
      action: tool.name,
      capabilityId: "capability" in tool ? tool.capability : null,
      targetKind: target.kind,
      targetId: target.id,
      input: args,
      outcome: result.isError ? "error" : "ok",
      errorMessage: result.isError ? extractErrorMessage(result) : null,
    });

    return result;
  }
}

function deriveMcpTarget(args: unknown): { kind: string | null; id: string | null } {
  const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  if (typeof record["runId"] === "string") {
    return { kind: "run", id: record["runId"] };
  }
  if (typeof record["taskId"] === "string") {
    return { kind: "task", id: record["taskId"] };
  }
  if (typeof record["templateId"] === "string") {
    return { kind: "template", id: record["templateId"] };
  }
  return { kind: null, id: null };
}

function extractErrorMessage(result: PublicMcpToolResult): string | null {
  const structured = result.structuredContent as { error?: { message?: unknown } } | undefined;
  if (typeof structured?.error?.message === "string") {
    return structured.error.message;
  }
  return result.content[0]?.text ?? null;
}

function writeText(reply: ServerResponse, statusCode: number, message: string): void {
  reply.statusCode = statusCode;
  reply.setHeader("content-type", "text/plain; charset=utf-8");
  reply.end(message);
}
