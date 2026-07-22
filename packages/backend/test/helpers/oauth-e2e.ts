import { createHash, randomUUID } from "node:crypto";

import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

import type { createServer } from "../../src/server.js";

type OAuthTestServer = Awaited<ReturnType<typeof createServer>>;

type BrowserCookie = {
  path: string;
  secure: boolean;
  value: string;
};

export type OAuthClientRegistration = {
  clientId: string;
  redirectUri: string;
};

export type OAuthAuthorizationTransaction = OAuthClientRegistration & {
  cookie: string;
  uid: string;
  verifier: string;
};

export type OAuthAuthorizationCode = OAuthAuthorizationTransaction & {
  callback: URL;
  code: string;
};

export type OAuthTokenSet = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  tokenType: string;
};

export type InteractiveOAuthClient = {
  authorizationCode(): string;
  authorizationUrl(): URL;
  clientInformation(): OAuthClientInformationMixed;
  discoveryState(): OAuthDiscoveryState;
  provider: OAuthClientProvider;
  tokens(): OAuthTokens;
};

export function createInteractiveOAuthClient(
  apiToken: string,
  redirectUri = "http://127.0.0.1/callback",
): InteractiveOAuthClient {
  const expectedState = `oauth-e2e-${randomUUID()}`;
  const clientMetadata = {
    client_name: "Public MCP full-cycle E2E",
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: [redirectUri],
    response_types: ["code"],
    scope: "mcp",
    token_endpoint_auth_method: "none",
  } satisfies OAuthClientMetadata;
  let authorizationCode: string | undefined;
  let authorizationUrl: URL | undefined;
  let clientInformation: OAuthClientInformationMixed | undefined;
  let codeVerifier: string | undefined;
  let discoveryState: OAuthDiscoveryState | undefined;
  let tokens: OAuthTokens | undefined;

  const provider: OAuthClientProvider = {
    get clientMetadata() {
      return clientMetadata;
    },
    get redirectUrl() {
      return redirectUri;
    },
    clientInformation: () => clientInformation,
    codeVerifier: () => readRequiredValue(codeVerifier, "PKCE code verifier"),
    discoveryState: () => discoveryState,
    redirectToAuthorization: async (url) => {
      authorizationUrl = url;
      authorizationCode = await completeBrowserAuthorization({
        apiToken,
        authorizationUrl: url,
        expectedState,
        redirectUri,
      });
    },
    saveClientInformation: (value) => {
      clientInformation = value;
    },
    saveCodeVerifier: (value) => {
      codeVerifier = value;
    },
    saveDiscoveryState: (value) => {
      discoveryState = value;
    },
    saveTokens: (value) => {
      tokens = value;
    },
    state: () => expectedState,
    tokens: () => tokens,
  };

  return {
    authorizationCode: () => readRequiredValue(authorizationCode, "authorization code"),
    authorizationUrl: () => readRequiredValue(authorizationUrl, "authorization URL"),
    clientInformation: () => readRequiredValue(clientInformation, "client registration"),
    discoveryState: () => readRequiredValue(discoveryState, "OAuth discovery state"),
    provider,
    tokens: () => readRequiredValue(tokens, "OAuth token set"),
  };
}

