import { describe, expect, it } from "vitest";

import {
  buildMentionPrefix,
  buildMentionToken,
  isGlobalDocumentMention,
  isMentionableWorkspacePath,
  parseMentionPath,
} from "./file-mention";

const GLOBAL_DOC_FULL_PATH = "/workspace/Documents/design/overview.md";

describe("isMentionableWorkspacePath", () => {
  it("rejects any path segment named node_modules", () => {
    expect(isMentionableWorkspacePath("src/index.ts")).toBe(true);
    expect(isMentionableWorkspacePath("node_modules/pkg/index.js")).toBe(false);
    expect(isMentionableWorkspacePath("src/node_modules/x.js")).toBe(false);
  });
});

describe("buildMentionToken", () => {
  it("emits a plain #path for workspace files", () => {
    expect(buildMentionToken({ path: "src/app.ts", kind: "file" })).toBe("#src/app.ts");
    expect(buildMentionToken({ path: "tools/" })).toBe("#tools/");
  });

  it("emits a plain #path for workspace-local documents", () => {
    expect(buildMentionToken({ path: "Documents/notes.md", kind: "document" })).toBe(
      "#Documents/notes.md",
    );
  });

  it("emits the absolute fullPath token for global documents", () => {
    expect(
      buildMentionToken({
        path: "design/overview.md",
        kind: "global-document",
        fullPath: GLOBAL_DOC_FULL_PATH,
      }),
    ).toBe(`#${GLOBAL_DOC_FULL_PATH}`);
  });

  it("falls back to the relative path when a global document has no fullPath", () => {
    expect(buildMentionToken({ path: "design/overview.md", kind: "global-document" })).toBe(
      "#design/overview.md",
    );
  });
});

describe("buildMentionPrefix", () => {
  it("space-joins mixed mention tokens", () => {
    expect(
      buildMentionPrefix([
        { path: "src/app.ts", kind: "file" },
        { path: "design/overview.md", kind: "global-document", fullPath: GLOBAL_DOC_FULL_PATH },
      ]),
    ).toBe(`#src/app.ts #${GLOBAL_DOC_FULL_PATH}`);
  });
});

describe("isGlobalDocumentMention", () => {
  it("is true only for the global-document kind", () => {
    expect(isGlobalDocumentMention({ kind: "global-document" })).toBe(true);
    expect(isGlobalDocumentMention({ kind: "file" })).toBe(false);
    expect(isGlobalDocumentMention({})).toBe(false);
  });
});

describe("parseMentionPath", () => {
  it("reconstructs a workspace file mention, preferring an explicit display label", () => {
    expect(parseMentionPath("src/app.ts")).toEqual({
      path: "src/app.ts",
      filename: "app.ts",
      kind: "file",
    });
    expect(parseMentionPath("src/app.ts", "app.ts")).toEqual({
      path: "src/app.ts",
      filename: "app.ts",
      kind: "file",
    });
  });

  it("preserves folder paths as their own filename", () => {
    expect(parseMentionPath("tools/")).toEqual({
      path: "tools/",
      filename: "tools/",
      kind: "file",
    });
  });

  it("re-hydrates an absolute global-document token as a readable file mention", () => {
    // Global documents are sent as absolute-path references, so on re-parse they
    // resolve as plain files that still point at the right document.
    const token = buildMentionToken({
      path: "design/overview.md",
      kind: "global-document",
      fullPath: GLOBAL_DOC_FULL_PATH,
    });
    expect(parseMentionPath(token.slice(1))).toEqual({
      path: GLOBAL_DOC_FULL_PATH,
      filename: "overview.md",
      kind: "file",
    });
  });
});
