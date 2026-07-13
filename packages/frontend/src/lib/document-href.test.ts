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

  it("adds scope and owner for a private document", () => {
    expect(
      buildDocumentHref("Reports/2026-07-13/report.md", {
        scope: "private",
        ownerSlug: "tonny-reporter",
      }),
    ).toBe("/documents?scope=private&owner=tonny-reporter&path=Reports%2F2026-07-13%2Freport.md");
  });

  it("ignores private scope without an owner slug", () => {
    expect(buildDocumentHref("design/overview.md", { scope: "private", ownerSlug: null })).toBe(
      "/documents?path=design%2Foverview.md",
    );
  });

  it("omits scope params for an explicit global document", () => {
    expect(buildDocumentHref("design/overview.md", { scope: "global", ownerSlug: null })).toBe(
      "/documents?path=design%2Foverview.md",
    );
  });
});
