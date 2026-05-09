import { randomBytes } from "node:crypto";

const CLAIM_CODE_BYTES = 24;

export function generateOwnerClaimCode(): string {
  return randomBytes(CLAIM_CODE_BYTES).toString("base64url");
}
