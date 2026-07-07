import { describe, expect, it } from "vitest";

import { getDefinition, systemPromptDefinitions } from "../../src/system-prompts/definitions/index";
import { hasVariable } from "../../src/system-prompts/variables";

describe("system prompt definitions registry", () => {
  it("ships the expected prompts in composition order", () => {
    expect(systemPromptDefinitions.map((definition) => definition.id)).toEqual([
      "identity",
      "global-chat",
      "global-task",
      "additional",
      "mcp-instructions-notifications",
      "mcp-instructions-app",
      "mcp-instructions-specialist-management",
      "mcp-instructions-tasks-management",
    ]);
  });

  it("is sorted by composition order", () => {
    const orders = systemPromptDefinitions.map((definition) => definition.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("has unique ids", () => {
    const ids = systemPromptDefinitions.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only valid scopes", () => {
    for (const definition of systemPromptDefinitions) {
      expect(["chat", "task", "both"]).toContain(definition.scope);
    }
  });

  it("declares only variables that exist in the catalog", () => {
    for (const definition of systemPromptDefinitions) {
      for (const variable of definition.variables) {
        expect(hasVariable(variable), `${definition.id} declares unknown var ${variable}`).toBe(
          true,
        );
      }
    }
  });

  it("stores workspace paths under configuration/system-prompts and ending in .md", () => {
    for (const definition of systemPromptDefinitions) {
      expect(definition.workspaceRelativePath).toBe(
        `configuration/system-prompts/${definition.id}.md`,
      );
      expect(definition.workspaceRelativePath.endsWith(".md")).toBe(true);
    }
  });

  it("requires a non-empty default body unless the prompt is optional", () => {
    // Optional prompts may ship empty (companion prompts operators fill in) or
    // with a default body (e.g. notifications); non-optional prompts must not
    // be empty, since an empty required prompt cannot be composed or cleared.
    for (const definition of systemPromptDefinitions) {
      if (definition.defaultBody.trim().length === 0) {
        expect(definition.optional, `${definition.id} has an empty body but is not optional`).toBe(
          true,
        );
      } else {
        expect(definition.defaultBody.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps capability-controlled prompts optional (operators can clear the body)", () => {
    for (const definition of systemPromptDefinitions) {
      if (definition.capabilityControlled) {
        expect(definition.optional, `${definition.id} is capability-controlled`).toBe(true);
      }
    }
  });

  it("looks up definitions by id", () => {
    expect(getDefinition("identity")?.title).toBe("Identity");
    expect(getDefinition("nope")).toBeUndefined();
  });
});
