import { describe, expect, it } from "vitest";

import { extractMediaItems, mapRemoteMessage } from "../../src/lib/message-mapper.js";
import {
  mapEmbeddedMessage,
  type EmbeddedMessage,
} from "../../src/opencode/embedded-message-mapper.js";

const assistant = {
  type: "assistant",
  id: "message",
  agent: "build",
  model: { providerID: "test", id: "test" },
  time: { created: 1000, completed: 2000 },
  content: [],
} satisfies EmbeddedMessage;

describe("embedded message mapping", () => {
  it("keeps reasoning and text part identities stable for streaming", () => {
    const message = mapEmbeddedMessage("session", {
      ...assistant,
      content: [
        { type: "reasoning", text: "Thinking" },
        { type: "text", text: "Answer" },
      ],
    });
    expect(message?.parts).toEqual([
      { id: "message:reasoning:0", type: "reasoning", text: "Thinking" },
      { id: "message:text:0", type: "text", text: "Answer" },
    ]);
  });

  it("maps provider failures into CC message errors", () => {
    const message = mapEmbeddedMessage("session", {
      ...assistant,
      error: { type: "RateLimitError", message: "Try later", status: 429 },
    });
    if (!message) throw new Error("Missing message");
    expect(mapRemoteMessage("conversation", message).error).toMatchObject({
      name: "RateLimitError",
      message: "Try later",
      data: { statusCode: 429 },
    });
  });

  it("keeps tool call identifiers for approval links", () => {
    const message = mapEmbeddedMessage("session", {
      ...assistant,
      content: [
        {
          type: "tool",
          id: "call",
          name: "shell",
          time: { created: 1000 },
          state: { status: "running", input: { command: "pwd" }, metadata: {} },
        },
      ],
    });
    expect(message?.parts[0]).toMatchObject({
      type: "tool",
      callID: "call",
      tool: "shell",
      state: { status: "running", input: { command: "pwd" } },
    });
  });

  it("keeps tool media downloadable while sanitizing chat snapshots", () => {
    const message = mapEmbeddedMessage("session", {
      ...assistant,
      content: [
        {
          type: "tool",
          id: "call",
          name: "image",
          time: { created: 1000, completed: 2000 },
          state: {
            status: "completed",
            input: {},
            content: [
              { type: "text", text: "Generated image" },
              {
                type: "file",
                mime: "image/png",
                name: "image.png",
                uri: "data:image/png;base64,AAAA",
              },
            ],
          },
        },
      ],
    });
    if (!message) throw new Error("Missing message");
    expect(JSON.stringify(mapRemoteMessage("conversation", message))).not.toContain("AAAA");
    expect(JSON.stringify(extractMediaItems([message]))).toContain("AAAA");
  });

  it("maps failed tool execution", () => {
    const message = mapEmbeddedMessage("session", {
      ...assistant,
      content: [
        {
          type: "tool",
          id: "call",
          name: "read",
          time: { created: 1000, completed: 2000 },
          state: {
            status: "error",
            input: {},
            error: { type: "ToolError", message: "File missing" },
          },
        },
      ],
    });
    expect(message?.parts[0]).toMatchObject({ state: { status: "error", error: "File missing" } });
  });

  it("maps shell output into the existing tool presentation", () => {
    const message = mapEmbeddedMessage("session", {
      type: "shell",
      id: "message",
      shellID: "shell",
      command: "pwd",
      status: "exited",
      exit: 0,
      time: { created: 1000, completed: 2000 },
      output: { output: "/workspace", cursor: 1, size: 10, truncated: false },
    });
    expect(message?.parts[0]).toMatchObject({
      tool: "bash",
      state: { status: "completed", output: "/workspace" },
    });
  });

  it("includes completed compaction summaries", () => {
    const message = mapEmbeddedMessage("session", {
      type: "compaction",
      id: "summary",
      time: { created: 1000 },
      status: "completed",
      reason: "manual",
      summary: "Work so far",
      recent: "",
    });
    expect(message?.parts[0]).toMatchObject({ type: "text", text: "Work so far" });
  });

  it("does not expose internal model-selection records as chat messages", () => {
    expect(
      mapEmbeddedMessage("session", {
        type: "model-switched",
        id: "internal",
        time: { created: 1000 },
        model: { providerID: "test", id: "test" },
      }),
    ).toBeUndefined();
  });

  it("surfaces a failed compaction as a chat error", () => {
    const message = mapEmbeddedMessage("session", {
      type: "compaction",
      id: "summary",
      time: { created: 1000 },
      status: "failed",
      reason: "manual",
      error: { type: "compaction.failed", message: "Summary could not be produced" },
    });
    expect(message?.info["error"]).toEqual({
      name: "compaction.failed",
      message: "Summary could not be produced",
    });
  });
});
