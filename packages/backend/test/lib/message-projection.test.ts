import { describe, expect, it } from "vitest";

import type { ConversationPart } from "@cc/shared/schemas";

import {
  projectPartForList,
  projectPartsForList,
  TOOL_TEXT_PREVIEW_LIMIT,
} from "../../src/lib/message-projection";

function toolPart(state: Record<string, unknown>, tool = "read"): ConversationPart {
  return { id: "p1", type: "tool", tool, callID: "c1", state } as ConversationPart;
}

describe("projectPartForList", () => {
  it("drops tool metadata, which nothing but the question tool renders", () => {
    const projected = projectPartForList(
      toolPart({ status: "completed", output: "ok", metadata: { huge: "x".repeat(50_000) } }),
    );

    expect((projected["state"] as Record<string, unknown>)["metadata"]).toBeUndefined();
    expect((projected["state"] as Record<string, unknown>)["output"]).toBe("ok");
  });

  it("keeps metadata for the question tool, whose renderer reads it", () => {
    const projected = projectPartForList(
      toolPart({ status: "completed", metadata: { questions: [1] } }, "question"),
    );

    expect((projected["state"] as Record<string, unknown>)["metadata"]).toEqual({ questions: [1] });
  });

  it("truncates long output and records the original length", () => {
    const output = "y".repeat(TOOL_TEXT_PREVIEW_LIMIT + 500);
    const state = projectPartForList(toolPart({ status: "completed", output }))["state"] as Record<
      string,
      unknown
    >;

    expect((state["output"] as string).length).toBe(TOOL_TEXT_PREVIEW_LIMIT);
    expect(state["outputTruncated"]).toBe(true);
    expect(state["outputLength"]).toBe(TOOL_TEXT_PREVIEW_LIMIT + 500);
  });

  it("truncates long errors the same way", () => {
    const state = projectPartForList(
      toolPart({ status: "error", error: "e".repeat(TOOL_TEXT_PREVIEW_LIMIT + 1) }),
    )["state"] as Record<string, unknown>;

    expect(state["errorTruncated"]).toBe(true);
    expect((state["error"] as string).length).toBe(TOOL_TEXT_PREVIEW_LIMIT);
  });

  it("leaves short output untouched and unflagged", () => {
    const state = projectPartForList(toolPart({ status: "completed", output: "short" }))[
      "state"
    ] as Record<string, unknown>;

    expect(state["output"]).toBe("short");
    expect(state["outputTruncated"]).toBeUndefined();
  });

  it("keeps every field a renderer reads", () => {
    const state = projectPartForList(
      toolPart({
        status: "completed",
        title: "read",
        input: { path: "a.ts" },
        output: "ok",
        time: { start: 1, end: 2 },
        attachments: [{ mime: "image/png" }],
      }),
    )["state"] as Record<string, unknown>;

    expect(Object.keys(state).sort()).toEqual(
      ["attachments", "input", "output", "status", "time", "title"].sort(),
    );
  });

  it("drops reasoning bodies, which are never rendered", () => {
    const projected = projectPartForList({
      id: "r1",
      type: "reasoning",
      text: "z".repeat(10_000),
    } as ConversationPart);

    expect(projected["text"]).toBeUndefined();
    expect(projected["textTruncated"]).toBe(true);
    expect(projected.type).toBe("reasoning");
  });

  it("passes through the parts the timeline needs whole", () => {
    const text = { id: "t1", type: "text", text: "hello" } as ConversationPart;
    const step = {
      id: "s1",
      type: "step-finish",
      reason: "stop",
      cost: 0.01,
      tokens: { total: 10, input: 8, output: 2 },
    } as ConversationPart;

    expect(projectPartsForList([text, step])).toEqual([text, step]);
  });

  it("leaves a tool part with no state alone", () => {
    const part = { id: "p", type: "tool", tool: "read" } as ConversationPart;
    expect(projectPartForList(part)).toBe(part);
  });
});
