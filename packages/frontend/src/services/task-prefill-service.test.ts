import { describe, expect, it } from "vitest";

import type { ConversationMessage, ConversationPart } from "@cc/shared/schemas";

import { createTaskPrefillFromUserMessage, isTaskCreationPrefill } from "./task-prefill-service";

describe("createTaskPrefillFromUserMessage", () => {
  it("converts plain user text into task prompt text", () => {
    const result = createTaskPrefillFromUserMessage({
      agentId: "agent-1",
      message: makeMessage({ content: "Review the roadmap" }),
      parts: [],
    });

    expect(result.prefill).toEqual({
      agentId: "agent-1",
      prompt: {
        text: "Review the roadmap",
        mentionedFiles: [],
        mentionedAgents: [],
        selectedSkill: null,
      },
    });
  });

  it("preserves supported skill and file mentions", () => {
    const result = createTaskPrefillFromUserMessage({
      agentId: "agent-1",
      message: makeMessage({
        content: 'Use skill "review". #README.md #src/index.ts Check implementation',
      }),
      parts: [],
      skills: [{ slug: "review", description: "Review code" }],
    });

    expect(result.prefill.prompt).toEqual({
      text: "Check implementation",
      mentionedFiles: [
        { path: "README.md", filename: "README.md", kind: "file" },
        { path: "src/index.ts", filename: "index.ts", kind: "file" },
      ],
      mentionedAgents: [],
      selectedSkill: { slug: "review", description: "Review code" },
    });
  });

  it("drops unsupported skill and node_modules mentions", () => {
    const result = createTaskPrefillFromUserMessage({
      agentId: "agent-1",
      message: makeMessage({
        content: 'Use skill "missing". #node_modules/pkg/index.js #src/app.ts Check files',
      }),
      parts: [],
      skills: [{ slug: "review", description: "Review code" }],
    });

    expect(result.prefill.prompt).toEqual({
      text: "Check files",
      mentionedFiles: [{ path: "src/app.ts", filename: "app.ts", kind: "file" }],
      mentionedAgents: [],
      selectedSkill: null,
    });
  });

  it("restores a global-document mention from a #GlobalDocuments token", () => {
    const result = createTaskPrefillFromUserMessage({
      agentId: "agent-1",
      message: makeMessage({
        content: "#GlobalDocuments/design/overview.md #src/app.ts Compare them",
      }),
      parts: [],
    });

    expect(result.prefill.prompt.mentionedFiles).toEqual([
      { path: "design/overview.md", filename: "overview.md", kind: "global-document" },
      { path: "src/app.ts", filename: "app.ts", kind: "file" },
    ]);
  });

  it("detects unsupported attachments", () => {
    const result = createTaskPrefillFromUserMessage({
      agentId: "agent-1",
      message: makeMessage({
        attachments: [{ id: "att-1", type: "file", filename: "notes.txt", mimeType: "text/plain" }],
      }),
      parts: [],
    });

    expect(result.hasUnsupportedAttachments).toBe(true);
  });

  it("uses text parts before message content", () => {
    const result = createTaskPrefillFromUserMessage({
      agentId: "agent-1",
      message: makeMessage({ content: "fallback" }),
      parts: [makePart({ text: "part text" })],
    });

    expect(result.prefill.prompt.text).toBe("part text");
  });
});

describe("isTaskCreationPrefill", () => {
  it("accepts valid task creation prefill state", () => {
    expect(
      isTaskCreationPrefill({
        agentId: "agent-1",
        prompt: { text: "Run task", mentionedFiles: [], mentionedAgents: [], selectedSkill: null },
      }),
    ).toBe(true);
  });
});

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    role: "user",
    content: "hello",
    parts: [],
    attachments: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePart(overrides: Partial<ConversationPart> = {}): ConversationPart {
  return { id: "part-1", type: "text", text: "hello", ...overrides };
}
