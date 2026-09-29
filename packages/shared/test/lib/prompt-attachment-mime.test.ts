import { describe, expect, it } from "vitest";

import {
  isNativePromptAttachmentMimeType,
  isTextualPayload,
  resolvePromptAttachmentMimeType,
} from "../../src/lib/prompt-attachment-mime";

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

  it("normalizes text-like extensions that are outside any allowlist", () => {
    expect(resolvePromptAttachmentMimeType("guide.mdx", "text/mdx")).toBe("text/plain");
    expect(resolvePromptAttachmentMimeType("server.log", "")).toBe("text/plain");
    expect(resolvePromptAttachmentMimeType("readme.rst", "text/x-rst")).toBe("text/plain");
  });

  it("normalizes media types no provider accepts as a file part", () => {
    expect(
      resolvePromptAttachmentMimeType(
        "report.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("text/plain");
    expect(resolvePromptAttachmentMimeType("photo.heic", "image/heic")).toBe("text/plain");
    expect(resolvePromptAttachmentMimeType("icon.svg", "image/svg+xml")).toBe("text/plain");
  });

  it("preserves the media types every provider accepts", () => {
    expect(resolvePromptAttachmentMimeType("report.pdf", "application/pdf")).toBe(
      "application/pdf",
    );
    expect(resolvePromptAttachmentMimeType("photo.png", "")).toBe("image/png");
    expect(resolvePromptAttachmentMimeType("photo.jpg", "text/plain")).toBe("image/jpeg");
    expect(resolvePromptAttachmentMimeType(undefined, "image/webp")).toBe("image/webp");
  });

  it("passes audio and video through so provider support is not silently lost", () => {
    expect(resolvePromptAttachmentMimeType("call.mp3", "audio/mpeg")).toBe("audio/mpeg");
    expect(resolvePromptAttachmentMimeType("clip.mp4", "video/mp4")).toBe("video/mp4");
  });

  it("ignores media type parameters and casing", () => {
    expect(resolvePromptAttachmentMimeType("scan", "Application/PDF; version=1.7")).toBe(
      "application/pdf",
    );
  });

  it("falls back to text/plain for an unknown extension", () => {
    expect(resolvePromptAttachmentMimeType("archive.bin", "")).toBe("text/plain");
  });

  it("falls back to text/plain when the filename is missing", () => {
    expect(resolvePromptAttachmentMimeType(undefined, "")).toBe("text/plain");
  });
});

describe("isNativePromptAttachmentMimeType", () => {
  it("accepts only the media types every bundled provider supports", () => {
    expect(isNativePromptAttachmentMimeType("application/pdf")).toBe(true);
    expect(isNativePromptAttachmentMimeType("image/png")).toBe(true);
    expect(isNativePromptAttachmentMimeType("text/markdown")).toBe(false);
    expect(isNativePromptAttachmentMimeType("image/svg+xml")).toBe(false);
  });
});

describe("isTextualPayload", () => {
  it("accepts ASCII text", () => {
    expect(isTextualPayload(ascii("# Notes\nline two\t| tabbed"))).toBe(true);
  });

  it("accepts multi-byte UTF-8", () => {
    // "é" (2 bytes), "€" (3 bytes), "🎉" (4 bytes).
    expect(
      isTextualPayload(
        new Uint8Array([0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x8e, 0x89, 0x0a]),
      ),
    ).toBe(true);
  });

  it("accepts an empty payload", () => {
    expect(isTextualPayload(new Uint8Array())).toBe(true);
  });

  it("rejects payloads containing NUL", () => {
    expect(isTextualPayload(new Uint8Array([0x68, 0x00, 0x69]))).toBe(false);
  });

  it("rejects binary that is not valid UTF-8", () => {
    // PNG magic bytes: no NUL in the header, but invalid as UTF-8.
    expect(isTextualPayload(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]))).toBe(false);
  });

  it("rejects truncated multi-byte sequences", () => {
    expect(isTextualPayload(new Uint8Array([0x68, 0xf0, 0x9f]))).toBe(false);
  });

  it("rejects overlong encodings and surrogates", () => {
    // Overlong "/" and a CESU-8 style surrogate half.
    expect(isTextualPayload(new Uint8Array([0xe0, 0x80, 0xaf]))).toBe(false);
    expect(isTextualPayload(new Uint8Array([0xed, 0xa0, 0x80]))).toBe(false);
  });
});

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}
