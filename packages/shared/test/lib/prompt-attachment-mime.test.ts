import { describe, expect, it } from "vitest";

import { resolvePromptAttachmentMimeType } from "../../src/lib/prompt-attachment-mime";

describe("resolvePromptAttachmentMimeType", () => {
  it("normalizes Markdown attachments to text/plain", () => {
    expect(resolvePromptAttachmentMimeType("notes.md", "text/markdown")).toBe("text/plain");
  });

  it("normalizes JSON attachments to text/plain", () => {
    expect(resolvePromptAttachmentMimeType("data.json", "application/json")).toBe("text/plain");
  });

  it("normalizes CSV attachments to text/plain", () => {
    expect(resolvePromptAttachmentMimeType("data.csv", "text/csv")).toBe("text/plain");
  });

  it("infers text/plain for known source files without a MIME type", () => {
    expect(resolvePromptAttachmentMimeType("index.ts", "")).toBe("text/plain");
  });

  it("preserves a provided MIME type for non-text attachments", () => {
    expect(resolvePromptAttachmentMimeType("report.pdf", "application/pdf")).toBe(
      "application/pdf",
    );
  });

  it("infers known media MIME types when no MIME type is provided", () => {
    expect(resolvePromptAttachmentMimeType("photo.png", "")).toBe("image/png");
  });

  it("falls back to application/octet-stream for an unknown extension", () => {
    expect(resolvePromptAttachmentMimeType("archive.bin", "")).toBe("application/octet-stream");
  });

  it("falls back to application/octet-stream when the filename is missing", () => {
    expect(resolvePromptAttachmentMimeType(undefined, "")).toBe("application/octet-stream");
  });
});
