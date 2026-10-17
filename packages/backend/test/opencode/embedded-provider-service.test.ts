import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Fastify from "fastify";
import pino from "pino";

import { configureFastifyZod } from "../../src/lib/fastify-zod.js";
import { registerProviderServiceRoutes } from "../../src/routes/providers.js";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createEmbeddedOpenCodeHost,
  type EmbeddedOpenCodeHost,
} from "../../src/opencode/embedded-host.js";
import { createEmbeddedProviderService } from "../../src/opencode/embedded-provider-service.js";
import { renderEmbeddedWorkspace } from "../../src/opencode/embedded-workspace-config.js";
import {
  writeOpenCodeWorkspace,
  type OpenCodeWorkspaceInput,
} from "../../src/opencode/workspace-contract.js";

const specialist: OpenCodeWorkspaceInput = {
  name: "Research",
  role: "Researcher",
  instructions: "Use specialist instructions.",
  defaultModel: "test/test",
  capabilities: { toolPermissions: [{ pattern: "shell", action: "deny" }] },
};

describe("embedded provider configuration", () => {
  const originalEnv = { ...process.env };
  let workspace: string;
  let host: EmbeddedOpenCodeHost;
  const openHost = () =>
    createEmbeddedOpenCodeHost({
      workspaceDirectory: workspace,
      sdkOptions: { models: { fetch: false }, fs: { filewatcher: false, fff: false } },
    });
  beforeAll(async () => {
    workspace = await realpath(await mkdtemp(join(tmpdir(), "cc-v2-providers-")));
    process.env["OPENCODE_TEST_HOME"] = workspace;
    delete process.env["OPENAI_API_KEY"];
    const configuration = join(workspace, ".cc/opencode-v2/config/opencode");
    await mkdir(configuration, { recursive: true });
    await writeFile(
      join(configuration, "opencode.json"),
      JSON.stringify({
        model: "test/test",
        providers: {
          test: {
            package: "@opencode/ai/providers/openai-compatible",
            settings: { apiKey: "test-only", baseURL: "http://127.0.0.1:1" },
            models: { test: {} },
          },
        },
      }),
    );
    await writeOpenCodeWorkspace({
      workspacePath: join(workspace, "specialist"),
      input: specialist,
      skillRoot: join(workspace, "skills"),
      workspaceSkillRoot: join(workspace, "skills"),
      render: (input) =>
        renderEmbeddedWorkspace(input, {
          disabled_test: { type: "local", command: ["unused-mcp-test"] },
        }),
    });
    host = await openHost();
  }, 30000);
  afterAll(async () => {
    await host?.close();
    await rm(workspace, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  });

  it("lists a configured model through CC's provider contract", async () => {
    const providers = await createEmbeddedProviderService(host, workspace).list();
    expect(providers.find((provider) => provider.provider.id === "test")).toMatchObject({
      connected: true,
      defaultModel: "test",
      models: [{ id: "test", providerId: "test" }],
    });
  });

  it("exposes native OAuth methods through CC's provider controls", async () => {
    const providers = await createEmbeddedProviderService(host, workspace).list();
    expect(providers.find((provider) => provider.provider.id === "openai")?.authMethods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "oauth" }),
        expect.objectContaining({ type: "api" }),
      ]),
    );
  });

  it("persists an API key across embedded host restart", async () => {
    await createEmbeddedProviderService(host, workspace).setApiKey("openai", "cc-test-key");
    await host.close();
    host = await openHost();
    const entries = await host.credential.list();
    try {
      expect(entries.some((entry) => entry.integrationID === "openai" && entry.active)).toBe(true);
    } finally {
      await createEmbeddedProviderService(host, workspace).disconnect("openai");
    }
  }, 30000);

  it("removes provider credentials through the SDK", async () => {
    const service = createEmbeddedProviderService(host, workspace);
    await service.setApiKey("openai", "cc-test-key");
    await service.disconnect("openai");
    expect(
      (await host.credential.list()).filter((entry) => entry.integrationID === "openai"),
    ).toEqual([]);
  });

  it("loads generated specialist permissions in the installed SDK", async () => {
    const config = await host.config.get({
      location: { directory: join(workspace, "specialist") },
    });
    expect(
      config.flatMap((entry) => (entry.type === "document" ? (entry.info.permissions ?? []) : [])),
    ).toContainEqual({ action: "shell", resource: "*", effect: "deny" });
  });

  it("loads the generated provider timeout in the installed SDK", async () => {
    const config = await host.config.get({
      location: { directory: join(workspace, "specialist") },
    });
    expect(
      config.some(
        (entry) =>
          entry.type === "document" &&
          entry.info.providers?.["openai"]?.settings?.["headerTimeout"] === 60000,
      ),
    ).toBe(true);
  });

  it("loads native MCP server definitions in the installed SDK", async () => {
    const config = await host.config.get({
      location: { directory: join(workspace, "specialist") },
    });
    expect(
      config.some(
        (entry) =>
          entry.type === "document" &&
          entry.info.mcp?.servers?.["disabled_test"]?.disabled === true,
      ),
    ).toBe(true);
  });

  it("rejects disconnecting an environment-authenticated provider", async () => {
    const integration = await host.integration.get({
      location: { directory: workspace },
      integrationID: "openai",
    });
    const service = createEmbeddedProviderService(
      {
        ...host,
        integration: {
          ...host.integration,
          get: () =>
            Promise.resolve({
              ...integration,
              data: { ...integration.data, connections: [{ type: "env", name: "OPENAI_API_KEY" }] },
            }),
        },
      },
      workspace,
    );
    await expect(service.disconnect("openai")).rejects.toThrow("environment credentials");
  });

  it("serves the embedded catalog through CC's provider HTTP route", async () => {
    const server = Fastify({ loggerInstance: pino({ level: "silent" }) });
    configureFastifyZod(server);
    registerProviderServiceRoutes(server, createEmbeddedProviderService(host, workspace));
    try {
      const response = await server.inject({ method: "GET", url: "/api/providers" });
      expect(response.json()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provider: expect.objectContaining({ id: "test" }) }),
        ]),
      );
    } finally {
      await server.close();
    }
  });

  it("refreshes available models after saving a key", async () => {
    const service = createEmbeddedProviderService(host, workspace);
    await service.setApiKey("openai", "cc-test-key");
    try {
      expect((await service.listModels()).some((model) => model.providerId === "openai")).toBe(
        true,
      );
    } finally {
      await service.disconnect("openai");
    }
  });

  it("removes disconnected providers from the model picker", async () => {
    const service = createEmbeddedProviderService(host, workspace);
    await service.setApiKey("openai", "cc-test-key");
    await service.disconnect("openai");
    expect((await service.listModels()).some((model) => model.providerId === "openai")).toBe(false);
  });

  async function oauthService(mode: "auto" | "code" = "auto") {
    const integration = await host.integration.get({
      location: { directory: workspace },
      integrationID: "openai",
    });
    let status: "pending" | "complete" | "failed" | "expired" = "pending";
    const completed: string[] = [];
    const cancelled: string[] = [];
    const connected: string[] = [];
    const sdk = {
      ...host,
      integration: {
        ...host.integration,
        get: () =>
          Promise.resolve({
            ...integration,
            data: {
              ...integration.data,
              methods: [{ type: "oauth" as const, id: "browser", label: "Browser" }],
            },
          }),
        oauth: {
          ...host.integration.oauth,
          connect: (input: Parameters<typeof host.integration.oauth.connect>[0]) => {
            connected.push(input.methodID);
            return Promise.resolve({
              location: integration.location,
              data: {
                attemptID: `attempt-${connected.length}`,
                url: "https://example.com/auth",
                mode,
                instructions: "Authorize",
                time: { created: 0, expires: 9999999999999 },
              },
            });
          },
          status: () =>
            Promise.resolve({
              location: integration.location,
              data:
                status === "failed"
                  ? {
                      status,
                      message: "Access denied",
                      time: { created: 0, expires: 9999999999999 },
                    }
                  : { status, time: { created: 0, expires: 9999999999999 } },
            }),
          complete: (input: Parameters<typeof host.integration.oauth.complete>[0]) => {
            completed.push(input.code ?? "");
            status = "complete";
            return Promise.resolve();
          },
          cancel: (input: Parameters<typeof host.integration.oauth.cancel>[0]) => {
            cancelled.push(input.attemptID);
            return Promise.resolve();
          },
        },
      },
    };
    return {
      service: createEmbeddedProviderService(sdk, workspace),
      completed,
      cancelled,
      connected,
      setStatus(value: typeof status) {
        status = value;
      },
    };
  }

  it("maps the displayed method index to the SDK method ID", async () => {
    const fixture = await oauthService();
    await fixture.service.startOauth("openai", 0);
    expect(fixture.connected).toEqual(["browser"]);
  });
  it("reports pending browser authorization without waiting for a callback", async () => {
    const { service } = await oauthService();
    await service.startOauth("openai", 0);
    expect(await service.completeOauth("openai", 0)).toEqual({ connected: false, pending: true });
  });
  it("extracts a pasted callback code for code-mode authorization", async () => {
    const { service, completed } = await oauthService("code");
    await service.startOauth("openai", 0);
    await service.completeOauth("openai", 0, "https://example.com/callback?code=abc");
    expect(completed).toEqual(["abc"]);
  });
  it("reports completed browser authorization", async () => {
    const fixture = await oauthService();
    await fixture.service.startOauth("openai", 0);
    fixture.setStatus("complete");
    expect(await fixture.service.completeOauth("openai", 0)).toMatchObject({
      connected: true,
      pending: false,
    });
  });
  it("surfaces failed authorization", async () => {
    const fixture = await oauthService();
    await fixture.service.startOauth("openai", 0);
    fixture.setStatus("failed");
    await expect(fixture.service.completeOauth("openai", 0)).rejects.toThrow("Access denied");
  });
  it("surfaces expired authorization", async () => {
    const fixture = await oauthService();
    await fixture.service.startOauth("openai", 0);
    fixture.setStatus("expired");
    await expect(fixture.service.completeOauth("openai", 0)).rejects.toThrow("expired");
  });
  it("cancels the previous attempt when authorization is restarted", async () => {
    const { service, cancelled } = await oauthService();
    await service.startOauth("openai", 0);
    await service.startOauth("openai", 0);
    expect(cancelled).toEqual(["attempt-1"]);
  });
  it("rejects authorization completion after CC lost the attempt", async () => {
    const { service } = await oauthService();
    await expect(service.completeOauth("openai", 0)).rejects.toThrow(
      "Start provider authorization again",
    );
  });
  it("rejects an unavailable OAuth method", async () => {
    const { service } = await oauthService();
    await expect(service.startOauth("openai", 99)).rejects.toThrow("OAuth method not found");
  });
});
