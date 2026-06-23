import { describe, expect, it } from "vitest";

import type { SystemPromptRenderContext } from "../../src/system-prompts/types";
import {
  getVariableMeta,
  hasVariable,
  listVariables,
  resolveVariable,
  systemPromptVariables,
} from "../../src/system-prompts/variables";

const fullCtx: SystemPromptRenderContext = {
  appName: "CommandsCenter",
  currentDate: "2026-06-23",
  workspaceDir: "/ws",
  conversationId: "conv-1",
  specialist: { name: "Ada", slug: "ada", role: "engineer", instructions: "Be precise." },
  task: { id: "task-1", title: "Ship it", runId: "run-1" },
};

const chatCtx: SystemPromptRenderContext = {
  appName: "CommandsCenter",
  currentDate: "2026-06-23",
  workspaceDir: "/ws",
};

describe("system prompt variables", () => {
  it("resolves each scalar variable from the context", () => {
    expect(resolveVariable("APP_NAME", fullCtx)).toBe("CommandsCenter");
    expect(resolveVariable("CURRENT_DATE", fullCtx)).toBe("2026-06-23");
    expect(resolveVariable("WORKSPACE_DIR", fullCtx)).toBe("/ws");
    expect(resolveVariable("CONVERSATION_ID", fullCtx)).toBe("conv-1");
    expect(resolveVariable("SPECIALIST_NAME", fullCtx)).toBe("Ada");
    expect(resolveVariable("SPECIALIST_SLUG", fullCtx)).toBe("ada");
    expect(resolveVariable("SPECIALIST_ROLE", fullCtx)).toBe("engineer");
    expect(resolveVariable("SPECIALIST_INSTRUCTIONS", fullCtx)).toBe("Be precise.");
    expect(resolveVariable("TASK_ID", fullCtx)).toBe("task-1");
    expect(resolveVariable("TASK_TITLE", fullCtx)).toBe("Ship it");
    expect(resolveVariable("TASK_RUN_ID", fullCtx)).toBe("run-1");
  });

  it("resolves specialist/task variables to empty string when absent", () => {
    expect(resolveVariable("SPECIALIST_NAME", chatCtx)).toBe("");
    expect(resolveVariable("CONVERSATION_ID", chatCtx)).toBe("");
    expect(resolveVariable("TASK_ID", chatCtx)).toBe("");
    expect(resolveVariable("TASK_TITLE", chatCtx)).toBe("");
    expect(resolveVariable("TASK_RUN_ID", chatCtx)).toBe("");
  });

  it("renders CC_DEFAULT_TOOLS as a bulleted, prefixed list", () => {
    const rendered = resolveVariable("CC_DEFAULT_TOOLS", fullCtx);
    expect(rendered).toContain("- `cc_default_set_task_result`");
    expect(rendered).toContain("- `cc_default_add_task_artifact`");
    expect(rendered).toContain("- `cc_default_mark_needs_human_review`");
    expect(rendered?.split("\n")).toHaveLength(3);
  });

  it("returns undefined for an unknown variable", () => {
    expect(resolveVariable("NOPE", fullCtx)).toBeUndefined();
  });

  it("exposes catalog metadata helpers", () => {
    expect(hasVariable("APP_NAME")).toBe(true);
    expect(hasVariable("NOPE")).toBe(false);
    expect(getVariableMeta("APP_NAME")).toEqual({
      id: "APP_NAME",
      label: "App name",
      description: expect.any(String),
    });
    expect(getVariableMeta("NOPE")).toBeUndefined();
    expect(listVariables()).toHaveLength(Object.keys(systemPromptVariables).length);
  });
});
