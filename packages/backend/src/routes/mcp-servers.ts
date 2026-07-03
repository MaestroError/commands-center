import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import {
  createMcpServerInputSchema,
  setMcpServerEnabledInputSchema,
  updateMcpServerInputSchema,
} from "@cc/shared/schemas";

import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createMcpServerService } from "../services/mcp-server-service.js";

const mcpServerParamsSchema = z.object({
  mcpServerId: z.string().trim().min(1),
});

const mcpAuthCallbackInputSchema = z.object({
  code: z.string().trim().min(1),
});

const mcpAuthRedirectQuerySchema = z.object({
  code: z.string().trim().min(1).optional(),
  state: z.string().trim().optional(),
  error: z.string().trim().optional(),
  error_description: z.string().trim().optional(),
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAuthRedirectPage(options: { ok: boolean; title: string; message: string }): string {
  const accent = options.ok ? "#4ade80" : "#f87171";
  const title = escapeHtml(options.title);
  const message = escapeHtml(options.message);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CC — ${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #0f1117; color: #e5e7eb; }
    .card { text-align: center; padding: 2.5rem; max-width: 32rem; }
    h1 { color: ${accent}; margin-bottom: 0.75rem; font-size: 1.5rem; }
    p { color: #9ca3af; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
  <script>setTimeout(() => { try { window.close(); } catch (_) {} }, ${options.ok ? 1500 : 8000});</script>
</body>
</html>`;
}

export function registerMcpServerRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = createMcpServerService({
    db: context.database.db,
    config: context.config,
    opencodeService: context.opencodeService,
    secretService: context.secretService,
  });

  app.get("/api/mcp-servers", async () => service.list());

  app.post("/api/mcp-servers/refresh", async () => service.refresh());

  app.post(
    "/api/mcp-servers",
    {
      schema: {
        body: createMcpServerInputSchema,
      },
    },
    async (request) => service.create(request.body),
  );

  app.patch(
    "/api/mcp-servers/:mcpServerId",
    {
      schema: {
        params: mcpServerParamsSchema,
        body: updateMcpServerInputSchema,
      },
    },
    async (request) => service.update(request.params.mcpServerId, request.body),
  );

  app.patch(
    "/api/mcp-servers/:mcpServerId/enabled",
    {
      schema: {
        params: mcpServerParamsSchema,
        body: setMcpServerEnabledInputSchema,
      },
    },
    async (request) => service.setEnabled(request.params.mcpServerId, request.body.enabled),
  );

  app.post(
    "/api/mcp-servers/:mcpServerId/auth/start",
    {
      schema: {
        params: mcpServerParamsSchema,
      },
    },
    async (request) => service.startAuth(request.params.mcpServerId),
  );

  app.post(
    "/api/mcp-servers/:mcpServerId/auth/authenticate",
    {
      schema: {
        params: mcpServerParamsSchema,
      },
    },
    async (request) => service.authenticate(request.params.mcpServerId),
  );

  app.post(
    "/api/mcp-servers/:mcpServerId/auth/callback",
    {
      schema: {
        params: mcpServerParamsSchema,
        body: mcpAuthCallbackInputSchema,
      },
    },
    async (request) => service.completeAuth(request.params.mcpServerId, request.body.code),
  );

  // OAuth providers redirect the user's browser here (the CC-hosted redirectUri).
  // We complete the token exchange server-side and render a small status page.
  app.get(
    "/api/mcp-servers/:mcpServerId/auth/redirect",
    {
      schema: {
        params: mcpServerParamsSchema,
        querystring: mcpAuthRedirectQuerySchema,
      },
    },
    async (request, reply) => {
      const { code, error, error_description: errorDescription } = request.query;

      if (error) {
        return reply.type("text/html").send(
          renderAuthRedirectPage({
            ok: false,
            title: "Authorization failed",
            message: errorDescription || error,
          }),
        );
      }

      if (!code) {
        return reply.type("text/html").send(
          renderAuthRedirectPage({
            ok: false,
            title: "Authorization failed",
            message: "No authorization code was returned by the provider.",
          }),
        );
      }

      try {
        const server = await service.completeAuth(request.params.mcpServerId, code);
        return reply.type("text/html").send(
          renderAuthRedirectPage({
            ok: true,
            title: "Authorization complete",
            message: `${server.name} is connected. You can close this tab and return to CC.`,
          }),
        );
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : "Failed to complete authorization.";
        return reply
          .type("text/html")
          .send(renderAuthRedirectPage({ ok: false, title: "Authorization failed", message }));
      }
    },
  );

  app.delete(
    "/api/mcp-servers/:mcpServerId/auth",
    {
      schema: {
        params: mcpServerParamsSchema,
      },
    },
    async (request) => service.removeAuth(request.params.mcpServerId),
  );

  app.delete(
    "/api/mcp-servers/:mcpServerId",
    {
      schema: {
        params: mcpServerParamsSchema,
      },
    },
    async (request, reply) => {
      await service.remove(request.params.mcpServerId);
      return reply.status(204).send();
    },
  );
}
