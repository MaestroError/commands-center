import { describe, expect, it } from "vitest";

import {
  isDocumentPathWithinFolder,
  isGlobalDocumentPathAuthorized,
  normalizeGlobalDocumentFolderPaths,
} from "../../src/services/document-access-policy";

describe("document access policy", () => {
  it("matches a document inside a granted folder", () => {
    expect(isDocumentPathWithinFolder("sales/reports/q1.md", "sales")).toBe(true);
  });

  it("does not match a similarly prefixed sibling folder", () => {
    expect(isDocumentPathWithinFolder("sales-private/q1.md", "sales")).toBe(false);
  });

  it("sorts and deduplicates folder grants", () => {
    expect(normalizeGlobalDocumentFolderPaths(["zeta", "alpha", "zeta"])).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("removes grants inherited from an ancestor", () => {
    expect(
      normalizeGlobalDocumentFolderPaths(["clients/acme/contracts", "clients/acme", "public"]),
    ).toEqual(["clients/acme", "public"]);
  });

  it("authorizes every global path when full access is enabled", () => {
    expect(
      isGlobalDocumentPathAuthorized(
        { global: true, globalFolderPaths: [], privateSpecialistIds: [] },
        "private/plan.md",
      ),
    ).toBe(true);
  });

  it("authorizes paths only inside configured global folders", () => {
    expect(
      isGlobalDocumentPathAuthorized(
        { global: false, globalFolderPaths: ["public"], privateSpecialistIds: [] },
        "public/plan.md",
      ),
    ).toBe(true);
  });

  it("denies paths outside configured global folders", () => {
    expect(
      isGlobalDocumentPathAuthorized(
        { global: false, globalFolderPaths: ["public"], privateSpecialistIds: [] },
        "private/plan.md",
      ),
    ).toBe(false);
  });
});