export async function registerOAuthClient(
  server: OAuthTestServer,
  origin: string,
  redirectUri = "http://127.0.0.1/callback",
): Promise<OAuthClientRegistration> {
  const response = await server.inject({
    method: "POST",
    url: "/oauth/register",
    headers: { host: new URL(origin).host },
    payload: {
      client_name: "Public MCP OAuth E2E",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [redirectUri],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  });

  if (response.statusCode !== 201) {
    throw new Error(`OAuth client registration failed: ${response.body}`);
  }

  return { clientId: readRequiredString(response.json(), "client_id"), redirectUri };
}

export async function beginOAuthAuthorization(
  server: OAuthTestServer,
  origin: string,
  registration: OAuthClientRegistration,
): Promise<OAuthAuthorizationTransaction> {
  const verifier = `oauth-e2e-${randomUUID()}-code-verifier-value`;
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const resource = new URL("/api/public/mcp", origin).toString();
  const response = await server.inject({
    method: "GET",
    url: `/oauth/authorize?${new URLSearchParams({
      client_id: registration.clientId,
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: registration.redirectUri,
      resource,
      response_type: "code",
      scope: "mcp",
      state: "oauth-e2e-state",
    }).toString()}`,
    headers: { host: new URL(origin).host },
  });
  const location = readRequiredHeader(response.headers.location);
  const uid = /^\/oauth-interaction\/([A-Za-z0-9_-]+)$/.exec(location)?.[1];

  if (response.statusCode !== 303 || !uid) {
    throw new Error(`OAuth authorization did not start: ${response.body}`);
  }

  return {
    ...registration,
    cookie: readCookieHeader(response),
    uid,
    verifier,
  };
}

export async function approveOAuthAuthorization(
  server: OAuthTestServer,
  origin: string,
  transaction: OAuthAuthorizationTransaction,
  apiToken: string,
): Promise<OAuthAuthorizationCode> {
  const approval = await server.inject({
    method: "POST",
    url: `/api/oauth/interactions/${transaction.uid}`,
    headers: { cookie: transaction.cookie, origin },
    payload: { decision: "approve", apiToken },
  });

  if (approval.statusCode !== 200) {
    throw new Error(`OAuth authorization approval failed: ${approval.body}`);
  }

  const resumeUrl = new URL(readRequiredString(approval.json(), "redirectTo"));
  const resumed = await server.inject({
    method: "GET",
    url: `${resumeUrl.pathname}${resumeUrl.search}`,
    headers: { cookie: transaction.cookie, host: new URL(origin).host },
  });
  const callback = new URL(readRequiredHeader(resumed.headers.location));
  const code = callback.searchParams.get("code");

  if (resumed.statusCode !== 303 || !code) {
    throw new Error(`OAuth authorization did not return a code: ${resumed.body}`);
  }

  return { ...transaction, callback, code };
}

export async function exchangeOAuthAuthorizationCode(
  server: OAuthTestServer,
  origin: string,
  authorization: OAuthAuthorizationCode,
): Promise<OAuthTokenSet> {
  const response = await requestOAuthToken(server, origin, {
    client_id: authorization.clientId,
    code: authorization.code,
    code_verifier: authorization.verifier,
    grant_type: "authorization_code",
    redirect_uri: authorization.redirectUri,
    resource: new URL("/api/public/mcp", origin).toString(),
  });

  if (response.statusCode !== 200) {
    throw new Error(`OAuth code exchange failed: ${response.body}`);
  }

  return readTokenSet(response.json());
}

export async function authorizeOAuthClient(
  server: OAuthTestServer,
  origin: string,
  apiToken: string,
): Promise<{
  authorization: OAuthAuthorizationCode;
  registration: OAuthClientRegistration;
  tokens: OAuthTokenSet;
}> {
  const registration = await registerOAuthClient(server, origin);
  const transaction = await beginOAuthAuthorization(server, origin, registration);
  const authorization = await approveOAuthAuthorization(server, origin, transaction, apiToken);
  const tokens = await exchangeOAuthAuthorizationCode(server, origin, authorization);
  return { authorization, registration, tokens };
}

export async function refreshOAuthTokens(
  server: OAuthTestServer,
  origin: string,
  clientId: string,
  refreshToken: string,
): Promise<{ response: Awaited<ReturnType<OAuthTestServer["inject"]>>; tokens?: OAuthTokenSet }> {
  const response = await requestOAuthToken(server, origin, {
    client_id: clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    resource: new URL("/api/public/mcp", origin).toString(),
  });

  return {
    response,
    tokens: response.statusCode === 200 ? readTokenSet(response.json()) : undefined,
  };
}

export async function revokeOAuthToken(
  server: OAuthTestServer,
  origin: string,
  clientId: string,
  token: string,
): Promise<Awaited<ReturnType<OAuthTestServer["inject"]>>> {
  return server.inject({
    method: "POST",
    url: "/oauth/revoke",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: new URL(origin).host,
    },
    payload: new URLSearchParams({ client_id: clientId, token }).toString(),
  });
}

export async function requestOAuthToken(
  server: OAuthTestServer,
  origin: string,
  values: Record<string, string>,
): Promise<Awaited<ReturnType<OAuthTestServer["inject"]>>> {
  return server.inject({
    method: "POST",
    url: "/oauth/token",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      host: new URL(origin).host,
    },
    payload: new URLSearchParams(values).toString(),
  });
}

