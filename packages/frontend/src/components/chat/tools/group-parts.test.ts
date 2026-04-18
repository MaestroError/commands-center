import { describe, it, expect } from "vitest";
import type { ConversationPart } from "@cc/shared/schemas";
import { groupParts } from "./group-parts";

function toolPart(id: string, toolName: string): ConversationPart {
  return { id, type: "tool", tool: toolName } as ConversationPart;
}

function textPart(id: string): ConversationPart {
  return { id, type: "text" } as ConversationPart;
}

describe("groupParts", () => {
  it("returns empty array for empty input", () => {
    expect(groupParts([])).toEqual([]);
  });

  it("groups consecutive context tools into a single context entry", () => {
    const parts = [toolPart("1", "read"), toolPart("2", "glob"), toolPart("3", "grep")];
    const result = groupParts(parts);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("context");
    expect((result[0] as { type: "context"; parts: ConversationPart[] }).parts).toHaveLength(3);
  });

  it("keeps non-context tools as singles", () => {
    const parts = [toolPart("1", "bash"), toolPart("2", "write")];
    const result = groupParts(parts);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe("single");
    expect(result[1]!.type).toBe("single");
  });

  it("flushes context group when non-context tool appears", () => {
    const parts = [
      toolPart("1", "read"),
      toolPart("2", "glob"),
      toolPart("3", "bash"),
      toolPart("4", "read"),
    ];
    const result = groupParts(parts);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe("context");
    expect((result[0] as { type: "context"; parts: ConversationPart[] }).parts).toHaveLength(2);
    expect(result[1]!.type).toBe("single");
    expect(result[2]!.type).toBe("context");
    expect((result[2] as { type: "context"; parts: ConversationPart[] }).parts).toHaveLength(1);
  });

  it("flushes context group when non-tool part appears", () => {
    const parts = [toolPart("1", "read"), textPart("2"), toolPart("3", "glob")];
    const result = groupParts(parts);
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe("context");
    expect(result[1]!.type).toBe("single");
    expect(result[2]!.type).toBe("context");
  });

  it("filters out hidden tools (todowrite)", () => {
    const parts = [toolPart("1", "todowrite"), toolPart("2", "bash")];
    const result = groupParts(parts);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("single");
    expect((result[0] as { type: "single"; part: ConversationPart }).part.id).toBe("2");
  });

  it("handles list tool as context group tool", () => {
    const parts = [toolPart("1", "list"), toolPart("2", "read")];
    const result = groupParts(parts);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("context");
  });

  it("handles mixed sequence correctly", () => {
    const parts = [
      textPart("1"),
      toolPart("2", "read"),
      toolPart("3", "grep"),
      toolPart("4", "bash"),
      toolPart("5", "todowrite"),
      toolPart("6", "read"),
      textPart("7"),
    ];
    const result = groupParts(parts);
    // text(1), context(read+grep), single(bash), context(read), text(7)
    expect(result).toHaveLength(5);
    expect(result.map((e) => e.type)).toEqual(["single", "context", "single", "context", "single"]);
  });
});
