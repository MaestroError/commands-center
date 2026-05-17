import { randomBytes } from "node:crypto";

import type { ClaimCodeState } from "./auth-state-store.js";

const CLAIM_CODE_BYTES = 24;

export function generateOwnerClaimCode(): string {
  return randomBytes(CLAIM_CODE_BYTES).toString("base64url");
}

export function isActiveClaimCode(code: ClaimCodeState | undefined): boolean {
  if (!code || code.invalidatedAt) {
    return false;
  }

  if (code.expiresAt && new Date(code.expiresAt).getTime() <= Date.now()) {
    return false;
  }

  return true;
}
