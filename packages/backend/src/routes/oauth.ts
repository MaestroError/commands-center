import type { FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Interaction } from "oidc-provider";
import { errors } from "oidc-provider";

import {
  oauthInteractionDecisionSchema,
  oauthInteractionDetailSchema,
  oauthInteractionParamsSchema,
  oauthInteractionResultSchema,
  oauthRuntimeResetResultSchema,
  type OAuthInteractionDetail,
} from "@cc/shared/schemas";

import { BadRequestError, UnauthorizedError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";

const INTERACTION_SECURITY_HEADERS = {
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
} as const;

export function registerOAuthRoutes(server: AppServer, context: RuntimeContext): void {
  const app = server.withTypeProvider<ZodTypeProvider>();
  const origin = context.config.security.publicOrigin;
  const issuer = new URL("/oauth", origin).toString();
  const resource = new URL("/api/public/mcp", origin).toString();
  const authorizationServerMetadata = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    revocation_endpoint: `${issuer}/revoke`,
    jwks_uri: `${issuer}/jwks`,
    scopes_supported: ["mcp"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    resource_indicators_supported: true,
  } as const;

  app.get("/.well-known/oauth-protected-resource/api/public/mcp", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return {
      resource,
      authorization_servers: [issuer],
      scopes_supported: ["mcp"],
      bearer_methods_supported: ["header"],
    };
  });

  app.get("/.well-known/oauth-authorization-server/oauth", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return authorizationServerMetadata;
  });

  app.get("/oauth/.well-known/openid-configuration", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=300");
    return authorizationServerMetadata;
  });

  app.get(
    "/api/oauth/interactions/:uid",
    {
      preHandler: [
        setInteractionSecurityHeaders,
        (request) => server.enforceOAuthInteractionRateLimit(request),
      ],
      schema: {
        params: oauthInteractionParamsSchema,
        response: { 200: oauthInteractionDetailSchema },
      },
    },
    async (request, reply) => readInteractionDetail(server, request, reply, request.params.uid),
  );

  app.post(
    "/api/oauth/interactions/:uid",
    {
      preHandler: [
        setInteractionSecurityHeaders,
        (request) => server.enforceOAuthInteractionRateLimit(request),
      ],
      schema: {
        params: oauthInteractionParamsSchema,
        body: oauthInteractionDecisionSchema,
        response: { 200: oauthInteractionResultSchema },
      },
    },
    async (request, reply) => {
      await readInteraction(server, request, reply, request.params.uid);
      const redirectTo =
        request.body.decision === "approve"
          ? await server.mcpOAuthService.approveInteraction(
              request.raw,
              reply.raw,
              request.params.uid,
              request.body.apiToken,
            )
          : await server.mcpOAuthService.denyInteraction(
              request.raw,
              reply.raw,
              request.params.uid,
            );

      if (!redirectTo) {
        throw new UnauthorizedError("Invalid API token.");
      }

      return { redirectTo };
    },
  );

  app.delete(
    "/api/oauth/runtime",
    {
      schema: { response: { 200: oauthRuntimeResetResultSchema } },
    },
    () => {
      server.oauthRecordStore.clear();
      server.resetOAuthRegistrationRateLimit();
      return { status: "reset" as const };
    },
  );
}

async function readInteractionDetail(
  server: AppServer,
  request: FastifyRequest,
  reply: FastifyReply,
  uid: string,
): Promise<OAuthInteractionDetail> {
  const details = await readInteraction(server, request, reply, uid);
  const clientId = readString(details.params["client_id"]);
  const redirectUri = readString(details.params["redirect_uri"]);
  const requestedResource = readString(details.params["resource"]);
  const scopes = readString(details.params["scope"])?.split(" ").filter(Boolean) ?? [];

  if (!clientId || !redirectUri || !requestedResource) {
    throw new BadRequestError("OAuth interaction is invalid or expired.");
  }

  const client = await server.oauthProvider.Client.find(clientId);

  if (!client) {
    throw new BadRequestError("OAuth interaction is invalid or expired.");
  }

  return {
    uid: details.uid,
    client: {
      id: clientId,
      name: client.clientName ?? "OAuth client",
    },
    redirectUri,
    requestedResource,
    scopes,
  };
}

async function readInteraction(
  server: AppServer,
  request: FastifyRequest,
  reply: FastifyReply,
  uid: string,
): Promise<Interaction> {
  try {
    const details = await server.oauthProvider.interactionDetails(request.raw, reply.raw);

    if (details.uid !== uid) {
      throw new BadRequestError("OAuth interaction is invalid or expired.");
    }

    return details;
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    if (error instanceof errors.InvalidRequest) {
      throw new BadRequestError("OAuth interaction is invalid or expired.");
    }

    throw error;
  }
}

function setInteractionSecurityHeaders(
  _request: FastifyRequest,
  reply: FastifyReply,
  done: () => void,
): void {
  for (const [name, value] of Object.entries(INTERACTION_SECURITY_HEADERS)) {
    reply.header(name, value);
  }
  done();
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
