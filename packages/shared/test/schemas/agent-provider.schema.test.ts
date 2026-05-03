import { describe, expect, it } from "vitest";

import { AGENT_STATUS } from "../../src/constants/index.js";
import {
  agentCatalogSchema,
  apiErrorCodeSchema,
  apiValidationErrorResponseSchema,
  createAgentInputSchema,
  healthResponseSchema,
  systemVersionSchema,
  updateAgentInputSchema,
} from "../../src/schemas/index.js";
import {
  providerApiKeyInputSchema,
  providerAuthPromptSchema,
  providerOauthStartInputSchema,
  providerStatusSchema,
} from "../../src/schemas/providers.js";

describe("agent and provider schemas", () => {
  it("exposes agent status constants", () => {
    expect(AGENT_STATUS).toEqual({
      ACTIVE: "active",
      ARCHIVED: "archived",
    });
  });

  it("parses create agent input with trimmed values and capability defaults", () => {
    const result = createAgentInputSchema.parse({
      name: "  Support Agent  ",
      role: "  helper  ",
      instructions: "  Be precise.  ",
      defaultModel: "  openai/gpt-5  ",
      capabilities: {},
    });

    expect(result).toEqual({
      name: "Support Agent",
      role: "helper",
      instructions: "Be precise.",
      defaultModel: "openai/gpt-5",
      customToolOverwriteSlugs: [],
      capabilities: {
        builtInSkills: [],
        workspaceSkills: [],
        customTools: [],
        mcpServers: [],
        toolPermissions: [],
        appMcpServers: [],
        appToolPermissions: [],
      },
    });
  });

  it("parses partial agent updates", () => {
    expect(updateAgentInputSchema.parse({ role: "  reviewer  " })).toEqual({
      role: "reviewer",
      customToolOverwriteSlugs: [],
    });
  });

  it("parses the agent catalog and applies nested defaults", () => {
    const result = agentCatalogSchema.parse({
      builtInSkills: [
        {
          name: "Planner",
          slug: "planner",
          description: "Plans tasks",
          category: "workflow",
          detailsMarkdown: "# Planner",
        },
      ],
      workspaceSkills: [],
      providerModels: [{ id: "gpt-5", label: "GPT-5" }],
      mcpServers: [{ name: "github", enabled: true }],
      appMcpServers: [{ name: "workspace", description: "Workspace tools" }],
      customTools: [
        {
          slug: "snapshot",
          name: "Snapshot",
          description: "",
          enabled: true,
        },
      ],
    });

    expect(result.builtInSkills[0]).toMatchObject({
      metadata: {},
      files: [],
    });
    expect(result.appMcpServers[0]).toMatchObject({
      enabledByDefault: false,
      tools: [],
    });
  });

  it("rejects unknown API error codes", () => {
    expect(() => apiErrorCodeSchema.parse("timeout")).toThrow();
  });

  it("requires invalid_request for validation error responses", () => {
    expect(
      apiValidationErrorResponseSchema.parse({
        error: {
          code: "invalid_request",
          message: "Validation failed",
          details: {
            formErrors: ["Missing required field"],
            fieldErrors: { name: ["Required"] },
          },
        },
      }),
    ).toBeTruthy();

    expect(() =>
      apiValidationErrorResponseSchema.parse({
        error: {
          code: "bad_request",
          message: "Wrong code",
          details: {
            formErrors: [],
            fieldErrors: {},
          },
        },
      }),
    ).toThrow();
  });

  it("parses provider auth prompts for text and select inputs", () => {
    expect(
      providerAuthPromptSchema.parse({
        type: "text",
        key: "apiKey",
        message: "Enter API key",
        placeholder: "sk-...",
      }),
    ).toMatchObject({ type: "text", key: "apiKey" });

    expect(
      providerAuthPromptSchema.parse({
        type: "select",
        key: "region",
        message: "Pick a region",
        options: [{ label: "US", value: "us" }],
        when: { key: "provider", op: "eq", value: "openai" },
      }),
    ).toMatchObject({ type: "select", key: "region" });
  });

  it("trims provider API keys and validates oauth start method indexes", () => {
    expect(providerApiKeyInputSchema.parse({ apiKey: "  secret  " })).toEqual({
      apiKey: "secret",
    });

    expect(providerOauthStartInputSchema.parse({ method: 0 })).toEqual({ method: 0 });
    expect(() => providerOauthStartInputSchema.parse({ method: -1 })).toThrow();
  });

  it("parses provider status payloads", () => {
    const result = providerStatusSchema.parse({
      provider: {
        id: "openai",
        name: "OpenAI",
        source: "config",
        env: [],
        models: {},
      },
      connected: true,
      defaultModel: "gpt-5",
      authMethods: [{ type: "oauth", label: "OAuth" }],
      models: [{ id: "gpt-5", name: "GPT-5", providerId: "openai" }],
    });

    expect(result.connected).toBe(true);
    expect(result.models[0]?.providerId).toBe("openai");
  });

  it("parses health responses and system version payloads", () => {
    expect(
      healthResponseSchema.parse({
        status: "ok",
        workspaceDir: "/workspace/.cc/workspace",
        database: {
          dialect: "sqlite",
          sqlitePath: "/workspace/.cc/local.db",
        },
        opencode: {
          state: "healthy",
          healthy: true,
          url: "http://127.0.0.1:4096",
          workspaceDir: "/workspace/.cc/workspace",
          restartCount: 0,
          maxRestarts: 3,
        },
        scheduler: {
          state: "running",
          healthy: true,
          driver: "bree",
        },
      }),
    ).toBeTruthy();

    expect(
      systemVersionSchema.parse({
        current: "0.1.0",
        latest: "0.1.1",
        updateAvailable: true,
        installMode: "npm-global",
        autoUpdateEnabled: false,
        autoUpdateSource: "settings",
      }),
    ).toMatchObject({ installMode: "npm-global", updateAvailable: true });
  });
});
