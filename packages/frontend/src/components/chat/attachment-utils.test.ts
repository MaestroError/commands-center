import { describe, expect, it } from "vitest";

import { getMessageAttachments, resolveAttachmentMimeType } from "./attachment-utils";

import type { ConversationPart } from "@cc/shared/schemas";

describe("attachment-utils", () => {
  it("falls back to streamed file parts when message attachments are empty", () => {
    const parts: ConversationPart[] = [
      {
        id: "file-1",
        type: "file",
        mime: "application/pdf",
        filename: "spec.pdf",
      },
    ];

    expect(getMessageAttachments([], parts)).toEqual([
      {
        id: "file-1",
        type: "document",
        filename: "spec.pdf",
        mimeType: "application/pdf",
      },
    ]);
  });

  it("prefers hydrated message attachments when they already exist", () => {
    expect(
      getMessageAttachments(
        [
          {
            id: "att-1",
            type: "document",
            filename: "notes.txt",
            mimeType: "text/plain",
          },
        ],
        [],
      ),
    ).toEqual([
      {
        id: "att-1",
        type: "document",
        filename: "notes.txt",
        mimeType: "text/plain",
      },
    ]);
  });

  it("infers text/plain for source files when the browser omits the mime type", () => {
    const file = new File(["const x = 1;"], "index.ts", { type: "" });

    expect(resolveAttachmentMimeType(file)).toBe("text/plain");
  });

  it("preserves browser-provided mime types when present", () => {
    const file = new File(["hello"], "notes.md", { type: "text/markdown" });

    expect(resolveAttachmentMimeType(file)).toBe("text/markdown");
  });
});
