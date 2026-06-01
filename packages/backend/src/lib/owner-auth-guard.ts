import type { FastifyReply, FastifyRequest } from "fastify";

import { CsrfError, ForbiddenError, UnauthorizedError } from "./api-error.js";
import { CSRF_HEADER_NAME, isCsrfTokenValid } from "./csrf.js";
import { isOriginAllowed } from "./origin-check.js";
import { readOwnerSessionCookie } from "./owner-session-cookie.js";
import { isPublicRoute } from "./public-routes.js";
import type { RuntimeContext } from "./start-server-runtime.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const STATIC_ASSET_PATTERN = /\.[a-zA-Z0-9]+$/;
const CC_MANAGED_MCP_ROUTE_PATTERN = /^\/api\/mcp\/cc\/[^/]+\/agents\/[^/]+$/;

export function registerOwnerAuthGuard(
  context: RuntimeContext,
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request, reply) => {
    if (!context.ownerAccessService) {
      return;
    }

    const pathname = getPathname(request.url);
    const method = request.method.toUpperCase();

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
