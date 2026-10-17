import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { AppServer } from "../../src/lib/fastify-zod.js";

export function registerBuiltFrontend(server: AppServer): void {
  const root = resolve(import.meta.dirname, "../../../frontend/dist");
  const contentTypes: Record<string, string> = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".html": "text/html",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".woff2": "font/woff2",
    ".ico": "image/x-icon",
  };
  server.get("/*", async (request, reply) => {
    const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (path.startsWith("/api/"))
      return reply.code(404).send({ message: "Outside local E2E scope" });
    const file = resolve(root, extname(path) ? `.${path}` : "index.html");
    if (!file.startsWith(root + sep)) return reply.code(404).send();
    try {
      return reply
        .type(contentTypes[extname(file)] ?? "application/octet-stream")
        .send(await readFile(file));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return reply.code(404).send();
      throw error;
    }
  });
}
