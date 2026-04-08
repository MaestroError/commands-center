import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import type { WorkspaceRequestInit } from "../../src/orchestrator/opencode-orchestrator";
import { createProviderService } from "../../src/services/provider-service";

describe("createProviderService", () => {
  it("lists provider statuses and flattens connected models", async () => {
    const service = createProviderService({
      config: loadRuntimeConfig({
        cwd: "/tmp/project",
        env: { NODE_ENV: "test" },
      }),
      orchestrator: createOrchestrator({
        "/provider": {
          all: [
            {
              id: "openai",
              name: "OpenAI",
              source: "api",
              env: ["OPENAI_API_KEY"],
              models: {
                "openai/gpt-4.1": { name: "GPT-4.1" },
              },
            },
          ],
          default: { openai: "openai/gpt-4.1" },
          connected: ["openai"],
        },
        "/provider/auth": {
          openai: [{ type: "oauth", label: "Browser OAuth" }],
        },
      }),
    });

    await expect(service.list()).resolves.toEqual([
      {
        provider: {
          id: "openai",
          name: "OpenAI",
          source: "api",
          env: ["OPENAI_API_KEY"],
          models: {
            "openai/gpt-4.1": { name: "GPT-4.1" },
          },
        },
        connected: true,
        defaultModel: "openai/gpt-4.1",
        authMethods: [
          { type: "oauth", label: "Browser OAuth" },
          { type: "api", label: "API key" },
        ],
        models: [
          {
            id: "openai/gpt-4.1",
            name: "GPT-4.1",
            providerId: "openai",
          },
        ],
      },
    ]);
    await expect(service.listModels()).resolves.toEqual([
      {
        id: "openai/gpt-4.1",
        name: "GPT-4.1",
        providerId: "openai",
      },
    ]);
  });

  it("falls back to config providers when provider listing fails", async () => {
    const service = createProviderService({
      config: loadRuntimeConfig({
        cwd: "/tmp/project",
        env: { NODE_ENV: "test" },
      }),
      orchestrator: createOrchestrator(
        {
          "/config/providers": {
            providers: [
              {
                id: "anthropic",
                name: "Anthropic",
                source: "api",
                env: [],
                models: {
                  "anthropic/claude-sonnet-4": { name: "Claude Sonnet 4" },
                },
              },
            ],
            default: { anthropic: "anthropic/claude-sonnet-4" },
          },
          "/provider/auth": {
            anthropic: [{ type: "api", label: "API key" }],
          },
        },
        ["/provider"],
      ),
    });

    await expect(service.list()).resolves.toMatchObject([
      {
        connected: true,
        defaultModel: "anthropic/claude-sonnet-4",
      },
    ]);
  });

  it("uses provider auth timeout for connect flows", async () => {
    const calls: Array<{ path: string; timeoutMs?: number }> = [];
    const config = loadRuntimeConfig({
      cwd: "/tmp/project",
      env: {
        NODE_ENV: "test",
        CC_PROVIDER_AUTH_TIMEOUT_MS: "1234",
      },
    });
    const service = createProviderService({
      config,
      orchestrator: {
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
        restart: () => Promise.resolve(),
        refreshHealth: () => Promise.resolve(true),
        getStatus: () => ({
          state: "healthy",
          healthy: true,
          url: "http://127.0.0.1:4096",
          workspaceDir: config.paths.workspaceDir,
          restartCount: 0,
          maxRestarts: 3,
        }),
        createWorkspaceClient: () => ({
          request: <T>(path: string, init?: WorkspaceRequestInit) => {
            calls.push({ path, timeoutMs: init?.timeoutMs });

            if (path === "/provider/openai/oauth/authorize") {
              return Promise.resolve({
                url: "https://provider.example/oauth",
                method: "auto",
                instructions: "Finish login.",
              } as T);
            }

            if (path === "/provider") {
              return Promise.resolve({
                all: [
                  {
                    id: "openai",
                    name: "OpenAI",
                    source: "api",
                    env: ["OPENAI_API_KEY"],
                    models: {
                      "openai/gpt-4.1": { name: "GPT-4.1" },
                    },
                  },
                ],
                default: { openai: "openai/gpt-4.1" },
                connected: ["openai"],
              } as T);
            }

            return Promise.resolve(true as T);
          },
          getPath: () => Promise.reject(new Error("not used")),
          disposeInstance: () => Promise.resolve(true),
        }),
        disposeWorkspace: () => Promise.resolve(true),
      },
    });

    await service.setApiKey("openai", "secret");
    await service.startOauth("openai", 1);
    await service.completeOauth("openai", 1);
    await service.disconnect("openai");

    expect(calls).toEqual([
      { path: "/auth/openai", timeoutMs: 1234 },
      { path: "/provider/openai/oauth/authorize", timeoutMs: 1234 },
      { path: "/provider/openai/oauth/callback", timeoutMs: 1234 },
      { path: "/provider", timeoutMs: undefined },
      { path: "/auth/openai", timeoutMs: 1234 },
    ]);
  });

  it("returns pending when oauth completion is still waiting on provider confirmation", async () => {
    const pendingOrchestrator = {
      ...createOrchestrator({
        "/provider": {
          all: [
            {
              id: "github-copilot",
              name: "GitHub Copilot",
              source: "api",
              env: [],
              models: {},
            },
          ],
          default: {},
          connected: [],
        },
        "/provider/auth": {
          "github-copilot": [{ type: "oauth", label: "Browser OAuth" }],
        },
      }),
    };
    pendingOrchestrator.createWorkspaceClient = () => ({
      request: <T>(path: string) => {
        if (path === "/provider/github-copilot/oauth/callback") {
          return Promise.reject(new Error("Request timed out"));
        }

        if (path === "/provider") {
          return Promise.resolve({
            all: [
              {
                id: "github-copilot",
                name: "GitHub Copilot",
                source: "api",
                env: [],
                models: {},
              },
            ],
            default: {},
            connected: [],
          } as T);
        }

        if (path === "/provider/auth") {
          return Promise.resolve({
            "github-copilot": [{ type: "oauth", label: "Browser OAuth" }],
          } as T);
        }

        return Promise.resolve(true as T);
      },
      getPath: () => Promise.reject(new Error("not used")),
      disposeInstance: () => Promise.resolve(true),
    });

    const pendingService = createProviderService({
      config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
      orchestrator: pendingOrchestrator,
    });

    await expect(pendingService.completeOauth("github-copilot", 0)).resolves.toEqual({
      connected: false,
      pending: true,
    });
  });
});

function createOrchestrator(responses: Record<string, unknown>, failures: string[] = []) {
  return {
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    refreshHealth: () => Promise.resolve(true),
    getStatus: () => ({
      state: "healthy" as const,
      healthy: true,
      url: "http://127.0.0.1:4096",
      workspaceDir: "/tmp/workspace",
      restartCount: 0,
      maxRestarts: 3,
    }),
    createWorkspaceClient: () => ({
      request: <T>(path: string) => {
        if (failures.includes(path)) {
          return Promise.reject(new Error(`boom: ${path}`));
        }

        return Promise.resolve(responses[path] as T);
      },
      getPath: () => Promise.reject(new Error("not used")),
      disposeInstance: () => Promise.resolve(true),
    }),
    disposeWorkspace: vi.fn(() => Promise.resolve(true)),
  };
}
