import { describe, expect, it } from "vitest";

import { buildTaskPromptText, createTaskPromptValue } from "./task-prompt";

describe("buildTaskPromptText", () => {
  it("prepends workspace file mentions as #path tokens", () => {
    const text = buildTaskPromptText({
      ...createTaskPromptValue("Review this"),
      mentionedFiles: [{ path: "src/app.ts", filename: "app.ts", kind: "file" }],
    });

    expect(text).toBe("#src/app.ts Review this");
  });

  it("emits the absolute fullPath for global-document mentions", () => {
    const text = buildTaskPromptText({
      ...createTaskPromptValue("Summarize"),
      mentionedFiles: [
        {
          path: "design/overview.md",
          filename: "Architecture",
          kind: "global-document",
          fullPath: "/workspace/Documents/design/overview.md",
        },
      ],
    });

    expect(text).toBe("#/workspace/Documents/design/overview.md Summarize");
  });

  it("combines a skill, mixed mentions, and text in order", () => {
    const text = buildTaskPromptText({
      text: "Compare them",
      mentionedFiles: [
        { path: "src/app.ts", filename: "app.ts", kind: "file" },
        {
          path: "design/overview.md",
          filename: "Architecture",
          kind: "global-document",
          fullPath: "/workspace/Documents/design/overview.md",
        },
      ],
      mentionedAgents: [],
      selectedSkill: { slug: "review" },
    });

    expect(text).toBe(
      'Use skill "review". #src/app.ts #/workspace/Documents/design/overview.md Compare them',
    );
  });
});
