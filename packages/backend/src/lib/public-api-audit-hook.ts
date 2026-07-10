import type { FastifyReply, FastifyRequest } from "fastify";

import { capabilityForPublicRoute } from "./public-api-capabilities.js";
import type { RuntimeContext } from "./start-server-runtime.js";

const PUBLIC_V1_PREFIX = "/api/public/v1/";

// onResponse hook that records one audit entry per authenticated public REST
// request. Hijacked routes (the MCP endpoint) never reach here — MCP calls are
// audited inside the MCP dispatch instead.
export function createPublicApiAuditHook(
  context: RuntimeContext,
): (request: FastifyRequest, reply: FastifyReply) => void {
  return (request, reply) => {
    const audit = context.tokenAuditService;
    const token = request.apiToken;
    if (!audit || !token) {
      return;
    }

    const pathname = getPathname(request.url);
    if (!pathname.startsWith(PUBLIC_V1_PREFIX)) {
      return;
    }

    const method = request.method.toUpperCase();
    const routeTemplate = (request.routeOptions as { url?: string } | undefined)?.url ?? pathname;
    const params = request.params as Record<string, string> | undefined;
    const query = request.query as Record<string, string | undefined> | undefined;
    const target = deriveTarget(pathname, params, query);
    const statusCode = reply.statusCode;

    void audit.record({
      tokenId: token.id,
      tokenName: token.name,
      surface: "rest",
      action: `${method} ${routeTemplate}`,
      capabilityId: capabilityForPublicRoute(method, pathname) ?? null,
      targetKind: target.kind,
      targetId: target.id,
      input: request.body,
      outcome: statusCode >= 400 ? "error" : "ok",
      statusCode,
    });
  };
}

function deriveTarget(
  pathname: string,
  params: Record<string, string> | undefined,
  query: Record<string, string | undefined> | undefined,
): { kind: string | null; id: string | null } {
  if (pathname === "/api/public/v1/documents/read") {
    const scope = query?.["scope"];
    const path = query?.["path"];
    if (!scope || !path) {
      return { kind: "document", id: null };
    }
    return {
      kind: "document",
      id: scope === "private" ? `private:${query?.["owner"] ?? ""}:${path}` : `global:${path}`,
    };
  }
  const runId = params?.["runId"];
  const id = params?.["id"];
  if (runId) {
    return { kind: "run", id: runId };
  }
  if (id) {
    return { kind: pathname.includes("/task-templates/") ? "template" : "task", id };
  }
  return { kind: null, id: null };
}

function getPathname(url: string): string {
  return new URL(url, "http://localhost").pathname;
}
