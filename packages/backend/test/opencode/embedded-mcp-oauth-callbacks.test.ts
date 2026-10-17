import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmbeddedMcpOAuthCallbacks,
  type EmbeddedMcpOAuthCallbacks,
} from "../../src/opencode/embedded-mcp-oauth-callbacks.js";

describe("MCP OAuth callback attempt boundaries", () => {
  let callbacks: EmbeddedMcpOAuthCallbacks;
  let authorization: URL;
  beforeEach(async () => {
    callbacks = createEmbeddedMcpOAuthCallbacks("https://cc.example.test");
    const config = await callbacks.configure("server");
    authorization = new URL("https://provider.example.test/authorize");
    authorization.searchParams.set("redirect_uri", config.redirect_uri);
    authorization.searchParams.set("state", "test-state");
  });
  afterEach(() => {
    callbacks.dispose();
    vi.restoreAllMocks();
  });
  const query = { state: "test-state", code: "test-code" };

  it("rejects expired state before contacting the private listener", async () => {
    const now = Date.now();
    callbacks.track(authorization.toString(), now + 10000, () => Promise.resolve(true));
    vi.spyOn(Date, "now").mockReturnValue(now + 10001);
    await expect(callbacks.complete("server", query)).rejects.toThrow("expired");
  });
  it("revokes a cancelled attempt", async () => {
    const revoke = callbacks.track(authorization.toString(), Date.now() + 10000, () =>
      Promise.resolve(true),
    );
    revoke();
    await expect(callbacks.complete("server", query)).rejects.toThrow("expired");
  });
  it("checks that the SDK attempt is still pending", async () => {
    callbacks.track(authorization.toString(), Date.now() + 10000, () => Promise.resolve(false));
    await expect(callbacks.complete("server", query)).rejects.toThrow("no longer pending");
  });
  it("rejects an unregistered redirect destination", () => {
    authorization.searchParams.set("redirect_uri", "http://127.0.0.1:1234/arbitrary");
    expect(() =>
      callbacks.track(authorization.toString(), Date.now() + 10000, () => Promise.resolve(true)),
    ).toThrow("configuration");
  });
  it("rejects missing state when tracking authorization", () => {
    authorization.searchParams.delete("state");
    expect(() =>
      callbacks.track(authorization.toString(), Date.now() + 10000, () => Promise.resolve(true)),
    ).toThrow("configuration");
  });
  it("rejects callbacks with no code or error", async () => {
    callbacks.track(authorization.toString(), Date.now() + 10000, () => Promise.resolve(true));
    await expect(callbacks.complete("server", { state: "test-state" })).rejects.toThrow(
      "Missing OAuth",
    );
  });
  it("revokes attempts on shutdown", async () => {
    callbacks.track(authorization.toString(), Date.now() + 10000, () => Promise.resolve(true));
    callbacks.dispose();
    await expect(callbacks.complete("server", query)).rejects.toThrow("expired");
  });
  it("refuses configuration after shutdown", async () => {
    callbacks.dispose();
    await expect(callbacks.configure("another")).rejects.toThrow("closed");
  });
  it("keeps the callback port stable for repeated configuration renders", async () => {
    expect(await callbacks.configure("server")).toEqual(await callbacks.configure("server"));
  });
});
