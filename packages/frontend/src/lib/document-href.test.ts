import { describe, expect, it } from "vitest";

import {
  buildDocumentFileManagerHref,
  buildDocumentFolderHref,
  buildDocumentHref,
} from "./document-href";

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

  it("normalizes Windows-style backslashes in the path", () => {
    expect(buildDocumentHref("Reports\\2026-07-13\\report.md")).toBe(
      "/documents?path=Reports%2F2026-07-13%2Freport.md",
    );
  });

  it("normalizes backslashes for a private document href", () => {
    expect(
      buildDocumentHref("Reports\\report.md", { scope: "private", ownerSlug: "tonny-reporter" }),
    ).toBe("/documents?scope=private&owner=tonny-reporter&path=Reports%2Freport.md");
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

describe("buildDocumentFolderHref", () => {
  it("builds a global folder href", () => {
    expect(buildDocumentFolderHref("design/sub")).toBe("/documents?folder=design%2Fsub");
  });

  it("targets the scope root for an empty path", () => {
    expect(buildDocumentFolderHref("")).toBe("/documents?folder=");
  });

  it("adds scope and owner for a private folder", () => {
    expect(
      buildDocumentFolderHref("Reports", { scope: "private", ownerSlug: "tonny-reporter" }),
    ).toBe("/documents?scope=private&owner=tonny-reporter&folder=Reports");
  });
});

describe("buildDocumentFileManagerHref", () => {
  it("reveals a global file by selecting it in its parent folder", () => {
    expect(
      buildDocumentFileManagerHref({
        scope: "global",
        ownerSlug: null,
        relativePath: "design/diagram.png",
        type: "file",
      }),
    ).toBe("/files?root=workspace&path=Documents%2Fdesign&select=Documents%2Fdesign%2Fdiagram.png");
  });

  it("reveals a root-level file with the Documents root as the folder", () => {
    expect(
      buildDocumentFileManagerHref({
        scope: "global",
        ownerSlug: null,
        relativePath: "readme.md",
        type: "file",
      }),
    ).toBe("/files?root=workspace&path=Documents&select=Documents%2Freadme.md");
  });

  it("opens a directory without a selection", () => {
    expect(
      buildDocumentFileManagerHref({
        scope: "global",
        ownerSlug: null,
        relativePath: "design/sub",
        type: "directory",
      }),
    ).toBe("/files?root=workspace&path=Documents%2Fdesign%2Fsub");
  });

  it("resolves a private entry under the specialist Documents root", () => {
    expect(
      buildDocumentFileManagerHref({
        scope: "private",
        ownerSlug: "planner",
        relativePath: "notes/todo.md",
        type: "file",
      }),
    ).toBe(
      "/files?root=workspace&path=specialists%2Fplanner%2FDocuments%2Fnotes&select=specialists%2Fplanner%2FDocuments%2Fnotes%2Ftodo.md",
    );
  });
});
