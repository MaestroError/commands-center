import type { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  ownerAuthStatusResultSchema,
  ownerClaimInputSchema,
  ownerClaimResultSchema,
  ownerLoginInputSchema,
  ownerLoginResultSchema,
  ownerLogoutResultSchema,
  ownerReclaimInputSchema,
  ownerReclaimResultSchema,
} from "@cc/shared/schemas";

import {
  BadRequestError,
  ConflictError,
  RateLimitedError,
  UnauthorizedError,
} from "../lib/api-error.js";
import type { ApiError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import {
  createClearOwnerSessionCookie,
  createOwnerSessionCookie,
  readOwnerSessionCookie,
} from "../lib/owner-session-cookie.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import {
  createOwnerAccessService,
  OwnerAccessError,
  type OwnerAccessService,
} from "../services/owner-access-service.js";

export function registerOwnerAuthRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const service = getOwnerAccessService(context);

  app.get(
    "/api/auth/status",
    {
      schema: {
        response: {
          200: ownerAuthStatusResultSchema,
        },
      },
    },
    async (request) => ({
      status: await service.getBrowserAuthStatus(readSessionCookie(request.headers.cookie)),
    }),
  );

  app.post(
    "/api/auth/claim",
    {
      schema: {
        body: ownerClaimInputSchema,
        response: {
          200: ownerClaimResultSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        await service.claim({
          claimCode: request.body.claimCode,
          password: request.body.password,
          confirmPassword: request.body.confirmPassword,
          ip: request.ip,
        });
        const session = await service.createSession({
          rememberBrowser: request.body.rememberBrowser,
          userAgent: request.headers["user-agent"],
          ip: request.ip,
        });
        reply.header(
          "set-cookie",
          createOwnerSessionCookie({
            config: context.config,
            sessionId: session.sessionId,
            rememberBrowser: request.body.rememberBrowser,
          }),
        );

        return { status: "claimed-authenticated" as const };
      } catch (error) {
        throw mapOwnerAccessError(error);
      }
    },
  );

  app.post(
    "/api/auth/login",
    {
      schema: {
        body: ownerLoginInputSchema,
        response: {
          200: ownerLoginResultSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const session = await service.login({
          password: request.body.password,
          rememberBrowser: request.body.rememberBrowser,
          userAgent: request.headers["user-agent"],
          ip: request.ip,
        });
        reply.header(
          "set-cookie",
          createOwnerSessionCookie({
            config: context.config,
            sessionId: session.sessionId,
            rememberBrowser: request.body.rememberBrowser,
          }),
        );

        return { status: "claimed-authenticated" as const };
      } catch (error) {
        throw mapOwnerAccessError(error);
      }
    },
  );

  app.post(
    "/api/auth/logout",
    {
      schema: {
        response: {
          200: ownerLogoutResultSchema,
        },
      },
    },
    async (request, reply) => {
      const sessionId = readSessionCookie(request.headers.cookie);

      if (sessionId) {
        await service.revokeSession(sessionId);
      }

      reply.header("set-cookie", createClearOwnerSessionCookie(context.config));
      return { status: "claimed-unauthenticated" as const };
    },
  );

  app.post(
    "/api/auth/reclaim",
    {
      schema: {
        body: ownerReclaimInputSchema,
        response: {
          200: ownerReclaimResultSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        await service.completeReclaim({
          claimCode: request.body.claimCode,
          password: request.body.password,
          confirmPassword: request.body.confirmPassword,
          ip: request.ip,
        });
        const session = await service.createSession({
          rememberBrowser: request.body.rememberBrowser,
          userAgent: request.headers["user-agent"],
          ip: request.ip,
        });
        reply.header(
          "set-cookie",
          createOwnerSessionCookie({
            config: context.config,
            sessionId: session.sessionId,
            rememberBrowser: request.body.rememberBrowser,
          }),
        );

        return { status: "claimed-authenticated" as const };
      } catch (error) {
        throw mapOwnerAccessError(error);
      }
    },
  );
}

function getOwnerAccessService(context: RuntimeContext): OwnerAccessService {
  return (
    context.ownerAccessService ??
    createOwnerAccessService({ config: context.config, logger: context.logger })
  );
}

function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  return readOwnerSessionCookie(cookieHeader);
}

function mapOwnerAccessError(error: unknown): ApiError {
  if (!(error instanceof OwnerAccessError)) {
    throw error;
  }

  switch (error.code) {
    case "invalid_credentials":
      return new UnauthorizedError("Invalid credentials.");
    case "invalid_claim_code":
      return new BadRequestError("Claim code is invalid.");
    case "password_validation_failed":
      return new BadRequestError("Owner password does not meet requirements.", {
        issues: error.issues,
      });
    case "workspace_already_claimed":
      return new ConflictError("Workspace is already claimed.");
    case "workspace_unclaimed":
      return new BadRequestError("Workspace is not claimed.");
    case "rate_limited":
      return new RateLimitedError("Too many owner access attempts.");
    case "invalid_session":
      return new UnauthorizedError("Owner session is invalid.");
  }
}
