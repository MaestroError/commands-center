import { describe, expect, it } from "vitest";

import {
  buildMentionPrefix,
  buildMentionToken,
  isGlobalDocumentMention,
  isMentionableWorkspacePath,
  parseMentionPath,
} from "./file-mention";

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

  it("emits a #GlobalDocuments token for global documents", () => {
    expect(buildMentionToken({ path: "design/overview.md", kind: "global-document" })).toBe(
      "#GlobalDocuments/design/overview.md",
    );
  });
});

describe("buildMentionPrefix", () => {
  it("space-joins mixed mention tokens", () => {
    expect(
      buildMentionPrefix([
        { path: "src/app.ts", kind: "file" },
        { path: "design/overview.md", kind: "global-document" },
      ]),
    ).toBe("#src/app.ts #GlobalDocuments/design/overview.md");
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
  it("reconstructs a global-document mention from a GlobalDocuments token path", () => {
    expect(parseMentionPath("GlobalDocuments/design/overview.md")).toEqual({
      path: "design/overview.md",
      filename: "overview.md",
      kind: "global-document",
    });
  });

  it("prefers an explicit display label when provided", () => {
    expect(parseMentionPath("GlobalDocuments/design/overview.md", "Overview")).toEqual({
      path: "design/overview.md",
      filename: "Overview",
      kind: "global-document",
    });
  });

  it("treats other paths as workspace files, preserving folder paths", () => {
    expect(parseMentionPath("src/app.ts")).toEqual({
      path: "src/app.ts",
      filename: "app.ts",
      kind: "file",
    });
    expect(parseMentionPath("tools/")).toEqual({
      path: "tools/",
      filename: "tools/",
      kind: "file",
    });
  });

  it("round-trips a global document through build then parse", () => {
    const token = buildMentionToken({ path: "a/b/c.md", kind: "global-document" });
    // Strip the leading '#' the way the prompt parser does before re-hydrating.
    expect(parseMentionPath(token.slice(1))).toEqual({
      path: "a/b/c.md",
      filename: "c.md",
      kind: "global-document",
    });
  });
});
