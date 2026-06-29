import { describe, expect, it } from "vitest";

import { resolveDocumentAssetUrl } from "./document-asset";

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
