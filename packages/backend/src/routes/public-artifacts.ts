import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";

import { z } from "zod";
import type { FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import type { RegisteredArtifact, TaskRun } from "@cc/shared/schemas";

import { NotFoundError, UnauthorizedError } from "../lib/api-error.js";
import {
  buildArtifactSignedPath,
  verifyArtifactSignature,
  type ArtifactDisposition,
} from "../lib/artifact-signed-url.js";
import type { AppServer } from "../lib/fastify-zod.js";
import { readOwnerSessionCookie } from "../lib/owner-session-cookie.js";
import type { RuntimeConfig } from "../lib/runtime-config.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createArtifactService } from "../services/artifact-service.js";
import { createArtifactShareLinkService } from "../services/artifact-share-link-service.js";
import type { ArtifactDeliveryOptions } from "../services/artifact-delivery-service.js";
import type { ArtifactShareLinkService } from "../services/artifact-share-link-service.js";
import type { TaskService } from "../services/task-service.js";

// Mime types safe to render inline in a browser. Everything else is served as a
// download page (never inline bytes) to avoid inline-serving XSS.
const RENDERABLE_MIME_TYPES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const artifactParamsSchema = z.object({
  artifactId: z.string().min(1),
  disposition: z.enum(["display", "download"]),
});

const artifactQuerySchema = z.object({
  exp: z.string().min(1),
  sig: z.string().min(1),
});

const artifactShareParamsSchema = z.object({
  shareId: z.string().min(1),
  disposition: z.enum(["display", "download"]),
});

const artifactShareQuerySchema = z.object({
  token: z.string().min(1),
});

/**
 * Resolve the per-run artifact delivery context: which URLs the source template
 * enables (default both for non-template runs) and the signed-URL expiry anchored
 * to the run's completion so repeated polls yield identical URLs.
 */
export async function buildArtifactDeliveryContext(deps: {
  run: TaskRun;
  taskService: TaskService;
  artifactShareLinkService: ArtifactShareLinkService;
  config: RuntimeConfig;
}): Promise<ArtifactDeliveryOptions> {
  let displayEnabled = true;
  let downloadEnabled = true;

  const task = await deps.taskService.get(deps.run.taskId).catch(() => undefined);
  const templateId = task?.sourceTemplateId;
  if (templateId) {
    const template = await deps.taskService.getTemplate(templateId).catch(() => undefined);
    if (template) {
      displayEnabled = template.mcpConfig.artifacts.displayableUrlEnabled;
      downloadEnabled = template.mcpConfig.artifacts.downloadableUrlEnabled;
    }
  }

  const prefs = await deps.artifactShareLinkService.getPreferences();
  const minutes = prefs.taskArtifactSignedUrlExpiresInMinutes;
  const anchor = deps.run.completedAt ? Date.parse(deps.run.completedAt) : Date.now();

  return {
    displayEnabled,
    downloadEnabled,
    baseUrl: deps.config.security.publicOrigin,
    expiresAtMs: minutes === 0 ? 0 : anchor + minutes * 60_000,
  };
}

export function registerPublicArtifactRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const artifactService = createArtifactService({
    db: context.database.db,
    config: context.config,
  });
  const artifactShareLinkService = createArtifactShareLinkService({
    db: context.database.db,
    config: context.config,
    artifactService,
  });

  app.get(
    "/api/public/v1/artifact-shares/:shareId/:disposition",
    { schema: { params: artifactShareParamsSchema, querystring: artifactShareQuerySchema } },
    async (request, reply) => {
      const { shareId, disposition } = request.params;
      const { token } = request.query;
      const artifact = await artifactShareLinkService.validateAccess({
        shareId,
        token,
        trackDownload: disposition === "download",
      });
      const downloadHref =
        disposition === "display"
          ? `/api/public/v1/artifact-shares/${encodeURIComponent(shareId)}/download?${new URLSearchParams({ token }).toString()}`
          : undefined;

      return serve(reply, artifact, disposition, downloadHref);
    },
  );

  app.get(
    "/api/public/v1/artifacts/:artifactId/:disposition",
    { schema: { params: artifactParamsSchema, querystring: artifactQuerySchema } },
    async (request, reply) => {
      const { artifactId, disposition } = request.params;
      const { exp, sig } = request.query;

      const { valid, expired } = verifyArtifactSignature({
        artifactId,
        disposition,
        expRaw: exp,
        sig,
        secretKey: context.config.secretKey,
      });

      if (disposition === "download") {
        // Download hard-expires: no owner fallback.
        if (!valid || expired) {
          throw new NotFoundError("Artifact link not found.");
        }
        return serve(reply, await resolve(artifactId), "download");
      }

      // Display: signed access, or an authenticated owner after expiry. The flag
      // tracks whether a signed download link (built from this exp) is still
      // usable, so the download-page button never points at an expired URL.
      if (valid && !expired) {
        const downloadHref = buildArtifactSignedPath({
          artifactId,
          disposition: "download",
          expMs: Number(exp),
          secretKey: context.config.secretKey,
        });
        return serve(reply, await resolve(artifactId), "display", downloadHref);
      }

      if (await isOwner(request.headers.cookie)) {
        return serve(reply, await resolve(artifactId), "display");
      }

      // The signed window lapsed and there's no owner session: gate via login for
      // a browser, else reject the API caller.
      if (request.headers.accept?.includes("text/html")) {
        return reply.redirect(`/login?next=${encodeURIComponent(request.url)}`, 302);
      }
      throw new UnauthorizedError("Artifact link is expired.");
    },
  );

  async function resolve(artifactId: string): Promise<RegisteredArtifact> {
    // Idempotent snapshot so the deliverable is stable + serveable.
    const artifact = await artifactService.publishArtifact(artifactId).catch(() => undefined);
    if (!artifact?.storageKey) {
      throw new NotFoundError("Artifact not found.");
    }
    return artifact;
  }

  async function isOwner(cookieHeader: string | undefined): Promise<boolean> {
    const sessionId = readOwnerSessionCookie(cookieHeader);
    if (!sessionId || !context.ownerAccessService) {
      return false;
    }
    return context.ownerAccessService.validateSession(sessionId);
  }

  async function serve(
    reply: FastifyReply,
    artifact: RegisteredArtifact,
    disposition: ArtifactDisposition,
    downloadHref?: string,
  ) {
    const path = artifactService.resolveArtifactPath(artifact.storageKey!);
    const details = await stat(path).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundError("Artifact not found.");
      }
      throw error;
    });
    const filename = basename(artifact.originalFilename);
    const nonRenderableDisplay =
      disposition === "display" && !RENDERABLE_MIME_TYPES.has(artifact.mimeType);

    // Public non-renderable display → a download page whose (still-valid) button
    // links to the signed download URL.
    if (nonRenderableDisplay && downloadHref) {
      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
      reply.header("X-Content-Type-Options", "nosniff");
      reply.header("Referrer-Policy", "no-referrer");
      reply.header("Cache-Control", "private, no-store");
      return reply.send(renderDownloadPage(filename, details.size, downloadHref));
    }

    reply.header("Content-Type", artifact.mimeType);
    reply.header("Content-Length", String(details.size));
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");

    // Attachment for downloads, and for the owner-fallback non-renderable display
    // (no working signed button); inline for renderable display.
    if (disposition === "download" || nonRenderableDisplay) {
      reply.header("Content-Disposition", `attachment; filename="${escapeHeader(filename)}"`);
      reply.header("Cache-Control", "no-store, max-age=0");
    } else {
      reply.header("Content-Disposition", `inline; filename="${escapeHeader(filename)}"`);
      reply.header(
        "Content-Security-Policy",
        "default-src 'none'; img-src 'self'; object-src 'self'; style-src 'unsafe-inline'; sandbox",
      );
      reply.header("Cache-Control", "private, no-store");
    }

    return reply.send(createReadStream(path));
  }
}

function renderDownloadPage(filename: string, sizeBytes: number, downloadHref: string): string {
  const safeName = escapeHtml(filename);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeName}</title><style>body{font-family:system-ui,sans-serif;background:#0f1115;color:#e6e6e6;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{max-width:28rem;padding:2rem;border:1px solid #2a2f3a;border-radius:12px;text-align:center}.name{font-weight:600;word-break:break-all}.size{color:#9aa0aa;margin:.5rem 0 1.5rem;font-size:.9rem}a.btn{display:inline-block;background:#3b82f6;color:#fff;padding:.6rem 1.2rem;border-radius:8px;text-decoration:none;font-weight:600}</style></head><body><div class="card"><p class="name">${safeName}</p><p class="size">${formatSize(sizeBytes)}</p><a class="btn" href="${escapeHtml(downloadHref)}">Download</a></div></body></html>`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function escapeHeader(filename: string): string {
  return filename.replace(/["\\\r\n]/g, "_");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
