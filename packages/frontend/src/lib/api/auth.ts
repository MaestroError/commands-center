import { requestJson } from "./client";

import {
  ownerAuthStatusResultSchema,
  ownerClaimInputSchema,
  ownerClaimResultSchema,
  ownerLoginInputSchema,
  ownerLoginResultSchema,
  ownerLogoutResultSchema,
  ownerPasswordChangeInputSchema,
  ownerPasswordChangeResultSchema,
  type OwnerAuthStatusResult,
  type OwnerClaimInput,
  type OwnerClaimResult,
  type OwnerLoginInput,
  type OwnerLoginResult,
  type OwnerLogoutResult,
  type OwnerPasswordChangeInput,
  type OwnerPasswordChangeResult,
} from "@cc/shared/schemas";

export async function getAuthStatus(): Promise<OwnerAuthStatusResult> {
  return requestJson<OwnerAuthStatusResult>("/api/auth/status", ownerAuthStatusResultSchema);
}

export async function claimWorkspace(input: OwnerClaimInput): Promise<OwnerClaimResult> {
  return requestJson<OwnerClaimResult>("/api/auth/claim", ownerClaimResultSchema, {
    method: "POST",
    body: ownerClaimInputSchema.parse(input),
  });
}

export async function loginOwner(input: OwnerLoginInput): Promise<OwnerLoginResult> {
  return requestJson<OwnerLoginResult>("/api/auth/login", ownerLoginResultSchema, {
    method: "POST",
    body: ownerLoginInputSchema.parse(input),
  });
}

export async function logoutOwner(): Promise<OwnerLogoutResult> {
  return requestJson<OwnerLogoutResult>("/api/auth/logout", ownerLogoutResultSchema, {
    method: "POST",
  });
}

export async function changeOwnerPassword(
  input: OwnerPasswordChangeInput,
): Promise<OwnerPasswordChangeResult> {
  return requestJson<OwnerPasswordChangeResult>(
    "/api/auth/password",
    ownerPasswordChangeResultSchema,
    {
      method: "POST",
      body: ownerPasswordChangeInputSchema.parse(input),
    },
  );
}
