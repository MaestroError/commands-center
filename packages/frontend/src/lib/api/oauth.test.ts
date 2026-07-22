import { afterEach, describe, expect, it, vi } from "vitest";

import { decideOAuthInteraction, getOAuthInteraction, resetOAuthRuntime } from "./oauth";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OAuth interaction API", () => {
  it("reads interaction details by UID", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        uid: "interaction_123",
        client: { id: "client-1", name: "Claude" },
        redirectUri: "http://127.0.0.1/callback",
        requestedResource: "http://localhost:3000/api/public/mcp",
        scopes: ["mcp"],
      }),
    );

    await expect(getOAuthInteraction("interaction_123")).resolves.toMatchObject({
      uid: "interaction_123",
    });
    expect(fetchSpy).toHaveBeenCalledWith("/api/oauth/interactions/interaction_123", {
      method: "GET",
    });
  });

  it("posts an approval decision in the request body", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        jsonResponse({ redirectTo: "http://localhost:3000/oauth/authorize/interaction_123" }),
      );

    await decideOAuthInteraction("interaction_123", {
      decision: "approve",
      apiToken: "cc_secret-token",
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/oauth/interactions/interaction_123", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve", apiToken: "cc_secret-token" }),
    });
  });

  it("rejects unsafe interaction UIDs before making a request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getOAuthInteraction("../interaction")).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("deletes the OAuth runtime state", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ status: "reset" }));

    await expect(resetOAuthRuntime()).resolves.toEqual({ status: "reset" });
    expect(fetchSpy).toHaveBeenCalledWith("/api/oauth/runtime", { method: "DELETE" });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
