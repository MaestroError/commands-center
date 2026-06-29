import { describe, expect, it } from "vitest";

import { buildDocumentHref } from "./document-href";

describe("buildDocumentHref", () => {
  it("builds a documents href from a Documents-relative path", () => {
    expect(buildDocumentHref("design/overview.md")).toBe("/documents?path=design%2Foverview.md");
  });

  it("strips a leading Documents/ prefix", () => {
    expect(buildDocumentHref("Documents/design/overview.md")).toBe(
      "/documents?path=design%2Foverview.md",
    );
  });

  it("strips leading slashes", () => {
    expect(buildDocumentHref("/notes.md")).toBe("/documents?path=notes.md");
  });

  it("encodes special characters in the path", () => {
    expect(buildDocumentHref("my notes & ideas.md")).toBe(
      "/documents?path=my%20notes%20%26%20ideas.md",
    );
  });
});
