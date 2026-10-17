import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { AppServer } from "../lib/fastify-zod.js";
import type { EmbeddedMcpOAuthCallbacks } from "../opencode/embedded-mcp-oauth-callbacks.js";

export function registerEmbeddedMcpOAuthCallbackRoute(
  server: AppServer,
  callbacks: EmbeddedMcpOAuthCallbacks,
): void {
  server.addHook("preClose", () => callbacks.dispose());
  server.withTypeProvider<ZodTypeProvider>().get(
    "/api/mcp-servers/:mcpServerId/auth/redirect",
    {
      logLevel: "silent",
      schema: {
        params: z.object({ mcpServerId: z.string().min(1) }),
        querystring: z.object({
          state: z.string().min(1).max(1024),
          code: z.string().min(1).max(8192).optional(),
          iss: z.string().max(2048).optional(),
          error: z.string().max(1024).optional(),
          error_description: z.string().max(4096).optional(),
        }),
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
      try {
        const ok = await callbacks.complete(request.params.mcpServerId, request.query);
        return reply
          .code(ok ? 200 : 400)
          .type("text/plain")
          .send(
            ok
              ? "Authorization complete. You can close this tab and return to CC."
              : "Authorization failed. Return to CC and start authorization again.",
          );
      } catch (error) {
        server.log.warn(
          { errorType: error instanceof Error ? error.name : "unknown" },
          "MCP OAuth callback failed",
        );
        return reply
          .code(400)
          .type("text/plain")
          .send("Authorization failed or expired. Return to CC and start authorization again.");
      }
    },
  );
}
