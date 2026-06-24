import { describe, expect, it } from "vitest";

import { getDefinition, systemPromptDefinitions } from "../../src/system-prompts/definitions/index";
import { hasVariable } from "../../src/system-prompts/variables";

describe("system prompt definitions registry", () => {
  it("ships the four expected prompts", () => {
    expect(systemPromptDefinitions.map((definition) => definition.id)).toEqual([
      "identity",
      "global-chat",
      "global-task",
      "additional",
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

  it("marks only the optional prompt with an empty default body", () => {
    for (const definition of systemPromptDefinitions) {
      if (definition.optional) {
        expect(definition.defaultBody).toBe("");
      } else {
        expect(definition.defaultBody.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("looks up definitions by id", () => {
    expect(getDefinition("identity")?.title).toBe("Identity");
    expect(getDefinition("nope")).toBeUndefined();
  });
});
