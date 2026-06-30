import { describe, expect, it } from "vitest";

import {
  MAX_EMBEDDED_IMAGE_BYTES,
  createBase64UploadHandler,
  readFileAsDataUrl,
} from "./image-upload";

function makeFile(content: string, type = "image/png"): File {
  return new File([content], "image.png", { type });
}

describe("readFileAsDataUrl", () => {
  it("reads a file into a base64 data URI", async () => {
    const result = await readFileAsDataUrl(makeFile("hello"));
    expect(result.startsWith("data:image/png;base64,")).toBe(true);
    // "hello" base64-encoded.
    expect(result).toContain(btoa("hello"));
  });
});

describe("createBase64UploadHandler", () => {
  it("returns a data URI for an in-limit image", async () => {
    const handler = createBase64UploadHandler();
    const url = await handler(makeFile("small"));
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("rejects images larger than the limit with a friendly message", async () => {
    const handler = createBase64UploadHandler(4);
    await expect(handler(makeFile("too many bytes"))).rejects.toThrow(/too large to embed/i);
  });

  it("uses a 2 MB default limit", () => {
    expect(MAX_EMBEDDED_IMAGE_BYTES).toBe(2 * 1024 * 1024);
  });
});
