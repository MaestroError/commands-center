import type { ServerResponse } from "node:http";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  opencodeFileContentQuerySchema,
  opencodeFileContentSchema,
  opencodeFileListQuerySchema,
  opencodeFileListResultSchema,
  opencodeFileSearchQuerySchema,
  opencodeFileSearchResultSchema,
  opencodeFileStatusResultSchema,
  opencodeTextSearchQuerySchema,
  opencodeTextSearchResultSchema,
} from "@cc/shared/schemas";

import { createAgentInputSchema, updateAgentInputSchema } from "../schemas/agents.js";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { NotFoundError } from "../lib/api-error.js";
import { createAgentService } from "../services/agent-service.js";
import {
  createFileManagerService,
  resolveFileManagerRoot,
} from "../services/file-manager-service.js";

const agentIdParamsSchema = z.object({
  id: z.string().min(1),
});

const agentSlugParamsSchema = z.object({
  slug: z.string().min(1),
});

const listAgentsQuerySchema = z.object({
  includeArchived: z.coerce.boolean().optional().default(false),
});

export function registerAgentRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createAgentService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
  });
  const fileManagerService = createFileManagerService({ config: context.config });

  async function requireAgent(id: string) {
    const agent = await service.get(id);

    if (!agent) {
      throw new NotFoundError("Agent not found.");
    }

    return agent;
  }

  app.get(
    "/api/agents",
    {
      schema: {
        querystring: listAgentsQuerySchema,
      },
    },
    async (request) => service.list(request.query.includeArchived),
  );

  app.get("/api/agents/catalog", async () => service.getCatalog());

  app.get(
    "/api/agents/:id",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => {
      const agent = await service.get(request.params.id);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      return agent;
    },
  );

  app.get(
    "/api/agents/by-slug/:slug",
    {
      schema: {
        params: agentSlugParamsSchema,
      },
    },
    async (request) => {
      const agent = await service.getBySlug(request.params.slug);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      return agent;
    },
  );

  app.post(
    "/api/agents",
    {
      schema: {
        body: createAgentInputSchema,
      },
    },
    async (request, reply) => {
      reply.code(201);
      return service.create(request.body);
    },
  );

  app.patch(
    "/api/agents/:id",
    {
      schema: {
        params: agentIdParamsSchema,
        body: updateAgentInputSchema,
      },
    },
    async (request) => {
      const agent = await service.update(request.params.id, request.body);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      return agent;
    },
  );

  app.delete(
    "/api/agents/:id",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => {
      const agent = await service.archive(request.params.id);

      if (!agent) {
        throw new NotFoundError("Agent not found.");
      }

      return agent;
    },
  );

  app.get(
    "/api/agents/:id/workspace/find",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: opencodeTextSearchQuerySchema,
        response: {
          200: opencodeTextSearchResultSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return context.opencodeService.findText(agent.workspacePath, request.query.pattern);
    },
  );

  app.get(
    "/api/agents/:id/workspace/find/file",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: opencodeFileSearchQuerySchema,
        response: {
          200: opencodeFileSearchResultSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return context.opencodeService.findFiles(agent.workspacePath, request.query);
    },
  );

  app.get(
    "/api/agents/:id/workspace/file",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: opencodeFileListQuerySchema,
        response: {
          200: opencodeFileListResultSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      const root = resolveFileManagerRoot({ kind: "workspace", config: context.config });
      const listing = await fileManagerService.listDirectory(root, {
        path: joinAgentWorkspacePath(agent.slug, request.query.path),
      });

      return listing.nodes.map((node) => ({
        name: node.name,
        path: trimAgentWorkspacePrefix(agent.slug, node.path),
        absolute: node.absolutePath,
        type: node.type,
        ignored: false,
        isCritical: node.isCritical,
        criticalReason: node.criticalReason,
      }));
    },
  );

  app.get(
    "/api/agents/:id/workspace/file/content",
    {
      schema: {
        params: agentIdParamsSchema,
        querystring: opencodeFileContentQuerySchema,
        response: {
          200: opencodeFileContentSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return context.opencodeService.readFile(agent.workspacePath, request.query.path);
    },
  );

  app.get(
    "/api/agents/:id/workspace/file/status",
    {
      schema: {
        params: agentIdParamsSchema,
        response: {
          200: opencodeFileStatusResultSchema,
        },
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return context.opencodeService.getFileStatus(agent.workspacePath);
    },
  );

  app.get(
    "/api/agents/:id/workspace/events",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request, reply) => {
      const agent = await requireAgent(request.params.id);

      reply.hijack();
      const raw = reply.raw;

      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const abortController = new AbortController();

      request.raw.on("close", () => {
        abortController.abort();
      });

      const heartbeatInterval = setInterval(() => {
        if (!raw.destroyed) {
          writeSseEvent(raw, { type: "heartbeat", properties: {} });
        }
      }, 15_000);

      abortController.signal.addEventListener(
        "abort",
        () => {
          clearInterval(heartbeatInterval);
        },
        { once: true },
      );

      context.workspaceWatchService?.subscribe({
        directory: agent.workspacePath,
        signal: abortController.signal,
        onChange: (event) => {
          if (!raw.destroyed) {
            writeSseEvent(raw, event);
          }
        },
      });
    },
  );
}

function writeSseEvent(
  raw: ServerResponse,
  event: { type: string; properties: Record<string, unknown> },
): void {
  raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

function joinAgentWorkspacePath(agentSlug: string, path?: string): string {
  const normalizedPath = !path || path === "." ? "" : path.replace(/^\/+/, "");
  return normalizedPath.length === 0
    ? `agents/${agentSlug}`
    : `agents/${agentSlug}/${normalizedPath}`;
}

function trimAgentWorkspacePrefix(agentSlug: string, path: string): string {
  const rootPath = `agents/${agentSlug}`;
  const prefix = `${rootPath}/`;

  if (path === rootPath) {
    return ".";
  }

  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
