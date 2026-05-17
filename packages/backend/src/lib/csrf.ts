import { randomBytes, timingSafeEqual } from "node:crypto";

import type { RuntimeConfig } from "./runtime-config.js";

export const CSRF_COOKIE_NAME = "cc_csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

const CSRF_TOKEN_BYTES = 32;
const CSRF_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function createCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_BYTES).toString("base64url");
}

export function createCsrfCookie(options: { config: RuntimeConfig; token: string }): string {
  const parts = [
    `${CSRF_COOKIE_NAME}=${encodeURIComponent(options.token)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${CSRF_COOKIE_MAX_AGE_SECONDS.toString()}`,
  ];

  if (shouldUseSecureCookie(options.config)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function createClearCsrfCookie(config: RuntimeConfig): string {
  const parts = [`${CSRF_COOKIE_NAME}=`, "Path=/", "SameSite=Lax", "Max-Age=0"];

  if (shouldUseSecureCookie(config)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function readCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return undefined;
}

export function isCsrfTokenValid(input: {
  cookieHeader: string | undefined;
  headerValue: string | string[] | undefined;
}): boolean {
  const cookieToken = readCookieValue(input.cookieHeader, CSRF_COOKIE_NAME);
  const headerToken = Array.isArray(input.headerValue) ? input.headerValue[0] : input.headerValue;

  if (!cookieToken || !headerToken) {
    return false;
  }

  const cookieTokenBuffer = Buffer.from(cookieToken);
  const headerTokenBuffer = Buffer.from(headerToken);

  if (cookieTokenBuffer.byteLength !== headerTokenBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(cookieTokenBuffer, headerTokenBuffer);
}

function shouldUseSecureCookie(config: RuntimeConfig): boolean {
  return config.nodeEnv === "production";
}
