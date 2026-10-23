import { describe, expect, it } from "vitest";

import { createEmbeddedMcpService } from "../../src/opencode/embedded-mcp-service.js";

type Host = Parameters<typeof createEmbeddedMcpService>[0];

function fixture() {
  let status: "pending" | "complete" | "expired" | "failed" = "pending";
  const connected: string[] = [];
  const removed: string[] = [];
  const cancelled: string[] = [];
  const location = { directory: "/workspace" };
  const host: Host = {
    model: { list: () => Promise.resolve({ location, data: [] }) },
    readTools: () =>
      Promise.resolve([
        { id: "test_greet", name: "greet", description: "Greeting", permission: "test_greet" },
      ]),
    mcp: {
      list: () =>
        Promise.resolve({
          location,
          data: [
            {
              name: "test",
              integrationID: "mcp-test",
              status: { status: connected.length ? "connected" : "needs_auth", error: "Sign in" },
            },
          ],
        }),
      connect: ({ server }) => {
        connected.push(server);
        return Promise.resolve();
      },
      disconnect: () => Promise.resolve(),
    },
    integration: {
      get: () =>
        Promise.resolve({
          location,
          data: {
            id: "mcp-test",
            name: "Test",
            methods: [{ type: "oauth", id: "mcp-method", label: "Sign in" }],
            connections: [],
          },
        }),
      oauth: {
        connect: () =>
          Promise.resolve({
            location,
            data: {
              attemptID: "attempt-1",
              url: "https://example.com/authorize",
              mode: "auto",
              instructions: "Sign in",
              time: { created: 0, expires: 10000 },
            },
          }),
        status: () =>
          Promise.resolve({
            location,
            data:
              status === "failed"
                ? { status, message: "Denied by provider", time: { created: 0, expires: 10000 } }
                : { status, time: { created: 0, expires: 10000 } },
          }),
        complete: () => Promise.reject(new Error("MCP OAuth uses its callback listener")),
        cancel: ({ attemptID }) => {
          cancelled.push(attemptID);
          return Promise.resolve();
        },
      },
    },
    credential: {
      list: () =>
        Promise.resolve([
          {
            id: "mine",
            integrationID: "mcp-test",
            label: "MCP",
            active: true,
            value: { type: "key", key: "test-only" },
          },
          {
            id: "other",
            integrationID: "other-integration",
            label: "Other",
            active: true,
            value: { type: "key", key: "test-only" },
          },
        ]),
      remove: ({ credentialID }) => {
        removed.push(credentialID);
        return Promise.resolve();
      },
    },
  };
  return {
    host,
    service: createEmbeddedMcpService(host),
    connected,
    removed,
    cancelled,
    setStatus(value: typeof status) {
      status = value;
    },
  };
}

describe("embedded MCP OAuth lifecycle", () => {
  it("returns the integration authorization URL", async () => {
    expect(await fixture().service.startMcpAuth("/workspace", "test")).toEqual({
      authorizationUrl: "https://example.com/authorize",
    });
  });
  it("keeps a pending OAuth attempt unauthenticated", async () => {
    const { service } = fixture();
    await service.startMcpAuth("/workspace", "test");
    expect(await service.authenticateMcp("/workspace", "test")).toEqual({ status: "needs_auth" });
  });
  it("reconnects the MCP client after the callback completes", async () => {
    const setup = fixture();
    await setup.service.startMcpAuth("/workspace", "test");
    setup.setStatus("complete");
    await setup.service.authenticateMcp("/workspace", "test");
    expect(setup.connected).toEqual(["test"]);
  });
  it("reports an expired authorization attempt", async () => {
    const setup = fixture();
    await setup.service.startMcpAuth("/workspace", "test");
    setup.setStatus("expired");
    await expect(setup.service.authenticateMcp("/workspace", "test")).rejects.toThrow("expired");
  });
  it("reports an authorization failure", async () => {
    const setup = fixture();
    await setup.service.startMcpAuth("/workspace", "test");
    setup.setStatus("failed");
    await expect(setup.service.authenticateMcp("/workspace", "test")).rejects.toThrow(
      "Denied by provider",
    );
  });
  it("cancels a replaced authorization attempt", async () => {
    const setup = fixture();
    await setup.service.startMcpAuth("/workspace", "test");
    await setup.service.startMcpAuth("/workspace", "test");
    expect(setup.cancelled).toEqual(["attempt-1"]);
  });
  it("removes only credentials belonging to the selected MCP integration", async () => {
    const setup = fixture();
    await setup.service.removeMcpAuth("/workspace", "test");
    expect(setup.removed).toEqual(["mine"]);
  });
  it("cancels pending authorization before removing credentials", async () => {
    const setup = fixture();
    await setup.service.startMcpAuth("/workspace", "test");
    await setup.service.removeMcpAuth("/workspace", "test");
    expect(setup.cancelled).toEqual(["attempt-1"]);
  });
  it("rejects authentication for an unknown MCP server", async () => {
    await expect(fixture().service.startMcpAuth("/workspace", "missing")).rejects.toThrow(
      "MCP server not found",
    );
  });
});
