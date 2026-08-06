import type { IncomingMessage, ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "pino";

import { specialistCapabilitySelectionSchema } from "@cc/shared/schemas";
import type { AppDb } from "../../db/client.js";
import {
  getCcManagedMcpServerByRouteSegment,
  type CcManagedMcpServerDefinition,
  type CcManagedToolContextMode,
} from "./server-registry.js";
import { createCcManagedMcpToolAccessService } from "./tool-access-service.js";
import {
  createCcManagedMcpAuthStateStore,
  type CcManagedMcpAuthStateStore,
} from "./auth-state-store.js";
import {
  createCcManagedMcpAuthTokenService,
  type CcManagedMcpAuthTokenService,
} from "./auth-token-service.js";
import { withStreamKeepalive, type StreamKeepaliveSender } from "./stream-keepalive.js";
import type { RuntimeConfig } from "../../lib/runtime-config.js";

type RouteContext = {
  rawRequest: IncomingMessage;
  rawReply: ServerResponse;
  routeServerName: string;
  routeAgentSlug: string;
  body?: unknown;
};

type DrainCompatibleSocket = IncomingMessage["socket"] & {
  destroySoon?: () => void;
  destroy?: () => void;
};

export function createCcManagedMcpService(options: {
  db: AppDb;
  config: RuntimeConfig;
  logger: Logger;
  registry: readonly CcManagedMcpServerDefinition[];
  authStateStore?: CcManagedMcpAuthStateStore;
  authTokenService?: CcManagedMcpAuthTokenService;
  // Overridable so tests do not have to wait out a real beat.
  keepaliveIntervalMs?: number;
}) {
  const authStateStore = options.authStateStore ?? createCcManagedMcpAuthStateStore(options.config);
  const authTokenService =
    options.authTokenService ?? createCcManagedMcpAuthTokenService({ authStateStore });
  const toolAccessService = createCcManagedMcpToolAccessService();

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

    notifyListChanged(agentSlug: string, serverName: string): void {
      void agentSlug;
      void serverName;
    },

    async close(): Promise<void> {
      await Promise.resolve();
    },
  };

  async function handleRequest(
    context: RouteContext & {
      parsedBody?: unknown;
    },
  ): Promise<void> {
    const definition = getCcManagedMcpServerByRouteSegment(
      options.registry,
      context.routeServerName,
    );

    if (!definition) {
      writeText(context.rawReply, 404, "Unknown MCP server.");
      return;
    }

    const auth = await authenticateRequest(
      context.rawRequest,
      context.routeAgentSlug,
      definition.name,
    );

    if (!auth.ok) {
      writeText(context.rawReply, auth.statusCode, auth.message);
      return;
    }

    try {
      ensureDrainCompatibleSocket(context.rawRequest);
      const session = await createSession(definition, context.routeAgentSlug);

      await session.transport.handleRequest(
        context.rawRequest,
        context.rawReply,
        context.parsedBody,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("not found")) {
        writeText(context.rawReply, 404, message);
        return;
      }

      if (message.includes("disabled")) {
        writeText(context.rawReply, 403, message);
        return;
      }

      options.logger.error(
        {
          err: error,
          routeAgentSlug: context.routeAgentSlug,
          routeServerName: definition.name,
        },
        "cc-managed MCP request failed",
      );

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
    definition: CcManagedMcpServerDefinition,
    agentSlug: string,
  ): Promise<{ transport: StreamableHTTPServerTransport; server: McpServer }> {
    const agent = await loadAgent(agentSlug);

    if (!agent) {
      throw new Error(`Specialist '${agentSlug}' not found.`);
    }

    if (!toolAccessService.isServerEnabled(agent.capabilities, definition)) {
      throw new Error(`MCP server '${definition.name}' is disabled for agent '${agentSlug}'.`);
    }

    const tools = toolAccessService.listEnabledTools(agent.capabilities, definition);
    const server = new McpServer(
      {
        name: definition.name,
        version: "0.0.0",
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
          // Declared so tool calls may emit `notifications/message`; the SDK
          // refuses to send them otherwise. Used for the stream keepalive.
          logging: {},
        },
        instructions: definition.description,
      },
    );

    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          description: withContextRecommendation(tool.description, tool.context),
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
        },
        // The SDK passes `extra` second when the tool declares an input schema.
        // Its `sendNotification` is bound to this call's `relatedRequestId`, so
        // the keepalive lands on this request's own response stream.
        (args: unknown, extra: { sendNotification: StreamKeepaliveSender }) =>
          withStreamKeepalive(
            extra.sendNotification,
            async () => tool.execute(args, { agentSlug }),
            options.keepaliveIntervalMs,
          ),
      );
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    return { transport, server };
  }

  async function authenticateRequest(
    request: IncomingMessage,
    agentSlug: string,
    serverName: string,
  ): Promise<{ ok: true } | { ok: false; statusCode: number; message: string }> {
    const token = readBearerToken(request.headers.authorization);

    if (!token) {
      return {
        ok: false,
        statusCode: 401,
        message: "Missing bearer token.",
      };
    }

    const verified = await authTokenService.verifyToken(token);

    if (!verified) {
      return {
        ok: false,
        statusCode: 401,
        message: "Invalid bearer token.",
      };
    }

    if (verified.agentSlug !== agentSlug || verified.serverName !== serverName) {
      return {
        ok: false,
        statusCode: 403,
        message: "Bearer token scope mismatch.",
      };
    }

    return { ok: true };
  }

  async function loadAgent(slug: string): Promise<
    | {
        slug: string;
        capabilities: ReturnType<typeof specialistCapabilitySelectionSchema.parse>;
      }
    | undefined
  > {
    const row = await options.db.query.agents.findFirst({
      where: (table, operators) => operators.eq(table.slug, slug),
      columns: {
        slug: true,
        capabilities_json: true,
      },
    });

    if (!row) {
      return undefined;
    }

    return {
      slug: row.slug,
      capabilities: specialistCapabilitySelectionSchema.parse(JSON.parse(row.capabilities_json)),
    };
  }
}

// `context` is advisory only — tools are always listed regardless of whether
// the session is a chat or a task run. We surface the intended context to the
// model as a recommendation appended to the description instead of hiding the
// tool. "both" tools get no suffix.
function withContextRecommendation(description: string, context: CcManagedToolContextMode): string {
  if (context === "chat") {
    return `${description} Recommended to use only in Chat.`;
  }

  if (context === "task_run") {
    return `${description} Recommended to use only in Task Run.`;
  }

  return description;
}

function readBearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;

  if (!value?.startsWith("Bearer ")) {
    return undefined;
  }

  return value.slice("Bearer ".length).trim();
}

function writeText(reply: ServerResponse, statusCode: number, message: string): void {
  reply.statusCode = statusCode;
  reply.setHeader("content-type", "text/plain; charset=utf-8");
  reply.end(message);
}

export type CcManagedMcpService = ReturnType<typeof createCcManagedMcpService>;
