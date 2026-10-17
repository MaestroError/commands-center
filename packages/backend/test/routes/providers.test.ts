import Fastify from "fastify";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureFastifyZod, type AppServer } from "../../src/lib/fastify-zod.js";
import { registerProviderServiceRoutes } from "../../src/routes/providers.js";
import type { ProviderService } from "../../src/services/provider-service.js";

const servers: AppServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
function fixture() {
  const service = {
    list: vi.fn(() => Promise.resolve([])),
    listModels: vi.fn(() => Promise.resolve([])),
    setApiKey: vi.fn(() => Promise.resolve(true)),
    startOauth: vi.fn(() =>
      Promise.resolve({
        url: "https://provider.example/authorize",
        method: "auto" as const,
        instructions: "Authorize",
      }),
    ),
    completeOauth: vi.fn(() => Promise.resolve({ connected: false, pending: true })),
    disconnect: vi.fn(() => Promise.resolve(true)),
  } satisfies ProviderService;
  const server = Fastify({ loggerInstance: pino({ level: "silent" }) });
  configureFastifyZod(server);
  registerProviderServiceRoutes(server, service);
  servers.push(server);
  return { server, service };
}
describe("provider routes with injected SDK service", () => {
  it("lists provider status", async () => {
    const { server } = fixture();
    const response = await server.inject({ method: "GET", url: "/api/providers" });
    expect(response.json()).toEqual([]);
  });
  it("passes an API key to the provider service", async () => {
    const { server, service } = fixture();
    await server.inject({
      method: "PUT",
      url: "/api/providers/test/api-key",
      payload: { apiKey: "fixture-key" },
    });
    expect(service.setApiKey).toHaveBeenCalledWith("test", "fixture-key");
  });
  it("returns the authorization URL", async () => {
    const { server } = fixture();
    const response = await server.inject({
      method: "POST",
      url: "/api/providers/test/oauth/start",
      payload: { method: 0 },
    });
    expect(response.json().url).toBe("https://provider.example/authorize");
  });
  it("preserves pending OAuth status", async () => {
    const { server } = fixture();
    const response = await server.inject({
      method: "POST",
      url: "/api/providers/test/oauth/complete",
      payload: { method: 0 },
    });
    expect(response.json()).toEqual({ connected: false, pending: true });
  });
  it("disconnects the selected provider", async () => {
    const { server, service } = fixture();
    await server.inject({ method: "DELETE", url: "/api/providers/test" });
    expect(service.disconnect).toHaveBeenCalledWith("test");
  });
});
