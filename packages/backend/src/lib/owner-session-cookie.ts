import type { RuntimeConfig } from "./runtime-config.js";

export const OWNER_SESSION_COOKIE_NAME = "cc_owner_session";

const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const REMEMBER_SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function readOwnerSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === OWNER_SESSION_COOKIE_NAME) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return undefined;
}

export function createOwnerSessionCookie(options: {
  config: RuntimeConfig;
  sessionId: string;
  rememberBrowser?: boolean;
}): string {
  const maxAge = options.rememberBrowser
    ? REMEMBER_SESSION_COOKIE_MAX_AGE_SECONDS
    : SESSION_COOKIE_MAX_AGE_SECONDS;
  const parts = [
    `${OWNER_SESSION_COOKIE_NAME}=${encodeURIComponent(options.sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge.toString()}`,
  ];

  if (shouldUseSecureCookie(options.config)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function createClearOwnerSessionCookie(config: RuntimeConfig): string {
  const parts = [
    `${OWNER_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];

  if (shouldUseSecureCookie(config)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function shouldUseSecureCookie(config: RuntimeConfig): boolean {
  return config.nodeEnv === "production";
}
