import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types";
import type { Logger } from "pino";

import { agentCapabilitySelectionSchema } from "../../schemas/agents.js";
import type { AppDb } from "../../db/client.js";
import {
  getCcManagedMcpServerByRouteSegment,
  type CcManagedMcpServerDefinition,
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
import type { RuntimeConfig } from "../../lib/runtime-config.js";

type SessionRecord = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  agentSlug: string;
  serverName: string;
};

type RouteContext = {
  rawRequest: IncomingMessage;
  rawReply: ServerResponse;
  routeServerName: string;
  routeAgentSlug: string;
  body?: unknown;
};

export function createCcManagedMcpService(options: {
  db: AppDb;
  config: RuntimeConfig;
  logger: Logger;
  registry: readonly CcManagedMcpServerDefinition[];
  authStateStore?: CcManagedMcpAuthStateStore;
  authTokenService?: CcManagedMcpAuthTokenService;
}) {
  const authStateStore = options.authStateStore ?? createCcManagedMcpAuthStateStore(options.config);
  const authTokenService =
    options.authTokenService ?? createCcManagedMcpAuthTokenService({ authStateStore });
  const toolAccessService = createCcManagedMcpToolAccessService();
  const sessions = new Map<string, SessionRecord>();

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
      for (const session of sessions.values()) {
        if (session.agentSlug === agentSlug && session.serverName === serverName) {
          session.server.sendToolListChanged();
        }
      }
    },

    async close(): Promise<void> {
      await Promise.all(
        Array.from(sessions.values()).map(async (session) => {
          await session.transport.close().catch(() => {});
          await session.server.close().catch(() => {});
        }),
      );
      sessions.clear();
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
      const sessionId = readSessionId(context.rawRequest);
      let session = sessionId ? sessions.get(sessionId) : undefined;

      if (!session) {
        if (sessionId) {
          writeText(context.rawReply, 404, "Unknown MCP session.");
          return;
        }

        if (!isInitializeRequest(context.parsedBody)) {
          writeText(context.rawReply, 400, "Initialization request required.");
          return;
        }

        const created = await createSession(definition, context.routeAgentSlug);
        session = created;
      }

      if (session.agentSlug !== context.routeAgentSlug || session.serverName !== definition.name) {
        writeText(context.rawReply, 403, "Session scope mismatch.");
        return;
      }

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

  async function createSession(
    definition: CcManagedMcpServerDefinition,
    agentSlug: string,
  ): Promise<SessionRecord> {
    const agent = await loadAgent(agentSlug);

    if (!agent) {
      throw new Error(`Agent '${agentSlug}' not found.`);
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
        },
        instructions: definition.description,
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

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, record);
      },
    });

    transport.onclose = () => {
      const sessionId = transport.sessionId;

      if (sessionId) {
        sessions.delete(sessionId);
      }
    };

    const record: SessionRecord = {
      transport,
      server,
      agentSlug,
      serverName: definition.name,
    };

    await server.connect(transport);
    return record;
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
        capabilities: ReturnType<typeof agentCapabilitySelectionSchema.parse>;
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
      capabilities: agentCapabilitySelectionSchema.parse(JSON.parse(row.capabilities_json)),
    };
  }
}

function readSessionId(request: IncomingMessage): string | undefined {
  const header = request.headers["mcp-session-id"];

  if (typeof header === "string" && header.length > 0) {
    return header;
  }

  return undefined;
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
