import { describe, expect, it } from "vitest";

import {
  cleanTitle,
  extractAttachments,
  extractMediaItems,
  isRecord,
  mapRemoteMessage,
  readContent,
  readModelError,
  sanitizeMessageError,
  sanitizePart,
  sanitizeToolState,
} from "../../src/lib/message-mapper";
import type { OpenCodeSessionMessage } from "../../src/services/opencode-service";

const DATA_URL = "data:image/png;base64,AAAA";

function message(overrides: Partial<OpenCodeSessionMessage> = {}): OpenCodeSessionMessage {
  return {
    info: {
      id: "m1",
      sessionID: "s1",
      role: "assistant",
      time: { created: 1000, completed: 2000 },
      ...(overrides.info ?? {}),
    },
    parts: overrides.parts ?? [{ id: "p1", type: "text", text: "hello" }],
  } as OpenCodeSessionMessage;
}

describe("message-mapper", () => {
  it("maps a remote message with text, file, and tool parts", () => {
    const mapped = mapRemoteMessage("conv-1", {
      info: { id: "m1", sessionID: "s1", role: "assistant", time: { created: 1000 } },
      parts: [
        { id: "p1", type: "text", text: "  first  " },
        { id: "p2", type: "text", text: "second" },
        { id: "p3", type: "file", mime: "image/png", filename: "a.png", source: { path: "a" } },
      ],
    } as OpenCodeSessionMessage);

    expect(mapped.content).toBe("first\n\nsecond");
    expect(mapped.attachments).toHaveLength(1);
    expect(mapped.createdAtMs).toBe(1000);
    // No completed time falls back to createdAt.
    expect(mapped.updatedAtMs).toBe(1000);
  });

  it("reads only non-empty text parts", () => {
    expect(
      readContent([
        { id: "a", type: "text", text: "  x  " },
        { id: "b", type: "text", text: "   " },
        { id: "c", type: "image" },
      ] as never),
    ).toBe("x");
  });

  it("sanitizes file, tool, and passthrough parts", () => {
    expect(sanitizePart({ id: "f", type: "file", mime: 123 } as never)).toMatchObject({
      mime: "application/octet-stream",
      filename: undefined,
    });
    expect(
      sanitizePart({ id: "f2", type: "file", mime: "text/plain", filename: "n.txt" } as never),
    ).toMatchObject({ mime: "text/plain", filename: "n.txt" });

    const tool = sanitizePart({
      id: "t",
      type: "tool",
      state: { attachments: [{ mime: "image/png", id: "x" }] },
    } as never) as unknown as { state: { attachments: unknown[] } };
    expect(tool.state.attachments).toHaveLength(1);

    // A tool part without a record state is passed through untouched.
    expect(sanitizePart({ id: "t2", type: "tool", state: "nope" } as never)).toMatchObject({
      id: "t2",
    });
  });

  it("sanitizes tool state attachments, dropping invalid entries", () => {
    expect(sanitizeToolState({ note: "no attachments" })).toEqual({ note: "no attachments" });
    const result = sanitizeToolState({
      attachments: [
        { mime: "image/png", id: "keep", filename: "k.png", source: { path: "p" } },
        { id: "drop-no-mime" },
        "not-a-record",
      ],
    });
    expect((result as { attachments: unknown[] }).attachments).toHaveLength(1);
  });

  it("extracts and de-duplicates attachments across parts", () => {
    const attachments = extractAttachments([
      { id: "same", type: "file", mime: "image/png" },
      { id: "same", type: "file", mime: "image/png" },
      { type: "file", mime: "text/plain", filename: "b.txt" },
    ] as never);
    // De-duped by id, plus one keyed by mime:filename.
    expect(attachments).toHaveLength(2);
  });

  it("extracts media items only for data URLs, newest first", () => {
    const items = extractMediaItems([
      {
        info: { id: "m1", sessionID: "s", role: "assistant", time: { created: 1000 } },
        parts: [
          { id: "f1", type: "file", mime: "image/png", url: DATA_URL },
          { id: "f2", type: "file", mime: "image/png", url: "https://x/y.png" },
        ],
      },
      {
        info: { id: "m2", sessionID: "s", role: "assistant", time: { created: 5000 } },
        parts: [
          {
            id: "t",
            type: "tool",
            state: { attachments: [{ mime: "image/png", url: DATA_URL }] },
          },
        ],
      },
    ] as never);

    expect(items).toHaveLength(2);
    // Sorted by createdAt descending — the later message comes first.
    expect(items[0]?.messageId).toBe("m2");
  });

  it("cleans titles", () => {
    expect(cleanTitle("  hi  ")).toBe("hi");
    expect(cleanTitle("   ")).toBeUndefined();
    expect(cleanTitle(undefined)).toBeUndefined();
    expect(cleanTitle(null)).toBeUndefined();
  });

  it("sanitizes message errors from name/message and data fallbacks", () => {
    expect(sanitizeMessageError(null)).toBeUndefined();
    expect(sanitizeMessageError({ message: "no name" })).toBeUndefined();
    expect(sanitizeMessageError({ name: "E", data: { note: 1 } })).toBeUndefined();
    expect(
      sanitizeMessageError({ name: "APIError", message: "boom", data: { retry: true } }),
    ).toEqual({ name: "APIError", message: "boom", data: { retry: true } });
    // Message falls back to data.message.
    expect(sanitizeMessageError({ name: "E", data: { message: "from data" } })).toMatchObject({
      message: "from data",
    });
    // readModelError delegates to the same logic.
    expect(
      readModelError(message({ info: { ...message().info, error: { name: "E", message: "m" } } })),
    ).toMatchObject({ name: "E" });
  });

  it("classifies records and attachment types", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);

    // inferAttachmentType is exercised through readPartAttachments.
    const typed = extractAttachments([
      { id: "img", type: "file", mime: "image/png" },
      { id: "pdf", type: "file", mime: "application/pdf" },
      { id: "txt", type: "file", mime: "text/markdown" },
      { id: "bin", type: "file", mime: "application/zip" },
      { id: "nomime", type: "file" },
    ] as never);
    const types = typed.map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(["image", "document", "file"]));
  });
});
