import type { ServerResponse } from "node:http";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  mcpToolCatalogSchema,
  createSpecialistInputSchema,
  importAgentCustomToolInputSchema,
  opencodeFileContentQuerySchema,
  opencodeFileContentSchema,
  opencodeFileListQuerySchema,
  opencodeFileListResultSchema,
  opencodeFileSearchQuerySchema,
  opencodeFileSearchResultSchema,
  opencodeFileStatusResultSchema,
  opencodeTextSearchQuerySchema,
  opencodeTextSearchResultSchema,
  updateSpecialistInputSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { NotFoundError } from "../lib/api-error.js";
import { createSpecialistService, type SpecialistService } from "../services/specialist-service.js";
import {
  createCustomToolService,
  type CustomToolService,
} from "../services/custom-tool-service.js";
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

export function registerSpecialistRoutes(server: AppServer, context: RuntimeContext): void {
  const customToolService: ReturnType<typeof createCustomToolService> =
    context.workspaceServices?.customTools ??
    createCustomToolService({
      config: context.config,
      db: context.database.db,
      opencodeService: context.opencodeService,
      listAgents: async () => {
        const agents = await service.list();
        return agents.map((agent) => ({
          id: agent.id,
          slug: agent.slug,
          name: agent.name,
          workspacePath: agent.workspacePath,
        }));
      },
    });
  const service =
    context.workspaceServices?.specialists ??
    createSpecialistService({
      db: context.database.db,
      config: context.config,
      opencodeService: context.opencodeService,
      customToolService,
    });
  registerSpecialistManagementRoutes(server, context, service, customToolService);
  registerSpecialistWorkspaceRoutes(server, context, service);
}

