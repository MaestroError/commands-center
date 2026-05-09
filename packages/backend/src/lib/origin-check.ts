import type { IncomingMessage } from "node:http";

import type { RuntimeConfig } from "./runtime-config.js";

export function isOriginAllowed(options: {
  config: RuntimeConfig;
  origin: string | undefined;
}): boolean {
  if (!options.origin) {
    return true;
  }

  const originUrl = parseOrigin(options.origin);

  if (!originUrl) {
    return false;
  }

  const allowedOrigins = getAllowedOrigins(options.config);

  if (allowedOrigins.has(originUrl.origin)) {
    return true;
  }

  if (options.config.nodeEnv !== "production" && isLocalhostOrigin(originUrl)) {
    return true;
  }

  return false;
}

export function readRequestOrigin(request: IncomingMessage): string | undefined {
  const origin: unknown = request.headers.origin;

  if (Array.isArray(origin)) {
    const first: unknown = origin[0];
    return typeof first === "string" ? first : undefined;
  }

  return typeof origin === "string" ? origin : undefined;
}

function getAllowedOrigins(config: RuntimeConfig): Set<string> {
  return new Set(
    [config.security.publicOrigin, ...config.security.allowedOrigins]
      .filter((origin): origin is string => Boolean(origin))
      .map((origin) => parseOrigin(origin)?.origin)
      .filter((origin): origin is string => Boolean(origin)),
  );
}

function parseOrigin(origin: string): URL | undefined {
  try {
    return new URL(origin);
  } catch {
    return undefined;
  }
}

function isLocalhostOrigin(origin: URL): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
}