async function completeBrowserAuthorization(options: {
  apiToken: string;
  authorizationUrl: URL;
  expectedState: string;
  redirectUri: string;
}): Promise<string> {
  const authorization = await fetch(options.authorizationUrl, { redirect: "manual" });
  const interactionUrl = new URL(readFetchLocation(authorization), options.authorizationUrl);
  const uid = /^\/oauth-interaction\/([A-Za-z0-9_-]+)$/.exec(interactionUrl.pathname)?.[1];

  if (authorization.status !== 303 || !uid) {
    throw new Error(`OAuth browser authorization did not start: ${await authorization.text()}`);
  }

  const cookies = readFetchCookies(authorization);
  const detailsUrl = new URL(`/api/oauth/interactions/${uid}`, options.authorizationUrl.origin);
  const details = await fetch(detailsUrl, { headers: browserCookieHeaders(cookies, detailsUrl) });

  if (!details.ok) {
    throw new Error(`OAuth browser interaction details failed: ${await details.text()}`);
  }

  const approval = await fetch(detailsUrl, {
    body: JSON.stringify({ decision: "approve", apiToken: options.apiToken }),
    headers: {
      "content-type": "application/json",
      ...browserCookieHeaders(cookies, detailsUrl),
      origin: options.authorizationUrl.origin,
    },
    method: "POST",
  });
  const approvalBody: unknown = await approval.json();

  if (!approval.ok) {
    throw new Error(`OAuth browser authorization approval failed: ${JSON.stringify(approvalBody)}`);
  }

  const resumeUrl = new URL(
    readRequiredString(approvalBody, "redirectTo"),
    options.authorizationUrl.origin,
  );
  const resumed = await fetch(resumeUrl, {
    headers: browserCookieHeaders(cookies, resumeUrl),
    redirect: "manual",
  });
  const callback = new URL(readFetchLocation(resumed), options.redirectUri);
  const expectedCallback = new URL(options.redirectUri);

  if (
    resumed.status !== 303 ||
    callback.origin !== expectedCallback.origin ||
    callback.pathname !== expectedCallback.pathname ||
    callback.searchParams.get("state") !== options.expectedState
  ) {
    throw new Error(
      `OAuth browser authorization returned an invalid callback: status=${String(resumed.status)}, origin=${String(callback.origin === expectedCallback.origin)}, path=${String(callback.pathname === expectedCallback.pathname)}, state=${String(callback.searchParams.get("state") === options.expectedState)}.`,
    );
  }

  return readRequiredValue(callback.searchParams.get("code") ?? undefined, "authorization code");
}

function readTokenSet(value: unknown): OAuthTokenSet {
  return {
    accessToken: readRequiredString(value, "access_token"),
    expiresIn: readRequiredNumber(value, "expires_in"),
    refreshToken: readRequiredString(value, "refresh_token"),
    tokenType: readRequiredString(value, "token_type"),
  };
}

function readCookieHeader(response: { headers: { [key: string]: unknown } }): string {
  const header = response.headers["set-cookie"];
  const cookies = Array.isArray(header)
    ? header.filter((value): value is string => typeof value === "string")
    : typeof header === "string"
      ? [header]
      : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

function readFetchCookies(response: Response): BrowserCookie[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [
    readRequiredValue(headers.get("set-cookie") ?? undefined, "OAuth interaction cookie"),
  ];

  return values.map((value) => {
    const [cookie, ...attributes] = value.split(";").map((part) => part.trim());
    const pathAttribute = attributes.find((attribute) =>
      attribute.toLowerCase().startsWith("path="),
    );

    return {
      path: pathAttribute?.slice("path=".length) ?? "/",
      secure: attributes.some((attribute) => attribute.toLowerCase() === "secure"),
      value: readRequiredValue(cookie, "OAuth interaction cookie"),
    };
  });
}

function browserCookieHeaders(cookies: BrowserCookie[], requestUrl: URL): Record<string, string> {
  const values = cookies
    .filter(
      (cookie) =>
        (!cookie.secure || requestUrl.protocol === "https:") &&
        cookiePathMatches(cookie.path, requestUrl.pathname),
    )
    .map((cookie) => cookie.value);

  return values.length > 0 ? { cookie: values.join("; ") } : {};
}

function cookiePathMatches(cookiePath: string, requestPath: string): boolean {
  return (
    requestPath === cookiePath ||
    (requestPath.startsWith(cookiePath) &&
      (cookiePath.endsWith("/") || requestPath[cookiePath.length] === "/"))
  );
}

function readFetchLocation(response: Response): string {
  return readRequiredValue(
    response.headers.get("location") ?? undefined,
    "OAuth redirect location",
  );
}

function readRequiredValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`OAuth flow is missing ${label}.`);
  }

  return value;
}

function readRequiredString(value: unknown, key: string): string {
  if (typeof value !== "object" || value === null || !(key in value)) {
    throw new Error(`OAuth response is missing ${key}.`);
  }

  const result = (value as Record<string, unknown>)[key];

  if (typeof result !== "string") {
    throw new Error(`OAuth response contains an invalid ${key}.`);
  }

  return result;
}

function readRequiredNumber(value: unknown, key: string): number {
  if (typeof value !== "object" || value === null || !(key in value)) {
    throw new Error(`OAuth response is missing ${key}.`);
  }

  const result = (value as Record<string, unknown>)[key];

  if (typeof result !== "number") {
    throw new Error(`OAuth response contains an invalid ${key}.`);
  }

  return result;
}

function readRequiredHeader(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("OAuth response is missing a Location header.");
  }

  return value;
}
