import type { FastifyReply, FastifyRequest } from "fastify";

import type { ApiTokenRecord, ApiTokenScope } from "@cc/shared/schemas";

import { CsrfError, ForbiddenError, NotFoundError, UnauthorizedError } from "./api-error.js";
import { CSRF_HEADER_NAME, isCsrfTokenValid } from "./csrf.js";
import { isOriginAllowed } from "./origin-check.js";
import { readOwnerSessionCookie } from "./owner-session-cookie.js";
import { isPublicRoute } from "./public-routes.js";
import type { RuntimeContext } from "./start-server-runtime.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const STATIC_ASSET_PATTERN = /\.[a-zA-Z0-9]+$/;
const CC_MANAGED_MCP_ROUTE_PATTERN = /^\/api\/mcp\/cc\/[^/]+\/specialists\/[^/]+$/;
const PUBLIC_API_PREFIX = "/api/public/";
const SIGNED_PUBLIC_ARTIFACT_DOWNLOAD_PATTERN =
  /^\/api\/public\/v1\/task-artifacts\/download\/[^/]+$/;

type PublicApiScopeRequirement = ApiTokenScope | "either";

declare module "fastify" {
  interface FastifyRequest {
    apiToken?: ApiTokenRecord;
  }
}

export function registerOwnerAuthGuard(
  context: RuntimeContext,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    const pathname = getPathname(request.url);
    const method = request.method.toUpperCase();

    if (method === "GET" && SIGNED_PUBLIC_ARTIFACT_DOWNLOAD_PATTERN.test(pathname)) {
      return;
    }

    if (pathname.startsWith(PUBLIC_API_PREFIX)) {
      validatePublicApiBearer(context, request, method, pathname);
      return;
    }

    if (!context.ownerAccessService) {
      return;
    }

    if (!pathname.startsWith("/api/")) {
      await handleBrowserNavigation({ context, request, reply, pathname });
      return;
    }

    if (isPublicRoute(method, pathname)) {
      if (!CC_MANAGED_MCP_ROUTE_PATTERN.test(pathname)) {
        validateOriginForMutation(context, request);
      }
      return;
    }

    const sessionId = readOwnerSessionCookie(request.headers.cookie);

    if (!sessionId || !(await context.ownerAccessService.validateSession(sessionId))) {
      throw new UnauthorizedError("Owner session is required.");
    }

    validateOriginForMutation(context, request);

    if (
      MUTATING_METHODS.has(method) &&
      !isCsrfTokenValid({
        cookieHeader: request.headers.cookie,
        headerValue: request.headers[CSRF_HEADER_NAME],
      })
    ) {
      throw new CsrfError("CSRF token is invalid.");
    }
  };
}

function validatePublicApiBearer(
  context: RuntimeContext,
  request: FastifyRequest,
  method: string,
  pathname: string,
): void {
  const rawToken = readBearerToken(request.headers.authorization);
  const tokenRecord = rawToken ? context.apiTokenService.validateToken(rawToken) : null;

  if (!tokenRecord) {
    throw new UnauthorizedError("Invalid or revoked API token.");
  }

  const requiredScope = scopeForPublicRoute(method, pathname);

  if (!requiredScope) {
    throw new NotFoundError("Public API route not found.");
  }

  if (!hasRequiredScope(tokenRecord.scopes, requiredScope)) {
    throw new ForbiddenError("Token is missing the required scope.");
  }

  request.apiToken = tokenRecord;
}

function readBearerToken(value: string | string[] | undefined): string | undefined {
  const header = readHeaderString(value);
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");

  return match?.[1]?.trim();
}

function scopeForPublicRoute(
  method: string,
  pathname: string,
): PublicApiScopeRequirement | undefined {
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === "GET" && pathname === "/api/public/v1/task-templates") {
    return "either";
  }

  if (
    normalizedMethod === "POST" &&
    /^\/api\/public\/v1\/task-templates\/[^/]+\/trigger$/.test(pathname)
  ) {
    return "templates";
  }

  // Template Active-status management lives under the broader tasks scope,
  // not the trigger-only templates scope.
  if (
    normalizedMethod === "POST" &&
    /^\/api\/public\/v1\/task-templates\/[^/]+\/(enable|disable)$/.test(pathname)
  ) {
    return "tasks";
  }

  if (normalizedMethod === "GET" && /^\/api\/public\/v1\/task-runs\/[^/]+$/.test(pathname)) {
    return "templates";
  }

  if (
    normalizedMethod === "GET" &&
    (pathname === "/api/public/v1/specialists" || pathname === "/api/public/v1/tasks")
  ) {
    return "tasks";
  }

  if (
    ["GET", "POST"].includes(normalizedMethod) &&
    /^\/api\/public\/v1\/tasks(\/[^/]+(\/(trigger|schedule|runs|feedback))?(\/[^/]+)?)?$/.test(
      pathname,
    )
  ) {
    return "tasks";
  }

  return undefined;
}

function hasRequiredScope(scopes: ApiTokenScope[], requiredScope: PublicApiScopeRequirement) {
  if (requiredScope === "either") {
    return scopes.includes("templates") || scopes.includes("tasks");
  }

  return scopes.includes(requiredScope);
}

export function validateOriginForMutation(context: RuntimeContext, request: FastifyRequest): void {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return;
  }

  const origin = readHeaderString(request.headers.origin);
  const referer = readHeaderString(request.headers.referer);

  if (!isOriginAllowed({ config: context.config, origin, referer })) {
    throw new ForbiddenError("Request origin is not allowed.");
  }
}

function readHeaderString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === "string" ? value : undefined;
}

function getPathname(url: string): string {
  return new URL(url, "http://localhost").pathname;
}

async function handleBrowserNavigation(options: {
  context: RuntimeContext;
  request: FastifyRequest;
  reply: FastifyReply;
  pathname: string;
}): Promise<void> {
  if (options.request.method !== "GET" || STATIC_ASSET_PATTERN.test(options.pathname)) {
    return;
  }

  const acceptsHtml = options.request.headers.accept?.includes("text/html") ?? false;

  if (!acceptsHtml) {
    return;
  }

  const status = await options.context.ownerAccessService!.getBrowserAuthStatus(
    readOwnerSessionCookie(options.request.headers.cookie),
  );

  if (status === "unclaimed" && options.pathname !== "/claim") {
    options.reply.redirect("/claim", 302);
    return;
  }

  if (status === "claimed-unauthenticated" && options.pathname !== "/login") {
    options.reply.redirect("/login", 302);
  }
}
