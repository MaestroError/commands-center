import { describe, expect, it } from "vitest";

import type { Agent, AgentCatalog } from "@cc/shared/schemas";

import {
  createAgentFormFromAgent,
  createEmptyAgentForm,
  createSessionSettingsForm,
  resolveInitialModelId,
  validateAgentForm,
  validateSessionSettingsForm,
} from "./agent-form";

function makeCatalog(providerModels: Array<{ id: string; label?: string }>): AgentCatalog {
  return {
    builtInSkills: [],
    workspaceSkills: [],
    providerModels: providerModels.map((model) => ({
      id: model.id,
      label: model.label ?? model.id,
    })),
    mcpServers: [],
    appMcpServers: [],
    customTools: [],
  };
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-id",
    slug: "agent",
    name: "Agent",
    role: "do things",
    instructions: "do them well",
    defaultModel: "openai/gpt-4.1",
    iconPath: undefined,
    workspacePath: "/tmp/agents/agent",
    status: "active",
    capabilities: {
      builtInSkills: [],
      workspaceSkills: [],
      customTools: [],
      mcpServers: [],
      toolPermissions: [],
      appMcpServers: [],
      appToolPermissions: [],
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: undefined,
    ...overrides,
  };
}

describe("resolveInitialModelId", () => {
  it("returns the first catalog entry when no current model is given", () => {
    const catalog = makeCatalog([{ id: "openai/gpt-4.1" }, { id: "openai/gpt-5" }]);

    expect(resolveInitialModelId(catalog)).toBe("openai/gpt-4.1");
  });

  it("returns the current model verbatim when the catalog is empty", () => {
    const catalog = makeCatalog([]);

    expect(resolveInitialModelId(catalog, "openai/gpt-4.1")).toBe("openai/gpt-4.1");
  });

  it("returns the exact catalog id when the stored model matches", () => {
    const catalog = makeCatalog([
      { id: "openai/gpt-4.1" },
      { id: "openrouter/anthropic/claude-sonnet-4" },
    ]);

    expect(resolveInitialModelId(catalog, "openrouter/anthropic/claude-sonnet-4")).toBe(
      "openrouter/anthropic/claude-sonnet-4",
    );
  });

  it("recovers a stale openrouter model id that is missing its provider prefix", () => {
    const catalog = makeCatalog([
      { id: "openai/gpt-4.1" },
      { id: "openrouter/anthropic/claude-sonnet-4" },
    ]);

    // Stored value from a previous buggy qualifyModelId that stripped the
    // `openrouter/` prefix. The form should auto-correct it to the canonical
    // catalog id, so saving the form re-persists the qualified form.
    expect(resolveInitialModelId(catalog, "anthropic/claude-sonnet-4")).toBe(
      "openrouter/anthropic/claude-sonnet-4",
    );
  });

  it("recovers a bare model id when exactly one provider owns it", () => {
    const catalog = makeCatalog([
      { id: "openai/gpt-4.1" },
      { id: "openrouter/minimax/minimax-m3" },
    ]);

    expect(resolveInitialModelId(catalog, "minimax/minimax-m3")).toBe(
      "openrouter/minimax/minimax-m3",
    );
  });

  it("preserves the stored value when the suffix match is ambiguous", () => {
    const catalog = makeCatalog([{ id: "openai/gpt-4.1" }, { id: "openrouter/gpt-4.1" }]);

    // `gpt-4.1` is owned by both providers — must not auto-pick either.
    expect(resolveInitialModelId(catalog, "gpt-4.1")).toBe("gpt-4.1");
  });

  it("preserves the stored value when the catalog has no match", () => {
    const catalog = makeCatalog([{ id: "openai/gpt-4.1" }]);

    expect(resolveInitialModelId(catalog, "some-unknown-model")).toBe("some-unknown-model");
  });
});

describe("createAgentFormFromAgent", () => {
  it("resolves the agent's default_model through the catalog so stale values get corrected", () => {
    const catalog = makeCatalog([{ id: "openrouter/minimax/minimax-m3" }]);

    const form = createAgentFormFromAgent(
      catalog,
      makeAgent({ defaultModel: "minimax/minimax-m3" }),
    );

    expect(form.defaultModel).toBe("openrouter/minimax/minimax-m3");
  });

  it("keeps the placeholder default_model visible in the form for unconfigured agents", () => {
    const catalog = makeCatalog([{ id: "openai/gpt-4.1" }]);

    const form = createAgentFormFromAgent(
      catalog,
      makeAgent({ defaultModel: "unconfigured/model" }),
    );

    expect(form.defaultModel).toBe("unconfigured/model");
  });
});

describe("createSessionSettingsForm", () => {
  it("resolves the agent's default_model through the catalog so stale values get corrected", () => {
    const catalog = makeCatalog([{ id: "openrouter/anthropic/claude-sonnet-4" }]);

    const form = createSessionSettingsForm(
      catalog,
      makeAgent({ defaultModel: "anthropic/claude-sonnet-4" }),
    );

    expect(form.defaultModel).toBe("openrouter/anthropic/claude-sonnet-4");
  });
});

describe("validateAgentForm", () => {
  it("requires a default model when the catalog has any connected models", () => {
    const form = { ...createEmptyAgentForm(), defaultModel: " " };

    expect(
      validateAgentForm(form, { hasProviderModels: true, slugTaken: false }).defaultModel,
    ).toMatch(/required/);
  });

  it("accepts any non-empty default model when provider models are available", () => {
    const form = { ...createEmptyAgentForm(), defaultModel: "openai/gpt-4.1" };

    expect(
      validateAgentForm(form, { hasProviderModels: true, slugTaken: false }).defaultModel,
    ).toBeUndefined();
  });
});

describe("validateSessionSettingsForm", () => {
  it("requires a default model when the catalog has any connected models", () => {
    const form = { defaultModel: "", role: "r", instructions: "i" };

    expect(validateSessionSettingsForm(form, true).defaultModel).toMatch(/required/);
  });
});