export function registerSpecialistManagementRoutes(
  server: AppServer,
  context: { opencodeService: Pick<RuntimeContext["opencodeService"], "dispose"> },
  service: SpecialistService,
  customToolService: CustomToolService,
): void {
  const app = server.withTypeProvider<ZodTypeProvider>();

  async function requireAgent(id: string) {
    const agent = await service.get(id);

    if (!agent) {
      throw new NotFoundError("Specialist not found.");
    }

    return agent;
  }

  app.get(
    "/api/specialists",
    {
      schema: {
        querystring: listAgentsQuerySchema,
      },
    },
    async (request) => service.list(request.query.includeArchived),
  );

  app.get("/api/specialists/catalog", async () => service.getCatalog());
  app.get(
    "/api/specialists/mcp-tools",
    { schema: { response: { 200: mcpToolCatalogSchema } } },
    async () => service.getMcpToolCatalog(),
  );
  app.get(
    "/api/specialists/:id/mcp-tools",
    { schema: { params: agentIdParamsSchema, response: { 200: mcpToolCatalogSchema } } },
    async (request) => service.getMcpToolCatalog(request.params.id),
  );

  app.get(
    "/api/specialists/:id",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => {
      const agent = await service.get(request.params.id);

      if (!agent) {
        throw new NotFoundError("Specialist not found.");
      }

      return agent;
    },
  );

  app.get(
    "/api/specialists/by-slug/:slug",
    {
      schema: {
        params: agentSlugParamsSchema,
      },
    },
    async (request) => {
      const agent = await service.getBySlug(request.params.slug);

      if (!agent) {
        throw new NotFoundError("Specialist not found.");
      }

      return agent;
    },
  );

  app.post(
    "/api/specialists",
    {
      schema: {
        body: createSpecialistInputSchema,
      },
    },
    async (request, reply) => {
      reply.code(201);
      return service.create(request.body);
    },
  );

  app.patch(
    "/api/specialists/:id",
    {
      schema: {
        params: agentIdParamsSchema,
        body: updateSpecialistInputSchema,
      },
    },
    async (request) => {
      const agent = await service.update(request.params.id, request.body);

      if (!agent) {
        throw new NotFoundError("Specialist not found.");
      }

      return agent;
    },
  );

  app.delete(
    "/api/specialists/:id",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => {
      const agent = await service.archive(request.params.id);

      if (!agent) {
        throw new NotFoundError("Specialist not found.");
      }

      return agent;
    },
  );

  app.get(
    "/api/specialists/:id/custom-tools",
    {
      schema: {
        params: agentIdParamsSchema,
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return customToolService.listAgentTools(agent);
    },
  );

  app.post(
    "/api/specialists/:id/custom-tools/:slug/copy-to-global",
    {
      schema: {
        params: z.object({ id: z.string().min(1), slug: z.string().min(1) }),
        body: importAgentCustomToolInputSchema,
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return customToolService.copyAgentToolToGlobal({
        agent,
        toolSlug: request.params.slug,
        destinationName: request.body.destinationName,
        overwrite: request.body.overwrite,
      });
    },
  );

  app.post(
    "/api/specialists/:id/custom-tools/:slug/move-to-global",
    {
      schema: {
        params: z.object({ id: z.string().min(1), slug: z.string().min(1) }),
        body: importAgentCustomToolInputSchema,
      },
    },
    async (request) => {
      const agent = await requireAgent(request.params.id);
      return customToolService.moveAgentToolToGlobal({
        agent,
        toolSlug: request.params.slug,
        destinationName: request.body.destinationName,
        overwrite: request.body.overwrite,
      });
    },
  );

  app.delete(
    "/api/specialists/:id/custom-tools/:slug",
    {
      schema: {
        params: z.object({ id: z.string().min(1), slug: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const agent = await requireAgent(request.params.id);
      const tools = await customToolService.listAgentTools(agent);
      const target = tools.find((tool) => tool.slug === request.params.slug);

      if (!target) {
        throw new NotFoundError("Specialist custom tool not found.");
      }

      if (agent.capabilities.customTools.includes(target.slug)) {
        const updated = await service.update(agent.id, {
          capabilities: {
            ...agent.capabilities,
            customTools: agent.capabilities.customTools.filter((slug) => slug !== target.slug),
          },
          customToolOverwriteSlugs: [],
        });

        if (!updated) {
          throw new NotFoundError("Specialist not found.");
        }
      } else {
        await customToolService.removeAgentTool({
          workspacePath: agent.workspacePath,
          toolSlug: target.slug,
        });
        await context.opencodeService.dispose(agent.workspacePath).catch(() => {});
      }

      reply.code(204);
      return reply.send();
    },
  );
}

export function registerSpecialistWorkspaceRoutes(
  server: AppServer,
  context: Pick<RuntimeContext, "config" | "workspaceWatchService"> & {
    opencodeService: Pick<
      RuntimeContext["opencodeService"],
      "findText" | "findFiles" | "readFile" | "getFileStatus"
    >;
  },
  service: SpecialistService,
): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  async function requireAgent(id: string) {
    const agent = await service.get(id);
    if (!agent) throw new NotFoundError("Specialist not found.");
    return agent;
  }

  app.get(
    "/api/specialists/:id/workspace/find",
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
    "/api/specialists/:id/workspace/find/file",
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

  registerSpecialistFileListRoute(server, context, service);

  app.get(
    "/api/specialists/:id/workspace/file/content",
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
    "/api/specialists/:id/workspace/file/status",
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
    "/api/specialists/:id/workspace/events",
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

      raw.flushHeaders();

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

export function registerSpecialistFileListRoute(
  server: AppServer,
  context: Pick<RuntimeContext, "config">,
  service: Pick<SpecialistService, "get">,
): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const fileManagerService = createFileManagerService({ config: context.config });
  async function requireAgent(id: string) {
    const agent = await service.get(id);
    if (!agent) throw new NotFoundError("Specialist not found.");
    return agent;
  }
  app.get(
    "/api/specialists/:id/workspace/file",
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
        path: joinSpecialistWorkspacePath(agent.slug, request.query.path),
      });

      return listing.nodes.map((node) => ({
        name: node.name,
        path: trimSpecialistWorkspacePrefix(agent.slug, node.path),
        absolute: node.absolutePath,
        type: node.type,
        ignored: false,
        isCritical: node.isCritical,
        criticalReason: node.criticalReason,
      }));
    },
  );
}

function writeSseEvent(
  raw: ServerResponse,
  event: { type: string; properties: Record<string, unknown> },
): void {
  raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

function joinSpecialistWorkspacePath(specialistSlug: string, path?: string): string {
  const normalizedPath = !path || path === "." ? "" : path.replace(/^\/+/, "");
  return normalizedPath.length === 0
    ? `specialists/${specialistSlug}`
    : `specialists/${specialistSlug}/${normalizedPath}`;
}

function trimSpecialistWorkspacePrefix(specialistSlug: string, path: string): string {
  const rootPath = `specialists/${specialistSlug}`;
  const prefix = `${rootPath}/`;

  if (path === rootPath) {
    return ".";
  }

  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
