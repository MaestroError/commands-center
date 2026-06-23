import { describe, expect, it } from "vitest";

import { renderTemplate } from "../../src/system-prompts/render";
import type { SystemPromptRenderContext } from "../../src/system-prompts/types";

const ctx: SystemPromptRenderContext = {
  appName: "CommandsCenter",
  currentDate: "2026-06-23",
  workspaceDir: "/ws",
  conversationId: "conv-1",
  specialist: { name: "Ada", slug: "ada", role: "engineer", instructions: "Be precise." },
  task: { id: "task-1", title: "Ship it", runId: "run-1" },
};

describe("renderTemplate", () => {
  it("replaces a declared variable", () => {
    expect(renderTemplate("Hi {{ SPECIALIST_NAME }}", ctx, ["SPECIALIST_NAME"])).toBe("Hi Ada");
  });

  it("tolerates whitespace variants inside braces", () => {
    expect(renderTemplate("{{APP_NAME}}|{{  APP_NAME  }}", ctx, ["APP_NAME"])).toBe(
      "CommandsCenter|CommandsCenter",
    );
  });

  it("replaces repeated and adjacent placeholders", () => {
    expect(renderTemplate("{{ APP_NAME }}{{ APP_NAME }} {{ APP_NAME }}", ctx, ["APP_NAME"])).toBe(
      "CommandsCenterCommandsCenter CommandsCenter",
    );
  });

  it("leaves placeholders not in allowedVars intact", () => {
    expect(renderTemplate("{{ SPECIALIST_NAME }}", ctx, ["APP_NAME"])).toBe(
      "{{ SPECIALIST_NAME }}",
    );
  });

  it("leaves unknown placeholders intact", () => {
    expect(renderTemplate("{{ NOPE }}", ctx, ["NOPE"])).toBe("{{ NOPE }}");
  });

  it("renders empty for declared vars whose context slice is missing", () => {
    const chatCtx: SystemPromptRenderContext = { ...ctx, task: undefined };
    expect(renderTemplate("[{{ TASK_ID }}]", chatCtx, ["TASK_ID"])).toBe("[]");
  });

  it("ignores lowercase / malformed placeholders", () => {
    expect(renderTemplate("{{ app_name }}", ctx, ["APP_NAME"])).toBe("{{ app_name }}");
  });
});
