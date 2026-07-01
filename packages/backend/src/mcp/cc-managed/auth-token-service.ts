import { createHmac, timingSafeEqual } from "node:crypto";

import type { CcManagedMcpAuthStateStore } from "./auth-state-store.js";

type CcManagedTokenPayload = {
  agentSlug: string;
  serverName: string;
  issuedAt: number;
};

export function createCcManagedMcpAuthTokenService(options: {
  authStateStore: CcManagedMcpAuthStateStore;
}) {
  return {
    async issueToken(agentSlug: string, serverName: string): Promise<string> {
      const state = await options.authStateStore.load();
      const payload = encode({ agentSlug, serverName, issuedAt: Date.now() });
      const signature = sign(state.signingSecret, payload);
      return `${payload}.${signature}`;
    },

    async verifyToken(token: string): Promise<CcManagedTokenPayload | null> {
      const [payload, signature] = token.split(".");

      if (!payload || !signature) {
        return null;
      }

      const state = await options.authStateStore.load();
      const expected = sign(state.signingSecret, payload);

      if (!safeCompare(signature, expected)) {
        return null;
      }

      try {
        const parsed = JSON.parse(
          Buffer.from(payload, "base64url").toString("utf8"),
        ) as Partial<CcManagedTokenPayload>;

        if (
          typeof parsed.agentSlug !== "string" ||
          parsed.agentSlug.length === 0 ||
          typeof parsed.serverName !== "string" ||
          parsed.serverName.length === 0 ||
          typeof parsed.issuedAt !== "number"
        ) {
          return null;
        }

        return {
          agentSlug: parsed.agentSlug,
          serverName: parsed.serverName,
          issuedAt: parsed.issuedAt,
        };
      } catch {
        return null;
      }
    },
  };
}

function encode(payload: CcManagedTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export type CcManagedMcpAuthTokenService = ReturnType<typeof createCcManagedMcpAuthTokenService>;
