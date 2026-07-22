import {
  oauthInteractionDecisionSchema,
  oauthInteractionDetailSchema,
  oauthInteractionResultSchema,
  oauthInteractionUidSchema,
  oauthRuntimeResetResultSchema,
  type OAuthInteractionDecision,
  type OAuthInteractionDetail,
  type OAuthInteractionResult,
  type OAuthRuntimeResetResult,
} from "@cc/shared/schemas";

import { requestJson } from "./client";

export async function getOAuthInteraction(uid: string): Promise<OAuthInteractionDetail> {
  const validatedUid = oauthInteractionUidSchema.parse(uid);
  return requestJson(
    `/api/oauth/interactions/${encodeURIComponent(validatedUid)}`,
    oauthInteractionDetailSchema,
  );
}

export async function decideOAuthInteraction(
  uid: string,
  decision: OAuthInteractionDecision,
): Promise<OAuthInteractionResult> {
  const validatedUid = oauthInteractionUidSchema.parse(uid);
  return requestJson(
    `/api/oauth/interactions/${encodeURIComponent(validatedUid)}`,
    oauthInteractionResultSchema,
    {
      method: "POST",
      body: oauthInteractionDecisionSchema.parse(decision),
    },
  );
}

export async function resetOAuthRuntime(): Promise<OAuthRuntimeResetResult> {
  return requestJson("/api/oauth/runtime", oauthRuntimeResetResultSchema, { method: "DELETE" });
}
