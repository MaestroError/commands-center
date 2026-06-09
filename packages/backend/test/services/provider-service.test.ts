import { describe, expect, it, vi } from "vitest";

import { loadRuntimeConfig } from "../../src/lib/runtime-config";
import { createProviderService } from "../../src/services/provider-service";
import type { OpenCodeService } from "../../src/services/opencode-service";

function createMockOpenCodeService(
  overrides?: Partial<{
    [K in keyof OpenCodeService]: ReturnType<typeof vi.fn>;
  }>,
): OpenCodeService {
  return {
    dispose: vi.fn(() => Promise.resolve()),
    disposeGlobal: vi.fn(() => Promise.resolve()),
    listProviders: vi.fn(() =>
      Promise.resolve({
        all: [],
        default: {},
        connected: [],
      }),
    ),
    listAuthMethods: vi.fn(() => Promise.resolve({})),
    setApiKey: vi.fn(() => Promise.resolve(true)),
    startOauth: vi.fn(() =>
      Promise.resolve({
        url: "https://provider.example/oauth",
        method: "auto",
        instructions: "Finish login.",
      }),
    ),
    completeOauth: vi.fn(() => Promise.resolve(true)),
    disconnectProvider: vi.fn(() => Promise.resolve(true)),
    ...overrides,
  } as unknown as OpenCodeService;
}

describe("createProviderService", () => {
  it("lists provider statuses and flattens connected models", async () => {
    const service = createProviderService({
      config: loadRuntimeConfig({
        cwd: "/tmp/project",
        env: { NODE_ENV: "test" },
      }),
      opencodeService: createMockOpenCodeService({
        listProviders: vi.fn(() =>
          Promise.resolve({
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
          }),
        ),
        listAuthMethods: vi.fn(() =>
          Promise.resolve({
            openai: [{ type: "oauth", label: "Browser OAuth" }],
          }),
        ),
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
      opencodeService: createMockOpenCodeService({
        listProviders: vi.fn(() =>
          Promise.resolve({
            all: [
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
            connected: ["anthropic"],
          }),
        ),
        listAuthMethods: vi.fn(() =>
          Promise.resolve({
            anthropic: [{ type: "api", label: "API key" }],
          }),
        ),
      }),
    });

    await expect(service.list()).resolves.toMatchObject([
      {
        connected: true,
        defaultModel: "anthropic/claude-sonnet-4",
      },
    ]);
  });

  it("returns pending when oauth completion is still waiting on provider confirmation", async () => {
    const service = createProviderService({
      config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
      opencodeService: createMockOpenCodeService({
        listProviders: vi.fn(() =>
          Promise.resolve({
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
          }),
        ),
        listAuthMethods: vi.fn(() =>
          Promise.resolve({
            "github-copilot": [{ type: "oauth", label: "Browser OAuth" }],
          }),
        ),
        completeOauth: vi.fn(() => Promise.reject(new Error("Request timed out"))),
      }),
    });

    await expect(service.completeOauth("github-copilot", 0)).resolves.toEqual({
      connected: false,
      pending: true,
    });
  });

  it("extracts oauth codes from pasted callback URLs", async () => {
    const completeOauth = vi.fn(() => Promise.resolve(true));
    const service = createProviderService({
      config: loadRuntimeConfig({ cwd: "/tmp/project", env: { NODE_ENV: "test" } }),
      opencodeService: createMockOpenCodeService({
        completeOauth,
        listProviders: vi.fn(() =>
          Promise.resolve({
            all: [],
            default: {},
            connected: ["openai"],
          }),
        ),
      }),
    });

    await service.completeOauth(
      "openai",
      0,
      "http://localhost:1455/auth/callback?code=oauth-code&state=oauth-state",
    );

    expect(completeOauth).toHaveBeenCalledWith(
      "/tmp/project/.cc/workspace",
      "openai",
      0,
      "oauth-code",
    );
  });
});
