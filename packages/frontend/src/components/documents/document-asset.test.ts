import { describe, expect, it } from "vitest";

import {
  buildWorkspaceInsertMarkdown,
  isImagePath,
  resolveDocumentAssetUrl,
} from "./document-asset";

describe("resolveDocumentAssetUrl", () => {
  it("passes through http(s) URLs unchanged", () => {
    expect(resolveDocumentAssetUrl("https://example.com/x.png")).toBe("https://example.com/x.png");
    expect(resolveDocumentAssetUrl("http://example.com/x.png")).toBe("http://example.com/x.png");
  });

  it("passes through data and blob URLs unchanged", () => {
    expect(resolveDocumentAssetUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(resolveDocumentAssetUrl("blob:http://localhost/abc")).toBe("blob:http://localhost/abc");
  });

  it("routes a workspace: reference to the asset endpoint", () => {
    expect(resolveDocumentAssetUrl("workspace:tools/researcher/diagram.png")).toBe(
      "/api/documents/asset?path=tools%2Fresearcher%2Fdiagram.png",
    );
  });

  it("treats a bare relative path as a workspace reference", () => {
    expect(resolveDocumentAssetUrl("Documents/ProjectInfo/img.png")).toBe(
      "/api/documents/asset?path=Documents%2FProjectInfo%2Fimg.png",
    );
  });

  it("strips leading slashes", () => {
    expect(resolveDocumentAssetUrl("/Documents/img.png")).toBe(
      "/api/documents/asset?path=Documents%2Fimg.png",
    );
  });
});

describe("isImagePath", () => {
  it("recognizes common image extensions", () => {
    expect(isImagePath("a/b/diagram.png")).toBe(true);
    expect(isImagePath("photo.JPEG")).toBe(true);
    expect(isImagePath("icon.svg")).toBe(true);
  });

  it("returns false for non-images and extensionless paths", () => {
    expect(isImagePath("report.pdf")).toBe(false);
    expect(isImagePath("notes.md")).toBe(false);
    expect(isImagePath("Makefile")).toBe(false);
  });
});

describe("buildWorkspaceInsertMarkdown", () => {
  it("embeds images as a portable workspace reference", () => {
    expect(buildWorkspaceInsertMarkdown("tools/researcher/diagram.png", "/files?ignored=1")).toBe(
      "![diagram.png](workspace:tools/researcher/diagram.png)",
    );
  });

  it("links non-image files to the File Manager href with the path as label", () => {
    expect(buildWorkspaceInsertMarkdown("tools/researcher/report.pdf", "/files?x=1")).toBe(
      "[tools/researcher/report.pdf](/files?x=1)",
    );
  });
});
