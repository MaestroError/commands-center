import { describe, expect, it } from "vitest";

import {
  oauthInteractionDecisionSchema,
  oauthInteractionDetailSchema,
  oauthInteractionUidSchema,
  oauthRuntimeResetResultSchema,
} from "../../src/schemas/oauth-interactions";

describe("OAuth interaction schemas", () => {
  it("accepts an opaque interaction UID", () => {
    expect(oauthInteractionUidSchema.parse("interaction_123-ABC")).toBe("interaction_123-ABC");
  });

  it("rejects a path-bearing interaction UID", () => {
    expect(oauthInteractionUidSchema.safeParse("../interaction").success).toBe(false);
  });

  it("trims an approval API token", () => {
    expect(
      oauthInteractionDecisionSchema.parse({ decision: "approve", apiToken: "  cc_token  " }),
    ).toEqual({ decision: "approve", apiToken: "cc_token" });
  });

  it("accepts denial without an API token", () => {
    expect(oauthInteractionDecisionSchema.parse({ decision: "deny" })).toEqual({
      decision: "deny",
    });
  });

  it("rejects secret fields in interaction details", () => {
    expect(
      oauthInteractionDetailSchema.safeParse({
        uid: "interaction_123",
        client: { id: "client-1", name: "Claude" },
        redirectUri: "http://127.0.0.1/callback",
        requestedResource: "http://localhost:3000/api/public/mcp",
        scopes: ["mcp"],
        apiToken: "cc_secret",
      }).success,
    ).toBe(false);
  });

  it("accepts the OAuth runtime reset result", () => {
    expect(oauthRuntimeResetResultSchema.parse({ status: "reset" })).toEqual({ status: "reset" });
  });
});
