import { describe, expect, it } from "vitest";
import {
  specialistCatalogSchema,
  specialistSchema,
  updateSpecialistInputSchema,
} from "@cc/shared/schemas";
import { createSpecialistFormFromSpecialist } from "./specialist-form";

describe("existing specialist form", () => {
  it("preserves MCP tool denials when reopening and saving a name change", () => {
    const specialist = specialistSchema.parse({
      id: "agent",
      slug: "agent",
      name: "Agent",
      role: "Test",
      instructions: "Test",
      defaultModel: "test/model",
      workspacePath: "/tmp/agent",
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      capabilities: {
        mcpServers: [{ name: "mail", enabled: true, action: "allow" }],
        mcpToolPermissions: [{ server: "mail", tool: "send", action: "deny" }],
      },
    });
    const catalog = specialistCatalogSchema.parse({
      builtInSkills: [],
      workspaceSkills: [],
      providerModels: [],
      mcpServers: [],
      customTools: [],
      appMcpServers: [],
    });
    const form = createSpecialistFormFromSpecialist(catalog, specialist);
    const saved = updateSpecialistInputSchema.parse({
      name: "Renamed",
      capabilities: form.capabilities,
    });
    expect(saved.capabilities?.mcpToolPermissions).toEqual([
      { server: "mail", tool: "send", action: "deny" },
    ]);
  });
});
