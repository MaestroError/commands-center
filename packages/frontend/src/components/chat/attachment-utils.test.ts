import { describe, expect, it } from "vitest";

import { getMessageAttachments } from "./attachment-utils";

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
});
