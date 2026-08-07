import { generateKeyPairSync, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import middie from "@fastify/middie";
import rateLimit from "@fastify/rate-limit";
import type { FastifyRequest } from "fastify";
import Provider, { errors, type Configuration } from "oidc-provider";

import { RateLimitedError } from "../lib/api-error.js";
import type { AppServer } from "../lib/fastify-zod.js";
import type { RuntimeContext } from "../lib/start-server-runtime.js";
import { createMcpOAuthService } from "./mcp-oauth-service.js";
import { createOAuthRecordStore } from "./sqlite-adapter.js";
import type { OAuthRuntime } from "./types.js";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const AUTHORIZATION_CODE_TTL_SECONDS = 60;
const INTERACTION_TTL_SECONDS = 10 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 14 * 24 * 60 * 60;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1_000;
const OAUTH_SIGNING_KEY = createSigningKey();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1_000;
const REGISTRATION_RATE_LIMIT = 10;
/** oidc-provider's default `cookies.names.session`, which we do not override. */
const SESSION_COOKIE_NAME = "_session";

type OAuthLimitCheck = (request: FastifyRequest) => Promise<boolean>;

export function registerOAuthProvider(server: AppServer, context: RuntimeContext): OAuthRuntime {
  const runtime = createOAuthRuntime(context);
  const { provider, recordStore, service } = runtime;

  provider.proxy = context.config.security.trustProxy;
  server.decorate("oauthProvider", provider);
  server.decorate("oauthRecordStore", recordStore);
  server.decorate("mcpOAuthService", service);
  let interactionLimitCheck: OAuthLimitCheck = () => Promise.resolve(true);
  let registrationLimitCheck: OAuthLimitCheck = () => Promise.resolve(true);
  server.decorate("enforceOAuthInteractionRateLimit", async (request: FastifyRequest) => {
    if (!(await interactionLimitCheck(request))) {
      throw new RateLimitedError("Too many OAuth interaction attempts.");
    }
  });
  server.decorate("resetOAuthRegistrationRateLimit", () => {
    registrationLimitCheck = createLimitCheck(server, REGISTRATION_RATE_LIMIT);
  });
  server.register(rateLimit, { global: false });
  server.register(middie);
  server.after((error) => {
    if (error) {
      throw error;
    }

    const authorizationLimitCheck = createLimitCheck(server, 60);
    registrationLimitCheck = createLimitCheck(server, REGISTRATION_RATE_LIMIT);
    const revocationLimitCheck = createLimitCheck(server, 60);
    const tokenLimitCheck = createLimitCheck(server, 120);
    interactionLimitCheck = createLimitCheck(server, 30);
    const providerCallback = provider.callback();
    const publicOrigin = new URL(context.config.security.publicOrigin);
    server.use((request: IncomingMessage, response: ServerResponse, next) => {
      void (async () => {
        const route = matchProviderRoute(request.method, request.url);

        if (!route) {
          next();
          return;
        }

        if (!isCanonicalOAuthRequest(request, publicOrigin, context.config.security.trustProxy)) {
          response.statusCode = 400;
          response.end("OAuth requests must use the configured public origin.");
          return;
        }

        const limitCheck =
          route === "authorization"
            ? authorizationLimitCheck
            : route === "registration"
              ? registrationLimitCheck
              : route === "revocation"
                ? revocationLimitCheck
                : route === "token"
                  ? tokenLimitCheck
                  : undefined;

        if (limitCheck && !(await limitCheck(createRateLimitRequest(request)))) {
          response.statusCode = 429;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.setHeader("retry-after", "600");
          response.end(
            JSON.stringify({
              error: "temporarily_unavailable",
              error_description: "Too many OAuth requests.",
            }),
          );
          return;
        }

        if (route === "authorization") {
          stripSessionCookie(request);
        }

        request.url = stripOAuthIssuerPath(request.url);
        await providerCallback(request, response);
      })().catch(next);
    });
  });

  const cleanupTimer = setInterval(() => {
    recordStore.cleanupExpired();
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
  server.addHook("onClose", () => {
    clearInterval(cleanupTimer);
  });

  return runtime;
}

function createLimitCheck(server: AppServer, max: number): OAuthLimitCheck {
  const check = server.createRateLimit({
    keyGenerator: (request) => request.ip,
    max,
    timeWindow: RATE_LIMIT_WINDOW_MS,
  });

  return async (request) => {
    const result = await check(request);
    return result.isAllowed || !result.isExceeded;
  };
}

function createRateLimitRequest(request: IncomingMessage): FastifyRequest {
  const observedRequest = request as IncomingMessage & { ip?: string };

  return {
    ip: observedRequest.ip ?? request.socket.remoteAddress ?? "unknown",
    routeOptions: { config: {} },
  } as unknown as FastifyRequest;
}

function matchProviderRoute(
  method: string | undefined,
  requestUrl: string | undefined,
): "authorization" | "jwks" | "registration" | "revocation" | "token" | undefined {
  const pathname = new URL(requestUrl ?? "/", "http://localhost").pathname;
  const normalizedMethod = method?.toUpperCase();

  if (
    normalizedMethod === "GET" &&
    (pathname === "/oauth/authorize" || /^\/oauth\/authorize\/[^/]+$/.test(pathname))
  ) {
    return "authorization";
  }

  if (normalizedMethod === "POST" && pathname === "/oauth/register") {
    return "registration";
  }

  if (["POST", "OPTIONS"].includes(normalizedMethod ?? "") && pathname === "/oauth/revoke") {
    return "revocation";
  }

  if (["POST", "OPTIONS"].includes(normalizedMethod ?? "") && pathname === "/oauth/token") {
    return "token";
  }

  if (["GET", "OPTIONS"].includes(normalizedMethod ?? "") && pathname === "/oauth/jwks") {
    return "jwks";
  }

  return undefined;
}

/**
 * Every MCP authorization stands on its own: the API token typed on the
 * interaction screen is the principal, so a browser session left behind by an
 * earlier connection must not take part. Carrying it over makes oidc-provider
 * read an approval that uses a different API token as an account switch and
 * divert the flow to the RP-initiated logout endpoint, which is disabled here —
 * the client never receives its authorization code. Dropping the cookie on both
 * the authorization request and its resume also means each connection has to
 * enter a token again instead of riding a still-live session.
 */
function stripSessionCookie(request: IncomingMessage): void {
  const header = request.headers.cookie;

  if (!header) {
    return;
  }

  const kept = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      const name = part.split("=")[0];
      return name !== SESSION_COOKIE_NAME && name !== `${SESSION_COOKIE_NAME}.sig`;
    });

  if (kept.length === 0) {
    delete request.headers.cookie;
    return;
  }

  request.headers.cookie = kept.join("; ");
}

function stripOAuthIssuerPath(requestUrl: string | undefined): string {
  const url = requestUrl ?? "/oauth";
  const stripped = url.slice("/oauth".length);
  return stripped || "/";
}

export function createOAuthRuntime(
  context: Pick<RuntimeContext, "apiTokenService" | "config" | "database">,
): OAuthRuntime {
  const resource = new URL("/api/public/mcp", context.config.security.publicOrigin).toString();
  const issuer = new URL("/oauth", context.config.security.publicOrigin).toString();
  const recordStore = createOAuthRecordStore({ db: context.database.db });
  const provider = createOAuthProvider({ context, issuer, resource, recordStore });
  const service = createMcpOAuthService({
    provider,
    apiTokenService: context.apiTokenService,
    resource,
  });

  return { provider, recordStore, service };
}

function createOAuthProvider(options: {
  context: Pick<RuntimeContext, "apiTokenService" | "config">;
  issuer: string;
  resource: string;
  recordStore: ReturnType<typeof createOAuthRecordStore>;
}): Provider {
  const secureCookies = new URL(options.issuer).protocol === "https:";
  const registrationFeature: NonNullable<NonNullable<Configuration["features"]>["registration"]> & {
    issueRegistrationAccessToken: boolean;
  } = {
    enabled: true,
    initialAccessToken: false,
    issueRegistrationAccessToken: false,
  };
  const configuration: Configuration = {
    adapter: options.recordStore.adapterFactory,
    claims: {},
    clientAuthMethods: ["none"],
    clientDefaults: {
      grant_types: ["authorization_code", "refresh_token"],
      id_token_signed_response_alg: "EdDSA",
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
    cookies: {
      keys: [options.context.config.secretKey],
      long: { httpOnly: true, sameSite: "lax", secure: secureCookies, signed: true },
      short: { httpOnly: true, path: "/", sameSite: "lax", secure: secureCookies, signed: true },
    },
    expiresWithSession: () => false,
    features: {
      devInteractions: { enabled: false },
      dPoP: { enabled: false },
      claimsParameter: { enabled: false },
      clientCredentials: { enabled: false },
      deviceFlow: { enabled: false },
      encryption: { enabled: false },
      introspection: { enabled: false },
      jwtIntrospection: { enabled: false },
      jwtResponseModes: { enabled: false },
      pushedAuthorizationRequests: { enabled: false },
      registration: registrationFeature,
      registrationManagement: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => options.resource,
        getResourceServerInfo: (_context, resourceIndicator) => {
          if (resourceIndicator !== options.resource) {
            throw new errors.InvalidTarget();
          }

          return {
            accessTokenFormat: "opaque",
            accessTokenTTL: ACCESS_TOKEN_TTL_SECONDS,
            audience: options.resource,
            scope: "mcp",
          };
        },
        useGrantedResource: () => true,
      },
      revocation: { enabled: true },
      rpInitiatedLogout: { enabled: false },
      userinfo: { enabled: false },
      jwtUserinfo: { enabled: false },
    },
    findAccount: (_context, accountId) => {
      const apiToken = options.context.apiTokenService.resolveActiveTokenById(accountId);

      if (!apiToken) {
        return undefined;
      }

      return {
        accountId,
        claims: () => ({ sub: accountId }),
      };
    },
    interactions: {
      url: (_context, interaction) => `/oauth-interaction/${interaction.uid}`,
    },
    issueRefreshToken: () => true,
    jwks: { keys: [OAUTH_SIGNING_KEY] },
    pkce: {
      methods: ["S256"],
      required: () => true,
    },
    responseTypes: ["code"],
    revokeGrantPolicy: () => true,
    rotateRefreshToken: true,
    routes: {
      authorization: "/authorize",
      registration: "/register",
      revocation: "/revoke",
      token: "/token",
    },
    scopes: ["mcp"],
    ttl: {
      AccessToken: ACCESS_TOKEN_TTL_SECONDS,
      AuthorizationCode: AUTHORIZATION_CODE_TTL_SECONDS,
      Grant: REFRESH_TOKEN_TTL_SECONDS,
      Interaction: INTERACTION_TTL_SECONDS,
      RefreshToken: REFRESH_TOKEN_TTL_SECONDS,
      Session: INTERACTION_TTL_SECONDS,
    },
  };

  return new Provider(options.issuer, configuration);
}

function createSigningKey(): NonNullable<Configuration["jwks"]>["keys"][number] {
  const { privateKey } = generateKeyPairSync("ed25519");

  return {
    ...privateKey.export({ format: "jwk" }),
    alg: "EdDSA",
    kid: randomUUID(),
    use: "sig",
  };
}

function isCanonicalOAuthRequest(
  request: IncomingMessage,
  publicOrigin: URL,
  trustProxy: boolean,
): boolean {
  if (request.headers.host !== publicOrigin.host) {
    return false;
  }

  if (!trustProxy) {
    return true;
  }

  const forwardedHost = readForwardedHeader(request.headers["x-forwarded-host"]);
  const forwardedProtocol = readForwardedHeader(request.headers["x-forwarded-proto"]);

  return (
    (forwardedHost === undefined || forwardedHost === publicOrigin.host) &&
    (forwardedProtocol === undefined || `${forwardedProtocol}:` === publicOrigin.protocol)
  );
}

function readForwardedHeader(value: string | string[] | undefined): string | undefined {
  const firstValue = Array.isArray(value) ? value[0] : value?.split(",")[0];
  return firstValue?.trim().toLowerCase();
}
